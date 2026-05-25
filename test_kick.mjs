// 全局黑名单真踢人闭环离线测试
// 覆盖:
//   - /ban /spam 触发后真的调用了 banChatMember
//   - /spam 还会调 deleteMessage
//   - 群消息黑名单拦截（普通用户被删消息+踢人，管理员豁免）
//   - chat_member 复入群分支（黑名单用户进群 → banChatMember）
//   - /{TOKEN}/purge 端点扫描+清扫

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '_worker.js'), 'utf8');

// 复用 test_export.mjs 的 stripper
function stripExportDefault(source) {
	const start = source.indexOf('export default');
	const braceStart = source.indexOf('{', start);
	let depth = 0;
	let i = braceStart;
	for (; i < source.length; i++) {
		if (source[i] === '{') depth++;
		else if (source[i] === '}') {
			depth--;
			if (depth === 0) { i++; break; }
		}
	}
	if (source[i] === ';') i++;
	return source.slice(0, start) + 'globalThis.__handler = ' + source.slice(start + 'export default'.length, i) + ';' + source.slice(i);
}

// 拦截 fetch:记录所有 Telegram API 调用
const apiCalls = [];
function makeFetchMock(routes) {
	return async function (url, init) {
		const u = String(url);
		// 记录所有 telegram api
		if (u.includes('api.telegram.org')) {
			const method = u.split('/').pop();
			const body = init && init.body ? JSON.parse(init.body) : null;
			apiCalls.push({ method, body });
			// routes 是 method → fn(body) 映射,返回模拟响应
			const handler = routes[method];
			if (handler) {
				const res = handler(body);
				return { ok: true, status: 200, async json() { return res; } };
			}
			return { ok: true, status: 200, async json() { return { ok: true, result: true }; } };
		}
		throw new Error('Unexpected fetch: ' + u);
	};
}

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: null, // 占位，每个测试覆盖
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });

const handler = sandbox.__handler;

// ---------- 伪 KV/D1 ----------
function makeFakeDB(seed = []) {
	const rows = new Map(seed.map((r) => [String(r.id), { ...r, id: String(r.id) }]));
	return {
		_rows: rows,
		exec: async () => {},
		prepare(sql) {
			let bound = [];
			return {
				bind(...args) { bound = args; return this; },
				async first() {
					if (sql.startsWith('SELECT id FROM blacklist WHERE id = ?')) {
						const id = bound[0];
						return rows.has(id) ? { id } : null;
					}
					return null;
				},
				async run() {
					if (sql.startsWith('INSERT INTO blacklist')) {
						const [id, reason, by, at] = bound;
						rows.set(id, { id, reason, by_user: by, at });
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('DELETE FROM blacklist WHERE id = ?')) {
						const had = rows.delete(bound[0]);
						return { meta: { changes: had ? 1 : 0 } };
					}
					return { meta: { changes: 0 } };
				},
				async all() {
					return { results: [...rows.values()] };
				},
			};
		},
	};
}

function makeFakeKV(seed) {
	const store = new Map();
	if (seed) store.set('blacklist', JSON.stringify(seed));
	return {
		_store: store,
		async get(k, opts) {
			const v = store.get(k);
			if (v === undefined) return null;
			if (opts && opts.type === 'json') return JSON.parse(v);
			return v;
		},
		async put(k, v) { store.set(k, v); },
		async delete(k) { store.delete(k); },
	};
}

const TOKEN = 'TT';
const baseEnv = {
	TOKEN,
	BOT_TOKEN: '0:fake',
	GROUP_ID: '-1001,-1002', // 两个配置群
};

// ---------- 测试工具 ----------
let pass = 0, fail = 0;
function assert(name, cond, detail) {
	if (cond) { pass++; console.log(`  ✅ ${name}`); }
	else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

function resetCalls() { apiCalls.length = 0; }
function callsOf(method) { return apiCalls.filter((c) => c.method === method); }

// ---------- [1] /spam 触发:加黑 + 全群踢 + 删消息 ----------
console.log('\n[1] /spam 触发:加黑 + 全群踢 + 删消息');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		// /spam 流程会调:
		// - getChatMember (admin 校验) - 让发送者是管理员
		getChatMember: (b) => ({ ok: true, result: { status: 'administrator', user: { id: b.user_id } } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 999 } }),
	});

	const update = {
		message: {
			message_id: 100,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/spam',
			reply_to_message: {
				message_id: 50,
				from: { id: 8888, is_bot: false }, // 被举报的用户
			},
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	const res = await handler.fetch(
		new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }),
		env
	);
	assert('webhook 返回 OK', res.status === 200);

	const blacklist = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('被举报用户 8888 已加入黑名单', blacklist.some((e) => e.id === '8888'));

	const banCalls = callsOf('banChatMember');
	assert('banChatMember 调用 2 次（两个群）', banCalls.length === 2, `实际 ${banCalls.length}`);
	assert('banChatMember 用户ID 都是 8888', banCalls.every((c) => c.body.user_id === 8888));
	const banGroups = banCalls.map((c) => String(c.body.chat_id)).sort();
	assert('两个群 ID 都被覆盖', JSON.stringify(banGroups) === JSON.stringify(['-1001', '-1002']), `实际 ${JSON.stringify(banGroups)}`);

	const delCalls = callsOf('deleteMessage');
	assert('deleteMessage 调用 1 次', delCalls.length === 1);
	assert('删除的是被回复消息 msgId=50', delCalls[0].body.message_id === 50);
	assert('删除发生在举报群 -1001', delCalls[0].body.chat_id === -1001);
}

// ---------- [2] /ban 单条:加黑 + 全群踢 ----------
console.log('\n[2] /ban 123（单条）:加黑 + 全群踢');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatMember: (b) => ({ ok: true, result: { status: 'administrator', user: { id: b.user_id } } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 999 } }),
	});

	const update = {
		message: {
			message_id: 200,
			chat: { id: 999, type: 'private' }, // 私聊
			from: { id: 999, is_bot: false },
			text: '/ban 123',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const blacklist = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('123 已加入黑名单', blacklist.some((e) => e.id === '123'));

	const banCalls = callsOf('banChatMember');
	assert('banChatMember 调用 2 次', banCalls.length === 2);
	assert('用户 ID 是 123', banCalls.every((c) => c.body.user_id === 123));
}

// ---------- [3] /ban 批量:每个用户都遍历群踢 ----------
console.log('\n[3] /ban 100,200,300（批量）');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatMember: (b) => ({ ok: true, result: { status: 'administrator', user: { id: b.user_id } } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 999 } }),
	});

	const update = {
		message: {
			message_id: 300,
			chat: { id: 999, type: 'private' },
			from: { id: 999, is_bot: false },
			text: '/ban 100,200,300',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const banCalls = callsOf('banChatMember');
	// 3 用户 × 2 群 = 6 次
	assert('banChatMember 调用 6 次', banCalls.length === 6, `实际 ${banCalls.length}`);
}

// ---------- [4] 群消息黑名单拦截 ----------
console.log('\n[4] 黑名单用户在群里发言 → 删消息 + 踢人');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		// 黑名单用户不是管理员，让 getChatMember 返回 member
		getChatMember: () => ({ ok: true, result: { status: 'member', user: { id: 0 } } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 500,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 8888, is_bot: false }, // 黑名单用户
			text: '我是广告，快加我',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([{ id: '8888', reason: 'spam', by: '999', at: '2026-05-01T00:00:00Z' }]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const delCalls = callsOf('deleteMessage');
	const banCalls = callsOf('banChatMember');
	assert('deleteMessage 调用 1 次', delCalls.length === 1);
	assert('banChatMember 调用 1 次（仅当前群）', banCalls.length === 1);
	assert('踢的是 8888', banCalls[0].body.user_id === 8888);
	assert('删除发生在 -1001', delCalls[0].body.chat_id === -1001);
	assert('删除的是 msgId 500', delCalls[0].body.message_id === 500);
}

// ---------- [5] 管理员被误加黑名单 → 群里发言不被踢（豁免） ----------
console.log('\n[5] 管理员豁免：误加黑的管理员发言不会被踢');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		// 这个用户在多个群是管理员
		getChatMember: (b) => ({ ok: true, result: { status: 'administrator', user: { id: b.user_id } } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 600,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 7777, is_bot: false }, // 假设这人是管理员但被误加黑
			text: '正常发言',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([{ id: '7777', reason: 'manual', by: '999', at: '2026-05-01T00:00:00Z' }]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	assert('deleteMessage 没被调用', callsOf('deleteMessage').length === 0);
	assert('banChatMember 没被调用', callsOf('banChatMember').length === 0);
}

// ---------- [6] chat_member 复入群:黑名单用户被立即踢回 ----------
console.log('\n[6] chat_member 复入群分支');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		banChatMember: () => ({ ok: true, result: true }),
	});

	const update = {
		chat_member: {
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 8888, is_bot: false }, // 自加群:from === target
			old_chat_member: { user: { id: 8888, is_bot: false }, status: 'left' },
			new_chat_member: { user: { id: 8888, is_bot: false }, status: 'member' },
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([{ id: '8888', reason: 'spam', by: '999', at: '2026-05-01T00:00:00Z' }]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const banCalls = callsOf('banChatMember');
	assert('黑名单用户复入群被立即踢', banCalls.length === 1);
	assert('踢的是当前群 -1001', banCalls[0].body.chat_id === -1001);
	assert('用户 ID 是 8888', banCalls[0].body.user_id === 8888);
}

// ---------- [7] chat_member 复入群:非黑名单用户不受影响 ----------
console.log('\n[7] 非黑名单用户复入群不被踢');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		banChatMember: () => ({ ok: true, result: true }),
	});

	const update = {
		chat_member: {
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 5555, is_bot: false },
			old_chat_member: { user: { id: 5555, is_bot: false }, status: 'left' },
			new_chat_member: { user: { id: 5555, is_bot: false }, status: 'member' },
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	assert('普通用户加群不被踢', callsOf('banChatMember').length === 0);
}

// ---------- [8] /{TOKEN}/purge 扫描+清扫 ----------
console.log('\n[8] /{TOKEN}/purge 扫描');
{
	resetCalls();
	// 让 8888 在 -1001 是 member（要踢）,在 -1002 是 left（跳过）
	// 让 9999 在两个群都是 member（要踢两次）
	sandbox.fetch = makeFetchMock({
		getChatMember: (b) => {
			const user = Number(b.user_id);
			const chat = Number(b.chat_id);
			console.log('  [mock getChatMember]', { user, chat });
			if (user === 8888 && chat === -1001) return { ok: true, result: { status: 'member', user: { id: user } } };
			if (user === 8888 && chat === -1002) return { ok: true, result: { status: 'left', user: { id: user } } };
			if (user === 9999) return { ok: true, result: { status: 'member', user: { id: user } } };
			return { ok: true, result: { status: 'left', user: { id: user } } };
		},
		banChatMember: () => ({ ok: true, result: true }),
	});

	const env = {
		...baseEnv,
		KV: makeFakeKV([
			{ id: '8888', reason: 'spam', by: '999', at: '2026-05-01T00:00:00Z' },
			{ id: '9999', reason: 'manual', by: '999', at: '2026-05-02T00:00:00Z' },
		]),
	};
	const res = await handler.fetch(new Request(`https://x.com/${TOKEN}/purge`), env);
	const json = await res.json();

	assert('200 OK', res.status === 200);
	assert('成功:true', json.成功 === true);
	assert('黑名单总数 2', json.黑名单总数 === 2);
	assert('配置群组数 2', json.配置群组数 === 2);
	// 8888 在 -1001 踢一次,在 -1002 跳过 = 1 踢 + 1 不在群
	// 9999 在两个群各踢一次 = 2 踢
	// 总: 已踢 3, 不在群 1
	assert('已踢出 3', json.已踢出 === 3, `实际 ${json.已踢出}`);
	assert('不在群 1', json.不在群 === 1, `实际 ${json.不在群}`);

	const banCalls = callsOf('banChatMember');
	assert('banChatMember 调用 3 次', banCalls.length === 3);
}

// ---------- [9] /{TOKEN}/purge 错误 TOKEN ----------
console.log('\n[9] /purge 错误 TOKEN');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({});
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	const res = await handler.fetch(new Request('https://x.com/WRONG_TOKEN/purge'), env);
	assert('错误 TOKEN 返回 405', res.status === 405);
}

// ---------- 总结 ----------
console.log(`\n=== 总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
