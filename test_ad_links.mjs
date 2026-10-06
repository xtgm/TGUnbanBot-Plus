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

const src = fs.readFileSync('_worker.js', 'utf8');

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
	adbot: { id: 777888, type: 'private', first_name: '', last_name: '' }   // handle 以 bot 结尾 → kind=bot
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

	setApi({
		getChat: (body) => ({
			payload: {
				ok: true,
				result: { id: body?.chat_id, first_name: '进群用户', username: '', bio: '看主页 t.me/scamchan 懂的都懂' }
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
	// （这个 bio 命中 t.me 豁免是 -3，所以总分未必是正数 —— 断言的是【差值】，
	//  也就是 scoreAdProfileLinks 那 +2 有没有真加进去。）
	const whitelist = await W.loadAdDomainWhitelist(env);
	const bare = await W.scoreAdProfile(
		{ firstName: '进群用户', lastName: '', username: '', bio: '看主页 t.me/scamchan 懂的都懂', bioFetched: true },
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
		.map((line, i) => (line.includes('profile.adLinks = await resolveAdProfileLinks(env, profile)') ? i + 1 : 0))
		.filter(Boolean);
	assert('解析接入点恰好 2 处', idx.length === 2, JSON.stringify(idx));
	assert('两处分别在入群线与闸二（都是拉了 bio 的路径）', idx.length === 2 && idx[1] - idx[0] > 100,
		JSON.stringify(idx));

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

console.log(`\n========== 资料链接解析层：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
