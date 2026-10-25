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

const BANNED = '880201';
const CLEAN = '880299';
const get = (p) => W.__h.fetch(new Request('https://x.com' + p), env, { waitUntil() {} });

await send(CREATOR, '/ban ' + BANNED, G2);
check('前提：群主 /ban 写进 G2 本群黑名单', localRow(G2, BANNED) !== null && !inGlobal(BANNED));

console.log('\n=== 网页版独立查询页 /check ===');
{
	const res = await get('/check');
	const html = await res.text();
	check('★ GET /check：200 HTML', res.status === 200 && /text\/html/.test(res.headers.get('Content-Type') || ''), res.status);
	check('★ 空白页：有查询框、提交到 /check', /<form method="get" action="\/check">/.test(html) && html.includes('name="tgid"'));
	check('★ 空白页：不出任何查询结果块', !html.includes('GKY 封禁库</h2>') && !html.includes('本机器人全局黑名单</h2>'));
	const bad = await get('/check?tgid=12a');
	check('★ 非数字：400 + 提示纯数字', bad.status === 400 && (await bad.text()).includes('纯数字'), bad.status);
	reset();
	const hit = await get('/check?tgid=' + BANNED);
	const hitHtml = await hit.text();
	check('★ 输入被封 TGID：同页出结果（不跳转）', hit.status === 200 && hitHtml.includes('TGID <strong>' + BANNED + '</strong>'), hit.status);
	check('★ 照旧有 GKY 与全局两块', hitHtml.includes('GKY 封禁库</h2>') && hitHtml.includes('本机器人全局黑名单</h2>'));
	check('★ 新增独立群本群黑名单块：群 ID + 已封禁', hitHtml.includes('独立群本群黑名单</h2>') && hitHtml.includes(G2) && hitHtml.includes('本群已封禁'));
	check('★ 本群块原因写成「代码（中文）」', hitHtml.includes('manual（/ban 或 /sban 本群处置）'));
	check('★ 本群块带复制 /unban 按钮', hitHtml.includes('data-copy="/unban ' + BANNED + '"') && hitHtml.includes('该群管理员'));
	check('★ 公开查询不写数据、不建表', !sqlLog.some((s) => /^\s*(INSERT|UPDATE|DELETE|CREATE)\b/i.test(s)), sqlLog.filter((s) => /^\s*(INSERT|UPDATE|DELETE|CREATE)/i.test(s)).join(' | '));
	const data = await (await get('/check?tgid=' + BANNED + '&format=json')).json();
	check('★ JSON 带 groups.list（active=true）', Array.isArray(data.groups?.list) && data.groups.list.length === 1 && data.groups.list[0].chatId === G2 && data.groups.list[0].active === true, JSON.stringify(data.groups));
	check('★ JSON 不带本群记录的操作人 TGID', !JSON.stringify(data.groups).includes(CREATOR));
	const cleanHtml = await (await get('/check?tgid=' + CLEAN)).text();
	check('★ 没有本群记录：不出本群块', !cleanHtml.includes('独立群本群黑名单</h2>'));
	const old = await (await get('/' + BANNED)).text();
	check('★ 旧链接 /{TGID} 照旧可用且同样带本群块', old.includes('独立群本群黑名单</h2>') && old.includes(G2));
}

console.log('\n=== /check 命令 ===');
{
	reset();
	await send(OWNER, '/check ' + BANNED, 'private');
	check('★ /check：出本群黑名单一节 + 群 ID', allSent().includes('本群黑名单（独立群）') && allSent().includes(G2), allSent());
	check('★ /check：照旧有 GKY 与本地黑名单两节', allSent().includes('GKY 封禁记录') && allSent().includes('本地黑名单'));
	const lookupLink = '"url":"https://x.com/check?tgid=' + BANNED + '"';
	check('★ /check 私聊：带跳转网页查询页的按钮', sent.some((m) => m.markup.includes(lookupLink) && m.markup.includes('网页查看完整封禁详情')), sent.map((m) => m.markup).join(' | '));
	reset();
	await send(CREATOR, '/check ' + BANNED, G2);
	check('★ /check 群内（群主有权限）：群里的回执带同一个跳转按钮', sent.some((m) => m.chatId === G2 && m.markup.includes(lookupLink)), sent.map((m) => m.chatId + ':' + m.markup).join(' | '));
	reset();
	await send('880277', '/check ' + BANNED, G2);
	check('★ /check 群内无权限：不回执、不出按钮', !sent.some((m) => m.chatId === G2), sent.map((m) => m.chatId).join(','));
	reset();
	await send(OWNER, '/check ' + CLEAN, 'private');
	check('★ /check 无本群记录：写明不在任何群的本群黑名单', allSent().includes('不在任何群的本群黑名单'), allSent());
}

console.log('\n=== 小程序 ===');
{
	const user = await W.miniAppUserQuery(env, { userId: BANNED });
	check('★ 用户查询带 groupBans', Array.isArray(user.groupBans) && user.groupBans.length === 1 && user.groupBans[0].chatId === G2 && user.groupBans[0].independent === true, JSON.stringify(user.groupBans));
	const d2 = await W.miniAppGroupDetail(env, { chatId: G2 });
	check('★ 群详情：独立群显示模式与本群设置', d2.mode === 'independent' && d2.localSettings?.action === 'kick' && d2.localSettings?.banCount === 1, JSON.stringify(d2.localSettings));
	const d1 = await W.miniAppGroupDetail(env, { chatId: G1 });
	check('★ 群详情：全局群 mode=global、不读本群设置', d1.mode === 'global' && d1.localSettings === null);
	const html = W.renderMiniAppHtml();
	check('★ 小程序前端渲染群模式与本群黑名单卡片', html.includes("'群模式'") && html.includes('本群黑名单（独立群）'));
}

console.log('\n=== /help ===');
{
	reset();
	await send(OWNER, '/help', 'private');
	const t = allSent();
	// 【改口径】/help 清空成后台入口；独立模式 /localset 用法与「域名/check」说明搬进后台命令手册。
	check('★ /help 指向网页后台', t.includes('/admin') && t.includes('/adminpass'), t.slice(0, 200));
	const page = W.renderWebAdminHtml();
	check('★ 后台命令手册有独立模式一节与 /localset 用法', page.includes('独立模式') && page.includes('处置 踢出|禁言') && page.includes('/groupmode'));
	check('★ 后台命令手册写明网页版查询入口', page.includes('域名/check'));
}

console.log(`\n合计：通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
