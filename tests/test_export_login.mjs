// 域名/export 一次性密码登录 · 离线验证
//
// 口径（2026-10-24 主人拍板）：
//   · 第一主人私聊 /exportpass → 机器人生成随机一次性密码回给主人，主人转发给可信用户
//   · 可信用户打开 域名/export 输入密码 → 看 / 下载全局黑名单（与 /{TOKEN}/export 同一份）
//   · 密码登录成功一次即作废；会话 cookie 不设过期时间，关掉浏览器就得重新登录
//   · 旧入口 /export/{EXPORT_KEY} 删除
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
const sent = [];
const sandbox = {
	console: { log() {}, warn() {}, error() {}, info() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers, AbortController,
	atob, btoa, setTimeout, clearTimeout, crypto: globalThis.crypto,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		if (m === 'sendMessage') sent.push({ chatId: String(b?.chat_id), text: String(b?.text || '') });
		const payload = m === 'sendMessage' ? { ok: true, result: { message_id: 9000 + sent.length } } : { ok: true, result: true };
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
const env = { TOKEN: 'TESTTOKEN-0001', BOT_TOKEN: '1:x', GROUP_ID: G, OWNER_IDS: OWNER, DB: makeD1() };
W.applyRuntimeConfig(W.loadRequiredConfig(env));
await W.ensureD1Table(env);
for (const [id, at] of [['1001', '2026-05-22T10:00:00.000Z'], ['1002', '2026-05-23T11:00:00.000Z'], ['1003', '2026-05-24T12:00:00.000Z']]) {
	env.DB.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)').bind(id, 'manual_ban', OWNER, at, '').run();
}
const ctx = { waitUntil() {} };
const BASE = 'https://bot.example';

const get = (path, cookie) => handler.fetch(new Request(BASE + path, { headers: cookie ? { Cookie: cookie } : {} }), env, ctx);
const login = (password) => handler.fetch(new Request(BASE + '/export', {
	method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ password }).toString(), redirect: 'manual'
}), env, ctx);
const msg = (chatId, type, text, from) => ({ message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: Number(chatId), type }, from: { id: Number(from), first_name: 'U' + from }, text });
const askPassword = async (chatId, type, from) => { sent.length = 0; await W.handleMessage(msg(chatId, type, '/exportpass', from), env, ctx, BASE + '/'); return sent.slice(); };
const pwdOf = (msgs) => { for (const m of msgs) { const hit = m.text.match(/<code>([A-Z0-9]{4}(?:-[A-Z0-9]{4}){3})<\/code>/); if (hit) return hit[1]; } return ''; };
const sessionCookie = (res) => { const raw = res.headers.get('Set-Cookie') || ''; const hit = raw.match(/export_session=([^;]+)/); return hit ? 'export_session=' + hit[1] : ''; };
const pwdRows = () => { try { return env.DB.query('SELECT * FROM export_passwords'); } catch (_) { return []; } };

log('\n=== 1. 未登录：只给登录页，不给数据 ===');
{
	const res = await get('/export');
	const html = await res.text();
	check('GET /export → 200 登录页', res.status === 200 && /text\/html/.test(res.headers.get('Content-Type') || ''), res.status);
	check('登录页有密码框，表单提交到 /export', /type="password"/.test(html) && /<form[^>]+method="post"[^>]+action="\/export"/.test(html), html.slice(0, 300));
	check('登录页不含任何黑名单数据', !html.includes('1001') && !html.includes('1003'));
	check('登录页不含脚本（CSP 零脚本）', !/<script/i.test(html) && /script-src|default-src 'none'/.test(res.headers.get('Content-Security-Policy') || ''), res.headers.get('Content-Security-Policy'));
	check('不缓存、不收录', /no-store/.test(res.headers.get('Cache-Control') || '') && /noindex/.test(res.headers.get('X-Robots-Tag') || ''));
}

log('\n=== 2. /exportpass：只有第一主人私聊能领 ===');
{
	let out = await askPassword(OTHER, 'private', OTHER);
	check('非主人私聊 → 不发密码', !pwdOf(out) && pwdRows().length === 0, JSON.stringify(out));
	out = await askPassword(G, 'supergroup', OWNER);
	check('主人在群里发 → 群里不出现密码', !pwdOf(out.filter((m) => m.chatId === G)) && !out.some((m) => m.chatId === G && /export/i.test(m.text)), JSON.stringify(out));
	check('主人在群里发 → 也不生成密码', pwdRows().length === 0, JSON.stringify(pwdRows()));
	out = await askPassword(OWNER, 'private', OWNER);
	const pwd = pwdOf(out);
	check('主人私聊 → 收到 XXXX-XXXX-XXXX-XXXX 格式密码', !!pwd && out.every((m) => m.chatId === OWNER), JSON.stringify(out));
	check('回执里带登录地址 https://bot.example/export', out.some((m) => m.text.includes('https://bot.example/export')), JSON.stringify(out));
	check('D1 只存哈希，不存明文', pwdRows().length === 1 && !JSON.stringify(pwdRows()).includes(pwd) && !JSON.stringify(pwdRows()).includes(pwd.replace(/-/g, '')), JSON.stringify(pwdRows()));
	const pwd2 = pwdOf(await askPassword(OWNER, 'private', OWNER));
	check('每次领的都是新的随机密码', !!pwd2 && pwd2 !== pwd, pwd + ' / ' + pwd2);
	globalThis.__pwd = pwd; globalThis.__pwd2 = pwd2;
}

log('\n=== 3. 登录：错密码 401，对密码发会话 cookie（无过期 = 关浏览器即失效） ===');
let cookie = '';
{
	let res = await login('AAAA-AAAA-AAAA-AAAA');
	const html = await res.text();
	check('错密码 → 401 + 提示 + 不发 cookie', res.status === 401 && /密码错误|已失效/.test(html) && !res.headers.get('Set-Cookie') && !html.includes('1001'), res.status);
	res = await login(globalThis.__pwd);
	cookie = sessionCookie(res);
	const raw = res.headers.get('Set-Cookie') || '';
	check('对密码 → 303 跳回 /export', res.status === 303 && res.headers.get('Location') === '/export', res.status + ' ' + res.headers.get('Location'));
	check('cookie 带 HttpOnly、Secure、SameSite=Strict、Path=/export', !!cookie && /HttpOnly/i.test(raw) && /Secure/i.test(raw) && /SameSite=Strict/i.test(raw) && /Path=\/export/i.test(raw), raw);
	check('cookie 不设过期时间（关掉浏览器就要重新登录）', !/Max-Age/i.test(raw) && !/Expires/i.test(raw), raw);
	res = await login(globalThis.__pwd);
	check('同一个密码第二次登录 → 401（一次性）', res.status === 401 && !res.headers.get('Set-Cookie'), res.status);
	res = await login(globalThis.__pwd2.toLowerCase().replace(/-/g, ''));
	check('小写、不带横杠也认（手抄方便）', res.status === 303 && !!sessionCookie(res), res.status);
}

log('\n=== 4. 登录后：看 / 下载全局黑名单 ===');
{
	let res = await get('/export', cookie);
	const html = await res.text();
	check('带会话 → 黑名单页，总计 3 条', res.status === 200 && html.includes('总计：<b>3</b>') && html.includes('1001') && html.includes('1003'), html.slice(0, 200));
	check('下载按钮走 /export，页面不出现 TOKEN', html.includes('/export?format=csv') && html.includes('/export?format=json') && !html.includes(env.TOKEN));
	check('数据页同样不缓存、不收录、不带 Referer', /no-store/.test(res.headers.get('Cache-Control') || '') && /noindex/.test(res.headers.get('X-Robots-Tag') || '') && res.headers.get('Referrer-Policy') === 'no-referrer');
	res = await get('/export?format=csv', cookie);
	const csv = await res.text();
	check('CSV 下载', res.status === 200 && /attachment/.test(res.headers.get('Content-Disposition') || '') && csv.split('\r\n').length === 4, csv.slice(0, 100));
	res = await get('/export?format=json', cookie);
	check('JSON 下载', res.status === 200 && JSON.parse(await res.text()).length === 3);
	res = await get('/export?format=csv');
	check('没会话直接下 CSV → 登录页，不给文件', !/attachment/.test(res.headers.get('Content-Disposition') || '') && !(await res.text()).includes('1001'));
	res = await get('/export', 'export_session=forged-session-value');
	check('伪造 cookie → 登录页', !(await res.text()).includes('1001'));
	env.DB.prepare('UPDATE export_sessions SET expires_at = 1').run();
	res = await get('/export', cookie);
	check('会话超过服务端上限 → 重新登录', !(await res.text()).includes('1001'));
}

log('\n=== 5. 没用过的密码也会过期 ===');
{
	const pwd = pwdOf(await askPassword(OWNER, 'private', OWNER));
	env.DB.prepare('UPDATE export_passwords SET expires_at = 1 WHERE used_at = 0').run();
	const res = await login(pwd);
	check('过期的密码 → 401', res.status === 401 && !res.headers.get('Set-Cookie'), res.status);
}

log('\n=== 6. 旧入口删除、TOKEN 导出照旧 ===');
{
	const envWithKey = { ...env, EXPORT_KEY: 'export-key-for-test-0001' };
	const res = await handler.fetch(new Request(BASE + '/export/export-key-for-test-0001'), envWithKey, ctx);
	check('/export/{EXPORT_KEY} 不再给数据', res.status !== 200 || !(await res.text()).includes('1001'), res.status);
	check('源码里不再有 EXPORT_KEY 入口', !/EXPORT_KEY/.test(src) && !/handleKeyedExport/.test(src));
	const t = await get('/' + env.TOKEN + '/export');
	check('/{TOKEN}/export 照旧可用', t.status === 200 && (await t.text()).includes('1001'));
	sent.length = 0;
	await W.handleMessage(msg(OWNER, 'private', '/help', OWNER), env, ctx, BASE + '/');
	// 【改口径】/help 清空成后台入口，/exportpass 的说明搬进网页后台的命令手册与「导出密码」分区
	// （test_web_admin.mjs 第 4 节断言后台页面含 /exportpass）。这里改成断言 /help 指向后台。
	check('主人 /help 指向网页后台（/exportpass 已搬进后台）', sent.some((m) => m.text.includes(BASE + '/admin') && m.text.includes('/adminpass')), sent.map((m) => m.text.slice(0, 80)).join(' | '));
}

log('\n' + (fail ? '❌' : '✅') + ' 导出登录：' + pass + ' 通过，' + fail + ' 失败');
process.exit(fail ? 1 : 0);
