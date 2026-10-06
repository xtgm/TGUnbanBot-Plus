// 演练模式与「同款」链路的离线测试。
// 与 test_adfix.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_dryrun_link.mjs
//
// 【这组测试存在的理由】2026-10-06 主人报「/spam 的时候有的同款又没有删除」，
// 并补充「这个群开了演练模式，不确定是否影响同款触发」。只读分析的结论是：
// /spam 当场的两条删除路径（当前群清扫 cleanupCurrentChatUserMessages、
// 跨群连带 findLinkedSpamTargets）都只认 moderation_messages 这张缓存表，
// 而【被判成广告的消息根本不写这张表】——
//   detectAdOnMessage 返回 true（含演练命中）→ handleMessage 直接 return，
//   写缓存那一步在 return 之后，压根走不到；转入 observe 的同样跳过。
// 于是演练命中 = 消息留在群里 + 不进缓存 + /spam 追不到 = 同款留在群里。
//
// 覆盖五件事：
//   ① 演练的定义没被改坏：命中确实不删不封不加黑
//   ② 同款基础设施不受演练影响：演练命中的消息也写缓存（is_ad=1）、
//      重发只删名单也写 → /spam 连带追得到
//   ③ 演练不变质：同款直封名单【不能】写（那份名单命中会真加黑 + 全群封禁）
//   ④ 非演练群的同款漏口一并堵上：被封的、转入观察的都进缓存
//   ⑤ 第 3 批的既定规则不破：广告正文进缓存但 /search 检索不到

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '_worker.js'), 'utf8');

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

// ---------- 真实 SQLite 驱动的 D1 兼容层 ----------
function makeD1() {
	const db = new DatabaseSync(':memory:');
	const normIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const key of Object.keys(row)) out[key] = typeof row[key] === 'bigint' ? Number(row[key]) : row[key];
		return out;
	};
	const exec = (sql, params = []) => {
		const statement = db.prepare(sql);
		const bound = params.map(normIn);
		const upper = sql.trim().slice(0, 6).toUpperCase();
		if (upper === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) {
			return { kind: 'rows', rows: statement.all(...bound).map(normOut) };
		}
		const info = statement.run(...bound);
		return { kind: 'write', meta: { changes: Number(info?.changes || 0), last_row_id: Number(info?.lastInsertRowid || 0) } };
	};
	const makeStatement = (sql) => {
		const state = { sql, params: [] };
		const api = {
			__d1: state,
			bind(...args) { state.params = args; return api; },
			async first() {
				const r = exec(state.sql, state.params);
				return r.kind === 'rows' ? (r.rows[0] ?? null) : null;
			},
			async run() {
				const r = exec(state.sql, state.params);
				return r.kind === 'rows'
					? { success: true, results: r.rows, meta: { changes: 0 } }
					: { success: true, meta: r.meta };
			},
			async all() {
				const r = exec(state.sql, state.params);
				return r.kind === 'rows'
					? { success: true, results: r.rows, meta: { changes: 0 } }
					: { success: true, results: [], meta: r.meta };
			}
		};
		return api;
	};
	return {
		__sqlite: db,
		prepare: (sql) => makeStatement(sql),
		async exec(sql) { db.exec(sql); return { count: 1, duration: 0 }; },
		async batch(statements) {
			const list = Array.from(statements || []);
			const out = [];
			db.exec('BEGIN');
			try {
				for (const statement of list) {
					const state = statement?.__d1;
					if (!state) throw new Error('batch 收到非本层生成的 statement');
					const r = exec(state.sql, state.params);
					out.push(r.kind === 'rows'
						? { success: true, results: r.rows, meta: { changes: 0 } }
						: { success: true, meta: r.meta });
				}
				db.exec('COMMIT');
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
			return out;
		},
		query(sql, ...params) { return db.prepare(sql).all(...params).map(normOut); }
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

// ---------- Telegram Bot API mock ----------
const calls = [];
let apiHandlers = {};
function setApi(next = {}) { apiHandlers = next; }
function resetCalls() { calls.length = 0; setApi(); try { W.invalidateAdAdminCache(); } catch { /* 尚未初始化 */ } }
function countCalls(method) { return calls.filter((c) => c.method === method).length; }

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777000, is_bot: true, username: 'DryLinkTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 6000 + calls.length } };
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
		const method = String(url).split('/').pop();
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
const handler = W.__handler;
const GROUP_ID = '-1001111111111';
const OWNER_ID = 10001;

function makeEnv(extra = {}) {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID), DB: makeD1(), ...extra };
}

let pendingWaits = [];
async function sendUpdate(update, env) {
	const request = new Request('https://example.workers.dev/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...update })
	});
	return handler.fetch(request, env, {
		waitUntil(promise) { pendingWaits.push(Promise.resolve(promise).catch(() => {})); }
	});
}

function groupMessage(from, text) {
	return {
		message_id: 200 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000),
		text,
		chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
		from: { is_bot: false, ...from }
	};
}

function privateMessage(fromId, text) {
	return {
		message_id: 100 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000),
		text,
		chat: { id: fromId, type: 'private', first_name: 'Owner' },
		from: { id: fromId, is_bot: false, first_name: 'Owner' }
	};
}

// 资料卡干净但正文是硬广告 —— 闸一定罪，不需要 bio 也定得了罪。
const AD_TEXT = '长期收购网赚账号 USDT，进群联系 @promo_seller_x';
const NORMAL_TEXT = '今天天气不错，一起出去走走';
const plainProfile = {
	getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '路人', bio: '' } }),
	getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } })
};

// 模块级配置由一次真实 webhook 的 applyConfig 写入，纯函数断言依赖它。
const bootEnv = makeEnv();
resetCalls();
await sendUpdate({ message: privateMessage(99999, 'hello') }, bootEnv);

// 开/关某群的演练开关。setDryRun 内部会懒建 dryrun_groups。
async function setDryRun(env, on) {
	const r = await W.setDryRun(env, GROUP_ID, on, String(OWNER_ID));
	return r?.ok === true;
}

// 列没加时要报 FAIL 而不是把整个测试撞崩 —— 崩溃拿不到汇总数，也分不清是哪一项红。
function modRows(env) {
	let rows;
	try {
		rows = env.DB.query('SELECT mid, chat_id, from_id, text_norm, is_ad FROM moderation_messages');
	} catch (_) {
		return env.DB.query('SELECT mid, chat_id, from_id, text_norm FROM moderation_messages')
			.map((r) => ({ ...r, is_ad: null }));
	}
	return rows;
}
// 表还没建 = 一条都没写过，与「写了 0 条」同一个断言语义。
function spamListRows(env) {
	try { return env.DB.query('SELECT text_norm FROM ad_spam_texts'); }
	catch (_) { return []; }
}
// ad_handled_texts 按 DB 实例做运行期缓存（15s），这里直接读库，避开缓存。
function freshHandledList(env) {
	try {
		const rows = env.DB.query("SELECT value FROM ad_scan_state WHERE key = 'ad_handled_texts'");
		return JSON.parse(rows[0]?.value || '[]');
	} catch (_) { return []; }
}

// ================= [1] 演练的定义没被改坏 =================
section('[1] 演练命中：处置照旧被挡住（前提）');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	assert('演练开关写入成功', await setDryRun(env, true));
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60101, first_name: '广告号' }, AD_TEXT) }, env);

	assert('演练：不封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('演练：不删消息', countCalls('deleteMessage') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('演练：不加黑', env.DB.query('SELECT COUNT(*) AS c FROM blacklist')[0].c === 0);
	const dryRows = env.DB.query('SELECT COUNT(*) AS c FROM ad_dryrun_log');
	assert('演练：写了流水（判据留痕）', dryRows[0].c === 1, JSON.stringify(dryRows));
}

// ================= [2] 漏口：演练命中的消息不写缓存 =================
section('[2] 同款基础设施不受演练影响');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	await setDryRun(env, true);
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60102, first_name: '广告号' }, AD_TEXT) }, env);

	const rows = modRows(env);
	assert('演练命中的消息写进了 moderation_messages',
		rows.length === 1, JSON.stringify(rows));
	assert('打了 is_ad 标记（供 /search 排除）',
		rows.length === 1 && Number(rows[0].is_ad) === 1,
		JSON.stringify(rows));

	// /spam 跨群连带靠的就是这张表的 text_hash 反查。
	const key = W.buildModerationTextKey({ text: AD_TEXT });
	const found = await W.findLinkedSpamTargets(env, key, '999999999');
	assert('连带反查追得到演练命中的同款',
		found.targets.length === 1 && String(found.targets[0].userId) === '60102',
		JSON.stringify(found));

	// 重发只删名单：bot / 带引用体重发这条文案时要能删掉。
	const handled = freshHandledList(env);
	assert('演练命中也写了重发只删名单（ad_handled_texts）',
		handled.length === 1, JSON.stringify(handled));
	assert('matchHandledAdText 能认出这条同款',
		(await W.matchHandledAdText(env, { text: AD_TEXT, caption: '' })) === true);
}

// ================= [3] 演练不变质：直封名单不能写 =================
section('[3] 演练不变质：同款直封名单不写');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	await setDryRun(env, true);
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60103, first_name: '广告号' }, AD_TEXT) }, env);

	// ad_spam_texts 命中会【真加黑 + 全群封禁】（enforceHandledRepeatBan），
	// 演练群里写了它，下一个人直发同款就被真封了 —— 演练就不是演练了。
	const spamRows = spamListRows(env);
	assert('演练命中【不写】同款直封名单 ad_spam_texts',
		spamRows.length === 0, JSON.stringify(spamRows));

	// 落地验证：接着再发一条同款，不该触发直封（该走的仍是演练短路）。
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60104, first_name: '路人甲' }, AD_TEXT) }, env);
	assert('演练群里后续同款不会被直封', countCalls('banChatMember') === 0,
		JSON.stringify(calls.map((c) => c.method)));
}

// ================= [4] 非演练群的同款漏口 =================
section('[4] 非演练群：被封的与观察中的消息也进缓存');
{
	// 被封的那条
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60105, first_name: '广告号' }, AD_TEXT) }, env);
	assert('非演练群：确实封了（前提）', countCalls('banChatMember') >= 1,
		JSON.stringify(calls.map((c) => c.method)));
	const rows = modRows(env);
	assert('被封的消息也写进缓存并标 is_ad',
		rows.length === 1 && Number(rows[0].is_ad) === 1, JSON.stringify(rows));
	const key = W.buildModerationTextKey({ text: AD_TEXT });
	const found = await W.findLinkedSpamTargets(env, key, '999999999');
	assert('被封的那条同样进得了连带反查', found.targets.length === 1, JSON.stringify(found));

	// 转入观察的那条：AD_CARD_KILL=observe 让结构查杀产出 observe 而不是 ban。
	const envObs = makeEnv({ AD_CARD_KILL: 'observe' });
	await W.adDetectionReady(envObs);
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60106, first_name: '半可疑' }, '出货 批发 走量 USDT 有需要的来') }, envObs);
	assert('观察：确实进了观察窗口（前提）',
		envObs.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 1);
	const obsRows = modRows(envObs);
	assert('观察中的消息也写进缓存并标 is_ad',
		obsRows.length === 1 && Number(obsRows[0].is_ad) === 1, JSON.stringify(obsRows));
}

// ================= [5] 对照：正常消息 =================
section('[5] 正常消息照旧写缓存，is_ad=0');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60107, first_name: '张三' }, NORMAL_TEXT) }, env);
	const rows = modRows(env);
	assert('正常消息写进缓存', rows.length === 1, JSON.stringify(rows));
	assert('正常消息 is_ad=0（能被 /search 检索到）',
		rows.length === 1 && Number(rows[0].is_ad) === 0, JSON.stringify(rows));

	const r = await W.runSearchMessages(env, { chatIds: [GROUP_ID], keyword: '天气' });
	assert('/search 能搜到正常消息', r.total === 1, JSON.stringify(r));
}

// ================= [6] 广告正文进缓存但 /search 检索不到 =================
section('[6] 第 3 批规则不破：广告正文不进 /search 检索源');
{
	// 演练群的广告
	const envDry = makeEnv();
	await W.adDetectionReady(envDry);
	await setDryRun(envDry, true);
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60108, first_name: '广告号' }, AD_TEXT) }, envDry);
	assert('演练群：广告正文确实进了缓存（第2段的前置）',
		modRows(envDry).length === 1, JSON.stringify(modRows(envDry)));
	let r = await W.runSearchMessages(envDry, { chatIds: [GROUP_ID], keyword: 'usdt' });
	assert('/search 检索不到演练命中的广告正文', r.total === 0, JSON.stringify(r.rows));

	// 非演练群的广告
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60109, first_name: '广告号' }, AD_TEXT) }, env);
	r = await W.runSearchMessages(env, { chatIds: [GROUP_ID], keyword: 'usdt' });
	assert('/search 检索不到被封的广告正文', r.total === 0, JSON.stringify(r.rows));

	// 反证：同一批数据里正常消息仍搜得到，否则上面的 0 可能是「表是空的」假通过。
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60110, first_name: '张三' }, NORMAL_TEXT) }, env);
	r = await W.runSearchMessages(env, { chatIds: [GROUP_ID], keyword: '天气' });
	assert('对照：同库正常消息仍可检索（0 不是假通过）', r.total === 1, JSON.stringify(r));
}

// ================= [7] 源码断言 =================
section('[7] 源码断言');
{
	assert('缓存表有 is_ad 列', src.includes('is_ad') && src.includes('CREATE TABLE IF NOT EXISTS moderation_messages'));
	assert('schema 版本已提升（新列必须靠迁移加上）',
		Number(src.match(/const D1_SCHEMA_VERSION = (\d+)/)?.[1]) >= 9,
		String(src.match(/const D1_SCHEMA_VERSION = (\d+)/)?.[1]));
	assert('/search 查询排除 is_ad', /runSearchMessages[\s\S]{0,1200}is_ad/.test(src));
	assert('演练短路仍排在加黑之前（处置没被放开）',
		src.includes('if (!options.force && chatId && (await isDryRunGroup(env, chatId)))'));
	assert('演练短路处写入重发只删名单',
		/isDryRunGroup[\s\S]{0,2500}recordHandledAdText/.test(src));
}

console.log(`\n========== 演练与同款链路：通过 ${pass} / 失败 ${fail} ==========`);
if (fail > 0) {
	console.log('失败项：');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
