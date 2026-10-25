// /ban /sban /unban 引用回复（2026-10-24 主人定）
// 主人口径：
//   · /ban /unban：有该命令权限的人都能引用；/sban 引用只给第一主人。
//   · 带了 TGID 按 TGID；没带才看引用。引用的是机器人 / 频道 / 匿名管理员 → 「无法从这条消息识别用户」。
//   · /ban /sban 引用时撤回被引用的消息，并把 ChatID / MsgID / 原文存进附表。
//   · /check /spam 及其余原有引用用法一律不动。
// 断言走完整命令链路（handler.fetch 发真实命令），只断言落库与 Telegram 调用。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
const sent = [];
const deleted = [];
const unbanned = [];

const GROUPS = ['-1001111111111', '-1002222222222'];
const OWNER = '10001';
const VICE = '10002';
const ADMIN = '10004';
const CREATOR = '10005';
const MEMBER = '10009';
const ANON = '1087968824';

const sandbox = {
	console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		let result = true;
		if (m === 'sendMessage') {
			sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || '') });
			result = { message_id: 9000 + sent.length };
		} else if (m === 'deleteMessage') deleted.push({ chatId: String(b?.chat_id ?? ''), mid: Number(b?.message_id) });
		else if (m === 'unbanChatMember') unbanned.push(String(b?.user_id));
		else if (m === 'getChat') result = { id: Number(b?.chat_id), type: 'supergroup', title: '测试群' };
		else if (m === 'getChatMember') result = { status: 'member', user: { id: Number(b?.user_id) } };
		else if (m === 'getChatAdministrators') result = [
			{ user: { id: Number(CREATOR) }, status: 'creator' },
			{ user: { id: Number(ADMIN) }, status: 'administrator' }
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
	else { fail += 1; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
}

const env = {
	TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUPS.join(','),
	OWNER_IDS: OWNER + ',' + VICE, DB: makeD1()
};
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });
await W.adDetectionReady(env);
W.fetchAdUserProfile = async () => ({ firstName: '', lastName: '', username: '', bio: '', avatarId: '', badgeId: '' });

const AD = '进直播间当托一轮给500 详情加 @tuoguan01';
let mid = 7000;

async function send(fromId, text, reply, extra = {}) {
	mid += 1;
	const message = {
		message_id: mid, date: 1, text,
		chat: { id: Number(GROUPS[0]), type: 'supergroup', title: '测试群', is_forum: extra.forum === true },
		from: { id: Number(fromId), is_bot: false, first_name: 'U' + fromId },
		...extra.fields
	};
	if (reply) message.reply_to_message = reply;
	await W.__h.fetch(new Request('https://x.com/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: mid, message })
	}), env, { waitUntil() {} });
}

function userMsg(uid, text = AD, extra = {}) {
	mid += 1;
	return { message_id: mid, date: 1, chat: { id: Number(GROUPS[0]), type: 'supergroup' }, from: { id: Number(uid), is_bot: false, first_name: 'Ad' }, text, ...extra };
}

const inBlacklist = (uid) => env.DB.query("SELECT id FROM blacklist WHERE id='" + uid + "'").length === 1;
const blRow = (uid) => env.DB.query("SELECT * FROM blacklist WHERE id='" + uid + "'")[0] || null;
const detailRow = (uid) => env.DB.query("SELECT * FROM blacklist_detail WHERE id='" + uid + "'")[0] || null;
const blCount = () => env.DB.query('SELECT COUNT(*) c FROM blacklist')[0].c;
const allSent = () => sent.map((s) => s.text).join('\n');
const reset = () => { sent.length = 0; deleted.length = 0; unbanned.length = 0; };
let seq = 660000;
const nextUid = () => String(++seq);
const NOT_RECOGNIZED = '无法从这条消息识别用户';

console.log('\n=== /ban 引用：有权限的人都能用 ===');
for (const [label, operator] of [['群管理员', ADMIN], ['副主人', VICE], ['第一主人', OWNER]]) {
	reset();
	const uid = nextUid();
	const ad = userMsg(uid);
	await send(operator, '/ban', ad);
	check('★ ' + label + ' 引用 /ban：被引用者入黑名单', inBlacklist(uid));
	check('★ ' + label + ' 引用 /ban：撤回被引用的消息', deleted.some((d) => d.mid === ad.message_id && d.chatId === GROUPS[0]), JSON.stringify(deleted));
	const d = detailRow(uid);
	check('★ ' + label + ' 引用 /ban：附表 MsgID = 被引用消息', Number(d?.msg_id) === ad.message_id, '实际 ' + d?.msg_id);
	check('★ ' + label + ' 引用 /ban：附表存了原文', String(d?.text || '').includes('进直播间当托'), '实际 ' + d?.text);
	check('★ ' + label + ' 引用 /ban：附表 ChatID = 当前群', String(d?.chat_id) === GROUPS[0], '实际 ' + d?.chat_id);
}

console.log('\n=== /ban 引用 + 原因 ===');
{
	reset();
	const uid = nextUid();
	await send(ADMIN, '/ban 发广告引流', userMsg(uid));
	check('★ 引用 + 文字原因：被引用者入黑名单', inBlacklist(uid));
	check('★ 引用 + 文字原因：原因写进 note', String(blRow(uid)?.note || '') === '发广告引流', '实际 ' + blRow(uid)?.note);
}

console.log('\n=== 带了 TGID 就按 TGID ===');
{
	reset();
	const replied = nextUid();
	const byId = nextUid();
	await send(ADMIN, '/ban ' + byId, userMsg(replied));
	check('★ /ban TGID + 引用：按 TGID 封', inBlacklist(byId));
	check('★ /ban TGID + 引用：被引用者不受影响', !inBlacklist(replied));
}

console.log('\n=== 引用无法识别的消息 ===');
for (const [label, msg] of [
	['机器人', { message_id: 1, chat: { id: Number(GROUPS[0]), type: 'supergroup' }, from: { id: 55501, is_bot: true, first_name: 'SomeBot' }, text: 'hi' }],
	['频道', { message_id: 2, chat: { id: Number(GROUPS[0]), type: 'supergroup' }, from: { id: 136817688, is_bot: true, first_name: 'Channel' }, sender_chat: { id: -1009999999999, type: 'channel' }, text: 'hi' }],
	['匿名管理员', { message_id: 3, chat: { id: Number(GROUPS[0]), type: 'supergroup' }, from: { id: Number(ANON), is_bot: true, first_name: 'Group' }, sender_chat: { id: Number(GROUPS[0]), type: 'supergroup' }, text: 'hi' }],
	['Telegram 服务号', { message_id: 4, chat: { id: Number(GROUPS[0]), type: 'supergroup' }, from: { id: 777000, is_bot: false, first_name: 'Telegram' }, text: 'hi' }]
]) {
	for (const cmd of ['/ban', '/unban']) {
		reset();
		const before = blCount();
		await send(ADMIN, cmd, msg);
		check('★ ' + cmd + ' 引用' + label + '：提示「' + NOT_RECOGNIZED + '」', allSent().includes(NOT_RECOGNIZED), allSent().slice(0, 200));
		check('★ ' + cmd + ' 引用' + label + '：黑名单不变', blCount() === before);
	}
}

console.log('\n=== 话题群：话题创建消息不算引用 ===');
{
	reset();
	const before = blCount();
	const topicRoot = { message_id: 50, chat: { id: Number(GROUPS[0]), type: 'supergroup' }, from: { id: Number(MEMBER), is_bot: false, first_name: 'M' }, forum_topic_created: { name: 't', icon_color: 1 } };
	await send(ADMIN, '/ban', topicRoot, { forum: true, fields: { is_topic_message: true, message_thread_id: 50 } });
	check('★ 话题内裸 /ban：不封话题创建者', !inBlacklist(MEMBER) && blCount() === before);
	check('★ 话题内裸 /ban：仍回使用说明', allSent().includes('使用方法'), allSent().slice(0, 200));
}

console.log('\n=== /sban 引用只给第一主人 ===');
for (const [label, operator] of [['副主人', VICE], ['群主', CREATOR]]) {
	reset();
	const uid = nextUid();
	const ad = userMsg(uid);
	await send(operator, '/sban', ad);
	check('★ ' + label + ' 引用 /sban：不加黑', !inBlacklist(uid));
	check('★ ' + label + ' 引用 /sban：不撤回被引用消息', !deleted.some((d) => d.mid === ad.message_id));
	check('★ ' + label + ' 引用 /sban：提示仅限第一主人', allSent().includes('仅限第一主人'), allSent().slice(0, 200));
}
{
	reset();
	const uid = nextUid();
	await send(VICE, '/sban ' + uid);
	check('副主人 /sban TGID：原有用法不受影响', inBlacklist(uid));
}
{
	reset();
	const uid = nextUid();
	const ad = userMsg(uid);
	await send(OWNER, '/sban', ad);
	check('★ 第一主人 引用 /sban：入黑名单', inBlacklist(uid));
	check('★ 第一主人 引用 /sban：撤回被引用的消息', deleted.some((d) => d.mid === ad.message_id));
	check('★ 第一主人 引用 /sban：附表 MsgID', Number(detailRow(uid)?.msg_id) === ad.message_id, '实际 ' + detailRow(uid)?.msg_id);
}

console.log('\n=== /unban 引用：有权限的人都能用 ===');
{
	reset();
	const uid = nextUid();
	// 由副主人封：第一主人封的只有第一主人能解（锁定见 test_group_independent）
	await send(VICE, '/ban ' + uid);
	check('前置：已入黑名单', inBlacklist(uid));
	reset();
	await send(ADMIN, '/unban', userMsg(uid, '我是被误封的'));
	check('★ 群管理员 引用 /unban：移出黑名单', !inBlacklist(uid));
	check('★ 群管理员 引用 /unban：调用了 Telegram 解封', unbanned.includes(uid), JSON.stringify(unbanned));
}
{
	reset();
	const uid = nextUid();
	await send(OWNER, '/ban ' + uid);
	reset();
	await send(MEMBER, '/unban', userMsg(uid, '帮他解'));
	check('★ 普通成员 引用 /unban：黑名单不变（无权限）', inBlacklist(uid));
	check('★ 普通成员 引用 /unban：不调 Telegram 解封', !unbanned.includes(uid));
}

console.log('\n=== 原有用法不受影响 ===');
{
	reset();
	const uid = nextUid();
	await send(MEMBER, '/ban', userMsg(uid));
	check('普通成员 引用 /ban：无权限，不加黑', !inBlacklist(uid));
	reset();
	await send(ADMIN, '/ban');
	check('群管理员 裸 /ban 无引用：回使用说明', allSent().includes('使用方法'), allSent().slice(0, 200));
	const uid2 = nextUid();
	await send(ADMIN, '/spam', userMsg(uid2));
	check('/spam 引用：照旧加黑', inBlacklist(uid2));
}

console.log('\n引用 /ban /sban /unban：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail > 0 ? 1 : 0);
