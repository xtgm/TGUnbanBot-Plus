// 独立模式 · 批次 1（/groupmode、扇出跳过独立群、本群黑名单、超管范围按钮、私聊收回、第一主人封杀锁）
// 断言走完整命令链路（handler.fetch 发真实 update），只断言落库与 Telegram 调用。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const sent = [];
const deleted = [];
const unbanned = [];
const modded = [];
const answers = [];

const G1 = '-1001111111111'; // 全局群
const G2 = '-1002222222222'; // 将被切成独立群
const G3 = '-1003333333333'; // 杀手群
const OWNER = '10001';
const VICE = '10002';
const SUPER = '10003';
const ADMIN_R = '10004'; // 有「封禁用户」权限
const CREATOR = '10005';
const ADMIN_N = '10006'; // 无「封禁用户」权限
const ANON = '1087968824';

const sandbox = {
	console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
	URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		let result = true;
		if (m === 'sendMessage') {
			sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || ''), markup: JSON.stringify(b?.reply_markup || null) });
			result = { message_id: 9000 + sent.length };
		} else if (m === 'deleteMessage') deleted.push({ chatId: String(b?.chat_id ?? ''), mid: Number(b?.message_id) });
		else if (m === 'unbanChatMember') unbanned.push({ chatId: String(b?.chat_id ?? ''), userId: String(b?.user_id) });
		else if (m === 'banChatMember' || m === 'restrictChatMember') modded.push({ chatId: String(b?.chat_id ?? ''), userId: String(b?.user_id), m });
		else if (m === 'answerCallbackQuery') answers.push({ text: String(b?.text || ''), alert: b?.show_alert === true });
		else if (m === 'getMe') result = { id: 1, username: 'mock_test_bot' };
		else if (m === 'getChat') result = { id: Number(b?.chat_id), type: 'supergroup', title: '测试群' };
		else if (m === 'getChatMember') result = { status: 'member', user: { id: Number(b?.user_id) } };
		else if (m === 'getChatAdministrators') result = [
			{ user: { id: Number(CREATOR) }, status: 'creator' },
			{ user: { id: Number(ADMIN_R) }, status: 'administrator', can_restrict_members: true },
			{ user: { id: Number(ADMIN_N) }, status: 'administrator', can_restrict_members: false }
		];
		return { ok: true, status: 200, json: async () => ({ ok: true, result }), text: async () => JSON.stringify({ ok: true, result }) };
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
		if (up === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA') || /\bRETURNING\b/i.test(sql)) return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		const i = st.run(...bd);
		return { kind: 'write', meta: { changes: Number(i?.changes || 0), last_row_id: Number(i?.lastInsertRowid || 0), rows_written: Number(i?.changes || 0) } };
	};
	const mk = (sql) => {
		const s = { sql, params: [] };
		const a = {
			__d1: s,
			bind(...x) { s.params = x; return a; },
			async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
			async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: r.rows.length } } : { success: true, results: [], meta: r.meta }; },
			async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: r.rows.length } } : { success: true, results: [], meta: r.meta }; }
		};
		return a;
	};
	return {
		prepare: mk,
		async exec(sql) { for (const p of String(sql).split(';')) { const s = p.trim(); if (s) db.exec(s); } return { count: 1 }; },
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; },
		query(sql) { try { return db.prepare(sql).all().map(nOut); } catch (_) { return []; } }
	};
}

let pass = 0;
let fail = 0;
function check(label, cond, extra) {
	if (cond) { pass += 1; console.log('  ✅ ' + label); }
	else { fail += 1; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
}

const env = {
	TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: [G1, G2, G3].join(','),
	OWNER_IDS: OWNER + ',' + VICE, SUPER_ADMIN_IDS: SUPER, KILLER_MODE_GROUPS: G3, DB: makeD1()
};
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });
await W.adDetectionReady(env);
W.fetchAdUserProfile = async () => ({ firstName: '', lastName: '', username: '', bio: '', avatarId: '', badgeId: '' });

let mid = 7000;
async function post(update) {
	await W.__h.fetch(new Request('https://x.com/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: ++mid, ...update })
	}), env, { waitUntil() {} });
}
async function send(fromId, text, chatId = G1) {
	mid += 1;
	const isPrivate = chatId === 'private';
	const message = {
		message_id: mid, date: 1, text,
		chat: isPrivate ? { id: Number(fromId), type: 'private' } : { id: Number(chatId), type: 'supergroup', title: '测试群' },
		from: { id: Number(fromId), is_bot: false, first_name: 'U' + fromId }
	};
	await post({ message });
}
async function sendAnon(text, chatId) {
	mid += 1;
	await post({ message: {
		message_id: mid, date: 1, text,
		chat: { id: Number(chatId), type: 'supergroup', title: '测试群' },
		from: { id: Number(ANON), is_bot: true, first_name: 'Group', username: 'GroupAnonymousBot' },
		sender_chat: { id: Number(chatId), type: 'supergroup', title: '测试群' }
	} });
}
async function click(fromId, data, chatId, messageId = 9999) {
	await post({ callback_query: {
		id: 'cb' + (++mid), from: { id: Number(fromId), is_bot: false, first_name: 'U' + fromId }, data,
		message: { message_id: messageId, chat: { id: Number(chatId), type: 'supergroup', title: '测试群' } }
	} });
}

const inGlobal = (uid) => env.DB.query("SELECT id FROM blacklist WHERE id='" + uid + "'").length === 1;
const inLocal = (chat, uid) => env.DB.query("SELECT user_id FROM group_blacklist WHERE chat_id='" + chat + "' AND user_id='" + uid + "'").length === 1;
const modeOf = (chat) => (env.DB.query("SELECT mode FROM group_mode WHERE chat_id='" + chat + "'")[0]?.mode || 'global');
const allSent = () => sent.map((s) => s.text).join('\n');
const moddedChats = (uid) => modded.filter((x) => x.userId === uid).map((x) => x.chatId);
const unbannedChats = (uid) => unbanned.filter((x) => x.userId === uid).map((x) => x.chatId);
const reset = () => { sent.length = 0; deleted.length = 0; unbanned.length = 0; modded.length = 0; answers.length = 0; };
let seq = 880000;
const nextUid = () => String(++seq);
const buttonsOf = () => {
	const out = [];
	for (const s of sent) {
		for (const m of s.markup.matchAll(/"callback_data":"(gmsa:[^"]+)"/g)) out.push(m[1]);
	}
	return out;
};

console.log('\n=== /groupmode 权限 ===');
reset();
await send(ADMIN_R, '/groupmode independent', G2);
check('★ 普通管理员不能切模式', modeOf(G2) === 'global');
await send(VICE, '/groupmode ' + G2 + ' independent', 'private');
check('★ 副主人私聊也不能切', modeOf(G2) === 'global');
check('★ 副主人私聊收到权限不足', allSent().includes('权限不足'), allSent());
reset();
await send(OWNER, '/groupmode ' + G3 + ' independent', 'private');
check('★ 杀手群不能切独立', modeOf(G3) === 'global' && allSent().includes('杀手群不能切成独立'), allSent());
reset();
await send(CREATOR, '/groupmode 独立', G2);
check('★ 群主在群里切成独立', modeOf(G2) === 'independent');
check('★ 切换回执说明不自动解封', allSent().includes('不会自动解封'), allSent());
check('★ 群主切换后私聊告知第一主人', sent.some((s) => s.chatId === OWNER && s.text.includes('群模式变更')));
reset();
await send(OWNER, '/groupmode ' + G2, 'private');
check('★ 第一主人私聊带群 ID 只查看', allSent().includes('当前模式') && allSent().includes('独立'), allSent());

console.log('\n=== /groupmode 不带参数：群里短提示 + 私聊完整用法 ===');
// 【2026-10-25 主人定】/groupmode 进菜单；群里发 = 闪一条短提示（当前模式 + 切换写法 + 私聊链接），
// 点链接 = 私聊 /start groupmode_群ID → 独立群全部功能用法。用法谁都能看，当前模式只给第一主人与该群群主。
const flashes = [];
const origFlash = W.sendFlashMessage;
W.sendFlashMessage = async (chatId, text, ctx, ttlMs) => { flashes.push({ chatId: String(chatId), text: String(text), ttlMs }); return origFlash(chatId, text, ctx, ttlMs); };
reset();
await send(CREATOR, '/groupmode', G2);
const gmFlash = flashes.find((f) => f.chatId === G2);
check('★ 群主群里发 /groupmode → 闪屏提示带当前模式与切换写法', !!gmFlash && gmFlash.text.includes('当前模式') && gmFlash.text.includes('/groupmode 独立') && gmFlash.text.includes('/groupmode 全局'), gmFlash?.text);
check('★ 闪屏带私聊深链 start=groupmode_群ID', !!gmFlash && gmFlash.text.includes('https://t.me/mock_test_bot?start=groupmode_' + G2), gmFlash?.text);
check('★ 闪屏会自动撤回且留够点链接的时间（≥10 秒）', !!gmFlash && Number(gmFlash.ttlMs) >= 10000, String(gmFlash?.ttlMs));
check('★ 群里不发完整长文（/localset 写法不出现在群里）', !sent.some((s) => s.chatId === G2 && s.text.includes('/localset 检测')), allSent());
flashes.length = 0;
reset();
await send(ADMIN_R, '/groupmode', G1);
check('★ 普通管理员群里发 /groupmode 仍然静默', sent.length === 0 && flashes.length === 0, allSent());
W.sendFlashMessage = origFlash;
reset();
await send(CREATOR, '/start groupmode_' + G2, 'private');
const guideC = sent.filter((s) => s.chatId === CREATOR).map((s) => s.text).join('\n');
check('★ 群主点深链 → 私聊收到独立群全部用法（/localset 五种写法齐全）',
	['/localset</code>', '/localset 检测 开|关', '/localset 演练 开|关', '/localset 处置 踢出|禁言', '/localset 白名单 加|删'].every((k) => guideC.includes(k)), guideC);
check('★ 用法含切换、/localbans、本群 /ban /unban', ['/groupmode 独立', '/groupmode 全局', '/localbans', '/ban', '/unban'].every((k) => guideC.includes(k)), guideC);
check('★ 群主看到该群当前模式', guideC.includes('当前模式') && guideC.includes(G2), guideC);
// 【2026-10-25 主人：弄整齐一点 → 太长，刚刚那样就可以，只是说明有点乱】
// 口径：命令与说明同一行（「命令 说明」），说明写短；任何一行（去标签后）≤ 30 字不折行；整页 ≤ 30 行。
const guideLines = guideC.split('\n').map((l) => l.replace(/<[^>]+>/g, ''));
const longLines = guideLines.filter((l) => [...l].length > 30);
check('★ 用法页每行 ≤ 30 字（不折行）', longLines.length === 0, JSON.stringify(longLines));
check('★ 用法页整页 ≤ 30 行（不拉长）', guideLines.length <= 30, String(guideLines.length));
const codeLines = guideC.split('\n').filter((l) => /^<code>\//.test(l));
const badCode = codeLines.filter((l) => !/^<code>[^<]+<\/code> \S/.test(l));
check('★ 命令与说明写在同一行', codeLines.length === 14 && badCode.length === 0, codeLines.length + ' ' + JSON.stringify(badCode));
reset();
await send(ADMIN_N, '/start groupmode_' + G2, 'private');
const guideN = sent.filter((s) => s.chatId === ADMIN_N).map((s) => s.text).join('\n');
check('★ 非群主点深链 → 只给用法，不给该群当前模式', guideN.includes('/localset 检测 开|关') && !guideN.includes('当前模式'), guideN);
reset();
await send(ADMIN_N, '/groupmode', 'private');
const guideP = sent.filter((s) => s.chatId === ADMIN_N).map((s) => s.text).join('\n');
check('★ 私聊不带群 ID 发 /groupmode → 回完整用法而不是报错', guideP.includes('/localset 检测 开|关') && !guideP.includes('请带群 ID'), guideP);

console.log('\n=== 自动检测扇出 ===');
check('★ 全局群事发：跳过独立群', !W.autoDetectionScopeGroupIds(G1).includes(G2));
check('★ 独立群事发：只加事发群本身', W.autoDetectionScopeGroupIds(G2).includes(G2) && W.autoDetectionScopeGroupIds(G2).includes(G1));

console.log('\n=== 独立群 /ban：本群黑名单 + 只踢本群 ===');
{
	reset();
	const uid = nextUid();
	await send(ADMIN_R, '/ban ' + uid + ' 刷屏', G2);
	check('★ 有封禁权限的管理员：写本群黑名单', inLocal(G2, uid));
	check('★ 不写全局黑名单', !inGlobal(uid));
	check('★ 只踢本群（banChatMember 恒踢出）', JSON.stringify(moddedChats(uid)) === JSON.stringify([G2]) && modded.every((x) => x.m === 'banChatMember'), JSON.stringify(modded));
	check('★ 回执写「本群黑名单」', allSent().includes('本群黑名单'), allSent());
}
{
	reset();
	const uid = nextUid();
	await send(CREATOR, '/ban ' + uid, G2);
	check('★ 群主在独立群 /ban：写本群黑名单', inLocal(G2, uid) && !inGlobal(uid));
}
{
	reset();
	const uid = nextUid();
	await send(ADMIN_N, '/ban ' + uid, G2);
	check('★ 无封禁权限的管理员：不写任何名单', !inLocal(G2, uid) && !inGlobal(uid));
	check('★ 无封禁权限：提示缺少「封禁用户」权限', allSent().includes('封禁用户'), allSent());
	check('★ 无封禁权限：不调 Telegram 处置', modded.length === 0);
}
{
	reset();
	const uid = nextUid();
	await send(ADMIN_R, '/spam ' + uid, G2);
	check('★ 独立群 /spam 等同 /ban：写本群黑名单并踢出', inLocal(G2, uid) && !inGlobal(uid) && JSON.stringify(moddedChats(uid)) === JSON.stringify([G2]), JSON.stringify(modded));
}
{
	reset();
	const uid = nextUid();
	await send(VICE, '/ban ' + uid, G2);
	check('★ 副主人在独立群：只封本群', inLocal(G2, uid) && !inGlobal(uid) && JSON.stringify(moddedChats(uid)) === JSON.stringify([G2]));
	check('★ 副主人在独立群：附提醒', allSent().includes('独立群只封本群'), allSent());
}
{
	reset();
	const uid = nextUid();
	await sendAnon('/ban ' + uid, G2);
	check('★ 匿名管理员在独立群 /ban：走本群黑名单', inLocal(G2, uid) && !inGlobal(uid));
	reset();
	await sendAnon('/unban ' + uid, G2);
	check('★ 匿名管理员在独立群 /unban：不放行', inLocal(G2, uid) && unbanned.length === 0);
}

console.log('\n=== 全局群：扇出跳过独立群，第一主人除外 ===');
{
	reset();
	const uid = nextUid();
	await send(ADMIN_R, '/ban ' + uid, G1);
	check('★ 全局群管理员 /ban：写全局黑名单', inGlobal(uid));
	check('★ 全局群管理员 /ban：不碰独立群', moddedChats(uid).includes(G1) && !moddedChats(uid).includes(G2), JSON.stringify(moddedChats(uid)));
}
{
	reset();
	const uid = nextUid();
	await send(VICE, '/spam ' + uid, G1);
	check('★ 副主人全局群 /spam：全局黑名单、不碰独立群', inGlobal(uid) && !moddedChats(uid).includes(G2), JSON.stringify(moddedChats(uid)));
}
{
	reset();
	const uid = nextUid();
	await send(OWNER, '/ban ' + uid, G2);
	check('★ 第一主人在独立群 /ban：写全局黑名单', inGlobal(uid) && !inLocal(G2, uid));
	check('★ 第一主人：独立群也处置', moddedChats(uid).includes(G2) && moddedChats(uid).includes(G1), JSON.stringify(moddedChats(uid)));
}

console.log('\n=== 私聊收回 ===');
for (const cmd of ['/ban', '/sban', '/spam', '/unban']) {
	reset();
	const uid = nextUid();
	await send(ADMIN_R, cmd + ' ' + uid, 'private');
	check('★ 群管理员私聊 ' + cmd + '：回「请在你的群里发」', allSent().includes('请在你的群里发'), allSent());
	check('★ 群管理员私聊 ' + cmd + '：不写名单、不调 Telegram', !inGlobal(uid) && modded.length === 0 && unbanned.length === 0);
}
{
	reset();
	const uid = nextUid();
	await send(SUPER, '/ban ' + uid, 'private');
	check('★ 超管私聊 /ban：直接全域封禁，不弹按钮', inGlobal(uid) && buttonsOf().length === 0);
	check('★ 超管私聊 /ban：跳过独立群', !moddedChats(uid).includes(G2), JSON.stringify(moddedChats(uid)));
}

console.log('\n=== 超管在群里：范围按钮 ===');
{
	reset();
	const uid = nextUid();
	await send(SUPER, '/ban ' + uid, G1);
	const btns = buttonsOf();
	check('★ 全局群：弹两个按钮', btns.some((b) => b.startsWith('gmsa:L:')) && btns.some((b) => b.startsWith('gmsa:G:')), JSON.stringify(btns));
	check('★ 点按钮之前不写名单、不处置', !inGlobal(uid) && modded.length === 0);
	const g = btns.find((b) => b.startsWith('gmsa:G:'));
	await click(ADMIN_R, g, G1);
	check('★ 别人点：拒绝且不执行', !inGlobal(uid) && answers.some((a) => a.text.includes('只有发令人')), JSON.stringify(answers));
	await click(SUPER, g, G1);
	check('★ 发令人点②：写全局黑名单', inGlobal(uid));
	check('★ 点②：踢出且跳过独立群', moddedChats(uid).includes(G1) && !moddedChats(uid).includes(G2) && modded.filter((x) => x.userId === uid).every((x) => x.m === 'banChatMember'), JSON.stringify(modded));
	const before = modded.length;
	await click(SUPER, g, G1);
	check('★ 一次性：再点无效', modded.length === before && answers.some((a) => a.text.includes('已失效')), JSON.stringify(answers));
}
{
	reset();
	const uid = nextUid();
	await send(SUPER, '/ban ' + uid, G1);
	const l = buttonsOf().find((b) => b.startsWith('gmsa:L:'));
	await click(SUPER, l, G1);
	check('★ 点①：写本群黑名单（全局群）', inLocal(G1, uid) && !inGlobal(uid));
	check('★ 点①：只踢本群', JSON.stringify(moddedChats(uid)) === JSON.stringify([G1]), JSON.stringify(modded));
	reset();
	await send(uid, 'hi', G1);
	check('★ 全局群里本群黑名单的人发言：被拦截', deleted.length > 0 && moddedChats(uid).includes(G1), JSON.stringify({ deleted, modded }));
}
{
	reset();
	const uid = nextUid();
	await send(SUPER, '/spam ' + uid, G2);
	const btns = buttonsOf();
	check('★ 独立群：只给按钮①', btns.length === 1 && btns[0].startsWith('gmsa:L:'), JSON.stringify(btns));
	check('★ 独立群：提醒私聊全局封禁', allSent().includes('要全局封禁请私聊机器人'), allSent());
}

console.log('\n=== 独立群拦截 ===');
{
	const localUid = nextUid();
	await send(ADMIN_R, '/ban ' + localUid, G2);
	reset();
	await send(localUid, 'hi', G2);
	check('★ 本群黑名单的人在独立群发言：删消息并踢出', deleted.length > 0 && moddedChats(localUid).includes(G2), JSON.stringify({ deleted, modded }));
	const viceUid = nextUid();
	await send(VICE, '/ban ' + viceUid, G1);
	reset();
	await send(viceUid, 'hi', G2);
	check('★ 副主人全局封的人在独立群发言：不拦截', !modded.some((x) => x.userId === viceUid && x.chatId === G2) && !deleted.some((d) => d.chatId === G2), JSON.stringify({ deleted, modded }));
	const ownerUid = nextUid();
	await send(OWNER, '/ban ' + ownerUid, G1);
	reset();
	await send(ownerUid, 'hi', G2);
	check('★ 第一主人封的人在独立群发言：照样拦截', deleted.length > 0 && moddedChats(ownerUid).includes(G2), JSON.stringify({ deleted, modded }));
}

console.log('\n=== 解封 ===');
{
	const uid = nextUid();
	await send(ADMIN_R, '/ban ' + uid, G2);
	reset();
	await send(ADMIN_R, '/unban ' + uid, G2);
	check('★ 独立群 /unban：移出本群黑名单', !inLocal(G2, uid));
	check('★ 独立群 /unban：只解本群', JSON.stringify(unbannedChats(uid)) === JSON.stringify([G2]), JSON.stringify(unbanned));
}
{
	const uid = nextUid();
	await send(ADMIN_R, '/ban ' + uid, G1);
	reset();
	await send(ADMIN_R, '/unban ' + uid, G1);
	check('★ 全局 /unban：移出全局黑名单', !inGlobal(uid));
	check('★ 全局 /unban：不碰独立群', unbannedChats(uid).includes(G1) && !unbannedChats(uid).includes(G2), JSON.stringify(unbanned));
}
{
	const uid = nextUid();
	await send(OWNER, '/ban ' + uid, G1);
	reset();
	await send(VICE, '/unban ' + uid, G1);
	check('★ 第一主人封的：副主人解不开', inGlobal(uid) && unbanned.length === 0);
	check('★ 第一主人封的：提示「此人由第一主人封杀」', allSent().includes('此人由第一主人封杀'), allSent());
	reset();
	await send(ADMIN_R, '/unban ' + uid, G2);
	check('★ 第一主人封的：独立群管理员也解不开', inGlobal(uid) && unbanned.length === 0 && allSent().includes('此人由第一主人封杀'), allSent());
	reset();
	const other = nextUid();
	await send(ADMIN_R, '/ban ' + other, G1);
	reset();
	await send(ADMIN_R, '/unban ' + uid + ',' + other, G1);
	check('★ 批量解封：第一主人封的被拒、其余照解', inGlobal(uid) && !inGlobal(other) && allSent().includes('此人由第一主人封杀'), allSent());
	reset();
	await send(OWNER, '/unban ' + uid, G1);
	check('★ 第一主人自己能解', !inGlobal(uid) && unbannedChats(uid).includes(G1));
	check('★ 第一主人的全局 /unban 也不碰独立群', !unbannedChats(uid).includes(G2), JSON.stringify(unbanned));
}

console.log('\n=== /localbans ===');
{
	const uid = nextUid();
	await send(ADMIN_R, '/ban ' + uid, G2);
	reset();
	await send(ADMIN_R, '/localbans', G2);
	check('★ 有封禁权限的管理员能看本群黑名单', allSent().includes('本群黑名单') && allSent().includes(uid), allSent());
	reset();
	await send(ADMIN_N, '/localbans', G2);
	check('★ 无封禁权限：看不到名单', !allSent().includes(uid));
}

console.log('\n=== 切回全局 ===');
reset();
await send(OWNER, '/groupmode ' + G2 + ' global', 'private');
check('★ 第一主人私聊切回全局', modeOf(G2) === 'global');
{
	reset();
	const uid = nextUid();
	await send(ADMIN_R, '/ban ' + uid, G1);
	check('★ 切回后全局封禁重新覆盖该群', moddedChats(uid).includes(G2), JSON.stringify(moddedChats(uid)));
}

console.log(`\n合计：通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
