// 第⑥层「AI 自我学习补特征」离线测试（2026-10-18 乙方案）。
// 与 test_ad_llm.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_ad_llm_learn.mjs
//
// 【它盯什么】乙方案的核心是两句话，一条一条钉死：
//   ① 主人永久规则「单特征不作为任何判定」→ 转正写入真指纹库时 weight 必须 < 0.8，
//      于是它只计分、永不单条定罪。**这条断言一旦松掉，AI 就能自己封人了。**
//   ② 主人对两种学习的定义 → AI 自动学的【只进候选池、不参与判定】；
//      只有人工指令（/ban /spam /sban）才把它转正。**候选池误接进评分层是灾难。**
// 外加形态闸五道（逐字复核 / 长度 / 类型 / 域名 / 通用词）—— 那是离线实测
// 从「找我」「t.me」这些过泛特征里直接得出来的，不是拍脑袋定的。

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
		return { kind: 'run', meta: {}, results: [{ success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }] };
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
		exec: async (sql) => { db.exec(sql); return { results: [], success: true }; },
		batch: async (stmts) => Promise.all(stmts.map((st) => st.run())),
		query(sql, ...params) { return db.prepare(sql).all(...params).map(normOut); }
	};
}

let pass = 0, fail = 0;
const failures = [];
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async () => ({ ok: true, status: 200, async json() { return { ok: true, result: true }; }, async text() { return '{}'; } })
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });
const W = sandbox;

const LLM_MODEL = src.match(/const AD_LLM_MODEL = '([^']+)'/)?.[1] || '';
const BAN_WEIGHT = Number(src.match(/const AD_FINGERPRINT_BAN_WEIGHT = ([\d.]+)/)?.[1]);
const PROMOTE_WEIGHT = Number(src.match(/const AD_LLM_FEATURE_PROMOTE_WEIGHT = ([\d.]+)/)?.[1]);
const PROMOTE_HITS = Number(src.match(/const AD_LLM_FEATURE_PROMOTE_HITS = (\d+)/)?.[1]);
if (!LLM_MODEL || !Number.isFinite(BAN_WEIGHT) || !Number.isFinite(PROMOTE_WEIGHT)) {
	throw new Error('无法从 _worker.js 解析常量，测试无法继续');
}

function makeEnv(extra = {}) {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID: '-1001111111111', OWNER_IDS: '10001', DB: makeD1(), ...extra };
}

// 一条带 features 的模型回答
function adAnswerWithFeatures(features, confidence = 0.9) {
	return JSON.stringify({
		ad: true, confidence, reason: 'bio 写着收益承诺',
		features
	});
}
function makeAI(answer) {
	return {
		llmCalls: 0,
		async run(model, input) {
			if (String(model) !== LLM_MODEL) return { data: [] };
			this.llmCalls += 1;
			return { response: answer };
		}
	};
}
function candidatesIn(env) {
	return env.DB.query('SELECT fingerprint, type, value, hits, promoted FROM ad_llm_candidates ORDER BY value');
}
function fingerprintsIn(env, source) {
	return env.DB.query("SELECT fingerprint, type, value, weight, source FROM ad_fingerprints WHERE source = ?", source);
}
async function makeReadyEnv(extra = {}) {
	const env = makeEnv(extra);
	await W.adDetectionReady(env);
	return env;
}

const PROFILE = { firstName: '小雅', lastName: '', bio: '全网最稳 一天稳定5万 包教包会', avatarId: '', badgeId: '' };

// ================= [1] sanitizeAdLLMFeatures 五道形态闸 =================
section('[1] 形态闸：模型抽的特征必须过五关才准进候选池');
{
	const input = { profile: PROFILE, text: '兼职刷单 日结 300-800 找我详聊' };
	const all = [
		{ type: 'keyword', value: '一天稳定5万' },        // 原文有、够长、类型对 → 留
		{ type: 'keyword', value: '包教包会' },           // → 留
		{ type: 'keyword', value: '兼职刷单 日结' },      // 正文里有 → 留
		{ type: 'keyword', value: '一天稳定9万' },        // 【幻觉】原文没有 → 丢
		{ type: 'keyword', value: '找我' },               // 通用词 → 丢
		{ type: 'keyword', value: '看这里' },             // 通用词 → 丢
		{ type: 'keyword', value: '收米' },               // 太短(2字) → 丢
		{ type: 'username', value: '@abc1234' },          // 类型不在白名单 → 丢
		{ type: 'bio', value: '全网最稳 一天稳定5万 包教包会' }, // 类型不在白名单 → 丢
		{ type: 'domain', value: 't.me' },                // 裸 t.me → 丢
		{ type: 'domain', value: 't.me/+AbCdEf123' },     // t.me 链接 → 丢
		{ type: 'phone', value: '13812345678' }           // 原文里没有这个号码 → 丢
	];
	const kept = W.sanitizeAdLLMFeatures(all, input);
	const vals = kept.map((f) => f.value);
	assert('逐字出现的短语留下', vals.includes('一天稳定5万') && vals.includes('包教包会'), JSON.stringify(vals));
	assert('正文里逐字出现的留下', vals.includes('兼职刷单 日结'), JSON.stringify(vals));
	assert('★ 幻觉值（原文没有）被丢掉', !vals.includes('一天稳定9万'), JSON.stringify(vals));
	assert('★ 通用词「找我」被丢掉', !vals.includes('找我'), JSON.stringify(vals));
	assert('★ 通用词「看这里」被丢掉', !vals.includes('看这里'), JSON.stringify(vals));
	assert('太短的（2 字）被丢掉', !vals.includes('收米'), JSON.stringify(vals));
	assert('类型不在白名单的被丢掉', !vals.includes('@abc1234'), JSON.stringify(vals));
	assert('★ 裸域名 t.me 被丢掉', !vals.includes('t.me'), JSON.stringify(vals));
	assert('★ t.me 邀请链接被丢掉', !vals.includes('t.me/+AbCdEf123'), JSON.stringify(vals));
	assert('原文里没有的号码被丢掉', !vals.includes('13812345678'), JSON.stringify(vals));
	// 真域名 + 真号码要能留下
	const kept2 = W.sanitizeAdLLMFeatures([
		{ type: 'domain', value: 'evil-shop.top' },
		{ type: 'phone', value: '13812345678' }
	], { profile: PROFILE, text: '详情看 evil-shop.top 电话 13812345678' });
	assert('真域名留下', kept2.some((f) => f.value === 'evil-shop.top'), JSON.stringify(kept2.map((f) => f.value)));
	assert('原文里的真号码留下', kept2.some((f) => f.value === '13812345678'), JSON.stringify(kept2.map((f) => f.value)));
	assert('空输入返回空数组', W.sanitizeAdLLMFeatures(null, input).length === 0);
	assert('无原文（空载荷）返回空数组', W.sanitizeAdLLMFeatures(all, { profile: {}, text: '' }).length === 0);
}

// ================= [2] buildAdLLMAnswer / parseAdLLMAnswerLoose 解析 features =================
section('[2] 解析：JSON 分支与兜底分支都要带上 features');
{
	const a = W.buildAdLLMAnswer({ ad: true, confidence: 0.9, reason: 'r', features: [{ type: 'keyword', value: '一天稳定5万' }] });
	assert('JSON 分支解析出 features', Array.isArray(a.features) && a.features.length === 1, JSON.stringify(a.features));
	const b = W.buildAdLLMAnswer({ ad: true, features: [{ type: 'keyword', value: 'x' }, { type: 'keyword', value: 'x' }] });
	assert('features 去重', b.features.length === 1, JSON.stringify(b.features));
	const c = W.buildAdLLMAnswer({ ad: true, features: 'not-an-array' });
	assert('features 不是数组时给空数组', Array.isArray(c.features) && c.features.length === 0);
	const d = W.buildAdLLMAnswer({ ad: true });
	assert('缺 features 字段时给空数组', Array.isArray(d.features) && d.features.length === 0);

	// 兜底分支：JSON 被截断（thinking 吃满额度），只剩半截 features
	const truncated = '{"ad": true, "confidence": 0.9, "reason": "r", "features": [{"type":"keyword","value":"一天稳定5万"},{"type":"keyword","value":"包教';
	const e = W.parseAdLLMAnswerLoose(truncated);
	assert('兜底分支仍抠出 ad', e && e.ad === true, JSON.stringify(e));
	assert('★ 兜底分支也能抠出残余 features', Array.isArray(e?.features) && e.features.length >= 1, JSON.stringify(e?.features));
	const f = W.parseAdLLMAnswerLoose('{"ad":false,"confidence":0.1,"reason":"正常","features":[]}');
	assert('判 false 时 features 为空', f && f.ad === false && f.features.length === 0);
}

// ================= [3] 候选池写入 + 自动转正 =================
section('[3] 候选池：AI 自动学到的先进池子，达门槛才转正');
{
	const env = await makeReadyEnv();
	const features = [
		{ type: 'keyword', value: '一天稳定5万' },     // 9 字，达自动转正长度门槛
		{ type: 'keyword', value: '包教包会' },        // 4 字，不达长度门槛
		{ type: 'keyword', value: '找我' }             // 通用词，进不来
	];
	const n = await W.recordAdLLMCandidates(env, features, { profile: PROFILE, text: '' });
	assert('写入候选池返回条数', n === 2, String(n));
	let rows = candidatesIn(env);
	assert('候选池有 2 条（通用词被闸掉）', rows.length === 2, JSON.stringify(rows));
	assert('候选池里没有「找我」', !rows.some((r) => r.value === '找我'), JSON.stringify(rows.map((r) => r.value)));
	assert('首次写入 hits=1', rows.every((r) => Number(r.hits) === 1), JSON.stringify(rows));
	assert('★ 未达门槛时一条都没转正', rows.every((r) => Number(r.promoted) === 0), JSON.stringify(rows));
	assert('★ 未达门槛时真指纹库里没有 llm-candidate',
		fingerprintsIn(env, 'llm-candidate').length === 0);

	// 再写 PROMOTE_HITS - 1 次，够门槛
	for (let i = 0; i < PROMOTE_HITS - 1; i++) {
		await W.recordAdLLMCandidates(env, features, { profile: PROFILE, text: '' });
	}
	rows = candidatesIn(env);
	const hot = rows.find((r) => r.value === '一天稳定5万');
	const cold = rows.find((r) => r.value === '包教包会');
	assert('达门槛的候选 hits 累加', Number(hot?.hits) === PROMOTE_HITS, JSON.stringify(hot));
	assert('★ 够长 + 够次数的候选自动转正', Number(hot?.promoted) === 1, JSON.stringify(hot));
	assert('★ 太短的候选（4 字）不自动转正', Number(cold?.promoted) === 0, JSON.stringify(cold));
	const promoted = fingerprintsIn(env, 'llm-candidate');
	assert('★ 自动转正写进了真指纹库', promoted.length === 1 && promoted[0].value === '一天稳定5万', JSON.stringify(promoted));
	assert('★★ 转正权重 = 0.5（低于定罪线 0.8）→ 只计分不定罪',
		Number(promoted[0]?.weight) === PROMOTE_WEIGHT && PROMOTE_WEIGHT < BAN_WEIGHT,
		JSON.stringify({ weight: promoted[0]?.weight, banWeight: BAN_WEIGHT }));
	assert('转正标记已写回候选池', candidatesIn(env).find((r) => r.value === '一天稳定5万')?.promoted === 1);
}

// ================= [4] 人工指令转正（参与学习）=================
section('[4] 人工转正：/ban /spam /sban 命中候选就立刻转正（不设 hits 门槛）');
{
	const env = await makeReadyEnv();
	// 写一条 4 字的候选（永远够不到自动转正的长度门槛）
	await W.recordAdLLMCandidates(env, [{ type: 'keyword', value: '包教包会' }],
		{ profile: PROFILE, text: '' });
	assert('候选池里有 1 条未转正', candidatesIn(env).length === 1 && Number(candidatesIn(env)[0].promoted) === 0);
	// 命中载荷 → 转正
	const n = await W.promoteAdLLMCandidatesFromPayload(env, {
		name: '小雅', bio: '全网最稳 一天稳定5万 包教包会', text: ''
	});
	assert('命中载荷 → 转正 1 条', n === 1, String(n));
	assert('★ 人工转正无视长度门槛（4 字也转）',
		fingerprintsIn(env, 'llm-candidate').length === 1, JSON.stringify(fingerprintsIn(env, 'llm-candidate')));

	// 不命中的载荷 → 不转正
	const env2 = await makeReadyEnv();
	await W.recordAdLLMCandidates(env2, [{ type: 'keyword', value: '包教包会' }],
		{ profile: PROFILE, text: '' });
	const n2 = await W.promoteAdLLMCandidatesFromPayload(env2, {
		name: '张三', bio: '爱看动漫 喜欢猫 偶尔直播', text: ''
	});
	assert('★ 载荷里没出现的候选不转正', n2 === 0 && fingerprintsIn(env2, 'llm-candidate').length === 0, String(n2));
	assert('未命中的候选仍是未转正', Number(candidatesIn(env2)[0].promoted) === 0);
}

// ================= [5] 接线：第⑥层判为广告 → 候选池真的被写 =================
section('[5] 接线：第⑥层判为广告时才写候选池（判 false 一个 SQL 都不发）');
{
	const env = await makeReadyEnv({
		AD_LLM_DAILY: '200',
		AI: makeAI(adAnswerWithFeatures([{ type: 'keyword', value: '一天稳定5万' }]))
	});
	const config = W.loadAdDetectionConfig(env);
	const ev = { verdict: 'pass', score: 0, reasons: [] };
	const out = await W.applyAdLLMToEvaluation(env, ev, config,
		{ profile: PROFILE, text: '' }, { pool: 'message' });
	assert('第⑥层给出了结论', out && out.reasons.length > 0, JSON.stringify(out?.reasons));
	let rows = [];
	try { rows = candidatesIn(env); } catch (_) { rows = []; }
	assert('★ 第⑥层判为广告 → 候选池被写入', rows.length === 1 && rows[0].value === '一天稳定5万', JSON.stringify(rows));

	// 判 false 的载荷 → 不写
	const env2 = await makeReadyEnv({
		AD_LLM_DAILY: '200',
		AI: makeAI(JSON.stringify({ ad: false, confidence: 0.05, reason: '正常用户', features: [] }))
	});
	const config2 = W.loadAdDetectionConfig(env2);
	await W.applyAdLLMToEvaluation(env2, { verdict: 'pass', score: 0, reasons: [] }, config2,
		{ profile: { firstName: '张三', bio: '爱看动漫' }, text: '' }, { pool: 'message' });
	let rows2 = [];
	try { rows2 = candidatesIn(env2); } catch (_) { rows2 = []; }
	assert('★ 判 false → 候选池一个都不写', rows2.length === 0, JSON.stringify(rows2));
}

console.log(`\n=== 总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail} ===`);
if (failures.length) console.log('失败项：\n  - ' + failures.join('\n  - '));
process.exit(fail === 0 ? 0 : 1);
