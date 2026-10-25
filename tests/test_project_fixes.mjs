// 五项整改的反证测试 —— 断言必须先红后绿。
//
// 运行：node test_project_fixes.mjs
// 改动【之前】跑：[1][2][4] 应 FAIL（行为断言），[3][5] 应 FAIL（源码断言）
// 改动【之后】跑：5/5 OK
//
// 各条治的什么：
//   [1] digest 的 max_tokens 400 是全文件最小值，qwen3-30b 是 reasoning 模型
//       （thinking 吃 max_tokens）→ 正文为空 → 解析不出 {"digest":...} → empty_digest
//   [2] 回执写死 moondream，实际 2026-10-11 已换 llama-3.2-11b
//   [3] empty_digest 被显示成「没有可总结的样本」，而表里有 650 条人工样本 —— 文案在说谎
//   [4] [机器人风控] 是「bot 在执行处置」却被读成「bot 被风控」，本轮已误导一次
//   [5] BAN_ALL_GROUPS_CONCURRENCY 的注释只算了 5 路并发，漏了每群 2 次调用

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', '_worker.js');
const src = fs.readFileSync(SRC, 'utf8');

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

// D1：只放行 schema 探测，样本查询返回一条人工样本，其余空。
const SCHEMA_PROBE_PRAGMA = /PRAGMA\s+table_info/i;
const SCHEMA_PROBE_SQLITE_MASTER = /sqlite_master/i;
const COMMON_COLUMNS = ['id', 'name', 'note', 'chat_id', 'user_id', 'text_hash', 'sample_text', 'embedding', 'dimension', 'source', 'created_at', 'day', 'kind', 'cnt', 'updated_at', 'type', 'value'];
const HUMAN_SAMPLE = /FROM\s+ad_sample_embeddings/i;

function makeD1() {
	const stmt = (sql) => ({
		bind: (...args) => ({
			first: async () => {
				if (SCHEMA_PROBE_SQLITE_MASTER.test(String(sql))) return { name: args[0] };
				return null;
			},
			all: async () => {
				if (HUMAN_SAMPLE.test(String(sql))) return { results: [{ sample_text: '加我微信详谈长期收米一天九千', source: 'spam' }], success: true };
				if (SCHEMA_PROBE_PRAGMA.test(String(sql))) return { results: COMMON_COLUMNS.map((name) => ({ name })), success: true };
				return { results: [], success: true };
			},
			run: async () => ({ results: [{ success: true, meta: { changes: 1 } }], success: true })
		}),
		first: async () => (SCHEMA_PROBE_SQLITE_MASTER.test(String(sql)) ? { name: 'x' } : null),
		all: async () => {
			if (HUMAN_SAMPLE.test(String(sql))) return { results: [{ sample_text: '加我微信详谈长期收米一天九千', source: 'spam' }], success: true };
			if (SCHEMA_PROBE_PRAGMA.test(String(sql))) return { results: COMMON_COLUMNS.map((name) => ({ name })), success: true };
			return { results: [], success: true };
		},
		run: async () => ({ results: [{ success: true, meta: { changes: 1 } }], success: true })
	});
	return {
		prepare: stmt,
		exec: async () => ({ results: [], success: true }),
		batch: async (s) => Promise.all(s.map((x) => (x.run ? x.run() : x))),
		query: () => []
	};
}

// 捕获 console 输出
const logs = [];
const fakeConsole = {
	...console,
	log: (...a) => { logs.push(a.map(String).join(' ')); },
	error: (...a) => { logs.push(a.map(String).join(' ')); },
	warn: (...a) => { logs.push(a.map(String).join(' ')); }
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
	else { fail += 1; console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}

async function main() {
	// ---------- [1] digest 的 max_tokens ----------
	const buildAdDigest = sandbox.buildAdDigest;
	assert('[0] buildAdDigest 可取到', typeof buildAdDigest === 'function', typeof buildAdDigest);
	if (typeof buildAdDigest === 'function') {
		let captured = null;
		const env = {
			DB: makeD1(),
			AI: {
				run: async (model, payload) => {
					captured = payload;
					return { choices: [{ message: { content: '' } }] }; // 模型返回空 → 走 empty_digest
				}
			}
		};
		const r = await buildAdDigest(env, { llmModel: 'test-model' });
		assert('[1] 捕获到 AI 调用参数', captured !== null, 'AI.run 没被调用');
		const mt = Number(captured?.max_tokens || 0);
		assert('[1] digest max_tokens >= 1000', mt >= 1000, `实际 max_tokens=${mt}（原值 400，reasoning 模型 thinking 会吃光）`);
		assert('[1] 空返回确实走 empty_digest', r?.reason === 'empty_digest', JSON.stringify(r));
	}

	// ---------- [2] 熔断回执不提 moondream ----------
	const describeVisionBreak = sandbox.describeVisionBreak;
	assert('[0] describeVisionBreak 可取到', typeof describeVisionBreak === 'function', typeof describeVisionBreak);
	if (typeof describeVisionBreak === 'function') {
		const out = String(describeVisionBreak({ broken: true, consecFail: 41 }));
		assert('[2] 熔断回执不含 moondream', !/moondream/i.test(out), '回执原文: ' + out);
		assert('[2] 熔断回执含模型或通用说法', /llama|视觉|识别/i.test(out), out);
	}

	// ---------- [4] 机器人风控前缀 ----------
	const logBotModeration = sandbox.logBotModeration;
	assert('[0] logBotModeration 可取到', typeof logBotModeration === 'function', typeof logBotModeration);
	if (typeof logBotModeration === 'function') {
		logs.length = 0;
		logBotModeration('telegram-api:restrictChatMember:response', { 聊天ID: '-1001111111111', 用户ID: '12345', 是否成功: true });
		const joined = logs.join('\n');
		assert('[4] 日志前缀不再是 [机器人风控]', !joined.includes('[机器人风控]'), joined.slice(0, 200));
		assert('[4] 新前缀表达了「在执行处置」', /\[.*处置.*\]|\[.*执行.*\]/.test(joined), joined.slice(0, 200));
	}

	// ---------- [3] empty_digest 文案 ----------
	const source = src;
	const digestBranch = source.slice(source.indexOf("action === 'build'"), source.indexOf("action === 'clear'"));
	assert('[3] empty_digest 不再谎称「没有可总结的样本」',
		!digestBranch.includes('没有可总结的样本') || digestBranch.includes("reason === 'no_samples'"),
		'empty_digest 与 no_samples 共用同一句文案');
	assert('[3] 分支按 reason 区分', /reason\s*===\s*'empty_digest'/.test(digestBranch), '没有 empty_digest 专属文案');

	// ---------- [5] 并发注释算术 ----------
	const ccIndex = source.indexOf('const BAN_ALL_GROUPS_CONCURRENCY');
	const comment = source.slice(Math.max(0, ccIndex - 600), ccIndex);
	assert('[5] 注释说明了每群 2 次调用', /2\s*次调用|两次调用|restrictChatMember/.test(comment),
		'注释只算了 5 路并发，漏了每群 banChatMember + restrictChatMember 两次');

	console.log(`\n=== 总计 ${pass + fail}：通过 ${pass} 失败 ${fail} ===`);
	process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
