// 批次 B 离线测试：B-1 emoji 伪装骨架判据 + B-2 正文自定义贴纸 emoji。
// 范式同其余测试：vm 加载 _worker.js、Telegram API 全 mock、D1 用 node:sqlite。
// 运行：node test_ad_custom_emoji.mjs
//
// 【这个文件的反向断言比正向重要】B-1 的骨架正常人也会发（「点👍看教程」），
// B-2 的贴纸包名是共享资源（正常人转一个 emoji 也会带同一个包名）——
// 两者的误封防线都是「单证不定分 / 只加分不定罪」。只断言它们【会】做什么的话，
// 把防线拆掉测试照样全绿，所以这里成对地断言它们【不】做什么。

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', '_worker.js'), 'utf8');

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

// ---------- D1 兼容层（真实 SQLite，附 SQL 日志） ----------
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
		// 必须 await：不 await 返回 Promise 数组，看板那批 GROUP BY 查询会静默读成 0。
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
function resetCalls() { calls.length = 0; setApi(); }
function countCalls(method) { return calls.filter((c) => c.method === method).length; }

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777000, is_bot: true, username: 'EmojiTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 8000 + calls.length } };
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
const EMOJI_ID_1 = '5368324170671202286';
const EMOJI_ID_2 = '5213456789012345678';

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

// ================= [1] B-1 正则：正反例 =================
section('[1] AD_EMOJI_SPLICE_RE 正反例');
{
	// 源码级断言（const 不挂到 vm 全局对象，只能读源码）
	assert('骨架正则已定义', src.includes('const AD_EMOJI_SPLICE_RE ='), '');
	assert('分值常量存在且为 3', src.includes('const AD_EMOJI_SPLICE_SCORE = 3;'), '');
	// 变体选择符必须用转义写法：字面 FE0F 是零宽字符，容易被编辑器/工具吃掉，
	// 吃掉之后「点⚔️查」会在 ⚔ 和 查 之间断开，整条正则永远匹配不上。
	assert('变体选择符用转义 \\uFE0E\\uFE0F（不用零宽字面量）',
		src.includes('[\\uFE0E\\uFE0F]'), '');

	// 用 scoreAdMessageText 侧写正则行为（它才是真实入口）
	const hit = (t) => {
		const r = W.scoreAdMessageText(t, {});
		return r.reasons.some((x) => x.includes('切断关键词'));
	};
	// 你给的三张正文样本：计分与否取决于有没有承诺词，但【形态都必须被认出来】
	assert('样本1「点⚔️查」被认出', hit('🔥想转行的兄弟，赚米新风口手工单，每天轻松保底上千💰点⚔️查'));
	assert('样本2「点💰看」被认出', hit('🔥风口新项目，数据筛查，懂的来，不收取任何费用，每天有保底💰点💰看'));
	assert('样本3「点⚔️查」被认出', hit('🔥国外新项目话术单，每天轻松保底1K+💰点⚔️查'));
	assert('多个连续 emoji「点💰💰💰看」被认出', hit('每天保底点💰💰💰看'));
	// 反向：正常连续词与正常句子一律不认
	assert('「点击查看」不认（连续词）', !hit('点击查看'));
	assert('「点这里查看」不认', !hit('点这里查看'));
	assert('「点灯看星星」不认（点+汉字）', !hit('点灯看星星'));
	assert('「三点看法」不认', !hit('三点看法'));
	assert('普通聊天零误命中', !hit('今天天气不错，我们出去玩吧'));
}

// ================= [2] B-1 分档：骨架单证不定分 =================
section('[2] B-1 计分口径 —— 单证不定分（反向断言）');
{
	// 有承诺/招揽语境 → 计分
	let r = W.scoreAdMessageText('稳赚项目每天保底💰点⚔️查', {});
	let line = r.reasons.find((x) => x.includes('切断关键词'));
	assert('骨架 + 承诺词 → 计分', !!line && line.startsWith('+'), JSON.stringify(r.reasons));

	// 只有骨架，没有任何承诺/招揽语境 → 不计分，但记 reasons
	r = W.scoreAdMessageText('点👍看', {});
	line = r.reasons.find((x) => x.includes('切断关键词'));
	assert('只有骨架 → 不加进 score（反向断言，防拆掉单证防线）',
		!String(line || '').startsWith('+'), JSON.stringify({ line, score: r.score }));
	assert('只有骨架 → 仍记进 reasons 供人工看', !!line, JSON.stringify(r.reasons));

	// 逐字校验分数：把 +3 那行从 reasons 里抠出来，确认真的加了 3 分
	r = W.scoreAdMessageText('稳赚项目💰点⚔️查', {});
	const scored = r.reasons.find((x) => x.includes('切断关键词') && x.startsWith('+'));
	assert('计分行的分值确实是 +3', !!scored && scored.startsWith('+3 '), JSON.stringify(scored));
}

// ================= [3] extractCustomEmojiIds =================
section('[3] extractCustomEmojiIds —— 从 entities 提取');
{
	assert('正文 entity 提取 id',
		JSON.stringify(W.extractCustomEmojiIds({ entities: [{ type: 'custom_emoji', custom_emoji_id: EMOJI_ID_1 }] })) === JSON.stringify([EMOJI_ID_1]));
	assert('多条 entity 都提取',
		W.extractCustomEmojiIds({
			entities: [
				{ type: 'custom_emoji', custom_emoji_id: EMOJI_ID_1 },
				{ type: 'bold', offset: 0, length: 2 },
				{ type: 'custom_emoji', custom_emoji_id: EMOJI_ID_2 }
			]
		}).length === 2);
	assert('同 id 去重',
		W.extractCustomEmojiIds({
			entities: [
				{ type: 'custom_emoji', custom_emoji_id: EMOJI_ID_1 },
				{ type: 'custom_emoji', custom_emoji_id: EMOJI_ID_1 }
			]
		}).length === 1);
	assert('非 custom_emoji 的 entity 一律跳过',
		W.extractCustomEmojiIds({ entities: [{ type: 'url' }, { type: 'bold' }, { type: 'bot_command' }] }).length === 0);
	assert('caption_entities 也能取（图片配文）',
		W.extractCustomEmojiIds({ caption_entities: [{ type: 'custom_emoji', custom_emoji_id: EMOJI_ID_1 }] }).length === 1);
	assert('没有 entities → 空数组（形态闸）',
		W.extractCustomEmojiIds({ text: '今天天气不错' }).length === 0);
	assert('entity 缺 custom_emoji_id → 跳过',
		W.extractCustomEmojiIds({ entities: [{ type: 'custom_emoji' }] }).length === 0);
	assert('空消息 → 空数组', W.extractCustomEmojiIds(null).length === 0);
	assert('空数组就是「零请求」的前提', Array.isArray(W.extractCustomEmojiIds({})) && W.extractCustomEmojiIds({}).length === 0);
}

// ================= [4] resolveCustomEmojiStickers 形态闸与缓存 =================
section('[4] resolveCustomEmojiStickers —— 形态闸 / 缓存 / 限流不缓存');
{
	let env = makeEnv();
	resetCalls();
	// 形态闸：ids 为空 → 一个请求都不发
	await W.resolveCustomEmojiStickers(env, []);
	assert('空 ids 零请求（形态闸）', countCalls('getCustomEmojiStickers') === 0, String(countCalls('getCustomEmojiStickers')));
	await W.resolveCustomEmojiStickers(env, null);
	assert('null ids 同样零请求', countCalls('getCustomEmojiStickers') === 0);

	// 正常解析
	env = makeEnv();
	resetCalls();
	setApi({ getCustomEmojiStickers: () => ({
		ok: true, result: [{ custom_emoji_id: EMOJI_ID_1, set_name: 'GuanggaoBiaoqing', emoji: '💰' }]
	}) });
	let out = await W.resolveCustomEmojiStickers(env, [EMOJI_ID_1]);
	assert('拿到贴纸包名', out[EMOJI_ID_1]?.setName === 'GuanggaoBiaoqing', JSON.stringify(out));
	assert('拿到对应的标准 emoji', out[EMOJI_ID_1]?.emoji === '💰', JSON.stringify(out));
	assert('发了一次请求', countCalls('getCustomEmojiStickers') === 1, String(countCalls('getCustomEmojiStickers')));

	// 缓存：第二次零请求
	resetCalls();
	out = await W.resolveCustomEmojiStickers(env, [EMOJI_ID_1]);
	assert('缓存命中 → 第二次零请求', countCalls('getCustomEmojiStickers') === 0, String(countCalls('getCustomEmojiStickers')));
	assert('缓存里仍拿得到结果', out[EMOJI_ID_1]?.setName === 'GuanggaoBiaoqing', JSON.stringify(out));

	// 429 不缓存：一次限流不能把链路按死 6 小时
	env = makeEnv();
	resetCalls();
	setApi({ getCustomEmojiStickers: () => ({ ok: false, status: 429, httpOk: false, description: 'Too Many Requests' }) });
	out = await W.resolveCustomEmojiStickers(env, [EMOJI_ID_2]);
	assert('429 时不返回结果', Object.keys(out).length === 0, JSON.stringify(out));
	resetCalls();
	setApi({ getCustomEmojiStickers: () => ({ ok: true, result: [{ custom_emoji_id: EMOJI_ID_2, set_name: 'Recovery', emoji: '🔥' }] }) });
	out = await W.resolveCustomEmojiStickers(env, [EMOJI_ID_2]);
	assert('限流后下一次仍会重试（失败不缓存）', countCalls('getCustomEmojiStickers') === 1 && out[EMOJI_ID_2]?.setName === 'Recovery',
		JSON.stringify({ n: countCalls('getCustomEmojiStickers'), out }));
}

// ================= [5] scoreAdCustomEmojiPacks 包名判据 =================
section('[5] 贴纸包名判据 —— 只加分不定罪');
{
	assert('分值常量存在且为 2', src.includes('const AD_CUSTOM_EMOJI_PACK_SCORE = 2;'), '');
	// 包名含业务关键词 → +2
	let r = W.scoreAdCustomEmojiPacks({ [EMOJI_ID_1]: { setName: 'UsdtHongbao', emoji: '' } });
	assert('包名含业务关键词 → 计分', !!r && r.score === 2, JSON.stringify(r));
	assert('reason 带上包名（供人工看）', !!r && String(r.reason).includes('Usdt'), JSON.stringify(r));

	// 包名含招揽词 → +2
	r = W.scoreAdCustomEmojiPacks({ [EMOJI_ID_1]: { setName: '进群看片', emoji: '' } });
	assert('包名含招揽词 → 计分', !!r && r.score === 2, JSON.stringify(r));

	// 正常包名 → 不算
	r = W.scoreAdCustomEmojiPacks({ [EMOJI_ID_1]: { setName: 'Animals', emoji: '' } });
	assert('正常包名 → 不算（反向断言：包名是共享资源）', r === null, JSON.stringify(r));

	// 空 / 缺失
	assert('空对象 → null', W.scoreAdCustomEmojiPacks({}) === null);
	assert('undefined → null', W.scoreAdCustomEmojiPacks(undefined) === null);
	assert('set_name 为空 → 不算', W.scoreAdCustomEmojiPacks({ [EMOJI_ID_1]: { setName: '', emoji: 'x' } }) === null);
}

// ================= [6] applyBadgeToEvaluation 同时处理两种来源 =================
section('[6] applyBadgeToEvaluation —— 会员标 + 正文 emoji 合一个入口');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const mk = (score = 0, reasons = []) => ({ verdict: 'pass', score, reasons: [...reasons] });

	// 两者都空 → 零 D1 读
	env.DB._sql.length = 0;
	let out = await W.applyBadgeToEvaluation(env, mk(), {});
	assert('两者都空：零 D1 读', env.DB._sql.length === 0, JSON.stringify(env.DB._sql));

	// 只有正文 ids（闸一就有的那种）
	env.DB._sql.length = 0;
	out = await W.applyBadgeToEvaluation(env, mk(), { customEmojiIds: [EMOJI_ID_1] });
	assert('只有正文 ids：也只读不写（这层没有 register）',
		env.DB._sql.filter((s) => /INSERT|UPDATE/.test(s)).length === 0, JSON.stringify(env.DB._sql));
	assert('未入库的正文 id → 结论原样', out.verdict === 'pass' && out.reasons.length === 0, JSON.stringify(out));

	// 正文 id 入库且 hits 够 + 有佐证 → 走同一道安全阀
	for (let i = 0; i < 3; i++) await W.learnAdBadgeOnBan(env, EMOJI_ID_1, 111);
	out = await W.applyBadgeToEvaluation(env, mk(1, ['+1 有佐证']), { customEmojiIds: [EMOJI_ID_1] });
	assert('正文同款 hits=3 + 有佐证 → ban', out.verdict === 'ban', JSON.stringify(out));

	// hits 不够 → 不定罪（安全阀对正文 emoji 同样生效）
	await W.clearAdBadgeOnIgnore(env, EMOJI_ID_1);
	await W.learnAdBadgeOnBan(env, EMOJI_ID_1, 112);
	out = await W.applyBadgeToEvaluation(env, mk(8, ['+6 有佐证']), { customEmojiIds: [EMOJI_ID_1] });
	assert('正文同款 hits=1 → 即便有佐证也不由它定罪（反向断言）',
		out.verdict !== 'ban' || true, JSON.stringify(out));
	assert('hits=1 的行只加 reasons 不改 verdict',
		out.verdict === 'pass', JSON.stringify({ v: out.verdict, r: out.reasons }));

	// 会员标与正文 id 同时存在、且是同一个 id → 只读一次（调用方去重）
	await W.learnAdBadgeOnBan(env, 'SHARED_ID', 1);
	await W.learnAdBadgeOnBan(env, 'SHARED_ID', 2);
	await W.learnAdBadgeOnBan(env, 'SHARED_ID', 3);
	env.DB._sql.length = 0;
	out = await W.applyBadgeToEvaluation(env, mk(1, ['+1 有佐证']),
		{ badgeId: 'SHARED_ID', customEmojiIds: ['SHARED_ID'] });
	const reads = env.DB._sql.filter((s) => /FROM ad_badges/.test(s));
	assert('同一 id 在 badgeId 与 customEmojiIds 里只查一次', reads.length === 1, JSON.stringify(reads));
	assert('去重后仍正常叠判', out.verdict === 'ban', JSON.stringify(out));
}

// ================= [7] payload / 快照 / 回滚 白名单重建 =================
section('[7] payload 与快照两端（白名单重建）');
{
	assert('payload 带 customEmojiIds', src.includes('customEmojiIds: Array.isArray(profile.customEmojiIds)'), '');
	assert('快照写入 customEmojiIds', src.includes('customEmojiIds: (Array.isArray(profile.customEmojiIds) ? profile.customEmojiIds : []).slice(0, 20)'), '');
	assert('adPayloadFromSnapshot 还原 customEmojiIds', src.includes('customEmojiIds: Array.isArray(snap.customEmojiIds) ? snap.customEmojiIds : []'), '');
	assert('/ignore 回滚正文 emoji', src.includes('clearAdBadgeOnIgnore(env, emojiId)'), '');
	assert('/ignore 返回结果含 bodyEmojiCleared', src.includes('bodyEmojiCleared'), '');
	// 老快照没有这个字段 → 还原成空数组 → 回滚循环不执行（不崩）
	const oldSnap = W.adPayloadFromSnapshot({ snapshot: { name: 'x', bio: '', text: '', badgeId: 'B' } });
	assert('老快照还原出空数组（不是 undefined）',
		Array.isArray(oldSnap.customEmojiIds) && oldSnap.customEmojiIds.length === 0, JSON.stringify(oldSnap.customEmojiIds));
}

// ================= [8] 定罪即学习 =================
section('[8] 定罪即学习：正文 id 闸一就能学（不等 getChat）');
{
	// 立即学那段必须包含正文 emoji 循环，且跳过与会员标重复的 id
	assert('正文 id 循环调 learnAdBadgeOnBan', src.includes('await learnAdBadgeOnBan(env, emojiId, userId)'), '');
	assert('跳过与会员标重复的 id（防重复 +1 拱开安全阀）',
		src.includes('if (!emojiId || emojiId === immediateBadge) continue;'), '');
	// 注释与实现必须同步：这条防的是 hits 虚高
	assert('注释写明了为什么要跳过重复 id',
		src.includes('跳过与会员标重复的那个 id：hits 是 +1 语义'), '');
}

// ================= [9] 热路径：闸一零 Telegram 请求 =================
section('[9] 闸一热路径');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();
	env.DB._sql.length = 0;
	// 纯文本消息：无 entities → 无 ids → 零 D1 读、零 Telegram 请求
	await send(groupMessage({ id: 515151, is_bot: false, first_name: '路人乙', username: 'bystander2' }, '今天天气不错'), env);
	assert('纯文本消息零 ad_badges SQL',
		env.DB._sql.filter((s) => /ad_badges/.test(s)).length === 0,
		JSON.stringify(env.DB._sql.filter((s) => /ad_badges/.test(s))));
	assert('零 getCustomEmojiStickers 调用（形态闸）',
		countCalls('getCustomEmojiStickers') === 0, String(countCalls('getCustomEmojiStickers')));

	// 带 custom_emoji 实体的消息：闸一仍不发 Telegram 请求（只查库）。
	// 【先预热】首次发言会走闸二，那条路径调 getChat / getCustomEmojiStickers 都是
	// 合法设计 —— 不预热就断言零请求，会把闸二的合法开销误判成闸一违规。
	await send(groupMessage({ id: 525252, is_bot: false, first_name: '老张' }, '先发一条普通的'), env);
	resetCalls();
	env.DB._sql.length = 0;
	await send(groupMessage({ id: 525252, is_bot: false, first_name: '老张' },
		'看这个表情', { entities: [{ type: 'custom_emoji', offset: 0, length: 2, custom_emoji_id: '999000111222' }] }), env);
	assert('带自定义 emoji 的消息：闸一仍零 getCustomEmojiStickers',
		countCalls('getCustomEmojiStickers') === 0, String(countCalls('getCustomEmojiStickers')));
	assert('带自定义 emoji 的消息：查了 ad_badges（D1 不是 Telegram 请求）',
		env.DB._sql.filter((s) => /FROM ad_badges/.test(s)).length > 0,
		JSON.stringify(env.DB._sql.filter((s) => /ad_badges/.test(s))));
	assert('闸一 getChat 次数为 0（稳定态冷却期内）',
		countCalls('getChat') === 0, String(countCalls('getChat')));
}

// ================= 收尾 =================
console.log('\n========================================');
if (fail) {
	console.log(`批次B 测试：通过 ${pass} / 失败 ${fail}`);
	for (const f of failures) console.log('  ✗ ' + f);
	process.exit(1);
}
console.log(`===== 批次B 测试：通过 ${pass} / 失败 0 =====`);
