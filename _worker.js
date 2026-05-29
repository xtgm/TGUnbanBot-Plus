// =============================================================================
// =可修改= 项目内置文案与参数
// 优先级：环境变量 > 这里的硬编码默认值
// 也就是说：这里改了立刻生效；如果 Cloudflare 后台同名环境变量也填了，则环境变量胜出。
// =============================================================================

// 1) 自助解封确认整句。用户必须**完整逐字粘贴**才会触发解封流程。
//    环境变量名：SELF_UNBAN_KEYWORD
const DEFAULT_SELF_UNBAN_KEYWORD = '我不是广告狗，我是误封的，希望可以解封。';

// 2) /unban、/start 命令收到时返回的欢迎/检查清单。
//    支持 HTML 子集（<b>、换行等）。占位符：{userId}、{title}、{keyword}。
//    {keyword} 会自动填入当前生效的 SELF_UNBAN_KEYWORD（来自环境变量或默认值）。
//    环境变量名：SELF_UNBAN_PROMPT
const DEFAULT_SELF_UNBAN_PROMPT = `🤖 <b>亲爱的 {userId}</b>，我是 <b>{title}</b> 的 自助解封机器人

🔍 <b>请自行检查以下内容：</b>

1️⃣ 用户名是否包含广告内容？
2️⃣ 个人签名是否包含广告内容或链接？
3️⃣ 是否讨论了政治、NSFW、引战、嘲讽等内容？

✅ <b>如果你确定没有违反以上内容，请输入以下内容：</b>
	<code>{keyword}</code>`;

// 3) 用户输入正确确认句、解封请求被同意时回复的提示。
//    占位符：{username}（主群 @用户名 或主群 ID）。
//    环境变量名：SELF_UNBAN_APPROVED
const DEFAULT_SELF_UNBAN_APPROVED = `✅ 已同意给予解封\n\n请点击 {username} 返回群组\n\n⚠️ 请注意：解封后请遵守群规，避免再次被封禁。`;

// 4) /blacklist 命令单次最多展示多少条（按时间倒序，最新在前）。
//    环境变量名：BLACKLIST_PAGE_LIMIT （要求是正整数）
const DEFAULT_BLACKLIST_PAGE_LIMIT = 30;

// 5) /blacklist 列表中"原因"字段的中文映射。
//    内置三种：spam（/spam 举报）、manual（/ban 手动添加）、manual_ban（chat_member 自动同步）。
//    环境变量名：BLACKLIST_REASON_LABELS （要求是 JSON 字符串，例如 {"spam":"群内举报"}）
const DEFAULT_BLACKLIST_REASON_LABELS = {
	spam: '群内 /spam 举报',
	manual: '管理员手动添加',
	manual_ban: '管理员手动封禁（自动同步）',
	ad_auto: '🤖 广告自动检测'
};

// 6) GKY 封禁记录查询后端。改动者请确保返回 HTML 与 parseBanlistHTML 兼容。
//    环境变量名：GKY_BANLIST_ENDPOINT
const DEFAULT_GKY_BANLIST_ENDPOINT = 'https://gkybot.gmeow.cc/banlist';

// 7) 超级管理员 TGID 白名单。**仅这些用户**能点击「✅ 同意（一键代发）」按钮，
//    普通群管理员看到按钮但点击会被拒绝。支持多个 TGID。
//    环境变量名：SUPER_ADMINS （字符串形式，逗号分隔）
//    例：'123456,789012'
//    硬编码这里写数组形式，留空数组表示默认无超管（按钮存在但无人能点，安全默认）。
const DEFAULT_SUPER_ADMINS = [
	// '123456789',
	// '987654321',
];

// 8) 主人 TGID(项目所有者),用于"主人审计通知"系统
//    所有管理员/超管在群里使用 /ban /unban /spam 命令、点一键解封按钮、
//    群内手动 ban/unban 时,主人会收到一份带操作人标记的私聊审计通知
//    优先级:环境变量 OWNER_ID > 这里的 DEFAULT_OWNER_ID
//    留空字符串 = 禁用通知系统(其他管理员仍可正常使用命令,但都没有私聊详情)
//    填了 OWNER_ID 但主人从未私聊过 bot → 通知会投递失败,Worker 日志可见
const DEFAULT_OWNER_ID = '';

// 9) 广告自动检测(多维度评分 + 强特征直杀),命中 → 删消息 + 加黑 + 全群踢 + 通知主人
//    优先级:环境变量 > 这里的硬编码默认值
//    AD_FILTER_ENABLED 默认 false,需显式设环境变量 'true' 才启用(避免刚部署误伤)
const DEFAULT_AD_FILTER_ENABLED = false;
//    评分阈值:各维度加权分总和 ≥ 阈值即判广告(强特征绕过评分直接判定)
const DEFAULT_AD_SCORE_THRESHOLD = 3;
//    是否检测用户 bio(需额外调 getChat,只能拿到已与 bot 交互过用户的 bio,群里陌生用户拿不到)
const DEFAULT_AD_CHECK_BIO = false;
//    分类词库(命中加权:金融+2 / 色情+2 / 引流+1 / 诈骗+2)
const DEFAULT_AD_KEYWORDS_FINANCE = ['usdt', 'u商', '承兑', '刷单', '日入', '出u', '接u', '搬砖', '套利', '包网', '跑分', '水房', '料子', '拉满', '价格拉满'];
const DEFAULT_AD_KEYWORDS_PORN = ['约炮', '萝莉', '福利姬', '看片', '裸聊', '乱伦', '不雅视频', '色色', '开车', '一夜情', '免费看', '资源群', '萝控'];
const DEFAULT_AD_KEYWORDS_SPAM = ['加我', '加微', '加v', '私聊', '进群', '拉你', '详情看', 'dd我', '滴滴我', '添加好友', '发送信息'];
const DEFAULT_AD_KEYWORDS_FRAUD = ['假钞', '假币', '高仿', '办证', '代开发票', '黑客接单', '改分', '网赚', '菠菜', '交流群'];
//    高危 emoji(诱导符,密度 ≥3 个 加 1 分)
const DEFAULT_AD_RISK_EMOJI = ['🔥', '💰', '❤️', '😍', '💋', '🍑', '👙', '💴', '🤑', '🉐', '❗', '💎'];

// =============================================================================
// =结束= 普通使用者一般无需修改下方任何内容
// =============================================================================

// 运行期生效的可配置项（每次请求开始时由 loadRequiredConfig 写入）
let SELF_UNBAN_KEYWORD;
let SELF_UNBAN_PROMPT;
let SELF_UNBAN_APPROVED;
let BLACKLIST_PAGE_LIMIT;
let BLACKLIST_REASON_LABELS;
let GKY_BANLIST_ENDPOINT;

// Telegram Bot Token
let BOT_TOKEN;
// 主群组ID（GROUP_IDS 的第一项，用于发送二次审核提醒、缓存群组信息等"主群行为"）
let GROUP_ID;
// 全部配置群组ID列表（支持 GROUP_ID 环境变量逗号分隔多群组）
let GROUP_IDS = [];
// 超级管理员 TGID 白名单（用于按钮交互鉴权，普通群管理员不在此列时不能点按钮）
let SUPER_ADMINS = [];
// 主人 TGID(项目所有者),用于全局审计通知。空字符串 = 未配置,禁用通知
let OWNER_ID = '';
// 广告检测运行期配置
let AD_FILTER_ENABLED = false;
let AD_SCORE_THRESHOLD = 3;
let AD_CHECK_BIO = false;
let AD_KEYWORDS = [];          // 环境变量追加的自定义广告词
let AD_WHITELIST = [];         // 白名单词(命中不计分)
let AD_KEYWORDS_FINANCE = [];
let AD_KEYWORDS_PORN = [];
let AD_KEYWORDS_SPAM = [];
let AD_KEYWORDS_FRAUD = [];
let AD_RISK_EMOJI = [];
// 机器人用户名缓存
let BOT_USERNAME = null;
let BOT_ID = null;
// 群组信息缓存（仅缓存主群）
let GROUP_TITLE = null;
let GROUP_USERNAME = null;

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const path = url.pathname.slice(1); // 移除开头的斜杠
		let TOKEN;

		try {
			const config = loadRequiredConfig(env);
			TOKEN = config.TOKEN;
			BOT_TOKEN = config.BOT_TOKEN;
			GROUP_IDS = config.GROUP_IDS;
			GROUP_ID = config.GROUP_ID;
			SUPER_ADMINS = config.SUPER_ADMINS;
			OWNER_ID = config.OWNER_ID;
			AD_FILTER_ENABLED = config.AD_FILTER_ENABLED;
			AD_SCORE_THRESHOLD = config.AD_SCORE_THRESHOLD;
			AD_CHECK_BIO = config.AD_CHECK_BIO;
			AD_KEYWORDS = config.AD_KEYWORDS;
			AD_WHITELIST = config.AD_WHITELIST;
			AD_KEYWORDS_FINANCE = config.AD_KEYWORDS_FINANCE;
			AD_KEYWORDS_PORN = config.AD_KEYWORDS_PORN;
			AD_KEYWORDS_SPAM = config.AD_KEYWORDS_SPAM;
			AD_KEYWORDS_FRAUD = config.AD_KEYWORDS_FRAUD;
			AD_RISK_EMOJI = config.AD_RISK_EMOJI;
			SELF_UNBAN_KEYWORD = config.SELF_UNBAN_KEYWORD;
			SELF_UNBAN_PROMPT = config.SELF_UNBAN_PROMPT;
			SELF_UNBAN_APPROVED = config.SELF_UNBAN_APPROVED;
			BLACKLIST_PAGE_LIMIT = config.BLACKLIST_PAGE_LIMIT;
			BLACKLIST_REASON_LABELS = config.BLACKLIST_REASON_LABELS;
			GKY_BANLIST_ENDPOINT = config.GKY_BANLIST_ENDPOINT;
		} catch (error) {
			return jsonResponse({
				success: false,
				error: error.message
			}, 500);
		}

		if (url.pathname === "/banlist" && url.searchParams.has('tgid') && url.searchParams.get('tgid') != '') {
			const tgid = url.searchParams.get('tgid');
			const banlist = await handleBanlist(tgid);
			return new Response(banlist, {
				headers: { 'Content-Type': 'application/json; charset=UTF-8' }
			});;
		} else if (request.method === 'GET' && path === `${TOKEN}/migrate`) {
			// 存量 KV 黑名单一次性迁移到 D1（用 TOKEN 保护，防止外部触发）
			return await handleMigrate(env);
		} else if (request.method === 'GET' && path === `${TOKEN}/export`) {
			// 黑名单导出（浏览器 / JSON / CSV，受 TOKEN 保护）
			return await handleExport(env, url);
		} else if (request.method === 'GET' && path === `${TOKEN}/purge`) {
			// 一次性清扫：把仍在群里的黑名单用户全部踢出（受 TOKEN 保护）
			return await handlePurge(env);
		} else if (request.method === 'POST') {
			// 如果是 Telegram Webhook 请求
			if (path === '') {
				const update = await request.json();
				console.log('[Telegram更新] 收到更新:', JSON.stringify({
					更新ID: update.update_id,
					包含字段: Object.keys(update),
					有普通消息: Boolean(update.message),
					是否新成员入群消息: Array.isArray(update.message?.new_chat_members),
					新成员数量: update.message?.new_chat_members?.length || 0,
					有编辑消息: Boolean(update.edited_message),
					有频道消息: Boolean(update.channel_post),
					有消息反应: Boolean(update.message_reaction),
					有成员状态变更: Boolean(update.chat_member),
					有按钮回调: Boolean(update.callback_query)
				}));

				// 分发：普通消息 / 群成员状态变更 / 按钮回调
				if (update.message) {
					await handleMessage(update.message, env, ctx);
				} else if (update.chat_member) {
					await handleChatMemberUpdate(update.chat_member, env);
				} else if (update.callback_query) {
					await handleCallbackQuery(update.callback_query, env);
				} else {
					console.log('[Telegram更新] 跳过：当前代码仅处理 message/chat_member/callback_query。');
				}

				return new Response('OK');
			} else if (path === TOKEN) {
				// 处理初始化命令
				return await handleInitialization(request);
			}
		} else if (request.method === 'GET' && path === TOKEN) {
			// 处理 GET 初始化请求
			return await handleInitialization(request);
		}

		return new Response('Method Not Allowed', { status: 405 });
	}
};

function loadRequiredConfig(env) {
	const requiredEnvVars = ['TOKEN', 'BOT_TOKEN', 'GROUP_ID'];
	const missing = requiredEnvVars.filter((name) => {
		const value = env?.[name];
		return value === undefined || value === null || String(value).trim() === '';
	});

	if (missing.length > 0) {
		throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
	}

	// GROUP_ID 支持逗号分隔多群组，第一个作为主群（同时兼容半角 , 与全角 ，）
	const groupIds = String(env.GROUP_ID)
		.split(/[,，]/)
		.map((id) => id.trim())
		.filter((id) => id !== '');

	if (groupIds.length === 0) {
		throw new Error('GROUP_ID is empty after parsing');
	}

	// 去重，保持顺序
	const uniqueGroupIds = [...new Set(groupIds)];

	// SUPER_ADMINS 可选：环境变量优先（字符串，逗号分隔，半角 , 与全角 ， 都兼容）；否则用顶部 DEFAULT_SUPER_ADMINS（数组）
	const sanitizeAdmins = (list) =>
		[...new Set(
			(list || [])
				.map((id) => String(id).trim())
				.filter((id) => /^\d+$/.test(id))
		)];

	let superAdmins;
	if (env.SUPER_ADMINS !== undefined && env.SUPER_ADMINS !== null && String(env.SUPER_ADMINS).trim() !== '') {
		superAdmins = sanitizeAdmins(String(env.SUPER_ADMINS).split(/[,，]/));
	} else {
		superAdmins = sanitizeAdmins(DEFAULT_SUPER_ADMINS);
	}

	// OWNER_ID 可选：环境变量优先 > DEFAULT_OWNER_ID。空字符串 = 禁用主人通知
	let ownerId = '';
	const rawOwnerEnv = env.OWNER_ID;
	if (rawOwnerEnv !== undefined && rawOwnerEnv !== null && String(rawOwnerEnv).trim() !== '') {
		ownerId = String(rawOwnerEnv).trim();
	} else {
		ownerId = String(DEFAULT_OWNER_ID || '').trim();
	}
	// 校验 TGID 格式(纯数字),非法值视为未配置
	if (!/^\d+$/.test(ownerId)) ownerId = '';

	// 顶部 6 项可配置文案/参数：环境变量优先，否则用内置默认值
	const pickStr = (envVal, fallback) => {
		if (envVal === undefined || envVal === null) return fallback;
		const s = String(envVal);
		return s === '' ? fallback : s;
	};

	const selfUnbanKeyword = pickStr(env.SELF_UNBAN_KEYWORD, DEFAULT_SELF_UNBAN_KEYWORD);
	const selfUnbanPrompt = pickStr(env.SELF_UNBAN_PROMPT, DEFAULT_SELF_UNBAN_PROMPT);
	const selfUnbanApproved = pickStr(env.SELF_UNBAN_APPROVED, DEFAULT_SELF_UNBAN_APPROVED);

	let blacklistPageLimit = DEFAULT_BLACKLIST_PAGE_LIMIT;
	if (env.BLACKLIST_PAGE_LIMIT !== undefined && env.BLACKLIST_PAGE_LIMIT !== null && String(env.BLACKLIST_PAGE_LIMIT).trim() !== '') {
		const n = parseInt(String(env.BLACKLIST_PAGE_LIMIT).trim(), 10);
		if (Number.isFinite(n) && n > 0) blacklistPageLimit = n;
	}

	let blacklistReasonLabels = DEFAULT_BLACKLIST_REASON_LABELS;
	if (env.BLACKLIST_REASON_LABELS !== undefined && env.BLACKLIST_REASON_LABELS !== null && String(env.BLACKLIST_REASON_LABELS).trim() !== '') {
		try {
			const parsed = JSON.parse(String(env.BLACKLIST_REASON_LABELS));
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				blacklistReasonLabels = parsed;
			}
		} catch (_) {
			// 解析失败时保持默认，不抛异常以免阻塞启动
			console.error('BLACKLIST_REASON_LABELS 不是合法 JSON，已回退默认值');
		}
	}

	const gkyEndpoint = pickStr(env.GKY_BANLIST_ENDPOINT, DEFAULT_GKY_BANLIST_ENDPOINT);

	// ===== 广告检测配置 =====
	const parseBool = (v, dflt) => {
		if (v === undefined || v === null || String(v).trim() === '') return dflt;
		return String(v).trim().toLowerCase() === 'true';
	};
	const parseList = (v) =>
		[...new Set(
			String(v || '').split(/[,，]/).map((s) => s.trim().toLowerCase()).filter(Boolean)
		)];

	const adFilterEnabled = parseBool(env.AD_FILTER_ENABLED, DEFAULT_AD_FILTER_ENABLED);
	let adScoreThreshold = DEFAULT_AD_SCORE_THRESHOLD;
	if (env.AD_SCORE_THRESHOLD !== undefined && env.AD_SCORE_THRESHOLD !== null && String(env.AD_SCORE_THRESHOLD).trim() !== '') {
		const n = parseInt(String(env.AD_SCORE_THRESHOLD).trim(), 10);
		if (Number.isInteger(n) && n > 0) adScoreThreshold = n;
	}
	const adCheckBio = parseBool(env.AD_CHECK_BIO, DEFAULT_AD_CHECK_BIO);
	const adKeywords = parseList(env.AD_KEYWORDS);     // 环境变量追加
	const adWhitelist = parseList(env.AD_WHITELIST);
	// 词库统一小写化(检测时也小写比对)
	const lower = (arr) => (arr || []).map((s) => String(s).toLowerCase());

	return {
		TOKEN: String(env.TOKEN).trim(),
		BOT_TOKEN: String(env.BOT_TOKEN).trim(),
		GROUP_IDS: uniqueGroupIds,
		GROUP_ID: uniqueGroupIds[0],
		SUPER_ADMINS: superAdmins,
		OWNER_ID: ownerId,
		AD_FILTER_ENABLED: adFilterEnabled,
		AD_SCORE_THRESHOLD: adScoreThreshold,
		AD_CHECK_BIO: adCheckBio,
		AD_KEYWORDS: adKeywords,
		AD_WHITELIST: adWhitelist,
		AD_KEYWORDS_FINANCE: lower(DEFAULT_AD_KEYWORDS_FINANCE),
		AD_KEYWORDS_PORN: lower(DEFAULT_AD_KEYWORDS_PORN),
		AD_KEYWORDS_SPAM: lower(DEFAULT_AD_KEYWORDS_SPAM),
		AD_KEYWORDS_FRAUD: lower(DEFAULT_AD_KEYWORDS_FRAUD),
		AD_RISK_EMOJI: DEFAULT_AD_RISK_EMOJI,
		SELF_UNBAN_KEYWORD: selfUnbanKeyword,
		SELF_UNBAN_PROMPT: selfUnbanPrompt,
		SELF_UNBAN_APPROVED: selfUnbanApproved,
		BLACKLIST_PAGE_LIMIT: blacklistPageLimit,
		BLACKLIST_REASON_LABELS: blacklistReasonLabels,
		GKY_BANLIST_ENDPOINT: gkyEndpoint
	};
}

// 处理初始化命令
function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { 'Content-Type': 'application/json; charset=UTF-8' }
	});
}

async function handleInitialization(request) {
	try {
		// 设置 Webhook
		const webhookUrl = new URL(request.url);
		webhookUrl.pathname = '/';

		const setWebhookUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;
		const setWebhookBody = {
			url: webhookUrl.toString(),
			allowed_updates: ['message', 'chat_member', 'callback_query']
		};

		const response = await fetch(setWebhookUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(setWebhookBody)
		});

		if (!response.ok) {
			const result = await response.json();
			return jsonResponse({
				成功: false,
				消息: 'Webhook 设置失败',
				Webhook: {
					目标地址: webhookUrl.toString(),
					允许更新类型: setWebhookBody.allowed_updates,
					HTTP状态码: response.status,
					Telegram返回: result
				}
			}, 500);
		}

		// 设置机器人命令
		const setCommandsUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setMyCommands`;
		const setCommandsBody = {
			commands: [
				{ command: "unban", description: "开始自助解封" },
				{ command: "ban", description: "添加用户到黑名单 (管理员)" },
				{ command: "spam", description: "回复消息添加用户到黑名单 (管理员)" },
				{ command: "check", description: "回复消息查询封禁状态 (管理员)" },
				{ command: "blacklist", description: "查看当前黑名单 (管理员)" }
			]
		};

		const commandsResponse = await fetch(setCommandsUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(setCommandsBody)
		});

		if (commandsResponse.ok) {
			return jsonResponse({
				成功: true,
				消息: 'Webhook 和命令设置成功',
				Webhook: {
					已设置: true,
					目标地址: webhookUrl.toString(),
					允许更新类型: setWebhookBody.allowed_updates
				},
				命令: {
					已设置: true
				}
			});
		} else {
			const result = await commandsResponse.json();
			return jsonResponse({
				成功: false,
				消息: '命令设置失败',
				Webhook: {
					已设置: true,
					目标地址: webhookUrl.toString(),
					允许更新类型: setWebhookBody.allowed_updates
				},
				命令: {
					已设置: false,
					HTTP状态码: commandsResponse.status,
					Telegram返回: result
				}
			}, 500);
		}
	} catch (error) {
		return jsonResponse({
			成功: false,
			消息: '内部服务器错误',
			错误: error.message
		}, 500);
	}
}

// 把 KV 里的黑名单数据归一化为 [{id, reason, by, at}, ...] 形式。
// 兼容三种历史格式：
//   1. 裸字符串/数字数组 ["123", 456]
//   2. 对象数组 [{id:"123", reason, by, at}]
//   3. 混合
function normalizeBlacklist(raw) {
	if (!Array.isArray(raw)) {
		return [];
	}

	const seen = new Set();
	const out = [];
	for (const entry of raw) {
		let id;
		let reason = null;
		let by = null;
		let at = null;

		if (entry && typeof entry === 'object') {
			id = entry.id;
			reason = entry.reason ?? null;
			by = entry.by ?? null;
			at = entry.at ?? null;
		} else {
			id = entry;
		}

		if (id === undefined || id === null) continue;
		const idStr = String(id).trim();
		if (idStr === '' || seen.has(idStr)) continue;
		seen.add(idStr);
		out.push({ id: idStr, reason, by, at });
	}
	return out;
}

// 批量 /ban /unban 上限（工程上限，非业务文案，不暴露环境变量）
const BATCH_LIMIT = 50;

// 解析批量 TGID 字符串：半角逗号 / 全角逗号 / 空格 / 换行 都当分隔符；去空、去重、分类
// 返回 { valid: ['123', '456'], invalid: ['abc'] }
function parseBatchTgids(raw) {
	const tokens = String(raw || '')
		.split(/[,，\s]+/)
		.map((s) => s.trim())
		.filter((s) => s !== '');
	const valid = [];
	const invalid = [];
	const seen = new Set();
	for (const t of tokens) {
		if (!/^\d+$/.test(t)) {
			invalid.push(t);
			continue;
		}
		if (seen.has(t)) continue;
		seen.add(t);
		valid.push(t);
	}
	return { valid, invalid };
}

// 读取并归一化黑名单
// === D1 工具函数 ===
// 首次访问 D1 时建表（幂等），避免人工建表步骤
let D1_INITED = false;
async function ensureD1Table(env) {
	if (!env.DB || D1_INITED) return;
	try {
		await env.DB.exec('CREATE TABLE IF NOT EXISTS blacklist (id TEXT PRIMARY KEY, reason TEXT, by_user TEXT, at TEXT)');
		D1_INITED = true;
	} catch (error) {
		console.error('D1 建表失败:', error);
	}
}

async function readD1Blacklist(env) {
	await ensureD1Table(env);
	const stmt = env.DB.prepare('SELECT id, reason, by_user, at FROM blacklist ORDER BY at ASC');
	const { results } = await stmt.all();
	return (results || []).map((r) => ({
		id: String(r.id),
		reason: r.reason ?? null,
		by: r.by_user ?? null,
		at: r.at ?? null
	}));
}

// 把 D1 全表镜像到 KV（写入侧用，保证 KV 永远是 D1 的镜像）
async function mirrorToKV(env) {
	if (!env.KV) return;
	try {
		const list = env.DB ? await readD1Blacklist(env) : null;
		if (list) {
			await env.KV.put('blacklist', JSON.stringify(list));
		}
	} catch (error) {
		console.error('镜像 D1 到 KV 失败:', error);
	}
}

// === 黑名单读写接口 ===
// 优先级：D1 → KV → 空数组
async function getBlacklist(env) {
	if (env.DB) {
		try {
			return await readD1Blacklist(env);
		} catch (error) {
			console.error('读 D1 黑名单失败，回退到 KV:', error);
		}
	}
	if (env.KV) {
		try {
			const raw = await env.KV.get('blacklist', { type: 'json' });
			return normalizeBlacklist(raw);
		} catch (error) {
			console.error('读 KV 黑名单失败:', error);
		}
	}
	return [];
}

// 检查用户是否在黑名单中（KV/D1 任一绑定即可）
async function checkBlacklist(userId, env) {
	if (!env.KV && !env.DB) {
		return { isBlacklisted: false, message: null };
	}

	try {
		const blacklist = await getBlacklist(env);
		const userIdStr = String(userId);

		const hit = blacklist.find((entry) => entry.id === userIdStr);
		if (hit) {
			return {
				isBlacklisted: true,
				message: '❌ 您的TGID在黑名单中，请自行联系管理员解封。',
				entry: hit
			};
		}

		return { isBlacklisted: false, message: null };
	} catch (error) {
		console.error('检查黑名单时出错:', error);
		// 如果出错，不阻止用户操作
		return { isBlacklisted: false, message: null };
	}
}

// 添加用户到黑名单（核心实现，不调 mirrorToKV，供批量场景串行调用后统一镜像）
// options: { reason, by } —— reason 是封禁原因，by 是操作人 TGID
// 写入策略：D1 / KV 任一存在即可写入；都绑定时 D1 为权威，调用方负责镜像到 KV
async function addToBlacklistCore(userId, env, options = {}) {
	if (!env.KV && !env.DB) {
		return { success: false, message: '❌ 未绑定 KV 或 D1 存储空间' };
	}

	const userIdStr = String(userId);
	const reason = options.reason ?? null;
	const by = options.by != null ? String(options.by) : null;
	const at = new Date().toISOString();

	try {
		// 路径 A：有 D1，以 D1 为权威
		if (env.DB) {
			await ensureD1Table(env);
			// SQLite 没有原子性的"返回是否插入"机制，先 SELECT 再 INSERT
			const existing = await env.DB
				.prepare('SELECT id FROM blacklist WHERE id = ?')
				.bind(userIdStr)
				.first();
			if (existing) {
				return { success: false, message: '⚠️ 该用户已在黑名单中' };
			}
			await env.DB
				.prepare('INSERT INTO blacklist (id, reason, by_user, at) VALUES (?, ?, ?, ?)')
				.bind(userIdStr, reason, by, at)
				.run();
		} else {
			// 路径 B：仅 KV
			const blacklist = await getBlacklist(env);
			if (blacklist.some((entry) => entry.id === userIdStr)) {
				return { success: false, message: '⚠️ 该用户已在黑名单中' };
			}
			blacklist.push({ id: userIdStr, reason, by, at });
			await env.KV.put('blacklist', JSON.stringify(blacklist));
		}

		return { success: true, message: `✅ 已将用户 <code>${userId}</code> 添加到黑名单` };
	} catch (error) {
		console.error('添加黑名单时出错:', error);
		return { success: false, message: '❌ 添加黑名单失败: ' + error.message };
	}
}

// 添加用户到黑名单（薄包装）：Core + 单次镜像。保持现有所有调用点签名/语义不变
async function addToBlacklist(userId, env, options = {}) {
	const result = await addToBlacklistCore(userId, env, options);
	if (result.success && env.DB && env.KV) {
		await mirrorToKV(env);
	}
	return result;
}

// 从黑名单中移除用户（核心实现，不调 mirrorToKV）
async function removeFromBlacklistCore(userId, env) {
	if (!env.KV && !env.DB) {
		return { success: false, message: '❌ 未绑定 KV 或 D1 存储空间' };
	}

	const userIdStr = String(userId);

	try {
		// 路径 A：有 D1
		if (env.DB) {
			await ensureD1Table(env);
			const result = await env.DB
				.prepare('DELETE FROM blacklist WHERE id = ?')
				.bind(userIdStr)
				.run();
			const changed = result?.meta?.changes ?? result?.changes ?? 0;
			if (!changed) {
				return { success: false, message: '⚠️ 该用户不在黑名单中' };
			}
		} else {
			// 路径 B：仅 KV
			const blacklist = await getBlacklist(env);
			const updated = blacklist.filter((entry) => entry.id !== userIdStr);
			if (updated.length === blacklist.length) {
				return { success: false, message: '⚠️ 该用户不在黑名单中' };
			}
			await env.KV.put('blacklist', JSON.stringify(updated));
		}

		return { success: true, message: `✅ 已将用户 <code>${userId}</code> 从黑名单中移除` };
	} catch (error) {
		console.error('移除黑名单时出错:', error);
		return { success: false, message: '❌ 移除黑名单失败: ' + error.message };
	}
}

// 从黑名单中移除用户（薄包装）：Core + 单次镜像
async function removeFromBlacklist(userId, env) {
	const result = await removeFromBlacklistCore(userId, env);
	if (result.success && env.DB && env.KV) {
		await mirrorToKV(env);
	}
	return result;
}

// 把用户从所有配置群踢出，逐群结果数组返回
// bot 不在群 / 没权限单群失败不影响其它群；串行避免 Telegram API 限流
// 返回 [{ groupId, ok, error }]
async function banUserFromAllGroups(userId) {
	const results = [];
	for (const groupId of GROUP_IDS) {
		const r = await banUserFromGroup(groupId, userId);
		results.push({ groupId, ok: r.ok, error: r.error });
	}
	return results;
}

// 渲染单个用户多群踢人结果为简短 HTML 文案
// 把 Telegram API 的英文错误描述翻译成中文 + 解决建议
// description 是 banChatMember/deleteMessage 等 API 在失败时返回的 description 字段
function translateTelegramError(description) {
	if (!description) return { 中文: '未知错误', 建议: '查看 Worker 日志获取详情' };
	const desc = String(description);
	const lower = desc.toLowerCase();

	// 更具体的错误码先匹配（Telegram 有时同时携带多个特征）
	if (lower.includes('chat_admin_required')) {
		return { 中文: 'bot 必须是群管理员', 建议: '把 bot 设为群管理员，并打开"封禁用户"和"删除消息"权限' };
	}
	if (lower.includes("message can't be deleted") || lower.includes("can't be deleted for everyone")) {
		return { 中文: '该消息无法删除', 建议: '消息可能超过 48 小时或不属于 bot 可删除范围；可手动删除' };
	}
	if (lower.includes('message to delete not found')) {
		return { 中文: '消息已不存在', 建议: '消息可能已被其他人删除，无需操作' };
	}
	if (lower.includes('user is not a member') || lower.includes('user_not_participant')) {
		return { 中文: '用户已不在群中', 建议: '该用户已离群或被踢，本次踢人请求实际无影响' };
	}
	if (lower.includes('peer_id_invalid') || lower.includes('chat_id_invalid')) {
		return { 中文: '群 ID 无效', 建议: '检查 GROUP_ID 环境变量配置，群组 ID 应为负数（如 -1001234567890）' };
	}

	if (lower.includes('not enough rights') || lower.includes('not enough privileges')) {
		return { 中文: 'bot 权限不足', 建议: '把 bot 设为群管理员，并打开"封禁用户"权限' };
	}
	if (lower.includes('bot is not a member') || lower.includes('chat not found')) {
		return { 中文: 'bot 不在该群', 建议: '请重新把 bot 拉进该群并设为管理员' };
	}
	if (lower.includes("can't restrict self") || lower.includes('user is an administrator')) {
		return { 中文: '目标用户是群管理员', 建议: '先在群里降级或撤销该用户的管理员身份再踢' };
	}
	if (lower.includes('user not found')) {
		return { 中文: '用户不存在', 建议: '确认 TGID 是否正确，或该用户从未与 Telegram 交互' };
	}
	if (lower.includes('participant_id_invalid') || lower.includes('user_id_invalid')) {
		return { 中文: '用户 ID 无效', 建议: '检查 TGID 格式是否为纯数字' };
	}
	if (lower.includes('forbidden') && lower.includes('blocked')) {
		return { 中文: '用户拉黑了 bot', 建议: '此情况无影响，踢人仍会执行' };
	}
	if (lower.includes('flood') || lower.includes('too many requests')) {
		return { 中文: 'Telegram 限流', 建议: '稍后重试，或减小批量大小' };
	}
	// 兜底：原文返回
	return { 中文: desc, 建议: '查看 Worker 日志和 Telegram 文档' };
}

// 渲染单用户全群踢人结果(详细版)：包含群名、群ID、失败原因和建议
// banResults: [{ groupId, ok, error }] 来自 banUserFromAllGroups
// 返回多行 HTML 文案，每行一个群的具体结果
async function renderBanResultsDetail(banResults) {
	const okCount = banResults.filter((r) => r.ok).length;
	const total = banResults.length;
	const lines = [];

	if (okCount === total) {
		lines.push(`🚫 <b>已从全部 ${total} 个群踢出</b>`);
	} else if (okCount === 0) {
		lines.push(`⚠️ <b>全部 ${total} 个群踢人失败</b>`);
	} else {
		lines.push(`🚫 <b>已踢出 ${okCount}/${total} 个群</b>（${total - okCount} 个失败）`);
	}

	// 并行拉群名（最多 GROUP_IDS.length 个，串行也无所谓但并行更快）
	const detailLines = await Promise.all(
		banResults.map(async (r) => {
			let title = '未知群名';
			try {
				const info = await getChatInfoFromId(r.groupId);
				if (info?.title) title = info.title;
			} catch (e) {
				// 拉群名失败不影响主流程
			}
			const safeTitle = escapeHtml(title);
			const safeId = escapeHtml(String(r.groupId));
			if (r.ok) {
				return `  ✅ <b>${safeTitle}</b> <code>${safeId}</code>`;
			}
			const { 中文, 建议 } = translateTelegramError(r.error);
			return `  ❌ <b>${safeTitle}</b> <code>${safeId}</code>\n     原因：${escapeHtml(中文)}\n     建议：${escapeHtml(建议)}`;
		})
	);

	lines.push('', ...detailLines);
	return lines.join('\n');
}

// 简短版（用于群内闪屏，不能太长）
function renderBanResults(banResults) {
	const okCount = banResults.filter((r) => r.ok).length;
	const total = banResults.length;
	if (okCount === total) return `🚫 已从全部 ${total} 个群踢出`;
	if (okCount === 0) return `⚠️ 全部 ${total} 个群踢人失败（请检查 bot 是否为群管理员）`;
	return `🚫 已踢出 ${okCount}/${total} 个群（${total - okCount} 个失败）`;
}

// 双通道回执：群内场景发闪屏 + 私聊管理员发详情；私聊场景直接发详情
// 私聊投递失败（管理员从未 /start 过 bot）时，群里追加一条闪屏说明
// 判定操作人角色,返回中文标签:主人 / 超级管理员 / 群管理员
// 主人优先级最高;主人之外的 SUPER_ADMINS 是"超级管理员";其余按调用方传入的兜底标签(默认"管理员")
function classifyOperatorRole(userId, fallback = '管理员') {
	const idStr = String(userId || '');
	if (OWNER_ID && idStr === OWNER_ID) return '主人';
	if (isSuperAdmin(idStr)) return '超级管理员';
	return fallback;
}

// 渲染主人审计通知:在 detailText 顶部追加"角色 + 操作人 + 来源"标识
// roleLabel: 由 classifyOperatorRole 生成,通常是"超级管理员"/"群管理员"/"管理员"
// sourceLabel: '群内' / '私聊' 等触发场景标记
function renderAuditNotification(operatorMention, detailText, sourceLabel, roleLabel = '管理员') {
	return `🔔 <b>${escapeHtml(roleLabel)}操作通知</b>\n👤 操作人:${operatorMention}（${escapeHtml(roleLabel)}）\n📍 来源:${escapeHtml(sourceLabel)}\n\n${detailText}`;
}

// 双通道回执:
// - 群内场景:发闪屏给所有人(5 秒自动撤回) + 私聊详情**只发给主人 OWNER_ID**
// - 私聊场景:触发者本人收一份;如果 OWNER_ID 配置了且不是触发者,主人也收一份带操作人标记的副本
//
// 主人通知规则:
//   * OWNER_ID 未配置 → 跳过私聊投递,仅群闪屏
//   * 触发者就是 OWNER_ID → 发一份带"你自己"标记的详情(避免重复)
//   * 触发者非 OWNER_ID → 主人收带"🔔 操作人/来源"头的审计通知
//   * 私聊投递失败(主人没和 bot 私聊过等) → 仅记日志,不在群里追加任何"主人"字样
async function replyToAdmin(message, ctx, { flashText, detailText, isInGroup }) {
	const chatId = message.chat.id;
	const triggerId = message.from.id;
	const triggerIsOwner = OWNER_ID && String(triggerId) === OWNER_ID;
	const operator = formatUserMention(message.from) || `<code>${escapeHtml(String(triggerId))}</code>`;

	if (!isInGroup) {
		// 私聊场景:触发者本人收原详情(向后兼容)
		await sendTelegramMessage(chatId, detailText);
		// 如果触发者不是主人,主人也收一份审计副本
		if (OWNER_ID && !triggerIsOwner) {
			const role = classifyOperatorRole(triggerId, '管理员');
			const auditText = renderAuditNotification(operator, detailText, '私聊', role);
			const dmOwner = await sendTelegramMessage(OWNER_ID, auditText);
			if (!dmOwner?.ok) {
				console.error(`[审计通知] 私聊主人失败:${dmOwner?.description || '未知'}`);
			}
		}
		return;
	}

	// 群内:闪屏所有人可见(5 秒自动撤回)
	await sendFlashMessage(chatId, flashText, ctx);

	// 私聊详情:只投递给主人(如果配置了 OWNER_ID)
	if (OWNER_ID) {
		const auditText = triggerIsOwner
			? `🔔 <b>主人操作通知</b>\n👤 操作人:${operator}（你自己）\n📍 来源:群内\n\n${detailText}`
			: renderAuditNotification(operator, detailText, '群内', classifyOperatorRole(triggerId, '群管理员'));
		const dm = await sendTelegramMessage(OWNER_ID, auditText);
		if (!dm?.ok) {
			console.error(`[审计通知] 私聊主人失败:${dm?.description || '未知'}`);
			// 不在群里追加提示(避免群里其他成员看到"主人"字样,泄漏隐私)
		}
	}
	// OWNER_ID 未配置 → 退化为"只发群闪屏",其他管理员/超管不收任何私聊详情
}

// 批量添加：串行写 D1，最后只镜像 1 次到 KV，节省 N-1 次 KV 写入
async function addManyToBlacklist(ids, env, options = {}) {
	const results = { success: [], exists: [], failed: [] };
	for (const id of ids) {
		const r = await addToBlacklistCore(id, env, options);
		if (r.success) {
			results.success.push(id);
		} else if (r.message && r.message.includes('已在黑名单')) {
			results.exists.push(id);
		} else {
			results.failed.push({ id, msg: r.message || '失败' });
		}
	}
	if (env.DB && env.KV && results.success.length > 0) {
		await mirrorToKV(env);
	}
	return results;
}

// 批量移除
async function removeManyFromBlacklist(ids, env) {
	const results = { success: [], notFound: [], failed: [] };
	for (const id of ids) {
		const r = await removeFromBlacklistCore(id, env);
		if (r.success) {
			results.success.push(id);
		} else if (r.message && r.message.includes('不在黑名单')) {
			results.notFound.push(id);
		} else {
			results.failed.push({ id, msg: r.message || '失败' });
		}
	}
	if (env.DB && env.KV && results.success.length > 0) {
		await mirrorToKV(env);
	}
	return results;
}

// 渲染批量添加结果
// banSummary（可选）：{ success, banOkAll, banPartial, banFailedAll }
//   表示对每个加黑成功的用户做"全群踢"后的统计：完全成功 / 部分成功 / 全部失败
function renderBatchAddResult(results, invalid, banSummary) {
	const lines = ['✅ <b>批量添加完成</b>', ''];
	lines.push(`✅ 成功: ${results.success.length}`);
	if (results.exists.length) lines.push(`⚠️ 已存在: ${results.exists.length}`);
	if (invalid.length) lines.push(`❌ 格式错误: ${invalid.length}`);
	if (results.failed.length) lines.push(`❌ 失败: ${results.failed.length}`);

	if (banSummary && banSummary.success > 0) {
		lines.push('', '<b>踢人结果</b>:');
		lines.push(`🚫 全群踢出成功: ${banSummary.banOkAll}`);
		if (banSummary.banPartial) lines.push(`⚠️ 部分群踢出: ${banSummary.banPartial}`);
		if (banSummary.banFailedAll) lines.push(`❌ 全部群失败: ${banSummary.banFailedAll}（请检查 bot 是否为群管理员）`);
	}

	lines.push('', '<b>详情</b>:');
	for (const id of results.success) lines.push(`✅ <code>${id}</code> 已加入`);
	for (const id of results.exists) lines.push(`⚠️ <code>${id}</code> 已存在`);
	for (const id of invalid) lines.push(`❌ <code>${escapeHtml(id)}</code> 格式错误`);
	for (const f of results.failed) lines.push(`❌ <code>${f.id}</code> ${escapeHtml(f.msg)}`);

	return lines.join('\n');
}

// 渲染批量移除结果
function renderBatchRemoveResult(results, invalid) {
	const lines = ['✅ <b>批量移除完成</b>', ''];
	lines.push(`✅ 成功: ${results.success.length}`);
	if (results.notFound.length) lines.push(`⚠️ 不在黑名单: ${results.notFound.length}`);
	if (invalid.length) lines.push(`❌ 格式错误: ${invalid.length}`);
	if (results.failed.length) lines.push(`❌ 失败: ${results.failed.length}`);

	lines.push('', '<b>详情</b>:');
	for (const id of results.success) lines.push(`✅ <code>${id}</code> 已移除`);
	for (const id of results.notFound) lines.push(`⚠️ <code>${id}</code> 不在黑名单`);
	for (const id of invalid) lines.push(`❌ <code>${escapeHtml(id)}</code> 格式错误`);
	for (const f of results.failed) lines.push(`❌ <code>${f.id}</code> ${escapeHtml(f.msg)}`);

	return lines.join('\n');
}

// 一次性把 KV 黑名单迁移到 D1（INSERT OR IGNORE，幂等）
async function handleMigrate(env) {
	if (!env.DB) {
		return jsonResponse({ 成功: false, 错误: '未绑定 D1（binding=DB）' }, 400);
	}
	if (!env.KV) {
		return jsonResponse({ 成功: false, 错误: '未绑定 KV，无源数据可迁移' }, 400);
	}

	try {
		await ensureD1Table(env);
		const raw = await env.KV.get('blacklist', { type: 'json' });
		const items = normalizeBlacklist(raw);

		let inserted = 0;
		let skipped = 0;
		for (const entry of items) {
			const result = await env.DB
				.prepare('INSERT OR IGNORE INTO blacklist (id, reason, by_user, at) VALUES (?, ?, ?, ?)')
				.bind(entry.id, entry.reason, entry.by, entry.at)
				.run();
			const changed = result?.meta?.changes ?? result?.changes ?? 0;
			if (changed) inserted++;
			else skipped++;
		}

		// 迁移后再镜像一次，保证 KV 与 D1 完全一致
		await mirrorToKV(env);

		return jsonResponse({
			成功: true,
			KV源条数: items.length,
			D1新增: inserted,
			D1已存在: skipped
		});
	} catch (error) {
		console.error('迁移失败:', error);
		return jsonResponse({ 成功: false, 错误: error.message }, 500);
	}
}

// 黑名单导出接口（受 TOKEN 保护）
// 数据源选择：D1 优先（D1 不可用时回退 KV），与 getBlacklist 一致
// 输出格式：
//   ?format=json → application/json，触发浏览器下载
//   ?format=csv  → text/csv，UTF-8 + BOM，Excel 可直接打开
//   其它/默认    → HTML 表格，浏览器直接查看
async function handleExport(env, url) {
	if (!env.KV && !env.DB) {
		return new Response('❌ 未绑定 KV 或 D1 存储空间', { status: 400 });
	}

	let blacklist;
	try {
		blacklist = await getBlacklist(env);
	} catch (error) {
		console.error('导出读取黑名单失败:', error);
		return new Response('❌ 读取黑名单失败: ' + error.message, { status: 500 });
	}

	// 时间倒序：最新的在前
	const sorted = [...blacklist].sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
	const format = (url.searchParams.get('format') || '').toLowerCase();
	const ts = new Date().toISOString().replace(/[:.]/g, '-');

	if (format === 'json') {
		return new Response(JSON.stringify(sorted, null, 2), {
			headers: {
				'Content-Type': 'application/json; charset=UTF-8',
				'Content-Disposition': `attachment; filename="blacklist-${ts}.json"`,
				'Cache-Control': 'no-store'
			}
		});
	}

	if (format === 'csv') {
		const csvEscape = (v) => {
			const s = v === null || v === undefined ? '' : String(v);
			return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
		};
		const lines = ['id,reason,by,at'];
		for (const e of sorted) {
			lines.push([csvEscape(e.id), csvEscape(e.reason), csvEscape(e.by), csvEscape(e.at)].join(','));
		}
		// UTF-8 BOM 让 Excel 自动识别中文不乱码
		const body = '\uFEFF' + lines.join('\r\n');
		return new Response(body, {
			headers: {
				'Content-Type': 'text/csv; charset=UTF-8',
				'Content-Disposition': `attachment; filename="blacklist-${ts}.csv"`,
				'Cache-Control': 'no-store'
			}
		});
	}

	// 默认：HTML 视图
	const dataSource = env.DB ? 'D1（权威）' : 'KV';
	const reasonLabels = BLACKLIST_REASON_LABELS || {};
	const rows = sorted.map((e, i) => {
		const reasonText = e.reason ? (reasonLabels[e.reason] || e.reason) : '—';
		return `<tr>
			<td class="num">${i + 1}</td>
			<td class="id"><code>${escapeHtml(e.id)}</code></td>
			<td>${escapeHtml(reasonText)}</td>
			<td>${e.by ? `<code>${escapeHtml(e.by)}</code>` : '—'}</td>
			<td class="at">${escapeHtml(e.at || '—')}</td>
		</tr>`;
	}).join('');

	const downloadBase = url.pathname; // /{TOKEN}/export
	const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>黑名单导出 — TGUnbanBot-Plus</title>
<style>
	* { box-sizing: border-box; }
	body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; margin: 0; padding: 24px; background: #f5f7fa; color: #1f2937; }
	.wrap { max-width: 1100px; margin: 0 auto; }
	h1 { margin: 0 0 8px; font-size: 22px; }
	.meta { color: #6b7280; font-size: 14px; margin-bottom: 16px; }
	.bar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
	.btn { display: inline-block; padding: 8px 14px; border-radius: 6px; text-decoration: none; font-size: 14px; border: 1px solid #d1d5db; background: #fff; color: #1f2937; }
	.btn:hover { background: #f3f4f6; }
	.btn.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
	.btn.primary:hover { background: #1d4ed8; }
	.box { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
	table { width: 100%; border-collapse: collapse; font-size: 14px; }
	th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
	th { background: #f9fafb; font-weight: 600; color: #374151; position: sticky; top: 0; }
	tr:last-child td { border-bottom: none; }
	td.num { color: #9ca3af; width: 50px; }
	td.id, td.at { white-space: nowrap; }
	code { background: #f3f4f6; padding: 1px 6px; border-radius: 4px; font-size: 13px; }
	.empty { padding: 40px; text-align: center; color: #9ca3af; }
	.search { padding: 10px 14px; background: #fff; border-bottom: 1px solid #e5e7eb; }
	.search input { width: 100%; padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 14px; }
</style>
</head>
<body>
<div class="wrap">
	<h1>🚫 黑名单导出</h1>
	<div class="meta">数据源：${dataSource} ｜ 总计：<b>${sorted.length}</b> 条 ｜ 生成时间：${escapeHtml(new Date().toISOString())}</div>
	<div class="bar">
		<a class="btn primary" href="${downloadBase}">📋 网页查看</a>
		<a class="btn" href="${downloadBase}?format=json">⬇️ 下载 JSON</a>
		<a class="btn" href="${downloadBase}?format=csv">⬇️ 下载 CSV (Excel)</a>
	</div>
	<div class="box">
		${sorted.length === 0 ? '<div class="empty">黑名单为空</div>' : `
		<div class="search"><input id="q" type="text" placeholder="🔍 输入 TGID / 原因 / 操作人 过滤..." autocomplete="off"></div>
		<table>
			<thead><tr><th>#</th><th>TGID</th><th>原因</th><th>操作人</th><th>时间</th></tr></thead>
			<tbody id="tb">${rows}</tbody>
		</table>`}
	</div>
</div>
${sorted.length === 0 ? '' : `<script>
	const q = document.getElementById('q');
	const tb = document.getElementById('tb');
	const rows = Array.from(tb.querySelectorAll('tr'));
	q.addEventListener('input', () => {
		const k = q.value.trim().toLowerCase();
		for (const r of rows) {
			r.style.display = !k || r.textContent.toLowerCase().includes(k) ? '' : 'none';
		}
	});
</script>`}
</body>
</html>`;

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=UTF-8',
			'Cache-Control': 'no-store'
		}
	});
}

// 一次性清扫：扫描当前黑名单 × 所有 GROUP_IDS,把仍在群里的人全部踢出
// 受 TOKEN 保护（与 /migrate /export 同等防护级别）
// 串行执行避免 Telegram API 限流，先 checkUserStatus 跳过已离群/已踢的用户
async function handlePurge(env) {
	if (!env.KV && !env.DB) {
		return jsonResponse({ 成功: false, 错误: '未绑定 KV 或 D1 存储空间' }, 400);
	}
	if (!Array.isArray(GROUP_IDS) || GROUP_IDS.length === 0) {
		return jsonResponse({ 成功: false, 错误: 'GROUP_IDS 未配置' }, 400);
	}

	let blacklist;
	try {
		blacklist = await getBlacklist(env);
	} catch (error) {
		return jsonResponse({ 成功: false, 错误: '读取黑名单失败: ' + error.message }, 500);
	}

	const summary = {
		黑名单总数: blacklist.length,
		配置群组数: GROUP_IDS.length,
		已踢出: 0,
		不在群: 0,
		失败: 0,
		详情: []
	};

	for (const entry of blacklist) {
		for (const groupId of GROUP_IDS) {
			let status = null;
			try {
				const statusResult = await checkUserStatus(entry.id, groupId);
				status = statusResult?.result?.status ?? null;
			} catch (error) {
				console.error(`[purge] checkUserStatus 失败 user=${entry.id} group=${groupId}:`, error.message);
				summary.失败 += 1;
				summary.详情.push({ 用户ID: entry.id, 群ID: groupId, 结果: '查询状态失败', 错误: error.message });
				continue;
			}
			// 已踢出 / 已离开 → 跳过；left/kicked 是 Telegram 返回的"非群成员"状态
			if (status === 'kicked' || status === 'left' || status === null) {
				summary.不在群 += 1;
				continue;
			}
			const r = await banUserFromGroup(groupId, entry.id);
			if (r.ok) {
				summary.已踢出 += 1;
				summary.详情.push({ 用户ID: entry.id, 群ID: groupId, 旧状态: status, 结果: '已踢' });
			} else {
				summary.失败 += 1;
				summary.详情.push({ 用户ID: entry.id, 群ID: groupId, 旧状态: status, 结果: '失败', 错误: r.error });
			}
		}
	}

	return jsonResponse({ 成功: true, ...summary });
}

// 渲染黑名单为 HTML 文本（用于 /blacklist 命令展示）
function renderBlacklist(blacklist, options = {}) {
	const limit = options.limit ?? BLACKLIST_PAGE_LIMIT;
	const total = blacklist.length;

	if (total === 0) {
		return '📋 <b>当前黑名单</b>\n\n（空）';
	}

	const reasonLabels = BLACKLIST_REASON_LABELS;
	const visible = blacklist.slice(-limit).reverse(); // 最近添加的排前面

	let lines = [`📋 <b>当前黑名单</b>（共 ${total} 条${total > limit ? `，仅显示最近 ${limit} 条` : ''}）`, ''];

	for (const entry of visible) {
		const idLink = `<a href="tg://user?id=${escapeHtml(entry.id)}">${escapeHtml(entry.id)}</a>`;
		const parts = [`• ${idLink}`];
		if (entry.reason) {
			parts.push(`原因：${escapeHtml(reasonLabels[entry.reason] || entry.reason)}`);
		}
		if (entry.by) {
			parts.push(`操作人：<code>${escapeHtml(entry.by)}</code>`);
		}
		if (entry.at) {
			parts.push(`时间：${escapeHtml(entry.at)}`);
		}
		lines.push(parts.join(' · '));
	}

	return lines.join('\n');
}

function isSpamCommand(text) {
	if (!text) {
		return false;
	}

	const trimmedText = text.trim();
	// 接受 /spam 和 /spam@任意机器人用户名，不限定必须 @ 当前机器人。
	return /^\/spam(?:@[^\s]+)?(?:\s|$)/i.test(trimmedText);
}

function isCheckCommand(text) {
	if (!text) {
		return false;
	}

	const trimmedText = text.trim();
	return /^\/check(?:@[^\s]+)?(?:\s|$)/i.test(trimmedText);
}

// 判断给定 chat_id 是否属于配置的任一群组
function isConfiguredGroup(chatId) {
	if (chatId === undefined || chatId === null) {
		return false;
	}
	const idStr = chatId.toString();
	return GROUP_IDS.some((g) => g.toString() === idStr);
}

// 判断给定 user_id 是否在超级管理员白名单内（按钮交互专用鉴权）
function isSuperAdmin(userId) {
	if (userId === undefined || userId === null) return false;
	const idStr = String(userId);
	return SUPER_ADMINS.some((id) => id === idStr);
}

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function formatUserMention(user) {
	if (!user?.id) {
		return null;
	}

	const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.id;
	return `<a href="tg://user?id=${user.id}">${escapeHtml(displayName)}</a>`;
}

// 按 TGID 拉用户信息(遍历配置群,任一群命中即返回名字 mention + TGID)
// 失败/没在任何群里时,返回纯 TGID code
async function formatTargetByTgid(tgid) {
	const idStr = String(tgid);
	for (const groupId of GROUP_IDS) {
		try {
			const result = await checkUserStatus(idStr, groupId);
			const user = result?.result?.user;
			if (user && user.id) {
				return `${formatUserMention(user)} <code>${escapeHtml(idStr)}</code>`;
			}
		} catch (_) {
			// 单群失败继续下一个
		}
	}
	return `<code>${escapeHtml(idStr)}</code>`;
}

async function buildBanlistCheckResponse(tgidToCheck, options = {}) {
	const banlistResult = await handleBanlist(tgidToCheck);
	const banlistData = JSON.parse(banlistResult);

	if (!banlistData.success) {
		return {
			text: `❌ <b>查询失败</b>\n\n${escapeHtml(banlistData.error || '未知错误')}`
		};
	}

	if (!banlistData.banned) {
		let responseMessage = `✅ <b>查询结果</b>\n\nTGID <code>${escapeHtml(tgidToCheck)}</code> 没有封禁记录。`;
		if (options.targetUser) {
			responseMessage = `✅ <b>查询结果</b>\n\n用户 ${formatUserMention(options.targetUser) || `<code>${escapeHtml(tgidToCheck)}</code>`} 没有封禁记录。\nTGID: <code>${escapeHtml(tgidToCheck)}</code>`;
		}

		return { text: responseMessage };
	}

	let responseMessage = `🔍 <b>封禁查询结果</b>\n\n`;
	if (options.targetUser) {
		responseMessage += `👤 <b>用户:</b> ${formatUserMention(options.targetUser) || `<code>${escapeHtml(tgidToCheck)}</code>`}\n`;
	}
	responseMessage += `📋 <b>TGID:</b> <a href="tg://user?id=${escapeHtml(tgidToCheck)}">${escapeHtml(tgidToCheck)}</a>\n`;

	if (banlistData.chatId) {
		const chatInfo = await getChatInfoFromId(banlistData.chatId);
		responseMessage += `💬 <b>ChatID:</b> <code>${escapeHtml(banlistData.chatId)}</code>`;
		if (chatInfo && chatInfo.title) {
			if (chatInfo.link) {
				responseMessage += `(<a href="${escapeHtml(chatInfo.link)}">${escapeHtml(chatInfo.title)}</a>)`;
			} else {
				responseMessage += `(${escapeHtml(chatInfo.title)})`;
			}
		}
		responseMessage += `\n`;
	}

	if (banlistData.msgId) responseMessage += `📨 <b>MsgID:</b> <code>${escapeHtml(banlistData.msgId)}</code>\n`;
	if (banlistData.recordedDate) responseMessage += `📅 <b>封禁日期:</b> ${escapeHtml(banlistData.recordedDate)}\n`;
	if (banlistData.reason) responseMessage += `⚠️ <b>封禁原因:</b> ${escapeHtml(banlistData.reason)}\n`;
	if (banlistData.info) responseMessage += `\n📝 <b>封禁内容:</b>\n<tg-spoiler>${escapeHtml(banlistData.info)}</tg-spoiler>\n`;

	if (!options.includeReviewAction) {
		return { text: responseMessage };
	}

	const 黑白名单 = isConfiguredGroup(banlistData.chatId) ? '移出黑名单' : '添加白名单';
	const copyText = `GKYbotSave\n${banlistData.tgid}`;
	// 代发目标群：黑名单记录在配置群内 → 该群；否则 → 主群（保留"添加白名单"需在主群发的语义）
	const dispatchChatId = isConfiguredGroup(banlistData.chatId) ? banlistData.chatId : GROUP_ID;
	if (options.actionInCurrentChat) {
		responseMessage += `\n若同意 <b>${黑白名单}</b>，超级管理员可点击下方按钮一键代发，或复制代码手动发送 👇`;
	} else {
		const groupInfo = await getGroupInfo();
		responseMessage += `\n若同意 <b>${黑白名单}</b>，超级管理员可点击下方按钮一键代发，或返回 ${escapeHtml(groupInfo.username)} 群组发送以下代码 👇`;
	}

	return {
		text: responseMessage,
		replyMarkup: {
			inline_keyboard: [
				[{ text: `✅ 同意 ${黑白名单}（一键代发）`, callback_data: `gky:a:${banlistData.tgid}:${dispatchChatId}` }],
				[{ text: `📋 点击复制 ${黑白名单} 代码`, copy_text: { text: copyText } }]
			]
		}
	};
}

const BOT_MODERATION_LOG_LABELS = {
	'new-members:found': '检测到新成员入群消息',
	'skip:new-members-not-target-chat': '跳过：新成员消息不在配置的群组列表内',
	'skip:new-member-not-bot': '跳过：新成员不是机器人',
	'skip:new-member-self': '跳过：新成员是当前机器人自己',
	'new-member-admin-status': '已查询新入群机器人在群里的身份',
	'skip:new-member-admin-status-check-failed': '跳过：无法确认新入群机器人是否为管理员，为避免误伤不处理',
	'skip:new-member-admin-bot': '跳过：新入群机器人是群管理员',
	'action:mute-new-bot:start': '开始处理：禁言新入群的非管理员机器人',
	'action:mute-new-bot:success': '处理成功：已禁言新入群的非管理员机器人',
	'action:mute-new-bot:failed': '处理失败：禁言新入群机器人失败',
	'skip:no-message-from': '跳过：消息没有 from 字段，无法按普通用户消息处理',
	'skip:self-bot-id-missing': '跳过：无法获取当前机器人的 ID，为避免误伤不处理',
	'telegram-api:restrictChatMember:response': 'Telegram接口返回：禁言'
};

function logBotModeration(step, details = {}) {
	const label = BOT_MODERATION_LOG_LABELS[step] || step;

	try {
		console.log(`[机器人风控] ${label}: ${JSON.stringify(details)}`);
	} catch (error) {
		console.log(`[机器人风控] ${label}: 日志详情序列化失败：${error.message}`);
	}
}

function getMessageLogInfo(message) {
	const sender = message?.from;
	const chat = message?.chat;

	return {
		消息ID: message?.message_id,
		聊天ID: chat?.id,
		聊天类型: chat?.type,
		配置群组列表: GROUP_IDS,
		发送者ID: sender?.id,
		发送者用户名: sender?.username,
		发送者昵称: sender?.first_name,
		发送者是否机器人: sender?.is_bot,
		文本预览: typeof message?.text === 'string' ? message.text.slice(0, 80) : null
	};
}

function getNewMemberLogInfo(message, member) {
	return {
		...getMessageLogInfo(message),
		新成员ID: member?.id,
		新成员用户名: member?.username,
		新成员昵称: member?.first_name,
		新成员是否机器人: member?.is_bot
	};
}

async function handleNewChatMemberBots(message) {
	const chat = message.chat;
	const newMembers = message.new_chat_members;

	if (!Array.isArray(newMembers) || newMembers.length === 0) {
		return false;
	}

	logBotModeration('new-members:found', {
		...getMessageLogInfo(message),
		新成员数量: newMembers.length
	});

	if (!chat || !isConfiguredGroup(chat.id)) {
		logBotModeration('skip:new-members-not-target-chat', getMessageLogInfo(message));
		return true;
	}

	const currentBotId = await getBotId();
	if (!currentBotId) {
		logBotModeration('skip:self-bot-id-missing', getMessageLogInfo(message));
		return true;
	}

	for (const member of newMembers) {
		const logInfo = getNewMemberLogInfo(message, member);

		if (!member?.is_bot) {
			logBotModeration('skip:new-member-not-bot', logInfo);
			continue;
		}

		if (member.id.toString() === currentBotId.toString()) {
			logBotModeration('skip:new-member-self', {
				...logInfo,
				当前机器人ID: currentBotId
			});
			continue;
		}

		let isAdmin = false;
		try {
			const statusResult = await checkUserStatus(member.id);
			const status = statusResult.result.status;
			isAdmin = status === 'creator' || status === 'administrator';
			logBotModeration('new-member-admin-status', {
				...logInfo,
				群成员状态: status,
				是否管理员: isAdmin
			});
		} catch (error) {
			logBotModeration('skip:new-member-admin-status-check-failed', {
				...logInfo,
				错误: error.message
			});
			continue;
		}

		if (isAdmin) {
			logBotModeration('skip:new-member-admin-bot', logInfo);
			continue;
		}

		try {
			logBotModeration('action:mute-new-bot:start', logInfo);
			await muteChatMember(chat.id, member.id);
			logBotModeration('action:mute-new-bot:success', logInfo);
		} catch (error) {
			logBotModeration('action:mute-new-bot:failed', {
				...logInfo,
				错误: error.message
			});
		}
	}

	return true;
}

// 处理 chat_member 事件：管理员手动封/解封时同步 KV 黑名单
// 加黑：从其它状态 → kicked
// 移黑：从 kicked → 任意其它状态
async function handleChatMemberUpdate(chatMember, env) {
	if (!chatMember || (!env.KV && !env.DB)) return;

	const chat = chatMember.chat;
	const oldMember = chatMember.old_chat_member;
	const newMember = chatMember.new_chat_member;
	const fromUser = chatMember.from;

	if (!chat || !oldMember || !newMember || !fromUser) return;

	// 必须是配置群组
	if (!isConfiguredGroup(chat.id)) return;

	const targetUser = newMember.user || oldMember.user;
	if (!targetUser?.id) return;

	const targetIdStr = String(targetUser.id);
	const fromIdStr = String(fromUser.id);

	// 跳过：被操作用户是机器人（不要把别的机器人加入黑名单 / 误踢）
	if (targetUser.is_bot) return;

	// 复入群拦截：用户从非成员状态变为 member/restricted（被拉进群、点链接加群、unban 后自加回）
	// 先于"操作人 === 用户本人"检查，因为自加群时 from === target，会被后面跳过逻辑拦掉
	const oldStatusEarly = oldMember.status;
	const newStatusEarly = newMember.status;
	const enteredGroup =
		(newStatusEarly === 'member' || newStatusEarly === 'restricted') &&
		oldStatusEarly !== 'member' &&
		oldStatusEarly !== 'restricted' &&
		oldStatusEarly !== 'administrator' &&
		oldStatusEarly !== 'creator';
	if (enteredGroup) {
		const blacklistCheck = await checkBlacklist(targetIdStr, env);
		if (blacklistCheck.isBlacklisted) {
			const banResult = await banUserFromGroup(chat.id, targetIdStr);
			console.log('[chat_member] 黑名单用户复入群，立即踢回:', JSON.stringify({
				群ID: chat.id,
				用户ID: targetIdStr,
				旧状态: oldStatusEarly,
				新状态: newStatusEarly,
				踢人结果: banResult.ok ? '成功' : `失败:${banResult.error}`
			}));
			return; // 已处理，不再走后面"管理员操作同步"分支
		}
	}

	// 跳过：操作人是被操作用户本人（用户自愿 leave 不算管理员动作）
	if (targetIdStr === fromIdStr) return;

	// 跳过：操作人是机器人自己（避免与自助解封形成循环）
	const selfBotId = await getBotId();
	if (selfBotId && fromIdStr === String(selfBotId)) return;

	const oldStatus = oldMember.status;
	const newStatus = newMember.status;
	if (oldStatus === newStatus) return;

	const logCommon = {
		群ID: chat.id,
		操作人ID: fromIdStr,
		被操作用户ID: targetIdStr,
		旧状态: oldStatus,
		新状态: newStatus
	};

	if (newStatus === 'kicked') {
		// 管理员手动封禁 → 加黑
		const result = await addToBlacklist(targetIdStr, env, { reason: 'manual_ban', by: fromIdStr });
		console.log('[chat_member] 同步加黑:', JSON.stringify({ ...logCommon, 结果: result.success ? '已加入' : result.message }));
		await notifyOwnerChatMemberAction(chatMember, '加黑', oldStatus, newStatus);
	} else if (oldStatus === 'kicked') {
		// 管理员手动解封 → 移黑（仅当原本在黑名单里才会有变化）
		const result = await removeFromBlacklist(targetIdStr, env);
		console.log('[chat_member] 同步移黑:', JSON.stringify({ ...logCommon, 结果: result.success ? '已移除' : result.message }));
		await notifyOwnerChatMemberAction(chatMember, '解黑', oldStatus, newStatus);
	}
}

// 把 Telegram 的成员状态(英文)翻译成中文标签,带 emoji 直观显示
// 参考: https://core.telegram.org/bots/api#chatmember
function translateMemberStatus(status) {
	const map = {
		creator: '👑 群主',
		administrator: '🛡️ 管理员',
		member: '👤 普通成员',
		restricted: '🔇 被限制(禁言/限权)',
		left: '🚪 已离群',
		kicked: '🚫 已踢出/已封禁',
	};
	return map[status] || `❔ ${status || '未知'}`;
}

// 主人审计通知:群内管理员手动 ban/unban 时,把事件发给主人
// 已豁免:OWNER_ID 未配置 / 操作人就是主人本人 / 操作人是机器人(其它 bot 的操作不通知)
async function notifyOwnerChatMemberAction(chatMember, action, oldStatus, newStatus) {
	if (!OWNER_ID) return;
	const fromIdStr = String(chatMember.from?.id || '');
	if (fromIdStr === OWNER_ID) return;

	// 过滤机器人操作:只通知真人管理员的操作
	// 例外:GroupAnonymousBot(1087968824)是"匿名管理员"——真人开了匿名,仍需通知
	const ANON_ADMIN_BOT = '1087968824';
	if (chatMember.from?.is_bot && fromIdStr !== ANON_ADMIN_BOT) {
		console.log(`[审计通知] 跳过机器人操作:${fromIdStr}（${chatMember.from?.first_name || ''}）`);
		return;
	}

	const operator = chatMember.from
		? formatUserMention(chatMember.from)
		: `<code>${escapeHtml(fromIdStr || '未知')}</code>`;
	const role = classifyOperatorRole(fromIdStr, '群管理员');
	const targetUser = chatMember.new_chat_member?.user;
	const target = targetUser
		? formatUserMention(targetUser)
		: `<code>${escapeHtml(String(targetUser?.id || '未知'))}</code>`;

	// 拉群名(失败时退回 ID 显示)
	let groupLabel = `<code>${escapeHtml(String(chatMember.chat.id))}</code>`;
	try {
		const info = await getChatInfoFromId(chatMember.chat.id);
		if (info?.title) {
			groupLabel = `<b>${escapeHtml(info.title)}</b> <code>${escapeHtml(String(chatMember.chat.id))}</code>`;
		}
	} catch (_) {
		// 拉群名失败不影响通知主流程
	}

	const auditText =
		`🔔 <b>${escapeHtml(role)}操作通知</b>\n` +
		`🎬 操作:群内手动 ${escapeHtml(action)}\n` +
		`👤 操作人:${operator}（${escapeHtml(role)}）\n` +
		`🎯 目标用户:${target}\n` +
		`📍 群:${groupLabel}\n` +
		`📋 状态变更:${translateMemberStatus(oldStatus)} → ${translateMemberStatus(newStatus)}`;

	const dm = await sendTelegramMessage(OWNER_ID, auditText);
	if (!dm?.ok) {
		console.error(`[审计通知] chat_member → 主人失败:${dm?.description || '未知'}`);
	}
}

// ===== 广告自动检测 =====

// 收集消息里所有 URL(entities + caption_entities 里的 url / text_link)
function collectUrls(message) {
	const urls = [];
	const ents = [...(message.entities || []), ...(message.caption_entities || [])];
	const base = message.text || message.caption || '';
	for (const e of ents) {
		if (e.type === 'text_link' && e.url) {
			urls.push(e.url);
		} else if (e.type === 'url' && typeof e.offset === 'number') {
			urls.push(base.substring(e.offset, e.offset + e.length));
		}
	}
	return urls;
}

// 广告检测(多维度评分 + 强特征直杀)
// 返回 { isAd, score, hits: string[], strong: string|null }
function detectAd(message) {
	if (!AD_FILTER_ENABLED) return { isAd: false, score: 0, hits: [], strong: null };

	const textParts = [
		message.text,
		message.caption,
		message.from?.first_name,
		message.from?.last_name,
		message.from?.username,
	].filter(Boolean);
	const fullText = textParts.join(' ').toLowerCase();
	const hits = [];

	// 白名单:把白名单词从计分文本里挖掉(命中也不计分)
	let scoringText = fullText;
	for (const w of AD_WHITELIST) {
		if (w) scoringText = scoringText.split(w).join('');
	}

	const urls = collectUrls(message);

	// 强特征 1:t.me / telegram.me 私有群邀请链接
	const inviteLink = /t\.me\/\+|t\.me\/joinchat\/|telegram\.me\/\+/i;
	if (inviteLink.test(fullText) || urls.some((u) => inviteLink.test(u))) {
		return { isAd: true, score: 99, hits: ['t.me邀请链接'], strong: 't.me邀请链接' };
	}

	// 强特征 2:国际电话号(+国家码 区号 号码)
	const phonePattern = /\+\d{1,3}[\s-]?\d{2,4}[\s-]?\d{3,4}[\s-]?\d{2,4}/;
	if (phonePattern.test(fullText)) {
		return { isAd: true, score: 99, hits: ['国际电话号'], strong: '国际电话号' };
	}

	// 加权评分
	let score = 0;
	for (const w of AD_KEYWORDS_FINANCE) if (w && scoringText.includes(w)) { score += 2; hits.push(`金融:${w}`); }
	for (const w of AD_KEYWORDS_PORN) if (w && scoringText.includes(w)) { score += 2; hits.push(`色情:${w}`); }
	for (const w of AD_KEYWORDS_SPAM) if (w && scoringText.includes(w)) { score += 1; hits.push(`引流:${w}`); }
	for (const w of AD_KEYWORDS_FRAUD) if (w && scoringText.includes(w)) { score += 2; hits.push(`诈骗:${w}`); }
	for (const w of AD_KEYWORDS) if (w && scoringText.includes(w)) { score += 2; hits.push(`自定义:${w}`); }

	// 高危 emoji 密度 ≥3
	const emojiCount = AD_RISK_EMOJI.reduce((n, e) => n + (fullText.split(e).length - 1), 0);
	if (emojiCount >= 3) { score += 1; hits.push(`emoji密度${emojiCount}`); }

	// 纯链接刷屏:有外链 + 文本很短
	if (urls.length > 0 && fullText.length < 20) { score += 1; hits.push('短文本+链接'); }

	return { isAd: score >= AD_SCORE_THRESHOLD, score, hits, strong: null };
}

// 广告拦截后通知主人
async function notifyOwnerAdDetection(message, adResult, banResults) {
	if (!OWNER_ID) return;
	const fromUser = message.from;
	const operator = formatUserMention(fromUser) || `<code>${escapeHtml(String(fromUser?.id || '未知'))}</code>`;
	const preview = escapeHtml((message.text || message.caption || '(无文本)').slice(0, 100));
	const reason = adResult.strong
		? `强特征命中:${adResult.strong}`
		: `评分 ${adResult.score}（${adResult.hits.slice(0, 6).join('、')}）`;

	// 拉群名
	let groupLabel = `<code>${escapeHtml(String(message.chat.id))}</code>`;
	try {
		const info = await getChatInfoFromId(message.chat.id);
		if (info?.title) groupLabel = `<b>${escapeHtml(info.title)}</b> <code>${escapeHtml(String(message.chat.id))}</code>`;
	} catch (_) {}

	const lines = [
		`🤖 <b>广告自动拦截</b>`,
		`🎬 操作:自动删消息 + 加黑 + 全群踢`,
		`👤 广告账号:${operator} <code>${escapeHtml(String(fromUser?.id || '未知'))}</code>`,
		`📍 触发群:${groupLabel}`,
		`🔍 判定依据:${escapeHtml(reason)}`,
		`📝 内容预览:${preview}`,
		'',
		await renderBanResultsDetail(banResults),
	];
	const dm = await sendTelegramMessage(OWNER_ID, lines.join('\n'));
	if (!dm?.ok) {
		console.error(`[广告检测] 通知主人失败:${dm?.description || '未知'}`);
	}
}

// 应答 callback_query，让前端按钮停止 loading 并可选弹出提示气泡
async function answerCallbackQuery(callbackQueryId, text, showAlert = false) {
	try {
		const url = `https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`;
		const body = { callback_query_id: callbackQueryId };
		if (text) body.text = text;
		if (showAlert) body.show_alert = true;
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		return await response.json();
	} catch (error) {
		console.error('answerCallbackQuery 失败:', error);
	}
}

// 编辑消息的 inline_keyboard（用于按钮点击后清除按钮防止重复点击）
async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
	try {
		const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`;
		const body = {
			chat_id: chatId,
			message_id: messageId,
			reply_markup: replyMarkup || { inline_keyboard: [] }
		};
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		return await response.json();
	} catch (error) {
		console.error('editMessageReplyMarkup 失败:', error);
	}
}

// 处理 callback_query：当前仅支持 gky:a:{tgid}:{chatId} 一键代发 GKYbotSave
async function handleCallbackQuery(cb, env) {
	if (!cb) return;
	const data = cb.data || '';
	const fromUser = cb.from;
	const message = cb.message;

	if (!fromUser?.id || !message) {
		await answerCallbackQuery(cb.id, '❌ 参数缺失', true);
		return;
	}

	// 仅超级管理员可点击按钮
	if (!isSuperAdmin(fromUser.id)) {
		await answerCallbackQuery(cb.id, '❌ 此按钮仅限超级管理员使用', true);
		console.log('[callback_query] 非超管点击:', JSON.stringify({ 用户ID: fromUser.id, 按钮数据: data }));
		return;
	}

	// 解析 gky:a:{tgid}:{chatId}
	const parts = data.split(':');
	if (parts.length !== 4 || parts[0] !== 'gky' || parts[1] !== 'a') {
		await answerCallbackQuery(cb.id, '❌ 未知的按钮指令', true);
		return;
	}

	const tgid = parts[2];
	const dispatchChatId = parts[3];
	if (!/^\d+$/.test(tgid) || !/^-?\d+$/.test(dispatchChatId)) {
		await answerCallbackQuery(cb.id, '❌ 参数格式错误', true);
		return;
	}

	// 代发 GKYbotSave 指令到目标群（纯文本，不带 HTML）
	try {
		const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
		const body = {
			chat_id: dispatchChatId,
			text: `GKYbotSave\n${tgid}`
		};
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const result = await response.json();

		if (response.ok && result.ok) {
			await answerCallbackQuery(cb.id, '✅ 已代发 GKYbotSave 指令');
			// 在原消息上追加操作记录并清除按钮
			const fromName = [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ') || fromUser.username || fromUser.id;
			const note = `\n\n✅ 已由超级管理员 <a href="tg://user?id=${fromUser.id}">${escapeHtml(fromName)}</a> 一键代发。`;
			try {
				const editUrl = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
				const editBody = {
					chat_id: message.chat.id,
					message_id: message.message_id,
					text: (message.text || message.caption || '') + note,
					parse_mode: 'HTML',
					disable_web_page_preview: true
				};
				await fetch(editUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(editBody)
				});
			} catch (_) {
				// 编辑失败不影响主流程，至少把按钮清掉
				await editMessageReplyMarkup(message.chat.id, message.message_id, { inline_keyboard: [] });
			}
			console.log('[callback_query] 代发成功:', JSON.stringify({ 操作人: fromUser.id, TGID: tgid, 目标群: dispatchChatId }));

			// 主人审计通知:操作人不是主人时,把"一键解封"事件发给主人
			if (OWNER_ID && String(fromUser.id) !== OWNER_ID) {
				const operator = formatUserMention(fromUser) || `<code>${escapeHtml(String(fromUser.id))}</code>`;
				const role = classifyOperatorRole(fromUser.id, '超级管理员');
				// 拉目标群名
				let dispatchGroupLabel = `<code>${escapeHtml(String(dispatchChatId))}</code>`;
				try {
					const info = await getChatInfoFromId(dispatchChatId);
					if (info?.title) {
						dispatchGroupLabel = `<b>${escapeHtml(info.title)}</b> <code>${escapeHtml(String(dispatchChatId))}</code>`;
					}
				} catch (_) {}
				const auditText = `🔔 <b>${escapeHtml(role)}操作通知</b>\n` +
					`🎬 操作:一键解封代发\n` +
					`👤 操作人:${operator}（${escapeHtml(role)}）\n` +
					`🎯 目标用户:<code>${escapeHtml(String(tgid))}</code>\n` +
					`📍 目标群:${dispatchGroupLabel}\n` +
					`✅ 已代发 GKYbotSave 指令`;
				const dmOwner = await sendTelegramMessage(OWNER_ID, auditText);
				if (!dmOwner?.ok) {
					console.error(`[审计通知] 一键解封 → 主人失败:${dmOwner?.description || '未知'}`);
				}
			}
		} else {
			await answerCallbackQuery(cb.id, `❌ 代发失败: ${result.description || '未知错误'}`, true);
			console.error('[callback_query] 代发失败:', result);
		}
	} catch (error) {
		await answerCallbackQuery(cb.id, '❌ 代发异常', true);
		console.error('[callback_query] 代发异常:', error);
	}
}

async function handleMessage(message, env, ctx) {
	if (await handleNewChatMemberBots(message)) {
		return;
	}

	if (!message.from) {
		logBotModeration('skip:no-message-from', getMessageLogInfo(message));
		return;
	}

	const chatId = message.chat.id;
	const userId = message.from.id;
	const text = message.text;
	const username = message.from.username || message.from.first_name || '用户';

	// 黑名单兜底：已黑用户在配置群里发言 → 删消息 + 立即踢出
	// 排除 bot 自身 / 私聊 / 群管理员（避免误伤误加黑的管理员）
	// 命令命中后 return，不进入后续命令分发
	if (
		isConfiguredGroup(chatId) &&
		message.from &&
		!message.from.is_bot
	) {
		const blacklistCheck = await checkBlacklist(userId, env);
		if (blacklistCheck.isBlacklisted) {
			// 双保险：管理员豁免，避免误加黑导致管理员被踢
			const isAdmin = await checkIfUserIsAdmin(userId);
			if (!isAdmin) {
				console.log(`[黑名单拦截] 用户 ${userId} 在群 ${chatId} 发言，删消息+踢人`);
				await deleteMessage(chatId, message.message_id);
				await banUserFromGroup(chatId, userId);
				return;
			}
		}
	}

	// 广告自动检测：普通成员发的疑似广告 → 删消息 + 加黑 + 全群踢 + 通知主人
	// 在黑名单拦截之后、命令分发之前；管理员豁免
	if (AD_FILTER_ENABLED && isConfiguredGroup(chatId) && message.from && !message.from.is_bot) {
		const adResult = detectAd(message);
		if (adResult.isAd) {
			const isAdmin = await checkIfUserIsAdmin(userId);
			if (!isAdmin) {
				console.log(`[广告检测] 命中 用户=${userId} 群=${chatId} 分数=${adResult.score} 特征=${adResult.hits.join('/')}`);
				await deleteMessage(chatId, message.message_id);
				await addToBlacklist(userId, env, { reason: 'ad_auto', by: 'system' });
				const banResults = await banUserFromAllGroups(userId);
				await notifyOwnerAdDetection(message, adResult, banResults);
				return;
			}
		}
	}

	// 处理配置群组内管理员回复 /spam - 添加被回复用户到黑名单
	if (isSpamCommand(text)) {
		if (!isConfiguredGroup(chatId)) {
			return;
		}

		const isAdmin = await checkIfUserIsAdmin(userId);
		if (!isAdmin) {
			return;
		}

		const repliedUserId = message.reply_to_message?.from?.id;
		if (!repliedUserId) {
			await sendTelegramMessage(chatId, '❌ 请回复要加入黑名单的用户消息后再发送 <code>/spam</code>');
			return;
		}

		const result = await addToBlacklist(repliedUserId, env, { reason: 'spam', by: userId });
		const linkedUserId = `<a href="tg://user?id=${repliedUserId}">${repliedUserId}</a>`;

		if (result.success) {
			// 加黑成功 → 全群踢人 + 删除被回复的垃圾消息
			const banResults = await banUserFromAllGroups(repliedUserId);
			const repliedMsgId = message.reply_to_message.message_id;
			const delResult = await deleteMessage(chatId, repliedMsgId);

			const lines = [
				`🎬 操作:举报加黑(/spam)`,
				`🎯 目标用户:${linkedUserId} <code>${escapeHtml(String(repliedUserId))}</code>`,
				'',
				`✅ 已将用户 ${linkedUserId} 添加到黑名单`,
				await renderBanResultsDetail(banResults),
			];
			if (delResult.ok) {
				lines.push('🗑️ 已删除被回复的垃圾消息');
			} else {
				const { 中文, 建议 } = translateTelegramError(delResult.error);
				lines.push(`⚠️ 删除消息失败:${escapeHtml(中文)}\n   建议:${escapeHtml(建议)}`);
			}

			await replyToAdmin(message, ctx, {
				flashText: `✅ 已加黑 ${linkedUserId}`,
				detailText: lines.join('\n'),
				isInGroup: true
			});
		} else {
			// 写库失败(已存在 / 未绑存储等)— 也走双通道,字段齐全
			const plainMsg = result.message.replace(/<[^>]+>/g, '');
			const failLines = [
				`🎬 操作:举报加黑(/spam)`,
				`🎯 目标用户:${linkedUserId} <code>${escapeHtml(String(repliedUserId))}</code>`,
				'',
			];
			if (result.message && result.message.includes('已在黑名单')) {
				// "已在黑名单"场景:用更友好的提示替代原文案,避免重复
				failLines.push('⚠️ <b>该用户已在黑名单中,请勿重复添加</b>');
			} else {
				failLines.push(result.message);
			}
			await replyToAdmin(message, ctx, {
				flashText: `⚠️ ${linkedUserId}: ${escapeHtml(plainMsg)}`,
				detailText: failLines.join('\n'),
				isInGroup: true
			});
		}
		return;
	}

	// 处理配置群组内管理员回复 /check - 查询被回复用户封禁状态
	if (isCheckCommand(text)) {
		if (!isConfiguredGroup(chatId)) {
			return;
		}

		const isAdmin = await checkIfUserIsAdmin(userId);
		if (!isAdmin) {
			return;
		}

		const repliedUser = message.reply_to_message?.from;
		if (!repliedUser?.id) {
			await sendTelegramMessage(chatId, '❌ 请回复要查询封禁状态的用户消息后再发送 <code>/check</code>');
			return;
		}

		const tgidToCheck = repliedUser.id.toString();
		await sendTelegramMessage(chatId, `正在查询 TGID: <code>${tgidToCheck}</code> 的封禁状态...`);
		const response = await buildBanlistCheckResponse(tgidToCheck, {
			targetUser: repliedUser,
			includeReviewAction: true,
			actionInCurrentChat: true
		});
		await sendTelegramMessage(chatId, response.text, response.replyMarkup);
		return;
	}

	// 处理 /start 命令（包含 deep link 参数）
	if (text && text.startsWith('/start')) {
		// 检查是否有参数 (例如: /start check_8435016129)
		const parts = text.split(' ');
		if (parts.length > 1 && parts[1].startsWith('check_')) {
			// 验证用户是否是群组管理员
			const isAdmin = await checkIfUserIsAdmin(userId);

			if (!isAdmin) {
				const groupInfo = await getGroupInfo();
				await sendTelegramMessage(chatId, `❌ <b>权限不足</b>\n\n此功能仅限 ${groupInfo.title} 的管理员使用。`);
				return;
			}

			// 提取 TGID
			const tgidToCheck = parts[1].replace('check_', '');
			await sendTelegramMessage(chatId, `正在查询 TGID: <code>${tgidToCheck}</code> 的封禁状态...`);
			const response = await buildBanlistCheckResponse(tgidToCheck, { includeReviewAction: true });
			await sendTelegramMessage(chatId, response.text, response.replyMarkup);

			return;
		}

		// 普通的 /start 命令，显示欢迎消息
	}

	// 处理 /blacklist 命令 - 私聊管理员查看 KV 黑名单
	if (text && /^\/blacklist(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		if (message.chat.type !== 'private') {
			return; // 非私聊不予回复
		}

		const isAdmin = await checkIfUserIsAdmin(userId);
		if (!isAdmin) {
			await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限群组管理员使用。');
			return;
		}

		if (!env.KV && !env.DB) {
			await sendTelegramMessage(chatId, '❌ 未绑定 KV 或 D1 存储空间，无法查看黑名单。');
			return;
		}

		const blacklist = await getBlacklist(env);
		await sendTelegramMessage(chatId, renderBlacklist(blacklist));
		return;
	}

	// 处理 /ban 命令 - 添加用户到黑名单（支持批量、群内/私聊双场景）
	if (text && text.startsWith('/ban ')) {
		const isInGroup = message.chat.type !== 'private';

		// 检查是否是群组管理员
		const isAdmin = await checkIfUserIsAdmin(userId);
		if (!isAdmin) {
			// 群内静默忽略（避免泄漏命令存在）；私聊明确告知权限不足
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限群组管理员使用。');
			}
			return;
		}

		// 提取参数（支持单个 / 批量；分隔符见 parseBatchTgids）
		const rawArg = text.slice(5);
		const { valid, invalid } = parseBatchTgids(rawArg);

		if (valid.length === 0 && invalid.length === 0) {
			const usageText = `❌ 使用方法：<code>/ban 用户ID</code> 或 <code>/ban 123,456,789</code>（最多 ${BATCH_LIMIT} 个）`;
			if (isInGroup) {
				await sendFlashMessage(chatId, usageText, ctx);
			} else {
				await sendTelegramMessage(chatId, usageText);
			}
			return;
		}
		if (valid.length > BATCH_LIMIT) {
			const limitText = `❌ 一次最多 ${BATCH_LIMIT} 个 TGID（你输入了 ${valid.length} 个）`;
			if (isInGroup) {
				await sendFlashMessage(chatId, limitText, ctx);
			} else {
				await sendTelegramMessage(chatId, limitText);
			}
			return;
		}

		// 单条且无格式错误
		if (valid.length === 1 && invalid.length === 0) {
			const result = await addToBlacklist(valid[0], env, { reason: 'manual', by: userId });
			// 统一详情格式:无论成功失败都展示完整字段
			const targetMention = await formatTargetByTgid(valid[0]);
			const lines = [
				`🎬 操作:加入黑名单`,
				`🎯 目标用户:${targetMention}`,
			];
			let flashText;
			if (result.success) {
				const banResults = await banUserFromAllGroups(valid[0]);
				lines.push('');
				lines.push(await renderBanResultsDetail(banResults));
				flashText = `✅ 已加黑 <code>${valid[0]}</code>\n` + renderBanResults(banResults);
			} else {
				// 失败(已存在/未绑存储等)→ 追加原因
				lines.push('');
				if (result.message && result.message.includes('已在黑名单')) {
					// "已在黑名单"场景:用更友好的提示替代,避免与原文案重复
					lines.push('⚠️ <b>该用户已在黑名单中,请勿重复添加</b>');
				} else {
					lines.push(result.message);
				}
				flashText = `⚠️ <code>${valid[0]}</code> ${result.message.replace(/<[^>]+>/g, '')}`;
			}
			await replyToAdmin(message, ctx, { flashText, detailText: lines.join('\n'), isInGroup });
			return;
		}

		// 批量
		const results = await addManyToBlacklist(valid, env, { reason: 'manual', by: userId });
		const banSummary = { success: results.success.length, banOkAll: 0, banPartial: 0, banFailedAll: 0 };
		// 收集每个用户的逐群结果,用于在 detail 末尾渲染明细
		const perUserBanResults = []; // [{ userId, banResults }]
		for (const id of results.success) {
			const banResults = await banUserFromAllGroups(id);
			const okCount = banResults.filter((r) => r.ok).length;
			if (okCount === banResults.length) banSummary.banOkAll += 1;
			else if (okCount === 0) banSummary.banFailedAll += 1;
			else banSummary.banPartial += 1;
			perUserBanResults.push({ userId: id, banResults });
		}
		const failedCount = invalid.length + results.failed.length;
		const flashText = `✅ 批量加黑：成功 ${results.success.length}${results.exists.length ? ` / 已存在 ${results.exists.length}` : ''}${failedCount ? ` / 失败 ${failedCount}` : ''}`;
		// 详细 detailText：批量汇总 + 每个用户的逐群明细
		const baseDetail = renderBatchAddResult(results, invalid, banSummary);
		let fullDetail = baseDetail;
		if (perUserBanResults.length > 0) {
			const perUserDetailLines = ['', '<b>逐用户踢人明细</b>:'];
			for (const { userId: uid, banResults } of perUserBanResults) {
				perUserDetailLines.push('', `<b>用户 <code>${uid}</code></b>`);
				perUserDetailLines.push(await renderBanResultsDetail(banResults));
			}
			fullDetail += '\n' + perUserDetailLines.join('\n');
		}
		await replyToAdmin(message, ctx, {
			flashText,
			detailText: fullDetail,
			isInGroup
		});
		return;
	}

	// 处理 /unban 命令 - 从黑名单移除或显示欢迎消息（支持批量、群内/私聊双场景）
	if (text && text.startsWith('/unban')) {
		const head = text.split(' ')[0];
		const rest = text.slice(head.length); // 保留参数原貌（含前导空格）

		// 如果有参数，处理黑名单移除
		if (rest.trim()) {
			const isInGroup = message.chat.type !== 'private';

			// 检查是否是群组管理员
			const isAdmin = await checkIfUserIsAdmin(userId);
			if (!isAdmin) {
				if (!isInGroup) {
					await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限群组管理员使用。');
				}
				return;
			}

			const { valid, invalid } = parseBatchTgids(rest);

			if (valid.length === 0 && invalid.length === 0) {
				const usageText = `❌ 使用方法：<code>/unban 用户ID</code> 或 <code>/unban 123,456,789</code>（最多 ${BATCH_LIMIT} 个）`;
				if (isInGroup) {
					await sendFlashMessage(chatId, usageText, ctx);
				} else {
					await sendTelegramMessage(chatId, usageText);
				}
				return;
			}
			if (valid.length > BATCH_LIMIT) {
				const limitText = `❌ 一次最多 ${BATCH_LIMIT} 个 TGID（你输入了 ${valid.length} 个）`;
				if (isInGroup) {
					await sendFlashMessage(chatId, limitText, ctx);
				} else {
					await sendTelegramMessage(chatId, limitText);
				}
				return;
			}

			// 单条且无格式错误
			if (valid.length === 1 && invalid.length === 0) {
				const result = await removeFromBlacklist(valid[0], env);
				const targetMention = await formatTargetByTgid(valid[0]);
				const lines = [
					`🎬 操作:移出黑名单`,
					`🎯 目标用户:${targetMention}`,
					'',
				];
				if (!result.success && result.message && result.message.includes('不在黑名单')) {
					// "不在黑名单"场景:用更友好的提示替代,避免与原文案重复
					lines.push('ℹ️ <b>该用户原本就不在黑名单,无需移除</b>');
				} else {
					lines.push(result.message);
				}
				const flashText = result.success
					? `✅ 已移黑 <code>${valid[0]}</code>`
					: `⚠️ <code>${valid[0]}</code> ${result.message.replace(/<[^>]+>/g, '')}`;
				await replyToAdmin(message, ctx, { flashText, detailText: lines.join('\n'), isInGroup });
				return;
			}

			// 批量
			const results = await removeManyFromBlacklist(valid, env);
			const failedCount = invalid.length + results.failed.length;
			const flashText = `✅ 批量移黑：成功 ${results.success.length}${results.notFound.length ? ` / 不在黑名单 ${results.notFound.length}` : ''}${failedCount ? ` / 失败 ${failedCount}` : ''}`;
			await replyToAdmin(message, ctx, {
				flashText,
				detailText: renderBatchRemoveResult(results, invalid),
				isInGroup
			});
			return;
		}
	}

	// 处理 /start 和 /unban 命令 - 显示欢迎消息
	if (text === '/start' || text === '/unban') {
		// 检查黑名单
		const blacklistCheck = await checkBlacklist(userId, env);
		if (blacklistCheck.isBlacklisted) {
			await sendTelegramMessage(chatId, blacklistCheck.message);
			return;
		}

		const groupInfo = await getGroupInfo();
		const welcomeMessage = SELF_UNBAN_PROMPT
			.replaceAll('{userId}', String(userId))
			.replaceAll('{title}', groupInfo.title)
			.replaceAll('{keyword}', SELF_UNBAN_KEYWORD);

		await sendTelegramMessage(chatId, welcomeMessage);
	}
	// 检查用户回复是否完全匹配提示语，禁止夹带其它内容
	else if (text && text.trim() === SELF_UNBAN_KEYWORD) {
		// KV 异常时保持放行策略：checkBlacklist 内部出错会返回 isBlacklisted=false
		const blacklistCheck = await checkBlacklist(userId, env);
		if (blacklistCheck.isBlacklisted) {
			await sendTelegramMessage(chatId, blacklistCheck.message);
			return;
		}

		// 发送确认消息
		const groupInfo = await getGroupInfo();
		await sendTelegramMessage(chatId, SELF_UNBAN_APPROVED.replaceAll('{username}', groupInfo.username));

		// 遍历所有配置群组，按用户在每个群的状态分别尝试解封/解禁
		const perGroupResults = [];
		for (const groupId of GROUP_IDS) {
			let groupLabel = `<code>${escapeHtml(groupId)}</code>`;
			try {
				const chatInfo = await getChatInfoFromId(groupId);
				if (chatInfo?.title) {
					groupLabel = chatInfo.link
						? `<a href="${escapeHtml(chatInfo.link)}">${escapeHtml(chatInfo.title)}</a>`
						: escapeHtml(chatInfo.title);
				}
			} catch (_) { /* 忽略群信息查询失败 */ }

			try {
				const statusResult = await checkUserStatus(userId, groupId);
				const userStatus = statusResult.result.status;
				const userPermissions = statusResult.result.permissions || {};

				if (userStatus === 'kicked') {
					await unbanUser(userId, groupId);
					perGroupResults.push(`✅ ${groupLabel}：已解封，可重新加入。`);
				} else if (userStatus === 'restricted') {
					await restrictUser(userId, groupId);
					perGroupResults.push(`✅ ${groupLabel}：禁言已解除。`);
				} else if (userStatus === 'left' || userStatus === 'member') {
					if (userPermissions.can_send_messages === false) {
						await restrictUser(userId, groupId);
						perGroupResults.push(`✅ ${groupLabel}：发言限制已解除。`);
					} else {
						perGroupResults.push(`ℹ️ ${groupLabel}：账号无明显限制。`);
					}
				} else {
					perGroupResults.push(`❌ ${groupLabel}：无法确定账号状态（${escapeHtml(userStatus)}）。`);
				}
			} catch (error) {
				console.error(`处理群 ${groupId} 自助解封失败:`, error);
				// 单群失败时回退尝试解禁→解封（保持原回退链行为）
				try {
					await restrictUser(userId, groupId);
					perGroupResults.push(`✅ ${groupLabel}：禁言已解除（兜底处理）。`);
				} catch (restrictError) {
					try {
						await unbanUser(userId, groupId);
						perGroupResults.push(`✅ ${groupLabel}：已解封（兜底处理）。`);
					} catch (unbanError) {
						perGroupResults.push(`❌ ${groupLabel}：解封失败，请联系管理员。`);
					}
				}
			}
		}

		await sendTelegramMessage(chatId, perGroupResults.join('\n'));

		// 检查用户是否在 GKY 封禁黑名单中（全局判定，提醒发到主群）
		try {
			const TG黑名单 = await handleBanlist(userId);
			const banlistData = JSON.parse(TG黑名单);
			if (banlistData.banned) {
				const botUsername = await getBotUsername();

				let infoMessage = `⚠️ 注意：您的账号存在封禁黑名单。\n`;
				infoMessage += `- TGID: <a href="tg://user?id=${banlistData.tgid}">${banlistData.tgid}</a>\n`;
				if (banlistData.reason) infoMessage += `- 封禁原因: ${banlistData.reason}\n`;
				infoMessage += `\n需要群组管理员进行<b><a href="https://t.me/${botUsername}?start=check_${banlistData.tgid}">二次审核</a></b>。`;
				await sendTelegramMessage(GROUP_ID, infoMessage);
			}
		} catch (error) {
			console.error('查询 GKY 封禁记录失败:', error);
		}
	}
}

// 发送 Telegram 消息
async function sendTelegramMessage(chatId, text, replyMarkup) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
	const body = {
		chat_id: chatId,
		text: text,
		parse_mode: 'HTML',
		disable_web_page_preview: true
	};

	if (replyMarkup) {
		body.reply_markup = replyMarkup;
	}

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	const result = await response.json();

	// 添加调试日志
	console.log(`发送消息到 Telegram，状态: ${response.status}, 响应: ${JSON.stringify(result)}`);

	return result;
}

// Telegram moderation helpers
async function muteChatMember(chatId, userId) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/restrictChatMember`;
	const body = {
		chat_id: chatId,
		user_id: userId,
		use_independent_chat_permissions: true,
		permissions: {
			can_send_messages: false,
			can_send_audios: false,
			can_send_documents: false,
			can_send_photos: false,
			can_send_videos: false,
			can_send_video_notes: false,
			can_send_voice_notes: false,
			can_send_polls: false,
			can_send_other_messages: false,
			can_add_web_page_previews: false,
			can_change_info: false,
			can_invite_users: false,
			can_pin_messages: false,
			can_manage_topics: false
		}
	};

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	const result = await response.json();
	logBotModeration('telegram-api:restrictChatMember:response', {
		聊天ID: chatId,
		用户ID: userId,
		HTTP状态码: response.status,
		是否成功: result.ok,
		返回说明: result.description
	});

	if (!response.ok || !result.ok) {
		throw new Error(`HTTP error! status: ${response.status}, body: ${JSON.stringify(result)}`);
	}

	console.log(`Muted user ${userId} in chat ${chatId}, response: ${JSON.stringify(result)}`);

	return result;
}

// 把用户踢出群（Telegram banChatMember API）
// revoke_messages: true → 同时撤回该用户在群里的最近 48 小时内消息（Telegram 上限）
// 返回 { ok: bool, error?: string }；bot 没权限/不在群时返回 ok=false 但不抛异常
async function banUserFromGroup(chatId, userId) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/banChatMember`;
	const body = {
		chat_id: chatId,
		user_id: Number(userId),
		revoke_messages: true
	};

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const result = await response.json();
		console.log(`[banChatMember] chat=${chatId} user=${userId} ok=${result.ok}${result.description ? ' desc=' + result.description : ''}`);
		if (!response.ok || !result.ok) {
			return { ok: false, error: result.description || `HTTP ${response.status}` };
		}
		return { ok: true };
	} catch (error) {
		console.error(`[banChatMember] chat=${chatId} user=${userId} 异常:`, error);
		return { ok: false, error: error.message };
	}
}

// 删除单条消息（Telegram deleteMessage API）
// bot 必须有 can_delete_messages 权限；私聊只能删自己发的消息
// 返回 { ok: bool, error?: string }
async function deleteMessage(chatId, messageId) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`;
	const body = { chat_id: chatId, message_id: messageId };

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const result = await response.json();
		console.log(`[deleteMessage] chat=${chatId} msg=${messageId} ok=${result.ok}${result.description ? ' desc=' + result.description : ''}`);
		if (!response.ok || !result.ok) {
			return { ok: false, error: result.description || `HTTP ${response.status}` };
		}
		return { ok: true };
	} catch (error) {
		console.error(`[deleteMessage] chat=${chatId} msg=${messageId} 异常:`, error);
		return { ok: false, error: error.message };
	}
}

// 发一条群内闪屏提示，ttlMs 毫秒后自动撤回
// ctx 是 Cloudflare Worker 的 ExecutionContext；ctx.waitUntil 让 Worker 在响应返回后继续等
// ctx 缺失（比如离线测试或非 Worker 环境）则退化为只发不撤回
async function sendFlashMessage(chatId, text, ctx, ttlMs = 5000) {
	const result = await sendTelegramMessage(chatId, text);
	const messageId = result?.result?.message_id;
	if (!messageId || !ctx || typeof ctx.waitUntil !== 'function') return result;
	ctx.waitUntil((async () => {
		await new Promise((r) => setTimeout(r, ttlMs));
		await deleteMessage(chatId, messageId);
	})());
	return result;
}

async function unbanUser(userId, groupId = GROUP_ID) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/unbanChatMember`;
	const body = {
		chat_id: groupId,
		user_id: userId
	};

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	const result = await response.json();

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}, body: ${JSON.stringify(result)}`);
	}

	// 添加调试日志
	console.log(`执行 unbanUser，状态: ${response.status}, 响应: ${JSON.stringify(result)}`);

	return result;
}

// 解除用户禁言（恢复发言权限）
async function restrictUser(userId, groupId = GROUP_ID) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/restrictChatMember`;
	const body = {
		chat_id: groupId,
		user_id: userId,
		permissions: {
			can_send_messages: true,
			can_send_media_messages: true,
			can_send_polls: true,
			can_send_other_messages: true,
			can_add_web_page_previews: true,
			can_change_info: false,
			can_invite_users: true,
			can_pin_messages: false
		}
	};

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	const result = await response.json();

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}, body: ${JSON.stringify(result)}`);
	}

	// 添加调试日志
	console.log(`执行 restrictUser，状态: ${response.status}, 响应: ${JSON.stringify(result)}`);

	return result;
}

// 检查用户在群组中的状态
async function checkUserStatus(userId, groupId = GROUP_ID) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`;
	const body = {
		chat_id: groupId,
		user_id: userId
	};

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});

	const result = await response.json();

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}, body: ${JSON.stringify(result)}`);
	}

	return result;
}

// 检查用户是否是任一配置群组的管理员
// 检查用户是否是任一配置群组的管理员 / 超级管理员
// 权限层级（高 → 低）:超级管理员 > 群管理员 > 普通用户
// 超级管理员（SUPER_ADMINS 名单）拥有"群管理员"的所有命令权限,且额外拥有"一键解封按钮"权限
// 这里直接把 super 当成 admin,所以 SUPER_ADMINS 用户即使不是任何群的成员也能使用 /ban /unban /spam 等命令
//
// 用 getChatAdministrators 拉群管理员列表本地匹配，比 getChatMember 更稳:
// - 不要求 bot 是该群管理员（仅要求 bot 在群里）
// - 不受 50+ 人群组限制
// - 不受匿名/隐藏管理员模式干扰
// 单群查询失败不阻塞后续群；任一群命中即返回 true。
async function checkIfUserIsAdmin(userId) {
	const userIdStr = String(userId);

	// 超级管理员直接放行（最高权限,优先于群管理员检查）
	if (isSuperAdmin(userIdStr)) {
		console.log(`[管理员鉴权] 用户 ${userId} 是超级管理员 ✅`);
		return true;
	}

	const summary = [];

	for (const groupId of GROUP_IDS) {
		try {
			const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatAdministrators`;
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: groupId }),
			});
			const result = await response.json();

			if (!response.ok || !result.ok || !Array.isArray(result.result)) {
				summary.push(`群${groupId}:查询失败(${result.description || `HTTP ${response.status}`})`);
				continue;
			}

			const adminCount = result.result.length;
			const hit = result.result.find((m) => m.user && String(m.user.id) === userIdStr);
			if (hit) {
				console.log(`[管理员鉴权] 用户 ${userId} 在群 ${groupId} 是 ${hit.status} ✅`);
				console.log(`[管理员鉴权] 总结: ${[...summary, `群${groupId}:命中(${hit.status})`].join('; ')}`);
				return true;
			}
			summary.push(`群${groupId}:不在 ${adminCount} 个 admin 中`);
		} catch (error) {
			summary.push(`群${groupId}:异常(${error.message})`);
			console.error(`[管理员鉴权] 群 ${groupId} 异常:`, error);
		}
	}

	console.log(`[管理员鉴权] 用户 ${userId} 未命中。总结: ${summary.join('; ')}`);
	return false;
}

// 获取机器人用户名
async function getBotId() {
	if (BOT_ID) {
		return BOT_ID;
	}

	try {
		const url = `https://api.telegram.org/bot${BOT_TOKEN}/getMe`;
		const response = await fetch(url);
		const result = await response.json();

		if (response.ok && result.result && result.result.id) {
			BOT_ID = result.result.id;
			if (result.result.username) {
				BOT_USERNAME = result.result.username;
			}
			return BOT_ID;
		}

		console.error('Failed to get bot ID:', result);
		return null;
	} catch (error) {
		console.error('Failed to get bot ID:', error);
		return null;
	}
}

async function getBotUsername() {
	// 如果已经缓存，直接返回
	if (BOT_USERNAME) {
		return BOT_USERNAME;
	}

	try {
		const url = `https://api.telegram.org/bot${BOT_TOKEN}/getMe`;
		const response = await fetch(url);
		const result = await response.json();

		if (response.ok && result.result && result.result.username) {
			if (result.result.id) {
				BOT_ID = result.result.id;
			}
			BOT_USERNAME = result.result.username;
			console.log(`机器人用户名: ${BOT_USERNAME}`);
			return BOT_USERNAME;
		} else {
			console.error('获取机器人信息失败:', result);
			return 'unknown_bot'; // 失败时返回中性占位
		}
	} catch (error) {
		console.error('获取机器人用户名时出错:', error);
		return 'unknown_bot'; // 失败时返回中性占位
	}
}

// 获取群组信息
async function getGroupInfo() {
	// 如果已经缓存，直接返回
	if (GROUP_TITLE && GROUP_USERNAME) {
		return {
			title: GROUP_TITLE,
			username: GROUP_USERNAME
		};
	}

	try {
		const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChat`;
		const body = {
			chat_id: GROUP_ID
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});

		const result = await response.json();

		if (response.ok && result.result) {
			GROUP_TITLE = result.result.title || '当前群组';
			GROUP_USERNAME = result.result.username ? `@${result.result.username}` : String(GROUP_ID);
			console.log(`群组信息: 名称=${GROUP_TITLE}, 用户名=${GROUP_USERNAME}`);
			return {
				title: GROUP_TITLE,
				username: GROUP_USERNAME
			};
		} else {
			console.error('获取群组信息失败:', result);
			// 失败时返回中性默认值
			return {
				title: '当前群组',
				username: String(GROUP_ID)
			};
		}
	} catch (error) {
		console.error('获取群组信息时出错:', error);
		// 失败时返回中性默认值
		return {
			title: '当前群组',
			username: String(GROUP_ID)
		};
	}
}

async function handleBanlist(chatId) {
	function parseBanlistHTML(html, tgid) {
		// 检查是否没有封禁记录
		const noRecordPattern = /并沒有封鎖記錄|has no ban record/;
		if (noRecordPattern.test(html)) {
			return {
				success: true,
				banned: false,
				tgid: tgid,
				message: '此TG帳號并沒有封鎖記錄 / This TG account has no ban record'
			};
		}

		// 提取封禁信息
		const result = {
			success: true,
			banned: true,
			tgid: null,
			chatId: null,
			msgId: null,
			reason: null,
			info: null,
			recordedDate: null
		};

		// 提取 Recorded Date
		const dateMatch = html.match(/Recorded Date:\s*([^<]+)/);
		if (dateMatch) {
			result.recordedDate = dateMatch[1].trim();
		}

		// 提取 TGID
		const tgidMatch = html.match(/<strong>TGID:<\/strong>\s*(\d+)/);
		if (tgidMatch) {
			result.tgid = tgidMatch[1];
		}

		// 提取 ChatID
		const chatIdMatch = html.match(/<strong>ChatID:<\/strong>\s*(-?\d+)/);
		if (chatIdMatch) {
			result.chatId = chatIdMatch[1];
		}

		// 提取 MsgID
		const msgIdMatch = html.match(/<strong>MsgID:<\/strong>\s*(\d+)/);
		if (msgIdMatch) {
			result.msgId = msgIdMatch[1];
		}

		// 提取 Reason
		const reasonMatch = html.match(/<strong>Reason:<\/strong>\s*([^<]+)/);
		if (reasonMatch) {
			const rawReason = reasonMatch[1].trim();
			// 映射封禁原因为中文
			const reasonMap = {
				'SpamGP': '群众举报',
				'ExReply': '违规转发',
				'Ad Image': '违规图片',
				'UserName': '违规用户名/签名'
			};
			result.reason = reasonMap[rawReason] || rawReason;
		}

		// 提取 Info (封禁的消息内容)
		const infoMatch = html.match(/<strong>Info:<\/strong><\/p>\s*([^<]+(?:<br[^>]*>[^<]*)*)/);
		if (infoMatch) {
			// 清理 HTML 标签并提取文本内容
			let info = infoMatch[1];
			info = info.replace(/<br\s*\/?>/gi, '\n'); // 将 <br> 替换为换行符
			info = info.replace(/<[^>]+>/g, ''); // 移除其他 HTML 标签
			info = info.trim();
			result.info = info;
		} else {
			// 尝试另一种匹配模式,匹配 Info 后的内容直到 </p> 或 <br>
			const infoMatch2 = html.match(/<strong>Info:<\/strong><\/p>\s*([\s\S]*?)<br>/);
			if (infoMatch2) {
				let info = infoMatch2[1];
				info = info.replace(/<br\s*\/?>/gi, '\n');
				info = info.replace(/<[^>]+>/g, '');
				info = info.trim();
				result.info = info;
			}
		}

		return result;
	}

	if (!chatId) {
		return JSON.stringify({
			success: false,
			error: 'Missing tgid parameter'
		});
	}

	// 访问原始的 banlist API
	const targetUrl = `${GKY_BANLIST_ENDPOINT}?tgid=${chatId}`;
	const response = await fetch(targetUrl);
	const html = await response.text();

	// 解析 HTML 内容
	const result = parseBanlistHTML(html, chatId);

	return JSON.stringify(result);
}

// 通过群组ID获取群组信息
async function getChatInfoFromId(chatId) {
	try {
		const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChat`;
		const body = {
			chat_id: chatId
		};

		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});

		const result = await response.json();

		if (response.ok && result.result) {
			const title = result.result.title || result.result.first_name || null;
			const username = result.result.username;
			
			// 构建返回对象
			const info = {
				title: title
			};

			// 如果有用户名，构建链接
			if (username) {
				info.link = `https://t.me/${username}`;
			}

			return info;
		} else {
			console.error('获取群组信息失败:', result);
			return null;
		}
	} catch (error) {
		console.error('获取群组信息时出错:', error);
		return null;
	}
}
