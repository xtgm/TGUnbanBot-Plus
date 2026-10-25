// 主后台广告页下钻（方案 C 批次 2）· 离线验证
//
// 走真实 HTTP 入口 + 真实 initData 签名 + node:sqlite 模拟 D1，6 个只读接口：
//   ads/fingerprints  指纹列表（分页 + 关键词，LIKE 通配符按字面量）
//   ads/samples       广告样本原文（可用 / 失效向量 / 未生成）
//   ads/observing     观察中用户（只列未过期，昵称从名册补）
//   ads/llm           第⑥层今日用量（三池 + 命中/封禁/解析失败 + 候选池），读的时候不写库
//   ads/dryrun        演练流水（可按群筛，群必须在治理范围内）
//   ads/whitelist     白名单用户（分页，昵称从名册补）
// 每个接口都配反向断言：杀手权限 403、读完各表行数不变（只读）。
import fs from 'node:fs';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
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
		return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
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
await W.ensureAdLLMCandidatesTable(env);
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
const q = (sql) => env.DB.query(sql);
const TABLES = ['ad_fingerprints', 'ad_sample_embeddings', 'ad_user_screening', 'ad_scan_state', 'ad_dryrun_log', 'ad_user_whitelist', 'ad_group_members', 'ad_llm_candidates'];
const snapshotCounts = () => TABLES.map((t) => t + '=' + q('SELECT COUNT(*) AS c FROM ' + t)[0].c).join(',');

// ---------- 造数据 ----------
const fpBase = q('SELECT COUNT(*) AS c FROM ad_fingerprints')[0].c;
for (let i = 0; i < 3; i++) {
	env.DB.raw('INSERT INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)',
		'zt' + i, 'keyword', '测试下钻词' + i, 0.5, 900 + i, i, 'auto', now, now);
}
env.DB.raw('INSERT INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_at, updated_at) VALUES (?, ?, ?, 1, 0, 0, 1, ?, ?, ?)',
	'zpct', 'keyword', '百分百50%返利', 'manual', now, now);
// 建表会灌入种子样本（全部未生成向量），数量是实现细节：先记基线再比增量；本节样本时间放到未来，保证排在最前
const smpBase = q('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;
const vec = JSON.stringify(new Array(4).fill(0.1));
env.DB.raw('INSERT INTO ad_sample_embeddings (text_hash, sample_text, embedding, dimension, source, created_at) VALUES (?, ?, ?, ?, ?, ?)', 'h1', '样本一：可用向量', vec, 1024, 'spam', now + 10);
env.DB.raw('INSERT INTO ad_sample_embeddings (text_hash, sample_text, embedding, dimension, source, created_at) VALUES (?, ?, ?, ?, ?, ?)', 'h2', '样本二：旧模型向量', vec, 512, 'auto', now + 20);
env.DB.raw('INSERT INTO ad_sample_embeddings (text_hash, sample_text, embedding, dimension, source, created_at) VALUES (?, ?, NULL, NULL, ?, ?)', 'h3', '样本三：<b>未生成</b>', 'auto', now + 30);
env.DB.raw("INSERT INTO ad_user_screening (user_id, chat_id, score, reasons, snapshot, layer, joined_at, expires_at, updated_at) VALUES ('700001', ?, 40, '[\"简介含联系方式\"]', '{}', 'score', ?, ?, ?)", G, now - 100, now + 3600, now - 5);
env.DB.raw("INSERT INTO ad_user_screening (user_id, chat_id, score, reasons, snapshot, layer, joined_at, expires_at, updated_at) VALUES ('700002', ?, 35, '[]', '{}', 'join', ?, ?, ?)", G2, now - 200, now + 7200, now - 50);
env.DB.raw("INSERT INTO ad_user_screening (user_id, chat_id, score, reasons, snapshot, layer, joined_at, expires_at, updated_at) VALUES ('700003', ?, 50, '[]', '{}', 'score', ?, ?, ?)", G, now - 9000, now - 1, now - 9000);
env.DB.raw("INSERT INTO ad_group_members (user_id, chat_id, first_name, last_name, username, first_seen, last_seen) VALUES ('700001', ?, '观察', '甲', 'obs_jia', ?, ?)", G, now, now);
const today = new Date(now * 1000).toISOString().slice(0, 10);
for (const [k, v] of [['llm_day', today], ['llm_count', '7'], ['llm_pool_message', '5'], ['llm_pool_join', '2'], ['llm_pool_cron', '0'], ['llm_hits', '3'], ['llm_bans', '1'], ['llm_parse_fail', '1']]) {
	env.DB.raw('INSERT INTO ad_scan_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, v, now);
}
env.DB.raw("INSERT INTO ad_llm_candidates (fingerprint, type, value, hits, promoted, created_at, updated_at) VALUES ('c1', 'keyword', '候选一', 1, 0, ?, ?), ('c2', 'keyword', '候选二', 3, 1, ?, ?)", now, now, now, now);
env.DB.raw("INSERT INTO ad_dryrun_log (chat_id, user_id, score, threshold, verdict, layer, reasons, created_at, fp, done) VALUES (?, '710001', 88, 80, 'ban', 'score', '[\"联系方式命中\"]', ?, 1, 0)", G, now - 30);
env.DB.raw("INSERT INTO ad_dryrun_log (chat_id, user_id, score, threshold, verdict, layer, reasons, created_at, fp, done) VALUES (?, '710002', 95, 80, 'ban', 'fingerprint', '[]', ?, 0, 1)", G2, now - 20);
env.DB.raw("INSERT INTO ad_dryrun_log (chat_id, user_id, score, threshold, verdict, layer, reasons, created_at, fp, done) VALUES (?, '710003', 81, 80, 'ban', 'score', '[]', ?, 0, 0)", G, now - 10);
for (let i = 0; i < 25; i++) {
	env.DB.raw('INSERT INTO ad_user_whitelist (user_id, by_user, at, note) VALUES (?, ?, ?, ?)', String(720000 + i), OWNER, '2026-10-' + String(10 + (i % 15)).padStart(2, '0') + 'T00:00:' + String(i).padStart(2, '0') + 'Z', i === 3 ? '老成员' : '');
}
env.DB.raw("INSERT INTO ad_group_members (user_id, chat_id, first_name, last_name, username, first_seen, last_seen) VALUES ('720003', ?, '白名单', '丙', 'wl_bing', ?, ?)", G, now, now);
const before = snapshotCounts();

log('\n=== 1. 接线：6 个接口都在主后台白名单、只给第一主人 ===');
const ACTIONS = ['ads/fingerprints', 'ads/samples', 'ads/observing', 'ads/llm', 'ads/dryrun', 'ads/whitelist'];
for (const a of ACTIONS) {
	const r = await api(OWNER, a);
	check('主人调 ' + a + ' → 200', r.status === 200 && r.json?.success === true, r.status + ' ' + JSON.stringify(r.json).slice(0, 200));
	const k = await api(KA, a);
	check('杀手权限调 ' + a + ' → 403', k.status === 403, k.status);
}

log('\n=== 2. ads/fingerprints ===');
{
	let r = await api(OWNER, 'ads/fingerprints');
	check('总数 = 种子 + 4', r.data?.total === fpBase + 4, JSON.stringify({ total: r.data?.total, fpBase }));
	check('每页最多 20 条', Array.isArray(r.data?.items) && r.data.items.length === Math.min(20, fpBase + 4), r.data?.items?.length);
	check('命中多的排前面', r.data?.items?.[0]?.value === '测试下钻词2', JSON.stringify(r.data?.items?.[0]));
	const top = r.data?.items?.[0] || {};
	check('字段齐：类型、权重、命中、误报、来源', top.type === 'keyword' && top.weight === 0.5 && top.matchCount === 902 && top.falsePositiveCount === 2 && top.source === 'auto', JSON.stringify(top));
	r = await api(OWNER, 'ads/fingerprints', { query: '下钻词' });
	check('关键词搜索命中 3 条', r.data?.total === 3 && r.data.items.every((x) => x.value.includes('下钻词')), JSON.stringify(r.data));
	r = await api(OWNER, 'ads/fingerprints', { query: '%' });
	check('搜「%」按字面量，只命中含 % 的 1 条', r.data?.total === 1 && r.data.items[0].value === '百分百50%返利', JSON.stringify(r.data));
	const pages = Math.max(1, Math.ceil((fpBase + 4) / 20));
	r = await api(OWNER, 'ads/fingerprints', { page: 999 });
	check('越界页码钳到最后一页', r.data?.page === pages && r.data?.totalPages === pages, JSON.stringify({ page: r.data?.page, totalPages: r.data?.totalPages }));
	r = await api(OWNER, 'ads/fingerprints', { query: 'x'.repeat(200) });
	check('关键词超过 100 字 → 400', r.status === 400, r.status);
}

log('\n=== 3. ads/samples ===');
{
	const r = await api(OWNER, 'ads/samples');
	const items = (r.data?.items || []).slice(0, 3);
	check('每页最多 20 条，最新在前', (r.data?.items || []).length === Math.min(20, smpBase + 3) && items[0]?.text === '样本三：<b>未生成</b>', JSON.stringify(items.map((x) => x.text)));
	check('状态：可用 / 旧模型 / 未生成', items[2]?.status === 'ready' && items[1]?.status === 'stale' && items[0]?.status === 'pending', JSON.stringify(items.map((x) => x.status)));
	check('汇总：共 基线+3、已生成 2、失效 1、可用 1', r.data?.counts?.total === smpBase + 3 && r.data?.total === smpBase + 3 && r.data.counts.ready === 2 && r.data.counts.stale === 1 && r.data.counts.usable === 1, JSON.stringify(r.data?.counts));
	check('不回传向量本体', !!r.data && !JSON.stringify(r.data).includes('0.1,0.1'), '');
}

log('\n=== 4. ads/observing ===');
{
	const r = await api(OWNER, 'ads/observing');
	const items = r.data?.items || [];
	check('只列未过期的 2 人', r.data?.total === 2 && items.length === 2 && !items.some((x) => x.userId === '700003'), JSON.stringify(items.map((x) => x.userId)));
	check('最近更新的在前', items[0]?.userId === '700001', JSON.stringify(items.map((x) => x.userId)));
	check('评分、原因、群、到期时间齐', items[0]?.score === 40 && items[0]?.reasons?.[0] === '简介含联系方式' && items[0]?.chatId === G && items[0]?.expiresAt === now + 3600, JSON.stringify(items[0]));
	check('昵称和用户名从名册补上', items[0]?.name === '观察 甲' && items[0]?.username === 'obs_jia', JSON.stringify(items[0]));
	check('名册里没有的人名字为空、ID 照给', items[1]?.name === '' && items[1]?.userId === '700002', JSON.stringify(items[1]));
}

log('\n=== 5. ads/llm ===');
{
	const r = await api(OWNER, 'ads/llm');
	const d = r.data || {};
	check('今日已用 7 / 日额度 1000', d.used === 7 && d.daily === 1000, JSON.stringify(d));
	check('三池用量与上限', d.pools?.message?.used === 5 && d.pools.message.limit === 500 && d.pools?.join?.used === 2 && d.pools.join.limit === 300 && d.pools?.cron?.used === 0 && d.pools.cron.limit === 100, JSON.stringify(d.pools));
	check('命中 3 / 封禁 1 / 解析失败 1', d.hits === 3 && d.bans === 1 && d.parseFail === 1, JSON.stringify(d));
	check('候选池 2 条、已转正 1', d.candidates?.total === 2 && d.candidates?.promoted === 1, JSON.stringify(d.candidates));
	check('AI 未绑定 → enabled=false', d.enabled === false, JSON.stringify(d));
}

log('\n=== 6. ads/dryrun ===');
{
	let r = await api(OWNER, 'ads/dryrun');
	const items = r.data?.items || [];
	check('全部 3 条、最新在前', r.data?.total === 3 && items[0]?.userId === '710003', JSON.stringify(items.map((x) => x.userId)));
	const byId = Object.fromEntries(items.map((x) => [x.userId, x]));
	check('结论：误报 / 已处置 / 未处理', byId['710001']?.status === 'fp' && byId['710002']?.status === 'done' && byId['710003']?.status === 'open', JSON.stringify(items.map((x) => x.status)));
	check('评分、封禁线、层、原因齐', byId['710001']?.score === 88 && byId['710001']?.threshold === 80 && byId['710001']?.layer === 'score' && byId['710001']?.reasons?.[0] === '联系方式命中', JSON.stringify(byId['710001']));
	r = await api(OWNER, 'ads/dryrun', { chatId: G });
	check('按群筛：本群 2 条', r.data?.total === 2 && r.data.items.every((x) => x.chatId === G), JSON.stringify(r.data));
	// 杀手群本来就并入有效治理范围（applyRuntimeConfig），范围外要用一个谁都没配的群
	r = await api(OWNER, 'ads/dryrun', { chatId: '-1009999999999' });
	check('治理范围外的群 → 400', r.status === 400, r.status);
}

log('\n=== 7. ads/whitelist ===');
{
	let r = await api(OWNER, 'ads/whitelist');
	check('共 25 人、第 1 页 20 人', r.data?.total === 25 && r.data?.items?.length === 20 && r.data?.totalPages === 2, JSON.stringify({ total: r.data?.total, n: r.data?.items?.length }));
	const bing = (r.data?.items || []).find((x) => x.userId === '720003');
	r = await api(OWNER, 'ads/whitelist', { page: 2 });
	const all = [...(bing ? [bing] : []), ...(r.data?.items || [])];
	const hit = all.find((x) => x.userId === '720003');
	check('第 2 页 5 人', r.data?.items?.length === 5, r.data?.items?.length);
	check('昵称、@用户名、备注、操作人齐', hit?.name === '白名单 丙' && hit?.username === 'wl_bing' && hit?.note === '老成员' && hit?.by === OWNER, JSON.stringify(hit));
}

log('\n=== 8. 只读：调完 6 个接口各表行数不变 ===');
check('8 张表行数全部不变', snapshotCounts() === before, before + ' → ' + snapshotCounts());

log('\n=== 9. 前端外壳 ===');
{
	const html = W.renderMiniAppHtml();
	check('广告页有下钻容器 #ads-drill', html.includes('id="ads-drill"'));
	check('6 个接口前端都会调', ACTIONS.every((a) => html.includes("'" + a + "'")), ACTIONS.filter((a) => !html.includes("'" + a + "'")).join(','));
}

log('\n' + (fail === 0 ? '✅' : '❌') + ' 广告页下钻：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
