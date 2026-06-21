// /leavegroup owner-only private command tests.
// Runs offline with mocked Telegram Bot API calls.

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '_worker.js'), 'utf8');

function stripExportDefault(source) {
	const start = source.indexOf('export default');
	const braceStart = source.indexOf('{', start);
	let depth = 0;
	let i = braceStart;
	for (; i < source.length; i++) {
		if (source[i] === '{') depth += 1;
		else if (source[i] === '}') {
			depth -= 1;
			if (depth === 0) { i += 1; break; }
		}
	}
	if (source[i] === ';') i += 1;
	return source.slice(0, start) + 'globalThis.__handler = ' + source.slice(start + 'export default'.length, i) + ';' + source.slice(i);
}

const calls = [];
let telegramHandlers = {};

function setTelegramHandlers(next = {}) {
	telegramHandlers = next;
}

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const apiMethod = String(url).split('/').pop();
		const body = init?.body ? JSON.parse(init.body) : null;
		calls.push({ method: apiMethod, body });
		const handler = telegramHandlers[apiMethod];
		const mock = handler ? handler(body) : null;
		const payload = mock?.payload || mock || defaultTelegramPayload(apiMethod);
		return {
			ok: mock?.httpOk ?? true,
			status: mock?.status ?? 200,
			async json() {
				return payload;
			}
		};
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });

const handler = sandbox.__handler;
const env = {
	TOKEN: 'TESTTOKEN',
	BOT_TOKEN: '123456:fake',
	GROUP_ID: '-1001111111111',
	OWNER_IDS: '10001'
};

let pass = 0;
let fail = 0;

function assert(name, condition, detail = '') {
	if (condition) {
		pass += 1;
		console.log(`  OK ${name}`);
	} else {
		fail += 1;
		console.log(`  FAIL ${name}${detail ? ' - ' + detail : ''}`);
	}
}

function resetCalls() {
	calls.length = 0;
	setTelegramHandlers();
}

function lastSentText() {
	const sent = calls.filter((c) => c.method === 'sendMessage').at(-1);
	return String(sent?.body?.text || '');
}

function defaultTelegramPayload(apiMethod) {
	if (apiMethod === 'sendMessage') return { ok: true, result: { message_id: 999 } };
	if (apiMethod === 'getMe') return { ok: true, result: { id: 777000, username: 'LeaveGroupTestBot' } };
	return { ok: true, result: true };
}

async function sendUpdate(message) {
	const request = new Request('https://example.workers.dev/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: Date.now(), message })
	});
	const response = await handler.fetch(request, env, { waitUntil() {} });
	assert('webhook returns OK', response.status === 200 && await response.text() === 'OK');
}

function privateMessage(fromId, text) {
	return {
		message_id: 1,
		date: 1,
		text,
		chat: { id: fromId, type: 'private', first_name: 'Owner' },
		from: { id: fromId, is_bot: false, first_name: 'Owner' }
	};
}

function groupMessage(fromId, text) {
	return {
		message_id: 2,
		date: 1,
		text,
		chat: { id: -1002222222222, type: 'supergroup', title: 'Test Group' },
		from: { id: fromId, is_bot: false, first_name: 'Owner' }
	};
}

console.log('\n[1] owner private /leavegroup calls leaveChat');
resetCalls();
let membershipChecks = 0;
setTelegramHandlers({
	getChat: () => ({ ok: true, result: { title: 'Alpha Test Group', username: 'alpha_test_group' } }),
	getChatMember: () => {
		membershipChecks += 1;
		return {
			ok: true,
			result: { status: membershipChecks === 1 ? 'administrator' : 'left', user: { id: 777000, is_bot: true } }
		};
	},
	leaveChat: () => ({ ok: true, result: true })
});
await sendUpdate(privateMessage(10001, '/leavegroup -1002565053719'));
assert('leaveChat called once', calls.filter((c) => c.method === 'leaveChat').length === 1, JSON.stringify(calls));
assert('leaveChat uses target chat id', calls.some((c) => c.method === 'leaveChat' && c.body?.chat_id === '-1002565053719'));
assert('getChat runs before leaveChat', calls.findIndex((c) => c.method === 'getChat') > -1 && calls.findIndex((c) => c.method === 'getChat') < calls.findIndex((c) => c.method === 'leaveChat'));
assert('getChatMember checks before and after leaveChat', calls.filter((c) => c.method === 'getChatMember').length === 2, JSON.stringify(calls));
assert('success reply includes group title', lastSentText().includes('Alpha Test Group'), lastSentText());
assert('success reply includes group id', lastSentText().includes('-1002565053719'), lastSentText());
assert('success reply is confirmed', lastSentText().includes('已确认退出群组'), lastSentText());

console.log('\n[2] owner group /leavegroup never calls leaveChat');
resetCalls();
await sendUpdate(groupMessage(10001, '/leavegroup -1002565053719'));
assert('leaveChat not called in group', calls.every((c) => c.method !== 'leaveChat'), JSON.stringify(calls));
assert('getChat not called in group', calls.every((c) => c.method !== 'getChat'), JSON.stringify(calls));
assert('group command delete attempted', calls.some((c) => c.method === 'deleteMessage'));

console.log('\n[3] non-owner private /leavegroup is rejected');
resetCalls();
await sendUpdate(privateMessage(20002, '/leavegroup -1002565053719'));
assert('leaveChat not called for non-owner', calls.every((c) => c.method !== 'leaveChat'), JSON.stringify(calls));
assert('getChat not called for non-owner', calls.every((c) => c.method !== 'getChat'), JSON.stringify(calls));
assert('permission denied reply sent', calls.some((c) => c.method === 'sendMessage' && String(c.body?.text || '').includes('权限不足')));

console.log('\n[4] invalid chat id is rejected before leaveChat');
resetCalls();
await sendUpdate(privateMessage(10001, '/leavegroup 1397983659'));
assert('leaveChat not called for positive id', calls.every((c) => c.method !== 'leaveChat'), JSON.stringify(calls));
assert('getChat not called for positive id', calls.every((c) => c.method !== 'getChat'), JSON.stringify(calls));
assert('usage reply sent', calls.some((c) => c.method === 'sendMessage' && String(c.body?.text || '').includes('/leavegroup -1001234567890')));

console.log('\n[5] leaveChat failure is translated to Chinese');
resetCalls();
setTelegramHandlers({
	getChat: () => ({ ok: true, result: { title: 'Missing Test Group' } }),
	getChatMember: () => ({ ok: true, result: { status: 'administrator', user: { id: 777000, is_bot: true } } }),
	leaveChat: () => ({ ok: false, description: 'Bad Request: chat not found' })
});
await sendUpdate(privateMessage(10001, '/leavegroup -1002031471502'));
assert('failed leaveChat called once', calls.filter((c) => c.method === 'leaveChat').length === 1, JSON.stringify(calls));
assert('failure reply includes group title', lastSentText().includes('Missing Test Group'), lastSentText());
assert('failure reply includes group id', lastSentText().includes('-1002031471502'), lastSentText());
assert('failure reason is Chinese', lastSentText().includes('找不到该群组'), lastSentText());
assert('failure reply hides raw English error', !lastSentText().includes('Bad Request') && !lastSentText().includes('chat not found'), lastSentText());

console.log('\n[6] already-left group is not reported as newly exited');
resetCalls();
setTelegramHandlers({
	getChat: () => ({ ok: true, result: { title: 'Already Left Group' } }),
	getChatMember: () => ({ ok: true, result: { status: 'left', user: { id: 777000, is_bot: true } } })
});
await sendUpdate(privateMessage(10001, '/leavegroup -1003744258220'));
assert('leaveChat not called when bot already left', calls.every((c) => c.method !== 'leaveChat'), JSON.stringify(calls));
assert('already-left reply includes group title', lastSentText().includes('Already Left Group'), lastSentText());
assert('already-left reply says bot is not in group', lastSentText().includes('bot 已不在该群组'), lastSentText());
assert('already-left reply does not say confirmed exit', !lastSentText().includes('已确认退出群组'), lastSentText());

console.log('\n[7] post-check still in group blocks success reply');
resetCalls();
let stillInGroupChecks = 0;
setTelegramHandlers({
	getChat: () => ({ ok: true, result: { title: 'Still In Group' } }),
	getChatMember: () => {
		stillInGroupChecks += 1;
		return {
			ok: true,
			result: { status: stillInGroupChecks === 1 ? 'administrator' : 'member', user: { id: 777000, is_bot: true } }
		};
	},
	leaveChat: () => ({ ok: true, result: true })
});
await sendUpdate(privateMessage(10001, '/leavegroup -100315741565'));
assert('leaveChat called for still-in-group scenario', calls.filter((c) => c.method === 'leaveChat').length === 1, JSON.stringify(calls));
assert('still-in-group reply reports failure', lastSentText().includes('退出群组失败'), lastSentText());
assert('still-in-group reply does not say confirmed exit', !lastSentText().includes('已确认退出群组'), lastSentText());

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail > 0) {
	process.exitCode = 1;
}
