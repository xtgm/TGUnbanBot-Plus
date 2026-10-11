// 统计面板（首页 / 群设置 / 统计子菜单 / 5 个统计页）· 离线验证
// 覆盖：子菜单 5 个入口与分组正文、邀请按钮不渲染、5 个统计页各自文案、
//       层级导航（返回上一层 / 返回首页）、全部原地编辑不新开回复、
//       翻页页码编解码、callback_data 64 字节硬限、仅第一主人双闸、
//       发言计数 message_id 幂等（同一条重投不重复 +1，msgId 缺失不丢计数）。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const sent = [];
const edits = [];        // editMessageText 请求 —— 面板类按钮必须落在这里，不是 sent
const answers = [];      // answerCallbackQuery 回执
let currentAdmins = [];
let memberCountMock = 4855;

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		let payload = { ok: true, result: true };
		if (m === 'sendMessage') {
			sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || ''), markup: b?.reply_markup || null });
			payload = { ok: true, result: { message_id: 9000 + sent.length } };
		} else if (m === 'getChatAdministrators') {
			payload = { ok: true, result: currentAdmins.map((id) => ({ user: { id: Number(id) }, status: 'administrator' })) };
		} else if (m === 'getChat') {
			payload = { ok: true, result: { id: b?.chat_id, title: '统计测试群', type: 'supergroup' } };
		} else if (m === 'getChatMember') {
			payload = { ok: true, result: { status: 'member', user: { id: Number(b?.user_id) } } };
		} else if (m === 'getChatMemberCount') {
			payload = { ok: true, result: memberCountMock };
		} else if (m === 'getMe') {
			payload = { ok: true, result: { id: 42, username: 'testbot', is_bot: true } };
		} else if (m === 'editMessageText') {
			edits.push({ chatId: String(b?.chat_id ?? ''), messageId: Number(b?.message_id) || 0,
				text: String(b?.text || ''), markup: b?.reply_markup || null });
			payload = { ok: true, result: { message_id: Number(b?.message_id) || 0 } };
		} else if (m === 'answerCallbackQuery') {
			answers.push({ id: String(b?.callback_query_id ?? ''), text: String(b?.text || '') });
			payload = { ok: true, result: true };
		}
		return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.replace(/export\s+default\s*/, 'globalThis.__h = '), sandbox, { filename: '_worker.js' });
const W = sandbox;
vm.runInContext('(() => { const real = Date.now.bind(Date); Date.now = () => (typeof globalThis.__clock === "function" ? globalThis.__clock() : real()); })();', sandbox);
W.__clock = null;

function makeD1() {
	const db = new DatabaseSync(':memory:');
	const nIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const nOut = (r) => { if (!r) return null; const o = {}; for (const k of Object.keys(r)) o[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k]; return o; };
	const exec = (sql, params) => {
		const st = db.prepare(sql);
		const bd = params.map(nIn);
		const up = sql.trim().slice(0, 6).toUpperCase();
		if (up === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		const i = st.run(...bd);
		return { kind: 'write', meta: { changes: Number(i?.changes || 0), last_row_id: Number(i?.lastInsertRowid || 0) } };
	};
	const mk = (sql) => {
		const s = { sql, params: [] };
		const a = {
			bind(...x) { s.params = x; return a; },
			async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
			async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; },
			async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; }
		};
		return a;
	};
	return {
		prepare: mk,
		async exec(sql) { for (const p of String(sql).split(';')) { const s = p.trim(); if (s) db.exec(s); } return { count: 1 }; },
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; },
		query(sql) { return db.prepare(sql).all().map(nOut); }
	};
}

let pass = 0, fail = 0;
function check(label, cond, extra) {
	if (cond) { pass += 1; console.log('  ✅ ' + label + (extra ? '  ' + extra : '')); }
	else { fail += 1; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
}

const GROUPS = ['-100111', '-100222'];
const OWNER = '10001', DEPUTY = '10002';
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUPS.join(','), OWNER_IDS: OWNER + ',' + DEPUTY, DB: makeD1() };
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });

const GROUP = '-100111';
const clear = () => { sent.length = 0; edits.length = 0; answers.length = 0; };
const menuData = (action, chatId, page) => 'menu:' + W.encodeAdCallbackToken(action + '|' + chatId + (page ? '|' + page : ''));
const texts = (kb) => (kb?.inline_keyboard || []).flat().map((b) => String(b.text || ''));
const hasBtn = (kb, t) => texts(kb).some((x) => x.includes(t));
const driveCb = async (cq) => {
	const p = [];
	await W.__h.fetch(new Request('https://x/', { method: 'POST', body: JSON.stringify({ callback_query: cq }) }),
		env, { waitUntil: (x) => p.push(Promise.resolve(x)) });
	await Promise.allSettled(p);
};
const clearAll = () => { sent.length = 0; edits.length = 0; answers.length = 0; };

// ---------- 0. 造数据：排行必须有 rows 才测得了文案，且要跨过 30/页 的翻页线 ----------
console.log('\n=== 0. 造 35 条发言（STAT_RANKING_PAGE_LIMIT=30 → 共 2 页） ===');
for (let i = 0; i < 35; i += 1) {
	await W.recordSpeechStat(env, GROUP, { id: 'u' + (100 + i), first_name: '用户' + i }, Date.now(), 60000 + i);
}
{
	const row = (await W.queryStatRanking(env, GROUP, 'day', 1)).totalPages;
	check('造数后今日排行共 2 页（翻页可测）', row === 2, String(row));
}

// ---------- 1. 统计子菜单 ----------
console.log('\n=== 1. 统计子菜单（5 个入口，邀请不渲染） ===');
const sub = W.renderStatsSubmenu(GROUP, '统计测试群');
check('5 个统计按钮齐全', ['今日发言排名', '7日发言排名', '7日发言统计', '今日进退群数据', '7日进退群统计']
	.every((t) => hasBtn(sub.keyboard, t)), JSON.stringify(texts(sub.keyboard)));
check('邀请统计按钮不渲染（他没提，不进方案）',
	!hasBtn(sub.keyboard, '邀请'), JSON.stringify(texts(sub.keyboard)));
check('正文带「返回上一层」语义的导航', hasBtn(sub.keyboard, '返回上一层') && hasBtn(sub.keyboard, '返回首页'),
	JSON.stringify(texts(sub.keyboard)));
check('分组信息写在正文而不是做成死按钮',
	sub.text.includes('发言统计') && sub.text.includes('进退群统计'), JSON.stringify(sub.text.slice(0, 60)));

// ---------- 2. 5 个统计页文案 ----------
console.log('\n=== 2. 5 个统计页各自文案（只读 D1，零建表） ===');
const kinds = ['today_rank', 'week_rank', 'week_daily', 'today_jl', 'week_jl'];
const want = {
	today_rank: ['今日发言排名', '今日总发言', '发言排行'],
	week_rank: ['7日发言排名', '7日发言总数', '发言排行'],
	week_daily: ['7日发言统计', '2026-'],
	today_jl: ['今日进退群数据', '今日进群', '退群'],
	week_jl: ['7日进退群统计', '入群共', '退群共']
};
for (const kind of kinds) {
	const r = await W.renderStatsSubPage(env, GROUP, kind, '统计测试群', 1);
	const okText = want[kind].every((t) => r.text.includes(t));
	check('[' + kind + '] 文案含 ' + want[kind].join('/'), okText, JSON.stringify(r.text.slice(0, 70)));
	check('[' + kind + '] 键盘挂「返回上一层」', hasBtn(r.keyboard, '返回上一层'));
	check('[' + kind + '] 键盘挂「返回首页」', hasBtn(r.keyboard, '返回首页'));
}

// ---------- 3. callback_data 64 字节硬限 ----------
console.log('\n=== 3. callback_data 硬限（Telegram 上限 64 字节） ===');
let longest = '';
const allKeyboards = [sub.keyboard, ...(await Promise.all(kinds.map((k) => W.renderStatsSubPage(env, GROUP, k, 't', 1)))).map((r) => r.keyboard)];
for (const kb of allKeyboards) {
	for (const b of (kb?.inline_keyboard || []).flat()) {
		if (b.callback_data && b.callback_data.length > longest.length) longest = b.callback_data;
	}
}
check('最长 callback_data ≤ 64 字节', longest.length <= 64, '最长=' + longest.length + ' ' + longest);
check('还有页码版（action|chatId|2）也不超限',
	menuData('g1', GROUP, 2).length <= 64, String(menuData('g1', GROUP, 2).length));

// ---------- 4. 端到端：全部原地编辑、不新开回复 ----------
console.log('\n=== 4. 端到端：按钮一律原地编辑（不新开回复） ===');
clearAll();
await driveCb({ id: 'c1', from: { id: Number(OWNER), is_bot: false },
	message: { message_id: 801, chat: { id: Number(GROUP), type: 'supergroup' }, text: '面板' },
	data: menuData('sm', GROUP) });
check('点「统计」→ 原地编辑出子菜单', edits.length === 1 && edits[0].text.includes('统计'), JSON.stringify(edits.map((x) => x.text.slice(0, 30))));
check('  ↑ 没新开一条回复', sent.length === 0, JSON.stringify(sent.map((x) => x.text.slice(0, 24))));

for (const [action, needle] of [['g1', '今日发言排名'], ['g2', '7日发言排名'], ['g3', '7日发言统计'],
	['g4', '今日进退群数据'], ['g5', '7日进退群统计']]) {
	clearAll();
	await driveCb({ id: 'c_' + action, from: { id: Number(OWNER), is_bot: false },
		message: { message_id: 802, chat: { id: Number(GROUP), type: 'supergroup' }, text: '面板' },
		data: menuData(action, GROUP) });
	check('点[' + needle + '] → 原地编辑出该页',
		edits.length === 1 && edits[0].text.includes(needle) && sent.length === 0,
		JSON.stringify(edits.map((x) => x.text.slice(0, 30))) + (sent.length ? ' 多发了' : ''));
}

clearAll();
await driveCb({ id: 'c_pg', from: { id: Number(OWNER), is_bot: false },
	message: { message_id: 803, chat: { id: Number(GROUP), type: 'supergroup' }, text: '面板' },
	data: menuData('g1', GROUP, 2) });
check('带页码的 token 解析出第 2 页（不报「按钮数据已失效」）',
	edits.length === 1 && edits[0].text.includes('第 2/') && !answers.some((a) => a.text.includes('失效')),
	JSON.stringify(edits.map((x) => x.text.slice(0, 40))));
clearAll();
await driveCb({ id: 'c_home', from: { id: Number(OWNER), is_bot: false },
	message: { message_id: 804, chat: { id: Number(GROUP), type: 'supergroup' }, text: '面板' },
	data: menuData('pk', GROUP) });
check('点「返回首页」→ 原地编辑出首页（群选择）',
	edits.length === 1 && edits[0].text.includes('统计面板') && sent.length === 0,
	JSON.stringify(edits.map((x) => x.text.slice(0, 40))));
check('首页带「添加到群组」与「添加到频道」两颗 url 按钮',
	!!edits[0] && texts(edits[0].markup).some((t) => t.includes('添加到群组'))
		&& texts(edits[0].markup).some((t) => t.includes('添加到频道')),
	JSON.stringify(texts(edits[0]?.markup)));

clearAll();
await driveCb({ id: 'c_noop', from: { id: Number(OWNER), is_bot: false },
	message: { message_id: 805, chat: { id: Number(GROUP), type: 'supergroup' }, text: '面板' },
	data: menuData('noop', GROUP) });
check('页码指示位 noop → 只应答不渲染（按钮不会一直转圈）',
	edits.length === 0 && sent.length === 0 && answers.length === 1,
	JSON.stringify({ edits: edits.length, sent: sent.length, answers: answers.length }));

// ---------- 5. 权限双闸 ----------
console.log('\n=== 5. 权限：只有第一主人能进 ===');
clearAll();
await driveCb({ id: 'c_denied', from: { id: 8888, is_bot: false },
	message: { message_id: 806, chat: { id: Number(GROUP), type: 'supergroup' }, text: '面板' },
	data: menuData('sm', GROUP) });
check('非第一主人点统计子菜单 → 不渲染', edits.length === 0 && sent.length === 0,
	JSON.stringify({ edits: edits.length, sent: sent.length }));
check('  ↑ 应答「仅限第一主人」', answers.some((a) => a.text.includes('仅限第一主人')), JSON.stringify(answers));

clearAll();
await driveCb({ id: 'c_denied2', from: { id: 8888, is_bot: false },
	message: { message_id: 807, chat: { id: Number(GROUP), type: 'supergroup' }, text: '面板' },
	data: menuData('g1', GROUP) });
check('非第一主人点具体统计页 → 同样不渲染', edits.length === 0 && sent.length === 0);

// ---------- 6. 群管理菜单入口改造 ----------
console.log('\n=== 6. 群管理菜单：统计入口指向子菜单 + 切换群 ===');
const rootMenu = W.renderGroupSettingsMenu(GROUP, '统计测试群');
const rootTexts = texts(rootMenu.keyboard);
check('「统计」按钮指向子菜单 action=sm',
	!!(rootMenu.keyboard.inline_keyboard.flat().find((b) => b.text.includes('统计')) || {}).callback_data
		?.includes(W.encodeAdCallbackToken('sm|' + GROUP).slice(0, 8)),
	JSON.stringify(rootTexts));
check('带「切换群」按钮', rootTexts.some((t) => t.includes('切换群')), JSON.stringify(rootTexts));
check('资料卡 / 运行检查两个老入口仍在',
	rootTexts.some((t) => t.includes('资料卡')) && rootTexts.some((t) => t.includes('运行检查')), JSON.stringify(rootTexts));

// ---------- 7. 发言计数 message_id 幂等 ----------
console.log('\n=== 7. 发言计数幂等（精准） ===');
const day = W.statDayString(env, Date.now());
const countOf = (uid) => Number(env.DB.query(
	"SELECT msg_count FROM stat_speech WHERE chat_id='" + GROUP + "' AND user_id='" + uid + "' AND day='" + day + "'"
)[0]?.msg_count || 0);
const speak = (uid, msgId) => W.recordSpeechStat(env, GROUP, { id: uid, first_name: 'U' }, Date.now(), msgId);

check('stat_speech 已带 last_msg_id 列（建表 + 存量 ALTER 两条路径都走）',
	env.DB.query("SELECT last_msg_id FROM stat_speech LIMIT 1").length >= 0
		|| env.DB.query("PRAGMA table_info(stat_speech)").some((c) => c.name === 'last_msg_id'),
	JSON.stringify(env.DB.query("PRAGMA table_info(stat_speech)").map((c) => c.name)));

await speak('u_idem', 70001);
check('首条 message_id → 计 1', countOf('u_idem') === 1, String(countOf('u_idem')));
await speak('u_idem', 70001);
check('同一 message_id 重投 → 仍 1（不重复 +1）', countOf('u_idem') === 1, String(countOf('u_idem')));
await speak('u_idem', 70001);
check('再重投一次 → 仍 1', countOf('u_idem') === 1, String(countOf('u_idem')));
await speak('u_idem', 70002);
check('新 message_id → 才 +1（=2）', countOf('u_idem') === 2, String(countOf('u_idem')));

await speak('u_noid', 0);
await speak('u_noid', 0);
check('msgId 拿不到时退回无条件 +1（宁可多计也不丢计数）', countOf('u_noid') === 2, String(countOf('u_noid')));

// 老签名（不传 msgId）必须仍是 +1 —— 既有调用与既有测试不许退化
const before = countOf('u_old');
await W.recordSpeechStat(env, GROUP, { id: 'u_old', first_name: 'O' }, Date.now());
check('老签名（4 参）仍无条件 +1', countOf('u_old') === before + 1, countOf('u_old') + '');

// ---------- 8. 热路径 SQL 条数：幂等版仍是 1 条 ----------
console.log('\n=== 8. 写入仍是单条 SQL（不碰热路径预算） ===');
{
	const sqlLog = [];
	const realPrepare = env.DB.prepare;
	env.DB.prepare = (sql) => { sqlLog.push(sql); return realPrepare(sql); };
	await W.recordSpeechStat(env, GROUP, { id: 'u_sql', first_name: 'S' }, Date.now(), 80001);
	env.DB.prepare = realPrepare;
	check('单次记发言只发 1 条 SQL', sqlLog.length === 1, JSON.stringify(sqlLog.map((s) => s.slice(0, 30))));
}

// === 9. 管理命令：白名单正则与 switch 分支必须成对 ===
// 【2026-10-11 的真实坑】加 /vision 时只加了 switch 分支、忘了加进 AD_COMMAND_RE ——
// 那条正则排在命令分发【之前】，不匹配就直接 return，switch 分支成了死代码。
// 症状是「私聊发 /vision 完全没反应」：不报错、不提示、也不执行，极难从现象定位。
console.log('\n=== 9. 管理命令白名单与 switch 分支成对 ===');
{
	const workerSrc = fs.readFileSync('./_worker.js', 'utf8');
	const reLine = workerSrc.split('\n').find((l) => l.includes('const AD_COMMAND_RE')) || '';
	const cases = new Set([...workerSrc.matchAll(/case '([a-z]+)':/g)].map((m) => m[1]));
	const adCommands = ['pending', 'ignore', 'addword', 'delword', 'words', 'addsample',
		'clearsamples', 'adstats', 'vision', 'whitelist', 'rescreen', 'warmup', 'learnlast'];
	for (const cmd of adCommands) {
		check('/' + cmd + ' 在 AD_COMMAND_RE 白名单里', reLine.includes(cmd), reLine.slice(0, 140));
		check('/' + cmd + ' 在 switch 有分支', cases.has(cmd), '缺 case ' + cmd);
	}
}


console.log('\n统计面板验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
