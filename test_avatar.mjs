// 头像检测（L1 指纹 + L2 视觉识别）离线端到端测试。
// 与 test_ad_detection.mjs 同范式：vm 加载 _worker.js、Telegram API 全 mock、
// D1 用 node:sqlite 真实 SQLite 后端。运行：node test_avatar.mjs

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

// ---------- D1 兼容层（真实 SQLite）----------
function makeD1() {
	const db = new DatabaseSync(':memory:');
	const normIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const k of Object.keys(row)) out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
		return out;
	};
	const exec = (sql, params = []) => {
		const st = db.prepare(sql);
		const bound = params.map(normIn);
		const head = sql.trim().slice(0, 6).toUpperCase();
		if (head === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) {
			return { kind: 'rows', rows: st.all(...bound).map(normOut) };
		}
		const info = st.run(...bound);
		return { kind: 'run', meta: {}, results: [{ success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } }] };
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
		exec: async (sql) => { db.exec(sql); return { results: [], success: true }; },
		// 必须 await —— 不 await 会返回 Promise 数组，batch[i].results 为 undefined，
		// /adstats 前半段（指纹库/样本/白名单/头像计数）会静默读成 0：查库明明正常，
		// 看着却像产品缺陷。实际是 mock 少了 await。
		batch: async (stmts) => Promise.all(stmts.map((st) => st.run())),
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
function resetCalls() { calls.length = 0; setApi(); try { W.invalidateAdAdminCache(); } catch { /* W 未初始化 */ } }
function countCalls(method) { return calls.filter((c) => c.method === method).length; }

const FAKE_IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777000, is_bot: true, username: 'AvatarTestBot' } };
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
		// 图片下载地址不是 /method 形式，单独走 arrayBuffer 分支。
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

const handler = W.__handler;
const bootEnv = makeEnv();
resetCalls();
await sendUpdate({ message: privateMessage(99999, 'hello') }, bootEnv);

// 带头像的 getChat 返回
function chatWithAvatar(uniqueId, fileId) {
	return () => ({
		ok: true,
		result: {
			id: 1, type: 'private', first_name: '被测用户',
			bio: '自定义简介内容',
			photo: {
				small_file_id: 'small_' + fileId, big_file_id: 'big_' + fileId,
				small_file_unique_id: 'su_' + uniqueId, big_file_unique_id: uniqueId
			}
		}
	});
}

// ================= [1] 表结构与取头像 =================
section('[1] ad_avatars 表与 getChat 头像字段');
{
	const env = makeEnv();
	const ready = await W.adDetectionReady(env);
	assert('adDetectionReady 成功', ready === true, String(ready));
	const tables = env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ad_avatars'");
	assert('ad_avatars 表已建', tables.length === 1, JSON.stringify(tables));

	resetCalls();
	setApi({ getChat: chatWithAvatar('AVATAR_UNIQUE_1', 'FILE_1') });
	const profile = await W.fetchAdUserProfile(424242, { id: 424242, first_name: '被测用户' });
	assert('avatarId 取自 big_file_unique_id', profile.avatarId === 'AVATAR_UNIQUE_1', JSON.stringify(profile.avatarId));
	assert('avatarFileId 取自 big_file_id（下载用）', profile.avatarFileId === 'big_FILE_1', JSON.stringify(profile.avatarFileId));
	assert('bio 一并取到', profile.bio === '自定义简介内容', JSON.stringify(profile.bio));
}

// ================= [2] 分档判据（纯函数） =================
section('[2] applyAvatarVerdict 分档');
{
	const adRow = (hits) => ({ verdict: 'ad', hits });
	// base = 本次判定已有一条判据（模拟「正文/简介另有证据」的常态）
	const base = { verdict: 'observe', score: 3, reasons: ['+3 正文交易动词'] };
	const cleanBase = { verdict: 'pass', score: 0, reasons: [] };
	assert('头像 ad + 本次零判据 → 只进观察（不定罪）',
		W.applyAvatarVerdict({ ...cleanBase }, adRow(1)).verdict === 'observe');
	assert('头像 ad + 有其它判据 → 升为封禁',
		W.applyAvatarVerdict(base, adRow(1)).verdict === 'ban');
	assert('头像 ad + 分数达 2 也算有佐证 → 封禁',
		W.applyAvatarVerdict({ verdict: 'observe', score: 2, reasons: [] }, adRow(1)).verdict === 'ban');
	assert('头像 ad + 复用定罪 2 次 → 单独即可封',
		W.applyAvatarVerdict({ ...cleanBase }, adRow(2)).verdict === 'ban');
	assert('封禁结果原样保留（不会被降级）',
		W.applyAvatarVerdict({ ...base, verdict: 'ban' }, adRow(1)).verdict === 'ban');
	assert('头像 clean → 原样返回不动判定',
		W.applyAvatarVerdict({ ...cleanBase }, { verdict: 'clean', hits: 0 }).verdict === 'pass');
	assert('头像 pending → 原样返回不动判定',
		W.applyAvatarVerdict({ ...cleanBase }, { verdict: 'pending', hits: 0 }).verdict === 'pass');
	assert('无头像（null）→ 原样返回',
		W.applyAvatarVerdict({ ...cleanBase }, null).verdict === 'pass');
	assert('命中时 reasons 追加说明（主人能看懂为何被封）',
		W.applyAvatarVerdict(base, adRow(1)).reasons.some((r) => r.includes('头像命中广告图库')),
		JSON.stringify(W.applyAvatarVerdict(base, adRow(1)).reasons));
	assert('不动 score（头像不与历史分重复计分）',
		W.applyAvatarVerdict(base, adRow(1)).score === base.score);
}

// ================= [3] 端到端：消息判定受头像影响 =================
section('[3] 端到端 · 干净消息 + 广告头像');
{
	// 预置：这个头像已被判定为广告（复用定罪 1 次）
	const env = makeEnv();
	await W.adDetectionReady(env);
	await W.upsertAdAvatar(env.DB ? env : env, 'AV_ADV', { verdict: 'ad', hits: 0, source: 'vision' });
	env.DB.query('UPDATE ad_avatars SET hits = 1 WHERE file_unique_id = ?', 'AV_ADV');

	// 正文无广告信号的普通发言
	resetCalls();
	setApi({ getChat: chatWithAvatar('AV_ADV', 'F_ADV') });
	await sendUpdate({ message: groupMessage({ id: 555001, first_name: '路人甲' }, '今天天气不错') }, env);

	const banned = countCalls('banChatMember');
	const observed = env.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c;
	console.log('    封禁=' + banned + ' 观察记录=' + observed);
	assert('正文干净 + 头像 ad(复用1次) → 不封禁（走观察，防头像盗用误封）', banned === 0, '封禁次数 ' + banned);
	assert('   但确实进了观察窗口（不是完全放走）', observed > 0, '观察记录 ' + observed);

	// 头像复用定罪累积到 2 次 → 单独即可封
	env.DB.query('UPDATE ad_avatars SET hits = 2 WHERE file_unique_id = ?', 'AV_ADV');
	resetCalls();
	setApi({ getChat: chatWithAvatar('AV_ADV', 'F_ADV') });
	await sendUpdate({ message: groupMessage({ id: 555002, first_name: '路人乙' }, '你好') }, env);
	assert('正文干净 + 头像 ad(复用2次) → 直接封禁', countCalls('banChatMember') === 1, '封禁次数 ' + countCalls('banChatMember'));

	// clean 头像：完全不影响判定。
	// 【换一个全新 env】—— 前两轮封禁触发了定罪即学习，把「你好」学进了指纹库，
	// 同一个库里再发「你好呀」会被那条指纹命中，那样测到的就是指纹层而不是头像层。
	const envCleanAvatar = makeEnv();
	await W.adDetectionReady(envCleanAvatar);
	await W.upsertAdAvatar(envCleanAvatar, 'AV_ADV', { verdict: 'clean', source: 'manual' });
	resetCalls();
	setApi({ getChat: chatWithAvatar('AV_ADV', 'F_ADV') });
	await sendUpdate({ message: groupMessage({ id: 555003, first_name: '路人丙' }, '你好呀') }, envCleanAvatar);
	assert('头像 clean → 与无头像时行为一致（不封不观察）',
		countCalls('banChatMember') === 0 && envCleanAvatar.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 0,
		'封禁=' + countCalls('banChatMember'));
}

// ================= [4] 首次见到头像 → 登记 pending =================
section('[4] 头像自动登记');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();
	setApi({ getChat: chatWithAvatar('AV_NEW_1', 'F_NEW_1') });
	await sendUpdate({ message: groupMessage({ id: 556001, first_name: '新面孔' }, '在吗') }, env);
	const row = env.DB.query('SELECT verdict, vision_checked_at, file_id FROM ad_avatars WHERE file_unique_id = ?', 'AV_NEW_1');
	assert('首次见到的头像已登记进库', row.length === 1, JSON.stringify(row));
	assert('登记状态为 pending（等 L2 判）', row[0]?.verdict === 'pending', JSON.stringify(row[0]));
	assert('file_id 已存（L2 下载要用；unique_id 不能下载）', String(row[0]?.file_id || '') !== '', JSON.stringify(row[0]));
	assert('登记本身不改变判定（这轮不封）', countCalls('banChatMember') === 0);
}

// ================= [5] 定罪即学习（热路径排队 + cron 补学） =================
section('[5] 定罪即学习头像（闸一封禁走队列，不加热路径请求）');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	resetCalls();
	setApi({ getChat: chatWithAvatar('AV_LEARN_1', 'F_LEARN_1') });
	// 足够封禁线的广告正文 —— 这条走闸一（零成本判定）就地定罪
	await sendUpdate({ message: groupMessage({ id: 557001, first_name: '广告号' }, '高价收购网赚账号 长期收 USDT 秒结 需要的来') }, env);
	const banned = countCalls('banChatMember');
	assert('广告正文触发封禁', banned === 1, '封禁次数 ' + banned);
	// 既有铁律：闸一定罪不许多花 getChat（三条断言守着这条，见 test_ad_detection /
	// test_ad_name_strip）。补拉头像如果放热路径，这里就会红。
	assert('闸一定罪仍不花 getChat（头像补学走队列）',
		countCalls('getChat') === 0, 'getChat=' + countCalls('getChat'));

	const queueRaw = await W.readAdScanState(env, 'avatar_learn_queue', '[]');
	const queue = JSON.parse(queueRaw || '[]');
	assert('封禁后进入补学队列', Array.isArray(queue) && queue.includes('557001'), queueRaw);
	assert('此时头像尚未入库（闸一没有头像可学）',
		env.DB.query('SELECT COUNT(*) AS c FROM ad_avatars WHERE file_unique_id = ?', 'AV_LEARN_1')[0].c === 0);

	// cron 轨消化队列：这里拉资料、拿头像、学进指纹库
	resetCalls();
	setApi({ getChat: chatWithAvatar('AV_LEARN_1', 'F_LEARN_1') });
	const drain = await W.drainAdAvatarLearningQueue(env, 30);
	assert('补学队列被消化', drain.learned === 1, JSON.stringify(drain));
	assert('消化后队列清空',
		JSON.parse((await W.readAdScanState(env, 'avatar_learn_queue', '[]')) || '[]').length === 0);
	assert('补学花 1 次 getChat（在 cron 里，不在消息路径）', countCalls('getChat') === 1, 'getChat=' + countCalls('getChat'));
	const row = env.DB.query('SELECT verdict, hits, source FROM ad_avatars WHERE file_unique_id = ?', 'AV_LEARN_1');
	assert('封禁后头像进库且标为 ad', row.length === 1 && row[0]?.verdict === 'ad', JSON.stringify(row));
	assert('复用计数 +1（供后续单独定罪的铁证）', Number(row[0]?.hits) === 1, JSON.stringify(row));
	assert('来源标记为 learned（区分视觉识别与学习）', row[0]?.source === 'learned', JSON.stringify(row));

	// 同头像再来一个号 → 即便正文干净也进观察（不直接放走）
	resetCalls();
	setApi({ getChat: chatWithAvatar('AV_LEARN_1', 'F_LEARN_1') });
	await sendUpdate({ message: groupMessage({ id: 557002, first_name: '下一个号' }, '在吗') }, env);
	assert('同头像第二个号（本条正文干净）也进观察而非直接放走',
		env.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c > 0,
		'观察记录 ' + env.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c);
}

// ================= [6] /ignore 纠错清头像 =================
section('[6] /ignore 误封纠错同步清头像');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	// 手工造一条待复核快照（带 avatarId，模拟新功能上线后的快照）
	const now = Math.floor(Date.now() / 1000);
	await W.upsertAdAvatar(env, 'AV_IGNORE', { verdict: 'ad', source: 'vision' });
	// hits 只由 learnAdAvatarOnBan 累加，upsert 刻意不暴露它 —— 这里直接写库造「已复用 3 次」的前置态。
	env.DB.query('UPDATE ad_avatars SET hits = 3 WHERE file_unique_id = ?', 'AV_IGNORE');
	env.DB.query(
		'INSERT INTO ad_pending_snapshots (owner_id, seq, user_id, chat_id, score, reasons, snapshot, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
		String(OWNER_ID), 1, '558001', GROUP_ID, 7, '测试',
		JSON.stringify({ name: '误封用户', username: '', bio: '', text: '', avatarId: 'AV_IGNORE' }),
		now, now + 3600
	);
	const before = env.DB.query('SELECT verdict, hits FROM ad_avatars WHERE file_unique_id = ?', 'AV_IGNORE');
	assert('纠错前头像是 ad/3', before[0]?.verdict === 'ad' && Number(before[0]?.hits) === 3, JSON.stringify(before));

	const snapshot = await W.readAdPendingSnapshot(env, String(OWNER_ID), 1);
	assert('快照读得到', Boolean(snapshot), JSON.stringify(snapshot));
	const rollback = await W.rollbackAdPendingSnapshot(env, String(OWNER_ID), 1, snapshot);
	assert('回滚返回头像纠错结果', rollback?.avatarCleared === true, JSON.stringify(rollback?.avatarCleared));
	const after = env.DB.query('SELECT verdict, hits FROM ad_avatars WHERE file_unique_id = ?', 'AV_IGNORE');
	assert('纠错后头像转 clean（防止同图连坐）', after[0]?.verdict === 'clean', JSON.stringify(after));
	assert('纠错后复用计数清零', Number(after[0]?.hits) === 0, JSON.stringify(after));
}

// ================= [7] L2 视觉识别 =================
section('[7] runAdAvatarVision · 队列 / 熔断 / 解析');
{
	// 7.1 未绑 AI → 跳过推理，但【补学队列照样消化】（它不依赖模型，
	//     放在 AI 分支之后的话，未绑 AI 的部署永远学不到闸一定罪的头像）
	const envNoAI = makeEnv();
	await W.adDetectionReady(envNoAI);
	await W.queueAdAvatarLearning(envNoAI, '559001');
	resetCalls();
	setApi({ getChat: chatWithAvatar('AV_NO_AI', 'F_NO_AI') });
	const noAi = await W.runAdAvatarVision(envNoAI);
	assert('未绑 Workers AI → 跳过推理并说明原因', noAi.skipped === 'no_ai', JSON.stringify(noAi));
	assert('未绑 AI 仍消化了补学队列', Number(noAi.learnQueue?.learned) === 1, JSON.stringify(noAi.learnQueue));
	assert('未绑 AI 也照样学到头像', envNoAI.DB.query('SELECT verdict FROM ad_avatars WHERE file_unique_id = ?', 'AV_NO_AI')[0]?.verdict === 'ad');
	assert('未绑 AI 时不调 getFile', countCalls('getFile') === 0, 'getFile=' + countCalls('getFile'));

	// 7.2 绑 AI：消费队列，模型判广告 → verdict=ad
	const fakeAI = {
		run: async () => ({ answers: { ad: { type: 'choice', choice: 'ad', probabilities: { ad: 0.95, clean: 0.05 }, confidence: 0.9 } } })
	};
	const env = makeEnv({ AI: fakeAI });
	await W.adDetectionReady(env);
	await W.upsertAdAvatar(env, 'AV_VIS_1', { verdict: 'pending', fileId: 'FILE_VIS_1' });
	resetCalls();
	const stats1 = await W.runAdAvatarVision(env);
	assert('队列取到待判头像', stats1.queued === 1, JSON.stringify(stats1));
	assert('完成 1 张', stats1.done === 1, JSON.stringify(stats1));
	assert('模型判广告 → ad 计数', stats1.ad === 1, JSON.stringify(stats1));
	const row1 = env.DB.query('SELECT verdict, source, vision_checked_at FROM ad_avatars WHERE file_unique_id = ?', 'AV_VIS_1');
	assert('库里 verdict 写成 ad', row1[0]?.verdict === 'ad', JSON.stringify(row1));
	assert('来源标记 vision', row1[0]?.source === 'vision', JSON.stringify(row1));
	assert('vision_checked_at 已推进（不会被重复取出烧额度）', Number(row1[0]?.vision_checked_at) > 0, JSON.stringify(row1));
	assert('调过 getFile 取下载地址', countCalls('getFile') === 1, 'getFile=' + countCalls('getFile'));
	assert('调过图片下载', countCalls('downloadFile') === 1, 'download=' + countCalls('downloadFile'));

	// 7.3 模型回答无法解析 → 保持 pending，绝不靠猜写 ad
	const envBad = makeEnv({ AI: { run: async () => ({ response: '抱歉我无法判断这张图片' }) } });
	await W.adDetectionReady(envBad);
	await W.upsertAdAvatar(envBad, 'AV_VIS_BAD', { verdict: 'pending', fileId: 'FILE_BAD' });
	const stats2 = await W.runAdAvatarVision(envBad);
	assert('解析失败计入 failed', stats2.failed === 1, JSON.stringify(stats2));
	assert('解析失败不产生 ad（宁漏勿误封）', stats2.ad === 0, JSON.stringify(stats2));
	const rowBad = envBad.DB.query('SELECT verdict FROM ad_avatars WHERE file_unique_id = ?', 'AV_VIS_BAD');
	assert('失败项 verdict 保持 pending', rowBad[0]?.verdict === 'pending', JSON.stringify(rowBad[0]));
	assert('失败项也推进了 checked_at（防止死循环重试）',
		Number(envBad.DB.query('SELECT vision_checked_at AS v FROM ad_avatars WHERE file_unique_id = ?', 'AV_VIS_BAD')[0].v) > 0);

	// 7.4 日预算熔断
	const envLimit = makeEnv({ AI: fakeAI });
	await W.adDetectionReady(envLimit);
	await W.upsertAdAvatar(envLimit, 'AV_LIMIT_1', { verdict: 'pending', fileId: 'FILE_LIMIT' });
	const now = Math.floor(Date.now() / 1000);
	await W.writeAdScanState(envLimit, 'avatar_day', new Date(now * 1000).toISOString().slice(0, 10), now);
	await W.writeAdScanState(envLimit, 'avatar_count', '50', now);
	const stats3 = await W.runAdAvatarVision(envLimit, { dailyLimit: 50 });
	assert('额度用尽 → 直接跳过不推理', stats3.skipped === 'daily_limit_reached', JSON.stringify(stats3));
	assert('额度用尽时不消耗模型调用', fakeAI.run === undefined || stats3.done === 0, JSON.stringify(stats3));

	// 7.6 环境变量关掉 L2（主人可以先只跑 L1 指纹库，零 Neurons 灰度）
	const envOff = makeEnv({ AI: fakeAI, AD_AVATAR_VISION_DAILY: '0' });
	await W.adDetectionReady(envOff);
	await W.upsertAdAvatar(envOff, 'AV_OFF_1', { verdict: 'pending', fileId: 'FILE_OFF' });
	resetCalls();
	const stats5 = await W.runAdAvatarVision(envOff);
	assert('AD_AVATAR_VISION_DAILY=0 → L2 关闭', stats5.skipped === 'disabled', JSON.stringify(stats5));
	assert('关闭时不调 getFile、不推理', countCalls('getFile') === 0 && stats5.done === 0, JSON.stringify(stats5));
	assert('关闭 L2 不影响补学队列（L1 照常学习）',
		Number(stats5.learnQueue?.learned) >= 0, JSON.stringify(stats5.learnQueue));

	// 7.5 模型判定的干净头像
	const envClean = makeEnv({ AI: { run: async () => ({ answers: { ad: { type: 'choice', choice: 'clean', probabilities: { ad: 0.05, clean: 0.95 }, confidence: 0.9 } } }) } });
	await W.adDetectionReady(envClean);
	await W.upsertAdAvatar(envClean, 'AV_VIS_CLEAN', { verdict: 'pending', fileId: 'FILE_CLEAN' });
	const stats4 = await W.runAdAvatarVision(envClean);
	assert('模型判干净 → clean 计数', stats4.clean === 1, JSON.stringify(stats4));
	assert('干净头像写进库', envClean.DB.query('SELECT verdict FROM ad_avatars WHERE file_unique_id = ?', 'AV_VIS_CLEAN')[0].verdict === 'clean');
}

// ================= [8] JSON 解析容错 =================
section('[8] parseAvatarVisionAnswer 容错');
{
	const plain = W.parseAvatarVisionAnswer('{"ad":true,"text":"加V","reason":"引流"}');
	assert('裸 JSON 能解析', plain?.ad === true && plain.text === '加V', JSON.stringify(plain));
	const fenced = W.parseAvatarVisionAnswer('```json\n{"ad":false,"text":"","reason":"风景照"}\n```');
	assert('markdown 包裹的 JSON 也能解析', fenced?.ad === false, JSON.stringify(fenced));
	const loose = W.parseAvatarVisionAnswer('看图判断：{"ad": true, "reason":"图上写着赚钱"}多余文字');
	assert('前后有杂字也能抠出 JSON', loose?.ad === true, JSON.stringify(loose));
	assert('空回答返回 null', W.parseAvatarVisionAnswer('') === null);
	assert('非 JSON 返回 null（不猜）', W.parseAvatarVisionAnswer('这是一只猫') === null);
	assert('字符串 true 也算广告标记', W.parseAvatarVisionAnswer('{"ad":"true"}')?.ad === true);
}

// ================= 汇总 =================
console.log(`\n===== 头像检测测试：通过 ${pass} / 失败 ${fail} =====`);
if (fail > 0) {
	console.log('失败项：');
	for (const name of failures) console.log('  - ' + name);
	process.exit(1);
}
