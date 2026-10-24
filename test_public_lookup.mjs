// 公开封禁查询（GET /{TGID}，方案 B，2026-10-24）
// 给普通用户的只读入口：不要 TOKEN，不碰任何管理功能。
// 结果两块：GKY 封禁库 + 本机器人全局黑名单，按 GKY 详情页字段逐行展示。
// 2026-10-24 主人改口径：原因 / 备注 / 消息原文公开，操作人只显示身份（附链接），操作人 TGID 数字不出门。
// D1 用 node:sqlite 内存库，跑真实 SQL；GKY 上游用假 fetch。

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '_worker.js'), 'utf8');

function stripExportDefault(source) {
	const start = source.indexOf('export default');
	const braceStart = source.indexOf('{', start);
	let depth = 0;
	let i = braceStart;
	for (; i < source.length; i++) {
		if (source[i] === '{') depth++;
		else if (source[i] === '}') {
			depth--;
			if (depth === 0) { i++; break; }
		}
	}
	if (source[i] === ';') i++;
	return source.slice(0, start) + 'globalThis.__handler = ' + source.slice(start + 'export default'.length, i) + ';' + source.slice(i);
}

// GKY 上游：按 tgid 返回不同页面；gkyMode='down' 时模拟上游不可达
let gkyMode = 'ok';
const gkyCalls = [];
const tgCalls = [];
const GKY_BANNED_HTML = '<p><strong>TGID:</strong> 222222222</p><p><strong>ChatID:</strong> -1001111111111</p><p><strong>MsgID:</strong> 77</p><p><strong>Reason:</strong> SpamGP</p><p>Recorded Date: 2026-01-02</p><p><strong>Info:</strong></p>示例广告<script>alert(1)</script><br>';
const sandbox = {
	console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const raw = String(url);
		if (raw.includes('gkybot')) {
			gkyCalls.push(raw);
			if (gkyMode === 'down') throw new Error('network down');
			const tgid = new URL(raw).searchParams.get('tgid');
			const html = tgid === '222222222' ? GKY_BANNED_HTML : '此TG账号并沒有封鎖記錄';
			return { ok: true, status: 200, text: async () => html, json: async () => ({}) };
		}
		tgCalls.push(raw.split('/').pop());
		return { ok: true, status: 200, text: async () => '{}', json: async () => ({ ok: true, result: true }) };
	},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });
const handler = sandbox.__handler;

// node:sqlite 包成 D1 接口，顺带记下每条 SQL
function makeSqliteD1(options = {}) {
	const db = new DatabaseSync(':memory:');
	const sqlLog = [];
	const wrap = (sql) => {
		let args = [];
		sqlLog.push(sql);
		const stmt = {
			bind(...a) { args = a; return stmt; },
			async first() { if (options.fail) throw new Error('D1_ERROR: forced'); const r = db.prepare(sql).get(...args); return r ? { ...r } : null; },
			async run() { if (options.fail) throw new Error('D1_ERROR: forced'); const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
			async all() { if (options.fail) throw new Error('D1_ERROR: forced'); return { results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }; },
		};
		return stmt;
	};
	return {
		_db: db, sqlLog,
		prepare: wrap,
		async exec(sql) { if (options.fail) throw new Error('D1_ERROR: forced'); sqlLog.push(sql); db.exec(sql); },
		async batch(stmts) { const out = []; for (const s of stmts) out.push(await s.all()); return out; },
	};
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
	if (cond) { pass++; process.stdout.write(`  ✅ ${name}\n`); }
	else { fail++; process.stdout.write(`  ❌ ${name}${detail ? ' — ' + detail : ''}\n`); }
}

const env = { TOKEN: 'tok-secret', BOT_TOKEN: '0:fake', GROUP_ID: '-1001111111111', OWNER_IDS: '999999999' };
const PRIVATE_REASON = '内部原因-不可外泄';
const PRIVATE_NOTE = '内部备注-不可外泄';
const PRIVATE_BY = '888888888';

const db = makeSqliteD1();
db._db.exec('CREATE TABLE blacklist (id TEXT PRIMARY KEY, reason TEXT, by_user TEXT, at TEXT, note TEXT)');
db._db.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)').run('111111111', PRIVATE_REASON, PRIVATE_BY, '2026-03-04T20:30:00.000Z', PRIVATE_NOTE);
const fullEnv = { ...env, DB: db };
const get = (p, e = fullEnv) => handler.fetch(new Request('https://bot.example' + p), e);

console.log('\n[1] 本地已封禁的人：HTML 页');
{
	const res = await get('/111111111');
	const html = await res.text();
	assert('返回 200 HTML', res.status === 200 && /text\/html/.test(res.headers.get('Content-Type') || ''), res.status + ' ' + res.headers.get('Content-Type'));
	assert('显示「已封禁」', html.includes('已封禁'));
	assert('封禁日期按北京时间显示（UTC 20:30 → 次日 03-05）', html.includes('2026-03-05'), html.slice(0, 300));
	// 2026-10-24 主人定：原因 / 备注改为公开（旧断言「不出现」已反向）；操作人只显示身份，TGID 数字仍不出门
	assert('公开原因（主表 reason 原样）', html.includes(PRIVATE_REASON));
	assert('公开备注（Detail 退回「原因说明：备注」）', html.includes('原因说明：' + PRIVATE_NOTE));
	assert('操作人 TGID 数字不出现', !html.includes(PRIVATE_BY));
	assert('旧记录没有附表 → ChatID / MsgID / 操作人显示「未记录」', html.includes('未记录') && html.includes('ChatID') && html.includes('MsgID') && html.includes('操作人'));
	assert('页面带查询框（可直接换个 ID 查）', /<form[^>]*method="get"/i.test(html) && html.includes('name="tgid"'));
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
	assert('页面只有一段内联脚本（复制 / Back）', (html.match(/<script/gi) || []).length === 1 && scripts.length === 1);
	const csp = res.headers.get('Content-Security-Policy') || '';
	const hash = scripts[0] ? 'sha256-' + crypto.createHash('sha256').update(scripts[0][1], 'utf8').digest('base64') : '';
	assert('CSP 只放行这段脚本的 hash（改脚本忘改 hash 会红）', hash && csp.includes("script-src '" + hash + "'") && !/script-src[^;]*unsafe-inline/.test(csp), csp + ' 现算=' + hash);
	assert('全局块复制 /unban TGID + 群管理员提示', html.includes('data-copy="/unban 111111111"') && html.includes('被第一主人封杀的用户无法解封'));
	assert('页面有 Back、深色', html.includes('data-back') && html.includes('color-scheme" content="dark"'));
}

console.log('\n[2] ?format=json');
{
	const res = await get('/111111111?format=json');
	const data = await res.json();
	assert('local.banned=true + since 日期', data.local && data.local.banned === true && data.local.since === '2026-03-05', JSON.stringify(data.local));
	const localKeys = Object.keys(data.local || {}).sort().join(',');
	assert('local 字段集合 = GKY 同款字段 + 操作人 / Detail', localKeys === 'banned,chatId,detail,info,msgId,operator,reason,reasonCode,since,tgid', localKeys);
	const json = JSON.stringify(data);
	assert('JSON 含原因 / 备注、不含操作人 TGID', json.includes(PRIVATE_REASON) && json.includes(PRIVATE_NOTE) && !json.includes(PRIVATE_BY), json);
	assert('gky 结果照常带回', data.gky && data.gky.success === true && data.gky.banned === false, JSON.stringify(data.gky));
	assert('tgid 回显', data.tgid === '111111111');
}

console.log('\n[3] 本地未封禁、GKY 命中');
{
	const data = await (await get('/222222222?format=json')).json();
	assert('local.banned=false', data.local && data.local.banned === false, JSON.stringify(data.local));
	assert('GKY 命中 + 原因映射中文', data.gky && data.gky.banned === true && data.gky.reason === '群众举报', JSON.stringify(data.gky));
	const html = await (await get('/222222222')).text();
	assert('HTML 的 Reason 写成「原始代码（中文）」', html.includes('SpamGP（群众举报）'));
	assert('HTML 显示 GKY 的 ChatID / MsgID', html.includes('-1001111111111') && html.includes('<strong>77</strong>'));
	assert('GKY 内容里的 <script> 不会原样进页面', !html.includes('<script>alert(1)') && (html.match(/<script/gi) || []).length === 1 && html.includes('示例广告'));
	assert('GKY 块复制 GKYbotSave + 换行 + TGID', html.includes('data-copy="GKYbotSave\n222222222"'));
	assert('解锁只是复制按钮（type=button，不是表单 / 链接）', /<button type="button" class="unlock" data-copy=/.test(html) && !/action="[^"]*unban/i.test(html));
}

console.log('\n[4] 上游与 D1 故障互不连坐');
{
	gkyMode = 'down';
	const res = await get('/111111111?format=json');
	const data = await res.json();
	gkyMode = 'ok';
	assert('GKY 挂了仍 200，本地结果照出', res.status === 200 && data.local && data.local.banned === true, res.status + ' ' + JSON.stringify(data));
	assert('GKY 挂了给中文错误', data.gky && data.gky.success === false && /暂时无法查询/.test(data.gky.error || ''), JSON.stringify(data.gky));
	const bad = makeSqliteD1({ fail: true });
	const r2 = await get('/111111111?format=json', { ...env, DB: bad });
	const d2 = await r2.json();
	assert('D1 挂了仍 200，GKY 结果照出', r2.status === 200 && d2.gky && d2.gky.success === true, r2.status + ' ' + JSON.stringify(d2));
	assert('D1 挂了 local 给中文错误、不谎报未封禁', d2.local && d2.local.banned === undefined && /暂时无法查询/.test(d2.local.error || ''), JSON.stringify(d2.local));
	const r3 = await get('/111111111?format=json', { ...env });
	const d3 = await r3.json();
	assert('没绑 D1 时 local 说明未启用', d3.local && d3.local.banned === undefined && /未启用/.test(d3.local.error || ''), JSON.stringify(d3.local));
}

console.log('\n[5] 输入校验与路由边界');
{
	gkyCalls.length = 0;
	const r1 = await get('/banlist?tgid=abc');
	const d1 = await r1.json();
	assert('/banlist 非数字 tgid 拒绝且不打上游', d1.success === false && gkyCalls.length === 0, JSON.stringify(d1) + ' calls=' + gkyCalls.length);
	const d2 = await (await get('/banlist?tgid=222222222')).json();
	assert('/banlist 老接口结构不变（只有 GKY 字段）', d2.success === true && d2.banned === true && d2.reason === '群众举报' && d2.local === undefined, JSON.stringify(d2));
	const r3 = await get('/111111111?tgid=333333333', fullEnv);
	assert('查询框提交 ?tgid= → 302 跳到 /333333333', r3.status === 302 && r3.headers.get('Location') === '/333333333', r3.status + ' ' + r3.headers.get('Location'));
	const r4 = await get('/111111111?tgid=12a');
	assert('查询框填了非数字 → 原页提示格式不对、不跳转', r4.status === 400 && (await r4.text()).includes('纯数字'), String(r4.status));
	const r5 = await get('/123456789012345678901');
	assert('超过 20 位不当 TGID（仍 405）', r5.status === 405, String(r5.status));
	const r6 = await handler.fetch(new Request('https://bot.example/111111111', { method: 'POST' }), fullEnv);
	assert('POST /{TGID} 不走公开查询', !(await r6.text()).includes('封禁查询'));
}

console.log('\n[6] 纯数字 TOKEN 不被公开查询抢走');
{
	tgCalls.length = 0;
	const r = await get('/424242', { ...env, TOKEN: '424242', DB: makeSqliteD1() });
	const body = await r.text();
	assert('/{TOKEN} 仍走初始化', !body.includes('封禁查询') && tgCalls.includes('setWebhook'), tgCalls.join(','));
}

console.log('\n[7] 公开查询不碰与它无关的 D1');
{
	const fresh = makeSqliteD1();
	fresh._db.exec('CREATE TABLE blacklist (id TEXT PRIMARY KEY, reason TEXT, by_user TEXT, at TEXT, note TEXT)');
	await get('/111111111', { ...env, DB: fresh });
	const touched = fresh.sqlLog.filter((s) => /dynamic_groups/i.test(s));
	assert('不合并动态群（不读 dynamic_groups）', touched.length === 0, touched.join(' | '));
	const writes = fresh.sqlLog.filter((s) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(s));
	assert('不写任何数据', writes.length === 0, writes.join(' | '));
}

console.log('\n[8] 新记录带附表：ChatID / MsgID / 原文 / 操作人身份链接 / 逐条判据');
{
	const d = makeSqliteD1();
	d._db.exec('CREATE TABLE blacklist (id TEXT PRIMARY KEY, reason TEXT, by_user TEXT, at TEXT, note TEXT)');
	d._db.exec('CREATE TABLE blacklist_detail (id TEXT PRIMARY KEY, chat_id TEXT, msg_id INTEGER, operator_role TEXT, operator_username TEXT, text TEXT, detail TEXT, at TEXT NOT NULL)');
	const ins = d._db.prepare('INSERT INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)');
	const insD = d._db.prepare('INSERT INTO blacklist_detail VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
	ins.run('444444444', 'spam', PRIVATE_BY, '2026-03-04T01:00:00.000Z', '');
	insD.run('444444444', '-1001111111111', 55, 'group_admin', 'fake_admin_x', '<img src=x onerror=alert(1)>买粉加我', JSON.stringify(['命中词表：加我', '操作人 TGID：' + PRIVATE_BY, '同款模板 3 次']), '2026-03-04T01:00:00.000Z');
	ins.run('555555555', 'manual', PRIVATE_BY, '2026-03-04T01:00:00.000Z', '');
	insD.run('555555555', null, null, 'super_admin', null, null, '[]', '2026-03-04T01:00:00.000Z');
	ins.run('666666666', 'ad_auto', '0', '2026-03-04T01:00:00.000Z', '');
	insD.run('666666666', '-1001111111111', 9, 'system', null, '广告原文', JSON.stringify(['AI 判定：广告']), '2026-03-04T01:00:00.000Z');
	const e = { ...env, DB: d };

	const html = await (await get('/444444444', e)).text();
	const data = await (await get('/444444444?format=json', e)).json();
	assert('ChatID 直接显示群 ID', data.local.chatId === '-1001111111111' && html.includes('-1001111111111'), JSON.stringify(data.local));
	assert('MsgID 显示', data.local.msgId === '55' && html.includes('<strong>55</strong>'));
	assert('Reason =「代码（中文）」', data.local.reason === 'spam（/spam 人工举报）' && html.includes('spam（/spam 人工举报）'), data.local.reason);
	assert('操作人 = 群管理员，链接 t.me/用户名', html.includes('<a href="https://t.me/fake_admin_x" rel="noopener noreferrer">群管理员</a>'));
	assert('操作人 TGID 不出现（页面与 JSON）', !html.includes(PRIVATE_BY) && !JSON.stringify(data).includes(PRIVATE_BY));
	assert('Detail 逐条列出、去掉「操作人 TGID」行', html.includes('<li>命中词表：加我</li>') && html.includes('<li>同款模板 3 次</li>') && data.local.detail.length === 2, JSON.stringify(data.local.detail));
	assert('Info = 消息原文，且被转义', html.includes('&lt;img src=x onerror=alert(1)&gt;买粉加我') && !html.includes('<img'));

	const h2 = await (await get('/555555555', e)).text();
	assert('没用户名 → tg://user?id= 并注明可能打不开', h2.includes('href="tg://user?id=' + PRIVATE_BY + '"') && h2.includes('超级管理员') && h2.includes('可能因对方隐私设置打不开'));
	assert('私聊发起（无 chat_id）→ ChatID 显示「未记录」', /ChatID<\/span><strong><em class="muted">未记录/.test(h2));

	const h3 = await (await get('/666666666', e)).text();
	assert('系统自动：只显示身份、不给链接', /操作人<\/span><strong>系统自动<\/strong>/.test(h3));

	const writes = d.sqlLog.filter((s) => /^\s*(INSERT|UPDATE|DELETE|CREATE)\b/i.test(s));
	assert('查附表也不写任何数据 / 不建表', writes.length === 0, writes.join(' | '));
}

console.log(`\n=== 总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail} ===`);
process.exit(fail ? 1 : 0);
