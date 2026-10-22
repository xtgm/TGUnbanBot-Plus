// 「第一主人用 /start 的添加按钮把机器人拉进群/频道 → 自动纳入动态群组」离线测试。
//
// 主人原话（2026-10-22）：「我通过 start 去添加这个机器人到群组或者是频道，
// 并启用动态群组授权」+「自动登记认的是第一主人 就可以了」。
//
// 这条功能的全部安全边界就在一句话上：Telegram 深链
// https://t.me/<bot>?startgroup=true 本身没有鉴权，谁拿到都能点。所以能不能生效
// 不能靠「按钮只给主人看」，只能靠事件里的 from —— 那是动手的人，不可伪造。
// 本文件按这个语义下断言：from 不是第一主人时，一行都不能写进 dynamic_groups。
//
// 运行：node test_bot_self_join.mjs

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '_worker.js'), 'utf8');

// 顶层 function 声明要落成沙箱全局属性，必须先摘掉 export default。
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

// ---------- D1 兼容层（真实 SQLite） ----------
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
				// 真实 D1 的 run() 把 changes 放在【顶层 meta】；mock 必须对齐，
				// 否则 addDynamicGroup 读 result.meta.changes 恒为 0、误判成「已存在」。
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

// ---------- 断言 ----------
let pass = 0, fail = 0;
const failures = [];
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 500) : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

// ---------- Telegram API mock ----------
const BOT_ID = 42;
let sent = [];
let botIsAdmin = true;

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const method = String(url).split('/').pop();
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
		let payload = { ok: true, result: true };
		if (method === 'getMe') {
			payload = { ok: true, result: { id: BOT_ID, is_bot: true, username: 'SelfJoinTestBot' } };
		} else if (method === 'sendMessage') {
			sent.push({ chatId: String(body?.chat_id ?? ''), text: String(body?.text || '') });
			payload = { ok: true, result: { message_id: 6000 + sent.length } };
		} else if (method === 'getChatAdministrators') {
			payload = {
				ok: true,
				result: botIsAdmin
					? [{ user: { id: BOT_ID }, status: 'administrator', can_restrict_members: true }]
					: []
			};
		}
		return { ok: true, status: 200, async json() { return payload; }, async text() { return JSON.stringify(payload); } };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });
const W = sandbox;

const OWNER = '10001';
const DEPUTY = '10002';
const STRANGER = '20002';

function freshEnv() {
	const env = { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID: '-1001000011', OWNER_IDS: OWNER + ',' + DEPUTY, DB: makeD1() };
	W.applyRuntimeConfig(W.loadRequiredConfig(env));
	sent = [];
	botIsAdmin = true;
	return env;
}
function rows(env) {
	return env.DB.query('SELECT chat_id, title, added_by FROM dynamic_groups ORDER BY chat_id');
}
function joinMessage(chatId, chatType, byUserId, members) {
	return {
		message: {
			message_id: 1,
			chat: { id: chatId, type: chatType, title: '测试群' + chatId },
			from: { id: byUserId, is_bot: false },
			new_chat_members: members
		}
	};
}
const selfBot = { id: BOT_ID, is_bot: true, username: 'SelfJoinTestBot' };

// ================= [1] 第一主人拉进超级群 → 自动登记 =================
section('[1] 第一主人 /start 添加群 → 自动纳入');
{
	const env = freshEnv();
	const handled = await W.handleBotSelfJoin(joinMessage(-1001000001, 'supergroup', Number(OWNER), [selfBot]), env);
	const got = rows(env);
	assert('★ 第一主人拉入 → 写入 dynamic_groups', got.length === 1 && String(got[0].chat_id) === '-1001000001', JSON.stringify(got));
	assert('★ 记录来源标记为 auto:owner', got.length === 1 && got[0].added_by === 'auto:owner', JSON.stringify(got));
	assert('★ 群名一并落库', got.length === 1 && got[0].title === '测试群-1001000001', JSON.stringify(got));
	assert('★ 私聊通知主人一次', sent.length === 1 && sent[0].chatId === OWNER, JSON.stringify(sent));
	assert('★ 通知里写明已纳入', sent.length === 1 && sent[0].text.includes('已自动纳入'), JSON.stringify(sent));
}

// ================= [2] 非第一主人拉进群 → 一行都不写 =================
section('[2] 别人拉进来不登记（深链被转发也无效）');
{
	const env = freshEnv();
	await W.handleBotSelfJoin(joinMessage(-1001000002, 'supergroup', Number(STRANGER), [selfBot]), env);
	assert('★ 陌生人拉入 → dynamic_groups 为空', rows(env).length === 0, JSON.stringify(rows(env)));
	assert('★ 陌生人拉入 → 不打扰主人', sent.length === 0, JSON.stringify(sent));

	// 副主人也不行 —— 口径是【第一主人】，不是「任一主人」。
	await W.handleBotSelfJoin(joinMessage(-1001000003, 'supergroup', Number(DEPUTY), [selfBot]), env);
	assert('副主人拉入同样不登记', rows(env).length === 0, JSON.stringify(rows(env)));
}

// ================= [3] 普通群 / 非 -100 前缀 → 不登记 =================
section('[3] 普通群不登记（与 /addgroup 口径一致）');
{
	const env = freshEnv();
	await W.handleBotSelfJoin(joinMessage(-51777, 'group', Number(OWNER), [selfBot]), env);
	assert('★ 普通群 group 类型 → 不登记', rows(env).length === 0, JSON.stringify(rows(env)));
}

// ================= [4] 进群的是真人 → 不登记 =================
section('[4] 只有机器人自己被拉入才处理');
{
	const env = freshEnv();
	await W.handleBotSelfJoin(joinMessage(-1001000004, 'supergroup', Number(OWNER), [{ id: 30001, is_bot: false }]), env);
	assert('★ 真人入群 → 不登记', rows(env).length === 0, JSON.stringify(rows(env)));
}

// ================= [5] 同一进群消息里混有别的 bot =================
section('[5] 多个 bot 同时入群只认自己');
{
	const env = freshEnv();
	await W.handleBotSelfJoin(joinMessage(-1001000005, 'supergroup', Number(OWNER), [
		{ id: 999, is_bot: true, username: 'other_bot' },
		selfBot
	]), env);
	const got = rows(env);
	assert('★ 同一批里混着别的 bot → 仍然登记自己', got.length === 1 && String(got[0].chat_id) === '-1001000005', JSON.stringify(got));
}

// ================= [6] 重复事件幂等 =================
section('[6] 入群与提权各来一次，只登记一次、只通知一次');
{
	const env = freshEnv();
	await W.handleBotSelfJoin(joinMessage(-1001000006, 'supergroup', Number(OWNER), [selfBot]), env);
	await W.handleBotSelfJoin(joinMessage(-1001000006, 'supergroup', Number(OWNER), [selfBot]), env);
	assert('★ 重复事件不产生第二行', rows(env).length === 1, JSON.stringify(rows(env)));
	assert('★ 重复事件不再发通知', sent.length === 1, JSON.stringify(sent));
}

// ================= [7] 频道走 my_chat_member =================
section('[7] 第一主人添加频道 → 登记 + 说明频道不能封人');
{
	const env = freshEnv();
	await W.handleBotSelfJoin({
		my_chat_member: {
			chat: { id: -1001000007, type: 'channel', title: '测试频道' },
			from: { id: Number(OWNER), is_bot: false },
			old_chat_member: { user: selfBot, status: 'left' },
			new_chat_member: { user: selfBot, status: 'administrator' }
		}
	}, env);
	const got = rows(env);
	assert('★ 频道被登记（channel 类型）', got.length === 1 && String(got[0].chat_id) === '-1001000007', JSON.stringify(got));
	assert('★ 通知里说明频道无成员可封', sent.length === 1 && sent[0].text.includes('频道'), JSON.stringify(sent));
}

// ================= [8] 主人事后提权 → 补登记 =================
section('[8] 先拉群后授权的真实操作顺序');
{
	const env = freshEnv();
	// 陌生人先把机器人拉进群：不登记
	await W.handleBotSelfJoin(joinMessage(-1001000008, 'supergroup', Number(STRANGER), [selfBot]), env);
	assert('陌生人拉入时仍未登记', rows(env).length === 0, JSON.stringify(rows(env)));
	// 主人随后把它提为管理员：这一次的 from 是主人，才登记
	await W.handleBotSelfJoin({
		chat_member: {
			chat: { id: -1001000008, type: 'supergroup', title: '主人后来授权的群' },
			from: { id: Number(OWNER), is_bot: false },
			old_chat_member: { user: selfBot, status: 'member' },
			new_chat_member: { user: selfBot, status: 'administrator' }
		}
	}, env);
	assert('★ 主人授权管理员时才登记', rows(env).length === 1 && String(rows(env)[0].chat_id) === '-1001000008', JSON.stringify(rows(env)));
}

// ================= [9] 机器人被移出 / 自己退出 → 不登记 =================
section('[9] 离群事件不登记');
{
	const env = freshEnv();
	await W.handleBotSelfJoin({
		my_chat_member: {
			chat: { id: -1001000009, type: 'supergroup', title: '某群' },
			from: { id: Number(OWNER), is_bot: false },
			old_chat_member: { user: selfBot, status: 'administrator' },
			new_chat_member: { user: selfBot, status: 'left' }
		}
	}, env);
	assert('★ 状态变 left → 不登记', rows(env).length === 0, JSON.stringify(rows(env)));

	await W.handleBotSelfJoin({
		my_chat_member: {
			chat: { id: -1001000010, type: 'supergroup', title: '某群2' },
			from: { id: Number(OWNER), is_bot: false },
			old_chat_member: { user: selfBot, status: 'administrator' },
			new_chat_member: { user: selfBot, status: 'kicked' }
		}
	}, env);
	assert('★ 状态变 kicked → 不登记', rows(env).length === 0, JSON.stringify(rows(env)));
}

// ================= [10] 环境变量里已有的群不重复登记 =================
section('[10] 已在 GROUP_ID 里的群不写第二份');
{
	const env = freshEnv();
	await W.handleBotSelfJoin(joinMessage(-1001000011, 'supergroup', Number(OWNER), [selfBot]), env);
	assert('★ 环境变量群 → dynamic_groups 不写', rows(env).length === 0, JSON.stringify(rows(env)));
	assert('★ 环境变量群 → 不重复通知', sent.length === 0, JSON.stringify(sent));
}

// ================= [11] webhook 订阅必须包含 my_chat_member =================
section('[11] allowed_updates 必须订阅 my_chat_member');
{
	const m = src.match(/allowed_updates:\s*\[([^\]]+)\]/);
	assert('★ allowed_updates 里含 my_chat_member', Boolean(m) && m[1].includes("'my_chat_member'"), m ? m[1] : '未找到');
}

// ================= [12] 权限不足时登记照做、但明确提示 =================
section('[12] 没给管理员权限也要登记');
{
	const env = freshEnv();
	botIsAdmin = false;
	await W.handleBotSelfJoin(joinMessage(-1001000012, 'supergroup', Number(OWNER), [selfBot]), env);
	assert('★ 缺权限仍然登记（先添加后授权是正常顺序）', rows(env).length === 1, JSON.stringify(rows(env)));
	assert('★ 通知里要求补「封禁用户」权限',
		sent.length === 1 && sent[0].text.includes('封禁用户'), JSON.stringify(sent));
}

console.log(`\n========== 自动纳入动态群组：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
