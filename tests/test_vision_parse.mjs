// 视觉识别两项修复的反证测试：[A] 解析取第一个完整 JSON、[C] 熔断在批次内中途生效。
//
// 运行：node test_vision_parse.mjs
// 改动【之前】跑：[A] 两条、[C] 两条应 FAIL
// 改动【之后】跑：4/4 OK
//
// [A] 的样本是 2026-10-12 线上复现的真实形态 —— 用代码里逐字相同的 prompt 调
//     llama-3.2-11b-vision 实测得到：模型把同一段 JSON 复读 40+ 次、烧满 max_tokens。
//     原实现用贪婪正则 /\{[\s\S]*\}/ 把它们连成一段 → JSON.parse 报 Extra data
//     → catch 静默返回 null → 上层 throw「模型回答无法解析」→ stage=ai.run。
//
// [C] 的问题：熔断检查只在 runAdAvatarVision 开头做一次，批次内第 10 张失败后
//     循环继续跑完剩余的图 → vision_consec_fail 从 10 一路涨到 28（2026-10-12 实测）。

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

// ===== 线上复现的真实返回（40+ 次复读，烧满 512 token）=====
const ONE_JSON = '{"ad":false,"text":"","reason":"纯色"}';
const REPEATED = '。\n' + ONE_JSON + ' ' + Array(40).fill(ONE_JSON).join(' ');

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
	// ================= [A] 解析复读返回 =================
	const parseAvatarVisionAnswer = sandbox.parseAvatarVisionAnswer;
	assert('[0] parseAvatarVisionAnswer 可取到', typeof parseAvatarVisionAnswer === 'function', typeof parseAvatarVisionAnswer);
	if (typeof parseAvatarVisionAnswer === 'function') {
		// [A-1] 核心：复读返回必须能解析出第一个完整 JSON
		const r = parseAvatarVisionAnswer(REPEATED);
		assert('[A-1] 复读返回能解析出结果', r !== null, '返回 null —— 这正是线上 stage=ai.run 失败的形态');
		if (r) {
			assert('[A-2] 解析结果正确', r.ad === false && String(r.reason) === '纯色', JSON.stringify(r));
		} else {
			assert('[A-2] 解析结果正确', false, 'A-1 已失败，本条必然失败');
		}
		// [A-3] 回归：正常的单个 JSON 仍要能解析
		const r2 = parseAvatarVisionAnswer('前置说明\n' + ONE_JSON + '\n后置说明');
		assert('[A-3] 普通返回仍能解析', r2 !== null && r2.ad === false, JSON.stringify(r2));
		// [A-4] 反证：字符串值里的花括号不能被当成结构括号
		const r3 = parseAvatarVisionAnswer('{"ad":true,"text":"看 {主页} 领米","reason":"含括号"} 后面又一个 {"ad":false}');
		assert('[A-4] 字符串内的花括号不破坏解析', r3 !== null && r3.ad === true, JSON.stringify(r3));
		// [A-5] 反证：确实没有 JSON 时仍返回 null（不能什么都当成功）
		assert('[A-5] 无 JSON 时仍返回 null', parseAvatarVisionAnswer('纯文本没有结构') === null);
	}

	// ================= [C] 熔断批次内中途生效 =================
	// 构造：队列 15 张图、AI 必失败、初始未熔断。
	// 改前：循环跑满 15 张（fail=15）→ 断言红
	// 改后：第 10 次失败触发熔断并 break（fail<=10）→ 断言绿
	const runAdAvatarVision = sandbox.runAdAvatarVision;
	assert('[0] runAdAvatarVision 可取到', typeof runAdAvatarVision === 'function', typeof runAdAvatarVision);

	if (typeof runAdAvatarVision === 'function') {
		const SCHEMA_PROBE_PRAGMA = /PRAGMA\s+table_info/i;
		const SCHEMA_PROBE_SQLITE_MASTER = /sqlite_master/i;
		const COLS = ['id', 'name', 'note', 'chat_id', 'user_id', 'file_unique_id', 'file_id', 'last_user_id', 'verdict', 'vision_checked_at', 'key', 'value', 'updated_at', 'created_at'];
		const state = { vision_day: '', vision_consec_fail: '0', vision_broken_day: '' };
		let aiCalls = 0;

		const rows15 = Array.from({ length: 15 }, (_, i) => ({
			file_unique_id: 'fid' + i, file_id: 'file' + i, last_user_id: '9000' + i
		}));

		const DB = {
			prepare(sql) {
				const s = String(sql);
				const runFn = async (args) => {
					// 状态键写入
					if (/INSERT\s+INTO\s+ad_scan_state/i.test(s) && args.length >= 2) { state[String(args[0])] = String(args[1]); return { results: [{ success: true }] }; }
					// 队列查询
					if (/FROM\s+ad_avatars/i.test(s)) return { results: rows15, success: true };
					return { results: [{ success: true, meta: { changes: 1 } }], success: true };
				};
				const bind = (...args) => ({
					first: async () => {
						if (/ad_scan_state/i.test(s) && args[0] != null) { const k = String(args[0]); return { value: state[k] != null ? state[k] : '' }; }
						if (SCHEMA_PROBE_SQLITE_MASTER.test(s)) return { name: args[0] };
						return null;
					},
					all: async () => {
						if (/FROM\s+ad_avatars/i.test(s)) return { results: rows15, success: true };
						if (SCHEMA_PROBE_PRAGMA.test(s)) return { results: COLS.map((name) => ({ name })), success: true };
						return { results: [], success: true };
					},
					run: () => runFn(args)
				});
				return {
					bind,
					first: async () => (SCHEMA_PROBE_SQLITE_MASTER.test(s) ? { name: 'x' } : null),
					all: async () => {
						if (/FROM\s+ad_avatars/i.test(s)) return { results: rows15, success: true };
						if (SCHEMA_PROBE_PRAGMA.test(s)) return { results: COLS.map((name) => ({ name })), success: true };
						return { results: [], success: true };
					},
					run: () => runFn([])
				};
			},
			exec: async () => ({ results: [], success: true }),
			batch: async (stmts) => Promise.all(stmts.map((x) => (x.run ? x.run() : x))),
			query: () => []
		};

		// Telegram：getFile 拿路径、下载拿图片 —— 都正常，只让 AI 这一步失败
		// 【C 轨必须用 A 管不到的失败】A 修复后复读 JSON 能解析了 → 全判 clean → 没有失败
		// → 熔断路径走不到（首跑就栽在这里，是 [C-4] 的反证抓出来的）。
		// 所以这里让模型返回一段没有结构的文本 —— parseAvatarVisionAnswer 必然返回 null。
		const env = {
			DB,
			TOKEN: 'T', BOT_TOKEN: '1:fake', GROUP_ID: '-1001111111111', OWNER_IDS: '10001',
			AI: {
				run: async () => {
					aiCalls += 1;
					return { response: '这段回答里没有任何 JSON 结构，解析必然失败' };
				}
			}
		};

		// fetch：Telegram 的 getFile / 文件下载
		const origFetch = sandbox.fetch;
		sandbox.fetch = async (url) => {
			const u = String(url);
			if (u.includes('getFile')) return { ok: true, status: 200, async json() { return { ok: true, result: { file_path: 'photos/x.jpg' } }; }, async text() { return '{}'; } };
			// JPEG magic bytes —— 见 test_vision_clef.mjs 同处说明（sniffImageMime 要真实字节头，
			// 全零字节会被当成「不是位图」拒掉，测试就走不到推理那一步）。
			if (u.includes('/file/')) {
				const u8 = new Uint8Array(64 * 1024);
				u8[0] = 0xFF; u8[1] = 0xD8; u8[2] = 0xFF; u8[3] = 0xE0;
				return { ok: true, status: 200, async json() { return {}; }, async text() { return ''; }, async arrayBuffer() { return u8.buffer; } };
			}
			return { ok: true, status: 200, async json() { return { ok: true, result: true }; }, async text() { return '{}'; }, async arrayBuffer() { return new ArrayBuffer(0); } };
		};

		logs.length = 0;
		let stats = null, threw = null;
		try { stats = await runAdAvatarVision(env, { batchSize: 15 }); } catch (e) { threw = e; }
		sandbox.fetch = origFetch;

		assert('[C-0] 未抛异常', threw === null, threw && String(threw.message).slice(0, 200));
		if (stats) {
			const failed = Number(stats.failed || 0);
			// [C] 核心：第 10 次失败就该熔断并中止批次，不能跑满 15
			assert('[C-1] 熔断后中止批次（failed <= 10）', failed <= 10, `实际 failed=${failed}（跑满了队列，批次内熔断没生效）`);
			// [C-2] 状态里的计数也必须已置熔断
			assert('[C-2] 状态已写入熔断标记', state.vision_broken_day === new Date().toISOString().slice(0, 10),
				`vision_broken_day=${JSON.stringify(state.vision_broken_day)}`);
			// [C-3] 反证：AI 至少被调用过（否则前面几条断言是空跑）
			assert('[C-3] AI 确实被调用过', aiCalls > 0, 'aiCalls=0，测试没走到推理');
			assert('[C-4] 确实有失败计数', failed > 0, JSON.stringify(stats));
		} else {
			'[C] stats 为空'.split(' ').forEach(() => assert('[C-1] 熔断后中止批次（failed <= 10）', false, 'stats 为空'));
		}
	}

	console.log(`\n=== 总计 ${pass + fail}：通过 ${pass} 失败 ${fail} ===`);
	process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
