// /vision 独立额度池 —— 反证测试。
//
// 【问题】/vision 与 cron 共用 avatar_count / img_count 两个键。手动跑满 500 张后，
// 当天 cron（03:17 / 15:17 UTC）直接 daily_limit_reached 早退 —— 而 cron 才是日常
// 自动消化队列的主力。主人已确认付费版按量计费、不在乎上限翻倍，要的是两者互不挤占。
//
// 【改法】额度键按前缀参数化：
//   cron   → avatar / img            （默认值不变，一个字节不改）
//   /vision → vision_manual_avatar / vision_manual_img
//
// 判据：
//   [1] /vision 跑完不写 avatar_count        —— 改前会写 → 红
//   [2] /vision 写自己的池 vision_manual_*   —— 改前没有 → 红
//   [3] cron 池的 day 键也没被 /vision 动    —— 改前会被写
//   [4] 反证：cron 路径（不传前缀）仍写 avatar_count（默认值没被改坏）

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

const SCHEMA_PRAGMA = /PRAGMA\s+table_info/i;
const SCHEMA_MASTER = /sqlite_master/i;
const COLS = ['id', 'name', 'note', 'chat_id', 'user_id', 'file_unique_id', 'file_id', 'kind', 'last_user_id', 'verdict', 'vision_checked_at', 'key', 'value', 'updated_at', 'created_at'];

// state = ad_scan_state 的内存镜像，rows = ad_avatars 队列，imageRows = ad_images 队列
function makeD1(state, rows, imageRows = []) {
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
				// 头像队列与图片队列都要给数据 —— 图片队列空的话 runAdImageVision
				// 一张都不跑，[2c] 断言不到 vision_manual_img_count（首跑就栽这儿，
				// 连 [3b] 都会变成假绿：没跑过当然没占用）。
				if (/FROM\s+ad_avatars/i.test(String(sql))) return { results: rows, success: true };
				if (/FROM\s+ad_images/i.test(String(sql))) return { results: imageRows, success: true };
				if (SCHEMA_PRAGMA.test(String(sql))) return { results: COLS.map((name) => ({ name })), success: true };
				return { results: [], success: true };
			},
			run: async () => {
				// 必须用闭包 args —— run() 是无参调用，参数在 bind 阶段就定了
				if (/INSERT\s+INTO\s+ad_scan_state/i.test(String(sql)) && args.length >= 2) {
					state[String(args[0])] = String(args[1]);
				}
				return { results: [{ success: true, meta: { changes: 1 } }], success: true };
			}
		}),
		first: async () => (SCHEMA_MASTER.test(String(sql)) ? { name: 'x' } : null),
		all: async () => {
			if (/FROM\s+ad_avatars/i.test(String(sql))) return { results: rows, success: true };
			if (/FROM\s+ad_images/i.test(String(sql))) return { results: imageRows, success: true };
			if (SCHEMA_PRAGMA.test(String(sql))) return { results: COLS.map((name) => ({ name })), success: true };
			return { results: [], success: true };
		},
		run: async () => ({ results: [{ success: true, meta: { changes: 1 } }], success: true })
	});
	return { prepare: stmt, exec: async () => ({ results: [], success: true }), batch: async (s) => Promise.all(s.map((x) => (x.run ? x.run() : x))), query: () => [] };
}

const sent = [];
const sandbox = {
	console: { log() {}, error() {}, warn() {}, info() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async () => ({ ok: true, status: 200, async json() { return { ok: true, result: true }; }, async text() { return '{}'; }, async arrayBuffer() { return new ArrayBuffer(0); } })
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });

// Telegram mock：getFile 拿路径、下载拿图、sendMessage 收回执
const origFetch = sandbox.fetch;
sandbox.fetch = async (url, init) => {
	const u = String(url);
	const ok = (p) => ({ ok: true, status: 200, async json() { return p; }, async text() { return JSON.stringify(p); }, async arrayBuffer() { return new Uint8Array(64 * 1024).buffer; } });
	if (u.includes('sendMessage')) { try { sent.push(JSON.parse(init?.body || '{}').text || ''); } catch (_) { sent.push(''); } return ok({ ok: true, result: { message_id: 1 } }); }
	if (u.includes('getFile')) return ok({ ok: true, result: { file_path: 'photos/x.jpg' } });
	return ok({ ok: true, result: true });
};

const handler = sandbox.__handler;
const OWNER_ID = 10001;
const GROUP_ID = '-1001111111111';
const TODAY = new Date().toISOString().slice(0, 10);

function makeEnv(state, rows, imageRows = []) {
	return {
		TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID, OWNER_IDS: String(OWNER_ID),
		DB: makeD1(state, rows, imageRows),
		AI: { run: async () => ({ response: '{"ad":false,"text":"","reason":"干净图"}' }) }
	};
}
async function sendUpdate(update, env, ctx) {
	const req = new Request('https://x/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...update })
	});
	return handler.fetch(req, env, ctx);
}

let pass = 0, fail = 0;
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}

async function main() {
	// ===== [1][2][3] /vision 只动自己的池 =====
	const state = { avatar_day: TODAY, avatar_count: '0', img_day: TODAY, img_count: '0' };
	const rows = [{ file_unique_id: 'AV1', file_id: 'F1', last_user_id: '90001' }];
	// 图片队列也要给数据，否则 [2c] 断言不到（kind 必须在 AD_IMAGE_VISION_KINDS 里）
	const imageRows = [{ file_unique_id: 'IMG1', file_id: 'FI1', kind: 'photo', last_user_id: '90001' }];
	sent.length = 0;
	const ctx = { waitUntil(p) { return Promise.resolve(p).catch(() => {}); } };
	await sendUpdate({
		message: { message_id: 901, date: Math.floor(Date.now() / 1000), text: '/vision',
			chat: { id: OWNER_ID, type: 'private', first_name: 'Owner' },
			from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' } }
	}, makeEnv(state, rows, imageRows), ctx);
	await new Promise((r) => setTimeout(r, 500));   // waitUntil 不阻塞，等后台跑完

	console.log('  状态: ' + JSON.stringify(state));

	// [1] cron 池的计数【不能】被 /vision 动过
	assert('[1] /vision 不写 cron 池 avatar_count', String(state.avatar_count || '0') === '0',
		`avatar_count=${state.avatar_count}（被 /vision 占用了 cron 额度）`);
	// [3] cron 池的 day 键也不该被 /vision 重写（它本来就该是 TODAY，这里锁住不被改）
	assert('[3] cron 池 avatar_day 未被改动', String(state.avatar_day) === TODAY, `avatar_day=${state.avatar_day}`);
	// [2] 自己的池要有计数
	const manualCount = Number(state.vision_manual_avatar_count || 0);
	assert('[2] /vision 写入自己的池 vision_manual_avatar_count > 0', manualCount > 0,
		`vision_manual_avatar_count=${state.vision_manual_avatar_count}（键没接上）`);
	// [2b] 自己的 day 键也建了
	assert('[2b] 手动池 day 键 vision_manual_avatar_day 已写', state.vision_manual_avatar_day === TODAY,
		`value=${state.vision_manual_avatar_day}`);
	// [3b] 图片轨同理
	assert('[3b] 图片 cron 池 img_count 未被占用', String(state.img_count || '0') === '0', `img_count=${state.img_count}`);
	assert('[2c] 图片手动池 vision_manual_img_count > 0', Number(state.vision_manual_img_count || 0) > 0,
		`vision_manual_img_count=${state.vision_manual_img_count}`);

	// ===== [4] 反证：cron 路径（不传前缀）仍走默认键 =====
	const state2 = { avatar_day: TODAY, avatar_count: '0' };
	const r = await sandbox.runAdAvatarVision(makeEnv(state2, rows), { batchSize: 5 });
	await new Promise((r2) => setTimeout(r2, 100));
	console.log('  cron路径 状态: ' + JSON.stringify(state2));
	assert('[4] cron 路径（不传前缀）仍写 avatar_count —— 默认值没被改坏',
		String(state2.avatar_count || '0') !== '0' || Number(r?.done || 0) === 0,
		`avatar_count=${state2.avatar_count} done=${r?.done}`);
	assert('[4b] cron 路径不写手动池', !('vision_manual_avatar_count' in state2),
		JSON.stringify(state2));

	console.log(`\n=== 总计 ${pass + fail}：通过 ${pass} 失败 ${fail} ===`);
	process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
