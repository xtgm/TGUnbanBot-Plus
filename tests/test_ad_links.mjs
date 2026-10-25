// 资料挂载的频道 / 群 / bot 解析层（对齐 menshen resolveLink）离线测试。
// 与 test_dryrun.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_ad_links.mjs
//
// 覆盖八件事：
//   ① extractAdProfileHandles 的形态闸 —— 没链接就空数组，这是「零请求」的充要条件
//   ② resolveAdLink 的 kind/title/about 解析、bot 的 og 抓取、6 小时缓存、429 不缓存
//   ③ isAdKnownAccount 案底三态（在黑名单 / 判过未回滚 / 已回滚不算案底）
//   ④ scoreAdProfileLinks 判据：案底 +3、简介含招揽 +2，其余一律不加
//   ⑤ scoreAdProfile 接入：没有 adLinks 字段（闸一形态）分数一分不变
//   ⑥ 入群线端到端：带链接的 bio 真的触发解析并把分带进判定
//   ⑦ 成本闸：无链接的 bio 一个解析请求都不发
//   ⑧ 落点只在入群线与闸二，闸一那条零 getChat 路径上没有解析调用（源码断言）

import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');

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

// ---------- D1 兼容层 ----------
function makeD1() {
	const db = new DatabaseSync(':memory:');
	const sqlLog = [];
	const normIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const k of Object.keys(row)) out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
		return out;
	};
	const exec = (sql, params = []) => {
		sqlLog.push(String(sql).replace(/\s+/g, ' ').trim());
		const st = db.prepare(sql);
		const bound = params.map(normIn);
		const head = sql.trim().slice(0, 6).toUpperCase();
		if (head === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) {
			return { kind: 'rows', rows: st.all(...bound).map(normOut) };
		}
		const info = st.run(...bound);
		return { kind: 'run', success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid }, results: [{ success: true, meta: { changes: info.changes } }] };
	};
	return {
		prepare(sql) {
			const stmtFor = (args) => ({
				all: async () => ({ results: exec(sql, args).rows || [], success: true }),
				first: async () => (exec(sql, args).rows || [])[0] ?? null,
				run: async () => exec(sql, args),
				bind: (...more) => stmtFor(more)
			});
			return stmtFor([]);
		},
		exec: async (sql) => { db.exec(sql); sqlLog.push(String(sql).replace(/\s+/g, ' ').trim()); return { results: [], success: true }; },
		// 必须 await —— 不 await 会返回 Promise 数组，batch[i].results 为 undefined，
		// /adstats 前半段（指纹库/样本/白名单/头像计数）会静默读成 0：查库明明正常，
		// 看着却像产品缺陷。实际是 mock 少了 await。
		batch: async (stmts) => Promise.all(stmts.map((st) => st.run())),
		query(sql, ...params) { return db.prepare(sql).all(...params).map(normOut); },
		_sql: sqlLog,
		_raw: db
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

// ---------- 被挂账号的固定样本 ----------
// 三个频道 + 一个 bot + 一个普通用户，覆盖 kind 的五种取值。
const LINK_RESULTS = {
	goodtech: { id: -1002001, type: 'channel', title: '技术交流频道', description: '分享编程与运维知识，欢迎讨论' },
	scamchan: { id: -1002002, type: 'channel', title: '财富频道', description: '招代理 一天8000 带单上分 私聊领福利' },
	emptychan: { id: -1002003, type: 'channel', title: '空简介频道', description: '' },
	stranger: { id: 555999, type: 'private', first_name: '张三', last_name: '' },
	adbot: { id: 777888, type: 'private', first_name: '', last_name: '' },   // handle 以 bot 结尾 → kind=bot
	// 自举案底用：简介含招揽（会先 +2，标记后变 +3 并跳过 +2）。
	// 文案必须真的命中 AD_EXEMPT_CANCEL_RE，否则「未标记 +2」那两条无从谈起 ——
	// 与 scamchan 同款，那条已在 [6] 被断言过确实触发「招揽」。
	scamfeed: { id: -100777001, type: 'channel', title: '黑产频道', description: '招代理 一天8000 带单上分 私聊领福利' }
};
// bot 的简介只有公开预览页给得到（getChat 对别的 bot 只返回名字与用户名）。
const OG_PAGES = {
	adbot: '<html><head><meta property="og:description" content="日入5000 私聊领福利，带单上分包赢" /></head></html>',
	goodbot: '<html><head><meta property="og:description" content="You can contact @goodbot right away." /></head></html>'
};

const linkCalls = [];      // 每次链接解析的 getChat 记录
const ogCalls = [];        // 每次抓 t.me 预览页的记录
let apiHandlers = {};
function setApi(next = {}) { apiHandlers = next; }
function resetCalls() { linkCalls.length = 0; ogCalls.length = 0; setApi(); }

function telegramJson(payload, status = 200) {
	return {
		ok: status < 400,
		status,
		async json() { return payload; },
		async text() { return JSON.stringify(payload); }
	};
}

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	// fetchAdBotAbout 用 AbortController 做 5 秒超时。vm 新建的 context 只有 JS 内建，
	// AbortController 是宿主 Web API，不显式传进来就是 ReferenceError ——
	// 而那个异常被 fetchAdBotAbout 的 catch 吞成空串，表现是「og 没抓」而不是报错。
	AbortController, AbortSignal,
	fetch: async (url, init) => {
		const raw = String(url);

		// bot 简介的公开预览页（非 Telegram 域名）
		if (raw.startsWith('https://t.me/')) {
			const handle = raw.slice('https://t.me/'.length).split('?')[0].toLowerCase();
			ogCalls.push(handle);
			return {
				ok: true,
				status: 200,
				async json() { return { ok: true }; },
				async text() { return OG_PAGES[handle] || '<html><head></head><body></body></html>'; }
			};
		}

		const method = raw.split('/').pop();
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }

		if (method === 'getChat') {
			const chatId = String(body?.chat_id || '');
			// 带 @ 前缀 = 链接解析（本功能），否则 = 拉用户资料（既有行为）
			if (chatId.startsWith('@')) {
				const handle = chatId.slice(1).toLowerCase();
				linkCalls.push(handle);
				const info = LINK_RESULTS[handle];
				if (info) return telegramJson({ ok: true, result: info });
				return telegramJson({ ok: false, error_code: 400, description: 'Bad Request: chat not found' }, 400);
			}
		}

		const handler = apiHandlers[method];
		const mock = handler ? handler(body) : null;
		const payload = mock?.payload || mock || defaultPayload(method, body);
		return telegramJson(payload, mock?.status ?? 200);
	}
};
function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777001, is_bot: true, username: 'AdLinkTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 7000 + linkCalls.length } };
		case 'getChat': return { ok: true, result: { id: body?.chat_id, first_name: '未知', bio: '' } };
		case 'getChatMember': return { ok: true, result: { status: 'member', user: { id: body?.user_id } } };
		case 'getChatAdministrators': return { ok: true, result: [] };
		default: return { ok: true, result: true };
	}
}

sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });

const W = sandbox;
const GROUP_ID = '-1001111111111';
const OWNER_ID = 10001;

function makeEnv(extra = {}) {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID), DB: makeD1(), ...extra };
}

const handler = W.__handler;
const bootEnv = makeEnv();
resetCalls();
await handler.fetch(new Request('https://example.workers.dev/', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ update_id: 1, message: { message_id: 1, date: 1, text: '/start', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' } } })
}), bootEnv, { waitUntil() {} });

const CLEAN_BIO = '喜欢摄影和徒步';

// ================= [1] 形态闸 =================
section('[1] extractAdProfileHandles（形态闸 = 成本闸）');
{
	const pick = (p) => W.extractAdProfileHandles(p);
	assert('无链接的干净 bio → 空数组（零请求的充要条件）',
		pick({ firstName: '张三', lastName: '', username: '', bio: CLEAN_BIO }).length === 0,
		JSON.stringify(pick({ firstName: '张三', lastName: '', username: '', bio: CLEAN_BIO })));
	assert('空资料 → 空数组', pick({}).length === 0);
	assert('@xxx 抓得到', JSON.stringify(pick({ bio: '联系 @scamchan' })) === '["scamchan"]',
		JSON.stringify(pick({ bio: '联系 @scamchan' })));
	assert('t.me/xxx 抓得到', JSON.stringify(pick({ bio: '看主页 t.me/goodtech' })) === '["goodtech"]',
		JSON.stringify(pick({ bio: '看主页 t.me/goodtech' })));
	assert('t.me/joinchat 跳过（私密邀请查不出目标）',
		!pick({ bio: 't.me/joinchat/abc123' }).includes('joinchat'),
		JSON.stringify(pick({ bio: 't.me/joinchat/abc123' })));
	assert('本人 username 跳过（查它等于查自己）',
		pick({ username: 'myself', bio: '我的号 @myself' }).length === 0,
		JSON.stringify(pick({ username: 'myself', bio: '我的号 @myself' })));
	assert('去重（同一个 handle 只出现一次）',
		JSON.stringify(pick({ bio: '@a111 @a111 t.me/a111' })) === '["a111"]',
		JSON.stringify(pick({ bio: '@a111 @a111 t.me/a111' })));
	assert('上限 5 个（与 menshen profileLinkMax 一致）',
		pick({ bio: '@aaaa1 @bbbb2 @cccc3 @dddd4 @eeee5 @ffff6' }).length === 5,
		JSON.stringify(pick({ bio: '@aaaa1 @bbbb2 @cccc3 @dddd4 @eeee5 @ffff6' })));
	assert('昵称里的 handle 也算（menshen 同口径：昵称+简介一起扫）',
		pick({ firstName: '交流', lastName: '频道', username: '', bio: '' }).length === 0
		&& pick({ firstName: '@scamchan', lastName: '', username: '', bio: '' }).length === 1,
		JSON.stringify({ a: pick({ firstName: '@scamchan', lastName: '', username: '', bio: '' }) }));
}

// ================= [2] 解析 =================
section('[2] resolveAdLink：类型、标题、简介、缓存');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();

	const chan = await W.resolveAdLink(env, 'scamchan');
	assert('channel 拿到 type/title/description',
		chan && chan.kind === 'channel' && chan.title === '财富频道' && chan.about.includes('招代理'),
		JSON.stringify(chan));
	assert('正常频道同样解析出来',
		(await W.resolveAdLink(env, 'goodtech'))?.kind === 'channel');
	assert('查不到的 handle → kind=unknown 不抛异常',
		(await W.resolveAdLink(env, 'nosuchhandle'))?.kind === 'unknown',
		JSON.stringify(await W.resolveAdLink(env, 'nosuchhandle')));

	const bot = await W.resolveAdLink(env, 'adbot');
	assert('private + bot 结尾 → kind=bot',
		bot && bot.kind === 'bot', JSON.stringify(bot));
	assert('bot 简介取自公开预览页 og:description',
		bot && bot.about.includes('日入5000'), JSON.stringify(bot && bot.about));
	assert('抓了 t.me 预览页', ogCalls.includes('adbot'), JSON.stringify(ogCalls));

	const user = await W.resolveAdLink(env, 'stranger');
	assert('private 且不以 bot 结尾 → kind=user',
		user && user.kind === 'user', JSON.stringify(user));

	// 缓存：第二次不再发请求
	const before = linkCalls.length;
	await W.resolveAdLink(env, 'scamchan');
	await W.resolveAdLink(env, 'SCAMCHAN');     // 大小写不同也该命中同一份缓存
	assert('缓存命中后不再发 getChat（含大小写归一）',
		linkCalls.length === before, JSON.stringify({ before, after: linkCalls.length, calls: linkCalls }));
}

// ================= [3] 案底 =================
section('[3] isAdKnownAccount 案底三态');
{
	const env = makeEnv();
	await W.adDetectionReady(env);

	assert('没案底 → false', (await W.isAdKnownAccount(env, '900001')) === false);

	env.DB.query("INSERT INTO blacklist (id, reason, by_user) VALUES (?, ?, ?)", '900002', 'ad_auto', 'system');
	assert('在黑名单 → true', (await W.isAdKnownAccount(env, '900002')) === true);

	env.DB.query("INSERT INTO ad_pending_snapshots (owner_id, seq, user_id, chat_id, score, reasons, snapshot, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		'10001', 1, '900003', GROUP_ID, 9, '[]', '{}', Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 10000);
	assert('判过且未回滚 → true', (await W.isAdKnownAccount(env, '900003')) === true);

	env.DB.query('UPDATE ad_pending_snapshots SET expires_at = 0 WHERE user_id = ?', '900003');
	assert('已被 /ignore 回滚 → 不算案底（纠错过的判定不再定别人的罪）',
		(await W.isAdKnownAccount(env, '900003')) === false);
	assert('非法 id 不抛异常', (await W.isAdKnownAccount(env, 'abc')) === false);
}

// ================= [4] 判据 =================
section('[4] scoreAdProfileLinks：只加分、认得出「写明白了的」');
{
	const score = (links) => W.scoreAdProfileLinks(links);

	assert('空数组 → 0 分 0 条 reasons', (() => {
		const r = score([]);
		return r.score === 0 && r.reasons.length === 0;
	})(), JSON.stringify(score([])));
	assert('null/undefined → 0 分不抛', score(null).score === 0 && score(undefined).score === 0);

	const known = score([{ handle: 'badchan', kind: 'channel', title: 'X', about: '', adKnown: true }]);
	assert('案底 +3', known.score === 3 && known.reasons.some((r) => r.includes('案底')), JSON.stringify(known));

	const adAbout = score([{ handle: 'scamchan', kind: 'channel', title: '财富频道', about: '招代理 一天8000 带单上分', adKnown: false }]);
	assert('频道简介含招揽 +2', adAbout.score === 2 && adAbout.reasons.some((r) => r.includes('简介含招揽')), JSON.stringify(adAbout));

	const unknown = score([{ handle: 'x', kind: 'unknown', title: '', about: '', adKnown: false }]);
	assert('查不到 → 0 分（不因查不到而加重怀疑）', unknown.score === 0, JSON.stringify(unknown));

	const emptyAbout = score([{ handle: 'x', kind: 'channel', title: '正常频道', about: '', adKnown: false }]);
	assert('简介为空 → 0 分', emptyAbout.score === 0, JSON.stringify(emptyAbout));

	const normalChan = score([{ handle: 'goodtech', kind: 'channel', title: '技术交流频道', about: '分享编程与运维知识，欢迎讨论', adKnown: false }]);
	assert('正常技术频道 → 0 分（正常人挂自己的频道一分不涨）', normalChan.score === 0, JSON.stringify(normalChan));

	const personal = score([{ handle: 'stranger', kind: 'user', title: '张三', about: '招代理 一天8000', adKnown: false }]);
	assert('挂个人号 → 0 分（个人号不构成广告位，招揽写在自己 bio 里由 bio 层判）',
		personal.score === 0, JSON.stringify(personal));

	// —— kind 口径一致（2026-10-07 丙）：+3 此前不筛 kind，会与上面那条承诺相悖 ——
	const personalKnown = score([{ handle: 'stranger', kind: 'user', title: '张三', about: '', adKnown: true }]);
	assert('丙：挂个人号【有案底】也不给分（+3 与 +2 同一批 kind 限制，反向断言）',
		personalKnown.score === 0, JSON.stringify(personalKnown));
	const chanKnown = score([{ handle: 'badchan', kind: 'channel', title: 'X', about: '', adKnown: true }]);
	assert('丙：挂频道有案底仍 +3（收紧的只是 kind，不是案底本身）',
		chanKnown.score === 3, JSON.stringify(chanKnown));
	const botKnown = score([{ handle: 'badbot', kind: 'bot', title: 'B', about: '', adKnown: true }]);
	assert('丙：挂 bot 有案底仍 +3（bot 也在广告位类型里）',
		botKnown.score === 3, JSON.stringify(botKnown));
	const userSelfAd = score([{ handle: 'stranger', kind: 'user', title: '张三', about: '招代理 一天8000', adConfirmed: true }]);
	assert('丙：自举案底同样只认广告位类型（挂个人号即使被标过也 0 分）',
		userSelfAd.score === 0, JSON.stringify(userSelfAd));

	const both = score([
		{ handle: 'bad1', kind: 'channel', title: 'X', about: '', adKnown: true },
		{ handle: 'bad2', kind: 'channel', title: 'Y', about: '日入5000 私聊领福利', adKnown: false }
	]);
	assert('多条命中累加', both.score === 5, JSON.stringify(both));
}

// ================= [5] scoreAdProfile 接入 =================
section('[5] scoreAdProfile 接入（闸一形态零影响）');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	const base = { firstName: '李四', lastName: '', username: '', bio: CLEAN_BIO, bioFetched: true };

	const noLinks = await W.scoreAdProfile(base, { whitelist, skipMissingBioPenalty: false });
	const withEmpty = await W.scoreAdProfile({ ...base, adLinks: [] }, { whitelist, skipMissingBioPenalty: false });
	assert('没有 adLinks 字段与空数组等价（闸一 cheapProfile 走不到链接判据）',
		noLinks.score === withEmpty.score && JSON.stringify(noLinks.reasons) === JSON.stringify(withEmpty.reasons),
		JSON.stringify({ noLinks, withEmpty }));

	const withKnown = await W.scoreAdProfile({ ...base, adLinks: [{ handle: 'bad', kind: 'channel', title: 'X', about: '', adKnown: true }] },
		{ whitelist, skipMissingBioPenalty: false });
	assert('带案底时分数抬升', withKnown.score === noLinks.score + 3,
		JSON.stringify({ base: noLinks.score, withKnown: withKnown.score }));
	assert('reasons 里看得出是哪条链接给的分',
		withKnown.reasons.some((r) => r.includes('@bad') && r.includes('案底')),
		JSON.stringify(withKnown.reasons));

	const withAd = await W.scoreAdProfile({ ...base, adLinks: [{ handle: 'scamchan', kind: 'channel', title: '财富频道', about: '招代理 一天8000', adKnown: false }] },
		{ whitelist, skipMissingBioPenalty: false });
	assert('带招揽简介时分数抬升 2',
		withAd.score === noLinks.score + 2, JSON.stringify({ base: noLinks.score, withAd: withAd.score }));
}

// ================= [6] 入群线端到端 =================
section('[6] 入群线：解析真的跑进判定');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();

	// 按 chat_id 区分两条查询：带 @ 前缀的是解析层在查【被挂的目标】，
	// 数字 id 是入群线在查【这个人自己的资料】。前置分档要求这个人本身带广告
	// 特征才往下查，所以被查的人必须是两类词同现（+6）的形态，否则会落低档
	// 而解析根本不会发起 —— 那正是前置层该有的行为，不是测试坏掉。
	setApi({
		getChat: (body) => ({
			payload: {
				ok: true,
				result: String(body?.chat_id || '').startsWith('@')
					? { id: -100222333, type: 'channel', title: '项目频道', description: '一手面交 USDT 日入过万' }
					: { id: body?.chat_id, first_name: '进群用户', username: '', bio: '看主页 t.me/scamchan 一手面交 USDT' }
			}
		})
	});
	const result = await W.screenAdJoinMember(env, { id: 771001, is_bot: false, first_name: '进群用户' }, {
		chatId: GROUP_ID, chatTitle: '测试群', messageId: null,
		skipBlacklistCheck: true, source: 'new_chat_members'
	});
	assert('入群线发出了链接解析请求', linkCalls.includes('scamchan'), JSON.stringify(linkCalls));

	const row = env.DB.query('SELECT score, reasons FROM ad_join_checks ORDER BY id DESC LIMIT 1')[0];
	const reasons = row ? JSON.parse(row.reasons || '[]') : [];
	assert('入群流水的判定依据里带出链接分',
		reasons.some((r) => r.includes('scamchan') && r.includes('招揽')), JSON.stringify(reasons));
	assert('入群流水记录了本次结论', Boolean(row), JSON.stringify(row));
	// 链接分确实进了总分：拿同一份 bio 不带 adLinks 再算一次作为基准。
	// （这份 bio 有 t.me 豁免 -3、也有两类词同现 +6，所以总分未必是正数 ——
	//  断言的是【差值】，也就是 scoreAdProfileLinks 那 +2 有没有真加进去。）
	const whitelist = await W.loadAdDomainWhitelist(env);
	const bare = await W.scoreAdProfile(
		{ firstName: '进群用户', lastName: '', username: '', bio: '看主页 t.me/scamchan 一手面交 USDT', bioFetched: true },
		{ whitelist, skipMissingBioPenalty: false });
	assert('链接分加进了入群总分（总分 = 基准分 + 2）',
		Boolean(row) && Number(row.score) === bare.score + 2,
		JSON.stringify({ rowScore: row && row.score, bare: bare.score }));
	assert('返回值是合法结论', ['banned', 'observed', 'clean', 'cooled', 'skipped', 'error'].includes(result), String(result));
}

// ================= [7] 成本闸 =================
section('[7] 成本闸：没链接 = 零请求');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();

	// 干净 bio 走完整入群判定链，解析层一个 getChat('@') 都不该发
	setApi({
		getChat: (body) => ({
			payload: { ok: true, result: { id: body?.chat_id, first_name: '干净用户', username: '', bio: CLEAN_BIO } }
		})
	});
	await W.screenAdJoinMember(env, { id: 771002, is_bot: false, first_name: '干净用户' }, {
		chatId: GROUP_ID, chatTitle: '测试群', messageId: null,
		skipBlacklistCheck: true, source: 'new_chat_members'
	});
	assert('干净 bio 入群零链接解析请求', linkCalls.length === 0, JSON.stringify(linkCalls));
	assert('但资料该拉还是拉了（不是整条链没跑）',
		(env.DB.query('SELECT COUNT(*) AS c FROM ad_join_checks')[0].c) > 0);

	// 直接验主入口本身
	resetCalls();
	const none = await W.resolveAdProfileLinks(env, { firstName: '王五', lastName: '', username: '', bio: CLEAN_BIO });
	assert('resolveAdProfileLinks 无链接直接返回 []',
		Array.isArray(none) && none.length === 0 && linkCalls.length === 0,
		JSON.stringify({ none, linkCalls }));

	const some = await W.resolveAdProfileLinks(env, { firstName: '王五', lastName: '', username: '', bio: 't.me/goodtech' });
	assert('有链接才发请求', linkCalls.length === 1 && some.length === 1,
		JSON.stringify({ linkCalls, some: some.map((s) => s.handle) }));
}

// ================= [8] 落点与热路径（源码断言）=================
section('[8] 落点只在入群线与闸二，闸一不碰');
{
	const lines = src.split('\r\n');
	const idx = lines
		.map((line, i) => (line.includes('profile.adLinks = await resolveAdProfileLinksElevated(env, profile') ? i + 1 : 0))
		.filter(Boolean);
	assert('解析接入点恰好 2 处（都走带前置的入口）', idx.length === 2, JSON.stringify(idx));
	assert('两处分别在入群线与闸二（都是拉了 bio 的路径）', idx.length === 2 && idx[1] - idx[0] > 100,
		JSON.stringify(idx));
	// 两处都必须经过前置分档 —— 有一处绕过，那条路径上正常人照样会被查。
	assert('两处调用都经过前置分档（没有一处直连裸解析）',
		!lines.some((l) => l.includes('profile.adLinks = await resolveAdProfileLinks(env, profile)')));

	const gate1Start = lines.findIndex((l) => l.includes('=========== 闸一 · 零成本判定'));
	const gate1End = lines.findIndex((l, i) => i > gate1Start && l.includes('=========== 闸二'));
	assert('闸一区间内没有解析调用（零 getChat 断言的落点）',
		gate1Start > 0 && gate1End > gate1Start
		&& !lines.slice(gate1Start, gate1End).some((l) => l.includes('resolveAdProfileLinks')),
		JSON.stringify({ gate1Start, gate1End }));

	assert('闸一的 cheapProfile 仍是 bio 为空的零成本形态',
		lines.slice(gate1Start, gate1End).some((l) => l.includes("bio: ''")),
		'未找到 bio 空串');
	assert('scoreAdProfile 只在有 adLinks 时才加分（空字段零分）',
		src.includes('const linkResult = scoreAdProfileLinks(profile?.adLinks);'));
}

// ================= [9] 前置分档：先判人，再查链接 =================
section('[9] 前置分档：正常人不查，广告号必查');
{
	const clean = (p, text) => W.isAdProfileElevated(p, text ? { text } : {});

	// —— 正常侧：这些人的资料净分本来就被豁免词压成负数，查与不查结局一样 ——
	assert('挂自己频道的技术博主 → 不查', clean({ firstName: '老李', username: 'laoli_dev', bio: '我的频道 t.me/laoli_daily 分享编程' }) === false);
	assert('误封样本 Lov1900 → 不查', clean({ firstName: 'Lov', lastName: '1900', username: 'MiLov1900', bio: '私信请走频道 https://t.me/joeychat001' }) === false);
	assert('空资料新用户 → 不查', clean({ firstName: '新用户' }) === false);
	assert('普通中文昵称 → 不查', clean({ firstName: '张三', bio: '在杭州，做财务' }) === false);
	assert('代理群用户（官方中文/代理均在豁免）→ 不查',
		clean({ firstName: '小王', username: 'wang_ops', bio: '自建机场，官方中文文档见主页' }) === false);

	// —— 广告侧：这些人挂的链接必须查，否则 2~3 分的证据白丢 ——
	assert('#19 挂 t.me/+ 私密邀请 → 查', clean({ firstName: 'Kami', lastName: 'Flores', bio: 't.me/+MvjFa-oXyhYzNTY1 进群了解项目 一天8000!' }) === true);
	assert('#21 西方全名 + 招揽 bio → 查', clean({ firstName: 'Daniela', lastName: 'Maria', bio: '安全简单 一天稳定5万' }) === true);
	// 【关键回归】挂【公开】t.me 的广告号：bio 含 t.me 吃 -3 豁免，净分被压成负数。
	// 若档位看净分，这类人会和正常博主一起掉进低档 —— 恰恰漏掉最该查的那一次。
	assert('挂公开 t.me 频道的广告号 → 必须查（豁免词不能把有特征的人压进低档）',
		clean({ firstName: 'Kami', lastName: 'Flores', bio: '我的频道 t.me/scamfeed 更新项目' }) === true);
	// —— 正文路径（闸二才有）：资料干净但正文多类词同现 ——
	assert('资料干净 + 正文两类词同现 → 查（闸二必须传 text）',
		clean({ firstName: '张三', bio: '' }, '一手渠道，加我 面交 拿 USDT') === true);
	assert('资料干净 + 正文单类词 → 不查（主评分里也是 0 分，查了改不了结局）',
		clean({ firstName: '张三', bio: '' }, '稳赚项目每天保底，点这里看') === false);

	// —— 格式钉死：档位靠 reasons 的「+N 」识别加分项，格式一变就静默全落低档 ——
	assert('AD_REASON_POSITIVE_RE 常量存在', src.includes('const AD_REASON_POSITIVE_RE = /^\\+\\d+\\s/;'), '');
	// const 不挂 vm 全局，只能从源码抠原文编译执行（测真代码，不是复刻的等价正则）。
	const posSrc = (src.match(/const AD_REASON_POSITIVE_RE = [^;]+;/) || [])[0];
	assert('源码里抠得到该正则原文', !!posSrc, '没匹配到');
	const pos = posSrc ? new Function(posSrc + '\nreturn AD_REASON_POSITIVE_RE;')() : { test: () => false };
	assert('加分项格式「+2 昵称为…」被识别', pos.test('+2 昵称为机器生成型西方全名'));
	assert('减分项「-3 命中豁免词」不被识别（豁免不能抹掉特征）', !pos.test('-3 命中豁免词：t.me'));
	assert('不计分记录「（…单类词不计分…）」不被识别', !pos.test('（正文仅交易动词，单类词不计分：稳赚）'));

	// —— 低档的下游行为与改动前逐字节一致 ——
	assert('空 adLinks → 0 分 0 reasons（判定逻辑零变化）',
		W.scoreAdProfileLinks([]).score === 0 && W.scoreAdProfileLinks([]).reasons.length === 0);
	assert('没有 adLinks 字段同样 0 分（闸一 cheapProfile 的形态）',
		W.scoreAdProfileLinks(undefined).score === 0);
}

// ================= [10] 自举案底：标记、读回、撤销 =================
section('[10] 自举案底：案底存在 ad_link_cache，/ignore 可撤');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	// 不用 setApi：本文件的 fetch mock 对「带 @ 前缀的 getChat」走 LINK_RESULTS 表驱动，
	// 优先于 apiHandlers —— 挂一个表里没有的 handle 会拿到 400、kind 落 unknown，
	// 那不是被测代码的问题，是 mock 的入口分流。scamfeed 已注册在表里。
	const links = await W.resolveAdProfileLinks(env, { bio: 't.me/scamfeed' });
	assert('解析出一条（顺带把缓存表建出来）',
		links.length === 1 && links[0].handle === 'scamfeed', JSON.stringify(links));

	// —— 未标记：简介含招揽 → +2，且进 scoredHandles（自举只认加过分的） ——
	let r = W.scoreAdProfileLinks(links);
	assert('未标记：简介含招揽 +2', r.score === 2, JSON.stringify(r));
	assert('未标记：该 handle 进了 scoredHandles', r.scoredHandles.includes('scamfeed'),
		JSON.stringify(r.scoredHandles));
	assert('未标记时读回 adConfirmed 为 false', links[0].adConfirmed === false, JSON.stringify(links[0]));

	// —— 定罪 → 标记 ——
	const marked = await W.confirmAdLinkOnBan(env, { verdict: 'ban', snapshot: { scoredLinks: ['scamfeed'] } });
	assert('定罪后标记 1 个', marked === 1, String(marked));

	// —— 读回：+3 案底，且同一条简介不再重复 +2（否则 +5 虚高） ——
	const relink = await W.resolveAdProfileLinks(env, { bio: 't.me/scamfeed' });
	assert('缓存读回带 adConfirmed=true', relink[0]?.adConfirmed === true, JSON.stringify(relink[0]));
	r = W.scoreAdProfileLinks(relink);
	assert('已标记 → +3 案底', r.score === 3, JSON.stringify(r));
	assert('已标记 → 跳过 +2（同一条简介不重复计分，反向断言）',
		!r.reasons.some((x) => x.includes('招揽')), JSON.stringify(r.reasons));

	// —— 不是 ban 就不许标（反向断言） ——
	await W.clearAdLinkConfirmedOnIgnore(env, ['scamfeed']);
	const notBan = await W.confirmAdLinkOnBan(env, { verdict: 'observe', snapshot: { scoredLinks: ['scamfeed'] } });
	assert('verdict 非 ban → 不标记', notBan === 0, String(notBan));
	const noHandles = await W.confirmAdLinkOnBan(env, { verdict: 'ban', snapshot: {} });
	assert('没有 scoredLinks → 不标记（挂正常频道的广告号不会被盖章）', noHandles === 0, String(noHandles));

	// —— 回滚 ——
	await W.confirmAdLinkOnBan(env, { verdict: 'ban', snapshot: { scoredLinks: ['scamfeed'] } });
	const cleared = await W.clearAdLinkConfirmedOnIgnore(env, ['scamfeed']);
	assert('/ignore 撤销标记 → 1 行', cleared === 1, String(cleared));
	const back = await W.resolveAdProfileLinks(env, { bio: 't.me/scamfeed' });
	assert('撤销后读回 adConfirmed=false', back[0]?.adConfirmed === false, JSON.stringify(back[0]));

	// —— 快照两端（白名单重建） ——
	const restored = W.adPayloadFromSnapshot({ snapshot: { bio: 'x', scoredLinks: ['a', 'b'] } });
	assert('快照还原 scoredLinks', JSON.stringify(restored.scoredLinks) === '["a","b"]',
		JSON.stringify(restored.scoredLinks));
	const oldSnap = W.adPayloadFromSnapshot({ snapshot: { bio: 'x' } });
	assert('老快照还原空数组（不崩、回滚端循环不执行）',
		Array.isArray(oldSnap.scoredLinks) && oldSnap.scoredLinks.length === 0,
		JSON.stringify(oldSnap.scoredLinks));

	// —— 建表 / 迁移：新列必须真的在 ——
	const cols = env.DB.query('PRAGMA table_info(ad_link_cache)').map((c) => c.name);
	assert('ad_link_cache 有 ad_confirmed 列', cols.includes('ad_confirmed'), JSON.stringify(cols));

	// —— 标记的调用位置 ——
	//
	// 旧版这里锁的是「必须在演练 return 之后（演练一个动作都不做）」，那是演练还不学
	// 时候的口径。主人口径改成了「演练就是为了学习」「要的就是全学」，所以自举案底
	// 跟着其余六类判据一起搬进了共用学习函数 learnAdFeaturesOnVerdict ——
	// 正式处置与演练两条路都调它，判据不分叉。
	const learnStart = src.indexOf('async function learnAdFeaturesOnVerdict');
	const learnBody = src.slice(learnStart, learnStart + 6000);
	assert('confirmAdLinkOnBan 在共用学习函数内被调用',
		learnStart > 0 && learnBody.includes('await confirmAdLinkOnBan(env, evaluation)'), String(learnStart));
	// 演练分支必须也调这个函数，否则演练期学不到案底：封一批挂同款频道的号，
	// 那个频道不会被标成广告位，下一个人挂它还是只按普通链接算分。
	const dryStart = src.indexOf('===== 演练模式：命中记流水 + 学特征 + 推私聊，处置一个都不做 =====');
	const dryBody = src.slice(dryStart, dryStart + 5000);
	assert('演练分支调用共用学习函数（演练也要学）',
		dryStart > 0 && dryBody.includes('learnAdFeaturesOnVerdict('), String(dryStart));
	// 写入端不得把已确认的案底冲回 0（一次 6 小时后的重查就会冲掉）
	assert('写缓存对 ad_confirmed 取 MAX 而非覆盖', src.includes('ad_confirmed = MAX(ad_link_cache.ad_confirmed, excluded.ad_confirmed)'), '');
}

console.log(`\n========== 资料链接解析层：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
