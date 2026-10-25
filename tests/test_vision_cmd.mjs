// /vision 不许再同步阻塞 webhook —— 反证测试。
//
// 【2026-10-13 事故根因】handleAdVisionCommand 原本是：
//     await runAdAvatarVision(...)           // 最多 500 张
//     await runAdImageVision(..., 150)       // 最多 150 张
//     await sendTelegramMessage(结果)        // 跑完才回复
// waitUntil 使用次数 = 0（实测）→ 请求挂几分钟到十几分钟 → webhook 收不到响应
// → 后续消息全部被堵 → 私聊命令集体无反应；回退/重部署让实例重建才一次性释放。
//
// 改法：先立刻回一句「已开始」，再用 ctx.waitUntil 后台跑，跑完再发结果。
//
// 判据：sendMessage 至少 2 次（立即回执 + 最终结果），且第一次必须是「已开始」那句。
// 改动【之前】跑：[1] 应 FAIL（只有 1 次发送）
// 改动【之后】跑：全部 OK
//
// 注意：此前没有任何测试覆盖 /vision（grep '/vision' test_*.mjs = 0 命中），
// 这正是 f49e9ff 那次把命令接线整个撤掉却没人发现的原因。

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

// D1：schema 探测放行、队列返回空（跑一轮秒回，不依赖真实数据）
const SCHEMA_PRAGMA = /PRAGMA\s+table_info/i;
const SCHEMA_MASTER = /sqlite_master/i;
const COLS = ['id', 'name', 'note', 'chat_id', 'user_id', 'file_unique_id', 'file_id', 'kind', 'last_user_id', 'verdict', 'vision_checked_at', 'key', 'value', 'updated_at', 'created_at'];

function makeD1() {
	const stmt = (sql) => ({
		bind: (...args) => ({
			first: async () => {
				if (/ad_scan_state/i.test(String(sql)) && args[0] != null) return { value: '' };
				if (SCHEMA_MASTER.test(String(sql))) return { name: args[0] };
				return null;
			},
			all: async () => {
				if (SCHEMA_PRAGMA.test(String(sql))) return { results: COLS.map((name) => ({ name })), success: true };
				return { results: [], success: true };   // 队列空
			},
			run: async () => ({ results: [{ success: true, meta: { changes: 1 } }], success: true })
		}),
		first: async () => (SCHEMA_MASTER.test(String(sql)) ? { name: 'x' } : null),
		all: async () => {
			if (SCHEMA_PRAGMA.test(String(sql))) return { results: COLS.map((name) => ({ name })), success: true };
			return { results: [], success: true };
		},
		run: async () => ({ results: [{ success: true, meta: { changes: 1 } }], success: true })
	});
	return { prepare: stmt, exec: async () => ({ results: [], success: true }), batch: async (s) => Promise.all(s.map((x) => (x.run ? x.run() : x))), query: () => [] };
}

const sentMessages = [];
let waitUntilCalled = 0;

const sandbox = {
	console: { log() {}, error() {}, warn() {}, info() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async (url) => {
		const u = String(url);
		if (u.includes('sendMessage')) {
			return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 1 } }; }, async text() { return '{}'; } };
		}
		return { ok: true, status: 200, async json() { return { ok: true, result: true }; }, async text() { return '{}'; }, async arrayBuffer() { return new ArrayBuffer(0); } };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });

// 拦截 sendMessage 抓内容
const origFetch = sandbox.fetch;
sandbox.fetch = async (url, init) => {
	const u = String(url);
	if (u.includes('sendMessage')) {
		try { sentMessages.push(JSON.parse(init?.body || '{}').text || ''); } catch (_) { sentMessages.push(''); }
		return { ok: true, status: 200, async json() { return { ok: true, result: { message_id: 1 } }; }, async text() { return '{}'; } };
	}
	return origFetch(url, init);
};

const handler = sandbox.__handler;
const OWNER_ID = 10001;
const GROUP_ID = '-1001111111111';

function makeEnv() {
	return { TOKEN: 'T', BOT_TOKEN: '1:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID), DB: makeD1(), AI: { run: async () => ({ response: '{"ad":false,"text":"","reason":"x"}' }) } };
}
async function sendUpdate(update, env, ctx) {
	const req = new Request('https://x.com/', {
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
	sentMessages.length = 0;
	const ctx = {
		waitUntil(p) {
			waitUntilCalled += 1;
			return Promise.resolve(p).catch(() => {});
		}
	};
	await sendUpdate({
		message: {
			message_id: 501,
			date: Math.floor(Date.now() / 1000),
			text: '/vision',
			chat: { id: OWNER_ID, type: 'private', first_name: 'Owner' },
			from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' }
		}
	}, makeEnv(), ctx);

	// waitUntil 不阻塞 —— 不等的话断言时后台 run() 还没跑完，第二次发送还没发
	// （首跑就栽在这里：[1] 只看到 1 条，[3] 还被「已开始」那条文案凑绿成了假绿）。
	await new Promise((r) => setTimeout(r, 400));

	console.log('--- 发送的消息 ---');
	sentMessages.forEach((m, i) => console.log(`  [${i}] ${String(m).replace(/\n/g, ' | ').slice(0, 160)}`));

	// [1] 核心：至少两次 —— 立即回执 + 最终结果
	assert('[1] sendMessage 被调用至少 2 次（立即回执 + 结果）',
		sentMessages.length >= 2, `实际 ${sentMessages.length} 次（原实现跑完才回复，只有 1 次）`);

	// [2] 第一条必须是「已开始」类回执，不能直接是结果
	if (sentMessages.length >= 1) {
		assert('[2] 第一条是「已开始」回执（先回再跑）',
			/开始|⏳|处理中/i.test(String(sentMessages[0])), `第一条: ${String(sentMessages[0]).slice(0, 120)}`);
	}
	// [3] 最终结果那条仍要包含视觉识别字样
	assert('[3] 结果里仍含视觉识别',
		sentMessages.some((m) => /视觉识别/.test(String(m))), `全部: ${JSON.stringify(sentMessages.map((m) => String(m).slice(0, 60)))}`);
	// [4] 反证：确实走了 ctx.waitUntil（否则第 [1] 条不成立）
	assert('[4] 确实调用了 ctx.waitUntil', waitUntilCalled > 0, 'waitUntil 调用次数 = 0，仍是同步阻塞');

	console.log(`\n=== 总计 ${pass + fail}：通过 ${pass} 失败 ${fail} ===`);
	process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
