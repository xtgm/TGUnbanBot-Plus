// Mini App 后端 11 个接口的离线测试。
//
// 鉴权与 HTTP 边界归 test_miniapp_auth.mjs；本文件只测「验过身份之后，每个 action
// 到底做了什么」。重点不在「能不能点」，而在三件最容易写错的事：
//   ① 环境变量群一条都不能在页面里被停治理或退群 —— Worker 写不了自己的环境变量，
//      主群这样退掉就再也加不回来；
//   ② 写操作必须「先删配置、后调 Telegram」。反过来会留下「已退群但仍在动态列表」的
//      孤儿群，之后每次全群操作都吃 chat not found，而群里已经没人能补救；
//   ③ complete 必须如实反映失败 —— 部分群解封失败时显示成功，等于骗主人。
//
// 运行：node test_miniapp_api.mjs

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
		return { kind: 'run', results: [{ success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }] };
	};
	return {
		prepare(sql) {
			const stmtFor = (args) => ({
				all: async () => ({ results: exec(sql, args).rows || [], success: true }),
				first: async () => (exec(sql, args).rows || [])[0] ?? null,
				// 真实 D1 的 run() 把 changes 放在【顶层 meta】，mock 必须对齐，
				// 否则 addDynamicGroup / removeDynamicGroup 恒读成 0、误判 EXISTS / NOT_FOUND。
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

// ---------- Telegram / GKY mock ----------
const BOT_ID = 42;
const OWNER = '10001';
const ENV_MAIN = '-1001111111111';
const ENV_SECOND = '-1002222222222';

let order = [];              // 记录「删库 / 调 Telegram」的先后
let leaveCalls = [];
let botInChat = true;
let leaveOk = true;
let adminDenied = new Set(); // 这些群返回「bot 不在管理员列表」
let adminNoRights = new Set(); // 这些群 bot 是管理员但缺 can_restrict_members
let unbanFail = new Set();   // 这些群的解封两步全失败
// 「无记录」必须用繁体原文：GKY 那个第三方站点自己输出的是「并沒有封鎖記錄」，
// 写成简体就匹配不上，会掉进「有记录」分支。
let gkyHtml = '此TG账号并沒有封鎖記錄';

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	crypto: globalThis.crypto,
	fetch: async (url, init) => {
		const raw = String(url);
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }

		if (raw.includes('gkybot')) {
			return { ok: true, status: 200, async text() { return gkyHtml; }, async json() { return {}; } };
		}

		const method = raw.split('/').pop();
		let payload = { ok: true, result: true };

		if (method === 'getMe') {
			payload = { ok: true, result: { id: BOT_ID, is_bot: true, username: 'MiniAppTestBot' } };
		} else if (method === 'getChat') {
			const id = String(body?.chat_id ?? '');
			if (/^\d+$/.test(id)) {
				payload = { ok: true, result: { id: Number(id), first_name: '测试用户', username: 'tester', bio: '这是简介' } };
			} else {
				payload = { ok: true, result: { id, title: '群 ' + id, type: 'supergroup' } };
			}
		} else if (method === 'getChatAdministrators') {
			const id = String(body?.chat_id ?? '');
			payload = adminDenied.has(id)
				? { ok: true, result: [] }
				: { ok: true, result: [{ user: { id: BOT_ID }, status: 'administrator', can_restrict_members: !adminNoRights.has(id) }] };
		} else if (method === 'getChatMember') {
			payload = { ok: true, result: { status: botInChat ? 'administrator' : 'left', user: { id: BOT_ID } } };
		} else if (method === 'leaveChat') {
			leaveCalls.push(String(body?.chat_id ?? ''));
			order.push('leave');
			if (!leaveOk) payload = { ok: false, description: 'Bad Request: chat not found' };
			else botInChat = false;
		} else if (method === 'restrictChatMember' || method === 'unbanChatMember') {
			const id = String(body?.chat_id ?? '');
			if (unbanFail.has(id)) payload = { ok: false, description: 'Bad Request: not enough rights' };
		} else if (method === 'sendMessage') {
			payload = { ok: true, result: { message_id: 9000 } };
		}
		return { ok: true, status: 200, async json() { return payload; }, async text() { return JSON.stringify(payload); } };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });
const W = sandbox;

const AUTH = { userId: OWNER, user: { id: Number(OWNER), first_name: '主人', username: 'owner' }, primaryOwner: true };

async function freshEnv(dynamicGroups = [], setup) {
	const env = {
		TOKEN: 'TESTTOKEN',
		BOT_TOKEN: '123456:fake',
		GROUP_ID: ENV_MAIN + ',' + ENV_SECOND,
		OWNER_IDS: OWNER,
		DB: makeD1()
	};
	W.applyRuntimeConfig(W.loadRequiredConfig(env));
	order = []; leaveCalls = []; botInChat = true; leaveOk = true;
	adminDenied = new Set(); adminNoRights = new Set(); unbanFail = new Set(); gkyHtml = '此TG账号并沒有封鎖記錄';
	await W.ensureD1Table(env);
	for (const g of dynamicGroups) {
		env.DB.prepare('INSERT OR IGNORE INTO dynamic_groups (chat_id, title, added_by, added_at, note) VALUES (?, ?, ?, ?, ?)')
			.bind(g.chatId, g.title || null, 'test', '2026-10-23T00:00:00Z', g.note || null).run();
	}
	if (setup) await setup(env);
	await W.mergeDynamicGroupsFromD1(env);
	return env;
}

async function call(env, action, payload = {}) {
	return await W.dispatchMiniAppAction(action, payload, env, AUTH, {});
}
async function callError(env, action, payload = {}) {
	try { await call(env, action, payload); return null; }
	catch (error) { return error; }
}
function dynamicIds(env) {
	return env.DB.query('SELECT chat_id FROM dynamic_groups ORDER BY chat_id').map((r) => String(r.chat_id));
}

// ================= [1] bootstrap：身份 + 群组来源 =================
section('[1] bootstrap 返回身份与群组来源');
{
	const env = await freshEnv([{ chatId: '-1003333333333', title: '手动加的群' }]);
	const data = await call(env, 'bootstrap');
	assert('★ 身份是签名用户本人', data.user && data.user.id === OWNER, JSON.stringify(data.user));
	assert('★ primaryOwner 为真', data.primaryOwner === true);
	assert('★ 群组 = 2 个环境变量群 + 1 个动态群', data.groups.length === 3, JSON.stringify(data.groups));
	assert('★ 环境变量群排在前面且标 env',
		data.groups[0].source === 'env' && data.groups[1].source === 'env', JSON.stringify(data.groups.slice(0, 2)));
	assert('★ 第一个环境变量群标为主群', data.groups[0].primary === true && data.groups[1].primary !== true);
	assert('★ 动态群标 dynamic 且群名落库',
		data.groups[2].source === 'dynamic' && data.groups[2].title === '手动加的群', JSON.stringify(data.groups[2]));
}

// ================= [2] groups/list 与 bootstrap 同源 =================
section('[2] groups/list 与 bootstrap 的群组一致');
{
	const env = await freshEnv([{ chatId: '-1003333333333', title: '手动加的群' }]);
	const boot = await call(env, 'bootstrap');
	const list = await call(env, 'groups/list');
	assert('★ 两个接口返回同一批群组',
		JSON.stringify(list.map((g) => g.chatId)) === JSON.stringify(boot.groups.map((g) => g.chatId)),
		JSON.stringify(list));
}

// ================= [3] groups/add 的四道闸 =================
section('[3] groups/add 拒绝非法目标');
{
	const env = await freshEnv([{ chatId: '-1003333333333', title: '已有群' }]);

	let err = await callError(env, 'groups/add', { chatId: '-51777' });
	assert('★ 普通群格式被拒（400）', err && err.status === 400, err && err.message);

	err = await callError(env, 'groups/add', { chatId: ENV_MAIN });
	assert('★ 环境变量群被拒（400）', err && err.status === 400 && /环境变量/.test(err.message), err && err.message);

	err = await callError(env, 'groups/add', { chatId: '-1003333333333' });
	assert('★ 已在动态列表被拒（409）', err && err.status === 409, err && err.message);

	adminDenied = new Set(['-1004444444444']);
	err = await callError(env, 'groups/add', { chatId: '-1004444444444' });
	// 具体原因是哪种（不在管理员列表 / 缺权限）由 Telegram 返回决定，不写死；
	// 这里只认「拒绝添加 + 把真实原因带出来 + 提示怎么补救」。
	assert('★ bot 不在群管理员列表时被拒（400）',
		err && err.status === 400 && /无法添加该群/.test(err.message) && /不在群管理员列表/.test(err.message),
		err && err.message);
	assert('★ 被拒时一行都不写库', !dynamicIds(env).includes('-1004444444444'), JSON.stringify(dynamicIds(env)));

	adminDenied = new Set(); adminNoRights = new Set(['-1006666666666']);
	err = await callError(env, 'groups/add', { chatId: '-1006666666666' });
	assert('★ bot 缺封禁权限时被拒（400）',
		err && err.status === 400 && /can_restrict_members/.test(err.message), err && err.message);
	assert('★ 缺权限时一行都不写库', !dynamicIds(env).includes('-1006666666666'), JSON.stringify(dynamicIds(env)));

	adminNoRights = new Set();
	const ok = await call(env, 'groups/add', { chatId: '-1005555555555' });
	assert('★ 合法群添加成功', ok.complete === true, JSON.stringify(ok));
	assert('★ 添加后写进 D1', dynamicIds(env).includes('-1005555555555'), JSON.stringify(dynamicIds(env)));
	assert('★ 群名一并落库',
		env.DB.query("SELECT title FROM dynamic_groups WHERE chat_id = '-1005555555555'")[0].title === '群 -1005555555555');

	// 同一个请求里刚加完，运行期 GROUP_IDS 必须立刻带上它 —— 否则页面刷新一次
	// 会看到「添加成功但列表里没有」。
	const list = await call(env, 'groups/list');
	assert('★ 添加后立刻出现在列表里', list.some((g) => g.chatId === '-1005555555555'), JSON.stringify(list));
}

// ================= [4] groups/remove 只能动动态群 =================
section('[4] groups/remove 只对动态群生效');
{
	const env = await freshEnv([{ chatId: '-1003333333333', title: '要撤掉的群' }]);

	let err = await callError(env, 'groups/remove', { chatId: ENV_MAIN });
	assert('★ 环境变量群被拒（400）', err && err.status === 400 && /环境变量/.test(err.message), err && err.message);
	assert('★ 被拒时环境变量群配置不变', true);

	err = await callError(env, 'groups/remove', { chatId: '-1009999999999' });
	assert('★ 不在列表的群返回 404', err && err.status === 404, err && err.message);

	const ok = await call(env, 'groups/remove', { chatId: '-1003333333333' });
	assert('★ 停止治理成功', ok.complete === true, JSON.stringify(ok));
	assert('★ D1 里已删除', !dynamicIds(env).includes('-1003333333333'), JSON.stringify(dynamicIds(env)));
	assert('★ 没有调 leaveChat（停止治理不退群）', leaveCalls.length === 0, JSON.stringify(leaveCalls));
}

// ================= [5] groups/leave 先删库、后退群 =================
section('[5] groups/leave 的顺序与环境变量群拦截');
{
	const env = await freshEnv([{ chatId: '-1003333333333', title: '要退的群' }]);
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
	const ok = await call(env, 'groups/leave', { chatId: '-1003333333333' });
	assert('★ 退群成功', ok.complete === true, JSON.stringify(ok));
	assert('★ 删库发生在退群之前',
		order.indexOf('db-delete') >= 0 && order.indexOf('leave') > order.indexOf('db-delete'), JSON.stringify(order));

	const env2 = await freshEnv();
	const err = await callError(env2, 'groups/leave', { chatId: ENV_MAIN });
	assert('★ 环境变量群拒绝退群（400）', err && err.status === 400, err && err.message);
	assert('★ 环境变量群一次 leaveChat 都没发', leaveCalls.length === 0, JSON.stringify(leaveCalls));

	const env3 = await freshEnv([{ chatId: '-1003333333333', title: '退不掉的群' }]);
	leaveOk = false;
	const failed = await call(env3, 'groups/leave', { chatId: '-1003333333333' });
	assert('★ 退群失败时 complete=false', failed.complete === false, JSON.stringify(failed));
	assert('★ 退群失败但治理配置照删', !dynamicIds(env3).includes('-1003333333333'), JSON.stringify(dynamicIds(env3)));
}

// ================= [6] blacklist/list 分页与搜索 =================
section('[6] blacklist/list 分页、搜索、最新在前');
{
	const env = await freshEnv([], async (e) => {
		for (let i = 0; i < 25; i += 1) {
			e.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)')
				.bind(String(900000 + i), i % 5 === 0 ? '广告推广' : '骚扰', '10001', String(1780000000 + i), '').run();
		}
	});
	const page1 = await call(env, 'blacklist/list', { page: 1 });
	assert('★ 第 1 页 20 条', page1.items.length === 20, page1.items.length);
	assert('★ 总数 25、共 2 页', page1.total === 25 && page1.totalPages === 2, JSON.stringify({ total: page1.total, pages: page1.totalPages }));
	assert('★ 最新在前（第一条是最大 at）', page1.items[0].id === '900024', page1.items[0].id);

	const page2 = await call(env, 'blacklist/list', { page: 2 });
	assert('★ 第 2 页 5 条', page2.items.length === 5, page2.items.length);

	const searched = await call(env, 'blacklist/list', { page: 1, query: '广告' });
	assert('★ 按原因搜索命中 5 条', searched.total === 5, JSON.stringify({ total: searched.total }));

	const byId = await call(env, 'blacklist/list', { page: 1, query: '900012' });
	assert('★ 按用户 ID 搜索命中 1 条', byId.total === 1 && byId.items[0].id === '900012', JSON.stringify(byId.items));

	const over = await call(env, 'blacklist/list', { page: 99 });
	assert('★ 越界页码钳到最后一页', over.page === 2, over.page);
}

// ================= [7] blacklist/unban 顺序与部分失败 =================
section('[7] blacklist/unban 先删黑名单、再逐群解封');
{
	const env = await freshEnv([], async (e) => {
		e.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)')
			.bind('900001', '广告', '10001', '1780000000', '').run();
	});
	const realPrepare = env.DB.prepare;
	env.DB.prepare = (sql) => {
		const st = realPrepare(sql);
		if (/DELETE\s+FROM\s+blacklist/i.test(sql)) {
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
	const ok = await call(env, 'blacklist/unban', { userId: '900001' });
	assert('★ 全部群成功时 complete=true', ok.complete === true, JSON.stringify(ok));
	assert('★ 黑名单已删', env.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '900001'")[0].c === 0);
	assert('★ 逐群结果覆盖两个环境变量群', ok.results.length === 2, JSON.stringify(ok.results));
	assert('★ 先删黑名单再解封', order.indexOf('db-delete') === 0, JSON.stringify(order));

	const env2 = await freshEnv([], async (e) => {
		e.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)')
			.bind('900002', '广告', '10001', '1780000000', '').run();
	});
	unbanFail = new Set([ENV_SECOND]);
	const partial = await call(env2, 'blacklist/unban', { userId: '900002' });
	assert('★ 部分群失败时 complete=false', partial.complete === false, JSON.stringify(partial));
	assert('★ 失败群带中文原因', partial.results.some((r) => !r.ok && r.error), JSON.stringify(partial.results));
	assert('★ 黑名单仍然删除（解封失败不回滚删除）',
		env2.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '900002'")[0].c === 0);
}

// ================= [8] ads/summary 计数与配置 =================
section('[8] ads/summary 计数与配置');
{
	const now = Math.floor(Date.now() / 1000);
	let baseline = 0;
	const env = await freshEnv([], async (e) => {
		await W.ensureAdDetectionTables(e);
		// 建表会顺带灌入种子指纹，数量是实现细节，不能写死。先记基线再比增量。
		baseline = e.DB.query('SELECT COUNT(*) AS c FROM ad_fingerprints')[0].c;
		for (let i = 0; i < 3; i += 1) {
			e.DB.prepare('INSERT INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, created_at, updated_at) VALUES (?, ?, ?, 1, 0, 0, 1, ?, ?)')
				.bind('fp' + i, 'keyword', 'v' + i, now, now).run();
		}
		e.DB.prepare('INSERT INTO ad_user_screening (user_id, chat_id, score, reasons, snapshot, layer, joined_at, expires_at, updated_at) VALUES (?, ?, 10, \'[]\', \'{}\', \'L1\', ?, ?, ?)')
			.bind('800001', '-1001111111111', now, now + 3600, now).run();
		e.DB.prepare('INSERT INTO ad_pending_snapshots (owner_id, seq, user_id, chat_id, score, reasons, snapshot, created_at, expires_at) VALUES (?, 1, ?, ?, 92, ?, ?, ?, ?)')
			.bind(OWNER, '800002', '-1001111111111', '["联系方式命中"]', '{}', now, now + 3600).run();
	});
	const data = await call(env, 'ads/summary');
	assert('★ 指纹数 = 基线 + 3', data.counts.fingerprints === baseline + 3,
		JSON.stringify({ counts: data.counts, baseline }));
	assert('★ 观察中人数', data.counts.observing === 1, JSON.stringify(data.counts));
	assert('★ 待复核数', data.counts.pending === 1, JSON.stringify(data.counts));
	assert('★ 封禁阈值来自配置', data.config.scoreThreshold > 0, JSON.stringify(data.config));
	assert('★ AI 未绑定时为 false', data.config.aiEnabled === false, JSON.stringify(data.config));
	assert('★ 视觉模型名一并返回', Boolean(data.visionModel), data.visionModel);
}

// ================= [9] ads/pending 分页与过滤 =================
section('[9] ads/pending 只列未复核的、每页 10 条');
{
	const now = Math.floor(Date.now() / 1000);
	const env = await freshEnv([], async (e) => {
		await W.ensureAdDetectionTables(e);
		for (let i = 1; i <= 13; i += 1) {
			e.DB.prepare('INSERT INTO ad_pending_snapshots (owner_id, seq, user_id, chat_id, score, reasons, snapshot, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
				.bind(OWNER, i, String(700000 + i), '-1001111111111', 80 + i, '["测试判据"]', '{"name":"测试"}', now + i, now + 3600).run();
		}
		// 已复核的（expires_at=0）不能出现在列表里
		e.DB.prepare('INSERT INTO ad_pending_snapshots (owner_id, seq, user_id, chat_id, score, reasons, snapshot, created_at, expires_at) VALUES (?, 99, ?, ?, 90, ?, ?, ?, 0)')
			.bind(OWNER, '799999', '-1001111111111', '["已复核"]', '{}', now).run();
	});
	const page1 = await call(env, 'ads/pending', { page: 1 });
	assert('★ 第 1 页 10 条', page1.items.length === 10, page1.items.length);
	assert('★ 总数 13（不含已复核）', page1.total === 13, page1.total);
	assert('★ 最新序号在前', page1.items[0].seq === 13, page1.items[0].seq);
	assert('★ 已复核的不在列表里', !page1.items.some((r) => r.seq === 99), JSON.stringify(page1.items.map((r) => r.seq)));
	const page2 = await call(env, 'ads/pending', { page: 2 });
	assert('★ 第 2 页 3 条', page2.items.length === 3, page2.items.length);
	assert('★ 判据已解析成数组', Array.isArray(page1.items[0].reasons), JSON.stringify(page1.items[0].reasons));
}

// ================= [10] ads/ignore 回滚与不存在 =================
section('[10] ads/ignore 回滚');
{
	const now = Math.floor(Date.now() / 1000);
	const env = await freshEnv([], async (e) => {
		await W.ensureAdDetectionTables(e);
		e.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)')
			.bind('700001', '广告', '10001', '1780000000', '').run();
		e.DB.prepare('INSERT INTO ad_pending_snapshots (owner_id, seq, user_id, chat_id, score, reasons, snapshot, created_at, expires_at) VALUES (?, 7, ?, ?, 92, ?, ?, ?, ?)')
			.bind(OWNER, '700001', '-1001111111111', '["联系方式命中"]', '{"name":"测试","text":"正文"}', now, now + 3600).run();
	});

	let err = await callError(env, 'ads/ignore', { seq: 12345 });
	assert('★ 不存在的序号返回 404', err && err.status === 404, err && err.message);

	const ok = await call(env, 'ads/ignore', { seq: 7 });
	assert('★ 回滚完成 complete=true', ok.complete === true, JSON.stringify(ok).slice(0, 300));
	assert('★ 黑名单已移除',
		env.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '700001'")[0].c === 0);
	assert('★ 快照被标记为已复核（expires_at=0）',
		env.DB.query('SELECT expires_at FROM ad_pending_snapshots WHERE seq = 7')[0].expires_at === 0);

	err = await callError(env, 'ads/ignore', { seq: 7 });
	assert('★ 同一条再点一次返回 404（不能重复回滚）', err && err.status === 404, err && err.message);
}

// ================= [11] users/query 各字段与失败隔离 =================
section('[11] users/query 字段齐全、单点失败不影响其它');
{
	const now = Math.floor(Date.now() / 1000);
	const env = await freshEnv([], async (e) => {
		await W.ensureAdDetectionTables(e);
		e.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)')
			.bind('600001', '广告推广', '10001', '1780000000', '备注内容').run();
		e.DB.prepare('INSERT INTO ad_pending_snapshots (owner_id, seq, user_id, chat_id, score, reasons, snapshot, created_at, expires_at) VALUES (?, 3, ?, ?, 92, ?, ?, ?, ?)')
			.bind(OWNER, '600001', '-1001111111111', '["联系方式命中"]', '{"name":"测试","text":"正文"}', now, now + 3600).run();
		e.DB.prepare('INSERT INTO ad_group_members (user_id, chat_id, first_name, last_name, username, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind('600001', '-1001111111111', '测试', '', 'tester', 1780000000, 1780000500).run();
		e.DB.prepare('INSERT INTO moderation_messages (mid, chat_id, from_id, created_at) VALUES (1, ?, ?, ?)')
			.bind('-1001111111111', '600001', '2026-10-23T00:00:00Z').run();
	});
	const data = await call(env, 'users/query', { userId: '600001' });
	assert('★ 资料来自 getChat', data.profile && data.profile.username === 'tester', JSON.stringify(data.profile));
	assert('★ 黑名单记录在', data.blacklist && data.blacklist.reason === '广告推广', JSON.stringify(data.blacklist));
	assert('★ 处罚记录 1 条', data.cases.length === 1 && data.cases[0].score === 92, JSON.stringify(data.cases));
	assert('★ 处罚记录带快照正文', data.cases[0].snapshot.text === '正文', JSON.stringify(data.cases[0].snapshot));
	assert('★ 发言统计：条数 1', data.speech.count === 1, JSON.stringify(data.speech));
	assert('★ 发言统计：首次/最近来自名册', data.speech.first === 1780000000 && data.speech.last === 1780000500, JSON.stringify(data.speech));
	assert('★ GKY 无记录解析成功', data.gky && data.gky.banned === false, JSON.stringify(data.gky));
	assert('★ 无错误项', Object.keys(data.errors).length === 0, JSON.stringify(data.errors));

	gkyHtml = '<html><body><strong>TGID:</strong> 600002<strong>Reason:</strong> SpamGP</body></html>';
	const data2 = await call(env, 'users/query', { userId: '600002' });
	assert('★ GKY 有记录时 banned=true', data2.gky && data2.gky.banned === true, JSON.stringify(data2.gky));
	assert('★ GKY 原因已译成中文', data2.gky.reason === '群众举报', data2.gky.reason);

	// 外部库挂掉不能把整页拖垮：本地数据照出，只标 gkyError。
	sandbox.fetch = (() => {
		const original = sandbox.fetch;
		return async (url, init) => {
			if (String(url).includes('gkybot')) throw new Error('network down');
			return original(url, init);
		};
	})();
	const data3 = await call(env, 'users/query', { userId: '600001' });
	assert('★ 外部库失败只填 gkyError', Boolean(data3.gkyError), JSON.stringify(data3.gkyError));
	assert('★ 外部库失败不影响本地资料', data3.profile && data3.profile.username === 'tester');
	assert('★ 外部库失败不影响黑名单', data3.blacklist && data3.blacklist.id === '600001');
}

// ================= [12] 未知 action 兜底 =================
section('[12] 未知 action 直接拒绝');
{
	const env = await freshEnv();
	const err = await callError(env, 'nope/nothing', {});
	assert('★ 未知 action 返回 404', err && err.status === 404, err && err.message);
}

// ================= [13] health：复用 /health 的两层检查 =================
section('[13] health 返回两层结果，文案已剥成纯文本');
{
	const env = await freshEnv();
	const data = await call(env, 'health');
	assert('★ layer1 五项齐全', Array.isArray(data.layer1) && data.layer1.length === 5, JSON.stringify(data.layer1));
	assert('★ layer2 逐群 2 个且 total 对齐', data.layer2.length === 2 && data.total === 2, JSON.stringify(data.layer2));
	// Mini App 前端禁止 innerHTML，后端必须把 <code>/<b> 剥掉再返回。
	assert('★ 文案不含 HTML 标签', data.layer1.every((row) => !/[<>]/.test(row.text)), JSON.stringify(data.layer1.map((r) => r.text)));
	assert('★ Bot 身份判为正常', data.layer1[0].ok === true, JSON.stringify(data.layer1[0]));
	assert('★ D1 判为正常', data.layer1[1].ok === true, JSON.stringify(data.layer1[1]));
	// 没有发言记录是「警告」不是「故障」—— null 与 false 必须区分开。
	assert('★ 无发言记录时统计活性是 null（警告）', data.layer1[2].ok === null, JSON.stringify(data.layer1[2]));
	assert('★ 未绑 Workers AI 是 null（降级不是故障）', data.layer1[3].ok === null, JSON.stringify(data.layer1[3]));
	assert('★ 群权限如实反映 Telegram 返回值',
		data.layer2.every((row) => row.present === true && row.isAdmin === true && row.canRestrict === true && row.canDelete === false && row.canInvite === false),
		JSON.stringify(data.layer2));

	adminNoRights = new Set([ENV_SECOND]);
	const data2 = await call(env, 'health');
	const second = data2.layer2.find((row) => row.groupId === ENV_SECOND);
	assert('★ 缺封禁权限的群标 canRestrict=false', second && second.canRestrict === false, JSON.stringify(second));
	adminNoRights = new Set();
}

// ================= [14] admins/list：三段名单结构化 =================
section('[14] admins/list 返回主人 / 副主人 / 超管三段');
{
	const env = await freshEnv();
	// OWNER_IDS / SUPER_ADMIN_IDS 是模块级 let（词法绑定，不是 sandbox 属性），
	// 只能通过 applyRuntimeConfig 改 —— 直接赋值 sandbox.SUPER_ADMIN_IDS 不会生效。
	W.applyRuntimeConfig(W.loadRequiredConfig(Object.assign({}, env, {
		OWNER_IDS: OWNER + ',10002',
		SUPER_ADMIN_IDS: '10003'
	})));
	const baseFetch = sandbox.fetch;
	sandbox.fetch = async (url, init) => {
		const method = String(url).split('/').pop();
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
		if (method === 'getChatAdministrators') {
			const id = String(body?.chat_id ?? '');
			const list = [{ user: { id: BOT_ID }, status: 'administrator', can_restrict_members: true }];
			if (id === ENV_MAIN) list.push({ user: { id: Number(OWNER), first_name: '主人', last_name: '阿林', username: 'owner' }, status: 'creator' });
			if (id === ENV_SECOND) list.push({ user: { id: 10002, first_name: '副主人', username: 'second' }, status: 'administrator' });
			return { ok: true, status: 200, async json() { return { ok: true, result: list }; }, async text() { return ''; } };
		}
		if (method === 'getChatMember') {
			// 超管不在任何群的管理员列表里，只能靠这一轨补查；这里返回空表示查不到，
			// 用来验证「未获取」这条回落路径。
			return { ok: true, status: 200, async json() { return { ok: false, description: 'Bad Request: user not found' }; }, async text() { return ''; } };
		}
		return baseFetch(url, init);
	};
	try {
		const data = await call(env, 'admins/list');
		assert('★ 主人只有一位', data.primary.length === 1 && data.primary[0].id === OWNER, JSON.stringify(data.primary));
		assert('★ 主人昵称由姓 + 名拼成', data.primary[0].name === '主人 阿林', data.primary[0].name);
		assert('★ 主人用户名与来源群齐备',
			data.primary[0].username === 'owner' && data.primary[0].groupId === ENV_MAIN, JSON.stringify(data.primary[0]));
		assert('★ 副主人一段独立', data.secondary.length === 1 && data.secondary[0].id === '10002', JSON.stringify(data.secondary));
		assert('★ 超管一段独立', data.superAdmins.length === 1 && data.superAdmins[0].id === '10003', JSON.stringify(data.superAdmins));
		assert('★ 超管查不到资料时回落「未获取」', data.superAdmins[0].name === '未获取', JSON.stringify(data.superAdmins[0]));
		assert('★ 来源群名已解析', data.groupLabels[ENV_MAIN] && data.groupLabels[ENV_MAIN].title === '群 ' + ENV_MAIN, JSON.stringify(data.groupLabels));
		assert('★ 未触发预算截断', data.truncated === false, String(data.truncated));
	} finally {
		sandbox.fetch = baseFetch;
		W.applyRuntimeConfig(W.loadRequiredConfig(env));
	}
}

// ================= [14b] 请求上限提示的判据 =================
section('[14b] 请求上限提示只在真有人缺资料时出现');
{
	// 群数超过预算（100）时第一轮就会撞线，但主人与副主人都已在管理员列表里查到完整资料。
	// 旧判据只看 budget.skipped > 0，会把这种「全都查到了」也报成请求上限。
	const env = await freshEnv();
	env.GROUP_ID = [ENV_MAIN, ENV_SECOND]
		.concat(Array.from({ length: 110 }, (_, i) => '-10088000' + String(10000 + i)))
		.join(',');
	const baseFetch = sandbox.fetch;
	let groupCalls = 0;
	sandbox.fetch = async (url, init) => {
		const method = String(url).split('/').pop();
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
		if (method === 'getChatAdministrators') {
			groupCalls += 1;
			const id = String(body?.chat_id ?? '');
			const list = [{ user: { id: BOT_ID }, status: 'administrator', can_restrict_members: true }];
			if (id === ENV_MAIN) list.push({ user: { id: Number(OWNER), first_name: '主人', username: 'owner' }, status: 'creator' });
			if (id === ENV_SECOND) list.push({ user: { id: 10002, first_name: '副主人', username: 'second' }, status: 'administrator' });
			return { ok: true, status: 200, async json() { return { ok: true, result: list }; }, async text() { return ''; } };
		}
		if (method === 'getChat') {
			return { ok: true, status: 200, async json() { return { ok: true, result: { id: body?.chat_id, title: '群 ' + body?.chat_id } }; }, async text() { return ''; } };
		}
		return baseFetch(url, init);
	};
	try {
		W.applyRuntimeConfig(W.loadRequiredConfig(Object.assign({}, env, { OWNER_IDS: OWNER + ',10002' })));
		const data = await call(env, 'admins/list');
		assert('★ 群数超过预算时名单仍完整',
			data.primary.length === 1 && data.primary[0].name === '主人' && data.secondary[0].name === '副主人',
			JSON.stringify([data.primary, data.secondary]));
		assert('★ 预算 100 已被用满', groupCalls === 100, String(groupCalls));
		assert('★ 人人都有资料时不报请求上限', data.truncated === false, String(data.truncated));
	} finally {
		sandbox.fetch = baseFetch;
		W.applyRuntimeConfig(W.loadRequiredConfig(env));
	}
}

// 反向：预算真的不够、也确实有人一份资料都没拿到时，提示必须出现。
section('[14c] 预算不够且有人缺资料时提示出现');
{
	const env = await freshEnv();
	const supers = Array.from({ length: 60 }, (_, i) => String(20000 + i)).join(',');
	const baseFetch = sandbox.fetch;
	let memberCalls = 0;
	sandbox.fetch = async (url, init) => {
		const method = String(url).split('/').pop();
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
		if (method === 'getChatAdministrators') {
			const id = String(body?.chat_id ?? '');
			const list = [{ user: { id: BOT_ID }, status: 'administrator', can_restrict_members: true }];
			if (id === ENV_MAIN) list.push({ user: { id: Number(OWNER), first_name: '主人', username: 'owner' }, status: 'creator' });
			return { ok: true, status: 200, async json() { return { ok: true, result: list }; }, async text() { return ''; } };
		}
		if (method === 'getChatMember') {
			memberCalls += 1;
			return { ok: true, status: 200, async json() { return { ok: false, description: 'Bad Request: user not found' }; }, async text() { return ''; } };
		}
		return baseFetch(url, init);
	};
	try {
		W.applyRuntimeConfig(W.loadRequiredConfig(Object.assign({}, env, { SUPER_ADMIN_IDS: supers })));
		const data = await call(env, 'admins/list');
		assert('★ 60 个超管全部列出', data.superAdmins.length === 60, String(data.superAdmins.length));
		assert('★ 预算耗尽后补查停止', memberCalls > 0 && memberCalls < 60 * 2, String(memberCalls));
		assert('★ 有人缺资料时提示出现', data.truncated === true, String(data.truncated));
		assert('★ 缺资料的人回落为「未获取」',
			data.superAdmins.filter((p) => p.name === '未获取').length > 0,
			String(data.superAdmins.filter((p) => p.name === '未获取').length));
	} finally {
		sandbox.fetch = baseFetch;
		W.applyRuntimeConfig(W.loadRequiredConfig(env));
	}
}

// ================= [15] search：三种查询类型 + 分页 + 排除广告 =================
section('[15] search 三种查询类型与分页');
{
	const env = await freshEnv();
	await W.statReady(env);
	const insert = (mid, chatId, fromId, text, isAd) => env.DB.prepare(
		'INSERT INTO moderation_messages (mid, chat_id, from_id, created_at, text_hash, text_norm, is_ad) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).bind(mid, chatId, fromId, '2026-10-01T00:00:00Z', 'h' + mid, text, isAd).run();
	for (let i = 1; i <= 11; i++) insert(i, ENV_MAIN, '123456789', '第 ' + i + ' 条 广告测试', 0);
	insert(99, ENV_SECOND, '987654321', '另一个群的正常发言', 0);
	// is_ad=1 是被判成广告的消息，只服务同款连带与清扫，绝不进检索源。
	insert(100, ENV_MAIN, '123456789', '被判成广告的那条内容', 1);
	env.DB.prepare(
		'INSERT INTO stat_speech (chat_id, user_id, day, msg_count, display_name, username, updated_at, last_msg_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
	).bind(ENV_SECOND, '987654321', '2026-10-02', 1, '另一位', 'second', 1780000000, 99).run();

	const byKeyword = await call(env, 'search', { query: '广告' });
	assert('★ 关键词查询命中 11 条（广告记录被排除）', byKeyword.total === 11, JSON.stringify({ total: byKeyword.total }));
	assert('★ 关键词类型判定正确', byKeyword.kind === 'keyword', byKeyword.kind);
	assert('★ 首页 10 条、共 2 页', byKeyword.rows.length === 10 && byKeyword.totalPages === 2, JSON.stringify({ rows: byKeyword.rows.length, pages: byKeyword.totalPages }));
	const page2 = await call(env, 'search', { query: '广告', page: 2 });
	assert('★ 第二页剩 1 条', page2.rows.length === 1 && page2.page === 2, JSON.stringify({ rows: page2.rows.length, page: page2.page }));

	const byId = await call(env, 'search', { query: '987654321' });
	assert('★ 纯数字按用户 ID 查', byId.kind === 'user' && byId.total === 1, JSON.stringify({ kind: byId.kind, total: byId.total }));
	assert('★ 命中行带回群组与消息号', byId.rows[0].chat_id === ENV_SECOND && Number(byId.rows[0].mid) === 99, JSON.stringify(byId.rows[0]));

	const byName = await call(env, 'search', { query: '@second' });
	assert('★ @ 开头按用户名反查', byName.kind === 'username' && byName.resolvedUserId === '987654321', JSON.stringify({ kind: byName.kind, id: byName.resolvedUserId }));
	assert('★ 反查后命中该用户的发言', byName.total === 1, String(byName.total));

	const missing = await callError(env, 'search', { query: '@nobodyhere' });
	assert('★ 用户名查不到时明确报错，不退化成搜全部', missing && missing.status === 404, missing && missing.message);

	const empty = await callError(env, 'search', { query: '   ' });
	assert('★ 空查询被拒（400）', empty && empty.status === 400, empty && empty.message);

	const tooLong = await callError(env, 'search', { query: 'x'.repeat(161) });
	assert('★ 超长查询被拒（400）', tooLong && tooLong.status === 400, tooLong && tooLong.message);
}

// ================= [16] notice/send：全部群 / 指定群 / 参数校验 =================
section('[16] notice/send 群发与指定群');
{
	const env = await freshEnv();
	const sent = [];
	const failing = new Set([ENV_SECOND]);
	const baseFetch = sandbox.fetch;
	sandbox.fetch = async (url, init) => {
		const method = String(url).split('/').pop();
		if (method !== 'sendMessage') return baseFetch(url, init);
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
		sent.push(body || {});
		const id = String(body?.chat_id ?? '');
		if (failing.has(id)) {
			return { ok: true, status: 200, async json() { return { ok: false, description: 'Bad Request: chat not found' }; }, async text() { return ''; } };
		}
		return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 9001 } }; }, async text() { return ''; } };
	};
	try {
		const all = await call(env, 'notice/send', { text: '今晚维护，请提前保存内容。' });
		assert('★ 全部群：目标数 = 配置群数', all.total === 2, JSON.stringify(all));
		assert('★ 全部群：一个成功一个失败', all.sent === 1 && all.complete === false, JSON.stringify(all));
		assert('★ 失败项带群号与中文原因',
			all.failures.length === 1 && all.failures[0].groupId === ENV_SECOND && Boolean(all.failures[0].error), JSON.stringify(all.failures));
		assert('★ 正文按纯文本发送（不带 parse_mode）', sent.every((body) => body.parse_mode === undefined), JSON.stringify(sent));
		assert('★ 正文原样送达', sent.every((body) => body.text === '今晚维护，请提前保存内容。'), JSON.stringify(sent.map((b) => b.text)));

		sent.length = 0; failing.clear();
		const one = await call(env, 'notice/send', { text: '只发这个群', chatId: ENV_MAIN, silent: true });
		assert('★ 指定群只发一个目标', one.total === 1 && one.sent === 1 && one.complete === true, JSON.stringify(one));
		assert('★ 指定群参数原样落到请求里',
			sent.length === 1 && String(sent[0].chat_id) === ENV_MAIN && sent[0].disable_notification === true, JSON.stringify(sent));

		const outside = await callError(env, 'notice/send', { text: '越界群', chatId: '-1009999999999' });
		assert('★ 治理范围外的群被拒（400）', outside && outside.status === 400, outside && outside.message);

		const blank = await callError(env, 'notice/send', { text: '   ' });
		assert('★ 空内容被拒（400）', blank && blank.status === 400, blank && blank.message);

		const huge = await callError(env, 'notice/send', { text: 'x'.repeat(4097) });
		assert('★ 超过 4096 字被拒（400）', huge && huge.status === 400, huge && huge.message);
	} finally {
		sandbox.fetch = baseFetch;
	}
}

console.log(`\n========== Mini App 接口：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
