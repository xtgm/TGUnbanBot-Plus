// 主后台群组详情 + 白名单增删（方案 C 批次 3）· 离线验证
//
// 走真实 HTTP 入口 + 真实 initData 签名 + node:sqlite 模拟 D1，3 个接口：
//   groups/detail          群组卡片「查看详情」：机器人权限、演练开关与统计、近期演练流水、入群检查流水（只读）
//   ads/whitelist/add      主后台加白名单（多个 TGID 一次加，去重，上限 50）
//   ads/whitelist/remove   主后台移出白名单
// 另测 users/query 带回白名单状态（用户页据此显示「加入 / 移出白名单」）。
// 反向断言：杀手权限 403 且白名单表不变；groups/detail 读完各表行数不变；范围外的群 404。
import fs from 'node:fs';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
let botMember = { status: 'administrator', user: { id: 42, is_bot: true }, can_restrict_members: true, can_delete_messages: true, can_invite_users: true, can_pin_messages: false, can_promote_members: false, can_change_info: false };
const sandbox = {
	console: { log() {}, warn() {}, error() {}, info() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers, AbortController,
	atob, btoa, setTimeout, clearTimeout, crypto: globalThis.crypto,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		let payload = { ok: true, result: true };
		if (m === 'getChat') payload = { ok: true, result: { id: b?.chat_id, title: '群' + b?.chat_id, type: 'supergroup' } };
		else if (m === 'getMe') payload = { ok: true, result: { id: 42, username: 'testbot', is_bot: true } };
		else if (m === 'getChatMember') payload = botMember ? { ok: true, result: botMember } : { ok: false, description: 'Bad Request: chat not found' };
		return { ok: payload.ok, status: payload.ok ? 200 : 400, json: async () => payload, text: async () => JSON.stringify(payload) };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.replace(/export\s+default\s*/, 'globalThis.__h = '), sandbox, { filename: '_worker.js' });
const W = sandbox;
const handler = W.__h;

function makeD1() {
	const db = new DatabaseSync(':memory:');
	const nIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const nOut = (r) => { if (!r) return null; const o = {}; for (const k of Object.keys(r)) o[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k]; return o; };
	const exec = (sql, params) => {
		const st = db.prepare(sql); const bd = params.map(nIn);
		const up = sql.trim().slice(0, 6).toUpperCase();
		if (up === 'SELECT' || /\bRETURNING\b/i.test(sql) || sql.trim().toUpperCase().startsWith('PRAGMA') || up === 'WITH') return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		const i = st.run(...bd); return { kind: 'write', meta: { changes: Number(i?.changes || 0), last_row_id: Number(i?.lastInsertRowid || 0) } };
	};
	const mk = (sql) => { const s = { sql, params: [] }; const a = {
		bind(...x) { s.params = x; return a; },
		async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
		async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; },
		async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; }
	}; return a; };
	return { prepare: mk, async exec(sql) { for (const p of String(sql).split(';')) { const s = p.trim(); if (s) db.exec(s); } return { count: 1 }; },
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; }, query(sql, ...p) { return db.prepare(sql).all(...p).map(nOut); },
		raw(sql, ...p) { return db.prepare(sql).run(...p); } };
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label + (extra ? '  ' + String(extra).slice(0, 400) : '')); } };
const log = (s) => process.stdout.write(s + '\n');

// 全部是一眼假的 mock 值
const OWNER = '10001';
const KA = '30001';
const G = '-1001111111111';
const G2 = '-1002222222222';
const K = '-1003333333333';
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: G + ',' + G2, OWNER_IDS: OWNER, KILLER_MODE_GROUPS: K, KILLER_ADMIN_IDS: KA, DB: makeD1() };
W.applyRuntimeConfig(W.loadRequiredConfig(env));
await W.ensureD1Table(env);
await W.adDetectionReady(env);
await W.ensureAdDryRunLogTable(env);
await W.ensureAdJoinChecksTable(env);
await W.ensureDryRunTable(env);
const ctx = { waitUntil() {} };

const now = Math.floor(Date.now() / 1000);
function initData(userId) {
	const params = new URLSearchParams({ auth_date: String(now), query_id: 'q', user: JSON.stringify({ id: Number(userId), first_name: 'U' + userId }) });
	const c = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => k + '=' + v).join('\n');
	const secret = createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
	params.set('hash', createHmac('sha256', secret).update(c).digest('hex'));
	return params.toString();
}
async function api(userId, action, body = {}) {
	const res = await handler.fetch(new Request('https://bot.example/app/api/' + action, {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, initData: initData(userId) })
	}), env, ctx);
	let json = null;
	try { json = await res.json(); } catch (_) { json = null; }
	return { status: res.status, json, data: json?.data };
}
const q = (sql, ...p) => env.DB.query(sql, ...p);
const wlRows = () => q('SELECT user_id, by_user, note FROM ad_user_whitelist ORDER BY user_id');

// ---------- 造数据 ----------
env.DB.raw("INSERT INTO ad_dryrun_log (chat_id, user_id, score, threshold, verdict, layer, reasons, created_at, fp, done) VALUES (?, '810001', 88, 80, 'ban', 'score', '[\"联系方式命中\"]', ?, 1, 0)", G, now - 30);
env.DB.raw("INSERT INTO ad_dryrun_log (chat_id, user_id, score, threshold, verdict, layer, reasons, created_at, fp, done) VALUES (?, '810002', 95, 80, 'ban', 'fingerprint', '[]', ?, 0, 1)", G, now - 20);
env.DB.raw("INSERT INTO ad_dryrun_log (chat_id, user_id, score, threshold, verdict, layer, reasons, created_at, fp, done) VALUES (?, '810009', 99, 80, 'ban', 'score', '[]', ?, 0, 0)", G2, now - 10);
env.DB.raw("INSERT INTO ad_join_checks (chat_id, user_id, score, threshold, verdict, layer, reasons, created_at) VALUES (?, '820001', 90, 80, 'ban', 'profile', '[\"简介含引流\"]', ?)", G, now - 300);
env.DB.raw("INSERT INTO ad_join_checks (chat_id, user_id, score, threshold, verdict, layer, reasons, created_at) VALUES (?, '820002', 40, 80, 'observe', 'profile', '[]', ?)", G, now - 200);
env.DB.raw("INSERT INTO ad_join_checks (chat_id, user_id, score, threshold, verdict, layer, reasons, created_at) VALUES (?, '820003', 0, 80, 'pass', 'none', '[]', ?)", G, now - 100);
env.DB.raw("INSERT INTO ad_join_checks (chat_id, user_id, score, threshold, verdict, layer, reasons, created_at) VALUES (?, '820009', 0, 80, 'pass', 'none', '[]', ?)", G2, now - 50);
await W.setDryRun(env, G, true, OWNER);
const TABLES = ['ad_dryrun_log', 'ad_join_checks', 'dryrun_groups', 'ad_user_whitelist'];
const snapshotCounts = () => TABLES.map((t) => t + '=' + q('SELECT COUNT(*) AS c FROM ' + t)[0].c).join(',');

log('\n=== 1. 接线：3 个接口在主后台白名单、只给第一主人 ===');
{
	const r = await api(OWNER, 'groups/detail', { chatId: G });
	check('主人调 groups/detail → 200', r.status === 200 && r.json?.success === true, r.status + ' ' + JSON.stringify(r.json).slice(0, 200));
	const before = JSON.stringify(wlRows());
	for (const [a, body] of [['groups/detail', { chatId: G }], ['ads/whitelist/add', { userIds: '890001' }], ['ads/whitelist/remove', { userId: '890001' }]]) {
		const k = await api(KA, a, body);
		check('杀手权限调 ' + a + ' → 403', k.status === 403, k.status);
	}
	check('杀手权限调完白名单表不变', JSON.stringify(wlRows()) === before, JSON.stringify(wlRows()));
}

log('\n=== 2. groups/detail ===');
{
	const before = snapshotCounts();
	let r = await api(OWNER, 'groups/detail', { chatId: G });
	const d = r.data || {};
	check('回显群 ID 与群名', d.chatId === G && d.title === '群' + G, JSON.stringify({ chatId: d.chatId, title: d.title }));
	check('机器人是管理员、能封禁', d.bot?.ok === true && d.bot?.status === 'administrator', JSON.stringify(d.bot));
	const perm = Object.fromEntries((d.bot?.permissions || []).map((p) => [p.key, p]));
	check('逐项权限：封禁 ✓、删消息 ✓、置顶 ✗', perm.can_restrict_members?.on === true && perm.can_restrict_members?.label === '封禁用户' && perm.can_delete_messages?.on === true && perm.can_pin_messages?.on === false, JSON.stringify(d.bot?.permissions));
	check('演练已开', d.dryRun === true, d.dryRun);
	check('演练统计：本群 2 条、误报 1、确认封 1', d.dryRunStats?.total === 2 && d.dryRunStats?.fp === 1 && d.dryRunStats?.done === 1, JSON.stringify(d.dryRunStats));
	const dl = d.dryrunLog || [];
	check('演练流水只含本群、最新在前', dl.length === 2 && dl[0]?.userId === '810002' && dl.every((x) => x.chatId === G), JSON.stringify(dl.map((x) => x.userId)));
	check('演练流水字段：评分、线、层、原因、结论', dl[1]?.score === 88 && dl[1]?.threshold === 80 && dl[1]?.layer === 'score' && dl[1]?.reasons?.[0] === '联系方式命中' && dl[1]?.status === 'fp' && dl[0]?.status === 'done', JSON.stringify(dl[1]));
	const jc = d.joinChecks || [];
	check('入群检查只含本群、最新在前', jc.length === 3 && jc[0]?.userId === '820003' && jc.every((x) => x.chatId === G), JSON.stringify(jc.map((x) => x.userId)));
	check('入群检查字段：结论、评分、原因', jc[2]?.verdict === 'ban' && jc[2]?.score === 90 && jc[2]?.reasons?.[0] === '简介含引流' && jc[1]?.verdict === 'observe' && jc[0]?.verdict === 'pass', JSON.stringify(jc[2]));
	r = await api(OWNER, 'groups/detail', { chatId: G2 });
	check('另一群：演练未开、流水各 1 条', r.data?.dryRun === false && r.data?.dryrunLog?.length === 1 && r.data?.joinChecks?.length === 1, String(JSON.stringify(r.data)).slice(0, 300));
	botMember = { status: 'member', user: { id: 42, is_bot: true } };
	r = await api(OWNER, 'groups/detail', { chatId: G });
	check('机器人不是管理员 → ok=false、各项权限全 ✗', r.data?.bot?.ok === false && r.data?.bot?.status === 'member' && (r.data?.bot?.permissions || []).length > 0 && r.data.bot.permissions.every((p) => p.on === false), JSON.stringify(r.data?.bot));
	botMember = null;
	r = await api(OWNER, 'groups/detail', { chatId: G });
	check('查不到机器人成员 → ok=false 带原因，流水照给', r.status === 200 && r.data?.bot?.ok === false && String(r.data?.bot?.reason || '').includes('chat not found') && r.data?.dryrunLog?.length === 2, JSON.stringify(r.data?.bot));
	botMember = { status: 'creator', user: { id: 42, is_bot: true } };
	r = await api(OWNER, 'groups/detail', { chatId: G });
	check('机器人是群主 → 各项权限全 ✓', r.data?.bot?.ok === true && r.data.bot.permissions.every((p) => p.on === true), JSON.stringify(r.data?.bot));
	r = await api(OWNER, 'groups/detail', { chatId: '-1009999999999' });
	check('治理范围外的群 → 404', r.status === 404, r.status);
	r = await api(OWNER, 'groups/detail', { chatId: 'abc' });
	check('群 ID 格式不对 → 400', r.status === 400, r.status);
	check('只读：调完各表行数不变', snapshotCounts() === before, before + ' → ' + snapshotCounts());
}

log('\n=== 3. ads/whitelist/add ===');
{
	let r = await api(OWNER, 'ads/whitelist/add', { userIds: '890001, 890002 890001' });
	check('一次加 2 个（重复的只算一次）', r.status === 200 && JSON.stringify(r.data?.added) === '["890001","890002"]' && r.data?.existed?.length === 0, JSON.stringify(r.data));
	const rows = wlRows();
	check('落表：操作人是第一主人、备注「小程序添加」', rows.length === 2 && rows.every((x) => x.by_user === OWNER && x.note === '小程序添加'), JSON.stringify(rows));
	check('回执文案带人数', String(r.data?.message || '').includes('2'), r.data?.message);
	r = await api(OWNER, 'ads/whitelist/add', { userIds: '890002，890003' });
	check('已在名单的记成「本来就在」，新的照加', JSON.stringify(r.data?.added) === '["890003"]' && JSON.stringify(r.data?.existed) === '["890002"]', JSON.stringify(r.data));
	check('加完立即生效（豁免判断当场为真）', await W.isAdUserWhitelisted(env, '890003') === true);
	r = await api(OWNER, 'ads/whitelist/add', { userIds: 'abc' });
	check('识别不出数字 → 400', r.status === 400, r.status);
	r = await api(OWNER, 'ads/whitelist/add', { userIds: Array.from({ length: 51 }, (_, i) => String(891000 + i)).join(' ') });
	check('一次超过 50 个 → 400，一个都不加', r.status === 400 && wlRows().length === 3, r.status + ' ' + wlRows().length);
	r = await api(OWNER, 'ads/whitelist/add', { userIds: '1'.repeat(21) });
	check('超长数字 → 400', r.status === 400, r.status);
}

log('\n=== 4. ads/whitelist/remove ===');
{
	await W.isAdUserWhitelisted(env, '890001');
	let r = await api(OWNER, 'ads/whitelist/remove', { userId: '890001' });
	check('移出 → removed=true、表里没了', r.status === 200 && r.data?.removed === true && !wlRows().some((x) => x.user_id === '890001'), JSON.stringify(r.data));
	check('移出立即生效（豁免判断当场为假）', await W.isAdUserWhitelisted(env, '890001') === false);
	r = await api(OWNER, 'ads/whitelist/remove', { userId: '890001' });
	check('再移一次 → 200、removed=false', r.status === 200 && r.data?.removed === false, JSON.stringify(r.data));
	r = await api(OWNER, 'ads/whitelist/remove', { userId: 'x1' });
	check('ID 不是纯数字 → 400', r.status === 400, r.status);
}

log('\n=== 5. users/query 带回白名单状态 ===');
{
	let r = await api(OWNER, 'users/query', { userId: '890002' });
	check('在名单：带回操作人、备注、时间', r.data?.whitelist?.by === OWNER && r.data?.whitelist?.note === '小程序添加' && !!r.data?.whitelist?.at, JSON.stringify(r.data?.whitelist));
	r = await api(OWNER, 'users/query', { userId: '890001' });
	check('不在名单：whitelist=null', r.status === 200 && r.data?.whitelist === null, JSON.stringify(r.data?.whitelist));
}

log('\n=== 6. 前端外壳 ===');
{
	const html = W.renderMiniAppHtml();
	const A = ['groups/detail', 'ads/whitelist/add', 'ads/whitelist/remove'];
	check('3 个接口前端都会调', A.every((a) => html.includes("'" + a + "'")), A.filter((a) => !html.includes("'" + a + "'")).join(','));
}

log('\n' + (fail === 0 ? '✅' : '❌') + ' 群组详情 + 白名单增删：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
