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
// 直接从 _worker.js 读取当前 schema 版本，避免测试写死数字后与实现脱节
// （新增表必须升 D1_SCHEMA_VERSION 才能触发老部署迁移，此前写死 5 导致升级即报错）。
const CURRENT_SCHEMA_VERSION = Number(src.match(/const D1_SCHEMA_VERSION = (\d+);/)?.[1] || 0);

// ---------- 伪 D1 ----------
function makeFakeDB(seed = [], options = {}) {
	const rows = new Map(seed.map((r) => [String(r.id), { ...r, id: String(r.id), by_user: r.by_user ?? r.by ?? null }]));
	const store = new Map();
	const batchJobs = new Map();
	const relayObservations = new Map();
	const adVotes = new Map();
	const adVoteAllowlist = new Map();
	const dynamicGroups = new Map(options.dynamicGroups ? Object.entries(options.dynamicGroups) : []);
	const schemaState = {
		version: Number.isFinite(Number(options.schemaVersion)) ? Number(options.schemaVersion) : 5,
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
	let crossGroupSeq = Math.max(1, Number(options.crossGroupSeq) || 1);
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
		_dynamicGroups: dynamicGroups,
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
					if (sql.startsWith('INSERT OR IGNORE INTO dynamic_groups')) {
						const [chatId, title, addedBy, addedAt, note] = bound;
						const key = String(chatId);
						if (dynamicGroups.has(key)) return { meta: { changes: 0 } };
						dynamicGroups.set(key, { title: title ?? null, addedBy: String(addedBy), addedAt: String(addedAt), note: note ?? null });
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('DELETE FROM dynamic_groups')) {
						const key = String(bound[0]);
						if (!dynamicGroups.has(key)) return { meta: { changes: 0 } };
						dynamicGroups.delete(key);
						return { meta: { changes: 1 } };
					}
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
					if (sql.startsWith('INSERT INTO cross_group_posts')) {
						const [fromId, chatId, fingerprint, canonical, createdAt] = bound;
						const data = getJson('cross_group_posts', { items: [] });
						const id = crossGroupSeq++;
						data.items.push({
							id,
							fromId: String(fromId),
							chatId: String(chatId),
							fingerprint: String(fingerprint || ''),
							canonical: String(canonical || ''),
							at: createdAt,
						});
						setJson('cross_group_posts', data);
						return { meta: { changes: 1, last_row_id: id } };
					}
					if (sql.startsWith('DELETE FROM cross_group_posts WHERE created_at <')) {
						const cutoff = String(bound[0]);
						const data = getJson('cross_group_posts', { items: [] });
						const before = data.items.length;
						data.items = data.items.filter((it) => String(it.at) >= cutoff);
						setJson('cross_group_posts', data);
						return { meta: { changes: before - data.items.length } };
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
					if (sql.includes('FROM dynamic_groups')) {
						return {
							results: [...dynamicGroups.entries()]
								.map(([chatId, row]) => ({
									chat_id: String(chatId),
									title: row?.title ?? null,
									added_by: row?.addedBy ?? row?.added_by ?? '999',
									added_at: row?.addedAt ?? row?.added_at ?? '2026-01-01T00:00:00Z',
									note: row?.note ?? null,
								}))
								.sort((a, b) => String(a.added_at).localeCompare(String(b.added_at)) || String(a.chat_id).localeCompare(String(b.chat_id)))
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
					if (sql.startsWith('SELECT chat_id, fingerprint, canonical FROM cross_group_posts')) {
						const [fromId, windowStart, limitValue] = bound;
						const limit = Number(limitValue) || 40;
						const data = getJson('cross_group_posts', { items: [] });
						return {
							results: data.items
								.filter((it) => String(it.fromId) === String(fromId) && String(it.at) >= String(windowStart))
								.sort((a, b) => b.id - a.id)
								.slice(0, limit)
								.map((it) => ({ chat_id: it.chatId, fingerprint: it.fingerprint, canonical: it.canonical }))
						};
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
	// 稳定态 3 条：动态群组读取（15 秒运行时缓存，同请求只读一次）+ 黑名单主键查询 + 消息缓存写入
	assert('稳定态普通群消息仅执行 3 条必要 D1 SQL', steadyMessageSql.length === 3, JSON.stringify(steadyMessageSql));
	assert('稳定态 D1 SQL = 动态群组读取 + 黑名单主键查询 + 消息缓存写入', (
		steadyMessageSql.some((sql) => sql.startsWith('INSERT INTO moderation_messages')) &&
		steadyMessageSql.includes('SELECT id, reason, by_user, at, note FROM blacklist WHERE id = ? LIMIT 1') &&
		steadyMessageSql.some((sql) => sql.includes('FROM dynamic_groups'))
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
	assert('混合 /unban 管理层解封全部 3 个目标（覆盖 2 群）', callsOf('unbanChatMember').length === 6);
	assert('混合 /unban 管理层移除 D1 黑名单目标', !env.DB._rows.has('57101'));
	assert('混合 /unban 对命中目标执行一次 D1 删除 mutation', env.DB._mutationCalls.filter((call) => call.type === 'delete').length === 1);
	assert('混合 /unban 所有 Telegram 请求带 only_if_banned', callsOf('unbanChatMember').every((call) => call.body.only_if_banned === true));
	assert('混合 /unban 绝不调用封禁接口', callsOf('banChatMember').length === 0);
	const dmText = callsOf('sendMessage').filter((call) => String(call.body.chat_id) === '999').map((call) => call.body.text).join('\n');
	assert('混合 /unban 回执明确说明 D1 记录已移除', dmText.includes('D1 黑名单记录已移除') && dmText.includes('57101'));
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
	assert('/unban Queue 管理层移除 5 条 D1 后全部资格通过', job.status === 'done' && job.stats.unbanEligible === 20 && job.stats.unbanBlacklisted === 0 && env.DB._rows.size === 0);
	assert('/unban 40 个群操作按 24 上限分 2 次 Queue', job.autoRunCount === 2);
	assert('/unban Queue 对 5 个命中目标执行一次批量 DELETE', env.DB._mutationCalls.filter((call) => call.type === 'delete').length === 1);
	assert('/unban Queue 执行全部 20×2 次群解封', callsOf('unbanChatMember').length === 40);
	assert('/unban Queue 全部请求带 only_if_banned', callsOf('unbanChatMember').every((call) => call.body.only_if_banned === true));
	assert('/unban Queue 不产生 D1 黑名单拒绝失败', job.failures.filter((failure) => failure.phase === 'unban_blocked').length === 0);
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

// ---------- [12a1b] 管理层单条 /unban 命中 D1：先移除再解封 ----------
console.log('\n[12a1b] 管理层单条 /unban 命中 D1');
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
	assert('第一主人 /unban 移除 D1 黑名单记录', !env.DB._rows.has('7070447001'));
	assert('第一主人 /unban 执行一次 D1 删除', env.DB._mutationCalls.filter((call) => call.type === 'delete').length === 1);
	assert('第一主人 /unban 遍历两个配置群解封', callsOf('unbanChatMember').length === 2);
	assert('第一主人 /unban 全部请求携带 only_if_banned', callsOf('unbanChatMember').every((call) => call.body.only_if_banned === true));
	assert('第一主人 /unban 绝不调用封禁接口', callsOf('banChatMember').length === 0);
	const dmSend = callsOf('sendMessage').find((call) => String(call.body.chat_id) === '999');
	assert('第一主人 /unban 回执说明先移除 D1 再原生解封', !!dmSend && dmSend.body.text.includes('目标原在 D1 黑名单') && dmSend.body.text.includes('D1 黑名单记录已删除'));
}

// ---------- [12a1c] 副主人、超级管理员同样可解除 D1 后解封 ----------
console.log('\n[12a1c] 副主人和超级管理员解除 D1 后解封');
for (const scenario of [
	{ label: '副主人', actorId: 998, targetId: '7070447002' },
	{ label: '超级管理员', actorId: 7777, targetId: '7070447003' },
]) {
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
		OWNER_IDS: '999,998',
		SUPER_ADMINS: '7777',
		DB: makeFakeDB([{ id: scenario.targetId, reason: 'manual', by: '999', at: '2026-07-01T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({
			message: {
				message_id: Number(scenario.targetId),
				chat: { id: scenario.actorId, type: 'private' },
				from: { id: scenario.actorId, is_bot: false, first_name: scenario.label },
				text: '/unban ' + scenario.targetId,
			}
		})
	}), env);
	assert(scenario.label + ' /unban 移除 D1 黑名单记录', !env.DB._rows.has(scenario.targetId));
	assert(scenario.label + ' /unban 遍历两个配置群解封', callsOf('unbanChatMember').length === 2);
	assert(scenario.label + ' /unban 绝不调用封禁接口', callsOf('banChatMember').length === 0);
}

// ---------- [12a1d] D1 删除失败时管理层也必须拒绝解封 ----------
console.log('\n[12a1d] D1 删除失败严格拒绝解封');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatMember: (body) => ({
			ok: true,
			result: { status: 'kicked', user: { id: Number(body.user_id), first_name: '删除失败用户' } }
		}),
		unbanChatMember: () => ({ ok: true, result: true }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env = {
		...baseEnv,
		DB: makeFakeDB(
			[{ id: '7070447004', reason: 'manual', by: '999', at: '2026-07-01T00:00:00Z' }],
			{ failMutationCalls: [1] }
		),
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 917, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/unban 7070447004' } })
	}), env);
	assert('D1 删除失败保留黑名单记录', env.DB._rows.has('7070447004'));
	assert('D1 删除失败不调用 Telegram 解封', callsOf('unbanChatMember').length === 0);
	assert('D1 删除失败也不调用 Telegram 封禁', callsOf('banChatMember').length === 0);
	const failureDm = callsOf('sendMessage').find((call) => String(call.body.chat_id) === '999');
	assert('D1 删除失败明确返回拒绝原因', !!failureDm && failureDm.body.text.includes('D1 黑名单移除失败') && failureDm.body.text.includes('未调用 Telegram 解封接口'));
}

// ---------- [12a1e] 普通 Telegram 群管理员不能解除 D1 ----------
console.log('\n[12a1e] 普通群管理员拒绝解除 D1');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 6666 }, status: 'administrator' }] }),
		unbanChatMember: () => ({ ok: true, result: true }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	const env = {
		...baseEnv,
		DB: makeFakeDB([{ id: '7070447005', reason: 'manual', by: '999', at: '2026-07-01T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({
			message: {
				message_id: 918,
				chat: { id: -1001, type: 'supergroup', title: '普通管理员测试群' },
				from: { id: 6666, is_bot: false, first_name: '普通管理员' },
				text: '/unban 7070447005',
			}
		})
	}), env);
	assert('普通群管理员 /unban 保留 D1 黑名单记录', env.DB._rows.has('7070447005'));
	assert('普通群管理员 /unban 不执行 D1 删除', env.DB._mutationCalls.length === 0);
	assert('普通群管理员 /unban 不调用 Telegram 解封', callsOf('unbanChatMember').length === 0);
	assert('普通群管理员 /unban 绝不调用 Telegram 封禁', callsOf('banChatMember').length === 0);
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

// ---------- [12d0] sanitizeTelegramText 只剥离孤立代理，合法 emoji 必须保留 ----------
// 旧实现 replace(/[\uD800-\uDFFF]/g, '') 把所有代理对码元一律删除，导致星平面 emoji
// （📋🔐🗂️🤖🕵️🌐 等）被整体抹掉、只留一个多余空格，而 BMP 内的 ✅❌ℹ️ 却安然无恙。
// 该函数被 escapeHtml / telegramMessageLength / truncateTelegramText / sendTelegramMessage
// 等 10 处调用，是全项目 emoji 显示的总闸门，单独锁住行为。
console.log('\n[12d0] sanitizeTelegramText 保留合法 emoji、剥离孤立代理');
{
	const san = sandbox.sanitizeTelegramText;
	// 合法星平面字符（emoji）必须原样保留
	const keep = ['📋', '🔐', '🗂️', '🤖', '🕵️', '🌐', '🗳️', '📊', '🔔', '🎯', '👑', '🛡️'];
	const stripped = keep.filter((e) => san(e) !== e);
	assert('星平面 emoji 全部保留', stripped.length === 0, `被剥离：${stripped.join(' ')}`);

	// BMP 内符号本来就正常，不能被改坏
	const bmp = ['✅', '❌', 'ℹ️', '⚠️', '•', '　'];
	assert('BMP 符号保持不变', bmp.every((c) => san(c) === c));

	// 真实文案：emoji 后面的空格不再变成孤零零的前导空格
	assert('表头 emoji 不再被吃掉', san('📋 当前黑名单') === '📋 当前黑名单');
	assert('带变体选择符的 emoji 不再只剩 U+FE0F', san('🗳️ 群内投票举报') === '🗳️ 群内投票举报');

	// 孤立代理（真正会让 Telegram 返回 400 的非法字符）仍必须被清掉
	assert('孤立高位代理被清除', san('正常\uD83D文本') === '正常文本');
	assert('孤立低位代理被清除', san('正常\uDCCB文本') === '正常文本');
	assert('单独的高位代理被清除', san('\uD83D') === '');
	assert('单独的低位代理被清除', san('\uDCCB') === '');
	assert('emoji 紧邻孤立代理时只清孤立的那个', san('好\uD83D📋好') === '好📋好');
	assert('连续两个孤立高位代理都被清除', san('a\uD83D\uD83Db') === 'ab');

	// 空值与非字符串入参
	assert('null / undefined 返回空串', san(null) === '' && san(undefined) === '');
	assert('数字入参转字符串', san(12345) === '12345');

	// 长度计算：Telegram 的 4096 上限按 UTF-16 码元算，emoji 占 2
	assert('emoji 计入长度为 2 个码元', sandbox.telegramMessageLength('📋') === 2);
	assert('纯 ASCII 长度不变', sandbox.telegramMessageLength('abcde') === 5);

	// 按码点截断，绝不把 emoji 劈成半个
	assert('截断按码点进行，不产生半个 emoji', sandbox.truncateTelegramText('📋📋📋', 2) === '📋📋');
	assert('escapeHtml 保留 emoji 同时转义尖括号', sandbox.escapeHtml('📋 <b>') === '📋 &lt;b&gt;');
}

// ---------- [12d1] /blacklist 竖排排版：字段各占一行、时间去噪、操作人本地翻译 ----------
// 旧版把 4 个字段用 " · " 拼成一行，Telegram 按屏宽随机折行；长的
// anonymous_admin:-100xxx 一出现整行就被撑爆。本段锁住竖排格式不被改回单行。
console.log('\n[12d1] /blacklist 竖排排版');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const env = {
		...baseEnv,
		OWNER_IDS: '999,888',
		SUPER_ADMINS: '7777',
		DB: makeFakeDB([
			{ id: '5001', reason: 'spam', by: '999', at: '2026-09-02T23:40:47.004Z' },
			{ id: '5002', reason: 'spam', by: 'anonymous_admin:-1001883549197', at: '2026-09-02T23:22:34.806Z' },
			{ id: '5003', reason: 'ad_auto', by: 'system', at: '2026-09-02T23:21:48.067Z' },
			{ id: '5004', reason: 'manual', by: '888', at: '2026-09-01T18:04:12.331Z' },
			{ id: '5005', reason: 'ad_vote', by: '7777', at: '2026-09-01T15:38:09.117Z' },
		]),
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1210, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/blacklist' } }),
	}), env, { waitUntil: () => {} });
	const dm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	const text = dm?.body?.text || '';
	const plain = text.replace(/<[^>]+>/g, '');

	assert('竖排：每条以「序号. TGID：」起头', (plain.match(/^\s*\d+\. TGID：\d+$/gm) || []).length === 5);
	assert('竖排：原因/操作人/时间各自独占一行', (plain.match(/^　　原因：/gm) || []).length === 5
		&& (plain.match(/^　　操作人：/gm) || []).length === 5
		&& (plain.match(/^　　时间：/gm) || []).length === 5);
	assert('竖排：不再把字段用 " · " 拼成一行', !/TGID：\d+ · /.test(plain));

	assert('时间：去掉 T、毫秒与结尾 Z，保留到秒', plain.includes('时间：2026-09-02 23:40:47')
		&& !plain.includes('23:40:47.004') && !/时间：\d{4}-\d{2}-\d{2}T/.test(plain));

	assert('操作人：第一主人标记为主人并可点击', /操作人：👑 主人 <a href="tg:\/\/user\?id=999">999<\/a>/.test(text));
	assert('操作人：副主人识别正确', /操作人：👤 副主人 <a href="tg:\/\/user\?id=888">888<\/a>/.test(text));
	assert('操作人：超级管理员识别正确', /操作人：🛡️ 超级管理员 <a href="tg:\/\/user\?id=7777">7777<\/a>/.test(text));
	assert('操作人：system 翻译为系统自动，不裸露 system', plain.includes('操作人：🤖 系统自动') && !plain.includes('操作人：system'));
	assert('操作人：匿名管理员翻译并带出来源群，不裸露 anonymous_admin 前缀',
		plain.includes('操作人：🕵️ 匿名管理员（来源群 -1001883549197）') && !plain.includes('anonymous_admin:'));

	assert('TGID 保持可点击跳转', /1\. TGID：<a href="tg:\/\/user\?id=5001">5001<\/a>/.test(text));
	assert('末尾附 UTC 与可点击说明', plain.includes('时间为 UTC') && plain.includes('点 TGID 或操作人可直接打开该用户'));

	// 单条发送：默认 30 条可见字符远低于 4096，不该被拆成多条
	assert('默认条数下只发一条消息', callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '999').length === 1);
	assert('可见字符未超 Telegram 4096 上限', plain.length <= 4096);

	// 空黑名单与缺字段的边界
	resetCalls();
	const emptyEnv = { ...baseEnv, OWNER_IDS: '999', DB: makeFakeDB([]) };
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1211, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/blacklist' } }),
	}), emptyEnv, { waitUntil: () => {} });
	const emptyDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('空黑名单仍回「（空）」不报错', !!emptyDm && emptyDm.body.text.includes('（空）'));

	resetCalls();
	const partialEnv = {
		...baseEnv,
		OWNER_IDS: '999',
		DB: makeFakeDB([{ id: '5100', reason: null, by: null, at: null }]),
	};
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1212, chat: { id: 999, type: 'private' }, from: { id: 999, is_bot: false }, text: '/blacklist' } }),
	}), partialEnv, { waitUntil: () => {} });
	const partialDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	const partialPlain = (partialDm?.body?.text || '').replace(/<[^>]+>/g, '');
	assert('原因/操作人/时间全缺时只输出 TGID 行，不留空字段', partialPlain.includes('1. TGID：5100')
		&& !partialPlain.includes('原因：\n') && !/时间：\s*$/m.test(partialPlain));
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

// ---------- [24a] 普通管理员原生解封 D1 用户:黑名单保留并立即封回 ----------
console.log('\n[24a] 普通管理员原生解封 D1 用户:独立保护链封回');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		getMe: () => ({ ok: true, result: { id: 424242, is_bot: true, username: 'test_bot' } }),
		getChat: (body) => ({ ok: true, result: { id: Number(body.chat_id), title: '主群', type: 'supergroup' } }),
		banChatMember: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const cmUpdate = {
		chat_member: {
			chat: { id: -1001, type: 'supergroup', title: '主群' },
			from: { id: 7777, is_bot: false, first_name: '普通管理员' },
			old_chat_member: { user: { id: 5555, is_bot: false, first_name: '黑名单用户' }, status: 'kicked' },
			new_chat_member: { user: { id: 5555, is_bot: false, first_name: '黑名单用户' }, status: 'left' },
			date: Math.floor(Date.now() / 1000),
		},
	};
	const env = {
		TOKEN,
		BOT_TOKEN: '0:fake',
		GROUP_ID: '-1001,-1002',
		OWNER_IDS: '999',
		DB: makeFakeDB([{ id: '5555', reason: 'manual', by: '999', at: '2026-05-01T00:00:00Z' }]),
	};
	await handler.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify(cmUpdate) }), env);

	assert('普通管理员原生解封后 D1 记录保持', env.DB._rows.has('5555'));
	assert('独立保护链只封回事件所在群一次', callsOf('banChatMember').length === 1 && String(callsOf('banChatMember')[0].body.chat_id) === '-1001');
	assert('独立保护链封回正确用户', String(callsOf('banChatMember')[0].body.user_id) === '5555');
	assert('原生解封保护链不调用 unbanChatMember', callsOf('unbanChatMember').length === 0);
	const ownerDm = callsOf('sendMessage').find((call) => String(call.body.chat_id) === '999');
	assert('第一主人收到原生解封拦截通知', !!ownerDm && ownerDm.body.text.includes('群内手动解封拦截'));
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
function trustedSampleData(texts, source = 'test-confirmed', scopes = null) {
	const fingerprints = texts.map(normalizeFp);
	return {
		fingerprints,
		entries: fingerprints.map((fingerprint, index) => ({
			fingerprint,
			trusted: true,
			source,
			...(Array.isArray(scopes) ? { scopes } : {}),
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
		'/ban', '/spam',
		'/ad', '/add_ad_admin', '/del_ad_admin',
		'/admins', '/groups', '/leavegroup',
	];
	const missingHelpCommands = expectedHelpCommands.filter((command) => !dm?.body?.text?.includes(command));
	assert('主人 /help → 全部 8 个指令齐全', missingHelpCommands.length === 0, `缺少 ${missingHelpCommands.join(',')}`);
	// 自动广告治理已整体移除：这批命令必须从 /help 索引里彻底消失，不能只是不可用还在宣传
	const purgedHelpCommands = [
		'/importdefault', '/addword', '/delword', '/listwords',
		'/learn', '/learnlast', '/recent',
		'/listsamples', '/delsample', '/clearsamples',
	];
	const stillAdvertised = purgedHelpCommands.filter((command) => dm?.body?.text?.includes(command));
	assert('主人 /help → 已移除的广告命令不再出现', stillAdvertised.length === 0, `仍在宣传 ${stillAdvertised.join(',')}`);
	const mentionParseOk = expectedHelpCommands.every((command) => (
		sandbox.parseTelegramCommand(`${command}@TestBot`).head === command
	));
	const argumentParseOk = [
		['/ban@TestBot 12345 广告', '/ban', '12345 广告'],
		['/ad@TestBot 12345 广告', '/ad', '12345 广告'],
		['/add_ad_admin@TestBot 12345', '/add_ad_admin', '12345'],
		['/leavegroup@TestBot -1001234567890', '/leavegroup', '-1001234567890'],
	].every(([input, head, rest]) => {
		const parsed = sandbox.parseTelegramCommand(input);
		return parsed.head === head && parsed.rest === rest;
	});
	assert('/help 全部指令兼容 @机器人名', mentionParseOk && argumentParseOk);
	const removedBanCommand = '/' + ['b', 'e'].join('');
	const removedSpamCommand = '/' + ['s', 'a'].join('');
	assert('主人 /help → 人工封禁三条齐全', !!dm && dm.body.text.includes('/ban TGID') && dm.body.text.includes('/spam') && dm.body.text.includes('/unban TGID'));
	assert('主人 /help → 不再显示旧短命令', !!dm && !dm.body.text.includes(removedBanCommand) && !dm.body.text.includes(removedSpamCommand));
	assert('主人 /help → 含 /ad 投票与白名单管理', !!dm && dm.body.text.includes('/ad [原因]') && dm.body.text.includes('/add_ad_admin') && dm.body.text.includes('/del_ad_admin'));
	assert('主人 /help → 含动态群组三条', !!dm && dm.body.text.includes('/addgroup') && dm.body.text.includes('/delgroup') && dm.body.text.includes('/listgroups'));
	assert('主人 /help → 含查询与退群三条', !!dm && dm.body.text.includes('/admins') && dm.body.text.includes('/groups') && dm.body.text.includes('/leavegroup'));
	const helpCommandLines = dm.body.text.split('\n').filter((l) => l.startsWith('<code>/'));
	assert('主人 /help → 每条指令都带用途说明', helpCommandLines.length >= 12
		&& helpCommandLines.every((l) => l.replace(/<[^>]+>/g, '').replace(/^\/[a-z_]+/, '').replace(/^[^\u4e00-\u9fa5]*/, '').trim().length >= 4));
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
console.log('\n[67a] 副主人管理命令群聊静默 + 私聊不变');
{
	resetCalls();
	sandbox.fetch = makeFetchMock({
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	});
	// 原先用 /listwords 做载体，该命令随自动广告治理一并移除；
	// 本段测的是「副主人群内静默、私聊正常」这个保留机制，改用同为高级管理命令的 /blacklist。
	const db = makeFakeDB([{ id: '8899', reason: 'manual', by: '999', at: '2026-09-01T00:00:00Z' }]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,888', DB: db };

	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 22, chat: { id: 888, type: 'private' }, from: { id: 888, is_bot: false, first_name: '副主人' }, text: '/blacklist' } }),
	}), env, fakeCtxAd);
	const deputyPrivate = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '888');
	assert('副主人私聊 /blacklist 仍直接收到完整结果', !!deputyPrivate && deputyPrivate.body.text.includes('8899'));
	assert('副主人私聊 /blacklist 不触发群闪屏或删消息', callsOf('sendMessage').every((c) => Number(c.body.chat_id) > 0) && callsOf('deleteMessage').length === 0);

	resetCalls();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 23, chat: { id: -1001, type: 'supergroup' }, from: { id: 888, is_bot: false, first_name: '副主人' }, text: '/blacklist' } }),
	}), env, fakeCtxAd);
	const groupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	const ownerDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	const deputyDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '888');
	assert('副主人群内 /blacklist 零机器人回执', groupSends.length === 0);
	assert('副主人群内 /blacklist 完整结果发给主人', !!ownerDm && ownerDm.body.text.includes('8899'));
	assert('副主人群内 /blacklist 不私聊发令副主人', !deputyDm);
	assert('副主人群内 /blacklist 删除命令消息', callsOf('deleteMessage').some((c) => c.body.message_id === 23));
}

// ---------- [67a2] 群聊 /start 与无参 /unban 仅第一主人可触发；私聊不受影响 ----------
// 用户实测：任何人在配置群发 /start 都能把自助解封欢迎语刷出来（普通成员直接在群里
// 收到完整欢迎语，群管理员则触发"私聊主人"通路）。该欢迎语本是给【被封用户私聊 bot】
// 用的自助流程，且正文含解封确认整句，等于公开教学如何触发解封，还污染群消息流。
// 现改为：群聊里只有第一主人能触发，其他任何身份一律【纯静默】——不回、不撤、不通知，
// 零 Telegram 请求。私聊权限与行为完全不变。
console.log('\n[67a2] 群聊 /start 仅第一主人；私聊不变');
{
	const groupSilentEnv = () => ({ TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999,888', SUPER_ADMINS: '7778', DB: makeFakeDB([]) });
	const silentRoutes = {
		getChatAdministrators: (b) => ({ ok: true, result: String(b.chat_id) === '-1001' ? [{ user: { id: 7777 }, status: 'administrator' }] : [] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '测试主群', username: 'test_group', type: 'supergroup' } }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
		deleteMessage: () => ({ ok: true, result: true }),
	};

	// 群聊里各类非第一主人身份 × 两个入口，全部必须零 API 调用
	const silentCases = [
		{ label: '普通成员', from: { id: 5555, is_bot: false, first_name: '普通成员' } },
		{ label: '普通群管理员', from: { id: 7777, is_bot: false, first_name: '普通管理员' } },
		{ label: '超级管理员', from: { id: 7778, is_bot: false, first_name: '超级管理员' } },
		{ label: '副主人', from: { id: 888, is_bot: false, first_name: '副主人' } },
	];
	const silentFailures = [];
	for (const [i, scenario] of silentCases.entries()) {
		for (const [j, cmd] of ['/start', '/start@TestBot', '/unban'].entries()) {
			resetCalls();
			sandbox.fetch = makeFetchMock(silentRoutes);
			const silentEnv = groupSilentEnv();
			await handler.fetch(new Request('https://x.com/', {
				method: 'POST',
				body: JSON.stringify({ message: { message_id: 3000 + i * 10 + j, chat: { id: -1001, type: 'supergroup' }, from: scenario.from, text: cmd } }),
			}), silentEnv, fakeCtxAd);
			if (apiCalls.length !== 0) silentFailures.push(`${scenario.label}:${cmd}(${apiCalls.map((c) => c.method).join('/')})`);
		}
	}
	assert('群聊非第一主人发 /start 与无参 /unban 一律零 Telegram 请求', silentFailures.length === 0, silentFailures.join(', '));

	// 匿名管理员（GroupAnonymousBot）同样不得触发
	resetCalls();
	sandbox.fetch = makeFetchMock(silentRoutes);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: {
			message_id: 3100,
			chat: { id: -1001, type: 'supergroup', title: '测试主群' },
			from: { id: 1087968824, is_bot: true, first_name: 'GroupAnonymousBot' },
			sender_chat: { id: -1001, type: 'supergroup', title: '测试主群' },
			text: '/start',
		} }),
	}), groupSilentEnv(), fakeCtxAd);
	assert('群聊匿名管理员发 /start 也零 Telegram 请求', apiCalls.length === 0, apiCalls.map((c) => c.method).join('/'));

	// 黑名单用户在群里发 /start：由【黑名单兜底拦截】先行处理（删消息 + 踢人 + 通知主人），
	// 在 /start 分支之前就 return，因此绝不会弹出欢迎语。这是既有安全行为，本次改动不触碰。
	resetCalls();
	sandbox.fetch = makeFetchMock({ ...silentRoutes, banChatMember: () => ({ ok: true, result: true }) });
	const blacklistedEnv = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([{ id: '5558', reason: 'manual', by: '999', at: '2026-07-21T00:00:00Z' }]) };
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 3200, chat: { id: -1001, type: 'supergroup' }, from: { id: 5558, is_bot: false, first_name: '黑名单用户' }, text: '/start' } }),
	}), blacklistedEnv, fakeCtxAd);
	assert('群聊黑名单用户发 /start 不弹欢迎语', !callsOf('sendMessage').some((c) => String(c.body.text || '').includes('自助解封机器人')));
	assert('群聊黑名单用户发 /start 仍被兜底拦截删消息并踢出', callsOf('deleteMessage').some((c) => c.body.message_id === 3200) && callsOf('banChatMember').some((c) => String(c.body.user_id) === '5558'));

	// 第一主人群内保持原行为
	resetCalls();
	sandbox.fetch = makeFetchMock(silentRoutes);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 3300, chat: { id: -1001, type: 'supergroup' }, from: { id: 999, is_bot: false, first_name: '主人' }, text: '/start' } }),
	}), groupSilentEnv(), fakeCtxAd);
	const ownerGroupSends = callsOf('sendMessage').filter((c) => String(c.body.chat_id) === '-1001');
	assert('第一主人群内 /start 保持原完整群回复', ownerGroupSends.length === 1 && ownerGroupSends[0].body.text.includes('自助解封机器人'));
	assert('第一主人群内 /start 不删命令消息', !callsOf('deleteMessage').some((c) => c.body.message_id === 3300));

	// 私聊行为完全不变：普通用户、黑名单用户各自照旧
	resetCalls();
	sandbox.fetch = makeFetchMock(silentRoutes);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 3400, chat: { id: 5555, type: 'private' }, from: { id: 5555, is_bot: false, first_name: '普通用户' }, text: '/start' } }),
	}), groupSilentEnv(), fakeCtxAd);
	const privateReply = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '5555');
	assert('私聊普通用户 /start 仍正常收到欢迎语', !!privateReply && privateReply.body.text.includes('自助解封机器人'));

	resetCalls();
	sandbox.fetch = makeFetchMock(silentRoutes);
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 3401, chat: { id: 5556, type: 'private' }, from: { id: 5556, is_bot: false, first_name: '普通用户' }, text: '/unban' } }),
	}), groupSilentEnv(), fakeCtxAd);
	const privateUnbanReply = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '5556');
	assert('私聊普通用户无参 /unban 仍正常收到欢迎语', !!privateUnbanReply && privateUnbanReply.body.text.includes('自助解封机器人'));

	resetCalls();
	sandbox.fetch = makeFetchMock(silentRoutes);
	const privateBlacklistedEnv = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', DB: makeFakeDB([{ id: '5557', reason: 'manual', by: '999', at: '2026-07-21T00:00:00Z' }]) };
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 3402, chat: { id: 5557, type: 'private' }, from: { id: 5557, is_bot: false, first_name: '黑名单用户' }, text: '/start' } }),
	}), privateBlacklistedEnv, fakeCtxAd);
	const privateBlockReply = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '5557');
	const appealDm = callsOf('sendMessage').find((c) => String(c.body.chat_id) === '999');
	assert('私聊黑名单用户 /start 仍被拒并通知主人申诉', !!privateBlockReply && privateBlockReply.body.text.includes('黑名单') && !!appealDm && appealDm.body.text.includes('申诉'));

	// 欢迎语不再暴露主群真实名称（主群可能是私密群）
	assert('欢迎语使用固定品牌名，不显示主群名', !!privateReply && privateReply.body.text.includes('杀神搭配专用解封') && !privateReply.body.text.includes('测试主群'));
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
	assert('旧 schema v3 的可选旧索引失败 → 独立补建 D1 投票表与白名单表', db._schema.version === CURRENT_SCHEMA_VERSION && db._schema.voteTableExists && db._schema.voteAllowlistTableExists);
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
	assert('/ad 创建成功 → 自动按 Telegram 默认通知成员置顶投票消息', callsOf('pinChatMessage').some((call) => Number(call.body.chat_id) === -1001 && call.body.message_id === voteState.messageId && !Object.prototype.hasOwnProperty.call(call.body, 'disable_notification')));

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
	assert('/ad TGID 模式 → 自动置顶同样使用 Telegram 默认成员通知', callsOf('pinChatMessage').some((call) => Number(call.body.chat_id) === -1001 && !Object.prototype.hasOwnProperty.call(call.body, 'disable_notification')));
	assert('/ad 置顶权限不足 → 投票仍创建并保持进行中', harness.db._adVotes.size === 1 && state.finalized === false && callsOf('pinChatMessage').length === 1);

	// TGID 模式通过：撤回参数保留，并对来源群缓存消息执行有限兜底
	harness = makeVoteHarness();
	await harness.dispatch({ message: {
		message_id: 96049,
		chat: { id: -1001, type: 'supergroup', title: '投票边界群' },
		from: { id: 96000, is_bot: false, first_name: '白名单发起人' },
		text: '/ad 96050 TGID广告',
	} });
	state = harness.readState();
	assert('/ad TGID 成功投票 → 没有 reportedMessageId，走历史撤回主路径', state.targetUserId === '96050' && state.reportedMessageId === null);
	await harness.db.prepare('INSERT INTO moderation_messages (mid, chat_id, from_id, created_at) VALUES (?, ?, ?, ?)').bind(96051, '-1001', '96050', new Date().toISOString()).run();
	await harness.db.prepare('INSERT INTO moderation_messages (mid, chat_id, from_id, created_at) VALUES (?, ?, ?, ?)').bind(96052, '-1001', '96050', new Date().toISOString()).run();
	await harness.db.prepare('INSERT INTO moderation_messages (mid, chat_id, from_id, created_at) VALUES (?, ?, ?, ?)').bind(96053, '-1001', '96051', new Date().toISOString()).run();
	await harness.click(6666, 'A', 'tgid-approved');
	state = harness.readState();
	assert('/ad TGID 通过 → D1 加黑并遍历全部 GROUP_ID 且启用 revoke_messages', harness.db._rows.get('96050')?.reason === 'ad_vote' && callsOf('banChatMember').length === 2 && callsOf('banChatMember').every((call) => call.body.revoke_messages === true));
	const tgidDeleteIds = callsOf('deleteMessage').map((call) => Number(call.body.message_id));
	assert('/ad TGID 通过 → 来源群缓存的目标消息执行兜底删除', tgidDeleteIds.includes(96051) && tgidDeleteIds.includes(96052));
	assert('/ad TGID 通过 → 不删除其他用户的消息', !tgidDeleteIds.includes(96053));
	assert('/ad TGID 通过 → 记录兜底删除结果', state.historyFallback?.attempted === true && state.historyFallback.total === 2 && state.historyFallback.ok === 2);

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

// ---------- [93] 投票通过后被举报人昵称脱敏 ----------
// 广告号的昵称本身常就是广告（"广告位招租 @xxx"），投票通过后原样展示等于借 bot 的
// 投票卡片把广告再广播一次。通过后脱敏为"首字***尾字"；进行中/否决/到期仍显示全名，
// 因为群成员必须看清目标才能判断怎么投。
console.log('\n[93] 投票通过后昵称脱敏');
{
	const mask = sandbox.maskAdVoteDisplayName;
	assert('脱敏:多字符取首尾', mask('广告位招租') === '广***租');
	assert('脱敏:单字符整体隐藏', mask('A') === '***');
	assert('脱敏:空值返回空串', mask('') === '' && mask(null) === '' && mask(undefined) === '');

	const snapshot = { id: '5768851426', firstName: '广告位招租', lastName: '@adseller123', username: 'adseller', isBot: false };
	const baseState = {
		voteToken: 'tk_mask', chatId: '-1001', targetUserId: '5768851426', creatorUserId: '999',
		targetUserSnapshot: snapshot, creatorUserSnapshot: { id: '999', firstName: '主人', isBot: false },
		approvers: [], rejecters: [], threshold: 6, createdAt: 1, deadlineAt: 2,
	};
	const targetLine = (extra) => {
		const state = sandbox.normalizeAdVoteState({ ...baseState, ...extra });
		return sandbox.buildAdVoteMessageText(state).split('\n').find((line) => line.includes('被举报人')) || '';
	};
	assert('脱敏:投票通过 → 昵称脱敏且保留 TGID 与可点击链接',
		targetLine({ finalized: true, result: 'approved' }).includes('广***3')
		&& targetLine({ finalized: true, result: 'approved' }).includes('tg://user?id=5768851426')
		&& !targetLine({ finalized: true, result: 'approved' }).includes('广告位招租'));
	assert('脱敏:进行中 → 显示完整昵称', targetLine({ finalized: false, result: null }).includes('广告位招租'));
	assert('脱敏:被否决 → 显示完整昵称', targetLine({ finalized: true, result: 'rejected' }).includes('广告位招租'));
	assert('脱敏:已到期 → 显示完整昵称', targetLine({ finalized: true, result: 'expired' }).includes('广告位招租'));
}

// ---------- [95] 自助解封成功回执：主群联系按钮与四级降级 ----------
// 原文案"请点击 {username} 返回群组"在私有群里会渲染成"请点击 -100xxx 返回群组"——
// 纯文本点不动，且本项目解封走全群、封禁走全群，bot 无法知道用户原本在哪个群被封，
// "返回某个群"本身语义就不对。改为：告知全部群组限制已解除 + 主群作为联系入口内联按钮。
console.log('\n[95] 自助解封回执与主群联系按钮');
{
	const savedFetch = sandbox.fetch;
	const mkFetch = (chatResult) => async (url) => {
		if (String(url).includes('getChat')) {
			return {
				ok: true, status: 200,
				async json() { return chatResult ? { ok: true, result: chatResult } : { ok: false, description: 'Bad Request' }; },
			};
		}
		return { ok: true, status: 200, async json() { return { ok: true, result: true }; } };
	};
	const build = async (chatResult, envExtra = {}) => {
		sandbox.fetch = mkFetch(chatResult);
		sandbox.applyRuntimeConfig(sandbox.loadRequiredConfig({
			TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002,-1003', ...envExtra,
		}));
		return sandbox.buildSelfUnbanApprovedReply();
	};

	// 链接优先级：公开群 username 胜过 invite_link；非 https://t.me/ 的链接一律丢弃
	assert('解封回执:公开群优先用 username 链接',
		sandbox.resolveChatInviteUrl({ username: 'pub', invite_link: 'https://t.me/+other' }) === 'https://t.me/pub');
	assert('解封回执:私有群回退 getChat 返回的 invite_link',
		sandbox.resolveChatInviteUrl({ invite_link: 'https://t.me/+AbCd' }) === 'https://t.me/+AbCd');
	assert('解封回执:非 t.me 链接不采用',
		sandbox.resolveChatInviteUrl({ invite_link: 'http://evil.example.com/x' }) === '');

	const pub = await build({ username: 'mygroup', title: '我的主群' });
	const pubBtn = pub.replyMarkup?.inline_keyboard?.[0]?.[0];
	assert('解封回执:公开主群 → 按钮为 emoji+群名并指向 t.me 链接',
		pubBtn?.text === '💬 我的主群' && pubBtn?.url === 'https://t.me/mygroup');
	assert('解封回执:正文不出现 -100 裸 ID', !/-100\d/.test(pub.text));
	assert('解封回执:群组数量占位符已替换', pub.text.includes('全部 3 个配置群组'));
	assert('解封回执:保留结尾风险提示', pub.text.includes('请注意：解封后请遵守群规'));

	const priv = await build({ title: '私密主群', invite_link: 'https://t.me/+XyZ123' });
	assert('解封回执:私有主群 → 按钮用邀请链接',
		priv.replyMarkup?.inline_keyboard?.[0]?.[0]?.url === 'https://t.me/+XyZ123');

	const noLink = await build({ title: '无链接主群' });
	assert('解封回执:拿不到链接 → 不附按钮且文案去掉"点击下方按钮"',
		noLink.replyMarkup === null && !noLink.text.includes('点击下方按钮'));

	const failed = await build(null);
	assert('解封回执:getChat 失败 → 同样降级且不出现裸 ID',
		failed.replyMarkup === null && !/-100\d/.test(failed.text));

	// SELF_UNBAN_CONTACT_GROUP 校验
	const pick = (envExtra) => sandbox.loadRequiredConfig({
		TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002,-1003', ...envExtra,
	}).SELF_UNBAN_CONTACT_GROUP;
	assert('联系主群:未设置 → 回落 GROUP_IDS[0]', pick({}) === '-1001');
	assert('联系主群:设为配置群内的 ID → 生效', pick({ SELF_UNBAN_CONTACT_GROUP: '-1003' }) === '-1003');
	assert('联系主群:设为配置外的 ID → 忽略并回落主群', pick({ SELF_UNBAN_CONTACT_GROUP: '-1009' }) === '-1001');

	// 旧自定义文案兼容
	const legacy = await build({ username: 'mygroup', title: '我的主群' }, {
		SELF_UNBAN_APPROVED: '✅ 已解封\n\n请点击 {username} 返回群组',
	});
	assert('解封回执:旧自定义文案 {username} 仍渲染为群名且照样附按钮',
		legacy.text.includes('我的主群') && !legacy.text.includes('{username}') && Boolean(legacy.replyMarkup));

	sandbox.fetch = savedFetch;
}

// ---------- [96] 动态群组 /addgroup /delgroup /listgroups ----------
// Worker 无法写自己的环境变量，所以指令加的群只存 D1，与 GROUP_ID 天然分离。
// 合并顺序固定「环境变量群在前、动态群在后」，动态群不会顶替 GROUP_IDS[0] 主群。
// 合并必须发生在路由分发之前，否则 isConfiguredGroup 会把动态群当成非配置群忽略。
console.log('\n[96] 动态群组管理');
{
	const OWNER = '999';
	// BOT_ID 是模块级缓存，前面的测试段已经缓存过 bot id，此处 getMe 不会再被调用。
	// 因此管理员列表必须包含【当前已缓存的 bot id】，硬编码会导致权限预检永远失败。
	sandbox.fetch = async (url) => (String(url).includes('getMe')
		? { ok: true, status: 200, async json() { return { ok: true, result: { id: 12345678, username: 'testbot' } }; } }
		: { ok: true, status: 200, async json() { return { ok: true, result: true }; } });
	const CACHED_BOT_ID = String(await sandbox.getBotId() || 12345678);
	const mkFetch = (adminIds = [OWNER, CACHED_BOT_ID]) => async (url, init) => {
		const u = String(url);
		if (u.includes('api.telegram.org')) {
			const method = u.split('/').pop();
			const body = init?.body ? JSON.parse(init.body) : null;
			apiCalls.push({ method, body });
			if (method === 'getMe') return { ok: true, status: 200, async json() { return { ok: true, result: { id: 12345678, username: 'testbot' } }; } };
			if (method === 'getChatAdministrators') {
				return {
					ok: true, status: 200,
					async json() {
						return { ok: true, result: adminIds.map((id) => ({ user: { id: Number(id) }, status: String(id) === CACHED_BOT_ID ? 'administrator' : 'creator', can_restrict_members: true })) };
					},
				};
			}
			if (method === 'getChat') return { ok: true, status: 200, async json() { return { ok: true, result: { id: Number(body?.chat_id), title: '新群 ' + body?.chat_id, type: 'supergroup' } }; } };
			return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 1 } }; } };
		}
		throw new Error('Unexpected fetch: ' + u);
	};
	const run = async (db, text, from = { id: Number(OWNER), is_bot: false, first_name: '主人' }, chat = { id: Number(OWNER), type: 'private' }) => {
		resetCalls();
		sandbox.fetch = mkFetch();
		const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: OWNER, DB: db };
		await handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify({ message: { message_id: 1, chat, from, text } }),
		}), env, fakeCtxAd);
		return callsOf('sendMessage').map((c) => c.body.text).join('\n');
	};

	// 添加成功
	let db = makeFakeDB([]);
	let out = await run(db, '/addgroup -1003904078173 测试新群');
	assert('动态群组:第一主人私聊 /addgroup 成功写入 D1',
		db._dynamicGroups.has('-1003904078173') && out.includes('已添加动态群组'));
	assert('动态群组:回执包含群名与 bot 身份', out.includes('新群 -1003904078173') && out.includes('bot 身份'));

	// 格式校验
	db = makeFakeDB([]);
	out = await run(db, '/addgroup 12345');
	assert('动态群组:非 -100 开头的 ID 被拒绝', db._dynamicGroups.size === 0 && out.includes('-100'));

	// 与环境变量群重复
	db = makeFakeDB([]);
	out = await run(db, '/addgroup -1001');
	assert('动态群组:已在 GROUP_ID 环境变量中的群被拒绝', db._dynamicGroups.size === 0 && out.includes('GROUP_ID 环境变量'));

	// bot 不是管理员 → 拒绝
	db = makeFakeDB([]);
	resetCalls();
	sandbox.fetch = mkFetch([OWNER]); // admin 列表不含 bot 自身
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1, chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER), is_bot: false, first_name: '主人' }, text: '/addgroup -1003904078173' } }),
	}), { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: OWNER, DB: db }, fakeCtxAd);
	assert('动态群组:bot 不是目标群管理员时拒绝添加',
		db._dynamicGroups.size === 0
		&& callsOf('sendMessage').some((c) => c.body.text.includes('无法添加') && c.body.text.includes('管理员')));

	// 非第一主人无权限
	db = makeFakeDB([]);
	out = await run(db, '/addgroup -1003904078173', { id: 55555, is_bot: false, first_name: '路人' }, { id: 55555, type: 'private' });
	assert('动态群组:非第一主人被拒绝且不写库', db._dynamicGroups.size === 0 && out.includes('权限不足'));

	// 移除
	db = makeFakeDB([], { dynamicGroups: { '-1003904078173': { title: '旧群' } } });
	out = await run(db, '/delgroup -1003904078173');
	assert('动态群组:/delgroup 移除成功', !db._dynamicGroups.has('-1003904078173') && out.includes('已移除动态群组'));

	// 环境变量群不可用指令移除
	db = makeFakeDB([]);
	out = await run(db, '/delgroup -1001');
	assert('动态群组:环境变量群拒绝指令移除并引导改后台', out.includes('无法用指令移除'));

	// /listgroups 分段展示
	db = makeFakeDB([], { dynamicGroups: { '-1003904078173': { title: '动态群A', note: '备注A' } } });
	out = await run(db, '/listgroups');
	assert('动态群组:/listgroups 分段列出环境变量群与指令添加群',
		out.includes('环境变量群') && out.includes('指令添加群') && out.includes('动态群A') && out.includes('备注A'));
	assert('动态群组:/listgroups 标注主群且合计正确', out.includes('主群') && out.includes('合计生效群组:3 个'));

	// 关键：动态群参与全群封禁（合并生效验证）
	db = makeFakeDB([], { dynamicGroups: { '-1003904078173': { title: '动态群A' } } });
	resetCalls();
	sandbox.fetch = mkFetch();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1, chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER), is_bot: false, first_name: '主人' }, text: '/ban 88888 广告' } }),
	}), { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: OWNER, DB: db }, fakeCtxAd);
	const bannedGroups = callsOf('banChatMember').map((c) => String(c.body.chat_id));
	assert('动态群组:/ban 覆盖环境变量群 + 动态群（合并已生效）',
		bannedGroups.includes('-1001') && bannedGroups.includes('-1002') && bannedGroups.includes('-1003904078173'),
		JSON.stringify(bannedGroups));

	// 脏数据防护：非法 chat_id 不得进入 GROUP_IDS
	db = makeFakeDB([], { dynamicGroups: { 'not-a-group': { title: '脏数据' }, '-1003904078173': { title: '正常群' } } });
	resetCalls();
	sandbox.fetch = mkFetch();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: { message_id: 1, chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER), is_bot: false, first_name: '主人' }, text: '/ban 88889' } }),
	}), { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: OWNER, DB: db }, fakeCtxAd);
	const targets = callsOf('banChatMember').map((c) => String(c.body.chat_id));
	assert('动态群组:D1 中非法 chat_id 被过滤，不参与封禁',
		!targets.includes('not-a-group') && targets.includes('-1003904078173'), JSON.stringify(targets));
}

// ---------- [97] 服务消息不进清扫缓存（置顶不被取消） ----------
// 用户反馈：任何有置顶权限的管理员置顶任意消息，该置顶都会被本项目删除并取消。
// 根因：Telegram 推送的 pinned_message 服务消息，from 是置顶者、message_id 是服务消息
// 自身；旧缓存条件只排除 bot 与斜杠命令，服务消息没有 text 所以照样被写进
// moderation_messages。之后该用户一旦被 /spam 引用清扫或 /ad 投票通过，清扫会删掉这条
// 服务消息 —— 删除 pinned_message 服务消息在群里的表现正是「取消置顶」。
// 本项目只应对自己发出的投票卡片做 pin/unpin，绝不碰群里其它置顶。
console.log('\n[97] 服务消息不进清扫缓存');
{
	const savedFetch = sandbox.fetch;
	sandbox.fetch = makeFetchMock({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 999 }, status: 'creator' }] }),
		getChat: (b) => ({ ok: true, result: { id: Number(b.chat_id), title: '测试群', type: 'supergroup' } }),
		deleteMessage: () => ({ ok: true, result: true }),
		sendMessage: () => ({ ok: true, result: { message_id: 1 } }),
	});
	const db = makeFakeDB([]);
	const env = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', MSG_CACHE_ENABLED: 'true', DB: db };
	const post = (message) => handler.fetch(new Request('https://x.com/', {
		method: 'POST', body: JSON.stringify({ message }),
	}), env, fakeCtxAd);

	// 管理员置顶一条消息 → Telegram 推送 pinned_message 服务消息
	resetCalls();
	await post({
		message_id: 8800,
		chat: { id: -1001, type: 'supergroup', title: '测试群' },
		from: { id: 555, is_bot: false, first_name: '置顶管理员' },
		pinned_message: { message_id: 8790, chat: { id: -1001, type: 'supergroup' }, from: { id: 777, is_bot: false }, text: 'test' },
	});
	const modCache = db._store.get('moderation_messages');
	const cachedIds = modCache ? (JSON.parse(modCache).items || []).map((it) => Number(it.mid)) : [];
	assert('服务消息:置顶服务消息不写入 moderation_messages', !cachedIds.includes(8800), JSON.stringify(cachedIds));

	// 同一用户的正常发言仍应缓存（不能因为修复而漏掉真实发言）
	resetCalls();
	await post({
		message_id: 8801,
		chat: { id: -1001, type: 'supergroup', title: '测试群' },
		from: { id: 555, is_bot: false, first_name: '置顶管理员' },
		text: '大家好',
	});
	const modCache2 = db._store.get('moderation_messages');
	const cachedIds2 = modCache2 ? (JSON.parse(modCache2).items || []).map((it) => Number(it.mid)) : [];
	assert('服务消息:同一用户的正常发言仍正常缓存', cachedIds2.includes(8801), JSON.stringify(cachedIds2));

	// 入群/退群服务消息同样不得进缓存
	resetCalls();
	await post({
		message_id: 8802,
		chat: { id: -1001, type: 'supergroup', title: '测试群' },
		from: { id: 556, is_bot: false, first_name: '路人' },
		left_chat_member: { id: 778, is_bot: false, first_name: '离群者' },
	});
	const modCache3 = db._store.get('moderation_messages');
	const cachedIds3 = modCache3 ? (JSON.parse(modCache3).items || []).map((it) => Number(it.mid)) : [];
	assert('服务消息:退群服务消息不写入 moderation_messages', !cachedIds3.includes(8802), JSON.stringify(cachedIds3));

	// 置顶【含广告词】的消息，置顶者不得被当成广告发布者处置
	resetCalls();
	const adDb = makeAdD1({ general: ['广告位招租'] });
	const adEnvLocal = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', AD_FILTER_ENABLED: 'true', DB: adDb };
	sandbox.fetch = adFetchMock();
	await handler.fetch(new Request('https://x.com/', {
		method: 'POST',
		body: JSON.stringify({ message: {
			message_id: 8810,
			chat: { id: -1001, type: 'supergroup', title: '测试群' },
			from: { id: 557, is_bot: false, first_name: '置顶管理员' },
			pinned_message: { message_id: 8805, chat: { id: -1001, type: 'supergroup' }, from: { id: 779, is_bot: false }, text: '广告位招租 日入过千 联系我 @adseller123' },
		} }),
	}), adEnvLocal, fakeCtxAd);
	assert('服务消息:置顶含广告词的消息，置顶者不被加黑',
		!adDb._rows.has('557') && !adDb._rows.has('779'));
	assert('服务消息:置顶含广告词的消息，不触发封禁', callsOf('banChatMember').length === 0);

	// 频道关联群组：频道消息自动转发进群、以及这类消息被置顶，都不得进缓存或被处置。
	// 频道身份发言用 sender_chat 而非 from，缓存条件要求 from 存在，天然被排除；
	// 这里显式锁定该行为，防止将来有人放宽条件时把频道置顶重新拖进清扫范围。
	{
		const chDb = makeFakeDB([]);
		const chEnv = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', MSG_CACHE_ENABLED: 'true', AD_FILTER_ENABLED: 'true', DB: chDb };
		const CHANNEL_ID = -1009999999;
		const chPost = (message) => handler.fetch(new Request('https://x.com/', {
			method: 'POST', body: JSON.stringify({ message }),
		}), chEnv, fakeCtxAd);

		resetCalls();
		// 频道消息自动转发到关联群
		await chPost({
			message_id: 9101,
			chat: { id: -1001, type: 'supergroup', title: '测试群' },
			sender_chat: { id: CHANNEL_ID, type: 'channel', title: '我的频道' },
			is_automatic_forward: true,
			text: '频道公告：本周活动开始',
		});
		// 该自动转发消息被管理员置顶
		await chPost({
			message_id: 9102,
			chat: { id: -1001, type: 'supergroup', title: '测试群' },
			from: { id: 558, is_bot: false, first_name: '置顶管理员' },
			pinned_message: {
				message_id: 9101,
				chat: { id: -1001, type: 'supergroup' },
				sender_chat: { id: CHANNEL_ID, type: 'channel', title: '我的频道' },
				is_automatic_forward: true,
				text: '频道公告：本周活动开始',
			},
		});
		const chCache = chDb._store.get('moderation_messages');
		const chIds = chCache ? (JSON.parse(chCache).items || []).map((it) => Number(it.mid)) : [];
		assert('服务消息:频道自动转发消息与其置顶服务消息都不进清扫缓存',
			!chIds.includes(9101) && !chIds.includes(9102), JSON.stringify(chIds));
		assert('服务消息:频道关联群场景不触发删除与封禁',
			callsOf('deleteMessage').length === 0 && callsOf('banChatMember').length === 0);
	}

	// 真实自动转发帖:Telegram 用 from=777000（服务账号，is_bot 为 falsy）+ sender_chat（来源频道）
	// + is_automatic_forward=true 投递到关联讨论群。它有 from 且非 bot、有正文、无服务消息字段，
	// 会穿过 handleMessage 顶部早退进入广告检测；resolveAdIdentityProfile 把 sender_chat（频道）
	// 当检测对象，频道名一旦像广告就删掉这条转发帖 —— 被删的若正是被置顶那条，Telegram 自动取消置顶。
	// 这是用户实测「频道置顶被机器人删除并取消」的真实成因（旧 [97] 用例没带 from，靠早退侥幸挡住，未暴露）。
	// 用【会命中广告身份判据的频道名】做最强验证：即便内容像广告，自动转发帖也绝不被治理。
	{
		resetCalls();
		const afDb = makeAdD1({ identity: ['约炮'] });
		const afEnv = { TOKEN, BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999', MSG_CACHE_ENABLED: 'true', AD_FILTER_ENABLED: 'true', DB: afDb };
		sandbox.fetch = adFetchMock();
		await handler.fetch(new Request('https://x.com/', {
			method: 'POST',
			body: JSON.stringify({ message: {
				message_id: 9201,
				chat: { id: -1001, type: 'supergroup', title: '关联讨论群' },
				from: { id: 777000, is_bot: false, first_name: 'Telegram' },
				sender_chat: { id: -1009999999, type: 'channel', title: '约炮资源频道', username: 'adchannel' },
				is_automatic_forward: true,
				text: '约炮资源 加频道看',
			} }),
		}), afEnv, fakeCtxAd);
		assert('频道自动转发:带 from=777000 的广告身份转发帖不被删除',
			callsOf('deleteMessage').length === 0);
		assert('频道自动转发:不封禁来源频道或服务账号',
			callsOf('banChatMember').length === 0 && !afDb._rows.has('777000') && !afDb._rows.has('-1009999999'));
		const afCache = afDb._store.get('moderation_messages');
		const afRecent = afDb._store.get('recent_messages');
		assert('频道自动转发:不进清扫缓存也不进疑似广告缓存',
			!afCache && !afRecent);
	}

	sandbox.fetch = savedFetch;
}

// ---------- 总结 ----------
console.log(`\n=== 总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
