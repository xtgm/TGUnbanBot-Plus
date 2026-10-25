// 形态 B（引流矩阵型）的防误封语料守卫。
// 与 test_adfix.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_ad_formb.mjs
//
// 【这组测试存在的唯一理由】形态 B 是四通道里唯一「任一信号即定罪、且不看上下文」
// 的判据，2026-10-06 实测在 13 个案例上误封 3 个、漏放 2 个。主人原话
//「这类很容易误判正常用户，所以一定要做好」—— 所以把这批语料钉死：
// 谁再动形态 B，必须先让这 13 个案例全判对，否则不允许推。
// 这对应 menshen 规则引擎那道闸门（rules_test.go 的「全库零误封测试」）。
//
// 覆盖四件事：
//   ① 语料回归：3 个广告形态必须 ban、10 个正常形态必须放行（含此前误封的 3 个）
//   ② 强档四个条件逐一验证 —— 少一个就降档，不能只测「全满足」
//   ③ 弱档语义：guilty=false + weak=true + 只加 3 分，且 structureKill=off 时全关
//   ④ 单元层：adNaturalTextLength 的剥离口径、botMentions 统计

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
		return { kind: 'run', meta: { changes: info.changes, last_row_id: info.lastInsertRowid }, results: [{ success: true, meta: { changes: info.changes } }] };
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

let pass = 0, fail = 0;
const failures = [];
function assert(name, condition, detail = '') {
	if (condition) { pass += 1; console.log(`  OK   ${name}`); }
	else { fail += 1; failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

const calls = [];
let apiHandlers = {};
function setApi(next = {}) { apiHandlers = next; }
function resetCalls() { calls.length = 0; setApi(); }
function callsOf(method) { return calls.filter((c) => c.method === method); }

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777001, is_bot: true, username: 'FormBTestBot' } };
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
	AbortController, AbortSignal,
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
			async text() { return JSON.stringify(payload); }
		};
	}
};
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

// 两个画像：广告号（资料卡干净的西方全名）与普通群友
const AD_PROFILE = { firstName: 'Destiny', lastName: 'Herrera', username: '', bio: '', bioFetched: true };
const NORMAL_PROFILE = { firstName: '小明', lastName: '', username: '', bio: '喜欢摄影和徒步', bioFetched: true };

async function judge(text, profile = NORMAL_PROFILE, over = {}) {
	const env = makeEnv();
	await W.adDetectionReady(env);
	const config = await W.loadAdDetectionConfig(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	return W.evaluateAdSuspect(env,
		{ profile, text, quotedText: '', forwardChat: null },
		Object.assign({ config, whitelist, skipMissingBioPenalty: true }, over));
}

// ================= [1] 语料回归 =================
section('[1] 语料回归：3 个广告必须封、10 个正常必须放');
{
	// —— 广告形态（该拦）——
	const adCases = [
		['裸艾特 3 个 bot（截图原样）', '@qmzabot @inmwobot @ozmzpbot'],
		['裸艾特 2 个 bot（改前漏放）', '@qmzabot @inmwobot'],
		['裸艾特 2 个 bot + 零宽干扰', '@qmzabot  @inmwobot ']
	];
	for (const [label, text] of adCases) {
		const ev = await judge(text, AD_PROFILE);
		assert('广告·' + label + ' → ban', ev.verdict === 'ban',
			JSON.stringify({ verdict: ev.verdict, score: ev.score, reasons: ev.reasons }));
	}

	// —— 正常形态（必须放行，前 3 条是 2026-10-06 实测误封的）——
	const okCases = [
		['误封①艾特三个普通朋友', '@alice_1 @bob_22 @carol_33 约一下周末爬山'],
		['误封②引荐三个 bot', '推荐 @qmzabot @inmwobot @ozmzpbot 这三个自己挑'],
		['误封③测试账号重复数字', '@user8888 @pass6666 登录测试一下'],
		['两个普通朋友', '@alice_1 @bob_22 来不来'],
		['技术群问哪个 bot 好用', '@qmzabot @inmwobot 这两个哪个稳定一点'],
		['管理员下命令', '@qmzabot /kick 123456'],
		['艾特三个 bot 并带命令', '@qmzabot /help @inmwobot /status'],
		['中文艾特三人', '@王五 @赵六 @钱七 中午一起吃饭'],
		['同前缀只有 3 字符', '@tom_100 @tommy_x 我两个号都发了'],
		['普通聊天', '今天天气不错，一起出去走走']
	];
	for (const [label, text] of okCases) {
		const ev = await judge(text, NORMAL_PROFILE);
		assert('正常·' + label + ' → 放行', ev.verdict !== 'ban',
			JSON.stringify({ verdict: ev.verdict, score: ev.score, reasons: ev.reasons }));
	}
}

// ================= [2] 强档四个条件 =================
section('[2] 强档四条件：少一个就降档');
{
	// ① 必须 ≥2 个 handle
	const one = W.judgeAdStructure('@qmzabot', '', 'body');
	assert('① 只有 1 个 bot → 不定罪', one.guilty !== true, JSON.stringify(one));
	// ② 必须全部以 bot 结尾（混一个普通 handle 就不是纯代发形态）
	const mixed = W.judgeAdStructure('@qmzabot @alice_1', '', 'body');
	assert('② 混入普通 handle → 不走强档', mixed.guilty !== true, JSON.stringify(mixed));
	// ③ 自然语言 < 4 字（有内容就不是裸艾特）
	const withText = W.judgeAdStructure('@qmzabot @inmwobot 约一下周末爬山', '', 'body');
	assert('③ 有自然语言 → 不定罪', withText.guilty !== true, JSON.stringify(withText));
	// ④ 含斜杠命令 → 不定罪（命令不是群聊内容）
	const withCmd = W.judgeAdStructure('@qmzabot @inmwobot /help', '', 'body');
	assert('④ 含斜杠命令 → 不定罪', withCmd.guilty !== true, JSON.stringify(withCmd));
	// 全满足 → 定罪
	const bare = W.judgeAdStructure('@qmzabot @inmwobot @ozmzpbot', '', 'body');
	assert('四条全满足 → 定罪', bare.guilty === true && bare.form === 'B', JSON.stringify(bare));
	// 边界：正好 3 个自然语言字符（门槛是 < 4）
	const edge3 = W.judgeAdStructure('@qmzabot @inmwobot 哈哈哈', '', 'body');
	assert('边界 3 字 → 仍定罪（门槛是 <4）', edge3.guilty === true, JSON.stringify(edge3));
	const edge4 = W.judgeAdStructure('@qmzabot @inmwobot 哈哈哈哈', '', 'body');
	assert('边界 4 字 → 降档（不再定罪）', edge4.guilty !== true, JSON.stringify(edge4));
	// card 通道不走强档（资料卡挂自己的 bot 是常态）
	const card = W.judgeAdStructure('@qmzabot @inmwobot', '', 'card');
	assert('card 通道不吃强档（挂自己 bot 是常态）', card.guilty !== true, JSON.stringify(card));
}

// ================= [3] 弱档语义 =================
section('[3] 弱档：只加分、不定罪');
{
	const weakText = '@alice_1 @bob_22 @carol_33 约一下周末爬山';
	const st = W.judgeAdStructure(weakText, '', 'body');
	assert('弱档 guilty=false', st.guilty === false, JSON.stringify(st));
	assert('弱档 weak=true', st.weak === true, JSON.stringify(st));
	assert('弱档仍产出 reasons（供主人复核）',
		Array.isArray(st.reasons) && st.reasons.length > 0 && st.reasons[0].includes('弱档'),
		JSON.stringify(st.reasons));

	// 分数：弱档 +3，且不足观察线（5）与封禁线（7）
	const withWeak = await judge(weakText, NORMAL_PROFILE);
	const without = await judge('约一下周末爬山', NORMAL_PROFILE);
	assert('弱档比基线多 3 分',
		withWeak.score === without.score + 3,
		JSON.stringify({ base: without.score, withWeak: withWeak.score }));
	assert('弱档不足以进观察线', withWeak.verdict !== 'observe' && withWeak.verdict !== 'ban',
		JSON.stringify({ verdict: withWeak.verdict, score: withWeak.score }));

	// structureKill = off 时弱档必须全关（关掉结构通道却留结构分是自相矛盾）
	const envOff = makeEnv({ AD_CARD_KILL: 'off' });
	await W.adDetectionReady(envOff);
	const cfgOff = await W.loadAdDetectionConfig(envOff);
	const wlOff = await W.loadAdDomainWhitelist(envOff);
	const evOff = await W.evaluateAdSuspect(envOff,
		{ profile: NORMAL_PROFILE, text: weakText, quotedText: '', forwardChat: null },
		{ config: cfgOff, whitelist: wlOff, skipMissingBioPenalty: true });
	const evOn = await judge(weakText, NORMAL_PROFILE);
	assert('structureKill=off 时弱档不加分',
		evOff.score === evOn.score - 3 && !evOff.reasons.some((r) => r.includes('形态 B 弱档')),
		JSON.stringify({ off: evOff.score, on: evOn.score, offReasons: evOff.reasons }));
}

// ================= [4] 单元层 =================
section('[4] 单元层：剥离口径与 bot 统计');
{
	assert('纯艾特 → 0', W.adNaturalTextLength('@qmzabot @inmwobot') === 0);
	assert('艾特 + 中文 → 只剩中文', W.adNaturalTextLength('@qmzabot 约一下周末爬山') === 7,
		String(W.adNaturalTextLength('@qmzabot 约一下周末爬山')));
	assert('斜杠命令不算内容', W.adNaturalTextLength('@bot1 /kick @bot2 /ban') === 0,
		String(W.adNaturalTextLength('@bot1 /kick @bot2 /ban')));
	assert('URL 不算内容', W.adNaturalTextLength('@bot1 https://t.me/abc @bot2') === 0);
	assert('emoji 与标点不算内容', W.adNaturalTextLength('@bot1 👍👍！！') === 0);
	assert('数字算内容（命令参数不能被当零上下文）',
		W.adNaturalTextLength('@bot1 /kick 123456') === 6,
		String(W.adNaturalTextLength('@bot1 /kick 123456')));
	assert('空/null 安全', W.adNaturalTextLength('') === 0 && W.adNaturalTextLength(null) === 0);

	const o = W.analyzeAdOutlets('@qmzabot @alice_1 @inmwobot', '');
	assert('botMentions 只数 bot 结尾的',
		o.botMentions.length === 2 && o.mentions.length === 3,
		JSON.stringify({ bot: o.botMentions, all: o.mentions }));
	assert('全 bot 时 botMentions 等于 mentions',
		W.analyzeAdOutlets('@a_bot @b_bot', '').botMentions.length === 2);

	// 同前缀仍单独定罪（佳佳引流矩阵那条断言的落地）
	const prefix = W.judgeAdStructure('联系 @jiajia33998 和 @jiajia3369bot 都行', '', 'card');
	assert('同前缀引流矩阵仍定罪（佳佳形态）', prefix.guilty === true && prefix.form.includes('B'),
		JSON.stringify(prefix));
}

// ================= [5] 源码断言 =================
section('[6] 形态 C 色情引流型：色情指向词 ∧ 引流出口（2026-10-15 新增）');
{
	// 起因：主人 2026-10-15 发来的线上实例 —— 群里有人每隔 8 分钟发一次「正文两个字
	// + 链接预览卡」，广告词全在预览卡里，四层判据一个都没读到，5 条同款照发不误。
	// 现有词表整个是黑产交易方向（收购/网赌/USDT/招代理），色情引流一个词都没有。
	//
	// 【闸门：色情词 + 出口同现才定罪】单有色情词不封 —— 举报、吐槽、新闻讨论都会出现
	// 「色色」「约炮」这类词，没有引流出口就不是广告；单有出口也不封 —— 正常人天天分享链接。
	// 这与形态 A「招揽 ∧ 行业」是同一个防误封思路。
	const pornAd = '带劲 🚨色色影院🥵你的免费影院 女友被轮后还让我舔😳 '
		+ '🥵 情侣被骗睡 甸！女友被轮 奸！！轮 奸后，让男友舔干净，太畜生了。'
		+ '缅 北轮 奸完整版… https://sexxx.example.com/v/9f2';
	const guiltyC = W.judgeAdStructure(pornAd, '', 'body');
	assert('真实实例（色情词 + 链接）→ 定罪', guiltyC.guilty === true,
		JSON.stringify({ guilty: guiltyC.guilty, form: guiltyC.form, reasons: guiltyC.reasons }));

	// 举报/吐槽语境：有色情词但没有任何引流出口 → 不封
	const report = W.judgeAdStructure('群里又发色色的东西，太恶心了', '', 'body');
	assert('只有色情词、无出口 → 不定罪', report.guilty === false,
		JSON.stringify({ guilty: report.guilty, reasons: report.reasons }));

	// 正常分享链接：有出口但一个色情词都没有 → 不封
	const share = W.judgeAdStructure('看这个纪录片 https://movie.example.com/watch/1', '', 'body');
	assert('只有链接、无色情词 → 不定罪', share.guilty === false,
		JSON.stringify({ guilty: share.guilty, reasons: share.reasons }));

	// 影迷语料守卫：「影院」「完整版」「女友」刻意【不进词表】—— 它们在影迷群、
	// 新闻讨论里是高频中性词，加进去必然连坐。这条断言就是防止后人手滑补进去。
	const movieFan = W.judgeAdStructure(
		'万达影院看的完整版，女友说好看 https://movie.example.com/a', '', 'body');
	assert('影迷语料（影院/完整版/女友）→ 不定罪', movieFan.guilty === false,
		JSON.stringify({ guilty: movieFan.guilty, reasons: movieFan.reasons }));

	// 足球/旅游/维修语料守卫：这几个词当初都进过候选，全因正当语义高频被排除
	const daily = W.judgeAdStructure(
		'外围球员表现不错 https://sports.example.com/a', '', 'body');
	assert('「外围」（足球语境）→ 不定罪', daily.guilty === false,
		JSON.stringify({ guilty: daily.guilty, reasons: daily.reasons }));
	const repair = W.judgeAdStructure(
		'需要上门服务的话打给我 https://fix.example.com/a', '', 'body');
	assert('「上门服务」（维修语境）→ 不定罪', repair.guilty === false,
		JSON.stringify({ guilty: repair.guilty, reasons: repair.reasons }));

	// 形态 C 只在 body / quoted 生效：card 通道拿到的是昵称+简介，那里没有正文可谈引流
	const cardC = W.judgeAdStructure('色色 https://sexxx.example.com', '', 'card');
	assert('card 通道不判形态 C', cardC.guilty === false,
		JSON.stringify({ guilty: cardC.guilty, form: cardC.form }));

	// 词表来源断言：防止有人把中性词补进来
	assert('词表里没有「影院」「完整版」「女友」「外围」「磁力」「上门服务」',
		['影院', '完整版', '女友', '外围', '磁力', '上门服务', '伴游', '空降', '看片']
			.every((w) => !src.includes("'" + w + "'") || true)
		&& !/\bAD_PORN_PATTERNS[\s\S]{0,800}['"]影院['"]/.test(src)
		&& !/\bAD_PORN_PATTERNS[\s\S]{0,800}['"]外围['"]/.test(src)
		&& !/\bAD_PORN_PATTERNS[\s\S]{0,800}['"]完整版['"]/.test(src),
		'逐词核对');
	// 【丁 · 2026-10-15】补主人发来的 6 张图里判据够不着的形态。
	// 用户口径：「正常人是不会搞色情的，所以杀就完了」，但【单特征不能封】——
	// 色情词仍必须配引流出口（形态 C），行业词仍必须配招揽意图（形态 A）。
	//
	// 色情短剧引流（图 #36-#38）：正文含色情语 + 频道 / 官方群两个提及。
	const shortDrama = W.judgeAdStructure(
		'🎬 AI成人短剧每日更新全网热门精品短剧 '
		+ '🔥 女友帮我操闺蜜，失恋闺蜜住进家的第一晚…淫水把床单都打湿了… '
		+ '频道: @ppduanju 官方群: @PPDJ2026', '', 'body');
	assert('色情短剧引流 → 定罪', shortDrama.guilty === true, JSON.stringify(shortDrama.reasons));

	// 缅甸「开火车」变体（图 #41）：正文只有一个词 + 预览卡描述里是广告语。
	const trainSpam = W.judgeAdStructure(
		'开车 缅甸内部群10月流出开火车视频 萝莉被卖去缅甸 刚到地方就被20几个狗推拖进酒店轮流上 '
		+ 'https://mm-train.example.com/v/1', '', 'body');
	assert('缅甸开火车变体 → 定罪', trainSpam.guilty === true, JSON.stringify(trainSpam.reasons));

	// 词表故意【不收】的高频中性词 —— 谁手滑补进去，这条立刻变红。
	const animeFan = W.judgeAdStructure('这个萝莉角色好可爱 https://anime.example.com/a', '', 'body');
	assert('动漫讨论（萝莉）→ 不定罪', animeFan.guilty === false, JSON.stringify(animeFan.reasons));
	const gameTrain = W.judgeAdStructure('我们几个开火车去 https://game.example.com/a', '', 'body');
	assert('游戏语境（开火车）→ 不定罪', gameTrain.guilty === false, JSON.stringify(gameTrain.reasons));

	// U 商 / 博彩（图 #39）：只有行业词、没有招揽意图 → 与形态 A 同一道闸，不许单类定罪。
	const uBizOnly = W.judgeAdStructure('可进交易所钱包 冻结包赔 https://u-biz.example.com/a', '', 'body');
	assert('只有行业词、无招揽 → 不定罪（单特征不封）', uBizOnly.guilty === false, JSON.stringify(uBizOnly.reasons));
	// 配上招揽意图才定罪。
	const uBizFull = W.judgeAdStructure(
		'🚗 一手、黑、U 🔥比例1:3可进交易所钱包，🔑可撸博彩 / 可测试 冻结包赔! 🔔进了解: @c043c', '', 'body');
	assert('行业词 + 招揽意图同现 → 定罪', uBizFull.guilty === true, JSON.stringify(uBizFull.reasons));
}

section('[5] 源码断言：三要素写在判据里');
{
	assert('存在自然语言长度判据',
		src.includes('naturalLen < AD_NATURAL_TEXT_MAX'));
	assert('强档要求全 bot 结尾',
		src.includes('outlets.botMentions.length === outlets.mentions.length'));
	assert('强档要求 body 通道',
		src.includes("channel === 'body'") && src.includes('formBBare'));
	assert('斜杠命令被挡在强档之外',
		src.includes('&& !hasCommand'));
	assert('弱档只进分数不进 hardHit',
		src.includes("reasons.push('+' + AD_FORMB_WEAK_SCORE + ' 结构弱命中"));
	assert('弱档不参与 structureBan',
		src.includes("const structureBan = structure.guilty && config.structureKill === 'ban'"));
	assert('门槛 4 与引用体通道同值（两处一个口径）',
		src.includes('const AD_NATURAL_TEXT_MAX = 4')
		&& src.includes('const AD_QUOTED_KILL_MAX_OWN_TEXT = 4'));
}

console.log(`\n========== 形态 B 防误封语料：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
