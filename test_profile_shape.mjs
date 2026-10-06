// 资料形状哈希（同模板批量号跨账号复用）离线测试。
// 与 test_avatar.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_profile_shape.mjs
//
// 覆盖四件事：
//   ① adProfileShape 归一化本身（同模板换链接/换数字必须同形、没区分度不参与）
//   ② 建表与完整性注册（漏注册会让 adDetectionReady 永远不就绪）
//   ③ 定罪即学习 → 复用命中加分 → /ignore 纠错的完整闭环
//   ④ 热路径前置条件：资料分 0 的普通发言【零 ad_profile_shapes 查询】，
//      这是「稳定态核心 SQL ≤ 3 条」那条断言不被形状层撞红的落点

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
		// 真实 D1 的 .run() 把 changes / last_row_id 放在【顶层 meta】上，
		// 源码里的 `res?.meta?.changes` 读的正是它。少写这一层的话，
		// 删行会成功但 removed 恒为 0，断言会误判成「没删掉」。
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
		// 必须 await —— 不 await 会返回 Promise 数组，batch[i].results 为 undefined，
		// /adstats 前半段（指纹库/样本/白名单/头像计数）会静默读成 0：查库明明正常，
		// 看着却像产品缺陷。实际是 mock 少了 await。
		batch: async (stmts) => Promise.all(stmts.map((st) => st.run())),
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
function countCalls(method) { return calls.filter((c) => c.method === method).length; }

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777001, is_bot: true, username: 'ShapeTestBot' } };
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

const handler = W.__handler;
const bootEnv = makeEnv();
resetCalls();
await handler.fetch(new Request('https://example.workers.dev/', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ update_id: 1, message: { message_id: 1, date: 1, text: '/start', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' } } })
}), bootEnv, { waitUntil() {} });

// 干净资料（scoreAdProfile 实测 0 分）与广告资料（实测 6 分）
const CLEAN_BIO = '喜欢摄影和徒步';
const AD_BIO = '专业收号 秒结 秒到账';

// ================= [1] 归一化 =================
section('[1] adProfileShape 归一化');
{
	const shape = (bio) => W.adProfileShape({ bio });
	assert('同模板换链接 → 同形状', (() => {
		const a = shape('专业收号 秒结 t.me/aaa111'), b = shape('专业收号 秒结 t.me/bbb222');
		return a !== '' && a === b;
	})(), JSON.stringify([shape('专业收号 秒结 t.me/aaa111'), shape('专业收号 秒结 t.me/bbb222')]));
	assert('只换数字 → 同形状', (() => {
		const a = shape('日入5000 加V wx123'), b = shape('日入8000 加V wx456');
		return a !== '' && a === b;
	})(), JSON.stringify([shape('日入5000 加V wx123'), shape('日入8000 加V wx456')]));
	assert('业务清单换号码 → 同形状', (() => {
		const a = shape('VPS 抗投诉 主机 QQ123456'), b = shape('VPS 抗投诉 主机 QQ99999');
		return a !== '' && a === b;
	})());
	assert('话术不同 → 不同形状', shape('技术交流 看主页') !== shape('读书分享 看主页'));
	assert('零宽字符剥离后同形状', shape('a​b​c​d​e​f​g​h') === shape('abcdefgh'));
	assert('空 bio 不参与', shape('') === '');
	assert('实质不足 4 字不参与', shape('abc') === '');
	assert('只剩占位符（纯链接）不参与', shape('https://t.me/aaa') === '' && shape('t.me/+AbCdEfGh1234') === '');
}

// ================= [2] 表结构与完整性注册 =================
section('[2] 建表与完整性注册');
{
	const env = makeEnv();
	const ready = await W.adDetectionReady(env);
	assert('adDetectionReady 成功（新表不阻断就绪）', ready === true, String(ready));
	const rows = env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ad_profile_shapes'");
	assert('ad_profile_shapes 已建表', rows.length === 1, JSON.stringify(rows));
	const cols = env.DB.query("PRAGMA table_info(ad_profile_shapes)").map((c) => c.name);
	assert('含 hits / false_positive_count / sample 三列',
		cols.includes('hits') && cols.includes('false_positive_count') && cols.includes('sample'),
		JSON.stringify(cols));
	assert('完整性检查列表已注册该表', (await W.d1AdDetectionTablesExist(env)) === true);
}

// ================= [3] 读 / 学 / 纠错 =================
section('[3] 读、学、纠错基本行为');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const shapeKey = W.adProfileShape({ bio: AD_BIO });
	assert('形状非空', shapeKey !== '', shapeKey);
	assert('读：库空返回 null', (await W.readAdProfileShape(env, shapeKey)) === null);

	await W.learnAdProfileShape(env, shapeKey, AD_BIO);
	let row = await W.readAdProfileShape(env, shapeKey);
	assert('学一次 hits=1', row && Number(row.hits) === 1, JSON.stringify(row));

	await W.learnAdProfileShape(env, shapeKey, AD_BIO);
	row = await W.readAdProfileShape(env, shapeKey);
	assert('再学一次 hits=2', row && Number(row.hits) === 2, JSON.stringify(row));

	const noKey = await W.readAdProfileShape(env, '');
	assert('空主键不查库返回 null', noKey === null);

	// 默认档只累加误报，不删行
	await W.markAdProfileShapeFalsePositive(env, shapeKey);
	row = await W.readAdProfileShape(env, shapeKey);
	assert('默认档累加误报且不删行', row && Number(row.false_positive_count) === 1 && Number(row.hits) === 2, JSON.stringify(row));

	// purge 档（/ignore 走这一档）当次即删
	const purged = await W.markAdProfileShapeFalsePositive(env, shapeKey, { purge: true });
	assert('purge 档返回 removed=1', purged.ok === true && purged.removed === 1, JSON.stringify(purged));
	assert('purge 后行已删除', (await W.readAdProfileShape(env, shapeKey)) === null);
}

// ================= [4] 判定：前置条件与加分 =================
section('[4] 判定层的前置条件与形状加分');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const config = await W.loadAdDetectionConfig(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	const opts = { config, whitelist, skipMissingBioPenalty: false };

	// 基线 1：干净资料 —— scoreAdProfile 得 0 分，【不该】触发形状查询
	env.DB._sql.length = 0;
	const cleanEval = await W.evaluateAdSuspect(
		env, { profile: { bio: CLEAN_BIO, firstName: '张三', username: '', bioFetched: true }, text: '', forwardChat: null }, opts);
	const shapeSqlOnClean = env.DB._sql.filter((sql) => sql.includes('ad_profile_shapes'));
	assert('干净资料 scoreAdProfile 为 0 分', (await W.scoreAdProfile({ bio: CLEAN_BIO }, { whitelist, skipMissingBioPenalty: false })).score === 0);
	assert('干净资料【零】ad_profile_shapes 查询（热路径前置条件）',
		shapeSqlOnClean.length === 0, JSON.stringify(shapeSqlOnClean));
	assert('干净资料不产出形状分', !cleanEval.reasons.some((r) => r.includes('资料形状')),
		JSON.stringify(cleanEval.reasons));
	assert('干净资料快照仍带出 profileShape（供回滚反查）', cleanEval.snapshot.profileShape !== undefined);

	// 基线 2：广告资料 —— 得正分，触发形状查询；库里没记录则不加分
	env.DB._sql.length = 0;
	const adEval = await W.evaluateAdSuspect(
		env, { profile: { bio: AD_BIO, firstName: '李四', username: '', bioFetched: true }, text: '', forwardChat: null }, opts);
	const shapeSqlOnAd = env.DB._sql.filter((sql) => sql.includes('ad_profile_shapes'));
	assert('广告资料【有】ad_profile_shapes 查询', shapeSqlOnAd.length === 1, JSON.stringify(shapeSqlOnAd));
	assert('库里没这条形状时不加分', !adEval.reasons.some((r) => r.includes('资料形状')),
		JSON.stringify(adEval.reasons));
	const baseScore = adEval.score;

	// 基线 3：入库 hits=1（MIN_HITS=2）→ 仍不加分
	const shapeKey = adEval.snapshot.profileShape;
	await W.learnAdProfileShape(env, shapeKey, AD_BIO);
	const hits1 = await W.evaluateAdSuspect(
		env, { profile: { bio: AD_BIO, firstName: '李四', username: '', bioFetched: true }, text: '', forwardChat: null }, opts);
	assert('hits=1 不加分（未达 MIN_HITS=2）', hits1.score === baseScore && !hits1.reasons.some((r) => r.includes('资料形状')),
		JSON.stringify({ baseScore, score: hits1.score, reasons: hits1.reasons }));

	// 基线 4：再学一次 → hits=2 → 加 3 分
	await W.learnAdProfileShape(env, shapeKey, AD_BIO);
	const hits2 = await W.evaluateAdSuspect(
		env, { profile: { bio: AD_BIO, firstName: '李四', username: '', bioFetched: true }, text: '', forwardChat: null }, opts);
	assert('hits=2 加 3 分', hits2.score === baseScore + 3,
		JSON.stringify({ baseScore, score: hits2.score, reasons: hits2.reasons }));
	assert('reasons 里写明形状与复用次数',
		hits2.reasons.some((r) => r.includes('资料形状与已知广告模板一致') && r.includes('复用定罪 2 次')),
		JSON.stringify(hits2.reasons));
	assert('形状分只进总分、不进 behaviorScore',
		hits2.behaviorScore === adEval.behaviorScore && hits2.retainScore === adEval.retainScore,
		JSON.stringify({ before: adEval.retainScore, after: hits2.retainScore }));
	assert('快照带出的 profileShape 与库主键一致', shapeKey !== '' && shapeKey === hits2.snapshot.profileShape);
}

// ================= [5] 定罪即学习 =================
section('[5] 定罪即学习（enforceAdDetection 落库）');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const config = await W.loadAdDetectionConfig(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	const opts = { config, whitelist, skipMissingBioPenalty: false };
	const shapeKey = W.adProfileShape({ bio: AD_BIO });
	assert('处置前库里无该形状', (await W.readAdProfileShape(env, shapeKey)) === null);

	resetCalls();
	const evaluation = await W.evaluateAdSuspect(
		env, { profile: { bio: AD_BIO, firstName: '王五', username: '', bioFetched: true, avatarId: '' }, text: '', forwardChat: null }, opts);
	// 评分层已达 ban 线才走得到 enforce；不达线就直接注入一个 ban 结论来测「学习」本身
	const evalForBan = Object.assign({}, evaluation, { verdict: 'ban' });
	const result = await W.enforceAdDetection(env,
		{ userId: '555001', chatId: GROUP_ID, chatTitle: '测试群', messageId: null },
		evalForBan, { config, whitelist });

	const row = await W.readAdProfileShape(env, shapeKey);
	assert('封禁后形状入库且 hits=1', row && Number(row.hits) === 1, JSON.stringify(row));
	assert('sample 存的是该号的 bio', row && String(row.sample) === AD_BIO, JSON.stringify(row && row.sample));
	assert('处置返回 banned', result && result.banned === true, JSON.stringify(result && { banned: result.banned }));
}

// ================= [6] /ignore 白名单重建 =================
section('[6] adPayloadFromSnapshot 白名单重建');
{
	const snapshot = {
		snapshot: {
			name: '张三', username: '', bio: AD_BIO, text: '',
			status: '', avatarId: 'av_123', profileShape: 'deadbeef00112233', forwardTitle: ''
		}
	};
	const payload = W.adPayloadFromSnapshot(snapshot);
	assert('重建出 profileShape', payload.profileShape === 'deadbeef00112233', JSON.stringify(payload.profileShape));
	assert('重建出 avatarId（既有字段未被挤掉）', payload.avatarId === 'av_123', JSON.stringify(payload.avatarId));
	const missing = W.adPayloadFromSnapshot({ snapshot: { name: 'x' } });
	assert('老快照缺字段时回落空串而不是 undefined', missing.profileShape === '', JSON.stringify(missing.profileShape));
}

// ================= [7] /ignore 端到端清形状 =================
section('[7] /ignore 端到端纠错');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const config = await W.loadAdDetectionConfig(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	const shapeKey = W.adProfileShape({ bio: AD_BIO });
	await W.learnAdProfileShape(env, shapeKey, AD_BIO);
	await W.learnAdProfileShape(env, shapeKey, AD_BIO);
	assert('纠错前 hits=2', Number((await W.readAdProfileShape(env, shapeKey)).hits) === 2);

	// 直接测回滚函数：拿一份带 profileShape 的快照走 purge 档
	const rolled = await W.rollbackAdPendingSnapshot(env, String(OWNER_ID), 1, {
		snapshot: { name: '张三', username: '', bio: AD_BIO, text: '', status: '', avatarId: '', profileShape: shapeKey, forwardTitle: '' }
	});
	assert('回滚返回 shapeCleared 且删掉 1 条', rolled?.shapeCleared?.ok === true && rolled.shapeCleared.removed === 1,
		JSON.stringify(rolled && rolled.shapeCleared));
	assert('回滚后形状行已删除', (await W.readAdProfileShape(env, shapeKey)) === null);
}

// ================= [8] 热路径预算 =================
section('[8] 热路径 D1 预算（形状层不推高稳定态）');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const config = await W.loadAdDetectionConfig(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	// 用一条【干净资料】的普通发言走完整判定链，断言全程零 ad_profile_shapes 查询
	env.DB._sql.length = 0;
	resetCalls();
	await W.evaluateAdSuspect(
		env, { profile: { bio: CLEAN_BIO, firstName: '普通用户', username: '', bioFetched: true }, text: '普通聊天内容', forwardChat: null },
		{ config, whitelist, skipMissingBioPenalty: false });
	const shapeQueries = env.DB._sql.filter((sql) => sql.includes('ad_profile_shapes'));
	assert('普通发言（资料 0 分）零 ad_profile_shapes 查询', shapeQueries.length === 0, JSON.stringify(shapeQueries));
}

console.log(`\n========== 资料形状哈希：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
