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

// /purge 清扫按“黑名单用户 × 配置群组”分批执行，避免单次 Worker 撞 Cloudflare 子请求限制。
// 最坏情况下每个组合会调用 getChatMember + banChatMember 两次 Telegram API。
const PURGE_DEFAULT_PAIR_LIMIT = 20;
const PURGE_MAX_PAIR_LIMIT = 20;
const PURGE_CONCURRENCY = 5;
const PURGE_RUN_DELAY_MS = 250;
const PURGE_DEFAULT_REASONS = ['manual', 'spam'];

// 5) /blacklist 列表中"原因"字段的中文映射。
//    内置三种：spam（/spam 举报）、manual（/ban 手动添加）、manual_ban（chat_member 自动同步）。
//    环境变量名：BLACKLIST_REASON_LABELS （要求是 JSON 字符串，例如 {"spam":"群内举报"}）
const DEFAULT_BLACKLIST_REASON_LABELS = {
	spam: '群内 /spam 举报',
	manual: '管理员手动添加',
	manual_ban: '管理员手动封禁（自动同步）',
	ad_auto: '🤖 广告自动检测',
	ad_learn: '🤖 上报学习'
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
//    环境变量 OWNER_IDS(逗号分隔,中英文逗号均可):第一个是主人,后续是副主人
//    主人收全部通知;副主人只收 /ban、/spam 这类加黑踢人通知
//    空数组 = 禁用通知系统(其他管理员仍可正常使用命令,但都没有私聊详情)
//    填了主人/副主人ID但账号从未私聊过 bot → 通知会投递失败,Worker 日志可见
const DEFAULT_OWNER_IDS = [];

// 9) 广告自动检测(多维度评分 + 强特征直杀),命中 → 删消息 + 加黑 + 全群踢 + 通知主人
//    优先级:环境变量 > 这里的硬编码默认值
//    AD_FILTER_ENABLED 默认 false,需显式设环境变量 'true' 才启用(避免刚部署误伤)
const DEFAULT_AD_FILTER_ENABLED = false;
//    评分阈值:各维度加权分总和 ≥ 阈值即判广告(强特征绕过评分直接判定)
const DEFAULT_AD_SCORE_THRESHOLD = 3;
//    分类词库默认留空(隐私:GitHub 代码零敏感词)。词库存 D1,用主人命令热更新:
//    /importdefault 一键导入推荐词库 | /addword 加词 | /delword 删词 | /listwords 查看
//    命中加权:金融+2 / 色情+2 / 引流+1 / 诈骗+2
const DEFAULT_AD_KEYWORDS_FINANCE = [];
const DEFAULT_AD_KEYWORDS_PORN = [];
const DEFAULT_AD_KEYWORDS_SPAM = [];
const DEFAULT_AD_KEYWORDS_FRAUD = [];

// =============================================================================
// =结束= 普通使用者一般无需修改下方任何内容
// =============================================================================

// 推荐广告词库种子(字符串拆分写法,避免 GitHub 公开仓库出现完整敏感词)
// 仅在主人执行 /importdefault 时一次性写入 D1,不默认生效
const RECOMMENDED_AD_KEYWORDS = {
	finance: ['us' + 'dt', 'u' + '商', '承' + '兑', '刷' + '单', '日' + '入', '出' + 'u', '接' + 'u', '搬' + '砖', '套' + '利', '包' + '网', '跑' + '分', '水' + '房', '料' + '子'],
	porn: ['约' + '炮', '萝' + '莉', '福利' + '姬', '看' + '片', '裸' + '聊', '乱' + '伦', '不雅' + '视频', '色' + '色', '一夜' + '情', '免费' + '看', '萝' + '控'],
	spam: [],
	fraud: ['假' + '钞', '假' + '币', '代开' + '发票', '黑客' + '接单', '网' + '赚', '菠' + '菜'],
	// identity:只用于检测发言人"名字/简介",不碰正文。色情/赌博露骨话术。
	//   注意:只放正常用户绝不会用的露骨词,不放链接/@/域名(那些会误杀双向bot/技术讨论)。
	identity: ['出租' + '淫妻', '淫' + '妻', '性' + '奴', '约' + '炮', '裸' + '聊', '楼' + '凤',
		'小' + '姐', '上门' + '服务', '特殊' + '服务', '援' + '交', '菠' + '菜', '博' + '彩',
		'赌' + '场', '六' + '合彩', '时时' + '彩', '网' + '赌'],
};

// /recent 冻结快照 D1 表(供 /learnlast 按固定序号引用,根治序号漂移)
// /recent 时把当时的疑似广告列表冻结存这里;/learnlast 只从这份快照读,
// 所以即使期间有新消息进来挤动实时缓存,主人私聊里看到的序号也永远对得上同一条。
// 消息缓存开关与容量(默认开,只缓存"疑似广告"消息以省 D1 写入)
const DEFAULT_MSG_CACHE_ENABLED = true;
const DEFAULT_MSG_CACHE_SIZE = 50;

// 学习样本指纹匹配阈值(根因修复:防止学短广告后误杀正常人)
//   完全相等:归一化后 ≥ 此长度即允许"精确秒杀"(保留"相同广告一定抓"的能力)
const SAMPLE_FP_EXACT_MIN = 6;

// ===== 链接识别(区分正常链接 vs 广告链接,防止链接误判)=====
// 正常域名白名单(主人可用 /addword whitelist <域名> 写入 D1 热更新)
// 内置正常域名白名单:命中这些域名的链接【不计分、不参与样本子串匹配】,正常链接绝不误杀。
// 匹配规则:消息里链接的主机名 等于白名单项 或 是其子域名(如 gist.github.com 命中 github.com)。
// 主人想加自己的域名:私聊 /addword whitelist example.com(复用白名单分类,改完即时生效不用重部署)。
const DEFAULT_URL_WHITELIST = [
	'github.com', 'githubusercontent.com', 'gitlab.com', 'gitee.com',
	'google.com', 'youtube.com', 'youtu.be', 'wikipedia.org',
	'stackoverflow.com', 'stackexchange.com', 'npmjs.com', 'pypi.org',
	'cloudflare.com', 'developers.cloudflare.com', 'workers.dev',
	'microsoft.com', 'apple.com', 'mozilla.org', 'docker.com',
	'twitter.com', 'x.com', 'reddit.com', 'medium.com',
	'bilibili.com', 'zhihu.com', 'juejin.cn', 'csdn.net', 'segmentfault.com',
];
// 可疑域名:命中这些(短链 / 群组邀请类)单独加分,因为常被广告用来藏落地页。
const SUSPICIOUS_URL_DOMAINS = [];

// 身份广告词:通过 /importdefault 或 /addword identity 写入 D1 管理。
// GitHub 代码零明文敏感词,所有词库由部署者自行导入。
const DEFAULT_IDENTITY_SPAM_WORDS = [];
// 运行期身份广告词(D1 热更新加载)
let IDENTITY_SPAM_WORDS = [...DEFAULT_IDENTITY_SPAM_WORDS];

// 关键词提取停用词表(过滤常见无害中文4字组,避免误学成广告词)
// 字符串拆分写法避免明文特征
const AD_STOPWORDS = [
	'大' + '家好', '请' + '问一下', '怎' + '么样', '谢' + '谢大家', '有' + '没有人',
	'是' + '不是', '可' + '以吗', '在' + '不在', '什' + '么意思', '哈' + '哈哈哈',
	'早' + '上好', '晚' + '上好', '不' + '客气', '没' + '关系',
];

// 运行期生效的可配置项（每次请求开始时由 loadRequiredConfig 写入）
let SELF_UNBAN_KEYWORD;
let SELF_UNBAN_PROMPT;
let SELF_UNBAN_APPROVED;
let BLACKLIST_PAGE_LIMIT;
let BLACKLIST_REASON_LABELS;
let GKY_BANLIST_ENDPOINT;

// Telegram Bot Token
let TOKEN;
let BOT_TOKEN;
// 主群组ID（GROUP_IDS 的第一项，用于发送二次审核提醒、缓存群组信息等"主群行为"）
let GROUP_ID;
// 全部配置群组ID列表（支持 GROUP_ID 环境变量逗号分隔多群组）
let GROUP_IDS = [];
// 超级管理员 TGID 白名单（用于按钮交互鉴权，普通群管理员不在此列时不能点按钮）
let SUPER_ADMINS = [];
// 主人 TGID 列表:第一个是主人,后续是副主人。空数组 = 未配置,禁用通知
let OWNER_IDS = [];
// 广告检测运行期配置
let AD_FILTER_ENABLED = false;
let AD_SCORE_THRESHOLD = 3;
let AD_KEYWORDS = [];          // 环境变量追加的自定义广告词
let AD_WHITELIST = [];         // 白名单词(命中不计分)
let AD_KEYWORDS_FINANCE = [];
let AD_KEYWORDS_PORN = [];
let AD_KEYWORDS_SPAM = [];
let AD_KEYWORDS_FRAUD = [];
// 广告学习样本指纹(运行期从 D1 加载)
let AD_SAMPLE_FINGERPRINTS = [];
// 正常域名白名单(内置 + D1 热更新,运行期合并;命中的链接不计分、不参与样本子串匹配)
// 初始即为内置默认值,保证 merge 未执行(如 D1 未绑定)时正常域名白名单仍生效
let URL_WHITELIST = [...DEFAULT_URL_WHITELIST];
// 消息缓存配置
let MSG_CACHE_ENABLED = true;
let MSG_CACHE_SIZE = 50;
// 机器人用户名缓存
let BOT_USERNAME = null;
let BOT_ID = null;
// 群组信息缓存（仅缓存主群）
let GROUP_TITLE = null;
let GROUP_USERNAME = null;

function applyRuntimeConfig(config) {
	TOKEN = config.TOKEN;
	BOT_TOKEN = config.BOT_TOKEN;
	GROUP_IDS = config.GROUP_IDS;
	GROUP_ID = config.GROUP_ID;
	SUPER_ADMINS = config.SUPER_ADMINS;
	OWNER_IDS = config.OWNER_IDS;
	AD_FILTER_ENABLED = config.AD_FILTER_ENABLED;
	AD_SCORE_THRESHOLD = config.AD_SCORE_THRESHOLD;
	AD_KEYWORDS = config.AD_KEYWORDS;
	AD_WHITELIST = config.AD_WHITELIST;
	AD_KEYWORDS_FINANCE = config.AD_KEYWORDS_FINANCE;
	AD_KEYWORDS_PORN = config.AD_KEYWORDS_PORN;
	AD_KEYWORDS_SPAM = config.AD_KEYWORDS_SPAM;
	AD_KEYWORDS_FRAUD = config.AD_KEYWORDS_FRAUD;
	MSG_CACHE_ENABLED = config.MSG_CACHE_ENABLED;
	MSG_CACHE_SIZE = config.MSG_CACHE_SIZE;
	SELF_UNBAN_KEYWORD = config.SELF_UNBAN_KEYWORD;
	SELF_UNBAN_PROMPT = config.SELF_UNBAN_PROMPT;
	SELF_UNBAN_APPROVED = config.SELF_UNBAN_APPROVED;
	BLACKLIST_PAGE_LIMIT = config.BLACKLIST_PAGE_LIMIT;
	BLACKLIST_REASON_LABELS = config.BLACKLIST_REASON_LABELS;
	GKY_BANLIST_ENDPOINT = config.GKY_BANLIST_ENDPOINT;
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const path = url.pathname.slice(1); // 移除开头的斜杠

		try {
			applyRuntimeConfig(loadRequiredConfig(env));
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
		} else if (request.method === 'GET' && path === `${TOKEN}/export`) {
			// 黑名单导出（浏览器 / JSON / CSV，受 TOKEN 保护）
			return await handleExport(env, url);
		} else if (request.method === 'GET' && path === `${TOKEN}/purge/groups`) {
			// 清扫前预检：只保留 bot 具备封禁权限的群
			return await handlePurgeGroups();
		} else if (request.method === 'GET' && path === `${TOKEN}/purge/run`) {
			// 浏览器自动续跑页：由客户端逐批调用 /purge，避免单次 Worker 超限
			return handlePurgeRunner(url);
		} else if (request.method === 'GET' && path === `${TOKEN}/purge`) {
			// 分批清扫：把仍在群里的黑名单用户全部踢出（受 TOKEN 保护）
			return await handlePurge(env, url);
		} else if (request.method === 'GET' && path === `${TOKEN}/jobrun`) {
			// D1 批量任务续跑入口：每次仍只跑安全分片，正常由 Queue 自动续接，异常时可手动调用。
			return await handleBulkJobAutoRun(env, url, ctx, request.url);
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
					await handleMessage(update.message, env, ctx, request.url);
				} else if (update.chat_member) {
					await handleChatMemberUpdate(update.chat_member, env);
				} else if (update.callback_query) {
					await handleCallbackQuery(update.callback_query, env, ctx);
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
	},

	async queue(batch, env, ctx) {
		try {
			applyRuntimeConfig(loadRequiredConfig(env));
		} catch (error) {
			console.error('[批量任务] Queue 初始化失败:', error);
			throw error;
		}

		for (const message of batch.messages || []) {
			const body = message.body || {};
			const jobId = String(body.id || body.jobId || '').trim();
			if (!jobId) {
				console.error('[批量任务] Queue 消息缺少 job id:', body);
				continue;
			}
			await runBulkModerationJob(env, jobId, {
				notifyOnDone: true,
				autoContinue: true,
				ctx,
				requestUrl: '',
				source: 'queue'
			});
		}
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

	// OWNER_IDS 可选：逗号分隔（中英文逗号均可），第一个主人、后续副主人，空 = 禁用主人通知
	let ownerIds = [];
	const rawOwnerEnv = env.OWNER_IDS;
	if (rawOwnerEnv !== undefined && rawOwnerEnv !== null && String(rawOwnerEnv).trim() !== '') {
		ownerIds = sanitizeAdmins(String(rawOwnerEnv).split(/[,，]/));
	} else {
		ownerIds = sanitizeAdmins(
			Array.isArray(DEFAULT_OWNER_IDS) ? DEFAULT_OWNER_IDS : [DEFAULT_OWNER_IDS].filter(Boolean)
		);
	}

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
	const adKeywords = parseList(env.AD_KEYWORDS);     // 环境变量追加
	const adWhitelist = parseList(env.AD_WHITELIST);
	// 消息缓存配置
	const msgCacheEnabled = parseBool(env.MSG_CACHE_ENABLED, DEFAULT_MSG_CACHE_ENABLED);
	let msgCacheSize = DEFAULT_MSG_CACHE_SIZE;
	if (env.MSG_CACHE_SIZE !== undefined && env.MSG_CACHE_SIZE !== null && String(env.MSG_CACHE_SIZE).trim() !== '') {
		const n = parseInt(String(env.MSG_CACHE_SIZE).trim(), 10);
		if (Number.isInteger(n) && n > 0 && n <= 500) msgCacheSize = n;
	}
	// 词库统一小写化(检测时也小写比对)
	const lower = (arr) => (arr || []).map((s) => String(s).toLowerCase());

	return {
		TOKEN: String(env.TOKEN).trim(),
		BOT_TOKEN: String(env.BOT_TOKEN).trim(),
		GROUP_IDS: uniqueGroupIds,
		GROUP_ID: uniqueGroupIds[0],
		SUPER_ADMINS: superAdmins,
		OWNER_IDS: ownerIds,
		AD_FILTER_ENABLED: adFilterEnabled,
		AD_SCORE_THRESHOLD: adScoreThreshold,
		AD_KEYWORDS: adKeywords,
		AD_WHITELIST: adWhitelist,
		AD_KEYWORDS_FINANCE: lower(DEFAULT_AD_KEYWORDS_FINANCE),
		AD_KEYWORDS_PORN: lower(DEFAULT_AD_KEYWORDS_PORN),
		AD_KEYWORDS_SPAM: lower(DEFAULT_AD_KEYWORDS_SPAM),
		AD_KEYWORDS_FRAUD: lower(DEFAULT_AD_KEYWORDS_FRAUD),
		MSG_CACHE_ENABLED: msgCacheEnabled,
		MSG_CACHE_SIZE: msgCacheSize,
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
				{ command: "check", description: "查询封禁状态:回复消息 或 /check TGID (管理员)" },
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

// 批量 /ban /unban 上限（工程上限，非业务文案，不暴露环境变量）
const BATCH_LIMIT = 50;
const BULK_TASK_THRESHOLD = 20;
const BULK_TASK_SYNC_OPERATION_LIMIT = 24;
const BULK_TASK_OPERATION_BATCH_LIMIT = 24;
const BULK_TASK_USER_BATCH_SIZE = 20;
const BULK_TASK_CONCURRENCY = 3;
const BULK_TASK_RETRY_LIMIT = 0;
const BULK_TASK_MAX_RUNTIME_MS = 18000;
const BULK_TASK_FAILURE_LIMIT = 100;
const BULK_TASK_LEASE_MS = 45000;

// 解析批量 TGID 字符串：半角逗号 / 全角逗号 / 空格 / 换行 / 数组外壳 [] 都当分隔符；去空、去重、分类
// 返回 { valid: ['123', '456'], invalid: ['abc'] }
function parseBatchTgids(raw) {
	const tokens = String(raw || '')
		.split(/[\[\],，\s]+/)
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

function parseTargetIdsAndNote(raw) {
	const trimmed = String(raw || '').trim();
	if (!trimmed) return { valid: [], invalid: [], note: '' };
	if (trimmed.startsWith('[')) {
		const closeIndex = trimmed.indexOf(']');
		if (closeIndex > 0) {
			return { ...parseBatchTgids(trimmed.slice(0, closeIndex + 1)), note: '' };
		}
		return { ...parseBatchTgids(trimmed), note: '' };
	}
	const tokens = trimmed.split(/\s+/).filter(Boolean);
	let idEnd = 0;
	for (; idEnd < tokens.length; idEnd++) {
		const token = tokens[idEnd];
		if (!/^[\d,，]+$/.test(token)) break;
	}
	if (idEnd === 0) {
		return { ...parseBatchTgids(trimmed), note: '' };
	}
	const idText = tokens.slice(0, idEnd).join(' ');
	const note = tokens.slice(idEnd).join(' ').trim();
	return { ...parseBatchTgids(idText), note };
}

function formatActionNote(note) {
	const clean = String(note || '').trim();
	return clean ? escapeHtml(clean) : '未填写';
}

function buildActionContextLines(message, actionNote) {
	const lines = [];
	if (message?.chat?.type === 'private') {
		lines.push('📍 命令来源:私聊');
	} else {
		const title = message?.chat?.title || message?.chat?.username || '当前群组';
		const chatId = message?.chat?.id ?? '未知';
		lines.push(`📍 命令来源:${escapeHtml(title)} <code>${escapeHtml(String(chatId))}</code>`);
		const groupCount = Array.isArray(GROUP_IDS) ? GROUP_IDS.length : 0;
		lines.push(`🧹 作用范围:全部 ${groupCount} 个配置群`);
	}
	lines.push(`📝 执行原因:${formatActionNote(actionNote)}`);
	return lines;
}

function withActionContext(message, detailText, actionNote) {
	return [...buildActionContextLines(message, actionNote), '', detailText].join('\n');
}

async function deleteAuthorizedGroupCommandMessage(message, commandName) {
	if (message?.chat?.type === 'private') return;
	if (message.__authorizedGroupCommandDeleted) return;
	message.__authorizedGroupCommandDeleted = true;
	const result = await deleteMessage(message.chat.id, message.message_id);
	if (!result.ok) {
		console.error(`[${commandName}] 删除群内命令消息失败:${result.error || '未知错误'}`);
	}
}
// 读取并归一化黑名单
// === D1 工具函数 ===
// 首次访问 D1 时建表（幂等），避免人工建表步骤
let D1_INITED = false;
async function ensureD1Table(env) {
	if (!env.DB || D1_INITED) return;
	try {
		await env.DB.exec(`
			CREATE TABLE IF NOT EXISTS blacklist (id TEXT PRIMARY KEY, reason TEXT, by_user TEXT, at TEXT);
			CREATE TABLE IF NOT EXISTS ad_keywords (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT);
			CREATE TABLE IF NOT EXISTS ad_samples (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT);
			CREATE TABLE IF NOT EXISTS recent_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, mid INTEGER, chat_id TEXT, chat_title TEXT, text TEXT, from_id TEXT, from_name TEXT, created_at TEXT);
			CREATE TABLE IF NOT EXISTS learn_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at TEXT);
			CREATE TABLE IF NOT EXISTS batch_jobs (id TEXT PRIMARY KEY, type TEXT, status TEXT, payload TEXT NOT NULL, created_at TEXT, updated_at TEXT);
		`);
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

function buildD1BlacklistReasonFilter(reasons) {
	if (!Array.isArray(reasons)) {
		return { where: '', params: [] };
	}
	const safeReasons = reasons
		.map((reason) => String(reason || '').trim())
		.filter((reason) => /^[a-z0-9_-]+$/i.test(reason));
	if (safeReasons.length === 0) {
		return { where: 'WHERE 1 = 0', params: [] };
	}
	return {
		where: `WHERE reason IN (${safeReasons.map(() => '?').join(', ')})`,
		params: safeReasons
	};
}

async function getD1BlacklistCount(env, reasons = null) {
	await ensureD1Table(env);
	const filter = buildD1BlacklistReasonFilter(reasons);
	const stmt = env.DB.prepare(`SELECT COUNT(*) AS total FROM blacklist ${filter.where}`);
	const row = filter.params.length > 0 ? await stmt.bind(...filter.params).first() : await stmt.first();
	return Number(row?.total ?? 0);
}

async function readD1BlacklistWindow(env, offset, limit, reasons = null) {
	await ensureD1Table(env);
	const safeOffset = Math.max(0, Number(offset) || 0);
	const safeLimit = Math.max(0, Number(limit) || 0);
	if (safeLimit === 0) {
		return [];
	}

	const filter = buildD1BlacklistReasonFilter(reasons);
	const stmt = env.DB.prepare(`
		SELECT id, reason, by_user, at
		FROM blacklist
		${filter.where}
		ORDER BY COALESCE(at, ''), id
		LIMIT ? OFFSET ?
	`);
	const { results } = await stmt.bind(...filter.params, safeLimit, safeOffset).all();
	return (results || []).map((r) => ({
		id: String(r.id),
		reason: r.reason ?? null,
		by: r.by_user ?? null,
		at: r.at ?? null
	}));
}


// === 黑名单读写接口 ===
// 仅走 D1
async function getBlacklist(env) {
	if (env.DB) {
		try {
			return await readD1Blacklist(env);
		} catch (error) {
			console.error('读 D1 黑名单失败:', error);
		}
	}
	return [];
}

// 检查用户是否在黑名单中
async function checkBlacklist(userId, env, options = {}) {
	if (!env.DB) {
		if (options.strict) {
			return {
				isBlacklisted: true,
				message: '❌ 系统暂时无法确认 D1 黑名单状态，已拒绝自助解封。请联系管理员处理。',
				entry: null,
				checkFailed: true
			};
		}
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
		if (options.strict) {
			return {
				isBlacklisted: true,
				message: '❌ 系统暂时无法确认 D1 黑名单状态，已拒绝自助解封。请联系管理员处理。',
				entry: null,
				checkFailed: true,
				error
			};
		}
		// 如果出错，不阻止用户操作
		return { isBlacklisted: false, message: null };
	}
}

async function blockSelfUnbanIfBlacklisted(userId, chatId, fromUser, env) {
	const blacklistCheck = await checkBlacklist(userId, env, { strict: true });
	if (!blacklistCheck.isBlacklisted) {
		return false;
	}

	await sendTelegramMessage(chatId, blacklistCheck.message);
	if (!blacklistCheck.checkFailed) {
		await notifyOwnerBlacklistAppeal(fromUser, blacklistCheck);
	}
	return true;
}

// 添加用户到黑名单（核心实现）
async function addToBlacklistCore(userId, env, options = {}) {
	if (!env.DB) {
		return { success: false, message: '❌ 未绑定 D1 存储空间' };
	}

	const userIdStr = String(userId);
	const reason = options.reason ?? null;
	const by = options.by != null ? String(options.by) : null;
	const at = new Date().toISOString();

	try {
		await ensureD1Table(env);
		const result = await env.DB
			.prepare('INSERT OR IGNORE INTO blacklist (id, reason, by_user, at) VALUES (?, ?, ?, ?)')
			.bind(userIdStr, reason, by, at)
			.run();
		const changed = result?.meta?.changes ?? result?.changes ?? 0;
		if (!changed) {
			return { success: false, message: '⚠️ 该用户已在黑名单中' };
		}

		return { success: true, message: `✅ 已将用户 <code>${userId}</code> 添加到黑名单` };
	} catch (error) {
		console.error('添加黑名单时出错:', error);
		return { success: false, message: '❌ 添加黑名单失败: ' + error.message };
	}
}

// 添加用户到黑名单（薄包装）
async function addToBlacklist(userId, env, options = {}) {
	const result = await addToBlacklistCore(userId, env, options);
	return result;
}

// 从黑名单中移除用户（核心实现）
async function removeFromBlacklistCore(userId, env) {
	if (!env.DB) {
		return { success: false, message: '❌ 未绑定 D1 存储空间' };
	}

	const userIdStr = String(userId);

	try {
		await ensureD1Table(env);
		const result = await env.DB
			.prepare('DELETE FROM blacklist WHERE id = ?')
			.bind(userIdStr)
			.run();
		const changed = result?.meta?.changes ?? result?.changes ?? 0;
		if (!changed) {
			return { success: false, message: '⚠️ 该用户不在黑名单中' };
		}

		return { success: true, message: `✅ 已将用户 <code>${userId}</code> 从黑名单中移除` };
	} catch (error) {
		console.error('移除黑名单时出错:', error);
		return { success: false, message: '❌ 移除黑名单失败: ' + error.message };
	}
}

// 从黑名单中移除用户（薄包装）
async function removeFromBlacklist(userId, env) {
	const result = await removeFromBlacklistCore(userId, env);
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
async function renderBanResultsDetail(banResults, chatInfoCache = null) {
	const okCount = banResults.filter((r) => r.ok).length;
	const total = banResults.length;
	const lines = [];
	const cache = chatInfoCache || new Map();

	if (okCount === total) {
		lines.push(`🚫 <b>已从全部 ${total} 个群踢出</b>`);
	} else if (okCount === 0) {
		lines.push(`⚠️ <b>全部 ${total} 个群踢人失败</b>`);
	} else {
		lines.push(`🚫 <b>已踢出 ${okCount}/${total} 个群</b>（${total - okCount} 个失败）`);
	}

	// 同一批回执内每个群只拉一次群名，避免 用户数 × 群数 重复 getChat。
	await Promise.all(
		[...new Set(banResults.map((r) => String(r.groupId)))].map(async (groupId) => {
			if (cache.has(groupId)) return;
			try {
				const info = await getChatInfoFromId(groupId);
				cache.set(groupId, info?.title || '未知群名');
			} catch (e) {
				// 拉群名失败不影响主流程
				cache.set(groupId, '未知群名');
			}
		})
	);

	const detailLines = banResults.map((r) => {
			const title = cache.get(String(r.groupId)) || '未知群名';
			const safeTitle = escapeHtml(title);
			const safeId = escapeHtml(String(r.groupId));
			if (r.ok) {
				return `  ✅ <b>${safeTitle}</b> <code>${safeId}</code>`;
			}
			const { 中文, 建议 } = translateTelegramError(r.error);
			return `  ❌ <b>${safeTitle}</b> <code>${safeId}</code>\n     原因：${escapeHtml(中文)}\n     建议：${escapeHtml(建议)}`;
		});

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

// GroupAnonymousBot 的固定 TGID：真人开启"匿名管理员"身份发言时 from 会是它，代表真人操作。
const ANON_ADMIN_BOT_ID = '1087968824';

// 判断操作发起者是否为"机器人操作"。加黑等【仅限真人】的动作据此排除：
// 任何作为管理员的第三方机器人都算机器人操作；GroupAnonymousBot（真人匿名身份）视为真人，不算。
function isBotOperator(user) {
	return Boolean(user?.is_bot) && String(user?.id || '') !== ANON_ADMIN_BOT_ID;
}

function isOwner(id) {
	return OWNER_IDS.length > 0 && OWNER_IDS.includes(String(id || ''));
}

function isPrimaryOwner(id) {
	return OWNER_IDS.length > 0 && String(id || '') === OWNER_IDS[0];
}

function isSecondaryOwner(id) {
	const idStr = String(id || '');
	return OWNER_IDS.length > 1 && OWNER_IDS.slice(1).includes(idStr);
}

function getOwnerNotifyTargets(includeSecondaryOwners = false) {
	if (!OWNER_IDS.length) return [];
	return includeSecondaryOwners ? OWNER_IDS : [OWNER_IDS[0]];
}

async function notifyAllOwners(text, excludeId, includeSecondaryOwners = false) {
	if (!OWNER_IDS.length) return;
	const excludeStr = excludeId ? String(excludeId) : '';
	const targets = getOwnerNotifyTargets(includeSecondaryOwners);
	await Promise.allSettled(
		targets
			.filter(id => id !== excludeStr)
			.map(id => sendTelegramMessage(id, text).then(r => {
				if (!r?.ok) console.error(`[审计通知] 私聊主人${id}失败:${r?.description || '未知'}`);
			}))
	);
}

// 判定操作人角色,返回中文标签:主人 / 超级管理员 / 群管理员
// 主人优先级最高;主人之外的 SUPER_ADMINS 是"超级管理员";其余按调用方传入的兜底标签(默认"管理员")
function classifyOperatorRole(userId, fallback = '管理员') {
	const idStr = String(userId || '');
	if (isPrimaryOwner(idStr)) return '主人';
	if (isSecondaryOwner(idStr)) return '副主人';
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
// - 群内场景:发闪屏给所有人(5 秒自动撤回) + 私聊详情发给主人; /ban、/spam 可额外发给副主人
// - 私聊场景:触发者本人收一份;主人也收一份带操作人标记的副本(触发者是主人则收"你自己"版)
//
// 主人通知规则:
//   * OWNER_IDS 为空 → 跳过私聊投递,仅群闪屏
//   * 默认只通知 OWNER_IDS[0] 主人
//   * /ban、/spam 传 notifySecondaryOwners=true 时,副主人也收到加黑踢人回执
//   * 触发者是收件人本人 → 收"你自己"标记的详情
//   * 触发者非收件人 → 收带"🔔 操作人/来源"头的审计通知
//   * 私聊投递失败(主人没和 bot 私聊过等) → 仅记日志,不在群里追加任何"主人"字样
async function replyToAdmin(message, ctx, { flashText, detailText, isInGroup, notifySecondaryOwners = false }) {
	const chatId = message.chat.id;
	const triggerId = message.from.id;
	const triggerIdStr = String(triggerId);
	const operator = formatUserMention(message.from) || `<code>${escapeHtml(String(triggerId))}</code>`;
	const targets = getOwnerNotifyTargets(notifySecondaryOwners);

	if (!isInGroup) {
		// 私聊场景:触发者本人收原详情(向后兼容)
		await sendTelegramMessage(chatId, detailText);
		// 主人/副主人收审计副本；触发者本人已收到原详情，避免私聊重复投递
		const notifyTargets = targets.filter(oid => oid !== triggerIdStr);
		if (notifyTargets.length) {
			const role = classifyOperatorRole(triggerId, '管理员');
			await Promise.allSettled(notifyTargets.map(oid => {
				const auditText = renderAuditNotification(operator, detailText, '私聊', role);
				return sendTelegramMessage(oid, auditText).then(r => {
					if (!r?.ok) console.error(`[审计通知] 私聊主人${oid}失败:${r?.description || '未知'}`);
				});
			}));
		}
		return;
	}

	// 群内:闪屏所有人可见(5 秒自动撤回)
	await sendFlashMessage(chatId, flashText, ctx);

	// 私聊详情:投递给主人
	if (targets.length) {
		await Promise.allSettled(targets.map(oid => {
			const auditText = (triggerIdStr === oid)
				? `🔔 <b>主人操作通知</b>\n👤 操作人:${operator}（你自己）\n📍 来源:群内\n\n${detailText}`
				: renderAuditNotification(operator, detailText, '群内', classifyOperatorRole(triggerId, '群管理员'));
			return sendTelegramMessage(oid, auditText).then(r => {
				if (!r?.ok) console.error(`[审计通知] 私聊主人${oid}失败:${r?.description || '未知'}`);
			});
		}));
	}
}

// 批量添加：串行写 D1；重复 TGID 归入 exists，不作为异常。
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

function buildBulkJobId(action) {
	const suffix = Math.random().toString(36).slice(2, 8);
	return `${action}_${Date.now().toString(36)}_${suffix}`;
}

function normalizeBulkJob(row) {
	if (!row?.payload) return null;
	try {
		const payload = JSON.parse(row.payload);
		return {
			...payload,
			id: payload.id || row.id,
			action: payload.action || row.type,
			status: payload.status || row.status || 'unknown'
		};
	} catch (error) {
		console.error('解析批量任务失败:', error);
		return null;
	}
}

async function saveBulkJob(env, job) {
	await ensureD1Table(env);
	const now = new Date().toISOString();
	job.updatedAt = now;
	await env.DB
		.prepare('UPDATE batch_jobs SET status = ?, payload = ?, updated_at = ? WHERE id = ?')
		.bind(job.status, JSON.stringify(job), now, job.id)
		.run();
	return job;
}

async function loadBulkJob(env, jobId) {
	if (!env.DB) return null;
	await ensureD1Table(env);
	const row = await env.DB
		.prepare('SELECT id, type, status, payload FROM batch_jobs WHERE id = ?')
		.bind(String(jobId || '').trim())
		.first();
	return normalizeBulkJob(row);
}

function getBulkJobNotifyTargets(message) {
	const targets = getOwnerNotifyTargets(true);
	if (targets.length) return targets;
	return message?.from?.id ? [String(message.from.id)] : [];
}

function createBulkJobPayload(action, ids, invalid, note, message) {
	const now = new Date().toISOString();
	const operator = formatUserMention(message.from) || `<code>${escapeHtml(String(message.from?.id || '未知'))}</code>`;
	const groupIds = GROUP_IDS.map((id) => String(id));
	const job = {
		version: 1,
		id: buildBulkJobId(action),
		action,
		reason: action === 'spam' ? 'spam' : 'manual',
		command: action === 'spam' ? '/spam' : '/ban',
		status: 'queued',
		ids: ids.map((id) => String(id)),
		invalid: (invalid || []).map((id) => String(id)),
		note: String(note || '').trim(),
		groupIds,
		createdBy: String(message.from?.id || ''),
		operator,
		operatorRole: classifyOperatorRole(message.from?.id, message.chat?.type === 'private' ? '管理员' : '群管理员'),
		sourceChatId: String(message.chat?.id ?? ''),
		sourceChatTitle: message.chat?.title || message.chat?.username || (message.chat?.type === 'private' ? '私聊' : '当前群组'),
		sourceChatType: message.chat?.type || 'unknown',
		notifyTargets: getBulkJobNotifyTargets(message),
		userBatchSize: BULK_TASK_USER_BATCH_SIZE,
		concurrency: BULK_TASK_CONCURRENCY,
		retryLimit: BULK_TASK_RETRY_LIMIT,
		totals: {
			users: ids.length,
			groups: groupIds.length,
			operations: ids.length * groupIds.length,
			invalid: (invalid || []).length,
			operationBatchLimit: BULK_TASK_OPERATION_BATCH_LIMIT
		},
		stats: {
			usersProcessed: 0,
			added: 0,
			exists: 0,
			addFailed: 0,
			kickOk: 0,
			kickFailed: 0
		},
		failures: [],
		cursor: 0,
		autoContinue: true,
		autoRunCount: 0,
		doneNotified: false,
		leaseOwner: null,
		leaseUntil: null,
		createdAt: now,
		updatedAt: now,
		startedAt: null,
		finishedAt: null
	};
	return job;
}

async function createBulkJob(env, action, ids, invalid, note, message) {
	if (!env.DB) {
		throw new Error('大批量任务需要绑定 D1 存储空间');
	}
	await ensureD1Table(env);
	const job = createBulkJobPayload(action, ids, invalid, note, message);
	await env.DB
		.prepare('INSERT INTO batch_jobs (id, type, status, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
		.bind(job.id, job.action, job.status, JSON.stringify(job), job.createdAt, job.updatedAt)
		.run();
	return job;
}

function pushBulkJobFailure(job, failure) {
	job.failures.push({
		...failure,
		at: new Date().toISOString()
	});
	if (job.failures.length > BULK_TASK_FAILURE_LIMIT) {
		job.failures = job.failures.slice(-BULK_TASK_FAILURE_LIMIT);
	}
}

function formatBulkJobFailureLine(failure) {
	const groupText = failure.groupId ? ` 群 <code>${escapeHtml(failure.groupId)}</code>` : '';
	const rawError = failure.error || failure.message || '失败';
	const { 中文, 建议 } = translateTelegramError(rawError);
	const reasonText = 中文 === rawError
		? escapeHtml(rawError)
		: `${escapeHtml(中文)}（${escapeHtml(rawError)}）`;
	return `❌ <code>${escapeHtml(failure.userId || '')}</code>${groupText}: ${reasonText}\n   建议:${escapeHtml(建议)}`;
}

function formatBulkJobStatus(job) {
	const map = {
		queued: '等待执行',
		running: '执行中',
		done: '已完成',
		failed: '失败',
		paused: '已暂停'
	};
	return map[job.status] || job.status || '未知';
}

function formatBulkJobAction(job) {
	return job.action === 'spam' ? '举报加黑(/spam)' : '加入黑名单(/ban)';
}

function formatStoredBulkJobContext(job) {
	const lines = [];
	if (job.sourceChatType === 'private') {
		lines.push('📍 命令来源:私聊');
	} else {
		lines.push(`📍 命令来源:${escapeHtml(job.sourceChatTitle || '当前群组')} <code>${escapeHtml(job.sourceChatId || '未知')}</code>`);
		lines.push(`🧹 作用范围:全部 ${job.totals?.groups ?? job.groupIds?.length ?? 0} 个配置群`);
	}
	lines.push(`📝 执行原因:${formatActionNote(job.note)}`);
	return lines;
}

function formatBulkJobDetail(job, title = '📦 <b>批量任务状态</b>') {
	const totalUsers = job.totals?.users ?? job.ids?.length ?? 0;
	const totalGroups = job.totals?.groups ?? job.groupIds?.length ?? 0;
	const totalOps = job.totals?.operations ?? (totalUsers * totalGroups);
	const cursor = Math.min(Number(job.cursor) || 0, totalUsers);
	const percent = totalUsers > 0 ? ((cursor / totalUsers) * 100).toFixed(cursor >= totalUsers ? 0 : 1) : '100';
	const lines = [
		title,
		`任务ID:<code>${escapeHtml(job.id)}</code>`,
		`🎬 操作:${formatBulkJobAction(job)}`,
		`状态:${formatBulkJobStatus(job)}`,
		'',
		...formatStoredBulkJobContext(job),
		'',
		`目标用户:${totalUsers}`,
		`配置群数:${totalGroups}`,
		`总操作数:${totalOps}`,
		`已处理用户:${cursor}/${totalUsers} (${percent}%)`,
		'',
		`加黑成功:${job.stats?.added || 0}`,
		`已存在:${job.stats?.exists || 0}`,
		`加黑失败:${job.stats?.addFailed || 0}`,
		`踢人成功:${job.stats?.kickOk || 0}`,
		`踢人失败:${job.stats?.kickFailed || 0}`,
		`格式错误:${job.totals?.invalid || 0}`,
		'',
		`执行参数:单轮最多 ${getBulkJobSafeUserBatchSize(job)} 用户 / 操作预算 ${job.totals?.operationBatchLimit || BULK_TASK_OPERATION_BATCH_LIMIT} / 并发 ${job.concurrency || BULK_TASK_CONCURRENCY} / 重试 ${job.retryLimit ?? BULK_TASK_RETRY_LIMIT} 次`
	];
	if (job.status !== 'done') {
		if (job.autoContinue !== false) {
			lines.push('自动续接:已开启');
			lines.push(`手动补跑:<code>/jobrun ${escapeHtml(job.id)}</code>`);
		} else {
			lines.push(`继续执行:<code>/jobrun ${escapeHtml(job.id)}</code>`);
		}
	}
	if (job.failures?.length) {
		lines.push('', `<b>最近失败</b>（最多显示 ${Math.min(job.failures.length, 5)} 条）:`);
		for (const f of job.failures.slice(-5)) {
			lines.push(formatBulkJobFailureLine(f));
		}
	}
	return lines.join('\n');
}

async function notifyBulkJobTargets(job, detailText) {
	const targets = Array.isArray(job.notifyTargets) ? job.notifyTargets : [];
	if (!targets.length) return;
	await Promise.allSettled(targets.map((targetId) => {
		const text = String(targetId) === String(job.createdBy)
			? detailText
			: renderAuditNotification(job.operator || `<code>${escapeHtml(job.createdBy || '')}</code>`, detailText, job.sourceChatType === 'private' ? '私聊' : '群内', job.operatorRole || '管理员');
		return sendTelegramMessage(targetId, text).then((r) => {
			if (!r?.ok) console.error(`[批量任务通知] 私聊${targetId}失败:${r?.description || '未知'}`);
		});
	}));
}

async function banUserFromGroupWithRetry(groupId, userId, retryLimit) {
	let last = null;
	for (let attempt = 0; attempt <= retryLimit; attempt++) {
		const result = await banUserFromGroup(groupId, userId);
		if (result.ok) {
			return { ...result, attempts: attempt + 1 };
		}
		last = result;
		if (attempt < retryLimit) {
			await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
		}
	}
	return { ok: false, error: last?.error || '失败', attempts: retryLimit + 1 };
}

async function processBulkJobUserBatch(job, env, ids) {
	const kickTasks = [];
	for (const id of ids) {
		const result = await addToBlacklistCore(id, env, { reason: job.reason, by: job.createdBy });
		if (result.success) {
			job.stats.added += 1;
		} else if (result.message && result.message.includes('已在黑名单')) {
			job.stats.exists += 1;
		} else {
			job.stats.addFailed += 1;
			pushBulkJobFailure(job, { userId: id, phase: 'add', error: result.message || '加黑失败' });
			continue;
		}
		for (const groupId of job.groupIds) {
			kickTasks.push({ userId: id, groupId });
		}
	}

	await mapWithConcurrency(kickTasks, job.concurrency || BULK_TASK_CONCURRENCY, async (task) => {
		const result = await banUserFromGroupWithRetry(task.groupId, task.userId, job.retryLimit ?? BULK_TASK_RETRY_LIMIT);
		if (result.ok) {
			job.stats.kickOk += 1;
		} else {
			job.stats.kickFailed += 1;
			pushBulkJobFailure(job, {
				userId: task.userId,
				groupId: task.groupId,
				phase: 'kick',
				error: result.error || '踢人失败'
			});
		}
	});
}

function getBulkJobSafeUserBatchSize(job) {
	const groups = Math.max(1, Number(job?.totals?.groups ?? job?.groupIds?.length ?? GROUP_IDS.length) || 1);
	const byOperations = Math.max(1, Math.floor(BULK_TASK_OPERATION_BATCH_LIMIT / groups));
	const configured = Math.max(1, Number(job?.userBatchSize) || BULK_TASK_USER_BATCH_SIZE);
	return Math.max(1, Math.min(configured, byOperations));
}

function isBulkJobLeaseActive(job) {
	const until = Date.parse(job?.leaseUntil || '');
	return Number.isFinite(until) && until > Date.now();
}

function clearBulkJobLease(job) {
	job.leaseOwner = null;
	job.leaseUntil = null;
}

function getErrorMessage(error) {
	if (!error) return '未知错误';
	if (typeof error === 'string') return error;
	return error.message || String(error);
}

async function markBulkJobFailed(env, jobId, error) {
	const job = typeof jobId === 'object' ? jobId : await loadBulkJob(env, jobId);
	if (!job || job.status === 'done') return job;
	const message = getErrorMessage(error).slice(0, 500);
	job.status = 'failed';
	clearBulkJobLease(job);
	pushBulkJobFailure(job, { phase: 'auto', error: message });
	const shouldNotify = !job.failedNotified;
	job.failedNotified = true;
	await saveBulkJob(env, job);
	if (shouldNotify) {
		await notifyBulkJobTargets(job, formatBulkJobDetail(job, '❌ <b>批量任务执行失败</b>'));
	}
	return job;
}

function getBulkQueue(env) {
	return env?.BULK_QUEUE && typeof env.BULK_QUEUE.send === 'function' ? env.BULK_QUEUE : null;
}

function scheduleBulkJobAutoContinue(job, ctx, requestUrl, env = null) {
	if (!env || !job || job.status === 'done' || job.cursor >= job.ids.length || job.autoContinue === false) return false;
	const queue = getBulkQueue(env);
	if (!queue) {
		console.warn(`[批量任务] 未绑定 BULK_QUEUE，自动续接未启动 ${job.id}; 可手动 /jobrun ${job.id}`);
		return false;
	}
	const task = (async () => {
		let lastError = null;
		for (let attempt = 1; attempt <= 3; attempt += 1) {
			try {
				await queue.send({ type: 'bulk_job_run', id: job.id });
				return;
			} catch (error) {
				lastError = getErrorMessage(error);
				console.error(`[批量任务] Queue 自动续接触发异常 ${job.id}:`, error);
			}
			if (attempt < 3) {
				await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
			}
		}
		await markBulkJobFailed(env, job.id, `Queue 自动续接触发失败: ${lastError || '未知错误'}`);
	})().catch(async (error) => {
		console.error(`[批量任务] 自动续接异常 ${job.id}:`, error);
		await markBulkJobFailed(env, job.id, error);
	});
	if (ctx && typeof ctx.waitUntil === 'function') {
		ctx.waitUntil(task);
	} else {
		return task;
	}
	return true;
}

async function runBulkModerationJob(env, jobId, options = {}) {
	let job = await loadBulkJob(env, jobId);
	if (!job) return null;
	if (job.status === 'done') return job;
	if (!options.ignoreLease && isBulkJobLeaseActive(job)) {
		return job;
	}
	const started = Date.now();
	const maxRounds = Math.max(1, Number(options.maxRounds) || 1);
	let rounds = 0;
	const leaseOwner = `${options.source || 'run'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
	try {
		job.status = 'running';
		job.startedAt = job.startedAt || new Date().toISOString();
		job.leaseOwner = leaseOwner;
		job.leaseUntil = new Date(Date.now() + BULK_TASK_LEASE_MS).toISOString();
		job.autoRunCount = (Number(job.autoRunCount) || 0) + 1;
		await saveBulkJob(env, job);

		while (job.cursor < job.ids.length && rounds < maxRounds) {
			const safeBatchSize = getBulkJobSafeUserBatchSize(job);
			const batch = job.ids.slice(job.cursor, job.cursor + safeBatchSize);
			await processBulkJobUserBatch(job, env, batch);
			job.cursor += batch.length;
			job.stats.usersProcessed = job.cursor;
			rounds += 1;
			if (job.cursor >= job.ids.length) {
				job.status = 'done';
				job.finishedAt = new Date().toISOString();
			}
			if (job.status === 'done') {
				clearBulkJobLease(job);
			}
			await saveBulkJob(env, job);
			if (job.status === 'done') break;
			if (Date.now() - started >= BULK_TASK_MAX_RUNTIME_MS) break;
		}

		if (job.status !== 'done') {
			job.status = 'queued';
			clearBulkJobLease(job);
			await saveBulkJob(env, job);
			if (options.autoContinue !== false) {
				const scheduled = scheduleBulkJobAutoContinue(job, options.ctx, options.requestUrl, env);
				if (scheduled && typeof scheduled.then === 'function') {
					await scheduled;
				}
			}
		}

		if (job.status === 'done' && options.notifyOnDone !== false && !job.doneNotified) {
			await notifyBulkJobTargets(job, formatBulkJobDetail(job, '✅ <b>批量任务完成</b>'));
			job.doneNotified = true;
			await saveBulkJob(env, job);
		}
		return job;
	} catch (error) {
		console.error(`[批量任务] 执行异常 ${job.id}:`, error);
		return await markBulkJobFailed(env, job, error);
	}
}

async function startBulkModerationJobFromCommand(message, env, ctx, options) {
	const { action, valid, invalid, note, isInGroup } = options;
	const operationCount = valid.length * Math.max(1, GROUP_IDS.length);
	if (valid.length < BULK_TASK_THRESHOLD && operationCount <= BULK_TASK_SYNC_OPERATION_LIMIT) return false;
	if (!env.DB) {
		const detailText = withActionContext(message, `❌ 批量任务需要绑定 D1 存储空间\n目标用户:${valid.length}\n总操作数:${operationCount}`, note);
		await replyToAdmin(message, ctx, {
			flashText: '❌ 批量任务需要绑定 D1',
			detailText,
			isInGroup,
			notifySecondaryOwners: true
		});
		return true;
	}
	const job = await createBulkJob(env, action, valid, invalid, note, message);
	const autoQueueAvailable = Boolean(getBulkQueue(env));
	if (!autoQueueAvailable) {
		job.autoContinue = false;
		await saveBulkJob(env, job);
	}
	const detailText = formatBulkJobDetail(job, '📦 <b>批量任务已创建</b>');
	await replyToAdmin(message, ctx, {
		flashText: `📦 批量任务已创建 <code>${job.id}</code>\n目标 ${job.totals.users} 个`,
		detailText,
		isInGroup,
		notifySecondaryOwners: true
	});
	const scheduled = autoQueueAvailable ? scheduleBulkJobAutoContinue(job, ctx, options.requestUrl, env) : false;
	if (scheduled && typeof scheduled.then === 'function') {
		await scheduled;
	}
	return true;
}

async function handleBulkJobAutoRun(env, url, ctx, requestUrl) {
	if (!env.DB) {
		return jsonResponse({ success: false, error: '批量任务需要绑定 D1 存储空间' }, 400);
	}
	const jobId = String(url.searchParams.get('id') || '').trim();
	if (!jobId) {
		return jsonResponse({ success: false, error: 'missing id' }, 400);
	}
	const job = await runBulkModerationJob(env, jobId, {
		notifyOnDone: true,
		autoContinue: true,
		ctx,
		requestUrl,
		source: 'auto'
	});
	if (!job) {
		return jsonResponse({ success: false, error: 'job not found', id: jobId }, 404);
	}
	return jsonResponse({
		success: true,
		id: job.id,
		status: job.status,
		done: job.status === 'done',
		cursor: job.cursor,
		total: job.ids?.length || 0,
		autoRunCount: job.autoRunCount || 0
	});
}

// 黑名单导出接口（受 TOKEN 保护）
// 数据源：D1
// 输出格式：
//   ?format=json → application/json，触发浏览器下载
//   ?format=csv  → text/csv，UTF-8 + BOM，Excel 可直接打开
//   其它/默认    → HTML 表格，浏览器直接查看
async function handleExport(env, url) {
	if (!env.DB) {
		return new Response('❌ 未绑定 D1 存储空间', { status: 400 });
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
	const dataSource = 'D1（权威）';
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

// 分批清扫：扫描当前黑名单 × 所有 GROUP_IDS，把仍在群里的人全部踢出
// 受 TOKEN 保护（与 /export 同等防护级别）
// 串行执行避免 Telegram API 限流，先 checkUserStatus 跳过已离群/已踢的用户
function isTelegramNotInChatError(error) {
	const text = String(error?.message || error || '').toLowerCase();
	return (
		text.includes('user not found') ||
		text.includes('user_not_participant') ||
		text.includes('participant_id_invalid') ||
		text.includes('member not found')
	);
}

function parsePurgePositiveInt(value, fallback) {
	const n = parseInt(String(value ?? '').trim(), 10);
	return Number.isInteger(n) && n > 0 ? n : fallback;
}

function parsePurgeLimit(url) {
	const requested = parsePurgePositiveInt(url.searchParams.get('limit'), PURGE_DEFAULT_PAIR_LIMIT);
	return Math.min(Math.max(requested, 1), PURGE_MAX_PAIR_LIMIT);
}

function parsePurgeCursor(url, totalPairs) {
	const cursor = parsePurgePositiveInt(url.searchParams.get('cursor'), 0);
	return Math.min(Math.max(cursor, 0), Math.max(0, totalPairs));
}

function buildPurgeNextUrl(url, nextCursor, limit) {
	const nextUrl = new URL(url.toString());
	nextUrl.searchParams.set('cursor', String(nextCursor));
	nextUrl.searchParams.set('limit', String(limit));
	return nextUrl.toString();
}

async function mapWithConcurrency(items, concurrency, worker) {
	const results = new Array(items.length);
	let nextIndex = 0;
	const workerCount = Math.min(Math.max(1, concurrency), items.length);
	const runners = Array.from({ length: workerCount }, async () => {
		while (nextIndex < items.length) {
			const currentIndex = nextIndex++;
			results[currentIndex] = await worker(items[currentIndex], currentIndex);
		}
	});
	await Promise.all(runners);
	return results;
}

function parsePurgeGroupIds(url) {
	const raw = url.searchParams.get('groups');
	if (raw === null) {
		return GROUP_IDS;
	}
	const requested = new Set(
		String(raw)
			.split(/[,，]/)
			.map((id) => id.trim())
			.filter(Boolean)
	);
	return GROUP_IDS.filter((groupId) => requested.has(String(groupId)));
}

function parsePurgeReasons(url) {
	const raw = url.searchParams.get('reasons') ?? url.searchParams.get('reason');
	if (raw === null || String(raw).trim() === '') {
		return [...PURGE_DEFAULT_REASONS];
	}
	const tokens = String(raw)
		.toLowerCase()
		.split(/[,，\s]+/)
		.map((reason) => reason.trim())
		.filter(Boolean);
	if (tokens.includes('all')) {
		return null;
	}
	const seen = new Set();
	const reasons = [];
	for (const reason of tokens) {
		if (!/^[a-z0-9_-]+$/.test(reason) || seen.has(reason)) continue;
		seen.add(reason);
		reasons.push(reason);
	}
	return reasons.length > 0 ? reasons : [...PURGE_DEFAULT_REASONS];
}

function stringifyPurgeReasons(reasons) {
	return Array.isArray(reasons) ? reasons.join(',') : 'all';
}

function describePurgeReasons(reasons) {
	if (!Array.isArray(reasons)) {
		return '全部黑名单';
	}
	const normalized = reasons.join(',');
	if (normalized === PURGE_DEFAULT_REASONS.join(',')) {
		return '/ban + /spam';
	}
	return normalized || '/ban + /spam';
}

function stringifyPurgeGroups(groups) {
	return (groups || []).map((id) => String(id)).join(',');
}

function botCanRestrictMember(member) {
	if (!member || !member.user) {
		return false;
	}
	if (member.status === 'creator') {
		return true;
	}
	return member.status === 'administrator' && member.can_restrict_members === true;
}

async function checkPurgeGroupAccess(groupId, botId) {
	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatAdministrators`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: groupId })
		});
		const result = await response.json();
		if (!response.ok || !result.ok || !Array.isArray(result.result)) {
			return {
				groupId,
				ok: false,
				reason: result.description || `HTTP ${response.status}`
			};
		}

		const botMember = result.result.find((member) => String(member?.user?.id) === String(botId));
		if (!botMember) {
			return { groupId, ok: false, reason: 'bot 不在群管理员列表中' };
		}
		if (!botCanRestrictMember(botMember)) {
			return { groupId, ok: false, status: botMember.status, reason: 'bot 缺少封禁用户权限 can_restrict_members' };
		}
		return { groupId, ok: true, status: botMember.status };
	} catch (error) {
		return { groupId, ok: false, reason: error.message };
	}
}

async function handlePurgeGroups() {
	if (!Array.isArray(GROUP_IDS) || GROUP_IDS.length === 0) {
		return jsonResponse({ 成功: false, 错误: 'GROUP_IDS 未配置' }, 400);
	}

	const botId = await getBotId();
	if (!botId) {
		return jsonResponse({ 成功: false, 错误: '无法获取机器人 ID，无法预检群权限' }, 500);
	}

	const checks = await mapWithConcurrency(
		GROUP_IDS,
		PURGE_CONCURRENCY,
		(groupId) => checkPurgeGroupAccess(groupId, botId)
	);
	const available = checks.filter((item) => item.ok);
	const skipped = checks.filter((item) => !item.ok);
	const availableGroupIds = available.map((item) => String(item.groupId));

	return jsonResponse({
		成功: true,
		bot_id: String(botId),
		配置群组数: GROUP_IDS.length,
		可清扫群组数: available.length,
		跳过群组数: skipped.length,
		可清扫群组: available,
		跳过群组: skipped,
		groups: stringifyPurgeGroups(availableGroupIds)
	});
}

function jsonForInlineScript(value) {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

function handlePurgeRunner(url) {
	const limit = parsePurgeLimit(url);
	const cursor = parsePurgePositiveInt(url.searchParams.get('cursor'), 0);
	const purgeReasons = parsePurgeReasons(url);
	const purgeReasonsParam = stringifyPurgeReasons(purgeReasons);
	const purgeScope = describePurgeReasons(purgeReasons);
	const apiUrl = new URL(url.toString());
	apiUrl.pathname = apiUrl.pathname.replace(/\/run$/, '');
	apiUrl.searchParams.set('cursor', String(cursor));
	apiUrl.searchParams.set('limit', String(limit));
	apiUrl.searchParams.set('reasons', purgeReasonsParam);
	const groupCheckUrl = new URL(apiUrl.toString());
	groupCheckUrl.pathname = groupCheckUrl.pathname.replace(/\/purge$/, '/purge/groups');
	groupCheckUrl.search = '';

	const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>黑名单清扫</title>
<style>
	body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7f9; color: #111827; }
	main { max-width: 980px; margin: 0 auto; padding: 28px 18px 40px; }
	h1 { margin: 0 0 8px; font-size: 26px; }
	p { margin: 8px 0; color: #4b5563; line-height: 1.55; }
	.toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 18px 0; }
	button { border: 0; border-radius: 6px; padding: 9px 14px; color: white; background: #2563eb; cursor: pointer; font-weight: 600; }
	button.secondary { background: #4b5563; }
	button:disabled { opacity: .55; cursor: not-allowed; }
	input { width: 72px; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; }
	a.download { display: inline-flex; align-items: center; margin-right: 10px; border-radius: 6px; padding: 9px 14px; color: white; background: #047857; text-decoration: none; font-weight: 600; }
	.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin: 18px 0; }
	.stat { background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; }
	.stat b { display: block; font-size: 20px; margin-top: 4px; }
	.progress { height: 10px; background: #e5e7eb; border-radius: 999px; overflow: hidden; }
	.progress span { display: block; width: 0%; height: 100%; background: #2563eb; transition: width .2s ease; }
	.downloads { margin: 18px 0; }
	pre { white-space: pre-wrap; word-break: break-word; background: #111827; color: #e5e7eb; border-radius: 6px; padding: 14px; max-height: 420px; overflow: auto; }
</style>
</head>
<body>
<main>
	<h1>黑名单清扫</h1>
	<p>页面会先预检机器人在各群的封禁权限，只清扫有权限的群。默认范围：${escapeHtml(purgeScope)}。每批默认 ${PURGE_DEFAULT_PAIR_LIMIT} 个“用户×群”组合，批内 ${PURGE_CONCURRENCY} 并发，避免触发 Cloudflare Worker 子请求限制。</p>
	<div class="toolbar">
		<label>每批 <input id="limit" type="number" min="1" max="${PURGE_MAX_PAIR_LIMIT}" value="${limit}"></label>
		<button id="start">继续</button>
		<button id="pause" class="secondary" disabled>暂停</button>
	</div>
	<div class="stats">
		<div class="stat">状态<b id="status">未开始</b></div>
		<div class="stat">游标<b id="cursor">${cursor}</b></div>
		<div class="stat">进度<b id="processed">0 / 0</b></div>
		<div class="stat">百分比<b id="percent">0%</b></div>
		<div class="stat">已踢出<b id="kicked">0</b></div>
		<div class="stat">不在群<b id="left">0</b></div>
		<div class="stat">失败<b id="failed">0</b></div>
	</div>
	<div class="progress" aria-label="清扫进度"><span id="bar"></span></div>
	<div id="downloads" class="downloads" hidden>
		<a id="downloadTxt" class="download" href="#" download>下载 TXT 报告</a>
		<a id="downloadCsv" class="download" href="#" download>下载 CSV 明细</a>
	</div>
	<pre id="log"></pre>
</main>
<script>
	const delayMs = ${PURGE_RUN_DELAY_MS};
	const groupCheckUrl = ${jsonForInlineScript(groupCheckUrl.toString())};
	const purgeReasons = ${jsonForInlineScript(purgeReasonsParam)};
	const purgeScope = ${jsonForInlineScript(purgeScope)};
	let nextUrl = ${jsonForInlineScript(apiUrl.toString())};
	let running = false;
	let checkedGroups = false;
	let activeGroups = '';
	let groupPrecheck = null;
	const totals = { kicked: 0, left: 0, failed: 0 };
	const batches = [];
	const details = [];
	const startedAt = new Date();
	let txtObjectUrl = null;
	let csvObjectUrl = null;
	const $ = (id) => document.getElementById(id);
	function log(line, data) {
		const logEl = $('log');
		logEl.textContent += '[' + new Date().toLocaleTimeString() + '] ' + line + (data ? '\\n' + data : '') + '\\n\\n';
		logEl.scrollTop = logEl.scrollHeight;
	}
	function updateProgress(data) {
		const total = Math.max(Number(data['总任务数']) || 0, 0);
		const processed = Math.min(Math.max(Number(data['本批结束游标']) || 0, 0), total);
		const percent = total > 0 ? Math.min(100, (processed / total) * 100) : 100;
		const text = total > 0 ? percent.toFixed(percent >= 10 ? 1 : 2).replace(/\\.0+$/, '') + '%' : '100%';
		$('processed').textContent = processed + ' / ' + total;
		$('percent').textContent = text;
		$('bar').style.width = text;
		if (running) $('status').textContent = '运行中 ' + text;
	}
	function apply(data) {
		totals.kicked += data['已踢出'] || 0;
		totals.left += data['不在群'] || 0;
		totals.failed += data['失败'] || 0;
		batches.push(data);
		for (const item of (data['详情'] || [])) {
			details.push({
				batch: batches.length,
				cursor: item['游标'] ?? '',
				userId: item['用户ID'] ?? '',
				groupId: item['群ID'] ?? '',
				status: item['旧状态'] ?? '',
				result: item['结果'] ?? '',
				error: item['错误'] ?? ''
			});
		}
		$('kicked').textContent = totals.kicked;
		$('left').textContent = totals.left;
		$('failed').textContent = totals.failed;
		$('cursor').textContent = data['下批游标'] ?? data['本批结束游标'] ?? '';
		nextUrl = data.next_url || null;
		updateProgress(data);
		log('本批完成', 'cursor ' + data['本批开始游标'] + '-' + data['本批结束游标'] + ' / 踢出 ' + data['已踢出'] + ' / 不在群 ' + data['不在群'] + ' / 失败 ' + data['失败']);
	}
	function csvCell(value) {
		return '"' + String(value ?? '').replace(/"/g, '""') + '"';
	}
	function makeCsv() {
		const rows = [['batch', 'cursor', 'user_id', 'group_id', 'old_status', 'result', 'error']];
		for (const item of details) {
			rows.push([item.batch, item.cursor, item.userId, item.groupId, item.status, item.result, item.error]);
		}
		return rows.map((row) => row.map(csvCell).join(',')).join('\\n') + '\\n';
	}
	function makeTxt(finishedAt) {
		const last = batches[batches.length - 1] || {};
		const lines = [
			'黑名单清扫报告',
			'开始时间: ' + startedAt.toISOString(),
			'结束时间: ' + finishedAt.toISOString(),
			'清扫范围: ' + purgeScope,
			'黑名单总数: ' + (last['黑名单总数'] ?? 0),
			'配置群组数: ' + (last['配置群组数'] ?? 0),
			'总任务数: ' + (last['总任务数'] ?? 0),
			'已处理: ' + (last['本批结束游标'] ?? 0),
			'已踢出: ' + totals.kicked,
			'不在群: ' + totals.left,
			'失败: ' + totals.failed,
			'批次数: ' + batches.length,
			'',
			'群权限预检:',
			JSON.stringify(groupPrecheck || {}, null, 2),
			'',
			'批次摘要:'
		];
		for (let i = 0; i < batches.length; i++) {
			const batch = batches[i];
			lines.push(
				'#' + (i + 1) +
				' cursor ' + batch['本批开始游标'] + '-' + batch['本批结束游标'] +
				' 已踢出=' + batch['已踢出'] +
				' 不在群=' + batch['不在群'] +
				' 失败=' + batch['失败']
			);
		}
		if (details.length > 0) {
			lines.push('', '明细:', JSON.stringify(details, null, 2));
		}
		return lines.join('\\n') + '\\n';
	}
	function makeDownload(name, content, type) {
		const blob = new Blob([content], { type });
		return URL.createObjectURL(blob);
	}
	function finish() {
		const finishedAt = new Date();
		if (txtObjectUrl) URL.revokeObjectURL(txtObjectUrl);
		if (csvObjectUrl) URL.revokeObjectURL(csvObjectUrl);
		const stamp = finishedAt.toISOString().replace(/[:.]/g, '-');
		txtObjectUrl = makeDownload('purge-report-' + stamp + '.txt', makeTxt(finishedAt), 'text/plain;charset=utf-8');
		csvObjectUrl = makeDownload('purge-details-' + stamp + '.csv', '\\ufeff' + makeCsv(), 'text/csv;charset=utf-8');
		$('downloadTxt').href = txtObjectUrl;
		$('downloadTxt').download = 'purge-report-' + stamp + '.txt';
		$('downloadCsv').href = csvObjectUrl;
		$('downloadCsv').download = 'purge-details-' + stamp + '.csv';
		$('downloads').hidden = false;
		log('全部完成，已生成 TXT 和 CSV 下载文件');
	}
	async function precheckGroups() {
		if (checkedGroups) return true;
		$('status').textContent = '预检群权限';
		const res = await fetch(groupCheckUrl, { cache: 'no-store' });
		const data = await res.json();
		if (!res.ok || data['成功'] !== true) throw new Error(data['错误'] || ('群权限预检失败 HTTP ' + res.status));
		groupPrecheck = data;
		activeGroups = data.groups || '';
		checkedGroups = true;
		log('群权限预检完成', '可清扫群 ' + data['可清扫群组数'] + '/' + data['配置群组数'] + (data['跳过群组数'] ? '，跳过 ' + data['跳过群组数'] : ''));
		if (!activeGroups) {
			running = false;
			$('status').textContent = '无可清扫群';
			$('start').textContent = '无可清扫群';
			$('start').disabled = true;
			$('pause').disabled = true;
			finish();
			return false;
		}
		return true;
	}
	async function step() {
		if (!running || !nextUrl) return;
		$('status').textContent = '运行中';
		try {
			if (!(await precheckGroups())) return;
			const limit = Math.min(Math.max(parseInt($('limit').value, 10) || ${PURGE_DEFAULT_PAIR_LIMIT}, 1), ${PURGE_MAX_PAIR_LIMIT});
			const url = new URL(nextUrl);
			url.searchParams.set('limit', String(limit));
			url.searchParams.set('groups', activeGroups);
			url.searchParams.set('reasons', purgeReasons);
			const res = await fetch(url.toString(), { cache: 'no-store' });
			const data = await res.json();
			if (!res.ok || data['成功'] !== true) throw new Error(data['错误'] || ('HTTP ' + res.status));
			apply(data);
			if (data.done || data['已完成'] || !data.next_url) {
				running = false;
				$('status').textContent = '已完成';
				$('start').textContent = '已完成';
				$('start').disabled = true;
				$('pause').disabled = true;
				finish();
				return;
			}
			setTimeout(step, delayMs);
		} catch (error) {
			running = false;
			$('status').textContent = '已暂停';
			$('start').disabled = false;
			$('pause').disabled = true;
			log('错误: ' + error.message);
		}
	}
	function startRun() {
		if (!nextUrl || running) return;
		running = true;
		$('start').disabled = true;
		$('pause').disabled = false;
		step();
	}
	$('start').onclick = startRun;
	$('pause').onclick = () => {
		running = false;
		$('status').textContent = '已暂停';
		$('start').disabled = false;
		$('pause').disabled = true;
	};
	log('页面已打开，自动开始清扫');
	startRun();
</script>
</body>
</html>`;

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=UTF-8',
			'Cache-Control': 'no-store'
		}
	});
}

async function handlePurge(env, url) {
	if (!env.DB) {
		return jsonResponse({ 成功: false, 错误: '未绑定 D1 存储空间' }, 400);
	}
	if (!Array.isArray(GROUP_IDS) || GROUP_IDS.length === 0) {
		return jsonResponse({ 成功: false, 错误: 'GROUP_IDS 未配置' }, 400);
	}

	const purgeReasons = parsePurgeReasons(url);
	const purgeReasonsParam = stringifyPurgeReasons(purgeReasons);
	const purgeScope = describePurgeReasons(purgeReasons);
	let totalBlacklist;
	try {
		totalBlacklist = await getD1BlacklistCount(env, purgeReasons);
	} catch (error) {
		return jsonResponse({ 成功: false, 错误: '读取黑名单数量失败: ' + error.message }, 500);
	}

	const activeGroupIds = parsePurgeGroupIds(url);
	const groupCount = activeGroupIds.length;
	const totalPairs = totalBlacklist * groupCount;
	const limit = parsePurgeLimit(url);
	const startCursor = parsePurgeCursor(url, totalPairs);
	const endCursor = Math.min(startCursor + limit, totalPairs);
	const done = endCursor >= totalPairs;
	const nextCursor = done ? null : endCursor;
	const summary = {
		清扫范围: purgeScope,
		reasons: purgeReasonsParam,
		黑名单总数: totalBlacklist,
		配置群组数: GROUP_IDS.length,
		参与群组数: groupCount,
		参与群组列表: activeGroupIds,
		总任务数: totalPairs,
		本批开始游标: startCursor,
		本批结束游标: endCursor,
		下批游标: nextCursor,
		本批处理上限: limit,
		本批计划处理: endCursor - startCursor,
		本批已处理: 0,
		剩余任务数: Math.max(0, totalPairs - endCursor),
		已完成: done,
		done,
		next_cursor: nextCursor,
		next_url: nextCursor === null ? null : buildPurgeNextUrl(url, nextCursor, limit),
		已踢出: 0,
		不在群: 0,
		失败: 0,
		详情: []
	};

	if (summary.本批计划处理 === 0) {
		return jsonResponse({ 成功: true, ...summary });
	}

	const userStartIndex = Math.floor(startCursor / groupCount);
	const userEndIndex = Math.ceil(endCursor / groupCount);
	let blacklistWindow;
	try {
		blacklistWindow = await readD1BlacklistWindow(env, userStartIndex, userEndIndex - userStartIndex, purgeReasons);
	} catch (error) {
		return jsonResponse({ 成功: false, 错误: '读取黑名单批次失败: ' + error.message }, 500);
	}

	const cursors = [];
	for (let cursor = startCursor; cursor < endCursor; cursor++) {
		cursors.push(cursor);
	}

	const results = await mapWithConcurrency(cursors, PURGE_CONCURRENCY, async (cursor) => {
		const userIndex = Math.floor(cursor / groupCount);
		const groupIndex = cursor % groupCount;
		const entry = blacklistWindow[userIndex - userStartIndex];
		const groupId = activeGroupIds[groupIndex];

		if (!entry) {
			return {
				type: 'failed',
				detail: { 游标: cursor, 群ID: groupId, 结果: '黑名单行不存在', 错误: '清扫期间黑名单发生变化，请从 cursor=0 重新开始' }
			};
		}

		let status = null;
		try {
			const statusResult = await checkUserStatus(entry.id, groupId);
			status = statusResult?.result?.status ?? null;
		} catch (error) {
			if (isTelegramNotInChatError(error)) {
				return { type: 'left' };
			}
			console.error(`[purge] checkUserStatus 失败 user=${entry.id} group=${groupId}:`, error.message);
			return {
				type: 'failed',
				detail: { 用户ID: entry.id, 群ID: groupId, 游标: cursor, 结果: '查询状态失败', 错误: error.message }
			};
		}
		// 已踢出 / 已离开 → 跳过；left/kicked 是 Telegram 返回的"非群成员"状态
		if (status === 'kicked' || status === 'left' || status === null) {
			return { type: 'left' };
		}
		const r = await banUserFromGroup(groupId, entry.id);
		if (r.ok) {
			return {
				type: 'kicked',
				detail: { 用户ID: entry.id, 群ID: groupId, 游标: cursor, 旧状态: status, 结果: '已踢' }
			};
		}
		return {
			type: 'failed',
			detail: { 用户ID: entry.id, 群ID: groupId, 游标: cursor, 旧状态: status, 结果: '失败', 错误: r.error }
		};
	});

	for (const result of results) {
		summary.本批已处理 += 1;
		if (result?.type === 'kicked') {
			summary.已踢出 += 1;
			summary.详情.push(result.detail);
		} else if (result?.type === 'left') {
			summary.不在群 += 1;
		} else {
			summary.失败 += 1;
			if (result?.detail) {
				summary.详情.push(result.detail);
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

function isJobCommand(text) {
	if (!text) {
		return false;
	}

	const trimmedText = text.trim();
	return /^\/job(?:run)?(?:@[^\s]+)?(?:\s|$)/i.test(trimmedText);
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

function sanitizeTelegramText(value) {
	return String(value ?? '').replace(/[\uD800-\uDFFF]/g, '');
}

function truncateTelegramText(value, maxLength) {
	const clean = sanitizeTelegramText(value);
	if (!Number.isFinite(maxLength) || maxLength <= 0) return '';
	return Array.from(clean).slice(0, maxLength).join('');
}

function escapeHtml(value) {
	return sanitizeTelegramText(value)
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

async function resolvePermissionUserProfiles(ids) {
	const wanted = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
	const wantedSet = new Set(wanted);
	const profiles = new Map();

	for (const groupId of GROUP_IDS) {
		try {
			const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatAdministrators`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: groupId }),
			});
			const result = await response.json();
			if (!response.ok || !result.ok || !Array.isArray(result.result)) {
				continue;
			}
			for (const member of result.result) {
				const user = member?.user;
				const id = user?.id ? String(user.id) : '';
				if (wantedSet.has(id) && !profiles.has(id)) {
					profiles.set(id, {
						user,
						status: member.status || '',
						source: 'getChatAdministrators',
						groupId: String(groupId)
					});
				}
			}
		} catch (error) {
			console.error(`[权限名单] 查询群管理员失败 group=${groupId}:`, error);
		}
	}

	for (const id of wanted) {
		if (profiles.has(id)) continue;
		for (const groupId of GROUP_IDS) {
			try {
				const result = await checkUserStatus(id, groupId);
				const user = result?.result?.user;
				if (user?.id) {
					profiles.set(id, {
						user,
						status: result.result.status || '',
						source: 'getChatMember',
						groupId: String(groupId)
					});
					break;
				}
			} catch (_) {
				// 单群查不到继续下一个群
			}
		}
	}

	return profiles;
}

function renderPermissionUserLine(id, profile, index) {
	const user = profile?.user;
	const fullName = user
		? ([user.first_name, user.last_name].filter(Boolean).join(' ') || '未设置')
		: '未获取';
	const username = user?.username ? `@${escapeHtml(user.username)}` : (user ? '未设置' : '未获取');
	const statusMap = {
		creator: '群主',
		administrator: '管理员',
		member: '成员',
		restricted: '受限成员',
		left: '已离群',
		kicked: '已踢出'
	};
	const lines = [
		`${index}. TGID:<code>${escapeHtml(id)}</code>`,
		`   昵称:${escapeHtml(fullName)}`,
		`   用户名:${username}`
	];
	if (profile?.status) {
		lines.push(`   群内身份:${escapeHtml(statusMap[profile.status] || profile.status)}`);
	}
	if (profile?.groupId) {
		lines.push(`   来源群:<code>${escapeHtml(profile.groupId)}</code>`);
	}
	if (!user) {
		lines.push('   资料状态:未在配置群中获取到用户资料');
	}
	return lines;
}

function renderPermissionSection(title, ids, profiles) {
	const cleanIds = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
	const lines = [title];
	if (!cleanIds.length) {
		lines.push('无');
		return lines;
	}
	cleanIds.forEach((id, idx) => {
		if (idx > 0) lines.push('');
		lines.push(...renderPermissionUserLine(id, profiles.get(id), idx + 1));
	});
	return lines;
}

async function renderPermissionAdminsList() {
	const primaryOwner = OWNER_IDS.length ? [OWNER_IDS[0]] : [];
	const secondaryOwners = OWNER_IDS.length > 1 ? OWNER_IDS.slice(1) : [];
	const superAdmins = SUPER_ADMINS || [];
	const allIds = [...primaryOwner, ...secondaryOwners, ...superAdmins];
	const profiles = await resolvePermissionUserProfiles(allIds);
	const lines = [
		'🔐 <b>权限名单</b>',
		'',
		...renderPermissionSection('👑 <b>主人</b>', primaryOwner, profiles),
		'',
		...renderPermissionSection('👤 <b>副主人</b>', secondaryOwners, profiles),
		'',
		...renderPermissionSection('🛡️ <b>超级管理员</b>', superAdmins, profiles),
		'',
		'说明:用户名/昵称来自 Telegram 当前可读取的群成员资料;未获取时仍以 TGID 为准。'
	];
	return lines.join('\n');
}

async function fetchConfiguredGroupInfo(groupId) {
	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: groupId }),
		});
		const result = await response.json();
		if (!response.ok || !result.ok || !result.result) {
			return { ok: false, error: result?.description || `HTTP ${response.status}` };
		}
		return { ok: true, chat: result.result };
	} catch (error) {
		return { ok: false, error: error?.message || '查询失败' };
	}
}

function renderConfiguredGroupLine(groupId, result, index) {
	const idText = `<code>${escapeHtml(groupId)}</code>`;
	if (!result?.ok) {
		const { 中文, 建议 } = translateTelegramError(result?.error || '查询失败');
		return [
			`${index}. ChatID:${idText}`,
			`   状态:获取失败 - ${escapeHtml(中文)}`,
			`   建议:${escapeHtml(建议)}`
		];
	}
	const chat = result.chat || {};
	const title = chat.title || chat.first_name || chat.username || '未设置';
	const username = chat.username ? `@${escapeHtml(chat.username)}` : '未设置';
	return [
		`${index}. 群名:${escapeHtml(title)}`,
		`   ChatID:${idText}`,
		`   类型:${escapeHtml(chat.type || '未知')}`,
		`   用户名:${username}`
	];
}

async function renderConfiguredGroupsList() {
	const groupIds = [...new Set((GROUP_IDS || []).map((id) => String(id || '').trim()).filter(Boolean))];
	const lines = [
		'📋 <b>配置群组列表</b>',
		`配置群数:${groupIds.length}`,
		''
	];
	if (!groupIds.length) {
		lines.push('未配置 GROUP_ID。');
		return lines.join('\n');
	}
	const results = await Promise.all(groupIds.map((groupId) => fetchConfiguredGroupInfo(groupId)));
	groupIds.forEach((groupId, idx) => {
		if (idx > 0) lines.push('');
		lines.push(...renderConfiguredGroupLine(groupId, results[idx], idx + 1));
	});
	return lines.join('\n');
}

async function buildBanlistCheckResponse(tgidToCheck, options = {}) {
	const banlistResult = await handleBanlist(tgidToCheck);
	const banlistData = JSON.parse(banlistResult);

	// 同时查询本地 D1 黑名单
	let localBlacklistInfo = '';
	if (options.env) {
		const localCheck = await checkBlacklist(tgidToCheck, options.env);
		if (localCheck.isBlacklisted) {
			const entry = localCheck.entry;
			const reason = translateBlacklistReason(entry?.reason);
			const operator = await translateBlacklistOperator(entry?.by);
			const addedAt = entry?.at || '未知';
			localBlacklistInfo = `\n🚫 <b>本地黑名单:在黑名单中</b>\n` +
				`├ 加黑方式:${reason}\n` +
				`├ 操作人:${operator}\n` +
				`└ 时间:${escapeHtml(addedAt)}\n`;
		} else {
			localBlacklistInfo = `\n✅ <b>本地黑名单:不在黑名单中</b>\n`;
		}
	}

	if (!banlistData.success) {
		return {
			text: `❌ <b>查询失败</b>\n\n${escapeHtml(banlistData.error || '未知错误')}${localBlacklistInfo}`
		};
	}

	if (!banlistData.banned) {
		let responseMessage = `✅ <b>查询结果</b>\n\nTGID <code>${escapeHtml(tgidToCheck)}</code> 没有 GKY 封禁记录。`;
		if (options.targetUser) {
			responseMessage = `✅ <b>查询结果</b>\n\n用户 ${formatUserMention(options.targetUser) || `<code>${escapeHtml(tgidToCheck)}</code>`} 没有 GKY 封禁记录。\nTGID: <code>${escapeHtml(tgidToCheck)}</code>`;
		}
		responseMessage += localBlacklistInfo;
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
	responseMessage += localBlacklistInfo;

	if (!options.includeReviewAction) {
		return { text: responseMessage };
	}

	const 黑白名单 = isConfiguredGroup(banlistData.chatId) ? '移出黑名单' : '添加白名单';
	const copyText = `GKYbotSave\n${banlistData.tgid}`;
	// 代发目标群：黑名单记录在配置群内 → 该群；否则 → 主群（保留"添加白名单"需在主群发的语义）
	const dispatchChatId = isConfiguredGroup(banlistData.chatId) ? banlistData.chatId : GROUP_ID;
	// 原群封禁前置提示:封禁记录的 ChatID 不在配置群内 → GKY 解封是"按原群定位"的,
	// 发到全解群很可能无效。提前告知,避免点了按钮才发现"显示已代发、实际没生效"。
	if (banlistData.chatId && !isConfiguredGroup(String(banlistData.chatId))) {
		responseMessage += `\n\n⚠️ <b>注意</b>:此封禁属于原群 <code>${escapeHtml(String(banlistData.chatId))}</code>,不在你的配置群内。GKYbotSave 发到本群<b>很可能无效</b>,建议用 GKY 官方网页(banlist 页面的「解鎖 Unban」按钮)解封。`;
	}
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

// 处理 chat_member 事件：管理员手动封/解封时同步 D1 黑名单
// 加黑：从其它状态 → kicked
// 移黑：从 kicked → 任意其它状态
async function handleChatMemberUpdate(chatMember, env) {
	if (!chatMember || (!env.DB)) return;

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
			await notifyOwnerBlacklistIntercept(targetUser, chat, '复入群拦截', blacklistCheck, banResult);
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
		// 群内手动封禁（真人点 Telegram 封禁按钮 / 任何作为管理员的机器人执行封禁）一律【不再】同步进 D1 黑名单。
		// D1 全局黑名单的唯一来源 = 真人管理员的 /ban、/spam 指令（含 /ban 123、/spam 123、引用消息 /spam）。
		// 这里仅发审计通知告知主人群里发生了手动封禁；notifyOwnerChatMemberAction 内部已自动过滤机器人操作，机器人封禁不会打扰主人。
		console.log('[chat_member] 群内手动封禁，按规则不同步加黑:', JSON.stringify(logCommon));
		await notifyOwnerChatMemberAction(chatMember, '封禁（未加入全局黑名单）', oldStatus, newStatus);
	} else if (oldStatus === 'kicked') {
		// 群内手动解封：D1 黑名单是权威封禁，禁止经此被绕过/清除。
		// 仅 /unban 指令(群管理员/超管/主人/副主人鉴权)可移出 D1 黑名单。
		const blacklistCheck = await checkBlacklist(targetIdStr, env);
		if (blacklistCheck.isBlacklisted) {
			// 仍在 D1 黑名单 → 撤销本次群内手动解封，立即封回，绝不删除黑名单记录
			const banResult = await banUserFromGroup(chat.id, targetIdStr);
			console.log('[chat_member] 拦截群内手动解封(D1黑名单保护):', JSON.stringify({ ...logCommon, 封回结果: banResult.ok ? '成功' : `失败:${banResult.error}` }));
			await notifyOwnerBlacklistIntercept(targetUser, chat, '群内手动解封拦截', blacklistCheck, banResult);
		} else {
			// 不在 D1 黑名单：无黑名单变化，仅发审计通知告知主人群内发生了解封动作
			await notifyOwnerChatMemberAction(chatMember, '解封用户（非黑名单）', oldStatus, newStatus);
		}
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

// 主人审计通知:群内管理员手动 ban/unban 时,事件只发给主人
// 已豁免:OWNER_IDS 为空 / 操作人是主人本人(不通知自己) / 操作人是机器人(其它 bot 的操作不通知)
async function notifyOwnerChatMemberAction(chatMember, action, oldStatus, newStatus) {
	if (!OWNER_IDS.length) return;
	const fromIdStr = String(chatMember.from?.id || '');
	if (isOwner(fromIdStr)) return;

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

	await notifyAllOwners(auditText, null);
}

// ===== 广告自动检测 =====

// 从 D1 读自定义广告词库(分类对象),空/出错返回 null
async function loadAdKeywordsFromD1(env) {
	if (!env.DB) return null;
	try {
		await ensureD1Table(env);
		const row = await env.DB.prepare('SELECT data FROM ad_keywords WHERE id = 1').first();
		if (row && row.data) {
			const parsed = JSON.parse(row.data);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
		}
	} catch (error) {
		console.error('[广告词库] 读 D1 失败:', error);
	}
	return null;
}

// 把 D1 自定义词库 merge 到运行期模块级变量(在 detectAd 之前调用)
// fetch 入口每请求已把 AD_KEYWORDS_* 重置为基线(DEFAULT 空 / 环境变量),这里 push 叠加安全
async function mergeAdKeywordsFromD1(env) {
	// 先把域名白名单、身份广告词重置为内置默认(无论 D1 是否有数据都生效)
	URL_WHITELIST = [...DEFAULT_URL_WHITELIST];
	IDENTITY_SPAM_WORDS = [...DEFAULT_IDENTITY_SPAM_WORDS];
	const data = await loadAdKeywordsFromD1(env);
	if (!data) return;
	const norm = (a) => (Array.isArray(a) ? a : []).map((s) => String(s).toLowerCase()).filter(Boolean);
	AD_KEYWORDS_FINANCE = [...new Set([...AD_KEYWORDS_FINANCE, ...norm(data.finance)])];
	AD_KEYWORDS_PORN = [...new Set([...AD_KEYWORDS_PORN, ...norm(data.porn)])];
	AD_KEYWORDS_SPAM = [...new Set([...AD_KEYWORDS_SPAM, ...norm(data.spam)])];
	AD_KEYWORDS_FRAUD = [...new Set([...AD_KEYWORDS_FRAUD, ...norm(data.fraud)])];
	AD_KEYWORDS = [...new Set([...AD_KEYWORDS, ...norm(data.general)])];
	// identity 分类:只用于发言人名字/简介检测(不碰正文)
	IDENTITY_SPAM_WORDS = [...new Set([...IDENTITY_SPAM_WORDS, ...norm(data.identity)])];
	// whitelist 分类:像域名的项(含 . 且无空格)进 URL_WHITELIST(正常链接放行);
	//   其余当作"命中不计分"的关键词白名单(原语义保留)。
	//   所以主人 /addword whitelist github.com 既能加域名,也能加普通白名单词,自动分流。
	const wlAll = norm(data.whitelist);
	const wlDomains = wlAll.filter((w) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(w));
	const wlWords = wlAll.filter((w) => !wlDomains.includes(w));
	URL_WHITELIST = [...new Set([...URL_WHITELIST, ...wlDomains])];
	AD_WHITELIST = [...new Set([...AD_WHITELIST, ...wlWords])];
}

// 把词库对象写回 D1
async function saveAdKeywordsToD1(env, data) {
	if (!env.DB) return { ok: false, error: '未绑定 D1 存储空间' };
	try {
		await ensureD1Table(env);
		await env.DB.prepare('INSERT OR REPLACE INTO ad_keywords (id, data, updated_at) VALUES (1, ?, ?)')
			.bind(JSON.stringify(data), new Date().toISOString())
			.run();
		return { ok: true };
	} catch (error) {
		console.error('[广告词库] 写 D1 失败:', error);
		return { ok: false, error: error.message };
	}
}

// 读取 D1 词库,空则返回标准空结构(6 个分类)
async function getAdKeywordsRaw(env) {
	const data = await loadAdKeywordsFromD1(env);
	return {
		finance: Array.isArray(data?.finance) ? data.finance : [],
		porn: Array.isArray(data?.porn) ? data.porn : [],
		spam: Array.isArray(data?.spam) ? data.spam : [],
		fraud: Array.isArray(data?.fraud) ? data.fraud : [],
		general: Array.isArray(data?.general) ? data.general : [],
		identity: Array.isArray(data?.identity) ? data.identity : [],
		whitelist: Array.isArray(data?.whitelist) ? data.whitelist : [],
	};
}

// ===== 广告学习样本(/spam 上报 → 指纹入库 → 精准查杀)=====

// 归一化:把文本"洗"成标准指纹,抓"加空格/标点/全半角"变体
function normalizeForFingerprint(text) {
	try {
		return String(text || '')
			.normalize('NFKC')             // 全角半角归一
			.toLowerCase()
			.replace(/\s+/g, '')           // 去所有空白
			.replace(/[\p{P}\p{S}]/gu, ''); // 去标点和符号(含 emoji)
	} catch (_) {
		// 老环境不支持 \p{} → 退化:只去空白
		return String(text || '').toLowerCase().replace(/\s+/g, '');
	}
}

// 从广告文本提取特征词组(加入词库 general 分类,抓变体)
function extractAdKeywords(text) {
	const norm = String(text || '').toLowerCase();
	const segments = [];
	for (const m of norm.matchAll(/[一-龥]{4,12}/g)) segments.push(m[0]); // 中文 ≥4 字
	for (const m of norm.matchAll(/[a-z0-9]{5,20}/g)) segments.push(m[0]);        // 英数 ≥5
	return [...new Set(segments)]
		.filter((s) => !AD_STOPWORDS.includes(s))
		.slice(0, 5);
}

// 从 D1 读样本(返回 { fingerprints: [], count, updatedAt })
async function loadAdSamplesFromD1(env) {
	if (!env.DB) return null;
	try {
		await ensureD1Table(env);
		const row = await env.DB.prepare('SELECT data FROM ad_samples WHERE id = 1').first();
		if (row && row.data) {
			const parsed = JSON.parse(row.data);
			if (parsed && Array.isArray(parsed.fingerprints)) return parsed;
		}
	} catch (error) {
		console.error('[广告样本] 读 D1 失败:', error);
	}
	return null;
}

// 写样本回 D1
async function saveAdSamplesToD1(env, data) {
	if (!env.DB) return { ok: false, error: '未绑定 D1 存储空间' };
	try {
		await ensureD1Table(env);
		await env.DB.prepare('INSERT OR REPLACE INTO ad_samples (id, data, updated_at) VALUES (1, ?, ?)')
			.bind(JSON.stringify(data), new Date().toISOString())
			.run();
		return { ok: true };
	} catch (error) {
		console.error('[广告样本] 写 D1 失败:', error);
		return { ok: false, error: error.message };
	}
}

// 把样本指纹 merge 到运行期变量(handleMessage 入口调用)
async function mergeAdSamplesFromD1(env) {
	const data = await loadAdSamplesFromD1(env);
	if (data && Array.isArray(data.fingerprints)) {
		AD_SAMPLE_FINGERPRINTS = data.fingerprints.filter(Boolean);
	}
}

// 学习一条广告样本:只写整句指纹入库(不再自动污染词库)
// 根因修复:旧版会把自动提取的词写进 general(+2 分),导致正常消息分数虚高被误杀。
//   现在只写指纹;提取的候选词仅作为"建议"返回,由主人自行决定是否 /addword,绝不自动入库。
// 返回 { ok, fingerprint, fpAdded, suggestedKeywords, sampleCount }
async function learnAdSample(env, learnText) {
	const fp = normalizeForFingerprint(learnText);
	const suggestedKeywords = extractAdKeywords(learnText); // 仅建议,不写库

	// 写指纹(去重)
	let added = false;
	if (fp && fp.length >= SAMPLE_FP_EXACT_MIN) {
		const data = (await loadAdSamplesFromD1(env)) || { fingerprints: [], count: 0 };
		if (!data.fingerprints.includes(fp)) {
			data.fingerprints.push(fp);
			data.count = data.fingerprints.length;
			data.updatedAt = new Date().toISOString();
			await saveAdSamplesToD1(env, data);
			added = true;
		}
		return { ok: true, fingerprint: fp, fpAdded: added, suggestedKeywords, sampleCount: data.count };
	}

	// 指纹太短未入库,仍返回当前样本数
	const cur = await loadAdSamplesFromD1(env);
	return { ok: true, fingerprint: fp, fpAdded: false, suggestedKeywords, sampleCount: cur?.count || 0 };
}

// ===== /recent 冻结快照(供 /learnlast 按固定序号引用,根治序号漂移)=====
// /recent 把当时的疑似广告列表(已按上下文过滤+排序)冻结写入 D1;
// /learnlast 只从这份快照读,所以期间实时缓存被新消息挤动也不影响主人看到的序号。

// 写入快照:items 是已排序好的数组(序号 1 = items[0]),scope/at 仅作展示与排错
async function saveLearnSnapshot(env, items, meta = {}) {
	if (!env.DB) return { ok: false, error: '未绑定 D1 存储空间' };
	try {
		await ensureD1Table(env);
		const data = JSON.stringify({
			items: items || [],
			scope: meta.scope || '',
			byChatId: meta.byChatId || '',
			at: new Date().toISOString(),
		});
		await env.DB.prepare('INSERT OR REPLACE INTO learn_snapshot (id, data, updated_at) VALUES (1, ?, ?)')
			.bind(data, new Date().toISOString())
			.run();
		return { ok: true };
	} catch (error) {
		console.error('[学习快照] 写 D1 失败:', error);
		return { ok: false, error: error.message };
	}
}

// 读取快照,返回 { items: [], scope, byChatId, at } 或 null
async function loadLearnSnapshot(env) {
	if (!env.DB) return null;
	try {
		await ensureD1Table(env);
		const row = await env.DB.prepare('SELECT data FROM learn_snapshot WHERE id = 1').first();
		if (row && row.data) {
			const parsed = JSON.parse(row.data);
			if (parsed && Array.isArray(parsed.items)) return parsed;
		}
	} catch (error) {
		console.error('[学习快照] 读 D1 失败:', error);
	}
	return null;
}

// ===== 最近消息缓存(供 /learnlast 学习被删的广告)=====

// 预筛:是否"疑似广告"消息(只缓存这些,省 D1 写入)
function looksLikeAdCandidate(message) {
	// 名片(分享联系人)直接算疑似广告候选 —— 名片广告无 text,但内容藏在 contact 里
	if (message.contact) return true;
	const text = (message.text || message.caption || '').trim();
	if (!text) return false;
	const urls = collectUrls(message);
	if (urls.length > 0) return true;                 // 含链接
	if (/@[a-zA-Z][\w]{3,}/.test(text)) return true;  // @用户名提及(引流)
	if (/\d{5,}/.test(text)) return true;             // 长数字串(电话/金额)
	return false;
}

// 读最近消息缓存
async function loadRecentMessages(env) {
	if (!env.DB) return [];
	try {
		await ensureD1Table(env);
		const { results } = await env.DB.prepare('SELECT mid, chat_id, chat_title, text, from_id, from_name, created_at FROM recent_messages ORDER BY id ASC').all();
		return (results || []).map(r => ({
			mid: r.mid,
			chatId: r.chat_id,
			chatTitle: r.chat_title || '',
			text: r.text || '',
			fromId: r.from_id || '',
			fromName: r.from_name || '',
			at: r.created_at || '',
		}));
	} catch (error) {
		console.error('[消息缓存] 读 D1 失败:', error);
	}
	return [];
}

// 按上下文过滤缓存:群内发 → 只看当前群;私聊发 → 全部群
// 返回"最新在前"的数组(序号 1 = 最新)
function filterMessagesByContext(items, message) {
	const isInGroup = message.chat.type !== 'private';
	let list = items;
	if (isInGroup) {
		const cid = String(message.chat.id);
		list = items.filter((it) => String(it.chatId) === cid);
	}
	return [...list].reverse(); // 最新在前
}

// 缓存一条消息(环形,保留最近 MSG_CACHE_SIZE 条)
async function cacheRecentMessage(env, message) {
	if (!env.DB) return;
	try {
		await ensureD1Table(env);
		const cacheText = (message.text || message.caption || getContactText(message) || '').slice(0, 500);
		await env.DB.prepare('INSERT INTO recent_messages (mid, chat_id, chat_title, text, from_id, from_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(
				message.message_id,
				String(message.chat.id),
				message.chat.title || '',
				cacheText,
				String(message.from?.id || ''),
				[message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') || message.from?.username || '',
				new Date().toISOString()
			)
			.run();
		await env.DB.prepare('DELETE FROM recent_messages WHERE id NOT IN (SELECT id FROM recent_messages ORDER BY id DESC LIMIT ?)').bind(MSG_CACHE_SIZE).run();
	} catch (error) {
		console.error('[消息缓存] 写 D1 失败:', error);
	}
}

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
	// 兜底:正则从原文再抓一遍裸 URL(有些纯文本链接 Telegram 不一定给 entity)
	const reUrl = /https?:\/\/[^\s<>"')]+/gi;
	for (const m of base.matchAll(reUrl)) {
		if (!urls.includes(m[0])) urls.push(m[0]);
	}
	return urls;
}

// 从一批 URL 中提取主机名(小写,去 www. 前缀)。解析失败的 URL 跳过。
function extractHostnames(urls) {
	const hosts = [];
	for (const u of urls) {
		let host = '';
		try {
			host = new URL(u).hostname.toLowerCase();
		} catch (_) {
			// URL() 解析失败(如缺协议),用正则兜底抓 host
			const m = String(u).match(/^(?:https?:\/\/)?([^/\s:?#]+)/i);
			host = m ? m[1].toLowerCase() : '';
		}
		if (host.startsWith('www.')) host = host.slice(4);
		if (host) hosts.push(host);
	}
	return hosts;
}

// 主机名是否命中某个白名单域名(等于 或 是其子域名)。
// 例:host=gist.github.com,wl=github.com → true(子域名);host=evilgithub.com → false(防伪造)
function hostMatchesDomain(host, domain) {
	if (!host || !domain) return false;
	return host === domain || host.endsWith('.' + domain);
}

// 这批 URL 是否【全部】命中正常域名白名单(只要有一个不在白名单,就不算"纯白名单链接")
function allUrlsWhitelisted(urls) {
	if (urls.length === 0) return false;
	const hosts = extractHostnames(urls);
	if (hosts.length === 0) return false;
	return hosts.every((h) => URL_WHITELIST.some((d) => hostMatchesDomain(h, d)));
}

// 这批 URL 是否含可疑短链域名
function hasSuspiciousUrl(urls) {
	const hosts = extractHostnames(urls);
	return hosts.some((h) => SUSPICIOUS_URL_DOMAINS.some((d) => hostMatchesDomain(h, d)));
}

// 提取联系人名片(contact)里的全部可读文本,供广告检测。
// 名片广告把内容藏在名片显示名/电话/vcard 里(如名字"假钞交流群"+电话"+1 870..."),
// 普通 text/caption 是空的,不提取就漏检。
function getContactText(message) {
	const c = message.contact;
	if (!c) return '';
	const parts = [c.first_name, c.last_name, c.phone_number, c.vcard].filter(Boolean);
	return parts.join(' ');
}

const QUOTE_TEXT_KEYS = new Set(['text', 'caption', 'title', 'description']);
const QUOTE_TEXT_SKIP_KEYS = new Set([
	'from', 'sender_chat', 'chat', 'via_bot',
	'forward_from', 'forward_from_chat', 'forward_origin', 'origin',
	'entities', 'caption_entities'
]);

function collectQuoteTextParts(value, parts, depth = 0, key = '') {
	if (!value || depth > 6) return;
	if (typeof value === 'string') {
		if (QUOTE_TEXT_KEYS.has(key)) parts.push(value);
		return;
	}
	if (typeof value !== 'object') return;
	if (QUOTE_TEXT_SKIP_KEYS.has(key)) return;
	if (Array.isArray(value)) {
		for (const item of value) collectQuoteTextParts(item, parts, depth + 1, key);
		return;
	}
	for (const [childKey, childValue] of Object.entries(value)) {
		collectQuoteTextParts(childValue, parts, depth + 1, childKey);
	}
}

function getQuoteText(message) {
	const parts = [];
	collectQuoteTextParts(message.quote, parts, 0, 'quote');
	collectQuoteTextParts(message.reply_to_message, parts, 0, 'reply_to_message');
	collectQuoteTextParts(message.external_reply, parts, 0, 'external_reply');
	return [...new Set(parts.map((s) => String(s).trim()).filter(Boolean))].join(' ');
}

function hasQuoteLikeStructure(message) {
	return Boolean(message?.quote || message?.reply_to_message || message?.external_reply);
}

function summarizeQuoteStructure(value) {
	if (!value || typeof value !== 'object') return null;
	const textFields = [];
	const scan = (node, prefix = '', depth = 0, key = '') => {
		if (!node || typeof node !== 'object' || depth > 3 || QUOTE_TEXT_SKIP_KEYS.has(key)) return;
		for (const [childKey, childValue] of Object.entries(node)) {
			const path = prefix ? `${prefix}.${childKey}` : childKey;
			if (typeof childValue === 'string' && QUOTE_TEXT_KEYS.has(childKey)) {
				textFields.push(path);
			} else if (childValue && typeof childValue === 'object') {
				scan(childValue, path, depth + 1, childKey);
			}
		}
	};
	scan(value);
	return {
		keys: Object.keys(value).slice(0, 16),
		text_fields: [...new Set(textFields)].slice(0, 16)
	};
}

function summarizeQuoteStructures(message) {
	return {
		quote: summarizeQuoteStructure(message?.quote),
		reply_to_message: summarizeQuoteStructure(message?.reply_to_message),
		external_reply: summarizeQuoteStructure(message?.external_reply)
	};
}

function isShortQuoteWrapperText(text) {
	const raw = String(text || '').trim();
	if (!raw) return true;
	const normalized = normalizeForFingerprint(raw);
	if (!normalized) return true;
	if (normalized.length <= 5) return true;
	return /^[a-z0-9]{1,8}$/i.test(raw);
}

function logQuoteAdDiagnostic(message, quoteText, detail = {}) {
	try {
		console.log('[引用广告诊断]', JSON.stringify({
			chat_id: message?.chat?.id,
			message_id: message?.message_id,
			user_id: message?.from?.id,
			wrapper: truncateTelegramText(message?.text || message?.caption || '', 30),
			quote: truncateTelegramText(quoteText || '', 120),
			...detail
		}));
	} catch (error) {
		console.error('[引用广告诊断] 输出失败:', error);
	}
}

function scoreAdWords(text) {
	let score = 0;
	const hits = [];
	for (const w of AD_KEYWORDS_FINANCE) if (w && text.includes(w)) { score += 2; hits.push(`金融:${w}`); }
	for (const w of AD_KEYWORDS_PORN) if (w && text.includes(w)) { score += 2; hits.push(`色情:${w}`); }
	for (const w of AD_KEYWORDS_SPAM) if (w && text.includes(w)) { score += 1; hits.push(`引流:${w}`); }
	for (const w of AD_KEYWORDS_FRAUD) if (w && text.includes(w)) { score += 2; hits.push(`诈骗:${w}`); }
	for (const w of AD_KEYWORDS) if (w && text.includes(w)) { score += 2; hits.push(`自定义:${w}`); }
	return { score, hits };
}

function scoreHighRiskAdWords(text) {
	const hits = [];
	for (const w of AD_KEYWORDS_FINANCE) if (w && text.includes(w)) hits.push(`金融:${w}`);
	for (const w of AD_KEYWORDS_PORN) if (w && text.includes(w)) hits.push(`色情:${w}`);
	for (const w of AD_KEYWORDS_FRAUD) if (w && text.includes(w)) hits.push(`诈骗:${w}`);
	for (const w of AD_KEYWORDS) if (w && text.includes(w)) hits.push(`自定义:${w}`);
	return hits;
}

// 检测"发言人身份"(名字/用户名/简介)里的广告特征。
// 【重要】只匹配明确的广告词(色情/卖号/卡网/赌博话术),不碰链接/@提及/域名 ——
//   因为正常用户简介里放双向机器人 @xxxBot、github 链接、个人频道 t.me/xxx、主页域名
//   都极其普遍,把"含链接"当广告会大面积误杀正常人(技术讨论/隐私设置)。
//   所以身份检测唯一依据 = IDENTITY_SPAM_WORDS 广告词命中。
// 返回命中的特征数组(空数组=没命中)。
function detectIdentitySpam(identityText) {
	const t = String(identityText || '');
	if (!t.trim()) return [];
	const hits = [];
	const lower = t.toLowerCase();
	// 仅匹配明确广告词(卡网/卖号/色情/赌博等)。链接、@提及、域名一律不算广告。
	for (const w of IDENTITY_SPAM_WORDS) {
		if (w && lower.includes(w)) hits.push(`身份广告词:${w}`);
	}
	return hits;
}


// 广告检测(多维度评分 + 强特征直杀)
// 返回 { isAd, score, hits: string[], strong: string|null }
async function detectAd(message, env) {
	if (!AD_FILTER_ENABLED) return { isAd: false, score: 0, hits: [], strong: null };

	const contactText = getContactText(message); // 名片广告内容(名字/电话/vcard)
	const quoteText = getQuoteText(message);
	const textParts = [
		message.text,
		message.caption,
		message.from?.first_name,
		message.from?.last_name,
		message.from?.username,
		contactText,
	].filter(Boolean);
	const fullText = textParts.join(' ').toLowerCase();
	// 仅正文(text+caption+名片内容),用于学习样本指纹比对 —— 与 /spam /learn /learnlast 学习入口口径一致,
	// 不混入发送者用户名,保证"同一条广告不同人发"也能精确命中。名片广告也能被 /spam 学习指纹。
	const bodyText = [message.text, message.caption, contactText].filter(Boolean).join(' ').toLowerCase();
	const hits = [];

	// 白名单:把白名单词从计分文本里挖掉(命中也不计分)
	let scoringText = fullText;
	for (const w of AD_WHITELIST) {
		if (w) scoringText = scoringText.split(w).join('');
	}

	const urls = collectUrls(message);
	// 链接分级:纯白名单链接(github/google等)放行;含可疑短链单独加分
	const urlsAllWhite = allUrlsWhitelisted(urls);
	const urlsSuspicious = hasSuspiciousUrl(urls);

	// 强特征 0:发言人身份(名字/用户名)含引流特征 → 直接判广告。
	//   只查身份字段,不碰正文,所以正常人聊 chatgpt/发 t.me 链接都不受影响。
	//   抓"名字本身是广告"的号(如 сЛuВы Со ВпucoК、名字里塞 t.me/网址/卡网)。
	const identityName = [message.from?.first_name, message.from?.last_name, message.from?.username]
		.filter(Boolean).join(' ');
	const nameHits = detectIdentitySpam(identityName);
	if (nameHits.length > 0) {
		return { isAd: true, score: 99, hits: ['发言人名字引流:' + nameHits.join('/')], strong: '发言人名字含广告' };
	}


	// 强特征 1:学习样本指纹精确匹配(/spam /learn /learnlast 上报过的广告)
	//   归一化后完全相等才命中,不做子串包含(避免误杀正常长消息)
	const normMsg = normalizeForFingerprint(bodyText);
	if (!urlsAllWhite && normMsg.length >= SAMPLE_FP_EXACT_MIN && AD_SAMPLE_FINGERPRINTS.length > 0) {
		for (const fp of AD_SAMPLE_FINGERPRINTS) {
			if (!fp || fp.length < SAMPLE_FP_EXACT_MIN) continue;
			if (normMsg === fp) {
				return { isAd: true, score: 99, hits: ['学习样本精确匹配'], strong: '学习样本(精确)' };
			}
		}
	}

	// 强特征 2:短正文包装引用广告。广告号会把正文写成 t/s/l/1,把广告放在引用框里规避正文检测。
	// 命中后删除当前这条"短正文+引用广告"消息,封当前发送者,不处理被引用消息发送者。
	const shortQuoteWrapper = isShortQuoteWrapperText(message.text || message.caption || '');
	if (quoteText && shortQuoteWrapper) {
		let quoteForScan = quoteText.toLowerCase();
		for (const w of AD_WHITELIST) {
			if (w) quoteForScan = quoteForScan.split(w).join('');
		}
		const quoteNorm = normalizeForFingerprint(quoteText);
		if (quoteNorm.length >= SAMPLE_FP_EXACT_MIN && AD_SAMPLE_FINGERPRINTS.length > 0) {
			for (const fp of AD_SAMPLE_FINGERPRINTS) {
				if (!fp || fp.length < SAMPLE_FP_EXACT_MIN) continue;
				if (quoteNorm === fp) {
					logQuoteAdDiagnostic(message, quoteText, {
						decision: 'kill_sample_exact',
						score: 99,
						hits: ['引用内容学习样本精确匹配']
					});
					return {
						isAd: true,
						score: 99,
						hits: ['引用内容学习样本精确匹配'],
						strong: '引用内容广告',
						source: '引用内容',
						quotePreview: quoteText.slice(0, 100)
					};
				}
			}
		}
		const quotedHighRiskHits = scoreHighRiskAdWords(quoteForScan);
		if (quotedHighRiskHits.length > 0) {
			const hits = quotedHighRiskHits.map((h) => `引用内容高危:${h}`);
			logQuoteAdDiagnostic(message, quoteText, {
				decision: 'kill_high_risk_word',
				score: 99,
				hits
			});
			return {
				isAd: true,
				score: 99,
				hits,
				strong: '引用内容高危词',
				source: '引用内容',
				quotePreview: quoteText.slice(0, 100)
			};
		}
		const quotedWordScore = scoreAdWords(quoteForScan);
		if (quotedWordScore.score >= AD_SCORE_THRESHOLD || quotedWordScore.hits.length >= 2) {
			const hits = quotedWordScore.hits.map((h) => `引用内容${h}`);
			logQuoteAdDiagnostic(message, quoteText, {
				decision: 'kill_score_or_multi_word',
				score: Math.max(quotedWordScore.score, AD_SCORE_THRESHOLD),
				hits
			});
			return {
				isAd: true,
				score: Math.max(quotedWordScore.score, AD_SCORE_THRESHOLD),
				hits,
				strong: '引用内容命中广告词',
				source: '引用内容',
				quotePreview: quoteText.slice(0, 100)
			};
		}
		logQuoteAdDiagnostic(message, quoteText, {
			decision: 'no_match',
			score: quotedWordScore.score,
			hits: quotedWordScore.hits,
			highRiskHits: quotedHighRiskHits
		});
	} else if (shortQuoteWrapper && hasQuoteLikeStructure(message)) {
		logQuoteAdDiagnostic(message, quoteText, {
			decision: 'quote_structure_no_text',
			structures: summarizeQuoteStructures(message)
		});
	}

	// 强特征 4:名片显示名命中词库 → 直接判广告秒杀(实现"名字带广告就杀")
	//   原理:正常用户的名片显示名(张三/小明/John)几乎不可能含"假钞/承兑/约炮"这类词,
	//   所以名片名字一旦命中任意分类词,直接判定,不必凑分。误杀面极低。
	//   注意:只针对【名片显示名】,不针对普通聊天文本(那个仍走加权评分,避免正常聊天误杀)。
	if (message.contact) {
		const contactName = [message.contact.first_name, message.contact.last_name]
			.filter(Boolean).join(' ').toLowerCase();
		if (contactName) {
			// 白名单词先挖掉,避免特定话题群误伤
			let nameForScan = contactName;
			for (const w of AD_WHITELIST) if (w) nameForScan = nameForScan.split(w).join('');
			const allAdWords = [
				...AD_KEYWORDS_FINANCE, ...AD_KEYWORDS_PORN, ...AD_KEYWORDS_SPAM,
				...AD_KEYWORDS_FRAUD, ...AD_KEYWORDS,
			];
			for (const w of allAdWords) {
				if (w && nameForScan.includes(w)) {
					return { isAd: true, score: 99, hits: [`名片名字命中:${w}`], strong: '名片名字含广告词' };
				}
			}
		}
	}

	// 加权评分
	const wordScore = scoreAdWords(scoringText);
	let score = wordScore.score;
	hits.push(...wordScore.hits);

	// 可疑短链(bit.ly 等)单独加分:常被广告用来藏落地页
	if (urlsSuspicious) { score += 2; hits.push('可疑短链'); }

	// 名片(分享联系人)+1 分:名片是常见引流载体,但正常用户也会分享,只 +1 需配合词库,
	//   避免误杀正常分享。带敏感词的名片(如"假钞交流群")靠词库+名片分叠加达阈值被杀。
	if (message.contact) { score += 1; hits.push('联系人名片'); }

	// 纯链接刷屏:有外链 + 文本很短。纯白名单链接(github等)不算,避免误杀正常分享。
	if (!urlsAllWhite && urls.length > 0 && fullText.length < 20) { score += 1; hits.push('短文本+链接'); }

	return { isAd: score >= AD_SCORE_THRESHOLD, score, hits, strong: null };
}

// 广告拦截后通知主人
async function notifyOwnerAdDetection(message, adResult, banResults) {
	if (!OWNER_IDS.length) return;
	const fromUser = message.from;
	const operator = formatUserMention(fromUser) || `<code>${escapeHtml(String(fromUser?.id || '未知'))}</code>`;
	const preview = escapeHtml((message.text || message.caption || (message.contact ? '[名片] ' + getContactText(message) : '') || '(无文本)').slice(0, 100));
	const quotePreview = adResult.source === '引用内容' && adResult.quotePreview
		? escapeHtml(adResult.quotePreview)
		: '';
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
		...(quotePreview ? [`💬 引用内容:${quotePreview}`] : []),
		'',
		await renderBanResultsDetail(banResults),
	];
	await notifyAllOwners(lines.join('\n'), null);
}
function translateBlacklistReason(reason) {
	const map = {
		manual_ban: '群管理员手动封禁（Telegram原生操作，自动同步）',
		manual: '管理员 /ban 指令加黑',
		spam: '管理员 /spam 引用回复加黑',
		ad_auto: '广告自动检测加黑',
		ad_learn: '上报学习加黑',
	};
	return map[reason] || reason || '未知';
}

// 将加黑操作人 ID 翻译为角色标签
async function translateBlacklistOperator(byId) {
	if (!byId) return '未知';
	if (byId === 'system') return '🤖 系统自动';

	let roleTag = '👤 群管理员';
	if (isPrimaryOwner(byId)) roleTag = '👑 主人';
	else if (isSecondaryOwner(byId)) roleTag = '👤 副主人';
	else if (SUPER_ADMINS.includes(byId)) roleTag = '🛡️ 超级管理员';

	// 尝试查询操作人名字和类型
	try {
		const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChat`;
		const resp = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: byId })
		});
		const data = await resp.json();
		if (data.ok && data.result) {
			const r = data.result;
			const name = r.first_name || r.title || '';
			const uname = r.username ? ` (@${r.username})` : '';
			const botTag = r.type === 'private' && r.is_bot ? ' [Bot]' : '';
			if (r.is_bot) roleTag = '🤖 Bot';
			return `${roleTag} ${escapeHtml(name)}${escapeHtml(uname)}${botTag} <code>${escapeHtml(byId)}</code>`;
		}
	} catch (_) {}

	return `${roleTag} <code>${escapeHtml(byId)}</code>`;
}

// 黑名单自动拦截通知主人（复入群拦截 / 发言拦截时调用）
async function notifyOwnerBlacklistIntercept(targetUser, chat, action, blacklistInfo, banResult) {
	if (!OWNER_IDS.length) return;
	const target = targetUser
		? formatUserMention(targetUser)
		: '<code>未知</code>';
	const targetId = String(targetUser?.id || '未知');

	let groupLabel = `<code>${escapeHtml(String(chat.id))}</code>`;
	try {
		const info = await getChatInfoFromId(chat.id);
		if (info?.title) groupLabel = `<b>${escapeHtml(info.title)}</b> <code>${escapeHtml(String(chat.id))}</code>`;
	} catch (_) {}

	const entry = blacklistInfo?.entry;
	const reason = translateBlacklistReason(entry?.reason);
	const operator = await translateBlacklistOperator(entry?.by);
	const addedAt = entry?.at ? escapeHtml(entry.at) : '未知';

	const lines = [
		`🚫 <b>黑名单自动拦截</b>`,
		`🎬 动作:${escapeHtml(action)}`,
		`👤 用户:${target} <code>${escapeHtml(targetId)}</code>`,
		`📍 群:${groupLabel}`,
		`📋 加黑方式:${reason}`,
		`🔧 加黑操作人:${operator}`,
		`🕐 加黑时间:${addedAt}`,
	];
	if (banResult && !banResult.ok) {
		lines.push(`⚠️ 踢人结果:失败 - ${escapeHtml(banResult.error || '未知')}`);
	}

	await notifyAllOwners(lines.join('\n'), null);
}

// 黑名单用户尝试自助解封时通知主人（申诉提醒）
async function notifyOwnerBlacklistAppeal(fromUser, blacklistInfo) {
	if (!OWNER_IDS.length) return;
	const target = fromUser
		? formatUserMention(fromUser)
		: '<code>未知</code>';
	const targetId = String(fromUser?.id || '未知');

	const entry = blacklistInfo?.entry;
	const reason = translateBlacklistReason(entry?.reason);
	const operator = await translateBlacklistOperator(entry?.by);
	const addedAt = entry?.at ? escapeHtml(entry.at) : '未知';

	const lines = [
		`📢 <b>黑名单用户申诉</b>`,
		`👤 用户:${target} <code>${escapeHtml(targetId)}</code>`,
		`📋 加黑方式:${reason}`,
		`🔧 加黑操作人:${operator}`,
		`🕐 加黑时间:${addedAt}`,
		'',
		`该用户正尝试自助解封但被黑名单阻止。`,
		`如确认误封，请执行: <code>/unban ${escapeHtml(targetId)}</code>`,
	];

	await notifyAllOwners(lines.join('\n'), null);
}

// 用户完成自助解封时通知主人（所有自助解封都通知）
async function notifyOwnerSelfUnban(fromUser, perGroupResults) {
	if (!OWNER_IDS.length) return;
	const target = fromUser
		? formatUserMention(fromUser)
		: '<code>未知</code>';
	const targetId = String(fromUser?.id || '未知');

	const resultSummary = perGroupResults
		.map(r => r.replace(/<[^>]+>/g, ''))
		.join('\n');

	const lines = [
		`📬 <b>用户自助解封</b>`,
		`👤 用户:${target} <code>${escapeHtml(targetId)}</code>`,
		'',
		`📋 各群解封结果:`,
		escapeHtml(resultSummary),
		'',
		`如确认是广告，请执行: <code>/ban ${escapeHtml(targetId)}</code>`,
	];

	await notifyAllOwners(lines.join('\n'), null);
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

// 回查一键代发 GKYbotSave 后的解封结果:查 TGID 最新封禁状态,生成确认文案。
// 返回 { cleared: bool, text: string }
//   cleared=true  → GKY 已无该用户封禁记录(解封/加白成功)
//   cleared=false → 仍有记录(GKY 可能还在处理)或查询失败,提示稍后 /check 复查
async function verifyUnbanResult(tgid, targetLabel) {
	const who = targetLabel || `<code>${escapeHtml(String(tgid))}</code>`;
	const recheckHint = `请稍后用 <code>/check ${escapeHtml(String(tgid))}</code> 复查(私聊我直接发即可)。`;
	try {
		const raw = await handleBanlist(String(tgid));
		const data = JSON.parse(raw);
		if (!data.success) {
			return {
				cleared: false,
				text: `⚠️ <b>解封结果待确认</b>\n👤 用户:${who}\n查询暂时失败(${escapeHtml(data.error || '未知')})。\n${recheckHint}`,
			};
		}
		if (!data.banned) {
			return {
				cleared: true,
				text: `✅ <b>解封成功</b>\n👤 用户:${who}\nTGID:<code>${escapeHtml(String(tgid))}</code>\n已确认 GKY 无封禁记录(已移出黑名单/加白)。`,
			};
		}
		// 仍有记录:GKY 可能还没处理完,给兜底复查提示
		let line = `⚠️ <b>仍显示有封禁记录</b>\n👤 用户:${who}\nTGID:<code>${escapeHtml(String(tgid))}</code>\n`;
		if (data.reason) line += `封禁原因:${escapeHtml(String(data.reason))}\n`;
		line += `\nGKY 可能仍在处理,${recheckHint}`;
		return { cleared: false, text: line };
	} catch (error) {
		console.error('[解封回查] 失败:', error);
		return {
			cleared: false,
			text: `⚠️ <b>解封结果待确认</b>\n👤 用户:${who}\n回查异常,${recheckHint}`,
		};
	}
}

// 处理 callback_query：当前仅支持 gky:a:{tgid}:{chatId} 一键代发 GKYbotSave
async function handleCallbackQuery(cb, env, ctx) {
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

			// 组装"代发有效性"警告:① 目标群是否真有 GKYbot ② 封禁是否属于非配置的原群
			const warnLines = [];
			// ① GKYbot 在场检测(目标群管理员里有没有 username 含 GKY 的 bot)
			const gkyCheck = await groupHasGKYBot(dispatchChatId);
			if (gkyCheck.checked && !gkyCheck.found) {
				warnLines.push('⚠️ <b>目标群未发现 GKYbot</b>:这条 GKYbotSave 指令可能<b>无人处理</b>(显示已代发≠已生效)。请确认 GKYbot 在该群且为管理员。');
			}
			// ② 原群封禁检测:封禁记录的 ChatID 不在你的配置群内 → GKY 解封是"按原群定位"的,
			//    发到全解群很可能无效(GKY 那条记录属于原群,本群 GKYbot 没有它)。
			try {
				const raw0 = await handleBanlist(String(tgid));
				const d0 = JSON.parse(raw0);
				if (d0.success && d0.banned && d0.chatId && !isConfiguredGroup(String(d0.chatId))) {
					warnLines.push(`⚠️ <b>此封禁属于原群</b> <code>${escapeHtml(String(d0.chatId))}</code>(不在你的配置群内)。GKYbotSave 发到本群<b>很可能无效</b>,建议用 GKY 官方网页解封(banlist 页面的「解鎖 Unban」按钮),或确认你的 bot 与 GKYbot 都在该原群。`);
				}
			} catch (_) {}

			// 回查解封结果并发到操作人私聊(+ 主人):先发"正在确认",再补发回查结果。
			// 用户原来看不到"到底加白成功没有",这里给一个明确确认。
			const targetLabel = await formatTargetByTgid(tgid);
			const pendingText = `⏳ <b>已代发 GKYbotSave</b>\n👤 用户:${targetLabel}\nTGID:<code>${escapeHtml(String(tgid))}</code>\n正在确认解封结果…`;
			// 发给操作人本人(点按钮的超管/主人)
			await sendTelegramMessage(fromUser.id, pendingText);
			// 立即回查(GKY 若还没处理完会提示稍后 /check 复查)
			const verify = await verifyUnbanResult(tgid, targetLabel);
			const warnBlock = warnLines.length ? '\n\n' + warnLines.join('\n') : '';
			await sendTelegramMessage(fromUser.id, verify.text + warnBlock);
			// 全局主人收一份(操作人不是主人时),便于全局审计
			if (OWNER_IDS.length && !isOwner(fromUser.id)) {
				const opMention = formatUserMention(fromUser) || `<code>${escapeHtml(String(fromUser.id))}</code>`;
				await notifyAllOwners(`🔔 <b>一键解封回查</b>\n操作人:${opMention}\n\n${verify.text}${warnBlock}`, null);
			}

			// 主人审计通知:操作人不是主人时,把"一键解封"事件发给主人
			if (OWNER_IDS.length && !isOwner(fromUser.id)) {
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
				await notifyAllOwners(auditText, null);
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

async function handleMessage(message, env, ctx, requestUrl = '') {
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

	// 诊断日志:配置群里收到名片(contact)时,打印完整结构(尤其 vcard),供排查名片广告漏检。
	// 只在名片消息触发,极轻量;贴 Worker 日志即可看清 Telegram 实际传了什么字段。
	if (isConfiguredGroup(chatId) && message.contact) {
		try {
			console.log('[名片诊断] contact 结构:', JSON.stringify({
				from: message.from?.id,
				first_name: message.contact.first_name,
				last_name: message.contact.last_name,
				phone_number: message.contact.phone_number,
				user_id: message.contact.user_id,
				vcard: message.contact.vcard || '(无 vcard)',
				entities: message.entities || null,
			}));
		} catch (_) {}
	}

	// 缓存"疑似广告"群消息(供 /learnlast 学习被 GKY 删掉的广告);ctx.waitUntil 异步不阻塞
	if (
		MSG_CACHE_ENABLED && env.DB && isConfiguredGroup(chatId) &&
		message.from && !message.from.is_bot &&
		!(text && text.startsWith('/')) &&
		looksLikeAdCandidate(message)
	) {
		if (ctx && typeof ctx.waitUntil === 'function') {
			ctx.waitUntil(cacheRecentMessage(env, message));
		} else {
			await cacheRecentMessage(env, message);
		}
	}

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
				await notifyOwnerBlacklistIntercept(message.from, message.chat, '发言拦截', blacklistCheck, null);
				return;
			}
		}
	}

	// 广告自动检测：普通成员发的疑似广告 → 删消息 + 加黑 + 全群踢 + 通知主人
	// 在黑名单拦截之后、命令分发之前；管理员豁免
	if (AD_FILTER_ENABLED && isConfiguredGroup(chatId) && message.from && !message.from.is_bot) {
		// 先把 D1 自定义词库与学习样本 merge 进来(detectAd 之前)
		await mergeAdKeywordsFromD1(env);
		await mergeAdSamplesFromD1(env);
		const adResult = await detectAd(message, env);
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

	// 处理 /spam 命令 - 举报加黑（支持回复消息 + 直接输入TGID + 批量，群内/私聊双场景）
	if (isSpamCommand(text)) {
		const isInGroup = message.chat.type !== 'private';

		// 仅真人可通过 /spam 写入 D1 黑名单：作为管理员的第三方机器人一律忽略（GroupAnonymousBot 匿名管理员=真人，放行）
		if (isBotOperator(message.from)) return;

		const isAdmin = await checkIfUserIsAdmin(userId);
		if (!isAdmin) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限群组管理员使用。');
			}
			return;
		}
		await deleteAuthorizedGroupCommandMessage(message, '/spam');

		// 提取 /spam 后面的参数。回复模式优先把参数当执行原因；无回复时才按 TGID 模式解析。
		const argMatch = text.trim().match(/^\/spam(?:@[^\s]+)?\s*([\s\S]*)/i);
		const rawArg = argMatch ? argMatch[1].trim() : '';
		const repliedMsg = message.reply_to_message;

		if (rawArg && !repliedMsg) {
			// ===== TGID 模式：直接通过 ID 封禁 =====
			const { valid, invalid, note } = parseTargetIdsAndNote(rawArg);

			if (valid.length === 0 && invalid.length === 0) {
				const usageText = `❌ 使用方法：<code>/spam 用户ID</code> 或 <code>/spam 123,456,789</code>（最多 ${BATCH_LIMIT} 个）`;
				if (isInGroup) {
					await sendFlashMessage(chatId, usageText, ctx);
				} else {
					await sendTelegramMessage(chatId, usageText);
				}
				return;
			}
			if (await startBulkModerationJobFromCommand(message, env, ctx, {
				action: 'spam',
				valid,
				invalid,
				note,
				isInGroup,
				requestUrl
			})) {
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

			// 单条
			if (valid.length === 1 && invalid.length === 0) {
				const result = await addToBlacklist(valid[0], env, { reason: 'spam', by: userId });
				const alreadyExists = result.message && result.message.includes('已在黑名单');
				const targetMention = await formatTargetByTgid(valid[0]);
				const lines = [
					`🎬 操作:举报加黑(/spam)`,
					`🎯 目标用户:${targetMention}`,
				];
				let flashText;
				if (result.success || alreadyExists) {
					const banResults = await banUserFromAllGroups(valid[0]);
					lines.push('');
					if (alreadyExists) {
						lines.push('⚠️ <b>该用户已在黑名单中,本次已继续执行全群踢出</b>');
					}
					lines.push(await renderBanResultsDetail(banResults));
					flashText = `${result.success ? '✅ 已加黑' : '⚠️ 已存在并清扫'} <code>${valid[0]}</code>\n` + renderBanResults(banResults);
				} else {
					lines.push('');
					lines.push(result.message);
					flashText = `⚠️ <code>${valid[0]}</code> ${result.message.replace(/<[^>]+>/g, '')}`;
				}
				await replyToAdmin(message, ctx, {
					flashText,
					detailText: withActionContext(message, lines.join('\n'), note),
					isInGroup,
					notifySecondaryOwners: true
				});
				return;
			}

			// 批量
			const results = await addManyToBlacklist(valid, env, { reason: 'spam', by: userId });
			const idsToKick = [...results.success, ...results.exists];
			const banSummary = { success: idsToKick.length, banOkAll: 0, banPartial: 0, banFailedAll: 0 };
			const perUserBanResults = [];
			for (const id of idsToKick) {
				const banResults = await banUserFromAllGroups(id);
				const okCount = banResults.filter((r) => r.ok).length;
				if (okCount === banResults.length) banSummary.banOkAll += 1;
				else if (okCount === 0) banSummary.banFailedAll += 1;
				else banSummary.banPartial += 1;
				perUserBanResults.push({ userId: id, banResults });
			}
			const failedCount = invalid.length + results.failed.length;
			const flashText = `✅ 批量加黑(/spam)：成功 ${results.success.length}${results.exists.length ? ` / 已存在 ${results.exists.length}` : ''}${failedCount ? ` / 失败 ${failedCount}` : ''}`;
			const baseDetail = renderBatchAddResult(results, invalid, banSummary);
			let fullDetail = baseDetail;
			if (perUserBanResults.length > 0) {
				const perUserDetailLines = ['', '<b>逐用户踢人明细</b>:'];
				const chatInfoCache = new Map();
				for (const { userId: uid, banResults } of perUserBanResults) {
					perUserDetailLines.push('', `<b>用户 <code>${uid}</code></b>`);
					perUserDetailLines.push(await renderBanResultsDetail(banResults, chatInfoCache));
				}
				fullDetail += '\n' + perUserDetailLines.join('\n');
			}
			await replyToAdmin(message, ctx, {
				flashText,
				detailText: withActionContext(message, fullDetail, note),
				isInGroup,
				notifySecondaryOwners: true
			});
			return;
		}

		// ===== 回复模式：回复垃圾消息加黑（原有逻辑）=====
		const repliedUserId = repliedMsg?.from?.id || repliedMsg?.sender_chat?.id;
		if (!repliedUserId) {
			const usageText = '❌ 使用方法：\n• 回复垃圾消息后发 <code>/spam</code>\n• 或直接 <code>/spam 用户ID</code>（支持批量：<code>/spam 123,456,789</code>）';
			if (isInGroup) {
				await sendFlashMessage(chatId, usageText, ctx);
			} else {
				await sendTelegramMessage(chatId, usageText);
			}
			return;
		}

		const replySpamNote = rawArg;
		const result = await addToBlacklist(repliedUserId, env, { reason: 'spam', by: userId });
		const alreadyExists = result.message && result.message.includes('已在黑名单');
		const linkedUserId = `<a href="tg://user?id=${repliedUserId}">${repliedUserId}</a>`;

		if (result.success || alreadyExists) {
			// 加黑成功或已存在 → 全群踢人 + 删除被回复的垃圾消息
			const banResults = await banUserFromAllGroups(repliedUserId);
			const repliedMsgId = repliedMsg.message_id;
			const delResult = await deleteMessage(chatId, repliedMsgId);

			const lines = [
				`🎬 操作:举报加黑(/spam)`,
				`🎯 目标用户:${linkedUserId} <code>${escapeHtml(String(repliedUserId))}</code>`,
				'',
				result.success
					? `✅ 已将用户 ${linkedUserId} 添加到黑名单`
					: `⚠️ 用户 ${linkedUserId} 已在黑名单中,本次已继续执行清理`,
				await renderBanResultsDetail(banResults),
			];
			if (delResult.ok) {
				lines.push('🗑️ 已删除被回复的垃圾消息');
			} else {
				const { 中文, 建议 } = translateTelegramError(delResult.error);
				lines.push(`⚠️ 删除消息失败:${escapeHtml(中文)}\n   建议:${escapeHtml(建议)}`);
			}

			// 仅主人 /spam → 学习样本(只写整句指纹入库,不污染词库)
			const isOwnerSpam = isOwner(userId);
			if (isOwnerSpam && env.DB) {
				const r = repliedMsg;
				// 指纹只取正文(text+caption),不混入用户名,保证跨发送者精确命中
				const learnText = [r.text, r.caption].filter(Boolean).join(' ');
				if (learnText.trim()) {
					const learn = await learnAdSample(env, learnText);
					const learnLines = ['', '📖 <b>已学习此广告样本</b>'];
					learnLines.push(learn.fpAdded ? '✅ 指纹已入库(以后相同广告自动秒杀)' : 'ℹ️ 指纹已存在,未重复入库');
					if (learn.suggestedKeywords.length > 0) {
						learnLines.push(`💡 建议词(不会自动入库,需手动加):${learn.suggestedKeywords.map((w) => `<code>${escapeHtml(w)}</code>`).join('、')}`);
						learnLines.push(`   要加进词库请发:<code>/addword general ${escapeHtml(learn.suggestedKeywords.join(' '))}</code>`);
					}
					learnLines.push(`📊 当前样本库共 ${learn.sampleCount} 条`);
					lines.push(...learnLines);
				}
			}

			await replyToAdmin(message, ctx, {
				flashText: `${result.success ? '✅ 已加黑' : '⚠️ 已存在并清扫'} ${linkedUserId}`,
				detailText: withActionContext(message, lines.join('\n'), replySpamNote),
				isInGroup,
				notifySecondaryOwners: true
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
				failLines.push('⚠️ <b>该用户已在黑名单中,请勿重复添加</b>');
			} else {
				failLines.push(result.message);
			}
			await replyToAdmin(message, ctx, {
				flashText: `⚠️ ${linkedUserId}: ${escapeHtml(plainMsg)}`,
				detailText: withActionContext(message, failLines.join('\n'), replySpamNote),
				isInGroup,
				notifySecondaryOwners: true
			});
		}
		return;
	}

	// 处理 /job /jobrun：查询或续跑大批量 /ban /spam 任务
	if (isJobCommand(text)) {
		const isInGroup = message.chat.type !== 'private';
		const isAdmin = await checkIfUserIsAdmin(userId);
		if (!isAdmin) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限群组管理员使用。');
			}
			return;
		}
		const isRun = /^\/jobrun(?:@[^\s]+)?(?:\s|$)/i.test(text.trim());
		await deleteAuthorizedGroupCommandMessage(message, isRun ? '/jobrun' : '/job');
		const jobId = text.trim().replace(/^\/job(?:run)?(?:@[^\s]+)?\s*/i, '').trim().split(/\s+/)[0] || '';
		if (!jobId) {
			const usageText = '❌ 使用方法：<code>/job 任务ID</code> 或 <code>/jobrun 任务ID</code>';
			if (isInGroup) {
				await sendFlashMessage(chatId, usageText, ctx);
			} else {
				await sendTelegramMessage(chatId, usageText);
			}
			return;
		}
		if (!env.DB) {
			const errorText = '❌ 批量任务需要绑定 D1 存储空间';
			if (isInGroup) {
				await sendFlashMessage(chatId, errorText, ctx);
			} else {
				await sendTelegramMessage(chatId, errorText);
			}
			return;
		}
		const job = await loadBulkJob(env, jobId);
		if (!job) {
			const errorText = `❌ 未找到任务:<code>${escapeHtml(jobId)}</code>`;
			if (isInGroup) {
				await sendFlashMessage(chatId, errorText, ctx);
			} else {
				await sendTelegramMessage(chatId, errorText);
			}
			return;
		}
		if (isRun && job.status !== 'done') {
			const runner = runBulkModerationJob(env, job.id, {
				notifyOnDone: true,
				autoContinue: true,
				ctx,
				requestUrl,
				source: 'manual'
			}).catch((error) => {
				console.error(`[批量任务] 续跑失败 ${job.id}:`, error);
			});
			if (ctx && typeof ctx.waitUntil === 'function') {
				ctx.waitUntil(runner);
			} else {
				await runner;
			}
		}
		const latestJob = await loadBulkJob(env, job.id) || job;
		const detailText = formatBulkJobDetail(latestJob, isRun ? '▶️ <b>批量任务已继续执行</b>' : '📦 <b>批量任务状态</b>');
		if (isInGroup) {
			await replyToAdmin(message, ctx, {
				flashText: `📦 任务状态已发送私聊 <code>${escapeHtml(job.id)}</code>`,
				detailText,
				isInGroup,
				notifySecondaryOwners: false
			});
		} else {
			await sendTelegramMessage(chatId, detailText);
		}
		return;
	}

	// 处理 /check 命令查询封禁状态。两种用法:
	//   ① 群内回复某条消息发 /check —— 查被回复用户(原有)
	//   ② /check <TGID> —— 私聊或群内带参数直接查指定 TGID(新增,配合一键代发回查复查)
	if (isCheckCommand(text)) {
		// 解析参数:/check 后面跟的纯数字 TGID
		const checkArg = text.trim().replace(/^\/check(?:@[^\s]+)?\s*/i, '').trim();
		const hasTgidArg = /^\d+$/.test(checkArg);

		// 鉴权:必须是任一配置群管理员(私聊也能用,checkIfUserIsAdmin 与当前 chatId 无关)
		const isAdmin = await checkIfUserIsAdmin(userId);

		if (hasTgidArg) {
			// 带 TGID 参数:私聊 / 群内均可
			if (!isAdmin) {
				if (message.chat.type === 'private') {
					await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限群组管理员使用。');
				}
				return;
			}
			await sendTelegramMessage(chatId, `正在查询 TGID: <code>${escapeHtml(checkArg)}</code> 的封禁状态...`);
			const response = await buildBanlistCheckResponse(checkArg, {
				includeReviewAction: true,
				actionInCurrentChat: isConfiguredGroup(chatId),
				env,
			});
			await sendTelegramMessage(chatId, response.text, response.replyMarkup);
			return;
		}

		// 无参数:沿用原"群内回复消息"用法
		if (!isConfiguredGroup(chatId)) {
			// 私聊无参数 → 提示正确用法
			if (message.chat.type === 'private') {
				await sendTelegramMessage(chatId, 'ℹ️ 私聊查询请用:<code>/check TGID</code>\n例:<code>/check 993005028</code>\n群内可回复某条消息发 <code>/check</code> 查该用户。');
			}
			return;
		}
		if (!isAdmin) {
			return;
		}
		const repliedUser = message.reply_to_message?.from;
		if (!repliedUser?.id) {
			await sendTelegramMessage(chatId, '❌ 请回复要查询封禁状态的用户消息后再发送 <code>/check</code>，或用 <code>/check TGID</code> 直接查。');
			return;
		}

		const tgidToCheck = repliedUser.id.toString();
		await sendTelegramMessage(chatId, `正在查询 TGID: <code>${tgidToCheck}</code> 的封禁状态...`);
		const response = await buildBanlistCheckResponse(tgidToCheck, {
			targetUser: repliedUser,
			includeReviewAction: true,
			actionInCurrentChat: true,
			env,
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
			const response = await buildBanlistCheckResponse(tgidToCheck, { includeReviewAction: true, env });
			await sendTelegramMessage(chatId, response.text, response.replyMarkup);

			return;
		}

		// 普通的 /start 命令，显示欢迎消息
	}

	// 处理 /blacklist 命令 - 私聊管理员查看 D1 黑名单
	if (text && /^\/blacklist(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		if (message.chat.type !== 'private') {
			const isAdmin = await checkIfUserIsAdmin(userId);
			if (isAdmin) {
				await deleteAuthorizedGroupCommandMessage(message, '/blacklist');
			}
			return; // 非私聊不予回复
		}

		const isAdmin = await checkIfUserIsAdmin(userId);
		if (!isAdmin) {
			await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限群组管理员使用。');
			return;
		}

		if (!env.DB) {
			await sendTelegramMessage(chatId, '❌ 未绑定 D1 存储空间，无法查看黑名单。');
			return;
		}

		const blacklist = await getBlacklist(env);
		await sendTelegramMessage(chatId, renderBlacklist(blacklist));
		return;
	}

	// ===== /help OWNER_IDS 专属帮助(展开全部隐藏指令)=====
	// 仅 OWNER_IDS 中的主人/副主人可用。非 OWNER_IDS:群内静默、私聊提示权限不足,绝不泄漏隐藏指令的存在。
	if (text && /^\/help(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		const isInGroup = message.chat.type !== 'private';
		const isOwnerUser = isOwner(userId);
		if (!isOwnerUser) {
			// 群内完全静默(连"权限不足"都不发,避免暴露命令存在);私聊也不暴露隐藏指令
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n该命令仅限 OWNER_IDS 中的主人/副主人使用。');
			}
			return;
		}
		await deleteAuthorizedGroupCommandMessage(message, '/help');
		// 隐藏指令仅在私聊展开(群内不回,避免其他成员看到指令清单)
		if (isInGroup) {
			await sendFlashMessage(chatId, 'ℹ️ 请私聊我发送 /help 查看 OWNER_IDS 专属指令。', ctx, 6000);
			return;
		}
		const helpLines = [
			'🔐 <b>OWNER_IDS 专属隐藏指令</b>(仅 OWNER_IDS 配置的主人/副主人可用,其他人无任何反应)',
			'',
			'<b>━━ 广告词库热更新(私聊)━━</b>',
			'<code>/importdefault</code> 一键导入推荐词库(金融/色情/引流/诈骗/身份引流)',
			'<code>/addword [分类] 词1 词2</code> 加词。分类:finance/porn/spam/fraud/general/identity/whitelist,默认 general',
			'<code>/addword whitelist example.com</code> 加正常域名白名单(该域名链接永不被杀)',
			'<code>/addword identity 卡网 车队</code> 加身份引流词(只查发言人名字/简介,不碰正文)',
			'<code>/delword 词1 词2</code> 从所有分类删词',
			'<code>/listwords</code> 查看当前 D1 词库全部内容',
			'',
			'<b>━━ 广告样本学习(两步私聊复核)━━</b>',
			'<code>/spam</code>(群内回复广告)OWNER_IDS 版额外学习指纹(只入库,不污染词库)',
			'<code>/learn 广告文本</code> 直接粘贴文字学习指纹(只入库,不踢人)',
			'<code>/recent [N]</code> 拉取疑似广告并冻结快照,带序号推到私聊(群/私聊均可,最多50条)',
			'<code>/learnlast 序号</code> <b>仅私聊</b>,按快照序号学指纹(只入库,不踢人)。如 /learnlast 1,3',
			'',
			'<b>━━ 样本库管理(私聊)━━</b>',
			'<code>/listsamples</code> 查看已学指纹(最近50条+总数)',
			'<code>/delsample 序号|关键词</code> 删样本',
			'<code>/clearsamples confirm</code> 清空全部样本',
			'',
			'<b>━━ 权限名单查询(仅主人私聊)━━</b>',
			'<code>/admins</code> 查看当前主人/副主人/超级管理员名单,显示 TGID、昵称、用户名、群内身份',
			'<code>/groups</code> 查看当前 GROUP_ID 配置群组,显示群名、ChatID、类型、用户名',
			'',
			'<b>━━ 说明 ━━</b>',
			'• 以上指令对普通用户/群管理员/超级管理员<b>完全无反应</b>；<code>/admins</code>/<code>/groups</code> 只允许主人私聊使用',
			'• 学习一律<b>只入库不踢人</b>;要踢发广告的人,用回执里给的 TGID 发 <code>/ban TGID</code>',
			'• 学习只写整句指纹,<b>不再自动往词库加词</b>(避免误杀正常消息);建议词需你手动 /addword',
			'• <b>链接识别</b>:github/google 等正常域名链接永不被杀;含链接的样本只精确匹配不扩散;可疑短链(bit.ly等)才加分',
		];
		await sendTelegramMessage(chatId, helpLines.join('\n'));
		return;
	}

	// ===== /admins 主人专属权限名单查询 =====
	// 仅 OWNER_IDS[0] 主人私聊可用;群内完全静默,避免暴露权限配置和用户资料。
	if (text && /^\/admins(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		const isInGroup = message.chat.type !== 'private';
		if (!isPrimaryOwner(userId)) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n该命令仅限主人使用。');
			}
			return;
		}
		await deleteAuthorizedGroupCommandMessage(message, '/admins');
		if (isInGroup) {
			return;
		}
		const listText = await renderPermissionAdminsList();
		await sendTelegramMessage(chatId, listText);
		return;
	}

	// ===== /groups 主人专属配置群组查询 =====
	// 仅 OWNER_IDS[0] 主人私聊可用;群内完全静默,避免暴露群组配置。
	if (text && /^\/groups(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		const isInGroup = message.chat.type !== 'private';
		if (!isPrimaryOwner(userId)) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n该命令仅限主人使用。');
			}
			return;
		}
		await deleteAuthorizedGroupCommandMessage(message, '/groups');
		if (isInGroup) {
			return;
		}
		const listText = await renderConfiguredGroupsList();
		await sendTelegramMessage(chatId, listText);
		return;
	}

	// ===== 广告词库热更新命令(仅主人可用)=====
	// /addword /delword /listwords /importdefault
	if (text && /^\/(addword|delword|listwords|importdefault)(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		const isInGroup = message.chat.type !== 'private';
		const isOwnerUser = isOwner(userId);
		if (!isOwnerUser) {
			// 仅主人可用;非主人在私聊提示,群内静默(避免泄漏命令存在)
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n广告词库管理仅限主人使用。');
			}
			return;
		}
		await deleteAuthorizedGroupCommandMessage(message, '/adwords');
		if (!env.DB) {
			await sendTelegramMessage(chatId, '❌ 未绑定 D1 存储空间,无法管理广告词库。');
			return;
		}

		const head = text.trim().split(/\s+/)[0].replace(/@.*$/, '').toLowerCase();
		const rest = text.trim().slice(text.trim().indexOf(head) + head.length).trim();

		// /listwords —— 查看当前词库
		if (head === '/listwords') {
			const kw = await getAdKeywordsRaw(env);
			const cats = [
				['金融 finance', kw.finance],
				['色情 porn', kw.porn],
				['引流 spam', kw.spam],
				['诈骗 fraud', kw.fraud],
				['自定义 general', kw.general],
				['身份引流 identity(只查名字/简介)', kw.identity],
				['白名单 whitelist', kw.whitelist],
			];
			const lines = ['📚 <b>广告词库(D1 存储)</b>', ''];
			let total = 0;
			for (const [label, arr] of cats) {
				total += arr.length;
				lines.push(`<b>${label}</b>（${arr.length}）`);
				lines.push(arr.length ? arr.map((w) => `<code>${escapeHtml(w)}</code>`).join('、') : '（空）');
				lines.push('');
			}
			lines.push(`共 ${total} 个词。空词库时仅强特征(t.me邀请链接/国际电话号)生效。`);
			lines.push('用 <code>/importdefault</code> 一键导入推荐词库。');
			await replyToAdmin(message, ctx, {
				flashText: `📚 词库共 ${total} 个词`,
				detailText: lines.join('\n'),
				isInGroup,
			});
			return;
		}

		// /importdefault —— 导入推荐词库(与现有 D1 词库合并去重)
		if (head === '/importdefault') {
			const kw = await getAdKeywordsRaw(env);
			let added = 0;
			for (const cat of ['finance', 'porn', 'spam', 'fraud', 'identity']) {
				const before = new Set(kw[cat].map((w) => String(w).toLowerCase()));
				for (const w of (RECOMMENDED_AD_KEYWORDS[cat] || [])) {
					const lw = String(w).toLowerCase();
					if (!before.has(lw)) { kw[cat].push(w); before.add(lw); added++; }
				}
			}
			const saved = await saveAdKeywordsToD1(env, kw);
			await replyToAdmin(message, ctx, {
				flashText: saved.ok ? `✅ 已导入推荐词库(新增 ${added} 个)` : `❌ 导入失败:${saved.error}`,
				detailText: saved.ok
					? `🎬 操作:导入推荐广告词库\n📈 新增 ${added} 个词(已去重)\n用 /listwords 查看完整词库。`
					: `❌ 导入失败:${escapeHtml(saved.error || '未知')}`,
				isInGroup,
			});
			return;
		}

		// /addword [分类] <词...> —— 加词(分类可选,默认 general)
		if (head === '/addword') {
			if (!rest) {
				await sendTelegramMessage(chatId, '用法:<code>/addword [分类] 词1 词2 ...</code>\n分类可选:finance/porn/spam/fraud/general/identity/whitelist(默认 general)\n例:<code>/addword fraud 杀猪盘 刷信誉</code>\nidentity=只查发言人名字/简介的引流词(如 卡网 发卡 车队)');
				return;
			}
			const validCats = ['finance', 'porn', 'spam', 'fraud', 'general', 'identity', 'whitelist'];
			const tokens = rest.split(/[\s,，]+/).filter(Boolean);
			let cat = 'general';
			if (validCats.includes(tokens[0].toLowerCase())) {
				cat = tokens.shift().toLowerCase();
			}
			const words = [...new Set(tokens.map((w) => w.toLowerCase()))];
			if (words.length === 0) {
				await sendTelegramMessage(chatId, '❌ 没有提供有效的词。');
				return;
			}
			const kw = await getAdKeywordsRaw(env);
			const existing = new Set(kw[cat].map((w) => String(w).toLowerCase()));
			const newAdded = [];
			for (const w of words) {
				if (!existing.has(w)) { kw[cat].push(w); existing.add(w); newAdded.push(w); }
			}
			const saved = await saveAdKeywordsToD1(env, kw);
			await replyToAdmin(message, ctx, {
				flashText: saved.ok ? `✅ 已加 ${newAdded.length} 个词到 ${cat}` : `❌ 失败:${saved.error}`,
				detailText: saved.ok
					? `🎬 操作:添加广告词\n📂 分类:${cat}\n➕ 新增:${newAdded.map((w) => `<code>${escapeHtml(w)}</code>`).join('、') || '(全部已存在)'}`
					: `❌ 写入失败:${escapeHtml(saved.error || '未知')}`,
				isInGroup,
			});
			return;
		}

		// /delword <词...> —— 从所有分类删除
		if (head === '/delword') {
			if (!rest) {
				await sendTelegramMessage(chatId, '用法:<code>/delword 词1 词2 ...</code>(从所有分类中删除)');
				return;
			}
			const words = [...new Set(rest.split(/[\s,，]+/).filter(Boolean).map((w) => w.toLowerCase()))];
			const kw = await getAdKeywordsRaw(env);
			const removed = [];
			for (const cat of Object.keys(kw)) {
				kw[cat] = kw[cat].filter((w) => {
					if (words.includes(String(w).toLowerCase())) { removed.push(w); return false; }
					return true;
				});
			}
			const saved = await saveAdKeywordsToD1(env, kw);
			await replyToAdmin(message, ctx, {
				flashText: saved.ok ? `✅ 已删除 ${removed.length} 个词` : `❌ 失败:${saved.error}`,
				detailText: saved.ok
					? `🎬 操作:删除广告词\n➖ 已删:${removed.length ? removed.map((w) => `<code>${escapeHtml(w)}</code>`).join('、') : '(词库中无匹配)'}`
					: `❌ 写入失败:${escapeHtml(saved.error || '未知')}`,
				isInGroup,
			});
			return;
		}
		return;
	}

	// ===== 广告学习样本管理命令(仅主人可用)=====
	// /listsamples /delsample /clearsamples
	if (text && /^\/(listsamples|delsample|clearsamples)(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		const isInGroup = message.chat.type !== 'private';
		const isOwnerUser = isOwner(userId);
		if (!isOwnerUser) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n广告样本管理仅限主人使用。');
			}
			return;
		}
		await deleteAuthorizedGroupCommandMessage(message, '/samples');
		if (!env.DB) {
			await sendTelegramMessage(chatId, '❌ 未绑定 D1 存储空间,无法管理学习样本。');
			return;
		}

		const head = text.trim().split(/\s+/)[0].replace(/@.*$/, '').toLowerCase();
		const rest = text.trim().slice(text.trim().indexOf(head) + head.length).trim();
		const data = (await loadAdSamplesFromD1(env)) || { fingerprints: [], count: 0 };

		// /listsamples —— 查看已学习样本
		if (head === '/listsamples') {
			const fps = data.fingerprints || [];
			const lines = [`📖 <b>广告学习样本</b>(共 ${fps.length} 条)`, ''];
			if (fps.length === 0) {
				lines.push('(空)主人回复广告消息发 <code>/spam</code> 即可学习。');
			} else {
				// 最多展示最近 50 条,避免消息超长
				const show = fps.slice(-50);
				show.forEach((fp, i) => {
					lines.push(`${fps.length - show.length + i + 1}. <code>${escapeHtml(fp.slice(0, 60))}</code>`);
				});
				if (fps.length > 50) lines.unshift(`(仅显示最近 50 条)`);
			}
			lines.push('', '删除:<code>/delsample 序号</code> 或 <code>/delsample 关键词</code>');
			await replyToAdmin(message, ctx, {
				flashText: `📖 样本库 ${fps.length} 条`,
				detailText: lines.join('\n'),
				isInGroup,
			});
			return;
		}

		// /delsample <序号|关键词> —— 删除样本
		if (head === '/delsample') {
			if (!rest) {
				await sendTelegramMessage(chatId, '用法:<code>/delsample 序号</code>(见 /listsamples)或 <code>/delsample 关键词</code>');
				return;
			}
			const fps = data.fingerprints || [];
			let removed = [];
			const idx = parseInt(rest, 10);
			if (/^\d+$/.test(rest) && idx >= 1 && idx <= fps.length) {
				removed = fps.splice(idx - 1, 1);
			} else {
				// 按关键词匹配删除(包含即删)
				const kw = normalizeForFingerprint(rest);
				data.fingerprints = fps.filter((fp) => {
					if (kw && fp.includes(kw)) { removed.push(fp); return false; }
					return true;
				});
			}
			data.count = data.fingerprints.length;
			data.updatedAt = new Date().toISOString();
			const saved = await saveAdSamplesToD1(env, data);
			await replyToAdmin(message, ctx, {
				flashText: saved.ok ? `✅ 已删除 ${removed.length} 条样本` : `❌ 失败:${saved.error}`,
				detailText: saved.ok
					? `🎬 操作:删除学习样本\n➖ 已删 ${removed.length} 条\n📊 剩余 ${data.count} 条`
					: `❌ 写入失败:${escapeHtml(saved.error || '未知')}`,
				isInGroup,
			});
			return;
		}

		// /clearsamples —— 清空所有样本(二次确认)
		if (head === '/clearsamples') {
			if (rest.trim().toLowerCase() !== 'confirm') {
				await sendTelegramMessage(chatId, `⚠️ 这将清空全部 ${data.count || 0} 条学习样本,不可恢复。\n确认请发送:<code>/clearsamples confirm</code>`);
				return;
			}
			const saved = await saveAdSamplesToD1(env, { fingerprints: [], count: 0, updatedAt: new Date().toISOString() });
			await replyToAdmin(message, ctx, {
				flashText: saved.ok ? '✅ 已清空学习样本' : `❌ 失败:${saved.error}`,
				detailText: saved.ok ? '🎬 操作:清空全部学习样本\n📊 样本库已归零' : `❌ 写入失败:${escapeHtml(saved.error || '未知')}`,
				isInGroup,
			});
			return;
		}
		return;
	}

	// ===== /learn 粘贴学习 + /recent 看缓存 + /learnlast 按序号学(仅主人)=====
	// 解决"GKY 已删消息无法回复 /spam"
	if (text && /^\/(learn|learnlast|recent)(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		const isInGroup = message.chat.type !== 'private';
		const isOwnerUser = isOwner(userId);
		if (!isOwnerUser) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n上报学习仅限主人使用。');
			}
			return;
		}
		await deleteAuthorizedGroupCommandMessage(message, '/learn');
		if (!env.DB) {
			await sendTelegramMessage(chatId, '❌ 未绑定 D1 存储空间,无法学习。');
			return;
		}

		const head = text.trim().split(/\s+/)[0].replace(/@.*$/, '').toLowerCase();
		const rest = text.trim().slice(text.trim().indexOf(head) + head.length).trim();

		// /learn <文本> —— 主人直接粘贴广告文本学习(只学指纹入库,不踢人)
		if (head === '/learn') {
			if (!rest) {
				await sendTelegramMessage(chatId, '用法:<code>/learn 广告文本</code>\n直接粘贴广告文字即可学习(不需要回复消息)。\n例:<code>/learn 世界杯红单推荐 天天收米 日赚3千</code>');
				return;
			}
			const learn = await learnAdSample(env, rest);
			const lines = ['📖 <b>已学习广告样本</b>'];
			lines.push(learn.fpAdded ? '✅ 指纹已入库(以后相同广告自动秒杀)' : 'ℹ️ 指纹已存在,未重复入库');
			if (learn.suggestedKeywords.length > 0) {
				lines.push(`💡 建议词(不会自动入库,需手动加):${learn.suggestedKeywords.map((w) => `<code>${escapeHtml(w)}</code>`).join('、')}`);
				lines.push(`   要加进词库请发:<code>/addword general ${escapeHtml(learn.suggestedKeywords.join(' '))}</code>`);
			}
			lines.push(`📊 当前样本库共 ${learn.sampleCount} 条`);
			await replyToAdmin(message, ctx, {
				flashText: '📖 已学习广告样本',
				detailText: lines.join('\n'),
				isInGroup,
			});
			return;
		}

		// /recent [N] —— 读取疑似广告缓存并【冻结成快照】,再把带序号列表推到主人私聊
		// 群内=当前群,私聊=全部群。冻结后 /learnlast 按这份快照的固定序号学,序号永不漂移。
		if (head === '/recent') {
			let n = 50;
			if (/^\d+$/.test(rest)) n = Math.max(1, Math.min(50, parseInt(rest, 10)));
			const all = await loadRecentMessages(env);
			const list = filterMessagesByContext(all, message).slice(0, n); // 最新在前,最多 50 条
			const scopeLabel = isInGroup ? '本群' : '全部群';
			if (list.length === 0) {
				await sendTelegramMessage(chatId, `ℹ️ ${scopeLabel}最近没有缓存到疑似广告消息。\n(只缓存含链接/@提及/长数字/长文本的群消息)`);
				return;
			}
			// 冻结快照:序号 1..N 对应 list[0..N-1],/learnlast 只认这份
			await saveLearnSnapshot(env, list, { scope: scopeLabel, byChatId: String(chatId) });
			const lines = [`📋 <b>疑似广告快照</b>(${scopeLabel} ${list.length} 条,已冻结)`, ''];
			list.forEach((it, i) => {
				const who = `${escapeHtml(it.fromName || '')}(<code>${escapeHtml(it.fromId || '?')}</code>)`;
				const grp = isInGroup ? '' : ` [${escapeHtml(it.chatTitle || it.chatId || '?')}]`;
				lines.push(`${i + 1}. <code>${escapeHtml(truncateTelegramText(it.text || '', 50))}</code>`);
				lines.push(`   — ${who}${grp}`);
			});
			lines.push('', '✅ <b>请私聊我</b>核对后学习(群内不能学习):');
			lines.push('学指定条:<code>/learnlast 序号</code>(如 <code>/learnlast 2</code>)');
			lines.push('学多条:<code>/learnlast 1,3</code>');
			lines.push('⚠️ 学习只入库不踢人;要踢发广告的人请复制上面 TGID 发 <code>/ban TGID</code>');
			await replyToAdmin(message, ctx, {
				flashText: `📋 ${scopeLabel}快照 ${list.length} 条已推送私聊`,
				detailText: lines.join('\n'),
				isInGroup,
			});
			return;
		}

		// /learnlast [序号|序号列表] —— 【仅私聊】按 /recent 冻结快照的序号学习(只入库,不踢人)
		if (head === '/learnlast') {
			// 强制私聊:群内禁止学习(防手忙脚乱点错序号误伤),闪屏引导到私聊
			if (isInGroup) {
				await sendFlashMessage(chatId, '⚠️ 学习请私聊我操作。群内只能用 /recent 拉取快照。', ctx, 8000);
				return;
			}
			// 从冻结快照读(不再读实时缓存,序号永不漂移)
			const snap = await loadLearnSnapshot(env);
			const list = snap?.items || [];
			if (list.length === 0) {
				await sendTelegramMessage(chatId, 'ℹ️ 没有可用的快照。\n请先在群里(或私聊)发 <code>/recent</code> 拉取疑似广告列表,再回来 <code>/learnlast 序号</code>。');
				return;
			}
			// 解析序号:无参=[1];"2"=[2];"1,3"=[1,3]
			let indices = [1];
			if (rest) {
				indices = rest.split(/[,，\s]+/).map((s) => parseInt(s, 10)).filter((x) => Number.isInteger(x) && x >= 1);
				if (indices.length === 0) indices = [1];
			}
			indices = [...new Set(indices)].filter((x) => x <= list.length);
			if (indices.length === 0) {
				await sendTelegramMessage(chatId, `❌ 序号超出范围。当前快照共 ${list.length} 条,发 <code>/recent</code> 重新查看序号。`);
				return;
			}
			const scopeLabel = snap?.scope || '';
			const lines = [`📖 <b>学习 ${indices.length} 条(序号 ${indices.join(',')}${scopeLabel ? ' · ' + escapeHtml(scopeLabel) : ''})</b>`, ''];
			const kickHints = [];
			for (const idx of indices) {
				const it = list[idx - 1];
				if (!it) continue;
				const learn = await learnAdSample(env, it.text);
				lines.push(`${idx}. <code>${escapeHtml((it.text || '').slice(0, 60))}</code>`);
				lines.push(learn.fpAdded ? '  ✅ 指纹已入库' : '  ℹ️ 指纹已存在');
				if (learn.suggestedKeywords.length > 0) {
					lines.push(`  💡 建议词:${learn.suggestedKeywords.map((w) => `<code>${escapeHtml(w)}</code>`).join('、')}`);
				}
				// 只学不踢:显示发送者 TGID 供主人决定是否手动 /ban
				if (it.fromId && /^\d+$/.test(it.fromId)) {
					lines.push(`  👤 发送者:<code>${escapeHtml(it.fromId)}</code>(${escapeHtml(it.fromName || '')})`);
					kickHints.push(it.fromId);
				}
				lines.push('');
			}
			if (kickHints.length > 0) {
				lines.push(`🚫 要踢发广告的人:<code>/ban ${[...new Set(kickHints)].join(',')}</code>`);
			}
			lines.push('学错了?用 <code>/delsample 关键词</code> 删样本。');
			await sendTelegramMessage(chatId, lines.join('\n'));
			// 主人自己操作,无需再给自己发审计副本(私聊已收到上面这条);若触发者非主人已在入口被拦
			return;
		}
		return;
	}

	// 处理 /ban 命令 - 添加用户到黑名单（支持批量、群内/私聊双场景）
	if (text && text.startsWith('/ban ')) {
		const isInGroup = message.chat.type !== 'private';

		// 仅真人可通过 /ban 写入 D1 黑名单：作为管理员的第三方机器人一律忽略（GroupAnonymousBot 匿名管理员=真人，放行）
		if (isBotOperator(message.from)) return;

		// 检查是否是群组管理员
		const isAdmin = await checkIfUserIsAdmin(userId);
		if (!isAdmin) {
			// 群内静默忽略（避免泄漏命令存在）；私聊明确告知权限不足
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限群组管理员使用。');
			}
			return;
		}
		await deleteAuthorizedGroupCommandMessage(message, '/ban');

		// 提取参数（支持单个 / 批量；开头 TGID 列表之后的文本作为执行原因）
		const rawArg = text.slice(5);
		const { valid, invalid, note } = parseTargetIdsAndNote(rawArg);

		if (valid.length === 0 && invalid.length === 0) {
			const usageText = `❌ 使用方法：<code>/ban 用户ID</code> 或 <code>/ban 123,456,789</code>（最多 ${BATCH_LIMIT} 个）`;
			if (isInGroup) {
				await sendFlashMessage(chatId, usageText, ctx);
			} else {
				await sendTelegramMessage(chatId, usageText);
			}
			return;
		}
		if (await startBulkModerationJobFromCommand(message, env, ctx, {
			action: 'ban',
			valid,
			invalid,
			note,
			isInGroup,
			requestUrl
		})) {
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
			const alreadyExists = result.message && result.message.includes('已在黑名单');
			// 统一详情格式:无论成功失败都展示完整字段
			const targetMention = await formatTargetByTgid(valid[0]);
			const lines = [
				`🎬 操作:加入黑名单`,
				`🎯 目标用户:${targetMention}`,
			];
			let flashText;
			if (result.success || alreadyExists) {
				const banResults = await banUserFromAllGroups(valid[0]);
				lines.push('');
				if (alreadyExists) {
					lines.push('⚠️ <b>该用户已在黑名单中,本次已继续执行全群踢出</b>');
				}
				lines.push(await renderBanResultsDetail(banResults));
				flashText = `${result.success ? '✅ 已加黑' : '⚠️ 已存在并清扫'} <code>${valid[0]}</code>\n` + renderBanResults(banResults);
			} else {
				// 失败(已存在/未绑存储等)→ 追加原因
				lines.push('');
				lines.push(result.message);
				flashText = `⚠️ <code>${valid[0]}</code> ${result.message.replace(/<[^>]+>/g, '')}`;
			}
			await replyToAdmin(message, ctx, {
				flashText,
				detailText: withActionContext(message, lines.join('\n'), note),
				isInGroup,
				notifySecondaryOwners: true
			});
			return;
		}

		// 批量
		const results = await addManyToBlacklist(valid, env, { reason: 'manual', by: userId });
		const idsToKick = [...results.success, ...results.exists];
		const banSummary = { success: idsToKick.length, banOkAll: 0, banPartial: 0, banFailedAll: 0 };
		// 收集每个用户的逐群结果,用于在 detail 末尾渲染明细
		const perUserBanResults = []; // [{ userId, banResults }]
		for (const id of idsToKick) {
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
			const chatInfoCache = new Map();
			for (const { userId: uid, banResults } of perUserBanResults) {
				perUserDetailLines.push('', `<b>用户 <code>${uid}</code></b>`);
				perUserDetailLines.push(await renderBanResultsDetail(banResults, chatInfoCache));
			}
			fullDetail += '\n' + perUserDetailLines.join('\n');
		}
		await replyToAdmin(message, ctx, {
			flashText,
			detailText: withActionContext(message, fullDetail, note),
			isInGroup,
			notifySecondaryOwners: true
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
			await deleteAuthorizedGroupCommandMessage(message, '/unban');

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
		// D1 全局黑名单是自助解封的硬闸门：命中任何 reason 都拒绝，且不自动移除黑名单。
		if (await blockSelfUnbanIfBlacklisted(userId, chatId, message.from, env)) {
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
		// D1 全局黑名单是自助解封的硬闸门：命中任何 reason 都拒绝，且不自动移除黑名单。
		if (await blockSelfUnbanIfBlacklisted(userId, chatId, message.from, env)) {
			return;
		}
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

		// 通知主人：有用户完成了自助解封
		await notifyOwnerSelfUnban(message.from, perGroupResults);

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
		text: sanitizeTelegramText(text),
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
		user_id: Number(userId),
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
		user_id: Number(userId)
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
		user_id: Number(userId),
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
		user_id: Number(userId)
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

	// 主人/副主人直接放行（最高权限，先于超管/群管理员检查）
	if (isOwner(userIdStr)) {
		console.log(`[管理员鉴权] 用户 ${userId} 是主人/副主人 ✅`);
		return true;
	}

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

// 检测目标群管理员里是否有 GKYbot(username 含 GKY,覆盖 GKYxxxxBot 双bot变体)。
// 返回 { checked: bool, found: bool }。checked=false 表示查询失败(无法确认,按"未知"处理)。
// 注意:GKY 要执行删封必须是管理员,所以查管理员列表足够可靠;非管理员的 bot API 列不出。
async function groupHasGKYBot(chatId) {
	try {
		const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatAdministrators`;
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: chatId }),
		});
		const result = await response.json();
		if (!response.ok || !result.ok || !Array.isArray(result.result)) {
			return { checked: false, found: false };
		}
		const found = result.result.some((m) => {
			const u = m?.user;
			return u && u.is_bot && typeof u.username === 'string' && /gky/i.test(u.username);
		});
		return { checked: true, found };
	} catch (error) {
		console.error('[GKYbot检测] 查询失败:', error);
		return { checked: false, found: false };
	}
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
