// 第四路生成式深度判定（LLM 补位）+ getChat 429 重试 离线测试。
// 与 test_ad_badge.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_ad_llm.mjs
//
// 【为什么要有这个文件】前三层全是查表性质（词表要列到、指纹要学过、
// bge-m3 要样本里有近似），样本外的话术一律 0 分 —— 线上实测
// `来替我收米 一天9千` 拿 0 分。第四路不查表，直接把资料与正文交给生成式模型。
// 本文件盯三件事：
//   ① 钱包闸门（每日上限 / 内存去重 / 未绑 AI / 解析失败）一个都不许漏
//   ② 分档（采信线封、中段观察、低分只留理由）与【score 恒不改】
//   ③ 三处接线真的接上了 —— 只测函数不测调用点，等于没测（见 [6] 的反向验证）

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

// ---------- D1 兼容层（真实 SQLite）----------
function makeD1() {
	const db = new DatabaseSync(':memory:');
	const _sql = [];
	const normIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const k of Object.keys(row)) out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
		return out;
	};
	const exec = (sql, params = []) => {
		_sql.push(sql);
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
		_sql,
		prepare(sql) {
			const stmtFor = (args) => ({
				all: async () => ({ results: exec(sql, args).rows || [], success: true }),
				first: async () => (exec(sql, args).rows || [])[0] ?? null,
				run: async () => exec(sql, args),
				bind: (...more) => stmtFor(more)
			});
			return stmtFor([]);
		},
		exec: async (sql) => { _sql.push(sql); db.exec(sql); return { results: [], success: true }; },
		batch: async (stmts) => Promise.all(stmts.map((st) => st.run())),
		query(sql, ...params) { _sql.push(sql); return db.prepare(sql).all(...params).map(normOut); }
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
function countCalls(method) { return calls.filter((c) => c.method === method).length; }

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777000, is_bot: true, username: 'LLMTestBot' } };
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
			async text() { return JSON.stringify(payload); },
			async arrayBuffer() { return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer; }
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

let pendingWaits = [];
async function sendUpdate(update, env) {
	const request = new Request('https://example.workers.dev/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...update })
	});
	return handler.fetch(request, env, { waitUntil(p) { pendingWaits.push(Promise.resolve(p).catch(() => {})); } });
}
function groupMessage(from, text, extra = {}) {
	return {
		message_id: 200 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000), text,
		chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
		from: { is_bot: false, ...from },
		...extra
	};
}
async function send(msg, env) { return sendUpdate({ message: msg }, env); }

const handler = W.__handler;

// ---------- Workers AI mock（同一 env.AI 既做嵌入又做 LLM，按模型 ID 分流）----------
const EMBED_MODEL = src.match(/const AD_EMBEDDING_MODEL = '([^']+)'/)?.[1] || '';
const LLM_MODEL = src.match(/const AD_LLM_MODEL = '([^']+)'/)?.[1] || '';
const AD_LLM_DAILY_DEFAULT = Number(src.match(/const AD_LLM_DAILY = (\d+)/)?.[1]);
const AD_LLM_CONF_DEFAULT = Number(src.match(/const AD_LLM_CONF = ([\d.]+)/)?.[1]);
if (!EMBED_MODEL || !LLM_MODEL || !Number.isFinite(AD_LLM_DAILY_DEFAULT) || !Number.isFinite(AD_LLM_CONF_DEFAULT)) {
	throw new Error('无法从 _worker.js 解析 AD_LLM_* 常量，测试无法继续');
}
const EMBED_DIM = Number(src.match(/const AD_EMBEDDING_DIMENSION = (\d+)/)?.[1]);
// 按文本确定性生成向量：同一段文本恒得同一向量（嵌入的语义），不同文本互不相同
// （相似度接近 0）。绝不能让所有文本共用一个向量 —— 那样种子样本与被测文本的余弦
// 相似度恒为 1.000，第三层在任何输入上都硬命中，[6] 断言的封禁就分不清是谁的功劳。
function vecFor(text) {
	let h = 2166136261;
	for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
	const v = new Array(EMBED_DIM);
	for (let i = 0; i < EMBED_DIM; i++) {
		h = (Math.imul(h, 1103515245) + 12345) >>> 0;
		v[i] = ((h % 2000) - 1000) / 1000;
	}
	return v;
}
const FLAT_VECTOR = vecFor('占位');

function makeAI(options = {}) {
	const llmAnswer = options.llmAnswer;
	return {
		embedCalls: 0,
		llmCalls: 0,
		llmInputs: [],
		async run(model, input) {
			const id = String(model);
			if (id === EMBED_MODEL) {
				this.embedCalls += 1;
				return { data: [vecFor(String(input?.text?.[0] ?? ''))] };
			}
			this.llmCalls += 1;
			this.llmInputs.push(input);
			if (typeof options.onLlm === 'function') return options.onLlm(input);
			if (llmAnswer === undefined) return { response: '{"ad":false,"confidence":0.1,"reason":"正常用户"}' };
			return { response: llmAnswer };
		}
	};
}
// 便捷构造：ad + 置信度
function adAnswer(confidence, reason = 'bio 写着收益承诺') {
	return JSON.stringify({ ad: true, confidence, reason });
}

// 读 / 写 LLM 每日额度（直接读 ad_scan_state，避开沙箱里读不到 const 的限制）
function llmQuota(env) {
	let row = [];
	try { row = env.DB.query("SELECT key, value FROM ad_scan_state WHERE key IN ('llm_day','llm_count')"); } catch (_) { return {}; }
	const map = {};
	for (const r of row) map[r.key] = r.value;
	return map;
}
function resetLlmQuota(env) {
	try { env.DB.query("DELETE FROM ad_scan_state WHERE key IN ('llm_day','llm_count')"); } catch (_) { /* 表还没建：交由产品代码首次写入时建 */ }
}

// 新 env 必须先建广告检测表：额度读写落在 ad_scan_state 上，
// 而产品代码的 readAdScanState/writeAdScanState 对「表不存在」是静默降级
// （读返回 fallback、写直接忽略）—— 不建表的话额度断言会读到假的 0。
async function makeReadyEnv(extra = {}) {
	const env = makeEnv(extra);
	await W.adDetectionReady(env);
	return env;
}

const bootEnv = makeEnv();
resetCalls();
await sendUpdate({ message: groupMessage({ id: 99999, first_name: 'boot' }, 'boot') }, bootEnv);

// ================= [1] adFetchRetryAfter：只有 429 值得重试 =================
section('[1] adFetchRetryAfter（甲·429 重试判据）');
{
	assert('429 + retry_after=2 → 等 2 秒重试',
		W.adFetchRetryAfter({ error_code: 429, parameters: { retry_after: 2 } }) === 2,
		String(W.adFetchRetryAfter({ error_code: 429, parameters: { retry_after: 2 } })));
	assert('429 + retry_after=99 → 夹到 3 秒上限（不把判定挂住）',
		W.adFetchRetryAfter({ error_code: 429, parameters: { retry_after: 99 } }) === 3,
		String(W.adFetchRetryAfter({ error_code: 429, parameters: { retry_after: 99 } })));
	assert('429 没给 retry_after → 回落 1 秒',
		W.adFetchRetryAfter({ error_code: 429 }) === 1,
		String(W.adFetchRetryAfter({ error_code: 429 })));
	assert('400 chat not found → 不重试（常态拒答，等多久都不会变）',
		W.adFetchRetryAfter({ error_code: 400, description: 'Bad Request: chat not found' }) === null,
		String(W.adFetchRetryAfter({ error_code: 400, description: 'Bad Request: chat not found' })));
	assert('描述里带 flood control 的也认作可重试',
		typeof W.adFetchRetryAfter({ error_code: 403, description: 'Flood control: retry after 2' }) === 'number');
	assert('随便一个 4xx → 不重试', W.adFetchRetryAfter({ error_code: 404, description: 'Not Found' }) === null);
	assert('description 判据不依赖 error_code 字段缺失（429 只写在描述里也认）',
		W.adFetchRetryAfter({ description: 'Too Many Requests: retry after 5' }) === 1,
		String(W.adFetchRetryAfter({ description: 'Too Many Requests: retry after 5' })));
}

// ================= [2] fetchAdUserProfile 重试行为 =================
section('[2] fetchAdUserProfile 429 重试（甲·接线）');
{
	// 429 一次 → 第二次成功：应该拿到资料，且只发 2 次 getChat
	{
		resetCalls();
		let n = 0;
		setApi({ getChat: () => {
			n += 1;
			return n === 1
				? { payload: { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 0 } } }
				: { payload: { ok: true, result: { id: 1, first_name: '重试成功', bio: '写满广告的简介', photo: { big_file_unique_id: 'av1', big_file_id: 'fid1' } } } };
		} });
		const p = await W.fetchAdUserProfile(555001);
		assert('429 后重试成功 → bioFetched=true', p.bioFetched === true, String(p.bioFetched));
		assert('重试后拿到简介', p.bio === '写满广告的简介', p.bio);
		assert('重试后拿到头像（bio/avatarId 同一份响应）', p.avatarId === 'av1', p.avatarId);
		assert('getChat 只发 2 次（重试一次就收手）', countCalls('getChat') === 2, String(countCalls('getChat')));
	}
	// 400 chat not found：一次都不重试
	{
		resetCalls();
		setApi({ getChat: () => ({ payload: { ok: false, error_code: 400, description: 'Bad Request: chat not found' } }) });
		const p = await W.fetchAdUserProfile(555002);
		assert('400 → bioFetched=false', p.bioFetched === false, String(p.bioFetched));
		assert('400 → 只发 1 次 getChat（不浪费子请求预算）', countCalls('getChat') === 1, String(countCalls('getChat')));
	}
	// 连续两次 429：重试一次仍失败就放弃，不无限重试
	{
		resetCalls();
		setApi({ getChat: () => ({ payload: { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 0 } } }) });
		const p = await W.fetchAdUserProfile(555003);
		assert('两次 429 → 放弃并 bioFetched=false', p.bioFetched === false, String(p.bioFetched));
		assert('两次 429 → 总共只发 2 次（上限就是 2）', countCalls('getChat') === 2, String(countCalls('getChat')));
	}
	// 重试等待不能真的挂住：retry_after=3 上限，用 0 秒保证测试快
	resetCalls();
	setApi();
}

// ================= [3] 解析与载荷 =================
section('[3] parseAdLLMAnswer / buildAdLLMPayload');
{
	const ok = W.parseAdLLMAnswer('{"ad":true,"confidence":0.93,"reason":"bio 写着日结"}');
	assert('正常 JSON → ad=true', ok?.ad === true, JSON.stringify(ok));
	assert('正常 JSON → confidence 透传', ok?.confidence === 0.93, String(ok?.confidence));
	assert('正常 JSON → reason 透传', ok?.reason === 'bio 写着日结', ok?.reason);

	const chatty = W.parseAdLLMAnswer('好的，我来判断：\n{"ad": false, "confidence": 0.2, "reason": "普通用户"}\n以上。');
	assert('模型啰嗦时照样抠得出 JSON', chatty?.ad === false, JSON.stringify(chatty));

	assert('完全解析不出来 → null（不猜着定罪）', W.parseAdLLMAnswer('我觉得是广告') === null);
	assert('空串 → null', W.parseAdLLMAnswer('') === null);
	assert('null → null', W.parseAdLLMAnswer(null) === null);

	const noConf = W.parseAdLLMAnswer('{"ad":true,"reason":"收益承诺"}');
	assert('缺 confidence 且判了广告 → 按满置信（不丢掉有效结论）', noConf?.confidence === 1, String(noConf?.confidence));
	const noConfClean = W.parseAdLLMAnswer('{"ad":false,"reason":"正常"}');
	assert('缺 confidence 且判了正常 → 0', noConfClean?.confidence === 0, String(noConfClean?.confidence));

	const over = W.parseAdLLMAnswer('{"ad":true,"confidence":7,"reason":"x"}');
	assert('confidence 越界 7 → 夹到 1', over?.confidence === 1, String(over?.confidence));
	const under = W.parseAdLLMAnswer('{"ad":false,"confidence":-3,"reason":"x"}');
	assert('confidence 负数 → 夹到 0', under?.confidence === 0, String(under?.confidence));

	const strAd = W.parseAdLLMAnswer('{"ad":"true","confidence":0.9,"reason":"x"}');
	assert('ad 以字符串 "true" 给也算命中（模型常这么吐）', strAd?.ad === true, JSON.stringify(strAd));

	const payload = W.buildAdLLMPayload({
		profile: { username: 'u1', firstName: '张', lastName: '三', bio: '简介' },
		text: '正文'
	});
	const parsed = JSON.parse(payload);
	assert('载荷含 username', parsed.username === 'u1', payload);
	assert('载荷含 first_name/last_name', parsed.first_name === '张' && parsed.last_name === '三', payload);
	assert('载荷含 bio', parsed.bio === '简介', payload);
	assert('载荷含 message', parsed.message === '正文', payload);

	const long = W.buildAdLLMPayload({ profile: {}, text: 'x'.repeat(5000) });
	assert('message 截断到 600 字符（控 token 成本）', JSON.parse(long).message.length === 600,
		String(JSON.parse(long).message.length));
	assert('profile 缺字段时不炸', W.buildAdLLMPayload({}) !== undefined);
	assert('入群线空正文 → message 为空串', JSON.parse(W.buildAdLLMPayload({ profile: {}, text: '' })).message === '');
}

// ================= [4] judgeAdByLLM 钱包闸门 =================
section('[4] judgeAdByLLM 闸门（额度 / 去重 / 降级）');
{
	const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
	assert('AD_LLM_DAILY=50 解析为 50', cfg.llmDaily === 50, String(cfg.llmDaily));
	assert('不配置 → 默认 ' + AD_LLM_DAILY_DEFAULT,
		W.loadAdDetectionConfig({}).llmDaily === AD_LLM_DAILY_DEFAULT,
		String(W.loadAdDetectionConfig({}).llmDaily));
	assert('AD_LLM_DAILY=0 → 关闭本路', W.loadAdDetectionConfig({ AD_LLM_DAILY: '0' }).llmDaily === 0);
	assert('AD_LLM_CONF 解析', W.loadAdDetectionConfig({ AD_LLM_CONF: '0.9' }).llmConf === 0.9,
		String(W.loadAdDetectionConfig({ AD_LLM_CONF: '0.9' }).llmConf));
	assert('不配置 AD_LLM_CONF → 默认 ' + AD_LLM_CONF_DEFAULT,
		W.loadAdDetectionConfig({}).llmConf === AD_LLM_CONF_DEFAULT);
	assert('AD_LLM_MODEL 可换', W.loadAdDetectionConfig({ AD_LLM_MODEL: '@cf/x/y' }).llmModel === '@cf/x/y');
	assert('不配置模型 → 代码默认值', W.loadAdDetectionConfig({}).llmModel === LLM_MODEL);

	// ① 未绑 AI → 跳过
	{
		const env = await makeReadyEnv();
		const ai = makeAI({ llmAnswer: adAnswer(0.95) });
		const got = await W.judgeAdByLLM(env, cfg, { profile: { bio: 'x' }, text: 'y' });
		assert('未绑 AI → null（不报错，与整体降级口径一致）', got === null, JSON.stringify(got));
		assert('未绑 AI → 一次 AI 调用都没有', ai.llmCalls === 0, String(ai.llmCalls));
	}
	// ② AD_LLM_DAILY=0 → 跳过
	{
		const env = await makeReadyEnv();
		const ai = makeAI({ llmAnswer: adAnswer(0.95) });
		const off = W.loadAdDetectionConfig({ AD_LLM_DAILY: '0' });
		const got = await W.judgeAdByLLM({ ...env, AI: ai }, off, { profile: { bio: 'x' }, text: 'y' });
		assert('AD_LLM_DAILY=0 → null 且零调用', got === null && ai.llmCalls === 0,
			`got=${JSON.stringify(got)} calls=${ai.llmCalls}`);
	}
	// ③ 正常跑一次 → 记额度 +1，返回解析结果
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.95) }) });
		resetLlmQuota(env);
		const got = await W.judgeAdByLLM(env, cfg, { profile: { bio: '收益日结' }, text: '来谈' });
		assert('命中时返回解析结果', got?.ad === true && got?.confidence === 0.95, JSON.stringify(got));
		assert('跑一次额度记 1', Number(llmQuota(env).llm_count) === 1, JSON.stringify(llmQuota(env)));
	}
	// ④ 额度耗尽 → 跳过（不再花一分钱）
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.95) }) });
		const ai = env.AI;
		env.DB.prepare("INSERT INTO ad_scan_state (key, value, updated_at) VALUES ('llm_day', ?, 1)")
			.bind(new Date().toISOString().slice(0, 10)).run();
		env.DB.prepare("INSERT INTO ad_scan_state (key, value, updated_at) VALUES ('llm_count', '50', 1)").run();
		const got = await W.judgeAdByLLM(env, cfg, { profile: { bio: 'x' }, text: '独一无二的正文' });
		assert('额度用尽 → null 且零调用', got === null && ai.llmCalls === 0,
			`got=${JSON.stringify(got)} calls=${ai.llmCalls}`);
	}
	// ⑤ 同载荷去重：第二次直接跳过
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.95) }) });
		const ai = env.AI;
		resetLlmQuota(env);
		const input = { profile: { bio: '唯一简介abc' }, text: '唯一正文def' };
		await W.judgeAdByLLM(env, cfg, input);
		const second = await W.judgeAdByLLM(env, cfg, input);
		assert('同载荷第二次 → null（内存去重）', second === null, JSON.stringify(second));
		assert('同载荷只花一次钱', ai.llmCalls === 1, String(ai.llmCalls));
		assert('去重后额度仍是 1', Number(llmQuota(env).llm_count) === 1, JSON.stringify(llmQuota(env)));
	}
	// ⑥ 解析失败也记额度：否则同一条解析不出来的载荷会被反复烧钱
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: '模型说了句人话，没有 JSON' }) });
		resetLlmQuota(env);
		const got = await W.judgeAdByLLM(env, cfg, { profile: { bio: 'zz1' }, text: 'zz2' });
		assert('解析失败 → null', got === null, JSON.stringify(got));
		assert('解析失败仍记额度（花了钱就要记账）', Number(llmQuota(env).llm_count) === 1,
			JSON.stringify(llmQuota(env)));
	}
	// ⑦ AI 抛异常 → 不记额度、不记去重键（下次还有机会），但不炸
	{
		const env = await makeReadyEnv({ AI: { run: async () => { throw new Error('上游 500'); } } });
		resetLlmQuota(env);
		let threw = null;
		let got = null;
		try { got = await W.judgeAdByLLM(env, cfg, { profile: { bio: 'qq1' }, text: 'qq2' }); }
		catch (e) { threw = e; }
		assert('AI 抛异常不向外炸', threw === null, String(threw));
		assert('AI 抛异常 → null', got === null, JSON.stringify(got));
		assert('AI 抛异常不记额度（没花成功钱）', Number(llmQuota(env).llm_count || 0) === 0,
			JSON.stringify(llmQuota(env)));
	}
}

// ================= [6] 三处接线（反向验证的关键） =================
section('[6] 接线：入群线 / 消息线 / 复查线都真的调用了第四路');
{
	// —— 入群线：资料干净（前三层不够分），只有模型能定他的罪 ——
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.97, 'bio 挂着引流话术') }) });
		await W.adDetectionReady(env);
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '干净名字', username: '', bio: '喜欢摄影和徒步'
		} } }) });
		const result = await W.screenAdJoinMember(env, { id: 771001, is_bot: false, first_name: '干净名字' }, {
			chatId: GROUP_ID, chatTitle: '测试群', messageId: null,
			skipBlacklistCheck: true, source: 'new_chat_members'
		});
		const row = env.DB.query('SELECT reason FROM blacklist WHERE id = ?', '771001');
		assert('入群线：前三层不够分 + 模型达线 → 封禁入册',
			row.length === 1, JSON.stringify({ result, rows: row }));
		const checks = env.DB.query('SELECT reasons, verdict FROM ad_join_checks WHERE user_id = ?', '771001');
		assert('入群线：流水里能看到模型理由',
			checks.length > 0 && String(checks[0].reasons).includes('AI 深度判定命中'),
			JSON.stringify(checks));
	}

	// —— 消息线：正文是样本外话术，评分层 0 分 ——
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.96, '收米=收钱的同音变形') }) });
		await W.adDetectionReady(env);
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '小明', username: '', bio: ''
		} } }) });
		await send(groupMessage({ id: 771002, first_name: '小明' }, '来替我收米 一天9千'), env);
		const row = env.DB.query('SELECT reason FROM blacklist WHERE id = ?', '771002');
		assert('消息线：样本外话术靠第四路定罪（这正是线上 0 分漏掉的那类）',
			row.length === 1, JSON.stringify(row));
		assert('消息线：AI 确实被调到了', env.AI.llmCalls >= 1, String(env.AI.llmCalls));
	}

	// —— 复查线：不发言的人，只有资料可判 ——
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.98, '改了 bio 换马甲') }) });
		await W.adDetectionReady(env);
		env.DB.prepare('INSERT INTO ad_group_members (user_id, chat_id, first_name, last_name, username, first_seen, last_seen, bio_checked_at, profile_hash, last_verdict) VALUES (?,?,?,?,?,?,?,?,?,?)')
			.bind('771003', GROUP_ID, '潜伏号', '', '', 1, 1, 0, 'h0', '').run();
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '潜伏号', username: '', bio: '改过的广告简介'
		} } }) });
		const r = await W.rescanAdMember(env, {
			user_id: '771003', chat_id: GROUP_ID, first_name: '潜伏号', last_name: '', username: '',
			profile_hash: '', last_verdict: '', bio_checked_at: 0
		}, { config: W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' }) });
		const row = env.DB.query('SELECT reason FROM blacklist WHERE id = ?', '771003');
		assert('复查线：不发言的人也走第四路并定罪',
			row.length === 1, JSON.stringify({ r, rows: row }));
	}
	// 未绑 AI 时三条线都必须照样能跑（降级不炸）
	{
		const env = await makeReadyEnv();
		await W.adDetectionReady(env);
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '无AI用户', username: '', bio: ''
		} } }) });
		let threw = null;
		try {
			await W.screenAdJoinMember(env, { id: 771004, is_bot: false, first_name: '无AI用户' }, {
				chatId: GROUP_ID, chatTitle: '测试群', messageId: null,
				skipBlacklistCheck: true, source: 'new_chat_members'
			});
		} catch (e) { threw = e; }
		assert('未绑 AI 的部署照常跑完入群判定', threw === null, String(threw));
	}
}

// ================= [7] 每日额度跨天 =================
section('[7] readAdLLMQuota 跨天清零');
{
	const env = await makeReadyEnv();
	const today = new Date().toISOString().slice(0, 10);
	env.DB.prepare("INSERT INTO ad_scan_state (key, value, updated_at) VALUES ('llm_day', ?, 1)").bind(today).run();
	env.DB.prepare("INSERT INTO ad_scan_state (key, value, updated_at) VALUES ('llm_count', '37', 1)").run();
	const same = await W.readAdLLMQuota(env, Math.floor(Date.now() / 1000));
	assert('同一天 -> 读得到已用次数', same.used === 37, JSON.stringify(same));

	env.DB.prepare("UPDATE ad_scan_state SET value = '2026-01-01' WHERE key = 'llm_day'").run();
	const cross = await W.readAdLLMQuota(env, Math.floor(Date.now() / 1000));
	assert('跨天 -> 归零（不继承昨天的计数）', cross.used === 0, JSON.stringify(cross));
	const stored = llmQuota(env);
	assert('跨天会把 llm_count 一并写回 0（只写 day 不写 count 会留残留）',
		stored.llm_count === '0', JSON.stringify(stored));
	const again = await W.readAdLLMQuota(env, Math.floor(Date.now() / 1000));
	assert('跨天后第二次读仍是 0（残留真被清掉了）', again.used === 0, JSON.stringify(again));
}


// ================= [8] 可疑信号压短 bio 冷却期（第⑥层可达性） =================
section('[8] 可疑信号把 bio 冷却期压到 10 分钟');
{
	// 判据本身：+0 不算正分信号（评分层的 add 没有 delta 保护，0 分照样 push 进 reasons）
	const reSrc = src.match(/const AD_POSITIVE_SIGNAL_RE = \/(.+?)\/\s*;/)?.[1];
	assert('能从源码取出 AD_POSITIVE_SIGNAL_RE', Boolean(reSrc), String(reSrc));
	const POS = reSrc ? new RegExp(reSrc) : null;
	if (POS) {
		assert('+3 正文首尾对称 emoji → 算正分信号', POS.test('+3 正文首尾对称 emoji'));
		assert('+1 正文重复段落 → 算', POS.test('+1 正文重复段落'));
		assert('★ +0 来源频道名为随机字母串 → 不算（0 分不构成「有特征」）',
			!POS.test('+0 来源频道名为随机字母串'), '+0 被误判成有特征');
		assert('+0 随机字母数字 username → 不算', !POS.test('+0 随机字母数字 username'));
		assert('-1 名称无 emoji 且无 Bio → 不算（减分项）', !POS.test('-1 名称无 emoji 且无 Bio'));
		assert('AI 语义相似度那条 → 不算', !POS.test('AI 语义相似度 0.417 ≥ 阈值 0.78'));
	}

	// 端到端：三种冷却状态 × 有无正分，看闸二（及挂在它后面的第⑥层）到底进不进。
	// LLM 一律回 ad:false —— 这里只测「够不够得着」，不测定罪（定罪在 [6] 已断言）。
	const NO_ADB = '{"ad":false,"confidence":0.1,"reason":"正常用户"}';

	// 把 bio_checked_at 直接写成给定值，省掉真的去发一轮消息做预热。
	async function primeBioChecked(env, userId, secondsAgo) {
		const now = Math.floor(Date.now() / 1000);
		// secondsAgo === null 表示「从没查过」—— bio_checked_at 写 0，
		// 与 shouldCheckAdBio 的 checked <= 0 分支同义。传 0 是「刚刚查过」，语义相反。
		const checked = secondsAgo === null ? 0 : now - secondsAgo;
		await env.DB.prepare(
			'INSERT INTO ad_group_members (user_id, chat_id, first_name, last_name, username, first_seen, last_seen, bio_checked_at, profile_hash, last_verdict) VALUES (?,?,?,?,?,?,?,?,?,?) '
			+ 'ON CONFLICT(user_id) DO UPDATE SET bio_checked_at = excluded.bio_checked_at'
		).bind(String(userId), GROUP_ID, '用户', '', '', now, now, checked, '', '').run();
	}
	const SUSPECT_CD = 10 * 60;   // 与 AD_SUSPECT_BIO_COOLDOWN_SECONDS 同值
	// 新人档位（adRescanTierSeconds 对 first_seen 距今 <=6h 返回 7200 秒 = 2 小时）。
	// 场景① 要的是「按原档位还在冷却中、按新逻辑已经到期」，所以取值必须落在 [7200, SUSPECT_CD) 之外的对侧：
	//   610 秒 < 7200（原档位仍冷却）且 >= 600（新逻辑到期）—— 两头都满足才叫「压短了」。
	const NEWCOMER_TIER = 7200;
	const SYMMETRIC = '🔥今天天气真好🔥';   // 首尾对称 emoji → +3，仍低于封禁线 7
	const PLAIN = '普通聊天内容';           // 0 正分

	// ① 冷却期内 + 有正分 → 必须走闸二（第⑥层可达）
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: NO_ADB }) });
		const ai = env.AI;
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '可疑用户', username: '', bio: ''
		} } }) });
		await primeBioChecked(env, 771101, SUSPECT_CD + 10);   // 610 秒前查过：原档位 7200 仍在冷却，新逻辑已到期
		await send(groupMessage({ id: 771101, first_name: '可疑用户' }, SYMMETRIC), env);
		assert('★ 原档位仍冷却（610s < 7200s）但有 +3 正分 → 压短后进闸二，第⑥层被调到',
			ai.llmCalls >= 1, 'llmCalls=' + ai.llmCalls);
	}
	// ② 冷却期内 + 0 正分 → 不进闸二（稳态零请求的不变量原样保住）
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: NO_ADB }) });
		const ai = env.AI;
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '普通用户', username: '', bio: ''
		} } }) });
		await primeBioChecked(env, 771102, 60);   // 1 分钟前查过 → 两条逻辑都不进
		await send(groupMessage({ id: 771102, first_name: '普通用户' }, PLAIN), env);
		assert('★ 冷却期内且 0 正分 → 不进闸二，一个 AI 调用都没有',
			ai.llmCalls === 0, 'llmCalls=' + ai.llmCalls);
	}
	// ②b 【2026-10-11 新增触发路径】正文只有业务词 → 0 正分，但第⑥层必须够得着
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: NO_ADB }) });
		const ai = env.AI;
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '行业词用户', username: '', bio: ''
		} } }) });
		await primeBioChecked(env, 771112, 60);   // 1 分钟前查过：与 ② 同档，差别只在正文
		// 「假钞」只命中业务词表 → 掉进「单类词不计分」→ reasons 里一行以 + 开头的都没有，
		// 旧行为下 suspectSignal 恒为 false，第⑥层永远够不着 —— 正是 2026-10-11 那条
		// 漏放清单的机制。
		await send(groupMessage({ id: 771112, first_name: '行业词用户' }, '这批假钞成色不错'), env);
		assert('★ 正文只命中业务词（0 正分）→ 第⑥层仍被调到（词表外话术的唯一出路）',
			ai.llmCalls >= 1, 'llmCalls=' + ai.llmCalls);
	}
	// ②c 反向：技术词不触发 —— 「订阅」是豁免词，不在招揽/业务两张表里，稳态不变量守住
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: NO_ADB }) });
		const ai = env.AI;
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '技术用户', username: '', bio: ''
		} } }) });
		await primeBioChecked(env, 771113, 60);
		await send(groupMessage({ id: 771113, first_name: '技术用户' }, '订阅订阅订阅 论坛'), env);
		assert('★ 豁免词复读不触发新路径（技术讨论仍零 AI 调用）',
			ai.llmCalls === 0, 'llmCalls=' + ai.llmCalls);
	}
	// ③ 冷却期外 + 0 正分 → 照旧进闸二（原有行为不变）
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: NO_ADB }) });
		const ai = env.AI;
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '过期用户', username: '', bio: ''
		} } }) });
		await primeBioChecked(env, 771103, NEWCOMER_TIER + 60);   // 2 小时档位已过
		await send(groupMessage({ id: 771103, first_name: '过期用户' }, PLAIN), env);
		assert('冷却期已过 → 仍进闸二（原行为没被改掉）',
			ai.llmCalls >= 1, 'llmCalls=' + ai.llmCalls);
	}
	// ④ 从没查过（bio_checked_at = 0）+ 0 正分 → 进闸二
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: NO_ADB }) });
		const ai = env.AI;
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '新用户', username: '', bio: ''
		} } }) });
		await primeBioChecked(env, 771104, null);   // 从没查过（bio_checked_at = 0）
		await send(groupMessage({ id: 771104, first_name: '新用户' }, PLAIN), env);
		assert('首次发言（从没查过 bio）→ 进闸二', ai.llmCalls >= 1, 'llmCalls=' + ai.llmCalls);
	}
	// ⑤ 未绑 AI 时这条路径照样能走完（不炸）
	{
		const env = await makeReadyEnv();
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '无AI用户', username: '', bio: ''
		} } }) });
		await primeBioChecked(env, 771105, 60);
		let threw = null;
		try { await send(groupMessage({ id: 771105, first_name: '无AI用户' }, SYMMETRIC), env); }
		catch (e) { threw = e; }
		assert('未绑 AI + 有正分 → 走完不炸', threw === null, String(threw));
	}
}


// ================= [9] 闸一同步跑第⑥层（唯一还够得着的位置） =================
section('[9] 闸一可疑但不够封时同步调第⑥层');
{
	// 复用 [8] 的辅助函数语义：bio_checked_at 直接写库，省掉真的发一轮消息做预热。
	async function prime(env, userId, secondsAgo) {
		const now = Math.floor(Date.now() / 1000);
		const checked = secondsAgo === null ? 0 : now - secondsAgo;
		await env.DB.prepare(
			'INSERT INTO ad_group_members (user_id, chat_id, first_name, last_name, username, first_seen, last_seen, bio_checked_at, profile_hash, last_verdict) VALUES (?,?,?,?,?,?,?,?,?,?) '
			+ 'ON CONFLICT(user_id) DO UPDATE SET bio_checked_at = excluded.bio_checked_at'
		).bind(String(userId), GROUP_ID, '用户', '', '', now, now, checked, '', '').run();
	}
	// 首尾对称 emoji → 闸一 +3，低于封禁线 7，所以必须靠第⑥层才能定罪。
	const SUSPECT_TEXT = '🔥今天天气真好🔥';
	const PLAIN_TEXT = '普通聊天内容';
	const NEWCOMER_TIER = 7200;   // adRescanTierSeconds 对 first_seen 距今 <=6h

	// ① 核心场景：闸一有正分但不够封 + bio 冷却中（闸二不进）→ 只有第⑥层够得着
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.96, '正文带引流话术') }) });
		const ai = env.AI;
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '闸一可疑用户甲', username: '', bio: ''
		} } }) });
		// ★ first_name 必须与 [8] 段那段区分：adLLMSeen 是【模块级】Set、跨段共享，
		// 载荷一字不差时 judgeAdByLLM 会在去重处直接 return null，llmCalls 不涨 ——
		// 症状与「闸一根本没调」完全一样，第一版就是这么误判的。
		await prime(env, 771201, 60);   // 60 秒前查过：原档位 7200 与新冷却 600 都没到期 → 闸二不进
		await send(groupMessage({ id: 771201, first_name: '闸一可疑用户甲' }, SUSPECT_TEXT), env);
		assert('★ 冷却中且闸二不进 → 闸一这一层调到了第⑥层', ai.llmCalls >= 1, 'llmCalls=' + ai.llmCalls);
		const row = env.DB.query('SELECT reason FROM blacklist WHERE id = ?', '771201');
		assert('★ 模型达采信线 → 闸一就地封禁（不用等闸二）', row.length === 1, JSON.stringify(row));
	}
	// ② 0 正分 → 一个调用都不发（稳态保护，占绝大多数的普通聊天）
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.99) }) });
		const ai = env.AI;
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '普通用户', username: '', bio: ''
		} } }) });
		await prime(env, 771202, 60);
		await send(groupMessage({ id: 771202, first_name: '普通用户' }, PLAIN_TEXT), env);
		assert('★ 0 正分 → 闸一不调第⑥层（稳态零额外开销不变）', ai.llmCalls === 0, 'llmCalls=' + ai.llmCalls);
		const row = env.DB.query('SELECT reason FROM blacklist WHERE id = ?', '771202');
		assert('0 正分不会被误封', row.length === 0, JSON.stringify(row));
	}
	// ③ 有正分但模型判正常 → 不封（LLM 没有「见可疑就封」的权力）
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: '{"ad":false,"confidence":0.9,"reason":"普通发言"}' }) });
		const ai = env.AI;
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '正常用户', username: '', bio: ''
		} } }) });
		await prime(env, 771203, 60);
		await send(groupMessage({ id: 771203, first_name: '正常用户' }, SUSPECT_TEXT), env);
		assert('有正分确实调了第⑥层', ai.llmCalls >= 1, 'llmCalls=' + ai.llmCalls);
		const row = env.DB.query('SELECT reason FROM blacklist WHERE id = ?', '771203');
		assert('★ 模型判正常 → 不封（不误伤）', row.length === 0, JSON.stringify(row));
	}
	// ④ 模型置信度只到中段 → 进观察窗口，不封
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.7, '有点可疑但拿不准') }) });
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '中段用户', username: '', bio: ''
		} } }) });
		await prime(env, 771204, 60);
		await send(groupMessage({ id: 771204, first_name: '中段用户' }, SUSPECT_TEXT), env);
		const row = env.DB.query('SELECT reason FROM blacklist WHERE id = ?', '771204');
		assert('★ 0.6 ≤ 置信度 < 采信线 → 转观察不封', row.length === 0, JSON.stringify(row));
	}
	// ⑤ 闸一已经定罪的（评分层自己够线）→ 不花第⑥层的钱
	{
		// 阈值压到 3：这段正文在闸一（无 bio）只能拿 4 分，默认线 7 要靠闸二才封，
		// 那样闸一那一步仍会调第⑥层，验不到「已定罪就不花钱」这条。
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.99) }), AD_SCORE_THRESHOLD: '3' });
		const ai = env.AI;
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '已定罪用户', username: '', bio: ''
		} } }) });
		await prime(env, 771205, 60);
		// 超封禁线的正文：评分层自己就判了
		await send(groupMessage({ id: 771205, first_name: '已定罪用户' },
			'招代理 一天8000 带单上分 私聊领福利'), env);
		const row = env.DB.query('SELECT reason FROM blacklist WHERE id = ?', '771205');
		assert('评分层够线 → 照样封禁', row.length === 1, JSON.stringify(row));
		assert('但不重复花第⑥层的钱（前三层能解决的不劳第四路）', ai.llmCalls === 0,
			'lllmCalls=' + ai.llmCalls);
	}
	// ⑥ 未绑 AI → 这条路径照样走完，不炸
	{
		const env = await makeReadyEnv();
		setApi({ getChat: (body) => ({ payload: { ok: true, result: {
			id: body?.chat_id, first_name: '无AI用户', username: '', bio: ''
		} } }) });
		await prime(env, 771206, 60);
		let threw = null;
		try { await send(groupMessage({ id: 771206, first_name: '无AI用户' }, SUSPECT_TEXT), env); }
		catch (e) { threw = e; }
		assert('未绑 AI + 有正分 → 走完不炸', threw === null, String(threw));
	}
}


// ================= [10] 第⑥层观测计数（/adstats 可自查） =================
section('[10] 观测计数：调用 / 判广告 / 达线三个数');
{
	const NOW = () => Math.floor(Date.now() / 1000);
	// /adstats 不 return 文本 —— 它直接 sendMessage，所以只能从 mock 的 calls 里取。
	const lastSent = () => {
		const sent = calls.filter((c) => c.method === 'sendMessage');
		const body = sent[sent.length - 1]?.body || {};
		return String(body.text || body.message || body.caption || '');
	};

	// ① 判为广告且达采信线 → 三个数都 +1
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.97) }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
		await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 1, reasons: [] },
			cfg, { profile: { bio: 'x' }, text: '达线样本甲' });
		const o = await W.readAdLLMOutcome(env, NOW());
		assert('达线 → used=1', o.used === 1, JSON.stringify(o));
		assert('达线 → hits=1（模型判为广告）', o.hits === 1, JSON.stringify(o));
		assert('达线 → bans=1（真到采信线）', o.bans === 1, JSON.stringify(o));
	}
	// ② 判为广告但不到采信线 → hits 涨、bans 不涨
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.7) }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
		await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 1, reasons: [] },
			cfg, { profile: { bio: 'x' }, text: '中段样本乙' });
		const o = await W.readAdLLMOutcome(env, NOW());
		assert('中段 → used=1', o.used === 1, JSON.stringify(o));
		assert('★ 中段 → hits=1 但 bans=0（判了广告 ≠ 处置了）',
			o.hits === 1 && o.bans === 0, JSON.stringify(o));
	}
	// ③ 判正常 → 三个数都 0（观察「调了但不命中」正是靠这个 0 看出来的）
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: '{"ad":false,"confidence":0.9,"reason":"正常"}' }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
		await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 1, reasons: [] },
			cfg, { profile: { bio: 'x' }, text: '正常样本丙' });
		const o = await W.readAdLLMOutcome(env, NOW());
		assert('★ 判正常 → hits=0 bans=0', o.hits === 0 && o.bans === 0, JSON.stringify(o));
		assert('但调用照记 used=1（否则看不出「跑过没」）', o.used === 1, JSON.stringify(o));
	}
	// ④ 模型没给出 ad 结论（解析失败）→ 不记 hits
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: '模型说了句人话，没有 JSON' }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
		await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 1, reasons: [] },
			cfg, { profile: { bio: 'x' }, text: '解析失败样本丁' });
		const o = await W.readAdLLMOutcome(env, NOW());
		assert('解析失败 → 不记 hits（没结论就不能算「判为广告」）', o.hits === 0, JSON.stringify(o));
	}
	// ⑤ 跨天一律按 0 报，不读昨天残留
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.99) }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
		await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 1, reasons: [] },
			cfg, { profile: { bio: 'x' }, text: '昨天的样本戊' });
		assert('当天能读到', (await W.readAdLLMOutcome(env, NOW())).hits === 1);
		env.DB.prepare("UPDATE ad_scan_state SET value = '2026-01-01' WHERE key = 'llm_day'").run();
		const o = await W.readAdLLMOutcome(env, NOW());
		assert('★ day 不是今天 → 三个数全 0（不拿昨天的残留充数）',
			o.used === 0 && o.hits === 0 && o.bans === 0, JSON.stringify(o));
	}
	// ⑥ /adstats 输出里能看到这三个数，以及「调了但 0 命中」的提示
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.97) }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
		await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 1, reasons: [] },
			cfg, { profile: { bio: 'x' }, text: '看板样本己' });
		calls.length = 0;
		await W.handleAdStatsCommand(env, GROUP_ID);
		const text = lastSent();
		assert('/adstats 显示今日调用数', text.includes('今日调用'), text.slice(0, 600));
		assert('/adstats 显示「模型判为广告」', text.includes('模型判为广告'), text.slice(0, 600));
		assert('/adstats 显示「其中达线处置」', text.includes('其中达线处置'), text.slice(0, 600));
	}
	// ⑦ 调用 >0 且 0 命中时给出提示，且必须与「解析失败」区分开
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: '{"ad":false,"confidence":0.1,"reason":"正常"}' }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
		await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 1, reasons: [] },
			cfg, { profile: { bio: 'x' }, text: '零命中样本庚' });
		calls.length = 0;
		await W.handleAdStatsCommand(env, GROUP_ID);
		const text = lastSent();
		assert('★ 调了但 0 命中 → 提示「模型确实判了不是广告」',
			text.includes('模型确实判了'), text.slice(0, 700));
		assert('★ 0 命中 + 0 解析失败 → 指向载荷内容而非输出格式',
			text.includes('不在输出格式'), text.slice(0, 700));
		assert('★ 解析失败计数出现在 /adstats 上', text.includes('解析失败'), text.slice(0, 700));
		assert('★ 分池行出现在 /adstats 上', text.includes('分池'), text.slice(0, 700));
	}
	// ⑦b 模型返回了内容但抠不出 JSON → 必须报「解析失败」而不是「模型判 false」
	// （这两种在旧版 /adstats 上长得一模一样，都是「调用 N 次、命中 0 次」）
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: '抱歉我判断不了，这里没有 JSON' }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
		await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 1, reasons: [] },
			cfg, { profile: { bio: 'x' }, text: '解析失败样本辛' });
		calls.length = 0;
		await W.handleAdStatsCommand(env, GROUP_ID);
		const text = lastSent();
		assert('★ 解析失败 → 提示这些调用白烧额度',
			text.includes('白烧额度'), text.slice(0, 700));
	}
	// ⑦d 【2026-10-11 线上实锤】Workers AI 对 chat 模型返回的是 OpenAI 兼容结构，
	// 正文在 choices[0].message.content；旧写法只认 response / result，两个都取不到，
	// 于是兜底到整个对象、String 化成 "[object Object]" —— 第⑥层【从上线至今一次都没
	// 真正读到过模型的回答】，242 次调用 0 命中就是这么来的。
	{
		const openaiShape = (json) => ({
			id: 'cmpl-1', object: 'chat.completion', created: 1, model: 'qwen3-30b-a3b-fp8',
			choices: [{ index: 0, message: { role: 'assistant', content: json }, finish_reason: 'stop' }],
			usage: { prompt_tokens: 10, completion_tokens: 20 }
		});
		assert('★ OpenAI 兼容结构 → 正文从 choices[0].message.content 取',
			W.extractAdLLMResponseText(openaiShape('正文甲')) === '正文甲',
			JSON.stringify(W.extractAdLLMResponseText(openaiShape('正文甲'))));
		assert('★ 旧式 response 字段仍兼容（别因为修这里砸掉别的模型）',
			W.extractAdLLMResponseText({ response: '正文乙' }) === '正文乙');
		assert('★ result 字段仍兼容',
			W.extractAdLLMResponseText({ result: '正文丙' }) === '正文丙');
		assert('★ 认不出的结构返回空串，不返回 [object Object]',
			W.extractAdLLMResponseText({ foo: 1 }) === '',
			W.extractAdLLMResponseText({ foo: 1 }));
		assert('★ null / undefined 返回空串',
			W.extractAdLLMResponseText(null) === '' && W.extractAdLLMResponseText(undefined) === '');

		const env = await makeReadyEnv({ AI: makeAI({ onLlm: () => openaiShape(adAnswer(0.97)) }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
		const got = await W.judgeAdByLLM(env, cfg, { profile: { bio: 'x' }, text: '开放结构样本子丑' });
		assert('★ 走真实链路（OpenAI 结构）也能拿到答案并判为广告',
			got !== null && got.ad === true, JSON.stringify(got));
	}
	// ⑦e 返回结构完全不认识时，日志必须把结构本身打出来（否则又是一次 [object Object] 排查）
	{
		const env = await makeReadyEnv({ AI: makeAI({ onLlm: () => ({ totally: 'unknown shape' }) }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
		const got = await W.judgeAdByLLM(env, cfg, { profile: { bio: 'x' }, text: '未知结构样本寅卯' });
		assert('★ 认不出的返回 → 判定为未命中（不瞎猜）', got === null, JSON.stringify(got));
	}
	// ⑦f 熔断：连着取不到回答就必须停掉第⑥层 —— 2026-10-11 线上那轮就是
	// 276 次调用全部取错字段、一次次白烧 Neurons，却没有任何机制发现链路坏了。
	// 分池、每日上限、同载荷去重，没有一道闸挡得住「调用成功但取值取错」。
	{
		const env = await makeReadyEnv({ AI: makeAI({ onLlm: () => ({ nope: 1 }) }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '500', AD_LLM_DAILY_MESSAGE: '500' });
		for (let i = 0; i < 20; i++) {
			await W.judgeAdByLLM(env, cfg, { profile: { bio: 'x' }, text: '熔断样本' + i });
		}
		const before = env.AI.llmCalls;
		const after = await W.judgeAdByLLM(env, cfg, { profile: { bio: 'x' }, text: '熔断样本末尾' });
		assert('★ 连续 20 次取不到回答 → 第 21 次不再调用模型（省额度的关键）',
			after === null && env.AI.llmCalls === before,
			'调用前=' + before + ' 调用后=' + env.AI.llmCalls);
		const stats = await W.readAdLLMOutcome(env, Math.floor(Date.now() / 1000));
		assert('★ 熔断状态能被 /adstats 读到', stats.broken === true, JSON.stringify(stats));
		assert('★ 上次返回字段名被记下（不含内容，隐私面）',
			typeof stats.lastShape === 'string' && stats.lastShape.includes('nope'), stats.lastShape);
	}
	// ⑦g 成功一次就清零连续失败 —— 否则一天里夹着的零星失败（模型偶尔不守
	// JSON 格式、thinking 偶尔过长）会累计到熔断线，把一条正常的第⑥层误关掉。
	{
		let n = 0;
		const env = await makeReadyEnv({ AI: makeAI({ onLlm: () => {
			n += 1;
			return n % 2 ? { nope: 1 } : { response: adAnswer(0.9) };
		} }) });
		const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '500', AD_LLM_DAILY_MESSAGE: '500' });
		for (let i = 0; i < 40; i++) {
			await W.judgeAdByLLM(env, cfg, { profile: { bio: 'x' }, text: '清零样本' + i });
		}
		const stats = await W.readAdLLMOutcome(env, Math.floor(Date.now() / 1000));
		assert('★ 成败交替 → 连续失败被清零、不熔断',
			stats.broken === false && stats.consecFail === 0, JSON.stringify(stats));
	}

	// ⑦c 分池：消息池打满后，入群池仍有额度 —— 三条轨不再互相挤占
	{
		const env = await makeReadyEnv({ AI: makeAI({ llmAnswer: adAnswer(0.97) }) });
		const cfg = W.loadAdDetectionConfig({
			AD_LLM_DAILY: '100', AD_LLM_DAILY_MESSAGE: '1', AD_LLM_DAILY_JOIN: '5', AD_LLM_DAILY_CRON: '0'
		});
		// 消息池上限 1：第一次进得去，第二次被本池拦下（总池 100 还远没满）
		const r1 = await W.judgeAdByLLM(env, cfg, { profile: { bio: 'x' }, text: '分池样本壬' }, { pool: 'message' });
		const r2 = await W.judgeAdByLLM(env, cfg, { profile: { bio: 'y' }, text: '分池样本癸' }, { pool: 'message' });
		const r3 = await W.judgeAdByLLM(env, cfg, { profile: { bio: 'z' }, text: '分池样本子' }, { pool: 'join' });
		assert('★ 消息池上限 1 → 第一次进得去', r1 !== null, JSON.stringify(r1));
		assert('★ 消息池打满 → 第二次被本池拦下（总池还有余量）', r2 === null, JSON.stringify(r2));
		assert('★ 入群池独立 → 同一时刻仍进得去', r3 !== null, JSON.stringify(r3));
		const zero = await W.judgeAdByLLM(env, cfg, { profile: { bio: 'w' }, text: '分池样本丑' }, { pool: 'cron' });
		assert('★ 某池配 0 → 该路 LLM 直接关闭', zero === null, JSON.stringify(zero));
	}
}

// ================= 汇总 =================
const summary = '=== 总计 ' + (pass + fail) + ' 项，通过 ' + pass + '，失败 ' + fail + ' ===';
console.log('\n' + summary);
if (fail) {
	console.log('失败项：\n - ' + failures.join('\n - '));
	process.exit(1);
}
