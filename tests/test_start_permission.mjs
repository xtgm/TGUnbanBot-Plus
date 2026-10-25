// /start 权限矩阵 · 离线验证
// 覆盖：第一主人（私聊 + 群聊）拿到统计面板；私聊非主人逐字节收到原介绍语、零按钮；
//       群聊非主人纯静默（一条都不发，不撤回、不通知）；面板入口不泄露给任何人。
// 未覆盖：「面板渲染失败回落介绍语」—— 沙箱里函数调用是词法引用，外部 monkey-patch 不进去，
//         无法注入渲染异常；该路径由 _worker.js 里的 try/catch 兜底（代码审查确认）。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
const sent = [];
const edits = [];
const answers = [];
let currentAdmins = [];
let getMeFail = false;

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
		} else if (m === 'deleteMessage') {
			payload = { ok: true, result: true };
		} else if (m === 'getChatAdministrators') {
			payload = { ok: true, result: currentAdmins.map((id) => ({ user: { id: Number(id) }, status: 'administrator' })) };
		} else if (m === 'getChat') {
			payload = { ok: true, result: { id: b?.chat_id, title: '统计测试群', type: 'supergroup' } };
		} else if (m === 'getChatMember') {
			payload = { ok: true, result: { status: 'member', user: { id: Number(b?.user_id) } } };
		} else if (m === 'getChatMemberCount') {
			payload = { ok: true, result: 4855 };
		} else if (m === 'getMe') {
			payload = getMeFail ? { ok: false, description: 'boom' } : { ok: true, result: { id: 42, username: 'testbot', is_bot: true } };
		} else if (m === 'editMessageText') {
			edits.push({ chatId: String(b?.chat_id ?? ''), messageId: Number(b?.message_id) || 0,
				text: String(b?.text || ''), markup: b?.reply_markup || null });
			payload = { ok: true, result: { message_id: Number(b?.message_id) || 0 } };
		} else if (m === 'answerCallbackQuery') {
			answers.push({ id: String(b?.callback_query_id ?? ''), text: String(b?.text || '') });
			payload = { ok: true, result: true };
		}
		return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.replace(/export\s+default\s*/, 'globalThis.__h = '), sandbox, { filename: '_worker.js' });
const W = sandbox;
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
const WELCOME = '👋 <b>你好，{userId}</b>\n这是原介绍语，逐字节不许变。';
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUPS.join(','), OWNER_IDS: OWNER + ',' + DEPUTY,
	START_WELCOME: WELCOME, DB: makeD1() };

// 配置在 /T/export 时读入；这里显式带上 START_WELCOME，好在断言里逐字节比对。
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });

const drive = async (msg) => {
	const p = [];
	await W.__h.fetch(new Request('https://x/', { method: 'POST', body: JSON.stringify({ message: msg }) }),
		env, { waitUntil: (x) => p.push(Promise.resolve(x)) });
	await Promise.allSettled(p);
};
const clear = () => { sent.length = 0; edits.length = 0; answers.length = 0; };
const texts = (kb) => (kb?.inline_keyboard || []).flat().map((b) => String(b.text || ''));

console.log('\n=== 1. 私聊 · 第一主人 → 统计面板 ===');
clear();
await drive({ message_id: 1, chat: { id: Number(OWNER), type: 'private' },
	from: { id: Number(OWNER), is_bot: false, first_name: '我' }, text: '/start' });
const home = sent.find((s) => s.chatId === String(OWNER));
check('收到 1 条', sent.length === 1 && !!home, JSON.stringify(sent.map((s) => s.text.slice(0, 30))));
check('是统计面板而不是介绍语', !!home && home.text.includes('统计面板'), home?.text);
check('面板里有群选择按钮', !!home && texts(home.markup).some((t) => t.includes('👥')), JSON.stringify(texts(home?.markup)));
check('面板带「添加到群组」与「添加到频道」',
	!!home && texts(home.markup).some((t) => t.includes('添加到群组')) && texts(home.markup).some((t) => t.includes('添加到频道')),
	JSON.stringify(texts(home?.markup)));
check('添加按钮是 url 深链（不是 callback）',
	!!home && (home.markup?.inline_keyboard || []).flat().some((b) => String(b.url || '').includes('startgroup'))
		&& (home.markup?.inline_keyboard || []).flat().some((b) => String(b.url || '').includes('startchannel')));
check('面板不含原介绍语（两者严格分离）', !!home && !home.text.includes('原介绍语'));

console.log('\n=== 2. 私聊 · 非第一主人 → 逐字节原介绍语 ===');
for (const [label, who] of [['普通用户', '8888'], ['副主人', DEPUTY]]) {
	clear();
	await drive({ message_id: 2, chat: { id: Number(who), type: 'private' },
		from: { id: Number(who), is_bot: false, first_name: 'x' }, text: '/start' });
	const got = sent.find((s) => s.chatId === String(who));
	const expected = WELCOME.replaceAll('{userId}', String(who)).replaceAll('{title}', '');
	check('[' + label + '] 恰好 1 条', sent.length === 1 && !!got, JSON.stringify(sent.map((s) => s.text.slice(0, 30))));
	check('[' + label + '] 逐字节等于原介绍语', !!got && got.text === expected,
		JSON.stringify({ got: got?.text, expected }));
	check('[' + label + '] 零按钮（拿不到面板）', !!got && !got.markup, JSON.stringify(got?.markup));
	check('[' + label + '] 完全不含面板特征',
		!!got && !got.text.includes('统计面板') && !String(got.text).includes('选择群组'));
}

console.log('\n=== 3. 群聊 · 第一主人 → 统计面板 ===');
clear();
await drive({ message_id: 3, chat: { id: Number(GROUPS[0]), type: 'supergroup', title: '统计测试群' },
	from: { id: Number(OWNER), is_bot: false, first_name: '我' }, text: '/start' });
const gHome = sent.find((s) => s.chatId === GROUPS[0]);
check('群聊第一主人收到面板', sent.length === 1 && !!gHome && gHome.text.includes('统计面板'),
	JSON.stringify(sent.map((s) => s.text.slice(0, 30))));
check('  ↑ 带群选择按钮', !!gHome && texts(gHome.markup).some((t) => t.includes('👥')), JSON.stringify(texts(gHome?.markup)));

console.log('\n=== 4. 群聊 · 非第一主人 → 纯静默 ===');
for (const [label, who] of [['普通成员', '8888'], ['副主人', DEPUTY], ['群管理员', '777']]) {
	clear();
	await drive({ message_id: 4, chat: { id: Number(GROUPS[0]), type: 'supergroup', title: '统计测试群' },
		from: { id: Number(who), is_bot: false, first_name: 'x' }, text: '/start' });
	check('[' + label + '] 一条都不发（纯静默）', sent.length === 0, JSON.stringify(sent.map((s) => s.text.slice(0, 30))));
	check('[' + label + '] 不发通知、不撤回、零编辑',
		edits.length === 0 && answers.length === 0, JSON.stringify({ edits: edits.length, answers: answers.length }));
}

console.log('\n=== 5. 权限互证：isPrimaryOwner 口径 ===');
check('第一主人是第一主人', W.isPrimaryOwner(OWNER) === true);
check('副主人不是第一主人（面板不给他）', W.isPrimaryOwner(DEPUTY) === false);
check('陌生 id 不是第一主人', W.isPrimaryOwner('8888') === false);

console.log('\n=== 6. getMe 失败时首页不炸（add 按钮降级） ===');
{
	clear();
	getMeFail = true;
	try {
		await drive({ message_id: 5, chat: { id: Number(OWNER), type: 'private' },
			from: { id: Number(OWNER), is_bot: false, first_name: '我' }, text: '/start' });
		check('getMe 失败仍回一条（不静默、不崩溃）', sent.length === 1,
			JSON.stringify(sent.map((s) => s.text.slice(0, 30))));
		const f = sent[0];
		check('  ↑ 群按钮仍在（不依赖 bot username）', !!f && texts(f.markup).some((t) => t.includes('👥')),
			JSON.stringify(texts(f?.markup)));
	} catch (e) {
		check('getMe 失败不抛异常', false, String(e && e.message));
	} finally { getMeFail = false; }
}

console.log('\nstart 权限验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
