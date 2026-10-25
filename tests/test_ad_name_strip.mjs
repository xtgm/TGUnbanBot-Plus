// 昵称剥离复验 · 连环误封 7307358097（Angel / @svipultra）的根治验证
//
// 【线上现象】这个号「任意发言就被 ban」，连中 5 次，相似度随封禁次数单调上升：
//   0.794(#1722) → 0.798(#1883) → 0.811(#2010) → 0.815(#1881) → 0.828(#2014)
//
// 【四环闭环】
//   ① detectAdOnMessage 闸一把 bio 写死为空且 ban 就地返回 → 他 bio 里的豁免词
//      「私聊」「Bot」从未被读到 → 得分恒为 0
//   ② 得分 0 时 #1615 那道 `score < 0` 的豁免否证不生效（0 < 0 为假）
//   ③ 语义文本 = name + bio + text，bio 空时「Angel 有毒」里昵称占 5/7 字 → 昵称主导向量
//   ④ 每次误封学一条「Angel ×××」进样本库 → 下次他说任何话都必然更相似
//
// 【本次三处改动】
//   X 检测端：AI 硬命中时剥掉昵称复验，仍 ≥ 阈值才准定罪（断 ②③）
//   Y 学习端：剥昵称后没有实质话术的不入样本库（断 ④）
//   Z 闸一：仅当「AI 单独定罪」时补查一次 bio 再复评（断 ①）
//
// 【验收的两面，缺一不可】
//   正面：Angel 的 5 条真实样本必须全部放行
//   反面：真广告号（话术写在 bio / 正文里）必须仍被 AI 层秒杀 —— 召回零损失
//         否则这套改动就是把第三层废掉，而不是修好它
//
// 运行：node test_ad_name_strip.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
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
	const nIn = (v) => v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : (typeof v === 'bigint' ? Number(v) : v));
	const nOut = (r) => { if (!r) return null; const o = {}; for (const k of Object.keys(r)) { const v = r[k]; o[k] = typeof v === 'bigint' ? Number(v) : v; } return o; };
	const exec = (sql, params) => {
		const st = db.prepare(sql);
		const bd = params.map(nIn);
		const up = sql.trim().slice(0, 6).toUpperCase();
		if (up === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		const info = st.run(...bd);
		return { kind: 'write', meta: { changes: Number(info?.changes || 0), last_row_id: Number(info?.lastInsertRowid || 0), duration: 0, rows_read: 0, rows_written: Number(info?.changes || 0) } };
	};
	const mk = (sql) => { const s = { sql, params: [] }; const api = { __d1: s,
		bind(...a) { s.params = a; return api; },
		async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
		async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, meta: r.meta }; },
		async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; } };
		return api; };
	return { __sqlite: db, prepare: mk,
		async exec(sql) { db.exec(sql); return { count: 1, duration: 0 }; },
		async batch(sts) { const list = Array.from(sts || []); const out = []; db.exec('BEGIN');
			try { for (const st of list) { const s = st?.__d1; if (!s) throw new Error('bad stmt'); const r = exec(s.sql, s.params);
				out.push(r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, meta: r.meta }); } db.exec('COMMIT'); }
			catch (e) { db.exec('ROLLBACK'); throw e; } return out; },
		query(sql, ...p) { return db.prepare(sql).all(...p.map(nIn)).map(nOut); } };
}

// ---------- Bot API mock ----------
let calls = [];
let profiles = {};			// user_id -> { first_name, username, bio }
const resetCalls = () => { calls = []; };
const countCalls = (m) => calls.filter((c) => c.method === m).length;

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const method = String(url).split('/').pop();
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
		calls.push({ method, body });
		let payload = { ok: true, result: true };
		if (method === 'getMe') payload = { ok: true, result: { id: 777000, is_bot: true, username: 'AdGuardTestBot' } };
		else if (method === 'sendMessage') payload = { ok: true, result: { message_id: 5000 + calls.length } };
		else if (method === 'getChat') {
			const p = profiles[String(body?.chat_id)] || {};
			payload = { ok: true, result: { id: body?.chat_id, first_name: p.first_name ?? '未知', username: p.username, bio: p.bio ?? '' } };
		} else if (method === 'getChatMember') payload = { ok: true, result: { status: 'member', user: { id: body?.user_id } } };
		else if (method === 'getChatAdministrators') payload = { ok: true, result: [] };
		return { ok: true, status: 200, async json() { return payload; }, async text() { return JSON.stringify(payload); } };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });
const W = sandbox;
const handler = sandbox.__handler;

// 顶层 const 不挂 vm 全局（只有 function 声明会），所以从源码正则提取产品值 ——
// 既跟随产品又不依赖沙箱导出。写死数字会在产品调整时静默失配。
const EMBED_DIM = Number(src.match(/const AD_EMBEDDING_DIMENSION = (\d+)/)?.[1]);
const MIN_CORE = Number(src.match(/const AD_SAMPLE_MIN_CORE_LENGTH = (\d+)/)?.[1]);
const SOFT_BONUS = Number(src.match(/const AD_AI_SOFT_BONUS_SCORE = (\d+)/)?.[1]);
if (!Number.isInteger(EMBED_DIM) || !Number.isInteger(MIN_CORE)) throw new Error('无法从 _worker.js 解析常量，测试无法继续');

const GROUP_ID = '-1001111111111';
const OWNER_ID = 10001;
const makeEnv = (extra = {}) => ({ TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID), AD_AUTO_BAN: 'true', DB: makeD1(), ...extra });

const AD_VEC = () => { const v = new Array(EMBED_DIM).fill(0); v[0] = 1; v[1] = 0.5; return v; };
const OK_VEC = () => { const v = new Array(EMBED_DIM).fill(0); v[2] = 1; v[3] = 0.5; return v; };
// 恒返回广告向量：把「AI 硬命中」这个前提钉死为真，于是唯一能阻止定罪的
// 就只剩下新加的昵称剥离复验。按关键词映射的 mock 在 Angel 样本上根本命不中，
// 那样这条改动等于没测（#1615 那组断言踩过同样的坑，见 test_ad_detection.mjs）。
const makeAI = (mapper) => ({ calls: 0, async run(model, input) { this.calls += 1; return { data: [mapper(String(input?.text?.[0] ?? ''))] }; } });
const alwaysAd = () => makeAI(() => AD_VEC());
// 昵称敏感 mock：文本里还带着「Angel」就像广告，剥掉昵称就什么都不像。
// 这正是线上那 5 条样本的真实机制 —— 相似度完全由昵称与库里 5 条「Angel ×××」重合刷出来。
//
// 【用白名单而不是广告词黑名单】样本库里除了 10 条 AD_SAMPLE_SEED_TEXTS，
// 还有 21 条从 AD_FINGERPRINT_SEED 下沉来的中心特征（`source='seed-core'`）。
// 先前用 /收购|网赚|.../ 这类关键词黑名单圈广告，漏掉了其中 13 条
// （「网du商」「商宝账号」「黑丝反差」……），它们被映射成正常向量，于是
// 剥昵称后的闲聊句跟它们余弦 1.0，复验照样命中 —— 这一节就永远测不到
// 「复验跌破阈值」那条分支（实测踩过，三条断言全红才查出来）。
// 黑名单还会随种子内容漂移：今天补齐，下次有人加一条种子又漏。
// 白名单则天然稳定 —— 库里本来就【全是】广告文本，只有被测的闲聊句是正常的。
const NORMAL_TEXTS = ['今天天气不错适合出门散步'];
const isNormal = (t) => NORMAL_TEXTS.some((n) => t.includes(n)) && !t.includes('Angel');
const nameDriven = () => makeAI((t) => (isNormal(t) ? OK_VEC() : AD_VEC()));

let pass = 0, fail = 0;
const check = (label, ok, extra) => {
	if (ok) { pass += 1; console.log('  ✅ ' + label + (extra ? '  ' + extra : '')); }
	else { fail += 1; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
};
const section = (t) => console.log('\n=== ' + t + ' ===');

// 线上 5 条真实误封样本（正文取自主人截图）。
const ANGEL_TEXTS = ['有毒', '？', '哈哈哈', '好的谢谢', '我也这么觉得'];
const ANGEL_BIO = '私聊Bot👉 @svipultra_bot';

section('1. 取材函数：剥昵称后的实质话术长度');
{
	check('剥昵称文本不含昵称',
		W.buildAdSampleTextWithoutName({ name: 'Angel', bio: '', text: '有毒' }) === '有毒',
		JSON.stringify(W.buildAdSampleTextWithoutName({ name: 'Angel', bio: '', text: '有毒' })));
	// buildAdSampleText 是【一个字都不许改】的：它的返回值进 adTextHash 当唯一键，
	// 改拼法会让全库存量样本 hash 失效、历史 /ignore 与 /unban 的回滚一次性作废。
	check('buildAdSampleText 仍含昵称（拼法未动，存量 hash 不失效）',
		W.buildAdSampleText({ name: 'Angel', bio: '', text: '有毒' }) === 'Angel 有毒',
		JSON.stringify(W.buildAdSampleText({ name: 'Angel', bio: '', text: '有毒' })));
	check('Angel 剥昵称后不足门槛（这是他每次被判的根源）',
		W.adSampleBodyCoreLength({ name: 'Angel', bio: '', text: '有毒' }) < MIN_CORE,
		'core=' + W.adSampleBodyCoreLength({ name: 'Angel', bio: '', text: '有毒' }) + ' 门槛=' + MIN_CORE);
	check('真广告剥昵称后远超门槛（召回不受影响的依据）',
		W.adSampleBodyCoreLength({ name: '小美', bio: '收购USDT秒结长期有效', text: '有意者私聊详谈' }) >= MIN_CORE,
		'core=' + W.adSampleBodyCoreLength({ name: '小美', bio: '收购USDT秒结长期有效', text: '有意者私聊详谈' }));
	// 与 addAdSample 的 no_core 闸同一个语义：链接不是话术。
	check('纯链接剥昵称后仍不足门槛（占位符不算话术）',
		W.adSampleBodyCoreLength({ name: '小美', bio: 'https://t.me/+AbCdEfGhIjK', text: '' }) < MIN_CORE,
		'core=' + W.adSampleBodyCoreLength({ name: '小美', bio: 'https://t.me/+AbCdEfGhIjK', text: '' }));
	check('空 payload 不崩', W.adSampleBodyCoreLength({}) === 0 && W.adSampleBodyCoreLength(null) === 0);
	// 两端必须共用同一判据，否则检测端 veto 了、学习端照样把样本学进去，下次照样误封。
	check('检测端与学习端共用同一个判据函数',
		/aiNameStripVeto = true;[\s\S]{0,200}adSampleBodyCoreLength|adSampleBodyCoreLength\(payload\)/.test(src)
		&& /sampleSubstantial[\s\S]{0,120}adSampleBodyCoreLength\(evaluation\.payload\)/.test(src));
}

section('2. 检测端 · Angel 的真实样本（改动 X 单层能拦住的）');
{
	// 【这一节刻意只测改动 X】传 skipMissingBioPenalty 且不查 bio，等于把闸一的处境
	// 原样复现（bio 恒为空）。剥掉昵称后不足 MIN_CORE 的样本，X 一层就能拦住。
	//
	// 「我也这么觉得」不在这一组：它剥昵称后正好 6 字 = 门槛，要走二次 embedding，
	// 而本节的 mock 恒返回广告向量（把硬命中钉死为真），复验必然也命中 → X 拦不住。
	// 那一条由改动 Z（补查 bio）兜住，在第 6 节端到端验证 —— 见那里的说明。
	// 【这个分界必须明写出来】否则下次有人以为 X 一层就包打天下，
	// 动了 Z 的补查逻辑而测试全绿，线上就会重演这次连环误封。
	const STRIP_COVERED = ANGEL_TEXTS.filter((t) => W.adSampleBodyCoreLength({ name: 'Angel', bio: '', text: t }) < MIN_CORE);
	check('5 条真实样本里有 ' + STRIP_COVERED.length + ' 条由 X 单层覆盖',
		STRIP_COVERED.length >= 4, STRIP_COVERED.join(' / '));
	for (const text of STRIP_COVERED) {
		const env = makeEnv({ AI: alwaysAd() });
		await W.adDetectionReady(env);
		const r = await W.evaluateAdSuspect(env, {
			profile: { firstName: 'Angel', username: 'svipultra', bio: '', status: '' },
			text, forwardChat: null
		}, { skipMissingBioPenalty: true });
		check('「' + text + '」不再被封',
			r.verdict !== 'ban', 'verdict=' + r.verdict + ' layer=' + r.layer + ' 得分=' + r.score);
		check('「' + text + '」判定层不标 ai', r.layer !== 'ai', 'layer=' + r.layer);
	}

	const env = makeEnv({ AI: alwaysAd() });
	await W.adDetectionReady(env);
	const r = await W.evaluateAdSuspect(env, {
		profile: { firstName: 'Angel', username: 'svipultra', bio: '', status: '' },
		text: '有毒', forwardChat: null
	}, { skipMissingBioPenalty: true });
	// 必须先证明「硬命中条件确实成立过」，否则上面的放行可能只是假通过 ——
	// 可能压根没越过阈值，那这套改动就完全没被测到。
	check('相似度确实越过了阈值（证明硬命中条件成立过，放行不是假通过）',
		r.aiSimilarity >= 0.78, '相似度 ' + r.aiSimilarity);
	check('aiNameStripVeto 标记为真', r.aiNameStripVeto === true, String(r.aiNameStripVeto));
	check('reasons 写明「相似度由昵称贡献」（复盘可观测）',
		r.reasons.some((x) => x.includes('由昵称贡献') && x.includes('降级')), JSON.stringify(r.reasons));
	// 走的是「不足门槛」那条捷径，连 embedding 都省了 —— 顺手验证这个省法真的生效。
	check('reasons 写明剥离后剩余字数',
		r.reasons.some((x) => x.includes('剥离昵称后仅剩')), JSON.stringify(r.reasons));
	check('降级为软加分而非直接放行（不是把 AI 层废掉）',
		r.score === SOFT_BONUS, '得分 ' + r.score + '，期望 ' + SOFT_BONUS);
}

section('3. 检测端 · 真广告号必须仍被 AI 层秒杀（召回零损失）');
{
	// 话术写在 bio 与正文里 —— 广告号要让人看见广告，就必须写在别人看得见的地方。
	// 剥掉昵称照样是一整段广告，复验必然仍命中。
	const cases = [
		{ label: '话术在 bio', profile: { firstName: '小美', username: 'xm8899', bio: '收购USDT秒结长期有效加我' }, text: '在吗' },
		{ label: '话术在正文', profile: { firstName: '阿强', username: 'aq7788', bio: '' }, text: '来跑分一天一万包吃住有意者私聊我详谈' },
		{ label: '话术在两处', profile: { firstName: 'Angel', username: 'svipultra', bio: '高价收U秒结' }, text: '长期有效加我详谈上车' }
	];
	for (const c of cases) {
		const env = makeEnv({ AI: alwaysAd() });
		await W.adDetectionReady(env);
		const r = await W.evaluateAdSuspect(env, { profile: { ...c.profile, status: '' }, text: c.text, forwardChat: null }, {});
		check(c.label + '：照样被定罪', r.verdict === 'ban', 'verdict=' + r.verdict + ' layer=' + r.layer + ' 得分=' + r.score);
		check(c.label + '：复验未否决（aiNameStripVeto=false）', r.aiNameStripVeto === false, String(r.aiNameStripVeto));
	}
	// 第三条尤其关键：昵称同样是 Angel，但 bio / 正文里有实质话术 →
	// 证明复验拦的是「昵称独占贡献」这一种形态，不是拦「叫 Angel 的人」。
	const env = makeEnv({ AI: alwaysAd() });
	await W.adDetectionReady(env);
	const r = await W.evaluateAdSuspect(env, {
		profile: { firstName: 'Angel', username: 'svipultra', bio: '高价收U秒结', status: '' },
		text: '长期有效加我详谈上车', forwardChat: null
	}, {});
	check('同一个昵称 Angel：带实质话术时照样被封（拦的是形态不是人）',
		r.verdict === 'ban', 'verdict=' + r.verdict + ' layer=' + r.layer);
}

section('4. 检测端 · 剥昵称后仍有话术但相似度跌破阈值 → 也要降级');
{
	// 这一路走的是真正的二次 embedding（不是长度捷径）：剥昵称后还有 8 字实质话术，
	// 但相似度整个来自昵称。mock 按「文本里还有没有 Angel」区分，正是线上机制。
	const env = makeEnv({ AI: nameDriven() });
	await W.adDetectionReady(env);
	// 样本库里先塞一条带 Angel 的样本（模拟前几次误封学进去的脏样本）。
	await W.addAdSample(env, 'Angel 有毒', { source: 'auto' });
	// 【必须把向量灌满再评估】topUpAdSampleEmbeddings 每次只补 AD_SAMPLE_LAZY_BATCH(8) 条，
	// 而种子 + 中心特征有 30 余条 NULL 排在前面（ORDER BY id ASC），刚加的这条要跑 4 轮才轮到。
	// 不灌满的话它没有向量 → loadAdSampleEmbeddings 读不到 → 相似度恒为 0，
	// 这一节的断言会全部变成假通过（跑出来就是 aiSimilarity=0 却「不定罪」）。
	for (let i = 0; i < 12 && (await W.topUpAdSampleEmbeddings(env)) > 0; i += 1) { /* 灌满为止 */ }
	const r = await W.evaluateAdSuspect(env, {
		profile: { firstName: 'Angel', username: 'svipultra', bio: '', status: '' },
		text: '今天天气不错适合出门散步', forwardChat: null
	}, { skipMissingBioPenalty: true });
	check('原文相似度越过阈值（昵称把它推上去了）', r.aiSimilarity >= 0.78, '相似度 ' + r.aiSimilarity);
	check('剥昵称复验后跌破阈值 → 降级不定罪', r.verdict !== 'ban', 'verdict=' + r.verdict + ' 得分=' + r.score);
	check('aiNameStripVeto 为真', r.aiNameStripVeto === true, String(r.aiNameStripVeto));
	check('reasons 写明复验后的相似度（而非长度不足）',
		r.reasons.some((x) => x.includes('剥离昵称后相似度降至')), JSON.stringify(r.reasons));
}

section('5. 学习端 · 断掉「误封 → 学样本 → 下次更容易误封」的闭环');
{
	// 直接打处置端：构造一个「已定罪」的评估结果，看样本到底进不进库。
	// 这一环即使检测端已经拦住 AI 定罪，仍然必须堵 —— 样本还可能从评分层、
	// 结构查杀这些别的定罪层流进来。
	const env = makeEnv({ AI: alwaysAd() });
	await W.adDetectionReady(env);
	const before = env.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;
	resetCalls();
	await W.enforceAdDetection(env, { userId: '7307358097', chatId: GROUP_ID, chatTitle: '测试群', messageId: 101 }, {
		verdict: 'ban', score: 0, layer: 'ai', reasons: ['测试'],
		payload: { name: 'Angel', username: '@svipultra', bio: '', text: '有毒', quoted: '', domains: [] },
		structure: { guilty: false, channel: '', form: '', reasons: [] },
		snapshot: { name: 'Angel', username: '@svipultra', bio: '', text: '有毒', status: '', forwardTitle: '' },
		behaviorScore: 0, retainScore: 0, aiSimilarity: 0.815, aiSample: 'Angel 哈哈哈', aiNameStripVeto: true, bioChecked: true
	}, {});
	const after = env.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;
	check('「Angel 有毒」不再进样本库（闭环第 ④ 环断开）', after === before, before + ' → ' + after);
	check('样本库里没有以 Angel 开头的自动样本',
		env.DB.query("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE sample_text LIKE 'Angel%'")[0].c === 0);
	// 处置本身照常执行 —— 这一闸只管「学不学」，不管「封不封」。
	check('封禁流程本身不受影响（该封的照封）',
		env.DB.query("SELECT id FROM blacklist WHERE id = '7307358097'").length === 1);

	// 反面：真广告照常进库，AI 的自我学习能力一点没丢。
	const env2 = makeEnv({ AI: alwaysAd() });
	await W.adDetectionReady(env2);
	const b2 = env2.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;
	await W.enforceAdDetection(env2, { userId: '99001', chatId: GROUP_ID, chatTitle: '测试群', messageId: 102 }, {
		verdict: 'ban', score: 9, layer: 'score', reasons: ['测试'],
		payload: { name: '小美', username: '@xm8899', bio: '收购USDT秒结长期有效', text: '有意者私聊详谈', quoted: '', domains: [] },
		structure: { guilty: false, channel: '', form: '', reasons: [] },
		snapshot: { name: '小美', username: '@xm8899', bio: '收购USDT秒结长期有效', text: '有意者私聊详谈', status: '', forwardTitle: '' },
		behaviorScore: 9, retainScore: 9, aiSimilarity: 0.9, aiSample: null, aiNameStripVeto: false, bioChecked: true
	}, {});
	const a2 = env2.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;
	check('真广告照常学进样本库（AI 自学习能力未削弱）', a2 === b2 + 1, b2 + ' → ' + a2);
	check('存进去的仍是含昵称的完整文本（拼法未改，回滚仍对得上）',
		env2.DB.query("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE sample_text LIKE '小美%'")[0].c === 1);

	// /spam 回复学习走 sampleText 覆盖：取材是引用体正文，本来就不含昵称，
	// 不该再被剥昵称这道闸约束（否则等于凭空多一道无关门槛）。
	const env3 = makeEnv({ AI: alwaysAd() });
	await W.adDetectionReady(env3);
	const b3 = env3.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;
	await W.enforceAdDetection(env3, { userId: '99002', chatId: GROUP_ID, chatTitle: '测试群', messageId: 103 }, {
		verdict: 'ban', score: 9, layer: 'score', reasons: ['测试'],
		payload: { name: 'Angel', username: '@x', bio: '', text: 'a', quoted: '', domains: [] },
		structure: { guilty: false, channel: '', form: '', reasons: [] },
		snapshot: { name: 'Angel', username: '@x', bio: '', text: 'a', status: '', forwardTitle: '' },
		behaviorScore: 9, retainScore: 9, aiSimilarity: 0, aiSample: null, bioChecked: true
	}, { sampleText: '承接各类业务日结工资有意者加我详谈', sampleSource: 'spam' });
	const a3 = env3.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;
	check('/spam 回复学习不受剥昵称闸约束（取材本就不含昵称）', a3 === b3 + 1, b3 + ' → ' + a3);
}

section('6. 闸一 · AI 单独定罪时补查 bio（端到端 webhook）');
{
	const env = makeEnv({ AI: alwaysAd() });
	profiles = { '7307358097': { first_name: 'Angel', username: 'svipultra', bio: ANGEL_BIO } };
	// 走完整 webhook：从 Telegram 推来一条消息，到实际封禁落库这一整条路。
	const send = async (text, id = 7307358097) => {
		resetCalls();
		await handler.fetch(new Request('https://x.dev/', {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), message: {
				message_id: 900 + Math.floor(Math.random() * 1000), date: Math.floor(Date.now() / 1000), text,
				chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试群' },
				from: { id, is_bot: false, first_name: 'Angel', username: 'svipultra' }
			} })
		}), env, { waitUntil() {} });
	};
	await send('大家好');		// 先让表建好、名册落一行
	for (const text of ANGEL_TEXTS) {
		await send(text);
		check('端到端「' + text + '」不被封禁',
			countCalls('banChatMember') === 0, '封禁调用 ' + countCalls('banChatMember') + ' 次');
	}
	check('端到端：全程没进黑名单',
		env.DB.query("SELECT id FROM blacklist WHERE id = '7307358097'").length === 0);

	// bio 里的豁免词必须真的被读到 —— 这是第 ① 环，也是最关键的一环：
	// 线上他被封 5 次，通知上永远写着「简介：（本次未查询）」。
	//
	// 【这里必须用「我也这么觉得」】它剥昵称后正好 6 字 = MIN_CORE，改动 X 的长度捷径
	// 覆盖不到它，恒返回广告向量的 mock 又让二次复验也命中 → X 拦不住 → AI 单独定罪成立
	// → 这才会触发改动 Z 的补查。换成「有毒」的话 X 在更早一步就 veto 了（剥后只剩 2 字），
	// 连 bio 都不用查就放行 —— 那是更优的结果，但测不到 Z。两条路都得有断言盯着。
	// 【必须换一个没查过的 user_id】readAdProfileCache 是模块级 5 分钟缓存，不按 env 隔离，
	// 上面那轮已经把 7307358097 的资料缓存住了 —— 沿用同一个 id 会命中缓存、不发 getChat，
	// 这条断言就永远是 0 次（实测踩过）。缓存命中本身是好事（补查不重复花请求），
	// 但要验证「补查这个动作真的发生了」就得绕开它。
	const envBio = makeEnv({ AI: alwaysAd() });
	profiles = { '7307358098': { first_name: 'Angel', username: 'svipultra2', bio: ANGEL_BIO } };
	resetCalls();
	await handler.fetch(new Request('https://x.dev/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: 1, message: {
			message_id: 951, date: Math.floor(Date.now() / 1000), text: '我也这么觉得',
			chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试群' },
			from: { id: 7307358098, is_bot: false, first_name: 'Angel', username: 'svipultra2' }
		} })
	}), envBio, { waitUntil() {} });
	check('AI 单独定罪路径上确实查了 bio（不再是「本次未查询」）',
		countCalls('getChat') >= 1, 'getChat ' + countCalls('getChat') + ' 次');
	check('查到 bio 里的豁免词后不再封禁（第 ① 环打通）',
		countCalls('banChatMember') === 0, '封禁 ' + countCalls('banChatMember') + ' 次');
	check('没进黑名单', envBio.DB.query("SELECT id FROM blacklist WHERE id = '7307358098'").length === 0);

	// 反面：同一条路径上，bio 里【没有】豁免词而是广告话术 → 补查完照样该封。
	// 否则「补查 bio」就变成了无条件放行通道，AI 层被彻底废掉。
	const envGuilty = makeEnv({ AI: alwaysAd() });
	profiles = { '88801': { first_name: 'Angel', username: 'adbot888', bio: '收购USDT秒结长期有效加我详谈' } };
	resetCalls();
	await handler.fetch(new Request('https://x.dev/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: 3, message: {
			message_id: 952, date: Math.floor(Date.now() / 1000), text: '我也这么觉得',
			chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试群' },
			from: { id: 88801, is_bot: false, first_name: 'Angel', username: 'adbot888' }
		} })
	}), envGuilty, { waitUntil() {} });
	check('反面：补查到的 bio 是广告话术 → 照样封禁（补查不是放行通道）',
		countCalls('banChatMember') > 0, '封禁 ' + countCalls('banChatMember') + ' 次');
	check('反面：进了黑名单', envGuilty.DB.query("SELECT id FROM blacklist WHERE id = '88801'").length === 1);
}

section('7. 闸一 · 其他三层定罪照旧就地处置，一次 getChat 都不多花');
{
	// 「现有功能不受影响」的客观判据：补查只挂在「AI 单独定罪」这一种最弱形态上。
	// 评分层撞阈值、指纹层命中、结构查杀命中 —— 这三条路径的成本必须与改动前逐字节一致。
	const env = makeEnv();		// 不绑 AI：彻底排除 AI 层干扰，只留结构化评分与结构查杀
	profiles = { '99010': { first_name: '收U秒结', username: 'shouu888', bio: '高价收购USDT长期有效' } };
	resetCalls();
	await handler.fetch(new Request('https://x.dev/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: 2, message: {
			message_id: 960, date: Math.floor(Date.now() / 1000), text: '收购USDT秒结长期有效有意者私聊我详谈立即上车',
			chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试群' },
			from: { id: 99010, is_bot: false, first_name: '收U秒结', username: 'shouu888' }
		} })
	}), env, { waitUntil() {} });
	check('非 AI 层定罪：照样封禁', countCalls('banChatMember') > 0, '封禁 ' + countCalls('banChatMember') + ' 次');
	check('非 AI 层定罪：一次 getChat 都没花（闸一就地处置，成本未变）',
		countCalls('getChat') === 0, 'getChat ' + countCalls('getChat') + ' 次');
	check('非 AI 层定罪：进了黑名单', env.DB.query("SELECT id FROM blacklist WHERE id = '99010'").length === 1);
}

section('8. 稳态成本 · 正常聊天的 Telegram 请求数不变');
{
	const env = makeEnv({ AI: makeAI(() => OK_VEC()) });		// 正常向量：不会硬命中
	profiles = {};
	const chat = async (id, text) => {
		await handler.fetch(new Request('https://x.dev/', {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), message: {
				message_id: 970 + Math.floor(Math.random() * 500), date: Math.floor(Date.now() / 1000), text,
				chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试群' },
				from: { id, is_bot: false, first_name: '正常群友', username: 'normaluser' }
			} })
		}), env, { waitUntil() {} });
	};
	await chat(55001, '大家早上好');		// 首次发言会查一次 bio（闸二本来的行为）
	resetCalls();
	for (let i = 0; i < 4; i += 1) await chat(55001, '今天天气不错适合出门散步' + i);
	check('稳态普通发言 0 个 getChat（bio 冷却期照旧生效）',
		countCalls('getChat') === 0, 'getChat ' + countCalls('getChat') + ' 次');
	check('稳态普通发言不封禁', countCalls('banChatMember') === 0, '封禁 ' + countCalls('banChatMember') + ' 次');
}

section('9. 回归 · 昵称本身就是广告的号不得漏放');
{
	// 这是本次改动最该担心的反作用：昵称剥离会不会把「昵称即广告」那类号放跑？
	// 不会 —— 那类号靠的是 scoreAdProfile 给昵称里的广告词计分，
	// 以及四通道里的 card / identity 查杀，两条路都不经过 AI 层，一行都没被碰。
	const env = makeEnv({ AI: alwaysAd() });
	await W.adDetectionReady(env);
	const r = await W.evaluateAdSuspect(env, {
		profile: { firstName: '【出租账号】高价收U', username: 'chuzu666', bio: '', status: '' },
		text: '在吗', forwardChat: null
	}, { skipMissingBioPenalty: true });
	check('昵称即广告：仍被定罪（走评分层 / 结构查杀，不依赖 AI 层）',
		r.verdict === 'ban', 'verdict=' + r.verdict + ' layer=' + r.layer + ' 得分=' + r.score);
	check('昵称即广告：定罪来自 AI 以外的层（证明不是靠 AI 兜的）',
		r.layer !== 'ai', 'layer=' + r.layer);
}

section('10. 回归 · #1615 豁免词否证仍然生效（老修复没被覆盖）');
{
	const env = makeEnv({ AI: alwaysAd() });
	await W.adDetectionReady(env);
	const r = await W.evaluateAdSuspect(env, {
		profile: { firstName: '逝去的晚风', username: 'aefg56', bio: '我的频道 https://t.me/lchnnb 私聊机器人 @wanfengr666_bot', status: '' },
		text: '签到', forwardChat: null
	}, {});
	check('#1615：豁免词已判负', r.score < 0 || r.reasons.some((x) => x.includes('豁免')), '得分 ' + r.score);
	check('#1615：仍不定罪', r.verdict !== 'ban', 'verdict=' + r.verdict);
	check('#1615：判定层不标 ai', r.layer !== 'ai', 'layer=' + r.layer);
}

console.log('\n昵称剥离复验（方案三）验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
