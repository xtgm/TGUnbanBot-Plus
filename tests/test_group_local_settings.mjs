// 独立模式 · 批次 2（/localset 本群设置、独立群自动检测只作用本群）
// 断言走完整链路（handler.fetch 发真实 update），只断言落库与 Telegram 调用。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
const sent = [];
const modded = [];
const deleted = [];
const sqlLog = [];

const G1 = '-1001111111111'; // 全局群
const G2 = '-1002222222222'; // 独立群
const OWNER = '10001';
const VICE = '10002';
const ADMIN_R = '10004'; // 只有「封禁用户」权限
const CREATOR = '10005';
const ADMIN_N = '10006'; // 什么权限都没有
const ADMIN_C = '10007'; // 有「修改群组信息」权限
const ANON = '1087968824';

const sandbox = {
	console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout, AbortController, AbortSignal,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		let result = true;
		if (m === 'sendMessage') {
			sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || ''), markup: JSON.stringify(b?.reply_markup || null) });
			result = { message_id: 9000 + sent.length };
		} else if (m === 'deleteMessage') deleted.push({ chatId: String(b?.chat_id ?? ''), mid: Number(b?.message_id) });
		else if (m === 'banChatMember' || m === 'restrictChatMember') modded.push({ chatId: String(b?.chat_id ?? ''), userId: String(b?.user_id), m });
		else if (m === 'getChat') result = { id: Number(b?.chat_id), type: 'supergroup', title: '测试群' };
		else if (m === 'getChatMember') result = { status: 'member', user: { id: Number(b?.user_id) } };
		else if (m === 'getChatAdministrators') result = [
			{ user: { id: Number(CREATOR) }, status: 'creator' },
			{ user: { id: Number(ADMIN_R) }, status: 'administrator', can_restrict_members: true, can_change_info: false },
			{ user: { id: Number(ADMIN_N) }, status: 'administrator', can_restrict_members: false, can_change_info: false },
			{ user: { id: Number(ADMIN_C) }, status: 'administrator', can_restrict_members: false, can_change_info: true }
		];
		return { ok: true, status: 200, json: async () => ({ ok: true, result }), text: async () => JSON.stringify({ ok: true, result }) };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.replace(/export\s+default\s*/, 'globalThis.__h = '), sandbox, { filename: '_worker.js' });
const W = sandbox;

function makeD1() {
	const db = new DatabaseSync(':memory:');
	const nIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const nOut = (r) => { if (!r) return null; const o = {}; for (const k of Object.keys(r)) o[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k]; return o; };
	const exec = (sql, params) => {
		sqlLog.push(sql + ' ' + JSON.stringify(params)); // 带上绑定参数：sqlite_master 探测的表名在参数里
		const st = db.prepare(sql);
		const bd = params.map(nIn);
		const up = sql.trim().slice(0, 6).toUpperCase();
		if (up === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA') || /\bRETURNING\b/i.test(sql)) return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		const i = st.run(...bd);
		return { kind: 'write', meta: { changes: Number(i?.changes || 0), last_row_id: Number(i?.lastInsertRowid || 0), rows_written: Number(i?.changes || 0) } };
	};
	const mk = (sql) => {
		const s = { sql, params: [] };
		const a = {
			__d1: s,
			bind(...x) { s.params = x; return a; },
			async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
			async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: r.rows.length } } : { success: true, results: [], meta: r.meta }; },
			async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: r.rows.length } } : { success: true, results: [], meta: r.meta }; }
		};
		return a;
	};
	return {
		prepare: mk,
		async exec(sql) { for (const p of String(sql).split(';')) { const s = p.trim(); if (s) db.exec(s); } return { count: 1 }; },
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; },
		query(sql) { try { return db.prepare(sql).all().map(nOut); } catch (_) { return []; } }
	};
}

let pass = 0;
let fail = 0;
function check(label, cond, extra) {
	if (cond) { pass += 1; console.log('  ✅ ' + label); }
	else { fail += 1; console.log('  ❌ ' + label + (extra ? '  ' + String(extra).slice(0, 400) : '')); }
}

const env = {
	TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: [G1, G2].join(','),
	OWNER_IDS: OWNER + ',' + VICE, DB: makeD1()
};
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });
await W.adDetectionReady(env);
W.fetchAdUserProfile = async () => ({ firstName: '路人', lastName: '', username: '', bio: '', avatarId: '', badgeId: '' });

let mid = 7000;
async function post(update) {
	await W.__h.fetch(new Request('https://x.com/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: ++mid, ...update })
	}), env, { waitUntil() {} });
}
async function send(fromId, text, chatId) {
	mid += 1;
	const isPrivate = chatId === 'private';
	await post({ message: {
		message_id: mid, date: Math.floor(Date.now() / 1000), text,
		chat: isPrivate ? { id: Number(fromId), type: 'private' } : { id: Number(chatId), type: 'supergroup', title: '测试群' },
		from: { id: Number(fromId), is_bot: false, first_name: 'U' + fromId }
	} });
	return mid - 1; // post 里 ++mid 用作 update_id，message_id 是它前一个
}
async function sendAnon(text, chatId) {
	mid += 1;
	await post({ message: {
		message_id: mid, date: 1, text,
		chat: { id: Number(chatId), type: 'supergroup', title: '测试群' },
		from: { id: Number(ANON), is_bot: true, first_name: 'Group', username: 'GroupAnonymousBot' },
		sender_chat: { id: Number(chatId), type: 'supergroup', title: '测试群' }
	} });
}

const AD_TEXT = '长期收购网赚账号 USDT，进群联系 @promo_seller_x';
const inGlobal = (uid) => env.DB.query("SELECT id FROM blacklist WHERE id='" + uid + "'").length === 1;
const localRow = (chat, uid) => env.DB.query("SELECT user_id, reason, by_user FROM group_blacklist WHERE chat_id='" + chat + "' AND user_id='" + uid + "'")[0] || null;
const settingsRow = (chat) => env.DB.query("SELECT detect, action FROM group_settings WHERE chat_id='" + chat + "'")[0] || null;
const wlRows = (chat) => env.DB.query("SELECT user_id FROM group_whitelist WHERE chat_id='" + chat + "'").map((r) => String(r.user_id));
const dryOn = (chat) => Number(env.DB.query("SELECT enabled FROM dryrun_groups WHERE chat_id='" + chat + "'")[0]?.enabled) === 1;
const countOf = (table) => Number(env.DB.query('SELECT COUNT(*) AS c FROM ' + table)[0]?.c || 0);
const LEARN_TABLES = ['ad_fingerprints', 'ad_sample_embeddings', 'ad_profile_shapes', 'ad_avatars', 'ad_badges', 'ad_images'];
const learnedTotal = () => LEARN_TABLES.reduce((n, t) => n + countOf(t), 0);
const allSent = () => sent.map((s) => s.text).join('\n');
const moddedOf = (uid) => modded.filter((x) => x.userId === uid);
const reset = () => { sent.length = 0; modded.length = 0; deleted.length = 0; sqlLog.length = 0; };
let seq = 770000;
const nextUid = () => String(++seq);

// G2 先切独立（批次 1 已有的命令）。
await send(OWNER, '/groupmode ' + G2 + ' independent', 'private');
check('前提：G2 已是独立群', W.isIndependentGroup(G2));

console.log('\n=== /localset 权限 ===');
reset();
await send(ADMIN_N, '/localset 检测 关', G2);
check('★ 无权限管理员：设置不变', settingsRow(G2) === null);
check('★ 无权限管理员：提示需要「修改群组信息」', allSent().includes('修改群组信息'), allSent());
reset();
await send(ADMIN_R, '/localset 处置 禁言', G2);
check('★ 只有封禁权限的管理员：也不能改设置', settingsRow(G2) === null);
reset();
await sendAnon('/localset 检测 关', G2);
check('★ 匿名管理员：拒绝且不改', settingsRow(G2) === null && allSent().includes('匿名'), allSent());
reset();
await send('880001', '/localset 检测 关', G2);
check('★ 普通成员：静默不改', settingsRow(G2) === null && sent.length === 0, allSent());
reset();
await send(CREATOR, '/localset 检测 关', G1);
check('★ 全局群里发：提示仅独立群可用', allSent().includes('仅独立群可用') && settingsRow(G1) === null, allSent());
reset();
await send(CREATOR, '/localset', G2);
check('★ 群主无参：显示本群设置', allSent().includes('本群设置') && allSent().includes('检测') && allSent().includes('踢出'), allSent());

console.log('\n=== /localset 写入 ===');
reset();
await send(ADMIN_C, '/localset 处置 禁言', G2);
check('★ 有修改群信息权限的管理员：处置改为禁言', settingsRow(G2)?.action === 'mute', JSON.stringify(settingsRow(G2)));
await send(CREATOR, '/localset 处置 踢出', G2);
check('★ 群主：处置改回踢出', settingsRow(G2)?.action === 'kick');
await send(OWNER, '/localset 检测 关', G2);
check('★ 第一主人在群里也能用：检测关', Number(settingsRow(G2)?.detect) === 0);
await send(CREATOR, '/localset 检测 开', G2);
check('★ 检测开：处置方式保留', Number(settingsRow(G2)?.detect) === 1 && settingsRow(G2)?.action === 'kick');
await send(CREATOR, '/localset 演练 开', G2);
check('★ 演练开：写 dryrun_groups', dryOn(G2));
await send(CREATOR, '/localset 演练 关', G2);
check('★ 演练关', !dryOn(G2));
await send(CREATOR, '/localset 白名单 加 880101,880102', G2);
check('★ 白名单加两个', JSON.stringify(wlRows(G2).sort()) === JSON.stringify(['880101', '880102']), JSON.stringify(wlRows(G2)));
await send(CREATOR, '/localset 白名单 删 880102', G2);
check('★ 白名单删一个', JSON.stringify(wlRows(G2)) === JSON.stringify(['880101']), JSON.stringify(wlRows(G2)));
reset();
await send(CREATOR, '/localset 处置 拉黑', G2);
check('★ 未知取值：报用法、不改', allSent().includes('用法') && settingsRow(G2)?.action === 'kick', allSent());
reset();
await send(CREATOR, '/localset', G2);
check('★ 查看：列出本群白名单', allSent().includes('880101'), allSent());

console.log('\n=== 全局群自动检测：行为不变（对照） ===');
{
	reset();
	const uid = nextUid();
	await send(uid, AD_TEXT, G1);
	check('对照：全局群定罪写全局黑名单', inGlobal(uid));
	check('对照：全局群定罪会学特征', learnedTotal() > 0, String(learnedTotal()));
	reset();
	await send(nextUid(), '今天天气不错，一起出去走走', G1);
	check('★ 全局群普通发言：不读本群设置表（热路径零额外 SQL）', !sqlLog.some((s) => /group_settings|group_whitelist/.test(s)), sqlLog.filter((s) => /group_/.test(s)).join(' | '));
}

console.log('\n=== 独立群自动检测：只作用本群 ===');
{
	// 先在全局群埋一条同款（只进消息缓存、不触发检测），验证独立群定罪不外溢连带。
	const bystander = nextUid();
	await W.cacheModerationMessage(env, {
		message_id: 4242, date: Math.floor(Date.now() / 1000), text: AD_TEXT,
		chat: { id: Number(G1), type: 'supergroup' }, from: { id: Number(bystander), is_bot: false, first_name: 'B' }
	}, {});
	const learnedBefore = learnedTotal();
	const spamBefore = countOf('ad_spam_texts');
	reset();
	const uid = nextUid();
	const adMsgId = await send(uid, AD_TEXT, G2);
	const row = localRow(G2, uid);
	check('★ 独立群定罪：写本群黑名单', row !== null, JSON.stringify(row));
	check('★ 本群黑名单记 ad_auto / system', row?.reason === 'ad_auto' && row?.by_user === 'system', JSON.stringify(row));
	check('★ 不写全局黑名单', !inGlobal(uid));
	check('★ 只处置本群、默认踢出', moddedOf(uid).length > 0 && moddedOf(uid).every((x) => x.chatId === G2 && x.m === 'banChatMember'), JSON.stringify(moddedOf(uid)));
	check('★ 删掉触发消息', deleted.some((d) => d.chatId === G2 && d.mid === adMsgId), JSON.stringify(deleted));
	check('★ 不学全局特征', learnedTotal() === learnedBefore, learnedBefore + ' → ' + learnedTotal());
	check('★ 不写同款直封名单', countOf('ad_spam_texts') === spamBefore);
	check('★ 同款不外溢：全局群发过同款的人不连带', moddedOf(bystander).length === 0 && !inGlobal(bystander), JSON.stringify(moddedOf(bystander)));
	check('★ 通知第一主人并标明本群黑名单', sent.some((s) => s.chatId === OWNER && s.text.includes('本群黑名单')), allSent());
	reset();
	await send(uid, '你好', G2);
	check('★ 定罪后再发言：被本群黑名单拦截', moddedOf(uid).some((x) => x.chatId === G2), JSON.stringify(modded));
}
{
	await send(CREATOR, '/localset 处置 禁言', G2);
	reset();
	const uid = nextUid();
	await send(uid, AD_TEXT, G2);
	check('★ 处置=禁言：只在本群 restrictChatMember', moddedOf(uid).length > 0 && moddedOf(uid).every((x) => x.chatId === G2 && x.m === 'restrictChatMember'), JSON.stringify(moddedOf(uid)));
	check('★ 处置=禁言：仍写本群黑名单', localRow(G2, uid) !== null && !inGlobal(uid));
	await send(CREATOR, '/localset 处置 踢出', G2);
}
{
	await send(CREATOR, '/localset 检测 关', G2);
	reset();
	const uid = nextUid();
	await send(uid, AD_TEXT, G2);
	check('★ 检测关：不判、不处置', localRow(G2, uid) === null && moddedOf(uid).length === 0 && !inGlobal(uid), JSON.stringify(moddedOf(uid)));
	const join = await W.screenAdJoinMember(env, { id: Number(nextUid()), first_name: 'J' }, { chatId: G2 });
	check('★ 检测关：入群筛查也跳过', join === 'skipped', String(join));
	await send(CREATOR, '/localset 检测 开', G2);
}
{
	reset();
	await send('880101', AD_TEXT, G2);
	check('★ 本群白名单：不判、不处置', localRow(G2, '880101') === null && moddedOf('880101').length === 0 && !inGlobal('880101'), JSON.stringify(moddedOf('880101')));
	const join = await W.screenAdJoinMember(env, { id: 880101, first_name: 'J' }, { chatId: G2 });
	check('★ 本群白名单：入群筛查也跳过', join === 'whitelisted', String(join));
	reset();
	await send('880101', AD_TEXT, G1);
	check('★ 本群白名单只管本群：在全局群照判', inGlobal('880101'));
}
{
	await send(CREATOR, '/localset 演练 开', G2);
	const learnedBefore = learnedTotal();
	const dryBefore = countOf('ad_dryrun_log');
	reset();
	const uid = nextUid();
	await send(uid, AD_TEXT, G2);
	check('★ 演练开：只记流水', countOf('ad_dryrun_log') === dryBefore + 1);
	check('★ 演练开：不处置、不写任何名单', moddedOf(uid).length === 0 && localRow(G2, uid) === null && !inGlobal(uid));
	check('★ 独立群演练：也不学全局特征', learnedTotal() === learnedBefore, learnedBefore + ' → ' + learnedTotal());
	await send(CREATOR, '/localset 演练 关', G2);
}

console.log(`\n合计：通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
