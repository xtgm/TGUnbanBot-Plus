// checklist（核对清单）消息检测离线测试 —— 方案甲。
// 范式同其余测试：vm 加载 _worker.js、Telegram API 全 mock、D1 用 node:sqlite。
// 运行：node test_ad_checklist.mjs
//
// 【缺口本体】checklist 是 Message 的独立字段（官方：「Message is a checklist」），
// 与 text / caption 互斥 → message.text 是 undefined → 早退闸门那六样
// （text/caption/转发/引用体/名片/媒体）全空 → 整条消息被整体丢弃。
// 与批次 A 的裸图片消息是同一个缺口模式：内容藏在检测链路没读的字段里。
// 所以本文件最要紧的是 [2] 那组端到端断言：清单消息必须真的走进检测。

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

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

// ---------- D1 兼容层（真实 SQLite，附 SQL 日志） ----------
function makeD1() {
	const db = new DatabaseSync(':memory:');
	const _sql = [];
	const normIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const k of Object.keys(row)) out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
		return out;
	};
	const exec = (sql, params = []) => {
		_sql.push(sql);
		const st = db.prepare(sql);
		const bound = params.map(normIn);
		const head = sql.trim().slice(0, 7).toUpperCase();
		if (head.startsWith('SELECT') || head.startsWith('PRAGMA')) {
			const rows = st.all(...bound).map(normOut);
			return { kind: 'rows', rows, results: rows };
		}
		const info = st.run(...bound);
		return { kind: 'run', meta: {}, results: [{ success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }] };
	};
	return {
		_sql,
		prepare(sql) {
			const stmtFor = (args) => ({
				all: async () => ({ results: exec(sql, args).rows || [], success: true }),
				first: async () => (exec(sql, args).rows || [])[0] ?? null,
				run: async () => exec(sql, args),
				bind: (...more) => stmtFor(more)
			});
			return stmtFor([]);
		},
		exec: async (sql) => { _sql.push(sql); db.exec(sql); return { results: [], success: true }; },
		batch: async (stmts) => Promise.all(stmts.map((st) => st.run())),
		query(sql, ...params) { _sql.push(sql); return db.prepare(sql).all(...params).map(normOut); }
	};
}

// ---------- 断言 ----------
let pass = 0, fail = 0;
const failures = [];
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

// ---------- Telegram Bot API mock ----------
const calls = [];
let apiHandlers = {};
function setApi(next = {}) { apiHandlers = next; }
function resetCalls() { calls.length = 0; setApi(); }
function countCalls(method) { return calls.filter((c) => c.method === method).length; }

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777000, is_bot: true, username: 'ChecklistTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 9000 + calls.length } };
		case 'getChat': return { ok: true, result: { id: body?.chat_id, first_name: '未知', bio: '' } };
		case 'getChatMember': return { ok: true, result: { status: 'member', user: { id: body?.user_id } } };
		case 'getChatAdministrators': return { ok: true, result: [] };
		default: return { ok: true, result: true };
	}
}

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
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
			async text() { return JSON.stringify(payload); },
			async arrayBuffer() { return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer; }
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

let pendingWaits = [];
async function sendUpdate(update, env) {
	const request = new Request('https://example.workers.dev/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...update })
	});
	return handler.fetch(request, env, { waitUntil(p) { pendingWaits.push(Promise.resolve(p).catch(() => {})); } });
}
function privateMessage(fromId, text) {
	return {
		message_id: 100 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000), text,
		chat: { id: fromId, type: 'private', first_name: 'Owner' },
		from: { id: fromId, is_bot: false, first_name: 'Owner' }
	};
}
function groupMessage(from, text, extra = {}) {
	return {
		message_id: 200 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000), text,
		chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
		from: { is_bot: false, ...from },
		...extra
	};
}
// checklist 消息：text / caption 都不设 —— 这正是缺口本体
// （checklist 与 text/caption 互斥，旧闸门六样全空会把它整体丢弃）。
function adChecklistMessage(from, tasks, title, extra = {}) {
	return groupMessage(from, undefined, {
		checklist: {
			title,
			tasks: tasks.map((text, i) => ({ id: i + 1, text, is_completed: false })),
			others_can_add_tasks: false,
			others_can_mark_tasks_as_done: true
		},
		...extra
	});
}
async function send(msg, env) { return sendUpdate({ message: msg }, env); }

const handler = W.__handler;
const bootEnv = makeEnv();
resetCalls();
await sendUpdate({ message: privateMessage(99999, 'hello') }, bootEnv);

// 主人 2026-10-07 发来的那条真实样本
const AD_TASKS = [
	'一手假钞假币包过验钞机',
	'可找妹 可嫖娼 无风险高细节',
	'可面交 可快递',
	'点击下方链接加入洗钱交流去年',
	'https://t.me/+zx2lNSHe1PZkZjE1',
	'https://t.me/+zx2lNSHe1PZkZjE1'
];
const AD_TITLE = '一手假钞假币包过验钞机可找妹嫖娼';

// ================= [1] extractAdChecklistText =================
section('[1] extractAdChecklistText 提取');
{
	const got = W.extractAdChecklistText(adChecklistMessage({ id: 1, first_name: 'x' }, AD_TASKS, AD_TITLE));
	assert('标题被提取', got.startsWith(AD_TITLE), JSON.stringify(got.slice(0, 60)));
	assert('6 个任务项全部被提取（换行分隔）', got.split('\n').length === 7, String(got.split('\n').length));
	assert('任务项文字完整保留', got.includes('点击下方链接加入洗钱交流去年') && got.includes('https://t.me/+zx2lNSHe1PZkZjE1'));
	assert('总字数 > 0（这些字此前一个都没被读到）', got.length > 100, String(got.length));

	// 边界
	assert('没有 checklist → 空串', W.extractAdChecklistText({}) === '');
	assert('null → 空串', W.extractAdChecklistText(null) === '');
	assert('空 title + 空 tasks → 空串',
		W.extractAdChecklistText({ checklist: { title: '', tasks: [] } }) === '');
	assert('tasks 不是数组 → 只取 title',
		W.extractAdChecklistText({ checklist: { title: 'T', tasks: 'bad' } }) === 'T');
	assert('任务项 text 为空 → 跳过不产生空行',
		W.extractAdChecklistText({ checklist: { title: 'T', tasks: [{ id: 1, text: '' }, { id: 2, text: 'X' }] } }) === 'T\nX',
		JSON.stringify(W.extractAdChecklistText({ checklist: { title: 'T', tasks: [{ id: 1, text: '' }, { id: 2, text: 'X' }] } })));
	assert('只有任务没有标题',
		W.extractAdChecklistText({ checklist: { title: '', tasks: [{ id: 1, text: 'A' }, { id: 2, text: 'B' }] } }) === 'A\nB');
}

// ================= [2] 早退闸门：清单消息进检测（缺口本体） =================
section('[2] 早退闸门：checklist 消息不再被整体丢弃');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();
	env.DB._sql.length = 0;

	// 旧闸门六样全空 → 第一道 return 就丢掉，连名册都不进
	await send(adChecklistMessage({ id: 606060, first_name: 'Melanie', is_bot: false }, AD_TASKS, AD_TITLE), env);

	const member = env.DB.query('SELECT user_id FROM ad_group_members WHERE user_id = ?', '606060');
	assert('checklist 消息走进了检测（发言者进了名册）', member.length === 1, JSON.stringify(member));
	assert('不是靠副作用碰巧进去的 —— 确实发起了判定流程',
		env.DB._sql.some((s) => /ad_user_screening|ad_group_members|moderation_messages/.test(s)),
		JSON.stringify(env.DB._sql.slice(0, 5)));
}

// ================= [3] 文字并入正文，四层都能看到 =================
section('[3] 清单文字并入 payload.text');
{
	// 源码级：text 的定义必须含 checklist 回退 —— 这一处同时打通早退闸门、
	// 三处 payload.text、指纹、AI 语义与四通道，不必逐处接线。
	assert('text 定义含 checklist 回退',
		src.includes('|| extractAdChecklistText(message);'), '');
	assert('getAdDetectionBodyText 也读 checklist',
		src.includes('extractAdChecklistText(message)\n\t].filter(Boolean).join') ||
		/extractAdChecklistText\(message\)[\s\S]{0,80}\]\.filter\(Boolean\)\.join/.test(src), '');

	// 行为：getAdDetectionBodyText 是多源拼接（转发体、引用体、名片都拼），
	// checklist 是另一个正文来源，拼进来是设计如此 —— 它不是短路入口。
	const msg = adChecklistMessage({ id: 1, first_name: 'x' }, AD_TASKS, AD_TITLE);
	const body = W.getAdDetectionBodyText(msg);
	assert('getAdDetectionBodyText 含标题', body.includes(AD_TITLE), JSON.stringify(body.slice(0, 50)));
	assert('getAdDetectionBodyText 含任务项', body.includes('洗钱交流'), JSON.stringify(body.slice(0, 120)));
	assert('普通消息不带 checklist 字样（没有就不凭空产生）',
		!W.getAdDetectionBodyText({ text: '今天天气不错' }).includes('checklist'), '');

	// 短路在 detectAdOnMessage 的 text 定义上。const 不挂 vm 全局，所以从源码里
	// 抠出那几行【原文】编译执行 —— 测的是真代码，不是复刻的等价表达式：
	// 谁把 || 改成 && 或删掉回退，这里立刻变红。
	const textDef = (src.match(/const text = String\(message\.text \?\? message\.caption \?\? ''\)\.trim\(\)[\s\S]{0,120}?extractAdChecklistText\(message\);/) || [])[0];
	assert('源码里抠得到 text 定义原文', !!textDef, '没匹配到');
	if (textDef) {
		const evalText = new Function('message', 'extractAdChecklistText', textDef + '\nreturn text;');
		assert('有 text → text 优先，checklist 不参与（与改动前逐字节一致）',
			evalText({ text: '这是普通正文', checklist: { title: '不该被读', tasks: [] } }, W.extractAdChecklistText) === '这是普通正文');
		assert('无 text → 回退到 checklist',
			evalText(adChecklistMessage({ id: 1 }, AD_TASKS, AD_TITLE), W.extractAdChecklistText).includes(AD_TITLE));
		assert('text 为空串 → 也回退（trim 后靠 || 接上）',
			evalText({ text: '   ', checklist: { title: 'T', tasks: [] } }, W.extractAdChecklistText) === 'T');
	}
}

// ================= [4] 判据：广告清单得分、正常清单不误伤 =================
section('[4] 判据 —— 广告清单得分，正常清单零误伤');
{
	const adText = W.extractAdChecklistText(adChecklistMessage({ id: 1, first_name: 'x' }, AD_TASKS, AD_TITLE));
	const adScore = W.scoreAdMessageText(adText, {});
	assert('广告清单得分为正（交易动词 × 业务关键词同现）', adScore.score > 0, JSON.stringify(adScore));
	assert('reason 里有同现那一行',
		adScore.reasons.some((r) => r.includes('交易动词 + 业务关键词同现')), JSON.stringify(adScore.reasons));

	// 反向：正常群主的清单不该被这套判据推高
	const normalText = W.extractAdChecklistText({
		checklist: { title: '本周任务清单', tasks: [{ id: 1, text: '写完周报' }, { id: 2, text: '更新文档' }, { id: 3, text: '代码评审' }] }
	});
	const normalScore = W.scoreAdMessageText(normalText, {});
	assert('正常清单不为正（反向断言：并入正文不引入新误封面）',
		normalScore.score <= 0, JSON.stringify(normalScore));

	const meeting = W.scoreAdMessageText(
		W.extractAdChecklistText({ checklist: { title: '团建安排', tasks: [{ id: 1, text: '周六下午两点集合' }, { id: 2, text: '记得带身份证' }] } }), {});
	assert('日常清单同样不为正', meeting.score <= 0, JSON.stringify(meeting));
}

// ================= [5] 空消息仍早退（零成本不变量不被破坏） =================
section('[5] 空消息仍早退 —— 不因这次改动放宽闸门');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();
	env.DB._sql.length = 0;
	// 纯空白消息：text 是空串、无 checklist → 照旧早退，不进名册
	await send(groupMessage({ id: 707070, first_name: '路人丙' }, '   '), env);
	const member = env.DB.query('SELECT user_id FROM ad_group_members WHERE user_id = ?', '707070');
	assert('空白消息仍被早退（没进名册）', member.length === 0, JSON.stringify(member));
	assert('空白消息零 getChat', countCalls('getChat') === 0, String(countCalls('getChat')));

	// checklist 字段存在但内容为空 → 同样早退（不因为「有字段」就放行）
	env.DB._sql.length = 0;
	await send(groupMessage({ id: 717171, first_name: '路人丁' }, undefined, { checklist: { title: '', tasks: [] } }), env);
	const member2 = env.DB.query('SELECT user_id FROM ad_group_members WHERE user_id = ?', '717171');
	assert('空 checklist 消息仍被早退', member2.length === 0, JSON.stringify(member2));
}

// ================= 收尾 =================
console.log('\n========================================');
if (fail) {
	console.log(`checklist 检测测试：通过 ${pass} / 失败 ${fail}`);
	for (const f of failures) console.log('  ✗ ' + f);
	process.exit(1);
}
console.log(`===== checklist 检测测试：通过 ${pass} / 失败 0 =====`);
