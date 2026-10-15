// 配置群管理员豁免 · 离线端到端测试
// 与 test_whitelist.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite。运行：node test_group_admin.mjs
//
// 主人口径（2026-10-15）：在【任意一个】配置群是管理员或群主的人，在任何配置群里
// 都不进广告检测链 —— 包括他在别的配置群只是普通成员的时候。
//
// 【为什么不能只靠实时 API】原来的 isAdminInAnyConfiguredGroup 是「定罪那一刻」
// 遍历全部群现查：热路径用不了（每条消息十几个请求），且 429 时返回 false，
// 豁免会静默失效。改进后热路径查 D1 表（零 Telegram 请求、不依赖运行时 API），
// 表由 chat_member 事件即时同步、cron（12 小时一次）全量兜底。

import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');

function stripExportDefault(source) {
	const start = source.indexOf('export default');
	const braceStart = source.indexOf('{', start);
	let depth = 0, i = braceStart;
	for (; i < source.length; i++) {
		if (source[i] === '{') depth += 1;
		else if (source[i] === '}') { depth -= 1; if (depth === 0) { i += 1; break; } }
	}
	if (source[i] === ';') i += 1;
	return source.slice(0, start) + 'globalThis.__handler = ' + source.slice(start + 'export default'.length, i) + ';' + source.slice(i);
}

function makeD1() {
	const db = new DatabaseSync(':memory:');
	const sqlLog = [];
	const nIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const nOut = (r) => { if (!r) return null; const o = {}; for (const k of Object.keys(r)) o[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k]; return o; };
	const exec = (sql, params = []) => {
		sqlLog.push(String(sql).replace(/\s+/g, ' ').trim());
		const st = db.prepare(sql);
		const bd = params.map(nIn);
		const up = sql.trim().slice(0, 6).toUpperCase();
		if (up === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		const i = st.run(...bd);
		return { kind: 'run', results: [{ success: true, meta: { changes: i.changes } }], meta: { changes: i.changes } };
	};
	const mk = (sql) => {
		const s = { sql, params: [] };
		const a = {
			bind(...x) { s.params = x; return a; },
			async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
			async run() { return exec(s.sql, s.params); },
			async all() { const r = exec(s.sql, s.params); return { results: r.rows || [], success: true }; }
		};
		return a;
	};
	return {
		prepare: mk,
		async exec(sql) { for (const p of String(sql).split(';')) { const s = p.trim(); if (s) db.exec(s); } return { count: 1 }; },
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; },
		query(sql) { return db.prepare(sql).all().map(nOut); },
		_sql: sqlLog
	};
}

let pass = 0, fail = 0;
const failures = [];
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log('  OK   ' + name); }
	else { fail += 1; failures.push(name); console.log('  FAIL ' + name + (detail ? ' — ' + String(detail).slice(0, 400) : '')); }
}
function section(title) { console.log('\n' + title); }

const calls = [];
let apiHandlers = {};
function setApi(next = {}) { apiHandlers = next; }
function resetCalls() { calls.length = 0; setApi(); }
function callsOf(method) { return calls.filter((c) => c.method === method); }

const GROUP_A = '-1001111111111';
const GROUP_B = '-1002222222222';
const OWNER_ID = 10001;
// 各群的 Telegram 管理员名单（mock 的 getChatAdministrators 按群返回不同的人）
let PER_GROUP_ADMINS = {
	[GROUP_A]: [
		{ status: 'creator', user: { id: 9001, first_name: 'A群主' } },
		{ status: 'administrator', user: { id: 9002, first_name: 'A管理' } }
	],
	[GROUP_B]: [
		{ status: 'administrator', user: { id: 5001, first_name: 'B管理' } }
	]
};
let ADMIN_API_OK = true;

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777001, is_bot: true, username: 'GaTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 8100 + calls.length } };
		case 'getChat': return { ok: true, result: { id: body?.chat_id, first_name: 'X', bio: '' } };
		case 'getChatMember': return { ok: true, result: { status: 'member', user: { id: body?.user_id } } };
		case 'getChatAdministrators':
			if (!ADMIN_API_OK) return { ok: false, error_code: 429, description: 'Too Many Requests: retry later' };
			return { ok: true, result: PER_GROUP_ADMINS[String(body?.chat_id)] || [] };
		default: return { ok: true, result: true };
	}
}

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout, AbortController, AbortSignal,
	fetch: async (url, init) => {
		const method = String(url).split('/').pop();
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
		calls.push({ method, body });
		const handler = apiHandlers[method];
		const mock = handler ? handler(body) : null;
		const payload = mock?.payload || mock || defaultPayload(method, body);
		return {
			ok: mock?.httpOk ?? true,
			status: mock?.status ?? 200,
			async json() { return payload; },
			async text() { return JSON.stringify(payload); }
		};
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });
const W = sandbox;

function makeEnv(extra = {}) {
	return {
		TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake',
		GROUP_ID: GROUP_A + ',' + GROUP_B, OWNER_IDS: String(OWNER_ID),
		DB: makeD1(), ...extra
	};
}
async function sendUpdate(update, env) {
	return W.__handler.fetch(new Request('https://example.workers.dev/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update)
	}), env, { waitUntil() {} });
}
function groupMessage(from, text, chatId = GROUP_A) {
	return {
		message_id: 300 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000), text,
		chat: { id: Number(chatId), type: 'supergroup', title: '测试配置群' },
		from: { is_bot: false, ...from }
	};
}
const send = (msg, env) => sendUpdate({ message: msg }, env);
function chatMemberUpdate(chatId, userId, oldStatus, newStatus) {
	return {
		update_id: 900 + Math.floor(Math.random() * 1000),
		chat_member: {
			chat: { id: Number(chatId), type: 'supergroup', title: '测试配置群' },
			from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' },
			old_chat_member: { status: oldStatus, user: { id: userId, is_bot: false, first_name: 'X' } },
			new_chat_member: { status: newStatus, user: { id: userId, is_bot: false, first_name: 'X' } }
		}
	};
}

// 一条已被既有测试验证过「触发全群封禁」的广告文案。
const AD_TEXT = '📢 高价收网赚号 长期收购账号 加微信联系';

const bootEnv = makeEnv();
resetCalls();
await send({ message_id: 1, date: 1, text: 'hello', chat: { id: 99999, type: 'private' }, from: { id: 99999, is_bot: false, first_name: 'x' } }, bootEnv);

// ================= [1] 表与写入 =================
section('[1] ad_group_admins 表与单条写入');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const hasTable = env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ad_group_admins'");
	assert('ad_group_admins 表已建出', hasTable.length === 1, JSON.stringify(hasTable));

	await W.upsertAdGroupAdmin(env, '5001', GROUP_B, 'administrator');
	const rows = env.DB.query('SELECT * FROM ad_group_admins');
	assert('写入一行', rows.length === 1 && String(rows[0].user_id) === '5001', JSON.stringify(rows));
	assert('记下所属群与状态', String(rows[0].chat_id) === GROUP_B && String(rows[0].status) === 'administrator', JSON.stringify(rows[0]));

	// 同一个人可以在多个群都是管理员 —— 复合主键 (user_id, chat_id) 必须容得下，
	// 否则「在 A 群撤职」会连带删掉「在 B 群仍是管理员」的记录。
	await W.upsertAdGroupAdmin(env, '5001', GROUP_A, 'creator');
	assert('同一个人可在多个群各占一行', env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='5001'").length === 2,
		JSON.stringify(env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='5001'")));

	// 重复写同一 (人, 群) 不新增行，只更新状态
	await W.upsertAdGroupAdmin(env, '5001', GROUP_B, 'creator');
	const dup = env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='5001' AND chat_id='" + GROUP_B + "'");
	assert('同一 (人,群) 重复写不新增行、更新状态',
		env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='5001'").length === 2 && String(dup[0].status) === 'creator',
		JSON.stringify(dup));

	// 只删指定的那一群，不碰别的群
	await W.removeAdGroupAdmin(env, '5001', GROUP_B);
	const left = env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='5001'");
	assert('删单群只删那一行（另一群的管理员身份不受影响）',
		left.length === 1 && String(left[0].chat_id) === GROUP_A, JSON.stringify(left));
}

// ================= [2] cron 全量同步 =================
section('[2] syncAdGroupAdmins 全量同步与撤职清理');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	await W.syncAdGroupAdmins(env);
	const ids = env.DB.query('SELECT user_id, chat_id FROM ad_group_admins ORDER BY user_id').map((r) => String(r.user_id) + '@' + String(r.chat_id));
	assert('两个群的管理员都进表（含群主）',
		ids.includes('9001@' + GROUP_A) && ids.includes('9002@' + GROUP_A) && ids.includes('5001@' + GROUP_B),
		JSON.stringify(ids));

	// 撤职：把 B 群管理员换人，再同步一次
	PER_GROUP_ADMINS = {
		[GROUP_A]: [
			{ status: 'creator', user: { id: 9001, first_name: 'A群主' } },
			{ status: 'administrator', user: { id: 9002, first_name: 'A管理' } }
		],
		[GROUP_B]: [{ status: 'administrator', user: { id: 6001, first_name: '新B管理' } }]
	};
	await W.syncAdGroupAdmins(env);
	const after = env.DB.query('SELECT user_id FROM ad_group_admins').map((r) => String(r.user_id));
	assert('撤职的人被清出表', !after.includes('5001'), JSON.stringify(after));
	assert('新上任的人进表', after.includes('6001'), JSON.stringify(after));
	assert('A 群的人一个没动', after.includes('9001') && after.includes('9002'), JSON.stringify(after));

	// 【关键保护】某个群查询失败时，绝不能把这批人清空 ——
	// 那会让全群管理员在 12 小时内失去豁免，比不更新危险得多。
	PER_GROUP_ADMINS = { [GROUP_A]: [], [GROUP_B]: [] };
	ADMIN_API_OK = false;
	await W.syncAdGroupAdmins(env);
	const kept = env.DB.query('SELECT user_id FROM ad_group_admins').map((r) => String(r.user_id));
	assert('★ API 失败时不清空该群管理员（宁可留旧数据也不误伤）',
		kept.includes('9001') && kept.includes('9002'), JSON.stringify(kept));
	ADMIN_API_OK = true;
}

// ================= [3] chat_member 事件同步 =================
section('[3] 提升/撤职由事件即时同步');
{
	const env = makeEnv();
	await W.adDetectionReady(env);

	resetCalls();
	await sendUpdate(chatMemberUpdate(GROUP_B, 7001, 'member', 'administrator'), env);
	const promoted = env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='7001'");
	assert('★ 群里刚提为管理员 → 立即进表', promoted.length === 1 && String(promoted[0].status) === 'administrator',
		JSON.stringify(promoted));

	resetCalls();
	await sendUpdate(chatMemberUpdate(GROUP_B, 7002, 'member', 'creator'), env);
	assert('★ 升为群主也进表',
		env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='7002'").length === 1,
		JSON.stringify(env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='7002'")));

	resetCalls();
	await sendUpdate(chatMemberUpdate(GROUP_B, 7001, 'administrator', 'member'), env);
	assert('★ 撤职 → 立即出表（恢复检测）',
		env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='7001'").length === 0,
		JSON.stringify(env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='7001'")));

	// 普通成员的状态变更（member → restricted 等）不该往表里写任何东西
	const before = env.DB.query('SELECT COUNT(*) c FROM ad_group_admins')[0].c;
	resetCalls();
	await sendUpdate(chatMemberUpdate(GROUP_B, 7003, 'member', 'restricted'), env);
	assert('普通成员状态变更不写表',
		env.DB.query('SELECT COUNT(*) c FROM ad_group_admins')[0].c === before,
		String(env.DB.query('SELECT COUNT(*) c FROM ad_group_admins')[0].c));

	// 非配置群的提权不该进表（只认配置群的管理员）
	resetCalls();
	await sendUpdate(chatMemberUpdate('-1009999999999', 7004, 'member', 'administrator'), env);
	assert('非配置群的提权不进表',
		env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='7004'").length === 0);
}

// ================= [4] 热路径判断 =================
section('[4] isConfiguredGroupAdmin 走表，零 Telegram 请求');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	await W.upsertAdGroupAdmin(env, '5001', GROUP_B, 'administrator');

	resetCalls();
	assert('表里的人 → true', (await W.isConfiguredGroupAdmin(env, '5001')) === true);
	assert('表外的人 → false', (await W.isConfiguredGroupAdmin(env, '12345')) === false);
	assert('★ 判断一个零 Telegram 请求都不发', callsOf('getChatAdministrators').length === 0,
		JSON.stringify(callsOf('getChatAdministrators').map((c) => c.body?.chat_id)));

	// 缓存：第二次判断不再打 D1（同一 env.DB 的 WeakMap 缓存）
	const sqlBefore = env.DB._sql.length;
	await W.isConfiguredGroupAdmin(env, '5001');
	assert('★ 第二次判断走缓存（零 D1 读）', env.DB._sql.length === sqlBefore,
		'新增 ' + (env.DB._sql.length - sqlBefore) + ' 条 SQL');
}

// ================= [5] 端到端：跨群管理员不进检测链 =================
section('[5] 端到端：在另一群当管理员的人，发广告不进检测');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	// 5001 是 GROUP_B 的管理员，现在他在 GROUP_A（他不是管理员）发广告
	await W.upsertAdGroupAdmin(env, '5001', GROUP_B, 'administrator');

	resetCalls();
	await send(groupMessage({ id: 5001, first_name: 'B群管理员' }, AD_TEXT, GROUP_A), env);
	assert('★ 不封禁', callsOf('banChatMember').length === 0,
		JSON.stringify(callsOf('banChatMember').map((c) => c.body)));
	assert('★ 不进名册（豁免发生在写名册之前）',
		env.DB.query("SELECT * FROM ad_group_members WHERE user_id='5001'").length === 0,
		JSON.stringify(env.DB.query("SELECT * FROM ad_group_members WHERE user_id='5001'")));
	assert('★ 不花 getChat', callsOf('getChat').length === 0, JSON.stringify(callsOf('getChat').length));
	assert('★ 不产生待确认快照（不进观察窗口）',
		env.DB.query('SELECT COUNT(*) c FROM ad_pending_snapshots')[0].c === 0,
		String(env.DB.query('SELECT COUNT(*) c FROM ad_pending_snapshots')[0].c));

	// 对照组：同一句话、同一个群，换成一个普通用户 —— 必须照常处置，
	// 否则「管理员豁免」就变成了「谁都不封」。
	const env2 = makeEnv();
	await W.adDetectionReady(env2);
	resetCalls();
	await send(groupMessage({ id: 8001, first_name: '路人甲' }, AD_TEXT, GROUP_A), env2);
	const handled = callsOf('banChatMember').length > 0
		|| env2.DB.query("SELECT * FROM ad_group_members WHERE user_id='8001'").length > 0;
	assert('★ 对照组：普通用户发同一句话照常进检测链', handled,
		JSON.stringify({ ban: callsOf('banChatMember').length, member: env2.DB.query("SELECT * FROM ad_group_members WHERE user_id='8001'").length }));
}

// ================= [6] 撤职后立刻恢复检测 =================
section('[6] 撤职 → 下一句立刻恢复检测');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	await W.upsertAdGroupAdmin(env, '5001', GROUP_B, 'administrator');

	resetCalls();
	await sendUpdate(chatMemberUpdate(GROUP_B, 5001, 'administrator', 'member'), env);
	assert('撤职事件后表里没有他了',
		env.DB.query("SELECT * FROM ad_group_admins WHERE user_id='5001'").length === 0);

	resetCalls();
	await send(groupMessage({ id: 5001, first_name: '刚被撤职' }, AD_TEXT, GROUP_A), env);
	const back = callsOf('banChatMember').length > 0
		|| env.DB.query("SELECT * FROM ad_group_members WHERE user_id='5001'").length > 0;
	assert('★ 撤职后恢复检测（同一个人、同一句话，不再豁免）', back,
		JSON.stringify({ ban: callsOf('banChatMember').length, member: env.DB.query("SELECT * FROM ad_group_members WHERE user_id='5001'").length }));
}

// ================= [7] 源码接线守卫 =================
section('[7] 源码接线：入口豁免与同步都挂上了');
{
	assert('入口把「任意配置群管理员」接进豁免链',
		/if \(await isConfiguredGroupAdmin\(env, userId\)\) return false;/.test(src),
		(src.match(/isConfiguredGroupAdmin\(env[^)]*\)/) || ['未找到'])[0]);
	assert('cron 里调了全量同步',
		src.includes('syncAdGroupAdmins(env)'),
		'syncAdGroupAdmins 应出现在 cron');
	assert('chat_member 事件里接了单条同步（增与删都要）',
		src.includes('upsertAdGroupAdmin(env,') && src.includes('removeAdGroupAdmin(env,'),
		'事件同步接线');
	assert('热路径判断不碰 Telegram',
		!/async function isConfiguredGroupAdmin[\s\S]{0,600}getChatAdministrators/.test(src),
		'isConfiguredGroupAdmin 内不应出现 getChatAdministrators');
}

console.log(`\n========== ${pass} 通过 / ${fail} 失败 ==========`);
if (failures.length) console.log('失败项：\n  - ' + failures.join('\n  - '));
process.exit(fail ? 1 : 0);
