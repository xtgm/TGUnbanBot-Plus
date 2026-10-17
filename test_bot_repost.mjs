// bot 重发广告 · 方案三离线端到端验证
// 主人定的规则（原话）：
//   「让引用的bot在发送广告的时候就触发检查并且拦截执行全群踢出并加入全群黑名单，
//     而被引用的内容如果重发则直接执行删除且不会封禁引用广告的人，
//     因为第一条肯定是广告号。而接下来的引用全都是误封行为，可不能触发封禁。」
// 三条必须同时成立：
//   A. bot 发的广告能被检测到并全群封禁（原来 from.is_bot 直接免检）
//   B. 重发已处置文案 → 只删消息，绝不封禁
//   C. 白名单 bot（nmBot / GKY）完全免检，既不封也不删
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
let banned = [];
let muted = [];
let deleted = [];
let sent = [];
const resetCalls = () => { banned = []; muted = []; deleted = []; sent = []; };

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		if (m === 'banChatMember') banned.push(b.chat_id + ':' + b.user_id);
		// /ban /spam 现在走禁言（restrictChatMember），自动检测路径仍走踢出（banChatMember）。
		if (m === 'restrictChatMember') muted.push(b.chat_id + ':' + b.user_id);
		if (m === 'deleteMessage') deleted.push(b.chat_id + ':' + b.message_id);
		if (m === 'sendMessage') sent.push(String(b.text || ''));
		let payload = { ok: true, result: true };
		if (m === 'getChat') payload = { ok: true, result: { id: b?.chat_id, first_name: 'X', bio: '' } };
		else if (m === 'getChatMember') payload = { ok: true, result: { status: 'member', user: { id: b?.user_id } } };
		else if (m === 'getChatAdministrators') payload = { ok: true, result: [] };
		else if (m === 'sendMessage') payload = { ok: true, result: { message_id: 9000 + sent.length } };
		else if (m === 'getMe') payload = { ok: true, result: { id: 777, is_bot: true, username: 'mybot' } };
		return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.replace(/export\s+default\s*/, 'globalThis.__h = '), sandbox, { filename: '_worker.js' });
const W = sandbox;

function makeD1(sqlLog) {
	const db = new DatabaseSync(':memory:');
	const nIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const nOut = (r) => { if (!r) return null; const o = {}; for (const k of Object.keys(r)) o[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k]; return o; };
	const exec = (sql, params) => {
		if (sqlLog) sqlLog.push(String(sql).replace(/\s+/g, ' ').trim());
		const st = db.prepare(sql);
		const bd = params.map(nIn);
		const up = sql.trim().slice(0, 6).toUpperCase();
		if (up === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		// 带 RETURNING 的写入与真实 D1 一致：返回行（同款直封靠它在写缓存的同一条 SQL 里带回命中标记）
		if (/\bRETURNING\b/i.test(sql)) return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		const i = st.run(...bd);
		return { kind: 'write', meta: { changes: Number(i?.changes || 0), last_row_id: Number(i?.lastInsertRowid || 0), rows_written: Number(i?.changes || 0) } };
	};
	const mk = (sql) => {
		const s = { sql, params: [] };
		const a = {
			__d1: s,
			bind(...x) { s.params = x; return a; },
			async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
			async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; },
			async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; }
		};
		return a;
	};
	return {
		prepare: mk,
		async exec(sql) {
			for (const part of String(sql).split(';')) { const s = part.trim(); if (s) db.exec(s); }
			return { count: 1, duration: 0 };
		},
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; },
		query(sql) { return db.prepare(sql).all().map(nOut); }
	};
}

let pass = 0;
let fail = 0;
function check(label, cond, extra) {
	if (cond) { pass += 1; console.log('  ✅ ' + label + (extra ? '  ' + extra : '')); }
	else { fail += 1; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
}

const GROUPS = ['-100111', '-100222', '-100333'];
const baseEnv = {
	TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUPS.join(','), OWNER_IDS: '10001',
	AD_AUTO_BAN: 'true',
};
const AD_TEXT = '来跑分一天一万包吃住有意者私聊我详谈立即上车';
const drop = async (env, message) => {
	await W.__h.fetch(new Request('https://x.com/', { method: 'POST', body: JSON.stringify({ message }) }), env, { waitUntil() {} });
};
// 建全部表 + 装载运行时配置。ad_scan_state 属广告检测表组，必须显式 adDetectionReady，
// 只走 /export 那条路不会建它（readAdScanState 内部 catch 掉错误，看不出来）。
const bootEnv = async (env) => {
	await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });
	await W.adDetectionReady(env);
};

console.log('\n=== 1. 白名单解析 ===');
{
	const def = W.parseAdTrustedBots(undefined);
	check('未配置时回落默认（nmBot + GKY）', def.includes('nmnmfunbot') && def.includes('tc520lh_bot'), def.join(','));
	check('空串等同未配置', W.parseAdTrustedBots('   ').length === def.length);
	const custom = W.parseAdTrustedBots('@FooBot, barbot，@Baz_Bot');
	check('@ 前缀被剥、大小写归一', custom.join(',') === 'foobot,barbot,baz_bot', custom.join(','));
	check('全角逗号可用', W.parseAdTrustedBots('aaaabot，bbbbbot').length === 2);
	check('非法 handle 被丢弃（太短 / 含非法字符）',
		W.parseAdTrustedBots('ab, x-y-z, 正常bot, goodbot').join(',') === 'goodbot',
		W.parseAdTrustedBots('ab, x-y-z, 正常bot, goodbot').join(','));
	check('重复项去重', W.parseAdTrustedBots('samebot,@SameBot,samebot').length === 1);
	// 配置了自定义名单就【完全替换】默认值，不做合并 —— 否则主人无法摘掉某个默认 bot。
	check('自定义名单完全替换默认值', !W.parseAdTrustedBots('onlythisbot').includes('nmnmfunbot'));
}

console.log('\n=== 2. isAdExemptBot 三类豁免 ===');
{
	const env = { ...baseEnv, DB: makeD1() };
	await bootEnv(env);
	check('真人不豁免（哪怕 username 在名单里）',
		W.isAdExemptBot({ id: 555, is_bot: false, username: 'nmnmfunbot' }) === false);
	check('白名单 bot 豁免', W.isAdExemptBot({ id: 888, is_bot: true, username: 'nmnmfunbot' }) === true);
	check('白名单 bot 带 @ 前缀也豁免', W.isAdExemptBot({ id: 888, is_bot: true, username: '@NmNmFunBot' }) === true);
	check('GKY 豁免', W.isAdExemptBot({ id: 889, is_bot: true, username: 'tc520lh_bot' }) === true);
	// 字面值而非 W.ANON_ADMIN_BOT_ID：模块级 const/let 不挂 vm 沙箱全局，读出来是 undefined。
	check('GroupAnonymousBot 豁免（那是真人匿名发言）',
		W.isAdExemptBot({ id: 1087968824, is_bot: true, username: 'GroupAnonymousBot' }) === true);
	check('未知 bot 不豁免（这正是要纳入检测的那一类）',
		W.isAdExemptBot({ id: 999, is_bot: true, username: 'akojnbot' }) === false);
	check('无 username 的未知 bot 不豁免',
		W.isAdExemptBot({ id: 999, is_bot: true }) === false);
	check('空 user 不崩且不豁免', W.isAdExemptBot(null) === false && W.isAdExemptBot(undefined) === false);
}

console.log('\n=== 3. 已处置文案的记录与比对 ===');
{
	const env = { ...baseEnv, DB: makeD1() };
	await bootEnv(env);

	check('未记录任何文案时不命中', !(await W.matchHandledAdText(env, { text: AD_TEXT })));
	await W.recordHandledAdText(env, AD_TEXT);
	check('记录后原文命中', Boolean(await W.matchHandledAdText(env, { text: AD_TEXT })));
	check('带多余空白的同文案也命中（走归一化）',
		Boolean(await W.matchHandledAdText(env, { text: '  来跑分一天一万包吃住有意者私聊我详谈立即上车  ' })));
	check('引用体里的正文也命中（重发形态正是引用主人命令 + 自贴广告）',
		Boolean(await W.matchHandledAdText(env, { text: '好的', reply_to_message: { text: AD_TEXT } })));
	check('caption 字段同样参与比对',
		Boolean(await W.matchHandledAdText(env, { caption: AD_TEXT })));
	check('无关正文不命中', !(await W.matchHandledAdText(env, { text: '今天天气不错适合出门散步' })));
	check('空消息不命中', !(await W.matchHandledAdText(env, {})));
	// 这条通道是【无条件删消息】，短文案撞正常发言概率高，宁缺毋滥。
	await W.recordHandledAdText(env, '在吗');
	check('过短文案不入库（避免误删正常发言）', !(await W.matchHandledAdText(env, { text: '在吗' })));
	check('无 DB 时安全返回空', !(await W.matchHandledAdText({}, { text: AD_TEXT })));

	const raw = env.DB.query("SELECT value FROM ad_scan_state WHERE key='ad_handled_texts'")[0]?.value;
	const list = JSON.parse(raw || '[]');
	check('复用 ad_scan_state 单键存环形列表，不新建表', Array.isArray(list) && list.length === 1, raw);
	// 同文案重复处置不该堆积多份。
	await W.recordHandledAdText(env, AD_TEXT);
	const list2 = JSON.parse(env.DB.query("SELECT value FROM ad_scan_state WHERE key='ad_handled_texts'")[0].value);
	check('同文案重复记录去重（仍为 1 条）', list2.length === 1, JSON.stringify(list2));
}

console.log('\n=== 4. 环形上限与过期淘汰 ===');
{
	const env = { ...baseEnv, DB: makeD1() };
	await bootEnv(env);
	// 2026-10-17 模板资格闸：文案必须【自身带广告证据】才能进名单，
	// 所以这里的占位文案带一个业务词「跑分」——否则它压根不会被记录，本组测的就是空气。
	for (let i = 0; i < 510; i += 1) await W.recordHandledAdText(env, '广告文案编号第' + i + '号来跑分有意联系');
	const list = JSON.parse(env.DB.query("SELECT value FROM ad_scan_state WHERE key='ad_handled_texts'")[0].value);
	check('超过上限后截断到 500 条', list.length === 500, '实际 ' + list.length);
	check('最新的留在最前（第 509 号）', String(list[0].t).includes('第509号'), String(list[0].t));
	check('最旧的 10 条已被挤出（第 0～9 号都不在列表内）',
		!list.some((x) => /第[0-9]号/.test(String(x.t))),
		list.filter((x) => /第[0-9]号/.test(String(x.t))).length + ' 条残留');
	check('挤出的旧文案不再命中',
		!(await W.matchHandledAdText(env, { text: '广告文案编号第0号来跑分有意联系' })));

	// 过期项：手动塞一条 25 小时前的记录，应读不到。
	// 文案同样要带广告证据（「跑分」），否则会被模板资格闸先挡下 ——
	// 那样这条断言测的就是闸门而不是 TTL 了，会失去它本来的意义。
	const stale = JSON.stringify([{ t: W.normalizeAdFingerprintValue('过期的旧广告来跑分内容在此'), at: Date.now() - 8 * 24 * 60 * 60 * 1000 }]);
	await W.writeAdScanState(env, 'ad_handled_texts', stale);
	W.primeHandledAdTexts(env, JSON.parse(stale));
	check('超过一周的记录不再命中', !(await W.matchHandledAdText(env, { text: '过期的旧广告来跑分内容在此' })));
}

console.log('\n=== 5. 运行期缓存：热路径不重复读 D1 ===');
{
	const sqlLog = [];
	const env = { ...baseEnv, DB: makeD1(sqlLog) };
	await bootEnv(env);
	await W.recordHandledAdText(env, AD_TEXT);
	sqlLog.length = 0;
	for (let i = 0; i < 5; i += 1) await W.matchHandledAdText(env, { text: AD_TEXT });
	sqlLog.length = 0;
	const hits = [];
	for (let i = 0; i < 5; i += 1) hits.push(await W.matchHandledAdText(env, { text: AD_TEXT }));
	const reads = sqlLog.filter((s) => s.includes('FROM ad_scan_state'));
	check('5 次比对最多读 1 次 D1（15 秒运行期缓存）', reads.length <= 1, '实际 ' + reads.length + ' 次');
	check('5 次比对全部命中（缓存不能把结果吃掉）', hits.every((h) => Boolean(h)), JSON.stringify(hits));

	// 写入端必须主动刷缓存：重发常在封禁后几秒内到达，等 TTL 自然过期就会漏删第一条。
	// 同样带广告证据（「跑分」）才能进名单。
	const FRESH = '崭新的另一条广告来跑分需要立刻生效不能等缓存过期';
	await W.recordHandledAdText(env, FRESH);
	check('新记录立即可命中（写入端主动刷新缓存）', Boolean(await W.matchHandledAdText(env, { text: FRESH })));
}

console.log('\n=== 6. 端到端 A：未知 bot 发广告 → 被检测并全群封禁 ===');
{
	const env = { ...baseEnv, DB: makeD1() };
	await bootEnv(env);
	resetCalls();
	// 这就是主人描述的那个重发 bot：不在白名单、显示「已注销用户」、原样贴广告正文。
	await drop(env, {
		message_id: 5001,
		chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
		from: { id: 88801, is_bot: true, username: 'akojnbot', first_name: '已注销用户' },
		text: AD_TEXT,
	});
	check('bot 发的广告不再免检（原来 from.is_bot 直接 return）', deleted.length > 0, '删了 ' + deleted.length + ' 条');
	check('bot 被全群封禁', banned.some((x) => x.endsWith(':88801')), banned.join(' '));
	check('封禁覆盖多个配置群', new Set(banned.filter((x) => x.endsWith(':88801')).map((x) => x.split(':')[0])).size >= 2, banned.join(' '));
	const bl = env.DB.query("SELECT id FROM blacklist WHERE id='88801'");
	check('bot 进入黑名单', bl.length === 1, JSON.stringify(bl));
	const handled = JSON.parse(env.DB.query("SELECT value FROM ad_scan_state WHERE key='ad_handled_texts'")[0]?.value || '[]');
	check('该文案已登记进「已处置」列表（供后续重发比对）',
		handled.some((x) => String(x.t) === W.normalizeAdFingerprintValue(AD_TEXT)), JSON.stringify(handled));
}

console.log('\n=== 7. 端到端 B：重发已处置文案 → 只删不封（主人的核心规则）===');
{
	const env = { ...baseEnv, DB: makeD1() };
	await bootEnv(env);
	// 先让第一条广告号被正常处置（这一步建立「已处置」事实）。
	await drop(env, {
		message_id: 6001,
		chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
		from: { id: 99001, is_bot: false, first_name: '广告号' },
		text: AD_TEXT,
	});
	const firstBanned = banned.some((x) => x.endsWith(':99001'));
	check('第一条广告号照常被封（规则前半：第一条肯定是广告号）', firstBanned, banned.join(' '));

	// 重发：另一个 bot 带引用把同一段正文又贴一遍。
	resetCalls();
	await drop(env, {
		message_id: 6002,
		chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
		from: { id: 88802, is_bot: true, username: 'ybzjibot', first_name: '已注销用户' },
		text: AD_TEXT,
		reply_to_message: { message_id: 6000, from: { id: 10001, is_bot: false }, text: '/spam' },
	});
	check('重发消息被删除', deleted.includes(GROUPS[0] + ':6002'), deleted.join(' '));
	check('【重发者一根头发不动】没有任何封禁调用', banned.length === 0, banned.join(' '));
	const bl2 = env.DB.query("SELECT id FROM blacklist WHERE id='88802'");
	check('【重发者没进黑名单】', bl2.length === 0, JSON.stringify(bl2));

	// 真人带引用重发同款（例如转述警示他人）：同样只删不封。
	resetCalls();
	await drop(env, {
		message_id: 6003,
		chat: { id: GROUPS[1], type: 'supergroup', title: '测试群二' },
		from: { id: 70001, is_bot: false, first_name: '好心群友' },
		text: AD_TEXT,
		reply_to_message: { message_id: 6000, from: { id: 10001, is_bot: false }, text: '这是广告' },
	});
	check('真人带引用重发同款也只删不封', deleted.includes(GROUPS[1] + ':6003') && banned.length === 0,
		'删 ' + deleted.join(' ') + ' 封 ' + banned.join(' '));
	check('好心群友没进黑名单', env.DB.query("SELECT id FROM blacklist WHERE id='70001'").length === 0);

	// 跨群同样生效：已处置列表是全局的，不按群隔离。
	resetCalls();
	await drop(env, {
		message_id: 6004,
		chat: { id: GROUPS[2], type: 'supergroup', title: '测试群三' },
		from: { id: 88803, is_bot: true, username: 'tbzipbot' },
		text: AD_TEXT,
		reply_to_message: { message_id: 1, from: { id: 10001, is_bot: false }, text: '/ban' },
	});
	check('跨群重发同样只删不封', deleted.includes(GROUPS[2] + ':6004') && banned.length === 0,
		'删 ' + deleted.join(' ') + ' 封 ' + banned.join(' '));
}

console.log('\n=== 8. 端到端 C：白名单 bot 完全免检 ===');
{
	const env = { ...baseEnv, DB: makeD1() };
	await bootEnv(env);
	// 先建立「已处置」事实，制造最严苛的场景：白名单 bot 贴的正文恰好是已处置广告。
	await W.recordHandledAdText(env, AD_TEXT);
	resetCalls();
	// nmBot 的治理回执会【原样引用广告文本】—— 不豁免就会被删，直接破坏群治理。
	await drop(env, {
		message_id: 7001,
		chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
		from: { id: 88888, is_bot: true, username: 'nmnmfunbot', first_name: 'nmBot' },
		text: AD_TEXT,
		reply_to_message: { message_id: 7000, from: { id: 10001, is_bot: false }, text: '/spam' },
	});
	check('白名单 bot 的消息不被删除', !deleted.includes(GROUPS[0] + ':7001'), deleted.join(' '));
	check('白名单 bot 不被封禁', banned.length === 0, banned.join(' '));
	check('白名单 bot 没进黑名单', env.DB.query("SELECT id FROM blacklist WHERE id='88888'").length === 0);

	resetCalls();
	await drop(env, {
		message_id: 7002,
		chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
		from: { id: 88889, is_bot: true, username: 'tc520lh_bot', first_name: 'GKY' },
		text: AD_TEXT,
	});
	check('GKY 同样完全免检', deleted.length === 0 && banned.length === 0,
		'删 ' + deleted.join(' ') + ' 封 ' + banned.join(' '));

	// 【反例：证明上面几条不是假通过】同样的正文、同样带引用，只把 username 换成不在名单里的，
	// 必须立刻被处理。否则说明「免检」其实是这段文案压根没判成罪。
	resetCalls();
	await drop(env, {
		message_id: 7003,
		chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
		from: { id: 88890, is_bot: true, username: 'notinlistbot', first_name: '已注销用户' },
		text: AD_TEXT,
		reply_to_message: { message_id: 7000, from: { id: 10001, is_bot: false }, text: '/spam' },
	});
	check('反例：换成名单外 bot 立刻被删（证明免检不是假通过）',
		deleted.includes(GROUPS[0] + ':7003'), deleted.join(' '));

	// 自定义名单场景：主人把 nmBot 摘掉后，它就该和普通 bot 一样被处理。
	const envCustom = { ...baseEnv, AD_TRUSTED_BOTS: 'onlythisbot', DB: makeD1() };
	await bootEnv(envCustom);
	await W.recordHandledAdText(envCustom, AD_TEXT);
	resetCalls();
	await drop(envCustom, {
		message_id: 7004,
		chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
		from: { id: 88888, is_bot: true, username: 'nmnmfunbot', first_name: 'nmBot' },
		text: AD_TEXT,
		reply_to_message: { message_id: 7000, from: { id: 10001, is_bot: false }, text: '/spam' },
	});
	check('环境变量摘掉 nmBot 后它不再豁免', deleted.includes(GROUPS[0] + ':7004'), deleted.join(' '));
}

console.log('\n=== 9. 边界：真人不带引用重发 → 走正常检测，该封就封 ===');
{
	const env = { ...baseEnv, DB: makeD1() };
	await bootEnv(env);
	await W.recordHandledAdText(env, AD_TEXT);
	resetCalls();
	// 前置条件刻意收紧到「bot 发的」或「带引用体」：真人不带引用直接重打一遍广告正文，
	// 本来就该走 detectAdOnMessage 正常封禁；走只删不封的通道反倒是放过。
	await drop(env, {
		message_id: 8001,
		chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
		from: { id: 66001, is_bot: false, first_name: '另一个广告号' },
		text: AD_TEXT,
	});
	check('真人裸发已处置广告仍被正常封禁（不被只删通道放过）',
		banned.some((x) => x.endsWith(':66001')), banned.join(' '));
	check('该号进入黑名单', env.DB.query("SELECT id FROM blacklist WHERE id='66001'").length === 1);
}

console.log('\n=== 10. 边界：正常发言不受影响 ===');
{
	const env = { ...baseEnv, DB: makeD1() };
	await bootEnv(env);
	await W.recordHandledAdText(env, AD_TEXT);
	resetCalls();
	await drop(env, {
		message_id: 8101,
		chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
		from: { id: 55001, is_bot: false, first_name: '正常群友' },
		text: '今天天气不错大家有空一起出去玩啊',
		reply_to_message: { message_id: 8100, from: { id: 55002, is_bot: false }, text: '好啊' },
	});
	check('带引用的正常发言不被删', deleted.length === 0, deleted.join(' '));
	check('带引用的正常发言不被封', banned.length === 0, banned.join(' '));

	// 非配置群一律不管。
	resetCalls();
	await drop(env, {
		message_id: 8102,
		chat: { id: '-100999', type: 'supergroup', title: '外部群' },
		from: { id: 88804, is_bot: true, username: 'akojnbot' },
		text: AD_TEXT,
		reply_to_message: { message_id: 1, from: { id: 10001 }, text: '/spam' },
	});
	check('非配置群的重发不处理', deleted.length === 0 && banned.length === 0,
		'删 ' + deleted.join(' ') + ' 封 ' + banned.join(' '));
}

console.log('\n=== 11. 热路径 D1 预算：稳定态不因重发通道多读一次 ===');
{
	const sqlLog = [];
	const env = { ...baseEnv, DB: makeD1(sqlLog) };
	await bootEnv(env);
	// 先跑一条消息把各层运行期缓存热起来，再量稳定态。
	await drop(env, {
		message_id: 8201, chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
		from: { id: 44001, is_bot: false, first_name: '甲' }, text: '大家早上好啊今天心情不错',
	});
	sqlLog.length = 0;
	await drop(env, {
		message_id: 8202, chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
		from: { id: 44002, is_bot: false, first_name: '乙' }, text: '是啊阳光挺好的适合出门',
	});
	const stateReads = sqlLog.filter((s) => s.includes('FROM ad_scan_state'));
	check('真人无引用的普通发言不读 ad_handled_texts（前置条件已收紧）',
		stateReads.length === 0, stateReads.join(' | '));

	// 带引用的普通发言会查一次，但走运行期缓存，连续多条只付一次 D1。
	sqlLog.length = 0;
	for (let i = 0; i < 4; i += 1) {
		await drop(env, {
			message_id: 8300 + i, chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
			from: { id: 44003, is_bot: false, first_name: '丙' }, text: '嗯嗯我也这么觉得挺不错的' + i,
			reply_to_message: { message_id: 8202, from: { id: 44002, is_bot: false }, text: '是啊' },
		});
	}
	const reads2 = sqlLog.filter((s) => s.includes('FROM ad_scan_state'));
	check('4 条带引用发言最多读 1 次 ad_scan_state（运行期缓存生效）',
		reads2.length <= 1, '实际 ' + reads2.length + ' 次');
}


console.log('\n=== 11b. 同款直封（2026-09-26 方案 A）：第一主人 /spam 过的文案，广告号直发 → 删除 + 封禁 ===');
{
	// 中性文案：广告检测本身判不出来，这样下面出现的封禁只可能来自同款直封，而不是检测。
	// 2026-10-17 模板资格闸：/spam 记录进直封名单的文案必须【自身带广告证据】。
	// 本组原本用的是一句正常对话（「今天下午三点在老地方见面记得带上资料」）——
	// 那恰好复现了线上误封事故本身（正常话被当同款模板去连坐别人）。
	//
	// 换成「来跑分 一天1万」的理由：它 score=0（只有业务词、无交易动词），
	// 所以【正文自动检测判不出广告】——本组要测的正是「只靠同款名单封人」这条通道。
	// 若换成带交易动词的文案（如「急招跑分…」score=5），正文自己就被自动检测封了，
	// 根本轮不到同款通道，本组的四条断言会全部失去意义。
	const SPAM_TEXT = '来跑分 一天1万';
	const QUIET_ADMINS = () => ({ ok: true, result: [] });
	const originalFetch = sandbox.fetch;
	let adminList = QUIET_ADMINS;
	sandbox.fetch = async (url, init) => {
		const m = String(url).split('/').pop();
		if (m === 'getChatAdministrators') {
			let b = null; try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) {}
			return { ok: true, status: 200, json: async () => adminList(b) };
		}
		return originalFetch(url, init);
	};
	// 模拟第一主人回复广告 /spam 写入名单（与 /spam 分支调用的是同一个写入函数）
	const seedSpam = async (env, text = SPAM_TEXT) => { await W.recordSpamText(env, { text }); };
	const post = (env, mid, from, extra = {}) => drop(env, {
		message_id: mid, chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' }, from, text: SPAM_TEXT, ...extra,
	});
	const spamRows = (env) => env.DB.query('SELECT text_norm FROM ad_spam_texts').map((r) => r.text_norm);

	// ① 广告号（真人、不带引用、自身正文命中）→ 删除 + 加黑 + 全群封禁 + 私聊主人
	{
		const env = { ...baseEnv, DB: makeD1() };
		await bootEnv(env);
		await seedSpam(env);
		resetCalls();
		await post(env, 9101, { id: 71001, is_bot: false, first_name: '潜伏号' });
		check('广告号直发同款 → 消息被删', deleted.includes(GROUPS[0] + ':9101'), deleted.join(' '));
		check('广告号直发同款 → 全群封禁', GROUPS.every((g) => banned.includes(g + ':71001')), banned.join(' '));
		check('广告号直发同款 → 进黑名单', env.DB.query("SELECT id FROM blacklist WHERE id='71001'").length === 1);
		check('广告号直发同款 → 私聊主人「同款广告直封」并附回滚',
			sent.some((t) => t.includes('同款广告直封') && t.includes('/unban 71001')), sent.join(' | ').slice(0, 200));
	}

	// ② 名单里没有这段文案 → 不直封（证明封禁确实来自名单，而不是检测）
	{
		const env = { ...baseEnv, DB: makeD1() };
		await bootEnv(env);
		resetCalls();
		await post(env, 9102, { id: 71002, is_bot: false, first_name: '某人' });
		check('名单为空时同一文案不被封', !banned.some((x) => x.endsWith(':71002')), banned.join(' '));
	}

	// ③ 自动检测处置过的文案（只进 ad_handled_texts，不进直封名单）→ 真人直发不直封
	{
		const env = { ...baseEnv, DB: makeD1() };
		await bootEnv(env);
		await W.recordHandledAdText(env, SPAM_TEXT);
		resetCalls();
		await post(env, 9103, { id: 71003, is_bot: false, first_name: '某人' });
		check('自动检测来源的文案 → 真人直发不直封', !banned.some((x) => x.endsWith(':71003')), banned.join(' '));
	}

	// ④ 机器人账号贴同款 → 只删不封（走重发只删通道）
	{
		const env = { ...baseEnv, DB: makeD1() };
		await bootEnv(env);
		await seedSpam(env);
		await W.recordHandledAdText(env, SPAM_TEXT);
		resetCalls();
		await post(env, 9104, { id: 71004, is_bot: true, username: 'someadminbot' },
			{ reply_to_message: { message_id: 9000, from: { id: 10001, is_bot: false }, text: '/spam' } });
		check('机器人贴同款 → 只删', deleted.includes(GROUPS[0] + ':9104'), deleted.join(' '));
		check('机器人贴同款 → 不封', banned.length === 0, banned.join(' '));
	}

	// ⑤ 群友回复广告（同款只在引用体里）→ 只删不封
	{
		const env = { ...baseEnv, DB: makeD1() };
		await bootEnv(env);
		await seedSpam(env);
		await W.recordHandledAdText(env, SPAM_TEXT);
		resetCalls();
		await post(env, 9105, { id: 71005, is_bot: false, first_name: '好心群友' },
			{ text: '大家别信这是骗子', reply_to_message: { message_id: 9001, from: { id: 71001, is_bot: false }, text: SPAM_TEXT } });
		check('群友回复广告 → 只删', deleted.includes(GROUPS[0] + ':9105'), deleted.join(' '));
		check('群友回复广告 → 不封、不进黑名单',
			banned.length === 0 && env.DB.query("SELECT id FROM blacklist WHERE id='71005'").length === 0);
	}

	// ⑥ 群管理员自己发同款 → 不封（用独立群号，避开前面场景污染的按群管理员缓存）
	{
		const G = '-100861', G2 = '-100862';
		const env = { ...baseEnv, GROUP_ID: G + ',' + G2, DB: makeD1() };
		await bootEnv(env);
		await seedSpam(env);
		adminList = () => ({ ok: true, result: [{ user: { id: 71006 }, status: 'administrator' }] });
		resetCalls();
		await drop(env, { message_id: 9106, chat: { id: G, type: 'supergroup', title: '测试群' },
			from: { id: 71006, is_bot: false, first_name: '群管理员' }, text: SPAM_TEXT });
		check('群管理员发同款 → 不封（任一配置群管理员即豁免）', !banned.some((x) => x.endsWith(':71006')), banned.join(' '));
		adminList = QUIET_ADMINS;
	}

	// ⑥b 只在【别的】配置群当管理员，在当前发言群不是 → 仍全群豁免（本次需求核心）
	{
		const GA = '-100871', GB = '-100872';
		const env = { ...baseEnv, GROUP_ID: GA + ',' + GB, DB: makeD1() };
		await bootEnv(env);
		await seedSpam(env);
		// 71016 只在 GB 是管理员；他在 GA 发同款广告，也不能被封。
		adminList = (b) => (String(b?.chat_id) === GB
			? { ok: true, result: [{ user: { id: 71016 }, status: 'administrator' }] }
			: { ok: true, result: [] });
		resetCalls();
		await drop(env, { message_id: 9116, chat: { id: GA, type: 'supergroup', title: 'A群' },
			from: { id: 71016, is_bot: false, first_name: '别群管理员' }, text: SPAM_TEXT });
		check('只在别的配置群当管理员，也全群豁免不封', !banned.some((x) => x.endsWith(':71016')), banned.join(' '));
		adminList = QUIET_ADMINS;
	}

	// ⑦ 主人自己发同款 → 不封
	{
		const env = { ...baseEnv, DB: makeD1() };
		await bootEnv(env);
		await seedSpam(env);
		resetCalls();
		await post(env, 9107, { id: 10001, is_bot: false, first_name: '主人' });
		check('主人发同款 → 不封', !banned.some((x) => x.endsWith(':10001')), banned.join(' '));
	}

	// ⑧ 第一主人回复广告 /spam → 写进直封名单；副主人 /spam → 不写
	{
		const env = { ...baseEnv, OWNER_IDS: '10001,10002', DB: makeD1() };
		await bootEnv(env);
		resetCalls();
		await drop(env, {
			message_id: 9110, chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
			from: { id: 10001, is_bot: false, first_name: '主人' }, text: '/spam',
			reply_to_message: { message_id: 9109, from: { id: 71010, is_bot: false }, text: SPAM_TEXT },
		});
		check('第一主人回复 /spam → 文案写进直封名单',
			spamRows(env).includes(W.normalizeAdFingerprintValue(SPAM_TEXT)), JSON.stringify(spamRows(env)));

		const envD = { ...baseEnv, OWNER_IDS: '10001,10002', DB: makeD1() };
		await bootEnv(envD);
		await W.ensureAdSpamTextsTable(envD);
		resetCalls();
		await drop(envD, {
			message_id: 9112, chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
			from: { id: 10002, is_bot: false, first_name: '副主人' }, text: '/spam',
			reply_to_message: { message_id: 9111, from: { id: 71011, is_bot: false }, text: SPAM_TEXT },
		});
		check('副主人回复 /spam → 不写进直封名单', spamRows(envD).length === 0, JSON.stringify(spamRows(envD)));
	}

	// ⑨ 超过一周的名单条目不再直封
	{
		const env = { ...baseEnv, DB: makeD1() };
		await bootEnv(env);
		await W.ensureAdSpamTextsTable(env);
		const key = W.buildModerationTextKey({ text: SPAM_TEXT });
		await env.DB.prepare('INSERT INTO ad_spam_texts (text_hash, text_norm, at) VALUES (?, ?, ?)')
			.bind(key.hash, key.norm, Date.now() - 8 * 24 * 60 * 60 * 1000).run();
		resetCalls();
		await post(env, 9120, { id: 71020, is_bot: false, first_name: '某号' });
		check('超过一周的名单条目不再直封', !banned.some((x) => x.endsWith(':71020')), banned.join(' '));
	}

	// ⑩ 过短文案不进直封名单（防「你好」「在吗」误伤）
	{
		const env = { ...baseEnv, DB: makeD1() };
		await bootEnv(env);
		await W.ensureAdSpamTextsTable(env);
		await W.recordSpamText(env, { text: '在吗' });
		check('不到 6 个字的文案不进直封名单', spamRows(env).length === 0, JSON.stringify(spamRows(env)));
	}

	// ⑪ 热路径：真人普通发言，名单查询与消息缓存写入是同一条 SQL，不单独查 ad_spam_texts
	{
		const sqlLog = [];
		const env = { ...baseEnv, DB: makeD1(sqlLog) };
		await bootEnv(env);
		await seedSpam(env);
		await drop(env, { message_id: 9130, chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
			from: { id: 44010, is_bot: false, first_name: '甲' }, text: '大家早上好今天天气不错啊' });
		sqlLog.length = 0;
		await drop(env, { message_id: 9131, chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
			from: { id: 44011, is_bot: false, first_name: '乙' }, text: '是啊适合出门走走晒太阳' });
		const standalone = sqlLog.filter((s) => s.includes('ad_spam_texts') && !s.startsWith('INSERT INTO moderation_messages'));
		const merged = sqlLog.filter((s) => s.startsWith('INSERT INTO moderation_messages') && s.includes('ad_spam_texts'));
		check('普通发言不单独查询直封名单', standalone.length === 0, standalone.join(' | '));
		check('名单查询合并在消息缓存写入的同一条 SQL 里', merged.length === 1, '实际 ' + merged.length + ' 条');
	}
	sandbox.fetch = originalFetch;
}

console.log('\n=== 12. 引用已处置广告的四条管理命令先鉴权撤回再执行 ===');
{
	const originalFetch = sandbox.fetch;
	const requests = [];
	sandbox.fetch = async (url, init) => {
		const u = String(url);
		if (!u.includes('api.telegram.org')) {
			if (!u.includes('banlist')) throw new Error('Unexpected fetch: ' + u);
			return { ok: true, status: 200, text: async () => 'No records found' };
		}
		const method = u.split('/').pop();
		const body = init?.body ? JSON.parse(init.body) : {};
		requests.push({ method, body });
		if (method === 'getChatAdministrators') {
			return { ok: true, status: 200, json: async () => ({ ok: true, result: [{ user: { id: 6666 }, status: 'administrator' }] }) };
		}
		return originalFetch(url, init);
	};
	for (const command of ['/unban 88001', '/BAN@TestBot 88001', '/spam', '/CHECK@TestBot']) {
		const env = { ...baseEnv, DB: makeD1() };
		await bootEnv(env);
		await W.recordHandledAdText(env, AD_TEXT);
		if (command.startsWith('/unban') || command.startsWith('/CHECK')) {
			await W.addToBlacklist('88001', env, { reason: 'manual', by: '10001' });
		}
		resetCalls();
		requests.length = 0;
		await drop(env, {
			message_id: 8400, chat: { id: GROUPS[0], type: 'supergroup', title: '测试群' },
			from: { id: 6666, is_bot: false, first_name: '群管理员' }, text: command,
			reply_to_message: { message_id: 8399, from: { id: 88001, is_bot: false }, text: AD_TEXT },
		});
		const deletedCommand = requests.filter((r) => r.method === 'deleteMessage' && Number(r.body.message_id) === 8400).length;
		const commandDeleteIndex = requests.findIndex((r) => r.method === 'deleteMessage' && Number(r.body.message_id) === 8400);
		const adminIndex = requests.findIndex((r) => r.method === 'getChatAdministrators');
		const groupSent = requests.some((r) => r.method === 'sendMessage' && String(r.body.chat_id) === String(GROUPS[0]) && r.body.text.includes('88001'));
		const ownerSent = requests.some((r) => r.method === 'sendMessage' && String(r.body.chat_id) === '10001' && r.body.text.includes('88001'));
		check(command + ' 不撤回机器人结果', !requests.some((r) => r.method === 'deleteMessage' && ![8400, 8399].includes(Number(r.body.message_id))));
		if (command.startsWith('/CHECK')) {
			// /check 群聊【不撤回命令】（主人要求）：群内返回完整结果 + 私聊第一主人。
			check(command + ' 群聊不撤回命令', deletedCommand === 0);
			check(command + ' 群内保留完整结果，同时私聊第一主人', groupSent && ownerSent);
		} else if (command.startsWith('/unban')) {
			// /unban 群聊撤回命令 + 群内简洁结果（含目标 TGID）+ 私聊第一主人完整。
			check(command + ' 鉴权后撤回命令一次', deletedCommand === 1);
			check(command + ' 先完成管理员鉴权再撤回', commandDeleteIndex > adminIndex);
			check(command + ' 群内简洁结果，同时私聊第一主人', groupSent && ownerSent);
		} else {
			// /ban·/spam 群聊撤回命令 + 群内简洁回执（含目标可点击 + 可复制 TGID）+ 私聊第一主人完整。
			check(command + ' 鉴权后撤回命令一次', deletedCommand === 1);
			check(command + ' 先完成管理员鉴权再撤回', commandDeleteIndex > adminIndex);
			check(command + ' 群内简洁回执，同时私聊第一主人', groupSent && ownerSent);
		}
		if (command.startsWith('/unban')) {
			check(command + ' 仍先移除 D1 再全群解封',
				env.DB.query("SELECT id FROM blacklist WHERE id='88001'").length === 0
				&& requests.filter((r) => r.method === 'unbanChatMember').length === GROUPS.length);
		} else if (command.startsWith('/CHECK')) {
			check(command + ' 双库查询保持只读', sent.some((text) => text.includes('封禁查询结果'))
				&& env.DB.query("SELECT id FROM blacklist WHERE id='88001'").length === 1);
		} else {
			check(command + ' 继续加黑并全群禁言', env.DB.query("SELECT id FROM blacklist WHERE id='88001'").length === 1
				&& muted.filter((x) => x.endsWith(':88001')).length === GROUPS.length);
			if (command === '/spam') check('/spam 仍删除被引用的广告消息', deleted.includes(GROUPS[0] + ':8399'));
		}
	}
	const env = { ...baseEnv, DB: makeD1() };
	await bootEnv(env);
	await W.recordHandledAdText(env, AD_TEXT);
	resetCalls();
	await drop(env, {
		message_id: 8500, chat: { id: GROUPS[0], type: 'supergroup' },
		from: { id: 6666, is_bot: false }, text: '/spam_extra',
		reply_to_message: { message_id: 8399, from: { id: 88001, is_bot: false }, text: AD_TEXT },
	});
	check('相似前缀不扩大四条命令的排除范围', deleted.includes(GROUPS[0] + ':8500'));
	sandbox.fetch = originalFetch;
}

console.log('\nbot 重发广告（方案三）验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
