// 杀手模式（KILLER_MODE_GROUPS + /killer 每群切换）· 离线验证
// 覆盖：环境变量解析、默认禁言、banUserFromAllGroups 逐群（禁言群禁言/普通群封禁）、
//       /killer 切换与权限（仅第一主人）、非杀手群提示、/unban 在禁言群解禁、拦截跳过。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const calls = [];          // { method, body }
const sent = [];           // sendMessage 专用
let currentAdmins = [];

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		calls.push({ method: m, body: b });
		let payload = { ok: true, result: true };
		if (m === 'sendMessage') { sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || '') }); payload = { ok: true, result: { message_id: 9000 + sent.length } }; }
		else if (m === 'getChatAdministrators') payload = { ok: true, result: currentAdmins.map((id) => ({ user: { id: Number(id) }, status: 'administrator' })) };
		else if (m === 'getChat') payload = { ok: true, result: { id: b?.chat_id, title: '群', type: 'supergroup' } };
		else if (m === 'getChatMember') payload = { ok: true, result: { status: 'member', user: { id: b?.user_id } } };
		else if (m === 'getMe') payload = { ok: true, result: { id: 42, username: 'testbot', is_bot: true } };
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
		const i = st.run(...bd); return { kind: 'write', meta: { changes: Number(i?.changes || 0), last_row_id: Number(i?.lastInsertRowid || 0) } };
	};
	const mk = (sql) => { const s = { sql, params: [] }; const a = {
		bind(...x) { s.params = x; return a; },
		async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
		async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; },
		async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; }
	}; return a; };
	return { prepare: mk, async exec(sql) { for (const p of String(sql).split(';')) { const s = p.trim(); if (s) db.exec(s); } return { count: 1 }; },
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; }, query(sql) { return db.prepare(sql).all().map(nOut); } };
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); } };
const callsOf = (m) => calls.filter((c) => c.method === m);
const reset = () => { calls.length = 0; sent.length = 0; };
const mutedCalls = () => callsOf('restrictChatMember').filter((c) => c.body?.permissions?.can_send_messages === false);
const unmuteCalls = () => callsOf('restrictChatMember').filter((c) => c.body?.permissions?.can_send_messages === true);

const OWNER = '10001', DEPUTY = '10002';
// -100111 = 杀手模式群（只在 KILLER_MODE_GROUPS、不在 GROUP_ID，靠并入生效）；-100222 = 普通群（GROUP_ID）
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: '-100222', OWNER_IDS: OWNER + ',' + DEPUTY, KILLER_MODE_GROUPS: '-100111', DB: makeD1() };
W.applyRuntimeConfig(W.loadRequiredConfig(env));
await W.refreshMuteModeGroups(env);

// __KILLER_TESTS__

console.log('\n=== 1. 环境变量与默认状态 ===');
check('KILLER_MODE_GROUPS 只认 -100111', W.isKillerModeGroup('-100111') && !W.isKillerModeGroup('-100222'));
check('杀手群并入有效 GROUP_IDS（不在 GROUP_ID 环境变量也算配置群）', W.isConfiguredGroup('-100111'));
check('默认 OFF = 禁言模式（-100111）', W.isGroupMuteMode('-100111'));
check('普通群不进禁言模式（-100222）', !W.isGroupMuteMode('-100222'));

console.log('\n=== 2. banUserFromAllGroups 逐群：禁言群禁言 / 普通群封禁 ===');
reset();
const r1 = await W.banUserFromAllGroups('55501', { probeMembership: false });
check('禁言群 -100111 走 restrictChatMember 禁言', mutedCalls().some((c) => String(c.body.chat_id) === '-100111' && Number(c.body.user_id) === 55501));
check('禁言群未调 banChatMember', !callsOf('banChatMember').some((c) => String(c.body.chat_id) === '-100111'));
check('普通群 -100222 走 banChatMember 封禁', callsOf('banChatMember').some((c) => String(c.body.chat_id) === '-100222' && Number(c.body.user_id) === 55501));
check('结果标记 muted 正确', r1.find((x) => x.groupId === '-100111')?.muted === true && r1.find((x) => x.groupId === '-100222')?.muted === false);
check('回执：禁言群逐群文案为"已永久禁言"', W.formatBanSuccessResult(r1.find((x) => x.groupId === '-100111')).includes('永久禁言'));
check('回执：普通群逐群文案仍是封禁语义', !W.formatBanSuccessResult(r1.find((x) => x.groupId === '-100222')).includes('禁言'));

console.log('\n=== 3. /killer 切换（仅第一主人）===');
reset();
// 非第一主人：静默，不改状态、不回话
await W.handleKillerCommand({ chat: { id: '-100111', type: 'supergroup' }, from: { id: 777 }, text: '/killer' }, env);
check('非第一主人 /killer 静默（无回执）', sent.length === 0);
check('非第一主人 /killer 不改状态（仍禁言）', W.isGroupMuteMode('-100111') === true && await W.isKillerOn(env, '-100111') === false);
// 副主人也无权
await W.handleKillerCommand({ chat: { id: '-100111', type: 'supergroup' }, from: { id: Number(DEPUTY) }, text: '/killer' }, env);
check('副主人 /killer 也无权（无回执）', sent.length === 0);


console.log('\n=== 4. 第一主人 /killer 开启 → 改为封禁踢出 ===');
reset();
await W.handleKillerCommand({ chat: { id: '-100111', type: 'supergroup' }, from: { id: Number(OWNER) }, text: '/killer' }, env);
check('第一主人裸 /killer 翻转为开启', sent.some((x) => x.text.includes('杀手模式已开启')));
check('D1 记录 -100111 enabled=1', await W.isKillerOn(env, '-100111') === true);
await W.refreshMuteModeGroups(env);
check('刷新后 -100111 不再是禁言模式', !W.isGroupMuteMode('-100111'));
reset();
await W.banUserFromAllGroups('55502', { probeMembership: false });
check('开启后 -100111 改走 banChatMember 封禁', callsOf('banChatMember').some((c) => String(c.body.chat_id) === '-100111' && Number(c.body.user_id) === 55502));
check('开启后 -100111 不再禁言', !mutedCalls().some((c) => String(c.body.chat_id) === '-100111'));

console.log('\n=== 5. /killer off 关回禁言 + status + 非杀手群 ===');
reset();
await W.handleKillerCommand({ chat: { id: '-100111', type: 'supergroup' }, from: { id: Number(OWNER) }, text: '/killer off' }, env);
check('/killer off 关闭', sent.some((x) => x.text.includes('杀手模式已关闭')));
await W.refreshMuteModeGroups(env);
check('关闭后 -100111 恢复禁言模式', W.isGroupMuteMode('-100111'));
reset();
await W.handleKillerCommand({ chat: { id: '-100222', type: 'supergroup' }, from: { id: Number(OWNER) }, text: '/killer' }, env);
check('非杀手群 /killer 提示未启用', sent.some((x) => x.text.includes('未启用杀手模式')));
reset();
await W.handleKillerCommand({ chat: { id: Number(OWNER), type: 'private' }, from: { id: Number(OWNER) }, text: '/killer' }, env);
check('私聊 /killer 列表额外显示群名（<b>群名</b> + ID）', sent.some((x) => x.text.includes('<b>群</b>') && x.text.includes('-100111')));

console.log('\n=== 6. /unban 在禁言群解除禁言、普通群解封 ===');
reset();
await W.unbanUserFromAllGroups('55503');
check('禁言群 -100111 解禁（restrictChatMember 恢复发言）', unmuteCalls().some((c) => String(c.body.chat_id) === '-100111'));
check('普通群 -100222 走 unbanChatMember 解封', callsOf('unbanChatMember').some((c) => String(c.body.chat_id) === '-100222'));

console.log('\n杀手模式验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
