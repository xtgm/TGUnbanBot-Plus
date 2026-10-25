// 群内 /delgroup = 停止治理 + 自动退出机器人 · 离线测试。
//
// 主人原话（2026-10-22）：「动态群组如果要撤走全部权限。可以通过当前群组发送
// /delgroup 停止治理该群并且自动退出 bot」。
//
// 这条改动放开了一道原本强制私聊的闸门，所以测试重点不是「能不能删」，而是
// 「群内这条捷径会不会误伤」——三件事必须一条都不破：
//   ① 群内带别的群 ID 时，绝不能停那个群的治理、更不能退那个群；
//   ② 环境变量群（GROUP_ID / 杀手群 / 搜索群）在群内发，绝不能退 ——
//      Worker 写不了自己的环境变量，主群这样退掉就再也加不回来；
//   ③ 一定是「先删配置、后退群」。反过来会出现「已退群但仍在动态列表」，
//      之后每次全群操作都吃 chat not found，而群里已经没人能发 /delgroup 补救。
// 另外回执必须落在私聊：退群之后群里的消息一条也发不出去。
//
// 运行：node test_delgroup_in_group.mjs

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', '_worker.js'), 'utf8');

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

// ---------- D1（真实 SQLite） ----------
function makeD1() {
	const db = new DatabaseSync(':memory:');
	const normIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const k of Object.keys(row)) out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
		return out;
	};
	const exec = (sql, params = []) => {
		const st = db.prepare(sql);
		const bound = params.map(normIn);
		const head = sql.trim().slice(0, 7).toUpperCase();
		if (head.startsWith('SELECT') || head.startsWith('PRAGMA')) {
			const rows = st.all(...bound).map(normOut);
			return { kind: 'rows', rows, results: rows };
		}
		const info = st.run(...bound);
		return { kind: 'run', meta: {}, results: [{ success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }] };
	};
	return {
		prepare(sql) {
			const stmtFor = (args) => ({
				all: async () => ({ results: exec(sql, args).rows || [], success: true }),
				first: async () => (exec(sql, args).rows || [])[0] ?? null,
				run: async () => {
					const r = exec(sql, args);
					if (r.kind === 'rows') return { success: true, results: r.results, meta: { changes: 0 } };
					return { success: true, results: r.results, meta: r.results[0].meta };
				},
				bind: (...more) => stmtFor(more)
			});
			return stmtFor([]);
		},
		async exec(sql) { db.exec(sql); return { results: [], success: true }; },
		async batch(stmts) { return Promise.all(stmts.map((st) => st.run())); },
		query(sql, ...params) {
			try { return db.prepare(sql).all(...params).map(normOut); }
			catch (_) { return []; }
		},
		_raw: db
	};
}

let pass = 0, fail = 0;
const failures = [];
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 500) : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

// ---------- Telegram mock ----------
const BOT_ID = 42;
const OWNER = '10001';
const STRANGER = '20002';
let sent = [];
let leaveCalls = [];
let order = [];          // 记录「删库 / 退群」的先后
let botInChat = true;
let leaveOk = true;

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const method = String(url).split('/').pop();
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
		let payload = { ok: true, result: true };

		if (method === 'getMe') {
			payload = { ok: true, result: { id: BOT_ID, is_bot: true, username: 'DelGroupTestBot' } };
		} else if (method === 'sendMessage') {
			sent.push({ chatId: String(body?.chat_id ?? ''), text: String(body?.text || '') });
			payload = { ok: true, result: { message_id: 7000 + sent.length } };
		} else if (method === 'leaveChat') {
			leaveCalls.push(String(body?.chat_id ?? ''));
			order.push('leave');
			if (!leaveOk) payload = { ok: false, description: 'Bad Request: chat not found' };
			else botInChat = false;
		} else if (method === 'getChatMember') {
			payload = { ok: true, result: { status: botInChat ? 'administrator' : 'left', user: { id: BOT_ID } } };
		} else if (method === 'getChat') {
			payload = { ok: true, result: { id: body?.chat_id, title: '群 ' + body?.chat_id, type: 'supergroup' } };
		} else if (method === 'deleteMessage') {
			payload = { ok: true, result: true };
		}
		return { ok: true, status: 200, async json() { return payload; }, async text() { return JSON.stringify(payload); } };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });
const W = sandbox;

async function freshEnv(dynamicGroups = []) {
	const env = {
		TOKEN: 'TESTTOKEN',
		BOT_TOKEN: '123456:fake',
		GROUP_ID: '-1001000011',
		OWNER_IDS: OWNER,
		DB: makeD1()
	};
	W.applyRuntimeConfig(W.loadRequiredConfig(env));
	sent = []; leaveCalls = []; order = []; botInChat = true; leaveOk = true;
	for (const g of dynamicGroups) {
		env.DB._raw.exec('CREATE TABLE IF NOT EXISTS dynamic_groups (chat_id TEXT PRIMARY KEY, title TEXT, added_by TEXT NOT NULL, added_at TEXT NOT NULL, note TEXT)');
		env.DB.prepare('INSERT OR IGNORE INTO dynamic_groups (chat_id, title, added_by, added_at, note) VALUES (?, ?, ?, ?, ?)')
			.bind(g.chatId, g.title || null, 'test', '2026-10-22T00:00:00Z', null).run();
	}
	// 【必须】把 D1 里的动态群并入运行期 GROUP_IDS。真实请求里这一步由 fetch/queue 入口
	// 在路由分发之前调用；测试直接调 handleMessage，漏掉它就会让动态群被当成非配置群、
	// 命令在第 8951 行那道闸门整条丢弃 —— 表现为「怎么改都没反应」。
	await W.mergeDynamicGroupsFromD1(env);
	order.push('mark');
	return env;
}
function groups(env) {
	return env.DB.query('SELECT chat_id FROM dynamic_groups ORDER BY chat_id').map((r) => String(r.chat_id));
}
function msg(chatId, chatType, text, byUserId) {
	return {
		message_id: 1,
		chat: { id: chatId, type: chatType, title: '测试群 ' + chatId },
		from: { id: Number(byUserId), is_bot: false, first_name: 'x' },
		text
	};
}
const dmText = () => sent.filter((s) => s.chatId === OWNER).map((s) => s.text).join('\n');

// ================= [1] 群内发 /delgroup → 停治理 + 退群 =================
section('[1] 群内 /delgroup 停止治理并退出');
{
	const env = await freshEnv([{ chatId: '-1002000001', title: '要撤掉的群' }]);
	await W.handleMessage(msg(-1002000001, 'supergroup', '/delgroup', OWNER), env);
	assert('★ 已从动态群组移除', groups(env).length === 0, JSON.stringify(groups(env)));
	assert('★ 已调用 leaveChat 退出该群', leaveCalls.length === 1 && leaveCalls[0] === '-1002000001', JSON.stringify(leaveCalls));
	assert('★ 回执发到第一主人私聊（不是发在群里）',
		sent.filter((s) => s.chatId === OWNER).length > 0, JSON.stringify(sent.map((s) => s.chatId)));
	assert('★ 私聊回执写明已退出', /已确认退出|正在退出|已停止治理/.test(dmText()), dmText().slice(0, 300));
}

// ================= [2] 群内带别的群 ID → 一律拒绝 =================
section('[2] 群内 /delgroup 只能作用于当前群');
{
	const env = await freshEnv([{ chatId: '-1002000002', title: 'A群' }, { chatId: '-1002000003', title: 'B群' }]);
	await W.handleMessage(msg(-1002000002, 'supergroup', '/delgroup -1002000003', OWNER), env);
	assert('★ 不删除目标群配置', groups(env).includes('-1002000003'), JSON.stringify(groups(env)));
	assert('★ 不退出任何群', leaveCalls.length === 0, JSON.stringify(leaveCalls));
	assert('★ 私聊明确拒绝并说明只能作用于当前群',
		/当前群/.test(dmText()), dmText().slice(0, 300));
}

// ================= [3] 环境变量群群内发 → 绝不退 =================
section('[3] 环境变量群在群内 /delgroup 必须拦住');
{
	const env = await freshEnv();
	// GROUP_ID 里配的就是 -1001000011（主群）
	await W.handleMessage(msg(-1001000011, 'supergroup', '/delgroup', OWNER), env);
	assert('★ 不退出主群', leaveCalls.length === 0, JSON.stringify(leaveCalls));
	assert('★ 明确告知来自环境变量需要改后台',
		/GROUP_ID/.test(dmText()), dmText().slice(0, 300));
}

// ================= [4] 非第一主人在群里发 → 静默不动作 =================
section('[4] 非第一主人群内发 /delgroup');
{
	const env = await freshEnv([{ chatId: '-1002000004', title: 'C群' }]);
	await W.handleMessage(msg(-1002000004, 'supergroup', '/delgroup', STRANGER), env);
	assert('★ 陌生人无权 → 配置不删', groups(env).length === 1, JSON.stringify(groups(env)));
	assert('★ 陌生人无权 → 不退出', leaveCalls.length === 0, JSON.stringify(leaveCalls));
	assert('★ 陌生人无权 → 群里也不回话（避免泄漏命令存在）',
		sent.filter((s) => s.chatId === '-1002000004').length === 0, JSON.stringify(sent));
}

// ================= [5] 私聊 /delgroup 保持原语义：只停治理不退群 =================
section('[5] 私聊 /delgroup 不退出机器人');
{
	const env = await freshEnv([{ chatId: '-1002000005', title: 'D群' }]);
	await W.handleMessage(msg(Number(OWNER), 'private', '/delgroup -1002000005', OWNER), env);
	assert('★ 已从动态群组移除', groups(env).length === 0, JSON.stringify(groups(env)));
	assert('★ 未调用 leaveChat（私聊语义不变）', leaveCalls.length === 0, JSON.stringify(leaveCalls));
	assert('★ 私聊回执指向群内 /delgroup 或 /leavegroup',
		/leavegroup|该群里/.test(dmText()), dmText().slice(0, 400));
}

// ================= [6] 顺序：先删配置，后退群 =================
section('[6] 必须先删配置后退群');
{
	// 用一个能感知顺序的 D1：DELETE 时打点。必须复用同一个 env ——
	// 再开一个 freshEnv 会拿到没有动态群的空库，命令在「非配置群」那道闸门就被丢弃，
	// order 里只剩 mark，断言看似在测顺序、其实什么都没测到。
	const env = await freshEnv([{ chatId: '-1002000006', title: 'E群' }]);
	const realPrepare = env.DB.prepare;
	env.DB.prepare = (sql) => {
		const st = realPrepare(sql);
		if (/DELETE\s+FROM\s+dynamic_groups/i.test(sql)) {
			const wrapped = { ...st };
			wrapped.run = async (...a) => { order.push('db-delete'); return st.run(...a); };
			wrapped.bind = (...a) => {
				const b = st.bind(...a);
				return { ...b, run: async () => { order.push('db-delete'); return b.run(); } };
			};
			return wrapped;
		}
		return st;
	};
	await W.handleMessage(msg(-1002000006, 'supergroup', '/delgroup', OWNER), env);
	const del = order.indexOf('db-delete');
	const lv = order.indexOf('leave');
	assert('★ 删库发生在退群之前', del >= 0 && lv >= 0 && del < lv, JSON.stringify(order));
}

// ================= [7] 退群失败：配置照删，并提示补救 =================
section('[7] 退群失败不影响停治理');
{
	const env = await freshEnv([{ chatId: '-1002000007', title: 'F群' }]);
	leaveOk = false;
	await W.handleMessage(msg(-1002000007, 'supergroup', '/delgroup', OWNER), env);
	assert('★ 配置仍被删除', groups(env).length === 0, JSON.stringify(groups(env)));
	assert('★ 私聊告知退群失败并给出 /leavegroup 补救',
		/退群失败/.test(dmText()) && /leavegroup/.test(dmText()), dmText().slice(0, 400));
}

// ================= [8] 群内发 /addgroup /listgroups 仍要私聊 =================
section('[8] 其余两条仍强制私聊');
{
	const env = await freshEnv([{ chatId: '-1002000008', title: 'H群' }]);
	await W.handleMessage(msg(-1002000008, 'supergroup', '/listgroups', OWNER), env);
	assert('★ /listgroups 群内不在群里输出', sent.filter((s) => s.chatId === '-1002000008').length === 0, JSON.stringify(sent));
	assert('★ /listgroups 群内改为私聊提示', sent.some((s) => s.chatId === OWNER && /私聊/.test(s.text)), JSON.stringify(sent));

	const env2 = await freshEnv([{ chatId: '-1002000009', title: 'I群' }]);
	await W.handleMessage(msg(-1002000009, 'supergroup', '/addgroup -1002000010 新群', OWNER), env2);
	// 断言「没有新增目标群」，不是「表为空」—— 这个库里本来就预置了当前群这一行。
	assert('★ /addgroup 群内不写库', !groups(env2).includes('-1002000010'), JSON.stringify(groups(env2)));
	assert('★ /addgroup 群内改为私聊提示', sent.some((s) => s.chatId === OWNER && /私聊/.test(s.text)), JSON.stringify(sent));
}

// ================= [9] 退群后群里不再发任何治理消息 =================
section('[9] 群内只留一句告别，且回执不在群里');
{
	const env = await freshEnv([{ chatId: '-1002000011', title: 'G群' }]);
	await W.handleMessage(msg(-1002000011, 'supergroup', '/delgroup', OWNER), env);
	const inGroup = sent.filter((s) => s.chatId === '-1002000011').map((s) => s.text);
	assert('★ 群里最多一条告别消息', inGroup.length <= 1, JSON.stringify(inGroup));
	assert('★ 完整回执（含 ID / 恢复方法）不在群里',
		!inGroup.some((t) => /恢复/.test(t)), JSON.stringify(inGroup));
	assert('★ 完整回执在私聊', /恢复/.test(dmText()), dmText().slice(0, 400));
}

console.log(`\n========== 群内 /delgroup：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
