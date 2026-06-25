// 全局黑名单真踢人闭环离线测试
// 覆盖:
//   - /be /sa 触发后真的调用了 banChatMember
//   - /sa 还会调 deleteMessage
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
function makeFetchMock(routes, options = {}) {
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
		if (options.internalHandler) {
			return options.internalHandler(url, init);
		}
		throw new Error('Unexpected fetch: ' + u);
	};
}

async function drainPending(pending) {
	for (let i = 0; i < pending.length; i++) {
		await pending[i];
	}
}

function makeInternalWorkerRequest(url, init = {}) {
	return new Request(url, {
		method: init?.method || 'GET',
		headers: init?.headers,
		body: init?.body,
	});
}

function makeFakeBulkQueue(getEnv, fakeCtx) {
	const queue = {
		sent: [],
		async send(body) {
			queue.sent.push(body);
			await handler.queue({ messages: [{ body }] }, getEnv(), fakeCtx);
		}
	};
	return queue;
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

// ---------- 伪 D1 ----------
function makeFakeDB(seed = []) {
	const rows = new Map(seed.map((r) => [String(r.id), { ...r, id: String(r.id), by_user: r.by_user ?? r.by ?? null }]));
	const store = new Map();
	const batchJobs = new Map();
	let recentSeq = 1;
	let moderationSeq = 1;
	const syncBlacklist = () => {
		store.set('blacklist', JSON.stringify([...rows.values()].map((r) => ({
			id: String(r.id),
			reason: r.reason ?? null,
			by: r.by_user ?? r.by ?? null,
			at: r.at ?? null,
		}))));
	};
	const getBlacklistRowsForSql = (sql, bound) => {
		let filterCount = 0;
		let filtered = [...rows.values()];
		const reasonFilter = sql.match(/reason IN\s*\(([^)]+)\)/i);
		if (reasonFilter) {
			filterCount = (reasonFilter[1].match(/\?/g) || []).length;
			const reasons = new Set(bound.slice(0, filterCount).map((value) => String(value)));
			filtered = filtered.filter((r) => reasons.has(String(r.reason ?? '')));
		}
		return {
			filterCount,
			results: filtered
				.map((r) => ({
					id: String(r.id),
					reason: r.reason ?? null,
					by_user: r.by_user ?? r.by ?? null,
					at: r.at ?? null,
				}))
				.sort((a, b) => {
					const byAt = String(a.at ?? '').localeCompare(String(b.at ?? ''));
					return byAt || String(a.id).localeCompare(String(b.id));
				})
		};
	};
	syncBlacklist();
	const getJson = (key, fallback = null) => {
		const raw = store.get(key);
		if (raw === undefined) return fallback;
		return JSON.parse(raw);
	};
	const setJson = (key, value) => store.set(key, JSON.stringify(value));
	return {
		_rows: rows,
		_store: store,
		_jobs: batchJobs,
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
					if (sql.startsWith('SELECT COUNT(*) AS total FROM blacklist')) {
						return { total: getBlacklistRowsForSql(sql, bound).results.length };
					}
					if (sql.startsWith('SELECT data FROM ad_keywords')) {
						const data = store.get('ad_keywords_custom');
						return data ? { data } : null;
					}
					if (sql.startsWith('SELECT data FROM ad_samples')) {
						const data = store.get('ad_samples');
						return data ? { data } : null;
					}
					if (sql.startsWith('SELECT data FROM learn_snapshot')) {
						const data = store.get('learn_snapshot');
						return data ? { data } : null;
					}
					if (sql.startsWith('SELECT id, type, status, payload FROM batch_jobs WHERE id = ?')) {
						return batchJobs.get(bound[0]) || null;
					}
					return null;
				},
				async run() {
					if (sql.startsWith('INSERT OR IGNORE INTO blacklist')) {
						const [id, reason, by, at] = bound;
						if (rows.has(id)) return { meta: { changes: 0 } };
						rows.set(id, { id, reason, by_user: by, at });
						syncBlacklist();
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('DELETE FROM blacklist WHERE id = ?')) {
						const had = rows.delete(bound[0]);
						syncBlacklist();
						return { meta: { changes: had ? 1 : 0 } };
					}
					if (sql.startsWith('INSERT OR REPLACE INTO ad_keywords')) {
						setJson('ad_keywords_custom', JSON.parse(bound[0]));
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('INSERT OR REPLACE INTO ad_samples')) {
						setJson('ad_samples', JSON.parse(bound[0]));
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('INSERT OR REPLACE INTO learn_snapshot')) {
						setJson('learn_snapshot', JSON.parse(bound[0]));
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('INSERT INTO batch_jobs')) {
						const [id, type, status, payload, createdAt, updatedAt] = bound;
						batchJobs.set(id, { id, type, status, payload, created_at: createdAt, updated_at: updatedAt });
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('UPDATE batch_jobs SET status = ?')) {
						const [status, payload, updatedAt, id] = bound;
						const current = batchJobs.get(id) || { id, type: JSON.parse(payload).action, created_at: updatedAt };
						batchJobs.set(id, { ...current, status, payload, updated_at: updatedAt });
						return { meta: { changes: batchJobs.has(id) ? 1 : 0 } };
					}
					if (sql.startsWith('INSERT INTO recent_messages')) {
						const [mid, chatId, chatTitle, text, fromId, fromName, createdAt] = bound;
						const data = getJson('recent_messages', { items: [] });
						data.items.push({
							id: recentSeq++,
							mid,
							chatId,
							chatTitle,
							text,
							fromId,
							fromName,
							at: createdAt,
						});
						setJson('recent_messages', data);
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('INSERT INTO moderation_messages')) {
						const [mid, chatId, fromId, createdAt] = bound;
						const data = getJson('moderation_messages', { items: [] });
						data.items.push({
							id: moderationSeq++,
							mid,
							chatId: String(chatId),
							fromId: String(fromId),
							at: createdAt,
						});
						setJson('moderation_messages', data);
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('DELETE FROM recent_messages WHERE id NOT IN')) {
						const limit = Number(bound[0]) || 50;
						const data = getJson('recent_messages', { items: [] });
						data.items = [...data.items].sort((a, b) => b.id - a.id).slice(0, limit).sort((a, b) => a.id - b.id);
						setJson('recent_messages', data);
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('DELETE FROM moderation_messages WHERE id NOT IN')) {
						const limit = Number(bound[0]) || 200;
						const data = getJson('moderation_messages', { items: [] });
						data.items = [...data.items].sort((a, b) => b.id - a.id).slice(0, limit).sort((a, b) => a.id - b.id);
						setJson('moderation_messages', data);
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('DELETE FROM moderation_messages WHERE chat_id = ? AND from_id = ?')) {
						const [chatId, fromId] = bound;
						const data = getJson('moderation_messages', { items: [] });
						const before = data.items.length;
						data.items = data.items.filter((it) => !(String(it.chatId) === String(chatId) && String(it.fromId) === String(fromId)));
						setJson('moderation_messages', data);
						return { meta: { changes: before - data.items.length } };
					}
					return { meta: { changes: 0 } };
				},
				async all() {
					if (sql.includes('FROM blacklist')) {
						const { filterCount, results } = getBlacklistRowsForSql(sql, bound);
						const limit = Number(bound[filterCount]);
						const offset = Number(bound[filterCount + 1]) || 0;
						if (Number.isFinite(limit)) {
							return { results: results.slice(offset, offset + limit) };
						}
						return { results };
					}
					if (sql.startsWith('SELECT mid FROM moderation_messages')) {
						const [chatId, fromId, limitValue] = bound;
						const limit = Number(limitValue) || 200;
						const data = getJson('moderation_messages', { items: [] });
						return {
							results: data.items
								.filter((it) => String(it.chatId) === String(chatId) && String(it.fromId) === String(fromId))
								.sort((a, b) => b.id - a.id)
								.slice(0, limit)
								.map((it) => ({ mid: it.mid }))
						};
					}
					if (sql.startsWith('SELECT mid, chat_id, chat_title')) {
						const data = getJson('recent_messages', { items: [] });
						return {
							results: data.items.map((it) => ({
								id: it.id,
								mid: it.mid,
								chat_id: it.chatId,
								chat_title: it.chatTitle,
								text: it.text,
								from_id: it.fromId,
								from_name: it.fromName,
								created_at: it.at,
							}))
						};
					}
					return { results: [...rows.values()] };
				},
			};
		},
	};
}

const TOKEN = 'TT';
const baseEnv = {
	TOKEN,
	BOT_TOKEN: '0:fake',
	GROUP_ID: '-1001,-1002', // 两个配置群
	OWNER_IDS: '999', // 主人=测试用户 999,使现有"私聊发到 999"断言保持有效(走"你自己"分支)
};

// ---------- 测试工具 ----------
let pass = 0, fail = 0;
function assert(name, cond, detail) {
	if (cond) { pass++; console.log(`  ✅ ${name}`); }
	else { fail++; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

function resetCalls() { apiCalls.length = 0; }
function callsOf(method) { return apiCalls.filter((c) => c.method === method); }

// ---------- [1] /sa 触发:加黑 + 全群踢 + 当前群近期消息清扫 ----------
console.log('\n[1] /sa 触发:加黑 + 全群踢 + 当前群近期消息清扫');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (p) => { pending.push(Promise.resolve(p)); } };
	sandbox.fetch = makeFetchMock({
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

	const env = { ...baseEnv, DB: makeFakeDB([]) };
	const messages = [
		{ message_id: 40, chat: { id: -1001, type: 'supergroup' }, from: { id: 8888, is_bot: false }, text: '普通一' },
		{ message_id: 41, chat: { id: -1001, type: 'supergroup' }, from: { id: 8888, is_bot: false }, text: '普通二' },
		{ message_id: 42, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false }, text: '别人的消息' },
		{ message_id: 50, chat: { id: -1001, type: 'supergroup' }, from: { id: 8888, is_bot: false }, text: '被引用的原消息' },
		{ message_id: 60, chat: { id: -1002, type: 'supergroup' }, from: { id: 8888, is_bot: false }, text: '别群消息不该被删' },
	];
	for (const msg of messages) {
		await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: msg }) }), env, fakeCtx);
	}
	await drainPending(pending);

	const update = {
		message: {
			message_id: 100,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/sa 广告引流',
			reply_to_message: {
				message_id: 50,
				from: { id: 8888, is_bot: false },
			},
		},
	};
	const res = await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	assert('webhook 返回 OK', res.status === 200);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('被举报用户 8888 已加入黑名单', blacklist.some((e) => e.id === '8888'));

	const banCalls = callsOf('banChatMember');
	assert('banChatMember 调用 2 次（两个群）', banCalls.length === 2, `实际 ${banCalls.length}`);
	assert('banChatMember 用户ID 都是 8888', banCalls.every((c) => String(c.body.user_id) === '8888'));
	assert('/sa 回复全群封禁不跨群撤回消息', banCalls.every((c) => c.body.revoke_messages === false));
	const banGroups = banCalls.map((c) => String(c.body.chat_id)).sort();
	assert('两个群 ID 都被覆盖', JSON.stringify(banGroups) === JSON.stringify(['-1001', '-1002']), `实际 ${JSON.stringify(banGroups)}`);

	const delCalls = callsOf('deleteMessage');
	assert('群内 /sa 指令消息 msgId=100 被删除', delCalls.some((c) => c.body.message_id === 100), `实际 ${delCalls.length}`);
	assert('当前群清扫删除 msgId=40', delCalls.some((c) => String(c.body.chat_id) === '-1001' && c.body.message_id === 40));
	assert('当前群清扫删除 msgId=41', delCalls.some((c) => String(c.body.chat_id) === '-1001' && c.body.message_id === 41));
	assert('当前群清扫删除 msgId=50', delCalls.some((c) => String(c.body.chat_id) === '-1001' && c.body.message_id === 50));
	assert('不删除别人的消息 msgId=42', !delCalls.some((c) => c.body.message_id === 42));
	assert('不删除其它群同用户消息 msgId=60', !delCalls.some((c) => c.body.message_id === 60));

	const sendCalls = callsOf('sendMessage');
	const groupSends = sendCalls.filter((c) => String(c.body.chat_id) === '-1001');
	const dmSends = sendCalls.filter((c) => String(c.body.chat_id) === '999');
	assert('群内闪屏 sendMessage 至少 1 次', groupSends.length >= 1);
	assert('闪屏含"已加黑"', groupSends[0].body.text.includes('已加黑'));
	assert('私聊详情 sendMessage 1 次', dmSends.length === 1);
	assert('私聊详情含当前群近期消息清扫', dmSends[0].body.text.includes('当前群近期消息清扫'));
	assert('私聊详情显示 3/3 清扫成功', dmSends[0].body.text.includes('成功 3/3'));
	assert('私聊详情含群名"主群"', dmSends[0].body.text.includes('主群'));
	assert('/sa 回复模式含命令来源', dmSends[0].body.text.includes('命令来源') && dmSends[0].body.text.includes('-1001'));
	assert('/sa 回复模式含执行原因', dmSends[0].body.text.includes('执行原因:广告引流'));
}
// ---------- [1b] /sa bot 不是管理员 + 删消息失败:错误翻译 ----------
console.log('\n[1b] /sa 错误翻译:CHAT_ADMIN_REQUIRED + 删消息失败');
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
			text: '/sa 广告引流',
			reply_to_message: {
				message_id: 60,
				from: { id: 7777, is_bot: false },
			},
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
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

// ---------- [1b2] /sa USER_ID_INVALID 重试后仍失败:精准提示 ----------
console.log('\n[1b2] /sa USER_ID_INVALID 重试后仍失败');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		banChatMember: (b) => {
			if (String(b.chat_id) === '-1002') {
				return { ok: false, error_code: 400, description: 'Bad Request: USER_ID_INVALID' };
			}
			return { ok: true, result: true };
		},
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 205,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/sa 8899 广告引流',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const banCalls = callsOf('banChatMember');
	assert('/sa USER_ID_INVALID 只对失败群重试一次', banCalls.length === 3 && banCalls.filter((c) => String(c.body.chat_id) === '-1002').length === 2, `实际 ${banCalls.length}`);
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/sa 用户识别失败:私聊回执存在', !!dmSend);
	assert('/sa 用户识别失败:不再误报用户 ID 无效', !dmSend.body.text.includes('用户 ID 无效'));
	assert('/sa 用户识别失败:提示 Telegram 当前无法识别', dmSend.body.text.includes('Telegram 当前无法识别该 TGID'));
	assert('/sa 用户识别失败:建议包含 /sa 重试', dmSend.body.text.includes('重试 /sa'));
}

// ---------- [1c] /sa 大 TGID 不转 Number ----------
console.log('\n[1c] /sa 大 TGID 不转 Number');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 210,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/sa 7965398892 广告引流',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const banCalls = callsOf('banChatMember');
	assert('/sa 大 TGID 全群踢出', banCalls.length === 2);
	assert('/sa 大 TGID 传数字', banCalls.every((c) => c.body.user_id === 7965398892));
	const delCalls = callsOf('deleteMessage').filter((c) => c.body.message_id === 210);
	assert('/sa TGID 模式删除群内指令消息', delCalls.length >= 1, `实际 ${delCalls.length}`);
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/sa TGID 模式含执行原因', !!dmSend && dmSend.body.text.includes('执行原因:广告引流'));
}

// ---------- [2] /be 单条:加黑 + 全群踢 ----------
console.log('\n[2] /be 123（单条）:加黑 + 全群踢');
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
			text: '/be 123',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('123 已加入黑名单', blacklist.some((e) => e.id === '123'));

	const banCalls = callsOf('banChatMember');
	assert('banChatMember 调用 2 次', banCalls.length === 2);
	assert('用户 ID 是 123', banCalls.every((c) => String(c.body.user_id) === '123'));
}

// ---------- [3] /be 批量:每个用户都遍历群踢 ----------
console.log('\n[3] /be 100,200,300（批量）');
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
			text: '/be [100, 200，\n300]',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
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
	const env = { ...baseEnv, DB: makeFakeDB([{ id: '8888', reason: 'sa', by: '999', at: '2026-05-01T00:00:00Z' }]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const delCalls = callsOf('deleteMessage');
	const banCalls = callsOf('banChatMember');
	assert('deleteMessage 调用 1 次', delCalls.length === 1);
	assert('banChatMember 调用 1 次（仅当前群）', banCalls.length === 1);
	assert('踢的是 8888', String(banCalls[0].body.user_id) === '8888');
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
	const env = { ...baseEnv, DB: makeFakeDB([{ id: '7777', reason: 'manual', by: '999', at: '2026-05-01T00:00:00Z' }]) };
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
	const env = { ...baseEnv, DB: makeFakeDB([{ id: '8888', reason: 'sa', by: '999', at: '2026-05-01T00:00:00Z' }]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const banCalls = callsOf('banChatMember');
	assert('黑名单用户复入群被立即踢', banCalls.length === 1);
	assert('踢的是当前群 -1001', banCalls[0].body.chat_id === -1001);
	assert('用户 ID 是 8888', String(banCalls[0].body.user_id) === '8888');
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
	const env = { ...baseEnv, DB: makeFakeDB([]) };
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
		DB: makeFakeDB([
			{ id: '8888', reason: 'sa', by: '999', at: '2026-05-01T00:00:00Z' },
			{ id: '9999', reason: 'manual', by: '999', at: '2026-05-02T00:00:00Z' },
		]),
	};
	const res = await handler.fetch(new Request(`https://x.com/${TOKEN}/purge`), env);
	const json = await res.json();

	assert('200 OK', res.status === 200);
	assert('成功:true', json.成功 === true);
	assert('黑名单总数 2', json.黑名单总数 === 2);
	assert('配置群组数 2', json.配置群组数 === 2);
	assert('总任务数 4', json.总任务数 === 4);
	assert('本批已完成', json.已完成 === true && json.done === true);
	assert('next_url 为空', json.next_url === null);
	// 8888 在 -1001 踢一次,在 -1002 跳过 = 1 踢 + 1 不在群
	// 9999 在两个群各踢一次 = 2 踢
	// 总: 已踢 3, 不在群 1
	assert('已踢出 3', json.已踢出 === 3, `实际 ${json.已踢出}`);
	assert('不在群 1', json.不在群 === 1, `实际 ${json.不在群}`);

	const banCalls = callsOf('banChatMember');
	assert('banChatMember 调用 3 次', banCalls.length === 3);
}

// ---------- [8b] /{TOKEN}/purge 游标分批 ----------
console.log('\n[8b] /{TOKEN}/purge 游标分批');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatMember: (b) => ({ ok: true, result: { status: 'member', user: { id: Number(b.user_id) } } }),
		banChatMember: () => ({ ok: true, result: true }),
	});

	const env = {
		...baseEnv,
		DB: makeFakeDB([
			{ id: '1111', reason: 'sa', by: '999', at: '2026-05-01T00:00:00Z' },
			{ id: '2222', reason: 'manual', by: '999', at: '2026-05-02T00:00:00Z' },
			{ id: '3333', reason: 'manual', by: '999', at: '2026-05-03T00:00:00Z' },
		]),
	};
	const first = await handler.fetch(new Request(`https://x.com/${TOKEN}/purge?limit=2`), env);
	const firstJson = await first.json();

	assert('首批 200', first.status === 200);
	assert('首批只处理 2 个组合', firstJson.本批已处理 === 2);
	assert('首批未完成', firstJson.已完成 === false && firstJson.done === false);
	assert('首批 next_cursor=2', firstJson.next_cursor === 2 && firstJson.下批游标 === 2);
	assert('首批 next_url 带 cursor=2', typeof firstJson.next_url === 'string' && firstJson.next_url.includes('cursor=2'));
	assert('首批踢出 2', firstJson.已踢出 === 2);
	assert('首批 banChatMember 2 次', callsOf('banChatMember').length === 2);

	resetCalls();
	const second = await handler.fetch(new Request(firstJson.next_url), env);
	const secondJson = await second.json();
	assert('第二批从 cursor=2 开始', secondJson.本批开始游标 === 2);
	assert('第二批 next_cursor=4', secondJson.next_cursor === 4 && secondJson.下批游标 === 4);
	assert('第二批踢出 2', secondJson.已踢出 === 2);
	assert('第二批第一条是第二个用户', secondJson.详情[0].用户ID === '2222');
}

// ---------- [8c] /{TOKEN}/purge limit 强制限流 ----------
console.log('\n[8c] /{TOKEN}/purge limit 强制限流');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatMember: (b) => ({ ok: true, result: { status: 'member', user: { id: Number(b.user_id) } } }),
		banChatMember: () => ({ ok: true, result: true }),
	});

	const seed = Array.from({ length: 30 }, (_, i) => ({
		id: String(7000 + i),
		reason: 'manual',
		by: '999',
		at: `2026-05-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
	}));
	const env = { ...baseEnv, DB: makeFakeDB(seed) };
	const res = await handler.fetch(new Request(`https://x.com/${TOKEN}/purge?limit=999`), env);
	const json = await res.json();

	assert('超大 limit 被压到 20', json.本批处理上限 === 20);
	assert('本批只处理 20 个组合', json.本批已处理 === 20);
	assert('本批 getChatMember 20 次', callsOf('getChatMember').length === 20);
	assert('本批 banChatMember 20 次', callsOf('banChatMember').length === 20);
	assert('大批量仍未完成', json.done === false && json.next_cursor === 20);
}

// ---------- [8d] /{TOKEN}/purge 不在群错误计入跳过 ----------
console.log('\n[8d] /{TOKEN}/purge 不在群错误计入跳过');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatMember: () => {
			throw new Error('Bad Request: user not found');
		},
		banChatMember: () => ({ ok: true, result: true }),
	});

	const env = {
		...baseEnv,
		DB: makeFakeDB([
			{ id: '4444', reason: 'manual', by: '999', at: '2026-05-01T00:00:00Z' },
		]),
	};
	const res = await handler.fetch(new Request(`https://x.com/${TOKEN}/purge?limit=2`), env);
	const json = await res.json();

	assert('不在群错误不失败', json.失败 === 0);
	assert('不在群计数 2', json.不在群 === 2);
	assert('不调用 banChatMember', callsOf('banChatMember').length === 0);
}

// ---------- [8e] /{TOKEN}/purge/run 浏览器自动续跑页 ----------
console.log('\n[8e] /{TOKEN}/purge/run 浏览器自动续跑页');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({});
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	const res = await handler.fetch(new Request(`https://x.com/${TOKEN}/purge/run?limit=18`), env);
	const html = await res.text();

	assert('runner 200', res.status === 200);
	assert('runner 是 HTML', res.headers.get('Content-Type').includes('text/html'));
	assert('runner 含标题', html.includes('黑名单清扫'));
	assert('runner 会调用 /purge', html.includes('/purge?limit=18'));
	assert('runner 含进度数字', html.includes('id="processed"') && html.includes('id="percent"'));
	assert('runner 含进度条', html.includes('id="bar"'));
	assert('runner 日志自动跟随最新', html.includes('logEl.scrollTop = logEl.scrollHeight'));
	assert('runner 自动开始', html.includes('startRun();'));
	assert('runner 含 TXT/CSV 下载', html.includes('id="downloadTxt"') && html.includes('id="downloadCsv"'));
	assert('runner 完成后生成文件', html.includes('function finish()') && html.includes('makeCsv()') && html.includes('makeTxt(finishedAt)'));
	assert('runner 不调用 Telegram', apiCalls.length === 0);
}

// ---------- [8f] /{TOKEN}/purge/groups 群权限预检 ----------
console.log('\n[8f] /{TOKEN}/purge/groups 群权限预检');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getMe: () => ({ ok: true, result: { id: 42, username: 'clean_bot' } }),
		getChatAdministrators: (b) => {
			const chat = Number(b.chat_id);
			if (chat === -1001) {
				return { ok: true, result: [{ user: { id: 42, is_bot: true }, status: 'administrator', can_restrict_members: true }] };
			}
			return { ok: true, result: [{ user: { id: 42, is_bot: true }, status: 'administrator', can_restrict_members: false }] };
		},
	});
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	const res = await handler.fetch(new Request(`https://x.com/${TOKEN}/purge/groups`), env);
	const json = await res.json();

	assert('groups 200', res.status === 200);
	assert('groups 成功', json.成功 === true);
	assert('只保留 1 个可清扫群', json.可清扫群组数 === 1 && json.groups === '-1001');
	assert('跳过缺少封禁权限的群', json.跳过群组数 === 1 && String(json.跳过群组[0].groupId) === '-1002' && json.跳过群组[0].reason.includes('can_restrict_members'));
	assert('预检调用 getMe 1 次', callsOf('getMe').length === 1);
	assert('预检查询 2 个群管理员', callsOf('getChatAdministrators').length === 2);
}

// ---------- [8g] /{TOKEN}/purge groups 参数只扫可清扫群 ----------
console.log('\n[8g] /{TOKEN}/purge groups 参数只扫可清扫群');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatMember: (b) => ({ ok: true, result: { status: 'member', user: { id: Number(b.user_id) } } }),
		banChatMember: () => ({ ok: true, result: true }),
	});

	const env = {
		...baseEnv,
		DB: makeFakeDB([
			{ id: '5555', reason: 'manual', by: '999', at: '2026-05-01T00:00:00Z' },
			{ id: '6666', reason: 'manual', by: '999', at: '2026-05-02T00:00:00Z' },
		]),
	};
	const res = await handler.fetch(new Request(`https://x.com/${TOKEN}/purge?groups=-1002&limit=20`), env);
	const json = await res.json();

	assert('groups 参数 200', res.status === 200);
	assert('配置群组数仍为 2', json.配置群组数 === 2);
	assert('参与群组数为 1', json.参与群组数 === 1);
	assert('总任务只剩 2', json.总任务数 === 2);
	assert('只调用目标群 -1002', callsOf('banChatMember').every((c) => Number(c.body.chat_id) === -1002));
	assert('banChatMember 调用 2 次', callsOf('banChatMember').length === 2);
}

// ---------- [8h] /{TOKEN}/purge 默认只清扫 /be + /sa ----------
console.log('\n[8h] /{TOKEN}/purge 默认只清扫 /be + /sa');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatMember: (b) => ({ ok: true, result: { status: 'member', user: { id: Number(b.user_id) } } }),
		banChatMember: () => ({ ok: true, result: true }),
	});

	const env = {
		...baseEnv,
		DB: makeFakeDB([
			{ id: '8101', reason: 'manual', by: '999', at: '2026-05-01T00:00:00Z' },
			{ id: '8102', reason: 'sa', by: '1000', at: '2026-05-02T00:00:00Z' },
			{ id: '8103', reason: 'spam', by: '1000', at: '2026-05-03T00:00:00Z' },
			{ id: '8104', reason: 'ad_auto', by: 'system', at: '2026-05-04T00:00:00Z' },
			{ id: '8105', reason: 'manual_ban', by: '999', at: '2026-05-05T00:00:00Z' },
		]),
	};
	const res = await handler.fetch(new Request(`https://x.com/${TOKEN}/purge?limit=20`), env);
	const json = await res.json();

	assert('默认清扫 200', res.status === 200);
	assert('默认范围是 /be + /sa（兼容旧 spam reason）', json.reasons === 'manual,sa,spam' && json.清扫范围 === '/be + /sa');
	assert('默认统计 manual/sa/spam 3 条', json.黑名单总数 === 3);
	assert('默认总任务数 6', json.总任务数 === 6);
	assert('默认不扫 ad_auto/manual_ban', callsOf('banChatMember').every((c) => ['8101', '8102', '8103'].includes(String(c.body.user_id))));
	assert('默认踢出 6 次', callsOf('banChatMember').length === 6);
}

// ---------- [8i] /{TOKEN}/purge?reasons=all 全量清扫兜底 ----------
console.log('\n[8i] /{TOKEN}/purge?reasons=all 全量清扫兜底');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatMember: (b) => ({ ok: true, result: { status: 'member', user: { id: Number(b.user_id) } } }),
		banChatMember: () => ({ ok: true, result: true }),
	});

	const env = {
		...baseEnv,
		DB: makeFakeDB([
			{ id: '8201', reason: 'manual', by: '999', at: '2026-05-01T00:00:00Z' },
			{ id: '8202', reason: 'sa', by: '1000', at: '2026-05-02T00:00:00Z' },
			{ id: '8203', reason: 'ad_auto', by: 'system', at: '2026-05-03T00:00:00Z' },
			{ id: '8204', reason: 'manual_ban', by: '999', at: '2026-05-04T00:00:00Z' },
		]),
	};
	const res = await handler.fetch(new Request(`https://x.com/${TOKEN}/purge?reasons=all&limit=20`), env);
	const json = await res.json();

	assert('全量清扫 200', res.status === 200);
	assert('全量范围显示 all', json.reasons === 'all' && json.清扫范围 === '全部黑名单');
	assert('全量统计 4 条', json.黑名单总数 === 4);
	assert('全量总任务数 8', json.总任务数 === 8);
	assert('全量包含 ad_auto/manual_ban', callsOf('banChatMember').some((c) => String(c.body.user_id) === '8203') && callsOf('banChatMember').some((c) => String(c.body.user_id) === '8204'));
}

// ---------- [9] /{TOKEN}/purge 错误 TOKEN ----------
console.log('\n[9] /purge 错误 TOKEN');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({});
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	const res = await handler.fetch(new Request('https://x.com/WRONG_TOKEN/purge'), env);
	assert('错误 TOKEN 返回 405', res.status === 405);
}

// ---------- [10] 群内 /be 单条:加黑 + 全群踢 + 闪屏 + 私聊详情 ----------
console.log('\n[10] 群内 /be 单条');
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
			text: '/be 123',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
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
	assert('私聊含汇总头', dmSend.body.text.includes('Telegram 群封禁/预封成功 2/2'));
	assert('私聊详情含群名 主群-技术交流', dmSend.body.text.includes('主群-技术交流'));
	assert('私聊详情含群名 副群-公告', dmSend.body.text.includes('副群-公告'));
	assert('私聊详情含群 ID -1001', dmSend.body.text.includes('-1001'));
	assert('私聊详情含群 ID -1002', dmSend.body.text.includes('-1002'));
	assert('私聊详情含命令来源', dmSend.body.text.includes('命令来源:当前群组') && dmSend.body.text.includes('-1001'));
	assert('私聊详情含作用范围', dmSend.body.text.includes('作用范围:全部 2 个配置群'));
	assert('私聊详情默认原因未填写', dmSend.body.text.includes('执行原因:未填写'));
	const commandDelCalls = callsOf('deleteMessage').filter((c) => c.body.message_id === 700);
	assert('群内 /be 指令消息 msgId=700 被删除', commandDelCalls.length >= 1, `实际 ${commandDelCalls.length}`);

	assert('ctx.waitUntil 至少调用 1 次（用于撤回闪屏）', ctxCalls.length >= 1);
}

// ---------- [10b] 群内 /be 单条 + 部分群失败:友好错误翻译 ----------
console.log('\n[10b] 群内 /be 单条 + 部分群失败');
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
			text: '/be 456',
		},
	};
	// 关键:让伪 fetch 看到 banChatMember 的失败响应作为 200
	// 因为 makeFetchMock 默认包成 { ok: true, status: 200 } —— 但 result.ok 才是 Telegram 的 ok
	// 所以这里 result.ok 是 false,banUserFromGroup 应该读取 result.description 走 translate
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('部分失败:私聊回执存在', !!dmSend);
	assert('部分失败:汇总显示踢出 1/2', dmSend.body.text.includes('1/2'));
	assert('部分失败:含友好原因（权限不足）', dmSend.body.text.includes('权限不足'));
	assert('部分失败:含建议（封禁用户）', dmSend.body.text.includes('封禁用户'));
}

// ---------- [10b2] 群内 /be USER_ID_INVALID 首次失败后自动重试成功 ----------
console.log('\n[10b2] 群内 /be USER_ID_INVALID 首次失败后自动重试成功');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	let failedOnce = false;
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		banChatMember: (b) => {
			if (String(b.chat_id) === '-1002' && !failedOnce) {
				failedOnce = true;
				return { ok: false, error_code: 400, description: 'Bad Request: USER_ID_INVALID' };
			}
			return { ok: true, result: true };
		},
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 760,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/be 812889600',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const banCalls = callsOf('banChatMember');
	assert('/be USER_ID_INVALID 自动重试一次', banCalls.length === 3 && banCalls.filter((c) => String(c.body.chat_id) === '-1002').length === 2, `实际 ${banCalls.length}`);
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/be 重试成功:私聊回执存在', !!dmSend);
	assert('/be 重试成功:最终显示全部群成功', dmSend.body.text.includes('Telegram 群封禁/预封成功 2/2'));
	assert('/be 重试成功:不显示用户 ID 无效', !dmSend.body.text.includes('用户 ID 无效'));
	assert('/be 重试成功:不显示失败原因', !dmSend.body.text.includes('Telegram 当前无法识别该 TGID'));
}

// ---------- [10b3] 群内 /be 首次加黑成功但 Telegram 无法识别 TGID ----------
console.log('\n[10b3] 群内 /be 首次加黑成功但 Telegram 无法识别 TGID');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		getChatMember: () => ({ ok: false, error_code: 400, description: 'Bad Request: USER_ID_INVALID' }),
		banChatMember: () => ({ ok: false, error_code: 400, description: 'Bad Request: USER_ID_INVALID' }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 765,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/be 7070447913',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('/be 无法识别 TGID:D1 仍新增成功', blacklist.some((e) => e.id === '7070447913'));
	const groupFlash = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '-1001');
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/be 无法识别 TGID:群内短提示说明 D1 已生效', !!groupFlash && groupFlash.body.text.includes('D1已生效'));
	assert('/be 无法识别 TGID:群内短提示不误报 bot 管理员权限', !!groupFlash && !groupFlash.body.text.includes('请检查 bot 是否为群管理员'));
	assert('/be 无法识别 TGID:私聊详情说明 D1 黑名单已生效', !!dmSend && dmSend.body.text.includes('D1 黑名单已生效'));
	assert('/be 无法识别 TGID:私聊详情说明 Telegram 当前无法识别', dmSend.body.text.includes('Telegram 当前无法识别该 TGID'));
	assert('/be 无法识别 TGID:私聊详情说明后续仍会拦截', dmSend.body.text.includes('后续进群/发言仍会按 D1 黑名单拦截'));
	assert('/be 无法识别 TGID:不误报用户不存在', !dmSend.body.text.includes('用户不存在'));
}

// ---------- [10b4] /be 目标不在群内但 Telegram 预封成功 ----------
console.log('\n[10b4] /be 目标不在群内但 Telegram 预封成功');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		getChatMember: (b) => ({ ok: true, result: { status: 'left', user: { id: Number(b.user_id), first_name: 'Ygg' } } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});

	const update = {
		message: {
			message_id: 766,
			chat: { id: 999, type: 'private' },
			from: { id: 999, is_bot: false, first_name: '主人' },
			text: '/be 8582619616',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/be 预封成功:私聊详情存在', !!dmSend);
	assert('/be 预封成功:汇总使用封禁/预封口径', dmSend.body.text.includes('Telegram 群封禁/预封成功 2/2'));
	assert('/be 预封成功:逐群说明预封', dmSend.body.text.includes('已加入群封禁列表（预封，禁止后续进群）'));
	assert('/be 预封成功:展示封禁前不在群内', dmSend.body.text.includes('封禁前状态：不在群内'));
	assert('/be 预封成功:说明不是踢出在线成员', dmSend.body.text.includes('不是从群里踢出了在线成员'));
	assert('/be 预封成功:不使用旧踢出汇总', !dmSend.body.text.includes('已从全部'));
}

// ---------- [10b5] /be 目标在群内时显示封禁并移出 ----------
console.log('\n[10b5] /be 目标在群内时显示封禁并移出');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		getChatMember: (b) => ({ ok: true, result: { status: 'member', user: { id: Number(b.user_id), first_name: '广告号' } } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});

	const update = {
		message: {
			message_id: 767,
			chat: { id: 999, type: 'private' },
			from: { id: 999, is_bot: false, first_name: '主人' },
			text: '/be 9000001',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/be 在群内:显示已封禁并移出群聊', !!dmSend && dmSend.body.text.includes('已封禁并移出群聊'));
	assert('/be 在群内:显示封禁前普通成员', dmSend.body.text.includes('封禁前状态：在群内（普通成员）'));
}

// ---------- [10c] 群内 /be 大 TGID 已存在仍保持字符串踢出 ----------
console.log('\n[10c] 群内 /be 大 TGID 已存在仍保持字符串踢出');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 780,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/be 7965398892',
		},
	};
	const env = {
		...baseEnv,
		DB: makeFakeDB([{ id: '7965398892', reason: 'manual', by: '999', at: '2026-06-13T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const banCalls = callsOf('banChatMember');
	assert('/be 已存在大 TGID 仍全群踢出', banCalls.length === 2);
	assert('/be 大 TGID 传数字', banCalls.every((c) => c.body.user_id === 7965398892));
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/be 已存在分支仍有回执', !!dmSend && dmSend.body.text.includes('已在黑名单中'));
}

// ---------- [11] 群内 /be 批量 ----------
console.log('\n[11] 群内 /be 批量');
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
			text: '/be [100, 200，\n300]',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('3 个用户全部加黑', blacklist.length === 3);

	// 3 用户 × 2 群 = 6 次 be
	assert('banChatMember 调用 6 次', callsOf('banChatMember').length === 6);

	const sendCalls = callsOf('sendMessage');
	assert('sendMessage 调用 2 次（闪屏+私聊详情）', sendCalls.length === 2);
	const dmSend = sendCalls.find((c) => String(c.body.chat_id) === '999');
	assert('私聊详情含批量结果', dmSend.body.text.includes('批量添加完成'));
	assert('私聊详情含每个用户', dmSend.body.text.includes('100') && dmSend.body.text.includes('200') && dmSend.body.text.includes('300'));
	assert('私聊详情含逐用户明细', dmSend.body.text.includes('逐用户 Telegram 群封禁/预封明细'));
	assert('私聊详情含群名', dmSend.body.text.includes('测试群-1001') && dmSend.body.text.includes('测试群-1002'));
	assert('批量 /be 数组格式默认原因未填写', dmSend.body.text.includes('执行原因:未填写'));
	assert('批量 /be 含作用范围', dmSend.body.text.includes('作用范围:全部 2 个配置群'));
	const commandDelCalls = callsOf('deleteMessage').filter((c) => c.body.message_id === 800);
	assert('群内批量 /be 指令消息 msgId=800 被删除', commandDelCalls.length >= 1, `实际 ${commandDelCalls.length}`);
	assert('小批量 /be 不创建 D1 任务', env.DB._jobs.size === 0);
}

// ---------- [11b] 群内 /be 20 个 TGID → D1 批量任务 ----------
console.log('\n[11b] 群内 /be 20 个 TGID → D1 批量任务');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (p) => { pending.push(Promise.resolve(p).catch((e) => { throw e; })); } };
	let env;
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	}, {
		internalHandler: (url, init) => handler.fetch(makeInternalWorkerRequest(url, init), env, fakeCtx),
	});

	const ids = Array.from({ length: 20 }, (_, i) => String(9000 + i));
	const update = {
		message: {
			message_id: 810,
			chat: { id: -1001, type: 'supergroup', title: '批量测试群' },
			from: { id: 999, is_bot: false, first_name: '主人' },
			text: `/be [${ids.join(',')}]`,
		},
	};
	env = { ...baseEnv, DB: makeFakeDB([]) };
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	await drainPending(pending);

	assert('20 个 /be 创建 1 个 D1 任务', env.DB._jobs.size === 1);
	const jobRow = [...env.DB._jobs.values()][0];
	const job = JSON.parse(jobRow.payload);
	assert('批量 /be 自动续接后完成', job.status === 'done' && job.cursor === 20);
	assert('批量 /be 自动续接分阶段执行', job.autoRunCount >= 2);
	assert('批量 /be 自动续接使用 Queue', env.BULK_QUEUE.sent.length >= 1);
	assert('批量 /be 任务记录操作类型', job.action === 'be' && job.reason === 'manual');
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('批量 /be 自动写入全部黑名单', blacklist.length === 20 && blacklist.every((e) => e.reason === 'manual'));
	assert('批量 /be 自动踢人全部完成', callsOf('banChatMember').length === 40);
	assert('批量 /be 指令消息被删除', callsOf('deleteMessage').some((c) => c.body.message_id === 810));
	const sendTexts = callsOf('sendMessage').map((c) => c.body.text).join('\n');
	assert('批量 /be 发送任务创建通知', sendTexts.includes('批量任务已创建'));
	assert('批量 /be 自动完成后发送完成通知', sendTexts.includes('批量任务完成'));

	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 2 } }),
	}, {
		internalHandler: (url, init) => handler.fetch(makeInternalWorkerRequest(url, init), env, fakeCtx),
	});
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 811, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/jobrun ${job.id}` } })
	}), env, fakeCtx);
	await drainPending(pending);
	const doneJob = JSON.parse(env.DB._jobs.get(job.id).payload);
	assert('/jobrun 对已完成任务保持完成状态', doneJob.status === 'done' && doneJob.cursor === 20);
	assert('/jobrun 已完成任务不重复踢人', callsOf('banChatMember').length === 0);
	const jobDms = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '999');
	assert('/jobrun 可查询批量任务状态', jobDms.some((c) => c.body.text.includes(job.id) && c.body.text.includes('已完成')));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 818, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: `/job ${job.id}` } })
	}), env, fakeCtx);
	await drainPending(pending);
	assert('群内 /job 指令消息 msgId=818 被删除', callsOf('deleteMessage').some((c) => c.body.message_id === 818));
	assert('群内 /job 仍发送任务状态私聊', callsOf('sendMessage').some((c) => String(c.body.chat_id) === '999' && c.body.text.includes(job.id)));
}

// [11b1] 未绑定 Queue 时只创建 D1 任务，不后台跑大批量 /be
console.log('\n[11b1] 未绑定 Queue 时只创建 D1 任务，不后台跑大批量');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (p) => { pending.push(Promise.resolve(p).catch((e) => { throw e; })); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const ids = Array.from({ length: 20 }, (_, i) => String(9100 + i));
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({
			message: {
				message_id: 819,
				chat: { id: -1001, type: 'supergroup', title: '批量测试群' },
				from: { id: 999, is_bot: false, first_name: '主人' },
				text: `/be [${ids.join(',')}]`,
			}
		})
	}), env, fakeCtx);
	await drainPending(pending);

	assert('未绑定 Queue 仍创建 D1 批量任务', env.DB._jobs.size === 1);
	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('未绑定 Queue 不自动执行大批量', job.status === 'queued' && job.cursor === 0 && job.autoRunCount === 0);
	assert('未绑定 Queue 不调用踢人接口', callsOf('banChatMember').length === 0);
	const sendTexts = callsOf('sendMessage').map((c) => c.body.text).join('\n');
	assert('未绑定 Queue 回执提示手动继续执行', sendTexts.includes(`/jobrun ${job.id}`) && !sendTexts.includes('自动续接:已开启'));
}

// ---------- [11b2] D1 批量任务失败原因中文化（/be）----------
console.log('\n[11b2] D1 批量任务失败原因中文化');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (p) => { pending.push(Promise.resolve(p).catch((e) => { throw e; })); } };
	let env;
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: false, error_code: 400, description: 'Bad Request: not enough rights to restrict/unrestrict chat member' }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	}, {
		internalHandler: (url, init) => handler.fetch(makeInternalWorkerRequest(url, init), env, fakeCtx),
	});

	const ids = Array.from({ length: 20 }, (_, i) => String(9200 + i));
	env = { ...baseEnv, DB: makeFakeDB([]) };
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({
			message: {
				message_id: 814,
				chat: { id: -1001, type: 'supergroup', title: '批量测试群' },
				from: { id: 999, is_bot: false, first_name: '主人' },
				text: `/be [${ids.join(',')}]`,
			}
		})
	}), env, fakeCtx);
	await drainPending(pending);

	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('批量任务失败场景也自动跑完', job.status === 'done' && job.cursor === 20);
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 2 } }),
	});
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 815, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/job ${job.id}` } })
	}), env, fakeCtx);

	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('批量任务失败原因显示中文', !!dm && dm.body.text.includes('bot 权限不足'));
	assert('批量任务失败原因保留原始错误', dm.body.text.includes('not enough rights to restrict/unrestrict chat member'));
	assert('批量任务失败建议含封禁用户权限', dm.body.text.includes('封禁用户'));
}

// ---------- [11c] 群内 /sa 20 个 TGID → D1 批量任务 ----------
console.log('\n[11c] 群内 /sa 20 个 TGID → D1 批量任务');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (p) => { pending.push(Promise.resolve(p).catch((e) => { throw e; })); } };
	let env;
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	}, {
		internalHandler: (url, init) => handler.fetch(makeInternalWorkerRequest(url, init), env, fakeCtx),
	});

	const ids = Array.from({ length: 20 }, (_, i) => String(9300 + i));
	const update = {
		message: {
			message_id: 812,
			chat: { id: -1001, type: 'supergroup', title: '批量测试群' },
			from: { id: 999, is_bot: false, first_name: '主人' },
			text: `/sa [${ids.join('，')}]`,
		},
	};
	env = { ...baseEnv, DB: makeFakeDB([]) };
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	await drainPending(pending);

	assert('20 个 /sa 创建 1 个 D1 任务', env.DB._jobs.size === 1);
	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('批量 /sa 自动续接后完成', job.status === 'done' && job.cursor === 20 && job.action === 'sa');
	assert('批量 /sa 自动续接分阶段执行', job.autoRunCount >= 2);
	assert('批量 /sa 自动续接使用 Queue', env.BULK_QUEUE.sent.length >= 1);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('批量 /sa 自动写入全部 sa reason', blacklist.length === 20 && blacklist.every((e) => e.reason === 'sa'));
	assert('批量 /sa 自动踢人全部完成', callsOf('banChatMember').length === 40);
}

// ---------- [11d] /be 7 个 TGID × 12 群 → 按操作量转 D1 任务 ----------
console.log('\n[11d] /be 7 个 TGID × 12 群 → 按操作量转 D1 任务');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (p) => { pending.push(Promise.resolve(p).catch((e) => { throw e; })); } };
	let env;
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	}, {
		internalHandler: (url, init) => handler.fetch(makeInternalWorkerRequest(url, init), env, fakeCtx),
	});

	const groupIds = Array.from({ length: 12 }, (_, i) => String(-1000000000000 - i));
	const ids = Array.from({ length: 7 }, (_, i) => String(9700 + i));
	env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: groupIds.join(','),
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({
			message: {
				message_id: 813,
				chat: { id: Number(groupIds[0]), type: 'supergroup', title: '多群测试' },
				from: { id: 999, is_bot: false, first_name: '主人' },
				text: `/be ${ids.join(' ')} 批量广告`,
			}
		})
	}), env, fakeCtx);
	await drainPending(pending);

	assert('7 个 TGID × 12 群创建 D1 任务', env.DB._jobs.size === 1);
	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('7 个 TGID × 12 群总操作数记录为 84', job.totals.operations === 84 && job.totals.groups === 12);
	assert('7×12 自动续接后完成', job.status === 'done' && job.cursor === 7);
	assert('7×12 自动续接分阶段执行', job.autoRunCount >= 4);
	assert('7×12 自动续接使用 Queue', env.BULK_QUEUE.sent.length >= 1);
	assert('7×12 自动踢人全部完成', callsOf('banChatMember').length === 84);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('7×12 自动写入全部黑名单', blacklist.length === 7 && blacklist.every((e) => e.reason === 'manual'));
}

// ---------- [11e] 私聊 /be 10 个 TGID × 11 群 → 自动执行 ----------
console.log('\n[11e] 私聊 /be 10 个 TGID × 11 群 → 自动执行');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (p) => { pending.push(Promise.resolve(p).catch((e) => { throw e; })); } };
	const internalUrls = [];
	let env;
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (body) => {
			const isLastGroup = String(body.chat_id) === '-1000000000010';
			return { ok: true, result: isLastGroup ? [{ user: { id: 999 }, status: 'creator' }] : [] };
		},
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	}, {
		internalHandler: (url, init) => {
			internalUrls.push(String(url));
			return handler.fetch(makeInternalWorkerRequest(url, init), env, fakeCtx);
		},
	});

	const groupIds = Array.from({ length: 11 }, (_, i) => String(-1000000000000 - i));
	const ids = ['7930069580', '8742844397', '8618390622', '8940881073', '8706367417', '8526485529', '8968301847', '8983701946', '8977565377', '8260524718'];
	env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: groupIds.join(','),
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({
			message: {
				message_id: 816,
				chat: { id: 999, type: 'private' },
				from: { id: 999, is_bot: false, first_name: '主人' },
				text: `/be ${ids.join(',')}`,
			}
		})
	}), env, fakeCtx);
	await drainPending(pending);

	assert('私聊 10×11 创建 1 个 D1 任务', env.DB._jobs.size === 1);
	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('私聊 10×11 自动续接后完成', job.status === 'done' && job.cursor === 10);
	assert('私聊 10×11 自动续接分阶段执行', job.autoRunCount >= 5);
	assert('私聊 10×11 自动续接使用 Queue', env.BULK_QUEUE.sent.length >= 1);
	assert('私聊 10×11 自动续接不再 HTTP 自调用', internalUrls.length === 0);
	assert('私聊 10×11 自动踢人全部完成', callsOf('banChatMember').length === 110);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('私聊 10×11 自动写入全部黑名单', blacklist.length === 10 && blacklist.every((e) => e.reason === 'manual'));
	const sendTexts = callsOf('sendMessage').map((c) => c.body.text).join('\n');
	assert('私聊 10×11 自动完成后发送完成通知', sendTexts.includes('批量任务完成') && sendTexts.includes('已完成'));
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
		DB: makeFakeDB([{ id: '8888', reason: 'sa', by: '999', at: '2026-05-01T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('8888 已从黑名单移除', !blacklist.some((e) => e.id === '8888'));

	// /unban 不调 banChatMember，但会对 GROUP_ID 配置群执行 unbanChatMember
	assert('banChatMember 没调用', callsOf('banChatMember').length === 0);
	const unbanCalls = callsOf('unbanChatMember');
	assert('/unban 调用 unbanChatMember 2 次（两个群）', unbanCalls.length === 2);
	assert('/unban 解封用户 ID 都是 8888', unbanCalls.every((c) => String(c.body.user_id) === '8888'));
	assert('/unban 解封覆盖两个配置群', JSON.stringify(unbanCalls.map((c) => String(c.body.chat_id)).sort()) === JSON.stringify(['-1001', '-1002']));

	const sendCalls = callsOf('sendMessage');
	assert('sendMessage 调用 2 次（闪屏+私聊）', sendCalls.length === 2);
	const groupSend = sendCalls.find((c) => String(c.body.chat_id) === '-1001');
	assert('群内闪屏含"已移黑并解封"', groupSend.body.text.includes('已移黑并解封'));
	const dmSend = sendCalls.find((c) => String(c.body.chat_id) === '999');
	assert('/unban 私聊详情含 Telegram 群解封结果', dmSend.body.text.includes('Telegram 群解封结果'));
	assert('群内 /unban 指令消息 msgId=900 被删除', callsOf('deleteMessage').some((c) => c.body.message_id === 900));
}

// ---------- [12a] 私聊 /unban 单条 + 部分群解封失败 ----------
console.log('\n[12a] 私聊 /unban 单条 + 部分群解封失败');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		getChat: (b) => {
			const id = String(b.chat_id);
			const titles = { '-1001': '主群', '-1002': '副群' };
			return { ok: true, result: { id: Number(b.chat_id), title: titles[id] || `群${id}`, type: 'supergroup' } };
		},
		unbanChatMember: (b) => {
			if (String(b.chat_id) === '-1002') {
				return { ok: false, error_code: 400, description: 'Bad Request: user is an administrator' };
			}
			return { ok: true, result: true };
		},
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: {
			message_id: 910,
			chat: { id: 999, type: 'private' },
			from: { id: 999, is_bot: false },
			text: '/unban 8890',
		},
	};
	const env = {
		...baseEnv,
		DB: makeFakeDB([{ id: '8890', reason: 'manual', by: '999', at: '2026-05-01T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('私聊 /unban 已从 D1 黑名单移除', !blacklist.some((e) => e.id === '8890'));
	const unbanCalls = callsOf('unbanChatMember');
	assert('私聊 /unban 对两个配置群执行解封', unbanCalls.length === 2);
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('私聊 /unban 详情显示部分群解封', !!dmSend && dmSend.body.text.includes('已解除 1/2 个配置群'));
	assert('私聊 /unban 管理员目标失败显示解封语境', dmSend.body.text.includes('副群') && dmSend.body.text.includes('目标用户是群管理员'));
	assert('私聊 /unban 管理员目标失败不再提示再踢', !dmSend.body.text.includes('再踢'));
	assert('私聊 /unban 管理员目标失败建议手动检查', dmSend.body.text.includes('无需通过 bot 解封') && dmSend.body.text.includes('手动检查'));
}

// ---------- [12a1] 群内 /unban 特殊 TGID: D1 移除成功但 Telegram 无法识别 ----------
console.log('\n[12a1] 群内 /unban 特殊 TGID');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		unbanChatMember: () => ({ ok: false, error_code: 400, description: 'Bad Request: USER_ID_INVALID' }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const update = {
		message: {
			message_id: 915,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/unban 7070447913',
		},
	};
	const env = {
		...baseEnv,
		DB: makeFakeDB([{ id: '7070447913', reason: 'manual', by: '999', at: '2026-06-23T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('特殊 TGID /unban:D1 黑名单已移除', !blacklist.some((e) => e.id === '7070447913'));
	assert('特殊 TGID /unban:仍对配置群执行 Telegram 解封', callsOf('unbanChatMember').length === 2);
	const groupFlash = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '-1001');
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('特殊 TGID /unban:群内短提示说明 Telegram 暂无法识别', !!groupFlash && groupFlash.body.text.includes('D1已处理') && groupFlash.body.text.includes('Telegram暂无法识别TGID'));
	assert('特殊 TGID /unban:群内短提示不误报 bot 管理员权限', !!groupFlash && !groupFlash.body.text.includes('请检查 bot 是否为群管理员'));
	assert('特殊 TGID /unban:私聊详情说明 Telegram 当前无法识别', !!dmSend && dmSend.body.text.includes('Telegram 当前无法识别该 TGID'));
	assert('特殊 TGID /unban:私聊详情不误报 TGID 格式错误', !!dmSend && !dmSend.body.text.includes('TGID 格式错误'));
	assert('特殊 TGID /unban:私聊详情说明 D1 移除不受影响', !!dmSend && dmSend.body.text.includes('D1 移除结果不受影响'));
	assert('特殊 TGID /unban:删除群内命令', callsOf('deleteMessage').some((c) => c.body.message_id === 915));
}

// ---------- [12a2] 匿名管理员 /unban: sender_chat 放行 ----------
console.log('\n[12a2] 匿名管理员 /unban');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		unbanChatMember: (b) => {
			if (String(b.chat_id) === '-1002') {
				return { ok: false, error_code: 400, description: 'Bad Request: user is an administrator' };
			}
			return { ok: true, result: true };
		},
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const update = {
		message: {
			message_id: 920,
			chat: { id: -1001, type: 'supergroup', title: '杀神专用黑名' },
			sender_chat: { id: -1001, type: 'supergroup', title: '杀神专用黑名' },
			text: '/unban 5973367305',
		},
	};
	const env = {
		...baseEnv,
		DB: makeFakeDB([{ id: '5973367305', reason: 'manual', by: '999', at: '2026-06-22T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('匿名 /unban 从 D1 移除', !blacklist.some((e) => e.id === '5973367305'));
	assert('匿名 /unban 执行 Telegram 群解封', callsOf('unbanChatMember').length === 2);
	assert('匿名 /unban 删除群内命令', callsOf('deleteMessage').some((c) => c.body.message_id === 920));
	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('匿名 /unban 主人收到匿名管理员审计', !!ownerDm && ownerDm.body.text.includes('匿名管理员'));
	assert('匿名 /unban 审计头换行显示匿名身份', ownerDm.body.text.includes('操作人:<b>匿名管理员</b>\n') && ownerDm.body.text.includes('匿名身份:'));
	assert('匿名 /unban 审计头不重复角色后缀', !ownerDm.body.text.includes('（匿名管理员）'));
	assert('匿名 /unban 管理员目标失败不再提示再踢', !ownerDm.body.text.includes('再踢'));
	assert('匿名 /unban 管理员目标失败使用解封建议', ownerDm.body.text.includes('无需通过 bot 解封') && ownerDm.body.text.includes('手动检查'));
}

// ---------- [12a3] 匿名管理员 /be@bot: 不依赖真实 TGID ----------
console.log('\n[12a3] 匿名管理员 /be@bot');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const update = {
		message: {
			message_id: 921,
			chat: { id: -1001, type: 'supergroup', title: '杀神专用黑名' },
			from: { id: 1087968824, is_bot: true, first_name: 'GroupAnonymousBot' },
			sender_chat: { id: -1001, type: 'supergroup', title: '杀神专用黑名' },
			text: '/be@tc520lh_bot 8416738230',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const row = env.DB._rows.get('8416738230');
	assert('匿名 /be@bot 写入 D1 黑名单', !!row && row.reason === 'manual');
	assert('匿名 /be@bot 操作人记录匿名群身份', row?.by_user === 'anonymous_admin:-1001', row?.by_user);
	assert('匿名 /be@bot 执行全群踢出', callsOf('banChatMember').length === 2);
	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('匿名 /be@bot 主人收到匿名管理员审计', !!ownerDm && ownerDm.body.text.includes('匿名管理员'));
}

// ---------- [12a4] 匿名管理员 /sa@bot TGID ----------
console.log('\n[12a4] 匿名管理员 /sa@bot TGID');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const update = {
		message: {
			message_id: 922,
			chat: { id: -1001, type: 'supergroup', title: '杀神专用黑名' },
			from: { id: 1087968824, is_bot: true, first_name: 'GroupAnonymousBot' },
			sender_chat: { id: -1001, type: 'supergroup', title: '杀神专用黑名' },
			text: '/sa@tc520lh_bot 8416738230 广告',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const row = env.DB._rows.get('8416738230');
	assert('匿名 /sa@bot 写入 D1 黑名单', !!row && row.reason === 'sa');
	assert('匿名 /sa@bot 操作人记录匿名群身份', row?.by_user === 'anonymous_admin:-1001', row?.by_user);
	assert('匿名 /sa@bot 执行全群踢出', callsOf('banChatMember').length === 2);
	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('匿名 /sa@bot 主人收到匿名管理员审计', !!ownerDm && ownerDm.body.text.includes('匿名管理员'));
}

// ---------- [12a5] 匿名管理员回复消息 /sa ----------
console.log('\n[12a5] 匿名管理员回复 /sa');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `群${b.chat_id}`, type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const update = {
		message: {
			message_id: 923,
			chat: { id: -1001, type: 'supergroup', title: '杀神专用黑名' },
			from: { id: 1087968824, is_bot: true, first_name: 'GroupAnonymousBot' },
			sender_chat: { id: -1001, type: 'supergroup', title: '杀神专用黑名' },
			text: '/sa 广告',
			reply_to_message: {
				message_id: 5000,
				from: { id: 771234, is_bot: false, first_name: '广告号' },
			},
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const row = env.DB._rows.get('771234');
	assert('匿名回复 /sa 写入被回复用户', !!row && row.reason === 'sa');
	assert('匿名回复 /sa 操作人记录匿名群身份', row?.by_user === 'anonymous_admin:-1001', row?.by_user);
	assert('匿名回复 /sa 删除被回复消息', callsOf('deleteMessage').some((c) => c.body.message_id === 5000));
	assert('匿名回复 /sa 执行全群踢出', callsOf('banChatMember').length === 2);
}

// ---------- [12a6] 非 GROUP_ID 群的匿名身份不放行 ----------
console.log('\n[12a6] 非 GROUP_ID 匿名身份不放行');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const update = {
		message: {
			message_id: 924,
			chat: { id: -2001, type: 'supergroup', title: '未配置群' },
			from: { id: 1087968824, is_bot: true, first_name: 'GroupAnonymousBot' },
			sender_chat: { id: -2001, type: 'supergroup', title: '未配置群' },
			text: '/be 999001',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	assert('非 GROUP_ID 匿名 /be 不写 D1', !env.DB._rows.has('999001'));
	assert('非 GROUP_ID 匿名 /be 不踢人', callsOf('banChatMember').length === 0);
	assert('非 GROUP_ID 匿名 /be 群内静默', callsOf('sendMessage').length === 0);
}

// ---------- [12b] D1 黑名单用户确认自助解封:任何 reason 都拒绝 ----------
console.log('\n[12b] D1 黑名单用户确认自助解封一律拒绝');
{
	const reasons = ['manual', 'sa', 'spam', 'manual_ban', 'ad_auto', 'unknown_reason'];
	for (const reason of reasons) {
		resetCalls();
		sandbox.fetch = makeFetchMock({
			sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
			getChat: () => ({ ok: true, result: { id: 1397983659, first_name: '管理员', type: 'private' } }),
		});

		const env = {
			...baseEnv,
			OWNER_IDS: '',
			DB: makeFakeDB([{ id: '7787880224', reason, by: '1397983659', at: '2026-06-20T06:24:44.203Z' }]),
		};
		const update = {
			message: {
				message_id: 1201,
				chat: { id: 7787880224, type: 'private' },
				from: { id: 7787880224, is_bot: false, first_name: '慢' },
				text: '我不是广告狗，我是误封的，希望可以解封。',
			},
		};
		await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, { waitUntil: () => {} });

		const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
		assert(`自助解封拒绝 reason=${reason}: D1 黑名单仍保留`, blacklist.some((e) => e.id === '7787880224' && e.reason === reason));
		assert(`自助解封拒绝 reason=${reason}: 不调用 unbanChatMember`, callsOf('unbanChatMember').length === 0);
		assert(`自助解封拒绝 reason=${reason}: 不调用 restrictChatMember`, callsOf('restrictChatMember').length === 0);
		assert(`自助解封拒绝 reason=${reason}: 不查询群成员状态`, callsOf('getChatMember').length === 0);
		const userReply = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7787880224');
		assert(`自助解封拒绝 reason=${reason}: 用户收到黑名单拒绝`, !!userReply && userReply.body.text.includes('黑名单'));
	}
}

// ---------- [12b2] 黑名单用户申诉:匿名管理员来源展示 ----------
console.log('\n[12b2] 黑名单用户申诉:匿名管理员来源展示');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChat: (b) => {
			if (String(b.chat_id) === '-1001') {
				return { ok: true, result: { id: -1001, title: '杀神专用黑名', type: 'supergroup' } };
			}
			return { ok: true, result: { id: Number(b.chat_id), first_name: '用户', type: 'private' } };
		},
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});

	const env = {
		...baseEnv,
		OWNER_IDS: '999',
		DB: makeFakeDB([{ id: '7787880224', reason: 'manual', by: 'anonymous_admin:-1001', at: '2026-06-22T05:38:15.224Z' }]),
	};
	const update = {
		message: {
			message_id: 12015,
			chat: { id: 7787880224, type: 'private' },
			from: { id: 7787880224, is_bot: false, first_name: '鬼鬼' },
			text: '/unban',
		},
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, { waitUntil: () => {} });

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('匿名加黑申诉:主人收到通知', !!ownerDm && ownerDm.body.text.includes('黑名单用户申诉'));
	assert('匿名加黑申诉:显示匿名管理员', ownerDm.body.text.includes('加黑操作人:<b>匿名管理员</b>'));
	assert('匿名加黑申诉:显示来源群名和群ID', ownerDm.body.text.includes('来源群:<b>杀神专用黑名</b>') && ownerDm.body.text.includes('-1001'));
	assert('匿名加黑申诉:不直接暴露内部 by_user 标记', !ownerDm.body.text.includes('anonymous_admin:-1001'));
}

// ---------- [12b3] 黑名单用户申诉:匿名来源群必须命中 GROUP_ID 才展示群名 ----------
console.log('\n[12b3] 黑名单用户申诉:匿名来源群按 GROUP_ID 判定');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '不应显示的未配置群名', type: 'supergroup' } }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});

	const env = {
		...baseEnv,
		OWNER_IDS: '999',
		DB: makeFakeDB([{ id: '7787880224', reason: 'manual', by: 'anonymous_admin:-2001', at: '2026-06-22T05:38:15.224Z' }]),
	};
	const update = {
		message: {
			message_id: 12016,
			chat: { id: 7787880224, type: 'private' },
			from: { id: 7787880224, is_bot: false, first_name: '鬼鬼' },
			text: '/unban',
		},
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, { waitUntil: () => {} });

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('未配置匿名来源:主人收到通知', !!ownerDm && ownerDm.body.text.includes('黑名单用户申诉'));
	assert('未配置匿名来源:标注未在当前 GROUP_ID', ownerDm.body.text.includes('来源群(未在当前 GROUP_ID):') && ownerDm.body.text.includes('-2001'));
	assert('未配置匿名来源:不展示未配置群名', !ownerDm.body.text.includes('不应显示的未配置群名'));
}

// ---------- [12c] D1 不可用时自助解封失败关闭 ----------
console.log('\n[12c] D1 不可用时自助解封失败关闭');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});

	const env = { ...baseEnv, OWNER_IDS: '' };
	const update = {
		message: {
			message_id: 1202,
			chat: { id: 7787880224, type: 'private' },
			from: { id: 7787880224, is_bot: false, first_name: '慢' },
			text: '我不是广告狗，我是误封的，希望可以解封。',
		},
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, { waitUntil: () => {} });

	const userReply = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7787880224');
	assert('D1 不可用: 用户收到拒绝提示', !!userReply && userReply.body.text.includes('无法确认 D1 黑名单状态'));
	assert('D1 不可用: 不调用 unbanChatMember', callsOf('unbanChatMember').length === 0);
	assert('D1 不可用: 不调用 restrictChatMember', callsOf('restrictChatMember').length === 0);
	assert('D1 不可用: 不查询群成员状态', callsOf('getChatMember').length === 0);
}

// ---------- [12d] /blacklist 展示兼容旧 spam reason ----------
console.log('\n[12d] /blacklist 展示兼容旧 spam reason');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});

	const env = {
		...baseEnv,
		DB: makeFakeDB([
			{ id: '7781', reason: 'manual', by: '999', at: '2026-06-20T06:00:00.000Z' },
			{ id: '7782', reason: 'sa', by: '999', at: '2026-06-20T06:01:00.000Z' },
			{ id: '7783', reason: 'spam', by: '999', at: '2026-06-20T06:02:00.000Z' },
		]),
	};
	const update = {
		message: {
			message_id: 1203,
			chat: { id: 999, type: 'private' },
			from: { id: 999, is_bot: false, first_name: '主人' },
			text: '/blacklist',
		},
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, { waitUntil: () => {} });

	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/blacklist 展示全部 D1 记录', !!dm && dm.body.text.includes('7781') && dm.body.text.includes('7782') && dm.body.text.includes('7783'));
	assert('/blacklist manual 显示为 /be 来源', dm.body.text.includes('管理员 /be 指令加黑'));
	assert('/blacklist sa/spam 都显示为 /sa 来源', (dm.body.text.match(/群内 \/sa 举报/g) || []).length >= 2);
	assert('/blacklist 不裸露旧 spam reason', !dm.body.text.includes('原因：spam'));
}

// ---------- [13] 私聊 /be 单条:行为不变(向后兼容) ----------
console.log('\n[13] 私聊 /be 单条向后兼容');
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
			text: '/be 123',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	// 私聊场景:只发 1 次详情,不发闪屏
	const sendCalls = callsOf('sendMessage');
	assert('私聊场景 sendMessage 只调用 1 次', sendCalls.length === 1, `实际 ${sendCalls.length}`);
	assert('回执直接发到私聊 999', String(sendCalls[0].body.chat_id) === '999');
	// 私聊场景不应触发闪屏自删
	assert('deleteMessage 没被调用（无闪屏需要撤回）', callsOf('deleteMessage').length === 0);
}

// ---------- [14] 群内非管理员发 /be:静默忽略 ----------
console.log('\n[14] 群内非管理员发 /be 静默忽略');
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
			text: '/be 123',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('未加黑（无权）', blacklist.length === 0);
	assert('banChatMember 未调用', callsOf('banChatMember').length === 0);
	assert('sendMessage 未调用（群内静默）', callsOf('sendMessage').length === 0);
	assert('非管理员 /be 指令消息不删除', callsOf('deleteMessage').length === 0);
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
			text: '/be 123',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
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
			text: '/be 555',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('用户在第二个群是 admin → /be 触发,加黑成功', blacklist.length === 1 && blacklist[0].id === '555');
	assert('全群踢人 banChatMember 调用 2 次', callsOf('banChatMember').length === 2);
}

// ---------- [17] 普通用户不是任何群的 admin → 静默忽略 ----------
console.log('\n[17] 全 miss:普通用户发 /be 静默');
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
			text: '/be 555',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('普通用户 → /be 不触发,黑名单为空', blacklist.length === 0);
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
			text: '/be 555',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('单群失败不阻塞 → /be 仍触发', blacklist.length === 1);
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
			text: '/be 555',
		},
	};
	// 关键:把 SUPER_ADMINS 注入 env
	const env = { ...baseEnv, SUPER_ADMINS: '11111', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('SUPER_ADMINS 即使不在群里也能用 /be', blacklist.length === 1 && blacklist[0].id === '555');
	// 不应该调 getChatAdministrators(super 短路返回 true)
	assert('SUPER_ADMINS 路径短路:不查群 admin 列表', callsOf('getChatAdministrators').length === 0);
}

// ===== 主人审计通知系统专项测试([20]-[24]) =====

// ---------- [20] OWNER_IDS 未配置 → 不发任何私聊 ----------
console.log('\n[20] OWNER_IDS 未配置:仅群闪屏,无私聊');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: '/be 555' },
	};
	// 关键:不传 OWNER_IDS
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const dmSends = callsOf('sendMessage').filter((c) => Number(c.body.chat_id) > 0);
	assert('OWNER_IDS 未配置时无任何私聊', dmSends.length === 0);
	const groupSends = callsOf('sendMessage').filter((c) => Number(c.body.chat_id) < 0);
	assert('群闪屏仍然发出', groupSends.length === 1);
}

// ---------- [21] OWNER_IDS 已配置 + 主人=触发者 → 含"你自己" ----------
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
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false, first_name: '主人' }, text: '/be 555' },
	};
	// OWNER_IDS = 999(就是触发者)
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人收到私聊详情', !!dmSend);
	assert('详情含"你自己"标记', dmSend.body.text.includes('你自己'));
	assert('详情含"主人操作通知"标题', dmSend.body.text.includes('主人操作通知'));
}

// ---------- [22] OWNER_IDS 已配置 + 触发者非主人 → 主人收审计,触发者不收 ----------
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
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '台风' }, text: '/be 555' },
	};
	// OWNER_IDS = 999(主人) ≠ 触发者 7777
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	const triggerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('主人 999 收到审计通知', !!ownerDm);
	assert('触发者 7777 完全不收私信', !triggerDm);
	assert('审计含"群管理员操作通知"标题', ownerDm.body.text.includes('群管理员操作通知'));
	assert('审计含操作人名"台风"', ownerDm.body.text.includes('台风'));
	assert('审计含角色标签"群管理员"', ownerDm.body.text.includes('群管理员'));
assert('审计含"群内"来源标记', ownerDm.body.text.includes('群内'));
assert('审计含完整详情(群封禁结果)', ownerDm.body.text.includes('Telegram 群封禁/预封成功'));
}

// ---------- [22b] OWNER_IDS 通知范围:主人全量,副主人仅 /be /sa 踢出通知 ----------
console.log('\n[22b] OWNER_IDS 通知范围:主人全量,副主人仅 /be /sa');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 7777 }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	let env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,1000', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '管理员' }, text: '/be 555' } })
	}), env, fakeCtx);
	let ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	let deputyDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '1000');
	assert('/be → 主人收到群封禁通知', !!ownerDm && ownerDm.body.text.includes('Telegram 群封禁/预封成功'));
	assert('/be → 副主人收到群封禁通知', !!deputyDm && deputyDm.body.text.includes('Telegram 群封禁/预封成功'));

	resetCalls();
	env = {
		TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,1000',
		DB: makeFakeDB([{ id: '555', reason: 'manual', by: '7777', at: '2026-05-01T00:00:00Z' }]),
	};
	await handler.fetch(new Request(`https://x.com/`, {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 2, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '管理员' }, text: '/unban 555' } })
	}), env, fakeCtx);
	ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	deputyDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '1000');
	assert('/unban → 主人收到通知', !!ownerDm && ownerDm.body.text.includes('从黑名单中移除'));
	assert('/unban → 副主人不收到通知', !deputyDm);
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
	// OWNER_IDS = 999, SUPER_ADMINS 含 8888 才能让按钮通过权限校验
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', SUPER_ADMINS: '8888,999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(cbUpdate) }), env);

	const ownerDms = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '999');
	assert('主人 999 收到一键解封审计', ownerDms.length > 0);
	const auditDm = ownerDms.find((c) => c.body.text.includes('操作通知')) || ownerDms[ownerDms.length - 1];
	assert('审计含"超级管理员操作通知"', auditDm.body.text.includes('超级管理员操作通知'));
	assert('审计含"一键解封代发"', auditDm.body.text.includes('一键解封代发'));
	assert('审计含操作人名"某超管"', auditDm.body.text.includes('某超管'));
	assert('审计含目标用户 55555', auditDm.body.text.includes('55555'));
	// 新增:回查解封结果消息也应发给主人(含"解封"字样)
	assert('主人收到解封回查结果', ownerDms.some((c) => c.body.text.includes('解封') || c.body.text.includes('封禁记录')));
}

// ---------- [24] chat_member 手动 be → 主人收审计 ----------
console.log('\n[24] chat_member 手动 be:主人收审计');
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
	// OWNER_IDS = 999, 触发者 7777 ≠ 主人
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(cmUpdate) }), env);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人 999 收到 chat_member 审计', !!ownerDm);
	assert('审计含"群管理员操作通知"', ownerDm.body.text.includes('群管理员操作通知'));
	assert('审计含"群内手动 封禁"（不再加黑）', ownerDm.body.text.includes('群内手动 封禁'));
	assert('审计标注"未加入全局黑名单"', ownerDm.body.text.includes('未加入全局黑名单'));
	assert('真人群内手动封禁不写入 D1 黑名单（唯一来源=/be /sa）', !env.DB._rows.has('5555'));
	assert('审计含操作人"台风"', ownerDm.body.text.includes('台风'));
	assert('审计含目标"广告号"', ownerDm.body.text.includes('广告号'));
	// 状态变更已翻译为中文
	assert('审计含中文状态"普通成员"', ownerDm.body.text.includes('普通成员'));
	assert('审计含中文状态"已踢出"', ownerDm.body.text.includes('已踢出'));
}

// ---------- [25] 重复添加已黑用户:不报 D1 唯一约束错误,仍继续踢出 ----------
console.log('\n[25] 重复加黑同一用户:已在黑名单仍继续踢出');
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
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '台风' }, text: '/be 12345' },
	};
	// 关键:D1 已经有 12345 → addToBlacklist 返回失败"已在黑名单"
	const env = {
		TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999',
		DB: makeFakeDB([{ id: '12345', reason: 'manual', by: '999', at: '2026-05-01T00:00:00Z' }]),
	};
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人收到通知', !!ownerDm);
	assert('字段:操作含"加入黑名单"', ownerDm.body.text.includes('加入黑名单'));
	assert('字段:目标用户名"广告号"', ownerDm.body.text.includes('广告号'));
	assert('字段:目标用户ID 12345', ownerDm.body.text.includes('12345'));
	assert('字段:操作人"台风"', ownerDm.body.text.includes('台风'));
	assert('重复提示:含"已在黑名单"', ownerDm.body.text.includes('已在黑名单'));
	assert('已在黑名单仍会全群踢出', callsOf('banChatMember').length === 2);
}

// ---------- [25b] 作为管理员的机器人发 /be → 不写入 D1 黑名单（仅真人可加黑）----------
console.log('\n[25b] 机器人管理员发 /be:不加黑');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		// 即便这个机器人是群管理员，发 /be 也必须被真人防护拦在 checkIfUserIsAdmin 之前
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 5566001122, is_bot: true }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 5566001122, is_bot: true, first_name: 'nmBot' }, text: '/be 99999 广告' },
	};
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	assert('机器人发 /be 不写入 D1 黑名单', !env.DB._rows.has('99999'));
	assert('机器人发 /be 不触发踢人', callsOf('banChatMember').length === 0);
}

// ---------- [25c] 作为管理员的机器人发 /sa → 不写入 D1 黑名单 ----------
console.log('\n[25c] 机器人管理员发 /sa:不加黑');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 5566001122, is_bot: true }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 5566001122, is_bot: true, first_name: 'nmBot' }, text: '/sa 88888 广告' },
	};
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	assert('机器人发 /sa 不写入 D1 黑名单', !env.DB._rows.has('88888'));
	assert('机器人发 /sa 不触发踢人', callsOf('banChatMember').length === 0);
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
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(cmUpdate) }), env);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('机器人操作 → 主人不收通知', !ownerDm);
	assert('机器人封禁不写入 D1 黑名单（核心:作为管理员的 bot 封禁绝不进黑名单）', !env.DB._rows.has('5555'));
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
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(cmUpdate) }), env);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('匿名管理员操作 → 主人仍收通知', !!ownerDm);
	assert('通知含目标"广告"', ownerDm.body.text.includes('广告'));
	assert('匿名管理员群内手动封禁不写入 D1 黑名单', !env.DB._rows.has('6666'));
}

// ===== 广告自动检测专项测试([28]-[37]) =====
// 共用的 mock + env 构造
// 广告词库种子(对应代码里 RECOMMENDED_AD_KEYWORDS,测试用明文即可)
// 测试用归一化(与 worker 里 normalizeForFingerprint 保持一致)
function normalizeFp(text) {
	try {
		return String(text || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/[\p{P}\p{S}]/gu, '');
	} catch (_) {
		return String(text || '').toLowerCase().replace(/\s+/g, '');
	}
}
const AD_KW_SEED = {
	finance: ['usdt', 'u商', '承兑', '刷单', '日入', '出u', '接u', '搬砖', '套利', '包网', '价格拉满'],
	porn: ['约炮', '萝莉', '福利姬', '看片', '裸聊', '乱伦', '不雅视频', '色色', '免费看', '资源群'],
	sa: ['加我', '加微', '加v', '私聊', '进群', '拉你', '详情看', '添加好友', '发送信息'],
	fraud: ['假钞', '假币', '高仿', '办证', '代开发票', '黑客接单', '网赚', '菠菜', '交流群'],
	general: [],
	whitelist: [],
};
// 构造一个已预置广告词库的 fake D1
function makeAdD1(extra = {}) {
	const db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ ...AD_KW_SEED, ...extra }));
	return db;
}
const adEnv = (extra = {}) => ({
	TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999',
	AD_FILTER_ENABLED: 'true',
	DB: makeAdD1(),
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

// ---------- [30] 金融广告评分达阈值 ----------
console.log('\n[30] 金融广告评分(出u+承兑)');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const env = adEnv();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '专业出u承兑,日入过万' })) }), env, fakeCtxAd);
	const bl = JSON.parse(env.DB._store.get('blacklist') || '[]');
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
	const bl = JSON.parse(env.DB._store.get('blacklist') || '[]');
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
	const bl = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('用户名广告 → 加黑', bl.some((e) => e.id === '88001'));
}

// ---------- [33] 单个 usdt 不达阈值 → 不误杀 ----------
console.log('\n[33] 单词 usdt 不误杀');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const env = adEnv();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '请问 usdt 怎么提现到银行卡' })) }), env, fakeCtxAd);
	const bl = JSON.parse(env.DB._store.get('blacklist') || '[]');
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
	const bl = JSON.parse(env.DB._store.get('blacklist') || '[]');
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
	const bl = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('管理员发广告 → 不加黑(豁免)', !bl.some((e) => e.id === '88001'));
	assert('管理员发广告 → 不删消息', callsOf('deleteMessage').length === 0);
}

// ---------- [36] AD_FILTER_ENABLED=false → 完全不检测 ----------
console.log('\n[36] 开关关闭不检测');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) }; // 不设 AD_FILTER_ENABLED
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(adMsg({ text: '出u承兑 +1 484 842 6117 t.me/+abc' })) }), env, fakeCtxAd);
	const bl = JSON.parse(env.DB._store.get('blacklist') || '[]');
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

// ---------- [38] 主人 /addword 写入 D1 ----------
console.log('\n[38] 主人 /addword 写入 D1');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]); // 空词库
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 主人私聊发 /addword fraud 杀猪盘
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false, first_name: '主人' }, text: '/addword fraud 杀猪盘 刷信誉' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const stored = JSON.parse(db._store.get('ad_keywords_custom') || '{}');
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
	// D1 里预置 general:[杀猪盘](权重 +2,但阈值 3,需要两个词。这里加两个 general 词凑分)
	const db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: [], porn: [], sa: [], fraud: ['杀猪盘', '刷信誉'], general: [], whitelist: [] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 普通成员发含两个 fraud 词(各+2=4 ≥ 3)
	const update = { message: { message_id: 2, chat: { id: -1001, type: 'supergroup' }, from: { id: 88002, is_bot: false, first_name: '路人' }, text: '专业杀猪盘刷信誉' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('D1 自定义词命中 → 加黑', bl.some((e) => e.id === '88002'));
	assert('D1 自定义词命中 → 踢人', callsOf('banChatMember').length === 2);
}

// ---------- [40] /delword 删词后不再命中 ----------
console.log('\n[40] /delword 删词');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: ['usdt'], porn: [], sa: [], fraud: ['杀猪盘'], general: [], whitelist: [] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/delword 杀猪盘' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const stored = JSON.parse(db._store.get('ad_keywords_custom') || '{}');
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
	const db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: ['usdt'], porn: [], sa: [], fraud: ['假钞'], general: [], whitelist: ['白词'] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/listwords' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/listwords 私聊回执', !!dm);
	assert('展示含 usdt', dm.body.text.includes('usdt'));
	assert('展示含假钞', dm.body.text.includes('假钞'));
	assert('展示含白名单词', dm.body.text.includes('白词'));
}

// ---------- [41b] 旧 spam 词库分类兼容到 sa ----------
console.log('\n[41b] 旧 spam 词库分类兼容到 sa');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: [], porn: [], spam: ['加我', '进群', '私聊'], fraud: [], general: [], whitelist: [] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88041, is_bot: false, first_name: '路人' }, text: '加我进群私聊' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	let bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('旧 spam 分类词仍参与引流检测', bl.some((e) => e.id === '88041'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: { message_id: 2, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/listwords' }
	}) }), env, fakeCtxAd);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/listwords 把旧 spam 分类展示为 sa', !!dm && dm.body.text.includes('引流 sa') && dm.body.text.includes('加我') && !dm.body.text.includes('引流 spam'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: { message_id: 3, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/addword spam 私聊我' }
	}) }), env, fakeCtxAd);
	const stored = JSON.parse(db._store.get('ad_keywords_custom') || '{}');
	assert('/addword spam 旧分类别名写入 sa', Array.isArray(stored.sa) && stored.sa.includes('私聊我'));
	assert('/addword spam 不继续写旧 spam 分类', !Array.isArray(stored.spam));
}

// ---------- [42] /importdefault 导入推荐词库 ----------
console.log('\n[42] /importdefault 导入');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]); // 空词库
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/importdefault' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const stored = JSON.parse(db._store.get('ad_keywords_custom') || '{}');
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
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 群管理员 7777 私聊发 /addword
	const update = { message: { message_id: 1, chat: { id: 7777, type: 'private' }, from: { id: 7777, is_bot: false }, text: '/addword fraud 测试' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const stored = db._store.get('ad_keywords_custom');
	assert('非主人 → 词库未被修改', !stored);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('非主人 → 收到权限不足提示', !!dm && dm.body.text.includes('权限不足'));
}

// ---------- [44] emoji 永不参与评分:大量 emoji + 单个金融词 → 不达阈值不误杀 ----------
console.log('\n[44] emoji 不计分,表情包不误杀');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	// 即使配了 emoji 分类也不影响(已移除 emoji 评分);finance 单个词 +2 < 阈值3
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: ['出u'], porn: [], sa: [], fraud: [], general: [], whitelist: [] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 单个金融词 + 一堆 emoji:emoji 不加分,只 +2 < 3 → 不杀
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88044, is_bot: false, first_name: '路人' }, text: '想了解出u🔥💰❤️😍🎉' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('emoji 不计分:单词+emoji 不达阈值 → 不杀', !bl.some((e) => e.id === '88044'));
}

// ---------- [45] 纯表情包/纯 emoji 消息 → 永不被杀 ----------
console.log('\n[45] 纯 emoji 消息不误杀');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: ['出u'], porn: ['看片'], sa: [], fraud: ['假钞'], general: [], whitelist: [] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 一堆 emoji 但无任何广告词 → 不该被杀
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88045, is_bot: false, first_name: '开心' }, text: '今天好开心🔥💰❤️😍🎉🎊✨🥳' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('纯 emoji → 不误杀', !bl.some((e) => e.id === '88045'));
	assert('纯 emoji → 不删消息', callsOf('deleteMessage').length === 0);
}

// ===== /sa 上报学习 → 精准查杀测试([46]-[55]) =====

// ---------- [46] 主人 /sa → 样本入库 ----------
console.log('\n[46] 主人 /sa 学习样本');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 主人在群里回复一条广告发 /sa
	const update = { message: {
		message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false, first_name: '主人' },
		text: '/sa',
		reply_to_message: { message_id: 50, from: { id: 88100, is_bot: false, first_name: '广告号' }, text: '专业承兑出u日入过万快来咨询' },
	} };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const samples = JSON.parse(db._store.get('ad_samples') || '{"fingerprints":[]}');
	assert('主人 /sa → 指纹入库', samples.fingerprints.length === 1);
	assert('指纹是归一化后的广告文本', samples.fingerprints[0].includes('专业承兑出u日入过万'));
	const kw = JSON.parse(db._store.get('ad_keywords_custom') || '{"general":[]}');
	assert('提取的关键词不再自动进 general（防污染）', !kw.general || kw.general.length === 0);
}

// ---------- [47] 普通管理员 /sa → 不学习 ----------
console.log('\n[47] 普通管理员 /sa 不学习');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		// 7777 是群管理员但不是主人(主人是 999)
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 7777 }, status: 'administrator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: {
		message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '管理员' },
		text: '/sa',
		reply_to_message: { message_id: 50, from: { id: 88101, is_bot: false }, text: '某广告内容' },
	} };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const samples = db._store.get('ad_samples');
	assert('普通管理员 /sa → 不入库样本', !samples);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('普通管理员 /sa → 仍加黑(行为不变)', bl.some((e) => e.id === '88101'));
}

// ---------- [48] 学习后相同广告再发 → 指纹秒杀 ----------
console.log('\n[48] 学习后相同广告秒杀');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	// 预置一条学习指纹(归一化后的)
	db._store.set('ad_samples', JSON.stringify({ fingerprints: [normalizeFp('专业承兑出u日入过万快来咨询')], count: 1 }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 普通成员发完全相同的广告
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88102, is_bot: false, first_name: '路人' }, text: '专业承兑出u日入过万快来咨询' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('相同广告 → 指纹命中加黑', bl.some((e) => e.id === '88102'));
	assert('相同广告 → 全群踢', callsOf('banChatMember').length === 2);
	assert('相同广告 → 删消息', callsOf('deleteMessage').length >= 1);
}

// ---------- [49] 加空格/标点变体 → 归一化后仍命中 ----------
console.log('\n[49] 加空格标点变体仍命中');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_samples', JSON.stringify({ fingerprints: [normalizeFp('专业承兑出u日入过万')], count: 1 }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 加了空格、标点、emoji 的变体
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88103, is_bot: false }, text: '专业 承兑、出u!日入,过万🔥' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('加空格标点变体 → 归一化后命中', bl.some((e) => e.id === '88103'));
}

// ---------- [51] 太短消息(<6)不触发指纹,防误杀 ----------
console.log('\n[51] 太短消息不触发指纹');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	// 一条极短指纹(理论上不该存在,因为 learn 限制 ≥6,但测防御)
	db._store.set('ad_samples', JSON.stringify({ fingerprints: ['abc'], count: 1 }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88105, is_bot: false }, text: 'abc好' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('短指纹(<6)不触发匹配 → 不误杀', !bl.some((e) => e.id === '88105'));
}

// ---------- [52] /listsamples 展示 ----------
console.log('\n[52] /listsamples 展示');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_samples', JSON.stringify({ fingerprints: ['承兑出u日入过万', '看片约炮资源群'], count: 2 }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/listsamples' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/listsamples 回执', !!dm);
	assert('展示样本数 2', dm.body.text.includes('共 2 条'));
	assert('展示样本内容', dm.body.text.includes('承兑出u日入过万'));

	resetCalls();
	const groupUpdate = { message: { message_id: 52, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: '/listsamples' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(groupUpdate) }), env, fakeCtxAd);
	assert('群内 /listsamples 指令消息 msgId=52 被删除', callsOf('deleteMessage').some((c) => c.body.message_id === 52));
	assert('群内 /listsamples 详情推给主人', callsOf('sendMessage').some((c) => String(c.body.chat_id) === '999' && c.body.text.includes('广告学习样本')));
}

// ---------- [53] /delsample 按序号删 ----------
console.log('\n[53] /delsample 删样本');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_samples', JSON.stringify({ fingerprints: ['样本甲一二三四', '样本乙一二三四'], count: 2 }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/delsample 1' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const samples = JSON.parse(db._store.get('ad_samples') || '{"fingerprints":[]}');
	assert('/delsample 1 删掉第一条', samples.fingerprints.length === 1 && samples.fingerprints[0] === '样本乙一二三四');
}

// ---------- [54] /clearsamples 二次确认 ----------
console.log('\n[54] /clearsamples 二次确认');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_samples', JSON.stringify({ fingerprints: ['样本一二三四', '样本五六七八'], count: 2 }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 第一次不带 confirm → 不清空
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/clearsamples' } }) }), env, fakeCtxAd);
	let samples = JSON.parse(db._store.get('ad_samples') || '{"fingerprints":[]}');
	assert('/clearsamples 无 confirm → 不清空', samples.fingerprints.length === 2);
	// 带 confirm → 清空
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 2, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/clearsamples confirm' } }) }), env, fakeCtxAd);
	samples = JSON.parse(db._store.get('ad_samples') || '{"fingerprints":[]}');
	assert('/clearsamples confirm → 清空', samples.fingerprints.length === 0);
}

// ---------- [55] 非主人用 /listsamples 被拒 ----------
console.log('\n[55] 非主人样本命令被拒');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 7777 }, status: 'administrator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 7777, type: 'private' }, from: { id: 7777, is_bot: false }, text: '/listsamples' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('非主人 /listsamples → 权限不足', !!dm && dm.body.text.includes('权限不足'));
}

// ===== /learn + /learnlast 测试([56]-[64]) =====

// ---------- [56] 主人 /learn 粘贴文本 → 入库 ----------
console.log('\n[56] /learn 粘贴文本学习');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/learn 世界杯红单推荐天天收米日赚三千' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const samples = JSON.parse(db._store.get('ad_samples') || '{"fingerprints":[]}');
	assert('/learn → 指纹入库', samples.fingerprints.length === 1);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/learn → 回执含已学习', !!dm && dm.body.text.includes('已学习'));
}

// ---------- [57] /learn 后该广告再发 → 命中 ----------
console.log('\n[57] /learn 后广告再发命中');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 主人先 /learn
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/learn 专业出u承兑日入过万快来' } }) }), env, fakeCtxAd);
	// 普通成员发相同广告
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 2, chat: { id: -1001, type: 'supergroup' }, from: { id: 88200, is_bot: false }, text: '专业出u承兑日入过万快来' } }) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('/learn 后相同广告 → 命中加黑', bl.some((e) => e.id === '88200'));
}

// ---------- [58] 疑似广告消息被缓存 ----------
console.log('\n[58] 疑似广告消息被缓存');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', MSG_CACHE_ENABLED: 'true', DB: db };
	// 含 @ 提及的较长消息(疑似广告),普通成员发
	const update = { message: { message_id: 5, chat: { id: -1001, type: 'supergroup' }, from: { id: 88201, is_bot: false, first_name: '广告' }, text: '高薪兼职日结联系 @somebot 详情' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const cache = JSON.parse(db._store.get('recent_messages') || '{"items":[]}');
	assert('疑似广告 → 被缓存', cache.items.length === 1 && cache.items[0].fromId === '88201');
}

// ---------- [59] 正常短消息不缓存 ----------
console.log('\n[59] 正常短消息不缓存');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', MSG_CACHE_ENABLED: 'true', DB: db };
	// 正常短闲聊:无链接/无@/无长数字/短
	const update = { message: { message_id: 5, chat: { id: -1001, type: 'supergroup' }, from: { id: 88202, is_bot: false }, text: '哈哈在吗' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const cache = db._store.get('recent_messages');
	assert('正常短消息 → 不缓存', !cache);
}

// ---------- [60] /learnlast 学最近1条 → 学习+加黑+踢 ----------
console.log('\n[60] /learnlast 学最近并加黑踢');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	// 预置【冻结快照】(新行为:/learnlast 只从快照读,不读实时缓存,序号永不漂移)
	db._store.set('learn_snapshot', JSON.stringify({ items: [{ mid: 50, text: '假钞交流群快递面交都可', fromId: '88203', fromName: '广告号', at: '2026-05-29T00:00:00Z' }], scope: '本群' }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/learnlast' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const samples = JSON.parse(db._store.get('ad_samples') || '{"fingerprints":[]}');
	assert('/learnlast → 指纹入库', samples.fingerprints.length === 1);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('/learnlast → 只学不踢:发送者不加黑', !bl.some((e) => e.id === '88203'));
	assert('/learnlast → 只学不踢:不调 banChatMember', callsOf('banChatMember').length === 0);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/learnlast → 回执给出发送者 TGID 供手动 /be', !!dm && dm.body.text.includes('88203'));
}

// ---------- [61] /learnlast N 学多条 ----------
console.log('\n[61] /learnlast 1,3 学多条');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	// 冻结快照:序号 1=items[0]。/learnlast 1,3 学第1和第3条
	db._store.set('learn_snapshot', JSON.stringify({ items: [
		{ mid: 1, text: '广告甲一二三四五', fromId: '101', fromName: 'A', at: '2026-05-29T00:00:01Z' },
		{ mid: 2, text: '广告乙一二三四五', fromId: '102', fromName: 'B', at: '2026-05-29T00:00:02Z' },
		{ mid: 3, text: '广告丙一二三四五', fromId: '103', fromName: 'C', at: '2026-05-29T00:00:03Z' },
	], scope: '本群' }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/learnlast 1,3' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const samples = JSON.parse(db._store.get('ad_samples') || '{"fingerprints":[]}');
	assert('/learnlast 1,3 → 学2条指纹', samples.fingerprints.length === 2);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('/learnlast 1,3 → 只学不踢:无人加黑', bl.length === 0);
	assert('/learnlast 1,3 → 只学不踢:不调 banChatMember', callsOf('banChatMember').length === 0);
}

// ---------- [62] 缓存空 → /learnlast 提示 ----------
console.log('\n[62] 快照空 /learnlast 提示');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/learnlast' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('快照空 → 提示先 /recent', !!dm && dm.body.text.includes('快照'));
}

// ---------- [63] 非主人 /learn /learnlast 被拒 ----------
console.log('\n[63] 非主人 /learn 被拒');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 7777 }, status: 'administrator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 7777, type: 'private' }, from: { id: 7777, is_bot: false }, text: '/learn 测试广告内容一二三' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const samples = db._store.get('ad_samples');
	assert('非主人 /learn → 不入库', !samples);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('非主人 /learn → 权限不足', !!dm && dm.body.text.includes('权限不足'));
}

// ---------- [64] MSG_CACHE_ENABLED=false 不缓存 ----------
console.log('\n[64] 缓存开关关不缓存');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', MSG_CACHE_ENABLED: 'false', DB: db };
	const update = { message: { message_id: 5, chat: { id: -1001, type: 'supergroup' }, from: { id: 88204, is_bot: false }, text: '高薪兼职日结联系 @somebot 详情看' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const cache = db._store.get('recent_messages');
	assert('缓存关 → 不缓存', !cache);
}

// ---------- [65] /recent 冻结快照 ----------
console.log('\n[65] /recent 冻结快照');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	// 预置实时缓存(本群 -1001 两条)
	db._store.set('recent_messages', JSON.stringify({ items: [
		{ mid: 1, chatId: '-1001', text: '广告甲一二三四五六', fromId: '201', fromName: 'A', at: '2026-05-29T00:00:01Z' },
		{ mid: 2, chatId: '-1001', text: '广告乙一二三四五六', fromId: '202', fromName: 'B', at: '2026-05-29T00:00:02Z' },
	] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 主人在群里发 /recent
	const update = { message: { message_id: 9, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: '/recent' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const snap = JSON.parse(db._store.get('learn_snapshot') || '{"items":[]}');
	assert('/recent → 写入冻结快照', snap.items.length === 2);
	assert('/recent → 快照序号1=最新(202)', snap.items[0].fromId === '202');
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/recent → 列表推到主人私聊', !!dm && dm.body.text.includes('快照'));
	assert('群内 /recent 指令消息 msgId=9 被删除', callsOf('deleteMessage').some((c) => c.body.message_id === 9));
}

// ---------- [65b] /recent 清洗损坏 Unicode 字符 ----------
console.log('\n[65b] /recent 清洗损坏 Unicode 字符');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('recent_messages', JSON.stringify({ items: [
		{ mid: 3, chatId: '-1001', text: `广告异常字符${String.fromCharCode(0xD800)}测试`, fromId: '203', fromName: `C${String.fromCharCode(0xDC00)}`, at: '2026-05-29T00:00:03Z' },
	] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 10, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: '/recent' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/recent → 损坏 Unicode 仍发送私聊', !!dm && dm.body.text.includes('广告异常字符测试'));
	assert('/recent → 私聊文本不含代理字符', !/[\uD800-\uDFFF]/.test(dm.body.text));
	assert('群内 /recent 清洗场景指令消息 msgId=10 被删除', callsOf('deleteMessage').some((c) => c.body.message_id === 10));
}

// ---------- [66] /learnlast 群内被拒(强制私聊) ----------
console.log('\n[66] /learnlast 群内被拒');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const db = makeFakeDB([]);
	db._store.set('learn_snapshot', JSON.stringify({ items: [{ mid: 1, text: '广告甲一二三四五六', fromId: '301', fromName: 'A' }], scope: '本群' }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 主人在群里发 /learnlast → 应被拒,不学不踢
	const update = { message: { message_id: 9, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: '/learnlast' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const samples = db._store.get('ad_samples');
	assert('群内 /learnlast → 不学习(强制私聊)', !samples);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('群内 /learnlast → 不加黑', bl.length === 0);
	assert('群内 /learnlast 指令消息 msgId=9 被删除', callsOf('deleteMessage').some((c) => c.body.message_id === 9));
}

// ---------- [67] /help 仅 OWNER_IDS(非 OWNER_IDS 无反应) ----------
console.log('\n[67] /help OWNER_IDS 专属');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }, { user: { id: 7777 }, status: 'administrator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: db };
	// 主人私聊 /help → 展开隐藏指令
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/help' } }) }), env, fakeCtxAd);
	let dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人 /help → 展开隐藏指令', !!dm && dm.body.text.includes('OWNER_IDS 专属'));
	assert('主人 /help → 含 /learnlast 说明', !!dm && dm.body.text.includes('learnlast'));
	assert('主人 /help → 含 /admins 权限名单说明', !!dm && dm.body.text.includes('/admins') && dm.body.text.includes('权限名单'));
	assert('主人 /help → 含 /groups 群组查询说明', !!dm && dm.body.text.includes('/groups') && dm.body.text.includes('GROUP_ID'));
	// 群管理员(非主人)私聊 /help → 权限不足,不泄漏指令
	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 2, chat: { id: 7777, type: 'private' }, from: { id: 7777, is_bot: false }, text: '/help' } }) }), env, fakeCtxAd);
	dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('非主人 /help → 权限不足', !!dm && dm.body.text.includes('权限不足'));
	assert('非主人 /help → 不泄漏隐藏指令', !!dm && !dm.body.text.includes('learnlast'));
	assert('非主人 /help → 不泄漏 /admins', !!dm && !dm.body.text.includes('/admins'));
	assert('非主人 /help → 不泄漏 /groups', !!dm && !dm.body.text.includes('/groups'));
	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 3, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: '/help' } }) }), env, fakeCtxAd);
	assert('主人群内 /help 指令消息 msgId=3 被删除', callsOf('deleteMessage').some((c) => c.body.message_id === 3));
	assert('主人群内 /help 只发闪屏提示', callsOf('sendMessage').some((c) => String(c.body.chat_id) === '-1001' && c.body.text.includes('请私聊')));
}

// ---------- [67b] /admins 仅主人查看权限名单 ----------
console.log('\n[67b] /admins 主人专属权限名单');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => {
			if (String(b.chat_id) === '-1001') {
				return {
					ok: true,
					result: [
						{ user: { id: 999, first_name: '主人', username: 'owner_user' }, status: 'creator' },
						{ user: { id: 888, first_name: '副主人', username: 'deputy_user' }, status: 'administrator' },
						{ user: { id: 7777, first_name: '超管', last_name: '甲', username: 'super_user' }, status: 'administrator' }
					]
				};
			}
			return { ok: true, result: [] };
		},
		getChatMember: (b) => {
			if (String(b.user_id) === '6666') {
				return { ok: true, result: { user: { id: 6666, first_name: '兜底', username: 'fallback_user' }, status: 'member' } };
			}
			return { ok: false, description: 'Bad Request: user not found' };
		},
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,888', SUPER_ADMINS: '7777,6666', DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/admins' } })
	}), env, fakeCtxAd);
	let dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/admins 主人可查看权限名单', !!dm && dm.body.text.includes('权限名单'));
	assert('/admins 显示主人用户名', dm.body.text.includes('@owner_user') && dm.body.text.includes('TGID:<code>999</code>'));
	assert('/admins 显示副主人用户名', dm.body.text.includes('@deputy_user') && dm.body.text.includes('TGID:<code>888</code>'));
	assert('/admins 显示超级管理员用户名', dm.body.text.includes('@super_user') && dm.body.text.includes('TGID:<code>7777</code>'));
	assert('/admins 可用 getChatMember 兜底', dm.body.text.includes('@fallback_user') && dm.body.text.includes('TGID:<code>6666</code>'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 2, chat: { id: 888, type: 'private' }, from: { id: 888, is_bot: false }, text: '/admins' } })
	}), env, fakeCtxAd);
	dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '888');
	assert('/admins 副主人无权查看', !!dm && dm.body.text.includes('权限不足') && !dm.body.text.includes('@owner_user'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 3, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: '/admins' } })
	}), env, fakeCtxAd);
	assert('/admins 群内静默不公开名单', callsOf('sendMessage').length === 0);
}

// ---------- [67c] /groups 仅主人查看配置群组 ----------
console.log('\n[67c] /groups 主人专属配置群组');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChat: (b) => {
			if (String(b.chat_id) === '-1001') return { ok: true, result: { id: -1001, title: '主群', username: 'main_group', type: 'supergroup' } };
			if (String(b.chat_id) === '-1002') return { ok: true, result: { id: -1002, title: '副群', type: 'supergroup' } };
			return { ok: false, description: 'Bad Request: chat not found' };
		},
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,888', SUPER_ADMINS: '7777', DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/groups' } })
	}), env, fakeCtxAd);
	let dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/groups 主人可查看配置群组', !!dm && dm.body.text.includes('配置群组列表'));
	assert('/groups 显示群名和 ChatID', dm.body.text.includes('主群') && dm.body.text.includes('副群') && dm.body.text.includes('ChatID:<code>-1001</code>') && dm.body.text.includes('ChatID:<code>-1002</code>'));
	assert('/groups 显示类型和用户名', dm.body.text.includes('类型:supergroup') && dm.body.text.includes('@main_group') && dm.body.text.includes('用户名:未设置'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 2, chat: { id: 888, type: 'private' }, from: { id: 888, is_bot: false }, text: '/groups' } })
	}), env, fakeCtxAd);
	dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '888');
	assert('/groups 副主人无权查看', !!dm && dm.body.text.includes('权限不足') && !dm.body.text.includes('主群'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 3, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: '/groups' } })
	}), env, fakeCtxAd);
	assert('/groups 群内静默不公开群组配置', callsOf('sendMessage').length === 0);
}

// ---------- [68] 正常域名链接(github)不被杀,即便学过同域名样本 ----------
console.log('\n[68] 正常域名链接不误杀');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	// 故意预置一条 github 链接样本(模拟之前误学),且与待测消息完全相同
	db._store.set('ad_samples', JSON.stringify({ fingerprints: [normalizeFp('https://github.com/jacobax/snippets')], count: 1 }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88300, is_bot: false }, text: 'https://github.com/jacobax/snippets', entities: [{ type: 'url', offset: 0, length: 35 }] } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('github 正常链接 → 不加黑(白名单放行)', !bl.some((e) => e.id === '88300'));
	assert('github 正常链接 → 不删消息', callsOf('deleteMessage').length === 0);
}

// ---------- [69] 含 URL 样本只精确匹配,同域名其它路径不被子串误杀 ----------
console.log('\n[69] URL 样本不子串扩散');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	// 学过一条【非白名单】域名链接广告
	db._store.set('ad_samples', JSON.stringify({ fingerprints: [normalizeFp('http://sa-shop.xyz/abc')], count: 1 }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 同域名不同路径(更长)→ 旧版会被子串命中,新版不该被杀
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88301, is_bot: false }, text: 'http://sa-shop.xyz/abc/page/normal-content-here', entities: [{ type: 'url', offset: 0, length: 49 }] } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	let bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('同域名不同路径 → 不被子串误杀', !bl.some((e) => e.id === '88301'));
	// 完全相同的那条 → 仍应精确命中
	resetCalls();
	const db2 = makeFakeDB([]);
	db2._store.set('ad_samples', JSON.stringify({ fingerprints: [normalizeFp('http://sa-shop.xyz/abc')], count: 1 }));
	const env2 = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db2 };
	const upd2 = { message: { message_id: 2, chat: { id: -1001, type: 'supergroup' }, from: { id: 88302, is_bot: false }, text: 'http://sa-shop.xyz/abc', entities: [{ type: 'url', offset: 0, length: 24 }] } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(upd2) }), env2, fakeCtxAd);
	bl = JSON.parse(db2._store.get('blacklist') || '[]');
	assert('完全相同的广告链接 → 仍精确命中加黑', bl.some((e) => e.id === '88302'));
}

// ---------- [71] /addword whitelist 加域名 → 该域名链接放行 ----------
console.log('\n[71] 域名白名单热更新');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	// 先学一条该域名的样本(模拟误学),再把域名加进白名单
	db._store.set('ad_samples', JSON.stringify({ fingerprints: [normalizeFp('https://myblog.example/post1')], count: 1 }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 主人私聊把 myblog.example 加进白名单
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/addword whitelist myblog.example' } }) }), env, fakeCtxAd);
	const kw = JSON.parse(db._store.get('ad_keywords_custom') || '{}');
	assert('/addword whitelist 域名 → 写入 whitelist', (kw.whitelist || []).includes('myblog.example'));
	// 普通成员发该域名链接(即便完全等于样本)→ 因白名单放行
	resetCalls();
	const update = { message: { message_id: 2, chat: { id: -1001, type: 'supergroup' }, from: { id: 88304, is_bot: false }, text: 'https://myblog.example/post1', entities: [{ type: 'url', offset: 0, length: 28 }] } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('白名单域名链接 → 不被杀(即便等于样本)', !bl.some((e) => e.id === '88304'));
}

// ---------- [73] 名片广告(本地号+敏感词)→ 词库+名片分叠加判定 ----------
console.log('\n[73] 名片敏感词叠加判定');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify(AD_KW_SEED)); // 含 fraud:假钞
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 名片名字含"假钞"(fraud +2)+ 名片本身(+1)= 3 ≥ 阈值;电话用中国号不触发强特征
	const update = { message: {
		message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88401, is_bot: false, first_name: 'X' },
		contact: { phone_number: '+86 138 0013 8000', first_name: '假钞交流群', vcard: '' },
	} };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('名片敏感词+86号 → 词库叠加判广告加黑', bl.some((e) => e.id === '88401'));
}

// ---------- [74] 正常名片(本地号,无敏感词)→ 不误杀 ----------
console.log('\n[74] 正常名片不误杀');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify(AD_KW_SEED));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 正常用户分享一个本地联系人:名字无敏感词、中国号 → 只有名片+1分,不达阈值3
	const update = { message: {
		message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88402, is_bot: false, first_name: '小明' },
		contact: { phone_number: '+86 138 0013 8000', first_name: '张三', last_name: '', vcard: '' },
	} };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('正常本地名片 → 不加黑(不误杀)', !bl.some((e) => e.id === '88402'));
	assert('正常本地名片 → 不删消息', callsOf('deleteMessage').length === 0);
}

// ---------- [75] 名片名字含敏感词 → 直接秒杀(即便无电话/中国号) ----------
console.log('\n[75] 名片名字敏感词直接杀');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify(AD_KW_SEED)); // 含 fraud:假钞
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 名片名字"假钞交流群",电话用中国号(不触发国际号强特征)→ 靠名字命中词库直接杀
	const update = { message: {
		message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88500, is_bot: false, first_name: 'A' },
		contact: { phone_number: '+86 138 0013 8000', first_name: '假钞交流群', vcard: '' },
	} };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('名片名字含敏感词 → 直接加黑', bl.some((e) => e.id === '88500'));
	assert('名片名字含敏感词 → 全群踢', callsOf('banChatMember').length === 2);
	assert('名片名字含敏感词 → 删消息', callsOf('deleteMessage').length >= 1);
}

// ---------- [76] 名片名字正常(无敏感词)+ 中国号 → 不误杀 ----------
console.log('\n[76] 正常名字名片不误杀');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify(AD_KW_SEED));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 正常名字 + 中国号 → 名字不命中词库,只 +1 名片分,不达阈值
	const update = { message: {
		message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88501, is_bot: false, first_name: '小红' },
		contact: { phone_number: '+86 139 0013 9000', first_name: '李四', last_name: '王', vcard: '' },
	} };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('正常名字名片 → 不加黑(不误杀)', !bl.some((e) => e.id === '88501'));
	assert('正常名字名片 → 不删消息', callsOf('deleteMessage').length === 0);
}

// ---------- [77] 一键代发后回查解封结果 ----------
console.log('\n[77] 一键代发回查解封结果');
{
	// ① GKY 已无记录 → 提示"解封成功"
	resetCalls();
	sandbox.fetch = async function (url, init) {
		const u = String(url);
		if (u.includes('api.telegram.org')) {
			const method = u.split('/').pop();
			const body = init && init.body ? JSON.parse(init.body) : null;
			apiCalls.push({ method, body });
			if (method === 'getChatMember') return { ok: true, status: 200, async json() { return { ok: true, result: { user: { id: 55555, first_name: '某用户' }, status: 'member' } }; } };
			return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 1 } }; } };
		}
		// GKY banlist 端点:返回"无记录"
		if (u.includes('banlist')) {
			return { ok: true, status: 200, async text() { return 'This TG account has no ban record'; } };
		}
		throw new Error('Unexpected fetch: ' + u);
	};
	const cbUpdate = {
		callback_query: {
			id: 'cb-77a', from: { id: 8888, is_bot: false, first_name: '某超管' },
			message: { message_id: 100, chat: { id: -1001, type: 'supergroup' }, text: 'GKY二次审核' },
			data: 'gky:a:55555:-1001',
		},
	};
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', SUPER_ADMINS: '8888,999', DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(cbUpdate) }), env);
	const opDms = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '8888');
	assert('代发后 → 操作人收到"正在确认"', opDms.some((c) => c.body.text.includes('正在确认')));
	assert('GKY无记录 → 提示"解封成功"', opDms.some((c) => c.body.text.includes('解封成功')));

	// ② GKY 仍有记录 → 提示稍后 /check 复查
	resetCalls();
	sandbox.fetch = async function (url, init) {
		const u = String(url);
		if (u.includes('api.telegram.org')) {
			const method = u.split('/').pop();
			const body = init && init.body ? JSON.parse(init.body) : null;
			apiCalls.push({ method, body });
			if (method === 'getChatMember') return { ok: true, status: 200, async json() { return { ok: true, result: { user: { id: 55555, first_name: '某用户' }, status: 'member' } }; } };
			return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 1 } }; } };
		}
		if (u.includes('banlist')) {
			// 返回"有记录"的 HTML
			return { ok: true, status: 200, async text() { return '<strong>TGID:</strong> 55555<br><strong>ChatID:</strong> -1001<br><strong>Reason:</strong> 广告<br>'; } };
		}
		throw new Error('Unexpected fetch: ' + u);
	};
	const cbUpdate2 = {
		callback_query: {
			id: 'cb-77b', from: { id: 8888, is_bot: false, first_name: '某超管' },
			message: { message_id: 101, chat: { id: -1001, type: 'supergroup' }, text: 'GKY二次审核' },
			data: 'gky:a:55555:-1001',
		},
	};
	const env2 = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', SUPER_ADMINS: '8888,999', DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(cbUpdate2) }), env2);
	const opDms2 = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '8888');
	assert('GKY仍有记录 → 提示稍后 /check 复查', opDms2.some((c) => c.body.text.includes('/check')));
	assert('回查提示带具体 TGID(可复制)', opDms2.some((c) => c.body.text.includes('/check 55555')));
}

// ---------- [78] /check TGID 私聊直查 ----------
console.log('\n[78] /check TGID 私聊直查');
{
	// 自定义 fetch:管理员鉴权 + GKY 端点
	function makeCheckFetch(banlistText, adminIds) {
		return async function (url, init) {
			const u = String(url);
			if (u.includes('api.telegram.org')) {
				const method = u.split('/').pop();
				const body = init && init.body ? JSON.parse(init.body) : null;
				apiCalls.push({ method, body });
				if (method === 'getChatAdministrators') {
					return { ok: true, status: 200, async json() { return { ok: true, result: adminIds.map((id) => ({ user: { id }, status: 'administrator' })) }; } };
				}
				if (method === 'getChatMember') {
					return { ok: true, status: 200, async json() { return { ok: true, result: { user: { id: 993005028, first_name: 'DB' }, status: 'member' } }; } };
				}
				return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 1 } }; } };
			}
			if (u.includes('banlist')) {
				return { ok: true, status: 200, async text() { return banlistText; } };
			}
			throw new Error('Unexpected fetch: ' + u);
		};
	}

	// ① 主人私聊 /check 993005028 → 返回查询结果(无记录)
	resetCalls();
	sandbox.fetch = makeCheckFetch('This TG account has no ban record', [999]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', SUPER_ADMINS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/check 993005028' } }) }), env, fakeCtxAd);
	let dm = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '999');
	assert('私聊 /check TGID → 有响应', dm.length > 0);
	assert('私聊 /check TGID → 返回查询结果', dm.some((c) => c.body.text.includes('993005028')));
	assert('私聊 /check TGID → 含无封禁记录', dm.some((c) => c.body.text.includes('没有 GKY 封禁记录') || c.body.text.includes('沒有封鎖記錄') || c.body.text.includes('no ban record')));

	// ② 非管理员私聊 /check TGID → 权限不足
	resetCalls();
	sandbox.fetch = makeCheckFetch('This TG account has no ban record', [999]); // 5555 不在 admin
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 2, chat: { id: 5555, type: 'private' }, from: { id: 5555, is_bot: false }, text: '/check 993005028' } }) }), env, fakeCtxAd);
	dm = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '5555');
	assert('非管理员私聊 /check TGID → 权限不足', dm.some((c) => c.body.text.includes('权限不足')));

	// ③ 私聊 /check 无参数 → 提示正确用法
	resetCalls();
	sandbox.fetch = makeCheckFetch('This TG account has no ban record', [999]);
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 3, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/check' } }) }), env, fakeCtxAd);
	dm = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '999');
	assert('私聊 /check 无参数 → 提示用 /check TGID', dm.some((c) => c.body.text.includes('/check TGID')));
}

// ---------- [79] 一键代发警告:目标群无GKYbot + 原群封禁 ----------
console.log('\n[79] 代发有效性警告');
{
	// 通用 fetch:可配置 banlist 返回 + 目标群管理员列表(是否含GKYbot)
	function makeWarnFetch({ banlist, admins }) {
		return async function (url, init) {
			const u = String(url);
			if (u.includes('api.telegram.org')) {
				const method = u.split('/').pop();
				const body = init && init.body ? JSON.parse(init.body) : null;
				apiCalls.push({ method, body });
				if (method === 'getChatAdministrators') {
					return { ok: true, status: 200, async json() { return { ok: true, result: admins }; } };
				}
				if (method === 'getChatMember') return { ok: true, status: 200, async json() { return { ok: true, result: { user: { id: 55555, first_name: 'U' }, status: 'member' } }; } };
				if (method === 'getChat') return { ok: true, status: 200, async json() { return { ok: true, result: { id: -1001, title: '群', type: 'supergroup' } }; } };
				return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 1 } }; } };
			}
			if (u.includes('banlist')) {
				return { ok: true, status: 200, async text() { return banlist; } };
			}
			throw new Error('Unexpected fetch: ' + u);
		};
	}
	const cb = (id) => ({ callback_query: { id, from: { id: 8888, is_bot: false, first_name: '超管' }, message: { message_id: 100, chat: { id: -1001, type: 'supergroup' }, text: '审核' }, data: 'gky:a:55555:-1001' } });
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', SUPER_ADMINS: '8888,999', DB: makeFakeDB([]) };

	// ① 目标群无 GKYbot(管理员里只有普通bot)→ 警告"未发现 GKYbot"
	resetCalls();
	sandbox.fetch = makeWarnFetch({ banlist: 'This TG account has no ban record', admins: [{ user: { id: 8888, is_bot: false }, status: 'creator' }, { user: { id: 111, is_bot: true, username: 'MyUnbanBot' }, status: 'administrator' }] });
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(cb('w1')) }), env);
	let dm = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '8888');
	assert('目标群无GKYbot → 警告未发现GKYbot', dm.some((c) => c.body.text.includes('未发现 GKYbot')));

	// ② 目标群有 GKYbot(username 含 GKY)→ 无该警告
	resetCalls();
	sandbox.fetch = makeWarnFetch({ banlist: 'This TG account has no ban record', admins: [{ user: { id: 8888, is_bot: false }, status: 'creator' }, { user: { id: 222, is_bot: true, username: 'GKY96e0163eBot' }, status: 'administrator' }] });
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(cb('w2')) }), env);
	dm = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '8888');
	assert('目标群有GKYbot → 无"未发现GKYbot"警告', !dm.some((c) => c.body.text.includes('未发现 GKYbot')));

	// ③ 原群封禁(ChatID 非配置群)→ 警告"属于原群"
	resetCalls();
	sandbox.fetch = makeWarnFetch({ banlist: '<strong>TGID:</strong> 55555<br><strong>ChatID:</strong> -1009999999<br><strong>Reason:</strong> SpamGP<br>', admins: [{ user: { id: 222, is_bot: true, username: 'GKY96e0163eBot' }, status: 'administrator' }] });
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(cb('w3')) }), env);
	dm = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '8888');
	assert('原群封禁 → 警告属于原群', dm.some((c) => c.body.text.includes('属于原群')));
}

// ---------- [80] 发言人身份(名字/简介)引流检测 ----------
console.log('\n[80] 发言人身份引流检测');
{
	// ① 名字含 t.me 链接 → 直接杀
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	let db = makeFakeDB([]);
	let env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 名字仅含 t.me 链接但无广告词(如双向bot @xxxBot、个人频道)→ 不该误杀(关键防误杀)
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 90001, is_bot: false, first_name: '频道 t.me/qewrvetrhe' }, text: 'chat 主 gpt 页 plus 已经稳了13天' } }) }), env, fakeCtxAd);
	let bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('名字仅含t.me无广告词 → 不杀(防误杀双向bot/频道)', !bl.some((e) => e.id === '90001'));
	assert('名字仅含t.me无广告词 → 不删消息', callsOf('deleteMessage').length === 0);

	// ② 名字含色情/赌博类身份词 → 直接杀
	resetCalls();
	db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ identity: ['约炮', '裸聊'] }));
	env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 90002, is_bot: false, first_name: '约炮资源裸聊' }, text: '正常发言内容' } }) }), env, fakeCtxAd);
	bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('名字含身份广告词(约炮) → 加黑', bl.some((e) => e.id === '90002'));

	// ③ 正常名字 + 正文聊 chatgpt/发t.me链接 → 不杀(关键防误杀:不碰正文)
	resetCalls();
	db = makeFakeDB([]);
	env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 90003, is_bot: false, first_name: '张三' }, text: '我觉得 chatgpt plus 很好用,频道 https://t.me/openai 推荐看看' } }) }), env, fakeCtxAd);
	bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('正常名字+正文聊chatgpt发链接 → 不杀(不碰正文)', !bl.some((e) => e.id === '90003'));
	assert('正常名字+正文 → 不删消息', callsOf('deleteMessage').length === 0);
}

// ---------- [81] 短正文引用广告自动拦截 ----------
console.log('\n[81] 短正文引用广告自动拦截');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	let db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ general: ['揾逼赚钱'], porn: ['大婆啦'] }));
	let env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: {
			message_id: 900,
			chat: { id: -1001, type: 'supergroup', title: '广告测试群' },
			from: { id: 91001, is_bot: false, first_name: '广告号' },
			text: 't',
			quote: { text: '📢 大婆啦\n我的妈 揾逼赚钱' },
		}
	}) }), env, fakeCtxAd);
	let bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('短正文引用广告 → 加黑当前发送者', bl.some((e) => e.id === '91001' && e.reason === 'ad_auto'));
	assert('短正文引用广告 → 删除当前消息', callsOf('deleteMessage').some((c) => String(c.body.chat_id) === '-1001' && c.body.message_id === 900));
	assert('短正文引用广告 → 全群踢当前发送者', callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((c) => String(c.body.user_id) === '91001'));
	const ownerDm = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '999');
	assert('短正文引用广告 → 通知包含引用内容', ownerDm.some((c) => c.body.text.includes('引用内容') && c.body.text.includes('揾逼赚钱')));

	resetCalls();
	db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: ['usdt'] }));
	env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: {
			message_id: 904,
			chat: { id: -1001, type: 'supergroup', title: '技术讨论群' },
			from: { id: 91005, is_bot: false, first_name: '正常用户' },
			text: '那还挺好的',
			reply_to_message: {
				message_id: 803,
				from: { id: 91006, is_bot: false, first_name: '讨论用户' },
				text: '大佬 冲usdc 还是usdt',
			},
		}
	}) }), env, fakeCtxAd);
	bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('中文正常短回复引用单个 usdt → 不误杀当前发送者', !bl.some((e) => e.id === '91005'));
	assert('中文正常短回复引用单个 usdt → 不删当前消息', callsOf('deleteMessage').length === 0);
	assert('中文正常短回复引用单个 usdt → 不全群踢', callsOf('banChatMember').length === 0);

	resetCalls();
	db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: ['usdt'] }));
	env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: {
			message_id: 905,
			chat: { id: -1001, type: 'supergroup', title: '技术讨论群' },
			from: { id: 91007, is_bot: false, first_name: '普通用户' },
			text: 'k',
			quote: { text: '默认最大的USDT' },
		}
	}) }), env, fakeCtxAd);
	bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('ASCII包装引用单个 USDT → 不误杀当前发送者', !bl.some((e) => e.id === '91007'));
	assert('ASCII包装引用单个 USDT → 不删当前消息', callsOf('deleteMessage').length === 0);
	assert('ASCII包装引用单个 USDT → 不全群踢', callsOf('banChatMember').length === 0);

	resetCalls();
	db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ general: ['usdt'] }));
	env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: {
			message_id: 907,
			chat: { id: -1001, type: 'supergroup', title: '技术讨论群' },
			from: { id: 91009, is_bot: false, first_name: '普通用户' },
			text: 'k',
			quote: { text: '默认最大的USDT' },
		}
	}) }), env, fakeCtxAd);
	bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('ASCII包装引用单个自定义词 USDT → 不误杀当前发送者', !bl.some((e) => e.id === '91009'));
	assert('ASCII包装引用单个自定义词 USDT → 不删当前消息', callsOf('deleteMessage').length === 0);
	assert('ASCII包装引用单个自定义词 USDT → 不全群踢', callsOf('banChatMember').length === 0);

	resetCalls();
	db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ porn: ['探花'] }));
	env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: {
			message_id: 902,
			chat: { id: -1001, type: 'supergroup', title: '广告测试群' },
			from: { id: 91003, is_bot: false, first_name: '包装号' },
			text: 'k',
			quote: { text: '我去招探花了' },
		}
	}) }), env, fakeCtxAd);
	bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('短正文引用单个高危词 → 加黑当前发送者', bl.some((e) => e.id === '91003' && e.reason === 'ad_auto'));
	assert('短正文引用单个高危词 → 删除当前消息', callsOf('deleteMessage').some((c) => String(c.body.chat_id) === '-1001' && c.body.message_id === 902));
	assert('短正文引用单个高危词 → 全群踢当前发送者', callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((c) => String(c.body.user_id) === '91003'));

	resetCalls();
	db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ porn: ['女友被轮'] }));
	env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: {
			message_id: 903,
			chat: { id: -1001, type: 'supergroup', title: '广告测试群' },
			from: { id: 91004, is_bot: false, first_name: '卡片包装号' },
			text: 'k',
			reply_to_message: {
				message_id: 800,
				web_page: {
					title: '影院大全',
					description: '女友被轮后还让我舔，太畜生了'
				}
			},
		}
	}) }), env, fakeCtxAd);
	bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('ASCII包装引用卡片广告 → 加黑当前发送者', bl.some((e) => e.id === '91004' && e.reason === 'ad_auto'));
	assert('ASCII包装引用卡片广告 → 删除当前消息', callsOf('deleteMessage').some((c) => String(c.body.chat_id) === '-1001' && c.body.message_id === 903));
	assert('ASCII包装引用卡片广告 → 全群踢当前发送者', callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((c) => String(c.body.user_id) === '91004'));

	resetCalls();
	db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ porn: ['女友被轮'] }));
	env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: {
			message_id: 906,
			chat: { id: -1001, type: 'supergroup', title: '广告测试群' },
			from: { id: 91008, is_bot: false, first_name: '正常用户' },
			text: '牛比',
			reply_to_message: {
				message_id: 804,
				web_page: {
					title: '影院大全',
					description: '女友被轮后还让我舔，太畜生了'
				}
			},
		}
	}) }), env, fakeCtxAd);
	bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('中文正常短回复引用卡片广告 → 不误杀当前发送者', !bl.some((e) => e.id === '91008'));
	assert('中文正常短回复引用卡片广告 → 不删当前消息', callsOf('deleteMessage').length === 0);
	assert('中文正常短回复引用卡片广告 → 不全群踢', callsOf('banChatMember').length === 0);

	resetCalls();
	db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ general: ['揾逼赚钱'], porn: ['大婆啦'] }));
	env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: {
			message_id: 901,
			chat: { id: -1001, type: 'supergroup', title: '广告测试群' },
			from: { id: 91002, is_bot: false, first_name: '正常用户' },
			text: '这个引用内容是广告吗，大家帮忙看一下',
			quote: { text: '📢 大婆啦\n我的妈 揾逼赚钱' },
		}
	}) }), env, fakeCtxAd);
	bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('长正文讨论引用广告 → 不误杀当前发送者', !bl.some((e) => e.id === '91002'));
	assert('长正文讨论引用广告 → 不删当前消息', callsOf('deleteMessage').length === 0);
}

// ---------- [82] identity词库导入 ----------
console.log('\n[82] identity词库导入');
{
	// ② identity 词库 importdefault 导入
	resetCalls();
	const db2 = makeFakeDB([]);
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env2 = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: db2 };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/importdefault' } }) }), env2, fakeCtxAd);
	const kwStore = JSON.parse(db2._store.get('ad_keywords_custom') || '{}');
	assert('importdefault → identity 分类有词', Array.isArray(kwStore.identity) && kwStore.identity.length > 0);
}

// ---------- 总结 ----------
console.log(`\n=== 总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
