// 用户白名单离线测试。与 test_adfix.mjs 同范式：vm 加载 _worker.js、
// Telegram API 全 mock、D1 用 node:sqlite 真实 SQLite 后端。运行：node test_whitelist.mjs
//
// 覆盖七件事：
//   ① ad_user_whitelist 表建出来了，/wl add / del / list 三个动作
//   ② 三道豁免闸：消息检测、入群筛查、封禁执行口
//      —— ②是本功能的本体：白名单用户连一条判定都不该跑，更不该有封禁调用
//   ③ 封禁回执上的「➕ 加入白名单」按钮（构造 + 回调 data）
//   ④ 回调 wl 分支真的写表、真的解封、真的原地补行
//   ⑤ 鉴权：非第一主人点按钮、发 /wl 一律拒绝且一个字段都不许动
//   ⑥ 缓存即时失效 —— 加完名单下一条消息立刻生效，不等 60 秒 TTL
//   ⑦ 分发分支在 handleAdCallbackQuery 里是活的（防 wl 分支成死代码）

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

// ---------- D1 兼容层（真实 SQLite）----------
function makeD1() {
	const db = new DatabaseSync(':memory:');
	const sqlLog = [];
	const normIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const k of Object.keys(row)) out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
		return out;
	};
	const exec = (sql, params = []) => {
		sqlLog.push(String(sql).replace(/\s+/g, ' ').trim());
		const st = db.prepare(sql);
		const bound = params.map(normIn);
		const head = sql.trim().slice(0, 6).toUpperCase();
		if (head === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) {
			return { kind: 'rows', rows: st.all(...bound).map(normOut) };
		}
		const info = st.run(...bound);
		const meta = { changes: info.changes, last_row_id: info.lastInsertRowid };
		return { kind: 'run', success: true, meta, results: [{ success: true, meta }] };
	};
	const api = {
		prepare(sql) {
			const stmtFor = (args) => ({
				all: async () => ({ results: exec(sql, args).rows || [], success: true }),
				first: async () => (exec(sql, args).rows || [])[0] ?? null,
				run: async () => exec(sql, args),
				bind: (...more) => stmtFor(more)
			});
			return stmtFor([]);
		},
		exec: async (sql) => { db.exec(sql); sqlLog.push(String(sql).replace(/\s+/g, ' ').trim()); return { results: [], success: true }; },
		batch: async (stmts) => Promise.all(stmts.map((st) => st.run())),
		query(sql, ...params) { return db.prepare(sql).all(...params).map(normOut); },
		_sql: sqlLog,
		_raw: db
	};
	return api;
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
function callsOf(method) { return calls.filter((c) => c.method === method); }
function sendTextOf(method) {
	return callsOf(method).map((c) => String(c.body?.text || c.body?.message || ''));
}

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777001, is_bot: true, username: 'WlTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 8000 + calls.length } };
		case 'editMessageText': return { ok: true, result: { message_id: 777 } };
		case 'answerCallbackQuery': return { ok: true, result: true };
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
const STRANGER_ID = 20002;

function makeEnv(extra = {}) {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID), DB: makeD1(), ...extra };
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
async function sendUpdate(update, env) {
	return W.__handler.fetch(new Request('https://example.workers.dev/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(update)
	}), env);
}
async function send(msg, env) { return sendUpdate({ message: msg }, env); }
async function sendCommand(text, env, fromId = OWNER_ID, type = 'private') {
	return send(type === 'private' ? privateMessage(fromId, text) : groupMessage({ id: fromId, first_name: 'Owner' }, text), env);
}

// 一条已被 test_ad_detection.mjs 755 行验证过「触发全群封禁」的广告文案 ——
// 自己编的文案看着像广告但未必过得了分数线，对照组就白测了。
const AD_TEXT = '📢 高价收网赚号 长期收购账号 加微信联系';

const handler = W.__handler;
const bootEnv = makeEnv();
resetCalls();
await send(privateMessage(99999, 'hello'), bootEnv);

// ================= [1] 表结构与 /wl 三个动作 =================
section('[1] ad_user_whitelist 表与 /wl add / del / list');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const hasTable = env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ad_user_whitelist'");
	assert('ad_user_whitelist 表已建出', hasTable.length === 1, JSON.stringify(hasTable));

	resetCalls();
	await sendCommand('/wl', env);
	let text = sendTextOf('sendMessage').join('\n');
	assert('/wl 空名单回「白名单为空」', /白名单为空/.test(text), text.slice(0, 200));

	resetCalls();
	await sendCommand('/wl add ' + STRANGER_ID, env);
	text = sendTextOf('sendMessage').join('\n');
	const rows = env.DB.query('SELECT * FROM ad_user_whitelist');
	assert('/wl add 写入一行', rows.length === 1 && String(rows[0].user_id) === String(STRANGER_ID), JSON.stringify(rows));
	assert('/wl add 回执写明「以后不判」', /入群不查、发消息不判/.test(text), text.slice(0, 200));
	assert('/wl add 提醒白名单只挡以后', /只挡【以后】/.test(text), text.slice(0, 200));

	resetCalls();
	await sendCommand('/wl', env);
	text = sendTextOf('sendMessage').join('\n');
	assert('/wl 列出含该 TGID', text.includes(String(STRANGER_ID)), text.slice(0, 200));

	resetCalls();
	await sendCommand('/wl add 不是数字', env);
	text = sendTextOf('sendMessage').join('\n');
	assert('纯文字无数字时提示识别不出数字', /识别出任何纯数字/.test(text), text.slice(0, 300));
	assert('提示里回显无法识别的原样', /不是数字/.test(text), text.slice(0, 300));
	assert('非法输入未写库', env.DB.query('SELECT * FROM ad_user_whitelist').length === 1);

	resetCalls();
	await sendCommand('/wl del ' + STRANGER_ID, env);
	assert('/wl del 删掉那一行', env.DB.query('SELECT * FROM ad_user_whitelist').length === 0);
	text = sendTextOf('sendMessage').join('\n');
	assert('/wl del 回执写明恢复检测', /移除后恢复检测/.test(text), text.slice(0, 200));
}

// ================= [1b] 批量 add / del =================
section('[1b] 批量：空格 / 中英文逗号 / 分号 / 大小写');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const ids = () => env.DB.query('SELECT user_id FROM ad_user_whitelist ORDER BY user_id').map((r) => String(r.user_id));

	resetCalls();
	await sendCommand('/wl add 111 222 333', env);
	assert('空格分隔一次加三个', ids().join(',') === '111,222,333', JSON.stringify(ids()));
	let t = sendTextOf('sendMessage').join('\n');
	assert('批量回执写明数量', /加入白名单 <b>3<\/b> 人/.test(t), t.slice(0, 200));
	assert('批量回执逐个列出 TGID', t.includes('111') && t.includes('333'), t.slice(0, 200));

	// 中文逗号、英文逗号、分号混着写
	resetCalls();
	await sendCommand('/wl add 444,555，666;777', env);
	assert('中英文逗号与分号都认', ids().length === 7, JSON.stringify(ids()));

	// 多余分隔符不该凭空造出空项
	resetCalls();
	await sendCommand('/wl add 888,, 999', env);
	assert('多余分隔符不造出空项', ids().length === 9, JSON.stringify(ids()));

	// 混入文字：能认的照加，认不出的报出来，不整批失败
	resetCalls();
	await sendCommand('/wl add 1010 abc1111', env);
	const mixed = ids();
	assert('混入文字时数字照加', mixed.includes('1010') && mixed.includes('1111'), JSON.stringify(mixed));
	assert('文字没有被当成 TGID 写库', mixed.every((id) => /^\d+$/.test(id)), JSON.stringify(mixed));
	t = sendTextOf('sendMessage').join('\n');
	assert('混入时回执写明加了几个', /加入白名单 <b>2<\/b> 人/.test(t), t.slice(0, 200));

	// 批量 del
	resetCalls();
	await sendCommand('/wl del 111,222 333', env);
	const afterDel = ids();
	assert('批量 del 一次删三个', !afterDel.some((id) => ['111', '222', '333'].includes(id)), JSON.stringify(afterDel));
	assert('批量 del 不误删其他', afterDel.includes('444') && afterDel.includes('888'), JSON.stringify(afterDel));

	// 指令与动作大小写混杂也认得（AD_COMMAND_RE 带 i 标志）
	resetCalls();
	await sendCommand('/WL ADD 1212', env);
	assert('指令与动作大小写混杂也认得', ids().includes('1212'), JSON.stringify(ids()));

	// 用法提示要提批量 —— 不然主人只会单个加
	resetCalls();
	await sendCommand('/wl nonsense', env);
	t = sendTextOf('sendMessage').join('\n');
	assert('用法提示写明批量分隔符', /空格、逗号、分号/.test(t), t.slice(0, 200));
}

// ================= [2] 三道豁免闸 =================
section('[2] 三道闸：消息检测 / 入群筛查 / 封禁执行口');
{
	// 2.1 对照组：不加白名单，这条广告必须真的被判、真的调封禁
	const envPlain = makeEnv();
	await W.adDetectionReady(envPlain);
	resetCalls();
	await send(groupMessage({ id: 30001, first_name: '路人甲' }, AD_TEXT), envPlain);
	const bannedPlain = callsOf('banChatMember').length;
	assert('对照组：非白名单广告消息触发封禁', bannedPlain > 0, 'banChatMember=' + bannedPlain);

	// 2.2 同一条消息、同一个人，加进白名单后零封禁
	const envWl = makeEnv();
	await W.adDetectionReady(envWl);
	await W.addAdUserWhitelist(envWl, 30002, OWNER_ID, '测试');
	resetCalls();
	await send(groupMessage({ id: 30002, first_name: '白名单用户' }, AD_TEXT), envWl);
	const bannedWl = callsOf('banChatMember').length;
	assert('白名单用户发同款广告：零 banChatMember 调用', bannedWl === 0, 'banChatMember=' + bannedWl);

	// 2.3 判定链路本身也整条不进（不写观察、不推快照）
	// 断言查 SQL 日志而不是 SELECT：白名单生效时这些懒建表【根本不会被建出来】，
	// 直接 SELECT 会抛 no such table，等于拿「表不存在」冒充「零写入」。
	const writeSqlOf = (db, table) => (db._sql || [])
		.filter((s) => /^(INSERT|UPDATE|DELETE)/i.test(s) && s.includes(table));
	assert('白名单用户不写观察记录', writeSqlOf(envWl.DB, 'ad_user_screening').length === 0,
		JSON.stringify(writeSqlOf(envWl.DB, 'ad_user_screening')));
	assert('白名单用户不推快照', writeSqlOf(envWl.DB, 'ad_pending_snapshots').length === 0,
		JSON.stringify(writeSqlOf(envWl.DB, 'ad_pending_snapshots')));
	// ad_images 是懒建表，adDetectionReady 会把它 CREATE 出来 —— 那是建表不是判定动作，
	// 必须排除，否则断言把「初始化」也算成「读写了图片库」。
	const imgSql = (envWl.DB._sql || []).filter((s) => s.includes('ad_images') && !/^CREATE/i.test(s));
	assert('白名单用户不读不写图片库', imgSql.length === 0, JSON.stringify(imgSql));

	// 2.4 入群筛查
	const envJoin = makeEnv();
	await W.adDetectionReady(envJoin);
	await W.addAdUserWhitelist(envJoin, 30003, OWNER_ID, '测试');
	const joined = await W.screenAdJoinMember(envJoin, { id: 30003, is_bot: false, first_name: '白名单' }, { chatId: GROUP_ID });
	assert('入群筛查返回 whitelisted', joined === 'whitelisted', String(joined));
	assert('入群筛查零落库', writeSqlOf(envJoin.DB, 'ad_join_checks').length === 0,
		JSON.stringify(writeSqlOf(envJoin.DB, 'ad_join_checks')));

	// 2.5 封禁执行口兜底：同款连带 / 手动确认那几条绕过前两个入口的路
	const envEnf = makeEnv();
	await W.adDetectionReady(envEnf);
	await W.addAdUserWhitelist(envEnf, 30004, OWNER_ID, '测试');
	const res = await W.enforceAdDetection(envEnf,
		{ userId: '30004', chatId: GROUP_ID, chatTitle: '测试治理群', messageId: 1 },
		{ verdict: 'ban', score: 99, layer: 'fingerprint', reasons: ['硬命中'], threshold: 7, snapshot: {} },
		{ force: true });
	assert('封禁执行口对白名单返回 banned:false', res.banned === false, JSON.stringify(res));
	assert('封禁执行口回执 reason=whitelisted', res.reason === 'whitelisted', JSON.stringify(res));
	const bl = envEnf.DB.query('SELECT * FROM blacklist');
	assert('封禁执行口零拉黑', bl.length === 0, JSON.stringify(bl));

	// 2.6 非白名单照样能封（证明 2.2~2.5 不是「全局不封了」）
	const envKeep = makeEnv();
	await W.adDetectionReady(envKeep);
	const resKeep = await W.enforceAdDetection(envKeep,
		{ userId: '30005', chatId: GROUP_ID, chatTitle: '测试治理群', messageId: 1 },
		{ verdict: 'ban', score: 9, layer: 'fingerprint', reasons: ['硬命中'], threshold: 7, snapshot: {} },
		{ force: true });
	assert('非白名单仍走正常封禁', resKeep.banned === true, JSON.stringify(resKeep));
}

// ================= [3] 封禁回执上的白名单按钮 =================
section('[3] buildAdNoticeKeyboard 三档按钮');
{
	const kb = W.buildAdNoticeKeyboard(123, 45678);
	const rows = kb?.inline_keyboard || [];
	assert('带 seq 时三行按钮', rows.length === 3, JSON.stringify(rows));
	const flat = rows.flat();
	const wlBtn = flat.find((b) => /白名单/.test(b.text));
	assert('存在白名单按钮', Boolean(wlBtn), JSON.stringify(flat));
	assert('白名单按钮文案写明永不检测', wlBtn && /永不检测/.test(wlBtn.text), wlBtn?.text);
	assert('白名单按钮 callback_data 是 adfix:wl:<uid>', wlBtn?.callback_data === 'adfix:wl:45678', wlBtn?.callback_data);

	const noSeq = W.buildAdNoticeKeyboard(null, 45678);
	const noSeqFlat = (noSeq?.inline_keyboard || []).flat();
	assert('无 seq 也保留白名单按钮', noSeqFlat.some((b) => b.callback_data === 'adfix:wl:45678'), JSON.stringify(noSeqFlat));
	assert('无 seq 仍不挂回滚按钮', !noSeqFlat.some((b) => /回滚/.test(b.text)), JSON.stringify(noSeqFlat));

	assert('坏 uid 不挂任何按钮', W.buildAdNoticeKeyboard(1, 'abc') === null);
}

// ================= [4] 回调 wl 分支 =================
section('[4] 回调 wl 分支：写表 + 解封 + 原地补行');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	// 造一条已封记录，证明 wl 分支真的把人放出来了
	env.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)')
		.bind('50001', '广告', 'system', new Date().toISOString(), '测试').run();
	env.DB.prepare('INSERT INTO dynamic_groups (chat_id, title, added_by, added_at) VALUES (?, ?, ?, ?)')
		.bind(GROUP_ID, '测试治理群', OWNER_ID, new Date().toISOString()).run();

	setApi({ unbanChatMember: () => ({ ok: true, result: true }) });
	resetCalls();
	const cb = {
		id: 'CB1',
		from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' },
		data: 'adfix:wl:50001',
		message: { message_id: 900, chat: { id: OWNER_ID, type: 'private' }, text: '封禁回执原文' }
	};
	await W.handleAdCallbackQuery(cb, env);

	const rows = env.DB.query('SELECT * FROM ad_user_whitelist');
	assert('wl 回调写入白名单', rows.length === 1 && String(rows[0].user_id) === '50001', JSON.stringify(rows));
	assert('wl 回调把人从黑名单移出', env.DB.query('SELECT * FROM blacklist').length === 0);
	assert('wl 回调真的调了 unbanChatMember', callsOf('unbanChatMember').length > 0, 'calls=' + callsOf('unbanChatMember').length);

	const edited = sendTextOf('editMessageText').join('\n');
	assert('回执原地补行写明白名单', /已加入白名单/.test(edited), edited.slice(0, 300));
	assert('回执同时写了已解封', /已解封/.test(edited), edited.slice(0, 300));
	assert('补行说明含三道豁免语义', /入群不查、发消息不判、封禁一律拒绝/.test(edited), edited.slice(0, 300));

	const ack = callsOf('answerCallbackQuery');
	assert('回调只回执一次（不重复 answerCallbackQuery）', ack.length === 1, 'count=' + ack.length);
	assert('回执文案带上白名单', /已加入白名单/.test(String(ack[0]?.body?.text || '')), JSON.stringify(ack[0]?.body));
}

// ================= [5] 鉴权 =================
section('[5] 鉴权：非第一主人点不动、用不了');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	env.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)')
		.bind('60001', '广告', 'system', new Date().toISOString(), '测试').run();

	resetCalls();
	await W.handleAdCallbackQuery({
		id: 'CB2',
		from: { id: 777000, is_bot: false, first_name: '路人' },
		data: 'adfix:wl:60001',
		message: { message_id: 901, chat: { id: 777000, type: 'private' }, text: '封禁回执原文' }
	}, env);
	assert('非第一主人点白名单按钮被拒', env.DB.query('SELECT * FROM ad_user_whitelist').length === 0);
	assert('非第一主人未把人放出来', env.DB.query('SELECT * FROM blacklist').length === 1);
	assert('非第一主人未调 unbanChatMember', callsOf('unbanChatMember').length === 0);
	const ack = callsOf('answerCallbackQuery');
	assert('被拒时有错误回执', ack.some((c) => c.body?.show_alert === true || /第一主人/.test(String(c.body?.text || ''))), JSON.stringify(ack));

	resetCalls();
	await sendCommand('/wl add 60001', env, 777000);
	assert('非第一主人发 /wl 被拒且未写库', env.DB.query('SELECT * FROM ad_user_whitelist').length === 0);
	const text = sendTextOf('sendMessage').join('\n');
	assert('/wl 权限提示写明仅第一主人', /仅限第一主人/.test(text), text.slice(0, 200));
}

// ================= [6] 缓存即时失效 =================
section('[6] 缓存即时失效：加完立刻生效');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	// 先让缓存热起来（读一次空名单）
	const before = await W.isAdUserWhitelisted(env, 70001);
	assert('加名单前不在白名单', before === false, String(before));

	await W.addAdUserWhitelist(env, 70001, OWNER_ID, '测试');
	const after = await W.isAdUserWhitelisted(env, 70001);
	assert('加完立刻生效（缓存已失效重读）', after === true, String(after));

	await W.removeAdUserWhitelist(env, 70001);
	const gone = await W.isAdUserWhitelisted(env, 70001);
	assert('移除后立刻失效', gone === false, String(gone));

	// 特权用户本身就豁免，与表无关
	assert('第一主人天然在白名单口径内', await W.isAdUserWhitelisted(env, OWNER_ID) === true);
	assert('非数字 id 不会误判成白名单', await W.isAdUserWhitelisted(env, 'not-a-number') === false);
}

// ================= [7] 分发分支是活的 =================
section('[7] handleAdCallbackQuery 认得 wl 分支');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	// 用一个不存在的序号走 ig 分支证明分发存在；wl 用坏 uid 触发「挂不上按钮」的边界
	resetCalls();
	await W.handleAdCallbackQuery({
		id: 'CB3',
		from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' },
		data: 'adfix:wl:80002',
		message: { message_id: 902, chat: { id: OWNER_ID, type: 'private' }, text: '封禁回执原文' }
	}, env);
	// 目标不在黑名单 → 走到解封前置校验，白名单已经写进去了
	const rows = env.DB.query('SELECT * FROM ad_user_whitelist');
	assert('目标不在黑名单时白名单照写', rows.length === 1 && String(rows[0].user_id) === '80002', JSON.stringify(rows));

	resetCalls();
	await W.handleAdCallbackQuery({
		id: 'CB4',
		from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' },
		data: 'adfix:wz:80003',
		message: { message_id: 903, chat: { id: OWNER_ID, type: 'private' }, text: 'x' }
	}, env);
	assert('未知 action 不写白名单', env.DB.query('SELECT * FROM ad_user_whitelist').length === 1);
	assert('未知 action 只回执不编辑消息', callsOf('editMessageText').length === 0);
}

// ================= 汇总 =================
console.log(`\n========== ${pass} 通过 / ${fail} 失败 ==========`);
if (failures.length) console.log('失败项：\n  - ' + failures.join('\n  - '));
process.exit(fail ? 1 : 0);
