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

	// 抓不到数字时把原样回显报错 —— 不静默当成 list 让人一脸问号
	resetCalls();
	await sendCommand('/wl nonsense', env);
	t = sendTextOf('sendMessage').join('\n');
	assert('无法识别时回显原样', /没从「nonsense」里识别出任何纯数字/.test(t), t.slice(0, 300));
	assert('提示写明添加与删除的写法', /123,321 123 321/.test(t) && /del/.test(t), t.slice(0, 300));
}

// ================= [1c] 不写 add、/del 独立指令 =================
section('[1c] 主人定的格式：/wl + TGID 添加、/del + TGID 删除');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const ids = () => env.DB.query('SELECT user_id FROM ad_user_whitelist ORDER BY user_id').map((r) => String(r.user_id));

	// 三种分隔写法，全都不写 add
	resetCalls();
	await sendCommand('/wl 501,502', env);
	assert('逗号连写 123,321', ids().join(',') === '501,502', JSON.stringify(ids()));
	resetCalls();
	await sendCommand('/wl 503 504', env);
	assert('空格分隔', ids().includes('503') && ids().includes('504'), JSON.stringify(ids()));
	resetCalls();
	await sendCommand('/wl 505, 506', env);
	assert('逗号+空格', ids().includes('505') && ids().includes('506'), JSON.stringify(ids()));

	// 主人给的示例原文「/wl 123,321 123 321」—— 重复 ID 去重后仍应完整
	resetCalls();
	await sendCommand('/wl 507,508 507 508', env);
	assert('示例原文里重复的 ID 去重后都在', ids().includes('507') && ids().includes('508'), JSON.stringify(ids()));
	assert('重复 ID 没写成多行', env.DB.query('SELECT * FROM ad_user_whitelist WHERE user_id = ?', '507').length === 1,
		JSON.stringify(env.DB.query('SELECT * FROM ad_user_whitelist WHERE user_id = ?', '507')));

	// /del 独立指令
	resetCalls();
	await sendCommand('/del 501,502 503', env);
	const afterDel = ids();
	assert('/del 一次删三个', !afterDel.some((id) => ['501', '502', '503'].includes(id)), JSON.stringify(afterDel));
	assert('/del 不误删其他', afterDel.includes('504') && afterDel.includes('508'), JSON.stringify(afterDel));

	// 末尾 del 也认（两种写法都通向同一条分支）
	resetCalls();
	await sendCommand('/wl 504 del', env);
	assert('末尾写 del 也算删除', !ids().includes('504'), JSON.stringify(ids()));

	// /del 不能抢走 /delword —— alternation 顺序错了的话，删词表功能当场失灵
	resetCalls();
	await sendCommand('/wl 999', env);
	await sendCommand('/delword 999', env);
	assert('/delword 不被 /del 抢走删白名单', ids().includes('999'), JSON.stringify(ids()));

	// 权限
	resetCalls();
	await sendCommand('/del 999', env, 777000);
	assert('非第一主人发 /del 被拒且未删任何行', ids().includes('999'), JSON.stringify(ids()));
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

// ================= [8] /wl 列表显示昵称与资料卡入口 =================
section('[8] /wl 列表：昵称与可点击的资料卡入口');
{
	// 起因：主人 2026-10-15 截图 —— 白名单 35 人全是「• 5740566746 2026-10-14」，
	// 一排纯数字看不出谁是谁。要的是「知道是谁」+「点得开资料卡」。
	//
	// 【一个必须避开的坑】不能一律套 tg://user?id= 链接：官方 ChatFullInfo.has_private_forwards
	// 写明，对方把「隐私和安全 → 转发消息」设为非「所有人」时，该链接只在与该用户本人的聊天里
	// 生效，别处退化成点不动的灰字。项目在 /blacklist 操作人那里已经实拍过这个问题。
	// 所以分三档、可靠性递减：有 username 走纯文本 @xxx（客户端自动识别，不受该设置约束）；
	// 只有名字才回落 tg://user 链接；两样都没有就只给 TGID，不生成死链接。
	const env = makeEnv();
	await W.adDetectionReady(env);
	const now = Math.floor(Date.now() / 1000);
	const seedMember = (uid, first, last, uname) => env.DB.prepare(
		'INSERT INTO ad_group_members (user_id, chat_id, first_name, last_name, username, first_seen, last_seen, bio_checked_at) '
		+ 'VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
	).bind(String(uid), GROUP_ID, first, last, uname, now, now).run();
	// 名册里两个人：A 有 username、B 只有名字；C 名册里完全没有
	await seedMember(5001, '张三', '', 'zhangsan_wl');
	await seedMember(5002, '李四', '', '');
	for (const id of ['5001', '5002', '5003']) {
		await W.addAdUserWhitelist(env, id, String(OWNER_ID), '/wl 手动添加');
	}

	// C 不在名册 → 走配置群点名。mock 成「在群里点到了他」
	// 【setApi 必须在 resetCalls 之后】resetCalls 内部会调 setApi() 把 handler 清空，
	// 写反了自定义 mock 会被静默丢掉，表现是「点名没生效」，与实现出错长得一样。
	resetCalls();
	setApi({
		getChatMember: (body) => String(body?.user_id) === '5003'
			? { ok: true, result: { status: 'member', user: { id: 5003, first_name: '王五', username: 'wangwu_wl' } } }
			: { ok: true, result: { status: 'member', user: { id: body?.user_id } } }
	});
	await sendCommand('/wl', env);
	const text = sendTextOf('sendMessage').join('\n');

	assert('★ 有 username 的走纯文本 @username（一定点得动）',
		text.includes('@zhangsan_wl'), text.slice(0, 400));
	assert('★ 有 username 的不再套 tg://user 链接（那种可能点不动）',
		!/tg:\/\/user\?id=5001/.test(text), text.slice(0, 400));
	assert('★ 昵称与用户名并排显示（看名字认人，点用户名进资料卡）',
		text.includes('张三') && text.includes('@zhangsan_wl'), text.slice(0, 400));
	assert('★ 无 username 的回落 tg://user 链接且链接文字就是昵称',
		/<a href="tg:\/\/user\?id=5002">李四<\/a>/.test(text), text.slice(0, 400));

	assert('★ 名册里没有的去配置群点名补上昵称',
		text.includes('@wangwu_wl'), text.slice(0, 400));
	const filled = env.DB.query("SELECT first_name, username FROM ad_group_members WHERE user_id = '5003'");
	assert('★ 点到的结果写回名册（下次零成本）',
		filled.length === 1 && String(filled[0].username) === 'wangwu_wl', JSON.stringify(filled));

	const looked = callsOf('getChatMember')
		.map((c) => String(c.body?.user_id || ''))
		.filter((id) => ['5001', '5002', '5003'].includes(id));
	assert('★ 名册里已有的两个人一个 getChatMember 都不发（走零成本路径）',
		looked.includes('5003') && !looked.includes('5001') && !looked.includes('5002'),
		JSON.stringify(looked));

	assert('★ TGID 仍逐条给出（要能复制去 /check、/unban）',
		['5001', '5002', '5003'].every((id) => text.includes(id)), text.slice(0, 400));

	// 补进名册的人按【老数据档】处理：first_seen = 0。
	// adRescanTierSeconds 对 first_seen 为 0 的约定是「走最老一档（3 天）」——
	// 补一个 first_seen = now 会让 cron 把这批人当成刚进群的新号，按 2 小时一次高频重扫。
	const filledRow = env.DB.query("SELECT first_seen, bio_checked_at FROM ad_group_members WHERE user_id = '5003'");
	assert('★ 补进名册走老数据档（first_seen=0，不当新人高频重扫）',
		Number(filledRow[0]?.first_seen) === 0, JSON.stringify(filledRow));

	// 第二次 /wl：名册已经补齐，一个 getChatMember 都不该再发。
	// 这条同时是「写回名册」这个设计的收益断言 —— 少了它，写回名册就成了纯副作用。
	resetCalls();
	await sendCommand('/wl', env);
	const looked2 = callsOf('getChatMember').filter((c) => ['5001', '5002', '5003'].includes(String(c.body?.user_id || '')));
	assert('★ 第二次 /wl 零 API 调用（走名册）', looked2.length === 0, JSON.stringify(looked2.map((c) => c.body?.user_id)));

	// 谁都没查到：只给 TGID，不生成点不动的死链接
	const env2 = makeEnv();
	await W.adDetectionReady(env2);
	await W.addAdUserWhitelist(env2, '6001', String(OWNER_ID), '/wl 手动添加');
	resetCalls();
	setApi({
		getChatMember: () => ({ ok: false, error_code: 400, description: 'Bad Request: user not found' })
	});
	await sendCommand('/wl', env2);
	const text2 = sendTextOf('sendMessage').join('\n');
	assert('★ 查不到时只给 TGID，不生成死链接',
		text2.includes('6001') && !/tg:\/\/user\?id=6001/.test(text2), text2.slice(0, 300));

	// 只有壳没有名字的回包不算查到 —— getChatMember 对不存在的用户也可能回一个只有 id 的 user，
	// 拿它写回名册等于把「没查到」记成「查到了」，还会在屏上渲染出一个点不开的空链接。
	const env3 = makeEnv();
	await W.adDetectionReady(env3);
	await W.addAdUserWhitelist(env3, '7001', String(OWNER_ID), '/wl 手动添加');
	resetCalls();
	setApi({ getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }) });
	await sendCommand('/wl', env3);
	const wrote = env3.DB.query("SELECT * FROM ad_group_members WHERE user_id = '7001'");
	assert('★ 只有 id 没有名字的回包不写回名册', wrote.length === 0, JSON.stringify(wrote));
}

// ================= 汇总 =================
console.log(`\n========== ${pass} 通过 / ${fail} 失败 ==========`);
if (failures.length) console.log('失败项：\n  - ' + failures.join('\n  - '));
process.exit(fail ? 1 : 0);
