// /search 关键词搜索 · 离线端到端验证
// 覆盖：STAT_SEARCH_GROUPS 解析与并入 GROUP_IDS、分群裁剪（搜索群按 180 天 /
//       其他群 200 条名额独立 / 未配置时原逻辑不变）、查询分类、关键词 LIKE 转义与
//       大小写不敏感、TGID 查询、@username 反查与「查不到就说查不到」、分页与翻页回调、
//       权限（第一主人 + 该群群主，普通管理员与副主人静默、私聊仅第一主人）、
//       输出渲染与保留策略提示、/help 清单。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const sent = [];
const edits = [];
const answers = [];
let adminMap = {};   // chatId → 管理员数组（含 status，用来区分 creator 与 administrator）

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
			payload = { ok: true, result: adminMap[String(b?.chat_id)] || [] };
		} else if (m === 'getChat') {
			payload = { ok: true, result: { id: Number(b?.chat_id) || 1, title: '搜索测试群', type: 'supergroup' } };
		} else if (m === 'getMe') {
			payload = { ok: true, result: { id: 42, username: 'testbot', is_bot: true } };
		} else if (m === 'editMessageText') {
			edits.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || ''), markup: b?.reply_markup || null });
			payload = { ok: true, result: { message_id: Number(b?.message_id) || 0 } };
		} else if (m === 'answerCallbackQuery') {
			answers.push({ text: String(b?.text || '') });
			payload = { ok: true, result: true };
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
		const head = sql.trim().slice(0, 6).toUpperCase();
		if (head === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA') || /\bRETURNING\b/i.test(sql)) {
			return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		}
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
const check = (label, cond, extra) => {
	if (cond) { pass += 1; console.log('  ✅ ' + label); }
	else { fail += 1; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
};
const clear = () => { sent.length = 0; edits.length = 0; answers.length = 0; };

const OWNER = '10001', DEPUTY = '10002';
const SEARCH_GROUP = '-100111';   // 配进 STAT_SEARCH_GROUPS 的群
const PLAIN_GROUP = '-100222';    // 没配的群
const env = {
	TOKEN: 'T', BOT_TOKEN: '1:x',
	GROUP_ID: SEARCH_GROUP + ',' + PLAIN_GROUP,
	OWNER_IDS: OWNER + ',' + DEPUTY,
	STAT_SEARCH_GROUPS: SEARCH_GROUP,     // 只有 -100111 是搜索群
	DB: makeD1()
};
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });

const drive = async (msg) => { const p = []; await W.__h.fetch(new Request('https://x/', { method: 'POST', body: JSON.stringify({ message: msg }) }), env, { waitUntil: (x) => p.push(Promise.resolve(x)) }); await Promise.allSettled(p); };
const driveCb = async (cq) => { const p = []; await W.__h.fetch(new Request('https://x/', { method: 'POST', body: JSON.stringify({ callback_query: cq }) }), env, { waitUntil: (x) => p.push(Promise.resolve(x)) }); await Promise.allSettled(p); };
const search = (from, chat, text) => drive({ chat, from: { id: Number(from), is_bot: false }, text, message_id: 8001 });

// 群主 = creator，普通管理员 = administrator
adminMap[SEARCH_GROUP] = [
	{ user: { id: 4444 }, status: 'creator' },
	{ user: { id: 5555 }, status: 'administrator' },
	{ user: { id: 42, is_bot: true }, status: 'administrator' },
];
adminMap[PLAIN_GROUP] = [
	{ user: { id: 4444 }, status: 'creator' },
	{ user: { id: 5555 }, status: 'administrator' },
];

console.log('\n=== 1. STAT_SEARCH_GROUPS 解析与并入 ===');
// 直接断言解析函数的返回值：STAT_SEARCH_GROUPS 是 `let` 声明，挂在 vm 的全局词法环境里，
// 不挂在 global 对象上，`W.STAT_SEARCH_GROUPS` 读不到 —— 走 loadRequiredConfig 才是它的出口。
{
	const cfg = W.loadRequiredConfig(env);
	check('解析出搜索群（环境变量 → config）', JSON.stringify(cfg.STAT_SEARCH_GROUPS) === JSON.stringify([SEARCH_GROUP]),
		JSON.stringify(cfg.STAT_SEARCH_GROUPS));
}
check('中英文逗号都能切、去重去空', JSON.stringify(W.loadRequiredConfig({ ...env, STAT_SEARCH_GROUPS: '-100111， -100222 ,-100111' }).STAT_SEARCH_GROUPS)
	=== JSON.stringify([SEARCH_GROUP, PLAIN_GROUP]),
	JSON.stringify(W.loadRequiredConfig({ ...env, STAT_SEARCH_GROUPS: '-100111， -100222 ,-100111' }).STAT_SEARCH_GROUPS));
check('留空 → 回落顶部默认值（空数组 = 功能不启用）',
	JSON.stringify(W.loadRequiredConfig({ ...env, STAT_SEARCH_GROUPS: '' }).STAT_SEARCH_GROUPS) === '[]',
	JSON.stringify(W.loadRequiredConfig({ ...env, STAT_SEARCH_GROUPS: '' }).STAT_SEARCH_GROUPS));
check('搜索群自动并入有效 GROUP_IDS（否则不算配置群、消息根本不写缓存）',
	W.isConfiguredGroup(SEARCH_GROUP) && W.isConfiguredGroup(PLAIN_GROUP),
	JSON.stringify(W.GROUP_IDS));

console.log('\n=== 2. 查询分类 ===');
check('@用户名 → username 类型', JSON.stringify(W.classifySearchQuery('@tester')) === '{"kind":"username","value":"tester"}',
	JSON.stringify(W.classifySearchQuery('@tester')));
check('纯数字 ≥5 位 → user 类型', W.classifySearchQuery('709123456')?.kind === 'user', JSON.stringify(W.classifySearchQuery('709123456')));
	check('短数字 → 关键词（不是 TGID）', W.classifySearchQuery('123')?.kind === 'keyword', JSON.stringify(W.classifySearchQuery('123')));
check('中文 → 关键词', W.classifySearchQuery('加群怎么搞')?.kind === 'keyword', JSON.stringify(W.classifySearchQuery('加群怎么搞')));
check('空 → null', W.classifySearchQuery('   ') === null, String(W.classifySearchQuery('   ')));
check('/search 判定：裸、带 @bot、带参数命中', W.isSearchCommand('/search') && W.isSearchCommand('/search@TestBot') && W.isSearchCommand('/search abc'));
check('/searchx 不命中', !W.isSearchCommand('/searchx'));

console.log('\n=== 3. 检索（真实 SQLite）===');
{
	await W.ensureD1Table(env);
	const nowIso = '2026-10-02T04:00:00.000Z';
	const ins = (chatId, mid, fromId, at, norm) =>
		env.DB.prepare('INSERT INTO moderation_messages (mid, chat_id, from_id, created_at, text_hash, text_norm) VALUES (?,?,?,?,?,?)')
			.bind(mid, chatId, fromId, at, 'h' + mid, norm).run();
	await ins(SEARCH_GROUP, 1, '9001', nowIso, '出售 telegram 账号 找我');
	await ins(SEARCH_GROUP, 2, '9002', nowIso, '今天天气不错');
	await ins(SEARCH_GROUP, 3, '9001', nowIso, 'TELEGRAM 出售渠道');   // 大写，验证大小写不敏感
	await ins(PLAIN_GROUP, 4, '9003', nowIso, 'hello world');
	await ins(PLAIN_GROUP, 5, '9004', nowIso, '100% 免费 _underscore_');

	// 关键词（大小写不敏感）
	let r = await W.runSearchMessages(env, { chatIds: [SEARCH_GROUP], keyword: 'telegram' });
	check('关键词大小写不敏感 → 命中 2 条', r.total === 2, JSON.stringify(r.rows.map((x) => x.mid)));
	r = await W.runSearchMessages(env, { chatIds: [SEARCH_GROUP], keyword: 'TELEGRAM' });
	check('全大写查询词同样命中 2 条', r.total === 2, String(r.total));
	r = await W.runSearchMessages(env, { chatIds: [SEARCH_GROUP], keyword: '天气' });
	check('中文关键词', r.total === 1 && r.rows[0].mid === 2, JSON.stringify(r.rows.map((x) => x.mid)));

	// LIKE 转义：查询词里的 % 和 _ 必须当字面量，不能变通配符
	r = await W.runSearchMessages(env, { chatIds: [PLAIN_GROUP], keyword: '100%' });
	check('查询词含 % → 转义后只匹配字面量（1 条）', r.total === 1, String(r.total));
	r = await W.runSearchMessages(env, { chatIds: [PLAIN_GROUP], keyword: '_underscore_' });
	check('查询词含 _ → 转义后只匹配字面量（1 条）', r.total === 1, String(r.total));
	r = await W.runSearchMessages(env, { chatIds: [PLAIN_GROUP], keyword: 'h%o' });
	check('h%o 不会当成通配符（0 条）', r.total === 0, String(r.total));

	// 按发送者
	r = await W.runSearchMessages(env, { chatIds: [SEARCH_GROUP], userId: '9001' });
	check('按 TGID 查发送者 → 2 条', r.total === 2, JSON.stringify(r.rows.map((x) => x.mid)));

	// 群隔离
	r = await W.runSearchMessages(env, { chatIds: [SEARCH_GROUP] });
	check('只查搜索群 → 3 条（不含另一群）', r.total === 3, String(r.total));
	r = await W.runSearchMessages(env, { chatIds: [PLAIN_GROUP] });
	check('只查另一群 → 2 条', r.total === 2, String(r.total));

	// 分页
	r = await W.runSearchMessages(env, { chatIds: [SEARCH_GROUP], page: 1 });
	check('每页 10 条、总数 3 → 1 页', r.totalPages === 1 && r.rows.length === 3, JSON.stringify([r.totalPages, r.rows.length]));
	// @username 反查（.run() 是 async，不 await 会「查询先于插入执行」；
	// 表也得先建 —— stat_speech 由 statReady 懒建，早于它 INSERT 会报 no such table）
	await W.statReady(env);
	await env.DB.prepare('INSERT INTO stat_speech (chat_id, user_id, day, msg_count, display_name, username, updated_at) VALUES (?,?,?,?,?,?,?)')
		.bind(SEARCH_GROUP, '9001', '2026-10-02', 1, '张三', 'TestUser', 0).run();
	const resolved = await W.resolveUsernameToUserId(env, '@testuser');
	check('@username 反查成 TGID（大小写不敏感）', resolved === '9001', resolved);
	const missing = await W.resolveUsernameToUserId(env, '@nobodyhere');
	check('查不到的用户名 → 空串（不退回成搜全部）', missing === '', JSON.stringify(missing));
}

console.log('\n=== 5. 权限（第一主人 + 该群群主）===');
{
	const G = { id: Number(SEARCH_GROUP), type: 'supergroup', title: '搜索测试群' };
	// 第一主人
	clear();
	await search(OWNER, G, '/search 天气');
	check('第一主人群内 → 出结果', sent.some((s) => s.chatId === SEARCH_GROUP && s.text.includes('搜索')), JSON.stringify(sent.map((s) => s.text.slice(0, 30))));

	// 群主（creator）
	clear();
	await search(4444, G, '/search 天气');
	check('该群群主（creator）→ 可用', sent.some((s) => s.chatId === SEARCH_GROUP && s.text.includes('搜索')), JSON.stringify(sent.map((s) => s.text.slice(0, 30))));

	// 普通管理员 → 静默
	clear();
	await search(5555, G, '/search 天气');
	check('普通管理员（administrator）→ 完全静默', sent.length === 0, JSON.stringify(sent.map((s) => s.text.slice(0, 30))));

	// 副主人（非第一主人，也不是群主）→ 静默
	clear();
	await search(DEPUTY, G, '/search 天气');
	check('副主人（既非第一主人也非群主）→ 静默', sent.length === 0, JSON.stringify(sent.map((s) => s.text.slice(0, 30))));

	// 非第一主人私聊 → 权限不足
	clear();
	await search(4444, { id: 4444, type: 'private' }, '/search 天气');
	check('非第一主人私聊 → 提示权限不足',
		sent.some((s) => s.text.includes('权限不足')), JSON.stringify(sent.map((s) => s.text.slice(0, 40))));

	// 第一主人私聊 → 可用（跨群）
	clear();
	await search(OWNER, { id: Number(OWNER), type: 'private' }, '/search 天气');
	check('第一主人私聊 → 出结果（跨全部配置群）',
		sent.some((s) => s.chatId === OWNER && s.text.includes('搜索')), JSON.stringify(sent.map((s) => s.text.slice(0, 40))));
}

console.log('\n=== 6. 输出与用法 ===');
{
	const G = { id: Number(SEARCH_GROUP), type: 'supergroup', title: '搜索测试群' };
	clear();
	await search(OWNER, G, '/search');
	const usage = sent.find((s) => s.chatId === SEARCH_GROUP)?.text || '';
	check('裸 /search → 出用法', usage.includes('用法') && usage.includes('/search 关键词'), usage.slice(0, 60));
	check('用法写明权限 = 第一主人 + 群主', usage.includes('第一主人') && usage.includes('群主'), '');
	check('用法写明两个已知边界（200 字截断、命令不入库）',
		usage.includes('200') && usage.includes('命令'), '');

	clear();
	await search(OWNER, G, '/search 天气');
	const out = sent.find((s) => s.chatId === SEARCH_GROUP)?.text || '';
	check('结果页含标题与查询词', out.includes('搜索') && out.includes('天气'), out.slice(0, 80));
	check('结果页含正文与发送者链接', out.includes('tg://user?id=') && out.includes('今天天气不错'), out.slice(0, 200));
	check('群内结果不标 chat_id（标题已有群名）', !out.includes('<code>-100'), out.slice(0, 200));
	check('保留策略提示：搜索群写 180 天', out.includes('180'), out.split('\n').pop());

	clear();
	await search(OWNER, { id: Number(OWNER), type: 'private' }, '/search 天气');
	const dm = sent.find((s) => s.chatId === OWNER)?.text || '';
	check('私聊结果跨群并标出群 ID', dm.includes('全部配置群') && dm.includes('<code>-100'), dm.slice(0, 160));

	clear();
	await search(OWNER, G, '/search 完全不存在的词xyzzy');
	const none = sent.find((s) => s.chatId === SEARCH_GROUP)?.text || '';
	check('无命中 → 明说没有记录', none.includes('没有匹配的记录'), none.slice(0, 120));

	clear();
	await search(OWNER, G, '/search @nobodyhere');
	const miss = sent.find((s) => s.chatId === SEARCH_GROUP)?.text || '';
	check('@用户名查不到 → 明说没找到（不退回搜全部）', miss.includes('没找到用户名'), miss.slice(0, 120));
}

console.log('\n=== 7. 保留策略提示三态 ===');
{
	// 同样走 applyRuntimeConfig 改配置（见第 4 节的说明）
	W.applyRuntimeConfig(W.loadRequiredConfig(env));
	const a = W.searchHistoryNote([SEARCH_GROUP]);
	check('全是搜索群 → 写 180 天', a.includes('180'), a);
	const b = W.searchHistoryNote([PLAIN_GROUP]);
	check('都不是搜索群 → 写只留 200 条', b.includes('200'), b);
	const c = W.searchHistoryNote([SEARCH_GROUP, PLAIN_GROUP]);
	check('混合 → 两类都说明', c.includes('180') && c.includes('200'), c);
}

console.log('\n=== 8. 翻页回调与权限复查 ===');
{
	const pageToken = (kind, value, scope) => 'searchpg:1:' + W.encodeAdCallbackToken([kind, value, scope].join('|'));
	// 第一主人点 → 编辑
	clear();
	await driveCb({ id: 'cb1', from: { id: Number(OWNER), is_bot: false },
		message: { message_id: 900, chat: { id: Number(SEARCH_GROUP), type: 'supergroup' }, text: '搜索' },
		data: pageToken('keyword', 'telegram', SEARCH_GROUP) });
	check('第一主人翻页 → 原地编辑', edits.length === 1 && edits[0].text.includes('搜索'), JSON.stringify(edits.map((x) => x.text.slice(0, 30))));

	// 普通管理员点 → 拒绝
	clear();
	await driveCb({ id: 'cb2', from: { id: 5555, is_bot: false },
		message: { message_id: 901, chat: { id: Number(SEARCH_GROUP), type: 'supergroup' }, text: '搜索' },
		data: pageToken('keyword', 'telegram', SEARCH_GROUP) });
	check('普通管理员翻页 → 拒绝不渲染', edits.length === 0, JSON.stringify(edits.length));
	check('  ↑ 应答文案', answers.some((a) => a.text.includes('群主')), JSON.stringify(answers));

	// 群主点 → 编辑
	clear();
	await driveCb({ id: 'cb3', from: { id: 4444, is_bot: false },
		message: { message_id: 902, chat: { id: Number(SEARCH_GROUP), type: 'supergroup' }, text: '搜索' },
		data: pageToken('keyword', 'telegram', SEARCH_GROUP) });
	check('该群群主翻页 → 原地编辑', edits.length === 1, JSON.stringify(edits.length));

	// 私聊发起（scope=all）→ 非第一主人点也拒绝
	clear();
	await driveCb({ id: 'cb4', from: { id: 4444, is_bot: false },
		message: { message_id: 903, chat: { id: 4444, type: 'private' }, text: '搜索' },
		data: pageToken('keyword', 'telegram', 'all') });
	check('跨群搜索（scope=all）非第一主人点 → 拒绝', edits.length === 0, JSON.stringify(edits.length));

	// 坏 token
	clear();
	await driveCb({ id: 'cb5', from: { id: Number(OWNER), is_bot: false },
		message: { message_id: 904, chat: { id: Number(SEARCH_GROUP), type: 'supergroup' }, text: '搜索' },
		data: 'searchpg:1:bad' });
	check('坏 token → 提示失效不渲染', edits.length === 0 && answers.some((a) => a.text.includes('失效')), JSON.stringify(answers));
}

// 编号排在最后是因为这节会清空整张表 —— 放前面会把第 3 节造的数据全删掉。
console.log('\n=== 9. 分群裁剪（放在末尾：本节清表）===');
{
	// 造数据：搜索群 50 条（30 新 + 20 老于 180 天），非搜索群 300 条新的 + 20 条老于 7 天。
	const seed = async (db) => {
		await W.ensureD1Table(env);
		// db.exec 是 async 的，不 await 会「DELETE 还没执行就开始 INSERT」，旧数据全留着。
		await db.exec('DELETE FROM moderation_messages');
		const fresh = '2026-10-01T00:00:00.000Z';
		const old = '2025-02-01T00:00:00.000Z';   // 早于 180 天
		const stale = '2026-08-01T00:00:00.000Z'; // 早于 7 天、晚于 180 天 —— 只有非搜索群的保留窗会剪到它
		const add = (chatId, mid, at) =>
			db.prepare('INSERT INTO moderation_messages (mid, chat_id, from_id, created_at, text_hash, text_norm) VALUES (?,?,?,?,?,?)')
				.bind(mid, chatId, '1', at, 'h' + mid, 'x').run();
		for (let i = 1; i <= 30; i += 1) add(SEARCH_GROUP, i, fresh);
		for (let i = 31; i <= 50; i += 1) add(SEARCH_GROUP, i, old);
		for (let i = 100; i < 400; i += 1) add(PLAIN_GROUP, i, fresh);
		for (let i = 400; i < 420; i += 1) add(PLAIN_GROUP, i, stale);
	};
	const count = (chatId) => env.DB.query("SELECT COUNT(*) AS c FROM moderation_messages WHERE chat_id='" + chatId + "'")[0].c;

	// ① 配了搜索群：搜索群按天剪、其他群保留窗【独立】算
	// STAT_SEARCH_GROUPS 是 `let` 全局词法变量，`W.X = ...` 给沙箱对象加个属性是【无效】的
	// （内部读的还是词法绑定）—— 必须走 applyRuntimeConfig 这个正规入口。
	await seed(env.DB);
	W.applyRuntimeConfig(W.loadRequiredConfig(env));
	await W.pruneAutoincrementCacheTable(env, 'moderation_messages', 200, Date.parse('2026-10-02T00:00:00Z'));
	check('搜索群：20 条超期被按天剪掉，剩 30', count(SEARCH_GROUP) === 30, String(count(SEARCH_GROUP)));

	// 【2026-10-15 甲 · 这两条正是改动点】
	// 改动前非搜索群是「按 autoincrement 保留最新 keepLimit 条」，而 keepLimit = max(MSG_CACHE_SIZE, 200)
	// —— 14 个群一天几千条消息，200 条只够几分钟。线上实测：moderation_messages 总共 245 条，
	// 主人要 /spam 的那批广告一条记录都没有（发出来几分钟就被裁掉），同款直封的 text_hash
	// 同样只覆盖这几分钟，而 ad_spam_texts 的 TTL 是 7 天 —— 名义拦一周，实际拦不到第二天。
	check('其他群：7 天内的 300 条全留，不再被砍到 200',
		count(PLAIN_GROUP) === 300, String(count(PLAIN_GROUP)));
	check('其他群：超期的 20 条同样按天剪掉（保留窗对非搜索群生效）',
		env.DB.query("SELECT COUNT(*) AS c FROM moderation_messages WHERE chat_id='" + PLAIN_GROUP + "' AND created_at < '2026-09-25T00:00:00.000Z'")[0].c === 0,
		String(env.DB.query("SELECT COUNT(*) AS c FROM moderation_messages WHERE chat_id='" + PLAIN_GROUP + "' AND created_at < '2026-09-25T00:00:00.000Z'")[0].c));

	// ② 未配置搜索群：同样按天剪，行数只做兜底
	await seed(env.DB);
	W.applyRuntimeConfig(W.loadRequiredConfig({ ...env, STAT_SEARCH_GROUPS: '' }));
	await W.pruneAutoincrementCacheTable(env, 'moderation_messages', 200, Date.parse('2026-10-02T00:00:00Z'));
	const total = env.DB.query('SELECT COUNT(*) AS c FROM moderation_messages')[0].c;
	// 30（搜索群 fresh，此时它也只是普通群）+ 300（普通群 fresh）= 330；两批超期的（20 + 20）都剪掉。
	check('未配置搜索群 → 同样按天剪：330 条', total === 330, String(total));
	// 行数硬上限是极端流量的兜底，常量不挂 vm 全局，从源码断言它确实在裁剪里。
	check('行数硬上限写进裁剪（防极端流量把时间窗涨成几十万行）',
		src.includes('MSG_CACHE_HARD_LIMIT') && src.includes('OFFSET ?'),
		'源码里没找到硬上限');
	// 恢复配置，别把搜索群配置泄漏到后面的断言里
	W.applyRuntimeConfig(W.loadRequiredConfig(env));

	// ③ 白名单：只允许 moderation_messages，别的表名直接抛
	let threw = false;
	try { await W.pruneAutoincrementCacheTable(env, 'blacklist', 10); } catch (_) { threw = true; }
	check('表名白名单仍生效（传别的表抛错）', threw);
}

console.log('\n搜索验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
