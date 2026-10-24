// 黑名单自动拦截通知：同一人不刷屏 + 失败原因中文化（2026-10-24 主人定的口径）
// 覆盖:
//   - 同一人 × 同一群 × 同一结果：只通知第一次，之后永久不再发（直到结果变化）
//   - 结果变化（失败 → 成功、成功 → 失败）立刻再通知一次，并带上期间压下的次数
//   - 不同群各自去重（同一人换个群被拦截，照常通知）
//   - 「群内手动解封拦截」不去重，每次都发
//   - 失败原因只显示中文 + 建议，不出现 Telegram 英文原文
//   - D1 读写失败时照发（宁可多发，不能把失败静默）
// D1 用 node:sqlite 内存库模拟，跑的是真实 SQL（UPSERT / RETURNING），不是手写桩。

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
	let depth = 0;
	let i = braceStart;
	for (; i < source.length; i++) {
		if (source[i] === '{') depth++;
		else if (source[i] === '}') {
			depth--;
			if (depth === 0) { i++; break; }
		}
	}
	if (source[i] === ';') i++;
	return source.slice(0, start) + 'globalThis.__handler = ' + source.slice(start + 'export default'.length, i) + ';' + source.slice(i);
}

const apiCalls = [];
const sandbox = {
	console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const method = String(url).split('/').pop();
		const body = init && init.body ? JSON.parse(init.body) : null;
		apiCalls.push({ method, body });
		if (method === 'getChat') return { ok: true, status: 200, async json() { return { ok: true, result: { id: body.chat_id, title: '示例群', type: 'supergroup' } }; } };
		return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 1 } }; } };
	},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });
const handler = sandbox.__handler;

// node:sqlite 包成 D1 接口（prepare/bind/first/run/all/exec/batch）
function makeSqliteD1(options = {}) {
	const db = new DatabaseSync(':memory:');
	const wrap = (sql) => {
		let args = [];
		const stmt = {
			bind(...a) { args = a; return stmt; },
			async first() { if (options.fail) throw new Error('D1_ERROR: forced'); const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
			async run() { if (options.fail) throw new Error('D1_ERROR: forced'); const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
			async all() { if (options.fail) throw new Error('D1_ERROR: forced'); return { results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }; },
		};
		return stmt;
	};
	return {
		_db: db,
		prepare: wrap,
		async exec(sql) { if (options.fail) throw new Error('D1_ERROR: forced'); db.exec(sql); },
		async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.all()); return out; },
	};
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
	if (cond) { pass++; process.stdout.write(`  ✅ ${name}\n`); }
	else { fail++; process.stdout.write(`  ❌ ${name}${detail ? ' — ' + detail : ''}\n`); }
}

const fn = sandbox.notifyOwnerBlacklistIntercept;
const env = { TOKEN: 'tok', BOT_TOKEN: '0:fake', GROUP_ID: '-1001,-1002', OWNER_IDS: '999' };

async function setup(db) {
	// 走一次真实请求，让 getConfig/applyRuntimeConfig 把 OWNER_IDS 等装进运行时
	await handler.fetch(new Request('https://x.com/healthz-not-exist'), { ...env, DB: db });
}

const user = { id: 1111111111, first_name: '测试用户A' };
const chatA = { id: -1001, type: 'supergroup' };
const chatB = { id: -1002, type: 'supergroup' };
const entry = { entry: { id: '1111111111', reason: 'spam', by: 'system', at: '2026-10-20T08:00:00Z' } };
const fail400 = { ok: false, error: 'Bad Request: not enough rights to restrict chat member' };
const okResult = { ok: true };
const ownerDms = () => apiCalls.filter((c) => c.method === 'sendMessage' && String(c.body.chat_id) === '999');

process.stdout.write('\n[1] 同一人同一群同一结果：只通知一次\n');
{
	const db = makeSqliteD1();
	await setup(db);
	const e = { ...env, DB: db };
	apiCalls.length = 0;
	for (let i = 0; i < 3; i++) await fn(user, chatA, '发言拦截', entry, fail400, e);
	assert('连续 3 次处置失败只发 1 条', ownerDms().length === 1, `实际 ${ownerDms().length}`);
	apiCalls.length = 0;
	for (let i = 0; i < 3; i++) await fn(user, chatA, '发言拦截', entry, okResult, e);
	assert('失败 → 成功：结果变化再发 1 条', ownerDms().length === 1, `实际 ${ownerDms().length}`);
	assert('结果变化那条带上期间压下的次数（失败又拦了 2 次）', ownerDms()[0]?.body.text.includes('2 次'), ownerDms()[0]?.body.text);
	apiCalls.length = 0;
	for (let i = 0; i < 5; i++) await fn(user, chatA, '复入群拦截', entry, okResult, e);
	assert('同为成功：发言拦截与复入群拦截合并去重，不再发', ownerDms().length === 0, `实际 ${ownerDms().length}`);
	apiCalls.length = 0;
	await fn(user, chatA, '发言拦截', entry, fail400, e);
	assert('成功 → 失败：再发 1 条', ownerDms().length === 1, `实际 ${ownerDms().length}`);
	assert('成功期间压下 7 次（成功 2 + 复入 5）写进通知', ownerDms()[0]?.body.text.includes('7 次'), ownerDms()[0]?.body.text);
}

process.stdout.write('\n[2] 不同群各自去重\n');
{
	const db = makeSqliteD1();
	await setup(db);
	const e = { ...env, DB: db };
	apiCalls.length = 0;
	await fn(user, chatA, '发言拦截', entry, fail400, e);
	await fn(user, chatB, '发言拦截', entry, fail400, e);
	await fn(user, chatB, '发言拦截', entry, fail400, e);
	assert('A 群 1 条 + B 群 1 条 = 2 条', ownerDms().length === 2, `实际 ${ownerDms().length}`);
	const other = { id: 2222222222, first_name: '测试用户B' };
	apiCalls.length = 0;
	await fn(other, chatA, '发言拦截', entry, fail400, e);
	assert('换一个人照常通知', ownerDms().length === 1, `实际 ${ownerDms().length}`);
}

process.stdout.write('\n[3] 群内手动解封拦截不去重\n');
{
	const db = makeSqliteD1();
	await setup(db);
	const e = { ...env, DB: db };
	apiCalls.length = 0;
	for (let i = 0; i < 3; i++) await fn(user, chatA, '群内手动解封拦截', entry, okResult, e);
	await fn(user, chatA, '群内手动解封拦截（杀手黑名单）', entry, okResult, e);
	assert('手动解封拦截 4 次全部通知', ownerDms().length === 4, `实际 ${ownerDms().length}`);
}

process.stdout.write('\n[4] 失败原因中文化\n');
{
	const db = makeSqliteD1();
	await setup(db);
	apiCalls.length = 0;
	await fn(user, chatA, '发言拦截', entry, fail400, { ...env, DB: db });
	const t = ownerDms()[0]?.body.text || '';
	assert('写明处置失败', t.includes('处置结果:失败'), t);
	assert('原因是中文「bot 权限不足」', t.includes('bot 权限不足'), t);
	assert('附带中文建议', t.includes('建议') && t.includes('封禁用户'), t);
	assert('不出现 Telegram 英文原文', !/not enough rights|Bad Request/i.test(t), t);
}

process.stdout.write('\n[5] D1 不可用时照发\n');
{
	const db = makeSqliteD1({ fail: true });
	apiCalls.length = 0;
	await fn(user, chatA, '发言拦截', entry, fail400, { ...env, DB: db });
	await fn(user, chatA, '发言拦截', entry, fail400, { ...env, DB: db });
	assert('去重表读写失败：两次都发（不静默）', ownerDms().length === 2, `实际 ${ownerDms().length}`);
}

process.stdout.write(`\n=== 总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail} ===\n`);
process.exit(fail ? 1 : 0);
