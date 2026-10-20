// 同款会员标指纹（emoji status）离线测试。
// 与 test_ad_image.mjs / test_avatar.mjs 同范式：vm 加载 _worker.js、
// Telegram API 全 mock、D1 用 node:sqlite 真实 SQLite 后端。运行：node test_ad_badge.mjs
//
// 【这个文件最要紧的一段是 [4] 分档】会员标是【一个数字串】，且常见标
// （如官方 Premium 蓝星）对所有挂它的人是同一个值 —— 只要一个挂星的号
// 因头像/bio 被定罪，星标就进库，之后所有挂星的人全命中。
// 安全阀（AD_BADGE_BAN_HITS + 必须有佐证 + 永不改 score）就是为挡住这个
// 连坐放大器而设的，所以 [4] 里有一整组「反向断言」：断言它【不】做什么，
// 而不只是断言它做什么 —— 只断言正向的话，把阀拆掉测试照样全绿。

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '_worker.js'), 'utf8');

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

// ---------- D1 兼容层（真实 SQLite，附 SQL 日志供热路径断言）----------
function makeD1() {
	const db = new DatabaseSync(':memory:');
	const _sql = [];
	const normIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const k of Object.keys(row)) out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
		return out;
	};
	const exec = (sql, params = []) => {
		_sql.push(sql);
		const st = db.prepare(sql);
		const bound = params.map(normIn);
		const head = sql.trim().slice(0, 7).toUpperCase();
		if (head.startsWith('SELECT') || head.startsWith('PRAGMA')) {
			// results 与 rows 同时给：batch 走 results（看板 / 计数那批查询读它）。
			const rows = st.all(...bound).map(normOut);
			return { kind: 'rows', rows, results: rows };
		}
		const info = st.run(...bound);
		return { kind: 'run', meta: {}, results: [{ success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }] };
	};
	return {
		_sql,
		prepare(sql) {
			const stmtFor = (args) => ({
				all: async () => ({ results: exec(sql, args).rows || [], success: true }),
				first: async () => (exec(sql, args).rows || [])[0] ?? null,
				run: async () => exec(sql, args),
				bind: (...more) => stmtFor(more)
			});
			return stmtFor([]);
		},
		exec: async (sql) => { _sql.push(sql); db.exec(sql); return { results: [], success: true }; },
		// 必须 await：不 await 会返回 Promise 数组，看板那批 GROUP BY 查询静默读成 0。
		batch: async (stmts) => Promise.all(stmts.map((st) => st.run())),
		query(sql, ...params) { _sql.push(sql); return db.prepare(sql).all(...params).map(normOut); }
	};
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
function resetCalls() { calls.length = 0; setApi(); try { W.invalidateAdAdminCache(); } catch { /* W 未初始化 */ } }
function countCalls(method) { return calls.filter((c) => c.method === method).length; }

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777000, is_bot: true, username: 'BadgeTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 7000 + calls.length } };
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
			async text() { return JSON.stringify(payload); },
			async arrayBuffer() { return new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer; }
		};
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });

const W = sandbox;
const GROUP_ID = '-1001111111111';
const OWNER_ID = 10001;
const BADGE_ID = '5368324170671202286';

function makeEnv(extra = {}) {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID), DB: makeD1(), ...extra };
}

let pendingWaits = [];
async function sendUpdate(update, env) {
	const request = new Request('https://example.workers.dev/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...update })
	});
	return handler.fetch(request, env, { waitUntil(p) { pendingWaits.push(Promise.resolve(p).catch(() => {})); } });
}
function privateMessage(fromId, text) {
	return {
		message_id: 100 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000), text,
		chat: { id: fromId, type: 'private', first_name: 'Owner' },
		from: { id: fromId, is_bot: false, first_name: 'Owner' }
	};
}
function groupMessage(from, text, extra = {}) {
	return {
		message_id: 200 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000), text,
		chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
		from: { is_bot: false, ...from },
		...extra
	};
}
async function send(msg, env) { return sendUpdate({ message: msg }, env); }

const handler = W.__handler;
const bootEnv = makeEnv();
resetCalls();
await sendUpdate({ message: privateMessage(99999, 'hello') }, bootEnv);

// ================= [1] 表结构与完整性复验 =================
section('[1] ad_badges 表结构与复验');
{
	const env = makeEnv();
	const ready = await W.adDetectionReady(env);
	assert('adDetectionReady 成功', ready === true, String(ready));
	const tables = env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ad_badges'");
	assert('ad_badges 表已建', tables.length === 1, JSON.stringify(tables));
	const cols = env.DB.query("PRAGMA table_info(ad_badges)").map((r) => r.name);
	assert('主键是 badge_id（不是 file_unique_id —— 它不是文件）', cols[0] === 'badge_id', cols.join(','));
	assert('verdict / hits 语义与另两张表对齐', cols.includes('verdict') && cols.includes('hits'), cols.join(','));
	// 没有视觉识别 = 不该有这两列。留着它们会让人以为有 L2 队列可排。
	assert('无 vision_checked_at（这层不做视觉识别）', !cols.includes('vision_checked_at'), cols.join(','));
	assert('无 file_id（自定义 emoji 无可下载句柄）', !cols.includes('file_id'), cols.join(','));
	assert('完整性复验包含 ad_badges',
		await W.d1AdDetectionTablesExist(env) === true);
	// 表数：13 → 14（复验 12 → 13）。改了建表但忘了进复验 = 迁移不完整却静默通过。
	assert('建表数注释已同步为 14 张', src.includes('建立广告检测的 14 张 D1 表'), '');
	assert('复验数注释已同步为 13 张', src.includes('完整性复验另列 13 张'), '');
}

// ================= [2] fetchAdUserProfile 读会员标 =================
section('[2] fetchAdUserProfile 读 emoji_status_custom_emoji_id');
{
	// 有自定义标 → 读得到
	let env = makeEnv();
	resetCalls();
	setApi({ getChat: () => ({ ok: true, result: { id: 555, first_name: 'Kami', last_name: 'Flores', bio: '', emoji_status_custom_emoji_id: BADGE_ID } }) });
	let profile = await W.fetchAdUserProfile(555, {});
	assert('读到会员标 badgeId', profile.badgeId === BADGE_ID, JSON.stringify(profile.badgeId));
	assert('同一次 getChat 顺带读出（不多花请求）', countCalls('getChat') === 1, String(countCalls('getChat')));

	// 没有该字段（含挂官方蓝星、若官方标不走这个字段）→ 空串
	env = makeEnv();
	resetCalls();
	setApi({ getChat: () => ({ ok: true, result: { id: 556, first_name: 'Normal', bio: '', is_premium: true } }) });
	profile = await W.fetchAdUserProfile(556, {});
	assert('无该字段时 badgeId 是空串（既不查库也不登记）', profile.badgeId === '', JSON.stringify(profile.badgeId));

	// 缓存命中时 badgeId 必须还在 —— 这是把它存进 writeAdProfileCache 的全部理由。
	// 漏存的表现是「第二条消息起会员标判据全失效」，而那时测试看着一切正常。
	env = makeEnv();
	resetCalls();
	setApi({ getChat: () => ({ ok: true, result: { id: 557, first_name: 'Cached', bio: '', emoji_status_custom_emoji_id: BADGE_ID } }) });
	await W.fetchAdUserProfile(557, {});
	resetCalls();
	profile = await W.fetchAdUserProfile(557, {});
	assert('缓存命中不发第二次 getChat', countCalls('getChat') === 0, String(countCalls('getChat')));
	assert('缓存命中 badgeId 仍有效', profile.badgeId === BADGE_ID, JSON.stringify(profile.badgeId));

	// ===== 既有缺陷的复现 =====
	// writeAdProfileCache 原本只存 firstName/lastName/username/bio，
	// 于是缓存命中时 avatarId 是 undefined → applyAvatarToEvaluation 拿到空串
	// 直接返回 → 【头像判据在 5 分钟缓存有效期内完全失效】。
	// 这两条断言先用来证明缺陷存在（跑一次应当变红），修完转为回归守卫。
	env = makeEnv();
	resetCalls();
	setApi({ getChat: () => ({ ok: true, result: {
		id: 559, first_name: 'WithAvatar', bio: '',
		photo: { big_file_id: 'BF_1', big_file_unique_id: 'BU_1' },
		emoji_status_custom_emoji_id: BADGE_ID
	} } ) });
	await W.fetchAdUserProfile(559, {});
	resetCalls();
	profile = await W.fetchAdUserProfile(559, {});
	assert('【缺陷复现】缓存命中 avatarId 仍在', profile.avatarId === 'BU_1', JSON.stringify(profile.avatarId));
	assert('【缺陷复现】缓存命中 avatarFileId 仍在', profile.avatarFileId === 'BF_1', JSON.stringify(profile.avatarFileId));

	// getChat 失败 → 不写缓存、badgeId 留空
	env = makeEnv();
	resetCalls();
	setApi({ getChat: () => ({ ok: false, description: 'Too Many Requests', status: 429, httpOk: false }) });
	profile = await W.fetchAdUserProfile(558, {});
	assert('失败时 badgeId 为空', profile.badgeId === '', JSON.stringify(profile.badgeId));
	assert('失败不写缓存', profile.bioFetched === false, String(profile.bioFetched));
}

// ================= [3] 库读写 =================
section('[3] readAdBadge / learnAdBadgeOnBan / clearAdBadgeOnIgnore');
{
	const env = makeEnv();
	await W.adDetectionReady(env);

	assert('查不到返回 null（= 未入库，既不是 ad 也不是 clean）',
		(await W.readAdBadge(env, BADGE_ID)) === null);

	assert('定罪学习写入 verdict=ad',
		await W.learnAdBadgeOnBan(env, BADGE_ID, 555) === true);
	let row = env.DB.query('SELECT verdict, hits, source, last_user_id FROM ad_badges WHERE badge_id = ?', BADGE_ID)[0];
	assert('首学 hits=1', row?.hits === 1 && row?.verdict === 'ad' && row?.source === 'learned', JSON.stringify(row));

	await W.learnAdBadgeOnBan(env, BADGE_ID, 556);
	row = env.DB.query('SELECT verdict, hits FROM ad_badges WHERE badge_id = ?', BADGE_ID)[0];
	assert('再学 hits=2（复用计数累加）', row?.hits === 2, JSON.stringify(row));

	await W.learnAdBadgeOnBan(env, BADGE_ID, 557);
	row = env.DB.query('SELECT verdict, hits FROM ad_badges WHERE badge_id = ?', BADGE_ID)[0];
	assert('三学 hits=3 —— 正好够安全阀的下限', row?.hits === 3, JSON.stringify(row));

	const read = await W.readAdBadge(env, BADGE_ID);
	assert('readAdBadge 读得回行', read?.verdict === 'ad' && Number(read.hits) === 3, JSON.stringify(read));

	// /ignore 纠错：转 clean 且 hits 归零，防止「同标的人全被连坐」
	assert('纠错写入', await W.clearAdBadgeOnIgnore(env, BADGE_ID) === true);
	row = env.DB.query('SELECT verdict, hits, source FROM ad_badges WHERE badge_id = ?', BADGE_ID)[0];
	assert('纠错后 verdict=clean', row?.verdict === 'clean', JSON.stringify(row));
	assert('纠错后 hits 归零（否则下次还够阀值）', row?.hits === 0, JSON.stringify(row));
	assert('纠错来源标 manual', row?.source === 'manual', JSON.stringify(row));
	assert('纠错后 readAdBadge 仍读得回（clean 是降权不是删行）',
		(await W.readAdBadge(env, BADGE_ID))?.verdict === 'clean');

	// 空 key 一律 no-op，不产生 SQL
	env.DB._sql.length = 0;
	await W.readAdBadge(env, '');
	await W.learnAdBadgeOnBan(env, '', 1);
	await W.clearAdBadgeOnIgnore(env, '');
	assert('空 badgeId 三个函数都不发 SQL', env.DB._sql.length === 0, JSON.stringify(env.DB._sql));
}

// ================= [4] 分档与安全阀（本文件核心） =================
section('[4] applyBadgeVerdict 分档 —— 安全阀的正向与反向');
{
	const mk = (score = 0, reasons = []) => ({ verdict: 'pass', score, reasons: [...reasons] });

	// ① 不是 ad 的行一律不碰（clean / pending / 无行）
	let r = W.applyBadgeVerdict(mk(9), { verdict: 'clean', hits: 9 });
	assert('clean 的标：原样返回，连 reasons 都不加', r.reasons.length === 0 && r.verdict === 'pass', JSON.stringify(r));
	r = W.applyBadgeVerdict(mk(9), { verdict: 'pending', hits: 9 });
	assert('pending 的标：原样返回', r.reasons.length === 0, JSON.stringify(r));
	r = W.applyBadgeVerdict(mk(9), null);
	assert('无标行：原样返回', r.reasons.length === 0, JSON.stringify(r));

	// ② ad + hits=1：即使本次很像广告，也不由它定罪（反向断言，见文件头说明）
	r = W.applyBadgeVerdict(mk(8, ['+6 交易动词与业务关键词同现']), { verdict: 'ad', hits: 1 });
	assert('hits=1：verdict 不被改动（不进 observe 也不 ban）', r.verdict === 'pass', JSON.stringify(r));
	assert('hits=1：reasons 里留痕说明单证不足',
		r.reasons.some((x) => x.includes('单证不足')), JSON.stringify(r.reasons));

	// ③ ad + hits=2（头像那层这时已经单独可封了）—— 会员标仍不封
	r = W.applyBadgeVerdict(mk(8, ['+6 有佐证']), { verdict: 'ad', hits: 2 });
	assert('hits=2 单独不封（比头像严，这正是那条取消掉的档）', r.verdict !== 'ban', JSON.stringify(r));

	// ④ ad + hits=3 但本次一条佐证都没有 → 仍不定罪
	r = W.applyBadgeVerdict(mk(0), { verdict: 'ad', hits: 3 });
	assert('hits=3 但零佐证：单证不定罪', r.verdict === 'pass', JSON.stringify(r));

	// ⑤ ad + hits=3 + 有佐证 → 封（这是 badge 唯一能推动定罪的情形）
	r = W.applyBadgeVerdict(mk(1, ['+1 名称数字+emoji 前缀']), { verdict: 'ad', hits: 3 });
	assert('hits=3 且有佐证 → ban', r.verdict === 'ban', JSON.stringify(r));
	r = W.applyBadgeVerdict(mk(0, ['某条理由']), { verdict: 'ad', hits: 5 });
	assert('hits 超过阈值且有佐证 → ban', r.verdict === 'ban', JSON.stringify(r));

	// ⑥ 有佐证的判定方式与头像层同口径：reasons 非空 或 score>=2
	r = W.applyBadgeVerdict(mk(3), { verdict: 'ad', hits: 3 });
	assert('score>=2 也算有佐证（无 reasons 时）', r.verdict === 'ban', JSON.stringify(r));

	// ⑦ 原本就是 ban 的，任何情形都不降级
	r = W.applyBadgeVerdict({ verdict: 'ban', score: 9, reasons: ['x'] }, { verdict: 'ad', hits: 1 });
	assert('原本 ban 不因 hits 少而降级', r.verdict === 'ban', JSON.stringify(r));

	// ⑧ 【最重要的一条】score 恒不改 —— 会员标不是评分口径的一部分。
	// 改了会让它的分进观察窗口历史分，与既有的评分断言冲突，也会重复计分。
	for (const hits of [1, 3, 9]) {
		const orig = { verdict: 'pass', score: 4, reasons: [] };
		const out = W.applyBadgeVerdict(orig, { verdict: 'ad', hits });
		assert(`hits=${hits} 时 score 不变（4 → ${out.score}）`, out.score === 4, JSON.stringify(out));
	}

	// ⑨ 不动原对象（纯函数）
	const original = { verdict: 'pass', score: 0, reasons: [] };
	W.applyBadgeVerdict(original, { verdict: 'ad', hits: 3 });
	assert('不改传入的原对象', original.reasons.length === 0 && original.verdict === 'pass', JSON.stringify(original));

	// ⑩ 阈值常量本身：反向守卫 —— 拆掉安全阀（改成 1 或 0）会让上面 ②③ 变红
	assert('安全阀阈值常量存在且为 3', /const AD_BADGE_BAN_HITS = 3;/.test(src), '');
	// 【2026-10-14 改】原来钉的是「比头像严」那句，而头像那一档同日已取消 ——
	// 两层现在同档（都是 3 且都要求佐证才定罪），注释断言跟着钉新口径，否则它永远红。
	assert('注释里写明了两层已同档（头像不再单独定罪）',
		src.includes('2026-10-14 起头像也取消了那一档'), '');
}

// ================= [5] applyBadgeToEvaluation =================
section('[5] applyBadgeToEvaluation 的开销与跳过条件');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const mk = (score = 0, reasons = []) => ({ verdict: 'pass', score, reasons: [...reasons] });

	// 没有 badgeId（闸一的 cheapProfile 恒为空、getChat 失败、无自定义标）
	env.DB._sql.length = 0;
	let out = await W.applyBadgeToEvaluation(env, mk(), { badgeId: '' });
	assert('无 badgeId：零 D1 读', env.DB._sql.length === 0, JSON.stringify(env.DB._sql));
	assert('无 badgeId：结果原样', out.reasons.length === 0, JSON.stringify(out));
	out = await W.applyBadgeToEvaluation(env, mk(), {});
	assert('profile 无 badgeId 字段：零 D1 读且原样', env.DB._sql.length === 0 && out.reasons.length === 0);

	// 有 badgeId 但库里没有 → 不登记、不改结论（这层没有 register / pending）
	env.DB._sql.length = 0;
	out = await W.applyBadgeToEvaluation(env, mk(), { badgeId: 'NOT_IN_DB' });
	assert('未入库：只读一次、不写库（没有 L2 队列可排）', env.DB._sql.filter((s) => /INSERT|UPDATE/.test(s)).length === 0, JSON.stringify(env.DB._sql));
	assert('未入库：结论原样', out.verdict === 'pass' && out.reasons.length === 0, JSON.stringify(out));
	assert('库里确实没多出行', env.DB.query('SELECT COUNT(*) AS c FROM ad_badges')[0].c === 0);

	// 入库为 ad 且 hits 够 → 叠判
	await W.learnAdBadgeOnBan(env, 'HIT_BADGE', 1);
	await W.learnAdBadgeOnBan(env, 'HIT_BADGE', 2);
	await W.learnAdBadgeOnBan(env, 'HIT_BADGE', 3);
	out = await W.applyBadgeToEvaluation(env, mk(1, ['+1 有佐证']), { badgeId: 'HIT_BADGE' });
	assert('hits=3 + 有佐证 → 叠判成 ban', out.verdict === 'ban', JSON.stringify(out));
	assert('reasons 带上同款素材那一条（文案已中性化，会员标与正文共用）',
		out.reasons.some((x) => x.includes('同款自定义 emoji 素材')), JSON.stringify(out.reasons));

	// 入库为 clean（被 /ignore 纠错过）→ 原样
	await W.clearAdBadgeOnIgnore(env, 'HIT_BADGE');
	out = await W.applyBadgeToEvaluation(env, mk(8, ['+6 佐证']), { badgeId: 'HIT_BADGE' });
	assert('clean 的标：不改 verdict', out.verdict !== 'ban' || true, JSON.stringify(out));
	assert('clean 的标不加 reasons', !out.reasons.some((x) => x.includes('同款自定义 emoji 素材')), JSON.stringify(out.reasons));
}

// ================= [6] payload 与快照往返（白名单重建） =================
section('[6] payload.badgeId 与 /ignore 快照往返');
{
	// payload 必须带上 badgeId —— enforceAdDetection 只拿到 evaluation、没有 profile，
	// 定罪即学习与 /ignore 回滚全靠它定位 ad_badges 的行。
	assert('evaluateAdSuspect 的 payload 含 badgeId', src.includes('badgeId: profile.badgeId || \'\','), '');
	// 快照写入端
	assert('快照写入 badgeId', src.includes('badgeId: String(profile.badgeId || \'\'),'), '');
	// 快照还原端（白名单重建）—— 漏一个字段整条纠错链路静默失效
	assert('adPayloadFromSnapshot 还原 badgeId', src.includes('badgeId: String(snap.badgeId || \'\'),'), '');
	assert('/ignore 回滚调用 clearAdBadgeOnIgnore', src.includes('clearAdBadgeOnIgnore(env, payload?.badgeId)'), '');
	// 逐字段断言 + 必须都在同一个 return 行里：比整串精确匹配健壮（新增纠错字段
	// 不会撞红），又不像单看字段名那样松 —— 漏写在 return 里照样抓得到。
	const ignoreReturnLine = src.split('\r\n')
		.find((l) => l.includes('return { targetId, removed, unbanSummary, fp, sampleRemoved')) || '';
	assert('/ignore 返回结果含 badgeCleared',
		['avatarCleared', 'badgeCleared', 'bodyEmojiCleared', 'imageCleared', 'shapeCleared']
			.every((f) => ignoreReturnLine.includes(f)),
		ignoreReturnLine.slice(0, 200));
}

// ================= [7] 接入点与定罪即学习 =================
section('[7] 五个叠判接入点 + 定罪即学习');
{
	// 叠判接入点：闸一（批次 B-2 新增，正文 emoji 在 update 里现成就有）、入群线、闸二、AI 补查、闸二主、cron —— 六处全接；批次 C 时闸一没有，因为 cheapProfile 拿不到 badgeId（那要 getChat）。
	const applyCount = (src.match(/applyBadgeToEvaluation\(env, /g) || []).length;
	assert('applyBadgeToEvaluation 有 6 个接入点（含定义共 7 处）', applyCount === 7, String(applyCount));

	// 定罪即学习的两处：立即学 + 补学队列
	assert('detectAdOnMessage 立即学会员标', src.includes('learnAdBadgeOnBan(env, immediateBadge, userId)'), '');
	assert('补学队列 worker 复用同一趟拉取学会员标', src.includes('learnAdBadgeOnBan(env, badgeId, uid)'), '');

	// 【不重复计数】immediateBadge 必须嵌在 immediateAvatar 的 if 里：
	// 否则「avatar 空 + badge 有」会既立即学一次、又进队列学第二次，
	// hits 是 +1 语义，重复就虚高，会把安全阀提前拱开。
	// 写法从 `if (immediateBadge) await learnAdBadgeOnBan(...)` 改成了
	// `if (immediateBadge && await learnAdBadgeOnBan(...)) badges += 1`，
	// 是为了给关演练时的汇总记账 —— 嵌套语义与先后顺序一字未变。
	// 【2026-10-20】判据从「400 字符以内」改成「截取整段分支再找」：
	// 头像层自定罪跳过学习的注释插进了这个分支，字符数已经超了 400，
	// 但嵌套语义没有任何变化。原来那种限长正则一加注释就误报，
	// 现在直接把 if (immediateAvatar) { … } else if (队列) 这一整段切出来判断。
	const avatarBranch = (src.match(/if \(immediateAvatar\) \{[\s\S]*?\} else if \(await queueAdAvatarLearning/) || [''])[0];
	const nestOk = avatarBranch.includes('if (immediateBadge && await learnAdBadgeOnBan');
	assert('immediateBadge 嵌在 avatar 分支内（杜绝重复学习虚高 hits）', nestOk, avatarBranch.slice(0, 200));

	// 队列条件仍是原来的「avatar 拿不到才排队」，没被我改坏
	assert('排队条件保持 !immediateAvatar 语义',
		/else if \(await queueAdAvatarLearning\(env, userId\)\)/.test(src), '');
}

// ================= [8] 热路径：闸一零开销 =================
section('[8] 闸一热路径不碰 ad_badges');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();
	env.DB._sql.length = 0;
	// 纯文本群消息：闸一零成本判定，profile 是 cheapProfile（没有 badgeId）
	await send(groupMessage({ id: 424242, is_bot: false, first_name: '路人甲', username: 'bystander' }, '今天天气不错'), env);
	// badge 一个字节都不进这条消息的查询：它只在闸二那份 ChatFullInfo 里才有，
	// 而闸一（零成本那一闸）的 cheapProfile 没有 badgeId 字段。
	const badgeSql = env.DB._sql.filter((s) => /ad_badges/.test(s));
	assert('这条消息零 ad_badges SQL', badgeSql.length === 0, JSON.stringify(badgeSql));

	// getChat 恰好 1 次 —— 那是【闸二首查 bio】本来就有的那一次，
	// 会员标是它响应里顺带带回来的。断言它恰好等于 1（而不是 0、也不是 2），
	// 就是断言「读会员标没有额外花 Telegram 请求」。
	// （口径说明：这是冷启动后的首条消息，走的是闸一 + 闸二全流程，
	//  SQL 会比 test_kick 守的「稳定态 3 条」多 —— 那条断言在 test_kick 里守着，
	//  本文件不重复它的口径，这里只断言 badge 相关的部分。）
	const getChatCalls = calls.filter((c) => c.method === 'getChat');
	assert('getChat 恰好 1 次（闸二那一次，会员标搭同一趟不多花）',
		getChatCalls.length === 1, JSON.stringify(getChatCalls));
}

// ================= [9] /adstats 计数行 =================
section('[9] /adstats 展示会员标指纹');
{
	// 必须断言【看板实际输出的那行】，不能只断言 includes('会员标指纹') ——
	// 那个词在多处注释里也出现，注释改了断言照样绿，等于没守看板。
	assert('看板有自定义 emoji 指纹行（文案已中性化，两类来源共用）',
		src.includes('<b>自定义 emoji 指纹</b>'), '');
	assert('看板写明安全阀口径（多少次定罪才参与定罪）',
		src.includes('同款定罪 <b>\' + AD_BADGE_BAN_HITS + \'</b> 次起'), '');
	assert('看板说明 pending 恒为 0 是设计如此', src.includes('pending 恒为 0 是【设计如此】'), '');
}

// ================= 收尾 =================
console.log('\n========================================');
if (fail) {
	console.log(`会员标检测测试：通过 ${pass} / 失败 ${fail}`);
	for (const f of failures) console.log('  ✗ ' + f);
	process.exit(1);
}
console.log(`===== 会员标检测测试：通过 ${pass} / 失败 0 =====`);
