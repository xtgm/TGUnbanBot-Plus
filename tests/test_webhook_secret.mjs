// Webhook 来源校验离线测试。
// 运行：node test_webhook_secret.mjs
//
// 覆盖四件事：
//   1. 未配置 WEBHOOK_SECRET → 保持旧行为放行（存量部署与其它 47 个测试不受影响）；
//   2. 配置后无头 / 错头 → 401，且不触碰 D1；
//   3. 配置后正确头 → 200，正常进入分发；
//   4. 非法字符的 secret 被忽略并告警，不会把机器人锁死。
//
// 这条断言在改动前必红：改动前 fetch 根本不看 header，四种情况全返回 200。

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(__dirname, '..', '_worker.js'), 'utf8');

function stripExportDefault(src) {
	const start = src.indexOf('export default');
	const braceStart = src.indexOf('{', start);
	let depth = 0;
	let i = braceStart;
	for (; i < src.length; i++) {
		if (src[i] === '{') depth += 1;
		else if (src[i] === '}') {
			depth -= 1;
			if (depth === 0) { i += 1; break; }
		}
	}
	if (src[i] === ';') i += 1;
	return src.slice(0, start) + 'globalThis.__handler = ' + src.slice(start + 'export default'.length, i) + ';' + src.slice(i);
}

const context = vm.createContext({
	console,
	URL,
	Request,
	Response,
	Headers,
	TextEncoder,
	TextDecoder,
	AbortController,
	crypto: globalThis.crypto,
	fetch: async () => new Response('{}', { status: 200 }),
	setTimeout,
	clearTimeout,
});
context.globalThis = context;
vm.runInContext(stripExportDefault(source), context, { filename: '_worker.js' });
const handler = context.__handler;

const BASE_ENV = {
	TOKEN: 'TESTTOKEN',
	BOT_TOKEN: '123456:fake',
	GROUP_ID: '-1001234567890',
};

async function sendWebhook(env, headers = {}) {
	const request = new Request('https://example.workers.dev/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...headers },
		body: JSON.stringify({ update_id: 1 }),
	});
	return handler.fetch(request, env, { waitUntil() {} });
}

let passed = 0;
let failed = 0;
function assert(name, condition, detail = '') {
	if (condition) {
		passed += 1;
		console.log('✅ ' + name);
	} else {
		failed += 1;
		console.log('❌ ' + name + (detail ? ' — ' + detail : ''));
	}
}

// 1. 未配置：保持旧行为
let response = await sendWebhook(BASE_ENV);
assert('未配置 WEBHOOK_SECRET 时放行（存量部署兼容）', response.status === 200, 'status=' + response.status);

// 2. 配置后无头：401
response = await sendWebhook({ ...BASE_ENV, WEBHOOK_SECRET: 'my-secret_1' });
assert('配置后无 header 返回 401', response.status === 401, 'status=' + response.status);

// 3. 配置后错头：401
response = await sendWebhook({ ...BASE_ENV, WEBHOOK_SECRET: 'my-secret_1' }, {
	'X-Telegram-Bot-Api-Secret-Token': 'wrong-secret',
});
assert('配置后错误 header 返回 401', response.status === 401, 'status=' + response.status);

// 4. 配置后正确头：200
response = await sendWebhook({ ...BASE_ENV, WEBHOOK_SECRET: 'my-secret_1' }, {
	'X-Telegram-Bot-Api-Secret-Token': 'my-secret_1',
});
assert('配置后正确 header 返回 200', response.status === 200, 'status=' + response.status);

// 5. 非法字符：忽略并放行，不锁死
response = await sendWebhook({ ...BASE_ENV, WEBHOOK_SECRET: 'bad secret!' });
assert('非法 secret 被忽略时放行', response.status === 200, 'status=' + response.status);

console.log('\n通过 ' + passed + ' / ' + (passed + failed));
if (failed > 0) process.exit(1);
