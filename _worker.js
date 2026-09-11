// =============================================================================
// =可修改= 项目内置文案与参数
// 优先级：环境变量 > 这里的硬编码默认值
// 也就是说：这里改了立刻生效；如果 Cloudflare 后台同名环境变量也填了，则环境变量胜出。
// =============================================================================

// 1) 自助解封确认整句。用户必须**完整逐字粘贴**才会触发解封流程。
//    环境变量名：SELF_UNBAN_KEYWORD
const DEFAULT_SELF_UNBAN_KEYWORD = '我不是广告狗，我是误封的，希望可以解封。';

// 2) /start 收到时返回的机器人介绍欢迎语（仅 /start，不含解封确认整句）。
//    为什么和下面的 SELF_UNBAN_PROMPT 拆开：/start 是 Telegram 在用户首次打开 bot 时
//    自动发送的命令，任何人第一眼看到的就是它；而解封清单里含 {keyword} 确认整句，
//    第一主人在群里发 /start 会把这句口令明文贴进群，等于公开教学如何触发解封。
//    拆开后 /start 只做自我介绍并把用户引导到 /unban，群里发也无害。
//    支持 HTML 子集（<b>、换行等）。占位符：{userId}、{title}。
//    {title} 会替换成主群名称，默认文案刻意不使用它（主群可能是私密群，会泄漏群名）。
//    /unban 写成裸文本而非 <code>：Telegram 只对纯文本里的 /xxx 给「点一下直接发送」。
//    环境变量名：START_WELCOME
const DEFAULT_START_WELCOME = `👋 <b>你好，{userId}</b>

我是 <b>杀神搭配专用解封</b> 的自助解封机器人。

<b>━━ 我是做什么的 ━━</b>
如果你在群里被封禁或被禁言，又确认自己没有违规，
可以在这里自己完成解封，不需要等管理员处理。

<b>━━ 你现在可以做什么 ━━</b>
🔓 被封禁 / 被禁言了 → 发送 /unban 开始自助解封
💬 解封后仍无法发言 → 请到群内联系管理员

<b>━━ 请注意 ━━</b>
• 我不会主动私聊任何人，也不会索要账号、验证码或任何信息
• 自助解封仅限「误封」情形；确实违规的账号会被拒绝
• 恶意重复尝试会被记入全局黑名单，届时无法再自助解封`;

// 3) /unban 收到时返回的自助解封检查清单。
//    仅 /unban 使用（/start 已改用上面的 START_WELCOME）。
//    支持 HTML 子集（<b>、换行等）。占位符：{userId}、{title}、{keyword}。
//    {keyword} 会自动填入当前生效的 SELF_UNBAN_KEYWORD（来自环境变量或默认值）。
//    {title} 仍可用（会被替换成主群名称），但默认文案刻意【不使用】它 ——
//    主群若是私密群，显示真实群名等于把私人群名暴露给任何触发者，因此默认写固定品牌名。
//    需要显示群名的部署者可在环境变量 SELF_UNBAN_PROMPT 里自行写 {title}。
//    环境变量名：SELF_UNBAN_PROMPT
const DEFAULT_SELF_UNBAN_PROMPT = `🤖 <b>亲爱的 {userId}</b>，我是 <b>杀神搭配专用解封</b> 的 自助解封机器人

🔍 <b>请自行检查以下内容：</b>

1️⃣ 用户名是否包含广告内容？
2️⃣ 个人签名是否包含广告内容或链接？
3️⃣ 是否讨论了政治、NSFW、引战、嘲讽等内容？

✅ <b>如果你确定没有违反以上内容，请输入以下内容：</b>
	<code>{keyword}</code>`;

// 4) 用户输入正确确认句、解封请求被同意时回复的提示。
//    本项目解封走全群、封禁也走全群，bot 无法知道用户原本在哪个群被封，
//    因此不再说"返回某个群"，而是告知"全部群组限制已解除"，并把主群定位为【联系管理员的入口】。
//    占位符：
//      {groupcount} → 配置群组数量（GROUP_IDS.length）
//      {groupname}  → 联系主群名称（纯文本，按钮上会再显示一次，正文一般不用）
//      {username}   → 兼容旧配置：等价于 {groupname}，老的自定义文案不会失效
//    主群链接以 Telegram 内联按钮呈现（按钮文字 = 💬 + 群名），拿不到链接时按钮不出现并自动换用
//    DEFAULT_SELF_UNBAN_APPROVED_NOLINK，避免出现"点击一个点不动的东西"。
//    环境变量名：SELF_UNBAN_APPROVED
const DEFAULT_SELF_UNBAN_APPROVED = `✅ 已同意给予解封

📋 解封范围：全部 {groupcount} 个配置群组
   您的封禁与禁言限制已全部解除，现在可以正常发言。

💬 如有疑问，可点击下方按钮前往主群联系管理员。

⚠️ 请注意：解封后请遵守群规，避免再次被封禁。`;

// 4.1) 拿不到主群链接时使用的降级文案（不含"点击下方按钮"字样，也不会附带按钮）。
//    环境变量名：SELF_UNBAN_APPROVED_NOLINK
const DEFAULT_SELF_UNBAN_APPROVED_NOLINK = `✅ 已同意给予解封

📋 解封范围：全部 {groupcount} 个配置群组
   您的封禁与禁言限制已全部解除，现在可以正常发言。

💬 如有疑问，请前往主群联系管理员。

⚠️ 请注意：解封后请遵守群规，避免再次被封禁。`;

// 4.2) 主群联系入口按钮的文字前缀（emoji）。按钮完整文字 = 该前缀 + 群名。
const SELF_UNBAN_CONTACT_BUTTON_PREFIX = '💬 ';

// 5) /blacklist 命令单次最多展示多少条（按时间倒序，最新在前）。
//    环境变量名：BLACKLIST_PAGE_LIMIT （要求是正整数）
const DEFAULT_BLACKLIST_PAGE_LIMIT = 30;

// 6) 群内闪屏提示存活多少毫秒后自动撤回。
//    闪屏 = 群内执行授权命令后那条"短提示"，让操作者立刻看到结果又不长期污染群消息流。
//    调大 = 看得更从容但残留更久；调小 = 群更干净但容易没看清就消失。
//    设为 0 或负数则永不撤回（不推荐：回执常含 TGID 等不宜长期公开的信息）。
//    环境变量名：FLASH_MESSAGE_TTL_MS （要求 0~60000 之间的整数，单位毫秒）
const DEFAULT_FLASH_MESSAGE_TTL_MS = 5000;

// /purge 清扫按“黑名单用户 × 配置群组”分批执行，避免单次 Worker 撞 Cloudflare 子请求限制。
// 最坏情况下每个组合会调用 getChatMember + banChatMember 两次 Telegram API。
const PURGE_DEFAULT_PAIR_LIMIT = 20;
const PURGE_MAX_PAIR_LIMIT = 20;
const PURGE_CONCURRENCY = 5;
const PURGE_RUN_DELAY_MS = 250;
const PURGE_DEFAULT_REASONS = ['manual', 'sa', 'spam', 'ad_vote'];
const TG_MUTATION_RETRY_DELAY_MS = 350;

// 7) /blacklist 列表中"原因"字段的中文映射。
//    spam 表示 /spam 举报，manual 表示 /ban 手动添加；历史 reason=sa 继续按 /spam 展示。
//    ad_auto / ad_learn / gky_global 已无写入方（自动广告治理与杀神主动查杀均已移除），
//    但 D1 里的历史封禁记录仍带这些 reason，标签必须保留，否则旧记录会显示成裸字符串。
//    环境变量名：BLACKLIST_REASON_LABELS （要求是 JSON 字符串，例如 {"spam":"群内举报"}）
const DEFAULT_BLACKLIST_REASON_LABELS = {
	sa: '群内 /spam 举报（历史记录）',
	spam: '群内 /spam 举报',
	manual: '管理员 /ban 指令加黑',
	manual_ban: '旧版 Telegram 原生封禁同步记录',
	ad_auto: '🤖 广告自动检测（历史记录）',
	ad_learn: '🤖 上报学习（历史记录）',
	ad_vote: '🗳️ 群内投票举报',
	gky_global: '🌐 杀神全局封禁库命中（历史记录）'
};

// 8) GKY 封禁记录查询后端。改动者请确保返回 HTML 与 parseBanlistHTML 兼容。
//    环境变量名：GKY_BANLIST_ENDPOINT
const DEFAULT_GKY_BANLIST_ENDPOINT = 'https://gkybot.gmeow.cc/banlist';

// 9) 超级管理员 TGID 白名单。用于普通管理命令鉴权，支持多个 TGID。
//    环境变量名：SUPER_ADMINS （字符串形式，逗号分隔）
//    例：'123456,789012'
//    硬编码这里写数组形式，留空数组表示默认无超管。
const DEFAULT_SUPER_ADMINS = [
	// '123456789',
	// '987654321',
];

// 10) 主人 TGID(项目所有者),用于"主人审计通知"系统
//    所有管理员/超管在群里使用 /ban /unban /spam 命令、
//    群内手动 ban/unban 时,主人会收到一份带操作人标记的私聊审计通知
//    环境变量 OWNER_IDS(逗号分隔,中英文逗号均可):第一个是主人,后续是副主人
//    主人收全部通知;副主人只收 /ban、/spam 这类加黑踢人通知
//    空数组 = 禁用通知系统(其他管理员仍可正常使用命令,但都没有私聊详情)
//    填了主人/副主人ID但账号从未私聊过 bot → 通知会投递失败,Worker 日志可见
const DEFAULT_OWNER_IDS = [];

// 11) 自助解封成功后，"联系管理员"按钮指向哪个群（主群 = 回家的入口）。
//    留空 → 用 GROUP_IDS[0]（主群），与原行为一致。
//    填了但该群不在 GROUP_ID 配置里 → 忽略并回落主群 + 打日志，避免把用户导向 bot 管不到的群。
//    环境变量名：SELF_UNBAN_CONTACT_GROUP
const DEFAULT_SELF_UNBAN_CONTACT_GROUP = '';

// =============================================================================
// =结束= 普通使用者一般无需修改下方任何内容
// =============================================================================

// 清扫回看上限:/spam 删完当事人消息后，按这个条数回看 moderation_messages 做当前群清扫。
// 环境变量名:MSG_CACHE_SIZE(1~500，默认 50)
const DEFAULT_MSG_CACHE_SIZE = 50;

// ===== 群内广告举报投票(/ad)=====
const AD_VOTE_THRESHOLD = 6;
const AD_VOTE_DURATION_SECONDS = 60 * 60;
const AD_VOTE_COMMAND_MAX_AGE_SECONDS = 30;
const AD_VOTE_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const AD_VOTE_BUTTON_PREFIX = 'adv:';
const AD_WORDS_PAGINATION_PREFIX = 'adwords:';
const AD_JOB_PAGINATION_PREFIX = 'adjob:';
const AD_WORDS_PAGE_LIMIT = 20;
const AD_VOTE_HISTORY_FALLBACK_LIMIT = 20;

// 运行期生效的可配置项（每次请求开始时由 loadRequiredConfig 写入）
let SELF_UNBAN_KEYWORD;
let START_WELCOME;
let SELF_UNBAN_PROMPT;
let SELF_UNBAN_APPROVED;
let SELF_UNBAN_APPROVED_NOLINK;
let SELF_UNBAN_CONTACT_GROUP;
let BLACKLIST_PAGE_LIMIT;
let BLACKLIST_REASON_LABELS;
let GKY_BANLIST_ENDPOINT;
// 群内闪屏存活毫秒数。给初值是因为 sendFlashMessage 可能在 getConfig 之前被调用
// （例如配置解析本身报错时的提示），此时不该因为 undefined 退化成"永不撤回"。
let FLASH_MESSAGE_TTL_MS = DEFAULT_FLASH_MESSAGE_TTL_MS;

// Telegram Bot Token
let TOKEN;
let BOT_TOKEN;
// 主群组ID（GROUP_IDS 的第一项，用于发送二次审核提醒、缓存群组信息等"主群行为"）
let GROUP_ID;
// 全部配置群组ID列表（支持 GROUP_ID 环境变量逗号分隔多群组）
let GROUP_IDS = [];
// GROUP_ID 环境变量原始群列表（不含 /addgroup 动态群）。用于 /listgroups 分段展示、
// 以及禁止把环境变量里已有的群重复加进动态表。
let ENV_GROUP_IDS = [];
// D1 dynamic_groups 里合并进来的群（每请求由 mergeDynamicGroupsFromD1 重建）
let DYNAMIC_GROUP_IDS = [];
// 超级管理员 TGID 白名单（用于普通管理命令）
let SUPER_ADMINS = [];
// 主人 TGID 列表:第一个是主人,后续是副主人。空数组 = 未配置,禁用通知
let OWNER_IDS = [];
// 静态用户资料表：bot 不在其所在群时作为 /admins 权限名单的兜底显示
// 格式：TGID 字符串 → { id, first_name, last_name, username }
// 环境变量 STATIC_USER_PROFILES（JSON 字符串）优先，留空则为空表
let STATIC_USER_PROFILES = {};
// 清扫回看上限(/spam 按它决定 moderation_messages 回看多少条)
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
	// 每请求把动态群基线重置为空：GROUP_IDS 此刻只含环境变量群，
	// 随后 mergeDynamicGroupsFromD1 再按 D1 内容追加，避免 isolate 复用时残留上次的群。
	ENV_GROUP_IDS = [...config.GROUP_IDS];
	DYNAMIC_GROUP_IDS = [];
	GROUP_ID = config.GROUP_ID;
	SUPER_ADMINS = config.SUPER_ADMINS;
	OWNER_IDS = config.OWNER_IDS;
	STATIC_USER_PROFILES = config.STATIC_USER_PROFILES || {};
	AD_PROTECTED_USERNAMES = config.AD_PROTECTED_USERNAMES || [];
	MSG_CACHE_SIZE = config.MSG_CACHE_SIZE;
	FLASH_MESSAGE_TTL_MS = config.FLASH_MESSAGE_TTL_MS;
	SELF_UNBAN_KEYWORD = config.SELF_UNBAN_KEYWORD;
	START_WELCOME = config.START_WELCOME;
	SELF_UNBAN_PROMPT = config.SELF_UNBAN_PROMPT;
	SELF_UNBAN_APPROVED = config.SELF_UNBAN_APPROVED;
	SELF_UNBAN_APPROVED_NOLINK = config.SELF_UNBAN_APPROVED_NOLINK;
	SELF_UNBAN_CONTACT_GROUP = config.SELF_UNBAN_CONTACT_GROUP;
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
		// 必须在任何路由分发之前合并 /addgroup 动态群：isConfiguredGroup 及其 26 个调用点
		// 都依赖 GROUP_IDS，晚于分发会导致动态群被当成"非配置群"直接忽略。
		await mergeDynamicGroupsFromD1(env);

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

				// 分发：普通消息 / 群成员状态变更
				if (update.message) {
					await handleMessage(update.message, env, ctx, request.url);
				} else if (update.chat_member) {
					await handleChatMemberUpdate(update.chat_member, env);
				} else if (update.callback_query) {
					await handleAdCallbackQuery(update.callback_query, env, ctx);
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
		// 与 fetch 入口同样必须合并：getBulkJobConfiguredGroupIds 会用 isConfiguredGroup
		// 重新校验任务里存的 groupIds，此处不合并会把动态群静默丢弃 ——
		// 任务回执显示成功，但那些群实际没有执行封禁。
		await mergeDynamicGroupsFromD1(env);

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
	},

	// Cron 入口（闸三）。触发器在 wrangler.toml 的 [triggers] crons 里配置。
	// 只做一件事：滚动复查发言者名册的 bio，抓「先干净过检、事后改 bio」的逃逸。
	// 与 fetch / queue 一样必须先 applyRuntimeConfig —— BOT_TOKEN 等运行期配置
	// 是模块级变量，不初始化的话所有 Telegram 调用都会带空 token 静默失败。
	// mergeDynamicGroupsFromD1 同样必要：enforceAdDetection 的全群封禁要遍历
	// 配置群 + 动态群，不合并会漏掉动态群里的封禁。
	async scheduled(controller, env, ctx) {
		try {
			applyRuntimeConfig(loadRequiredConfig(env));
		} catch (error) {
			// 配置缺失时直接返回而不 throw：cron 抛异常只会被记一条失败，
			// 无人接收，重试也仍然缺配置。日志里写清原因更有用。
			console.error('[广告检测·扫描] Cron 初始化失败:', error);
			return;
		}
		try {
			await mergeDynamicGroupsFromD1(env);
			const summary = await runAdBioRescan(env);
			// 顺手清一次过期数据。原先只搭在 detectAdOnJoin 上，
			// 没人入群的日子就不会剪枝；挂到 cron 上有个稳定节拍。
			await pruneAdDetectionData(env);
			console.log('[广告检测·扫描] Cron ' + (controller?.cron || '') + ' 结果: ' + JSON.stringify(summary));
		} catch (error) {
			console.error('[广告检测·扫描] Cron 执行失败:', error);
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
	const startWelcome = pickStr(env.START_WELCOME, DEFAULT_START_WELCOME);
	const selfUnbanPrompt = pickStr(env.SELF_UNBAN_PROMPT, DEFAULT_SELF_UNBAN_PROMPT);
	const selfUnbanApproved = pickStr(env.SELF_UNBAN_APPROVED, DEFAULT_SELF_UNBAN_APPROVED);
	const selfUnbanApprovedNoLink = pickStr(env.SELF_UNBAN_APPROVED_NOLINK, DEFAULT_SELF_UNBAN_APPROVED_NOLINK);
	// 联系主群：留空用 GROUP_IDS[0]；填了但不在配置群列表里则忽略并回落主群（防止导向 bot 管不到的群）
	let selfUnbanContactGroup = uniqueGroupIds[0];
	const rawContactGroup = pickStr(env.SELF_UNBAN_CONTACT_GROUP, DEFAULT_SELF_UNBAN_CONTACT_GROUP).trim();
	if (rawContactGroup) {
		if (uniqueGroupIds.includes(rawContactGroup)) {
			selfUnbanContactGroup = rawContactGroup;
		} else {
			console.error(
				`SELF_UNBAN_CONTACT_GROUP=${rawContactGroup} 不在 GROUP_ID 配置列表中，已回落主群 ${uniqueGroupIds[0]}`
			);
		}
	}

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
				blacklistReasonLabels = { ...DEFAULT_BLACKLIST_REASON_LABELS, ...parsed };
			}
		} catch (_) {
			// 解析失败时保持默认，不抛异常以免阻塞启动
			console.error('BLACKLIST_REASON_LABELS 不是合法 JSON，已回退默认值');
		}
	}

	const gkyEndpoint = pickStr(env.GKY_BANLIST_ENDPOINT, DEFAULT_GKY_BANLIST_ENDPOINT);
	// ===== 清扫缓存配置 =====
	// 旧版自动广告治理已移除，AD_FILTER_ENABLED / AD_STRICT_MODE / AD_KEYWORDS /
	// AD_WHITELIST / GKY_ACTIVE_CHECK / GKY_SYNC_BLACKLIST / CROSS_GROUP_SPAM_* /
	// MSG_CACHE_ENABLED 全部不再解析。
	// 注意：AD_SCORE_THRESHOLD 已被广告检测 v2 重新启用，但不在此处解析——
	// v2 的全部 AD_* 配置由 loadAdDetectionConfig(env) 直接读 env 并做范围校验，
	// 不进 getConfig 的返回对象，也不写任何模块级变量，避免与旧实现的语义混淆。
	// MSG_CACHE_SIZE 保留：/spam 清扫按它决定 moderation_messages 的回看上限。
	let msgCacheSize = DEFAULT_MSG_CACHE_SIZE;
	if (env.MSG_CACHE_SIZE !== undefined && env.MSG_CACHE_SIZE !== null && String(env.MSG_CACHE_SIZE).trim() !== '') {
		const n = parseInt(String(env.MSG_CACHE_SIZE).trim(), 10);
		if (Number.isInteger(n) && n > 0 && n <= 500) msgCacheSize = n;
	}

	// 闪屏存活时长。允许 0（= 永不撤回），所以下界判 n >= 0 而不是 n > 0；
	// 上界 60 秒：再长就失去"闪屏"语义，且 ctx.waitUntil 挂太久没意义。
	// 空串/非整数/超范围一律回落默认值，避免误配把闪屏变成永久消息。
	let flashTtlMs = DEFAULT_FLASH_MESSAGE_TTL_MS;
	if (env.FLASH_MESSAGE_TTL_MS !== undefined && env.FLASH_MESSAGE_TTL_MS !== null && String(env.FLASH_MESSAGE_TTL_MS).trim() !== '') {
		const n = parseInt(String(env.FLASH_MESSAGE_TTL_MS).trim(), 10);
		if (Number.isInteger(n) && n >= 0 && n <= 60000) flashTtlMs = n;
	}

	return {
		TOKEN: String(env.TOKEN).trim(),
		BOT_TOKEN: String(env.BOT_TOKEN).trim(),
		GROUP_IDS: uniqueGroupIds,
		GROUP_ID: uniqueGroupIds[0],
		SUPER_ADMINS: superAdmins,
		OWNER_IDS: ownerIds,
		AD_PROTECTED_USERNAMES: parseAdProtectedUsernames(env.AD_PROTECTED_USERNAMES),
		MSG_CACHE_SIZE: msgCacheSize,
		FLASH_MESSAGE_TTL_MS: flashTtlMs,
		SELF_UNBAN_KEYWORD: selfUnbanKeyword,
		START_WELCOME: startWelcome,
		SELF_UNBAN_PROMPT: selfUnbanPrompt,
		SELF_UNBAN_APPROVED: selfUnbanApproved,
		SELF_UNBAN_APPROVED_NOLINK: selfUnbanApprovedNoLink,
		SELF_UNBAN_CONTACT_GROUP: selfUnbanContactGroup,
		BLACKLIST_PAGE_LIMIT: blacklistPageLimit,
		BLACKLIST_REASON_LABELS: blacklistReasonLabels,
		GKY_BANLIST_ENDPOINT: gkyEndpoint,
		STATIC_USER_PROFILES: parseStaticUserProfiles(env.STATIC_USER_PROFILES),
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
				{ command: "ban", description: "添加用户到全局黑名单 (当前群管理员)" },
				{ command: "spam", description: "举报并加入全局黑名单 (当前群管理员)" },
				{ command: "check", description: "查询封禁状态 (高级管理员)" },
				{ command: "blacklist", description: "查看当前黑名单 (高级管理员)" }
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
const BULK_TASK_SYNC_SUBREQUEST_BUDGET = 100;
const BULK_TASK_FIXED_SUBREQUEST_RESERVE = 10;
const BULK_TASK_USER_BATCH_SIZE = 20;
const BULK_TASK_OPERATION_SLICE_SIZE = 24;
const BULK_TASK_CONCURRENCY = 3;
const BULK_TASK_D1_RETRY_LIMIT = 1;
const BULK_TASK_D1_RETRY_DELAY_MS = 200;
const BULK_TASK_FAILURE_LIMIT = 100;
const BULK_TASK_LEASE_MS = 45000;
const D1_BATCH_MUTATION_SIZE = 20;
const BATCH_USER_PROFILE_CONCURRENCY = 3;
const BATCH_USER_NAME_MAX_LENGTH = 48;
const BULK_JOB_PROFILE_PAGE_SIZE = 10;
const TELEGRAM_SAFE_MESSAGE_LENGTH = 3500;
const BATCH_ACTION_NOTE_MAX_LENGTH = 500;

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

function normalizeActionNote(note) {
	const clean = sanitizeTelegramText(note).replace(/\s+/g, ' ').trim();
	if (!clean) return '';
	if (Array.from(clean).length <= BATCH_ACTION_NOTE_MAX_LENGTH) return clean;
	return `${truncateTelegramText(clean, BATCH_ACTION_NOTE_MAX_LENGTH - 1)}…`;
}

function formatActionNote(note) {
	const clean = normalizeActionNote(note);
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
const D1_SCHEMA_VERSION = 6;
const D1_CACHE_PRUNE_INTERVAL = 64;
const D1_RUNTIME_CACHE_TTL_MS = 15000;
const D1_INIT_PROMISES = new WeakMap();
const D1_AD_VOTE_INIT_PROMISES = new WeakMap();
const D1_DYNAMIC_GROUPS_CACHE = new WeakMap();

function cloneD1RuntimeValue(value) {
	if (value === null || value === undefined) return value;
	return JSON.parse(JSON.stringify(value));
}

function setD1RuntimeCache(cache, db, value) {
	if (!db) return;
	cache.set(db, {
		value: cloneD1RuntimeValue(value),
		expiresAt: Date.now() + D1_RUNTIME_CACHE_TTL_MS,
		promise: null
	});
}

async function loadD1RuntimeCachedValue(env, cache, loader) {
	if (!env.DB) return null;
	const cached = cache.get(env.DB);
	if (cached?.promise) {
		return cloneD1RuntimeValue(await cached.promise);
	}
	if (cached && cached.expiresAt > Date.now()) {
		return cloneD1RuntimeValue(cached.value);
	}

	const promise = Promise.resolve().then(() => loader(env));
	cache.set(env.DB, { value: null, expiresAt: 0, promise });
	try {
		const value = await promise;
		setD1RuntimeCache(cache, env.DB, value);
		return cloneD1RuntimeValue(value);
	} catch (error) {
		cache.delete(env.DB);
		throw error;
	}
}

function normalizeD1BlacklistRow(row) {
	if (!row) return null;
	return {
		id: String(row.id),
		reason: row.reason ?? null,
		by: row.by_user ?? null,
		at: row.at ?? null,
		note: row.note ?? null
	};
}

async function d1ColumnExists(env, table, column) {
	const { results } = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
	return (results || []).some((row) => String(row.name) === column);
}

async function d1TableExists(env, table) {
	const row = await env.DB.prepare(
		"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
	).bind(String(table)).first();
	return String(row?.name || '') === String(table);
}

async function d1TablesExist(env, tables) {
	for (const table of tables) {
		if (!(await d1TableExists(env, table))) return false;
	}
	return true;
}

async function d1CoreTablesExist(env) {
	return d1ColumnExists(env, 'blacklist', 'note');
}


async function d1AdVoteTablesExist(env) {
	return d1TablesExist(env, ['ad_votes', 'ad_vote_allowlist']);
}

function formatD1SchemaError(error) {
	const name = String(error?.name || '').trim();
	const message = String(error?.message || '').trim();
	const cause = String(error?.cause?.message || error?.cause || '').trim();
	const stack = String(error?.stack || '').trim();
	const primary = [name, message].filter(Boolean).join(': ') || String(error || '未知错误');
	const causeText = cause && cause !== message ? '; cause=' + cause : '';
	const stackText = stack ? '; stack=' + stack : '';
	return (primary + causeText + stackText).slice(0, 2000);
}

function isTransientD1SchemaError(error) {
	const message = String(error?.message || '').trim();
	const detail = formatD1SchemaError(error).toLowerCase();
	return detail.includes('sqlite_busy')
		|| detail.includes('database is locked')
		|| detail.includes('database table is locked')
		|| detail.includes('temporarily unavailable')
		|| (!message && detail.includes('cloudflare-internal:d1-api'));
}

async function runD1SchemaStatement(env, label, sql, options = {}) {
	const optional = options.optional === true;
	const maxAttempts = Math.max(1, Math.min(Number(options.maxAttempts) || 3, 3));
	let lastError = null;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			await env.DB.exec(sql);
			return true;
		} catch (error) {
			lastError = error;
			if (attempt >= maxAttempts || !isTransientD1SchemaError(error)) break;
			await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
		}
	}
	const detail = formatD1SchemaError(lastError);
	if (optional) {
		console.warn('D1 可选结构创建失败 [' + label + ']: ' + detail);
		return false;
	}
	throw new Error('D1 结构创建失败 [' + label + ']: ' + detail);
}

async function readD1SchemaVersion(env) {
	try {
		const row = await env.DB.prepare('SELECT version FROM schema_meta WHERE id = 1').first();
		return Number(row?.version || 0);
	} catch (_) {
		return 0;
	}
}

async function ensureD1Table(env) {
	if (!env.DB) return false;
	const cached = D1_INIT_PROMISES.get(env.DB);
	if (cached) return cached;

	const initPromise = (async () => {
		try {
			const version = await readD1SchemaVersion(env);
			const coreReady = await d1CoreTablesExist(env);
			if (version >= D1_SCHEMA_VERSION && coreReady) {
				return true;
			}

			const tableStatements = [
				['schema_meta', 'CREATE TABLE IF NOT EXISTS schema_meta (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, updated_at TEXT);'],
				['blacklist', 'CREATE TABLE IF NOT EXISTS blacklist (id TEXT PRIMARY KEY, reason TEXT, by_user TEXT, at TEXT, note TEXT);'],
				// 清扫缓存：/spam 删完当事人消息后按它回看当前群近期发言。唯一保留的消息缓存表。
				// 原先的 ad_keywords / ad_samples / recent_messages / cross_group_posts /
				// learn_snapshot 随自动广告治理一并移除，不再建表（旧库里的表不受影响，可手动清理）。
				['moderation_messages', 'CREATE TABLE IF NOT EXISTS moderation_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, mid INTEGER, chat_id TEXT, from_id TEXT, created_at TEXT);'],
				['batch_jobs', 'CREATE TABLE IF NOT EXISTS batch_jobs (id TEXT PRIMARY KEY, type TEXT, status TEXT, payload TEXT NOT NULL, created_at TEXT, updated_at TEXT);'],
				// 动态群组：第一主人用 /addgroup 加进来的群。与 GROUP_ID 环境变量彻底分离
				// （Worker 无法写自己的环境变量），合并时环境变量群永远在前，主群身份不受影响。
				['dynamic_groups', 'CREATE TABLE IF NOT EXISTS dynamic_groups (chat_id TEXT PRIMARY KEY, title TEXT, added_by TEXT NOT NULL, added_at TEXT NOT NULL, note TEXT);'],
			];
			for (const [label, sql] of tableStatements) {
				await runD1SchemaStatement(env, label, sql);
			}

			const optionalIndexes = [
				['idx_blacklist_at_id', 'CREATE INDEX IF NOT EXISTS idx_blacklist_at_id ON blacklist(at, id);'],
				['idx_blacklist_reason_at_id', 'CREATE INDEX IF NOT EXISTS idx_blacklist_reason_at_id ON blacklist(reason, at, id);'],
				['idx_moderation_chat_from_id', 'CREATE INDEX IF NOT EXISTS idx_moderation_chat_from_id ON moderation_messages(chat_id, from_id, id);'],
			];
			for (const [label, sql] of optionalIndexes) {
				await runD1SchemaStatement(env, label, sql, { optional: true });
			}

			try {
				if (!(await d1ColumnExists(env, 'blacklist', 'note'))) {
					await runD1SchemaStatement(env, 'blacklist.note', 'ALTER TABLE blacklist ADD COLUMN note TEXT;');
				}
			} catch (error) {
				const message = formatD1SchemaError(error).toLowerCase();
				if (!message.includes('duplicate') && !message.includes('exists')) {
					throw error;
				}
			}

			try {
				await env.DB.prepare('INSERT OR REPLACE INTO schema_meta (id, version, updated_at) VALUES (1, ?, ?)')
					.bind(D1_SCHEMA_VERSION, new Date().toISOString())
					.run();
			} catch (error) {
				throw new Error('D1 schema_meta 版本写入失败: ' + formatD1SchemaError(error));
			}

			if (!(await d1CoreTablesExist(env))) {
				throw new Error('D1 核心结构迁移不完整');
			}
			return true;
		} catch (error) {
			console.error('D1 核心结构初始化失败: ' + formatD1SchemaError(error));
			try {
				if (await d1CoreTablesExist(env)) {
					console.warn('D1 核心表可用，附属迁移失败不阻断现有数据访问。');
					return true;
				}
			} catch (verifyError) {
				console.error('D1 核心结构复核失败: ' + formatD1SchemaError(verifyError));
			}
			return false;
		}
	})();
	D1_INIT_PROMISES.set(env.DB, initPromise);
	const initialized = await initPromise;
	if (!initialized) D1_INIT_PROMISES.delete(env.DB);
	return initialized;
}


async function ensureAdVoteTables(env) {
	if (!env.DB) return false;
	const cached = D1_AD_VOTE_INIT_PROMISES.get(env.DB);
	if (cached) return cached;

	const initPromise = (async () => {
		try {
			if (!(await ensureD1Table(env))) {
				throw new Error('D1 核心结构不可用');
			}
			await runD1SchemaStatement(
				env,
				'ad_votes',
				'CREATE TABLE IF NOT EXISTS ad_votes (vote_token TEXT PRIMARY KEY, chat_id TEXT NOT NULL, vote_message_id INTEGER, reported_message_id INTEGER, target_user_id TEXT NOT NULL, creator_user_id TEXT NOT NULL, state_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, finalized INTEGER NOT NULL DEFAULT 0, result TEXT, created_at INTEGER NOT NULL, deadline_at INTEGER NOT NULL, updated_at TEXT NOT NULL);',
			);
			await runD1SchemaStatement(
				env,
				'ad_vote_allowlist',
				'CREATE TABLE IF NOT EXISTS ad_vote_allowlist (user_id TEXT PRIMARY KEY, by_user TEXT, at TEXT NOT NULL);',
			);
			await runD1SchemaStatement(
				env,
				'idx_ad_votes_active_target',
				'CREATE INDEX IF NOT EXISTS idx_ad_votes_active_target ON ad_votes(chat_id, target_user_id, finalized, deadline_at);',
				{ optional: true },
			);
			await runD1SchemaStatement(
				env,
				'idx_ad_votes_created_at',
				'CREATE INDEX IF NOT EXISTS idx_ad_votes_created_at ON ad_votes(created_at);',
				{ optional: true },
			);
			if (!(await d1AdVoteTablesExist(env))) {
				throw new Error('D1 投票表迁移不完整');
			}
			return true;
		} catch (error) {
			console.error('D1 投票表初始化失败: ' + formatD1SchemaError(error));
			return false;
		}
	})();
	D1_AD_VOTE_INIT_PROMISES.set(env.DB, initPromise);
	const initialized = await initPromise;
	if (!initialized) D1_AD_VOTE_INIT_PROMISES.delete(env.DB);
	return initialized;
}
// ===== 动态群组（/addgroup 加入，存 D1，与 GROUP_ID 环境变量分离）=====
// Worker 无法写自己的环境变量，所以指令加的群必然只在 D1；两套数据天然不会混。
// 合并顺序固定为「环境变量群在前、动态群在后」，动态群永远不会顶替 GROUP_IDS[0] 主群。
// 合并进 GROUP_IDS 之后，isConfiguredGroup 的全部调用点（封禁/踢人/广告检测/purge/
// 批量任务/投票）自动生效，无需逐处改动。
async function loadDynamicGroupsFromD1(env) {
	if (!env.DB) return [];
	try {
		if (!(await ensureD1Table(env))) return [];
		const { results } = await env.DB
			.prepare('SELECT chat_id, title, added_by, added_at, note FROM dynamic_groups ORDER BY added_at ASC, chat_id ASC')
			.all();
		// 严格校验 chat_id 格式：只接受 -100 开头的超级群组 ID。
		// 任何脏数据（手工改库、schema 漂移、误写）都不得进入 GROUP_IDS ——
		// 那会让全群封禁对一个不存在的 chat 反复报错，且污染"配置群"语义。
		return (results || [])
			.filter((row) => isSupergroupChatId(row?.chat_id))
			.map((row) => ({
				chatId: String(row.chat_id),
				title: row.title ?? null,
				addedBy: row.added_by ?? null,
				addedAt: row.added_at ?? null,
				note: row.note ?? null,
			}));
	} catch (error) {
		console.error('[动态群组] 读 D1 失败:', error);
		return [];
	}
}

async function loadDynamicGroupsCachedFromD1(env) {
	const value = await loadD1RuntimeCachedValue(env, D1_DYNAMIC_GROUPS_CACHE, loadDynamicGroupsFromD1);
	return Array.isArray(value) ? value : [];
}

// 把 D1 动态群并入运行期 GROUP_IDS。必须在路由分发之前调用（fetch 与 queue 两个入口都要），
// 否则 getBulkJobConfiguredGroupIds 会用 isConfiguredGroup 把动态群静默过滤掉，
// 造成批量任务显示成功但那些群实际未执行。
async function mergeDynamicGroupsFromD1(env) {
	if (!env?.DB) return;
	// 环境变量群基线由 applyRuntimeConfig 每请求重置，这里只做追加。
	ENV_GROUP_IDS = [...GROUP_IDS];
	try {
		const rows = await loadDynamicGroupsCachedFromD1(env);
		if (rows.length === 0) {
			DYNAMIC_GROUP_IDS = [];
			return;
		}
		const envSet = new Set(GROUP_IDS.map((id) => String(id)));
		const extra = [];
		for (const row of rows) {
			const id = String(row.chatId || '').trim();
			if (!id || envSet.has(id)) continue;
			envSet.add(id);
			extra.push(id);
		}
		DYNAMIC_GROUP_IDS = extra;
		if (extra.length > 0) GROUP_IDS = [...GROUP_IDS, ...extra];
	} catch (error) {
		// 读失败时保持环境变量群不变，绝不因此丢群
		console.error('[动态群组] 合并失败，仅使用 GROUP_ID 环境变量:', error);
		DYNAMIC_GROUP_IDS = [];
	}
}

function isDynamicGroup(chatId) {
	const idStr = String(chatId ?? '');
	return DYNAMIC_GROUP_IDS.some((id) => String(id) === idStr);
}

function isSupergroupChatId(value) {
	return /^-100\d{6,}$/.test(String(value || '').trim());
}

async function addDynamicGroup(env, chatId, options = {}) {
	if (!env.DB) return { ok: false, code: 'NO_DB', message: '未绑定 D1 存储空间' };
	const id = String(chatId || '').trim();
	if (!isSupergroupChatId(id)) {
		return { ok: false, code: 'INVALID', message: '群组 ID 格式错误，必须是 -100 开头的超级群组 ID' };
	}
	// 已在环境变量里的群不允许重复加入，避免两套数据来源打架
	if (ENV_GROUP_IDS.some((g) => String(g) === id)) {
		return { ok: false, code: 'ENV_DUPLICATE', message: '该群已在 GROUP_ID 环境变量中，无需重复添加' };
	}
	try {
		await ensureD1Table(env);
		const title = options.title != null ? String(options.title).slice(0, 200) : null;
		const note = options.note ? String(options.note).slice(0, 500) : null;
		const result = await env.DB
			.prepare('INSERT OR IGNORE INTO dynamic_groups (chat_id, title, added_by, added_at, note) VALUES (?, ?, ?, ?, ?)')
			.bind(id, title, String(options.addedBy || 'unknown'), new Date().toISOString(), note)
			.run();
		const changed = result?.meta?.changes ?? result?.changes ?? 0;
		if (!changed) return { ok: false, code: 'EXISTS', message: '该群已在动态群组列表中' };
		D1_DYNAMIC_GROUPS_CACHE.delete(env.DB);
		return { ok: true, code: 'ADDED' };
	} catch (error) {
		console.error('[动态群组] 写入失败:', error);
		return { ok: false, code: 'ERROR', message: error.message || String(error) };
	}
}

async function removeDynamicGroup(env, chatId) {
	if (!env.DB) return { ok: false, code: 'NO_DB', message: '未绑定 D1 存储空间' };
	const id = String(chatId || '').trim();
	if (!id) return { ok: false, code: 'INVALID', message: '群组 ID 不能为空' };
	try {
		await ensureD1Table(env);
		const result = await env.DB.prepare('DELETE FROM dynamic_groups WHERE chat_id = ?').bind(id).run();
		const changed = result?.meta?.changes ?? result?.changes ?? 0;
		if (!changed) return { ok: false, code: 'NOT_FOUND', message: '该群不在动态群组列表中' };
		D1_DYNAMIC_GROUPS_CACHE.delete(env.DB);
		return { ok: true, code: 'REMOVED' };
	} catch (error) {
		console.error('[动态群组] 删除失败:', error);
		return { ok: false, code: 'ERROR', message: error.message || String(error) };
	}
}

async function readD1Blacklist(env) {
	await ensureD1Table(env);
	const stmt = env.DB.prepare('SELECT id, reason, by_user, at, note FROM blacklist ORDER BY at ASC, id ASC');
	const { results } = await stmt.all();
	return (results || []).map(normalizeD1BlacklistRow).filter(Boolean);
}

async function readD1BlacklistEntry(env, userId) {
	await ensureD1Table(env);
	const id = String(userId ?? '').trim();
	if (!id) return null;
	const row = await env.DB.prepare('SELECT id, reason, by_user, at, note FROM blacklist WHERE id = ? LIMIT 1')
		.bind(id)
		.first();
	return normalizeD1BlacklistRow(row);
}

async function readD1BlacklistRecent(env, limit) {
	await ensureD1Table(env);
	const safeLimit = Math.max(1, Math.min(Number(limit) || BLACKLIST_PAGE_LIMIT, 200));
	const { results } = await env.DB.prepare('SELECT id, reason, by_user, at, note FROM blacklist ORDER BY at DESC, id DESC LIMIT ?')
		.bind(safeLimit)
		.all();
	return (results || []).map(normalizeD1BlacklistRow).filter(Boolean);
}

function d1LastRowId(result) {
	const id = Number(result?.meta?.last_row_id ?? result?.meta?.lastRowId ?? result?.meta?.last_rowid);
	return Number.isFinite(id) && id > 0 ? id : null;
}

function shouldPruneD1Cache(insertResult) {
	const insertedId = d1LastRowId(insertResult);
	return insertedId === null || insertedId % D1_CACHE_PRUNE_INTERVAL === 0;
}

async function pruneAutoincrementCacheTable(env, table, keepLimit) {
	if (table !== 'moderation_messages') {
		throw new Error(`Unsupported D1 cache table: ${table}`);
	}
	const safeLimit = Math.max(1, Math.floor(Number(keepLimit) || 1));
	await env.DB.prepare(`DELETE FROM ${table} WHERE id <= COALESCE((SELECT id FROM ${table} ORDER BY id DESC LIMIT 1 OFFSET ?), 0)`)
		.bind(safeLimit)
		.run();
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
		SELECT id, reason, by_user, at, note
		FROM blacklist
		${filter.where}
		ORDER BY at ASC, id ASC
		LIMIT ? OFFSET ?
	`);
	const { results } = await stmt.bind(...filter.params, safeLimit, safeOffset).all();
	return (results || []).map((r) => ({
		id: String(r.id),
		reason: r.reason ?? null,
		by: r.by_user ?? null,
		at: r.at ?? null,
		note: r.note ?? null
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
		const hit = await readD1BlacklistEntry(env, userId);
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

async function blockSelfUnbanIfBlacklisted(userId, chatId, fromUser, env, options = {}) {
	const blacklistCheck = await checkBlacklist(userId, env, { strict: true });
	if (!blacklistCheck.isBlacklisted) {
		return false;
	}

	if (!options.silentGroupReply) {
		if (options.flashOnly) {
			await sendFlashMessage(chatId, blacklistCheck.message, options.ctx);
		} else {
			await sendTelegramMessage(chatId, blacklistCheck.message);
		}
	}
	if (!blacklistCheck.checkFailed) {
		await notifyOwnerBlacklistAppeal(fromUser, blacklistCheck);
	} else if ((options.flashOnly || options.silentGroupReply) && options.message) {
		const auditText = renderAuditNotification(
			formatMessageActorMention(options.message),
			blacklistCheck.message,
			'群内',
			classifyMessageOperatorRole(options.message, '群管理员')
		);
		await notifyAllOwners(auditText, null);
	}
	return true;
}

// 添加用户到黑名单（核心实现）
async function addToBlacklistCore(userId, env, options = {}) {
	if (!env.DB) {
		return { success: false, code: 'NO_DB', message: '❌ 未绑定 D1 存储空间' };
	}

	const userIdStr = String(userId);
	const reason = options.reason ?? null;
	const by = options.by != null ? String(options.by) : null;
	const noteRaw = options.note != null ? String(options.note).trim() : '';
	const note = noteRaw ? noteRaw : null;
	const at = new Date().toISOString();

	try {
		await ensureD1Table(env);
		const result = await env.DB
			.prepare('INSERT OR IGNORE INTO blacklist (id, reason, by_user, at, note) VALUES (?, ?, ?, ?, ?)')
			.bind(userIdStr, reason, by, at, note)
			.run();
		const changed = result?.meta?.changes ?? result?.changes ?? 0;
		if (!changed) {
			return { success: false, code: 'EXISTS', message: '⚠️ 该用户已在黑名单中' };
		}

		return { success: true, code: 'ADDED', message: `✅ 已将用户 <code>${userId}</code> 添加到黑名单` };
	} catch (error) {
		console.error('添加黑名单时出错:', error);
		return { success: false, code: 'ERROR', message: '❌ 添加黑名单失败: ' + error.message };
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
		return { success: false, code: 'NO_DB', message: '❌ 未绑定 D1 存储空间' };
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
			return { success: false, code: 'NOT_FOUND', message: '⚠️ 该用户不在黑名单中' };
		}

		return { success: true, code: 'REMOVED', message: `✅ 已将用户 <code>${userId}</code> 从黑名单中移除` };
	} catch (error) {
		console.error('移除黑名单时出错:', error);
		return { success: false, code: 'ERROR', message: '❌ 移除黑名单失败: ' + error.message };
	}
}

// 从黑名单中移除用户（薄包装）
async function removeFromBlacklist(userId, env) {
	const result = await removeFromBlacklistCore(userId, env);
	return result;
}

// 对目标用户执行所有配置群的 Telegram 封禁/预封，逐群结果数组返回。
// 用户在群内时 banChatMember 会把人移出并封禁；用户不在群内但 Telegram 可识别时，会加入群封禁列表（预封）。
// bot 不在群 / 没权限 / Telegram 无法识别用户时，单群失败不影响其它群；串行避免 Telegram API 限流。
// 返回 [{ groupId, userId, ok, error, memberProbe }]
async function banUserFromAllGroups(userId, options = {}) {
	const results = [];
	for (const groupId of GROUP_IDS) {
		const memberProbe = options.probeMembership
			? await probeTargetMemberBeforeBan(groupId, userId)
			: null;
		const r = await banUserFromGroup(groupId, userId, { revokeMessages: options.revokeMessages !== false });
		results.push({ groupId, userId: String(userId), ok: r.ok, error: r.error, retried: r.retried === true, memberProbe });
	}
	return results;
}

// 把用户从所有配置群解除 Telegram 原生/手动封禁，逐群结果数组返回。
// 调用方必须先确认目标不在 D1 黑名单；管理层命中 D1 时应先成功移除记录。
// 本函数本身不修改 D1，也绝不调用封禁接口。
async function unbanUserFromAllGroups(userId) {
	const results = [];
	for (const groupId of GROUP_IDS) {
		try {
			const r = await unbanUser(userId, groupId);
			results.push({
				groupId,
				userId: String(userId),
				ok: r?.ok === true,
				error: r?.ok === true ? null : (r?.description || r?.error || '未知错误')
			});
		} catch (error) {
			results.push({ groupId, userId: String(userId), ok: false, error: error.message || String(error) });
		}
	}
	return results;
}

// 渲染单个用户多群踢人结果为简短 HTML 文案
// 把 Telegram API 的英文错误描述翻译成中文 + 解决建议
// description 是 banChatMember/deleteMessage 等 API 在失败时返回的 description 字段
function isTelegramUserLookupError(description) {
	const lower = String(description || '').toLowerCase();
	return lower.includes('participant_id_invalid') || lower.includes('user_id_invalid');
}

function isTelegramUserUnresolvableError(description) {
	const lower = String(description || '').toLowerCase();
	return isTelegramUserLookupError(lower) || lower.includes('user not found');
}

function isPureTgid(value) {
	return /^\d+$/.test(String(value || ''));
}

function classifyMemberProbeStatus(status) {
	const normalized = String(status || '').toLowerCase();
	if (normalized === 'member') return { state: 'in_group', label: '在群内（普通成员）' };
	if (normalized === 'restricted') return { state: 'in_group', label: '在群内（受限成员）' };
	if (normalized === 'administrator') return { state: 'admin', label: '在群内（管理员）' };
	if (normalized === 'creator') return { state: 'admin', label: '在群内（群主）' };
	if (normalized === 'left') return { state: 'not_in_group', label: '不在群内' };
	if (normalized === 'kicked') return { state: 'already_banned', label: '已在群封禁列表' };
	return { state: 'unknown', label: status ? `状态未知（${status}）` : '状态未知' };
}

async function probeTargetMemberBeforeBan(groupId, userId) {
	if (!isPureTgid(userId)) {
		return { ok: false, state: 'invalid', label: 'TGID 格式错误', error: 'invalid tgid' };
	}

	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: groupId, user_id: Number(userId) })
		});
		const result = await response.json();
		if (response.ok && result?.ok && result.result) {
			const classified = classifyMemberProbeStatus(result.result.status);
			return {
				ok: true,
				state: classified.state,
				label: classified.label,
				status: result.result.status,
				user: result.result.user || null
			};
		}
		const error = result?.description || `HTTP ${response.status}`;
		if (isTelegramUserUnresolvableError(error)) {
			return { ok: false, state: 'unresolvable', label: 'Telegram 无法在该群识别此 TGID', error };
		}
		const { 中文 } = translateTelegramError(error, { userId, retryCommand: '/ban 或 /spam' });
		return { ok: false, state: 'unknown', label: `成员状态查询失败：${中文}`, error };
	} catch (error) {
		return { ok: false, state: 'unknown', label: `成员状态查询异常：${error.message || String(error)}`, error: error.message || String(error) };
	}
}

function translateTelegramError(description, options = {}) {
	if (!description) return { 中文: '未知错误', 建议: '查看 Worker 日志获取详情' };
	const desc = String(description);
	const lower = desc.toLowerCase();
	const isUnbanAction = options.action === 'unban';

	// 更具体的错误码先匹配（Telegram 有时同时携带多个特征）
	if (lower.includes('chat_admin_required')) {
		return isUnbanAction
			? { 中文: 'bot 必须是群管理员', 建议: '把 bot 设为群管理员，并打开"封禁用户"权限；Telegram 将群解封也归在该权限下' }
			: { 中文: 'bot 必须是群管理员', 建议: '把 bot 设为群管理员，并打开"封禁用户"和"删除消息"权限' };
	}
	if (lower.includes("message can't be deleted") || lower.includes("can't be deleted for everyone")) {
		return { 中文: '该消息无法删除', 建议: '消息可能超过 48 小时或不属于 bot 可删除范围；可手动删除' };
	}
	if (lower.includes('message to delete not found')) {
		return { 中文: '消息已不存在', 建议: '消息可能已被其他人删除，无需操作' };
	}
	if (lower.includes('user is not a member') || lower.includes('user_not_participant')) {
		return isUnbanAction
			? { 中文: '用户未在该群中', 建议: '该用户可能未被该群封禁或已不在群内，本次群解封请求无影响' }
			: { 中文: '用户不在该群中', 建议: '该用户当前不是群成员；若 Telegram 接受封禁请求，则会表现为预封，禁止后续进群' };
	}
	if (lower.includes('peer_id_invalid') || lower.includes('chat_id_invalid')) {
		return { 中文: '群 ID 无效', 建议: '检查 GROUP_ID 环境变量配置，群组 ID 应为负数（如 -1001234567890）' };
	}

	if (lower.includes('not enough rights') || lower.includes('not enough privileges')) {
		return isUnbanAction
			? { 中文: 'bot 权限不足', 建议: '把 bot 设为群管理员，并打开"封禁用户"权限；Telegram 将群解封也归在该权限下' }
			: { 中文: 'bot 权限不足', 建议: '把 bot 设为群管理员，并打开"封禁用户"权限' };
	}
	if (lower.includes('bot is not a member') || lower.includes('chat not found')) {
		return { 中文: 'bot 不在该群', 建议: '请重新把 bot 拉进该群并设为管理员' };
	}
	if (lower.includes("can't restrict self") || lower.includes('user is an administrator')) {
		return isUnbanAction
			? { 中文: '目标用户是群管理员', 建议: '该用户在此群是管理员，通常无需通过 bot 解封；如仍无法加入，请在该群手动检查管理员身份、封禁列表或入群限制' }
			: { 中文: '目标用户是群管理员', 建议: '先在群里降级或撤销该用户的管理员身份再踢' };
	}
	if (lower.includes('user not found')) {
		if (isPureTgid(options.userId)) {
			const retryCommand = options.retryCommand || '/ban 或 /spam';
			if (isUnbanAction) {
				return {
					中文: 'Telegram 当前无法识别该 TGID',
					建议: `D1 黑名单资格检查结果不受影响；Telegram 无法对该 TGID 执行群解封。若该用户仍无法进群，请在对应群封禁列表手动检查，或稍后重试 ${retryCommand}。`
				};
			}
			return {
				中文: 'Telegram 当前无法识别该 TGID',
				建议: `D1 黑名单记录不受影响；该用户若后续进群/发言仍会被黑名单拦截。可稍后重试 ${retryCommand}，或等待用户进群后再由系统自动拦截。`
			};
		}
		return { 中文: 'Telegram 当前无法识别该用户', 建议: '确认 TGID 是否为纯数字，或等待用户进群后再处理' };
	}
	if (isTelegramUserLookupError(lower)) {
		if (isPureTgid(options.userId)) {
			const retryCommand = options.retryCommand || '/ban 或 /spam';
			if (isUnbanAction) {
				return {
					中文: 'Telegram 当前无法识别该 TGID',
					建议: `D1 黑名单资格检查结果不受影响；Telegram 无法对该 TGID 执行群解封。若该用户仍无法进群，请在对应群封禁列表手动检查，或稍后重试 ${retryCommand}。`
				};
			}
			return {
				中文: 'Telegram 当前无法识别该 TGID',
				建议: `D1 黑名单记录不受影响；该用户若后续进群/发言仍会被黑名单拦截。可稍后重试 ${retryCommand}，或等待用户进群后再由系统自动拦截。`
			};
		}
		return { 中文: 'TGID 格式错误', 建议: '检查 TGID 是否为纯数字' };
	}
	if (lower.includes('forbidden') && lower.includes('blocked')) {
		return { 中文: '用户拉黑了 bot', 建议: '此情况不影响 Telegram 群封禁/预封执行' };
	}
	if (lower.includes('flood') || lower.includes('too many requests')) {
		return { 中文: 'Telegram 限流', 建议: '稍后重试，或减小批量大小' };
	}
	// 兜底：原文返回
	return { 中文: desc, 建议: '查看 Worker 日志和 Telegram 文档' };
}

function isTelegramPermissionError(description) {
	const lower = String(description || '').toLowerCase();
	return lower.includes('chat_admin_required') ||
		lower.includes('not enough rights') ||
		lower.includes('not enough privileges') ||
		lower.includes("can't restrict self") ||
		lower.includes('user is an administrator');
}

function getBanResultStats(banResults) {
	const total = banResults.length;
	const okCount = banResults.filter((r) => r.ok).length;
	const failed = banResults.filter((r) => !r.ok);
	return {
		total,
		okCount,
		failCount: total - okCount,
		lookupFailCount: failed.filter((r) => isTelegramUserUnresolvableError(r.error)).length,
		permissionFailCount: failed.filter((r) => isTelegramPermissionError(r.error)).length
	};
}

function formatBanSuccessResult(r) {
	const state = r?.memberProbe?.state;
	if (state === 'in_group') return '已封禁并移出群聊';
	if (state === 'not_in_group') return '已加入群封禁列表（预封，禁止后续进群）';
	if (state === 'already_banned') return '已确认仍在群封禁列表';
	if (state === 'admin') return 'Telegram 已接受封禁请求';
	return 'Telegram 已接受封禁/预封请求';
}

function formatMemberProbeLine(probe) {
	if (!probe) return '';
	return `\n     封禁前状态：${escapeHtml(probe.label || '状态未知')}`;
}

function formatTargetFromBanResults(tgid, banResults) {
	const idStr = String(tgid);
	for (const result of banResults || []) {
		const user = result?.memberProbe?.user;
		if (user && user.id) {
			return `${formatUserMention(user)} <code>${escapeHtml(idStr)}</code>`;
		}
	}
	return `<code>${escapeHtml(idStr)}</code>`;
}

// 渲染单用户全群 Telegram 封禁/预封结果(详细版)：包含群名、群ID、封禁前状态、失败原因和建议
// banResults: [{ groupId, ok, error }] 来自 banUserFromAllGroups
// 返回多行 HTML 文案，每行一个群的具体结果
async function renderBanResultsDetail(banResults, chatInfoCache = null, options = {}) {
	const { okCount, total, failCount, lookupFailCount, permissionFailCount } = getBanResultStats(banResults);
	const lines = [];
	const cache = chatInfoCache || new Map();

	if (total === 0) {
		return 'ℹ️ 未配置 GROUP_ID，未执行 Telegram 群封禁/预封。';
	}
	if (okCount === total) {
		lines.push(`✅ <b>Telegram 群封禁/预封成功 ${okCount}/${total}</b>`);
	} else if (okCount === 0) {
		lines.push(`⚠️ <b>D1 黑名单已生效；Telegram 群封禁/预封成功 0/${total}</b>`);
	} else {
		lines.push(`✅ <b>Telegram 群封禁/预封成功 ${okCount}/${total}</b>（${failCount} 个失败）`);
	}
	if (banResults.some((r) => r.ok && r.memberProbe?.state === 'not_in_group')) {
		lines.push('ℹ️ 目标不在群内时，成功表示已加入该群封禁列表（预封），不是从群里踢出了在线成员。');
	}
	if (lookupFailCount > 0) {
		lines.push('ℹ️ Telegram 无法识别 TGID 不代表 D1 黑名单失败；后续进群/发言仍会按 D1 黑名单拦截。');
	} else if (okCount === 0 && permissionFailCount === total) {
		lines.push('ℹ️ 全部配置群都因权限或管理员身份失败，请重点检查 bot 的封禁权限和目标是否为管理员。');
	}

	// 同一批回执内每个群只拉一次群名，避免 用户数 × 群数 重复 getChat。
	await mapWithConcurrency(
		[...new Set(banResults.map((r) => String(r.groupId)))],
		BATCH_USER_PROFILE_CONCURRENCY,
		async (groupId) => {
			if (cache.has(groupId)) return;
			try {
				const info = await getChatInfoFromId(groupId);
				cache.set(groupId, info?.title || '未知群名');
			} catch (e) {
				// 拉群名失败不影响主流程
				cache.set(groupId, '未知群名');
			}
		}
	);

	const detailLines = banResults.map((r) => {
			const title = cache.get(String(r.groupId)) || '未知群名';
			const safeTitle = escapeHtml(title);
			const safeId = escapeHtml(String(r.groupId));
			if (r.ok) {
				return `  ✅ <b>${safeTitle}</b> <code>${safeId}</code>\n     结果：${escapeHtml(formatBanSuccessResult(r))}${formatMemberProbeLine(r.memberProbe)}`;
			}
			const { 中文, 建议 } = translateTelegramError(r.error, {
				userId: r.userId || options.userId,
				retryCommand: options.retryCommand
			});
			return `  ❌ <b>${safeTitle}</b> <code>${safeId}</code>${formatMemberProbeLine(r.memberProbe)}\n     原因：${escapeHtml(中文)}\n     建议：${escapeHtml(建议)}`;
		});

	if (!options.compactSpacing) lines.push('');
	lines.push(...detailLines);
	return lines.join('\n');
}

// 简短版（用于群内闪屏，不能太长）
function renderBanResults(banResults) {
	const { okCount, total, lookupFailCount, permissionFailCount } = getBanResultStats(banResults);
	if (total === 0) return 'ℹ️ 未配置 GROUP_ID，未执行 Telegram 群封禁';
	if (okCount === total) return `✅ Telegram封禁/预封成功 ${okCount}/${total} 个配置群`;
	if (okCount === 0 && lookupFailCount === total) return '⚠️ D1已生效，Telegram暂无法识别TGID';
	if (okCount === 0 && permissionFailCount === total) return `⚠️ Telegram封禁失败 0/${total}（检查bot封禁权限）`;
	if (okCount === 0) return `⚠️ Telegram封禁/预封失败 0/${total}`;
	return `✅ Telegram封禁/预封成功 ${okCount}/${total} 个配置群`;
}

// 渲染单用户全群 Telegram 解封结果(详细版)
async function renderUnbanResultsDetail(unbanResults, chatInfoCache = null, options = {}) {
	const okCount = unbanResults.filter((r) => r.ok).length;
	const total = unbanResults.length;
	const lookupFailCount = unbanResults.filter((r) => !r.ok && isTelegramUserUnresolvableError(r.error)).length;
	const lines = [];
	const cache = chatInfoCache || new Map();

	if (total === 0) {
		return 'ℹ️ 未配置 GROUP_ID，未执行 Telegram 群解封。';
	}
	if (okCount === total) {
		lines.push(`✅ <b>已解除全部 ${total} 个配置群的 Telegram 封禁</b>`);
	} else if (okCount === 0 && lookupFailCount === total) {
		lines.push(`⚠️ <b>全部 ${total} 个配置群 Telegram 解封失败：Telegram 当前无法识别该 TGID</b>`);
	} else if (okCount === 0) {
		lines.push(`⚠️ <b>全部 ${total} 个配置群 Telegram 解封失败</b>`);
	} else {
		lines.push(`✅ <b>已解除 ${okCount}/${total} 个配置群的 Telegram 封禁</b>（${total - okCount} 个失败）`);
	}

	await mapWithConcurrency(
		[...new Set(unbanResults.map((r) => String(r.groupId)))],
		BATCH_USER_PROFILE_CONCURRENCY,
		async (groupId) => {
			if (cache.has(groupId)) return;
			try {
				const info = await getChatInfoFromId(groupId);
				cache.set(groupId, info?.title || '未知群名');
			} catch (_) {
				cache.set(groupId, '未知群名');
			}
		}
	);

	const detailLines = unbanResults.map((r) => {
		const title = cache.get(String(r.groupId)) || '未知群名';
		const safeTitle = escapeHtml(title);
		const safeId = escapeHtml(String(r.groupId));
		if (r.ok) {
			return `  ✅ <b>${safeTitle}</b> <code>${safeId}</code>`;
		}
		const { 中文, 建议 } = translateTelegramError(r.error, {
			action: 'unban',
			userId: r.userId || options.userId,
			retryCommand: options.retryCommand || '/unban'
		});
		return `  ❌ <b>${safeTitle}</b> <code>${safeId}</code>\n     原因：${escapeHtml(中文)}\n     建议：${escapeHtml(建议)}`;
	});

	if (!options.compactSpacing) lines.push('');
	lines.push(...detailLines);
	return lines.join('\n');
}

// 简短版（用于群内闪屏）
function renderUnbanResults(unbanResults) {
	const okCount = unbanResults.filter((r) => r.ok).length;
	const total = unbanResults.length;
	const lookupFailCount = unbanResults.filter((r) => !r.ok && isTelegramUserUnresolvableError(r.error)).length;
	if (total === 0) return 'ℹ️ 未配置 GROUP_ID，未执行群解封';
	if (okCount === total) return `✅ 已解除全部 ${total} 个群的 Telegram 封禁`;
	if (okCount === 0 && lookupFailCount === total) return '⚠️ D1检查通过，Telegram暂无法识别TGID';
	if (okCount === 0) return `⚠️ 全部 ${total} 个群解封失败（请检查 bot 是否为群管理员）`;
	return `✅ 已解除 ${okCount}/${total} 个群的 Telegram 封禁（${total - okCount} 个失败）`;
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

function isAnonymousAdminMessage(message) {
	const sentAsCurrentGroup = message?.chat?.type !== 'private'
		&& isConfiguredGroup(message?.chat?.id)
		&& String(message?.sender_chat?.id || '') === String(message?.chat?.id || '');
	if (!sentAsCurrentGroup) return false;
	const fromId = String(message?.from?.id || '');
	return !message?.from || fromId === ANON_ADMIN_BOT_ID;
}

function getMessageActorId(message) {
	if (isAnonymousAdminMessage(message)) {
		return `anonymous_admin:${message.chat.id}`;
	}
	return String(message?.from?.id || '');
}

function formatMessageActorMention(message) {
	if (isAnonymousAdminMessage(message)) {
		const title = message.chat?.title || message.sender_chat?.title || '当前群组';
		return `<b>匿名管理员</b>\n🏷️ 匿名身份:<b>${escapeHtml(title)}</b> <code>${escapeHtml(String(message.chat.id))}</code>`;
	}
	return formatUserMention(message?.from) || `<code>${escapeHtml(String(message?.from?.id || '未知'))}</code>`;
}

function classifyMessageOperatorRole(message, fallback = '管理员') {
	if (isAnonymousAdminMessage(message)) return '匿名管理员';
	return classifyOperatorRole(message?.from?.id, fallback);
}

async function checkMessageOperatorIsAdmin(message, userId) {
	if (isAnonymousAdminMessage(message)) {
		console.log(`[管理员鉴权] 匿名管理员在群 ${message.chat.id} 发出命令 ✅`);
		return true;
	}
	return checkIfUserIsAdmin(userId);
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

// 高级管理员：主人、副主人、SUPER_ADMINS。
// 这三类角色保留原有全部管理命令和跨群操作权限。
function isPrivilegedManager(userId) {
	const idStr = String(userId || '');
	return isOwner(idStr) || isSuperAdmin(idStr);
}

// 只检查用户是否为“指定当前群”的 Telegram 管理员。
// 普通管理员的 /ban、/spam 必须使用该鉴权，禁止遍历其它 GROUP_IDS 借权。
async function checkIfUserIsAdminInGroup(userId, groupId) {
	const userIdStr = String(userId || '');
	const groupIdStr = String(groupId || '');
	if (!userIdStr || !isConfiguredGroup(groupIdStr)) return false;

	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatAdministrators`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: groupIdStr }),
		});
		const result = await response.json();
		if (!response.ok || !result.ok || !Array.isArray(result.result)) {
			console.log(`[当前群鉴权] 群 ${groupIdStr} 查询失败: ${result.description || `HTTP ${response.status}`}`);
			return false;
		}
		const hit = result.result.find((member) => member?.user && String(member.user.id) === userIdStr);
		if (hit) {
			console.log(`[当前群鉴权] 用户 ${userIdStr} 在当前群 ${groupIdStr} 是 ${hit.status} ✅`);
			return true;
		}
		console.log(`[当前群鉴权] 用户 ${userIdStr} 不是当前群 ${groupIdStr} 的管理员`);
		return false;
	} catch (error) {
		console.error(`[当前群鉴权] 群 ${groupIdStr} 查询异常:`, error);
		return false;
	}
}

// /ban、/spam 专用权限：
// - 主人/副主人/超级管理员保持原权限；
// - 匿名管理员仅能在其当前配置群使用；
// - 普通 Telegram 管理员必须是当前发令群的管理员，私聊不放行。
async function checkMessageOperatorCanBan(message, userId) {
	if (isPrivilegedManager(userId)) return true;
	if (isAnonymousAdminMessage(message)) {
		console.log(`[当前群鉴权] 匿名管理员在群 ${message.chat.id} 使用封禁命令 ✅`);
		return true;
	}
	if (message?.chat?.type === 'private') return false;
	return checkIfUserIsAdminInGroup(userId, message?.chat?.id);
}

function shouldSilenceAuthorizedGroupCommand(message) {
	return message?.chat?.type !== 'private'
		&& isConfiguredGroup(message?.chat?.id)
		&& !isPrimaryOwner(getMessageActorId(message));
}

// 仅用于无需管理权限的公共命令（如 /start、无参数 /unban）：
// 判断发令者是否属于“非第一主人”的当前群管理员/高级管理员。
async function isNonPrimaryConfiguredGroupManager(message, userId) {
	if (!shouldSilenceAuthorizedGroupCommand(message)) return false;
	if (isPrivilegedManager(userId) || isAnonymousAdminMessage(message)) return true;
	if (isBotOperator(message?.from)) return false;
	return checkIfUserIsAdminInGroup(userId, message?.chat?.id);
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
				if (!r?.ok) console.error(`[审计通知] 私聊主人${id}失败:${r?.description || r?.error || '未知'}`);
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
	if (roleLabel === '匿名管理员') {
		return `🔔 <b>匿名管理员操作通知</b>\n👤 操作人:${operatorMention}\n📍 来源:${escapeHtml(sourceLabel)}\n\n${detailText}`;
	}
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
function telegramMessageLength(text) {
	return sanitizeTelegramText(text).length;
}

function decodeBasicTelegramHtmlEntities(value) {
	return String(value || '')
		.replace(/&quot;/g, '"')
		.replace(/&gt;/g, '>')
		.replace(/&lt;/g, '<')
		.replace(/&amp;/g, '&');
}

function splitEscapedPlainTelegramText(value, maxLength) {
	const chunks = [];
	let current = '';
	for (const char of Array.from(sanitizeTelegramText(value))) {
		const escaped = escapeHtml(char);
		if (current && telegramMessageLength(current + escaped) > maxLength) {
			chunks.push(current);
			current = '';
		}
		current += escaped;
	}
	if (current || chunks.length === 0) chunks.push(current);
	return chunks;
}

function splitOversizedTelegramHtmlBlock(block, maxLength) {
	const plain = decodeBasicTelegramHtmlEntities(String(block || '').replace(/<[^>]+>/g, ''));
	return splitEscapedPlainTelegramText(plain, maxLength);
}

function splitTelegramHtmlBlocks(text, maxLength = TELEGRAM_SAFE_MESSAGE_LENGTH) {
	const normalized = sanitizeTelegramText(text);
	if (telegramMessageLength(normalized) <= maxLength) return [normalized];

	const chunks = [];
	let current = '';
	const append = (block) => {
		const candidate = current ? `${current}\n\n${block}` : block;
		if (telegramMessageLength(candidate) <= maxLength) {
			current = candidate;
			return;
		}
		if (current) chunks.push(current);
		current = block;
	};

	for (const block of normalized.split(/\n{2,}/)) {
		const pieces = telegramMessageLength(block) <= maxLength
			? [block]
			: splitOversizedTelegramHtmlBlock(block, maxLength);
		for (const piece of pieces) append(piece);
	}
	if (current || chunks.length === 0) chunks.push(current);
	return chunks;
}

function buildTelegramAtomicHtmlBlock(parts) {
	return (parts || [])
		.filter((part) => part !== null && part !== undefined && String(part) !== '')
		.map((part) => sanitizeTelegramText(part))
		.join('\n')
		.replace(/\n{2,}/g, '\n');
}

async function sendTelegramMessageChunks(chatId, text, replyMarkup = null) {
	const chunks = splitTelegramHtmlBlocks(text);
	let lastResult = { ok: true };
	for (let index = 0; index < chunks.length; index += 1) {
		lastResult = await sendTelegramMessage(chatId, chunks[index], index === chunks.length - 1 ? replyMarkup : null);
		if (!lastResult?.ok) return lastResult;
	}
	return lastResult;
}

async function replyToAdmin(message, ctx, { flashText, detailText, isInGroup, notifySecondaryOwners = false, replyMarkup = null }) {
	const chatId = message.chat.id;
	const triggerIdStr = getMessageActorId(message);
	const operator = formatMessageActorMention(message);
	const targets = getOwnerNotifyTargets(notifySecondaryOwners);

	if (!isInGroup) {
		await sendTelegramMessageChunks(chatId, detailText, replyMarkup);
		const notifyTargets = targets.filter((oid) => oid !== triggerIdStr);
		if (notifyTargets.length) {
			const role = classifyMessageOperatorRole(message, '管理员');
			await mapWithConcurrency(notifyTargets, BATCH_USER_PROFILE_CONCURRENCY, async (oid) => {
				const auditText = renderAuditNotification(operator, detailText, '私聊', role);
				const result = await sendTelegramMessageChunks(oid, auditText);
				if (!result?.ok) console.error(`[审计通知] 私聊主人${oid}失败:${result?.description || result?.error || '未知'}`);
			});
		}
		return;
	}

	// 第一主人保留现有群聊回执；其余有权限角色在 GROUP_ID 群内只执行并私聊通知，群内零回执。
	// 未配置 OWNER_IDS 时保留原有群闪屏兜底，避免执行结果无处投递。
	if (!shouldSilenceAuthorizedGroupCommand(message) || targets.length === 0) {
		await sendFlashMessage(chatId, flashText, ctx);
	}
	if (targets.length) {
		const chatTitle = message.chat?.title ? `${message.chat.title}（<code>${escapeHtml(String(chatId))}</code>）` : `<code>${escapeHtml(String(chatId))}</code>`;
		await mapWithConcurrency(targets, BATCH_USER_PROFILE_CONCURRENCY, async (oid) => {
			const auditText = (triggerIdStr === oid)
				? `🔔 <b>主人操作通知</b>\n👤 操作人:${operator}（你自己）\n📍 来源:${chatTitle}\n\n${detailText}`
				: renderAuditNotification(operator, detailText, chatTitle, classifyMessageOperatorRole(message, '群管理员'));
			const result = await sendTelegramMessageChunks(oid, auditText, replyMarkup);
			if (!result?.ok) console.error(`[审计通知] 私聊主人${oid}失败:${result?.description || result?.error || '未知'}`);
		});
	}
}

// 已完成权限校验后的通用结果路由：
// 非第一主人在配置群执行命令时群内零回执，完整结果仅发第一主人；
// 第一主人群聊以及所有私聊路径继续使用原来的直接回复行为。
async function sendAuthorizedCommandResult(message, ctx, { flashText, detailText, replyMarkup = null }) {
	if (shouldSilenceAuthorizedGroupCommand(message)) {
		await replyToAdmin(message, ctx, {
			flashText,
			detailText,
			isInGroup: true,
			replyMarkup,
		});
		return;
	}
	await sendTelegramMessage(message.chat.id, detailText, replyMarkup);
}

// /ban、/spam、/unban、/job 的参数/环境校验回执：
// 非第一主人群聊不发机器人回执，只把完整提示给主人；第一主人仍保持原来的群闪屏，私聊仍直接回复发令者。
async function sendModerationCommandFeedback(message, ctx, { flashText, detailText = flashText }) {
	if (shouldSilenceAuthorizedGroupCommand(message)) {
		await replyToAdmin(message, ctx, {
			flashText,
			detailText,
			isInGroup: true,
		});
		return;
	}
	if (message?.chat?.type !== 'private') {
		await sendFlashMessage(message.chat.id, flashText, ctx);
		return;
	}
	await sendTelegramMessage(message.chat.id, detailText);
}

// 批量添加：串行写 D1；重复 TGID 归入 exists，不作为异常。
function normalizeBatchMutationIds(ids) {
	return [...new Set((ids || []).map((id) => String(id || '').trim()).filter(isPureTgid))];
}

function chunkBatchItems(items, size = D1_BATCH_MUTATION_SIZE) {
	const chunks = [];
	for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
	return chunks;
}

// 批量添加：每 20 个 TGID 一条多行 SQL；RETURNING 精确区分新增与已存在。
async function addManyToBlacklist(ids, env, options = {}) {
	const results = { success: [], exists: [], failed: [] };
	const uniqueIds = normalizeBatchMutationIds(ids);
	if (!env.DB) {
		results.failed.push(...uniqueIds.map((id) => ({ id, msg: '❌ 未绑定 D1 存储空间' })));
		return results;
	}
	if (uniqueIds.length === 0) return results;

	await ensureD1Table(env);
	const reason = options.reason ?? null;
	const by = options.by != null ? String(options.by) : null;
	const note = normalizeActionNote(options.note) || null;
	const at = new Date().toISOString();

	for (const chunk of chunkBatchItems(uniqueIds)) {
		try {
			const valuesSql = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ');
			const params = chunk.flatMap((id) => [id, reason, by, at, note]);
			const response = await env.DB
				.prepare(`INSERT OR IGNORE INTO blacklist (id, reason, by_user, at, note) VALUES ${valuesSql} RETURNING id`)
				.bind(...params)
				.all();
			const inserted = new Set((response?.results || []).map((row) => String(row.id)));
			for (const id of chunk) {
				if (inserted.has(id)) results.success.push(id);
				else results.exists.push(id);
			}
		} catch (error) {
			console.error('批量添加黑名单时出错:', error);
			results.failed.push(...chunk.map((id) => ({ id, msg: `❌ 添加黑名单失败: ${error.message || error}` })));
		}
	}
	return results;
}

// 批量 /unban 资格检查：
// - 普通权限只读检查，D1 命中即拒绝；
// - 第一主人、副主人、超级管理员可显式传 allowD1Removal，先移除 D1 再允许 Telegram 解封。
// 查询或移除失败时严格拒绝对应目标，任何分支都不调用 Telegram 封禁接口。
async function checkManyUnbanEligibility(ids, env, options = {}) {
	const results = { eligible: [], blacklisted: [], failed: [], d1Removed: [], d1RemovalFailed: [] };
	const uniqueIds = normalizeBatchMutationIds(ids);
	if (!env.DB) {
		results.failed.push(...uniqueIds.map((id) => ({ id, msg: '❌ 未绑定 D1 存储空间，无法确认解封资格' })));
		return results;
	}
	if (uniqueIds.length === 0) return results;

	try {
		await ensureD1Table(env);
	} catch (error) {
		results.failed.push(...uniqueIds.map((id) => ({ id, msg: `❌ 无法确认 D1 黑名单状态: ${error.message || error}` })));
		return results;
	}

	for (const chunk of chunkBatchItems(uniqueIds)) {
		try {
			const placeholders = chunk.map(() => '?').join(', ');
			const response = await env.DB
				.prepare(`SELECT id FROM blacklist WHERE id IN (${placeholders})`)
				.bind(...chunk)
				.all();
			const blocked = new Set((response?.results || []).map((row) => String(row.id)));
			for (const id of chunk) {
				if (blocked.has(id)) results.blacklisted.push(id);
				else results.eligible.push(id);
			}
		} catch (error) {
			console.error('批量检查 /unban D1 资格时出错:', error);
			results.failed.push(...chunk.map((id) => ({ id, msg: `❌ 无法确认 D1 黑名单状态: ${error.message || error}` })));
		}
	}
	if (options.allowD1Removal !== true || results.blacklisted.length === 0) {
		return results;
	}

	const removal = await removeManyFromBlacklist(results.blacklisted, env);
	const eligibleSet = new Set([...results.eligible, ...removal.success, ...removal.notFound]);
	results.d1Removed = [...removal.success];
	results.d1RemovalFailed = removal.failed.map((item) => String(item.id));
	results.eligible = uniqueIds.filter((id) => eligibleSet.has(id));
	results.blacklisted = [];
	for (const failure of removal.failed) {
		results.failed.push({
			id: String(failure.id),
			msg: `❌ D1 黑名单移除失败，已拒绝解封: ${failure.msg || '未知错误'}`
		});
	}
	return results;
}

// 批量移除：每 20 个 TGID 一条 DELETE ... RETURNING，无需逐条预查询。
async function removeManyFromBlacklist(ids, env) {
	const results = { success: [], notFound: [], failed: [] };
	const uniqueIds = normalizeBatchMutationIds(ids);
	if (!env.DB) {
		results.failed.push(...uniqueIds.map((id) => ({ id, msg: '❌ 未绑定 D1 存储空间' })));
		return results;
	}
	if (uniqueIds.length === 0) return results;

	await ensureD1Table(env);
	for (const chunk of chunkBatchItems(uniqueIds)) {
		try {
			const placeholders = chunk.map(() => '?').join(', ');
			const response = await env.DB
				.prepare(`DELETE FROM blacklist WHERE id IN (${placeholders}) RETURNING id`)
				.bind(...chunk)
				.all();
			const removed = new Set((response?.results || []).map((row) => String(row.id)));
			for (const id of chunk) {
				if (removed.has(id)) results.success.push(id);
				else results.notFound.push(id);
			}
		} catch (error) {
			console.error('批量移除黑名单时出错:', error);
			results.failed.push(...chunk.map((id) => ({ id, msg: `❌ 移除黑名单失败: ${error.message || error}` })));
		}
	}
	return results;
}

// 渲染批量添加结果
// banSummary（可选）：{ success, banOkAll, banPartial, banFailedAll }
//   表示对每个加黑成功的用户做 Telegram 群封禁/预封后的统计：完全成功 / 部分成功 / 全部失败
function renderBatchAddResult(results, invalid, banSummary, userProfiles = null) {
	const lines = ['✅ <b>批量添加完成</b>', ''];
	lines.push(`✅ 成功: ${results.success.length}`);
	if (results.exists.length) lines.push(`⚠️ 已存在: ${results.exists.length}`);
	if (invalid.length) lines.push(`❌ 格式错误: ${invalid.length}`);
	if (results.failed.length) lines.push(`❌ 失败: ${results.failed.length}`);

	if (banSummary && banSummary.success > 0) {
		lines.push('', '<b>Telegram 群封禁/预封结果</b>:');
		lines.push(`✅ 全部配置群成功: ${banSummary.banOkAll}`);
		if (banSummary.banPartial) lines.push(`⚠️ 部分配置群成功: ${banSummary.banPartial}`);
		if (banSummary.banFailedAll) lines.push(`❌ 全部配置群失败: ${banSummary.banFailedAll}`);
	}

	lines.push('', '<b>详情</b>:');
	for (const id of results.success) lines.push(`✅ ${formatBatchUserTarget(id, userProfiles)} 已加入`);
	for (const id of results.exists) lines.push(`⚠️ ${formatBatchUserTarget(id, userProfiles)} 已存在`);
	for (const id of invalid) lines.push(`❌ <code>${escapeHtml(id)}</code> 格式错误`);
	for (const f of results.failed) lines.push(`❌ ${formatBatchUserTarget(f.id, userProfiles)} ${escapeHtml(f.msg)}`);

	return lines.join('\n');
}

// 渲染批量移除结果
function renderBatchRemoveResult(results, invalid, userProfiles = null) {
	const lines = ['✅ <b>批量移除完成</b>', ''];
	lines.push(`✅ 成功: ${results.success.length}`);
	if (results.notFound.length) lines.push(`⚠️ 不在黑名单: ${results.notFound.length}`);
	if (invalid.length) lines.push(`❌ 格式错误: ${invalid.length}`);
	if (results.failed.length) lines.push(`❌ 失败: ${results.failed.length}`);

	lines.push('', '<b>详情</b>:');
	for (const id of results.success) lines.push(`✅ ${formatBatchUserTarget(id, userProfiles)} 已移除`);
	for (const id of results.notFound) lines.push(`⚠️ ${formatBatchUserTarget(id, userProfiles)} 不在黑名单`);
	for (const id of invalid) lines.push(`❌ <code>${escapeHtml(id)}</code> 格式错误`);
	for (const f of results.failed) lines.push(`❌ ${formatBatchUserTarget(f.id, userProfiles)} ${escapeHtml(f.msg)}`);

	return lines.join('\n');
}

function renderBatchUnbanEligibilityResult(results, invalid, userProfiles = null) {
	const lines = ['🔎 <b>批量解封资格检查完成</b>', ''];
	lines.push(`✅ 可执行 Telegram 解封: ${results.eligible.length}`);
	if (results.blacklisted.length) lines.push(`⛔ D1 黑名单拒绝: ${results.blacklisted.length}`);
	if (invalid.length) lines.push(`❌ 格式错误: ${invalid.length}`);
	if (results.failed.length) lines.push(`❌ D1 检查失败: ${results.failed.length}`);

	lines.push('', '<b>详情</b>:');
	const removedIds = new Set(results.d1Removed || []);
	for (const id of results.eligible) {
		const status = removedIds.has(id)
			? 'D1 黑名单记录已移除，可执行群解封'
			: '不在 D1 黑名单，可执行群解封';
		lines.push(`✅ ${formatBatchUserTarget(id, userProfiles)} ${status}`);
	}
	for (const id of results.blacklisted) lines.push(`⛔ ${formatBatchUserTarget(id, userProfiles)} 在 D1 黑名单，拒绝解封（记录已保留）`);
	for (const id of invalid) lines.push(`❌ <code>${escapeHtml(id)}</code> 格式错误`);
	for (const f of results.failed) lines.push(`❌ ${formatBatchUserTarget(f.id, userProfiles)} ${escapeHtml(f.msg)}`);

	return lines.join('\n');
}

function buildBulkJobId(action) {
	const suffix = Math.random().toString(36).slice(2, 8);
	return `${action}_${Date.now().toString(36)}_${suffix}`;
}

function normalizeBulkJobAction(action) {
	const normalized = String(action || '').trim().toLowerCase();
	if (normalized === 'sa') return 'spam';
	if (normalized === 'be') return 'ban';
	return normalized;
}

function getBulkJobCommand(action) {
	const normalized = normalizeBulkJobAction(action);
	if (normalized === 'spam') return '/spam';
	if (normalized === 'ban') return '/ban';
	if (normalized === 'unban') return '/unban';
	return '';
}

function normalizeBulkJob(row) {
	if (!row?.payload) return null;
	try {
		const payload = JSON.parse(row.payload);
		const action = normalizeBulkJobAction(payload.action || row.type);
		return {
			...payload,
			id: payload.id || row.id,
			action,
			command: getBulkJobCommand(action),
			status: payload.status || row.status || 'unknown'
		};
	} catch (error) {
		console.error('解析批量任务失败:', error);
		return null;
	}
}

function setBulkJobLeaseVersion(job, value) {
	Object.defineProperty(job, '__leaseVersion', {
		value,
		writable: true,
		configurable: true,
		enumerable: false
	});
}

function getNextBulkJobUpdatedAt(expected) {
	const expectedTime = Date.parse(expected || '');
	const minimum = Number.isFinite(expectedTime) ? expectedTime + 1 : 0;
	return new Date(Math.max(Date.now(), minimum)).toISOString();
}

function createBulkJobLeaseLostError(jobId) {
	const error = new Error(`批量任务租约已被其它执行器接管: ${jobId}`);
	error.code = 'BULK_JOB_LEASE_LOST';
	return error;
}

async function saveBulkJob(env, job) {
	await ensureD1Table(env);
	const expectedVersion = job.__leaseVersion || '';
	const now = getNextBulkJobUpdatedAt(expectedVersion);
	job.updatedAt = now;
	const statement = expectedVersion
		? env.DB.prepare('UPDATE batch_jobs SET status = ?, payload = ?, updated_at = ? WHERE id = ? AND updated_at = ?')
			.bind(job.status, JSON.stringify(job), now, job.id, expectedVersion)
		: env.DB.prepare('UPDATE batch_jobs SET status = ?, payload = ?, updated_at = ? WHERE id = ?')
			.bind(job.status, JSON.stringify(job), now, job.id);
	const result = await statement.run();
	if (expectedVersion && Number(result?.meta?.changes || 0) !== 1) {
		throw createBulkJobLeaseLostError(job.id);
	}
	if (expectedVersion) setBulkJobLeaseVersion(job, now);
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

async function acquireBulkJobLease(env, job, leaseOwner) {
	const now = getNextBulkJobUpdatedAt(job.updatedAt);
	const staleBefore = new Date(Date.now() - BULK_TASK_LEASE_MS).toISOString();
	job.status = 'running';
	job.startedAt = job.startedAt || now;
	job.leaseOwner = leaseOwner;
	job.leaseUntil = new Date(Date.now() + BULK_TASK_LEASE_MS).toISOString();
	job.autoRunCount = (Number(job.autoRunCount) || 0) + 1;
	job.updatedAt = now;
	const result = await env.DB
		.prepare(`UPDATE batch_jobs
			SET status = ?, payload = ?, updated_at = ?
			WHERE id = ?
			  AND (
				status IN ('queued', 'failed', 'paused')
				OR (status = 'running' AND updated_at <= ?)
			  )`)
		.bind(job.status, JSON.stringify(job), now, job.id, staleBefore)
		.run();
	if (Number(result?.meta?.changes || 0) !== 1) return null;
	setBulkJobLeaseVersion(job, now);
	return job;
}

function getBulkJobNotifyTargets(message) {
	const targets = getOwnerNotifyTargets(true);
	if (targets.length) return targets;
	if (isAnonymousAdminMessage(message)) return [];
	return message?.from?.id ? [String(message.from.id)] : [];
}

function estimateBulkTaskSubrequests(userCount, groupCount, options = {}) {
	const users = Math.max(0, Number(userCount) || 0);
	const groups = Math.max(1, Number(groupCount) || 1);
	const operations = users * groups;
	const authorizationRequests = Math.max(0, Number(options.authorizationRequests) || 0);
	const profileRequests = options.probeMembership === true && users === 1 ? groups : users;
	const telegramMutationAttempts = 2 * operations;
	const groupInfoRequests = groups;
	const d1MutationBatches = Math.ceil(users / D1_BATCH_MUTATION_SIZE);
	return {
		fixedReserve: BULK_TASK_FIXED_SUBREQUEST_RESERVE,
		authorizationRequests,
		profileRequests,
		telegramMutationAttempts,
		groupInfoRequests,
		d1MutationBatches,
		total: BULK_TASK_FIXED_SUBREQUEST_RESERVE
			+ authorizationRequests
			+ profileRequests
			+ telegramMutationAttempts
			+ groupInfoRequests
			+ d1MutationBatches
	};
}

function shouldUseBulkQueue(userCount, groupCount, options = {}) {
	const users = Math.max(0, Number(userCount) || 0);
	const groups = Math.max(1, Number(groupCount) || 1);
	const operations = users * groups;
	const estimate = estimateBulkTaskSubrequests(users, groups, options);
	return {
		useQueue: users >= BULK_TASK_THRESHOLD
			|| operations > BULK_TASK_SYNC_OPERATION_LIMIT
			|| estimate.total > BULK_TASK_SYNC_SUBREQUEST_BUDGET,
		users,
		groups,
		operations,
		estimate
	};
}

function estimateBulkAuthorizationRequests(message) {
	if (isAnonymousAdminMessage(message)) return 0;
	const actorId = getMessageActorId(message);
	if (isPrivilegedManager(actorId)) return 0;
	return message?.chat?.type !== 'private' && isConfiguredGroup(message?.chat?.id) ? 1 : 0;
}

function createBulkJobPayload(action, ids, invalid, note, message) {
	const now = new Date().toISOString();
	const operator = formatMessageActorMention(message);
	const groupIds = GROUP_IDS.map((id) => String(id));
	const normalizedAction = normalizeBulkJobAction(action);
	const isUnban = normalizedAction === 'unban';
	const budget = shouldUseBulkQueue(ids.length, groupIds.length, {
		probeMembership: !isUnban && ids.length === 1,
		authorizationRequests: estimateBulkAuthorizationRequests(message)
	});
	const job = {
		version: 2,
		id: buildBulkJobId(normalizedAction),
		action: normalizedAction,
		reason: normalizedAction === 'spam' ? 'spam' : (isUnban ? null : 'manual'),
		command: getBulkJobCommand(normalizedAction),
		status: 'queued',
		ids: ids.map((id) => String(id)),
		invalid: (invalid || []).map((id) => String(id)),
		note: normalizeActionNote(note),
		groupIds,
		createdBy: getMessageActorId(message),
		unbanAllowD1Removal: isUnban && isPrivilegedManager(getMessageActorId(message)),
		operator,
		operatorRole: classifyMessageOperatorRole(message, message.chat?.type === 'private' ? '管理员' : '群管理员'),
		sourceChatId: String(message.chat?.id ?? ''),
		sourceChatTitle: message.chat?.title || message.chat?.username || (message.chat?.type === 'private' ? '私聊' : '当前群组'),
		sourceChatType: message.chat?.type || 'unknown',
		notifyTargets: getBulkJobNotifyTargets(message),
		userBatchSize: BULK_TASK_USER_BATCH_SIZE,
		concurrency: BULK_TASK_CONCURRENCY,
		totals: {
			users: ids.length,
			groups: groupIds.length,
			operations: budget.operations,
			invalid: (invalid || []).length,
			estimatedSubrequests: budget.estimate.total,
			subrequestBudget: BULK_TASK_SYNC_SUBREQUEST_BUDGET,
			d1MutationBatches: budget.estimate.d1MutationBatches
		},
		stats: {
			usersProcessed: 0,
			added: 0,
			exists: 0,
			addFailed: 0,
			kickOk: 0,
			kickFailed: 0,
			removed: 0,
			notFound: 0,
			removeFailed: 0,
			unbanEligible: 0,
			unbanBlacklisted: 0,
			unbanCheckFailed: 0,
			unbanOk: 0,
			unbanFailed: 0
		},
		failures: [],
		activeBatch: null,
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
	if (failure.phase === 'unban_blocked') {
		return `⛔ <code>${escapeHtml(failure.userId || '')}</code>: D1 黑名单拒绝解封，记录已保留，未调用 Telegram`;
	}
	const rawError = failure.error || failure.message || '失败';
	const isUnban = failure.phase === 'unban' || failure.phase === 'remove';
	const { 中文, 建议 } = translateTelegramError(rawError, {
		action: isUnban ? 'unban' : undefined,
		userId: failure.userId,
		retryCommand: isUnban ? '/unban' : '/ban 或 /spam'
	});
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
	const action = normalizeBulkJobAction(job.action);
	if (action === 'unban') {
		const eligibilityAware = Object.prototype.hasOwnProperty.call(job?.stats || {}, 'unbanEligible');
		return eligibilityAware ? '仅解封非 D1 黑名单用户(/unban)' : '移出黑名单并群解封(/unban，历史任务)';
	}
	return action === 'spam' ? '举报加黑(/spam)' : '加入黑名单(/ban)';
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
		''
	];
	if (job.activeBatch) {
		lines.push(`当前 20 人批次群操作:${job.activeBatch.operationCursor || 0}/${job.activeBatch.totalOperations || 0}`, '');
	}
	if (job.action === 'unban') {
		const eligibilityAware = Object.prototype.hasOwnProperty.call(job?.stats || {}, 'unbanEligible');
		if (eligibilityAware) {
			lines.push(
				`D1 资格通过:${job.stats?.unbanEligible || 0}`,
				`D1 黑名单拒绝:${job.stats?.unbanBlacklisted || 0}`,
				`D1 检查失败:${job.stats?.unbanCheckFailed || 0}`,
				`群解封成功:${job.stats?.unbanOk || 0}`,
				`群解封失败:${job.stats?.unbanFailed || 0}`
			);
		} else {
			lines.push(
				`移黑成功:${job.stats?.removed || 0}`,
				`原本不在黑名单:${job.stats?.notFound || 0}`,
				`移黑失败:${job.stats?.removeFailed || 0}`,
				`群解封成功:${job.stats?.unbanOk || 0}`,
				`群解封失败:${job.stats?.unbanFailed || 0}`
			);
		}
	} else {
		lines.push(
			`加黑成功:${job.stats?.added || 0}`,
			`已存在:${job.stats?.exists || 0}`,
			`加黑失败:${job.stats?.addFailed || 0}`,
			`群封禁成功:${job.stats?.kickOk || 0}`,
			`群封禁失败:${job.stats?.kickFailed || 0}`
		);
	}
	lines.push(
		`格式错误:${job.totals?.invalid || 0}`,
		'',
		`执行参数:D1 每批最多 ${getBulkJobSafeUserBatchSize(job)} 用户 / 单次 Queue 最多 ${BULK_TASK_OPERATION_SLICE_SIZE} 个群操作 / 并发 ${getBulkJobSafeConcurrency(job)} / 单个群操作最多 2 次请求`
	);
	if (job.totals?.estimatedSubrequests) {
		lines.push(`同步路径估算:${job.totals.estimatedSubrequests} / 安全预算 ${job.totals.subrequestBudget || BULK_TASK_SYNC_SUBREQUEST_BUDGET}`);
	}
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
		for (const f of job.failures.slice(-5)) lines.push(formatBulkJobFailureLine(f));
	}
	return lines.join('\n');
}

function normalizeBulkJobPage(job, requestedPage) {
	const totalUsers = job?.ids?.length || 0;
	const pageCount = Math.max(1, Math.ceil(totalUsers / BULK_JOB_PROFILE_PAGE_SIZE));
	const parsed = Number.parseInt(String(requestedPage || '1'), 10);
	const page = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), pageCount) : 1;
	return { page, pageCount, totalUsers };
}

function getBulkJobPageIds(job, requestedPage) {
	const pageInfo = normalizeBulkJobPage(job, requestedPage);
	const start = (pageInfo.page - 1) * BULK_JOB_PROFILE_PAGE_SIZE;
	return {
		...pageInfo,
		start,
		ids: (job?.ids || []).slice(start, start + BULK_JOB_PROFILE_PAGE_SIZE)
	};
}

function formatBulkJobUserPage(job, requestedPage, profiles, options = {}) {
	const pageInfo = getBulkJobPageIds(job, requestedPage);
	const cursor = Math.max(0, Number(job?.cursor) || 0);
	const failedUsers = new Set((job?.failures || []).map((failure) => String(failure.userId || '')).filter(Boolean));
	const lines = [
		`<b>目标用户</b>（第 ${pageInfo.page}/${pageInfo.pageCount} 页，每页最多 ${BULK_JOB_PROFILE_PAGE_SIZE} 人）:`
	];
	pageInfo.ids.forEach((id, index) => {
		const absoluteIndex = pageInfo.start + index;
		const state = absoluteIndex < cursor
			? (failedUsers.has(String(id)) ? '⚠️ 已处理，存在失败' : '✅ 已处理')
			: '⏳ 待处理';
		lines.push(`${absoluteIndex + 1}. ${formatBatchUserTarget(id, profiles)} — ${state}`);
	});
	// textPager=false 由按钮翻页路径传入：按钮已经承担翻页，再留一行文本提示就是两套并存。
	if (pageInfo.pageCount > 1 && options.textPager !== false) {
		lines.push('', `翻页:<code>/job ${escapeHtml(job.id)} ${pageInfo.page < pageInfo.pageCount ? pageInfo.page + 1 : 1}</code>`);
	}
	return lines.join('\n');
}

// /job 主人视角完整消息（任务详情 + 目标用户当页）。命令首发与按钮翻页共用，
// 保证编辑后的排版与首发一字不差 —— 两处各写一份迟早会漂移。
async function renderBulkJobOwnerView(env, job, requestedPage) {
	const pageInfo = getBulkJobPageIds(job, requestedPage);
	const profiles = await resolveBatchUserProfiles(pageInfo.ids, job.sourceChatId);
	const keyboard = buildAdPaginationKeyboard(
		AD_JOB_PAGINATION_PREFIX, pageInfo.page, pageInfo.pageCount, encodeAdCallbackToken(job.id)
	);
	const userPage = formatBulkJobUserPage(job, pageInfo.page, profiles, { textPager: !keyboard });
	return {
		text: `${formatBulkJobDetail(job, '📦 <b>批量任务状态</b>')}\n\n${userPage}`,
		keyboard,
		// 按钮挂不上（消息分块）时的兜底提示。keyboard 为空时 userPage 里已经带了文本翻页，
		// 这里返回空串避免重复。
		fallbackLine: keyboard && pageInfo.pageCount > 1
			? `翻页:<code>/job ${escapeHtml(job.id)} ${pageInfo.page < pageInfo.pageCount ? pageInfo.page + 1 : 1}</code>`
			: '',
		pageInfo
	};
}

async function notifyBulkJobTargets(job, detailText) {
	const targets = Array.isArray(job.notifyTargets) ? job.notifyTargets : [];
	if (!targets.length) return;
	await mapWithConcurrency(targets, BATCH_USER_PROFILE_CONCURRENCY, async (targetId) => {
		const text = String(targetId) === String(job.createdBy)
			? detailText
			: renderAuditNotification(job.operator || `<code>${escapeHtml(job.createdBy || '')}</code>`, detailText, job.sourceChatType === 'private' ? '私聊' : '群内', job.operatorRole || '管理员');
		const result = await sendTelegramMessageChunks(targetId, text);
		if (!result?.ok) console.error(`[批量任务通知] 私聊${targetId}失败:${result?.description || result?.error || '未知'}`);
	});
}

function incrementBulkJobStat(job, key, amount = 1) {
	if (!job.stats || typeof job.stats !== 'object') job.stats = {};
	job.stats[key] = (Number(job.stats[key]) || 0) + amount;
}

async function performBulkJobD1Mutation(job, env, ids) {
	let lastResults = null;
	const allowD1Removal = job.unbanAllowD1Removal === true
		|| (job.unbanAllowD1Removal == null && isPrivilegedManager(job.createdBy));
	for (let attempt = 0; attempt <= BULK_TASK_D1_RETRY_LIMIT; attempt += 1) {
		lastResults = job.action === 'unban'
			? await checkManyUnbanEligibility(ids, env, { allowD1Removal })
			: await addManyToBlacklist(ids, env, {
				reason: job.reason,
				by: job.createdBy,
				note: job.note
			});
		if (!lastResults.failed.length) return lastResults;
		if (attempt < BULK_TASK_D1_RETRY_LIMIT) {
			await new Promise((resolve) => setTimeout(resolve, BULK_TASK_D1_RETRY_DELAY_MS));
		}
	}
	const preview = lastResults?.failed?.[0]?.msg || '未知 D1 错误';
	if (job.action === 'unban') {
		incrementBulkJobStat(job, 'unbanCheckFailed', lastResults?.failed?.length || ids.length);
	}
	throw new Error(`批量 D1 操作连续失败，未推进任务游标: ${preview}`);
}

function getBulkJobConfiguredGroupIds(job) {
	const seen = new Set();
	return (Array.isArray(job?.groupIds) ? job.groupIds : [])
		.map((id) => String(id || '').trim())
		.filter((id) => {
			if (!id || seen.has(id) || !isConfiguredGroup(id)) return false;
			seen.add(id);
			return true;
		});
}

async function prepareBulkJobActiveBatch(job, env) {
	if (job.activeBatch) return job.activeBatch;
	const ids = job.ids.slice(job.cursor, job.cursor + getBulkJobSafeUserBatchSize(job));
	if (!ids.length) return null;
	const results = await performBulkJobD1Mutation(job, env, ids);
	const isUnban = job.action === 'unban';
	const actionableIds = isUnban
		? [...results.eligible]
		: [...results.success, ...results.exists];
	const activeGroupIds = getBulkJobConfiguredGroupIds(job);

	if (isUnban) {
		incrementBulkJobStat(job, 'unbanEligible', results.eligible.length);
		incrementBulkJobStat(job, 'unbanBlacklisted', results.blacklisted.length);
		for (const id of results.blacklisted) {
			pushBulkJobFailure(job, {
				userId: id,
				phase: 'unban_blocked'
			});
		}
	} else {
		incrementBulkJobStat(job, 'added', results.success.length);
		incrementBulkJobStat(job, 'exists', results.exists.length);
	}

	job.activeBatch = {
		startCursor: job.cursor,
		userCount: ids.length,
		ids,
		actionableIds,
		groupIds: activeGroupIds,
		operationCursor: 0,
		totalOperations: actionableIds.length * activeGroupIds.length
	};
	await saveBulkJob(env, job);
	return job.activeBatch;
}

function getBulkJobOperationTask(job, operationIndex) {
	const active = job.activeBatch;
	const groupIds = Array.isArray(active?.groupIds)
		? active.groupIds
		: (Array.isArray(job?.groupIds) ? job.groupIds : []);
	const groupCount = groupIds.length;
	if (!active || groupCount <= 0) return null;
	const userIndex = Math.floor(operationIndex / groupCount);
	const groupIndex = operationIndex % groupCount;
	const userId = active.actionableIds[userIndex];
	const groupId = groupIds[groupIndex];
	return userId && groupId && isConfiguredGroup(groupId) ? { userId, groupId } : null;
}

async function processBulkJobOperationSlice(job, env) {
	const active = job.activeBatch;
	if (!active) return;
	const start = Math.max(0, Number(active.operationCursor) || 0);
	const end = Math.min(active.totalOperations, start + BULK_TASK_OPERATION_SLICE_SIZE);
	const tasks = [];
	for (let index = start; index < end; index += 1) {
		const task = getBulkJobOperationTask(job, index);
		if (task) tasks.push(task);
	}
	const isUnban = job.action === 'unban';

	await mapWithConcurrency(tasks, getBulkJobSafeConcurrency(job), async (task) => {
		if (isUnban) {
			const result = await unbanUser(task.userId, task.groupId);
			if (result?.ok) {
				incrementBulkJobStat(job, 'unbanOk');
			} else {
				incrementBulkJobStat(job, 'unbanFailed');
				pushBulkJobFailure(job, {
					userId: task.userId,
					groupId: task.groupId,
					phase: 'unban',
					error: result?.description || result?.error || '群解封失败'
				});
			}
			return;
		}

		const result = await banUserFromGroup(task.groupId, task.userId);
		if (result.ok) {
			incrementBulkJobStat(job, 'kickOk');
		} else {
			incrementBulkJobStat(job, 'kickFailed');
			pushBulkJobFailure(job, {
				userId: task.userId,
				groupId: task.groupId,
				phase: 'kick',
				error: result.error || '群封禁失败'
			});
		}
	});

	active.operationCursor = end;
	if (end >= active.totalOperations) {
		job.cursor = Math.min(job.ids.length, active.startCursor + active.userCount);
		job.stats.usersProcessed = job.cursor;
		job.activeBatch = null;
	}
	if (job.cursor >= job.ids.length && !job.activeBatch) {
		job.status = 'done';
		job.finishedAt = new Date().toISOString();
	} else {
		job.status = 'queued';
	}
	clearBulkJobLease(job);
	await saveBulkJob(env, job);
}

function getBulkJobSafeConcurrency(job) {
	const configured = Math.floor(Number(job?.concurrency));
	if (!Number.isFinite(configured) || configured <= 0) return BULK_TASK_CONCURRENCY;
	return Math.min(BULK_TASK_CONCURRENCY, configured);
}

function getBulkJobSafeUserBatchSize(job) {
	const configured = Math.max(1, Number(job?.userBatchSize) || BULK_TASK_USER_BATCH_SIZE);
	return Math.min(BULK_TASK_USER_BATCH_SIZE, configured);
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

async function markBulkJobFailedIfCurrent(env, job, error) {
	try {
		return await markBulkJobFailed(env, job, error);
	} catch (markError) {
		if (markError?.code === 'BULK_JOB_LEASE_LOST') {
			console.warn(`[批量任务] 状态已被新执行器接管，忽略旧执行器失败标记 ${job?.id || ''}`);
			return await loadBulkJob(env, job?.id) || job;
		}
		throw markError;
	}
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
		await markBulkJobFailedIfCurrent(env, job, `Queue 自动续接触发失败: ${lastError || '未知错误'}`);
	})().catch(async (error) => {
		console.error(`[批量任务] 自动续接异常 ${job.id}:`, error);
		await markBulkJobFailedIfCurrent(env, job, error);
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
	if (!options.ignoreLease && isBulkJobLeaseActive(job)) return job;

	const leaseOwner = `${options.source || 'run'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
	try {
		const acquired = await acquireBulkJobLease(env, job, leaseOwner);
		if (!acquired) return await loadBulkJob(env, job.id) || job;
		job = acquired;

		const activeBatch = await prepareBulkJobActiveBatch(job, env);
		if (activeBatch) {
			await processBulkJobOperationSlice(job, env);
		} else {
			job.status = 'done';
			job.finishedAt = new Date().toISOString();
			clearBulkJobLease(job);
			await saveBulkJob(env, job);
		}

		if (job.status !== 'done' && options.autoContinue !== false) {
			const scheduled = scheduleBulkJobAutoContinue(job, options.ctx, options.requestUrl, env);
			if (scheduled && typeof scheduled.then === 'function') await scheduled;
		}

		if (job.status === 'done' && options.notifyOnDone !== false && !job.doneNotified) {
			await notifyBulkJobTargets(job, formatBulkJobDetail(job, '✅ <b>批量任务完成</b>'));
			job.doneNotified = true;
			await saveBulkJob(env, job);
		}
		return job;
	} catch (error) {
		if (error?.code === 'BULK_JOB_LEASE_LOST') {
			console.warn(`[批量任务] 租约已转移，旧执行器停止保存 ${job.id}`);
			return await loadBulkJob(env, job.id) || job;
		}
		console.error(`[批量任务] 执行异常 ${job.id}:`, error);
		try {
			return await markBulkJobFailed(env, job, error);
		} catch (markError) {
			if (markError?.code === 'BULK_JOB_LEASE_LOST') {
				return await loadBulkJob(env, job.id) || job;
			}
			throw markError;
		}
	}
}

async function startBulkModerationJobFromCommand(message, env, ctx, options) {
	const { action, valid, invalid, note, isInGroup } = options;
	const budget = shouldUseBulkQueue(valid.length, GROUP_IDS.length, {
		probeMembership: action !== 'unban' && valid.length === 1,
		authorizationRequests: estimateBulkAuthorizationRequests(message)
	});
	if (!budget.useQueue) return false;
	if (!env.DB) {
		const detailText = withActionContext(
			message,
			`❌ 批量任务需要绑定 D1 存储空间\n目标用户:${valid.length}\n总操作数:${budget.operations}\n预计子请求:${budget.estimate.total}/${BULK_TASK_SYNC_SUBREQUEST_BUDGET}`,
			note
		);
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
		return '/ban + /spam + /ad 投票';
	}
	return normalized || '/ban + /spam + /ad 投票';
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

// 把 ISO 时间戳压成 "2026-09-02 23:40:47"（去掉 T、毫秒与结尾 Z）。
// 保留到秒：同一分钟内批量加黑的多条记录靠秒数才能分出先后顺序。
// 时区仍是 UTC（写入用的是 new Date().toISOString()），由渲染函数在末尾统一标注一次。
function formatBlacklistTime(at) {
	const raw = String(at || '').trim();
	if (!raw) return '';
	const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
	return m ? `${m[1]} ${m[2]}` : raw;
}

// ===== /blacklist 操作人用户名解析 =====
// 为什么需要：操作人原本只输出 <a href="tg://user?id=X">X</a>，而 Telegram 官方在
// ChatFullInfo.has_private_forwards 里写明——对方若把「隐私和安全 → 转发消息」设为
// 非「所有人」，tg://user?id= 链接【只在与该用户本人的聊天里】才生效，别处退化成灰色
// 纯文本点不动。管理员出于隐私常改这个设置，于是出现「被封的广告号能点、管理员点不动」。
// 解法照搬 /admins：纯文本 @username 由 Telegram 自动识别为用户链接，不受该设置约束。
//
// 成本控制（这是关键，否则 30 条记录会打爆子请求配额）：
//   ① 先对操作人集合【去重】——30 条记录通常只有 2~5 个不同操作人；
//   ② 用 getChatAdministrators 【按群】拉取，一次拿回该群全部管理员，
//      而不是按人逐个 getChat。操作人几乎必然是管理员，G 次调用即可全部解析；
//   ③ 结果进运行期缓存，同一 isolate 内重复执行 /blacklist 不再查；
//   ④ 全程 try/catch 静默降级：查不到就回落 tg://user?id=，绝不因此让命令失败。
const BLACKLIST_OPERATOR_CACHE = new Map();
const BLACKLIST_OPERATOR_CACHE_TTL_MS = 10 * 60 * 1000;
const BLACKLIST_OPERATOR_CACHE_MAX = 200;

function readBlacklistOperatorCache(id) {
	const hit = BLACKLIST_OPERATOR_CACHE.get(id);
	if (!hit) return undefined;
	if (Date.now() - hit.at > BLACKLIST_OPERATOR_CACHE_TTL_MS) {
		BLACKLIST_OPERATOR_CACHE.delete(id);
		return undefined;
	}
	return hit.username;
}

function writeBlacklistOperatorCache(id, username) {
	// 简单 LRU：超上限时丢掉最早写入的一批，避免 isolate 长期存活后无限增长
	if (BLACKLIST_OPERATOR_CACHE.size >= BLACKLIST_OPERATOR_CACHE_MAX) {
		for (const key of [...BLACKLIST_OPERATOR_CACHE.keys()].slice(0, 50)) {
			BLACKLIST_OPERATOR_CACHE.delete(key);
		}
	}
	BLACKLIST_OPERATOR_CACHE.set(id, { username: username || '', at: Date.now() });
}

// 返回 Map<TGID, username>；username 为空串表示查过但该账号没设用户名。
async function resolveBlacklistOperatorUsernames(entries) {
	const wanted = new Set();
	for (const entry of entries || []) {
		const raw = String(entry?.by || '').trim();
		// system / anonymous_admin:-100xxx 不是用户 ID，不需要查
		if (/^\d+$/.test(raw)) wanted.add(raw);
	}
	const result = new Map();
	for (const id of wanted) {
		const cached = readBlacklistOperatorCache(id);
		if (cached !== undefined) result.set(id, cached);
	}
	const missing = [...wanted].filter((id) => !result.has(id));
	if (missing.length === 0) return result;

	// 按群批量拉管理员：一次调用覆盖该群所有管理员，远比按人查省
	for (const groupId of GROUP_IDS) {
		if (missing.every((id) => result.has(id))) break;
		try {
			const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatAdministrators`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: groupId }),
			});
			const data = await response.json();
			if (!response.ok || !data?.ok || !Array.isArray(data.result)) continue;
			for (const member of data.result) {
				const uid = member?.user?.id ? String(member.user.id) : '';
				if (!uid || !wanted.has(uid) || result.has(uid)) continue;
				const username = member.user.username ? String(member.user.username) : '';
				result.set(uid, username);
				writeBlacklistOperatorCache(uid, username);
			}
		} catch (error) {
			console.error(`[黑名单] 拉取群管理员失败 group=${groupId}:`, error);
		}
	}

	// 仍没解析到的（如已被降权、已退群）记成空串，避免下次再白查一轮
	for (const id of missing) {
		if (!result.has(id)) {
			result.set(id, '');
			writeBlacklistOperatorCache(id, '');
		}
	}
	return result;
}

// 把 by_user 字段翻译成可读的操作人标签。
// usernames 由 resolveBlacklistOperatorUsernames 预先解析好后传入（同步渲染，不在这里发请求）；
// 不传则退化为纯本地渲染，行为与解析失败时一致。
function renderBlacklistOperator(byId, usernames) {
	const raw = String(byId || '').trim();
	if (!raw) return '未知';
	if (raw === 'system') return '🤖 系统自动';

	const anonymous = raw.match(/^anonymous_admin:(-?\d+)$/);
	if (anonymous) {
		return `🕵️ 匿名管理员（来源群 <code>${escapeHtml(anonymous[1])}</code>）`;
	}

	// 纯数字才是真实用户 ID，才能做 tg://user 跳转；其它形态原样展示避免生成死链接。
	if (!/^\d+$/.test(raw)) return `<code>${escapeHtml(raw)}</code>`;

	let roleTag = '👤 群管理员';
	if (isPrimaryOwner(raw)) roleTag = '👑 主人';
	else if (isSecondaryOwner(raw)) roleTag = '👤 副主人';
	else if (SUPER_ADMINS.includes(raw)) roleTag = '🛡️ 超级管理员';

	// 有用户名就用纯文本 @xxx：Telegram 自动识别为用户链接，不受对方隐私设置影响。
	// TGID 仍然照常给出，方便直接复制去 /check、/unban。
	const username = usernames?.get?.(raw);
	if (username) {
		return `${roleTag} @${escapeHtml(username)}（<code>${escapeHtml(raw)}</code>）`;
	}
	return `${roleTag} <a href="tg://user?id=${escapeHtml(raw)}">${escapeHtml(raw)}</a>`;
}

// 渲染黑名单为 HTML 文本（用于 /blacklist 命令展示）
// 排版为「每条记录一段、字段各占一行」：旧版把 4 个字段用 " · " 拼成一行，
// Telegram 按屏宽随机折行，长的 anonymous_admin:-100xxx 一出现整行就被撑爆，读起来很乱。
// 竖排后折行位置固定，且记录之间的空行正好是 splitTelegramHtmlBlocks 的切分点，
// 条数调大触发分块时不会把某一条记录劈成两半。
function renderBlacklist(blacklist, options = {}) {
	const limit = options.limit ?? BLACKLIST_PAGE_LIMIT;
	const alreadyRecent = Boolean(options.alreadyRecent);
	const total = Number.isFinite(options.total) ? Number(options.total) : blacklist.length;

	if (blacklist.length === 0) {
		return '📋 <b>当前黑名单</b>\n\n（空）';
	}

	const reasonLabels = BLACKLIST_REASON_LABELS;
	const usernames = options.operatorUsernames;
	const visible = alreadyRecent ? blacklist.slice(0, limit) : blacklist.slice(-limit).reverse(); // 最近添加的排前面
	const limitedText = total > visible.length ? ` · 显示最近 ${visible.length} 条` : '';
	// 序号右对齐：两位数与一位数混排时左侧不会参差。
	const indexWidth = String(visible.length).length;

	const lines = [`📋 <b>当前黑名单</b>（共 ${total} 条${limitedText}）`, ''];

	visible.forEach((entry, index) => {
		const seq = String(index + 1).padStart(indexWidth, ' ');
		const idLink = `<a href="tg://user?id=${escapeHtml(entry.id)}">${escapeHtml(entry.id)}</a>`;
		const block = [`${seq}. TGID：${idLink}`];
		if (entry.reason) {
			block.push(`　　原因：${escapeHtml(reasonLabels[entry.reason] || entry.reason)}`);
		}
		if (entry.by) {
			block.push(`　　操作人：${renderBlacklistOperator(entry.by, usernames)}`);
		}
		const at = formatBlacklistTime(entry.at);
		if (at) {
			block.push(`　　时间：${escapeHtml(at)}`);
		}
		lines.push(block.join('\n'), '');
	});

	lines.push('ℹ️ 时间为 UTC · 点 TGID 或操作人可打开该用户；操作人显示为灰色数字说明对方隐私设置不允许跳转，可复制 TGID 用 /check 查');
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

// 加黑命令 /ban —— 与 /spam 同款正则范式:支持 @机器人名、单发提示,且不依赖命令长度
function isBanCommand(text) {
	if (!text) {
		return false;
	}

	const trimmedText = text.trim();
	return /^\/ban(?:@[^\s]+)?(?:\s|$)/i.test(trimmedText);
}

// 判断给定 chat_id 是否属于配置的任一群组
function isConfiguredGroup(chatId) {
	if (chatId === undefined || chatId === null) {
		return false;
	}
	const idStr = chatId.toString();
	return GROUP_IDS.some((g) => g.toString() === idStr);
}

function parseTelegramCommand(text) {
	const trimmed = String(text || '').trim();
	const match = trimmed.match(/^(\/[a-z0-9_]+)(?:@[^\s]+)?(?:\s+([\s\S]*))?$/i);
	if (!match) {
		return { head: '', rest: '' };
	}
	return {
		head: match[1].toLowerCase(),
		rest: String(match[2] || '').trim()
	};
}

function isTelegramSlashCommand(text) {
	if (!text) {
		return false;
	}
	return /^\/[^\s/]+(?:\s|$)/.test(text.trim());
}

// 判断给定 user_id 是否在超级管理员白名单内（按钮交互专用鉴权）
function isSuperAdmin(userId) {
	if (userId === undefined || userId === null) return false;
	const idStr = String(userId);
	return SUPER_ADMINS.some((id) => id === idStr);
}

// 清掉会让 Telegram 直接返回 400 的非法字符。
// 旧实现是 replace(/[\uD800-\uDFFF]/g, '')，把【所有】代理对码元一律删除 —— 但合法的
// 星平面字符（U+10000 以上，几乎所有 emoji）在 JS 里正是以「高位代理 + 低位代理」这一对
// 码元存储的，于是 📋🔐🗂️🤖🕵️🌐 等 emoji 会被整体抹掉，只在原位留下一个多余空格，
// 而 ✅❌ℹ️ 这些落在 BMP 内的符号却安然无恙 —— 表现为 emoji 时有时无。
// 真正非法的只有【孤立代理】：高位后面没跟低位，或低位前面没有高位。成对的必须保留。
function sanitizeTelegramText(value) {
	return String(value ?? '')
		// 高位代理（U+D800~U+DBFF）后面没有紧跟低位代理 → 孤立，删掉
		.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
		// 低位代理（U+DC00~U+DFFF）前面不是高位代理 → 孤立，删掉（保留前一个字符）
		.replace(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '$1');
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

// 「有 user 对象就渲染 mention，否则退回可复制的纯 id」这个模式在本文件里反复出现
// （formatAdVoteUser、批量结果渲染、回复学习回执都要它），统一收敛到这里。
// user 可能为 undefined（Telegram 匿名管理员的 message.from 就没有可用身份），
// 此时 formatUserMention 返回 null，走 id 兜底而不是把 'null' 拼进 HTML。
function formatUserReference(id, user) {
	return formatUserMention(user) || '<code>' + escapeHtml(String(id ?? '未知')) + '</code>';
}

function normalizeBatchUserDisplayName(user) {
	const fullName = [user?.first_name, user?.last_name]
		.filter(Boolean)
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!fullName) return '';
	if (Array.from(fullName).length <= BATCH_USER_NAME_MAX_LENGTH) return fullName;
	return `${truncateTelegramText(fullName, BATCH_USER_NAME_MAX_LENGTH - 1)}…`;
}

function normalizeTelegramUsername(value) {
	const username = String(value || '').trim().replace(/^@/, '');
	return /^[A-Za-z0-9_]{5,32}$/.test(username) ? username : '';
}

function formatBatchUserCompactTarget(tgid) {
	const safeId = escapeHtml(String(tgid));
	return `<a href="tg://user?id=${safeId}">${safeId}</a>`;
}

function formatBatchUserTarget(tgid, userProfiles = null) {
	const idStr = String(tgid);
	const safeId = escapeHtml(idStr);
	const user = userProfiles && typeof userProfiles.get === 'function'
		? userProfiles.get(idStr)
		: null;
	if (user?.id) {
		const fullName = normalizeBatchUserDisplayName(user);
		const username = normalizeTelegramUsername(user.username);
		const label = fullName || (username ? `@${username}` : idStr);
		const usernameSuffix = fullName && username ? ` <code>@${escapeHtml(username)}</code>` : '';
		return `<a href="tg://user?id=${safeId}">${escapeHtml(label)}</a>${usernameSuffix} <code>${safeId}</code>`;
	}
	return `${formatBatchUserCompactTarget(idStr)} <code>${safeId}</code>`;
}

// 即时小批量只在一个配置群查询一次用户资料，避免 用户数 × 群数 的额外子请求。
// 群内命令优先查来源群；私聊命令只查第一个配置群。失败直接回退可点击 TGID。
async function resolveBatchUserProfiles(ids, sourceChatId) {
	const profiles = new Map();
	const preferredGroupId = isConfiguredGroup(sourceChatId)
		? String(sourceChatId)
		: String(GROUP_IDS[0] || '');
	if (!preferredGroupId) return profiles;

	const uniqueIds = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(isPureTgid))];
	await mapWithConcurrency(uniqueIds, BATCH_USER_PROFILE_CONCURRENCY, async (id) => {
		try {
			const result = await checkUserStatus(id, preferredGroupId);
			const user = result?.result?.user;
			if (user?.id) profiles.set(id, user);
		} catch (_) {
			// 查询不到资料不影响黑名单或 Telegram 群操作主流程。
		}
	});
	return profiles;
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

	// 先用静态表填充兜底资料，后续 API 查到时会覆盖
	for (const id of wanted) {
		if (STATIC_USER_PROFILES[id]) {
			profiles.set(id, { user: STATIC_USER_PROFILES[id], status: '', source: 'static', groupId: '' });
		}
	}

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
	const queryTgid = String(tgidToCheck);
	let banlistData;
	try {
		const banlistResult = await handleBanlist(queryTgid);
		banlistData = JSON.parse(banlistResult);
	} catch (error) {
		console.error('[GKY 查询] /check 查询失败:', error);
		banlistData = { success: false, error: error?.message || 'GKY 查询异常' };
	}

	// GKY 与本地 D1 是两套独立状态；任一查询结果都不能吞掉另一套复制操作。
	let localCheck = { isBlacklisted: false, entry: null };
	let localBlacklistInfo = '';
	if (options.env) {
		localCheck = await checkBlacklist(queryTgid, options.env);
		if (localCheck.isBlacklisted) {
			const entry = localCheck.entry;
			const reason = translateBlacklistReason(entry?.reason);
			const operator = await translateBlacklistOperator(entry?.by);
			const addedAt = entry?.at || '未知';
			const noteText = String(entry?.note || '').trim();
			localBlacklistInfo = `\n🚫 <b>本地黑名单:在黑名单中</b>\n` +
				`├ 加黑方式:${reason}\n`;
			if (noteText) {
				localBlacklistInfo += `├ 执行原因:${escapeHtml(noteText)}\n`;
			}
			localBlacklistInfo += `├ 操作人:${operator}\n` +
				`└ 时间:${escapeHtml(addedAt)}\n`;
		} else {
			localBlacklistInfo = `\n✅ <b>本地黑名单:不在黑名单中</b>\n`;
		}
	}

	let responseMessage = '';
	let canCopyGkyCommand = false;
	// 记录是否属于本部署的 GROUP_ID 配置群：决定 GKY 代码的语义是「移出本群黑名单」
	// 还是「加 GKY 全局白名单」，两者影响面差别很大，必须在提示里说清。
	let gkyRecordInConfiguredGroup = false;

	if (!banlistData.success) {
		responseMessage = `❌ <b>GKY 查询失败</b>\n\n${escapeHtml(banlistData.error || '未知错误')}${localBlacklistInfo}`;
	} else if (!banlistData.banned) {
		responseMessage = `✅ <b>查询结果</b>\n\nTGID <code>${escapeHtml(queryTgid)}</code> 没有 GKY 封禁记录。`;
		if (options.targetUser) {
			responseMessage = `✅ <b>查询结果</b>\n\n用户 ${formatUserMention(options.targetUser) || `<code>${escapeHtml(queryTgid)}</code>`} 没有 GKY 封禁记录。\nTGID: <code>${escapeHtml(queryTgid)}</code>`;
		}
		responseMessage += localBlacklistInfo;
	} else {
		responseMessage = `🔍 <b>封禁查询结果</b>\n\n`;
		if (options.targetUser) {
			responseMessage += `👤 <b>用户:</b> ${formatUserMention(options.targetUser) || `<code>${escapeHtml(queryTgid)}</code>`}\n`;
		}
		responseMessage += `📋 <b>TGID:</b> <a href="tg://user?id=${escapeHtml(queryTgid)}">${escapeHtml(queryTgid)}</a>\n`;

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

		const recordTgid = String(banlistData.tgid || '');
		if (recordTgid !== queryTgid) {
			// 这道门必须留：GKY 返回的记录与查询目标不是同一个人，此时给按钮会给错人加白名单。
			responseMessage += '\n\n⚠️ 当前 GKY 返回记录的 TGID 无法与查询目标核对，因此不提供 GKY 复制按钮。请稍后重新使用 <code>/check</code>。';
		} else {
			// 与源项目对齐：只要 GKY 判定被封就提供复制按钮，chatId 只决定"移出黑名单"还是
			// "添加白名单"两种语义，而不是决定给不给按钮。
			// 早前版本在这里加了"记录必须属于 GROUP_ID 配置群"的门，导致查到别群记录时
			// 按钮被整个吞掉、只能去 GKY 官网操作 —— 而 GKYbotSave 本就是发给 GKYbot 的
			// 全局指令，别群记录同样能处理，没有拦的必要。
			canCopyGkyCommand = true;
			gkyRecordInConfiguredGroup = isConfiguredGroup(String(banlistData.chatId || ''));
		}
	}

	if (!options.includeReviewAction) {
		return { text: responseMessage };
	}

	// 非 GROUP_ID 群仍可查询两套状态，但不开放任何复制操作。
	if (options.dispatchSourceAllowed === false) {
		responseMessage += '\n\n⚠️ 当前查询来自非 <b>GROUP_ID</b> 群，因此仅提供查询结果，不提供任何复制按钮。请在私聊或 GROUP_ID 配置群重新使用 <code>/check</code>。';
		return { text: responseMessage };
	}

	const inlineKeyboard = [];
	if (canCopyGkyCommand) {
		if (gkyRecordInConfiguredGroup) {
			// 记录就在自己的配置群：语义是把该号从该群的 GKY 黑名单里移出。
			responseMessage += '\n\nℹ️ GKY 与本地 D1 黑名单相互独立。下方按钮只复制 GKY 移出黑名单代码，必须由真人管理员在封禁记录对应的配置群发送。';
			inlineKeyboard.push([{
				text: '📋 点击复制 GKY 移出黑名单代码',
				copy_text: { text: `GKYbotSave\n${queryTgid}` }
			}]);
		} else {
			// 记录来自别的群：GKYbotSave 此时的效果是给该号加 GKY【全局】白名单，
			// 该号在所有接入 GKYbot 的群都会被放行 —— 影响面远大于"解封我这个群"，
			// 按钮文字四个字说不清，必须在提示里写明，否则容易被当成本地白名单。
			responseMessage += '\n\n⚠️ 此 GKY 封禁记录<b>不属于</b>你的 <b>GROUP_ID</b> 配置群（来源群 <code>'
				+ escapeHtml(String(banlistData.chatId || '未知'))
				+ '</code>）。下方代码的效果是给该号加 <b>GKY 全局白名单</b> —— 对所有接入 GKYbot 的群生效，不只是你的群，请确认后再发送。'
				+ '\nℹ️ GKY 与本地 D1 黑名单相互独立，此代码不会改动你的 D1 黑名单；需由真人管理员发送才生效。';
			inlineKeyboard.push([{
				text: '📋 点击复制 GKY 添加全局白名单代码',
				copy_text: { text: `GKYbotSave\n${queryTgid}` }
			}]);
		}
	}

	if (localCheck.isBlacklisted) {
		responseMessage += '\n\nℹ️ 下方按钮只复制本地解封命令，不会直接修改 D1；仍需由有权限的管理员发送执行。';
		inlineKeyboard.push([{
			text: '📋 点击复制 本地解封命令',
			copy_text: { text: `/unban ${queryTgid}` }
		}]);
	}

	if (!inlineKeyboard.length) {
		return { text: responseMessage };
	}

	return {
		text: responseMessage,
		replyMarkup: { inline_keyboard: inlineKeyboard }
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

// ===== B 方案:新成员进群时主动查杀神全局封禁库 =====
// 对单个用户查一次 GKY 全局库(GKY_BANLIST_ENDPOINT)。命中(banned=true)→ 删/踢/加黑(reason:gky_global)+ 通知主人。
// 精度极高:杀神在别的群已判定过的广告号,一进本群就被拦,不用猜消息内容。
// 返回 true 表示已命中并处置(调用方可据此跳过后续)。异常/未命中 → false(绝不误伤)。





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

	// 管理员身份一变，立刻清掉本群的管理员列表缓存（广告检测豁免用的那一份）。
	// 放在这里而不是更下面：下面还有 isConfiguredGroup、is_bot、操作人自查等多个
	// 提前 return，任何一个都会让缓存留着陈旧数据。这一步无副作用、无 IO，
	// 早做没有代价，晚做会漏。
	// 撤职同样要清 —— 否则被撤的人还能靠陈旧缓存继续免检 5 分钟。
	if (oldMember.status !== newMember.status
		&& (oldMember.status === 'administrator' || newMember.status === 'administrator'
			|| oldMember.status === 'creator' || newMember.status === 'creator')) {
		invalidateAdAdminCache(chat.id);
	}

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

		// 【方案 C 的第一个修复】不在黑名单，就当场做广告筛查（查 bio / 用户名 / 昵称）。
		// 这是本次补的核心缺口：自己点邀请链接进群、加入请求被批准、unban 后自加回，
		// Telegram 走的是 chat_member update，【不保证】同时发 new_chat_members
		// service message —— 那种情况下 detectAdOnJoin 一次都不会执行。
		// 而再往下第一个 return 就是「操作人 === 被操作人」：自己进群时 from 就是 target，
		// 直接 return，简介里写满广告也不看一眼。所以必须拦在那一行之前。
		const joinVerdict = await screenAdJoinMember(env, targetUser, {
			chatId: String(chat.id),
			chatTitle: chat.title || '',
			messageId: null,					// chat_member update 没有消息可删
			skipBlacklistCheck: true,			// 上面刚查过，别再查一遍 D1
			source: 'chat_member'
		});
		// 已封禁的人后面那套「管理员操作同步」没有意义：他已经不在群里了。
		if (joinVerdict === 'banned') return;
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
		// 群内原生手动解封：D1 黑名单是权威封禁，禁止普通管理员经此绕过或清除。
		// 管理层必须通过 /unban TGID 先移除 D1 再解封；该命令路径不会进入这里的封回逻辑。
		// 普通管理员直接使用 Telegram 原生解封时，D1 仍在，因此继续由独立保护链封回。
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



// 新保存统一使用 spam 分类；旧 D1 data.sa 只读合并，避免历史词库失效。

// 把词库对象写回 D1

// 读取 D1 词库,空则返回标准空结构(7 个分类)

// ===== 广告学习样本(第一主人 /spam 上报 → 指纹入库 → 精准查杀)=====

// 归一化:把文本"洗"成标准指纹,抓"加空格/标点/全半角"变体
// ===== 反混淆扫描文本(治"词内插空格/标点/零宽字符"绕过)=====
// 背景:词库匹配用的是 includes 子串比对,广告号只要在词中间插一个空格或标点
//   ("广 告 位 招 租"、"联·系·我"),includes 立即失效 —— 实测 9 个变体漏 4 个。
// 这里生成一份"去混淆"文本与原文一起参与匹配,任一命中即算,补掉最常见的绕过手法。
//
// 【关键取舍】不能无条件删掉所有空白/标点 —— 那会把相邻词拼起来造成误杀
//   (如"今日 入门" → "今日入门" 会凭空命中"日入")。因此只处理"逐字分隔"这一种
//   明确的混淆签名:连续 ≥3 个单字符、每个后面都跟一个分隔符。正常语句不会长这样。
// 逐字分隔签名:至少 3 个"单字符 + 单个分隔符"连续出现



// 返回参与关键词匹配的文本变体(已去重)。原文永远在第一项，行为完全向后兼容。



// 相似广告签名：只保留稳定的正文骨架，屏蔽广告商最常替换的账号、链接、电话、金额、数字与排版。
// 该签名只用于第一主人亲自确认过的学习样本；代理内容仍在进入这里之前整条绝对豁免。









// ===== /ad 举报投票 D1 状态 =====
function d1MutationChanges(result) {
	const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
	return Number.isFinite(changes) ? changes : 0;
}

function normalizeAdVoteChatTitle(value) {
	return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 255);
}

function normalizeAdVoteState(value) {
	if (!value || typeof value !== 'object') return null;
	const voteToken = String(value.voteToken || '').trim();
	const chatId = String(value.chatId || '').trim();
	const targetUserId = String(value.targetUserId || '').trim();
	const creatorUserId = String(value.creatorUserId || '').trim();
	if (!voteToken || !chatId || !/^\d+$/.test(targetUserId) || !creatorUserId) return null;
	return {
		...value,
		voteToken,
		chatId,
		chatTitle: normalizeAdVoteChatTitle(value.chatTitle),
		targetUserId,
		creatorUserId,
		messageId: Number(value.messageId) || null,
		commandMessageId: Number(value.commandMessageId) || null,
		commandDate: Number(value.commandDate) || 0,
		reportedMessageId: Number(value.reportedMessageId) || null,
		approvers: Array.isArray(value.approvers) ? value.approvers : [],
		reason: String(value.reason || '').replace(/\s+/g, ' ').trim().slice(0, 200),
		rejecters: Array.isArray(value.rejecters) ? value.rejecters : [],
		threshold: Math.max(1, Number(value.threshold) || AD_VOTE_THRESHOLD),
		createdAt: Number(value.createdAt) || 0,
		deadlineAt: Number(value.deadlineAt) || 0,
		finalized: value.finalized === true,
		result: value.result ? String(value.result) : null,
		version: Math.max(1, Number(value.version) || 1),
	};
}

async function readAdVoteState(env, voteToken) {
	if (!env.DB) return null;
	if (!(await ensureAdVoteTables(env))) return null;
	const row = await env.DB.prepare(
		'SELECT vote_token, state_json, version, finalized, result, deadline_at FROM ad_votes WHERE vote_token = ? LIMIT 1'
	).bind(String(voteToken || '')).first();
	if (!row?.state_json) return null;
	try {
		const state = normalizeAdVoteState(JSON.parse(row.state_json));
		if (!state) return null;
		state.version = Math.max(1, Number(row.version) || state.version || 1);
		state.finalized = Number(row.finalized) === 1 || state.finalized;
		state.result = row.result ? String(row.result) : state.result;
		state.deadlineAt = Number(row.deadline_at) || state.deadlineAt;
		return state;
	} catch (error) {
		console.error('[/ad] 解析 D1 投票状态失败:', error);
		return null;
	}
}

async function createAdVoteState(env, state) {
	if (!env.DB) return { ok: false, error: '未绑定 D1 存储空间' };
	const normalized = normalizeAdVoteState(state);
	if (!normalized) return { ok: false, error: '投票状态无效' };
	try {
		if (!(await ensureAdVoteTables(env))) {
			return { ok: false, error: 'D1 投票表初始化失败' };
		}
		const nowIso = new Date().toISOString();
		const result = await env.DB.prepare(
			'INSERT INTO ad_votes (vote_token, chat_id, vote_message_id, reported_message_id, target_user_id, creator_user_id, state_json, version, finalized, result, created_at, deadline_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, ?, ?, ?)'
		).bind(
			normalized.voteToken,
			normalized.chatId,
			normalized.messageId,
			normalized.reportedMessageId,
			normalized.targetUserId,
			normalized.creatorUserId,
			JSON.stringify({ ...normalized, version: 1 }),
			normalized.createdAt,
			normalized.deadlineAt,
			nowIso,
		).run();
		return { ok: d1MutationChanges(result) > 0, version: 1 };
	} catch (error) {
		console.error('[/ad] 创建 D1 投票失败:', error);
		return { ok: false, error: error.message || String(error) };
	}
}

async function updateAdVoteState(env, state, expectedVersion) {
	const normalized = normalizeAdVoteState(state);
	if (!env.DB || !normalized) return { ok: false, conflict: false, error: '投票状态无效' };
	try {
		if (!(await ensureAdVoteTables(env))) {
			return { ok: false, conflict: false, error: 'D1 投票表初始化失败' };
		}
		const nextVersion = Math.max(1, Number(expectedVersion) || 1) + 1;
		const nextState = { ...normalized, version: nextVersion };
		const result = await env.DB.prepare(
			'UPDATE ad_votes SET vote_message_id = ?, state_json = ?, version = ?, finalized = ?, result = ?, deadline_at = ?, updated_at = ? WHERE vote_token = ? AND version = ? AND finalized = 0'
		).bind(
			nextState.messageId,
			JSON.stringify(nextState),
			nextVersion,
			nextState.finalized ? 1 : 0,
			nextState.result,
			nextState.deadlineAt,
			new Date().toISOString(),
			nextState.voteToken,
			Math.max(1, Number(expectedVersion) || 1),
		).run();
		const changed = d1MutationChanges(result) > 0;
		return { ok: changed, conflict: !changed, state: changed ? nextState : null };
	} catch (error) {
		console.error('[/ad] 更新 D1 投票失败:', error);
		return { ok: false, conflict: false, error: error.message || String(error) };
	}
}

async function findActiveAdVote(env, chatId, targetUserId, nowSeconds) {
	if (!env.DB) return null;
	if (!(await ensureAdVoteTables(env))) return null;
	return env.DB.prepare(
		'SELECT vote_token FROM ad_votes WHERE chat_id = ? AND target_user_id = ? AND finalized = 0 AND deadline_at > ? ORDER BY created_at DESC LIMIT 1'
	).bind(String(chatId), String(targetUserId), Number(nowSeconds) || 0).first();
}

async function pruneExpiredAdVotes(env, nowSeconds = Math.floor(Date.now() / 1000)) {
	if (!env.DB) return;
	try {
		if (!(await ensureAdVoteTables(env))) return;
		await env.DB.prepare('DELETE FROM ad_votes WHERE created_at < ?')
			.bind((Number(nowSeconds) || 0) - AD_VOTE_RETENTION_SECONDS)
			.run();
	} catch (error) {
		console.error('[/ad] 清理过期投票失败:', error);
	}
}

async function isAdVoteAllowlisted(env, userId) {
	if (!env.DB || !/^\d+$/.test(String(userId || ''))) return false;
	if (!(await ensureAdVoteTables(env))) return false;
	const row = await env.DB.prepare('SELECT user_id FROM ad_vote_allowlist WHERE user_id = ? LIMIT 1')
		.bind(String(userId))
		.first();
	return String(row?.user_id || '') === String(userId);
}

async function setAdVoteAllowlist(env, userId, enabled, byUser) {
	if (!env.DB) return { ok: false, error: '未绑定 D1 存储空间' };
	const id = String(userId || '').trim();
	if (!/^\d+$/.test(id)) return { ok: false, error: 'TGID 必须是纯数字' };
	if (!(await ensureAdVoteTables(env))) return { ok: false, error: 'D1 投票表初始化失败' };
	try {
		if (enabled) {
			await env.DB.prepare('INSERT OR REPLACE INTO ad_vote_allowlist (user_id, by_user, at) VALUES (?, ?, ?)')
				.bind(id, String(byUser || ''), new Date().toISOString())
				.run();
			return { ok: true, enabled: true };
		}
		const result = await env.DB.prepare('DELETE FROM ad_vote_allowlist WHERE user_id = ?').bind(id).run();
		return { ok: true, enabled: false, existed: d1MutationChanges(result) > 0 };
	} catch (error) {
		console.error('[/ad] 更新发起白名单失败:', error);
		return { ok: false, error: error.message || String(error) };
	}
}


// 当前群清扫缓存：保存普通用户近期消息 ID，供 /spam 引用回复时清扫该用户当前群近期消息。
// 只记消息 ID 与发送者，不存正文 —— 这是自动广告治理移除后唯一保留的消息缓存。
// Telegram 服务消息（置顶/入群/退群/改群名等）不是用户发言，绝不能进清扫缓存。
// 根因案例：管理员置顶任意消息时，Telegram 推送一条 pinned_message 服务消息，
// 它的 from 是置顶者、message_id 是服务消息自身。旧逻辑只排除 bot 与斜杠命令，
// 服务消息没有 text 所以照样被写进 moderation_messages；之后该用户一旦被
// /spam 引用清扫或 /ad 投票通过，清扫会删掉这条服务消息 ——
// 而删除置顶服务消息，Telegram 的表现正是【取消置顶】。
// 本项目只应在投票流程里对自己发出的投票卡片做 pin/unpin，绝不碰群里其它置顶。
const TELEGRAM_SERVICE_MESSAGE_KEYS = [
	'pinned_message',
	'new_chat_members', 'left_chat_member',
	'new_chat_title', 'new_chat_photo', 'delete_chat_photo',
	'group_chat_created', 'supergroup_chat_created', 'channel_chat_created',
	'migrate_to_chat_id', 'migrate_from_chat_id',
	'message_auto_delete_timer_changed',
	'forum_topic_created', 'forum_topic_edited', 'forum_topic_closed', 'forum_topic_reopened',
	'general_forum_topic_hidden', 'general_forum_topic_unhidden',
	'video_chat_scheduled', 'video_chat_started', 'video_chat_ended', 'video_chat_participants_invited',
	'proximity_alert_triggered', 'write_access_allowed', 'web_app_data',
	'successful_payment', 'refunded_payment', 'users_shared', 'chat_shared',
	'boost_added', 'chat_background_set', 'giveaway_created', 'giveaway_completed',
];

function isTelegramServiceMessage(message) {
	if (!message || typeof message !== 'object') return false;
	return TELEGRAM_SERVICE_MESSAGE_KEYS.some((key) => message[key] !== undefined && message[key] !== null);
}

async function cacheModerationMessage(env, message) {
	// 双保险：即使调用点漏判，这里也拒绝服务消息进入清扫缓存。
	if (isTelegramServiceMessage(message)) return;
	if (!env.DB || !message?.message_id || !message?.from?.id) return;
	try {
		await ensureD1Table(env);
		const insertResult = await env.DB.prepare('INSERT INTO moderation_messages (mid, chat_id, from_id, created_at) VALUES (?, ?, ?, ?)')
			.bind(
				message.message_id,
				String(message.chat.id),
				String(message.from.id),
				new Date().toISOString()
			)
			.run();
		const limit = Math.max(MSG_CACHE_SIZE, 200);
		if (shouldPruneD1Cache(insertResult)) {
			await pruneAutoincrementCacheTable(env, 'moderation_messages', limit);
		}
	} catch (error) {
		console.error('[清扫缓存] 写 D1 失败:', error);
	}
}

async function cleanupCurrentChatUserMessages(env, chatId, userId, fallbackMessageIds = []) {
	const messageIds = [];
	const addMessageId = (mid) => {
		const n = Number(mid);
		if (Number.isInteger(n) && n > 0) messageIds.push(n);
	};

	if (env.DB) {
		try {
			await ensureD1Table(env);
			const { results } = await env.DB.prepare('SELECT mid FROM moderation_messages WHERE chat_id = ? AND from_id = ? ORDER BY id DESC LIMIT ?')
				.bind(String(chatId), String(userId), Math.max(MSG_CACHE_SIZE, 200))
				.all();
			for (const row of results || []) addMessageId(row.mid);
			await env.DB.prepare('DELETE FROM moderation_messages WHERE chat_id = ? AND from_id = ?')
				.bind(String(chatId), String(userId))
				.run();
		} catch (error) {
			console.error('[当前群清扫] 读取 D1 缓存失败:', error);
		}
	}

	for (const mid of fallbackMessageIds) addMessageId(mid);
	const uniqueIds = [...new Set(messageIds)];
	let ok = 0;
	let failed = 0;
	const errors = [];
	for (const mid of uniqueIds) {
		const result = await deleteMessage(chatId, mid);
		if (result.ok) {
			ok += 1;
		} else {
			failed += 1;
			errors.push({ messageId: mid, error: result.error || '未知错误' });
		}
	}
	return { total: uniqueIds.length, ok, failed, errors };
}

// TGID 投票没有可引用的原消息 ID；Telegram revoke_messages 是全量主路径，
// 这里仅对来源群已缓存的少量消息做兜底，避免 Telegram 对不在群目标的撤回不生效时完全漏删。
async function cleanupAdVoteSourceChatMessages(env, chatId, userId) {
	const result = { attempted: false, total: 0, ok: 0, failed: 0, errors: [] };
	const normalizedChatId = String(chatId || '').trim();
	const normalizedUserId = String(userId || '').trim();
	if (!env?.DB || !isConfiguredGroup(normalizedChatId) || !isPureTgid(normalizedUserId)) return result;
	result.attempted = true;
	try {
		await ensureD1Table(env);
		const { results } = await env.DB.prepare('SELECT mid FROM moderation_messages WHERE chat_id = ? AND from_id = ? ORDER BY id DESC LIMIT ?')
			.bind(normalizedChatId, normalizedUserId, AD_VOTE_HISTORY_FALLBACK_LIMIT)
			.all();
		const messageIds = [...new Set((results || []).map((row) => Number(row?.mid)).filter((mid) => Number.isInteger(mid) && mid > 0))];
		result.total = messageIds.length;
		for (const messageId of messageIds) {
			const deletion = await deleteMessage(normalizedChatId, messageId);
			const outcome = classifyAdDeleteOutcome(deletion);
			if (outcome.effective) result.ok += 1;
			else {
				result.failed += 1;
				result.errors.push({ messageId, error: deletion.error || '未知错误' });
			}
		}
	} catch (error) {
		result.failed += 1;
		result.errors.push({ messageId: null, error: error.message || String(error) });
		console.error('[/ad] TGID 来源群缓存兜底清理失败:', error);
	}
	return result;
}

function renderCurrentChatCleanupResult(cleanup) {
	if (!cleanup || cleanup.total === 0) return '🧹 当前群近期消息清扫:未找到缓存消息';
	const suffix = cleanup.failed ? `，失败 ${cleanup.failed}` : '';
	return `🧹 当前群近期消息清扫:成功 ${cleanup.ok}/${cleanup.total}${suffix}`;
}
// 收集消息里所有 URL(entities + caption_entities 里的 url / text_link)

// 从一批 URL 中提取主机名(小写,去 www. 前缀)。解析失败的 URL 跳过。

// 主机名是否命中某个白名单域名(等于 或 是其子域名)。
// 例:host=gist.github.com,wl=github.com → true(子域名);host=evilgithub.com → false(防伪造)

// 这批 URL 是否【全部】命中正常域名白名单(只要有一个不在白名单,就不算"纯白名单链接")


// 提取联系人名片(contact)里的全部可读文本,供广告检测。
// 名片广告把内容藏在名片显示名/电话/vcard 里(如名字"假钞交流群"+电话"+1 870..."),
// 普通 text/caption 是空的,不提取就漏检。
function getContactText(message) {
	const c = message.contact;
	if (!c) return '';
	const parts = [c.first_name, c.last_name, c.phone_number, c.vcard].filter(Boolean);
	return parts.join(' ');
}

// 名片显示名【是否像人名】—— 反向白名单，只减误封、不抓广告。
// 2026-09-09 从旧代码（e80658e 移除前的 :6632）原样移植，是那套实现里唯一与词表无关的部件。
//
// 为什么这一档值得单独存在：正常人分享的名片，显示名就是人名或称谓
//（张三 / 王医生 / 妈妈 / 快递小哥 / John Smith）。广告名片必须把广告写进显示名，
// 否则没人知道它卖什么 —— 这是广告【无法规避】的结构约束。
// 命中即整条跳过名片通道，不进任何判据，所以它对漏检零影响，只压误封。
//
// 移植时刻意【不带】旧代码的 countContactPromoSignals 与 PROFILE_OFFERING_PATTERN：
// 那两个才是旧代码的误封源头（`交流群` 三个字会杀掉「Python技术交流群管理」，
// 而本项目就部署在技术群）。判据仍走 judgeAdStructure 的两类同现。
function looksLikePersonName(name) {
	const value = String(name || '').trim();
	if (!value) return false;
	const chars = Array.from(value);
	if (chars.length > 12) return false;                            // 人名不会超过 12 字
	if (/\d/.test(value)) return false;                            // 人名不含数字
	try {
		if (/\p{Extended_Pictographic}/u.test(value)) return false;  // 人名不带 emoji
	} catch (_) {
		if (/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(value)) return false;
	}
	if (/[一-龥]/.test(value)) return chars.length <= 5;            // 中日韩姓名/称谓 ≤5 字
	// 西文人名：1~3 个词，每词首字母大写
	return /^[A-Z][a-z'’-]+(?:\s[A-Z][a-z'’-]+){0,2}$/.test(value);
}
function getInlineButtonPayloadText(message) {
	const parts = [];
	for (const row of message?.reply_markup?.inline_keyboard || []) {
		for (const button of row || []) {
			parts.push(
				button?.text,
				button?.url,
				button?.login_url?.url,
				button?.web_app?.url,
				button?.switch_inline_query,
				button?.switch_inline_query_current_chat,
			);
		}
	}
	return parts.filter(Boolean).join(' ');
}

function getAdDetectionBodyText(message) {
	return [
		message?.text,
		message?.caption,
		getContactText(message || {}),
		getInlineButtonPayloadText(message || {}),
	].filter(Boolean).join(' ').trim();
}

// 提取【引用体】正文 —— 也就是这条消息「引用/回复的那条别人的消息」里的文字。
//
// 2026-09-08 新增。起因是主人发来的实例（昵称 Maybell Tillman，正文只有一个字母 `c`，
// 引用块里是「操逼赚钱，招探花9000一单，提供设备」，来源频道 bxbd）——
// 这正是线上漏放 50+ 个号的共同形态：正文只有 v / z / n / x / c 一个字母，
// 广告词全在引用体里，而 getAdDetectionBodyText 只读 text/caption，一个词都取不到。
// 检测层看到的只有那个字母，所以那批号一路走到底都是 0 分。
//
// 【三个字段全读，不做取舍】。Telegram 把「引用别人消息」这件事分散在三处，
// 而客户端渲染出来长得一模一样（左侧竖线 + 来源名 + 内容），从截图分不出是哪个：
//   quote          —— 2023 新增的「引用片段」，用户手选一段文字引用，只有被选中的片段
//   external_reply —— 引用【其它聊天】里的消息（跨群 / 引用频道帖子），本体在这里
//   reply_to_message —— 同群内回复，包括「频道关联讨论组里回复频道自动转发的帖子」
// 与其开 AD_DEBUG_DUMP_UPDATE 取样确认是哪个（那会把群内消息全文打进 Worker 日志，
// 是实打实的隐私泄露面），不如三个都读 —— 成本一样，还少一轮线上取样。
//
// external_reply 内部还可能再套一层 quote（引用其它聊天里的某个片段），故一并展开。
function getAdQuotedText(message) {
	const ext = message?.external_reply || null;
	const reply = message?.reply_to_message || null;
	return [
		message?.quote?.text,
		ext?.text,
		ext?.caption,
		ext?.quote?.text,
		reply?.text,
		reply?.caption,
	].filter(Boolean).join('\n').trim();
}



// 统计文本里"引流@提及/频道"的分布。广告常用重复 @同一账号 或堆叠多个 @账号 引流。
// 返回 { distinct: 去重后@数量, maxRepeat: 同一@最多重复次数 }。











function translateBlacklistReason(reason) {
	// ad_auto / ad_learn 已无写入方，仅用于渲染 D1 里的历史封禁记录。
	const map = {
		manual_ban: '旧版 Telegram 原生封禁同步记录',
		manual: '管理员 /ban 指令加黑',
		sa: '管理员 /spam 引用回复加黑（历史记录）',
		spam: '管理员 /spam 引用回复加黑',
		ad_auto: '广告自动检测加黑（历史记录）',
		ad_vote: '群内 /ad 举报投票加黑',
		ad_learn: '上报学习加黑（历史记录）',
	};
	return map[reason] || reason || '未知';
}

// 将加黑操作人 ID 翻译为角色标签
async function translateBlacklistOperator(byId) {
	if (!byId) return '未知';
	if (byId === 'system') return '🤖 系统自动';
	const anonymousMatch = String(byId).match(/^anonymous_admin:(-?\d+)$/);
	if (anonymousMatch) {
		const groupId = anonymousMatch[1];
		let groupLabel = `<code>${escapeHtml(groupId)}</code>`;
		const isConfiguredSourceGroup = isConfiguredGroup(groupId);
		if (isConfiguredSourceGroup) {
			try {
				const info = await getChatInfoFromId(groupId);
				if (info?.title) {
					groupLabel = `<b>${escapeHtml(info.title)}</b> <code>${escapeHtml(groupId)}</code>`;
				}
			} catch (_) {}
		}
		const sourceLabel = isConfiguredSourceGroup ? '来源群' : '来源群(未在当前 GROUP_ID)';
		return `<b>匿名管理员</b>\n   ${sourceLabel}:${groupLabel}`;
	}

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
// 通知主人：黑名单用户在跟 bot 互动。
// kind 区分两种信号强度，避免主人分不清对方到底做了什么：
//   'appeal'（默认）—— 发了 /unban 或粘贴确认整句，是【真的在尝试解封】并被闸门拒绝；
//   'start'         —— 只是打开了 bot（Telegram 自动发 /start），可能只是误触，
//                      /start 现在只回自我介绍、不拒绝，所以这条纯属知情通报。
async function notifyOwnerBlacklistAppeal(fromUser, blacklistInfo, kind = 'appeal') {
	if (!OWNER_IDS.length) return;
	const target = fromUser
		? formatUserMention(fromUser)
		: '<code>未知</code>';
	const targetId = String(fromUser?.id || '未知');

	const entry = blacklistInfo?.entry;
	const reason = translateBlacklistReason(entry?.reason);
	const operator = await translateBlacklistOperator(entry?.by);
	const addedAt = entry?.at ? escapeHtml(entry.at) : '未知';
	const isStart = kind === 'start';

	const lines = [
		isStart ? '📬 <b>黑名单用户打开了机器人</b>' : '📢 <b>黑名单用户申诉</b>',
		`👤 用户:${target} <code>${escapeHtml(targetId)}</code>`,
		`📋 加黑方式:${reason}`,
		`🔧 加黑操作人:${operator}`,
		`🕐 加黑时间:${addedAt}`,
		'',
		isStart
			? '该用户刚发送 /start 打开机器人，只收到了自我介绍，尚未尝试解封。'
			: '该用户正尝试自助解封但被黑名单阻止。',
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



// ===== /ad 举报投票业务 =====
function isAdCommand(text) {
	return typeof text === 'string' && /^\/ad(?:@[^\s]+)?(?:\s|$)/i.test(text.trim());
}

function parseAdCommand(text) {
	const match = String(text || '').trim().match(/^\/ad(?:@[^\s]+)?(?:\s+([\s\S]*))?$/i);
	const args = String(match?.[1] || '').trim();
	const firstArg = args.split(/\s+/)[0] || '';
	const rest = firstArg ? args.slice(firstArg.length).trim() : '';
	return { args, firstArg, rest };
}

function snapshotAdVoteUser(user, options = {}) {
	const rawId = options.id ?? user?.id;
	if (rawId === undefined || rawId === null || String(rawId) === '') return null;
	return {
		id: String(rawId),
		firstName: String(options.firstName ?? user?.first_name ?? ''),
		lastName: String(options.lastName ?? user?.last_name ?? ''),
		username: String(options.username ?? user?.username ?? ''),
		isBot: Boolean(options.isBot ?? user?.is_bot),
		anonymous: options.anonymous === true,
	};
}

function adVoteSnapshotToUser(snapshot) {
	if (!snapshot || snapshot.anonymous) return null;
	const id = String(snapshot.id || '');
	if (!/^\d+$/.test(id)) return null;
	return {
		id: Number(id),
		first_name: snapshot.firstName || '',
		last_name: snapshot.lastName || '',
		username: snapshot.username || '',
		is_bot: Boolean(snapshot.isBot),
	};
}

// 把显示名脱敏成"首字***尾字"。单字符无首尾之分，整体隐藏最安全。
// 用途：投票通过、确认目标是广告号之后，其昵称本身很可能就是广告
// （如"广告位招租 @xxx"），原样显示等于借 bot 的投票卡片把广告又广播一次。
function maskAdVoteDisplayName(name) {
	const chars = Array.from(String(name ?? ''));
	if (chars.length === 0) return '';
	if (chars.length === 1) return '***';
	return chars[0] + '***' + chars[chars.length - 1];
}

function formatAdVoteUser(snapshot, fallbackId = '') {
	if (snapshot?.anonymous) return '<b>匿名管理员</b>';
	const user = adVoteSnapshotToUser(snapshot);
	if (user) return formatUserMention(user) || '<code>' + escapeHtml(String(user.id)) + '</code>';
	const id = String(snapshot?.id || fallbackId || '未知');
	return '<a href="tg://user?id=' + escapeHtml(id) + '">' + escapeHtml(id) + '</a>';
}

// 被举报人显示文本。
// mask=false：显示完整名称 —— 投票进行中群成员必须看清目标才能判断怎么投；被否决时也应还原。
// mask=true ：仅在"投票通过"后启用，昵称脱敏防广告二次传播。
//             脱敏后仍保留 tg://user 链接，管理员照样可点进去核对。
function formatAdVoteTarget(snapshot, fallbackId = '', mask = false) {
	if (!mask) return formatAdVoteUser(snapshot, fallbackId);
	if (snapshot?.anonymous) return '<b>匿名管理员</b>';
	const id = String(snapshot?.id || fallbackId || '');
	const displayName = [snapshot?.firstName, snapshot?.lastName].filter(Boolean).join(' ')
		|| snapshot?.username
		|| '';
	// 没有显示名时回退 TGID：纯数字不含广告内容，无需脱敏。
	if (!displayName) return formatAdVoteUser(snapshot, fallbackId);
	const masked = escapeHtml(maskAdVoteDisplayName(displayName));
	if (!/^\d+$/.test(id)) return '<b>' + masked + '</b>';
	return '<a href="tg://user?id=' + escapeHtml(id) + '">' + masked + '</a>';
}

function formatAdVoteVoters(voters) {
	if (!Array.isArray(voters) || voters.length === 0) return '无';
	return voters.map((item) => formatAdVoteUser(item, item?.id)).filter(Boolean).join('、') || '无';
}

function formatBeijingTimeFromSeconds(seconds) {
	const date = new Date((Number(seconds) || 0) * 1000 + 8 * 60 * 60 * 1000);
	const pad = (value) => String(value).padStart(2, '0');
	return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate())
		+ ' ' + pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes()) + ':' + pad(date.getUTCSeconds());
}

function buildAdVoteMessageText(state) {
	// 投票通过 = 已确认目标是广告号 → 其昵称本身可能就是广告，脱敏后再展示。
	// 进行中 / 否决 / 到期 / 取消一律显示完整名称，群成员需要看清才能判断。
	const maskTarget = state.finalized === true && state.result === 'approved';
	const target = formatAdVoteTarget(state.targetUserSnapshot, state.targetUserId, maskTarget);
	const creator = formatAdVoteUser(state.creatorUserSnapshot, state.creatorUserId);
	let status = '<i>进行中，1 小时后截止。</i>';
	if (state.finalized && state.result === 'approved') {
		status = state.enforcementComplete
			? '💀 <b>举报通过，已加入 D1 全局黑名单、执行全部 GROUP_ID 群封禁，并请求撤回其各群全部历史发言。</b>'
			: '💀 <b>举报通过，正在执行 D1 加黑、全群封禁与历史发言撤回。</b>';
	} else if (state.finalized && state.result === 'rejected') {
		status = '❎ <b>投票已被否决，目标未处理。</b>';
	} else if (state.finalized && state.result === 'expired') {
		status = '⌛ <b>投票已到期，目标未处理。</b>';
	} else if (state.finalized && state.result === 'cancelled') {
		status = '🚫 <b>投票已取消，目标未处理。</b>';
	} else if (state.finalized) {
		status = '⚠️ <b>投票已结束。</b>';
	}
	const lines = [
		'⚠️ <b>广告举报投票</b>',
		'',
		'<b>被举报人:</b> ' + target + ' <code>' + escapeHtml(state.targetUserId) + '</code>',
		'<b>发起人:</b> ' + creator,
		'<b>截止时间:</b> <code>' + escapeHtml(formatBeijingTimeFromSeconds(state.deadlineAt)) + '</code>',
	];
	if (state.messagePreview) lines.push('<b>被举报内容:</b> <tg-spoiler>' + escapeHtml(String(state.messagePreview).slice(0, 180)) + '</tg-spoiler>');
	if (state.reason) lines.push('<b>举报原因:</b> ' + escapeHtml(state.reason));
	if (state.vetoedBy) {
		lines.push('<b>管理员裁决:</b> ' + formatAdVoteUser(state.vetoedBy, state.vetoedBy.id)
			+ (state.result === 'approved' ? ' 一票通过' : ' 一票否决'));
	}
	if (state.cancelledBy) {
		lines.push('<b>取消人:</b> ' + formatAdVoteUser(state.cancelledBy, state.cancelledBy.id));
	}
	lines.push(
		'',
		'<b>赞成:</b> ' + state.approvers.length + '/' + state.threshold,
		'<b>反对:</b> ' + state.rejecters.length + '/' + state.threshold,
		'<b>赞成人:</b> ' + formatAdVoteVoters(state.approvers),
		'<b>反对人:</b> ' + formatAdVoteVoters(state.rejecters),
		'',
		status,
	);
	return lines.join('\n');
}

function buildAdVoteInlineKeyboard(state) {
	if (state.finalized) return { inline_keyboard: [] };
	return {
		inline_keyboard: [[
			{
				text: '赞成 ' + state.approvers.length + '/' + state.threshold,
				callback_data: AD_VOTE_BUTTON_PREFIX + 'A:' + state.voteToken,
			},
			{
				text: '反对 ' + state.rejecters.length + '/' + state.threshold,
				callback_data: AD_VOTE_BUTTON_PREFIX + 'R:' + state.voteToken,
			},
			],
			[
				{
					text: '取消投票',
					callback_data: AD_VOTE_BUTTON_PREFIX + 'C:' + state.voteToken,
				},
			]],
	};
}

async function answerAdVoteCallback(callbackQueryId, text = '', showAlert = false) {
	if (!callbackQueryId) return { ok: false, error: 'callback_query_id 缺失' };
	try {
		const response = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/answerCallbackQuery', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				callback_query_id: callbackQueryId,
				text: String(text || '').slice(0, 200),
				show_alert: Boolean(showAlert),
			}),
		});
		const result = await response.json();
		return response.ok && result?.ok ? result : { ok: false, error: result?.description || ('HTTP ' + response.status) };
	} catch (error) {
		console.error('[/ad] answerCallbackQuery 失败:', error);
		return { ok: false, error: error.message || String(error) };
	}
}

async function setAdVotePinned(chatId, messageId, pinned) {
	if (!messageId) return { ok: false, error: '投票消息 ID 缺失' };
	const method = pinned ? 'pinChatMessage' : 'unpinChatMessage';
	const label = pinned ? '置顶投票' : '取消投票置顶';
	const body = {
		chat_id: chatId,
		message_id: messageId,
	};
	try {
		const response = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/' + method, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
		const result = await response.json();
		if (response.ok && result?.ok) return { ok: true };
		const error = result?.description || ('HTTP ' + response.status);
		const translated = translateTelegramError(error);
		console.error('[/ad] ' + label + '失败：' + translated.中文 + '；Telegram 原始返回：' + error);
		return { ok: false, error, translated };
	} catch (error) {
		console.error('[/ad] ' + label + '异常：', error);
		return { ok: false, error: error.message || String(error) };
	}
}

async function pinAdVoteMessage(chatId, messageId) {
	return setAdVotePinned(chatId, messageId, true);
}

async function unpinAdVoteMessage(chatId, messageId) {
	return setAdVotePinned(chatId, messageId, false);
}

async function editAdVoteMessage(chatId, messageId, state) {
	if (!messageId) return { ok: false, error: '投票消息 ID 缺失' };
	try {
		const response = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/editMessageText', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chat_id: chatId,
				message_id: messageId,
				text: sanitizeTelegramText(buildAdVoteMessageText(state)),
				parse_mode: 'HTML',
				disable_web_page_preview: true,
				reply_markup: buildAdVoteInlineKeyboard(state),
			}),
		});
		const result = await response.json();
		if (!response.ok || !result?.ok) {
			console.error('[/ad] editMessageText 失败:', result?.description || ('HTTP ' + response.status));
			return { ok: false, error: result?.description || ('HTTP ' + response.status) };
		}
		return result;
	} catch (error) {
		console.error('[/ad] editMessageText 异常:', error);
		return { ok: false, error: error.message || String(error) };
	}
}

async function userHasActiveChatBoost(chatId, userId) {
	if (!/^\d+$/.test(String(userId || ''))) return false;
	try {
		const response = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/getUserChatBoosts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: chatId, user_id: Number(userId) }),
		});
		const result = await response.json();
		return Boolean(response.ok && result?.ok && Array.isArray(result.result?.boosts) && result.result.boosts.length > 0);
	} catch (error) {
		console.error('[/ad] 检查群助推状态失败:', error);
		return false;
	}
}

async function getAdVoteInitiatorRole(message, env) {
	if (isAnonymousAdminMessage(message)) return '匿名管理员';
	const userId = String(message?.from?.id || '');
	if (!/^\d+$/.test(userId)) return '';
	if (isPrivilegedManager(userId)) return classifyOperatorRole(userId, '高级管理员');
	if (await checkIfUserIsAdminInGroup(userId, message.chat.id)) return '群管理员';
	if (await isAdVoteAllowlisted(env, userId)) return '举报白名单成员';
	// Telegram 助推仅代表为群提供 Boost，不属于可信管理权限；普通成员和助推者只能参与投票。
	return '';
}

function getAdVoteTargetFromMessage(message) {
	const command = parseAdCommand(message?.text);
	const repliedUser = message?.reply_to_message?.from;
	if (repliedUser?.id !== undefined && repliedUser?.id !== null) {
		return {
			targetUserId: String(repliedUser.id),
			targetUserSnapshot: snapshotAdVoteUser(repliedUser),
			reportedMessageId: Number(message.reply_to_message.message_id) || null,
			reason: command.args,
			messagePreview: getAdDetectionBodyText(message.reply_to_message).slice(0, 180),
		};
	}
	return {
		targetUserId: String(command.firstArg || ''),
		targetUserSnapshot: null,
		reportedMessageId: null,
		reason: command.rest,
		messagePreview: '',
	};
}

async function resolveAdVoteTargetProtection(message, target) {
	const targetId = String(target.targetUserId || '');
	if (targetId === String(message?.from?.id || '')) return { protected: true, reason: '不能举报自己' };
	if (isOwner(targetId)) return { protected: true, reason: '不能举报主人或副主人' };
	if (isSuperAdmin(targetId)) return { protected: true, reason: '不能举报超级管理员' };
	const botId = await getBotId();
	if (botId && targetId === String(botId)) return { protected: true, reason: '不能举报当前机器人' };

	let member = null;
	try {
		const statusResult = await checkUserStatus(targetId, message.chat.id);
		if (statusResult?.ok && statusResult.result) {
			member = statusResult.result;
			if (!target.targetUserSnapshot && member.user) target.targetUserSnapshot = snapshotAdVoteUser(member.user);
		}
	} catch (error) {
		console.error('[/ad] 查询被举报用户状态失败:', error);
	}
	if (target.targetUserSnapshot?.isBot || member?.user?.is_bot) return { protected: true, reason: '不能举报机器人' };
	if (member?.status === 'administrator' || member?.status === 'creator') {
		return { protected: true, reason: '不能举报当前群管理员' };
	}
	if (await checkIfUserIsAdminInGroup(targetId, message.chat.id)) {
		return { protected: true, reason: '不能举报当前群管理员' };
	}
	// 顺带把已查到的群内状态带出去，供重复举报预检复用，避免再打一次 getChatMember。
	return { protected: false, memberStatus: member?.status || null, member };
}

// 重复举报预检：目标【已在本群被封禁/禁言】且【已在 D1 全局黑名单】时，本次举报没有任何
// 增量意义，直接跳过，避免群里刷出一张注定通过的投票卡片。
// 必须两个条件同时成立才跳过 —— 只满足其一说明处置还不完整（例如已加黑但没踢掉、
// 或群内踢了但没进全局黑名单），仍应走投票把处置补齐。
// memberStatus 复用 resolveAdVoteTargetProtection 已查到的结果，不额外调用 Telegram。
async function isRedundantAdVoteTarget(env, targetUserId, memberStatus) {
	const status = String(memberStatus || '').toLowerCase();
	const bannedOrMuted = status === 'kicked' || status === 'restricted';
	if (!bannedOrMuted) return false;
	const blacklistCheck = await checkBlacklist(targetUserId, env);
	return blacklistCheck.isBlacklisted === true;
}

function createAdVoteToken() {
	return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 20);
}

function getAdVoteCommandDate(message) {
	const value = Number(message?.date);
	return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function getAdVoteCommandIgnoreReason(message, nowSeconds, existingState = null) {
	const commandDate = getAdVoteCommandDate(message);
	const now = Math.max(0, Number(nowSeconds) || 0);
	if (commandDate > 0 && now > commandDate && now - commandDate > AD_VOTE_COMMAND_MAX_AGE_SECONDS) {
		return `命令已延迟 ${now - commandDate} 秒，超过 ${AD_VOTE_COMMAND_MAX_AGE_SECONDS} 秒安全窗口`;
	}
	if (!existingState) return '';
	const commandMessageId = Number(message?.message_id) || 0;
	if (commandMessageId > 0 && Number(existingState.commandMessageId) === commandMessageId) {
		return '相同 message_id 的命令已处理';
	}
	if (commandDate > 0 && Number(existingState.createdAt) > 0 && commandDate < Number(existingState.createdAt)) {
		return '命令原始发送时间早于现有投票创建时间';
	}
	return '';
}

function logIgnoredAdVoteCommand(message, reason) {
	console.warn(
		'[/ad] 已静默忽略延迟或重复命令: ' + reason
		+ '; chat=' + String(message?.chat?.id || '')
		+ '; message=' + String(message?.message_id || '')
		+ '; from=' + String(getMessageActorId(message) || '')
		+ '; command_date=' + String(getAdVoteCommandDate(message) || 0)
	);
}

async function sendAdVoteCommandFeedback(message, ctx, text) {
	await sendModerationCommandFeedback(message, ctx, {
		flashText: text,
		detailText: text,
	});
}

async function handleAdCommand(message, env, ctx) {
	if (!isConfiguredGroup(message?.chat?.id) || message?.chat?.type === 'private') return true;
	const now = Math.floor(Date.now() / 1000);
	const staleReason = getAdVoteCommandIgnoreReason(message, now);
	if (staleReason) {
		logIgnoredAdVoteCommand(message, staleReason);
		return true;
	}
	const role = await getAdVoteInitiatorRole(message, env);
	if (!role) return true;

	const deleteAndReply = async (text) => {
		await deleteAuthorizedGroupCommandMessage(message, '/ad');
		await sendAdVoteCommandFeedback(message, ctx, text);
		return true;
	};
	if (!env.DB) {
		return deleteAndReply('❌ 未绑定 D1，无法发起广告举报投票。');
	}
	if (!(await ensureAdVoteTables(env))) {
		return deleteAndReply('❌ D1 投票存储初始化失败，请稍后重试。');
	}
	await pruneExpiredAdVotes(env);

	const target = getAdVoteTargetFromMessage(message);
	if (!/^\d+$/.test(target.targetUserId)) {
		return deleteAndReply('❌ 用法：回复目标消息发送 <code>/ad [举报原因]</code>，或发送 <code>/ad TGID [举报原因]</code>。');
	}
	const protection = await resolveAdVoteTargetProtection(message, target);
	if (protection.protected) {
		return deleteAndReply('⚠️ ' + escapeHtml(protection.reason));
	}
	// 已被封禁/禁言且已在全局黑名单 → 本次举报无增量意义，直接跳过不刷投票卡片。
	if (await isRedundantAdVoteTarget(env, target.targetUserId, protection.memberStatus)) {
		logIgnoredAdVoteCommand(message, '目标已被本群封禁/禁言且已在 D1 全局黑名单，无需重复举报');
		await deleteAuthorizedGroupCommandMessage(message, '/ad');
		return true;
	}
	const existing = await findActiveAdVote(env, message.chat.id, target.targetUserId, now);
	if (existing?.vote_token) {
		const existingState = await readAdVoteState(env, existing.vote_token);
		const duplicateReason = getAdVoteCommandIgnoreReason(message, now, existingState);
		if (duplicateReason) {
			logIgnoredAdVoteCommand(message, duplicateReason);
			return true;
		}
		return deleteAndReply('⚠️ 当前群已存在针对该用户的进行中投票，请勿重复发起。');
	}

	await deleteAuthorizedGroupCommandMessage(message, '/ad');
	const creatorId = getMessageActorId(message);
	const creatorSnapshot = isAnonymousAdminMessage(message)
		? snapshotAdVoteUser(null, {
			id: creatorId,
			firstName: '匿名管理员',
			anonymous: true,
		})
		: snapshotAdVoteUser(message.from);
	const state = normalizeAdVoteState({
		voteToken: createAdVoteToken(),
		messageId: null,
		commandMessageId: Number(message.message_id) || null,
		commandDate: getAdVoteCommandDate(message),
		reportedMessageId: target.reportedMessageId,
		chatId: String(message.chat.id),
		chatTitle: message.chat.title || '',
		targetUserId: target.targetUserId,
		creatorUserId: creatorId,
		targetUserSnapshot: target.targetUserSnapshot,
		creatorUserSnapshot: creatorSnapshot,
		reason: target.reason,
		messagePreview: target.messagePreview,
		approvers: creatorSnapshot ? [creatorSnapshot] : [],
		rejecters: [],
		threshold: AD_VOTE_THRESHOLD,
		createdAt: now,
		deadlineAt: now + AD_VOTE_DURATION_SECONDS,
		finalized: false,
		result: null,
		initiatorRole: role,
	});
	const created = await createAdVoteState(env, state);
	if (!created.ok) {
		await sendAdVoteCommandFeedback(message, ctx, '❌ 创建投票失败：' + escapeHtml(created.error || 'D1 写入失败'));
		return true;
	}

	// 与源代码一致：回复目标发起时，投票卡片继续回复原被举报消息；TGID 模式则发送独立投票卡片。
	const sent = await sendTelegramMessage(
		message.chat.id,
		buildAdVoteMessageText(state),
		buildAdVoteInlineKeyboard(state),
		state.reportedMessageId,
	);
	const voteMessageId = Number(sent?.result?.message_id) || 0;
	if (!sent?.ok || !voteMessageId) {
		const failedState = { ...state, finalized: true, result: 'send_failed' };
		await updateAdVoteState(env, failedState, created.version);
		await sendAdVoteCommandFeedback(message, ctx, '❌ 投票消息发送失败：' + escapeHtml(sent?.error || '未知错误'));
		return true;
	}
	state.messageId = voteMessageId;
	const updated = await updateAdVoteState(env, state, created.version);
	if (!updated.ok) {
		await deleteMessage(message.chat.id, voteMessageId);
		await sendAdVoteCommandFeedback(message, ctx, '❌ 投票状态回填失败，已撤回孤立投票消息，请重试。');
		return true;
	}
	await pinAdVoteMessage(state.chatId, state.messageId);
	return true;
}

function isEligibleAdVoterMember(member) {
	const status = String(member?.status || '');
	return status === 'member' || status === 'administrator' || status === 'creator';
}

async function saveFinalizedAdVoteDetails(env, state) {
	if (!env.DB) return false;
	try {
		if (!(await ensureAdVoteTables(env))) return false;
		const nextVersion = Math.max(1, Number(state.version) || 1) + 1;
		const nextState = { ...state, version: nextVersion };
		const result = await env.DB.prepare(
			'UPDATE ad_votes SET state_json = ?, version = ?, result = ?, updated_at = ? WHERE vote_token = ? AND finalized = 1'
		).bind(
			JSON.stringify(nextState),
			nextVersion,
			nextState.result,
			new Date().toISOString(),
			nextState.voteToken,
		).run();
		if (d1MutationChanges(result) > 0) {
			Object.assign(state, nextState);
			return true;
		}
	} catch (error) {
		console.error('[/ad] 保存最终执行详情失败:', error);
	}
	return false;
}

async function formatAdVoteSourceGroup(state) {
	const chatId = String(state?.chatId || '').trim();
	let chatTitle = normalizeAdVoteChatTitle(state?.chatTitle);
	if (!chatTitle && chatId && isConfiguredGroup(chatId)) {
		try {
			const info = await getChatInfoFromId(chatId);
			chatTitle = normalizeAdVoteChatTitle(info?.title);
		} catch (error) {
			console.warn('[/ad] 补查来源群名称失败: ' + (error?.message || error));
		}
	}
	const idLabel = `<code>${escapeHtml(chatId || '未知群组')}</code>`;
	return chatTitle ? `<b>${escapeHtml(chatTitle)}</b> ${idLabel}` : idLabel;
}

async function notifyOwnerAdVoteApproved(state, blacklistResult, banResults, deleteResult) {
	if (!OWNER_IDS.length) return;
	const sourceGroup = await formatAdVoteSourceGroup(state);
	const lines = [
		'🗳️ <b>广告举报投票已通过</b>',
		'🎯 目标:' + formatAdVoteUser(state.targetUserSnapshot, state.targetUserId)
			+ ' <code>' + escapeHtml(state.targetUserId) + '</code>',
		'👤 发起人:' + formatAdVoteUser(state.creatorUserSnapshot, state.creatorUserId)
			+ '（' + escapeHtml(state.initiatorRole || '未知身份') + '）',
		'📍 来源群:' + sourceGroup,
		'📊 票数:赞成 ' + state.approvers.length + ' / 反对 ' + state.rejecters.length,
		'📝 举报原因:' + escapeHtml(state.reason || '未填写'),
		'',
	];
	if (blacklistResult?.success) lines.push('✅ 已写入 D1 全局黑名单，原因:ad_vote');
	else if (blacklistResult?.code === 'EXISTS') lines.push('ℹ️ 目标已在 D1 黑名单，本次仍继续执行全群封禁');
	else lines.push('⚠️ D1 写入失败:' + escapeHtml(blacklistResult?.message || '未知错误'));
	lines.push(await renderBanResultsDetail(banResults || [], null, {
		userId: state.targetUserId,
		retryCommand: '/ban 或 /spam',
	}));
	lines.push('🧹 历史发言:全部 GROUP_ID 封禁请求均启用 revoke_messages=true；封禁成功的群由 Telegram 撤回该用户全部历史发言。');
	if (state.reportedMessageId) {
		const outcome = classifyAdDeleteOutcome(deleteResult);
		lines.push('🧹 被举报消息:' + escapeHtml(outcome.summary));
		if (outcome.detail) lines.push('   ' + escapeHtml(outcome.detail));
	} else {
		lines.push('🧹 被举报消息:本次通过 TGID 发起，没有可删除的原消息');
	}
	await notifyAllOwners(lines.join('\n'), null, false);
}

async function notifyOwnerAdVoteClosed(state) {
	if (!OWNER_IDS.length || !state?.finalized || state.result === 'approved') return;
	const sourceGroup = await formatAdVoteSourceGroup(state);
	const resultMeta = {
		rejected: {
			title: '广告举报投票已被否决',
			result: '反对方胜出',
			action: '目标未写入 D1、未执行全群封禁、未删除被举报消息。',
		},
		cancelled: {
			title: '广告举报投票已取消',
			result: '投票被有权限的用户取消',
			action: '目标未写入 D1、未执行全群封禁、未删除被举报消息。',
		},
		expired: {
			title: '广告举报投票已过期',
			result: '超过 1 小时截止时间',
			action: '目标未写入 D1、未执行全群封禁、未删除被举报消息。',
		},
	};
	const meta = resultMeta[state.result] || {
		title: '广告举报投票已结束',
		result: String(state.result || '未知结果'),
		action: '本次未执行 D1 写入或全群封禁。',
	};
	const lines = [
		'🗳️ <b>' + escapeHtml(meta.title) + '</b>',
		'📌 结果:' + escapeHtml(meta.result),
		'🎯 目标:' + formatAdVoteUser(state.targetUserSnapshot, state.targetUserId)
			+ ' <code>' + escapeHtml(state.targetUserId) + '</code>',
		'👤 发起人:' + formatAdVoteUser(state.creatorUserSnapshot, state.creatorUserId)
			+ '（' + escapeHtml(state.initiatorRole || '未知身份') + '）',
		'📍 来源群:' + sourceGroup,
		'⏰ 截止时间:<code>' + escapeHtml(formatBeijingTimeFromSeconds(state.deadlineAt)) + '</code>',
		'📊 最终票数:赞成 ' + state.approvers.length + ' / 反对 ' + state.rejecters.length,
		'✅ 赞成人:' + formatAdVoteVoters(state.approvers),
		'❎ 反对人:' + formatAdVoteVoters(state.rejecters),
		'📝 举报原因:' + escapeHtml(state.reason || '未填写'),
	];
	if (state.vetoedBy) {
		lines.push('⚡ 管理员裁决:' + formatAdVoteUser(state.vetoedBy, state.vetoedBy.id)
			+ (state.result === 'rejected' ? ' 一票否决' : ' 一票通过'));
	} else if (state.result === 'rejected') {
		lines.push('⚖️ 结束方式:反对票达到 ' + state.threshold + ' 票阈值');
	}
	if (state.cancelledBy) {
		lines.push('🚫 取消人:' + formatAdVoteUser(state.cancelledBy, state.cancelledBy.id));
	}
	lines.push('', 'ℹ️ 处理结果:' + escapeHtml(meta.action));
	await notifyAllOwners(lines.join('\n'), null, false);
}

async function enforceApprovedAdVote(env, state) {
	if (state.enforcementComplete) return;
	const blacklistResult = await addToBlacklist(state.targetUserId, env, {
		reason: 'ad_vote',
		by: state.creatorUserId,
		note: ('群内 /ad 举报投票通过' + (state.reason ? '：' + state.reason : '')).slice(0, 500),
	});
	const banResults = await banUserFromAllGroups(state.targetUserId, { probeMembership: true, revokeMessages: true });
	const historyFallback = state.reportedMessageId
		? null
		: await cleanupAdVoteSourceChatMessages(env, state.chatId, state.targetUserId);
	if (historyFallback) state.historyFallback = historyFallback;
	const deleteResult = state.reportedMessageId
		? await deleteMessage(state.chatId, state.reportedMessageId)
		: null;
	state.enforcementComplete = true;
	state.enforcedAt = new Date().toISOString();
	state.deleteStatus = state.reportedMessageId ? classifyAdDeleteOutcome(deleteResult).status : 'no_message';
	await saveFinalizedAdVoteDetails(env, state);
	await editAdVoteMessage(state.chatId, state.messageId, state);
	await notifyOwnerAdVoteApproved(state, blacklistResult, banResults, deleteResult);
}

async function finalizeAdVote(env, state, result, decisionBy = null) {
	const next = {
		...state,
		finalized: true,
		result,
		vetoedBy: result === 'cancelled' ? (state.vetoedBy || null) : (decisionBy || state.vetoedBy || null),
		cancelledBy: result === 'cancelled' ? (decisionBy || state.cancelledBy || null) : (state.cancelledBy || null),
	};
	const saved = await updateAdVoteState(env, next, state.version);
	if (!saved.ok) return { ok: false, conflict: saved.conflict, error: saved.error };
	Object.assign(next, saved.state || {});
	try {
		await editAdVoteMessage(next.chatId, next.messageId, next);
		if (result === 'approved') await enforceApprovedAdVote(env, next);
		else await notifyOwnerAdVoteClosed(next);
	} finally {
		await unpinAdVoteMessage(next.chatId, next.messageId);
	}
	return { ok: true, state: next };
}

// ===== inline 按钮翻页基建 =====
// 2026-09-09 主人要求：/words 与 /job 的「翻页：/words 2」文本提示全部改成按钮，
// 且【编辑原消息】而不是发新消息（主人在两个选项里选的就是编辑原消息）。
//
// 为什么要自己写 base64：/words 的关键词是中文，而 Telegram 的 callback_data 上限
// 【64 字节】且必须是 UTF-8 安全的短串。btoa 只吃 latin1，中文直接抛 InvalidCharacterError，
// 所以必须先 TextEncoder 编成字节再逐字节 btoa。用 base64url 变体（-_ 且去掉 =）
// 是因为 callback_data 会原样回传，+ / = 在某些客户端上会被再编码一次。
function encodeAdCallbackToken(raw) {
	const text = String(raw || '');
	if (!text) return '';
	const bytes = new TextEncoder().encode(text);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeAdCallbackToken(token) {
	const text = String(token || '');
	if (!text) return '';
	try {
		const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
		const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
		const binary = atob(padded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return new TextDecoder().decode(bytes);
	} catch (error) {
		console.error('[翻页按钮] callback_data 解码失败:', error);
		return '';
	}
}

// callback_data 是否还塞得下。超了就【不挂按钮、退回文本翻页提示】——
// 宁可退化成老样子，也不能挂一个点下去报 BUTTON_DATA_INVALID 的死按钮。
function adCallbackDataFits(data) {
	return new TextEncoder().encode(String(data || '')).length <= 64;
}

// 翻页键盘。总页数 ≤ 1 时返回 null（一页没什么可翻的，按钮纯占地方）。
// 中间那颗「第 X/Y 页」是纯展示，回调走 noop 分支只弹一个气泡，不重绘消息。
function buildAdPaginationKeyboard(prefix, page, totalPages, payloadToken) {
	if (!(totalPages > 1)) return null;
	const cell = (label, targetPage) => {
		const data = prefix + targetPage + ':' + (payloadToken || '');
		return adCallbackDataFits(data) ? { text: label, callback_data: data } : null;
	};
	const row = [];
	if (page > 1) row.push(cell('⬅️ 上一页', page - 1));
	row.push({ text: '第 ' + page + '/' + totalPages + ' 页', callback_data: prefix + 'noop' });
	if (page < totalPages) row.push(cell('下一页 ➡️', page + 1));
	// 任何一颗按钮塞不下（关键词/任务 ID 太长）就整块放弃，避免半残键盘。
	if (row.some((button) => !button)) return null;
	return { inline_keyboard: [row] };
}

// 分页消息发送器。【只有单块消息才挂按钮】：
// sendTelegramMessageChunks 把按钮挂在最后一块上，而回调编辑的也只有那一块 ——
// 多块时编辑会把整页文本塞进最后一块，前面几块变成对不上的孤儿。
// 所以多块一律降级回文本翻页提示（fallbackLine），行为与改造前完全一致。
async function sendAdPagedMessage(chatId, text, keyboard, fallbackLine) {
	const fits = splitTelegramHtmlBlocks(text).length <= 1;
	if (keyboard && fits) return await sendTelegramMessage(chatId, text, keyboard);
	const body = keyboard && fallbackLine ? text + '\n\n' + fallbackLine : text;
	return await sendTelegramMessageChunks(chatId, body);
}

async function editAdPagedMessage(chatId, messageId, text, keyboard) {
	if (!messageId) return { ok: false, error: 'message_id 缺失' };
	try {
		const response = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/editMessageText', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				chat_id: chatId,
				message_id: messageId,
				text: sanitizeTelegramText(text),
				parse_mode: 'HTML',
				disable_web_page_preview: true,
				reply_markup: keyboard || { inline_keyboard: [] }
			})
		});
		const result = await response.json();
		if (!response.ok || !result?.ok) {
			const description = result?.description || ('HTTP ' + response.status);
			// 「message is not modified」是重复点同一页的正常结果，不算故障，别刷错误日志。
			if (!/not modified/i.test(description)) console.error('[翻页按钮] editMessageText 失败:', description);
			return { ok: false, error: description };
		}
		return result;
	} catch (error) {
		console.error('[翻页按钮] editMessageText 异常:', error);
		return { ok: false, error: error.message || String(error) };
	}
}

// /words 翻页回调。data 形如 adwords:<页码>:<base64url 关键词>，或 adwords:noop。
async function handleAdWordsPaginationCallback(callbackQuery, env) {
	const data = String(callbackQuery?.data || '');
	const clickerId = String(callbackQuery?.from?.id || '');
	// 指纹库能直接决定自动封禁，权限口径必须与 /words 命令本身完全一致 —— 只给第一主人。
	// 否则任何人只要拿到一条带按钮的转发消息就能翻看整个指纹库。
	if (!isPrimaryOwner(clickerId)) {
		await answerAdVoteCallback(callbackQuery?.id, '仅限第一主人操作', true);
		return;
	}
	const body = data.slice(AD_WORDS_PAGINATION_PREFIX.length);
	if (body === 'noop') {
		await answerAdVoteCallback(callbackQuery?.id);
		return;
	}
	const match = body.match(/^(\d+):(.*)$/);
	if (!match) {
		await answerAdVoteCallback(callbackQuery?.id, '按钮数据已失效', true);
		return;
	}
	const page = Math.max(1, parseInt(match[1], 10) || 1);
	const keyword = decodeAdCallbackToken(match[2]);
	const chatId = String(callbackQuery?.message?.chat?.id || '');
	const messageId = Number(callbackQuery?.message?.message_id) || 0;
	if (!env.DB) {
		await answerAdVoteCallback(callbackQuery?.id, '未绑定 D1 存储空间', true);
		return;
	}
	const rendered = await renderAdWordsPage(env, { page, keyword });
	if (!rendered.ok) {
		await answerAdVoteCallback(callbackQuery?.id, rendered.notice || '读取指纹库失败', true);
		return;
	}
	await editAdPagedMessage(chatId, messageId, rendered.text, rendered.keyboard);
	await answerAdVoteCallback(callbackQuery?.id);
}

// /job 用户列表翻页回调。data 形如 adjob:<页码>:<base64url 任务 ID>。
async function handleBulkJobPaginationCallback(callbackQuery, env) {
	const data = String(callbackQuery?.data || '');
	const clickerId = String(callbackQuery?.from?.id || '');
	// 目标用户名单只在 isOwner 分支才会渲染，翻页口径跟着它，不放宽到全部高级管理员。
	if (!isOwner(clickerId)) {
		await answerAdVoteCallback(callbackQuery?.id, '仅限主人操作', true);
		return;
	}
	const body = data.slice(AD_JOB_PAGINATION_PREFIX.length);
	if (body === 'noop') {
		await answerAdVoteCallback(callbackQuery?.id);
		return;
	}
	const match = body.match(/^(\d+):(.*)$/);
	if (!match) {
		await answerAdVoteCallback(callbackQuery?.id, '按钮数据已失效', true);
		return;
	}
	const requestedPage = Math.max(1, parseInt(match[1], 10) || 1);
	const jobId = decodeAdCallbackToken(match[2]);
	const chatId = String(callbackQuery?.message?.chat?.id || '');
	const messageId = Number(callbackQuery?.message?.message_id) || 0;
	if (!env.DB || !jobId) {
		await answerAdVoteCallback(callbackQuery?.id, '任务不可读取', true);
		return;
	}
	const job = await loadBulkJob(env, jobId);
	if (!job) {
		await answerAdVoteCallback(callbackQuery?.id, '任务已不存在', true);
		return;
	}
	const rendered = await renderBulkJobOwnerView(env, job, requestedPage);
	await editAdPagedMessage(chatId, messageId, rendered.text, rendered.keyboard);
	await answerAdVoteCallback(callbackQuery?.id);
}

async function handleAdCallbackQuery(callbackQuery, env, ctx) {
	const data = String(callbackQuery?.data || '');
	// 三分支分流。必须排在 adv: 校验【之前】：投票分支开头那道 isConfiguredGroup
	// 会把私聊来的回调全部挡掉，而 /words 本来就只在私聊里用。
	if (data.startsWith(AD_WORDS_PAGINATION_PREFIX)) {
		await handleAdWordsPaginationCallback(callbackQuery, env);
		return;
	}
	if (data.startsWith(AD_JOB_PAGINATION_PREFIX)) {
		await handleBulkJobPaginationCallback(callbackQuery, env);
		return;
	}
	if (!data.startsWith(AD_VOTE_BUTTON_PREFIX)) return;
	const match = data.slice(AD_VOTE_BUTTON_PREFIX.length).match(/^([ARC]):(.+)$/);
	if (!match) {
		await answerAdVoteCallback(callbackQuery?.id);
		return;
	}
	const action = match[1];
	const voteToken = match[2];
	const callbackChatId = String(callbackQuery?.message?.chat?.id || '');
	const callbackMessageId = Number(callbackQuery?.message?.message_id) || 0;
	if (!isConfiguredGroup(callbackChatId)) {
		await answerAdVoteCallback(callbackQuery?.id, '该投票不属于配置群', true);
		return;
	}
	await pruneExpiredAdVotes(env);
	const state = await readAdVoteState(env, voteToken);
	if (!state) {
		await answerAdVoteCallback(callbackQuery?.id, '投票不存在或已清理', true);
		return;
	}
	if (state.chatId !== callbackChatId || Number(state.messageId) !== callbackMessageId) {
		await answerAdVoteCallback(callbackQuery?.id, '投票消息与 D1 状态不匹配', true);
		return;
	}
	if (state.finalized) {
		if (state.result === 'approved' && !state.enforcementComplete) {
			await enforceApprovedAdVote(env, state);
		}
		await unpinAdVoteMessage(state.chatId, state.messageId);
		await answerAdVoteCallback(callbackQuery?.id, '投票已结束', true);
		return;
	}
	const now = Math.floor(Date.now() / 1000);
	if (now >= state.deadlineAt) {
		await finalizeAdVote(env, state, 'expired');
		await answerAdVoteCallback(callbackQuery?.id, '投票已超过 1 小时截止时间', true);
		return;
	}

	const voterId = String(callbackQuery?.from?.id || '');
	if (!/^\d+$/.test(voterId) || callbackQuery?.from?.is_bot) {
		await answerAdVoteCallback(callbackQuery?.id, '机器人或无效账号不能投票', true);
		return;
	}
	let member = null;
	try {
		const status = await checkUserStatus(voterId, state.chatId);
		member = status?.ok ? status.result : null;
	} catch (error) {
		console.error('[/ad] 校验投票者群成员身份失败:', error);
	}
	if (!isEligibleAdVoterMember(member)) {
		const reason = member?.status === 'restricted'
			? '受限或禁言用户不能投票'
			: '你已不在来源群，不能投票';
		await answerAdVoteCallback(callbackQuery?.id, reason, true);
		return;
	}

	const voterSnapshot = snapshotAdVoteUser(callbackQuery.from);
	const voterIsAdmin = isPrivilegedManager(voterId)
		|| member?.status === 'administrator'
		|| member?.status === 'creator';
	if (action === 'C') {
		const canCancel = voterId === String(state.creatorUserId) || voterIsAdmin;
		if (!canCancel) {
			await answerAdVoteCallback(callbackQuery?.id, '仅发起人、当前群管理员或高级管理员可以取消投票', true);
			return;
		}
		const finalized = await finalizeAdVote(env, state, 'cancelled', voterSnapshot);
		if (!finalized.ok) {
			await answerAdVoteCallback(callbackQuery?.id, '投票状态刚刚发生变化，请重新点击', true);
			return;
		}
		await answerAdVoteCallback(callbackQuery?.id, '投票已取消');
		return;
	}
	if (voterIsAdmin) {
		const result = action === 'A' ? 'approved' : 'rejected';
		const finalized = await finalizeAdVote(env, state, result, voterSnapshot);
		if (!finalized.ok) {
			await answerAdVoteCallback(callbackQuery?.id, '票数刚刚发生变化，请重新点击', true);
			return;
		}
		await answerAdVoteCallback(
			callbackQuery?.id,
			action === 'A' ? '管理员赞成，一票通过' : '管理员反对，一票否决',
		);
		return;
	}

	const next = {
		...state,
		approvers: state.approvers.filter((item) => String(item.id) !== voterId),
		rejecters: state.rejecters.filter((item) => String(item.id) !== voterId),
	};
	if (action === 'A') next.approvers.push(voterSnapshot);
	else next.rejecters.push(voterSnapshot);

	if (next.approvers.length >= next.threshold || next.rejecters.length >= next.threshold) {
		const result = next.approvers.length >= next.threshold ? 'approved' : 'rejected';
		const finalized = await finalizeAdVote(env, next, result);
		if (!finalized.ok) {
			await answerAdVoteCallback(callbackQuery?.id, '票数刚刚发生变化，请重新点击', true);
			return;
		}
		await answerAdVoteCallback(callbackQuery?.id, result === 'approved' ? '投票已通过' : '投票已被否决');
		return;
	}

	const saved = await updateAdVoteState(env, next, state.version);
	if (!saved.ok) {
		await answerAdVoteCallback(callbackQuery?.id, '票数刚刚发生变化，请重新点击', true);
		return;
	}
	await editAdVoteMessage(saved.state.chatId, saved.state.messageId, saved.state);
	await answerAdVoteCallback(callbackQuery?.id);
}

function classifyAdDeleteOutcome(result) {
	if (result?.ok) {
		return { effective: true, status: 'deleted', summary: '已删除当前含广告引用的消息', detail: '' };
	}
	const rawError = String(result?.error || '未知错误');
	const lower = rawError.toLowerCase();
	if (lower.includes('message to delete not found') || lower.includes('message identifier is not specified')) {
		return {
			effective: true,
			status: 'already_deleted',
			summary: '已被其他机器人或管理员删除，等效成功',
			detail: 'Telegram 原始返回:' + rawError,
		};
	}
	const translated = translateTelegramError(rawError);
	return {
		effective: false,
		status: 'failed',
		summary: '删除失败:' + translated.中文,
		detail: '建议:' + translated.建议 + '；Telegram 原始返回:' + rawError,
	};
}




// 频道帖自动转发到关联讨论群:Telegram 用 is_automatic_forward=true 标记这类消息,
// 其 sender_chat 是来源频道、from 是 Telegram 服务账号(如 777000),内容是频道原文。
// 它【不是】群成员发言,绝不能进入任何治理路径 —— 否则:
//   ① 频道资料/正文一旦命中广告判据,机器人会删掉这条转发帖;
//   ② 被删的若正是被置顶的那条,Telegram 因置顶目标消失而【自动取消置顶】。
// 这与"真人以本群匿名管理员身份发言"(sender_chat.id === chat.id)是两回事,后者必须保留;
// 也与"真人用外部频道身份发广告"不同,那类没有 is_automatic_forward 标记。
// 因此唯一精确信号就是 is_automatic_forward,单点判定,不牵连其它场景。
function isChannelAutoForward(message) {
	return message?.is_automatic_forward === true && Boolean(message?.sender_chat);
}

async function handleMessage(message, env, ctx, requestUrl = '') {
	// 频道关联群自动转发帖直接放行:不删、不缓存、不当命令。
	// 放在最顶部,先于一切治理逻辑,保证任意频道内容(不只是像广告的)都不被误删误取消置顶。
	if (isChannelAutoForward(message)) {
		return;
	}

	// 广告检测 v2：入群资料筛查。
	// 必须放在 handleNewChatMemberBots 之前——后者对配置群的任何进群消息最后一律 return true，
	// 插在它之后会变成死代码。detectAdOnJoin 固定返回 false、不接返回值，
	// 只做「拉资料 → 评分 → 封禁或写观察窗口」，绝不短路既有的 bot 静音与进群消息清理逻辑。
	await detectAdOnJoin(message, env, ctx);

	if (await handleNewChatMemberBots(message)) {
		return;
	}

	if (!message.from && !isAnonymousAdminMessage(message)) {
		logBotModeration('skip:no-message-from', getMessageLogInfo(message));
		return;
	}

	const chatId = message.chat.id;
	const userId = message.from?.id || ANON_ADMIN_BOT_ID;
	const operatorId = getMessageActorId(message);
	const text = message.text;
	const username = message.from?.username || message.from?.first_name || (isAnonymousAdminMessage(message) ? '匿名管理员' : '用户');

	// 非配置群默认禁用 bot 指令；只放行只读的 /check 查询。
	// /check 的复制按钮会在响应构建时继续按 GROUP_IDS 严格校验。
	const isNonConfiguredGroup = message.chat.type !== 'private' && !isConfiguredGroup(chatId);
	const isSelfUnbanConfirmText = typeof text === 'string' && text.trim() === SELF_UNBAN_KEYWORD;
	const isReadOnlyExternalCheck = isNonConfiguredGroup && isCheckCommand(text);
	if (isNonConfiguredGroup && ((isTelegramSlashCommand(text) && !isReadOnlyExternalCheck) || isSelfUnbanConfirmText)) {
		return;
	}

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

	// 黑名单兜底：已黑用户在配置群里发言 → 删消息 + 立即踢出
	// 必须先于消息缓存执行，避免已黑用户刷消息继续产生 D1 写入。
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

	// 广告检测 v2 三个钩子。位置固定在黑名单兜底之后、所有命令分发之前：
	//   1) 命令层：11 条主人私聊命令，命中即 return，避免落进后面的通用命令分发。
	//   2) 回复学习：管理层回复某条消息说「广告」→ 立即判定 + 学习指纹。
	//   3) 消息层：每条群消息都拉完整资料（昵称 + 用户名 + 简介）走三层判定。
	//      早退只保留零成本的确定性排除：slash 命令、无正文且无转发、管理员。
	//      不再按正文分做预筛 —— 那个省法漏放了资料分 10 分的明显广告号，详见 detectAdOnMessage。
	// 三者都只在自己确实处理了这条消息时返回 true；否则一律返回 false 继续原流程。
	if (await handleAdDetectionCommands(message, env, ctx)) {
		return;
	}

	if (await handleAdReplyLearning(message, env, ctx)) {
		return;
	}

	if (await detectAdOnMessage(message, env)) {
		return;
	}

	// /add_ad_admin、/del_ad_admin：第一主人管理 /ad 发起白名单。
	if (text && /^\/(add_ad_admin|del_ad_admin)(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		const isInGroup = message.chat.type !== 'private';
		if (!isPrimaryOwner(userId)) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n/ad 发起白名单仅限第一主人管理。');
			}
			return;
		}
		await deleteAuthorizedGroupCommandMessage(message, '/ad-admin');
		if (!env.DB) {
			await sendAuthorizedCommandResult(message, ctx, {
				flashText: '❌ 未绑定 D1',
				detailText: '❌ 未绑定 D1 存储空间，无法管理 /ad 发起白名单。',
			});
			return;
		}
		const match = text.trim().match(/^\/(add_ad_admin|del_ad_admin)(?:@[^\s]+)?\s+(\d+)\s*$/i);
		if (!match) {
			await sendAuthorizedCommandResult(message, ctx, {
				flashText: '❌ 用法错误',
				detailText: '用法：<code>/add_ad_admin TGID</code> 或 <code>/del_ad_admin TGID</code>',
			});
			return;
		}
		const enabled = match[1].toLowerCase() === 'add_ad_admin';
		const result = await setAdVoteAllowlist(env, match[2], enabled, userId);
		const detail = result.ok
			? (enabled
				? '✅ 已将 <code>' + escapeHtml(match[2]) + '</code> 加入 /ad 发起白名单。'
				: '✅ 已将 <code>' + escapeHtml(match[2]) + '</code> 从 /ad 发起白名单移除。')
			: '❌ 更新失败：' + escapeHtml(result.error || '未知错误');
		await sendAuthorizedCommandResult(message, ctx, {
			flashText: result.ok ? '✅ /ad 白名单已更新' : '❌ /ad 白名单更新失败',
			detailText: detail,
		});
		return;
	}

	// /ad 必须先于自动广告检测：白名单成员或助推者回复广告发起投票时，不能把发起人误判为传播者。
	if (isAdCommand(text)) {
		await handleAdCommand(message, env, ctx);
		return;
	}

	// 缓存配置群普通用户消息 ID，供 /spam 引用回复后只清扫当前群、该用户的近期消息。
	// 必须排除服务消息（置顶/入群/改群名等）：它们不是用户发言，被缓存后会在清扫时
	// 连带删除 —— 删掉 pinned_message 服务消息在群里就表现为「取消置顶」。
	if (
		env.DB && isConfiguredGroup(chatId) &&
		message.from && !message.from.is_bot &&
		message.message_id &&
		!isTelegramServiceMessage(message) &&
		!(text && text.startsWith('/'))
	) {
		if (ctx && typeof ctx.waitUntil === 'function') {
			ctx.waitUntil(cacheModerationMessage(env, message));
		} else {
			await cacheModerationMessage(env, message);
		}
	}
	// ===== 自动广告治理已全部移除 =====
	// 原有的「疑似广告消息缓存 + 词库/正则自动检测」误封率极高:262 个词规模下,
	// identity 直杀词（接码/出号/收号/号商）与营销词（频道/客服/私信我）组合即定罪,
	// 正常用户"我出号了""私信请发频道"全部命中;general 227 词里还含 michael/brown 等人名。
	// 结论:词库匹配 + 组合定罪这个范式本身不可用,不是判据写得不够巧。
	// 同时移除的还有两条不看文案的自动通路（GKY 信誉库查杀、跨群刷屏检测）——
	// 按用户口径,自动广告治理一律归零,只保留真人判定:/ban、/spam、/ad 投票。
	// 将来若重做,请勿简单恢复词库匹配范式。

	// 处理 /spam 命令 - 举报加黑（支持回复消息 + 直接输入TGID + 批量，群内/私聊双场景）
	if (isSpamCommand(text)) {
		const isInGroup = message.chat.type !== 'private';
		if (isInGroup && !isConfiguredGroup(chatId)) return;

		// 仅真人可通过 /spam 写入 D1 黑名单：作为管理员的第三方机器人一律忽略（GroupAnonymousBot 匿名管理员=真人，放行）
		if (isBotOperator(message.from)) return;

		const isAdmin = await checkMessageOperatorCanBan(message, userId);
		if (!isAdmin) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n普通群管理员只能在自己管理的 GROUP_ID 配置群内使用 /spam；私聊仅限主人、副主人或超级管理员。');
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
				await sendModerationCommandFeedback(message, ctx, { flashText: usageText });
				return;
			}
			if (valid.length > BATCH_LIMIT) {
				const limitText = `❌ 一次最多 ${BATCH_LIMIT} 个 TGID（你输入了 ${valid.length} 个）`;
				await sendModerationCommandFeedback(message, ctx, { flashText: limitText });
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

			// 单条
			if (valid.length === 1 && invalid.length === 0) {
				const result = await addToBlacklist(valid[0], env, { reason: 'spam', by: operatorId, note });
				const alreadyExists = result.code === 'EXISTS';
				let targetMention = `<code>${escapeHtml(valid[0])}</code>`;
				const lines = [`🎬 操作:举报加黑(/spam)`];
				let flashText;
				if (result.success || alreadyExists) {
					const banResults = await banUserFromAllGroups(valid[0], { probeMembership: true });
					targetMention = formatTargetFromBanResults(valid[0], banResults);
					lines.push(`🎯 目标用户:${targetMention}`);
					lines.push('');
					if (alreadyExists) {
						lines.push('⚠️ <b>该用户已在黑名单中,本次已继续执行 Telegram 群封禁/预封</b>');
					}
					lines.push(await renderBanResultsDetail(banResults, null, { userId: valid[0], retryCommand: '/spam' }));
					flashText = `${result.success ? '✅ 已加黑' : '⚠️ 已存在并清扫'} <code>${valid[0]}</code>\n` + renderBanResults(banResults);
				} else {
					lines.push(`🎯 目标用户:${targetMention}`);
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
			const results = await addManyToBlacklist(valid, env, { reason: 'spam', by: operatorId, note });
			const idsToKick = [...results.success, ...results.exists];
			const userProfiles = await resolveBatchUserProfiles(idsToKick, chatId);
			const banSummary = { success: idsToKick.length, banOkAll: 0, banPartial: 0, banFailedAll: 0 };
			const perUserBanResults = await mapWithConcurrency(
				idsToKick,
				BULK_TASK_CONCURRENCY,
				async (id) => ({ userId: id, banResults: await banUserFromAllGroups(id) })
			);
			for (const { banResults } of perUserBanResults) {
				const okCount = banResults.filter((r) => r.ok).length;
				if (okCount === banResults.length) banSummary.banOkAll += 1;
				else if (okCount === 0) banSummary.banFailedAll += 1;
				else banSummary.banPartial += 1;
			}
			const failedCount = invalid.length + results.failed.length;
			const flashText = `✅ 批量加黑(/spam)：成功 ${results.success.length}${results.exists.length ? ` / 已存在 ${results.exists.length}` : ''}${failedCount ? ` / 失败 ${failedCount}` : ''}`;
			const baseDetail = renderBatchAddResult(results, invalid, banSummary, userProfiles);
			let fullDetail = baseDetail;
			if (perUserBanResults.length > 0) {
				const perUserBlocks = [];
				const chatInfoCache = new Map();
				for (const { userId: uid, banResults } of perUserBanResults) {
					const resultDetail = await renderBanResultsDetail(banResults, chatInfoCache, {
						userId: uid,
						retryCommand: '/spam',
						compactSpacing: true
					});
					perUserBlocks.push(buildTelegramAtomicHtmlBlock([
						`<b>用户</b> ${formatBatchUserCompactTarget(uid)}`,
						resultDetail
					]));
				}
				fullDetail += `\n\n<b>逐用户 Telegram 群封禁/预封明细</b>:\n\n${perUserBlocks.join('\n\n')}`;
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
		const repliedUserId = repliedMsg?.from?.id;
		if (!repliedUserId) {
			const usageText = '❌ 使用方法：\n• 回复垃圾消息后发 <code>/spam</code>\n• 或直接 <code>/spam 用户ID</code>（支持批量：<code>/spam 123,456,789</code>）';
			await sendModerationCommandFeedback(message, ctx, { flashText: usageText });
			return;
		}

		const replySpamNote = rawArg;
		const result = await addToBlacklist(repliedUserId, env, { reason: 'spam', by: operatorId, note: replySpamNote });
		const alreadyExists = result.code === 'EXISTS';
		const linkedUserId = `<a href="tg://user?id=${repliedUserId}">${repliedUserId}</a>`;

		if (result.success || alreadyExists) {
			// 加黑成功或已存在 → Telegram 群封禁/预封(revoke_messages 默认 true:封禁同时删该用户在各群全部消息)
			//   + 缓存清扫兜底(补删 revoke 偶尔漏的、当前群近期消息)
			const banResults = await banUserFromAllGroups(repliedUserId, { probeMembership: true });
			const cleanupResult = await cleanupCurrentChatUserMessages(env, chatId, repliedUserId, [repliedMsg.message_id]);

			const lines = [
				`🎬 操作:举报加黑(/spam)`,
				`🎯 目标用户:${linkedUserId} <code>${escapeHtml(String(repliedUserId))}</code>`,
				'',
				result.success
					? `✅ 已将用户 ${linkedUserId} 添加到黑名单`
					: `⚠️ 用户 ${linkedUserId} 已在黑名单中,本次已继续执行 Telegram 群封禁/预封`,
				await renderBanResultsDetail(banResults, null, { userId: repliedUserId, retryCommand: '/spam' }),
			];
			lines.push(renderCurrentChatCleanupResult(cleanupResult));
			if (cleanupResult.failed > 0 && cleanupResult.errors.length > 0) {
				const previews = cleanupResult.errors.slice(0, 3).map((item) => {
					const { 中文, 建议 } = translateTelegramError(item.error);
					return `<code>${escapeHtml(String(item.messageId))}</code>:${escapeHtml(中文)}；建议:${escapeHtml(建议)}`;
				});
				lines.push(`⚠️ 清扫失败明细:${previews.join('；')}`);
			}
			// /spam 引用模式 → 自动学习指纹（2026-09-07 落地，主人指定的方案：
			// 「通过 spam 引用确定广告之后全群封禁并自动学习，全部交给有权限的人来判定」）。
			//
			// 设计要点：
			//   1) 只在【引用模式】学 —— 这个分支本身就是「回复某条消息后发 /spam」，手上有
			//      确定的广告正文；「/spam 用户ID」那条路径没有正文，学不到任何东西。
			//   2) source 用 'spam' 而不是 'manual'：
			//      · 只要不是 'auto' 就自动跳过 learnAdFingerprints 的强动词闸门 —— 那道闸是
			//        防自动学习把「个人简介」这类中性词学成指纹的，人工判定不需要它；
			//      · 又不是 'manual'，所以仍受 markAdFingerprintFalsePositive 的退役机制约束
			//        （那句 DELETE 带 source != 'manual'）。万一判错，/ignore 累计误报后能自动
			//        清掉，不会留成永久误封源。
			//   3) 额外拉一次 getChat 取 bio：bio 是最有价值的指纹来源 —— 广告号的联系方式和
			//      引流矩阵都写在那儿，正文往往只有一句「在吗」。/spam 是低频手动指令，多一个
			//      请求无所谓，且 fetchAdUserProfile 自带 5 分钟缓存，连发不会重复请求。
			let spamLearned = 0;
			let spamSampleAdded = 0;
			let spamEnriched = 0;
			try {
				const spamText = String(repliedMsg.text || repliedMsg.caption || '');
				const spamProfile = await fetchAdUserProfile(repliedUserId, repliedMsg.from || {});
				const spamName = [spamProfile.firstName, spamProfile.lastName].filter(Boolean).join(' ').trim();
				const spamPayload = {
					name: spamName,
					username: spamProfile.username ? '@' + String(spamProfile.username).replace(/^@/, '') : '',
					bio: spamProfile.bio || '',
					text: spamText,
					domains: extractAdDomains([spamName, spamProfile.bio, spamText].filter(Boolean).join('\n'))
				};
				const spamLearn = await learnAdFingerprints(env, spamPayload, {
					source: 'spam',
					createdBy: String(operatorId ?? '')
				});
				spamLearned = Number(spamLearn?.learned || 0);

				// ===== 语义样本：AI 通过 /spam 自我学习（2026-09-08 补）=====
				// 主人原话：「AI 是通过 spam 执行自我学习的」。此前 /spam 只学指纹、不碰样本库，
				// 而 AI 层是硬命中即封，一条都不喂的话样本库永远停留在中心特征 + 手工 /addsample。
				// 取材对齐回复学习路径（项 6，_worker.js 12930-12940）：本人正文太短且不含
				// 举报 / 吐槽语义时，改用引用块内容当样本正文。线上漏放 50+ 个号的共同形态正是
				// 「正文只有一个字母 c、广告全在引用块里」—— 不这样做学进去的就是「Maybell Tillman c」
				// 这种纯噪声，对召回零帮助、还会把「英文人名 + 单字母」推成广告特征误伤正常外国用户。
				const spamQuoted = getAdQuotedText(repliedMsg);
				const useQuotedForSample = Boolean(spamQuoted)
					&& spamText.trim().length <= AD_QUOTED_KILL_MAX_OWN_TEXT
					&& !countAdKeywordHits(spamText, AD_QUOTED_KILL_NEGATORS).length;
				const spamSampleText = buildAdSampleText({
					name: spamName,
					bio: spamProfile.bio || '',
					text: useQuotedForSample ? spamQuoted : spamText
				});
				if (spamSampleText.length >= 4) {
					const spamSample = await addAdSample(env, spamSampleText, {
						source: useQuotedForSample ? 'spam-quoted' : 'spam'
					});
					if (spamSample.added) spamSampleAdded = 1;
				}
				// ===== 短语自我泛化（方案 E）：每攒够一批新样本就提炼一次共现短语 =====
				// 设计：见 enrichAdCommonPhrases 上方注释。这里【无条件】调用 —— 即使本次是
				// 重复样本（added=false），也可能已有若干条新样本在等提炼，由函数内部检查点
				// 判断是否到触发线。
				// 【不传 createdBy】刻意让它落回默认的 'enrich' —— 那是批量回滚的抓手，
				// 写成操作人 id 就没法按来源整批清理了（理由见函数内 createdBy 处注释）。
				const enrichResult = await enrichAdCommonPhrases(env, loadAdDetectionConfig(env), {});
				if (enrichResult && enrichResult.learned > 0) spamEnriched = enrichResult.learned;
			} catch (error) {
				// 学习失败绝不能影响 /spam 的本职（加黑 + 全群封禁 + 清扫）—— 那些已经做完了。
				console.error('[广告检测] /spam 学习指纹失败:', error);
			}
			if (spamLearned > 0) lines.push('🧬 已学习广告指纹:' + spamLearned + ' 条(来源 /spam 人工判定)');
			if (spamSampleAdded > 0) lines.push('🧠 已加 AI 语义样本:' + spamSampleAdded + ' 条(来源 /spam 人工判定)');
			if (spamEnriched > 0) lines.push('🧠 共性提炼:从新样本自动提炼出 ' + spamEnriched + ' 条指纹(共现 ≥2 次)');

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
			if (result.code === 'EXISTS') {
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
		const isAdmin = isPrivilegedManager(userId);
		if (!isAdmin) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限主人、副主人或超级管理员使用。');
			}
			return;
		}
		const isRun = /^\/jobrun(?:@[^\s]+)?(?:\s|$)/i.test(text.trim());
		await deleteAuthorizedGroupCommandMessage(message, isRun ? '/jobrun' : '/job');
		const jobArgs = text.trim().replace(/^\/job(?:run)?(?:@[^\s]+)?\s*/i, '').trim().split(/\s+/).filter(Boolean);
		const jobId = jobArgs[0] || '';
		const requestedPage = jobArgs[1] || '1';
		if (!jobId) {
			const usageText = '❌ 使用方法：<code>/job 任务ID [页码]</code> 或 <code>/jobrun 任务ID</code>';
			await sendModerationCommandFeedback(message, ctx, { flashText: usageText });
			return;
		}
		if (!env.DB) {
			const errorText = '❌ 批量任务需要绑定 D1 存储空间';
			await sendModerationCommandFeedback(message, ctx, { flashText: errorText });
			return;
		}
		const job = await loadBulkJob(env, jobId);
		if (!job) {
			const errorText = `❌ 未找到任务:<code>${escapeHtml(jobId)}</code>`;
			await sendModerationCommandFeedback(message, ctx, { flashText: errorText });
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
		let detailText = formatBulkJobDetail(latestJob, isRun ? '▶️ <b>批量任务已继续执行</b>' : '📦 <b>批量任务状态</b>');
		let jobKeyboard = null;
		let jobFallbackLine = '';
		if (!isRun && isOwner(userId)) {
			if (isInGroup) {
				// 群内触发时详情要经 replyToAdmin 包一层审计头（「主人操作通知 / 来源:群内」），
				// 那层包装依赖 message 上下文，回调里【还原不出来】——
				// 硬挂按钮会让编辑后的消息把审计头吃掉。所以群内路径保持原有文本翻页。
				const pageInfo = getBulkJobPageIds(latestJob, requestedPage);
				const profiles = await resolveBatchUserProfiles(pageInfo.ids, latestJob.sourceChatId);
				detailText += `\n\n${formatBulkJobUserPage(latestJob, pageInfo.page, profiles)}`;
			} else {
				const rendered = await renderBulkJobOwnerView(env, latestJob, requestedPage);
				detailText = rendered.text;
				jobKeyboard = rendered.keyboard;
				jobFallbackLine = rendered.fallbackLine;
			}
		}
		if (isInGroup) {
			await replyToAdmin(message, ctx, {
				flashText: `📦 任务状态已发送私聊 <code>${escapeHtml(job.id)}</code>`,
				detailText,
				isInGroup,
				notifySecondaryOwners: false
			});
		} else {
			await sendAdPagedMessage(chatId, detailText, jobKeyboard, jobFallbackLine);
		}
		return;
	}

	// 处理 /check 命令查询封禁状态。两种用法:
	//   ① 群内回复某条消息发 /check —— 查被回复用户(原有)
	//   ② /check <TGID> —— 私聊或群内带参数直接查指定 TGID
	if (isCheckCommand(text)) {
		const isInGroup = message.chat.type !== 'private';
		const isConfiguredSourceGroup = isConfiguredGroup(chatId);
		const dispatchSourceAllowed = !isInGroup || isConfiguredSourceGroup;

		// 解析参数:/check 后面跟的纯数字 TGID
		const checkArg = text.trim().replace(/^\/check(?:@[^\s]+)?\s*/i, '').trim();
		const hasTgidArg = /^\d+$/.test(checkArg);

		// /check 属于高级管理命令，普通 Telegram 群管理员不开放。
		const isAdmin = isPrivilegedManager(userId);
		const quietGroupCommand = isInGroup && isConfiguredSourceGroup && !isPrimaryOwner(userId);

		if (hasTgidArg) {
			// 带 TGID 参数:私聊 / 群内均可
			if (!isAdmin) {
				if (message.chat.type === 'private') {
					await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限主人、副主人或超级管理员使用。');
				}
				return;
			}
			if (quietGroupCommand) {
				await deleteAuthorizedGroupCommandMessage(message, '/check');
			} else {
				await sendTelegramMessage(chatId, `正在查询 TGID: <code>${escapeHtml(checkArg)}</code> 的封禁状态...`);
			}
			const response = await buildBanlistCheckResponse(checkArg, {
				includeReviewAction: true,
				dispatchSourceAllowed,
				env,
			});
			if (quietGroupCommand) {
				await replyToAdmin(message, ctx, {
					flashText: `🔍 查询完成 <code>${escapeHtml(checkArg)}</code>，完整结果已发送给主人`,
					detailText: response.text,
					isInGroup: true,
					replyMarkup: response.replyMarkup,
				});
			} else {
				await sendTelegramMessage(chatId, response.text, response.replyMarkup);
			}
			return;
		}

		// 无参数:沿用原"群内回复消息"用法
		if (!isInGroup) {
			if (!isAdmin) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限主人、副主人或超级管理员使用。');
				return;
			}
			await sendTelegramMessage(chatId, 'ℹ️ 私聊查询请用:<code>/check TGID</code>\n例:<code>/check 993005028</code>\n群内可回复某条消息发 <code>/check</code> 查该用户。');
			return;
		}
		if (!isAdmin) {
			return;
		}
		if (quietGroupCommand) {
			await deleteAuthorizedGroupCommandMessage(message, '/check');
		}
		const repliedUser = message.reply_to_message?.from;
		if (!repliedUser?.id) {
			const usageText = '❌ 请回复要查询封禁状态的用户消息后再发送 <code>/check</code>，或用 <code>/check TGID</code> 直接查。';
			await sendAuthorizedCommandResult(message, ctx, {
				flashText: '❌ /check 用法错误，完整提示已发送给主人',
				detailText: usageText,
			});
			return;
		}

		const tgidToCheck = repliedUser.id.toString();
		if (!quietGroupCommand) {
			await sendTelegramMessage(chatId, `正在查询 TGID: <code>${tgidToCheck}</code> 的封禁状态...`);
		}
		const response = await buildBanlistCheckResponse(tgidToCheck, {
			targetUser: repliedUser,
			includeReviewAction: true,
			dispatchSourceAllowed,
			env,
		});
		if (quietGroupCommand) {
			await replyToAdmin(message, ctx, {
				flashText: `🔍 查询完成 <code>${escapeHtml(tgidToCheck)}</code>，完整结果已发送给主人`,
				detailText: response.text,
				isInGroup: true,
				replyMarkup: response.replyMarkup,
			});
		} else {
			await sendTelegramMessage(chatId, response.text, response.replyMarkup);
		}
		return;
	}

	// 处理 /start 命令（包含 deep link 参数）
	const startCommand = parseTelegramCommand(text);
	if (startCommand.head === '/start') {
		const startArg = startCommand.rest.split(/\s+/)[0] || '';
		if (startArg.startsWith('check_')) {
			const isInGroup = message.chat.type !== 'private';
			// 二次审核属于高级管理权限，普通 Telegram 群管理员不开放。
			const isAdmin = isPrivilegedManager(userId);

			if (!isAdmin) {
				if (!isInGroup) {
					await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限主人、副主人或超级管理员使用。');
				}
				return;
			}
			const quietGroupCommand = shouldSilenceAuthorizedGroupCommand(message);
			if (quietGroupCommand) {
				await deleteAuthorizedGroupCommandMessage(message, '/start');
			}

			// 提取 TGID
			const tgidToCheck = startArg.replace('check_', '').trim();
			if (!/^\d+$/.test(tgidToCheck)) {
				await sendAuthorizedCommandResult(message, ctx, {
					flashText: '❌ TGID 格式错误，完整提示已发送给主人',
					detailText: '❌ TGID 格式错误，请使用 <code>/check TGID</code>。',
				});
				return;
			}
			if (!quietGroupCommand) {
				await sendTelegramMessage(chatId, `正在查询 TGID: <code>${tgidToCheck}</code> 的封禁状态...`);
			}
			const response = await buildBanlistCheckResponse(tgidToCheck, { includeReviewAction: true, env });
			if (quietGroupCommand) {
				await replyToAdmin(message, ctx, {
					flashText: `🔍 查询完成 <code>${escapeHtml(tgidToCheck)}</code>，完整结果已发送给主人`,
					detailText: response.text,
					isInGroup: true,
					replyMarkup: response.replyMarkup,
				});
			} else {
				await sendTelegramMessage(chatId, response.text, response.replyMarkup);
			}
			return;
		}

		// 普通的 /start 命令在后面的欢迎消息分支统一处理
	}

	// 处理 /blacklist 命令 - 私聊管理员查看 D1 黑名单
	if (text && /^\/blacklist(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		if (message.chat.type !== 'private') {
			const isAdmin = isPrivilegedManager(userId);
			if (isAdmin) {
				await deleteAuthorizedGroupCommandMessage(message, '/blacklist');
			}
			if (!isAdmin || isPrimaryOwner(userId)) return;
			if (!env.DB) {
				await replyToAdmin(message, ctx, {
					flashText: '❌ 未绑定 D1，完整结果已发送给主人',
					detailText: '❌ 未绑定 D1 存储空间，无法查看黑名单。',
					isInGroup: true,
				});
				return;
			}
			const [total, blacklist] = await Promise.all([
				getD1BlacklistCount(env),
				readD1BlacklistRecent(env, BLACKLIST_PAGE_LIMIT)
			]);
			const operatorUsernames = await resolveBlacklistOperatorUsernames(blacklist);
			await replyToAdmin(message, ctx, {
				flashText: `📋 黑名单共 ${total} 条，完整结果已发送给主人`,
				detailText: renderBlacklist(blacklist, { total, alreadyRecent: true, operatorUsernames }),
				isInGroup: true,
			});
			return;
		}

		const isAdmin = isPrivilegedManager(userId);
		if (!isAdmin) {
			await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限主人、副主人或超级管理员使用。');
			return;
		}

		if (!env.DB) {
			await sendTelegramMessage(chatId, '❌ 未绑定 D1 存储空间，无法查看黑名单。');
			return;
		}

		const [total, blacklist] = await Promise.all([
			getD1BlacklistCount(env),
			readD1BlacklistRecent(env, BLACKLIST_PAGE_LIMIT)
		]);
		const operatorUsernames = await resolveBlacklistOperatorUsernames(blacklist);
		// 保持单条发送：splitTelegramHtmlBlocks 的阈值按 HTML 原文长度算（30 条原文约
		// 4800 字符 > 3500），会把本来发得出去的一条消息无谓拆成两条。默认 30 条可见字符
		// 仅约 2800，远低于 Telegram 的 4096 上限，单条足够。
		// 若把 BLACKLIST_PAGE_LIMIT 调到 45 条以上，再改用 sendTelegramMessageChunks。
		await sendTelegramMessage(chatId, renderBlacklist(blacklist, { total, alreadyRecent: true, operatorUsernames }));
		return;
	}

	// ===== /help 第一主人专属帮助(展开全部隐藏指令)=====
	// 仅 OWNER_IDS[0] 第一主人可用。其他角色群内静默、私聊提示权限不足。
	if (text && /^\/help(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		const isInGroup = message.chat.type !== 'private';
		const isOwnerUser = isPrimaryOwner(userId);
		if (!isOwnerUser) {
			// 群内完全静默(连"权限不足"都不发,避免暴露命令存在);私聊也不暴露隐藏指令
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n该命令仅限第一主人使用。');
			}
			return;
		}
		await deleteAuthorizedGroupCommandMessage(message, '/help');
		// 隐藏指令仅在私聊展开(群内不回,避免其他成员看到指令清单)
		if (isInGroup) {
			// 刻意显式传 6000（略长于 FLASH_MESSAGE_TTL_MS 默认值）：这条是引导性提示，
			// 要留够时间让主人看到"去私聊发 /help"，不随全局时长调短。
			await sendFlashMessage(chatId, 'ℹ️ 请私聊我发送 /help 查看 OWNER_IDS 专属指令。', ctx, 6000);
			return;
		}
		// 命令一律【裸文本】不包 <code>：Telegram 只会把纯文本里的 /xxx 识别成 bot_command
		// 实体、渲染成蓝色链接并支持「点一下直接发送」；一旦包进 <code>，点击就只是复制。
		const helpLines = [
			'🔐 <b>第一主人专属指令</b>（其他人无反应，也不出现在命令菜单里）',
			'',
			'<b>━━ 人工封禁 ━━</b>',
			'/ban TGID [原因]　加入全局黑名单 + 全群封禁',
			'/spam　回复广告使用：删消息 + 全群封禁 + 撤回其历史发言',
			'/unban TGID　移出黑名单 + 全群解封（裸发 /unban 是自己走自助解封，不是解封别人）',
			'',
			'<b>━━ 广告举报投票 ━━</b>',
			'/ad [原因]　回复广告发起群内投票，通过后加黑并全群封禁',
			'/add_ad_admin TGID　允许该成员发起 /ad 投票',
			'/del_ad_admin TGID　取消该成员的发起权限',
			'',
			'<b>━━ 动态群组（仅私聊）━━</b>',
			'/addgroup -100xxx [备注]　新增治理群组，不用改环境变量',
			'/delgroup -100xxx　不再治理该群，bot 仍留在群里',
			'/listgroups　列出全部生效群组',
			'',
			'<b>━━ 查询与退群（仅私聊）━━</b>',
			'/admins　查看主人 / 副主人 / 超级管理员名单',
			'/groups　查看当前生效群组信息',
			'/leavegroup -100xxx　让 bot 退出该群',
			'',
			'<b>━━ 广告检测与指纹库（仅私聊）━━</b>',
			'自动判定为广告的用户会即时加黑 + 全群封禁 + 自动学入指纹与 AI 样本，并把快照推给你复核。',
			'判定正确无需任何操作；快照长期保留，只在误判时用 /ignore 回滚。',
			'/pending [N]　列出待复核的自动判定快照，默认 10 条（最新在前）',
			'/ignore 序号　判定错误：解黑 + 全群解封 + 删掉学到的指纹与 AI 样本',
			'　　支持批量 /ignore 3 5 7 与区间 /ignore 3-8',
			'/rescreen [N]　重新筛查观察窗口里的可疑用户，默认 10 人',
			'/adstats　指纹库规模、分类占比、Top 命中、观察窗口与配置总览',
			'',
			'<b>━━ 指纹与样本维护（仅私聊）━━</b>',
			'/words [关键词] [页码]　翻看指纹库，按命中次数倒序，每页 ' + AD_WORDS_PAGE_LIMIT + ' 条',
			'　　带关键词即搜索（只匹配指纹内容，不匹配来源），翻页用消息下方按钮',
			'/addword 值 [类型]　手动新增指纹，类型可省略自动推断',
			'/delword 值　删除指纹',
			'/delword noise　批量删掉命中 0 次的噪声指纹（需二次确认，不动种子）',
			'/delword type:username　批量删掉整类指纹（需二次确认，不动种子）',
			'/addsample 文本　新增 AI 语义比对样本',
			'/warmup　补齐样本向量（向量为 0 时第三层 AI 不生效，反复发直到补满）',
			'/clearsamples　清空全部 AI 样本，需二次确认令牌',
			'/whitelist [list|add|del] [域名]　维护域名白名单，命中即豁免',
		];
		await sendTelegramMessageChunks(chatId, helpLines.join('\n'));
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

	// ===== /leavegroup 主人私聊命令：让 bot 退出指定群组 =====
	// 仅 OWNER_IDS[0] 主人私聊可用；群内发送只撤回命令，不执行退出。
	if (text && /^\/leavegroup(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		const isInGroup = message.chat.type !== 'private';
		if (!isPrimaryOwner(userId)) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n该命令仅限主人私聊使用。');
			}
			return;
		}
		if (isInGroup) {
			await deleteAuthorizedGroupCommandMessage(message, '/leavegroup');
			return;
		}

		const argMatch = text.trim().match(/^\/leavegroup(?:@[^\s]+)?\s+(-\d{5,20})\s*$/i);
		if (!argMatch) {
			await sendTelegramMessage(chatId, '用法:<code>/leavegroup -1001234567890</code>\n仅支持负数群组 ID。');
			return;
		}

		const targetChatId = argMatch[1];
		const chatInfo = await getChatInfoFromId(targetChatId);
		const groupTitle = chatInfo?.title || '未知群组';
		const groupLines = [
			`群组:<b>${escapeHtml(groupTitle)}</b>`,
			`群组ID:<code>${escapeHtml(targetChatId)}</code>`
		].join('\n');

		const beforeLeave = await getBotChatMembership(targetChatId);
		if (beforeLeave.ok && !beforeLeave.inChat) {
			await sendTelegramMessage(chatId, `ℹ️ bot 已不在该群组\n${groupLines}\n状态:${escapeHtml(formatBotChatMembershipStatus(beforeLeave))}`);
			return;
		}
		if (!beforeLeave.ok) {
			await sendTelegramMessage(chatId, `❌ 退出群组失败\n${groupLines}\n原因:无法确认 bot 当前是否仍在群内，已取消退出操作。${escapeHtml(translateLeaveChatError(beforeLeave.error))}`);
			return;
		}

		const result = await leaveTelegramChat(targetChatId);
		if (!result.ok) {
			await sendTelegramMessage(chatId, `❌ 退出群组失败\n${groupLines}\n原因:${escapeHtml(translateLeaveChatError(result.error))}`);
			return;
		}

		const afterLeave = await getBotChatMembership(targetChatId);
		if (afterLeave.ok && !afterLeave.inChat) {
			await sendTelegramMessage(chatId, `✅ 已确认退出群组\n${groupLines}\n状态:${escapeHtml(formatBotChatMembershipStatus(afterLeave))}`);
		} else if (afterLeave.ok && afterLeave.inChat) {
			await sendTelegramMessage(chatId, `❌ 退出群组失败\n${groupLines}\n原因:Telegram 已返回退出成功，但复查显示 bot 仍在群内（状态:${escapeHtml(formatBotChatMembershipStatus(afterLeave))}）。`);
		} else {
			await sendTelegramMessage(chatId, `⚠️ 退出请求已发送，但无法确认最终状态\n${groupLines}\n原因:${escapeHtml(translateLeaveChatError(afterLeave.error))}`);
		}
		return;
	}

	// ===== 动态群组管理命令（仅第一主人、仅私聊）=====
	// /addgroup -100xxxx [备注] | /delgroup -100xxxx | /listgroups
	// 加进来的群与 GROUP_ID 环境变量分离存放（Worker 无法写自己的环境变量），
	// 但合并后享受完全相同的治理能力：封禁/踢人/广告检测/黑名单拦截/purge/批量任务。
	if (text && /^\/(addgroup|delgroup|listgroups)(?:@[^\s]+)?(?:\s|$)/i.test(text.trim())) {
		const isInGroup = message.chat.type !== 'private';
		// 群内一律静默（避免泄漏命令存在），私聊才给权限提示
		if (!isPrimaryOwner(userId)) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n动态群组管理仅限第一主人使用。');
			}
			return;
		}
		if (isInGroup) {
			// 群组管理是全局配置，强制私聊执行，避免群内误操作与信息外泄
			await deleteAuthorizedGroupCommandMessage(message, '/groups');
			await sendTelegramMessage(userId, 'ℹ️ 动态群组管理命令请在私聊中使用。');
			return;
		}
		if (!env.DB) {
			await sendTelegramMessage(chatId, '❌ 未绑定 D1 存储空间，无法管理动态群组。');
			return;
		}

		const { head, rest } = parseTelegramCommand(text);

		if (head === '/listgroups') {
			const rows = await loadDynamicGroupsFromD1(env);
			const lines = ['🗂️ <b>当前生效的群组</b>', ''];
			lines.push(`<b>环境变量群（GROUP_ID，共 ${ENV_GROUP_IDS.length} 个）</b>`);
			if (ENV_GROUP_IDS.length === 0) {
				lines.push('  （空）');
			} else {
				ENV_GROUP_IDS.forEach((id, index) => {
					const mark = index === 0 ? ' ⭐ 主群' : '';
					lines.push(`  ${index + 1}. <code>${escapeHtml(String(id))}</code>${mark}`);
				});
			}
			lines.push('', `<b>指令添加群（D1，共 ${rows.length} 个）</b>`);
			if (rows.length === 0) {
				lines.push('  （空）', '', '用 <code>/addgroup -100xxxx 备注</code> 添加。');
			} else {
				rows.forEach((row, index) => {
					const title = row.title ? escapeHtml(row.title) : '未知群名';
					lines.push(`  ${index + 1}. <b>${title}</b> <code>${escapeHtml(row.chatId)}</code>`);
					const meta = [];
					if (row.note) meta.push(`备注:${escapeHtml(row.note)}`);
					if (row.addedAt) meta.push(`添加于 ${escapeHtml(row.addedAt)}`);
					if (meta.length) lines.push(`     ${meta.join(' · ')}`);
				});
			}
			lines.push('', `📊 合计生效群组:${ENV_GROUP_IDS.length + rows.length} 个`);
			lines.push('ℹ️ 主群固定为 GROUP_ID 第一个群，指令添加的群不会顶替主群。');
			await sendTelegramMessageChunks(chatId, lines.join('\n'));
			return;
		}

		const groupArg = String(rest || '').trim();
		const [rawId, ...noteParts] = groupArg.split(/\s+/);
		const targetGroupId = String(rawId || '').trim();

		if (head === '/delgroup') {
			if (!targetGroupId) {
				await sendTelegramMessage(chatId, '用法:<code>/delgroup -100xxxx</code>');
				return;
			}
			if (ENV_GROUP_IDS.some((g) => String(g) === targetGroupId)) {
				await sendTelegramMessage(chatId, `⚠️ <code>${escapeHtml(targetGroupId)}</code> 来自 GROUP_ID 环境变量，无法用指令移除。\n请到 Cloudflare 后台修改 GROUP_ID。`);
				return;
			}
			const removed = await removeDynamicGroup(env, targetGroupId);
			await sendTelegramMessage(
				chatId,
				removed.ok
					? `✅ 已移除动态群组 <code>${escapeHtml(targetGroupId)}</code>\nℹ️ bot 仍在该群内，如需退群请用 <code>/leavegroup ${escapeHtml(targetGroupId)}</code>。`
					: `❌ 移除失败:${escapeHtml(removed.message || '未知错误')}`,
			);
			return;
		}

		// /addgroup
		// 先查"是否已配置"再查格式：已在配置里的群回一句"无需重复添加"比"格式错误"有用得多，
		// 也兼容历史上 GROUP_ID 里填过非 -100 群组 ID 的部署。
		if (ENV_GROUP_IDS.some((g) => String(g) === targetGroupId)) {
			await sendTelegramMessage(chatId, `⚠️ <code>${escapeHtml(targetGroupId)}</code> 已在 GROUP_ID 环境变量中，无需重复添加。`);
			return;
		}
		if (isDynamicGroup(targetGroupId)) {
			await sendTelegramMessage(chatId, `⚠️ <code>${escapeHtml(targetGroupId)}</code> 已在动态群组列表中。`);
			return;
		}
		if (!isSupergroupChatId(targetGroupId)) {
			await sendTelegramMessage(chatId, '用法:<code>/addgroup -100xxxx [备注]</code>\n群组 ID 必须是 <code>-100</code> 开头的超级群组 ID。');
			return;
		}
		// 硬性前置：bot 必须已是该群管理员且具备封禁权限，否则加进来只会全程报错。
		// 复用 /purge 预检逻辑，同时顺带拿到群名存库。
		const botId = await getBotId();
		if (!botId) {
			await sendTelegramMessage(chatId, '❌ 无法获取机器人 ID，暂时无法校验群权限，请稍后重试。');
			return;
		}
		const access = await checkPurgeGroupAccess(targetGroupId, botId);
		if (!access.ok) {
			await sendTelegramMessage(
				chatId,
				`❌ 无法添加 <code>${escapeHtml(targetGroupId)}</code>\n原因:${escapeHtml(access.reason || '未知')}\n\n请先把 bot 拉进该群、设为管理员并开启「封禁用户」权限。`,
			);
			return;
		}
		let groupTitle = '';
		try {
			const info = await getChatInfoFromId(targetGroupId);
			groupTitle = String(info?.title || '').trim();
		} catch (_) { /* 群名获取失败不阻断添加 */ }

		const added = await addDynamicGroup(env, targetGroupId, {
			title: groupTitle || null,
			addedBy: String(userId),
			note: noteParts.join(' ').trim(),
		});
		if (!added.ok) {
			await sendTelegramMessage(chatId, `❌ 添加失败:${escapeHtml(added.message || '未知错误')}`);
			return;
		}
		const totalGroups = ENV_GROUP_IDS.length + DYNAMIC_GROUP_IDS.length + 1;
		await sendTelegramMessage(
			chatId,
			[
				`✅ <b>已添加动态群组</b>`,
				`🏷️ 群名:${groupTitle ? `<b>${escapeHtml(groupTitle)}</b>` : '未知'}`,
				`🆔 群 ID:<code>${escapeHtml(targetGroupId)}</code>`,
				`🤖 bot 身份:${escapeHtml(access.status || '管理员')}`,
				noteParts.length ? `📝 备注:${escapeHtml(noteParts.join(' ').trim())}` : '',
				'',
				`📊 当前生效群组:${totalGroups} 个（环境变量 ${ENV_GROUP_IDS.length} + 指令添加 ${DYNAMIC_GROUP_IDS.length + 1}）`,
				'',
				'ℹ️ 该群已纳入全套治理:黑名单拦截、复入群踢回、广告自动检测、/ban /spam 全群封禁、/purge 清扫、批量任务。',
				'⚠️ 群数增加会线性放大全群操作的耗时与请求数，批量任务会更早转为异步执行。',
			].filter(Boolean).join('\n'),
		);
		return;
	}




	// 处理 /ban 命令 - 添加用户到黑名单（支持批量、群内/私聊双场景；兼容 /ban@机器人名）
	if (isBanCommand(text)) {
		const isInGroup = message.chat.type !== 'private';
		if (isInGroup && !isConfiguredGroup(chatId)) return;

		// 仅真人可通过 /ban 写入 D1 黑名单：作为管理员的第三方机器人一律忽略（GroupAnonymousBot 匿名管理员=真人，放行）
		if (isBotOperator(message.from)) return;

		// 普通管理员必须是当前群管理员；高级管理员保持原有权限。
		const isAdmin = await checkMessageOperatorCanBan(message, userId);
		if (!isAdmin) {
			// 群内静默忽略（避免泄漏命令存在）；私聊明确告知权限不足
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n普通群管理员只能在自己管理的 GROUP_ID 配置群内使用 /ban；私聊仅限主人、副主人或超级管理员。');
			}
			return;
		}
		await deleteAuthorizedGroupCommandMessage(message, '/ban');

		// 提取参数（支持单个 / 批量；开头 TGID 列表之后的文本作为执行原因）
		// 用正则提取,与 /spam 完全对称:兼容 /ban、/ban@机器人名、多空格;彻底不依赖命令长度,
		// 根除早期 slice(5) 吃掉参数首字符那类"命令一改短就错位"的隐患。
		const argMatch = text.trim().match(/^\/ban(?:@[^\s]+)?\s*([\s\S]*)/i);
		const rawArg = argMatch ? argMatch[1] : '';
		const { valid, invalid, note } = parseTargetIdsAndNote(rawArg);

		if (valid.length === 0 && invalid.length === 0) {
			const usageText = `❌ 使用方法：<code>/ban 用户ID</code> 或 <code>/ban 123,456,789</code>（最多 ${BATCH_LIMIT} 个）`;
			await sendModerationCommandFeedback(message, ctx, { flashText: usageText });
			return;
		}
		if (valid.length > BATCH_LIMIT) {
			const limitText = `❌ 一次最多 ${BATCH_LIMIT} 个 TGID（你输入了 ${valid.length} 个）`;
			await sendModerationCommandFeedback(message, ctx, { flashText: limitText });
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

		// 单条且无格式错误
		if (valid.length === 1 && invalid.length === 0) {
			const result = await addToBlacklist(valid[0], env, { reason: 'manual', by: operatorId, note });
			const alreadyExists = result.code === 'EXISTS';
			// 统一详情格式:无论成功失败都展示完整字段
			let targetMention = `<code>${escapeHtml(valid[0])}</code>`;
			const lines = [`🎬 操作:加入黑名单`];
			let flashText;
			if (result.success || alreadyExists) {
				const banResults = await banUserFromAllGroups(valid[0], { probeMembership: true });
				// 与 /spam 对齐：Telegram 的 revoke_messages 只对【仍在群里】的成员生效，
				// 目标若已退群/已被别人踢过就变成预封，历史发言一条都撤不掉。
				// 这里补一层兜底：从 moderation_messages 捞出该 TGID 在【当前群】缓存的消息 ID
				// 逐条 deleteMessage。仅群内执行时做 —— 私聊没有"当前群"的概念；
				// 批量路径也不做，N 个目标 × 最多 200 条会直接撞 Cloudflare 子请求上限。
				const cleanupResult = isInGroup
					? await cleanupCurrentChatUserMessages(env, chatId, valid[0])
					: null;
				targetMention = formatTargetFromBanResults(valid[0], banResults);
				lines.push(`🎯 目标用户:${targetMention}`);
				lines.push('');
				if (alreadyExists) {
					lines.push('⚠️ <b>该用户已在黑名单中,本次已继续执行 Telegram 群封禁/预封</b>');
				}
				lines.push(await renderBanResultsDetail(banResults, null, { userId: valid[0], retryCommand: '/ban' }));
				if (cleanupResult) {
					lines.push(renderCurrentChatCleanupResult(cleanupResult));
					if (cleanupResult.failed > 0 && cleanupResult.errors.length > 0) {
						const previews = cleanupResult.errors.slice(0, 3).map((item) => {
							const { 中文, 建议 } = translateTelegramError(item.error);
							return `<code>${escapeHtml(String(item.messageId))}</code>:${escapeHtml(中文)}；建议:${escapeHtml(建议)}`;
						});
						lines.push(`⚠️ 清扫失败明细:${previews.join('；')}`);
					}
				}
				flashText = `${result.success ? '✅ 已加黑' : '⚠️ 已存在并清扫'} <code>${valid[0]}</code>\n` + renderBanResults(banResults);
			} else {
				// 失败(已存在/未绑存储等)→ 追加原因
				lines.push(`🎯 目标用户:${targetMention}`);
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
		const results = await addManyToBlacklist(valid, env, { reason: 'manual', by: operatorId, note });
		const idsToKick = [...results.success, ...results.exists];
		const userProfiles = await resolveBatchUserProfiles(idsToKick, chatId);
		const banSummary = { success: idsToKick.length, banOkAll: 0, banPartial: 0, banFailedAll: 0 };
		// 每次最多并发 3 个用户；每个用户内部仍按配置群串行，避免连接与 Telegram 限流突增。
		const perUserBanResults = await mapWithConcurrency(
			idsToKick,
			BULK_TASK_CONCURRENCY,
			async (id) => ({ userId: id, banResults: await banUserFromAllGroups(id) })
		);
		for (const { banResults } of perUserBanResults) {
			const okCount = banResults.filter((r) => r.ok).length;
			if (okCount === banResults.length) banSummary.banOkAll += 1;
			else if (okCount === 0) banSummary.banFailedAll += 1;
			else banSummary.banPartial += 1;
		}
		const failedCount = invalid.length + results.failed.length;
		const flashText = `✅ 批量加黑：成功 ${results.success.length}${results.exists.length ? ` / 已存在 ${results.exists.length}` : ''}${failedCount ? ` / 失败 ${failedCount}` : ''}`;
		// 详细 detailText：批量汇总 + 每个用户的逐群明细
		const baseDetail = renderBatchAddResult(results, invalid, banSummary, userProfiles);
		let fullDetail = baseDetail;
		if (perUserBanResults.length > 0) {
			const perUserBlocks = [];
			const chatInfoCache = new Map();
			for (const { userId: uid, banResults } of perUserBanResults) {
				const resultDetail = await renderBanResultsDetail(banResults, chatInfoCache, {
					userId: uid,
					retryCommand: '/ban',
					compactSpacing: true
				});
				perUserBlocks.push(buildTelegramAtomicHtmlBlock([
					`<b>用户</b> ${formatBatchUserCompactTarget(uid)}`,
					resultDetail
				]));
			}
			fullDetail += `\n\n<b>逐用户 Telegram 群封禁/预封明细</b>:\n\n${perUserBlocks.join('\n\n')}`;
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
	const unbanCommand = parseTelegramCommand(text);
	if (unbanCommand.head === '/unban') {
		const rest = unbanCommand.rest;

		// 如果有参数，处理黑名单移除
		if (rest.trim()) {
			const isInGroup = message.chat.type !== 'private';

			// /unban 只能由主人、副主人或超级管理员执行。
			const isAdmin = isPrivilegedManager(userId);
			if (!isAdmin) {
				if (!isInGroup) {
					await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n/unban 仅限主人、副主人或超级管理员使用。');
				}
				return;
			}
			await deleteAuthorizedGroupCommandMessage(message, '/unban');

			const { valid, invalid } = parseBatchTgids(rest);

			if (valid.length === 0 && invalid.length === 0) {
				const usageText = `❌ 使用方法：<code>/unban 用户ID</code> 或 <code>/unban 123,456,789</code>（最多 ${BATCH_LIMIT} 个）`;
				await sendModerationCommandFeedback(message, ctx, { flashText: usageText });
				return;
			}
			if (valid.length > BATCH_LIMIT) {
				const limitText = `❌ 一次最多 ${BATCH_LIMIT} 个 TGID（你输入了 ${valid.length} 个）`;
				await sendModerationCommandFeedback(message, ctx, { flashText: limitText });
				return;
			}
			if (await startBulkModerationJobFromCommand(message, env, ctx, {
				action: 'unban',
				valid,
				invalid,
				note: '',
				isInGroup,
				requestUrl
			})) {
				return;
			}

			// 单条且无格式错误
			if (valid.length === 1 && invalid.length === 0) {
				const targetId = valid[0];
				const eligibility = await checkManyUnbanEligibility([targetId], env, { allowD1Removal: isAdmin });
				const userProfiles = await resolveBatchUserProfiles([targetId], chatId);
				const targetMention = formatBatchUserTarget(targetId, userProfiles);
				const lines = [
					`🎬 操作:D1 黑名单资格检查 + Telegram 原生群解封`,
					`🎯 目标用户:${targetMention}`,
					'',
				];

				if (eligibility.blacklisted.includes(targetId)) {
					lines.push('⛔ <b>目标仍在 D1 黑名单，已拒绝解封</b>', 'ℹ️ D1 记录保持不变，未调用 Telegram 解封接口。');
					await replyToAdmin(message, ctx, {
						flashText: `⛔ <code>${targetId}</code> 在 D1 黑名单，已拒绝解封`,
						detailText: lines.join('\n'),
						isInGroup
					});
					return;
				}

				if (!eligibility.eligible.includes(targetId)) {
					const failure = eligibility.failed.find((item) => item.id === targetId);
					const failureText = failure?.msg || '❌ 无法确认 D1 黑名单状态，已拒绝解封';
					lines.push(escapeHtml(failureText), 'ℹ️ 为避免绕过全局黑名单，本次未调用 Telegram 解封接口。');
					await replyToAdmin(message, ctx, {
						flashText: `❌ <code>${targetId}</code> 无法确认 D1 状态，已拒绝解封`,
						detailText: lines.join('\n'),
						isInGroup
					});
					return;
				}

				const d1RecordRemoved = eligibility.d1Removed.includes(targetId);
				const unbanResults = await unbanUserFromAllGroups(targetId);
				lines.push(
					d1RecordRemoved
						? '✅ <b>目标原在 D1 黑名单，已由管理层移除记录并允许解封</b>'
						: '✅ <b>目标不在 D1 黑名单，允许执行 Telegram 原生解封</b>',
					d1RecordRemoved
						? 'ℹ️ D1 黑名单记录已删除；本次仅调用 Telegram 原生解封接口。'
						: 'ℹ️ 本次未修改任何 D1 记录。',
					'',
					'<b>Telegram 群解封结果</b>:',
					await renderUnbanResultsDetail(unbanResults, null, { userId: targetId, retryCommand: '/unban' })
				);
				await replyToAdmin(message, ctx, {
					flashText: `🔓 <code>${targetId}</code> D1 检查通过，已尝试群解封\n${renderUnbanResults(unbanResults)}`,
					detailText: lines.join('\n'),
					isInGroup
				});
				return;
			}

			// 批量：管理层先移除命中的 D1 记录，再对全部资格通过目标执行群解封。
			const results = await checkManyUnbanEligibility(valid, env, { allowD1Removal: isAdmin });
			const idsToUnban = [...results.eligible];
			const userProfiles = await resolveBatchUserProfiles(valid, chatId);
			const unbanSummary = { okAll: 0, partial: 0, failedAll: 0 };
			const perUserUnbanResults = await mapWithConcurrency(
				idsToUnban,
				BULK_TASK_CONCURRENCY,
				async (id) => ({ userId: id, unbanResults: await unbanUserFromAllGroups(id) })
			);
			for (const { unbanResults } of perUserUnbanResults) {
				const okCount = unbanResults.filter((r) => r.ok).length;
				if (okCount === unbanResults.length) unbanSummary.okAll += 1;
				else if (okCount === 0) unbanSummary.failedAll += 1;
				else unbanSummary.partial += 1;
			}
			const failedCount = invalid.length + results.failed.length;
			const flashText = `🔓 批量解封：允许 ${results.eligible.length}${results.blacklisted.length ? ` / D1拒绝 ${results.blacklisted.length}` : ''}${failedCount ? ` / 失败 ${failedCount}` : ''}`;
			let detailText = renderBatchUnbanEligibilityResult(results, invalid, userProfiles);
			if (idsToUnban.length > 0) {
				const unbanHeaderLines = ['<b>Telegram 群解封结果</b>:', `✅ 全部群解封成功: ${unbanSummary.okAll}`];
				if (unbanSummary.partial) unbanHeaderLines.push(`⚠️ 部分群解封: ${unbanSummary.partial}`);
				if (unbanSummary.failedAll) unbanHeaderLines.push(`❌ 全部群解封失败: ${unbanSummary.failedAll}（请检查 bot 是否为群管理员）`);
				const perUserBlocks = [];
				const chatInfoCache = new Map();
				for (const { userId: uid, unbanResults } of perUserUnbanResults) {
					const resultDetail = await renderUnbanResultsDetail(unbanResults, chatInfoCache, {
						userId: uid,
						retryCommand: '/unban',
						compactSpacing: true
					});
					perUserBlocks.push(buildTelegramAtomicHtmlBlock([
						`<b>用户</b> ${formatBatchUserCompactTarget(uid)}`,
						resultDetail
					]));
				}
				detailText += `\n\n${unbanHeaderLines.join('\n')}\n\n${perUserBlocks.join('\n\n')}`;
			}
			await replyToAdmin(message, ctx, {
				flashText,
				detailText,
				isInGroup
			});
			return;
		}
	}

	// ===== 无参 /start —— 机器人介绍欢迎语 =====
	// 与下面 /unban 的自助解封清单【刻意拆开】：/start 是 Telegram 在用户首次打开 bot 时
	// 自动发送的命令，任何人第一眼看到的就是它；而解封清单含 {keyword} 确认整句，
	// 第一主人在群里发 /start 会把这句口令明文贴进群，等于公开教学如何触发解封。
	// 拆开后 /start 只做自我介绍并引导用户去 /unban，群里发也无害。
	if (startCommand.head === '/start' && !startCommand.rest) {
		// 群聊权限与拆分前完全一致：只有第一主人能触发，其他任何人（普通成员、群管理员、
		// 超级管理员、副主人、匿名管理员）一律【纯静默】—— 不回、不撤回、不通知主人、
		// 零 Telegram 请求。私聊不进此判定，任何人都能看到介绍语。
		if (message.chat.type !== 'private' && !isPrimaryOwner(getMessageActorId(message))) {
			return;
		}
		// 刻意【不】走 blockSelfUnbanIfBlacklisted：这段只是自我介绍，黑名单用户也该看得到
		// "这是什么 bot"；等他发 /unban 时再由那道闸门拒绝，闸门本身一点没削弱。
		// 但「黑名单用户来了」这个信号不能丢，仍要报给主人 —— 用 kind='start' 区分文案，
		// 主人一眼就能分清对方只是打开了 bot，还是真的在尝试解封。
		// 查询失败（checkFailed）不通报：那是 D1 异常而非用户行为，报了只会误导。
		try {
			const startCheck = await checkBlacklist(userId, env, { strict: true });
			if (startCheck.isBlacklisted && !startCheck.checkFailed) {
				// 用 waitUntil 异步投递：通知失败不该拖慢或阻断介绍语的回复
				ctx.waitUntil(notifyOwnerBlacklistAppeal(message.from, startCheck, 'start'));
			}
		} catch (error) {
			console.error('[/start] 黑名单知情通报失败:', error);
		}
		// {title} 需要额外一次 getChat，默认文案并不使用它，所以按需才查。
		const startTitle = START_WELCOME.includes('{title}') ? (await getGroupInfo()).title : '';
		await sendTelegramMessage(chatId, START_WELCOME
			.replaceAll('{userId}', String(userId))
			.replaceAll('{title}', startTitle));
		return;
	}

	// 处理无参 /unban - 自助解封检查清单
	if (unbanCommand.head === '/unban' && !unbanCommand.rest) {
		// 群聊里的自助解封入口只对第一主人开放：任何其他人（普通成员、群管理员、
		// 超级管理员、副主人、匿名管理员）在配置群发无参 /unban 一律【纯静默】——
		// 不回欢迎语、不撤回命令、不私聊主人、不产生任何 Telegram 请求。
		// 原因：这段清单是给「被封禁用户私聊 bot」用的自助流程，任何人都能在群里
		// 把它刷出来会污染群消息流，且清单里含解封确认整句，等于公开教学如何触发解封。
		// 私聊完全不进此判定，权限与行为保持原样。
		if (message.chat.type !== 'private' && !isPrimaryOwner(getMessageActorId(message))) {
			return;
		}

		const quietManagerCommand = await isNonPrimaryConfiguredGroupManager(message, userId);
		if (quietManagerCommand) {
			await deleteAuthorizedGroupCommandMessage(message, '/unban');
		}
		// D1 全局黑名单是自助解封的硬闸门：命中任何 reason 都拒绝，且不自动移除黑名单。
		if (await blockSelfUnbanIfBlacklisted(userId, chatId, message.from, env, {
			silentGroupReply: quietManagerCommand && OWNER_IDS.length > 0,
			ctx,
			message,
		})) {
			return;
		}

		const groupInfo = await getGroupInfo();
		const welcomeMessage = SELF_UNBAN_PROMPT
			.replaceAll('{userId}', String(userId))
			.replaceAll('{title}', groupInfo.title)
			.replaceAll('{keyword}', SELF_UNBAN_KEYWORD);

		if (quietManagerCommand) {
			await replyToAdmin(message, ctx, {
				flashText: 'ℹ️ 完整结果已发送给主人',
				detailText: welcomeMessage,
				isInGroup: true,
			});
		} else {
			await sendTelegramMessage(chatId, welcomeMessage);
		}
	}
	// 检查用户回复是否完全匹配提示语，禁止夹带其它内容
	else if (text && text.trim() === SELF_UNBAN_KEYWORD) {
		// D1 全局黑名单是自助解封的硬闸门：命中任何 reason 都拒绝，且不自动移除黑名单。
		if (await blockSelfUnbanIfBlacklisted(userId, chatId, message.from, env)) {
			return;
		}
		const approvedReply = await buildSelfUnbanApprovedReply();
		await sendTelegramMessage(chatId, approvedReply.text, approvedReply.replyMarkup);

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

// 构造自助解封成功回执：文案 + 主群联系入口按钮。
// 主群（SELF_UNBAN_CONTACT_GROUP，默认 GROUP_IDS[0]）在本项目里是"回家的入口" ——
// 解封走全群、封禁也走全群，bot 无法知道用户原本在哪个群被封，所以不说"返回某个群"，
// 而是告知"全部群组限制已解除"，并给一个能联系到管理员的主群按钮。
// 拿不到群链接时使用降级文案（无"点击下方按钮"字样）且不附按钮，绝不出现点不动的假链接。
async function buildSelfUnbanApprovedReply() {
	const contactGroupId = SELF_UNBAN_CONTACT_GROUP || GROUP_ID;
	let title = '';
	let link = '';
	try {
		const info = await getChatInfoFromId(contactGroupId);
		title = String(info?.title || '').trim();
		link = String(info?.link || '').trim();
	} catch (error) {
		console.error('[自助解封] 获取联系主群信息失败:', error?.message || error);
	}
	const groupCount = Array.isArray(GROUP_IDS) ? GROUP_IDS.length : 0;
	const clickable = Boolean(link && title);
	const template = clickable ? SELF_UNBAN_APPROVED : SELF_UNBAN_APPROVED_NOLINK;
	const groupName = title || String(contactGroupId);
	const text = String(template)
		.replaceAll('{groupcount}', String(groupCount))
		.replaceAll('{groupname}', groupName)
		.replaceAll('{groupid}', String(contactGroupId))
		// 兼容旧自定义文案里的 {username}：等价于 {groupname}，老配置不会失效
		.replaceAll('{username}', groupName);
	const replyMarkup = clickable
		? { inline_keyboard: [[{ text: SELF_UNBAN_CONTACT_BUTTON_PREFIX + groupName, url: link }]] }
		: null;
	return { text, replyMarkup };
}

// 发送 Telegram 消息
async function sendTelegramMessage(chatId, text, replyMarkup, replyToMessageId = null) {
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
	if (replyToMessageId) {
		// 保持源代码 /ad 回复发起行为；其他既有调用未传该参数，行为完全不变。
		body.reply_to_message_id = Number(replyToMessageId);
	}

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const result = await response.json();
		console.log(`发送消息到 Telegram，状态: ${response.status}, 响应: ${JSON.stringify(result)}`);

		if (!response.ok || !result.ok) {
			// 软失败:记录但不抛,让调用方后续逻辑继续跑
			console.error(`[sendTelegramMessage] 发送失败 chat=${chatId}: ${result.description || `HTTP ${response.status}`}`);
			return { ok: false, error: result.description || `HTTP ${response.status}` };
		}
		return result;
	} catch (error) {
		console.error(`[sendTelegramMessage] 异常 chat=${chatId}:`, error);
		return { ok: false, error: error.message };
	}
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
// revoke_messages 默认 true → Telegram 在封禁成功的群中撤回该用户全部历史发言。
// 返回 { ok: bool, error?: string }；bot 没权限/不在群时返回 ok=false 但不抛异常
function shouldRetryTelegramMutationFailure(failure) {
	if (!failure) return false;
	if (failure.networkError) return true;
	const httpStatus = Number(failure.httpStatus) || 0;
	const errorCode = Number(failure.errorCode) || 0;
	if (httpStatus === 429 || httpStatus >= 500) return true;
	if (errorCode === 429 || errorCode >= 500) return true;
	return false;
}

function getTelegramMutationRetryDelayMs(failure) {
	const retryAfterSeconds = Number(failure?.retryAfterSeconds) || 0;
	if (retryAfterSeconds > 0) {
		return Math.max(TG_MUTATION_RETRY_DELAY_MS, Math.ceil(retryAfterSeconds * 1000));
	}
	return TG_MUTATION_RETRY_DELAY_MS;
}

async function banUserFromGroup(chatId, userId, options = {}) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/banChatMember`;
	const body = {
		chat_id: chatId,
		user_id: Number(userId),
		revoke_messages: options.revokeMessages !== false
	};
	let lastFailure = null;
	let attempts = 0;

	for (let attempt = 1; attempt <= 2; attempt += 1) {
		attempts = attempt;
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const result = await response.json();
			console.log(`[banChatMember] chat=${chatId} user=${userId} attempt=${attempt} ok=${result.ok}${result.description ? ' desc=' + result.description : ''}`);
			if (response.ok && result?.ok) {
				return { ok: true, attempts: attempt, retried: attempt > 1 };
			}
			lastFailure = {
				ok: false,
				error: result?.description || `HTTP ${response.status}`,
				httpStatus: response.status,
				errorCode: result?.error_code,
				retryAfterSeconds: result?.parameters?.retry_after,
				userId
			};
		} catch (error) {
			lastFailure = {
				ok: false,
				error: error.message || String(error),
				networkError: true,
				userId
			};
			console.error(`[banChatMember] chat=${chatId} user=${userId} attempt=${attempt} 异常:`, error);
		}

		if (attempt >= 2 || !shouldRetryTelegramMutationFailure(lastFailure)) break;
		await new Promise((resolve) => setTimeout(resolve, getTelegramMutationRetryDelayMs(lastFailure)));
	}

	return {
		ok: false,
		error: lastFailure?.error || '失败',
		attempts,
		retried: attempts > 1
	};
}

// 让 bot 退出指定群组（Telegram leaveChat API）
// 返回 { ok: bool, error?: string }；目标群不存在、bot 不在群内等场景不抛异常。
async function leaveTelegramChat(chatId) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/leaveChat`;
	const body = { chat_id: String(chatId) };

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const result = await response.json();
		console.log(`[leaveChat] chat=${chatId} ok=${result.ok}${result.description ? ' desc=' + result.description : ''}`);
		if (!response.ok || !result.ok) {
			return { ok: false, error: result.description || `HTTP ${response.status}` };
		}
		return { ok: true };
	} catch (error) {
		console.error(`[leaveChat] chat=${chatId} 异常:`, error);
		return { ok: false, error: error.message };
	}
}

async function getBotChatMembership(chatId) {
	const botId = await getBotId();
	if (!botId) {
		return { ok: false, inChat: false, error: '无法获取机器人 ID' };
	}

	const url = `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`;
	const body = { chat_id: String(chatId), user_id: Number(botId) };

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const result = await response.json();
		console.log(`[getBotChatMembership] chat=${chatId} bot=${botId} ok=${result.ok}${result.description ? ' desc=' + result.description : ''}`);
		if (!response.ok || !result.ok) {
			return { ok: false, inChat: false, error: result.description || `HTTP ${response.status}` };
		}

		const member = result.result || {};
		const status = String(member.status || '').toLowerCase();
		const inChat = status === 'creator' ||
			status === 'administrator' ||
			status === 'member' ||
			(status === 'restricted' && member.is_member !== false);
		return { ok: true, inChat, status, isMember: member.is_member };
	} catch (error) {
		console.error(`[getBotChatMembership] chat=${chatId} 异常:`, error);
		return { ok: false, inChat: false, error: error.message };
	}
}

function formatBotChatMembershipStatus(membership) {
	const status = String(membership?.status || '').toLowerCase();
	const map = {
		creator: '群主',
		administrator: '管理员',
		member: '成员',
		restricted: membership?.isMember === false ? '已离开' : '受限成员',
		left: '已离开',
		kicked: '已被移出'
	};
	return map[status] || status || '未知';
}

function translateLeaveChatError(description) {
	if (!description) return '未知错误，请查看 Worker 日志获取详情。';
	const lower = String(description).toLowerCase();

	if (lower.includes("can't be changed in private chats") || lower.includes('private chat')) {
		return '这是私聊 ID，不是群组 ID；bot 不能退出私聊。';
	}
	if (lower.includes('chat not found')) {
		return '找不到该群组，可能群组 ID 错误，或 bot 已不在该群。';
	}
	if (lower.includes('bot is not a member') || lower.includes('not a member of the chat')) {
		return 'bot 当前不在该群，无法执行退出。';
	}
	if (lower.includes('was kicked') || lower.includes('kicked from the group')) {
		return 'bot 已经被踢出该群，无需再次退出。';
	}
	if (lower.includes('peer_id_invalid') || lower.includes('chat_id_invalid')) {
		return '群组 ID 无效，请检查是否为正确的负数群组 ID。';
	}
	if (lower.includes('flood') || lower.includes('too many requests')) {
		return 'Telegram 请求过于频繁，请稍后重试。';
	}
	if (lower.includes('forbidden')) {
		return 'Telegram 拒绝本次请求，可能 bot 已无法访问该群。';
	}

	return 'Telegram 返回未识别错误，请查看 Worker 日志获取原始描述。';
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
// 群内闪屏：发一条短提示，ttlMs 毫秒后自动撤回。
// ttlMs 省略时用 FLASH_MESSAGE_TTL_MS（硬编码默认 5000，可被环境变量
// FLASH_MESSAGE_TTL_MS 覆盖）；显式传值的调用点保留自己的时长。
// ttlMs <= 0 表示永不撤回，此时不注册后台任务。
// ⚠️ ctx 必须由调用方透传：延时撤回挂在 ctx.waitUntil 上，传 null 会让提示永久留在群里。
async function sendFlashMessage(chatId, text, ctx, ttlMs) {
	const ttl = Number.isFinite(Number(ttlMs)) ? Number(ttlMs) : FLASH_MESSAGE_TTL_MS;
	const result = await sendTelegramMessage(chatId, text);
	const messageId = result?.result?.message_id;
	if (!messageId || ttl <= 0 || !ctx || typeof ctx.waitUntil !== 'function') return result;
	ctx.waitUntil((async () => {
		await new Promise((r) => setTimeout(r, ttl));
		await deleteMessage(chatId, messageId);
	})());
	return result;
}

async function unbanUser(userId, groupId = GROUP_ID) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/unbanChatMember`;
	const body = {
		chat_id: groupId,
		user_id: Number(userId),
		only_if_banned: true
	};
	let lastFailure = null;
	let attempts = 0;

	for (let attempt = 1; attempt <= 2; attempt += 1) {
		attempts = attempt;
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			const result = await response.json();
			console.log(`执行 unbanUser，群:${groupId}，尝试:${attempt}，状态:${response.status}，响应:${JSON.stringify(result)}`);
			if (response.ok && result?.ok) {
				return { ...result, attempts, retried: attempts > 1 };
			}
			lastFailure = {
				ok: false,
				description: result?.description || `HTTP ${response.status}`,
				error: result?.description || `HTTP ${response.status}`,
				httpStatus: response.status,
				errorCode: result?.error_code,
				retryAfterSeconds: result?.parameters?.retry_after,
				userId
			};
		} catch (error) {
			lastFailure = {
				ok: false,
				error: error.message || String(error),
				description: error.message || String(error),
				networkError: true,
				userId
			};
			console.error(`[unbanChatMember] chat=${groupId} user=${userId} attempt=${attempt} 异常:`, error);
		}
		if (attempt >= 2 || !shouldRetryTelegramMutationFailure(lastFailure)) break;
		await new Promise((resolve) => setTimeout(resolve, getTelegramMutationRetryDelayMs(lastFailure)));
	}

	return {
		ok: false,
		description: lastFailure?.description || lastFailure?.error || '失败',
		error: lastFailure?.error || lastFailure?.description || '失败',
		attempts,
		retried: attempts > 1
	};
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
// 超级管理员（SUPER_ADMINS 名单）拥有普通管理命令权限。
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
// 从 getChat 结果里解析出可点击的群链接。
// 优先公开群用户名（永久稳定），其次 bot 为管理员时 getChat 直接返回的主邀请链接。
// 刻意不调用 exportChatInviteLink —— 那会撤销并重建主邀请链接，导致群内所有人手上的旧链接失效。
function resolveChatInviteUrl(chatResult) {
	const username = String(chatResult?.username || '').trim();
	if (username) return `https://t.me/${username}`;
	const inviteLink = String(chatResult?.invite_link || '').trim();
	if (/^https:\/\/t\.me\//i.test(inviteLink)) return inviteLink;
	return '';
}

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
		// 检查是否没有封禁记录。
		// 这条正则里的繁体【必须保留】：「並沒有封鎖記錄」是 GKY 那个第三方站点
		// 自己输出的繁体原文，改成简体就永远匹配不上，「无记录」这条分支会彻底失效。
		// 项目内其它繁体已于 2026-09-08 按主人要求全部清成简体，只有这里是例外。
		const noRecordPattern = /并沒有封鎖記錄|has no (?:ban|be) record/i;
		if (noRecordPattern.test(html)) {
			return {
				success: true,
				banned: false,
				tgid: tgid,
				message: '此TG账号并没有封锁记录 / This TG account has no ban record'
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
			} else {
				// 私有群没有 username，但 bot 是管理员时 getChat 会直接返回主邀请链接。
				const inviteUrl = resolveChatInviteUrl(result.result);
				if (inviteUrl) info.link = inviteUrl;
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

// ============================================================================
// 广告检测系统 v2（三层判定：结构化评分 → D1 指纹库 → Workers AI 语义）
// ----------------------------------------------------------------------------
// 词表与权重全部来自真实广告样本（emoji 对称名 + 交易动词 Bio + bot 链接 + 业务词），
// 实测覆盖 33/35，余下两例由指纹库与 AI 语义层兜底。
// 纯 D1 实现：会话快照、二次确认令牌一律落 D1 表 + 手动剪枝，全项目不依赖 KV。
// 降级链：AI 未绑定 → 退化为「评分 + 指纹」；D1 不可用 → 整套检测静默跳过，
// 绝不影响 /ban /spam /unban /ad 等既有功能。
// ============================================================================

// 判定阈值默认值（全部可被同名环境变量覆盖，解析失败一律回落默认值）
const DEFAULT_AD_SCORE_THRESHOLD = 7;
const DEFAULT_AD_OBSERVATION_SCORE = 5;
const DEFAULT_AD_OBSERVATION_HOURS = 24;
const DEFAULT_AD_AI_SIMILARITY_THRESHOLD = 0.78;
const DEFAULT_AD_FINGERPRINT_MIN_CONFIDENCE = 0.6;

// 指纹直接封禁所需权重（低于此值只加分，不单独定罪）
const AD_FINGERPRINT_BAN_WEIGHT = 0.8;
// ===== 短语自我泛化（方案 E · AI 自我学习闭环）=====
// /spam 每新增一批样本后，从样本库里扫【新样本】做共现提炼：
// 跨样本重复出现 >= AD_ENRICH_MIN_OCCURRENCE 次、4~8 字、过三重闸（豁免词 / 强动词·业务词 / 形态）
// 的子串，升级成 keyword 型、source='auto'、weight=AD_ENRICH_WEIGHT 的指纹。
// 提炼素材是「主人 /spam 人工确认过的广告」，不是自动封禁路径的路过文本，误面天然小。
const AD_ENRICH_EVERY = 5;           // 每新增多少条样本触发一次提炼
const AD_ENRICH_MIN_OCCURRENCE = 2;  // 子串至少跨样本出现多少次才进候选
const AD_ENRICH_MAX_RESULTS = 20;    // 单次提炼最多入库的指纹条数
const AD_ENRICH_PHRASE_MIN = 4;      // 子串长度下限（中文按码点计）
const AD_ENRICH_PHRASE_MAX = 8;      // 子串长度上限
const AD_ENRICH_WEIGHT = 0.8;        // 自动提炼指纹的权重（与 AD_FINGERPRINT_BAN_WEIGHT 同为 0.8）
const AD_ENRICH_CHECKPOINT_KEY = 'ad_enrich_checkpoint';
// AI 相似度落在 [软加分下限, 阈值) 区间时只加分，不直接定罪
const AD_AI_SOFT_BONUS_FLOOR = 0.65;
const AD_AI_SOFT_BONUS_SCORE = 2;
// 指纹命中加分
const AD_FINGERPRINT_HIT_SCORE = 3;
// 关键词计分：【只有交易动词与业务关键词同现才给分，单类命中一律 0 分】。
//
// 2026-09-08 主人定的规则，原话：「单个词不封不计入分数，只有多个词才能计入分数，
// 因为你如果单个词计入分数的话会误封很多人。」
//
// 旧模型是「命中任一类 +2、两类同现再 +2」，等于让阈值（7）去承担语义判断，而
// `实名` / `赚钱` / `汇率` / `同城` / `上门` / `推广` / `引流` / `一手` / `日结`
// 这些词正常人天天说 —— 凑齐两三项就误封。实测 @MiLov1900 两次被误封都走这条路。
//
// 新模型只保留合取判据：单类命中只记录进 reasons（供人工判断），不计一分；
// 两类同现给 AD_KEYWORD_COMBO_SCORE，取 6 = 旧模型同现时的总分（2 + 2 + 2），
// 所以真广告（收购 + USDT、高价收 + 网赚）的分数与改动前完全一致，召回率不受影响。
// 与双通道结构查杀（招揽意图 ∧ 行业指向）是同一个思路的两处落地。
const AD_KEYWORD_COMBO_SCORE = 6;

// 弱交易动词命中分。归 0：弱动词（详聊 / 咨询 / 有需要 / 兼职）本就是单类词里最弱的一档，
// 在「单类词不计分」规则下没有任何理由还留着 +1。命中仍写进 reasons 供人工判断。
const AD_WEAK_TRADE_VERB_SCORE = 0;

// 结构化评分的下限。旧代码用 Math.max(0, score) 把负分夹到 0，后果是
// 【豁免词减分完全是假的】—— 主人往 AD_EXEMPT_KEYWORDS 里加的每个词都只在回执里
// 显示「-3 命中豁免词」，实际一分没减（实测 @MiLov1900 正文「签到」吃满 -3 仍是 0 分起算）。
// 改为允许负分，下限 -3 = 单次豁免减免的额度：既让豁免词真正生效，又不让它无限累积成
// 「写满技术词就永久免检」的漏洞。真广告不受影响 —— 指纹 / AI / 结构查杀都是布尔定罪，不看分数。
const AD_SCORE_FLOOR = -3;

// 群内受限状态得分。原值为 5，是 2026-09-07 误封事故的另一半原因。
//
// 语义澄清：getChatMember 返回的 'restricted' 意思是「该用户在本群被禁言 / 限权」，
// 【不是】「Telegram 官方限制了这个账号」。旧代码与旧通知文案都按后者理解，属于误读 Bot API。
// 本文件内部对同一字段本就有正确用法（isRedundantAdVoteTarget 把它当「本群被封禁/禁言」
// 处理），两处口径此前不一致。
//
// 给 5 分会造成循环自锁：
//   1) 管理员因吵架 / 刷屏临时禁言某人 -> 该人 status='restricted'；
//   2) 其资料里只要再有任意一个 +2 的词 -> 2 + 5 = 7 分正好撞上封禁线；
//   3) 更糟的是本文件自己的 muteChatMember 也会把人置成 restricted ——
//      等于 bot 先禁言、之后再判定时自己补 5 分把人永久封掉。
// 降到 2：它仍是有效的辅助信号（广告号被举报后常先被禁言），但再也无法与单个词凑够封禁线。
const AD_RESTRICTED_STATUS_SCORE = 0;

// —— 方案 6（双轨 bio 检测）参数 ——
// bio 只能靠 getChat 拿，一次一个人。所以问题从来不是「查不查 bio」，而是「什么时候查」。
// 旧做法「每条消息都查」实测每条消息 3 个 Telegram 请求（getChatAdministrators +
// getChat + getChatMember），活跃群直接逼近 429，而换来的只是「改 bio 后快几分钟被抓」。
//
// 双轨：
//   轨一（消息路径）：每人首次发言查一次 bio，之后 AD_BIO_RECHECK_DAYS 天内不再查。
//   轨二（定时扫描）：cron 按 bio_checked_at 升序滚动复查名册，每天 AD_SCAN_DAILY_LIMIT 个。
// 两轨叠加后，稳态下正常消息零 getChat，而任何发言过的人都被 bio 检测覆盖。
//
// 3 天：轨二每天扫 300 个已经在滚动覆盖，轨一只需做兜底，不必压得更短。
const AD_BIO_RECHECK_DAYS = 3;
const AD_BIO_RECHECK_SECONDS = AD_BIO_RECHECK_DAYS * 24 * 3600;

// 名册保留期。超过这个时长没再发言的人从名册剪枝 —— 大概率已退群，
// 留着只会白占扫描配额。90 天足够覆盖「长期潜水但仍在群」的正常用户。
const AD_MEMBER_RETENTION_SECONDS = 90 * 24 * 3600;

// 定时扫描配额：每天 300 个，分 10 批 x 30 个，批间隔 3 秒。
// 批间隔的作用是把 300 次 getChat 摊到 30 秒里（约 10 req/s），
// 远离 Telegram 约 30 req/s 的全局线，也给同一时刻的消息路径留出余量。
const AD_SCAN_DAILY_LIMIT = 300;
const AD_SCAN_BATCH_SIZE = 30;
const AD_SCAN_BATCH_INTERVAL_MS = 3000;

// 管理员列表缓存 TTL。getChatAdministrators 是三个热路径调用里唯一【跨用户共享】的
//（同群所有人用同一份列表），却原本一次都没缓存 —— 每条消息白调一次。
// 5 分钟：新任管理员最迟 5 分钟后被豁免，期间他会被送去判定，但资料干净不会被封。
const AD_ADMIN_CACHE_TTL_MS = 5 * 60 * 1000;

// —— 结构判据（2026-09 线上漏放 50+ 号后新增，不依赖任何关键词）——
// 那批号的共同形态：转发一个随机字母名频道（bxbd / hjff），自己正文只发一个字母（v / z / n），
// 广告词全在转发体里 —— 而 getAdDetectionBodyText 只读 text/caption，一个词都取不到，
// 导致当时的正文预筛得 0 分、在第一行就 return，三层判定全部没跑。
//（该预筛门槛已于本轮整体移除，见 detectAdOnMessage；此处保留复盘以说明结构判据的来由。）
// 词表永远追不上新话术，但「投放脚本的结构」比话术稳定得多，故改从结构下手。

// ===== 转发来源（频道 / 群组）判定总开关 =====
// 2026-09-08 主人下令关闭，原话：「有的用户喜欢用频道私聊，所以关于频道跟群聊的判定
// 还是很容易造成误封，去除频道跟群组判定。」
//
// 关掉的是「他挂了 / 转发了什么频道」这一整个维度：来源频道对称 emoji / 数字前缀 /
// 业务词 / 交易动词 / 随机字母名（scoreAdForwardChat），以及「极短正文 + 转发来源同现」
// （scoreAdMessageContext）。这两处合计最多贡献 12 分，而封禁线只有 7 —— 一个把频道
// 当私聊入口的正常用户，转发一条自家频道消息就可能单凭这个维度被封。
//
// 保留的是主人认可的两条主路径：资料卡查杀（用户名 + 简介）、正文查杀（简介 + 正文），
// 以及种子指纹命中即封。函数本体不删 —— 判据本身没错，错在它的误伤面，
// 留着并由本开关控制，将来要恢复只改这一行。
const AD_FORWARD_JUDGE_ENABLED = false;

// 随机字母名频道分。判据仍在（isAdRandomChannelName），但 AD_FORWARD_JUDGE_ENABLED
// 关闭后整条路径不计分，故归 0；开关重新打开时应恢复为 4（= scoreAdForwardChat 的 isAd 门槛，
// 低于门槛的分数在 evaluateAdSuspect 里根本不会被累加）。
const AD_RANDOM_CHANNEL_SCORE = 0;

// 机器生成型昵称分（Faker 西方全名 / 非常用书写系统短随机名）。
// 真实外国用户也可能叫 John Smith，故只给 2，单独绝不足以定罪。
// 这条【属于资料卡维度，不受转发判定开关影响】，保留原值。
const AD_GENERATED_NAME_SCORE = 2;

// 极短正文的长度上限。线上那批号正文是单个字母，阈值取 4 留出变异余量 ——
// 把正文改成 vvv / abcd 的规避成本极低，卡在 1 等于白设。
const AD_MINIMAL_TEXT_MAX_LENGTH = 4;

// 「极短正文 + 转发来源」同现分。随 AD_FORWARD_JUDGE_ENABLED 一并归 0：
// 这条判据的两个构成要素之一就是「有转发来源」，属于被主人关闭的频道维度。
// 开关恢复时应改回 4。
const AD_MINIMAL_TEXT_FORWARD_SCORE = 0;

// 豁免词减分（详见 AD_EXEMPT_KEYWORDS 上方说明）：
// 无交易动词时全额减免，保护纯技术讨论；有交易动词时打折，避免真广告夹带术语就此蒙过。
const AD_EXEMPT_PENALTY = -3;
const AD_EXEMPT_PENALTY_WITH_TRADE = -1;

// 平台自身域名：结构上不该被当作广告特征，绝不学入指纹库，也不计链接可疑分。
// 与用户可维护的 ad_domain_whitelist 分离 —— 后者是「这个群认为无害」，
// 本名单是「学它必然造成大面积误伤」，因此不允许被用户误删。
// 实测事故：t.me 曾被学成 weight=1 的 domain 指纹并命中 10 次，
// 导致任何人分享 Telegram 链接都可能被判广告。
const AD_PLATFORM_DOMAINS = new Set([
	't.me', 'telegram.me', 'telegram.org', 'telegra.ph', 'telesco.pe',
	'telegram.dog', 'tg.dev'
]);

// 是否为平台自身域名（含真子域，判定口径与 isAdDomainWhitelisted 一致）。
function isAdPlatformDomain(domain) {
	const value = normalizeAdDomain(domain);
	if (!value) return false;
	if (AD_PLATFORM_DOMAINS.has(value)) return true;
	const parts = value.split('.');
	// 上界取 length - 1，保证永不单独匹配顶级域：
	// evil-t.me / t.me.evil.tk 都不该被当成平台域名放过。
	for (let i = 1; i < parts.length - 1; i += 1) {
		if (AD_PLATFORM_DOMAINS.has(parts.slice(i).join('.'))) return true;
	}
	return false;
}
// AI 样本库每请求懒加载补齐数量（避免首请求超时与子请求超限）
// AD_SAMPLE_TARGET_COUNT 现在只作为「首批补齐进度」的参考值使用，不再是向量生成的硬上限 ——
// 2026-09-08 起 topUpAdSampleEmbeddings 会一直补到库里没有 embedding IS NULL 为止。
const AD_SAMPLE_TARGET_COUNT = 30;
const AD_SAMPLE_LAZY_BATCH = 8;
// 单次判定最多载入多少条【学习来的】样本向量参与余弦比对。
// 种子样本（source = seed / seed-core，约 34 条）不受这个上限约束、永远全部载入 ——
// 那是主人定的「中心特征」，被新样本挤掉就等于把中心丢了。
//
// 为什么还要有上限：每条向量 1024 维、JSON 存储约 12 KB，200 条已是 ~2.4 MB 的
// D1 读取 + JSON.parse，再往上会明显吃掉单请求 CPU 预算（60 秒 WeakMap 缓存只摊掉重复开销，
// 冷启动那一次照样要付）。取 200 条最新学习样本 + 全部种子，足够覆盖变体识别；
// 更老的学习样本此时早已由 /spam 学成指纹，在第二层命中即封，不依赖 AI 层召回。
const AD_SAMPLE_LEARNED_QUERY_LIMIT = 200;
// Workers AI 嵌入模型（与样本库维度绑定；换模型必须清空 ad_sample_embeddings）
// ⚠️ 必须使用 Cloudflare 目录里真实存在的模型 ID。曾误用 '@cf/baai/bge-base-zh-v1.5' ——
// 该模型不存在（bge 系列只有 -en- 三个尺寸与 bge-m3，没有 -zh- 变体），
// 每次调用都被 Ai._parseError 拒绝，第三层长期空转且日志只见栈不见因。
// bge-m3 是多语言模型，中文广告文本正是其适用场景；1024 维，60000 token 上下文。
const AD_EMBEDDING_MODEL = '@cf/baai/bge-m3';
const AD_EMBEDDING_DIMENSION = 1024;
// 筛查记录保留期（秒）：14 天后剪枝，防止 D1 无限增长
const AD_SCREENING_RETENTION_SECONDS = 14 * 24 * 3600;
// /pending 快照【长期保留】；/clearsamples 二次确认 60 秒
//
// 【2026-09-08 从 1 小时改成 100 年】主人的原话：「关于快照只保留一个小时，时间太短了，
// 实现无限制时间能不能做到？还是说会触发 telegram 亦或者是 cloudflare 的阈值警告。」
// 结论是两边都不构成问题：快照纯存 D1、不碰任何 TG API；单条约 4~5 KB
// （reasons / snapshot 各截断 2000 字符），一天封 50 个号也就一年约 90 MB，
// D1 付费层容量差两个数量级。真正的卡点是代码自己的 1~50 序号池，那个在
// allocateAdPendingSnapshot 里一起改掉了。
//
// 不用「永不过期」的写法（比如把 expires_at 设成 NULL 或 0）是因为 expires_at 这一列
// 现在承担了「是否已复核」的语义：已被 /ignore 或 /unban 处理过的快照会被置成 0，
// 于是 expires_at > now 这个既有条件天然把它们排除出 /pending 列表，
// 而行本身留在表里占住序号 —— 这是防止序号复用解封错人的关键，详见 deleteAdPendingSnapshot。
const AD_PENDING_SNAPSHOT_TTL_SECONDS = 100 * 365 * 24 * 3600;
const AD_CONFIRM_TOKEN_TTL_SECONDS = 60;
// /pending 单次列出的默认与上限条数。
// 【这两个数字只管分页，不再是序号池大小】—— 改成长期保留之后序号无上限单调递增。
const AD_PENDING_DEFAULT_LIMIT = 20;
const AD_PENDING_MAX_LIMIT = 50;
// 域名白名单与指纹库运行期缓存 60 秒
const AD_WHITELIST_CACHE_TTL_MS = 60000;
const AD_FINGERPRINT_CACHE_TTL_MS = 60000;
// 建表失败后的冷却时间：避免 D1 故障时每请求重试打爆子请求预算
const AD_SCHEMA_RETRY_COOLDOWN_MS = 60000;
// 存量回查单次上限：Bot API 无法枚举群成员，只能对 ad_user_screening 里的存量记录逐个回查
const AD_RESCREEN_BATCH_LIMIT = 30;

// 交易动词：广告 Bio 的核心信号，也是自动学习的闸门词。
// 没有交易动词的短语不许进指纹库，否则「个人简介」这类中性词会被学成广告特征。
const AD_TRADE_VERBS = [
	'长期收购', '高价收', '专业收', '收购', '出售', '代收', '代付', '收单', '接单', '批发',
	'注册即送', '免费领', '招代理', '日结', '月入', '日入', '稳赚',
	'推广', '引流', '拉人', '代发', '群发', '加V', '加微', '加薇',
	'包售后', '秒结', '洗急', '走量', '一手', '优先加价',
	// 招募型话术（2026-09 线上漏放 50 个号后补充）：原词表偏「网赚 / 虚拟币 / 账号交易」，
	// 对「招探花9000一单，提供设备」这类色情招募几乎空白 —— 实测该正文交易动词命中数为 0。
	// 「提供设备 / 包吃住」在正常语境也可能出现，故仍只给 +2，
	// 必须配合业务关键词触发协同分才够 6 分进观察窗口，不会单独定罪。
	'招人', '招工', '急招', '招募', '提供设备', '设备免费', '包吃住', '包住',
	'工资日结', '当天结', '不押金', '无押金', '车接车送', '安排住宿',
	// 线下交付型（2026-09-09 名片广告漏检后补）：主人截图的名片显示名是
	// 「假钞玩妹交流群🔥快递面交都可」—— 离线实测这句在四张词表 + 两组正则里【逐词零命中】，
	// 名片通道通了也定不了罪。「面交」是线下成交动作，正常群聊几乎不用（要用也是「见面」「当面」），
	// 且它单独出现【不构成任何证据】—— 必须配 AD_BUSINESS_KEYWORDS 里的行业词凑成形态 A 才定罪。
	'面交', '当面交易'
];

// 弱交易动词：形态上像招揽，但在正常语境里同样高频，单独出现不构成任何广告证据。
//
// 2026-09-07 线上误封事故的直接原因就在这里。被误封用户的 Bio 是「西嗨~ 私聊请通过」——
// 一句「加好友请通过」的普通说明，却因「私聊」曾被列为满权交易动词（+2），
// 叠加「本群受限状态 +5」后正好 7 分撞上封禁线，该用户被全群封禁 14/14。
//
// 这些词与强动词的本质区别：强动词（收购 / 代付 / 秒结）自带交易意图，
// 正常人几乎不会写进资料卡；弱动词（私聊 / 咨询 / 有需要）只是「联系方式说明」，
// 广告号用它，普通用户也用它 —— 真正区分两者的是同句里的业务关键词，不是这些词本身。
//
// 「代理」尤其危险：本项目部署在代理 / CDN 技术群，那是群内最高频的正常词汇之一，
// 留在强动词表里等于给整个群的日常发言都预置 +2。
//
// 三条硬性区别对待（见 scoreAdProfile / scoreAdMessageText / learnAdFingerprints）：
//   1) 只给 AD_WEAK_TRADE_VERB_SCORE —— 2026-09-08 起该常量为 0，命中只进 reasons 不计分；
//   2) 【不触发协同分】—— 协同分的语义是「交易意图 + 行业指向同现」，
//      「私聊」+「USDT」远达不到这个强度，正常人聊币价也会说「私聊我细说」；
//   3) 【不作为自动学习闸门】—— learnAdFingerprints 的 no_trade_verb 闸门只认强动词，
//      否则「私聊请通过」这类句子会被学成永久指纹，之后所有这么写资料的人一律误杀。
//
// 「私聊」已于 2026-09-08 按主人要求【移出本表、移入 AD_EXEMPT_KEYWORDS】——
// 它不只是「不构成证据」，而是应当反过来减分的正常用语（「私信请走频道」是标准写法）。
const AD_WEAK_TRADE_VERBS = [
	'详聊', '咨询', '欢迎咨询', '有需要', '进群联系',
	'代理', '招聘', '兼职', '一单', '单价'
];

// 业务关键词：广告的行业指向词（网赚 / 菠菜 / 虚拟币 / 色情引流）
const AD_BUSINESS_KEYWORDS = [
	'USDT', 'U商', 'U币', '泰达', '网赚', '菠菜', '博彩', '棋牌', '彩票',
	'du商', 'du 商', '商宝', '宝账号', '赚钱', '搞钱', '包盒', '盒项目', '价格表',
	'收号', '收网', '老账号', '实名', '四件套', '卡料', '料子', '发卡', '跑分',
	'洗钱', '洗白', '出黑', '接u', '出u', '换汇', '汇率', '代练', '刷单', '刷量',
	'约炮', '辣妞', '黑丝', '反差', '女主妇', '一夜', '同城', '上门', '风口项目',
	// 色情招募类（2026-09 线上漏放补充）：原词表只有「约炮 / 辣妞 / 黑丝」等内容型词汇，
	// 缺「探花」这类从业者招募黑话 —— 实测「探花来，一单9k，设备免费」整条得分为 0。
	'探花', '操逼', '约啪', '楼凤', '外围', '空降', '快餐', '包夜', '上门服务',
	'技师', '推油', '陪玩陪聊', '色粉', '视频裸', '裸聊', '福利姬', '资源群',
	// 伪钞类（2026-09-09 名片广告漏检后补）：旧代码 RECOMMENDED_AD_KEYWORDS.fraud 里
	// 就有这两个词，走的是「名片显示名命中即杀」的单词直杀通道；本项目【不采用单词直杀】，
	// 只把它们当行业指向词，仍需 AD_TRADE_VERBS 的招揽动词同现才凑成形态 A。
	// 这两个词是纯违法标的，正常群聊不存在使用场景（讨论反假币会说「假币鉴别」，
	// 那也仍需招揽动词才定罪），所以误封面接近于零。
	'假钞', '假币'
];

// 豁免词：命中且无交易动词时整体减分，保护正常用户。
// 典型误伤场景：资料卡写「双向机器人」「开源项目」的技术用户。
//
// 本项目部署在代理 / CDN 技术群，这类群的日常讨论天然会撞上广告词表：
// 聊「一单流量」「设备指纹」「上门装机」「日结带宽」都可能命中交易动词或业务词。
// 因此把代理传输协议、反代 path、TLS、浏览器/代理指纹、ECH 等术语全部纳入豁免，
// 命中即 -3，抵掉「交易动词 +2」或「业务词 +2」，使正常技术讨论不进观察窗口。
// 豁免采用【条件减免】：
//   - 无交易动词（纯技术讨论）→ 减 AD_EXEMPT_PENALTY（-3），足以把误命中的业务词抵掉；
//   - 有交易动词（可能是夹带术语的广告）→ 只减 AD_EXEMPT_PENALTY_WITH_TRADE（-1）。
// 若一律减 3，「收购 vless 账号 USDT 日结」= 2+2+2-3 = 3 分会被放行；打折后为 5 分，
// 正好进观察窗口。而纯技术讨论本就不含交易动词，或只含「一单 / 日结」却无业务词、
// 不触发协同分，打折分支对它们没有影响 —— 两头都能兼顾。
const AD_EXEMPT_KEYWORDS = [
	'双向', '机器人', 'bot', '开源', 'github', 'gitlab', '助手', '工具', '客服',
	'通知', '订阅', '备份', '监控', '签到', '翻译', '下载', '论坛', '博客', '文档',
	// —— 代理传输协议 ——
	'vless', 'vmess', 'trojan', 'shadowsocks', 'ss节点', 'ssr', 'hysteria', 'tuic',
	'naive', 'wireguard', 'openvpn', 'anytls', 'reality', 'xhttp', 'xtls', 'mkcp',
	'grpc', 'httpupgrade', 'splithttp', 'websocket', 'ws路径', 'quic', 'h2', 'h3',
	'xray', 'sing-box', 'singbox', 'clash', 'mihomo', 'v2ray', 'v2fly', 'hiddify',
	// —— 反代与路径 ——
	'反代', '反向代理', '回源', '中转', '落地', '分流', '路由规则', 'cdn',
	'path路径', '伪装路径', 'workers', 'pages', 'argo', 'tunnel', 'nginx', 'caddy',
	'负载均衡', '优选ip', '优选域名', 'ip优选', '节点订阅', '订阅链接', '订阅转换',
	// —— 传输层安全 TLS ——
	'tls', 'utls', 'mtls', 'sni', '证书', 'acme', 'ssl', '握手', '加密套件',
	'alpn', 'esni', 'ech', '前置代理', '域前置',
	// —— 浏览器 / 代理指纹 ——
	'指纹', '浏览器指纹', 'ja3', 'ja4', 'tls指纹', 'client hello', 'chrome指纹',
	'ua伪装', 'fingerprint', '特征识别', '流量特征', '主动探测', '抗封锁',
	// —— 通用技术语境 ——
	'延迟', '丢包', '带宽', '限速', '端口', '协议', '内核', '配置文件', '教程',
	'部署', '自建', '搭建', '编译', '调试', '抓包', '日志', 'api', 'json', 'yaml',
	// —— 2026-09-08 主人指定追加 ——
	// '私聊'：从 AD_WEAK_TRADE_VERBS 移过来。「私信请走频道」「加好友请先私聊」是
	//   标准的联系方式说明，2026-09-07 误封事故（「西嗨~ 私聊请通过」被封）的直接词源。
	// '代理' / '官方中文'：线上自动学习学出了 `[keyword] 代理 官方中文` 这条坑词
	//   （权重 1、命中 0、来源 auto）。本项目部署在代理 / CDN 技术群，这两个词是群内日常。
	//   注意光加豁免词治不了那条指纹 —— 指纹层是命中即封、不走减分，还需要 /delword 删掉它，
	//   并靠 learnAdFingerprints 里新增的豁免词闸门防止再学回来。
	// 't.me'：主人原话「t.me 不该成为封禁词，也加豁免。因为正常用户大部分都会使用这个。
	//   只有广告用户或者个别用户会直接 @bot 简介 @bot，所以 t.me 加封禁词只会误封更多」。
	//   同样注意：hasAdSuspiciousLink 里那条独立的 t.me 判据已一并删除，加词只是双保险。
	'私聊', '代理', '官方中文', 't.me'
];

// 回复学习触发词与否定词（第一主人普通回复即可标注广告）
// 触发词一律要求成词。历史词表里的单字「封」、英文子串「ad」和「学习」都是裸子串匹配，
// 会把「封面不错」「already done」「学习了」这类正常回复判成封禁指令，而 positive 分支是
// 强制 verdict='ban'（删消息 + 全群封禁 + 拉黑 + 学指纹），误伤不可逆，故一律移除。
// 英文触发词改走词边界正则，避免 bad / road / download / ready 被 'ad' 命中。
// 否定词永远先于触发词匹配：「不要封」含「要封」、「取消封禁」含「封禁」，靠顺序保证不误封。
//
// 【2026-09-11 收紧为完整判定短语】线上事故：管理员在群里回复一句含「广告」二字的吐槽，
// 触发全群封禁 14 个群，而被封者本人得分只有 -1（远低于阈值 7）——
// 确认分支强制 verdict='ban' 不受阈值裁决，得分完全不参与决策。
// 根因是这张词表配 includes 子串匹配：'广告' 会被「这广告真烦」「广告太多了」命中，
// '垃圾' 会被「垃圾话」「这游戏真垃圾」命中，而这些都是中文群里最自然的日常用语。
// 上一轮只移除了英文裸 spam（AD_REPLY_LEARN_TRIGGER_PATTERNS 清空），中文词原样留着，
// 而中文单词误触发概率远高于英文 —— 这次事故正是它。
// 现在一律要求【带明确判定意图的完整短语】：光提到「广告」不够，得说「这是广告」。
// 代价是管理员习惯打单字「广告」的话会失效，需要改口 —— 但误封 14 个群不可逆，成本不对称。
const AD_REPLY_LEARN_TRIGGERS = [
	'这是广告', '这条广告', '是广告', '广告号', '广告狗',
	'这是垃圾', '是垃圾广告', '垃圾广告',
	'封了他', '封了她', '把他封了', '把她封了', '该封他', '该封她', '封掉他', '封掉她'
];
// 【2026-09-10】移除裸 spam 触发：管理员忘带 / 随手打 spam 会触发全群封禁，误操作代价太大。
// /spam 斜杠命令走命令分发分支（isTelegramSlashCommand 守卫），不受此处影响。
const AD_REPLY_LEARN_TRIGGER_PATTERNS = [];
const AD_REPLY_LEARN_NEGATORS = [
	'不是广告', '不算广告', '非广告', '别封', '不要封', '不用封', '不该封',
	'误封', '误判', '不是spam', 'not spam', '不是垃圾', '取消封', '解封'
];

// 指纹类型白名单：/addword 只接受这四类，防止脏类型污染指纹库。
// 【方案 A】'username' 保留在列表里【仅为兼容历史数据】—— loadAdFingerprints 仍要能
// 读出库里的旧 username 行交给 markAdFingerprintFalsePositive 清理；
// 但 matchAdFingerprints 会跳过它们、addAdFingerprint 也拒绝新写入。
const AD_FINGERPRINT_TYPES = ['keyword', 'domain', 'username', 'bio'];

// ===== 权限人 username 永不学习白名单（2026-09-10 主人下令）=====
// 主人 / 副主人 / 超级管理员的 @handle 绝不允许进指纹库。
//
// 起因：广告号发言时艾特主人 → 主人的 @handle 被学成指纹 → 此后任何人艾特主人都被封。
// 方案 A 已从结构上删掉 username 学习路径，这道白名单是【第二层保险】，防的是另一类漏法：
// 主人的 @handle 出现在【被截取的 keyword 短语】里。例如广告号简介写
// 「收购账号 联系 @ym94203」，「收购」命中交易动词，往后截 24 字连带把 @ym94203
// 包进 keyword 短语 —— 那条短语权重虽已降到 0.5 不单独定罪，但仍会 +3 计分，
// 而且一旦有人用 /spam 人工提交（source != 'auto'，跳过豁免词闸门）就会以权重入库。
//
// 环境变量 AD_PROTECTED_USERNAMES：逗号分隔（半角 / 全角均可），@ 前缀可省。
// 例：`ym94203,suqi_20` 或 `@ym94203，@suqi_20`。
// 留空则只靠方案 A 的结构性移除兜底（已足够，白名单是加固而非必需）。
const DEFAULT_AD_PROTECTED_USERNAMES = [];
let AD_PROTECTED_USERNAMES = [];

// 解析静态用户资料表：环境变量 STATIC_USER_PROFILES 格式为 JSON 字符串。
// 例：{"197282502":{"first_name":"威廉","username":"RealNeoMan"}}
// 每条 value 可含 first_name / last_name / username，id 字段由 key 自动补全。
// 解析失败时返回空对象，不中断启动流程。
function parseStaticUserProfiles(raw) {
	if (raw == null || String(raw).trim() === '') return {};
	try {
		const parsed = JSON.parse(String(raw).trim());
		if (typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		const result = {};
		for (const [tgid, info] of Object.entries(parsed)) {
			if (!/^\d+$/.test(tgid)) continue;
			result[tgid] = {
				id: Number(tgid),
				first_name: String(info?.first_name ?? ''),
				last_name: String(info?.last_name ?? ''),
				username: String(info?.username ?? ''),
			};
		}
		return result;
	} catch (_) {
		console.error('[静态用户资料] STATIC_USER_PROFILES 解析失败，格式应为 JSON 字符串');
		return {};
	}
}

// 解析受保护 username 列表：统一小写、去 @ 前缀、过滤非法形态。
function parseAdProtectedUsernames(raw) {
	const source = raw == null || String(raw).trim() === ''
		? DEFAULT_AD_PROTECTED_USERNAMES
		: String(raw).split(/[,，\s]+/);
	const list = (Array.isArray(source) ? source : [source])
		.map((v) => String(v || '').trim().replace(/^@+/, '').toLowerCase())
		// Telegram username 规则：5-32 位字母数字下划线。不合规的丢弃，
		// 避免把 '' 或 '@' 这类空值加进去导致 includes 全量命中。
		.filter((v) => /^[a-z0-9_]{5,32}$/.test(v));
	return [...new Set(list)];
}

// 候选值里是否含受保护的 username。子串判定 —— keyword 短语是截断片段，
// 受保护 handle 可能夹在中间（「收购账号 联系 @ym94203」）。
function containsAdProtectedUsername(value) {
	if (!AD_PROTECTED_USERNAMES.length) return false;
	const lower = String(value || '').toLowerCase();
	if (!lower) return false;
	return AD_PROTECTED_USERNAMES.some((name) => lower.includes('@' + name) || lower.includes(name));
}

// 结构化评分正则（全部来自真实样本的名称 / 用户名形态）
// 对称 emoji：`💚高价收网赚号💚`、`7💚高价收网赚号💚` —— 广告号最强的单一信号。
const AD_SYMMETRIC_EMOJI_RE = /^([\p{Emoji_Presentation}☀-➿]{1,3})(.+)\1$/u;
const AD_NUMERIC_PREFIX_RE = /^[1-9][\p{Emoji_Presentation}☀-➿]/u;
const AD_HAS_EMOJI_RE = /[\p{Emoji_Presentation}☀-➿]/u;
const AD_LINK_RE = /(@[A-Za-z0-9_]{5,}|t\.me\/[^\s]+|https?:\/\/[^\s]+)/;
const AD_BOT_MENTION_RE = /@[A-Za-z0-9_]{2,}bot\b/i;
// 随机 username：只认「字母与数字交替出现」的机器批量生成形态。
//
// 2026-09-07 第二起误封事故的直接原因就在这里。原正则是：
//     /^(?:[a-z]{4,}[0-9]{0,4}|[a-z]+[0-9]+[a-z]+[0-9]*)$/i
// 第一个分支 [a-z]{4,}[0-9]{0,4} 匹配「≥4 字母 + 0~4 数字」，配合调用处的 /[0-9]/
// 数字要求，实际语义退化成「字母开头、末尾带数字的用户名就 +1」—— john1990、
// alice2024、tom99、MiLov1900 全中。那不是随机串，那是全世界最常见的用户名取法
// （名字 + 生日 / 年份），零区分度。被误封用户 @MiLov1900 就是这么中的 +1。
//
// 修的时候还查出第二个问题：原正则【连真正的随机串都抓不到】。xk3f9a2b 这种
// 典型机器生成形态，第一分支要求前面 ≥4 个连续字母（它只有 xk 两个）、第二分支
// 的「字母段-数字段-字母段」段数不够，两边都落空。也就是说这条判据上线以来
// 只抓到了噪声（单词+数字）和 abc123def 一类，真正想抓的形态一个都没进来。
//
// 现在按「熵集中在交错处」重写，两个分支各管一种真实形态：
//   ① (?:[a-z]+[0-9]+){2,}[a-z]*  字母数字交替 ≥2 轮：xk3f9a2b、a1b2c3、x9y8z7q
//   ② [a-z]+[0-9]+[a-z]+          字母-数字-字母 且以字母收尾：abc123def
// 「单词 + 数字」（字母开头、数字收尾、只交替一轮）两个分支都不匹配，即 MiLov1900、
// john1990、tom99 一律放行 —— 这个形态本身不携带任何广告信息，调多长的边界值都是噪声。
const AD_RANDOM_USERNAME_RE = /^(?:(?:[a-z]+[0-9]+){2,}[a-z]*|[a-z]+[0-9]+[a-z]+)$/i;

// 随机字母数字 username 命中分。【归 0】：2026-09-08 主人下令，原话：
// 「关于用户的用户名，用户名只有带广告词才加分，不然这样很容易误封用户。」
//
// 这条判据是「不看广告词、光看长相就加分」的典型：@MiLov1900 两次被误封都吃了这 +1
// （第一次靠它凑到 7 分撞线）。正则虽已按「熵集中在交错处」重写、放行了 MiLov1900 这种
// 「单词+数字」形态，但形态本身不携带任何广告信息 —— 抓到的 xk3f9a2b 既可能是广告号，
// 也可能是随手注册的正常账号，靠它定罪就是拿长相当证据。
// 判据本体保留（reasons 里仍记录，供 /pending 人工判断），只是不再计一分。
const AD_RANDOM_USERNAME_SCORE = 0;

const AD_DOMAIN_CANDIDATE_RE = /(?:https?:\/\/)?(?:[A-Za-z0-9_-]+\.)+[A-Za-z]{2,}(?:\/[^\s]*)?/g;

// 域名白名单预置种子：AI 模型站 / 国内外官方站 / 视频站 / 图片站 / Telegram 官方。
// 建表时一次性写入，避免空白名单状态下正常用户贴官方链接被计分。
const AD_DOMAIN_WHITELIST_SEED = [
	'github.com', 'gitlab.com', 'gitee.com', 'npmjs.com', 'pypi.org', 'stackoverflow.com',
	'anthropic.com', 'claude.ai', 'openai.com', 'chatgpt.com', 'gemini.google.com',
	'huggingface.co', 'deepseek.com', 'moonshot.cn', 'bigmodel.cn', 'aliyun.com',
	'cloudflare.com', 'workers.dev', 'google.com', 'microsoft.com', 'apple.com',
	'amazon.com', 'mozilla.org', 'baidu.com', 'qq.com', 'taobao.com', 'jd.com',
	'163.com', 'sina.com.cn', 'zhihu.com', 'juejin.cn', 'csdn.net', 'cnblogs.com',
	'youtube.com', 'youtu.be', 'bilibili.com', 'b23.tv', 'douyin.com', 'vimeo.com',
	'netflix.com', 'imgur.com', 'unsplash.com', 'pixiv.net', 'flickr.com', 'sm.ms',
	'telegram.org', 'telegram.me', 'core.telegram.org', 'wikipedia.org', 'archive.org'
];

// AI 语义层样本种子（真实广告文本，供首次部署初始化向量库）
const AD_SAMPLE_SEED_TEXTS = [
	'💚高价收网赚号💚 长期收购网 du 商宝账号，老账号优先加价',
	'2💚高价收网赚号💚 专业收购网 du 账号',
	'😊青山落日😊 最新项目一天稳宝8-20U，进群联系',
	'小额洗急 两分钟一单赚几百 私聊我',
	'7💚高价收网赚号💚 收各种赚钱包盒项目',
	'真宝玩家注册即送88-388USDT无需实名 大额无忧',
	'约炮极品辣妞组 真实头像 进入社区查看 黑丝反差女主妇',
	'最新赚钱风口项目 春节前带家人来找我 薪6000+',
	'长期收购各类账号 价格表私聊 秒结不拖欠',
	'招代理日结佣金 无需经验 加微详聊'
];

// ===== 指纹种子库（2026-09-07 建立）=====
//
// 来源：主人提供的 35 张真实广告截图，逐张提取后的铁证短语。
//
// 【为什么要下移一层】这批特征此前只以上面的 AD_SAMPLE_SEED_TEXTS 形式喂给第三层
// AI 语义 —— 那一层要绑 env.AI、要懒加载 embedding、还要过相似度阈值，是概率性的。
// 实测图 27、图 28 两个号线上漏放时 AI 层就在跑，却没拦住。种子指纹把同一批特征
// 下移到第二层：零成本、确定性、不依赖任何外部绑定，命中即封。
//
// 【选词判据】指纹是子串匹配（matchAdFingerprints 里 haystack.includes(row.normalized)），
// 且 weight >= AD_FINGERPRINT_BAN_WEIGHT(0.8) 时命中即封禁、不参与凑分。
// 所以入表门槛只有一条：这个字符串出现在正常人昵称/用户名/简介/发言里的概率必须≈0。
// 判据不是「像不像广告」，而是「正常人会不会说出这几个字」——
// 前者会让「项目」「代理」进表，后者才守得住。
//
// 【被剔除的高危词及原因】以下词在广告里天天出现，但正常语境同样用，一律不收：
//   四件套    → 床上用品，家居群日常词
//   跑分      → 手机性能跑分（安兔兔），技术群高频
//   菠菜      → 蔬菜
//   注册即送  → 电商促销标准话术（注册即送优惠券）
//   无需实名  → 正常产品说明
//   日结佣金  → 正常兼职群用语（只收「招代理日结」这类限定组合）
//   承兑      → 正常金融术语
//   实名号    → 「我这个是实名号」正常人会说
//   洗急      → 单独两字虽不成词，但「清洗急救箱」一类罕见串仍会命中，只收「小额洗急」
//   网赌账号  → 「举报网赌账号」会命中，只收「网赌账号回收」这类带动作的组合
//   稳宝      → 可能是品牌名
//   du        → 单独两字母命中 education / produce / module 等无数英文词，必须带中文上下文
//   项目 / 代理 / 账号 / 联系 / 咨询 / 专业 / 兼职 / 招聘 / 推广 → 通用商业词，子串匹配下是灾难
//
// 【空格变体】normalizeAdFingerprintValue 只把连续空白压成单个半角空格，不会删空格。
// 所以「网 du 商」与「网du商」是两条不同指纹，广告两种写法都有，必须都入表。
//
// 【为什么可以收得这么保守】变体不靠种子穷举 —— 有权限的人 /spam 引用一次就自动学成
// 新指纹（见 handleSpamCommand 的引用分支）。种子只负责钉死「正常人绝不会说」的铁证，
// 剩下的交给人工判定 + 自动学习，这样种子表永远不会成为误封源头。
const AD_FINGERPRINT_SEED = [
	// —— 收购账号型：35 图里的主力形态 ——
	{ type: 'keyword', value: '收网赚号' },
	{ type: 'keyword', value: '高价收网赚' },
	{ type: 'keyword', value: '收购网赚' },
	{ type: 'keyword', value: '长期收购各类账号' },
	{ type: 'keyword', value: '收各种赚钱' },
	{ type: 'keyword', value: '赚钱包盒' },
	{ type: 'keyword', value: '价格表私聊' },
	{ type: 'keyword', value: '秒结不拖欠' },

	// —— 赌博黑话：du 是「赌」的规避写法，必须带中文上下文 ——
	{ type: 'keyword', value: '网 du 商' },
	{ type: 'keyword', value: '网du商' },
	{ type: 'keyword', value: 'du 商宝' },
	{ type: 'keyword', value: 'du商宝' },
	{ type: 'keyword', value: '商宝账号' },
	{ type: 'keyword', value: '真宝玩家' },
	{ type: 'keyword', value: '大额无忧' },

	// —— 网赌号回收：图 27 漏放事故的原型（当时结构化评分只给 3 分）——
	{ type: 'keyword', value: '网赌账号回收' },
	{ type: 'keyword', value: '回收网赌' },
	{ type: 'keyword', value: '收网赌' },
	{ type: 'keyword', value: '输钱号' },
	{ type: 'keyword', value: '亏损号' },

	// —— 洗钱跑单黑话 ——
	{ type: 'keyword', value: '小额洗急' },

	// —— 色情引流：独立的行业维度，双通道的「招揽 ∧ 行业」合取抓不到这一类 ——
	{ type: 'keyword', value: '约炮' },
	{ type: 'keyword', value: '辣妞' },
	{ type: 'keyword', value: '黑丝反差' },

	// —— 招募代理：只收限定组合，单独的「日结佣金」是正常兼职词 ——
	{ type: 'keyword', value: '招代理日结' },
	{ type: 'keyword', value: '代理日结佣金' },

	// 【2026-09-10 方案 A：7 条 username 种子已移除】
	// 原有 @sx8888888sx / @s88888888x_bot / @sx8888888x / @wbwa02ir / @hfzfl /
	// @uiruqnbot / @yurnfbot 七条引流账号种子，随 username 维度整体下线。
	// 原注释写「零误封风险」，线上证伪了这个判断 —— username 型权重 0.8 恰好触及
	// AD_FINGERPRINT_BAN_WEIGHT，是【单条即定罪】通道，一旦有人在正文里提到这些
	// @handle（举报、转述、警示他人「别加这个号」）就会被当成广告号封掉。
	// 举报者反被封是这条通道最典型的误伤形态。
	// 具体引流账号的召回让位于误封治理，这是主人定的口径。
];

// 运行期缓存（按 env.DB 弱引用，isolate 复用时自动隔离不同库）
const D1_AD_DETECTION_INIT_PROMISES = new WeakMap();
const D1_AD_DETECTION_RETRY_AT = new WeakMap();
const AD_DOMAIN_WHITELIST_CACHE = new WeakMap();
const AD_FINGERPRINT_CACHE = new WeakMap();
const AD_SAMPLE_EMBEDDING_CACHE = new WeakMap();

// 读取广告检测配置。数字型环境变量一律先判空串再 parseInt + 有限性 + 范围校验：
// 直接 Number(env.X) 时空串会得到 0 且 isFinite(0) 为真，会把封禁阈值顶成 0，
// 使零分的正常用户全部被判广告 —— 这是必须避开的陷阱。
function loadAdDetectionConfig(env) {
	const pickInt = (raw, fallback, min, max) => {
		if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
		const n = parseInt(String(raw).trim(), 10);
		if (!Number.isFinite(n) || n < min || n > max) return fallback;
		return n;
	};
	const pickFloat = (raw, fallback, min, max) => {
		if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
		const n = parseFloat(String(raw).trim());
		if (!Number.isFinite(n) || n < min || n > max) return fallback;
		return n;
	};
	return {
		scoreThreshold: pickInt(env.AD_SCORE_THRESHOLD, DEFAULT_AD_SCORE_THRESHOLD, 1, 100),
		observationScore: pickInt(env.AD_OBSERVATION_SCORE, DEFAULT_AD_OBSERVATION_SCORE, 1, 100),
		observationHours: pickInt(env.AD_OBSERVATION_HOURS, DEFAULT_AD_OBSERVATION_HOURS, 1, 720),
		aiSimilarityThreshold: pickFloat(env.AD_AI_SIMILARITY_THRESHOLD, DEFAULT_AD_AI_SIMILARITY_THRESHOLD, 0.1, 1),
		fingerprintMinConfidence: pickFloat(env.AD_FINGERPRINT_MIN_CONFIDENCE, DEFAULT_AD_FINGERPRINT_MIN_CONFIDENCE, 0, 1),
		aiEnabled: Boolean(env?.AI && typeof env.AI.run === 'function'),
		// 方案 E：短语自我泛化。AD_ENRICH_EVERY=0 表示完全关闭自动提炼。
		enrichEvery: pickInt(env.AD_ENRICH_EVERY, AD_ENRICH_EVERY, 0, 200),
		enrichMinOccurrence: pickInt(env.AD_ENRICH_MIN_OCCURRENCE, AD_ENRICH_MIN_OCCURRENCE, 2, 20),
		enrichMaxResults: pickInt(env.AD_ENRICH_MAX_RESULTS, AD_ENRICH_MAX_RESULTS, 1, 100),
		// 双通道结构查杀的处置模式。默认 ban：命中即封，不参与凑分。
		//   ban     命中即封禁（默认）
		//   observe 只写观察记录并推快照，不封 —— 上线初期想先看误伤面时用
		//   off     完全关闭，退回纯评分 + 指纹 + AI 三层
		// 用环境变量而非改代码控制，是为了万一真误伤，改一个变量重新部署即可降级，
		// 不必等改代码。
		structureKill: (() => {
			const raw = String(env?.AD_CARD_KILL ?? 'ban').trim().toLowerCase();
			return ['ban', 'observe', 'off'].includes(raw) ? raw : 'ban';
		})()
	};
}

async function d1AdDetectionTablesExist(env) {
	return d1TablesExist(env, [
		'ad_fingerprints',
		'ad_user_screening',
		'ad_sample_embeddings',
		'ad_domain_whitelist',
		'ad_pending_snapshots',
		'ad_confirm_tokens',
		'ad_group_members',
		'ad_scan_state'
	]);
}

// 建立广告检测的 8 张 D1 表。范式与 ensureAdVoteTables 一致：
// promise 去重 → 核心表先行 → 逐条建表/建索引 → 存在性复验 → 失败删缓存并冷却 60 秒。
// 冷却是为了避免 D1 抖动时每条消息都重试一次迁移，把子请求预算耗光。
async function ensureAdDetectionTables(env) {
	if (!env.DB) return false;
	const cached = D1_AD_DETECTION_INIT_PROMISES.get(env.DB);
	if (cached) return cached;
	const retryAt = D1_AD_DETECTION_RETRY_AT.get(env.DB);
	if (retryAt && Date.now() < retryAt) return false;
	const initPromise = (async () => {
		try {
			if (!(await ensureD1Table(env))) throw new Error('D1 核心结构不可用');
			await runD1SchemaStatement(env, 'ad_fingerprints', 'CREATE TABLE IF NOT EXISTS ad_fingerprints (id INTEGER PRIMARY KEY AUTOINCREMENT, fingerprint TEXT NOT NULL UNIQUE, type TEXT NOT NULL, value TEXT NOT NULL, weight REAL NOT NULL DEFAULT 1, match_count INTEGER NOT NULL DEFAULT 0, false_positive_count INTEGER NOT NULL DEFAULT 0, confidence REAL NOT NULL DEFAULT 1, source TEXT, created_by TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
			await runD1SchemaStatement(env, 'idx_ad_fingerprints_type', 'CREATE INDEX IF NOT EXISTS idx_ad_fingerprints_type ON ad_fingerprints (type)', { optional: true });
			await runD1SchemaStatement(env, 'idx_ad_fingerprints_value', 'CREATE INDEX IF NOT EXISTS idx_ad_fingerprints_value ON ad_fingerprints (value)', { optional: true });

			await runD1SchemaStatement(env, 'ad_user_screening', 'CREATE TABLE IF NOT EXISTS ad_user_screening (user_id TEXT PRIMARY KEY, chat_id TEXT, score INTEGER NOT NULL DEFAULT 0, reasons TEXT, snapshot TEXT, layer TEXT, joined_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
			await runD1SchemaStatement(env, 'idx_ad_user_screening_expires', 'CREATE INDEX IF NOT EXISTS idx_ad_user_screening_expires ON ad_user_screening (expires_at)', { optional: true });

			await runD1SchemaStatement(env, 'ad_sample_embeddings', 'CREATE TABLE IF NOT EXISTS ad_sample_embeddings (id INTEGER PRIMARY KEY AUTOINCREMENT, text_hash TEXT NOT NULL UNIQUE, sample_text TEXT NOT NULL, embedding TEXT, dimension INTEGER, source TEXT, created_at INTEGER NOT NULL)');
			await runD1SchemaStatement(env, 'idx_ad_sample_pending', 'CREATE INDEX IF NOT EXISTS idx_ad_sample_pending ON ad_sample_embeddings (dimension)', { optional: true });

			await runD1SchemaStatement(env, 'ad_domain_whitelist', 'CREATE TABLE IF NOT EXISTS ad_domain_whitelist (domain TEXT PRIMARY KEY, added_by TEXT, source TEXT, created_at INTEGER NOT NULL)');

			await runD1SchemaStatement(env, 'ad_pending_snapshots', 'CREATE TABLE IF NOT EXISTS ad_pending_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL, seq INTEGER NOT NULL, user_id TEXT NOT NULL, chat_id TEXT, score INTEGER NOT NULL DEFAULT 0, reasons TEXT, snapshot TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
			await runD1SchemaStatement(env, 'idx_ad_pending_owner_seq', 'CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_pending_owner_seq ON ad_pending_snapshots (owner_id, seq)', { optional: true });
			await runD1SchemaStatement(env, 'idx_ad_pending_expires', 'CREATE INDEX IF NOT EXISTS idx_ad_pending_expires ON ad_pending_snapshots (expires_at)', { optional: true });

			await runD1SchemaStatement(env, 'ad_confirm_tokens', 'CREATE TABLE IF NOT EXISTS ad_confirm_tokens (token TEXT PRIMARY KEY, action TEXT NOT NULL, payload TEXT, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
			await runD1SchemaStatement(env, 'idx_ad_confirm_expires', 'CREATE INDEX IF NOT EXISTS idx_ad_confirm_expires ON ad_confirm_tokens (expires_at)', { optional: true });

			// 发言者名册。一张表同时承担两件事，刻意不拆：
			//   ① 方案 5 的扫描源 —— 【不能用 moderation_messages 代替】：那张表只保留最近
			//      200 条消息（cacheModerationMessage 里 pruneAutoincrementCacheTable 剪枝），
			//      拿它当名册只能扫到最近说话的几十个人，历史发言者全部丢失。本表按 user_id
			//      主键 upsert，只增不删（除超期剪枝），是真正的全量名册。
			//   ② 方案 3 的「已查 bio」台账 —— bio_checked_at 记录上次拉 getChat 的时刻，
			//      消息路径据此决定要不要再花一次 API。
			// 合一的理由：两者的键完全相同（user_id），拆两张表等于每条消息多一次 D1 查询。
			// chat_id 存【最近一次发言的群】—— 判定与封禁需要一个具体群做上下文；
			// 因为判据主体是昵称与 bio（跨群相同）、restricted 又已归零不计分，
			// 用哪个群几乎不影响结论，故不按 (user_id, chat_id) 建组合主键 ——
			// 那会让同一人在 N 个群里占 N 行，把扫描配额直接乘以 N。
			await runD1SchemaStatement(env, 'ad_group_members', 'CREATE TABLE IF NOT EXISTS ad_group_members (user_id TEXT PRIMARY KEY, chat_id TEXT, first_name TEXT, last_name TEXT, username TEXT, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, bio_checked_at INTEGER NOT NULL DEFAULT 0)');
			// 扫描按 bio_checked_at 升序取「最久没查过的人」，这个索引是 cron 的主查询路径。
			await runD1SchemaStatement(env, 'idx_ad_members_bio_checked', 'CREATE INDEX IF NOT EXISTS idx_ad_members_bio_checked ON ad_group_members (bio_checked_at)', { optional: true });
			await runD1SchemaStatement(env, 'idx_ad_members_last_seen', 'CREATE INDEX IF NOT EXISTS idx_ad_members_last_seen ON ad_group_members (last_seen)', { optional: true });

			// 定时扫描的跨次状态（当日已扫计数、当日日期戳）。
			// 不复用 schema_meta：那张表语义是「迁移版本」，混入运行期状态会让
			// d1AdDetectionTablesExist 之类的完整性检查难以判断。单独一张 key-value 表最省事。
			// 【没有游标列】—— 扫描顺序由 bio_checked_at ASC 决定，查过就把时间戳推到现在，
			// 于是它自动排到队尾。这是自平衡的，不需要显式游标，也不会因为增删行而错位。
			await runD1SchemaStatement(env, 'ad_scan_state', 'CREATE TABLE IF NOT EXISTS ad_scan_state (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL)');

			if (!(await d1AdDetectionTablesExist(env))) throw new Error('D1 广告检测表迁移不完整');
			await seedAdDetectionData(env);
			return true;
		} catch (error) {
			console.error('D1 广告检测表初始化失败: ' + formatD1SchemaError(error));
			return false;
		}
	})();
	D1_AD_DETECTION_INIT_PROMISES.set(env.DB, initPromise);
	const initialized = await initPromise;
	if (!initialized) {
		D1_AD_DETECTION_INIT_PROMISES.delete(env.DB);
		D1_AD_DETECTION_RETRY_AT.set(env.DB, Date.now() + AD_SCHEMA_RETRY_COOLDOWN_MS);
	} else {
		D1_AD_DETECTION_RETRY_AT.delete(env.DB);
	}
	return initialized;
}

// 首次建表后写入种子：域名白名单 + AI 语义样本（embedding 留空，由懒加载补齐）。
// 两者都用 INSERT OR IGNORE，重复部署不会覆盖用户后来手工增删的结果。
async function seedAdDetectionData(env) {
	try {
		const existing = await env.DB.prepare('SELECT COUNT(*) AS c FROM ad_domain_whitelist').first();
		if (!Number(existing?.c)) {
			const now = Math.floor(Date.now() / 1000);
			const statements = AD_DOMAIN_WHITELIST_SEED.map((domain) => env.DB
				.prepare('INSERT OR IGNORE INTO ad_domain_whitelist (domain, added_by, source, created_at) VALUES (?, ?, ?, ?)')
				.bind(domain, 'system', 'seed', now));
			if (statements.length) await env.DB.batch(statements);
		}
	} catch (error) {
		console.error('[广告检测] 白名单种子写入失败:', error);
	}
	try {
		// 判空条件从「整表为空」改成「没有 source='seed' 的行」：下面还有第二批种子，
		// 两批必须能各自独立补灌。整表判空会让后加的批次在老库上永远灌不进去。
		const existing = await env.DB.prepare("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE source = 'seed'").first();
		if (!Number(existing?.c)) {
			const now = Math.floor(Date.now() / 1000);
			const statements = AD_SAMPLE_SEED_TEXTS.map((text) => env.DB
				.prepare('INSERT OR IGNORE INTO ad_sample_embeddings (text_hash, sample_text, embedding, dimension, source, created_at) VALUES (?, ?, NULL, NULL, ?, ?)')
				.bind(adTextHash(text), text.slice(0, 500), 'seed', now));
			if (statements.length) await env.DB.batch(statements);
		}
	} catch (error) {
		console.error('[广告检测] 语义样本种子写入失败:', error);
	}
	try {
		// ===== 中心特征下沉到 AI 层（2026-09-08）=====
		// 主人定的口径：「AI 必须学习原有的中心指纹以及 spam 的变体，然后它会自我优化
		// 更多的广告类型变体特征」。此前这两套数据【完全隔离】—— AD_FINGERPRINT_SEED 只进
		// 指纹表，AI 那边只有上面 10 条 AD_SAMPLE_SEED_TEXTS，于是 AI 的「广告概念」是
		// 建立在 10 条样本上的，抓变体能力远低于主人的预期。这批灌进去后样本基数 10 → 36。
		//
		// 【只取 type === 'keyword'】username 类（@sx8888888sx 那 7 条）当语义样本有害无益：
		// 那是账号名不是广告话术，嵌入向量里没有可迁移的语义，反而可能让 AI 把
		// 「任何 @字母数字 串」学成广告特征 —— 正常用户 @ 好友就会开始往高相似度靠。
		//
		// 【长度门槛交给 addAdSample 的 text.length < 4】这里不额外过滤也能挡住「约炮」
		// 「辣妞」这类 2 字词，但走 INSERT 直写绕过了那道门槛，所以必须在这里自己滤 ——
		// 2 字样本语义太稀薄，会把含这两个字的正常短句一起拉到高相似度。
		// 这些短词本来就在指纹层命中即封，不进 AI 样本库没有召回损失。
		const existing = await env.DB.prepare("SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE source = 'seed-core'").first();
		if (!Number(existing?.c)) {
			const now = Math.floor(Date.now() / 1000);
			const coreTexts = AD_FINGERPRINT_SEED
				.filter((item) => item.type === 'keyword' && String(item.value ?? '').trim().length >= 4)
				.map((item) => String(item.value).trim());
			const statements = coreTexts.map((text) => env.DB
				.prepare('INSERT OR IGNORE INTO ad_sample_embeddings (text_hash, sample_text, embedding, dimension, source, created_at) VALUES (?, ?, NULL, NULL, ?, ?)')
				.bind(adTextHash(text), text.slice(0, 500), 'seed-core', now));
			if (statements.length) {
				await env.DB.batch(statements);
				console.log('[广告检测] 已把 ' + statements.length + ' 条中心特征灌入 AI 样本库');
			}
		}
	} catch (error) {
		console.error('[广告检测] 中心特征样本写入失败:', error);
	}
	try {
		// 判空条件刻意不是「整表为空」（前两段那样）—— 指纹表会被自动学习持续写入，
		// 只要有一条自动指纹先落地，判整表就再也灌不进种子了。这里只数 source='seed' 的条数。
		// 副作用是符合既有惯例的：主人 /delword 删掉某条种子后，其余种子仍在 → 计数 > 0
		// → 重新部署不会把删掉的那条灌回来。
		const existing = await env.DB.prepare("SELECT COUNT(*) AS c FROM ad_fingerprints WHERE source = 'seed'").first();
		if (!Number(existing?.c)) {
			const now = Math.floor(Date.now() / 1000);
			// weight 一律 1.0：种子全是铁证，命中即封（AD_FINGERPRINT_BAN_WEIGHT = 0.8）。
			// source 用 'seed' 而不是 'manual'：manual 会被 markAdFingerprintFalsePositive 的
			// 退役 DELETE 豁免掉（那句带 source != 'manual'），种子必须留着这道安全网 ——
			// 万一某条选词失手造成误封，/ignore 累计 3 次误报后它会自动退役。
			const statements = AD_FINGERPRINT_SEED.map((item) => env.DB
				.prepare('INSERT OR IGNORE INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_by, created_at, updated_at) '
					+ 'VALUES (?, ?, ?, 1, 0, 0, 1, ?, ?, ?, ?)')
				.bind(adFingerprintKey(item.type, item.value), item.type, item.value, 'seed', 'system', now, now));
			if (statements.length) await env.DB.batch(statements);
			console.log('[广告检测] 已写入指纹种子 ' + statements.length + ' 条');
		}
	} catch (error) {
		console.error('[广告检测] 指纹种子写入失败:', error);
	}
}

// 广告检测总开关：D1 未绑定或建表失败时整套检测静默跳过，既有功能不受影响。
async function adDetectionReady(env) {
	if (!env?.DB) return false;
	try {
		return await ensureAdDetectionTables(env);
	} catch (error) {
		console.error('[广告检测] 就绪检查失败:', error);
		return false;
	}
}

// 广告检测专用运行期缓存。不复用 loadD1RuntimeCachedValue：后者用 JSON 深拷贝，
// 会把 Set / Map 拍成空对象，且 TTL 固定 15 秒；这里要缓存 Set 且 TTL 60 秒。
// 返回的是同一引用，所有调用方只读不改。
async function loadAdCachedValue(cache, db, ttlMs, loader) {
	if (!db) return null;
	const cached = cache.get(db);
	if (cached?.promise) return await cached.promise;
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	const promise = Promise.resolve().then(loader);
	cache.set(db, { value: null, expiresAt: 0, promise });
	try {
		const value = await promise;
		cache.set(db, { value, expiresAt: Date.now() + ttlMs, promise: null });
		return value;
	} catch (error) {
		cache.delete(db);
		throw error;
	}
}

// 归一化域名：剥协议 → 剥用户信息 → 剥路径/查询 → 剥端口 → 小写 → 去首尾点。
// 通配写法 `*.example.com` 原样保留（白名单里有意义），其余一律压成裸域名。
function normalizeAdDomain(raw) {
	let value = String(raw ?? '').trim().toLowerCase();
	if (!value) return '';
	const wildcard = value.startsWith('*.');
	if (wildcard) value = value.slice(2);
	value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
	const atIndex = value.lastIndexOf('@');
	if (atIndex !== -1) value = value.slice(atIndex + 1);
	value = value.split(/[/?#\\]/)[0];
	if (value.startsWith('[')) {
		const close = value.indexOf(']');
		value = close === -1 ? value.slice(1) : value.slice(1, close);
	} else {
		const colon = value.indexOf(':');
		if (colon !== -1) value = value.slice(0, colon);
	}
	value = value.replace(/^\.+/, '').replace(/\.+$/, '');
	if (!value || !/^[a-z0-9.-]+$/.test(value)) return '';
	if (!value.includes('.')) return '';
	return wildcard ? '*.' + value : value;
}

// 从任意文本抽取域名候选。返回去重后的裸域名数组。
function extractAdDomains(text) {
	const source = String(text ?? '');
	if (!source) return [];
	const found = new Set();
	AD_DOMAIN_CANDIDATE_RE.lastIndex = 0;
	let match;
	while ((match = AD_DOMAIN_CANDIDATE_RE.exec(source)) !== null) {
		const domain = normalizeAdDomain(match[0]);
		if (domain && !domain.startsWith('*.')) found.add(domain);
		if (found.size >= 32) break;
	}
	return [...found];
}

// 白名单判定：精确命中，或作为白名单域的真子域命中。
// 循环上界取 parts.length - 1，保证永不单独匹配顶级域；
// 因此 evil-github.com / github.com.cn / github.com.evil.tk 一律判为不在白名单，
// 只有 github.com 与 api.github.com 这类真子域才通过。
function isAdDomainWhitelisted(domain, whitelistSet) {
	if (!whitelistSet || typeof whitelistSet.has !== 'function') return false;
	const value = normalizeAdDomain(domain);
	if (!value) return false;
	const bare = value.startsWith('*.') ? value.slice(2) : value;
	if (whitelistSet.has(bare)) return true;
	const parts = bare.split('.');
	for (let i = 1; i < parts.length - 1; i++) {
		const parent = parts.slice(i).join('.');
		if (whitelistSet.has(parent) || whitelistSet.has('*.' + parent)) return true;
	}
	return false;
}

// 读取白名单（60 秒缓存）。读失败时返回种子集合兜底，
// 避免 D1 抖动的瞬间把用户贴的官方链接判成广告链接。
async function loadAdDomainWhitelist(env) {
	const fallback = () => new Set(AD_DOMAIN_WHITELIST_SEED);
	if (!env?.DB) return fallback();
	try {
		const value = await loadAdCachedValue(AD_DOMAIN_WHITELIST_CACHE, env.DB, AD_WHITELIST_CACHE_TTL_MS, async () => {
			if (!(await adDetectionReady(env))) return fallback();
			const { results } = await env.DB.prepare('SELECT domain FROM ad_domain_whitelist').all();
			const set = new Set();
			for (const row of results || []) {
				const domain = normalizeAdDomain(row?.domain);
				if (domain) set.add(domain.startsWith('*.') ? domain : domain);
			}
			return set.size ? set : fallback();
		});
		return value instanceof Set ? value : fallback();
	} catch (error) {
		console.error('[广告检测] 读取域名白名单失败:', error);
		return fallback();
	}
}

async function addAdDomainWhitelist(env, rawDomain, addedBy) {
	const domain = normalizeAdDomain(rawDomain);
	if (!domain) return { ok: false, reason: 'invalid' };
	if (!(await adDetectionReady(env))) return { ok: false, reason: 'unavailable' };
	try {
		const result = await env.DB
			.prepare('INSERT OR IGNORE INTO ad_domain_whitelist (domain, added_by, source, created_at) VALUES (?, ?, ?, ?)')
			.bind(domain, String(addedBy ?? ''), 'manual', Math.floor(Date.now() / 1000)).run();
		AD_DOMAIN_WHITELIST_CACHE.delete(env.DB);
		return { ok: true, domain, added: Number(result?.meta?.changes || 0) > 0 };
	} catch (error) {
		console.error('[广告检测] 添加域名白名单失败:', error);
		return { ok: false, reason: 'error' };
	}
}

async function removeAdDomainWhitelist(env, rawDomain) {
	const domain = normalizeAdDomain(rawDomain);
	if (!domain) return { ok: false, reason: 'invalid' };
	if (!(await adDetectionReady(env))) return { ok: false, reason: 'unavailable' };
	try {
		const result = await env.DB.prepare('DELETE FROM ad_domain_whitelist WHERE domain = ?').bind(domain).run();
		AD_DOMAIN_WHITELIST_CACHE.delete(env.DB);
		return { ok: true, domain, removed: Number(result?.meta?.changes || 0) > 0 };
	} catch (error) {
		console.error('[广告检测] 删除域名白名单失败:', error);
		return { ok: false, reason: 'error' };
	}
}

// === 第一层：结构化评分 ===
// 权重全部按真实样本回归而来，命中项同类只计一次，reasons 供快照与私聊通知展示。

function countAdKeywordHits(text, keywords) {
	const source = String(text ?? '');
	if (!source) return [];
	const lower = source.toLowerCase();
	const hits = [];
	for (const word of keywords) {
		const needle = String(word).toLowerCase();
		if (needle && lower.includes(needle)) hits.push(word);
		if (hits.length >= 6) break;
	}
	return hits;
}

// Bio 重复段落：广告号常把同一句话按行复读，正常用户极少这样写。
function hasAdRepeatedSegment(text) {
	const source = String(text ?? '').trim();
	if (source.length < 8) return false;
	const segments = source.split(/[\n\r,，。;；|｜/、]+/).map((s) => s.trim()).filter((s) => s.length >= 3);
	if (segments.length < 2) return false;
	const seen = new Set();
	for (const segment of segments) {
		if (seen.has(segment)) return true;
		seen.add(segment);
	}
	return false;
}

// 文本里是否含非白名单引流链接。
//
// 2026-09-08 主人下令重排本函数的三条判据，原话：「t.me 不该成为封禁词，也加豁免。
// 因为正常用户大部分都会使用这个。只有广告用户或者个别用户会直接 @bot 简介 @bot，
// 所以 t.me 加封禁词只会误封更多。」
//
// | 判据                    | 现状 | 理由 |
// |-------------------------|------|------|
// | @xxxbot（AD_BOT_MENTION_RE） | 保留，单独成立 | 主人明确认定这才是广告特征 |
// | t.me/                   | 【已删除】 | 正常用户分享 Telegram 链接是常态；@MiLov1900 两次误封都吃了这个 +2 |
// | @任意5位以上handle       | 【收紧】需同现业务关键词 | 单纯 @ 某人是聊天常态，只有「@handle + 行业指向」才是引流 |
// | 非白名单裸域名           | 保留，单独成立 | 与 Telegram 无关的外部站点仍是引流出口 |
//
// options.businessHit 由调用方传入（scoreAdProfile / scoreAdMessageText 里已算好
// businessHits，不重复扫词表）。缺省 false —— 没有业务词上下文时按最宽松处理，
// 宁可漏一个 @ 提及，也不让不带上下文的调用方凭空造出 +2。
function hasAdSuspiciousLink(text, whitelistSet, options = {}) {
	const source = String(text ?? '');
	if (!source) return false;
	if (AD_BOT_MENTION_RE.test(source)) return true;
	// @handle 只在同现业务关键词时才算引流出口，详见上表。
	if (options.businessHit === true && /@[A-Za-z0-9_]{5,}/.test(source)) return true;
	for (const domain of extractAdDomains(source)) {
		if (isAdPlatformDomain(domain)) continue;			// 平台裸域名不再重复计分（t.me 亦在此列）
		if (!isAdDomainWhitelisted(domain, whitelistSet)) return true;
	}
	return false;
}

// 评分账号资料：名称 + username + bio + 受限状态。
// ===== 双通道结构查杀（2026-09-07 第三次漏放事故后新建）=====
//
// 事故复盘：昵称「♻网赌账号回收h🀄」、bio「6大量收网赌亏损号输钱号 联系 @sx8888888sx
// 双向联系 @s88888888x_bot 权威」的号，在结构化评分里只拿到 2 分（封禁线 7）：
//     +2 业务关键词：收网      ← 「大量收网赌」跨词边界拼出的巧合子串，不是设计意图
//     +2 含非白名单引流链接
//     +1 随机字母数字 username
//     -3 命中豁免词：双向 / bot ← 他自己写的「双向联系 @xxx_bot」成了挡箭牌
// 强交易动词命中 0 个 —— bio 写的是「大量收」，词表里有「专业收」「高价收」「代收」，
// 独缺「大量收」；因为强动词为 0，豁免走「无交易动词」分支吃满 -3 而不是 -1。
// 同一个机制此前还漏放过「佳佳（邪恶姐姐）」（bio 列 3 个同前缀引流账号，
// 靠「双向机器人」拿 -3）。两个号词汇毫无交集，结构一模一样。
//
// 这里不再往词表里补词 —— 补词是打地鼠，广告号插一个字（高价「回」收）就绕过去了。
// 改成三条与具体词汇解耦的设计：
//
//   1) 【构词模式代替固定短语】(大量|高价|长期|专业|急|现金)\s*[收购] 一条正则覆盖
//      「大量收 / 高价回收 / 专业收 / 急收 / 现金收」全部变体，不必逐个入表。
//   2) 【两个正交维度合取定罪】招揽意图 ∧ 行业指向。只谈行业（技术群聊菠菜防护、
//      聊 USDT 行情）不封；只谈交易（收藏老相机出闲置、回收老硬盘）不封；两个都有
//      才是广告。这个合取天然把正常语境挡在外面，比调阈值精确得多。
//   3) 【豁免词完全不参与】结构判定不做任何减分。豁免词的本意是保护写「双向机器人」
//      「开源项目」的技术用户，但正常技术用户不会同时写出招揽意图 + 行业指向，
//      所以结构判定根本不需要它来兜底 —— 而它留在这条路径上只会被广告号当挡箭牌。
//
// 两条通道喂给同一个判定核，区别只在输入文本：
//   通道 card：username + bio     → 资料卡本身就是广告牌，就地正法，与他发什么无关
//   通道 body：bio + 本条正文      → 资料卡侥幸过关的，一旦正文发广告，合起来绝对查杀
// 通道 body 的价值在「两边各半条线索」：bio 写「收U」、正文写「有 USDT 现汇的老板私我」，
// 单看任何一边都不够定罪，合起来招揽 + 行业俱全。

// 招揽意图：广告号「要买 / 要卖 / 要招」的动作。用构词模式而非固定短语。
const AD_SOLICIT_PATTERNS = [
	// 数量/价格修饰 + 收购。负向排除是关键：「大量收集数据」「喜欢收藏老相机」
	// 「长期收听」在正常语境高频，它们后面跟的是完全不同的宾语。
	/(大量|大批|高价|长期|专业|诚[心意]|急|现金|全国|低价)\s*[收购](?!集|藏|录|纳|听|拾|割|尾|支|入|盘)/,
	// 收/购 + 账号类宾语。广告号的核心业务就是账号与卡料交易。
	// 「帐号」保留：那是简体异体写法（帐/账通用），不是繁体。
	/[收购]\s*[回]?\s*(号|账号|帐号|账户|卡|料|币|u\b|U\b)/,
	// 供给侧动作词。
	/(出售|出租|转让|批发|代办|代开|承接|承兑|包出)/,
	// 招募下游。
	/(招|收)\s*(代理|下级|下家|车手|水军|学员|渠道)/,
	// 「回收 / 求购 / 收购」整词 —— 这三个是中文交易广告最高频的动词，
	// 单独成词时不需要修饰语也足以构成招揽意图。
	/(回收|求购|收购)/
];

// 行业指向：广告号「做哪门生意」。与招揽意图正交 —— 只有两者同现才定罪。
const AD_BIZ_PATTERNS = [
	/(网赌|赌博|博彩|菠菜|棋牌|彩票|六合|时时彩)/,
	/(输钱号|亏损号|老账号|实名号|四件套|卡料|跑分|黑产)/,
	/(网赚|搞钱|赚钱|日入|月入|躺赚|暴利)/,
	/(usdt|泰达|u商|du商|虚拟币|换汇|跑币)/i,
	// 单字母 U 指代 USDT 是圈内写法，必须带交易动作才算 —— 单独一个 U 是噪声。
	/[收出接放]\s*(u|U)\b/, /\b(u|U)\s*[商币源]/
];

const AD_STRUCT_MATCH = (patterns, text) => patterns.some((re) => re.test(text));

// ===== 身份查杀（identity）：昵称 + 简介，单类命中即封 =====
// 2026-09-08 主人下令新增。原话三句，第三句纠正了前两句的对象：
//   ①「关于用户的用户名，用户名只有带广告词才加分，不然这样很容易误封用户。」
//   ②「用户名带广告的词必封。」
//   ③「用户名只能英文加数字，那说明你抓的是 @用户名，那我描述错了。你真正要抓的是
//      用户简介跟用户名字，而不是用户名。因为用户名要嘛纯英文、要嘛英文加数字，无法判定。」
//
// 所以本通道的判定域是【昵称（first+last name）+ 简介（bio）】，刻意【不含 @handle】——
// Telegram 的 @handle 只允许 [A-Za-z0-9_]，中文一个字都进不去，而两张中文词表
// （AD_TRADE_VERBS 45 条 / AD_BUSINESS_KEYWORDS 63 条）唯一的 ASCII 词条是 'USDT'，
// 拿 @handle 做中文词判定等于判不了。@handle 的「长相」判据也已按①归零
// （见 AD_RANDOM_USERNAME_SCORE）。
//
// 与资料卡查杀（card）的分工：
//   card     ：昵称 + @handle + 简介，要求「招揽意图 ∧ 行业指向」【两类同现】
//   identity ：昵称 + 简介，放宽到【单类命中即封】
// identity 更狠，抓的是「名字/简介里只写了半句就已经没有正当解释空间」的号，
// 例如昵称只写「回收账号」（只有招揽、没写行业）或只写「网赌」（只有行业、没写招揽）。
//
// 【为什么单类判据只认强构词模式、不认那两张宽词表】
// AD_BUSINESS_KEYWORDS 里有大量正常人天天说的词：外围（外围电路 / 外围设备，技术群高频）、
// 快餐、空降、技师、资源群、实名、汇率、同城、上门、赚钱、料子、一夜、收网、刷量、洗白。
// 这些词在「两类同现才计分」的评分层是安全的（要配上交易动词才计分），但拿来做
// 「单类命中即封」就是灾难 —— 昵称叫「外围设备维修」「同城顺风车」会被就地正法。
// 而 AD_SOLICIT_PATTERNS / AD_BIZ_PATTERNS 本来就是为「命中即封」设计的：前者带负向排除
// （「大量收集数据」「喜欢收藏老相机」「长期收听」全部排掉），后者全是网赌 / 卡料 /
// 四件套 / 跑分 / USDT 这类没有正当用途的硬核行业词。
//
// 要放宽到宽词表，把下面这个开关改成 true 即可（两张表的单类命中也会定罪）。
const AD_IDENTITY_KILL_WIDE = false;

// 招揽构词的技术语境负向排除。【只用于 identity 通道】——
// AD_SOLICIT_PATTERNS 最后一条 /(回收|求购|收购)/ 是整词判据，在 card 通道里它必须
// 配上行业指向才定罪，所以「垃圾回收机制」安全；但 identity 通道是【单类即封】，
// 「垃圾回收」「内存回收」「回收站清理工具」会当场误封 —— 这几个词组在技术群极高频。
const AD_IDENTITY_TECH_RECYCLE_RE = /(垃圾|内存|资源|缓存|磁盘|空间|对象|连接|线程|句柄|旧物|废品|电池|塑料|纸箱)\s*回收|回收\s*(站|机制|器|策略|算法)/;

// 行业构词【硬清单】：只用于 identity 通道的单类即封，是 AD_BIZ_PATTERNS 的严格子集。
//
// 为什么必须另立一张而不能直接用 AD_BIZ_PATTERNS：那张表是为【两类同现】设计的，
// 里面有一批词在正常语境高频，配上招揽动词才是广告，单独出现完全无罪 ——
//   四件套  →「纯棉四件套现货 床单被套一起发」是家居商户（项目里就有这条反例回归断言）
//   跑分    →「手机跑分」「CPU 跑分」「安兔兔跑分」，技术群天天说
//   老账号  →「我这个老账号」
//   棋牌    →「棋牌室」「棋牌类游戏开发」
//   彩票 / 赚钱 / 搞钱 / 月入 / 虚拟币 / 换汇 / usdt → 正常讨论、外贸换汇、行情教程
// 这些词【不进本清单】，它们照旧在 card / body 通道靠两类同现定罪：
// 「四件套 + 收购」封，「四件套 + 床单被套」放行。
//
// 进本清单的标准只有一条：【该词组在正常中文语境里没有任何正当用途】。
//
// 【不收繁体变体】：2026-09-08 主人下令「繁体全部去掉，如果有的广告会繁体变体，没事，
// 我通过 /spam 提交并学习也一样的」。所以本文件全部广告词表（含 AD_SOLICIT_PATTERNS /
// AD_BIZ_PATTERNS / 三张关键词表）一律只写简体，繁体广告走 /spam 手动学习成指纹。
// 后来者不要「顺手补全繁体」—— 词表每加一倍字面量就多一倍误封面，而 /spam 学出来的
// 指纹是完整短语、命中即封，比正则变体精准得多。
// 唯一例外见 parseBanlistHTML：那条繁体是 GKY 第三方站点的返回原文，不是我们的词表。
const AD_IDENTITY_BIZ_HARD_PATTERNS = [
	// 赌博博彩黑话。刻意不含「棋牌」「彩票」「六合」——
	// 「六合」是地名（南京六合区）与「六合八荒」，只收「六合彩」。
	/(网赌|赌博|博彩|菠菜|六合彩|时时彩|百家乐|网络赌)/,
	// 黑产料件黑话。刻意不含「四件套」「跑分」「老账号」，理由见上。
	/(输钱号|亏损号|实名号|卡料|黑产|洗钱|出黑|料子出|四件套出|出四件套)/,
	// 网赚黑话。「赚钱」「搞钱」不收，只收带量词与黑话形态的。
	// 「月入过 / 月入上」也刻意不收 —— 「月入过万讨论组」是正常职场话题，
	// 而「日入过万」在中文里几乎只出现在网赚广告里，两者不对称。
	/(网赚|躺赚|日入过|日入上|日入[0-9]|暴利项目|日结佣金)/,
	// 虚拟币交易黑话。单独的 usdt / 虚拟币 / 换汇不收（技术群与外贸群日常），
	// 只收带交易动作或圈内简称的形态。
	/(泰达币|u商|du商|跑币|承兑usdt|usdt承兑)/i,
	/[收出接放]\s*(u|U)\b/, /\b(u|U)\s*[商源]/
];

// 判定核：昵称 + 简介，单类命中即封。
function judgeAdIdentityKill(payload) {
	const name = String(payload?.name ?? '').trim();
	const bio = String(payload?.bio ?? '').trim();
	const source = [name, bio].filter(Boolean).join('\n');
	if (!source) return { guilty: false, channel: 'identity', form: '', reasons: [] };

	// 豁免闸门【刻意做成不对称的】，两类构词的误报风险根本不同：
	//   行业硬构词（AD_IDENTITY_BIZ_HARD_PATTERNS）= 网赌 / 博彩 / 卡料 / 洗钱 / 网赚 /
	//     躺赚 / u商 / 收U —— 没有任何正当用途，【不受豁免词影响】，
	//     否则广告号在昵称里塞个「bot」「机器人」就能免死。
	//   招揽构词（AD_SOLICIT_PATTERNS）= 收购 / 回收 / 求购 / 出售 / 招代理 —— 部分词
	//     在正常语境成立（垃圾回收、回收站、出售二手显卡），【保留豁免词闸门】+ 技术负向排除。
	//   宽词表（AD_IDENTITY_KILL_WIDE 打开时）—— 匹配最松，同样保留豁免词闸门。
	const exemptHits = countAdKeywordHits(source, AD_EXEMPT_KEYWORDS);

	const bizStruct = AD_STRUCT_MATCH(AD_IDENTITY_BIZ_HARD_PATTERNS, source);
	const solicitStruct = AD_STRUCT_MATCH(AD_SOLICIT_PATTERNS, source)
		&& !AD_IDENTITY_TECH_RECYCLE_RE.test(source);
	const wideTrade = AD_IDENTITY_KILL_WIDE ? countAdKeywordHits(source, AD_TRADE_VERBS) : [];
	const wideBiz = AD_IDENTITY_KILL_WIDE ? countAdKeywordHits(source, AD_BUSINESS_KEYWORDS) : [];

	// 受豁免影响的判据与不受影响的判据分开收集。
	const hardHits = [];
	if (bizStruct) hardHits.push('行业黑话');
	const softHits = [];
	if (solicitStruct) softHits.push('招揽构词');
	if (wideTrade.length) softHits.push('交易动词：' + wideTrade.slice(0, 2).join('/'));
	if (wideBiz.length) softHits.push('业务关键词：' + wideBiz.slice(0, 2).join('/'));

	if (!hardHits.length && !softHits.length) return { guilty: false, channel: 'identity', form: '', reasons: [] };

	const softAlive = softHits.length > 0 && exemptHits.length === 0;
	if (!hardHits.length && !softAlive) {
		return {
			guilty: false,
			channel: 'identity',
			form: '',
			reasons: ['（身份查杀命中 ' + softHits.join(' + ') + '，但命中豁免词 '
				+ exemptHits.slice(0, 3).join('/') + '，单类判据放行）']
		};
	}
	const hits = [...hardHits, ...(softAlive ? softHits : [])];

	// 命中位置写进 reasons：主人拿 /pending 复核时要能一眼看出是名字还是简介中的枪。
	const hitIn = (part) => {
		if (!part) return false;
		if (AD_STRUCT_MATCH(AD_IDENTITY_BIZ_HARD_PATTERNS, part)) return true;
		if (!softAlive) return false;
		if (AD_STRUCT_MATCH(AD_SOLICIT_PATTERNS, part) && !AD_IDENTITY_TECH_RECYCLE_RE.test(part)) return true;
		return AD_IDENTITY_KILL_WIDE && (countAdKeywordHits(part, AD_TRADE_VERBS).length > 0
			|| countAdKeywordHits(part, AD_BUSINESS_KEYWORDS).length > 0);
	};
	const where = [];
	if (hitIn(name)) where.push('名字');
	if (hitIn(bio)) where.push('简介');

	return {
		guilty: true,
		channel: 'identity',
		form: 'S',			// S = single，单类命中形态，与 card 的 A / B / A+B 区分
		reasons: ['身份查杀命中（' + (where.join('+') || '资料卡') + '，单类即封）：' + hits.join(' + ')
			+ (exemptHits.length ? '（含豁免词 ' + exemptHits.slice(0, 2).join('/') + '，但行业黑话不受豁免）' : '')]
	};
}

// 引流出口分析。核心约定：【自己的 @handle 不算出口】—— 它是身份标识，
// 每个人都有；把它算进出口会让所有设了用户名的人凭空多一个「引流渠道」。
function analyzeAdOutlets(text, selfUsername) {
	const self = String(selfUsername || '').toLowerCase().replace(/^@+/, '');
	const mentions = [...new Set(
		(String(text || '').match(/@[A-Za-z0-9_]{4,32}/g) || []).map((x) => x.slice(1).toLowerCase())
	)].filter((x) => x !== self);
	const linkCount = (String(text || '').match(/(https?:\/\/\S+|t\.me\/\S+)/gi) || []).length;
	// 账号名含 4 位以上连续重复数字（8888888 / 66666）是批量注册号的强特征，
	// 正常人的 @handle 极少这么取。
	const repeatedDigit = mentions.filter((x) => /(\d)\1{3,}/.test(x));
	// 引流矩阵：同一人批量注册的号前缀高度雷同（jiajia33998 / jiajia3369bot / jiajia3399）。
	// 「佳佳（邪恶姐姐）」那个号一个广告词都没有，靠的就是这一条。
	let sharedPrefix = false;
	for (let i = 0; i < mentions.length && !sharedPrefix; i++) {
		for (let j = i + 1; j < mentions.length; j++) {
			let k = 0;
			while (k < mentions[i].length && k < mentions[j].length && mentions[i][k] === mentions[j][k]) k += 1;
			if (k >= 4) { sharedPrefix = true; break; }
		}
	}
	return {
		mentions,
		count: mentions.length + linkCount,
		hasBot: mentions.some((x) => /bot$/.test(x)),
		repeatedDigit,
		sharedPrefix
	};
}

// 判定核。两条通道共用，channel 只用于回执与日志，不影响判定本身。
function judgeAdStructure(text, selfUsername, channel) {
	const source = String(text || '').trim();
	if (!source) return { guilty: false, channel, form: '', reasons: [] };

	const solicit = AD_STRUCT_MATCH(AD_SOLICIT_PATTERNS, source)
		|| countAdKeywordHits(source, AD_TRADE_VERBS).length > 0;
	const biz = AD_STRUCT_MATCH(AD_BIZ_PATTERNS, source)
		|| countAdKeywordHits(source, AD_BUSINESS_KEYWORDS).length > 0;
	const outlets = analyzeAdOutlets(source, selfUsername);

	// 形态 A 明说型：招揽 ∧ 行业。刻意【不要求有联系出口】——
	// 「大量收U 秒结」这句话本身就是广告，他会私聊你，不留联系方式一样是广告。
	const formA = solicit && biz;
	// 形态 B 引流矩阵型：不说业务，只堆账号。三个独立信号任一成立即可 ——
	// 正常人 bio 里不会列 3 个账号、不会有同前缀小号群、不会有两个 8888 号。
	const formB = outlets.mentions.length >= 3 || outlets.sharedPrefix || outlets.repeatedDigit.length >= 2;

	const form = formA && formB ? 'A+B' : (formA ? 'A' : (formB ? 'B' : ''));
	if (!form) return { guilty: false, channel, form: '', reasons: [] };

	const label = channel === 'card' ? '资料卡查杀' : (channel === 'quoted' ? '引用体查杀' : '正文查杀');
	const detail = [];
	if (solicit) detail.push('招揽意图');
	if (biz) detail.push('行业指向');
	if (outlets.count) detail.push('引流出口×' + outlets.count + (outlets.hasBot ? '(含bot)' : ''));
	if (outlets.repeatedDigit.length) detail.push('重复数字账号×' + outlets.repeatedDigit.length);
	if (outlets.sharedPrefix) detail.push('同前缀引流矩阵');
	return {
		guilty: true,
		channel,
		form,
		reasons: [label + '命中（形态 ' + form + '）：' + detail.join(' + ')]
	};
}

// 通道 card：只看 username + bio。刻意不含正文与昵称之外的任何输入 ——
// 它要回答的问题是「这张资料卡本身是不是广告牌」，与他此刻说了什么无关。
// 昵称计入：Telegram 界面上昵称就是资料卡最显眼的一行（「♻网赌账号回收h🀄」）。
function judgeAdProfileCard(payload) {
	const text = [payload?.name, payload?.username, payload?.bio].filter(Boolean).join('\n');
	return judgeAdStructure(text, payload?.username, 'card');
}

// 通道 body：bio + 本条正文。资料卡单独不够定罪、但正文补上了缺的那一半时在此收网。
function judgeAdBodyWithBio(payload) {
	if (!String(payload?.text || '').trim()) return { guilty: false, channel: 'body', form: '', reasons: [] };
	const text = [payload?.bio, payload?.text].filter(Boolean).join('\n');
	return judgeAdStructure(text, payload?.username, 'body');
}

// ===== 通道 quoted：引用体查杀 =====
// 2026-09-08 主人选定「两条都要（最严也最安全）」后新增。
//
// 抓的形态是【他自己几乎什么都没说，却引用了一整条广告】：
// 主人给的实例是昵称 Maybell Tillman、正文只有一个字母 `c`、引用块里是
// 「操逼赚钱，招探花9000一单，提供设备」。这也是线上漏放 50+ 个号的共同长相
// （正文全是 v / z / n / x / c 一个字母）—— 广告词一个都不在他自己的正文里，
// 所以评分层、card、body 三条路全都看不见，一路 0 分走到底。
//
// 【为什么不能直接把引用体当成他自己的正文】
// 引用体是【别人】写的。正常用户引用一条广告然后吐槽「这什么垃圾」，
// 引用体里照样全是广告词 —— 直接并入判定等于把举报的人和发广告的人一起封。
// 管理员不受影响（isPrivilegedManager 在 detectAdOnMessage 入口就 return 了），
// 但普通群友天天这么干，这是本通道最大的误封面。
//
// 所以定罪要【同时】过两道门槛（主人选的就是这一档，最严）：
//   门槛一 自己正文近乎为空（≤ AD_QUOTED_KILL_MAX_OWN_TEXT 个字符）
//          —— 正常人引用别人的消息一定会说点什么（吐槽 / 提醒 / 追问），
//             只发一个字母的唯一动机就是「让引用的广告露出来」，靠引用体蹭曝光。
//   门槛二 自己正文不含举报 / 吐槽语义
//          —— 与门槛一并不冗余：「广告」「垃圾」「骗子」都只有 2 个字，
//             照样能过门槛一。群友引用广告只回「广告」两个字是最常见的举报方式，
//             这一档必须放行。复用 AD_REPLY_LEARN_TRIGGERS 正合适 ——
//             那张表的语义本来就是「这个人在说：这是广告」。
//
// 判据本体直接复用 judgeAdStructure（招揽 ∧ 行业 两类同现），不另立标准：
// 那个函数的 solicit / biz 已经把两张构词表与两张关键词表都并进去了。
// 实例验算：「提供设备」在 AD_TRADE_VERBS → solicit 成立；
//          「赚钱」在 AD_BIZ_PATTERNS → biz 成立；形态 A 定罪。
//
// 【绕过成本】：广告号只要在正文里多打几个正常字（「看看」「哈哈」）就能过门槛一。
// 这是主人认可的兜底分工 —— 那种变体交给 /spam 手动学成指纹（命中即封，比正则精准）。
// 刻意不去追那条尾巴：把门槛一放宽到十几个字，就会开始误封「@某人 你看这个广告」。
const AD_QUOTED_KILL_MAX_OWN_TEXT = 4;

// 纯 ASCII 正文的放宽档（2026-09-09 方案 B）。来源是旧代码 isShortQuoteWrapperText
//（e80658e^:6393-6411）的双档设计：它对 ASCII 用 ≤8、对含中日韩的用 ≤4。
//
// 为什么 ASCII 可以比中文松一倍：`h` `t` `k` `ok` `hello` `123456` `laowang` 这种
// 纯字母数字外壳在中文群里【没有任何正常语义】—— 真人用中文聊天，不会突然回一串拼音或随机字母。
// 而中文短回复（好的 / 谢谢 / 卧槽 / 牛逼）恰恰是最常见的正常反应，所以中文档一个字都不敢放。
//
// 主人的实战情报（原话）：「现在这个引用广告带短字符是只有广告才会这样做。而且大部分都是
// 这样的内容。它不会加多个字符 它最多就是单个字符。也就是我截图的那样。」
// 截图实物：正文只有一个 `h`，引用框是 ungrf 频道的「招募探花，提供设备，收探花视频9000一部」。
// 那条 1 字符的 `h` 现在这套代码已经能杀（1 ≤ 4）；放宽到 8 是把 `hello` / `123456` /
// `laowang` 这类 5~8 字的同类外壳一起收进来，属于同一形态的尾巴。
//
// 【刻意不做的两件事】：
//   1. 不引入旧代码的 HARMLESS_SHORT_REPLY_PATTERN 白名单 —— 那是门槛二的职责，
//      本次改动只动门槛一的阈值，判据与门槛二一律不动。
//   2. 不动中文档 —— 含任何非 ASCII 字符（中日韩 / emoji / 全角标点）时，
//      连长度算法都走原来的 own.length，行为与改动前【逐字节一致】，零回归风险。
const AD_QUOTED_KILL_MAX_OWN_TEXT_ASCII = 8;

// 举报 / 吐槽语义。命中即放行本通道。
// 前半段复用回复学习触发词（广告 / 垃圾 / 封了 / 封他 / 该封 …），
// 后半段补的是「不说封、只表态」的常见短回复 —— 举报的人未必用得上「封」字。
// 【2026-09-11 与 AD_REPLY_LEARN_TRIGGERS 解耦】这里原本写 ...AD_REPLY_LEARN_TRIGGERS 展开复用，
// 但两张表的语义【方向相反】，共用一张必然有一边出错：
//   AD_REPLY_LEARN_TRIGGERS 是【封禁指令】，误触发的代价是封错人 → 必须【严】，只认完整短语；
//   本表是【举报者保护名单】，用于识别「引用广告 + 回一句『广告』警示他人」的群友并放行，
//   漏收词的代价是把举报者当广告号杀掉 → 必须【宽】，单词、短语都要收。
// 收紧触发词那次连带把本表也收窄了，直接打穿举报者保护（测试里 4 条门槛二断言当场变红）。
// 现在本表独立维护、刻意保留全部单词形态，与触发词表各自演进、互不影响。
const AD_QUOTED_KILL_NEGATORS = [
	// 举报语义单词与短语：与封禁触发词刻意重叠，但这里【只用于放行】，不会导致任何封禁。
	'广告', '垃圾', '封了', '封他', '封她', '封掉', '该封', '要封', '封禁',
	'这是广告', '这条广告', '是广告', '广告号', '广告狗', '垃圾广告',
	'骗子', '骗人', '诈骗', '假的', '割韭菜', '别信', '不要信', '小心', '警惕', '注意',
	'举报', '拉黑', '屏蔽', '踢了', '踢他', '什么鬼', '什么玩意', '傻逼', '滚'
];

function judgeAdQuotedKill(payload) {
	const quoted = String(payload?.quoted || '').trim();
	if (!quoted) return { guilty: false, channel: 'quoted', form: '', reasons: [] };

	const own = String(payload?.text || '').trim();

	// 门槛一：自己正文必须近乎为空。阈值按语种分档（见两个常量的注释）：
	//   纯 ASCII 可打印字符 → 剥掉非字母数字后 ≤8，且原文 ≤16（原文上限沿用旧代码的 16）
	//   含任何非 ASCII（中日韩 / emoji / 全角标点）→ 原封不动走 own.length ≤ 4
	// ownAsciiCore === null 就是「不是纯 ASCII」，此时长度算法与阈值都与改动前完全一致。
	const ownAsciiCore = /^[\x20-\x7E]*$/.test(own) ? own.replace(/[^A-Za-z0-9]+/g, '') : null;
	const ownWeight = ownAsciiCore === null ? own.length : ownAsciiCore.length;
	const ownLimit = ownAsciiCore === null ? AD_QUOTED_KILL_MAX_OWN_TEXT : AD_QUOTED_KILL_MAX_OWN_TEXT_ASCII;
	if (ownWeight > ownLimit || own.length > AD_QUOTED_KILL_MAX_OWN_TEXT_ASCII * 2) {
		return { guilty: false, channel: 'quoted', form: '', reasons: [] };
	}
	// 门槛二：自己正文一旦带举报 / 吐槽语义就放行 —— 那是群友在举报，不是广告号在引流。
	const negatorHits = countAdKeywordHits(own, AD_QUOTED_KILL_NEGATORS);
	if (negatorHits.length) {
		return {
			guilty: false,
			channel: 'quoted',
			form: '',
			reasons: ['（引用体含广告词，但本人正文是举报语义 ' + negatorHits.slice(0, 2).join('/') + '，放行）']
		};
	}

	const verdict = judgeAdStructure(quoted, payload?.username, 'quoted');
	if (!verdict.guilty) return verdict;

	// 豁免闸门与 scoreAdMessageText 保持同一套不对称口径：
	// 引用体命中技术豁免词【且没有强交易动词】才放行 —— 纯技术贴被引用不该定罪；
	// 一旦出现强动词（收购 / 代付 / 提供设备 / 秒结），塞几个术语也不免死，
	// 否则「收购 vless 账号 USDT 日结」这种夹带术语的广告会整条溜过去。
	const exemptHits = countAdKeywordHits(quoted, AD_EXEMPT_KEYWORDS);
	const tradeHits = countAdKeywordHits(quoted, AD_TRADE_VERBS);
	if (exemptHits.length && !tradeHits.length) {
		return {
			guilty: false,
			channel: 'quoted',
			form: '',
			reasons: ['（引用体命中广告构词，但含技术豁免词 ' + exemptHits.slice(0, 3).join('/')
				+ ' 且无强交易动词，放行）']
		};
	}

	// reasons 里带上引用体片段：主人拿 /pending 复核时要能直接看到「他引的到底是什么」，
	// 否则封禁通知里只有一个字母 `c`，完全无法判断封得对不对。
	return {
		...verdict,
		reasons: [
			...verdict.reasons,
			'引用体查杀：本人正文仅 ' + (own.length ? '「' + own + '」' : '空')
				+ '，广告词全在引用的那条消息里 —— 「' + quoted.slice(0, 60).replace(/\s+/g, ' ') + '」'
		]
	};
}

function scoreAdProfile(profile, options = {}) {
	const whitelistSet = options.whitelist instanceof Set ? options.whitelist : new Set(AD_DOMAIN_WHITELIST_SEED);
	const firstName = String(profile?.firstName ?? profile?.first_name ?? '');
	const lastName = String(profile?.lastName ?? profile?.last_name ?? '');
	const username = String(profile?.username ?? '').replace(/^@/, '');
	const bio = String(profile?.bio ?? '');
	const status = String(profile?.status ?? '');
	const displayName = (firstName + ' ' + lastName).trim();
	const combined = (displayName + '\n' + bio).trim();

	let score = 0;
	const reasons = [];
	const add = (delta, label) => { score += delta; reasons.push((delta >= 0 ? '+' : '') + delta + ' ' + label); };

	if (displayName && AD_SYMMETRIC_EMOJI_RE.test(displayName)) add(3, '名称首尾对称 emoji');
	if (displayName && AD_NUMERIC_PREFIX_RE.test(displayName)) add(1, '名称数字+emoji 前缀');

	// ===== 关键词计分：两类词同现才给分，单类命中一律 0 分 =====
	// 规则与理由见 AD_KEYWORD_COMBO_SCORE。命中仍然全部写进 reasons ——
	// 主人拿 /pending 快照做人工判断时，「命中了什么词但没计分」是最有用的信息，
	// 不计分不等于不记录。
	const tradeHits = countAdKeywordHits(combined, AD_TRADE_VERBS);
	const weakTradeHits = countAdKeywordHits(combined, AD_WEAK_TRADE_VERBS);
	const businessHits = countAdKeywordHits(combined, AD_BUSINESS_KEYWORDS);

	if (tradeHits.length && businessHits.length) {
		add(AD_KEYWORD_COMBO_SCORE, '交易动词 + 业务关键词同现：'
			+ tradeHits.slice(0, 2).join('/') + ' × ' + businessHits.slice(0, 2).join('/'));
	} else {
		if (tradeHits.length) reasons.push('（仅交易动词，单类词不计分：' + tradeHits.slice(0, 3).join('/') + '）');
		if (businessHits.length) reasons.push('（仅业务关键词，单类词不计分：' + businessHits.slice(0, 3).join('/') + '）');
	}
	// 弱动词【永不计分、永不参与同现判定】，只留记录 —— 详见 AD_WEAK_TRADE_VERBS 的误封复盘。
	if (weakTradeHits.length) {
		if (AD_WEAK_TRADE_VERB_SCORE > 0) add(AD_WEAK_TRADE_VERB_SCORE, '弱交易动词：' + weakTradeHits.slice(0, 3).join('/'));
		else reasons.push('（弱交易动词，不计分：' + weakTradeHits.slice(0, 3).join('/') + '）');
	}

	if (hasAdSuspiciousLink(combined, whitelistSet, { businessHit: businessHits.length > 0 })) add(2, '含非白名单引流链接');
	if (username && AD_RANDOM_USERNAME_RE.test(username) && /[0-9]/.test(username)) {
		if (AD_RANDOM_USERNAME_SCORE > 0) add(AD_RANDOM_USERNAME_SCORE, '随机字母数字 username');
		else reasons.push('（随机字母数字 username，不计分：长相不构成广告证据）');
	}
	if (hasAdRepeatedSegment(bio)) add(1, 'Bio 重复段落');
	// 结构判据：机器生成型昵称。两条判据互斥（一条查拉丁全名、一条查非常用书写系统），
	// 命中任一只加一次分，避免同一形态被重复计价。
	if (displayName && isAdGeneratedWesternName(displayName)) {
		add(AD_GENERATED_NAME_SCORE, '昵称为机器生成型西方全名');
	} else if (displayName && isAdRandomExoticName(displayName)) {
		add(AD_GENERATED_NAME_SCORE, '昵称为非常用书写系统短随机串');
	}
	// restricted 只记录、不计分。
	// 语义是「在本群被禁言 / 限权」，而禁言他的往往就是 bot 自己（muteChatMember 走
	// restrictChatMember）—— 拿这个自己造成的状态反过来给用户加分，就是 2026-09
	// 误封正常用户的根因（当时 +5，与弱动词 +2 凑成 7 分恰好撞封禁线）。
	// 预筛门槛取消后（每条消息都拉资料），任何正分都会作用到全群每个
	// 被禁言过的人的每一条消息上，因此彻底降为 0：保留供人工判断的记录，
	// 不参与任何自动定罪。真广告不靠这条认定，删分不影响召回率。
	if (status === 'restricted') {
		if (AD_RESTRICTED_STATUS_SCORE > 0) add(AD_RESTRICTED_STATUS_SCORE, '该用户在本群处于受限状态（可能被管理员禁言）');
		else reasons.push('（本群受限状态，不计分：可能由 bot 自己禁言造成）');
	}

	// ===== 私有群一次性邀请链接（2026-09-09 方案 C）=====
	// 加分判据与豁免剔除【刻意挨着写】：剔除的前提就是「这次确实命中了私有形态」，
	// 拆到两处早晚只改一半 —— 那时会出现「加了 5 分但豁免还照减 3 分」的半吊子状态。
	// 形态分档、分值取 5 的完整推演、以及为什么它不会滚成累积误封，见 AD_PRIVATE_INVITE_SCORE。
	//
	// 【只管资料卡、不管正文】主人这次说的是「资料卡昵称 + 广告简介」。正文里发群链接
	// （「这个群不错 t.me/+xxx」）在正常群聊里远比写进个人简介常见，所以 scoreAdMessageText
	// 一个字都不动 —— 要扩到正文得另开一轮，不在本次授权范围内。
	const privateInvite = hasAdPrivateInviteLink(combined);
	if (privateInvite) add(AD_PRIVATE_INVITE_SCORE, '资料卡含私有群一次性邀请链接（t.me/+ 或 joinchat）');

	let exemptHits = countAdKeywordHits(combined, AD_EXEMPT_KEYWORDS);
	// 私有邀请链接不吃 t.me 豁免 —— 但【只在全文没有公开 telegram 链接时】才剔。
	// 同时写了 t.me/mychannel（公开频道）和 t.me/+xxx（私有群）的人，公开那条仍是正常用法，
	// 豁免照给：这是留给技术群群主的缓冲，宁可放过一个也不误封他。
	//
	// 【已知边界，刻意不补】countAdKeywordHits 命中满 6 个词就 break，而 't.me' 排在
	// AD_EXEMPT_KEYWORDS 的最末尾 —— 简介里塞了 6 个以上技术豁免词时，'t.me' 根本不在
	// hits 里，剔不掉，豁免仍吃满 -3（净 +2，pass）。那种简介（六个代理／TLS 术语 + 私有群链接）
	// 几乎必然是真的技术群群主，放过他正是要的结果，不为此去动 countAdKeywordHits 的上限。
	if (privateInvite && exemptHits.length && !hasAdPublicTelegramLink(combined)) {
		const isTelegramExempt = (word) => AD_TELEGRAM_LINK_EXEMPT_WORDS.has(String(word).toLowerCase());
		const dropped = exemptHits.filter(isTelegramExempt);
		if (dropped.length) {
			exemptHits = exemptHits.filter((word) => !isTelegramExempt(word));
			reasons.push('（私有群邀请链接不吃 ' + dropped.join('/') + ' 豁免：该豁免只保护公开账号链接）');
		}
	}
	if (exemptHits.length) {
		const penalty = tradeHits.length ? AD_EXEMPT_PENALTY_WITH_TRADE : AD_EXEMPT_PENALTY;
		add(penalty, '命中豁免词：' + exemptHits.slice(0, 3).join('/') + (tradeHits.length ? '（含交易动词，减免打折）' : ''));
	}
	// 「无 emoji 且无 Bio」这条减分项建立在【确实查过 bio 且确实为空】之上。
	// 双轨方案里存在「本次没查 bio」的路径（轨一冷却期内、闸一零成本判定），
	// 那时 bio 变量是空字符串，但它的含义是「未知」而不是「为空」——
	// 拿未知当空来减分是拿假前提做判据，会把真广告的分数压下去（实测
	// 「收U秒结」从 +2 被压到 1 分、「【出租账号】」被压到 0 分）。
	// 故未查 bio 时必须显式跳过，由调用方传 skipMissingBioPenalty。
	if (displayName && !AD_HAS_EMOJI_RE.test(displayName) && !bio && !options.skipMissingBioPenalty) add(-1, '名称无 emoji 且无 Bio');

	// 下限 AD_SCORE_FLOOR（-3）而非 0：夹到 0 会让豁免词减分完全失效，详见该常量说明。
	return { score: Math.max(AD_SCORE_FLOOR, score), rawScore: score, reasons, tradeHits, businessHits };
}

// 评分消息正文：入群后首条消息的兜底判定。
function scoreAdMessageText(text, options = {}) {
	const whitelistSet = options.whitelist instanceof Set ? options.whitelist : new Set(AD_DOMAIN_WHITELIST_SEED);
	const source = String(text ?? '').trim();
	if (!source) return { score: 0, rawScore: 0, reasons: [], tradeHits: [], businessHits: [] };

	let score = 0;
	const reasons = [];
	const add = (delta, label) => { score += delta; reasons.push((delta >= 0 ? '+' : '') + delta + ' ' + label); };

	// 关键词计分口径与 scoreAdProfile 完全一致：两类词同现才给分，单类命中只记录。
	const tradeHits = countAdKeywordHits(source, AD_TRADE_VERBS);
	const weakTradeHits = countAdKeywordHits(source, AD_WEAK_TRADE_VERBS);
	const businessHits = countAdKeywordHits(source, AD_BUSINESS_KEYWORDS);

	if (tradeHits.length && businessHits.length) {
		add(AD_KEYWORD_COMBO_SCORE, '正文交易动词 + 业务关键词同现：'
			+ tradeHits.slice(0, 2).join('/') + ' × ' + businessHits.slice(0, 2).join('/'));
	} else {
		if (tradeHits.length) reasons.push('（正文仅交易动词，单类词不计分：' + tradeHits.slice(0, 3).join('/') + '）');
		if (businessHits.length) reasons.push('（正文仅业务关键词，单类词不计分：' + businessHits.slice(0, 3).join('/') + '）');
	}
	if (weakTradeHits.length) {
		if (AD_WEAK_TRADE_VERB_SCORE > 0) add(AD_WEAK_TRADE_VERB_SCORE, '正文弱交易动词：' + weakTradeHits.slice(0, 3).join('/'));
		else reasons.push('（正文弱交易动词，不计分：' + weakTradeHits.slice(0, 3).join('/') + '）');
	}

	if (hasAdSuspiciousLink(source, whitelistSet, { businessHit: businessHits.length > 0 })) add(2, '正文含非白名单引流链接');
	if (AD_SYMMETRIC_EMOJI_RE.test(source)) add(3, '正文首尾对称 emoji');
	if (hasAdRepeatedSegment(source)) add(1, '正文重复段落');

	const exemptHits = countAdKeywordHits(source, AD_EXEMPT_KEYWORDS);
	if (exemptHits.length) {
		const penalty = tradeHits.length ? AD_EXEMPT_PENALTY_WITH_TRADE : AD_EXEMPT_PENALTY;
		add(penalty, '正文命中豁免词：' + exemptHits.slice(0, 3).join('/') + (tradeHits.length ? '（含交易动词，减免打折）' : ''));
	}

	// 与 scoreAdProfile 同一个下限，理由见 AD_SCORE_FLOOR。
	return { score: Math.max(AD_SCORE_FLOOR, score), rawScore: score, reasons, tradeHits, businessHits };
}

// 评分转发来源频道 / 群组。
// 【2026-09-08 起整条判据由 AD_FORWARD_JUDGE_ENABLED 关闭】——
// 主人要求去除频道 / 群组判定，理由是「有的用户喜欢用频道私聊」，误伤面太大。
// 函数本体保留：判据本身描述的形态（广告号转发自家马甲频道）是真的，
// 只是不能再拿它自动定罪。开关打开即恢复原行为，无需改动本函数。
function scoreAdForwardChat(chat) {
	const title = String(chat?.title ?? '').trim();
	const username = String(chat?.username ?? '').replace(/^@/, '');
	if (!title && !username) return { score: 0, reasons: [], isAd: false };
	if (!AD_FORWARD_JUDGE_ENABLED) {
		return { score: 0, reasons: ['（转发来源判定已按主人要求关闭，不计分）'], isAd: false, disabled: true };
	}

	let score = 0;
	const reasons = [];
	const add = (delta, label) => { score += delta; reasons.push('+' + delta + ' ' + label); };

	if (title && AD_SYMMETRIC_EMOJI_RE.test(title)) add(3, '来源频道对称 emoji');
	if (title && AD_NUMERIC_PREFIX_RE.test(title)) add(1, '来源频道数字前缀');
	const businessHits = countAdKeywordHits(title + '\n' + username, AD_BUSINESS_KEYWORDS);
	if (businessHits.length) add(3, '来源频道业务词：' + businessHits.slice(0, 3).join('/'));
	const tradeHits = countAdKeywordHits(title + '\n' + username, AD_TRADE_VERBS);
	if (tradeHits.length) add(2, '来源频道交易动词：' + tradeHits.slice(0, 3).join('/'));
	// 随机字母串频道名：线上那批广告全部转发自 bxbd / hjff 这类 4~6 位纯小写字母频道，
	// 上面四条判据一条都不命中（实测 score=0 isAd=false），最强的信号反而被完全放过。
	// 这类名字是批量注册的马甲频道特征：没有元音结构、不成词、长度极短。
	// 权重给到 AD_RANDOM_CHANNEL_SCORE（4）= isAd 门槛：此前给 2 分达不到门槛，
	// 而 evaluateAdSuspect 只在 isAd 为真时才累加来源分，等于这 2 分永远是废分。
	// 判据本身足够严（4~6 位纯小写字母且零元音），正常频道极难命中，可以单独定来源。
	if (isAdRandomChannelName(title) || isAdRandomChannelName(username)) {
		add(AD_RANDOM_CHANNEL_SCORE, '来源频道名为随机字母串');
	}

	return { score, reasons, isAd: score >= 4 };
}

// 是否像批量注册的马甲频道名：3~6 位纯小写英文字母、且元音占比过低（不成词）。
// 正常频道极少用这种名字；广告团伙为规避封禁会大量注册 bxbd / hjff 这类无意义短名。
// 判据刻意保守：含数字、下划线、大写、中文、长度 >6 的一律不算，避免误伤缩写型正常频道
// （如 cfnews、v2ex 含数字或长度超限，bbc / cnn 含元音或长度不足 4 时同样放过）。
function isAdRandomChannelName(value) {
	const name = String(value ?? '').trim();
	if (!/^[a-z]{3,6}$/.test(name)) return false;
	const vowels = (name.match(/[aeiou]/g) || []).length;
	// 4 位以上且完全无元音（bxbd、hjff）→ 判随机串；
	// 3 位太容易撞正常缩写（abc、xyz、bbc），一律放过。
	return name.length >= 4 && vowels === 0;
}

// 是否像 Faker / 批量生成器造出来的西方全名。
// 线上截图那批号：`Savanah Wuckert Jr.`、`Marilou Emard`、`Mr. Amos Batz` ——
// 特征是「纯拉丁字母的两三段式姓名 + 每段首字母大写 + 常带 Jr./Sr./Mr. 等称谓」，
// 完全不含中文、emoji、数字、下划线。这是 faker 类库的默认输出形态。
//
// 真实外国用户也可能叫 `John Smith`，所以本判据只给 AD_GENERATED_NAME_SCORE（+2），
// 单独绝不足以定罪，必须与其它信号叠加才可能过线。
function isAdGeneratedWesternName(value) {
	const name = String(value ?? '').trim();
	if (!name || name.length > 40) return false;
	// 含中日文 / 数字 / 下划线的一律不算：那些形态走别的判据。
	if (/[一-龥぀-ヿ0-9_]/.test(name)) return false;
	if (AD_HAS_EMOJI_RE.test(name)) return false;
	const parts = name.split(/\s+/).filter(Boolean);
	if (parts.length < 2 || parts.length > 4) return false;
	// 每段必须是「大写开头 + 纯小写字母」，或带尾点的称谓（Jr. / Sr. / Mr. / Mrs. / Dr.）。
	const honorific = /^(?:Jr|Sr|Mr|Mrs|Ms|Dr|Prof|II|III|IV)\.?$/;
	let wordCount = 0;
	for (const part of parts) {
		if (honorific.test(part)) continue;
		if (!/^[A-Z][a-z]{1,15}$/.test(part)) return false;
		wordCount += 1;
	}
	return wordCount >= 2;
}

// 是否为「非常用书写系统的短随机昵称」。
// 线上截图：天城文 3 字昵称 —— 批量注册器随机取码位拼出来的，不成词、极短。
// 只覆盖几个明确的非拉丁非中日文区段，且长度 <= 6、不含空格，
// 避免误伤真实的印地语 / 孟加拉语用户（他们的名字通常更长且带空格分段）。
// 同样只给 AD_GENERATED_NAME_SCORE（+2），单独不定罪。
function isAdRandomExoticName(value) {
	const name = String(value ?? '').trim();
	if (!name || name.length > 6) return false;
	if (/\s/.test(name)) return false;			// 带空格的多段名不算，真实用户更可能这样
	// 天城文 / 孟加拉文 / 泰米尔文 / 泰卢固文 / 古加拉特文 / 埃塞俄比亚文 / 高棉文 / 缅甸文
	return /^[ऀ-ॿঀ-৿஀-௿ఀ-౿઀-૿ሀ-፿ក-៿က-႟]+$/.test(name);
}

// 是否为「极短正文」。线上那批号的正文全是单个字母（v / z / n / x / c / f / k），
// 广告词本体在转发体里，顶层 text 只是个占位符 —— 这是最稳定的投放模式特征。
// 阈值取 AD_MINIMAL_TEXT_MAX_LENGTH（4）：这批号把正文改成 `vvv`、`abcd` 的变异成本极低，
// 留出余量。正常人也会发「顶」「+1」「收到」，所以本判据【必须与转发来源叠加】才计分，
// 见 scoreAdMessageContext。
function isAdMinimalText(text) {
	const value = String(text ?? '').replace(/\s+/g, '');
	return value.length > 0 && value.length <= AD_MINIMAL_TEXT_MAX_LENGTH;
}

// 上下文判据：正文与转发来源【组合】起来才成立的信号，单看任何一边都不够。
// 目前只有一条：极短正文 + 转发来源同现 -> AD_MINIMAL_TEXT_FORWARD_SCORE（+4）。
//
// 为什么必须组合：只发一个字母不算广告（可能是「顶」「1」），只转发频道也不算广告
// （技术群天天转发文章）。但「转发一个频道 + 自己只回一个字母」这个组合，
// 正常人几乎不会做 —— 它是自动化投放脚本的产物：脚本转发广告频道消息，
// 再随机附一个字母绕过「纯转发」类过滤。
//
// 必须与 detectAdOnMessage 的零成本预筛用同一个函数，否则预筛把消息挡在门外，
// 这条判据在 evaluateAdSuspect 里永远跑不到。
function scoreAdMessageContext(text, forwardChat) {
	const reasons = [];
	let score = 0;
	// 本判据的构成要素之一就是「有转发来源」，属于被主人关闭的频道 / 群组维度，
	// 故随 AD_FORWARD_JUDGE_ENABLED 一并停用。见该常量说明。
	if (!AD_FORWARD_JUDGE_ENABLED) return { score: 0, reasons: [], disabled: true };
	const hasForward = Boolean(forwardChat && (forwardChat.title || forwardChat.username));
	if (hasForward && isAdMinimalText(text)) {
		score += AD_MINIMAL_TEXT_FORWARD_SCORE;
		reasons.push('+' + AD_MINIMAL_TEXT_FORWARD_SCORE + ' 转发来源 + 正文仅 '
			+ String(text ?? '').replace(/\s+/g, '').length + ' 字（自动投放特征）');
	}
	return { score, reasons };
}

// === 第二层：D1 指纹库 ===
// 测试沙箱不注入 crypto，所以哈希必须是纯 JS。这里用双 32 位 FNV-1a 变体拼成 64 位十六进制，
// 只做去重键用途，不承担任何安全属性。
function adTextHash(text) {
	const source = String(text ?? '');
	let h1 = 0x811c9dc5;
	let h2 = 0x01000193;
	for (let i = 0; i < source.length; i++) {
		const c = source.charCodeAt(i);
		h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
		h2 = (Math.imul(h2 ^ c, 0x85ebca6b) + i + 1) >>> 0;
	}
	return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

// 指纹值归一化：折叠空白、去零宽字符、小写化，让 `高价 收 号` 与 `高价收号` 命中同一条。
function normalizeAdFingerprintValue(value) {
	return String(value ?? '')
		.replace(/[\u200B-\u200D\uFEFF]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase()
		.slice(0, 200);
}

// \u3010\u5355\u4E1A\u52A1\u8BCD\u6307\u7EB9\u5224\u5B9A\uFF082026-09-09 \u4E3B\u4EBA\u4E0B\u4EE4\uFF0CP1 \u5355\u8BCD\u4E0D\u5C01\uFF09\u3011
// \u5224\u5B9A\u6807\u51C6\uFF1Anormalized \u6070\u7B49\u4E8E AD_BUSINESS_KEYWORDS \u4E2D\u67D0\u4E00\u4E2A\u8BCD\u7684\u5F52\u4E00\u5316\u7ED3\u679C\u3002
// \u4F8B\uFF1A\u6307\u7EB9 value='usdt' / '\u4EF7\u683C\u8868' / '\u4EE3\u7EC3' \u2014\u2014 \u8FD9\u7C7B\u8BCD\u5355\u4E2A\u51FA\u73B0\u65E0\u6CD5\u533A\u5206\u6B63\u5E38\u804A\u5929\u4E0E\u5E7F\u544A
// \uFF08\u6B63\u5E38\u7528\u6237\u4E5F\u4F1A\u8BF4\u300CUSDT \u4ECA\u5929\u4EF7\u683C\u4E0D\u9519\u300D\u300C\u4EE3\u7EC3\u4E0A\u5206\u300D\uFF09\uFF0C\u547D\u4E2D\u53EA\u8BA1\u5206\u3001\u4E0D\u6784\u6210\u5C01\u7981\u3002
// \u5FC5\u987B\u5728\u300C\u62DB\u63FD\u52A8\u8BCD \u2227 \u4E1A\u52A1\u8BCD\u300D\u7EC4\u5408\uFF08\u7ED3\u6784\u901A\u9053\uFF09\u6216\u4F5C\u4E3A\u5B8C\u6574\u77ED\u8BED\u4E00\u90E8\u5206\u65F6\u624D\u5B9A\u7F6A\u3002
// \u5B8C\u6574\u77ED\u8BED / \u79CD\u5B50\u6307\u7EB9\uFF08\u5982\u300C\u4E13\u4E1A\u5316\u6536\u8D2D\u6E38\u620F\u53F7\u300D\u300C\u79D2\u7ED3\u4E0D\u62D6\u6B20\u300D\uFF09\u4E0D\u7B49\u4E8E\u4EFB\u4F55\u5355\u4E2A\u4E1A\u52A1\u8BCD\uFF0C
// singleWord=false\uFF0C\u4FDD\u6301\u539F\u5C01\u7981\u529B\uFF0C\u4E0D\u53D7\u672C\u89C4\u5219\u5F71\u54CD\u3002
//
// \u7F13\u5B58\u4E00\u6B21\u6784\u5EFA\uFF1A\u8BCD\u8868\u56FA\u5B9A\uFF0C\u65E0\u9700\u6BCF\u6B21\u8C03\u7528\u91CD\u5EFA\u3002\u653E\u6A21\u5757\u7EA7\u95ED\u5305\uFF0CnormalizeAdFingerprintValue
// \u5728\u51FD\u6570\u8FD0\u884C\u671F\u5DF2\u5B9A\u4E49\uFF08\u6B64\u5904\u53EA\u5728\u51FD\u6570\u5185\u90E8\u8C03\u7528\uFF0C\u4E0D\u4F9D\u8D56\u6A21\u5757\u521D\u59CB\u5316\u987A\u5E8F\uFF09\u3002
let _singleBusinessWordSet = null;
function isSingleBusinessWordFingerprint(normalized) {
	if (!normalized) return false;
	if (!_singleBusinessWordSet) {
		_singleBusinessWordSet = new Set(
			AD_BUSINESS_KEYWORDS.map((w) => normalizeAdFingerprintValue(w)).filter(Boolean)
		);
	}
	return _singleBusinessWordSet.has(normalized);
}

function adFingerprintKey(type, value) {
	return adTextHash(String(type || 'keyword') + ':' + normalizeAdFingerprintValue(value));
}

function computeAdFingerprintConfidence(matchCount, falsePositiveCount) {
	const hits = Math.max(0, Number(matchCount) || 0);
	const misses = Math.max(0, Number(falsePositiveCount) || 0);
	if (hits + misses === 0) return 1;
	return hits / (hits + misses);
}

// 读取全部指纹（60 秒缓存）。条数上限 500，防止指纹库被刷爆后每条消息都全表扫描。
async function loadAdFingerprints(env) {
	if (!env?.DB) return [];
	try {
		const value = await loadAdCachedValue(AD_FINGERPRINT_CACHE, env.DB, AD_FINGERPRINT_CACHE_TTL_MS, async () => {
			if (!(await adDetectionReady(env))) return [];
			const { results } = await env.DB.prepare(
				'SELECT fingerprint, type, value, weight, match_count, false_positive_count, confidence, source FROM ad_fingerprints ORDER BY confidence DESC, match_count DESC LIMIT 500'
			).all();
			return (results || []).map((row) => ({
				fingerprint: String(row.fingerprint || ''),
				type: String(row.type || 'keyword'),
				value: String(row.value || ''),
				normalized: normalizeAdFingerprintValue(row.value),
				weight: Number(row.weight) || 1,
				matchCount: Number(row.match_count) || 0,
				falsePositiveCount: Number(row.false_positive_count) || 0,
				confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 1,
				source: String(row.source || ''),
				// 【P1 单词不封】归一化后恰等于单个业务关键词的指纹标记为单业务词，
				// 命中只计分、不单独构成封禁（见 evaluateAdSuspect 的 fingerprintBan）。
				singleWord: isSingleBusinessWordFingerprint(normalizeAdFingerprintValue(row.value))
			})).filter((row) => row.normalized);
		});
		return Array.isArray(value) ? value : [];
	} catch (error) {
		console.error('[广告检测] 读取指纹库失败:', error);
		return [];
	}
}

// 指纹匹配。domain 型走白名单同源判定，其余型做子串包含。
// 命中后异步累加 match_count，不阻塞判定链路。
async function matchAdFingerprints(env, payload, options = {}) {
	const config = options.config || loadAdDetectionConfig(env);
	const fingerprints = await loadAdFingerprints(env);
	if (!fingerprints.length) return { score: 0, hits: [], maxWeight: 0, nonSingleMaxWeight: 0 };

	// 【方案 A】haystack 去掉 payload.username —— 资料卡只看昵称 + 简介 + 正文。
	// 用户名不参与任何指纹匹配，从匹配端也断掉这一维度。
	const haystack = normalizeAdFingerprintValue([
		payload?.name, payload?.bio, payload?.text
	].filter(Boolean).join(' '));
	const domains = new Set((payload?.domains || []).map((d) => normalizeAdDomain(d)).filter(Boolean));

	const hits = [];
	let maxWeight = 0;
	let nonSingleMaxWeight = 0; // 非单业务词命中的最大权重 —— P1：只有它才能构成指纹级封禁
	for (const row of fingerprints) {
		if (row.confidence < config.fingerprintMinConfidence) continue;
		// username 型指纹只比对账号自身 handle，不扫 haystack（昵称/简介/正文）。
		// 广告号自己命中 → 封；正常人文字里艾特广告号 → 不命中、不误封。
		if (row.type === 'username') {
			const selfHandle = normalizeAdFingerprintValue('@' + (payload?.username || ''));
			if (selfHandle.length <= 1 || selfHandle !== row.normalized) continue;
			hits.push(row);
			if (row.weight > maxWeight) maxWeight = row.weight;
			if (!row.singleWord && row.weight > nonSingleMaxWeight) nonSingleMaxWeight = row.weight;
			if (hits.length >= 8) break;
			continue;
		}
		let matched = false;
		if (row.type === 'domain') {
			for (const domain of domains) {
				if (domain === row.normalized || domain.endsWith('.' + row.normalized)) { matched = true; break; }
			}
		} else {
			matched = haystack.includes(row.normalized);
		}
		if (!matched) continue;
		hits.push(row);
		if (row.weight > maxWeight) maxWeight = row.weight;
		// 单业务词命中（如 value='usdt'、'价格表'）只计分，不参与封禁权重判定。
		if (!row.singleWord && row.weight > nonSingleMaxWeight) nonSingleMaxWeight = row.weight;
		if (hits.length >= 8) break;
	}
	if (!hits.length) return { score: 0, hits: [], maxWeight: 0, nonSingleMaxWeight: 0 };

	try {
		const now = Math.floor(Date.now() / 1000);
		await env.DB.batch(hits.map((row) => env.DB
			.prepare('UPDATE ad_fingerprints SET match_count = match_count + 1, confidence = CAST(match_count + 1 AS REAL) / (match_count + 1 + false_positive_count), updated_at = ? WHERE fingerprint = ?')
			.bind(now, row.fingerprint)));
		AD_FINGERPRINT_CACHE.delete(env.DB);
	} catch (error) {
		console.error('[广告检测] 指纹命中计数失败:', error);
	}
	return { score: AD_FINGERPRINT_HIT_SCORE * Math.min(2, hits.length), hits, maxWeight, nonSingleMaxWeight };
}

// 从判定载荷里抽取可入库的指纹候选。
// 只抽「结构上稳定」的片段：带对称 emoji 的整名、交易动词短语、非白名单域名、被提及的引流账号。
function extractAdFingerprintCandidates(payload, whitelistSet) {
	const candidates = [];
	// 按 type 分配配额，而不是先到先得抢同一个 12 条池子。
	// 起因：长简介广告号（如「长期收购…老账号优先加价…进群联系 @x 或 evil-shop.top」）
	// 会在交易动词 / 业务词周边截出十几条 keyword 短语，把配额吃干，
	// 排在后面抽取的 domain 与 username 一条都进不去 —— 而这两类恰恰是最稳定的强指纹
	//（权重 1 / 0.8，单条即可定罪；广告团伙换名换简介，但域名和 @handle 常年复用）。
	// keyword 数量最多、单条最弱（24 字截断短语），理应让位。
	// 原注释「放在提及扫描之前入库，避免被文本里的引流账号把上限占满」防的是
	// username 内部互相挤占，没防到 keyword 跨类挤占，这里一并解决。
	// username 配额恢复为 2：只学账号自身 handle，@提及扫描路径保持删除（#143 根因，永不恢复）。
	const AD_FINGERPRINT_QUOTA = { keyword: 6, bio: 1, domain: 3, username: 2 };
	const push = (type, value, weight) => {
		const normalized = normalizeAdFingerprintValue(value);
		if (!normalized || normalized.length < 2) return;
		// 【权限人 username 永不学习】放在 push 最前面，覆盖【全部类型、全部抽取路径】
		// —— keyword 短语、整段正文兜底、bio、domain 一个都不漏。
		// 拦在这里而不是拦在 learnAdFingerprints：那里只对 source='auto' 生效，
		// 而 /spam 人工提交（source='spam'）恰恰是绕过豁免词闸门的那条路，必须一并堵住。
		// 原值与归一化值都查一遍：归一化可能改写大小写或剥符号，两边都比对才不留缝。
		if (containsAdProtectedUsername(value) || containsAdProtectedUsername(normalized)) return;
		// 同 type 同值去重：【取较高权重】而不是丢弃后来者。
		// 【2026-09-10 修正】原实现直接 return，配合 keyword 短语降权(1→0.5)后出了个新缺陷：
		// 短语路径截 24 字，短正文（≤24 字）会截出与「整段正文兜底」完全相同的串，
		// 而短语先跑一步以 0.5 占位 → 后面权重 1 的整段兜底被静默丢弃。
		// 净效果是「同一段广告文案第二次出现即秒杀」这条能力被降权连带废掉
		// —— 整段兜底是归一化后精确相等才命中、误伤面极小，恰恰是最该保住权重 1 的一条。
		// 取 max 后：短正文拿回权重 1（精确匹配定罪），长正文的短语片段仍是 0.5（只计分）。
		const dup = candidates.find((c) => c.type === type && normalizeAdFingerprintValue(c.value) === normalized);
		if (dup) {
			if (Number(weight) > Number(dup.weight)) dup.weight = Number(weight);
			return;
		}
		// 未列入配额表的 type 不设限（当前 AD_FINGERPRINT_TYPES 四类已全覆盖，
		// 此处为将来新增 type 时的安全默认：宁可放进去，不要静默丢弃）。
		const quota = AD_FINGERPRINT_QUOTA[type];
		if (quota != null && candidates.filter((c) => c.type === type).length >= quota) return;
		candidates.push({ type, value: String(value).slice(0, 200), weight });
	};

	const name = String(payload?.name ?? '').trim();
	if (name && (AD_SYMMETRIC_EMOJI_RE.test(name) || AD_NUMERIC_PREFIX_RE.test(name))) push('keyword', name, 1);

	// 正文是斜杠命令时整体剔除，不参与任何抽取（短语截取、域名扫描都吃 combined）。
	// 与下面「整段正文兜底」那道过滤同源：命令文本是操作指令而非广告内容，
	// 只挡整段兜底不挡短语路径的话，`/ban 收购账号 联系我` 仍会截出 24 字片段入库。
	const rawText = String(payload?.text ?? '').trim();
	const textForLearning = isTelegramSlashCommand(rawText) ? '' : payload?.text;
	const combined = [payload?.name, payload?.bio, textForLearning].filter(Boolean).join('\n');
	// 交易动词与业务关键词【两类】周边都截短语。
	// 此前只截交易动词周边，于是「操逼赚钱，招探花9000一单，提供设备」这种一个交易动词都不命中的
	// 正文抽不出任何候选，learnAdFingerprints 直接返回 no_candidate —— 线上表现为「指纹 +0」，
	// 连 /spam 人工提交也救不回来，同款文案会无限次重放。
	for (const word of [
		...countAdKeywordHits(combined, AD_TRADE_VERBS),
		...countAdKeywordHits(combined, AD_BUSINESS_KEYWORDS)
	]) {
		const index = combined.toLowerCase().indexOf(String(word).toLowerCase());
		if (index === -1) continue;
		const phrase = combined.slice(index, index + 24).split(/[\n\r]/)[0].trim();
		// 【2026-09-10 权重 1 → 0.5】按词截取的 24 字短语是【机器切出来的片段】，
		// 起点由词表命中位置决定、终点是硬截断，语义完整性没有任何保证。
		// 线上 #69 学出 `[keyword] 月入怀来` 就是这么来的 —— 「月入」命中业务词，
		// 往后截 24 字碰上「怀来」（河北县名），拼成一条既非广告、又会命中
		// 任何提到该地名的正常发言的指纹。权重 1 让它【单条即定罪】。
		// 降到 0.5（< AD_FINGERPRINT_BAN_WEIGHT 0.8）后这类片段只计分不定罪，
		// 真广告仍可由「整段正文精确匹配」（下面那条，权重保持 1）秒杀，
		// 或由结构查杀「招揽 ∧ 行业」合取兜住 —— 召回没丢，误伤面砍掉。
		if (phrase.length >= 4) push('keyword', phrase, 0.5);
	}

	// 兜底：正文足够长时把整段（截 60 字）作为一条 keyword 指纹。
	// 前面按词截取的短语依赖词表命中，词表永远追不上新话术；整段正文是精确匹配
	// （normalizeAdFingerprintValue 归一化后完全相等才算命中），只会命中复制同一文案的号，
	// 误伤面极小，但能让「同一段广告文案第二次出现即被秒杀」成立。
	// 长度下限 12 是为了避开「有需要私聊」这类过短的通用句式。
	// 【2026-09-11 斜杠命令永不入库】线上事故：管理员发 /ban 1919451354 封人，
	// 而 bot 在该群没有管理员权限、删不掉命令消息（deleteAuthorizedGroupCommandMessage 报
	// message can't be deleted），命令文本于是留在群里被当成普通发言走完广告检测，
	// 事后 /ignore 回滚时看到学入的指纹正是 [keyword] /ban 1919451354。
	// 这条指纹权重 1（>= AD_FINGERPRINT_BAN_WEIGHT 0.8），单条命中即定罪、绕过总分与豁免词，
	// 构成一个自噬循环：管理员用 /ban 封人 → 命令文本入库 → 下次任何人（含管理员自己）
	// 发相同命令即被秒封全群。命令文本是操作指令、不是广告内容，任何路径都不该学。
	const text = String(payload?.text ?? '').trim().replace(/\s+/g, ' ');
	if (text.length >= 12 && !isTelegramSlashCommand(text)) push('keyword', text.slice(0, 60), 1);

	const bio = String(payload?.bio ?? '').trim();
	if (bio.length >= 6) push('bio', bio.slice(0, 60), 0.8);

	for (const domain of extractAdDomains(combined)) {
		// 平台自身域名绝不学习：t.me 之类一旦入库，任何人分享 Telegram 链接都会命中，
		// 且它权重给满 1（单条即可定罪）。这道判断独立于用户白名单，不可被误删绕过。
		if (isAdPlatformDomain(domain)) continue;
		if (!isAdDomainWhitelisted(domain, whitelistSet)) push('domain', domain, 1);
	}

	// 账号自身 handle 学习：只学 payload.username，不扫正文 @提及（那是 #143 根因，永不恢复）。
	// matchAdFingerprints 侧只比对 payload.username 字段，正文里艾特同一 handle 不会命中，
	// 解决「正常人艾特广告号/管理员被误封」问题，同时保留广告号自身 handle 的召回。
	// Telegram handle 规则：5-32 字符、只含 [a-zA-Z0-9_]，不符合的不是合法账号名，跳过。
	const selfUsername = String(payload?.username ?? '').replace(/^@+/, '').trim();
	if (selfUsername.length >= 5 && /^[a-zA-Z0-9_]+$/.test(selfUsername)) {
		push('username', '@' + selfUsername, 0.8);
	}

	// 配额之和恰为 12，slice 只是防御性兜底。
	return candidates.slice(0, 12);
}

// 自动学习指纹。
//
// 【2026-09-08 拆掉「必须含强交易动词」闸门】主人定的口径：
// 「已经确定并执行封禁的是自动学习指纹广告类型特征的，除非说误判了，我就可以通过指定的
//   指令执行全群解封并给指纹记误报 + 删除记录的指纹。」
//
// 原实现在 source='auto' 时要求载荷含 AD_TRADE_VERBS 里的强动词，否则直接返回
// reason: 'no_trade_verb' 一条也不学。这道闸门造成一个逻辑死结：
//   · source='auto' 的唯一调用点是 enforceAdDetection，而那里【只在已定罪时才调用】；
//   · 第三层 AI 定罪时 structure.guilty 为 false，闸门生效；
//   · 可 AI 层的价值恰恰在于抓词表外的新变体 —— 新变体几乎必然不含词表里的强动词。
// 净效果是「AI 越有用，指纹库学到的越少」，与主人「AI 通过 spam 自我学习、
// 学到的特征沉淀成指纹」的设计完全相反。
//
// 拆掉闸门后仍有三层纠错兜底，不是无脑放开：
//   1) 下面的豁免词闸门仍然只对 source='auto' 生效，坑词（「代理 官方中文」那类）进不来；
//   2) 学进来的是 source='auto'，受 markAdFingerprintFalsePositive 的误报退役机制约束
//      —— manual 才享有退役豁免；
//   3) /ignore 一次即删该号带来的全部指纹（同批改动的项 4）。
// 手动来源（/addword、/spam、/unban 回滚）本来就不走这段逻辑。
async function learnAdFingerprints(env, payload, options = {}) {
	if (!(await adDetectionReady(env))) return { ok: false, learned: 0, reason: 'unavailable' };
	const source = String(options.source || 'auto');
	const whitelistSet = options.whitelist instanceof Set ? options.whitelist : await loadAdDomainWhitelist(env);

	const candidates = extractAdFingerprintCandidates(payload, whitelistSet);
	if (!candidates.length) return { ok: true, learned: 0, reason: 'no_candidate' };

	// ===== 豁免词闸门（2026-09-08 新增）=====
	// 线上自动学习学出了 `[keyword] 代理 官方中文` 这条坑词。指纹层是【命中即封】、
	// 不走豁免词减分，所以把词加进 AD_EXEMPT_KEYWORDS 治不了它 —— 唯一的治法是
	// 一开始就不许学进去，否则 /delword 删掉之后下一次自动学习又会原样学回来。
	//
	// 闸门刻意开得很窄，三重限制，为的是不伤召回（主人的硬要求：不要放过任何一个真广告）：
	//   1) 只作用于 source='auto' —— /spam、/addword、/unban 回滚这些【人工判定】路径一律不拦，
	//      主人说过「全部交给有权限的人来判定」，人工确认的东西不该被自动规则否决；
	//   2) 只作用于 keyword 类候选 —— bio / domain / username 三类是最稳定的强指纹，
	//      线上命中最多的那条 `[bio] https://t.me/... 加群看项目 一天赚8千!` 正是 bio 类，
	//      而 t.me 现已是豁免词，若一并过滤等于把最有效的指纹废掉；
	//   3) 短语里只要同时含强交易动词或业务关键词就放行 —— 那是「真广告夹带技术术语」，
	//      不是坑词（例：「收购 vless 账号」含豁免词 vless，但必须学）。
	const isExemptOnlyKeyword = (c) => {
		if (c.type !== 'keyword') return false;
		const value = String(c.value || '');
		if (!countAdKeywordHits(value, AD_EXEMPT_KEYWORDS).length) return false;
		if (countAdKeywordHits(value, AD_TRADE_VERBS).length) return false;
		if (countAdKeywordHits(value, AD_BUSINESS_KEYWORDS).length) return false;
		return true;
	};
	const learnable = source === 'auto' ? candidates.filter((c) => !isExemptOnlyKeyword(c)) : candidates;
	if (!learnable.length) return { ok: true, learned: 0, reason: 'exempt_only' };

	try {
		const now = Math.floor(Date.now() / 1000);
		const statements = learnable.map((c) => env.DB.prepare(
			'INSERT INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_by, created_at, updated_at) '
			+ 'VALUES (?, ?, ?, ?, 0, 0, 1, ?, ?, ?, ?) ON CONFLICT(fingerprint) DO UPDATE SET '
			+ 'match_count = match_count + 1, updated_at = excluded.updated_at, '
			+ 'confidence = CAST(match_count + 1 AS REAL) / (match_count + 1 + false_positive_count), '
			// 只提权不降权：/spam 以 manual 再学一遍，已 auto 入库的指纹才能真正拿到
			// 退役豁免（markAdFingerprintFalsePositive 默认档的 DELETE 带 source != 'manual'；
			// /ignore 的即删档不认这道豁免，那是主人明确表态的误判，见该函数说明）；
			// 反向的 auto 覆盖 manual 必须禁止，否则主人手工确认的指纹会被自动学习悄悄降级。
			+ "source = CASE WHEN excluded.source = 'manual' THEN 'manual' ELSE source END"
		).bind(
			adFingerprintKey(c.type, c.value), c.type, c.value, c.weight,
			source, String(options.createdBy ?? ''), now, now
		));
		await env.DB.batch(statements);
		AD_FINGERPRINT_CACHE.delete(env.DB);
		return { ok: true, learned: learnable.length, candidates: learnable };
	} catch (error) {
		console.error('[广告检测] 学习指纹失败:', error);
		return { ok: false, learned: 0, reason: 'error' };
	}
}

// /addword 底层：手动加一条指纹。type 缺省按值形态推断。
async function addAdFingerprint(env, rawValue, options = {}) {
	const value = String(rawValue ?? '').trim();
	if (value.length < 2) return { ok: false, reason: 'too_short' };
	if (!(await adDetectionReady(env))) return { ok: false, reason: 'unavailable' };

	let type = String(options.type || '').trim().toLowerCase();
	if (!AD_FINGERPRINT_TYPES.includes(type)) {
		// 【方案 A】以 @ 开头不再推断为 username 型 —— username 维度已整体下线，
		// 推断出来也不会被 matchAdFingerprints 匹配，等于静默写入一条死数据。
		// 落到 keyword：@handle 作为普通子串参与昵称/简介/正文匹配，
		// 权重由下面统一给 1，仍能定罪，但主人是显式手工添加、心里有数。
		if (normalizeAdDomain(value)) type = 'domain';
		else type = 'keyword';
	}
	const storedValue = type === 'domain' ? normalizeAdDomain(value) : value.slice(0, 200);
	if (!storedValue) return { ok: false, reason: 'invalid' };

	try {
		const now = Math.floor(Date.now() / 1000);
		const fingerprint = adFingerprintKey(type, storedValue);
		const existing = await env.DB.prepare('SELECT fingerprint FROM ad_fingerprints WHERE fingerprint = ?').bind(fingerprint).first();
		await env.DB.prepare(
			'INSERT INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_by, created_at, updated_at) '
			+ 'VALUES (?, ?, ?, ?, 0, 0, 1, ?, ?, ?, ?) ON CONFLICT(fingerprint) DO UPDATE SET '
			+ 'weight = excluded.weight, false_positive_count = 0, confidence = 1, source = excluded.source, updated_at = excluded.updated_at'
		).bind(fingerprint, type, storedValue, 1, 'manual', String(options.createdBy ?? ''), now, now).run();
		AD_FINGERPRINT_CACHE.delete(env.DB);
		return { ok: true, type, value: storedValue, existed: Boolean(existing) };
	} catch (error) {
		console.error('[广告检测] 添加指纹失败:', error);
		return { ok: false, reason: 'error' };
	}
}

// /delword 底层：按原文或归一化值删除，跨 type 一并清掉。
async function removeAdFingerprint(env, rawValue) {
	const value = String(rawValue ?? '').trim();
	if (!value) return { ok: false, reason: 'invalid' };
	if (!(await adDetectionReady(env))) return { ok: false, reason: 'unavailable' };
	try {
		const normalized = normalizeAdFingerprintValue(value);
		const result = await env.DB
			.prepare('DELETE FROM ad_fingerprints WHERE value = ? OR LOWER(TRIM(value)) = ?')
			.bind(value.slice(0, 200), normalized).run();
		AD_FINGERPRINT_CACHE.delete(env.DB);
		return { ok: true, removed: Number(result?.meta?.changes || 0) };
	} catch (error) {
		console.error('[广告检测] 删除指纹失败:', error);
		return { ok: false, reason: 'error' };
	}
}

// /delword 的批量筛选口径（2026-09-08 新增）。
//
// 主人的原话：「我觉得指令可以支持批量删除，可以通过现有的指令库来执行批量删除号。」
// 线上的实际需求来自 /words 三页 58 条的现状：大量 `[username] @xxx` 单账号指纹命中 0 次
// —— 换个号就失效，纯占位噪声，一条条 /delword 打 40 多次不现实。
//
// 刻意只给「按元数据删」这两种，不做按值模糊匹配：
//   · noise —— 命中 0 次的，也就是学进来之后从没再抓到过谁的；
//   · type:username / type:keyword / type:domain / type:bio —— 整类清掉。
// 模糊匹配（比如 /delword *赚钱*）看着方便，但一个手滑的通配符能把高命中的核心指纹
// 连带删掉，而指纹库没有回收站。要删特定值就老老实实单条删。
//
// 【一律排除 source='seed'】那些是主人亲手定的中心特征，补灌判空条件是「数 source='seed'
// 的条数」（seedAdDetectionData）—— 只要库里还剩一条种子，被删掉的那条重新部署也不会补回来，
// 一次批量操作就能永久削掉中心特征。要删种子请用 /delword <原值> 单条删。
function buildAdFingerprintBulkFilter(rawArg) {
	const arg = String(rawArg ?? '').trim();
	const lower = arg.toLowerCase();
	if (lower === 'noise' || arg === '噪声' || arg === '噪音') {
		return {
			ok: true,
			key: 'noise',
			label: '命中 0 次的噪声指纹',
			where: "match_count = 0 AND COALESCE(source, '') != 'seed'",
			binds: []
		};
	}
	const typeMatch = arg.match(/^type[:：]\s*([A-Za-z_]{1,20})$/i);
	if (typeMatch) {
		const type = typeMatch[1].toLowerCase();
		if (!AD_FINGERPRINT_TYPES.includes(type)) return { ok: false, reason: 'bad_type', type };
		return {
			ok: true,
			key: 'type:' + type,
			label: '类型为 ' + type + ' 的指纹',
			where: "type = ? AND COALESCE(source, '') != 'seed'",
			binds: [type]
		};
	}
	// 不是批量写法 → 交回给「按值删单条」的原路径，行为一个字都没变。
	return null;
}

// 批量删除前的预览：数出条数并取样几条给主人过目。
// 破坏性操作必须先让主人看见【将要删什么】，再签令牌 —— 只报个数字他无从判断。
async function previewAdFingerprintBulkDelete(env, filter) {
	if (!(await adDetectionReady(env))) return { ok: false, reason: 'unavailable' };
	try {
		const countRow = await env.DB
			.prepare('SELECT COUNT(*) AS c FROM ad_fingerprints WHERE ' + filter.where)
			.bind(...filter.binds).first();
		const { results } = await env.DB
			.prepare('SELECT type, value, match_count, source FROM ad_fingerprints WHERE ' + filter.where
				+ ' ORDER BY match_count DESC, id ASC LIMIT 10')
			.bind(...filter.binds).all();
		return { ok: true, total: Number(countRow?.c) || 0, rows: results || [] };
	} catch (error) {
		console.error('[广告检测] 预览批量删除指纹失败:', error);
		return { ok: false, reason: 'error' };
	}
}

// 执行批量删除。where 由 buildAdFingerprintBulkFilter 生成、绝不来自主人输入的拼接，
// 令牌里也只存筛选 key（consume 后重新 build），SQL 片段不进 D1 的 payload。
async function bulkDeleteAdFingerprints(env, filter) {
	if (!(await adDetectionReady(env))) return { ok: false, reason: 'unavailable' };
	try {
		const result = await env.DB
			.prepare('DELETE FROM ad_fingerprints WHERE ' + filter.where)
			.bind(...filter.binds).run();
		AD_FINGERPRINT_CACHE.delete(env.DB);
		return { ok: true, removed: Number(result?.meta?.changes || 0) };
	} catch (error) {
		console.error('[广告检测] 批量删除指纹失败:', error);
		return { ok: false, reason: 'error' };
	}
}

// 误判纠错：把命中该载荷的指纹逐条累加 false_positive_count 并重算置信度。
//
// 两种档位：
//   · 默认（options.purge 不为 true）：只累加误报，置信度跌破 0.2 且累计 3 次误判才退役，
//     且 source='manual' 豁免退役。这是被动噪声清理，用于没有主人明确表态的场合。
//   · options.purge === true（/ignore 走这一档）：主人已经明确说「这是误判」，
//     命中的指纹【当次即删】，不再攒 3 次，manual 也不豁免。
//     主人原话：「除非说误判了，我就可以通过指定的指令执行全群解封并给指纹记误报 +
//     删除记录的指纹。」同批改动拆掉了自动学习的强动词闸门，指纹库写入变宽，
//     纠错端必须同步变快 —— 只开闸不加强纠错是净损失。
//
// ⚠️ 即删档【刻意保留 source='seed' 的例外】：那 33 条是主人亲手定的中心特征，
// 判空条件是「数 source='seed' 的条数」（seedAdDetectionData），只要库里还剩一条种子，
// 被删掉的那条重新部署也不会补回来 —— 一次手滑就永久丢一条中心特征。
// 种子仍然照旧累加误报，走原来的「置信度 < 0.2 且误报 ≥ 3 次」自动退役通道，
// 也就是说选词失手的种子最终还是会被清掉，只是需要三次而不是一次。
async function markAdFingerprintFalsePositive(env, payload, options = {}) {
	if (!(await adDetectionReady(env))) return { ok: false, reason: 'unavailable' };
	const purge = options.purge === true;
	const fingerprints = await loadAdFingerprints(env);
	if (!fingerprints.length) return { ok: true, affected: 0, retired: 0 };

	const haystack = normalizeAdFingerprintValue([
		payload?.name, payload?.username, payload?.bio, payload?.text
	].filter(Boolean).join(' '));
	const domains = new Set((payload?.domains || []).map((d) => normalizeAdDomain(d)).filter(Boolean));

	const affected = fingerprints.filter((row) => {
		if (row.type === 'domain') {
			for (const domain of domains) {
				if (domain === row.normalized || domain.endsWith('.' + row.normalized)) return true;
			}
			return false;
		}
		if (row.type === 'username') {
			const target = row.normalized.replace(/^@/, '');
			return Boolean(target) && haystack.includes('@' + target);
		}
		return haystack.includes(row.normalized);
	});
	if (!affected.length) return { ok: true, affected: 0, retired: 0 };

	try {
		const now = Math.floor(Date.now() / 1000);
		// 误报计数一律先累加（含种子）—— 即删档下这一步对被删的行是白做，
		// 但对留下来的种子是它未来自动退役的唯一凭据，不能跳。
		await env.DB.batch(affected.map((row) => env.DB
			.prepare('UPDATE ad_fingerprints SET false_positive_count = false_positive_count + 1, confidence = CAST(match_count AS REAL) / (match_count + false_positive_count + 1), updated_at = ? WHERE fingerprint = ?')
			.bind(now, row.fingerprint)));
		let retiredCount = 0;
		if (purge) {
			const purgeable = affected.filter((row) => String(row.source || '') !== 'seed');
			if (purgeable.length) {
				const results = await env.DB.batch(purgeable.map((row) => env.DB
					.prepare('DELETE FROM ad_fingerprints WHERE fingerprint = ?').bind(row.fingerprint)));
				for (const r of results || []) retiredCount += Number(r?.meta?.changes || 0);
			}
			// 种子不即删，但仍要给它们跑一次原退役条件：三次误报攒满的那一刻在这里生效。
			const seedRetired = await env.DB
				.prepare("DELETE FROM ad_fingerprints WHERE confidence < 0.2 AND false_positive_count >= 3 AND source = 'seed'")
				.run();
			retiredCount += Number(seedRetired?.meta?.changes || 0);
		} else {
			const retired = await env.DB
				.prepare('DELETE FROM ad_fingerprints WHERE confidence < 0.2 AND false_positive_count >= 3 AND source != ?')
				.bind('manual').run();
			retiredCount = Number(retired?.meta?.changes || 0);
		}
		AD_FINGERPRINT_CACHE.delete(env.DB);
		return { ok: true, affected: affected.length, retired: retiredCount, purged: purge, rows: affected };
	} catch (error) {
		console.error('[广告检测] 标记误判失败:', error);
		return { ok: false, reason: 'error' };
	}
}

// /words 底层：分页列出指纹库。
async function listAdFingerprints(env, options = {}) {
	if (!(await adDetectionReady(env))) return { ok: false, reason: 'unavailable', rows: [], total: 0 };
	const limit = Math.min(50, Math.max(1, Number(options.limit) || 20));
	const offset = Math.max(0, Number(options.offset) || 0);
	// keyword：【只匹配 value 一列】。主人明确定的口径 —— source 不参与匹配。
	// 理由：source 只有 seed / auto / manual 三个值，拿它做模糊匹配等于把整类指纹一次性捞出来，
	// 而这个功能的用途是「找出某个词相关的指纹并挑掉误封的那条」，按来源筛没有意义。
	const keyword = String(options.keyword || '').trim();
	// LIKE 通配符必须转义成字面量，否则搜「50%」会被 SQLite 读成「50 + 任意字符」，
	// 搜「_」更是匹配全库任意单字符 —— 主人是拿它筛误封指纹的，多捞出来就等于误删。
	const likeArg = keyword ? '%' + keyword.replace(/[\\%_]/g, '\\$&') + '%' : null;
	const where = keyword ? " WHERE value LIKE ? ESCAPE '\\'" : '';
	try {
		const totalStmt = env.DB.prepare('SELECT COUNT(*) AS c FROM ad_fingerprints' + where);
		const totalRow = await (keyword ? totalStmt.bind(likeArg) : totalStmt).first();
		const listStmt = env.DB.prepare(
			'SELECT type, value, weight, match_count, false_positive_count, confidence, source, created_at FROM ad_fingerprints'
			+ where + ' ORDER BY match_count DESC, created_at DESC LIMIT ? OFFSET ?'
		);
		const { results } = await (keyword ? listStmt.bind(likeArg, limit, offset) : listStmt.bind(limit, offset)).all();
		return {
			ok: true,
			keyword,
			total: Number(totalRow?.c) || 0,
			rows: (results || []).map((row) => ({
				type: String(row.type || ''),
				value: String(row.value || ''),
				weight: Number(row.weight) || 1,
				matchCount: Number(row.match_count) || 0,
				falsePositiveCount: Number(row.false_positive_count) || 0,
				confidence: Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : 1,
				source: String(row.source || ''),
				createdAt: Number(row.created_at) || 0
			}))
		};
	} catch (error) {
		console.error('[广告检测] 列出指纹失败:', error);
		return { ok: false, reason: 'error', rows: [], total: 0 };
	}
}

// === 第三层：Workers AI 语义相似度 ===
// AI 未绑定时整层跳过，检测自动降级为「评分 + 指纹」两层。

function cosineSimilarity(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b)) return 0;
	const length = Math.min(a.length, b.length);
	if (!length) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < length; i++) {
		const x = Number(a[i]) || 0;
		const y = Number(b[i]) || 0;
		dot += x * y;
		normA += x * x;
		normB += y * y;
	}
	if (normA <= 0 || normB <= 0) return 0;
	const value = dot / (Math.sqrt(normA) * Math.sqrt(normB));
	return Number.isFinite(value) ? value : 0;
}

// 取文本向量。失败一律返回 null 交由上层跳过，绝不抛到检测主链路。
async function embedAdText(env, text) {
	const source = String(text ?? '').trim().slice(0, 512);
	if (!source) return null;
	if (!(env?.AI && typeof env.AI.run === 'function')) return null;
	try {
		const response = await env.AI.run(AD_EMBEDDING_MODEL, { text: [source] });
		const vector = response?.data?.[0];
		if (!Array.isArray(vector) || !vector.length) return null;
		return vector.map((v) => Number(v) || 0);
	} catch (error) {
		// 必须打出 name + message：Workers AI 的 Ai._parseError 抛出的 Error 往往 message 为空，
		// 只 console.error(error) 时日志里只有一串栈、看不到「模型不存在」这类真实原因，
		// 曾因此把「模型 ID 写错」误判为「AI 限流」。model 也一并打出便于对照目录。
		console.error('[广告检测] 生成文本向量失败'
			+ ' model=' + AD_EMBEDDING_MODEL
			+ ' name=' + (error?.name || '未知')
			+ ' message=' + (error?.message || '（空）')
			+ ' textLen=' + source.length);
		return null;
	}
}

// 样本向量懒加载：每次检测最多补 AD_SAMPLE_LAZY_BATCH（8）条待生成向量的样本，
// 分摊到多次请求，避免首次部署时一口气跑几十次 AI 推理把单请求预算打爆。
//
// 【2026-09-08 去掉 30 条硬上限】原实现开头是
//     if (readyCount >= AD_SAMPLE_TARGET_COUNT) return 0;
// 一旦库内带向量的样本够 30 条就永久停止补齐，而 loadAdSampleEmbeddings 只读
// WHERE embedding IS NOT NULL —— 于是第 30 条之后 /spam 学到的每一条新样本
// embedding 永远是 NULL，【永不参与 AI 判定】。离线实测：灌 50 条样本反复补齐停在
// 32 条，剩 18 条永久为 NULL，之后新学的样本 embedding 仍是 null。
// 主人的口径是「AI 是通过 spam 执行自我学习的」，这个上限恰好把那条学习链切断了：
// /spam 举报越多，指纹层越强，而 AI 的概念永远冻结在最早那 32 条上。
// 现在改成「库里还有 NULL 就继续补」，每次仍只补 8 条，单请求成本不变。
async function topUpAdSampleEmbeddings(env) {
	if (!(env?.AI && typeof env.AI.run === 'function')) return 0;
	try {
		const { results } = await env.DB.prepare(
			'SELECT id, sample_text FROM ad_sample_embeddings WHERE embedding IS NULL ORDER BY id ASC LIMIT ?'
		).bind(AD_SAMPLE_LAZY_BATCH).all();
		if (!results?.length) return 0;

		let filled = 0;
		for (const row of results) {
			const vector = await embedAdText(env, row.sample_text);
			if (!vector) continue;
			await env.DB.prepare('UPDATE ad_sample_embeddings SET embedding = ?, dimension = ? WHERE id = ?')
				.bind(JSON.stringify(vector), vector.length, row.id).run();
			filled += 1;
		}
		if (filled) AD_SAMPLE_EMBEDDING_CACHE.delete(env.DB);
		return filled;
	} catch (error) {
		console.error('[广告检测] 补齐样本向量失败:', error);
		return 0;
	}
}

// 读取样本向量（60 秒缓存）。JSON 解析失败的行直接跳过，不让脏数据阻断整层。
async function loadAdSampleEmbeddings(env) {
	if (!env?.DB) return [];
	try {
		const value = await loadAdCachedValue(AD_SAMPLE_EMBEDDING_CACHE, env.DB, AD_FINGERPRINT_CACHE_TTL_MS, async () => {
			if (!(await adDetectionReady(env))) return [];
			// 【2026-09-08 拆成「种子全量 + 最新学习样本」两段】
			// 旧实现是 ORDER BY id ASC LIMIT AD_SAMPLE_TARGET_COUNT * 2（= 60 条）。
			// 配合去掉向量补齐上限之后，这个 60 条会变成新的天花板：种子 + 中心特征已占约 34 条，
			// /spam 学到第 27 条新样本之后，再学的样本【即使有向量也读不进来】—— 而且因为
			// ORDER BY id ASC，被丢掉的恰好是最新、最贴近当前广告形态的那批。
			//
			// 新口径分两段：
			//   1) source = seed / seed-core 的中心特征全部载入，不受条数限制；
			//   2) 其余（spam / confirm / addsample 等学习来的）取 id 最大的 N 条，也就是最新的。
			// COALESCE 是因为建表时 source 允许 NULL，老数据可能没写 source，
			// 直接用 source NOT IN (...) 会因 NULL 比较返回 NULL 而把这些行整条漏掉。
			const { results } = await env.DB.prepare(
				"SELECT sample_text, embedding FROM ad_sample_embeddings "
				+ "WHERE embedding IS NOT NULL AND COALESCE(source, '') IN ('seed', 'seed-core') "
				+ "UNION ALL "
				+ "SELECT sample_text, embedding FROM ("
				+ "SELECT sample_text, embedding, id FROM ad_sample_embeddings "
				+ "WHERE embedding IS NOT NULL AND COALESCE(source, '') NOT IN ('seed', 'seed-core') "
				+ "ORDER BY id DESC LIMIT ?"
				+ ")"
			).bind(AD_SAMPLE_LEARNED_QUERY_LIMIT).all();
			const rows = [];
			for (const row of results || []) {
				try {
					const vector = JSON.parse(String(row.embedding));
					if (Array.isArray(vector) && vector.length) rows.push({ text: String(row.sample_text || ''), vector });
				} catch { /* 脏样本跳过 */ }
			}
			return rows;
		});
		return Array.isArray(value) ? value : [];
	} catch (error) {
		console.error('[广告检测] 读取样本向量失败:', error);
		return [];
	}
}

// 语义相似度判定。返回最高相似度与命中的样本原文，供通知展示判定依据。
async function checkAdAiSimilarity(env, text, options = {}) {
	const config = options.config || loadAdDetectionConfig(env);
	if (!config.aiEnabled) return { available: false, similarity: 0, sample: null };
	const source = String(text ?? '').trim();
	if (source.length < 4) return { available: true, similarity: 0, sample: null };

	await topUpAdSampleEmbeddings(env);
	const samples = await loadAdSampleEmbeddings(env);
	if (!samples.length) return { available: true, similarity: 0, sample: null };

	const vector = await embedAdText(env, source);
	if (!vector) return { available: true, similarity: 0, sample: null };

	let best = 0;
	let bestSample = null;
	let skippedDim = 0;
	for (const sample of samples) {
		// 维度守卫：cosineSimilarity 用 Math.min(a.length, b.length) 截断，维度不一致时会
		// 静默算出一个无意义的相似度，可能随机越过阈值造成误封。换模型后库里必然残留旧维度向量
		// （本项目就从 768 维换到 1024 维），所以这里必须显式跳过而不是让它算。
		if (sample.vector.length !== vector.length) { skippedDim += 1; continue; }
		const similarity = cosineSimilarity(vector, sample.vector);
		if (similarity > best) { best = similarity; bestSample = sample.text; }
	}
	if (skippedDim > 0) {
		// 提示运维：换过模型且未清空样本库。/clearsamples 后重新 /warmup 即可恢复第三层。
		console.warn('[广告检测] 跳过 ' + skippedDim + ' 条维度不匹配的样本向量'
			+ '（当前模型 ' + AD_EMBEDDING_MODEL + ' 输出 ' + vector.length + ' 维）'
			+ '，请用 /clearsamples 清空后重新 /warmup 生成。');
	}
	return {
		available: true,
		similarity: best,
		sample: bestSample,
		isMatch: best >= config.aiSimilarityThreshold,
		isSoft: best >= AD_AI_SOFT_BONUS_FLOOR && best < config.aiSimilarityThreshold
	};
}

// ===== 链接归一化（2026-09-09 方案 A）=====
//
// 【要治的病】主人原话：「我要的 AI 自动识别 一键识别 是自己能够自我学习新的广告 不同广告
// 不同类型广告 不同特征广告 AI 是更加优秀 而不是降智。」而现状是学一条杀一条 —— 因为
// 送进嵌入模型的文本里【原样带着 URL】，而 URL 是这条广告身上最独一无二、最不可迁移的部分。
//
// 离线实测的两张资料卡（一张漏封、一张侥幸封住），链接占比：
//   漏封那张：`此号不回复！！！24h做单入口: https://t.me/+XFOCZC0tZxUyODg9 💎`
//            链接 30 字 / 全文 53 字 = 56.6%，剥掉链接后真正的话术只剩 20 字。
//   封住那张：`lj来米快，急需钱的兄弟来找我带，不头不按，链接进群：https://t.me/+ieMc-5jAwVcxZjA0 HE`
//            链接 30 字 / 全文 67 字 = 44.8%，剥掉后 34 字。
// 这是两张卡在【结构查杀四通道全放行、评分层都是 -3】之后唯一的量化差异 —— 一半以上的
// 向量维度被一串一次性随机邀请码占着，真正能迁移的广告话术被稀释到不足一半权重。
// 换个邀请码，同一套话术的向量就跟着漂移，学过的样本对它就不再相似。
//
// 【怎么治】把 URL 换成语义占位符：形态信息（这是私有群邀请链接／这是 telegram 链接／
// 这是外站链接）保留下来进向量，随机码扔掉。于是「做单入口 + 私有群邀请链接」这个骨架
// 才是被学进样本库的东西，换一百个邀请码它都还在。
//
// 【三档的分界为什么这么定】
//   t.me/+xxx、t.me/joinchat/xxx → 私有群一次性邀请链接。正常人几乎不会把它写进【个人简介】，
//     这是拉群广告的标志形态（方案 C 就是拿它单独计分的）。
//   t.me/username、telegram.me、telegram.dog → 公开账号／频道链接。主人明确说过
//     「正常用户大部分都会使用这个」，所以它只归一化成中性的 telegram链接，不带贬义。
//   其余 http(s) → 外部链接。再细分（按域名）就等于把域名塞回向量，又回到不可迁移的老路，
//     域名该由第二层的 domain 指纹去管，不是 AI 层的活。
//
// 【幂等】占位符本身不含 URL，重复调用结果不变 —— 所以写入端（addAdSample）与
// 拼装端（buildAdSampleText）可以都套一层，不必担心谁先谁后。
const AD_SEMANTIC_PLACEHOLDER_PRIVATE_INVITE = '私有群邀请链接';
const AD_SEMANTIC_PLACEHOLDER_TELEGRAM = 'telegram链接';
const AD_SEMANTIC_PLACEHOLDER_EXTERNAL = '外部链接';

// 归一化替换用的正则。【必须与下面 hasAdPrivateInviteLink 用的那条分开定义】——
// 带 g 标志的正则对象自带 lastIndex 状态，同一个对象既 replace 又 test 会漏判。
const AD_SEMANTIC_PRIVATE_INVITE_RE_G = /(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.(?:me|dog)\/(?:joinchat\/|\+)[^\s]*/gi;
const AD_SEMANTIC_TELEGRAM_RE_G = /(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.(?:me|dog)\/[^\s]*/gi;
const AD_SEMANTIC_EXTERNAL_RE_G = /https?:\/\/[^\s]+/gi;

// 把文本里的链接换成语义占位符。替换顺序【必须先私有后公开】：私有形态
// t.me/+xxx 本身也匹配公开形态的 t.me/xxx，先跑公开那条会把它一并吃掉、分档失效。
function normalizeAdSemanticText(text) {
	const source = String(text ?? '');
	if (!source) return '';
	return source
		.replace(AD_SEMANTIC_PRIVATE_INVITE_RE_G, ' ' + AD_SEMANTIC_PLACEHOLDER_PRIVATE_INVITE + ' ')
		.replace(AD_SEMANTIC_TELEGRAM_RE_G, ' ' + AD_SEMANTIC_PLACEHOLDER_TELEGRAM + ' ')
		.replace(AD_SEMANTIC_EXTERNAL_RE_G, ' ' + AD_SEMANTIC_PLACEHOLDER_EXTERNAL + ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

// 归一化之后剩下多少「真正的话术」（把三个占位符全剥掉再量长度）。
//
// 【为什么非要有这道闸】归一化本身带来一个新的、比原病更凶的风险：一条只有链接没有话术的
// 广告（bio 就写 `https://t.me/+abc123`），归一化后样本文本变成纯占位符「私有群邀请链接」。
// 这条样本一旦进库，任何含私有邀请链接的文本对它的余弦相似度都会爆表 —— 而 AI 层是
// 【硬命中即封、不看豁免词也不看总分】的，等于给全群每个分享过群链接的人挂了一颗雷。
// 所以写入端必须卡住：剥掉占位符后不足 AD_SAMPLE_MIN_CORE_LENGTH 字符的，一律不进样本库。
// 这类号本来也不靠 AI 抓 —— 域名进 domain 指纹（权重 1，单条即定罪），形态进方案 C 的计分。
function adSemanticCoreLength(text) {
	const source = String(text ?? '');
	if (!source) return 0;
	return source
		.split(AD_SEMANTIC_PLACEHOLDER_PRIVATE_INVITE).join(' ')
		.split(AD_SEMANTIC_PLACEHOLDER_TELEGRAM).join(' ')
		.split(AD_SEMANTIC_PLACEHOLDER_EXTERNAL).join(' ')
		.replace(/\s+/g, '')
		.length;
}

// 归一化后仍需保留的最小话术长度。取 6 与 addAdSample 原有的 text.length < 4 是两道不同的闸：
// 那道管「整条太短」，这道管「除了链接什么都没有」。实测两张卡剥链接后是 20 字与 34 字，
// 都远在门槛之上，这道闸只拦纯链接样本。
const AD_SAMPLE_MIN_CORE_LENGTH = 6;

// ===== 私有群一次性邀请链接：单独计分（2026-09-09 方案 C）=====
//
// 【物理放在这里的原因】下面这条正则必须与上面 AD_SEMANTIC_PRIVATE_INVITE_RE_G 认同一种形态 ——
// 归一化把哪些链接判成「私有群邀请链接」，计分就得对哪些链接计分。两条正则分散在文件两头，
// 早晚会一改一漏，那时归一化说是私有链接、计分说不是（或反过来），排查起来是噩梦。
//
// 【要治的病】主人明确指定过 't.me' 进 AD_EXEMPT_KEYWORDS，原话：「t.me 不该成为封禁词，
// 也加豁免。因为正常用户大部分都会使用这个。」这条判断本身是对的，本次改动【一个字都不动它】。
// 问题在于它【不区分形态】，于是 t.me 从「不算证据」变成了「-3 分护身符」：
//   t.me/username        公开账号／频道链接。正常用户天天用，该豁免。
//   t.me/+xxx            私有群一次性邀请码。
//   t.me/joinchat/xxx    同上（旧版客户端生成的形态）。
// 后两种是【拉群广告的标志形态】—— 它只能用一次、无法搜索、点进去直接进群，正常人几乎不会
// 把它写进【个人简介】（要留联系方式会留 @username，要推荐群会在聊天里发而不是刻在资料卡上）。
// 离线实测的两张卡都属这一形态，而它们在结构查杀四通道全放行之后，评分层唯一的分项就是
// 「-3 命中豁免词：t.me」—— 广告号拿主人给正常用户的护身符把自己从 0 分压到了 -3 分。
//
// 【分值取 7 的推演】这两张卡除豁免外其余分项全是 0，所以分值直接决定结局：
//   取消豁免不计分 → 0 分，仍然 pass，白改。
//   +3            → 3 分，仍然 pass（观察线 5、封禁线 7），白改。
//   +5            → 5 分，只进观察窗口：不封任何人，推快照等主人人工复核。
//   +7            → 撞封禁线，直接封。
//
// 【2026-09-09 第二轮：5 改 7】主人定的，原话：「可以缩小范围。检测私有群邀请链接。
// 因为正常用户是不会放私有群在用户简介上的。」以及「豁免的是非广告 不豁免的是广告 广告无所遁形！」
//
// 后一句点破的正是下面那套豁免剔除规则真正的作用 —— 它不只是「少减 3 分」，它是一道分流器：
//   真广告的简介除了那条链接没别的内容，豁免命中【只有 't.me' 一个词】，被剔光 → 净 +7 → 封。
//   技术群主的简介里有 cdn / vless / reality 撑着豁免 → 仍吃 -3 → 净 +4 → PASS。
//   同时放了公开频道链接的人（t.me/mychannel + t.me/+xxx）→ 豁免整条照给 → 净 +4 → PASS。
// 分流不需要任何新逻辑，已落地的剔除规则自己就做到了。这是分值敢从 5 提到 7 的全部依据。
//
// 【订正上一轮的一处错判】第一轮注释在这里写过「+7 → 技术群群主 / 社群运营会被直接误封」，
// 对技术群主那半句是错的 —— 当时漏算了他们的技术豁免词仍在生效（7 - 3 = 4，够不到封禁线）。
// 实测：`CDN 技术交流，进群 t.me/+abcdefghij` = 4 分 PASS。上一轮推荐 5 分的理由有一部分
// 建立在这个错判之上，留此备忘，别再按那句话去推演。
//
// 【7 分下真实存在的误封面】只放私有邀请链接、简介里又没有任何技术词的人 —— 社群运营、
// 读书会、拼团群主。他们会被直接封。主人已明确接受：「E 虽然会误封。但是可以判断
// 误封之后我再修改。」误封后 /ignore 回滚，样本与指纹都删得掉（双 hash 试删已覆盖）。
//
// 【为什么不会滚成累积误封】评分加在 scoreAdProfile（静态资料分）里，而观察窗口留存的是
// retainScore = Math.max(0, behaviorScore)，behaviorScore【只含正文 / 上下文 / 转发分，
// 不含资料分】。所以这 7 分不进历史分，不会出现「第一条 observe、第二条再叠一份成倍数分」
// 的恶性循环 —— 那正是 @MiLov1900 两次被误封的机制，已于 2026-09-08 根治，这里不能把它请回来。
const AD_PRIVATE_INVITE_SCORE = 7;

// 只做 test、不做 replace，所以【不带 g 标志】（带 g 的正则对象自带 lastIndex，
// 反复 test 同一个对象会时真时假）。邀请码下限 5 字符：Telegram 实际生成的是 16 位上下，
// 卡 5 是为了不把 `t.me/+` 这种半截链接或纯手打的 `t.me/+86` 电话号误认成邀请码。
const AD_PRIVATE_INVITE_RE = /(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.(?:me|dog)\/(?:joinchat\/|\+)[A-Za-z0-9_-]{5,}/i;

// 公开 telegram 链接（t.me/username 形态）。判定前【先把私有形态整段剥掉】——
// 私有链接 t.me/+abc123 本身也长得像 t.me/xxx，不剥就永远返回 true，豁免剔除逻辑会全程失效。
const AD_PUBLIC_TELEGRAM_RE = /(?:t|telegram)\.(?:me|dog)\/[A-Za-z0-9_]{3,}/i;

function hasAdPrivateInviteLink(text) {
	return AD_PRIVATE_INVITE_RE.test(String(text ?? ''));
}

function hasAdPublicTelegramLink(text) {
	return AD_PUBLIC_TELEGRAM_RE.test(String(text ?? '').replace(AD_SEMANTIC_PRIVATE_INVITE_RE_G, ' '));
}

// 私有邀请链接命中时要从豁免命中里剔掉的词。
// 目前只有 't.me' 一个（AD_EXEMPT_KEYWORDS 里没有 'telegram.me' / 'telegram.dog'，
// 且 'telegram.me' 这个串本身不含子串 't.me'，所以不会被 countAdKeywordHits 命中）。
// 做成 Set 是留给以后往豁免表里加 telegram 域名变体时不必再改剔除逻辑。
const AD_TELEGRAM_LINK_EXEMPT_WORDS = new Set(['t.me', 'telegram.me', 'telegram.dog']);

// 从判定载荷拼出 AI 语义样本文本。
//
// 【必须只有这一个拼法】自动学习（enforceAdDetection）与误判回滚（/ignore、/unban）
// 是一对逆操作：写入时按什么拼，删除时就得按什么拼 —— addAdSample 用 adTextHash(text)
// 作唯一键，拼法差一个空格 hash 就完全不同，回滚会静默删不掉，样本库里留下永久污染。
// 所以两端一律走这个函数，不许在调用点手写 join。
//
// 【刻意不含 username】@xxx 是账号名不是广告话术，嵌入向量里没有可迁移的语义，
// 反而会把「任何 @字母数字串」推向广告特征 —— 正常用户 @ 好友就会开始往高相似度靠。
// 同理，引用体（quoted）那段话是别人写的，也不进这里，理由见 judgeAdQuotedKill 的注释。
//
// 【2026-09-09 起返回值已链接归一化】理由见 normalizeAdSemanticText。这是「一处归一化、
// 三端自动对称」的收敛点 —— 学习端（enforceAdDetection / /spam）、删除端（/ignore / /unban）、
// 检测端（evaluateAdSuspect 的 semanticText）现在全都经过这一个函数，拼法永不可能对不上。
// 副作用：归一化顺带把换行折叠成空格，所以多行 bio 的 hash 与改动前不同 ——
// 存量样本的兼容由 removeAdSampleByText 的双 hash 试删兜住，见那边的注释。
function buildAdSampleText(payload) {
	return normalizeAdSemanticText([payload?.name, payload?.bio, payload?.text].filter(Boolean).join(' ').trim());
}

// /addsample 底层：新增语义样本，向量留空由懒加载补齐。
//
// 【入口统一归一化】这里再套一次 normalizeAdSemanticText 不是多余：/addsample 是主人手打的
// 路径（12814 那处直接传 arg，不走 buildAdSampleText），只在拼装端归一化会漏掉它，
// 于是手打样本存原文、自动样本存归一化文本，两套 hash 混在一张表里，纠错端就又对不上了。
// 函数幂等，走过 buildAdSampleText 的文本再过一遍结果不变。
async function addAdSample(env, rawText, options = {}) {
	const text = normalizeAdSemanticText(rawText);
	if (text.length < 4) return { ok: false, reason: 'too_short' };
	// 剥掉链接占位符后没有实质话术的，一律拒收 —— 理由见 adSemanticCoreLength 的注释
	// （纯占位符样本会让 AI 层把每个分享群链接的人都判成高相似）。
	if (adSemanticCoreLength(text) < AD_SAMPLE_MIN_CORE_LENGTH) return { ok: false, reason: 'no_core' };
	if (!(await adDetectionReady(env))) return { ok: false, reason: 'unavailable' };
	try {
		const hash = adTextHash(text);
		const existing = await env.DB.prepare('SELECT id FROM ad_sample_embeddings WHERE text_hash = ?').bind(hash).first();
		if (existing) return { ok: true, added: false, text };
		await env.DB.prepare(
			'INSERT INTO ad_sample_embeddings (text_hash, sample_text, embedding, dimension, source, created_at) VALUES (?, ?, NULL, NULL, ?, ?)'
		).bind(hash, text.slice(0, 500), String(options.source || 'manual'), Math.floor(Date.now() / 1000)).run();
		AD_SAMPLE_EMBEDDING_CACHE.delete(env.DB);
		return { ok: true, added: true, text };
	} catch (error) {
		console.error('[广告检测] 添加语义样本失败:', error);
		return { ok: false, reason: 'error' };
	}
}

// ===== 短语自我泛化（方案 E · AI 自我学习闭环）=====
//
// 【解决什么】AI 语义层的样本库在 /spam 之前只能靠中心特征 + 手工 /addsample 喂。主人
// 的原话是「AI 是通过 spam 执行自我学习的」—— 但 /spam 只喂样本、不提炼规则，样本库
// 永远停留在「已见过的广告」，新变体的广告（同词根、同黑话、同招揽句式）照样漏。
// 方案 A 已把样本正文归一化（链接→占位符），方案 E 在此基础上做第二步：从新样本里
// 提炼【跨样本共现的 4~8 字短语】，升级成 keyword 指纹。指纹层是命中即封、代价最高，
// 所以提炼端的三重闸刻得非常紧，宁可不提炼也不许把正常词学成指纹。
//
// 【为什么误面小】提炼素材只来自 /spam 引用分支 —— 那是主人或有权限管理员人工判定
// 过的广告（source='spam'/'spam-quoted'），不是自动封禁路径的路过文本。对比 old-code
// 自动学习（见 learnAdFingerprints 里那套三重限制的注释）：那条路是「任何消息都可能被
// 学成指纹」，误面大得多；这条路把「学什么」的判断交给真人，AI 只负责把重复出现的
// 短语聚出来。
//
// 【三重闸】四个条件【全部】满足才入库，任何一个不满足就丢弃：
//   1)豁免词闸 —— 短语不含任何 AD_EXEMPT_KEYWORDS。这条必须排最前：豁免词是主人反复
//     确认过的「正常用户会写」的词（私聊 / 代理 / t.me / 各种协议名），一旦命中直接丢。
//   2)强动词·业务词闸 —— 短语必须含其中一个强交易动词或业务关键词。这是唯一一道「广告
//     语义」闸：没有它，「欢迎进群」「联系我」这类跨样本共现的高频碎片会被学成指纹，
//     之后所有这么说话的正常用户一律误杀。有它，提炼结果天然带着广告指向。
//   3)形态闸 —— 纯数字、纯符号、含 emoji 的丢弃。emoji/数字组合的「文案」极常见
//     （🔞秒到、1OO%），学进去等于给整类带 emoji 的正常消息挂雷。
//   4)长度闸 —— 4~8 字（码点计），低于 4 字噪音大、高于 8 字太像整句。这道闸要量【两次】：
//     切词端量窗口原文，入库端再量 normalizeAdFingerprintValue 之后的值 —— 后者会 trim
//     空白使短语变短，只量前者会漏出 3 字指纹（详见入库前那段注释）。
//
// 【检查点】省内存 + 免重扫：ad_scan_state 里存最后一次处理的样本 id（AD_ENRICH_CHECKPOINT_KEY），
// 每次只扫 id 大于它的新样本。提炼完成后推进到已处理批的最大 id —— 无论那次有没有提炼出
// 东西，都必须推进，否则重复共现会永远在同一批样本上打转。
//
// 【与 learnAdFingerprints 的分工】本函数只负责把「已存在样本库里的短语」升级成指纹，
// 不做抽取候选（那是 learnAdFingerprints 用 extractAdFingerprintCandidates 干的事）。
// 两者写的是同一张 ad_fingerprints 表，靠 adFingerprintKey 去重 —— 同一短语若先从 /spam
// 以 source='spam' 学进来、之后又被 E 提炼，upsert 只会 +1 match_count 并把来源提成千
// 工级，不会重复入库，也不会降权。
async function enrichAdCommonPhrases(env, config, options = {}) {
	if (!env?.DB) return { ok: false, learned: 0, reason: 'no_db' };
	if (!(await adDetectionReady(env))) return { ok: false, learned: 0, reason: 'unavailable' };
	// 【0 必须真能关掉】这里【不能】写 `Number(x) || 默认值` —— 0 既是合法值又是假值，
	// 会被 || 直接吃掉回退成默认 5，于是 AD_ENRICH_EVERY=0 这个降级开关是死的
	// （离线实测：设 0 之后照样提炼，reason 连 'disabled' 都返回不出来）。
	// 正确顺序是：先取数 → 判有限性 → 判 >0 决定开关 → 最后才 Math.max(1,…) 兜下界。
	const rawEvery = Number(config?.enrichEvery ?? AD_ENRICH_EVERY);
	const everyValue = Number.isFinite(rawEvery) ? rawEvery : AD_ENRICH_EVERY;
	if (!(everyValue > 0)) return { ok: true, learned: 0, reason: 'disabled' };
	const every = Math.max(1, everyValue);
	const minOccurrence = Math.max(2, Number(config?.enrichMinOccurrence ?? AD_ENRICH_MIN_OCCURRENCE) || AD_ENRICH_MIN_OCCURRENCE);
	const maxResults = Math.max(1, Number(config?.enrichMaxResults ?? AD_ENRICH_MAX_RESULTS) || AD_ENRICH_MAX_RESULTS);
	const minLen = Math.max(4, Number(options.phraseMin) || AD_ENRICH_PHRASE_MIN);
	const maxLen = Math.min(12, Math.max(minLen, Number(options.phraseMax) || AD_ENRICH_PHRASE_MAX));

	try {
		// 读取检查点。首次为 '0'（全表都是新样本）。
		const checkpointRaw = await readAdScanState(env, AD_ENRICH_CHECKPOINT_KEY, '0');
		const checkpoint = Math.max(0, Number(checkpointRaw) || 0);

		// 取严格大于检查点的新样本，最多取 every 条一池，只按 id 升序（先到先炼）。
		//
		// 【source 过滤是必需的，不是优化】seedAdDetectionData 会给【每个新库】灌 31 条种子
		// 样本：10 条 AD_SAMPLE_SEED_TEXTS（source='seed'）+ 21 条 AD_FINGERPRINT_SEED 里
		// 长度≥4 的 keyword 下潜（source='seed-core'）。它们的 id 全部 > 0，不过滤的话首次
		// 部署时 checkpoint=0 会把这批中心特征【互相共现】—— 离线实测：一条 /spam 样本都没有
		// 时就能炼出 10 条候选、入库 7 条 auto 指纹（"高价收网" "收购网" …）。后果有两层：
		//   ① 违背本函数的立身前提「素材只来自人工判定」，学出来的东西没人审过；
		//   ② 种子文本带空格（"长期收购网 du 商宝账号"），切出的窗口归一化后会缩短，
		//      "收购网 " → "收购网"，3 个字、weight 0.8 命中即封 —— 「收购网站」直接误封。
		// 所以这里只认 /spam 引用分支写进来的两种 source，与函数顶部注释的设计口径一致。
		const { results: rows } = await env.DB.prepare(
			"SELECT id, sample_text, source FROM ad_sample_embeddings WHERE id > ? AND source IN ('spam', 'spam-quoted') ORDER BY id ASC LIMIT ?"
		).bind(checkpoint, every).all();
		const samples = (rows || []).filter((r) => r && String(r.sample_text || '').length >= minLen);
		// 样本还不够一池就先不动，也【不推进检查点】——推进了就会跳过这批，等 next spawn 再凑。
		// 注意：这里不把「累积不足」当失败，只是还没到触发线。
		if (samples.length < every) return { ok: true, learned: 0, reason: 'pending', checkpoint };

		const now = Math.floor(Date.now() / 1000);
		// created_by 固定写 'enrich'，【不写操作人 id】—— 这是本方案唯一的审计与回滚抓手：
		// /words 一眼能认出哪些指纹是机器自己炼的，误封时按 created_by='enrich' 就能整批
		// 回滚，而不必逐条辨认。操作人信息不会丢：同一次 /spam 里 learnAdFingerprints 学到的
		// 那批指纹已经记了 operatorId，两者对同一时刻的操作可以互相印证。
		const createdBy = String(options.createdBy || 'enrich');

		// ===== 共现统计：每条样本切成 N 个码点窗口（len in [minLen,maxLen]），跨样本去重计数 =====
		const sampleBucket = new Map(); // phrase -> Set(sampleId)
		for (const row of samples) {
			const sid = Number(row.id);
			const text = String(row.sample_text || '');
			// 归一化后剥掉占位符再切 —— 占位符（私有群邀请链接/telegram链接/外部链接）是
			// 所有广告共享的词，不剥就会成为「每样本都出现」的假共现，最终被学成指纹。
			const core = text
				.split(AD_SEMANTIC_PLACEHOLDER_PRIVATE_INVITE).join(' ')
				.split(AD_SEMANTIC_PLACEHOLDER_TELEGRAM).join(' ')
				.split(AD_SEMANTIC_PLACEHOLDER_EXTERNAL).join(' ')
				.replace(/\s+/g, ' ');
			// 【emoji 整条不学（F2 决策）】含 emoji 的文本本身无法判定是正常聊天还是广告，
			// 且单窗口的 emoji 闸管不住相邻窗口 —— 「收购🔞USDT」能切出干净的 4 字
			// 窗口「USDT」（不含 emoji，照过闸3，但 USDT 又命中业务词照学不误）。
			// 所以这里不是拦窗口，而是整条跳过：样本里出现 emoji，这条就完全不参与提炼。
			if (/\p{Extended_Pictographic}/u.test(core)) continue;
			// 按 Unicode 码点切，中文安全（Array.from 走 fromCodePoint，不会把代理对拆破）。
			const chars = Array.from(core);
			if (chars.length < minLen) continue;
			const seenThisSample = new Set();
			for (let start = 0; start < chars.length; start++) {
				for (let len = minLen; len <= maxLen && start + len <= chars.length; len++) {
					const phrase = chars.slice(start, start + len).join('');
					if (seenThisSample.has(phrase)) continue; // 同一样本内去重，避免重复计数
					seenThisSample.add(phrase);
					// 这里只先累计「出现过的样本数」，真正裁决在三重闸之后。
					if (!sampleBucket.has(phrase)) sampleBucket.set(phrase, new Set());
					sampleBucket.get(phrase).add(sid);
				}
			}
		}

		// ===== 逐短语过三重闸，count>=minOccurrence 才入库 =====
		// 注意与 learnAdFingerprints 的 isExemptOnlyKeyword 保持同一口径：
		// 「豁免词 + 强动词/业务词共存」放行（那是真广告夹带技术术语，例「收购 vless 账号」），
		// 只有【纯豁免词】的碎片才丢弃。
		const gate = (phrase) => {
			const exemptHits = countAdKeywordHits(phrase, AD_EXEMPT_KEYWORDS).length;
			const tradeHits = countAdKeywordHits(phrase, AD_TRADE_VERBS).length;
			const businessHits = countAdKeywordHits(phrase, AD_BUSINESS_KEYWORDS).length;
			// 闸1：仅豁免词闸 —— 既命中豁免词、又无任何强动词/业务词 → 丢弃
			if (exemptHits && !tradeHits && !businessHits) return false;
			// 闸2：强动词·业务词闸 —— 必须含其中一个强交易动词或业务关键词
			if (!tradeHits && !businessHits) return false;
			// 闸3：形态闸（纯数字 / 纯符号 / 含 emoji 丢弃）
			if (/^[\d\s]+$/.test(phrase)) return false;          // 纯数字或空白
			if (/^[^\p{L}\p{N}]+$/u.test(phrase)) return false;  // 纯符号/标点
			if (/\p{Extended_Pictographic}/u.test(phrase)) return false; // 含 emoji
			return true;
		};

		const chosen = [];
		const seenValue = new Set();
		for (const [phrase, set] of sampleBucket.entries()) {
			if (set.size < minOccurrence) continue;
			if (!gate(phrase)) continue;
			// 【长度闸必须拿归一化【之后】的值再量一次】切词端量的是窗口原文，而真正落库的是
			// normalizeAdFingerprintValue(phrase) —— 它会 trim 首尾空白并折叠连续空白。于是
			// "收购网 "（4 码点，过得了切词端的 4 字闸）落库缩成 3 字的 "收购网"，而
			// AD_ENRICH_WEIGHT(0.8) 正好等于 AD_FINGERPRINT_BAN_WEIGHT，是命中即封 ——
			// 「我在收购网站上买的」「二手收购网点」这类正常发言会被子串匹配直接封禁。
			// 这不是「判错广告」，是把一个正常三字词做成了永久地雷，纠错端也难发现。
			// 切词端的闸拦不住它（那时空格还在），只有在这里堵。
			const value = normalizeAdFingerprintValue(phrase);
			if (Array.from(value).length < minLen) continue;
			// 归一化会让不同窗口撞成同一个值（"收购网 d" 与 "收购网  d"），去重免得
			// 同一条 fingerprint 在一个 batch 里 upsert 两次，把 match_count 平白刷高。
			if (seenValue.has(value)) continue;
			seenValue.add(value);
			chosen.push({ phrase, value, occurrence: set.size });
			if (chosen.length >= maxResults) break; // 单次提炼封顶，防指纹库被刷爆
		}
		if (!chosen.length) {
			// 一池样本没提炼出任何东西 —— 也要推进检查点，否则每来一条新样本都重扫同一池。
			await writeAdScanState(env, AD_ENRICH_CHECKPOINT_KEY, String(samples[samples.length - 1].id), now);
			return { ok: true, learned: 0, reason: 'no_candidate', checkpoint: Number(samples[samples.length - 1].id) };
		}

		// ===== 入库 =====
		// value 在上面的长度复查里已经算过且去过重，这里直接用，不再 normalize 第二次。
		const statements = chosen.map(({ value }) => env.DB.prepare(
			'INSERT INTO ad_fingerprints (fingerprint, type, value, weight, match_count, false_positive_count, confidence, source, created_by, created_at, updated_at) '
			+ 'VALUES (?, ?, ?, ?, 0, 0, 1, ?, ?, ?, ?) ON CONFLICT(fingerprint) DO UPDATE SET '
			+ 'match_count = match_count + 1, updated_at = excluded.updated_at, '
			+ 'confidence = CAST(match_count + 1 AS REAL) / (match_count + 1 + false_positive_count), '
			+ "source = CASE WHEN excluded.source = 'manual' THEN 'manual' ELSE source END"
		).bind(
			adFingerprintKey('keyword', value), 'keyword', value, AD_ENRICH_WEIGHT,
			'auto', createdBy, now, now
		));
		await env.DB.batch(statements);
		AD_FINGERPRINT_CACHE.delete(env.DB);

		// 推检查点到本池最大 id —— 这批已经提炼过，下次从下一条开始。
		await writeAdScanState(env, AD_ENRICH_CHECKPOINT_KEY, String(samples[samples.length - 1].id), now);
		return { ok: true, learned: chosen.length, checkpoint: Number(samples[samples.length - 1].id), candidates: chosen };
	} catch (error) {
		console.error('[广告检测] 短语自我泛化失败:', error);
		return { ok: false, learned: 0, reason: 'error' };
	}
}

// 误判回滚用：按原文删掉一条语义样本。
//
// 【为什么必须有这个】在这批改动之前，删样本只有 clearAdSamples（清空全表，含种子）
// 一个选择，而 /ignore 碰都没碰样本库 —— 于是「自动封禁 → 自动学进 AI 样本库 → 主人
// 发现是误判 → /ignore 回滚」这条链上，指纹删掉了、黑名单清了、全群解封了，
// 唯独那条错样本永久留在 AI 样本库里，继续把相似的正常用户往高相似度上拉。
// AI 层是硬命中即封、不看豁免词也不看总分的（离线实测过：-4 分的技术用户照样 verdict=ban），
// 一条错样本的杀伤力比一条错指纹更大，纠错端不能缺这一环。
//
// 【种子样本一律不删】source = seed / seed-core 是主人定的中心特征与内置种子，
// 补灌判空条件是「数对应 source 的条数」，删一条就永不回来 —— 和指纹种子同一个道理。
async function removeAdSampleByText(env, rawText) {
	const raw = String(rawText ?? '').trim();
	// 门槛仍按【原文】长度判，与改动前逐字等价：归一化会把长链接压成 7 字占位符，
	// 拿归一化后的长度卡门槛会让「纯链接样本」删不掉，纠错端反而更弱。
	if (raw.length < 4) return { ok: false, reason: 'too_short' };
	if (!(await adDetectionReady(env))) return { ok: false, reason: 'unavailable' };
	try {
		// 【双 hash 试删 · 存量兼容的关键一环】2026-09-09 起写入端做了链接归一化
		// （见 normalizeAdSemanticText），于是库里同时存在两代样本：
		//   改动【前】自动学进去的 —— text_hash 按未归一化原文算；
		//   改动【后】自动学进去的 —— text_hash 按归一化文本算。
		// 只算一种 hash 就会有一代删不掉。而 /ignore 删不掉样本的后果是最重的：
		// AI 层硬命中即封、不看豁免词也不看总分，一条错样本比一条错指纹更危险，
		// 主人「误封之后我再修改」这条路就断了。所以两个 hash 都试，去重后一次 IN 删完。
		// hash 一律用未截断文本算，与 addAdSample 保持一致（那边只在存 sample_text 时才 slice(0,500)）。
		const hashes = [...new Set([adTextHash(normalizeAdSemanticText(raw)), adTextHash(raw)])];
		const result = await env.DB
			.prepare('DELETE FROM ad_sample_embeddings WHERE text_hash IN ('
				+ hashes.map(() => '?').join(', ')
				+ ") AND COALESCE(source, '') NOT IN ('seed', 'seed-core')")
			.bind(...hashes).run();
		const removed = Number(result?.meta?.changes || 0);
		if (removed > 0) AD_SAMPLE_EMBEDDING_CACHE.delete(env.DB);
		return { ok: true, removed };
	} catch (error) {
		console.error('[广告检测] 删除语义样本失败:', error);
		return { ok: false, reason: 'error' };
	}
}

// /clearsamples 底层：清空全部样本（含种子）。调用方负责二次确认。
async function clearAdSamples(env) {
	if (!(await adDetectionReady(env))) return { ok: false, reason: 'unavailable' };
	try {
		const result = await env.DB.prepare('DELETE FROM ad_sample_embeddings').run();
		AD_SAMPLE_EMBEDDING_CACHE.delete(env.DB);
		return { ok: true, removed: Number(result?.meta?.changes || 0) };
	} catch (error) {
		console.error('[广告检测] 清空语义样本失败:', error);
		return { ok: false, reason: 'error' };
	}
}

async function countAdSamples(env) {
	if (!(await adDetectionReady(env))) return { total: 0, ready: 0, stale: 0 };
	try {
		const total = await env.DB.prepare('SELECT COUNT(*) AS c FROM ad_sample_embeddings').first();
		const ready = await env.DB.prepare('SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE embedding IS NOT NULL').first();
		// stale = 已生成但维度与当前模型不符的向量。换模型后这些向量在判定时会被跳过，
		// 光看 ready 数会以为第三层没问题，实际可用样本是 ready - stale。
		const stale = await env.DB.prepare(
			'SELECT COUNT(*) AS c FROM ad_sample_embeddings WHERE embedding IS NOT NULL AND dimension IS NOT NULL AND dimension != ?'
		).bind(AD_EMBEDDING_DIMENSION).first();
		return {
			total: Number(total?.c) || 0,
			ready: Number(ready?.c) || 0,
			stale: Number(stale?.c) || 0
		};
	} catch (error) {
		console.error('[广告检测] 统计语义样本失败:', error);
		return { total: 0, ready: 0, stale: 0 };
	}
}

// === 第四层设施：用户资料抓取与观察窗口 ===
// getChat 对用户 ID 会返回 bio，是识别「交易动词 Bio」的唯一来源；
// 失败一律降级为只用消息里带的 first_name / username，绝不阻断。
// getChat 结果的进程内缓存，5 分钟过期。
// 预筛门槛取消后，每条群消息都要拉一次 bio；刷屏 / 连续对话时同一个人可能在几秒内
// 发十几条，逐条调用会毫无必要地逼近 Telegram 的 429（约 30 req/s）。
// 只缓存 getChat 的返回（昵称 / 用户名 / bio），【不缓存 status】——
// status 是 per-chat 的，同一人在不同群状态不同，混用会串号。
// 边界：Worker 实例随时被回收，缓存是尽力而为的优化，不是一致性保证；
// 冷启动就是缓存全空，行为退化成「每条都拉」，与不加缓存等价，因此不影响正确性。
// 代价是 bio 改动最多 5 分钟后才被看到 —— 广告号改简介后有一个短窗口按旧资料判定，
// 但观察窗口与定时全量扫描都会再覆盖到他，不构成永久漏放。
const AD_PROFILE_CACHE = new Map();
const AD_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const AD_PROFILE_CACHE_MAX = 2000;

function readAdProfileCache(userId) {
	const hit = AD_PROFILE_CACHE.get(String(userId));
	if (!hit) return null;
	if (Date.now() > hit.expiresAt) {
		AD_PROFILE_CACHE.delete(String(userId));
		return null;
	}
	// 返回副本：调用方会往 profile 上写 status，直接返回同一对象会把
	// A 群的 status 泄漏给 B 群的下一次命中。
	return { ...hit.profile };
}

// 清空资料缓存。测试里模拟「用户改了 bio」时必须调用 —— 否则拿到的是 5 分钟前的旧 bio，
// 整个「事后改简介」的场景就测不出来。生产里不需要主动调：TTL 到期自然刷新，
// 而闸三扫描的时间跨度（3 天起）远大于 5 分钟，不存在读到陈旧 bio 的实际风险。
function invalidateAdProfileCache(userId = null) {
	if (userId == null || userId === '') {
		AD_PROFILE_CACHE.clear();
		return;
	}
	AD_PROFILE_CACHE.delete(String(userId));
}

function writeAdProfileCache(userId, profile) {
	// 上限保护：Map 无界增长会在长生命周期实例里吃内存。命中即刷新，
	// 满了就丢最老的一个（Map 保持插入序），够用且无需额外结构。
	if (AD_PROFILE_CACHE.size >= AD_PROFILE_CACHE_MAX) {
		const oldest = AD_PROFILE_CACHE.keys().next();
		if (!oldest.done) AD_PROFILE_CACHE.delete(oldest.value);
	}
	AD_PROFILE_CACHE.set(String(userId), {
		profile: { firstName: profile.firstName, lastName: profile.lastName, username: profile.username, bio: profile.bio },
		expiresAt: Date.now() + AD_PROFILE_CACHE_TTL_MS
	});
}

async function fetchAdUserProfile(userId, fallback = {}) {
	const profile = {
		firstName: String(fallback.firstName ?? fallback.first_name ?? ''),
		lastName: String(fallback.lastName ?? fallback.last_name ?? ''),
		username: String(fallback.username ?? ''),
		bio: '',
		status: '',
		// bioFetched：这次到底有没有真的从 Telegram 拿到资料。
		// 调用方靠它决定要不要施加「无 emoji 且无 Bio」的减分 ——
		// 抓取失败时 bio 是空串，但含义是「不知道」，拿它减分会把真广告的分压下去。
		bioFetched: false
	};
	if (!BOT_TOKEN || !userId) return profile;
	const cached = readAdProfileCache(userId);
	// 缓存只在抓取成功时写入（见下方 writeAdProfileCache 的位置），
	// 所以命中缓存等价于「近 5 分钟内成功查过」，bioFetched 置真。
	if (cached) {
		cached.status = '';
		cached.bioFetched = true;
		return cached;
	}
	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: String(userId) })
		});
		const result = await response.json();
		const data = result?.result;
		if (result?.ok && data) {
			profile.firstName = String(data.first_name ?? profile.firstName);
			profile.lastName = String(data.last_name ?? profile.lastName);
			profile.username = String(data.username ?? profile.username);
			profile.bio = String(data.bio ?? data.description ?? '');
			profile.bioFetched = true;
			// 【写缓存必须在这个 if 内】。原先它在外面，于是 API 返回 ok:false
			// （最常见的就是 429 Too Many Requests）也会把一个空 bio 缓存 5 分钟 ——
			// 与上一行注释宣称的「失败不写缓存」自相矛盾，实际效果是撞限流之后
			// 整整 5 分钟按「此人没有简介」判定，正好放走那批只在 bio 里写广告的号。
			// 现在只有确实拿到资料才缓存，失败即刻可重试。
			writeAdProfileCache(userId, profile);
		} else if (!result?.ok) {
			console.log('[广告检测] getChat 失败 user=' + userId + ' : ' + (result?.description || 'unknown'));
		}
	} catch (error) {
		// 失败不写缓存：宁可下一条消息再试一次，也不要把空 bio 钉住 5 分钟。
		console.error('[广告检测] 抓取用户资料失败:', error);
	}
	return profile;
}

// 顺带取群内成员状态：restricted 是强信号（+5）。
async function fetchAdMemberStatus(chatId, userId) {
	if (!BOT_TOKEN || !chatId || !userId) return '';
	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: String(chatId), user_id: String(userId) })
		});
		const result = await response.json();
		return result?.ok ? String(result.result?.status || '') : '';
	} catch (error) {
		console.error('[广告检测] 查询成员状态失败:', error);
		return '';
	}
}

// 写入 / 更新观察窗口。达到观察分但未达封禁分的用户在此登记，
// 窗口期内再发广告消息即累加复判，窗口过期自动剪枝。
async function upsertAdScreening(env, userId, payload, config) {
	if (!(await adDetectionReady(env))) return false;
	try {
		const now = Math.floor(Date.now() / 1000);
		const expiresAt = now + config.observationHours * 3600;
		await env.DB.prepare(
			'INSERT INTO ad_user_screening (user_id, chat_id, score, reasons, snapshot, layer, joined_at, expires_at, updated_at) '
			+ 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET '
			+ 'chat_id = excluded.chat_id, score = MAX(ad_user_screening.score, excluded.score), '
			+ 'reasons = excluded.reasons, snapshot = excluded.snapshot, layer = excluded.layer, '
			+ 'expires_at = excluded.expires_at, updated_at = excluded.updated_at'
		).bind(
			String(userId), String(payload?.chatId ?? ''), Math.max(0, Number(payload?.score) || 0),
			JSON.stringify(payload?.reasons || []).slice(0, 2000),
			JSON.stringify(payload?.snapshot || {}).slice(0, 2000),
			String(payload?.layer || 'score'), now, expiresAt, now
		).run();
		return true;
	} catch (error) {
		console.error('[广告检测] 写入观察记录失败:', error);
		return false;
	}
}

async function readAdScreening(env, userId) {
	if (!(await adDetectionReady(env))) return null;
	try {
		const row = await env.DB.prepare(
			'SELECT user_id, chat_id, score, reasons, snapshot, layer, joined_at, expires_at FROM ad_user_screening WHERE user_id = ? AND expires_at > ?'
		).bind(String(userId), Math.floor(Date.now() / 1000)).first();
		if (!row) return null;
		let reasons = [];
		let snapshot = {};
		try { reasons = JSON.parse(String(row.reasons || '[]')); } catch { reasons = []; }
		try { snapshot = JSON.parse(String(row.snapshot || '{}')); } catch { snapshot = {}; }
		return {
			userId: String(row.user_id),
			chatId: String(row.chat_id || ''),
			score: Number(row.score) || 0,
			reasons: Array.isArray(reasons) ? reasons : [],
			snapshot: snapshot && typeof snapshot === 'object' ? snapshot : {},
			layer: String(row.layer || ''),
			joinedAt: Number(row.joined_at) || 0,
			expiresAt: Number(row.expires_at) || 0
		};
	} catch (error) {
		console.error('[广告检测] 读取观察记录失败:', error);
		return null;
	}
}

async function deleteAdScreening(env, userId) {
	if (!env?.DB) return;
	try {
		await env.DB.prepare('DELETE FROM ad_user_screening WHERE user_id = ?').bind(String(userId)).run();
	} catch (error) {
		console.error('[广告检测] 删除观察记录失败:', error);
	}
}

// 纯 D1 的过期数据剪枝：观察窗口、待确认快照、确认令牌三张表一起清。
// 没有 KV 的 TTL 能用，只能靠每次检测顺带清一次。
// === 发言者名册（方案 6 的两条轨道共用）===
// 每条群消息都会 upsert 一行。看似「每条消息一次 D1 写」很贵，但 D1 写在付费 Workers
// 上不是瓶颈（与 Telegram 的 429 相比可忽略），而这一行换来的是：
//   ① 消息路径能判断「这个人查过 bio 没有」，从而把 getChat 从「每条一次」压到「3 天一次」；
//   ② cron 有一份可枚举的名单 —— Bot API 【没有】列出群全部成员的方法，
//      getChatAdministrators 只给管理员，getChatMemberCount 只给人数，
//      所以想批量复查 bio，名单只能自己攒。
// upsert 里刻意【不覆盖 bio_checked_at】：那是轨一的冷却计时器，
// 发言本身不代表查过 bio，覆盖它会让冷却永远无法到期或反复重置。
// 同时顺手更新 first_name / last_name / username —— cron 扫描时要用它们做零成本预判，
// 而 cron 拿到的 getChat 结果本来也会带上，这里存一份是为了在 getChat 失败时仍有昵称可判。
async function upsertAdGroupMember(env, userId, chatId, from = null, nowSeconds = Math.floor(Date.now() / 1000)) {
	if (!env?.DB) return;
	const uid = String(userId || '');
	if (!uid) return;
	try {
		const now = Number(nowSeconds) || 0;
		await env.DB.prepare(
			'INSERT INTO ad_group_members (user_id, chat_id, first_name, last_name, username, first_seen, last_seen, bio_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0) '
			+ 'ON CONFLICT(user_id) DO UPDATE SET chat_id = excluded.chat_id, first_name = excluded.first_name, last_name = excluded.last_name, username = excluded.username, last_seen = excluded.last_seen'
		).bind(
			uid,
			chatId != null ? String(chatId) : '',
			from?.first_name ? String(from.first_name) : '',
			from?.last_name ? String(from.last_name) : '',
			from?.username ? String(from.username) : '',
			now,
			now
		).run();
	} catch (error) {
		console.error('[广告检测] 更新发言者名册失败:', error);
	}
}

// 读一行名册。返回 null 有两种含义（首次发言 / D1 出错），调用方【一律按「该查 bio」处理】：
// 宁可多花一次 getChat，也不要因为读不到台账就跳过 bio 检测 —— 那正是漏放的来源。
async function readAdGroupMember(env, userId) {
	if (!env?.DB) return null;
	const uid = String(userId || '');
	if (!uid) return null;
	try {
		const row = await env.DB.prepare('SELECT user_id, chat_id, first_name, last_name, username, first_seen, last_seen, bio_checked_at FROM ad_group_members WHERE user_id = ?').bind(uid).first();
		return row || null;
	} catch (error) {
		console.error('[广告检测] 读取发言者名册失败:', error);
		return null;
	}
}

// 标记「刚查过 bio」。轨一与轨二都调用它，共用同一个冷却计时器 ——
// 这样 cron 昨天刚扫过的人，今天发言不会再被查一次，两轨的配额互相抵扣而不是叠加。
async function markAdBioChecked(env, userId, nowSeconds = Math.floor(Date.now() / 1000)) {
	if (!env?.DB) return;
	const uid = String(userId || '');
	if (!uid) return;
	try {
		await env.DB.prepare('UPDATE ad_group_members SET bio_checked_at = ? WHERE user_id = ?').bind(Number(nowSeconds) || 0, uid).run();
	} catch (error) {
		console.error('[广告检测] 标记 bio 检查时间失败:', error);
	}
}

// 是否需要为这个人拉一次 bio。三种情况都要查：
//   ① 名册里没有他（首次发言，或 D1 读失败 —— 见 readAdGroupMember 的 fail-open 说明）；
//   ② bio_checked_at 为 0（从没查过）；
//   ③ 距上次查超过 AD_BIO_RECHECK_DAYS 天。
// 时间倒流（时钟回拨或数据被手改到未来）时 now - checked 为负，也判定为不查 —— 无所谓，
// cron 那一轨仍会按 bio_checked_at ASC 把他排到队首。
function shouldCheckAdBio(member, nowSeconds = Math.floor(Date.now() / 1000)) {
	if (!member) return true;
	const checked = Number(member.bio_checked_at) || 0;
	if (checked <= 0) return true;
	return (Number(nowSeconds) || 0) - checked >= AD_BIO_RECHECK_SECONDS;
}

// === 管理员列表缓存（仅供广告检测豁免使用）===
// 【为什么不直接给 checkIfUserIsAdminInGroup 加缓存】：那个函数同时是 /ban、/spam 的
// 鉴权入口。给它加 5 分钟缓存，等于让一个刚被撤职的管理员在 5 分钟内继续封人 ——
// 用性能优化换来一个提权窗口，不可接受。
// 所以缓存只做在广告检测这一侧：这里缓存过期的后果是「新任管理员被送去判定」，
// 而管理员资料干净、分数远低于观察线，判定结果仍是放行，最坏情况只是白算一次。
// 方向上是安全的（fail-safe 而非 fail-open），与鉴权路径的要求正好相反，故必须分开。
const AD_ADMIN_CACHE = new Map();

// 主动失效。【这不是可选的优化，是缓存能否成立的前提】：
// 测试暴露了一个真实缺口 —— 「刚被提为管理员的人在 5 分钟内失去豁免」。
// 我原先判断这个代价可以接受，理由是「管理员资料干净不会被封」，但那是错的：
// 管理员恰恰是最可能在群里【转发广告样本做说明】、贴可疑链接讲解的人，
// 那种消息的评分本来就高，豁免一失效就会把管理员自己封掉。
// 所以必须让缓存能被事件驱动地清掉 —— handleChatMemberUpdate 收到
// 管理员身份变更时立即调用，使新任/撤职都即时生效，而不是等 TTL 自然过期。
// 不传 chatId 时清空全部（供测试隔离场景，以及将来批量刷新场景使用）。
function invalidateAdAdminCache(chatId = null) {
	if (chatId == null || chatId === '') {
		AD_ADMIN_CACHE.clear();
		return;
	}
	AD_ADMIN_CACHE.delete(String(chatId));
}

async function isAdminForAdDetection(chatId, userId) {
	const chatKey = String(chatId || '');
	const uid = String(userId || '');
	if (!chatKey || !uid) return false;
	const hit = AD_ADMIN_CACHE.get(chatKey);
	if (hit && Date.now() <= hit.expiresAt) return hit.ids.has(uid);
	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatAdministrators`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: chatKey }),
		});
		const result = await response.json();
		if (!response.ok || !result.ok || !Array.isArray(result.result)) {
			// 【失败时不写缓存、且沿用旧缓存（哪怕已过期）】。
			// 撞 429 时如果直接返回 false，全群管理员的豁免会同时失效，
			// 他们发的每条消息都要走完整判定 —— 而管理员本来最可能在群里
			// 转发广告样本、贴可疑链接做说明，这些内容评分很高。
			// 宁可多信一份陈旧的管理员名单，也不要在 API 抖动时批量误伤管理员。
			console.log(`[广告检测] 群 ${chatKey} 管理员列表查询失败: ${result.description || `HTTP ${response.status}`}`);
			if (hit) return hit.ids.has(uid);
			return false;
		}
		const ids = new Set(result.result.map((member) => String(member?.user?.id || '')).filter(Boolean));
		AD_ADMIN_CACHE.set(chatKey, { ids, expiresAt: Date.now() + AD_ADMIN_CACHE_TTL_MS });
		return ids.has(uid);
	} catch (error) {
		console.error(`[广告检测] 群 ${chatKey} 管理员列表查询异常:`, error);
		if (hit) return hit.ids.has(uid);
		return false;
	}
}

// === 闸三 · 定时滚动复查（cron）===
// 存在的理由只有一个：闸一闸二都发生在【发言的那一刻】，而广告号的标准玩法是
// 先用干净资料混进来、发几句正常话过检，事后再把 bio 改成广告 —— 从此不再发言，
// 消息路径永远不会被触发，他就永久隐身。这一闸把「曾经发言过的人」按
// bio_checked_at 升序滚动重查，把那个时间差补掉。
//
// 【为什么名单只能来自自建表】：Bot API 没有列出群全部成员的方法。
// getChatAdministrators 只返回管理员，getChatMemberCount 只返回一个数字。
// 因此「部署后从未发过一句话的潜伏号」任何方案都枚举不到 —— 这是 API 的边界，
// 不是本方案的缺口，换任何实现都一样。名册覆盖的是「发言过的所有人」。

async function readAdScanState(env, key, fallback = '') {
	if (!env?.DB) return fallback;
	try {
		const row = await env.DB.prepare('SELECT value FROM ad_scan_state WHERE key = ?').bind(String(key)).first();
		return row?.value != null ? String(row.value) : fallback;
	} catch (error) {
		console.error('[广告检测] 读取扫描状态失败:', error);
		return fallback;
	}
}

async function writeAdScanState(env, key, value, nowSeconds = Math.floor(Date.now() / 1000)) {
	if (!env?.DB) return;
	try {
		await env.DB.prepare(
			'INSERT INTO ad_scan_state (key, value, updated_at) VALUES (?, ?, ?) '
			+ 'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
		).bind(String(key), String(value), Number(nowSeconds) || 0).run();
	} catch (error) {
		console.error('[广告检测] 写入扫描状态失败:', error);
	}
}

// 取下一批待复查的人。排序键是 bio_checked_at ASC —— 「最久没查过的排最前」。
// 【这就是游标本身，不需要另存偏移量】：查完就把 bio_checked_at 推到现在，
// 他自动落到队尾，下一批自然取到别人。这个自平衡的性质意味着增删行、
// 跨天中断、Worker 重启都不会让扫描错位或重复，比显式 offset 游标健壮得多。
// 排除已在黑名单里的人：已经封掉了，再查 bio 纯属浪费配额。
async function loadAdRescanBatch(env, limit, nowSeconds = Math.floor(Date.now() / 1000)) {
	if (!env?.DB) return [];
	try {
		const rows = await env.DB.prepare(
			'SELECT m.user_id, m.chat_id, m.first_name, m.last_name, m.username, m.bio_checked_at '
			+ 'FROM ad_group_members m LEFT JOIN blacklist b ON b.id = m.user_id '
			+ 'WHERE b.id IS NULL AND m.bio_checked_at <= ? '
			+ 'ORDER BY m.bio_checked_at ASC LIMIT ?'
		).bind((Number(nowSeconds) || 0) - AD_BIO_RECHECK_SECONDS, Math.max(1, Number(limit) || 1)).all();
		return Array.isArray(rows?.results) ? rows.results : [];
	} catch (error) {
		console.error('[广告检测] 读取待复查名单失败:', error);
		return [];
	}
}

// 复查一个人。与消息路径共用【同一个】evaluateAdSuspect 和【同一套】阈值 ——
// 刻意不为定时扫描另设更松或更严的标准：两条路径判出不同结果会让 /ignore 的
// 白名单效果只在一条路径上生效，是维护噩梦。
// 差别只在输入：这里没有消息正文和转发来源（他没在发言），所以判据是昵称 + 用户名 + bio
// 加上指纹库与 AI 语义。这正好对准「改了 bio 的潜伏号」。
async function rescanAdMember(env, row, options = {}) {
	const userId = String(row?.user_id || '');
	if (!userId) return { scanned: false, banned: false };
	const chatId = String(row?.chat_id || '');
	const nowSeconds = Math.floor(Date.now() / 1000);

	// 主人/副主人/超管永不判定，与消息路径一致。
	if (isPrivilegedManager(userId)) {
		await markAdBioChecked(env, userId, nowSeconds);
		return { scanned: false, banned: false, reason: 'privileged' };
	}
	// 管理员兜底豁免。消息路径在豁免后就不写名册，所以名册里的管理员只能来自
	// 「先以普通成员发言、之后才被提为管理员」。缓存命中时这一步接近零成本。
	if (chatId && await isAdminForAdDetection(chatId, userId)) {
		await markAdBioChecked(env, userId, nowSeconds);
		return { scanned: false, banned: false, reason: 'admin' };
	}

	const profile = await fetchAdUserProfile(userId, {
		first_name: row?.first_name || '',
		last_name: row?.last_name || '',
		username: row?.username || ''
	});
	// 无论成功失败都记时间戳：失败多半是 429，卡在同一个人身上重试会拖垮整批，
	// 而他只是排到队尾，下一轮还会被取到，不会永久漏掉。
	await markAdBioChecked(env, userId, nowSeconds);
	if (!profile.bioFetched) return { scanned: true, banned: false, reason: 'fetch_failed' };

	const evaluation = await evaluateAdSuspect(
		env,
		{ profile, text: '', forwardChat: null },
		{ config: options.config, whitelist: options.whitelist, skipMissingBioPenalty: false }
	);
	if (evaluation.verdict !== 'ban') {
		// 【不写观察记录】。观察窗口的语义是「短期内再有动作就合并裁决」，
		// 而这一轨扫的正是不发言的人 —— 给他们写观察记录只会让 ad_user_screening
		// 被 300 条/天的扫描结果灌满，把真正需要盯的新入群用户挤掉。
		return { scanned: true, banned: false };
	}

	const result = await enforceAdDetection(env, {
		userId,
		chatId,
		chatTitle: '',
		messageId: null
	}, evaluation, { config: options.config, whitelist: options.whitelist });
	console.log('[广告检测·扫描] 封禁 user=' + userId + ' score=' + evaluation.score + '/' + evaluation.threshold);
	return { scanned: true, banned: result?.banned !== false, seq: result?.seq ?? null };
}

// 一次 cron 触发扫多少：AD_SCAN_DAILY_LIMIT 个，切成 AD_SCAN_BATCH_SIZE 一批，
// 批间隔 AD_SCAN_BATCH_INTERVAL_MS。
// 分批 + 间隔的唯一目的是【不撞 Telegram 的 429】：300 次 getChat 一口气发出去
// 必然限流，摊到 30 秒里约 10 req/s，离全局约 30 req/s 有足够余量，
// 也给同一时刻正常收发消息的路径留出配额。
// 当日计数存 D1 并按日期戳跨天重置，这样即便 cron 配成一天多次，总量也不会超。
async function runAdBioRescan(env, options = {}) {
	if (!env?.DB) return { scanned: 0, banned: 0, skipped: 'no_db' };
	if (!(await adDetectionReady(env))) return { scanned: 0, banned: 0, skipped: 'not_ready' };

	const config = loadAdDetectionConfig(env);
	if (config.enabled === false) return { scanned: 0, banned: 0, skipped: 'disabled' };
	const whitelist = await loadAdDomainWhitelist(env);

	const nowSeconds = Math.floor(Date.now() / 1000);
	// 日期戳用 UTC 日期字符串，不用「除以 86400」—— 后者在跨月上也没错，
	// 但排障时看不出是哪一天；YYYY-MM-DD 可以直接对着日志读。
	const today = new Date(nowSeconds * 1000).toISOString().slice(0, 10);
	const savedDay = await readAdScanState(env, 'scan_day', '');
	const done = savedDay === today ? (Number(await readAdScanState(env, 'scan_count', '0')) || 0) : 0;
	if (savedDay !== today) await writeAdScanState(env, 'scan_day', today, nowSeconds);

	const dailyLimit = Number(options.dailyLimit) > 0 ? Number(options.dailyLimit) : AD_SCAN_DAILY_LIMIT;
	const batchSize = Number(options.batchSize) > 0 ? Number(options.batchSize) : AD_SCAN_BATCH_SIZE;
	const intervalMs = Number(options.intervalMs) >= 0 ? Number(options.intervalMs) : AD_SCAN_BATCH_INTERVAL_MS;
	let remaining = dailyLimit - done;
	if (remaining <= 0) return { scanned: 0, banned: 0, skipped: 'daily_limit_reached', done };

	let scanned = 0;
	let banned = 0;
	let batches = 0;
	while (remaining > 0) {
		const take = Math.min(batchSize, remaining);
		const rows = await loadAdRescanBatch(env, take, Math.floor(Date.now() / 1000));
		// 名单取空说明【所有人都在冷却期内】—— 不是出错，是已经全部查过了。
		// 直接收工，剩余配额不结转（明天会有新的），也不空转浪费 CPU。
		if (!rows.length) break;
		batches += 1;
		for (const row of rows) {
			try {
				const outcome = await rescanAdMember(env, row, { config, whitelist });
				if (outcome.scanned) scanned += 1;
				if (outcome.banned) banned += 1;
			} catch (error) {
				// 单个人出错不能中断整批：否则一个坏数据就能让扫描永久停在同一位置。
				// markAdBioChecked 已在 rescanAdMember 内先行执行，他仍会排到队尾。
				console.error('[广告检测·扫描] 处理 user=' + row?.user_id + ' 失败:', error);
			}
			remaining -= 1;
			if (remaining <= 0) break;
		}
		await writeAdScanState(env, 'scan_count', String(done + scanned), Math.floor(Date.now() / 1000));
		// 最后一批之后不必再等 —— 那 3 秒纯粹浪费 cron 的运行时长。
		if (remaining > 0 && intervalMs > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}

	await writeAdScanState(env, 'scan_count', String(done + scanned), Math.floor(Date.now() / 1000));
	console.log('[广告检测·扫描] 本轮完成 批次=' + batches + ' 复查=' + scanned + ' 封禁=' + banned + ' 当日累计=' + (done + scanned) + '/' + dailyLimit);
	return { scanned, banned, batches, done: done + scanned, dailyLimit };
}

async function pruneAdDetectionData(env, nowSeconds = Math.floor(Date.now() / 1000)) {
	if (!env?.DB) return;
	try {
		if (!(await adDetectionReady(env))) return;
		const now = Number(nowSeconds) || 0;
		await env.DB.batch([
			env.DB.prepare('DELETE FROM ad_user_screening WHERE expires_at < ?').bind(now),
			env.DB.prepare('DELETE FROM ad_user_screening WHERE joined_at < ?').bind(now - AD_SCREENING_RETENTION_SECONDS),
			// 【ad_pending_snapshots 刻意不剪枝】（2026-09-08）主人要求快照长期保留，
			// 而且这些行还承担「占住序号防止复用」的职责 —— 删掉任何一行都会让
			// MAX(seq) 回退，下一个新快照重发旧序号，主人照旧通知回滚就解封错人。
			// 行数不是问题：一天 50 个号、单条 4~5 KB，一年约 90 MB。
			// 详见 allocateAdPendingSnapshot 与 deleteAdPendingSnapshot 的说明。
			env.DB.prepare('DELETE FROM ad_confirm_tokens WHERE expires_at < ?').bind(now),
			// 名册按「最后发言时间」剪枝，不按 first_seen —— 老成员只要还在说话就该留着。
			// 超期的大概率已退群，删掉是为了不让他们白占每天 300 个的扫描配额。
			// 误删的代价极小：本人下次发言会立刻重新 upsert，并因 bio_checked_at 归零而被查一次 bio。
			env.DB.prepare('DELETE FROM ad_group_members WHERE last_seen < ?').bind(now - AD_MEMBER_RETENTION_SECONDS)
		]);
	} catch (error) {
		console.error('[广告检测] 清理过期数据失败:', error);
	}
}

// === 待确认快照（纯 D1 替代 KV）===
// 广告判定命中后把现场快照按序号写入 D1，推私聊给第一主人；主人用 /ignore <序号> 标误判回滚。
//
// 【2026-09-08 序号改成单调递增、永不复用】原实现是 seq = MAX(seq) + 1，超过
// AD_PENDING_MAX_LIMIT（50）回绕到 1 并 DELETE 掉旧的同序号行。那套机制有一个会
// 【解封错人】的隐患：MAX(seq) 会随着行被删除而回退 —— 过期剪枝删掉高序号、
// 或者 /ignore 刚好处理掉当前最大序号，下一个新快照就会拿到一个主人手上还留着的旧序号，
// 主人照着旧通知发 /ignore 就解封了另一个人。1 小时 TTL 让这个窗口很窄，
// 一旦按主人要求改成长期保留就立刻暴露，所以这两件事必须一起改。
//
// 新机制靠「行永不物理删除」保证 MAX(seq) 单调：
//   · 新快照 expires_at = now + 100 年；
//   · 复核完毕（/ignore、/unban）把 expires_at 置 0，行留着占住序号；
//   · pruneAdDetectionData 不再 DELETE 这张表。
async function allocateAdPendingSnapshot(env, ownerId, payload) {
	if (!(await adDetectionReady(env))) return null;
	try {
		const now = Math.floor(Date.now() / 1000);
		const owner = String(ownerId);
		// 不带 expires_at 条件：已复核的行（expires_at = 0）也要参与取最大值，
		// 否则它们占住的序号会被重新发出去，等于没改。
		const maxRow = await env.DB.prepare('SELECT MAX(seq) AS m FROM ad_pending_snapshots WHERE owner_id = ?').bind(owner).first();
		const seq = (Number(maxRow?.m) || 0) + 1;
		await env.DB.prepare(
			'INSERT INTO ad_pending_snapshots (owner_id, seq, user_id, chat_id, score, reasons, snapshot, created_at, expires_at) '
			+ 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
		).bind(
			owner, seq, String(payload?.userId ?? ''), String(payload?.chatId ?? ''),
			Math.max(0, Number(payload?.score) || 0),
			JSON.stringify(payload?.reasons || []).slice(0, 2000),
			JSON.stringify(payload?.snapshot || {}).slice(0, 2000),
			now, now + AD_PENDING_SNAPSHOT_TTL_SECONDS
		).run();
		return seq;
	} catch (error) {
		console.error('[广告检测] 写入待确认快照失败:', error);
		return null;
	}
}

async function readAdPendingSnapshot(env, ownerId, seq) {
	if (!(await adDetectionReady(env))) return null;
	try {
		const row = await env.DB.prepare(
			'SELECT seq, user_id, chat_id, score, reasons, snapshot, created_at FROM ad_pending_snapshots WHERE owner_id = ? AND seq = ? AND expires_at > ?'
		).bind(String(ownerId), Number(seq) || 0, Math.floor(Date.now() / 1000)).first();
		if (!row) return null;
		let reasons = [];
		let snapshot = {};
		try { reasons = JSON.parse(String(row.reasons || '[]')); } catch { reasons = []; }
		try { snapshot = JSON.parse(String(row.snapshot || '{}')); } catch { snapshot = {}; }
		return {
			seq: Number(row.seq) || 0,
			userId: String(row.user_id || ''),
			chatId: String(row.chat_id || ''),
			score: Number(row.score) || 0,
			reasons: Array.isArray(reasons) ? reasons : [],
			snapshot: snapshot && typeof snapshot === 'object' ? snapshot : {},
			createdAt: Number(row.created_at) || 0
		};
	} catch (error) {
		console.error('[广告检测] 读取待确认快照失败:', error);
		return null;
	}
}

async function listAdPendingSnapshots(env, ownerId, limit = AD_PENDING_DEFAULT_LIMIT) {
	if (!(await adDetectionReady(env))) return { ok: false, rows: [], total: 0 };
	const capped = Math.min(AD_PENDING_MAX_LIMIT, Math.max(1, Number(limit) || AD_PENDING_DEFAULT_LIMIT));
	try {
		const now = Math.floor(Date.now() / 1000);
		const totalRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE owner_id = ? AND expires_at > ?')
			.bind(String(ownerId), now).first();
		const { results } = await env.DB.prepare(
			'SELECT seq, user_id, chat_id, score, reasons, snapshot, created_at FROM ad_pending_snapshots '
			// 【2026-09-08 从 seq ASC 改成 seq DESC】配套快照长期保留：
			// 序号现在单调递增不回绕，ASC + LIMIT 会让 /pending 永远停在最早那批，
			// 新封的号根本翻不到 —— 而主人要复核的恰恰是刚封的。改成最新在前。
			+ 'WHERE owner_id = ? AND expires_at > ? ORDER BY seq DESC LIMIT ?'
		).bind(String(ownerId), now, capped).all();
		const rows = (results || []).map((row) => {
			let reasons = [];
			let snapshot = {};
			try { reasons = JSON.parse(String(row.reasons || '[]')); } catch { reasons = []; }
			try { snapshot = JSON.parse(String(row.snapshot || '{}')); } catch { snapshot = {}; }
			return {
				seq: Number(row.seq) || 0,
				userId: String(row.user_id || ''),
				chatId: String(row.chat_id || ''),
				score: Number(row.score) || 0,
				reasons: Array.isArray(reasons) ? reasons : [],
				snapshot: snapshot && typeof snapshot === 'object' ? snapshot : {},
				createdAt: Number(row.created_at) || 0
			};
		});
		return { ok: true, rows, total: Number(totalRow?.c) || 0 };
	} catch (error) {
		console.error('[广告检测] 列出待确认快照失败:', error);
		return { ok: false, rows: [], total: 0 };
	}
}

// 复核完毕后把快照标记为已处理（不物理删除）。
//
// 【为什么不 DELETE】seq 是 MAX(seq) + 1 推出来的，行一删 MAX 就回退，
// 下一个新快照会重发一个主人手上还留着的旧序号 —— 主人照旧通知发 /ignore 会解封错人。
// 置 expires_at = 0 之后：行留在表里继续占住序号，而 readAdPendingSnapshot 与
// listAdPendingSnapshots 的既有 expires_at > now 条件天然把它排除，
// 对外表现和删掉完全一样。详见 allocateAdPendingSnapshot 的说明。
async function deleteAdPendingSnapshot(env, ownerId, seq) {
	if (!env?.DB) return false;
	try {
		const result = await env.DB.prepare('UPDATE ad_pending_snapshots SET expires_at = 0 WHERE owner_id = ? AND seq = ? AND expires_at > 0')
			.bind(String(ownerId), Number(seq) || 0).run();
		return Number(result?.meta?.changes || 0) > 0;
	} catch (error) {
		console.error('[广告检测] 标记待确认快照已处理失败:', error);
		return false;
	}
}

// === 二次确认令牌（纯 D1 替代 KV，60 秒有效）===
async function issueAdConfirmToken(env, action, userId, payloadObject) {
	if (!(await adDetectionReady(env))) return null;
	try {
		const now = Math.floor(Date.now() / 1000);
		const token = adTextHash(String(action) + ':' + String(userId) + ':' + now + ':' + Math.random());
		await env.DB.prepare(
			'INSERT INTO ad_confirm_tokens (token, action, payload, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
		).bind(
			token, String(action), JSON.stringify(payloadObject || {}).slice(0, 1000),
			String(userId), now, now + AD_CONFIRM_TOKEN_TTL_SECONDS
		).run();
		return token;
	} catch (error) {
		console.error('[广告检测] 签发确认令牌失败:', error);
		return null;
	}
}

// 消费令牌：一次性，读取即删除，避免重复执行破坏性操作。
async function consumeAdConfirmToken(env, token, action, userId) {
	if (!(await adDetectionReady(env))) return null;
	try {
		const row = await env.DB.prepare(
			'SELECT token, action, payload, user_id, expires_at FROM ad_confirm_tokens WHERE token = ?'
		).bind(String(token)).first();
		if (!row) return null;
		await env.DB.prepare('DELETE FROM ad_confirm_tokens WHERE token = ?').bind(String(token)).run();
		if (String(row.action) !== String(action)) return null;
		if (String(row.user_id) !== String(userId)) return null;
		if ((Number(row.expires_at) || 0) <= Math.floor(Date.now() / 1000)) return null;
		let payload = {};
		try { payload = JSON.parse(String(row.payload || '{}')); } catch { payload = {}; }
		return { action: String(row.action), payload };
	} catch (error) {
		console.error('[广告检测] 校验确认令牌失败:', error);
		return null;
	}
}

// === 三层合并判定 ===
// 判定顺序：结构化评分 → 指纹库 → AI 语义。任一层给出硬命中即判广告；
// AI 软命中（0.65 ≤ 相似度 < 阈值）只加 2 分，交给总分裁决，避免语义层单独误杀。
async function evaluateAdSuspect(env, input, options = {}) {
	const config = options.config || loadAdDetectionConfig(env);
	const whitelist = options.whitelist instanceof Set ? options.whitelist : await loadAdDomainWhitelist(env);

	const profile = input?.profile || {};
	const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
	const text = String(input?.text ?? '').trim();
	// 引用体正文。调用方不传就是空串 —— cron 那一轨没有消息上下文，天然没有引用体。
	const quotedText = String(input?.quotedText ?? '').trim();

	// skipMissingBioPenalty 透传：调用方明确知道「这次没查 bio」时置真，
	// 避免把「未知的 bio」当成「空的 bio」拿去减分。详见 scoreAdProfile 内该项的说明。
	const profileResult = scoreAdProfile(profile, { whitelist, skipMissingBioPenalty: options.skipMissingBioPenalty === true });
	const textResult = text ? scoreAdMessageText(text, { whitelist }) : { score: 0, reasons: [], tradeHits: [], businessHits: [] };
	const forwardResult = input?.forwardChat ? scoreAdForwardChat(input.forwardChat) : { score: 0, reasons: [], isAd: false };
	// 上下文判据（极短正文 + 转发来源同现）。
	// 【2026-09-08 起这两条恒为 0 分】—— AD_FORWARD_JUDGE_ENABLED 已按主人要求关闭整个
	// 频道 / 群组维度。调用保留是为了让开关能一处生效、不必再改本函数。
	const contextResult = scoreAdMessageContext(text, input?.forwardChat || null);

	// behaviorScore：本次这条消息【自身】贡献的分数（正文 + 上下文判据 + 转发来源）。
	// 严格排除静态资料分（昵称 / username / bio）、指纹分与 AI 语义分 ——
	// 后三者都可能完全来自资料卡，而资料卡是恒定的：同一份 bio 会在这个人发的
	// 每一条消息上被重算一遍，用它当「新证据」等于把一份证据用到无限次。
	// 两处用途：① 观察窗口历史分是否参与裁决（detectAdOnMessage 的 applyHistory）；
	//          ② 观察记录里【只存这一份】（retainScore），根治 double counting。
	const behaviorScore = textResult.score + contextResult.score
		+ (forwardResult.isAd ? forwardResult.score : 0);

	let score = profileResult.score + textResult.score + contextResult.score
		+ (forwardResult.isAd ? forwardResult.score : 0);
	const reasons = [...profileResult.reasons, ...textResult.reasons, ...contextResult.reasons];
	if (forwardResult.isAd) reasons.push(...forwardResult.reasons);
	let layer = 'score';

	const payload = {
		name: displayName,
		username: profile.username ? '@' + String(profile.username).replace(/^@/, '') : '',
		bio: profile.bio || '',
		text,
		// 引用体正文（他引用/回复的那条别人的消息）。只喂给 quoted 通道做布尔判定，
		// 【刻意不进 domains、不进 semanticText、不进指纹学习】—— 那段文字不是他写的，
		// 拿它去学指纹等于把别人的话记成他的特征，也会污染 AI 语义样本库。
		quoted: quotedText,
		domains: extractAdDomains([displayName, profile.bio, text].filter(Boolean).join('\n'))
	};

	const fingerprint = await matchAdFingerprints(env, payload, { config });
	if (fingerprint.hits.length) {
		score += fingerprint.score;
		layer = 'fingerprint';
		reasons.push('+' + fingerprint.score + ' 指纹库命中：' + fingerprint.hits.slice(0, 3).map((h) => h.value).join(' / '));
	}
	// 【P1 单词不封（2026-09-09 主人下令）】USDT 单个出现无法区分正常聊天与广告，
	// 正常用户也会聊「USDT 今天价格不错」。所以指纹级封禁必须由【非单业务词】命中构成：
	// 裸业务词指纹（usdt / 价格表 / 代练…）命中只加分，不单独定罪。
	// 组合广告词（如「收购 USDT 秒结」）由结构通道「招揽∧行业」兜底封禁，不依赖这才这里放。
	const fingerprintBan = fingerprint.hits.length > 0
		&& fingerprint.nonSingleMaxWeight >= AD_FINGERPRINT_BAN_WEIGHT;

	let ai = { available: false, similarity: 0, sample: null, isMatch: false, isSoft: false };
	// 【检测端与学习端共用同一个拼装函数】原来这里手写 join，与 buildAdSampleText 拼法碰巧一致
	// 靠的是两处各自维护 —— 一改就会分叉。2026-09-09 加链接归一化时正式收敛到一处：
	// payload 的 name / bio / text 与 buildAdSampleText 取的三个字段完全对应，
	// 换成函数调用后行为与改动前唯一的差别就是「URL 被换成语义占位符」，
	// 这也正是要的效果 —— 比对时剥链接、学习时也剥链接，两边看到的是同一种文本。
	const semanticText = buildAdSampleText(payload);
	if (config.aiEnabled && semanticText.length >= 6) {
		ai = await checkAdAiSimilarity(env, semanticText, { config });
		if (ai.isMatch) {
			layer = 'ai';
			reasons.push('AI 语义相似度 ' + ai.similarity.toFixed(3) + ' ≥ 阈值 ' + config.aiSimilarityThreshold);
		} else if (ai.isSoft) {
			score += AD_AI_SOFT_BONUS_SCORE;
			reasons.push('+' + AD_AI_SOFT_BONUS_SCORE + ' AI 语义弱相似 ' + ai.similarity.toFixed(3));
		}
	}

	// ===== 四通道结构查杀 =====
	// 放在最后：前面几层的 reasons 已采集完，这里只叠加「是否直接定罪」。
	// 刻意【不加分】—— 结构查杀是布尔判定，不是评分项。给它加分会污染 behaviorScore
	// 与观察窗口历史分的语义（那两处衡量的都是「本次消息贡献了多少新证据」）。
	// 四条通道短路求值，命中即止，定罪结论一样：
	//   card     昵称 + @handle + 简介，两类同现（证据最全，优先）
	//   identity 昵称 + 简介，单类命中即封（2026-09-08 主人新增，只认强构词模式）
	//   body     简介 + 本条正文，两类同现（资料卡侥幸过关的在这里收网）
	//   quoted   引用体正文，两类同现 + 本人正文近乎为空且非举报语义（2026-09-08 新增）
	// identity 排在 card 之后：两者判定域重叠，card 命中时 reasons 更具体（带形态 A/B），
	// 没必要再跑一遍单类判据；card 不中才轮到 identity 用更宽的门槛兜。
	// quoted 排在最后：它的判定域（别人写的那段话）与前三条完全不重叠，是纯增量的一路，
	// 而且门槛最特殊（要求本人正文近乎为空），前三条任一命中就没必要再看引用体。
	let structure = { guilty: false, channel: '', form: '', reasons: [] };
	if (config.structureKill !== 'off') {
		const card = judgeAdProfileCard(payload);
		if (card.guilty) {
			structure = card;
		} else {
			const identity = judgeAdIdentityKill(payload);
			if (identity.guilty) {
				structure = identity;
			} else {
				const body = judgeAdBodyWithBio(payload);
				structure = body.guilty ? body : judgeAdQuotedKill(payload);
				// 引用体查杀被门槛二 / 豁免词放行时留一行记录 —— 主人复核时要能看出
				// 「引用的确实是广告，但本人是在举报」，否则这条放行路径完全不可观测。
				if (!structure.guilty && structure.reasons.length) reasons.push(...structure.reasons);
			}
			// 身份查杀被豁免词放行时也留一行记录 —— 主人复核误封/漏放时要能看出
			// 「命中过、被豁免词赦免了」，否则这条路径完全不可观测。
			if (!structure.guilty && identity.reasons.length) reasons.push(...identity.reasons);
		}
		if (structure.guilty) reasons.push(...structure.reasons);
	}
	const structureBan = structure.guilty && config.structureKill === 'ban';

	const hardHit = fingerprintBan || Boolean(ai.isMatch) || structureBan;
	const verdict = (score >= config.scoreThreshold || hardHit)
		? 'ban'
		// observe 模式下的结构命中不封，但必须留观察记录 + 推快照给主人人工过目，
		// 否则这个模式就只是「静默放过」，起不到看误伤面的作用。
		: ((structure.guilty || score >= config.observationScore) ? 'observe' : 'pass');

	return {
		verdict,
		score,
		layer: structureBan ? structure.channel
			: (hardHit ? (ai.isMatch ? 'ai' : 'fingerprint')
				: (structure.guilty ? structure.channel : layer)),
		reasons,
		threshold: config.scoreThreshold,
		fingerprintHits: fingerprint.hits,
		// 结构查杀结论透传给处置端。用途：命中即自动学指纹 ——
		// 这类号是批量注册的，昵称与 bio 高度雷同，学一次之后同款走指纹层直接命中，
		// 不必每条消息都重跑结构判定。
		structure,
		behaviorScore,
		// retainScore：写进 ad_user_screening.score 的值，【只含行为分，不含静态资料分】。
		// 这是 double counting 的根治点：旧代码存的是 evaluation.score（总分，含 bio / username /
		// 昵称这些恒定项），下次评分又把同一份资料从头算一遍，等于一份证据算两次；
		// 再叠上 score = MAX(旧, 新) 与每次 upsert 都刷新 expires_at，一个人被判过一次 observe
		// 就几乎不可能再降下来 —— @MiLov1900 两次被误封的根本原因。
		// 夹到 >= 0：负分没有留存意义（观察记录只表达「累积了多少可疑行为」）。
		retainScore: Math.max(0, behaviorScore),
		aiSimilarity: ai.similarity,
		aiSample: ai.sample,
		payload,
		// bioChecked 区分「查过 bio 且为空」与「本次没查 bio」。
		// 这两者在 snapshot.bio 里长得一模一样（都是空串），但对人的意义完全不同：
		// 主人拿到通知要决定「放着不动」还是 /ignore 回滚，看到「简介为空」会以为已经核过了。
		// 通知渲染据此写明「未查询」，避免误导。
		bioChecked: options.skipMissingBioPenalty !== true,
		snapshot: {
			name: displayName.slice(0, 120),
			username: payload.username.slice(0, 40),
			bio: String(profile.bio || '').slice(0, 200),
			text: text.slice(0, 300),
			status: String(profile.status || ''),
			forwardTitle: String(input?.forwardChat?.title || '').slice(0, 120)
		}
	};
}

const AD_LAYER_LABELS = {
	score: '结构化评分', fingerprint: '指纹库', ai: 'AI 语义',
	card: '资料卡查杀（用户名+简介）', body: '正文查杀（简介+正文）'
};

// 渲染推送给第一主人的判定通知。序号是 /ignore 的唯一入口。
function renderAdDetectionNotice(evaluation, context) {
	const lines = [];
	lines.push('<b>🚫 广告号自动封禁</b>');
	if (context?.seq) lines.push('快照序号：<b>#' + context.seq + '</b>');
	lines.push('用户：<code>' + escapeHtml(String(context?.userId || '')) + '</code>');
	if (evaluation.snapshot.name) lines.push('名称：' + escapeHtml(evaluation.snapshot.name));
	if (evaluation.snapshot.username) lines.push('用户名：' + escapeHtml(evaluation.snapshot.username));
	// 简介三态，缺一不可：有内容 / 查过但为空 / 本次没查。
	// 旧写法只在有内容时显示，后两种都渲染成「没有这一行」—— 主人无法判断
	// 「这个号确实没写简介」还是「简介根本没看过」，而这直接影响他要不要发 /ignore 回滚。
	if (evaluation.snapshot.bio) lines.push('简介：' + escapeHtml(evaluation.snapshot.bio));
	else if (evaluation.bioChecked === false) lines.push('简介：（本次未查询 —— 昵称/正文/转发已够封禁线，无需再拉资料）');
	else lines.push('简介：（空）');
	if (evaluation.snapshot.text) lines.push('消息：' + escapeHtml(evaluation.snapshot.text));
	if (evaluation.snapshot.forwardTitle) lines.push('转发来源：' + escapeHtml(evaluation.snapshot.forwardTitle));
	// 群内身份同理。热路径已不查 getChatMember（restricted 归零后它不再影响判定），
	// 空值一律是「未查询」而不是「查不到」，写明白以免被当成账号异常的证据。
	lines.push('群内身份：' + (evaluation.snapshot.status ? escapeHtml(String(evaluation.snapshot.status)) : '未查询（不影响判定：受限状态已不计分）'));
	if (context?.chatTitle) lines.push('来源群组：' + escapeHtml(String(context.chatTitle)));
	lines.push('判定层：' + (AD_LAYER_LABELS[evaluation.layer] || evaluation.layer));
	lines.push('得分：<b>' + evaluation.score + '</b> / 阈值 ' + evaluation.threshold);
	if (evaluation.aiSimilarity > 0) lines.push('语义相似度：' + evaluation.aiSimilarity.toFixed(3));
	if (evaluation.reasons.length) {
		lines.push('判定依据：');
		for (const reason of evaluation.reasons.slice(0, 10)) lines.push('· ' + escapeHtml(String(reason)));
	}
	if (context?.banSummary) lines.push('封禁结果：' + escapeHtml(String(context.banSummary)));
	if (context?.seq) {
		lines.push('');
		// 判定正确不给出口：指纹与 AI 样本已在 enforceAdDetection 里自动学入，
		// 主人【什么都不用做】。/confirm 已于 2026-09-08 删除。
		lines.push('判定正确：无需任何操作（已自动学入指纹与 AI 样本）');
		lines.push('判定错误并解封：/ignore ' + context.seq);
	}
	return lines.join('\n');
}

// === 处置执行 ===
// 判定为广告后的统一处置链：加黑 → 全群封禁 → 删触发消息 → 自动学指纹 → 存快照 → 推私聊 → 清观察记录。
// 每一步独立容错：加黑失败仍继续封禁，封禁部分失败仍推送通知，
// 保证主人一定能看到现场快照并可用 /ignore <序号> 一键回滚。
async function enforceAdDetection(env, input, evaluation, options = {}) {
	const userId = String(input?.userId ?? '');
	const chatId = input?.chatId != null ? String(input.chatId) : '';
	if (!userId) return { banned: false, seq: null, reason: 'no_user' };

	const noteParts = [
		'广告自动判定',
		AD_LAYER_LABELS[evaluation.layer] || evaluation.layer,
		'得分 ' + evaluation.score + '/' + evaluation.threshold
	];
	if (evaluation.aiSimilarity > 0) noteParts.push('相似度 ' + evaluation.aiSimilarity.toFixed(3));
	const note = noteParts.join(' | ').slice(0, 200);

	let blacklistCode = 'SKIPPED';
	try {
		const added = await addToBlacklist(userId, env, { reason: 'ad_auto', by: 'system', note });
		blacklistCode = String(added?.code || (added?.success ? 'ADDED' : 'ERROR'));
	} catch (error) {
		console.error('[广告检测] 加入黑名单失败:', error);
		blacklistCode = 'ERROR';
	}

	let banResults = [];
	try {
		banResults = await banUserFromAllGroups(userId, { probeMembership: true, revokeMessages: true });
	} catch (error) {
		console.error('[广告检测] 全群封禁失败:', error);
	}
	const okCount = banResults.filter((r) => r.ok).length;
	const failedBans = banResults.filter((r) => !r.ok);
	let banSummary = okCount + '/' + banResults.length + ' 个群成功';
	if (failedBans.length) {
		banSummary += '；失败群：' + failedBans.slice(0, 3)
			.map((r) => r.groupId + '(' + (r.error || '未知') + ')')
			.join('、');
	}

	// 触发消息再单独删一次：revoke_messages 只对该群自己生效，服务消息也偶发残留。
	if (chatId && input?.messageId) {
		try {
			await deleteMessage(chatId, input.messageId);
		} catch (error) {
			console.error('[广告检测] 删除触发消息失败:', error);
		}
	}

	let learned = 0;
	try {
		// structureConfirmed 传参已随「强动词闸门」一起去掉（2026-09-08）：
		// 那道闸门是 source='auto' 唯一的前置条件，而本函数是 source='auto' 的唯一调用点，
		// 且只在已定罪时走到这里 —— 主人的口径是「已经确定并执行封禁的就自动学习指纹」，
		// 定罪本身就是学习凭据，不需要再问一遍「结构层同不同意」。
		const learn = await learnAdFingerprints(env, evaluation.payload, {
			source: 'auto',
			createdBy: 'system',
			whitelist: options.whitelist
		});
		learned = Number(learn?.learned) || 0;
	} catch (error) {
		console.error('[广告检测] 自动学习指纹失败:', error);
	}

	// ===== 自动学进 AI 语义样本库（2026-09-08 新增）=====
	// 主人的口径：「AI 是通过 spam 执行自我学习的」「AI 必须学习原有的中心指纹以及 spam
	// 的变体，然后它会自我优化更多的广告类型变体特征」。
	//
	// 在这批改动之前，addAdSample 全文件只有三个调用点：/confirm、/addsample、/spam ——
	// 全是【人工触发】。也就是说自动封禁（评分层撞阈值、指纹层命中、AI 层硬命中、
	// 四通道结构查杀）抓到的号，一条都不会进 AI 样本库，AI 的「广告概念」只能靠主人手工喂。
	// 加上这一段之后，四层里任何一层定罪都会把现场语义沉淀进样本库，
	// 下一个换了词但语义相同的变体就能被第三层直接认出来。
	//
	// 【失败绝不影响主流程】黑名单、全群封禁、消息删除都已经做完了，
	// 样本写不进去最多是少学一条，不能因此让回执报错或中断通知。
	let sampleAdded = false;
	try {
		// options.sampleText 让调用方覆盖取材口径。目前唯一的覆盖方是 /spam 的回复学习：
		// 那条路径碰到「本人正文一个字母 + 广告全在引用块里」时会拿引用体当样本，
		// 比这里默认的 name + bio + text 准得多。有覆盖就用覆盖，避免同一次处置写两条样本
		// （其中一条还是「英文人名 + 单字母」那种纯噪声）。
		const sampleText = options.sampleText != null
			? String(options.sampleText).trim()
			: buildAdSampleText(evaluation.payload);
		// 长度门槛与 addAdSample 内部一致（< 4 字符直接拒），这里先判一次是为了少一次 D1 往返。
		// 引用体形态的号（本人正文只有一个字母）在这里拼出来的通常只有昵称，
		// 短到 4 字符以下就跳过 —— 那种样本语义太稀薄，进库只会拉高误判面。
		if (sampleText.length >= 4) {
			const sample = await addAdSample(env, sampleText, { source: String(options.sampleSource || 'auto') });
			sampleAdded = Boolean(sample?.ok && sample?.added);
		}
	} catch (error) {
		console.error('[广告检测] 自动学习语义样本失败:', error);
	}

	// 快照与通知只发第一主人：序号是 /ignore 的唯一入口，多人共用会互相抢号。
	const ownerId = getOwnerNotifyTargets()[0] || '';
	let seq = null;
	if (ownerId) {
		seq = await allocateAdPendingSnapshot(env, ownerId, {
			userId,
			chatId,
			score: evaluation.score,
			reasons: evaluation.reasons,
			snapshot: evaluation.snapshot
		});
		const learnNote = (learned ? '；已学入 ' + learned + ' 条指纹' : '')
			+ (sampleAdded ? '；已加 1 条 AI 样本' : '');
		const notice = renderAdDetectionNotice(evaluation, {
			userId,
			chatTitle: input?.chatTitle || '',
			seq,
			banSummary: banSummary + learnNote
		});
		try {
			await sendTelegramMessageChunks(ownerId, notice);
		} catch (error) {
			console.error('[广告检测] 推送判定通知失败:', error);
		}
	}

	await deleteAdScreening(env, userId);
	console.log(
		'[广告检测] 已处置 user=' + userId + ' chat=' + chatId
		+ ' layer=' + evaluation.layer + ' score=' + evaluation.score
		+ ' 黑名单=' + blacklistCode + ' 封禁=' + banSummary
		+ ' 指纹=' + learned + ' AI样本=' + (sampleAdded ? 1 : 0)
	);
	return { banned: true, seq, blacklistCode, banSummary, learned, sampleAdded };
}

// === 单个入群成员的广告筛查（两条入群路径共用）===
// 抽出来是因为 Telegram 的入群会走两种完全不同的 update，而它们【不保证同时出现】：
//   ① message.new_chat_members —— service message，被别人拉进群时出现
//   ② chat_member update       —— 自己点邀请链接进群、加入请求被批准、unban 后自加回
// 原先只有 ① 挂了广告检测，② 那条路（handleChatMemberUpdate 的 enteredGroup 分支）
// 只查黑名单就 return，于是「点链接自己进来 + bio 里全是广告」的号一个都拦不住。
//
// 返回值供调用方决定要不要继续往下走：
//   'banned' 已封禁（调用方应立即停止后续处理）/ 'observed' 转入观察 / 'clean' 干净
//   'cooled' 冷却期内跳过 / 'skipped' 豁免或已黑 / 'error' 异常（已记日志，不抛）
async function screenAdJoinMember(env, member, options = {}) {
	const userId = member?.id;
	if (!userId || member?.is_bot) return 'skipped';			// bot 交给 handleNewChatMemberBots
	if (isPrivilegedManager(userId)) return 'skipped';			// 主人 / 副主人 / 超级管理员豁免
	const chatId = String(options.chatId ?? '');
	if (!chatId) return 'skipped';
	if (!env?.DB) return 'skipped';
	if (!(await adDetectionReady(env))) return 'skipped';

	try {
		// chat_member 那条路的调用方已经查过黑名单（复入群拦截），别再查第二遍。
		if (options.skipBlacklistCheck !== true) {
			const already = await checkBlacklist(userId, env);
			if (already.isBlacklisted) return 'skipped';		// 已黑用户由既有拦截逻辑处理
		}
		// 用 isAdminForAdDetection 而不是 checkIfUserIsAdminInGroup：这里是【检测豁免】不是鉴权，
		// 前者带 5 分钟按群缓存，一次批量入群（拉人进群常常一次十几个）同群只拉一份管理员列表。
		if (await isAdminForAdDetection(chatId, userId)) return 'skipped';

		const nowSeconds = Math.floor(Date.now() / 1000);
		// 先读后写：要的是【本次入群之前】的 bio_checked_at。
		const existing = await readAdGroupMember(env, userId);
		// 【方案 C 的第二个修复】入群即进名册。原先名册只在 detectAdOnMessage 里写，
		// 也就是只有发言过的人才在册 —— 一个入群时 bio 干净、之后改成广告且从不发言的号，
		// 连闸三 cron 都扫不到他，因为他根本不在扫描源里。入群写册把这个口子堵上。
		await upsertAdGroupMember(env, userId, chatId, member, nowSeconds);

		// 去重：被别人拉进群时 ① ② 两种 update 都会到，同一个人会进来两次。
		// 复用闸二那把三天冷却锁即可，不需要新机制。
		// 残留竞态：两个 update 几乎同时到达时可能都读到 existing === null 而各查一次 bio，
		// 但 fetchAdUserProfile 有 5 分钟按人缓存，第二次不会真的发出请求，代价为零。
		if (!shouldCheckAdBio(existing, nowSeconds)) return 'cooled';

		const profile = await fetchAdUserProfile(userId, member);
		// 不查 getChatMember：restricted 已归零不计分，入群时状态必然是 member，
		// 拉一次纯属浪费配额。留空后通知文案会显示「未查询」。
		profile.status = '';
		await markAdBioChecked(env, userId, nowSeconds);

		const config = options.config || loadAdDetectionConfig(env);
		const whitelist = options.whitelist || await loadAdDomainWhitelist(env);

		const evaluation = await evaluateAdSuspect(
			env,
			{ profile, text: '', forwardChat: null },
			// getChat 失败时不能扣「无 Bio」那一分 —— 那是「查到了、确实是空」才成立的判据。
			{ config, whitelist, skipMissingBioPenalty: profile.bioFetched !== true }
		);

		if (evaluation.verdict === 'ban') {
			await enforceAdDetection(env, {
				userId,
				chatId,
				chatTitle: options.chatTitle || '',
				messageId: options.messageId ?? null
			}, evaluation, { config, whitelist });
			return 'banned';
		}
		if (evaluation.verdict === 'observe') {
			await upsertAdScreening(env, userId, {
				chatId,
				// 只存行为分，不存静态资料分 —— 详见 evaluateAdSuspect 返回值里 retainScore 的说明。
				score: evaluation.retainScore ?? 0,
				reasons: evaluation.reasons,
				snapshot: evaluation.snapshot,
				layer: evaluation.layer
			}, config);
			console.log('[广告检测] 入群转入观察 user=' + userId + ' 来源=' + (options.source || 'join')
				+ ' score=' + evaluation.score + '/' + config.scoreThreshold
				+ ' 留存行为分=' + (evaluation.retainScore ?? 0));
			return 'observed';
		}
		return 'clean';
	} catch (error) {
		console.error('[广告检测] 入群检测异常 user=' + userId + ' 来源=' + (options.source || 'join') + ':', error);
		return 'error';
	}
}

// === 入群检测（第一道闸）===
// 必须插在 handleMessage 顶部、handleNewChatMemberBots 之前：后者对配置群的任何进群消息
// 一律 return true，放在它之后本函数永远不会执行。
// 本函数固定返回 false，绝不短路，保证既有的新 bot 静音逻辑照旧运行。
async function detectAdOnJoin(message, env, ctx) {
	const newMembers = message?.new_chat_members;
	if (!Array.isArray(newMembers) || !newMembers.length) return false;
	const chat = message.chat;
	if (!chat || !isConfiguredGroup(chat.id)) return false;
	if (!env?.DB) return false;
	if (!(await adDetectionReady(env))) return false;

	const config = loadAdDetectionConfig(env);
	const whitelist = await loadAdDomainWhitelist(env);
	const chatId = String(chat.id);

	// 逐个筛查。screenAdJoinMember 内部已经 try/catch，单个人异常不会中断整批
	// （一次拉人进群可能有十几个，不能因为其中一个 getChat 失败就放过其余的）。
	for (const member of newMembers) {
		await screenAdJoinMember(env, member, {
			chatId,
			chatTitle: chat.title || '',
			messageId: message.message_id,
			config,
			whitelist,
			source: 'new_chat_members'
		});
	}

	// 纯 D1 没有 TTL，过期剪枝只能搭车执行；进群事件频率低，放这里代价最小。
	if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(pruneAdDetectionData(env));
	else await pruneAdDetectionData(env);
	return false;
}

// === 消息检测（第二道闸）===
// 插在黑名单兜底拦截之后：已黑用户根本走不到这里。
// 成本控制是关键：先用纯 JS 的文本 / 转发评分做零成本预筛，得分为 0 立即退出，
// 只有可疑消息才付出 getChat + AI 推理的代价，正常聊天不产生任何额外子请求。
// 返回 true 表示已处置（调用方应立即 return），false 表示放行给后续逻辑。
async function detectAdOnMessage(message, env) {
	if (!env?.DB) return false;
	const chat = message?.chat;
	const from = message?.from;
	if (!chat || !from || from.is_bot) return false;
	if (!isConfiguredGroup(chat.id)) return false;

	// 临时诊断开关：环境变量 AD_DEBUG_DUMP_UPDATE=1 时，把本群每条消息的 update 原文打进日志。
	// 刻意放在【所有豁免检查之前】—— 主人 / 管理员会在下面几行直接 return，
	// 若放在后面，主人自己转发一条同款广告做取样时一行日志都不会打。
	//
	// 用途：2026-09 线上漏放 50+ 广告号，那批号的正文只有一个字母（v/z/n/x），
	// 广告词疑似在转发体里，而 getAdDetectionBodyText 只读 text/caption。
	// 需要真实 update JSON 才能确定 Telegram 把转发原文放在哪个字段。
	//
	// ⚠️ 取样完成后必须删掉这段：它会把群内消息全文打进 Worker 日志，属于隐私泄露面。
	if (String(env.AD_DEBUG_DUMP_UPDATE || '') === '1') {
		try {
			console.log('[广告检测·DEBUG] update dump = ' + JSON.stringify({
				text: message.text ?? null,
				caption: message.caption ?? null,
				forward_origin: message.forward_origin ?? null,
				forward_from_chat: message.forward_from_chat ?? null,
				forward_from: message.forward_from ?? null,
				forward_sender_name: message.forward_sender_name ?? null,
				quote: message.quote ?? null,
				external_reply: message.external_reply ?? null,
				reply_to_message: message.reply_to_message
					? { text: message.reply_to_message.text ?? null, caption: message.reply_to_message.caption ?? null }
					: null,
				entities: message.entities ?? null,
				caption_entities: message.caption_entities ?? null,
				via_bot: message.via_bot?.username ?? null,
				sender_chat: message.sender_chat ?? null,
				from: { id: from.id, first_name: from.first_name ?? null, last_name: from.last_name ?? null, username: from.username ?? null },
				__bodyTextNow: getAdDetectionBodyText(message)
			}));
		} catch (error) {
			console.error('[广告检测·DEBUG] dump 失败:', error);
		}
	}
	if (Array.isArray(message.new_chat_members) && message.new_chat_members.length) return false;

	const userId = from.id;
	if (isPrivilegedManager(userId)) return false;

	const text = String(message.text ?? message.caption ?? '').trim();
	if (isTelegramSlashCommand(text)) return false;
	const forwardChat = message.forward_from_chat || message.forward_origin?.chat || null;
	// 引用体正文：这条消息引用/回复的那条【别人的】消息里的文字。
	// 必须参与早退判断 —— 「正文为空 + 只引用一条广告」是漏放形态的极端版，
	// 只看 text 与 forwardChat 会在这里就 return，后面四条通道一条都跑不到。
	const quotedText = getAdQuotedText(message);
	// 分享名片（contact）的显示名。名片消息的 text / caption 【恒为空】，
	// 广告内容全写在名片显示名里（实例：昵称「假钞玩妹交流群🔥快递面交都可」+ 电话 +98 993 238 8241），
	// 所以不取它 → 下面那道早退闸门会把整条消息当「空消息」return，四条通道一条都跑不到。
	// getContactText（:5107）从一开始就定义好了，却只被快照预览引用，从没接进评分链 —— 这才是漏检真因。
	//
	// 【只取显示名，不取 phone_number / vcard】按主人口径「昵称带广告就杀，无需管国内外号」：
	//   · phone_number 是纯数字，进 AI 语义层只会稀释广告词权重，且号码国别几乎零区分力
	//     （旧代码实测：广告名片外国号占比 17%、正常名片 20%，拿它当判据反而漏杀）；
	//   · vcard 是原始格式串（FN: / TEL: 字段名），字段名进语义层是纯噪声，
	//     而它承载的显示名内容与这里取的完全重复。
	// 判据本体【一个新正则都不加】，直接复用现有 judgeAdStructure 的「招揽 ∧ 行业两类同现」。
	// 2026-09-09 离线实测【纠正】此处原先写的验算：上例那句在四张词表与两组正则里
	// 逐词零命中，形态 A 并不成立 —— 通路通了也定不了罪，同一句话发在正文里一样杀不掉。
	// 补词后才真正成立：「面交」进 AD_TRADE_VERBS → solicit；「假钞」进 AD_BUSINESS_KEYWORDS → biz。
	// 所以名片显示名的误封门槛与普通正文查杀完全同档，不是旧代码那种单词命中即杀。
	//
	// looksLikePersonName 是【反向白名单】（旧代码 :6632 移植）：显示名像人名就整条不看，
	// 把「张三 / 妈妈 / 快递小哥 / John Smith」这类正常名片在进判据之前就摘出去。
	// 它只减误封、对漏检零影响 —— 广告名片必须把广告写进显示名，写了就一定不像人名。
	const contactDisplayName = message?.contact
		? [message.contact.first_name, message.contact.last_name].filter(Boolean).join(' ').trim()
		: '';
	const contactName = looksLikePersonName(contactDisplayName) ? '' : contactDisplayName;
	if (!text && !forwardChat && !quotedText && !contactName) return false;
	if (!(await adDetectionReady(env))) return false;

	const config = loadAdDetectionConfig(env);
	const whitelist = await loadAdDomainWhitelist(env);

	// 管理员豁免。零成本的确定性排除，放在最前面 —— 也因此管理员【不进名册】，
	// 不占用定时扫描的每日配额。代价是「曾以普通成员身份发言、后来升管理员」的人
	// 会留在名册里被 cron 扫到，那一轨自己也做一次豁免检查兜底。
	// 这里用 isAdminForAdDetection 而不是 checkIfUserIsAdminInGroup：
	// 前者带 5 分钟按群缓存（同群所有人共用一份列表），后者是 /ban 的鉴权入口不能缓存。
	if (await isAdminForAdDetection(chat.id, userId)) return false;

	const nowSeconds = Math.floor(Date.now() / 1000);
	// 先读名册再 upsert —— 顺序不能颠倒：upsert 会把 last_seen 推到现在，
	// 而我们要的是【本次发言之前】的 bio_checked_at。颠倒后 member 永远是刚写的那行，
	// 但 bio_checked_at 不被 upsert 覆盖，所以实际仍能读对；保持这个顺序只是为了让
	// 「首次发言」能明确地表现为 member === null，语义清晰。
	const member = await readAdGroupMember(env, userId);
	await upsertAdGroupMember(env, userId, chat.id, from, nowSeconds);

	// 观察窗口历史分。作用是：入群时够可疑但没到封禁线的人，窗口期内再发广告消息即合并裁决。
	// readAdScreening 是一次 D1 主键查询，本来就在这条路径上。
	const screening = await readAdScreening(env, userId);
	const historyScore = screening ? screening.score : 0;

	// 历史分累加。抽成闭包是因为下面两道闸各要用一次，而累加必须【只做一次】——
	// 闸一累加过、闸二再累加一遍会把历史分算两遍，凭空多出几分。
	//
	// 准入条件【本次这条消息必须自己拿出新证据】（2026-09-07 第二起误封事故后补）：
	//
	// 历史分取自 ad_user_screening.score，那是【上一次评分的总分】，里面本来就含了
	// bio 链接 / username / 昵称这些恒定不变的静态资料分。而这次评分又会把同一个 bio、
	// 同一个 username 从头算一遍 —— 同一份证据算了两次（double counting）。
	// 再叠上 upsertAdScreening 的 score = MAX(旧, 新)（历史分只涨不跌）与每次 upsert
	// 都刷新 expires_at（窗口无限续期），一个人一旦被判过一次 observe 就很难再降下来。
	//
	// 事故形态：观察线 5 与封禁线 7 只差 2 分，而「bio 含非白名单引流链接」恰好是
	// 恒定的 +2 —— 于是【任何 bio 里放了链接又被判过一次 observe 的人，下一条消息
	// 必被封，无论他说什么】。被误封用户 @MiLov1900 触发封禁的那条消息是
	// 「要beta版才能用 那要等了」，behaviorScore 实测 0；8 分里 5 分是历史分，
	// 另外 3 分正是与历史分重复的同一份静态资料（bio 链接 +2、username +1）。
	//
	// 所以要求 behaviorScore > 0 才让历史分参与裁决：历史分的设计语义是「累积多次
	// 可疑*行为*」，「又干了一次」的真实含义就是本次消息自身有正文 / 上下文 / 转发证据，
	// 而不是「同一份资料卡又被重算了一遍」。
	//
	// 这道闸不会放过真广告：资料已经明显到该封的号，静态分自身就够阈值，
	// evaluateAdSuspect 里就判成 ban 了，进不到这里的分支；指纹硬命中与 AI 命中同理。
	// 真广告号要投放就必须发正文或转发，那一刻 behaviorScore > 0，历史分【全额】参与
	// —— 刻意不封顶：实测「正文首尾对称 emoji（+3）+ 历史 4 分 = 7」这类真广告
	// 正好卡在封禁线上，任何封顶都会把它放过去。
	// 被挡下的只有「资料分卡在观察线、却始终没发过任何广告内容」这一类 —— 那正是误封池。
	//
	// double counting 已于 2026-09-08 根治：观察记录改为【只存行为分】
	// （upsertAdScreening 的 score 来自 evaluation.retainScore，不再是总分），
	// 所以 historyScore 里再也不含 bio / username / 昵称这些恒定项。
	// 本闸门（behaviorScore > 0）作为第二道保险保留：即使历史分是干净的行为分，
	// 也只在「本次又干了一次」时才允许累加，语义才自洽。
	const applyHistory = (evaluation) => {
		if (historyScore <= 0) return evaluation;

		if (!(Number(evaluation.behaviorScore) > 0)) {
			evaluation.reasons.push(
				'观察窗口历史分 ' + historyScore + ' 未参与裁决（本次消息无新增行为证据）'
			);
			return evaluation;
		}

		evaluation.score += historyScore;
		evaluation.reasons.push(
			'+' + historyScore + ' 观察窗口历史分（'
			+ (AD_LAYER_LABELS[screening.layer] || screening.layer || '结构化评分') + '）'
		);
		if (evaluation.verdict !== 'ban' && evaluation.score >= config.scoreThreshold) evaluation.verdict = 'ban';
		else if (evaluation.verdict === 'pass' && evaluation.score >= config.observationScore) evaluation.verdict = 'observe';
		return evaluation;
	};

	// ============ 闸一 · 零成本判定（0 个 Telegram 请求）============
	// 昵称、用户名、正文、转发来源全都在 update 里现成带着，一个字节都不用额外拉。
	// 实测 9 个真广告样本里有 7 个仅凭这些就够封禁线 —— 广告号要让人看见广告，
	// 就必须把广告写在别人看得见的地方，而最显眼的地方恰好都是免费的。
	// 这一闸【完整走三层】（结构分 + 指纹库 + AI 语义）：指纹和 AI 只花 D1 与 Workers AI，
	// 不花 Telegram 请求，而它们正是自动学习与 /spam 学习成果的落地点，压后到 3 天一次会白费。
	const cheapProfile = {
		firstName: from.first_name || '',
		lastName: from.last_name || '',
		username: from.username || '',
		bio: '',
		status: ''
	};
	const cheap = applyHistory(await evaluateAdSuspect(
		env,
		// text || contactName：名片消息的 text 恒为空，所以不存在覆盖正文的情况。
		// 用「短路取值」而非拼接，是为了让名片显示名走进 payload.text 后，
		// 结构评分 / 指纹库 / AI 语义 / 四通道结构查杀【四层全都能看到它】。
		{ profile: cheapProfile, text: text || contactName, quotedText, forwardChat },
		// skipMissingBioPenalty：这一闸的 bio 是「没查」而不是「没有」，不能拿它减分。
		{ config, whitelist, skipMissingBioPenalty: true }
	));

	const needBio = shouldCheckAdBio(member, nowSeconds);

	// 闸一够封禁线就地处置，不再花 getChat —— 已经确定要封的人，bio 是什么无关紧要。
	if (cheap.verdict === 'ban') {
		await enforceAdDetection(env, {
			userId,
			chatId: chat.id,
			chatTitle: chat.title || '',
			messageId: message.message_id
		}, cheap, { config, whitelist });
		return true;
	}

	// 闸一没定罪、且这个人的 bio 在冷却期内 —— 到此结束，本条消息 0 个 Telegram 请求。
	// 这是稳态下的绝大多数情况（正常聊天），也是「不要每条信息都拉」的落点。
	if (!needBio) {
		if (cheap.verdict === 'observe') {
			await upsertAdScreening(env, userId, {
				chatId: chat.id,
				// 只存行为分，见 retainScore 说明。
				score: cheap.retainScore ?? 0,
				reasons: cheap.reasons,
				snapshot: cheap.snapshot,
				layer: cheap.layer
			}, config);
			console.log('[广告检测] 闸一转入观察 user=' + userId + ' score=' + cheap.score + '/' + config.scoreThreshold
				+ ' 留存行为分=' + (cheap.retainScore ?? 0));
		}
		return false;
	}

	// ============ 闸二 · 查一次 bio（1 个 Telegram 请求）============
	// 触发条件：首次发言，或距上次查 bio 已超过 AD_BIO_RECHECK_DAYS 天。
	// 专治闸一抓不到的那一类 —— 昵称「【出租账号】」正文「详情见简介」、
	// 昵称「小李」正文「在吗」：零成本信号全 0 分，广告【只写在 bio 里】。
	// 无论 getChat 成功与否都记下时间戳：失败多半是 429，立刻重试只会继续撞墙，
	// 而 cron 那一轨会按 bio_checked_at ASC 把他重新排上来，不会永久漏掉。
	const profile = await fetchAdUserProfile(userId, from);
	// 【热路径不查 getChatMember】。它原本只为拿 restricted 状态，而 restricted 已归零
	// 不计分（AD_RESTRICTED_STATUS_SCORE = 0），返回值仅用于通知文案里的「群内身份」一行。
	// 为一行展示文案给每条消息加一个 Telegram 请求不值得，故留空，
	// 由 formatAdMemberStatus 渲染成「未查询」。
	profile.status = '';
	await markAdBioChecked(env, userId, nowSeconds);

	// 据实传：getChat 成功就正常判定（空 bio 该减分就减），失败则跳过减分。
	// 两轨用同一个判断依据（profile.bioFetched），阈值与判据完全一致，不另立标准。
	const evaluation = applyHistory(await evaluateAdSuspect(
		env,
		// 与闸一同一口径传名片显示名。漏传这里会造成一种诡异形态：
		// 名片消息在闸一（无 bio）没定罪 → 走到闸二拉了 bio 本该更容易定罪，
		// 结果因为 text 又变回空串，反而比闸一更判不出来。
		{ profile, text: text || contactName, quotedText, forwardChat },
		{ config, whitelist, skipMissingBioPenalty: profile.bioFetched !== true }
	));

	if (evaluation.verdict === 'ban') {
		await enforceAdDetection(env, {
			userId,
			chatId: chat.id,
			chatTitle: chat.title || '',
			messageId: message.message_id
		}, evaluation, { config, whitelist });
		return true;
	}

	if (evaluation.verdict === 'observe') {
		await upsertAdScreening(env, userId, {
			chatId: chat.id,
			// 只存行为分，见 retainScore 说明。
			score: evaluation.retainScore ?? 0,
			reasons: evaluation.reasons,
			snapshot: evaluation.snapshot,
			layer: evaluation.layer
		}, config);
		console.log('[广告检测] 闸二转入观察 user=' + userId + ' score=' + evaluation.score + '/' + config.scoreThreshold
			+ ' 留存行为分=' + (evaluation.retainScore ?? 0));
	}
	return false;
}

// === 命令层 ===
// 10 条广告检测命令一律走这一个入口，handleMessage 里只挂一个钩子，
// 不改动任何既有命令分支。返回 true 表示命令已被处理，调用方应立即 return。
// 【2026-09-08 从 11 条减为 10 条】confirm 已删除，见 handleAdIgnoreCommand 上方的说明。
const AD_COMMAND_RE = /^\/(pending|ignore|addword|delword|words|addsample|clearsamples|adstats|whitelist|rescreen|warmup)(?:@[^\s]+)?(?:\s|$)/i;

// 快照 → 判定载荷。/ignore 标误判、删 AI 样本都要用同一份载荷，保证两边命中的集合一致。
function adPayloadFromSnapshot(snapshot) {
	const snap = snapshot?.snapshot || {};
	const name = String(snap.name || '');
	const bio = String(snap.bio || '');
	const text = String(snap.text || '');
	return {
		name,
		username: String(snap.username || ''),
		bio,
		text,
		domains: extractAdDomains([name, bio, text].filter(Boolean).join('\n'))
	};
}

async function handleAdDetectionCommands(message, env, ctx) {
	const raw = typeof message?.text === 'string' ? message.text.trim() : '';
	if (!raw) return false;
	const match = raw.match(AD_COMMAND_RE);
	if (!match) return false;

	const command = match[1].toLowerCase();
	const chatId = message.chat.id;
	const userId = getMessageActorId(message);
	const isInGroup = message.chat.type !== 'private';

	// 指纹库与样本库直接决定自动封禁行为，权限外泄等于把封禁开关交出去 → 只给第一主人。
	// 群内一律只撤回命令、不回权限提示，避免向群成员暴露这些命令的存在。
	if (!isPrimaryOwner(userId)) {
		if (!isInGroup) {
			await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n广告检测管理命令仅限第一主人私聊使用。');
		}
		return true;
	}
	if (isInGroup) {
		await deleteAuthorizedGroupCommandMessage(message, '/' + command);
		await sendTelegramMessage(userId, 'ℹ️ 广告检测管理命令请在私聊中使用。');
		return true;
	}
	if (!env.DB) {
		await sendTelegramMessage(chatId, '❌ 未绑定 D1 存储空间，广告检测不可用。');
		return true;
	}
	if (!(await adDetectionReady(env))) {
		await sendTelegramMessage(chatId, '❌ 广告检测数据表初始化失败，请稍后重试或检查 D1 绑定。');
		return true;
	}

	const arg = raw.replace(AD_COMMAND_RE, '').trim();
	const ownerId = String(userId);

	try {
		switch (command) {
			case 'pending': await handleAdPendingCommand(env, chatId, ownerId, arg); break;
			case 'ignore': await handleAdIgnoreCommand(env, chatId, ownerId, arg); break;
			case 'addword': await handleAdAddWordCommand(env, chatId, ownerId, arg); break;
			case 'delword': await handleAdDelWordCommand(env, chatId, ownerId, arg); break;
			case 'words': await handleAdWordsCommand(env, chatId, arg); break;
			case 'addsample': await handleAdAddSampleCommand(env, chatId, arg); break;
			case 'clearsamples': await handleAdClearSamplesCommand(env, chatId, ownerId, arg); break;
			case 'adstats': await handleAdStatsCommand(env, chatId); break;
			case 'whitelist': await handleAdWhitelistCommand(env, chatId, ownerId, arg); break;
			case 'rescreen': await handleAdRescreenCommand(env, chatId, arg); break;
			case 'warmup': await handleAdWarmupCommand(env, chatId); break;
		}
	} catch (error) {
		console.error('[广告检测] 命令 /' + command + ' 执行异常:', error);
		await sendTelegramMessage(chatId, '❌ 命令执行异常：' + escapeHtml(String(error?.message || error)));
	}
	return true;
}

// /pending [数量]：列出待确认的判定快照，1 小时后自动过期。
async function handleAdPendingCommand(env, chatId, ownerId, arg) {
	const parsed = parseInt(arg, 10);
	const limit = Number.isFinite(parsed) && parsed > 0
		? Math.min(AD_PENDING_MAX_LIMIT, parsed)
		: AD_PENDING_DEFAULT_LIMIT;
	const result = await listAdPendingSnapshots(env, ownerId, limit);
	if (!result.ok) {
		await sendTelegramMessage(chatId, '❌ 读取待确认快照失败。');
		return;
	}
	if (!result.rows.length) {
		await sendTelegramMessage(chatId, '📭 <b>待复核快照</b>\n\n当前没有待复核的广告判定记录。\n快照长期保留，复核过（/ignore）的会从列表移除。');
		return;
	}
	const lines = ['<b>📋 待复核广告判定</b>', '共 <b>' + result.total + '</b> 条，显示 ' + result.rows.length + ' 条（最新在前）', ''];
	for (const row of result.rows) {
		const snap = row.snapshot || {};
		const when = row.createdAt ? new Date(row.createdAt * 1000).toISOString().replace('T', ' ').slice(0, 19) : '未知';
		lines.push('<b>#' + row.seq + '</b>　<code>' + escapeHtml(row.userId) + '</code>　得分 ' + row.score);
		if (snap.name) lines.push('　名称：' + escapeHtml(String(snap.name).slice(0, 60)));
		if (snap.text) lines.push('　消息：' + escapeHtml(String(snap.text).slice(0, 60)));
		lines.push('　时间：' + when + ' UTC');
	}
	lines.push('');
	lines.push('判定正确：无需任何操作（指纹与 AI 样本已自动学入）');
	lines.push('判定错误并解封：/ignore 序号　支持批量 /ignore 3 5 7 与区间 /ignore 3-8');
	await sendTelegramMessageChunks(chatId, lines.join('\n'));
}

// /confirm 已于 2026-09-08 删除。
// 理由（主人原话）：「这个 /confirm 就删掉，不需要了，因为通过 spam 的话它会自动学习指纹，
// 如果是误封还可以通过指定指令执行全群解封并删除已经记录的指令。」
// 它做的两件事现在都在 enforceAdDetection 里自动完成了 —— 任何一层定罪即学指纹、
// 即加 AI 样本，主人对判定正确的号【不需要任何操作】，只在误判时发 /ignore。
// ⚠️ 与 ad_confirm_tokens 那张表无关，那是通用二次确认令牌机制，不要一起动。

// 单条误判回滚：移出黑名单 → 全群解封 → 指纹记误报并即删 → 删掉对应 AI 样本 → 标记快照已复核。
// 抽出来给 /ignore 的单条与批量两种用法共用，保证两条路径的副作用完全一致。
async function rollbackAdPendingSnapshot(env, ownerId, seq, snapshot) {
	const targetId = snapshot.userId;
	const removed = await removeFromBlacklist(targetId, env);
	// 必须先确认黑名单已清（或本就不在），再解 Telegram 封禁，避免解完又被兜底拦截重新踢掉。
	let unbanSummary = '未执行';
	if (removed.success || removed.code === 'NOT_FOUND') {
		const results = await unbanUserFromAllGroups(targetId);
		const okCount = results.filter((r) => r.ok).length;
		unbanSummary = okCount + '/' + results.length + ' 个群成功';
		const failed = results.filter((r) => !r.ok);
		if (failed.length) {
			unbanSummary += '；失败群：' + failed.slice(0, 3).map((r) => r.groupId + '(' + (r.error || '未知') + ')').join('、');
		}
	}

	const payload = adPayloadFromSnapshot(snapshot);
	// purge: true —— 主人已明确说这是误判，命中的指纹当次即删，不再攒 3 次误报。
	// 同批改动拆掉了自动学习的强动词闸门，指纹写入变宽，纠错端必须同步变快。
	const fp = await markAdFingerprintFalsePositive(env, payload, { purge: true });
	// 删掉当初自动学进去的那条 AI 语义样本。在这批改动之前 /ignore 碰都没碰样本库 ——
	// 于是指纹删了、号解封了，错样本却永久留在 AI 样本库里继续误伤相似的正常用户，
	// 而 AI 层是硬命中即封、不看豁免词也不看总分的，一条错样本比一条错指纹更危险。
	const sampleRemoved = await removeAdSampleByText(env, buildAdSampleText(payload));
	await deleteAdScreening(env, targetId);
	await deleteAdPendingSnapshot(env, ownerId, seq);
	return { targetId, removed, unbanSummary, fp, sampleRemoved };
}

// /ignore 单次最多处理多少个序号。
// 每个序号都要跑一遍 unbanUserFromAllGroups（群数 × 1 次 TG API）+ 指纹与样本的 D1 写入，
// 不设上限的话一句手滑的 /ignore 1-99999 会直接撞 TG 限流和 Workers 子请求预算。
const AD_IGNORE_BATCH_MAX = 10;

// 解析 /ignore 的序号参数。支持单个「3」、多个「3 5 7」、区间「3-8」，可混写；
// 分隔符收了半角/全角逗号、顿号与空白 —— 主人从 /pending 回执里复制序号时这些都可能带进来。
function parseAdSeqList(arg) {
	const raw = String(arg ?? '').trim();
	if (!raw) return { ok: false, seqs: [], truncated: false };
	const seqs = new Set();
	let truncated = false;
	for (const token of raw.split(/[\s,，、]+/).filter(Boolean)) {
		if (truncated) break;
		const range = token.match(/^(\d{1,6})\s*[-~－～]\s*(\d{1,6})$/);
		if (range) {
			const from = parseInt(range[1], 10);
			const to = parseInt(range[2], 10);
			if (!(from >= 1) || !(to >= 1)) return { ok: false, seqs: [], truncated: false };
			for (let n = Math.min(from, to); n <= Math.max(from, to); n += 1) {
				if (seqs.size >= AD_IGNORE_BATCH_MAX) { truncated = true; break; }
				seqs.add(n);
			}
			continue;
		}
		if (!/^\d{1,6}$/.test(token)) return { ok: false, seqs: [], truncated: false };
		const n = parseInt(token, 10);
		if (!(n >= 1)) return { ok: false, seqs: [], truncated: false };
		if (seqs.size >= AD_IGNORE_BATCH_MAX) { truncated = true; break; }
		seqs.add(n);
	}
	if (!seqs.size) return { ok: false, seqs: [], truncated: false };
	return { ok: true, seqs: [...seqs].sort((a, b) => a - b), truncated };
}

// /ignore <序号...>：判定错误 → 移出黑名单 + 全群解封 + 删掉学到的指纹与 AI 样本。
// 这是唯一的回滚入口，必须做到「一条命令彻底恢复」，否则自动封禁不敢开。
// 支持批量是因为主人的原话：「我觉得指令可以支持批量删除，可以通过现有的指令库来执行批量删除号。」
async function handleAdIgnoreCommand(env, chatId, ownerId, arg) {
	const parsed = parseAdSeqList(arg);
	if (!parsed.ok) {
		await sendTelegramMessage(chatId, [
			'用法：<code>/ignore 3</code>',
			'批量：<code>/ignore 3 5 7</code>　区间：<code>/ignore 3-8</code>',
			'序号来自 /pending 列表，单次最多 ' + AD_IGNORE_BATCH_MAX + ' 个。'
		].join('\n'));
		return;
	}
	const single = parsed.seqs.length === 1;
	const lines = [];
	let rolled = 0;
	let missed = 0;
	for (const seq of parsed.seqs) {
		const snapshot = await readAdPendingSnapshot(env, ownerId, seq);
		if (!snapshot) {
			missed += 1;
			// 单序号时给完整指引：主人手上那条通知可能已经复核过了，直接说清楚下一步查哪里。
			// 【不能沿用批量那行简短提示】否则回执标题仍是「已按误判回滚」而实际一个号都没解 ——
			// 主人会以为解封成功了，那个号还在黑名单里继续被拦。
			if (single) {
				await sendTelegramMessage(chatId, '⚠️ 序号 <b>#' + seq + '</b> 不存在或已复核过（快照长期保留，复核过的会从 /pending 列表移除）。\n用 /pending 查看当前待复核序号。');
				return;
			}
			lines.push('<b>#' + seq + '</b>　⚠️ 序号不存在或已复核过');
			continue;
		}
		const r = await rollbackAdPendingSnapshot(env, ownerId, seq, snapshot);
		rolled += 1;
		const fpNote = r.fp.ok
			? ('指纹 标记 ' + (r.fp.affected || 0) + ' / 删除 ' + (r.fp.retired || 0))
			: '指纹 标记失败';
		const sampleNote = r.sampleRemoved.ok
			? (r.sampleRemoved.removed > 0 ? 'AI 样本 已删 ' + r.sampleRemoved.removed : 'AI 样本 无对应')
			: 'AI 样本 删除失败';
		if (single) {
			lines.push('用户：<code>' + escapeHtml(r.targetId) + '</code>');
			lines.push('黑名单：' + (r.removed.success ? '已移除' : (r.removed.code === 'NOT_FOUND' ? '本就不在黑名单' : '移除失败')));
			lines.push('解封：' + escapeHtml(r.unbanSummary));
			lines.push('指纹修正：' + (r.fp.ok ? '已标记 <b>' + (r.fp.affected || 0) + '</b> 条误判，删除 <b>' + (r.fp.retired || 0) + '</b> 条' : '标记失败'));
			lines.push('AI 样本：' + (r.sampleRemoved.ok ? (r.sampleRemoved.removed > 0 ? '已删除 <b>' + r.sampleRemoved.removed + '</b> 条' : '无对应样本') : '删除失败'));
			if (r.fp.ok && r.fp.affected > 0 && Array.isArray(r.fp.rows)) {
				lines.push('');
				lines.push('受影响指纹：');
				for (const row of r.fp.rows.slice(0, 5)) lines.push('· [' + escapeHtml(row.type) + '] ' + escapeHtml(String(row.value).slice(0, 40)));
			}
		} else {
			lines.push('<b>#' + seq + '</b>　<code>' + escapeHtml(r.targetId) + '</code>　解封 '
				+ escapeHtml(r.unbanSummary) + '　' + fpNote + '　' + sampleNote);
		}
	}
	const header = single
		? ['<b>♻️ 已按误判回滚</b>', '序号：<b>#' + parsed.seqs[0] + '</b>']
		: ['<b>♻️ 批量误判回滚</b>', '已回滚 <b>' + rolled + '</b> 个，跳过 <b>' + missed + '</b> 个', ''];
	if (parsed.truncated) {
		header.push('⚠️ 序号超过单次上限 ' + AD_IGNORE_BATCH_MAX + ' 个，只处理了前 ' + parsed.seqs.length + ' 个，其余请再发一次。');
	}
	await sendTelegramMessageChunks(chatId, header.concat(lines).join('\n'));
}

// /addword <值> [类型]：手动加指纹。类型缺省按值形态推断（@ → username，域名 → domain，其余 keyword）。
async function handleAdAddWordCommand(env, chatId, ownerId, arg) {
	if (!arg) {
		await sendTelegramMessage(chatId, [
			'用法：<code>/addword 收U秒结 keyword</code>',
			'',
			'类型可选：keyword（关键词，默认）、domain（域名）、username（@账号）、bio（简介片段）',
			'类型省略时按值形态自动推断。',
			'手动指纹权重固定 1，且不会被误判退役机制自动清除。'
		].join('\n'));
		return;
	}
	const parts = arg.split(/\s+/);
	const maybeType = parts.length > 1 ? String(parts[parts.length - 1]).toLowerCase() : '';
	const hasType = AD_FINGERPRINT_TYPES.includes(maybeType);
	const value = hasType ? parts.slice(0, -1).join(' ') : arg;
	const result = await addAdFingerprint(env, value, { type: hasType ? maybeType : '', createdBy: ownerId });
	if (!result.ok) {
		const reasonMap = { too_short: '值太短（至少 2 个字符）', invalid: '值不合法', unavailable: '数据表不可用', error: '写入失败' };
		await sendTelegramMessage(chatId, '❌ 添加指纹失败：' + (reasonMap[result.reason] || result.reason));
		return;
	}
	await sendTelegramMessage(chatId, [
		'<b>✅ 指纹已' + (result.existed ? '更新' : '添加') + '</b>',
		'类型：' + escapeHtml(result.type),
		'值：<code>' + escapeHtml(result.value) + '</code>',
		'权重：1　置信度：1.00　来源：manual'
	].join('\n'));
}

// /delword：三种用法。
//   1) /delword <值>              —— 原有行为，按原文或归一化值删除，同一值跨类型一并清掉；
//   2) /delword noise             —— 批量删掉命中 0 次的噪声指纹（不含种子），走二次确认；
//   3) /delword type:username     —— 批量删掉整类指纹（不含种子），走二次确认。
//
// 批量档【强制二次确认】：先列出条数与前 10 条样本，签一个 60 秒一次性令牌，
// 主人看过清单再发 /delword bulk <令牌> 才真删。指纹库没有回收站，一次手滑
// 能把几十条学习成果清空，而重新学回来要等下一批广告号真的来。
// 令牌语法刻意带 bulk 前缀：不然那串 hash 会被上面第 1 种用法当成「要删的值」，
// 静默走进按值删除、报一句「指纹库中没有」，主人还以为是令牌过期了。
async function handleAdDelWordCommand(env, chatId, ownerId, arg) {
	if (!arg) {
		await sendTelegramMessage(chatId, [
			'用法：<code>/delword 收U秒结</code>　按值删除，同一值的所有类型一并清除',
			'批量：<code>/delword noise</code>　删掉命中 0 次的噪声指纹',
			'　　　<code>/delword type:username</code>　删掉整类（' + AD_FINGERPRINT_TYPES.join(' / ') + '）',
			'',
			'批量档需二次确认，且一律不动种子指纹（中心特征，删了不会自动补回）。',
			'用 /words 查看现有指纹。'
		].join('\n'));
		return;
	}

	// 令牌确认档：/delword bulk <令牌>
	const bulkToken = arg.match(/^bulk\s+(\S+)$/i);
	if (bulkToken) {
		const consumed = await consumeAdConfirmToken(env, bulkToken[1], 'bulk_delword', ownerId);
		if (!consumed) {
			await sendTelegramMessage(chatId, '❌ 令牌无效、已使用或已过期（有效期 60 秒）。\n请重新执行批量 /delword 获取新令牌。');
			return;
		}
		// 令牌里只存筛选 key，SQL 片段现场重建 —— 不让任何 SQL 文本进 D1 的 payload 再取出来执行。
		const filter = buildAdFingerprintBulkFilter(String(consumed.payload?.key || ''));
		if (!filter || filter.ok !== true) {
			await sendTelegramMessage(chatId, '❌ 令牌内容异常（筛选条件无法还原），未做任何改动。');
			return;
		}
		const result = await bulkDeleteAdFingerprints(env, filter);
		if (!result.ok) {
			await sendTelegramMessage(chatId, '❌ 批量删除失败：' + escapeHtml(String(result.reason || '未知')));
			return;
		}
		await sendTelegramMessage(chatId, [
			'<b>🗑 已批量删除指纹</b>',
			'筛选：' + escapeHtml(filter.label),
			'删除 <b>' + result.removed + '</b> 条（种子指纹未受影响）。'
		].join('\n'));
		return;
	}

	// 批量筛选档：先预览再签令牌。
	const filter = buildAdFingerprintBulkFilter(arg);
	if (filter && filter.ok === false) {
		await sendTelegramMessage(chatId, '⚠️ 未知指纹类型 <code>' + escapeHtml(String(filter.type || '')) + '</code>。\n可用类型：' + AD_FINGERPRINT_TYPES.join(' / '));
		return;
	}
	if (filter) {
		const preview = await previewAdFingerprintBulkDelete(env, filter);
		if (!preview.ok) {
			await sendTelegramMessage(chatId, '❌ 预览失败：' + escapeHtml(String(preview.reason || '未知')));
			return;
		}
		if (!preview.total) {
			await sendTelegramMessage(chatId, '📭 没有匹配「' + escapeHtml(filter.label) + '」的指纹，未做任何改动。');
			return;
		}
		const token = await issueAdConfirmToken(env, 'bulk_delword', ownerId, { key: filter.key });
		if (!token) {
			await sendTelegramMessage(chatId, '❌ 签发确认令牌失败，请稍后重试。');
			return;
		}
		const lines = [
			'<b>⚠️ 确认批量删除指纹</b>',
			'',
			'筛选：' + escapeHtml(filter.label),
			'将删除 <b>' + preview.total + '</b> 条（种子指纹已排除，不会被删）。',
			''
		];
		lines.push('样本（按命中次数倒序，最多 10 条）：');
		for (const row of preview.rows) {
			lines.push('· [' + escapeHtml(String(row.type)) + '] ' + escapeHtml(String(row.value).slice(0, 40))
				+ '　命中 ' + (Number(row.match_count) || 0) + '　来源 ' + escapeHtml(String(row.source || '未知')));
		}
		if (preview.total > preview.rows.length) lines.push('… 其余 ' + (preview.total - preview.rows.length) + ' 条未列出');
		lines.push('');
		lines.push('确认请在 60 秒内执行：');
		lines.push('<code>/delword bulk ' + token + '</code>');
		await sendTelegramMessageChunks(chatId, lines.join('\n'));
		return;
	}

	// 单条按值删除：原有行为，一个字都没改。
	const result = await removeAdFingerprint(env, arg);
	if (!result.ok) {
		await sendTelegramMessage(chatId, '❌ 删除指纹失败：' + escapeHtml(String(result.reason || '未知')));
		return;
	}
	if (!result.removed) {
		await sendTelegramMessage(chatId, '⚠️ 指纹库中没有 <code>' + escapeHtml(arg) + '</code>，未做任何改动。');
		return;
	}
	await sendTelegramMessage(chatId, '✅ 已删除 <b>' + result.removed + '</b> 条指纹：<code>' + escapeHtml(arg) + '</code>');
}

// /words [关键词] [页码]：按命中次数倒序分页列出指纹库，每页 AD_WORDS_PAGE_LIMIT 条。
//
// 2026-09-09 主人要求新增关键词搜索：「要是有广告有类似的词 就可以通过这个查找，
// 并且筛选误封的指纹进行删除」。所以它的定位是【配合 /delword 挑误封指纹】，
// 匹配范围只有 value 一列（主人选定，source 不搜）。
//
// 参数解析要同时喂三种写法，且【不能破坏老写法】：
//   /words            → 第 1 页，无关键词
//   /words 2          → 第 2 页，无关键词（纯数字仍当页码，老行为原样保留）
//   /words 收U        → 搜「收U」第 1 页
//   /words 收U 2      → 搜「收U」第 2 页（按钮塞不下时的文本兜底写法）
function parseAdWordsArg(arg) {
	const tokens = String(arg || '').trim().split(/\s+/).filter(Boolean);
	if (!tokens.length) return { keyword: '', page: 1 };
	// 末尾是纯数字且前面还有别的词 → 那个数字是页码，其余是关键词。
	if (tokens.length > 1 && /^\d+$/.test(tokens[tokens.length - 1])) {
		return { keyword: tokens.slice(0, -1).join(' '), page: Math.max(1, parseInt(tokens[tokens.length - 1], 10) || 1) };
	}
	// 只有一个纯数字 token → 老写法的页码。想搜纯数字指纹（例如「8888」）就写 `/words 8888 1`。
	if (tokens.length === 1 && /^\d+$/.test(tokens[0])) {
		return { keyword: '', page: Math.max(1, parseInt(tokens[0], 10) || 1) };
	}
	return { keyword: tokens.join(' '), page: 1 };
}

// 渲染一页。命令首次发送与按钮翻页【共用同一个渲染器】，
// 否则编辑后的文本会与首次发送的排版不一致，翻一页就换个长相。
async function renderAdWordsPage(env, { page = 1, keyword = '' } = {}) {
	const limit = AD_WORDS_PAGE_LIMIT;
	const safePage = Math.max(1, Number(page) || 1);
	const result = await listAdFingerprints(env, { limit, offset: (safePage - 1) * limit, keyword });
	if (!result.ok) return { ok: false, notice: '读取指纹库失败' };
	const label = keyword ? '🔎 指纹库搜索：<code>' + escapeHtml(keyword) + '</code>' : '🔎 指纹库';
	if (!result.total) {
		return {
			ok: true,
			empty: true,
			text: keyword
				? '📭 <b>' + label + '</b>\n\n没有匹配的指纹。搜索只匹配指纹内容（value），不匹配来源。'
				: '📭 <b>指纹库</b>\n\n当前为空。自动学习会在确认广告后逐步积累，也可用 /addword 手动添加。',
			keyboard: null,
			fallbackLine: ''
		};
	}
	const totalPages = Math.max(1, Math.ceil(result.total / limit));
	const lines = ['<b>' + label + '</b>', '共 <b>' + result.total + '</b> 条　第 ' + safePage + '/' + totalPages + ' 页', ''];
	if (!result.rows.length) {
		lines.push('该页没有数据，最大页码 ' + totalPages + '。');
	}
	for (const row of result.rows) {
		lines.push(
			'[' + escapeHtml(row.type) + '] <code>' + escapeHtml(String(row.value).slice(0, 50)) + '</code>'
		);
		lines.push(
			'　权重 ' + row.weight + '　命中 ' + row.matchCount + '　误判 ' + row.falsePositiveCount
			+ '　置信 ' + row.confidence.toFixed(2) + '　来源 ' + escapeHtml(row.source)
		);
	}
	const keyboard = buildAdPaginationKeyboard(
		AD_WORDS_PAGINATION_PREFIX, safePage, totalPages, encodeAdCallbackToken(keyword)
	);
	// 文本兜底：只在「按钮挂不上」时才附加（消息被分块，或关键词长到 callback_data 装不下）。
	const fallbackLine = totalPages > 1
		? '翻页：<code>/words ' + (keyword ? escapeHtml(keyword) + ' ' : '') + Math.min(totalPages, safePage + 1) + '</code>'
		: '';
	return { ok: true, text: lines.join('\n'), keyboard, fallbackLine, totalPages };
}

async function handleAdWordsCommand(env, chatId, arg) {
	const { keyword, page } = parseAdWordsArg(arg);
	const rendered = await renderAdWordsPage(env, { page, keyword });
	if (!rendered.ok) {
		await sendTelegramMessage(chatId, '❌ 读取指纹库失败。');
		return;
	}
	await sendAdPagedMessage(chatId, rendered.text, rendered.keyboard, rendered.fallbackLine);
}

// /addsample <文本>：新增语义样本。向量不在此刻生成，由检测时的懒加载分批补齐，
// 避免一条命令里连跑多次 AI 推理撞上单请求子请求上限。
async function handleAdAddSampleCommand(env, chatId, arg) {
	if (!arg) {
		await sendTelegramMessage(chatId, [
			'用法：<code>/addsample 收各种赚钱包盒项目 秒结不拖欠</code>',
			'',
			'样本用于第三层 AI 语义相似度比对，建议直接粘贴真实广告原文。',
			'向量由检测时分批自动补齐（每次最多 ' + AD_SAMPLE_LAZY_BATCH + ' 条），无需手动触发。'
		].join('\n'));
		return;
	}
	const result = await addAdSample(env, arg, { source: 'manual' });
	if (!result.ok) {
		const reasonMap = { too_short: '样本太短（至少 4 个字符）', unavailable: '数据表不可用', error: '写入失败' };
		await sendTelegramMessage(chatId, '❌ 添加样本失败：' + (reasonMap[result.reason] || result.reason));
		return;
	}
	const counts = await countAdSamples(env);
	await sendTelegramMessage(chatId, [
		result.added ? '<b>✅ 样本已添加</b>' : '<b>ℹ️ 样本已存在</b>',
		'内容：' + escapeHtml(String(result.text).slice(0, 120)),
		'样本库：共 <b>' + counts.total + '</b> 条，已生成向量 <b>' + counts.ready + '</b> 条'
	].join('\n'));
}

// /warmup：手动补齐语义样本向量，每次最多 AD_SAMPLE_LAZY_BATCH 条。
// 存在意义：向量原本只在第三层被调用时懒加载，而第三层需要可疑消息才会触发，
// 指纹层命中即定罪的情况更走不到 —— 于是新部署的向量可能长期为 0，第三层空转。
// 本命令给主人一个明确的补齐入口与进度反馈，反复执行即可补满。
// 单次仍受 AD_SAMPLE_LAZY_BATCH 限制，避免一口气跑几十次 AI 推理撞子请求预算。
async function handleAdWarmupCommand(env, chatId) {
	const config = loadAdDetectionConfig(env);
	if (!config.aiEnabled) {
		await sendTelegramMessage(chatId, [
			'⚠️ <b>未绑定 Workers AI</b>',
			'',
			'第三层语义判定不可用，无需补齐向量。',
			'当前按「结构化评分 + 指纹库」两层工作。'
		].join('\n'));
		return;
	}
	const before = await countAdSamples(env);
	if (!before.total) {
		await sendTelegramMessage(chatId, '📭 样本库为空，请先用 <code>/addsample 文本</code> 添加样本。');
		return;
	}
	// 【2026-09-08 目标从 min(total, 30) 改成 total】配套 topUpAdSampleEmbeddings 去掉 30 条硬上限。
	// 旧口径：target = min(total, 30)，库里有 50 条样本、其中 32 条有向量时 32 >= 30 成立，
	// 于是走进下面的「✅ 向量已就绪 … 无需再补」分支 —— 而实际还有 18 条样本永远没有向量、
	// 永不参与判定（loadAdSampleEmbeddings 只读 embedding IS NOT NULL）。离线实测确认过这个误报。
	// 新口径：只要还有一条样本没向量就不算就绪，因为现在补齐没有上限、每条样本都该拿到向量。
	const target = before.total;
	// 陈旧向量优先处理：维度不符的向量在判定时会被跳过，此时 ready 达标也不代表第三层可用，
	// 直接报「已就绪」会误导运维。必须先引导清空，否则 /warmup 补不动（embedding 非 NULL 不会被重算）。
	if (before.stale > 0) {
		await sendTelegramMessageChunks(chatId, [
			'⚠️ <b>存在旧模型维度的向量</b>',
			'',
			'共 <b>' + before.stale + '</b> 条向量的维度与当前模型不符，判定时会被跳过。',
			'当前模型：<code>' + AD_EMBEDDING_MODEL + '</code>（' + AD_EMBEDDING_DIMENSION + ' 维）',
			'',
			'这些行的 embedding 非空，<code>/warmup</code> 不会重算它们。',
			'请先发 <code>/clearsamples</code> 清空样本库（会走二次确认），',
			'再用 <code>/addsample</code> 补回你的自定义样本，然后重新 <code>/warmup</code>。',
			'',
			'提示：内置 10 条种子样本会在样本表为空时由下次冷启动的建表检查补回'
			+ '（同一 isolate 内建表结果被缓存，不会立即重建）。'
		].join('\n'));
		return;
	}
	if (before.ready >= target) {
		await sendTelegramMessage(chatId, [
			'✅ <b>向量已就绪</b>',
			'',
			'全部 <b>' + before.total + '</b> 条样本均已生成向量。',
			'第三层 AI 语义判定正常工作，无需再补。'
		].join('\n'));
		return;
	}
	const filled = await topUpAdSampleEmbeddings(env);
	const after = await countAdSamples(env);
	const remain = Math.max(0, after.total - after.ready);
	const lines = [
		filled > 0 ? '✅ <b>已生成 ' + filled + ' 条向量</b>' : '⚠️ <b>本次未生成任何向量</b>',
		'',
		'进度：<b>' + after.ready + '</b> / ' + after.total + ' 条样本已生成向量'
	];
	if (remain > 0) {
		lines.push('还差 <b>' + remain + '</b> 条，再发 /warmup 继续（每次最多 ' + AD_SAMPLE_LAZY_BATCH + ' 条）。');
	} else {
		lines.push('全部样本向量已补齐，第三层 AI 语义判定现已生效。');
	}
	if (filled === 0) {
		lines.push('');
		lines.push('未生成的可能原因：AI 调用失败或限流。可查 Workers Logs 搜 <code>[广告检测]</code> 前缀。');
	}
	await sendTelegramMessageChunks(chatId, lines.join('\n'));
}

// /clearsamples：清空全部语义样本（含内置种子）。破坏性操作 → 走 D1 一次性令牌二次确认。
// 纯 D1 环境没有 KV 的 TTL，令牌表用 expires_at + 读取即删实现 60 秒有效且只能用一次。
async function handleAdClearSamplesCommand(env, chatId, ownerId, arg) {
	const counts = await countAdSamples(env);
	if (!arg) {
		if (!counts.total) {
			await sendTelegramMessage(chatId, '📭 样本库已经是空的，无需清理。');
			return;
		}
		const token = await issueAdConfirmToken(env, 'clear_samples', ownerId, { total: counts.total });
		if (!token) {
			await sendTelegramMessage(chatId, '❌ 签发确认令牌失败，请稍后重试。');
			return;
		}
		await sendTelegramMessage(chatId, [
			'<b>⚠️ 确认清空语义样本库</b>',
			'',
			'当前共 <b>' + counts.total + '</b> 条样本（含内置种子 ' + AD_SAMPLE_SEED_TEXTS.length + ' 条），已生成向量 ' + counts.ready + ' 条。',
			'清空后第三层 AI 语义检测会失效，直到重新添加样本。',
			'',
			'确认请在 60 秒内执行：',
			'<code>/clearsamples ' + token + '</code>'
		].join('\n'));
		return;
	}

	const consumed = await consumeAdConfirmToken(env, arg, 'clear_samples', ownerId);
	if (!consumed) {
		await sendTelegramMessage(chatId, '❌ 令牌无效、已使用或已过期（有效期 60 秒）。\n请重新执行 /clearsamples 获取新令牌。');
		return;
	}
	const result = await clearAdSamples(env);
	if (!result.ok) {
		await sendTelegramMessage(chatId, '❌ 清空样本失败：' + escapeHtml(String(result.reason || '未知')));
		return;
	}
	await sendTelegramMessage(chatId, [
		'<b>🗑 样本库已清空</b>',
		'删除 <b>' + result.removed + '</b> 条样本。',
		'',
		'第三层 AI 语义检测当前无样本可比，实际按「评分 + 指纹」两层运行。',
		'用 /addsample 重新添加样本即可恢复。'
	].join('\n'));
}

// /adstats：一屏看全检测状态 —— 配置、指纹库、样本库、观察窗口、待确认快照、域名白名单。
async function handleAdStatsCommand(env, chatId) {
	const config = loadAdDetectionConfig(env);
	// 顺带补一批样本向量。此前 topUpAdSampleEmbeddings 的唯一调用点在 checkAdAiSimilarity 内部，
	// 而第三层只在消息通过零成本预筛后才会走到 —— 形成死锁：
	//   没有可疑消息 → 第三层不被调用 → 向量不补 → 一直 0 条 → 即使来了可疑消息，
	//   samples 为空也直接返回相似度 0，第三层等于不存在。
	// 指纹层命中即定罪的情况更走不到第三层，向量可能永远补不上。
	// 放在 /adstats 里：主人查状态是自然的补齐时机，且能立刻在回执里看到进度。
	const warmed = await topUpAdSampleEmbeddings(env);
	const now = Math.floor(Date.now() / 1000);
	const samples = await countAdSamples(env);
	const whitelist = await loadAdDomainWhitelist(env);

	let fpTotal = 0;
	let fpByType = [];
	let fpTop = [];
	let screeningCount = 0;
	let pendingCount = 0;
	let whitelistRows = 0;
	try {
		const rows = await env.DB.batch([
			env.DB.prepare('SELECT COUNT(*) AS c FROM ad_fingerprints'),
			env.DB.prepare('SELECT type, COUNT(*) AS c FROM ad_fingerprints GROUP BY type ORDER BY c DESC'),
			env.DB.prepare('SELECT type, value, match_count FROM ad_fingerprints ORDER BY match_count DESC, updated_at DESC LIMIT 5'),
			env.DB.prepare('SELECT COUNT(*) AS c FROM ad_user_screening WHERE expires_at > ?').bind(now),
			env.DB.prepare('SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE expires_at > ?').bind(now),
			env.DB.prepare('SELECT COUNT(*) AS c FROM ad_domain_whitelist')
		]);
		fpTotal = Number(rows[0]?.results?.[0]?.c) || 0;
		fpByType = rows[1]?.results || [];
		fpTop = rows[2]?.results || [];
		screeningCount = Number(rows[3]?.results?.[0]?.c) || 0;
		pendingCount = Number(rows[4]?.results?.[0]?.c) || 0;
		whitelistRows = Number(rows[5]?.results?.[0]?.c) || 0;
	} catch (error) {
		console.error('[广告检测] 统计查询失败:', error);
	}

	const lines = [
		'<b>📊 广告检测状态</b>',
		'',
		'<b>判定配置</b>',
		'封禁阈值：<b>' + config.scoreThreshold + '</b>　观察阈值：<b>' + config.observationScore + '</b>',
		'观察窗口：' + config.observationHours + ' 小时',
		'AI 语义阈值：' + config.aiSimilarityThreshold + '　指纹最低置信：' + config.fingerprintMinConfidence,
		'第三层 AI：' + (config.aiEnabled ? '✅ 已绑定（' + AD_EMBEDDING_MODEL + ' / ' + AD_EMBEDDING_DIMENSION + ' 维）' : '⚠️ 未绑定，降级为评分 + 指纹两层'),
		'',
		'<b>指纹库</b>　共 <b>' + fpTotal + '</b> 条'
	];
	if (fpByType.length) {
		lines.push('分类：' + fpByType.map((r) => escapeHtml(String(r.type)) + ' ' + (Number(r.c) || 0)).join('　'));
	}
	for (const row of fpTop) {
		lines.push('· [' + escapeHtml(String(row.type)) + '] ' + escapeHtml(String(row.value).slice(0, 40)) + '　命中 ' + (Number(row.match_count) || 0));
	}
	lines.push('');
	lines.push('<b>语义样本</b>　共 <b>' + samples.total + '</b> 条，已生成向量 <b>' + samples.ready + '</b> 条');
	if (warmed > 0) {
		lines.push('　↳ 本次顺带生成 <b>' + warmed + '</b> 条向量' + (samples.ready < samples.total ? '，再发几次 /adstats 或 /warmup 可继续补齐' : ''));
	} else if (config.aiEnabled && samples.ready === 0 && samples.total > 0) {
		lines.push('　↳ ⚠️ 向量为 0，第三层 AI 实际未生效，请发 /warmup 补齐');
	} else if (config.aiEnabled && samples.ready < samples.total) {
		// 配套「向量补齐无上限」：只要还有样本没向量就明确报出来，
		// 不再因为「够 30 条了」就假装齐了 —— 没向量的样本是完全不参与判定的。
		lines.push('　↳ 还有 <b>' + (samples.total - samples.ready) + '</b> 条样本没有向量，发 /warmup 可继续补齐');
	}
	if (samples.stale > 0) {
		lines.push('　↳ ⚠️ 其中 <b>' + samples.stale + '</b> 条是旧模型维度，判定时会被跳过');
		lines.push('　　 用 /clearsamples 清空后重新 /warmup 生成');
	}
	lines.push('<b>观察窗口</b>　窗口内 <b>' + screeningCount + '</b> 人');
	lines.push('<b>待确认快照</b>　<b>' + pendingCount + '</b> 条（保留 1 小时）');
	lines.push('<b>域名白名单</b>　生效 <b>' + whitelist.size + '</b> 条（D1 自定义 ' + whitelistRows + ' 条，内置种子 ' + AD_DOMAIN_WHITELIST_SEED.length + ' 条）');
	await sendTelegramMessageChunks(chatId, lines.join('\n'));
}

// /whitelist [list|add|del] [域名]：域名白名单管理。
// D1 表为空时自动回落到内置种子，所以「删到空」不会导致所有链接都被判广告。
async function handleAdWhitelistCommand(env, chatId, ownerId, arg) {
	const parts = arg ? arg.split(/\s+/) : [];
	const action = (parts[0] || 'list').toLowerCase();
	const target = parts.slice(1).join(' ').trim();

	if (action === 'add' || action === 'del') {
		if (!target) {
			await sendTelegramMessage(chatId, '用法：<code>/whitelist ' + action + ' github.com</code>');
			return;
		}
		const result = action === 'add'
			? await addAdDomainWhitelist(env, target, ownerId)
			: await removeAdDomainWhitelist(env, target);
		if (!result.ok) {
			const reasonMap = { invalid: '域名不合法', unavailable: '数据表不可用', error: '写入失败' };
			await sendTelegramMessage(chatId, '❌ 操作失败：' + (reasonMap[result.reason] || result.reason));
			return;
		}
		if (action === 'add') {
			await sendTelegramMessage(chatId, (result.added ? '✅ 已加入白名单：' : 'ℹ️ 已在白名单中：') + '<code>' + escapeHtml(result.domain) + '</code>');
		} else {
			await sendTelegramMessage(chatId, (result.removed ? '✅ 已从白名单移除：' : '⚠️ 白名单中没有该域名：') + '<code>' + escapeHtml(result.domain) + '</code>');
		}
		return;
	}

	if (action !== 'list') {
		await sendTelegramMessage(chatId, '用法：<code>/whitelist list</code>｜<code>/whitelist add github.com</code>｜<code>/whitelist del github.com</code>');
		return;
	}

	let customRows = [];
	try {
		const { results } = await env.DB.prepare('SELECT domain, added_by, created_at FROM ad_domain_whitelist ORDER BY created_at DESC LIMIT 50').all();
		customRows = results || [];
	} catch (error) {
		console.error('[广告检测] 读取白名单失败:', error);
	}
	const effective = await loadAdDomainWhitelist(env);
	const lines = [
		'<b>🛡 域名白名单</b>',
		'生效 <b>' + effective.size + '</b> 条（白名单内的域名不计入链接可疑分）',
		''
	];
	if (customRows.length) {
		lines.push('<b>D1 自定义（' + customRows.length + ' 条）</b>');
		for (const row of customRows) lines.push('· <code>' + escapeHtml(String(row.domain)) + '</code>');
	} else {
		lines.push('D1 自定义：无，当前使用内置种子 ' + AD_DOMAIN_WHITELIST_SEED.length + ' 条。');
		lines.push('提示：一旦用 /whitelist add 添加任意域名，生效集合即切换为 D1 表内容，内置种子不再自动合并。');
	}
	lines.push('');
	lines.push('支持 <code>*.example.com</code> 形式的泛域名；子域名自动向上匹配父域。');
	await sendTelegramMessageChunks(chatId, lines.join('\n'));
}

// /rescreen [数量]：对观察窗口内的用户按当前指纹库与样本库重新判定。
// 用途是「刚学会新指纹，回头把窗口里的人再筛一遍」。
// 每个用户要付出 getChat + getChatMember + 一次 AI 推理，所以默认只跑 10 个，上限 30，
// 避免单次命令撞上 Worker 单请求子请求上限。
async function handleAdRescreenCommand(env, chatId, arg) {
	const parsed = parseInt(arg, 10);
	const limit = Number.isFinite(parsed) && parsed > 0
		? Math.min(AD_RESCREEN_BATCH_LIMIT, parsed)
		: Math.min(AD_RESCREEN_BATCH_LIMIT, 10);

	let rows = [];
	try {
		const result = await env.DB.prepare(
			'SELECT user_id, chat_id, score, snapshot FROM ad_user_screening WHERE expires_at > ? ORDER BY score DESC, updated_at DESC LIMIT ?'
		).bind(Math.floor(Date.now() / 1000), limit).all();
		rows = result?.results || [];
	} catch (error) {
		console.error('[广告检测] 读取观察窗口失败:', error);
		await sendTelegramMessage(chatId, '❌ 读取观察窗口失败。');
		return;
	}
	if (!rows.length) {
		await sendTelegramMessage(chatId, '📭 观察窗口内没有待复判的用户。');
		return;
	}

	const config = loadAdDetectionConfig(env);
	const whitelist = await loadAdDomainWhitelist(env);
	const banned = [];
	const kept = [];
	const cleared = [];
	const failed = [];

	for (const row of rows) {
		const userId = String(row.user_id || '');
		if (!userId) continue;
		let snapshot = {};
		try { snapshot = JSON.parse(String(row.snapshot || '{}')); } catch { snapshot = {}; }
		const targetChatId = String(row.chat_id || '') || String(GROUP_IDS[0] || '');
		try {
			if (isPrivilegedManager(userId)) { cleared.push(userId); await deleteAdScreening(env, userId); continue; }
			const already = await checkBlacklist(userId, env);
			if (already.isBlacklisted) { cleared.push(userId); await deleteAdScreening(env, userId); continue; }

			const profile = await fetchAdUserProfile(userId, {});
			if (targetChatId) profile.status = await fetchAdMemberStatus(targetChatId, userId);
			// 复判用当前库重新算分，不叠加历史分：历史分本就来自同一份资料，叠加等于重复计分。
			const evaluation = await evaluateAdSuspect(
				env,
				{ profile, text: String(snapshot.text || ''), forwardChat: null },
				{ config, whitelist }
			);

			if (evaluation.verdict === 'ban') {
				await enforceAdDetection(env, {
					userId,
					chatId: targetChatId,
					chatTitle: '',
					messageId: null
				}, evaluation, { config, whitelist });
				banned.push(userId + '(' + evaluation.score + ')');
			} else if (evaluation.verdict === 'observe') {
				await upsertAdScreening(env, userId, {
					chatId: targetChatId,
					// 定时复查只看资料卡、没有正文 —— retainScore 恒为 0，
					// 正是要的结果：静态资料分不许进观察历史（见 retainScore 说明）。
					score: evaluation.retainScore ?? 0,
					reasons: evaluation.reasons,
					snapshot: evaluation.snapshot,
					layer: evaluation.layer
				}, config);
				kept.push(userId + '(' + evaluation.score + ')');
			} else {
				await deleteAdScreening(env, userId);
				cleared.push(userId);
			}
		} catch (error) {
			console.error('[广告检测] 复判失败 user=' + userId + ':', error);
			failed.push(userId);
		}
	}

	const lines = [
		'<b>🔄 观察窗口复判完成</b>',
		'本次处理 <b>' + rows.length + '</b> 人（上限 ' + limit + '）',
		'',
		'判定为广告并封禁：<b>' + banned.length + '</b>',
		'继续观察：<b>' + kept.length + '</b>',
		'解除观察：<b>' + cleared.length + '</b>',
		'复判失败：<b>' + failed.length + '</b>'
	];
	if (banned.length) {
		lines.push('');
		lines.push('已封禁：');
		for (const item of banned.slice(0, 10)) lines.push('· <code>' + escapeHtml(item) + '</code>');
	}
	if (failed.length) {
		lines.push('');
		lines.push('失败：' + failed.slice(0, 10).map((id) => escapeHtml(id)).join('、'));
	}
	if (banned.length) {
		lines.push('');
		lines.push('每个封禁都已生成快照，用 /pending 查看，判错用 /ignore 序号 回滚。');
	}
	await sendTelegramMessageChunks(chatId, lines.join('\n'));
}

// === 回复式学习 ===
// 管理员在群里回复一条广告消息并说「广告」/「封」/「学习」→ 立即学入指纹库并封禁作者；
// 说「不是广告」/「误判」→ 反向操作：解封 + 给命中的指纹累加误判计数。
// 否定词必须先判：「不是广告」本身包含触发词「广告」，顺序反了就会把纠错当确认执行。
// 触发要求回复文本足够短，避免正常聊天里带一句「这广告真烦」被当成指令。
function classifyAdReplyIntent(text) {
	const value = String(text ?? '').trim();
	if (!value || value.length > 20) return '';
	// 【slash 命令一律不进回复学习】2026-09-08 主人选定的「宽特例」。
	//
	// 起因：AD_REPLY_LEARN_TRIGGER_PATTERNS 里的 /\bspam/i 会被 `/spam` 自己命中
	//（`/` 与 `s` 之间词边界成立），而 handleAdReplyLearning 排在命令分发【之前】，
	// 于是「引用某条广告 + 发 /spam」永远被回复学习截走并 return true ——
	// /spam 引用分支里那段 source='spam' 的自动学习一次都执行不到，等于死代码。
	//
	// 后果不只是走错分支：回复学习学的指纹标 source='manual'，而 manual 会被
	// markAdFingerprintFalsePositive 的退役 DELETE 豁免（那句带 source != 'manual'）。
	// 也就是说 /spam 学到的每一条指纹都是永久的 —— 万一学到「实名号」这类正常人也会说
	// 的词，之后每个说这词的人都被封，/ignore 解封多少次都清不掉它。
	// source='spam' 的设计初衷正是保住这条误报自动退役的安全网。
	//
	// 特例做宽（所有 slash 命令）而不是只放行 /spam：`/ban 广告号` 会命中中文触发词
	// 「广告」，`/kick 封了他` 命中「封了」—— 只堵 /spam 的话同一个坑换个命令就能再踩。
	// 命令有自己的分发分支，回复学习只负责「说人话」那条路（回复 + 「这是广告」）。
	if (isTelegramSlashCommand(value)) return '';
	const lower = value.toLowerCase();
	for (const negator of AD_REPLY_LEARN_NEGATORS) {
		if (lower.includes(String(negator).toLowerCase())) return 'negative';
	}
	for (const trigger of AD_REPLY_LEARN_TRIGGERS) {
		if (lower.includes(String(trigger).toLowerCase())) return 'positive';
	}
	// 英文触发词单独走词边界正则，放在中文之后：否定词已在上面拦过，这里只剩纯肯定语义。
	for (const pattern of AD_REPLY_LEARN_TRIGGER_PATTERNS) {
		if (pattern.test(value)) return 'positive';
	}
	return '';
}

// 返回 true 表示已处理该消息（调用方应立即 return），false 表示放行。
// ctx 必须由调用方透传：sendFlashMessage 靠 ctx.waitUntil 注册延时撤回，
// 传 null 会让闪屏永久留在群里（回执含 TGID 与指纹计数，不该长期公开展示）。
async function handleAdReplyLearning(message, env, ctx) {
	if (!env?.DB) return false;
	const chat = message?.chat;
	const target = message?.reply_to_message;
	const from = message?.from;
	if (!chat || !target || !from || from.is_bot) return false;
	if (!isConfiguredGroup(chat.id)) return false;

	const intent = classifyAdReplyIntent(message.text);
	if (!intent) return false;

	const operatorId = from.id;
	const isAllowed = isPrivilegedManager(operatorId) || await checkIfUserIsAdminInGroup(operatorId, chat.id);
	if (!isAllowed) return false;

	const targetUser = target.from;
	if (!targetUser || targetUser.is_bot) return false;
	const targetId = String(targetUser.id);
	if (isPrivilegedManager(targetId)) {
		await sendFlashMessage(chat.id, '⚠️ 目标是管理层，已忽略该操作。', ctx);
		return true;
	}
	if (!(await adDetectionReady(env))) return false;

	const config = loadAdDetectionConfig(env);
	const whitelist = await loadAdDomainWhitelist(env);
	const targetText = String(target.text ?? target.caption ?? '').trim();
	// 被举报那条消息自己的引用体：/spam 也要能吃「正文一个字母 + 引用广告」这种形态，
	// 否则管理员举报它时评分依据里一个广告词都看不到，快照与复盘信息全是空的。
	const targetQuotedText = getAdQuotedText(target);
	const profile = await fetchAdUserProfile(targetId, targetUser);
	const forwardChat = target.forward_from_chat || target.forward_origin?.chat || null;

	// 纠错分支：不判定、不评分，直接回滚 + 给命中的指纹记误判。
	if (intent === 'negative') {
		const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
		const payload = {
			name: displayName,
			username: profile.username ? '@' + String(profile.username).replace(/^@/, '') : '',
			bio: profile.bio || '',
			text: targetText,
			domains: extractAdDomains([displayName, profile.bio, targetText].filter(Boolean).join('\n'))
		};
		const removed = await removeFromBlacklist(targetId, env);
		let unbanOk = 0;
		let unbanTotal = 0;
		if (removed.success || removed.code === 'NOT_FOUND') {
			const results = await unbanUserFromAllGroups(targetId);
			unbanTotal = results.length;
			unbanOk = results.filter((r) => r.ok).length;
		}
		// purge: true —— 管理员已经明确声明这是误判，指纹当次即删，不再攒 3 次误报。
		// 主人原话：「除非说误判了，我就可以通过指定的指令执行全群解封并给指纹记误报 + 删除记录的指纹。」
		const fp = await markAdFingerprintFalsePositive(env, payload, { purge: true });
		// 同步清掉当初自动学进去的那条 AI 语义样本。拼法必须走 buildAdSampleText，
		// 与 enforceAdDetection 写入时完全一致，否则 text_hash 对不上、静默删不掉，
		// 错样本会永久留在库里继续把相似的正常用户往高相似度上拉（AI 层是硬命中即封）。
		const sampleRemoved = await removeAdSampleByText(env, buildAdSampleText(payload));
		await deleteAdScreening(env, targetId);
		await sendTelegramMessage(chat.id, [
			'<b>♻️ 已按误判处理</b>',
			'用户：<code>' + escapeHtml(targetId) + '</code>',
			'黑名单：' + (removed.success ? '已移除' : (removed.code === 'NOT_FOUND' ? '本就不在黑名单' : '移除失败')),
			'解封：' + unbanOk + '/' + unbanTotal + ' 个群成功',
			'指纹修正：' + (fp.ok ? '标记 ' + (fp.affected || 0) + ' 条误判，删除 ' + (fp.retired || 0) + ' 条' : '标记失败'),
			'AI 样本：' + (sampleRemoved.ok ? (sampleRemoved.removed > 0 ? '已删除 ' + sampleRemoved.removed + ' 条' : '无对应样本') : '删除失败')
		].join('\n'));
		return true;
	}

	// 确认分支：管理员已经明确说这是广告，所以不再让阈值裁决，强制按封禁处置；
	// 但仍跑一次完整判定，为的是拿到真实得分与命中依据写进快照，便于事后复盘。
	profile.status = await fetchAdMemberStatus(chat.id, targetId);
	const evaluation = await evaluateAdSuspect(env, { profile, text: targetText, quotedText: targetQuotedText, forwardChat }, { config, whitelist });
	evaluation.verdict = 'ban';
	// 【2026-09-11 记录触发原文】触发回复在下面会被 deleteMessage 删掉，被举报消息也一起删，
	// 于是群里两条痕迹全无，而 Telegram 后台只记管理员动作、不记普通聊天 ——
	// 线上排查一次误封要翻 Cloudflare 日志逐条展开 update 才能找出谁说了哪句话，
	// 且日志只留 7 天，过期后彻底无法追溯。把原文写进 reasons 后它随快照进 D1，
	// /pending 直接可见，追责与复盘不再依赖外部日志。
	const triggerText = String(message.text ?? '').trim().slice(0, 60);
	evaluation.reasons.push('管理员 ' + operatorId + ' 回复判定为广告（原文:' + (triggerText || '（空）') + '）');

	// ===== 语义样本取材：正文太短时改用引用体（2026-09-08 项 6）=====
	// 原实现固定用 name + bio + text。碰上「本人正文只有一个字母 c、广告全在引用块里」
	// 这种形态（线上漏放 50+ 个号的共同特征），拼出来的就是「Maybell Tillman c」这种废话 ——
	// 离线实测确认过库里真的存着这条。学一堆人名进 AI 样本库不但没有召回价值，
	// 还会把「英文人名 + 单字母」这个模式推成广告特征，反过来误伤正常外国用户。
	//
	// 换用引用体的两个前提，缺一不可：
	//   1) 本人正文短到没有语义（≤ AD_QUOTED_KILL_MAX_OWN_TEXT）—— 正文有内容时那才是他自己写的东西；
	//   2) 本人正文不含举报 / 吐槽语义 —— 这是 judgeAdQuotedKill 的门槛二，防止管理员
	//      误举报「引用广告并回一句『骗子』」的群友时，把那段广告记成【举报者】的特征。
	// 刻意【不要求】引用体过构词判据：/spam 是人工确认路径，主人的口径是
	// 「有权限的人使用这个指令去提交就绝对是广告」，新型广告本来就抓不到构词，
	// 要是这里再卡一道判据，最该学的新变体反而学不到。
	const ownSnapshotText = String(evaluation.snapshot.text || '').trim();
	const quotedForSample = String(targetQuotedText || '').trim();
	const useQuotedForSample = Boolean(quotedForSample)
		&& ownSnapshotText.length <= AD_QUOTED_KILL_MAX_OWN_TEXT
		&& !countAdKeywordHits(ownSnapshotText, AD_QUOTED_KILL_NEGATORS).length;
	const semanticText = buildAdSampleText({
		name: evaluation.snapshot.name,
		bio: evaluation.snapshot.bio,
		text: useQuotedForSample ? quotedForSample : evaluation.snapshot.text
	});
	const semanticSource = useQuotedForSample ? 'reply-quoted' : 'reply';
	const learn = await learnAdFingerprints(env, evaluation.payload, { source: 'manual', createdBy: String(operatorId) });

	// 先删被举报的那条广告消息，再走统一处置链（处置链里的 revoke_messages 会清该用户其余消息）。
	if (target.message_id) {
		try { await deleteMessage(chat.id, target.message_id); } catch (error) { console.error('[广告检测] 删除被举报消息失败:', error); }
	}
	// 样本不在这里自己写，而是把取材结果交给 enforceAdDetection 统一落库 ——
	// 那边（项 7）现在也会自动加样本，两处都写会往库里塞一条纯噪声的
	// 「昵称 + 单字母」样本，把上面这段取材逻辑白做掉。
	const enforced = await enforceAdDetection(env, {
		userId: targetId,
		chatId: chat.id,
		chatTitle: chat.title || '',
		messageId: null
	}, evaluation, { config, whitelist, sampleText: semanticText, sampleSource: semanticSource });

	await deleteMessage(chat.id, message.message_id);
	await sendFlashMessage(chat.id, [
		'✅ 已按广告处置 ' + targetId,
		'指纹 +' + (Number(learn?.learned) || 0) + '　封禁 ' + (enforced.banSummary || '未知')
	].join('\n'), ctx);

	// 群内只留 5 秒闪屏（含 TGID 与指纹计数，不宜长期公开），完整详情私聊第一主人。
	// enforceAdDetection 内部只在【自动判定】路径推送快照通知；回复学习是管理员主动触发，
	// 此前没有任何私聊回执 —— 群里闪屏一撤回就什么都不剩，主人无从知晓谁在替他做处置。
	// 这里补上操作人、目标、判定依据与后续可用命令，与自动判定通知的信息量对齐。
	const ownerId = getOwnerNotifyTargets()[0] || '';
	if (ownerId) {
		const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
		const noticeLines = [
			'<b>🛡 回复学习已执行</b>',
			'',
			'<b>操作人：</b>' + formatUserReference(operatorId, from),
			'<b>群组：</b>' + escapeHtml(chat.title || '未知') + '（<code>' + escapeHtml(String(chat.id)) + '</code>）',
			// 触发原文：这条回复马上会被删除，群内不留痕迹。放在通知顶部而非埋进命中依据里，
			// 是因为「谁说了哪句话导致封禁」是追责第一现场，比得分和依据更需要一眼看到。
			'<b>触发原文：</b>' + (triggerText ? escapeHtml(triggerText) : '（空）'),
			'',
			'<b>目标：</b><code>' + escapeHtml(targetId) + '</code>',
			// 不脱敏，与自动判定通知 renderAdDetectionNotice 的口径一致：
			// 这条通知只发给第一主人，不存在群内二次传播的风险；而昵称本身就是判定依据
			//（结构判据「机器生成型西方全名」「非常用书写系统短随机串」都靠它给分），
			// 脱敏成「F***r」主人就无法复核这条依据到底成不成立。
			'<b>昵称：</b>' + (displayName ? escapeHtml(displayName) : '（空）'),
			'<b>判定得分：</b>' + evaluation.score + '（管理员强制判定，不受阈值裁决）',
			'<b>命中依据：</b>' + escapeHtml(evaluation.reasons.slice(0, 6).join('；') || '（无）'),
			'',
			'<b>处置结果</b>',
			'黑名单：' + (enforced.blacklistCode === 'ADDED' ? '已加入' : enforced.blacklistCode === 'EXISTS' ? '此前已在黑名单' : String(enforced.blacklistCode || '未知')),
			'全群封禁：' + (enforced.banSummary || '未知'),
			'学入指纹：' + (Number(learn?.learned) || 0) + ' 条（manual 来源，豁免误报退役）',
			''
		];
		if (enforced.seq) {
			noticeLines.push('复核：/pending 查看第 <b>' + enforced.seq + '</b> 号快照，'
				+ '判错发 <code>/ignore ' + enforced.seq + '</code> 可解黑 + 全群解封 + 给指纹记误报。');
		} else {
			noticeLines.push('如需撤销：<code>/unban ' + escapeHtml(targetId) + '</code>');
		}
		try {
			await sendTelegramMessageChunks(ownerId, noticeLines.join('\n'));
		} catch (error) {
			console.error('[广告检测] 回复学习私聊通知失败:', error);
		}
	}
	return true;
}
