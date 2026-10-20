// 视觉识别三件事的离线测试：MIME 认字节头、失败落台账、队列冷却。
// 与 test_vision_clef.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite。运行：node test_vision_fail.mjs
//
// 背景（2026-10-14）：线上 94 张图永久卡死，根因是头像那条把 data URI 写死成
// image/jpeg，而 Telegram 头像大量是 WebP。头像卡死 88 条、正文图只 6 条 ——
// 差别正是「硬编码」与「按字节头 sniff」。
//
// 覆盖四件事：
//   ① sniffImageMime 认得出 PNG / JPEG / WebP / GIF，认不出非位图返回 null
//   ② 失败写进 ad_vision_failures 台账，同一张图反复失败 fail_count 累加（不撑爆表）
//   ③ 队列冷却：判过但失败的图 24 小时内不再被取；没判过的（vision_checked_at=0）照取
//   ④ /adstats 把失败台账展示出来，并点明「同一类反复失败是系统性问题」

import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');

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
		return { kind: 'run', success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid }, results: [{ success: true, meta: { changes: info.changes } }] };
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
		// batch 的真实返回是 [{ results: [...], success: true }, ...]，
		// 每个元素一条语句的结果。exec 对 SELECT 返回 { kind:'rows', rows:[...] }，
		// 对写语句返回 { results: [...] } —— 两种都要归一到 .results，否则
		// /adstats 里 rows[9]?.results?.[0] 恒为 undefined，台账屏整个不出现。
		batch: async (stmts) => Promise.all(stmts.map(async (st) => {
			const r = await st.run();
			return { results: r?.rows || r?.results || [], success: true };
		})),
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
const DEFAULTS = {
	getMe: { ok: 1, result: { id: 1, is_bot: 1, username: 'x' } },
	sendMessage: { ok: 1, result: { message_id: 9 } },
	answerCallbackQuery: { ok: 1, result: 1 },
	editMessageText: { ok: 1, result: { message_id: 9 } }
};
const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (u, i) => {
		const m = String(u).split('/').pop();
		let b = null;
		try { b = i?.body ? JSON.parse(i.body) : null; } catch (_) {}
		calls.push({ method: m, body: b });
		const p = DEFAULTS[m] || { ok: 1, result: 1 };
		return { ok: true, status: 200, async json() { return p; }, async text() { return JSON.stringify(p); } };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });
const W = sandbox;

const GROUP_ID = '-1001111111111';
const OWNER_ID = 10001;
function makeEnv(extra = {}) {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID), DB: makeD1(), ...extra };
}
async function post(update, env) {
	return W.__handler.fetch(new Request('https://example.workers.dev/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update)
	}), env);
}
const sendTextOf = (method) => calls.filter((c) => c.method === method).map((c) => String(c.body?.text || ''));

// 带 magic bytes 的假图片字节：只用来过 sniff，内容不重要。
function imageBytes(magic) {
	const u8 = new Uint8Array(64 * 1024);
	for (let i = 0; i < magic.length; i++) u8[i] = magic[i];
	return u8;
}

const handler = W.__handler;
const bootEnv = makeEnv();
calls.length = 0;
await post({ update_id: 1, message: { message_id: 1, date: 1, text: '/start', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: 0, first_name: 'O' } } }, bootEnv);

// ================= [1] sniffImageMime =================
section('[1] sniffImageMime 认字节头');
{
	assert('PNG (89 50 4E 47)', W.sniffImageMime(imageBytes([0x89, 0x50, 0x4e, 0x47])) === 'image/png',
		String(W.sniffImageMime(imageBytes([0x89, 0x50, 0x4e, 0x47]))));
	assert('JPEG (FF D8 FF)', W.sniffImageMime(imageBytes([0xff, 0xd8, 0xff])) === 'image/jpeg',
		String(W.sniffImageMime(imageBytes([0xff, 0xd8, 0xff]))));
	assert('WebP (RIFF....WEBP)', W.sniffImageMime(imageBytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])) === 'image/webp',
		String(W.sniffImageMime(imageBytes([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))));
	assert('GIF (GIF8)', W.sniffImageMime(imageBytes([0x47, 0x49, 0x46, 0x38])) === 'image/gif',
		String(W.sniffImageMime(imageBytes([0x47, 0x49, 0x46, 0x38]))));

	// 这一条就是 Bug 本体的反面：全零字节（.tgs / .webm 容器、或者下载损坏）
	// 必须返回 null，让调用方跳过而不是硬喂模型。
	assert('全零字节返回 null（不当成任何图片格式）', W.sniffImageMime(imageBytes([])) === null,
		String(W.sniffImageMime(imageBytes([]))));
	assert('过短字节返回 null', W.sniffImageMime(new Uint8Array([0xff, 0xd8])) === null);
	assert('空字节返回 null', W.sniffImageMime(null) === null);
}

// ================= [2] 失败落台账 =================
section('[2] logAdVisionFailure 落 ad_vision_failures');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const hasTable = env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ad_vision_failures'");
	assert('ad_vision_failures 表已建出', hasTable.length === 1, JSON.stringify(hasTable));

	await W.logAdVisionFailure(env, '头像', 'sniff', 'AV_X', new Error('头像不是位图（可能是 .tgs / .webm 容器），跳过推理'));
	let rows = env.DB.query('SELECT * FROM ad_vision_failures');
	assert('失败写入台账一条', rows.length === 1, JSON.stringify(rows));
	assert('台账记下 kind 与 stage', rows[0]?.kind === '头像' && rows[0]?.stage === 'sniff', JSON.stringify(rows[0]));
	assert('台账记下错误信息', String(rows[0]?.error_message || '').includes('不是位图'), JSON.stringify(rows[0]));
	assert('首次失败 fail_count = 1', Number(rows[0]?.fail_count) === 1, JSON.stringify(rows[0]));

	// 同一张图再失败两次：不新增行，fail_count 累加 —— 这正是「别撑爆表 + 暴露系统性」的口径
	await W.logAdVisionFailure(env, '头像', 'sniff', 'AV_X', new Error('头像不是位图'));
	await W.logAdVisionFailure(env, '头像', 'sniff', 'AV_X', new Error('头像不是位图'));
	rows = env.DB.query('SELECT * FROM ad_vision_failures');
	assert('反复失败不新增行（按 target_id 去重）', rows.length === 1, JSON.stringify(rows));
	assert('fail_count 累加到 3', Number(rows[0]?.fail_count) === 3, JSON.stringify(rows[0]));

	// 另一张图是独立一行
	await W.logAdVisionFailure(env, '图片', 'ai.run', 'IMG_Y', new Error('clef 未返回判定'));
	assert('不同 target_id 各占一行', env.DB.query('SELECT * FROM ad_vision_failures').length === 2);

	// 台账写失败不能把主链路带崩（表被删掉时也不该抛）
	const envBroken = makeEnv();
	await W.adDetectionReady(envBroken);
	envBroken.DB._raw.exec('DROP TABLE ad_vision_failures');
	let threw = false;
	try { await W.logAdVisionFailure(envBroken, '头像', 'ai.run', 'AV_Z', new Error('x')); } catch (_) { threw = true; }
	assert('台账写失败不抛异常（不带崩主链路）', threw === false);
}

// ================= [3] 队列冷却 =================
section('[3] 队列冷却：失败的图隔天再试，没判过的照取');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const now = Math.floor(Date.now() / 1000);
	const day = 24 * 60 * 60;
	// 四行：A 没判过；B 判过但失败、刚失败（冷却中）；C 判过但失败、24 小时前（已过冷却）；
	// D 判成功了（verdict=ad）—— 永远不该被重试，不管冷却过没过。
	// 【必须 await】mock 的 run() 是 async，不 await 的话写入还没落盘就去 SELECT，
	// 表里恒为空 —— 表现是「SELECT 返回 []」，很容易误判成 WHERE 条件写错了。
	const seed = [
		['AV_NEW', 'pending', 0, 'F_NEW', null, '1', 0],
		['AV_HOT', 'pending', 0, 'F_HOT', null, '2', now - 60],
		['AV_OLD', 'pending', 0, 'F_OLD', null, '3', now - day - 60],
		['AV_DONE', 'ad', 5, 'F_DONE', 'vision', '4', now - day * 3]
	];
	for (const [id, verdict, hits, fileId, source, lastUser, checkedAt] of seed) {
		await env.DB.prepare('INSERT INTO ad_avatars (file_unique_id, verdict, hits, file_id, source, last_user_id, vision_checked_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
			.bind(id, verdict, hits, fileId, source, lastUser, checkedAt, now, now).run();
	}

	// 直接执行与 runAdAvatarVision 同一条语句，验证 WHERE 语义。
	// 【必须 await】all() 是 async，不 await 拿到的是 Promise，.results 恒为 undefined ——
	// 表现会是「SELECT 返回 []」，极容易误判成 WHERE 条件写错了。
	const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM ad_avatars').all();
	assert('四行测试数据已写入', Number((total.results || [])[0]?.c) === 4,
		JSON.stringify((total.results || [])[0]) + ' sqls=' + JSON.stringify((env.DB._sql || []).slice(-6)));
	const rows = await env.DB.prepare(
		'SELECT file_unique_id FROM ad_avatars '
		+ 'WHERE verdict = \'pending\' AND (vision_checked_at = 0 OR vision_checked_at < ?) AND file_id != \'\' '
		+ 'ORDER BY vision_checked_at ASC, updated_at ASC'
	).bind(now - day).all();
	const got = (rows.results || []).map((r) => r.file_unique_id);
	assert('没判过的取出来', got.includes('AV_NEW'), JSON.stringify(got));
	assert('刚失败的冷却中不取', !got.includes('AV_HOT'), JSON.stringify(got));
	assert('冷却期满的再取一次', got.includes('AV_OLD'), JSON.stringify(got));
	assert('判成功的永远不取', !got.includes('AV_DONE'), JSON.stringify(got));

	// 冷却常量是 24 小时。这里查源码而不是读 sandbox —— vm 里顶层 const/let
	// 不会挂到 globalThis 上，W.AD_VISION_RETRY_COOLDOWN_SEC 恒为 undefined。
	assert('冷却常量定义为 24 小时', /const AD_VISION_RETRY_COOLDOWN_SEC = 24 \* 60 \* 60;/.test(src),
		(src.match(/const AD_VISION_RETRY_COOLDOWN_SEC[^;]*/) || ['未找到'])[0]);

	// 旧的「只认 vision_checked_at = 0」语义必须已经不在了（否则失败的图永久卡死）
	const sqls = (env.DB._sql || []).filter((s) => s.includes('ad_avatars') && s.includes('vision_checked_at'));
	const strict = sqls.filter((s) => s.includes('vision_checked_at = 0 AND'));
	assert('队列条件里不再有「只认 0」的写法', strict.length === 0, JSON.stringify(strict));
}

// ================= [4] /adstats 展示台账 =================
section('[4] /adstats 展示失败台账');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	calls.length = 0;
	// 跳过类：文件失效（预期内，不计熔断）→ 展示在「跳过」栏，不叫失败。
	await W.logAdVisionFailure(env, '头像', 'getFile', 'AV_SKIP', new Error('wrong file_id or the file is temporary'), true);
	// 真故障：链路失败 → 展示在「故障」栏，保留系统性问题提示。
	await W.logAdVisionFailure(env, '图片', 'ai.run', 'IMG_FAIL', new Error('clef 未返回判定'));
	calls.length = 0;
	await post({ update_id: 5, message: { message_id: 5, date: 1, text: '/adstats', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: 0, first_name: 'O' } } }, env);
	const text = sendTextOf('sendMessage').join('\n');
	assert('跳过与故障分成两栏', /视觉识别跳过/.test(text) && /视觉识别故障/.test(text), text.slice(0, 400));
	assert('跳过栏展示目标 id 与跳过字样', text.includes('AV_SKIP') && /跳过 1 次/.test(text), text.slice(0, 600));
	assert('故障栏展示目标 id 与失败字样', text.includes('IMG_FAIL') && /失败 1 次/.test(text), text.slice(0, 600));
	assert('跳过项不串进故障栏', text.indexOf('AV_SKIP') < text.indexOf('视觉识别故障'), text.slice(0, 600));
	assert('真故障仍提示系统性问题', /系统性问题/.test(text), text.slice(0, 600));

	// 没有失败记录时不该出现这一屏（健康状态不添废话）
	const envClean = makeEnv();
	await W.adDetectionReady(envClean);
	calls.length = 0;
	await post({ update_id: 6, message: { message_id: 6, date: 1, text: '/adstats', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: 0, first_name: 'O' } } }, envClean);
	const cleanText = sendTextOf('sendMessage').join('\n');
	assert('无记录时两栏都不显示', !/视觉识别跳过/.test(cleanText) && !/视觉识别故障/.test(cleanText), cleanText.slice(0, 200));
}

// ================= [5] /adstats 各通道定罪 /误封对账 =================
section('[5] /adstats 各通道定罪 /误封对账');
{
	// 【为什么要有这一屏】第③层向量相似度是全系统定罪量最大的主力通道
	//（线上实测 5525 次），而它的样本库里 5834 条是 source=auto 自动学的、
	// 没人审过。现在 0.11% 很干净，但样本库会持续增长 —— 噪声混进来之后
	// 这条通道会【悄悄】变脏，等主人收到误封反馈时可能已经封了几百个。
	// 有这一屏，谁的误封率抬头立刻看得见，不用靠事后反馈猜。
	// 数据全部来自 ad_pending_snapshots（/ignore 回滚过的记 expires_at=0），
	// 零新增表、零新增查询往返（并进 /adstats 现有的那次 batch）。
	const envAcc = makeEnv();
	await W.adDetectionReady(envAcc);
	const seedSnap = (seq, userId, reasons, expiresAt) => envAcc.DB.prepare(
		'INSERT INTO ad_pending_snapshots (owner_id, seq, user_id, chat_id, score, reasons, snapshot, created_at, expires_at) '
		+ 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
	).bind(OWNER_ID, seq, String(userId), '-100111', 7, JSON.stringify(reasons), '{}',
		Math.floor(Date.now() / 1000), expiresAt).run();
	// 【2026-10-19 乙方案 B 起：只有带【定罪层】归属标记的才算「定罪」】
	// 指纹层：2 条定罪，其中 1 条被 /ignore 回滚 = 误封
	await seedSnap(1, 1001, ['+3 指纹库命中：@adexample', '【定罪层】指纹库'], 9999999999);
	await seedSnap(2, 1002, ['+3 指纹库命中：@adexample2', '【定罪层】指纹库'], 0);   // expires_at=0 = 被 /ignore 回滚 = 误封
	// AI 层：1 条定罪
	await seedSnap(3, 1003, ['AI 语义相似度 0.794 ≥ 阈值 0.78', '【定罪层】AI 语义'], 9999999999);
	// ★ 旧口径的样本：只有加分项、没有任何归属标记 → 改前计入、改后不计。
	// 这正是被修掉的假计数 ——「判据里出现过指纹加分」不等于「被指纹定罪」。
	await seedSnap(4, 1004, ['+3 指纹库命中：@adexample3'], 9999999999);
	// ★ 一条被 AI 定罪、判据里同时含指纹加分 → 改前指纹与 AI 各计一次，改后只归 AI。
	await seedSnap(5, 1005, ['+3 指纹库命中：@adexample4', 'AI 语义相似度 0.80 ≥ 阈值 0.78', '【定罪层】AI 语义'], 9999999999);
	// ★ 同上：只有 AI 加分、没有归属标记 → 改前计入、改后不计。
	await seedSnap(6, 1006, ['AI 语义相似度 0.79 ≥ 阈值 0.78'], 9999999999);
	// 【2026-10-19 补：屏上原来只列五类，另七类标记写了库却没处看】
	// 结构查杀四条通道（judgeAdStructure 的 channel：card / body / identity / quoted）、
	// 名片、正文图片、结构化评分 —— 这七种标签此前一律不在屏上出现。
	// 后果不是报错而是更糟：主人看到的是「结构查杀一条都没定过罪」，
	// 真实情况却可能是它在频繁定罪、只是没有行显示。
	await seedSnap(7, 1007, ['资料卡查杀定罪：…', '【定罪层】资料卡查杀（用户名+简介）'], 9999999999);
	await seedSnap(8, 1008, ['正文查杀定罪：…', '【定罪层】正文查杀（简介+正文）'], 0);   // 误封 1
	await seedSnap(9, 1009, ['身份查杀定罪：…', '【定罪层】identity'], 9999999999);
	await seedSnap(10, 1010, ['引用体查杀定罪：…', '【定罪层】quoted'], 9999999999);
	await seedSnap(11, 1011, ['名片广告定罪：…', '【定罪层】名片'], 9999999999);
	await seedSnap(12, 1012, ['正文图片命中：…', '【定罪层】正文图片'], 9999999999);
	await seedSnap(13, 1013, ['结构化评分 7 ≥ 阈值 6', '【定罪层】结构化评分'], 9999999999);
	calls.length = 0;
	await post({ update_id: 7, message: { message_id: 7, date: 1, text: '/adstats', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: 0, first_name: 'O' } } }, envAcc);
	const accText = sendTextOf('sendMessage').join('\n');
	// 数字用【剥掉 HTML 标签】后的文本匹配 —— 屏上是「定罪 <b>2</b>」，
	// 直接拿原文匹配「定罪 2」永远匹配不到，会把格式问题误报成数据问题。
	const accPlain = accText.replace(/<\/?b>/g, '');
	assert('★ /adstats 报出各通道对账屏', /各通道定罪/.test(accText), accText.slice(0, 300));
	// 改前这两行的数是「指纹 4 / 误封 1 / 25.00%」「AI 3 / 误封 0」——
	// seed 4 与 seed 6 那两条「只有加分项」的被算了进去，seed 5 还让指纹多计一次。
	assert('★ 指纹层：定罪 2 / 误封 1 / 50.00%（只算归属标记）',
		/指纹库命中\s*定罪 2\s*误封 1\s*50\.00%/.test(accPlain),
		(accPlain.match(/指纹库命中[^\n]*/) || ['(没匹配到)'])[0]);
	assert('★ AI 向量层：定罪 2 / 误封 0（只算归属标记）',
		/AI 向量相似度\s*定罪 2\s*误封 0/.test(accPlain),
		(accPlain.match(/AI 向量相似度[^\n]*/) || ['(没匹配到)'])[0]);
	assert('★ 点明误封口径是 /ignore 回滚', /ignore/.test(accText), accPlain.slice(0, 700));
	assert('★ 点明「一条快照只归定它罪的那一层」的归属口径',
		/一条快照只归定它罪的那一层/.test(accPlain), accPlain.slice(0, 900));

	// 【2026-10-19 新增七行的红绿断言：改前这七条一条都不出现】
	// 屏上文案与 tag 不同（tag 是写库的契约、label 是给人看的），逐行核对映射。
	// 正则里「（用户名+简介）」的 `+` 必须转义，否则变成量词、匹配到别的行。
	const rowOf = (label) => (accPlain.match(new RegExp(label + '[^\\n]*')) || ['(没匹配到)'])[0];
	assert('★ 结构查杀·资料卡行出现（定罪 1 / 误封 0）',
		/结构查杀·资料卡（用户名\+简介）\s*定罪 1\s*误封 0/.test(accPlain), rowOf('结构查杀·资料卡'));
	assert('★ 结构查杀·正文行出现（定罪 1 / 误封 1 / 100.00%）',
		/结构查杀·正文（简介\+正文）\s*定罪 1\s*误封 1\s*100\.00%/.test(accPlain), rowOf('结构查杀·正文'));
	// 这两行的 tag 是英文（judgeAdStructure 的 channel 原值，AD_LAYER_LABELS 里没有对应键）。
	// 断言写的是【屏上中文 label】—— 若把 tag 也改成中文，库里已有的标记会分裂成两条，此处必红。
	assert('★ 结构查杀·身份类行出现（tag 是英文 identity）',
		/结构查杀·身份类（昵称\+简介）\s*定罪 1/.test(accPlain), rowOf('结构查杀·身份类'));
	assert('★ 结构查杀·引用体行出现（tag 是英文 quoted）',
		/结构查杀·引用体\s*定罪 1/.test(accPlain), rowOf('结构查杀·引用体'));
	assert('★ 名片广告行出现', /名片广告\s*定罪 1/.test(accPlain), rowOf('名片广告'));
	assert('★ 正文图片行出现', /正文图片命中\s*定罪 1/.test(accPlain), rowOf('正文图片命中'));
	assert('★ 结构化评分行出现', /结构化评分定罪\s*定罪 1/.test(accPlain), rowOf('结构化评分定罪'));
	// 【前缀串扰】'名片' 是「名片广告查杀（显示名+手机号）」的前缀 —— 后者是
	// AD_LAYER_LABELS.contact 的值，只用于 layer 显示、从不写进 reasons，
	// 所以两行不会互相吞。这里钉死：各行只能计到自己的那一条，不能被抬成 2。
	assert('★ 行间无前缀串扰（每类各计一次、互不吞并）',
		!/名片广告\s*定罪 [2-9]/.test(accPlain) && !/正文图片命中\s*定罪 [2-9]/.test(accPlain)
			&& !/结构查杀·正文（简介\+正文）\s*定罪 [2-9]/.test(accPlain),
		accPlain.slice(0, 900));

	// 【2026-10-19 二次改的回归钉子】这条对账 SQL 上一版是「十二类归类全压在 SQL 里」
	// —— 24 个 SUM(CASE WHEN reasons LIKE ? …)。线上实测直接把 D1 底层会话打死，
	// 返回 {"D1_RESET_DO":true}；而 batch 是【一个事务】，一条崩则这次 /adstats 的
	// 十二条统计【整批失败】，屏上一半数字静默变 0 ——「D1 自定义 0 条」与
	// 「生效 51 条」自相矛盾就是这么冒出来的（catch 里只 console.error，屏上不留痕）。
	// 逐条实测把范围卡死了：1 个 LIKE 扫 8600 行 10.62ms、旧版 10 个 LIKE 33.28ms 都正常，
	// 24 个就不行 —— 不是绑定参数超限（内联无参版照样崩），是把 24 次全表 LIKE 求值
	// 压在 D1 一侧太重。现在 SQL 只做一件事：一次 LIKE 把带标记的行捞回来，归类搬进 JS
	// （标记行本来就极少：线上 8598 行快照里只有 36 行）。
	// 下面两条钉的是【形态】而不是数字 —— 数字对了但 SQL 又长回 24 个 LIKE 也算重演。
	const accSql = (envAcc.DB._sql || []).find((s) => s.includes('ad_pending_snapshots') && s.includes('reasons LIKE'));
	assert('★ 对账 SQL 只带 1 个 LIKE 参数（曾 24 个把 D1 会话打死，不许重演）',
		!!accSql && (accSql.match(/\?/g) || []).length === 1, accSql || '(没找到该 SQL)');
	assert('★ 对账 SQL 不再堆 SUM(CASE…) 聚合（求值搬到应用层）',
		!!accSql && !/SUM\s*\(/i.test(accSql), accSql || '(没找到该 SQL)');

	// 一条封禁都没有时不显示 —— 每次 /adstats 都带一块全 0 的表只是噪音
	const envEmpty = makeEnv();
	await W.adDetectionReady(envEmpty);
	calls.length = 0;
	await post({ update_id: 8, message: { message_id: 8, date: 1, text: '/adstats', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: 0, first_name: 'O' } } }, envEmpty);
	const emptyText = sendTextOf('sendMessage').join('\n');
	assert('★ 无定罪记录时不显示对账屏', !/各通道定罪/.test(emptyText), emptyText.slice(0, 300));
}

// ================= [6] 不是位图（.tgs/.webm）不计熔断 =================
section('[6] 非位图失败不计入 failed、不推熔断');
{
	// 【为什么要有这一条】头像与正文图【共用同一套熔断状态】（AD_VISION_FAIL_BREAK=10）。
	// 改前「不是位图」（.tgs 动图贴纸 / .webm 视频贴纸，或存量行存的是本体不是缩略图）
	// 落进 catch 的 else 分支，被当成链路故障：计一次 failed、还累加熔断连续失败数 ——
	// 连着 10 张这类贴纸就把【当天正常图片】的识别一起停掉（它们本属同一条弃用镜头）。
	// 这类失败发生在 ai.run【之前】（sniff 那一步），一个 Neurons 都没花，
	// 重判一百次结果一样，它证明不了链路坏了。
	const env = makeEnv({
		AI: { run: async () => ({ answers: { ad: { type: 'choice', choice: 'clean', probabilities: { ad: 0.05, clean: 0.95 }, confidence: 0.9 } } }) }
	});
	await W.adDetectionReady(env);
	const now = Math.floor(Date.now() / 1000);
	// 15 行而不是 3 行：熔断阈值是 10，行数必须【超过】阈值才能让「改前实现」真的熔断 ——
	// 少于阈值时两种实现的 consec_fail 都停在行数上，断言成假绿（test_avatar_missing 同款教训）。
	for (let i = 0; i < 15; i++) {
		await env.DB.prepare('INSERT INTO ad_avatars (file_unique_id, verdict, hits, file_id, source, last_user_id, vision_checked_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
			.bind('NV' + i, 'pending', 0, 'FID_' + i, null, '8000' + i, 0, now, now).run();
	}

	const origFetch = sandbox.fetch;
	// getFile 一律成功（失败会先落进 isVisionFileMissing 那条路），下载返回【全零字节】——
	// sniffImageMime 认不出任何格式 → 正是「不是位图」这条路径。
	sandbox.fetch = async (url) => {
		const u = String(url);
		if (u.includes('getFile')) {
			return { ok: true, status: 200, async json() { return { ok: true, result: { file_path: 'photos/x.jpg' } }; }, async text() { return '{}'; } };
		}
		return { ok: true, status: 200, async arrayBuffer() { return new Uint8Array(64 * 1024).buffer; }, async json() { return {}; }, async text() { return '{}'; } };
	};
	let stats = null, err = null;
	try { stats = await W.runAdAvatarVision(env, { dailyLimit: 50, batchSize: 10 }); } catch (e) { err = e; }
	sandbox.fetch = origFetch;

	assert('[6-0] 未抛异常', err === null, err && String(err.message).slice(0, 200));
	if (stats) {
		console.log('   stats = ' + JSON.stringify(stats));
		// ★ 核心：不是位图【不】计入 failed —— 改前会 failed=10 → 红
		assert('★ 非位图不计入 failed', Number(stats.failed || 0) === 0, `failed=${stats.failed}`);
		// ★ 有专属计数 —— 改前无此字段、catch 里也无此分支 → 红
		assert('★ 非位图计入 skippedUnsupported', Number(stats.skippedUnsupported || 0) > 0, `skippedUnsupported=${stats.skippedUnsupported}`);
		// ★ 熔断连续失败数未被推高 —— 改前连着 10 张会推到 10 → 红
		const consec = env.DB.query("SELECT value FROM ad_scan_state WHERE key = 'vision_consec_fail'");
		assert('★ 熔断连续失败数未被推高', Number(consec[0]?.value || 0) === 0, JSON.stringify(consec));
		// ★ 未写熔断标记 —— 改前会写下当天日期 → 红
		const broken = env.DB.query("SELECT value FROM ad_scan_state WHERE key = 'vision_broken_day'");
		assert('★ 未写熔断标记（当天正常图不受影响）', !broken.length || !String(broken[0].value || ''), JSON.stringify(broken));
		// 反证：仍推进 vision_checked_at（不无限重试）—— 这条改前改后都应绿。
		// 只断言【本批取走的】—— batchSize=10，剩下 5 行本批根本没被取到，checked_at 仍是 0。
		const bumped = env.DB.query('SELECT COUNT(*) c FROM ad_avatars WHERE vision_checked_at > 0');
		assert('★ 本批取走的 10 行都推进了 vision_checked_at（不无限重试）', Number(bumped[0]?.c || 0) === 10, JSON.stringify(bumped));
		// 台账照记（可诊断）
		assert('★ 非位图仍写失败台账', env.DB.query('SELECT * FROM ad_vision_failures').length > 0);
		// 一个都没进 ai.run：零 Neurons 消耗
		assert('★ 一个都没进入 ai.run（零 Neurons）', Number(stats.done || 0) === 0, JSON.stringify({ done: stats.done, ad: stats.ad, clean: stats.clean }));
	}
}

// ================= [7] 定罪层标记的写入端 =================
section('[7] 定罪层专属标记由判定链写入');
{
	// 先验纯函数契约 —— 别只靠端到端一条断言兜，这一层是新增的。
	assert('★ markAdConvictLayer 插到最前面并返回新数组',
		JSON.stringify(W.markAdConvictLayer(['a'], '头像')) === JSON.stringify(['【定罪层】头像', 'a']),
		JSON.stringify(W.markAdConvictLayer(['a'], '头像')));
	assert('★ 同层名不重复写（叠放链上同一层会被调用两遍）',
		JSON.stringify(W.markAdConvictLayer(['a', '【定罪层】头像'], '头像')) === JSON.stringify(['a', '【定罪层】头像']));
	assert('★ 非数组输入不炸（调用方可能传 undefined）',
		Array.isArray(W.markAdConvictLayer(undefined, 'x')));

	// 端到端：用【种子指纹】让这条消息必定被判成封禁 —— 种子 weight 1.0 > 封禁权重 0.8，
	// 走的是「指纹硬命中」，与评分阈值无关，所以不必构造一串凑分的文本。
	// 【为什么必须端到端】纯函数对不代表判定链真的调了它 —— 本项目踩过
	// 「函数写对了、调用点没接上、断言却仍然在过」的坑。
	const envBan = makeEnv();
	await W.adDetectionReady(envBan);
	const configBan = W.loadAdDetectionConfig(envBan);
	const ev = await W.evaluateAdSuspect(envBan,
		{ profile: { firstName: '测试号', lastName: '', username: 'testuser', bio: '' }, text: '收网赚号 长期收购各类账号' },
		{ config: configBan, whitelist: new Set(), skipMissingBioPenalty: true });
	const marks = (ev.reasons || []).filter((r) => String(r).startsWith('【定罪层】'));
	console.log('   verdict=' + ev.verdict + ' layer=' + ev.layer + ' marks=' + JSON.stringify(marks));
	assert('★ 前置：这条消息确实被判成封禁（否则后面的断言没意义）',
		ev.verdict === 'ban', JSON.stringify({ verdict: ev.verdict, score: ev.score }));
	assert('★ 定罪时写入且只写入【一条】归属标记',
		marks.length === 1, JSON.stringify(ev.reasons));
	// 层名表要从源码里取 —— vm 里顶层 const 不挂 globalThis（与 [3] 段取冷却常量同理）。
	// 【为什么不在这里抄一份期望表】抄一份等于把同一张表维护两遍：源码里改了层名，
	// 标记跟着变、测试里那份没变，断言照样绿 —— 那就成了「只验证能解析」。
	const layerLabels = {};
	{
		const block = (src.match(/const AD_LAYER_LABELS = \{[\s\S]*?\n\};/) || [''])[0];
		for (const m of block.matchAll(/(\w+):\s*'([^']*)'/g)) layerLabels[m[1]] = m[2];
	}
	assert('★ 前置：源码里的层名表解析出来了', Object.keys(layerLabels).length >= 5, JSON.stringify(layerLabels));
	assert('★ 归属标记的层名与 evaluation.layer 一致',
		marks[0] === '【定罪层】' + (layerLabels[ev.layer] || ev.layer),
		String(marks[0]) + ' layer=' + String(ev.layer) + ' table=' + JSON.stringify(layerLabels));
	// 【快照落库会截断】allocateAdPendingSnapshot 写库时是
	// JSON.stringify(reasons).slice(0, 2000)，/pending 复核也只渲染前 10 条 ——
	// 归属标记必须排在最前面，否则被截掉之后对账那一屏会【静默显示成 0】，
	// 比抛错更难查（本项目对「静默」的教训已经栽过好几次）。
	assert('★ 归属标记在 reasons 最前面（否则会被 2000 字符截断掉）',
		ev.reasons[0] === marks[0], JSON.stringify({ first: ev.reasons[0], mark: marks[0] }));
	console.log('   reasons 序列化长度 = ' + JSON.stringify(ev.reasons).length + '（落库上限 2000）');
	// 反证：没定罪的消息不该有任何归属标记
	const evPass = await W.evaluateAdSuspect(envBan,
		{ profile: { firstName: '路人甲', lastName: '', username: 'normalguy', bio: '' }, text: '今天天气不错 大家下午好' },
		{ config: configBan, whitelist: new Set(), skipMissingBioPenalty: true });
	const passMarks = (evPass.reasons || []).filter((r) => String(r).startsWith('【定罪层】'));
	assert('★ 未定罪的消息不写归属标记',
		evPass.verdict !== 'ban' && passMarks.length === 0,
		JSON.stringify({ verdict: evPass.verdict, marks: passMarks }));
}

console.log(`\n========== ${pass} 通过 / ${fail} 失败 ==========`);
if (failures.length) console.log('失败项：\n  - ' + failures.join('\n  - '));
process.exit(fail ? 1 : 0);
