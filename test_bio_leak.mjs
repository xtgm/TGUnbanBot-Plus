// bio 漏放回归测试：把 2026-10-05 主人截图里的 11 条真实广告样本固化下来，
// 断言判据不再放走，同时用对照组守住「不误封正常文案」。运行：node test_bio_leak.mjs
// 与 test_avatar.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_bio_leak.mjs

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
		const head = sql.trim().slice(0, 6).toUpperCase();
		if (head === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) {
			return { kind: 'rows', rows: st.all(...bound).map(normOut) };
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
		batch: async (stmts) => stmts.map((st) => st.run()),
		query(sql, ...params) { return db.prepare(sql).all(...params).map(normOut); }
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
function resetCalls() { calls.length = 0; setApi(); try { W.invalidateAdAdminCache(); } catch { /* W 未初始化 */ } }
function countCalls(method) { return calls.filter((c) => c.method === method).length; }

const FAKE_IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777000, is_bot: true, username: 'AvatarTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 6000 + calls.length } };
		case 'getChat': return { ok: true, result: { id: body?.chat_id, first_name: '未知', bio: '' } };
		case 'getChatMember': return { ok: true, result: { status: 'member', user: { id: body?.user_id } } };
		case 'getChatAdministrators': return { ok: true, result: [] };
		case 'getFile': return { ok: true, result: { file_id: body?.file_id, file_path: 'photos/file_1.jpg' } };
		default: return { ok: true, result: true };
	}
}

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const raw = String(url);
		// 图片下载地址不是 /method 形式，单独走 arrayBuffer 分支。
		const isFileDownload = raw.includes('/file/bot');
		const method = isFileDownload ? 'downloadFile' : raw.split('/').pop();
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
			async arrayBuffer() { return FAKE_IMAGE.buffer; }
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

function privateMessage(fromId, text) {
	return {
		message_id: 100 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000), text,
		chat: { id: fromId, type: 'private', first_name: 'Owner' },
		from: { id: fromId, is_bot: false, first_name: 'Owner' }
	};
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


const handler = W.__handler;
const bootEnv = makeEnv();
resetCalls();
await sendUpdate({ message: privateMessage(99999, 'hello') }, bootEnv);


const env = makeEnv();
await W.adDetectionReady(env);
const config = W.loadAdDetectionConfig(env);
const whitelist = await W.loadAdDomainWhitelist(env);

async function judge(profile, text) {
	return W.evaluateAdSuspect(env,
		{ profile: { status: '', ...profile }, text, quotedText: null, forwardChat: null },
		{ config, whitelist, skipMissingBioPenalty: false });
}

const EMPTY = { firstName: '', lastName: '', username: '', bio: '' };

section('[1] 图3 · 名片消息（4 条，主人截图原文）');
{
	// 改前：① ③ 是 ban，② ④ 得 0 分放行
	const cases = [
		['① 假币洗钱交流群🔥快递面交可都', '假币洗钱交流群🔥快递面交可都', 'ban'],
		['② 最新18系列上新 水果专卖店', '最新18系列上新 水果专卖店', 'ban'],
		['③ 一手假钞可过机可快递可面交', '一手假钞可过机可快递可面交', 'ban'],
		['④ 七折出17 pro max 看我简介', '七折出17 pro max 看我简介', 'ban']
	];
	for (const [label, text, expect] of cases) {
		const r = await judge(EMPTY, text);
		assert('名片' + label + ' → ' + expect, r.verdict === expect,
			'实际 ' + r.verdict + ' / ' + r.score + ' 分 :: ' + (r.reasons || []).join(' | ').slice(0, 140));
	}
}

section('[2] 图4/5 · Lisa Ka（正文 + 广告简介）');
{
	const lisa = { firstName: 'Lisa', lastName: 'Ka', username: 'UDNqsgVyAiRMKutofxDOZVMb',
		bio: 'https://t.me/cyy42Y4H2DgyZGNI 进群了解项目 一天8000!' };
	// 改前：三条全部 pass，其中「有广告简介」那条是 -1 分（比不查简介还低）
	const withBio = await judge(lisa, '微信帮我收款 赚一万');
	assert('Lisa 正文+广告简介 → 封禁（改前 -1 分放行）', withBio.verdict === 'ban',
		'实际 ' + withBio.verdict + ' / ' + withBio.score + ' 分');
	const joinOnly = await judge(lisa, '');
	assert('Lisa 入群纯简介（正文空）→ 封禁（改前 -1 分放行）', joinOnly.verdict === 'ban',
		'实际 ' + joinOnly.verdict + ' / ' + joinOnly.score + ' 分');
	const gateOne = await judge({ ...lisa, bio: '' }, '微信帮我收款 赚一万');
	assert('Lisa 闸一口径（未查简介）→ 至少进观察（改前 0 分 pass）',
		gateOne.verdict === 'observe' || gateOne.verdict === 'ban',
		'实际 ' + gateOne.verdict + ' / ' + gateOne.score + ' 分');
	assert('豁免词没把广告简介压成负分', withBio.score >= 0,
		'得分 ' + withBio.score + ' :: ' + (withBio.reasons || []).join(' | ').slice(0, 120));
	assert('豁免失效有可观测记录（主人复核能看懂）',
		withBio.reasons.some((r) => r.includes('广告语境') && r.includes('豁免')),
		JSON.stringify(withBio.reasons));
}

section('[3] 变体（主人原话：收款 / 赚多少这类特别多）');
{
	const variants = [
		['收款变体', '微信帮我收款 赚一万'],
		['带单变体', '带单老师带你赚5万'],
		['一单变体', '收款码发我 一单800'],
		['纯简介代理', '招代理 一天5000 加V详聊']
	];
	for (const [label, text] of variants) {
		// bio 单独测：代理那条是简介，前三条是正文
		const isBio = label === '纯简介代理';
		const r = await judge(isBio ? { ...EMPTY, bio: text } : EMPTY, isBio ? '' : text);
		// 要求：至少进观察线（改前 4 条全是 0/-1 分 pass）
		const handled = r.verdict === 'observe' || r.verdict === 'ban';
		assert('变体 · ' + label + ' → 有处置（改前 pass）', handled,
			'实际 ' + r.verdict + ' / ' + r.score + ' 分 :: ' + (r.reasons || []).join(' | ').slice(0, 130));
	}
}

section('[4] 既有封禁正样本 · 私有链接进群即封（不得被本轮改动放过）');
{
	// 依据 test_ad_detection 既有断言「端到端 · 纯私有链接进群即封」：
	// 资料卡含 t.me/+ 一次性邀请码、且【没有技术豁免词撑着】时就是封。
	// 加这条是为了守反向 —— 本轮把豁免改成了条件化，不能顺手把这类也放走。
	const r = await judge({ firstName: '小美', lastName: '', username: '', bio: '读书会成员进群 t.me/+abcdefghij' }, '');
	assert('纯私有链接 + 无豁免词 → 仍封禁', r.verdict === 'ban',
		'实际 ' + r.verdict + ' / ' + r.score + ' 分 :: ' + (r.reasons || []).join(' | ').slice(0, 130));
}

section('[4] 对照组 · 正常文案必须照旧放行（防误封）');
{
	const normals = [
		['技术群主简介（cdn 撑豁免）', { firstName: '老王', lastName: '', username: '', bio: 'CDN 技术交流，进群 t.me/+abcdefghij' }, '', 'pass'],
		['日常聊天', EMPTY, '大家好啊 今天天气不错', 'pass'],
		['无金额的闲聊', EMPTY, '在吗', 'pass'],
		['商店上新但无招揽', EMPTY, '我们店上新了', 'pass'],
		['自用设备', EMPTY, '我买了 pro max', 'pass'],
		['技术回收讨论', { firstName: '', lastName: '', username: '@laowang', bio: '搞代理的' }, '我这台机器回收了老硬盘 分红给你算了', 'pass'],
		['私聊联系方式', { firstName: '', lastName: '', username: '', bio: '私信请走频道 https://t.me/joeychat001' }, '要 beta 版才能用', 'pass']
	];
	for (const [label, profile, text, expect] of normals) {
		const r = await judge(profile, text);
		assert('对照 · ' + label + ' → 放行', r.verdict === expect,
			'实际 ' + r.verdict + ' / ' + r.score + ' 分 :: ' + (r.reasons || []).join(' | ').slice(0, 130));
	}
}

console.log(`\n===== bio 漏放回归测试：通过 ${pass} / 失败 ${fail} =====`);
if (fail > 0) {
	console.log('失败项：');
	for (const name of failures) console.log('  - ' + name);
	process.exit(1);
}
