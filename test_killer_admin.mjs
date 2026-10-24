// 杀手权限（KILLER_ADMIN_IDS）· 离线验证
//
// 杀手权限独立在所有权限之外，只作用于 KILLER_MODE_GROUPS，不能影响 GROUP_ID 的群：
//   · 按群分身份：杀手群里发命令 = 杀手身份；GROUP_ID 群里只有杀手权限的人无权、静默；
//     私聊时超管本来就有的 /ban /spam /unban /check 走超管身份，其余走杀手身份
//   · 独立黑名单 killer_blacklist，只在杀手群拦截；手动封禁一律踢出、不学习特征
//   · 封禁 / 解封 / 群发 抄送第一主人；杀手身份与超管身份都豁免广告自动检测
// 每节都配一条「越界」反向断言：GROUP_ID 群一根头发都不能动。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const calls = [];
const sent = [];
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
		if (m === 'sendMessage') { sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || ''), markup: b?.reply_markup || null }); payload = { ok: true, result: { message_id: 9000 + sent.length } }; }
		else if (m === 'copyMessage') payload = { ok: true, result: { message_id: 7000 + calls.length } };
		else if (m === 'getChatAdministrators') payload = { ok: true, result: [{ user: { id: 42, is_bot: true }, status: 'administrator', can_restrict_members: true, can_delete_messages: true, can_invite_users: true }] };
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
		if (up === 'SELECT' || /\bRETURNING\b/i.test(sql) || sql.trim().toUpperCase().startsWith('PRAGMA') || up === 'WITH') return { kind: 'rows', rows: st.all(...bd).map(nOut) };
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
const bannedIn = (chat, user) => callsOf('banChatMember').some((c) => String(c.body?.chat_id) === chat && (!user || String(c.body?.user_id) === String(user)));
const touched = (chat) => calls.some((c) => ['banChatMember', 'restrictChatMember', 'unbanChatMember', 'copyMessage', 'deleteMessage'].includes(c.method) && String(c.body?.chat_id) === chat);
const deletedIn = (chat) => callsOf('deleteMessage').some((c) => String(c.body?.chat_id) === chat);
const sentTo = (chat) => sent.filter((s) => s.chatId === String(chat));
const textTo = (chat) => sentTo(chat).map((s) => s.text).join('\n');

// 全部是一眼假的 mock 值
const OWNER = '10001';
const KA = '30001';          // 只有杀手权限
const KS = '30002';          // 杀手权限 + 超管
const K = '-100111';         // 杀手群
const G = '-100222';         // GROUP_ID 群
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: G, OWNER_IDS: OWNER, KILLER_MODE_GROUPS: K, KILLER_ADMIN_IDS: KA + ',' + KS, SUPER_ADMIN_IDS: KS, DB: makeD1() };
W.applyRuntimeConfig(W.loadRequiredConfig(env));
await W.ensureD1Table(env);
await W.adDetectionReady(env);
const ctx = { waitUntil() {} };
const post = (update) => handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, ctx);
let uid = 1;
const groupMsg = (chat, from, text, extra = {}) => ({ message_id: 100 + (uid++), date: Math.floor(Date.now() / 1000), chat: { id: Number(chat), type: 'supergroup', title: '群' }, from: { id: Number(from), is_bot: false, first_name: 'U' + from }, text, ...extra });
const privMsg = (from, text, extra = {}) => ({ message_id: 100 + (uid++), date: Math.floor(Date.now() / 1000), chat: { id: Number(from), type: 'private' }, from: { id: Number(from), is_bot: false, first_name: 'U' + from }, text, ...extra });
const memberUpdate = (chat, user, oldS, newS, actor = user) => ({ chat_member: { chat: { id: Number(chat), type: 'supergroup', title: '群' }, from: { id: Number(actor), is_bot: false, first_name: 'A' }, date: Math.floor(Date.now() / 1000), old_chat_member: { user: { id: Number(user), is_bot: false, first_name: 'T' }, status: oldS }, new_chat_member: { user: { id: Number(user), is_bot: false, first_name: 'T' }, status: newS } } });
const send = (m) => post({ update_id: uid++, message: m });
const tableCount = (table, where = '') => { try { return Number(env.DB.query('SELECT COUNT(*) AS c FROM ' + table + (where ? ' WHERE ' + where : ''))[0]?.c || 0); } catch (_) { return 0; } };
const inKillerBl = (id) => tableCount('killer_blacklist', "id = '" + id + "'") > 0;
const inMainBl = (id) => tableCount('blacklist', "id = '" + id + "'") > 0;
const learnTotal = () => tableCount('ad_fingerprints') + tableCount('ad_spam_texts') + tableCount('ad_sample_embeddings') + tableCount('ad_avatars') + tableCount('ad_badges') + tableCount('ad_profile_shapes');
const isKA = (id) => typeof W.isKillerAdmin === 'function' && W.isKillerAdmin(id) === true;

log('\n=== 1. 配置与豁免 ===');
check('KILLER_ADMIN_IDS 解析出杀手权限', isKA(KA) && isKA(KS));
check('主人不是杀手权限', !isKA(OWNER));
check('杀手权限豁免广告自动检测', W.isAdDetectionExemptUser(KA) === true);
check('杀手+超管同样豁免', W.isAdDetectionExemptUser(KS) === true);
check('杀手权限是自动路径的受保护角色', (await W.isProtectedFromAutoModeration(KA)) === true);

log('\n=== 2. 杀手群里 /ban：杀手身份，只踢杀手群，进独立黑名单，不学习，抄送第一主人 ===');
reset();
let learnBefore = learnTotal();
await send(groupMsg(K, KA, '/ban 55601 发广告'));
check('杀手群踢出', bannedIn(K, '55601'));
check('越界：GROUP_ID 群一根头发没动', !touched(G));
check('进杀手黑名单', inKillerBl('55601'));
check('越界：不进主黑名单', !inMainBl('55601'));
check('不学习特征', learnTotal() === learnBefore, learnBefore + ' → ' + learnTotal());
check('命令消息撤回', callsOf('deleteMessage').some((c) => String(c.body?.chat_id) === K));
check('抄送第一主人', /杀手权限/.test(textTo(OWNER)), textTo(OWNER).slice(0, 200));

log('\n=== 3. GROUP_ID 群里只有杀手权限的人 /ban：无权、静默 ===');
reset();
await send(groupMsg(G, KA, '/ban 55602'));
check('没有任何封禁调用', !callsOf('banChatMember').length && !callsOf('restrictChatMember').length);
check('两份黑名单都没写', !inKillerBl('55602') && !inMainBl('55602'));
check('群里不回任何消息', sentTo(G).length === 0);

log('\n=== 4. 私聊 /ban：只有杀手权限 → 杀手身份 ===');
reset();
await send(privMsg(KA, '/ban 55603'));
check('杀手群踢出', bannedIn(K, '55603'));
check('越界：GROUP_ID 群没动', !touched(G));
check('进杀手黑名单、不进主黑名单', inKillerBl('55603') && !inMainBl('55603'));
check('结果回给本人', /55603/.test(textTo(KA)));

log('\n=== 5. 两份权限都有：按群分身份 ===');
reset();
await send(privMsg(KS, '/ban 55604'));
check('私聊 /ban 走超管身份：进主黑名单', inMainBl('55604'));
check('私聊 /ban 走超管身份：不进杀手黑名单', !inKillerBl('55604'));
check('私聊 /ban 走超管身份：GROUP_ID 群照常处置', touched(G));
reset();
await send(groupMsg(K, KS, '/ban 55605'));
check('杀手群里 /ban 走杀手身份：进杀手黑名单', inKillerBl('55605'));
check('杀手群里 /ban 走杀手身份：不进主黑名单', !inMainBl('55605'));
check('杀手群里 /ban 走杀手身份：GROUP_ID 群没动', !touched(G));
reset();
await send(groupMsg(G, KS, '/ban 55606'));
// 独立模式口径：超管在 GROUP_ID 群 /ban 先弹范围按钮，点「② 全域」才进主黑名单
check('GROUP_ID 群里 /ban 走超管身份：点按钮前不写库', !inMainBl('55606') && !inKillerBl('55606'));
{
	const gBtn = sentTo(G).flatMap((s) => (s.markup?.inline_keyboard || []).flat()).map((b) => b.callback_data).find((d) => String(d).startsWith('gmsa:G:'));
	check('GROUP_ID 群里 /ban 走超管身份：弹出「② 全域」按钮', !!gBtn);
	await post({ update_id: uid++, callback_query: { id: 'cb' + uid, data: gBtn, from: { id: Number(KS), is_bot: false, first_name: 'U' + KS }, message: { message_id: 9001, chat: { id: Number(G), type: 'supergroup', title: '群' } } } });
}
check('GROUP_ID 群里 /ban 走超管身份：进主黑名单', inMainBl('55606'));
check('GROUP_ID 群里 /ban 走超管身份：不进杀手黑名单', !inKillerBl('55606'));

log('\n=== 6. 杀手黑名单只在杀手群拦截 ===');
reset();
await send(groupMsg(K, '55601', '你好'));
check('杀手群发言 → 删消息', deletedIn(K));
check('杀手群发言 → 踢出', bannedIn(K, '55601'));
reset();
await send(groupMsg(G, '55601', '你好'));
check('越界：GROUP_ID 群发言照常、不删', !deletedIn(G));
check('越界：GROUP_ID 群发言照常、不封', !bannedIn(G));
reset();
await post({ update_id: uid++, ...memberUpdate(K, '55601', 'left', 'member') });
check('复入杀手群 → 踢回', bannedIn(K, '55601'));
reset();
await post({ update_id: uid++, ...memberUpdate(G, '55601', 'left', 'member') });
check('越界：进 GROUP_ID 群不拦', !bannedIn(G));
reset();
await post({ update_id: uid++, ...memberUpdate(K, '55601', 'kicked', 'left', '77777') });
check('杀手群原生解封 → 封回', bannedIn(K, '55601'));

log('\n=== 7. 杀手群里 /spam 回复：删原消息 + 踢出，不学习、不进同款名单 ===');
reset();
learnBefore = learnTotal();
const adMsg = groupMsg(K, '55607', '高价收网赚账号 长期收购 USDT 日结秒到 需要的私我');
await send(groupMsg(K, KA, '/spam', { reply_to_message: adMsg }));
check('删掉被回复的广告', callsOf('deleteMessage').some((c) => String(c.body?.chat_id) === K && Number(c.body?.message_id) === adMsg.message_id));
check('杀手群踢出', bannedIn(K, '55607'));
check('越界：GROUP_ID 群没动', !touched(G));
check('进杀手黑名单', inKillerBl('55607'));
check('越界：不进主黑名单', !inMainBl('55607'));
check('不学习、不进同款名单', learnTotal() === learnBefore, learnBefore + ' → ' + learnTotal());

log('\n=== 8. 保护：杀手权限封不了主人 ===');
reset();
await send(privMsg(KA, '/ban ' + OWNER));
check('主人不进杀手黑名单', !inKillerBl(OWNER));
check('主人没被踢', !bannedIn(K, OWNER));

log('\n=== 9. /unban：只解杀手黑名单与杀手群；主黑名单里的人不放 ===');
reset();
await send(privMsg(KA, '/unban 55601'));
check('移出杀手黑名单', !inKillerBl('55601'));
check('杀手群解封', callsOf('unbanChatMember').some((c) => String(c.body?.chat_id) === K));
check('越界：GROUP_ID 群没动', !touched(G));
check('抄送第一主人', /杀手权限/.test(textTo(OWNER)));
reset();
await env.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)').bind('66601', 'manual', OWNER, new Date().toISOString(), null).run();
await send(privMsg(KA, '/unban 66601'));
check('主黑名单记录保留', inMainBl('66601'));
check('主黑名单里的人：不调 Telegram 解封', !callsOf('unbanChatMember').length && !callsOf('restrictChatMember').length);
check('告知原因', /主黑名单/.test(textTo(KA)), textTo(KA).slice(0, 200));

log('\n=== 10. /check：带出杀手黑名单状态 ===');
reset();
await send(privMsg(KA, '/check 55605'));
check('结果里有杀手黑名单一节', /杀手黑名单/.test(textTo(KA)), textTo(KA).slice(0, 300));
reset();
await send(groupMsg(G, KA, '/check 55605'));
check('越界：GROUP_ID 群里 /check 静默', sentTo(G).length === 0 && sentTo(KA).length === 0);

log('\n=== 11. /stats：只能查杀手群 ===');
reset();
await send(privMsg(KA, '/stats ' + G));
check('私聊查 GROUP_ID 群被拒', /杀手群/.test(textTo(KA)) && !/发言/.test(textTo(KA).replace(/杀手群[^\n]*/g, '')), textTo(KA).slice(0, 200));
reset();
await send(privMsg(KA, '/stats ' + K));
check('私聊查杀手群放行', sentTo(KA).length > 0 && !/权限不足/.test(textTo(KA)), textTo(KA).slice(0, 200));
reset();
await send(groupMsg(G, KA, '/stats today'));
check('越界：GROUP_ID 群里 /stats 静默', sentTo(G).length === 0);

log('\n=== 12. /search：范围只含杀手群 ===');
reset();
await send(privMsg(KA, '/search 你好'));
check('私聊 /search 放行', sentTo(KA).length > 0 && !/权限不足/.test(textTo(KA)), textTo(KA).slice(0, 200));
check('范围标签是杀手群', /杀手群/.test(textTo(KA)));

log('\n=== 13. /notice：全部杀手群 + 指定杀手群，不发 GROUP_ID 群 ===');
reset();
await send(privMsg(KA, '/notice ' + G));
check('指定 GROUP_ID 群被拒', /杀手群/.test(textTo(KA)) && !callsOf('copyMessage').length);
reset();
await send(privMsg(KA, '/notice'));
check('进入等待内容态', /通知/.test(textTo(KA)));
reset();
await send(privMsg(KA, '各位注意'));
const confirmBtn = sent.flatMap((s) => s.markup?.inline_keyboard?.flat() || []).find((b) => /确认/.test(b.text || ''));
check('出确认按钮', Boolean(confirmBtn), JSON.stringify(sent.map((s) => s.markup)));
reset();
if (confirmBtn) await post({ update_id: uid++, callback_query: { id: 'cb1', from: { id: Number(KA), is_bot: false, first_name: 'K' }, data: confirmBtn.callback_data, message: { message_id: 1, chat: { id: Number(KA), type: 'private' } } } });
check('群发到杀手群', callsOf('copyMessage').some((c) => String(c.body?.chat_id) === K));
check('越界：不发 GROUP_ID 群', !callsOf('copyMessage').some((c) => String(c.body?.chat_id) === G));
check('抄送第一主人', /杀手权限/.test(textTo(OWNER)));
reset();
await send(privMsg(OWNER, '/notice'));
check('主人的 /notice 不受影响', /配置群/.test(textTo(OWNER)));
reset();
await send(privMsg(KA, '/notice ' + K));
reset();
const photoMsg = privMsg(KA, undefined, { photo: [{ file_id: 'p1', width: 1, height: 1 }], caption: '' });
delete photoMsg.text;
await send(photoMsg);
check('图片当通知内容也能捕获（没有 text）', sent.some((s) => /确认/.test(JSON.stringify(s.markup || ''))), JSON.stringify(sent.map((s) => s.text.slice(0, 40))));

log('\n=== 14. /health /help /profile /rm ===');
reset();
await send(privMsg(KA, '/health'));
check('/health 放行', /运行检查/.test(textTo(KA)), textTo(KA).slice(0, 200));
check('/health 只体检杀手群', /（1 个/.test(textTo(KA)) && !callsOf('getChat').some((c) => String(c.body?.chat_id) === G));
reset();
await send(privMsg(KA, '/help'));
check('/help 出杀手权限帮助', /杀手权限/.test(textTo(KA)));
check('/help 不列他用不了的命令', !/\/addgroup|\/dryrun|\/admins/.test(textTo(KA)));
reset();
await send(privMsg(KA, '/profile 55605'));
check('/profile 放行', /资料卡/.test(textTo(KA)));
reset();
const target = groupMsg(K, '55609', '随便说说');
await send(groupMsg(K, KA, '/rm', { reply_to_message: target }));
check('杀手群里 /rm 删得掉', callsOf('deleteMessage').some((c) => String(c.body?.chat_id) === K && Number(c.body?.message_id) === target.message_id));
reset();
const targetG = groupMsg(G, '55609', '随便说说');
await send(groupMsg(G, KA, '/rm', { reply_to_message: targetG }));
check('越界：GROUP_ID 群里 /rm 删不了', !callsOf('deleteMessage').some((c) => Number(c.body?.message_id) === targetG.message_id));

log('\n=== 15. 批量任务：杀手身份的大批量走独立黑名单、只踢杀手群 ===');
reset();
const bulkIds = Array.from({ length: 25 }, (_, i) => String(56000 + i));
await send(privMsg(KA, '/ban ' + bulkIds.join(',')));
const jobRow = env.DB.query("SELECT id FROM batch_jobs ORDER BY created_at DESC LIMIT 1")[0];
check('创建了批量任务', Boolean(jobRow));
if (jobRow) {
	for (let i = 0; i < 10; i++) { const j = await W.runBulkModerationJob(env, jobRow.id, { autoContinue: false, notifyOnDone: false, ignoreLease: true }); if (j?.status === 'done') break; }
}
check('批量：全部进杀手黑名单', bulkIds.every(inKillerBl));
check('批量：越界不进主黑名单', !bulkIds.some(inMainBl));
check('批量：杀手群踢出', bannedIn(K, bulkIds[0]));
check('批量：越界 GROUP_ID 群没动', !touched(G));
reset();
if (jobRow) await send(privMsg(KA, '/job ' + jobRow.id));
check('/job 查得到自己的杀手任务', /批量任务/.test(textTo(KA)), textTo(KA).slice(0, 200));

log('\n=== 16. 自助解封：杀手黑名单里的人不在杀手群解封 ===');
reset();
const keyword = vm.runInContext('SELF_UNBAN_KEYWORD', sandbox);
await send(privMsg('55605', keyword));
check('杀手群不解封', !callsOf('unbanChatMember').some((c) => String(c.body?.chat_id) === K) && !callsOf('restrictChatMember').some((c) => String(c.body?.chat_id) === K));

log('\n=== 16b. 按钮回调：统计 / 搜索翻页只认杀手群 ===');
{
	const cb = (data) => ({ update_id: uid++, callback_query: { id: 'cb' + uid, from: { id: Number(KA), is_bot: false, first_name: 'K' }, data, message: { message_id: 5, chat: { id: Number(KA), type: 'private' } } } });
	const enc = (s) => W.encodeAdCallbackToken(s);
	// const 词法绑定不挂到 sandbox 上，只能在上下文里取
	W.STAT_GO_PREFIX = vm.runInContext('STAT_GO_PREFIX', sandbox);
	W.SEARCH_PREFIX = vm.runInContext('SEARCH_PREFIX', sandbox);
	const answers = () => callsOf('answerCallbackQuery').map((c) => String(c.body?.text || ''));
	reset();
	await post(cb(W.STAT_GO_PREFIX + enc('day|' + K)));
	check('统计按钮：杀手群放行', callsOf('editMessageText').length > 0 && !answers().some((t) => /仅限/.test(t)), JSON.stringify(answers()));
	reset();
	await post(cb(W.STAT_GO_PREFIX + enc('day|' + G)));
	check('越界：统计按钮查 GROUP_ID 群被拒', answers().some((t) => /仅限/.test(t)) && !callsOf('editMessageText').length);
	reset();
	await post(cb(W.SEARCH_PREFIX + '2:' + enc('keyword|你好|killer')));
	check('搜索翻页：killer 范围放行', callsOf('editMessageText').length > 0, JSON.stringify(answers()));
	reset();
	await post(cb(W.SEARCH_PREFIX + '2:' + enc('keyword|你好|all')));
	check('越界：搜索翻页 all 范围被拒', answers().some((t) => /仅限/.test(t)));
}

log('\n=== 16c. 热路径：GROUP_ID 群的普通发言不读杀手黑名单 ===');
{
	const origPrepare = env.DB.prepare;
	const sqls = [];
	env.DB.prepare = (sql) => { sqls.push(sql); return origPrepare(sql); };
	await send(groupMsg(G, '55777', '普通聊天'));
	env.DB.prepare = origPrepare;
	check('GROUP_ID 群发言不查 killer_blacklist', !sqls.some((s) => /killer_blacklist/.test(s)), sqls.filter((s) => /killer/.test(s)).join(' | '));
}

log('\n=== 17. 主人权限不变 ===');
reset();
await send(privMsg(OWNER, '/ban 55610'));
check('主人 /ban 照旧进主黑名单', inMainBl('55610') && !inKillerBl('55610'));
check('主人 /ban 照旧处置 GROUP_ID 群', touched(G));

log(`\n合计：通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
