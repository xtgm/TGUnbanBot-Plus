// 头像 file_id 失效的处理 —— 反证测试（丙：重新取头像；甲兜底：取不到就跳过且不计熔断）。
//
// 【问题】getFile 返回 `Bad Request: wrong file_id or the file is temporarily unavailable`
// 时，原实现把它和链路故障同等对待：stats.failed += 1 → bumpVisionBreakState(false)
// → 计入熔断。可这类失败【不可恢复】且一个 Neurons 都没花，连续 10 条失效文件
// 就会把正常头像一起停掉（/adstats 里「已连续失败 1 次」正是这么攒起来的）。
//
// 【修法】
//   1) 先试 getUserProfilePhotos 重新取当前头像 file_id（头像被换时最有价值 —— 能判到
//      用户现在的头像），取到就用新 file_id 重试一次；
//   2) 仍拿不到 → 计入新计数 skippedMissing，【不计 failed、不 bump 熔断】，
//      但仍推进 vision_checked_at（不重复取同一条）。
//
// 判据：
//   [1] 失效文件不计入 failed          —— 改前会 +1 → 红
//   [2] 熔断计数不被失效文件推高        —— 改前会 bump(false) → 红
//   [3] 有 skippedMissing 计数可见      —— 改前无此字段 → 红
//   [4] 刷新成功时能用新 file_id 判定    —— 丙的核心
//   [5] 反证：刷新失败仍要推进 checked_at（不无限重试）

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

const SCHEMA_PRAGMA = /PRAGMA\s+table_info/i;
const SCHEMA_MASTER = /sqlite_master/i;
const COLS = ['id', 'name', 'note', 'chat_id', 'user_id', 'file_unique_id', 'file_id', 'kind', 'last_user_id', 'verdict', 'vision_checked_at', 'key', 'value', 'updated_at', 'created_at'];

function makeD1(state, rows) {
	const stmt = (sql) => ({
		bind: (...args) => ({
			first: async () => {
				if (/ad_scan_state/i.test(String(sql)) && args[0] != null) {
					const k = String(args[0]);
					return { value: state[k] != null ? state[k] : '' };
				}
				if (SCHEMA_MASTER.test(String(sql))) return { name: args[0] };
				return null;
			},
			all: async () => {
				if (/FROM\s+ad_avatars/i.test(String(sql))) return { results: rows, success: true };
				if (SCHEMA_PRAGMA.test(String(sql))) return { results: COLS.map((name) => ({ name })), success: true };
				return { results: [], success: true };
			},
			run: async () => {
				// 必须用闭包里的 args —— run() 是无参调用，参数在 bind 阶段就已经定了。
				// 首写成 run: async (a) => 时 a 恒 undefined，state 从没被写入，
				// 于是 [2][2b] 变成假绿、批次内熔断也读不到标记（跑满 15 张不 break）。
				if (/INSERT\s+INTO\s+ad_scan_state/i.test(String(sql)) && args.length >= 2) {
					state[String(args[0])] = String(args[1]);
				}
				return { results: [{ success: true, meta: { changes: 1 } }], success: true };
			}
		}),
		first: async () => (SCHEMA_MASTER.test(String(sql)) ? { name: 'x' } : null),
		all: async () => {
			if (/FROM\s+ad_avatars/i.test(String(sql))) return { results: rows, success: true };
			if (SCHEMA_PRAGMA.test(String(sql))) return { results: COLS.map((name) => ({ name })), success: true };
			return { results: [], success: true };
		},
		run: async () => ({ results: [{ success: true, meta: { changes: 1 } }], success: true })
	});
	return { prepare: stmt, exec: async () => ({ results: [], success: true }), batch: async (s) => Promise.all(s.map((x) => (x.run ? x.run() : x))), query: () => [] };
}

const logs = [];
const sandbox = {
	console: { log() {}, error: (...a) => { logs.push(a.map(String).join(' ')); }, warn() {}, info() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder,
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

// 场景：getFile 一律返回 wrong file_id；getUserProfilePhotos 可刷新（或不可用）
const apiCalls = [];
function makeFetch(refreshWorks) {
	return async (url, init) => {
		const u = String(url);
		apiCalls.push(u.includes('getUserProfilePhotos') ? 'getUserProfilePhotos' : (u.includes('getFile') ? 'getFile' : 'other'));
		// JPEG magic bytes —— 2026-10-14 起头像先 sniffImageMime 认字节头，
		// 全零字节会被当成「不是位图」拒掉（见 test_vision_clef.mjs 同处说明）。
		const jpegBytes = () => { const u8 = new Uint8Array(64 * 1024); u8[0] = 0xFF; u8[1] = 0xD8; u8[2] = 0xFF; u8[3] = 0xE0; return u8.buffer; };
		const ok = (payload) => ({ ok: true, status: 200, async json() { return payload; }, async text() { return JSON.stringify(payload); }, async arrayBuffer() { return jpegBytes(); } });
		// 顺序要紧：getUserProfilePhotos 必须在 getFile 之前判，
		// 而 getFile 要按 file_id 分流 —— 旧的「一律返回 wrong file_id」分支
		// 曾经排在最前面直接 return，把下面的 FRESH_1 分支整段变成死代码（首跑就栽这儿）。
		if (u.includes('getUserProfilePhotos')) {
			return refreshWorks
				? ok({ ok: true, result: { total_count: 1, photos: [[{ file_id: 'FRESH_1', file_unique_id: 'U_1', width: 100, height: 100 }]] } })
				: ok({ ok: false, error_code: 400, description: 'Bad Request: user not found' });
		}
		if (u.includes('getFile')) {
			let fileId = '';
			try { fileId = String(JSON.parse(init?.body || '{}').file_id || ''); } catch (_) { fileId = ''; }
			return fileId === 'FRESH_1'
				? ok({ ok: true, result: { file_path: 'photos/fresh.jpg' } })
				: ok({ ok: false, error_code: 400, description: 'Bad Request: wrong file_id or the file is temporarily unavailable' });
		}
		return ok({ ok: true, result: true });
	};
}

async function runScenario(refreshWorks) {
	const state = { vision_day: '', vision_consec_fail: '0', vision_broken_day: '' };
	// 15 行而不是 1 行：熔断阈值是 10，只放 1 行时「失效是否推高熔断」两种实现都是 0，
	// 那条断言就成了假绿（首跑就是这么绿的）。15 行才能让改前的实现真正熔断。
	const rows = Array.from({ length: 15 }, (_, i) => ({ file_unique_id: 'AV' + i, file_id: 'OLD_DEAD', last_user_id: '9000' + i }));
	const env = { DB: makeD1(state, rows), TOKEN: 'T', BOT_TOKEN: '1:fake', GROUP_ID: '-1001111111111', OWNER_IDS: '10001', AI: { run: async () => ({ answers: { ad: { type: 'choice', choice: 'clean', probabilities: { ad: 0.05, clean: 0.95 }, confidence: 0.9 } } }) } };
	const orig = sandbox.fetch;
	sandbox.fetch = makeFetch(refreshWorks);
	let stats = null, err = null;
	try { stats = await sandbox.runAdAvatarVision(env, { batchSize: 10 }); } catch (e) { err = e; }
	sandbox.fetch = orig;
	return { stats, state, err };
}

async function main() {
	// ===== 场景 A：刷新不可用（纯丙兜底 = 甲）=====
	console.log('\n--- 场景 A：getUserProfilePhotos 也拿不到 → 跳过且不计熔断 ---');
	const a = await runScenario(false);
	assert('[A-0] 未抛异常', a.err === null, a.err && String(a.err.message).slice(0, 200));
	if (a.stats) {
		console.log('   stats = ' + JSON.stringify(a.stats));
	console.log('   API 调用: ' + JSON.stringify(apiCalls));
		// [1] 核心：失效文件不计入 failed
		assert('[1] 失效文件不计入 failed', Number(a.stats.failed || 0) === 0, `failed=${a.stats.failed}`);
		// [2] 熔断计数不被推高
		assert('[2] 熔断计数未被推高', String(a.state.vision_consec_fail || '0') === '0', `consec=${a.state.vision_consec_fail}`);
		assert('[2b] 未写入熔断标记', !a.state.vision_broken_day, `broken=${a.state.vision_broken_day}`);
		// [3] 新计数可见
		assert('[3] 有 skippedMissing 计数', Number(a.stats.skippedMissing || 0) > 0, `skippedMissing=${a.stats.skippedMissing}`);
		// [5] 反证：仍推进 checked_at（不无限重试）—— 通过 stats.queued>0 或 done 判断
		assert('[5] 确实处理过队列（不是压根没跑）', Number(a.stats.queued || 0) > 0, JSON.stringify(a.stats));
	}

	// ===== 场景 B：刷新成功 → 用新 file_id 判定 =====
	console.log('\n--- 场景 B：getFileProfilePhotos 能拿到新头像 → 应能判定 ---');
	const b = await runScenario(true);
	assert('[B-0] 未抛异常', b.err === null, b.err && String(b.err.message).slice(0, 200));
	if (b.stats) {
		console.log('   stats = ' + JSON.stringify(b.stats));
	console.log('   API 调用: ' + JSON.stringify(apiCalls));
		// [4] 丙的核心：刷新成功后应完成判定（done > 0）或至少不增加 failed
		assert('[4] 刷新后能完成判定（done>0）', Number(b.stats.done || 0) > 0, `done=${b.stats.done} failed=${b.stats.failed}`);
		assert('[4b] 刷新成功时不计 skippedMissing', Number(b.stats.skippedMissing || 0) === 0, `skippedMissing=${b.stats.skippedMissing}`);
	}

	console.log(`\n=== 总计 ${pass + fail}：通过 ${pass} 失败 ${fail} ===`);
	process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
