// 杀手群处置规则（KILLER_MODE_GROUPS）· 离线验证
//
// 【2026-10-23 重构】旧版是每群一个 /killer ON/OFF 开关，自动检测与人工命令永远同一种处置。
// 杀手功能本就为杀手权限持有者定制，他的口径是：
//   · 自动检测命中广告（reason=ad_auto）→ 永久禁言，人留群
//   · 其余一切处置（/ban /spam /sban、人工批量、发言拦截、复入群）→ 踢出
//   · 同款直封 / 同款连带 / /ad 投票 —— 杀手群完全隔离：杀手群里不触发，
//     GROUP_ID 群触发时封禁范围也不含杀手群
// /killer 开关、killer_mode 表、禁言模式集合一并删除。
// 本文件按上面这张表逐行断言；GROUP_ID 群的行为由 test_kick 等既有用例守住不变。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const calls = [];          // { method, body }
const sent = [];           // sendMessage 专用
let memberStatus = () => 'member';

const sandbox = {
	console: { log() {}, warn() {}, error() {}, info() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		calls.push({ method: m, body: b });
		let payload = { ok: true, result: true };
		if (m === 'sendMessage') { sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || '') }); payload = { ok: true, result: { message_id: 9000 + sent.length } }; }
		else if (m === 'getChatAdministrators') payload = { ok: true, result: [{ user: { id: 42, is_bot: true }, status: 'administrator', can_restrict_members: true, can_delete_messages: true }] };
		else if (m === 'getChat') payload = { ok: true, result: { id: b?.chat_id, title: '群', type: 'supergroup' } };
		else if (m === 'getChatMember') payload = { ok: true, result: { status: memberStatus(String(b?.chat_id), String(b?.user_id)), user: { id: b?.user_id } } };
		else if (m === 'getMe') payload = { ok: true, result: { id: 42, username: 'testbot', is_bot: true } };
		return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.replace(/export\s+default\s*/, 'globalThis.__h = '), sandbox, { filename: '_worker.js' });
const W = sandbox;
const handler = W.__h;

function makeD1() {
	const db = new DatabaseSync(':memory:');
	const nIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const nOut = (r) => { if (!r) return null; const o = {}; for (const k of Object.keys(r)) o[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k]; return o; };
	const exec = (sql, params) => {
		const st = db.prepare(sql); const bd = params.map(nIn);
		const up = sql.trim().slice(0, 6).toUpperCase();
		// INSERT … RETURNING 也要按行返回：同款名单命中标记就靠它带回来（cacheModerationMessage）。
		if (up === 'SELECT' || /\bRETURNING\b/i.test(sql) || sql.trim().toUpperCase().startsWith('PRAGMA')) return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		const i = st.run(...bd); return { kind: 'write', meta: { changes: Number(i?.changes || 0), last_row_id: Number(i?.lastInsertRowid || 0) } };
	};
	const mk = (sql) => { const s = { sql, params: [] }; const a = {
		bind(...x) { s.params = x; return a; },
		async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
		async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; },
		async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; }
	}; return a; };
	return { prepare: mk, async exec(sql) { for (const p of String(sql).split(';')) { const s = p.trim(); if (s) db.exec(s); } return { count: 1 }; },
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; }, query(sql, ...p) { return db.prepare(sql).all(...p).map(nOut); } };
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); } };
const log = (s) => process.stdout.write(s + '\n');
const callsOf = (m) => calls.filter((c) => c.method === m);
const reset = () => { calls.length = 0; sent.length = 0; memberStatus = () => 'member'; };
const mutedIn = (chat) => callsOf('restrictChatMember').some((c) => String(c.body?.chat_id) === chat && c.body?.permissions?.can_send_messages === false);
const unmutedIn = (chat) => callsOf('restrictChatMember').some((c) => String(c.body?.chat_id) === chat && c.body?.permissions?.can_send_messages === true);
const bannedIn = (chat) => callsOf('banChatMember').some((c) => String(c.body?.chat_id) === chat);
const touched = (chat) => calls.some((c) => ['banChatMember', 'restrictChatMember'].includes(c.method) && String(c.body?.chat_id) === chat);
const deletedIn = (chat) => callsOf('deleteMessage').some((c) => String(c.body?.chat_id) === chat);

const OWNER = '10001';
const K = '-100111';   // 杀手群：只在 KILLER_MODE_GROUPS
const G = '-100222';   // 普通群：GROUP_ID
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: G, OWNER_IDS: OWNER, KILLER_MODE_GROUPS: K, DB: makeD1() };
W.applyRuntimeConfig(W.loadRequiredConfig(env));
await W.ensureD1Table(env);
const ctx = { waitUntil() {} };
const post = (update) => handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, ctx);
const addBlack = (id, reason) => env.DB.prepare('INSERT OR REPLACE INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)')
	.bind(String(id), reason, reason === 'ad_auto' ? 'system' : OWNER, new Date().toISOString(), null).run();
const groupMsg = (chat, from, text, extra = {}) => ({ message_id: 100 + Math.floor(Math.random() * 1e6), date: Math.floor(Date.now() / 1000), chat: { id: Number(chat), type: 'supergroup', title: '群' }, from: { id: Number(from), is_bot: false, first_name: 'U' + from }, text, ...extra });
const memberUpdate = (chat, user, oldS, newS, actor = user) => ({ chat_member: { chat: { id: Number(chat), type: 'supergroup', title: '群' }, from: { id: Number(actor), is_bot: false, first_name: 'A' }, date: Math.floor(Date.now() / 1000), old_chat_member: { user: { id: Number(user), is_bot: false, first_name: 'T' }, status: oldS }, new_chat_member: { user: { id: Number(user), is_bot: false, first_name: 'T' }, status: newS } } });

log('\n=== 1. 配置：杀手群并入配置群，开关整体移除 ===');
check('KILLER_MODE_GROUPS 只认杀手群', W.isKillerModeGroup(K) && !W.isKillerModeGroup(G));
check('杀手群并入有效 GROUP_IDS', W.isConfiguredGroup(K));
check('/killer 开关已移除（handleKillerCommand 不存在）', typeof W.handleKillerCommand !== 'function');
check('禁言模式集合已移除（isGroupMuteMode 不存在）', typeof W.isGroupMuteMode !== 'function');
check('killer_mode 表读写函数已移除', typeof W.setKillerMode !== 'function' && typeof W.isKillerOn !== 'function' && typeof W.refreshMuteModeGroups !== 'function');

log('\n=== 2. 自动检测（缺省 mode）：杀手群永久禁言，普通群照旧踢 ===');
reset();
const r2 = await W.banUserFromAllGroups('55501', { probeMembership: false });
check('杀手群走 restrictChatMember 禁言', mutedIn(K));
check('杀手群未调 banChatMember', !bannedIn(K));
check('普通群照旧 banChatMember', bannedIn(G));
check('结果标记 muted 正确', r2.find((x) => x.groupId === K)?.muted === true && r2.find((x) => x.groupId === G)?.muted === false);
check('回执文案：杀手群写「已永久禁言」且不再提开关', /永久禁言/.test(W.formatBanSuccessResult(r2.find((x) => x.groupId === K))) && !/杀手模式关闭/.test(W.formatBanSuccessResult(r2.find((x) => x.groupId === K))));

log('\n=== 3. 人工命令（mode=human / kick）：杀手群一律踢出 ===');
reset();
await W.banUserFromAllGroups('55502', { probeMembership: false, mode: 'human' });
check('/ban /spam 口径：杀手群 banChatMember 踢出', bannedIn(K));
check('/ban /spam 口径：杀手群不禁言', !mutedIn(K));
check('/ban /spam 口径：普通群照旧禁言', mutedIn(G) && !bannedIn(G));
reset();
await W.banUserFromAllGroups('55503', { probeMembership: false, mode: 'kick' });
check('/sban 口径：杀手群与普通群都踢', bannedIn(K) && bannedIn(G));

log('\n=== 4. 发言拦截：按黑名单 reason 分流 ===');
reset();
await addBlack('66601', 'manual');
await post({ update_id: 1, message: groupMsg(K, '66601', '你好') });
check('手动封的人在杀手群发言 → 删消息', deletedIn(K));
check('手动封的人在杀手群发言 → 踢出', bannedIn(K));
reset();
await addBlack('66602', 'ad_auto');
await post({ update_id: 2, message: groupMsg(K, '66602', '你好') });
check('自动禁言的人在杀手群发言 → 删消息', deletedIn(K));
check('自动禁言的人在杀手群发言 → 重新禁言', mutedIn(K));
check('自动禁言的人在杀手群发言 → 不踢', !bannedIn(K));

log('\n=== 5. 复入群：手动封的踢回，自动禁言的不踢回 ===');
reset();
await post({ update_id: 3, ...memberUpdate(K, '66601', 'left', 'member') });
check('手动封的人复入杀手群 → 踢回', bannedIn(K));
reset();
await post({ update_id: 4, ...memberUpdate(K, '66602', 'left', 'member') });
check('自动禁言的人复入杀手群 → 不踢回', !bannedIn(K));
check('自动禁言的人复入杀手群 → 重新禁言', mutedIn(K));

log('\n=== 6. 群内原生手动解封：手动封的封回，自动禁言的不封回 ===');
reset();
await post({ update_id: 5, ...memberUpdate(K, '66601', 'kicked', 'left', '77777') });
check('手动封的人被原生解封 → 封回', bannedIn(K));
reset();
await post({ update_id: 6, ...memberUpdate(K, '66602', 'kicked', 'left', '77777') });
check('自动禁言的人被原生解封 → 不封回', !bannedIn(K));

log('\n=== 7. /unban：杀手群解封与解禁一起做 ===');
reset();
await W.unbanUserFromAllGroups('55504');
check('杀手群恢复发言', unmutedIn(K));
check('杀手群解除封禁', callsOf('unbanChatMember').some((c) => String(c.body?.chat_id) === K));

log('\n=== 8. /purge：按黑名单 reason 分流 ===');
{
	const envP = { ...env, DB: makeD1() };
	W.applyRuntimeConfig(W.loadRequiredConfig(envP));
	await W.ensureD1Table(envP);
	await envP.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)').bind('88801', 'ad_auto', 'system', '2026-05-01T00:00:00Z', null).run();
	await envP.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)').bind('88802', 'manual', OWNER, '2026-05-02T00:00:00Z', null).run();
	reset();
	// /purge 默认只扫人工封禁原因（PURGE_DEFAULT_REASONS 不含 ad_auto），这里显式扫全部才能覆盖两种分流。
	await handler.fetch(new Request('https://x.com/T/purge?reasons=all'), envP, ctx);
	const kOps = calls.filter((c) => String(c.body?.chat_id) === K);
	check('/purge：自动禁言的人在杀手群被禁言', kOps.some((c) => c.method === 'restrictChatMember' && String(c.body?.user_id) === '88801'));
	check('/purge：自动禁言的人在杀手群不被踢', !kOps.some((c) => c.method === 'banChatMember' && String(c.body?.user_id) === '88801'));
	check('/purge：手动封的人在杀手群被踢', kOps.some((c) => c.method === 'banChatMember' && String(c.body?.user_id) === '88802'));
	W.applyRuntimeConfig(W.loadRequiredConfig(env));
}

// 同款 / 连带 / 投票 三个功能与杀手群完全隔离
const AD_TEXT = '高价收网赚账号 长期收购 USDT 日结秒到 需要的私我';
await W.adDetectionReady(env);
log('\n=== 9. 同款直封：杀手群不触发，GROUP_ID 群触发也不碰杀手群 ===');
{
	// 广告正文会先被自动检测拿走，到不了同款那条路，所以这里直接测同款的两个关口：
	// ① 名单命中（cacheModerationMessage 的 spamHit）② 直封执行（enforceHandledRepeatBan）。
	await W.recordSpamText(env, { text: AD_TEXT });
	check('前置：同款名单已写入', Number(env.DB.query('SELECT COUNT(*) AS c FROM ad_spam_texts')[0]?.c) > 0);
	const hitK = await W.cacheModerationMessage(env, groupMsg(K, '70001', AD_TEXT), {});
	check('杀手群发同款 → 不命中同款名单', hitK?.spamHit !== true, JSON.stringify(hitK));
	const hitG = await W.cacheModerationMessage(env, groupMsg(G, '70002', AD_TEXT), {});
	check('前置：GROUP_ID 群发同款 → 命中同款名单', hitG?.spamHit === true, JSON.stringify(hitG));
	reset();
	await W.enforceHandledRepeatBan(env, groupMsg(G, '70002', AD_TEXT), { norm: hitG?.norm });
	check('GROUP_ID 群同款直封 → 封禁范围不含杀手群', !touched(K));
	check('前置：GROUP_ID 群同款直封 → GROUP_ID 群照常处置', touched(G));
}

log('\n=== 10. 同款连带：只反查/只封 GROUP_ID 群 ===');
{
	reset();
	// 杀手群里发过同款的号 B，GROUP_ID 群里发过同款的号 C
	await W.cacheModerationMessage(env, groupMsg(K, '70011', AD_TEXT), {});
	await W.cacheModerationMessage(env, groupMsg(G, '70012', AD_TEXT), {});
	const key = W.buildModerationTextKey({ text: AD_TEXT });
	const found = await W.findLinkedSpamTargets(env, key, '70099');
	const ids = (found.targets || []).map((t) => t.userId);
	check('连带反查不含只在杀手群发过的号', !ids.includes('70011'), JSON.stringify(ids));
	check('前置：连带反查仍能找到 GROUP_ID 群的号', ids.includes('70012'), JSON.stringify(ids));
	reset();
	await W.enforceLinkedSpamTargets(env, found.targets, { operatorId: OWNER, note: '测试连带' });
	check('连带封禁范围不含杀手群', !touched(K));
	check('前置：连带封禁 GROUP_ID 群照常', touched(G));
}

log('\n=== 11. /ad 投票：杀手群发不起，GROUP_ID 群投票通过也不碰杀手群 ===');
{
	reset();
	await post({ update_id: 21, message: { ...groupMsg(K, OWNER, '/ad 广告'), reply_to_message: groupMsg(K, '70021', AD_TEXT) } });
	check('杀手群 /ad 不发起投票（无投票卡片）', !sent.some((m) => m.chatId === K && /投票/.test(m.text)), JSON.stringify(sent.map((m) => m.text.slice(0, 40))));
	reset();
	await W.ensureAdVoteTables(env);
	await W.enforceApprovedAdVote(env, {
		voteToken: 'tk1', chatId: G, chatTitle: '群', targetUserId: '70022', creatorUserId: OWNER,
		target: { id: '70022', firstName: 'T' }, creator: { id: OWNER, firstName: 'O' },
		approvers: [], rejecters: [], reason: '测试', messageId: 1, reportedMessageId: null, version: 1
	});
	check('投票通过 → 封禁范围不含杀手群', !touched(K));
	check('前置：投票通过 → GROUP_ID 群照常处置', touched(G));
}

log('\n=== 12. /killer 命令已移除：发出去无回应 ===');
reset();
await post({ update_id: 31, message: groupMsg(K, OWNER, '/killer on') });
check('杀手群 /killer on 无回执', !sent.some((m) => /杀手模式已(开启|关闭)/.test(m.text)));
check('杀手群 /killer on 不建 killer_mode 表', !env.DB.query("SELECT name FROM sqlite_master WHERE name = 'killer_mode'").length);

log('\n杀手群处置规则验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
