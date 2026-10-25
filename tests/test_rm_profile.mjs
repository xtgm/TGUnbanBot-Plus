// /rm 回复删除 + /profile 资料卡 · 离线端到端验证
// 覆盖：/rm 权限（第一主人 / 群主 / 其他人）、参数（不回复、私聊）、裸命令与 @bot、
//       删除成功与失败回执、命令撤回；/profile 权限、用法、输出（资料卡 + 时间线 +
//       时间线表未建时优雅降级）、回复消息查发信人、群内不撤回命令。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
const calls = [];
const sent = [];
const deleted = [];
let adminLists = {};      // 群ID → 成员数组（可按群返回不同权限）
let memberStatus = 'member';   // getChatMember 返回的状态，测试里切换以验证 6 种身份映射

const sandbox = {
	console: { log(){}, warn(){}, error(){} },
	URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) {}
		calls.push({ method: m, body: b });
		let payload = { ok: true, result: true };
		if (m === 'deleteMessage') {
			// failDeletes 由后半段测试切换，模拟 bot 无权限 / 消息超 48 小时等失败
			if (failDeletes) {
				payload = { ok: false, description: "Bad Request: message can't be deleted" };
			} else {
				deleted.push(String(b?.chat_id) + ':' + String(b?.message_id));
				payload = { ok: true, result: true };
			}
		} else if (m === 'sendMessage') {
			sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || ''), markup: b?.reply_markup || null });
			payload = { ok: true, result: { message_id: 9000 + sent.length } };
		} else if (m === 'getChatAdministrators') {
			const list = adminLists[String(b?.chat_id)] || [];
			payload = { ok: true, result: list };
		} else if (m === 'getChat') {
			payload = { ok: true, result: { id: Number(b?.chat_id) || 1, first_name: '测试用户', username: 'tester', bio: '这是简介', type: 'supergroup' } };
		} else if (m === 'getChatMember') {
			payload = { ok: true, result: { status: memberStatus, user: { id: Number(b?.user_id) } } };
		} else if (m === 'copyMessage') {
			payload = { ok: true, result: 1 };
		} else if (m === 'getMe') {
			// buildProfileBlock 里 getBotId() 要它，才能判定 bot 是否是该群管理员
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
		const st = db.prepare(sql); const bd = params.map(nIn);
		const up = sql.trim().slice(0, 6).toUpperCase();
		if (up === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		if (/\bRETURNING\b/i.test(sql)) return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		const i = st.run(...bd); return { kind: 'write', meta: { changes: Number(i?.changes || 0), last_row_id: Number(i?.lastInsertRowid || 0) } };
	};
	const mk = (sql) => { const s = { sql, params: [] }; const a = {
		bind(...x) { s.params = x; return a; },
		async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
		async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; },
		async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; }
	}; return a; };
	return {
		prepare: mk,
		async exec(sql) { for (const p of String(sql).split(';')) { const s = p.trim(); if (s) db.exec(s); } return { count: 1 }; },
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; },
		query(sql) { return db.prepare(sql).all().map(nOut); }
	};
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); } };
const reset = () => { calls.length = 0; sent.length = 0; deleted.length = 0; };
const callsOf = (m) => calls.filter((c) => c.method === m);

const OWNER = '10001', DEPUTY = '10002', SUPER = '10003', STRANGER = '77777';
const GROUP = '-100111';
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUP + ',-100222', OWNER_IDS: OWNER + ',' + DEPUTY, SUPER_ADMIN_IDS: SUPER, DB: makeD1() };
W.applyRuntimeConfig(W.loadRequiredConfig(env));
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });

const drive = (update) => W.__h.fetch(new Request('https://x/', { method: 'POST', body: JSON.stringify(update) }), env, { waitUntil() {} });
const rm = (from, text, extra = {}) => drive({ message: { chat: { id: Number(GROUP), type: 'supergroup' }, from: { id: Number(from), is_bot: false }, text, message_id: 100, ...extra } });

// ── 让 mock 能按需失败（测试删除失败回执）──
let failDeletes = false;

console.log('\n=== 1. /rm 权限 ===');
{
	// 群里：OWNER 是群主，4444 是群主，8888 是普通管理员
	const setAdmins = (list) => { adminLists[GROUP] = list; };
	setAdmins([
		{ user: { id: Number(OWNER) }, status: 'creator' },
		{ user: { id: 4444 }, status: 'creator' },
		{ user: { id: 8888 }, status: 'administrator' },
	]);

	reset();
	await rm(OWNER, '/rm', { reply_to_message: { message_id: 555, from: { id: 99999, is_bot: false, first_name: '被删用户' } } });
	check('第一主人 /rm → 删除目标', deleted.includes(GROUP + ':555'), deleted.join(' '));
	check('/rm 命令本身被撤回', deleted.includes(GROUP + ':100'), deleted.join(' '));
	// 主人要求「完整的结果最好返回给第一主人」：群内闪屏 + 私聊完整审计，两者必须都发。
	check('/rm 成功 → 完整审计私聊第一主人（含群、目标 ID、结果）', (() => {
		const a = sent.find((s) => s.chatId === String(OWNER) && s.text.includes('主人操作通知'));
		return Boolean(a) && a.text.includes('群内消息删除') && a.text.includes('555') && a.text.includes('已删除');
	})(), JSON.stringify(sent.map((s) => s.chatId + ' | ' + s.text.slice(0, 46).replace(/\n/g, ' '))));
	check('/rm 群内仍有闪屏回执', sent.some((s) => s.chatId === GROUP && s.text.includes('已删除目标消息')),
		JSON.stringify(sent.map((s) => s.chatId + ':' + s.text.slice(0, 30))));

	reset();
	await rm(4444, '/rm', { reply_to_message: { message_id: 556, from: { id: 99998, is_bot: false } } });
	// 主人 2026-10-02 把 /rm 收紧为【仅第一主人】—— 群主 / 普通管理员 / 副主人 / 超管一律不放行。
	// （早先版本允许「第一主人 或 该群群主」，那段鉴权已从代码里删除。）
	check('群主（非第一主人）/rm → 也删不了（已收紧为仅第一主人）', !deleted.some((x) => x.endsWith(':556')), deleted.join(' '));
	check('群主 /rm → 提示仅限第一主人', sent.some((s) => s.text.includes('仅限第一主人')), JSON.stringify(sent));

	reset();
	await rm(8888, '/rm', { reply_to_message: { message_id: 557, from: { id: 99997, is_bot: false } } });
	check('普通管理员 /rm → 不删', !deleted.some((x) => x.endsWith(':557')), deleted.join(' '));
	check('普通管理员 /rm → 提示仅限第一主人', sent.some((s) => s.text.includes('仅限第一主人')), JSON.stringify(sent));

	reset();
	await rm(STRANGER, '/rm', { reply_to_message: { message_id: 558, from: { id: 99996, is_bot: false } } });
	check('陌生人 /rm → 不删', !deleted.some((x) => x.endsWith(':558')), deleted.join(' '));
	check('陌生人 /rm → 提示仅限第一主人', sent.some((s) => s.text.includes('仅限第一主人')));

	// 副主人 / 超管：同为非第一主人，一律不许
	reset();
	await rm(DEPUTY, '/rm', { reply_to_message: { message_id: 559, from: { id: 99995, is_bot: false } } });
	check('副主人 /rm → 不删（仅第一主人）', !deleted.some((x) => x.endsWith(':559')), deleted.join(' '));
	reset();
	await rm(SUPER, '/rm', { reply_to_message: { message_id: 560, from: { id: 99994, is_bot: false } } });
	check('超级管理员 /rm → 不删（仅第一主人）', !deleted.some((x) => x.endsWith(':560')), deleted.join(' '));
}

console.log('\n=== 2. /rm 参数与场景 ===');
{
	const setAdmins = (list) => { adminLists[GROUP] = list; };
	setAdmins([{ user: { id: Number(OWNER) }, status: 'creator' }]);

	reset();
	await rm(OWNER, '/rm');
	check('未回复 → 提示先回复', sent.some((s) => s.text.includes('回复')), JSON.stringify(sent.map((s) => s.text)));
	// 未回复时只撤回命令本身，不得删除群里任何其他消息
	check('未回复 → 未删其他消息（仅撤回命令）',
		deleted.filter((x) => !x.endsWith(':100')).length === 0, '多余删除 ' + deleted.filter((x) => !x.endsWith(':100')).join(' '));

	reset();
	await drive({ message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER), is_bot: false }, text: '/rm', message_id: 101 } });
	check('私聊 /rm → 提示请在群里使用', sent.some((s) => s.text.includes('在群里使用')), JSON.stringify(sent.map((s) => s.text)));

	reset();
	await rm(OWNER, '/rm@TestBot', { reply_to_message: { message_id: 601, from: { id: 99994, is_bot: false } } });
	check('/rm@TestBot（带 bot 名）同样生效', deleted.includes(GROUP + ':601'), deleted.join(' '));

	// 删除失败 → 中文回执
	reset();
	failDeletes = true;
	await rm(OWNER, '/rm', { reply_to_message: { message_id: 701, from: { id: 99993, is_bot: false } } });
	const failMsg = sent.find((s) => s.text.includes('删除失败'))?.text || '';
	check('删除失败 → 中文提示（不含英文原文）', Boolean(failMsg) && !/[A-Za-z]{4,}/.test(failMsg.replace(/\/rm|TestBot/g, '')), failMsg);
	failDeletes = false;

	// 非配置群：不响应
	reset();
	await drive({ message: { chat: { id: -100999, type: 'supergroup' }, from: { id: Number(OWNER), is_bot: false }, text: '/rm', message_id: 102, reply_to_message: { message_id: 801 } } });
	check('非配置群 /rm → 完全不响应', deleted.length === 0 && sent.length === 0, '删 ' + deleted.join(' '));
}

console.log('\n=== 3. /profile 用法与权限 ===');
{
	reset();
	await drive({ message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER), is_bot: false }, text: '/profile', message_id: 201 } });
	check('裸 /profile → 出用法', sent.some((s) => s.text.includes('用法') && s.text.includes('/profile')), JSON.stringify(sent.map((s) => s.text.slice(0, 60))));

	reset();
	await drive({ message: { chat: { id: Number(STRANGER), type: 'private' }, from: { id: Number(STRANGER), is_bot: false }, text: '/profile 12345', message_id: 202 } });
	check('非授权者私聊 /profile → 不出资料卡', !sent.some((s) => s.text.includes('资料卡')), JSON.stringify(sent.map((s) => s.text.slice(0, 50))));

	// /profile 已收紧为【仅第一主人】（原先同 /check，群内管理员也可查）——
	// 副主人、超级管理员、群管理员一律不出资料卡。
	for (const [who, id, tag] of [['副主人', DEPUTY, 310], ['超级管理员', SUPER, 311]]) {
		reset();
		await drive({ message: { chat: { id: Number(id), type: 'private' }, from: { id: Number(id), is_bot: false }, text: '/profile 12345', message_id: tag } });
		check(who + ' 私聊 /profile → 不出资料卡（仅第一主人）',
			!sent.some((s) => s.text.includes('资料卡')), JSON.stringify(sent.map((s) => s.text.slice(0, 40))));
	}
	// 群管理员在群里发：连闪屏回执都不出（函数开头就 return，不撤命令、不发消息）
	reset();
	await drive({ message: { chat: { id: Number(GROUP), type: 'supergroup' }, from: { id: 8888, is_bot: false }, text: '/profile 12345', message_id: 312 } });
	check('群管理员群内 /profile → 不出资料卡、无任何回执',
		sent.length === 0 && deleted.length === 0, JSON.stringify(sent.map((s) => s.text.slice(0, 40))));
}

console.log('\n=== 4. /profile 输出 ===');
{
	reset();
	await drive({ message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER), is_bot: false }, text: '/profile 699658898', message_id: 203 } });
	const out = sent.find((s) => s.chatId === String(OWNER))?.text || '';
	check('输出含资料卡标题与 TGID', out.includes('资料卡') && out.includes('699658898'), out.slice(0, 120));
	check('含基本资料三项（昵称 / 用户名 / 简介）', out.includes('昵称') && out.includes('用户名') && out.includes('简介'));
	check('含时间线整节', out.includes('时间线'));
	const keys = ['申请时间', '入群时间', '退群时间', '任命管理员', '最早发言', '最后发言', '总入群'];
	const missing = keys.filter((k) => !out.includes(k));
	check('时间线 7 项齐全', missing.length === 0, '缺 ' + missing.join(','));
	check('stat_member_events 未建表 → 全部显示未记录，不报错', out.includes('未记录'), out.slice(out.indexOf('时间线'), out.indexOf('时间线') + 200));
	check('本地黑名单与 GKY 两节在（复用 /check 渲染）', out.includes('本地黑名单') && out.includes('GKY'), '');
	// 私聊没有群上下文 → 不显示群内身份。原先取 GROUP_IDS[0] 去查，是拿一个与本人无关的
	// 群当结论，属于误导（主人口径：私聊原样返回）。
	check('私聊 /profile → 不显示「群内身份」（无群上下文，不猜群）', !out.includes('群内身份'),
		out.slice(out.indexOf('基本资料'), out.indexOf('时间线')));

	// 建表 + 真数据：本群 1 次入群、另一个配置群 1 次入群（同一个 TGID）
	const ts = Math.floor(Date.parse('2026-10-03T08:00:00+08:00') / 1000);
	// 列必须与 _worker.js 的建表语句完全一致：只建 4 列的话，7 列的 INSERT 会失败
	//（被 recordMemberEventDetail 内部的 try/catch 吞掉，表现为「写入 0 行」却毫无报错）。
	env.DB.exec('CREATE TABLE IF NOT EXISTS stat_member_events ('
		+ 'chat_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, '
		+ 'actor_id TEXT, invite_link TEXT, via_request INTEGER NOT NULL DEFAULT 0, '
		+ 'PRIMARY KEY (chat_id, user_id, kind, at))');
	const ins = (cid, at) => env.DB.prepare('INSERT INTO stat_member_events (chat_id, user_id, kind, at) VALUES (?, ?, ?, ?)')
		.bind(cid, '699658898', 'join', at).run();
	await ins(GROUP, ts);
	await ins('-100999', ts + 600);   // 另一个配置群也入过一次群

	// 第3批纠错（2026-10-02）：官方文档确认 channelParticipantAdmin.date 的原文是
	// "When did the user join" —— 是【入群时间】，MTProto 根本不提供任命时间
	//（promoted_by 只有「谁提的」、没有「何时提的」）。'promote' 这个 kind 已从白名单移除、
	// D1 里 171 条也 UPDATE 成了 join。这里反向断言：写 promote 必须被静默拒掉，
	// 不许有一个语义错误的 kind 混进 join 口径。
	await W.recordMemberEventDetail(env, GROUP, '699658898', 'promote', Date.parse('2026-05-24T07:35:00+08:00'));
	check('promote 被白名单拒收（协议无任命时间，不许混进 join 口径）',
		Number(env.DB.query("SELECT COUNT(*) AS c FROM stat_member_events WHERE kind='promote'")[0]?.c) === 0,
		String(env.DB.query("SELECT COUNT(*) AS c FROM stat_member_events WHERE kind='promote'")[0]?.c));

	// 私聊 → 无群上下文，跨群原样返回
	reset();
	await drive({ message: { chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER), is_bot: false }, text: '/profile 699658898', message_id: 204 } });
	const out2 = sent.find((s) => s.chatId === String(OWNER))?.text || '';
	// 私聊跨群：显示【最近一次】入群（别群 08:10 晚于本群 08:00）—— 既验证北京时间格式化，
	// 又验证「跨群取最新」这个语义（比断言 08:00 更强，它同时锁定了排序与格式）。
	check('入群时间为北京时间、且跨群取最近一条（2026-10-03 08:10）',
		out2.includes('入群时间　2026-10-03 08:10'),
		out2.slice(out2.indexOf('入群时间'), out2.indexOf('入群时间') + 40));
	check('私聊无群上下文 → 跨群原样，总入群 2 次', out2.includes('2 次'), out2.slice(out2.indexOf('总入群'), out2.indexOf('总入群') + 24));

	// 群内 → 时间线围绕本群，只算本群那 1 次
	reset();
	adminLists[GROUP] = [
		{ user: { id: 42, is_bot: true, username: 'testbot' }, status: 'administrator' },
		{ user: { id: Number(OWNER) }, status: 'creator' },
	];
	await drive({ message: { chat: { id: Number(GROUP), type: 'supergroup' }, from: { id: Number(OWNER), is_bot: false }, text: '/profile 699658898', message_id: 205 } });
	const outG = sent.find((s) => s.chatId === GROUP && s.text.includes('资料卡'))?.text || '';
	check('群内 /profile → 不撤回命令本身', !deleted.includes(GROUP + ':205'), '删除列表 ' + deleted.join(' '));
	check('群内 /profile → 结果发在群里', Boolean(outG) && outG.includes('资料卡'));
	check('群内 → 时间线围绕本群（本群 1 次，别群那次不算）',
		outG.includes('1 次') && !outG.includes('2 次'),
		outG.slice(outG.indexOf('总入群'), outG.indexOf('总入群') + 24));
	// bot 是该群管理员 → 拿到确定状态（bot mock id=42 被放进管理员列表）
	check('群内 → 显示群内身份且拿到确定状态', outG.includes('群内身份　成员'),
		outG.slice(outG.indexOf('群内身份'), outG.indexOf('群内身份') + 60));
	// 任命管理员：MTProto 协议不提供任命时间，必须明说而不是拿入群时间顶替
	check('任命管理员 → 明说协议不提供，不拿入群时间冒充',
		outG.includes('任命管理员　未记录（MTProto 协议不提供任命时间）'),
		outG.slice(outG.indexOf('任命管理员'), outG.indexOf('任命管理员') + 50));
	check('任命管理员不再显示「第3批回填后可见」占位',
		!outG.includes('第3批回填后可见'), '');
	check('入群时间有值、任命行不冒充它（两条语义分得开）',
		outG.includes('入群时间　2026-10-03 08:00')
			&& outG.includes('任命管理员　未记录（MTProto 协议不提供任命时间）'),
		outG.slice(outG.indexOf('入群时间'), outG.indexOf('任命管理员') + 40));

	// ── 甲方案：群内【本群没有 join 记录】时补一行跨群汇总（2026-10-13 主人要的「支持跨群」）──
	// 场景来自线上：用户在天诚群显示「入群时间 未记录」，而他其实有 3 次入群记录，
	// 只是都发生在该群记录起点（2026-10-05）之前 —— 本群查不到，跨群其实查得到。
	// 口径仍守「群内围绕本群」：只在本群无记录时才补跨群，本群有记录时一行都不多加
	// （否则上面那条 `!outG.includes('2 次')` 必红）。
	{
		reset();
		// 必须用【配置群】：非配置群的斜杠命令会被 handleMessage 的 isNonConfiguredGroup
		// 分支整个拦掉，命令压根不执行，断言只能看到空输出（首跑就栽这儿，
		// 我用了 -1009999999999 这种不在 GROUP_ID 里的群）。
		// 造「本群无记录、跨群有记录」：删掉本群那条，再往别群加一条。
		env.DB.exec("DELETE FROM stat_member_events WHERE chat_id='" + GROUP + "' AND user_id='699658898'");
		await W.recordMemberEventDetail(env, '-100222', '699658898', 'join', Date.parse('2026-10-04T09:00:00+08:00'));
		await drive({ message: { chat: { id: Number(GROUP), type: 'supergroup' }, from: { id: Number(OWNER), is_bot: false }, text: '/profile 699658898', message_id: 206 } });
		const outN = sent.find((s) => s.chatId === GROUP && s.text.includes('资料卡'))?.text || '';
		check('[甲] 群内本群无记录 → 显示跨群汇总（不再只有一个孤零零的「未记录」）',
			outN.includes('跨群'), outN.slice(outN.indexOf('入群时间'), outN.indexOf('入群时间') + 70));
		check('[甲] 跨群次数为 2（本群那条已删、别群两条）',
			outN.includes('2 次'), outN.slice(outN.indexOf('总入群'), outN.indexOf('总入群') + 30));
		check('[甲] 跨群里带最近一次入群时间（2026-10-04 09:00）',
			/跨群.*2026-10-04 09:00/.test(outN.replace(/\n/g, ' ')), outN.slice(outN.indexOf('时间线'), outN.indexOf('时间线') + 200));
	}

	// 6 种身份逐一验证映射精准（bot 必须在管理员列表里，否则不会去查状态）
	adminLists[GROUP] = [
		{ user: { id: 42, is_bot: true, username: 'testbot' }, status: 'administrator' },
		{ user: { id: Number(OWNER) }, status: 'creator' },
	];
	const statusExpect = { creator: '群主', administrator: '管理员', member: '成员', restricted: '受限成员', left: '已离群', kicked: '已踢出' };
	for (const [code, cn] of Object.entries(statusExpect)) {
		memberStatus = code;
		reset();
		await drive({ message: { chat: { id: Number(GROUP), type: 'supergroup' }, from: { id: Number(OWNER), is_bot: false }, text: '/profile 699658898', message_id: 207 } });
		const txt = sent.find((s) => s.chatId === GROUP && s.text.includes('资料卡'))?.text || '';
		check('status=' + code + ' → 精准显示「' + cn + '」', txt.includes('群内身份　' + cn),
			txt.slice(txt.indexOf('群内身份'), txt.indexOf('群内身份') + 56));
	}
	memberStatus = 'member';

	// 反例：bot 在【另一个配置群】不是管理员 → 必须「查不到」，绝不能「不在」。
	// 用独立群号：AD_ADMIN_CACHE 按群缓存 5 分钟，改同一个群的列表不会立刻生效。
	adminLists['-100222'] = [{ user: { id: Number(OWNER) }, status: 'creator' }];
	reset();
	await drive({ message: { chat: { id: -100222, type: 'supergroup' }, from: { id: Number(OWNER), is_bot: false }, text: '/profile 699658898', message_id: 206 } });
	const outG2 = sent.find((s) => s.chatId === '-100222' && s.text.includes('资料卡'))?.text || '';
	check('bot 非管理员 → 标注「未能查询」而非「不在」（查不到 ≠ 真的不在）',
		outG2.includes('未能查询') && !outG2.includes('不在该群'),
		outG2.slice(outG2.indexOf('群内身份'), outG2.indexOf('群内身份') + 70));
}

// 线上实测：回复着一条消息发 /rm，Telegram 推来的更新里没有 reply_to_message，
// 被回复的消息落在 external_reply（ExternalReplyInfo：chat + message_id）。
console.log('\n=== /rm 认 external_reply ===');
{
	failDeletes = false;
	reset();
	await rm(OWNER, '/rm', { message_id: 101, external_reply: { origin: { type: 'user', date: 1, sender_user: { id: 42, is_bot: true, first_name: '机器人' } }, chat: { id: Number(GROUP), type: 'supergroup', title: '本群' }, message_id: 777 }, quote: { text: '新增独立群模式', position: 0 } });
	check('★ 只有 external_reply 且指向本群 → 删除目标', deleted.includes(GROUP + ':777'), deleted.join(' '));
	check('★ 不再回「请回复要删除的那条消息」', !sent.some((s) => s.text.includes('请<b>回复</b>')), JSON.stringify(sent.map((s) => s.text.slice(0, 40))));
	check('★ 审计里带上引用片段作为目标内容', sent.some((s) => s.chatId === String(OWNER) && s.text.includes('777') && s.text.includes('新增独立群模式')), JSON.stringify(sent.map((s) => s.text.slice(0, 200))));

	reset();
	await rm(OWNER, '/rm', { message_id: 102, external_reply: { origin: { type: 'chat', date: 1, sender_chat: { id: -100999 } }, chat: { id: -100999, type: 'supergroup' }, message_id: 778 } });
	check('★ external_reply 指向别的群 → 不删', !deleted.some((x) => x.endsWith(':778')), deleted.join(' '));

	reset();
	await rm(OWNER, '/rm', { message_id: 103 });
	const tip = sent.find((s) => s.text.includes('请<b>回复</b>'));
	check('★ 两个字段都没有 → 提示里列出收到的字段', Boolean(tip) && tip.text.includes('收到的字段') && tip.text.includes('message_id'), tip && tip.text);
	const dm = sent.find((s) => s.chatId === String(OWNER) && s.text.includes('没认出回复的是哪条消息'));
	check('★ 没认出目标 → 私聊第一主人（含群号与收到的字段）', Boolean(dm) && dm.text.includes(GROUP) && dm.text.includes('收到的字段') && dm.text.includes('message_id'),
		JSON.stringify(sent.map((s) => s.chatId + ' | ' + s.text.slice(0, 80))));
	check('★ 没认出目标 → 不调删除（只撤回命令本身）', deleted.length === 1 && deleted[0] === GROUP + ':103', deleted.join(' '));
}

console.log('\n/rm + profile 验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
