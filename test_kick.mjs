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
	OWNER_ID: '999', // 主人=测试用户 999,使现有"私聊发到 999"断言保持有效(走"你自己"分支)
};

// ---------- 测试工具 ----------
let pass = 0, fail = 0;
function assert(name, cond, detail) {
	if (cond) { pass++; console.log(`  ✅ ${name}`); }
	else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

function resetCalls() { apiCalls.length = 0; }
function callsOf(method) { return apiCalls.filter((c) => c.method === method); }

// ---------- [1] /spam 触发:加黑 + 全群踢 + 删消息 + 闪屏 + 私聊详情 ----------
console.log('\n[1] /spam 触发:加黑 + 全群踢 + 删消息 + 闪屏 + 私聊详情');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		// /spam 流程会调:
		// - getChatMember (admin 校验) - 让发送者是管理员
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
		getChat: (b) => {
			const id = String(b.chat_id);
			const titles = { '-1001': '主群', '-1002': '副群' };
			return { ok: true, result: { id: Number(b.chat_id), title: titles[id] || `群${id}`, type: 'supergroup' } };
		},
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
		env, fakeCtx
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
	// 至少 1 次:删除被回复的 msgId=50 那条;闪屏撤回是否调用取决于 ctx 是否同步执行
	const realDelCalls = delCalls.filter((c) => c.body.message_id === 50);
	assert('删除被回复消息 msgId=50 至少 1 次', realDelCalls.length >= 1, `实际 ${realDelCalls.length}`);
	assert('删除发生在举报群 -1001', realDelCalls[0].body.chat_id === -1001);

	// 新断言:/spam 现在走 replyToAdmin 双通道
	const sendCalls = callsOf('sendMessage');
	const groupSends = sendCalls.filter((c) => String(c.body.chat_id) === '-1001');
	const dmSends = sendCalls.filter((c) => String(c.body.chat_id) === '999');
	assert('群内闪屏 sendMessage 至少 1 次', groupSends.length >= 1);
	assert('闪屏含"已加黑"', groupSends[0].body.text.includes('已加黑'));
	assert('私聊详情 sendMessage 1 次', dmSends.length === 1);
	assert('私聊详情含"添加到黑名单"', dmSends[0].body.text.includes('添加到黑名单'));
	assert('私聊详情含群名"主群"', dmSends[0].body.text.includes('主群'));
}

// ---------- [1b] /spam bot 不是管理员 + 删消息失败:错误翻译 ----------
console.log('\n[1b] /spam 错误翻译:CHAT_ADMIN_REQUIRED + 删消息失败');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		// 模拟 -1002 群里 bot 不是管理员
		banChatMember: (b) => {
			if (String(b.chat_id) === '-1002') {
				return { ok: false, error_code: 400, description: 'Bad Request: CHAT_ADMIN_REQUIRED' };
			}
			return { ok: true, result: true };
		},
		// 模拟删消息失败(消息超过 48 小时)
		deleteMessage: () => ({ ok: false, error_code: 400, description: "Bad Request: message can't be deleted" }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});

	const update = {
		message: {
			message_id: 200,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/spam',
			reply_to_message: {
				message_id: 60,
				from: { id: 7777, is_bot: false },
			},
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(
		new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }),
		env, fakeCtx
	);

	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('私聊详情存在', !!dmSend);
	assert('详情含 CHAT_ADMIN_REQUIRED 中文翻译"bot 必须是群管理员"', dmSend.body.text.includes('bot 必须是群管理员'));
	assert('详情含建议"封禁用户"和"删除消息"', dmSend.body.text.includes('封禁用户') && dmSend.body.text.includes('删除消息'));
	assert('详情含删消息失败"该消息无法删除"', dmSend.body.text.includes('该消息无法删除'));
	assert('详情含建议"超过 48 小时"', dmSend.body.text.includes('48'));
}

// ---------- [2] /ban 单条:加黑 + 全群踢 ----------
console.log('\n[2] /ban 123（单条）:加黑 + 全群踢');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
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
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
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
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 1 }, status: 'creator' }] }),
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
		// 这个用户 7777 是某个群的管理员，应被豁免不踢
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 7777 }, status: 'administrator' }, { user: { id: 999 }, status: 'creator' }] }),
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

// ---------- [10] 群内 /ban 单条:加黑 + 全群踢 + 闪屏 + 私聊详情 ----------
console.log('\n[10] 群内 /ban 单条');
{
	resetCalls();
	const ctxCalls = [];
	const fakeCtx = {
		passThroughOnException: () => {},
		waitUntil: (p) => {
			ctxCalls.push('waitUntil');
			// 让 setTimeout 立刻执行(不阻塞测试)
			Promise.resolve(p).catch(() => {});
		}
	};
	// 重写 handler.fetch 调用方式 — 直接调内部 handleMessage 不行因为没暴露
	// 改用 webhook,但要能传 ctx,所以模拟 fetch(request, env, ctx)
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
		getChat: (b) => {
			const id = String(b.chat_id);
			const titles = { '-1001': '主群-技术交流', '-1002': '副群-公告' };
			return { ok: true, result: { id: Number(b.chat_id), title: titles[id] || `群${id}`, type: 'supergroup' } };
		},
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: Math.floor(Math.random() * 1e6) } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 700,
			chat: { id: -1001, type: 'supergroup' }, // 群内
			from: { id: 999, is_bot: false }, // 管理员
			text: '/ban 123',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('用户 123 已加黑', blacklist.some((e) => e.id === '123'));

	const banCalls = callsOf('banChatMember');
	assert('banChatMember 调用 2 次（两个群）', banCalls.length === 2);

	const sendCalls = callsOf('sendMessage');
	// 期望 2 条 sendMessage:1 群内闪屏 + 1 私聊详情
	assert('sendMessage 调用 2 次（闪屏 + 私聊详情）', sendCalls.length === 2, `实际 ${sendCalls.length}`);

	const groupSend = sendCalls.find((c) => String(c.body.chat_id) === '-1001');
	const dmSend = sendCalls.find((c) => String(c.body.chat_id) === '999');
	assert('群内闪屏发到 -1001', !!groupSend);
	assert('闪屏文本是简短确认', groupSend.body.text.includes('已加黑'));
	assert('私聊发到管理员 999', !!dmSend);
	assert('私聊含汇总头', dmSend.body.text.includes('已从全部'));
	assert('私聊详情含群名 主群-技术交流', dmSend.body.text.includes('主群-技术交流'));
	assert('私聊详情含群名 副群-公告', dmSend.body.text.includes('副群-公告'));
	assert('私聊详情含群 ID -1001', dmSend.body.text.includes('-1001'));
	assert('私聊详情含群 ID -1002', dmSend.body.text.includes('-1002'));

	assert('ctx.waitUntil 至少调用 1 次（用于撤回闪屏）', ctxCalls.length >= 1);
}

// ---------- [10b] 群内 /ban 单条 + 部分群失败:友好错误翻译 ----------
console.log('\n[10b] 群内 /ban 单条 + 部分群失败');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		// -1001 成功,-1002 返回权限不足
		banChatMember: (b) => {
			if (String(b.chat_id) === '-1002') {
				return { ok: false, error_code: 400, description: 'Bad Request: not enough rights to restrict/unrestrict chat member' };
			}
			return { ok: true, result: true };
		},
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 750,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/ban 456',
		},
	};
	// 关键:让伪 fetch 看到 banChatMember 的失败响应作为 200
	// 因为 makeFetchMock 默认包成 { ok: true, status: 200 } —— 但 result.ok 才是 Telegram 的 ok
	// 所以这里 result.ok 是 false,banUserFromGroup 应该读取 result.description 走 translate
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('部分失败:私聊回执存在', !!dmSend);
	assert('部分失败:汇总显示踢出 1/2', dmSend.body.text.includes('1/2'));
	assert('部分失败:含友好原因（权限不足）', dmSend.body.text.includes('权限不足'));
	assert('部分失败:含建议（封禁用户）', dmSend.body.text.includes('封禁用户'));
}

// ---------- [11] 群内 /ban 批量 ----------
console.log('\n[11] 群内 /ban 批量');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `测试群${b.chat_id}`, type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 555 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 800,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/ban 100,200,300',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('3 个用户全部加黑', blacklist.length === 3);

	// 3 用户 × 2 群 = 6 次 ban
	assert('banChatMember 调用 6 次', callsOf('banChatMember').length === 6);

	const sendCalls = callsOf('sendMessage');
	assert('sendMessage 调用 2 次（闪屏+私聊详情）', sendCalls.length === 2);
	const dmSend = sendCalls.find((c) => String(c.body.chat_id) === '999');
	assert('私聊详情含批量结果', dmSend.body.text.includes('批量添加完成'));
	assert('私聊详情含每个用户', dmSend.body.text.includes('100') && dmSend.body.text.includes('200') && dmSend.body.text.includes('300'));
	assert('私聊详情含逐用户明细', dmSend.body.text.includes('逐用户踢人明细'));
	assert('私聊详情含群名', dmSend.body.text.includes('测试群-1001') && dmSend.body.text.includes('测试群-1002'));
}

// ---------- [12] 群内 /unban 单条 ----------
console.log('\n[12] 群内 /unban 单条');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 666 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 900,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/unban 8888',
		},
	};
	const env = {
		...baseEnv,
		KV: makeFakeKV([{ id: '8888', reason: 'spam', by: '999', at: '2026-05-01T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('8888 已从黑名单移除', !blacklist.some((e) => e.id === '8888'));

	// /unban 不调 banChatMember
	assert('banChatMember 没调用', callsOf('banChatMember').length === 0);

	const sendCalls = callsOf('sendMessage');
	assert('sendMessage 调用 2 次（闪屏+私聊）', sendCalls.length === 2);
	const groupSend = sendCalls.find((c) => String(c.body.chat_id) === '-1001');
	assert('群内闪屏含"已移黑"', groupSend.body.text.includes('已移黑'));
}

// ---------- [13] 私聊 /ban 单条:行为不变(向后兼容) ----------
console.log('\n[13] 私聊 /ban 单条向后兼容');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 777 } }),
	});

	const update = {
		message: {
			message_id: 1000,
			chat: { id: 999, type: 'private' }, // 私聊
			from: { id: 999, is_bot: false },
			text: '/ban 123',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	// 私聊场景:只发 1 次详情,不发闪屏
	const sendCalls = callsOf('sendMessage');
	assert('私聊场景 sendMessage 只调用 1 次', sendCalls.length === 1, `实际 ${sendCalls.length}`);
	assert('回执直接发到私聊 999', String(sendCalls[0].body.chat_id) === '999');
	// 私聊场景不应触发闪屏自删
	assert('deleteMessage 没被调用（无闪屏需要撤回）', callsOf('deleteMessage').length === 0);
}

// ---------- [14] 群内非管理员发 /ban:静默忽略 ----------
console.log('\n[14] 群内非管理员发 /ban 静默忽略');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		// 让发送者不是管理员
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 1 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 888 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 1100,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 5555, is_bot: false }, // 普通用户
			text: '/ban 123',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('未加黑（无权）', blacklist.length === 0);
	assert('banChatMember 未调用', callsOf('banChatMember').length === 0);
	assert('sendMessage 未调用（群内静默）', callsOf('sendMessage').length === 0);
}

// ---------- [15] 私聊主人投递失败 → 仅记日志,不追加群内提示 ----------
console.log('\n[15] 私聊主人投递失败仅日志');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	let dmAttempts = 0;
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: (b) => {
			// 私聊（chat_id 正数 = 用户)失败,群发(负数)成功
			if (Number(b.chat_id) > 0) {
				dmAttempts++;
				return { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' };
			}
			return { ok: true, result: { message_id: 999 } };
		},
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 1200,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/ban 123',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	assert('尝试私聊主人', dmAttempts === 1);
	const groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	// 新行为:私聊失败时,群里只发"闪屏成功提示",不再追加"私聊机器人"二次提示
	assert('群里仅发 1 次（仅闪屏,不追加二次提示）', groupSends.length === 1, `实际 ${groupSends.length}`);
	assert('闪屏文本含"已加黑"', groupSends[0].body.text.includes('已加黑'));
}

// ---------- [16] 群管理员只在某一个群是 admin → 应能用所有命令 ----------
console.log('\n[16] 群管理员只在 GROUP_IDS 第二个群是 admin');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		// 用户 6666 不在群 -1001 的 admin 列表里,但在群 -1002 是 administrator
		getChatAdministrators: (b) => {
			if (String(b.chat_id) === '-1001') return { ok: true, result: [{ user: { id: 1 }, status: 'creator' }] };
			if (String(b.chat_id) === '-1002') return { ok: true, result: [{ user: { id: 6666 }, status: 'administrator' }] };
		},
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: {
			message_id: 1,
			chat: { id: -1001, type: 'supergroup' }, // 在群 -1001 发命令
			from: { id: 6666, is_bot: false },       // 但 6666 是群 -1002 的 admin
			text: '/ban 555',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('用户在第二个群是 admin → /ban 触发,加黑成功', blacklist.length === 1 && blacklist[0].id === '555');
	assert('全群踢人 banChatMember 调用 2 次', callsOf('banChatMember').length === 2);
}

// ---------- [17] 普通用户不是任何群的 admin → 静默忽略 ----------
console.log('\n[17] 全 miss:普通用户发 /ban 静默');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 1 }, status: 'creator' }] }), // 不含 6666
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: {
			message_id: 1,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 6666, is_bot: false }, // 普通用户
			text: '/ban 555',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('普通用户 → /ban 不触发,黑名单为空', blacklist.length === 0);
	assert('未调 banChatMember', callsOf('banChatMember').length === 0);
	assert('群内静默,无 sendMessage', callsOf('sendMessage').length === 0);
}

// ---------- [18] 部分群 getChatAdministrators 失败,但其它群命中 → 仍生效 ----------
console.log('\n[18] 单群查询失败不阻塞:其它群命中仍有效');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => {
			if (String(b.chat_id) === '-1001') return { ok: false, error_code: 400, description: 'Bad Request: chat not found' };
			if (String(b.chat_id) === '-1002') return { ok: true, result: [{ user: { id: 7777 }, status: 'creator' }] };
		},
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: {
			message_id: 1,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 7777, is_bot: false },
			text: '/ban 555',
		},
	};
	const env = { ...baseEnv, KV: makeFakeKV([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('单群失败不阻塞 → /ban 仍触发', blacklist.length === 1);
}

// ---------- [19] SUPER_ADMINS 用户即使不在任何群也能用所有命令 ----------
console.log('\n[19] SUPER_ADMINS 直接放行');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	// 模拟:SUPER_ADMINS = ['11111'](通过 env 注入), 用户 11111 不在任何群的 admin 列表
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 1 }, status: 'creator' }] }), // 11111 不在
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: {
			message_id: 1,
			chat: { id: 11111, type: 'private' }, // 私聊
			from: { id: 11111, is_bot: false },
			text: '/ban 555',
		},
	};
	// 关键:把 SUPER_ADMINS 注入 env
	const env = { ...baseEnv, SUPER_ADMINS: '11111', KV: makeFakeKV([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('SUPER_ADMINS 即使不在群里也能用 /ban', blacklist.length === 1 && blacklist[0].id === '555');
	// 不应该调 getChatAdministrators(super 短路返回 true)
	assert('SUPER_ADMINS 路径短路:不查群 admin 列表', callsOf('getChatAdministrators').length === 0);
}

// ===== 主人审计通知系统专项测试([20]-[24]) =====

// ---------- [20] OWNER_ID 未配置 → 不发任何私聊 ----------
console.log('\n[20] OWNER_ID 未配置:仅群闪屏,无私聊');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: '/ban 555' },
	};
	// 关键:不传 OWNER_ID
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', KV: makeFakeKV([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const dmSends = callsOf('sendMessage').filter((c) => Number(c.body.chat_id) > 0);
	assert('OWNER_ID 未配置时无任何私聊', dmSends.length === 0);
	const groupSends = callsOf('sendMessage').filter((c) => Number(c.body.chat_id) < 0);
	assert('群闪屏仍然发出', groupSends.length === 1);
}

// ---------- [21] OWNER_ID 已配置 + 主人=触发者 → 含"你自己" ----------
console.log('\n[21] 主人=触发者:详情含"你自己"');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false, first_name: '主人' }, text: '/ban 555' },
	};
	// OWNER_ID = 999(就是触发者)
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', KV: makeFakeKV([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人收到私聊详情', !!dmSend);
	assert('详情含"你自己"标记', dmSend.body.text.includes('你自己'));
	assert('详情含"主人操作通知"标题', dmSend.body.text.includes('主人操作通知'));
}

// ---------- [22] OWNER_ID 已配置 + 触发者非主人 → 主人收审计,触发者不收 ----------
console.log('\n[22] 群管理员触发:主人收审计,触发者零私信');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		// 7777 是群管理员
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 7777 }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '台风' }, text: '/ban 555' },
	};
	// OWNER_ID = 999(主人) ≠ 触发者 7777
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', KV: makeFakeKV([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	const triggerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('主人 999 收到审计通知', !!ownerDm);
	assert('触发者 7777 完全不收私信', !triggerDm);
	assert('审计含"群管理员操作通知"标题', ownerDm.body.text.includes('群管理员操作通知'));
	assert('审计含操作人名"台风"', ownerDm.body.text.includes('台风'));
	assert('审计含角色标签"群管理员"', ownerDm.body.text.includes('群管理员'));
	assert('审计含"群内"来源标记', ownerDm.body.text.includes('群内'));
	assert('审计含完整详情(踢人结果)', ownerDm.body.text.includes('已从全部'));
}

// ---------- [23] 一键解封按钮 → 主人收到独立审计通知 ----------
console.log('\n[23] 一键解封按钮:主人收审计');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		editMessageText: () => ({ ok: true, result: true }),
		editMessageReplyMarkup: () => ({ ok: true, result: true }),
		answerCallbackQuery: () => ({ ok: true, result: true }),
	});
	const cbUpdate = {
		callback_query: {
			id: 'cb-1',
			from: { id: 8888, is_bot: false, first_name: '某超管' },
			message: { message_id: 100, chat: { id: -1001, type: 'supergroup' }, text: 'GKY二次审核内容' },
			data: 'gky:a:55555:-1001',
		},
	};
	// OWNER_ID = 999, SUPER_ADMINS 含 8888 才能让按钮通过权限校验
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', SUPER_ADMINS: '8888,999', KV: makeFakeKV([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(cbUpdate) }), env);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人 999 收到一键解封审计', !!ownerDm);
	assert('审计含"超级管理员操作通知"', ownerDm.body.text.includes('超级管理员操作通知'));
	assert('审计含"一键解封代发"', ownerDm.body.text.includes('一键解封代发'));
	assert('审计含操作人名"某超管"', ownerDm.body.text.includes('某超管'));
	assert('审计含目标用户 55555', ownerDm.body.text.includes('55555'));
}

// ---------- [24] chat_member 手动 ban → 主人收审计 ----------
console.log('\n[24] chat_member 手动 ban:主人收审计');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const cmUpdate = {
		chat_member: {
			chat: { id: -1001, type: 'supergroup', title: '主群' },
			from: { id: 7777, is_bot: false, first_name: '台风' },
			old_chat_member: { user: { id: 5555 }, status: 'member' },
			new_chat_member: { user: { id: 5555, first_name: '广告号' }, status: 'kicked' },
			date: Math.floor(Date.now() / 1000),
		},
	};
	// OWNER_ID = 999, 触发者 7777 ≠ 主人
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', KV: makeFakeKV([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(cmUpdate) }), env);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人 999 收到 chat_member 审计', !!ownerDm);
	assert('审计含"群管理员操作通知"', ownerDm.body.text.includes('群管理员操作通知'));
	assert('审计含"群内手动 加黑"', ownerDm.body.text.includes('群内手动 加黑'));
	assert('审计含操作人"台风"', ownerDm.body.text.includes('台风'));
	assert('审计含目标"广告号"', ownerDm.body.text.includes('广告号'));
	// 状态变更已翻译为中文
	assert('审计含中文状态"普通成员"', ownerDm.body.text.includes('普通成员'));
	assert('审计含中文状态"已踢出"', ownerDm.body.text.includes('已踢出'));
}

// ---------- [25] 重复添加已黑用户:字段齐全 + "已在黑名单"提示 ----------
console.log('\n[25] 重复加黑同一用户:详情字段齐全');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 7777 }, status: 'administrator' }] }),
		// 拉群名 + 拉用户名,都给个像样的返回
		getChat: (b) => {
			const id = String(b.chat_id);
			if (id === '-1001') return { ok: true, result: { id: -1001, title: '主群', type: 'supergroup' } };
			if (id === '-1002') return { ok: true, result: { id: -1002, title: '副群', type: 'supergroup' } };
			return { ok: true, result: { id: Number(id), title: `群${id}`, type: 'supergroup' } };
		},
		getChatMember: (b) => {
			// 让目标用户 12345 拉得到名字
			if (Number(b.user_id) === 12345) {
				return { ok: true, result: { status: 'kicked', user: { id: 12345, first_name: '广告号' } } };
			}
			return { ok: true, result: { status: 'member', user: { id: Number(b.user_id) } } };
		},
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '台风' }, text: '/ban 12345' },
	};
	// 关键:KV 已经有 12345 → addToBlacklist 返回失败"已在黑名单"
	const env = {
		TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999',
		KV: makeFakeKV([{ id: '12345', reason: 'manual', by: '999', at: '2026-05-01T00:00:00Z' }]),
	};
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人收到通知', !!ownerDm);
	assert('字段:操作含"加入黑名单"', ownerDm.body.text.includes('加入黑名单'));
	assert('字段:目标用户名"广告号"', ownerDm.body.text.includes('广告号'));
	assert('字段:目标用户ID 12345', ownerDm.body.text.includes('12345'));
	assert('字段:操作人"台风"', ownerDm.body.text.includes('台风'));
	assert('失败提示:含"已在黑名单"', ownerDm.body.text.includes('已在黑名单'));
	assert('失败提示:含"请勿重复添加"', ownerDm.body.text.includes('请勿重复添加'));
}

// ---------- [26] 机器人操作 chat_member → 不通知主人 ----------
console.log('\n[26] 机器人(其它bot)手动操作:不通知主人');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const cmUpdate = {
		chat_member: {
			chat: { id: -1001, type: 'supergroup', title: '主群' },
			from: { id: 5566001122, is_bot: true, first_name: 'nmBot' }, // 操作人是机器人
			old_chat_member: { user: { id: 5555 }, status: 'member' },
			new_chat_member: { user: { id: 5555, first_name: 'Spammer' }, status: 'kicked' },
			date: Math.floor(Date.now() / 1000),
		},
	};
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', KV: makeFakeKV([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(cmUpdate) }), env);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('机器人操作 → 主人不收通知', !ownerDm);
}

// ---------- [27] 匿名管理员(GroupAnonymousBot)操作 → 仍通知主人 ----------
console.log('\n[27] 匿名管理员操作:仍通知主人');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const cmUpdate = {
		chat_member: {
			chat: { id: -1001, type: 'supergroup', title: '主群' },
			// 1087968824 = GroupAnonymousBot,真人开了匿名管理身份
			from: { id: 1087968824, is_bot: true, first_name: 'Group' },
			old_chat_member: { user: { id: 6666 }, status: 'member' },
			new_chat_member: { user: { id: 6666, first_name: '广告' }, status: 'kicked' },
			date: Math.floor(Date.now() / 1000),
		},
	};
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', KV: makeFakeKV([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(cmUpdate) }), env);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('匿名管理员操作 → 主人仍收通知', !!ownerDm);
	assert('通知含目标"广告"', ownerDm.body.text.includes('广告'));
}

// ===== 广告自动检测专项测试([28]-[37]) =====
// 共用的 mock + env 构造
// 广告词库种子(对应代码里 RECOMMENDED_AD_KEYWORDS,测试用明文即可)
const AD_KW_SEED = {
	finance: ['usdt', 'u商', '承兑', '刷单', '日入', '出u', '接u', '搬砖', '套利', '包网', '价格拉满'],
	porn: ['约炮', '萝莉', '福利姬', '看片', '裸聊', '乱伦', '不雅视频', '色色', '免费看', '资源群'],
	spam: ['加我', '加微', '加v', '私聊', '进群', '拉你', '详情看', '添加好友', '发送信息'],
	fraud: ['假钞', '假币', '高仿', '办证', '代开发票', '黑客接单', '网赚', '菠菜', '交流群'],
	general: [],
	whitelist: [],
};
// 构造一个已预置广告词库的 fake KV
function makeAdKV(extra = {}) {
	const kv = makeFakeKV([]);
	kv._store.set('ad_keywords_custom', JSON.stringify({ ...AD_KW_SEED, ...extra }));
	return kv;
}
const adEnv = (extra = {}) => ({
	TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999',
	AD_FILTER_ENABLED: 'true',
	KV: makeAdKV(),
	...extra,
});
const adFetchMock = () => makeFetchMock({
	// 普通成员(非管理员):admin 列表不含发广告的人
	getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
	getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
	banChatMember: () => ({ ok: true, result: true }),
	deleteMessage: () => ({ ok: true, result: true }),
	sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
});
const adMsg = (over = {}) => ({
	message: {
		message_id: 1,
		chat: { id: -1001, type: 'supergroup' },
		from: { id: 88001, is_bot: false, first_name: '路人' },
		text: '',
		...over,
	},
});
const fakeCtxAd = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };

// ---------- [28] 强特征 t.me/+ 邀请链接 → 删黑踢 ----------
console.log('\n[28] 强特征 t.me 邀请链接');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const env = adEnv();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '进群看资源 https://t.me/+VvUVmr4ON8A4MjU9' })) }), env, fakeCtxAd);
	assert('t.me邀请链接 → 删消息', callsOf('deleteMessage').length >= 1);
	assert('t.me邀请链接 → 全群踢(2群)', callsOf('banChatMember').length === 2);
	const bl = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('t.me邀请链接 → 加黑 reason=ad_auto', bl.some((e) => e.id === '88001' && e.reason === 'ad_auto'));
}

// ---------- [29] 强特征 国际电话号 → 删黑踢 ----------
console.log('\n[29] 强特征 国际电话号');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const env = adEnv();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '假钞交流群 快递面交都可 +1 484 842 6117' })) }), env, fakeCtxAd);
	assert('电话号 → 删消息', callsOf('deleteMessage').length >= 1);
	assert('电话号 → 全群踢', callsOf('banChatMember').length === 2);
}

// ---------- [30] 金融广告评分达阈值 ----------
console.log('\n[30] 金融广告评分(出u+承兑)');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const env = adEnv();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '专业出u承兑,日入过万' })) }), env, fakeCtxAd);
	const bl = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('金融广告 → 加黑', bl.some((e) => e.id === '88001'));
	assert('金融广告 → 踢人', callsOf('banChatMember').length === 2);
}

// ---------- [31] 色情广告评分达阈值 ----------
console.log('\n[31] 色情广告评分');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const env = adEnv();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '免费看片 约炮资源群' })) }), env, fakeCtxAd);
	const bl = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('色情广告 → 加黑', bl.some((e) => e.id === '88001'));
}

// ---------- [32] 用户名是广告词 → 删黑踢 ----------
console.log('\n[32] 用户名是广告词');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const env = adEnv();
	// 文本无害,但 first_name 含 usdt+承兑
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ from: { id: 88001, is_bot: false, first_name: '爆u承兑usdt项目' }, text: '大家好' })) }), env, fakeCtxAd);
	const bl = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('用户名广告 → 加黑', bl.some((e) => e.id === '88001'));
}

// ---------- [33] 单个 usdt 不达阈值 → 不误杀 ----------
console.log('\n[33] 单词 usdt 不误杀');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const env = adEnv();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '请问 usdt 怎么提现到银行卡' })) }), env, fakeCtxAd);
	const bl = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('单词 usdt(+2 < 阈值3)→ 不加黑', !bl.some((e) => e.id === '88001'));
	assert('单词 usdt → 不删消息', callsOf('deleteMessage').length === 0);
	assert('单词 usdt → 不踢', callsOf('banChatMember').length === 0);
}

// ---------- [34] 白名单命中 → 不计分不杀 ----------
console.log('\n[34] 白名单命中不杀');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	// 把 usdt 和 承兑 加白名单 → 即使两个都出现也不计分
	const env = adEnv({ AD_WHITELIST: 'usdt,承兑' });
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '我想了解 usdt 承兑的流程' })) }), env, fakeCtxAd);
	const bl = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('白名单词 → 不加黑', !bl.some((e) => e.id === '88001'));
}

// ---------- [35] 管理员发广告 → 豁免 ----------
console.log('\n[35] 管理员发广告豁免');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		// 88001 是管理员
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 88001 }, status: 'administrator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env = adEnv();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '出u承兑日入过万 +1 484 842 6117' })) }), env, fakeCtxAd);
	const bl = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('管理员发广告 → 不加黑(豁免)', !bl.some((e) => e.id === '88001'));
	assert('管理员发广告 → 不删消息', callsOf('deleteMessage').length === 0);
}

// ---------- [36] AD_FILTER_ENABLED=false → 完全不检测 ----------
console.log('\n[36] 开关关闭不检测');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', KV: makeFakeKV([]) }; // 不设 AD_FILTER_ENABLED
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '出u承兑 +1 484 842 6117 t.me/+abc' })) }), env, fakeCtxAd);
	const bl = JSON.parse(env.KV._store.get('blacklist') || '[]');
	assert('开关关 → 不加黑', !bl.some((e) => e.id === '88001'));
	assert('开关关 → 不删消息', callsOf('deleteMessage').length === 0);
}

// ---------- [37] 主人收到广告拦截通知 ----------
console.log('\n[37] 主人收到广告拦截通知');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const env = adEnv();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '假钞交流群 +1 484 842 6117' })) }), env, fakeCtxAd);
	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人收到广告拦截通知', !!ownerDm);
	assert('通知含"广告自动拦截"', ownerDm.body.text.includes('广告自动拦截'));
	assert('通知含判定依据', ownerDm.body.text.includes('判定依据'));
	assert('通知含内容预览', ownerDm.body.text.includes('内容预览'));
}

// ===== 广告词库热更新命令测试([38]-[43]) =====

// ---------- [38] 主人 /addword 写入 KV ----------
console.log('\n[38] 主人 /addword 写入 KV');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const kv = makeFakeKV([]); // 空词库
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', AD_FILTER_ENABLED: 'true', KV: kv };
	// 主人私聊发 /addword fraud 杀猪盘
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false, first_name: '主人' }, text: '/addword fraud 杀猪盘 刷信誉' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const stored = JSON.parse(kv._store.get('ad_keywords_custom') || '{}');
	assert('/addword 写入 fraud 分类', stored.fraud && stored.fraud.includes('杀猪盘') && stored.fraud.includes('刷信誉'));
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人收到回执', !!dm && dm.body.text.includes('杀猪盘'));
}

// ---------- [39] /addword 加的词能命中后续广告 ----------
console.log('\n[39] /addword 后该词能命中');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	// KV 里预置 general:[杀猪盘](权重 +2,但阈值 3,需要两个词。这里加两个 general 词凑分)
	const kv = makeFakeKV([]);
	kv._store.set('ad_keywords_custom', JSON.stringify({ finance: [], porn: [], spam: [], fraud: ['杀猪盘', '刷信誉'], general: [], whitelist: [] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', AD_FILTER_ENABLED: 'true', KV: kv };
	// 普通成员发含两个 fraud 词(各+2=4 ≥ 3)
	const update = { message: { message_id: 2, chat: { id: -1001, type: 'supergroup' }, from: { id: 88002, is_bot: false, first_name: '路人' }, text: '专业杀猪盘刷信誉' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(kv._store.get('blacklist') || '[]');
	assert('KV 自定义词命中 → 加黑', bl.some((e) => e.id === '88002'));
	assert('KV 自定义词命中 → 踢人', callsOf('banChatMember').length === 2);
}

// ---------- [40] /delword 删词后不再命中 ----------
console.log('\n[40] /delword 删词');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const kv = makeFakeKV([]);
	kv._store.set('ad_keywords_custom', JSON.stringify({ finance: ['usdt'], porn: [], spam: [], fraud: ['杀猪盘'], general: [], whitelist: [] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', AD_FILTER_ENABLED: 'true', KV: kv };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/delword 杀猪盘' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const stored = JSON.parse(kv._store.get('ad_keywords_custom') || '{}');
	assert('/delword 从 fraud 删除杀猪盘', !stored.fraud.includes('杀猪盘'));
	assert('/delword 不影响其它词 usdt', stored.finance.includes('usdt'));
}

// ---------- [41] /listwords 展示 ----------
console.log('\n[41] /listwords 展示');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const kv = makeFakeKV([]);
	kv._store.set('ad_keywords_custom', JSON.stringify({ finance: ['usdt'], porn: [], spam: [], fraud: ['假钞'], general: [], whitelist: ['白词'] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', AD_FILTER_ENABLED: 'true', KV: kv };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/listwords' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/listwords 私聊回执', !!dm);
	assert('展示含 usdt', dm.body.text.includes('usdt'));
	assert('展示含假钞', dm.body.text.includes('假钞'));
	assert('展示含白名单词', dm.body.text.includes('白词'));
}

// ---------- [42] /importdefault 导入推荐词库 ----------
console.log('\n[42] /importdefault 导入');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const kv = makeFakeKV([]); // 空词库
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', AD_FILTER_ENABLED: 'true', KV: kv };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/importdefault' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const stored = JSON.parse(kv._store.get('ad_keywords_custom') || '{}');
	assert('/importdefault 写入 finance 词', stored.finance && stored.finance.length > 0);
	assert('/importdefault 写入 fraud 词', stored.fraud && stored.fraud.length > 0);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人收到导入回执', !!dm && dm.body.text.includes('导入'));
}

// ---------- [43] 非主人用 /addword 被拒 ----------
console.log('\n[43] 非主人 /addword 被拒');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		// 7777 是群管理员但不是主人
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 7777 }, status: 'administrator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const kv = makeFakeKV([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', AD_FILTER_ENABLED: 'true', KV: kv };
	// 群管理员 7777 私聊发 /addword
	const update = { message: { message_id: 1, chat: { id: 7777, type: 'private' }, from: { id: 7777, is_bot: false }, text: '/addword fraud 测试' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const stored = kv._store.get('ad_keywords_custom');
	assert('非主人 → 词库未被修改', !stored);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('非主人 → 收到权限不足提示', !!dm && dm.body.text.includes('权限不足'));
}

// ---------- [44] emoji 走 KV:KV 配 emoji + 1个金融词 → 达阈值 ----------
console.log('\n[44] emoji 经 KV 加载参与评分');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const kv = makeFakeKV([]);
	// finance:[出u](+2) + emoji 密度≥3(+1) = 3 ≥ 阈值
	kv._store.set('ad_keywords_custom', JSON.stringify({ finance: ['出u'], porn: [], spam: [], fraud: [], general: [], whitelist: [], emoji: ['🔥', '💰', '❤️'] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', AD_FILTER_ENABLED: 'true', KV: kv };
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88044, is_bot: false, first_name: '路人' }, text: '出u🔥💰❤️价格好' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(kv._store.get('blacklist') || '[]');
	assert('emoji 经 KV 加载参与评分 → 命中', bl.some((e) => e.id === '88044'));
}

// ---------- [45] emoji 默认空:仅 emoji 无 KV 配 → 不计分不误杀 ----------
console.log('\n[45] emoji 默认空不误杀');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const kv = makeFakeKV([]); // 完全空词库
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_ID: '999', AD_FILTER_ENABLED: 'true', KV: kv };
	// 一堆 emoji 但无词库配置 → 不该被杀(emoji 默认空)
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88045, is_bot: false, first_name: '开心' }, text: '今天好开心🔥💰❤️😍🎉' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(kv._store.get('blacklist') || '[]');
	assert('emoji 默认空 → 纯 emoji 不误杀', !bl.some((e) => e.id === '88045'));
	assert('emoji 默认空 → 不删消息', callsOf('deleteMessage').length === 0);
}

// ---------- 总结 ----------
console.log(`\n=== 总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
