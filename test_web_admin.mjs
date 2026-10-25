// 域名/admin 网页管理后台 · 离线验证
//
// 口径（2026-10-25 主人拍板）：
//   · /help 的功能全部集中到网页管理后台，/help 只留一句后台入口提示
//   · Telegram 菜单（setMyCommands）只保留 ban / spam / check / unban / stats 五条；
//     其余命令只是不显示，处理代码照旧，照样能直接发送使用
//   · 后台只给第一主人：私聊 /adminpass 领一次性密码 → 域名/admin 登录 → 会话 cookie
//     （同日改 A 方案：Dashboard 设了 ADMIN_PASSWORD 就用正式密码，/adminpass 只作备用，见第 10 节）
//   · 导出密码与后台密码互不通用（导出给可信用户，后台等同第一主人权限）
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const sent = [];
const calls = [];
const sandbox = {
	console: { log() {}, warn() {}, error() {}, info() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers, AbortController,
	atob, btoa, setTimeout, clearTimeout, crypto: globalThis.crypto,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		calls.push({ method: m, body: b });
		if (m === 'sendMessage') sent.push({ chatId: String(b?.chat_id), text: String(b?.text || '') });
		let result = true;
		if (m === 'sendMessage') result = { message_id: 9000 + sent.length };
		else if (m === 'getMe') result = { id: 42, is_bot: true, username: 'TestBot', first_name: 'TestBot' };
		else if (m === 'getChat') result = { id: Number(b?.chat_id) || 0, type: 'supergroup', title: '测试群' };
		else if (m === 'getChatMember') result = { status: 'administrator', user: { id: 42 }, can_restrict_members: true, can_delete_messages: true };
		else if (m === 'getChatAdministrators') result = [];
		const payload = { ok: true, result };
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
const check = (label, cond, extra) => { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label + (extra ? '  ' + String(extra).slice(0, 300) : '')); } };
const log = (s) => process.stdout.write(s + '\n');

// 一眼假的 mock 值
const OWNER = '10001';
const OTHER = '30009';
const G = '-1001111111111';
const TOKEN = 'TESTTOKEN-0001';
const env = { TOKEN, BOT_TOKEN: '1:x', GROUP_ID: G, OWNER_IDS: OWNER, DB: makeD1() };
W.applyRuntimeConfig(W.loadRequiredConfig(env));
await W.ensureD1Table(env);
env.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)').bind('1001', 'manual_ban', OWNER, '2026-05-22T10:00:00.000Z', '').run();
const ctx = { waitUntil() {} };
const BASE = 'https://bot.example';

const get = (path, cookie) => handler.fetch(new Request(BASE + path, { headers: cookie ? { Cookie: cookie } : {} }), env, ctx);
const loginAt = (path, password) => handler.fetch(new Request(BASE + path, {
	method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE }, body: new URLSearchParams({ password }).toString(), redirect: 'manual'
}), env, ctx);
const msg = (chatId, type, text, from) => ({ message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: Number(chatId), type }, from: { id: Number(from), first_name: 'U' + from }, text });
const say = async (chatId, type, text, from) => { sent.length = 0; await W.handleMessage(msg(chatId, type, text, from), env, ctx, BASE + '/'); return sent.slice(); };
const pwdOf = (msgs) => { for (const m of msgs) { const hit = m.text.match(/<code>([A-Z0-9]{4}(?:-[A-Z0-9]{4}){3})<\/code>/); if (hit) return hit[1]; } return ''; };
const cookieOf = (res, name) => { const raw = res.headers.get('Set-Cookie') || ''; const hit = raw.match(new RegExp(name + '=([^;]+)')); return hit ? name + '=' + hit[1] : ''; };
const tableRows = (name) => { try { return env.DB.query('SELECT * FROM ' + name); } catch (_) { return []; } };
const api = async (action, body, { cookie, origin = BASE, method = 'POST' } = {}) => {
	const headers = { 'Content-Type': 'application/json' };
	if (cookie) headers.Cookie = cookie;
	if (origin) headers.Origin = origin;
	const res = await handler.fetch(new Request(BASE + '/admin/api/' + action, method === 'POST' ? { method, headers, body: JSON.stringify(body || {}) } : { method, headers }), env, ctx);
	let json = null;
	try { json = await res.json(); } catch (_) { json = null; }
	return { status: res.status, json, res };
};

log('\n=== 1. 未登录：只给登录页 ===');
{
	const res = await get('/admin');
	const html = await res.text();
	check('GET /admin → 200 登录页', res.status === 200 && /text\/html/.test(res.headers.get('Content-Type') || ''), res.status);
	check('登录页表单提交到 /admin，有密码框', /<form[^>]+method="post"[^>]+action="\/admin"/.test(html) && /type="password"/.test(html), html.slice(0, 300));
	check('登录页提示用 /adminpass 领密码', html.includes('/adminpass'));
	check('登录页零脚本、不缓存、不收录', !/<script/i.test(html) && /no-store/.test(res.headers.get('Cache-Control') || '') && /noindex/.test(res.headers.get('X-Robots-Tag') || ''));
	check('登录页不含黑名单数据', !html.includes('1001'));
}

log('\n=== 2. /adminpass：只有第一主人私聊能领 ===');
let pwd = '';
{
	let out = await say(OTHER, 'private', '/adminpass', OTHER);
	check('非主人私聊 → 不发密码、不入库', !pwdOf(out) && tableRows('admin_passwords').length === 0, JSON.stringify(out));
	out = await say(G, 'supergroup', '/adminpass', OWNER);
	check('主人在群里发 → 群里不出现密码、也不生成', !out.some((m) => m.chatId === G && pwdOf([m])) && tableRows('admin_passwords').length === 0, JSON.stringify(out));
	out = await say(OWNER, 'private', '/adminpass', OWNER);
	pwd = pwdOf(out);
	check('主人私聊 → 收到一次性密码', !!pwd && out.every((m) => m.chatId === OWNER), JSON.stringify(out));
	check('回执带后台地址 https://bot.example/admin', out.some((m) => m.text.includes('https://bot.example/admin')), JSON.stringify(out));
	check('D1 只存哈希不存明文', tableRows('admin_passwords').length === 1 && !JSON.stringify(tableRows('admin_passwords')).includes(pwd.replace(/-/g, '')));
}

log('\n=== 3. 登录与会话 ===');
let cookie = '';
{
	const exportPwd = pwdOf(await say(OWNER, 'private', '/exportpass', OWNER));
	let res = await loginAt('/admin', exportPwd);
	check('导出密码登不进后台（两套密码互不通用）', !!exportPwd && res.status === 401 && !res.headers.get('Set-Cookie'), res.status);
	res = await loginAt('/admin', 'AAAA-AAAA-AAAA-AAAA');
	check('错密码 → 401 不发 cookie', res.status === 401 && !res.headers.get('Set-Cookie'), res.status);
	res = await loginAt('/admin', pwd);
	cookie = cookieOf(res, 'admin_session');
	const raw = res.headers.get('Set-Cookie') || '';
	check('对密码 → 303 跳回 /admin', res.status === 303 && res.headers.get('Location') === '/admin', res.status + ' ' + res.headers.get('Location'));
	check('cookie HttpOnly + Secure + SameSite=Strict + Path=/admin，不设过期', !!cookie && /HttpOnly/i.test(raw) && /Secure/i.test(raw) && /SameSite=Strict/i.test(raw) && /Path=\/admin/i.test(raw) && !/Max-Age|Expires/i.test(raw), raw);
	res = await loginAt('/admin', pwd);
	check('同一密码第二次登录 → 401（一次性）', res.status === 401, res.status);
	res = await loginAt('/export', pwd);
	check('后台密码登不进导出页', res.status === 401, res.status);
	const expHtml = await (await get('/export', cookie.replace('admin_session', 'export_session'))).text();
	check('后台会话 token 不能冒充导出会话', !expHtml.includes('1001'));
}

log('\n=== 4. 后台页面 ===');
{
	const res = await get('/admin', cookie);
	const html = await res.text();
	const csp = res.headers.get('Content-Security-Policy') || '';
	const nonce = (csp.match(/'nonce-([^']+)'/) || [])[1] || '';
	check('登录后 GET /admin → 后台页面', res.status === 200 && html.includes('管理后台') && !html.includes('type="password"'), res.status);
	check('脚本带 nonce 且与 CSP 一致', !!nonce && html.includes('<script nonce="' + nonce + '"'), csp);
	check('CSP 禁止外部脚本、限制 connect 为同源', /connect-src 'self'/.test(csp) && !/unsafe-eval/.test(csp) && /frame-ancestors 'none'/.test(csp), csp);
	check('不缓存、不收录', /no-store/.test(res.headers.get('Cache-Control') || '') && /noindex/.test(res.headers.get('X-Robots-Tag') || ''));
	const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).filter(Boolean);
	let syntaxOk = scripts.length === 1;
	try { for (const s of scripts) new vm.Script(s); } catch (e) { syntaxOk = false; }
	check('页面脚本只有一段且语法正确', syntaxOk, scripts.length);
	const js = scripts.join('');
	check('渲染不用 innerHTML / insertAdjacentHTML / document.write', !/innerHTML|insertAdjacentHTML|document\.write/.test(js));
	check('页面不含 TOKEN / BOT_TOKEN', !html.includes(TOKEN) && !/BOT_TOKEN/.test(html));
	const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
	const accessed = [...js.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]);
	check('脚本访问的元素都存在、id 不重复', ids.length === new Set(ids).size && accessed.every((id) => ids.includes(id)), accessed.filter((id) => !ids.includes(id)).join(','));
	for (const word of ['命令台', '群组', '黑名单', '广告检测', '全体通知', '搜索', '独立模式', '演练', '本群设置', '群统计', '导出密码', '/exportpass', '/check', '/addword', '/learnlast', '/jobrun', '/add_ad_admin', '/whitelist']) {
		check('后台页面含「' + word + '」', html.includes(word));
	}
}

log('\n=== 5. 接口鉴权 ===');
{
	let r = await api('bootstrap', {});
	check('无 cookie → 401', r.status === 401 && r.json?.success === false, r.status);
	r = await api('bootstrap', {}, { cookie, origin: 'https://evil.example' });
	check('跨站 Origin → 403', r.status === 403, r.status);
	r = await api('bootstrap', {}, { cookie, origin: '' });
	check('缺 Origin → 403', r.status === 403, r.status);
	r = await api('bootstrap', null, { cookie, method: 'GET' });
	check('GET → 405', r.status === 405, r.status);
	r = await api('nope/nope', {}, { cookie });
	check('未知接口 → 404', r.status === 404, r.status);
	r = await api('bootstrap', {}, { cookie });
	check('bootstrap 成功，身份是第一主人', r.status === 200 && r.json?.success === true && r.json.data.primaryOwner === true && r.json.data.user.id === OWNER, JSON.stringify(r.json));
	r = await api('groups/list', {}, { cookie });
	check('groups/list 复用小程序接口，含配置群', r.json?.success === true && r.json.data.some((g) => g.chatId === G), JSON.stringify(r.json));
	r = await api('blacklist/list', { page: 1 }, { cookie });
	check('blacklist/list 读得到全局黑名单', r.json?.success === true && r.json.data.items.some((x) => String(x.id) === '1001'), JSON.stringify(r.json).slice(0, 200));
}

log('\n=== 6. 命令台：以第一主人私聊身份执行，回执镜像到网页 ===');
{
	let r = await api('web/exec', { command: 'hello' }, { cookie });
	check('不以 / 开头 → 400', r.status === 400, r.status);
	sent.length = 0;
	r = await api('web/exec', { command: '/listgroups' }, { cookie });
	check('/listgroups → 网页拿到回执文本', r.json?.success === true && r.json.data.replies.length > 0 && r.json.data.replies.join('\n').includes(G), JSON.stringify(r.json).slice(0, 300));
	check('回执是纯文本（不含 HTML 标签）', r.json?.success === true && !/<\/?(b|code|a)\b/.test(r.json.data.replies.join('\n')));
	check('Telegram 私聊照常收到（镜像，不拦截）', sent.some((m) => m.chatId === OWNER));
	r = await api('web/exec', { command: '/addword 测试指纹词 keyword' }, { cookie });
	check('/addword 经命令台写进指纹库', r.json?.success === true && tableRows('ad_fingerprints').some((x) => x.value === '测试指纹词'), JSON.stringify(r.json).slice(0, 300));
}

log('\n=== 7. 群级接口（原先只能在群里发的命令）===');
{
	let r = await api('web/localset', { chatId: G, detect: false }, { cookie });
	check('全局群改本群设置 → 400（仅独立群）', r.status === 400, r.status);
	r = await api('web/groupmode', { chatId: '-1009999999999', mode: 'independent' }, { cookie });
	check('非配置群切模式 → 404', r.status === 404, r.status);
	r = await api('web/groupmode', { chatId: G, mode: 'independent' }, { cookie });
	check('切成独立模式', r.json?.success === true && r.json.data.mode === 'independent' && tableRows('group_mode').some((x) => x.chat_id === G && x.mode === 'independent'), JSON.stringify(r.json));
	r = await api('web/localset', { chatId: G, detect: false, action: 'mute' }, { cookie });
	check('本群设置：关检测 + 处置改禁言', r.json?.success === true && tableRows('group_settings').some((x) => x.chat_id === G && Number(x.detect) === 0 && x.action === 'mute'), JSON.stringify(r.json));
	r = await api('web/localwl', { chatId: G, userIds: '2001 2002', add: true }, { cookie });
	check('本群白名单加 2 人', r.json?.success === true && tableRows('group_whitelist').filter((x) => x.chat_id === G).length === 2, JSON.stringify(r.json));
	r = await api('web/localwl', { chatId: G, userIds: '2001', add: false }, { cookie });
	check('本群白名单删 1 人', r.json?.success === true && tableRows('group_whitelist').filter((x) => x.chat_id === G).length === 1, JSON.stringify(r.json));
	await W.ensureGroupBlacklistTable(env);
	env.DB.prepare('INSERT INTO group_blacklist (chat_id, user_id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?, ?)').bind(G, '3003', 'manual', OWNER, '2026-05-22T10:00:00.000Z', '').run();
	r = await api('web/localbans', { chatId: G }, { cookie });
	check('本群黑名单列表', r.json?.success === true && r.json.data.items.some((x) => x.userId === '3003'), JSON.stringify(r.json));
	r = await api('web/localunban', { chatId: G, userIds: '3003' }, { cookie });
	check('本群黑名单解封', r.json?.success === true && !tableRows('group_blacklist').some((x) => x.user_id === '3003'), JSON.stringify(r.json));
	r = await api('web/dryrun', { chatId: G, on: true }, { cookie });
	check('演练开', r.json?.success === true && tableRows('dryrun_groups').some((x) => x.chat_id === G && Number(x.enabled) === 1), JSON.stringify(r.json));
	r = await api('web/dryrun', { chatId: G, on: false }, { cookie });
	check('演练关', r.json?.success === true && tableRows('dryrun_groups').some((x) => x.chat_id === G && Number(x.enabled) === 0), JSON.stringify(r.json));
	r = await api('web/stats', { chatId: G, range: 'week' }, { cookie });
	check('群统计', r.json?.success === true && 'totalMsg' in r.json.data.summary && Array.isArray(r.json.data.ranking.rows), JSON.stringify(r.json));
	r = await api('web/groupmode', { chatId: G, mode: 'global' }, { cookie });
	check('切回全局模式', r.json?.success === true && r.json.data.mode === 'global' && !tableRows('group_mode').some((x) => x.chat_id === G), JSON.stringify(r.json));
	r = await api('web/exportpass', {}, { cookie });
	check('后台生成导出密码 + 登录地址', r.json?.success === true && /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(r.json.data.password) && r.json.data.url === BASE + '/export', JSON.stringify(r.json));
}

log('\n=== 8. 退出登录 ===');
{
	let r = await api('web/logout', {}, { cookie });
	check('退出 → 成功并清 cookie', r.json?.success === true && /admin_session=;/.test(r.res.headers.get('Set-Cookie') || ''), r.res.headers.get('Set-Cookie'));
	r = await api('bootstrap', {}, { cookie });
	check('退出后旧 cookie → 401', r.status === 401, r.status);
}

log('\n=== 9. 菜单只留五条 + /help 指向后台 ===');
{
	calls.length = 0;
	await handler.fetch(new Request(BASE + '/' + TOKEN), env, ctx);
	const cmds = (calls.find((c) => c.method === 'setMyCommands')?.body?.commands || []).map((c) => c.command);
	check('setMyCommands 只注册 ban spam check unban stats groupmode', JSON.stringify(cmds) === JSON.stringify(['ban', 'spam', 'check', 'unban', 'stats', 'groupmode']), JSON.stringify(cmds));
	let out = await say(OWNER, 'private', '/help', OWNER);
	const t = out.map((m) => m.text).join('\n');
	check('主人 /help → 给后台地址与 /adminpass', t.includes('https://bot.example/admin') && t.includes('/adminpass'), t);
	check('主人 /help → 不再列长清单', !t.includes('/learnlast') && !t.includes('/clearsamples') && t.length < 800, t.length);
	out = await say(OTHER, 'private', '/help', OTHER);
	check('非主人 /help → 权限不足', out.some((m) => m.text.includes('权限不足')) && !out.some((m) => m.text.includes('/admin')), JSON.stringify(out));
	out = await say(OWNER, 'private', '/listgroups', OWNER);
	check('菜单里没有的 /listgroups 照样能用', out.some((m) => m.text.includes(G)), JSON.stringify(out));
	out = await say(OWNER, 'private', '/admins', OWNER);
	check('菜单里没有的 /admins 照样能用', out.length > 0 && !out.some((m) => m.text.includes('权限不足')), JSON.stringify(out));
}

log('\n=== 10. 正式密码 ADMIN_PASSWORD（A 方案：设了用正式密码，没设退回 /adminpass）===');
// 【2026-10-25 主人定】后台密码改成环境变量 ADMIN_PASSWORD（Dashboard 设，可自定义），地址仍是 域名/admin。
// /adminpass 保留作备用：没设（或设得太短 < 8 位）时照旧领一次性密码；设了就停用。
// 防爆破：同一 IP 15 分钟内错 5 次 → 锁 15 分钟，锁定期间密码对了也不放行。改密码 → 旧会话全部失效。
{
	const loginIp = (password, ip) => handler.fetch(new Request(BASE + '/admin', {
		method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: BASE, 'CF-Connecting-IP': ip },
		body: new URLSearchParams({ password }).toString(), redirect: 'manual'
	}), env, ctx);
	// 把沙箱里的 Date.now 拨快 sec 秒（0 = 拨回真实时间），用来验证 15 分钟解锁。
	const shiftClock = (sec) => vm.runInContext('(() => { const r = Date.__realNow || Date.now; Date.__realNow = r; const off = ' + sec + ' * 1000; Date.now = () => r() + off; })()', W);
	const PW1 = 'Mock-Admin-Pass-0001';
	const PW2 = 'Mock-Admin-Pass-0002';
	const oldOneTime = pwdOf(await say(OWNER, 'private', '/adminpass', OWNER));
	env.ADMIN_PASSWORD = PW1;
	let html = await (await get('/admin')).text();
	check('★ 设了正式密码 → 登录页提示用正式密码、不再提 /adminpass', html.includes('ADMIN_PASSWORD') && !html.includes('/adminpass'), html.slice(0, 600));
	const before = tableRows('admin_passwords').length;
	let out = await say(OWNER, 'private', '/adminpass', OWNER);
	check('★ 设了正式密码 → /adminpass 停用、不生成密码', !pwdOf(out) && out.some((m) => m.text.includes('ADMIN_PASSWORD')) && tableRows('admin_passwords').length === before, JSON.stringify(out));
	let res = await loginIp(oldOneTime, '198.51.100.1');
	check('★ 设了正式密码 → 旧的一次性密码登不进', !!oldOneTime && res.status === 401 && !res.headers.get('Set-Cookie'), res.status);
	res = await loginIp('Mock-Wrong-Pass-9999', '198.51.100.1');
	check('★ 正式密码错 → 401 不发 cookie', res.status === 401 && !res.headers.get('Set-Cookie'), res.status);
	res = await loginIp(PW1, '198.51.100.2');
	const pwCookie = cookieOf(res, 'admin_session');
	check('★ 正式密码对 → 303 + 会话 cookie', res.status === 303 && !!pwCookie, res.status);
	let r = await api('bootstrap', {}, { cookie: pwCookie });
	check('★ 正式密码会话能用后台接口', r.status === 200 && r.json?.success === true, r.status);
	res = await loginIp(PW1, '198.51.100.2');
	check('★ 正式密码可反复登录（不是一次性）', res.status === 303 && !!cookieOf(res, 'admin_session'), res.status);
	check('★ D1 里不存正式密码明文', !JSON.stringify(tableRows('admin_sessions')).includes(PW1) && !JSON.stringify(tableRows('admin_login_failures')).includes(PW1));

	for (let i = 0; i < 5; i += 1) await loginIp('Mock-Wrong-Pass-' + i, '198.51.100.7');
	res = await loginIp(PW1, '198.51.100.7');
	const lockedHtml = await res.text();
	check('★ 同 IP 错 5 次 → 锁定，密码对了也不放行', res.status === 429 && !res.headers.get('Set-Cookie') && lockedHtml.includes('分钟'), res.status);
	res = await loginIp(PW1, '198.51.100.8');
	check('★ 锁定只针对那个 IP，别的 IP 照常登录', res.status === 303, res.status);
	shiftClock(901);
	res = await loginIp(PW1, '198.51.100.7');
	check('★ 15 分钟后解锁', res.status === 303, res.status);
	shiftClock(0);
	for (let i = 0; i < 4; i += 1) await loginIp('Mock-Wrong-Pass-' + i, '198.51.100.9');
	res = await loginIp(PW1, '198.51.100.9');
	check('★ 错 4 次不锁，密码对了照常进，并清零计数', res.status === 303 && !tableRows('admin_login_failures').some((x) => x.ip === '198.51.100.9'), res.status);

	env.ADMIN_PASSWORD = PW2;
	r = await api('bootstrap', {}, { cookie: pwCookie });
	check('★ Dashboard 改了密码 → 旧会话立即失效', r.status === 401, r.status);
	res = await loginIp(PW1, '198.51.100.3');
	check('★ 改密码后旧密码登不进', res.status === 401, res.status);
	res = await loginIp(PW2, '198.51.100.3');
	check('★ 新密码登得进', res.status === 303, res.status);

	env.ADMIN_PASSWORD = 'short';
	res = await loginIp('short', '198.51.100.4');
	const shortHtml = await res.text();
	check('★ 密码少于 8 位 → 拒绝登录并提示去改', res.status === 401 && shortHtml.includes('8 位'), res.status + ' ' + shortHtml.slice(-300));
	out = await say(OWNER, 'private', '/adminpass', OWNER);
	check('★ 密码太短时 /adminpass 照旧可用（不把主人锁在门外）', !!pwdOf(out), JSON.stringify(out));
	delete env.ADMIN_PASSWORD;
	out = await say(OWNER, 'private', '/adminpass', OWNER);
	const fallbackPwd = pwdOf(out);
	res = await loginIp(fallbackPwd, '198.51.100.5');
	check('★ 没设变量 → /adminpass 一次性密码照旧能登录', !!fallbackPwd && res.status === 303, res.status);
}

console.log('\n网页管理后台验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
