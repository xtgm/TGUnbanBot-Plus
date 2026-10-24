// 杀手子后台（/app/killer + /app/api/killer/*）· 离线验证
//
// 走真实 HTTP 入口 + 真实 initData 签名，测的是「验过身份之后服务端到底放行了什么」：
//   · 身份分流：杀手权限只进杀手后台，主后台接口一律 403；非杀手非主人 403
//   · 范围钉死：前端传 GROUP_ID 群一律 403，Telegram 调用只落在杀手群
//   · 只写 killer_blacklist，主黑名单只读、且只露「方式 + 时间」
//   · 手动封禁不学习特征；写操作抄送第一主人；超预算转批量任务
// 每节都配一条越界反向断言：GROUP_ID 群一根头发都不能动。
import fs from 'node:fs';
import vm from 'node:vm';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const calls = [];

const sandbox = {
	console: { log() {}, warn() {}, error() {}, info() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers, AbortController,
	atob, btoa, setTimeout, clearTimeout, crypto: globalThis.crypto,
	fetch: async (url, init) => {
		const raw = String(url);
		if (raw.includes('gkybot')) return { ok: true, status: 200, text: async () => '此TG账号并沒有封鎖記錄', json: async () => ({}) };
		const m = raw.split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		calls.push({ method: m, body: b });
		let payload = { ok: true, result: true };
		if (m === 'sendMessage') payload = { ok: true, result: { message_id: 9000 + calls.length } };
		else if (m === 'getChatAdministrators') payload = { ok: true, result: [{ user: { id: 42, is_bot: true }, status: 'administrator', can_restrict_members: true, can_delete_messages: true, can_invite_users: true }] };
		else if (m === 'getChat') payload = /^\d+$/.test(String(b?.chat_id)) ? { ok: true, result: { id: Number(b.chat_id), first_name: '测试', username: 'tester' } } : { ok: true, result: { id: b?.chat_id, title: '群' + b?.chat_id, type: 'supergroup' } };
		else if (m === 'getChatMember') payload = { ok: true, result: { status: 'member', user: { id: b?.user_id } } };
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
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; }, query(sql, ...p) { return db.prepare(sql).all(...p).map(nOut); } };
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label + (extra ? '  ' + String(extra).slice(0, 400) : '')); } };
const log = (s) => process.stdout.write(s + '\n');
const callsOf = (m) => calls.filter((c) => c.method === m);
const reset = () => { calls.length = 0; };
const touched = (chat) => calls.some((c) => ['banChatMember', 'restrictChatMember', 'unbanChatMember', 'sendMessage', 'deleteMessage'].includes(c.method) && String(c.body?.chat_id) === chat);
const bannedIn = (chat, user) => callsOf('banChatMember').some((c) => String(c.body?.chat_id) === chat && String(c.body?.user_id) === String(user));
const sentTo = (chat) => callsOf('sendMessage').filter((c) => String(c.body?.chat_id) === String(chat)).map((c) => String(c.body?.text || '')).join('\n');

// 全部是一眼假的 mock 值
const OWNER = '10001';
const KA = '30001';          // 只有杀手权限
const KS = '30002';          // 杀手权限 + 超管
const NOBODY = '30009';      // 什么权限都没有
const K = '-100111';         // 杀手群
const G = '-100222';         // GROUP_ID 群
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: G, OWNER_IDS: OWNER, KILLER_MODE_GROUPS: K, KILLER_ADMIN_IDS: KA + ',' + KS, SUPER_ADMIN_IDS: KS, DB: makeD1() };
W.applyRuntimeConfig(W.loadRequiredConfig(env));
await W.ensureD1Table(env);
await W.adDetectionReady(env);
const ctx = { waitUntil() {} };

const now = Math.floor(Date.now() / 1000);
function initData(userId) {
	const params = new URLSearchParams({ auth_date: String(now), query_id: 'q', user: JSON.stringify({ id: Number(userId), first_name: 'U' + userId }) });
	const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => k + '=' + v).join('\n');
	const secret = createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
	params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
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
const tableCount = (table, where = '') => { try { return Number(env.DB.query('SELECT COUNT(*) AS c FROM ' + table + (where ? ' WHERE ' + where : ''))[0]?.c || 0); } catch (_) { return 0; } };
const inKillerBl = (id) => tableCount('killer_blacklist', "id = '" + id + "'") > 0;
const inMainBl = (id) => tableCount('blacklist', "id = '" + id + "'") > 0;
const learnTotal = () => tableCount('ad_fingerprints') + tableCount('ad_spam_texts') + tableCount('ad_sample_embeddings') + tableCount('ad_avatars') + tableCount('ad_badges') + tableCount('ad_profile_shapes');
log('\n=== 1. 静态外壳 ===');
{
	const res = await handler.fetch(new Request('https://bot.example/app/killer'), env, ctx);
	const html = await res.text();
	check('GET /app/killer 返回 200', res.status === 200, res.status);
	check('杀手外壳走 /app/api/killer/', html.includes("'/app/api/killer/'"));
	check('脚本带 CSP nonce', /<script nonce="[0-9a-f]{32}">/.test(html));
	check('杀手外壳不用 innerHTML', !/innerHTML/.test(html));
	check('五个标签页齐全', ['groups', 'blacklist', 'users', 'notice', 'stats'].every((t) => html.includes('data-tab="' + t + '"')));
	check('页面里没有主后台的群组增删入口', !/groups\/add|groups\/remove|ads\/ignore/.test(html));
	const post = await handler.fetch(new Request('https://bot.example/app/killer', { method: 'POST' }), env, ctx);
	check('POST /app/killer 405', post.status === 405, post.status);
	const main = await (await handler.fetch(new Request('https://bot.example/app'), env, ctx)).text();
	check('主后台 bootstrap 遇到杀手身份会跳转', main.includes("data.role === 'killer' && data.redirect"));
	check('杀手后台有全屏按钮', html.includes('id="fullscreen"'), '');
	const mainHtml = W.renderMiniAppHtml();
	check('两个后台都不再自动全屏（改为按钮触发）', !/autoFullscreen/.test(html) && !/autoFullscreen/.test(mainHtml));
	check('主后台保留全屏按钮', mainHtml.includes('id="fullscreen"'));
}

log('\n=== 2. 身份分流 ===');
{
	let r = await api(KA, 'bootstrap');
	check('杀手权限调主后台 bootstrap → 只给跳转', r.status === 200 && r.data?.role === 'killer' && r.data?.redirect === '/app/killer', JSON.stringify(r.json));
	check('跳转响应里没有主后台数据', r.data && !('groups' in r.data) && !('primaryOwner' in r.data), JSON.stringify(r.data));
	r = await api(KA, 'killer/bootstrap');
	check('杀手后台 bootstrap 成功', r.status === 200 && r.data?.role === 'killer', JSON.stringify(r.json));
	check('群组只有杀手群', JSON.stringify((r.data?.groups || []).map((g) => g.chatId)) === JSON.stringify([K]), JSON.stringify(r.data?.groups));
	check('签名用户就是本人', r.data?.user?.id === KA, JSON.stringify(r.data?.user));
	for (const action of ['blacklist/list', 'groups/list', 'blacklist/unban', 'notice/send', 'ads/pending']) {
		r = await api(KA, action, { userId: '55600', text: 'x' });
		check('越界：杀手权限调主后台 ' + action + ' → 403', r.status === 403 && r.json?.success === false, r.status + ' ' + JSON.stringify(r.json));
	}
	r = await api(KS, 'blacklist/list');
	check('杀手+超管同样拿不到主后台', r.status === 403, r.status);
	r = await api(NOBODY, 'killer/bootstrap');
	check('无权限的人调杀手接口 → 403', r.status === 403, r.status);
	r = await api(OWNER, 'killer/blacklist/ban', { userIds: '55600' });
	check('第一主人调杀手接口 → 走杀手分发并执行', r.status === 200 && r.data?.complete === true && inKillerBl('55600'), JSON.stringify(r.json));
}

log('\n=== 3. 范围钉死：传 GROUP_ID 群一律 403 ===');
{
	reset();
	let r = await api(KA, 'killer/stats', { chatId: G });
	check('统计查 GROUP_ID 群 → 403', r.status === 403, r.status + ' ' + JSON.stringify(r.json));
	r = await api(KA, 'killer/search', { query: 'hello', chatId: G });
	check('检索指定 GROUP_ID 群 → 403', r.status === 403, r.status);
	r = await api(KA, 'killer/notice/send', { text: '越界通知', chatId: G });
	check('通知发往 GROUP_ID 群 → 403', r.status === 403, r.status);
	check('越界：GROUP_ID 群一条消息都没收到', !touched(G));
	r = await api(KA, 'killer/stats', {});
	check('统计不选群 → 400', r.status === 400, r.status);
	r = await api(KA, 'killer/health');
	const ids = (r.data?.layer2 || []).map((x) => x.groupId);
	check('运行检查只检查杀手群', r.status === 200 && JSON.stringify(ids) === JSON.stringify([K]), JSON.stringify(r.json).slice(0, 300));
}

log('\n=== 4. 封禁：只踢杀手群、只进杀手黑名单、不学习、抄送第一主人 ===');
{
	reset();
	const before = learnTotal();
	const r = await api(KA, 'killer/blacklist/ban', { userIds: '55601', note: '发广告' });
	check('封禁成功', r.status === 200 && r.data?.complete === true, JSON.stringify(r.json));
	check('杀手群踢出', bannedIn(K, '55601'));
	check('越界：GROUP_ID 群一根头发没动', !touched(G));
	check('进杀手黑名单', inKillerBl('55601'));
	check('不进主黑名单', !inMainBl('55601'));
	check('手动封禁不学习特征', learnTotal() === before, before + ' → ' + learnTotal());
	check('备注落库', env.DB.query("SELECT note FROM killer_blacklist WHERE id = '55601'")[0]?.note === '发广告');
	check('抄送第一主人且标明来源', /杀手子后台/.test(sentTo(OWNER)) && /55601/.test(sentTo(OWNER)), sentTo(OWNER).slice(0, 300));
	check('回执里有逐人结果', r.data?.users?.[0]?.userId === '55601' && r.data.users[0].ok === 1 && r.data.users[0].total === 1, JSON.stringify(r.data?.users));

	reset();
	let p = await api(KA, 'killer/blacklist/ban', { userIds: OWNER });
	check('只封主人 → 400，什么都不做', p.status === 400 && !inKillerBl(OWNER) && !callsOf('banChatMember').length, JSON.stringify(p.json));
	p = await api(KA, 'killer/blacklist/ban', { userIds: KS + ' 55602' });
	check('混入杀手权限持有者 → 跳过他、照封其余', p.status === 200 && (p.data?.skipped || []).includes(KS) && !inKillerBl(KS) && inKillerBl('55602'), JSON.stringify(p.json));
	p = await api(KA, 'killer/blacklist/ban', { userIds: 'abc' });
	check('没有合法 ID → 400', p.status === 400, p.status);
}

log('\n=== 5. 解封：只解杀手群，主黑名单的人解不了 ===');
{
	env.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)').bind('55603', 'manual_ban', OWNER, '2026-10-01T00:00:00Z', '主人的私密备注').run();
	reset();
	let r = await api(KA, 'killer/blacklist/unban', { userIds: '55601' });
	check('解封成功', r.status === 200 && r.data?.complete === true, JSON.stringify(r.json));
	check('移出杀手黑名单', !inKillerBl('55601'));
	check('越界：GROUP_ID 群没被解封', !touched(G));
	check('杀手群有解封调用', calls.some((c) => ['unbanChatMember', 'restrictChatMember'].includes(c.method) && String(c.body?.chat_id) === K));
	check('解封也抄送第一主人', /解封/.test(sentTo(OWNER)), sentTo(OWNER).slice(0, 200));
	reset();
	r = await api(KA, 'killer/blacklist/unban', { userIds: '55603' });
	check('主黑名单的人 → blocked，complete=false', (r.data?.blocked || []).includes('55603') && r.data?.complete === false, JSON.stringify(r.json));
	check('主黑名单记录原样保留', inMainBl('55603'));
	check('没有对任何群发解封', !callsOf('unbanChatMember').length && !callsOf('restrictChatMember').length, JSON.stringify(calls.map((c) => c.method)));
}

log('\n=== 6. 黑名单列表只读 killer_blacklist ===');
{
	const r = await api(KA, 'killer/blacklist/list', {});
	const ids = (r.data?.items || []).map((x) => x.id);
	check('列出杀手黑名单', r.status === 200 && ids.includes('55602'), JSON.stringify(r.json).slice(0, 300));
	check('主黑名单的人不出现在列表里', !ids.includes('55603'), JSON.stringify(ids));
	const q = await api(KA, 'killer/blacklist/list', { query: '55602' });
	check('按 ID 搜索', (q.data?.items || []).length === 1, JSON.stringify(q.data));
}
log('\n=== 7. 用户查询：主黑名单只露方式与时间，进退群记录只看杀手群 ===');
{
	await W.recordMemberEventDetail(env, K, '55603', 'join', Date.now() - 2000);
	await W.recordMemberEventDetail(env, G, '55603', 'join', Date.now() - 1000);
	const r = await api(KA, 'killer/users/query', { userId: '55603' });
	check('查询成功', r.status === 200 && r.data?.userId === '55603', JSON.stringify(r.json).slice(0, 300));
	check('主黑名单状态可见', !!r.data?.blacklist && !!r.data.blacklist.reason, JSON.stringify(r.data?.blacklist));
	check('越界：主黑名单的操作人与备注不外露', r.data?.blacklist && !('by' in r.data.blacklist) && !('note' in r.data.blacklist) && !JSON.stringify(r.json).includes('主人的私密备注'), JSON.stringify(r.data?.blacklist));
	const chats = (r.data?.events || []).map((e) => String(e.chat_id));
	check('杀手群的进群记录可见', chats.includes(K), JSON.stringify(r.data?.events));
	check('越界：GROUP_ID 群的进退群记录不可见', !chats.includes(G), JSON.stringify(chats));
	const bad = await api(KA, 'killer/users/query', { userId: 'abc' });
	check('非数字 ID → 400', bad.status === 400, bad.status);
}

log('\n=== 8. 通知：只发杀手群，抄送第一主人 ===');
{
	reset();
	const r = await api(KA, 'killer/notice/send', { text: '杀手群公告', silent: true });
	check('发送成功', r.status === 200 && r.data?.sent === 1 && r.data?.total === 1, JSON.stringify(r.json));
	check('杀手群收到', /杀手群公告/.test(sentTo(K)));
	check('越界：GROUP_ID 群没收到', !touched(G));
	check('静默发送带 disable_notification', callsOf('sendMessage').some((c) => String(c.body?.chat_id) === K && c.body?.disable_notification === true));
	check('抄送第一主人', /杀手子后台通知/.test(sentTo(OWNER)) && /杀手群公告/.test(sentTo(OWNER)), sentTo(OWNER).slice(0, 200));
	const empty = await api(KA, 'killer/notice/send', { text: '   ' });
	check('空内容 → 400', empty.status === 400, empty.status);
}

log('\n=== 9. 统计与检索 ===');
{
	const r = await api(KA, 'killer/stats', { chatId: K, range: 'week' });
	check('统计返回汇总 + 排行 + 7 天趋势', r.status === 200 && r.data?.range === 'week' && r.data?.summary && Array.isArray(r.data?.ranking?.rows) && (r.data?.trend || []).length === 7, JSON.stringify(r.json).slice(0, 300));
	const bad = await api(KA, 'killer/stats', { chatId: K, range: 'evil' });
	check('非法时间段回退为今天', bad.data?.range === 'day', JSON.stringify(bad.data?.range));
	const s = await api(KA, 'killer/search', { query: '55603' });
	check('检索不指定群 → 默认全部杀手群，正常返回', s.status === 200 && Array.isArray(s.data?.rows), JSON.stringify(s.json).slice(0, 200));
	const e = await api(KA, 'killer/search', { query: '' });
	check('空检索 → 400', e.status === 400, e.status);
}

log('\n=== 10. 超预算转批量任务 ===');
{
	reset();
	const ids = Array.from({ length: 20 }, (_, i) => String(56000 + i)).join(' ');
	const r = await api(KA, 'killer/blacklist/ban', { userIds: ids });
	check('20 个转批量任务', r.status === 200 && r.data?.queued === true && !!r.data?.jobId, JSON.stringify(r.json));
	check('同步路径没有直接踢人', !callsOf('banChatMember').length, callsOf('banChatMember').length);
	const job = await W.loadBulkJob(env, r.data?.jobId);
	check('任务标记为杀手任务、范围只有杀手群', job?.killer === true && JSON.stringify(job?.groupIds) === JSON.stringify([K]), JSON.stringify({ killer: job?.killer, groupIds: job?.groupIds }));
	check('批量任务创建也抄送第一主人', /批量任务已创建/.test(sentTo(OWNER)), sentTo(OWNER).slice(0, 200));
	const over = await api(KA, 'killer/blacklist/ban', { userIds: Array.from({ length: 51 }, (_, i) => String(57000 + i)).join(' ') });
	check('超过 50 个 → 400', over.status === 400, over.status);
}

log('\n=== 11. 菜单按钮：只给非主人的杀手权限持有者 ===');
{
	reset();
	const r = await W.setKillerMiniAppMenuButtons(new Request('https://bot.example/'));
	const targets = callsOf('setChatMenuButton').map((c) => String(c.body?.chat_id));
	check('两个杀手权限都设置了', r.已设置 === 2 && targets.includes(KA) && targets.includes(KS), JSON.stringify(r));
	check('菜单指向 /app、文字是杀手后台', callsOf('setChatMenuButton').every((c) => c.body?.menu_button?.web_app?.url === 'https://bot.example/app' && c.body?.menu_button?.text === '杀手后台'));
	check('越界：没碰主人的菜单', !targets.includes(OWNER));
}

log('\n=== 12. 第一主人进杀手后台：同一个后台、身份区分 ===');
{
	let b = await api(OWNER, 'bootstrap');
	check('主后台 bootstrap 给主人杀手入口', b.data?.killerEntry === true, JSON.stringify(b.data && { killerEntry: b.data.killerEntry }));
	const html = await (await handler.fetch(new Request('https://bot.example/app/killer'), env, ctx)).text();
	check('杀手后台有「返回群务台」按钮', html.includes('id="back-main"'));
	let r = await api(OWNER, 'killer/bootstrap');
	check('主人进杀手后台身份是 owner', r.status === 200 && r.data?.role === 'owner', JSON.stringify(r.json));
	check('主人的群组范围与杀手权限一致', JSON.stringify((r.data?.groups || []).map((g) => g.chatId)) === JSON.stringify([K]), JSON.stringify(r.data?.groups));

	reset();
	const before = learnTotal();
	r = await api(OWNER, 'killer/blacklist/ban', { userIds: '55611', note: '主人操作' });
	check('主人封禁成功', r.status === 200 && r.data?.complete === true, JSON.stringify(r.json));
	check('只踢杀手群', bannedIn(K, '55611') && !touched(G));
	check('记进杀手黑名单', inKillerBl('55611'));
	check('操作人记为主人自己的 ID', env.DB.query("SELECT by_user FROM killer_blacklist WHERE id = '55611'")[0]?.by_user === OWNER, JSON.stringify(env.DB.query("SELECT by_user FROM killer_blacklist WHERE id = '55611'")));
	check('主人操作不抄送给自己', !sentTo(OWNER), sentTo(OWNER).slice(0, 200));
	check('主人操作也不学习特征', learnTotal() === before);
	reset();
	r = await api(OWNER, 'killer/blacklist/unban', { userIds: '55611' });
	check('主人解封成功', r.status === 200 && r.data?.complete === true, JSON.stringify(r.json));
	check('解封也不抄送给自己', !sentTo(OWNER), sentTo(OWNER).slice(0, 200));

	reset();
	r = await api(OWNER, 'killer/blacklist/ban', { userIds: Array.from({ length: 20 }, (_, i) => String(58000 + i)).join(' ') });
	check('主人超预算同样转批量任务', r.status === 200 && r.data?.queued === true, JSON.stringify(r.json).slice(0, 200));
	check('主人的批量任务也不抄送自己', !sentTo(OWNER), sentTo(OWNER).slice(0, 200));

	reset();
	r = await api(OWNER, 'killer/blacklist/ban', { userIds: KA });
	check('主人在杀手后台也封不了杀手权限持有者', r.status === 400 && !inKillerBl(KA), r.status + ' ' + JSON.stringify(r.json));
	r = await api(OWNER, 'killer/stats', { chatId: G });
	check('主人查 GROUP_ID 群统计 → 403', r.status === 403, r.status);
	const main = await api(OWNER, 'groups/list');
	check('主人主后台功能不受影响', main.status === 200 && Array.isArray(main.data), main.status);
	const k = await api(KA, 'groups/list');
	check('杀手权限仍然进不了主后台', k.status === 403, k.status);
}

log('\n=== 13. 统计下钻：入群 / 退群明细 + 单日时间段 ===');
{
	// 统计时区（默认 +8）的今天 0 点 → unix 秒；边界两侧各放一条，验证按统计时区切天
	const today = W.statRangeDays(env, 'day').start;
	const yesterday = W.statRangeDays(env, 'yesterday').start;
	const dayStartSec = Date.parse(today + 'T00:00:00Z') / 1000 - 8 * 3600;
	const put = (chat, user, kind, at) => env.DB.prepare('INSERT INTO stat_member_events (chat_id, user_id, kind, at, actor_id, invite_link, via_request) VALUES (?, ?, ?, ?, NULL, NULL, 0)').bind(chat, user, kind, at).run();
	await W.ensureStatMemberEventsTable(env);
	await put(K, '66001', 'join', dayStartSec + 30);        // 今天 00:00:30
	await put(K, '66002', 'join', dayStartSec + 60);
	await put(K, '66003', 'leave', dayStartSec + 90);
	await put(K, '66004', 'kicked', dayStartSec + 120);
	await put(K, '66005', 'join', dayStartSec - 30);        // 昨天 23:59:30
	await put(G, '66006', 'join', dayStartSec + 30);        // GROUP_ID 群
	await W.ensureStatTables(env);
	env.DB.prepare('INSERT INTO stat_speech (chat_id, user_id, day, msg_count, display_name, username, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(K, '66001', today, 1, '进群甲', 'jia', now).run();

	let r = await api(KA, 'killer/stats/members', { chatId: K, range: 'day', kind: 'join' });
	const ids = (r.data?.rows || []).map((x) => x.userId);
	// 第 7 节已给 55603 记过一条今天的杀手群入群，所以总数是 3；本节只核对自己插的 66xxx 顺序
	const mine = ids.filter((id) => id.startsWith('660'));
	check('入群明细：今天杀手群 3 条、本节插的按时间倒序', r.status === 200 && JSON.stringify(mine) === JSON.stringify(['66002', '66001']) && ids.includes('55603') && r.data?.total === 3, JSON.stringify(r.json).slice(0, 300));
	check('入群明细带昵称（取自发言记录）', (r.data?.rows || []).find((x) => x.userId === '66001')?.displayName === '进群甲', JSON.stringify(r.data?.rows));
	check('越界：GROUP_ID 群的入群不出现', !ids.includes('66006'));
	check('统计时区切天：昨天 23:59:30 的不算今天', !ids.includes('66005'));
	r = await api(KA, 'killer/stats/members', { chatId: K, range: 'day', kind: 'leave' });
	const leaveKinds = (r.data?.rows || []).map((x) => x.userId + ':' + x.kind).sort();
	check('退群明细 = 主动退群 + 被移出', JSON.stringify(leaveKinds) === JSON.stringify(['66003:leave', '66004:kicked']), JSON.stringify(r.json).slice(0, 300));
	r = await api(KA, 'killer/stats/members', { chatId: K, range: yesterday, kind: 'join' });
	check('单日时间段：昨天只有 66005', JSON.stringify((r.data?.rows || []).map((x) => x.userId)) === JSON.stringify(['66005']), JSON.stringify(r.json).slice(0, 300));
	r = await api(KA, 'killer/stats/members', { chatId: G, range: 'day', kind: 'join' });
	check('越界：明细查 GROUP_ID 群 → 403', r.status === 403, r.status);
	r = await api(KA, 'killer/stats/members', { chatId: K, range: 'day', kind: 'evil' });
	check('非法 kind → 400', r.status === 400, r.status);
	r = await api(KA, 'killer/stats', { chatId: K, range: yesterday });
	check('统计接受单日时间段（趋势行点开用）', r.status === 200 && r.data?.range === yesterday && r.data?.start === yesterday && r.data?.end === yesterday, JSON.stringify(r.data && { range: r.data.range, start: r.data.start }));
	r = await api(KA, 'killer/stats', { chatId: K, range: '2026-13-45' });
	check('不合法的日期仍回退为今天', r.data?.range === 'day', JSON.stringify(r.data?.range));
}

log('\n' + (fail ? '❌' : '✅') + ' 杀手子后台：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
