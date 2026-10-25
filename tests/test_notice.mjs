// 全体通知（/notice）· 离线端到端验证（新流程：命令→提示→发内容→按钮确认）
// 覆盖：仅第一主人私聊可用（群内静默、私聊非主人权限不足、副主人/超管无权）、
//       /notice 出提示并进入等待态、下一条内容被捕获出预览+按钮、点确认用 copyMessage 群发、
//       点取消、非等待态不误捕获普通消息、pending 过期、失败群中文汇总、/notice 不进命令菜单。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
const calls = [];
const sent = [];            // sendMessage {chatId, text, markup}
const copied = [];          // copyMessage {chatId, fromChatId, msgId}
const answered = [];        // answerCallbackQuery {text}
let failGroups = new Set();

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		calls.push({ method: m, body: b });
		let payload = { ok: true, result: true };
		if (m === 'sendMessage') { sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || ''), markup: b?.reply_markup || null }); payload = { ok: true, result: { message_id: 9000 + sent.length } }; }
		else if (m === 'copyMessage') {
			if (failGroups.has(String(b?.chat_id))) payload = { ok: false, description: 'Bad Request: not enough rights to send text messages to the chat' };
			else { copied.push({ chatId: String(b?.chat_id ?? ''), fromChatId: String(b?.from_chat_id ?? ''), msgId: Number(b?.message_id) }); payload = { ok: true, result: { message_id: 8000 + copied.length } }; }
		}
		else if (m === 'answerCallbackQuery') { answered.push({ text: String(b?.text || '') }); }
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
const reset = () => { calls.length = 0; sent.length = 0; copied.length = 0; answered.length = 0; failGroups = new Set(); };
const sentTo = (id) => sent.filter((s) => s.chatId === String(id));
const lastTo = (id) => { const a = sentTo(id); return a[a.length - 1]; };
const callsOf = (m) => calls.filter((c) => c.method === m);

const OWNER = '10001', DEPUTY = '10002', SUPER = '10003', STRANGER = '77777';
const GROUPS = ['-100111', '-100222', '-100333'];
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUPS.join(','), OWNER_IDS: OWNER + ',' + DEPUTY, SUPER_ADMIN_IDS: SUPER, DB: makeD1() };
W.applyRuntimeConfig(W.loadRequiredConfig(env));
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });
await W.adDetectionReady(env);   // 确保 ad_scan_state 表就绪

// 走真实 webhook 入口，验证「命令分发 + 内容捕获 + 回调」端到端串起来
const drive = async (update) => { await W.__h.fetch(new Request('https://x/', { method: 'POST', body: JSON.stringify(update) }), env, { waitUntil() {} }); };
const priv = (id) => ({ id: Number(id), type: 'private' });
const dmMsg = (from, extra) => drive({ message: { chat: priv(from), from: { id: Number(from), is_bot: false }, message_id: extra.message_id || 100, ...extra } });
const clickBtn = (from, data) => drive({ callback_query: { id: 'cb', from: { id: Number(from), is_bot: false }, data, message: { chat: priv(from), message_id: 200 } } });

console.log('\n=== 1. 权限 ===');
reset();
await drive({ message: { chat: { id: '-100111', type: 'supergroup' }, from: { id: Number(OWNER), is_bot: false }, text: '/notice', message_id: 1 } });
check('群内 /notice 完全静默', sent.length === 0);
reset(); await dmMsg(STRANGER, { text: '/notice', message_id: 2 });
check('私聊陌生人 /notice → 权限不足', sentTo(STRANGER).some((s) => s.text.includes('权限不足')));
reset(); await dmMsg(DEPUTY, { text: '/notice', message_id: 3 });
check('私聊副主人 → 权限不足', sentTo(DEPUTY).some((s) => s.text.includes('权限不足')));
reset(); await dmMsg(SUPER, { text: '/notice', message_id: 4 });
check('私聊超管 → 权限不足', sentTo(SUPER).some((s) => s.text.includes('权限不足')));

console.log('\n=== 2. 完整流程：命令→提示→内容→按钮确认→群发 ===');
reset();
await dmMsg(OWNER, { text: '/notice', message_id: 10 });
check('第一主人 /notice → 出「请把内容作为下一条消息发给我」提示', lastTo(OWNER)?.text.includes('作为下一条消息发给我'));
check('提示阶段不群发', copied.length === 0);
reset();
await dmMsg(OWNER, { text: '机器人更新了统计功能，修复了删除计数', message_id: 11 });
check('发内容后 → 出确认预览', lastTo(OWNER)?.text.includes('全体通知 · 确认') && lastTo(OWNER)?.text.includes('修复了删除计数'));
check('确认阶段带内联按钮（确认发送/取消）', (() => { const kb = lastTo(OWNER)?.markup?.inline_keyboard?.[0] || []; return kb.length === 2 && kb.some((b) => b.callback_data === 'notice:confirm') && kb.some((b) => b.callback_data === 'notice:cancel'); })());
check('确认阶段仍未群发', copied.length === 0);
reset();
await clickBtn(OWNER, 'notice:confirm');
check('点确认 → 3 个群都收到 copyMessage', GROUPS.every((g) => copied.some((c) => c.chatId === g && c.msgId === 11)));
check('copy 源为第一主人私聊', copied.every((c) => c.fromChatId === String(OWNER)));
check('点确认 → 回执成功 3/3', sentTo(OWNER).some((s) => s.text.includes('全体通知已发送') && s.text.includes('3</b> / 3')));
check('点确认 → answerCallbackQuery 有响应', answered.length > 0);
reset();
await clickBtn(OWNER, 'notice:confirm');
check('重复点确认 → 已失效（状态已清）', answered.some((a) => a.text.includes('失效')) && copied.length === 0);

console.log('\n=== 3. 图片/媒体内容（无文本）===');
reset();
await dmMsg(OWNER, { text: '/notice', message_id: 20 });
reset();
await dmMsg(OWNER, { photo: [{ file_id: 'abc' }], caption: '', message_id: 21 });
check('发图片 → 预览提示非文本消息', lastTo(OWNER)?.text.includes('非文本消息'));
reset();
await clickBtn(OWNER, 'notice:confirm');
check('图片内容 confirm → copyMessage 复制图片消息(msgId=21)', GROUPS.every((g) => copied.some((c) => c.chatId === g && c.msgId === 21)));

console.log('\n=== 4. 取消 ===');
reset();
await dmMsg(OWNER, { text: '/notice', message_id: 30 });
await dmMsg(OWNER, { text: '要取消的内容', message_id: 31 });
reset();
await clickBtn(OWNER, 'notice:cancel');
check('点取消 → 提示已取消、不群发', sentTo(OWNER).some((s) => s.text.includes('已取消')) && copied.length === 0);
reset();
await clickBtn(OWNER, 'notice:confirm');
check('取消后再点确认 → 已失效', answered.some((a) => a.text.includes('失效')) && copied.length === 0);

console.log('\n=== 5. 非等待态不误捕获普通私聊消息 ===');
reset();
await dmMsg(OWNER, { text: '随便聊一句', message_id: 40 });
check('未发 /notice 时，普通消息不被当作通知内容', !sentTo(OWNER).some((s) => s.text.includes('全体通知 · 确认')) && copied.length === 0);

console.log('\n=== 6. /notice cancel 文本命令 ===');
reset();
await dmMsg(OWNER, { text: '/notice', message_id: 50 });
reset();
await dmMsg(OWNER, { text: '/notice cancel', message_id: 51 });
check('/notice cancel → 已取消', sentTo(OWNER).some((s) => s.text.includes('已取消')));
reset();
await dmMsg(OWNER, { text: '之前等待的内容', message_id: 52 });
check('cancel 后普通消息不再被捕获', !sentTo(OWNER).some((s) => s.text.includes('全体通知 · 确认')));

console.log('\n=== 7. 非第一主人点按钮无效 ===');
reset();
await dmMsg(OWNER, { text: '/notice', message_id: 60 });
await dmMsg(OWNER, { text: '内容', message_id: 61 });
reset();
await clickBtn(DEPUTY, 'notice:confirm');
check('副主人点确认按钮 → 无权、不群发', answered.some((a) => a.text.includes('仅第一主人')) && copied.length === 0);

console.log('\n=== 8. 失败群中文汇总 ===');
reset();
await dmMsg(OWNER, { text: '/notice', message_id: 70 });
await dmMsg(OWNER, { text: '部分群失败', message_id: 71 });
reset();
failGroups = new Set(['-100222']);
await clickBtn(OWNER, 'notice:confirm');
check('失败群回执 2/3', sentTo(OWNER).some((s) => s.text.includes('2</b> / 3')));
check('失败群中文原因', sentTo(OWNER).some((s) => s.text.includes('-100222') && s.text.includes('bot 权限不足')));
check('回执无英文原文', sentTo(OWNER).every((s) => !s.text.includes('not enough rights')));

console.log('\n=== 9. pending 过期 ===');
reset();
await dmMsg(OWNER, { text: '/notice', message_id: 80 });
await dmMsg(OWNER, { text: '会过期', message_id: 81 });
await W.writeAdScanState(env, 'notice_pending', JSON.stringify({ stage: 'confirm', srcChatId: OWNER, srcMsgId: 81, at: Date.now() - 11 * 60 * 1000 }));
reset();
await clickBtn(OWNER, 'notice:confirm');
check('超 10 分钟 → 失效、不群发', answered.some((a) => a.text.includes('失效')) && copied.length === 0);

// 【改口径】主人原话：菜单只留 ban spam check unban stats，「其余指令全部清空…只是清空展示出来的指令」。
// 旧断言要求 /notice /start /menu /user /adstats /dryrun /sban /rm 等进菜单，现在反过来：
// 菜单恰好 5 条、/notice 不在菜单里；/notice 本身照常可用由上面 1～9 节全程覆盖。
console.log('\n=== 10. 菜单只留 6 条，/notice 移出菜单但照常可用 ===');
reset();
await W.__h.fetch(new Request('https://x/T'), env, { waitUntil() {} });
const allCmds = callsOf('setMyCommands')[0]?.body?.commands || [];
check('★ 菜单恰好是 ban spam check unban stats groupmode',
	JSON.stringify(allCmds.map((x) => x.command)) === JSON.stringify(['ban', 'spam', 'check', 'unban', 'stats', 'groupmode']),
	JSON.stringify(allCmds.map((x) => x.command)));
check('★ /notice 已移出菜单', !allCmds.some((c) => c.command === 'notice'));
for (const c of allCmds) {
	check('菜单 /' + c.command + ' 有实质说明', c.description.length > 1 && c.description !== '·', c.description);
}
reset();
await dmMsg(OWNER, { text: '/notice', message_id: 90 });
check('★ 不在菜单的 /notice 直接发送仍然进入发起流程', sent.some((m) => /通知/.test(m.text || '')), JSON.stringify(sent.map((m) => (m.text || '').slice(0, 40))));

console.log('\n全体通知验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
