// 名片广告检测离线测试 —— 2026-10-11 主人两条线上样本 + 三层方案的回归锁。
// 范式同其余测试：vm 加载 _worker.js、Telegram API 全 mock、D1 用 node:sqlite。
// 运行：node test_ad_contact.mjs
//
// 【缺口本体】两条名片广告离线实测：
//   Rachel「新澳 🔥 六合彩内幕发布群」        → 四张词表【零命中】，净 0 分
//   Amani「🔥 代开增值税发票 另高价收发票粉 🔥」→ 只有「高价收」命中交易动词 →
//   单类词不计分，净 3 分（首尾对称 emoji）
// 两条都被别的机器人删掉了，本项目一条都没反应。链路本身是通的（显示名早在
// getAdDetectionBodyText 与闸一的 text || contactName 里接好），缺的是定罪形态。

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', '_worker.js'), 'utf8');

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

let pass = 0, fail = 0;
const failures = [];
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

const calls = [];
let apiHandlers = {};
function setApi(next = {}) { apiHandlers = next; }
function resetCalls() { calls.length = 0; setApi(); }
function countCalls(m) { return calls.filter((c) => c.method === m).length; }
function callsOf(m) { return calls.filter((c) => c.method === m); }

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777000, is_bot: true, username: 'ContactTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 9000 + calls.length, chat: { id: body?.chat_id }, text: body?.text ?? '' } };
		case 'deleteMessage': return { ok: true, result: true };
		case 'getChat': return { ok: true, result: { id: body?.chat_id, first_name: '未知', bio: '', username: '' } };
		case 'getChatMember': return { ok: true, result: { status: 'member', user: { id: body?.user_id } } };
		case 'getChatAdministrators': return { ok: true, result: [] };
		default: return { ok: true, result: true };
	}
}

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout, Promise,
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
const handler = W.__handler;
const GROUP_ID = '-1001883549197';
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
async function flush() {
	for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 5)); await Promise.all(pendingWaits); }
}
function privateMessage(fromId, text) {
	return {
		message_id: 100 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000), text,
		chat: { id: fromId, type: 'private', first_name: 'Owner' },
		from: { id: fromId, is_bot: false, first_name: 'Owner' }
	};
}

// ===== 主人 2026-10-11 截图里的两条真实名片 =====
const RACHEL = { first_name: '新澳 🔥 六合彩内幕发布群', phone_number: '+1 667 701 4838' };
const AMANI = { first_name: '🔥 代开增值税发票 另高价收发票粉 🔥', phone_number: '+1 213 869 5633' };
// 正常名片对照组：人名 + 号码
const NORMAL = { first_name: '张三', phone_number: '+86 138 0013 8000' };

function contactMessage(contact, extra = {}) {
	return {
		message_id: 900 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000),
		chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
		from: { id: 555001, is_bot: false, first_name: 'x' },
		contact: { user_id: 555001, ...contact },
		...extra
	};
}

const env = makeEnv();
resetCalls();
await sendUpdate({ message: privateMessage(99999, 'hello') }, env);
await flush();

// ================= [1] 判据本体 =================
section('[1] applyContactCardVerdict');
{
	const base = { verdict: 'pass', score: 0, reasons: [], layer: 'score' };

	for (const [label, contact] of [['Rachel 六合彩', RACHEL], ['Amani 发票', AMANI]]) {
		const got = W.applyContactCardVerdict(base, contactMessage(contact));
		assert(label + ' → 定罪', got.verdict === 'ban', JSON.stringify(got.reasons));
		assert(label + ' → layer 标成 contact', got.layer === 'contact', got.layer);
		assert(label + ' → 理由写明命中词', got.reasons.some(r => r.includes('名片广告定罪')), got.reasons.join(' / '));
	}

	const normal = W.applyContactCardVerdict(base, contactMessage(NORMAL));
	assert('人名名片 → 原样放行（反向断言）', normal.verdict === 'pass' && normal.layer === 'score', JSON.stringify(normal));

	const noPhone = W.applyContactCardVerdict(base, contactMessage({ first_name: '新澳 🔥 六合彩内幕发布群' }));
	assert('名片没带手机号 → 不走这条通道', noPhone.verdict === 'pass', JSON.stringify(noPhone));

	const noWord = W.applyContactCardVerdict(base, contactMessage({ first_name: '小美生活日常', phone_number: '+8613800138000' }));
	assert('非人名但一个词都没命中 → 不封（三重门槛缺一不可）', noWord.verdict === 'pass', JSON.stringify(noWord));

	const already = W.applyContactCardVerdict({ verdict: 'ban', score: 9, reasons: ['指纹库命中'], layer: 'fingerprint' }, contactMessage(RACHEL));
	assert('前面某层已定罪 → 不改写 layer 与理由',
		already.layer === 'fingerprint' && already.reasons.length === 1, JSON.stringify(already));

	assert('非名片消息 → 原样返回', W.applyContactCardVerdict(base, { text: '普通文本' }) === base);
	assert('纯文本里写着招揽词也不走名片通道', W.applyContactCardVerdict(base, { text: '代开发票 高价收' }).verdict === 'pass');
}

// ================= [2] 号码归一化 =================
section('[2] normalizeAdPhoneNumber');
{
	assert('+号与空格被剥掉', W.normalizeAdPhoneNumber('+1 667 701 4838') === '16677014838', W.normalizeAdPhoneNumber('+1 667 701 4838'));
	assert('连字符写法归一到同一个号', W.normalizeAdPhoneNumber('1-667-701-4838') === '16677014838');
	assert('国内号保留', W.normalizeAdPhoneNumber('+86 138 0013 8000') === '8613800138000');
	assert('位数太少 → 空串（不是电话）', W.normalizeAdPhoneNumber('12345') === '');
	assert('位数太多 → 空串（E.164 上限 15）', W.normalizeAdPhoneNumber('1234567890123456') === '');
	assert('空值 → 空串', W.normalizeAdPhoneNumber('') === '' && W.normalizeAdPhoneNumber(null) === '');
}

// ================= [3] 三条真实链路（端到端） =================
section('[3] 端到端：名片消息真的会被处置');
{
	const env3 = makeEnv();
	const banned = [];
	setApi({
		banChatMember: (body) => { banned.push(String(body?.user_id)); return { payload: { ok: true, result: true } }; }
	});
	await sendUpdate({ message: contactMessage(RACHEL, {
		from: { id: 555001, is_bot: false, first_name: 'x', last_name: '' }
	}) }, env3);
	await flush();
	assert('Rachel 名片 → 真的禁言了', banned.includes('555001'), JSON.stringify(banned));
	assert('禁言发生在配置群里', calls.some(c => c.method === 'banChatMember' && String(c.body?.chat_id) === GROUP_ID));

	banned.length = 0;
	// 【resetCalls 会把 apiHandlers 一起清掉】不清回来的话后面两次调用走默认 payload，
	// banned 永远是空的 —— 断言会假失败，看起来像功能没生效。
	resetCalls();
	setApi({
		banChatMember: (body) => { banned.push(String(body?.user_id)); return { payload: { ok: true, result: true } }; }
	});
	await sendUpdate({ message: contactMessage(AMANI, {
		from: { id: 555002, is_bot: false, first_name: 'x', last_name: '' }
	}) }, env3);
	await flush();
	assert('Amani 名片 → 真的禁言了', banned.includes('555002'), JSON.stringify(banned));

	banned.length = 0;
	resetCalls();
	setApi({
		banChatMember: (body) => { banned.push(String(body?.user_id)); return { payload: { ok: true, result: true } }; }
	});
	await sendUpdate({ message: contactMessage(NORMAL, {
		from: { id: 555003, is_bot: false, first_name: '张三', last_name: '' }
	}) }, env3);
	await flush();
	assert('正常人名片 → 一个处置都不做（反向断言）', banned.length === 0 && countCalls('banChatMember') === 0,
		JSON.stringify(banned));
}

// ================= [4] 手机号指纹：定罪即入库、复现即杀 =================
section('[4] 手机号指纹');
{
	const phone = W.normalizeAdPhoneNumber(RACHEL.phone_number);
	const payload = { name: RACHEL.first_name, username: '', bio: '', text: '', domains: [], phone };
	const cands = W.extractAdFingerprintCandidates(payload, new Set());
	const phoneCand = cands.find(c => c.type === 'phone');
	assert('定罪时手机号会被抽成指纹候选', !!phoneCand, JSON.stringify(cands));
	assert('抽取值已归一成纯数字', phoneCand?.value === phone, phoneCand?.value);
	assert('权重给满 1（与 domain / username 同级）', Number(phoneCand?.weight) === 1, String(phoneCand?.weight));

	const normalCands = W.extractAdFingerprintCandidates(
		{ name: '张三', username: '', bio: '', text: '', domains: [], phone: '' }, new Set());
	assert('没有名片的载荷不产生 phone 候选（零开销）',
		!normalCands.some(c => c.type === 'phone'), JSON.stringify(normalCands));

	// 指纹匹配：同号复现 → 命中；换个号 → 不命中。
	// 【matchAdFingerprints 的第一个参数是 env 不是指纹数组】它自己去库里 loadAdFingerprints，
	// 所以要先建表、把指纹插进 D1，再调用 —— 传数组会静默返回空命中，测试全绿却什么都没验。
	await W.adDetectionReady(env);
	await env.DB.prepare(
		'INSERT INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_by, created_at, updated_at)'
		+ ' VALUES (?, ?, ?, ?, 1, 0, 1, ?, ?, ?, ?)')
		.bind('phone:' + phone, 'phone', phone, 1, 'test', 'test', 0, 0).run();
	const fpCfg = W.loadAdDetectionConfig(env);
	const same = await W.matchAdFingerprints(env, payload, { config: fpCfg });
	assert('同号复现 → 指纹命中', same.hits.length === 1, JSON.stringify(same));
	const other = await W.matchAdFingerprints(env,
		{ name: '别的名片', username: '', bio: '', text: '', domains: [], phone: '15550001111' },
		{ config: fpCfg });
	assert('换号 → 不命中（主键匹配不是子串匹配）', other.hits.length === 0, JSON.stringify(other));
	const noCard = await W.matchAdFingerprints(env,
		{ name: '正文用户', username: '', bio: '', text: '收购账号 日结', domains: [] },
		{ config: fpCfg });
	assert('没有名片消息时该分支完全不参与（正文里贴号码也不会命中）', noCard.hits.length === 0, JSON.stringify(noCard));
}

console.log('\n========================================');
console.log(`===== 名片检测测试：通过 ${pass} / 失败 ${fail} =====`);
if (fail) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
process.exit(0);
