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
	// ===== visionFileId：真正该下载给模型的那个（批次 A 的核心）=====
	// photo 本体是 jpeg，直接下本体
	assert('photo 的 visionFileId = 本体', p.visionFileId === 'b', JSON.stringify(p));

	// 静态贴纸（is_animated=false / is_video=false）本体是 .webp，也是位图 → 下本体
	const staticSticker = W.extractAdMedia({ sticker: {
		file_id: 'STK_BODY', file_unique_id: 'U_STK_STATIC', is_animated: false, is_video: false
	} });
	assert('静态贴纸 visionFileId = 本体', staticSticker.visionFileId === 'STK_BODY', JSON.stringify(staticSticker));

	// animated 贴纸本体是 .tgs（Lottie 容器，不是位图）→ 必须改下 thumbnail
	// （官方原文：Sticker thumbnail in the .WEBP or .JPG format）
	const animSticker = W.extractAdMedia({ sticker: {
		file_id: 'STK_TGS', file_unique_id: 'U_STK_ANIM', is_animated: true, is_video: false,
		thumbnail: { file_id: 'STK_THUMB' }
	} });
	assert('animated 贴纸 visionFileId = thumbnail 而非本体',
		animSticker.visionFileId === 'STK_THUMB' && animSticker.fileId === 'STK_TGS', JSON.stringify(animSticker));

	// video 贴纸本体是 .webm → 同样走 thumbnail
	const videoSticker = W.extractAdMedia({ sticker: {
		file_id: 'STK_WEBM', file_unique_id: 'U_STK_VIDEO', is_animated: false, is_video: true,
		thumbnail: { file_id: 'STK_THUMB2' }
	} });
	assert('video 贴纸 visionFileId = thumbnail', videoSticker.visionFileId === 'STK_THUMB2', JSON.stringify(videoSticker));

	// 没有 thumbnail 的 animated 贴纸 → 空串，队列条件 file_id != '' 会把它挡在外面
	// （宁可不判，也不能给它一次必然失败、失败后永久跳过的推理）
	const noThumb = W.extractAdMedia({ sticker: {
		file_id: 'STK_TGS2', file_unique_id: 'U_STK_NOTHUMB', is_animated: true, is_video: false
	} });
	assert('animated 且无 thumbnail → visionFileId 为空（不进推理队列）', noThumb.visionFileId === '', JSON.stringify(noThumb));

	// document 格式未知，本体一律不下
	const doc = W.extractAdMedia({ document: { file_id: 'DOC_1', file_unique_id: 'U_DOC_1' } });
	assert('document 不下本体 → visionFileId 为空', doc.visionFileId === '', JSON.stringify(doc));
	// animation 本体是 GIF/H.264，非位图；官方 Animation 有 thumbnail
	const anim = W.extractAdMedia({ animation: {
		file_id: 'GIF_1', file_unique_id: 'U_ANI_1', thumbnail: { file_id: 'GIF_THUMB' }
	} });
	assert('animation visionFileId = thumbnail', anim.visionFileId === 'GIF_THUMB', JSON.stringify(anim));

	assert('sticker 能取', W.extractAdMedia({ sticker: { file_id: 's', file_unique_id: 'U_STK' } })?.kind === 'sticker');
	assert('animation 能取', W.extractAdMedia({ animation: { file_id: 'g', file_unique_id: 'U_ANI' } })?.kind === 'animation');
	assert('video 能取', W.extractAdMedia({ video: { file_id: 'v', file_unique_id: 'U_VID' } })?.kind === 'video');
	assert('document 能取', W.extractAdMedia({ document: { file_id: 'd', file_unique_id: 'U_DOC' } })?.kind === 'document');
	assert('纯文本消息返回 null（不触发任何图片判据）', W.extractAdMedia({ text: '你好' }) === null);
	assert('没有 file_unique_id 的媒体返回 null', W.extractAdMedia({ photo: [{ file_id: 'x' }] }) === null);
	assert('空消息返回 null', W.extractAdMedia(null) === null);

	// ===== sniffImageMime：按字节头认格式，认不出就返回 null =====
	const bytes = (...arr) => new Uint8Array(arr);
	const riff = (...tail) => new Uint8Array([...[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0], ...tail, 0, 0, 0, 0]);
	assert('PNG 头 → image/png',
		W.sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0)) === 'image/png');
	assert('JPEG 头 → image/jpeg',
		W.sniffImageMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0)) === 'image/jpeg');
	assert('WEBP 头 → image/webp',
		W.sniffImageMime(riff(0x57, 0x45, 0x42, 0x50)) === 'image/webp');
	assert('GIF 头 → image/gif',
		W.sniffImageMime(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0)) === 'image/gif');
	// .tgs 是 gzip 压的 Lottie JSON（头 1F 8B）、.webm 是 EBML（头 1A 45 DF A3）
	// —— 两者都不是位图，返回 null 让调用方跳过推理，而不是喂错格式去烧额度
	assert('.tgs(gzip) 不是位图 → null',
		W.sniffImageMime(bytes(0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0, 0, 0, 0)) === null);
	assert('.webm(EBML) 不是位图 → null',
		W.sniffImageMime(bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0)) === null);
	assert('字节太少 → null', W.sniffImageMime(bytes(0x89, 0x50)) === null);
	assert('空输入 → null', W.sniffImageMime(null) === null);
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
	// 注意这里传 visionFileId：registerAdImage 存的是【该下载的那个】，
	// 不是本体 fileId —— 批次 A 改的就是这一步，测试必须按新语义传参，
	// 否则断言的是个代码根本不会读的字段（等于白测）。
	const firstSeen = await W.loadAdImageForMessage(env, { kind: 'photo', fileUniqueId: 'IMG_NEW_1', fileId: 'BODY_1', visionFileId: 'VISION_1' }, '999');
	assert('首次见到返回 null（未判，不参与裁决）', firstSeen === null, JSON.stringify(firstSeen));
	assert('首次见到登记为 pending（L2 才有队列可取）',
		env.DB.query('SELECT verdict FROM ad_images WHERE file_unique_id = ?', 'IMG_NEW_1')[0]?.verdict === 'pending');
	assert('file_id 存的是 visionFileId（该下载的那个），不是本体 fileId',
		env.DB.query('SELECT file_id FROM ad_images WHERE file_unique_id = ?', 'IMG_NEW_1')[0]?.file_id === 'VISION_1',
		JSON.stringify(env.DB.query('SELECT file_id FROM ad_images WHERE file_unique_id = ?', 'IMG_NEW_1')));

	// animated 贴纸且无 thumbnail → visionFileId 为空 → file_id 写空串
	// → 队列条件 file_id != '' 把它挡在推理之外，只留 L1 同款复用。
	await W.loadAdImageForMessage(env, { kind: 'sticker', fileUniqueId: 'IMG_NOVISON_1', fileId: 'TGS_BODY', visionFileId: '' }, '999');
	assert('无 thumbnail 的贴纸 file_id 落成空串',
		env.DB.query('SELECT file_id, verdict FROM ad_images WHERE file_unique_id = ?', 'IMG_NOVISON_1')[0]?.file_id === '',
		JSON.stringify(env.DB.query('SELECT file_id, verdict FROM ad_images WHERE file_unique_id = ?', 'IMG_NOVISON_1')));
	assert('它仍登记为 pending（L1 指纹照常可用）',
		env.DB.query('SELECT verdict FROM ad_images WHERE file_unique_id = ?', 'IMG_NOVISON_1')[0]?.verdict === 'pending');
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
	const envKind = makeEnv({ AI: { run: async () => ({ answers: { ad: { type: 'choice', choice: 'ad', probabilities: { ad: 0.95, clean: 0.05 }, confidence: 0.9 } } }) } });
	await W.adDetectionReady(envKind);
	await W.upsertAdImage(envKind, 'IMG_K_PHOTO', { verdict: 'pending', fileId: 'F_PH', kind: 'photo' });
	await W.upsertAdImage(envKind, 'IMG_K_ANIM', { verdict: 'pending', fileId: 'F_AN', kind: 'animation' });
	await W.upsertAdImage(envKind, 'IMG_K_VID', { verdict: 'pending', fileId: 'F_VD', kind: 'video' });
	await W.upsertAdImage(envKind, 'IMG_K_DOC', { verdict: 'pending', fileId: 'F_DC', kind: 'document' });
	await W.upsertAdImage(envKind, 'IMG_K_STK', { verdict: 'pending', fileId: 'F_ST', kind: 'sticker' });
	// 有 thumbnail 才有得下：animated 贴纸且无 thumbnail 的那类 file_id 是空串，
	// 必须被 file_id != '' 挡住 —— 它 kind 也在白名单里，只能靠这一条拦。
	await W.upsertAdImage(envKind, 'IMG_K_NOTHUMB', { verdict: 'pending', fileId: '', kind: 'sticker' });
	resetCalls();
	const kindStats = await W.runAdImageVision(envKind);
	assert('队列只取 photo 与 sticker 且 file_id 非空（5 行里取 2）', kindStats.queued === 2, JSON.stringify(kindStats));
	assert('无 thumbnail 的贴纸没被取出来（不会白烧一次必然失败的推理）',
		envKind.DB.query('SELECT vision_checked_at FROM ad_images WHERE file_unique_id = ?', 'IMG_K_NOTHUMB')[0]?.vision_checked_at === 0,
		JSON.stringify(envKind.DB.query('SELECT vision_checked_at FROM ad_images WHERE file_unique_id = ?', 'IMG_K_NOTHUMB')));
	assert('只调了 2 次 getFile', countCalls('getFile') === 2, 'getFile=' + countCalls('getFile'));
	const animRow = envKind.DB.query('SELECT verdict, vision_checked_at FROM ad_images WHERE file_unique_id = ?', 'IMG_K_ANIM')[0];
	assert('动图永远留在 pending 且不被反复取出', animRow.verdict === 'pending' && Number(animRow.vision_checked_at) === 0, JSON.stringify(animRow));
	assert('photo 判成 ad', envKind.DB.query('SELECT verdict FROM ad_images WHERE file_unique_id = ?', 'IMG_K_PHOTO')[0]?.verdict === 'ad');
	assert('来源标记 vision', envKind.DB.query('SELECT source FROM ad_images WHERE file_unique_id = ?', 'IMG_K_PHOTO')[0]?.source === 'vision');

	// 6.3 日预算：额度用尽 → 直接返回，不再取队列
	const envBudget = makeEnv({ AI: { run: async () => ({ answers: { ad: { type: 'choice', choice: 'clean', probabilities: { ad: 0.05, clean: 0.95 }, confidence: 0.9 } } }) } });
	await W.adDetectionReady(envBudget);
	await W.upsertAdImage(envBudget, 'IMG_BUD_1', { verdict: 'pending', fileId: 'F_BUD', kind: 'photo' });
	resetCalls();
	const off = await W.runAdImageVision(envBudget, { dailyLimit: 0 });
	assert('AD_IMAGE_VISION_DAILY=0 → 关闭 L2', off.skipped === 'disabled', JSON.stringify(off));
	assert('关闭时零 getFile', countCalls('getFile') === 0, 'getFile=' + countCalls('getFile'));
	assert('关闭后仍保留 L1 登记的 pending 行',
		envBudget.DB.query('SELECT verdict FROM ad_images WHERE file_unique_id = ?', 'IMG_BUD_1')[0]?.verdict === 'pending');

	// 6.4 失败也推进 vision_checked_at（防反复烧额度）
	const envFail = makeEnv({ AI: { run: async () => ({ response: '抱歉我判断不了' }) } });
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

	// 6.5 失败熔断（2026-10-11）：连续 AD_VISION_FAIL_BREAK 次失败后，当天不再调用 moondream。
	// 线上真实状态是头像与正文图【全线失败】、一天 350 张一张没判成却照样烧额度 ——
	// 视觉识别是【可延迟】的活：一张图今天不判明天还能判，额度烧掉就没了。
	{
		let brkAiCalls = 0;
		const envBreak = makeEnv({ AI: { run: async () => { brkAiCalls += 1; return { response: '抱歉我判断不了' }; } } });
		await W.adDetectionReady(envBreak);
		for (let i = 0; i < 20; i++) {
			await W.upsertAdImage(envBreak, 'IMG_BRK_' + i, { verdict: 'pending', fileId: 'F_BRK' + i, kind: 'photo' });
		}
		const brkFirst = await W.runAdImageVision(envBreak, { batchSize: 50 });
		// 【2026-10-12 期望值 20 → 10】熔断原先只在函数开头查一次，批次内第 10 次失败后
		// 剩余的图照样跑完 —— 线上实测 vision_consec_fail 从 10 涨到 28，一批 50 张
		// 串行要跑好几分钟，等于当批的熔断完全没拦住烧钱。现在每张图开头复核、触发即 break。
		// 断言的【意图没变】（熔断省额度），只是触发时机从「跑满后」提前到「第 10 次」。
		// 旧值 20 就是被修掉的那个烧钱行为本身。
		assert('第 10 次失败即熔断并中止本批次（不跑满 20 张烧额度）',
			brkFirst.failed === 10 && brkFirst.skipped === 'broken', JSON.stringify(brkFirst));

		await W.upsertAdImage(envBreak, 'IMG_BRK_X', { verdict: 'pending', fileId: 'F_BRKX', kind: 'photo' });
		const brkSecond = await W.runAdImageVision(envBreak, { batchSize: 50 });
		// aiCalls 20 → 10：第一轮在第 10 次失败就熔断中止（AI 只被调用 10 次），
		// 第二轮因熔断标记整个早退（AI 调用数不增）—— 「熔断后不再调用模型」这层意图原样保留。
		assert('★ 熔断后不再调用模型（这才是省额度的关键）',
			brkSecond.skipped === 'broken' && brkAiCalls === 10,
			JSON.stringify(brkSecond) + ' aiCalls=' + brkAiCalls);
		assert('★ 熔断时已失败的行不会被重复取出',
			envBreak.DB.query('SELECT count(*) c FROM ad_images WHERE file_unique_id = ?', 'IMG_BRK_X')[0].c === 1);
	}


	// 6.5 状态键与头像互不挤占
	const envQuota = makeEnv({ AI: { run: async () => ({ response: '{"ad":false,"text":"","reason":"普通图"}' }) } });
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
section('[9] /adstats 展示正文图片指纹 + 计数守卫');
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

	// ===== /adstats 计数守卫 =====
	// 这批守的是 mock 的 batch 实现本身：缺 await 时 rows[i].results 是 undefined，
	// /adstats 前半段（指纹库 / 头像 / 正文图片）会静默读成 0 —— 查库明明有数据，
	// 看着却像产品缺陷。9 个测试文件的 stmts.map() 就是这个形态，而它们的断言
	// 全打在 batch 之后的入群屏 / 演练屏上，没有一条守这几行。
	//
	// 反向验证过（把本文件 batch 改回缺 await 再跑）：下面 5 项立刻变红、
	// 报错正是 bug 形态「共 0 条」「广告图 0 待识别 0 已排除 0」，证明不是恒绿。
	// ★ 「语义样本」「域名白名单」两行【不在 batch 里】—— 分别走 countAdSamples
	// 与 loadAdDomainWhitelist，反向验证时不红。留着是守各自那条查询，别当成 batch 守卫。
	const envBatch = makeEnv();
	await W.adDetectionReady(envBatch);
	await W.upsertAdAvatar(envBatch, 'AV_BOARD_1', { verdict: 'ad', fileId: 'F_AV1' });
	await W.upsertAdAvatar(envBatch, 'AV_BOARD_2', { verdict: 'pending', fileId: 'F_AV2' });
	resetCalls();
	await send(privateMessage(OWNER_ID, '/adstats'), envBatch);
	const boardLines = calls.filter((c) => c.method === 'sendMessage')
		.map((c) => c.body?.text || '').join('\n').split('\n');
	const lineOf = (needle) => boardLines.find((l) => l.includes(needle)) || '';
	assert('指纹库计数读得到（非 0）', /共 <b>[1-9]\d*<\/b> 条/.test(lineOf('指纹库')), lineOf('指纹库'));
	assert('语义样本计数读得到（非 0）', /共 <b>[1-9]\d*<\/b> 条/.test(lineOf('语义样本')), lineOf('语义样本'));
	assert('域名白名单计数读得到（非 0）', /生效 <b>[1-9]\d*<\/b> 条/.test(lineOf('域名白名单')), lineOf('域名白名单'));
	assert('头像指纹广告图计数读得到（非 0）', /广告图 <b>[1-9]\d*<\/b>/.test(lineOf('头像指纹')), lineOf('头像指纹'));
	assert('头像三档分列，pending 那张也数得出来', /待识别 <b>1<\/b>/.test(lineOf('头像指纹')), lineOf('头像指纹'));
}

// ================= 汇总 =================
// ---------- [7] 跨用户复用：不依赖 moondream 的兜底判据 ----------
// moondream 2026-10-11 起全线失败（模型返回空对象），ad_images 里「广告图」恒为 0，
// L1 同款指纹因此没料可依 —— 图片广告一张都杀不掉。这条判据用「同一张图被多个
// 不同用户发过」这个信号兜底，不调模型、零 Neurons。
console.log('\n[7] 图片跨用户复用');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const FILE = 'IMG_CROSS_A';
	await W.upsertAdImage(env, FILE, { verdict: 'pending', fileId: 'F_CROSS', kind: 'photo' });

	const seen = {};
	for (const uid of ['user1', 'user2', 'user3']) {
		seen[uid] = await W.loadAdImageForMessage(env, { fileUniqueId: FILE }, uid);
	}
	assert('第 1、2 个用户只记账不定罪', String(seen.user1?.verdict) === 'pending' && String(seen.user2?.verdict) === 'pending',
		JSON.stringify([seen.user1?.verdict, seen.user2?.verdict]));
	assert('★ 第 3 个用户发同一张图 → 标记为广告素材', String(seen.user3?.verdict) === 'ad', JSON.stringify(seen.user3));

	const row = env.DB.query('SELECT verdict, source FROM ad_images WHERE file_unique_id = ?', FILE)[0];
	assert('★ 库里 verdict = ad', String(row?.verdict) === 'ad', JSON.stringify(row));
	assert('来源标成 cross_user（复核时能看出是这条判据定的罪）', String(row?.source) === 'cross_user', JSON.stringify(row));
	const senders = env.DB.query('SELECT user_id FROM ad_image_senders WHERE file_unique_id = ?', FILE);
	assert('发送者名单留痕 3 人', senders.length === 3, JSON.stringify(senders));
}

// 同一个人反复发同一张图【不计】—— 广告号刷屏是一个人干的，这条判据抓的是跨账号复用；
// 不排掉的话单人刷屏就能把计数顶上去，误伤正常梗图。
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const FILE = 'IMG_CROSS_B';
	await W.upsertAdImage(env, FILE, { verdict: 'pending', fileId: 'F_B', kind: 'photo' });
	for (let i = 0; i < 5; i++) await W.loadAdImageForMessage(env, { fileUniqueId: FILE }, 'same_user');
	const row = env.DB.query('SELECT verdict FROM ad_images WHERE file_unique_id = ?', FILE)[0];
	const senders = env.DB.query('SELECT user_id FROM ad_image_senders WHERE file_unique_id = ?', FILE);
	assert('★ 同一个人发 5 次 → 仍不判定（只算 1 个发送者）',
		String(row?.verdict) === 'pending' && senders.length === 1,
		JSON.stringify(row) + ' senders=' + JSON.stringify(senders));
}

// 已判 clean 的图不被翻案（含人工 /ignore 纠错的）
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const FILE = 'IMG_CROSS_C';
	await W.upsertAdImage(env, FILE, { verdict: 'clean', fileId: 'F_C', kind: 'photo' });
	for (const uid of ['a', 'b', 'c', 'd']) await W.loadAdImageForMessage(env, { fileUniqueId: FILE }, uid);
	const row = env.DB.query('SELECT verdict FROM ad_images WHERE file_unique_id = ?', FILE)[0];
	assert('★ 已判 clean 的图不被跨用户复用翻案', String(row?.verdict) === 'clean', JSON.stringify(row));
}

// 已判 ad 的图不会被重置
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const FILE = 'IMG_CROSS_D';
	await W.upsertAdImage(env, FILE, { verdict: 'ad', fileId: 'F_D', kind: 'photo' });
	await W.loadAdImageForMessage(env, { fileUniqueId: FILE }, 'someone');
	const row = env.DB.query('SELECT verdict FROM ad_images WHERE file_unique_id = ?', FILE)[0];
	assert('已判 ad 的图不被重置', String(row?.verdict) === 'ad', JSON.stringify(row));
}


// ---------- [8] 视觉模型换代（moondream → llama-3.2-11b-vision）----------
// moondream3.1 实测调用成功但返回空对象 {}，四条路（正确账号 ID / URL 与 base64 /
// task=query 与 caption）全试过，模型就是不输出。换 llama 后返回结构也完全不同：
// 答案在前、prompt 回显在 <image> 之后，参数是 image_url.url 而不是 image。
console.log('\n[8] 视觉模型返回解析与重试');
{
	// ① 实测的返回形态：答案在最前，后面是被回显的完整 prompt
	const raw = '蓝色\n<image>\n这是一张社交软件的头像。回答：图上主色是什么？只答一个词。蓝色\n<image>\n蓝色\n<image>\n';
	assert('★ 截掉 prompt 回显，只留模型自己写的部分',
		W.extractVisionResponseText(raw) === '蓝色', JSON.stringify(W.extractVisionResponseText(raw)));
	assert('不带 <image> 的原文原样返回', W.extractVisionResponseText('红色') === '红色');
	assert('null / 空串返回空', W.extractVisionResponseText(null) === '' && W.extractVisionResponseText('') === '');

	// ② 调用参数
	const inputs = [];
	const envM = makeEnv({ AI: { run: async (model, input) => { inputs.push({ model, input }); return { response: '{"ad":false,"text":"x","reason":"正常"}' }; } } });
	const got = await W.runVisionModel(envM, 'MODEL_X', 'data:image/png;base64,AAA', '测试提示词');
	assert('★ 拿到模型回答', got.includes('"ad"'), got);
	assert('★ 参数用 image_url.url（不是 image）',
		inputs[0].input.image_url?.url === 'data:image/png;base64,AAA', JSON.stringify(Object.keys(inputs[0].input)));
	assert('★ prompt 前缀是 <image>', inputs[0].input.prompt.startsWith('<image>'), inputs[0].input.prompt.slice(0, 30));

	// ③ 空响应重试一次（menshen 同款：推理模型偶发吐空）
	let callsN = 0;
	const envR = makeEnv({ AI: { run: async () => { callsN += 1; return callsN < 2 ? { response: '' } : { response: '第二次有内容' }; } } });
	const retry = await W.runVisionModel(envR, 'MODEL_X', 'data:image/png;base64,AAA', '提示词');
	assert('★ 空响应会重试一次', callsN === 2 && retry === '第二次有内容', 'calls=' + callsN);

	// ④ 两次都空 → 返回空串且确实调了两次（不抛错，由调用方走失败路径）
	let calls2 = 0;
	const envE = makeEnv({ AI: { run: async () => { calls2 += 1; return { response: '' }; } } });
	const empty = await W.runVisionModel(envE, 'MODEL_X', 'data:image/png;base64,AAA', '提示词');
	assert('★ 两次都空 → 返回空串且调了两次', empty === '' && calls2 === 2, 'calls=' + calls2);

	// ⑤ 调用异常直接抛（不在这里吞掉重试 —— 网络/权限类错误重试也是同样的错）
	let callsX = 0;
	const envX = makeEnv({ AI: { run: async () => { callsX += 1; throw new Error('上游 500'); } } });
	let threw = null;
	try { await W.runVisionModel(envX, 'MODEL_X', 'data:image/png;base64,AAA', '提示词'); } catch (e) { threw = e; }
	assert('★ 调用异常直接抛出（不重试）', threw !== null && callsX === 1, String(threw) + ' calls=' + callsX);
}


// ---------- [9] 429 限流容错 ----------
// Workers AI 对【需付费计划的模型】限 20 RPM，llama-3.2-11b-vision 就属于这类。
// 两轨串行跑几百张，撞 429 是【必然】不是故障。若把它算进 failed：
// 熔断会被限流触发，当天识图全部停摆 —— 拿可用性换一个本来就会自己恢复的状态。
console.log('\n[9] 429 限流容错');
{
	const env = makeEnv({ AI: { run: async () => { throw new Error('429 Too Many Requests'); } } });
	await W.adDetectionReady(env);
	await W.upsertAdImage(env, 'IMG_429', { verdict: 'pending', fileId: 'F429', kind: 'photo' });
	const s1 = await W.runAdImageVision(env, { batchSize: 10, dailyLimit: 10 });
	assert('★ 429 → 计入 rateLimited、不计入 failed',
		Number(s1.rateLimited) === 1 && Number(s1.failed) === 0, JSON.stringify(s1));

	const row = env.DB.query('SELECT vision_checked_at FROM ad_images WHERE file_unique_id = ?', 'IMG_429')[0];
	assert('★ 429 后 vision_checked_at 仍为 0（下一轮 cron 会重判）',
		Number(row?.vision_checked_at) === 0, JSON.stringify(row));

	// 连续多次 429 也不熔断
	for (let i = 0; i < 11; i++) {
		await W.upsertAdImage(env, 'IMG_429_' + i, { verdict: 'pending', fileId: 'F429_' + i, kind: 'photo' });
		await W.runAdImageVision(env, { batchSize: 10, dailyLimit: 100 });
	}
	const brk = await W.readVisionBreakState(env, Math.floor(Date.now() / 1000));
	assert('★ 连续 11 次 429 也不熔断（限流不是链路故障）', brk.broken === false, JSON.stringify(brk));

	// 真失败仍然照旧计数并触发熔断（别把限流容错做成「什么都不失败」）
	const env2 = makeEnv({ AI: { run: async () => { throw new Error('model exploded'); } } });
	await W.adDetectionReady(env2);
	for (let i = 0; i < 10; i++) {
		await W.upsertAdImage(env2, 'IMG_REALFAIL_' + i, { verdict: 'pending', fileId: 'R' + i, kind: 'photo' });
	}
	const s2 = await W.runAdImageVision(env2, { batchSize: 50, dailyLimit: 100 });
	const brk2 = await W.readVisionBreakState(env2, Math.floor(Date.now() / 1000));
	assert('★ 非限流的真失败仍会计入 failed 并触发熔断',
		Number(s2.failed) > 0 && brk2.broken === true, JSON.stringify(s2) + JSON.stringify(brk2));
}


// ================= [7] 实时图片判定（2026-10-13）=================
//
// 这一节治的是「第一次出现的广告图完全不产生判据」：旧链路把它登记成 pending
// 就返回，等 cron（一天两班）判完还要等【下一次】有人发才命中。实时化之后，
// 没判过的当场调一次 clef 出结论并落库。下面每一条断言在改动【之前】都是红的 ——
// 旧行为下 verdict 恒为 pending、getFile 一次都不会发。
section('[7] 带图消息当场判定（不再等 cron）');
{
	const env = makeEnv({
		AI: { run: async () => ({ answers: { ad: { type: 'choice', choice: 'ad', probabilities: { ad: 0.95, clean: 0.05 }, confidence: 0.9 } } }) }
	});
	await W.adDetectionReady(env);
	resetCalls();
	await send(barePhotoMessage({ id: 880001, first_name: '广告号' }, 'IMG_RT_AD_1', 'F_RT_AD_1'), env);

	const row = env.DB.query('SELECT verdict, source, hits, vision_checked_at FROM ad_images WHERE file_unique_id = ?', 'IMG_RT_AD_1');
	assert('带图消息已登记进库', row.length === 1, JSON.stringify(row));
	assert('★ 当场判定，不再停在 pending', row[0]?.verdict === 'ad', JSON.stringify(row[0]));
	// source 是 vision，但如果这条消息当场触发了封禁，「定罪即学习」（learnAdImageOnBan）
	// 会把它覆盖成 learned 并把 hits +1 —— 那是既有设计，不是实时判定丢了来源。
	assert('判定结果已落库（vision，或定罪后被学习覆盖为 learned）',
		row[0]?.source === 'vision' || row[0]?.source === 'learned', JSON.stringify(row[0]));
	assert('★ 当场封禁了发广告的人（这才是「检测就杀」）',
		countCalls('banChatMember') >= 1, 'banChatMember=' + countCalls('banChatMember'));
	assert('vision_checked_at 已推进（cron 不会再重判这张）', Number(row[0]?.vision_checked_at) > 0, JSON.stringify(row[0]));
	assert('★ 高置信(0.95≥0.9)顶到单证定罪线 hits≥5', Number(row[0]?.hits) >= 5, JSON.stringify(row[0]));
	assert('调过 getFile（真的下了图去判，不是只登记）', countCalls('getFile') >= 1, 'getFile=' + countCalls('getFile'));
}

section('[7b] 模糊区不单证定罪 + 第二次出现不重复花钱');
{
	const env = makeEnv({
		AI: { run: async () => ({ answers: { ad: { type: 'choice', choice: 'ad', probabilities: { ad: 0.7, clean: 0.3 }, confidence: 0.6 } } }) }
	});
	await W.adDetectionReady(env);
	resetCalls();
	await send(barePhotoMessage({ id: 880011, first_name: '模糊广告' }, 'IMG_RT_MID_1', 'F_RT_MID_1'), env);
	const mid = env.DB.query('SELECT verdict, hits FROM ad_images WHERE file_unique_id = ?', 'IMG_RT_MID_1')[0];
	assert('0.7 同样当场判成广告', mid?.verdict === 'ad', JSON.stringify(mid));
	assert('★ 模糊区(0.5~0.9)不顶定罪线，仍走多特征原则', Number(mid?.hits) < 5, JSON.stringify(mid));

	// 同一张图第二次出现：库里已有结论，一个模型调用都不该再发。
	resetCalls();
	await send(barePhotoMessage({ id: 880012, first_name: '另一个人' }, 'IMG_RT_MID_1', 'F_RT_MID_1'), env);
	assert('★ 第二次出现不重复调模型（零 getFile）', countCalls('getFile') === 0, 'getFile=' + countCalls('getFile'));
}

section('[7c] 干净图当场判干净，正常表情包不受影响');
{
	const env = makeEnv({
		AI: { run: async () => ({ answers: { ad: { type: 'choice', choice: 'clean', probabilities: { ad: 0.04, clean: 0.96 }, confidence: 0.9 } } }) }
	});
	await W.adDetectionReady(env);
	resetCalls();
	await send(barePhotoMessage({ id: 880021, first_name: '路人' }, 'IMG_RT_CLEAN_1', 'F_RT_CLEAN_1'), env);
	const clean = env.DB.query('SELECT verdict, hits FROM ad_images WHERE file_unique_id = ?', 'IMG_RT_CLEAN_1')[0];
	assert('★ 干净图当场判成 clean（不是 pending）', clean?.verdict === 'clean', JSON.stringify(clean));
	assert('clean 不抬定罪线', Number(clean?.hits) === 0, JSON.stringify(clean));
}

console.log(`\n===== 正文图片检测测试：通过 ${pass} / 失败 ${fail} =====`);
if (fail > 0) {
	console.log('失败项：');
	for (const name of failures) console.log('  - ' + name);
	process.exit(1);
}
