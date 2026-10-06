// 正文图片检测（早退闸门 + L1 指纹 + L2 视觉识别）离线端到端测试。
// 与 test_avatar.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_ad_image.mjs

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

// ---------- D1 兼容层（真实 SQLite，附 SQL 日志供热路径断言）----------
function makeD1() {
	const db = new DatabaseSync(':memory:');
	const _sql = [];
	const normIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const k of Object.keys(row)) out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
		return out;
	};
	const exec = (sql, params = []) => {
		_sql.push(sql);
		const st = db.prepare(sql);
		const bound = params.map(normIn);
		const head = sql.trim().slice(0, 7).toUpperCase();
		if (head.startsWith('SELECT') || head.startsWith('PRAGMA')) {
			// results 与 rows 同时给：batch 走 results（看板 / 计数那批查询读它），
			// first / all 走 rows。只给 rows 的话 batch 取到的全是 undefined。
			const rows = st.all(...bound).map(normOut);
			return { kind: 'rows', rows, results: rows };
		}
		const info = st.run(...bound);
		return { kind: 'run', meta: {}, results: [{ success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }] };
	};
	return {
		_sql,
		prepare(sql) {
			const stmtFor = (args) => ({
				all: async () => ({ results: exec(sql, args).rows || [], success: true }),
				first: async () => (exec(sql, args).rows || [])[0] ?? null,
				run: async () => exec(sql, args),
				bind: (...more) => stmtFor(more)
			});
			return stmtFor([]);
		},
		exec: async (sql) => { _sql.push(sql); db.exec(sql); return { results: [], success: true }; },
		// 必须 await：不 await 会返回 Promise 数组，batch[i] 变成空对象 {},
		// 看板那批 GROUP BY 查询会静默读成 0（计数断言全红而查库明明正常）。
		batch: async (stmts) => Promise.all(stmts.map((st) => st.run())),
		query(sql, ...params) { _sql.push(sql); return db.prepare(sql).all(...params).map(normOut); }
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
function resetCalls() { calls.length = 0; setApi(); try { W.invalidateAdAdminCache(); } catch { /* W 未初始化 */ } }
function countCalls(method) { return calls.filter((c) => c.method === method).length; }

const FAKE_IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777000, is_bot: true, username: 'ImageTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 6000 + calls.length } };
		case 'getChat': return { ok: true, result: { id: body?.chat_id, first_name: '未知', bio: '' } };
		case 'getChatMember': return { ok: true, result: { status: 'member', user: { id: body?.user_id } } };
		case 'getChatAdministrators': return { ok: true, result: [] };
		case 'getFile': return { ok: true, result: { file_id: body?.file_id, file_path: 'photos/file_1.jpg' } };
		default: return { ok: true, result: true };
	}
}

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const raw = String(url);
		const isFileDownload = raw.includes('/file/bot');
		const method = isFileDownload ? 'downloadFile' : raw.split('/').pop();
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
			async text() { return JSON.stringify(payload); },
			async arrayBuffer() { return FAKE_IMAGE.buffer; }
		};
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });

const W = sandbox;
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
	return handler.fetch(request, env, { waitUntil(p) { pendingWaits.push(Promise.resolve(p).catch(() => {})); } });
}

function privateMessage(fromId, text) {
	return {
		message_id: 100 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000), text,
		chat: { id: fromId, type: 'private', first_name: 'Owner' },
		from: { id: fromId, is_bot: false, first_name: 'Owner' }
	};
}
function groupMessage(from, text, extra = {}) {
	return {
		message_id: 200 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000), text,
		chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
		from: { is_bot: false, ...from },
		...extra
	};
}
// 裸图片消息：text 与 caption 都不设 —— 这正是缺口本体（旧早退闸门会把它整体丢弃）。
function barePhotoMessage(from, fileUniqueId, fileId, extra = {}) {
	return groupMessage(from, undefined, {
		photo: [{ file_id: fileId, file_unique_id: fileUniqueId, width: 90, height: 60 }],
		...extra
	});
}
async function send(msg, env) {
	return sendUpdate({ message: msg }, env);
}

const handler = W.__handler;
const bootEnv = makeEnv();
resetCalls();
await sendUpdate({ message: privateMessage(99999, 'hello') }, bootEnv);

// ================= [1] 表结构与 extractAdMedia =================
section('[1] ad_images 表与 extractAdMedia');
{
	const env = makeEnv();
	const ready = await W.adDetectionReady(env);
	assert('adDetectionReady 成功', ready === true, String(ready));
	const tables = env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ad_images'");
	assert('ad_images 表已建', tables.length === 1, JSON.stringify(tables));
	const cols = env.DB.query("PRAGMA table_info(ad_images)").map((r) => r.name).join(',');
	assert('含 kind 列（图片与头像唯一的结构差异）', cols.includes('kind'), cols);
	assert('主键仍是 file_unique_id', cols.startsWith('file_unique_id,'), cols);

	// photo 是升序尺寸数组，取最后一项 = 最大尺寸
	const p = W.extractAdMedia({ photo: [
		{ file_id: 'a', file_unique_id: 'U_SMALL' },
		{ file_id: 'b', file_unique_id: 'U_BIG' }
	] });
	assert('photo 取最大尺寸那一项', p?.kind === 'photo' && p.fileUniqueId === 'U_BIG' && p.fileId === 'b', JSON.stringify(p));

	assert('sticker 能取', W.extractAdMedia({ sticker: { file_id: 's', file_unique_id: 'U_STK' } })?.kind === 'sticker');
	assert('animation 能取', W.extractAdMedia({ animation: { file_id: 'g', file_unique_id: 'U_ANI' } })?.kind === 'animation');
	assert('video 能取', W.extractAdMedia({ video: { file_id: 'v', file_unique_id: 'U_VID' } })?.kind === 'video');
	assert('document 能取', W.extractAdMedia({ document: { file_id: 'd', file_unique_id: 'U_DOC' } })?.kind === 'document');
	assert('纯文本消息返回 null（不触发任何图片判据）', W.extractAdMedia({ text: '你好' }) === null);
	assert('没有 file_unique_id 的媒体返回 null', W.extractAdMedia({ photo: [{ file_id: 'x' }] }) === null);
	assert('空消息返回 null', W.extractAdMedia(null) === null);
}

// ================= [2] 分档判据（纯函数，比头像严一档） =================
section('[2] applyImageVerdict 分档（比头像严一档）');
{
	const adRow = (hits) => ({ verdict: 'ad', hits });
	const cleanBase = { verdict: 'pass', score: 0, reasons: [] };
	const withEvidence = { verdict: 'observe', score: 3, reasons: ['+3 正文交易动词'] };

	assert('图片 ad + 本次零判据 → 只进观察（单证不定罪）',
		W.applyImageVerdict({ ...cleanBase }, adRow(1)).verdict === 'observe');
	assert('图片 ad + 复用 4 次 → 仍只观察（头像在 2 次就单独定罪）',
		W.applyImageVerdict({ ...cleanBase }, adRow(4)).verdict === 'observe',
		W.applyImageVerdict({ ...cleanBase }, adRow(4)).verdict);
	assert('同一行喂给头像判据 → ban（证实两层门槛确实不同）',
		W.applyAvatarVerdict({ ...cleanBase }, adRow(4)).verdict === 'ban',
		W.applyAvatarVerdict({ ...cleanBase }, adRow(4)).verdict);
	assert('图片 ad + 复用 >= 5 次 → 单独即可封',
		W.applyImageVerdict({ ...cleanBase }, adRow(5)).verdict === 'ban');
	assert('图片 ad + 本次已有判据 → 封（互相印证）',
		W.applyImageVerdict({ ...withEvidence }, adRow(1)).verdict === 'ban');
	assert('clean → 原样返回，一个字节不改',
		W.applyImageVerdict({ ...cleanBase }, { verdict: 'clean', hits: 0 }).verdict === 'pass');
	assert('pending → 原样返回',
		W.applyImageVerdict({ ...cleanBase }, { verdict: 'pending', hits: 0 }).verdict === 'pass');
	const marked = W.applyImageVerdict({ ...withEvidence }, adRow(9));
	assert('score 只作展示、不被改写（防与历史分重复计分）', marked.score === 3, String(marked.score));
	assert('reasons 追加了图片那一行', marked.reasons.some((r) => r.includes('消息图片命中广告素材库')), JSON.stringify(marked.reasons));
}

// ================= [3] 早退闸门：裸图片消息进检测（缺口本体） =================
section('[3] 早退闸门：裸图片消息不再被整体丢弃');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();

	// 旧闸门只认 text / 转发 / 引用体 / 名片显示名 —— 这条消息四样全空，
	// 会在 detectAdOnMessage 的第一道 return 处被丢弃，连名册都不进。
	await send(barePhotoMessage({ id: 424242, first_name: '发图的人' }, 'IMG_BARE_1', 'FILE_BARE_1'), env);

	const row = env.DB.query('SELECT verdict, kind, file_id FROM ad_images WHERE file_unique_id = ?', 'IMG_BARE_1');
	assert('裸图片消息走进了检测（ad_images 登记为 pending）', row.length === 1 && row[0].verdict === 'pending', JSON.stringify(row));
	assert('kind 记为 photo', row[0]?.kind === 'photo', JSON.stringify(row));
	assert('file_id 存下来供 L2 下载', row[0]?.file_id === 'FILE_BARE_1', JSON.stringify(row));

	// 同款第二条：表里已有行 → 只读不写，不再产生 INSERT
	env.DB._sql.length = 0;
	await send(barePhotoMessage({ id: 424242, first_name: '发图的人' }, 'IMG_BARE_1', 'FILE_BARE_1'), env);
	const inserts = env.DB._sql.filter((s) => s.startsWith('INSERT INTO ad_images'));
	assert('同款第二次只读不写（稳定态零额外写入）', inserts.length === 0, JSON.stringify(inserts));

	// 带 caption 的图片消息走文本链路，同样要能取到媒体
	const env2 = makeEnv();
	await W.adDetectionReady(env2);
	await send(barePhotoMessage({ id: 424243, first_name: '带说明' }, 'IMG_CAP_1', 'FILE_CAP_1', { caption: '看看这个' }), env2);
	assert('带 caption 的图片也登记（caption 走文本、媒体走指纹，两条互补）',
		env2.DB.query('SELECT verdict FROM ad_images WHERE file_unique_id = ?', 'IMG_CAP_1').length === 1);

	// 无媒体的纯文本消息不得凭空写出图片行
	const env3 = makeEnv();
	await W.adDetectionReady(env3);
	await send(groupMessage({ id: 424244, first_name: '只说话' }, '今天天气不错'), env3);
	assert('纯文本消息不会产生 ad_images 行',
		env3.DB.query('SELECT COUNT(*) AS c FROM ad_images')[0].c === 0,
		JSON.stringify(env3.DB.query('SELECT * FROM ad_images')));
}

// ================= [4] L1 指纹：命中与登记 =================
section('[4] readAdImage / loadAdImageForMessage');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	assert('未入库读出 null（= 未判，不是 clean）', (await W.readAdImage(env, 'NOPE')) === null);

	// hits 只能由 learnAdImageOnBan 累加 —— upsert 与头像表同口径，INSERT 时恒为 0。
	for (let i = 0; i < 7; i += 1) await W.learnAdImageOnBan(env, 'IMG_L1_1', String(900000 + i));
	const got = await W.readAdImage(env, 'IMG_L1_1');
	assert('入库后读得回 verdict 与 hits', got?.verdict === 'ad' && Number(got.hits) === 7, JSON.stringify(got));

	const base = { verdict: 'pass', score: 0, reasons: [], payload: {} };
	const applied = W.applyImageVerdict({ ...base, payload: {} }, got);
	assert('命中 ad + 复用 7 次 → 封', applied.verdict === 'ban', applied.verdict);

	// 没有媒体 → 不读库（热路径预算的关键）
	env.DB._sql.length = 0;
	const noMedia = await W.loadAdImageForMessage(env, null, '999');
	assert('无媒体返回 null', noMedia === null);
	assert('无媒体时零 D1 读', env.DB._sql.length === 0, JSON.stringify(env.DB._sql));

	// 首次见到 → 登记 pending 并返回 null（未入库 ≠ clean，不参与裁决）
	const firstSeen = await W.loadAdImageForMessage(env, { kind: 'photo', fileUniqueId: 'IMG_NEW_1', fileId: 'F_NEW' }, '999');
	assert('首次见到返回 null（未判，不参与裁决）', firstSeen === null, JSON.stringify(firstSeen));
	assert('首次见到登记为 pending（L2 才有队列可取）',
		env.DB.query('SELECT verdict FROM ad_images WHERE file_unique_id = ?', 'IMG_NEW_1')[0]?.verdict === 'pending');
	const secondSeen = await W.loadAdImageForMessage(env, { kind: 'photo', fileUniqueId: 'IMG_NEW_1', fileId: 'F_NEW' }, '999');
	assert('第二次同款读得回行', secondSeen?.verdict === 'pending', JSON.stringify(secondSeen));
}

// ================= [5] 热路径 SQL 预算 =================
section('[5] 热路径：纯文本消息不多读 ad_images');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();
	// 先跑一条把各层运行期缓存热起来，再量稳定态。
	await send(groupMessage({ id: 55001, first_name: '甲' }, '大家早上好啊今天心情不错'), env);
	env.DB._sql.length = 0;
	await send(groupMessage({ id: 55002, first_name: '乙' }, '是啊阳光挺好的适合出门'), env);
	const imageReads = env.DB._sql.filter((s) => s.includes('ad_images'));
	assert('稳定态纯文本消息零 ad_images 查询', imageReads.length === 0, JSON.stringify(imageReads));

	// 带 caption 的图片消息会读一次（它确实有媒体），但不得重复读
	env.DB._sql.length = 0;
	await send(barePhotoMessage({ id: 55003, first_name: '丙' }, 'IMG_STEADY', 'FILE_STEADY', { caption: '看这个' }), env);
	const steadyReads = env.DB._sql.filter((s) => s.includes('FROM ad_images'));
	assert('单条图片消息只读一次 ad_images', steadyReads.length === 1, JSON.stringify(steadyReads));
}

// ================= [6] L2 视觉识别 =================
section('[6] runAdImageVision · 队列 / kind 过滤 / 熔断 / 关闭');
{
	// 6.1 未绑 AI → 跳过推理
	const envNoAI = makeEnv();
	await W.adDetectionReady(envNoAI);
	await W.upsertAdImage(envNoAI, 'IMG_NOAI_1', { verdict: 'pending', fileId: 'F_NOAI', kind: 'photo' });
	resetCalls();
	const noAi = await W.runAdImageVision(envNoAI);
	assert('未绑 Workers AI → 跳过推理并说明原因', noAi.skipped === 'no_ai', JSON.stringify(noAi));
	assert('未绑 AI 时不调 getFile', countCalls('getFile') === 0, 'getFile=' + countCalls('getFile'));

	// 6.2 kind 过滤：动图 / 视频 / 文件不进推理队列（moondream 只吃静态位图）
	const envKind = makeEnv({ AI: { run: async () => ({ answer: '{"ad":true,"text":"点我一下","reason":"引流图"}' }) } });
	await W.adDetectionReady(envKind);
	await W.upsertAdImage(envKind, 'IMG_K_PHOTO', { verdict: 'pending', fileId: 'F_PH', kind: 'photo' });
	await W.upsertAdImage(envKind, 'IMG_K_ANIM', { verdict: 'pending', fileId: 'F_AN', kind: 'animation' });
	await W.upsertAdImage(envKind, 'IMG_K_VID', { verdict: 'pending', fileId: 'F_VD', kind: 'video' });
	await W.upsertAdImage(envKind, 'IMG_K_DOC', { verdict: 'pending', fileId: 'F_DC', kind: 'document' });
	await W.upsertAdImage(envKind, 'IMG_K_STK', { verdict: 'pending', fileId: 'F_ST', kind: 'sticker' });
	resetCalls();
	const kindStats = await W.runAdImageVision(envKind);
	assert('队列只取 photo 与 sticker（4 张里取 2）', kindStats.queued === 2, JSON.stringify(kindStats));
	assert('只调了 2 次 getFile', countCalls('getFile') === 2, 'getFile=' + countCalls('getFile'));
	const animRow = envKind.DB.query('SELECT verdict, vision_checked_at FROM ad_images WHERE file_unique_id = ?', 'IMG_K_ANIM')[0];
	assert('动图永远留在 pending 且不被反复取出', animRow.verdict === 'pending' && Number(animRow.vision_checked_at) === 0, JSON.stringify(animRow));
	assert('photo 判成 ad', envKind.DB.query('SELECT verdict FROM ad_images WHERE file_unique_id = ?', 'IMG_K_PHOTO')[0]?.verdict === 'ad');
	assert('来源标记 vision', envKind.DB.query('SELECT source FROM ad_images WHERE file_unique_id = ?', 'IMG_K_PHOTO')[0]?.source === 'vision');

	// 6.3 日预算：额度用尽 → 直接返回，不再取队列
	const envBudget = makeEnv({ AI: { run: async () => ({ answer: '{"ad":false,"text":"","reason":"风景照"}' }) } });
	await W.adDetectionReady(envBudget);
	await W.upsertAdImage(envBudget, 'IMG_BUD_1', { verdict: 'pending', fileId: 'F_BUD', kind: 'photo' });
	resetCalls();
	const off = await W.runAdImageVision(envBudget, { dailyLimit: 0 });
	assert('AD_IMAGE_VISION_DAILY=0 → 关闭 L2', off.skipped === 'disabled', JSON.stringify(off));
	assert('关闭时零 getFile', countCalls('getFile') === 0, 'getFile=' + countCalls('getFile'));
	assert('关闭后仍保留 L1 登记的 pending 行',
		envBudget.DB.query('SELECT verdict FROM ad_images WHERE file_unique_id = ?', 'IMG_BUD_1')[0]?.verdict === 'pending');

	// 6.4 失败也推进 vision_checked_at（防反复烧额度）
	const envFail = makeEnv({ AI: { run: async () => ({ answer: '抱歉我判断不了' }) } });
	await W.adDetectionReady(envFail);
	await W.upsertAdImage(envFail, 'IMG_FAIL_1', { verdict: 'pending', fileId: 'F_FAIL', kind: 'photo' });
	const failStats = await W.runAdImageVision(envFail);
	assert('回答无法解析 → 计入 failed 且不写 ad', failStats.failed === 1 && failStats.ad === 0, JSON.stringify(failStats));
	const failRow = envFail.DB.query('SELECT verdict, vision_checked_at FROM ad_images WHERE file_unique_id = ?', 'IMG_FAIL_1')[0];
	assert('失败同样推进 vision_checked_at（不重复取同一条烧额度）',
		failRow.verdict === 'pending' && Number(failRow.vision_checked_at) > 0, JSON.stringify(failRow));
	resetCalls();
	const second = await W.runAdImageVision(envFail);
	assert('失败项不会被第二轮再取出来', second.queued === 0, JSON.stringify(second));

	// 6.5 状态键与头像互不挤占
	const envQuota = makeEnv({ AI: { run: async () => ({ answer: '{"ad":false,"text":"","reason":"普通图"}' }) } });
	await W.adDetectionReady(envQuota);
	await W.upsertAdImage(envQuota, 'IMG_QUOTA_1', { verdict: 'pending', fileId: 'F_Q', kind: 'photo' });
	await W.runAdImageVision(envQuota, { dailyLimit: 1 });
	const quota = await W.readImageVisionQuota(envQuota, Math.floor(Date.now() / 1000));
	assert('图片额度记在 img_* 键上', quota.used === 1, JSON.stringify(quota));
	assert('头像额度键未被占用',
		(await W.readAdScanState(envQuota, 'avatar_count', '0')) === '0');
}

// ================= [7] 定罪即学习 =================
section('[7] learnAdImageOnBan / clearAdImageOnIgnore');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	await W.learnAdImageOnBan(env, 'IMG_LEARN_1', '777001');
	let row = env.DB.query('SELECT verdict, hits, source FROM ad_images WHERE file_unique_id = ?', 'IMG_LEARN_1')[0];
	assert('首次学习 → ad / hits=1 / source=learned', row?.verdict === 'ad' && Number(row.hits) === 1 && row.source === 'learned', JSON.stringify(row));
	await W.learnAdImageOnBan(env, 'IMG_LEARN_1', '777002');
	row = env.DB.query('SELECT hits FROM ad_images WHERE file_unique_id = ?', 'IMG_LEARN_1')[0];
	assert('复用定罪累加 hits', Number(row.hits) === 2, JSON.stringify(row));

	// /ignore 纠错：转 clean 并清零，防同款图连坐
	await W.clearAdImageOnIgnore(env, 'IMG_LEARN_1');
	row = env.DB.query('SELECT verdict, hits, source FROM ad_images WHERE file_unique_id = ?', 'IMG_LEARN_1')[0];
	assert('/ignore 后 → clean / hits=0 / source=manual', row?.verdict === 'clean' && Number(row.hits) === 0 && row.source === 'manual', JSON.stringify(row));
	const base = { verdict: 'ban', score: 5, reasons: ['+5 判据'] };
	assert('clean 之后不再影响裁决（连坐已断）', W.applyImageVerdict({ ...base }, row).verdict === 'ban', JSON.stringify(W.applyImageVerdict({ ...base }, row)));

	// 快照 → 载荷：imageId 必须还原出来，否则 /ignore 找不到该清哪一行
	const restored = W.adPayloadFromSnapshot({ snapshot: { imageId: 'IMG_FROM_SNAP' } });
	assert('快照还原出 imageId', restored.imageId === 'IMG_FROM_SNAP', JSON.stringify(restored));
	const legacy = W.adPayloadFromSnapshot({ snapshot: {} });
	assert('老快照无此字段 → 空串（回滚端自动跳过）', legacy.imageId === '', JSON.stringify(legacy));
}

// ================= [8] 定罪链路：payload.imageId 跟着走 =================
section('[8] evaluateAdSuspect 把 media 写进 payload');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const config = await W.loadAdDetectionConfig(env);
	const whitelist = await W.loadAdDomainWhitelist(env);
	const media = { kind: 'photo', fileUniqueId: 'IMG_PAYLOAD_1', fileId: 'F_P1' };
	const withMedia = await W.evaluateAdSuspect(env,
		{ profile: { bio: '', firstName: '张三', username: '', bioFetched: true }, text: '', quotedText: '', forwardChat: null, media },
		{ config, whitelist, skipMissingBioPenalty: false });
	assert('payload.imageId 取自 media', withMedia.payload.imageId === 'IMG_PAYLOAD_1', JSON.stringify(withMedia.payload.imageId));
	assert('snapshot.imageId 同步带上（/ignore 回滚外键）', withMedia.snapshot.imageId === 'IMG_PAYLOAD_1', JSON.stringify(withMedia.snapshot.imageId));
	assert('不进语义文本（图片标识喂给文本判据是噪声）',
		!String(W.buildAdSampleText(withMedia.payload)).includes('IMG_PAYLOAD_1'), W.buildAdSampleText(withMedia.payload));

	const noMedia = await W.evaluateAdSuspect(env,
		{ profile: { bio: '', firstName: '李四', username: '', bioFetched: true }, text: '普通聊天', quotedText: '', forwardChat: null },
		{ config, whitelist, skipMissingBioPenalty: false });
	assert('不传 media 的调用方 imageId 为空串（入群线 / cron / 各命令行为不变）',
		noMedia.payload.imageId === '' && noMedia.snapshot.imageId === '', JSON.stringify(noMedia.payload.imageId));
}

// ================= [9] 看板 =================
section('[9] /adstats 展示正文图片指纹');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	await W.upsertAdImage(env, 'IMG_BOARD_1', { verdict: 'ad', hits: 3, kind: 'photo' });
	await W.upsertAdImage(env, 'IMG_BOARD_2', { verdict: 'pending', fileId: 'F_B2', kind: 'photo' });
	await W.upsertAdImage(env, 'IMG_BOARD_3', { verdict: 'clean', kind: 'photo' });
	resetCalls();
	await send(privateMessage(OWNER_ID, '/adstats'), env);
	const sent = calls.filter((c) => c.method === 'sendMessage')
		.map((c) => c.body?.text || '').join('\n');
	assert('有「正文图片指纹」标题行', sent.includes('正文图片指纹'), sent.slice(0, 400));
	assert('广告图计数正确', /正文图片指纹<\/b>　广告图 <b>1<\/b>/.test(sent), sent.slice(0, 600));
	assert('待识别与已排除分列', /待识别 <b>1<\/b>　已排除 <b>1<\/b>/.test(sent), sent.slice(0, 600));
	assert('默认开启时显示每日上限', sent.includes('每日上限 300'), sent.slice(0, 900));
	assert('注明只判 photo / sticker（其余载体靠 L1）', sent.includes('只判 photo / sticker'), sent.slice(0, 900));

	// 关闭分支：AD_IMAGE_VISION_DAILY=0 时要把变量名显示出来，主人照着改才找得到。
	const envOff = makeEnv({ AD_IMAGE_VISION_DAILY: '0' });
	await W.adDetectionReady(envOff);
	resetCalls();
	await send(privateMessage(OWNER_ID, '/adstats'), envOff);
	const sentOff = calls.filter((c) => c.method === 'sendMessage')
		.map((c) => c.body?.text || '').join('\n');
	assert('关闭时显示 AD_IMAGE_VISION_DAILY=0', sentOff.includes('AD_IMAGE_VISION_DAILY=0'), sentOff.slice(0, 900));
	assert('关闭时说明「只跑图片指纹，不调模型」', sentOff.includes('只跑图片指纹，不调模型'), sentOff.slice(0, 900));
}

// ================= 汇总 =================
console.log(`\n===== 正文图片检测测试：通过 ${pass} / 失败 ${fail} =====`);
if (fail > 0) {
	console.log('失败项：');
	for (const name of failures) console.log('  - ' + name);
	process.exit(1);
}
