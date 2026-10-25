// D1 失败日志必须带 error.message —— 反证测试。
//
// 【为什么需要这个断言】线上 console.error('前缀', error) 在 Cloudflare 日志里
// 只留下调用栈，error.message 被丢弃，于是根因永远拿不到：
//   [广告检测] 添加语义样本失败:     at D1DatabaseSessionAlwaysPrimary._sendOrThrow ...
// 冒号后面直接是栈，没有任何 D1 错误描述。改完之后这行必须出现 message=xxx。
//
// 运行：node test_d1_error_log.mjs
// 改动【之前】跑：第 1、2 条应 FAIL（证明断言有鉴别力）
// 改动【之后】跑：全部 OK

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// D1 mock：SELECT 返回 null（不重复）、**只有目标表的 INSERT** 抛错（复现线上故障）、
// 其余 SQL（建表 / schema_meta / 其它表）一律正常 —— 否则 adDetectionReady 会先失败，
// 根本走不到 addAdSample 的 INSERT（首跑就是栽在这里）。
const TARGET_INSERT_RE = /INSERT\s+INTO\s+(ad_sample_embeddings|stat_actions)/i;
// d1CoreTablesExist 走 PRAGMA table_info(blacklist) 找 note 列、d1TableExists 走
// sqlite_master 找表名 —— 这两个探测必须放行，否则 adDetectionReady 先失败，
// 根本走不到目标 INSERT（首跑栽在这里：mock 让 schema 探测也全空）。
const SCHEMA_PROBE_PRAGMA = /PRAGMA\s+table_info/i;
const SCHEMA_PROBE_SQLITE_MASTER = /sqlite_master/i;
const COMMON_COLUMNS = [
	'id', 'name', 'note', 'chat_id', 'user_id', 'text_hash', 'sample_text', 'embedding',
	'dimension', 'source', 'created_at', 'day', 'kind', 'cnt', 'updated_at', 'type',
	'value', 'expires_at', 'fp', 'done', 'learned', 'sample', 'verdict', 'payload'
];

function makeFailingD1() {
	const exec = (sql) => {
		const isTargetInsert = TARGET_INSERT_RE.test(String(sql));
		const okRun = async () => ({ results: [{ success: true, meta: { changes: 1 } }], success: true });
		const stmt = {
			bind: (...args) => ({
				first: async () => {
					if (SCHEMA_PROBE_SQLITE_MASTER.test(String(sql))) return { name: args[0] };
					return null;
				},
				all: async () => {
					if (SCHEMA_PROBE_PRAGMA.test(String(sql))) return { results: COMMON_COLUMNS.map((name) => ({ name })), success: true };
					return { results: [], success: true };
				},
				run: async () => {
					if (isTargetInsert) {
						const err = new Error('D1_诊断模拟故障：写入被拒');
						err.name = 'Error';
						throw err;
					}
					return okRun();
				}
			}),
			first: async () => null,
			all: async () => {
				if (SCHEMA_PROBE_PRAGMA.test(String(sql))) return { results: COMMON_COLUMNS.map((name) => ({ name })), success: true };
				return { results: [], success: true };
			},
			run: async () => {
				if (isTargetInsert) throw new Error('D1_诊断模拟故障：写入被拒');
				return okRun();
			}
		};
		return stmt;
	};
	return {
		prepare: (sql) => exec(sql),
		exec: async () => ({ results: [], success: true }),
		batch: async (stmts) => Promise.all(stmts.map((s) => (s.run ? s.run() : s))),
		query: () => []
	};
}

// 捕获 console.error 的全部输出
const errorLogs = [];
const fakeConsole = {
	...console,
	error: (...args) => { errorLogs.push(args.map((a) => String(a)).join(' ')); },
	log: (...args) => { errorLogs.push('[log] ' + args.map((a) => String(a)).join(' ')); }
};

const sandbox = {
	console: fakeConsole, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async () => ({ ok: true, status: 200, async json() { return { ok: true, result: true }; }, async text() { return '{}'; }, async arrayBuffer() { return new ArrayBuffer(0); } })
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });

let pass = 0, fail = 0;
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 400) : ''}`); }
}

// 核心内容 ≥ 6 字，过 adSemanticCoreLength 闸门
const AD_TEXT = '加我微信详谈长期收米一天九千有需要的私聊';

async function main() {
	const addAdSample = sandbox.addAdSample;
	assert('addAdSample 可从 vm 上下文取到', typeof addAdSample === 'function', typeof addAdSample);
	if (typeof addAdSample !== 'function') {
		console.log(`\n=== 总计 ${pass + fail}：通过 ${pass} 失败 ${fail} ===`);
		process.exit(1);
	}

	const env = { DB: makeFailingD1() };
	errorLogs.length = 0;
	const r = await addAdSample(env, AD_TEXT, { source: 'manual' });

	// [1] 确实走到了 INSERT 并失败（否则后面两条断言没意义）
	assert('INSERT 被触发并返回 reason=error', r?.ok === false && r?.reason === 'error', JSON.stringify(r));
	assert('失败时打了日志', errorLogs.length > 0, '一条日志都没有');

	const joined = errorLogs.join('\n');
	// [3] 核心断言：日志里必须出现 message= —— 这是拿得到 D1 真实错误的唯一途径
	assert('日志包含 message= 字段', /message=/.test(joined), '日志原文: ' + joined.slice(0, 400));
	// [4] message 里要真的带出错误内容，不是空的
	assert('message 字段非空', /message=\s*\S/.test(joined), '日志原文: ' + joined.slice(0, 400));

	console.log('\n--- 捕获到的日志 ---');
	errorLogs.forEach((l) => console.log('  ' + l.slice(0, 300)));
	console.log(`\n=== 总计 ${pass + fail}：通过 ${pass} 失败 ${fail} ===`);
	process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
