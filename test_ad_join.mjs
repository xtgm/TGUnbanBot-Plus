// 入群专用封禁线 + 入群检查流水 离线测试。
// 与 test_profile_shape.mjs 同范式：vm 加载 _worker.js、Telegram 全 mock、
// D1 用 node:sqlite 真实 SQLite。运行：node test_ad_join.mjs
//
// 覆盖六件事：
//   ① AD_JOIN_SCORE_THRESHOLD 的解析：默认 9、设 0 回落消息线、设得比消息线还低时取 max
//   ② 门槛真的生效：同一份 6 分资料，走消息路径封、走进群路径不封
//   ③ 关掉入群线（=0）后行为回到改动之前
//   ④ 入群【每次】都记流水，含 verdict=pass 的正常号
//   ⑤ /adstats 能看到「检查过、正常」
//   ⑥ 热路径：普通群消息零 ad_join_checks 查询

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(__dirname, '_worker.js');
const src = fs.readFileSync(workerPath, 'utf8');

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

// ---------- D1 兼容层（真实 SQLite，记录每条 SQL 供热路径断言）----------
function makeD1() {
	const db = new DatabaseSync(':memory:');
	const sqlLog = [];
	const normIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const k of Object.keys(row)) out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
		return out;
	};
	const exec = (sql, params = []) => {
		sqlLog.push(String(sql).replace(/\s+/g, ' ').trim());
		const st = db.prepare(sql);
		const bound = (params || []).map(normIn);
		const head = sql.trim().slice(0, 6).toUpperCase();
		if (head === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) {
			return { kind: 'rows', rows: st.all(...bound).map(normOut) };
		}
		const info = st.run(...bound);
		const meta = { changes: info.changes, last_row_id: info.lastInsertRowid };
		return { kind: 'run', success: true, meta, results: [{ success: true, meta }] };
	};
	return {
		prepare(sql) {
			const stmtFor = (args) => ({
				all: async () => ({ results: exec(sql, args).rows || [], success: true }),
				first: async () => (exec(sql, args).rows || [])[0] ?? null,
				run: async () => exec(sql, args),
				bind: (...more) => stmtFor(more)
			});
			return stmtFor([]);
		},
		exec: async (sql) => { db.exec(sql); sqlLog.push(String(sql).replace(/\s+/g, ' ').trim()); return { results: [], success: true }; },
		// 必须 await —— 不 await 会返回 Promise 数组，batch[i].results 为 undefined，
		// /adstats 前半段（指纹库/样本/白名单/头像计数）会静默读成 0：查库明明正常，
		// 看着却像产品缺陷。实际是 mock 少了 await。
		batch: async (stmts) => Promise.all(stmts.map((st) => st.run())),
		query(sql, ...params) { return db.prepare(sql).all(...params).map(normOut); },
		_sql: sqlLog,
		_raw: db
	};
}

// ---------- 断言 ----------
let pass = 0, fail = 0;
const failures = [];
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

// ---------- Telegram Bot API mock ----------
const calls = [];
let apiHandlers = {};
function setApi(next = {}) { apiHandlers = next; }
function resetCalls() { calls.length = 0; setApi(); }
function callsOf(method) { return calls.filter((c) => c.method === method); }

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777001, is_bot: true, username: 'JoinTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 7000 + calls.length } };
		case 'getChat': return { ok: true, result: { id: body?.chat_id, first_name: '未知', bio: '' } };
		case 'getChatMember': return { ok: true, result: { status: 'member', user: { id: body?.user_id } } };
		case 'getChatAdministrators': return { ok: true, result: [] };
		default: return { ok: true, result: true };
	}
}

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const raw = String(url);
		const method = raw.split('/').pop();
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
const GROUP_ID = '-1001111111111';
const OWNER_ID = 10001;

// 走一次 /start 让启动期初始化跑完
const handler = W.__handler;
const bootEnv = { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID), DB: makeD1() };
resetCalls();
await handler.fetch(new Request('https://example.workers.dev/', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ update_id: 1, message: { message_id: 1, date: 1, text: '/start', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' } } })
}), bootEnv, { waitUntil() {} });

function makeEnv(extra = {}) {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID), DB: makeD1(), ...extra };
}

// 实测这份 bio 的分数（作为「够消息线、不够入群线」的前提自校验）
const SIX_POINT_BIO = '专业收号 秒结 秒到账';
const CLEAN_BIO = '喜欢摄影和徒步';

async function bioScore(env) {
	const whitelist = await W.loadAdDomainWhitelist(env);
	const r = await W.scoreAdProfile({ bio: SIX_POINT_BIO, firstName: '张三', username: '' },
		{ whitelist, skipMissingBioPenalty: false });
	return r.score;
}

// 走一次入群筛查。bio / 头像都通过 mock getChat 注入（不同 userId 互不串缓存）
async function joinScreen(env, userId, bio, photo) {
	setApi({
		getChat: (body) => ({
			payload: {
				ok: true,
				result: { id: body?.chat_id, first_name: '测试用户', username: '', bio, ...(photo ? { photo } : {}) }
			}
		})
	});
	return W.screenAdJoinMember(env, { id: userId, is_bot: false, first_name: '测试用户' }, {
		chatId: GROUP_ID,
		chatTitle: '测试群',
		messageId: null,
		skipBlacklistCheck: true,
		source: 'new_chat_members'
	});
}

// ================= [1] 配置解析 =================
section('[1] AD_JOIN_SCORE_THRESHOLD 解析');
{
	const base = { AD_SCORE_THRESHOLD: '7' };
	// 默认 0 = 沿用消息线：行为与加这个开关之前逐字一致，
	// 因为抬高入群线会先打掉「7 分私有链接进群即封」那条能力（见 _worker.js 常量注释）。
	assert('不配置 → 默认 0（= 沿用消息线）',
		W.loadAdDetectionConfig(base).joinScoreThreshold === 0,
		String(W.loadAdDetectionConfig(base).joinScoreThreshold));
	assert('配置 12 → 12',
		W.loadAdDetectionConfig({ ...base, AD_JOIN_SCORE_THRESHOLD: '12' }).joinScoreThreshold === 12);
	assert('配置 9 → 9（想要更严时的推荐值）',
		W.loadAdDetectionConfig({ ...base, AD_JOIN_SCORE_THRESHOLD: '9' }).joinScoreThreshold === 9);
	assert('显式配置 0 与不配置等价',
		W.loadAdDetectionConfig({ ...base, AD_JOIN_SCORE_THRESHOLD: '0' }).joinScoreThreshold === 0);
	assert('空串回落默认值 0',
		W.loadAdDetectionConfig({ ...base, AD_JOIN_SCORE_THRESHOLD: '' }).joinScoreThreshold === 0,
		String(W.loadAdDetectionConfig({ ...base, AD_JOIN_SCORE_THRESHOLD: '' }).joinScoreThreshold));
	assert('乱填回落默认值 0',
		W.loadAdDetectionConfig({ ...base, AD_JOIN_SCORE_THRESHOLD: 'abc' }).joinScoreThreshold === 0);
	assert('消息线字段仍在（改动没挤掉它）',
		W.loadAdDetectionConfig(base).scoreThreshold === 7);
}

// ================= [2] 门槛真的生效 =================
section('[2] 入群线高于消息线时，够消息线的资料不封');
{
	// 【为什么要关结构通道】结构查杀是布尔定罪（AD_CARD_KILL=ban 时命中即封、
	// 不看任何分数阈值，见 evaluateAdSuspect 的 `structureBan → hardHit`），
	// 而广告形态的 bio 几乎必然命中它。不关掉就测不出「分数档的入群线」这一层。
	// 结构通道自己怎么对待入群线，在 [9] 单独锁。
	const env = makeEnv({ AD_SCORE_THRESHOLD: '6', AD_JOIN_SCORE_THRESHOLD: '9', AD_CARD_KILL: 'off' });
	await W.adDetectionReady(env);
	await W.ensureAdJoinChecksTable(env);

	const score = await bioScore(env);
	assert('【前提】该 bio 实测 ' + score + ' 分，够消息线 6', score >= 6, String(score));
	assert('【前提】不够入群线 9', score < 9, String(score));

	// 对照：同一份资料走【消息路径】的阈值裁决 → 封
	const whitelist = await W.loadAdDomainWhitelist(env);
	const msgEval = await W.evaluateAdSuspect(env,
		{ profile: { bio: SIX_POINT_BIO, firstName: '张三', username: '', bioFetched: true }, text: '', forwardChat: null },
		{ config: W.loadAdDetectionConfig(env), whitelist, skipMissingBioPenalty: false });
	assert('消息路径（阈值 6）判为封禁', msgEval.verdict === 'ban',
		JSON.stringify({ verdict: msgEval.verdict, score: msgEval.score, threshold: msgEval.threshold }));

	// 真走进群路径 → 入群线 9 挡住
	resetCalls();
	const verdict = await joinScreen(env, '888001', SIX_POINT_BIO);
	assert('入群路径【不封】（只转观察或正常）', verdict !== 'banned', String(verdict));
	assert('入群路径没删任何消息', callsOf('deleteMessage').length === 0);
	assert('入群路径没封禁', callsOf('banChatMember').length === 0);
	const black = Number(env.DB.query('SELECT COUNT(*) AS c FROM blacklist WHERE id = ?', '888001')[0].c);
	assert('入群路径没写黑名单', black === 0, String(black));

	// 回执里显示的是入群线，不是消息线
	const rows = await W.readAdJoinChecks(env, { chatId: GROUP_ID, limit: 5 });
	assert('流水里 threshold 记的是入群线 9', rows.some((r) => Number(r.threshold) === 9),
		JSON.stringify(rows.map((r) => r.threshold)));
}

// ================= [3] 关掉入群线 → 回到改动之前 =================
section('[3] AD_JOIN_SCORE_THRESHOLD=0 沿用消息线');
{
	const env = makeEnv({ AD_SCORE_THRESHOLD: '6', AD_JOIN_SCORE_THRESHOLD: '0', AD_CARD_KILL: 'off' });
	await W.adDetectionReady(env);
	await W.ensureAdJoinChecksTable(env);

	resetCalls();
	const verdict = await joinScreen(env, '888002', SIX_POINT_BIO);
	assert('关掉入群线后同样资料【会封】', verdict === 'banned', String(verdict));
	assert('确实执行了封禁', callsOf('banChatMember').length >= 1);
}

// ================= [4] max 防线 =================
section('[4] 入群线配得比消息线还低时取 max');
{
	// 配 3 < 消息线 6：若实现错把 3 当入群线，6 分就会被封；
	// 正确实现取 max(3,6)=6，而 6 分正好卡在线上 → 仍封，所以要用更高入群线才能区分。
	// 这里改成入群线 9 的镜像：配 3 但消息线 10，6 分既够不了 10 也够不了 max(3,10)=10。
	const env = makeEnv({ AD_SCORE_THRESHOLD: '10', AD_JOIN_SCORE_THRESHOLD: '3', AD_CARD_KILL: 'off' });
	await W.adDetectionReady(env);
	await W.ensureAdJoinChecksTable(env);

	resetCalls();
	const verdict = await joinScreen(env, '888003', SIX_POINT_BIO);
	const cfg = W.loadAdDetectionConfig(env);
	const expectedLine = Math.max(cfg.joinScoreThreshold, cfg.scoreThreshold);
	assert('实际生效的入群线是 max(' + cfg.joinScoreThreshold + ', ' + cfg.scoreThreshold + ') = ' + expectedLine,
		expectedLine === 10, String(expectedLine));
	assert('低于该线的资料不封（证明没有直接用配置的 3）', verdict !== 'banned', String(verdict));
}

// ================= [5] 每次入群都记流水 =================
section('[5] 入群检查流水（含判为正常的）');
{
	const env = makeEnv({ AD_SCORE_THRESHOLD: '6', AD_JOIN_SCORE_THRESHOLD: '9', AD_CARD_KILL: 'off' });
	await W.adDetectionReady(env);
	await W.ensureAdJoinChecksTable(env);

	const before = Number(env.DB.query('SELECT COUNT(*) AS c FROM ad_join_checks')[0].c);

	// 正常号 → pass
	const v1 = await joinScreen(env, '888011', CLEAN_BIO);
	// 广告资料但不到入群线 → observe
	const v2 = await joinScreen(env, '888012', SIX_POINT_BIO);

	const after = env.DB.query('SELECT * FROM ad_join_checks ORDER BY id');
	assert('两次入群写了两条流水', after.length === before + 2,
		JSON.stringify({ before, after: after.length }));
	assert('正常号 verdict=pass（不是空的）', after.some((r) => r.user_id === '888011' && r.verdict === 'pass'),
		JSON.stringify(after.map((r) => [r.user_id, r.verdict])));
	assert('广告资料 verdict=observe', after.some((r) => r.user_id === '888012' && r.verdict === 'observe'),
		JSON.stringify(after.map((r) => [r.user_id, r.verdict])));
	assert('流水带判定层', after.every((r) => String(r.layer || '').length > 0),
		JSON.stringify(after.map((r) => r.layer)));
	assert('流水带判据数组', after.every((r) => Array.isArray(JSON.parse(r.reasons))),
		JSON.stringify(after.map((r) => r.reasons)));
	assert('流水归属本群', after.every((r) => String(r.chat_id) === GROUP_ID));

	const counts = await W.countAdJoinChecks(env, GROUP_ID);
	assert('统计：累计 2', counts.total === 2, JSON.stringify(counts));
	assert('统计：hits 只数 verdict=ban 的（本次为 0）', counts.hits === 0, JSON.stringify(counts));

	// 再来一个真封的（关掉入群线）
	await W.setDryRun?.(env, GROUP_ID, false, OWNER_ID);   // 演练关着（默认关）
	const env2 = makeEnv({ AD_SCORE_THRESHOLD: '6', AD_JOIN_SCORE_THRESHOLD: '0', AD_CARD_KILL: 'off' });
	await W.adDetectionReady(env2);
	await W.ensureAdJoinChecksTable(env2);
	await joinScreen(env2, '888013', SIX_POINT_BIO);
	const counts2 = await W.countAdJoinChecks(env2, GROUP_ID);
	assert('封禁那次计入 hits', counts2.hits === 1 && counts2.total === 1, JSON.stringify(counts2));
}

// ================= [6] /adstats 展示 =================
section('[6] /adstats 入群检查屏');
{
	const env = makeEnv({ AD_SCORE_THRESHOLD: '6', AD_JOIN_SCORE_THRESHOLD: '9', AD_CARD_KILL: 'off' });
	await W.adDetectionReady(env);
	await joinScreen(env, '888021', CLEAN_BIO);
	await joinScreen(env, '888022', SIX_POINT_BIO);

	resetCalls();
	await W.handleAdStatsCommand(env, GROUP_ID);
	const out = callsOf('sendMessage').map((c) => String(c.body?.text || '')).join('\n');
	assert('有入群检查屏', out.includes('入群检查'), out.slice(0, 300));
	assert('显示今日人数与累计条数', /今日 <b>2<\/b> 人/.test(out), out.slice(0, 600));
	assert('点出入群线与消息线的区别', out.includes('封禁线 <b>9</b>（消息线 6）'), out.slice(0, 700));
	assert('说明「没到线只转观察不拦」', out.includes('没到线只转观察不拦'), out.slice(0, 700));
	assert('列出检查记录（能看到正常号）', out.includes('正常'), out.slice(-700));
}

// ================= [7] 热路径 =================
section('[7] 热路径：普通群消息零 ad_join_checks 查询');
{
	const env = makeEnv({ AD_SCORE_THRESHOLD: '6', AD_JOIN_SCORE_THRESHOLD: '9', AD_CARD_KILL: 'off' });
	await W.adDetectionReady(env);
	await W.ensureAdJoinChecksTable(env);

	env.DB._sql.length = 0;
	resetCalls();
	await handler.fetch(new Request('https://example.workers.dev/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			update_id: 1,
			message: {
				message_id: 703,
				chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试群' },
				from: { id: 23456, is_bot: false, first_name: '普通用户' },
				text: '普通聊天内容'
			}
		})
	}), env, { waitUntil() {} });
	const joinSql = env.DB._sql.filter((sql) => sql.includes('ad_join_checks'));
	assert('普通发言零 ad_join_checks 查询', joinSql.length === 0, JSON.stringify(joinSql));

	// 判定链本身也不该碰它（入群流水只挂在 screenAdJoinMember 上）
	env.DB._sql.length = 0;
	const whitelist = await W.loadAdDomainWhitelist(env);
	await W.evaluateAdSuspect(env,
		{ profile: { bio: CLEAN_BIO, firstName: '普通用户', username: '', bioFetched: true }, text: '普通聊天', forwardChat: null },
		{ config: W.loadAdDetectionConfig(env), whitelist, skipMissingBioPenalty: false });
	const chainSql = env.DB._sql.filter((sql) => sql.includes('ad_join_checks'));
	assert('判定链零 ad_join_checks 查询', chainSql.length === 0, JSON.stringify(chainSql));
}

// ================= [8] 强证据与入群线解耦 =================
section('[8] 强证据不走分数阈值（源码断言）');
{
	const code = fs.readFileSync(workerPath, "utf8");
	// 构造一个真的 hardHit 要跨指纹归一化 / 匹配 / 缓存全链路，与本测试的目标
	//（门槛只收紧「凭资料卡凑分数」这一条路）无关，所以直接锁住裁决表达式本身。
	assert('hardHit = 指纹 ∨ AI ∨ 结构（三者都不看分数阈值）',
			code.includes('const hardHit = fingerprintBan || aiHardHit || structureBan'));
	assert('裁决是「达线 或 硬命中」——入群线只收紧前半段',
			code.includes('score >= config.scoreThreshold || hardHit'));
	assert('结构封禁由 AD_CARD_KILL 单独定档，与任何分数线无关',
			code.includes("const structureBan = structure.guilty && config.structureKill === 'ban';"));
	assert('入群线只覆盖 scoreThreshold（走 joinConfig 分支）',
			code.includes('{ config: joinConfig, whitelist, skipMissingBioPenalty'));
	
	// screenAdJoinMember 内的顺序：入群线 → 评分 → 头像覆盖。
	// 头像定罪在评分之后、不经 joinConfig，属于另一条强证据通道。
	const iJoin = code.indexOf('const joinConfig =');
	const iEval = code.indexOf('const baseEvaluation = await evaluateAdSuspect(', iJoin);
	const iAvatar = code.indexOf('const evaluation = await applyAvatarToEvaluation(env, baseEvaluation, profile)', iEval);
	assert('入群路径顺序：入群线 → 评分 → 头像', iJoin > -1 && iEval > iJoin && iAvatar > iEval,
			JSON.stringify({ iJoin, iEval, iAvatar }));
}

// ================= [9] 默认配置下结构通道绕过入群线 =================
section('[9] 默认配置：结构通道绕过入群线（已知取向，锁住别被静默改）');
{
	// 必须让人看见的一条：入群线【只】作用于「凭资料卡凑分数」这一档。
	// 结构查杀（AD_CARD_KILL=ban，默认值）是布尔定罪，命中即封、不看任何分数线 ——
	// 而实测广告形态的 bio 几乎必然命中它，所以默认配置下入群线实际挡下的很少。
	// menshen 的取向一致：必封规则与资料形状都排在采信线【之前】直接处置，
	// 只有 AI 那一档受采信线约束。
	// 这条断言的意义：谁想让结构通道也受入群线约束，必须先改这里，
	// 并想清楚那等于把「结构通道抓到的广告」放进群（漏放面）。
	const env = makeEnv({ AD_SCORE_THRESHOLD: '6', AD_JOIN_SCORE_THRESHOLD: '9' });   // 不关结构
	await W.adDetectionReady(env);
	await W.ensureAdJoinChecksTable(env);
	const cfg = W.loadAdDetectionConfig(env);
	assert('默认 structureKill = ban', cfg.structureKill === 'ban', String(cfg.structureKill));
	
	resetCalls();
	const v = await joinScreen(env, '888031', SIX_POINT_BIO);
	assert('结构命中时 6 分 < 入群线 9 照样封（绕过入群线）', v === 'banned', String(v));
	assert('确实执行了处置', callsOf('banChatMember').length >= 1);
	
	const row = (await W.readAdJoinChecks(env, { chatId: GROUP_ID, limit: 1 }))[0];
	assert('流水仍如实记 score=6 / threshold=9（看板能直接看出绕过）',
			row && Number(row.score) === 6 && Number(row.threshold) === 9,
			JSON.stringify(row && { score: row.score, threshold: row.threshold }));
}


// ================= [10] 入群直接触发 bio + 头像检测 =================
section('[10] 入群那一刻：bio 与头像检测都真的跑了');
{
	// 这一段回答主人的问题「入群直接触发 bio 头像检测是否成功」——
	// 不是读代码推演，是走一遍 screenAdJoinMember，看 Telegram 调用与 D1 查询的实据。
	const env = makeEnv({ AD_SCORE_THRESHOLD: '6', AD_JOIN_SCORE_THRESHOLD: '0', AD_CARD_KILL: 'off' });
	await W.adDetectionReady(env);
	await W.ensureAdJoinChecksTable(env);

	// —— ① bio：入群那一刻必须真的发出 getChat ——
	env.DB._sql.length = 0;
	resetCalls();
	await joinScreen(env, '888041', CLEAN_BIO, { big_file_unique_id: 'AVNEW1', big_file_id: 'fid-new' });
	const getCalls = callsOf('getChat');
	assert('入群发出了 getChat（拉 bio 与资料卡）', getCalls.length >= 1, JSON.stringify(getCalls));
	assert('getChat 打的是这个新成员本人', getCalls.length > 0 && String(getCalls[0].body?.chat_id) === '888041',
		JSON.stringify(getCalls.map((c) => c.body?.chat_id)));

	// —— ② 头像：查了指纹库，且首见登记成 pending ——
	const avatarSql = env.DB._sql.filter((sql) => sql.includes('ad_avatars'));
	assert('入群查了头像指纹库 ad_avatars', avatarSql.length >= 1, JSON.stringify(avatarSql));
	const avRow = env.DB.query('SELECT file_unique_id, verdict FROM ad_avatars WHERE file_unique_id = ?', 'AVNEW1');
	assert('首见头像被登记（verdict=pending，供视觉识别排队）',
		avRow.length === 1 && String(avRow[0].verdict) === 'pending', JSON.stringify(avRow));
	assert('头像已进本轮入群流水的判据链（记录已写）',
		Number(env.DB.query('SELECT COUNT(*) AS c FROM ad_join_checks')[0].c) >= 1);

	// —— ③ 已定罪头像：干净 bio 也照样进群即封 ——
	const env2 = makeEnv({ AD_SCORE_THRESHOLD: '6', AD_JOIN_SCORE_THRESHOLD: '0', AD_CARD_KILL: 'off' });
	await W.adDetectionReady(env2);
	await W.ensureAdJoinChecksTable(env2);
	const now = Math.floor(Date.now() / 1000);
	env2.DB.query(
		'INSERT INTO ad_avatars (file_unique_id, verdict, hits, file_id, source, last_user_id, vision_checked_at, created_at, updated_at)'
		+ ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
		'AVBAD', 'ad', 2, 'fid-bad', 'test', '', 0, now, now);

	resetCalls();
	const v = await joinScreen(env2, '888042', CLEAN_BIO, { big_file_unique_id: 'AVBAD', big_file_id: 'fid-bad' });
	// 干净 bio = 0 分（< 消息线 6）、AD_CARD_KILL=off（结构不封）、入群线=消息线 ——
	// verdict 只可能来自头像分档（hits>=2 → ban）。
	assert('已定罪头像（复用 2 次）入群即封，不等他发言', v === 'banned', String(v));
	assert('确实执行了封禁', callsOf('banChatMember').length >= 1, JSON.stringify(callsOf('banChatMember')));
	const row2 = (await W.readAdJoinChecks(env2, { chatId: GROUP_ID, limit: 1 }))[0];
	assert('流水判据里写明是头像命中的',
		row2 && JSON.parse(row2.reasons).some((r) => String(r).includes('头像命中广告图库')),
		JSON.stringify(row2 && row2.reasons));
	assert('封禁来自头像而非分数（score 仍是 0 分档）',
		row2 && Number(row2.score) < 6, JSON.stringify(row2 && { score: row2.score, threshold: row2.threshold }));

	// —— ④ 单证（复用 1 次、无其它佐证）只进观察，不封 ——
	const env3 = makeEnv({ AD_SCORE_THRESHOLD: '6', AD_JOIN_SCORE_THRESHOLD: '0', AD_CARD_KILL: 'off' });
	await W.adDetectionReady(env3);
	await W.ensureAdJoinChecksTable(env3);
	env3.DB.query(
		'INSERT INTO ad_avatars (file_unique_id, verdict, hits, file_id, source, last_user_id, vision_checked_at, created_at, updated_at)'
		+ ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
		'AVONCE', 'ad', 1, 'fid-once', 'test', '', 0, now, now);
	resetCalls();
	const v3 = await joinScreen(env3, '888043', CLEAN_BIO, { big_file_unique_id: 'AVONCE', big_file_id: 'fid-once' });
	assert('单证头像（复用 1 次、bio 干净）只进观察不封', v3 !== 'banned', String(v3));
	assert('单证这次没封', callsOf('banChatMember').length === 0);
}

console.log(`\n========== 入群专用门槛与流水：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
