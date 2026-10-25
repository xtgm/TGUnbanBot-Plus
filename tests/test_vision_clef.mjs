// 视觉模型换 clef-flash —— 反证测试。
//
// 【为什么换】llama-3.2-11b-vision 实测【认不出广告头像】：
//   · 一张写着「晨曦 代发 ✈️ @tz666」的头像 → {"ad":false,"reason":"纯色背景"}
//   · 只裁文字区放大 → 仍 {"ad":false,"reason":"纯色背景"}
//   · 换 prompt 强制先抄文字 → 复读 800 token、正文全是 [图片]
//   · 换 llama-4-scout / kimi-k2.6 → 返回空；glm-5.3-flash → 400；moondream → {}
//   · mistral-small-3.1 → {"ad":false,"reason":"图片是一张风景照"}（同样错）
// 而 @cf/cloudflare/clef-flash 用正确格式实测同一张图：
//   answers.ad.choice = "ad"，probabilities.ad = 0.9369，has_text.noul = 0.96
//   三张非广告图（纯色 / 渐变 / 含大量中文的资料卡截图）→ 全部 clean，ad 概率 0.037~0.099
//   区分度 0.9369 vs 0.0985，阈值 0.5 即可干净分离。
//   且 output_tokens = 0（不收输出费）、每图自动缩放（<65k px 放大、>1MP 缩小、封顶 1024 tokens）、
//   单图 4 MiB / 16 MP 上限 —— 主人要的「不限尺寸自适应」正是模型自带的。
//
// 判据（mock AI 返回 clef 结构）：
//   [1] 广告图 → verdict = 'ad'        —— 改前解析 expect {"response":...} → 失败 → 红
//   [2] 概率带进 reasons（可观测）
//   [3] 非广告图 → verdict = 'clean'
//   [4] 反证：不再依赖 parseAvatarVisionAnswer 的文本 JSON 路径

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

const FROM_AD_IMAGES = /FROM\s+ad_images/i;

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
				if (/FROM\s+ad_images/i.test(String(sql))) return { results: [], success: true };
				if (SCHEMA_PRAGMA.test(String(sql))) return { results: COLS.map((name) => ({ name })), success: true };
				return { results: [], success: true };
			},
			run: async () => {
				if (/INSERT\s+INTO\s+ad_scan_state/i.test(String(sql)) && args.length >= 2) state[String(args[0])] = String(args[1]);
				return { results: [{ success: true, meta: { changes: 1 } }], success: true };
			}
		}),
		first: async () => (SCHEMA_MASTER.test(String(sql)) ? { name: 'x' } : null),
		all: async () => {
			if (/FROM\s+ad_avatars/i.test(String(sql))) return { results: rows, success: true };
			if (FROM_AD_IMAGES.test(String(sql))) return { results: [], success: true };
			if (SCHEMA_PRAGMA.test(String(sql))) return { results: COLS.map((name) => ({ name })), success: true };
			return { results: [], success: true };
		},
		run: async () => ({ results: [{ success: true, meta: { changes: 1 } }], success: true })
	});
	return { prepare: stmt, exec: async () => ({ results: [], success: true }), batch: async (s) => Promise.all(s.map((x) => (x.run ? x.run() : x))), query: () => [] };
}

const logs = [];
const sandbox = {
	console: { log: (...a) => { logs.push(a.map(String).join(' ')); }, error: (...a) => { logs.push(a.map(String).join(' ')); }, warn() {}, info() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async () => ({ ok: true, status: 200, async json() { return { ok: true, result: true }; }, async text() { return '{}'; }, async arrayBuffer() { return new ArrayBuffer(0); } })
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });

// Telegram mock：getFile → 下载
const origFetch = sandbox.fetch;
sandbox.fetch = async (url) => {
	const u = String(url);
	// 64KB，开头写 JPEG magic bytes（FF D8 FF E0）。
	// 2026-10-14 起头像那条会先 sniffImageMime 认字节头再拼 data URI —— 全零字节
	// 会被当成「不是位图」直接拒掉（那正是新行为：错格式喂模型必然失败）。
	// 线上 Telegram 下载到的本来就是真实图片，mock 就该带真实字节头。
	const jpegBytes = () => { const u8 = new Uint8Array(64 * 1024); u8[0] = 0xFF; u8[1] = 0xD8; u8[2] = 0xFF; u8[3] = 0xE0; return u8.buffer; };
	const ok = (p) => ({ ok: true, status: 200, async json() { return p; }, async text() { return JSON.stringify(p); }, async arrayBuffer() { return jpegBytes(); } });
	if (u.includes('getFile')) return ok({ ok: true, result: { file_path: 'photos/x.jpg' } });
	if (u.includes('sendMessage')) return ok({ ok: true, result: { message_id: 1 } });
	return ok({ ok: true, result: true });
};

let pass = 0, fail = 0;
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 260) : ''}`); }
}

// clef-flash 的真实返回结构（2026-10-13 实测同一张广告头像）
const CLEF_AD = { answers: { ad: { type: 'choice', choice: 'ad', probabilities: { ad: 0.9369, clean: 0.0631 }, confidence: 0.7635 }, has_text: { type: 'noul', noul: 0.96 } }, usage: { input_tokens: 784, output_tokens: 0 } };
const CLEF_CLEAN = { answers: { ad: { type: 'choice', choice: 'clean', probabilities: { ad: 0.0985, clean: 0.9015 }, confidence: 0.803 } }, usage: { input_tokens: 700, output_tokens: 0 } };

async function runOne(clefResult, tag) {
	const state = { vision_day: '', vision_consec_fail: '0', vision_broken_day: '' };
	const rows = [{ file_unique_id: 'AV_' + tag, file_id: 'F_' + tag, last_user_id: '9000' + tag }];
	const env = {
		TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: '-1001111111111', OWNER_IDS: '10001',
		DB: makeD1(state, rows),
		AI: { run: async () => clefResult }
	};
	let stats = null, err = null;
	try { stats = await sandbox.runAdAvatarVision(env, { batchSize: 5, quotaPrefix: 'vision_manual_avatar' }); } catch (e) { err = e; }
	await new Promise((r) => setTimeout(r, 50));
	return { stats, err };
}

async function main() {
	console.log('=== [1] 广告图（clef 返回 ad 0.9369）===');
	const a = await runOne(CLEF_AD, '1');
	console.log('  stats=' + JSON.stringify(a.stats) + ' err=' + (a.err?.message || '无'));
	assert('[1] 广告头像被判为 ad', Number(a.stats?.ad || 0) > 0,
		`ad=${a.stats?.ad} failed=${a.stats?.failed}（改前代码读 {"response":...} 必然解析失败）`);
	assert('[2] 没有计入失败（判定成功）', Number(a.stats?.failed || 0) === 0, `failed=${a.stats?.failed}`);
	// 概率可观测：日志里应出现 clef 的概率
	assert('[2b] 日志里带出 clef 概率（0.9369）', logs.some((l) => l.includes('0.9369') || l.includes('ad=0.94')),
		'日志片段: ' + logs.slice(-3).join(' / ').slice(0, 200));

	console.log('\n=== [3] 非广告图（clef 返回 clean 0.0985）===');
	logs.length = 0;
	const b = await runOne(CLEF_CLEAN, '2');
	console.log('  stats=' + JSON.stringify(b.stats));
	assert('[3] 非广告头像被判为 clean', Number(b.stats?.clean || 0) > 0, `clean=${b.stats?.clean}`);
	assert('[3b] clean 不被误计为 ad', Number(b.stats?.ad || 0) === 0, `ad=${b.stats?.ad}`);

	console.log(`\n=== 总计 ${pass + fail}：通过 ${pass} 失败 ${fail} ===`);
	process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
