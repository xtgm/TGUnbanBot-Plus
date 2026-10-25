// 广告检测 · 三道闸的端到端测试（bio gates）
//
// 与 test_ad_detection.mjs 的分工：那套是单元级，直接调内层函数逐条断言评分与
// 判定分支；这套走【完整 webhook 链路】—— 构造真实 update 打 handler.fetch，
// 后端是 node:sqlite 真实 D1，验证的是「从 Telegram 推来一条消息，到实际封禁
// 落库」这一整条路真的通。
//
// 为什么必须喂完整 message 而不是字符串：曾经把广告词当 message.text 直接喂
// scoreAdMessageText，结论全建立在假前提上 —— 真实样本的 message.text 只有一个
// 字母，广告内容在转发体里。只有构造完整 update 才能暴露这类提取环节的缺口。
//
// 覆盖的 12 个场景（运行后逐个打印 >>> 通过/失败）：
//   1 误封回归（正常用户 + 本群被禁言，restricted 已归零不得再自锁）
//   2 漏放回归（单字母正文 + 随机频道转发 + Faker 名）
//   3 真广告不回退      4 正常技术讨论拉了资料仍放行
//   5 指纹配额（domain 与 username 必须入库）
//   6 闸二冷却：同一人连发 3 条只拉 1 次资料，热路径零 getChatMember
//   7 闸二：昵称/用户名/正文全干净，广告【只在 bio】—— 必须封，且只花 1 个请求
//   8 闸三：发言过检后改 bio 且不再发言 —— 只能靠 cron 滚动复查抓到
//   9 入群 · chat_member 路径（自己点邀请链接进群，from === target）
//  10 入群 · new_chat_members 路径（被别人拉进群）
//  11 入群即进名册：干净入群 → 改 bio → 一句话没说过也被 cron 抓到
//  12 去重：两条入群路径都到达时只查 1 次 bio、名册只占 1 行
//
// 运行：node test_ad_bio_gates.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync(new URL('../_worker.js', import.meta.url), 'utf8');
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
	const normIn = (v) => v === undefined ? null : (typeof v === 'boolean' ? (v ? 1 : 0) : (typeof v === 'bigint' ? Number(v) : v));
	const normOut = (row) => { if (!row) return null; const o = {}; for (const k of Object.keys(row)) { const v = row[k]; o[k] = typeof v === 'bigint' ? Number(v) : v; } return o; };
	const exec = (sql, params) => {
		const st = db.prepare(sql);
		const bound = params.map(normIn);
		const up = sql.trim().slice(0, 6).toUpperCase();
		if (up === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) return { kind: 'rows', rows: st.all(...bound).map(normOut) };
		const info = st.run(...bound);
		return { kind: 'write', meta: { changes: Number(info?.changes || 0), last_row_id: Number(info?.lastInsertRowid || 0), duration: 0, rows_read: 0, rows_written: Number(info?.changes || 0) } };
	};
	const mk = (sql) => { const s = { sql, params: [] }; const api = { __d1: s,
		bind(...a) { s.params = a; return api; },
		async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
		async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, meta: r.meta }; },
		async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; } };
		return api; };
	return { __sqlite: db, prepare: mk,
		async exec(sql) { db.exec(sql); return { count: 1, duration: 0 }; },
		async batch(sts) { const list = Array.from(sts || []); const out = []; db.exec('BEGIN');
			try { for (const st of list) { const s = st?.__d1; if (!s) throw new Error('bad stmt'); const r = exec(s.sql, s.params);
				out.push(r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, meta: r.meta }); } db.exec('COMMIT'); }
			catch (e) { db.exec('ROLLBACK'); throw e; } return out; },
		query(sql, ...p) { return db.prepare(sql).all(...p.map(normIn)).map(normOut); } };
}

// ---------- Bot API mock：可按 user_id 定制 getChat / getChatMember ----------
const calls = [];
let profiles = {};				// user_id -> { first_name, last_name, bio }
let memberStatus = {};			// user_id -> status

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777000, is_bot: true, username: 'AdGuardTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 5000 + calls.length } };
		case 'getChat': {
			const p = profiles[String(body?.chat_id)] || {};
			return { ok: true, result: { id: body?.chat_id, first_name: p.first_name ?? '未知', last_name: p.last_name, username: p.username, bio: p.bio ?? '' } };
		}
		case 'getChatMember': {
			const st = memberStatus[String(body?.user_id)] || 'member';
			return { ok: true, result: { status: st, user: { id: body?.user_id } } };
		}
		case 'getChatAdministrators': return { ok: true, result: [] };
		default: return { ok: true, result: true };
	}
}

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder,
	Response, Request, Headers, atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const method = String(url).split('/').pop();
		let body = null;
		try { body = init?.body ? JSON.parse(init.body) : null; } catch (_) { body = null; }
		calls.push({ method, body });
		const payload = defaultPayload(method, body);
		return { ok: true, status: 200, async json() { return payload; }, async text() { return JSON.stringify(payload); } };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(stripExportDefault(src), sandbox, { filename: '_worker.js' });
const handler = sandbox.__handler;

const GROUP_ID = '-1001111111111';
function makeEnv() {
	return { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID, OWNER_IDS: '10001', DB: makeD1() };
}

async function sendUpdate(message, env) {
	const request = new Request('https://example.workers.dev/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), message })
	});
	return handler.fetch(request, env, { waitUntil() {} });
}

function groupMessage(from, text, extra = {}) {
	return {
		message_id: 900 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000),
		text,
		chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试群' },
		from: { id: from.id, is_bot: false, first_name: from.first_name, last_name: from.last_name, username: from.username },
		...extra
	};
}

// ---------- chat_member update 与入群 service message 的构造器 ----------
// 两者对应 Telegram 的两条入群路径，测试里必须分别喂，因为代码对它们的处理不同。
async function sendRawUpdate(update, env) {
	const request = new Request('https://example.workers.dev/', {
		method: 'POST', headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...update })
	});
	return handler.fetch(request, env, { waitUntil() {} });
}

// by = null 表示【自己点链接进群】—— 此时 from === target，
// 正是 handleChatMemberUpdate 里那个 `targetIdStr === fromIdStr` 直接 return 的分支。
function chatMemberUpdate(user, { oldStatus = 'left', newStatus = 'member', by = null } = {}) {
	const u = { id: user.id, is_bot: false, first_name: user.first_name, last_name: user.last_name, username: user.username };
	return {
		chat_member: {
			chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试群' },
			from: by ? { id: by, is_bot: false, first_name: '拉人的' } : u,
			date: Math.floor(Date.now() / 1000),
			old_chat_member: { user: u, status: oldStatus },
			new_chat_member: { user: u, status: newStatus }
		}
	};
}

// new_chat_members service message：被别人拉进群时 Telegram 发的那条。
function joinMessage(members) {
	return {
		message_id: 800 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000),
		chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试群' },
		from: { id: 20002, is_bot: false, first_name: '拉人的' },
		new_chat_members: members.map((m) => ({
			id: m.id, is_bot: !!m.is_bot, first_name: m.first_name, last_name: m.last_name, username: m.username
		}))
	};
}

function report(label, env, userId) {
	const black = env.DB.query('SELECT id FROM blacklist WHERE id = ?', String(userId));
	const banned = calls.filter((c) => c.method === 'banChatMember' && String(c.body?.user_id) === String(userId)).length;
	const obs = env.DB.query('SELECT score, layer, reasons FROM ad_user_screening WHERE user_id = ?', String(userId));
	const notice = calls.filter((c) => c.method === 'sendMessage').map((c) => String(c.body?.text || '')).join('\n');
	const scoreLine = notice.match(/得分：<b>(\d+)<\/b> \/ 阈值 (\d+)/);
	const reasonLines = notice.split('\n').filter((l) => l.startsWith('· '));
	console.log('\n===== ' + label + ' =====');
	console.log('  加黑名单     : ' + (black.length ? '是' : '否'));
	console.log('  调用封禁接口 : ' + banned + ' 次');
	console.log('  观察窗口记录 : ' + (obs.length ? JSON.stringify(obs[0]) : '无'));
	console.log('  通知里的得分 : ' + (scoreLine ? scoreLine[1] + ' / 阈值 ' + scoreLine[2] : '（未发通知）'));
	if (reasonLines.length) { console.log('  判定依据     :'); for (const r of reasonLines) console.log('    ' + r.replace(/<\/?[a-z]+>/g, '')); }
	return { blacklisted: black.length > 0, banned, observed: obs[0] || null, score: scoreLine ? Number(scoreLine[1]) : null };
}

// ---------- 判定与计数 ----------
// 每个场景末尾调一次。除了打印那行 >>>，还要把结果计入汇总 —— 否则这个文件只是
// 一堆 console.log，跑完得靠人眼扫一遍才知道有没有炸，在 CI 里等于没跑。
const results = [];
function verdict(name, ok, passText, failText) {
	results.push({ name, ok: !!ok });
	console.log('  >>> ' + (ok ? passText : failText));
}

// ============================================================
//  场景 1：2026-09 误封的正常用户
//  真实资料：My fuhrer / @suqi_20 / id 1335910695 / 简介「西嗨~ 🙋 私聊请通过」
//  线上被判 7/7 分并全群封禁 14/14。修复后应放行。
//  额外把 getChatMember 置成 restricted —— 复现「bot 先禁言、再拿这个状态给自己补分」的循环自锁。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	const uid = 1335910695;
	profiles = { [String(uid)]: { first_name: 'My fuhrer', username: 'suqi_20', bio: '西嗨~ 🙋 私聊请通过' } };
	memberStatus = { [String(uid)]: 'restricted' };
	await sendUpdate(groupMessage({ id: uid, first_name: 'My fuhrer', username: 'suqi_20' }, '有人在吗'), env);
	const r = report('场景 1 · 误封样本（正常用户 + 本群被禁言）', env, uid);
	const ok = !r.blacklisted && r.banned === 0;
	verdict('场景 1 · 误封回归（正常用户 + 本群被禁言）', ok, '通过：未加黑、未封禁', '失败：仍被处置');
}

// ============================================================
//  场景 2：漏放样本 —— 引用体广告（线上漏放 50+ 个号的真实形态）
//
//  真实实例（2026-09-08 主人发的截图）：昵称 Maybell Tillman、本人正文只有一个字母 `c`、
//  引用块里是「操逼赚钱，招探花9000一单，提供设备」，引用来源频道 bxbd。
//
//  【这条用例为什么改过】原先建模的是「单字母正文 + 无元音随机频道名转发」，
//  靠 +4 随机频道名、+4 极短正文与转发同现来定罪。2026-09-08 主人下令
//  「去除频道跟群组判定」后那两项归零，用例必然变红。而复盘发现漏放的真正根因
//  也不是频道判定 —— 是【引用体一个字都没读】：getAdDetectionBodyText 与热路径的
//  text 取值都只看 text / caption，广告词全在引用的那条消息里，
//  评分层、card、identity、body 四条路一个词都取不到，一路 0 分走到底。
//  所以本用例改按真实形态断言：靠新增的 quoted 通道定罪。
//
//  预期：quoted 通道命中形态 A —— 「提供设备」在 AD_TRADE_VERBS（招揽意图成立），
//  「赚钱」在 AD_BIZ_PATTERNS（行业指向成立），两类同现；
//  且本人正文只有 1 个字符（≤ AD_QUOTED_KILL_MAX_OWN_TEXT）、不含举报语义。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	const uid = 88800001;
	profiles = { [String(uid)]: { first_name: 'Maybell Tillman', bio: '' } };
	memberStatus = { [String(uid)]: 'member' };
	await sendUpdate(groupMessage(
		{ id: uid, first_name: 'Maybell Tillman' },
		'c',
		// external_reply = 引用【其它聊天】里的消息。图 34 那个引用块顶上是频道名 bxbd，
		// 走的就是这个字段。客户端渲染与 quote / reply_to_message 完全相同，从截图分不出，
		// 所以代码里三个字段全读，测试也三个形态各测一条（2 / 2d / 2e）。
		{ external_reply: {
			origin: { type: 'channel', chat: { id: -1009999999, type: 'channel', title: 'bxbd', username: 'bxbdzxc' }, message_id: 12 },
			chat: { id: -1009999999, type: 'channel', title: 'bxbd', username: 'bxbdzxc' },
			text: '操逼赚钱，招探花9000一单，提供设备'
		} }
	), env);
	const r = report('场景 2 · 漏放样本（单字母正文 + 引用体广告 · external_reply）', env, uid);
	const ok = r.blacklisted && r.banned > 0;
	verdict('场景 2 · 漏放回归（单字母正文 + 引用体广告）', ok, '通过：已加黑并封禁，得分 ' + r.score, '失败：仍被放行');
}

// ============================================================
//  场景 2b：引用体查杀的门槛二 —— 群友引用广告来举报，必须放行
//  引用体与场景 2 完全一样（照样满是广告词），差别只在本人正文写了「广告」两个字。
//  这是本通道最大的误封面：正常群友引用广告吐槽一句，引用体里照样全是广告词。
//  刻意用 external_reply 而不是 reply_to_message —— 后者会先撞上回复学习那条路，
//  测出来的就不是 quoted 通道的门槛二了。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	const uid = 88800011;
	profiles = { [String(uid)]: { first_name: '王小明', bio: '' } };
	memberStatus = { [String(uid)]: 'member' };
	await sendUpdate(groupMessage(
		{ id: uid, first_name: '王小明' },
		'广告',
		{ external_reply: {
			origin: { type: 'channel', chat: { id: -1009999999, type: 'channel', title: 'bxbd', username: 'bxbdzxc' }, message_id: 13 },
			chat: { id: -1009999999, type: 'channel', title: 'bxbd', username: 'bxbdzxc' },
			text: '操逼赚钱，招探花9000一单，提供设备'
		} }
	), env);
	const r = report('场景 2b · 引用广告来举报的群友（正文「广告」）', env, uid);
	const ok = !r.blacklisted && r.banned === 0;
	verdict('场景 2b · 引用体门槛二（举报语义放行）', ok, '通过：未加黑、未封禁', '失败：举报的人被误封了');
}

// ============================================================
//  场景 2c：引用体查杀的门槛一 —— 本人正文超过 4 个字符即放行
//  「你们看看这个」6 个字，不含任何举报词，门槛二拦不住它，只有门槛一能放行。
//  这条正是两道门槛不冗余的证明：门槛二管短举报语，门槛一管「正常说了话」。
//  代价是广告号多打几个正常字就能绕过 —— 主人认可这一档，那种变体交给 /spam 学指纹。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	const uid = 88800012;
	profiles = { [String(uid)]: { first_name: '李静', bio: '' } };
	memberStatus = { [String(uid)]: 'member' };
	await sendUpdate(groupMessage(
		{ id: uid, first_name: '李静' },
		'你们看看这个',
		{ external_reply: {
			origin: { type: 'channel', chat: { id: -1009999999, type: 'channel', title: 'bxbd', username: 'bxbdzxc' }, message_id: 14 },
			chat: { id: -1009999999, type: 'channel', title: 'bxbd', username: 'bxbdzxc' },
			text: '操逼赚钱，招探花9000一单，提供设备'
		} }
	), env);
	const r = report('场景 2c · 正文写了正常话（6 字，无举报词）', env, uid);
	const ok = !r.blacklisted && r.banned === 0;
	verdict('场景 2c · 引用体门槛一（正文非空即放行）', ok, '通过：未加黑、未封禁', '失败：门槛一失效');
}

// ============================================================
//  场景 2d：reply_to_message 形态 —— 同群回复也要读到
//  「频道关联讨论组里回复频道自动转发的帖子」走的是这个字段，客户端渲染和场景 2 一样。
//  只测「字段能不能读到」，判据与场景 2 同一套。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	const uid = 88800013;
	profiles = { [String(uid)]: { first_name: 'Doreen Kirkland', bio: '' } };
	memberStatus = { [String(uid)]: 'member' };
	await sendUpdate(groupMessage(
		{ id: uid, first_name: 'Doreen Kirkland' },
		'v',
		{ reply_to_message: {
			message_id: 555,
			date: Math.floor(Date.now() / 1000),
			chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试群' },
			from: { id: 777123456, is_bot: false, first_name: '频道搬运' },
			text: '长期收购实名号，日结佣金，提供设备'
		} }
	), env);
	const r = report('场景 2d · 引用体广告（reply_to_message 形态）', env, uid);
	const ok = r.blacklisted && r.banned > 0;
	verdict('场景 2d · 引用体三字段覆盖（reply_to_message）', ok, '通过：已加黑并封禁，得分 ' + r.score, '失败：这个字段没读到');
}

// ============================================================
//  场景 2e：quote 片段形态 + 技术豁免闸门
//  quote 是 2023 新增的「手选一段文字引用」，本体在 message.quote.text。
//  这里同时验豁免闸门：引用体命中广告构词（「出租」× 「虚拟币」）但含技术豁免词
//  （机器人 / vless / 节点订阅 / 教程）且【没有强交易动词】→ 放行。
//  对照组紧跟在后面：同一形态去掉豁免词、换成强动词 → 必须定罪。
//  两条一起才说明放行是豁免闸门干的，不是门槛一二顺手挡掉的。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	const uid = 88800014;
	profiles = { [String(uid)]: { first_name: '张伟', bio: '' } };
	memberStatus = { [String(uid)]: 'member' };
	await sendUpdate(groupMessage(
		{ id: uid, first_name: '张伟' },
		'n',
		{ quote: { text: '出租虚拟币行情机器人，附 vless 节点订阅教程', position: 0, is_manual: true } }
	), env);
	const r = report('场景 2e · 引用体是技术贴（quote 片段 + 豁免词）', env, uid);
	const ok = !r.blacklisted && r.banned === 0;
	verdict('场景 2e · 引用体技术豁免（无强动词则放行）', ok, '通过：未加黑、未封禁', '失败：技术贴被引用就定罪了');
}

{
	const env = makeEnv();
	calls.length = 0;
	const uid = 88800015;
	profiles = { [String(uid)]: { first_name: '刘洋', bio: '' } };
	memberStatus = { [String(uid)]: 'member' };
	await sendUpdate(groupMessage(
		{ id: uid, first_name: '刘洋' },
		'n',
		// 与 2e 同一个 quote 字段、同一种句式，只把技术术语换成强交易动词 ——
		// 「收购」在 AD_TRADE_VERBS，按不对称口径，塞术语也不免死。
		{ quote: { text: '收购虚拟币账号，USDT 秒结，vless 节点也收', position: 0, is_manual: true } }
	), env);
	const r = report('场景 2e 对照 · 夹带术语的引用体广告（有强动词）', env, uid);
	const ok = r.blacklisted && r.banned > 0;
	verdict('场景 2e 对照 · 有强动词则不免死（quote 片段）', ok, '通过：已加黑并封禁，得分 ' + r.score, '失败：塞几个术语就溜过去了');
}

// ============================================================
//  场景 3：不回退验证 —— 真广告仍要被抓
//  强动词 + 业务词协同，此前 6 分进观察窗口，加弱动词后应更高。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	const uid = 88800002;
	profiles = { [String(uid)]: { first_name: '💚高价收网赚号💚', bio: '长期收购网赚账号，老账号优先加价，私聊我' } };
	memberStatus = { [String(uid)]: 'member' };
	await sendUpdate(groupMessage({ id: uid, first_name: '💚高价收网赚号💚' }, '收U秒结 私聊我'), env);
	const r = report('场景 3 · 真广告（不回退验证）', env, uid);
	const ok = r.blacklisted || r.observed;
	verdict('场景 3 · 真广告不回退', ok, '通过：' + (r.blacklisted ? '已封禁，得分 ' + r.score : '进入观察窗口 ' + JSON.stringify(r.observed)), '失败：完全放行');
}

// ============================================================
//  场景 4：正常技术讨论 —— 会拉资料（预筛门槛已移除），但必须判定放行
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	const uid = 88800003;
	profiles = { [String(uid)]: { first_name: '张伟', bio: '搞 CDN 的' } };
	memberStatus = { [String(uid)]: 'member' };
	await sendUpdate(groupMessage({ id: uid, first_name: '张伟' }, '这个 worker 的 KV 换 D1 之后延迟低了不少'), env);
	const r = report('场景 4 · 正常技术讨论（拉资料但放行）', env, uid);
	const getChatCalls = calls.filter((c) => c.method === 'getChat').length;
	console.log('  getChat 调用   : ' + getChatCalls + ' 次（预筛已移除，应为 1）');
	const ok = !r.blacklisted && r.banned === 0 && !r.observed && getChatCalls === 1;
	verdict('场景 4 · 正常技术讨论拉了资料仍放行', ok, '通过：拉了资料仍放行', '失败');
}

// ============================================================
//  场景 6：getChat 5 分钟缓存 —— 同一人连发 3 条，只应拉一次资料
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	const uid = 88800006;
	profiles = { [String(uid)]: { first_name: '话多的人', bio: '' } };
	memberStatus = { [String(uid)]: 'member' };
	for (const t of ['在吗', '刚才那个问题', '解决了谢谢']) {
		await sendUpdate(groupMessage({ id: uid, first_name: '话多的人' }, t), env);
	}
	const getChatCalls = calls.filter((c) => c.method === 'getChat').length;
	const memberCalls = calls.filter((c) => c.method === 'getChatMember').length;
	console.log('');
	console.log('===== 场景 6 · 冷却期内不重复拉资料（同一人连发 3 条）=====');
	// 方案 6 之后这两个期望值都变了：
	//   getChat：第 1 条走闸二拉资料并写 bio_checked_at；第 2、3 条被 shouldCheckAdBio
	//     按 3 天冷却直接挡在 fetchAdUserProfile 之前 —— 比命中 5 分钟缓存更早一层。
	//   getChatMember：detectAdOnMessage 热路径已完全不查（restricted 归零后返回值只用于
	//     填通知文案），所以是 0 而不是 3。
	console.log('  getChat 调用       : ' + getChatCalls + ' 次（应为 1，后两条被 3 天冷却挡住）');
	console.log('  getChatMember 调用 : ' + memberCalls + ' 次（应为 0，热路径已不查群内身份）');
	const ok = getChatCalls === 1 && memberCalls === 0;
	verdict('场景 6 · 闸二冷却（连发 3 条只拉 1 次资料）', ok, '通过：冷却生效且热路径零 getChatMember', '失败');
}

// ============================================================
//  场景 5：指纹配额 —— 长简介广告号必须学到 domain 与自身 username
//
//  原本防的是「keyword 短语把 domain 与 username 的配额挤干」
//  （长简介会在交易动词周边截出十几条 keyword）。
//  domain 是权重 1 的强指纹、username 是广告号自身 handle，两者都应入库。
//  bio 内 @提及（@promo_channel_x）不应学成 username 指纹——@提及扫描路径已永久删除。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	await sandbox.adDetectionReady(env);
	const payload = { name: '💚高价收网赚号💚', username: '@ad_seller_001',
		bio: '长期收购网 du 商宝账号，老账号优先加价，进群联系 @promo_channel_x 或 evil-shop.top', text: '', domains: [] };
	const learned = await sandbox.learnAdFingerprints(env, payload, { source: 'auto', createdBy: 'system' });
	const rows = env.DB.query('SELECT type, value FROM ad_fingerprints ORDER BY type, id');
	const byType = {};
	for (const r of rows) (byType[r.type] = byType[r.type] || []).push(r.value);
	console.log('\n===== 场景 5 · 指纹配额（长简介广告号）=====');
	console.log('  学到条数 : ' + learned.learned);
	for (const t of Object.keys(byType).sort()) console.log('  ' + t.padEnd(9) + ': ' + byType[t].length + ' 条  ' + JSON.stringify(byType[t]).slice(0, 150));
	const ok = (byType.domain || []).includes('evil-shop.top')
		&& (byType.username || []).includes('@ad_seller_001')
		&& !(byType.username || []).includes('@promo_channel_x');
	verdict('场景 5 · 指纹配额（domain 入库、自身 username 入库、bio @提及不入库）', ok,
		'通过：domain 未被 keyword 挤掉，自身 username 入库，bio @提及未学',
		'失败：domain 或自身 username 被挤掉，或 bio @提及意外入库');
}

// ============================================================
//  场景 7：闸二 —— 昵称干净 + 用户名干净 + 正文干净，广告【只在 bio 里】
//  这是用户点名过的那一类：「人家简介都明显广告了 你放过几个意思呢」。
//  闸一（零成本结构判定）在这个样本上必然放行 —— 它看不到 bio。
//  能不能抓住，全靠闸二在「首次发言」这一次机会里花 1 个请求把资料拉下来。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	sandbox.invalidateAdAdminCache();
	sandbox.invalidateAdProfileCache();
	const uid = 7700001;
	profiles = { [String(uid)]: {
		first_name: '小李',
		bio: '专业出售各类实名账号，微信/支付宝/银行卡四件套，长期收U秒结，进群 t.me/evil_shop_x 或私聊 @li_shop_888'
	} };
	memberStatus = {};
	await sendUpdate(groupMessage({ id: uid, first_name: '小李' }, '在吗'), env);
	const r = report('场景 7 · 闸二（昵称/正文全干净，广告只在 bio）', env, uid);
	const getChatCalls = calls.filter((c) => c.method === 'getChat' && String(c.body?.chat_id) === String(uid)).length;
	console.log('  getChat 调用 : ' + getChatCalls + ' 次（应为 1 —— 闸二每人一次的那一次）');
	const ok = r.blacklisted && r.banned > 0 && getChatCalls === 1;
	verdict('场景 7 · 闸二（广告只在 bio）', ok, '通过：只凭 bio 定罪，且只花 1 个请求', '失败：bio 广告被放过');
}

// ============================================================
//  场景 8：闸三 —— 先用干净资料混进来、发一句正常话过检，事后才把 bio 改成广告
//  这类号改完就【不再发言】，消息路径（闸一/闸二）永远触发不到它第二次，
//  只能靠 cron 定时滚动复查。验证方式：把 bio_checked_at 推回 4 天前
//  （超过 AD_BIO_RECHECK_DAYS = 3），换掉 bio，然后直接跑 runAdBioRescan。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	sandbox.invalidateAdAdminCache();
	sandbox.invalidateAdProfileCache();
	const uid = 7700002;

	// 第一步：干净资料首次发言 —— 应当过检，并在名册里留下一行。
	profiles = { [String(uid)]: { first_name: '张伟', bio: '喜欢摄影和徒步' } };
	memberStatus = {};
	await sendUpdate(groupMessage({ id: uid, first_name: '张伟' }, '这个报错看着像超时了'), env);
	const passedFirst = env.DB.query('SELECT id FROM blacklist WHERE id = ?', String(uid)).length === 0;
	const roster = env.DB.query('SELECT user_id, chat_id, bio_checked_at FROM ad_group_members WHERE user_id = ?', String(uid));

	// 第二步：把冷却计时器推回 4 天前，并换成广告 bio（同时清掉 getChat 的 5 分钟缓存，
	// 否则拉到的还是上一版干净资料 —— 那就测不到「改了 bio」这件事）。
	const staleAt = Math.floor(Date.now() / 1000) - 4 * 24 * 3600;
	env.DB.__sqlite.exec('UPDATE ad_group_members SET bio_checked_at = ' + staleAt + " WHERE user_id = '" + uid + "'");
	profiles = { [String(uid)]: {
		first_name: '张伟',
		bio: '高价收各种网赚账号，老号优先加价，秒结不拖，进群 t.me/promo_x_888'
	} };
	sandbox.invalidateAdProfileCache();

	// 第三步：跑闸三。批间隔压到 0 —— 3 秒 × 若干批只会让离线验证白等。
	calls.length = 0;
	const summary = await sandbox.runAdBioRescan(env, { dailyLimit: 50, batchSize: 10, intervalMs: 0 });

	const r = report('场景 8 · 闸三（发言后改 bio、不再发言）', env, uid);
	console.log('  首次发言是否过检 : ' + (passedFirst ? '是（符合预期，干净资料）' : '否'));
	console.log('  名册留痕         : ' + (roster.length ? JSON.stringify(roster[0]) : '无（闸三就没有扫描源了）'));
	console.log('  扫描结果         : ' + JSON.stringify(summary));
	const ok = passedFirst && roster.length === 1 && r.blacklisted && r.banned > 0 && summary.banned >= 1;
	verdict('场景 8 · 闸三（发言后改 bio 且不再发言）', ok, '通过：cron 抓住了事后改 bio 的逃逸', '失败');
}

// ============================================================
//  场景 9：入群检测 · chat_member 路径（自己点邀请链接进群）
//  这是方案 C 补的核心缺口。这条路上 from === target，代码里
//  `if (targetIdStr === fromIdStr) return;` 会直接放行，
//  补丁前这个号连一次 getChat 都不会被拉，bio 里写满广告也照样进群待着。
//  它【不发 new_chat_members】—— 所以 detectAdOnJoin 一次都不执行。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	sandbox.invalidateAdAdminCache();
	sandbox.invalidateAdProfileCache();
	const uid = 7700003;
	const user = { id: uid, first_name: '小张' };
	profiles = { [String(uid)]: {
		first_name: '小张',
		bio: '出售实名账号，四件套齐全，长期收U秒结，联系 @li_shop_888 或 evil-shop.top'
	} };
	memberStatus = {};
	await sendRawUpdate(chatMemberUpdate(user), env);			// by 省略 = 自己进群
	const r = report('场景 9 · 入群检测（chat_member 路径，自己点链接进群）', env, uid);
	const getChatCalls = calls.filter((c) => c.method === 'getChat' && String(c.body?.chat_id) === String(uid)).length;
	console.log('  getChat 调用 : ' + getChatCalls + ' 次（应为 1 —— 入群当场拉一次资料）');
	const ok = r.blacklisted && r.banned > 0 && getChatCalls === 1;
	verdict('场景 9 · 入群检测（chat_member 路径）', ok,
		'通过：自己点链接进群也被当场查 bio 并封禁', '失败：chat_member 路径仍然放过 bio 广告');
}

// ============================================================
//  场景 10：入群检测 · new_chat_members 路径（被别人拉进群）
//  回归用：detectAdOnJoin 的循环体被换成了 screenAdJoinMember，
//  这条原有路径必须仍然生效，不能因为抽函数而失灵。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	sandbox.invalidateAdAdminCache();
	sandbox.invalidateAdProfileCache();
	const uid = 7700004;
	profiles = { [String(uid)]: {
		first_name: '客服小王',
		username: 'kf_shop_x',
		bio: '高价收网赚账号，秒结不拖，进群 t.me/promo_x_888'
	} };
	memberStatus = {};
	await sendUpdate(joinMessage([{ id: uid, first_name: '客服小王', username: 'kf_shop_x' }]), env);
	const r = report('场景 10 · 入群检测（new_chat_members 路径，被拉进群）', env, uid);
	const ok = r.blacklisted && r.banned > 0;
	verdict('场景 10 · 入群检测（new_chat_members 路径）', ok,
		'通过：抽成 screenAdJoinMember 后原路径仍生效', '失败：原入群检测被改坏了');
}

// ============================================================
//  场景 11：入群即进名册 —— 方案 C 的第二个修复
//  干净资料入群（不该被封），但必须留在 ad_group_members 里。
//  补丁前名册只在 detectAdOnMessage 里写，也就是【只有发言过的人才在册】：
//  一个入群时干净、事后改成广告 bio、并且从不发言的号，闸三 cron 也扫不到他。
//  验证链：干净入群 → 在册 → 改 bio → 推回冷却期 → 跑 cron → 必须封。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	sandbox.invalidateAdAdminCache();
	sandbox.invalidateAdProfileCache();
	const uid = 7700005;
	const user = { id: uid, first_name: '李雷' };
	profiles = { [String(uid)]: { first_name: '李雷', bio: '搞后端的，平时爬山' } };
	memberStatus = {};

	await sendRawUpdate(chatMemberUpdate(user), env);
	const cleanPass = env.DB.query('SELECT id FROM blacklist WHERE id = ?', String(uid)).length === 0;
	const roster = env.DB.query('SELECT user_id, chat_id FROM ad_group_members WHERE user_id = ?', String(uid));

	// 事后改 bio，并把冷却计时器推回 4 天前（超过 AD_BIO_RECHECK_DAYS = 3）。
	// 全程【不发任何消息】—— 这个号入群后一句话都没说过。
	const staleAt = Math.floor(Date.now() / 1000) - 4 * 24 * 3600;
	env.DB.__sqlite.exec('UPDATE ad_group_members SET bio_checked_at = ' + staleAt + " WHERE user_id = '" + uid + "'");
	profiles = { [String(uid)]: {
		first_name: '李雷',
		bio: '收各种实名老号，价格好商量，秒结，@li_shop_888'
	} };
	sandbox.invalidateAdProfileCache();

	calls.length = 0;
	const summary = await sandbox.runAdBioRescan(env, { dailyLimit: 50, batchSize: 10, intervalMs: 0 });
	const r = report('场景 11 · 入群即进名册（干净入群→改 bio→cron 抓）', env, uid);
	console.log('  干净入群是否放行 : ' + (cleanPass ? '是（符合预期）' : '否'));
	console.log('  入群后是否在册   : ' + (roster.length ? '是 ' + JSON.stringify(roster[0]) : '否（闸三就没有扫描源）'));
	console.log('  扫描结果         : ' + JSON.stringify(summary));
	const ok = cleanPass && roster.length === 1 && r.blacklisted && r.banned > 0 && summary.banned >= 1;
	verdict('场景 11 · 入群即进名册（从未发言也能被 cron 复查）', ok,
		'通过：入群写册，一句话没说过的号也被 cron 抓到', '失败：入群不进名册，从未发言的号仍是盲区');
}

// ============================================================
//  场景 12：去重 —— 被别人拉进群时两种 update 都会到
//  同一个人先后走 new_chat_members 与 chat_member 两条路，
//  不能因此查两次 bio。复用闸二那把三天冷却锁挡住第二次即可。
// ============================================================
{
	const env = makeEnv();
	calls.length = 0;
	sandbox.invalidateAdAdminCache();
	sandbox.invalidateAdProfileCache();
	const uid = 7700006;
	const user = { id: uid, first_name: '王芳' };
	profiles = { [String(uid)]: { first_name: '王芳', bio: '前端，喜欢猫' } };
	memberStatus = {};

	// 两条路径先后到达（真实场景里被拉进群就是这样）
	await sendUpdate(joinMessage([{ id: uid, first_name: '王芳' }]), env);
	await sendRawUpdate(chatMemberUpdate(user, { by: 20002 }), env);

	const getChatCalls = calls.filter((c) => c.method === 'getChat' && String(c.body?.chat_id) === String(uid)).length;
	const rows = env.DB.query('SELECT COUNT(*) AS n FROM ad_group_members WHERE user_id = ?', String(uid));
	const black = env.DB.query('SELECT id FROM blacklist WHERE id = ?', String(uid));
	console.log('\n===== 场景 12 · 去重（两种 update 都到达） =====');
	console.log('  getChat 调用 : ' + getChatCalls + ' 次（应为 1 —— 第二次被三天冷却挡住）');
	console.log('  名册行数     : ' + (rows[0]?.n ?? 0) + ' 行（应为 1 —— user_id 主键 upsert，不重复占行）');
	console.log('  是否被封     : ' + (black.length ? '是（不该，资料干净）' : '否'));
	const ok = getChatCalls === 1 && Number(rows[0]?.n) === 1 && black.length === 0;
	verdict('场景 12 · 去重（两条入群路径不重复查 bio）', ok,
		'通过：只查 1 次 bio、名册只占 1 行', '失败：重复查询或重复占行');
}

// ============================================================
//  汇总
// ============================================================
{
	const failedList = results.filter((r) => !r.ok);
	console.log('\n============================================================');
	console.log('广告检测三道闸端到端测试：通过 ' + (results.length - failedList.length) + ' 条，失败 ' + failedList.length + ' 条');
	console.log('============================================================');
	for (const r of failedList) console.log('  ✗ ' + r.name);
	// 非零退出码：让 CI 和手工连跑（for f in test_*.mjs）能真正判出失败。
	if (failedList.length > 0) process.exitCode = 1;
}
