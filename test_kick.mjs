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
function makeFakeDB(seed = [], options = {}) {
	const rows = new Map(seed.map((r) => [String(r.id), { ...r, id: String(r.id), by_user: r.by_user ?? r.by ?? null }]));
	const store = new Map();
	const batchJobs = new Map();
	const relayObservations = new Map();
	const adVotes = new Map();
	const adVoteAllowlist = new Map();
	const schemaState = {
		version: Number.isFinite(Number(options.schemaVersion)) ? Number(options.schemaVersion) : 4,
		coreTablesExist: options.coreTablesExist !== false,
		relayTableExists: options.relayTableExists !== false,
		voteTableExists: options.voteTableExists !== false,
		voteAllowlistTableExists: options.voteAllowlistTableExists !== false,
		schemaExecCount: 0,
	};
	const preparedSql = [];
	const mutationCalls = [];
	let mutationCallIndex = 0;
	const failMutationCalls = new Set(options.failMutationCalls || []);
	const failSchemaSqlIncludes = Array.isArray(options.failSchemaSqlIncludes) ? options.failSchemaSqlIncludes.map((value) => String(value)) : [];
	let recentSeq = Math.max(1, Number(options.recentSeq) || 1);
	let moderationSeq = Math.max(1, Number(options.moderationSeq) || 1);
	const syncBlacklist = () => {
		store.set('blacklist', JSON.stringify([...rows.values()].map((r) => ({
			id: String(r.id),
			reason: r.reason ?? null,
			by: r.by_user ?? r.by ?? null,
			at: r.at ?? null,
			note: r.note ?? null,
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
					note: r.note ?? null,
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
		_relayObservations: relayObservations,
		_adVotes: adVotes,
		_adVoteAllowlist: adVoteAllowlist,
		_schema: schemaState,
		_sql: preparedSql,
		_mutationCalls: mutationCalls,
		exec: async (sql) => {
			const ddl = String(sql);
			const failedFragment = failSchemaSqlIncludes.find((fragment) => ddl.includes(fragment));
			if (failedFragment) throw new Error('forced schema failure: ' + failedFragment);
			if (ddl.includes('CREATE TABLE IF NOT EXISTS schema_meta') || ddl.includes('CREATE TABLE IF NOT EXISTS blacklist')) {
				schemaState.coreTablesExist = true;
			}
			if (ddl.includes('CREATE TABLE IF NOT EXISTS ad_relay_observations')) {
				schemaState.schemaExecCount += 1;
				schemaState.relayTableExists = true;
			}
			if (ddl.includes('CREATE TABLE IF NOT EXISTS ad_votes')) {
				schemaState.schemaExecCount += 1;
				schemaState.voteTableExists = true;
			}
			if (ddl.includes('CREATE TABLE IF NOT EXISTS ad_vote_allowlist')) {
				schemaState.schemaExecCount += 1;
				schemaState.voteAllowlistTableExists = true;
			}
		},
		prepare(sql) {
			preparedSql.push(sql);
			let bound = [];
			return {
				bind(...args) { bound = args; return this; },
				async first() {
					if (sql.startsWith('SELECT version FROM schema_meta')) {
						return { version: schemaState.version };
					}
					if (sql.includes("FROM sqlite_master") && sql.includes("name = ?")) {
						const table = String(bound[0] || '');
						const exists = table === 'schema_meta' || table === 'blacklist'
							? schemaState.coreTablesExist
							: (table === 'ad_relay_observations'
								? schemaState.relayTableExists
								: (table === 'ad_votes'
									? schemaState.voteTableExists
									: (table === 'ad_vote_allowlist' ? schemaState.voteAllowlistTableExists : false)));
						return exists ? { name: table } : null;
					}
					if (sql.startsWith('SELECT id, reason, by_user, at, note FROM blacklist WHERE id = ?')) {
						const row = rows.get(String(bound[0]));
						return row ? {
							id: String(row.id),
							reason: row.reason ?? null,
							by_user: row.by_user ?? row.by ?? null,
							at: row.at ?? null,
							note: row.note ?? null,
						} : null;
					}
					if (sql.startsWith('SELECT id FROM blacklist WHERE id = ?')) {
						const id = String(bound[0]);
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
					if (sql.startsWith('SELECT actor_id, occurrences, first_seen_at, last_chat_id, last_message_id FROM ad_relay_observations')) {
						if (!schemaState.relayTableExists) throw new Error('D1_ERROR: no such table: ad_relay_observations');
						return relayObservations.get(String(bound[0])) || null;
					}
					if (sql.startsWith('SELECT vote_token, state_json, version, finalized, result, deadline_at FROM ad_votes')) {
						if (!schemaState.voteTableExists) throw new Error('D1_ERROR: no such table: ad_votes');
						const row = adVotes.get(String(bound[0]));
						return row ? {
							vote_token: row.vote_token,
							state_json: row.state_json,
							version: row.version,
							finalized: row.finalized,
							result: row.result,
							deadline_at: row.deadline_at,
						} : null;
					}
					if (sql.startsWith('SELECT vote_token FROM ad_votes WHERE chat_id = ?')) {
						if (!schemaState.voteTableExists) throw new Error('D1_ERROR: no such table: ad_votes');
						const [chatId, targetUserId, nowSeconds] = bound;
						const hit = [...adVotes.values()]
							.filter((row) => String(row.chat_id) === String(chatId)
								&& String(row.target_user_id) === String(targetUserId)
								&& Number(row.finalized) === 0
								&& Number(row.deadline_at) > Number(nowSeconds))
							.sort((a, b) => Number(b.created_at) - Number(a.created_at))[0];
						return hit ? { vote_token: hit.vote_token } : null;
					}
					if (sql.startsWith('SELECT user_id FROM ad_vote_allowlist WHERE user_id = ?')) {
						if (!schemaState.voteAllowlistTableExists) throw new Error('D1_ERROR: no such table: ad_vote_allowlist');
						const row = adVoteAllowlist.get(String(bound[0]));
						return row ? { user_id: row.user_id } : null;
					}

					if (sql.startsWith('SELECT id, type, status, payload FROM batch_jobs WHERE id = ?')) {
						return batchJobs.get(bound[0]) || null;
					}
					return null;
				},
				async run() {
					if (sql.startsWith('INSERT OR REPLACE INTO schema_meta')) {
						schemaState.version = Number(bound[0]) || 0;
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('INSERT INTO ad_votes')) {
						if (!schemaState.voteTableExists) throw new Error('D1_ERROR: no such table: ad_votes');
						const [voteToken, chatId, voteMessageId, reportedMessageId, targetUserId, creatorUserId, stateJson, createdAt, deadlineAt, updatedAt] = bound;
						if (adVotes.has(String(voteToken))) throw new Error('UNIQUE constraint failed: ad_votes.vote_token');
						adVotes.set(String(voteToken), {
							vote_token: String(voteToken),
							chat_id: String(chatId),
							vote_message_id: voteMessageId,
							reported_message_id: reportedMessageId,
							target_user_id: String(targetUserId),
							creator_user_id: String(creatorUserId),
							state_json: stateJson,
							version: 1,
							finalized: 0,
							result: null,
							created_at: Number(createdAt),
							deadline_at: Number(deadlineAt),
							updated_at: updatedAt,
						});
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('UPDATE ad_votes SET vote_message_id')) {
						const [voteMessageId, stateJson, nextVersion, finalized, resultValue, deadlineAt, updatedAt, voteToken, expectedVersion] = bound;
						const row = adVotes.get(String(voteToken));
						if (!row || Number(row.version) !== Number(expectedVersion) || Number(row.finalized) !== 0) {
							return { meta: { changes: 0 } };
						}
						adVotes.set(String(voteToken), {
							...row,
							vote_message_id: voteMessageId,
							state_json: stateJson,
							version: Number(nextVersion),
							finalized: Number(finalized),
							result: resultValue,
							deadline_at: Number(deadlineAt),
							updated_at: updatedAt,
						});
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('UPDATE ad_votes SET state_json')) {
						const [stateJson, nextVersion, resultValue, updatedAt, voteToken] = bound;
						const row = adVotes.get(String(voteToken));
						if (!row || Number(row.finalized) !== 1) return { meta: { changes: 0 } };
						adVotes.set(String(voteToken), {
							...row,
							state_json: stateJson,
							version: Number(nextVersion),
							result: resultValue,
							updated_at: updatedAt,
						});
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('DELETE FROM ad_votes WHERE created_at < ?')) {
						let changes = 0;
						for (const [key, row] of adVotes) {
							if (Number(row.created_at) < Number(bound[0])) {
								adVotes.delete(key);
								changes += 1;
							}
						}
						return { meta: { changes } };
					}
					if (sql.startsWith('INSERT OR REPLACE INTO ad_vote_allowlist')) {
						const [userId, byUser, at] = bound;
						adVoteAllowlist.set(String(userId), {
							user_id: String(userId),
							by_user: String(byUser || ''),
							at,
						});
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('DELETE FROM ad_vote_allowlist WHERE user_id = ?')) {
						const existed = adVoteAllowlist.delete(String(bound[0]));
						return { meta: { changes: existed ? 1 : 0 } };
					}
					if (sql.startsWith('INSERT OR IGNORE INTO blacklist')) {
						const [rawId, reason, by, at, note] = bound;
						const id = String(rawId);
						if (rows.has(id)) return { meta: { changes: 0 } };
						rows.set(id, { id, reason, by_user: by, at, note: note ?? null });
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
					if (sql.startsWith('INSERT INTO ad_relay_observations')) {
						if (!schemaState.relayTableExists) throw new Error('D1_ERROR: no such table: ad_relay_observations');
						const [actorId, occurrences, firstSeenAt, lastSeenAt, lastChatId, lastMessageId, originalAuthorId, quoteFingerprint, quotePreview, wrapperPreview, evidence] = bound;
						relayObservations.set(String(actorId), {
							actor_id: String(actorId),
							occurrences: Number(occurrences),
							first_seen_at: firstSeenAt,
							last_seen_at: lastSeenAt,
							last_chat_id: String(lastChatId),
							last_message_id: String(lastMessageId),
							last_original_author_id: String(originalAuthorId || ''),
							last_quote_fingerprint: quoteFingerprint,
							quote_preview: quotePreview,
							wrapper_preview: wrapperPreview,
							evidence,
						});
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('UPDATE ad_relay_observations SET')) {
						if (!schemaState.relayTableExists) throw new Error('D1_ERROR: no such table: ad_relay_observations');
						const [occurrences, lastSeenAt, lastChatId, lastMessageId, originalAuthorId, quoteFingerprint, quotePreview, wrapperPreview, evidence, actorId] = bound;
						const existing = relayObservations.get(String(actorId));
						if (!existing) return { meta: { changes: 0 } };
						relayObservations.set(String(actorId), {
							...existing, occurrences: Number(occurrences), last_seen_at: lastSeenAt,
							last_chat_id: String(lastChatId), last_message_id: String(lastMessageId),
							last_original_author_id: String(originalAuthorId || ''), last_quote_fingerprint: quoteFingerprint,
							quote_preview: quotePreview, wrapper_preview: wrapperPreview, evidence,
						});
						return { meta: { changes: 1 } };
					}

					if (sql.startsWith('INSERT INTO batch_jobs')) {
						const [id, type, status, payload, createdAt, updatedAt] = bound;
						if (batchJobs.has(id)) throw new Error('UNIQUE constraint failed: batch_jobs.id');
						batchJobs.set(id, { id, type, status, payload, created_at: createdAt, updated_at: updatedAt });
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('UPDATE batch_jobs')) {
						const [status, payload, updatedAt, id, staleBefore] = bound;
						const current = batchJobs.get(id);
						if (!current) return { meta: { changes: 0 } };
						if (sql.includes('AND updated_at = ?') && String(current.updated_at || '') !== String(staleBefore || '')) {
							return { meta: { changes: 0 } };
						}
						if (sql.includes("status IN ('queued', 'failed', 'paused')")) {
							const eligible = ['queued', 'failed', 'paused'].includes(current.status)
								|| (current.status === 'running' && String(current.updated_at || '') <= String(staleBefore || ''));
							if (!eligible) return { meta: { changes: 0 } };
						}
						batchJobs.set(id, { ...current, status, payload, updated_at: updatedAt });
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('INSERT INTO recent_messages')) {
						const [mid, chatId, chatTitle, text, fromId, fromName, createdAt] = bound;
						const data = getJson('recent_messages', { items: [] });
						const id = recentSeq++;
						data.items.push({
							id,
							mid,
							chatId,
							chatTitle,
							text,
							fromId,
							fromName,
							at: createdAt,
						});
						setJson('recent_messages', data);
						return { meta: { changes: 1, last_row_id: id } };
					}
					if (sql.startsWith('INSERT INTO moderation_messages')) {
						const [mid, chatId, fromId, createdAt] = bound;
						const data = getJson('moderation_messages', { items: [] });
						const id = moderationSeq++;
						data.items.push({
							id,
							mid,
							chatId: String(chatId),
							fromId: String(fromId),
							at: createdAt,
						});
						setJson('moderation_messages', data);
						return { meta: { changes: 1, last_row_id: id } };
					}
					if (sql.startsWith('DELETE FROM recent_messages WHERE id <= COALESCE')) {
						const limit = Number(bound[0]) || 50;
						const data = getJson('recent_messages', { items: [] });
						data.items = [...data.items].sort((a, b) => b.id - a.id).slice(0, limit).sort((a, b) => a.id - b.id);
						setJson('recent_messages', data);
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('DELETE FROM moderation_messages WHERE id <= COALESCE')) {
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
					if (sql.startsWith('INSERT OR IGNORE INTO blacklist') && sql.includes('RETURNING id')) {
						mutationCallIndex += 1;
						mutationCalls.push({ index: mutationCallIndex, type: 'insert', sql, bound: [...bound] });
						if (failMutationCalls.has(mutationCallIndex)) throw new Error(`forced mutation failure ${mutationCallIndex}`);
						const results = [];
						for (let i = 0; i < bound.length; i += 5) {
							const id = String(bound[i]);
							if (rows.has(id)) continue;
							rows.set(id, {
								id,
								reason: bound[i + 1] ?? null,
								by_user: bound[i + 2] ?? null,
								at: bound[i + 3] ?? null,
								note: bound[i + 4] ?? null,
							});
							results.push({ id });
						}
						syncBlacklist();
						return { results: options.reverseReturning ? results.reverse() : results };
					}
					if (sql.startsWith('DELETE FROM blacklist WHERE id IN') && sql.includes('RETURNING id')) {
						mutationCallIndex += 1;
						mutationCalls.push({ index: mutationCallIndex, type: 'delete', sql, bound: [...bound] });
						if (failMutationCalls.has(mutationCallIndex)) throw new Error(`forced mutation failure ${mutationCallIndex}`);
						const results = [];
						for (const rawId of bound) {
							const id = String(rawId);
							if (rows.delete(id)) results.push({ id });
						}
						syncBlacklist();
						return { results: options.reverseReturning ? results.reverse() : results };
					}
					if (sql.startsWith('SELECT id FROM blacklist WHERE id IN')) {
						return {
							results: bound
								.map((rawId) => String(rawId))
								.filter((id) => rows.has(id))
								.map((id) => ({ id }))
						};
					}
					if (sql.startsWith('PRAGMA table_info(blacklist)')) {
						return { results: ['id', 'reason', 'by_user', 'at', 'note'].map((name) => ({ name })) };
					}
					if (sql.includes('FROM blacklist')) {
						const { filterCount, results } = getBlacklistRowsForSql(sql, bound);
						const ordered = /ORDER BY at DESC/i.test(sql) ? [...results].reverse() : results;
						const limit = Number(bound[filterCount]);
						const offset = Number(bound[filterCount + 1]) || 0;
						if (Number.isFinite(limit)) {
							return { results: ordered.slice(offset, offset + limit) };
						}
						return { results: ordered };
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
						const descending = /ORDER BY id DESC/i.test(sql);
						let items = data.items
							.map((item, index) => ({
								...item,
								__orderId: Number.isFinite(Number(item.id)) ? Number(item.id) : index + 1,
							}))
							.sort((a, b) => descending ? b.__orderId - a.__orderId : a.__orderId - b.__orderId);
						const limit = Number(bound[0]);
						if (Number.isFinite(limit)) items = items.slice(0, limit);
						return {
							results: items.map((it) => ({
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
function assertExactProfileQueries(name, expectedIds, expectedChatId) {
	const calls = callsOf('getChatMember');
	const expected = [...new Set(expectedIds.map(String))];
	const counts = new Map();
	for (const call of calls) {
		const id = String(call.body?.user_id);
		counts.set(id, (counts.get(id) || 0) + 1);
	}
	const ok = calls.length === expected.length
		&& counts.size === expected.length
		&& expected.every((id) => counts.get(id) === 1)
		&& calls.every((call) => String(call.body?.chat_id) === String(expectedChatId));
	assert(name, ok, `expected=${JSON.stringify(expected)} actual=${JSON.stringify([...counts])}`);
}

// ---------- [1] /spam 触发:加黑 + 全群踢 + 当前群近期消息清扫 ----------
console.log('\n[1] /spam 触发:加黑 + 全群踢 + 当前群近期消息清扫');
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
			text: '/spam 广告引流',
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
	assert('/spam 回复全群封禁默认跨群撤回消息(revoke_messages=true)', banCalls.every((c) => c.body.revoke_messages === true));
	const banGroups = banCalls.map((c) => String(c.body.chat_id)).sort();
	assert('两个群 ID 都被覆盖', JSON.stringify(banGroups) === JSON.stringify(['-1001', '-1002']), `实际 ${JSON.stringify(banGroups)}`);

	const delCalls = callsOf('deleteMessage');
	assert('群内 /spam 指令消息 msgId=100 被删除', delCalls.some((c) => c.body.message_id === 100), `实际 ${delCalls.length}`);
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
	assert('/spam 回复模式含命令来源', dmSends[0].body.text.includes('命令来源') && dmSends[0].body.text.includes('-1001'));
	assert('/spam 回复模式含执行原因', dmSends[0].body.text.includes('执行原因:广告引流'));
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
			text: '/spam 广告引流',
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

// ---------- [1b2] /spam USER_ID_INVALID 确定性错误不重试:精准提示 ----------
console.log('\n[1b2] /spam USER_ID_INVALID 不重试且精准提示');
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
			text: '/spam 8899 广告引流',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const banCalls = callsOf('banChatMember');
	assert('/spam USER_ID_INVALID 确定性错误不重试', banCalls.length === 2 && banCalls.filter((c) => String(c.body.chat_id) === '-1002').length === 1, `实际 ${banCalls.length}`);
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/spam 用户识别失败:私聊回执存在', !!dmSend);
	assert('/spam 用户识别失败:不再误报用户 ID 无效', !dmSend.body.text.includes('用户 ID 无效'));
	assert('/spam 用户识别失败:提示 Telegram 当前无法识别', dmSend.body.text.includes('Telegram 当前无法识别该 TGID'));
	assert('/spam 用户识别失败:建议包含 /spam 重试', dmSend.body.text.includes('重试 /spam'));
}

// ---------- [1c] /spam 大 TGID 不转 Number ----------
console.log('\n[1c] /spam 大 TGID 不转 Number');
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
			text: '/spam 7965398892 广告引流',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const banCalls = callsOf('banChatMember');
	assert('/spam 大 TGID 全群踢出', banCalls.length === 2);
	assert('/spam 大 TGID 传数字', banCalls.every((c) => c.body.user_id === 7965398892));
	const delCalls = callsOf('deleteMessage').filter((c) => c.body.message_id === 210);
	assert('/spam TGID 模式删除群内指令消息', delCalls.length >= 1, `实际 ${delCalls.length}`);
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/spam TGID 模式含执行原因', !!dmSend && dmSend.body.text.includes('执行原因:广告引流'));
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
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('123 已加入黑名单', blacklist.some((e) => e.id === '123'));

	const banCalls = callsOf('banChatMember');
	assert('banChatMember 调用 2 次', banCalls.length === 2);
	assert('用户 ID 是 123', banCalls.every((c) => String(c.body.user_id) === '123'));
}

// ---------- [2a] 旧短命令不再兼容 ----------
console.log('\n[2a] 旧短命令不再兼容');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (p) => { pending.push(Promise.resolve(p)); } };
	sandbox.fetch = makeFetchMock({});
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	const removedBanCommand = '/' + ['b', 'e'].join('');
	const removedSpamCommand = '/' + ['s', 'a'].join('');
	for (const [messageId, commandText] of [[201, removedBanCommand + ' 701'], [202, removedSpamCommand + ' 702']]) {
		await handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify({
				message: {
					message_id: messageId,
					chat: { id: -1001, type: 'supergroup' },
					from: { id: 999, is_bot: false, first_name: '主人' },
					text: commandText,
				},
			}),
		}), env, fakeCtx);
	}
	await drainPending(pending);
	assert('旧短命令不写入 D1 黑名单', env.DB._rows.size === 0);
	assert('旧短命令不触发全群封禁', callsOf('banChatMember').length === 0);
	assert('旧短命令不删除消息或发送回执', callsOf('deleteMessage').length === 0 && callsOf('sendMessage').length === 0);
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
			text: '/ban [100, 200，\n300]',
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
	const normalizedD1Sql = env.DB._sql.map((sql) => sql.replace(/\s+/g, ' ').trim());
	assert('黑名单发言使用 TGID 定点查询', normalizedD1Sql.includes('SELECT id, reason, by_user, at, note FROM blacklist WHERE id = ? LIMIT 1'));
	assert('黑名单发言不再读取完整黑名单', !normalizedD1Sql.some((sql) => (
		sql.startsWith('SELECT id, reason, by_user, at, note FROM blacklist ORDER BY at ASC')
	)));
}

// ---------- [4a] D1 高频路径固定上限 ----------
console.log('\n[4a] D1 高频路径低请求验证');
{
	const db = makeFakeDB([], { moderationSeq: 63 });
	const env = { ...baseEnv, DB: db };
	const makeMessage = (messageId) => ({
		message_id: messageId,
		chat: { id: -1001, type: 'supergroup', title: '测试群' },
		from: { id: 12345, is_bot: false, first_name: '测试用户' },
		text: `普通消息 ${messageId}`,
	});

	await sandbox.cacheModerationMessage(env, makeMessage(701));
	let pruneQueries = db._sql.filter((sql) => sql.startsWith('DELETE FROM moderation_messages WHERE id <= COALESCE'));
	assert('第 63 条缓存写入不执行裁剪', pruneQueries.length === 0, `实际 ${pruneQueries.length}`);

	await sandbox.cacheModerationMessage(env, makeMessage(702));
	pruneQueries = db._sql.filter((sql) => sql.startsWith('DELETE FROM moderation_messages WHERE id <= COALESCE'));
	assert('第 64 条缓存写入只执行一次裁剪', pruneQueries.length === 1, `实际 ${pruneQueries.length}`);

	db._store.set('ad_keywords_custom', JSON.stringify({ finance: ['usdt'], general: [] }));
	db._store.set('ad_samples', JSON.stringify({ fingerprints: ['samplefingerprint'], count: 1 }));
	await sandbox.mergeAdKeywordsFromD1(env);
	await sandbox.mergeAdKeywordsFromD1(env);
	await sandbox.mergeAdSamplesFromD1(env);
	await sandbox.mergeAdSamplesFromD1(env);

	const keywordReads = db._sql.filter((sql) => sql.startsWith('SELECT data FROM ad_keywords')).length;
	const sampleReads = db._sql.filter((sql) => sql.startsWith('SELECT data FROM ad_samples')).length;
	assert('同一实例短时间重复合并词库只读 D1 一次', keywordReads === 1, `实际 ${keywordReads}`);
	assert('同一实例短时间重复合并样本只读 D1 一次', sampleReads === 1, `实际 ${sampleReads}`);

	const sqlCountBeforeSteadyMessage = db._sql.length;
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({
			message: {
				message_id: 703,
				chat: { id: -1001, type: 'supergroup', title: '测试群' },
				from: { id: 23456, is_bot: false, first_name: '普通用户' },
				text: '普通聊天内容',
			}
		})
	}), env);
	const steadyMessageSql = db._sql
		.slice(sqlCountBeforeSteadyMessage)
		.map((sql) => sql.replace(/\s+/g, ' ').trim());
	assert('稳定态普通群消息仅执行 2 条必要 D1 SQL', steadyMessageSql.length === 2, JSON.stringify(steadyMessageSql));
	assert('稳定态 D1 SQL = 消息缓存写入 + 黑名单主键查询', (
		steadyMessageSql.some((sql) => sql.startsWith('INSERT INTO moderation_messages')) &&
		steadyMessageSql.includes('SELECT id, reason, by_user, at, note FROM blacklist WHERE id = ? LIMIT 1')
	), JSON.stringify(steadyMessageSql));
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

// ---------- [8h] /{TOKEN}/purge 默认清扫 /ban + /spam + /ad 投票 ----------
console.log('\n[8h] /{TOKEN}/purge 默认清扫 /ban + /spam + /ad 投票');
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
			{ id: '8106', reason: 'ad_vote', by: 'system', at: '2026-05-06T00:00:00Z' },
		]),
	};
	const res = await handler.fetch(new Request(`https://x.com/${TOKEN}/purge?limit=20`), env);
	const json = await res.json();

	assert('默认清扫 200', res.status === 200);
	assert('默认范围包含 /ban + /spam + /ad 投票（兼容旧 spam reason）', json.reasons === 'manual,sa,spam,ad_vote' && json.清扫范围 === '/ban + /spam + /ad 投票');
	assert('默认统计 manual/sa/spam/ad_vote 4 条', json.黑名单总数 === 4);
	assert('默认总任务数 8', json.总任务数 === 8);
	assert('默认不扫 ad_auto/manual_ban', callsOf('banChatMember').every((c) => ['8101', '8102', '8103', '8106'].includes(String(c.body.user_id))));
	assert('默认踢出 8 次', callsOf('banChatMember').length === 8);
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
	assert('群内 /ban 指令消息 msgId=700 被删除', commandDelCalls.length >= 1, `实际 ${commandDelCalls.length}`);

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
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('部分失败:私聊回执存在', !!dmSend);
	assert('部分失败:汇总显示踢出 1/2', dmSend.body.text.includes('1/2'));
	assert('部分失败:含友好原因（权限不足）', dmSend.body.text.includes('权限不足'));
	assert('部分失败:含建议（封禁用户）', dmSend.body.text.includes('封禁用户'));
}

// ---------- [10b2] 群内 /ban USER_ID_INVALID 确定性错误不重试 ----------
console.log('\n[10b2] 群内 /ban USER_ID_INVALID 不重试');
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
			text: '/ban 812889600',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const banCalls = callsOf('banChatMember');
	assert('/ban USER_ID_INVALID 确定性错误不重试', banCalls.length === 2 && banCalls.filter((c) => String(c.body.chat_id) === '-1002').length === 1, `实际 ${banCalls.length}`);
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/ban USER_ID_INVALID:私聊回执存在', !!dmSend);
	assert('/ban USER_ID_INVALID:显示封禁成功 1/2', dmSend.body.text.includes('Telegram 群封禁/预封成功 1/2'));
	assert('/ban USER_ID_INVALID:提示 Telegram 当前无法识别', dmSend.body.text.includes('Telegram 当前无法识别该 TGID'));
}

// ---------- [10b3] 群内 /ban 首次加黑成功但 Telegram 无法识别 TGID ----------
console.log('\n[10b3] 群内 /ban 首次加黑成功但 Telegram 无法识别 TGID');
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
			text: '/ban 7070447913',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('/ban 无法识别 TGID:D1 仍新增成功', blacklist.some((e) => e.id === '7070447913'));
	assert('/ban USER_ID_INVALID 每个群只请求一次', callsOf('banChatMember').length === 2);
	const groupFlash = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '-1001');
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/ban 无法识别 TGID:群内短提示说明 D1 已生效', !!groupFlash && groupFlash.body.text.includes('D1已生效'));
	assert('/ban 无法识别 TGID:群内短提示不误报 bot 管理员权限', !!groupFlash && !groupFlash.body.text.includes('请检查 bot 是否为群管理员'));
	assert('/ban 无法识别 TGID:私聊详情说明 D1 黑名单已生效', !!dmSend && dmSend.body.text.includes('D1 黑名单已生效'));
	assert('/ban 无法识别 TGID:私聊详情说明 Telegram 当前无法识别', dmSend.body.text.includes('Telegram 当前无法识别该 TGID'));
	assert('/ban 无法识别 TGID:私聊详情说明后续仍会拦截', dmSend.body.text.includes('后续进群/发言仍会按 D1 黑名单拦截'));
	assert('/ban 无法识别 TGID:不误报用户不存在', !dmSend.body.text.includes('用户不存在'));
}

// ---------- [10b4] /ban 目标不在群内但 Telegram 预封成功 ----------
console.log('\n[10b4] /ban 目标不在群内但 Telegram 预封成功');
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
			text: '/ban 8582619616',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/ban 预封成功:私聊详情存在', !!dmSend);
	assert('/ban 预封成功:汇总使用封禁/预封口径', dmSend.body.text.includes('Telegram 群封禁/预封成功 2/2'));
	assert('/ban 预封成功:逐群说明预封', dmSend.body.text.includes('已加入群封禁列表（预封，禁止后续进群）'));
	assert('/ban 预封成功:展示封禁前不在群内', dmSend.body.text.includes('封禁前状态：不在群内'));
	assert('/ban 预封成功:说明不是踢出在线成员', dmSend.body.text.includes('不是从群里踢出了在线成员'));
	assert('/ban 预封成功:不使用旧踢出汇总', !dmSend.body.text.includes('已从全部'));
}

// ---------- [10b5] /ban 目标在群内时显示封禁并移出 ----------
console.log('\n[10b5] /ban 目标在群内时显示封禁并移出');
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
			text: '/ban 9000001',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/ban 在群内:显示已封禁并移出群聊', !!dmSend && dmSend.body.text.includes('已封禁并移出群聊'));
	assert('/ban 在群内:显示封禁前普通成员', dmSend.body.text.includes('封禁前状态：在群内（普通成员）'));
}

// ---------- [10c] 群内 /ban 大 TGID 已存在仍保持字符串踢出 ----------
console.log('\n[10c] 群内 /ban 大 TGID 已存在仍保持字符串踢出');
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
			text: '/ban 7965398892',
		},
	};
	const env = {
		...baseEnv,
		DB: makeFakeDB([{ id: '7965398892', reason: 'manual', by: '999', at: '2026-06-13T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const banCalls = callsOf('banChatMember');
	assert('/ban 已存在大 TGID 仍全群踢出', banCalls.length === 2);
	assert('/ban 大 TGID 传数字', banCalls.every((c) => c.body.user_id === 7965398892));
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/ban 已存在分支仍有回执', !!dmSend && dmSend.body.text.includes('已在黑名单中'));
}

// ---------- [11] 群内 /ban 批量 ----------
console.log('\n[11] 群内 /ban 批量');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
		getChatMember: (b) => {
			const profiles = {
				100: { id: 100, first_name: '用户甲', username: 'user100' },
				200: { id: 200, first_name: '用户乙' },
				300: { id: 300, username: 'user300' },
			};
			return { ok: true, result: { status: 'member', user: profiles[b.user_id] } };
		},
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
			text: '/ban [100, 200，\n300]',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('3 个用户全部加黑', blacklist.length === 3);

	// 3 用户 × 2 群 = 6 次 ban
	assert('banChatMember 调用 6 次', callsOf('banChatMember').length === 6);

	const sendCalls = callsOf('sendMessage');
	assert('sendMessage 调用 2 次（闪屏+私聊详情）', sendCalls.length === 2);
	const dmSend = sendCalls.find((c) => String(c.body.chat_id) === '999');
	assert('私聊详情含批量结果', dmSend.body.text.includes('批量添加完成'));
	assert('私聊详情含每个用户', dmSend.body.text.includes('100') && dmSend.body.text.includes('200') && dmSend.body.text.includes('300'));
	assert('私聊详情含逐用户明细', dmSend.body.text.includes('逐用户 Telegram 群封禁/预封明细'));
	assert('私聊详情含群名', dmSend.body.text.includes('测试群-1001') && dmSend.body.text.includes('测试群-1002'));
	assert('批量 /ban 显示可点击姓名', dmSend.body.text.includes('<a href="tg://user?id=100">用户甲</a>') && dmSend.body.text.includes('<a href="tg://user?id=200">用户乙</a>'));
	assert('批量 /ban 同时显示 username', dmSend.body.text.includes('<code>@user100</code>'));
	assert('批量 /ban 仅 username 时可点击', dmSend.body.text.includes('<a href="tg://user?id=300">@user300</a>'));
	assertExactProfileQueries('批量 /ban 每个目标只查询来源群一次资料', ['100', '200', '300'], '-1001');
	assert('批量 /ban 数组格式默认原因未填写', dmSend.body.text.includes('执行原因:未填写'));
	assert('批量 /ban 含作用范围', dmSend.body.text.includes('作用范围:全部 2 个配置群'));
	const commandDelCalls = callsOf('deleteMessage').filter((c) => c.body.message_id === 800);
	assert('群内批量 /ban 指令消息 msgId=800 被删除', commandDelCalls.length >= 1, `实际 ${commandDelCalls.length}`);
	assert('小批量 /ban 不创建 D1 任务', env.DB._jobs.size === 0);
}

// ---------- [11a] 群内 /spam 小批量用户资料 ----------
console.log('\n[11a] 群内 /spam 小批量用户资料');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatMember: (b) => {
			if (String(b.user_id) === '410') {
				return { ok: true, result: { status: 'member', user: { id: 410, first_name: '广告甲', username: 'spam410' } } };
			}
			return { ok: false, error_code: 400, description: 'Bad Request: USER_ID_INVALID' };
		},
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: `测试群${b.chat_id}`, type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 556 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	const update = {
		message: {
			message_id: 801,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 999, is_bot: false, first_name: '主人' },
			text: '/spam 410,420 批量广告',
		},
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('小批量 /spam 两个用户全部加黑', blacklist.length === 2 && blacklist.every((entry) => entry.reason === 'spam'));
	assert('小批量 /spam 执行 2 用户 × 2 群封禁', callsOf('banChatMember').length === 4);
	assertExactProfileQueries('小批量 /spam 每个目标只查询来源群一次资料', ['410', '420'], '-1001');
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('小批量 /spam 可解析用户显示可点击姓名', dmSend.body.text.includes('<a href="tg://user?id=410">广告甲</a>') && dmSend.body.text.includes('<code>@spam410</code>'));
	assert('小批量 /spam 无法解析时回退可点击 TGID', dmSend.body.text.includes('<a href="tg://user?id=420">420</a> <code>420</code>'));
}

// ---------- [11a2] 私聊 /unban 12 用户 × 2 群同步路径 ----------
console.log('\n[11a2] 小批量 /unban 身份、原子块与资料查询');
{
	resetCalls();
	const ids = Array.from({ length: 12 }, (_, i) => String(57000 + i));
	const titles = {
		'-1001': `主群${'甲'.repeat(110)}`,
		'-1002': `副群${'乙'.repeat(110)}`
	};
	sandbox.fetch = makeFetchMock({
		getChatMember: (body) => ({
			ok: true,
			result: {
				status: 'left',
				user: { id: Number(body.user_id), first_name: `解封用户${body.user_id}`, username: `unban_${body.user_id}` }
			}
		}),
		getChat: (body) => ({ ok: true, result: { id: Number(body.chat_id), title: titles[String(body.chat_id)], type: 'supergroup' } }),
		unbanChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env = {
		...baseEnv,
		DB: makeFakeDB([])
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 802, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/unban ${ids.join(',')}` } })
	}), env);
	assert('小批量 /unban 保持同步且不创建 Queue', env.DB._jobs.size === 0);
	assertExactProfileQueries('小批量 /unban 每个 TGID 只查询首群一次', ids, '-1001');
	assert('小批量 /unban 执行 12×2 次群解封', callsOf('unbanChatMember').length === 24);
	assert('小批量 /unban 不执行 D1 删除 mutation', env.DB._mutationCalls.length === 0 && env.DB._rows.size === 0);
	assert('小批量 /unban 每次请求携带 only_if_banned', callsOf('unbanChatMember').every((call) => call.body.only_if_banned === true));
	assert('小批量 /unban 逐群详情共享群名 Map', callsOf('getChat').length === 2);
	const chunks = callsOf('sendMessage').filter((call) => String(call.body.chat_id) === '999').map((call) => String(call.body.text || ''));
	const combined = chunks.join('\n\n');
	assert('小批量 /unban 回执触发 3500 字安全分块', chunks.length > 1 && chunks.every((text) => text.length <= 3500));
	assert('小批量 /unban 完整身份只在汇总出现一次', ids.every((id) => combined.split(`>解封用户${id}</a>`).length - 1 === 1 && combined.includes(`<code>@unban_${id}</code> <code>${id}</code>`)));
	assert('小批量 /unban 逐群明细使用精简身份', ids.every((id) => combined.split(`<b>用户</b> <a href="tg://user?id=${id}">${id}</a>`).length - 1 === 1));
	assert('小批量 /unban 分块不丢用户内容', ids.every((id) => combined.includes(id)));
}

// ---------- [11a3] 小批量 /unban 混合 D1 黑名单资格 ----------
console.log('\n[11a3] 小批量 /unban 混合 D1 黑名单资格');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	const ids = ['57100', '57101', '57102'];
	sandbox.fetch = makeFetchMock({
		getChatMember: (body) => ({
			ok: true,
			result: { status: 'member', user: { id: Number(body.user_id), first_name: `混合用户${body.user_id}` } }
		}),
		getChat: (body) => ({ ok: true, result: { id: Number(body.chat_id), title: `混合群${body.chat_id}`, type: 'supergroup' } }),
		unbanChatMember: (body) => body.only_if_banned === true
			? ({ ok: true, result: true })
			: ({ ok: false, error_code: 400, description: 'unsafe unban request' }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env = {
		...baseEnv,
		DB: makeFakeDB([{ id: '57101', reason: 'manual', by: '999', at: '2026-07-01T00:00:00Z' }])
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 803, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/unban ${ids.join(',')}` } })
	}), env, fakeCtx);
	assert('混合 /unban 只解封不在 D1 的 2 个目标（覆盖 2 群）', callsOf('unbanChatMember').length === 4);
	assert('混合 /unban D1 黑名单目标记录保留', env.DB._rows.has('57101'));
	assert('混合 /unban 不执行 D1 删除 mutation', env.DB._mutationCalls.length === 0);
	assert('混合 /unban 所有 Telegram 请求带 only_if_banned', callsOf('unbanChatMember').every((call) => call.body.only_if_banned === true));
	const dmText = callsOf('sendMessage').filter((call) => String(call.body.chat_id) === '999').map((call) => call.body.text).join('\n');
	assert('混合 /unban 回执明确拒绝 D1 黑名单目标', dmText.includes('D1 黑名单拒绝') && dmText.includes('57101'));
}

// ---------- [11b] 群内 /ban 20 个 TGID → D1 批量任务 ----------
console.log('\n[11b] 群内 /ban 20 个 TGID → D1 批量任务');
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
			text: `/ban [${ids.join(',')}]`,
		},
	};
	env = { ...baseEnv, DB: makeFakeDB([]) };
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	await drainPending(pending);

	assert('20 个 /ban 创建 1 个 D1 任务', env.DB._jobs.size === 1);
	const jobRow = [...env.DB._jobs.values()][0];
	const job = JSON.parse(jobRow.payload);
	assert('批量 /ban 自动续接后完成', job.status === 'done' && job.cursor === 20);
	assert('批量 /ban 的 40 个群操作按 24 上限分 2 次 Queue', job.autoRunCount === 2);
	assert('批量 /ban 自动续接使用 Queue', env.BULK_QUEUE.sent.length >= 1);
	assert('批量 /ban 任务记录操作类型', job.action === 'ban' && job.reason === 'manual');
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('批量 /ban 自动写入全部黑名单', blacklist.length === 20 && blacklist.every((e) => e.reason === 'manual'));
	assert('批量 /ban Queue 每 20 人只执行 1 条 D1 mutation', env.DB._mutationCalls.length === 1 && env.DB._mutationCalls[0].bound.length === 100);
	assert('批量 /ban 自动踢人全部完成', callsOf('banChatMember').length === 40);
	assert('大批量 /ban Queue 路径不查询用户资料', callsOf('getChatMember').length === 0);
	assert('批量 /ban 指令消息被删除', callsOf('deleteMessage').some((c) => c.body.message_id === 810));
	const sendTexts = callsOf('sendMessage').map((c) => c.body.text).join('\n');
	assert('批量 /ban 发送任务创建通知', sendTexts.includes('批量任务已创建'));
	assert('批量 /ban 自动完成后发送完成通知', sendTexts.includes('批量任务完成'));

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
	assert('/jobrun 不查询用户资料', callsOf('getChatMember').length === 0);
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
	assert('/job 第 1 页最多查询 10 个用户资料', callsOf('getChatMember').length === 10);
	assert('/job 用户资料只查任务来源配置群', callsOf('getChatMember').every((c) => String(c.body.chat_id) === '-1001'));
	const firstPageText = callsOf('sendMessage').map((c) => c.body.text).join('\n');
	assert('/job 第 1 页显示用户身份', firstPageText.includes('目标用户') && firstPageText.includes(ids[0]));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 817, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/job ${job.id} 2` } })
	}), env, fakeCtx);
	assert('/job 第 2 页仍只查询 10 个用户资料', callsOf('getChatMember').length === 10);
	const secondPageText = callsOf('sendMessage').map((c) => c.body.text).join('\n');
	assert('/job 第 2 页显示后 10 个用户', secondPageText.includes('第 2/2 页') && secondPageText.includes(ids[19]));
}

// [11b1] 未绑定 Queue 时只创建 D1 任务，不后台跑大批量 /ban
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
				text: `/ban [${ids.join(',')}]`,
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

	const legacyRow = [...env.DB._jobs.values()][0];
	const legacyJob = JSON.parse(legacyRow.payload);
	const removedSpamCommand = '/' + ['s', 'a'].join('');
	legacyJob.action = 'sa';
	legacyJob.reason = 'sa';
	legacyJob.command = removedSpamCommand;
	legacyRow.type = 'sa';
	legacyRow.payload = JSON.stringify(legacyJob);

	resetCalls();
	for (let run = 0; run < 2; run += 1) {
		await handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify({ message: { message_id: 820 + run, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/jobrun ${job.id}` } }),
		}), env, fakeCtx);
		await drainPending(pending);
	}
	const resumedJob = JSON.parse(env.DB._jobs.get(job.id).payload);
	const resumedNotices = callsOf('sendMessage').map((call) => String(call.body.text || '')).join('\n');
	assert('历史批量任务仍可续跑完成', resumedJob.status === 'done' && resumedJob.cursor === 20);
	assert('历史批量 action/command 保存时统一为 spam', resumedJob.action === 'spam' && resumedJob.command === '/spam');
	assert('历史批量任务保留旧 reason 数据语义', [...env.DB._rows.values()].every((row) => row.reason === 'sa'));
	assert('历史批量任务回执只显示 /spam', resumedNotices.includes('/spam') && !resumedNotices.includes(removedSpamCommand));
}

// ---------- [11b2] D1 批量任务失败原因中文化（/ban）----------
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
				text: `/ban [${ids.join(',')}]`,
			}
		})
	}), env, fakeCtx);
	await drainPending(pending);

	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('批量任务失败场景也自动跑完', job.status === 'done' && job.cursor === 20);
	assert('确定性权限错误不重试', callsOf('banChatMember').length === 40);
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

// ---------- [11c] 群内 /spam 20 个 TGID → D1 批量任务 ----------
console.log('\n[11c] 群内 /spam 20 个 TGID → D1 批量任务');
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
			text: `/spam [${ids.join('，')}]`,
		},
	};
	env = { ...baseEnv, DB: makeFakeDB([]) };
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	await drainPending(pending);

	assert('20 个 /spam 创建 1 个 D1 任务', env.DB._jobs.size === 1);
	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('批量 /spam 自动续接后完成', job.status === 'done' && job.cursor === 20 && job.action === 'spam');
	assert('批量 /spam 的 40 个群操作按 24 上限分 2 次 Queue', job.autoRunCount === 2);
	assert('批量 /spam 自动续接使用 Queue', env.BULK_QUEUE.sent.length >= 1);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('批量 /spam 自动写入全部 spam reason', blacklist.length === 20 && blacklist.every((e) => e.reason === 'spam'));
	assert('批量 /spam 自动踢人全部完成', callsOf('banChatMember').length === 40);
	assert('大批量 /spam Queue 路径不查询用户资料', callsOf('getChatMember').length === 0);
}

// ---------- [11d] /ban 7 个 TGID × 12 群 → 按操作量转 D1 任务 ----------
console.log('\n[11d] /ban 7 个 TGID × 12 群 → 按操作量转 D1 任务');
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
				text: `/ban ${ids.join(' ')} 批量广告`,
			}
		})
	}), env, fakeCtx);
	await drainPending(pending);

	assert('7 个 TGID × 12 群创建 D1 任务', env.DB._jobs.size === 1);
	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('7 个 TGID × 12 群总操作数记录为 84', job.totals.operations === 84 && job.totals.groups === 12);
	assert('7×12 自动续接后完成', job.status === 'done' && job.cursor === 7);
	assert('7×12 的 84 个群操作按 24 上限分 4 次 Queue', job.autoRunCount === 4);
	assert('7×12 自动续接使用 Queue', env.BULK_QUEUE.sent.length >= 1);
	assert('7×12 自动踢人全部完成', callsOf('banChatMember').length === 84);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('7×12 自动写入全部黑名单', blacklist.length === 7 && blacklist.every((e) => e.reason === 'manual'));
}

// ---------- [11e] 私聊 /ban 10 个 TGID × 11 群 → 自动执行 ----------
console.log('\n[11e] 私聊 /ban 10 个 TGID × 11 群 → 自动执行');
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
				text: `/ban ${ids.join(',')}`,
			}
		})
	}), env, fakeCtx);
	await drainPending(pending);

	assert('私聊 10×11 创建 1 个 D1 任务', env.DB._jobs.size === 1);
	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('私聊 10×11 自动续接后完成', job.status === 'done' && job.cursor === 10);
	assert('私聊 10×11 的 110 个群操作按 24 上限分 5 次 Queue', job.autoRunCount === 5);
	assert('私聊 10×11 自动续接使用 Queue', env.BULK_QUEUE.sent.length >= 1);
	assert('私聊 10×11 自动续接不再 HTTP 自调用', internalUrls.length === 0);
	assert('私聊 10×11 自动踢人全部完成', callsOf('banChatMember').length === 110);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('私聊 10×11 自动写入全部黑名单', blacklist.length === 10 && blacklist.every((e) => e.reason === 'manual'));
	const sendTexts = callsOf('sendMessage').map((c) => c.body.text).join('\n');
	assert('私聊 10×11 自动完成后发送完成通知', sendTexts.includes('批量任务完成') && sendTexts.includes('已完成'));
}

// ---------- [11f] 同步预算边界 + 最坏一次重试 ----------
console.log('\n[11f] 同步预算边界 + 最坏一次重试');
for (const [userCount, groupCount] of [[19, 1], [12, 2], [3, 8]]) {
	resetCalls();
	let activeProfiles = 0;
	let maxProfileConcurrency = 0;
	const mutationAttempts = new Map();
	sandbox.fetch = makeFetchMock({
		getChatMember: async (body) => {
			activeProfiles += 1;
			maxProfileConcurrency = Math.max(maxProfileConcurrency, activeProfiles);
			await new Promise((resolve) => setTimeout(resolve, 2));
			activeProfiles -= 1;
			return {
				ok: true,
				result: {
					status: 'member',
					user: { id: Number(body.user_id), first_name: `用户${body.user_id}`, username: `user_${body.user_id}`.slice(0, 32) }
				}
			};
		},
		banChatMember: (body) => {
			const key = `${body.chat_id}:${body.user_id}`;
			const attempt = (mutationAttempts.get(key) || 0) + 1;
			mutationAttempts.set(key, attempt);
			return attempt === 1
				? { ok: false, error_code: 500, description: 'Internal Server Error: temporary' }
				: { ok: true, result: true };
		},
		getChat: (body) => ({ ok: true, result: { id: Number(body.chat_id), title: `预算群${body.chat_id}`, type: 'supergroup' } }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const groups = Array.from({ length: groupCount }, (_, i) => String(-2000000000000 - i));
	const ids = Array.from({ length: userCount }, (_, i) => String(40000 + userCount * 100 + i));
	const env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: groups.join(','),
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({
			message: {
				message_id: 830 + groupCount,
				chat: { id: 999, type: 'private' },
				from: { id: 999, is_bot: false, first_name: '主人' },
				text: `/ban ${ids.join(',')}`
			}
		})
	}), env);
	assert(`${userCount}×${groupCount} 保持同步且不创建 Queue 任务`, env.DB._jobs.size === 0);
	assertExactProfileQueries(`${userCount}×${groupCount} 每个 TGID 只查首群一次资料`, ids, groups[0]);
	assert(`${userCount}×${groupCount} 资料查询并发不超过 3`, maxProfileConcurrency > 1 && maxProfileConcurrency <= 3);
	assert(`${userCount}×${groupCount} 最坏重试恰好 2UG 次`, callsOf('banChatMember').length === 2 * userCount * groupCount);
	assert(`${userCount}×${groupCount} 每个用户群组合不超过两次`, [...mutationAttempts.values()].every((count) => count === 2));
	assert(`${userCount}×${groupCount} 群资料只查 G 次`, callsOf('getChat').length === groupCount);
	assert(`${userCount}×${groupCount} D1 只执行 1 条批量 mutation`, env.DB._mutationCalls.length === 1);
	assert(`${userCount}×${groupCount} Telegram 回执每块不超过 3500`, callsOf('sendMessage').every((call) => Array.from(String(call.body.text || '')).length <= 3500));
}

// ---------- [11g] 4 用户 × 7 群按操作数进入 Queue ----------
console.log('\n[11g] 4×7 进入 Queue');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (promise) => { pending.push(Promise.resolve(promise)); } };
	let env;
	sandbox.fetch = makeFetchMock({
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const groups = Array.from({ length: 7 }, (_, i) => String(-2100000000000 - i));
	const ids = ['51001', '51002', '51003', '51004'];
	env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: groups.join(','),
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 850, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/ban ${ids.join(',')}` } })
	}), env, fakeCtx);
	await drainPending(pending);
	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('4×7 创建 Queue 任务', env.DB._jobs.size === 1 && job.totals.operations === 28);
	assert('4×7 的 28 个群操作分 2 次 Queue 完成', job.status === 'done' && job.autoRunCount === 2);
	assert('4×7 Queue 路径资料查询为 0', callsOf('getChatMember').length === 0);
	assert('4×7 Queue 完成 28 次群封禁', callsOf('banChatMember').length === 28);
	assert('4×7 Queue D1 只执行 1 条 mutation', env.DB._mutationCalls.length === 1);
}

// ---------- [11g2] 单用户逐群探测超过 100 请求预算时进入 Queue ----------
console.log('\n[11g2] 单用户逐群探测预算');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (promise) => { pending.push(Promise.resolve(promise)); } };
	let env;
	const groups = Array.from({ length: 23 }, (_, i) => String(-2200000000000 - i));
	sandbox.fetch = makeFetchMock({
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: groups.join(','),
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 8502, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/ban 51999' } })
	}), env, fakeCtx);
	await drainPending(pending);
	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('1×23 /ban 因逐群探测估算 103 进入 Queue', job.totals.operations === 23 && job.totals.estimatedSubrequests === 103);
	assert('1×23 Queue 单轮完成且不逐群查询资料', job.status === 'done' && job.autoRunCount === 1 && callsOf('getChatMember').length === 0);
	assert('1×23 Queue 完成当前 23 个配置群封禁', callsOf('banChatMember').length === 23 && callsOf('banChatMember').every((call) => groups.includes(String(call.body.chat_id))));
}

// ---------- [11g3] 普通管理员当前群一次鉴权后保持安全同步 ----------
console.log('\n[11g3] 普通管理员当前群一次鉴权预算');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (promise) => { pending.push(Promise.resolve(promise)); } };
	let env;
	const groups = Array.from({ length: 18 }, (_, i) => String(-2300000000000 - i));
	const currentGroup = groups.at(-1);
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (body) => ({
			ok: true,
			result: String(body.chat_id) === currentGroup
				? [{ status: 'administrator', user: { id: 777, is_bot: false } }]
				: []
		}),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: Number(body.user_id), first_name: '预算用户' } } }),
		getChat: (body) => ({ ok: true, result: { id: Number(body.chat_id), title: `预算群${body.chat_id}`, type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: groups.join(','),
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 8503, chat: { id: Number(currentGroup), type: 'supergroup' }, from: { id: 777, is_bot: false }, text: '/ban 51998' } })
	}), env, fakeCtx);
	await drainPending(pending);
	const adminCalls = callsOf('getChatAdministrators');
	assert('普通管理员只查询当前发令群管理员列表 1 次', adminCalls.length === 1 && String(adminCalls[0].body.chat_id) === currentGroup);
	assert('普通管理员 1×18 在一次鉴权预算下保持同步', env.DB._jobs.size === 0);
	assert('普通管理员同步路径逐群探测目标状态', callsOf('getChatMember').length === 18);
	assert('普通管理员授权成功后仍封禁全部 18 个配置群', callsOf('banChatMember').length === 18);
	assert('普通管理员同步 /ban 仍写入 D1 全局黑名单', env.DB._rows.has('51998'));
}

// ---------- [11h] 50/51 人边界 ----------
console.log('\n[11h] 50/51 人边界');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (promise) => { pending.push(Promise.resolve(promise)); } };
	let env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: '-1001',
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	sandbox.fetch = makeFetchMock({
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	const fifty = Array.from({ length: 50 }, (_, i) => String(52000 + i));
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 851, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/ban ${fifty.join(',')}` } })
	}), env, fakeCtx);
	await drainPending(pending);
	const acceptedJob = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('50 人允许创建 Queue 任务并完成', acceptedJob.status === 'done' && acceptedJob.cursor === 50);
	assert('50 人按三个用户批次执行 3 次 Queue', acceptedJob.autoRunCount === 3);
	assert('50 人按 20/20/10 使用 3 条 D1 mutation', env.DB._mutationCalls.length === 3);
	assert('50 人 Queue 执行 50 次群封禁', callsOf('banChatMember').length === 50);

	resetCalls();
	const unbanPending = [];
	const unbanCtx = { waitUntil: (promise) => { unbanPending.push(Promise.resolve(promise)); } };
	let unbanEnv = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: '-1001',
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	sandbox.fetch = makeFetchMock({
		unbanChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 2 } }),
	});
	unbanEnv.BULK_QUEUE = makeFakeBulkQueue(() => unbanEnv, unbanCtx);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 8511, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/unban ${fifty.join(',')}` } })
	}), unbanEnv, unbanCtx);
	await drainPending(unbanPending);
	const acceptedUnbanJob = JSON.parse([...unbanEnv.DB._jobs.values()][0].payload);
	assert('/unban 50 人允许创建 Queue 任务并完成', acceptedUnbanJob.status === 'done' && acceptedUnbanJob.cursor === 50);
	assert('/unban 50 人按 20/20/10 完成 D1 只读资格检查', acceptedUnbanJob.stats.unbanEligible === 50 && acceptedUnbanJob.stats.unbanBlacklisted === 0);
	assert('/unban 50 人不执行任何 D1 mutation', unbanEnv.DB._mutationCalls.length === 0);
	assert('/unban 50 人 Queue 执行 50 次群解封', callsOf('unbanChatMember').length === 50);
	assert('/unban 50 人 Queue 全部请求带 only_if_banned', callsOf('unbanChatMember').every((call) => call.body.only_if_banned === true));

	for (const command of ['/ban', '/spam', '/unban']) {
		resetCalls();
		const fiftyOne = Array.from({ length: 51 }, (_, i) => String(53000 + i));
		const rejectEnv = {
			TOKEN,
			BOT_TOKEN: '0:fake',
			GROUP_ID: '-1001',
			OWNER_IDS: '999',
			DB: makeFakeDB([])
		};
		await handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify({ message: { message_id: 852, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `${command} ${fiftyOne.join(',')}` } })
		}), rejectEnv);
		assert(`${command} 51 人不创建 Queue 任务`, rejectEnv.DB._jobs.size === 0);
		assert(`${command} 51 人不执行 D1 或群操作`, rejectEnv.DB._mutationCalls.length === 0 && callsOf('banChatMember').length === 0 && callsOf('unbanChatMember').length === 0);
		assert(`${command} 51 人明确提示最多 50`, callsOf('sendMessage').some((call) => String(call.body.text).includes('一次最多 50')));
	}
}

// ---------- [11i] /unban 大批量 Queue + /job 按需资料 ----------
console.log('\n[11i] /unban Queue 与按需资料');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (promise) => { pending.push(Promise.resolve(promise)); } };
	const ids = Array.from({ length: 20 }, (_, i) => String(54000 + i));
	let env = {
		...baseEnv,
		DB: makeFakeDB(ids.slice(0, 5).map((id) => ({ id, reason: 'manual', by: '999', at: '2026-07-01T00:00:00Z' })))
	};
	sandbox.fetch = makeFetchMock({
		unbanChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 853, chat: { id: -1001, type: 'supergroup', title: '解封群' }, from: { id: 999, is_bot: false }, text: `/unban ${ids.join(',')}` } })
	}), env, fakeCtx);
	await drainPending(pending);
	const job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('/unban 20 人创建 unban Queue 任务', job.action === 'unban' && job.command === '/unban');
	assert('/unban Queue 混合资格完成且保留 5 条 D1', job.status === 'done' && job.stats.unbanEligible === 15 && job.stats.unbanBlacklisted === 5 && env.DB._rows.size === 5);
	assert('/unban 30 个群操作按 24 上限分 2 次 Queue', job.autoRunCount === 2);
	assert('/unban Queue 不执行 DELETE mutation', env.DB._mutationCalls.length === 0);
	assert('/unban Queue 仅执行 15×2 次群解封', callsOf('unbanChatMember').length === 30);
	assert('/unban Queue 全部请求带 only_if_banned', callsOf('unbanChatMember').every((call) => call.body.only_if_banned === true));
	assert('/unban Queue 失败明细记录 D1 黑名单拒绝', job.failures.filter((failure) => failure.phase === 'unban_blocked').length === 5);
	assert('/unban Queue 执行和完成通知资料查询为 0', callsOf('getChatMember').length === 0);

	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatMember: (body) => ({ ok: true, result: { status: 'left', user: { id: Number(body.user_id), first_name: `解封用户${body.user_id}`, username: `unban_${body.user_id}`.slice(0, 32) } } }),
		sendMessage: () => ({ ok: true, result: { message_id: 2 } }),
	});
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 854, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/job ${job.id} 2` } })
	}), env, fakeCtx);
	assert('/unban /job 第 2 页只查询 10 人', callsOf('getChatMember').length === 10);
	assert('/unban /job 姓名查询只使用任务来源群', callsOf('getChatMember').every((call) => String(call.body.chat_id) === '-1001'));
	const jobText = callsOf('sendMessage').map((call) => call.body.text).join('\n');
	assert('/unban /job 第 2 页显示可点击姓名和后 10 人', jobText.includes('第 2/2 页') && jobText.includes('解封用户') && jobText.includes(ids[19]));

	resetCalls();
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 3 } }),
	});
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 855, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/jobrun ${job.id}` } })
	}), env, fakeCtx);
	assert('/unban /jobrun 不查询姓名', callsOf('getChatMember').length === 0);
	assert('/unban /jobrun 不重复执行群解封', callsOf('unbanChatMember').length === 0);
}

// ---------- [11j] Queue 重复投递原子租约 ----------
console.log('\n[11j] Queue 重复投递原子租约');
{
	resetCalls();
	const fakeCtx = { waitUntil: () => {} };
	const ids = Array.from({ length: 20 }, (_, i) => String(55000 + i));
	const env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: '-1001',
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 856, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/ban ${ids.join(',')}` } })
	}), env, fakeCtx);
	const queuedJob = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('重复投递测试先创建未执行任务', queuedJob.status === 'queued' && queuedJob.cursor === 0);
	queuedJob.concurrency = 99;
	env.DB._jobs.get(queuedJob.id).payload = JSON.stringify(queuedJob);

	resetCalls();
	let activeMutations = 0;
	let maxMutationConcurrency = 0;
	sandbox.fetch = makeFetchMock({
		banChatMember: async () => {
			activeMutations += 1;
			maxMutationConcurrency = Math.max(maxMutationConcurrency, activeMutations);
			await new Promise((resolve) => setTimeout(resolve, 2));
			activeMutations -= 1;
			return { ok: true, result: true };
		},
		sendMessage: () => ({ ok: true, result: { message_id: 2 } }),
	});
	const queueBody = { type: 'bulk_job_run', id: queuedJob.id };
	await Promise.all([
		handler.queue({ messages: [{ body: queueBody }] }, env, fakeCtx),
		handler.queue({ messages: [{ body: queueBody }] }, env, fakeCtx),
	]);
	const finalJob = JSON.parse(env.DB._jobs.get(queuedJob.id).payload);
	assert('重复 Queue 投递只获得一次租约', finalJob.status === 'done' && finalJob.autoRunCount === 1);
	assert('重复 Queue 投递不重复封禁', callsOf('banChatMember').length === 20);
	assert('重复 Queue 投递不重复 D1 mutation', env.DB._mutationCalls.length === 1);
	assert('持久化 concurrency=99 仍被硬限制到 3', maxMutationConcurrency > 1 && maxMutationConcurrency <= 3);
}

// ---------- [11j1] Queue 过期租约的旧执行器不能覆盖新执行器 ----------
console.log('\n[11j1] Queue 租约 fencing');
{
	resetCalls();
	const fakeCtx = { waitUntil: () => {} };
	const ids = Array.from({ length: 20 }, (_, i) => String(55200 + i));
	const env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: '-1001',
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 8561, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/ban ${ids.join(',')}` } })
	}), env, fakeCtx);
	const queuedJob = JSON.parse([...env.DB._jobs.values()][0].payload);

	const fixedNow = Date.now() + 10000;
	vm.runInContext('globalThis.__realDateNow = Date.now; Date.now = () => ' + fixedNow + ';', sandbox);
	try {
		const oldExecutor = await sandbox.loadBulkJob(env, queuedJob.id);
		const oldLease = await sandbox.acquireBulkJobLease(env, oldExecutor, 'old-executor');
		assert('旧执行器先取得租约', oldLease?.leaseOwner === 'old-executor');

		const row = env.DB._jobs.get(queuedJob.id);
		row.updated_at = new Date(fixedNow - 46000).toISOString();
		const newExecutor = await sandbox.loadBulkJob(env, queuedJob.id);
		const newLease = await sandbox.acquireBulkJobLease(env, newExecutor, 'new-executor');
		assert('租约过期后新执行器可以接管', newLease?.leaseOwner === 'new-executor');

		newLease.cursor = 7;
		await sandbox.saveBulkJob(env, newLease);
		oldLease.cursor = 19;
		let staleSaveError = null;
		try {
			await sandbox.saveBulkJob(env, oldLease);
		} catch (error) {
			staleSaveError = error;
		}
		const stored = JSON.parse(env.DB._jobs.get(queuedJob.id).payload);
		assert('旧执行器保存被 fencing 拒绝', staleSaveError?.code === 'BULK_JOB_LEASE_LOST');
		assert('旧执行器不能覆盖新执行器进度', stored.cursor === 7 && stored.leaseOwner === 'new-executor');
	} finally {
		vm.runInContext('Date.now = globalThis.__realDateNow; delete globalThis.__realDateNow;', sandbox);
	}
}

// ---------- [11j1a] Queue 恢复时只操作当前 GROUP_IDS ----------
console.log('\n[11j1a] Queue 当前 GROUP_IDS 过滤');
{
	resetCalls();
	const fakeCtx = { waitUntil: () => {} };
	const ids = Array.from({ length: 20 }, (_, i) => String(55300 + i));
	const env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: '-1001,-1002',
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	sandbox.fetch = makeFetchMock({
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 8562, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/ban ${ids.join(',')}` } })
	}), env, fakeCtx);
	const queuedJob = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('任务保存创建时的两个配置群快照', queuedJob.groupIds.length === 2);

	await handler.queue({ messages: [{ body: { type: 'bulk_job_run', id: queuedJob.id } }] }, env, fakeCtx);
	let partialJob = JSON.parse(env.DB._jobs.get(queuedJob.id).payload);
	assert('首轮 24 个操作后保留 activeBatch', partialJob.status === 'queued' && partialJob.activeBatch?.operationCursor === 24);
	assert('首轮仍可操作当时配置的两个群', new Set(callsOf('banChatMember').map((call) => String(call.body.chat_id))).size === 2);

	env.GROUP_ID = '-1001';
	resetCalls();
	await handler.queue({ messages: [{ body: { type: 'bulk_job_run', id: queuedJob.id } }] }, env, fakeCtx);
	partialJob = JSON.parse(env.DB._jobs.get(queuedJob.id).payload);
	assert('删减 GROUP_ID 后旧任务仍能完成', partialJob.status === 'done' && partialJob.cursor === 20);
	assert('恢复旧 activeBatch 只操作当前 GROUP_ID', callsOf('banChatMember').length === 8 && callsOf('banChatMember').every((call) => String(call.body.chat_id) === '-1001'));
	assert('配置变化不会重复执行 D1 mutation', env.DB._mutationCalls.length === 1);
}

// ---------- [11j1b] Queue send 失败不能覆盖新执行器 ----------
console.log('\n[11j1b] Queue send 失败 fencing');
{
	resetCalls();
	const fakeCtx = { waitUntil: () => {} };
	const ids = Array.from({ length: 20 }, (_, i) => String(55400 + i));
	const env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: '-1001',
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 8563, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/ban ${ids.join(',')}` } })
	}), env, fakeCtx);
	const queuedJob = JSON.parse([...env.DB._jobs.values()][0].payload);
	let oldExecutor = await sandbox.loadBulkJob(env, queuedJob.id);
	oldExecutor = await sandbox.acquireBulkJobLease(env, oldExecutor, 'old-scheduler');
	oldExecutor.status = 'queued';
	oldExecutor.autoContinue = true;
	sandbox.clearBulkJobLease(oldExecutor);
	await sandbox.saveBulkJob(env, oldExecutor);

	let sendAttempts = 0;
	env.BULK_QUEUE = {
		async send() {
			sendAttempts += 1;
			if (sendAttempts === 3) {
				let newExecutor = await sandbox.loadBulkJob(env, queuedJob.id);
				newExecutor = await sandbox.acquireBulkJobLease(env, newExecutor, 'new-executor');
				newExecutor.cursor = 9;
				await sandbox.saveBulkJob(env, newExecutor);
			}
			throw new Error('forced queue send failure');
		}
	};
	const realSetTimeout = sandbox.setTimeout;
	sandbox.setTimeout = (fn) => { fn(); return 0; };
	try {
		await sandbox.scheduleBulkJobAutoContinue(oldExecutor, null, '', env);
	} finally {
		sandbox.setTimeout = realSetTimeout;
	}
	const stored = JSON.parse(env.DB._jobs.get(queuedJob.id).payload);
	assert(`Queue send 按策略最多尝试三次（实际 ${sendAttempts}）`, sendAttempts === 3);
	assert(`旧调度器失败标记不能覆盖新执行器（${stored.status}/${stored.cursor}/${stored.leaseOwner}）`, stored.status === 'running' && stored.cursor === 9 && stored.leaseOwner === 'new-executor');
	assert('被接管任务不会写入伪失败记录', stored.failures.length === 0);
}

// ---------- [11j2] Queue D1 瞬时失败不推进游标 ----------
console.log('\n[11j2] Queue D1 失败恢复');
{
	resetCalls();
	const pending = [];
	const fakeCtx = { waitUntil: (promise) => { pending.push(Promise.resolve(promise)); } };
	const ids = Array.from({ length: 20 }, (_, i) => String(55500 + i));
	let env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: '-1001',
		OWNER_IDS: '999',
		DB: makeFakeDB([], { failMutationCalls: [1, 2] })
	};
	sandbox.fetch = makeFetchMock({
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	env.BULK_QUEUE = makeFakeBulkQueue(() => env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 859, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/ban ${ids.join(',')}` } })
	}), env, fakeCtx);
	await drainPending(pending);
	let job = JSON.parse([...env.DB._jobs.values()][0].payload);
	assert('Queue D1 连续失败后任务标记 failed', job.status === 'failed');
	assert('Queue D1 连续失败不推进用户游标', job.cursor === 0 && !job.activeBatch);
	assert('Queue D1 失败不执行 Telegram 群操作', callsOf('banChatMember').length === 0);
	assert('Queue D1 失败自动尝试两次 mutation', env.DB._mutationCalls.length === 2);

	resetCalls();
	sandbox.fetch = makeFetchMock({
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 2 } }),
	});
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 860, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/jobrun ${job.id}` } })
	}), env, fakeCtx);
	await drainPending(pending);
	job = JSON.parse(env.DB._jobs.get(job.id).payload);
	assert('/jobrun 可从 D1 失败状态恢复并完成', job.status === 'done' && job.cursor === 20);
	assert('恢复后只执行一次成功 D1 mutation', env.DB._mutationCalls.length === 3);
	assert('恢复后完成 20 次群封禁', callsOf('banChatMember').length === 20);
}

// ---------- [11k] 429 / 网络错误 / 5xx 重试边界 ----------
console.log('\n[11k] Telegram 瞬态错误重试');
{
	for (const scenario of ['429', 'network', '5xx']) {
		resetCalls();
		let first = true;
		sandbox.fetch = makeFetchMock({
			getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: Number(body.user_id), first_name: '重试用户' } } }),
			getChat: (body) => ({ ok: true, result: { id: Number(body.chat_id), title: '重试群', type: 'supergroup' } }),
			banChatMember: () => {
				if (first) {
					first = false;
					if (scenario === 'network') throw new Error('temporary network failure');
					if (scenario === '5xx') return { ok: false, error_code: 500, description: 'Internal Server Error' };
					return { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 1 } };
				}
				return { ok: true, result: true };
			},
			sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		});
		const env = {
			TOKEN,
			BOT_TOKEN: '0:fake',
			GROUP_ID: '-1001',
			OWNER_IDS: '999',
			DB: makeFakeDB([])
		};
		await handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify({ message: { message_id: 857, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: `/ban ${scenario === '429' ? '56001' : '56002'}` } })
		}), env);
		assert(`/ban ${scenario} 仅延迟重试一次并成功`, callsOf('banChatMember').length === 2);
	}
}
{
	resetCalls();
	let first = true;
	sandbox.fetch = makeFetchMock({
		getChatMember: (body) => ({ ok: true, result: { status: 'left', user: { id: Number(body.user_id), first_name: '解封重试用户' } } }),
		getChat: (body) => ({ ok: true, result: { id: Number(body.chat_id), title: '解封重试群', type: 'supergroup' } }),
		unbanChatMember: () => {
			if (first) {
				first = false;
				throw new Error('temporary network failure');
			}
			return { ok: true, result: true };
		},
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: '-1001',
		OWNER_IDS: '999',
		DB: makeFakeDB([])
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 858, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/unban 56003' } })
	}), env);
	assert('/unban 网络错误仅延迟重试一次并成功', callsOf('unbanChatMember').length === 2 && env.DB._rows.size === 0);
	assert('/unban 重试请求始终携带 only_if_banned', callsOf('unbanChatMember').every((call) => call.body.only_if_banned === true));
}

// ---------- [12] 群内 /unban 单条 ----------
console.log('\n[12] 群内 /unban 单条');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }, { user: { id: 888 }, status: 'creator' }] }),
		getChatMember: (b) => String(b.chat_id) === '-1002'
			? { ok: true, result: { status: 'member', user: { id: Number(b.user_id), first_name: '群内解封用户', username: 'unban8888' } } }
			: { ok: false, error_code: 400, description: 'Bad Request: user not found' },
		unbanChatMember: (b) => b.only_if_banned === true
			? ({ ok: true, result: true })
			: ({ ok: false, error_code: 400, description: 'unsafe unban request' }),
		sendMessage: () => ({ ok: true, result: { message_id: 666 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});

	const update = {
		message: {
			message_id: 900,
			chat: { id: -1002, type: 'supergroup' },
			from: { id: 999, is_bot: false },
			text: '/unban@TestBot 8888',
		},
	};
	const env = {
		...baseEnv,
		DB: makeFakeDB([]),
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('群内 /unban 不修改 D1 黑名单', !blacklist.some((e) => e.id === '8888') && env.DB._mutationCalls.length === 0);

	// /unban 不调 banChatMember，但会对 GROUP_ID 配置群执行 unbanChatMember
	assert('banChatMember 没调用', callsOf('banChatMember').length === 0);
	const unbanCalls = callsOf('unbanChatMember');
	assert('/unban 调用 unbanChatMember 2 次（两个群）', unbanCalls.length === 2);
	assert('/unban 解封用户 ID 都是 8888', unbanCalls.every((c) => String(c.body.user_id) === '8888'));
	assert('/unban 解封覆盖两个配置群', JSON.stringify(unbanCalls.map((c) => String(c.body.chat_id)).sort()) === JSON.stringify(['-1001', '-1002']));
	assert('/unban 当前仍在群内的成员使用 only_if_banned 安全解封', unbanCalls.every((c) => c.body.only_if_banned === true));
	assertExactProfileQueries('群内单用户 /unban 只查询命令来源群一次', ['8888'], '-1002');

	const sendCalls = callsOf('sendMessage');
	assert('sendMessage 调用 2 次（闪屏+私聊）', sendCalls.length === 2);
	const groupSend = sendCalls.find((c) => String(c.body.chat_id) === '-1002');
	assert('群内闪屏说明 D1 检查通过并尝试解封', groupSend.body.text.includes('D1 检查通过') && groupSend.body.text.includes('已尝试群解封'));
	const dmSend = sendCalls.find((c) => String(c.body.chat_id) === '999');
	assert('/unban 私聊详情含 Telegram 群解封结果', dmSend.body.text.includes('Telegram 群解封结果'));
	assert('群内单用户 /unban 私聊详情显示来源群姓名', dmSend.body.text.includes('<a href="tg://user?id=8888">群内解封用户</a>'));
	assert('群内 /unban 指令消息 msgId=900 被删除', callsOf('deleteMessage').some((c) => c.body.message_id === 900));
}

// ---------- [12a] 私聊 /unban 单条 + 部分群解封失败 ----------
console.log('\n[12a] 私聊 /unban 单条 + 部分群解封失败');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'administrator' }] }),
		getChatMember: (b) => String(b.chat_id) === '-1002'
			? { ok: true, result: { status: 'left', user: { id: Number(b.user_id), first_name: '不应读取的副群资料' } } }
			: { ok: false, error_code: 400, description: 'Bad Request: user not found' },
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
		DB: makeFakeDB([]),
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('私聊 /unban 不修改 D1 黑名单', !blacklist.some((e) => e.id === '8890') && env.DB._mutationCalls.length === 0);
	const unbanCalls = callsOf('unbanChatMember');
	assert('私聊 /unban 对两个配置群执行解封', unbanCalls.length === 2);
	assert('私聊 /unban 全部请求带 only_if_banned', unbanCalls.every((c) => c.body.only_if_banned === true));
	assertExactProfileQueries('私聊单用户 /unban 只查询首个 GROUP_ID 一次', ['8890'], '-1001');
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('私聊单用户 /unban 不读取后续群资料', !dmSend.body.text.includes('不应读取的副群资料'));
	assert('私聊 /unban 详情显示部分群解封', !!dmSend && dmSend.body.text.includes('已解除 1/2 个配置群'));
	assert('私聊 /unban 管理员目标失败显示解封语境', dmSend.body.text.includes('副群') && dmSend.body.text.includes('目标用户是群管理员'));
	assert('私聊 /unban 管理员目标失败不再提示再踢', !dmSend.body.text.includes('再踢'));
	assert('私聊 /unban 管理员目标失败建议手动检查', dmSend.body.text.includes('无需通过 bot 解封') && dmSend.body.text.includes('手动检查'));
}

// ---------- [12a1] 群内 /unban 特殊 TGID: D1 检查通过但 Telegram 无法识别 ----------
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
		DB: makeFakeDB([]),
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('特殊 TGID /unban:D1 保持不变', !blacklist.some((e) => e.id === '7070447913') && env.DB._mutationCalls.length === 0);
	assert('特殊 TGID /unban:仍对配置群执行 Telegram 解封', callsOf('unbanChatMember').length === 2);
	assert('特殊 TGID /unban:失败请求仍携带 only_if_banned', callsOf('unbanChatMember').every((c) => c.body.only_if_banned === true));
	const groupFlash = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '-1001');
	const dmSend = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('特殊 TGID /unban:群内短提示说明 Telegram 暂无法识别', !!groupFlash && groupFlash.body.text.includes('D1检查通过') && groupFlash.body.text.includes('Telegram暂无法识别TGID'));
	assert('特殊 TGID /unban:群内短提示不误报 bot 管理员权限', !!groupFlash && !groupFlash.body.text.includes('请检查 bot 是否为群管理员'));
	assert('特殊 TGID /unban:私聊详情说明 Telegram 当前无法识别', !!dmSend && dmSend.body.text.includes('Telegram 当前无法识别该 TGID'));
	assert('特殊 TGID /unban:私聊详情不误报 TGID 格式错误', !!dmSend && !dmSend.body.text.includes('TGID 格式错误'));
	assert('特殊 TGID /unban:私聊详情说明 D1 资格检查不受影响', !!dmSend && dmSend.body.text.includes('D1 黑名单资格检查结果不受影响'));
	assert('特殊 TGID /unban:删除群内命令', callsOf('deleteMessage').some((c) => c.body.message_id === 915));
}

// ---------- [12a1b] 单条 /unban 命中 D1 黑名单必须拒绝 ----------
console.log('\n[12a1b] 单条 /unban 命中 D1 拒绝');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatMember: (body) => ({
			ok: true,
			result: { status: 'kicked', user: { id: Number(body.user_id), first_name: 'D1黑名单用户' } }
		}),
		unbanChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env = {
		...baseEnv,
		DB: makeFakeDB([{ id: '7070447001', reason: 'manual', by: '999', at: '2026-07-01T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 916, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/unban 7070447001' } })
	}), env);
	assert('D1 命中 /unban 保留黑名单记录', env.DB._rows.has('7070447001'));
	assert('D1 命中 /unban 不执行任何 D1 mutation', env.DB._mutationCalls.length === 0);
	assert('D1 命中 /unban 不调用 Telegram 解封', callsOf('unbanChatMember').length === 0);
	const dmSend = callsOf('sendMessage').find((call) => String(call.body.chat_id) === '999');
	assert('D1 命中 /unban 明确返回拒绝原因', !!dmSend && dmSend.body.text.includes('仍在 D1 黑名单') && dmSend.body.text.includes('未调用 Telegram 解封接口'));
}

// ---------- [12a2] 匿名管理员仅有 /ban /spam，不允许 /unban ----------
console.log('\n[12a2] 匿名管理员 /unban 拒绝');
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
	assert('匿名 /unban 不移除 D1', blacklist.some((e) => e.id === '5973367305'));
	assert('匿名 /unban 不执行 Telegram 群解封', callsOf('unbanChatMember').length === 0);
	assert('匿名 /unban 不删除群内命令', callsOf('deleteMessage').length === 0);
	assert('匿名 /unban 群内静默拒绝', callsOf('sendMessage').length === 0);
}

// ---------- [12a3] 匿名管理员 /ban@bot: 不依赖真实 TGID ----------
console.log('\n[12a3] 匿名管理员 /ban@bot');
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
			text: '/ban@tc520lh_bot 8416738230',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const row = env.DB._rows.get('8416738230');
	assert('匿名 /ban@bot 写入 D1 黑名单', !!row && row.reason === 'manual');
	assert('匿名 /ban@bot 操作人记录匿名群身份', row?.by_user === 'anonymous_admin:-1001', row?.by_user);
	assert('匿名 /ban@bot 执行全群踢出', callsOf('banChatMember').length === 2);
	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	const groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	assert('匿名 /ban@bot 群内零机器人回执', groupSends.length === 0);
	assert('匿名 /ban@bot 主人收到匿名管理员审计', !!ownerDm && ownerDm.body.text.includes('匿名管理员'));
}

// ---------- [12a4] 匿名管理员 /spam@bot TGID ----------
console.log('\n[12a4] 匿名管理员 /spam@bot TGID');
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
			text: '/spam@tc520lh_bot 8416738230 广告',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const row = env.DB._rows.get('8416738230');
	assert('匿名 /spam@bot 写入 D1 黑名单', !!row && row.reason === 'spam');
	assert('匿名 /spam@bot 操作人记录匿名群身份', row?.by_user === 'anonymous_admin:-1001', row?.by_user);
	assert('匿名 /spam@bot 执行全群踢出', callsOf('banChatMember').length === 2);
	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	const groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	assert('匿名 /spam@bot 群内零机器人回执', groupSends.length === 0);
	assert('匿名 /spam@bot 主人收到匿名管理员审计', !!ownerDm && ownerDm.body.text.includes('匿名管理员'));
}

// ---------- [12a5] 匿名管理员回复消息 /spam ----------
console.log('\n[12a5] 匿名管理员回复 /spam');
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
			text: '/spam 广告',
			reply_to_message: {
				message_id: 5000,
				from: { id: 771234, is_bot: false, first_name: '广告号' },
			},
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const row = env.DB._rows.get('771234');
	assert('匿名回复 /spam 写入被回复用户', !!row && row.reason === 'spam');
	assert('匿名回复 /spam 操作人记录匿名群身份', row?.by_user === 'anonymous_admin:-1001', row?.by_user);
	assert('匿名回复 /spam 删除被回复消息', callsOf('deleteMessage').some((c) => c.body.message_id === 5000));
	assert('匿名回复 /spam 执行全群踢出', callsOf('banChatMember').length === 2);
	const groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	assert('匿名回复 /spam 群内零机器人回执', groupSends.length === 0);
}

// ---------- [12a5b] /spam 回复 sender_chat 不当 TGID 加黑 ----------
console.log('\n[12a5b] /spam 回复 sender_chat 不加黑');
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
			message_id: 9231,
			chat: { id: -1001, type: 'supergroup', title: '杀神专用黑名' },
			from: { id: 999, is_bot: false, first_name: '主人' },
			text: '/spam',
			reply_to_message: {
				message_id: 5010,
				sender_chat: { id: -100999, type: 'channel', title: '频道身份' },
			},
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	assert('/spam 回复 sender_chat 不写负数 ID', !env.DB._rows.has('-100999'));
	assert('/spam 回复 sender_chat 不触发踢人', callsOf('banChatMember').length === 0);
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
			text: '/ban 999001',
		},
	};
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	assert('非 GROUP_ID 匿名 /ban 不写 D1', !env.DB._rows.has('999001'));
	assert('非 GROUP_ID 匿名 /ban 不踢人', callsOf('banChatMember').length === 0);
	assert('非 GROUP_ID 匿名 /ban 群内静默', callsOf('sendMessage').length === 0);
}

// ---------- [12a7] 非 GROUP_ID 实名管理员 /ban /spam 不生效 ----------
console.log('\n[12a7] 非 GROUP_ID 实名管理员 /ban /spam 不生效');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 925, chat: { id: -2001, type: 'supergroup', title: '未配置群' }, from: { id: 999, is_bot: false }, text: '/ban 999002' } }) }), env, fakeCtx);
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 926, chat: { id: -2001, type: 'supergroup', title: '未配置群' }, from: { id: 999, is_bot: false }, text: '/spam 999003 广告' } }) }), env, fakeCtx);

	assert('非 GROUP_ID 实名管理员 /ban 不写 D1', !env.DB._rows.has('999002'));
	assert('非 GROUP_ID 实名管理员 /spam 不写 D1', !env.DB._rows.has('999003'));
	assert('非 GROUP_ID 实名管理员 /ban /spam 不踢人', callsOf('banChatMember').length === 0);
	assert('非 GROUP_ID 实名管理员 /ban /spam 不回显', callsOf('sendMessage').length === 0);
	assert('非 GROUP_ID 实名管理员 /ban /spam 不删命令', callsOf('deleteMessage').length === 0);
	assert('非 GROUP_ID 实名管理员 /ban /spam 不查管理员', callsOf('getChatAdministrators').length === 0);
}
// ---------- [12a8] 非 GROUP_ID 群除只读 /check 外的指令完全无效化 ----------
console.log('\n[12a8] 非 GROUP_ID 群除只读 /check 外的指令完全无效化');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: () => ({ ok: true, result: { id: -1001, title: '主群', type: 'supergroup' } }),
		getChatMember: () => ({ ok: true, result: { status: 'member', user: { id: 999004 } } }),
		banChatMember: () => ({ ok: true, result: true }),
		unbanChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([{ id: '999004', reason: 'manual', by: '999', at: '2026-07-08T00:00:00.000Z' }]);
	db._store.set('ad_keywords_custom', JSON.stringify({ general: ['原词'], fraud: [], finance: [], porn: [], spam: [], whitelist: [] }));
	db._store.set('ad_samples', JSON.stringify({ fingerprints: ['原样本'], count: 1 }));
	const env = { ...baseEnv, SUPER_ADMINS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const beforeKeywords = db._store.get('ad_keywords_custom');
	const beforeSamples = db._store.get('ad_samples');
	const commands = [
		'/job test-job',
		'/jobrun test-job',
		'/start',
		'/start check_993005028',
		'/blacklist',
		'/help@SomeBot',
		'/admins',
		'/groups',
		'/leavegroup -1001',
		'/addword fraud 测试词',
		'/delword fraud 原词',
		'/listwords',
		'/importdefault',
		'/listsamples',
		'/delsample 1',
		'/clearsamples',
		'/learn 993005028 广告样本',
		'/learnlast',
		'/recent',
		'/unban 999004',
		'/unban',
		'/ban 999005',
		'/spam 999006 广告',
		'我不是广告狗，我是误封的，希望可以解封。',
	];
	for (let i = 0; i < commands.length; i++) {
		await handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify({ message: { message_id: 930 + i, chat: { id: -2001, type: 'supergroup', title: '未配置群' }, from: { id: 999, is_bot: false }, text: commands[i] } })
		}), env, fakeCtx);
	}
	assert('非 GROUP_ID 群除 /check 外的指令无 Telegram API 调用', apiCalls.length === 0, apiCalls.map((c) => c.method).join(','));
	assert('非 GROUP_ID 群 /unban 不移除 D1', db._rows.has('999004'));
	assert('非 GROUP_ID 群 /ban /spam 不写 D1', !db._rows.has('999005') && !db._rows.has('999006'));
	assert('非 GROUP_ID 群词库/样本命令不改库', db._store.get('ad_keywords_custom') === beforeKeywords && db._store.get('ad_samples') === beforeSamples);
	assert('非 GROUP_ID 群 /job /jobrun 不创建任务', db._jobs.size === 0);
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

// ---------- [12d] /blacklist 展示兼容历史 sa reason ----------
console.log('\n[12d] /blacklist 展示兼容历史 sa reason');
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
	assert('/blacklist manual 显示为 /ban 来源', dm.body.text.includes('管理员 /ban 指令加黑'));
	assert('/blacklist sa/spam 都显示为 /spam 来源', (dm.body.text.match(/群内 \/spam 举报/g) || []).length >= 2);
	assert('/blacklist 不裸露内部 reason 值', !dm.body.text.includes('原因：spam') && !dm.body.text.includes('原因：sa'));
}

// ---------- [12d2] 超级管理员群内 /blacklist 静默，私聊行为不变 ----------
console.log('\n[12d2] 超级管理员 /blacklist 群聊静默 + 私聊不变');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const env = {
		TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', SUPER_ADMINS: '7777',
		DB: makeFakeDB([
			{ id: '8801', reason: 'manual', by: '999', at: '2026-07-21T01:00:00Z' },
			{ id: '8802', reason: 'sa', by: '7777', at: '2026-07-21T01:01:00Z' },
		]),
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1204, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '超级管理员' }, text: '/blacklist' } }),
	}), env, fakeCtx);
	const groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	const triggerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('超级管理员群内 /blacklist 零机器人回执', groupSends.length === 0);
	assert('超级管理员群内 /blacklist 完整名单发给主人', !!ownerDm && ownerDm.body.text.includes('8801') && ownerDm.body.text.includes('8802'));
	assert('超级管理员群内 /blacklist 不私聊发令者', !triggerDm);
	assert('超级管理员群内 /blacklist 删除命令消息', callsOf('deleteMessage').some((c) => c.body.message_id === 1204));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1205, chat: { id: 7777, type: 'private' }, from: { id: 7777, is_bot: false, first_name: '超级管理员' }, text: '/blacklist' } }),
	}), env, fakeCtx);
	const privateResult = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('超级管理员私聊 /blacklist 仍直接收到完整名单', !!privateResult && privateResult.body.text.includes('8801') && privateResult.body.text.includes('8802'));
	assert('超级管理员私聊 /blacklist 不触发群闪屏或删消息', callsOf('sendMessage').every((c) => Number(c.body.chat_id) > 0) && callsOf('deleteMessage').length === 0);
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
	const env = { ...baseEnv, DB: makeFakeDB([]) };
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
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('未加黑（无权）', blacklist.length === 0);
	assert('banChatMember 未调用', callsOf('banChatMember').length === 0);
	assert('sendMessage 未调用（群内静默）', callsOf('sendMessage').length === 0);
	assert('非管理员 /ban 指令消息不删除', callsOf('deleteMessage').length === 0);
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
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	assert('尝试私聊主人', dmAttempts === 1);
	const groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	// 新行为:私聊失败时,群里只发"闪屏成功提示",不再追加"私聊机器人"二次提示
	assert('群里仅发 1 次（仅闪屏,不追加二次提示）', groupSends.length === 1, `实际 ${groupSends.length}`);
	assert('闪屏文本含"已加黑"', groupSends[0].body.text.includes('已加黑'));
}

// ---------- [16] 普通管理员必须是当前发令群管理员；成功后仍全群封禁 ----------
console.log('\n[16] 普通管理员当前群鉴权 + 全局封禁');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => {
			if (String(b.chat_id) === '-1001') return { ok: true, result: [{ user: { id: 1 }, status: 'creator' }] };
			if (String(b.chat_id) === '-1002') return { ok: true, result: [{ user: { id: 6666 }, status: 'administrator' }] };
		},
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const env = { ...baseEnv, DB: makeFakeDB([]) };

	await handler.fetch(new Request(`https://x.com/`, {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 6666, is_bot: false }, text: '/ban 555' } }),
	}), env, fakeCtx);
	let blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('A 群不是管理员 → /ban 不写 D1', blacklist.length === 0);
	assert('A 群不是管理员 → 不执行全群封禁', callsOf('banChatMember').length === 0);
	let adminCalls = callsOf('getChatAdministrators');
	assert('A 群鉴权只查询当前群，不遍历 B 群借权', adminCalls.length === 1 && String(adminCalls[0].body.chat_id) === '-1001');

	resetCalls();
	await handler.fetch(new Request(`https://x.com/`, {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 2, chat: { id: -1002, type: 'supergroup' }, from: { id: 6666, is_bot: false, first_name: 'B群管理员' }, text: '/ban 555' } }),
	}), env, fakeCtx);
	blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('B 群是管理员 → /ban 写入 D1 全局黑名单', blacklist.length === 1 && blacklist[0].id === '555');
	assert('B 群授权成功后仍遍历全部 GROUP_IDS 封禁', callsOf('banChatMember').length === 2);
	adminCalls = callsOf('getChatAdministrators');
	assert('B 群鉴权只查询当前 B 群', adminCalls.length === 1 && String(adminCalls[0].body.chat_id) === '-1002');
	const groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1002');
	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('普通管理员群内 /ban 零机器人回执', groupSends.length === 0);
	assert('普通管理员群内 /ban 完整结果只发给主人', !!ownerDm && ownerDm.body.text.includes('Telegram 群封禁/预封成功'));
	assert('普通管理员群内 /ban 仍删除命令消息', callsOf('deleteMessage').some((c) => c.body.message_id === 2));
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
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('普通用户 → /ban 不触发,黑名单为空', blacklist.length === 0);
	assert('未调 banChatMember', callsOf('banChatMember').length === 0);
	assert('群内静默,无 sendMessage', callsOf('sendMessage').length === 0);
}

// ---------- [18] 当前群鉴权失败时不得继续遍历其它群借权 ----------
console.log('\n[18] 当前群查询失败即拒绝，不跨群借权');
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
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('当前群查询失败 → /ban 不写 D1', blacklist.length === 0);
	assert('当前群查询失败 → 不执行全群封禁', callsOf('banChatMember').length === 0);
	const adminCalls = callsOf('getChatAdministrators');
	assert('当前群查询失败 → 不继续查询其它 GROUP_ID', adminCalls.length === 1 && String(adminCalls[0].body.chat_id) === '-1001');
	assert('当前群查询失败 → 群内静默', callsOf('sendMessage').length === 0);
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
	const env = { ...baseEnv, SUPER_ADMINS: '11111', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	const blacklist = JSON.parse(env.DB._store.get('blacklist') || '[]');
	assert('SUPER_ADMINS 即使不在群里也能用 /ban', blacklist.length === 1 && blacklist[0].id === '555');
	// 不应该调 getChatAdministrators(super 短路返回 true)
	assert('SUPER_ADMINS 路径短路:不查群 admin 列表', callsOf('getChatAdministrators').length === 0);
}

// ---------- [19a] 普通 Telegram 管理员不能私聊执行 /ban /spam ----------
console.log('\n[19a] 普通管理员私聊 /ban /spam 拒绝');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 6666 }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	for (const [messageId, text] of [[1, '/ban 601'], [2, '/spam 602 广告']]) {
		await handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify({ message: { message_id: messageId, chat: { id: 6666, type: 'private' }, from: { id: 6666, is_bot: false }, text } }),
		}), env, fakeCtx);
	}
	assert('普通管理员私聊 /ban /spam 不写 D1', !env.DB._rows.has('601') && !env.DB._rows.has('602'));
	assert('普通管理员私聊 /ban /spam 不执行全群封禁', callsOf('banChatMember').length === 0);
	assert('普通管理员私聊不遍历 GROUP_IDS 借权', callsOf('getChatAdministrators').length === 0);
	const replies = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '6666');
	assert('普通管理员私聊 /ban /spam 均收到权限不足', replies.length === 2 && replies.every((c) => c.body.text.includes('权限不足')));
}

// ---------- [19b] 普通管理员除 /ban /spam 外无其它管理命令权限 ----------
console.log('\n[19b] 普通管理员其它管理命令拒绝');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 6666 }, status: 'administrator' }] }),
		unbanChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const env = { ...baseEnv, DB: makeFakeDB([{ id: '700', reason: 'manual', by: '999', at: '2026-07-21T00:00:00Z' }]) };
	const commands = ['/unban 700', '/check 700', '/blacklist', '/job missing'];
	for (let i = 0; i < commands.length; i += 1) {
		await handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify({ message: { message_id: 10 + i, chat: { id: -1001, type: 'supergroup' }, from: { id: 6666, is_bot: false, first_name: '普通管理员' }, text: commands[i] } }),
		}), env, fakeCtx);
	}
	assert('普通管理员群内其它管理命令不移除 D1', env.DB._rows.has('700'));
	assert('普通管理员群内其它管理命令不执行解封', callsOf('unbanChatMember').length === 0);
	assert('普通管理员群内其它管理命令不查询管理员列表', callsOf('getChatAdministrators').length === 0);
	assert('普通管理员群内其它管理命令完全静默', callsOf('sendMessage').length === 0 && callsOf('deleteMessage').length === 0);

	resetCalls();
	for (let i = 0; i < commands.length; i += 1) {
		await handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify({ message: { message_id: 20 + i, chat: { id: 6666, type: 'private' }, from: { id: 6666, is_bot: false }, text: commands[i] } }),
		}), env, fakeCtx);
	}
	const privateReplies = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '6666');
	assert('普通管理员私聊其它管理命令均收到权限不足', privateReplies.length === commands.length && privateReplies.every((c) => c.body.text.includes('权限不足')));
	assert('普通管理员私聊其它管理命令不借用任何群权限', callsOf('getChatAdministrators').length === 0);
	assert('普通管理员私聊其它管理命令不改变 D1', env.DB._rows.has('700'));
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
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: '/ban 555' },
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
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false, first_name: '主人' }, text: '/ban 555' },
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
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '台风' }, text: '/ban 555' },
	};
	// OWNER_IDS = 999(主人) ≠ 触发者 7777
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	const triggerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	const groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	assert('群管理员 /ban 群内零机器人回执', groupSends.length === 0);
	assert('主人 999 收到审计通知', !!ownerDm);
	assert('触发者 7777 完全不收私信', !triggerDm);
	assert('审计含"群管理员操作通知"标题', ownerDm.body.text.includes('群管理员操作通知'));
	assert('审计含操作人名"台风"', ownerDm.body.text.includes('台风'));
	assert('审计含角色标签"群管理员"', ownerDm.body.text.includes('群管理员'));
assert('审计含"群内"来源标记', ownerDm.body.text.includes('群内'));
assert('审计含完整详情(群封禁结果)', ownerDm.body.text.includes('Telegram 群封禁/预封成功'));
}

// ---------- [22b] OWNER_IDS 通知范围:主人全量,副主人仅 /ban /spam 踢出通知 ----------
console.log('\n[22b] OWNER_IDS 通知范围:主人全量,副主人仅 /ban /spam');
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
		body: JSON.stringify({ message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '管理员' }, text: '/ban 555' } })
	}), env, fakeCtx);
	let ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	let deputyDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '1000');
	assert('/ban → 主人收到群封禁通知', !!ownerDm && ownerDm.body.text.includes('Telegram 群封禁/预封成功'));
	assert('/ban → 副主人收到群封禁通知', !!deputyDm && deputyDm.body.text.includes('Telegram 群封禁/预封成功'));
	assert('/ban → 群内零机器人回执', callsOf('sendMessage').every((c) => Number(c.body.chat_id) > 0));

	resetCalls();
	env = {
		TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,1000',
		SUPER_ADMINS: '7777',
		DB: makeFakeDB([]),
	};
	await handler.fetch(new Request(`https://x.com/`, {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 2, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '管理员' }, text: '/unban 555' } })
	}), env, fakeCtx);
	ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	deputyDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '1000');
	assert('超级管理员 /unban → 主人收到通知', !!ownerDm && ownerDm.body.text.includes('目标不在 D1 黑名单'));
	assert('/unban → 副主人不收到通知', !deputyDm);
	assert('超级管理员 /unban → 群内零机器人回执', callsOf('sendMessage').every((c) => Number(c.body.chat_id) > 0));
}

// ---------- [23] 一键代发链路已移除 ----------
console.log('\n[23] 一键代发链路已移除');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		answerCallbackQuery: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env = { ...baseEnv, SUPER_ADMINS: '8888,999', DB: makeFakeDB([]) };
	const legacyResult = await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({
			callback_query: {
				id: 'legacy-gky-action',
				from: { id: 999, is_bot: false, first_name: '主人' },
				message: { message_id: 100, chat: { id: -1001, type: 'supergroup' } },
				data: 'gky:a:55555:-1001',
			},
		}),
	}), env);
	assert('历史一键代发回调 → Worker 安全忽略并返回 200', legacyResult.status === 200);
	assert('历史一键代发回调 → 不向任何群发送 GKYbotSave', callsOf('sendMessage').length === 0);
	assert('历史一键代发回调 → 不再调用 answerCallbackQuery', callsOf('answerCallbackQuery').length === 0);

	resetCalls();
	sandbox.fetch = makeFetchMock({
		setWebhook: () => ({ ok: true, result: true }),
		setMyCommands: () => ({ ok: true, result: true }),
	});
	const initResult = await handler.fetch(new Request('https://x.com/' + TOKEN, { method: 'GET' }), env);
	const webhookCall = callsOf('setWebhook')[0];
	const commandCall = callsOf('setMyCommands')[0];
	const registeredCommands = commandCall?.body?.commands?.map((item) => item.command) || [];
	assert('Webhook 初始化 → 成功', initResult.status === 200 && !!webhookCall);
	assert('Webhook 初始化 → 订阅 message/chat_member/callback_query', JSON.stringify(webhookCall?.body?.allowed_updates) === JSON.stringify(['message', 'chat_member', 'callback_query']));
	assert('Webhook 初始化 → /ad 投票按钮回调已启用', webhookCall?.body?.allowed_updates?.includes('callback_query'));
	assert('BotFather 菜单统一注册 ban/spam', JSON.stringify(registeredCommands) === JSON.stringify(['unban', 'ban', 'spam', 'check', 'blacklist']));
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
	// OWNER_IDS = 999, 触发者 7777 ≠ 主人
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(cmUpdate) }), env);

	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人 999 收到 chat_member 审计', !!ownerDm);
	assert('审计含"群管理员操作通知"', ownerDm.body.text.includes('群管理员操作通知'));
	assert('审计含"群内手动 封禁"（不再加黑）', ownerDm.body.text.includes('群内手动 封禁'));
	assert('审计标注"未加入全局黑名单"', ownerDm.body.text.includes('未加入全局黑名单'));
	assert('真人群内手动封禁不写入 D1 黑名单（唯一来源=/ban /spam）', !env.DB._rows.has('5555'));
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
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '台风' }, text: '/ban 12345' },
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

// ---------- [25b] 作为管理员的机器人发 /ban → 不写入 D1 黑名单（仅真人可加黑）----------
console.log('\n[25b] 机器人管理员发 /ban:不加黑');
{
	resetCalls();
	const fakeCtx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
	sandbox.fetch = makeFetchMock({
		// 即便这个机器人是群管理员，发 /ban 也必须被真人防护拦在 checkIfUserIsAdmin 之前
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 5566001122, is_bot: true }, status: 'administrator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const update = {
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 5566001122, is_bot: true, first_name: 'nmBot' }, text: '/ban 99999 广告' },
	};
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	assert('机器人发 /ban 不写入 D1 黑名单', !env.DB._rows.has('99999'));
	assert('机器人发 /ban 不触发踢人', callsOf('banChatMember').length === 0);
}

// ---------- [25c] 作为管理员的机器人发 /spam → 不写入 D1 黑名单 ----------
console.log('\n[25c] 机器人管理员发 /spam:不加黑');
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
		message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 5566001122, is_bot: true, first_name: 'nmBot' }, text: '/spam 88888 广告' },
	};
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request(`https://x.com/`, { method: 'POST', body: JSON.stringify(update) }), env, fakeCtx);
	assert('机器人发 /spam 不写入 D1 黑名单', !env.DB._rows.has('88888'));
	assert('机器人发 /spam 不触发踢人', callsOf('banChatMember').length === 0);
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
function trustedSampleData(texts, source = 'test-confirmed') {
	const fingerprints = texts.map(normalizeFp);
	return {
		fingerprints,
		entries: fingerprints.map((fingerprint, index) => ({
			fingerprint,
			trusted: true,
			source,
			operatorId: '999',
			learnedAt: '2026-07-29T00:00:00.000Z',
			preview: String(texts[index] || ''),
		})),
		count: fingerprints.length,
	};
}

const AD_KW_SEED = {
	finance: ['usdt', 'u商', '承兑', '刷单', '日入', '出u', '接u', '搬砖', '套利', '包网', '价格拉满'],
	porn: ['约炮', '萝莉', '福利姬', '看片', '裸聊', '乱伦', '不雅视频', '色色', '免费看', '资源群'],
	spam: ['加我', '加微', '加v', '私聊', '进群', '拉你', '详情看', '添加好友', '发送信息'],
	fraud: ['假钞', '假币', '高仿', '办证', '代开发票', '黑客接单', '网赚', '菠菜', '交流群'],
	general: [],
	whitelist: [],
};
// 构造一个已预置广告词库的 fake D1
function makeAdD1(extra = {}, options = {}) {
	const db = makeFakeDB([], options);
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
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false, first_name: '主人' }, text: '/addword@TestBot fraud 杀猪盘 刷信誉' } };
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
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: [], porn: [], spam: [], fraud: ['杀猪盘', '刷信誉'], general: [], whitelist: [] }));
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
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: ['usdt'], porn: [], spam: [], fraud: ['杀猪盘'], general: [], whitelist: [] }));
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
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: ['usdt'], porn: [], spam: [], fraud: ['假钞'], general: [], whitelist: ['白词'] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/listwords' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/listwords 私聊回执', !!dm);
	assert('展示含 usdt', dm.body.text.includes('usdt'));
	assert('展示含假钞', dm.body.text.includes('假钞'));
	assert('展示含白名单词', dm.body.text.includes('白词'));
}

// ---------- [41b] 历史 sa 词库分类兼容到 spam ----------
console.log('\n[41b] 历史 sa 词库分类兼容到 spam');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: [], porn: [], sa: ['加我', '进群', '私聊'], fraud: [], general: [], whitelist: [] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88041, is_bot: false, first_name: '路人' }, text: '加我进群私聊' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	let bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('历史 sa 分类词仍参与引流检测', bl.some((e) => e.id === '88041'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: { message_id: 2, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/listwords' }
	}) }), env, fakeCtxAd);
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/listwords 把历史 sa 分类统一展示为 spam', !!dm && dm.body.text.includes('引流 spam') && dm.body.text.includes('加我') && !dm.body.text.includes('引流 sa'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: { message_id: 3, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/addword spam 私聊我' }
	}) }), env, fakeCtxAd);
	const stored = JSON.parse(db._store.get('ad_keywords_custom') || '{}');
	assert('/addword spam 写入 canonical spam 分类', Array.isArray(stored.spam) && stored.spam.includes('私聊我'));
	assert('/addword spam 保存时移除历史 sa 分类', !Object.prototype.hasOwnProperty.call(stored, 'sa'));

	const beforeLegacyCategory = db._store.get('ad_keywords_custom');
	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
		message: { message_id: 4, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/addword sa 不应写入' }
	}) }), env, fakeCtxAd);
	const categoryReply = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('/addword 历史分类不再写入', db._store.get('ad_keywords_custom') === beforeLegacyCategory);
	assert('/addword 历史分类提示改用 spam', !!categoryReply && categoryReply.body.text.includes('/addword spam'));
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
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: ['出u'], porn: [], spam: [], fraud: [], general: [], whitelist: [] }));
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
	db._store.set('ad_keywords_custom', JSON.stringify({ finance: ['出u'], porn: ['看片'], spam: [], fraud: ['假钞'], general: [], whitelist: [] }));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 一堆 emoji 但无任何广告词 → 不该被杀
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88045, is_bot: false, first_name: '开心' }, text: '今天好开心🔥💰❤️😍🎉🎊✨🥳' } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('纯 emoji → 不误杀', !bl.some((e) => e.id === '88045'));
	assert('纯 emoji → 不删消息', callsOf('deleteMessage').length === 0);
}

// ===== /spam 上报学习 → 精准查杀测试([46]-[55]) =====

// ---------- [46] 主人 /spam → 样本入库 ----------
console.log('\n[46] 主人 /spam 学习样本');
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
	// 主人在群里回复一条广告发 /spam
	const update = { message: {
		message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false, first_name: '主人' },
		text: '/spam',
		reply_to_message: { message_id: 50, from: { id: 88100, is_bot: false, first_name: '广告号' }, text: '专业承兑出u日入过万快来咨询' },
	} };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const samples = JSON.parse(db._store.get('ad_samples') || '{"fingerprints":[]}');
	assert('主人 /spam → 指纹入库', samples.fingerprints.length === 1);
	assert('指纹是归一化后的广告文本', samples.fingerprints[0].includes('专业承兑出u日入过万'));
	const kw = JSON.parse(db._store.get('ad_keywords_custom') || '{"general":[]}');
	assert('提取的关键词不再自动进 general（防污染）', !kw.general || kw.general.length === 0);
}

// ---------- [47] 普通管理员 /spam → 不学习 ----------
console.log('\n[47] 普通管理员 /spam 不学习');
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
		text: '/spam',
		reply_to_message: { message_id: 50, from: { id: 88101, is_bot: false }, text: '某广告内容' },
	} };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	const samples = db._store.get('ad_samples');
	assert('普通管理员 /spam → 不入库样本', !samples);
	const bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('普通管理员 /spam → 仍加黑(行为不变)', bl.some((e) => e.id === '88101'));
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
	db._store.set('ad_samples', JSON.stringify(trustedSampleData(['专业承兑出u日入过万快来咨询'])));
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
	db._store.set('ad_samples', JSON.stringify(trustedSampleData(['专业承兑出u日入过万'])));
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
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/listsamples@TestBot' } };
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
	const update = { message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/learn@TestBot 世界杯红单推荐天天收米日赚三千' } };
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
	assert('/learnlast → 回执给出发送者 TGID 供手动 /ban', !!dm && dm.body.text.includes('88203'));
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
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,888', DB: db };
	// 主人私聊 /help → 展开隐藏指令
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 1, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/help@TestBot' } }) }), env, fakeCtxAd);
	let dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('主人 /help → 展开隐藏指令', !!dm && dm.body.text.includes('第一主人专属'));
	const expectedHelpCommands = [
		'/importdefault', '/addword', '/delword', '/listwords',
		'/spam', '/learn', '/recent', '/learnlast',
		'/ad', '/add_ad_admin', '/del_ad_admin',
		'/listsamples', '/delsample', '/clearsamples',
		'/admins', '/groups', '/leavegroup',
	];
	const missingHelpCommands = expectedHelpCommands.filter((command) => !dm?.body?.text?.includes(command));
	assert('主人 /help → 全部 17 个指令齐全', missingHelpCommands.length === 0, `缺少 ${missingHelpCommands.join(',')}`);
	const mentionParseOk = expectedHelpCommands.every((command) => (
		sandbox.parseTelegramCommand(`${command}@TestBot`).head === command
	));
	const argumentParseOk = [
		['/addword@TestBot fraud test', '/addword', 'fraud test'],
		['/learn@TestBot sample text', '/learn', 'sample text'],
		['/recent@TestBot 20', '/recent', '20'],
		['/learnlast@TestBot 1,3', '/learnlast', '1,3'],
		['/delsample@TestBot 2', '/delsample', '2'],
		['/clearsamples@TestBot confirm', '/clearsamples', 'confirm'],
		['/leavegroup@TestBot -1001234567890', '/leavegroup', '-1001234567890'],
	].every(([input, head, rest]) => {
		const parsed = sandbox.parseTelegramCommand(input);
		return parsed.head === head && parsed.rest === rest;
	});
	assert('/help 全部指令兼容 @机器人名', mentionParseOk && argumentParseOk);
	const removedBanCommand = '/' + ['b', 'e'].join('');
	const removedSpamCommand = '/' + ['s', 'a'].join('');
	assert('主人 /help → 含 /learnlast 说明', !!dm && dm.body.text.includes('learnlast'));
	assert('主人 /help → 批量与学习说明统一为 ban/spam', !!dm && dm.body.text.includes('/ban TGID') && dm.body.text.includes('/spam'));
	assert('主人 /help → 不再显示旧短命令', !!dm && !dm.body.text.includes(removedBanCommand) && !dm.body.text.includes(removedSpamCommand));
	assert('主人 /help → 含 /admins 权限名单说明', !!dm && dm.body.text.includes('/admins') && dm.body.text.includes('权限名单'));
	assert('主人 /help → 含 /groups 群组查询说明', !!dm && dm.body.text.includes('/groups') && dm.body.text.includes('GROUP_ID'));
	assert('主人 /help → 含 /ad 安全发起权限、原因、自动置顶、取消投票与 revoke_messages 说明', !!dm && dm.body.text.includes('/ad [原因]') && dm.body.text.includes('/add_ad_admin 白名单成员可发起') && dm.body.text.includes('普通成员和助推者只能参与投票') && dm.body.text.includes('自动置顶') && dm.body.text.includes('取消投票') && dm.body.text.includes('revoke_messages=true'));
	// 群管理员(非主人)私聊 /help → 权限不足,不泄漏指令
	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 2, chat: { id: 7777, type: 'private' }, from: { id: 7777, is_bot: false }, text: '/help' } }) }), env, fakeCtxAd);
	dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('非主人 /help → 权限不足', !!dm && dm.body.text.includes('权限不足'));
	assert('非主人 /help → 不泄漏隐藏指令', !!dm && !dm.body.text.includes('learnlast'));
	assert('非主人 /help → 不泄漏 /admins', !!dm && !dm.body.text.includes('/admins'));
	assert('非主人 /help → 不泄漏 /groups', !!dm && !dm.body.text.includes('/groups'));
	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 21, chat: { id: 888, type: 'private' }, from: { id: 888, is_bot: false, first_name: '副主人' }, text: '/help' } }) }), env, fakeCtxAd);
	dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '888');
	assert('副主人 /help → 权限不足', !!dm && dm.body.text.includes('权限不足'));
	assert('副主人 /help → 不泄漏隐藏指令', !!dm && !dm.body.text.includes('/learnlast'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 3, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false }, text: '/help' } }) }), env, fakeCtxAd);
	assert('主人群内 /help 指令消息 msgId=3 被删除', callsOf('deleteMessage').some((c) => c.body.message_id === 3));
	assert('主人群内 /help 只发闪屏提示', callsOf('sendMessage').some((c) => String(c.body.chat_id) === '-1001' && c.body.text.includes('请私聊')));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 4, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/start@TestBot' } }) }), env, fakeCtxAd);
	assert('/start@机器人名 → 正常显示自助解封欢迎消息', callsOf('sendMessage').some((c) => String(c.body.chat_id) === '999' && c.body.text.includes('自助解封机器人')));
}

// ---------- [67a] 副主人私聊不变，群内命令零回执并给主人详情 ----------
console.log('\n[67a] 副主人隐藏命令群聊静默 + 私聊不变');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const db = makeAdD1({ general: ['副主人测试词'] });
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,888', DB: db };

	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 22, chat: { id: 888, type: 'private' }, from: { id: 888, is_bot: false, first_name: '副主人' }, text: '/listwords' } }),
	}), env, fakeCtxAd);
	const deputyPrivate = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '888');
	assert('副主人私聊 /listwords 仍直接收到完整结果', !!deputyPrivate && deputyPrivate.body.text.includes('副主人测试词'));
	assert('副主人私聊 /listwords 不触发群闪屏或删消息', callsOf('sendMessage').every((c) => Number(c.body.chat_id) > 0) && callsOf('deleteMessage').length === 0);

	resetCalls();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 23, chat: { id: -1001, type: 'supergroup' }, from: { id: 888, is_bot: false, first_name: '副主人' }, text: '/listwords' } }),
	}), env, fakeCtxAd);
	const groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	const deputyDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '888');
	assert('副主人群内 /listwords 零机器人回执', groupSends.length === 0);
	assert('副主人群内 /listwords 完整结果发给主人', !!ownerDm && ownerDm.body.text.includes('副主人测试词'));
	assert('副主人群内 /listwords 不私聊发令副主人', !deputyDm);
	assert('副主人群内 /listwords 删除命令消息', callsOf('deleteMessage').some((c) => c.body.message_id === 23));
}

// ---------- [67a2] 普通管理员全部群聊指令静默；第一主人不受影响 ----------
console.log('\n[67a2] 普通管理员 /start 群聊静默 + 主人不受影响');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: (b) => ({ ok: true, result: String(b.chat_id) === '-1001' ? [{ user: { id: 7777 }, status: 'administrator' }] : [] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '测试主群', username: 'test_group', type: 'supergroup' } }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 30, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '普通管理员' }, text: '/start' } }),
	}), env, fakeCtxAd);
	let groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	let ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	let triggerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('普通管理员群内 /start 零机器人回执', groupSends.length === 0);
	assert('普通管理员群内 /start 完整欢迎结果发给主人', !!ownerDm && ownerDm.body.text.includes('自助解封机器人'));
	assert('普通管理员群内 /start 不私聊发令者', !triggerDm);
	assert('普通管理员群内 /start 只鉴权当前群', callsOf('getChatAdministrators').length === 1 && String(callsOf('getChatAdministrators')[0].body.chat_id) === '-1001');
	assert('普通管理员群内 /start 删除命令消息', callsOf('deleteMessage').some((c) => c.body.message_id === 30));

	resetCalls();
	const blacklistedEnv = {
		...env,
		DB: makeFakeDB([{ id: '7777', reason: 'manual', by: '999', at: '2026-07-21T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 32, chat: { id: -1001, type: 'supergroup' }, from: { id: 7777, is_bot: false, first_name: '普通管理员' }, text: '/start' } }),
	}), blacklistedEnv, fakeCtxAd);
	groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('黑名单普通管理员群内 /start 拦截仍零机器人回执', groupSends.length === 0);
	assert('黑名单普通管理员群内 /start 拦截仍通知主人', !!ownerDm && ownerDm.body.text.includes('黑名单'));
	assert('黑名单普通管理员群内 /start 仍删除命令消息', callsOf('deleteMessage').some((c) => c.body.message_id === 32));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 31, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false, first_name: '主人' }, text: '/start' } }),
	}), env, fakeCtxAd);
	groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	assert('第一主人群内 /start 保持原完整群回复', groupSends.length === 1 && groupSends[0].body.text.includes('自助解封机器人'));
	assert('第一主人群内 /start 不走普通管理员鉴权或删命令', callsOf('getChatAdministrators').length === 0 && !callsOf('deleteMessage').some((c) => c.body.message_id === 31));
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
	db._store.set('ad_samples', JSON.stringify(trustedSampleData(['https://github.com/jacobax/snippets'])));
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
	db._store.set('ad_samples', JSON.stringify(trustedSampleData(['http://spam-shop.xyz/abc'])));
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	// 同域名不同路径(更长)→ 旧版会被子串命中,新版不该被杀
	const update = { message: { message_id: 1, chat: { id: -1001, type: 'supergroup' }, from: { id: 88301, is_bot: false }, text: 'http://spam-shop.xyz/abc/page/normal-content-here', entities: [{ type: 'url', offset: 0, length: 49 }] } };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(update) }), env, fakeCtxAd);
	let bl = JSON.parse(db._store.get('blacklist') || '[]');
	assert('同域名不同路径 → 不被子串误杀', !bl.some((e) => e.id === '88301'));
	// 完全相同的那条 → 仍应精确命中
	resetCalls();
	const db2 = makeFakeDB([]);
	db2._store.set('ad_samples', JSON.stringify(trustedSampleData(['http://spam-shop.xyz/abc'])));
	const env2 = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db2 };
	const upd2 = { message: { message_id: 2, chat: { id: -1001, type: 'supergroup' }, from: { id: 88302, is_bot: false }, text: 'http://spam-shop.xyz/abc', entities: [{ type: 'url', offset: 0, length: 24 }] } };
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
	db._store.set('ad_samples', JSON.stringify(trustedSampleData(['https://myblog.example/post1'])));
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

// ---------- [78] /check TGID 双库查询与纯复制操作 ----------
console.log('\n[78] /check TGID 双库查询与纯复制操作');
{
	const TARGET_ID = '993005028';
	const GKY_NONE = 'This TG account has no ban record';
	const GKY_CONFIGURED = '<strong>TGID:</strong> 993005028<br><strong>ChatID:</strong> -1001<br><strong>Reason:</strong> SpamGP<br>';
	const GKY_EXTERNAL = '<strong>TGID:</strong> 993005028<br><strong>ChatID:</strong> -1009999999<br><strong>Reason:</strong> SpamGP<br>';
	const GKY_MISMATCHED = '<strong>TGID:</strong> 55555<br><strong>ChatID:</strong> -1001<br><strong>Reason:</strong> SpamGP<br>';
	const localEntry = { id: TARGET_ID, reason: 'manual', by: '999', at: '2026-05-01T00:00:00Z', note: '本地测试封禁' };

	function makeCheckFetch(banlistResponse, adminIds = [999]) {
		return async function (url, init) {
			const u = String(url);
			if (u.includes('api.telegram.org')) {
				const method = u.split('/').pop();
				const body = init?.body ? JSON.parse(init.body) : null;
				apiCalls.push({ method, body });
				if (method === 'getChatAdministrators') return { ok: true, status: 200, async json() { return { ok: true, result: adminIds.map((id) => ({ user: { id }, status: 'administrator' })) }; } };
				if (method === 'getChatMember') return { ok: true, status: 200, async json() { return { ok: true, result: { user: { id: Number(body?.user_id || TARGET_ID), first_name: '管理员' }, status: 'member' } }; } };
				if (method === 'getChat') return { ok: true, status: 200, async json() { return { ok: true, result: { id: Number(body?.chat_id), title: '测试群', type: 'supergroup' } }; } };
				return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 1 } }; } };
			}
			if (u.includes('banlist')) {
				if (banlistResponse instanceof Error) throw banlistResponse;
				return { ok: true, status: 200, async text() { return banlistResponse; } };
			}
			throw new Error('Unexpected fetch: ' + u);
		};
	}

	function makeCheckEnv(seed = []) {
		return { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', SUPER_ADMINS: '999', DB: makeFakeDB(seed) };
	}

	async function runCheck({ gky, env, chat = { id: 999, type: 'private' }, from = { id: 999, is_bot: false, first_name: '主人' }, text = '/check ' + TARGET_ID, replyTo, senderChat, adminIds = [999] }) {
		resetCalls();
		sandbox.fetch = makeCheckFetch(gky, adminIds);
		const message = { message_id: 1, chat, from, text };
		if (replyTo) message.reply_to_message = replyTo;
		if (senderChat) message.sender_chat = senderChat;
		await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message }) }), env, fakeCtxAd);
		const sent = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === String(chat.id));
		const result = sent.at(-1);
		const buttons = (result?.body.reply_markup?.inline_keyboard || []).flat();
		return { sent, result, buttons, copies: buttons.map((button) => button.copy_text?.text) };
	}

	const basicCases = [
		{ name: '两边正常', gky: GKY_NONE, seed: [], copies: [] },
		{ name: '仅 GKY 封禁', gky: GKY_CONFIGURED, seed: [], copies: ['GKYbotSave\n' + TARGET_ID] },
		{ name: '仅本地封禁', gky: GKY_NONE, seed: [localEntry], copies: ['/unban ' + TARGET_ID] },
		{ name: 'GKY + 本地都封禁', gky: GKY_CONFIGURED, seed: [localEntry], copies: ['GKYbotSave\n' + TARGET_ID, '/unban ' + TARGET_ID] },
	];
	for (const item of basicCases) {
		const env = makeCheckEnv(item.seed);
		const check = await runCheck({ gky: item.gky, env });
		assert(item.name + ' → 复制按钮数量与内容正确', JSON.stringify(check.copies) === JSON.stringify(item.copies));
		assert(item.name + ' → 所有按钮只有 copy_text', check.buttons.every((button) => !!button.copy_text?.text && !Object.prototype.hasOwnProperty.call(button, 'callback_data')));
		if (item.seed.length) assert(item.name + ' → /check 不直接修改 D1', env.DB._rows.has(TARGET_ID) && callsOf('unbanChatMember').length === 0);
	}

	let check = await runCheck({ gky: GKY_EXTERNAL, env: makeCheckEnv([localEntry]) });
	assert('外部群 GKY 封禁 + 本地封禁 → 提示 GKY 官网', String(check.result?.body.text || '').includes('GKY 官方网页'));
	assert('外部群 GKY 封禁 + 本地封禁 → 仅保留本地复制', JSON.stringify(check.copies) === JSON.stringify(['/unban ' + TARGET_ID]));

	check = await runCheck({ gky: GKY_MISMATCHED, env: makeCheckEnv([localEntry]) });
	assert('GKY TGID 不一致 → 只禁用 GKY 复制', String(check.result?.body.text || '').includes('TGID 无法与查询目标核对') && JSON.stringify(check.copies) === JSON.stringify(['/unban ' + TARGET_ID]));

	check = await runCheck({ gky: new Error('GKY unavailable'), env: makeCheckEnv([localEntry]) });
	assert('GKY 查询失败 → 仍返回本地状态和 /unban 复制', String(check.result?.body.text || '').includes('GKY 查询失败') && String(check.result?.body.text || '').includes('本地黑名单:在黑名单中') && JSON.stringify(check.copies) === JSON.stringify(['/unban ' + TARGET_ID]));

	check = await runCheck({ gky: GKY_CONFIGURED, env: makeCheckEnv([localEntry]), chat: { id: -1001, type: 'supergroup', title: '配置群' } });
	assert('GROUP_ID 配置群 /check → 双封禁显示两个复制按钮', check.copies.length === 2);

	const superEnv = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', SUPER_ADMINS: '7777', DB: makeFakeDB([localEntry]) };
	check = await runCheck({
		gky: GKY_CONFIGURED,
		env: superEnv,
		chat: { id: -1001, type: 'supergroup', title: '配置群' },
		from: { id: 7777, is_bot: false, first_name: '超级管理员' },
	});
	const quietGroupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	const ownerCheckResult = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '999').at(-1);
	const ownerCheckButtons = (ownerCheckResult?.body.reply_markup?.inline_keyboard || []).flat();
	const superTriggerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '7777');
	assert('超级管理员群内 /check 零机器人回执', quietGroupSends.length === 0);
	assert('超级管理员群内 /check 完整结果发给主人', !!ownerCheckResult && ownerCheckResult.body.text.includes('封禁查询结果'));
	assert('超级管理员群内 /check 复制按钮完整发给主人', ownerCheckButtons.length === 2 && ownerCheckButtons.every((button) => !!button.copy_text?.text));
	assert('超级管理员群内 /check 不私聊发令者', !superTriggerDm);
	assert('超级管理员群内 /check 删除命令消息', callsOf('deleteMessage').length >= 1);

	check = await runCheck({ gky: GKY_CONFIGURED, env: { ...superEnv, DB: makeFakeDB([localEntry]) }, chat: { id: 7777, type: 'private' }, from: { id: 7777, is_bot: false, first_name: '超级管理员' } });
	assert('超级管理员私聊 /check 仍直接收到完整结果', String(check.result?.body.text || '').includes('封禁查询结果') && check.copies.length === 2);
	assert('超级管理员私聊 /check 不触发任何群闪屏', callsOf('sendMessage').every((c) => Number(c.body.chat_id) > 0));

	check = await runCheck({ gky: GKY_CONFIGURED, env: makeCheckEnv([localEntry]), chat: { id: -2001, type: 'supergroup', title: '未配置群' } });
	assert('非 GROUP_ID 来源群 → 仍返回双库详情', String(check.result?.body.text || '').includes('封禁查询结果') && String(check.result?.body.text || '').includes('本地黑名单:在黑名单中'));
	assert('非 GROUP_ID 来源群 → 仅查询且无复制按钮', String(check.result?.body.text || '').includes('不提供任何复制按钮') && check.buttons.length === 0);

	check = await runCheck({ gky: GKY_EXTERNAL, env: makeCheckEnv([localEntry]), chat: { id: -2001, type: 'supergroup', title: '未配置群' }, text: '/check', replyTo: { message_id: 3, from: { id: Number(TARGET_ID), is_bot: false, first_name: '目标用户' } } });
	assert('非 GROUP_ID 来源群回复 /check → 官网提示且无按钮', String(check.result?.body.text || '').includes('GKY 官方网页') && check.buttons.length === 0);

	check = await runCheck({ gky: GKY_NONE, env: makeCheckEnv(), chat: { id: 5555, type: 'private' }, from: { id: 5555, is_bot: false }, adminIds: [999] });
	assert('非管理员私聊 /check TGID → 权限不足', String(check.result?.body.text || '').includes('权限不足'));

	check = await runCheck({ gky: GKY_NONE, env: makeCheckEnv(), text: '/check' });
	assert('私聊 /check 无参数 → 提示用 /check TGID', String(check.result?.body.text || '').includes('/check TGID'));

	check = await runCheck({ gky: GKY_NONE, env: makeCheckEnv(), chat: { id: -2001, type: 'supergroup', title: '未配置群' }, from: { id: 5555, is_bot: false }, adminIds: [999] });
	assert('非 GROUP_ID 群普通用户 /check → 群内静默拒绝', check.sent.length === 0);

	check = await runCheck({ gky: GKY_NONE, env: makeCheckEnv(), chat: { id: -2001, type: 'supergroup', title: '未配置群' }, from: { id: 1087968824, is_bot: true, first_name: 'GroupAnonymousBot' }, senderChat: { id: -2001, type: 'supergroup', title: '未配置群' }, adminIds: [999] });
	assert('非 GROUP_ID 群匿名管理员 /check → 不获得查询权限', check.sent.length === 0);

	check = await runCheck({ gky: GKY_NONE, env: makeCheckEnv(), text: '/start check_abc' });
	assert('/start check_ 非数字 → TGID 格式错误', String(check.result?.body.text || '').includes('TGID 格式错误'));
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
	assert('短正文引用高危广告 → 第一次直接加黑当前传播者', bl.some((e) => e.id === '91001'));
	assert('短正文引用高危广告 → 删除当前消息', callsOf('deleteMessage').some((c) => String(c.body.chat_id) === '-1001' && c.body.message_id === 900));
	assert('短正文引用高危广告 → 第一次全群封禁当前传播者', callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((c) => String(c.body.user_id) === '91001'));
	assert('短正文引用高危广告 → 不写 D1 观察档案', !db._relayObservations.has('91001'));
	const ownerDm = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '999');
	assert('短正文引用高危广告 → 通知标明首杀且不显示观察次数', ownerDm.some((c) => c.body.text.includes('高置信引用广告首杀') && c.body.text.includes('揾逼赚钱') && !c.body.text.includes('观察次数')));

	const strongWrapperCases = [
		{ label: 'j', text: 'j' },
		{ label: 'v', text: 'v' },
		{ label: 'n', text: 'n' },
		{ label: '爽', text: '爽' },
		{ label: '零宽字符', text: '\u200B' },
	];
	for (const [index, wrapperCase] of strongWrapperCases.entries()) {
		resetCalls();
		db = makeFakeDB([]);
		db._store.set('ad_keywords_custom', JSON.stringify({ porn: ['探花'], fraud: ['提供设备'] }));
		env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
		const actorId = String(91100 + index);
		await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({
			message: {
				message_id: 91100 + index,
				chat: { id: -1001, type: 'supergroup', title: '广告测试群' },
				from: { id: Number(actorId), is_bot: false, first_name: '包装广告号' },
				text: wrapperCase.text,
				quote: { text: '摄影赚钱 招探花9000一单，提供设备' },
			}
		}) }), env, fakeCtxAd);
		bl = JSON.parse(db._store.get('blacklist') || '[]');
		assert(`${wrapperCase.label} 包装明确高危广告 → 首次直接全局加黑`, bl.some((entry) => entry.id === actorId));
		assert(`${wrapperCase.label} 包装明确高危广告 → 当前传播者执行全部 GROUP_ID 封禁`, callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((call) => String(call.body.user_id) === actorId));
		assert(`${wrapperCase.label} 包装明确高危广告 → 不进入观察表`, !db._relayObservations.has(actorId));
	}

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
	assert('短正文引用单个高危词 → 第一次直接加黑当前传播者', bl.some((e) => e.id === '91003'));
	assert('短正文引用单个高危词 → 删除当前消息', callsOf('deleteMessage').some((c) => String(c.body.chat_id) === '-1001' && c.body.message_id === 902));
	assert('短正文引用单个高危词 → 第一次全群封禁当前传播者', callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((c) => String(c.body.user_id) === '91003'));
	assert('短正文引用单个高危词 → 不写观察档案', !db._relayObservations.has('91003'));

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
	assert('ASCII包装引用卡片广告 → 第一次直接加黑当前传播者', bl.some((e) => e.id === '91004'));
	assert('ASCII包装引用卡片广告 → 删除当前消息', callsOf('deleteMessage').some((c) => String(c.body.chat_id) === '-1001' && c.body.message_id === 903));
	assert('ASCII包装引用卡片广告 → 第一次全群封禁当前传播者', callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((c) => String(c.body.user_id) === '91004'));
	assert('ASCII包装引用卡片广告 → 不写观察档案', !db._relayObservations.has('91004'));

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
	assert('牛比包装高置信卡片广告 → 当前传播者首次直接加黑', bl.some((e) => e.id === '91008'));
	assert('牛比包装高置信卡片广告 → 删除当前含广告引用的消息', callsOf('deleteMessage').some((c) => c.body.message_id === 906));
	assert('牛比包装高置信卡片广告 → 当前传播者遍历全部 GROUP_ID 封禁', callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((c) => String(c.body.user_id) === '91008'));
	assert('牛比包装高置信卡片广告 → 不进入观察表', !db._relayObservations.has('91008'));

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
	assert('长正文讨论引用广告 → 删除当前含广告引用的消息', callsOf('deleteMessage').some((c) => c.body.message_id === 901));
}

// ---------- [81a2] 删除竞态或权限失败不能阻断广告传播者全局封禁 ----------
console.log('\n[81a2] 广告引用删除结果与封禁决策解耦');
{
	const scenarios = [
		{
			label: '消息已被其他机器人删除',
			actorId: 93990,
			error: 'Bad Request: message to delete not found',
			noticeText: '已被其他机器人或管理员删除，等效成功',
		},
		{
			label: '机器人缺少删除权限',
			actorId: 93991,
			error: 'Bad Request: CHAT_ADMIN_REQUIRED',
			noticeText: 'bot 必须是群管理员',
		},
	];
	for (const scenario of scenarios) {
		resetCalls();
		sandbox.fetch = makeFetchMock({
			getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
			getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '删除竞态测试群', type: 'supergroup' } }),
			banChatMember: () => ({ ok: true, result: true }),
			deleteMessage: () => ({ ok: false, description: scenario.error }),
			sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		});
		const db = makeAdD1({ porn: ['大婆啦'] });
		const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
		await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
			message_id: scenario.actorId,
			chat: { id: -1001, type: 'supergroup', title: '删除竞态测试群' },
			from: { id: scenario.actorId, is_bot: false, first_name: '广告传播者' },
			text: '爽',
			quote: { text: '📢 大婆啦 真实广告内容' },
		} }) }), env, fakeCtxAd);
		const ownerNotice = callsOf('sendMessage').find((call) => String(call.body.chat_id) === '999');
		assert(scenario.label + ' → 当前传播者仍写入 D1 全局黑名单', db._rows.get(String(scenario.actorId))?.reason === 'ad_auto');
		assert(scenario.label + ' → 仍遍历全部 GROUP_ID 封禁', callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((call) => String(call.body.user_id) === String(scenario.actorId)));
		assert(scenario.label + ' → 删除结果给主人显示真实中文状态', !!ownerNotice && ownerNotice.body.text.includes(scenario.noticeText));
		assert(scenario.label + ' → 不进入首次观察漏封路径', !db._relayObservations.has(String(scenario.actorId)));
	}
}
console.log('\n[81b] 引用广告归属与观察升级');
// ---------- [81b] 引用广告归属：误触观察、正常语境保护与原作者封禁 ----------
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => String(b.chat_id).startsWith('-')
			? ({ ok: true, result: { id: Number(b.chat_id), title: '广告归属测试群', type: 'supergroup' } })
			: ({ ok: true, result: { id: Number(b.chat_id), first_name: '正常用户', type: 'private' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeAdD1({ porn: ['大婆啦'], general: ['揾逼赚钱'] });
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,998', SUPER_ADMINS: '7777', AD_FILTER_ENABLED: 'true', DB: db };
	const relayMessage = (messageId, outer = '这是什么', actorId = 94001) => ({
		message_id: messageId,
		chat: { id: -1001, type: 'supergroup', title: '广告归属测试群' },
		from: { id: actorId, is_bot: false, first_name: '正常回复者' },
		...(outer === null ? { sticker: { file_id: 'sticker-1', emoji: '👍' } } : { text: outer }),
		reply_to_message: {
			message_id: 800,
			from: { id: 94002, is_bot: false, first_name: '原广告作者' },
			text: '📢 大婆啦 我的妈 揾逼赚钱',
		},
	});

	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: relayMessage(94010) }) }), env, fakeCtxAd);
	assert('第一次正常文字回复广告 → 当前回复者不进全局黑名单', !db._rows.has('94001'));
	assert('第一次正常文字回复广告 → 原作者有 TGID 时照常进全局黑名单', db._rows.get('94002')?.reason === 'ad_auto');
	assert('第一次正常文字回复广告 → 只全群封禁原作者', callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((c) => String(c.body.user_id) === '94002'));
	assert('第一次正常文字回复广告 → 删除当前含广告引用的消息', callsOf('deleteMessage').some((c) => c.body.message_id === 94010));
	assert('第一次正常文字回复广告 → D1 观察次数为 1', db._relayObservations.get('94001')?.occurrences === 1);
	const firstNotice = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('保护判定完整通知 → 第一主人收到当前回复者、原作者和处理结果', !!firstNotice && firstNotice.body.text.includes('广告引用保护判定') && firstNotice.body.text.includes('94001') && firstNotice.body.text.includes('94002'));
	assert('观察完整通知 → 群内、副主人、超管、回复者均不接收', callsOf('sendMessage').every((c) => String(c.body.chat_id) === '999'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: relayMessage(94010) }) }), env, fakeCtxAd);
	assert('同一 Telegram 消息重试 → 观察次数仍为 1', db._relayObservations.get('94001')?.occurrences === 1);
	assert('同一 Telegram 消息重试 → 当前回复者仍不封禁', !db._rows.has('94001'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: relayMessage(94011, '别发广告') }) }), env, fakeCtxAd);
	assert('明确劝阻语境重复出现 → 当前回复者仍不进全局黑名单', !db._rows.has('94001'));
	assert('明确劝阻语境重复出现 → 观察次数不累计', db._relayObservations.get('94001')?.occurrences === 1);
	assert('明确劝阻语境重复出现 → 原作者仍执行全部 GROUP_ID 封禁', callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((c) => String(c.body.user_id) === '94002'));
	assert('明确劝阻语境通知 → 仍只发第一主人', callsOf('sendMessage').every((c) => String(c.body.chat_id) === '999'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: relayMessage(94012, null, 94003) }) }), env, fakeCtxAd);
	assert('贴纸误回复广告 → 第一次只观察、不封当前回复者', !db._rows.has('94003') && db._relayObservations.get('94003')?.occurrences === 1);
	assert('贴纸误回复广告 → 删除当前消息并继续处理原作者', callsOf('deleteMessage').some((c) => c.body.message_id === 94012) && callsOf('banChatMember').every((c) => String(c.body.user_id) === '94002'));
}

// ---------- [81c] 原作者隐藏、自引用与转发归属 ----------
console.log('\n[81c] 原作者隐藏、自引用与转发归属');
{
	const baseRoutes = {
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: String(b.chat_id).startsWith('-') ? '归属测试群' : undefined, first_name: '正常用户', type: String(b.chat_id).startsWith('-') ? 'supergroup' : 'private' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	};

	resetCalls();
	sandbox.fetch = makeFetchMock(baseRoutes);
	let db = makeAdD1({ porn: ['大婆啦'] });
	let env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
		message_id: 94100, chat: { id: -1001, type: 'supergroup' }, from: { id: 94100, is_bot: false, first_name: '正常用户' },
		text: '这是广告吗', quote: { text: '📢 大婆啦 广告内容' },
	} }) }), env, fakeCtxAd);
	assert('原作者 TGID 隐藏 → 不按昵称猜测、不执行任何封禁', !db._rows.has('94100') && callsOf('banChatMember').length === 0);
	const hiddenNotice = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('原作者 TGID 隐藏 → 主人通知明确说明未提供可验证 TGID', !!hiddenNotice && hiddenNotice.body.text.includes('未提供可验证 TGID'));

	resetCalls();
	sandbox.fetch = makeFetchMock(baseRoutes);
	db = makeAdD1({ porn: ['大婆啦'] });
	env = { ...env, DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
		message_id: 94110, chat: { id: -1001, type: 'supergroup' }, from: { id: 94110, is_bot: false, first_name: '自引用者' }, text: 'p',
		reply_to_message: { message_id: 700, from: { id: 94110, is_bot: false, first_name: '自引用者' }, text: '📢 大婆啦 广告内容' },
	} }) }), env, fakeCtxAd);
	assert('自己引用自己的广告 → 立即全局封禁当前发送者', db._rows.get('94110')?.reason === 'ad_auto' && callsOf('banChatMember').length === 2);
	assert('自己引用自己的广告 → 不写普通误回复观察', !db._relayObservations.has('94110'));

	resetCalls();
	sandbox.fetch = makeFetchMock(baseRoutes);
	db = makeAdD1();
	env = { ...env, DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
		message_id: 94120, chat: { id: -1001, type: 'supergroup' }, from: { id: 94120, is_bot: false, first_name: '转发者' },
		text: '专业出u承兑日入过万',
		forward_origin: { type: 'user', sender_user: { id: 94121, is_bot: false, first_name: '原作者' } },
		forward_from: { id: 94121, is_bot: false, first_name: '原作者' },
	} }) }), env, fakeCtxAd);
	const forwardTargets = new Set(callsOf('banChatMember').map((c) => String(c.body.user_id)));
	assert('直接转发广告 → 当前传播者与原作者都进全局黑名单', db._rows.has('94120') && db._rows.has('94121'));
	assert('直接转发广告 → 重复来源字段按 TGID 去重，仅执行 2 人×2群', callsOf('banChatMember').length === 4 && forwardTargets.size === 2);
}

// ---------- [81d] legacy 污染样本与新可信样本 ----------
console.log('\n[81d] legacy 污染样本与可信样本');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	let db = makeFakeDB([]);
	db._store.set('ad_samples', JSON.stringify({ fingerprints: [normalizeFp('我 秦始皇 打钱')], count: 1 }));
	let env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 94200, chat: { id: -1001, type: 'supergroup' }, from: { id: 94200, is_bot: false, first_name: '正常用户' }, text: '我 秦始皇 打钱' } }) }), env, fakeCtxAd);
	assert('旧裸样本“我秦始皇打钱” → 无额外广告证据时不再误杀', !db._rows.has('94200') && callsOf('deleteMessage').length === 0 && callsOf('banChatMember').length === 0);

	resetCalls();
	sandbox.fetch = adFetchMock();
	db = makeFakeDB([]);
	db._store.set('ad_samples', JSON.stringify(trustedSampleData(['人工确认广告样本ABC123'])));
	env = { ...env, DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 94201, chat: { id: -1001, type: 'supergroup' }, from: { id: 94201, is_bot: false, first_name: '广告用户' }, text: '人工确认广告样本ABC123' } }) }), env, fakeCtxAd);
	assert('新可信样本精确匹配 → 仍自动加黑并全群封禁', db._rows.get('94201')?.reason === 'ad_auto' && callsOf('banChatMember').length === 2);
}

// ---------- [81e] Telegram bio 与 sender_chat 身份广告 ----------
console.log('\n[81e] bio 与 sender_chat 身份广告');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => String(b.chat_id) === '94300'
			? ({ ok: true, result: { id: 94300, first_name: '正常名字', bio: '约炮资源入口', type: 'private' } })
			: ({ ok: true, result: { id: Number(b.chat_id), title: '测试群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	let db = makeAdD1({ identity: ['约炮'] });
	let env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: { message_id: 94300, chat: { id: -1001, type: 'supergroup' }, from: { id: 94300, is_bot: false, first_name: '正常名字' }, text: '大家好' } }) }), env, fakeCtxAd);
	assert('Telegram getChat 可返回 bio 时 → bio 身份广告立即封禁', db._rows.get('94300')?.reason === 'ad_auto' && callsOf('banChatMember').length === 2);

	resetCalls();
	sandbox.fetch = adFetchMock();
	db = makeAdD1({ identity: ['裸聊'] });
	env = { ...env, DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
		message_id: 94301, chat: { id: -1001, type: 'supergroup' }, from: { id: 94301, is_bot: false, first_name: '普通用户' },
		sender_chat: { id: -100998, type: 'channel', title: '裸聊资源入口' }, text: '正常正文',
	} }) }), env, fakeCtxAd);
	assert('sender_chat 名称含身份广告词 → 当前发送者立即封禁', db._rows.get('94301')?.reason === 'ad_auto' && callsOf('banChatMember').length === 2);
}

// ---------- [81f] /spam 学习真实广告载体与身份资料防污染 ----------
console.log('\n[81f] /spam 学习载体归属');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), first_name: '普通用户', title: String(b.chat_id).startsWith('-') ? '测试群' : undefined, type: String(b.chat_id).startsWith('-') ? 'supergroup' : 'private' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	let db = makeAdD1({ porn: ['大婆啦'] });
	let env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
		message_id: 94400, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false, first_name: '主人' }, text: '/spam',
		reply_to_message: { message_id: 94401, from: { id: 94401, is_bot: false, first_name: '包装传播者' }, text: 'p', quote: { text: '📢 大婆啦 真实广告正文' } },
	} }) }), env, fakeCtxAd);
	let samples = JSON.parse(db._store.get('ad_samples') || '{"fingerprints":[],"entries":[]}');
	assert('/spam 引用包装广告 → 学习引用中的真实广告而不是外层 p', samples.fingerprints.includes(normalizeFp('📢 大婆啦 真实广告正文')) && !samples.fingerprints.includes(normalizeFp('p')));
	const quotedEntry = samples.entries?.find((entry) => entry.fingerprint === normalizeFp('📢 大婆啦 真实广告正文'));
	assert('/spam 引用学习 → 保存可信来源、操作者、消息与内容预览', quotedEntry?.trusted === true && quotedEntry.source === 'spam:quoted-ad' && quotedEntry.operatorId === '999' && quotedEntry.sourceMessageId === '94401' && quotedEntry.preview.includes('真实广告正文'));

	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => String(b.chat_id) === '94411'
			? ({ ok: true, result: { id: 94411, first_name: '正常名字', bio: '约炮资源入口', type: 'private' } })
			: ({ ok: true, result: { id: Number(b.chat_id), first_name: '主人', title: String(b.chat_id).startsWith('-') ? '测试群' : undefined, type: String(b.chat_id).startsWith('-') ? 'supergroup' : 'private' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	db = makeAdD1({ identity: ['约炮'] });
	env = { ...env, DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
		message_id: 94410, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false, first_name: '主人' }, text: '/spam',
		reply_to_message: { message_id: 94411, from: { id: 94411, is_bot: false, first_name: '正常名字' }, text: '你好，刚进群' },
	} }) }), env, fakeCtxAd);
	assert('/spam 仅资料是广告 → 账号照常封禁', db._rows.has('94411'));
	assert('/spam 仅资料是广告 → 不学习当前正常正文', !db._store.has('ad_samples'));

	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => String(b.chat_id) === '94421'
			? ({ ok: true, result: { id: 94421, first_name: '正常名字', bio: '专属担保 代收黑钱入口', type: 'private' } })
			: ({ ok: true, result: { id: Number(b.chat_id), first_name: '主人', title: String(b.chat_id).startsWith('-') ? '测试群' : undefined, type: String(b.chat_id).startsWith('-') ? 'supergroup' : 'private' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	db = makeAdD1({ fraud: ['专属担保', '代收黑钱'] });
	env = { ...env, DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
		message_id: 94420, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false, first_name: '主人' }, text: '/spam',
		reply_to_message: { message_id: 94421, from: { id: 94421, is_bot: false, first_name: '正常名字' }, text: '今天路过打个招呼' },
	} }) }), env, fakeCtxAd);
	assert('/spam 资料通过普通广告词评分命中 → 账号照常封禁', db._rows.has('94421'));
	assert('/spam 资料通过普通广告词评分命中 → 不学习当前正常正文', !db._store.has('ad_samples'));
}

// ---------- [81f2] 只有第一主人 /spam 才写广告学习样本 ----------
console.log('\n[81f2] /spam 学习权限严格限制第一主人');
{
	const roleCases = [
		{ label: '副主人', actorId: 998, targetId: 94431 },
		{ label: '超级管理员', actorId: 7777, targetId: 94432 },
		{ label: '当前群普通管理员', actorId: 6666, targetId: 94433 },
	];
	for (const scenario of roleCases) {
		resetCalls();
		sandbox.fetch = makeFetchMock({
			getChatAdministrators: (body) => ({
				ok: true,
				result: String(body.chat_id) === '-1001'
					? [
						{ user: { id: 999 }, status: 'creator' },
						{ user: { id: 6666 }, status: 'administrator' },
					]
					: [{ user: { id: 999 }, status: 'creator' }],
			}),
			getChatMember: (body) => ({
				ok: true,
				result: String(body.chat_id) === '-1001' && String(body.user_id) === '6666'
					? { status: 'administrator', user: { id: 6666, is_bot: false } }
					: { status: 'member', user: { id: Number(body.user_id), is_bot: false } },
			}),
			getChat: (body) => ({ ok: true, result: { id: Number(body.chat_id), first_name: '普通用户', title: String(body.chat_id).startsWith('-') ? '测试群' : undefined, type: String(body.chat_id).startsWith('-') ? 'supergroup' : 'private' } }),
			banChatMember: () => ({ ok: true, result: true }),
			deleteMessage: () => ({ ok: true, result: true }),
			sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		});
		const db = makeAdD1({ porn: ['大婆啦'] });
		const env = {
			TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002',
			OWNER_IDS: '999,998', SUPER_ADMINS: '7777',
			AD_FILTER_ENABLED: 'true', DB: db,
		};
		await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
			message_id: scenario.targetId - 1, chat: { id: -1001, type: 'supergroup', title: '测试群' },
			from: { id: scenario.actorId, is_bot: false, first_name: scenario.label }, text: '/spam',
			reply_to_message: { message_id: scenario.targetId, from: { id: scenario.targetId, is_bot: false, first_name: '广告用户' }, text: '📢 大婆啦 真实广告正文' },
		} }) }), env, fakeCtxAd);
		assert(scenario.label + ' /spam → 封禁功能照常写入黑名单并遍历全部 GROUP_ID', db._rows.get(String(scenario.targetId))?.reason === 'spam' && callsOf('banChatMember').length === 2);
		assert(scenario.label + ' /spam → 不写广告学习样本', !db._store.has('ad_samples'));
	}
}
console.log('\n[81g] 观察通知失败隔离');

// ---------- [81f3] 第一主人学习后的相似广告变体查杀 ----------
console.log('\n[81f3] 学习样本屏蔽账号、电话、金额、URL 与排版变量');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (body) => ({ ok: true, result: { id: Number(body.chat_id), first_name: '普通用户', title: String(body.chat_id).startsWith('-') ? '学习测试群' : undefined, type: String(body.chat_id).startsWith('-') ? 'supergroup' : 'private' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeAdD1();
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const learnedText = '承接社群值守服务，长期招募合作伙伴，每月500元，联系 @service_old，详情 https://t.me/service_old，电话13800138000';
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
		message_id: 94440, chat: { id: -1001, type: 'supergroup', title: '学习测试群' },
		from: { id: 999, is_bot: false, first_name: '主人' }, text: '/spam',
		reply_to_message: { message_id: 94441, from: { id: 94441, is_bot: false, first_name: '广告样本账号' }, text: learnedText },
	} }) }), env, fakeCtxAd);
	const learned = JSON.parse(db._store.get('ad_samples') || '{"entries":[]}');
	const learnedEntry = learned.entries?.find((entry) => entry.fingerprint === normalizeFp(learnedText));
	assert('第一主人 /spam → 样本带可信相似签名入库', learnedEntry?.trusted === true && learnedEntry?.similarityTrusted === true && learnedEntry?.signature?.canonical);

	resetCalls();
	const variantText = '承接社群值守服务\n长期招募合作伙伴\n每月 900 元\n联系 @service_new\n详情 https://t.me/service_new\n电话 13900139000';
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
		message_id: 94442, chat: { id: -1001, type: 'supergroup', title: '学习测试群' },
		from: { id: 94442, is_bot: false, first_name: '更换资料的广告账号' }, text: variantText,
	} }) }), env, fakeCtxAd);
	const ownerNotice = callsOf('sendMessage').find((call) => String(call.body.chat_id) === '999');
	assert('相似广告更换账号、电话、金额、URL 和排版 → 首次自动全局封禁', db._rows.get('94442')?.reason === 'ad_auto' && callsOf('banChatMember').length === 2);
	assert('相似广告变体 → 主人通知明确由可信学习样本相似命中', !!ownerNotice && ownerNotice.body.text.includes('学习样本(相似)'));

	resetCalls();
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
		message_id: 94443, chat: { id: -1001, type: 'supergroup', title: '学习测试群' },
		from: { id: 94443, is_bot: false, first_name: '正常讨论者' }, text: '我们社群值守服务的排班已经确定，大家按月开会讨论合作安排',
	} }) }), env, fakeCtxAd);
	assert('共享部分业务词但没有广告意图的正常讨论 → 不被相似样本误杀', !db._rows.has('94443') && callsOf('deleteMessage').length === 0 && callsOf('banChatMember').length === 0);
}

// ---------- [81g] 主人私聊失败不影响 D1 观察与原作者封禁 ----------
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), first_name: '普通用户', title: '测试群', type: String(b.chat_id).startsWith('-') ? 'supergroup' : 'private' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: false, description: 'Forbidden: bot was blocked by the user' }),
	});
	const db = makeAdD1({ porn: ['大婆啦'] });
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,998', AD_FILTER_ENABLED: 'true', DB: db };
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
		message_id: 94500, chat: { id: -1001, type: 'supergroup' }, from: { id: 94500, is_bot: false, first_name: '正常回复者' }, text: '这是什么',
		reply_to_message: { message_id: 600, from: { id: 94501, is_bot: false, first_name: '原作者' }, text: '📢 大婆啦 广告内容' },
	} }) }), env, fakeCtxAd);
	assert('第一主人私聊失败 → D1 观察记录仍保留', db._relayObservations.get('94500')?.occurrences === 1);
	assert('第一主人私聊失败 → 原作者仍写黑名单并全群封禁', db._rows.has('94501') && callsOf('banChatMember').length === 2);
	assert('第一主人私聊失败 → 不回退发送给副主人或群聊', callsOf('sendMessage').length === 1 && String(callsOf('sendMessage')[0].body.chat_id) === '999');
}

// ---------- [81h] D1 schema v4 自动迁移与引用观察表按需自愈 ----------
console.log('\n[81h] D1 schema v4 自动迁移与引用观察表按需自愈');
{
	const scenarios = [
		{ label: '旧 schema v2', schemaVersion: 2, actorId: 94600 },
		{ label: 'schema v3 元数据与实际表不一致', schemaVersion: 3, actorId: 94610 },
		{ label: 'schema v4 元数据与实际表不一致', schemaVersion: 4, actorId: 94620 },
	];
	for (const scenario of scenarios) {
		resetCalls();
		sandbox.fetch = adFetchMock();
		const db = makeAdD1({ porn: ['大婆啦'] }, { schemaVersion: scenario.schemaVersion, relayTableExists: false, voteTableExists: false, voteAllowlistTableExists: false });
		const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
		await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message: {
			message_id: scenario.actorId, chat: { id: -1001, type: 'supergroup' },
			from: { id: scenario.actorId, is_bot: false, first_name: '正常回复者' },
			sticker: { file_id: 'schema-observation-sticker', emoji: '👍' }, reply_to_message: { message_id: scenario.actorId - 1, from: { id: scenario.actorId + 1, is_bot: false, first_name: '原广告作者' }, text: '📢 大婆啦 广告内容' },
		} }) }), env, fakeCtxAd);
		const ownerNotice = callsOf('sendMessage').find((call) => String(call.body.chat_id) === '999');
		assert(`${scenario.label} → 自动升级或保持 schema v4`, db._schema.version === 4);
		assert(`${scenario.label} → 引用观察表按需补建且只执行一次专用 DDL`, db._schema.relayTableExists && !db._schema.voteTableExists && !db._schema.voteAllowlistTableExists && db._schema.schemaExecCount === 1);
		assert(`${scenario.label} → 首次引用观察成功写入 D1`, db._relayObservations.get(String(scenario.actorId))?.occurrences === 1);
		assert(`${scenario.label} → 主人通知显示观察次数 1、无缺表错误`, !!ownerNotice && ownerNotice.body.text.includes('观察次数:1') && !ownerNotice.body.text.includes('D1 观察记录失败'));
		assert(`${scenario.label} → 贴纸误触者受保护，原广告作者照常全群封禁`, !db._rows.has(String(scenario.actorId)) && db._rows.get(String(scenario.actorId + 1))?.reason === 'ad_auto' && callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((call) => String(call.body.user_id) === String(scenario.actorId + 1)));
	}
}

// ---------- [81h2] D1 投票表独立迁移与失败阻断 ----------
console.log('\n[81h2] D1 投票表独立迁移与失败阻断');
{
	resetCalls();
	sandbox.fetch = adFetchMock();
	const db = makeAdD1({}, {
		schemaVersion: 3,
		relayTableExists: true,
		voteTableExists: false,
		voteAllowlistTableExists: false,
		failSchemaSqlIncludes: ['CREATE INDEX IF NOT EXISTS idx_blacklist_at_id'],
	});
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db };
	const response = await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: {
			message_id: 94690,
			chat: { id: -1001, type: 'supergroup', title: 'D1迁移测试群' },
			from: { id: 999, is_bot: false, first_name: '主人' },
			text: '/ad 94691 D1旧库迁移测试',
		} }),
	}), env, fakeCtxAd);
	assert('旧 schema v3 的可选旧索引失败 → webhook 仍返回成功', response.status === 200);
	assert('旧 schema v3 的可选旧索引失败 → 独立补建 D1 投票表与白名单表', db._schema.version === 4 && db._schema.voteTableExists && db._schema.voteAllowlistTableExists);
	assert('旧 schema v3 的可选旧索引失败 → /ad 仍成功写入 D1 投票', db._adVotes.size === 1 && callsOf('sendMessage').some((call) => call.body.text.includes('广告举报投票')));

	resetCalls();
	sandbox.fetch = adFetchMock();
	const brokenDb = makeAdD1({}, {
		schemaVersion: 4,
		relayTableExists: true,
		voteTableExists: false,
		voteAllowlistTableExists: false,
		failSchemaSqlIncludes: ['CREATE TABLE IF NOT EXISTS ad_votes'],
	});
	const brokenEnv = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: brokenDb };
	const brokenResponse = await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: {
			message_id: 94692,
			chat: { id: -1001, type: 'supergroup', title: 'D1失败测试群' },
			from: { id: 999, is_bot: false, first_name: '主人' },
			text: '/ad 94693 D1失败阻断测试',
		} }),
	}), brokenEnv, fakeCtxAd);
	const queriedMissingVoteTable = brokenDb._sql.some((sql) => sql.includes('FROM ad_votes') || sql.startsWith('INSERT INTO ad_votes'));
	assert('D1 投票表建表失败 → webhook 受控返回且不抛 no such table 500', brokenResponse.status === 200 && brokenDb._adVotes.size === 0);
	assert('D1 投票表建表失败 → 停止查询缺失表并返回明确提示', !queriedMissingVoteTable && callsOf('sendMessage').some((call) => call.body.text.includes('D1 投票存储初始化失败')));
	assert('投票持久化保持纯 D1 → Worker 不包含 env.KV', !src.includes('env.KV') && src.includes('CREATE TABLE IF NOT EXISTS ad_votes'));
}
// ---------- [81i] 引用高危词语境、广告意图与原作者安全门 ----------
console.log('\n[81i] 引用高危词语境与原作者安全门');
{
	const routes = {
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => String(b.chat_id).startsWith('-')
			? ({ ok: true, result: { id: Number(b.chat_id), title: '引用语境测试群', type: 'supergroup' } })
			: ({ ok: true, result: { id: Number(b.chat_id), first_name: '正常用户', type: 'private' } }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	};
	const makeEnv = (db) => ({
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: '-1001,-1002',
		OWNER_IDS: '999',
		AD_FILTER_ENABLED: 'true',
		DB: db,
	});
	const dispatch = async (message, env) => {
		await handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify({ message }),
		}), env, fakeCtxAd);
	};

	resetCalls();
	sandbox.fetch = makeFetchMock(routes);
	let db = makeAdD1({ fraud: ['办证'] });
	let env = makeEnv(db);
	await dispatch({
		message_id: 94700,
		chat: { id: -1001, type: 'supergroup', title: '引用语境测试群' },
		from: { id: 6221059640, is_bot: false, first_name: 'John Smith' },
		text: 'tg嘛',
		reply_to_message: {
			message_id: 94699,
			from: { id: 1335910695, is_bot: false, first_name: 'My fuhrer' },
			text: '后面马上有两个人给我私信办证的',
		},
	}, env);
	assert('本次误封原话 → 当前回复者不加黑', !db._rows.has('6221059640'));
	assert('本次误封原话 → 被引用原作者不加黑', !db._rows.has('1335910695'));
	assert('本次误封原话 → 不删除、不观察、不执行全群封禁', callsOf('deleteMessage').length === 0 && !db._relayObservations.has('6221059640') && callsOf('banChatMember').length === 0);
	assert('本次误封原话 → 不产生广告处理通知', callsOf('sendMessage').length === 0);

	const normalContextCases = [
		{ label: '被动收到私信', quote: '有人给我私信办证' },
		{ label: '收到广告经历', quote: '我收到办证广告了' },
		{ label: '材料提问', quote: '办证需要什么材料' },
		{ label: '举报警告', quote: '这是骗子，别信' },
		{ label: '中性讨论', quote: '我刚才只是提到办证这个词' },
	];
	for (const [index, scenario] of normalContextCases.entries()) {
		resetCalls();
		sandbox.fetch = makeFetchMock(routes);
		db = makeAdD1({ fraud: ['办证', '骗子'] });
		env = makeEnv(db);
		const actorId = String(94710 + index * 2);
		const originalId = String(94711 + index * 2);
		await dispatch({
			message_id: 94710 + index,
			chat: { id: -1001, type: 'supergroup', title: '引用语境测试群' },
			from: { id: Number(actorId), is_bot: false, first_name: '正常回复者' },
			text: '这句话什么意思',
			reply_to_message: {
				message_id: 94600 + index,
				from: { id: Number(originalId), is_bot: false, first_name: '正常讨论者' },
				text: scenario.quote,
			},
		}, env);
		assert(`${scenario.label} → 当前回复者与原作者均不加黑`, !db._rows.has(actorId) && !db._rows.has(originalId));
		assert(`${scenario.label} → 不删除、不观察、不全群封禁`, callsOf('deleteMessage').length === 0 && !db._relayObservations.has(actorId) && callsOf('banChatMember').length === 0);
	}

	resetCalls();
	sandbox.fetch = makeFetchMock(routes);
	db = makeAdD1({ fraud: ['办证'] });
	env = makeEnv(db);
	await dispatch({
		message_id: 94730,
		chat: { id: -1001, type: 'supergroup', title: '引用语境测试群' },
		from: { id: 94730, is_bot: false, first_name: '正常回复者' },
		text: '这是什么',
		reply_to_message: {
			message_id: 94729,
			from: { id: 94731, is_bot: false, first_name: '广告原作者' },
			text: '专业办证500元，联系我',
		},
	}, env);
	assert('高危词+专业/价格/联系方式 → 原作者立即写入全局黑名单', db._rows.get('94731')?.reason === 'ad_auto');
	assert('高危词+专业/价格/联系方式 → 当前首次普通回复只观察不加黑', !db._rows.has('94730') && db._relayObservations.get('94730')?.occurrences === 1);
	assert('高危词+专业/价格/联系方式 → 删除引用消息并只全群封禁原作者', callsOf('deleteMessage').some((call) => call.body.message_id === 94730) && callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((call) => String(call.body.user_id) === '94731'));

	resetCalls();
	sandbox.fetch = makeFetchMock(routes);
	db = makeAdD1({ fraud: ['办证'] });
	env = makeEnv(db);
	await dispatch({
		message_id: 94740,
		chat: { id: -1001, type: 'supergroup', title: '引用语境测试群' },
		from: { id: 94740, is_bot: false, first_name: '包装传播者' },
		text: 'p',
		reply_to_message: {
			message_id: 94739,
			from: { id: 94741, is_bot: false, first_name: '广告原作者' },
			text: '专业办证500元，联系我',
		},
	}, env);
	const immediateTargets = new Set(callsOf('banChatMember').map((call) => String(call.body.user_id)));
	assert('p 包装明确办证广告 → 当前传播者与原作者首次都加黑', db._rows.has('94740') && db._rows.has('94741'));
	assert('p 包装明确办证广告 → 两人都执行全部 GROUP_ID 封禁', callsOf('banChatMember').length === 4 && immediateTargets.size === 2 && immediateTargets.has('94740') && immediateTargets.has('94741'));
	assert('p 包装明确办证广告 → 当前传播者不进入观察表', !db._relayObservations.has('94740'));

	resetCalls();
	sandbox.fetch = makeFetchMock(routes);
	db = makeAdD1({ general: ['代办业务', '证件渠道'] });
	env = makeEnv(db);
	await dispatch({
		message_id: 94750,
		chat: { id: -1001, type: 'supergroup', title: '引用语境测试群' },
		from: { id: 94750, is_bot: false, first_name: '普通回复者' },
		text: '这是什么',
		reply_to_message: {
			message_id: 94749,
			from: { id: 94751, is_bot: false, first_name: '原消息作者' },
			text: '代办业务 证件渠道',
		},
	}, env);
	const weakNotice = callsOf('sendMessage').find((call) => String(call.body.chat_id) === '999');
	assert('仅普通词库弱评分 → 原作者不自动加黑或全群封禁', !db._rows.has('94751') && callsOf('banChatMember').length === 0);
	assert('仅普通词库弱评分 → 当前回复者只删除，不观察、不封禁', !db._rows.has('94750') && !db._relayObservations.has('94750') && callsOf('deleteMessage').some((call) => call.body.message_id === 94750));
	assert('仅普通词库弱评分 → 主人通知明确说明未联动原作者', !!weakNotice && weakNotice.body.text.includes('当前仅为弱评分证据，未自动联动封禁'));
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

// ---------- [83] 代理相关内容绝对豁免与安全边界 ----------
console.log('\n[83] 代理相关内容绝对豁免与安全边界');
{
	const makeProxyTestEnv = (db) => ({
		TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999',
		AD_FILTER_ENABLED: 'true', MSG_CACHE_ENABLED: 'true', DB: db,
	});
	const dispatchMessage = async (message, env, ctx) => handler.fetch(
		new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message }) }),
		env,
		ctx
	);

	// 用户截图原文：短正文 + SOCKS5 引用内容不得触发“引用 @ 引流泛滥”或其它自动广告规则。
	resetCalls();
	sandbox.fetch = adFetchMock();
	let db = makeAdD1();
	let env = makeProxyTestEnv(db);
	await dispatchMessage({
		message_id: 93001,
		chat: { id: -1001, type: 'supergroup', title: '代理讨论群' },
		from: { id: 93001, is_bot: false, first_name: '普通用户' },
		text: '缺s5做代理池',
		quote: {
			text: 'socks5 OTC独家资源分享\nsocks5://888:888@47.243.87.133:1080#HK The Peak机房/机房\nAS45102 Alibaba(US) Tech',
		},
	}, env);
	assert('截图原文代理内容 → 不加黑、不删消息、不全群封禁',
		!db._rows.has('93001') && callsOf('deleteMessage').length === 0 && callsOf('banChatMember').length === 0);

	// 主消息中的代理链接本来会因 URL/长数字进入 recent_messages；豁免后必须完全不进疑似广告缓存。
	resetCalls();
	sandbox.fetch = adFetchMock();
	db = makeAdD1();
	env = makeProxyTestEnv(db);
	await dispatchMessage({
		message_id: 93002,
		chat: { id: -1001, type: 'supergroup' },
		from: { id: 93002, is_bot: false, first_name: '普通用户' },
		text: 'socks5://888:888@47.243.87.133:1080#HK The Peak',
	}, env);
	const proxyRecent = JSON.parse(db._store.get('recent_messages') || '{"items":[]}');
	assert('代理链接 → 不进入 recent_messages 疑似广告缓存', proxyRecent.items.length === 0);

	// 每个案例都混入足以触发广告评分的词，验证命中任一代理协议/客户端/配置后仍是“整条绝对豁免”。
	const proxyCases = [
		{ label: 'SOCKS4', content: 'SOCKS4 47.0.0.1:1080' },
		{ label: 'SOCKS5简称', content: 'S5 47.0.0.1:1080' },
		{ label: 'HTTP(S)', content: 'HTTP(S)' },
		{ label: 'SS', content: 'SS' },
		{ label: 'SSR', content: 'SSR' },
		{ label: 'VMess', content: 'vmess://encoded-node' },
		{ label: 'VLESS', content: 'vless://uuid@edge.example.com:443' },
		{ label: 'Trojan', content: 'trojan://password@edge.example.com:443' },
		{ label: 'Hysteria', content: 'Hysteria2 hy2://token@edge.example.com:443' },
		{ label: 'TUIC', content: 'tuic://uuid:password@edge.example.com:443' },
		{ label: 'WireGuard', content: 'WireGuard 配置' },
		{ label: 'Clash', content: 'Clash Verge' },
		{ label: 'Mihomo', content: 'Mihomo' },
		{ label: 'v2rayN', content: 'v2rayN' },
		{ label: 'NekoRay', content: 'NekoRay' },
		{ label: 'sing-box', content: 'sing-box' },
		{ label: 'Shadowrocket', content: 'Shadowrocket' },
		{ label: 'Surge', content: 'Surge' },
		{ label: 'Loon', content: 'Loon' },
		{ label: 'Quantumult X', content: 'Quantumult X' },
		{ label: 'Hiddify', content: 'Hiddify' },
		{ label: '中文代理范围', content: '代理池 节点 机场 订阅器 订阅生成器' },
		{ label: 'Subconverter', content: 'Subconverter' },
		{ label: 'Sub-Store', content: 'Sub-Store' },
		{ label: '反代', content: '反代 reverse proxy' },
		{ label: 'ProxyIP', content: 'CF ProxyIP' },
		{ label: 'TURN', content: 'TURN relay' },
		{ label: 'STUN', content: 'STUN server' },
		{ label: 'WebRTC中继', content: 'WebRTC 中继' },
		{ label: 'user:pass@host', content: 'user:pass@edge.example.com:1443' },
		{ label: '常见代理端口', content: '47.243.87.133:1080' },
		{ label: '代理端点列表', content: 'edge-a.example.com:23456 edge-b.example.com:34567' },
		{
			label: '代理配置附件名',
			content: '',
			extra: { document: { file_id: 'doc1', file_name: 'clash-proxy-providers.yaml' } },
		},
		{
			label: '订阅 text_link',
			content: '点击链接',
			extra: {
				entities: [{
					type: 'text_link', offset: 0, length: 4,
					url: 'https://edge.example.com/api/v1/client/subscribe?token=abc',
				}],
			},
		},
	];
	const proxyCaseFailures = [];
	for (let i = 0; i < proxyCases.length; i++) {
		resetCalls();
		sandbox.fetch = adFetchMock();
		db = makeAdD1();
		env = makeProxyTestEnv(db);
		const proxyCase = proxyCases[i];
		const userId = String(93100 + i);
		await dispatchMessage({
			message_id: 93100 + i,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: Number(userId), is_bot: false, first_name: '普通用户' },
			text: '专业出u承兑日入过万 ' + proxyCase.content,
			...(proxyCase.extra || {}),
		}, env);
		if (
			db._rows.has(userId) ||
			callsOf('deleteMessage').some((call) => call.body.message_id === 93100 + i) ||
			callsOf('banChatMember').some((call) => String(call.body.user_id) === userId)
		) {
			proxyCaseFailures.push(proxyCase.label);
		}
	}
	assert('代理协议、客户端、订阅转换、反代及端点格式 → 即使含广告词也全部豁免',
		proxyCaseFailures.length === 0, proxyCaseFailures.join(','));

	// 即使这条代理内容已经被学习成广告指纹，代理豁免仍必须早于学习样本精确匹配。
	resetCalls();
	sandbox.fetch = adFetchMock();
	db = makeAdD1();
	const learnedProxyText = 'socks5://888:888@47.243.87.133:1080 假钞交流群';
	db._store.set('ad_samples', JSON.stringify(trustedSampleData([learnedProxyText], 'proxy-test')));
	env = makeProxyTestEnv(db);
	await dispatchMessage({
		message_id: 93200,
		chat: { id: -1001, type: 'supergroup' },
		from: { id: 93200, is_bot: false, first_name: '普通用户' },
		text: learnedProxyText,
	}, env);
	assert('已存在于学习样本的代理内容 → 仍不加黑、不删、不封',
		!db._rows.has('93200') && callsOf('deleteMessage').length === 0 && callsOf('banChatMember').length === 0);

	// 代理识别只看消息内容，不看发送者身份；名字含客户端名不能让真正广告获得豁免。
	resetCalls();
	sandbox.fetch = adFetchMock();
	db = makeAdD1();
	env = makeProxyTestEnv(db);
	await dispatchMessage({
		message_id: 93201,
		chat: { id: -1001, type: 'supergroup' },
		from: { id: 93201, is_bot: false, first_name: 'Clash 技术用户' },
		text: '专业出u承兑日入过万',
	}, env);
	assert('仅发送者名字含 Clash、正文是真广告 → 仍正常自动封禁',
		db._rows.has('93201') && callsOf('banChatMember').length === 2);

	// 真正的非代理 Telegram @账号泛滥规则必须保持原行为。
	resetCalls();
	sandbox.fetch = adFetchMock();
	db = makeAdD1();
	env = makeProxyTestEnv(db);
	await dispatchMessage({
		message_id: 93202,
		chat: { id: -1001, type: 'supergroup' },
		from: { id: 93202, is_bot: false, first_name: '引流用户' },
		text: 'k',
		quote: { text: '@promo_bot @promo_bot @promo_bot 高薪兼职' },
	}, env);
	assert('非代理重复 Telegram @账号引流 + 无意义包装 → 第一次直接全局封禁且不观察',
		db._rows.has('93202') && callsOf('banChatMember').length === 2 && !db._relayObservations.has('93202'));

	// 黑名单拦截在代理豁免之前：已在 D1 的用户发代理内容仍必须删消息并踢出当前群。
	resetCalls();
	sandbox.fetch = adFetchMock();
	db = makeFakeDB([{ id: '93203', reason: 'manual', by: '999', at: '2026-07-23T00:00:00.000Z' }]);
	env = makeProxyTestEnv(db);
	await dispatchMessage({
		message_id: 93203,
		chat: { id: -1001, type: 'supergroup', title: '主群' },
		from: { id: 93203, is_bot: false, first_name: '黑名单用户' },
		text: 'socks5://user:pass@47.243.87.133:1080',
	}, env);
	assert('D1 黑名单用户发送代理内容 → 仍删消息、踢当前群且保留黑名单',
		db._rows.has('93203') &&
		callsOf('deleteMessage').some((call) => call.body.message_id === 93203) &&
		callsOf('banChatMember').some((call) => String(call.body.user_id) === '93203'));
}


// ---------- [84] /ad 六票通过、改投、去重与全群封禁 ----------
console.log('\n[84] /ad 投票主链');
{
	let nextVoteMessageId = 5000;
	const groupAdmins = new Set(['999']);
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getMe: () => ({ ok: true, result: { id: 123456789, is_bot: true, username: 'TestBot' } }),
		getChatAdministrators: () => ({
			ok: true,
			result: [...groupAdmins].map((id) => ({
				user: { id: Number(id), is_bot: false, first_name: id === '999' ? '主人' : '群管理员' },
				status: id === '999' ? 'creator' : 'administrator',
			})),
		}),
		getChatMember: (body) => {
			const id = String(body.user_id);
			const isAdmin = groupAdmins.has(id);
			return {
				ok: true,
				result: {
					status: isAdmin ? (id === '999' ? 'creator' : 'administrator') : 'member',
					user: { id: Number(id), is_bot: false, first_name: isAdmin ? '群管理员' : '普通成员' },
				},
			};
		},
		getUserChatBoosts: () => ({ ok: true, result: { boosts: [{ boost_id: 'paid-but-not-trusted' }] } }),
		getChat: (body) => ({ ok: true, result: { id: Number(body.chat_id), title: String(body.chat_id).startsWith('-') ? '投票测试群' : undefined, first_name: '普通用户', type: String(body.chat_id).startsWith('-') ? 'supergroup' : 'private' } }),
		sendMessage: (body) => ({
			ok: true,
			result: { message_id: Number(body.chat_id) < 0 ? nextVoteMessageId++ : 9000 },
		}),
		editMessageText: () => ({ ok: true, result: true }),
		answerCallbackQuery: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true }),
		banChatMember: () => ({ ok: true, result: true }),
	});
	const db = makeAdD1();
	db._adVoteAllowlist.set('95000', { user_id: '95000', by_user: '999', at: '2026-08-07T00:00:00.000Z' });
	const env = {
		TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002',
		OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: db,
	};
	const dispatch = async (update) => handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify(update),
	}), env, fakeCtxAd);
	await dispatch({ message: {
		message_id: 94999,
		chat: { id: -1001, type: 'supergroup', title: '投票测试群' },
		from: { id: 95099, is_bot: false, first_name: '群助推普通成员' },
		text: '/ad 95010 无权发起测试',
	} });
	assert('/ad 助推普通成员未进白名单 → 不能发起且群内完全静默', db._adVotes.size === 0 && callsOf('sendMessage').length === 0 && callsOf('pinChatMessage').length === 0);
	resetCalls();
	const initialAdCommandDate = Math.floor(Date.now() / 1000);
	await dispatch({ message: {
		message_id: 95000,
		date: initialAdCommandDate,
		chat: { id: -1001, type: 'supergroup', title: '投票测试群' },
		from: { id: 95000, is_bot: false, first_name: '白名单发起人' },
		text: '/ad 广告引流',
		reply_to_message: {
			message_id: 95010,
			chat: { id: -1001, type: 'supergroup' },
			from: { id: 95010, is_bot: false, first_name: '被举报用户' },
			text: '被举报的广告内容',
		},
	} });
	assert('/ad 第一主人白名单成员 → 成功创建一条 D1 投票', db._adVotes.size === 1);
	const voteRow = [...db._adVotes.values()][0];
	let voteState = JSON.parse(voteRow.state_json);
	assert('/ad 白名单成员发起 → 身份记录为举报白名单成员', voteState.initiatorRole === '举报白名单成员');
	assert('/ad 新投票 → 保存来源群名与原命令标识', voteState.chatTitle === '投票测试群' && voteState.commandMessageId === 95000 && voteState.commandDate === initialAdCommandDate);
	assert('/ad 发起者 → 自动计入第一张赞成票且阈值为 6', voteState.approvers.length === 1 && voteState.approvers[0].id === '95000' && voteState.threshold === 6);
	assert('/ad 回复模式 → 举报原因写入 D1 状态并显示在投票消息', voteState.reason === '广告引流' && callsOf('sendMessage').some((call) => Number(call.body.chat_id) === -1001 && call.body.text.includes('举报原因') && call.body.text.includes('广告引流')));
	assert('/ad 回复模式 → 投票卡片回复原被举报消息', callsOf('sendMessage').some((call) => Number(call.body.chat_id) === -1001 && call.body.reply_to_message_id === 95010));
	assert('/ad 成功投票消息 → 是非主人群静默规则的唯一可见投票回执并含取消按钮', callsOf('sendMessage').filter((call) => Number(call.body.chat_id) < 0).length === 1 && callsOf('sendMessage').some((call) => Number(call.body.chat_id) === -1001 && call.body.reply_markup?.inline_keyboard?.length === 2 && call.body.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === 'adv:C:' + voteState.voteToken)));
	assert('/ad 创建成功 → 自动静默置顶投票消息', callsOf('pinChatMessage').some((call) => Number(call.body.chat_id) === -1001 && call.body.message_id === voteState.messageId && call.body.disable_notification === true));

	const replayCounts = {
		send: callsOf('sendMessage').length,
		remove: callsOf('deleteMessage').length,
		pin: callsOf('pinChatMessage').length,
	};
	await dispatch({ message: {
		message_id: 95000,
		date: initialAdCommandDate,
		chat: { id: -1001, type: 'supergroup', title: '投票测试群' },
		from: { id: 95000, is_bot: false, first_name: '白名单发起人' },
		text: '/ad 广告引流',
		reply_to_message: { message_id: 95010, from: { id: 95010, is_bot: false, first_name: '被举报用户' }, text: '被举报的广告内容' },
	} });
	assert('/ad 相同 message_id 重投 → 完全静默且不重复删消息、发消息或置顶', db._adVotes.size === 1 && callsOf('sendMessage').length === replayCounts.send && callsOf('deleteMessage').length === replayCounts.remove && callsOf('pinChatMessage').length === replayCounts.pin);

	const staleCounts = {
		send: callsOf('sendMessage').length,
		remove: callsOf('deleteMessage').length,
		pin: callsOf('pinChatMessage').length,
	};
	await dispatch({ message: {
		message_id: 94998,
		date: initialAdCommandDate - 31,
		chat: { id: -1001, type: 'supergroup', title: '投票测试群' },
		from: { id: 95000, is_bot: false, first_name: '白名单发起人' },
		text: '/ad 95011 旧命令测试',
	} });
	assert('/ad 超过 30 秒的旧命令 → HTTP 正常消费但完全不触发', db._adVotes.size === 1 && callsOf('sendMessage').length === staleCounts.send && callsOf('deleteMessage').length === staleCounts.remove && callsOf('pinChatMessage').length === staleCounts.pin);

	const queuedCounts = {
		send: callsOf('sendMessage').length,
		remove: callsOf('deleteMessage').length,
		pin: callsOf('pinChatMessage').length,
	};
	await dispatch({ message: {
		message_id: 94997,
		date: Math.max(1, voteState.createdAt - 1),
		chat: { id: -1001, type: 'supergroup', title: '投票测试群' },
		from: { id: 95000, is_bot: false, first_name: '白名单发起人' },
		text: '/ad 广告引流',
		reply_to_message: { message_id: 95010, from: { id: 95010, is_bot: false, first_name: '被举报用户' }, text: '被举报的广告内容' },
	} });
	assert('/ad 发送时间早于现有投票的积压命令 → 完全静默忽略', db._adVotes.size === 1 && callsOf('sendMessage').length === queuedCounts.send && callsOf('deleteMessage').length === queuedCounts.remove && callsOf('pinChatMessage').length === queuedCounts.pin);

	const freshDuplicateSendCount = callsOf('sendMessage').length;
	await dispatch({ message: {
		message_id: 95001,
		date: Math.max(initialAdCommandDate, Math.floor(Date.now() / 1000)),
		chat: { id: -1001, type: 'supergroup', title: '投票测试群' },
		from: { id: 95000, is_bot: false, first_name: '白名单发起人' },
		text: '/ad 广告引流',
		reply_to_message: { message_id: 95010, from: { id: 95010, is_bot: false, first_name: '被举报用户' }, text: '被举报的广告内容' },
	} });
	assert('/ad 同群同目标重复发起 → 仍只有一条进行中投票', db._adVotes.size === 1);
	assert('/ad 真正新发送的重复命令 → 仍保留进行中投票提示', callsOf('sendMessage').length > freshDuplicateSendCount && callsOf('sendMessage').slice(freshDuplicateSendCount).some((call) => call.body.text.includes('当前群已存在针对该用户的进行中投票')));

	const voteToken = voteState.voteToken;
	const voteMessageId = voteState.messageId;
	const click = async (userId, action, suffix) => dispatch({ callback_query: {
		id: 'vote-' + suffix,
		from: { id: userId, is_bot: false, first_name: '投票成员' + userId },
		message: { message_id: voteMessageId, chat: { id: -1001, type: 'supergroup' } },
		data: 'adv:' + action + ':' + voteToken,
	} });
	await click(95001, 'A', 'a1');
	await click(95001, 'R', 'r1');
	voteState = JSON.parse([...db._adVotes.values()][0].state_json);
	assert('/ad 普通成员改投 → 从赞成移到反对且不重复计票', voteState.approvers.length === 1 && voteState.rejecters.length === 1 && voteState.rejecters[0].id === '95001');
	await click(95001, 'A', 'a2');
	for (const voterId of [95002, 95003, 95004, 95005]) await click(voterId, 'A', String(voterId));

	voteState = JSON.parse([...db._adVotes.values()][0].state_json);
	assert('/ad 达到 6 票 → 投票结束并记录 approved/enforcementComplete', voteState.finalized === true && voteState.result === 'approved' && voteState.enforcementComplete === true);
	assert('/ad 通过 → 目标写入 D1 全局黑名单，原因 ad_vote', db._rows.get('95010')?.reason === 'ad_vote');
	assert('/ad 通过 → 举报原因写入 D1 黑名单备注', db._rows.get('95010')?.note?.includes('广告引流'));
	assert('/ad 通过 → 遍历全部 GROUP_ID 封禁目标并撤回各群全部历史发言', callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((call) => String(call.body.user_id) === '95010' && call.body.revoke_messages === true));
	assert('/ad 通过 → 删除最初被举报消息', callsOf('deleteMessage').some((call) => Number(call.body.chat_id) === -1001 && call.body.message_id === 95010));
	assert('/ad 通过 → 完整结果只私聊第一主人并说明来源群、原因与历史发言撤回', callsOf('sendMessage').some((call) => String(call.body.chat_id) === '999' && call.body.text.includes('广告举报投票已通过') && call.body.text.includes('95010') && call.body.text.includes('来源群:<b>投票测试群</b>') && call.body.text.includes('-1001') && call.body.text.includes('广告引流') && call.body.text.includes('revoke_messages=true')));
	assert('/ad 通过完成 → 自动取消投票消息置顶', callsOf('unpinChatMessage').some((call) => Number(call.body.chat_id) === -1001 && call.body.message_id === voteState.messageId));
}

// ---------- [84b] /ad 管理员否决、过期与保护目标 ----------
console.log('\n[84b] /ad 防滥用边界');
{
	const makeVoteHarness = (options = {}) => {
		let nextVoteMessageId = 6000;
		const adminIds = new Set(['999', '6666']);
		resetCalls();
		sandbox.fetch = makeFetchMock({
			getMe: () => ({ ok: true, result: { id: 123456789, is_bot: true, username: 'TestBot' } }),
			getChatAdministrators: () => ({
				ok: true,
				result: [
					{ user: { id: 999, is_bot: false, first_name: '主人' }, status: 'creator' },
					{ user: { id: 6666, is_bot: false, first_name: '群管理员' }, status: 'administrator' },
				],
			}),
			getChatMember: (body) => {
				const id = String(body.user_id);
				const isAdmin = adminIds.has(id);
				return {
					ok: true,
					result: {
						status: isAdmin ? (id === '999' ? 'creator' : 'administrator') : 'member',
						user: { id: Number(id), is_bot: id === '123456789', first_name: isAdmin ? '群管理员' : '普通成员' },
					},
				};
			},
			getUserChatBoosts: () => ({ ok: true, result: { boosts: [] } }),
			getChat: (body) => ({ ok: true, result: { id: Number(body.chat_id), title: String(body.chat_id).startsWith('-') ? '投票边界群' : undefined, first_name: '普通用户', type: String(body.chat_id).startsWith('-') ? 'supergroup' : 'private' } }),
			sendMessage: (body) => ({ ok: true, result: { message_id: Number(body.chat_id) < 0 ? nextVoteMessageId++ : 9100 } }),
			editMessageText: () => ({ ok: true, result: true }),
			answerCallbackQuery: () => ({ ok: true, result: true }),
			pinChatMessage: () => options.pinFails ? ({ ok: false, description: 'Bad Request: not enough rights to pin a message' }) : ({ ok: true, result: true }),
			unpinChatMessage: () => ({ ok: true, result: true }),
			deleteMessage: () => ({ ok: true, result: true }),
			banChatMember: () => ({ ok: true, result: true }),
		});
		const db = makeAdD1();
		db._adVoteAllowlist.set('96000', { user_id: '96000', by_user: '999', at: '2026-08-07T00:00:00.000Z' });
		const env = {
			TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002',
			OWNER_IDS: '999,998', SUPER_ADMINS: '7777',
			AD_FILTER_ENABLED: 'true', DB: db,
		};
		const dispatch = async (update) => handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify(update),
		}), env, fakeCtxAd);
		const start = async (targetId, messageId, reason = '小孩哥') => dispatch({ message: {
			message_id: messageId - 1,
			chat: { id: -1001, type: 'supergroup', title: '投票边界群' },
			from: { id: 96000, is_bot: false, first_name: '白名单发起人' },
			text: '/ad ' + reason,
			reply_to_message: { message_id: messageId, from: { id: targetId, is_bot: false, first_name: '被举报用户' }, text: '被举报内容' },
		} });
		const readState = () => {
			const row = [...db._adVotes.values()][0];
			return row ? JSON.parse(row.state_json) : null;
		};
		const click = async (userId, action, suffix) => {
			const state = readState();
			return dispatch({ callback_query: {
				id: 'edge-' + suffix,
				from: { id: userId, is_bot: false, first_name: '投票者' },
				message: { message_id: state.messageId, chat: { id: -1001, type: 'supergroup' } },
				data: 'adv:' + action + ':' + state.voteToken,
			} });
		};
		return { db, env, dispatch, start, readState, click };
	};

	let harness = makeVoteHarness();
	await harness.start(96010, 96011);
	await harness.click(6666, 'R', 'admin-veto');
	let state = harness.readState();
	assert('/ad 当前群管理员反对 → 一票否决并结束投票', state.finalized === true && state.result === 'rejected' && callsOf('answerCallbackQuery').some((call) => call.body.text.includes('一票否决')));
	assert('/ad 管理员一票否决 → 不加黑、不删被举报消息、不执行全群封禁', !harness.db._rows.has('96010') && !callsOf('deleteMessage').some((call) => call.body.message_id === 96011) && callsOf('banChatMember').length === 0);
	assert('/ad 管理员一票否决 → 自动取消投票消息置顶', callsOf('unpinChatMessage').some((call) => call.body.message_id === state.messageId));
	const rejectedOwnerDm = callsOf('sendMessage').find((call) => String(call.body.chat_id) === '999' && call.body.text.includes('广告举报投票已被否决'));
	assert('/ad 否决 → 完整结果只私聊第一主人并显示来源群名', !!rejectedOwnerDm && rejectedOwnerDm.body.text.includes('96010') && rejectedOwnerDm.body.text.includes('来源群:<b>投票边界群</b>') && rejectedOwnerDm.body.text.includes('-1001') && rejectedOwnerDm.body.text.includes('小孩哥') && rejectedOwnerDm.body.text.includes('一票否决') && rejectedOwnerDm.body.text.includes('未写入 D1') && !callsOf('sendMessage').some((call) => String(call.body.chat_id) === '998' && call.body.text.includes('广告举报投票已被否决')));

	harness = makeVoteHarness();
	await harness.start(96020, 96021);
	const expiredRow = [...harness.db._adVotes.values()][0];
	const expiredState = JSON.parse(expiredRow.state_json);
	expiredState.deadlineAt = Math.floor(Date.now() / 1000) - 1;
	expiredRow.deadline_at = expiredState.deadlineAt;
	expiredRow.state_json = JSON.stringify(expiredState);
	await harness.click(96001, 'A', 'expired');
	state = harness.readState();
	assert('/ad 超过 1 小时 → 自动结束为 expired', state.finalized === true && state.result === 'expired' && callsOf('answerCallbackQuery').some((call) => call.body.text.includes('超过 1 小时')));
	assert('/ad 过期 → 目标不加黑、不删除、不全群封禁', !harness.db._rows.has('96020') && !callsOf('deleteMessage').some((call) => call.body.message_id === 96021) && callsOf('banChatMember').length === 0);
	assert('/ad 过期 → 自动取消投票消息置顶', callsOf('unpinChatMessage').some((call) => call.body.message_id === state.messageId));
	const expiredOwnerDm = callsOf('sendMessage').find((call) => String(call.body.chat_id) === '999' && call.body.text.includes('广告举报投票已过期'));
	assert('/ad 过期 → 完整结果只私聊第一主人', !!expiredOwnerDm && expiredOwnerDm.body.text.includes('96020') && expiredOwnerDm.body.text.includes('最终票数') && expiredOwnerDm.body.text.includes('未写入 D1') && !callsOf('sendMessage').some((call) => String(call.body.chat_id) === '998' && call.body.text.includes('广告举报投票已过期')));

	harness = makeVoteHarness();
	await harness.start(96030, 96031, '小孩哥');
	await harness.click(96001, 'C', 'unauthorized-cancel');
	state = harness.readState();
	assert('/ad 普通成员不能恶意取消他人发起的投票', state.finalized === false && callsOf('answerCallbackQuery').some((call) => call.body.text.includes('仅发起人')));
	await harness.click(96000, 'C', 'creator-cancel');
	state = harness.readState();
	assert('/ad 发起人取消 → 记录 cancelled 和取消人并结束投票', state.finalized === true && state.result === 'cancelled' && state.cancelledBy?.id === '96000');
	assert('/ad 取消 → 不加黑、不删除被举报消息、不执行全群封禁', !harness.db._rows.has('96030') && !callsOf('deleteMessage').some((call) => call.body.message_id === 96031) && callsOf('banChatMember').length === 0);
	assert('/ad 取消 → 最终消息保留举报原因并显示已取消', callsOf('editMessageText').some((call) => call.body.text.includes('举报原因') && call.body.text.includes('小孩哥') && call.body.text.includes('投票已取消')));
	assert('/ad 取消 → 自动取消投票消息置顶', callsOf('unpinChatMessage').some((call) => call.body.message_id === state.messageId));
	const cancelledOwnerDm = callsOf('sendMessage').find((call) => String(call.body.chat_id) === '999' && call.body.text.includes('广告举报投票已取消'));
	assert('/ad 取消 → 完整结果只私聊第一主人并显示来源群名', !!cancelledOwnerDm && cancelledOwnerDm.body.text.includes('96030') && cancelledOwnerDm.body.text.includes('来源群:<b>投票边界群</b>') && cancelledOwnerDm.body.text.includes('-1001') && cancelledOwnerDm.body.text.includes('小孩哥') && cancelledOwnerDm.body.text.includes('取消人') && cancelledOwnerDm.body.text.includes('未写入 D1') && !callsOf('sendMessage').some((call) => String(call.body.chat_id) === '998' && call.body.text.includes('广告举报投票已取消')));

	harness = makeVoteHarness({ pinFails: true });
	await harness.dispatch({ message: {
		message_id: 96039,
		chat: { id: -1001, type: 'supergroup', title: '投票边界群' },
		from: { id: 96000, is_bot: false, first_name: '白名单发起人' },
		text: '/ad 96040 小孩哥',
	} });
	state = harness.readState();
	assert('/ad TGID 模式 → 正确解析目标与举报原因', state.targetUserId === '96040' && state.reason === '小孩哥');
	assert('/ad TGID 模式 → 投票卡片为独立消息，不设置回复目标', callsOf('sendMessage').some((call) => Number(call.body.chat_id) === -1001 && !Object.prototype.hasOwnProperty.call(call.body, 'reply_to_message_id')));
	assert('/ad 置顶权限不足 → 投票仍创建并保持进行中', harness.db._adVotes.size === 1 && state.finalized === false && callsOf('pinChatMessage').length === 1);

	harness = makeVoteHarness();
	const protectedTargets = ['96000', '999', '998', '7777', '6666', '123456789'];
	for (const [index, targetId] of protectedTargets.entries()) {
		await harness.dispatch({ message: {
			message_id: 96100 + index,
			chat: { id: -1001, type: 'supergroup', title: '投票边界群' },
			from: { id: 96000, is_bot: false, first_name: '白名单发起人' },
			text: '/ad ' + targetId,
		} });
	}
	assert('/ad 不能举报自己、主人、副主人、超级管理员、当前群管理员或机器人', harness.db._adVotes.size === 0);
}

// ---------- [84c] /ad 发起白名单仅第一主人管理 ----------
console.log('\n[84c] /ad 发起白名单权限');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 9200 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const db = makeAdD1();
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,998', SUPER_ADMINS: '7777', DB: db };
	const dispatch = async (fromId, text) => handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: {
			message_id: fromId,
			chat: { id: fromId, type: 'private' },
			from: { id: fromId, is_bot: false, first_name: fromId === 999 ? '主人' : '副主人' },
			text,
		} }),
	}), env, fakeCtxAd);
	await dispatch(999, '/add_ad_admin 97000');
	assert('/add_ad_admin → 第一主人可加入发起白名单', db._adVoteAllowlist.has('97000'));
	await dispatch(998, '/add_ad_admin 97001');
	assert('/add_ad_admin → 副主人无权修改发起白名单', !db._adVoteAllowlist.has('97001'));
	await dispatch(999, '/del_ad_admin 97000');
	assert('/del_ad_admin → 第一主人可移除发起白名单', !db._adVoteAllowlist.has('97000'));
}

// ---------- 总结 ----------
console.log(`\n=== 总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
