// 加黑附表 blacklist_detail（2026-10-24 主人定，公开查询完整原因的数据来源）
// 主人原话：「旧记录一概不管。 全部以新来开始实行。」—— 从这次起，每次加黑都在
// 那一刻把「谁封的（身份）、在哪个群、哪条消息、消息原文、逐条判据」存下来，
// 公开查询页 /{TGID} 直接读这张表，不再事后去猜。
// 断言走完整命令链路（handler.fetch 发真实命令），只断言落库结果。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');

const GROUPS = ['-1001111111111', '-1002222222222'];
const OWNER = '10001';
const VICE = '10002';
const SUPER = '10003';
const ADMIN = '10004';
const CREATOR = '10005';
const ANON = '1087968824';

const sentMarkups = [];
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
			result = { message_id: 9000 };
			if (b?.reply_markup) sentMarkups.push(JSON.stringify(b.reply_markup));
		}
		else if (m === 'getChat') result = { id: Number(b?.chat_id), type: 'supergroup', title: '测试群' };
		else if (m === 'getChatMember') result = { status: 'member', user: { id: Number(b?.user_id) } };
		else if (m === 'getChatAdministrators') result = [
			{ user: { id: Number(CREATOR), username: 'creator_demo' }, status: 'creator' },
			{ user: { id: Number(ADMIN), username: 'admin_demo' }, status: 'administrator' }
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
	OWNER_IDS: OWNER + ',' + VICE, SUPER_ADMIN_IDS: SUPER, DB: makeD1()
};
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });
await W.adDetectionReady(env);
W.fetchAdUserProfile = async () => ({ firstName: '', lastName: '', username: '', bio: '', avatarId: '', badgeId: '' });

const AD = '进直播间当托一轮给500 详情加 @tuoguan01';
let mid = 7000;

async function send(fromId, text, opts = {}) {
	mid += 1;
	const isPrivate = opts.private === true;
	const message = {
		message_id: mid, date: 1, text,
		chat: isPrivate
			? { id: Number(fromId), type: 'private', first_name: 'P' }
			: { id: Number(GROUPS[0]), type: 'supergroup', title: '测试群' },
		from: { id: Number(fromId), is_bot: fromId === ANON, first_name: 'U' + fromId, username: opts.username }
	};
	if (opts.anon) message.sender_chat = { id: Number(GROUPS[0]), type: 'supergroup', title: '测试群' };
	if (opts.reply) message.reply_to_message = opts.reply;
	await W.__h.fetch(new Request('https://x.com/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: mid, message })
	}), env, { waitUntil() {} });
}

// 超管群内 /ban /spam 先弹范围按钮（独立模式口径），点「② 全域」才写主黑名单与附表
async function clickSuperGlobalButton(fromId) {
	const data = [...sentMarkups.join('\n').matchAll(/"callback_data":"(gmsa:G:[^"]+)"/g)].map((x) => x[1]).pop();
	mid += 1;
	await W.__h.fetch(new Request('https://x.com/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: mid, callback_query: {
			id: 'cb' + mid, data, from: { id: Number(fromId), is_bot: false, first_name: 'U' + fromId },
			message: { message_id: 9000, chat: { id: Number(GROUPS[0]), type: 'supergroup', title: '测试群' } }
		} })
	}), env, { waitUntil() {} });
	return data;
}

function adMessage(uid) {
	mid += 1;
	return { message_id: mid, date: 1, chat: { id: Number(GROUPS[0]), type: 'supergroup' }, from: { id: Number(uid), is_bot: false, first_name: 'Ad' }, text: AD };
}

const row = (uid) => env.DB.query("SELECT * FROM blacklist_detail WHERE id='" + uid + "'")[0] || null;
const inBlacklist = (uid) => env.DB.query("SELECT id FROM blacklist WHERE id='" + uid + "'").length === 1;
let seq = 770000;
const nextUid = () => String(++seq);

console.log('\n=== 身份：封禁那一刻存下来 ===');
for (const [label, operator, opts, role] of [
	['第一主人 群内 /ban', OWNER, { username: 'owner_demo' }, 'primary_owner'],
	['副主人 群内 /ban', VICE, {}, 'secondary_owner'],
	['超管 群内 /ban', SUPER, {}, 'super_admin'],
	['群主 群内 /ban', CREATOR, { username: 'creator_demo' }, 'group_creator'],
	['群管理员 群内 /ban', ADMIN, { username: 'admin_demo' }, 'group_admin'],
	['匿名管理员 群内 /ban', ANON, { anon: true }, 'anonymous_admin']
]) {
	const uid = nextUid();
	await send(operator, '/ban ' + uid + ' 发广告', opts);
	if (operator === SUPER) {
		check('超管 群内 /ban：点按钮前不写黑名单', !inBlacklist(uid));
		check('超管 群内 /ban：弹出了「② 全域」按钮', !!(await clickSuperGlobalButton(SUPER)));
	}
	const r = row(uid);
	check(label + '：前置，已入黑名单', inBlacklist(uid));
	check('★ ' + label + '：附表有这一行', !!r);
	check('★ ' + label + '：身份 = ' + role, r?.operator_role === role, '实际 ' + r?.operator_role);
	check('★ ' + label + '：ChatID = 当前群', String(r?.chat_id) === GROUPS[0], '实际 ' + r?.chat_id);
	if (opts.username) check('★ ' + label + '：用户名已存', r?.operator_username === opts.username, '实际 ' + r?.operator_username);
	if (operator === ANON) check('★ 匿名管理员：不存用户名', !r?.operator_username, '实际 ' + r?.operator_username);
}

console.log('\n=== 私聊：不存私聊 chat id ===');
{
	const uid = nextUid();
	await send(VICE, '/ban ' + uid, { private: true });
	const r = row(uid);
	check('★ 副主人私聊 /ban：身份 secondary_owner', r?.operator_role === 'secondary_owner', '实际 ' + r?.operator_role);
	check('★ 私聊：ChatID 留空（私聊 id 就是操作人 TGID，不能存）', r && !r.chat_id, '实际 ' + r?.chat_id);
}

console.log('\n=== 引用 /spam：MsgID 与原文 ===');
{
	const uid = nextUid();
	const ad = adMessage(uid);
	await send(ADMIN, '/spam', { reply: ad, username: 'admin_demo' });
	const r = row(uid);
	check('前置：已入黑名单', inBlacklist(uid));
	check('★ 引用 /spam：MsgID = 被引用消息', Number(r?.msg_id) === ad.message_id, '实际 ' + r?.msg_id);
	check('★ 引用 /spam：原文已存', String(r?.text || '').includes('进直播间当托'), '实际 ' + r?.text);
	check('★ 引用 /spam：身份 group_admin', r?.operator_role === 'group_admin', '实际 ' + r?.operator_role);
}

console.log('\n=== 批量（多行 INSERT 那条路）===');
{
	const a = nextUid();
	const b = nextUid();
	await send(SUPER, '/ban ' + a + ',' + b + ' 批量');
	await clickSuperGlobalButton(SUPER);
	check('前置：两个都入黑名单', inBlacklist(a) && inBlacklist(b));
	check('★ 批量：两行附表都在', !!row(a) && !!row(b));
	check('★ 批量：身份 super_admin', row(a)?.operator_role === 'super_admin' && row(b)?.operator_role === 'super_admin', '实际 ' + row(a)?.operator_role);
	check('★ 批量：ChatID = 当前群', String(row(a)?.chat_id) === GROUPS[0], '实际 ' + row(a)?.chat_id);
}

console.log('\n=== 批量任务队列：按任务里存的身份写 ===');
{
	const ids = [nextUid(), nextUid()];
	await W.performBulkJobD1Mutation({ action: 'ban', mode: 'human', reason: 'manual', createdBy: CREATOR, blacklistOperatorRole: 'group_creator', blacklistOperatorUsername: 'creator_demo', sourceChatId: GROUPS[1], note: '' }, env, ids);
	check('★ 队列：身份 group_creator', row(ids[0])?.operator_role === 'group_creator', '实际 ' + row(ids[0])?.operator_role);
	check('★ 队列：ChatID = 发起群', String(row(ids[0])?.chat_id) === GROUPS[1], '实际 ' + row(ids[0])?.chat_id);
}

console.log('\n=== 自动判定：system + 逐条判据 ===');
{
	const uid = nextUid();
	await W.addToBlacklist(uid, env, {
		reason: 'ad_auto', by: 'system', note: '广告自动判定',
		detail: { chatId: GROUPS[0], msgId: 555, text: AD, reasons: ['命中指纹 +5', '私有邀请链接 +3'] }
	});
	const r = row(uid);
	check('★ 自动：身份 system', r?.operator_role === 'system', '实际 ' + r?.operator_role);
	check('★ 自动：逐条判据已存', String(r?.detail || '').includes('命中指纹 +5') && String(r?.detail || '').includes('私有邀请链接 +3'), '实际 ' + r?.detail);
	check('★ 自动：MsgID 555', Number(r?.msg_id) === 555, '实际 ' + r?.msg_id);
}

console.log('\n=== 已在黑名单：不覆盖第一次的记录；解封后再封：覆盖 ===');
{
	const uid = nextUid();
	await send(OWNER, '/ban ' + uid);
	await send(ADMIN, '/ban ' + uid);
	check('★ 重复 /ban：仍是第一次的身份 primary_owner', row(uid)?.operator_role === 'primary_owner', '实际 ' + row(uid)?.operator_role);
	await W.removeFromBlacklist(uid, env);
	await send(ADMIN, '/ban ' + uid);
	check('★ 解封后再封：身份更新为 group_admin', row(uid)?.operator_role === 'group_admin', '实际 ' + row(uid)?.operator_role);
}

console.log('\n=== 附表写失败不影响加黑 ===');
{
	const uid = nextUid();
	const realPrepare = env.DB.prepare;
	env.DB.prepare = (sql) => {
		if (/blacklist_detail/.test(sql)) throw new Error('模拟附表故障');
		return realPrepare(sql);
	};
	const r = await W.addToBlacklist(uid, env, { reason: 'manual', by: OWNER });
	env.DB.prepare = realPrepare;
	check('★ 附表故障：加黑照样成功', r?.success === true && inBlacklist(uid), JSON.stringify(r));
}

console.log('\n加黑附表：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail > 0 ? 1 : 0);
