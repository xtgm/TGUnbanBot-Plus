// 额度上限放开 —— 反证测试。
//
// 【问题】pickInt 的第 4 个参数是【硬上限】，但超限时不是 clamp 而是直接回退默认值：
//     if (!Number.isFinite(n) || n < min || n > max) return fallback;
// 于是主人在 Dashboard 设 AD_AVATAR_VISION_DAILY=1000，拿到的不是 500，
// 而是代码默认的 50 —— 想调大反而变小。
// 主人已确认：广告识别不会被滥用，队列本身就是天然闸门（按 file_unique_id 主键去重、
// 队列空即零消耗），要求把上限放开。
//
// 判据：直接调 loadAdDetectionConfig，断言【设多大就是多大】。
//   [1] AD_AVATAR_VISION_DAILY=10000 → 10000（改前回退成 50 → 红）
//   [2] AD_IMAGE_VISION_DAILY=10000  → 10000（改前回退成 300 → 红）
//   [3] AD_LLM_DAILY=10000           → 10000（改前回退成 1000 → 红）
//   [3a][3b][3c] 三个 LLM 子池同理 —— 主人设了主池 10000 却没设子池，
//       子池默认 500/300/100 才是实际瓶颈（三池独立计数，主池的 10000 根本轮不到）
//   [4] 反证：0 仍是「关闭」语义，不能被放开改坏
//   [5] 反证：不设环境变量时仍用代码默认值（fallback 路径没坏）

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const sandbox = {
	console: { log() {}, error() {}, warn() {}, info() {} },
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
	else { fail += 1; console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 200) : ''}`); }
}

const cfg = (env) => sandbox.loadAdDetectionConfig(env);

console.log('=== 放开后：设多大就是多大 ===');
const big = cfg({ AD_AVATAR_VISION_DAILY: '10000', AD_IMAGE_VISION_DAILY: '10000', AD_LLM_DAILY: '10000' });
console.log('  实际: avatar=' + big.avatarVisionDaily + ' image=' + big.imageVisionDaily + ' llm=' + big.llmDaily);
assert('[1] AD_AVATAR_VISION_DAILY=10000 生效', Number(big.avatarVisionDaily) === 10000, `实际=${big.avatarVisionDaily}`);
assert('[2] AD_IMAGE_VISION_DAILY=10000 生效', Number(big.imageVisionDaily) === 10000, `实际=${big.imageVisionDaily}`);
assert('[3] AD_LLM_DAILY=10000 生效', Number(big.llmDaily) === 10000, `实际=${big.llmDaily}`);

console.log('\n=== LLM 三子池（主池放开了，子池仍是实际瓶颈）===');
const sub = cfg({ AD_LLM_DAILY_MESSAGE: '10000', AD_LLM_DAILY_JOIN: '10000', AD_LLM_DAILY_CRON: '10000' });
console.log('  实际: message=' + sub.llmDailyMessage + ' join=' + sub.llmDailyJoin + ' cron=' + sub.llmDailyCron);
assert('[3a] AD_LLM_DAILY_MESSAGE=10000 生效', Number(sub.llmDailyMessage) === 10000, `实际=${sub.llmDailyMessage}`);
assert('[3b] AD_LLM_DAILY_JOIN=10000 生效', Number(sub.llmDailyJoin) === 10000, `实际=${sub.llmDailyJoin}`);
assert('[3c] AD_LLM_DAILY_CRON=10000 生效', Number(sub.llmDailyCron) === 10000, `实际=${sub.llmDailyCron}`);

console.log('\n=== 反证：不该被放开改坏的 ===');
const zero = cfg({ AD_AVATAR_VISION_DAILY: '0', AD_IMAGE_VISION_DAILY: '0', AD_LLM_DAILY: '0' });
assert('[4] 设 0 仍是「关闭」（不是被当成不限）',
	Number(zero.avatarVisionDaily) === 0 && Number(zero.imageVisionDaily) === 0 && Number(zero.llmDaily) === 0,
	JSON.stringify({ avatar: zero.avatarVisionDaily, image: zero.imageVisionDaily, llm: zero.llmDaily }));

const none = cfg({});
console.log('  默认值: avatar=' + none.avatarVisionDaily + ' image=' + none.imageVisionDaily + ' llm=' + none.llmDaily);
assert('[5] 不设环境变量 → 仍用代码默认值',
	Number(none.avatarVisionDaily) > 0 && Number(none.imageVisionDaily) > 0 && Number(none.llmDaily) > 0,
	JSON.stringify({ avatar: none.avatarVisionDaily, image: none.imageVisionDaily, llm: none.llmDaily }));

console.log(`\n=== 总计 ${pass + fail}：通过 ${pass} 失败 ${fail} ===`);
process.exit(fail ? 1 : 0);
