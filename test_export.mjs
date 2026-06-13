// /{TOKEN}/export 端到端离线测试
// 直接 import _worker.js 的 default fetch handler，用伪 D1 驱动

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '_worker.js'), 'utf8');

// vm 加载，把 default export 提取出来
function stripExportDefault(source) {
	const start = source.indexOf('export default');
	const braceStart = source.indexOf('{', start);
	let depth = 0;
	let i = braceStart;
	for (; i < source.length; i++) {
		const ch = source[i];
		if (ch === '{') depth += 1;
		else if (ch === '}') {
			depth -= 1;
			if (depth === 0) { i += 1; break; }
		}
	}
	if (source[i] === ';') i += 1;
	const replaced = source.slice(0, start) + 'globalThis.__handler = ' + source.slice(start + 'export default'.length, i) + ';' + source.slice(i);
	return replaced;
}
const stripped = stripExportDefault(src);

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripped, sandbox, { filename: '_worker.js' });

const handler = sandbox.__handler;

// ---------- 伪 D1 ----------
function makeFakeDB(seed = []) {
	const rows = new Map(seed.map((r) => [r.id, { ...r }]));
	return {
		_rows: rows,
		exec: async () => {},
		prepare(sql) {
			let bound = [];
			return {
				bind(...args) { bound = args; return this; },
				async first() {
					if (sql.startsWith('SELECT id FROM blacklist WHERE id = ?')) {
						const id = bound[0];
						return rows.has(id) ? { id } : null;
					}
					return null;
				},
				async run() { return { meta: { changes: 0 } }; },
				async all() {
					const results = [...rows.values()].map((r) => ({
						id: String(r.id),
						reason: r.reason ?? null,
						by_user: r.by ?? r.by_user ?? null,
						at: r.at ?? null
					}));
					results.sort((a, b) => String(a.at).localeCompare(String(b.at)));
					return { results };
				}
			};
		}
	};
}

const TOKEN = 'TESTTOKEN';
const baseEnv = {
	TOKEN,
	BOT_TOKEN: '0:fake',
	GROUP_ID: '-100123'
};

// ---------- 测试工具 ----------
let pass = 0, fail = 0;
function assert(name, cond, detail) {
	if (cond) { pass += 1; console.log(`  ✅ ${name}`); }
	else { fail += 1; console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`); }
}

const seed = [
	{ id: '1001', reason: 'spam', by: '999', at: '2026-05-22T10:00:00.000Z' },
	{ id: '1002', reason: 'manual', by: '999', at: '2026-05-23T11:00:00.000Z' },
	{ id: '1003', reason: 'manual_ban', by: '888', at: '2026-05-24T12:00:00.000Z' }
];

async function call(p, env) {
	const url = `https://example.workers.dev${p}`;
	return await handler.fetch(new Request(url), env);
}

// ---------- [1] 默认 HTML 视图（D1 后端） ----------
console.log('\n[1] HTML 视图 - D1 后端');
{
	const env = { ...baseEnv, DB: makeFakeDB(seed) };
	const res = await call(`/${TOKEN}/export`, env);
	assert('200 状态码', res.status === 200);
	assert('Content-Type 是 HTML', res.headers.get('Content-Type').includes('text/html'));
	const body = await res.text();
	assert('含 1001', body.includes('1001'));
	assert('含 1002', body.includes('1002'));
	assert('含 1003', body.includes('1003'));
	assert('含总计 3', body.includes('总计：<b>3</b>'));
	assert('含数据源 D1', body.includes('数据源：D1（权威）'));
	assert('含网页查看按钮', body.includes('网页查看'));
	assert('含下载 JSON 按钮', body.includes('下载 JSON'));
	assert('含下载 CSV 按钮', body.includes('下载 CSV'));
	assert('含搜索框', body.includes('id="q"'));
}

// ---------- [2] HTML 视图（空 D1） ----------
console.log('\n[2] HTML 视图 - 空 D1');
{
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	const res = await call(`/${TOKEN}/export`, env);
	const body = await res.text();
	assert('数据源显示 D1（权威）', body.includes('数据源：D1（权威）'));
	assert('总计 0', body.includes('总计：<b>0</b>'));
	assert('显示空提示', body.includes('黑名单为空'));
}

// ---------- [3] JSON 下载 ----------
console.log('\n[3] JSON 下载');
{
	const env = { ...baseEnv, DB: makeFakeDB(seed) };
	const res = await call(`/${TOKEN}/export?format=json`, env);
	assert('200', res.status === 200);
	assert('Content-Type 是 JSON', res.headers.get('Content-Type').includes('application/json'));
	const cd = res.headers.get('Content-Disposition') || '';
	assert('Content-Disposition 是 attachment', cd.includes('attachment'));
	assert('文件名带 blacklist 前缀', cd.includes('blacklist-'));
	assert('文件名 .json 后缀', cd.includes('.json'));
	const json = JSON.parse(await res.text());
	assert('JSON 数组长度 3', json.length === 3);
	assert('时间倒序：第一条是 1003', json[0].id === '1003');
	assert('reason 字段保留', json[0].reason === 'manual_ban');
}

// ---------- [4] CSV 下载 ----------
console.log('\n[4] CSV 下载');
{
	const env = { ...baseEnv, DB: makeFakeDB(seed) };
	const res = await call(`/${TOKEN}/export?format=csv`, env);
	assert('200', res.status === 200);
	assert('Content-Type 是 CSV', res.headers.get('Content-Type').includes('text/csv'));
	const buf = new Uint8Array(await res.clone().arrayBuffer());
	assert(
		'含 UTF-8 BOM（字节 EF BB BF）',
		buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF,
		`实际首三字节 = ${buf[0]?.toString(16)} ${buf[1]?.toString(16)} ${buf[2]?.toString(16)}`
	);
	const body = await res.text();
	assert('含表头', body.includes('id,reason,by,at'));
	assert('含 1001', body.includes('1001'));
	assert('含 1003', body.includes('1003'));
	const lines = body.split('\r\n');
	assert('行数 = 4（表头 + 3 条）', lines.length === 4);
}

// ---------- [5] CSV 字段含特殊字符的转义 ----------
console.log('\n[5] CSV 字段转义（含逗号 / 引号 / 换行）');
{
	const tricky = [{ id: '2000', reason: 'has,comma', by: 'has"quote', at: 'line1\nline2' }];
	const env = { ...baseEnv, DB: makeFakeDB(tricky) };
	const res = await call(`/${TOKEN}/export?format=csv`, env);
	const body = (await res.text());
	assert('逗号字段加引号', body.includes('"has,comma"'));
	assert('双引号被转义', body.includes('"has""quote"'));
	assert('换行字段加引号', body.includes('"line1\nline2"'));
}

// ---------- [6] 空黑名单 ----------
console.log('\n[6] 空黑名单');
{
	const env = { ...baseEnv, DB: makeFakeDB([]) };
	const res = await call(`/${TOKEN}/export`, env);
	const body = await res.text();
	assert('总计 0', body.includes('总计：<b>0</b>'));
	assert('显示空提示', body.includes('黑名单为空'));
	assert('不渲染表格 tbody', !body.includes('<tbody id="tb">'));
}

// ---------- [7] 错误的 TOKEN ----------
console.log('\n[7] 错误 TOKEN');
{
	const env = { ...baseEnv, DB: makeFakeDB(seed) };
	const res = await call('/WRONG_TOKEN/export', env);
	assert('返回 405（路由不匹配）', res.status === 405);
}

// ---------- [8] 无存储后端 ----------
console.log('\n[8] 无存储后端');
{
	const env = { ...baseEnv };
	const res = await call(`/${TOKEN}/export`, env);
	assert('400', res.status === 400);
	const body = await res.text();
	assert('消息含未绑定', body.includes('未绑定'));
}

// ---------- [9] HTML 注入防护 ----------
console.log('\n[9] HTML 注入防护');
{
	const evil = [{ id: '<img src=x onerror=alert(1)>', reason: '<script>', by: '"><svg>', at: '2026-01-01T00:00:00Z' }];
	const env = { ...baseEnv, DB: makeFakeDB(evil) };
	const res = await call(`/${TOKEN}/export`, env);
	const body = await res.text();
	assert('id 被转义（无 <img）', !body.includes('<img src=x'));
	assert('reason 被转义（无原始 <script>）', body.includes('&lt;script&gt;'));
	assert('by 被转义', body.includes('&quot;&gt;&lt;svg&gt;') || body.includes('&#34;&gt;&lt;svg&gt;') || body.includes('"><svg>') === false);
}

// ---------- 总结 ----------
console.log(`\n=== 总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
