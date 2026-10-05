// 演练模式（dryrun）离线测试。与 test_profile_shape.mjs 同范式：
// vm 加载 _worker.js、Telegram API 全 mock、D1 用 node:sqlite 真实 SQLite。
// 运行：node test_dryrun.mjs
//
// 覆盖五件事：
//   ① 开关表与命令（第一主人权限、翻转、status、非配置群拦截）
//   ② 演练短路：判定命中后一个人都不动 —— 不加黑、不封禁、不删消息、
//      不学指纹 / 样本 / 形状 / 头像、不写 /ignore 快照、不清观察记录
//   ③ 但流水要写、带 🧪 的私聊要推到第一主人
//   ④ 关掉演练后恢复正常处置（防「关了还在演练」）
//   ⑤ 热路径：isDryRunGroup 只在定罪时查，普通发言零 dryrun_groups 查询

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '_worker.js'), 'utf8');

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

// ---------- D1 兼容层（真实 SQLite，额外记录每条 SQL 供热路径断言）----------
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
		const bound = params.map(normIn);
		const head = sql.trim().slice(0, 6).toUpperCase();
		if (head === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) {
			return { kind: 'rows', rows: st.all(...bound).map(normOut) };
		}
		const info = st.run(...bound);
		// 真实 D1 的 .run() 把 changes / last_row_id 放在【顶层 meta】上。
		const meta = { changes: info.changes, last_row_id: info.lastInsertRowid };
		return { kind: 'run', success: true, meta, results: [{ success: true, meta }] };
	};
	const api = {
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
		batch: async (stmts) => stmts.map((st) => st.run()),
		query(sql, ...params) { return db.prepare(sql).all(...params).map(normOut); },
		_sql: sqlLog,
		_raw: db
	};
	return api;
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
		case 'getMe': return { ok: true, result: { id: 777001, is_bot: true, username: 'DryRunTestBot' } };
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

function makeEnv(extra = {}) {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID), DB: makeD1(), ...extra };
}

// 走一次 /start 让启动期初始化跑完（与其它测试一致）
const handler = W.__handler;
const bootEnv = makeEnv();
resetCalls();
await handler.fetch(new Request('https://example.workers.dev/', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ update_id: 1, message: { message_id: 1, date: 1, text: '/start', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' } } })
}), bootEnv, { waitUntil() {} });

// 群内发一条命令，返回发出的全部 sendMessage 文本
async function sendGroupCommand(env, text, fromId = OWNER_ID) {
	resetCalls();
	await handler.fetch(new Request('https://example.workers.dev/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			update_id: 1,
			message: {
				message_id: 42, date: 1, text,
				chat: { id: GROUP_ID, type: 'supergroup', title: '测试群' },
				from: { id: fromId, is_bot: false, first_name: '发送者' }
			}
		})
	}), env, { waitUntil() {} });
	return callsOf('sendMessage').map((c) => String(c.body?.text || ''));
}

const AD_BIO = '专业收号 秒结 秒到账';

// ================= [1] 表与开关读写 =================
section('[1] 开关表与读写');
{
	const env = makeEnv();
	assert('开关表可建', (await W.ensureDryRunTable(env)) === true);
	const cols = env.DB.query("PRAGMA table_info(dryrun_groups)").map((c) => c.name);
	assert('列含 chat_id / enabled / by_user / at',
		cols.includes('chat_id') && cols.includes('enabled') && cols.includes('by_user') && cols.includes('at'),
		JSON.stringify(cols));

	assert('默认未开', (await W.isDryRunGroup(env, GROUP_ID)) === false);

	const on = await W.setDryRun(env, GROUP_ID, true, OWNER_ID);
	assert('setDryRun 写入成功', on.ok === true && on.on === true, JSON.stringify(on));
	assert('写后读回开启', (await W.isDryRunGroup(env, GROUP_ID)) === true);

	const other = '-1009999999999';
	assert('别的群不受影响', (await W.isDryRunGroup(env, other)) === false);

	const off = await W.setDryRun(env, GROUP_ID, false, OWNER_ID);
	assert('关闭写入成功', off.ok === true && off.on === false, JSON.stringify(off));
	assert('关闭后读回 false', (await W.isDryRunGroup(env, GROUP_ID)) === false);

	const map = await W.readDryRunStateMap(env);
	assert('状态表只列已开的群', map.size === 0, JSON.stringify([...map.keys()]));
	await W.setDryRun(env, GROUP_ID, true, OWNER_ID);
	const map2 = await W.readDryRunStateMap(env);
	assert('开后状态表能列出该群', map2.has(GROUP_ID));

	// 演练两张表都按需建、不进广告层完整性复验 —— 建失败只该丢演练，
	// 不能连累广告检测整体判为「未就绪」而把真处置一起停摆。
	await W.adDetectionReady(env);
	assert('广告层仍就绪（演练表不在完整性列表里）', (await W.d1AdDetectionTablesExist(env)) === true);
	assert('演练流水表由 ensure 函数自己建', (await W.ensureAdDryRunLogTable(env)) === true);
	const dryCols = env.DB.query("PRAGMA table_info(ad_dryrun_log)").map((c) => c.name);
	assert('流水表含判据列', dryCols.includes('reasons') && dryCols.includes('score') && dryCols.includes('threshold'),
		JSON.stringify(dryCols));
}

// ================= [2] 命令 =================
section('[2] /dryrun 命令');
{
	const env = makeEnv();
	await W.adDetectionReady(env);

	// 非第一主人：静默，一条消息都不回
	const byStranger = await sendGroupCommand(env, '/dryrun', 999001);
	assert('非第一主人静默（不回任何消息）', byStranger.length === 0, JSON.stringify(byStranger));
	assert('非第一主人也不改开关', (await W.isDryRunGroup(env, GROUP_ID)) === false);

	// 第一主人裸 /dryrun = 翻转开
	let texts = await sendGroupCommand(env, '/dryrun');
	assert('裸 /dryrun 已处理（有回执）', texts.length > 0, JSON.stringify(texts));
	assert('回执说明已开启', texts.some((t) => t.includes('演练模式已开启')), JSON.stringify(texts));
	assert('回执写明不设防代价', texts.some((t) => t.includes('完全不设防')), JSON.stringify(texts));
	assert('开关已开', (await W.isDryRunGroup(env, GROUP_ID)) === true);

	// status 只看不改
	texts = await sendGroupCommand(env, '/dryrun status');
	assert('status 回执标出开启', texts.some((t) => t.includes('演练模式【开启】')), JSON.stringify(texts));
	assert('status 不改开关', (await W.isDryRunGroup(env, GROUP_ID)) === true);

	// 显式 off
	texts = await sendGroupCommand(env, '/dryrun off');
	assert('off 回执确认关闭', texts.some((t) => t.includes('演练模式已关闭')), JSON.stringify(texts));
	assert('开关确实关闭', (await W.isDryRunGroup(env, GROUP_ID)) === false);

	// 私聊列出状态
	texts = await sendGroupCommand(env, '/dryrun');
	assert('开回后再私聊能列出本群', await (async () => {
		resetCalls();
		await handler.fetch(new Request('https://example.workers.dev/', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ update_id: 1, message: { message_id: 43, date: 1, text: '/dryrun', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' } } })
		}), env, { waitUntil() {} });
		return callsOf('sendMessage').some((c) => String(c.body?.text || '').includes('已开启的群'));
	})(), '私聊回执未列出已开的群');

	// 非配置群：与 /help /killer 一致，消息入口就把它忽略了，一条都不回。
	// （实测：同一批用例里 /help 与 /killer 在该群同样零回执，不是 /dryrun 独有。）
	const otherEnv = makeEnv({ GROUP_ID: '-1001111111111' });
	resetCalls();
	await handler.fetch(new Request('https://example.workers.dev/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: 1, message: { message_id: 44, date: 1, text: '/dryrun', chat: { id: '-1005555555555', type: 'supergroup', title: '别的群' }, from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' } } })
	}), otherEnv, { waitUntil() {} });
	const stray = callsOf('sendMessage').map((c) => String(c.body?.text || ''));
	assert('非配置群静默（与 /help /killer 同）', stray.length === 0, JSON.stringify(stray));
	assert('非配置群开关未被改动', (await W.isDryRunGroup(otherEnv, '-1005555555555')) === false);
}

// ================= [3] 演练短路 =================
section('[3] 演练短路：一个人都不动');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const config = await W.loadAdDetectionConfig(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	const opts = { config, whitelist, skipMissingBioPenalty: false };

	// 流水表是按需建（第一次写演练时才建），关演练的基线计数要先把它建出来，
	// 否则下面 SELECT COUNT 会 no such table —— 那是测试自己的问题，不是产品缺陷。
	await W.ensureAdDryRunLogTable(env);

	// 先造一条观察记录，用来断言演练【不清】观察
	await W.upsertAdScreening(env, '777001', {
		chatId: GROUP_ID, score: 3, reasons: ['测试'], snapshot: { name: 'x' }, layer: 'score'
	}, config);
	const screeningBefore = env.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c;

	// 资料达线的评价注入 ban 结论（与 test_profile_shape 同手法：测的是「演练对处置链做了什么」）
	const evaluation = await W.evaluateAdSuspect(
		env, { profile: { bio: AD_BIO, firstName: '演练号', username: '', bioFetched: true }, text: '', forwardChat: null }, opts);
	const banEval = Object.assign({}, evaluation, { verdict: 'ban' });

	// 关着演练 → 正常处置（基线）
	resetCalls();
	const normal = await W.enforceAdDetection(env,
		{ userId: '666001', chatId: GROUP_ID, chatTitle: '测试群', messageId: 500 },
		banEval, { config, whitelist });
	assert('关演练时正常封禁', normal.banned === true, JSON.stringify({ banned: normal.banned, seq: normal.seq }));
	assert('关演练时消息被删', callsOf('deleteMessage').length >= 1, JSON.stringify(callsOf('deleteMessage')));
	assert('关演练时写进黑名单', Number(env.DB.query('SELECT COUNT(*) AS c FROM blacklist WHERE id = ?', '666001')[0].c) === 1);

	const countsClosed = {
		fingerprints: env.DB.query('SELECT COUNT(*) AS c FROM ad_fingerprints')[0].c,
		samples: env.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c,
		shapes: env.DB.query('SELECT COUNT(*) AS c FROM ad_profile_shapes')[0].c,
		snapshots: env.DB.query('SELECT COUNT(*) AS c FROM ad_pending_snapshots')[0].c,
		drylog: env.DB.query('SELECT COUNT(*) AS c FROM ad_dryrun_log')[0].c
	};

	// 开演练
	await W.setDryRun(env, GROUP_ID, true, OWNER_ID);

	const evaluation2 = await W.evaluateAdSuspect(
		env, { profile: { bio: AD_BIO, firstName: '演练号', username: '', bioFetched: true }, text: '', forwardChat: null }, opts);
	const banEval2 = Object.assign({}, evaluation2, { verdict: 'ban' });

	resetCalls();
	const dry = await W.enforceAdDetection(env,
		{ userId: '666002', chatId: GROUP_ID, chatTitle: '测试群', messageId: 501 },
		banEval2, { config, whitelist });

	assert('演练返回 banned=false 且 dryrun=true',
		dry.banned === false && dry.dryrun === true && dry.seq === null,
		JSON.stringify({ banned: dry.banned, dryrun: dry.dryrun, seq: dry.seq }));
	assert('演练不删消息', callsOf('deleteMessage').length === 0, JSON.stringify(callsOf('deleteMessage')));
	assert('演练不封禁', callsOf('banChatMember').length === 0, JSON.stringify(callsOf('banChatMember')));
	assert('演练不加黑', Number(env.DB.query('SELECT COUNT(*) AS c FROM blacklist WHERE id = ?', '666002')[0].c) === 0);

	const countsOpen = {
		fingerprints: env.DB.query('SELECT COUNT(*) AS c FROM ad_fingerprints')[0].c,
		samples: env.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c,
		shapes: env.DB.query('SELECT COUNT(*) AS c FROM ad_profile_shapes')[0].c,
		snapshots: env.DB.query('SELECT COUNT(*) AS c FROM ad_pending_snapshots')[0].c,
		drylog: env.DB.query('SELECT COUNT(*) AS c FROM ad_dryrun_log')[0].c
	};
	assert('演练不学指纹', countsOpen.fingerprints === countsClosed.fingerprints,
		JSON.stringify({ before: countsClosed.fingerprints, after: countsOpen.fingerprints }));
	assert('演练不学 AI 样本', countsOpen.samples === countsClosed.samples,
		JSON.stringify({ before: countsClosed.samples, after: countsOpen.samples }));
	assert('演练不学资料形状', countsOpen.shapes === countsClosed.shapes,
		JSON.stringify({ before: countsClosed.shapes, after: countsOpen.shapes }));
	assert('演练不写 /ignore 快照', countsOpen.snapshots === countsClosed.snapshots,
		JSON.stringify({ before: countsClosed.snapshots, after: countsOpen.snapshots }));
	assert('演练写入流水 +1', countsOpen.drylog === countsClosed.drylog + 1,
		JSON.stringify({ before: countsClosed.drylog, after: countsOpen.drylog }));

	const screeningAfter = env.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c;
	assert('演练不清观察记录', Number(screeningAfter) === Number(screeningBefore),
		JSON.stringify({ before: screeningBefore, after: screeningAfter }));

	const dryRow = env.DB.query('SELECT * FROM ad_dryrun_log ORDER BY id DESC LIMIT 1')[0];
	assert('流水记下得分与阈值', dryRow && Number(dryRow.score) === banEval2.score && Number(dryRow.threshold) === banEval2.threshold,
		JSON.stringify(dryRow && { score: dryRow.score, threshold: dryRow.threshold }));
	assert('流水记下判据 reasons', dryRow && Array.isArray(JSON.parse(dryRow.reasons)) && JSON.parse(dryRow.reasons).length > 0,
		JSON.stringify(dryRow && dryRow.reasons));
	assert('流水归属本群', dryRow && String(dryRow.chat_id) === GROUP_ID, JSON.stringify(dryRow && dryRow.chat_id));

	// 私聊推给第一主人，且必须一眼看出没动手
	const notices = callsOf('sendMessage').map((c) => String(c.body?.text || ''));
	assert('推了私聊', notices.length > 0, JSON.stringify(notices.slice(0, 2)));
	assert('通知标题是演练命中（未处置）', notices.some((t) => t.includes('演练命中（未处置）')), JSON.stringify(notices));
	assert('通知写明本来会执行什么', notices.some((t) => t.includes('本来会执行')), JSON.stringify(notices));
	assert('通知带关闭提醒', notices.some((t) => t.includes('看完记得关')), JSON.stringify(notices));
	assert('通知不含「广告号自动封禁」', !notices.some((t) => t.includes('广告号自动封禁')), JSON.stringify(notices));
	assert('通知不含 /ignore 引导（没有快照）', !notices.some((t) => t.includes('/ignore')), JSON.stringify(notices));
}

// ================= [4] 关掉演练恢复处置 =================
section('[4] 关闭演练恢复处置');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const config = await W.loadAdDetectionConfig(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	await W.setDryRun(env, GROUP_ID, true, OWNER_ID);
	await W.setDryRun(env, GROUP_ID, false, OWNER_ID);

	const evaluation = await W.evaluateAdSuspect(
		env, { profile: { bio: AD_BIO, firstName: '恢复号', username: '', bioFetched: true }, text: '', forwardChat: null },
		{ config, whitelist, skipMissingBioPenalty: false });
	const banEval = Object.assign({}, evaluation, { verdict: 'ban' });

	resetCalls();
	const result = await W.enforceAdDetection(env,
		{ userId: '666003', chatId: GROUP_ID, chatTitle: '测试群', messageId: 502 },
		banEval, { config, whitelist });
	assert('关掉后恢复封禁', result.banned === true, JSON.stringify({ banned: result.banned }));
	assert('关掉后消息被删', callsOf('deleteMessage').length >= 1);
	assert('关掉后写进黑名单', Number(env.DB.query('SELECT COUNT(*) AS c FROM blacklist WHERE id = ?', '666003')[0].c) === 1);
}

// ================= [5] /adstats 展示 =================
section('[5] /adstats 演练屏');
{
	const env = makeEnv();
	await W.adDetectionReady(env);

	// 关着时
	let out = [];
	const origSend = callsOf;
	resetCalls();
	await W.handleAdStatsCommand(env, GROUP_ID);
	let texts = callsOf('sendMessage').map((c) => String(c.body?.text || ''));
	out = texts.join('\n');
	assert('/adstats 有演练状态行', out.includes('演练模式'), out.slice(0, 200));
	assert('关闭时显示「本群关闭」', out.includes('本群关闭（正常自动处置）'), out.slice(0, 400));

	// 开着
	await W.setDryRun(env, GROUP_ID, true, OWNER_ID);
	resetCalls();
	await W.handleAdStatsCommand(env, GROUP_ID);
	texts = callsOf('sendMessage').map((c) => String(c.body?.text || ''));
	out = texts.join('\n');
	assert('开启时显示「本群【开启】」', out.includes('本群【开启】'), out.slice(0, 500));
	assert('开启时给出不设防提示', out.includes('不删不封'), out.slice(0, 500));

	// 有一条命中后展示计数
	const config = await W.loadAdDetectionConfig(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	const evaluation = await W.evaluateAdSuspect(
		env, { profile: { bio: AD_BIO, firstName: '展示号', username: '', bioFetched: true }, text: '', forwardChat: null },
		{ config, whitelist, skipMissingBioPenalty: false });
	await W.enforceAdDetection(env,
		{ userId: '666004', chatId: GROUP_ID, chatTitle: '测试群', messageId: 503 },
		Object.assign({}, evaluation, { verdict: 'ban' }), { config, whitelist });

	resetCalls();
	await W.handleAdStatsCommand(env, GROUP_ID);
	texts = callsOf('sendMessage').map((c) => String(c.body?.text || ''));
	out = texts.join('\n');
	assert('展示命中计数', /命中：今日 <b>1<\/b> 条/.test(out), out.slice(-500));
	assert('展示最近一条流水（含得分与判据）', out.includes('依据：'), out.slice(-600));
}

// ================= [6] 热路径：开关不进普通消息 =================
section('[6] 热路径（dryrun_groups 不在稳定态查询里）');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const config = await W.loadAdDetectionConfig(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	await W.setDryRun(env, GROUP_ID, true, OWNER_ID);

	// 开着演练 + 走完整判定链，仍不得查一次 dryrun_groups —— 否则热路径要多一条 D1
	env.DB._sql.length = 0;
	await W.evaluateAdSuspect(
		env, { profile: { bio: '喜欢摄影和徒步', firstName: '普通用户', username: '', bioFetched: true }, text: '普通聊天内容', forwardChat: null },
		{ config, whitelist, skipMissingBioPenalty: false });
	const dryQueries = env.DB._sql.filter((sql) => sql.includes('dryrun_groups'));
	assert('判定链零 dryrun_groups 查询', dryQueries.length === 0, JSON.stringify(dryQueries));

	// 命令路径（非热路径）才会查
	env.DB._sql.length = 0;
	await W.isDryRunGroup(env, GROUP_ID);
	assert('定罪路径查得到开关', env.DB._sql.some((sql) => sql.includes('dryrun_groups')), JSON.stringify(env.DB._sql));
}

console.log(`\n========== 演练模式：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
