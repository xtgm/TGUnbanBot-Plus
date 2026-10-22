// 「AI 达线 + 引文逐字核对 → 直接落地」离线测试。
// 口径来源：主人原话「AI 达线 + evidence 逐字核对 → 直接落地 跟 menshen 一样」。
// menshen 的 evidence gate 是：模型判广告后必须给出引文，代码回原文逐字核对；
// 核对通过就落地，对不上就降为未定。本项目落在 applyAdLLMToEvaluation 达线之后。
//
// 【与 test_ad_llm.mjs 第 [10] 段的区别】那一段测的是「代码算出来的硬证据」
//（私有邀请链接 / 出口∧招揽 / 名片形态），这一段测的是「模型给的引文」。
// 两条是【或】关系：任一成立就封。本文件按这个语义下断言。
//
// 运行：node test_ad_evidence_citation.mjs

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
		async exec(sql) { db.exec(sql); return { results: [], success: true }; },
		async batch(stmts) { return Promise.all(stmts.map((st) => st.run())); },
		query(sql, ...params) {
			try { return db.prepare(sql).all(...params).map(normOut); }
			catch (_) { return []; }
		},
		_raw: db
	};
}

// ---------- 断言 ----------
let pass = 0, fail = 0;
const failures = [];
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 500) : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

// ---------- Telegram / Workers AI mock ----------
const calls = [];
function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 778001, is_bot: true, username: 'CiteTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 8000 + calls.length } };
		case 'getChat': return { ok: true, result: { id: body?.chat_id, first_name: '未知', bio: '' } };
		case 'getChatMember': return { ok: true, result: { status: 'member', user: { id: body?.user_id } } };
		case 'getChatAdministrators': return { ok: true, result: [] };
		default: return { ok: true, result: true };
	}
}

function makeAI(answerText, counter) {
	return {
		run: async () => {
			if (counter) counter.calls += 1;
			return { choices: [{ message: { content: answerText } }] };
		}
	};
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
		const payload = defaultPayload(method, body);
		return {
			ok: true, status: 200,
			async json() { return payload; },
			async text() { return JSON.stringify(payload); }
		};
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });

const W = sandbox;
function makeEnv(ai) {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', DB: makeD1(), AI: ai };
}
async function makeReadyEnv(ai) {
	const env = makeEnv(ai);
	await W.adDetectionReady(env);
	return env;
}
function cfg() {
	return W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
}
// 每个用例的 input 必须不同：judgeAdByLLM 有模块级 adLLMSeen 去重，
// 载荷一字不差时第二次会直接返回 null（症状与「没生效」一模一样）。
function answer(confidence, reason, features) {
	return JSON.stringify({ ad: true, confidence, reason, features });
}

// 锚点样本：bio 里是真广告话术，正文是普通寒暄。
// 这条用来区分「模型抄广告话术」与「模型抄一句无害的寒暄」。
const AD_BIO = '10U三个月 14U半年 27U一年 会员24小时自动秒开 | 一手货源 日结秒结';
const CHAT = '可以了，谢谢火佬';

// ================= [1] 引文逐字核对通过 → 直接落地 =================
section('[1] 模型给出逐字引文 → 直接封');
{
	const env = await makeReadyEnv(makeAI(answer(0.95, 'bio 写着价目与招揽', [
		{ type: 'keyword', value: '一手货源 日结秒结' }
	])));
	const got = await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 0, reasons: [] }, cfg(),
		{ profile: { firstName: '甲', lastName: '', username: '@seller888', bio: AD_BIO }, text: CHAT });
	assert('★ 达线 + 引文能在原文逐字找到 → ban', got.verdict === 'ban', JSON.stringify(got.reasons).slice(0, 400));
	assert('★ 理由写明是引文核对通过', (got.reasons || []).some((r) => String(r).includes('引文')), JSON.stringify(got.reasons).slice(0, 400));
}

// ================= [2] 编造的引文 → 不封 =================
section('[2] 模型编造引文 → 仍然观察');
{
	const env = await makeReadyEnv(makeAI(answer(0.95, 'Bio 有私有群邀请链接', [
		{ type: 'keyword', value: '加入我的私密频道领取福利' }
	])));
	const got = await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 0, reasons: [] }, cfg(),
		{ profile: { firstName: '乙', lastName: '', username: '@normal888', bio: '喜欢摄影和爬山' }, text: '大家好' });
	assert('★ 引文在原文里不存在 → observe 不封', got.verdict === 'observe', JSON.stringify(got.reasons).slice(0, 400));
	assert('★ 理由写明引文核对没通过',
		(got.reasons || []).some((r) => String(r).includes('逐字')), JSON.stringify(got.reasons).slice(0, 400));
}

// ================= [3] 通用词引文 → 不封 =================
section('[3] 引文是通用词 → 不封');
{
	const env = await makeReadyEnv(makeAI(answer(0.95, '正文在拉人', [
		{ type: 'keyword', value: '找我' }
	])));
	const got = await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 0, reasons: [] }, cfg(),
		{ profile: { firstName: '丙', lastName: '', username: '@c88888', bio: '' }, text: '有问题找我' });
	assert('★ 「找我」这类通用词不计证据 → observe', got.verdict === 'observe', JSON.stringify(got.reasons).slice(0, 400));
}

// ================= [4] 大小写差异不误杀 =================
section('[4] 引文大小写不同仍算逐字');
{
	const env = await makeReadyEnv(makeAI(answer(0.95, 'bio 是广告', [
		{ type: 'keyword', value: 'USDT 兑换 汇率优惠' }
	])));
	const got = await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 0, reasons: [] }, cfg(),
		{ profile: { firstName: '丁', lastName: '', username: '@d88888', bio: 'usdt 兑换 汇率优惠 私信联系' }, text: '你好' });
	assert('★ 只有大小写不同 → 仍算核对通过并封', got.verdict === 'ban', JSON.stringify(got.reasons).slice(0, 400));
}

// ================= [5] 引文来自 username 字段 =================
section('[5] username 里的引文同样认');
{
	const env = await makeReadyEnv(makeAI(answer(0.95, '用户名本身就是招揽', [
		{ type: 'keyword', value: 'cash_agent888' }
	])));
	const got = await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 0, reasons: [] }, cfg(),
		{ profile: { firstName: '戊', lastName: '', username: '@cash_agent888', bio: '' }, text: '你好' });
	assert('★ username 里的片段逐字存在 → ban', got.verdict === 'ban', JSON.stringify(got.reasons).slice(0, 400));
}

// ================= [6] 没有引文 = 维持原行为 =================
section('[6] 模型没给引文 → 维持观察');
{
	const env = await makeReadyEnv(makeAI(answer(0.95, '看起来像广告')));
	const got = await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 0, reasons: [] }, cfg(),
		{ profile: { firstName: '己', lastName: '', username: '@f88888', bio: '普通简介' }, text: '随便聊聊' });
	assert('★ 无 features → observe（不能靠一句结论定罪）', got.verdict === 'observe', JSON.stringify(got.reasons).slice(0, 400));
}

// ================= [7] t.me 不能当域名证据 =================
section('[7] t.me 链接不算引文证据');
{
	const env = await makeReadyEnv(makeAI(answer(0.95, '资料里有邀请链接', [
		{ type: 'domain', value: 't.me' }
	])));
	const got = await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 0, reasons: [] }, cfg(),
		{ profile: { firstName: '庚', lastName: '', username: '@g88888', bio: '交流群 t.me' }, text: '你好' });
	assert('★ t.me 被域名闸排除 → observe', got.verdict === 'observe', JSON.stringify(got.reasons).slice(0, 400));
}

// ================= [8] 反例池优先于引文 =================
section('[8] 反例池优先级最高');
{
	const env = await makeReadyEnv(makeAI(answer(0.99, 'bio 是广告', [
		{ type: 'keyword', value: '一手货源 日结秒结' }
	])));
	await W.addAdFalsePositive(env, '', { name: '辛', bio: AD_BIO });
	const got = await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 0, reasons: [] }, cfg(),
		{ profile: { firstName: '辛', lastName: '', username: '@h88888', bio: AD_BIO }, text: '' });
	assert('★ 主人判过误判的形态 → 即使引文核对通过也 observe', got.verdict === 'observe', JSON.stringify(got.reasons).slice(0, 400));
}

// ================= [9] 低于采信线不受影响 =================
section('[9] 低于采信线行为不变');
{
	const env = await makeReadyEnv(makeAI(answer(0.7, '有点像', [
		{ type: 'keyword', value: '一手货源 日结秒结' }
	])));
	const got = await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 0, reasons: [] }, cfg(),
		{ profile: { firstName: '壬', lastName: '', username: '@i88888', bio: AD_BIO }, text: '你好' });
	assert('★ 置信度 0.7 → 不封，引文闸不介入', got.verdict === 'observe', JSON.stringify(got.reasons).slice(0, 400));
}

// ================= [10] 代码硬证据仍然独立生效 =================
section('[10] 硬证据路径保留');
{
	const env = await makeReadyEnv(makeAI(answer(0.95, '引流广告')));
	const got = await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 0, reasons: [] }, cfg(),
		{ profile: { firstName: '癸', lastName: '', username: '@k88888', bio: '' }, text: '进群 https://t.me/+giwR6i9pU 一手货源' });
	assert('★ 无引文但有私有邀请链接 → ban', got.verdict === 'ban', JSON.stringify(got.reasons).slice(0, 400));
	assert('★ 理由仍写明代码验证', (got.reasons || []).some((r) => String(r).includes('代码验证')), JSON.stringify(got.reasons).slice(0, 400));
}

console.log(`\n========== 引文逐字核对：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
