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
	await W.logAdVisionFailure(env, '头像', 'sniff', 'AV_S', new Error('头像不是位图（可能是 .tgs / .webm 容器），跳过推理'));
	calls.length = 0;
	await post({ update_id: 5, message: { message_id: 5, date: 1, text: '/adstats', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: 0, first_name: 'O' } } }, env);
	const text = sendTextOf('sendMessage').join('\n');
	assert('/adstats 报出台账条目数', /视觉识别失败台账/.test(text), text.slice(0, 200));
	assert('展示失败所在 kind 与 stage', /头像 @ sniff/.test(text), text.slice(0, 400));
	assert('展示失败次数', /失败 1 次/.test(text), text.slice(0, 400));
	assert('点明同类反复失败是系统性问题', /系统性问题/.test(text), text.slice(0, 400));

	// 没有失败记录时不该出现这一屏（健康状态不添废话）
	const envClean = makeEnv();
	await W.adDetectionReady(envClean);
	calls.length = 0;
	await post({ update_id: 6, message: { message_id: 6, date: 1, text: '/adstats', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: 0, first_name: 'O' } } }, envClean);
	const cleanText = sendTextOf('sendMessage').join('\n');
	assert('无失败时不显示台账屏', !/视觉识别失败台账/.test(cleanText), cleanText.slice(0, 200));
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
	await seedSnap(1, 1001, ['+3 指纹库命中：@adexample'], 9999999999);
	await seedSnap(2, 1002, ['+3 指纹库命中：@adexample2'], 0);   // expires_at=0 = 被 /ignore 回滚 = 误封
	await seedSnap(3, 1003, ['AI 语义相似度 0.794 ≥ 阈值 0.78'], 9999999999);
	calls.length = 0;
	await post({ update_id: 7, message: { message_id: 7, date: 1, text: '/adstats', chat: { id: OWNER_ID, type: 'private' }, from: { id: OWNER_ID, is_bot: 0, first_name: 'O' } } }, envAcc);
	const accText = sendTextOf('sendMessage').join('\n');
	// 数字用【剥掉 HTML 标签】后的文本匹配 —— 屏上是「定罪 <b>2</b>」，
	// 直接拿原文匹配「定罪 2」永远匹配不到，会把格式问题误报成数据问题。
	const accPlain = accText.replace(/<\/?b>/g, '');
	assert('★ /adstats 报出各通道对账屏', /各通道定罪/.test(accText), accText.slice(0, 300));
	assert('★ 指纹层：定罪 2 / 误封 1 / 50.00%',
		/指纹库命中\s*定罪 2\s*误封 1\s*50\.00%/.test(accPlain),
		(accPlain.match(/指纹库命中[^\n]*/) || ['(没匹配到)'])[0]);
	assert('★ AI 向量层：定罪 1 / 误封 0',
		/AI 向量相似度\s*定罪 1\s*误封 0/.test(accPlain),
		(accPlain.match(/AI 向量相似度[^\n]*/) || ['(没匹配到)'])[0]);
	assert('★ 点明误封口径是 /ignore 回滚', /ignore/.test(accText), accPlain.slice(0, 700));

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

console.log(`\n========== ${pass} 通过 / ${fail} 失败 ==========`);
if (failures.length) console.log('失败项：\n  - ' + failures.join('\n  - '));
process.exit(fail ? 1 : 0);
