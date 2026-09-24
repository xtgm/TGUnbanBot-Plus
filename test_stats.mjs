// 群统计（发言 / 入群 / 退群）· 离线验证
// 覆盖：建表、北京时区切天、发言计数+活跃人数、进退群计数、日/周/月汇总、仅本群隔离、
//       发言排行+翻页、180 天剪枝、/stats 权限（群管理员/群主/主人/副主人可查，普通成员静默）、
//       /stats 输出内容、发言钩子端到端（真人计数、命令计数、bot 不计）。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const sent = [];
let currentAdmins = [];   // 当前群 Telegram 管理员 id 列表（供 getChatAdministrators mock）

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
sent.length = 0; currentAdmins = ['777'];
await W.handleStatsCommand({ chat: { id: '-100111', type: 'supergroup', title: '统计测试群' }, from: { id: 555, is_bot: false }, text: '/stats', message_id: 101 }, env, { waitUntil() {} });
check('普通成员群内 /stats 静默（不回群、不私聊）', sent.length === 0);
sent.length = 0;
await W.handleStatsCommand({ chat: { id: '-100111', type: 'supergroup', title: '统计测试群' }, from: { id: 777, is_bot: false }, text: '/stats', message_id: 102 }, env, { waitUntil() {} });
check('群管理员群内 /stats 发结果到本群', sent.some((x) => x.chatId === '-100111' && x.text.includes('总发言')));
sent.length = 0; currentAdmins = [];
await W.handleStatsCommand({ chat: { id: '-100111', type: 'supergroup', title: '统计测试群' }, from: { id: Number(OWNER), is_bot: false }, text: '/stats week', message_id: 103 }, env, { waitUntil() {} });
check('主人不受管理员身份限制、随时可查', sent.some((x) => x.chatId === '-100111' && x.text.includes('本周')));
sent.length = 0;
await W.handleStatsCommand({ chat: { id: '-100111', type: 'supergroup', title: '统计测试群' }, from: { id: Number(DEPUTY), is_bot: false }, text: '/stats month', message_id: 104 }, env, { waitUntil() {} });
check('副主人随时可查', sent.some((x) => x.chatId === '-100111' && x.text.includes('本月')));

console.log('\n=== 9. /stats 输出内容 ===');
sent.length = 0; currentAdmins = [];
await W.handleStatsCommand({ chat: { id: '-100111', type: 'supergroup', title: '统计测试群' }, from: { id: Number(OWNER), is_bot: false }, text: '/stats', message_id: 105 }, env, { waitUntil() {} });
const out = sent.find((x) => x.chatId === '-100111');
check('输出含总发言', !!out && out.text.includes('总发言'));
check('输出含活跃人数', !!out && out.text.includes('活跃人数'));
check('输出含入群/退群/被移出', !!out && out.text.includes('入群') && out.text.includes('退群') && out.text.includes('被移出'));
check('输出含发言排行', !!out && out.text.includes('发言排行'));
check('排行昵称可点击(tg://user)', !!out && out.text.includes('tg://user?id='));

console.log('\n=== 10. /stats 私聊仅主人副主人 ===');
sent.length = 0;
await W.handleStatsCommand({ chat: { id: 555, type: 'private' }, from: { id: 555, is_bot: false }, text: '/stats -100111', message_id: 106 }, env, { waitUntil() {} });
check('私聊非主人 → 权限不足', sent.some((x) => x.chatId === '555' && x.text.includes('权限不足')));
sent.length = 0;
await W.handleStatsCommand({ chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER), is_bot: false }, text: '/stats -100111 week', message_id: 107 }, env, { waitUntil() {} });
check('私聊主人查指定群 → 出结果', sent.some((x) => x.chatId === String(OWNER) && x.text.includes('本周')));

console.log('\n=== 11. 发言钩子端到端（webhook） ===');
const todayNow = W.statDayString(env, Date.now());
const drive = async (msg) => { const p = []; await W.__h.fetch(new Request('https://x/', { method: 'POST', body: JSON.stringify({ message: msg }) }), env, { waitUntil: (x) => p.push(Promise.resolve(x)) }); await Promise.allSettled(p); };
await drive({ message_id: 5001, chat: { id: '-100111', type: 'supergroup', title: 'g' }, from: { id: 8801, is_bot: false, first_name: '钩子用户' }, text: '普通聊天' });
check('真人普通消息已计入发言', Number(env.DB.query("SELECT msg_count FROM stat_speech WHERE user_id='8801' AND day='" + todayNow + "'")[0]?.msg_count) >= 1);
await drive({ message_id: 5002, chat: { id: '-100111', type: 'supergroup', title: 'g' }, from: { id: 8802, is_bot: false, first_name: '发命令' }, text: '/stats' });
check('命令消息也计入发言（真人所有消息）', Number(env.DB.query("SELECT msg_count FROM stat_speech WHERE user_id='8802' AND day='" + todayNow + "'")[0]?.msg_count) >= 1);
await drive({ message_id: 5003, chat: { id: '-100111', type: 'supergroup', title: 'g' }, from: { id: 8803, is_bot: true, first_name: '机器人' }, text: 'bot发言' });
check('bot 消息不计入发言', env.DB.query("SELECT * FROM stat_speech WHERE user_id='8803'").length === 0);

console.log('\n群统计验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
