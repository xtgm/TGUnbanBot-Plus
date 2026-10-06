// 通知的「发起来源」一行（📍 发起）离线测试。
// 与 test_adfix.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_notify_origin.mjs
//
// 【为什么要有这组测试】2026-10-06 主人问「每次收到自助解封通知，但找不到
// 用户是走私聊解封还是在指定群聊解封」——根因是 notifyOwnerSelfUnban 与
// notifyOwnerBlacklistAppeal 的签名里根本没有 chat 参数。同时
// notifyOwnerBlacklistIntercept 与 notifyOwnerChatMemberAction 早就带着这行，
// 也就是说这是「同类通知里补漏」，不是新造。
//
// 覆盖四件事：
//   ① formatOriginLabel：私聊对象 / 群对象 / 裸正数 id / 裸负数 id / 空
//      —— 私聊那条是重点：拉群名的写法照搬到私聊会渲染成「群：张三 1630699369」
//   ② 为什么没有「发起人」行：三个 id 恒等（见 [2] 注释），死代码已删
//   ③ 两个通知函数端到端：文案里真的带了来源行、且不传 origin 时不显示
//   ④ 源码断言：三个调用点都把来源传进去了（漏传一个就是哑的）

import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');

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

function makeD1() {
	const db = new DatabaseSync(':memory:');
	const normIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const k of Object.keys(row)) out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
		return out;
	};
	const exec = (sql, params = []) => {
		const st = db.prepare(sql);
		const bound = params.map(normIn);
		const head = sql.trim().slice(0, 6).toUpperCase();
		if (head === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) {
			return { rows: st.all(...bound).map(normOut) };
		}
		const info = st.run(...bound);
		return { meta: { changes: info.changes } };
	};
	return {
		prepare(sql) {
			const stmtFor = (args) => ({
				all: async () => ({ results: exec(sql, args).rows || [], success: true }),
				first: async () => (exec(sql, args).rows || [])[0] ?? null,
				run: async () => exec(sql, args),
				bind: (...more) => stmtFor(more)
			});
			return stmtFor([]);
		},
		exec: async (sql) => { db.exec(sql); return { results: [], success: true }; },
		// 必须 await —— 不 await 会返回 Promise 数组，batch[i].results 为 undefined，
		// /adstats 前半段（指纹库/样本/白名单/头像计数）会静默读成 0：查库明明正常，
		// 看着却像产品缺陷。实际是 mock 少了 await。
		batch: async (stmts) => Promise.all(stmts.map((st) => st.run())),
		query(sql, ...params) { return db.prepare(sql).all(...params).map(normOut); },
		_raw: db
	};
}

let pass = 0, fail = 0;
const failures = [];
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

const calls = [];
let apiHandlers = {};
function setApi(next = {}) { apiHandlers = next; }
function resetCalls() { calls.length = 0; setApi(); }
function callsOf(method) { return calls.filter((c) => c.method === method); }
// 主人收到的全部文本（notifyAllOwners 走 sendMessage，chat_id 是 OWNER_IDS）
function ownerTexts() {
	return callsOf('sendMessage').map((c) => String(c.body?.text || ''));
}

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777001, is_bot: true, username: 'OriginTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 7000 + calls.length } };
		case 'getChat': return { ok: true, result: { id: body?.chat_id, title: '默认群名', first_name: '未知', bio: '' } };
		case 'getChatMember': return { ok: true, result: { status: 'member', user: { id: body?.user_id } } };
		case 'getChatAdministrators': return { ok: true, result: [] };
		default: return { ok: true, result: true };
	}
}

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	AbortController, AbortSignal,
	fetch: async (url, init) => {
		const raw = String(url);
		const method = raw.split('/').pop();
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
		calls.push({ method, body });
		const handler = apiHandlers[method];
		const mock = handler ? handler(body) : null;
		const payload = mock?.payload || mock || defaultPayload(method, body);
		return {
			ok: mock?.httpOk ?? true,
			status: mock?.status ?? 200,
			async json() { return payload; },
			async text() { return JSON.stringify(payload); }
		};
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });

const W = sandbox;
const GROUP_ID = '-1001111111111';
const OWNER_ID = 10001;
function makeEnv(extra = {}) {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID), DB: makeD1(), ...extra };
}

const handler = W.__handler;
const bootEnv = makeEnv();
resetCalls();
await handler.fetch(new Request('https://example.workers.dev/', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ update_id: 1, message: { message_id: 1, date: 1, text: '/start', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' } } })
}), bootEnv, { waitUntil() {} });

const USER = { id: 1630699369, first_name: 'xi xi', is_bot: false };
const ADMIN = { id: 888777, first_name: '管理员', is_bot: false };

// ================= [1] formatOriginLabel =================
section('[1] formatOriginLabel：私聊与群必须分得开');
{
	// 私聊对象 —— 重点：不能拉群名
	const priv = await W.formatOriginLabel({ id: 1630699369, type: 'private', first_name: 'xi xi' });
	assert('私聊对象 → 「私聊」，不含群名也不含 id',
		priv === '私聊', JSON.stringify(priv));

	// 群对象（带 title）
	const grp = await W.formatOriginLabel({ id: GROUP_ID, type: 'supergroup', title: '技术交流群' });
	assert('群对象 → 标题 + id', grp.includes('技术交流群') && grp.includes(GROUP_ID), JSON.stringify(grp));

	// 群对象（无 title）→ 拉一次 getChat 补
	resetCalls();
	setApi({ getChat: (b) => ({ payload: { ok: true, result: { id: b?.chat_id, title: '补出来的群名' } } }) });
	const noTitle = await W.formatOriginLabel({ id: GROUP_ID, type: 'supergroup' });
	assert('无 title 时补拉群名', noTitle.includes('补出来的群名'), JSON.stringify(noTitle));
	assert('补拉用的是 getChat 且 chat_id 正确',
		callsOf('getChat').length === 1 && String(callsOf('getChat')[0]?.body?.chat_id) === GROUP_ID,
		JSON.stringify(callsOf('getChat')));
	resetCalls();

	// 裸 id：正数 = 私聊、负数 = 群（blockSelfUnban 那条路径只拿到 chatId 字符串）
	assert('裸正数 id → 私聊', (await W.formatOriginLabel('1630699369')) === '私聊');
	assert('裸负数 id → 群（拉群名）',
		(await W.formatOriginLabel(GROUP_ID)).includes('默认群名'), String(await W.formatOriginLabel(GROUP_ID)));

	// 空值
	assert('空/null → 兜底未知', (await W.formatOriginLabel('')) === '<code>未知</code>'
		&& (await W.formatOriginLabel(null)) === '<code>未知</code>');
}

// ================= [2] 为什么没有「发起人」行 =================
section('[2] 发起人恒等于被处理对象（不加这行的原因）');
{
	// handleMessage 里 `const userId = message.from?.id`，而两个通知函数收到的
	// fromUser 也是 message.from —— 三者恒等。曾写过 formatOriginActor，实测在
	// 全部调用点下恒返回空串，已从源码删除：不给将来留死代码。
	assert('源码里没有 formatOriginActor（死代码已删）',
		!src.includes('function formatOriginActor'), '仍存在 function formatOriginActor');
	// 「👤 用户:」那行本身就说明了是谁点的，不需要第二行
	const lines = src.split('\r\n');
	const selfFn = lines.findIndex((l) => l.includes('async function notifyOwnerSelfUnban'));
	assert('自助解封通知仍带「👤 用户:」（这就是发起人）',
		selfFn > 0 && lines.slice(selfFn, selfFn + 40).some((l) => l.includes('👤 用户:')),
		JSON.stringify({ selfFn }));
}

// ================= [3] notifyOwnerSelfUnban 端到端 =================
section('[3] 自助解封通知带来源行');
{
	// 私聊发起（用户自己的场景）
	resetCalls();
	await W.notifyOwnerSelfUnban(USER, ['✅ 技术交流群：已解封，可重新加入。'],
		{ id: 1630699369, type: 'private', first_name: 'xi xi' });
	let text = ownerTexts().join('\n');
	assert('私聊发起显示 📍 发起：私聊', text.includes('📍 发起:私聊'), text);
	assert('私聊发起不显示成群名（不能是「群：」）', !text.includes('群:'), text);
	assert('本人发起不带发起人行', !text.includes('发起人:'), text);
	assert('原有内容仍在（用户/各群结果/回执命令）',
		text.includes('用户自助解封') && text.includes('各群解封结果') && text.includes('/ban 1630699369'), text);

	// 群里管理员代发
	resetCalls();
	setApi({ getChat: () => ({ payload: { ok: true, result: { id: GROUP_ID, title: '夜猫子交流群' } } }) });
	await W.notifyOwnerSelfUnban(USER, ['✅ 已解封。'], { id: GROUP_ID, type: 'supergroup', title: '夜猫子交流群' });
	text = ownerTexts().join('\n');
	assert('群发起显示群名与 id', text.includes('夜猫子交流群') && text.includes(GROUP_ID), text);
	assert('代发时不显示「发起人:」（该行恒空，死代码已删）',
		!text.includes('发起人:') && !text.includes('888777'), text);
	resetCalls();

	// 不传 origin：宁可少一行，也不显示编出来的「未知」
	await W.notifyOwnerSelfUnban(USER, ['✅ 已解封。']);
	text = ownerTexts().join('\n');
	assert('不传 origin → 没有来源行、也没有「未知」',
		!text.includes('📍 发起') && !text.includes('未知'), text);
}

// ================= [4] notifyOwnerBlacklistAppeal 端到端 =================
section('[4] 黑名单申诉通知带来源行');
{
	const blacklistInfo = {
		isBlacklisted: true,
		entry: { reason: 'ad_auto', by: 'system', at: '2026-10-06 15:00:00' }
	};

	resetCalls();
	await W.notifyOwnerBlacklistAppeal(USER, blacklistInfo, 'appeal', '1630699369');
	let text = ownerTexts().join('\n');
	assert('申诉（裸正数 id）→ 私聊', text.includes('📍 发起:私聊'), text);
	assert('申诉原有信息仍在（加黑方式/操作人/时间）',
		text.includes('黑名单用户申诉') && text.includes('加黑方式') && text.includes('加黑时间'), text);

	resetCalls();
	await W.notifyOwnerBlacklistAppeal(USER, blacklistInfo, 'start', { id: GROUP_ID, type: 'supergroup', title: '某群' });
	text = ownerTexts().join('\n');
	assert('打开 bot（群上下文）→ 群名', text.includes('📍 发起:') && text.includes('某群'), text);
	assert('start 案由标题仍是「打开了机器人」', text.includes('黑名单用户打开了机器人'), text);

	resetCalls();
	await W.notifyOwnerBlacklistAppeal(USER, blacklistInfo, 'appeal');
	text = ownerTexts().join('\n');
	assert('不传 origin → 无来源行', !text.includes('📍 发起'), text);
}

// ================= [5] 源码断言 =================
section('[5] 三个调用点都把来源传进去了');
{
	const lines = src.split('\r\n');
	const selfUnbanCall = lines.find((l) => l.includes('notifyOwnerSelfUnban(') && !l.includes('async function'));
	assert('自助解封调用点传了 message.chat',
		Boolean(selfUnbanCall) && selfUnbanCall.includes('message.chat'),
		String(selfUnbanCall));

	const appealCalls = lines.filter((l) => l.includes('notifyOwnerBlacklistAppeal(') && !l.includes('async function'));
	assert('申诉两个调用点都传了来源（共 2 处）', appealCalls.length === 2, JSON.stringify(appealCalls));
	assert('blockSelfUnban 那处传的是 chatId',
		appealCalls.some((l) => l.includes('chatId')), JSON.stringify(appealCalls));
	assert('/start 那处传的是 message.chat',
		appealCalls.some((l) => l.includes('message.chat')), JSON.stringify(appealCalls));

	// 同类通知确实带着这一行（范式来源）
	assert('intercept 仍带 📍 群：（范式没被改坏）',
		src.includes('`📍 群:${groupLabel}`') || src.includes("📍 群:${groupLabel}"));
	assert('chatMemberAction 仍带 📍 群：',
		src.includes('`📍 群:${groupLabel}\\n`') || src.includes('📍 群:${groupLabel}'));
}

console.log(`\n========== 通知发起来源：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
