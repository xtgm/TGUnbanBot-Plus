// 广告检测 v2 离线端到端测试。
// 与 test_export.mjs / test_leavegroup.mjs 同一范式：vm 加载 _worker.js 的 default export，
// 全部 Telegram Bot API 走 fetch mock；D1 用 node:sqlite 做真实 SQLite 后端，
// 保证 ON CONFLICT / AUTOINCREMENT / UNIQUE 索引 / batch 这些语义与线上 D1 一致。
// 运行：node test_ad_detection.mjs

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
	let depth = 0;
	let i = braceStart;
	for (; i < source.length; i++) {
		if (source[i] === '{') depth += 1;
		else if (source[i] === '}') {
			depth -= 1;
			if (depth === 0) { i += 1; break; }
		}
	}
	if (source[i] === ';') i += 1;
	return source.slice(0, start) + 'globalThis.__handler = ' + source.slice(start + 'export default'.length, i) + ';' + source.slice(i);
}

// ---------- 真实 SQLite 驱动的 D1 兼容层 ----------
// D1 用到的 API 面（全文件 grep 确认）：prepare().bind().first()/run()/all()、DB.exec()、DB.batch()。
function makeD1() {
	const db = new DatabaseSync(':memory:');
	const normIn = (v) => {
		if (v === undefined) return null;
		if (typeof v === 'boolean') return v ? 1 : 0;
		if (typeof v === 'bigint') return Number(v);
		return v;
	};
	const normOut = (row) => {
		if (!row) return null;
		const out = {};
		for (const key of Object.keys(row)) {
			const value = row[key];
			out[key] = typeof value === 'bigint' ? Number(value) : value;
		}
		return out;
	};
	const exec = (sql, params) => {
		const statement = db.prepare(sql);
		const bound = params.map(normIn);
		const upper = sql.trim().slice(0, 6).toUpperCase();
		if (upper === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) {
			const rows = statement.all(...bound).map(normOut);
			return { kind: 'rows', rows };
		}
		const info = statement.run(...bound);
		return {
			kind: 'write',
			meta: {
				changes: Number(info?.changes || 0),
				last_row_id: Number(info?.lastInsertRowid || 0),
				duration: 0,
				rows_read: 0,
				rows_written: Number(info?.changes || 0)
			}
		};
	};
	const makeStatement = (sql) => {
		const state = { sql, params: [] };
		const api = {
			__d1: state,
			bind(...args) { state.params = args; return api; },
			async first() {
				const result = exec(state.sql, state.params);
				if (result.kind === 'rows') return result.rows[0] ?? null;
				return null;
			},
			async run() {
				const result = exec(state.sql, state.params);
				if (result.kind === 'rows') return { success: true, results: result.rows, meta: { changes: 0, duration: 0 } };
				return { success: true, meta: result.meta };
			},
			async all() {
				const result = exec(state.sql, state.params);
				if (result.kind === 'rows') return { success: true, results: result.rows, meta: { changes: 0, duration: 0 } };
				return { success: true, results: [], meta: result.meta };
			}
		};
		return api;
	};
	return {
		__sqlite: db,
		prepare: (sql) => makeStatement(sql),
		async exec(sql) {
			db.exec(sql);
			return { count: 1, duration: 0 };
		},
		async batch(statements) {
			const list = Array.from(statements || []);
			const out = [];
			db.exec('BEGIN');
			try {
				for (const statement of list) {
					const state = statement?.__d1;
					if (!state) throw new Error('batch 收到非本层生成的 statement');
					const result = exec(state.sql, state.params);
					if (result.kind === 'rows') out.push({ success: true, results: result.rows, meta: { changes: 0, duration: 0 } });
					else out.push({ success: true, meta: result.meta });
				}
				db.exec('COMMIT');
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
			return out;
		},
		query(sql, ...params) {
			return db.prepare(sql).all(...params).map(normOut);
		}
	};
}

// ---------- 断言 ----------
let pass = 0;
let fail = 0;
const failures = [];

function assert(name, condition, detail = '') {
	if (condition) {
		pass += 1;
		console.log(`  OK   ${name}`);
	} else {
		fail += 1;
		failures.push(name);
		console.log(`  FAIL ${name}${detail ? ' — ' + String(detail).slice(0, 300) : ''}`);
	}
}

function section(title) {
	console.log(`\n${title}`);
}

// ---------- Telegram Bot API mock ----------
const calls = [];
let apiHandlers = {};

function setApi(next = {}) {
	apiHandlers = next;
}

function resetCalls() {
	calls.length = 0;
	setApi();
	// 清掉管理员列表缓存。它是模块级 Map，跨场景存活：
	// 上一个场景缓存的「本群管理员是空的」会让下一个场景把管理员当普通成员判定。
	// 生产里由 chat_member 事件驱动失效，测试里靠这一行做场景隔离。
	// try 守卫：resetCalls 在 W 完成初始化之前也会被调用一次（模块顶层），
	// 那时 W 处于 TDZ —— 连 typeof W 都会抛 ReferenceError，所以必须用 try 而非 typeof。
	// 那一次调用时还没有任何缓存可清，吞掉即可。
	try { W.invalidateAdAdminCache(); } catch { /* W 尚未初始化，无缓存可清 */ }
}

function countCalls(method) {
	return calls.filter((c) => c.method === method).length;
}

function lastSent() {
	return String(calls.filter((c) => c.method === 'sendMessage').at(-1)?.body?.text || '');
}

function allSentText() {
	return calls.filter((c) => c.method === 'sendMessage').map((c) => String(c.body?.text || '')).join('\n---\n');
}

function defaultPayload(method, body) {
	switch (method) {
		case 'getMe': return { ok: true, result: { id: 777000, is_bot: true, username: 'AdGuardTestBot' } };
		case 'sendMessage': return { ok: true, result: { message_id: 5000 + calls.length } };
		case 'getChat': return { ok: true, result: { id: body?.chat_id, first_name: '未知', bio: '' } };
		case 'getChatMember': return { ok: true, result: { status: 'member', user: { id: body?.user_id } } };
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

const handler = sandbox.__handler;
const GROUP_ID = '-1001111111111';
const OWNER_ID = 10001;

function makeEnv(extra = {}) {
	return {
		TOKEN: 'TESTTOKEN',
		BOT_TOKEN: '123456:fake',
		GROUP_ID,
		OWNER_IDS: String(OWNER_ID),
		DB: makeD1(),
		...extra
	};
}

// 伪 Workers AI：把文本映射成确定性向量，方便断言相似度分支。
// 「广告样本」共用同一向量，正常文本用正交向量，余弦相似度可控。
function makeFakeAI(mapper) {
	return {
		calls: 0,
		async run(model, input) {
			this.calls += 1;
			const text = String(input?.text?.[0] ?? '');
			const vector = mapper(text);
			return { data: [vector] };
		}
	};
}

// 假向量维度必须与产品的 AD_EMBEDDING_DIMENSION 一致：checkAdAiSimilarity 有维度守卫，
// 维度不符的样本会被直接跳过（避免 cosineSimilarity 的 Math.min 截断算出无意义相似度）。
//
// ⚠️ 不能写 sandbox.AD_EMBEDDING_DIMENSION —— vm 沙箱里只有【function 声明】会挂到全局对象，
// 顶层 const 属于词法作用域、读不到（实测为 undefined，会让 new Array(undefined) 产出空数组，
// 连带十余条 AI 层断言静默失败）。所以这里从源码文本里正则提取，既跟随产品值又不依赖沙箱导出。
const EMBED_DIM = Number(src.match(/const AD_EMBEDDING_DIMENSION = (\d+)/)?.[1]);
const EMBED_MODEL = src.match(/const AD_EMBEDDING_MODEL = '([^']+)'/)?.[1] || '';
if (!Number.isInteger(EMBED_DIM) || EMBED_DIM <= 0) {
	throw new Error('无法从 _worker.js 解析 AD_EMBEDDING_DIMENSION，测试无法继续');
}

function adVector(text) {
	const isAd = /收购|网赚|USDT|代理|洗急|稳宝|辣妞|风口|高价收|日结/.test(text);
	const base = new Array(EMBED_DIM).fill(0);
	if (isAd) { base[0] = 1; base[1] = 0.5; } else { base[2] = 1; base[3] = 0.5; }
	return base;
}

// ---------- webhook 驱动 ----------
// 收集本次请求里 ctx.waitUntil 收到的后台任务。sendFlashMessage 的延时撤回就挂在这上面，
// 空实现的 waitUntil 会让「闪屏是否真被撤回」这类断言永远测不到（曾因此漏掉一个
// ctx 传 null 导致闪屏永久残留的缺陷），所以这里必须真实收集。
let pendingWaits = [];
function resetWaits() { pendingWaits = []; }
// 跑完所有后台任务。sendFlashMessage 内部先 setTimeout(ttlMs) 再删消息，
// 用假定时器会牵连产品代码，这里直接 await 真实 promise —— 测试里 ttl 最长 8 秒，
// 故只在需要验证撤回的断言前调用，普通用例不必等。
async function flushWaits() {
	const tasks = pendingWaits;
	pendingWaits = [];
	await Promise.allSettled(tasks);
}
async function sendUpdate(update, env) {
	const request = new Request('https://example.workers.dev/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ update_id: Math.floor(Math.random() * 1e9), ...update })
	});
	const response = await handler.fetch(request, env, {
		waitUntil(promise) { pendingWaits.push(Promise.resolve(promise).catch(() => {})); }
	});
	return response;
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

function groupMessage(from, text, extra = {}) {
	return {
		message_id: 200 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000),
		text,
		chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
		from: { is_bot: false, ...from },
		...extra
	};
}

function joinMessage(members) {
	return {
		message_id: 300 + Math.floor(Math.random() * 1000),
		date: Math.floor(Date.now() / 1000),
		chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
		from: { id: members[0].id, is_bot: false, first_name: members[0].first_name || '新人' },
		new_chat_members: members.map((m) => ({ is_bot: false, ...m }))
	};
}

// 初始化模块级配置（BOT_TOKEN / GROUP_IDS / OWNER_IDS 由 fetch 入口的 applyConfig 写入）。
// 后面的纯函数单测依赖这些全局变量，所以必须先跑一次真实 webhook。
const bootEnv = makeEnv();
resetCalls();
await sendUpdate({ message: privateMessage(99999, 'hello') }, bootEnv);

const W = sandbox;										// worker 内部顶层函数（vm 脚本的函数声明会挂到全局）

section('[1] 结构化评分层（纯函数，零网络）');
{
	const adProfile = W.scoreAdProfile({
		firstName: '💚高价收网赚号💚',
		bio: '长期收购网 du 商宝账号，老账号优先加价'
	});
	assert('广告号资料得分 >= 封禁阈值 7', adProfile.score >= 7, JSON.stringify(adProfile));
	assert('广告号命中对称 emoji', adProfile.reasons.some((r) => r.includes('对称 emoji')), JSON.stringify(adProfile.reasons));
	assert('广告号命中交易动词', adProfile.tradeHits.length > 0, JSON.stringify(adProfile.tradeHits));
	assert('广告号命中业务关键词', adProfile.businessHits.length > 0, JSON.stringify(adProfile.businessHits));

	const normal = W.scoreAdProfile({ firstName: '张三', bio: '' });
	// 期望值 2026-09-08 从 0 改成 -1：评分层现在允许负分。
	// 「-1 名称无 emoji 且无 Bio」是普通用户的常态特征，给一分负分等于把正常用户
	// 往远离阈值的方向推一格 —— 这条断言的意义是「负分真的落了地」，不是「恰好为 0」。
	assert('普通用户资料得分为 -1（无 emoji 无 Bio 的负分）', normal.score === -1, JSON.stringify(normal));

	const tech = W.scoreAdProfile({ firstName: 'Alice Dev', bio: '开源 bot 双向机器人 github.com/alice' });
	// 期望值 2026-09-08 从 0 改成 -1：+2 昵称为机器生成型西方全名、-3 命中豁免词（双向/机器人/bot）。
	// 原断言写 0 是因为当时豁免减分被夹到 0；现在允许负分，豁免词才算真正生效 ——
	// 技术用户即使被昵称规则误加了 2 分，也会被豁免词按回负分。
	assert('技术用户被豁免词压到 -1 分', tech.score === -1, JSON.stringify(tech));
	assert('技术用户白名单域名不计分', !tech.reasons.some((r) => r.includes('引流链接')), JSON.stringify(tech.reasons));

	// getChatMember 的 restricted 语义是「在本群被禁言 / 限权」，不是「账号被 Telegram 官方限制」。
	// 断言历经两次修正，记录完整因果：
	//   最初锁死 +5 —— 这正是 2026-09 误封正常用户的根因：bot 自己禁言某人后，
	//   下一次判定时又拿这个由自己造成的状态补 5 分，与「弱动词 +2」凑够 7 分直接封禁。
	//   随后降到 +2 —— 缓解了「单个词凑够封禁线」，但自锁机制本身还在。
	//   现在归零（AD_RESTRICTED_STATUS_SCORE = 0，只记录不计分）—— 因为预筛门槛已移除，
	//   每条群消息都会查群内状态，任何正分都会作用到全群每个被禁言过的人的每一条消息上。
	// 该样本现在总分 -3 分：受限状态不计分、弱动词「有需要」不计分（2026-09-08 主人
	// 「单个词不计分」的口径），「私聊」已从弱动词移进 AD_EXEMPT_KEYWORDS → -3。
	// 期望值从 1 改成 -3，正是这三项改动叠加后的真实结果 —— 这个样本就是当年
	// 误封「西嗨~ 私聊请通过」那位用户的最小复现，现在离观察线 5 有 8 分的余量。
	const restricted = W.scoreAdProfile({ firstName: '路人', bio: '有需要私聊', status: 'restricted' });
	assert('restricted 只记录不计分（reasons 里有标注）', restricted.reasons.some((r) => r.includes('受限状态') && r.includes('不计分')), JSON.stringify(restricted.reasons));
	assert('restricted 不产生任何加分项', !restricted.reasons.some((r) => /^\+\d/.test(r) && r.includes('受限状态')), JSON.stringify(restricted.reasons));
	assert('restricted + 弱动词 + 豁免词 总分 -3 分，远低于观察线', restricted.score === -3, JSON.stringify(restricted));
	// 原断言要求「有需要 / 私聊」计 +1。2026-09-08 主人下令「单个词不封不计入分数，
	// 只有多个词才能计入分数」后，弱动词一律 0 分，且「私聊」整词移进豁免表 ——
	// 所以现在要断言的是这两条路都不再产生正分：弱动词带「不计分」标注，「私聊」走豁免减分。
	assert('「有需要」作为弱动词一律不计分', restricted.reasons.some((r) => r.includes('弱交易动词') && r.includes('不计分')), JSON.stringify(restricted.reasons));
	assert('「私聊」已移入豁免词并产生减分', restricted.reasons.some((r) => r.includes('豁免词') && r.includes('私聊')), JSON.stringify(restricted.reasons));
	assert('弱动词不再贡献任何 +1 项', !restricted.reasons.some((r) => r.startsWith('+1') && r.includes('弱交易动词')), JSON.stringify(restricted.reasons));

	const adText = W.scoreAdMessageText('长期收购网赚账号 USDT 秒结不拖欠');
	assert('广告正文得分 >= 4', adText.score >= 4, JSON.stringify(adText));
	const chatText = W.scoreAdMessageText('大家好，今天天气不错，一起吃饭吗');
	assert('正常聊天正文得分为 0', chatText.score === 0, JSON.stringify(chatText));

	// 协同分：两类词单独命中都可能是正常语境，同现才是广告话术的稳定特征。
	// 线上实测漏放案例：这两段原本各只得 4 分（低于观察阈值 5 直接放行），
	// 加协同分后进观察窗口，窗口内再发一条即累加过封禁线。
	const comboProfile = W.scoreAdProfile({ firstName: '高价收网赚号', bio: '长期收购网 du 商宝账号，老账号优先加价' });
	assert('协同分：资料两类词同现得 6 分', comboProfile.score === 6, JSON.stringify(comboProfile));
	assert('协同分：资料判据写明同现', comboProfile.reasons.some((r) => r.includes('交易动词 + 业务关键词同现')), JSON.stringify(comboProfile.reasons));
	const comboText = W.scoreAdMessageText('高价收网赚账号 长期收购 USDT 日结秒到 需要的私我');
	assert('协同分：正文两类词同现得 6 分', comboText.score === 6, JSON.stringify(comboText));
	assert('协同分：正文判据写明同现', comboText.reasons.some((r) => r.includes('正文交易动词 + 业务关键词同现')), JSON.stringify(comboText.reasons));
	// 只命中一类时不得加协同分，否则等于变相提高单项权重、把正常用户成片卷进来。
	const tradeOnly = W.scoreAdMessageText('有没有人收购二手显卡');
	assert('协同分：只命中交易动词不加协同分', !tradeOnly.reasons.some((r) => r.includes('同现')), JSON.stringify(tradeOnly.reasons));
	const bizOnly = W.scoreAdMessageText('请问 USDT 链上转账手续费怎么算');
	assert('协同分：只命中业务关键词不加协同分', !bizOnly.reasons.some((r) => r.includes('同现')), JSON.stringify(bizOnly.reasons));

	// 平台自身域名：绝不学入指纹库。线上事故 —— t.me 曾被学成 weight=1 的 domain 指纹
	// 并命中 10 次，导致任何人分享 Telegram 链接都可能被判广告。
	assert('平台域名：t.me 被识别', W.isAdPlatformDomain('t.me') === true);
	assert('平台域名：telegram.org 被识别', W.isAdPlatformDomain('telegram.org') === true);
	assert('平台域名：telegra.ph 被识别', W.isAdPlatformDomain('telegra.ph') === true);
	assert('平台域名：真子域被识别', W.isAdPlatformDomain('cdn.t.me') === true);
	// 判定上界取 length-1，保证永不单独匹配顶级域，仿冒域名不得蒙混过关。
	assert('平台域名：evil-t.me 不算平台域名', W.isAdPlatformDomain('evil-t.me') === false);
	assert('平台域名：t.me.evil.tk 不算平台域名', W.isAdPlatformDomain('t.me.evil.tk') === false);
	assert('平台域名：普通广告域名不算', W.isAdPlatformDomain('evil-shop.top') === false);
	const platformCand = W.extractAdFingerprintCandidates(
		{ name: '收U代理', username: '', bio: '联系 https://t.me/+abcDEF123 详谈 日结', text: '' },
		new Set()
	);
	assert('平台域名：t.me 不进指纹候选', !platformCand.some((c) => c.type === 'domain' && c.value === 't.me'), JSON.stringify(platformCand.filter((c) => c.type === 'domain')));
	const evilCand = W.extractAdFingerprintCandidates(
		{ name: '收U代理', username: '', bio: '上号地址 evil-shop.top 日结佣金', text: '' },
		new Set()
	);
	assert('平台域名：真广告域名照常入候选', evilCand.some((c) => c.type === 'domain' && c.value === 'evil-shop.top'), JSON.stringify(evilCand.filter((c) => c.type === 'domain')));

	// 转发来源判定 2026-09-08 已按主人要求整体关闭（原话：「有的用户喜欢用频道私聊，
	// 所以关于频道跟群聊的判定还是很容易造成误封，去除频道跟群组判定」）。
	// scoreAdForwardChat 现在恒返回 score 0 / isAd false，并带 disabled: true 标记。
	// 原断言要求广告频道 isAd === true，与关闭后的行为直接冲突，改为断言「确实关掉了」——
	// 广告号与正常频道走同一条路，两个样本都不再产生任何来源分。
	const forwardAd = W.scoreAdForwardChat({ title: '💚高价收网赚号💚', username: 'aaa_channel' });
	assert('转发来源判定已关闭：广告频道也不再判为广告来源', forwardAd.isAd === false && forwardAd.disabled === true, JSON.stringify(forwardAd));
	assert('转发来源判定已关闭：不产生任何来源分', forwardAd.score === 0, JSON.stringify(forwardAd));
	assert('转发来源判定已关闭：reasons 写明原因', forwardAd.reasons.some((r) => r.includes('已按主人要求关闭')), JSON.stringify(forwardAd.reasons));
	const forwardNormal = W.scoreAdForwardChat({ title: 'Cloudflare 官方公告', username: 'cf_news' });
	assert('正常频道转发不判定为广告来源', forwardNormal.isAd === false, JSON.stringify(forwardNormal));

	assert('adTextHash 同文本稳定', W.adTextHash('测试文本') === W.adTextHash('测试文本'));
	assert('adTextHash 不同文本不同', W.adTextHash('测试文本A') !== W.adTextHash('测试文本B'));
	assert('adTextHash 输出 16 位 hex', /^[0-9a-f]{16}$/.test(W.adTextHash('x')), W.adTextHash('x'));

	assert('域名归一化剥协议端口路径', W.normalizeAdDomain('https://Example.COM:8080/a/b?c=1') === 'example.com', W.normalizeAdDomain('https://Example.COM:8080/a/b?c=1'));
	assert('域名归一化保留通配写法', W.normalizeAdDomain('*.Example.com') === '*.example.com');
	assert('提取域名', W.extractAdDomains('看 github.com/x 和 evil-shop.top').includes('evil-shop.top'), JSON.stringify(W.extractAdDomains('看 github.com/x 和 evil-shop.top')));

	assert('对称 emoji 名称重复段落检测', W.hasAdRepeatedSegment('收购账号,收购账号') === true);
	assert('普通句子无重复段落', W.hasAdRepeatedSegment('今天天气不错，出门走走') === false);

	assert('回复学习：肯定词', W.classifyAdReplyIntent('这是广告') === 'positive');
	assert('回复学习：否定词优先于肯定词', W.classifyAdReplyIntent('不是广告') === 'negative');
	assert('回复学习：误封也算否定', W.classifyAdReplyIntent('误封了') === 'negative');
	assert('回复学习：无关短句不触发', W.classifyAdReplyIntent('好的收到') === '');
	assert('回复学习：超 20 字不触发', W.classifyAdReplyIntent('这条消息我看了半天觉得应该算是广告吧你怎么看') === '', W.classifyAdReplyIntent('这条消息我看了半天觉得应该算是广告吧你怎么看'));
	assert('回复学习：空文本不触发', W.classifyAdReplyIntent('') === '');
	// 默认自助解封确认句正好 20 字，不超过长度闸门，含「误封」会被判为 negative。
	// 实际不冲突：该句是私聊自助解封流程，而回复学习要求「配置群 + 引用消息 + 管理层身份」三条同时成立。
	assert('回复学习：默认自助解封句长度正好 20 字', '我不是广告狗，我是误封的，希望可以解封。'.length === 20);
	assert('回复学习：自助解封句被判为 negative（仅在群内引用场景才会走到）', W.classifyAdReplyIntent('我不是广告狗，我是误封的，希望可以解封。') === 'negative');

	// slash 命令一律不进回复学习（2026-09-08 修复）。
	// 这一组是死代码事故的直接回归点：`/spam` 四个字母自己命中 AD_REPLY_LEARN_TRIGGER_PATTERNS
	// 里的 /\bspam/i，而 handleAdReplyLearning 排在命令分发之前 → 引用模式的 /spam 永远被
	// 截走，/spam 分支里 source='spam' 的自动学习一次都执行不到，学到的指纹全标成 manual，
	// 而 manual 豁免误报自动退役 → 选词失手就是 /ignore 也清不掉的永久误封源。
	// 特例做宽（所有 slash 命令）的理由就在下面这几条：只堵 /spam 的话，中文触发词那边
	// 换个命令就能把同一个坑再踩一遍。
	assert('回复学习：/spam 不触发（否则 /spam 引用学习是死代码）', W.classifyAdReplyIntent('/spam') === '', W.classifyAdReplyIntent('/spam'));
	assert('回复学习：/spam 带备注也不触发', W.classifyAdReplyIntent('/spam 广告号') === '', W.classifyAdReplyIntent('/spam 广告号'));
	assert('回复学习：/ban 备注含「广告」不触发', W.classifyAdReplyIntent('/ban 广告号') === '', W.classifyAdReplyIntent('/ban 广告号'));
	assert('回复学习：/kick 备注含「封了」不触发', W.classifyAdReplyIntent('/kick 封了他') === '', W.classifyAdReplyIntent('/kick 封了他'));
	assert('回复学习：/unban 备注含「误封」不触发', W.classifyAdReplyIntent('/unban 误封了') === '', W.classifyAdReplyIntent('/unban 误封了'));
	// 反向钉死：说人话那条路不能被这个特例带走。斜杠必须在【开头】才算命令，
	// 句中出现的斜杠（「广告/垃圾」这种写法）仍要正常判定。
	assert('回复学习：说人话仍触发（特例没伤到主路径）', W.classifyAdReplyIntent('这是广告') === 'positive');
	// 只有【开头】的斜杠才算命令；句中出现斜杠不影响判定。
	// 触发词收紧为完整短语后，这里改用「广告号」测同一个语义（原用例的「广告」「垃圾号」已不触发）。
	assert('回复学习：句中斜杠不算命令', W.classifyAdReplyIntent('广告号/骗子') === 'positive', W.classifyAdReplyIntent('广告号/骗子'));
	assert('回复学习：单独一个斜杠不算命令也不触发', W.classifyAdReplyIntent('/') === '', W.classifyAdReplyIntent('/'));
}

section('[2] 配置解析（空串把阈值顶成 0 的陷阱）');
{
	const empty = W.loadAdDetectionConfig({ AD_SCORE_THRESHOLD: '', AD_OBSERVATION_SCORE: '   ' });
	assert('空串回落默认封禁阈值 7', empty.scoreThreshold === 7, JSON.stringify(empty));
	assert('空白串回落默认观察阈值 5', empty.observationScore === 5, JSON.stringify(empty));
	const bad = W.loadAdDetectionConfig({ AD_SCORE_THRESHOLD: 'abc', AD_AI_SIMILARITY_THRESHOLD: '9' });
	assert('非数字回落默认', bad.scoreThreshold === 7, JSON.stringify(bad));
	assert('超范围相似度回落默认 0.78', bad.aiSimilarityThreshold === 0.78, JSON.stringify(bad));
	const zero = W.loadAdDetectionConfig({ AD_SCORE_THRESHOLD: '0' });
	assert('阈值 0 低于下限被拒', zero.scoreThreshold === 7, JSON.stringify(zero));
	const ok = W.loadAdDetectionConfig({ AD_SCORE_THRESHOLD: '12', AD_OBSERVATION_HOURS: '48' });
	assert('合法值生效', ok.scoreThreshold === 12 && ok.observationHours === 48, JSON.stringify(ok));
	assert('无 AI 绑定时 aiEnabled=false', ok.aiEnabled === false);
	assert('有 AI 绑定时 aiEnabled=true', W.loadAdDetectionConfig({ AI: { run() {} } }).aiEnabled === true);
}

section('[3] D1 建表、种子与降级');
{
	const env = makeEnv();
	assert('adDetectionReady 首次建表成功', (await W.adDetectionReady(env)) === true);
	const tables = env.DB.query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name);
	for (const table of ['ad_fingerprints', 'ad_user_screening', 'ad_sample_embeddings', 'ad_domain_whitelist', 'ad_pending_snapshots', 'ad_confirm_tokens']) {
		assert(`表 ${table} 已建立`, tables.includes(table), JSON.stringify(tables));
	}
	assert('核心表 blacklist 仍在（未破坏既有结构）', tables.includes('blacklist'), JSON.stringify(tables));
	const seededDomains = env.DB.query('SELECT COUNT(*) AS c FROM ad_domain_whitelist')[0].c;
	assert('域名白名单种子已写入', seededDomains >= 40, String(seededDomains));
	const seededSamples = env.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;
	// 2026-09-08：中心特征以 source='seed-core' 一并灌进样本库，样本总数不再等于内置种子的 10 条。
	// 分 source 断言比写死总数稳 —— 中心特征条数会随主人加词变化，总数不该是硬编码。
	const seedRows = env.DB.query("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE source = 'seed'")[0].c;
	const seedCoreRows = env.DB.query("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE source = 'seed-core'")[0].c;
	assert('AI 样本种子已写入 10 条', seedRows === 10, String(seedRows));
	assert('中心特征已灌进 AI 样本库', seedCoreRows >= 20, String(seedCoreRows));
	assert('样本向量初始为空（懒加载）', env.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE embedding IS NULL')[0].c === seededSamples, String(seededSamples));
	assert('二次调用直接命中缓存', (await W.adDetectionReady(env)) === true);

	assert('未绑定 D1 时整套检测静默跳过', (await W.adDetectionReady({})) === false);
	const whitelist = await W.loadAdDomainWhitelist(env);
	assert('白名单命中裸域', W.isAdDomainWhitelisted('github.com', whitelist) === true);
	assert('白名单命中子域', W.isAdDomainWhitelisted('gist.github.com', whitelist) === true);
	assert('白名单不误命中广告域', W.isAdDomainWhitelisted('evil-shop.top', whitelist) === false);
}

section('[4] 指纹库读写与误报回滚');
{
	const env = makeEnv();
	await W.adDetectionReady(env);
	const payload = {
		name: '💚高价收网赚号💚',
		username: '@ad_seller_001',
		bio: '长期收购网 du 商宝账号，老账号优先加价，进群联系 @promo_channel_x 或 evil-shop.top',
		text: '',
		domains: []
	};
	const learned = await W.learnAdFingerprints(env, payload, { source: 'auto', createdBy: 'system' });
	assert('自动学习成功', learned.ok === true && learned.learned > 0, JSON.stringify(learned));
	const rows = env.DB.query('SELECT type, value FROM ad_fingerprints ORDER BY id');
	assert('学到 keyword 类指纹', rows.some((r) => r.type === 'keyword'), JSON.stringify(rows));
	assert('学到 bio 类指纹', rows.some((r) => r.type === 'bio'), JSON.stringify(rows));
	assert('学到非白名单域名（domain 类）', rows.some((r) => r.type === 'domain' && r.value === 'evil-shop.top'), JSON.stringify(rows));
	// 广告号自身 username 学成 username 型指纹（匹配端只比 payload.username 字段，
	// 正文里艾特不命中，解决 #143 误封根因）。
	// bio 内 @引流账号（@promo_channel_x）不再学成 username 指纹——@提及扫描路径已永久删除。
	assert('广告号自身 username 学成指纹', rows.some((r) => r.type === 'username' && r.value === '@ad_seller_001'), JSON.stringify(rows));
	assert('bio 内 @引流账号不学成 username 指纹', !rows.some((r) => r.type === 'username' && r.value === '@promo_channel_x'), JSON.stringify(rows));

	// 2026-09-08 拆掉了「source='auto' 必须含强交易动词」的闸门（详见 learnAdFingerprints 注释：
	// AI 层定罪时 structure.guilty 为 false，那道闸门让「AI 越有用、指纹库学到的越少」）。
	// 干净载荷现在靠 extractAdFingerprintCandidates 抽不出候选来兜底，返回 no_candidate。
	// 断言的实质没变 —— 正常用户的资料不许被学成指纹，只是原因从「没动词」变成「没候选」。
	const noVerb = await W.learnAdFingerprints(env, { name: '张三', bio: '个人简介', text: '' }, { source: 'auto' });
	assert('正常资料不会被自动学成指纹', noVerb.learned === 0 && noVerb.reason === 'no_candidate', JSON.stringify(noVerb));
	// 反过来：不含强动词、但有业务词短语的真广告【现在必须学得进来】，这正是拆闸门的目的。
	// 「操逼赚钱，招探花9000一单」一个 AD_TRADE_VERBS 词都不命中，旧实现直接 no_trade_verb。
	const noVerbAd = await W.learnAdFingerprints(env, {
		name: 'Maybell Tillman', username: '', bio: '', text: '操逼赚钱，招探花9000一单，提供设备', domains: []
	}, { source: 'auto' });
	assert('无强动词的真广告现在能自动学入', noVerbAd.ok === true && noVerbAd.learned > 0, JSON.stringify(noVerbAd));

	const matched = await W.matchAdFingerprints(env, payload, {});
	assert('指纹库能命中同一广告', matched.hits.length > 0, JSON.stringify(matched.hits?.slice(0, 3)));
	assert('命中后计分为正', matched.score > 0, String(matched.score));
	const clean = await W.matchAdFingerprints(env, { name: '李四', username: '', bio: '喜欢摄影', text: '', domains: [] }, {});
	assert('正常资料不命中指纹', clean.hits.length === 0, JSON.stringify(clean.hits));

	const fpBefore = env.DB.query("SELECT confidence FROM ad_fingerprints WHERE type='bio'")[0].confidence;
	await W.markAdFingerprintFalsePositive(env, payload);
	const fpAfter = env.DB.query("SELECT confidence FROM ad_fingerprints WHERE type='bio'")[0].confidence;
	assert('标记误报后置信度下降', fpAfter < fpBefore, `${fpBefore} -> ${fpAfter}`);

	const added = await W.addAdFingerprint(env, 'evil-shop.top', { createdBy: String(OWNER_ID) });
	assert('/addword 底层新增成功', added.ok === true, JSON.stringify(added));
	assert('/addword 自动推断为 domain 类型', added.type === 'domain', JSON.stringify(added));
	const listed = await W.listAdFingerprints(env, { limit: 50, offset: 0 });
	assert('列表返回总数', listed.total >= 4, JSON.stringify({ total: listed.total }));
	const removed = await W.removeAdFingerprint(env, 'evil-shop.top');
	assert('删除指纹成功', removed.ok === true, JSON.stringify(removed));
	assert('删除后库内不再有该域名', env.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE value='evil-shop.top'")[0].c === 0);
}

section('[5] AI 语义层三分支（硬命中 / 软加分 / 未绑定降级）');
{
	// 样本种子全部是广告文本，伪 AI 把它们映射到同一个「广告向量」；
	// 待检文本命中同一批关键词即得到余弦 1.0，从而稳定触发硬命中分支。
	const suspect = { profile: { firstName: '路人甲', bio: '洗急两分钟一单', status: 'member' }, text: '', forwardChat: null };

	const envNoAi = makeEnv();
	await W.adDetectionReady(envNoAi);
	const noAi = await W.evaluateAdSuspect(envNoAi, suspect, {});
	// 期望值 2026-09-08 从 3 改成 0。原先 3 分 = 强动词「洗急」+2 与弱动词「一单」+1。
	// 主人下令「单个词不封不计入分数，只有多个词才能计入分数」后两条都归零：
	//   「洗急」只命中交易动词一类，没有业务关键词同现 → 单类不计分；
	//   「一单」是弱动词 → 一律不计分。
	// 这个样本的意义因此发生了变化：它现在证明的是「AI 未绑定时，单类词样本得 0 分、
	// 不会被结构化评分误封」—— 而下面 AI 硬命中那一组证明同一个样本在 AI 在线时照样定罪。
	assert('无 AI 绑定：该样本结构化得分 0 分（单类词不计分）', noAi.score === 0, JSON.stringify(noAi.reasons));
	assert('无 AI 绑定：reasons 写明单类词不计分', noAi.reasons.some((r) => r.includes('单类词不计分')), JSON.stringify(noAi.reasons));
	assert('无 AI 绑定：verdict 不是 ban（降级不误封）', noAi.verdict !== 'ban', JSON.stringify(noAi));
	assert('无 AI 绑定：相似度恒为 0', noAi.aiSimilarity === 0, String(noAi.aiSimilarity));

	const envAi = makeEnv({ AI: makeFakeAI(adVector) });
	await W.adDetectionReady(envAi);
	const hard = await W.evaluateAdSuspect(envAi, suspect, {});
	assert('AI 硬命中：verdict = ban', hard.verdict === 'ban', JSON.stringify(hard));
	assert('AI 硬命中：判定层标记为 ai', hard.layer === 'ai', hard.layer);
	assert('AI 硬命中：相似度 >= 阈值 0.78', hard.aiSimilarity >= 0.78, String(hard.aiSimilarity));
	assert('AI 硬命中：判定依据写明相似度', hard.reasons.some((r) => r.includes('AI 语义相似度')), JSON.stringify(hard.reasons));
	assert('AI 硬命中：回带命中样本原文', typeof hard.aiSample === 'string' && hard.aiSample.length > 0, String(hard.aiSample));
	assert('AI 硬命中：得分低于阈值也照样定罪（hardHit 优先）', hard.score < 7, String(hard.score));
	assert('样本向量已被懒加载写入 D1', envAi.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE embedding IS NOT NULL')[0].c >= 8);

	// 软加分：探针向量 [1, 0.2, 0.8] 与广告向量 [1, 0.5] 的余弦 ≈ 0.759，落在 [0.65, 0.78)。
	const softProbe = { profile: { firstName: '弱相似探针', bio: '有需要', status: 'member' }, text: '', forwardChat: null };
	const softMapper = (text) => {
		const vector = new Array(EMBED_DIM).fill(0);
		if (text.includes('弱相似探针')) { vector[0] = 1; vector[1] = 0.2; vector[2] = 0.8; return vector; }
		vector[0] = 1; vector[1] = 0.5;
		return vector;
	};
	const envSoftBase = makeEnv();
	await W.adDetectionReady(envSoftBase);
	const softBase = await W.evaluateAdSuspect(envSoftBase, softProbe, {});
	const envSoft = makeEnv({ AI: makeFakeAI(softMapper) });
	await W.adDetectionReady(envSoft);
	const soft = await W.evaluateAdSuspect(envSoft, softProbe, {});
	assert('AI 软加分：相似度落在 [0.65, 0.78)', soft.aiSimilarity >= 0.65 && soft.aiSimilarity < 0.78, String(soft.aiSimilarity));
	assert('AI 软加分：只加 2 分不定罪', soft.score === softBase.score + 2, `${softBase.score} -> ${soft.score}`);
	assert('AI 软加分：判定层不升级为 ai', soft.layer !== 'ai', soft.layer);
	assert('AI 软加分：verdict 不是 ban', soft.verdict !== 'ban', JSON.stringify(soft));
	assert('AI 软加分：判定依据写明弱相似', soft.reasons.some((r) => r.includes('AI 语义弱相似')), JSON.stringify(soft.reasons));

	// 正常用户即便走完 AI 层也不该被判广告：伪 AI 给正交向量，余弦为 0。
	const envClean = makeEnv({ AI: makeFakeAI(adVector) });
	await W.adDetectionReady(envClean);
	const clean = await W.evaluateAdSuspect(envClean, { profile: { firstName: '李四', bio: '喜欢摄影和骑行', status: 'member' }, text: '', forwardChat: null }, {});
	assert('正常用户：AI 层相似度为 0', clean.aiSimilarity === 0, String(clean.aiSimilarity));
	assert('正常用户：verdict = pass', clean.verdict === 'pass', JSON.stringify(clean));

	// 语义文本过短（< 6 字）直接跳过 AI，节省推理预算。
	const envShort = makeEnv({ AI: makeFakeAI(adVector) });
	await W.adDetectionReady(envShort);
	const aiBefore = envShort.AI.calls;
	await W.evaluateAdSuspect(envShort, { profile: { firstName: '洗急', bio: '', status: 'member' }, text: '', forwardChat: null }, {});
	assert('语义文本过短时不调用 AI', envShort.AI.calls === aiBefore, `${aiBefore} -> ${envShort.AI.calls}`);

	// 维度守卫：cosineSimilarity 用 Math.min(a.length, b.length) 截断，维度不一致时会
	// 静默算出一个无意义的相似度，可能随机越过阈值造成误封。换模型后库里必然残留旧维度向量
	// （本项目从误用的 768 维换到 bge-m3 的 1024 维），必须显式跳过而非让它参与比对。
	// 模型 ID 必须是 Cloudflare 目录里真实存在的。曾误用 '@cf/baai/bge-base-zh-v1.5'（不存在，
	// bge 系列只有 -en- 三个尺寸与 bge-m3），线上每次调用都被 Ai._parseError 拒绝，第三层长期空转。
	assert('嵌入模型是真实存在的 Cloudflare 模型 ID', EMBED_MODEL === '@cf/baai/bge-m3', EMBED_MODEL);
	assert('嵌入维度与 bge-m3 一致', EMBED_DIM === 1024, String(EMBED_DIM));

	const envDim = makeEnv({ AI: makeFakeAI(adVector) });
	await W.adDetectionReady(envDim);
	// 手工塞一条旧维度（768）向量，模拟换模型后的存量数据
	const staleVec = JSON.stringify(new Array(768).fill(0).map((_, i) => (i === 0 ? 1 : i === 1 ? 0.5 : 0)));
	envDim.DB.__sqlite.exec(
		"UPDATE ad_sample_embeddings SET embedding = '" + staleVec + "', dimension = 768 WHERE id = 1"
	);
	const dimCounts = await W.countAdSamples(envDim);
	assert('维度统计：识别出陈旧向量', dimCounts.stale === 1, JSON.stringify(dimCounts));

	// 守卫本身：库里【只】留那条 768 维向量，其余样本行全部删掉，确保没有可比样本。
	// 若不清掉其余行，checkAdAiSimilarity 会先 topUp 把它们补成 1024 维，
	// 那些新向量与广告文本本就高度相似 → 相似度 1.0，与守卫是否生效无关，断言等于没测。
	const envDimOnly = makeEnv({ AI: makeFakeAI(adVector) });
	await W.adDetectionReady(envDimOnly);
	envDimOnly.DB.__sqlite.exec('DELETE FROM ad_sample_embeddings WHERE id != 1');
	envDimOnly.DB.__sqlite.exec(
		"UPDATE ad_sample_embeddings SET embedding = '" + staleVec + "', dimension = 768 WHERE id = 1"
	);
	// 该向量是 [1, 0.5, 0...]，与广告文本向量方向完全一致：未被跳过则相似度 1.0 直接硬命中。
	const dimSim = await W.checkAdAiSimilarity(envDimOnly, '长期收购网赚账号 USDT 日结', { config: W.loadAdDetectionConfig(envDimOnly) });
	assert('维度守卫：陈旧向量不参与比对', dimSim.similarity === 0, JSON.stringify(dimSim));
	assert('维度守卫：跳过后不产生硬命中', dimSim.isMatch !== true, JSON.stringify(dimSim));

	// /adstats 与 /warmup 都必须把陈旧向量摊开说，否则运维只看 ready 数会以为第三层正常
	const dimStats = await (async () => {
		resetCalls();
		await sendUpdate({ message: privateMessage(OWNER_ID, '/adstats') }, envDim);
		return allSentText();
	})();
	assert('/adstats 提示存在旧模型维度向量', dimStats.includes('旧模型维度'), dimStats);
	assert('/adstats 引导清空重建', dimStats.includes('/clearsamples'), dimStats);
	const dimWarm = await (async () => {
		resetCalls();
		await sendUpdate({ message: privateMessage(OWNER_ID, '/warmup') }, envDim);
		return allSentText();
	})();
	assert('/warmup 遇陈旧向量时先引导清空', dimWarm.includes('存在旧模型维度的向量'), dimWarm);
	assert('/warmup 说明 embedding 非空不会被重算', dimWarm.includes('不会重算'), dimWarm);
	assert('/warmup 遇陈旧向量时不误报已就绪', !dimWarm.includes('向量已就绪'), dimWarm);
}

section('[6] 入群检测端到端（webhook → 封禁 → 快照 → 私聊通知）');
{
	const ownerNoticeText = () => calls
		.filter((c) => c.method === 'sendMessage' && String(c.body?.chat_id) === String(OWNER_ID))
		.map((c) => String(c.body?.text || '')).join('\n');

	const env = makeEnv();
	resetCalls();
	setApi({
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '💚高价收网赚号💚', bio: '长期收购网 du 商宝账号，老账号优先加价' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: [] })
	});
	await sendUpdate({ message: joinMessage([{ id: 50001, first_name: '💚高价收网赚号💚' }]) }, env);
	assert('广告号进群：触发全群封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('广告号进群：写入黑名单', env.DB.query("SELECT id, reason FROM blacklist WHERE id = '50001'").length === 1, JSON.stringify(env.DB.query('SELECT id, reason FROM blacklist')));
	assert('广告号进群：黑名单 reason = ad_auto', env.DB.query("SELECT reason FROM blacklist WHERE id = '50001'")[0]?.reason === 'ad_auto');
	assert('广告号进群：生成待确认快照 seq=1', env.DB.query('SELECT seq, user_id FROM ad_pending_snapshots')[0]?.seq === 1, JSON.stringify(env.DB.query('SELECT seq, user_id FROM ad_pending_snapshots')));
	assert('广告号进群：快照绑定该用户', env.DB.query('SELECT user_id FROM ad_pending_snapshots')[0]?.user_id === '50001');
	assert('广告号进群：自动学入指纹', env.DB.query('SELECT COUNT(*) AS c FROM ad_fingerprints')[0].c > 0);
	assert('广告号进群：观察窗口不留残留', env.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 0);
	assert('私聊通知发给第一主人', ownerNoticeText().length > 0, JSON.stringify(calls.filter((c) => c.method === 'sendMessage').map((c) => c.body?.chat_id)));
	assert('通知含标题「广告号自动封禁」', ownerNoticeText().includes('广告号自动封禁'), ownerNoticeText());
	// /confirm 已于 2026-09-08 删除（定罪即自动学指纹与 AI 样本，判定正确无需任何操作）。
	// 通知里只留 /ignore 一个出口，并明确写「判定正确：无需任何操作」。
	assert('通知不再出现 /confirm', !ownerNoticeText().includes('/confirm'), ownerNoticeText());
	assert('通知说明判定正确无需操作', ownerNoticeText().includes('判定正确：无需任何操作'), ownerNoticeText());
	// 项 7：定罪即把现场语义沉淀进 AI 样本库。这个号的「昵称 + bio」拼起来正好等于
	// AD_SAMPLE_SEED_TEXTS 第一条，text_hash 命中去重 → 不新增行、样本库不长胖，
	// 这正是 addAdSample 该有的行为。所以这里断言「文本在库且只有一行」，
	// 而不是断言存在 source='auto' 的行（那要用一份不在种子里的文本才验得到，见 [8] 段）。
	const seedDupRows = env.DB.query("SELECT source FROM ad_sample_embeddings WHERE sample_text LIKE '%高价收网赚号%长期收购网%'");
	assert('广告号进群：现场语义已在样本库', seedDupRows.length === 1, JSON.stringify(seedDupRows));
	assert('广告号进群：撞种子文本不产生重复样本', seedDupRows[0]?.source === 'seed', JSON.stringify(seedDupRows));
	assert('通知含 /ignore 1', ownerNoticeText().includes('/ignore 1'), ownerNoticeText());
	assert('通知含判定层与得分', ownerNoticeText().includes('判定层：') && ownerNoticeText().includes('得分：'), ownerNoticeText());
	assert('通知含来源群标题', ownerNoticeText().includes('测试治理群'), ownerNoticeText());
	assert('通知含封禁结果统计', ownerNoticeText().includes('封禁结果：'), ownerNoticeText());

	// 正常新人：零封禁、零快照，且既有进群逻辑照旧。
	const env2 = makeEnv();
	resetCalls();
	setApi({
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '张三', bio: '' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } })
	});
	await sendUpdate({ message: joinMessage([{ id: 50002, first_name: '张三' }]) }, env2);
	assert('正常新人：不触发封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('正常新人：不进黑名单', env2.DB.query('SELECT COUNT(*) AS c FROM blacklist')[0].c === 0);
	assert('正常新人：不生成快照', env2.DB.query('SELECT COUNT(*) AS c FROM ad_pending_snapshots')[0].c === 0);
	assert('正常新人：不进观察窗口', env2.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 0);

	// 主人本人进群：连资料都不拉，彻底豁免。
	const env3 = makeEnv();
	resetCalls();
	await sendUpdate({ message: joinMessage([{ id: OWNER_ID, first_name: '💚高价收网赚号💚' }]) }, env3);
	assert('主人进群：不拉取资料', countCalls('getChat') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('主人进群：不触发封禁', countCalls('banChatMember') === 0);

	// 群管理员进群：getChatAdministrators 认定为管理员后直接跳过。
	const env4 = makeEnv();
	resetCalls();
	setApi({
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 50003, is_bot: false }, status: 'administrator' }] }),
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '💚高价收网赚号💚', bio: '长期收购网赚账号' } })
	});
	await sendUpdate({ message: joinMessage([{ id: 50003, first_name: '💚高价收网赚号💚' }]) }, env4);
	assert('管理员进群：不触发封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('管理员进群：不进黑名单', env4.DB.query('SELECT COUNT(*) AS c FROM blacklist')[0].c === 0);

	// 机器人进群：交给既有 handleNewChatMemberBots，广告层不插手。
	const env5 = makeEnv();
	resetCalls();
	await sendUpdate({ message: joinMessage([{ id: 50004, is_bot: true, first_name: 'SomeBot' }]) }, env5);
	assert('bot 进群：广告层不拉资料', countCalls('getChat') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('bot 进群：不进黑名单', env5.DB.query('SELECT COUNT(*) AS c FROM blacklist')[0].c === 0);
}

section('[7] 消息检测端到端（零成本预筛 → 三层判定 → 观察累加）');
{
	const ownerNoticeText = () => calls
		.filter((c) => c.method === 'sendMessage' && String(c.body?.chat_id) === String(OWNER_ID))
		.map((c) => String(c.body?.text || '')).join('\n');
	const AD_TEXT = '长期收购网赚账号 USDT，进群联系 @promo_seller_x';
	const plainProfile = {
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '路人', bio: '' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } })
	};
	const adProfile = {
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '💚高价收网赚号💚', bio: '长期收购网 du 商宝账号，优先加价' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } })
	};

	// 正常聊天：预筛门槛移除后【会】拉资料（这是刻意的 —— 昵称和 bio 才是广告号的主战场），
	// 但资料本身干净，判定结果必须是 pass：不封禁、不禁言、不删消息、不进观察窗口。
	// 断言从「不拉资料」改成「拉了但不处置」，考察点由成本转为准确性。
	const env1 = makeEnv();
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60001, first_name: '张三' }, '大家好，今天天气不错，一起吃饭吗') }, env1);
	// 首次发言：闸一没定罪（资料与正文都干净），于是闸二查一次 bio。
	// 这【只在首次发言时发生】—— 名册里记下 bio_checked_at 之后，
	// 接下来 3 天内这个人的每条消息都是 0 个 Telegram 请求。
	assert('正常聊天：首次发言查一次 bio（闸二）', countCalls('getChat') === 1, JSON.stringify(calls.map((c) => c.method)));
	assert('正常聊天：查管理员豁免', countCalls('getChatAdministrators') === 1, JSON.stringify(calls.map((c) => c.method)));
	assert('正常聊天：不触发封禁', countCalls('banChatMember') === 0);
	assert('正常聊天：不写观察窗口', env1.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 0);

	// 广告正文 + 广告资料：合计远超阈值，即时封禁并推快照。
	const env2 = makeEnv();
	resetCalls();
	setApi(adProfile);
	await sendUpdate({ message: groupMessage({ id: 60002, first_name: '💚高价收网赚号💚' }, AD_TEXT) }, env2);
	// 闸一（零成本判定）在这个样本上就够封禁线了：昵称「💚高价收网赚号💚」9 分
	// 加正文「收U秒结 私聊我」3 分 —— 昵称和正文都在 update 里现成带着，一个请求都不用花。
	// 所以【刻意不查 bio】：已经确定要封的人，简介写什么都不影响结论。
	// 断言从「查了资料」翻转成「没查资料」，考察点是「明显广告号零请求即封」。
	assert('广告消息：闸一零成本定罪，不拉资料', countCalls('getChat') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('广告消息：触发全群封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('广告消息：删除触发消息', countCalls('deleteMessage') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('广告消息：写入黑名单', env2.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '60002'")[0].c === 1);
	assert('广告消息：生成快照', env2.DB.query('SELECT COUNT(*) AS c FROM ad_pending_snapshots')[0].c === 1);
	assert('广告消息：通知含消息正文', ownerNoticeText().includes('长期收购网赚账号'), ownerNoticeText());

	// 原「中间分数只观察不封禁」—— 2026-09-07 双通道结构查杀上线后本例翻转成【直接封禁】。
	//
	// 旧行为的算式（仍然成立，只是不再是最终结论）：
	//   正文「长期收购网赚账号 USDT 秒结」= 交易动词 +2、业务关键词 +2、两类同现 +2 = 6 分（无链接）
	//   资料 plainProfile（bio 空）吃「无 emoji 且无 Bio」-1，max(0, -1) = 0 分
	//   合计 6 分，落在 [5, 7) 观察区间 → 要等窗口内第二条广告累加才封
	//
	// 现在通道 body（bio + 本条正文）先于评分给出布尔定罪：
	//   招揽意图「长期收购」∧ 行业指向「网赚 / USDT」→ 形态 A 成立 → 就地封禁
	//
	// 断言按新行为改写而非把结构查杀关掉迁就旧数值，理由：这条正文是不折不扣的真广告
	// （长期收购 + 网赚 + USDT + 秒结），旧行为要放它发第二条才动手，正是要治的漏放。
	// 最后一项断言钉死【结构查杀走的是 body 通道而不是评分过线】—— 分数没变，变的是定罪路径。
	const MID_TEXT = '长期收购网赚账号 USDT 秒结';
	const env3 = makeEnv();
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60003, first_name: '路人' }, MID_TEXT) }, env3);
	assert('中间分数：通道 body 直接封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('中间分数：写入黑名单', env3.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '60003'")[0].c === 1, JSON.stringify(env3.DB.query('SELECT id FROM blacklist')));
	assert('中间分数：封禁后不留观察窗口', env3.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 0, JSON.stringify(env3.DB.query('SELECT user_id, score, layer FROM ad_user_screening')));
	assert('中间分数：生成待确认快照', env3.DB.query('SELECT COUNT(*) AS c FROM ad_pending_snapshots')[0].c === 1);
	assert('中间分数：由正文查杀定罪而非评分过线', ownerNoticeText().includes('正文查杀'), ownerNoticeText());

	// 反向确认协同分确实把 AD_TEXT 顶过了封禁线（原为 6 分观察，现为 8 分封禁）。
	// 差别只在多了一个引流 @账号（+2），可见协同分与链接分是独立叠加的。
	const env3b = makeEnv();
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60013, first_name: '路人' }, AD_TEXT) }, env3b);
	assert('协同分端到端：三类判据同现直接封禁', env3b.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '60013'")[0].c === 1, JSON.stringify(env3b.DB.query('SELECT id FROM blacklist')));
	assert('协同分端到端：得分越过封禁线', (env3b.DB.query("SELECT score FROM ad_pending_snapshots WHERE user_id = '60013'")[0]?.score || 0) >= 7, JSON.stringify(env3b.DB.query('SELECT user_id, score FROM ad_pending_snapshots')));

	// 观察窗口历史分累加：本条正文只有 3 分，叠加历史 4 分正好到 7 分封禁线。
	const env4 = makeEnv();
	await W.adDetectionReady(env4);
	await W.upsertAdScreening(env4, '60004', {
		chatId: GROUP_ID, score: 4, reasons: ['测试预置历史分'], snapshot: { name: '青山落日' }, layer: 'score'
	}, W.loadAdDetectionConfig(env4));
	assert('历史分预置成功', env4.DB.query("SELECT score FROM ad_user_screening WHERE user_id = '60004'")[0]?.score === 4);
	resetCalls();
	setApi(plainProfile);
	await sendUpdate({ message: groupMessage({ id: 60004, first_name: '路人' }, '💚青山落日💚') }, env4);
	assert('历史分累加：触发封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('历史分累加：判定依据写明历史分', ownerNoticeText().includes('观察窗口历史分'), ownerNoticeText());
	assert('历史分累加：最终得分 7', ownerNoticeText().includes('得分：<b>7</b>'), ownerNoticeText());
	assert('历史分累加：处置后清空观察记录', env4.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 0);
	// 历史分必须【全额】参与，不封顶：本次消息拿出了行为证据（正文首尾对称 emoji +3），
	// 3+4 恰好卡在封禁线 7 上 —— 任何形式的封顶都会把这类真广告放过去。
	assert('历史分累加：全额参与不封顶', ownerNoticeText().includes('+4 观察窗口历史分'), ownerNoticeText());

	// ===== 2026-09-07 第二起误封事故回归 =====
	// 被误封的是真人 @MiLov1900：bio 写「私信请走频道 + 频道链接」（避免私聊骚扰的常见写法，
	// 吃 +2 引流链接），触发封禁的那条消息是「要beta版才能用 那要等了」—— 纯技术讨论，
	// behaviorScore = 0。旧逻辑把历史分 5 全额叠上去 → 8 分越过阈值 7，被全群封禁 14/14。
	// 新逻辑要求本次消息自身有行为证据才让历史分参与，于是只剩资料 2 分 → pass。
	const env4b = makeEnv();
	await W.adDetectionReady(env4b);
	await W.upsertAdScreening(env4b, '60024', {
		chatId: GROUP_ID, score: 5, reasons: ['测试预置历史分'], snapshot: { name: 'Lov1900' }, layer: 'score'
	}, W.loadAdDetectionConfig(env4b));
	resetCalls();
	setApi({
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: 'Lov1900', bio: '私信请走频道https://t.me/joeychat001' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } })
	});
	await sendUpdate({ message: groupMessage({ id: 60024, first_name: 'Lov1900', username: 'MiLov1900' }, '要beta版才能用 那要等了') }, env4b);
	assert('误封回归：行为分为 0 时历史分不参与，不封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('误封回归：不进黑名单', env4b.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '60024'")[0].c === 0);
	assert('误封回归：不推私聊快照', env4b.DB.query('SELECT COUNT(*) AS c FROM ad_pending_snapshots')[0].c === 0);

	// 同一个人只要真发了广告正文，历史分立刻全额参与 —— 证明这道闸不是把人放生，
	// 而是把「同一份资料卡被重算」与「又干了一次」区分开。
	resetCalls();
	await sendUpdate({ message: groupMessage({ id: 60024, first_name: 'Lov1900', username: 'MiLov1900' }, AD_TEXT) }, env4b);
	assert('误封回归：真发广告则历史分全额参与并封禁', env4b.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '60024'")[0].c === 1, JSON.stringify(calls.map((c) => c.method)));

	// 方案 A 回归：随机 username 只认「字母与数字交替」的机器批量生成形态。
	// 「单词 + 数字」（名字 + 生日 / 年份）是全世界最常见的正常取名法，必须放行 ——
	// @MiLov1900 就是被原正则的 [a-z]{4,}[0-9]{0,4} 分支误判 +1 的；
	// 而原正则同时【连 xk3f9a2b 这类真随机串都抓不到】，两头都错。
	const randomUsernameCases = [
		['MiLov1900', false], ['john1990', false], ['alice2024', false], ['tom99', false], ['lisa8', false],
		['xk3f9a2b', true], ['a1b2c3', true], ['abc123def', true], ['x9y8z7q', true], ['nodigits', false]
	];
	for (const [name, shouldHit] of randomUsernameCases) {
		const scored = W.scoreAdProfile(
			{ firstName: '路人', lastName: '', username: name, bio: '正常简介一句话', status: 'member' },
			{ whitelist: new Set() }
		);
		const hit = scored.reasons.some((x) => x.includes('随机字母数字 username'));
		assert('随机 username 判据：' + name + (shouldHit ? ' 应命中' : ' 应放行'), hit === shouldHit, JSON.stringify(scored.reasons));
	}

	// 转发广告频道：无正文也能命中，转发来源单独计分。
	const env5 = makeEnv();
	resetCalls();
	setApi(adProfile);
	await sendUpdate({
		message: groupMessage({ id: 60005, first_name: '搬运工' }, undefined, {
			text: undefined,
			caption: '进群联系 @promo_channel_x',
			forward_from_chat: { id: -1009999, type: 'channel', title: '💚高价收网赚号💚', username: 'aaa_channel' }
		})
	}, env5);
	assert('转发广告频道：触发封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('转发广告频道：通知含转发来源', ownerNoticeText().includes('转发来源：'), ownerNoticeText());

	// ---- 分享名片（contact）通道：2026-09-09 方案 1+4 ----
	// 实物就是主人的截图：Telegram 名片卡，显示名「假钞玩妹交流群🔥快递面交都可」、电话 +98 993 238 8241。
	// 名片消息的 text / caption 恒为空，改动前会在早退闸门就 return false（四条通道一条都跑不到）。
	// 三个用例一律用 plainProfile（干净资料卡）：定罪只能来自名片显示名，
	// 否则资料分兜底会造出「假绿」—— 通道没通也能过断言。
	const CARD_AD_NAME = '假钞玩妹交流群🔥快递面交都可';
	const runCard = async (userId, contact) => {
		const e = makeEnv();
		resetCalls();
		setApi(plainProfile);
		await sendUpdate({
			message: groupMessage({ id: userId, first_name: '路人' }, undefined, { text: undefined, contact })
		}, e);
		return e;
	};

	await runCard(60071, { phone_number: '+98 993 238 8241', first_name: CARD_AD_NAME });
	assert('名片通道：显示名带广告触发封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));

	// 国内号一视同仁 —— 主人口径原话：「昵称带广告 就无需管是国内手机号还是国外手机号了。」
	// 判定链只读 first_name / last_name，phone_number 与 vcard 在链上是【零读取点】。
	await runCard(60072, { phone_number: '+8613800138000', first_name: CARD_AD_NAME });
	assert('名片通道：国内号同样封禁（不看号码国别）', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));

	// last_name 也要拼进显示名，否则广告拆到姓氏字段就能整条绕过。
	await runCard(60073, { phone_number: '+8613800138000', first_name: '假钞玩妹交流群🔥', last_name: '快递面交都可' });
	assert('名片通道：first_name + last_name 拼接后判定', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));

	// 方案 4 反向白名单：正常人分享名片，显示名就是人名 —— 即便电话是外国号也不得封。
	await runCard(60074, { phone_number: '+98 993 238 8241', first_name: '张三' });
	assert('名片通道：显示名是人名则整条放行', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	await runCard(60075, { phone_number: '+8613800138000', first_name: 'John', last_name: 'Smith' });
	assert('名片通道：西文人名同样放行', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));

	// 显示名不像人名、但也不构成广告 → 进了判据也定不了罪。
	// 这条守的是「通道通了 ≠ 单词命中即杀」：门槛与普通正文查杀完全同档。
	await runCard(60076, { phone_number: '+8613800138000', first_name: 'Python技术交流群管理' });
	assert('名片通道：技术群名片不误封（无招揽×行业同现）', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));

	// slash 命令一律跳过检测，避免和既有命令分发抢消息。
	// 这里先手动建表：detectAdOnMessage 在 isTelegramSlashCommand 处就早退了，
	// 根本走不到 adDetectionReady，不预建表则下面的「零写入」断言无表可查。
	const env6 = makeEnv();
	await W.adDetectionReady(env6);
	resetCalls();
	setApi(adProfile);
	await sendUpdate({ message: groupMessage({ id: 60006, first_name: '路人' }, '/notacommand ' + AD_TEXT) }, env6);
	assert('slash 命令：不触发封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('slash 命令：不进黑名单', env6.DB.query('SELECT COUNT(*) AS c FROM blacklist')[0].c === 0);
	assert('slash 命令：不写观察窗口', env6.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 0);

	// 群管理员发同样的文本：鉴权通过即跳过，连资料都不拉。
	const env7 = makeEnv();
	resetCalls();
	setApi({
		...adProfile,
		getChatAdministrators: () => ({ ok: true, result: [{ user: { id: 60007, is_bot: false }, status: 'administrator' }] })
	});
	await sendUpdate({ message: groupMessage({ id: 60007, first_name: '群管' }, AD_TEXT) }, env7);
	assert('群管理员：不拉资料', countCalls('getChat') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('群管理员：不触发封禁', countCalls('banChatMember') === 0);

	// 主人在群里发广告样本文本（测试用）：isPrivilegedManager 直接豁免。
	const env8 = makeEnv();
	resetCalls();
	setApi(adProfile);
	await sendUpdate({ message: groupMessage({ id: OWNER_ID, first_name: 'Owner' }, AD_TEXT) }, env8);
	assert('主人豁免：不触发封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('主人豁免：不查管理员', countCalls('getChatAdministrators') === 0);

	// 非配置群：广告检测完全不介入（同样预建表，否则无表可查）。
	const env9 = makeEnv();
	await W.adDetectionReady(env9);
	resetCalls();
	setApi(adProfile);
	const outsider = groupMessage({ id: 60009, first_name: '路人' }, AD_TEXT);
	outsider.chat = { id: -1002222222222, type: 'supergroup', title: '陌生群' };
	await sendUpdate({ message: outsider }, env9);
	assert('非配置群：不触发封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('非配置群：不写任何检测数据', env9.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 0);
}

section('[8] 命令层端到端（权限、快照闭环、指纹与样本维护）');
{
	const adProfileApi = {
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '💚高价收网赚号💚', bio: '长期收购网 du 商宝账号，老账号优先加价' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: [] })
	};
	const runAdBan = async (env, userId) => {
		setApi(adProfileApi);
		await sendUpdate({ message: joinMessage([{ id: userId, first_name: '💚高价收网赚号💚' }]) }, env);
	};
	const cmd = async (env, text, fromId = OWNER_ID) => {
		resetCalls();
		await sendUpdate({ message: privateMessage(fromId, text) }, env);
		return lastSent();
	};

	// 权限闸门：非第一主人私聊被拒，群内只撤命令不回权限提示。
	// 预建表的原因同上：权限不足时命令在 isPrimaryOwner 处就 return 了，不会碰 D1。
	const envAuth = makeEnv();
	await W.adDetectionReady(envAuth);
	assert('非主人私聊 /pending 被拒', (await cmd(envAuth, '/pending', 20002)).includes('权限不足'), lastSent());
	assert('非主人私聊 /addword 被拒', (await cmd(envAuth, '/addword 收U秒结', 20002)).includes('仅限第一主人私聊'), lastSent());
	// 计数刻意排除 source='seed'：2026-09-07 起 adDetectionReady 会自动灌入
	// AD_FINGERPRINT_SEED（35 图提取的铁证短语）。断言原意是「被拒的命令没有写入任何指纹」，
	// 整表计数会把种子算进来而与权限无关，所以只数非种子行。
	assert('非主人被拒时不落库', envAuth.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source != 'seed'")[0].c === 0);
	resetCalls();
	await sendUpdate({ message: groupMessage({ id: OWNER_ID, first_name: 'Owner' }, '/addword 群内不该执行') }, envAuth);
	assert('群内广告命令被撤回', countCalls('deleteMessage') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('群内广告命令引导去私聊', allSentText().includes('请在私聊中使用'), allSentText());
	assert('群内广告命令不执行写入', envAuth.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source != 'seed'")[0].c === 0);

	// 未绑定 D1：命令直接给出明确提示，不抛异常。
	const envNoDb = { TOKEN: 'TESTTOKEN', BOT_TOKEN: '123456:fake', GROUP_ID, OWNER_IDS: String(OWNER_ID) };
	assert('未绑定 D1 时命令提示未绑定', (await cmd(envNoDb, '/adstats')).includes('未绑定 D1'), lastSent());

	// /pending 空库
	const env = makeEnv();
	assert('/pending 空库提示', (await cmd(env, '/pending')).includes('当前没有待复核的广告判定记录'), lastSent());

	// 触发一次自动封禁 → /pending 列出 #1
	await runAdBan(env, 70001);
	const pendingText = await cmd(env, '/pending');
	assert('/pending 列出序号 #1', pendingText.includes('#1'), pendingText);
	assert('/pending 列出用户 ID', pendingText.includes('70001'), pendingText);
	assert('/pending 列出名称', pendingText.includes('高价收网赚号'), pendingText);
	// /confirm 已于 2026-09-08 删除：定罪即自动学指纹与 AI 样本，判定正确【无需任何操作】。
	assert('/pending 不再给出 /confirm 入口', !pendingText.includes('/confirm'), pendingText);
	assert('/pending 说明判定正确无需操作', pendingText.includes('判定正确：无需任何操作'), pendingText);
	assert('/pending 给出批量与区间语法', pendingText.includes('/ignore 3 5 7') && pendingText.includes('/ignore 3-8'), pendingText);
	assert('/pending 20 越界参数被裁到上限内', (await cmd(env, '/pending 999')).includes('#1'), lastSent());

	// 自动封禁本身就该把现场沉淀成指纹与 AI 样本（项 3 拆闸门 + 项 7 自动加样本），
	// 不再需要人工 /confirm 补一刀。
	assert('自动封禁已学入指纹', env.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'auto'")[0].c > 0, JSON.stringify(env.DB.query("SELECT type, value, match_count, source FROM ad_fingerprints WHERE source = 'auto' LIMIT 8")));
	assert('封禁后用户仍在黑名单', env.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '70001'")[0].c === 1);

	// 70001 的「昵称 + bio」撞了内置种子第一条、走 text_hash 去重，验不到新增路径。
	// 换一份不在种子库里的现场资料（bio 沿用已入库指纹，保证照样被判为广告），
	// 确认 source='auto' 的样本真能落库、向量留空待懒加载。
	setApi({
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '资源对接小助手', bio: '长期收购网 du 商宝账号，老账号优先加价' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: [] })
	});
	const samplesBeforeFresh = env.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;
	await sendUpdate({ message: joinMessage([{ id: 70003, first_name: '资源对接小助手' }]) }, env);
	const autoSampleRows = env.DB.query("SELECT sample_text, source, embedding FROM ad_sample_embeddings WHERE source = 'auto'");
	assert('自动封禁已写入 source=auto 的 AI 样本', autoSampleRows.length === 1, JSON.stringify(autoSampleRows));
	assert('自动学入的样本含现场昵称', autoSampleRows.some((r) => String(r.sample_text).includes('资源对接小助手')), JSON.stringify(autoSampleRows));
	assert('自动学入的样本向量留空待懒加载', autoSampleRows.every((r) => r.embedding === null || r.embedding === undefined), JSON.stringify(autoSampleRows.map((r) => r.embedding)));
	assert('自动学入后样本库 +1', env.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c === samplesBeforeFresh + 1);
	// 回执通知里也要报出来，主人才知道 AI 学到了东西。
	// 回执通知里也要报出来，主人才知道 AI 学到了东西。
	// [8] 段没有 [6] 段那个 ownerNoticeText 局部辅助，这里就地从 calls 里取。
	const freshNotice = calls
		.filter((c) => c.method === 'sendMessage' && String(c.body?.chat_id) === String(OWNER_ID))
		.map((c) => String(c.body?.text || '')).join('\n');
	assert('封禁通知报告已加 AI 样本', freshNotice.includes('已加 1 条 AI 样本'), freshNotice);

	// /confirm 不再被广告命令入口接管。断言的是「不产生 /confirm 的那套回执、不动快照」，
	// 而不是「有报错」—— 未知命令交回既有命令层处理，那不是本段的职责。
	const liveBeforeConfirm = env.DB.query('SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE expires_at > 0')[0].c;
	const confirmGone = await cmd(env, '/confirm 1');
	assert('/confirm 不再有确认回执', !String(confirmGone).includes('已确认为广告'), confirmGone);
	assert('/confirm 不再动快照', env.DB.query('SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE expires_at > 0')[0].c === liveBeforeConfirm, JSON.stringify(env.DB.query('SELECT seq, user_id, expires_at FROM ad_pending_snapshots')));

	// /ignore → 解黑 + 全群解封 + 指纹即删 + AI 样本即删
	await runAdBan(env, 70002);
	const seq70002 = env.DB.query("SELECT seq FROM ad_pending_snapshots WHERE user_id = '70002'")[0]?.seq;
	// 序号单调递增、永不复用（2026-09-08）：70001 的 #1 与 70003 的 #2 都还占着位，
	// 所以这条必须拿到 #3。旧实现 MAX(seq) 会随行被删除而回退，
	// 主人照着旧通知发 /ignore 就会解封错人。
	assert('序号单调递增不复用', seq70002 === 3, JSON.stringify(env.DB.query('SELECT seq, user_id, expires_at FROM ad_pending_snapshots')));
	assert('第二次封禁已入黑名单', env.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '70002'")[0].c === 1);
	const autoFpBefore = env.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'auto'")[0].c;
	assert('回滚前存在自动学入的指纹', autoFpBefore > 0, String(autoFpBefore));
	const ignoreText = await cmd(env, '/ignore ' + seq70002);
	assert('/ignore 回执标题正确', ignoreText.includes('已按误判回滚'), ignoreText);
	assert('/ignore 调用全群解封', countCalls('unbanChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('/ignore 移出黑名单', env.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '70002'")[0].c === 0);
	assert('/ignore 回执写明黑名单已移除', ignoreText.includes('已移除'), ignoreText);
	assert('/ignore 标记指纹误判', ignoreText.includes('指纹修正：'), ignoreText);
	assert('/ignore 回执报告 AI 样本处理结果', ignoreText.includes('AI 样本：'), ignoreText);
	// purge 档（项 4）：主人已明确表态是误判 → 命中的指纹【当次即删】，不再攒 3 次误报。
	// 种子指纹刻意不即删（那是中心特征，删了不会自动补回），仍走「置信度 < 0.2 且误报 ≥ 3」通道。
	assert('/ignore 即删命中的自动指纹', env.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'auto'")[0].c < autoFpBefore, JSON.stringify(env.DB.query("SELECT type, value, source, false_positive_count FROM ad_fingerprints WHERE source = 'auto' LIMIT 8")));
	assert('/ignore 不删种子指纹', env.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'seed'")[0].c > 0, String(env.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'seed'")[0].c));
	// 项 8：错样本必须一起清掉 —— AI 层是硬命中即封、不看豁免词也不看总分，
	// 留一条错样本比留一条错指纹更危险。
	const autoSamplesAfter = env.DB.query("SELECT sample_text FROM ad_sample_embeddings WHERE source = 'auto'").map((r) => String(r.sample_text));
	assert('/ignore 删掉该号自动学入的 AI 样本', !autoSamplesAfter.some((t) => t.includes('高价收网赚号')), JSON.stringify(autoSamplesAfter));
	// 快照不物理删除：行要留在表里占住序号，用 expires_at = 0 表示「已复核」。
	assert('/ignore 后快照标记已复核', env.DB.query("SELECT expires_at FROM ad_pending_snapshots WHERE user_id = '70002'")[0]?.expires_at === 0, JSON.stringify(env.DB.query('SELECT seq, user_id, expires_at FROM ad_pending_snapshots')));
	assert('/ignore 后快照行仍占住序号', env.DB.query("SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE user_id = '70002'")[0].c === 1);
	assert('/ignore 后不再出现在 /pending', !(await cmd(env, '/pending')).includes('70002'), lastSent());
	assert('/ignore 后观察记录被清', env.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '70002'")[0].c === 0);
	assert('/ignore 不存在的序号给出提示', (await cmd(env, '/ignore 88')).includes('不存在或已复核过'), lastSent());
	assert('/ignore 已复核过的序号不重复执行', (await cmd(env, '/ignore ' + seq70002)).includes('不存在或已复核过'), lastSent());

	// 批量回滚（项 10A）：空格分隔、区间、非法参数
	assert('/ignore 无参给出批量与区间用法', (await cmd(env, '/ignore')).includes('区间'), lastSent());
	assert('/ignore 非法参数给出用法', (await cmd(env, '/ignore abc')).includes('用法'), lastSent());
	await runAdBan(env, 70004);
	await runAdBan(env, 70005);
	const liveSeqs = env.DB.query('SELECT seq, user_id FROM ad_pending_snapshots WHERE expires_at > 0 ORDER BY seq');
	assert('批量前有两条以上待复核快照', liveSeqs.length >= 2, JSON.stringify(liveSeqs));
	const batchText = await cmd(env, '/ignore ' + liveSeqs.map((r) => r.seq).join(' '));
	assert('/ignore 批量回执标题正确', batchText.includes('批量误判回滚'), batchText);
	assert('/ignore 批量报告回滚条数', batchText.includes('已回滚 <b>' + liveSeqs.length + '</b> 个'), batchText);
	assert('/ignore 批量全部解黑', env.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id IN ('70004','70005')")[0].c === 0, JSON.stringify(env.DB.query('SELECT id FROM blacklist')));
	assert('/ignore 批量后无待复核快照', env.DB.query('SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE expires_at > 0')[0].c === 0, JSON.stringify(env.DB.query('SELECT seq, user_id, expires_at FROM ad_pending_snapshots')));
	// 区间语法：全部已复核，所以回执应是「跳过」而不是报错。
	const rangeText = await cmd(env, '/ignore 1-3');
	assert('/ignore 区间语法可解析', rangeText.includes('批量误判回滚'), rangeText);
	assert('/ignore 区间对已复核序号只跳过', rangeText.includes('已回滚 <b>0</b> 个') && rangeText.includes('跳过 <b>3</b> 个'), rangeText);
	// 上限保护：不设上限的话一句 /ignore 1-99999 会撞 TG 限流与子请求预算。
	const overText = await cmd(env, '/ignore 1-999');
	assert('/ignore 超出单次上限时截断并告知', overText.includes('超过单次上限'), overText);
}

section('[9] 指纹与样本维护命令（addword / words / delword / addsample / clearsamples）');
{
	const cmd = async (env, text) => {
		resetCalls();
		await sendUpdate({ message: privateMessage(OWNER_ID, text) }, env);
		return lastSent();
	};
	const cmdAll = async (env, text) => {
		resetCalls();
		await sendUpdate({ message: privateMessage(OWNER_ID, text) }, env);
		return allSentText();
	};
	const countFp = (env, where = '') => env.DB.query('SELECT COUNT(*) AS c FROM ad_fingerprints' + (where ? ' WHERE ' + where : ''))[0].c;
	const countSample = (env) => env.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;

	const env = makeEnv();
	await W.adDetectionReady(env);
	// 清掉 adDetectionReady 自动灌入的指纹种子（AD_FINGERPRINT_SEED，33 条）。
	// 本段考察的是 /addword /words /delword 三个命令自身的行为，基准是「本段手动添加的那几条」。
	// 种子留着会同时破坏两件事：总条数从 3 顶到 36；/words 按 match_count DESC, created_at DESC
	// 每页 20 条排序，33 条 match_count=0 的种子会把刚添加的指纹挤出首页。
	// 那样断言测的就不再是命令逻辑而是种子条数。种子本身的落地由文件末尾的专门 section 验证。
	await env.DB.exec("DELETE FROM ad_fingerprints WHERE source = 'seed'");

	// /addword：无参给用法；末位参数是合法类型时按类型建，否则按值形态推断。
	assert('/addword 无参给出用法', (await cmd(env, '/addword')).includes('用法'), lastSent());
	assert('/addword 值太短被拒', (await cmd(env, '/addword A')).includes('值太短'), lastSent());
	assert('/addword 显式类型添加成功', (await cmd(env, '/addword 收U秒结 keyword')).includes('指纹已添加'), lastSent());
	assert('/addword 显式类型落库为 keyword', env.DB.query("SELECT type FROM ad_fingerprints WHERE value = '收U秒结'")[0]?.type === 'keyword', JSON.stringify(env.DB.query('SELECT type, value, source FROM ad_fingerprints')));
	assert('/addword 同值重复提示已更新', (await cmd(env, '/addword 收U秒结 keyword')).includes('指纹已更新'), lastSent());
	assert('/addword 同值重复不产生第二行', countFp(env, "value = '收U秒结'") === 1);
	// 【方案 A】@ 开头不再推断为 username 型（那类指纹已不参与匹配，写进去是死数据），
	// 改为落到 keyword —— @handle 作为普通子串参与昵称/简介/正文匹配，仍可定罪，
	// 但走的是主人显式手工添加这条明路，不是自动学习偷偷入库。
	assert('/addword @值推断为 keyword 而非 username', (await cmd(env, '/addword @promo_seller_x')).includes('类型：keyword'), lastSent());
	assert('/addword @值不产生 username 型行', countFp(env, "type = 'username'") === 0, JSON.stringify(env.DB.query('SELECT type, value FROM ad_fingerprints')));
	assert('/addword 自动推断 domain', (await cmd(env, '/addword AD-Example.com')).includes('类型：domain'), lastSent());
	assert('/addword domain 值被归一化为小写', countFp(env, "type = 'domain' AND value = 'ad-example.com'") === 1, JSON.stringify(env.DB.query("SELECT type, value FROM ad_fingerprints WHERE type = 'domain'")));
	assert('/addword 手动指纹一律记为 manual', countFp(env, "source = 'manual'") === 3, JSON.stringify(env.DB.query('SELECT value, source FROM ad_fingerprints')));
	assert('/addword 手动指纹权重与置信度为 1', env.DB.query("SELECT weight, confidence FROM ad_fingerprints WHERE value = '收U秒结'")[0]?.confidence === 1);

	// /words：按命中次数倒序分页，空库与非空库两种回执。
	const wordsText = await cmdAll(env, '/words');
	assert('/words 回执标题正确', wordsText.includes('指纹库'), wordsText);
	assert('/words 统计总条数', wordsText.includes('共 <b>3</b> 条'), wordsText);
	assert('/words 展示指纹值', wordsText.includes('收U秒结') && wordsText.includes('@promo_seller_x'), wordsText);
	assert('/words 展示来源', wordsText.includes('来源 manual'), wordsText);
	assert('/words 越界页码给出最大页码提示', (await cmdAll(env, '/words 99')).includes('该页没有数据'), allSentText());
	const envEmptyWords = makeEnv();
	await W.adDetectionReady(envEmptyWords);
	// 同上清种子。种子上线后「指纹库为空」在生产里已不可达，但这条文案分支仍要保持可测。
	await envEmptyWords.DB.exec("DELETE FROM ad_fingerprints WHERE source = 'seed'");
	assert('/words 空库给出引导', (await cmdAll(envEmptyWords, '/words')).includes('当前为空'), allSentText());

	// /delword：按值删除，跨类型一并清掉。
	assert('/delword 无参给出用法', (await cmd(env, '/delword')).includes('用法'), lastSent());
	assert('/delword 删除存在的指纹', (await cmd(env, '/delword 收U秒结')).includes('已删除'), lastSent());
	assert('/delword 删除后该值消失', countFp(env, "value = '收U秒结'") === 0);
	assert('/delword 不影响其它指纹', countFp(env) === 2, JSON.stringify(env.DB.query('SELECT type, value FROM ad_fingerprints')));
	assert('/delword 删除不存在的值有提示', (await cmd(env, '/delword 根本没有这个词')).includes('指纹库中没有'), lastSent());

	// /addsample：只写文本，向量留给检测时懒加载补齐。
	const sampleBase = countSample(env);
	// 2026-09-08：33 条中心特征以 source='seed-core' 一并灌进样本库，样本总数不再等于内置种子的 10 条。
	// 分 source 断言比写死总数稳 —— 中心特征条数会随主人加词变化，总数不该是硬编码。
	assert('内置种子样本已就位', env.DB.query("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE source = 'seed'")[0].c === 10, String(sampleBase));
	assert('中心特征已一并灌进样本库', env.DB.query("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE source = 'seed-core'")[0].c >= 20, String(sampleBase));
	assert('/addsample 无参给出用法', (await cmd(env, '/addsample')).includes('用法'), lastSent());
	assert('/addsample 文本太短被拒', (await cmd(env, '/addsample 收U')).includes('样本太短'), lastSent());
	const NEW_SAMPLE = '招代理日结佣金 秒结不拖欠 全新样本文本';
	assert('/addsample 添加成功', (await cmd(env, '/addsample ' + NEW_SAMPLE)).includes('样本已添加'), lastSent());
	assert('/addsample 后样本库 +1', countSample(env) === sampleBase + 1);
	assert('/addsample 落库来源为 manual', env.DB.query("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE source = 'manual'")[0].c === 1);
	assert('/addsample 向量留空待懒加载', env.DB.query('SELECT embedding FROM ad_sample_embeddings ORDER BY id DESC LIMIT 1')[0]?.embedding === null);
	assert('/addsample 重复文本提示已存在', (await cmd(env, '/addsample ' + NEW_SAMPLE)).includes('样本已存在'), lastSent());
	assert('/addsample 重复文本不再增长', countSample(env) === sampleBase + 1);

	// /clearsamples：破坏性操作走 D1 一次性令牌二次确认（纯 D1 环境用 expires_at + 读取即删替代 KV TTL）。
	const clearPrompt = await cmd(env, '/clearsamples');
	assert('/clearsamples 先要求二次确认', clearPrompt.includes('确认清空语义样本库'), clearPrompt);
	assert('/clearsamples 提示写明当前条数', clearPrompt.includes('共 <b>' + (sampleBase + 1) + '</b> 条样本'), clearPrompt);
	const tokenMatch = clearPrompt.match(/<code>\/clearsamples ([^<\s]+)<\/code>/);
	assert('/clearsamples 提示里带确认令牌', Boolean(tokenMatch), clearPrompt);
	const token = tokenMatch ? tokenMatch[1] : 'deadbeefdeadbeef';
	assert('/clearsamples 令牌为 16 位小写 hex', /^[0-9a-f]{16}$/.test(token), token);
	assert('/clearsamples 令牌已入 D1 令牌表', env.DB.query('SELECT COUNT(*) AS c FROM ad_confirm_tokens')[0].c === 1);
	assert('/clearsamples 未确认前样本仍在', countSample(env) === sampleBase + 1);
	const clearDone = await cmd(env, '/clearsamples ' + token);
	assert('/clearsamples 令牌确认后清空', clearDone.includes('样本库已清空'), clearDone);
	assert('/clearsamples 回执写明删除条数', clearDone.includes('删除 <b>' + (sampleBase + 1) + '</b> 条样本'), clearDone);
	assert('/clearsamples 后样本表为空', countSample(env) === 0);
	assert('/clearsamples 令牌用后即焚', env.DB.query('SELECT COUNT(*) AS c FROM ad_confirm_tokens')[0].c === 0);
	assert('/clearsamples 同一令牌不能复用', (await cmd(env, '/clearsamples ' + token)).includes('令牌无效'), lastSent());
	assert('/clearsamples 空库时直接提示无需清理', (await cmd(env, '/clearsamples')).includes('样本库已经是空的'), lastSent());
	assert('/clearsamples 空库时不签发令牌', env.DB.query('SELECT COUNT(*) AS c FROM ad_confirm_tokens')[0].c === 0);

	// ===== /delword 批量档（2026-09-08 项 10B）=====
	// 主人原话：「我觉得指令可以支持批量删除，可以通过现有的指令库来执行批量删除号。」
	// 独立 env 且【保留】adDetectionReady 灌入的 33 条种子指纹 —— 本组的核心断言就是
	// 「批量档一条种子都不许删」。种子是中心特征，补灌判空条件是「数 source='seed' 的条数」，
	// 只要库里还剩一条，被删掉的那些重新部署也不会补回来。
	const envBulk = makeEnv();
	await W.adDetectionReady(envBulk);
	const seedFpCount = countFp(envBulk, "source = 'seed'");
	// 33 → 26：方案 A 移除了 7 条 username 型引流账号种子（2026-09-10）。
	assert('批量档基线：种子指纹已就位', seedFpCount === 26, String(seedFpCount));

	const delUsage = await cmd(envBulk, '/delword');
	assert('/delword 用法写出 noise 批量档', delUsage.includes('/delword noise'), delUsage);
	assert('/delword 用法写出 type 批量档', delUsage.includes('type:username'), delUsage);
	assert('/delword 用法声明不动种子', delUsage.includes('不动种子指纹'), delUsage);

	// 未知类型必须当场拒绝，不能签出令牌 —— 否则主人拿着令牌确认后才发现类型写错，白等 60 秒。
	const badType = await cmd(envBulk, '/delword type:nosuchtype');
	assert('/delword 未知类型被拒', badType.includes('未知指纹类型'), badType);
	assert('/delword 未知类型列出可用类型', badType.includes('keyword') && badType.includes('bio'), badType);
	assert('/delword 未知类型不签令牌', envBulk.DB.query('SELECT COUNT(*) AS c FROM ad_confirm_tokens')[0].c === 0);

	// 造线上那种局面：一批自动学来的单账号指纹，其中两条命中 0（纯噪声），
	// 一条已经真抓到过人（有命中）—— noise 档必须只删前两条。
	// 【2026-09-10 方案 A】原来这三条用 type:'username' 造，现在 addAdFingerprint 会拒收，
	// 改用 keyword 型 —— 本组测的是 /delword 批量删除机制（noise 筛选、令牌、种子保护），
	// 与指纹类型无关，换类型不减少任何覆盖。
	await W.addAdFingerprint(envBulk, '@noise_one', { type: 'keyword', createdBy: String(OWNER_ID) });
	await W.addAdFingerprint(envBulk, '@noise_two', { type: 'keyword', createdBy: String(OWNER_ID) });
	await W.addAdFingerprint(envBulk, '@hit_seller', { type: 'keyword', createdBy: String(OWNER_ID) });
	await envBulk.DB.exec("UPDATE ad_fingerprints SET match_count = 5 WHERE value = '@hit_seller'");
	// 另造两条【历史遗留的 username 型】行，绕过 addAdFingerprint 直插 D1 ——
	// 线上库里确实存着这类旧数据（含原 7 条种子），下面 type:username 档要能把它们清掉。
	// 这是方案 A 的运维闭环：代码侧已免疫（matchAdFingerprints 跳过 username 型），
	// 但主人仍需要一条指令把脏数据真正删干净。
	await envBulk.DB.exec(
		"INSERT INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_by, created_at, updated_at) "
		+ "VALUES ('legacyfp0000001', 'username', '@legacy_user_a', 0.8, 0, 0, 1, 'auto', '', 1757000000, 1757000000), "
		+ "('legacyfp0000002', 'username', '@legacy_user_b', 0.8, 3, 0, 1, 'auto', '', 1757000000, 1757000000)"
	);
	const bulkTotalBefore = countFp(envBulk);

	const noisePreview = await cmdAll(envBulk, '/delword noise');
	assert('/delword noise 先要求二次确认', noisePreview.includes('确认批量删除指纹'), noisePreview);
	assert('/delword noise 写明筛选口径', noisePreview.includes('命中 0 次的噪声指纹'), noisePreview);
	assert('/delword noise 写明将删条数', noisePreview.includes('将删除 <b>3</b> 条'), noisePreview);
	assert('/delword noise 声明已排除种子', noisePreview.includes('种子指纹已排除'), noisePreview);
	// 破坏性操作必须让主人先【看见要删什么】，只报个数字他无从判断。
	assert('/delword noise 列出样本值', noisePreview.includes('@noise_one') && noisePreview.includes('@noise_two'), noisePreview);
	assert('/delword noise 预览阶段不动数据', countFp(envBulk) === bulkTotalBefore, String(countFp(envBulk)));
	const noiseToken = (noisePreview.match(/<code>\/delword bulk ([^<\s]+)<\/code>/) || [])[1];
	assert('/delword noise 给出 bulk 令牌', Boolean(noiseToken) && /^[0-9a-f]{16}$/.test(noiseToken || ''), String(noiseToken));
	assert('/delword noise 令牌已入 D1 令牌表', envBulk.DB.query('SELECT COUNT(*) AS c FROM ad_confirm_tokens')[0].c === 1);

	const noiseDone = await cmd(envBulk, '/delword bulk ' + noiseToken);
	assert('/delword bulk 执行后回执正确', noiseDone.includes('已批量删除指纹'), noiseDone);
	assert('/delword bulk 回执写明删除条数', noiseDone.includes('删除 <b>3</b> 条'), noiseDone);
	assert('/delword noise 命中 0 的被删掉', countFp(envBulk, "value IN ('@noise_one','@noise_two')") === 0, JSON.stringify(envBulk.DB.query('SELECT value, match_count FROM ad_fingerprints WHERE type = \'username\'')));
	assert('/delword noise 有命中的保留', countFp(envBulk, "value = '@hit_seller'") === 1);
	// 33 条种子的 match_count 全是 0，正是 noise 档最容易误删的一批。
	assert('/delword noise 一条种子都没删', countFp(envBulk, "source = 'seed'") === seedFpCount, String(countFp(envBulk, "source = 'seed'")));
	assert('/delword bulk 令牌用后即焚', envBulk.DB.query('SELECT COUNT(*) AS c FROM ad_confirm_tokens')[0].c === 0);
	assert('/delword bulk 同一令牌不能复用', (await cmd(envBulk, '/delword bulk ' + noiseToken)).includes('令牌无效'), lastSent());
	// 令牌语法带 bulk 前缀的理由：不然这串 hash 会被「按值删除」那档吞掉，
	// 静默报一句「指纹库中没有」，主人以为是令牌过期。
	assert('/delword bulk 无效令牌提示重新获取', (await cmd(envBulk, '/delword bulk 0123456789abcdef')).includes('重新执行批量'), lastSent());

	// type: 档：整类清掉，种子照样不动。
	const typePreview = await cmdAll(envBulk, '/delword type:username');
	assert('/delword type 先要求二次确认', typePreview.includes('确认批量删除指纹'), typePreview);
	assert('/delword type 写明筛选口径', typePreview.includes('类型为 username 的指纹'), typePreview);
	const typeToken = (typePreview.match(/<code>\/delword bulk ([^<\s]+)<\/code>/) || [])[1];
	assert('/delword type 给出 bulk 令牌', Boolean(typeToken), String(typeToken));
	const typeDone = await cmd(envBulk, '/delword bulk ' + typeToken);
	assert('/delword type 执行后回执正确', typeDone.includes('已批量删除指纹'), typeDone);
	assert('/delword type 该类非种子指纹已清空', countFp(envBulk, "type = 'username' AND COALESCE(source,'') != 'seed'") === 0, JSON.stringify(envBulk.DB.query("SELECT value, source FROM ad_fingerprints WHERE type = 'username'")));
	assert('/delword type 种子里的 username 仍在', countFp(envBulk, "source = 'seed'") === seedFpCount, String(countFp(envBulk, "source = 'seed'")));

	// 空集合直接告知，不签令牌 —— 免得主人确认一个什么都不会删的令牌。
	const emptyBulk = await cmd(envBulk, '/delword type:username');
	assert('/delword 批量无匹配时明确告知', emptyBulk.includes('没有匹配'), emptyBulk);
	assert('/delword 批量无匹配时不签令牌', envBulk.DB.query('SELECT COUNT(*) AS c FROM ad_confirm_tokens')[0].c === 0);

	// 「按值删除」那档行为一个字都没变：批量写法之外的参数一律走原路径。
	assert('/delword 普通值仍走按值删除', (await cmd(envBulk, '/delword 根本没有这个词')).includes('指纹库中没有'), lastSent());
	assert('/delword 按值删除可删种子', (await cmd(envBulk, '/delword ' + envBulk.DB.query("SELECT value FROM ad_fingerprints WHERE source = 'seed' LIMIT 1")[0].value)).includes('已删除'), lastSent());
}

section('[10] 状态、白名单与观察窗口复判（adstats / whitelist / rescreen）');
{
	const adProfileApi = {
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '💚高价收网赚号💚', bio: '长期收购网 du 商宝账号，老账号优先加价' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: [] })
	};
	const cmd = async (env, text) => {
		resetCalls();
		await sendUpdate({ message: privateMessage(OWNER_ID, text) }, env);
		return lastSent();
	};
	const cmdAll = async (env, text) => {
		resetCalls();
		await sendUpdate({ message: privateMessage(OWNER_ID, text) }, env);
		return allSentText();
	};
	// resetCalls() 内部会 setApi() 把 mock 处理器清空，所以「先 setApi 再发命令」的写法
	// 会让命令执行时拿到默认空资料。凡是命令自身要回查 Telegram 资料的场景都必须用这个版本：
	// 先清计数，再装 mock，最后发命令。
	const cmdApi = async (env, text, api) => {
		resetCalls();
		setApi(api);
		await sendUpdate({ message: privateMessage(OWNER_ID, text) }, env);
		return allSentText();
	};

	const env = makeEnv();
	await W.adDetectionReady(env);

	// /adstats：一屏看全。未绑 AI 时必须明确写出降级，否则运维会误以为三层都在跑。
	const statsText = await cmdAll(env, '/adstats');
	assert('/adstats 回执标题正确', statsText.includes('广告检测状态'), statsText);
	assert('/adstats 展示封禁阈值', statsText.includes('封禁阈值：<b>7</b>'), statsText);
	assert('/adstats 展示观察阈值', statsText.includes('观察阈值：<b>5</b>'), statsText);
	assert('/adstats 未绑 AI 时标注降级', statsText.includes('未绑定，降级为评分 + 指纹两层'), statsText);
	// 2026-09-08：样本库 = 10 条种子 + 中心特征，条数会随主人加词变化，所以按实际总数断言而不写死 10。
	const statsSampleTotal = env.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;
	assert('/adstats 统计语义样本与种子', statsText.includes('语义样本') && statsText.includes('共 <b>' + statsSampleTotal + '</b> 条'), statsText);
	assert('/adstats 统计观察窗口人数', statsText.includes('观察窗口') && statsText.includes('窗口内 <b>0</b> 人'), statsText);
	assert('/adstats 统计待确认快照', statsText.includes('待确认快照') && statsText.includes('<b>0</b> 条'), statsText);
	assert('/adstats 统计域名白名单', statsText.includes('域名白名单') && statsText.includes('内置种子'), statsText);
	const envAi = makeEnv({ AI: { async run() { return { data: [new Array(EMBED_DIM).fill(0)] }; } } });
	await W.adDetectionReady(envAi);
	const statsAi = await cmdAll(envAi, '/adstats');
	assert('/adstats 绑定 AI 时标注已绑定', statsAi.includes('已绑定'), statsAi);
	// 直接比对源码里的模型常量，换模型时这条断言自动跟随，不会像写死 'bge-base-zh' 那样过期
	assert('/adstats 绑定 AI 时写出模型名', statsAi.includes(EMBED_MODEL), statsAi);
	assert('/adstats 绑定 AI 时写出维度', statsAi.includes(EMBED_DIM + ' 维'), statsAi);
	// /adstats 顺带补一批向量。此前 topUpAdSampleEmbeddings 只在第三层内部被调用，
	// 而第三层要消息通过零成本预筛才会走到、指纹层命中定罪更走不到 —— 于是新部署的向量
	// 可能长期停在 0，第三层空转。把补齐挂在「主人查状态」这个自然时机上打破死锁。
	assert('/adstats 顺带补齐样本向量', envAi.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE embedding IS NOT NULL')[0].c > 0, JSON.stringify(envAi.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE embedding IS NOT NULL')));
	assert('/adstats 回执写出本次生成条数', statsAi.includes('本次顺带生成'), statsAi);
	// 未绑 AI 时不该出现补齐相关文案（那台 env 的样本向量永远是 0，属正常）
	assert('/adstats 未绑 AI 不提补齐', !statsText.includes('本次顺带生成'), statsText);

	// /warmup：手动补齐入口，反复发直到补满。
	const envWarm = makeEnv({ AI: { async run() { return { data: [new Array(EMBED_DIM).fill(0)] }; } } });
	await W.adDetectionReady(envWarm);
	const warm1 = await cmdAll(envWarm, '/warmup');
	const warmReady1 = envWarm.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE embedding IS NOT NULL')[0].c;
	assert('/warmup 首次生成向量', warmReady1 > 0, '已生成 ' + warmReady1 + ' 条');
	assert('/warmup 单次不超过 8 条批量上限', warmReady1 <= 8, '已生成 ' + warmReady1 + ' 条');
	assert('/warmup 回执写出进度', warm1.includes('进度'), warm1);
	assert('/warmup 未补满时提示继续', warm1.includes('再发 /warmup 继续'), warm1);
	// 2026-09-08 项 2b：去掉「只补前 30 条」的上限，目标改为整个样本库（种子 10 + 中心特征）。
	// AD_SAMPLE_LAZY_BATCH = 8 每次只补 8 条，所以补满不再是原来的两轮。
	// 断言刻意不写死轮数与总条数 —— 中心特征会随主人加词变化，改成「补到不再增长」。
	const warmTotal = envWarm.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings')[0].c;
	const warm2 = await cmdAll(envWarm, '/warmup');
	const warmReady2 = envWarm.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE embedding IS NOT NULL')[0].c;
	assert('/warmup 二次补齐继续推进进度', warmReady2 > warmReady1 && warmReady2 <= warmReady1 + 8, '已生成 ' + warmReady2 + ' 条 / 共 ' + warmTotal);
	assert('/warmup 未补满时仍提示继续', warm2.includes('再发 /warmup 继续'), warm2);
	// 反复发直到覆盖整个样本库。循环上限 10 轮是护栏：真补不动时让断言报错，而不是死循环。
	let warmLast = warm2;
	for (let i = 0; i < 10; i += 1) {
		const before = envWarm.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE embedding IS NOT NULL')[0].c;
		if (before >= warmTotal) break;
		warmLast = await cmdAll(envWarm, '/warmup');
	}
	const warmReadyFull = envWarm.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE embedding IS NOT NULL')[0].c;
	assert('/warmup 反复补齐后覆盖全部样本', warmReadyFull === warmTotal, '已生成 ' + warmReadyFull + ' 条 / 共 ' + warmTotal);
	assert('/warmup 补满后提示已生效', warmLast.includes('第三层 AI 语义判定现已生效') || warmLast.includes('向量已就绪'), warmLast);
	const warm3 = await cmdAll(envWarm, '/warmup');
	assert('/warmup 已就绪时给出明确回执', warm3.includes('向量已就绪'), warm3);
	assert('/warmup 已就绪时不再重复生成', envWarm.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE embedding IS NOT NULL')[0].c === warmTotal);
	// 未绑 AI 时应说明第三层不可用，而不是假装补齐成功
	const warmNoAi = await cmdAll(makeEnv(), '/warmup');
	assert('/warmup 未绑 AI 时说明不可用', warmNoAi.includes('未绑定 Workers AI'), warmNoAi);
	assert('/warmup 未绑 AI 时说明降级为两层', warmNoAi.includes('两层'), warmNoAi);
	// 样本库为空时引导去 /addsample，而不是报成功
	const envEmptySample = makeEnv({ AI: { async run() { return { data: [new Array(EMBED_DIM).fill(0)] }; } } });
	await W.adDetectionReady(envEmptySample);
	envEmptySample.DB.__sqlite.exec('DELETE FROM ad_sample_embeddings');
	const warmEmpty = await cmdAll(envEmptySample, '/warmup');
	assert('/warmup 样本库为空时引导 addsample', warmEmpty.includes('/addsample'), warmEmpty);

	// /whitelist：建表时就把 50 条内置种子写进 D1，所以默认列出的是「D1 自定义 50 条」；
	// 只有把表清空后才回落到内存里的种子集合。
	const wlList = await cmdAll(env, '/whitelist');
	assert('/whitelist 缺省子命令等于 list', wlList.includes('域名白名单'), wlList);
	assert('/whitelist 建表即写入 50 条种子', wlList.includes('D1 自定义（50 条）'), wlList);
	assert('/whitelist 生效集合与 D1 表一致', wlList.includes('生效 <b>50</b> 条'), wlList);
	assert('/whitelist 展示种子域名', wlList.includes('github.com'), wlList);
	assert('/whitelist add 无参给出用法', (await cmd(env, '/whitelist add')).includes('用法'), lastSent());
	assert('/whitelist del 无参给出用法', (await cmd(env, '/whitelist del')).includes('用法'), lastSent());
	assert('/whitelist 非法子命令给出用法', (await cmd(env, '/whitelist foo')).includes('用法'), lastSent());
	assert('/whitelist add 成功', (await cmd(env, '/whitelist add My-Shop.Example')).includes('已加入白名单'), lastSent());
	assert('/whitelist add 落库并归一化为小写', env.DB.query("SELECT COUNT(*) AS c FROM ad_domain_whitelist WHERE domain = 'my-shop.example'")[0].c === 1, JSON.stringify(env.DB.query("SELECT domain FROM ad_domain_whitelist WHERE domain LIKE '%shop%'")));
	assert('/whitelist add 重复提示已在白名单', (await cmd(env, '/whitelist add my-shop.example')).includes('已在白名单中'), lastSent());
	assert('/whitelist add 重复不产生第二行', env.DB.query('SELECT COUNT(*) AS c FROM ad_domain_whitelist')[0].c === 51);
	const wlAfterAdd = await cmdAll(env, '/whitelist list');
	// 列表查询固定 LIMIT 50，51 条时只能列出 50 条；总量看「生效」那一行，不看列表标题里的数字。
	assert('/whitelist list 生效数反映真实总量', wlAfterAdd.includes('生效 <b>51</b> 条'), wlAfterAdd);
	assert('/whitelist list 列表截断在 50 条', wlAfterAdd.includes('D1 自定义（50 条）'), wlAfterAdd);
	assert('/whitelist add 非法域名被拒', (await cmd(env, '/whitelist add 不是域名')).includes('域名不合法'), lastSent());
	assert('/whitelist del 移除成功', (await cmd(env, '/whitelist del my-shop.example')).includes('已从白名单移除'), lastSent());
	assert('/whitelist del 后只剩种子', env.DB.query('SELECT COUNT(*) AS c FROM ad_domain_whitelist')[0].c === 50);
	assert('/whitelist del 不存在的域名有提示', (await cmd(env, '/whitelist del never-added.example')).includes('白名单中没有该域名'), lastSent());
	// 把表清空，验证「删到空不会导致所有链接都判广告」的回落分支。
	env.DB.__sqlite.exec('DELETE FROM ad_domain_whitelist');
	const wlEmpty = await cmdAll(env, '/whitelist list');
	assert('/whitelist 表清空后说明回落内置种子', wlEmpty.includes('D1 自定义：无'), wlEmpty);
	assert('/whitelist 表清空后提示切换语义', wlEmpty.includes('内置种子不再自动合并'), wlEmpty);
	// 表里只有一条时不会被 LIMIT 50 截断，这里才能验证「新增域名确实会出现在列表里」。
	await cmd(env, '/whitelist add Only-One.Example');
	const wlOne = await cmdAll(env, '/whitelist list');
	assert('/whitelist list 展示新增域名', wlOne.includes('D1 自定义（1 条）') && wlOne.includes('only-one.example'), wlOne);

	// /rescreen：拿当前指纹库把观察窗口里的人再筛一遍。空窗口要能直接返回，不能报错。
	const envRs = makeEnv();
	await W.adDetectionReady(envRs);
	assert('/rescreen 空窗口给出提示', (await cmd(envRs, '/rescreen')).includes('观察窗口内没有待复判的用户'), lastSent());

	// 先制造一次自动封禁，把 bio 类指纹（权重 0.8，单条即定罪）学进库。
	setApi(adProfileApi);
	await sendUpdate({ message: joinMessage([{ id: 70009, first_name: '💚高价收网赚号💚' }]) }, envRs);
	assert('复判前置：指纹已由自动学习入库', envRs.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE type = 'bio'")[0].c >= 1, JSON.stringify(envRs.DB.query('SELECT type, value FROM ad_fingerprints')));

	// 预置一条观察窗口记录：得分 6 不到封禁线，但资料会命中刚学到的 bio 指纹。
	const rsConfig = W.loadAdDetectionConfig(envRs);
	await W.upsertAdScreening(envRs, '70004', {
		chatId: GROUP_ID,
		score: 6,
		reasons: ['测试预置观察记录'],
		snapshot: { name: '待复判用户', text: '长期收购网赚账号 USDT' },
		layer: 'score'
	}, rsConfig);
	assert('复判前置：观察窗口有 1 人', envRs.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 1);

	const rsText = await cmdApi(envRs, '/rescreen', adProfileApi);
	assert('/rescreen 回执标题正确', rsText.includes('观察窗口复判完成'), rsText);
	assert('/rescreen 统计本次处理人数', rsText.includes('本次处理 <b>1</b> 人'), rsText);
	assert('/rescreen 命中指纹后判定封禁', rsText.includes('判定为广告并封禁：<b>1</b>'), rsText);
	assert('/rescreen 列出被封用户', rsText.includes('70004'), rsText);
	assert('/rescreen 引导用 /pending 复核', rsText.includes('/pending'), rsText);
	assert('/rescreen 封禁后移出观察窗口', envRs.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '70004'")[0].c === 0);
	assert('/rescreen 封禁写入黑名单', envRs.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '70004'")[0].c === 1);
	assert('/rescreen 封禁生成待确认快照', envRs.DB.query("SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE user_id = '70004'")[0].c === 1, JSON.stringify(envRs.DB.query('SELECT seq, user_id FROM ad_pending_snapshots')));
	assert('/rescreen 调用了全群封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));

	// 已在黑名单的人不重复处置：复判时直接解除观察。
	await W.upsertAdScreening(envRs, '70009', {
		chatId: GROUP_ID, score: 6, reasons: ['已封禁用户'], snapshot: { name: '已封禁用户' }, layer: 'score'
	}, rsConfig);
	const rsAgain = await cmdApi(envRs, '/rescreen', adProfileApi);
	assert('/rescreen 已封禁用户直接解除观察', rsAgain.includes('解除观察：<b>1</b>'), rsAgain);
	assert('/rescreen 解除观察后记录清零', envRs.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '70009'")[0].c === 0);

	// 主人/管理员误入观察窗口时，复判必须无条件放行。
	await W.upsertAdScreening(envRs, String(OWNER_ID), {
		chatId: GROUP_ID, score: 9, reasons: ['误入观察窗口'], snapshot: { name: 'Owner' }, layer: 'score'
	}, rsConfig);
	const rsOwner = await cmdApi(envRs, '/rescreen', adProfileApi);
	assert('/rescreen 主人不会被复判封禁', !rsOwner.includes('判定为广告并封禁：<b>1</b>'), rsOwner);
	assert('/rescreen 主人被移出观察窗口', envRs.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '" + OWNER_ID + "'")[0].c === 0);
	assert('/rescreen 主人未被写入黑名单', envRs.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '" + OWNER_ID + "'")[0].c === 0);

	// 数量参数超过硬上限时要被裁到 30，回执里必须写清实际上限，避免运维以为真按 999 跑。
	await W.upsertAdScreening(envRs, '70011', {
		chatId: GROUP_ID, score: 6, reasons: ['验证上限裁剪'], snapshot: { name: '普通用户', text: '大家早上好' }, layer: 'score'
	}, rsConfig);
	const rsLimit = await cmdApi(envRs, '/rescreen 999', {
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '普通用户', bio: '' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } })
	});
	assert('/rescreen 数量参数被裁到上限 30', rsLimit.includes('（上限 30）'), rsLimit);
	assert('/rescreen 干净资料不会误封', rsLimit.includes('判定为广告并封禁：<b>0</b>'), rsLimit);
	assert('/rescreen 空窗口再次给出提示', (await cmd(envRs, '/rescreen')).includes('观察窗口内没有待复判的用户'), lastSent());
}

section('[11] 回归：既有功能不被广告层吞掉');
{
	const env = makeEnv();
	await W.adDetectionReady(env);

	// 正常聊天：现在会拉资料（预筛门槛已移除），但必须不产生任何处置动作。
	resetCalls();
	setApi({ getChatAdministrators: () => ({ ok: true, result: [] }) });
	await sendUpdate({ message: groupMessage({ id: 71001, first_name: '普通群友' }, '大家早上好，今天天气不错') }, env);
	assert('普通群聊不封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('普通群聊不禁言', countCalls('restrictChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('普通群聊不删消息', countCalls('deleteMessage') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('普通群聊拉了资料仍判定放行', countCalls('getChat') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('普通群聊不进观察窗口', env.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '71001'")[0].c === 0);
	assert('普通群聊不写黑名单', env.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '71001'")[0].c === 0);

	// 频道自动转发（绑定频道的消息同步）必须原样放行，否则群公告会被当广告删掉。
	resetCalls();
	await sendUpdate({
		message: groupMessage({ id: 777000, first_name: 'Channel' }, '📢 高价收网赚号 长期收购账号 加微信联系', {
			is_automatic_forward: true,
			sender_chat: { id: -1009999999999, type: 'channel', title: '绑定频道' }
		})
	}, env);
	assert('频道自动转发不封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('频道自动转发不删消息', countCalls('deleteMessage') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('频道自动转发不进观察窗口', env.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 0, JSON.stringify(env.DB.query('SELECT user_id FROM ad_user_screening')));

	// 主人/管理员即便发了标准广告文案也不处置：管理豁免优先于三层判定。
	resetCalls();
	await sendUpdate({ message: groupMessage({ id: OWNER_ID, first_name: 'Owner' }, '高价收网赚号 长期收购网 du 商宝账号 USDT 日结') }, env);
	assert('主人发广告文案不被封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('主人发广告文案不进观察窗口', env.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '" + OWNER_ID + "'")[0].c === 0);
	assert('主人发广告文案不写黑名单', env.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '" + OWNER_ID + "'")[0].c === 0);

	// bot 入群：广告层不处置 bot，后续的机器人风控链路必须照常接手。
	// 这里 getChatMember 必须回 member —— 回 administrator 会命中风控自身的管理员豁免，看不出接手效果。
	resetCalls();
	setApi({
		getMe: () => ({ ok: true, result: { id: 777000, is_bot: true, username: 'AdGuardTestBot' } }),
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '推广机器人' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id, is_bot: true } } }),
		getChatAdministrators: () => ({ ok: true, result: [] }),
		restrictChatMember: () => ({ ok: true, result: true })
	});
	await sendUpdate({ message: joinMessage([{ id: 71002, first_name: '推广机器人', is_bot: true, username: 'promo_bot' }]) }, env);
	assert('bot 入群不被广告层写黑名单', env.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '71002'")[0].c === 0);
	assert('bot 入群交给机器人风控禁言', countCalls('restrictChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));

	// 私聊普通文本（非命令）不能被广告命令层截住，也不该触发任何处置。
	resetCalls();
	setApi({ getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }) });
	await sendUpdate({ message: privateMessage(71003, '你好，我想申请解封') }, env);
	assert('私聊普通文本不被封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('私聊普通文本不进观察窗口', env.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '71003'")[0].c === 0);
	assert('私聊普通文本不触发任何处置动作', countCalls('restrictChatMember') === 0 && countCalls('deleteMessage') === 0, JSON.stringify(calls.map((c) => c.method)));

	// 核心表与广告表共存：广告建表不能影响既有 schema 版本，也不能挤掉核心 5 表。
	// ad_votes / ad_vote_allowlist 属投票功能的按需建表，本文件不触发投票流程，故不在必存清单里。
	assert('核心表 schema 版本保持 6', Number(env.DB.query('SELECT version FROM schema_meta WHERE id = 1')[0]?.version) === 6, JSON.stringify(env.DB.query('SELECT * FROM schema_meta')));
	const tables = env.DB.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((r) => r.name);
	for (const t of ['schema_meta', 'blacklist', 'moderation_messages', 'batch_jobs', 'dynamic_groups', 'ad_fingerprints', 'ad_user_screening', 'ad_sample_embeddings', 'ad_domain_whitelist', 'ad_pending_snapshots', 'ad_confirm_tokens']) {
		assert('表存在：' + t, tables.includes(t), JSON.stringify(tables));
	}
	assert('投票表未被广告建表提前创建', !tables.includes('ad_votes'), JSON.stringify(tables));
}



section('[12] 修复项专项：manual 提权 / 自身 username / 回复学习词表');
{
	const env12 = makeEnv();
	await W.adDetectionReady(env12);

	// —— A1：/confirm 的 manual 提权真正生效 ——
	// 旧实现的 ON CONFLICT 不写 source，已 auto 入库的指纹经 /confirm 后仍是 auto，
	// 拿不到退役豁免（markAdFingerprintFalsePositive 的 DELETE 带 source != 'manual'）。
	const payloadA = { name: '💚高价收U💚', username: '@fp_seller_777', bio: '长期收购账号 老号加价', text: '', domains: [] };
	const payloadB = { name: '🌟诚信兑换铺🌟', username: '', bio: '专业收购游戏点卡 全天在线', text: '', domains: [] };

	const autoA = await W.learnAdFingerprints(env12, payloadA, { source: 'auto' });
	assert('A1 前置：auto 学习成功', autoA.ok === true && autoA.learned > 0, JSON.stringify(autoA));
	assert('A1 前置：首次入库 source 为 auto', env12.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'auto'")[0].c > 0, JSON.stringify(env12.DB.query('SELECT value, source FROM ad_fingerprints')));

	await W.learnAdFingerprints(env12, payloadA, { source: 'manual', createdBy: String(OWNER_ID) });
	assert('A1 manual 学习把已有指纹提权为 manual', env12.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'auto'")[0].c === 0, JSON.stringify(env12.DB.query('SELECT value, source FROM ad_fingerprints')));
	assert('A1 提权后 manual 指纹存在', env12.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'manual'")[0].c > 0);
	// 同样排除种子行：这里考察的是「提权走 UPDATE 而不是再插一行」，分母只能是本例学到的指纹。
	assert('A1 提权累加命中数而非重复插行', env12.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source != 'seed'")[0].c === autoA.learned, JSON.stringify(env12.DB.query("SELECT value, source, match_count FROM ad_fingerprints WHERE source != 'seed'")));

	// 反向必须禁止：auto 再学一遍不能把主人确认过的 manual 打回 auto。
	await W.learnAdFingerprints(env12, payloadA, { source: 'auto' });
	assert('A1 auto 不会把 manual 降权', env12.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'auto'")[0].c === 0, JSON.stringify(env12.DB.query('SELECT value, source FROM ad_fingerprints')));

	// 对照组：纯 auto 指纹在同样的误判次数下必须被退役，证明豁免确实来自 source。
	const autoB = await W.learnAdFingerprints(env12, payloadB, { source: 'auto' });
	assert('A1 对照组：auto 指纹入库', autoB.ok === true && env12.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'auto'")[0].c > 0, JSON.stringify(autoB));
	const manualBefore = env12.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'manual'")[0].c;
	for (let i = 0; i < 5; i += 1) {
		await W.markAdFingerprintFalsePositive(env12, payloadA);
		await W.markAdFingerprintFalsePositive(env12, payloadB);
	}
	assert('A1 manual 指纹扛过 5 次误判不被退役', env12.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'manual'")[0].c === manualBefore, JSON.stringify(env12.DB.query('SELECT value, source, match_count, false_positive_count, confidence FROM ad_fingerprints')));
	assert('A1 对照组 auto 指纹被退役清空', env12.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'auto'")[0].c === 0, JSON.stringify(env12.DB.query('SELECT value, source, confidence FROM ad_fingerprints')));

	// —— B1：username 维度精确化（2026-09-10 方案 B）——
	// matchAdFingerprints 只比对 payload.username 字段，不扫 haystack（正文/简介/昵称）。
	// extractAdFingerprintCandidates 只学账号自身 handle，@提及扫描路径已永久删除（#143 根因）。
	// 以下断言验证「自身入库」和「边界剔除」两类行为均符合新设计。
	assert('B1 自身 username 入库', env12.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE type = 'username'")[0].c > 0, JSON.stringify(env12.DB.query("SELECT type, value FROM ad_fingerprints")));
	const candNoAt = W.extractAdFingerprintCandidates({ name: '收U代理', username: 'no_at_prefix_ok', bio: '', text: '' }, new Set());
	assert('B1 不带 @ 前缀的 username 仍入库（push 内部补 @）', candNoAt.some((c) => c.type === 'username'), JSON.stringify(candNoAt));
	const candBad = W.extractAdFingerprintCandidates({ name: '收U代理', username: '@ab', bio: '', text: '' }, new Set());
	assert('B1 过短 username 不入库', !candBad.some((c) => c.type === 'username'), JSON.stringify(candBad));
	const candIllegal = W.extractAdFingerprintCandidates({ name: '收U代理', username: '@有中文的名字', bio: '', text: '' }, new Set());
	assert('B1 非法字符 username 不入库', !candIllegal.some((c) => c.type === 'username'), JSON.stringify(candIllegal));
	const candBoth = W.extractAdFingerprintCandidates({ name: '收U代理', username: '@self_handle_x', bio: '请联系 @other_handle_y 详谈', text: '' }, new Set());
	assert('B1 自身 username 入库、bio @提及不入库', candBoth.filter((c) => c.type === 'username').length === 1 && candBoth.some((c) => c.type === 'username' && c.value === '@self_handle_x'), JSON.stringify(candBoth));
	const candDup = W.extractAdFingerprintCandidates({ name: '收U代理', username: '@same_handle_z', bio: '联系 @same_handle_z', text: '' }, new Set());
	assert('B1 重复 username 去重后恰好一条', candDup.filter((c) => c.type === 'username').length === 1, JSON.stringify(candDup));

	// —— C1：回复学习词表不再裸子串误判 ——
	// 这些是旧词表（含单字「封」、子串 'ad'、'学习'）会误判成封禁指令的正常回复。
	assert('C1 「学习了」不触发', W.classifyAdReplyIntent('学习了') === '', W.classifyAdReplyIntent('学习了'));
	assert('C1 「学习一下」不触发', W.classifyAdReplyIntent('学习一下') === '');
	assert('C1 already done 不触发', W.classifyAdReplyIntent('already done') === '', W.classifyAdReplyIntent('already done'));
	assert('C1 「封面不错」不触发', W.classifyAdReplyIntent('封面不错') === '', W.classifyAdReplyIntent('封面不错'));
	assert('C1 「密封好了」不触发', W.classifyAdReplyIntent('密封好了') === '');
	assert('C1 download 不触发', W.classifyAdReplyIntent('download 完成') === '');
	assert('C1 bad road 不触发', W.classifyAdReplyIntent('bad road ahead') === '');
	assert('C1 admin 不触发', W.classifyAdReplyIntent('admin 已处理') === '');
	assert('C1 ready 不触发', W.classifyAdReplyIntent('ready') === '');
	// 真正的封禁意图仍要判为 positive。
	assert('C1 「这是广告」仍触发', W.classifyAdReplyIntent('这是广告') === 'positive');
	assert('C1 「封了他」触发', W.classifyAdReplyIntent('封了他') === 'positive');
	assert('C1 「该封他」触发', W.classifyAdReplyIntent('该封他') === 'positive');
	assert('C1 「广告号」触发', W.classifyAdReplyIntent('广告号') === 'positive');
	assert('C1 「垃圾广告」触发', W.classifyAdReplyIntent('垃圾广告') === 'positive');
	// 【2026-09-11 收紧为完整短语】线上事故：管理员回复一句含「广告」的吐槽，
	// 把得分 -1（远低于阈值 7）的人封了 14 个群 —— 确认分支强制 ban 不受阈值裁决。
	// 以下单词/半短语在日常中文对话里出现频率极高，一律不得再触发封禁。
	assert('C1 裸词「广告」不触发', W.classifyAdReplyIntent('广告') === '');
	assert('C1 「这广告真烦」不触发', W.classifyAdReplyIntent('这广告真烦') === '');
	assert('C1 裸词「垃圾」不触发', W.classifyAdReplyIntent('垃圾') === '');
	assert('C1 「这游戏真垃圾」不触发', W.classifyAdReplyIntent('这游戏真垃圾') === '');
	assert('C1 「垃圾消息」不再触发', W.classifyAdReplyIntent('垃圾消息') === '');
	assert('C1 半短语「该封」不触发', W.classifyAdReplyIntent('该封') === '');
	assert('C1 半短语「封禁吧」不触发', W.classifyAdReplyIntent('封禁吧') === '');
	// 【2026-09-10】裸 spam / spammer 不再触发：忘带 / 的误操作代价太大，/spam 斜杠命令不受影响。
	assert('C1 英文 spam 裸词不触发', W.classifyAdReplyIntent('this is spam') === '');
	assert('C1 spammer 裸词不触发', W.classifyAdReplyIntent('spammer') === '');
	// 否定词必须永远优先：这些短句都含新触发词的子串。
	assert('C1 「不要封」判为 negative', W.classifyAdReplyIntent('不要封') === 'negative');
	assert('C1 「不该封」判为 negative', W.classifyAdReplyIntent('不该封') === 'negative');
	assert('C1 「取消封禁」判为 negative', W.classifyAdReplyIntent('取消封禁') === 'negative');
	assert('C1 「不是垃圾」判为 negative', W.classifyAdReplyIntent('不是垃圾') === 'negative');
	assert('C1 「误封了」判为 negative', W.classifyAdReplyIntent('误封了') === 'negative');
	assert('C1 not spam 判为 negative', W.classifyAdReplyIntent('not spam') === 'negative', W.classifyAdReplyIntent('not spam'));
	assert('C1 超 20 字仍不触发', W.classifyAdReplyIntent('这条消息我看了半天觉得应该算是广告吧你怎么看') === '');
}

section('[13] 回复学习端到端（管理层回复即判定，误触发必须为零）');
{
	const env13 = makeEnv();
	await W.adDetectionReady(env13);

	// getChat 按 id 分流：只有 72002 / 72006 是广告资料，其余一律干净资料，
	// 避免非管理员场景下「发送者自己」被消息层判成广告，污染断言。
	const replyApi = {
		getChat: (body) => {
			const id = String(body?.chat_id);
			if (id === '72002' || id === '72006') {
				return { ok: true, result: { id, first_name: '💚高价收网赚号💚', bio: '长期收购网 du 商宝账号 USDT 日结', username: 'ad_reply_target' } };
			}
			return { ok: true, result: { id, first_name: '普通成员', bio: '' } };
		},
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: [] }),
		banChatMember: () => ({ ok: true, result: true }),
		unbanChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true })
	};

	function replyMsg(fromId, text, targetId, targetText = '长期收购网赚账号 USDT 日结 秒到') {
		return groupMessage({ id: fromId, first_name: fromId === OWNER_ID ? 'Owner' : '普通群友' }, text, {
			reply_to_message: {
				message_id: 555,
				date: Math.floor(Date.now() / 1000),
				chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
				from: { id: targetId, is_bot: false, first_name: '💚高价收网赚号💚', username: 'ad_reply_target' },
				text: targetText
			}
		});
	}

	const sendReply = async (fromId, text, targetId, targetText) => {
		resetCalls();
		setApi(replyApi);
		await sendUpdate({ message: replyMsg(fromId, text, targetId, targetText) }, env13);
		return allSentText();
	};

	// 场景 1：管理层回复「这是广告」→ 强制判定为广告并走完整处置链。
	const p1 = await sendReply(OWNER_ID, '这是广告', 72002);
	assert('回复学习 positive：被举报者入黑名单', env13.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '72002'")[0].c === 1, JSON.stringify(env13.DB.query('SELECT id FROM blacklist')));
	assert('回复学习 positive：执行了全群封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('回复学习 positive：删了被举报消息与操作消息', countCalls('deleteMessage') >= 2, JSON.stringify(calls.map((c) => c.method)));
	assert('回复学习 positive：学入了指纹', env13.DB.query('SELECT COUNT(*) AS c FROM ad_fingerprints')[0].c > 0);
	assert('回复学习 positive：指纹记为 manual', env13.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'manual'")[0].c > 0, JSON.stringify(env13.DB.query('SELECT value, source FROM ad_fingerprints')));
	assert('回复学习 positive：追加了 reply 来源语义样本', env13.DB.query("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE source = 'reply'")[0].c === 1, JSON.stringify(env13.DB.query("SELECT source FROM ad_sample_embeddings WHERE source != 'seed'")));
	assert('回复学习 positive：群内有处置回执', p1.includes('已按广告处置 72002'), p1);
	// 处置回执必须是「闪屏」：sendFlashMessage 靠 ctx.waitUntil 注册延时撤回，
	// 调用方给 ctx 传 null 时撤回逻辑根本不会注册，回执会永久留在群里
	// （内含被处置者 TGID 与内部指纹计数，不该长期公开展示）。这里断言后台任务确实被注册。
	assert('回复学习 positive：回执注册了延时撤回任务', pendingWaits.length >= 1, '待执行后台任务数 ' + pendingWaits.length);
	const deleteBeforeFlush = countCalls('deleteMessage');
	await flushWaits();
	assert('回复学习 positive：回执被自动撤回', countCalls('deleteMessage') > deleteBeforeFlush, '撤回前 ' + deleteBeforeFlush + ' 次，撤回后 ' + countCalls('deleteMessage') + ' 次');

	// 闪屏时长可配置：硬编码默认 5000ms，环境变量 FLASH_MESSAGE_TTL_MS 可覆盖。
	// 校验规则与其它数值型配置一致 —— 空串/非整数/超范围一律回落默认值，
	// 特殊点是允许 0（表示永不撤回），所以下界必须是 >= 0 而不是 > 0。
	assert('闪屏时长：硬编码默认 5000ms', W.loadRequiredConfig(makeEnv()).FLASH_MESSAGE_TTL_MS === 5000, String(W.loadRequiredConfig(makeEnv()).FLASH_MESSAGE_TTL_MS));
	assert('闪屏时长：环境变量可覆盖', W.loadRequiredConfig(makeEnv({ FLASH_MESSAGE_TTL_MS: '12000' })).FLASH_MESSAGE_TTL_MS === 12000);
	assert('闪屏时长：允许 0 表示永不撤回', W.loadRequiredConfig(makeEnv({ FLASH_MESSAGE_TTL_MS: '0' })).FLASH_MESSAGE_TTL_MS === 0);
	assert('闪屏时长：空串回落默认值', W.loadRequiredConfig(makeEnv({ FLASH_MESSAGE_TTL_MS: '' })).FLASH_MESSAGE_TTL_MS === 5000);
	assert('闪屏时长：非数字回落默认值', W.loadRequiredConfig(makeEnv({ FLASH_MESSAGE_TTL_MS: 'abc' })).FLASH_MESSAGE_TTL_MS === 5000);
	assert('闪屏时长：负数回落默认值', W.loadRequiredConfig(makeEnv({ FLASH_MESSAGE_TTL_MS: '-1' })).FLASH_MESSAGE_TTL_MS === 5000);
	assert('闪屏时长：超上限回落默认值', W.loadRequiredConfig(makeEnv({ FLASH_MESSAGE_TTL_MS: '60001' })).FLASH_MESSAGE_TTL_MS === 5000);
	assert('闪屏时长：上限 60000 有效', W.loadRequiredConfig(makeEnv({ FLASH_MESSAGE_TTL_MS: '60000' })).FLASH_MESSAGE_TTL_MS === 60000);
	// ttl 为 0 时不能注册撤回任务，否则等于立即删掉刚发出的提示。
	resetWaits();
	await W.sendFlashMessage(GROUP_ID, '零时长提示', { waitUntil(p) { pendingWaits.push(Promise.resolve(p).catch(() => {})); } }, 0);
	assert('闪屏时长：ttl=0 不注册撤回任务', pendingWaits.length === 0, '注册了 ' + pendingWaits.length + ' 个任务');

	// 场景 2：同一管理层回复「不是广告」→ 纠错回滚，解黑 + 全群解封。
	const p2 = await sendReply(OWNER_ID, '不是广告', 72002);
	assert('回复学习 negative：已移出黑名单', env13.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '72002'")[0].c === 0, JSON.stringify(env13.DB.query('SELECT id FROM blacklist')));
	assert('回复学习 negative：执行了解封', countCalls('unbanChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('回复学习 negative：未再次封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('回复学习 negative：给命中指纹记了误判', env13.DB.query('SELECT COUNT(*) AS c FROM ad_fingerprints WHERE false_positive_count > 0')[0].c > 0, JSON.stringify(env13.DB.query('SELECT value, false_positive_count FROM ad_fingerprints')));
	assert('回复学习 negative：群内有回滚回执', p2.length > 0, p2);

	// 场景 3：旧词表会误封的正常回复，现在必须一条都不处置。
	for (const [text, label] of [['学习了', '学习了'], ['already done', 'already done'], ['封面不错', '封面不错'], ['download 完成', 'download 完成'], ['admin 已看', 'admin 已看']]) {
		await sendReply(OWNER_ID, text, 72003, '大家早上好');
		assert('回复学习不误触发：' + label + ' 不封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
		assert('回复学习不误触发：' + label + ' 不入黑名单', env13.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '72003'")[0].c === 0);
	}

	// 场景 4：非管理层说「封了他」不生效，避免普通成员借回复越权处置。
	await sendReply(72004, '封了他', 72005, '大家早上好');
	assert('回复学习：非管理层无权处置', env13.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '72005'")[0].c === 0, JSON.stringify(env13.DB.query('SELECT id FROM blacklist')));
	assert('回复学习：非管理层不触发封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));

	// 场景 5：目标是管理层时必须拒绝，且给出明确提示。
	const p5 = await sendReply(OWNER_ID, '这是广告', OWNER_ID, '长期收购网赚账号 USDT');
	assert('回复学习：目标是管理层时被拒', p5.includes('目标是管理层'), p5);
	assert('回复学习：管理层目标未入黑名单', env13.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '" + OWNER_ID + "'")[0].c === 0);
	assert('回复学习：管理层目标未被封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));

	// 场景 6：超 20 字的长评论不进回复学习，交回原流程。
	await sendReply(OWNER_ID, '这条消息我看了半天觉得应该算是广告吧你怎么看', 72006);
	assert('回复学习：超 20 字不触发处置', env13.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '72006'")[0].c === 0, JSON.stringify(env13.DB.query('SELECT id FROM blacklist')));

	// 场景 7：普通成员发申诉句（含「广告」「解封」这些词）绝不能被任何一层判成广告。
	// 这类文本命中的是否定词表，而否定分支要求操作者是管理层，所以普通成员发出后一路放行到
	// 消息层，由零成本预筛判定通过。这是「解封正常用户会不会反被封禁」的直接回归点。
	resetCalls();
	setApi(replyApi);
	await sendUpdate({ message: groupMessage({ id: 72007, first_name: '申诉用户' }, '我不是广告，请帮我解封') }, env13);
	assert('申诉句：普通成员不被封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('申诉句：普通成员未入黑名单', env13.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '72007'")[0].c === 0, JSON.stringify(env13.DB.query('SELECT id FROM blacklist')));
	assert('申诉句：普通成员未进观察窗口', env13.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '72007'")[0].c === 0);

	// 管理层用同样的话回复某人时走否定分支：只解封，绝不封禁。
	await sendReply(OWNER_ID, '不是广告，解封', 72008, '大家早上好');
	assert('申诉句：管理层回复时不封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('申诉句：管理层回复时目标未入黑名单', env13.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '72008'")[0].c === 0);
	assert('申诉句：管理层回复时执行的是解封', countCalls('unbanChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
}

section('[14] 两道闸真实场景回归（用线上真实指纹与漏放案例）');
{
	// 本段来源：线上 /words 输出的 5 条真实指纹 + 两个实测漏放案例。
	// 目的是钉死「入群」与「发言」两道闸的端到端有效性 —— 这是整个广告检测的价值所在，
	// 任何改动导致其中一道失效都必须立刻暴露。
	//
	// ⚠️ 写法要求：必须先 resetCalls() 再 setApi()。resetCalls 内部会调 setApi() 清空 mock，
	// 顺序写反会让 bot 拿到空资料，判定结果与预期完全不同（本段就曾因此误判为「产品失效」）。
	const REAL_BIO = 'https://t.me/+vpjO116iE1syNTg1 加群看项目 一天赚8千!';
	const REAL_USERNAME = '@uHlenkWyTPXTSGrwarGL';

	const adProfileApi = (profile) => ({
		getChat: (b) => ({ ok: true, result: { id: b?.chat_id, ...profile } }),
		getChatMember: (b) => ({ ok: true, result: { status: 'member', user: { id: b?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: [] }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true })
	});

	// ---------- 第一道闸：入群检测 ----------
	const envJoin = makeEnv();
	await W.adDetectionReady(envJoin);
	await W.addAdFingerprint(envJoin, REAL_BIO, { type: 'bio', createdBy: String(OWNER_ID) });
	// 【方案 A】username 型指纹已下线：addAdFingerprint 显式传 type='username' 会被拒，
	// 且 matchAdFingerprints 的 haystack 已不含 payload.username。
	// 这里仍以 keyword 型写入该 @handle，用来验证下面那条【翻转后的】断言 ——
	// 即使库里存在这条指纹，仅出现在 username 字段的 @handle 也不再命中、不再封人。
	await W.addAdFingerprint(envJoin, REAL_USERNAME, { type: 'keyword', createdBy: String(OWNER_ID) });

	resetCalls();
	setApi(adProfileApi({ first_name: '项目对接', bio: REAL_BIO }));
	await sendUpdate({ message: joinMessage([{ id: 80001, first_name: '项目对接' }]) }, envJoin);
	assert('第一道闸：bio 命中指纹的号进群即加黑', envJoin.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '80001'")[0].c === 1, JSON.stringify(envJoin.DB.query('SELECT id FROM blacklist')));
	assert('第一道闸：bio 命中后执行全群封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('第一道闸：bio 命中生成待确认快照', envJoin.DB.query("SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE user_id = '80001'")[0].c === 1);

	resetCalls();
	setApi(adProfileApi({ first_name: '推广', username: 'uHlenkWyTPXTSGrwarGL', bio: '' }));
	await sendUpdate({ message: joinMessage([{ id: 80002, first_name: '推广', username: 'uHlenkWyTPXTSGrwarGL' }]) }, envJoin);
	// 【2026-09-10 方案 A：断言翻转】原来断言「username 命中指纹的号进群即加黑」。
	// 现在 haystack 只含昵称 + 简介 + 正文，用户名不参与匹配 ——
	// 这个号昵称「推广」不足以定罪、简介为空，唯一「证据」是 username 命中，
	// 因此必须放行。这正是主人的口径：用户名很难检测出东西，只会造成误封。
	assert('第一道闸：仅 username 命中不再加黑', envJoin.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '80002'")[0].c === 0, JSON.stringify(envJoin.DB.query('SELECT id FROM blacklist')));
	assert('第一道闸：仅 username 命中不再全群封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));

	// 原「线上漏放案例 1」：这份资料最早只得 4 分被直接放行，加协同分后 6 分进观察窗口。
	// 2026-09-07 通道 card（用户名 + 简介）上线后再次翻转成【进群即封】——
	//   昵称「高价收网赚号」：招揽意图「高价收」∧ 行业指向「网赚」
	//   bio「长期收购网 du 商宝账号，老账号优先加价」：招揽「长期收购」∧ 行业「du 商 / 老账号」
	// 形态 A 成立 → 资料卡本身就是广告牌，与他之后发什么无关，进群那一刻就地正法。
	// 断言按新行为改写：这是真广告，旧行为放他进群再观察正是要治的漏放。
	resetCalls();
	setApi(adProfileApi({ first_name: '高价收网赚号', bio: '长期收购网 du 商宝账号，老账号优先加价' }));
	await sendUpdate({ message: joinMessage([{ id: 80003, first_name: '高价收网赚号' }]) }, envJoin);
	assert('第一道闸：资料卡查杀让漏放案例进群即加黑', envJoin.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '80003'")[0].c === 1, JSON.stringify(envJoin.DB.query('SELECT id FROM blacklist')));
	assert('第一道闸：资料卡查杀执行全群封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('第一道闸：资料卡查杀不留观察窗口', envJoin.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '80003'")[0].c === 0, JSON.stringify(envJoin.DB.query('SELECT user_id, score FROM ad_user_screening')));
	assert('第一道闸：资料卡查杀生成待确认快照', envJoin.DB.query("SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE user_id = '80003'")[0].c === 1);

	resetCalls();
	setApi(adProfileApi({ first_name: '张伟', bio: '前端开发，喜欢摄影' }));
	await sendUpdate({ message: joinMessage([{ id: 80004, first_name: '张伟' }]) }, envJoin);
	assert('第一道闸：正常用户进群不加黑', envJoin.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '80004'")[0].c === 0);
	assert('第一道闸：正常用户进群不封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('第一道闸：正常用户不进观察窗口', envJoin.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '80004'")[0].c === 0);

	// ---------- 第二道闸：发言检测 ----------
	const envMsg = makeEnv();
	await W.adDetectionReady(envMsg);

	// 原「线上漏放案例 2」：这条正文最早只得 4 分被放行，协同分后 6 分进观察窗口。
	// 2026-09-07 通道 body（bio + 本条正文）上线后翻转成【首条即封】：
	//   招揽意图「高价收 / 长期收购」∧ 行业指向「网赚 / USDT」→ 形态 A 成立
	// 断言按新行为改写。旧行为要等他在窗口内发第二条才动手，第一条广告已经发出去了。
	resetCalls();
	setApi(adProfileApi({ first_name: '小李', bio: '' }));
	await sendUpdate({ message: groupMessage({ id: 80011, first_name: '小李' }, '高价收网赚账号 长期收购 USDT 日结秒到 需要的私我') }, envMsg);
	assert('第二道闸：正文查杀让漏放正文首条即加黑', envMsg.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '80011'")[0].c === 1, JSON.stringify(envMsg.DB.query('SELECT id FROM blacklist')));
	assert('第二道闸：正文查杀首条即执行全群封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('第二道闸：正文查杀不留观察窗口', envMsg.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '80011'")[0].c === 0, JSON.stringify(envMsg.DB.query('SELECT user_id, score FROM ad_user_screening')));

	// 已在黑名单的号再发广告：不重复加黑、消息照删。原用例考察「窗口内二次累加过线」，
	// 首条即封后该语义已由上面几项覆盖，这里改为钉死【重复命中不产生脏数据】。
	resetCalls();
	setApi(adProfileApi({ first_name: '小李', bio: '' }));
	await sendUpdate({ message: groupMessage({ id: 80011, first_name: '小李' }, '收U代理日结 长期收购账号 USDT 秒到') }, envMsg);
	assert('第二道闸：已加黑的号不重复入库', envMsg.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '80011'")[0].c === 1, JSON.stringify(envMsg.DB.query('SELECT id FROM blacklist')));
	assert('第二道闸：已加黑的号再发广告仍删消息', countCalls('deleteMessage') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('第二道闸：封禁后不留观察窗口', envMsg.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '80011'")[0].c === 0);

	// 线上真实的正常聊天：会拉资料，但资料干净 -> 不加黑、不进观察窗口。
	resetCalls();
	setApi(adProfileApi({ first_name: '小王', bio: '' }));
	await sendUpdate({ message: groupMessage({ id: 80012, first_name: '小王' }, '百度做网站的大佬有没') }, envMsg);
	assert('第二道闸：正常聊天不加黑', envMsg.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '80012'")[0].c === 0);
	assert('第二道闸：正常聊天拉了资料仍放行', countCalls('getChat') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('第二道闸：正常聊天不进观察窗口', envMsg.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '80012'")[0].c === 0);

	// 分享 Telegram 链接不该被当广告封禁 —— t.me 曾被误学成 weight=1 指纹并命中 10 次
	resetCalls();
	setApi(adProfileApi({ first_name: '技术群友', bio: '' }));
	await sendUpdate({ message: groupMessage({ id: 80014, first_name: '技术群友' }, '这个频道不错 https://t.me/durov 推荐看看') }, envMsg);
	assert('第二道闸：分享 t.me 链接不被封禁', envMsg.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '80014'")[0].c === 0, JSON.stringify(envMsg.DB.query('SELECT id FROM blacklist')));
	assert('第二道闸：分享 t.me 链接不调封禁接口', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('第二道闸：t.me 未被学成指纹', envMsg.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE type = 'domain' AND value = 't.me'")[0].c === 0, JSON.stringify(envMsg.DB.query("SELECT type, value FROM ad_fingerprints WHERE type = 'domain'")));

	// 管理层豁免：同样的广告文案不得处置
	resetCalls();
	setApi(adProfileApi({ first_name: 'Owner', bio: '' }));
	await sendUpdate({ message: groupMessage({ id: OWNER_ID, first_name: 'Owner' }, '高价收网赚账号 长期收购 USDT 日结秒到') }, envMsg);
	assert('第二道闸：管理层发广告文案不加黑', envMsg.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '" + OWNER_ID + "'")[0].c === 0);
	assert('第二道闸：管理层发广告文案不封禁', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
}

section('[15] 方案 6 · 三道闸的 bio 检测（双轨：首发查 bio + 定时滚动复查）');
{
	// 本段钉死方案 6 的三条判定路径，每一条都对应一类曾经实际漏掉或误伤的号：
	//   闸一（0 请求）：昵称/用户名/正文/转发里就有广告 —— 实测 9 个真广告里 7 个属此类。
	//   闸二（1 请求）：广告【只写在 bio 里】，但人会发言 —— 例如「小李 / 在吗」。
	//   闸三（cron）：先用干净资料过检、事后改 bio 且不再发言 —— 消息路径永远碰不到他。
	// 同时钉死成本：稳态下正常聊天必须是 0 个 Telegram 请求，否则方案 6 就白做了。
	const api = (profile, admins = []) => ({
		getChat: (b) => ({ ok: true, result: { id: b?.chat_id, ...profile } }),
		getChatMember: (b) => ({ ok: true, result: { status: 'member', user: { id: b?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: admins })
	});

	// ---- 闸一：昵称即广告，零请求定罪 ----
	const envG1 = makeEnv();
	resetCalls();
	setApi(api({ first_name: '💚高价收网赚号💚', bio: '长期收购网 du 商宝账号' }));
	await sendUpdate({ message: groupMessage({ id: 90001, first_name: '💚高价收网赚号💚' }, '收U秒结 私聊我') }, envG1);
	assert('闸一：昵称即广告直接封禁', envG1.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '90001'")[0].c === 1, JSON.stringify(envG1.DB.query('SELECT id FROM blacklist')));
	assert('闸一：定罪时不花 getChat', countCalls('getChat') === 0, JSON.stringify(calls.map((c) => c.method)));
	// 判定阶段确实一个 Telegram 请求都没花。此处出现的 getChatMember 来自
	// banUserFromAllGroups({ probeMembership: true }) 的封禁前预检
	// （_worker.js: probeTargetMemberBeforeBan）—— 那是【处置成本】，
	// 只在确实要封人时才发生，与「每条消息的检测成本」是两件事，不该混算。
	// 检测侧的零成本由下面「冷却期内后续消息零 getChatMember」那条断言保证。
	// 恰好 1 次：本测试只配了一个群（GROUP_ID），预检是逐群串行的。
	assert('闸一：定罪前不花 getChatMember（出现的是封禁预检）', countCalls('getChatMember') === 1, JSON.stringify(calls.map((c) => c.method)));

	// ---- 闸二：昵称干净、正文干净，广告只在 bio 里 ----
	// 这是方案 6 存在的核心理由。「小李」+「在吗」的零成本信号全是 0 分，
	// 闸一必然放行；唯一的判据在 bio 里，只能靠 getChat 拿到。
	const envG2 = makeEnv();
	resetCalls();
	setApi(api({ first_name: '小李', bio: '长期收购微信老号 支付宝实名号 高价收 秒结 私聊' }));
	await sendUpdate({ message: groupMessage({ id: 90002, first_name: '小李' }, '在吗') }, envG2);
	assert('闸二：广告只在 bio 里也能封禁', envG2.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '90002'")[0].c === 1, JSON.stringify(envG2.DB.query('SELECT id FROM blacklist')));
	assert('闸二：首次发言查了一次 bio', countCalls('getChat') === 1, JSON.stringify(calls.map((c) => c.method)));

	// ---- 闸二冷却：同一人 3 天内不再查 bio ----
	// 「不要每条信息都拉」的落点。第一条查过之后，名册里记下 bio_checked_at，
	// 后续消息全部走闸一即止，0 个 Telegram 请求。
	const envG3 = makeEnv();
	resetCalls();
	setApi(api({ first_name: '张三', bio: '' }));
	await sendUpdate({ message: groupMessage({ id: 90003, first_name: '张三' }, '今天天气不错') }, envG3);
	const firstRoundGetChat = countCalls('getChat');
	resetCalls();
	setApi(api({ first_name: '张三', bio: '' }));
	await sendUpdate({ message: groupMessage({ id: 90003, first_name: '张三' }, '中午吃什么') }, envG3);
	await sendUpdate({ message: groupMessage({ id: 90003, first_name: '张三' }, '一起去食堂') }, envG3);
	assert('闸二：首条消息查一次 bio', firstRoundGetChat === 1, String(firstRoundGetChat));
	assert('闸二：冷却期内后续消息零 getChat', countCalls('getChat') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('闸二：冷却期内后续消息零 getChatMember', countCalls('getChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('闸二：管理员列表按群缓存，3 条消息只查一次', countCalls('getChatAdministrators') <= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('闸二：正常用户全程未被封禁', envG3.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '90003'")[0].c === 0);

	// ---- 名册：发言者被记录，且 bio_checked_at 被更新 ----
	const roster = envG3.DB.query("SELECT user_id, chat_id, bio_checked_at FROM ad_group_members WHERE user_id = '90003'");
	assert('名册：发言者被写入 ad_group_members', roster.length === 1, JSON.stringify(roster));
	assert('名册：记录了最近发言的群', roster[0]?.chat_id === String(GROUP_ID), JSON.stringify(roster));
	assert('名册：bio_checked_at 已被标记', Number(roster[0]?.bio_checked_at) > 0, JSON.stringify(roster));

	// ---- 名册：管理员不进名册（不占扫描配额）----
	const envG4 = makeEnv();
	resetCalls();
	setApi(api({ first_name: '群管', bio: '' }, [{ user: { id: 90004, is_bot: false }, status: 'administrator' }]));
	await sendUpdate({ message: groupMessage({ id: 90004, first_name: '群管' }, '大家注意最近的广告号') }, envG4);
	assert('名册：管理员不写入名册', envG4.DB.query("SELECT COUNT(*) AS c FROM ad_group_members WHERE user_id = '90004'")[0].c === 0);
	assert('名册：管理员豁免时不查 bio', countCalls('getChat') === 0, JSON.stringify(calls.map((c) => c.method)));

	// ---- 管理员缓存的事件驱动失效 ----
	// 【这条断言对应一个真实缺口】：管理员列表缓存 5 分钟，若不在 chat_member
	// 事件里主动清掉，刚被提为管理员的人会在 5 分钟内失去豁免 ——
	// 而管理员恰恰最可能在群里转发广告样本做说明，那种消息评分很高，会被自己的 bot 封掉。
	const envG5 = makeEnv();
	resetCalls();
	// 先让缓存里存下「本群没有管理员」
	setApi(api({ first_name: '新管理', bio: '' }, []));
	await sendUpdate({ message: groupMessage({ id: 90005, first_name: '新管理' }, '你好') }, envG5);
	const beforePromote = countCalls('getChatAdministrators');
	// 收到提为管理员的事件 → 缓存应被清掉
	await sendUpdate({
		chat_member: {
			chat: { id: GROUP_ID, title: '测试群', type: 'supergroup' },
			from: { id: OWNER_ID, is_bot: false, first_name: 'Owner' },
			date: Math.floor(Date.now() / 1000),
			old_chat_member: { user: { id: 90005, is_bot: false, first_name: '新管理' }, status: 'member' },
			new_chat_member: { user: { id: 90005, is_bot: false, first_name: '新管理' }, status: 'administrator' }
		}
	}, envG5);
	calls.length = 0;
	setApi(api({ first_name: '新管理', bio: '' }, [{ user: { id: 90005, is_bot: false }, status: 'administrator' }]));
	await sendUpdate({ message: groupMessage({ id: 90005, first_name: '新管理' }, '高价收网赚账号 长期收购 USDT 日结秒到') }, envG5);
	assert('管理员缓存：首条消息查过一次列表', beforePromote === 1, String(beforePromote));
	assert('管理员缓存：提为管理员后缓存失效，重新查列表', countCalls('getChatAdministrators') === 1, JSON.stringify(calls.map((c) => c.method)));
	assert('管理员缓存：新任管理员发广告文案不被封禁', envG5.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '90005'")[0].c === 0, JSON.stringify(envG5.DB.query('SELECT id FROM blacklist')));

	// ---- 闸三：先干净过检、事后改 bio 且不再发言 ----
	// 这是闸一闸二都抓不到的那一类。流程：
	//   1) 用干净 bio 发一句正常话 → 进名册、bio_checked_at 记为「刚查过」
	//   2) 把 bio 改成广告（模拟改简介），此后不再发言
	//   3) 把 bio_checked_at 手工推回 4 天前（模拟时间流逝到超过 3 天冷却）
	//   4) 触发 cron → 必须查出来并封禁
	const envG6 = makeEnv();
	resetCalls();
	setApi(api({ first_name: '王五', bio: '爱好摄影' }));
	await sendUpdate({ message: groupMessage({ id: 90006, first_name: '王五' }, '请问有人用过这个库吗') }, envG6);
	assert('闸三前置：干净用户发言后未被封禁', envG6.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '90006'")[0].c === 0);
	assert('闸三前置：干净用户已进名册', envG6.DB.query("SELECT COUNT(*) AS c FROM ad_group_members WHERE user_id = '90006'")[0].c === 1);

	// 时间前推 4 天：超过 AD_BIO_RECHECK_DAYS = 3，进入待复查队列。
	// 直接改 D1 而不是等真实时间，是唯一可行的做法 —— 冷却是 3 天。
	const staleAt = Math.floor(Date.now() / 1000) - 4 * 24 * 3600;
	envG6.DB.exec("UPDATE ad_group_members SET bio_checked_at = " + staleAt + " WHERE user_id = '90006'");
	resetCalls();
	// bio 已被本人改成广告；同时清掉 getChat 的 5 分钟进程内缓存，否则拿到的是旧 bio
	W.invalidateAdProfileCache();
	setApi(api({ first_name: '王五', bio: '长期收购微信老号 支付宝实名号 高价收 秒结 私聊' }));
	const scanResult = await W.runAdBioRescan(envG6, { dailyLimit: 10, batchSize: 5, intervalMs: 0 });
	assert('闸三：扫描确实复查了该用户', scanResult.scanned >= 1, JSON.stringify(scanResult));
	assert('闸三：改 bio 后被扫描抓到并封禁', envG6.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '90006'")[0].c === 1, JSON.stringify(envG6.DB.query('SELECT id FROM blacklist')));
	assert('闸三：扫描执行了全群封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('闸三：扫描后 bio_checked_at 被推到当前', Number(envG6.DB.query("SELECT bio_checked_at FROM ad_group_members WHERE user_id = '90006'")[0]?.bio_checked_at) > staleAt);

	// ---- 闸三：冷却期内的人不被重复扫描 ----
	// bio_checked_at 刚被推到现在，队列里应当没人可取 —— 这就是「游标」的自平衡性质：
	// 查过即排到队尾，不需要显式偏移量，也不会重复消耗配额。
	resetCalls();
	const scanAgain = await W.runAdBioRescan(envG6, { dailyLimit: 10, batchSize: 5, intervalMs: 0 });
	assert('闸三：冷却期内无人可扫，不空转', scanAgain.scanned === 0, JSON.stringify(scanAgain));
	assert('闸三：无人可扫时不花 getChat', countCalls('getChat') === 0, JSON.stringify(calls.map((c) => c.method)));

	// ---- 闸三：已在黑名单的人不再浪费配额 ----
	const envG7 = makeEnv();
	resetCalls();
	setApi(api({ first_name: '李四', bio: '' }));
	await sendUpdate({ message: groupMessage({ id: 90007, first_name: '李四' }, '大家好') }, envG7);
	envG7.DB.exec("UPDATE ad_group_members SET bio_checked_at = " + staleAt + " WHERE user_id = '90007'");
	envG7.DB.exec("INSERT INTO blacklist (id, reason, by_user, at, note) VALUES ('90007', '测试', '" + OWNER_ID + "', '2026-01-01T00:00:00.000Z', '')");
	resetCalls();
	W.invalidateAdProfileCache();
	setApi(api({ first_name: '李四', bio: '高价收U 长期收购' }));
	const scanBlack = await W.runAdBioRescan(envG7, { dailyLimit: 10, batchSize: 5, intervalMs: 0 });
	assert('闸三：黑名单用户被排除在扫描之外', scanBlack.scanned === 0, JSON.stringify(scanBlack));
	assert('闸三：黑名单用户不花 getChat', countCalls('getChat') === 0, JSON.stringify(calls.map((c) => c.method)));

	// ---- 闸三：当日配额上限 ----
	// 配额是为了不撞 Telegram 的 429。跨天由 UTC 日期戳重置，同一天内多次 cron 累计不超。
	const envG8 = makeEnv();
	await W.adDetectionReady(envG8);
	const longAgo = Math.floor(Date.now() / 1000) - 10 * 24 * 3600;
	for (let i = 0; i < 6; i += 1) {
		envG8.DB.exec("INSERT INTO ad_group_members (user_id, chat_id, first_name, last_name, username, first_seen, last_seen, bio_checked_at) VALUES ('9100" + i + "', '" + GROUP_ID + "', '路人" + i + "', '', '', " + longAgo + ", " + longAgo + ", " + longAgo + ")");
	}
	resetCalls();
	W.invalidateAdProfileCache();
	setApi(api({ first_name: '路人', bio: '' }));
	const capped = await W.runAdBioRescan(envG8, { dailyLimit: 4, batchSize: 2, intervalMs: 0 });
	assert('闸三：不超过当日配额', capped.scanned === 4, JSON.stringify(capped));
	assert('闸三：按 batchSize 分批', capped.batches === 2, JSON.stringify(capped));
	assert('闸三：配额用尽后再次触发不再扫描', (await W.runAdBioRescan(envG8, { dailyLimit: 4, batchSize: 2, intervalMs: 0 })).skipped === 'daily_limit_reached');

	// ---- 未查 bio 时不得施加「无 Bio」减分 ----
	// 「没查」和「没有」在 profile.bio 上都是空串，但意义相反。
	// 拿「没查」当「没有」减分会把真广告的分数压下去 —— 实测能把 2 分的样本压到 1 分。
	const noBioSkip = W.scoreAdProfile({ firstName: '收U秒结', bio: '' }, { skipMissingBioPenalty: true });
	const noBioKeep = W.scoreAdProfile({ firstName: '收U秒结', bio: '' });
	assert('未查 bio：跳过「无 Bio」减分', !noBioSkip.reasons.some((r) => r.includes('无 Bio')), JSON.stringify(noBioSkip.reasons));
	assert('查过 bio 且为空：正常施加减分', noBioKeep.reasons.some((r) => r.includes('无 Bio')), JSON.stringify(noBioKeep.reasons));
	assert('未查 bio 时分数不被压低', noBioSkip.score === noBioKeep.score + 1, JSON.stringify({ skip: noBioSkip.score, keep: noBioKeep.score }));

	// ===== 2026-09-07 第三次漏放事故回归：双通道结构查杀 =====
	// 事故号「♻网赌账号回收h🀄」/ bio「6大量收网赌亏损号输钱号 联系 @sx8888888sx
	// 双向联系 @s88888888x_bot 权威」在纯评分下只有 2 分（5 分被豁免词「双向/bot」扣掉 3），
	// 封禁线 7 → 放行。此前「佳佳（邪恶姐姐）」（bio 列 3 个同前缀引流账号、零广告词）
	// 也是同一机制漏放。两个号词汇毫无交集，结构一模一样。

	// ---- 通道 1 · 资料卡查杀（username + bio，与正文无关）----
	const cardCases = [
		// [标签, 昵称, username, bio, 期望]
		['图28 网赌回收号', '♻网赌账号回收h🀄', '@w743flrute', '6大量收网赌亏损号输钱号 联系 @sx8888888sx 双向联系 @s88888888x_bot 权威', true],
		['佳佳引流矩阵', '佳佳（邪恶姐姐）', '@jiajia', '频道：@jiajia33998 双向机器人：@jiajia3369bot 约课号：@jiajia3399', true],
		['大量收U秒结', '收U', '@abc123def', '大量收U 秒结 @abc123def', true],
		['长期收购网赚老号', '小李', '@xiaoli', '长期收购网赚老账号，价格好商量 @buyer_x', true],
		['出租实名号', '租号', '@zuhao', '出租实名号 日结 @zu_kefu', true],
		['高价回收（插字绕过固定短语）', '回收', '@huishou', '高价回收网赌输钱号 @hs_kf', true],
		['@MiLov1900 误封回归', 'Lov1900', '@MiLov1900', '私信请走频道https://t.me/joeychat001', false],
		['技术群双向bot', '老王', '@laowang', '搞代理的，双向机器人 @mybot 有需要私聊', false],
		['正常人工作联系', '张三', '@zhangsan', '工作联系 @zhangsan_work', false],
		['正常人开源项目', 'Dev', '@devguy', '开源项目 https://github.com/x/y 欢迎 PR', false],
		['正常人大量收集数据', '研究员', '@researcher', '大量收集网络数据做研究，联系 @lab_contact', false],
		['正常人聊币行情', '币友', '@coinfan', '长期关注 USDT 行情，私聊交流 @coinfan2', false],
		['正常人主号备用号', '小陈', '@chen', '主号 @chen_main 备用 @backup_9527', false],
		['正常人收藏出闲置', '二手', '@ershou', '喜欢收藏老相机，偶尔出闲置 @ershou_shop', false],
		['正常人空bio', '某人', '@someone', '', false]
	];
	for (const [label, name, username, bio, expect] of cardCases) {
		const r = W.judgeAdProfileCard({ name, username, bio, text: '' });
		assert('资料卡查杀：' + label + (expect ? ' 应定罪' : ' 应放行'),
			r.guilty === expect, JSON.stringify({ guilty: r.guilty, form: r.form, reasons: r.reasons }));
	}

	// ---- 通道 2 · 正文查杀（bio + 正文合并，两边各半条线索时收网）----
	const bodyCases = [
		['干净bio+广告正文', '@user1', '你好，新来的', '长期收购网赚账号 USDT，进群联系 @promo_seller_x', true],
		['半线索bio+半线索正文', '@user3', '收U', '有 USDT 现汇的老板私我', true],
		['广告bio+闲聊正文', '@w743flrute', '6大量收网赌亏损号输钱号 联系 @sx8888888sx 双向联系 @s88888888x_bot 权威', '在吗', true],
		['干净bio+闲聊正文', '@user2', '你好，新来的', '大家好啊 今天天气不错', false],
		['技术群回收老硬盘', '@laowang', '搞代理的', '我这台机器回收了老硬盘 分红给你算了', false],
		['技术群聊菠菜防护', '@devops', '运维', '这客户是菠菜站，我们只做防护不碰业务', false],
		['误封回归正常发言', '@MiLov1900', '私信请走频道https://t.me/joeychat001', '要beta版才能用 那要等了', false]
	];
	for (const [label, username, bio, text, expect] of bodyCases) {
		const r = W.judgeAdBodyWithBio({ name: '', username, bio, text });
		assert('正文查杀：' + label + (expect ? ' 应定罪' : ' 应放行'),
			r.guilty === expect, JSON.stringify({ guilty: r.guilty, form: r.form, reasons: r.reasons }));
	}
	// 正文为空时通道 2 必须整体跳过 —— 那种情形归通道 1 管，重复判定会让 layer 标错。
	assert('正文查杀：正文为空时跳过',
		W.judgeAdBodyWithBio({ username: '@x', bio: '大量收网赌输钱号', text: '' }).guilty === false);

	// ---- 通道 3 · 引用体查杀（2026-09-08 新增，抓「自己不说话、只引用一条广告」）----
	// 先验字段提取：Telegram 把「引用别人消息」分散在三处，客户端渲染完全相同，
	// 从截图分不出是哪个，所以三个字段必须全读，缺一个就漏一整类形态。
	const QUOTED_AD = '操逼赚钱，招探花9000一单，提供设备';
	assert('引用体提取：quote 片段', W.getAdQuotedText({ quote: { text: QUOTED_AD } }) === QUOTED_AD);
	assert('引用体提取：external_reply.text', W.getAdQuotedText({ external_reply: { text: QUOTED_AD } }) === QUOTED_AD);
	assert('引用体提取：external_reply.caption', W.getAdQuotedText({ external_reply: { caption: QUOTED_AD } }) === QUOTED_AD);
	assert('引用体提取：external_reply 内层 quote',
		W.getAdQuotedText({ external_reply: { quote: { text: QUOTED_AD } } }) === QUOTED_AD);
	assert('引用体提取：reply_to_message.text', W.getAdQuotedText({ reply_to_message: { text: QUOTED_AD } }) === QUOTED_AD);
	assert('引用体提取：reply_to_message.caption', W.getAdQuotedText({ reply_to_message: { caption: QUOTED_AD } }) === QUOTED_AD);
	assert('引用体提取：无引用时为空串', W.getAdQuotedText({ text: '普通消息' }) === '');
	assert('引用体提取：多字段同时存在时全部拼接',
		W.getAdQuotedText({ quote: { text: 'A' }, reply_to_message: { text: 'B' } }) === 'A\nB');

	// 判定本体。第一列是本人正文，第二列是引用体，第三列期望。
	const quotedCases = [
		// 主人给的真实实例（昵称 Maybell Tillman、正文一个字母 c、引用块是这条广告）。
		// 「提供设备」→ AD_TRADE_VERBS（招揽），「赚钱」→ AD_BIZ_PATTERNS（行业），两类同现。
		['真实实例（正文 c）', 'c', QUOTED_AD, true],
		['正文为空', '', QUOTED_AD, true],
		['正文 4 字符（刚好在门槛一之内）', 'abcd', QUOTED_AD, true],
		// 门槛一：正常人引用别人的消息一定会说点什么，超过 4 字符即放行。
		['门槛一 · 正文 6 字正常话', '你们看看这个', QUOTED_AD, false],
		['门槛一 · 正文带 @ 提醒别人', '@somebody 你看这个', QUOTED_AD, false],
		// 门槛一分档（2026-09-09 方案 B）：纯 ASCII 放宽到「剥掉非字母数字后 ≤8 且原文 ≤16」。
		// 主人原话：「这个引用广告带短字符是只有广告才会这样做……它最多就是单个字符。」
		// 纯字母数字外壳在中文群里没有正常语义，所以 ASCII 档可以比中文档松一倍。
		['分档 ASCII · 5 字 hello', 'hello', QUOTED_AD, true],
		['分档 ASCII · 6 字 123456', '123456', QUOTED_AD, true],
		['分档 ASCII · 7 字 laowang', 'laowang', QUOTED_AD, true],
		['分档 ASCII · 8 字边界', 'abcdefgh', QUOTED_AD, true],
		['分档 ASCII · 9 字越界', 'abcdefghi', QUOTED_AD, false],
		// 非字母数字先被剥掉再量长度（对齐旧代码 normalizeForFingerprint 的行为）。
		['分档 ASCII · 带标点剥离后 5 字', 'hello!!!', QUOTED_AD, true],
		['分档 ASCII · 带空格剥离后 6 字', 'ok ok ok', QUOTED_AD, true],
		// 原文上限 16（沿用旧代码 isShortQuoteWrapperText 的 raw ≤16）：纯标点刷屏不算包装。
		['分档 ASCII · 原文超 16 字即放行', '!!!!!!!!!!!!!!!!!!!!', QUOTED_AD, false],
		// 真人英文对话剥完仍超 8 字 → 放行，不因为「是英文」就一律判包装。
		['分档 ASCII · 真人英文对话', 'Hi there mate!', QUOTED_AD, false],
		// 中文档【一个字都没放宽】，行为与改动前逐字一致：≤4 判包装、>4 放行。
		['分档 中文 · 4 字仍判包装', '射了牛比', QUOTED_AD, true],
		['分档 中文 · 5 字仍放行', '分享得不错', QUOTED_AD, false],
		// emoji 是非 ASCII，走中文档；UTF-16 长度 6 > 4 → 放行，与改动前一致。
		['分档 emoji · 走非 ASCII 档放行', '🔥🔥🔥', QUOTED_AD, false],
		// 门槛二：举报语义放行。与门槛一不冗余 —— 这些词都只有 2~3 个字，全在门槛一之内。
		['门槛二 · 举报「广告」', '广告', QUOTED_AD, false],
		['门槛二 · 举报「垃圾」', '垃圾', QUOTED_AD, false],
		['门槛二 · 举报「骗子」', '骗子', QUOTED_AD, false],
		['门槛二 · 举报「封他」', '封他', QUOTED_AD, false],
		['门槛二 · 举报「假的」', '假的', QUOTED_AD, false],
		// 引用体本身不构成广告时不得定罪 —— 否则「引用一句闲聊」也会被杀。
		['引用体是闲聊', 'c', '今天天气不错，一起吃饭吗', false],
		['引用体只命中一类词', 'c', '有没有人收购二手显卡', false],
		// 豁免闸门（与 scoreAdMessageText 同一套不对称口径）：
		// 命中技术豁免词【且无强交易动词】放行；一旦出现强动词，塞术语也不免死。
		['豁免 · 技术贴无强动词', 'n', '出租虚拟币行情机器人，附 vless 节点订阅教程', false],
		['豁免 · 有强动词则不免死', 'n', '收购虚拟币账号，USDT 秒结，vless 节点也收', true],
		// 无引用体时整条通道跳过。
		['无引用体', 'c', '', false]
	];
	for (const [label, own, quoted, expect] of quotedCases) {
		const r = W.judgeAdQuotedKill({ name: '', username: '', bio: '', text: own, quoted });
		assert('引用体查杀：' + label + (expect ? ' 应定罪' : ' 应放行'),
			r.guilty === expect, JSON.stringify({ guilty: r.guilty, form: r.form, reasons: r.reasons }));
	}
	// 定罪时 reasons 必须带上引用体片段 —— 否则封禁通知里只有一个字母，
	// 主人拿 /pending 复核时完全无法判断封得对不对。
	const quotedGuilty = W.judgeAdQuotedKill({ name: '', username: '', bio: '', text: 'c', quoted: QUOTED_AD });
	assert('引用体查杀：judgeAdStructure 的 label 标成「引用体查杀」',
		quotedGuilty.reasons.some((r) => r.includes('引用体查杀')), JSON.stringify(quotedGuilty.reasons));
	assert('引用体查杀：reasons 回带引用原文片段',
		quotedGuilty.reasons.some((r) => r.includes('提供设备')), JSON.stringify(quotedGuilty.reasons));
	assert('引用体查杀：channel 标记为 quoted', quotedGuilty.channel === 'quoted', String(quotedGuilty.channel));
	// 举报放行也要可观测：这条路径不留记录的话，主人复核漏放时看不出「命中过、被赦免了」。
	const quotedNegated = W.judgeAdQuotedKill({ name: '', username: '', bio: '', text: '广告', quoted: QUOTED_AD });
	assert('引用体查杀：举报放行留下可观测记录',
		quotedNegated.reasons.some((r) => r.includes('举报语义')), JSON.stringify(quotedNegated.reasons));

	// ---- 名片显示名的判据与反向白名单（2026-09-09 方案 1+4）----
	// 方案 1 只补了 4 个词：AD_TRADE_VERBS 加「面交」「当面交易」，AD_BUSINESS_KEYWORDS 加「假钞」「假币」。
	// 这一组断言的用意是钉死【补词不等于单词直杀】—— 旧代码的名片强特征是「显示名命中词库即秒杀」，
	// 误封率约 90% 被整体移除；本项目仍要求招揽 ∧ 行业两类同现才定罪。
	const cardStructureCases = [
		// 主人截图实物：「面交」→ solicit，「假钞」→ biz，两类同现 → 形态 A。
		['截图实物显示名', '假钞玩妹交流群🔥快递面交都可', true],
		['当面交易 + 假币', '假币当面交易', true],
		// 单词单独出现【不构成任何证据】—— 补词前后都不该定罪。
		['只有招揽动词「面交」', '面交', false],
		['只有行业词「假钞」', '假钞', false],
		['只有招揽动词的整句', '快递面交都可以', false],
		// 讨论反假币是正常语义，没有招揽动词就不定罪。
		['反假币讨论', '假币鉴别方法', false],
		// 关键防线：旧代码把「交流群」写进 PROFILE_OFFERING_PATTERN，会杀掉技术群管理员。
		// 本项目不引入那张表，这条必须放行 —— 本机器人自己就部署在技术群里。
		['技术交流群不误封', 'Python技术交流群管理', false]
	];
	for (const [label, name, expect] of cardStructureCases) {
		const r = W.judgeAdStructure(name, '', 'card');
		assert('名片显示名判据：' + label + (expect ? ' 应定罪' : ' 应放行'),
			r.guilty === expect, JSON.stringify({ guilty: r.guilty, form: r.form, reasons: r.reasons }));
	}

	// 方案 4：looksLikePersonName 是反向白名单，命中即整条跳过名片通道。
	// 它只减误封、对漏检零影响 —— 广告名片必须把广告写进显示名，写了就一定不像人名。
	const personNameCases = [
		['中文姓名', '张三', true],
		['称谓', '妈妈', true],
		['职业称谓', '王医生', true],
		['4 字称谓', '快递小哥', true],
		['5 字中文（边界内）', '一二三四五', true],
		['单字', '李', true],
		['西文姓名', 'John Smith', true],
		// 以下四类是「不像人名」的判据，逐条对应旧代码 :6632 的四道闸。
		['6 字中文超界', '一二三四五六', false],
		['带 emoji', '假钞玩妹交流群🔥快递面交都可', false],
		['带数字', '张三123', false],
		['超 12 字符', 'Alexander Hamilton Junior', false],
		['小写西文（不像正式姓名）', 'john smith', false],
		['广告长句', '王小明的技术交流群', false],
		['空串', '', false]
	];
	for (const [label, name, expect] of personNameCases) {
		assert('人名白名单：' + label + (expect ? ' 判为人名' : ' 判为非人名'),
			W.looksLikePersonName(name) === expect, JSON.stringify({ name, got: W.looksLikePersonName(name) }));
	}

	// ---- 豁免词不得参与结构判定 ----
	// 这是两次漏放的直接原因：广告号自己写「双向联系 @xxx_bot」拿 -3 分当挡箭牌。
	const exemptShield = W.judgeAdProfileCard({
		name: '回收', username: '@hs', bio: '双向机器人 开源项目 大量收网赌亏损号 @kf_888888', text: ''
	});
	assert('结构查杀：豁免词不能当挡箭牌', exemptShield.guilty === true, JSON.stringify(exemptShield.reasons));

	// ---- 端到端：事故号原样重放，只发一句「在吗」也要被封 ----
	const envS = makeEnv();
	await W.adDetectionReady(envS);
	resetCalls();
	setApi({
		getChat: (body) => ({
			ok: true,
			result: {
				id: body?.chat_id,
				first_name: '♻网赌账号回收h🀄',
				username: 'w743flrute',
				bio: '6大量收网赌亏损号输钱号 联系 @sx8888888sx 双向联系 @s88888888x_bot 权威'
			}
		}),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } })
	});
	await sendUpdate({ message: groupMessage({ id: 70001, first_name: '♻网赌账号回收h🀄', username: 'w743flrute' }, '在吗') }, envS);
	assert('端到端：事故号发「在吗」即被全群封禁', countCalls('banChatMember') > 0, JSON.stringify(calls.map((c) => c.method)));
	assert('端到端：事故号进全局黑名单',
		envS.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '70001'")[0].c === 1);
	const structNotice = () => calls
		.filter((c) => c.method === 'sendMessage' && String(c.body?.chat_id) === String(OWNER_ID))
		.map((c) => String(c.body?.text || '')).join('\n');
	assert('端到端：判定层标注为资料卡查杀', structNotice().includes('资料卡查杀'), structNotice());
	// 结构查杀命中必须开 learnAdFingerprints 的 auto 闸门：该号不含任何 AD_TRADE_VERBS
	// 里的强动词（「大量收」是构词模式匹配的），不开闸就一条指纹都学不到。
	assert('端到端：结构查杀命中后自动学到指纹',
		envS.DB.query('SELECT COUNT(*) AS c FROM ad_fingerprints')[0].c > 0,
		JSON.stringify(envS.DB.query('SELECT type, value FROM ad_fingerprints')));

	// ---- AD_CARD_KILL 开关 ----
	//
	// 样本刻意【不用】图 28 那个「♻网赌账号回收h🀄 / 6大量收网赌亏损号输钱号」的号 ——
	// 2026-09-07 指纹种子上线后它同时命中 `收网赌`、`亏损号`、`输钱号`、`@sx8888888sx`、
	// `@s88888888x_bot` 五条种子，而指纹层（fingerprintBan，_worker.js:10556）在结构查杀
	// 之外独立定罪、不受 AD_CARD_KILL 约束，会先一步封掉他 → 开关的两个档位都测不到了。
	// 这不是缺陷（他本来就该封），但要保住开关本身的可测性，就得换一个
	// 「结构查杀命中、种子一条都不命中」的样本：
	//   昵称「高价回收游戏账号」→ 招揽意图命中 /(回收|求购|收购)/
	//   bio「长期收账号 支持实名号 有量私聊」→ 招揽「长期收账」∧ 行业「实名号」
	// 逐条比对 33 条种子确认零命中（关键差异：是「回收」不是「回收网赌」、
	// 是「长期收账号」不是「长期收购各类账号」）。
	// 纯评分算式：交易动词 +2、业务关键词 +2、两类同现 +2 = 6 分，落在 [5,7) 观察区间，
	// 所以 off 档退回纯评分时确实不该封 —— 这正是本用例要钉死的语义。
	const CARD_KILL_NAME = '高价回收游戏账号';
	const CARD_KILL_BIO = '长期收账号 支持实名号 有量私聊';
	const cardKillApi = () => ({
		getChat: (body) => ({
			ok: true,
			result: { id: body?.chat_id, first_name: CARD_KILL_NAME, username: 'gm_recycle_shop', bio: CARD_KILL_BIO }
		}),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } })
	});

	const envOff = makeEnv();
	envOff.AD_CARD_KILL = 'off';
	await W.adDetectionReady(envOff);
	resetCalls();
	setApi(cardKillApi());
	await sendUpdate({ message: groupMessage({ id: 70002, first_name: CARD_KILL_NAME, username: 'gm_recycle_shop' }, '在吗') }, envOff);
	assert('开关 off：结构查杀完全关闭，退回纯评分（不封）', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('开关 off：样本未被指纹种子抢先定罪', envOff.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '70002'")[0].c === 0, JSON.stringify(envOff.DB.query('SELECT id FROM blacklist')));

	const envObs = makeEnv();
	envObs.AD_CARD_KILL = 'observe';
	await W.adDetectionReady(envObs);
	resetCalls();
	setApi(cardKillApi());
	await sendUpdate({ message: groupMessage({ id: 70003, first_name: CARD_KILL_NAME, username: 'gm_recycle_shop' }, '在吗') }, envObs);
	assert('开关 observe：命中不封', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('开关 observe：命中仍写观察记录',
		envObs.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '70003'")[0].c === 1);

	// 反过来钉死一条：图 28 那个号在 AD_CARD_KILL='off' 下【依然会被封】——
	// 指纹种子不受这个开关管辖。开关只是结构查杀的总闸，不是「放行真广告」的开关。
	const envOffSeed = makeEnv();
	envOffSeed.AD_CARD_KILL = 'off';
	await W.adDetectionReady(envOffSeed);
	resetCalls();
	setApi({
		getChat: (body) => ({
			ok: true,
			result: { id: body?.chat_id, first_name: '♻网赌账号回收h🀄', username: 'w743flrute', bio: '6大量收网赌亏损号输钱号 联系 @sx8888888sx 双向联系 @s88888888x_bot 权威' }
		}),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } })
	});
	await sendUpdate({ message: groupMessage({ id: 70004, first_name: '♻网赌账号回收h🀄', username: 'w743flrute' }, '在吗') }, envOffSeed);
	assert('开关 off 也管不到指纹种子：图 28 号仍被封', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('开关 off 也管不到指纹种子：图 28 号仍入黑名单', envOffSeed.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '70004'")[0].c === 1);
}

section('[16] 指纹种子库（35 图特征下移到第二层）+ /spam 人工判定自动学习');
{
	// 种子常量必须用 vm.runInContext 取 —— 它是顶层 const，vm 沙箱里读不到（同 EMBED_DIM 那条注释）。
	const SEED = vm.runInContext('AD_FINGERPRINT_SEED', sandbox);
	const envSeed = makeEnv();
	await W.adDetectionReady(envSeed);

	// ---- 种子灌入 ----
	const seedRows = envSeed.DB.query("SELECT type, value, weight, confidence, source FROM ad_fingerprints WHERE source = 'seed'");
	assert('种子：建表时自动灌入', seedRows.length > 0, String(seedRows.length));
	assert('种子：条数与 AD_FINGERPRINT_SEED 一致', seedRows.length === SEED.length, seedRows.length + ' vs ' + SEED.length);
	assert('种子：weight 全为 1（>= AD_FINGERPRINT_BAN_WEIGHT 0.8，命中即封而非凑分）',
		seedRows.every((r) => Number(r.weight) === 1), JSON.stringify(seedRows.filter((r) => Number(r.weight) !== 1)));
	assert('种子：confidence 全为 1（高于 fingerprintMinConfidence 0.6，立即生效）',
		seedRows.every((r) => Number(r.confidence) === 1), JSON.stringify(seedRows.filter((r) => Number(r.confidence) !== 1)));
	// source 刻意不是 'manual'：manual 会被 markAdFingerprintFalsePositive 的退役 DELETE 豁免
	// （那句带 source != 'manual'）。种子必须留着这道安全网 —— 万一某条选词失手造成误封，
	// /ignore 累计 3 次误报后它会自动退役，不会成为永久误封源。
	assert('种子：source 为 seed 而非 manual（保留误报自动退役安全网）',
		seedRows.every((r) => r.source === 'seed'), JSON.stringify(seedRows.map((r) => r.source).filter((s) => s !== 'seed')));
	assert('种子：不冒充 manual，不污染 /addword 的 manual 计数',
		envSeed.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'manual'")[0].c === 0);

	// ---- 真广告：种子命中即封 ----
	// 前 5 条正是双通道（招揽 ∧ 行业的正交合取）实测漏放的那批 —— 招募型、收益承诺型、
	// 色情引流型在双通道里根本没有对应维度，只能靠种子铁证钉死。
	// 后几条是图 27 / 图 28 两次线上漏放事故的原型。
	const seedHitCases = [
		['招募代理型（双通道漏放）', '兼职小助手', '招代理日结佣金 无需经验 加微详聊'],
		['洗钱黑话型（双通道漏放）', '😊青山落日😊', '小额洗急 两分钟一单赚几百 私聊我'],
		['色情引流型（双通道无此维度）', '交友', '约炮极品辣妞组 真实头像 黑丝反差女主妇'],
		['赌博拉新型（双通道漏放）', '真宝', '真宝玩家注册即送88-388USDT 大额无忧'],
		['包盒项目型（双通道漏放）', '7💚收号💚', '收各种赚钱包盒项目'],
		['网赌号回收（图 27 原型）', '♻网赌账号回收h🀄', '6大量收网赌亏损号输钱号'],
		// 【2026-09-10 方案 A】图 28 那两条「引流 bot 挡箭牌 @s88888888x_bot」与
		// 「引流账号 @sx8888888sx」已从本清单移出 —— 7 条 username 型种子随维度下线。
		// 移出的理由不是它们抓错了人，而是这条通道的形态本身有误伤：
		// username 型权重 0.8 恰好触及 AD_FINGERPRINT_BAN_WEIGHT、单条即定罪，
		// 于是任何在正文里提到这些 @handle 的人（举报、转述、警示「别加这个号」）
		// 都会被当成广告号封掉 —— 举报者反被封是它最典型的误伤形态。
		// 这两条的召回改由：昵称 emoji / 交易动词短语 / 域名 / bio / AI 语义 /
		// 四通道结构查杀共同承担；下面 seedCleanCases 里补了对应的放行断言。
		['带空格 du 变体', '收号', '长期收购网 du 商宝账号'],
		['无空格 du 变体', '收号', '长期收购网du商宝账号'],
		['价格表话术', '回收', '长期收购各类账号 价格表私聊 秒结不拖欠'],
		['收网赚号型', '💚高价收网赚号💚', '专业收购网赚号']
	];
	for (const [label, name, bio] of seedHitCases) {
		const r = await W.matchAdFingerprints(envSeed, { name, username: '', bio, text: '', domains: [] }, {});
		assert('种子命中：' + label,
			r.hits.length > 0 && r.maxWeight >= 0.8,
			'maxWeight=' + r.maxWeight + ' hits=' + JSON.stringify(r.hits.map((h) => h.value)));
	}

	// ---- 误封回归（本 section 最关键的一半）----
	// 指纹是【子串匹配】+ weight 1 命中即封，选错一个词就是大面积误封。
	// 下面每一条都对应 AD_FINGERPRINT_SEED 注释里「被剔除的高危词」清单中的一项，
	// 钉死那些词没有偷偷进表。任何一条变红都说明种子选词失手，必须立刻停手报告。
	const seedCleanCases = [
		['床品四件套（剔除「四件套」）', '家居小店', '纯棉四件套现货 床单被套一起发'],
		['手机跑分（剔除「跑分」）', '数码爱好者', '这台安兔兔跑分 120 万 挺能打'],
		['蔬菜菠菜（剔除「菠菜」）', '家常菜谱', '今天炒了菠菜和鸡蛋 很下饭'],
		['电商注册即送（剔除「注册即送」）', '优惠券君', '新用户注册即送 20 元优惠券'],
		['产品无需实名（剔除「无需实名」）', '工具作者', '本工具无需实名即可试用'],
		['正常兼职日结（剔除「日结佣金」）', '招聘小助手', '门店促销日结佣金 120 一天'],
		['金融承兑（剔除「承兑」）', '财务小张', '银行承兑汇票怎么贴现比较划算'],
		['自称实名号（剔除「实名号」）', '路人', '我这个是实名号 为什么登不上'],
		['清洗急救箱（剔除单独「洗急」）', '校医', '每周清洗急救箱一次'],
		['举报网赌（剔除单独「网赌账号」）', '志愿者', '请问在哪里举报网赌账号'],
		['英文含 du（剔除单独「du」）', 'Dev', 'education module produce 这些词都含 du'],
		['讨论网赚行业（剔除「网赚」）', '评论员', '网赚这个行业乱得很 别碰'],
		['自称项目代理（剔除「项目」「代理」）', '销售小王', '我是这个项目的代理 有需要联系我'],
		['技术群双向 bot（正常用户资料卡写法）', 'MiLov1900', '双向机器人 @some_open_bot 开源项目'],
		['收藏出闲置（负向排除生效）', '老相机迷', '收藏老相机 出闲置镜头一只'],
		['长期收听播客（负向排除生效）', '播客控', '长期收听这档节目 很好'],
		['大量收集数据（负向排除生效）', '研究员', '需要大量收集问卷数据'],
		['赚钱包鼓鼓（剔除误切分）', '打工人', '希望今年赚钱包鼓鼓的'],
		// 【2026-09-10 方案 A：username 种子下线后的放行回归】
		// 这三条是线上误封的真实形态，钉死它们不再命中：
		//   1) 举报者原文引用广告号的 @handle 来警示他人 —— 原 7 条 username 种子下必被封；
		//   2) 正常用户被艾特 / 艾特他人（#143 的形态：任何人艾特主人都被封）；
		//   3) 昵称干净、简介干净，唯一「证据」是提到了某个 @handle。
		['举报者引用广告号 handle（原 username 种子）', '热心群友', '大家别加 @sx8888888sx 这个号 是广告'],
		['转述挡箭牌 bot（原 username 种子）', '路人甲', '他给我发的是 @s88888888x_bot 我没敢点'],
		['艾特他人（#143 误封形态）', 'My fuhrer', '@ym94203 帮忙看一下这个问题']
	];
	for (const [label, name, bio] of seedCleanCases) {
		const r = await W.matchAdFingerprints(envSeed, { name, username: '', bio, text: '', domains: [] }, {});
		assert('种子零误封：' + label, r.hits.length === 0,
			'误命中 ' + JSON.stringify(r.hits.map((h) => h.type + ':' + h.value)));
	}

	// ---- 端到端：种子命中走完整处置链路（加黑 + 全群封禁 + 待确认快照）----
	// 上面测的是 matchAdFingerprints 单元；这里钉死它真的接到了处置链上，
	// 而且不依赖 env.AI —— makeEnv 默认不注入 AI，第三层整层跳过，种子仍然要封掉他。
	const envE2E = makeEnv();
	await W.adDetectionReady(envE2E);
	// 必须显式清资料缓存。AD_PROFILE_CACHE 是模块级 Map、key 只有 userId，跨 env 存活 5 分钟，
	// 而 resetCalls() 不碰它。本文件 [15] 段的 cron 扫描用例用 '9100'+i 造过 91000~9100N 的
	// 假成员并给它们缓存了 { first_name: '路人', bio: '' } —— ID 一撞，这里的 getChat 就永远
	// 不会发出，bio 恒为空，「种子命中即封」会变成假通过（根本没读到 bio）。
	// 所以下面的 user id 刻意避开 91xxx 用 92xxx，再加这一行兜底。
	W.invalidateAdProfileCache();
	assert('端到端前置：本 env 未绑定 AI（证明种子层不依赖 Workers AI）', !envE2E.AI);
	resetCalls();
	setApi({
		getChat: (body) => ({
			ok: true,
			result: { id: body?.chat_id, first_name: '兼职小助手', username: 'parttime_help_x', bio: '招代理日结佣金 无需经验 加微详聊' }
		}),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } })
	});
	await sendUpdate({ message: groupMessage({ id: 92001, first_name: '兼职小助手', username: 'parttime_help_x' }, '在吗') }, envE2E);
	assert('端到端：种子命中执行全群封禁', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('端到端：种子命中写入黑名单', envE2E.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '92001'")[0].c === 1, JSON.stringify(envE2E.DB.query('SELECT id FROM blacklist')));
	assert('端到端：种子命中不留观察窗口', envE2E.DB.query("SELECT COUNT(*) AS c FROM ad_user_screening WHERE user_id = '92001'")[0].c === 0, JSON.stringify(envE2E.DB.query('SELECT user_id, score, layer FROM ad_user_screening')));
	assert('端到端：种子命中生成待确认快照', envE2E.DB.query("SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE user_id = '92001'")[0].c === 1);
	assert('端到端：种子命中累加 match_count',
		envE2E.DB.query("SELECT match_count FROM ad_fingerprints WHERE value = '招代理日结'")[0]?.match_count > 0,
		JSON.stringify(envE2E.DB.query("SELECT value, match_count FROM ad_fingerprints WHERE source = 'seed' AND match_count > 0")));

	// ---- 端到端反例：正常用户资料卡不被种子封 ----
	// 同样避开 91xxx 并清缓存。这一段尤其不能靠缓存蒙对：如果 getChat 没发出、bio 恒为空，
	// 「不被封」会因为「什么都没读到」而假通过 —— 那就完全测不到「读到了四件套但依然放行」这件事。
	const envClean = makeEnv();
	await W.adDetectionReady(envClean);
	W.invalidateAdProfileCache();
	resetCalls();
	setApi({
		getChat: (body) => ({
			ok: true,
			result: { id: body?.chat_id, first_name: '家居小店', username: 'home_shop_cn', bio: '纯棉四件套现货 床单被套一起发' }
		}),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } })
	});
	await sendUpdate({ message: groupMessage({ id: 92002, first_name: '家居小店', username: 'home_shop_cn' }, '有人要四件套吗') }, envClean);
	assert('端到端反例：确实读到了 bio（否则下面两条是假通过）', countCalls('getChat') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('端到端反例：卖床品的正常商户不被封', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('端到端反例：卖床品的正常商户不入黑名单', envClean.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '92002'")[0].c === 0);

	// ---- /spam 引用模式：人工判定 → 自动学习指纹 ----
	// 主人定的方案原文：「通过 spam 引用确定广告之后全群封禁并自动学习，spam 是手动指令，
	// 所以基本上不会误封，全部交给有权限的人来判定。」
	// 这一段钉死三件事：学到了、来源是 'spam'（不是 'manual' 也不是 'auto'）、回执告知了条数。
	const envSpam = makeEnv();
	await W.adDetectionReady(envSpam);
	// 只保留种子里【本例不会命中】的部分不重要，关键是先量出 spam 来源的基线为 0。
	assert('/spam 学习前置：spam 来源指纹基线为 0',
		envSpam.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'spam'")[0].c === 0);
	W.invalidateAdProfileCache();
	resetCalls();
	setApi({
		getChat: (body) => {
			const id = String(body?.chat_id);
			if (id === '92003') {
				return { ok: true, result: { id, first_name: '闲鱼小号铺', username: 'spam_learn_target', bio: '专业出售各类老号 需要的私聊 evil-spamshop.top' } };
			}
			return { ok: true, result: { id, first_name: 'Owner', bio: '' } };
		},
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: [] }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true })
	});
	// 备注 rawArg 刻意不含「广告」「封」等字样：handleAdReplyLearning（_worker.js:6212）排在
	// 命令分发【之前】，classifyAdReplyIntent 只看文本含不含触发词、不管它是不是 slash 命令，
	// 所以 `/spam 广告号` 会被回复学习先吃掉（走 source='manual' 那条路），
	// 压根进不到 /spam 的引用分支 —— 本用例就测不到 source='spam' 了。
	await sendUpdate({
		message: groupMessage({ id: OWNER_ID, first_name: 'Owner' }, '/spam 违规出售账号', {
			reply_to_message: {
				message_id: 556,
				date: Math.floor(Date.now() / 1000),
				chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
				from: { id: 92003, is_bot: false, first_name: '闲鱼小号铺', username: 'spam_learn_target' },
				text: '长期收购各类账号 价格表私聊 秒结不拖欠 evil-spamshop.top'
			}
		})
	}, envSpam);
	const spamRows = envSpam.DB.query("SELECT type, value, weight, source FROM ad_fingerprints WHERE source = 'spam'");
	assert('/spam 学习：本职照做（目标入黑名单）', envSpam.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '92003'")[0].c === 1, JSON.stringify(envSpam.DB.query('SELECT id, reason FROM blacklist')));
	assert('/spam 学习：本职照做（全群封禁）', countCalls('banChatMember') >= 1, JSON.stringify(calls.map((c) => c.method)));
	assert('/spam 学习：写入了指纹', spamRows.length > 0, JSON.stringify(spamRows));
	assert('/spam 学习：来源标记为 spam（不是 manual，保留误报自动退役）',
		spamRows.every((r) => r.source === 'spam'), JSON.stringify(spamRows.map((r) => r.source)));
	assert('/spam 学习：不冒充 manual', envSpam.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'manual'")[0].c === 0);
	// bio 里的域名必须学到 —— 这是 /spam 额外拉一次 getChat 的全部理由：
	// 广告号的正文常常只有一句「在吗」，联系方式和引流域名都写在资料卡里。
	assert('/spam 学习：学到了 bio 里的域名（证明确实读了资料卡）',
		spamRows.some((r) => r.type === 'domain' && String(r.value).includes('evil-spamshop')), JSON.stringify(spamRows));
	assert('/spam 学习：回执告知学习条数',
		allSentText().includes('已学习广告指纹'), allSentText().slice(0, 600));

	// ---- /spam 补加 AI 语义样本（2026-09-08，主人：「AI 是通过 spam 执行自我学习的」）----
	// 此前 /spam 只学指纹、不碰样本库，AI 层就永远只吃中心特征 + 手工 /addsample 喂的那点料。
	// 本用例正文 21 字符（> AD_QUOTED_KILL_MAX_OWN_TEXT），不会走引用体分支，走 source='spam'。
	// 素材 =「昵称 + bio + 正文」经 buildAdSampleText 拼出 —— 与回滚端（/ignore、/unban 删样本）
	// 同一个拼法，保证删得掉。
	const spamSamples = envSpam.DB.query("SELECT sample_text, source, embedding FROM ad_sample_embeddings WHERE source = 'spam'");
	assert('/spam 样本：写入了 AI 语义样本', spamSamples.length === 1, JSON.stringify(spamSamples));
	assert('/spam 样本：来源标记为 spam', spamSamples.every((r) => r.source === 'spam'), JSON.stringify(spamSamples.map((r) => r.source)));
	assert('/spam 样本：含正文与 bio（说明都拼进去了）',
		spamSamples.some((r) => String(r.sample_text).includes('长期收购各类账号') && String(r.sample_text).includes('evil-spamshop')),
		JSON.stringify(spamSamples.map((r) => r.sample_text)));
	assert('/spam 样本：向量留空待懒加载', spamSamples.every((r) => r.embedding === null || r.embedding === undefined), JSON.stringify(spamSamples.map((r) => r.embedding)));
	assert('/spam 样本：回执告知已加样本', allSentText().includes('已加 AI 语义样本'), allSentText().slice(0, 600));

	// ---- /spam 引用体取材：本人正文短到没内容时，学引用块里的广告（项 6 口径）----
	// 线上漏放 50+ 个号的共同形态：正文只有「c」一个字母、广告全在引用块里。
	// /spam 若固定用「昵称 + bio + 本人正文」，学进去的就是「Maybell Tillman c」这种纯噪声。
	// 取材逻辑应与回复学习路径一致（正文 ≤4 字符且不含举报/吐槽词 → 换成引用体）。
	const envSpamQuoted = makeEnv();
	await W.adDetectionReady(envSpamQuoted);
	W.invalidateAdProfileCache();
	resetCalls();
	setApi({
		getChat: (body) => {
			const id = String(body?.chat_id);
			if (id === '92005') {
				return { ok: true, result: { id, first_name: 'Maybell Tillman', username: 'quoted_spam_target', bio: '' } };
			}
			return { ok: true, result: { id, first_name: 'Owner', bio: '' } };
		},
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: [] }),
		banChatMember: () => ({ ok: true, result: true }),
		deleteMessage: () => ({ ok: true, result: true })
	});
	await sendUpdate({
		message: groupMessage({ id: OWNER_ID, first_name: 'Owner' }, '/spam 违规出售账号', {
			reply_to_message: {
				message_id: 558,
				date: Math.floor(Date.now() / 1000),
				chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
				from: { id: 92005, is_bot: false, first_name: 'Maybell Tillman', username: 'quoted_spam_target' },
				// 本人正文只有一个字母 —— 这里才是「Maybell Tillman c」陷阱的触发点。
				text: 'c',
				// 广告全在引用块里。getAdQuotedText 三字段全读，这块内容必须被取到。
				external_reply: { text: '操逼赚钱，招探花9000一单，提供设备' }
			}
		})
	}, envSpamQuoted);
	const spamQuotedSamples = envSpamQuoted.DB.query("SELECT sample_text, source FROM ad_sample_embeddings WHERE source = 'spam-quoted'");
	assert('/spam 引用体：正文太短时改用引用块', spamQuotedSamples.length === 1, JSON.stringify(spamQuotedSamples));
	assert('/spam 引用体：学的是引用块不是昵称+单字母',
		String(spamQuotedSamples[0]?.sample_text).includes('操逼赚钱') && !String(spamQuotedSamples[0]?.sample_text).includes('Maybell c'),
		JSON.stringify(spamQuotedSamples.map((r) => r.sample_text)));
	assert('/spam 引用体：来源标记为 spam-quoted', spamQuotedSamples.every((r) => r.source === 'spam-quoted'), JSON.stringify(spamQuotedSamples.map((r) => r.source)));
	assert('/spam 引用体：不回退到 source=spam', envSpamQuoted.DB.query("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE source = 'spam'")[0].c === 0);
	assert('/spam 引用体：回执告知已加样本', allSentText().includes('已加 AI 语义样本'), allSentText().slice(0, 600));

	// 学到的指纹立刻对下一个人生效 —— 「同一段文案第二次出现即被秒杀」。
	W.invalidateAdProfileCache();
	resetCalls();
	setApi({
		getChat: (body) => ({
			ok: true,
			result: { id: body?.chat_id, first_name: '另一个号', username: 'spam_learn_clone', bio: '有需要的看我置顶 evil-spamshop.top' }
		}),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: [] })
	});
	await sendUpdate({ message: groupMessage({ id: 92004, first_name: '另一个号', username: 'spam_learn_clone' }, '在吗') }, envSpam);
	assert('/spam 学习：学到的域名指纹对同伙立即生效', envSpam.DB.query("SELECT COUNT(*) AS c FROM blacklist WHERE id = '92004'")[0].c === 1, JSON.stringify(envSpam.DB.query('SELECT id FROM blacklist')));

	// ---- 重复部署不重灌 ----
	// 判空条件是 WHERE source='seed' 而不是「整表为空」：指纹表会被自动学习持续写入，
	// 判整表的话只要有一条自动指纹先落地，种子就再也灌不进去了。
	const beforeReseed = envSeed.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'seed'")[0].c;
	await W.seedAdDetectionData(envSeed);
	assert('重复部署：种子不重灌', envSeed.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'seed'")[0].c === beforeReseed,
		beforeReseed + ' -> ' + envSeed.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'seed'")[0].c);
	// 主人 /delword 删掉某条种子后，其余种子仍在 → 计数 > 0 → 重新部署不会把删掉的那条灌回来。
	// 这是刻意的：判空按 source 计数而非逐条比对，主人的删除决定必须能压过种子表。
	await envSeed.DB.exec("DELETE FROM ad_fingerprints WHERE source = 'seed' AND value = '约炮'");
	await W.seedAdDetectionData(envSeed);
	assert('重复部署：主人删掉的种子不会被灌回来',
		envSeed.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE value = '约炮'")[0].c === 0,
		JSON.stringify(envSeed.DB.query("SELECT value FROM ad_fingerprints WHERE value = '约炮'")));
}

section('[16] /words 关键词搜索与 inline 按钮翻页');
{
	const cmdAll = async (env, text) => {
		resetCalls();
		await sendUpdate({ message: privateMessage(OWNER_ID, text) }, env);
		return allSentText();
	};
	const ownerCallback = (data, fromId = OWNER_ID) => ({
		id: 'cb' + Math.random().toString(36).slice(2),
		from: { id: fromId, is_bot: false, first_name: 'Owner' },
		message: {
			message_id: 4321,
			date: Math.floor(Date.now() / 1000),
			chat: { id: OWNER_ID, type: 'private', first_name: 'Owner' },
			text: '旧内容'
		},
		data
	});
	const click = async (env, data, fromId = OWNER_ID) => {
		resetCalls();
		await sendUpdate({ callback_query: ownerCallback(data, fromId) }, env);
	};
	const lastKeyboard = () => calls.filter((c) => c.method === 'sendMessage').at(-1)?.body?.reply_markup?.inline_keyboard || [];
	const buttonData = () => lastKeyboard().flat().map((b) => String(b.callback_data || ''));
	const lastEdited = () => String(calls.filter((c) => c.method === 'editMessageText').at(-1)?.body?.text || '');
	const lastAnswer = () => String(calls.filter((c) => c.method === 'answerCallbackQuery').at(-1)?.body?.text || '');

	const env = makeEnv();
	await W.adDetectionReady(env);
	await env.DB.exec('DELETE FROM ad_fingerprints');
	const insert = async (type, value, matchCount) => {
		await env.DB.prepare(
			'INSERT INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_at, updated_at)'
			+ ' VALUES (?, ?, ?, 1, ?, 0, 1, ?, ?, ?)'
		).bind(W.adFingerprintKey(type, value), type, value, matchCount, 'manual', 1757000000 - matchCount, 1757000000 - matchCount).run();
	};
	// 25 条同前缀指纹 → 每页 20 条正好 2 页，用来测按钮翻页。
	for (let i = 1; i <= 25; i++) await insert('keyword', '测试指纹' + String(i).padStart(2, '0'), 500 - i);
	await insert('keyword', '收U秒结日结', 9);
	// 这两条是 LIKE 通配符转义的对照组：搜「50%」时只有前者该命中。
	await insert('keyword', '折扣50%特价', 8);
	await insert('keyword', '折扣500元', 7);

	// —— 关键词搜索：只匹配 value ——
	const hitText = await cmdAll(env, '/words 收U');
	assert('/words 关键词搜索标题标出关键词', hitText.includes('指纹库搜索') && hitText.includes('收U'), hitText);
	assert('/words 关键词搜索只返回匹配项', hitText.includes('共 <b>1</b> 条') && hitText.includes('收U秒结日结'), hitText);
	assert('/words 关键词搜索不带出无关指纹', !hitText.includes('测试指纹01'), hitText);
	const missText = await cmdAll(env, '/words 根本不存在的词');
	assert('/words 关键词无命中给出专门文案', missText.includes('没有匹配的指纹'), missText);
	assert('/words 无命中文案说明只匹配内容', missText.includes('不匹配来源'), missText);
	// source 不参与匹配是主人定的口径：搜 manual 不该把全库 28 条捞出来。
	const sourceText = await cmdAll(env, '/words manual');
	assert('/words 不搜 source 列', sourceText.includes('没有匹配的指纹'), sourceText);

	// —— LIKE 通配符转义 ——
	const percentText = await cmdAll(env, '/words 50%');
	assert('/words 关键词里的 % 按字面量处理', percentText.includes('共 <b>1</b> 条') && percentText.includes('折扣50%特价'), percentText);
	assert('/words 关键词里的 % 不匹配「折扣500元」', !percentText.includes('折扣500元'), percentText);
	const underscoreText = await cmdAll(env, '/words 折扣5_0');
	assert('/words 关键词里的 _ 按字面量处理', underscoreText.includes('没有匹配的指纹'), underscoreText);

	// —— 按钮翻页 ——
	const firstPage = await cmdAll(env, '/words');
	assert('/words 首页显示第 1/2 页', firstPage.includes('第 1/2 页'), firstPage);
	assert('/words 首页挂上翻页按钮', buttonData().some((d) => d.startsWith('adwords:2:')), JSON.stringify(lastKeyboard()));
	assert('/words 首页无「上一页」按钮', !buttonData().some((d) => d.startsWith('adwords:0:')), JSON.stringify(lastKeyboard()));
	assert('/words 首页带页码展示按钮', buttonData().includes('adwords:noop'), JSON.stringify(lastKeyboard()));
	assert('/words 按钮化后不再留文本翻页提示', !firstPage.includes('翻页：/words'), firstPage);
	const nextData = buttonData().find((d) => d.startsWith('adwords:2:'));

	await click(env, nextData);
	assert('翻页回调编辑原消息而不是发新消息', countCalls('editMessageText') === 1 && countCalls('sendMessage') === 0,
		JSON.stringify(calls.map((c) => c.method)));
	assert('翻页回调编辑后为第 2/2 页', lastEdited().includes('第 2/2 页'), lastEdited());
	assert('翻页回调编辑后仍带按钮', Array.isArray(calls.filter((c) => c.method === 'editMessageText').at(-1)?.body?.reply_markup?.inline_keyboard),
		JSON.stringify(calls.filter((c) => c.method === 'editMessageText').at(-1)?.body));
	assert('翻页回调应答了 callback_query', countCalls('answerCallbackQuery') === 1, JSON.stringify(calls.map((c) => c.method)));

	// 中文关键词要经 base64url 编码塞进 64 字节的 callback_data，再原样解回来。
	const zhFirst = await cmdAll(env, '/words 测试指纹');
	assert('/words 中文关键词搜索命中 25 条', zhFirst.includes('共 <b>25</b> 条'), zhFirst);
	const zhNext = buttonData().find((d) => d.startsWith('adwords:2:'));
	assert('中文关键词 callback_data 未超 64 字节', new TextEncoder().encode(String(zhNext)).length <= 64, String(zhNext));
	await click(env, zhNext);
	assert('中文关键词翻页后关键词未丢', lastEdited().includes('指纹库搜索') && lastEdited().includes('测试指纹'), lastEdited());
	assert('中文关键词翻页后页码正确', lastEdited().includes('第 2/2 页'), lastEdited());
	assert('中文关键词翻页后条数不变', lastEdited().includes('共 <b>25</b> 条'), lastEdited());

	// noop 按钮只应答气泡，不重绘消息。
	await click(env, 'adwords:noop');
	assert('页码展示按钮不编辑消息', countCalls('editMessageText') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('页码展示按钮仍要应答', countCalls('answerCallbackQuery') === 1, JSON.stringify(calls.map((c) => c.method)));

	// 权限：指纹库只给第一主人，拿到转发消息的人点不动。
	await click(env, nextData, 999777);
	assert('非第一主人点翻页被拒', lastAnswer().includes('仅限第一主人'), lastAnswer());
	assert('非第一主人点翻页不编辑消息', countCalls('editMessageText') === 0, JSON.stringify(calls.map((c) => c.method)));

	// 坏数据不能把 worker 打挂。
	await click(env, 'adwords:');
	assert('翻页回调坏数据给出失效提示', lastAnswer().includes('失效'), lastAnswer());

	// —— 文本兜底与老写法 ——
	assert('/words 2 老写法仍按页码解析', (await cmdAll(env, '/words 2')).includes('第 2/2 页'), allSentText());
	assert('/words 关键词 + 页码文本写法可用', (await cmdAll(env, '/words 测试指纹 2')).includes('第 2/2 页'), allSentText());
	assert('/words 关键词 + 页码仍标出关键词', allSentText().includes('指纹库搜索'), allSentText());
}

section('[17] 方案 A · 链接归一化（送 AI 前把 URL 换成语义占位符）');
{
	const N = (t) => W.normalizeAdSemanticText(t);
	const C = (t) => W.adSemanticCoreLength(W.normalizeAdSemanticText(t));

	// —— 三档分类。主人的诉求是「AI 自我学习新的广告 / 不同类型 / 不同特征」，
	// 而 URL 是一条广告身上最独一无二、最不可迁移的部分：一半以上的向量维度被一串
	// 一次性邀请码占着，换个码同一套话术的向量就漂走，学过的样本对它不再相似。
	// 归一化保留形态语义、扔掉随机码，被学进样本库的才是「做单入口 + 私有群邀请链接」这个骨架。
	assert('归一化 · t.me/+ → 私有群邀请链接', N('进群 https://t.me/+XFOCZC0tZxUyODg9 谢谢') === '进群 私有群邀请链接 谢谢', N('进群 https://t.me/+XFOCZC0tZxUyODg9 谢谢'));
	assert('归一化 · joinchat 同判私有', N('联系方式 t.me/joinchat/AAAAAEkk2WdoDrB4-Q8KAg') === '联系方式 私有群邀请链接', N('联系方式 t.me/joinchat/AAAAAEkk2WdoDrB4-Q8KAg'));
	assert('归一化 · t.me/username → telegram链接', N('我的频道 https://t.me/Ybpaytop 欢迎订阅') === '我的频道 telegram链接 欢迎订阅', N('我的频道 https://t.me/Ybpaytop 欢迎订阅'));
	assert('归一化 · 裸写无协议也认', N('裸写 t.me/durov 也要归一化') === '裸写 telegram链接 也要归一化', N('裸写 t.me/durov 也要归一化'));
	assert('归一化 · 其余 http(s) → 外部链接', N('官网 https://example.com/promo?id=9 看看') === '官网 外部链接 看看', N('官网 https://example.com/promo?id=9 看看'));
	assert('归一化 · telegram.dog 变体判私有', N('telegram.dog/+abcdefgh 变体') === '私有群邀请链接 变体', N('telegram.dog/+abcdefgh 变体'));
	assert('归一化 · 带 www. 前缀同样认', N('www.t.me/+abcdefgh 带www') === '私有群邀请链接 带www', N('www.t.me/+abcdefgh 带www'));
	// 替换顺序：私有形态 t.me/+xxx 本身也匹配公开形态 t.me/xxx，先跑公开那条会把它一并吃掉、
	// 分档失效。这条断言就是钉死顺序不许倒。
	assert('归一化 · 私有必须先于公开替换', N('混合：公开 t.me/mychannel 与私有 https://t.me/+zzzzzzzz') === '混合：公开 telegram链接 与私有 私有群邀请链接', N('混合：公开 t.me/mychannel 与私有 https://t.me/+zzzzzzzz'));
	assert('归一化 · 单独私有链接不退化成 telegram链接', N('t.me/+abcdefghij') === '私有群邀请链接', N('t.me/+abcdefghij'));
	assert('归一化 · 空白折叠', N('多  空白\n换行   折叠') === '多 空白 换行 折叠', N('多  空白\n换行   折叠'));
	assert('归一化 · 无链接文本原样通过', N('没有链接的正常简介') === '没有链接的正常简介', N('没有链接的正常简介'));
	assert('归一化 · 空串安全', N('') === '' && N(null) === '' && N(undefined) === '');

	// 幂等：写入端（addAdSample）与拼装端（buildAdSampleText）都套了一层，
	// 不幂等就会出现「过两遍的文本 hash 与过一遍的不同」，纠错端立刻对不上。
	let idempotent = true;
	for (const t of ['进群 https://t.me/+XFOCZC0tZxUyODg9 谢谢', 'a https://x.com/y b', '没有链接', '', 'telegram.dog/+abcdefgh']) {
		if (N(N(t)) !== N(t)) idempotent = false;
	}
	assert('归一化 · 幂等（过两遍等于过一遍）', idempotent);

	// —— core 闸：剥掉占位符后剩多少真正的话术 ——
	// 归一化本身带来一个比原病更凶的新风险：只有链接没有话术的广告，归一化后样本文本
	// 变成纯占位符「私有群邀请链接」。这条样本一旦进库，任何含私有邀请链接的文本相似度都会爆表，
	// 而 AI 层是硬命中即封、不看豁免词也不看总分 —— 等于给每个分享过群链接的人挂了颗雷。
	assert('core · 纯私有链接 = 0', C('https://t.me/+abcdefghijkl') === 0, String(C('https://t.me/+abcdefghijkl')));
	assert('core · 纯 joinchat = 0', C('t.me/joinchat/ABCDEFGHIJ') === 0, String(C('t.me/joinchat/ABCDEFGHIJ')));
	assert('core · 纯外部链接 = 0', C('https://example.com/aaaa') === 0, String(C('https://example.com/aaaa')));
	assert('core · 「进群 + 链接」只剩 2 字', C('进群 https://t.me/+abcdefghijkl') === 2, String(C('进群 https://t.me/+abcdefghijkl')));
	// 漏封那张卡剥链接后还有 20 字、侥幸封住那张 34 字 —— 都远在门槛之上，这道闸只拦纯链接。
	assert('core · 漏封样本剥链接后仍有 20 字', W.adSemanticCoreLength(W.buildAdSampleText({ name: '亚博', bio: '此号不回复！！！24h做单入口: https://t.me/+XFOCZC0tZxUyODg9 💎', text: '' })) === 20);

	// —— 换邀请码后仍是同一条样本（这就是「学一条杀一片」与「学一条杀一条」的分界）——
	const p1 = { name: '亚博', bio: '此号不回复！！！24h做单入口: https://t.me/+XFOCZC0tZxUyODg9 💎', text: '' };
	const p1b = { name: '亚博', bio: '此号不回复！！！24h做单入口: https://t.me/+QQQQQQQQQQQQQQQQ 💎', text: '' };
	assert('样本文本 · 换邀请码后文本相同', W.buildAdSampleText(p1) === W.buildAdSampleText(p1b), W.buildAdSampleText(p1b));
	assert('样本文本 · 换邀请码后 hash 相同', W.adTextHash(W.buildAdSampleText(p1)) === W.adTextHash(W.buildAdSampleText(p1b)));
	assert('样本文本 · 已含占位符而非原始 URL', W.buildAdSampleText(p1).includes('私有群邀请链接') && !W.buildAdSampleText(p1).includes('t.me'), W.buildAdSampleText(p1));

	// —— 写入 / 删除的对称性（存量兼容）——
	// 库里同时存在两代样本：改动前按未归一化原文算 hash、改动后按归一化文本算 hash。
	// removeAdSampleByText 双 hash 试删就是为了两代都能删掉 —— /ignore 删不掉样本的后果最重
	// （AI 层硬命中即封），主人「误封之后我再修改」这条路会直接断掉。
	const envS = makeEnv();
	const RAW = '亚博 此号不回复！！！24h做单入口: https://t.me/+XFOCZC0tZxUyODg9 💎';
	// 先随便写一条把 D1 迁移跑起来（addAdSample 内部会 await adDetectionReady）。
	await W.addAdSample(envS, '预热用的一段足够长的广告话术样本', { source: 'manual' });
	// 手工塞一行【改动前形态】：text_hash 按未归一化原文算。
	await envS.DB.prepare('INSERT INTO ad_sample_embeddings (text_hash, sample_text, embedding, dimension, source, created_at) VALUES (?, ?, NULL, NULL, ?, ?)')
		.bind(W.adTextHash(RAW), RAW, 'auto', 1).run();
	assert('存量兼容 · 旧形态样本已在库', envS.DB.query('SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE source = \'auto\'')[0].c === 1);
	const rmOld = await W.removeAdSampleByText(envS, RAW);
	assert('存量兼容 · 旧形态样本按原文 hash 删得掉', rmOld.ok && rmOld.removed === 1, JSON.stringify(rmOld));

	// 新形态：addAdSample 存的是归一化文本，removeAdSampleByText 用归一化 hash 删。
	const addNew = await W.addAdSample(envS, RAW, { source: 'auto' });
	assert('新形态 · addAdSample 存的是归一化文本', addNew.ok && addNew.added && addNew.text.includes('私有群邀请链接'), JSON.stringify(addNew));
	assert('新形态 · 库里存的也是归一化文本', envS.DB.query('SELECT sample_text FROM ad_sample_embeddings WHERE source = \'auto\'')[0]?.sample_text?.includes('私有群邀请链接'));
	// 关键：拿【另一个邀请码】的原文也能删掉 —— 归一化后是同一个 hash。
	const rmNew = await W.removeAdSampleByText(envS, '亚博 此号不回复！！！24h做单入口: https://t.me/+ZZZZZZZZZZZZZZZZ 💎');
	assert('新形态 · 换邀请码的原文同样删得掉', rmNew.ok && rmNew.removed === 1, JSON.stringify(rmNew));

	// core 闸在写入端拦住纯链接样本。
	const addPureLink = await W.addAdSample(envS, 'https://t.me/+abcdefghijkl', { source: 'auto' });
	assert('core 闸 · 纯私有链接拒收', addPureLink.ok === false && addPureLink.reason === 'no_core', JSON.stringify(addPureLink));
	const addPureExternal = await W.addAdSample(envS, 'https://example.com/aaaaaaaa', { source: 'auto' });
	assert('core 闸 · 纯外部链接拒收', addPureExternal.ok === false && addPureExternal.reason === 'no_core', JSON.stringify(addPureExternal));
	const addShortCore = await W.addAdSample(envS, '进群 https://t.me/+abcdefghijkl', { source: 'auto' });
	assert('core 闸 · 「进群 + 链接」只剩 2 字也拒收', addShortCore.ok === false && addShortCore.reason === 'no_core', JSON.stringify(addShortCore));
	const addRealAd = await W.addAdSample(envS, RAW, { source: 'auto' });
	assert('core 闸 · 真广告（剥链接后 20 字）照收', addRealAd.ok && addRealAd.added, JSON.stringify(addRealAd));
	// 太短仍走原来的 too_short，两道闸各管一头。
	assert('长度闸 · 整条太短仍报 too_short', (await W.addAdSample(envS, 'ab', { source: 'auto' })).reason === 'too_short');

	// 种子样本永不删（与指纹种子同一个道理：补灌判空看条数，删一条就永不回来）。
	const seedRm = await W.removeAdSampleByText(envS, '💚高价收网赚号💚 长期收购网 du 商宝账号，老账号优先加价');
	assert('种子样本 · 双 hash 也删不动 seed', seedRm.ok && seedRm.removed === 0, JSON.stringify(seedRm));
}

section('[18] 方案 C · 私有群邀请链接单独计分（不动主人指定的 t.me 豁免本身）');
{
	// 主人指定 't.me' 进 AD_EXEMPT_KEYWORDS 是对的（「正常用户大部分都会使用这个」），
	// 本次改动一个字都不动它。问题在它【不区分形态】，于是从「不算证据」变成了「-3 分护身符」：
	// 两张真实资料卡在结构查杀四通道全放行之后，评分层唯一的分项就是「-3 命中豁免词：t.me」。
	const priv = (t) => W.hasAdPrivateInviteLink(t);
	const pub = (t) => W.hasAdPublicTelegramLink(t);
	assert('形态 · t.me/+ 判私有', priv('https://t.me/+XFOCZC0tZxUyODg9') === true && pub('https://t.me/+XFOCZC0tZxUyODg9') === false);
	assert('形态 · joinchat 判私有', priv('t.me/joinchat/AAAAAEkk2Wdo') === true && pub('t.me/joinchat/AAAAAEkk2Wdo') === false);
	assert('形态 · telegram.dog/+ 判私有', priv('telegram.dog/+abcdefgh') === true);
	assert('形态 · t.me/username 判公开', priv('https://t.me/Ybpaytop') === false && pub('https://t.me/Ybpaytop') === true);
	assert('形态 · 裸写 t.me/durov 判公开', priv('t.me/durov') === false && pub('t.me/durov') === true);
	assert('形态 · 无链接两者皆假', priv('联系 @somebody 没有链接') === false && pub('联系 @somebody 没有链接') === false);
	assert('形态 · 公开与私有同现时两者皆真', priv('公开 t.me/mychannel 私有 t.me/+zzzzzzzz') === true && pub('公开 t.me/mychannel 私有 t.me/+zzzzzzzz') === true);
	// 邀请码下限 5 字符：不把半截链接或手打的 t.me/+86 电话号误当邀请码。
	assert('形态 · t.me/+86 不算邀请码', priv('t.me/+86') === false);
	assert('形态 · 半截 t.me/+ 不算邀请码', priv('t.me/+') === false);
	// 公开判定必须先剥掉私有形态，否则 t.me/+abc 本身也长得像 t.me/xxx，永远返回 true。
	assert('形态 · 公开判定先剥私有（否则恒真）', pub('只有 t.me/+abcdefghij 一条') === false);

	// —— 评分：两张真实卡从 PASS（-3）直接撞封禁线 ——
	const IMG1 = { first_name: '亚博', username: 'fsx1ynfv', bio: '此号不回复！！！24h做单入口: https://t.me/+XFOCZC0tZxUyODg9 💎' };
	const IMG2 = { first_name: '浅渡山河 K', username: 'vk8nn2ew30', bio: 'lj来米快，急需钱的兄弟来找我带，不头不按，链接进群：https://t.me/+ieMc-5jAwVcxZjA0 HE' };
	const s1 = W.scoreAdProfile(IMG1);
	const s2 = W.scoreAdProfile(IMG2);
	// 改动前这两张卡都是 -3（唯一分项就是 t.me 豁免）；2026-09-09 第二轮分值 5→7 后撞封禁线。
	assert('评分 · 漏封那张从 -3 变 7 分', s1.score === 7, s1.score + ' | ' + s1.reasons.join(' / '));
	assert('评分 · 侥幸封住那张同样 7 分', s2.score === 7, s2.score + ' | ' + s2.reasons.join(' / '));
	assert('评分 · 7 分 = 封禁线，直接封', s1.score >= 7);
	assert('评分 · reasons 写明私有邀请链接', s1.reasons.some((r) => r.includes('私有群一次性邀请链接')), s1.reasons.join(' / '));
	assert('评分 · reasons 写明不吃 t.me 豁免', s1.reasons.some((r) => r.includes('不吃') && r.includes('t.me')), s1.reasons.join(' / '));
	assert('评分 · 豁免真的没减分（分项里没有「命中豁免词」）', !s1.reasons.some((r) => r.startsWith('-3 命中豁免词')), s1.reasons.join(' / '));

	// —— 误封面：正常用户与技术群主必须仍然 PASS ——
	// 只放公开频道链接的人一分不加，豁免照吃（这正是主人加 t.me 豁免要保护的那类人）。
	const okPublic = W.scoreAdProfile({ first_name: '张三', username: 'zhangsan', bio: '我的频道 https://t.me/mychannel 分享摄影作品' });
	assert('误封面 · 只放公开频道链接仍吃满豁免 -3', okPublic.score === -3, okPublic.score + ' | ' + okPublic.reasons.join(' / '));
	assert('误封面 · 只放公开链接不触发私有加分', !okPublic.reasons.some((r) => r.includes('私有群一次性邀请链接')), okPublic.reasons.join(' / '));
	// 公开 + 私有 + 技术词同现：主人在简介里同时写公开频道和备用私有群 ——
	// 豁免不放行是因为简介里有 vless/reality/教程 这些技术词撑着（-3 吃满），
	// 私有分 +7 被抵成 4 分，仍 PASS。公开链接那条【没有】单独放行，
	// 真正分流的是技术词，不是公开/私有的形态区分。
	const okBoth = W.scoreAdProfile({ first_name: '老王', username: 'laowang', bio: '本群公开频道 t.me/proxychan，备用群 t.me/+abcdefghij，vless/reality 教程' });
	assert('误封面 · 公开+私有+技术词同现仍 PASS', okBoth.score < 7, okBoth.score + ' | ' + okBoth.reasons.join(' / '));
	assert('误封面 · 公开+私有+技术词豁免照吃（-3 命中豁免词）', okBoth.reasons.some((r) => r.startsWith('-3 命中豁免词')), okBoth.reasons.join(' / '));
	assert('误封面 · 公开+私有同现不剔 t.me 豁免', !okBoth.reasons.some((r) => r.includes('不吃')), okBoth.reasons.join(' / '));
	// 只有私有链接、但简介里有技术豁免词的技术群主：+7 被 -3 抵成 4 分，仍 PASS。
	const okTech = W.scoreAdProfile({ first_name: '老王', username: 'laowang', bio: 'CDN 技术交流，进群 t.me/+abcdefghij' });
	assert('误封面 · 技术群主（有技术豁免词）仍 PASS', okTech.score < 7, okTech.score + ' | ' + okTech.reasons.join(' / '));
	assert('误封面 · 技术群主豁免照吃（-3 命中豁免词）', okTech.reasons.some((r) => r.startsWith('-3 命中豁免词')), okTech.reasons.join(' / '));
	assert('误封面 · 无链接的正常资料仍 0 分', W.scoreAdProfile({ first_name: '李四', username: 'lisi', bio: '喜欢摄影和旅行' }).score === 0);

	// 【真实存在的误封面，如实钉死在测试里】只放私有邀请链接、又没有任何技术词的人
	// （社群运营 / 读书会 / 拼团群主）在 7 分下【直接封】。主人已明确接受：
	// 「E 虽然会误封。但是可以判断 误封之后我再修改。」误封后 /ignore 回滚，样本与指纹都删得掉。
	// 这是 5→7 的代价，不藏。
	const bizOps = W.scoreAdProfile({ first_name: '小美', username: 'xiaomei', bio: '读书会成员进群 t.me/+abcdefghij' });
	assert('已知误报面 · 纯私有链接无技术词 → 7 分直接封', bizOps.score >= 7, bizOps.score + ' | ' + bizOps.reasons.join(' / '));
	assert('已知误报面 · 分项就是私有邀请链接 + 剔豁免', bizOps.reasons.some((r) => r.includes('私有群一次性邀请链接')) && bizOps.reasons.some((r) => r.includes('不吃')), bizOps.reasons.join(' / '));
	// 加一个真实豁免词（cdn 在 AD_EXEMPT_KEYWORDS 表内）立即回到 PASS —— 分流器活着的证据。
	// 【刻意的边界说明】「交流cd」这种夹着的 c/d 不算豁免词，它不在表里 ——
	// 豁免靠的是完整词条命中，不是子串，所以「cd」「交流cd」都救不了这张卡。这是设计而非缺陷。
	const bizOpsCdn = W.scoreAdProfile({ first_name: '小美', username: 'xiaomei', bio: '读书会成员进群 t.me/+abcdefghij 欢迎交流cdn' });
	assert('误封面 · 纯私有链接 + 真实豁免词 cdn 立即回 PASS', bizOpsCdn.score < 7, bizOpsCdn.score + ' | ' + bizOpsCdn.reasons.join(' / '));
	assert('误封面 · cdn 命中豁免（-3 命中豁免词）', bizOpsCdn.reasons.some((r) => r.startsWith('-3 命中豁免词')), bizOpsCdn.reasons.join(' / '));
	// 而「交流cd」（c/d 非表内词）救不了 —— 钉死「完整词条才豁免」的语义。
	assert('误封面 · 「交流cd」不是豁免词，仍 7 分', W.scoreAdProfile({ first_name: '小美', username: 'xiaomei', bio: '读书会成员进群 t.me/+abcdefghij 欢迎交流cd' }).score >= 7);

	// —— 正文一个字都没动（本次授权只覆盖资料卡）——
	const bodyPriv = W.scoreAdMessageText('进群 https://t.me/+abcdefghij');
	assert('正文 · 私有链接不计分（与改动前逐字一致）', bodyPriv.score === -3, bodyPriv.score + ' | ' + bodyPriv.reasons.join(' / '));
	assert('正文 · 不出现私有邀请链接分项', !bodyPriv.reasons.some((r) => r.includes('私有群一次性邀请链接')), bodyPriv.reasons.join(' / '));

	// —— 累积误封的根治点仍然有效 ——
	// 7 分加在 scoreAdProfile（静态资料分）里，而观察窗口留存的是 retainScore = max(0, behaviorScore)，
	// behaviorScore 只含正文 / 上下文 / 转发分。所以这 7 分不进历史分 ——
	// 这正是 @MiLov1900 两次被误封的机制所依赖的「总分进历史、再叠一份」，此路已封死。
	// （7 分下命中即封、不再走 observe，写入筛查表这条路径只在 observe 分支出现，
	//  所以这里不做「观察记录不含资料分」的端到端断言——那属于 observe 路径，仍由既有测试覆盖。）

	// —— 端到端：真用户进群、bio 含纯私有链接（无技术词）→ 直接封 ——
	// 这是 5→7 的核心兑现：图 1 那一类「昵称+广告简介、链接是私有群邀请码」的号，
	// 现在进群那一刻就被封，不再「永远漏」。仿照 [1] 段广告号进群的判定链路，
	// getChat 返回 bio（检测端靠它拿资料卡简介）。
	const envP = makeEnv();
	resetCalls();
	setApi({
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '小美', bio: '读书会成员进群 t.me/+abcdefghij' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: [] })
	});
	await sendUpdate({ message: joinMessage([{ id: 60002, first_name: '小美' }]) }, envP);
	assert('端到端 · 纯私有链接进群即封', countCalls('banChatMember') >= 1, JSON.stringify(calls.filter((c) => c.method === 'banChatMember').map((c) => c.body)));
	assert('端到端 · 写入黑名单 reason = ad_auto', envP.DB.query("SELECT reason FROM blacklist WHERE id = '60002'")[0]?.reason === 'ad_auto', JSON.stringify(envP.DB.query('SELECT id, reason FROM blacklist')));
	assert('端到端 · 观察窗口不留残留（命中即封不写筛查表）', envP.DB.query('SELECT COUNT(*) AS c FROM ad_user_screening')[0].c === 0);
	// 对照组：技术群主（bio 带 cdn 撑豁免）进群不封 —— 分流器端到端活着。
	const envQ = makeEnv();
	resetCalls();
	setApi({
		getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '老王', bio: 'CDN 技术交流，进群 t.me/+abcdefghij' } }),
		getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }),
		getChatAdministrators: () => ({ ok: true, result: [] })
	});
	await sendUpdate({ message: joinMessage([{ id: 60003, first_name: '老王' }]) }, envQ);
	assert('端到端 · 技术群主（cdn 撑豁免）进群不封', countCalls('banChatMember') === 0, JSON.stringify(calls.map((c) => c.method)));
	assert('端到端 · 技术群主不进黑名单', envQ.DB.query('SELECT COUNT(*) AS c FROM blacklist')[0].c === 0);
}

section('[19] 方案 E · 短语自我泛化（共现提炼成指纹 + 三重闸 + 检查点）');
{
	// 每次调用都全新检查点，从空的 ad_scan_state 开始。
	const mkEnv = () => {
		const env = makeEnv({ AD_ENRICH_EVERY: '5', AD_ENRICH_MIN_OCCURRENCE: '2', AD_ENRICH_MAX_RESULTS: '20' });
		return env;
	};
	// 往样本库直接插入一批文本（绕过 addAdSample 的长度/归一化，专测提炼本身）。
	const inject = async (env, texts, source = 'spam') => {
		const now = Math.floor(Date.now() / 1000);
		for (const text of texts) {
			const hash = W.adTextHash(text);
			await env.DB.prepare(
				'INSERT INTO ad_sample_embeddings (text_hash, sample_text, embedding, dimension, source, created_at) VALUES (?, ?, NULL, NULL, ?, ?)'
			).bind(hash, text.slice(0, 500), source, now).run();
		}
	};
	const countEnriched = (env) => env.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'auto' AND created_by = 'enrich'")[0].c;
	const findPhrase = (env, phrase) => env.DB.query("SELECT type, weight, source, created_by FROM ad_fingerprints WHERE value = ?", phrase)[0];

	// ---- 场景 1：共现 >=2 且有强动词 → 提炼成 keyword 指纹 ----
	{
		const env = mkEnv();
		await W.adDetectionReady(env);
		// 【短语刻意避开 AD_FINGERPRINT_SEED】早先这里用的是「长期收购各类账号」，那是种子
		// 指纹（source='seed'），upsert 的 CASE 会保留 seed，断言 source==='auto' 永远不可能
		// 成立。改用「专业收购游戏号」——「专业收」「收购」都在 AD_TRADE_VERBS，过得了闸，
		// 又不在任何种子表里，才测得出「新学」这件事本身。
		await inject(env, [
			'专业收购游戏号 私聊秒结不拖欠',
			'专业收购游戏号 价格好商量',
			'专业收购游戏号 需要的来',
			'专业收购游戏号 一手货源',
			'专业收购游戏号 当天结清'
		]);
		const result = await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		assert('E1 提炼返回 learned>0', result.learned > 0, JSON.stringify(result));
		const row = findPhrase(env, '专业收购游戏号');
		assert('E1 共现短语被学成指纹', Boolean(row), JSON.stringify(env.DB.query("SELECT value, source FROM ad_fingerprints WHERE source='auto'")));
		assert('E1 指纹类型 keyword', row?.type === 'keyword', JSON.stringify(row));
		assert('E1 来源 auto 且 created_by enrich', row?.source === 'auto' && row?.created_by === 'enrich', JSON.stringify(row));
		assert('E1 权重为 0.8（与封禁线一致）', Math.abs(Number(row?.weight) - 0.8) < 1e-9, JSON.stringify(row));
		// 独有后缀不该被学（共现不足 2 次）：「当天结清」虽含强动词「当天结」，但只出现 1 次。
		assert('E1 独有后缀不学（共现不足）', env.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE value = '当天结清'")[0].c === 0);
	}

	// ---- 场景 2：纯豁免词（无强动词）即使共现也不学 ----
	{
		const env = mkEnv();
		await W.adDetectionReady(env);
		// 「代理官方中文」命中豁免词（代理），但既无强动词也无业务词 → 闸 1 丢弃。
		await inject(env, [
			'代理官方中文 双向机器人',
			'代理官方中文 开源工具',
			'代理官方中文 通知订阅',
			'代理官方中文 文档教程',
			'代理官方中文 下载备份'
		]);
		const result = await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		assert('E2 纯豁免词共现仍不学', result.learned === 0, JSON.stringify(result));
		assert('E2 未入库为 fingerprint', findPhrase(env, '代理官方中文') === undefined, JSON.stringify(env.DB.query('SELECT value FROM ad_fingerprints')));
	}

	// ---- 场景 3：无强动词也无业务词（纯技术招待语）即使共现也不学 ----
	{
		const env = mkEnv();
		await W.adDetectionReady(env);
		// 「欢迎进群」共现 5 次，但既无强交易动词也无业务关键词 → 闸 2 丢弃。
		await inject(env, [
			'欢迎进群 大家好',
			'欢迎进群 一起交流',
			'欢迎进群 多多关照',
			'欢迎进群 很高兴认识',
			'欢迎进群 有什么问题'
		]);
		const result = await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		assert('E3 无广告语义词不学', result.learned === 0, JSON.stringify(result));
		assert('E3 欢迎进群未入库', findPhrase(env, '欢迎进群') === undefined, JSON.stringify(env.DB.query('SELECT value FROM ad_fingerprints')));
	}

	// ---- 场景 4：形态闸 —— 含 emoji 的样本整体不参与提炼（F2）----
	{
		const env = mkEnv();
		await W.adDetectionReady(env);
		// 「收购🔞USDT」本来能切出干净窗口「USDT」（无 emoji，仅 1 个 emoji 的父串），
		// 现改为窗口级 emoji 闸 + 样本级整条跳过：只要样本含 emoji，就完全不产生候选。
		await inject(env, [
			'收购\u{1F51E}USDT 一手货源',
			'收购\u{1F51E}USDT 价格好',
			'收购\u{1F51E}USDT 秒结',
			'收购\u{1F51E}USDT 量大从优',
			'收购\u{1F51E}USDT 长期'
		]);
		const result = await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		assert('E4 含 emoji 不学', result.learned === 0, JSON.stringify(result));
		assert('E4 未入库', env.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE value LIKE '%USDT%'")[0].c === 0);
	}

	// ---- 场景 5：样本数不足触发线 → pending，不推进检查点 ----
	{
		const env = mkEnv();
		await W.adDetectionReady(env);
		await inject(env, ['专业收购游戏号 私聊', '专业收购游戏号 秒结']);
		const result = await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		assert('E5 样本不足报 pending', result.reason === 'pending', JSON.stringify(result));
		const checkpoint = await W.readAdScanState(env, 'ad_enrich_checkpoint', '0');
		assert('E5 检查点未推进', checkpoint === '0' || checkpoint === '', JSON.stringify(checkpoint));
	}

	// ---- 场景 6：检查点推进 —— 第二批样本不再重扫第一批 ----
	{
		const env = mkEnv();
		await W.adDetectionReady(env);
		await inject(env, ['专业收购游戏号 私聊秒结不拖欠']);
		// 1 条 < 5，不触发，检查点仍 0。
		await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		const cp1 = await W.readAdScanState(env, 'ad_enrich_checkpoint', '0');
		assert('E6 第一批不足时检查点 0', cp1 === '0', JSON.stringify(cp1));
		// 补到 5 条，第二次触发；第一条已含「专业收购游戏号」，与后 4 条共现则学。
		await inject(env, [
			'专业收购游戏号 一手货源',
			'专业收购游戏号 价格好商量',
			'专业收购游戏号 需要的来',
			'专业收购游戏号 当天结清'
		]);
		const result2 = await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		assert('E6 第二批触发提炼', result2.learned > 0, JSON.stringify(result2));
		// 检查点应推进到这批的最大 id（不再等于 0）。
		const cp2 = await W.readAdScanState(env, 'ad_enrich_checkpoint', '0');
		assert('E6 检查点已推进', Number(cp2) > 0, JSON.stringify(cp2));
	}

	// ---- 场景 7：环境变量关闭（AD_ENRICH_EVERY=0）→ 提炼完全关闭 ----
	{
		const env = makeEnv({ AD_ENRICH_EVERY: '0', AD_ENRICH_MIN_OCCURRENCE: '2' });
		await W.adDetectionReady(env);
		await inject(env, ['专业收购游戏号 私聊', '专业收购游戏号 秒结', '专业收购游戏号 一手', '专业收购游戏号 价格', '专业收购游戏号 大量']);
		const result = await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		assert('E7 AD_ENRICH_EVERY=0 时关闭', result.reason === 'disabled', JSON.stringify(result));
		assert('E7 未入库', countEnriched(env) === 0);
	}

	// ---- 场景 8：/spam 集成 —— 真实引用 spam 攒够 5 条样本后自动提炼 ----
	{
		const env = makeEnv({ AD_ENRICH_EVERY: '5', AD_ENRICH_MIN_OCCURRENCE: '2' });
		await W.adDetectionReady(env);
		// 每个 /spam 目标都带「专业收购游戏号」昵称，且正文都含这句 —— 5 条样本共现。
		// （取材是「昵称 + bio + 正文」三段拼，两段都放同一句，确保共现稳定成立。）
		W.invalidateAdProfileCache();
		resetCalls();
		setApi({
			getChat: (body) => ({ ok: true, result: { id: body?.chat_id, first_name: '专业收购游戏号', bio: '' } }),
			getChatMember: (body) => ({ ok: true, result: { status: 'member', user: { id: body?.user_id } } }),
			getChatAdministrators: () => ({ ok: true, result: [] }),
			banChatMember: () => ({ ok: true, result: true }),
			deleteMessage: () => ({ ok: true, result: true })
		});
		for (let i = 0; i < 5; i++) {
			const uid = 93010 + i;
			await sendUpdate({
				message: groupMessage({ id: OWNER_ID, first_name: 'Owner' }, '/spam 违规出售账号', {
					reply_to_message: {
						message_id: 700 + i,
						date: Math.floor(Date.now() / 1000),
						chat: { id: Number(GROUP_ID), type: 'supergroup', title: '测试治理群' },
						from: { id: uid, is_bot: false, first_name: '专业收购游戏号' },
						text: '专业收购游戏号 编号' + (i + 1)
					}
				})
			}, env);
		}
		// 提炼应已在第 5 条触发，并向 auto 指纹库写入至少一条滑窗子短语。
		// 注意：「专业收购游戏号」本身会被 learnAdFingerprints（/spam 正常学习路径）以
		// source='spam' 先入库；enrichment upsert 时 CASE 保护现有 source，所以不能用
		// findPhrase(...).source === 'auto' 来验证 enrichment —— 要改查 countEnriched。
		// 滑窗会切出「专业收购」「收购游戏」等子短语（均含强动词、通过闸），这些不在
		// learnAdFingerprints 的直接学习路径里，会以 source='auto' 新入库。
		const enrichedBefore = countEnriched(env);
		// enrichment 是在第 5 条 /spam 内触发的，所以此时已经跑完。
		assert('E8 /spam 攒满 5 条自动提炼', enrichedBefore > 0, JSON.stringify(env.DB.query("SELECT value, source, created_by FROM ad_fingerprints WHERE source='auto'")));
		assert('E8 集成产物为 auto + enrich', enrichedBefore > 0, JSON.stringify(env.DB.query("SELECT value, source, created_by FROM ad_fingerprints WHERE source='auto'")));
		assert('E8 回执告知共性提炼', allSentText().includes('共性提炼'), allSentText().slice(-800));
	}

	// ---- 场景 9：种子样本【不】参与提炼（缺陷回归）----
	// 修复前：取样本的 SELECT 没过滤 source，seedAdDetectionData 灌进来的 31 条种子样本
	// （seed 10 + seed-core 21）全部 id>0，checkpoint=0 时被当新样本互相共现 ——
	// 一条 /spam 样本都没有就能炼出 10 条候选、入库 7 条 auto 指纹。
	{
		const env = mkEnv();
		await W.adDetectionReady(env);
		const seedCount = env.DB.query("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE source IN ('seed','seed-core')")[0].c;
		assert('E9 建表后确有种子样本（前提成立）', seedCount > 0, JSON.stringify(seedCount));
		// 一条 spam 样本都不注入，直接提炼。
		const result = await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		assert('E9 只有种子时不触发提炼', result.learned === 0 && result.reason === 'pending', JSON.stringify(result));
		assert('E9 未产出任何 auto 指纹', countEnriched(env) === 0, JSON.stringify(env.DB.query("SELECT value FROM ad_fingerprints WHERE source='auto'")));
	}

	// ---- 场景 10：归一化后不足 4 字的短语不入库（缺陷回归）----
	// 修复前：窗口「收购网 」（4 码点，含尾空格）过得了切词端的长度闸，但
	// normalizeAdFingerprintValue 会 trim 掉尾空格，落库变成 3 字的「收购网」，
	// 而 AD_ENRICH_WEIGHT(0.8) == AD_FINGERPRINT_BAN_WEIGHT 是命中即封 ——
	// 「我在收购网站上买的」这类正常发言会被子串匹配直接封禁。
	{
		const env = mkEnv();
		await W.adDetectionReady(env);
		await inject(env, [
			'收购网 du商宝账号 一手',
			'收购网 du商宝账号 秒结',
			'收购网 du商宝账号 价好',
			'收购网 du商宝账号 长期',
			'收购网 du商宝账号 大量'
		]);
		const result = await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		assert('E10 仍能提炼出足够长的短语', result.learned > 0, JSON.stringify(result));
		assert('E10 三字「收购网」不入库', env.DB.query("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE value = '收购网'")[0].c === 0,
			JSON.stringify(env.DB.query("SELECT value FROM ad_fingerprints WHERE source='auto'")));
		// 兜底：任何 auto 指纹的码点长度都不得低于 4。
		const shortOnes = env.DB.query("SELECT value FROM ad_fingerprints WHERE source='auto' AND created_by='enrich'")
			.filter((r) => Array.from(String(r.value)).length < 4);
		assert('E10 全部 auto 指纹长度 >=4', shortOnes.length === 0, JSON.stringify(shortOnes));
	}

	// ---- 场景 11：种子指纹不被 auto 覆盖（upsert 保护）----
	// 「长期收购各类账号」本就是 AD_FINGERPRINT_SEED 里的种子（source='seed', weight=1）。
	// 即使它在 /spam 样本里反复共现被提炼命中，upsert 的
	// `source = CASE WHEN excluded.source='manual' THEN 'manual' ELSE source END`
	// 也必须保住 seed —— 否则种子会被降权到 0.8，且丢掉 /ignore 退役机制的来源判据。
	{
		const env = mkEnv();
		await W.adDetectionReady(env);
		const before = findPhrase(env, '长期收购各类账号');
		assert('E11 前提：该短语是种子指纹', before?.source === 'seed' && Math.abs(Number(before?.weight) - 1) < 1e-9, JSON.stringify(before));
		await inject(env, [
			'长期收购各类账号 私聊秒结不拖欠',
			'长期收购各类账号 价格好商量',
			'长期收购各类账号 需要的来',
			'长期收购各类账号 一手货源',
			'长期收购各类账号 当天结清'
		]);
		const result = await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		assert('E11 提炼确实跑到了', result.learned > 0, JSON.stringify(result));
		const after = findPhrase(env, '长期收购各类账号');
		assert('E11 种子来源不被改写', after?.source === 'seed', JSON.stringify(after));
		assert('E11 种子权重不被降到 0.8', Math.abs(Number(after?.weight) - 1) < 1e-9, JSON.stringify(after));
		assert('E11 种子 created_by 仍为 system', after?.created_by === 'system', JSON.stringify(after));
	}

	// ---- 场景 12：enrich 指纹实战命中 + 误报回滚（端到端）----
	// 前面 E1~E11 只验证了「学进去」「不被 seed 覆盖」「长度/来源保护」，唯独没有一条验证
	// 学出来的 enrich 指纹【真正参与判定流程】：能被 matchAdFingerprints 命中、权重达封禁线，
	// 且误报时能按设计被整批清除。这一条补上方案 E 的逻辑闭环。
	{
		const env = mkEnv();
		await W.adDetectionReady(env);
		// 先提炼出「专业收购游戏号」auto 指纹（权重 0.8 + 滑窗子短语若干）。
		await inject(env, [
			'专业收购游戏号 私聊秒结不拖欠',
			'专业收购游戏号 价格好商量',
			'专业收购游戏号 需要的来',
			'专业收购游戏号 一手货源',
			'专业收购游戏号 当天结清'
		]);
		const enrichResult = await W.enrichAdCommonPhrases(env, W.loadAdDetectionConfig(env), {});
		assert('E12 前提：提炼已产生 auto 指纹', enrichResult.learned > 0, JSON.stringify(enrichResult));
		const before = findPhrase(env, '专业收购游戏号');
		assert('E12 前提：核心短语是 enrich 产物', before?.source === 'auto' && before?.created_by === 'enrich', JSON.stringify(before));

		// —— 实战命中：一条含该短语的正文（不含资料里可能带出的其它词）——
		const payload = { name: '陌生号', username: '', bio: '', text: '专业收购游戏号 私聊秒结不拖欠', domains: [] };
		const matched = await W.matchAdFingerprints(env, payload, {});
		const hit = matched.hits.find((h) => h.value === '专业收购游戏号');
		assert('E12 实战命中：核心短语被指纹库命中', Boolean(hit), JSON.stringify(matched.hits.map((h) => h.value)));
		assert('E12 实战命中：权重达封禁线 0.8', hit?.weight >= 0.8, JSON.stringify(hit));
		assert('E12 实战命中：maxWeight 达封禁线', matched.maxWeight >= 0.8, JSON.stringify(matched));

		// —— 误报回滚：markAdFingerprintFalsePositive 走「即删」档（purge=true，即 /ignore 的
		//    批量删除路径），enrich 产物 source='auto' 非 seed 非 manual → 应整批清除。
		const rollback = await W.markAdFingerprintFalsePositive(env, payload, { purge: true });
		assert('E12 误报回滚：确有指纹被清', rollback.retired > 0, JSON.stringify(rollback));
		const after = findPhrase(env, '专业收购游戏号');
		assert('E12 误报回滚：核心短语已被删除', !after || after.source !== 'auto' || after.created_by !== 'enrich', JSON.stringify(after));
	}

	// ---- 场景 13：seed 指纹在回滚时只计数、不即删（/ignore 退役机制）----
	// E12 证明 enrich 产物会被即删；这一条对应「种子是铁证，不随一次误报消失」的另一半：
	// seed 指纹被误报时 false_positive_count 累加，但保留在库（直到 confidence<0.2 且
	// fp_count>=3 才自动退役）。这层保护能避免把种子误删后，同款广告重新漏进来。
	{
		const env = mkEnv();
		await W.adDetectionReady(env);
		const before = findPhrase(env, '长期收购各类账号');
		assert('E13 前提：该短语是种子指纹', before?.source === 'seed' && Math.abs(Number(before?.weight) - 1) < 1e-9, JSON.stringify(before));
		const payload = { name: '', username: '', bio: '', text: '长期收购各类账号 私聊秒结不拖欠', domains: [] };
		const rollback = await W.markAdFingerprintFalsePositive(env, payload, { purge: true });
		assert('E13 回滚：确有命中记录', rollback.affected > 0, JSON.stringify(rollback));
		const after = findPhrase(env, '长期收购各类账号');
		assert('E13 种子不被即删', Boolean(after), JSON.stringify(after));
		assert('E13 种子来源/权重不受影响', after?.source === 'seed' && Math.abs(Number(after?.weight) - 1) < 1e-9, JSON.stringify(after));
		const stat = env.DB.query("SELECT fingerprint, false_positive_count FROM ad_fingerprints WHERE value = '长期收购各类账号'")[0];
		assert('E13 种子误报计数已累加', Number(stat?.false_positive_count) >= 1, JSON.stringify(stat));
		assert('E13 种子仍保system', after?.created_by === 'system', JSON.stringify(after));
	}
}

// ---- 场景 14：P1「单词不封」回归 —— 裸业务词指纹单命中不构成封禁，组合/种子照封 ----
// 2026-09-09 主人：「USDT 无论大小写，单个都不会封禁用户；但如果是广告肯定不止说一个
// USDT，所以可以联合其他广告词执行封禁，单词不封。」
// 实现：loadAdFingerprints 给「归一化后恰等于单个业务关键词」的指纹打 singleWord=true，
// fingerprintBan 改为看 nonSingleMaxWeight —— 裸业务词命中只计分、不单独定罪。
{
	// 本块在 section 19 作用域外，section 19 的 mkEnv//inject 为块内局部函数拿不到，
	// 这里只用模块级 makeEnv 建库（本块不需要 inject）。
	const env = makeEnv({ AD_ENRICH_EVERY: '5', AD_ENRICH_MIN_OCCURRENCE: '2', AD_ENRICH_MAX_RESULTS: '20' });
	await W.adDetectionReady(env);
	// 塞一条裸业务词指纹 value='usdt'（模拟 /spam 学到的裸词，weight 0.8 达旧封禁线）。
	const now = Math.floor(Date.now() / 1000);
	const key = W.adFingerprintKey('keyword', 'usdt');
	await env.DB.prepare(
		'INSERT OR IGNORE INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_by, created_at, updated_at) VALUES (?, ?, ?, 0.8, 1, 0, 1, ?, ?, ?, ?)'
	).bind(key, 'keyword', 'usdt', 'spam', 'manual', now, now).run();

	// —— 1) 仅 USDT 大小写：指纹命中但 singleWord=true，不构成指纹级封禁；无招揽动词，
	//        结构通道（body/identity）也不封 → verdict 必须不是 ban。
	for (const [label, text] of [['仅 USDT', 'USDT'], ['usdt 小写', 'usdt']]) {
		const r = await W.evaluateAdSuspect(env, {
			profile: { firstName: '', lastName: '', username: '', bio: '' }, text, quotedText: '', forwardChat: null
		}, {});
		assert(`P1 ${label}：指纹命中但单业务词不封`, r.verdict !== 'ban',
			JSON.stringify({ verdict: r.verdict, reasons: r.reasons, layer: r.layer }));
	}

	// —— 2) USDT + 行情：正常聊天语境（无招揽动词）也不封 —— 保证不伤正常用户。
	const chat = await W.evaluateAdSuspect(env, {
		profile: { firstName: '', lastName: '', username: '', bio: '' }, text: 'USDT 今天价格不错', quotedText: '', forwardChat: null
	}, {});
	assert('P1 USDT 行情聊天：不封', chat.verdict !== 'ban', JSON.stringify({ verdict: chat.verdict, reasons: chat.reasons }));

	// —— 3) 收购 USDT：招揽动词 + 业务词组合，结构通道「招揽∧行业」定罪 → 封。
	const combo = await W.evaluateAdSuspect(env, {
		profile: { firstName: '', lastName: '', username: '', bio: '' }, text: '收购 USDT 秒结', quotedText: '', forwardChat: null
	}, {});
	assert('P1 收购 USDT 组合：封（结构通道招揽∧行业）', combo.verdict === 'ban',
		JSON.stringify({ verdict: combo.verdict, layer: combo.layer, reasons: combo.reasons }));

	// —— 4) 非单业务词指纹照旧封：种子铁证「秒结不拖欠」（singleWord=false, weight 1）——
	//        完整短语命中即封，不受单词限制影响。
	const seedHit = await W.evaluateAdSuspect(env, {
		profile: { firstName: '', lastName: '', username: '', bio: '' }, text: '秒结不拖欠', quotedText: '', forwardChat: null
	}, {});
	const seedMatched = await W.matchAdFingerprints(env, { name: '', username: '', bio: '', text: '秒结不拖欠', domains: [] }, {});
	assert('P1 种子指纹 singleWord=false', Boolean(seedMatched.hits.find((h) => h.value === '秒结不拖欠')?.singleWord === false),
		JSON.stringify(seedMatched.hits.map((h) => ({ value: h.value, singleWord: h.singleWord }))));
	assert('P1 种子铁证「秒结不拖欠」照封', seedHit.verdict === 'ban', JSON.stringify(seedHit));
}

// ============================================================
//  [方案 A] username 维度下线 + 权限人 username 白名单 + keyword 短语降权
//  2026-09-10 —— 对应线上 #135 / #132 / #143 / #69 四起误封
// ============================================================
{
	console.log('\n[方案 A] username 维度下线 / 权限人白名单 / keyword 短语降权');
	const env = makeEnv();
	await W.adDetectionReady(env);

	// —— 1) 权限人 username 白名单解析 ——
	// parseAdProtectedUsernames 要能吃下三种写法：半角逗号、全角逗号、带 @ 前缀。
	const parsed = W.parseAdProtectedUsernames('ym94203, @suqi_20，avelix0');
	assert('白名单：三种分隔与 @ 前缀都能解析',
		parsed.length === 3 && parsed.includes('ym94203') && parsed.includes('suqi_20') && parsed.includes('avelix0'),
		JSON.stringify(parsed));
	// 非法形态必须丢弃 —— 否则空串进列表会让 includes 全量命中，等于关掉整个指纹层。
	const parsedBad = W.parseAdProtectedUsernames('ab, , @, 有中文, ok_name_1');
	assert('白名单：过短/空值/非法字符一律丢弃',
		parsedBad.length === 1 && parsedBad[0] === 'ok_name_1', JSON.stringify(parsedBad));
	assert('白名单：留空得到空列表', W.parseAdProtectedUsernames('').length === 0);
	assert('白名单：null 得到空列表', W.parseAdProtectedUsernames(null).length === 0);

	// —— 2) 白名单为空时 containsAdProtectedUsername 恒 false（不误伤）——
	// 这条守住「没配置就等于没这道闸」，避免空列表被当成「全部匹配」。
	W.applyRuntimeConfig(W.loadRequiredConfig(makeEnv()));
	assert('白名单：未配置时任何值都不拦', W.containsAdProtectedUsername('联系 @ym94203') === false);

	// —— 3) 配置白名单后，含权限人 handle 的候选一条都不许产生 ——
	W.applyRuntimeConfig(W.loadRequiredConfig(makeEnv({ AD_PROTECTED_USERNAMES: 'ym94203,suqi_20' })));
	assert('白名单：命中受保护 handle', W.containsAdProtectedUsername('收购账号 联系 @ym94203') === true);
	assert('白名单：不含受保护 handle 时放行', W.containsAdProtectedUsername('收购账号 联系 @someone_else') === false);
	// #143 的真实形态：广告号简介里艾特主人。「收购」命中交易动词 → 往后截 24 字
	// 会把 @ym94203 一起包进 keyword 短语。白名单必须在 push 入口就把它挡掉。
	const candProtected = W.extractAdFingerprintCandidates(
		{ name: '正常昵称', username: '', bio: '长期收购账号 有需要联系 @ym94203 详谈', text: '' }, new Set());
	assert('白名单：含主人 handle 的 keyword 短语不入库',
		!candProtected.some((c) => String(c.value).toLowerCase().includes('ym94203')), JSON.stringify(candProtected));
	// 整段正文兜底那条（权重 1、最危险）同样要被挡住。
	const candProtectedText = W.extractAdFingerprintCandidates(
		{ name: '路人', username: '', bio: '', text: '@ym94203 帮忙看一下这个问题谢谢' }, new Set());
	assert('白名单：含主人 handle 的整段正文不入库',
		!candProtectedText.some((c) => String(c.value).toLowerCase().includes('ym94203')), JSON.stringify(candProtectedText));
	// 恢复默认配置，避免污染后续（本段是文件最后一组，仍显式复原以防将来插新用例）。
	W.applyRuntimeConfig(W.loadRequiredConfig(makeEnv()));

	// —— 4) keyword 短语降权：#69 `月入怀来` 形态不再单条定罪 ——
	// 按词截取的 24 字短语权重 1 → 0.5，低于 AD_FINGERPRINT_BAN_WEIGHT(0.8)。
	const candPhrase = W.extractAdFingerprintCandidates(
		{ name: '', username: '', bio: '', text: '月入过万不是梦 怀来本地招人 详情私聊' }, new Set());
	const phraseCand = candPhrase.filter((c) => c.type === 'keyword' && c.weight === 0.5);
	assert('降权：按词截取的 keyword 短语权重为 0.5', phraseCand.length > 0, JSON.stringify(candPhrase));
	// 整段正文兜底那条保持权重 1 —— 它是归一化后精确相等才命中，误伤面极小，
	// 「同一段广告文案第二次出现即秒杀」这条能力不能丢。
	assert('降权：整段正文兜底仍为权重 1',
		candPhrase.some((c) => c.type === 'keyword' && c.weight === 1), JSON.stringify(candPhrase));

	// —— 5) 端到端：把 #69 形态学进库后，再遇到只命中该短语的人不再被封 ——
	const envPhrase = makeEnv();
	await W.adDetectionReady(envPhrase);
	await W.learnAdFingerprints(envPhrase, { name: '', username: '', bio: '', text: '月入过万不是梦 怀来本地招人 详情私聊', domains: [] },
		{ source: 'auto', createdBy: 'system' });
	const phraseHit = await W.matchAdFingerprints(envPhrase,
		{ name: '', username: '', bio: '', text: '月入过万不是梦 怀来本地招人 详情私聊', domains: [] }, {});
	assert('降权：短语仍会命中（召回没丢）', phraseHit.hits.length > 0, JSON.stringify(phraseHit.hits.map((h) => h.value)));
	// 关键断言：命中了、也计分了，但 nonSingleMaxWeight 不足以构成指纹级封禁。
	// 真广告靠整段精确匹配（权重 1）或结构查杀兜住，正常用户不会因一个片段被封。
	const phraseOnly = phraseHit.hits.filter((h) => h.weight === 0.5);
	assert('降权：0.5 权重短语确实在库', phraseOnly.length > 0, JSON.stringify(phraseHit.hits.map((h) => h.value + '@' + h.weight)));

	// —— 6) username 型历史指纹被匹配端整体跳过 ——
	// 库里可能还存着旧数据（清库是运维动作），代码侧必须自己免疫。
	const envLegacy = makeEnv();
	await W.adDetectionReady(envLegacy);
	await envLegacy.DB.exec(
		"INSERT INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_by, created_at, updated_at) "
		+ "VALUES ('legacyskip00001', 'username', '@ym94203', 0.8, 0, 0, 1, 'auto', '', 1757000000, 1757000000)"
	);
	const legacyHit = await W.matchAdFingerprints(envLegacy,
		{ name: '路人', username: '@ym94203', bio: '', text: '@ym94203 你好', domains: [] }, {});
	assert('免疫：历史 username 型指纹不再命中', legacyHit.hits.length === 0,
		JSON.stringify(legacyHit.hits.map((h) => h.type + ':' + h.value)));
	assert('免疫：历史 username 型指纹不产生封禁权重', legacyHit.nonSingleMaxWeight === 0, String(legacyHit.nonSingleMaxWeight));

	// —— 7) 端到端复现四起线上误封，全部必须放行 ——
	// #135 / #132：昵称 Avelix、简介未查询、正文「好了」/「签到」，唯一证据是 @avelix0 命中。
	// #143：昵称 My fuhrer、简介里艾特主人 @ym94203。
	const envReal = makeEnv();
	await W.adDetectionReady(envReal);
	await envReal.DB.exec(
		"INSERT INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_by, created_at, updated_at) "
		+ "VALUES ('realfp000000135', 'username', '@avelix0', 0.8, 2, 0, 1, 'auto', '', 1757000000, 1757000000), "
		+ "('realfp000000143', 'username', '@ym94203', 0.8, 1, 0, 1, 'auto', '', 1757000000, 1757000000)"
	);
	const real135 = await W.evaluateAdSuspect(envReal, {
		profile: { firstName: 'Avelix', lastName: '', username: 'avelix0', bio: '' },
		text: '好了', quotedText: '', forwardChat: null
	}, {});
	assert('线上 #135 复现：不再封禁', real135.verdict !== 'ban',
		JSON.stringify({ verdict: real135.verdict, score: real135.score, reasons: real135.reasons }));
	const real132 = await W.evaluateAdSuspect(envReal, {
		profile: { firstName: 'Avelix', lastName: '', username: 'avelix0', bio: '' },
		text: '签到', quotedText: '', forwardChat: null
	}, {});
	assert('线上 #132 复现：不再封禁', real132.verdict !== 'ban',
		JSON.stringify({ verdict: real132.verdict, score: real132.score, reasons: real132.reasons }));
	const real143 = await W.evaluateAdSuspect(envReal, {
		profile: { firstName: 'My fuhrer', lastName: '', username: 'suqi_20', bio: '@ym94203' },
		text: '', quotedText: '', forwardChat: null
	}, {});
	assert('线上 #143 复现：艾特主人不再封禁', real143.verdict !== 'ban',
		JSON.stringify({ verdict: real143.verdict, score: real143.score, reasons: real143.reasons }));
	// 任何人艾特主人都不该被封 —— 这是 #143 影响面最大的形态。
	const mentionOwner = await W.evaluateAdSuspect(envReal, {
		profile: { firstName: '普通用户', lastName: '', username: 'normal_user_1', bio: '' },
		text: '@ym94203 请问这个怎么弄', quotedText: '', forwardChat: null
	}, {});
	assert('线上 #143 扩展：任何人艾特主人都不封', mentionOwner.verdict !== 'ban',
		JSON.stringify({ verdict: mentionOwner.verdict, score: mentionOwner.score, reasons: mentionOwner.reasons }));

	// —— 8) 召回未丢：真广告仍被封 ——
	// 这一组是本次改动的安全网 —— 治误封不能把召回一起治掉。
	const stillBan = await W.evaluateAdSuspect(envReal, {
		profile: { firstName: '💚高价收网赚号💚', lastName: '', username: 'x_seller_1', bio: '长期收购网 du 商宝账号 秒结不拖欠' },
		text: '', quotedText: '', forwardChat: null
	}, {});
	assert('召回未丢：对称 emoji + 收购话术仍封', stillBan.verdict === 'ban',
		JSON.stringify({ verdict: stillBan.verdict, score: stillBan.score, layer: stillBan.layer }));
	const stillBan2 = await W.evaluateAdSuspect(envReal, {
		profile: { firstName: '兼职小助手', lastName: '', username: 'y_seller_2', bio: '' },
		text: '招代理日结佣金 无需经验 加微详聊', quotedText: '', forwardChat: null
	}, {});
	assert('召回未丢：种子铁证「招代理日结」仍封', stillBan2.verdict === 'ban',
		JSON.stringify({ verdict: stillBan2.verdict, score: stillBan2.score, layer: stillBan2.layer }));
}

console.log('');
console.log('='.repeat(60));
console.log(`广告检测测试汇总：通过 ${pass} 条，失败 ${fail} 条`);
if (failures.length) {
	console.log('失败清单：');
	for (const name of failures) console.log('  - ' + name);
}
console.log('='.repeat(60));
process.exitCode = fail > 0 ? 1 : 0;
