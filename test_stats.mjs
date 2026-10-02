// 群统计（发言 / 入群 / 退群）· 离线验证
// 覆盖：建表、北京时区切天、发言计数+活跃人数、进退群计数、日/周/月汇总、仅本群隔离、
//       发言排行+翻页、180 天剪枝、/stats 权限（群管理员/群主/主人/副主人可查，普通成员静默）、
//       /stats 输出内容、发言钩子端到端（真人计数、命令计数、bot 不计）、
//       切天边界（23:59/00:00、周日/周一、周跨月、月末、跨年、闰日、换时区、跨 0 点渲染同一天）。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const sent = [];
let currentAdmins = [];   // 当前群 Telegram 管理员 id 列表（供 getChatAdministrators mock）
let memberCountMock = 4855;   // getChatMemberCount 返回值；置 null 模拟接口失败

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
			payload = { ok: true, result: { status: 'member', user: { id: b?.user_id } } };
		} else if (m === 'getChatMemberCount') {
			// 面板报头的「当前成员」。默认 4855（与方案截图同值），可由 memberCountMock 覆盖以测失败态。
			payload = { ok: true, result: memberCountMock };
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

// 可控时钟：命令层（/stats、面板按钮）内部取的是 Date.now()，不传时间参数。
// 测试数据写在固定基准日，查询却走真实今天，就会出现「只有基准日当天跑才绿」的日期漂移。
// 这里把沙箱里的 Date.now 接到 W.__clock：设了就用它，置 null 恢复真实时间。
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
await W.statReady(env);

// 固定基准时间：2026-09-24（周四）10:00 UTC = 18:00 北京 → 北京日 2026-09-24。
const T = Date.parse('2026-09-24T10:00:00Z');

console.log('\n=== 1. 建表与时区 ===');
check('stat_speech 存在', env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='stat_speech'").length === 1);
check('stat_member 存在', env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='stat_member'").length === 1);
check('北京时区当日: 18:00 北京 → 09-24', W.statDayString(env, T) === '2026-09-24');
check('北京时区跨天: 20:00 UTC(次日04:00北京) → 09-25', W.statDayString(env, Date.parse('2026-09-24T20:00:00Z')) === '2026-09-25');
const wk = W.statRangeDays(env, 'week', T);
check('本周一为起点(周四→周一 09-21)', wk.start === '2026-09-21' && wk.end === '2026-09-24', JSON.stringify(wk));
const mo = W.statRangeDays(env, 'month', T);
check('本月起点 09-01', mo.start === '2026-09-01' && mo.end === '2026-09-24', JSON.stringify(mo));

console.log('\n=== 2. 发言计数 + 活跃人数 ===');
await W.recordSpeechStat(env, '-100111', { id: '1', first_name: '张三' }, T);
await W.recordSpeechStat(env, '-100111', { id: '1', first_name: '张三' }, T);
await W.recordSpeechStat(env, '-100111', { id: '2', first_name: '李四', username: 'lisi' }, T);
await W.recordSpeechStat(env, '-100111', { id: '3', first_name: '王五' }, T);
const s1 = await W.queryStatSummary(env, '-100111', 'day', T);
check('总发言 4 条', s1.totalMsg === 4, JSON.stringify(s1));
check('活跃 3 人', s1.activeUsers === 3, JSON.stringify(s1));
check('用户1 计到 2 条', Number(env.DB.query("SELECT msg_count FROM stat_speech WHERE user_id='1'")[0]?.msg_count) === 2);

console.log('\n=== 3. 进 / 退 / 被移出 计数 ===');
await W.recordMemberEvent(env, '-100111', 'join', T);
await W.recordMemberEvent(env, '-100111', 'join', T);
await W.recordMemberEvent(env, '-100111', 'leave', T);
await W.recordMemberEvent(env, '-100111', 'kicked', T);
const s2 = await W.queryStatSummary(env, '-100111', 'day', T);
check('入群 2', s2.join === 2, JSON.stringify(s2));
check('退群 1', s2.leave === 1, JSON.stringify(s2));
check('被移出 1', s2.kicked === 1, JSON.stringify(s2));

console.log('\n=== 4. 仅本群隔离 ===');
await W.recordSpeechStat(env, '-100222', { id: '7', first_name: '别群人' }, T);
const other = await W.queryStatSummary(env, '-100222', 'day', T);
const mine = await W.queryStatSummary(env, '-100111', 'day', T);
check('别群 -100222 只有 1 条', other.totalMsg === 1);
check('本群 -100111 不受别群影响仍 4 条', mine.totalMsg === 4);

console.log('\n=== 5. 发言排行 + 翻页 ===');
const RC = '-100777';
for (let i = 1; i <= 35; i++) for (let j = 0; j < i; j++) await W.recordSpeechStat(env, RC, { id: 'r' + i, first_name: 'R' + i }, T);
const p1 = await W.queryStatRanking(env, RC, 'day', 1, T);
check('第 1 页 30 人', p1.rows.length === 30, '实际 ' + p1.rows.length);
check('总 35 人', p1.total === 35, '实际 ' + p1.total);
check('总页数 2', p1.totalPages === 2);
check('第 1 名是发言最多的 r35(35条)', p1.rows[0].userId === 'r35' && p1.rows[0].count === 35, JSON.stringify(p1.rows[0]));
check('rank 从 1 连续到 30', p1.rows[0].rank === 1 && p1.rows[29].rank === 30);
check('昵称带过来了', p1.rows[0].displayName === 'R35');
const p2 = await W.queryStatRanking(env, RC, 'day', 2, T);
check('第 2 页 5 人', p2.rows.length === 5, '实际 ' + p2.rows.length);
check('第 2 页 rank 从 31 起', p2.rows[0].rank === 31);

console.log('\n=== 6. 日 / 周 / 月 跨天汇总 ===');
const G6 = '-100888';
await W.recordSpeechStat(env, G6, { id: 'a', first_name: 'A' }, Date.parse('2026-09-22T10:00:00Z')); // 本周·周二
await W.recordSpeechStat(env, G6, { id: 'a', first_name: 'A' }, Date.parse('2026-09-24T10:00:00Z')); // 本周·周四(今日)
await W.recordSpeechStat(env, G6, { id: 'a', first_name: 'A' }, Date.parse('2026-09-14T10:00:00Z')); // 本月·上周
check('日汇总只含今日 1 条', (await W.queryStatSummary(env, G6, 'day', T)).totalMsg === 1);
check('周汇总含本周 2 条(周二+周四)', (await W.queryStatSummary(env, G6, 'week', T)).totalMsg === 2);
check('月汇总含本月全部 3 条', (await W.queryStatSummary(env, G6, 'month', T)).totalMsg === 3);

console.log('\n=== 7. 180 天剪枝 ===');
await W.recordSpeechStat(env, '-100111', { id: 'oldu', first_name: '旧' }, T - 190 * 86400000);
await W.recordMemberEvent(env, '-100111', 'join', T - 190 * 86400000);
check('剪枝前有 190 天前发言', env.DB.query("SELECT * FROM stat_speech WHERE user_id='oldu'").length === 1);
await W.pruneStatData(env, T);
check('剪枝删掉 190 天前发言', env.DB.query("SELECT * FROM stat_speech WHERE user_id='oldu'").length === 0);
check('剪枝保留近期发言(用户1还在)', env.DB.query("SELECT * FROM stat_speech WHERE user_id='1'").length === 1);

console.log('\n=== 8. /stats 权限（群内） ===');
// 第 8～10 节全走命令层，时钟冻结在基准时间 T，与上面写入数据用的是同一天。
W.__clock = () => T;
sent.length = 0; currentAdmins = ['777'];
await W.handleStatsCommand({ chat: { id: '-100111', type: 'supergroup', title: '统计测试群' }, from: { id: 555, is_bot: false }, text: '/stats', message_id: 101 }, env, { waitUntil() {} });
check('普通成员群内 /stats 静默（不回群、不私聊）', sent.length === 0);
sent.length = 0;
await W.handleStatsCommand({ chat: { id: '-100111', type: 'supergroup', title: '统计测试群' }, from: { id: 777, is_bot: false }, text: '/stats', message_id: 102 }, env, { waitUntil() {} });
check('群管理员群内裸 /stats 只出用法（不甩数据、不含私聊指定群那条）', sent.some((x) => x.chatId === '-100111' && x.text.includes('用法') && x.text.includes('/stats today')) && !sent.some((x) => x.text.includes('总发言') || x.text.includes('-100群ID')));
const panelMsg = sent.find((x) => x.chatId === '-100111' && x.text.includes('用法'));
const panelBtns = (panelMsg?.markup?.inline_keyboard || [])[0] || [];
check('群内用法带三个内联按钮(今日/本周/本月，回调 statgo:)', panelBtns.length === 3 && panelBtns.every((b) => String(b.callback_data || '').startsWith('statgo:')));
sent.length = 0;
await W.handleStatsCommand({ chat: { id: '-100111', type: 'supergroup', title: '统计测试群' }, from: { id: 777, is_bot: false }, text: '/stats today', message_id: 108 }, env, { waitUntil() {} });
check('群管理员 /stats today 发今日结果到本群', sent.some((x) => x.chatId === '-100111' && x.text.includes('消息 <b>')));
sent.length = 0; currentAdmins = [];
await W.handleStatsCommand({ chat: { id: '-100111', type: 'supergroup', title: '统计测试群' }, from: { id: Number(OWNER), is_bot: false }, text: '/stats week', message_id: 103 }, env, { waitUntil() {} });
check('主人不受管理员身份限制、随时可查', sent.some((x) => x.chatId === '-100111' && x.text.includes('本周')));
sent.length = 0;
await W.handleStatsCommand({ chat: { id: '-100111', type: 'supergroup', title: '统计测试群' }, from: { id: Number(DEPUTY), is_bot: false }, text: '/stats month', message_id: 104 }, env, { waitUntil() {} });
check('副主人随时可查', sent.some((x) => x.chatId === '-100111' && x.text.includes('本月')));

console.log('\n=== 8b. 用法面板按钮：点一下新发数据（不改面板） ===');
const goToday = 'statgo:' + W.encodeAdCallbackToken('day|-100111');
sent.length = 0; currentAdmins = ['777'];
await W.handleStatsGoCallback({ id: 'cb1', data: goToday, from: { id: 777 }, message: { chat: { id: '-100111' }, message_id: 102 } }, env);
check('管理员点面板[今日] → 新发今日数据到本群', sent.some((x) => x.chatId === '-100111' && x.text.includes('消息 <b>')));
sent.length = 0; currentAdmins = [];
await W.handleStatsGoCallback({ id: 'cb2', data: 'statgo:' + W.encodeAdCallbackToken('week|-100111'), from: { id: Number(OWNER) }, message: { chat: { id: '-100111' }, message_id: 102 } }, env);
check('主人点面板[本周] → 新发本周数据', sent.some((x) => x.chatId === '-100111' && x.text.includes('本周')));
sent.length = 0; currentAdmins = [];
await W.handleStatsGoCallback({ id: 'cb3', data: goToday, from: { id: 555 }, message: { chat: { id: '-100111' }, message_id: 102 } }, env);
check('非管理员点面板 → 不出数据（权限拦截）', !sent.some((x) => x.text.includes('总发言')));

console.log('\n=== 9. /stats 输出内容 ===');
sent.length = 0; currentAdmins = [];
await W.handleStatsCommand({ chat: { id: '-100111', type: 'supergroup', title: '统计测试群' }, from: { id: Number(OWNER), is_bot: false }, text: '/stats today', message_id: 105 }, env, { waitUntil() {} });
const out = sent.find((x) => x.chatId === '-100111');
check('输出含总发言', !!out && out.text.includes('消息 <b>'));
check('输出含活跃人数', !!out && out.text.includes('活跃人数'));
check('输出含入群/退群/被移出', !!out && out.text.includes('新增') && out.text.includes('离开') && out.text.includes('被移出'));
check('输出含发言排行', !!out && out.text.includes('发言排行'));
check('排行昵称可点击(tg://user)', !!out && out.text.includes('tg://user?id='));

console.log('\n=== 10. /stats 私聊仅主人副主人 ===');
sent.length = 0;
await W.handleStatsCommand({ chat: { id: 555, type: 'private' }, from: { id: 555, is_bot: false }, text: '/stats -100111', message_id: 106 }, env, { waitUntil() {} });
check('私聊非主人 → 权限不足', sent.some((x) => x.chatId === '555' && x.text.includes('权限不足')));
sent.length = 0;
await W.handleStatsCommand({ chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER), is_bot: false }, text: '/stats -100111 week', message_id: 107 }, env, { waitUntil() {} });
check('私聊主人查指定群 → 出结果', sent.some((x) => x.chatId === String(OWNER) && x.text.includes('本周')));
sent.length = 0;
await W.handleStatsCommand({ chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER), is_bot: false }, text: '/stats', message_id: 109 }, env, { waitUntil() {} });
check('私聊主人裸 /stats → 出私聊用法（含指定群写法）', sent.some((x) => x.chatId === String(OWNER) && x.text.includes('用法') && x.text.includes('/stats -100群ID')));

console.log('\n=== 11. 发言钩子端到端（webhook） ===');
W.__clock = null;   // 本节验证的就是「按真实当下记账」，恢复真实时间
const todayNow = W.statDayString(env, Date.now());
const drive = async (msg) => { const p = []; await W.__h.fetch(new Request('https://x/', { method: 'POST', body: JSON.stringify({ message: msg }) }), env, { waitUntil: (x) => p.push(Promise.resolve(x)) }); await Promise.allSettled(p); };
await drive({ message_id: 5001, chat: { id: '-100111', type: 'supergroup', title: 'g' }, from: { id: 8801, is_bot: false, first_name: '钩子用户' }, text: '普通聊天' });
check('真人普通消息已计入发言', Number(env.DB.query("SELECT msg_count FROM stat_speech WHERE user_id='8801' AND day='" + todayNow + "'")[0]?.msg_count) >= 1);
await drive({ message_id: 5002, chat: { id: '-100111', type: 'supergroup', title: 'g' }, from: { id: 8802, is_bot: false, first_name: '发命令' }, text: '/stats' });
check('命令消息也计入发言（真人所有消息）', Number(env.DB.query("SELECT msg_count FROM stat_speech WHERE user_id='8802' AND day='" + todayNow + "'")[0]?.msg_count) >= 1);
await drive({ message_id: 5003, chat: { id: '-100111', type: 'supergroup', title: 'g' }, from: { id: 8803, is_bot: true, first_name: '机器人' }, text: 'bot发言' });
check('bot 消息不计入发言', env.DB.query("SELECT * FROM stat_speech WHERE user_id='8803'").length === 0);

console.log('\n=== 12. 切天边界精准（北京时间 = UTC+8）===');
// 每个场景用独立群号，互不串数据。at(北京时间字符串) → 毫秒时间戳。
const at = (bj) => Date.parse(bj + '+08:00');
const speak = (gid, uid, ms, e = env) => W.recordSpeechStat(e, gid, { id: uid, first_name: 'U' + uid }, ms);
const total = async (gid, range, ms, e = env) => (await W.queryStatSummary(e, gid, range, ms)).totalMsg;

// 12a. 23:59:59 与次日 00:00:00 各归各天
const GA = '-100901';
await speak(GA, 'a1', at('2026-09-24T23:59:59'));
await speak(GA, 'a2', at('2026-09-25T00:00:00'));
check('23:59:59 的发言算当天（09-24 今日 = 1）', await total(GA, 'day', at('2026-09-24T23:59:59.500')) === 1);
check('00:00:00 的发言算次日（09-25 今日 = 1，不串前一天）', await total(GA, 'day', at('2026-09-25T12:00:00')) === 1);
check('statDayString：UTC 15:59:59 → 北京 09-24，UTC 16:00:00 → 北京 09-25',
	W.statDayString(env, Date.parse('2026-09-24T15:59:59Z')) === '2026-09-24' && W.statDayString(env, Date.parse('2026-09-24T16:00:00Z')) === '2026-09-25');

// 12b. 周日 23:59 与周一 00:00：周一起算新一周
const GB = '-100902';
await speak(GB, 'b1', at('2026-09-27T23:59:00'));   // 周日
await speak(GB, 'b2', at('2026-09-28T00:00:00'));   // 周一
check('周日当晚：本周含周日这条（= 1）', await total(GB, 'week', at('2026-09-27T23:59:30')) === 1);
check('周一：新一周从 0 起算，只含周一这条（= 1）', await total(GB, 'week', at('2026-09-28T12:00:00')) === 1);
const wkMon = W.statRangeDays(env, 'week', at('2026-09-28T00:00:00'));
check('周一 00:00 的本周起点就是当天 09-28', wkMon.start === '2026-09-28' && wkMon.end === '2026-09-28', JSON.stringify(wkMon));
const wkSun = W.statRangeDays(env, 'week', at('2026-09-27T23:59:59'));
check('周日的本周起点回退到周一 09-21', wkSun.start === '2026-09-21' && wkSun.end === '2026-09-27', JSON.stringify(wkSun));

// 12c. 周跨月：本周含上月那几天，本月不含
const GC = '-100903';
await speak(GC, 'c1', at('2026-09-29T12:00:00'));   // 周二，上月
await speak(GC, 'c2', at('2026-10-01T12:00:00'));   // 周四，本月 1 号
check('周跨月：本周含上月 09-29 那条（= 2）', await total(GC, 'week', at('2026-10-01T20:00:00')) === 2);
check('周跨月：本月只含 10-01 那条（= 1）', await total(GC, 'month', at('2026-10-01T20:00:00')) === 1);

// 12d. 月末 23:59:59 与下月 1 号 00:00:00
const GD = '-100904';
await speak(GD, 'd1', at('2026-09-30T23:59:59'));
await speak(GD, 'd2', at('2026-10-01T00:00:00'));
check('月末最后一秒：本月含 09-30 这条、不含 10-01（= 1）', await total(GD, 'month', at('2026-09-30T23:59:59.500')) === 1);
check('下月 1 号：新月份从 0 起算，只含 10-01（= 1）', await total(GD, 'month', at('2026-10-01T00:00:01')) === 1);
const moFirst = W.statRangeDays(env, 'month', at('2026-10-01T00:00:00'));
check('10-01 00:00 的本月范围 = 10-01 ~ 10-01', moFirst.start === '2026-10-01' && moFirst.end === '2026-10-01', JSON.stringify(moFirst));

// 12e. 跨年：12-31 23:59:59 与 01-01 00:00:00
const GE = '-100905';
await speak(GE, 'e1', at('2026-12-31T23:59:59'));
await speak(GE, 'e2', at('2027-01-01T00:00:00'));
const NY = at('2027-01-01T10:00:00');
check('跨年：01-01 今日只含新年那条（= 1）', await total(GE, 'day', NY) === 1);
check('跨年：01-01 本月只含新年那条（= 1）', await total(GE, 'month', NY) === 1);
check('跨年：本周（周一 2026-12-28 起）含 12-31 那条（= 2）', await total(GE, 'week', NY) === 2);
const wkNY = W.statRangeDays(env, 'week', NY);
check('跨年：2027-01-01（周五）本周起点 = 2026-12-28', wkNY.start === '2026-12-28' && wkNY.end === '2027-01-01', JSON.stringify(wkNY));

// 12f. 闰年 2 月 29 日
const GF = '-100906';
await speak(GF, 'f1', at('2028-02-29T12:00:00'));
check('闰日 2028-02-29 归属正确', W.statDayString(env, at('2028-02-29T12:00:00')) === '2028-02-29');
check('闰日：2 月本月统计含这条（= 1）', await total(GF, 'month', at('2028-02-29T20:00:00')) === 1);
check('闰日：3 月 1 号本月从 0 起算', await total(GF, 'month', at('2028-03-01T10:00:00')) === 0);
const moLeap = W.statRangeDays(env, 'month', at('2028-02-29T20:00:00'));
check('闰年 2 月本月范围 = 02-01 ~ 02-29', moLeap.start === '2028-02-01' && moLeap.end === '2028-02-29', JSON.stringify(moLeap));

// 12g. STATS_TZ_OFFSET=0：按 UTC 切天
const envUtc = { ...env, STATS_TZ_OFFSET: '0' };
const GG = '-100907';
const utcLate = Date.parse('2026-09-24T16:30:00Z');   // UTC 09-24 16:30 = 北京 09-25 00:30
await speak(GG, 'g1', utcLate, envUtc);
check('UTC 时区：16:30Z 归属 09-24（北京时区下是 09-25）',
	W.statDayString(envUtc, utcLate) === '2026-09-24' && W.statDayString(env, utcLate) === '2026-09-25');
check('UTC 时区：当天 23:00Z 查今日 = 1', await total(GG, 'day', Date.parse('2026-09-24T23:00:00Z'), envUtc) === 1);

// 12h. 跨 0 点那一刻渲染：标题日期与数据必须是同一天
// 第一次取时间停在 09-24 23:59:59.999，之后每次取都已是 09-25 00:00:00。
// 若 renderStatPage 内部标题、汇总、排行各取一次时间，就会出现「标题 09-24、数据按 09-25 算成 0」。
const GH = '-100908';
await speak(GH, 'h1', at('2026-09-24T23:59:59'));
await speak(GH, 'h2', at('2026-09-24T23:59:59'));
let clockCalls = 0;
W.__clock = () => (clockCalls++ === 0 ? at('2026-09-24T23:59:59.999') : at('2026-09-25T00:00:00'));
const rendered = await W.renderStatPage(env, GH, 'day', 1, '边界群');
W.__clock = null;
check('跨 0 点渲染：标题是 09-24', rendered.text.includes('2026-09-24'), rendered.text.split('\n')[0]);
check('跨 0 点渲染：汇总与标题同一天（总发言 2，不是 0）', rendered.text.includes('消息 <b>2</b>'));
check('跨 0 点渲染：发言排行与标题同一天（有排行、不是暂无记录）', rendered.text.includes('发言排行') && !rendered.text.includes('暂无发言记录'));

console.log('\n=== 13. 入群/退群/申请 事件明细（第2批）===');
{
	// ① 单元：写入明细 + 字段落库 + 北京时间格式化（首次写入时表才被懒建 —— 不动 D1_SCHEMA_VERSION）
	const ts = Math.floor(Date.parse('2026-10-02T10:30:00+08:00') / 1000);
	await W.recordMemberEventDetail(env, '-100111', '77701', 'join', ts * 1000, {
		actorId: '10001', inviteLink: 'https://t.me/+abc', viaRequest: true
	});
	check('stat_member_events 表在首次写入时自动创建（懒建，不占 schema 版本）',
		env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='stat_member_events'").length === 1);
	const rows = env.DB.query("SELECT * FROM stat_member_events WHERE user_id='77701'");
	check('入群明细写入 1 条', rows.length === 1, JSON.stringify(rows));
	check('at 存 unix 秒（与 formatBeijingTime 兼容）', rows[0]?.at === ts, '实际 ' + rows[0]?.at);
	check('actor_id / invite_link / via_request 落库',
		rows[0]?.actor_id === '10001' && rows[0]?.invite_link === 'https://t.me/+abc' && rows[0]?.via_request === 1,
		JSON.stringify(rows[0]));
	check('时间线格式化为北京时间 2026-10-02 10:30', W.formatBeijingTime(rows[0]?.at) === '2026-10-02 10:30',
		W.formatBeijingTime(rows[0]?.at));

	// ③ 同 (群,人,kind,秒) 重复插入去重
	await W.recordMemberEventDetail(env, '-100111', '77701', 'join', ts * 1000, { actorId: '10001' });
	check('重复事件只留 1 条',
		env.DB.query("SELECT COUNT(*) AS c FROM stat_member_events WHERE user_id='77701'")[0]?.c === 1);

	// ④ 非法 kind 拒绝（白名单 join / leave / kicked / join_request）
	await W.recordMemberEventDetail(env, '-100111', '77702', 'bogus', ts * 1000, {});
	check('非法 kind 不入库',
		env.DB.query("SELECT COUNT(*) AS c FROM stat_member_events WHERE user_id='77702'")[0]?.c === 0);

	// ⑤ 其余两种 kind
	await W.recordMemberEventDetail(env, '-100111', '77703', 'leave', ts * 1000, {});
	await W.recordMemberEventDetail(env, '-100111', '77704', 'join_request', ts * 1000, { viaRequest: true });
	check('leave 与 join_request 均入库',
		env.DB.query("SELECT COUNT(*) AS c FROM stat_member_events WHERE user_id IN ('77703','77704')")[0]?.c === 2);

	// ⑥ 端到端：申请事件 update → 落库（群未开审批时该 update 永不出现，零副作用）
	await W.__h.fetch(new Request('https://x/', { method: 'POST', body: JSON.stringify({
		bot_chat_join_request: {
			chat: { id: '-100111', type: 'supergroup', title: '搜索群' },
			user: { id: 77705, is_bot: false, first_name: '申请人' },
			date: ts, bio: '', invite_link: { invite_link: 'https://t.me/+xyz' }
		}
	}) }), env, { waitUntil() {} });
	const req = env.DB.query("SELECT * FROM stat_member_events WHERE user_id='77705'");
	check('端到端：申请事件落库且带 invite_link', req.length === 1 && req[0]?.kind === 'join_request'
		&& req[0]?.invite_link === 'https://t.me/+xyz', JSON.stringify(req));

	// ⑦ 端到端：chat_member 入群 → join 明细（时间取官方 ChatMemberUpdated.date）
	await W.__h.fetch(new Request('https://x/', { method: 'POST', body: JSON.stringify({
		chat_member: {
			chat: { id: '-100111', type: 'supergroup', title: '搜索群' },
			from: { id: 10001, is_bot: false, first_name: '管理员' },
			date: ts,
			old_chat_member: { status: 'left', user: { id: 77706, is_bot: false, first_name: '新成员' } },
			new_chat_member: { status: 'member', user: { id: 77706, is_bot: false, first_name: '新成员' } }
		}
	}) }), env, { waitUntil() {} });
	const evt = env.DB.query("SELECT * FROM stat_member_events WHERE user_id='77706'");
	check('端到端：入群事件写入 join 明细', evt.length === 1 && evt[0]?.kind === 'join', JSON.stringify(evt));
	check('端到端：时间取事件官方 date 而非当前时刻',
		evt.length === 1 && evt[0]?.at === ts, '实际 ' + (evt[0]?.at ?? '无'));
	check('端到端：统计计数同步 +1（明细未拖累 stat_member）',
		Number(env.DB.query("SELECT SUM(join_count) AS c FROM stat_member WHERE chat_id='-100111'")[0]?.c || 0) >= 1);
}
console.log('\n=== 14. 自定义时间（第2批）：任何区间的汇总 == 逐日求和 ===');
{
	const T = Date.parse('2026-10-07T15:00:00+08:00');
	const G = '-100960';
	// 连续 10 天，每天 1 条：09-28 ~ 10-07（跨月，覆盖周与月的边界）
	const days = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
		'2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'];
	for (const day of days) {
		await W.recordSpeechStat(env, G, { id: 'u1', first_name: '甲' }, Date.parse(day + 'T12:00:00+08:00'));
	}
	const tsOfDay = (d) => Date.parse(d + 'T12:00:00+08:00');
	const nextDay = (d) => {
		const t = new Date(d + 'T12:00:00+08:00');
		t.setUTCDate(t.getUTCDate() + 1);
		return t.toISOString().slice(0, 10);
	};

	// 核心：每一种区间，其汇总数必须等于「该区间内逐日的 sum」—— 四口径互等的定义。
	// 覆盖 day/week/month/相对词/单日/绝对区间。
	// 注意：空格写法 '2026-10-01 2026-10-05'【不在这里】—— statRangeDays 不认识它，
	// 会防御性回退成「今天」，逐日求和恰好也=1，凑成假阳性通过。真实路径必须先经 parseStatsRange
	// 归一成 '..' 形式，所以那条单独验（见下方「空格写法归一后查询」）。
	const ranges = ['day', 'week', 'month', 'yesterday', 'd2', 'lastweek', 'lastmonth', '7d', '30d',
		'2026-10-01', '2026-10-01..2026-10-05'];
	for (const r of ranges) {
		const info = W.statRangeDays(env, r, T);
		const q = await W.queryStatSummary(env, G, r, T);
		let manual = 0;
		for (let d = info.start; d <= info.end; d = nextDay(d)) {
			manual += (await W.queryStatSummary(env, G, 'day', tsOfDay(d))).totalMsg;
		}
		check('区间「' + r + '」汇总 == 逐日求和（' + info.start + '~' + info.end + '）',
			q.totalMsg === manual, '汇总=' + q.totalMsg + ' 逐日=' + manual);
	}

	// 关键词 → label 与区间的正确性
	const spec = [
		['昨天', '昨天', 1], ['前天', '前天', 1], ['上周', '上周', 7],
		['上月', '上月', 0], ['近7天', '近 7 天', 7], ['近30天', '近 30 天', 30],
		['2026-09-10', '2026-09-10', 1],
	];
	for (const [input, expectLabel, expectDays] of spec) {
		const info = W.statRangeDays(env, W.parseStatsRange(input), T);
		check('关键词「' + input + '」→ 「' + expectLabel + '」', info.label === expectLabel,
			JSON.stringify(info));
		if (expectDays > 0) {
			// 数区间内天数
			let n = 0;
			for (let d = info.start; d <= info.end; d = nextDay(d)) n++;
			check('  ↑ 天数 = ' + expectDays, n === expectDays, '实际 ' + n + ' 天');
		}
	}

	// 端点 inclusive：09-30 那天只该在以它为边界的区间里出现一次
	const one = await W.queryStatSummary(env, G, '2026-09-30', T);
	check('单日查询 = 1 条（端点含首含尾）', one.totalMsg === 1, '实际 ' + one.totalMsg);
	const five = await W.queryStatSummary(env, G, '2026-10-01..2026-10-05', T);
	check('五天区间 = 5 条（不重不漏）', five.totalMsg === 5, '实际 ' + five.totalMsg);
	// 空格写法：必须经 parseStatsRange 归一后再查询 —— 直接喂给 statRangeDays 会被防御性
	// 回退成「今天」，那不是用户实际走的路径（/stats A B 一定会先过 parseStatsRange）。
	const cross = await W.queryStatSummary(env, G, '2026-09-28..2026-10-07', T);
	check('十天区间（跨月）= 10 条', cross.totalMsg === 10, '实际 ' + cross.totalMsg);

	// 空格写法：必须经 parseStatsRange 归一后再查询 —— 直接喂给 statRangeDays 会被防御性
	// 回退成「今天」，那不是用户实际走的路径（/stats A B 一定会先过 parseStatsRange）。
	const spacedParsed = W.parseStatsRange('2026-10-01 2026-10-05');
	const spaced = await W.queryStatSummary(env, G, spacedParsed, T);
	check('空格写法归一后查询 = 5 条（不走 parse 的路径不计入断言）',
		spacedParsed === '2026-10-01..2026-10-05' && spaced.totalMsg === 5,
		'解析=' + spacedParsed + ' 结果=' + spaced.totalMsg);

	// 解析层
	check('空格分隔两日期 → 归一成 .. 形式',
		W.parseStatsRange('2026-10-01 2026-10-05') === '2026-10-01..2026-10-05',
		W.parseStatsRange('2026-10-01 2026-10-05'));
	check('单个日期原样透传', W.parseStatsRange('2026-10-01') === '2026-10-01', W.parseStatsRange('2026-10-01'));
	check('乱输入 → null（回退到用法提示）', W.parseStatsRange('随便写点什么') === null, String(W.parseStatsRange('随便写点什么')));
	// 「上周」「上月」不能被 /周/ /月/ 的正则抢先判成本周/本月
	const lw = W.statRangeDays(env, W.parseStatsRange('上周'), T);
	const thisWeek = W.statRangeDays(env, W.parseStatsRange('week'), T);
	check('「上周」不被误判成「本周」', lw.label === '上周' && lw.label !== thisWeek.label, lw.label + ' vs ' + thisWeek.label);
	const lm = W.statRangeDays(env, W.parseStatsRange('上月'), T);
	check('「上月」不被误判成「本月」', lm.label === '上月' && lm.label !== W.statRangeDays(env, W.parseStatsRange('month'), T).label, lm.label);
}

console.log('\n=== 15. 风控处置 / 新人治理 / 完整统计面板 ===');
{
	// —— 计数写入与查询 ——
	await W.recordStatAction(env, '-100111', 'disposal', T);
	await W.recordStatAction(env, '-100111', 'disposal', T);
	await W.recordStatAction(env, '-100111', 'newcomer', T);
	let a = await W.queryStatActions(env, '-100111', '2026-09-24', '2026-09-24');
	check('本群处置 2 次、新人治理 1 次', a.disposal === 2 && a.newcomer === 1, JSON.stringify(a));

	a = await W.queryStatActions(env, '-100222', '2026-09-24', '2026-09-24');
	check('另一配置群为 0（群隔离）', a.disposal === 0 && a.newcomer === 0, JSON.stringify(a));

	// 8 小时时区换算：blacklist.at 是 UTC ISO 字符串，直接按天切会把
	// UTC 20:00 算成 09-24，而北京已是次日 04:00。当场记由 statDayString 切天，必须落到 09-25。
	await W.recordStatAction(env, '-100111', 'disposal', Date.parse('2026-09-24T20:00:00Z'));
	a = await W.queryStatActions(env, '-100111', '2026-09-25', '2026-09-25');
	check('跨 UTC 日界 → 记到北京次日 09-25', a.disposal === 1, JSON.stringify(a));

	a = await W.queryStatActions(env, '-100111', '2026-09-24', '2026-09-25');
	check('两日区间合计 3 次处置', a.disposal === 3, JSON.stringify(a));

	await W.recordStatAction(env, '-100111', 'bogus', T);
	a = await W.queryStatActions(env, '-100111', '2026-09-24', '2026-09-24');
	check('非法 kind 不计（白名单拦截）', a.disposal === 2, JSON.stringify(a));

	// —— 按封禁结果记：成功才计、失败与无群不计 ——
	// recordDisposalsFromBanResults 不带时间参数（处置就发生在「现在」），
	// 不接管时钟就会写进真实今天、与本节的固定基准日 09-24 对不上。
	W.__clock = () => T;
	await W.recordDisposalsFromBanResults(env, [
		{ groupId: '-100111', ok: true },
		{ groupId: '-100222', ok: false },
		{ groupId: '-100111', ok: true },
		{ ok: true }                    // 无 groupId 的脏数据不计、不崩
	]);
	W.__clock = null;
	a = await W.queryStatActions(env, '-100111', '2026-09-24', '2026-09-24');
	check('封成功 2 次逐群 +1，失败与无群不计', a.disposal === 4, JSON.stringify(a));
	a = await W.queryStatActions(env, '-100222', '2026-09-24', '2026-09-24');
	check('封禁失败的群不计数', a.disposal === 0, JSON.stringify(a));

	// —— 面板输出（第2批·3A 重构后）——
	const rp = await W.renderStatPage(env, '-100111', 'day', 1, '统计测试群', T);
	const head = rp.text.split('\n')[1];
	check('报头含统计日期与区间标签', rp.text.includes('统计日期') && head.includes('今日'), head);
	check('报头含当前成员 4855', head.includes('当前成员: <b>4855</b>'), head);
	check('结论行含「挡下」与本群处置数 4', rp.text.includes('挡下 <b>4</b>'), rp.text.split('\n')[3]);
	check('三维度齐全（活跃 / 增长 / 风控）', ['活跃', '增长', '风控'].every((k) => rp.text.includes(k)));
	check('增长含新增 / 离开 / 净增', ['新增', '离开', '净增'].every((k) => rp.text.includes(k)));
	check('风控含处置 / 新人治理 / 被移出', ['处置 <b>', '新人治理', '被移出'].every((k) => rp.text.includes(k)));
	check('活跃含消息与活跃人数', ['消息 <b>', '活跃人数'].every((k) => rp.text.includes(k)));

	// 取不到成员数 → 显示「未知」，绝不编一个数字
	memberCountMock = null;
	const rpNull = await W.renderStatPage(env, '-100111', 'day', 1, '统计测试群', T);
	check('成员数取不到 → 显示「未知」不编数字', rpNull.text.includes('当前成员: <b>未知</b>'), rpNull.text.split('\n')[1]);
	memberCountMock = 4855;

	// —— 键盘：时间切换原地编辑 + 选中态 ——
	const kb = rp.keyboard;
	check('数据页带键盘（时间切换行）', !!kb && kb.inline_keyboard.length >= 1, JSON.stringify(kb));
	check('首行 = 今日 / 昨天 / 前天 / 本周',
		!!kb && kb.inline_keyboard[0].map((x) => x.text.replace('·', '')).join('/') === '今日/昨天/前天/本周',
		kb && kb.inline_keyboard[0].map((x) => x.text).join(','));
	check('range=day → 标选中态「·今日」', !!kb && kb.inline_keyboard[0][0].text === '·今日', kb && kb.inline_keyboard[0][0].text);
	check('切换时间走 statpg:1:（原地编辑，选中态才跟着变）',
		!!kb && kb.inline_keyboard[0][1].callback_data.startsWith('statpg:1:'),
		kb && kb.inline_keyboard[0][1].callback_data.slice(0, 12));
	check('单页 → 三行键盘（时间×2 + 趋势）、无翻页行', !!kb && kb.inline_keyboard.length === 3, kb && String(kb.inline_keyboard.length));
	check('第二行 = 本月 / 近7天 / 近30天',
		!!kb && kb.inline_keyboard[1].map((x) => x.text.replace('·', '')).join('/') === '本月/近7天/近30天',
		kb && kb.inline_keyboard[1] && kb.inline_keyboard[1].map((x) => x.text).join(','));
	check('第三行 = 7天趋势 / 30天趋势',
		!!kb && kb.inline_keyboard[2].map((x) => x.text.replace('·', '').replace('📈', '').trim()).join('/') === '7天趋势/30天趋势',
		kb && kb.inline_keyboard[2] && kb.inline_keyboard[2].map((x) => x.text).join(','));
	check('趋势按钮走 stattrend: 前缀（与时间切换区分）',
		!!kb && kb.inline_keyboard[2][0].callback_data.startsWith('stattrend:7:'),
		kb && kb.inline_keyboard[2][0].callback_data.slice(0, 13));

	const rpY = await W.renderStatPage(env, '-100111', 'yesterday', 1, '统计测试群', T);
	check('切到昨天 → 选中态移到「·昨天」', !!rpY.keyboard && rpY.keyboard.inline_keyboard[0][1].text === '·昨天',
		rpY.keyboard && rpY.keyboard.inline_keyboard[0].map((x) => x.text).join(','));

	// 自定义日期区间没有对应按钮 → 一个 · 都不该有（不能把「今日」标成选中）
	const rpC = await W.renderStatPage(env, '-100111', '2026-09-20..2026-09-24', 1, '统计测试群', T);
	check('自定义区间 → 无按钮被标选中', !!rpC.keyboard && rpC.keyboard.inline_keyboard[0].every((x) => !x.text.includes('·')),
		rpC.keyboard && rpC.keyboard.inline_keyboard[0].map((x) => x.text).join(','));

	// —— 剪枝：处置计数与 stat_speech / stat_member 同口径留 180 天 ——
	// cutoff = 2026-09-24 - 180 天 = 2026-03-28，写一条 1 月的应当被删、9 月的留着。
	await W.recordStatAction(env, '-100111', 'disposal', Date.parse('2026-01-01T04:00:00Z'));
	await W.pruneStatData(env, T);
	a = await W.queryStatActions(env, '-100111', '2026-01-01', '2026-01-01');
	check('剪枝删掉超期（>180 天）的处置计数', a.disposal === 0, JSON.stringify(a));
	a = await W.queryStatActions(env, '-100111', '2026-09-24', '2026-09-24');
	check('剪枝不影响保留期内的计数', a.disposal === 4, JSON.stringify(a));
	check('剪枝后表仍在（不是整表删掉）',
		env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='stat_actions'").length === 1);
}

console.log('\n=== 16. 趋势（逐日列表 + 汇总 + 环比，不出图）===');
{
	// 补跨天数据：09-20 一条发言一次入群、09-22 一次处置，09-24 沿用第 2 节的 4 条发言。
	await W.recordSpeechStat(env, '-100111', { id: '9', first_name: '趋势甲' }, Date.parse('2026-09-20T04:00:00Z'));
	await W.recordMemberEvent(env, '-100111', 'join', Date.parse('2026-09-20T04:00:00Z'));
	await W.recordStatAction(env, '-100111', 'disposal', Date.parse('2026-09-22T04:00:00Z'));

	const t = await W.queryStatTrend(env, '-100111', 7, T);
	check('7 天趋势返回 7 行', t.days.length === 7, String(t.days.length));
	check('起止 = 09-18 ~ 09-24（含今天）', t.start === '2026-09-18' && t.end === '2026-09-24', t.start + '..' + t.end);
	const td = Object.fromEntries(t.days.map((r) => [r.day, r]));
	check('09-24 发言 4 条（沿用第 2 节数据）', td['2026-09-24'].msg === 4, JSON.stringify(td['2026-09-24']));
	check('09-24 活跃 3 人', td['2026-09-24'].active === 3, JSON.stringify(td['2026-09-24']));
	check('09-20 发言 1 条', td['2026-09-20'].msg === 1, JSON.stringify(td['2026-09-20']));
	check('无数据的天补 0 而不是缺行（列表不断档）',
		td['2026-09-18'].msg === 0 && td['2026-09-19'].msg === 0 && td['2026-09-21'].msg === 0,
		JSON.stringify([td['2026-09-18'], td['2026-09-19'], td['2026-09-21']]));
	check('09-20 入群 1', td['2026-09-20'].join === 1, JSON.stringify(td['2026-09-20']));
	check('09-22 处置 1、09-24 处置 4',
		td['2026-09-22'].disposal === 1 && td['2026-09-24'].disposal === 4,
		td['2026-09-22'].disposal + '/' + td['2026-09-24'].disposal);

	const p = await W.queryStatTrendPrev(env, '-100111', 7, T);
	check('上期区间 = 09-11 ~ 09-17（紧邻本期之前，不重不漏）',
		p.start === '2026-09-11' && p.end === '2026-09-17', p.start + '..' + p.end);

	// —— 渲染 ——
	const tr = await W.renderStatTrend(env, '-100111', 7, 'day', '统计测试群', T);
	const head = tr.text.split('\n')[1];
	check('标题含天数与起止区间', tr.text.includes('近 <b>7</b> 天') && head.includes('2026-09-18 ~ 2026-09-24'), head);
	check('逐日列表覆盖首尾两天（MM-DD）',
		tr.text.includes('<code>09-18</code>') && tr.text.includes('<code>09-24</code>'), '');
	check('汇总节含总发言 / 日均 / 活跃峰值',
		tr.text.includes('汇总') && tr.text.includes('日均') && tr.text.includes('活跃峰值'), '');
	check('环比节含上一个 7 天与起止', tr.text.includes('环比') && tr.text.includes('上一个 7 天'), '');
	// 上期一条都没有 → 写「新增」，绝不编一个百分比
	check('上期为 0 → 显示「新增」不编百分比', tr.text.includes('发言 0 → 5　<b>新增</b>'),
		tr.text.split('\n').filter((x) => x.includes('发言 ')).join(' | '));

	// —— 键盘 ——
	const tk = tr.keyboard;
	check('趋势键盘两行（天数 + 返回）', !!tk && tk.inline_keyboard.length === 2, tk && String(tk.inline_keyboard.length));
	check('当前 7 天 → 标选中「·7天趋势」', !!tk && tk.inline_keyboard[0][0].text === '·📈 7天趋势',
		tk && tk.inline_keyboard[0][0].text);
	check('天数按钮走 stattrend: 前缀', !!tk && tk.inline_keyboard[0][1].callback_data.startsWith('stattrend:30:'),
		tk && tk.inline_keyboard[0][1].callback_data.slice(0, 13));
	check('返回键走 statpg:1: 回到原区间', !!tk && tk.inline_keyboard[1][0].callback_data.startsWith('statpg:1:'),
		tk && tk.inline_keyboard[1][0].callback_data.slice(0, 10));

	// —— 上下限 ——
	const big = await W.queryStatTrend(env, '-100111', 9999, T);
	check('天数上限 365（防手滑把 D1 扫穿）', big.days.length === 365, String(big.days.length));
	const tiny = await W.queryStatTrend(env, '-100111', -5, T);
	check('天数下限 1', tiny.days.length === 1, String(tiny.days.length));

	// —— 非配置群 / 无数据群不炸 ——
	const none = await W.renderStatTrend(env, '-100999', 7, 'day', '', T);
	check('没数据的群 → 全 0 正常渲染、不抛', none.text.includes('总发言 <b>0</b>'), none.text.split('\n').slice(-5).join(' | '));
}

console.log('\n群统计验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
