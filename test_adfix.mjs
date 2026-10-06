// 封禁回执两个纠错按钮（↩️ 误判回滚 / 🔓 解封判定维持）离线测试。
// 与 test_dryrun.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_adfix.mjs
//
// 覆盖六件事：
//   ① buildAdNoticeKeyboard 的构造（有 seq 两档、无 seq 只留解封、坏 uid 不挂）
//   ② 封禁回执端到端真的带着按钮推出来
//   ③ 回调鉴权与非法 data（非第一主人一个字段都不许动）
//   ④ ↩️ 误判 = 完整回滚：解黑 + 解封 + 指纹/形状/AI 样本 purge + 删快照
//   ⑤ 🔓 解封（判定维持）= 只动限制：解黑 + 解封，判据库五张表零变化
//      —— ④⑤ 是同一份封禁的对照，两档语义的分界就钉在这条断言上
//   ⑥ 分发分支在 handleAdCallbackQuery 里是活的（防按钮成死代码）

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

// ---------- D1 兼容层（真实 SQLite，额外记录每条 SQL 供热路径断言）----------
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
		// 必须 await —— 不 await 会返回 Promise 数组，batch[i].results 为 undefined，
		// /adstats 前半段（指纹库/样本/白名单/头像计数）会静默读成 0：查库明明正常，
		// 看着却像产品缺陷。实际是 mock 少了 await。
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

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777001, is_bot: true, username: 'AdfixTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 7000 + calls.length } };
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
const PRIVATE_CHAT = String(OWNER_ID);

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

const AD_BIO = '专业收号 秒结 秒到账';

// 封一个号并拿回封禁产生的 seq（快照序号）
async function banOne(env, userId, name) {
	const config = await W.loadAdDetectionConfig(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	const evaluation = await W.evaluateAdSuspect(
		env, { profile: { bio: AD_BIO, firstName: name, username: '', bioFetched: true }, text: '', forwardChat: null },
		{ config, whitelist, skipMissingBioPenalty: false });
	const result = await W.enforceAdDetection(env,
		{ userId, chatId: GROUP_ID, chatTitle: '测试群', messageId: 900 },
		Object.assign({}, evaluation, { verdict: 'ban' }), { config, whitelist });
	return { result, seq: result?.seq ?? null };
}
function ledger(env) {
	// 快照是软删除（deleteAdPendingSnapshot 把 expires_at 置 0，行不删），
	// 所以这里数的是【活跃快照】= /pending 与回滚真正认得的那些，口径与
	// readAdPendingSnapshot 的 `expires_at > now` 一致。
	const now = Math.floor(Date.now() / 1000);
	return {
		black: env.DB.query('SELECT COUNT(*) AS c FROM blacklist')[0].c,
		fp: env.DB.query('SELECT COUNT(*) AS c FROM ad_fingerprints')[0].c,
		shape: env.DB.query('SELECT COUNT(*) AS c FROM ad_profile_shapes')[0].c,
		sample: env.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c,
		snap: env.DB.query('SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE expires_at > ?', now)[0].c
	};
}
const cbOf = (fromId, data, text = '封禁回执原文') => ({
	id: 'cbq_' + data, data,
	from: { id: fromId, is_bot: false, first_name: 'X' },
	message: { message_id: 888, chat: { id: PRIVATE_CHAT, type: 'private', first_name: 'Owner' }, text }
});

// ================= [1] 按钮构造 =================
section('[1] buildAdNoticeKeyboard 构造');
{
	const both = W.buildAdNoticeKeyboard(12, '555001');
	const rows = both?.inline_keyboard || [];
	assert('有 seq 时给两行两个按钮', rows.length === 2 && rows[0].length === 1 && rows[1].length === 1,
		JSON.stringify(both));
	assert('第一行是误判回滚、第二行是解封',
		rows[0][0].text.includes('误判') && rows[1][0].text.includes('解封'), JSON.stringify(rows));
	assert('callback_data 形如 adfix:ig:<seq> / adfix:ub:<uid>',
		rows[0][0].callback_data === 'adfix:ig:12' && rows[1][0].callback_data === 'adfix:ub:555001',
		JSON.stringify(rows));

	const noSeq = W.buildAdNoticeKeyboard(null, '555001')?.inline_keyboard || [];
	assert('无 seq 时不挂必失败的回滚按钮', noSeq.length === 1 && noSeq[0][0].callback_data === 'adfix:ub:555001',
		JSON.stringify(noSeq));
	assert('uid 非数字直接不挂按钮', W.buildAdNoticeKeyboard(12, 'abc') === null,
		JSON.stringify(W.buildAdNoticeKeyboard(12, 'abc')));
}

// ================= [2] 封禁回执真的带按钮 =================
section('[2] 封禁回执端到端带按钮');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const { seq } = await banOne(env, '666010', '按钮A');
	assert('封禁产生了快照序号', Boolean(seq), String(seq));

	const notices = callsOf('sendMessage').filter((c) => String(c.body?.text || '').includes('广告号自动封禁'));
	assert('封禁回执发出去了', notices.length > 0, JSON.stringify(notices.length));
	const markup = notices[0]?.body?.reply_markup?.inline_keyboard;
	assert('回执带 inline_keyboard', Array.isArray(markup), JSON.stringify(notices[0]?.body?.reply_markup));
	assert('两个按钮与 seq/uid 对得上',
		String(markup?.[0]?.[0]?.callback_data) === 'adfix:ig:' + seq
		&& String(markup?.[1]?.[0]?.callback_data) === 'adfix:ub:666010',
		JSON.stringify(markup));
	assert('回执仍保留手打命令的文本兜底',
		String(notices[0]?.body?.text || '').includes('/ignore ' + seq),
		String(notices[0]?.body?.text || '').slice(-200));
}

// ================= [3] 鉴权与非法 data =================
section('[3] 回调鉴权与非法 data');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const { seq } = await banOne(env, '666011', '按钮B');
	const base = ledger(env);

	resetCalls();
	await W.handleAdFixButtonCallback(cbOf('20002', 'adfix:ub:666011'), env);
	assert('非第一主人被拒', /第一主人/.test(String(callsOf('answerCallbackQuery')[0]?.body?.text || '')),
		JSON.stringify(callsOf('answerCallbackQuery').map((c) => c.body?.text)));
	assert('被拒时黑名单未动', ledger(env).black === base.black,
		JSON.stringify({ before: base.black, after: ledger(env).black }));
	assert('被拒时不发 editMessageText', callsOf('editMessageText').length === 0);

	resetCalls();
	await W.handleAdFixButtonCallback(cbOf(String(OWNER_ID), 'adfix:zz:1'), env);
	assert('非法 data 只空 ack',
		String(callsOf('answerCallbackQuery')[0]?.body?.text || '') === ''
		&& callsOf('answerCallbackQuery').length === 1,
		JSON.stringify(callsOf('answerCallbackQuery').map((c) => c.body?.text)));

	// seq 本身合法但留给 [5] 用，这里只确认它还没被动
	assert('合法回调尚未执行（只跑了上面两条）',
		Number(env.DB.query('SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE expires_at > ?', Math.floor(Date.now() / 1000))[0].c) === 1,
		JSON.stringify(env.DB.query('SELECT seq, expires_at FROM ad_pending_snapshots')));
	assert('seq 可用', Boolean(seq));
}

// ================= [4] ↩️ 误判：完整回滚 =================
section('[4] ↩️ 误判（回滚全部）');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const { seq } = await banOne(env, '666020', '回滚号');
	assert('封禁后在黑名单', Number(env.DB.query('SELECT COUNT(*) AS c FROM blacklist WHERE id = ?', '666020')[0].c) === 1);
	const afterBan = ledger(env);
	assert('封禁确实学了判据（否则回滚无从验起）',
		afterBan.fp > 0 && afterBan.shape > 0 && afterBan.sample > 0 && afterBan.snap > 0,
		JSON.stringify(afterBan));

	resetCalls();
	await W.handleAdFixButtonCallback(cbOf(String(OWNER_ID), 'adfix:ig:' + seq), env);
	const after = ledger(env);
	const answer = String(callsOf('answerCallbackQuery')[0]?.body?.text || '');
	assert('回执说明已回滚', /已按误判回滚/.test(answer), answer);
	assert('黑名单已移除', Number(env.DB.query('SELECT COUNT(*) AS c FROM blacklist WHERE id = ?', '666020')[0].c) === 0,
		JSON.stringify(env.DB.query('SELECT id FROM blacklist')));
	assert('快照已删（/pending 不再列它）', after.snap === 0, JSON.stringify({ before: afterBan.snap, after: after.snap }));
	assert('指纹被标记/删除（判据跟着改）', after.fp < afterBan.fp,
		JSON.stringify({ before: afterBan.fp, after: after.fp }));
	assert('形状被清', after.shape < afterBan.shape,
		JSON.stringify({ before: afterBan.shape, after: after.shape }));
	assert('AI 样本被删', after.sample < afterBan.sample,
		JSON.stringify({ before: afterBan.sample, after: after.sample }));
	assert('原回执被补上回滚说明',
		callsOf('editMessageText').some((c) => String(c.body?.text || '').includes('已按误判回滚')),
		JSON.stringify(callsOf('editMessageText').map((c) => String(c.body?.text || '').slice(-120))));
	assert('解封动作发生了（restrict + unban 至少各一次）',
		callsOf('restrictChatMember').length >= 1 && callsOf('unbanChatMember').length >= 1,
		JSON.stringify({ restrict: callsOf('restrictChatMember').length, unban: callsOf('unbanChatMember').length }));
}

// ================= [5] 🔓 解封（判定维持）=================
section('[5] 🔓 解封（判定维持）：动限制不动判据');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const { seq } = await banOne(env, '666030', '解封号');
	const afterBan = ledger(env);
	assert('封禁后在黑名单', Number(env.DB.query('SELECT COUNT(*) AS c FROM blacklist WHERE id = ?', '666030')[0].c) === 1);
	assert('快照存在（回滚按钮才挂得出来）', afterBan.snap >= 1 && Boolean(seq));

	resetCalls();
	await W.handleAdFixButtonCallback(cbOf(String(OWNER_ID), 'adfix:ub:666030'), env);
	const after = ledger(env);
	const answer = String(callsOf('answerCallbackQuery')[0]?.body?.text || '');
	assert('回执说明已解封', /已解封 666030/.test(answer), answer);
	assert('黑名单已移除（allowD1Removal 路径，绕开 /unban 的硬闸门）',
		Number(env.DB.query('SELECT COUNT(*) AS c FROM blacklist WHERE id = ?', '666030')[0].c) === 0,
		JSON.stringify(env.DB.query('SELECT id FROM blacklist')));
	assert('真的调了全群解封', callsOf('unbanChatMember').length >= 1 && callsOf('restrictChatMember').length >= 1,
		JSON.stringify({ restrict: callsOf('restrictChatMember').length, unban: callsOf('unbanChatMember').length }));
	assert('【关键】指纹一条没动', after.fp === afterBan.fp,
		JSON.stringify({ before: afterBan.fp, after: after.fp }));
	assert('【关键】资料形状一条没动', after.shape === afterBan.shape,
		JSON.stringify({ before: afterBan.shape, after: after.shape }));
	assert('【关键】AI 样本一条没动', after.sample === afterBan.sample,
		JSON.stringify({ before: afterBan.sample, after: after.sample }));
	assert('【关键】快照还在（判定维持 = 账本不动）', after.snap === afterBan.snap,
		JSON.stringify({ before: afterBan.snap, after: after.snap }));
	assert('原回执被补上解封说明并写明判据未动',
		callsOf('editMessageText').some((c) => {
			const t = String(c.body?.text || '');
			return t.includes('已解封') && t.includes('判定维持');
		}),
		JSON.stringify(callsOf('editMessageText').map((c) => String(c.body?.text || '').slice(-140))));
}

// ================= [6] 分发分支 =================
section('[6] 分发分支是活的');
{
	const srcLines = src.split('\r\n');
	const fixIdx = srcLines.findIndex((l) => l.includes('data.startsWith(ADFIX_BUTTON_PREFIX)'));
	const dryIdx = srcLines.findIndex((l) => l.includes('data.startsWith(DRYRUN_BUTTON_PREFIX)'));
	assert('adfix 分发分支存在', fixIdx > 0, String(fixIdx));
	assert('分支里调的正是纠错按钮处理器',
		fixIdx > 0 && srcLines[fixIdx + 1].includes('handleAdFixButtonCallback'),
		fixIdx > 0 ? srcLines[fixIdx + 1] : '');
	assert('与演练分支并存（前缀不冲突）', dryIdx > 0 && dryIdx !== fixIdx, JSON.stringify({ fixIdx, dryIdx }));
	// 两个前缀是模块级 const，vm 里不会挂到全局对象上，直接查源码字面量。
	assert('两个前缀互不包含（一个不会被另一个抢先吃掉）',
		src.includes("const ADFIX_BUTTON_PREFIX = 'adfix:'")
		&& src.includes("const DRYRUN_BUTTON_PREFIX = 'dry:'")
		&& !'adfix:'.startsWith('dry:') && !'dry:'.startsWith('adfix:'));
}

console.log(`\n========== 封禁回执纠错按钮：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
