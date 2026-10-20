// 管理员判定缓存（checkIfUserIsAdmin）· 离线验证
// 运行：node test_admin_cache.mjs
//
// 验证五件事：
//   1. 命中管理员后 60 秒内不再发起 getChatAdministrators；
//   2. 非管理员（全部群查询成功且未命中）同样缓存，稳定态请求为 0；
//   3. 查询失败不缓存，下次调用重试（鉴权 fail-closed，不能把管理员误判成 false）；
//   4. 部分群失败时不缓存 false（那个失败的群可能正是他任管理员的群）；
//   5. 事件驱动失效（invalidateAdminCheckCache）后立即重新查询。
//
// 改动前这条测试必红：旧实现每次调用都遍历全部群，且没有失效函数。

import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('_worker.js', 'utf8');
const calls = [];
const adminByChat = new Map();
const failChats = new Set();

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const method = String(url).split('/').pop();
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
		if (method === 'getChatAdministrators') {
			const chatId = String(body?.chat_id ?? '');
			calls.push(chatId);
			if (failChats.has(chatId)) {
				return { ok: false, status: 500, json: async () => ({ ok: false, description: 'Internal Server Error' }) };
			}
			return { ok: true, status: 200, json: async () => ({ ok: true, result: adminByChat.get(chatId) || [] }) };
		}
		return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.replace(/export\s+default\s*/, 'globalThis.__h = '), sandbox, { filename: '_worker.js' });
const W = sandbox;

W.applyRuntimeConfig(W.loadRequiredConfig({
	TOKEN: 'T',
	BOT_TOKEN: '1:x',
	GROUP_ID: '-100111,-100222',
	OWNER_IDS: '10001',
}));

let passed = 0;
let failed = 0;
function assert(name, condition, detail = '') {
	if (condition) { passed += 1; console.log('✅ ' + name); }
	else { failed += 1; console.log('❌ ' + name + (detail ? ' — ' + detail : '')); }
}
function reset() { calls.length = 0; adminByChat.clear(); failChats.clear(); }

// 1. 命中管理员：查一次、缓存、二次零请求
reset();
adminByChat.set('-100222', [{ status: 'administrator', user: { id: 5001 } }]);
let result = await W.checkIfUserIsAdmin('5001');
assert('首次命中管理员返回 true', result === true);
assert('首次遍历到命中为止（2 个群）', calls.length === 2, '请求数 ' + calls.length);
reset();
result = await W.checkIfUserIsAdmin('5001');
assert('60 秒内二次命中走缓存', result === true);
assert('缓存命中后零 API 请求', calls.length === 0, '请求数 ' + calls.length);

// 2. 非管理员：全部成功且未命中 → 缓存 false
reset();
result = await W.checkIfUserIsAdmin('6001');
assert('非管理员首次返回 false', result === false);
assert('非管理员首次查完两个群', calls.length === 2, '请求数 ' + calls.length);
reset();
result = await W.checkIfUserIsAdmin('6001');
assert('非管理员结果也缓存（第二次仍 false）', result === false);
assert('非管理员缓存后零 API 请求', calls.length === 0, '请求数 ' + calls.length);

// 3. 查询失败：不缓存，下次重试
reset();
failChats.add('-100111');
result = await W.checkIfUserIsAdmin('7001');
assert('有群查询失败时返回 false（未命中已知群）', result === false);
reset();
await W.checkIfUserIsAdmin('7001');
assert('查询失败不缓存 false，下次重新查询', calls.length === 2, '请求数 ' + calls.length);

// 4. 部分失败 + 部分成功未命中：不能断言「他不是管理员」，不缓存
reset();
failChats.add('-100111');
adminByChat.set('-100222', []);
result = await W.checkIfUserIsAdmin('7002');
assert('部分群失败时返回 false', result === false);
reset();
await W.checkIfUserIsAdmin('7002');
assert('部分失败不缓存 false，下次重试', calls.length === 2, '请求数 ' + calls.length);

// 5. 一个群失败、另一个群命中：命中即确定，缓存 true
reset();
failChats.add('-100111');
adminByChat.set('-100222', [{ status: 'administrator', user: { id: 8001 } }]);
result = await W.checkIfUserIsAdmin('8001');
assert('部分失败但命中管理员仍返回 true', result === true);
reset();
result = await W.checkIfUserIsAdmin('8001');
assert('命中结果被缓存', result === true && calls.length === 0, '请求数 ' + calls.length);

// 6. 事件驱动失效：撤职/提权后立即重新查询
reset();
adminByChat.clear();
adminByChat.set('-100111', [{ status: 'creator', user: { id: 8001 } }]);
W.invalidateAdminCheckCache('8001');
result = await W.checkIfUserIsAdmin('8001');
assert('失效后重新查询并命中', result === true && calls.length === 1, '请求数 ' + calls.length);

// 7. 主人直接放行，零请求
reset();
result = await W.checkIfUserIsAdmin('10001');
assert('主人直接放行', result === true);
assert('主人不发起任何 API 请求', calls.length === 0, '请求数 ' + calls.length);

console.log('\n通过 ' + passed + ' / ' + (passed + failed));
if (failed > 0) process.exit(1);
