// 学习只限第一主人（2026-10-24 主人定）
// 主人原话：「学习规则是第一主人的权限 任何人都没权限」「无论是第一主人使用 ban spam sban 皆可学习」。
// 副主人 / 超管 / 群管理员用 /ban /spam /sban 照常封人，但一个特征都不学。
// 断言走完整命令链路（handler.fetch 发真实命令），只断言落库结果 ——
// 漏改点在调用方，只调学习函数测不出来。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const sent = [];

const GROUPS = ['-1001111111111', '-1002222222222'];
const OWNER = '10001';
const VICE = '10002';
const SUPER = '10003';
const ADMIN = '10004';

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
			result = { message_id: 8000 + sent.length };
		} else if (m === 'getChat') result = { id: Number(b?.chat_id), type: 'supergroup', title: '测试群' };
		else if (m === 'getChatMember') result = { status: 'member', user: { id: Number(b?.user_id) } };
		else if (m === 'getChatAdministrators') result = [
			{ user: { id: Number(OWNER) }, status: 'creator' },
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
		query(sql) { return db.prepare(sql).all().map(nOut); }
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

// 资料卡留空：只让缓存正文 / 引用原文产出指纹，避免昵称本身学出东西干扰判断
W.fetchAdUserProfile = async () => ({ firstName: '', lastName: '', username: '', bio: '', avatarId: '', badgeId: '' });

const AD = '进直播间当托一轮给500 详情加 @tuoguan01';
let mid = 7000;

async function sendGroup(fromId, text, reply) {
	mid += 1;
	const message = {
		message_id: mid, date: 1, text,
		chat: { id: Number(GROUPS[0]), type: 'supergroup', title: '测试群' },
		from: { id: Number(fromId), is_bot: false, first_name: 'U' + fromId }
	};
	if (reply) message.reply_to_message = reply;
	await W.__h.fetch(new Request('https://x.com/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: mid, message })
	}), env, { waitUntil() {} });
}

async function seedAd(uid) {
	mid += 1;
	await W.cacheModerationMessage(env, { message_id: mid, chat: { id: GROUPS[0] }, from: { id: uid }, text: AD });
	return { message_id: mid, chat: { id: Number(GROUPS[0]), type: 'supergroup' }, from: { id: Number(uid), is_bot: false, first_name: 'Ad' }, text: AD };
}

const fpCount = () => env.DB.query('SELECT COUNT(*) c FROM ad_fingerprints')[0].c;
const inBlacklist = (uid) => env.DB.query("SELECT id FROM blacklist WHERE id='" + uid + "'").length === 1;

const cases = [
	['副主人 /ban <id>', VICE, (uid) => '/ban ' + uid, false],
	['超管 /ban <id>', SUPER, (uid) => '/ban ' + uid, false],
	['群管理员 /ban <id>', ADMIN, (uid) => '/ban ' + uid, false],
	['副主人 /sban <id>', VICE, (uid) => '/sban ' + uid, false],
	['群管理员 /spam <id>', ADMIN, (uid) => '/spam ' + uid, false],
	['超管 引用 /spam', SUPER, () => '/spam', true],
	['群管理员 引用 /spam', ADMIN, () => '/spam', true]
];

let uidSeq = 880000;
console.log('\n=== 非第一主人：照常封，不学 ===');
for (const [label, operator, makeText, useReply] of cases) {
	env.DB.query('DELETE FROM ad_fingerprints');
	uidSeq += 1;
	const uid = String(uidSeq);
	const adMsg = await seedAd(uid);
	await sendGroup(operator, makeText(uid), useReply ? adMsg : null);
	check(label + '：前置，目标已入黑名单', inBlacklist(uid));
	check('★ ' + label + '：指纹库没有新增', fpCount() === 0, '实际 ' + fpCount());
}

console.log('\n=== 第一主人：照常学 ===');
for (const [label, makeText, useReply] of [
	['第一主人 /ban <id>', (uid) => '/ban ' + uid, false],
	['第一主人 /sban <id>', (uid) => '/sban ' + uid, false],
	['第一主人 引用 /spam', () => '/spam', true]
]) {
	env.DB.query('DELETE FROM ad_fingerprints');
	uidSeq += 1;
	const uid = String(uidSeq);
	const adMsg = await seedAd(uid);
	await sendGroup(OWNER, makeText(uid), useReply ? adMsg : null);
	check(label + '：前置，目标已入黑名单', inBlacklist(uid));
	check(label + '：指纹库有新增', fpCount() > 0, '实际 ' + fpCount());
}

console.log('\n=== 批量任务：按发起人判断 ===');
{
	env.DB.query('DELETE FROM ad_fingerprints');
	const ids = ['881001', '881002'];
	for (const id of ids) await seedAd(id);
	await W.performBulkJobD1Mutation({ action: 'ban', mode: 'human', reason: 'manual', createdBy: VICE, note: '' }, env, ids);
	check('批量：前置，目标已入黑名单', ids.every(inBlacklist));
	check('★ 副主人发起的批量：指纹库没有新增', fpCount() === 0, '实际 ' + fpCount());

	const ids2 = ['881003', '881004'];
	for (const id of ids2) await seedAd(id);
	await W.performBulkJobD1Mutation({ action: 'ban', mode: 'human', reason: 'manual', createdBy: OWNER, note: '' }, env, ids2);
	check('第一主人发起的批量：指纹库有新增', fpCount() > 0, '实际 ' + fpCount());
}

console.log('\n=== 回执：不学就不出现「已学习」 ===');
{
	sent.length = 0;
	uidSeq += 1;
	const uid = String(uidSeq);
	await seedAd(uid);
	await sendGroup(ADMIN, '/ban ' + uid);
	const all = sent.map((s) => s.text).join('\n');
	check('★ 群管理员 /ban 的所有回执里没有「已学习」', !/已学习|AI 语义样本/.test(all), all.slice(0, 300));
}

console.log('\n学习只限第一主人：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail > 0 ? 1 : 0);
