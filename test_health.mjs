// /health 运行检查（两层 + 三权限）· 离线端到端验证
// 覆盖：命令判定（裸 / 带 @ / 带参数 / 非命令）、权限（仅第一主人，群内静默、私聊提示、
//       群主与副主人也不行）、第一层状态自检四项（bot 身份 / D1 / 统计活性 / AI 绑定 /
//       配置规模）、统计活性三种态（今天 / 停 N 天 / 从未写入）、
//       第二层单群各分支（三权限齐全 / 缺删 / 缺禁 / 缺邀 / 非管理员 / 不在群）、
//       报告渲染的行与汇总计数、整份报告端到端。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const sent = [];

// 按群返回不同管理员列表，才能逐分支验证「在群 / 管理员 / 三权限」
let adminMap = {};     // chatId → 管理员数组
let getChatFail = {};  // chatId → true（模拟群不可达 / bot 不在群）

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
		} else if (m === 'getChat') {
			const cid = String(b?.chat_id ?? '');
			if (getChatFail[cid]) payload = { ok: false, error_code: 400, description: 'Bad Request: chat not found' };
			else payload = { ok: true, result: { id: Number(cid) || 1, title: '体检测试群', type: 'supergroup' } };
		} else if (m === 'getChatAdministrators') {
			const cid = String(b?.chat_id ?? '');
			if (getChatFail[cid]) payload = { ok: false, error_code: 400, description: 'Bad Request: chat not found' };
			else payload = { ok: true, result: adminMap[cid] || [] };
		} else if (m === 'getChatMember') {
			payload = { ok: true, result: { status: 'member', user: { id: b?.user_id } } };
		} else if (m === 'getMe') {
			payload = { ok: true, result: { id: 42, username: 'testbot', is_bot: true } };
		}
		return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.replace(/export\s+default\s*/, 'globalThis.__h = '), sandbox, { filename: '_worker.js' });
const W = sandbox;

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
	const mk2 = (sql) => {
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
		prepare: mk2,
		async exec(sql) { for (const p of String(sql).split(';')) { const s = p.trim(); if (s) db.exec(s); } return { count: 1 }; },
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; },
		query(sql) { return db.prepare(sql).all().map(nOut); }
	};
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
	if (cond) { pass += 1; console.log('  ✅ ' + label); }
	else { fail += 1; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
};
const reset = () => { sent.length = 0; };

const OWNER = '10001', DEPUTY = '10002', SUPER = '10003';
const GROUP = '-100111', GROUP2 = '-100222';
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUP + ',' + GROUP2, OWNER_IDS: OWNER + ',' + DEPUTY, DB: makeD1() };
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });
await W.statReady(env);

const drive = (update) => W.__h.fetch(new Request('https://x/', { method: 'POST', body: JSON.stringify(update) }), env, { waitUntil() {} });
const health = (from, chatId, type) => drive({ message: { chat: { id: Number(chatId), type }, from: { id: Number(from), is_bot: false }, text: '/health', message_id: 501 } });

// 三个权限全开的 bot 管理员（第二个群给缺权限的）
const fullAdmin = (extra = {}) => ({
	user: { id: 42, is_bot: true, username: 'testbot' },
	status: 'administrator',
	can_delete_messages: true, can_restrict_members: true, can_invite_users: true,
	...extra
});

console.log('\n=== 1. 命令判定与权限 ===');
check('裸 /health 命中', W.isHealthCommand('/health'));
check('/health@TestBot 命中', W.isHealthCommand('/health@TestBot'));
check('/health any 命中', W.isHealthCommand('/health anything'));
check('/healthx 不命中', !W.isHealthCommand('/healthx'));
check('/healthy 不命中', !W.isHealthCommand('/healthy'));
check('普通文本不命中', !W.isHealthCommand('跑一下 health'));

{
	// 群内非第一主人 → 完全静默（不回、不撤回），连命令存在都不暴露
	reset();
	await health(OWNER === '10001' ? DEPUTY : DEPUTY, GROUP, 'supergroup');
	check('副主人群内 /health → 完全静默', sent.length === 0, JSON.stringify(sent.map((s) => s.text.slice(0, 40))));

	// 私聊非第一主人 → 提示权限不足
	reset();
	await health(SUPER, OWNER, 'private');
	check('超级管理员私聊 /health → 提示仅限第一主人',
		sent.some((s) => s.text.includes('仅限第一主人')), JSON.stringify(sent.map((s) => s.text.slice(0, 50))));

	reset();
	await health(DEPUTY, OWNER, 'private');
	check('副主人私聊 /health → 提示仅限第一主人',
		sent.some((s) => s.text.includes('仅限第一主人')), JSON.stringify(sent.map((s) => s.text.slice(0, 50))));
}

console.log('\n=== 2. 第一层 · 状态自检 ===');
{
	// 统计活性的三种状态各自用【独立 D1】测，且绝不调 export：
	// export 会重载全局 GROUP_IDS，把第 4 节的逐群体检静默砍成一个群。
	// 而且「从未写入」不能走 /health 命令测 —— 命令本身就是一条真人消息，
	// 会被发言钩子记进 stat_speech，报告必然显示「今天」。
	const mkStatEnv = () => ({ TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUP + ',' + GROUP2, OWNER_IDS: OWNER + ',' + DEPUTY, DB: makeD1() });

	// ① 从未写入
	const eFresh = mkStatEnv();
	await W.statReady(eFresh);
	let l0 = await W.runHealthLayerOne(eFresh);
	const line0 = l0.find((x) => x.text.includes('统计活性'))?.text || '';
	check('统计活性：全新库 → ⚠️ 还没有任何发言记录', line0.includes('还没有任何发言记录'), line0);

	// ② 今天有写入
	await W.recordSpeechStat(eFresh, GROUP, { id: '1', first_name: '今天' });
	l0 = await W.runHealthLayerOne(eFresh);
	const lineToday = l0.find((x) => x.text.includes('统计活性'))?.text || '';
	check('统计活性：今天写入 → ✅ 标今天', lineToday.includes('✅') && lineToday.includes('今天'), lineToday);

	// ③ 停更多天
	const eStale = mkStatEnv();
	await W.statReady(eStale);
	eStale.DB.exec("INSERT INTO stat_speech (chat_id, user_id, day, msg_count, display_name, username, updated_at) "
		+ "VALUES ('-100111', '1', '2026-09-01', 1, '旧', '', 0)");
	l0 = await W.runHealthLayerOne(eStale);
	const stale = l0.find((x) => x.text.includes('统计活性'))?.text || '';
	check('统计活性：停更 → ❌ 并给出停了多少天', stale.includes('❌') && /已停 <b>\d+<\/b> 天/.test(stale), stale);

	// 通过 /health 命令出的报告：只断言这一行在（命令本身会写一条发言，状态不作断言）
	adminMap[GROUP] = [fullAdmin()];
	adminMap[GROUP2] = [fullAdmin()];
	reset();
	await health(OWNER, GROUP, 'supergroup');
	const out = sent.find((s) => s.chatId === GROUP)?.text || '';
	check('第一主人群内 → 出报告', out.includes('运行检查'), JSON.stringify(sent.map((s) => s.text.slice(0, 30))));
	check('含状态自检节', out.includes('状态自检'), '');
	check('含 bot 身份', out.includes('Bot 身份') && out.includes('@testbot'), '');
	check('D1 已连接', out.includes('D1 存储') && out.includes('✅ 已连接'), '');
	check('含统计活性一行', out.includes('统计活性'), out.split('\n').filter((x) => x.includes('统计活性')).join(' | '));
	check('AI 未绑定 → 标警告不标红', out.includes('Workers AI') && out.includes('⚠️ 未绑定'), '');
	check('配置规模：2 个配置群', out.includes('配置群 <b>2</b>'), '');

	// AI 绑定态
	env.AI = { run: async () => ({}) };
	const layer1 = await W.runHealthLayerOne(env);
	check('AI 已绑定 → ✅ 三层全开', layer1.some((x) => x.text.includes('Workers AI') && x.ok === true),
		JSON.stringify(layer1.filter((x) => x.text.includes('AI'))));
	delete env.AI;
}

console.log('\n=== 3. 第二层 · 单群体检各分支 ===');
{
	const botId = '42';

	// 三权限齐全
	adminMap[GROUP] = [fullAdmin()];
	let g = await W.checkGroupHealth(GROUP, botId);
	check('三权限齐全 → present+isAdmin+三项全 true',
		g.present && g.isAdmin && g.canDelete && g.canRestrict && g.canInvite, JSON.stringify(g));

	// 缺删除消息
	adminMap[GROUP] = [fullAdmin({ can_delete_messages: false })];
	g = await W.checkGroupHealth(GROUP, botId);
	check('缺 can_delete_messages → 该项 false、其余仍 true',
		g.isAdmin && !g.canDelete && g.canRestrict && g.canInvite, JSON.stringify(g));

	// 缺封禁
	adminMap[GROUP] = [fullAdmin({ can_restrict_members: false })];
	g = await W.checkGroupHealth(GROUP, botId);
	check('缺 can_restrict_members → 该项 false', g.isAdmin && g.canDelete && !g.canRestrict && g.canInvite, JSON.stringify(g));

	// 缺邀请
	adminMap[GROUP] = [fullAdmin({ can_invite_users: false })];
	g = await W.checkGroupHealth(GROUP, botId);
	check('缺 can_invite_users → 该项 false', g.isAdmin && g.canDelete && g.canRestrict && !g.canInvite, JSON.stringify(g));

	// 在群但不是管理员（列表里找不到 bot）
	adminMap[GROUP] = [{ user: { id: 10001 }, status: 'creator' }];
	g = await W.checkGroupHealth(GROUP, botId);
	check('列表无 bot → present=true、isAdmin=false', g.present && !g.isAdmin, JSON.stringify(g));

	// 不在群 / 群不可达
	getChatFail[GROUP] = true;
	g = await W.checkGroupHealth(GROUP, botId);
	check('getChat 失败 → present=false 且带 error', !g.present && !!g.error, JSON.stringify(g));
	check('  ↑ error 是中文提示可用的原文', /chat not found/.test(g.error), g.error);
	getChatFail[GROUP] = false;
}

console.log('\n=== 4. 报告渲染与汇总 ===');
{
	// 群1 全好，群2 缺删除消息
	adminMap[GROUP] = [fullAdmin()];
	adminMap[GROUP2] = [fullAdmin({ can_delete_messages: false })];
	const report = await W.runHealthCheck(env);
	check('报告覆盖 2 个配置群', report.layer2.length === 2 && report.total === 2, JSON.stringify(report.layer2.map((x) => x.groupId)));

	const text = W.renderHealthReport(report);
	check('含逐群体检节与群数', text.includes('逐群体检') && text.includes('2 个配置群'), '');
	check('全好的群标 ✅ 并列出三权限', text.includes('✅ 体检测试群') && text.includes('删✓ 禁✓ 邀✓'),
		text.split('\n').filter((x) => x.includes('体检测试群')).join(' | '));
	check('缺删除消息的群标 ❌ 并点名缺哪个权限', text.includes('缺 <b>删除消息</b> 权限'),
		text.split('\n').filter((x) => x.includes('缺')).join(' | '));
	check('缺邀请的群标 ⚠️ 而非 ❌（非致命）', !text.includes('缺邀请链接权限') || text.includes('⚠️'), '');
	check('汇总报出 1 个群会坏', text.includes('<b>1</b> 个群有功能会坏'), text.split('\n').slice(-3).join(' | '));

	// 只缺邀请 → 汇总只算 warn 不算 bad
	adminMap[GROUP2] = [fullAdmin({ can_invite_users: false })];
	const r2 = await W.runHealthCheck(env);
	const t2 = W.renderHealthReport(r2);
	check('只缺邀请 → 汇总只报权限缺口、不报会坏', t2.includes('有权限缺口') && !t2.includes('有功能会坏'),
		t2.split('\n').slice(-3).join(' | '));
	check('  ↑ 该群标 ⚠️', t2.includes('⚠️ 体检测试群'), '');

	// 全好 → 全绿
	adminMap[GROUP2] = [fullAdmin()];
	const r3 = await W.runHealthCheck(env);
	const t3 = W.renderHealthReport(r3);
	check('全部正常 → 汇总一句全绿', t3.includes('全部 2 个群正常'), t3.split('\n').slice(-2).join(' | '));

	// bot 不在群：getChat 挂 → 标 ❌，原因经 toChineseErrorText 翻成中文
	// （原文 'Bad Request: chat not found' 会被译成「bot 不在该群」，断言锚点必须用译文）
	getChatFail[GROUP2] = true;
	const r4 = await W.runHealthCheck(env);
	const t4 = W.renderHealthReport(r4);
	check('bot 不在群 → 标 ❌ 并给出中文原因「bot 不在该群」',
		t4.includes('❌') && t4.includes('bot 不在该群') && t4.includes('<code>-100222</code>'),
		// 这个群 getChat 失败拿不到群名，行首是「未命名」——按群 ID 过滤才找得到
		t4.split('\n').filter((x) => x.includes('-100')).join(' | '));
	check('  ↑ 该行带群 ID', t4.includes('<code>-100222</code>'), '');
	getChatFail[GROUP2] = false;
}

console.log('\n=== 5. 端到端 ===');
{
	adminMap[GROUP] = [fullAdmin()];
	adminMap[GROUP2] = [fullAdmin()];
	reset();
	await health(OWNER, OWNER, 'private');
	const out = sent.find((s) => s.chatId === OWNER)?.text || '';
	check('第一主人私聊 → 出完整报告（含两层）',
		out.includes('状态自检') && out.includes('逐群体检') && out.includes('汇总'), out.slice(0, 120));
	check('报告含三权限标记', out.includes('删✓ 禁✓ 邀✓'), '');

	// /health 带参数也不报错（参数被忽略）
	reset();
	await drive({ message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER), is_bot: false }, text: '/health now', message_id: 502 } });
	check('/health now 同样出报告（参数忽略）', sent.some((s) => s.text.includes('运行检查')), JSON.stringify(sent.map((s) => s.text.slice(0, 30))));
}

console.log('\n运行检查验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
