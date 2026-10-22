// 误判反例池（/ignore 的「不白判」那一半）离线测试。
// 与 test_ad_llm.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_ad_false_positive.mjs
//
// 【为什么单独一个文件】原测试段在 test_ad_llm.mjs 的 [11]，只覆盖了
// 「正文包含片段即命中」这一条理想路径。线上三个真实缺陷它一条都测不出来：
//
//   ① 写入只取正文 —— 入群线 / 申请线那一刻正文恒为空串，
//      addAdFalsePositive('') 因长度 < 4 直接返回 0，反例一条都落不了库。
//   ② 读写口径不对称 —— 写只存正文，读拼「昵称+用户名+bio+正文」，
//      再各自截 30 字。bio 超过 30 字时【读侧前 30 字全是 bio】，
//      永远匹配不到写侧存下的正文片段。广告号的 bio 普遍长于 30 字。
//   ③ 命中口径是对称子串 —— 片段必须【完整出现在】读侧文本里。
//      片段本身被截断（前 30 字）后，只要原文 30 字之后还有内容，
//      同一条原文回放回来都不一定命中：原文越长越匹配不上。
//
// 本文件按「主人判过误判之后，同一条内容回来必须被放过」这个语义下断言，
// 而不是按当前实现的字段细节下断言 —— 后者会在重构时一起被改掉。

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
		_sql.push(String(sql).replace(/\s+/g, ' ').trim());
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
		async exec(sql) { db.exec(sql); return { results: [], success: true }; },
		async batch(stmts) { return Promise.all(stmts.map((st) => st.run())); },
		// 表可能还没建（反例池是懒建表）。断言辅助用，抛异常会中断整个文件，
		// 而「表不存在」本身是测试用例，不该让脚本崩掉。
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
	else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 400) : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

// ---------- Telegram Bot API mock ----------
const calls = [];
let apiHandlers = {};
function resetCalls() { calls.length = 0; apiHandlers = {}; }
function callsOf(method) { return calls.filter((c) => c.method === method); }

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777001, is_bot: true, username: 'FpTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 9000 + calls.length } };
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
function makeEnv(extra = {}) {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', DB: makeD1(), ...extra };
}
async function makeReadyEnv(extra = {}) {
	const env = makeEnv(extra);
	await W.adDetectionReady(env);
	return env;
}

resetCalls();

// 图24 的真实 bio：长于 30 字，且带价目与引流。这条是整个文件的锚点样本。
const FIG24_BIO = '10U三个月 14U半年 27U一年 ✈️会员24小时自动秒开机器人 | @TGpm01bot';
const FIG24_NAME = '【简介】 3个月✈️会员10U';

// ================= [1] 写入：正文为空时也必须能落库 =================
section('[1] 入群线的反例必须能写进去（正文恒为空）');
{
	const env = await makeReadyEnv();
	// 入群 / 入群申请那一刻人还没发言，text 恒为空串 —— 这是引擎侧的事实，
	// 不是构造出来的极端值。旧实现只取 text，于是写入恒返回 0。
	const added = await W.addAdFalsePositive(env, '', {
		name: FIG24_NAME, username: '@guangyig888', bio: FIG24_BIO
	});
	assert('★ 正文为空但资料有内容 → 写入成功', added === 1, 'added=' + String(added));
	const rows = env.DB.query('SELECT value FROM ad_false_positives');
	assert('★ 资料确实进了反例池', rows.length === 1, JSON.stringify(rows));
	assert('★ 存的是资料里的可辨识内容（不是空串）',
		rows.length === 1 && String(rows[0].value).includes('会员'), JSON.stringify(rows));

	// 什么都没有的时候仍然拒绝写入 —— 空片段会把整个世界放进放行名单
	const none = await W.addAdFalsePositive(env, '', {});
	assert('全空输入仍拒绝写入', none === 0, 'added=' + String(none));
}

// ================= [2] 同一条内容回来必须命中 =================
section('[2] 判过误判的同一条内容回来必须被放过');
{
	const env = await makeReadyEnv();
	await W.addAdFalsePositive(env, '', { name: FIG24_NAME, username: '@guangyig888', bio: FIG24_BIO });
	// 同一条内容原样回来（入群线回放：text 仍然为空）
	const hit = await W.matchAdFalsePositive(env, {
		profile: { firstName: '【简介】 3个月✈️会员10U', lastName: '', username: '@guangyig888', bio: FIG24_BIO },
		text: ''
	});
	assert('★ bio 长于 30 字也命中（读写口径对齐）', !!hit, JSON.stringify(hit));
}

// ================= [3] 长 bio 的匹配不能只靠前 30 字 =================
section('[3] 长 bio 不只比对前 30 字');
{
	const env = await makeReadyEnv();
	// 这段 bio 的前 30 字完全相同，之后分叉：一条是知道内情的正常人，
	// 一条是广告。若实现只比前 30 字，ACG 那条也会被放过。
	const shared = '长期分享技术资料与工具使用方法，欢迎交流讨论，不接受广告';
	const normal = shared + '，这里只是个人简介不是推广。';
	const ad = shared + '，加我私聊 一手货源 日结秒结 微信联系。';
	await W.addAdFalsePositive(env, '', { name: '正常用户', bio: normal });
	const hitAd = await W.matchAdFalsePositive(env, {
		profile: { firstName: '正常用户', bio: ad }, text: ''
	});
	assert('★ 只有前 30 字相同、后段是广告 → 不得命中', hitAd === null, JSON.stringify(hitAd));
	const hitNormal = await W.matchAdFalsePositive(env, {
		profile: { firstName: '正常用户', bio: normal }, text: ''
	});
	assert('同一条正常内容原样回来 → 命中', !!hitNormal, JSON.stringify(hitNormal));
}

// ================= [4] 账号名单独出现不构成放行 =================
section('[4] 只靠昵称不能触发放行');
{
	const env = await makeReadyEnv();
	// 主人判过误判的样本里，昵称往往是很普通的两三个字（「清风」「大卫」）。
	// 如果把昵称算进匹配依据，一次 /ignore 会把所有叫「清风」的人一起放进白名单。
	await W.addAdFalsePositive(env, '', { name: '清风', bio: FIG24_BIO });
	const hit = await W.matchAdFalsePositive(env, {
		profile: { firstName: '清风', bio: '我喜欢爬山和摄影，周末常去郊区。' }, text: ''
	});
	assert('★ 昵称相同、bio 完全不同 → 不得命中', hit === null, JSON.stringify(hit));
}

// ================= [5] 归一化：空白与大小写差异不影响命中 =================
section('[5] 归一化口径');
{
	const env = await makeReadyEnv();
	await W.addAdFalsePositive(env, '', { bio: 'USDT 兑换  汇率优惠\n私信联系' });
	const hit = await W.matchAdFalsePositive(env, {
		profile: { bio: 'usdt 兑换 汇率优惠 私信联系' }, text: ''
	});
	assert('★ 大小写与连续空白不影响命中', !!hit, JSON.stringify(hit));
}

// ================= [6] 短片段仍然不入库 =================
section('[6] 有效信息不足的片段不入库');
{
	const env = await makeReadyEnv();
	const a = await W.addAdFalsePositive(env, '签到');
	assert('纯正文太短 → 不入库', a === 0, 'added=' + String(a));
	const b = await W.addAdFalsePositive(env, '', { name: '清风', bio: '' });
	assert('只有昵称没有简介 → 不入库（昵称不是可辨识内容）', b === 0, 'added=' + String(b));
}

// ================= [7] 幂等与容量 =================
section('[7] 幂等与容量');
{
	const env = await makeReadyEnv();
	const payload = { name: FIG24_NAME, bio: FIG24_BIO };
	await W.addAdFalsePositive(env, '', payload);
	await W.addAdFalsePositive(env, '', payload);
	assert('同一条重复写不新增行',
		env.DB.query('SELECT COUNT(*) AS c FROM ad_false_positives')[0].c === 1,
		JSON.stringify(env.DB.query('SELECT value FROM ad_false_positives')));

	const envLRU = await makeReadyEnv();
	// 常量是模块级 const，vm 沙箱里不会挂到全局对象 —— 从源码字面量读，
	// 断言的是「实现里确实有个上限且不小于 20」，不改实现命名也能测。
	const capMatch = src.match(/const AD_FALSE_POSITIVE_MAX = (\d+)/);
	const cap = capMatch ? Number(capMatch[1]) : NaN;
	assert('容量常量存在且 ≥ 20', Number(cap) >= 20, 'cap=' + String(cap));
	for (let i = 0; i < cap + 5; i++) await W.addAdFalsePositive(envLRU, '', { bio: '反例样本片段编号' + i + '号的简介内容' });
	const total = envLRU.DB.query('SELECT COUNT(*) AS c FROM ad_false_positives')[0].c;
	assert('★ 超过容量淘汰最旧的，总数等于上限', total === cap, 'count=' + total + ' cap=' + cap);
}

// ================= [8] 达线时反例优先级最高 =================
section('[8] 达线后命中反例 → 降级不封');
{
	const env = await makeReadyEnv({
		AI: { run: async () => ({ choices: [{ message: { content: JSON.stringify({ ad: true, confidence: 0.95, reason: '测试', features: [] }) } }] }) }
	});
	await W.addAdFalsePositive(env, '', { name: FIG24_NAME, bio: FIG24_BIO });
	const cfg = W.loadAdDetectionConfig({ AD_LLM_DAILY: '50' });
	const got = await W.applyAdLLMToEvaluation(env, { verdict: 'pass', score: 0, reasons: [] }, cfg, {
		profile: { firstName: FIG24_NAME, lastName: '', username: '@guangyig888', bio: FIG24_BIO },
		text: ''
	}, { pool: 'join' });
	assert('★ 命中反例 → observe 不封', got.verdict === 'observe', JSON.stringify(got.reasons).slice(0, 400));
	assert('★ 理由写明是主人判过的误判',
		(got.reasons || []).some((r) => String(r).includes('误判')), JSON.stringify(got.reasons).slice(0, 300));
}

// ================= [9] 反例池失效绝不能阻断判定 =================
section('[9] 反例池故障不影响判定主链路');
{
	const env = await makeReadyEnv();
	// 表被删掉 / D1 故障时，matchAdFalsePositive 必须返回 null 而不是抛异常
	env.DB.query('DROP TABLE ad_false_positives');
	let threw = null;
	let hit = 'unset';
	try {
		hit = await W.matchAdFalsePositive(env, { profile: { bio: FIG24_BIO }, text: '' });
	} catch (error) {
		threw = String(error?.message || error);
	}
	assert('★ 表不存在时不抛异常', threw === null, String(threw));
	assert('★ 表不存在时按未命中处理（放行由别的层兜）', hit === null, JSON.stringify(hit));
}

console.log(`\n========== 误判反例池：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
