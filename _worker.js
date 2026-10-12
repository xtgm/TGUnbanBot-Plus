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

// 10) 主人 TGID(项目所有者),用于"主人审计通知"系统
//    所有管理员在群里使用 /ban /unban /spam 命令、
//    群内手动 ban/unban 时,主人会收到一份带操作人标记的私聊审计通知
//    环境变量 OWNER_IDS(逗号分隔,中英文逗号均可):第一个是主人,后续是副主人
//    主人收全部通知;副主人只收 /ban、/spam 这类加黑踢人通知
//    空数组 = 禁用通知系统(其他管理员仍可正常使用命令,但都没有私聊详情)
//    填了主人/副主人ID但账号从未私聊过 bot → 通知会投递失败,Worker 日志可见
const DEFAULT_OWNER_IDS = [];

// 10.5) 超级管理员 TGID 列表（环境变量 SUPER_ADMIN_IDS，逗号分隔，中英文逗号均可）。
//    定位：等同「Telegram 群管理员的全部权限」，但免实际管理员身份 ——
//    在配置群内或私聊都能使用 /ban /spam /unban /check 四条管理命令，
//    即便本人不是该群的 Telegram 管理员。
//    刻意【不含】主人/副主人的高级权限（隐藏命令、二次审核、跨群通知等），
//    也【不参与 /stats】（/stats 仍只认主人/副主人或本群真实 TG 管理员/群主）。
//    空数组 = 未配置该角色。
const DEFAULT_SUPER_ADMIN_IDS = [];

// 10.6) 杀手模式可用群（环境变量 KILLER_MODE_GROUPS，逗号分隔超级群 ID，中英文逗号均可）。
//    只有列进来的群才启用「杀手模式」特别功能，其余群永远按现状（封禁踢出）。
//    每群 ON/OFF 由第一主人用 /killer 在群内切换，状态存 D1（killer_mode 表）：
//      · 杀手模式 ON  = 触发即全群封禁 + 踢出（现状）。
//      · 杀手模式 OFF = 仅永久禁言、不踢出（人留在群里）；仍写入全局黑名单。
//    默认 OFF（= 禁言），与 GKY 一致（默认永久静音）。改默认改 KILLER_MODE_DEFAULT_ON。
//    空数组 = 该功能完全不启用（零开销）。
const DEFAULT_KILLER_MODE_GROUPS = [];
// 杀手模式默认状态：false = 默认 OFF（禁言，同 GKY）；true = 默认 ON（封禁踢出）。
const KILLER_MODE_DEFAULT_ON = false;

// 10.7) 关键词搜索的保留群（环境变量 STAT_SEARCH_GROUPS，逗号分隔超级群 ID，中英文逗号均可）。
//    moderation_messages 全局只留 200 条（按 autoincrement 取最新），别的群照旧；
//    只有列进来的群改按【创建时间】保留 STAT_SEARCH_RETENTION_DAYS 天，这样 /search 才查得到历史。
//    与 KILLER_MODE_GROUPS 同款模式：列进来的群会自动并入有效 GROUP_IDS ——
//    否则它们不算配置群、isConfiguredGroup 为 false，消息根本不写缓存，配了也搜不到东西。
//    空数组 = 该功能不启用，裁剪逻辑与改动前完全一致（零影响）。
const DEFAULT_STAT_SEARCH_GROUPS = [];
// 搜索群正文保留天数（按 moderation_messages.created_at 裁剪）。
const STAT_SEARCH_RETENTION_DAYS = 180;

// 11) 自助解封成功后，"联系管理员"按钮指向哪个群（主群 = 回家的入口）。
//    留空 → 用 GROUP_IDS[0]（主群），与原行为一致。
//    填了就直接用（2026-09-26 方案 A）：联系群只用来生成那颗按钮的链接，不参与封禁/检测/鉴权，
//    因此【不要求它在 GROUP_ID 里】，可指向一个独立的主群。只做群 ID 格式校验（负整数），
//    格式非法才回落主群并打日志。bot 需在该群里才取得到群名/邀请链接
//    （公开群用 t.me/username 免权限；私密群需 bot 为带「邀请用户」权限的管理员），
//    取不到时按钮自动降级为无链接文案，不会出现点不动的假链接。
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
// 演练通知上两个结论按钮的回调前缀。data 形如 dry:ok:12 / dry:no:12。
const DRYRUN_BUTTON_PREFIX = 'dry:';
// 封禁回执上两个纠错按钮的回调前缀。data 形如 adfix:ig:<seq> / adfix:ub:<uid>。
// ig = ignore（按误判回滚全部），ub = unban（只解封、判定维持）——
// 两档语义分开是 menshen 的做法：「撤判定」与「只放人」对判据库的影响完全不同，
// 混成一个按钮就没了中间档，主人只能二选一地把指纹和样本也一起动了。
const ADFIX_BUTTON_PREFIX = 'adfix:';
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
// 主人 TGID 列表:第一个是主人,后续是副主人。空数组 = 未配置,禁用通知
let OWNER_IDS = [];
// 超级管理员 TGID 列表：等同 Telegram 群管理员的全部权限（免实际管理员身份），
// 可用 /ban /spam /unban /check；不含主人/副主人高级权限，也不参与 /stats。空数组 = 未配置。
let SUPER_ADMIN_IDS = [];
// 杀手模式可用群 ID 列表（环境变量 KILLER_MODE_GROUPS）。每群 ON/OFF 存 D1，第一主人用 /killer 切换。
let KILLER_MODE_GROUPS = [];
// 关键词搜索的保留群 ID 列表（环境变量 STAT_SEARCH_GROUPS）。这些群的正文按天保留 180 天，
// 其余群维持全局 200 条。空数组 = 不启用，裁剪行为与改动前完全一致。
let STAT_SEARCH_GROUPS = [];
// 每请求解析出的「当前处于禁言模式（杀手 OFF）」的群集合。KILLER_MODE_GROUPS 为空时恒为空集、零开销。
let MUTE_MODE_GROUP_SET = new Set();
// 静态用户资料表：bot 不在其所在群时作为 /admins 权限名单的兜底显示
// 格式：TGID 字符串 → { id, first_name, last_name, username }
// 环境变量 STATIC_USER_PROFILES（JSON 字符串）优先，留空则为空表
let STATIC_USER_PROFILES = {};
// 只读资料群：仅用于 /admins 查询用户昵称/用户名/来源群，【完全不参与治理】。
// 刻意【不并入 GROUP_IDS】—— isConfiguredGroup 看不到这个名单，
// 因此广告检测、封禁、命令鉴权、/purge、/ad 投票全都不会碰这些群。
// bot 在里面不需要任何权限，普通成员即可（getChatMember 只要求 bot 在群内）。
let PROFILE_LOOKUP_GROUPS = [];
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
	KILLER_MODE_GROUPS = config.KILLER_MODE_GROUPS || [];
	STAT_SEARCH_GROUPS = config.STAT_SEARCH_GROUPS || [];
	// 杀手模式群并入有效 GROUP_IDS：它们即使不在 GROUP_ID 环境变量里，也享受完整全群治理
	// （/stats、/ban、/spam、/check、/ad、广告检测、发言/进退群统计），但执行走禁言不踢
	// —— 因为杀手模式 OFF 时 isGroupMuteMode 命中，banUserFromAllGroups / 拦截 / 批量 / purge
	// 都会把这些群改成 restrictChatMember 禁言。等价于「加进 GROUP_ID + 杀手 OFF」，只是可用
	// KILLER_MODE_GROUPS 单独管理。
	// 搜索群同样并入：不并入就不算配置群，isConfiguredGroup 为 false，消息一条都不写缓存，
	// STAT_SEARCH_GROUPS 配了也搜不到东西。语义上它也确实是「我们要治理并留下记录的群」。
	const effectiveGroupIds = [...new Set([...(config.GROUP_IDS || []), ...KILLER_MODE_GROUPS, ...STAT_SEARCH_GROUPS])];
	GROUP_IDS = effectiveGroupIds;
	// 每请求把动态群基线重置为空：GROUP_IDS 此刻只含环境变量群（含杀手模式群），
	// 随后 mergeDynamicGroupsFromD1 再按 D1 内容追加，避免 isolate 复用时残留上次的群。
	ENV_GROUP_IDS = [...effectiveGroupIds];
	DYNAMIC_GROUP_IDS = [];
	GROUP_ID = config.GROUP_ID;
	OWNER_IDS = config.OWNER_IDS;
	SUPER_ADMIN_IDS = config.SUPER_ADMIN_IDS || [];
	// 每请求先清空禁言模式集合；enabled 时由 refreshMuteModeGroups(env) 按 D1 状态重建。
	MUTE_MODE_GROUP_SET = new Set();
	STATIC_USER_PROFILES = config.STATIC_USER_PROFILES || {};
	PROFILE_LOOKUP_GROUPS = config.PROFILE_LOOKUP_GROUPS || [];
	AD_PROTECTED_USERNAMES = config.AD_PROTECTED_USERNAMES || [];
	AD_TRUSTED_BOTS = config.AD_TRUSTED_BOTS || [];
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
		// 重建禁言模式群集合（KILLER_MODE_GROUPS 为空时零开销）；必须在任何封禁/拦截分发之前。
		await refreshMuteModeGroups(env);

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
				} else if (update.chat_join_request) {
					// 入群审批请求 → 记「申请时间」。群未开审批时此分支永不触发。
					await handleChatJoinRequest(update.chat_join_request, env);
				} else {
					console.log('[Telegram更新] 跳过：当前代码仅处理 message/chat_member/chat_join_request/callback_query。');
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
		await refreshMuteModeGroups(env);

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
			await refreshMuteModeGroups(env);
			const summary = await runAdBioRescan(env);
			// 头像视觉识别独立一轨：与 bio 复查共用 cron 节拍，但各自有日预算，
			// 互不挤占（bio 扫描看 ad_scan_state 的 scan_*，这里看 avatar_*）。
			// 内部已做全量前置判断（无 AI 绑定 / 未就绪 / 额度用尽都会直接返回）。
			const avatarSummary = await runAdAvatarVision(env);
			// 正文图片视觉识别同样独立一轨：共用 cron 节拍，状态键 img_* 与
			// avatar_* 互不挤占。内部同样做全量前置判断（无 AI 绑定 / 未就绪 /
			// 额度用尽 / 队列为空都会直接返回）。
			//
			// batchSize 单轮封顶：一张图要 getFile + 下载 + 推理，300 张一次跑完
			// 是分钟级的串行 IO。队列靠 vision_checked_at 自平衡 —— 这轮没取到的
			// 下轮 cron 自然排在前面，不需要一次吃干净，也不会重复计费。
			const imageSummary = await runAdImageVision(env, { batchSize: AD_IMAGE_VISION_BATCH });
			// 顺手清一次过期数据。原先只搭在 detectAdOnJoin 上，
			// 没人入群的日子就不会剪枝；挂到 cron 上有个稳定节拍。
			await pruneAdDetectionData(env);
			// 群统计明细超期剪枝（保留 STAT_RETENTION_DAYS 天），同样搭 cron 的稳定节拍。
			await pruneStatData(env);
			console.log('[广告检测·扫描] Cron ' + (controller?.cron || '') + ' 结果: ' + JSON.stringify(summary)
				+ ' 头像: ' + JSON.stringify(avatarSummary)
				+ ' 图片: ' + JSON.stringify(imageSummary));
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

	// 主人 TGID 去重，并过滤非法 ID。
	const sanitizeAdmins = (list) =>
		[...new Set(
			(list || [])
				.map((id) => String(id).trim())
				.filter((id) => /^\d+$/.test(id))
		)];

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

	// SUPER_ADMIN_IDS 可选：逗号分隔（中英文逗号均可）。等同 Telegram 群管理员权限（免管理员身份），
	// 不区分主副、全部平级；空 = 未配置该角色。复用 sanitizeAdmins 做去重/去空/纯数字校验。
	let superAdminIds = [];
	const rawSuperAdminEnv = env.SUPER_ADMIN_IDS;
	if (rawSuperAdminEnv !== undefined && rawSuperAdminEnv !== null && String(rawSuperAdminEnv).trim() !== '') {
		superAdminIds = sanitizeAdmins(String(rawSuperAdminEnv).split(/[,，]/));
	} else {
		superAdminIds = sanitizeAdmins(
			Array.isArray(DEFAULT_SUPER_ADMIN_IDS) ? DEFAULT_SUPER_ADMIN_IDS : [DEFAULT_SUPER_ADMIN_IDS].filter(Boolean)
		);
	}

	// KILLER_MODE_GROUPS 可选：逗号分隔超级群 ID（中英文逗号均可）。列进来的群启用杀手模式功能。
	// 群 ID 形如 -100...，不能用 sanitizeAdmins（那只收纯数字），按 GROUP_ID 同款切分去空去重。
	const sanitizeGroups = (raw) => [...new Set(
		String(raw || '').split(/[,，]/).map((id) => id.trim()).filter((id) => id !== '')
	)];
	let killerModeGroups = [];
	const rawKillerEnv = env.KILLER_MODE_GROUPS;
	if (rawKillerEnv !== undefined && rawKillerEnv !== null && String(rawKillerEnv).trim() !== '') {
		killerModeGroups = sanitizeGroups(rawKillerEnv);
	} else {
		killerModeGroups = sanitizeGroups((Array.isArray(DEFAULT_KILLER_MODE_GROUPS) ? DEFAULT_KILLER_MODE_GROUPS : []).join(','));
	}

	// 搜索群：同款解析（环境变量优先，否则用顶部默认值）。
	let statSearchGroups = [];
	const rawSearchEnv = env.STAT_SEARCH_GROUPS;
	if (rawSearchEnv !== undefined && rawSearchEnv !== null && String(rawSearchEnv).trim() !== '') {
		statSearchGroups = sanitizeGroups(rawSearchEnv);
	} else {
		statSearchGroups = sanitizeGroups((Array.isArray(DEFAULT_STAT_SEARCH_GROUPS) ? DEFAULT_STAT_SEARCH_GROUPS : []).join(','));
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
	// 联系主群：留空用 GROUP_IDS[0]。填了就直接用（方案 A）——联系群只用来生成自助解封回执里
	// 的「联系管理员」按钮链接，不参与封禁/检测/鉴权，因此不要求它在 GROUP_ID 里，可指向独立主群。
	// 只做群 ID 格式校验（负整数）；格式非法才回落主群并打日志。取不到群名/链接时按钮降级为无链接文案。
	let selfUnbanContactGroup = uniqueGroupIds[0];
	const rawContactGroup = pickStr(env.SELF_UNBAN_CONTACT_GROUP, DEFAULT_SELF_UNBAN_CONTACT_GROUP).trim();
	if (rawContactGroup) {
		if (/^-\d+$/.test(rawContactGroup)) {
			selfUnbanContactGroup = rawContactGroup;
		} else {
			console.error(
				`SELF_UNBAN_CONTACT_GROUP=${rawContactGroup} 不是合法的群 ID（应为负整数，如 -100...），已回落主群 ${uniqueGroupIds[0]}`
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
		OWNER_IDS: ownerIds,
		SUPER_ADMIN_IDS: superAdminIds,
		KILLER_MODE_GROUPS: killerModeGroups,
		STAT_SEARCH_GROUPS: statSearchGroups,
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
		AD_TRUSTED_BOTS: parseAdTrustedBots(env.AD_TRUSTED_BOTS),
		// 只读资料群：与 GROUP_ID 同样的逗号分隔格式，但【绝不并入 uniqueGroupIds】。
		// 已在 GROUP_ID 里的群自动剔除 —— 那些群本来就会被遍历，重复只是白花请求。
		PROFILE_LOOKUP_GROUPS: parseProfileLookupGroups(env.PROFILE_LOOKUP_GROUPS, uniqueGroupIds),
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
			// chat_join_request：入群审批请求。第2批新增 —— 有了它才能记录「申请时间」。
			// 群没开启入群审批时，这个类型永远不会推送（分支静默，无副作用）。
			// ⚠️ 加了新类型必须重新访问初始化地址，setWebhook 才会重新下发 allowed_updates。
			// ⚠️ 只能用官方 Update 对象里的 27 个类型之一；这里曾误写成 bot_chat_join_request
			//    （该名在整份官方文档中出现 0 次），导致 Telegram 根本不推送、申请时间永远收不到。
			// ⚠️ 该 update 还要求 bot 在群里有 can_invite_users 权限（官方文档明写）。
			allowed_updates: ['message', 'chat_member', 'callback_query', 'chat_join_request']
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
				{ command: "ban", description: "添加用户到全局黑名单并全群禁言 (当前群管理员)" },
				{ command: "sban", description: "加黑并全群踢出 (第一主人/副主人/群主)" },
				{ command: "spam", description: "举报并加入全局黑名单 (当前群管理员)" },
				{ command: "rm", description: "删除我回复的那条消息 (仅第一主人)" },
				{ command: "check", description: "查询封禁状态 (高级管理员)" },
				{ command: "profile", description: "查看账号资料卡与时间线 (仅第一主人)" },
				{ command: "stats", description: "本群发言/进退群统计 (群管理员)" },
				{ command: "blacklist", description: "查看当前黑名单 (高级管理员)" },
				// /notice：主人要求「只在菜单显示指令、不写说明」。Telegram 的 setMyCommands
				// 要求 description 至少 1 个非空字符（空串会导致整批命令更新失败），
				// 故用一个占位符「·」当作「无说明」，命令照常出现在菜单明面上。
				{ command: "notice", description: "·" }
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
// 【7】2026-09-11：moderation_messages 新增 text_hash / text_norm（同款广告连带查杀）。
// 必须提版本号 —— ensureD1Table 在 version >= D1_SCHEMA_VERSION 时直接短路返回，
// 不提的话线上已是 6 的库永远不会重跑迁移，两列加不上，
// 而 cacheModerationMessage 的 INSERT 已经带上了新列 → 每条群消息都写失败，
// 消息缓存整体停写、/spam 的历史清扫连带失效（线上实际发生过）。
// 后来者新增列时务必同步 +1。
// 【8】2026-09-12：新增 ad_learn_snapshots（/recent 冻结快照，供 /learnlast 按序号学习）。
// 【9】2026-10-06：moderation_messages 新增 is_ad（演练/封禁/观察命中的消息照常进缓存，
// 但要与 /search 检索源分开 —— 广告不进搜索库是第 2 批的既定规则，改用标记继承而不是靠不写表。
// 此前「判过的消息不写缓存」导致 /spam 的同款连带与当前群清扫一条都追不到，演练模式下尤其明显。
// 后来者新增列时务必同步 +1。
const D1_SCHEMA_VERSION = 9;
const D1_CACHE_PRUNE_INTERVAL = 64;
const D1_RUNTIME_CACHE_TTL_MS = 15000;
const D1_INIT_PROMISES = new WeakMap();
const D1_AD_VOTE_INIT_PROMISES = new WeakMap();
const D1_KILLER_MODE_INIT_PROMISES = new WeakMap();
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

			// ===== 同款广告连带查杀所需的两列（2026-09-11）=====
			// 【必须先加列、再建索引】索引建在新列上，顺序反了 CREATE INDEX 直接报 no such column。
			// text_hash：归一化正文的哈希，等值反查用；text_norm：归一化正文，用于
			// ① 通知里展示原文（纯哈希无法判断这条文案是否真是广告）
			// ② 拿到候选后二次比对，兜住哈希碰撞（连带是批量不可逆操作，代价不对称）
			// ③ 日后若扩展成「相似匹配」，算编辑距离必须有原文，否则历史数据补不回来
			for (const [column, sql] of [
				['text_hash', 'ALTER TABLE moderation_messages ADD COLUMN text_hash TEXT;'],
				['text_norm', 'ALTER TABLE moderation_messages ADD COLUMN text_norm TEXT;'],
				// is_ad：1 = 这条是被判成广告的消息（含演练命中），写进缓存只为让
				// /spam 的同款连带、当前群清扫追得到，不进 /search 检索源。
				['is_ad', 'ALTER TABLE moderation_messages ADD COLUMN is_ad INTEGER NOT NULL DEFAULT 0;']
			]) {
				try {
					if (!(await d1ColumnExists(env, 'moderation_messages', column))) {
						await runD1SchemaStatement(env, 'moderation_messages.' + column, sql);
					}
				} catch (error) {
					const message = formatD1SchemaError(error).toLowerCase();
					if (!message.includes('duplicate') && !message.includes('exists')) {
						throw error;
					}
				}
			}

			// 同款广告连带查杀：按正文哈希 + 时间窗口跨群反查，等值查找必须带索引 ——
			// 追溯 24 小时 × 全部配置群，没索引就是全表扫。
			optionalIndexes.push(
				['idx_moderation_text_hash', 'CREATE INDEX IF NOT EXISTS idx_moderation_text_hash ON moderation_messages(text_hash, created_at);']
			);
			for (const [label, sql] of optionalIndexes) {
				await runD1SchemaStatement(env, label, sql, { optional: true });
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

async function pruneAutoincrementCacheTable(env, table, keepLimit, nowMs = Date.now()) {
	if (table !== 'moderation_messages') {
		throw new Error(`Unsupported D1 cache table: ${table}`);
	}
	const safeLimit = Math.max(1, Math.floor(Number(keepLimit) || 1));
	// 【第2批 · 分群裁剪】搜索群按 created_at 保留 STAT_SEARCH_RETENTION_DAYS 天（/search 的历史来源），
	// 其余群仍按 autoincrement 保留最新 keepLimit 条 —— 与改动前逐字一致。
	// 搜索群没配时走下面的原版单条 SQL，行为一个字都不变（零影响）。
	if (STAT_SEARCH_GROUPS.length) {
		const notIn = STAT_SEARCH_GROUPS.map(() => '?').join(',');
		// created_at 存的是 UTC ISO（new Date().toISOString()），字典序即时间序，直接比字符串。
		const cutoffIso = new Date(nowMs - STAT_SEARCH_RETENTION_DAYS * 86400000).toISOString();
		await env.DB.prepare(
			`DELETE FROM ${table} WHERE chat_id IN (${notIn}) AND created_at < ?`
		).bind(...STAT_SEARCH_GROUPS, cutoffIso).run();
		// 「其他群维持全局 200 条」的名额必须【只在非搜索群里算】：
		// 子查询不排除搜索群的话，搜索群的行会占掉这 200 个名额，别的群实际保留数少于 keepLimit。
		await env.DB.prepare(
			`DELETE FROM ${table} WHERE chat_id NOT IN (${notIn}) AND id <= COALESCE((
				SELECT id FROM ${table} WHERE chat_id NOT IN (${notIn}) ORDER BY id DESC LIMIT 1 OFFSET ?
			), 0)`
		).bind(...STAT_SEARCH_GROUPS, ...STAT_SEARCH_GROUPS, safeLimit).run();
		return;
	}
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
		await notifyOwnerBlacklistAppeal(fromUser, blacklistCheck, 'appeal', chatId);
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
// 杀手模式 OFF 的群（isGroupMuteMode）【略过封禁踢出，改为仅永久禁言】——人留在群里。
// 返回 [{ groupId, userId, ok, error, memberProbe, muted }]
// 人工命令（/ban /spam /sban）的踢/禁言口径：杀手模式 ON 的群保持【踢出】（现状不变），
// 其余一律【禁言】。这样 /ban /spam 默认不再踢人，而 KILLER_MODE_GROUPS 里那个开关为 ON 的群
// 仍按老行为踢出 —— 杀手模式自身的全部功能零改动。
function resolveHumanCommandMode(groupId) {
	return isKillerModeGroup(groupId) && !isGroupMuteMode(groupId) ? 'kick' : 'mute';
}

// 单群执行处置，按 mode 分派。mode 值域：
//   'kick'  → 恒踢出（/sban，含预封与撤回历史发言）
//   'human' → 人工命令口径（resolveHumanCommandMode：杀手 ON 踢、其余禁言）
//   缺省    → 现状口径：杀手模式 OFF 的群禁言、其余踢出（自动路径与 /purge 一直这么走，不传即不变）
// 返回 { groupId, userId, ok, error, muted, mutedBy, memberProbe, retried }
async function applyGroupModeration(groupId, userId, mode, options = {}) {
	const effective = mode === 'kick'
		? 'kick'
		: mode === 'human'
			? resolveHumanCommandMode(groupId)
			: (isGroupMuteMode(groupId) ? 'mute' : 'kick');
	if (effective === 'mute') {
		// 禁言：不踢、不预封，只对【已在群里】的人永久禁言（restrictChatMember）。
		//
		// 【禁言前先问一句（2026-10-11）】原先这里假定「目标不在群时 Telegram 会报错 → ok:false」，
		// 这个前提【是错的】。线上实测：对【已离群】的黑名单用户执行 restrictChatMember，
		// Telegram 不报错，而是把他【拉回群并设为受限】—— 批量拉黑时日志里成片的
		//「旧状态:left → 新状态:restricted」就是它造成的，随后又触发「复入群拦截」把人踢回，
		// 刷一堆通知。副作用是把已经踢走的人再拉回来一次，纯属自己给自己找事。
		//
		// 【为什么只在 probeMembership 为真时才跳过】探测本身是一次 getChatMember，
		// 批量场景下是【目标数 × 群数】次调用，无条件探测会直接翻倍热路径开销。
		// 而调用方要求探测的那条路（/purge、批量拉黑）恰好就是会把人扫进来的那条 ——
		// 复用它已经拿到的结果，既治住副作用，又一个请求都不多发。
		// 没有探测结果时照旧尝试，行为与改动前逐字节一致（那条路的风险由乙的
		// actorIsSelfBot 兜住：就算把人拉回来，也不会再被判成「复入群」刷通知）。
		// 注意与 ban 分支的差异：踢出有「预封」能力，人不在群照样封得住；禁言没有。
		const memberProbe = options.probeMembership
			? await probeTargetMemberBeforeBan(groupId, userId)
			: null;
		const notInGroup = Boolean(memberProbe)
			&& (memberProbe.state === 'not_in_group' || memberProbe.state === 'already_banned');
		if (notInGroup) {
			// 【已经在封禁列表 = 目标状态已达成】不是失败。
			// 2026-10-12 主人反馈：/ban 一个已在黑名单的人，14 个群全部显示红叉、
			// 汇总写「禁言成功 0/14」，看起来像全失败 —— 而实际上这个人在每个群都
			// 早就在封禁列表里，根本无需再处置。语义必须按探测结果分开说。
			const alreadyBanned = memberProbe?.state === 'already_banned';
			console.log('[禁言前探测] 目标不在群内，跳过 restrictChatMember（避免把人拉回来）',
				JSON.stringify({ 群ID: groupId, 用户ID: String(userId), 探测状态: memberProbe?.label || '' }));
			return {
				groupId,
				userId: String(userId),
				// already_banned 记成功：目标状态早已达成，计入失败会让回执显示成 0/N 的假失败。
				ok: alreadyBanned,
				// 文案按探测结果分开说。两种情况都会提醒 D1 黑名单已生效、后续进群仍会被拦 ——
				// 那才是主人真正需要知道的。
				error: alreadyBanned
					? '目标已在群封禁列表，无需重复处置；D1 黑名单已生效'
					: '目标不在群内，已跳过禁言（不把已离群的人拉回来）；D1 黑名单已生效，'
						+ '该用户若后续进群/发言仍会按 D1 黑名单拦截',
				retried: false,
				muted: true,
				mutedBy: mode === 'human' ? 'human' : 'killer',
				memberProbe,
				// skipped 让回执能分辨「探测后主动跳过」与「真的调用失败」——
				// 两者都可能 ok:false，但含义完全不同，混在一起会让回执说不清发生了什么。
				skipped: alreadyBanned ? 'already_banned' : 'not_in_group'
			};
		}
		const r = await muteUserInGroup(groupId, userId);
		return {
			groupId,
			userId: String(userId),
			ok: r.ok,
			error: r.error,
			retried: r.retried === true,
			muted: true,
			mutedBy: mode === 'human' ? 'human' : 'killer',
			memberProbe
		};
	}
	const memberProbe = options.probeMembership
		? await probeTargetMemberBeforeBan(groupId, userId)
		: null;
	const r = await banUserFromGroup(groupId, userId, { revokeMessages: options.revokeMessages !== false });
	return {
		groupId,
		userId: String(userId),
		ok: r.ok,
		error: r.error,
		retried: r.retried === true,
		memberProbe,
		muted: false,
		mutedBy: null
	};
}

// 全群封禁的并发度。取 5：Telegram 全局约 30 msg/s，入群高峰（一次拉十几个人）
// 时 5 路并发仍在限内；真撞上 429 由 banUserFromGroup 内的重试兜底。
const BAN_ALL_GROUPS_CONCURRENCY = 5;

// options.primaryGroupId：事发群（人从这里进来的那个群）。给了它就【先同步封这一个】，
// 其余群并发补上 —— 入群封禁要的是「进群那一刻」被请出去，不该先在别的群上排队。
// 不给时行为与改动前一致（全部群一起并发），只是从串行变成并发。
async function banUserFromAllGroups(userId, options = {}) {
	const primary = String(options.primaryGroupId || '');
	const rest = GROUP_IDS.filter((groupId) => String(groupId) !== primary);
	const results = [];
	if (primary) {
		results.push(await applyGroupModeration(primary, userId, options.mode, options));
	}
	await mapWithConcurrency(rest, BAN_ALL_GROUPS_CONCURRENCY, async (groupId) => {
		const r = await applyGroupModeration(groupId, userId, options.mode, options);
		// push 在 worker 里是安全的：JS 单线程，数组追加不会与别的 worker 交错。
		results.push(r);
		return r;
	});
	return results;
}

// 把用户从所有配置群解除处置，逐群结果数组返回。
// 调用方必须先确认目标不在 D1 黑名单；管理层命中 D1 时应先成功移除记录。
// 本函数本身不修改 D1，也绝不调用封禁接口。
// 【双解】同一人可能在 A 群被 /sban 踢出、在 B 群被 /ban 禁言，D1 不记录各群处置方式，
// 所以每个群固定两步：先 restrictChatMember 恢复发言，再 unbanChatMember 解除封禁。
// 顺序固定「先恢复发言、后解除封禁」，两者终态等价（群成员 + 默认权限），
// 对「本就不存在的状态」（没被禁言的人 / 没被封的人）报错即吞掉 —— 至少一步成功就算该群成功。
async function unbanUserFromAllGroups(userId) {
	const results = [];
	for (const groupId of GROUP_IDS) {
		let restrictOk = false;
		let restrictError = null;
		let unbanOk = false;
		let unbanError = null;
		try {
			const r = await restrictUser(userId, groupId);
			restrictOk = r?.ok === true;
			if (!restrictOk) restrictError = r?.description || '恢复发言失败';
		} catch (error) {
			restrictError = error.message || String(error);
		}
		try {
			const r = await unbanUser(userId, groupId);
			unbanOk = r?.ok === true;
			if (!unbanOk) unbanError = r?.description || r?.error || '解除封禁失败';
		} catch (error) {
			unbanError = error.message || String(error);
		}
		const ok = restrictOk || unbanOk;
		results.push({
			groupId,
			userId: String(userId),
			ok,
			error: ok ? null : (unbanError || restrictError || '未知错误'),
			unmuted: restrictOk,
			unbanned: unbanOk,
			dual: true
		});
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
		return { ok: false, state: 'unknown', label: `成员状态查询异常：${toChineseErrorText(error?.message || String(error))}`, error: error.message || String(error) };
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
	if (lower.includes('flood') || lower.includes('too many requests') || lower.includes('retry after')) {
		return { 中文: 'Telegram 限流', 建议: '稍后重试，或减小批量大小' };
	}
	if (lower.includes('bot was kicked')) {
		return { 中文: 'bot 已被踢出该群', 建议: '重新把 bot 拉进该群并设为管理员' };
	}
	if (lower.includes('upgraded to a supergroup') || lower.includes('migrate_to_chat_id')) {
		return { 中文: '该群已升级为超级群，群 ID 已变更', 建议: '用新的 -100 开头群 ID 更新 GROUP_ID 或动态群组' };
	}
	if (lower.includes('bot is not a member of the channel') || lower.includes('need administrator rights in the channel')) {
		return { 中文: 'bot 不是该频道管理员', 建议: '把 bot 设为频道管理员' };
	}
	if (lower.includes("bot can't initiate conversation") || lower.includes("bot can't send messages to bots")) {
		return { 中文: '对方从未私聊过 bot，无法主动发消息', 建议: '请对方先私聊 bot 发送 /start' };
	}
	if (lower.includes('user is deactivated')) {
		return { 中文: '该账号已注销', 建议: '无需处理' };
	}
	if (lower.includes('have no rights to send') || lower.includes('not enough rights to send')) {
		return { 中文: 'bot 在该群没有发言权限', 建议: '在群设置里给 bot 开启发消息权限' };
	}
	if (lower.includes('available only for supergroups')) {
		return { 中文: '该操作只支持超级群', 建议: '把群升级为超级群后再试' };
	}
	if (lower.includes('message is not modified')) {
		return { 中文: '内容没有变化，无需修改', 建议: '无需处理' };
	}
	if (lower.includes('message to edit not found') || lower.includes('message not found')) {
		return { 中文: '消息已不存在', 建议: '消息可能已被删除，无需处理' };
	}
	if (lower.includes('query is too old') || lower.includes('query id is invalid')) {
		return { 中文: '按钮点击已过期', 建议: '重新发送命令后再点' };
	}
	if (lower.includes('too many subrequests')) {
		return { 中文: '单次请求的外部调用次数超限', 建议: '减小单次处理量，或稍后重试' };
	}
	if (lower.includes('internal server error') || lower.includes('bad gateway') || lower.includes('service unavailable')
		|| lower.includes('gateway timeout') || /\bstatus:?\s*5\d\d\b/.test(lower) || /\bhttp\s*5\d\d\b/.test(lower)) {
		return { 中文: 'Telegram 服务器暂时故障', 建议: '稍后重试' };
	}
	if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('fetch failed') || lower.includes('network')
		|| lower.includes('econnreset') || lower.includes('socket') || lower.includes('connection')) {
		return { 中文: '网络请求超时或中断', 建议: '稍后重试' };
	}
	if (lower.includes('d1_') || lower.includes('sqlite') || lower.includes('no such table') || lower.includes('database')) {
		return { 中文: 'D1 数据库操作失败', 建议: '稍后重试；持续失败请检查 D1 绑定与 Worker 日志' };
	}
	if (lower.includes('unexpected token') || lower.includes('json')) {
		return { 中文: '返回数据格式异常', 建议: '稍后重试' };
	}
	if (lower.includes('cannot read properties') || lower.includes('is not a function') || lower.includes('is not defined')
		|| lower.includes('typeerror') || lower.includes('referenceerror') || lower.includes('rangeerror')) {
		return { 中文: '程序内部异常', 建议: '查看 Worker 日志定位原因' };
	}
	if (/\bstatus:?\s*4\d\d\b/.test(lower) || lower.includes('bad request')) {
		return { 中文: 'Telegram 拒绝了本次请求', 建议: '查看 Worker 日志中的原文' };
	}
	// 兜底：本身已是中文说明的（如「GKY 查询异常」「批量 D1 操作连续失败」）原样返回；
	// 仍是英文报错的，聊天里只给中文，英文原文写进 Worker 日志供排查（主人 2026-09-25 定的口径）。
	if (!looksLikeEnglishErrorText(desc)) {
		return { 中文: desc, 建议: '查看 Worker 日志获取详情' };
	}
	console.error('[错误翻译] 未收录的报错原文：' + desc);
	return { 中文: '未能识别的错误（原文已写入 Worker 日志）', 建议: '到 Cloudflare Worker 日志查看原文' };
}

// 是否仍是英文报错：没有中文字符，或含连续两个以上英文单词（「not enough rights」这类）。
// 单个英文词（bot、D1、GKY、HTTP）夹在中文里不算 —— 那是项目自己的中文说明。
function looksLikeEnglishErrorText(text) {
	const s = String(text || '');
	if (!/[一-龥]/.test(s)) return /[a-z]/i.test(s);
	return /[a-z]{2,}[\s:_\-]+[a-z]{2,}[\s:_\-]+[a-z]{2,}/i.test(s);
}

// 报错 → 只含中文原因的一句话。聊天回执统一走这里；英文原文由翻译兜底写入日志。
function toChineseErrorText(raw, options = {}) {
	return translateTelegramError(raw, options).中文;
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
	// mutedBy：'human' = 人工命令口径（/ban /spam 默认禁言）；'killer' = 杀手模式关闭状态。
	if (r?.muted) return r?.mutedBy === 'human' ? '已永久禁言（未踢出）' : '已永久禁言（杀手模式关闭，未踢出）';
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
	const mutedCount = banResults.filter((r) => r.muted).length;
	const humanMutedCount = banResults.filter((r) => r.muted && r.mutedBy === 'human').length;
	const killerMutedCount = mutedCount - humanMutedCount;
	if (mutedCount === total && killerMutedCount === 0) {
		// 人工命令口径（/ban /spam）：所有配置群只禁言、未踢出。
		if (okCount === total) lines.push(`🔇 <b>已永久禁言 ${okCount}/${total} 个群（未踢出）</b>`);
		else if (okCount === 0) lines.push(`⚠️ <b>D1 黑名单已生效；禁言成功 0/${total}</b>`);
		else lines.push(`🔇 <b>已禁言 ${okCount}/${total}</b>（${failCount} 个失败）`);
	} else if (mutedCount === total) {
		// 全部命中杀手模式群：只禁言、未踢出。
		if (okCount === total) lines.push(`🔇 <b>杀手模式：已永久禁言 ${okCount}/${total} 个群（未踢出）</b>`);
		else if (okCount === 0) lines.push(`⚠️ <b>D1 黑名单已生效；杀手模式禁言成功 0/${total}</b>`);
		else lines.push(`🔇 <b>杀手模式：已禁言 ${okCount}/${total}</b>（${failCount} 个失败）`);
	} else if (okCount === total) {
		lines.push(`✅ <b>Telegram 群封禁/预封成功 ${okCount}/${total}</b>`);
	} else if (okCount === 0) {
		lines.push(`⚠️ <b>D1 黑名单已生效；Telegram 群封禁/预封成功 0/${total}</b>`);
	} else {
		lines.push(`✅ <b>Telegram 群封禁/预封成功 ${okCount}/${total}</b>（${failCount} 个失败）`);
	}
	if (mutedCount > 0 && mutedCount < total) {
		// 混合口径：/ban /spam 在杀手模式 ON 的群仍踢出、其余禁言 —— 两种都要说清，不能只提杀手模式。
		const mutedParts = [];
		if (humanMutedCount > 0) mutedParts.push(`${humanMutedCount} 个群仅永久禁言、未踢出`);
		if (killerMutedCount > 0) mutedParts.push(`${killerMutedCount} 个群命中杀手模式关闭状态，仅永久禁言`);
		lines.push(`🔇 其中 ${mutedParts.join('；')}。`);
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
	const mutedCount = banResults.filter((r) => r.muted).length;
	const humanMutedCount = banResults.filter((r) => r.muted && r.mutedBy === 'human').length;
	if (mutedCount === total) {
		return humanMutedCount === total
			? `🔇 已永久禁言 ${okCount}/${total} 个群（未踢出）`
			: `🔇 杀手模式：已永久禁言 ${okCount}/${total} 个群（未踢出）`;
	}
	if (mutedCount > 0 && humanMutedCount > 0) {
		// /ban /spam 混合口径：杀手模式 ON 的群踢出、其余禁言。
		return `✅ Telegram 处置成功 ${okCount}/${total} 个配置群（禁言 ${humanMutedCount}、踢出 ${total - mutedCount}）`;
	}
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
		lines.push(`✅ <b>已解除全部 ${total} 个配置群的封禁并恢复发言</b>`);
	} else if (okCount === 0 && lookupFailCount === total) {
		lines.push(`⚠️ <b>全部 ${total} 个配置群 Telegram 解封失败：Telegram 当前无法识别该 TGID</b>`);
	} else if (okCount === 0) {
		lines.push(`⚠️ <b>全部 ${total} 个配置群 Telegram 解封失败</b>`);
	} else {
		lines.push(`✅ <b>已解除 ${okCount}/${total} 个配置群的封禁并恢复发言</b>（${total - okCount} 个失败）`);
	}
	// 双解口径一句话说清：每个群都跑「恢复发言 + 解除封禁」两步，因为同一个人可能
	// 在 A 群被 /sban 踢出、在 B 群被 /ban 禁言，D1 不记录各群处置方式。
	if (unbanResults.some((r) => r.dual)) {
		lines.push('ℹ️ 每群已执行「恢复发言 + 解除封禁」两步，未被处置过的一步会静默跳过。');
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
	if (okCount === total) return `✅ 已解除全部 ${total} 个群的封禁并恢复发言`;
	if (okCount === 0 && lookupFailCount === total) return '⚠️ D1检查通过，Telegram暂无法识别TGID';
	if (okCount === 0) return `⚠️ 全部 ${total} 个群解封失败（请检查 bot 是否为群管理员）`;
	return `✅ 已解除 ${okCount}/${total} 个群的封禁并恢复发言（${total - okCount} 个失败）`;
}

// 管理命令按角色鉴权并私聊投递详情；四条公开管理命令使用无闪屏回执。

// GroupAnonymousBot 的固定 TGID：真人开启"匿名管理员"身份发言时 from 会是它，代表真人操作。
const ANON_ADMIN_BOT_ID = '1087968824';

// 判断操作发起者是否为"机器人操作"。加黑等【仅限真人】的动作据此排除：
// 任何作为管理员的第三方机器人都算机器人操作；GroupAnonymousBot（真人匿名身份）视为真人，不算。
function isBotOperator(user) {
	return Boolean(user?.is_bot) && String(user?.id || '') !== ANON_ADMIN_BOT_ID;
}

// ===== 广告检测可信 bot 白名单（2026-09-21）=====
// 背景：广告号在群里艾特若干 @xxxbot 后【自行删除原消息】，那些 bot 并不在群里，
// 而是由一个常驻的 bot 账号把广告正文带引用重新发出来 —— 引用的还是主人自己发的
// /ban / /spam 命令消息，于是形成「主人处置一次，广告被重发一次」的循环。
// 根因是 detectAdOnMessage 与黑名单发言拦截都用 from.is_bot 直接跳过，
// bot 发的一切消息完全免检，重发的广告一条都不会被处理。
//
// 放宽后必须留白名单：协作治理 bot（nmBot / GKY）的回执会【原样引用广告文本】，
// 不豁免就会被删甚至被封，直接影响群治理。
// 按 username 匹配而非 TGID：bot 的 TGID 不易获取，而 username 稳定且主人能直接看到。
const DEFAULT_AD_TRUSTED_BOTS = ['nmnmfunbot', 'tc520lh_bot'];
let AD_TRUSTED_BOTS = [];

// 解析可信 bot 白名单：逗号分隔（半角 / 全角均可），@ 前缀可省，大小写不敏感。
function parseAdTrustedBots(raw) {
	const source = raw == null || String(raw).trim() === ''
		? DEFAULT_AD_TRUSTED_BOTS
		: String(raw).split(/[,，\s]+/);
	const list = (Array.isArray(source) ? source : [source])
		.map((v) => String(v || '').trim().replace(/^@+/, '').toLowerCase())
		.filter((v) => /^[a-z0-9_]{4,32}$/.test(v));
	return [...new Set(list)];
}

// 这个 bot 是否豁免广告检测。三类一律豁免，缺一会自伤：
//   1) 自己 —— 否则 bot 的回执（含广告原文的判定详情）会被自己判成广告；
//   2) GroupAnonymousBot —— 那是真人以匿名管理员身份发言，本就不该按 bot 处置；
//   3) 白名单协作 bot —— 它们的回执原样引用广告文本，误删会破坏群治理。
function isAdExemptBot(user) {
	if (!user?.is_bot) return false;
	const idStr = String(user.id || '');
	if (BOT_ID && idStr === String(BOT_ID)) return true;
	if (idStr === ANON_ADMIN_BOT_ID) return true;
	const uname = String(user.username || '').replace(/^@+/, '').toLowerCase();
	return Boolean(uname) && AD_TRUSTED_BOTS.includes(uname);
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

// 超级管理员：等同 Telegram 群管理员的全部权限（免实际管理员身份），
// 仅用于 /ban /spam /unban /check 的鉴权放行；不含主人/副主人高级权限、不参与 /stats。
function isSuperAdmin(id) {
	return SUPER_ADMIN_IDS.length > 0 && SUPER_ADMIN_IDS.includes(String(id || ''));
}

// 主人、副主人保留原有管理命令和跨群操作权限。
function isPrivilegedManager(userId) {
	const idStr = String(userId || '');
	return isOwner(idStr);
}

// 广告【自动】检测的身份豁免：主人、副主人、超级管理员发任何内容都不判定。
// 只用于自动检测四个入口（发言 / 入群 / 定时复扫 / /rescreen），不参与命令鉴权，
// /ban /spam 对这些人的执行口径保持原样。
function isAdDetectionExemptUser(userId) {
	const idStr = String(userId || '');
	return isPrivilegedManager(idStr) || isSuperAdmin(idStr);
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

// /unban、/ban、/spam、/check 共用权限：主人/副主人保留原权限；
// 群内检查当前配置群，私聊检查任一配置群；匿名管理员仅在当前配置群放行。
async function checkMessageOperatorCanModerate(message, userId) {
	if (isBotOperator(message?.from)) return false;
	if (isPrivilegedManager(userId)) return true;
	if (isAnonymousAdminMessage(message)) return true;
	// 超级管理员 = Telegram 群管理员的全部权限，免实际管理员身份；作用域与真实 TG 管理员一致：
	// 私聊等同任一配置群管理员放行，群内仅限配置群（非配置群里 TG 管理员也无权，故此处同样拒绝）。
	if (isSuperAdmin(userId)) {
		return message?.chat?.type === 'private' ? true : isConfiguredGroup(message?.chat?.id);
	}
	if (message?.chat?.type === 'private') return checkIfUserIsAdmin(userId);
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
	// 超级管理员在配置群内等同群管理员：命令消息同样静默、按管理员对待。
	if (isSuperAdmin(userId)) return true;
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

// 判定操作人角色,返回中文标签:主人 / 副主人 / 群管理员
// 主人、副主人优先，其余使用调用方传入的角色标签（默认"管理员"）。
function classifyOperatorRole(userId, fallback = '管理员') {
	const idStr = String(userId || '');
	if (isPrimaryOwner(idStr)) return '主人';
	if (isSecondaryOwner(idStr)) return '副主人';
	return fallback;
}

// 渲染主人审计通知:在 detailText 顶部追加"角色 + 操作人 + 来源"标识
// roleLabel: 由 classifyOperatorRole 生成,通常是"群管理员"/"管理员"
// sourceLabel: '群内' / '私聊' 等触发场景标记
function renderAuditNotification(operatorMention, detailText, sourceLabel, roleLabel = '管理员') {
	if (roleLabel === '匿名管理员') {
		return `🔔 <b>匿名管理员操作通知</b>\n👤 操作人:${operatorMention}\n📍 来源:${escapeHtml(sourceLabel)}\n\n${detailText}`;
	}
	return `🔔 <b>${escapeHtml(roleLabel)}操作通知</b>\n👤 操作人:${operatorMention}（${escapeHtml(roleLabel)}）\n📍 来源:${escapeHtml(sourceLabel)}\n\n${detailText}`;
}

// 双通道回执:
// - 通用群内场景:按既有规则发闪屏并私聊通知主人; /ban、/spam 可额外发给副主人
// - 四条公开管理命令由 replyToModerationAdmin 发送永久群内详情，并继续私聊通知主人
// - 私聊场景:触发者本人收一份;主人也收一份带操作人标记的副本(触发者是主人则收"你自己"版)
//
// 主人通知规则:
//   * OWNER_IDS 为空 → 跳过私聊投递;通用命令保留既有群内闪屏，四条公开命令由专用 wrapper 保留永久群内结果
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

async function replyToAdmin(message, ctx, { flashText, detailText, isInGroup, notifySecondaryOwners = false, replyMarkup = null, suppressFlash = false }) {
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
				const result = await sendTelegramMessageChunks(oid, auditText, suppressFlash ? replyMarkup : null);
				if (!result?.ok) console.error(`[审计通知] 私聊主人${oid}失败:${result?.description || result?.error || '未知'}`);
			});
		}
		return;
	}

	// 默认保留其他功能的群聊回执与未配置 OWNER_IDS 时的闪屏兜底。
	// 四条公开管理命令由 wrapper 发送永久群内详情，并通过 suppressFlash 关闭闪屏。
	if (!suppressFlash && (!shouldSilenceAuthorizedGroupCommand(message) || targets.length === 0)) {
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

// 四条公开管理命令统一回执：群内完整结果永久保留，同时私聊第一主人。
// 群内命令在各入口鉴权后撤回；私聊发令者和 /ban、/spam 副主人通知沿用原规则。
async function replyToModerationAdmin(message, ctx, { flashText, detailText = flashText, groupText, ...options }) {
	// 群内回执按命令的「群内模式」分流（message.__moderationGroupMode，由各命令入口设定）：
	//   未设 / 'full' → 群内发完整 detailText（/check 及全部历史调用，行为逐字节不变）
	//   'silent'      → 群内不发任何 bot 消息（/sban：主人要求群里不留回执，完整明细私聊主人）
	//   'brief'       → 群内发简洁 groupText，未传 groupText 时回退 detailText（/unban）
	// 无论哪种模式，私聊第一主人（及 /ban·/spam 的副主人）【始终】收到完整 detailText，
	// 主人侧信息量与改动前完全一致。groupText 在此解构掉，不透传给 replyToAdmin。
	const groupMode = message?.__moderationGroupMode || 'full';
	// silent 模式的安全网：仅当【没有任何可私聊的主人】（OWNER_IDS 未配置的退化部署）时，
	// 才在群内兜底发完整结果，避免操作完全无反馈 —— 这是改动前就有的兜底语义，予以保留。
	// 有主人但私聊投递失败属临时故障，仍保持群内静默（replyToAdmin 内已 console.error 记录）。
	const hasOwnerTarget = getOwnerNotifyTargets(options.notifySecondaryOwners).length > 0;
	const silenceGroup = groupMode === 'silent' && hasOwnerTarget;
	if (message.chat.type !== 'private' && !silenceGroup) {
		// brief 群内简洁：优先显式 groupText（含可点击目标），无则回退 flashText（各命令的简洁汇总），
		// 都没有才回退 detailText —— 保证 brief 命令的任何回执点都不会误发完整逐群明细。
		const textForGroup = groupMode === 'brief'
			? (groupText != null ? groupText : (flashText != null ? flashText : detailText))
			: detailText;
		const result = await sendTelegramMessageChunks(message.chat.id, textForGroup, options.replyMarkup);
		if (!result?.ok) console.error(`[管理命令回执] 群聊${message.chat.id}失败:${result?.description || result?.error || '未知'}`);
	}
	await replyToAdmin(message, ctx, {
		...options,
		detailText,
		isInGroup: message.chat.type !== 'private',
		suppressFlash: true,
	});
}

// 已完成权限校验后的旧结果路由，供未迁移的隐藏命令继续使用；
// 四条公开管理命令统一走 replyToModerationAdmin。
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

// /job、/jobrun、/ad 的参数/环境校验回执：
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
// 批量封禁时的学习上限与并发。人工批量封禁动辄上百个号，逐个拉一次资料卡
// 会让回执卡很久；取 100 是「绝大多数人工批次都在这个量级」与「不把回执拖垮」的平衡。
// 超出的那些不学 —— 它们还在黑名单里、还会发言，将来 /spam 或自动定罪仍有机会补学。
const BULK_LEARN_LIMIT = 100;
const BULK_LEARN_CONCURRENCY = 3;

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
			results.failed.push(...chunk.map((id) => ({ id, msg: `❌ 添加黑名单失败: ${toChineseErrorText(error?.message || error)}` })));
		}
	}
	return results;
}

// 批量 /unban 资格检查：
// - 普通权限只读检查，D1 命中即拒绝；
// - 通过命令鉴权的管理员可显式传 allowD1Removal，先移除 D1 再允许 Telegram 解封。
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
		results.failed.push(...uniqueIds.map((id) => ({ id, msg: `❌ 无法确认 D1 黑名单状态: ${toChineseErrorText(error?.message || error)}` })));
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
			results.failed.push(...chunk.map((id) => ({ id, msg: `❌ 无法确认 D1 黑名单状态: ${toChineseErrorText(error?.message || error)}` })));
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
			results.failed.push(...chunk.map((id) => ({ id, msg: `❌ 移除黑名单失败: ${toChineseErrorText(error?.message || error)}` })));
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
	if (normalized === 'sban') return '/sban';
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
	if (message?.chat?.type === 'private') return GROUP_IDS.length;
	return isConfiguredGroup(message?.chat?.id) ? 1 : 0;
}

function createBulkJobPayload(action, ids, invalid, note, message, options = {}) {
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
		// 处置方式（执行时传给 applyGroupModeration）：'kick' = /sban 恒踢出；
		// 'human' = /ban /spam 口径（杀手 ON 踢、其余禁言）；null = 现状（老任务与自动路径）。
		mode: options.mode || null,
		command: getBulkJobCommand(normalizedAction),
		status: 'queued',
		ids: ids.map((id) => String(id)),
		invalid: (invalid || []).map((id) => String(id)),
		note: normalizeActionNote(note),
		groupIds,
		createdBy: getMessageActorId(message),
		unbanAllowD1Removal: isUnban && (options.allowD1Removal === true || isPrivilegedManager(getMessageActorId(message))),
		operator,
		operatorRole: classifyMessageOperatorRole(message, message.chat?.type === 'private' ? '管理员' : '群管理员'),
		sourceChatId: String(message.chat?.id ?? ''),
		sourceChatTitle: message.chat?.title || message.chat?.username || (message.chat?.type === 'private' ? '私聊' : '当前群组'),
		sourceChatType: message.chat?.type || 'unknown',
		notifyTargets: getBulkJobNotifyTargets(message),
		// 仅公开管理命令显式开启来源群回执，隐藏连带任务沿用原通知范围。
		notifySourceChat: options.notifySourceChat === true,
		userBatchSize: BULK_TASK_USER_BATCH_SIZE,
		concurrency: BULK_TASK_CONCURRENCY,
		// 同款连带专用：{ "userId": { "chatId": [mid, ...] } }
		// 【为什么要带进 payload】连带反查（findLinkedSpamTargets）已经把每个目标在每个群里
		// 那几条同款消息的 mid 全查出来了，不带进来就得在执行时重查一遍 D1。
		// 更关键的是精确性：这里删的是【那几条同款文案】，不是这个人的全部历史消息。
		//
		// 【为什么不能只靠 revoke_messages】banChatMember 的 revoke_messages 有两个硬限制：
		//   ① 只撤 48 小时内的消息；② 目标必须【仍在群里】—— 已退群 / 已被踢 / 账号已冻结的
		// 一条都撤不掉。线上实测：连带命中的号显示「已注销用户 The account was frozen」，
		// revoke 完全无效，消息原样留在群里。deleteMessage 走的是另一条路，
		// 只要 bot 在该群有删除权限就能删，不看目标账号状态。
		deleteTargets: options.deleteTargets || null,
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

async function createBulkJob(env, action, ids, invalid, note, message, options = {}) {
	if (!env.DB) {
		throw new Error('大批量任务需要绑定 D1 存储空间');
	}
	await ensureD1Table(env);
	const job = createBulkJobPayload(action, ids, invalid, note, message, options);
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
	// 只给中文原因：英文原文已由 translateTelegramError 兜底写入 Worker 日志，聊天里不再附带。
	const reasonText = escapeHtml(中文);
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
		// 同款连带才有这两项；普通 /ban /spam 批量没有 deleteTargets，不显示以免空行干扰。
		if (job.deleteTargets) {
			lines.push(`同款消息已删:${job.stats?.linkedMsgDeleted || 0}`);
			// 「删除失败」仅在真有失败时显示：消息被封禁 revoke 提前撤回已计入「已删」，
			// 不再把它误报成失败，避免出现「群里明明没了却报删除失败」的困惑。
			if (Number(job.stats?.linkedMsgDeleteFailed) > 0) {
				lines.push(`同款消息删除失败:${job.stats.linkedMsgDeleteFailed}`);
			}
		}
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
	if (job.notifySourceChat === true && job.sourceChatId && ['group', 'supergroup'].includes(job.sourceChatType)) {
		const result = await sendTelegramMessageChunks(job.sourceChatId, detailText);
		if (!result?.ok) console.error(`[批量任务通知] 群聊${job.sourceChatId}失败:${result?.description || result?.error || '未知'}`);
	}
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
		// 人工批量判定的学习：/ban /sban /spam 的批量任务都汇到这里（job.reason / job.mode）。
		// 此前只有 /spam 引用回复与自动定罪学，批量封禁一个特征都不学 ——
		// 而批量恰恰是日常主力场景，封得越多漏得越多。详见 learnAdFromOperatorAction。
		//【队列里没有 message】引用块兜底用不上，只学资料卡（bio / 昵称 / 域名）。
		// 重复学习是幂等的：指纹有唯一键、语义样本有 hash，重试也不会重复入库。
		if (job.reason) {
			const learnSource = String(job.action) === 'spam' ? 'spam'
				: String(job.mode) === 'kick' ? 'sban' : 'manual';
			const learnIds = [...(lastResults.success || [])].slice(0, BULK_LEARN_LIMIT);
			let learnedTotal = 0;
			let sampleTotal = 0;
			await mapWithConcurrency(learnIds, BULK_LEARN_CONCURRENCY, async (uid) => {
				const r = await learnAdFromOperatorAction(env, uid, null, {
					source: learnSource,
					createdBy: String(job.createdBy || ''),
					text: ''
				});
				learnedTotal += Number(r.learned || 0);
				sampleTotal += Number(r.sampleAdded || 0);
				return r;
			});
			console.log('[广告检测] 批量封禁学习完成', JSON.stringify({
				来源: learnSource, 学习目标数: learnIds.length,
				指纹: learnedTotal, 语义样本: sampleTotal
			}));
		}
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

// 判断一次 deleteMessage 的失败是否「等效已删」：目标消息已不存在 / 已不可删。
// 常见于封禁的 revoke_messages 抢先删掉了同一条 —— 此时再删返回「message to delete not found」，
// 消息确实没了，不该算删除失败。判据与 classifyAdDeleteOutcome 保持一致，避免两处口径分叉。
function isEffectivelyDeletedError(error) {
	const lower = String(error || '').toLowerCase();
	return lower.includes('message to delete not found')
		|| lower.includes('message identifier is not specified')
		|| lower.includes("message can't be deleted");
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
			// 双解（与 unbanUserFromAllGroups 同口径）：每群固定两步「先恢复发言、后解除封禁」。
			// 同一个人可能在部分群被 /sban 踢出、部分群被 /ban 禁言，D1 不记录各群处置方式，
			// 只做一步会漏掉另一半；对「本就不存在的状态」报错即吞，至少一步成功就算该群成功。
			let restrictOk = false, unbanOk = false, errText = '群解封失败';
			try {
				const rr = await restrictUser(task.userId, task.groupId);
				restrictOk = rr?.ok === true;
				if (!restrictOk) errText = rr?.description || '恢复发言失败';
			} catch (e) { restrictOk = false; errText = e?.message || '恢复发言失败'; }
			try {
				const rr = await unbanUser(task.userId, task.groupId);
				unbanOk = rr?.ok === true;
				if (unbanOk) errText = '群解封失败';
				else errText = rr?.description || rr?.error || errText;
			} catch (e) { unbanOk = false; if (!restrictOk) errText = e?.message || '解除封禁失败'; }
			const ok = restrictOk || unbanOk;
			if (ok) {
				incrementBulkJobStat(job, 'unbanOk');
			} else {
				incrementBulkJobStat(job, 'unbanFailed');
				pushBulkJobFailure(job, {
					userId: task.userId,
					groupId: task.groupId,
					phase: 'unban',
					error: errText
				});
			}
			return;
		}

		// 按任务携带的 mode 分派单群处置：
		//   'kick'  → /sban 恒踢出（含撤回历史发言）
		//   'human' → /ban /spam 口径：杀手模式 ON 的群踢出、其余禁言
		//   缺省    → 现状：杀手模式 OFF 的群禁言、其余踢出（老任务的 payload 没有该字段，行为不变）
		const result = await applyGroupModeration(task.groupId, task.userId, job.mode);
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

		// 同款连带：删掉该目标在【这个群】发的那几条同款消息。
		// 【放在封禁之后、且不看封禁是否成功】封禁失败常见原因是 bot 在该群没有封禁权限，
		// 但删消息权限是独立的 —— 两者不该互相拖累，能删一条是一条。
		// 与 revoke_messages 的关系见 createBulkJobPayload 里 deleteTargets 的注释：
		// 账号冻结 / 已退群时 revoke 完全无效，这条路才是真正兜住消息删除的那一条。
		const midList = job.deleteTargets?.[String(task.userId)]?.[String(task.groupId)];
		if (Array.isArray(midList) && midList.length) {
			for (const mid of midList) {
				try {
					const del = await deleteMessage(task.groupId, mid);
					// 「删成功」与「消息已不存在/已被封禁 revoke 撤回」都算等效删除：封禁在连带删除
					// 之前就跑了 revoke_messages，还在群里的目标其消息已被删，此处再删必返回 not found，
					// 那不是失败。只有权限不足等真失败才计入 linkedMsgDeleteFailed。
					if (del?.ok || isEffectivelyDeletedError(del?.error)) incrementBulkJobStat(job, 'linkedMsgDeleted');
					else incrementBulkJobStat(job, 'linkedMsgDeleteFailed');
				} catch (_) {
					// 删不掉不影响加黑与封禁（那些已经完成），也不阻塞后续目标。
					incrementBulkJobStat(job, 'linkedMsgDeleteFailed');
				}
			}
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
		await replyToModerationAdmin(message, ctx, {
			flashText: '❌ 批量任务需要绑定 D1',
			groupText: '❌ 批量任务需要绑定 D1',
			detailText,
			isInGroup,
			notifySecondaryOwners: true
		});
		return true;
	}
	const job = await createBulkJob(env, action, valid, invalid, note, message, {
		allowD1Removal: action === 'unban' && options.allowD1Removal === true,
		mode: options.mode || null,
		// 群内静默/简洁（主人要求）：/ban·/spam·/unban 的批量任务【不再向源群推异步完成通知】，
		// 与它们的同步群内策略一致（/ban·/spam 群内全程静默；/unban 群内只保留同步阶段的
		// 「任务已创建」简洁提示）。完整结果照旧私聊第一主人与副主人（job.notifyTargets 不受影响）。
		notifySourceChat: false,
	});
	const autoQueueAvailable = Boolean(getBulkQueue(env));
	if (!autoQueueAvailable) {
		job.autoContinue = false;
		await saveBulkJob(env, job);
	}
	const detailText = formatBulkJobDetail(job, '📦 <b>批量任务已创建</b>');
	await replyToModerationAdmin(message, ctx, {
		flashText: `📦 批量任务已创建 <code>${job.id}</code>\n目标 ${job.totals.users} 个`,
		groupText: `📦 批量任务已创建 <code>${job.id}</code>\n目标 ${job.totals.users} 个`,
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
		// 禁言模式群：/purge 也只禁言不踢出（与杀手模式一致）；其余群照常踢出。
		const purgeMute = isGroupMuteMode(groupId);
		const r = purgeMute ? await muteUserInGroup(groupId, entry.id) : await banUserFromGroup(groupId, entry.id);
		if (r.ok) {
			return {
				type: 'kicked',
				detail: { 用户ID: entry.id, 群ID: groupId, 游标: cursor, 旧状态: status, 结果: purgeMute ? '已禁言' : '已踢' }
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

// 四条管理命令必须先进入鉴权与执行入口，再撤回命令；不能被重发清理提前吞掉。
function isPublicModerationCommand(text) {
	if (!text) return false;
	return /^\/(?:unban|ban|spam|check)(?:@[^\s]+)?(?:\s|$)/i.test(String(text).trim());
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

// /sban：加黑 + 全群【踢出】并撤回历史发言。与 /ban 共用同一条命令分支，只在权限与处置方式上分叉。
// （`^\/sban` 与 `^\/ban` 互不匹配，两条命令不会互相误判。）
function isSbanCommand(text) {
	if (!text) {
		return false;
	}
	return /^\/sban(?:@[^\s]+)?(?:\s|$)/i.test(text.trim());
}

// /sban 鉴权：第一主人 / 副主人 / 该群 Telegram 群主（creator）。
// 超管与普通管理员不给 —— 踢人比禁言重，主人定的口子就是这三种身份。
// 私聊没有群上下文、判不出谁是群主，所以私聊只放第一主人与副主人；群主要踢人得进群发命令。
async function checkSbanPermission(message, userId) {
	if (isBotOperator(message?.from)) return false;
	if (isPrimaryOwner(userId) || isSecondaryOwner(userId)) return true;
	if (message?.chat?.type === 'private') return false;
	if (!isConfiguredGroup(message?.chat?.id)) return false;
	// 不复用 checkIfUserIsAdminInGroup：那个把管理员和群主一并放行，/sban 只认 creator。
	// 不接 AD_ADMIN_CACHE：它存的是 id 列表、没有 status，区分不出群主。
	return await isGroupCreator(userId, String(message.chat.id));
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

// /admins 单次命令的 Telegram 外部请求预算。Cloudflare 免费版每次请求最多 50 个子请求，
// 名单查询只用 40 个，余量留给回执发送等开销；付费版也按同一预算走 —— /admins 是低频查询，
// 不值得为它多花资源。超出预算的查询直接跳过，对应位置回落成纯 TGID / 群 ID，名单主体照常输出。
const ADMINS_LOOKUP_BUDGET = 40;

function createLookupBudget(limit) {
	return {
		left: limit,
		skipped: 0,
		take() {
			if (this.left <= 0) { this.skipped += 1; return false; }
			this.left -= 1;
			return true;
		}
	};
}

// options（均可选，不传时行为与改动前完全一致）：
//   budget        —— createLookupBudget 预算；每次 Telegram 请求前扣 1，扣完即跳过后续查询
async function resolvePermissionUserProfiles(ids, options = {}) {
	const budget = options.budget || null;
	const take = () => !budget || budget.take();
	const wanted = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
	const wantedSet = new Set(wanted);
	const profiles = new Map();

	// 先用静态表填充兜底资料，后续 API 查到时会覆盖
	for (const id of wanted) {
		if (STATIC_USER_PROFILES[id]) {
			profiles.set(id, { user: STATIC_USER_PROFILES[id], status: '', source: 'static', groupId: '' });
		}
	}

	// 查询范围 = 治理群 + 只读资料群。治理群在前：同一个人在两类群都能查到时，
	// 来源群优先显示治理群（那是主人更关心的上下文）。
	// 【只在这个函数里合并】PROFILE_LOOKUP_GROUPS 不进 GROUP_IDS、不进 isConfiguredGroup，
	// 所以封禁 / 检测 / 命令鉴权 / purge / 投票一个都不会碰到这些群。
	const lookupGroups = [...GROUP_IDS, ...PROFILE_LOOKUP_GROUPS];

	for (const groupId of lookupGroups) {
		if (!take()) continue;
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

	// 逐个补查：上面 getChatAdministrators 只能查到【管理员】，而只读资料群里的目标人
	// 通常只是普通成员，必须靠 getChatMember 才查得到 —— 这一轨才是只读资料群的主用途。
	//
	// 【2026-09-11 修正跳过条件】原来写 `if (profiles.has(id)) continue`，
	// 而静态表（STATIC_USER_PROFILES）在函数开头就把兜底资料填进了同一个 Map ——
	// 于是只要某人在静态表里有一条，这一轨就被整个跳过，实时查询永远不执行。
	// 后果是「静态表只作兜底、查到实时资料就覆盖」这个承诺根本不成立：
	// 对方改了昵称永远显示旧值，配了只读资料群也白配。
	// 改为只跳过【已由 API 查到】的，静态兜底不算已解析。
	//
	// 【预算】这一轨最费请求（每人最多把全部群查一遍），预算用完立即整体停下，不再挨个群试。
	lookup: for (const id of wanted) {
		if (profiles.get(id)?.source === 'getChatAdministrators') continue;
		for (const groupId of lookupGroups) {
			if (!take()) break lookup;
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

// /admins 来源群显示：把群 ID 解析成「群名（可点击）+ ID」。
// 【为什么要去重缓存】同一批权限人往往集中在少数几个群（截图里 6 个人分布在 5 个群），
// 逐行调 getChat 会把同一个群查好几遍。/admins 是低频命令，但没理由白花请求。
// 拿不到资料时回落成纯 ID —— 与改动前的显示完全一致，不会因为查询失败反而更难读。
async function resolvePermissionGroupLabels(groupIds, options = {}) {
	const labels = new Map();
	const unique = [...new Set((groupIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
	for (const groupId of unique) {
		if (options.budget && !options.budget.take()) continue;
		try {
			const info = await fetchConfiguredGroupInfo(groupId);
			if (!info?.ok) continue;
			const title = String(info.chat?.title || '').trim();
			// resolveChatInviteUrl：公开群走 t.me/username（永久稳定），
			// 私密群只能用 getChat 返回的 invite_link，而那个字段仅当 bot 是管理员时才有。
			// 刻意不调 exportChatInviteLink —— 那会撤销并重建主邀请链接，
			// 让群内所有人手上的旧链接失效，代价远大于「让一行字可点击」。
			const url = resolveChatInviteUrl(info.chat);
			if (title || url) labels.set(groupId, { title, url });
		} catch (_) {
			// 单群查询失败不影响其它群，也不影响名单主体 —— 回落纯 ID 显示。
		}
	}
	return labels;
}

function renderPermissionGroupText(groupId, label) {
	const idText = '<code>' + escapeHtml(String(groupId)) + '</code>';
	const title = String(label?.title || '').trim();
	if (!title) return idText;
	const safeTitle = escapeHtml(title);
	const url = String(label?.url || '').trim();
	// 有链接就把群名做成超链接，点一下直达；没有则纯文本群名。
	// ID 始终保留 —— 排查时要复制的是它，不该因为有了链接就省掉。
	const titleText = url ? '<a href="' + escapeHtml(url) + '">' + safeTitle + '</a>' : safeTitle;
	return titleText + '（' + idText + '）';
}

function renderPermissionUserLine(id, profile, index, groupLabels) {
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
		lines.push('   来源群:' + renderPermissionGroupText(profile.groupId, groupLabels?.get?.(profile.groupId)));
	}
	if (!user) {
		lines.push('   资料状态:未在配置群中获取到用户资料');
	}
	return lines;
}

function renderPermissionSection(title, ids, profiles, groupLabels) {
	const cleanIds = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
	const lines = [title];
	if (!cleanIds.length) {
		lines.push('无');
		return lines;
	}
	cleanIds.forEach((id, idx) => {
		if (idx > 0) lines.push('');
		lines.push(...renderPermissionUserLine(id, profiles.get(id), idx + 1, groupLabels));
	});
	return lines;
}

async function renderPermissionAdminsList() {
	const primaryOwner = OWNER_IDS.length ? [OWNER_IDS[0]] : [];
	const secondaryOwners = OWNER_IDS.length > 1 ? OWNER_IDS.slice(1) : [];
	// 只读 SUPER_ADMIN_IDS；旧变量 SUPER_ADMINS 早已废弃，不进名单也不单独查资料。
	const superAdmins = [...new Set((SUPER_ADMIN_IDS || []).map((id) => String(id || '').trim()).filter(Boolean))];
	const allIds = [...primaryOwner, ...secondaryOwners, ...superAdmins];
	// 超管常常不在任何群当管理员，要靠逐群补查才拿得到资料 —— 这一轨最费请求，
	// 所以整条命令共用一份预算（见 ADMINS_LOOKUP_BUDGET），免费版也不会超子请求上限。
	const budget = createLookupBudget(ADMINS_LOOKUP_BUDGET);
	const profiles = await resolvePermissionUserProfiles(allIds, { budget });
	// 只查【实际出现在名单里】的来源群，且函数内部去重 ——
	// 不是遍历全部配置群，那会在群多时白花一堆 getChat。
	const groupLabels = await resolvePermissionGroupLabels(
		[...profiles.values()].map((p) => p?.groupId).filter(Boolean),
		{ budget }
	);

	const lines = [
		'🔐 <b>权限名单</b>',
		'',
		...renderPermissionSection('👑 <b>主人</b>', primaryOwner, profiles, groupLabels),
		'',
		...renderPermissionSection('👤 <b>副主人</b>', secondaryOwners, profiles, groupLabels),
		'',
		...renderPermissionSection('⭐ <b>超级管理员</b>', superAdmins, profiles, groupLabels),
		'',
		'说明:用户名/昵称来自 Telegram 当前可读取的群成员资料;未获取时仍以 TGID 为准。',
		'来源群名可点击跳转（公开群走 t.me 永久链接；私密群需 bot 为管理员才有邀请链接，否则只显示群名）。'
	];
	if (budget.skipped > 0) {
		lines.push('为控制资源消耗，本次查询已达请求上限，部分资料只显示 TGID / 群 ID。');
	}
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
	// 【排版】分三节「GKY 封禁记录 / 本地黑名单 / 提示」，每行「标签　内容」，与 /help 同一套风格；
	// 提示类文字统一收进末尾「提示」一节，不再夹在数据中间。
	let localCheck = { isBlacklisted: false, entry: null };
	const localLines = [];
	if (options.env) {
		localCheck = await checkBlacklist(queryTgid, options.env);
		localLines.push('<b>━━ 本地黑名单 ━━</b>');
		if (localCheck.isBlacklisted) {
			const entry = localCheck.entry;
			const reason = translateBlacklistReason(entry?.reason);
			const operator = await translateBlacklistOperator(entry?.by);
			const addedAt = entry?.at || '未知';
			const noteText = String(entry?.note || '').trim();
			localLines.push('状态　　🚫 在黑名单中');
			localLines.push('加黑方式　' + reason);
			if (noteText) localLines.push('执行原因　' + escapeHtml(noteText));
			localLines.push('操作人　　' + operator);
			localLines.push('加黑时间　' + escapeHtml(addedAt));
		} else {
			localLines.push('状态　　✅ 不在黑名单');
		}
	}

	const userMention = options.targetUser ? formatUserMention(options.targetUser) : '';
	const userLine = '用户　　' + (userMention
		? userMention + '（<code>' + escapeHtml(queryTgid) + '</code>）'
		: '<a href="tg://user?id=' + escapeHtml(queryTgid) + '">' + escapeHtml(queryTgid) + '</a>');
	const gkyLines = ['<b>━━ GKY 封禁记录 ━━</b>', userLine];
	const notes = [];
	let canCopyGkyCommand = false;
	// 记录是否属于本部署的配置群：决定 GKY 代码的语义是「移出本群黑名单」
	// 还是「加 GKY 全局白名单」，两者影响面差别很大，必须在提示里说清。
	let gkyRecordInConfiguredGroup = false;

	if (!banlistData.success) {
		gkyLines.push('状态　　❌ GKY 查询失败（' + escapeHtml(toChineseErrorText(banlistData.error || '未知错误')) + '）');
	} else if (!banlistData.banned) {
		gkyLines.push('状态　　✅ 无封禁记录');
	} else {
		if (banlistData.chatId) {
			const chatInfo = await getChatInfoFromId(banlistData.chatId);
			const idText = '<code>' + escapeHtml(banlistData.chatId) + '</code>';
			let groupText = idText;
			if (chatInfo && chatInfo.title) {
				const titleText = chatInfo.link
					? '<a href="' + escapeHtml(chatInfo.link) + '">' + escapeHtml(chatInfo.title) + '</a>'
					: escapeHtml(chatInfo.title);
				groupText = titleText + '（' + idText + '）';
			}
			gkyLines.push('来源群　' + groupText);
		}
		if (banlistData.msgId) gkyLines.push('消息 ID　<code>' + escapeHtml(banlistData.msgId) + '</code>');
		if (banlistData.recordedDate) gkyLines.push('封禁时间　' + escapeHtml(formatGkyRecordedDate(banlistData.recordedDate)));
		if (banlistData.reason) gkyLines.push('封禁原因　' + escapeHtml(banlistData.reason));
		if (banlistData.info) gkyLines.push('封禁内容　<tg-spoiler>' + escapeHtml(banlistData.info) + '</tg-spoiler>');

		const recordTgid = String(banlistData.tgid || '');
		if (recordTgid !== queryTgid) {
			// 这道门必须留：GKY 返回的记录与查询目标不是同一个人，此时给按钮会给错人加白名单。
			notes.push('⚠️ GKY 返回记录的 TGID 无法与查询目标核对，不提供 GKY 复制按钮，请稍后重新 <code>/check</code>');
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

	const composeText = () => {
		const parts = ['🔍 <b>封禁查询结果</b>', '', ...gkyLines];
		if (localLines.length) parts.push('', ...localLines);
		if (notes.length) parts.push('', '<b>━━ 提示 ━━</b>', ...notes);
		return parts.join('\n');
	};

	if (!options.includeReviewAction) {
		return { text: composeText() };
	}

	// 非配置群仍可查询两套状态，但不开放任何复制操作。
	if (options.dispatchSourceAllowed === false) {
		notes.push('⚠️ 当前查询来自非配置群，仅提供查询结果，不提供任何复制按钮；请在私聊或配置群重新 <code>/check</code>');
		return { text: composeText() };
	}

	const inlineKeyboard = [];
	if (canCopyGkyCommand) {
		if (gkyRecordInConfiguredGroup) {
			// 记录就在自己的配置群：语义是把该号从该群的 GKY 黑名单里移出。
			notes.push('ℹ️ 下方代码会把此号移出该群的 GKY 黑名单，需要真人管理员在对应配置群发送');
			inlineKeyboard.push([{
				text: '📋 点击复制 GKY 移出黑名单代码',
				copy_text: { text: `GKYbotSave\n${queryTgid}` }
			}]);
		} else {
			// 记录来自别的群：GKYbotSave 此时的效果是给该号加 GKY【全局】白名单，
			// 该号在所有接入 GKYbot 的群都会被放行 —— 影响面远大于"解封我这个群"，
			// 按钮文字四个字说不清，必须在提示里写明，否则容易被当成本地白名单。
			// 来源群 ID 已在「来源群」一行给出，这里不再重复。
			notes.push('⚠️ 该记录不属于你的配置群，下方代码会给此号加 GKY 全局白名单（所有接入 GKYbot 的群都生效）');
			notes.push('ℹ️ 只影响 GKY，不改动本地黑名单；需要真人管理员发送才生效');
			inlineKeyboard.push([{
				text: '📋 点击复制 GKY 添加全局白名单代码',
				copy_text: { text: `GKYbotSave\n${queryTgid}` }
			}]);
		}
	}

	if (localCheck.isBlacklisted) {
		notes.push('ℹ️ 下方本地解封命令只是复制，不会直接修改黑名单；需要有权限的管理员发送');
		inlineKeyboard.push([{
			text: '📋 点击复制 本地解封命令',
			copy_text: { text: `/unban ${queryTgid}` }
		}]);
	}

	const responseMessage = composeText();
	if (!inlineKeyboard.length) {
		return { text: responseMessage };
	}

	return {
		text: responseMessage,
		replyMarkup: { inline_keyboard: inlineKeyboard }
	};
}

// GKY 返回的时间形如「2026-07-27T08:23:43 [UTC+08:00]」，整理成「2026-07-27 08:23:43（UTC+8）」。
// 认不出的格式原样返回 —— GKY 是第三方站点，格式变了宁可显示原样也不能显示错。
function formatGkyRecordedDate(raw) {
	const s = String(raw || '').trim();
	const m = s.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}(?::\d{2})?)\s*\[?UTC\s*([+-])(\d{1,2})(?::?(\d{2}))?\]?$/i);
	if (!m) return s;
	const minutes = m[5] && m[5] !== '00' ? ':' + m[5] : '';
	return m[1] + ' ' + m[2] + '（UTC' + m[3] + Number(m[4]) + minutes + '）';
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

	// 群统计·进退群计数（真人；配置群已在上方校验）。计在各业务 return 之前，避免漏。
	//   群外→群内 = 入群；群内→left = 主动退群；群内→kicked = 被踢/被封。
	{
		const _inGroup = (st) => st === 'member' || st === 'restricted' || st === 'administrator' || st === 'creator';
		const _os = oldMember.status;
		const _ns = newMember.status;
		let _kind = null;
		if (!_inGroup(_os) && _inGroup(_ns)) _kind = 'join';
		else if (_inGroup(_os) && _ns === 'left') _kind = 'leave';
		else if (_inGroup(_os) && _ns === 'kicked') _kind = 'kicked';

		if (_kind) {
			await recordMemberEvent(env, chat.id, _kind);
			// 第2批：同时写明细（谁、何时、被谁操作、走哪条邀请链接）供 /profile 时间线读。
			// 时间用 ChatMemberUpdated.date（官方字段），拿不到才退回当前时刻。
			await recordMemberEventDetail(env, chat.id, targetIdStr, _kind,
				Number(chatMember?.date) > 0 ? chatMember.date * 1000 : Date.now(), {
					actorId: fromIdStr,
					inviteLink: chatMember?.invite_link?.invite_link || null,
					viaRequest: chatMember?.via_join_request === true,
				});
		}
	}

	// 复入群拦截：用户从非成员状态变为 member/restricted（被拉进群、点链接加群、unban 后自加回）
	// 先于"操作人 === 用户本人"检查，因为自加群时 from === target，会被后面跳过逻辑拦掉
	//
	// 【bot 自己的操作不算复入群（2026-10-11）】
	// 线上实测：批量拉黑时日志里成片的「旧状态:left → 新状态:restricted」，同一秒跨十几个群、
	// 三个用户同时发生 —— 真人不可能这么进群。根因是 bot 对【已离群】的黑名单用户执行
	// restrictChatMember 时，Telegram 不报错、反而把他【拉回群并设为受限】，
	// 于是产生一条 left → restricted 的 chat_member 事件，被下面的 enteredGroup 判成「复入群」，
	// 而此刻正在拉黑、黑名单当然命中 → 踢回 + 发通知。
	// 净效果是把人拉回来又踢走，还刷一堆「复入群拦截」——功能没错（人仍在黑名单、群仍干净），
	// 但噪音和副作用都是实打实的。from 是【操作者】，等于 bot 自己就是始作俑者，必须先摘出去。
	// 真人 / 其它管理员造成的复入群，from.id 不是 bot，拦截照旧生效。
	const selfBotId = await getBotId();
	const actorIsSelfBot = Boolean(selfBotId) && String(chatMember?.from?.id || '') === String(selfBotId);
	const oldStatusEarly = oldMember.status;
	const newStatusEarly = newMember.status;
	const enteredGroup =
		!actorIsSelfBot &&
		(newStatusEarly === 'member' || newStatusEarly === 'restricted') &&
		oldStatusEarly !== 'member' &&
		oldStatusEarly !== 'restricted' &&
		oldStatusEarly !== 'administrator' &&
		oldStatusEarly !== 'creator';
	if (enteredGroup) {
		const blacklistCheck = await checkBlacklist(targetIdStr, env);
		if (blacklistCheck.isBlacklisted) {
			// 受保护角色（主/副/超管/任一配置群群主·管理员）复入不踢：避免误加黑把他们踢出。
			if (await isProtectedFromAutoModeration(targetIdStr, String(chat.id))) {
				console.log('[chat_member] 受保护角色复入，不踢回:', JSON.stringify({ 群ID: chat.id, 用户ID: targetIdStr }));
				return;
			}
			if (isGroupMuteMode(chat.id)) {
				// 禁言模式群：黑名单用户复入【不踢回】（主人要求：只禁言不踢出）。
				console.log('[chat_member] 禁言模式群，黑名单用户复入不踢回:', JSON.stringify({ 群ID: chat.id, 用户ID: targetIdStr }));
				return;
			}
			const banResult = await banUserFromGroup(chat.id, targetIdStr);
			console.log('[chat_member] 黑名单用户复入群，立即踢回:', JSON.stringify({
				群ID: chat.id,
				用户ID: targetIdStr,
				旧状态: oldStatusEarly,
				新状态: newStatusEarly,
				踢人结果: banResult.ok ? '成功' : `失败:${banResult.error}`
			}));
			// 风控·处置：黑名单用户复入被当场踢回，算本群挡下一次（失败不计）。
			await recordDisposalsFromBanResults(env, [{ groupId: chat.id, ok: banResult?.ok === true }]);
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
		// 'dryrun' = 判定命中但演练没处置，人还在群里。仍要在这里 return：
		// 下面那套是给 kicked / promoted 之类管理员动作用的，入群场景继续走会触发无关逻辑。
		if (joinVerdict === 'banned' || joinVerdict === 'dryrun') return;
	}

	// 跳过：操作人是被操作用户本人（用户自愿 leave 不算管理员动作）
	if (targetIdStr === fromIdStr) return;

	// 跳过：操作人是机器人自己（避免与自助解封形成循环）
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
			if (isGroupMuteMode(chat.id)) {
				// 禁言模式群：不封回（主人要求：只禁言不踢出）。仅审计通知。
				console.log('[chat_member] 禁言模式群，黑名单用户被手动解封，不封回:', JSON.stringify(logCommon));
				await notifyOwnerChatMemberAction(chatMember, '解封用户（禁言模式群，未封回）', oldStatus, newStatus);
			} else {
				// 仍在 D1 黑名单 → 撤销本次群内手动解封，立即封回，绝不删除黑名单记录
				const banResult = await banUserFromGroup(chat.id, targetIdStr);
				console.log('[chat_member] 拦截群内手动解封(D1黑名单保护):', JSON.stringify({ ...logCommon, 封回结果: banResult.ok ? '成功' : `失败:${banResult.error}` }));
				// 风控·处置：封回成功即本群挡下一次（管理员试图绕过 D1 黑名单解封）。
				await recordDisposalsFromBanResults(env, [{ groupId: chat.id, ok: banResult?.ok === true }]);
				await notifyOwnerBlacklistIntercept(targetUser, chat, '群内手动解封拦截', blacklistCheck, banResult);
			}
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

// ===== 杀手模式（KILLER_MODE_GROUPS + /killer 每群切换，状态存 D1）=====
// ON = 封禁踢出（现状）；OFF = 仅永久禁言、不踢出（人留群）。无记录走 KILLER_MODE_DEFAULT_ON。
async function ensureKillerModeTable(env) {
	if (!env.DB) return false;
	const cached = D1_KILLER_MODE_INIT_PROMISES.get(env.DB);
	if (cached) return cached;
	const initPromise = (async () => {
		try {
			if (!(await ensureD1Table(env))) throw new Error('D1 核心结构不可用');
			await runD1SchemaStatement(
				env,
				'killer_mode',
				'CREATE TABLE IF NOT EXISTS killer_mode (chat_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, by_user TEXT, at TEXT NOT NULL);',
			);
			return true;
		} catch (error) {
			console.error('D1 杀手模式表初始化失败: ' + formatD1SchemaError(error));
			return false;
		}
	})();
	D1_KILLER_MODE_INIT_PROMISES.set(env.DB, initPromise);
	const initialized = await initPromise;
	if (!initialized) D1_KILLER_MODE_INIT_PROMISES.delete(env.DB);
	return initialized;
}

function isKillerModeGroup(chatId) {
	return KILLER_MODE_GROUPS.length > 0 && KILLER_MODE_GROUPS.includes(String(chatId || ''));
}

// 读取全部群的杀手开关记录 → Map(chat_id → 1/0)。无记录的群由调用方走 KILLER_MODE_DEFAULT_ON。
async function readKillerStateMap(env) {
	const map = new Map();
	if (!env.DB || !KILLER_MODE_GROUPS.length) return map;
	if (!(await ensureKillerModeTable(env))) return map;
	try {
		const { results } = await env.DB.prepare('SELECT chat_id, enabled FROM killer_mode').all();
		for (const r of (results || [])) map.set(String(r.chat_id), Number(r.enabled) ? 1 : 0);
	} catch (error) {
		console.error('[杀手模式] 读取状态失败:', error);
	}
	return map;
}
// __KILLER_MORE__

// 每请求重建禁言模式群集合：KILLER_MODE_GROUPS 里、当前杀手 OFF 的群 = 禁言模式。
async function refreshMuteModeGroups(env) {
	MUTE_MODE_GROUP_SET = new Set();
	if (!KILLER_MODE_GROUPS.length) return;
	const stateMap = await readKillerStateMap(env);
	for (const g of KILLER_MODE_GROUPS) {
		const id = String(g);
		const on = stateMap.has(id) ? stateMap.get(id) === 1 : KILLER_MODE_DEFAULT_ON;
		if (!on) MUTE_MODE_GROUP_SET.add(id);
	}
}

// 该群此刻是否禁言模式（杀手 OFF）。读模块级集合、不需 env —— 供逐群封禁/拦截判定。
function isGroupMuteMode(chatId) {
	return MUTE_MODE_GROUP_SET.has(String(chatId || ''));
}

// 单群杀手当前是否 ON（封禁踢出）。供 /killer 显示与切换。
async function isKillerOn(env, chatId) {
	const stateMap = await readKillerStateMap(env);
	const id = String(chatId || '');
	return stateMap.has(id) ? stateMap.get(id) === 1 : KILLER_MODE_DEFAULT_ON;
}

// 设置单群杀手开关。on=true → 封禁踢出；on=false → 禁言。
async function setKillerMode(env, chatId, on, byUser) {
	if (!env.DB) return { ok: false, error: '未绑定 D1 存储空间' };
	if (!(await ensureKillerModeTable(env))) return { ok: false, error: 'D1 杀手模式表初始化失败' };
	try {
		await env.DB.prepare('INSERT OR REPLACE INTO killer_mode (chat_id, enabled, by_user, at) VALUES (?, ?, ?, ?)')
			.bind(String(chatId), on ? 1 : 0, String(byUser || ''), new Date().toISOString())
			.run();
		return { ok: true, on: !!on };
	} catch (error) {
		console.error('[杀手模式] 写入状态失败:', error);
		return { ok: false, error: error.message || String(error) };
	}
}

// ===== 演练模式（dryrun）=====
//
// 【做什么】群开关打开后广告判定照常跑，但处置链一个人都不动：不加黑、不封禁、
// 不删消息、不学指纹 / AI 样本 / 头像 / 形状、不写 /ignore 快照 —— 只写一条流水，
// 并推一条带 🧪 的私聊给第一主人。用途是「动手之前先看会封谁」，调阈值用。
//
// 【代价，必须一直写明】演练开着 = 本群完全不设防，广告照发、不删不封。这是演练的
// 本质不是缺陷，但回执与 /adstats 都要显眼提示，别让人开了忘记关。
//
// 【为什么开关不进 fetch 入口的刷新】killer_mode 走 refreshMuteModeGroups 在每个请求
// 开头读一次；演练若照抄，每条普通消息都会多一条 D1 查询，直接把
// 「稳定态核心 SQL ≤ 3 条」那条断言撞红。演练只在【定罪时】才走到读开关这一步，
// 热路径永远到不了它，所以这里刻意不做运行期缓存、也不挂进 fetch 入口。
const D1_DRYRUN_INIT_PROMISES = new WeakMap();

async function ensureDryRunTable(env) {
	if (!env.DB) return false;
	const cached = D1_DRYRUN_INIT_PROMISES.get(env.DB);
	if (cached) return cached;
	const initPromise = (async () => {
		try {
			if (!(await ensureD1Table(env))) throw new Error('D1 核心结构不可用');
			await runD1SchemaStatement(
				env,
				'dryrun_groups',
				'CREATE TABLE IF NOT EXISTS dryrun_groups (chat_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, by_user TEXT, at TEXT NOT NULL);',
			);
			return true;
		} catch (error) {
			console.error('D1 演练模式表初始化失败: ' + formatD1SchemaError(error));
			return false;
		}
	})();
	D1_DRYRUN_INIT_PROMISES.set(env.DB, initPromise);
	const initialized = await initPromise;
	if (!initialized) D1_DRYRUN_INIT_PROMISES.delete(env.DB);
	return initialized;
}

// 该群此刻是否演练模式。
// 【读失败一律返回 false = 照常处置】：开关读不出来时宁可真的执行处置，也不能因为
// 一次 D1 抖动就把整个群静默变成不设防 —— 演练是主人主动开的，防护缺位不能由故障引发。
async function isDryRunGroup(env, chatId) {
	const id = String(chatId || '');
	if (!id || !env?.DB) return false;
	if (!(await ensureDryRunTable(env))) return false;
	try {
		const row = await env.DB.prepare('SELECT enabled FROM dryrun_groups WHERE chat_id = ?').bind(id).first();
		return Number(row?.enabled) === 1;
	} catch (error) {
		console.error('[演练模式] 读取开关失败（按正常处置继续）:', error);
		return false;
	}
}

// 写开关。返回 {ok, error}，供命令回执区分「写成功」与「写失败」。
async function setDryRun(env, chatId, on, byUser) {
	if (!env.DB) return { ok: false, error: '未绑定 D1 存储空间' };
	if (!(await ensureDryRunTable(env))) return { ok: false, error: 'D1 演练模式表初始化失败' };
	try {
		await env.DB.prepare('INSERT OR REPLACE INTO dryrun_groups (chat_id, enabled, by_user, at) VALUES (?, ?, ?, ?)')
			.bind(String(chatId), on ? 1 : 0, String(byUser || ''), new Date().toISOString())
			.run();
		return { ok: true, on: !!on };
	} catch (error) {
		console.error('[演练模式] 写入开关失败:', error);
		return { ok: false, error: error.message || String(error) };
	}
}

// 已开演练的群 → Map(chat_id → 1)。供 /dryrun 私聊列出各群状态。
async function readDryRunStateMap(env) {
	const map = new Map();
	if (!env.DB) return map;
	if (!(await ensureDryRunTable(env))) return map;
	try {
		const { results } = await env.DB.prepare('SELECT chat_id, enabled FROM dryrun_groups').all();
		for (const r of (results || [])) if (Number(r.enabled) === 1) map.set(String(r.chat_id), 1);
	} catch (error) {
		console.error('[演练模式] 读取状态失败:', error);
	}
	return map;
}

// ===== 演练流水 =====
//
// 【为什么单独一张表】演练命中的价值全在「判据 reasons + 得分」，要能回头逐条复盘。
// 现有几张表都存不了它：ad_user_screening 与 ad_pending_snapshots 一小时就过期、
// moderation_messages 只留最近 200 条且不含判据、blacklist 只有封过的没有未处置的。
//
// 【为什么懒建而不进广告层完整性复验】演练是可选功能，这张表没建好时只该丢演练流水，
// 不能连累广告检测整体判为「未就绪」而把真处置一起停摆。与 ad_spam_texts 同一套做法：
// 按需建、建失败不缓存、下次再试。
//
// 保留 30 天：写入时顺手清掉超期旧行，表永远很小，不为一个可选功能再占一条 cron 节拍。
const AD_DRYRUN_LOG_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const D1_AD_DRYRUN_LOG_INIT = new WeakMap();

async function ensureAdDryRunLogTable(env) {
	if (!env?.DB) return false;
	const cached = D1_AD_DRYRUN_LOG_INIT.get(env.DB);
	if (cached) return cached;
	const init = (async () => {
		try {
			await runD1SchemaStatement(env, 'ad_dryrun_log',
				'CREATE TABLE IF NOT EXISTS ad_dryrun_log (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, user_id TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0, threshold INTEGER NOT NULL DEFAULT 0, verdict TEXT NOT NULL DEFAULT \'\', layer TEXT NOT NULL DEFAULT \'\', reasons TEXT NOT NULL DEFAULT \'\', snapshot TEXT NOT NULL DEFAULT \'\', evaluation TEXT NOT NULL DEFAULT \'\', fp INTEGER NOT NULL DEFAULT 0, done INTEGER NOT NULL DEFAULT 0, learned INTEGER NOT NULL DEFAULT 0, sample INTEGER NOT NULL DEFAULT 0, badges INTEGER NOT NULL DEFAULT 0, avatars INTEGER NOT NULL DEFAULT 0, images INTEGER NOT NULL DEFAULT 0, shapes INTEGER NOT NULL DEFAULT 0, links INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0)');
			await runD1SchemaStatement(env, 'idx_ad_dryrun_created', 'CREATE INDEX IF NOT EXISTS idx_ad_dryrun_created ON ad_dryrun_log (created_at)', { optional: true });
			// ===== 按钮十列（存量表迁移）=====
			// CREATE TABLE IF NOT EXISTS 对已存在的表完全无效，缺了这一步老部署会在
			// 第一次点按钮时报 no such column —— 而错误被上层 catch 吞掉后，表现是
			//「按钮点了没反应」，看不出哪里断了。
			// 先判表再判列：表不存在 = 首次建表，上面的 CREATE 已经带齐十列。
			// learned/sample 是演练期「已学特征」的记账：确认封时据此跳过重复学习，
			// 否则一次演练拍板会让头像与资料形状的 hits 各 +1，直接顶到封禁档。
			// badges/avatars/images/shapes/links 五列服务于关演练时的汇总回执
			// （summarizeDryRunLearning），说清这一轮七类各学了多少。
			if (await d1TableExists(env, 'ad_dryrun_log')) {
				for (const column of ['evaluation', 'fp', 'done', 'learned', 'sample',
					'badges', 'avatars', 'images', 'shapes', 'links']) {
					try {
						if (!(await d1ColumnExists(env, 'ad_dryrun_log', column))) {
							await runD1SchemaStatement(env, 'ad_dryrun_log.' + column,
								'ALTER TABLE ad_dryrun_log ADD COLUMN ' + column
								+ (column === 'evaluation'
									? ' TEXT NOT NULL DEFAULT \'\''
									: ' INTEGER NOT NULL DEFAULT 0'));
						}
					} catch (error) {
						const message = formatD1SchemaError(error).toLowerCase();
						if (!message.includes('duplicate') && !message.includes('exists')) throw error;
					}
				}
			}
			return true;
		} catch (error) {
			console.error('[演练模式] 建流水表失败:', error?.message || error);
			return false;
		}
	})();
	D1_AD_DRYRUN_LOG_INIT.set(env.DB, init);
	const ok = await init;
	if (!ok) D1_AD_DRYRUN_LOG_INIT.delete(env.DB);
	return ok;
}

// 判定对象整体 JSON 化。环引用 / 循环引用都会让 JSON.stringify 抛，
// 而流水写失败不该连累处置链的返回结构 —— 退化成空对象也要写成功。
function safeJsonStringify(value) {
	try {
		return JSON.stringify(value);
	} catch (_) {
		return '{}';
	}
}

// 记一条演练命中。返回流水 id（拿不到返回 null）。
// 【写失败绝不影响调用方】：演练本来就什么都不做，流水少一条只影响复盘，
// 不能因为一次 D1 抖动让处置链的返回结构变样、进而让调用方的回执分支走错。
async function recordAdDryRun(env, input) {
	if (!env?.DB) return null;
	if (!(await ensureAdDryRunLogTable(env))) return null;
	try {
		const evaluation = input?.evaluation || {};
		const nowSeconds = Math.floor(Date.now() / 1000);
		const res = await env.DB.prepare(
			'INSERT INTO ad_dryrun_log (chat_id, user_id, score, threshold, verdict, layer, reasons, snapshot, evaluation, created_at)'
			+ ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
		).bind(
			String(input?.chatId || ''),
			String(input?.userId || ''),
			Number(evaluation.score) || 0,
			Number(evaluation.threshold) || 0,
			String(evaluation.verdict || ''),
			String(evaluation.layer || ''),
			JSON.stringify(Array.isArray(evaluation.reasons) ? evaluation.reasons.slice(0, 20) : []),
			JSON.stringify(evaluation.snapshot || {}),
			// 整份判定存全量：按钮点「确认封」时要原样交回 enforceAdDetection，
			// 只存判据与快照的话，payload / structure / behaviorScore 这些它要用的
			// 字段都还原不出来 —— 学指纹、学样本、清观察那一串会拿错数据。
			safeJsonStringify(evaluation),
			nowSeconds
		).run();
		await env.DB.prepare('DELETE FROM ad_dryrun_log WHERE created_at < ?')
			.bind(nowSeconds - Math.floor(AD_DRYRUN_LOG_TTL_MS / 1000)).run();
		// 三写法兜底，与 pruneAutoincrementCacheTable 取自增主键的口径一致。
		return Number(res?.meta?.last_row_id ?? res?.meta?.lastRowId ?? res?.meta?.last_rowid) || null;
	} catch (error) {
		console.error('[演练模式] 写入流水失败:', error);
		return null;
	}
}

// 读演练流水：最近 limit 条，可按群过滤。供 /adstats 一屏展示。
async function readAdDryRunLog(env, options = {}) {
	const rows = [];
	if (!env?.DB) return rows;
	if (!(await ensureAdDryRunLogTable(env))) return rows;
	const limit = Math.max(1, Math.min(Number(options.limit) || 5, 20));
	try {
		const chatId = String(options.chatId || '');
		const stmt = chatId
			? env.DB.prepare('SELECT id, chat_id, user_id, score, threshold, layer, reasons, fp, done, created_at FROM ad_dryrun_log WHERE chat_id = ? ORDER BY id DESC LIMIT ?').bind(chatId, limit)
			: env.DB.prepare('SELECT id, chat_id, user_id, score, threshold, layer, reasons, fp, done, created_at FROM ad_dryrun_log ORDER BY id DESC LIMIT ?').bind(limit);
		const { results } = await stmt.all();
		for (const r of (results || [])) rows.push(r);
	} catch (error) {
		console.error('[演练模式] 读取流水失败:', error);
	}
	return rows;
}

// 某群的演练命中统计，/adstats 一屏用。
// fp/done 是主人点按钮留下的两个结论：误报（点「不该封」）与已处置（点「确认封」）。
// lowestFp = 被判误报的最低得分 —— 它贴住封禁线就说明线设低了，这一条直接告诉主人往哪调。
async function countAdDryRun(env, chatId) {
	const out = { total: 0, today: 0, fp: 0, done: 0, lowestFp: null };
	if (!env?.DB) return out;
	if (!(await ensureAdDryRunLogTable(env))) return out;
	const id = String(chatId || '');
	try {
		if (id) {
			const { results } = await env.DB.prepare(
				'SELECT COUNT(*) AS total,'
				+ ' SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS today,'
				+ ' SUM(CASE WHEN fp = 1 THEN 1 ELSE 0 END) AS fp_count,'
				+ ' SUM(CASE WHEN done = 1 THEN 1 ELSE 0 END) AS done_count,'
				+ ' MIN(CASE WHEN fp = 1 THEN score END) AS lowest_fp'
				+ ' FROM ad_dryrun_log WHERE chat_id = ?'
			).bind(Math.floor(Date.now() / 1000) - 86400, id).all();
			const row = results?.[0] || {};
			out.total = Number(row.total) || 0;
			out.today = Number(row.today) || 0;
			out.fp = Number(row.fp_count) || 0;
			out.done = Number(row.done_count) || 0;
			out.lowestFp = row.lowest_fp === null || row.lowest_fp === undefined ? null : Number(row.lowest_fp);
		}
	} catch (error) {
		console.error('[演练模式] 统计流水失败:', error);
	}
	return out;
}

// 读单条演练流水（含整份判定）。按钮回调用：要把原始 evaluation 原样交回处置链。
async function readAdDryRunRow(env, id) {
	const rowId = Number(id) || 0;
	if (!env?.DB || !rowId) return null;
	if (!(await ensureAdDryRunLogTable(env))) return null;
	try {
		return await env.DB.prepare(
			'SELECT id, chat_id, user_id, score, threshold, verdict, layer, reasons, evaluation, fp, done, learned, sample, created_at'
			+ ' FROM ad_dryrun_log WHERE id = ?'
		).bind(rowId).first();
	} catch (error) {
		console.error('[演练模式] 读取单条流水失败:', error);
		return null;
	}
}

// 给演练流水落一个主人结论。field 只接受 fp / done 两值，避免拼进 SQL 的列名失控。
// 返回是否写成功（幂等：已经置过的会返回 false，防按钮重复点重复处置）。
async function markAdDryRunVerdict(env, id, field) {
	const rowId = Number(id) || 0;
	const column = field === 'fp' ? 'fp' : (field === 'done' ? 'done' : '');
	if (!env?.DB || !rowId || !column) return { ok: false, reason: 'bad_arg' };
	if (!(await ensureAdDryRunLogTable(env))) return { ok: false, reason: 'no_table' };
	try {
		const res = await env.DB.prepare(
			'UPDATE ad_dryrun_log SET ' + column + ' = 1 WHERE id = ? AND ' + column + ' = 0'
		).bind(rowId).run();
		const changed = Number(res?.meta?.changes || 0);
		return { ok: changed > 0, changed };
	} catch (error) {
		console.error('[演练模式] 写入结论失败:', error);
		return { ok: false, reason: 'error', error: error.message || String(error) };
	}
}

// 记下这一条演练已经学了哪些特征（七类各多少）。
//
// 两个用途：
//   ① 主人点「✅ 确认封」时据此跳过重复学习 —— hits 是 +1 语义，确认封那一次
//      再学一遍会让头像与资料形状各 +1，直接顶到封禁档（AD_PROFILE_SHAPE_MIN_HITS=2、
//      头像 hits>=2），把安全阀提前拱开。同一个坑代码里已经踩过两次。
//   ② 主人关演练时给一份「这一轮学到什么」的汇总（summarizeDryRunLearning）。
async function markAdDryRunLearned(env, id, tally) {
	const rowId = Number(id) || 0;
	const t = tally || {};
	if (!env?.DB || !rowId) return { ok: false, reason: 'bad_arg' };
	if (!(await ensureAdDryRunLogTable(env))) return { ok: false, reason: 'no_table' };
	try {
		const res = await env.DB.prepare(
			'UPDATE ad_dryrun_log SET learned = ?, sample = ?,'
			+ ' badges = ?, avatars = ?, images = ?, shapes = ?, links = ? WHERE id = ?'
		).bind(Number(t.learned) || 0, t.sampleAdded ? 1 : 0,
			Number(t.badges) || 0, Number(t.avatars) || 0, Number(t.images) || 0,
			Number(t.shapes) || 0, Number(t.links) || 0, rowId).run();
		return { ok: Number(res?.meta?.changes || 0) > 0 };
	} catch (error) {
		console.error('[演练模式] 记录学习结果失败:', error);
		return { ok: false, reason: 'error', error: error.message || String(error) };
	}
}
// ===== 入群检查流水 =====
//
// 【为什么每次入群都记，包括判为正常的】只记命中的话，用户页与看板对绝大多数
// 新成员是一片空白 —— 管理员分不清「检查过、这个人正常」和「压根没看过他」，
// 而后者正是漏放最典型的形态。menshen 的 coldjudge 每次都落一条 join_checked，
// action 明确排除在「被处置过」的计数之外，本表同理：它是检查记录，不是处置记录。
//
// 按需建、不进广告层完整性复验：这张表只服务看板，建失败不该让真处置停摆。
// 保留 30 天，写入时顺手剪，量级是「进群人数 × 30」。
const AD_JOIN_CHECKS_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const D1_AD_JOIN_CHECKS_INIT = new WeakMap();

async function ensureAdJoinChecksTable(env) {
	if (!env?.DB) return false;
	const cached = D1_AD_JOIN_CHECKS_INIT.get(env.DB);
	if (cached) return cached;
	const init = (async () => {
		try {
			// 刻意不给字符串列写 DEFAULT 空串：INSERT 每次都提供全值，而带引号的
			// DEFAULT '' 在本文件的单引号字符串里要转义，多一处转义就多一次踩坑机会。
			await runD1SchemaStatement(env, 'ad_join_checks',
				'CREATE TABLE IF NOT EXISTS ad_join_checks (id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, user_id TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0, threshold INTEGER NOT NULL DEFAULT 0, verdict TEXT NOT NULL, layer TEXT NOT NULL, reasons TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT 0)');
			await runD1SchemaStatement(env, 'idx_ad_join_checks_created', 'CREATE INDEX IF NOT EXISTS idx_ad_join_checks_created ON ad_join_checks (created_at)', { optional: true });
			return true;
		} catch (error) {
			console.error('[入群检查] 建流水表失败:', error?.message || error);
			return false;
		}
	})();
	D1_AD_JOIN_CHECKS_INIT.set(env.DB, init);
	const ok = await init;
	if (!ok) D1_AD_JOIN_CHECKS_INIT.delete(env.DB);
	return ok;
}

// 记一条入群检查。【任何 verdict 都记】，返回流水 id（失败返回 null）。
// 失败绝不影响调用方：流水只是看板数据，不能让入群筛查的返回值变形。
async function recordAdJoinCheck(env, input) {
	if (!env?.DB) return null;
	if (!(await ensureAdJoinChecksTable(env))) return null;
	try {
		const evaluation = input?.evaluation || {};
		const nowSeconds = Math.floor(Date.now() / 1000);
		const res = await env.DB.prepare(
			'INSERT INTO ad_join_checks (chat_id, user_id, score, threshold, verdict, layer, reasons, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		).bind(
			String(input?.chatId || ''),
			String(input?.userId || ''),
			Number(evaluation.score) || 0,
			Number(evaluation.threshold) || 0,
			String(evaluation.verdict || ''),
			String(evaluation.layer || ''),
			JSON.stringify(Array.isArray(evaluation.reasons) ? evaluation.reasons.slice(0, 20) : []),
			nowSeconds
		).run();
		await env.DB.prepare('DELETE FROM ad_join_checks WHERE created_at < ?')
			.bind(nowSeconds - Math.floor(AD_JOIN_CHECKS_TTL_MS / 1000)).run();
		return Number(res?.meta?.last_row_id ?? res?.meta?.lastRowId ?? res?.meta?.last_rowid) || null;
	} catch (error) {
		console.error('[入群检查] 写入流水失败:', error);
		return null;
	}
}

// 某群的入群检查统计：今日 / 累计 / 其中真正被处置的（verdict=ban）。
async function countAdJoinChecks(env, chatId) {
	const out = { total: 0, today: 0, hits: 0 };
	if (!env?.DB) return out;
	if (!(await ensureAdJoinChecksTable(env))) return out;
	const id = String(chatId || '');
	if (!id) return out;
	try {
		const { results } = await env.DB.prepare(
			'SELECT COUNT(*) AS total, '
			+ 'SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS today, '
			+ 'SUM(CASE WHEN verdict = ? THEN 1 ELSE 0 END) AS hits '
			+ 'FROM ad_join_checks WHERE chat_id = ?'
		).bind(Math.floor(Date.now() / 1000) - 86400, 'ban', id).all();
		out.total = Number(results?.[0]?.total) || 0;
		out.today = Number(results?.[0]?.today) || 0;
		out.hits = Number(results?.[0]?.hits) || 0;
	} catch (error) {
		console.error('[入群检查] 统计流水失败:', error);
	}
	return out;
}

// 最近几条入群检查，供 /adstats 展示「检查过、正常」。
async function readAdJoinChecks(env, options = {}) {
	const rows = [];
	if (!env?.DB) return rows;
	if (!(await ensureAdJoinChecksTable(env))) return rows;
	const limit = Math.max(1, Math.min(Number(options.limit) || 5, 20));
	const id = String(options.chatId || '');
	try {
		const stmt = id
			? env.DB.prepare('SELECT id, chat_id, user_id, score, threshold, verdict, layer, reasons, created_at FROM ad_join_checks WHERE chat_id = ? ORDER BY id DESC LIMIT ?').bind(id, limit)
			: env.DB.prepare('SELECT id, chat_id, user_id, score, threshold, verdict, layer, reasons, created_at FROM ad_join_checks ORDER BY id DESC LIMIT ?').bind(limit);
		const { results } = await stmt.all();
		for (const r of (results || [])) rows.push(r);
	} catch (error) {
		console.error('[入群检查] 读取流水失败:', error);
	}
	return rows;
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

// 同款广告连带查杀：正文归一化 + 哈希。
// 归一化沿用 normalizeAdFingerprintValue（去零宽字符、压空白、转小写、截 200），
// 与指纹匹配【同一口径】—— 两边各写一套迟早分叉。
//
// 【2026-09-11 长度门槛彻底取消，判据换人】这道门槛调过三轮，每轮都被新样本打穿：
//   12 字 → 放过「来跑分 一天1万」「来洗钱 挣8千」（都 8 字）
//    4 字 → 放过「5迁」（2 字）
// 继续调数字只是换个地方打补丁 —— 广告文案可以短到任意长度，没有任何数字挡得住。
//
// 判据错配才是根因：12 字是从「整段正文指纹」照搬的，而那道门槛防的是
// 【自动学习】误伤（权重 1 单条即定罪、没人审过），连带的前提却是
// 【第一主人亲自引用回复 /spam】—— 已经过最强的人工判定，不需要代码再怀疑一次。
//
// 现在判据只有一条：第一主人 /spam 过就算。长度、内容特征一概不看。
// 误封风险由两层兜住，都比长度门槛可靠：
//   ① 仅 OWNER_IDS[0] 可触发（isPrimaryOwner 闸，副主人 / 群管理员一律不连带）；
//   ② 处置结果私聊第一主人，附一条可直接复制的 /unban 全部TGID 一键回滚。
const MODERATION_TEXT_MIN_LENGTH = 1;

function buildModerationTextKey(message) {
	// 【2026-10-12 接第六类正文来源】checklist 是与 text/caption 互斥的字段，
	// 清单消息的 text 恒为 undefined —— 这里漏读的后果是【整条同款链路对清单失效】：
	// /spam 引用清单时 key 为 null（写不进名单），清单消息再来时 spamHit 恒 false
	//（同款直封不触发）。主人都 /spam 过了，同款照发不误。
	// 【改这一处就够】recordSpamText（/spam 学）与 cacheModerationMessage（同款直封）
	// 都调这个函数；extractAdChecklistText 对非清单消息返回空串，其余消息逐字节不变。
	const raw = String(message?.text ?? message?.caption ?? extractAdChecklistText(message)).trim();
	if (!raw) return null;
	// 斜杠命令永不参与连带：命令文本是操作指令而非广告内容，
	// 与 extractAdFingerprintCandidates 里那道过滤同源（管理员 /ban 自噬事故）。
	if (isTelegramSlashCommand(raw)) return null;
	const norm = normalizeAdFingerprintValue(raw);
	if (norm.length < MODERATION_TEXT_MIN_LENGTH) return null;
	// FNV-1a 32 位：Workers 环境同步可用、无需 crypto.subtle 的 await，
	// 碰撞概率对本用途足够低，且拿到候选后还会用 text_norm 做二次比对兜底。
	let hash = 0x811c9dc5;
	for (let i = 0; i < norm.length; i += 1) {
		hash ^= norm.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return { hash: hash.toString(16).padStart(8, '0'), norm };
}

// ===== 同款直封名单（2026-09-26 方案 A）=====
// 只存「第一主人回复广告 /spam 过的文案」：广告号之后直发同款 → 删除 + 加黑 + 全群封禁。
// 【为什么单独一张表】热路径 D1 预算守卫规定普通群消息核心 SQL ≤ 3 条。这张表不单独查询，
// 而是嵌进 cacheModerationMessage 那条 INSERT 的 RETURNING 子查询里 —— 写消息缓存和查名单
// 合成一条 SQL，普通发言不多付任何一次 D1 往返。
// 【懒建表】首次写入或首次读取时自动 CREATE TABLE IF NOT EXISTS，不动 D1_SCHEMA_VERSION
// （动版本号会让既有两个测试变红，也会触发整套核心迁移，本功能用不着）。
// 保留一周：写入时顺手清掉超过一周的旧行，表永远很小。
const AD_SPAM_TEXTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const D1_AD_SPAM_TEXTS_INIT = new WeakMap();

async function ensureAdSpamTextsTable(env) {
	if (!env?.DB) return false;
	const cached = D1_AD_SPAM_TEXTS_INIT.get(env.DB);
	if (cached) return cached;
	const init = (async () => {
		try {
			await runD1SchemaStatement(env, 'ad_spam_texts',
				'CREATE TABLE IF NOT EXISTS ad_spam_texts (text_hash TEXT PRIMARY KEY, text_norm TEXT NOT NULL, at INTEGER NOT NULL)');
			return true;
		} catch (error) {
			console.error('[同款直封] 建表失败:', error?.message || error);
			return false;
		}
	})();
	D1_AD_SPAM_TEXTS_INIT.set(env.DB, init);
	const ok = await init;
	if (!ok) D1_AD_SPAM_TEXTS_INIT.delete(env.DB);   // 失败不缓存，下次再试
	return ok;
}

// 第一主人回复广告 /spam 时调用：把被举报消息的正文写进同款直封名单。
// 与 moderation_messages 用同一个 buildModerationTextKey 取哈希与归一化正文，保证两边比对口径一致。
async function recordSpamText(env, repliedMsg) {
	const key = buildModerationTextKey(repliedMsg);
	// 与已处置名单同一道短文案门槛：不到 6 个字不记，防止「你好」「在吗」误伤。
	if (!key || String(key.norm).length < 6) return;
	if (!(await ensureAdSpamTextsTable(env))) return;
	const now = Date.now();
	try {
		await env.DB.prepare(
			'INSERT INTO ad_spam_texts (text_hash, text_norm, at) VALUES (?, ?, ?) '
			+ 'ON CONFLICT(text_hash) DO UPDATE SET text_norm = excluded.text_norm, at = excluded.at'
		).bind(key.hash, key.norm, now).run();
		// 顺手清过期行：只在写入（即第一主人 /spam）时做，不占普通发言的热路径。
		await env.DB.prepare('DELETE FROM ad_spam_texts WHERE at < ?').bind(now - AD_SPAM_TEXTS_TTL_MS).run();
	} catch (error) {
		console.error('[同款直封] 写入名单失败:', error?.message || error);
	}
}

// 返回 { spamHit, norm }：spamHit = 这条消息的正文命中了同款直封名单（第一主人一周内 /spam 过）。
// 名单查询嵌在 INSERT 的 RETURNING 子查询里，与消息缓存写入是【同一条 SQL】，不多付 D1 往返。
// options.isAd：这条消息已被判定为广告（封禁 / 演练命中 / 转入观察）。
// 广告同样写缓存 —— /spam 的「当前群清扫」与「跨群连带」都只认 moderation_messages 这一张表，
// 不写就一条都追不到，这正是 2026-10-06 报的「/spam 有的同款没删除」的根因。
// 但它与 /search 的检索源是两件事：第 2 批定的「广告不进搜索库」改用 is_ad 标记继承，
// 不再靠「不写表」实现（那张表同时还承担同款反查，两个职责必须分开）。
async function cacheModerationMessage(env, message, options = {}) {
	const isAd = options?.isAd === true;
	const none = { spamHit: false, norm: '' };
	// 双保险：即使调用点漏判，这里也拒绝服务消息进入清扫缓存。
	if (isTelegramServiceMessage(message)) return none;
	if (!env.DB || !message?.message_id || !message?.from?.id) return none;
	try {
		await ensureD1Table(env);
		const textKey = buildModerationTextKey(message);
		const nowIso = new Date().toISOString();
		// 只有够长的正文才可能命中名单（写入端同一道 6 字门槛）；建表一次后按 DB 实例缓存，不逐条重复。
		// 广告消息不查同款直封名单：调用方已经走过完整判定链（封禁 / 演练），再查一次只会重复处置。
		const canMatchSpam = !isAd
			&& Boolean(textKey && String(textKey.norm).length >= 6)
			&& await ensureAdSpamTextsTable(env);
		// 带新列写入；若库里还没有 text_hash / text_norm（迁移未跑或跑失败），
		// 降级成旧的四列 INSERT。
		// 【为什么要这道容错】moderation_messages 承载的是 /spam 历史消息清扫这项【既有基础能力】，
		// 不该因为「同款连带」这个新功能的 schema 变更而整体停写 ——
		// 线上就出现过：版本号没提 → 迁移短路不执行 → 两列不存在 → 每条群消息 INSERT 全失败。
		// 版本号提升治的是「迁移没跑」，这道降级治的是「迁移跑了但失败」（D1 抖动等），两者互补。
		let insertResult;
		let spamHit = false;
		try {
			const baseSql = 'INSERT INTO moderation_messages (mid, chat_id, from_id, created_at, text_hash, text_norm, is_ad) VALUES (?, ?, ?, ?, ?, ?, ?)';
			const baseArgs = [
				message.message_id,
				String(message.chat.id),
				String(message.from.id),
				nowIso,
				textKey?.hash ?? null,
				textKey?.norm ?? null,
				isAd ? 1 : 0
			];
			if (canMatchSpam) {
				// 同一条 SQL：写缓存 + 查名单。RETURNING 带回自增 id（供裁剪判断）与命中标记。
				// text_norm 二次比对兜住 FNV-1a 32 位哈希碰撞 —— 命中就封号，代价不对称，不能只信哈希。
				const rows = await env.DB.prepare(baseSql
					+ ' RETURNING id, (SELECT 1 FROM ad_spam_texts WHERE text_hash = ? AND text_norm = ? AND at >= ?) AS spam_hit')
					.bind(...baseArgs, textKey.hash, textKey.norm, Date.now() - AD_SPAM_TEXTS_TTL_MS)
					.all();
				const row = rows?.results?.[0] || null;
				spamHit = Number(row?.spam_hit) === 1;
				insertResult = { meta: { last_row_id: Number(row?.id) || rows?.meta?.last_row_id } };
			} else {
				insertResult = await env.DB.prepare(baseSql).bind(...baseArgs).run();
			}
		} catch (error) {
			const reason = String(error?.message || error).toLowerCase();
			// 只对「列不存在」降级；其它错误（约束冲突、D1 不可用）照原样抛给外层日志，
			// 否则真故障会被这道容错掩盖成「静默成功」。
			if (!reason.includes('no such column') && !reason.includes('has no column')) throw error;
			// 降级只服务正常消息。广告一旦走了这条 4 列路径，行里就没有 is_ad，
			// 会反过来落进 /search 的检索源 —— 方向不安全，宁可不写（= 改动前的行为）。
			if (isAd) return none;
			console.error('[清扫缓存] text_hash/text_norm 列缺失，降级为基础写入（同款连带暂不可用，检查 D1 迁移）');
			insertResult = await env.DB.prepare('INSERT INTO moderation_messages (mid, chat_id, from_id, created_at) VALUES (?, ?, ?, ?)')
				.bind(
					message.message_id,
					String(message.chat.id),
					String(message.from.id),
					nowIso
				)
				.run();
		}
		const limit = Math.max(MSG_CACHE_SIZE, 200);
		if (shouldPruneD1Cache(insertResult)) {
			await pruneAutoincrementCacheTable(env, 'moderation_messages', limit);
		}
		return { spamHit, norm: textKey?.norm || '' };
	} catch (error) {
		console.error('[清扫缓存] 写 D1 失败:', error);
		return none;
	}
}

// ===== 同款广告连带查杀（2026-09-11 主人选定方案一）=====
// 场景：多个广告号刷同一段文案，主人只 /spam 掉其中一个，其余同款号应一并处置。
// 此前只能逐个引用回复 /spam —— 现有的「整段正文指纹」只对 /spam 之后【新发】的消息
// 生效，对已经躺在群里的同款一条都追不到，因为 moderation_messages 原本不存正文。
//
// 【子请求预算】这是本功能的硬约束。estimateBulkTaskSubrequests 口径下
// telegramMutationAttempts = 2 × 号数 × 群数，15 个群时【每个号吃 30 个子请求】：
//   3 个号  ≈ 106  → 贴着同步安全预算 100，可当场执行
//   10 个号 ≈ 366  → 远超同步预算，必须走 D1 批量任务 + Queues 分片
//   30 个号 ≈ 1047 → 撞 Cloudflare 单请求 1000 子请求硬限，会直接失败
// 所以硬上限取 20（≈707，留 30% 余量），超出部分只列 TGID 交给主人手动处理。
const LINKED_SPAM_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 追溯窗口：24 小时
const LINKED_SPAM_MAX_TARGETS = 20;                  // 单次连带硬上限（子请求预算所限）

// 同步 or 转批量：【按子请求预算动态判断，不写死号数】。
// 离线实测（15 群）：3 个号 = 119 已超同步安全预算 100，10 个号 = 336，20 个号 = 646。
// 早先写死 LINKED_SPAM_SYNC_MAX = 3 是错的 —— 那条同步分支在 15 群下永远不安全，
// 而群数还会随 /addgroup 增长，任何写死的号数都会在某个群数下失效。
// 复用 shouldUseBulkQueue 的同一套口径，与 /ban /spam 手动批量的判定标准完全一致。
function shouldRunLinkedSpamSync(targetCount) {
	const budget = shouldUseBulkQueue(targetCount, GROUP_IDS.length, { probeMembership: false });
	return !budget.useQueue;
}

// 按正文哈希跨【全部配置群】反查 24 小时内发过同款文案的其他账号。
// 返回去重后的 { userId, chatIds, messageIds } 列表，不含被 /spam 的当事人。
async function findLinkedSpamTargets(env, textKey, excludeUserId) {
	if (!env?.DB || !textKey?.hash) return { targets: [], truncated: 0 };
	const sinceIso = new Date(Date.now() - LINKED_SPAM_LOOKBACK_MS).toISOString();
	try {
		await ensureD1Table(env);
		// 一次查询覆盖所有群：text_hash + created_at 复合索引走等值 + 范围，不是全表扫。
		// 不按 chat_id 过滤 —— 同一批广告号通常多群同步刷，跨群才全面（主人口径）。
		const { results } = await env.DB.prepare(
			'SELECT mid, chat_id, from_id, text_norm FROM moderation_messages '
			+ 'WHERE text_hash = ? AND created_at >= ? ORDER BY id DESC LIMIT 400'
		).bind(String(textKey.hash), sinceIso).all();

		const byUser = new Map();
		for (const row of results || []) {
			const uid = String(row.from_id || '');
			if (!uid || uid === String(excludeUserId)) continue;
			// 二次比对兜住哈希碰撞：FNV-1a 是 32 位，碰撞概率虽低但连带是批量不可逆操作，
			// 代价不对称 —— 有 text_norm 就没有理由只信哈希。
			if (String(row.text_norm || '') !== textKey.norm) continue;
			if (!byUser.has(uid)) byUser.set(uid, { userId: uid, chatIds: new Set(), messageIds: [] });
			const entry = byUser.get(uid);
			entry.chatIds.add(String(row.chat_id || ''));
			const mid = Number(row.mid);
			if (Number.isInteger(mid) && mid > 0) entry.messageIds.push({ chatId: String(row.chat_id || ''), mid });
		}
		const all = [...byUser.values()];
		return {
			targets: all.slice(0, LINKED_SPAM_MAX_TARGETS),
			truncated: Math.max(0, all.length - LINKED_SPAM_MAX_TARGETS),
			overflowIds: all.slice(LINKED_SPAM_MAX_TARGETS).map((t) => t.userId)
		};
	} catch (error) {
		console.error('[同款连带] 反查失败:', error);
		return { targets: [], truncated: 0 };
	}
}

// 执行连带处置：删同款消息 + 加黑 + 全群封禁。仅用于 ≤ LINKED_SPAM_SYNC_MAX 的同步路径。
async function enforceLinkedSpamTargets(env, targets, options = {}) {
	const done = [];
	for (const target of targets) {
		let deleted = 0;
		for (const item of target.messageIds) {
			const r = await deleteMessage(item.chatId, item.mid);
			// 与批量路径同口径：消息已被封禁 revoke 撤回（not found）也算等效删除，不漏计。
			if (r?.ok || isEffectivelyDeletedError(r?.error)) deleted += 1;
		}
		const added = await addToBlacklist(target.userId, env, {
			reason: 'spam',
			by: String(options.operatorId ?? 'system'),
			note: options.note || '同款广告连带查杀'
		});
		const banResults = await banUserFromAllGroups(target.userId, { probeMembership: false });
		// 风控·处置：同款连带查杀按实际封成功的群逐群 +1。
		await recordDisposalsFromBanResults(env, banResults);
		const okCount = banResults.filter((r) => r?.ok).length;
		done.push({
			userId: target.userId,
			deleted,
			blacklistCode: String(added?.code || (added?.success ? 'ADDED' : 'ERROR')),
			banSummary: okCount + '/' + banResults.length
		});
	}
	return done;
}

// ===== /recent + /learnlast：从消息缓存里捞回【已被删掉】的广告来学习（2026-09-12）=====
//
// 【解决什么】广告被别的 bot（GKY / 巡察管理）或管理员抢先删掉后，就没法引用回复 /spam 了，
// 那条广告的特征永久漏学。Telegram Bot API 【不推送删除事件、也读不回已删消息】——
// 唯一可行的路子是「消息到达时就存下正文」，之后无论被谁删，D1 里那份还在。
// 本项目的 cacheModerationMessage 已经在存 text_norm（取消长度门槛后覆盖全部消息），
// 语料早就躺在库里，缺的只是把它捞出来给主人挑的入口。这两条命令补上这一环。
//
// 【为什么分两步】/recent 拉列表 + 冻结快照，/learnlast 按序号学。
// 序号必须来自冻结快照而不是实时查询：moderation_messages 被每条群消息持续写入并按容量剪枝，
// 若 /learnlast 重查一次实时数据，期间进来的新消息会把列表整体挤动，
// 主人看到的「3 号」和实际学到的就不是同一条了。旧代码专门治过这个坑。
// 上限 200：旧代码写死 50，但那是「只缓存疑似广告」时代的数字 ——
// 本项目缓存全部消息、只排序不预筛，50 条很容易被闲聊占满而挤掉靠后的真广告。
// 200 条的依据：回执走 sendTelegramMessageChunks 自动分片，不受单条 4096 字符限制；
// 每条候选约两行、120 字符上下，200 条约 24 KB → 分 6~7 条消息，可接受。
// 再往上就不是技术限制而是可读性问题了：人工逐条核对 200 条已是上限。
const RECENT_LEARN_MAX_ITEMS = 200;
const RECENT_LEARN_LOOKBACK_MS = 48 * 60 * 60 * 1000;

// 给候选打分排序：命中过特征的排前面，纯闲聊沉底。
// 【刻意不做预筛】旧代码用 looksLikeAdCandidate 只缓存疑似广告，代价是新形态广告
// 压根不进缓存、事后也捞不回来。这里全部保留、只排序 —— 既不漏新形态，
// 主人又不必翻 50 条才看到第一条广告。
async function scoreRecentLearnCandidate(env, item, fingerprints, whitelistSet) {
	const text = String(item.text || '');
	if (!text) return { weight: 0, hints: [] };
	const hints = [];
	let weight = 0;
	try {
		const scored = scoreAdMessageText(text, { whitelist: whitelistSet });
		if (Number(scored?.score) > 0) {
			weight += Number(scored.score);
			hints.push('结构分 ' + scored.score);
		}
	} catch (_) { /* 单条打分失败不影响列表 */ }
	if (hasAdCharSplitObfuscation(text)) {
		weight += 4;
		hints.push('逐字分隔混淆');
	}
	try {
		const hit = matchAdFingerprints(fingerprints, { text }, {});
		if (hit?.hits?.length) {
			weight += 5;
			hints.push('指纹命中 ' + hit.hits.length + ' 条');
		}
	} catch (_) { /* 指纹比对失败不影响列表 */ }
	return { weight, hints };
}

// 拉取最近缓存的群消息作为学习候选。群内发=只看当前群，私聊发=看全部配置群。
async function loadRecentLearnCandidates(env, sourceChatId, limit) {
	if (!env?.DB) return [];
	const sinceIso = new Date(Date.now() - RECENT_LEARN_LOOKBACK_MS).toISOString();
	const scopeCurrentGroup = isConfiguredGroup(sourceChatId);
	try {
		await ensureD1Table(env);
		// text_norm IS NOT NULL 过滤掉无正文的消息（图片、服务消息等）。
		// is_ad 排除被判过的广告：学习候选是给人挑着学的，广告正文早由 /spam 人工定过罪。
		// 多取一些再排序截断 —— 排序键是特征权重，不是时间，所以不能只取最新 N 条。
		// LIMIT 1500 是为了配合 RECENT_LEARN_MAX_ITEMS=200：取样池必须远大于输出上限，
		// 否则同款去重后不足 200 条，等于上限白提（原先取 300 只够支撑 50 条输出）。
		const sql = scopeCurrentGroup
			? 'SELECT mid, chat_id, from_id, text_norm, created_at FROM moderation_messages WHERE text_norm IS NOT NULL AND (is_ad IS NULL OR is_ad = 0) AND created_at >= ? AND chat_id = ? ORDER BY id DESC LIMIT 1500'
			: 'SELECT mid, chat_id, from_id, text_norm, created_at FROM moderation_messages WHERE text_norm IS NOT NULL AND (is_ad IS NULL OR is_ad = 0) AND created_at >= ? ORDER BY id DESC LIMIT 1500';
		const stmt = scopeCurrentGroup
			? env.DB.prepare(sql).bind(sinceIso, String(sourceChatId))
			: env.DB.prepare(sql).bind(sinceIso);
		const { results } = await stmt.all();
		const rows = results || [];
		if (!rows.length) return [];

		const fingerprints = await loadAdFingerprints(env);
		const whitelistSet = await loadAdDomainWhitelist(env);
		// 同文案去重：同一段广告被 N 个号刷过时只留一条，否则 50 个名额全被同款占满。
		// 留的是最早那条（ORDER BY id DESC 取到的最后一条），刷广告的号数另行计数展示。
		const byText = new Map();
		for (const row of rows) {
			const norm = String(row.text_norm || '');
			if (!norm) continue;
			if (!byText.has(norm)) {
				byText.set(norm, {
					text: norm,
					mid: Number(row.mid) || 0,
					chatId: String(row.chat_id || ''),
					fromId: String(row.from_id || ''),
					senders: new Set([String(row.from_id || '')]),
					createdAt: String(row.created_at || '')
				});
			} else {
				byText.get(norm).senders.add(String(row.from_id || ''));
			}
		}
		const items = [];
		for (const entry of byText.values()) {
			const scored = await scoreRecentLearnCandidate(env, entry, fingerprints, whitelistSet);
			items.push({
				text: entry.text,
				mid: entry.mid,
				chatId: entry.chatId,
				fromId: entry.fromId,
				senderCount: entry.senders.size,
				createdAt: entry.createdAt,
				weight: scored.weight,
				hints: scored.hints
			});
		}
		// ===== 过滤明确正常的发言（2026-09-12 主人选定方案一 + 四）=====
		// 【口径刻意是「排除明确正常的」，不是「筛出像广告的」】——这两者方向相反：
		// 按「像广告」筛，现有判据抓不到的【新形态】广告就永远进不了候选、事后也捞不回来，
		// 而 /recent 存在的意义恰恰是捞回漏掉的那些（旧代码 looksLikeAdCandidate 就栽在这儿，
		// 当初刻意没照搬）。所以只砍掉「三项判据一个都没命中」的零特征条目，
		// 有任何一丝特征就保留。
		//
		// 方案四：多号刷同一段文案【无条件放行】，即便文案本身零特征 ——
		// 那本身就是强广告信号，线上「5迁」这种两字文案正是靠这条兜住的。
		const filtered = items.filter((it) => it.weight > 0 || it.senderCount > 1);
		// 先按特征权重降序，同权重按「刷的号数」降序 —— 多号刷同一段文案本身就是广告信号。
		filtered.sort((a, b) => (b.weight - a.weight) || (b.senderCount - a.senderCount));
		return filtered.slice(0, Math.max(1, Math.min(RECENT_LEARN_MAX_ITEMS, Number(limit) || RECENT_LEARN_MAX_ITEMS)));
	} catch (error) {
		console.error('[学习候选] 读取失败:', error);
		return [];
	}
}

async function saveLearnSnapshot(env, ownerId, items, scope) {
	if (!env?.DB) return false;
	try {
		await ensureD1Table(env);
		await env.DB.prepare(
			'INSERT INTO ad_learn_snapshots (owner_id, items, scope, created_at) VALUES (?, ?, ?, ?) '
			+ 'ON CONFLICT(owner_id) DO UPDATE SET items = excluded.items, scope = excluded.scope, created_at = excluded.created_at'
		).bind(String(ownerId), JSON.stringify(items).slice(0, 90000), String(scope || ''), Math.floor(Date.now() / 1000)).run();
		return true;
	} catch (error) {
		console.error('[学习快照] 写入失败:', error);
		return false;
	}
}

async function loadLearnSnapshot(env, ownerId) {
	if (!env?.DB) return null;
	try {
		await ensureD1Table(env);
		const row = await env.DB.prepare('SELECT items, scope, created_at FROM ad_learn_snapshots WHERE owner_id = ?')
			.bind(String(ownerId)).first();
		if (!row?.items) return null;
		return { items: JSON.parse(row.items), scope: row.scope || '', createdAt: Number(row.created_at) || 0 };
	} catch (error) {
		console.error('[学习快照] 读取失败:', error);
		return null;
	}
}

// ===== 广告重发删除通道（2026-09-21 主人选定方案三）=====
// 【这条通道刻意只删消息，代码上不接任何封禁/加黑调用】——
// 主人定的规则：第一条广告号封禁（已由 detectAdOnMessage 正常工作），
// 「接下来的引用重发全都是误封行为，不能触发封禁」。
// 所以这里不是「先判断再决定封不封」，而是这条路径【根本没有封禁能力】，
// 从结构上排除误封，而不是靠调用点小心翼翼地不去调。
//
// 判据是确定性的：这段正文【已经被处置过】，不是「像不像广告」。
// 与上次 AI 硬命中误封（快照 #1615）的教训一致 —— 概率性判断不该独立定罪。
//
// 存储复用 ad_scan_state 键值表，不新建表：单键存一份「最近已处置文案指纹」环形列表，
// JSON 数组，只留最近 N 条，够覆盖 24 小时内的重发即可。
const AD_HANDLED_TEXTS_KEY = 'ad_handled_texts';
// 【2026-09-26】扩为一周 / 500 条：同款直封名单保留一周，重发只删通道同步保留一周，
// 避免「直封名单还在、只删名单已过期」两边口径不一致。24 小时 / 60 条会漏掉隔几天才冒头的重发。
const AD_HANDLED_TEXTS_MAX = 500;
const AD_HANDLED_TEXTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// 运行期缓存（按 DB 实例，惯例同 AD_FINGERPRINT_CACHE）。这张表只在封禁成功时才写，
// 平时是纯读热路径，缓存 15 秒不会漏掉真实重发（重发间隔是人工处置的分钟级）。
const AD_HANDLED_TEXTS_CACHE = new WeakMap();
const AD_HANDLED_TEXTS_CACHE_TTL_MS = 15 * 1000;

// 只读一次并解析成数组。写入端会主动刷新这份缓存，所以不存在「刚封完就漏删」的窗口。
async function loadHandledAdTexts(env) {
	return await loadAdCachedValue(AD_HANDLED_TEXTS_CACHE, env?.DB, AD_HANDLED_TEXTS_CACHE_TTL_MS, async () => {
		const raw = await readAdScanState(env, AD_HANDLED_TEXTS_KEY, '[]');
		try {
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch (_) {
			return [];
		}
	});
}

function primeHandledAdTexts(env, list) {
	if (!env?.DB) return;
	AD_HANDLED_TEXTS_CACHE.set(env.DB, {
		value: Array.isArray(list) ? list : [],
		expiresAt: Date.now() + AD_HANDLED_TEXTS_CACHE_TTL_MS,
		promise: null,
	});
}

// 记录一条「已被处置的广告文案」（重发只删通道用）。
// 调用方：enforceAdDetection 自动检测封禁后；第一主人回复广告 /spam 后（同时另写同款直封名单）。
async function recordHandledAdText(env, rawText) {
	const norm = normalizeAdFingerprintValue(rawText);
	// 过短的不记：那种文案撞正常发言概率高，而这条通道是【无条件删消息】，宁缺毋滥。
	if (norm.length < 6) return;
	try {
		const now = Date.now();
		const list = await loadHandledAdTexts(env);
		// 去重 + 淘汰过期，再按上限截断（最新在前）。
		const kept = (Array.isArray(list) ? list : [])
			.filter((x) => x && typeof x.t === 'string' && Number(x.at) > 0)
			.filter((x) => now - Number(x.at) < AD_HANDLED_TEXTS_TTL_MS)
			.filter((x) => x.t !== norm);
		kept.unshift({ t: norm, at: now });
		const next = kept.slice(0, AD_HANDLED_TEXTS_MAX);
		await writeAdScanState(env, AD_HANDLED_TEXTS_KEY, JSON.stringify(next));
		// 写完立刻把缓存顶成新值：重发往往在封禁后几秒内到达，
		// 若等 TTL 自然过期就会漏删第一条重发。
		primeHandledAdTexts(env, next);
	} catch (error) {
		// 记录失败只影响「后续重发能否被删」，不影响本次封禁 —— 那边已经完成。
		console.error('[重发删除] 记录已处置文案失败:', error);
	}
}

// 这条消息是否在重发已处置的广告。比对自身正文与引用体正文两处：
// 重发形态正是「引用主人的命令消息 + 自己贴广告正文」，所以两边都要看。
async function matchHandledAdText(env, message) {
	if (!env?.DB) return false;
	// 同上：清单消息的 text 是 undefined，不接 checklist 就永远匹配不上已处置名单。
	const candidates = [
		String(message?.text ?? message?.caption ?? extractAdChecklistText(message)),
		String(message?.reply_to_message?.text ?? message?.reply_to_message?.caption
			?? extractAdChecklistText(message?.reply_to_message))
	].map((t) => normalizeAdFingerprintValue(t)).filter((t) => t.length >= 6);
	if (!candidates.length) return false;
	try {
		const list = await loadHandledAdTexts(env);
		if (!Array.isArray(list) || !list.length) return false;
		const now = Date.now();
		const fresh = list.filter((x) => x && typeof x.t === 'string' && now - Number(x.at) < AD_HANDLED_TEXTS_TTL_MS);
		return fresh.some((x) => candidates.includes(x.t));
	} catch (error) {
		console.error('[重发删除] 比对已处置文案失败:', error);
		return false;
	}
}

// 同款直封：广告号直发第一主人 /spam 过的同款文案 → 加黑 + 全群封禁（杀手模式群只禁言），
// 私聊第一主人并附一键回滚。消息删除已由调用方完成。
async function enforceHandledRepeatBan(env, message, hit) {
	const userId = String(message?.from?.id || '');
	if (!userId) return;
	let blacklistCode = 'ERROR';
	try {
		const added = await addToBlacklist(userId, env, {
			reason: 'spam',
			by: 'system',
			note: '同款广告直封（第一主人 /spam 过的文案）'
		});
		blacklistCode = String(added?.code || (added?.success ? 'ADDED' : 'ERROR'));
	} catch (error) {
		console.error('[同款直封] 加入黑名单失败:', error);
	}
	let banResults = [];
	try {
		banResults = await banUserFromAllGroups(userId, { probeMembership: false, revokeMessages: true });
	} catch (error) {
		console.error('[同款直封] 全群封禁失败:', error);
	}
	// 风控·处置：同款直封按实际封成功的群逐群 +1。
	// 必须放在下面 `if (!ownerId) return` 之前 —— 没配通知目标时那行会提前返回，
	// 记在后面就会漏掉「封了人但没发通知」的处置。
	await recordDisposalsFromBanResults(env, banResults);
	const ownerId = getOwnerNotifyTargets()[0] || '';
	if (!ownerId) return;
	const okCount = banResults.filter((r) => r?.ok).length;
	const failed = banResults.filter((r) => !r?.ok);
	const lines = [
		'<b>🎯 同款广告直封</b>',
		'',
		'<b>账号：</b>' + formatUserReference(userId, message.from),
		'<b>来源群：</b>' + escapeHtml(message.chat?.title || '未知')
			+ '（<code>' + escapeHtml(String(message.chat?.id ?? '')) + '</code>）',
		'<b>同款文案：</b>' + escapeHtml(String(hit?.norm || '').slice(0, 120)),
		'<b>依据：</b>该文案一周内被第一主人 /spam 处置过',
		'',
		'<b>黑名单：</b>' + (blacklistCode === 'ADDED' ? '已加入' : blacklistCode === 'EXISTS' ? '此前已在' : blacklistCode),
		'<b>封禁结果：</b>' + okCount + '/' + banResults.length + ' 个群成功',
	];
	failed.slice(0, 3).forEach((r, idx) => {
		lines.push((idx === 0 ? '<b>失败群：</b>' : '　　　　') + '<code>' + escapeHtml(String(r.groupId)) + '</code>（'
			+ escapeHtml(toChineseErrorText(r.error || '未知')) + '）');
	});
	if (failed.length > 3) lines.push('　　　　等共 ' + failed.length + ' 个群失败');
	lines.push('<b>消息：</b>已删除');
	lines.push('');
	lines.push('<b>判错一键回滚</b>（解黑 + 全群解封）：');
	lines.push('<code>/unban ' + escapeHtml(userId) + '</code>');
	try {
		await sendTelegramMessageChunks(ownerId, lines.join('\n'));
	} catch (error) {
		console.error('[同款直封] 推送通知失败:', error);
	}
}

// 连带结果私聊第一主人。核心是【一键回滚】：把连带到的全部 TGID 拼成一条可直接复制的
// /unban 命令 —— 连带把单次误判乘以 N 倍，回滚入口必须现成，不能让主人回头一个个抄 ID。
async function notifyLinkedSpamResult(env, info) {
	const ownerId = getOwnerNotifyTargets()[0] || '';
	if (!ownerId) return;
	const done = info.done || [];
	const pendingIds = info.pendingIds || [];
	const allIds = done.length ? done.map((d) => d.userId) : pendingIds;
	const lines = [
		'<b>🔗 同款广告连带查杀</b>',
		'',
		'<b>操作人：</b>' + formatUserReference(info.operatorId, info.message?.from),
		'<b>触发群：</b>' + escapeHtml(info.message?.chat?.title || '未知')
			+ '（<code>' + escapeHtml(String(info.message?.chat?.id ?? '')) + '</code>）',
		'<b>源账号：</b><code>' + escapeHtml(String(info.sourceUserId)) + '</code>（本次 /spam 的目标）',
		// 展示原文而非哈希：主人要能一眼判断这条文案到底是不是广告。
		// 这正是 text_norm 存原文的核心价值 —— 纯哈希方案这里只能显示一串十六进制。
		'<b>同款文案：</b>' + escapeHtml(String(info.textNorm || '').slice(0, 120)),
		'<b>追溯范围：</b>24 小时内 · 全部配置群',
		''
	];
	if (done.length) {
		lines.push('<b>已处置 ' + done.length + ' 个账号</b>');
		for (const d of done) {
			lines.push('· <code>' + escapeHtml(d.userId) + '</code>　黑名单:'
				+ (d.blacklistCode === 'ADDED' ? '已加入' : d.blacklistCode === 'EXISTS' ? '此前已在' : d.blacklistCode)
				+ '　封禁:' + d.banSummary + '　删消息:' + d.deleted + ' 条');
		}
	}
	if (info.jobId) {
		lines.push('<b>已转批量任务</b>（超出同步子请求预算，由 Queues 分片续接）');
		lines.push('任务号:<code>' + escapeHtml(String(info.jobId)) + '</code>　目标 ' + pendingIds.length + ' 个');
		lines.push('进度查询:<code>/job ' + escapeHtml(String(info.jobId)) + '</code>');
	}
	if (info.truncated > 0) {
		lines.push('');
		lines.push('⚠️ 另有 <b>' + info.truncated + '</b> 个同款账号超出单次上限 '
			+ LINKED_SPAM_MAX_TARGETS + '（子请求预算所限），未处理：');
		lines.push('<code>' + escapeHtml((info.overflowIds || []).join(',')) + '</code>');
		lines.push('可复制上面这串手动执行 <code>/spam</code> 或 <code>/ban</code>。');
	}
	if (allIds.length) {
		lines.push('');
		lines.push('<b>判错一键回滚</b>（解黑 + 全群解封）：');
		lines.push('<code>/unban ' + escapeHtml(allIds.join(',')) + '</code>');
	}
	try {
		await sendTelegramMessageChunks(ownerId, lines.join('\n'));
	} catch (error) {
		console.error('[同款连带] 通知第一主人失败:', error);
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

// ===== 名片广告专用定罪通道（2026-10-11）=====
//
// 【补的是哪个洞】两条线上名片广告离线实测（群 -1001883549197）：
//   Rachel「新澳 🔥 六合彩内幕发布群」→ 六合彩 / 内幕 / 发布群四张词表【零命中】，净 0 分；
//   Amani「🔥 代开增值税发票 另高价收发票粉 🔥」→ 发票 / 增值税 / 代开 / 票粉零命中，
//   只有「高价收」命中交易动词 → 掉进「单类词不计分」，净 3 分（首尾对称 emoji）。
// 两条都被别的机器人删掉了，本项目一条都没反应。链路本身是通的 —— 显示名早在
// getAdDetectionBodyText 与闸一的 text || contactName 里接好了，缺的是【定罪形态】：
// 名片走的是普通正文那套「两类同现才 +6」，而名片根本没有正文，永远凑不齐第二类。
//
// 【为什么名片可以比正文严一档】正文里的词表命中可能只是聊天内容（「帮我开张发票」），
// 而名片是【本人主动分发的联系方式】：把这句话写在自己名片上、配着手机号发给所有人。
// 同一个词在正文里是谈资，在名片上是招揽 —— 这是结构差异，不是词表差异，
// 所以这里【不要求两类同现】，命中任一类即成立。
//
// 【三重门槛，缺一不封】
//   A 必须是 message.contact 且带手机号 —— 证明这是张名片，不是普通文本
//   B 显示名【不像人名】（looksLikePersonName 反向白名单）—— 张三 / 妈妈 / 便利店店主
//      这类正常名片在第一步就被摘出去，是这块的主力挡板
//   C 显示名命中业务词或交易动词 —— 「财务小李」发的名片不含招揽词，不命中
//
// 【手机号不参与计分】主人 2026-10-11 原话：「定罪不看手机号为特征，因为正常用户
// 如果也会发手机号名片就会被误杀，那么定位是只看手机号+广告，所以广告指纹特征是
// 关键定位，而不是手机号是定位。」号码在这里只证明「这是张名片」，
// 真正的复用键在下面的指纹学习里：这个号有案底，再出现才杀。
function applyContactCardVerdict(evaluation, message) {
	const contact = message?.contact;
	if (!contact) return evaluation;
	// 手机号必须存在：没有号码的 contact（罕见但可能）不走这条通道，
	// 以免把「只发了个名字」的普通消息误当成名片处理。
	if (!String(contact.phone_number || '').trim()) return evaluation;
	const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim();
	if (!displayName || looksLikePersonName(displayName)) return evaluation;
	const hits = [
		...countAdKeywordHits(displayName, AD_TRADE_VERBS),
		...countAdKeywordHits(displayName, AD_BUSINESS_KEYWORDS)
	];
	if (!hits.length) return evaluation;
	// 已被前面某层定罪的不再改写结论 —— 保留第一个定罪者的 layer 与理由，
	// 否则 /pending 复核时会看到「明明是指纹封的，却显示成名片封的」。
	if (String(evaluation?.verdict) === 'ban') return evaluation;
	return Object.assign({}, evaluation, {
		verdict: 'ban',
		layer: 'contact',
		reasons: (evaluation?.reasons || []).concat([
			'名片广告定罪：显示名「' + displayName.slice(0, 40) + '」不像人名且命中 '
				+ hits.slice(0, 3).join('/')
				+ '（名片是本人主动分发的联系方式，同词在正文里是谈资、在名片上是招揽）'
		])
	});
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

// 提取【核对清单（checklist）】里的全部文字 —— 标题 + 每个任务项的正文。
//
// 【补的是哪个洞】checklist 是 Message 的一个独立字段（官方原文：「Message is a
// checklist」），与 text / caption 互斥。所以 checklist 消息的 message.text 是
// undefined，它在下面几处【一个字都读不到】：
//   · detectAdOnMessage 的早退闸门 —— text / caption / 转发 / 引用体 / 名片 /
//     媒体六样全空，整条消息在这里就 return，名册、评分、四条通道一条都跑不到
//   · getAdDetectionBodyText —— 只读 text / caption / 名片 / 内联按钮
//
// 线上样本（2026-10-07 主人发来）：广告把话术拆成标题 + 6 个任务项，
// 标题是「一手假钞假币包过验钞机可找妹嫖娼」，任务项里放招揽与两条 t.me 链接，
// 进度显示「0 / 6 已完成」。这与批次 A 的裸图片消息【同一个缺口模式】：
// 内容藏在检测链路根本没读的第六个字段里，整条消息进不了检测。
//
// 【零成本】纯函数，不发任何请求。文字一旦并进正文，现有的词表 / 指纹 /
// AI 语义 / 四通道结构查杀【全部自动覆盖】—— 不为它新建任何判据：
// 正常的「本周任务清单」也照进正文，而词表本来就不命中正常内容，
// 所以这一层不引入新的误封面。
function extractAdChecklistText(message) {
	const checklist = message?.checklist;
	if (!checklist) return '';
	const parts = [String(checklist.title || '')];
	const tasks = Array.isArray(checklist.tasks) ? checklist.tasks : [];
	for (const task of tasks) {
		const taskText = String(task?.text || '').trim();
		if (taskText) parts.push(taskText);
	}
	// 用换行分隔而不是空格：保持与客户端呈现一致的行结构，
	// 让「逐字分隔」等按行形态工作的判据读到的仍是原本的样子。
	return parts.filter(Boolean).join('\n').trim();
}

function getAdDetectionBodyText(message) {
	return [
		message?.text,
		message?.caption,
		getContactText(message || {}),
		getInlineButtonPayloadText(message || {}),
		// checklist：与 text / caption 同级的第六类正文来源，漏了它 debug 与
		// 依赖 bodyText 的那几处就会把 checklist 消息当空消息。
		extractAdChecklistText(message)
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

// ===== 通知里的「发起来源」一行 =====
//
// notifyOwnerBlacklistIntercept 与 notifyOwnerChatMemberAction 早就带着 📍 群：这一行，
// 而【由用户主动发起】的两个 —— 自助解封、黑名单申诉 —— 漏了：主人拿到通知分不清
// 「他自己私聊跑来解的」还是「群里管理员替他解的」
// （2026-10-06 提出，方案 B：两个函数一起补齐，复用既有范式）。
//
// 私聊必须单独处理：getChatInfoFromId 对私聊返回的是 first_name，照搬群的写法
// 会渲染成「群：张三 1630699369」，读起来像个群 —— 比不写这一行还误导。
async function formatOriginLabel(chatOrId) {
	const chat = (chatOrId && typeof chatOrId === 'object') ? chatOrId : null;
	const chatId = String(chat?.id ?? chatOrId ?? '');
	if (!chatId) return '<code>未知</code>';
	// 两种输入都认：对象（message.chat / chatMember.chat）与裸 id（blockSelfUnban
	// 那条路径只拿到 chatId 字符串）。裸 id 的类型信息藏在正负号里 ——
	// Telegram 的群与频道恒为负数，私聊（含与 bot 的对话）恒为正数。
	const type = String(chat?.type || '');
	const numeric = Number(chatId);
	if (type === 'private' || (!type && Number.isFinite(numeric) && numeric > 0)) return '私聊';

	let label = `<code>${escapeHtml(chatId)}</code>`;
	const directTitle = String(chat?.title || '');
	if (directTitle) return `<b>${escapeHtml(directTitle)}</b> ${label}`;
	try {
		const info = await getChatInfoFromId(chatId);
		if (info?.title) label = `<b>${escapeHtml(info.title)}</b> ${label}`;
	} catch (_) {
		// 拉不到群名就只显示 id，与 intercept / chatMemberAction 同款兜底。
	}
	return label;
}

// 【刻意没有「发起人」这一行】这两个场景里发起人与被处理对象在代码结构上恒为同一人：
// handleMessage 里 `const userId = message.from?.id`，而 notifyOwnerSelfUnban /
// notifyOwnerBlacklistAppeal 收到的 fromUser 也是 message.from —— 三者永远相等，
// 所以「👤 用户:」那一行本身就已经说明了是谁点的，再加一行只是噪音。
// （曾写过一个 formatOriginActor，实测在全部调用点下恒返回空串，已删：不给将来
//  留死代码。真出现「管理员代发」的路径时再补，那时要连 userId 的来源一起改。）

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
async function notifyOwnerBlacklistAppeal(fromUser, blacklistInfo, kind = 'appeal', origin = null) {
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

	const originLine = origin
		? `📍 发起:${await formatOriginLabel(origin)}`
		: null;

	const lines = [
		isStart ? '📬 <b>黑名单用户打开了机器人</b>' : '📢 <b>黑名单用户申诉</b>',
		`👤 用户:${target} <code>${escapeHtml(targetId)}</code>`,
		...(originLine ? [originLine] : []),
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
// origin = 发起这次解封的会话（message.chat 或裸 chatId）。不传则不显示来源行 ——
// 宁可少一行，也不显示一个编出来的「未知」。
async function notifyOwnerSelfUnban(fromUser, perGroupResults, origin = null) {
	if (!OWNER_IDS.length) return;
	const target = fromUser
		? formatUserMention(fromUser)
		: '<code>未知</code>';
	const targetId = String(fromUser?.id || '未知');

	const resultSummary = perGroupResults
		.map(r => r.replace(/<[^>]+>/g, ''))
		.join('\n');

	const originLine = origin
		? `📍 发起:${await formatOriginLabel(origin)}`
		: null;

	const lines = [
		`📬 <b>用户自助解封</b>`,
		`👤 用户:${target} <code>${escapeHtml(targetId)}</code>`,
		...(originLine ? [originLine] : []),
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

// 通用消息编辑：把私聊里那条通知原地改成结论态。
// 不传 reply_markup 时 Telegram 会移除按钮 —— 这正是我们要的：
// 结论落定后按钮留着只会被重复点。
async function editTelegramMessage(chatId, messageId, text, replyMarkup = null) {
	if (!chatId || !messageId) return { ok: false, error: '参数缺失' };
	try {
		const body = {
			chat_id: chatId,
			message_id: Number(messageId),
			text: sanitizeTelegramText(text),
			parse_mode: 'HTML',
			disable_web_page_preview: true
		};
		if (replyMarkup) body.reply_markup = replyMarkup;
		const response = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/editMessageText', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const result = await response.json();
		// 「message is not modified」= 文本本来就没变，不算失败。
		if (response.ok && result?.ok) return { ok: true, result };
		const description = String(result?.description || '');
		if (/not modified/i.test(description)) return { ok: true, result };
		return { ok: false, error: description || ('HTTP ' + response.status) };
	} catch (error) {
		console.error('[消息编辑] editMessageText 异常:', error);
		return { ok: false, error: error.message || String(error) };
	}
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
	if (await isAdminInAnyConfiguredGroup(targetId)) return { protected: true, reason: '不能举报群主或管理员' };
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
	// 风控·处置：群内 /ad 举报投票通过后的定罪封禁，按实际封成功的群逐群 +1。
	await recordDisposalsFromBanResults(env, banResults);
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
	if (data === NOTICE_CONFIRM_DATA || data === NOTICE_CANCEL_DATA) {
		await handleNoticeCallback(callbackQuery, env);
		return;
	}
	if (data.startsWith(STAT_GO_PREFIX)) {
		await handleStatsGoCallback(callbackQuery, env);
		return;
	}
	if (data.startsWith(SEARCH_PREFIX)) {
		await handleSearchPaginationCallback(callbackQuery, env);
		return;
	}

	if (data.startsWith(SETTINGS_MENU_PREFIX)) {
		await handleMenuCallback(callbackQuery, env);
		return;
	}

	if (data.startsWith(STAT_TREND_PREFIX)) {
		await handleStatsTrendCallback(callbackQuery, env);
		return;
	}

	if (data.startsWith(STAT_PAGINATION_PREFIX)) {
		await handleStatsPaginationCallback(callbackQuery, env);
		return;
	}
	if (data.startsWith(AD_WORDS_PAGINATION_PREFIX)) {
		await handleAdWordsPaginationCallback(callbackQuery, env);
		return;
	}
	if (data.startsWith(AD_JOB_PAGINATION_PREFIX)) {
		await handleBulkJobPaginationCallback(callbackQuery, env);
		return;
	}
	if (data.startsWith(ADFIX_BUTTON_PREFIX)) {
		await handleAdFixButtonCallback(callbackQuery, env);
		return;
	}
	if (data.startsWith(DRYRUN_BUTTON_PREFIX)) {
		await handleDryRunButtonCallback(callbackQuery, env);
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
			detail: '',
		};
	}
	const translated = translateTelegramError(rawError);
	return {
		effective: false,
		status: 'failed',
		summary: '删除失败:' + translated.中文,
		detail: '建议:' + translated.建议,
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
	// 杀手模式 OFF 的群【略过拦截】：人只是被禁言、没被踢出，无需再删踢（主人明确要求）。
	// 命令命中后 return，不进入后续命令分发
	if (
		isConfiguredGroup(chatId) &&
		!isGroupMuteMode(chatId) &&
		message.from &&
		!message.from.is_bot
	) {
		const blacklistCheck = await checkBlacklist(userId, env);
		if (blacklistCheck.isBlacklisted) {
			// 双保险：受保护角色豁免，避免误加黑导致他们被踢。
			// checkIfUserIsAdmin 已含主人/副主人/任意配置群管理员；再补超管。
			const isProtected = isSuperAdmin(userId) || await checkIfUserIsAdmin(userId);
			if (!isProtected) {
				console.log(`[黑名单拦截] 用户 ${userId} 在群 ${chatId} 发言，删消息+踢人`);
				await deleteMessage(chatId, message.message_id);
				await banUserFromGroup(chatId, userId);
				await notifyOwnerBlacklistIntercept(message.from, message.chat, '发言拦截', blacklistCheck, null);
				return;
			}
		}
	}

	// ===== 群统计·发言计数的调用点（方案 A：挪到广告检测之后）=====
	// 原来这段写在 detectAdOnMessage【之前】，于是被封的广告照旧计进「本群发言」，
	// 群越被刷、统计越好看 —— 数字反过来奖励了广告。
	// 现在条件判断收敛进 tryRecordSpeechStat，调用点后移到广告检测之后：
	//   · 被封的（adVerdict === true）与重发已处置广告（上面已 return）一律不计；
	//   · 命令消息走的是早于 detectAdOnMessage 的那几个 return，必须逐个补调，否则命令漏计。

	// 广告检测 v2 三个钩子。位置固定在黑名单兜底之后、所有命令分发之前：
	//   1) 命令层：11 条主人私聊命令，命中即 return，避免落进后面的通用命令分发。
	//   2) 回复学习：管理层回复某条消息说「广告」→ 立即判定 + 学习指纹。
	//   3) 消息层：每条群消息都拉完整资料（昵称 + 用户名 + 简介）走三层判定。
	//      早退只保留零成本的确定性排除：slash 命令、无正文且无转发、管理员。
	//      不再按正文分做预筛 —— 那个省法漏放了资料分 10 分的明显广告号，详见 detectAdOnMessage。
	// 三者都只在自己确实处理了这条消息时返回 true；否则一律返回 false 继续原流程。
	// /recent 单独挂在这里而不进 handleAdDetectionCommands：那个函数对群内命令一律
	// 撤回 + 引导私聊，而 /recent 的主用法恰恰是【在群里】发 —— 看到广告被别的 bot 删掉，
	// 顺手拉一份候选列表。命令消息仍会被撤回、列表只走私聊，群内不留痕迹。
	if (typeof message?.text === 'string' && /^\/recent(?:@[^\s]+)?(?:\s|$)/i.test(message.text.trim())) {
		const recentIsInGroup = message.chat.type !== 'private';
		if (!isPrimaryOwner(getMessageActorId(message))) {
			// 群内静默（不暴露命令存在）；私聊明确告知。与其它管理命令同一口径。
			if (!recentIsInGroup) {
				await sendTelegramMessage(message.chat.id, '❌ <b>权限不足</b>\n\n学习候选命令仅限第一主人使用。');
			}
			// 方案 A 补调：/recent 是命令消息，这条 return 早于主写入点，不补就漏计。
			await tryRecordSpeechStat(message, env, chatId, ctx);
			return;
		}
		if (recentIsInGroup) await deleteAuthorizedGroupCommandMessage(message, '/recent');
		if (!env.DB) {
			await sendTelegramMessage(getMessageActorId(message), '❌ 未绑定 D1 存储空间，学习候选不可用。');
			await tryRecordSpeechStat(message, env, chatId, ctx);   // 方案 A 补调：命令不漏计
			return;
		}
		try {
			await handleAdRecentCommand(message, env, ctx);
		} catch (error) {
			console.error('[学习候选] /recent 执行异常:', error);
			await sendTelegramMessage(getMessageActorId(message), '❌ 命令执行异常：' + escapeHtml(toChineseErrorText(String(error?.message || error))));
		}
		await tryRecordSpeechStat(message, env, chatId, ctx);   // 方案 A 补调：命令不漏计
		return;
	}

	if (await handleAdDetectionCommands(message, env, ctx)) {
		// 方案 A 补调：11 条广告管理命令（/pending /adstats /rescreen …）走这条 return，
		// 全是真人发的命令消息，不补就整类命令从统计里消失。
		await tryRecordSpeechStat(message, env, chatId, ctx);
		return;
	}

	if (await handleAdReplyLearning(message, env, ctx)) {
		await tryRecordSpeechStat(message, env, chatId, ctx);   // 方案 A 补调：回复学习也是命令
		return;
	}

	// ===== 广告重发删除通道（2026-09-21 主人选定方案三）=====
	// 【必须排在 detectAdOnMessage 之前】否则重发者会先被广告检测封掉 ——
	// 而主人定的规则是「第一条广告号封禁，接下来的引用重发全是误封行为、不能触发封禁」。
	// 这里只删消息就 return，那条广告正文不留在群里，重发者一根头发都不动。
	//
	// 不看发送者是 bot 还是真人：bot 重发、真人原文转述警示他人，都只删消息。
	// 判据是「这段正文已经被处置过」这个确定性事实，不是「像不像广告」。
	//
	// 【前置条件刻意收紧到「bot 发的」或「带引用体」】两个原因：
	//   1) 重发形态必然满足其中之一 —— bot 账号发出、且带引用（引用主人的命令消息）。
	//   2) 真人不带引用、直接重打一遍广告正文，那本来就该走 detectAdOnMessage 正常封禁，
	//      走这条只删不封的通道反倒是放过。
	// 副作用是热路径省掉一次 D1 读：真人普通发言不满足前置条件，压根不查表。
	//
	// 【2026-09-26】同款直封（广告号直发第一主人 /spam 过的文案 → 删 + 封）不走这里，
	// 走下方「消息缓存写入」那一步：名单查询嵌进写缓存的同一条 SQL，普通发言不多付 D1。
	// 本通道维持原状：只处理「bot 发的」或「带引用体」的消息，命中一律只删不封。
	if (
		isConfiguredGroup(chatId) && message.message_id
		&& !isTelegramServiceMessage(message)
		&& !isAdExemptBot(message.from)
		&& !isPublicModerationCommand(message.text)
		&& (message.from?.is_bot === true || message.reply_to_message)
		&& await matchHandledAdText(env, message)
	) {
		console.log('[重发删除] 群 ' + chatId + ' 消息 ' + message.message_id + ' 重发已处置广告，仅删消息不封禁');
		await deleteMessage(chatId, message.message_id);
		return;
	}

	// detectAdOnMessage 三种返回：true = 已封禁处置（含演练命中，直接收尾）；
	// 'observe' = 转入观察（继续走后续）；false = 放行。
	const adVerdict = await detectAdOnMessage(message, env);
	if (adVerdict === true) {
		// 判过的消息同样要进消息缓存：/spam 的「当前群清扫」与「跨群连带」只认这张表，
		// 不写就一条都追不到 —— 演练模式下尤其明显（演练不删消息，人还在群里发着，
		// 却因为这一行 return 而不进缓存，主人随后 /spam 同款时连带查了个空）。
		// 打 is_ad=1：/search 仍检索不到它，广告不进搜索库的规则不变。
		await cacheModerationMessage(env, message, { isAd: true });
		return;
	}
	const adObserved = adVerdict === 'observe';
	// 方案 A 主写入点：走到这里已经确认【这条不是被封的广告】。被封的在上面 return 了，
	// 重发已处置广告更早，两者都不计 —— 统计从此不给广告抬轿。
	await tryRecordSpeechStat(message, env, chatId, ctx);

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
		// 转入观察的那条照常写 —— 但标 is_ad=1，仍然进不了 /search 检索源。
		// 此前它是「不写表」，代价是 /spam 的同款连带与当前群清扫同样追不到它。
	) {
		// 【同款直封】写缓存与查名单是同一条 SQL。只有「有资格被直封」的消息才需要等结果：
		//   不带引用（群友回复广告只删不封，那条由重发通道处理）+ 发送者不是主人/副主人/超管。
		// 其余消息照旧放后台写，不阻塞热路径。群管理员放到命中之后再查（罕见路径才花这一次请求）。
		const senderIdStr = String(message.from.id);
		const spamEligible = !message.reply_to_message && !isOwner(senderIdStr) && !isSuperAdmin(senderIdStr);
		if (spamEligible) {
			const cached = await cacheModerationMessage(env, message, { isAd: adObserved });
			// senderIdStr 已排除主人/副主人/超管；这里再补「任意配置群的群主/管理员」豁免。
			if (cached?.spamHit && !(await isAdminInAnyConfiguredGroup(senderIdStr))) {
				console.log('[同款直封] 群 ' + chatId + ' 用户 ' + senderIdStr + ' 直发第一主人 /spam 过的同款文案 → 删除 + 封禁');
				await deleteMessage(chatId, message.message_id);
				await enforceHandledRepeatBan(env, message, { norm: cached.norm });
				return;
			}
		} else if (ctx && typeof ctx.waitUntil === 'function') {
			ctx.waitUntil(cacheModerationMessage(env, message, { isAd: adObserved }));
		} else {
			await cacheModerationMessage(env, message, { isAd: adObserved });
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

		const isAdmin = await checkMessageOperatorCanModerate(message, userId);
		if (!isAdmin) {
			if (!isInGroup) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n/spam 仅限配置群的 Telegram 管理员、主人或副主人使用。');
			}
			return;
		}

		await deleteAuthorizedGroupCommandMessage(message, '/spam');
		// 群聊简洁（主人要求）：/spam 在群内只发「目标 + 封禁结果」的简洁汇总，与 /unban 同款
		//（目标渲染成可点击昵称 + 可复制 TGID）；完整逐群明细仍私聊第一主人与副主人。
		// 撤回命令消息、指纹/样本学习、同款连带等原有行为一律不变。
		message.__moderationGroupMode = 'brief';

		// 提取 /spam 后面的参数。回复模式优先把参数当执行原因；无回复时才按 TGID 模式解析。
		const argMatch = text.trim().match(/^\/spam(?:@[^\s]+)?\s*([\s\S]*)/i);
		const rawArg = argMatch ? argMatch[1].trim() : '';
		const repliedMsg = message.reply_to_message;

		if (rawArg && !repliedMsg) {
			// ===== TGID 模式：直接通过 ID 封禁 =====
			const { valid, invalid, note } = parseTargetIdsAndNote(rawArg);

			if (valid.length === 0 && invalid.length === 0) {
				const usageText = `❌ 使用方法：<code>/spam 用户ID</code> 或 <code>/spam 123,456,789</code>（最多 ${BATCH_LIMIT} 个）`;
				await replyToModerationAdmin(message, ctx, { flashText: usageText });
				return;
			}
			if (valid.length > BATCH_LIMIT) {
				const limitText = `❌ 一次最多 ${BATCH_LIMIT} 个 TGID（你输入了 ${valid.length} 个）`;
				await replyToModerationAdmin(message, ctx, { flashText: limitText });
				return;
			}
			if (await startBulkModerationJobFromCommand(message, env, ctx, {
				action: 'spam',
				mode: 'human',
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
					// mode:'human' = /spam 与 /ban 同口径：杀手模式 ON 的群踢出、其余群禁言不踢。
					const banResults = await banUserFromAllGroups(valid[0], { probeMembership: true, mode: 'human' });
					// 风控·处置：/spam 单条按实际处置成功的群逐群 +1。
					await recordDisposalsFromBanResults(env, banResults);
					targetMention = formatTargetFromBanResults(valid[0], banResults);
					lines.push(`🎯 目标用户:${targetMention}`);
					lines.push('');
					if (alreadyExists) {
						lines.push('⚠️ <b>该用户已在黑名单中,本次已继续执行全群处置</b>');
					}
				// /spam <id>（不带引用）此前同样不学 —— 只有「引用回复 + /spam」那条
				// 路径有正文可学。这里能学的只有资料卡：正文无从得知，
				// 【text 传空串】命令消息的内容是「/spam 123」，学它等于把命令文本当广告样本。
				const spamIdLearn = await learnAdFromOperatorAction(env, valid[0], message, {
					source: 'spam',
					createdBy: String(operatorId ?? ''),
					text: ''
				});
				lines.push(...renderAdLearnLines(spamIdLearn, 'spam'));
					lines.push(await renderBanResultsDetail(banResults, null, { userId: valid[0], retryCommand: '/spam' }));
					flashText = `${result.success ? '✅ 已加黑并全群禁言' : '⚠️ 已在黑名单，已继续全群禁言'}\n🎯 ${targetMention}\n` + renderBanResults(banResults);
				} else {
					lines.push(`🎯 目标用户:${targetMention}`);
					lines.push('');
					lines.push(result.message);
					flashText = `⚠️ <code>${valid[0]}</code> ${result.message.replace(/<[^>]+>/g, '')}`;
				}
				await replyToModerationAdmin(message, ctx, {
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
				async (id) => ({ userId: id, banResults: await banUserFromAllGroups(id, { mode: 'human' }) })
			);
			for (const { banResults } of perUserBanResults) {
				const okCount = banResults.filter((r) => r.ok).length;
				if (okCount === banResults.length) banSummary.banOkAll += 1;
				else if (okCount === 0) banSummary.banFailedAll += 1;
				else banSummary.banPartial += 1;
				// 风控·处置：批量 /spam 逐用户、逐群记一次（每个目标 × 每个封成功的群）。
				await recordDisposalsFromBanResults(env, banResults);
			}
			const failedCount = invalid.length + results.failed.length;
			const flashText = `✅ 批量加黑(/spam)：成功 ${results.success.length}${results.exists.length ? ` / 已存在 ${results.exists.length}` : ''}${failedCount ? ` / 失败 ${failedCount}` : ''}`
				+ (idsToKick.length ? '\n' + idsToKick.map((id) => `· ${formatBatchUserTarget(id, userProfiles)}`).join('\n') : '');
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
			await replyToModerationAdmin(message, ctx, {
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
			await replyToModerationAdmin(message, ctx, { flashText: usageText });
			return;
		}

		const replySpamNote = rawArg;
		const result = await addToBlacklist(repliedUserId, env, { reason: 'spam', by: operatorId, note: replySpamNote });
		const alreadyExists = result.code === 'EXISTS';
		const linkedUserId = `<a href="tg://user?id=${repliedUserId}">${repliedUserId}</a>`;

		if (result.success || alreadyExists) {
			// 加黑成功或已存在 → Telegram 群封禁/预封(revoke_messages 默认 true:封禁同时删该用户在各群全部消息)
			//   + 缓存清扫兜底(补删 revoke 偶尔漏的、当前群近期消息)
			const banResults = await banUserFromAllGroups(repliedUserId, { probeMembership: true, mode: 'human' });
			// 风控·处置：引用回复 /spam（对发出广告那条消息的发送者处置）按封成功群逐群 +1。
			await recordDisposalsFromBanResults(env, banResults);
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
			// 学习逻辑已抽成 learnAdFromOperatorAction（/spam /ban /sban 三条命令共用），
			// 这里只传【引用的那条消息】+ source='spam'，三段内容与改动前逐字一致。
			// 清单消息的 text 是 undefined，接上 checklist 才学得到正文（同 buildModerationTextKey）。
			const spamTextForLearn = String(repliedMsg.text || repliedMsg.caption || extractAdChecklistText(repliedMsg));
			const spamLearn = await learnAdFromOperatorAction(env, repliedUserId, repliedMsg, {
				source: 'spam',
				createdBy: String(operatorId ?? ''),
				text: spamTextForLearn
			});
			spamLearned = spamLearn.learned;
			spamSampleAdded = spamLearn.sampleAdded;
			spamEnriched = spamLearn.enriched;
			} catch (error) {
				// 学习失败绝不能影响 /spam 的本职（加黑 + 全群封禁 + 清扫）—— 那些已经做完了。
				console.error('[广告检测] /spam 学习指纹失败:', error);
			}
			if (spamLearned > 0) lines.push('🧬 已学习广告指纹:' + spamLearned + ' 条(来源 /spam 人工判定)');
			if (spamSampleAdded > 0) lines.push('🧠 已加 AI 语义样本:' + spamSampleAdded + ' 条(来源 /spam 人工判定)');
			if (spamEnriched > 0) lines.push('🧠 共性提炼:从新样本自动提炼出 ' + spamEnriched + ' 条指纹(共现 ≥2 次)');

			// ===== 同款广告连带查杀（2026-09-11 主人选定方案一）=====
			// 反查 24 小时内、全部配置群里发过同款文案的其他账号，一并删消息 + 加黑 + 全群封禁。
			// 不做二次确认（主人口径），但【务必】把结果私聊第一主人并附一键回滚命令 ——
			// 连带是把单次误判乘以 N 倍的操作，回滚入口必须在通知里现成可复制。
			//
			// 【仅第一主人可触发】连带的杀伤力是单次封禁的 N 倍，而误封的根源不是
			// 「代码判得不准」而是「谁有资格触发这个不可逆的批量操作」——
			// 今天那次误封（管理员回复「广告」封了 14 个群）正是触发权开给群管理员的后果。
			// 副主人 / 群管理员的 /spam 照常执行加黑 + 封禁 + 学指纹，只是不连带。
			// 非第一主人【完全静默】：不提示、不在群里留任何痕迹，不暴露这个能力的存在。
			try {
				const linkedKey = isPrimaryOwner(operatorId) ? buildModerationTextKey(repliedMsg) : null;
				// 【同款直封】第一主人回复广告 /spam → 文案写进两份名单（均保留一周）：
				//   ad_spam_texts    —— 同款直封：广告号之后直发同款 → 发言时即删除 + 封禁，不需二次 /spam
				//   ad_handled_texts —— 重发只删：机器人贴原文 / 群友带引用回复 → 只删不封
				// 只收第一主人：副主人 / 超管 / 群管理员的 /spam 不写名单（与连带同一道门）。
				if (isPrimaryOwner(operatorId)) {
					await recordSpamText(env, repliedMsg);
					await recordHandledAdText(env, repliedMsg?.text ?? repliedMsg?.caption ?? '');
				}
				if (linkedKey) {
					const found = await findLinkedSpamTargets(env, linkedKey, repliedUserId);
					// 受保护角色（超管 / 任一配置群群主·管理员 / 主副主人）永不被连带封禁：入队前剔除。
					if (found.targets.length) {
						const kept = [];
						for (const t of found.targets) {
							if (await isProtectedFromAutoModeration(t.userId)) {
								console.log('[同款连带] 目标 ' + t.userId + ' 是受保护角色，跳过不封');
							} else {
								kept.push(t);
							}
						}
						found.targets = kept;
					}
					if (found.targets.length) {
						const noteText = '同款广告连带(/spam ' + linkedUserId + ')';
						if (shouldRunLinkedSpamSync(found.targets.length)) {
							// 同步路径：仅当子请求估算在安全预算内才当场执行（群少时才可能走到）。
							const done = await enforceLinkedSpamTargets(env, found.targets, {
								operatorId, note: noteText
							});
							// 【刻意不写进 lines】lines 走 detailText，而 detailText 会同时投给副主人
							// （notifySecondaryOwners: true）。连带只属于第一主人，结果也只发给他 ——
							// 由下面的 notifyLinkedSpamResult 单独私聊。
							// 连带查杀详情继续通过独立私聊通知投递，不公开到来源群。
							await notifyLinkedSpamResult(env, {
								operatorId, message, sourceUserId: linkedUserId,
								textNorm: linkedKey.norm, done,
								overflowIds: found.overflowIds || [], truncated: found.truncated || 0
							});
						} else {
							// 超过同步预算：转 D1 批量任务 + Queues 分片续接，复用既有机制。
							const linkedIds = found.targets.map((t) => t.userId);
							// 把反查已经拿到的 mid 按「用户 → 群 → mid 列表」整形带进任务，
							// 让批量路径也能删掉那几条同款消息 ——
							// 此前只有同步路径删消息，批量路径只加黑封禁，消息原样留在群里（线上实测）。
							const deleteTargets = {};
							for (const t of found.targets) {
								const byChat = {};
								for (const item of t.messageIds || []) {
									const chatKey = String(item.chatId);
									if (!byChat[chatKey]) byChat[chatKey] = [];
									if (!byChat[chatKey].includes(item.mid)) byChat[chatKey].push(item.mid);
								}
								if (Object.keys(byChat).length) deleteTargets[String(t.userId)] = byChat;
							}
							const job = await createBulkJob(env, 'spam', linkedIds, [], noteText, message, {
								deleteTargets: Object.keys(deleteTargets).length ? deleteTargets : null
							});
							const queueAvailable = Boolean(getBulkQueue(env));
							if (!queueAvailable) { job.autoContinue = false; await saveBulkJob(env, job); }
							// 同上：不进 lines，任务号只在第一主人的私聊通知里给出。
							await notifyLinkedSpamResult(env, {
								operatorId, message, sourceUserId: linkedUserId,
								textNorm: linkedKey.norm, jobId: job.id, pendingIds: linkedIds,
								overflowIds: found.overflowIds || [], truncated: found.truncated || 0
							});
							const scheduled = queueAvailable
								? scheduleBulkJobAutoContinue(job, ctx, requestUrl, env)
								: false;
							if (scheduled && typeof scheduled.then === 'function') await scheduled;
						}
					}
				}
			} catch (error) {
				// 连带失败绝不影响 /spam 本职（当事人的加黑 + 封禁 + 清扫早已完成）。
				console.error('[同款连带] 执行失败:', error);
			}

			await replyToModerationAdmin(message, ctx, {
				flashText: `${result.success ? '✅ 已加黑并全群禁言' : '⚠️ 已在黑名单，已继续全群禁言'}\n🎯 ${formatUserReference(repliedUserId, repliedMsg.from)} <code>${escapeHtml(String(repliedUserId))}</code>`,
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
			await replyToModerationAdmin(message, ctx, {
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
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限主人、副主人使用。');
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

	// /check 保留参数查询、群内回复查询及双库复制按钮。
	// /stats 群统计（公开命令，展示在外、进 /help）：群内本群 Telegram 管理员/群主可查、
	// 主人/副主人随时可查（普通成员静默）；私聊仅主人/副主人查指定配置群。只汇总当前群。
	if (isStatsCommand(text)) {
		if (await handleStatsCommand(message, env, ctx)) return;
	}

	// /killer 杀手模式切换（仅第一主人；仅 KILLER_MODE_GROUPS 群内有效）。其他人一律静默。
	if (isKillerCommand(text)) {
		if (await handleKillerCommand(message, env)) return;
	}

	// /dryrun 演练模式切换（仅第一主人；任意配置群内有效）。其他人一律静默。
	// 必须排在广告检测分发【之前】：演练是判定之后的处置开关，命令本身不该被检测吃掉。
	if (isDryRunCommand(text)) {
		if (await handleDryRunCommand(message, env)) return;
	}

	if (isCheckCommand(text)) {
		const isInGroup = message.chat.type !== 'private';
		const dispatchSourceAllowed = !isInGroup || isConfiguredGroup(chatId);
		if (!(await checkMessageOperatorCanModerate(message, userId))) {
			if (!isInGroup) await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n/check 仅限配置群的 Telegram 管理员、主人或副主人使用。');
			return;
		}
		// /check 群聊【刻意不撤回命令消息】（主人要求）：命令与查询结果都留在群里，
		// 便于群内其他管理员看到「谁查了谁」；完整结果仍私聊第一主人。
		// 其余命令的撤回行为一律不动。
		const checkArg = text.trim().replace(/^\/check(?:@[^\s]+)?\s*/i, '').trim();
		const hasTgidArg = /^\d+$/.test(checkArg);
		const repliedUser = !hasTgidArg && isInGroup ? message.reply_to_message?.from : null;
		if (!hasTgidArg && !repliedUser?.id) {
			await replyToModerationAdmin(message, ctx, {
				detailText: isInGroup
					? '❌ 请回复要查询封禁状态的用户消息后再发送 <code>/check</code>，或用 <code>/check TGID</code> 直接查。'
					: 'ℹ️ 私聊查询请用:<code>/check TGID</code>\n例:<code>/check 993005028</code>\n群内可回复某条消息发 <code>/check</code> 查该用户。',
			});
			return;
		}
		const tgidToCheck = hasTgidArg ? checkArg : String(repliedUser.id);
		if (!isInGroup) {
			await sendTelegramMessage(chatId, `正在查询 TGID: <code>${escapeHtml(tgidToCheck)}</code> 的封禁状态...`);
		}
		// 群内才有「当前群」上下文；私聊不指定群（取 GROUP_IDS[0] 去查是拿无关群当结论）。
		const isGroupChat = message.chat?.type !== 'private';
		const profileGroupId = isGroupChat && isConfiguredGroup(String(chatId)) ? String(chatId) : '';
		const response = await buildBanlistCheckResponse(tgidToCheck, {
			targetUser: repliedUser,
			includeReviewAction: true,
			dispatchSourceAllowed,
			env,
		});
		// 资料卡 + 时间线（第1批）：/check 与 /profile 共用同一份渲染，避免两处口径分叉。
		const profileLines = await buildProfileBlock(env, profileGroupId, tgidToCheck, isGroupChat);
		await replyToModerationAdmin(message, ctx, {
			detailText: [...profileLines, '', response.text].join('\n'),
			replyMarkup: response.replyMarkup,
		});
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
					await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限主人、副主人使用。');
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
			// 资料卡 + 时间线（第1批）：与 /check 正常查询、/profile 共用同一份渲染。
			const isGroupChat = message.chat?.type !== 'private';
			const profileLines = await buildProfileBlock(env,
				isGroupChat && isConfiguredGroup(String(chatId)) ? String(chatId) : '', tgidToCheck, isGroupChat);
			const checkText = [...profileLines, '', response.text].join('\n');
			if (quietGroupCommand) {
				await replyToAdmin(message, ctx, {
					flashText: `🔍 查询完成 <code>${escapeHtml(tgidToCheck)}</code>，完整结果已发送给主人`,
					detailText: checkText,
					isInGroup: true,
					replyMarkup: response.replyMarkup,
				});
			} else {
				await sendTelegramMessage(chatId, checkText, response.replyMarkup);
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
			await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限主人、副主人使用。');
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

	// ===== /rm 回复删除（仅第一主人 / 该群群主）=====
	// 放在命令分发区最前，早于 /notice；非配置群的命令已在上方 isNonConfiguredGroup 处被拦。
	if (isRmCommand(text)) {
		await handleRmCommand(message, env, ctx);
		return;
	}

	// ===== /profile 资料卡（权限同 /check）=====
	if (isProfileCommand(text)) {
		await handleProfileCommand(message, env, ctx);
		return;
	}

	// ===== /health 运行检查（仅第一主人；两层自检 + 三权限）=====
	// 不注册进 setMyCommands：它是隐藏命令，入口走群设置菜单页（第 6 步）与 README。
	if (isHealthCommand(text)) {
		await handleHealthCommand(message, env);
		return;
	}

	// ===== /menu 群设置菜单页（仅第一主人）=====
	if (isMenuCommand(text)) {
		await handleMenuCommand(message, env);
		return;
	}

	// ===== /search 关键词搜索（第一主人 + 该群群主）=====
	if (isSearchCommand(text)) {
		await handleSearchCommand(message, env);
		return;
	}

	// ===== /notice 全体通知（仅第一主人私聊；群内静默）=====
	if (isNoticeCommand(text)) {
		await handleNoticeCommand(message, env, ctx);
		return;
	}
	// 全体通知「等待内容」态：第一主人私聊发来的下一条非命令消息即为通知内容。
	// 放在命令分发里、非命令消息落到普通逻辑之前拦截；非等待态时 maybeCaptureNoticeContent 返回 false 不影响任何流程。
	if (message.chat?.type === 'private' && !isTelegramSlashCommand(text) && isPrimaryOwner(userId)) {
		if (await maybeCaptureNoticeContent(message, env)) return;
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
			'🔐 <b>第一主人专属帮助</b>（仅第一主人私聊可展开）',
			'',
			'<b>━━ 人工封禁与查询（群管理员 / 主人 / 副主人）━━</b>',
			'/ban TGID [原因]　加黑 + 全群禁言（不踢出）',
			'/sban TGID [原因]　加黑 + 全群踢出并撤回其历史发言（第一主人 / 副主人 / 该群群主）',
			'/spam　回复广告：删消息 + 全群禁言',
			'/unban TGID　移出黑名单 + 全群解封并恢复发言（不带 ID 则是自助解封）',
			'/check TGID　查封禁状态：GKY + 本地黑名单（群内可回复消息使用）',
			'/profile TGID　资料卡：昵称 / 简介 / 时间线 / 黑名单 / GKY（群内可回复消息使用）',
			'/rm　回复要删的消息后发送 → 删除该消息（仅第一主人 / 该群群主）',
			'/health　运行检查：bot 状态自检 + 逐群查在不在群、是不是管理员、三个权限',
			'/menu　群设置菜单：群统计 / 资料卡 / 运行检查 的入口页（仅第一主人，群里发）',
			'/search 关键词|TGID|@用户名　查谁发过什么（第一主人 + 该群群主）',
			'/blacklist　查看全局黑名单最近记录（主人 / 副主人）',
			'/job 任务ID [页码]　查大批量封禁任务的进度',
			'/jobrun 任务ID　手动续跑未完成的批量任务',
			'',
			'<b>━━ 群统计（群管理员 / 主人 / 副主人）━━</b>',
			'/stats　群内出用法面板，带 今日 / 本周 / 本月 按钮，点一下即查',
			'/stats today　查本群今日的发言与进退群统计',
			'/stats week　查本群本周的发言与进退群统计',
			'/stats month　查本群本月的发言与进退群统计',
			'/stats -100群ID today　私聊查指定群的今日统计',
			'/stats -100群ID week　私聊查指定群的本周统计',
			'/stats -100群ID month　私聊查指定群的本月统计',
			'',
			'<b>━━ 杀手模式（仅第一主人 · 需 KILLER_MODE_GROUPS）━━</b>',
			'/killer　翻转本群开关；私聊发送则列出全部杀手模式群及状态',
			'/killer on　开启：命中即全群封禁并踢出',
			'/killer off　关闭：仅永久禁言不踢出（仍加黑）',
			'/killer status　查看本群当前处于哪种模式',
			'',
			'<b>━━ 演练模式（仅第一主人 · 任意配置群）━━</b>',
			'/dryrun　翻转本群开关；私聊发送则列出已开演练的群与命中数',
			'/dryrun on　开启：判定照跑，不删不封不加黑【但当场就学特征，全部配置群通用】，命中写流水并私聊通知你，通知带两个按钮拍板（✅确认封 / ❌不该封撤销特征+标误报）',
			'/dryrun off　关闭：恢复自动处置（加黑 + 全群封禁 + 删消息 + 自动学习）',
			'/dryrun status　查看本群当前状态',
			'　　⚠️ 演练期间本群完全不设防、广告照发，调完阈值记得关',
			'',
			'<b>━━ 全体通知（仅第一主人私聊）━━</b>',
			'/notice　发起全体通知，随后按提示发一条内容（文本/图片/视频/文件均可）',
			'　　发完出预览与「✅ 确认发送」按钮，点了才以机器人身份群发到所有配置群',
			'/notice cancel　取消本次通知',
			'',
			'<b>━━ 广告举报投票（授权成员发起）━━</b>',
			'/ad [原因]　回复广告发起群内投票，通过即加黑并全群封禁',
			'/add_ad_admin TGID　给该成员发起投票的权限',
			'/del_ad_admin TGID　收回该成员的发起权限',
			'',
			'<b>━━ 动态群组（仅私聊）━━</b>',
			'/addgroup -100xxx [备注]　新增治理群，免改环境变量',
			'/delgroup -100xxx　停止治理该群，bot 仍留在群里',
			'/listgroups　列出全部生效群组',
			'',
			'<b>━━ 查询与退群（仅私聊）━━</b>',
			'/admins　查看主人、副主人与超级管理员名单',
			'/groups　查看当前生效群组信息',
			'/leavegroup -100xxx　让 bot 退出该群',
			'',
			'<b>━━ 广告自动检测（仅私聊）━━</b>',
			'/pending [N]　列出待复核的自动判定快照，默认 10 条',
			'/ignore 序号　判错回滚：解黑 + 全群解封 + 删掉学到的指纹和样本（支持 3 5 7 与 3-8）。封禁回执上也有两个按钮：↩️误判=回滚全部、🔓解封=只放人不动判据',
			'/rescreen [N]　重新筛查观察窗口里的可疑用户，默认 10 人',
			'/adstats　检测状态总览：指纹、样本向量、观察窗口、入群检查流水与本群演练状态',
			'',
			'<b>━━ 指纹与样本维护（仅私聊）━━</b>',
			'/words [关键词] [页码]　翻看 / 搜索指纹库，按命中次数倒序，按钮翻页',
			'/addword 值 [类型]　新增指纹，类型可省略自动推断',
			'/delword 值　删除单条指纹',
			'/delword noise　批量删掉命中 0 次的噪声指纹（二次确认，不动种子）',
			'/delword type:username　批量删掉整类指纹（二次确认，不动种子）',
			'/addsample 文本　新增 AI 语义比对样本',
			'/recent [N]　捞回被别的 bot 抢先删掉的广告，冻结快照推私聊',
			'/learnlast 序号　按 /recent 序号学习 + 加黑封禁发送者（支持 1,3,5）',
			'/warmup　补齐 AI 样本向量（向量为 0 则第三层不生效，可反复发）',
			'/clearsamples　清空全部 AI 样本，需二次确认令牌',
			'/whitelist [list|add|del] [域名]　维护域名白名单，命中即豁免',
			'',
			'<b>━━ 说明 ━━</b>',
			'超管名单　环境变量 SUPER_ADMIN_IDS 里的人',
			'超管可用　/ban /spam /unban /check，无需群管理员身份',
			'超管限制　不能用 /stats，本人仍受黑名单拦截',
			'检测豁免　超管、任一配置群的群主或管理员，发任何内容都不被广告自动检测',
			'群内命令　发出即撤回，结果留在群里并通知第一主人',
			'　　　　　/dryrun 是例外：命令与回执都撤回，完整信息走私聊（群里不留痕）',
			'入群判定　进群那一刻就查 bio 与头像，不等发言；封禁线默认与消息线相同，',
			'　　　　　要更严可设环境变量 AD_JOIN_SCORE_THRESHOLD（如 9），每次检查都留流水',
			'　　　　　资料里挂的 @xxx / t.me/xxx 会查清目标的简介与案底再打分（每人最多 5 个、',
			'　　　　　按 handle 缓存 6 小时；资料里没链接则一个请求都不发）',
			'私聊命令　命令和结果都保留',
			'自动判定　加黑 + 全群封禁 + 自动学习，快照推给你复核',
			'判错回滚　用 /ignore 序号撤销，判对不用管',
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
		// 名单较长时可能超过单条 4096 字上限，走分段发送；短名单仍是一条。
		await sendTelegramMessageChunks(chatId, listText);
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




	// 处理 /ban 与 /sban 命令 - 添加用户到黑名单（支持批量、群内/私聊双场景；兼容 @机器人名）
	//   /ban  → 加黑 + 全群【禁言】（杀手模式 ON 的群仍踢出，见 resolveHumanCommandMode）
	//   /sban → 加黑 + 全群【踢出】并撤回历史发言（主人定的「指定人全群踢出」专用指令）
	// 两者共用这一条分支：解析、批量、渲染、回执逻辑完全一致，只在权限与处置方式上分叉。
	if (isBanCommand(text) || isSbanCommand(text)) {
		const isSban = isSbanCommand(text);
		const commandName = isSban ? '/sban' : '/ban';
		const moderationMode = isSban ? 'kick' : 'human';
		const isInGroup = message.chat.type !== 'private';
		if (isInGroup && !isConfiguredGroup(chatId)) return;

		// 仅真人可写入 D1 黑名单：作为管理员的第三方机器人一律忽略（GroupAnonymousBot 匿名管理员=真人，放行）
		if (isBotOperator(message.from)) return;

		// /sban 的口子更窄：第一主人 / 副主人 / 该群 Telegram 群主；超管与普通管理员不给。
		// 私聊判不出群主，所以私聊只放第一主人与副主人 —— 群主要踢人得进群发命令。
		const isAdmin = isSban
			? await checkSbanPermission(message, userId)
			: await checkMessageOperatorCanModerate(message, userId);
		if (!isAdmin) {
			// 群内静默忽略（避免泄漏命令存在）；私聊明确告知权限不足
			if (!isInGroup) {
				await sendTelegramMessage(chatId, isSban
					? '❌ <b>权限不足</b>\n\n/sban 限第一主人、副主人或该群群主使用（私聊仅第一主人与副主人）。'
					: '❌ <b>权限不足</b>\n\n/ban 仅限配置群的 Telegram 管理员、主人或副主人使用。');
			}
			return;
		}

		await deleteAuthorizedGroupCommandMessage(message, commandName);
		// 群内回执按命令分流（replyToModerationAdmin 按 __moderationGroupMode 决定）：
		//   /sban → 'silent'：群里不留任何回执痕迹。命令消息上一行已撤回，回执干脆不发
		//           （发了再删会有可见窗口，而且多一次 deleteMessage），完整逐群明细
		//           照旧走私聊第一主人与副主人 —— 那条路 replyToAdmin 本来就走，不用改。
		//   /ban  → 'brief'：群内发「目标 + 处置结果」的简洁汇总，与 /unban 同款。
		//           目标用 formatTargetFromBanResults / formatBatchUserTarget 渲染成
		//           可点击昵称 + 可复制 TGID；完整逐群明细仍私聊第一主人与副主人。
		// silent 只在配置了可私聊的主人时生效（见 silenceGroup）：OWNER_IDS 未配置的
		// 退化部署会自动回退成群内发完整结果，避免操作完全零反馈。
		// 撤回命令消息、副主人通知等原有行为一律不变。
		message.__moderationGroupMode = isSban ? 'silent' : 'brief';

		// 提取参数（支持单个 / 批量；开头 TGID 列表之后的文本作为执行原因）
		// 用正则提取,与 /spam 完全对称:兼容 /ban、/ban@机器人名、/sban、多空格;彻底不依赖命令长度,
		// 根除早期 slice(5) 吃掉参数首字符那类"命令一改短就错位"的隐患。
		const argMatch = text.trim().match(/^\/(?:ban|sban)(?:@[^\s]+)?\s*([\s\S]*)/i);
		const rawArg = argMatch ? argMatch[1] : '';
		const { valid, invalid, note } = parseTargetIdsAndNote(rawArg);

		if (valid.length === 0 && invalid.length === 0) {
			const usageText = `❌ 使用方法：<code>${commandName} 用户ID</code> 或 <code>${commandName} 123,456,789</code>（最多 ${BATCH_LIMIT} 个）`;
			await replyToModerationAdmin(message, ctx, { flashText: usageText });
			return;
		}
		if (valid.length > BATCH_LIMIT) {
			const limitText = `❌ 一次最多 ${BATCH_LIMIT} 个 TGID（你输入了 ${valid.length} 个）`;
			await replyToModerationAdmin(message, ctx, { flashText: limitText });
			return;
		}
		if (await startBulkModerationJobFromCommand(message, env, ctx, {
			action: isSban ? 'sban' : 'ban',
			mode: moderationMode,
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
			const lines = [`🎬 操作:${isSban ? '全群踢出并加黑(/sban)' : '加入黑名单(/ban)'}`];
			let flashText;
			if (result.success || alreadyExists) {
				const banResults = await banUserFromAllGroups(valid[0], { probeMembership: true, mode: moderationMode });
				// 风控·处置：单条按实际处置成功的群逐群 +1。
				await recordDisposalsFromBanResults(env, banResults);
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
					lines.push(`⚠️ <b>该用户已在黑名单中,本次已继续执行${isSban ? '全群踢出' : '全群处置'}</b>`);
				}
								// /ban 与 /sban 的学习（这段两者共用，只差 source）——
				// 此前这两条命令一个特征都不学：封得越多、漏得越多，因为封掉的那些
				//【判定链压根没命中过】，特征一条都没进库。详见 learnAdFromOperatorAction。
				// 【text 传空串】命令消息的内容是「/ban 123」，学它等于把命令文本当广告样本。
				// 引用块兜底仍在生效 —— 命令如果是引用回复发的，广告就在那个引用块里。
				const manualLearn = await learnAdFromOperatorAction(env, valid[0], message, {
					source: isSban ? 'sban' : 'manual',
					createdBy: String(operatorId ?? ''),
					text: ''
				});
				lines.push(...renderAdLearnLines(manualLearn, isSban ? 'sban' : 'ban'));
				lines.push(await renderBanResultsDetail(banResults, null, { userId: valid[0], retryCommand: commandName }));
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
				flashText = `${result.success ? (isSban ? '✅ 已加黑并全群踢出' : '✅ 已加黑并全群禁言') : (isSban ? '⚠️ 已在黑名单，已继续全群踢出' : '⚠️ 已在黑名单，已继续全群禁言')}\n🎯 ${targetMention}\n` + renderBanResults(banResults);
			} else {
				// 失败(已存在/未绑存储等)→ 追加原因
				lines.push(`🎯 目标用户:${targetMention}`);
				lines.push('');
				lines.push(result.message);
				flashText = `⚠️ <code>${valid[0]}</code> ${result.message.replace(/<[^>]+>/g, '')}`;
			}
			await replyToModerationAdmin(message, ctx, {
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
			async (id) => ({ userId: id, banResults: await banUserFromAllGroups(id, { mode: moderationMode }) })
		);
		for (const { banResults } of perUserBanResults) {
			const okCount = banResults.filter((r) => r.ok).length;
			if (okCount === banResults.length) banSummary.banOkAll += 1;
			else if (okCount === 0) banSummary.banFailedAll += 1;
			else banSummary.banPartial += 1;
			// 风控·处置：批量逐用户、逐群记一次（每个目标 × 每个处置成功的群）。
			await recordDisposalsFromBanResults(env, banResults);
		}
		const failedCount = invalid.length + results.failed.length;
		const flashText = `✅ 批量加黑(${commandName})：成功 ${results.success.length}${results.exists.length ? ` / 已存在 ${results.exists.length}` : ''}${failedCount ? ` / 失败 ${failedCount}` : ''}`
			+ (idsToKick.length ? '\n' + idsToKick.map((id) => `· ${formatBatchUserTarget(id, userProfiles)}`).join('\n') : '');
		// 详细 detailText：批量汇总 + 每个用户的逐群明细
		const baseDetail = renderBatchAddResult(results, invalid, banSummary, userProfiles);
		let fullDetail = baseDetail;
		if (perUserBanResults.length > 0) {
			const perUserBlocks = [];
			const chatInfoCache = new Map();
			for (const { userId: uid, banResults } of perUserBanResults) {
				const resultDetail = await renderBanResultsDetail(banResults, chatInfoCache, {
					userId: uid,
					retryCommand: commandName,
					compactSpacing: true
				});
				perUserBlocks.push(buildTelegramAtomicHtmlBlock([
					`<b>用户</b> ${formatBatchUserCompactTarget(uid)}`,
					resultDetail
				]));
			}
			fullDetail += `\n\n<b>逐用户 Telegram ${isSban ? '群踢出' : '禁言/踢出'}明细</b>:\n\n${perUserBlocks.join('\n\n')}`;
		}
		await replyToModerationAdmin(message, ctx, {
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

			// 权限统一，原有 D1 检查、移除及 Telegram 解封流程保持原样。
			const isAdmin = await checkMessageOperatorCanModerate(message, userId);
			if (!isAdmin) {
				if (!isInGroup) {
					await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n/unban 仅限配置群的 Telegram 管理员、主人或副主人使用。');
				}
				return;
			}

			await deleteAuthorizedGroupCommandMessage(message, '/unban');
			// 群聊简洁（主人要求）：/unban 在群内只发「目标 + 解封总数」的简洁汇总，
			// 目标用 formatBatchUserTarget 渲染成【可点击昵称 + @用户名 + TGID】（点昵称直接看资料卡），
			// 但不含逐群明细 / 群 ID / 群名；完整结果仍私聊第一主人。
			// 撤回命令消息、D1 黑名单硬闸门等原有行为一律不变。
			message.__moderationGroupMode = 'brief';

			const { valid, invalid } = parseBatchTgids(rest);

			if (valid.length === 0 && invalid.length === 0) {
				const usageText = `❌ 使用方法：<code>/unban 用户ID</code> 或 <code>/unban 123,456,789</code>（最多 ${BATCH_LIMIT} 个）`;
				await replyToModerationAdmin(message, ctx, { flashText: usageText });
				return;
			}
			if (valid.length > BATCH_LIMIT) {
				const limitText = `❌ 一次最多 ${BATCH_LIMIT} 个 TGID（你输入了 ${valid.length} 个）`;
				await replyToModerationAdmin(message, ctx, { flashText: limitText });
				return;
			}
			if (await startBulkModerationJobFromCommand(message, env, ctx, {
				action: 'unban',
				allowD1Removal: isAdmin,
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
					await replyToModerationAdmin(message, ctx, {
						flashText: `⛔ <code>${targetId}</code> 在 D1 黑名单，已拒绝解封`,
						groupText: `⛔ ${targetMention} 在 D1 黑名单，已拒绝解封`,
						detailText: lines.join('\n'),
						isInGroup
					});
					return;
				}

				if (!eligibility.eligible.includes(targetId)) {
					const failure = eligibility.failed.find((item) => item.id === targetId);
					const failureText = failure?.msg || '❌ 无法确认 D1 黑名单状态，已拒绝解封';
					lines.push(escapeHtml(failureText), 'ℹ️ 为避免绕过全局黑名单，本次未调用 Telegram 解封接口。');
					await replyToModerationAdmin(message, ctx, {
						flashText: `❌ <code>${targetId}</code> 无法确认 D1 状态，已拒绝解封`,
						groupText: `❌ ${targetMention} 无法确认 D1 状态，已拒绝解封`,
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
				await replyToModerationAdmin(message, ctx, {
					flashText: `🔓 <code>${targetId}</code> D1 检查通过，已尝试群解封\n${renderUnbanResults(unbanResults)}`,
					groupText: `🔓 已解封\n🎯 ${targetMention}\n${renderUnbanResults(unbanResults)}`,
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
			await replyToModerationAdmin(message, ctx, {
				flashText,
				groupText: `🔓 批量解封完成\n✅ 解封 ${results.eligible.length}　⛔ D1拒绝 ${results.blacklisted.length}　❌ 失败 ${failedCount}`
					+ (idsToUnban.length ? '\n' + idsToUnban.map((id) => `· ${formatBatchUserTarget(id, userProfiles)}`).join('\n') : ''),
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
		// 副主人、匿名管理员）一律【纯静默】—— 不回、不撤回、不通知主人、
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
				ctx.waitUntil(notifyOwnerBlacklistAppeal(message.from, startCheck, 'start', message.chat));
			}
		} catch (error) {
			console.error('[/start] 黑名单知情通报失败:', error);
		}
		// ===== 统计面板入口（仅第一主人）=====
		// 私聊与群聊都只有第一主人拿到新面板；其余所有人走下面的原介绍语，逐字节不变。
		// 群聊非第一主人在本分支开头已纯静默 return，所以能走到这里的群聊一定是第一主人。
		// 回调端 handleMenuCallback 还会复查一次 isPrimaryOwner —— 按钮消息被转发出去也进不去。
		if (isPrimaryOwner(userId)) {
			try {
				const home = await renderOwnerHome(env);
				await sendTelegramMessage(chatId, home.text, home.keyboard);
			} catch (error) {
				console.error('[/start] 统计面板渲染失败:', error);
				// 渲染失败必须回落介绍语，不能让第一主人收到空回复。
				const fbTitle = START_WELCOME.includes('{title}') ? (await getGroupInfo()).title : '';
				await sendTelegramMessage(chatId, START_WELCOME
					.replaceAll('{userId}', String(userId))
					.replaceAll('{title}', fbTitle));
			}
			return;
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
		// 副主人、匿名管理员）在配置群发无参 /unban 一律【纯静默】——
		// 不回欢迎语、不撤回命令、不私聊主人、不产生任何 Telegram 请求。
		// 原因：这段清单是给「被封禁用户私聊 bot」用的自助流程，任何人都能在群里
		// 把它刷出来会污染群消息流，且清单里含解封确认整句，等于公开教学如何触发解封。
		// 私聊完全不进此判定，权限与行为保持原样。
		if (message.chat.type !== 'private' && !isPrimaryOwner(getMessageActorId(message))) {
			return;
		}

		const quietManagerCommand = await isNonPrimaryConfiguredGroupManager(message, userId);
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
			await replyToModerationAdmin(message, ctx, {
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
		await notifyOwnerSelfUnban(message.from, perGroupResults, message.chat);

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

// ===== /rm 回复删除（第1批 · 2026-10-01）=====
// 回复要删的消息发 /rm 或 /rm@TestBot 都认（裸命令与带 @bot 名等价，主人确认过两种都支持）。
// 权限：仅【第一主人 或 该群群主 creator】—— 删除不可逆，比 /stats 那种「管理员即可」更严。
// 私聊不适用；必须先回复目标消息；非配置群直接不响应（不替别的群当刀）。
function isRmCommand(text) {
	return /^\/rm(?:@[^\s]+)?(?:\s|$)/i.test(String(text || '').trim());
}

async function handleRmCommand(message, env, ctx) {
	const chat = message?.chat;
	const chatId = chat?.id;
	const userId = getMessageActorId(message);

	// 私聊没有「群里的目标消息」，明确告知而不是静默 —— /rm 已在命令菜单明面上，
	// 静默会让人以为命令坏了。
	if (chat?.type === 'private') {
		await sendTelegramMessage(chatId, '❌ <b>请在群里使用 /rm</b>\n\n回复要删除的那条消息，再发送 <code>/rm</code>。');
		return;
	}
	if (!isConfiguredGroup(String(chatId))) return;   // 非配置群：不响应、不动

	// 先撤回命令本身：权限不足 / 参数缺失时，群里不会同时留下命令和提示两条消息。
	await deleteAuthorizedGroupCommandMessage(message, '/rm');

	const target = message.reply_to_message;
	if (!target?.message_id) {
		await sendFlashMessage(chatId, '❌ 请<b>回复</b>要删除的那条消息，再发 /rm', ctx);
		return;
	}

	// 权限：仅第一主人（主人 2026-10-02 定：这两条新指令只允许第一主人用）。
	// 曾经允许「第一主人 或 该群群主」，现已收紧 —— 二次确认权限的逻辑全部删掉，
	// 群主与普通管理员一律不放行。
	if (!isPrimaryOwner(userId)) {
		await sendFlashMessage(chatId, '❌ /rm 仅限第一主人使用', ctx);
		return;
	}

	const del = await deleteMessage(chatId, target.message_id);

	// 完整结果分两条通道（用项目现成的 replyToAdmin）：
	//   · 群内 = 5 秒闪屏回执。注意它有个规则：【只有第一主人执行时才发闪屏】，
	//     群主执行时群里保持安静（shouldSilenceAuthorizedGroupCommand）。
	//   · 私聊 = 完整审计通知发给【第一主人】，主人口径要求「完整结果返回给第一主人」，
	//     于是群主在群里操作时，主人依然能在私聊看到谁删了什么。
	const groupLabel = chat?.title
		? escapeHtml(String(chat.title)) + '（<code>' + escapeHtml(String(chatId)) + '</code>）'
		: '<code>' + escapeHtml(String(chatId)) + '</code>';
	const rawContent = String(target.text || target.caption || '').trim();
	const detailBase = [
		'🗑 <b>群内消息删除</b>',
		'',
		'群　　' + groupLabel,
		'操作人　' + formatUserReference(userId, message.from),
		'目标 ID　<code>' + escapeHtml(String(target.message_id)) + '</code>',
		'目标发送者　' + formatUserReference(target.from?.id, target.from),
		'目标内容　' + (rawContent ? escapeHtml(rawContent.slice(0, 200)) : '（非文本消息，无文字内容）'),
	];

	if (del?.ok) {
		await replyToAdmin(message, ctx, {
			flashText: '✅ 已删除目标消息',
			detailText: [...detailBase, '', '结果　　✅ 已删除'].join('\n'),
			isInGroup: true,
		});
	} else {
		// 常见原因：bot 缺「删除消息」权限 / 消息超 48 小时 / 消息已被人删掉
		const reason = toChineseErrorText(del?.error || '未知错误');
		await replyToAdmin(message, ctx, {
			flashText: '❌ 删除失败：' + escapeHtml(reason),
			detailText: [...detailBase, '', '结果　　❌ 删除失败 —— ' + escapeHtml(reason)].join('\n'),
			isInGroup: true,
		});
	}
}

// ===== /profile 资料卡（第1批 · 2026-10-01）=====
function isProfileCommand(text) {
	return /^\/profile(?:@[^\s]+)?(?:\s|$)/i.test(String(text || '').trim());
}

function isHealthCommand(text) {
	return /^\/health(?:@[^\s]+)?(?:\s|$)/i.test(String(text || '').trim());
}

// ===== /health 运行检查报告渲染 =====
// 每群一行：绿=全好，黄=能用但有缺口，红=有功能会坏。汇总只数「红」与「黄」两档。
function renderHealthReport(report) {
	const lines = ['🏥 <b>运行检查</b>', '', '━━━ <b>状态自检</b> ━━━'];
	for (const item of report.layer1 || []) {
		lines.push((item.ok === true ? '✅ ' : item.ok === null ? '⚠️ ' : '❌ ') + item.text);
	}

	const groups = report.layer2 || [];
	lines.push('', '━━━ <b>逐群体检</b>（' + report.total + ' 个配置群）━━━');
	if (!groups.length) {
		lines.push('（未配置群，或 bot 身份未取到，跳过第二层）');
	}
	let bad = 0, warn = 0;
	for (const g of groups) {
		// 拿不到群名（getChat 失败，多半是 bot 不在群）就不编一个「未命名」出来 ——
		// 那读起来像「群存在但没设名字」。空着，只留群 ID，靠 ID 对回配置。
		const name = g.title ? escapeHtml(g.title) + '　' : '';
		const id = '<code>' + escapeHtml(g.groupId) + '</code>';
		// bot 够不着这个群（getChat 或拉管理员列表失败）—— 一律红。
		// checkGroupHealth 里 present=false 必然伴随 error，所以合并成一个分支，不留只走一半的重复判断。
		if (!g.present) {
			bad += 1;
			lines.push('❌ ' + name + id + '　'
				+ (g.error ? escapeHtml(toChineseErrorText(g.error)) : 'bot 不在群内'));
			continue;
		}
		if (!g.isAdmin) { warn += 1; lines.push('⚠️ ' + name + id + '　在群但<b>不是管理员</b>（检测与处置都不生效）'); continue; }
		// 三权限：删 / 禁 / 邀。缺删或缺禁 = 有功能会坏（红）；只缺邀请 = 非致命（黄）。
		const del = g.canDelete ? '✓' : '✗';
		const rstr = g.canRestrict ? '✓' : '✗';
		const inv = g.canInvite ? '✓' : '✗';
		const flags = '删' + del + ' 禁' + rstr + ' 邀' + inv;
		if (!g.canDelete || !g.canRestrict) {
			bad += 1;
			const missing = [!g.canDelete ? '删除消息' : '', !g.canRestrict ? '封禁成员' : ''].filter(Boolean).join('、');
			lines.push('❌ ' + name + id + '　管理员　缺 <b>' + missing + '</b> 权限（' + flags + '）');
		} else if (!g.canInvite) {
			warn += 1;
			lines.push('⚠️ ' + name + id + '　管理员　缺邀请链接权限（' + flags + '）');
		} else {
			lines.push('✅ ' + name + id + '　管理员（' + flags + '）');
		}
	}

	lines.push('', '━━━ <b>汇总</b> ━━━');
	if (!groups.length) lines.push('仅完成状态自检。');
	else if (!bad && !warn) lines.push('✅ 全部 ' + groups.length + ' 个群正常（三权限齐全）');
	else {
		const parts = [];
		if (bad) parts.push('❌ <b>' + bad + '</b> 个群有功能会坏');
		if (warn) parts.push('⚠️ <b>' + warn + '</b> 个群有权限缺口');
		lines.push(parts.join('　') + '（共 ' + groups.length + ' 个群）');
	}
	return lines.join('\n');
}

// /health 运行检查：仅第一主人（要跨全部配置群拉管理员列表，是主人的自助工具）。
// 群内不撤回命令、不发闪屏，与 /profile 一致；非第一主人群内完全静默、私聊提示权限不足。
async function handleHealthCommand(message, env) {
	const userId = getMessageActorId(message);
	const isInGroup = message.chat?.type !== 'private';
	if (!isPrimaryOwner(userId)) {
		if (isInGroup) return true;   // 群内不暴露这条隐藏命令的存在
		await sendTelegramMessage(String(message.chat?.id || ''), '❌ <b>权限不足</b>\n\n/health 运行检查仅限第一主人使用。');
		return true;
	}
	const chatId = String(message.chat?.id || '');
	try {
		const report = await runHealthCheck(env);
		// 挂「返回群设置」：/health 本来就是仅第一主人的命令，与从菜单点进来的形态一致。
		await sendTelegramMessageChunks(chatId, renderHealthReport(report), buildSettingsBackKeyboard(chatId));
	} catch (error) {
		console.error('[运行检查] 执行失败:', error);
		await sendTelegramMessage(chatId, '❌ 运行检查失败：' + escapeHtml(toChineseErrorText(error.message || '未知错误')));
	}
	return true;
}

// 时间格式化：unix 秒 / 毫秒 / ISO 字符串 → 北京时间「YYYY-MM-DD HH:mm」。
// 固定 +8 小时：Workers 运行时区是 UTC，直接格式化会整体差 8 小时。
function formatBeijingTime(value) {
	if (value === null || value === undefined || value === '') return '未记录';
	let ms;
	if (typeof value === 'number') {
		ms = value < 1e12 ? value * 1000 : value;   // 兼容秒 / 毫秒两种精度
	} else {
		const parsed = Date.parse(String(value));
		if (!Number.isFinite(parsed)) return String(value);   // 认不出就原样返回，不猜
		ms = parsed;
	}
	const d = new Date(ms + 8 * 3600 * 1000);
	const z = (n) => String(n).padStart(2, '0');
	return d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate())
		+ ' ' + z(d.getUTCHours()) + ':' + z(d.getUTCMinutes());
}

// 读入群 / 退群 / 申请记录（表 stat_member_events 由第2批创建）。
// 表还没建时静默返回空 → /profile 显示「未记录」，绝不抛错打断整条命令。
// filterChatId：群内发命令时传当前配置群 → 时间线围绕本群执行（主人口径）；
//               私聊没有群上下文 → 传 undefined，原样返回跨群记录，不猜是哪个群。
async function readMemberEvents(env, userId, filterChatId) {
	if (!env?.DB) return [];
	try {
		const sql = filterChatId
			? 'SELECT kind, at, chat_id FROM stat_member_events WHERE user_id = ? AND chat_id = ? ORDER BY at DESC LIMIT 50'
			: 'SELECT kind, at, chat_id FROM stat_member_events WHERE user_id = ? ORDER BY at DESC LIMIT 50';
		const stmt = env.DB.prepare(sql);
		const bound = filterChatId ? stmt.bind(String(userId), String(filterChatId)) : stmt.bind(String(userId));
		const { results } = await bound.all();
		return Array.isArray(results) ? results : [];
	} catch (error) {
		return [];   // 表尚未创建（第2批才建）→ 当作无数据，不打断命令
	}
}

// 资料卡 + 时间线：/profile 的主体输出。
async function buildProfileBlock(env, groupId, tgid, isGroupChat = false) {
	const lines = ['👤 <b>资料卡</b>　TGID <code>' + escapeHtml(String(tgid)) + '</code>', ''];

	// ── 基本资料（fetchAdUserProfile 自带 5 分钟缓存，不额外烧请求）──
	const profile = await fetchAdUserProfile(tgid, {});
	const nick = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
	lines.push('<b>━━ 基本资料 ━━</b>');
	lines.push('昵称　　' + escapeHtml(nick || '未获取'));
	lines.push('用户名　' + (profile.username ? '@' + escapeHtml(profile.username) : '未获取'));
	lines.push('简介　　' + escapeHtml(profile.bio || (profile.bioFetched ? '（空）' : '未获取')));

	// ── 群内身份 ──
	// 只在【群内发命令】时显示：私聊没有群上下文，取 GROUP_IDS[0] 去查是拿一个
	// 与本人无关的群当结论，属于误导 —— 主人口径就是「私聊原样返回」。
	// 查之前先确认 bot 是该群管理员：Bot API 明写「只有 bot 是管理员才保证能查到他人状态」，
	// 权限不足时返回的任何状态都不可信，这正是「真的不在」与「查不到」的分界。
	const statusMap = { creator: '群主', administrator: '管理员', member: '成员', restricted: '受限成员', left: '已离群', kicked: '已踢出' };
	if (isGroupChat && groupId) {
		const groupTag = '（<code>' + escapeHtml(String(groupId)) + '</code>）';
		const botId = await getBotId();
		const botIsAdmin = botId ? await isAdminForAdDetection(groupId, String(botId)) : false;
		if (!botIsAdmin) {
			lines.push('群内身份　❌ 未能查询（bot 需在该群且为管理员）' + groupTag);
		} else {
			const st = await fetchAdMemberStatus(groupId, tgid);
			if (st) {
				// 拿到状态就是确定结论：left/kicked 即「真的不在」，不是查不到
				lines.push('群内身份　' + escapeHtml(statusMap[st] || st) + groupTag);
			} else {
				lines.push('群内身份　❌ 未能查询（API 未返回状态）' + groupTag);
			}
		}
	}

	// ── 时间线 ──
	// 群内发命令 → 围绕当前配置群；私聊 → 无群上下文，原样返回跨群记录。
	const evts = await readMemberEvents(env, tgid, isGroupChat ? groupId : undefined);
	const latest = (kind) => {
		const e = evts.find((x) => x?.kind === kind && Number(x.at) > 0);
		return e ? formatBeijingTime(e.at) : '未记录';
	};
	const joinCount = evts.filter((x) => x?.kind === 'join').length;
	const joinEv = evts.find((x) => x?.kind === 'join');
	lines.push('');
	lines.push('<b>━━ 时间线 ━━</b>');
	if (!isGroupChat) lines.push('<i>（私聊查询无群上下文，以下为跨群原样记录）</i>');
	lines.push('申请时间　' + latest('join_request') + '（群未开启入群审批则永不出现）');
	lines.push('入群时间　' + (joinEv ? formatBeijingTime(joinEv.at) : '未记录'));
	lines.push('退群时间　' + (latest('leave') !== '未记录' ? latest('leave') : latest('kicked')));
	// 任命管理员：MTProto 协议【不提供任命时间】，这一项永远是未记录。
	// 官方文档原文：channelParticipantAdmin 的 date = "When did the user join"（入群时间，
	// 2026-10-02 查 core.telegram.org/constructor/channelParticipantAdmin 确认），promoted_by
	// 只有「谁提的」没有「何时提的」，群主 ChannelParticipantCreator 连 date 都没有。
	// 所以不能拿入群时间冒充任命时间 —— 早期版本按「date=任命时间」把回填数据存成 kind='promote'
	// 是错的，已于同日把 D1 里 171 条 UPDATE 成 join。
	lines.push('任命管理员　未记录（MTProto 协议不提供任命时间）');
	const m = await readAdGroupMember(env, tgid);
	lines.push('最早发言　' + (Number(m?.first_seen) > 0 ? formatBeijingTime(m.first_seen) : '未记录'));
	lines.push('最后发言　' + (Number(m?.last_seen) > 0 ? formatBeijingTime(m.last_seen) : '未记录'));
	lines.push('总入群　　' + (joinCount > 0 ? joinCount + ' 次' : '未记录'));
	// 黑名单与 GKY 不在这里查：/check 与 /profile 都要，由调用方的
	// buildBanlistCheckResponse 统一查一次（GKY 是外部 HTTP，重复查浪费且更慢）。
	return lines;
}

async function handleProfileCommand(message, env, ctx) {
	const chat = message?.chat;
	const chatId = chat?.id;
	const userId = getMessageActorId(message);

	// 权限：仅第一主人（主人 2026-10-02 定）。原先同 /check（群内管理员也可查），现收紧。
	// 注意这会让 /profile 与 /check 权限不一致：群管理员仍能用 /check 查同一个人。
	if (!isPrimaryOwner(userId)) {
		if (chat?.type === 'private') {
			await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n/profile 仅限第一主人使用。');
		}
		return;
	}

	const rawArg = String(message.text || '').replace(/^\/profile(?:@[^\s]+)?\s*/i, '').trim();
	// TGID 来源：显式参数 > 被回复消息的发送者
	let tgid = /^\d+$/.test(rawArg) ? rawArg : '';
	if (!tgid && message.reply_to_message?.from?.id) tgid = String(message.reply_to_message.from.id);
	if (!tgid) {
		await sendTelegramMessage(chatId, [
			'👤 <b>资料卡</b> · 用法',
			'',
			'• <code>/profile TGID</code> — 查指定账号',
			'• 回复某条消息发 <code>/profile</code> — 查发信人',
			'',
			'（与 /check 同权限，显示资料、时间线、本地黑名单与 GKY 记录）',
		].join('\n'));
		return;
	}
	// 群内保留命令本身（与 /check 一致，不撤回），结果发在当前聊天。
	// 群内才有当前群上下文；私聊不指定群（原样返回，不拿 GROUP_IDS[0] 当结论）。
	const isGroupChat = chat?.type !== 'private';
	const groupId = isGroupChat && isConfiguredGroup(String(chatId)) ? String(chatId) : '';
	const profileLines = await buildProfileBlock(env, groupId, tgid, isGroupChat);
	// 黑名单 + GKY + 复制按钮走 /check 同一个函数：查一次，口径与 /check 完全一致。
	const response = await buildBanlistCheckResponse(tgid, { includeReviewAction: true, env });
	await sendTelegramMessageChunks(
		chatId,
		[...profileLines, '', response.text].join('\n'),
		response.replyMarkup || null
	);
	return;
}

// ===== 全体通知（/notice）=====
// 第一主人私聊 bot：先发 /notice → bot 提示可发什么 → 主人再发一条内容（文本/图片/视频/任意）
// → bot 预览 + 内联按钮二次确认 → 点「✅ 确认发送」才以 bot 身份群发到所有配置群。
// 仅第一主人可用；群内一律静默（不暴露命令存在）；内容与状态存 ad_scan_state，10 分钟失效。
const NOTICE_PENDING_KEY = 'notice_pending';
const NOTICE_PENDING_TTL_MS = 10 * 60 * 1000;   // 每一步 10 分钟内操作有效
const NOTICE_CONFIRM_DATA = 'notice:confirm';
const NOTICE_CANCEL_DATA = 'notice:cancel';

function isNoticeCommand(text) {
	return /^\/notice(?:@[^\s]+)?(?:\s|$)/i.test(String(text || '').trim());
}

// 复制一条消息到目标聊天（Telegram copyMessage）：以 bot 身份重发，不带「转发自」抬头，
// 保留原文文本/图片/排版。返回 { ok, error }。
async function copyMessageToChat(toChatId, fromChatId, messageId) {
	const url = `https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`;
	const body = { chat_id: toChatId, from_chat_id: fromChatId, message_id: Number(messageId) };
	try {
		const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		const result = await response.json();
		if (!response.ok || !result.ok) return { ok: false, error: result.description || `HTTP ${response.status}` };
		return { ok: true, result: result.result };
	} catch (error) {
		return { ok: false, error: error.message };
	}
}
// 读/写待发送通知状态。stage: 'awaiting'（等内容）| 'confirm'（等确认）。过期或空返回 null。
async function readNoticeState(env) {
	const raw = await readAdScanState(env, NOTICE_PENDING_KEY, '');
	let st = null;
	try { st = raw ? JSON.parse(raw) : null; } catch (_) { st = null; }
	if (!st || (Date.now() - Number(st.at || 0)) > NOTICE_PENDING_TTL_MS) return null;
	return st;
}
async function clearNoticeState(env) { await writeAdScanState(env, NOTICE_PENDING_KEY, ''); }

function noticeConfiguredGroupCount() {
	return [...new Set((GROUP_IDS || []).map((g) => String(g)).filter(Boolean))].length;
}

// 群发到所有配置群（去重）：一律用 copyMessage 原样搬运主人那条内容（文本/图片/视频都支持），
// 显示为 bot 自己发的、不带「转发自」抬头。逐群记录成败，失败原因转中文。
async function broadcastNoticeToGroups(env, pending) {
	const groups = [...new Set((GROUP_IDS || []).map((g) => String(g)).filter(Boolean))];
	const results = await mapWithConcurrency(groups, 5, async (groupId) => {
		const r = await copyMessageToChat(groupId, pending.srcChatId, pending.srcMsgId);
		return { groupId, ok: r?.ok === true, error: r?.error || '' };
	});
	const failures = results.filter((x) => !x.ok).map((x) => ({ groupId: x.groupId, error: x.error }));
	return { total: groups.length, ok: results.length - failures.length, failures };
}
// /notice 处理：仅第一主人私聊；群内一律静默。发 /notice 进入「等待内容」态。返回 true。
async function handleNoticeCommand(message, env, ctx) {
	const userId = getMessageActorId(message);
	if (message.chat?.type !== 'private') return true;   // 群内静默，不暴露命令存在
	const chatId = message.chat.id;
	if (!isPrimaryOwner(userId)) {
		await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n该命令仅限第一主人使用。');
		return true;
	}
	const arg = String(message.text || '').replace(/^\/notice(?:@[^\s]+)?\s*/i, '').trim();
	if (arg.toLowerCase() === 'cancel') {
		await clearNoticeState(env);
		await sendTelegramMessage(chatId, '🚫 已取消全体通知。');
		return true;
	}
	if (!(await adDetectionReady(env))) {
		await sendTelegramMessage(chatId, '❌ 存储未就绪，暂时无法使用全体通知，请稍后重试。');
		return true;
	}
	// 进入「等待内容」态：接下来第一主人在私聊发的下一条非命令消息即为通知内容。
	await writeAdScanState(env, NOTICE_PENDING_KEY, JSON.stringify({ stage: 'awaiting', at: Date.now() }));
	await sendTelegramMessage(chatId, [
		'📢 <b>全体通知</b>（将发往 <b>' + noticeConfiguredGroupCount() + '</b> 个配置群）',
		'',
		'请把要广播的内容<b>作为下一条消息发给我</b>：',
		'· 文本（支持排版）、图片、视频、文件、语音等任意消息都行',
		'· 我会以机器人身份原样发到各配置群',
		'',
		'发完我给你预览并出「✅ 确认发送」按钮，点了才真正群发。',
		'取消请发 /notice cancel（10 分钟未操作自动失效）。',
	].join('\n'));
	return true;
}
// 第一主人私聊、处于「等待内容」态时，把这条非命令消息当作通知内容，转入「等待确认」并出按钮。
// 命中返回 true（已消费该消息）。
async function maybeCaptureNoticeContent(message, env) {
	if (message?.chat?.type !== 'private') return false;
	if (!isPrimaryOwner(getMessageActorId(message))) return false;
	const st = await readNoticeState(env);
	if (!st || st.stage !== 'awaiting') return false;
	const chatId = message.chat.id;
	const msgId = Number(message.message_id);
	if (!msgId) return false;
	await writeAdScanState(env, NOTICE_PENDING_KEY, JSON.stringify({
		stage: 'confirm', srcChatId: String(chatId), srcMsgId: msgId, at: Date.now()
	}));
	const snippet = String(message.text || message.caption || '').trim();
	const previewLine = snippet
		? escapeHtml(snippet.slice(0, 300))
		: '（非文本消息：图片/视频/文件等，将按原样发送）';
	const keyboard = { inline_keyboard: [[
		{ text: '✅ 确认发送', callback_data: NOTICE_CONFIRM_DATA },
		{ text: '🚫 取消', callback_data: NOTICE_CANCEL_DATA }
	]] };
	await sendTelegramMessage(chatId, [
		'📢 <b>全体通知 · 确认</b>',
		'将发往 <b>' + noticeConfiguredGroupCount() + '</b> 个配置群，以机器人身份发送。',
		'',
		'<b>内容预览：</b>',
		previewLine,
		'',
		'确认无误请点下方「✅ 确认发送」。',
	].join('\n'), keyboard);
	return true;
}

// 「✅ 确认发送 / 🚫 取消」按钮回调。仅第一主人可操作。
async function handleNoticeCallback(callbackQuery, env) {
	const clickerId = String(callbackQuery?.from?.id || '');
	const data = String(callbackQuery?.data || '');
	const chatId = String(callbackQuery?.message?.chat?.id || clickerId);
	if (!isPrimaryOwner(clickerId)) { await answerAdVoteCallback(callbackQuery?.id, '仅第一主人可操作', true); return; }
	if (data === NOTICE_CANCEL_DATA) {
		await clearNoticeState(env);
		await answerAdVoteCallback(callbackQuery?.id, '已取消');
		await sendTelegramMessage(chatId, '🚫 已取消全体通知。');
		return;
	}
	const st = await readNoticeState(env);
	if (!st || st.stage !== 'confirm') {
		await answerAdVoteCallback(callbackQuery?.id, '通知已失效，请重新 /notice', true);
		return;
	}
	await answerAdVoteCallback(callbackQuery?.id, '开始群发…');
	const result = await broadcastNoticeToGroups(env, st);
	await clearNoticeState(env);
	const lines = ['<b>📢 全体通知已发送</b>', '成功 <b>' + result.ok + '</b> / ' + result.total + ' 个配置群'];
	if (result.failures.length) {
		lines.push('失败群：');
		for (const f of result.failures.slice(0, 10)) {
			lines.push('· <code>' + escapeHtml(f.groupId) + '</code>（' + escapeHtml(toChineseErrorText(f.error || '未知')) + '）');
		}
		if (result.failures.length > 10) lines.push('…等共 ' + result.failures.length + ' 个群失败');
	}
	await sendTelegramMessage(chatId, lines.join('\n'));
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

// 从 muteChatMember 抛出的 `HTTP error! status: 429, body: {...}` 里还原结构化失败字段，
// 供 shouldRetryTelegramMutationFailure / getTelegramMutationRetryDelayMs 判定是否重试。
// 消息里既没有 status 也没有 body → 是 fetch 自身抛的网络异常，按网络错误处理（可重试）。
function parseMuteFailure(error) {
	const message = String(error?.message || error || '');
	const statusMatch = message.match(/status:\s*(\d+)/);
	const bodyMatch = message.match(/body:\s*(\{[\s\S]*\})/);
	if (!statusMatch && !bodyMatch) return { networkError: true };
	let parsed = null;
	if (bodyMatch) {
		try { parsed = JSON.parse(bodyMatch[1]); } catch (_) { parsed = null; }
	}
	return {
		httpStatus: statusMatch ? Number(statusMatch[1]) : 0,
		errorCode: Number(parsed?.error_code) || 0,
		retryAfterSeconds: Number(parsed?.parameters?.retry_after) || 0
	};
}

// 禁言用：把 muteChatMember 的「成功返回 / 失败抛异常」包装成 { ok, error } 逐群结果，
// 与 banUserFromGroup 的返回形状对齐，供 applyGroupModeration 统一收集。
// 【重试与 banUserFromGroup 同规格】429 / 5xx / 网络异常各重试一次，否则 /ban 改禁言后
// 会丢掉踢出路径原有的限流重试保障 —— 同一条命令路径的可靠性不该因为换了处置方式而倒退。
// 注意 restrictChatMember 只能禁言【已在群里】的人；目标不在群时 Telegram 报错 → ok:false（预期，无法预禁言）。
async function muteUserInGroup(chatId, userId) {
	let lastError = null;
	let attempts = 0;
	for (let attempt = 1; attempt <= 2; attempt += 1) {
		attempts = attempt;
		try {
			await muteChatMember(chatId, userId);
			return { ok: true, attempts, retried: attempt > 1 };
		} catch (error) {
			lastError = error;
			if (attempt >= 2) break;
			const failure = parseMuteFailure(error);
			if (!shouldRetryTelegramMutationFailure(failure)) break;
			await new Promise((resolve) => setTimeout(resolve, getTelegramMutationRetryDelayMs(failure)));
		}
	}
	return {
		ok: false,
		error: lastError?.message || String(lastError || '失败'),
		attempts,
		retried: attempts > 1
	};
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
// 用 getChatAdministrators 拉群管理员列表本地匹配，比 getChatMember 更稳:
// - 不要求 bot 是该群管理员（仅要求 bot 在群里）
// - 不受 50+ 人群组限制
// - 不受匿名/隐藏管理员模式干扰
// 单群查询失败不阻塞后续群；任一群命中即返回 true。
async function checkIfUserIsAdmin(userId) {
	const userIdStr = String(userId);

	// 主人/副主人直接放行（最高权限，先于群管理员检查）
	if (isOwner(userIdStr)) {
		console.log(`[管理员鉴权] 用户 ${userId} 是主人/副主人 ✅`);
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
// 入群专用封禁线。【默认 0 = 与消息线完全一致，行为与加这个开关之前逐字相同】。
//
// 为什么默认不抬高：进群那一刻手里只有资料卡一份证据，理论上该比发言线更严
//（menshen 就这么做的 —— 冷判定单开更高的采信线 antiad_cold_conf=85，注释原话
//「这一步是在人刚进门时就限制他发言」）。但实测抬到 9 会先打掉一件事：
//  bio「读书会成员进群 t.me/+abcdefghij」= 7 分，正好卡在消息线 7 上，
//  原本进群即封（test_ad_detection 的端到端用例锁着），抬线后 7 < 9 就被放过 ——
//  而「进群那一刻就拦住、不等他发言」正是这个功能存在的理由。
// 两个目标在 7 分这个样本上不可兼得，主人定的口径是【先保住进群即封】。
//
// 想要更严的误伤保护时配 AD_JOIN_SCORE_THRESHOLD=9 即可，机制已经就位。
const DEFAULT_AD_JOIN_SCORE_THRESHOLD = 0;
const DEFAULT_AD_AI_SIMILARITY_THRESHOLD = 0.78;
const DEFAULT_AD_FINGERPRINT_MIN_CONFIDENCE = 0.6;

// 指纹直接封禁所需权重（低于此值只加分，不单独定罪）
const AD_FINGERPRINT_BAN_WEIGHT = 0.8;
// ===== 资料形状层 · 同模板批量号跨账号复用 =====
// 形状命中【只加分、不定罪】：本项目的形状库没有「全库零误封测试」那道兜底，
// 让它单独定罪等于新开一条零验证的封禁通道。加的分进既有阈值体系，
// 与评分层、指纹层同场竞技 —— 形状只作佐证，够不够线仍由原有阈值说了算。
const AD_PROFILE_SHAPE_SCORE = 3;
// 该形状至少被定罪过几次才参与。1 次 = 只有一个号栽过，可能就是误判；
// 2 次起才有「这是一套在复用的模板」的证据强度。
const AD_PROFILE_SHAPE_MIN_HITS = 2;
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

// ===== AI 多样本聚合（top-K）· 形态 E =====
//
// 【关掉时（0，也是默认）】旧行为：取全部样本相似度的 **max**，**一条越线即定罪**。
// 【打开时（K>0）】取最高的 K 条，其中**至少 MIN_HITS 条**达硬阈值才算 isMatch。
//
// · 治什么：#1615 那类「库里只有一条样本、且恰好边缘越线」——
//   豁免词已扣 6 分（得分 -4），AI 0.789 vs 阈值 0.78 **只超 0.009**，却封了 13 个群。
//   max 的本质是「取最不利的那一条」，top-K 把定罪从**单证**改成**多证**。
// · 治不了什么：@svipultra 那类「**同质样本扎堆**」——库里 5 条全是同一昵称，
//   K 条都超线照样中。top-K 的分母是**样本条数**，而问题是**证据同质**：
//   条数多 ≠ 独立证据多。那一类靠 aiNameStripVeto（昵称剥离否证）兜，**两者必须同时保留**。
// · fallback：**可比样本总数 < K 时退回 max** —— 新广告刚学进 1 条样本时保住召回。
//   两个 fallback 条件（超线数 < K / 样本数 < K）**都救不了同质扎堆**，故只按样本数回退。
// · 零额外 AI 推理：cosineSimilarity 在原循环里已全部算过，只改排序策略；回退 = 改回 0。
// · 两个调用点（主判定 14475 + 昵称剥离复验 14513）走同一函数，天然同步 ——
//   若只在一处生效会形成「主判定用 top-K、复验用 max」的逻辑分叉。
// · 达标门槛 = **top-K 里过半**（K=3→2、K=5→3），随 K 自动走、不单独配 ——
//   K 调了门槛还停在旧值会悄悄失衡。实际取值走 config.aiTopK（环境变量 AD_AI_TOP_K）。
const AD_AI_TOP_K = 0;            // 0 = 关闭（现行为）；建议 K=3

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

// 可疑信号下的 bio 冷却期：闸一【本次真拿到正分判据】时，把上面那个分档冷却压到 10 分钟。
//
// 【为什么必须有它】线上实测（2026-10-07）：最近 15 个人工封的号里 11 个入群判定
// verdict=pass，理由清一色「+2 昵称为机器生成型西方全名 / -1 名称无 emoji 且无 Bio /
// 语义 0.4x」，而他们在 ad_pending_snapshots 与 ad_user_screening 里都是 0 条 ——
// 闸一评分不够、闸二又正处在入群时记下的 bio 冷却期内不进，四层判据与第⑥层一条都
// 跑不到，最后只能人工封。广告号进群时 bio 常常还是空的，那次「查过」不该把之后
// 整整两小时的发言都挡在深判之外。
//
// 【为什么不直接取消冷却期】0 正分的普通聊天必须原样走原分档，否则「稳态下每条消息
// 0 个 Telegram 请求」就没了 —— test_kick 的稳定态断言用的正是 0 正分的普通文本。
const AD_SUSPECT_BIO_COOLDOWN_SECONDS = 10 * 60;
// 与前置分档的 AD_REASON_POSITIVE_RE 刻意不同：这里必须排除 +0。评分层的 add 没有
// delta 保护，分数为 0 的判据照样 push 进 reasons（见 scoreAdForwardChat 的
// 「来源频道名为随机字母串」，AD_RANDOM_CHANNEL_SCORE = 0），而 0 分不构成「有特征」。
const AD_POSITIVE_SIGNAL_RE = /^\+[1-9]\d*\s/;

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
// === 第四路：生成式深度判定（LLM）===
//
// 【为什么必须有这一路】前三层全是【查表】性质：词表要列到才得分、指纹库要学过
// 才命中、bge-m3 语义层要样本库里有近似才超阈值。样本外的新话术一律 0 分 ——
// 线上实测一条 `来替我收米 一天9千` 拿 0 分：`收米` 在全文件出现 0 次，
// `AD_MONEY_SOLICIT_RE` 有「收款/收钱」却没有「收米」，AI 语义层也没有相似样本。
// 生成式模型不用查表就知道「收米」= 收钱，这正是 menshen 冷判定一路送 AI
// 而不漏的原因（它的提示词里明写「赚米=赚钱」这类同音变形要先还原）。
//
// 【定位】只在前三层都【没能定罪】时补位，命中的理由写进 reasons 与 `/pending` 快照，
// 与其它判据一样可用 `/ignore` 纠错。它是第四路，不是替代前三层：
// 前三层零成本，这一路要花 Neurons，所以挂每日上限 + 同载荷内存去重。
//
// 【模型选型】qwen3-30b-a3b 是 MoE（30B 总参、3B 激活），中文广告语料能力远强于
// llama-3.2-1b 这类 1B 小模型 —— 判据本身就是中文同音变形，模型认不出变形等于白花钱。
// 换模型直接改环境变量，不动代码。
const AD_LLM_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
// 【每日上限：2026-10-11 从 200 提到 1000，并拆成三个池】
//
// 【旧配置的病】三个调用点共用一个 200 次的池，而其中两个轨（入群筛查、cron bio 扫描）
// 【没有触发门槛】，每个新成员 / 每个扫描对象都送一次，且送进去的载荷 message 恒为空。
// 实测 /adstats：10:58 就 200/200 打满，模型判为广告 0 次 —— 不是模型保守，
// 是额度全被「正常新用户」的空载荷吃光了，消息路径（广告真正出现的地方）一次都轮不到。
// 注释里那句「日限 300 人，LLM 每日上限还绰绰有余」从一开始就不成立：
// cron 一条轨就要 300 次，而总池只有 200 次。
//
// 【成本账（官方定价页 2026-10-11 查）】Workers Paid 计划每天含 10,000 Neurons 免费额度，
// 超出部分 $0.011 / 1,000 Neurons —— 本账号是付费版，额度可以按需往外买，不存在硬顶。
// qwen3-30b-a3b-fp8 = input 4,625 / output 30,475 每百万 token；
// 一次调用按 input ~1,500 token + output ~100 token 折算 ≈ 10 Neurons。
//   1,000 次  ≈ 10,000 Neurons（正好顶免费额度，$0）
//   2,000 次  ≈ 20,000 Neurons（超出 10,000 → $0.11/天 ≈ $3.3/月）
// 所以真正的约束【不是钱】，是与其他 Workers AI 调用共用同一个 10,000 免费额度池 ——
// moondream 视觉识别（头像 50 + 正文图 300，27,273/M input token）按满载 ≈ 15,750 Neurons，
// 它自己就吃穿了免费额度。这也是 LLM 这边【必须自带保底额度】的理由：
// 不能等视觉识别用完再捡剩下的，那正是旧配置 200 次早早就空转的原因。
//
// 【三个池各管一轨】消息路径（闸一 + 闸二）是广告真正出现的地方，给 500 次保底；
// 入群筛查 300 次；cron bio 扫描 100 次。
// 【cron 的 LLM 池给 100，但 AD_SCAN_DAILY_LIMIT 仍是 300，不降】——
// 那一轨扫 300 个人是靠 getChat + 评分层抓「bio 改成广告的潜伏号」，这条能力
// 与 LLM 无关：bio 命中业务词 + 交易动词的号，前三层就定罪了，根本走不到第四路。
// LLM 只是给前三层没定罪的那部分补位，100 次够用；把扫描日限一起降下来，
// 等于为了给补位省额度，先把主力判据的覆盖面积砍掉九成。
// 0 = 关闭本路（只跑前三层，零 Neurons），与 AD_AVATAR_VISION_DAILY 的开关语义一致。
const AD_LLM_DAILY = 1000;
// 各池默认值。三个相加必须 < AD_LLM_DAILY，否则总闸会先一步拦掉后面的池。
// 留 100 次余量：某池突发打满时不至于把总闸撞上、连带断掉别的池。
const AD_LLM_DAILY_MESSAGE = 500;
const AD_LLM_DAILY_JOIN = 300;
const AD_LLM_DAILY_CRON = 100;

// 【解析失败熔断】连续这么多次取不到模型回答，当天直接关掉第⑥层，一次都不再调。
//
// 【为什么必须有它】2026-10-11 线上真实事故：取模型回答的字段名写错了
//（Workers AI 对 chat 模型返回 choices[0].message.content，代码只认 response / result），
// 结果每一次调用都把答案当成 "[object Object]" 丢掉 —— 276 次调用、76 次解析失败、
// 每一次都是白烧 Neurons，而且【这个失败从上线到今天没有任何机制能发现它】。
// 分池、每日上限、同载荷去重，没有一道闸能挡住「调用成功但取值取错」这种失败：
// 额度照扣、计数照涨、判定照常返回 null，一切看起来都正常。
// 所以必须有一道【以失败本身为触发条件】的闸：连着失败就说明这条链路坏了，
// 坏掉的时候继续花钱不是谨慎，是浪费。
//
// 【20 这个数怎么来的】正常波动的解析失败（模型偶尔不守 JSON 格式、thinking 太长
// 被 max_tokens 截断）是零星的，一天几十次里夹着几次；连着 20 次一次都没成功，
// 已经不是波动而是链路故障 —— 这时停掉它，主人看 /adstats 一眼就知道该来查了。
const AD_LLM_FAIL_BREAK = 20;
// 【置信度线为什么是 0.85】对齐 menshen 冷判定的 antiad_cold_conf 采信线：
// 它的注释写明「进群画像的证据比一条具体消息少得多」，所以宁可放过也不误伤。
// 低于线的一律只进观察、不封 —— 模型输出「是广告」却只有 0.5 把握是常态。
const AD_LLM_CONF = 0.85;
// 观察线：命中但没到采信线时提到这一档（写观察窗口，窗口内再发即累加）。
// 比 AD_OBSERVATION_SCORE（5）更高一档，因为这里是「模型怀疑」不是「词表命中」。
const AD_LLM_OBSERVE_CONF = 0.6;
const AD_LLM_PROMPT = '你是 Telegram 群组的反广告审核员。给你一份账号资料与它刚发出的消息，'
	+ '判断这是不是广告号或引流号。\n'
	+ '判据只有一条：username、first_name、last_name、bio、message 里是否写着推广文案、'
	+ '收益承诺、引流话术或价目。写着的就是广告。\n'
	+ '中文广告常靠变形规避：形近字或同音字替换（看煮页=看主页、赚米=赚钱、收米=收钱、'
	+ '米=钱、薇信=微信、飞机=Telegram）、字母与数字互替（曰入5ooo+=日入5000+）、'
	+ '拼音缩写、空格拆词 —— 先还原本意再判断。\n'
	+ 't.me/+ 与 t.me/joinchat 开头的私密群邀请链接几乎只用于引流；'
	+ '「看我主页」「私信我」这类把人导向账号资料的指引同理。\n'
	+ '反过来，资料平平无奇、只有普通名字、或只写了兴趣爱好与所在地的，是正常用户。'
	+ '没有用户名、没有简介、名字是随机字符、message 为空都不构成怀疑理由 —— 大量正常人就是这样。'
	+ '拿不准就判 false，这一步会直接影响封禁，宁可放过也不要误伤。\n'
	+ '只输出 JSON，不要任何其它文字，格式：{"ad":true 或 false,'
	+ '"confidence":0.0到1.0 的小数,"reason":"一句话中文理由，指出具体是哪个字段的什么内容"}';
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
	'面交', '当面交易',
	// 促销招揽（2026-10-05 主人截图名片漏检后补）：「最新18系列上新 水果专卖店」
	// 「七折出17 pro max 看我简介」两条在全部词表里逐词零命中、得 0 分放行。
	// 这两个是【招揽/促销动作】，单独出现不算证据（「我们店上新了」不会命中），
	// 必须与 AD_BUSINESS_KEYWORDS 的行业词同现才凑成形态 A，门槛与其它动词完全一致。
	'上新', '七折'
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
	'假钞', '假币',
	// 行业指向（2026-10-05 名片②④漏检后补，与 AD_TRADE_VERBS 的「上新」「七折」配对）。
	// 「专卖店」是零售形态词；「pro max」是具体商品型号 —— 两者都只作行业指向，
	// 单独出现【不计分不封禁】，仍要招揽动词同现才构成形态 A（「我买了 pro max」不会命中）。
	'专卖店', 'pro max',
	// —— 2026-10-11 主人截图的两条名片广告逐词实测后补 ——
	// Rachel「新澳 🔥 六合彩内幕发布群」：六合彩 / 内幕 / 发布群【四张词表零命中】→ 0 分；
	// Amani「🔥 代开增值税发票 另高价收发票粉 🔥」：发票 / 增值税 / 代开 / 票粉零命中，
	// 只有「高价收」命中交易动词 → 单类词不计分，净 3 分（首尾对称 emoji）放行。
	// 两条都被别的机器人删了，本项目一条都没反应 —— 缺的不是判据链路，是这几个词。
	//
	// 【误封面说明】「内幕」「发票」在正常语境确实会出现（股市群聊内幕、报销聊开发票），
	// 所以它们只作行业指向、单独出现不计分；名片那条定罪通道另有三重门槛
	//（必须是名片消息 + 显示名不像人名 + 命中词），普通正文里说「帮我开张发票」不会命中任何东西。
	'六合彩', '开奖', '内幕', '发票', '增值税', '代开', '普票', '专票', '票粉',
	// 色情引流补词：清单样本里「假钞嫖娼」「假钞玩妹」逐词实测零命中 ——
	// 表里有「约炮 / 操逼 / 楼凤」这类黑话，却没有最直白的这两个词。
	'嫖娼', '玩妹'
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

// ===== 广告语境下失效的豁免词 =====
//
// 主人 2026-09-08 加 't.me' / '代理' 进豁免的理由成立且继续有效：正常人分享 Telegram
// 链接、技术群聊「反向代理」都是日常，一刀切取消豁免必然大面积误封。
//
// 但实测（2026-10-05 真实样本 Lisa Ka）暴露了另一面：她的简介是
//   `https://t.me/cyy42Y4H2DgyZGNI 进群了解项目 一天8000!`
// —— 这不是私有邀请链接（t.me/+、joinchat 那条剔除已存在，管不到它），
// 于是命中 't.me' 豁免直接 -3，**广告简介的得分比不查简介还低**（2 → -1），
// 豁免词从「保护正常人」变成了「广告号的挡箭牌」。
//
// 【为什么是条件化而不是删词】删词会重演误封；这里改成「语境判定」：
// 只有当文案里同时出现明确的招揽特征时，这两条豁免才算数失效，
// 纯技术讨论一个字都不受影响。而且失效只是【不再减分】——
// 定罪仍要过原有的形态门槛（招揽×业务同现 / 总分撞线），不会变成单词封禁。
const AD_EXEMPT_CANCEL_WORDS = new Set(['t.me', '代理']);// 广告语境：邀请链接形态 + 招揽动词 + 金额话术 + 灰产行业词，命中任一即认为
// 「这里不是单纯的技术讨论」。刻意写得保守 —— 漏一个词只是继续豁免（漏放），
// 误命中一个只会取消 -3 减分（仍需其它证据才定罪），两个方向的代价都不对称。
// 广告语境：只认【强信号】，刻意【不含任何链接形态，也不含「进群」这类普通词】。
//
// 两次实测教训，各砍掉一档：
//   ① 链接形态（t.me/+、joinchat）归上面的 privateInvite 逻辑 —— 那套「+7 但可被豁免
//      抵消、宁可放过技术群主」的缓冲是有意设计，塞进来会直接冲破它。
//   ② 「进群 / 入群 / 拉群 / 看主页 / 出货 / 批发」这类日常词也删了 ——
//      实测技术群主的简介「CDN 技术交流，进群 t.me/+…」正含「进群」，
//      被判广告语境 → 豁免失效 → 7 分定罪，6 条防误封断言当场变红。
// 留下的只有广告几乎独占的写法：金额承诺、灰产词、强招揽构词。
// Lisa 的简介「…进群了解项目 一天8000!」靠「一天8000」命中；
// 「招代理 一天5000」靠「招代理」命中 —— 去掉普通词后样本照样全中。
const AD_EXEMPT_CANCEL_RE = new RegExp(
	'一天\\d|日入\\d|月入\\d|日赚\\d|赚\\d|赚一万|稳赚|躺赚|暴富|躺平赚'
	+ '|招代理|做代理|收代理|代理价|一级代理'
	+ '|带单|跟单|上分|回血|包赢|包赢包赔'
	+ '|假钞|假币|洗钱|跑分|代收|代付|过机|卡料|上分平台'
	, 'i');

// 返回「广告语境下仍然生效」的豁免命中。
//
// 【为什么是整张表失效，而不是只挑 t.me / 代理】实测第二次（同一批真实样本）又冒出
// 第三个漏网的：Lisa 的随机用户名 `cyy42Y4H2Dgy` 小写后含 `h2`，被 countAdKeywordHits
// 当成 TLS 协议词吃掉 -3 —— 只挑几个词永远会有下一个子串撞进来。既然上面那条广告语境
// 正则本身足够严（邀请链接 / 招揽动词 / 金额话术 / 灰产词，命中任一才算），那就让
// 整张豁免表在这类文案上一起失效。
//
// 【为什么这样做不会变成误封】这里只撤销 -3 减分，**不加任何分**；定罪仍要过原有的
// 形态门槛（招揽×业务同现 / 总分撞线 / 身份硬构词）。最坏情况是「豁免没兜住但仍需
// 其它证据才封」，而不是「命中一个词就封」。
//
// 剔除情况写进 reasons —— 主人复核时必须能看出「为什么这次豁免没生效」。
function dropAdContextExempt(exemptHits, source, reasons) {
	if (!Array.isArray(exemptHits) || !exemptHits.length) return exemptHits;
	const text = String(source || '');
	if (!AD_EXEMPT_CANCEL_RE.test(text)) return exemptHits;
	if (Array.isArray(reasons)) {
		reasons.push('（广告语境，豁免词整体失效：' + exemptHits.slice(0, 3).join('/') + ' 不再减免，仅撤销减分不加分）');
	}
	return [];
}

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
// 【2026-09-12 三张触发词表全部清空 —— 主人定的口径】
//   封禁 = /ban 或引用回复 /spam；解封 = /unban。没有第三条路。
// 打字触发这套机制从一开始就是多余的：/spam 已经是明确无歧义的指令，
// 而「在群里打某几个字就封人」每一次都是误封风险，且词表怎么调都调不对 ——
//   · 初版收单词「广告」「垃圾」「封了」→ 管理员一句吐槽封掉 14 个群；
//   · 收紧为完整短语「这是广告」→ 主人自己在群里说「是广告」又触发了一次。
// 「是广告」「这是广告」本就是日常讨论会说的【陈述句】，任何词表都无法区分
// 「我在评论这条消息」和「我要封这个人」。故三张表一并清空，不再保留任何字面量。
//
// 【学习功能完全不受影响】/spam 引用照样学指纹 + AI 样本，/learnlast 照样学。
// 清空的只是「打字即触发处置」这条路，与学什么、谁能学无关。
// 保留三个空数组而不删除变量：classifyAdReplyIntent 与 handleAdReplyLearning
// 仍在引用它们，空表下 classifyAdReplyIntent 恒返回 ''，回复学习整条路径自然静默。
const AD_REPLY_LEARN_TRIGGERS = [];
const AD_REPLY_LEARN_TRIGGER_PATTERNS = [];
const AD_REPLY_LEARN_NEGATORS = [];

// 指纹类型白名单：/addword 只接受这五类，防止脏类型污染指纹库。
// 【方案 A】'username' 保留在列表里【仅为兼容历史数据】—— loadAdFingerprints 仍要能
// 读出库里的旧 username 行交给 markAdFingerprintFalsePositive 清理；
// 但 matchAdFingerprints 会跳过它们、addAdFingerprint 也拒绝新写入。
// 【'phone' · 2026-10-11 新增】名片广告的复用键，只比对名片里的手机号，不扫 haystack。
const AD_FINGERPRINT_TYPES = ['keyword', 'domain', 'username', 'bio', 'phone'];

// ===== 权限人 username 永不学习白名单（2026-09-10 主人下令）=====
// 主人 / 副主人的 @handle 绝不允许进指纹库。
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

// 解析只读资料群名单：逗号分隔（半角 , 与全角 ， 均可），格式与 GROUP_ID 一致。
// 用途单一 —— 只给 /admins 多几个可查资料的群，让不在任何治理群里的权限人也能显示
// 昵称 / 用户名 / 来源群（Telegram Bot API 只能查 bot 所在群的成员，这是唯一绕法）。
//
// 【安全边界】返回值只被 resolvePermissionUserProfiles 使用，绝不并入 GROUP_IDS：
// isConfiguredGroup 看不到它，于是广告检测、封禁、命令鉴权、/purge、/ad 投票
// 全部天然隔离 —— 加进来的群不会被治理，群里的管理员也不会因此获得任何权限。
// 剔除已在 GROUP_ID 里的群：那些群本来就在遍历范围内，重复只是多花一次请求。
function parseProfileLookupGroups(raw, configuredGroupIds = []) {
	if (raw == null || String(raw).trim() === '') return [];
	const configured = new Set((configuredGroupIds || []).map((id) => String(id)));
	const list = String(raw)
		.split(/[,，]/)
		.map((id) => id.trim())
		// 群 / 频道 ID 必须是负数（-100 开头的超级群或 -xxx 的普通群）。
		// 拦掉正数与空串：正数是用户 ID，传进 getChatAdministrators 只会白报错。
		.filter((id) => /^-\d+$/.test(id))
		.filter((id) => !configured.has(id));
	return [...new Set(list)];
}

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
// ===== emoji 伪装骨架（批次 B-1）=====
// 广告把「点击查看」写成「点⚔️查」「点💰看」—— emoji 插进词的中间，
// 词表按【连续字】匹配就直接失败。主人给的六张正文样本里 4/4 都是这个结尾，
// 而现有的去混淆拦不住它，两个原因：
//   ① 分隔符表里根本没有 emoji（AD_CHAR_SPLIT_SEP_STRICT / _LOOSE 都不含）
//   ② 签名要求「连续 ≥3 组 CJK + 分隔符」，而「点⚔️查」只有 1 组，够不着门槛
// 所以这一档判的是【规避行为本身】（用 emoji 切断关键词），不判 emoji 是什么 ——
// emoji 内容随时换、包也随时换，切断这个词的动作不会变。
//
// 字符类要同时覆盖三种：Emoji_Presentation 属性字、☀-➿ 字面范围（⚔ U+2694 落在这里）、
// 1F000-1FAFF（💰 U+1F4B0 这类）以及变体选择符 FE0F / FE0E ——
// 漏掉 FE0F 会在「点⚔️查」的 ⚔ 和 查 之间断开，整条正则永远匹配不上。
const AD_EMOJI_SPLICE_RE = /点(?:\p{Emoji_Presentation}|[☀-➿]|[\u{1F000}-\u{1FAFF}]|[\uFE0E\uFE0F]){1,6}[看查]/u;
// 单证不定分：正常人也会发「点👍看教程」。计分必须同时有承诺/招揽语境。
const AD_EMOJI_SPLICE_SCORE = 3;
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
		// 入群封禁线。默认 0 = 沿用 scoreThreshold（见 DEFAULT_AD_JOIN_SCORE_THRESHOLD）。
		// screenAdJoinMember 里还会与 scoreThreshold 取 max，保证「进群」永远不比
		//「发言」更容易被封 —— 配得比消息线还低也不会松。
		joinScoreThreshold: pickInt(env.AD_JOIN_SCORE_THRESHOLD, DEFAULT_AD_JOIN_SCORE_THRESHOLD, 0, 100),
		observationScore: pickInt(env.AD_OBSERVATION_SCORE, DEFAULT_AD_OBSERVATION_SCORE, 1, 100),
		observationHours: pickInt(env.AD_OBSERVATION_HOURS, DEFAULT_AD_OBSERVATION_HOURS, 1, 720),
		aiSimilarityThreshold: pickFloat(env.AD_AI_SIMILARITY_THRESHOLD, DEFAULT_AD_AI_SIMILARITY_THRESHOLD, 0.1, 1),
		// 形态 E：AI 多样本聚合的 K。0 = 关闭（现行为 max 单证定罪，也是默认值）；建议 3。
		// 走 env 而非常量：线上可直接开关 A/B，不必改代码重新部署（见 AD_AI_TOP_K 上方说明）。
		aiTopK: pickInt(env.AD_AI_TOP_K, AD_AI_TOP_K, 0, 50),
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
		})(),
		// 头像视觉识别的每日张数上限（0 = 只跑 L1 指纹库，不调模型）。
		// 免费层每天 10,000 Neurons 且超限【直接报错】，所以默认给个保守值，
		// 并允许主人先设 0 关掉 L2、确认 L1 效果后再开 —— 两层可独立灰度。
		avatarVisionDaily: pickInt(env.AD_AVATAR_VISION_DAILY, AD_AVATAR_VISION_DAILY, 0, 500),
		// 正文图片视觉识别的每日张数上限（0 = 关闭 L2，只保留 L1 指纹查表）。
		// 上限比头像宽一个量级（付费层超限是计费不是报错），理由见 AD_IMAGE_VISION_DAILY。
		imageVisionDaily: pickInt(env.AD_IMAGE_VISION_DAILY, AD_IMAGE_VISION_DAILY, 0, 5000),
		// 生成式深度判定的【总】每日次数上限（0 = 关闭本路，只跑前三层）。
		// 2026-10-11 从 200 提到 1000，并拆出下面三个分池 —— 详见 AD_LLM_DAILY 的成本账。
		llmDaily: pickInt(env.AD_LLM_DAILY, AD_LLM_DAILY, 0, 5000),
		// 三个分池：谁消耗额度由哪个池记账，互不挤占。
		// 环境变量名固定，改数不用改代码；任一池填 0 = 关掉那一路的 LLM（其余照跑）。
		llmDailyMessage: pickInt(env.AD_LLM_DAILY_MESSAGE, AD_LLM_DAILY_MESSAGE, 0, 5000),
		llmDailyJoin: pickInt(env.AD_LLM_DAILY_JOIN, AD_LLM_DAILY_JOIN, 0, 5000),
		llmDailyCron: pickInt(env.AD_LLM_DAILY_CRON, AD_LLM_DAILY_CRON, 0, 5000),
		// 采信线：命中且置信度 ≥ 此值才封，低于它只进观察。见 AD_LLM_CONF 说明。
		llmConf: pickFloat(env.AD_LLM_CONF, AD_LLM_CONF, 0.5, 1),
		// 换模型只改这个环境变量，不动代码（与 AD_EMBEDDING_MODEL 必须写死在代码里不同：
		// 嵌入模型与向量维度绑定，LLM 模型没有维度包袱）。
		llmModel: String(env.AD_LLM_MODEL || AD_LLM_MODEL).trim() || AD_LLM_MODEL
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
		'ad_scan_state',
		'ad_learn_snapshots',
		'ad_avatars',
		'ad_profile_shapes',
		'ad_images',
		'ad_badges'
	]);
}

// 建立广告检测的 14 张 D1 表（完整性复验另列 13 张，ad_spam_texts 按需建、不参与复验）。范式与 ensureAdVoteTables 一致：
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
			await runD1SchemaStatement(env, 'ad_group_members', 'CREATE TABLE IF NOT EXISTS ad_group_members (user_id TEXT PRIMARY KEY, chat_id TEXT, first_name TEXT, last_name TEXT, username TEXT, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, bio_checked_at INTEGER NOT NULL DEFAULT 0, profile_hash TEXT NOT NULL DEFAULT \'\', last_verdict TEXT NOT NULL DEFAULT \'\')');
			// 扫描按 bio_checked_at 升序取「最久没查过的人」，这个索引是 cron 的主查询路径。
			await runD1SchemaStatement(env, 'idx_ad_members_bio_checked', 'CREATE INDEX IF NOT EXISTS idx_ad_members_bio_checked ON ad_group_members (bio_checked_at)', { optional: true });
			// ===== 变化门所需的两列（bio 未变则跳过指纹与 AI 层）=====
			// 【必须先加列】：存量名册没有这两列，CREATE TABLE IF NOT EXISTS 对已存在的表
			// 完全无效，漏了这一步老部署会在运行期报 no such column，而报错被 catch 吞掉
			// 之后表现是「变化门静默失效、每轮照旧全量送 AI」——看不出哪里断了。
			// 【先判表再判列】：表不存在 = 首次建表，上面的 CREATE 已带齐两列，无列可迁；
			// 此时若照旧跑两条 PRAGMA 探测，会把「稳定态核心 SQL ≤ 3 条」那条断言撞红 ——
			// 断言的过滤器只豁免 sqlite_master 这类一次性建表探测，认不出 PRAGMA。
			// d1TableExists 正走 sqlite_master，属被豁免的一次性探测，且老库缺列时仍会进列检查。
			const membersTableExists = await d1TableExists(env, 'ad_group_members');
			for (const [column, sql] of [
				['profile_hash', 'ALTER TABLE ad_group_members ADD COLUMN profile_hash TEXT NOT NULL DEFAULT \'\';'],
				['last_verdict', 'ALTER TABLE ad_group_members ADD COLUMN last_verdict TEXT NOT NULL DEFAULT \'\';']
			]) {
				try {
					if (membersTableExists && !(await d1ColumnExists(env, 'ad_group_members', column))) {
						await runD1SchemaStatement(env, 'ad_group_members.' + column, sql);
					}
				} catch (error) {
					const message = formatD1SchemaError(error).toLowerCase();
					if (!message.includes('duplicate') && !message.includes('exists')) {
						throw error;
					}
				}
			}

			await runD1SchemaStatement(env, 'idx_ad_members_last_seen', 'CREATE INDEX IF NOT EXISTS idx_ad_members_last_seen ON ad_group_members (last_seen)', { optional: true });

			// 定时扫描的跨次状态（当日已扫计数、当日日期戳）。
			// 不复用 schema_meta：那张表语义是「迁移版本」，混入运行期状态会让
			// d1AdDetectionTablesExist 之类的完整性检查难以判断。单独一张 key-value 表最省事。
			// 【没有游标列】—— 扫描顺序由 bio_checked_at ASC 决定，查过就把时间戳推到现在，
			// 于是它自动排到队尾。这是自平衡的，不需要显式游标，也不会因为增删行而错位。
			await runD1SchemaStatement(env, 'ad_scan_state', 'CREATE TABLE IF NOT EXISTS ad_scan_state (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL)');
			// /recent 冻结快照：供 /learnlast 按固定序号引用，根治序号漂移。
			// 【为什么必须冻结】/recent 展示的是 moderation_messages 的实时切片，
			// 而那张表被每条群消息持续写入并按容量剪枝。若 /learnlast 再查一次实时数据，
			// 期间进来的新消息会把列表整体挤动 —— 主人看到的「3 号」和实际学到的不是同一条。
			// 旧代码专门治过这个坑，此处照搬：/recent 写快照，/learnlast 只读快照。
			await runD1SchemaStatement(env, 'ad_learn_snapshots', 'CREATE TABLE IF NOT EXISTS ad_learn_snapshots (owner_id TEXT PRIMARY KEY, items TEXT NOT NULL, scope TEXT, created_at INTEGER NOT NULL)');

			// 头像指纹库。主键用 ChatPhoto.big_file_unique_id —— 官方原文：该标识
			// 「the same over time and for different bots」，换图才变，跨 bot 可比对，
			// 且「can't be used to download」（下载要用 file_id，只在换图前有效）。
			// 二者职责分明：unique_id 做指纹主键，file_id 只在 L2 下载那一瞬用一次。
			// verdict: pending=未判 / ad=广告头像 / clean=已判干净（降权，不参与加分）。
			// hits: 用过这个头像的人里被定罪的次数 —— 头像会被盗用，靠累积次数区分
			// 「这张图本身是广告素材」与「有人碰巧用了同一张图」。
			// file_id 是【唯一一次能下载】的句柄：unique_id 按官方定义不能下载，
			// file_id 又只在换图前有效，所以只在视觉识别那一刻用，不参与比对。
			await runD1SchemaStatement(env, 'ad_avatars', 'CREATE TABLE IF NOT EXISTS ad_avatars (file_unique_id TEXT PRIMARY KEY, verdict TEXT NOT NULL DEFAULT \'pending\', hits INTEGER NOT NULL DEFAULT 0, file_id TEXT, source TEXT, last_user_id TEXT, vision_checked_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
			await runD1SchemaStatement(env, 'idx_ad_avatars_verdict', 'CREATE INDEX IF NOT EXISTS idx_ad_avatars_verdict ON ad_avatars (verdict)', { optional: true });

			// 正文图片指纹库。主键同样是 file_unique_id —— 与头像那张表同源同义，
			// 但【为什么它在这里更值钱】：头像一个人一张、换得还勤，而广告素材是
			// 批量复投的（同一张引流图会被一群人、在多个群里反复发），
			// 于是「第一次登记、之后每一次都零成本命中」这条路径的命中率远高于头像。
			// 图16 那种「三条连发的同款引流图」就是典型的同一 file_unique_id。
			//
			// 与 ad_avatars 的唯一结构差异是 kind 列：头像只有 ChatPhoto 一种来源，
			// 而正文图片分 photo / sticker / animation / video / document 五种载体，
			// 混在一起会让 L2 无法按载体决定要不要推理（sticker 还有 set_name 可用）。
			//
			// verdict / hits 语义与 ad_avatars 逐字对齐（pending / ad / clean，
			// hits = 用过这张图且被定罪的次数），这样 /ignore 的纠错口径在两张表上
			// 完全一致，不会出现「头像能回滚、图片回滚不了」的半边失效。
			await runD1SchemaStatement(env, 'ad_images', 'CREATE TABLE IF NOT EXISTS ad_images (file_unique_id TEXT PRIMARY KEY, verdict TEXT NOT NULL DEFAULT \'pending\', hits INTEGER NOT NULL DEFAULT 0, file_id TEXT, kind TEXT, source TEXT, last_user_id TEXT, vision_checked_at INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
			await runD1SchemaStatement(env, 'idx_ad_images_verdict', 'CREATE INDEX IF NOT EXISTS idx_ad_images_verdict ON ad_images (verdict)', { optional: true });
			// 【2026-10-11】图片跨用户复用：记录「同一张图被谁发过」。
			// 【为什么是独立表而不是给 ad_images 加列】加列要在建表流程里跑 d1ColumnExists，
			// 而那条流程每条群消息都会走 —— 直接撞红「稳定态普通群消息核心 D1 SQL 不超过 3 条」
			// 那条防退化守卫。独立表只在【有媒体的消息】上读写，普通文本消息一次都不碰。
			await runD1SchemaStatement(env, 'ad_image_senders',
				'CREATE TABLE IF NOT EXISTS ad_image_senders (file_unique_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (file_unique_id, user_id))');

			// 同款会员标（emoji status）指纹库。主键是 emoji_status_custom_emoji_id。
			//
			// 【为什么值得单开一张表】主人给的六个广告号资料卡里，有三个挂的是
			// 同一个自定义标（内容就是「看我简介」，与他们共用的那张头像同一套话术）。
			// 标是【广告组织统一配的物料】，而正常用户挂的是官方 Premium 蓝星或
			// 各自随便选的标 —— 于是「同一个标出现在多个被定罪的号身上」
			// 恰好就是「同一批人在作案」这个信号，且零 Telegram 请求就拿得到。
			//
			// 【与 ad_avatars 的两处结构差异】
			//   ① 主键叫 badge_id 不是 file_unique_id —— 它是一个自定义 emoji 标识，
			//      不是文件，没有 file_id 可下载、也没有换图一说
			//   ② 没有 vision_checked_at —— 这一层【不做视觉识别】。主人的口径是
			//      「直接判定同款广告类型标」，看的是「是不是同一个标」，
			//      不是「这个标长什么样」，所以连 L2 队列都不存在
			//
			// verdict / hits 语义与另两张表对齐（ad = 已定罪素材 / clean = /ignore 纠错过，
			// hits = 挂过它且被定罪的次数），这样 /ignore 的纠错口径三张表一致。
			await runD1SchemaStatement(env, 'ad_badges', 'CREATE TABLE IF NOT EXISTS ad_badges (badge_id TEXT PRIMARY KEY, verdict TEXT NOT NULL DEFAULT \'pending\', hits INTEGER NOT NULL DEFAULT 0, source TEXT, last_user_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
			await runD1SchemaStatement(env, 'idx_ad_badges_verdict', 'CREATE INDEX IF NOT EXISTS idx_ad_badges_verdict ON ad_badges (verdict)', { optional: true });

			// 资料形状库：bio 归一化后的形态指纹（见 adProfileShape）。
			// 与 ad_fingerprints 分开的理由：那张表存的是【词】，靠子串匹配；
			// 这张表存的是【整份资料的形态】，靠完整形状命中 ——
			// 「同一批号共用一套 bio、只换链接」正是词指纹抓不到、形状指纹专抓的形态。
			// 列名与 ad_fingerprints 对齐（hits / false_positive_count），
			// 好让 /ignore 的纠错口径在两张表上完全一致。
			await runD1SchemaStatement(env, 'ad_profile_shapes', 'CREATE TABLE IF NOT EXISTS ad_profile_shapes (shape TEXT PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0, false_positive_count INTEGER NOT NULL DEFAULT 0, last_hit INTEGER NOT NULL DEFAULT 0, sample TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)');

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

// ===== 逐字分隔混淆（2026-09-11 补回实现）=====
// 词表匹配用 includes 子串比对，广告号只要在每个字之间插一个分隔符就能全身而退：
//   「pq低.價.出.正.品.水.果.機 pp」——「低價出正品」被点号切碎，任何词表都匹配不到。
// 线上纯广告群实测这是主流手法，配合首尾随机串还能躲过「同一文案第二次出现即秒杀」。
//
// 项目里 4806 行原有一段注释完整描述过这个思路（含「实测 9 个变体漏 4 个」的记录），
// 但函数体不知何时被删空、只剩注释，等于该能力一直不存在。这里按原设计补回。
//
// 【关键取舍】不能无条件删掉所有分隔符 —— 那会把相邻词拼起来造成误杀
//   （「今日 入门」→「今日入门」凭空命中「日入」）。因此只认「逐字分隔」这一种
//   明确的混淆签名：连续 ≥3 组「单个字符 + 单个分隔符」。正常语句不会长这样。
// 分隔符【按性质分两级】—— 这是放宽到「1~2 字一组」后必须做的区分。
// 顿号与逗号是中文列举的正规标点：「苹果、香蕉、橘子、西瓜」「上海、北京、广州、深圳」
// 天然就是「2 字 + 分隔符」重复三次以上，离线实测这类正常句子会被整片误伤。
// 所以两级拆开：
//   STRICT —— 点号、间隔号、下划线、星号、破折号、波浪号、空白。中文写作【不用】它们
//             逐字断句，出现即是混淆信号，允许 1~2 字分组。
//   LOOSE  —— 顿号、逗号。正规列举标点，只在【严格逐字】（每组恰好 1 字）时才算混淆，
//             「联、系、我、们」这种一个字一个顿号确实反常，但「苹果、香蕉」完全正常。
const AD_CHAR_SPLIT_SEP_STRICT = '.·・･｡‧∙⋅•_\\-—–~～*\\s';
const AD_CHAR_SPLIT_SEP_LOOSE = '。､、,，';
// 两条签名，任一命中即算混淆。都要求【≥3 组连续】—— 偶发一两处不算。
// 用 CJK 限定字符类，避免英文缩写（「U.S.A」「a.m.」）与版本号（「1.2.3.4」）被当成混淆。
//
// 签名一（宽分组 + 严格分隔符）：1~2 个 CJK + STRICT 分隔符。
//   打「低.價.出.正.品」，也打「sh最新.17水.果僅.需五.千.多 kn」这种多字分组变体 ——
//   后者在只认单字时整条漏检，而广告号并不严格逐字切，够躲词表就行。
// 签名二（严格逐字 + 全部分隔符）：恰好 1 个 CJK + STRICT 或 LOOSE 分隔符。
//   打「联、系、我、们」这类拿顿号逐字切的，同时不碰「苹果、香蕉、橘子」。
const AD_CHAR_SPLIT_RE_STRICT = new RegExp(
	'(?:[\\u4e00-\\u9fff]{1,2}[' + AD_CHAR_SPLIT_SEP_STRICT + ']){3,}[\\u4e00-\\u9fff]',
	'u'
);
const AD_CHAR_SPLIT_RE_PERCHAR = new RegExp(
	'(?:[\\u4e00-\\u9fff][' + AD_CHAR_SPLIT_SEP_STRICT + AD_CHAR_SPLIT_SEP_LOOSE + ']){3,}[\\u4e00-\\u9fff]',
	'u'
);

// 是否含逐字分隔混淆签名。用于结构化评分加分（A1）。
function hasAdCharSplitObfuscation(text) {
	const source = String(text ?? '');
	if (!source) return false;
	return AD_CHAR_SPLIT_RE_STRICT.test(source) || AD_CHAR_SPLIT_RE_PERCHAR.test(source);
}

// 去混淆：只在命中签名的片段内部剥掉分隔符，签名之外的文本【一个字符都不动】。
// 这样「今日 入门」（不成签名）保持原样，而「低.價.出.正.品」还原成「低價出正品」。
// 两条签名各自替换：严格逐字那条只剥它自己匹配到的片段，不会顺手动列举标点。
function deobfuscateAdCharSplit(text) {
	const source = String(text ?? '');
	if (!source) return '';
	let result = source;
	const strictSepRe = new RegExp('[' + AD_CHAR_SPLIT_SEP_STRICT + ']+', 'gu');
	const allSepRe = new RegExp('[' + AD_CHAR_SPLIT_SEP_STRICT + AD_CHAR_SPLIT_SEP_LOOSE + ']+', 'gu');
	if (AD_CHAR_SPLIT_RE_STRICT.test(result)) {
		result = result.replace(new RegExp(AD_CHAR_SPLIT_RE_STRICT.source, 'gu'),
			(segment) => segment.replace(strictSepRe, ''));
	}
	if (AD_CHAR_SPLIT_RE_PERCHAR.test(result)) {
		result = result.replace(new RegExp(AD_CHAR_SPLIT_RE_PERCHAR.source, 'gu'),
			(segment) => segment.replace(allSepRe, ''));
	}
	return result === source ? '' : result;
}

// 参与词表匹配的文本变体：原文永远在第一项，行为完全向后兼容；
// 命中混淆签名时追加一份去混淆文本，让【现有全部词表】对这类变体立即生效，
// 无需为每种变体往词表里加字面量（词表每加一倍就多一倍误封面）。
function buildAdMatchTexts(text) {
	const source = String(text ?? '');
	if (!source) return [];
	const deobfuscated = deobfuscateAdCharSplit(source);
	return deobfuscated && deobfuscated !== source ? [source, deobfuscated] : [source];
}

function countAdKeywordHits(text, keywords) {
	const source = String(text ?? '');
	if (!source) return [];
	// 原文与去混淆文本都比对，任一命中即算（A2）。这是全项目词表匹配的唯一入口，
	// 改这一处即让结构评分、指纹抽取、豁免词、引用体查杀全部自动覆盖混淆变体。
	const variants = buildAdMatchTexts(source).map((v) => v.toLowerCase());
	const hits = [];
	for (const word of keywords) {
		const needle = String(word).toLowerCase();
		if (needle && variants.some((v) => v.includes(needle))) hits.push(word);
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
	let exemptHits = countAdKeywordHits(source, AD_EXEMPT_KEYWORDS);
	// 广告语境下 t.me / 代理 不算护身符：否则在昵称里写「招代理 t.me/xxx」，
	// 单类判据就会因为命中豁免词被放行 —— 这正是「招代理」曾被放走的路径。
	// 只影响【是否算豁免】，不额外加分；定罪仍要过硬构词或软构词+无豁免这两道门。
	exemptHits = dropAdContextExempt(exemptHits, source);
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

// 正文剥掉「非本人语言」之后还剩几个文字字符。
//
// 这是 menshen `prompts.go:140` 的 evasionClause 里那句
// 「新成员只发一串 @xxxbot、**几乎没有别的内容**」的规则化落点 ——
// menshen 把它写给模型判断，我方是规则化判据，所以要有一个可计算的定义。
//
// 剥掉的三类都不是「他真正在讲的东西」：
//   · @handle     —— 艾特本身，也是形态 B 要计数的对象，不能既计数又当内容
//   · URL         —— 链接是出口，不是话
//   · /斜杠命令   —— 命令不是群聊内容（menshen pipeline.go:121 同口径：
//                    「命令不是群聊内容：不留底，也不进判定」）
// 剩下按 \p{L}\p{N} 数字数：中文、英文、数字都算，emoji 与标点不算。
//
// 【为什么是 4】与引用体通道的 AD_QUOTED_KILL_MAX_OWN_TEXT 同值。
// 两处抓的是同一件事（「他自己几乎什么都没说」），用两个门槛迟早互相打架；
// 引用体那条是主人早就拍过板的口径，这里直接沿用。
const AD_NATURAL_TEXT_MAX = 4;

// 形态 B 弱档的加分值。取 3 的理由：它比单个业务词强（三个账号并列确实是
// 可疑形态），但离封禁线还差 4 分、离观察线差 2 分 —— 也就是说光靠弱档
// 永远封不了人，必须再有别的证据（昵称、正文、指纹、AI）才够线。
// 这正是「弱档只抬证据权重、不单独定罪」的数值表达。
const AD_FORMB_WEAK_SCORE = 3;

function adNaturalTextLength(text) {
	const rest = String(text || '')
		.replace(/@[A-Za-z0-9_]+/g, ' ')                    // ① @handle（连同其字母数字一起剥）
		.replace(/(?:https?:\/\/|t\.me\/)\S+/gi, ' ')        // ② URL
		.replace(/(^|\s)\/[A-Za-z0-9_]+/g, ' ');             // ③ /斜杠命令（命令本身，不吞后面的参数）
	return (rest.match(/[\p{L}\p{N}]/gu) || []).length;
}

// 正文里有没有斜杠命令。用来把「有人在用 bot」与「召唤 bot 代发」分开：
// 「@kickbot /ban @muter /mute」是群友在发命令，一条广告词都没有。
const AD_SLASH_COMMAND_RE = /(^|\s)\/[A-Za-z0-9_]{2,}/;

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
		// 全部以 bot 结尾的那几个（形态 B 强档只认它们，见 judgeAdStructure）。
		// TG 硬性规定 bot 用户名必须以 bot 结尾，这是「这是个代发工具」的硬标识；
		// 普通人的 handle 恰好以 bot 结尾的极少（那本来就是给 bot 用的命名空间）。
		botMentions: mentions.filter((x) => /bot$/.test(x)),
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

	// ===== 形态 B 引流矩阵型 —— 2026-10-06 拆成强 / 弱两档 =====
	//
	// 【为什么要拆】主人原话「这类很容易误判正常用户，所以一定要做好」。
	// 离线实测 13 个案例（test_ad_formb）：旧写法「三个信号任一成立即定罪」
	// 把三个正常场景全判成 ban ——
	//   「@alice_1 @bob_22 @carol_33 约一下周末爬山」（mentions≥3）
	//   「推荐 @a_bot @b_bot @c_bot 这三个自己挑」（mentions≥3）
	//   「@user8888 @pass6666 登录测试一下」（repeatedDigit 只要 2 个）
	// 而真正该拦的广告侧反而只覆盖「≥3 个艾特」，2 个 bot 的变体照旧漏放。
	// 根因：三个信号没有一个区分「代发工具」与「普通人」，也没有一个看上下文 ——
	// 注释里那句「正常人 bio 里不会列 3 个账号」说的是 bio，判的却是正文。
	//
	// 强档（guilty → hardHit，绕过分数线直接封），四条件同时成立：
	//   ① ≥2 个 handle **全部**以 bot 结尾   —— menshen evasionClause 的 @xxxbot；
	//      TG 硬性规定 bot 名以 bot 结尾，普通 handle 落进这个命名空间的极少
	//   ② 剥掉艾特/命令/URL 后自然语言 < 4 字 —— 同款「几乎没有别的内容」
	//   ③ 正文不含斜杠命令 ——「@a /help @b /status」是有人在用 bot，不是召唤代发；
	//      menshen pipeline.go:121 对命令的处置是「不是群聊内容，不进判定」
	//   ④ 只在 body 通道生效 —— 资料卡挂自己的 bot 是常态（menshen bioLinksClause
	//      原话：「简介里挂自己的频道、群组、bot 是正常的」），而 card 通道拿不到
	//      正文，「没有别的内容」这个前提对它根本不成立
	//
	// 【代价要写明】强档第 ② 条让广告号多打 4 个字就能绕过 —— 与引用体通道的门槛一
	// 是同款代价，主人对那条的取舍是「认了，变体交给 /spam 学指纹」（命中即封、
	// 比正则准）。刻意不把门槛放宽到十几个字：那样「@某人 你看这个广告」就进来了。
	//
	// 弱档（weak → 只加分 +3，仍要过分数线）：≥3 个 handle、重复数字账号 ≥2。
	// 这两个信号都会在正常语料上触发（实测 `@alice_1 @bob_22 @carol_33 约一下`、
	// `@user8888 @pass6666 登录测试`），所以不单独定罪。
	//
	// 【同前缀引流矩阵刻意留在强档】它是批量注册小号群的硬特征 —— 正常人的 handle
	// 不会 4 字符同前缀（实测 `@tom_100 @tommy_x` 只有 3 字符，不命中）。「佳佳
	// （邪恶姐姐）」那个号一个广告词都没有，定的就是这一条；把它一起降档会直接
	// 放走它，test_ad_detection 的「佳佳引流矩阵应定罪」也钉着这一条。
	const naturalLen = adNaturalTextLength(source);
	const hasCommand = AD_SLASH_COMMAND_RE.test(source);
	const formBBare = channel === 'body'
		&& outlets.mentions.length >= 2
		&& outlets.botMentions.length === outlets.mentions.length
		&& naturalLen < AD_NATURAL_TEXT_MAX
		&& !hasCommand;
	const formBHard = outlets.sharedPrefix || formBBare;
	const formBWeak = outlets.mentions.length >= 3
		|| outlets.repeatedDigit.length >= 2;

	const label = channel === 'card' ? '资料卡查杀' : (channel === 'quoted' ? '引用体查杀' : '正文查杀');

	// 只有弱档成立：不进 hardHit、不定罪，但结论必须带出去（reasons 由上层在
	// `!structure.guilty && structure.reasons.length` 那一支 push，weak 标记供加分用）。
	if (!formA && !formBHard && formBWeak) {
		const weakDetail = [];
		if (outlets.count) weakDetail.push('引流出口×' + outlets.count + (outlets.hasBot ? '(含bot)' : ''));
		if (outlets.repeatedDigit.length) weakDetail.push('重复数字账号×' + outlets.repeatedDigit.length);
		return {
			guilty: false,
			weak: true,
			channel,
			form: 'B弱',
			reasons: [label + '弱命中（形态 B 弱档，只加分不定罪）：' + weakDetail.join(' + ')]
		};
	}

	const formB = formBHard || formBWeak;
	const form = formA && formB ? 'A+B' : (formA ? 'A' : (formB ? 'B' : ''));
	if (!form) return { guilty: false, channel, form: '', reasons: [] };

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
	// 正文为空时整体跳过 —— 那种情形归通道 1（资料卡查杀）管，本通道重复判定会让
	// layer 标错。【2026-10-05 曾改成「正文空时拿简介单独判」，实测后撤回】：
	// 那批纯简介广告（Lisa 的「进群了解项目 一天8000」）后来由【形态 E 金额招揽】
	// 在 evaluateAdSuspect 层面接住了，分数照样够线，不依赖这一路；
	// 硬改这里只会与「正文为空时跳过」那条既有断言冲突，属于白担风险。
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

// ===== 资料里挂的频道 / 群 / bot —— 解析与判据（对齐 menshen 的 resolveLink）=====
//
// 【解决什么】广告号与正常用户都会在 bio 里写 t.me/xxx，只看字符串分不开：
//「挂自己的技术频道」和「挂刷单群」写的都是 `t.me/xxx`，差别全在**被挂的那个账号**
// 本身是什么、简介写了什么、有没有案底。menshen 逐个 getChat("@handle") 把目标查清楚
// 再判（sender.go resolveLink），我方此前只把 bio 当纯文本正则，对链接指向哪儿一无所知。
//
// 【能力边界，先写清楚】getChat 只给 类型 + 标题 + 简介 description，**给不了频道里
// 发过什么** —— bot 读不到别人的频道历史消息，menshen 也一样。能拿到的最硬证据是
// 被挂频道【自己写的简介】，那正是攻击者写的引流落地页文案。bot 还要多一步：
// 它的简介 getChat 拿不到，只有公开预览页的 og:description 给（见 fetchAdBotAbout）。
//
// 【为什么不引入生成式模型】menshen 靠提示词推理「这个频道是不是广告」；我方 AI 层是
// bge-m3 向量相似度、全文件没有一处 chat/completions，提示词没有落点。而被挂账号的
// 简介本质上就是一份 bio —— 直接用打 bio 的同一条广告语境正则去打它（见
// scoreAdProfileLinks），判据同源、不新造一套。查不到的按 menshen 口径「不因查不到
// 而加重怀疑」：不加不减。
//
// 【成本闸】只有 bio/昵称里真的出现了 @xxx 或 t.me/xxx 形态才发请求（见
// extractAdProfileHandles 的形态判断），没链接的人一个请求都不加；有链接也最多 5 个，
// 结果按小写 handle 缓存 6 小时 —— 群里十个人挂同一个频道只查一次。
const D1_AD_LINK_CACHE_INIT = new WeakMap();
const AD_LINK_MAX_HANDLES = 5;
const AD_LINK_TTL_SECONDS = 6 * 60 * 60;
// 与 menshen profileHandleRe 同形：@xxx 与 t.me/xxx 两种公开用户名写法。
// t.me/+xxx 与 t.me/joinchat 是私密邀请，查不出目标 —— 那归已有的 privateInvite 判据管。
const AD_PROFILE_HANDLE_RE = /(?:@|t\.me\/)([A-Za-z][A-Za-z0-9_]{3,31})/g;

async function ensureAdLinkCacheTable(env) {
	if (!env?.DB) return false;
	const cached = D1_AD_LINK_CACHE_INIT.get(env.DB);
	if (cached) return cached;
	const init = (async () => {
		try {
			await runD1SchemaStatement(env, 'ad_link_cache',
				'CREATE TABLE IF NOT EXISTS ad_link_cache (handle TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT \'\', title TEXT NOT NULL DEFAULT \'\', about TEXT NOT NULL DEFAULT \'\', ad_known INTEGER NOT NULL DEFAULT 0, ad_confirmed INTEGER NOT NULL DEFAULT 0, fetched_at INTEGER NOT NULL DEFAULT 0)');
			// 老库补列。CREATE IF NOT EXISTS 对已存在的表不生效，所以新列必须单独 ALTER；
			// 而列已存在时 ALTER 会报错，故先 PRAGMA 探测。整段被 D1_AD_LINK_CACHE_INIT
			// 的 WeakMap 缓存住，每个 DB 只跑一次，不进热路径（同 stat_speech 那处的写法）。
			const cols = await env.DB.prepare('PRAGMA table_info(ad_link_cache)').all();
			const names = new Set((cols?.results || []).map((c) => String(c.name || '')));
			if (!names.has('ad_confirmed')) {
				await runD1SchemaStatement(env, 'ad_link_cache.ad_confirmed',
					'ALTER TABLE ad_link_cache ADD COLUMN ad_confirmed INTEGER NOT NULL DEFAULT 0;', { optional: true });
			}
			return true;
		} catch (error) {
			console.error('[广告检测·链接] 建表失败:', error);
			return false;
		}
	})();
	D1_AD_LINK_CACHE_INIT.set(env.DB, init);
	const ok = await init;
	if (!ok) D1_AD_LINK_CACHE_INIT.delete(env.DB);
	return ok;
}

// 读缓存。过期返回 null 由调用方重新解析 —— 与 menshen 的 linkTTL 同为 6 小时，
// 频道简介很少变，但改了之后 6 小时内还能看到旧值，这是可接受的代价。
async function readAdLinkCache(env, handle) {
	const key = String(handle || '').toLowerCase();
	if (!env?.DB || !key) return null;
	if (!(await ensureAdLinkCacheTable(env))) return null;
	try {
		const row = await env.DB.prepare(
			'SELECT handle, kind, title, about, ad_known, ad_confirmed, fetched_at FROM ad_link_cache WHERE handle = ? AND fetched_at > ?'
		).bind(key, Math.floor(Date.now() / 1000) - AD_LINK_TTL_SECONDS).first();
		if (!row) return null;
		return {
			handle: String(row.handle || key),
			kind: String(row.kind || 'unknown'),
			title: String(row.title || ''),
			about: String(row.about || ''),
			adKnown: Number(row.ad_known) === 1,
			adConfirmed: Number(row.ad_confirmed) === 1
		};
	} catch (error) {
		// 缓存读不到只意味着这次要真查一次，不能因此把整条解析链判死。
		console.error('[广告检测·链接] 读缓存失败:', error);
		return null;
	}
}

async function writeAdLinkCache(env, info) {
	const key = String(info?.handle || '').toLowerCase();
	if (!env?.DB || !key) return;
	if (!(await ensureAdLinkCacheTable(env))) return;
	try {
		await env.DB.prepare(
			'INSERT INTO ad_link_cache (handle, kind, title, about, ad_known, ad_confirmed, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			+ ' ON CONFLICT(handle) DO UPDATE SET kind = excluded.kind, title = excluded.title,'
			+ ' about = excluded.about, ad_known = excluded.ad_known,'
			// ad_confirmed 取 MAX：重新解析带进来的是 0（isAdProfileLinks 落案底那步
			// 才会置 1），不能让一次 6 小时后的重查把已确认的案底冲回 0 —— 案底只有
			// /ignore 纠错那一条路能撤，见 clearAdLinkConfirmedOnIgnore。
			+ ' ad_confirmed = MAX(ad_link_cache.ad_confirmed, excluded.ad_confirmed),'
			+ ' fetched_at = excluded.fetched_at'
		).bind(key, String(info.kind || 'unknown'), String(info.title || '').slice(0, 200),
			String(info.about || '').slice(0, 600), info.adKnown ? 1 : 0, info.adConfirmed ? 1 : 0,
			Math.floor(Date.now() / 1000)).run();
	} catch (error) {
		console.error('[广告检测·链接] 写缓存失败:', error);
	}
}

// 案底：这个账号在我方账本里有没有被判过广告。等价 menshen 的 accountAdKnown
//（gban 名单 + antiad_log verdict='ad'），我方的两本账是：
//   · blacklist —— 现在还在黑名单里
//   · ad_pending_snapshots —— 判过且【没被 /ignore 回滚过】（回滚会把 expires_at 置 0，
//     正好不算案底：纠错过的判定不该继续拿来定别人的罪）
// 一条 SQL 拿两个计数，不在闸一路径上（闸一压根不解析链接）。
async function isAdKnownAccount(env, uid) {
	const id = String(uid || '');
	if (!env?.DB || !/^-?\d+$/.test(id)) return false;
	try {
		const row = await env.DB.prepare(
			'SELECT (SELECT COUNT(*) FROM blacklist WHERE id = ?)'
			+ ' + (SELECT COUNT(*) FROM ad_pending_snapshots WHERE user_id = ? AND expires_at > 0) AS c'
		).bind(id, id).first();
		return Number(row?.c || 0) > 0;
	} catch (error) {
		// 查不到案底不加重怀疑（menshen 同口径）：拿不到证据不等于有罪。
		return false;
	}
}

// bot 的简介只有公开预览页给得到：getChat 对别的 bot 只返回名字与用户名。
// 外网 HTTP、5 秒超时、失败返回空串 —— 空 about 在 scoreAdProfileLinks 里是
//「不加不减」，不会因为抓不到就把这个 bot 往广告那边推。
const AD_BOT_ABOUT_TIMEOUT_MS = 5000;
async function fetchAdBotAbout(handle) {
	const key = String(handle || '').toLowerCase();
	if (!key) return '';
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), AD_BOT_ABOUT_TIMEOUT_MS);
	try {
		const response = await fetch('https://t.me/' + key, {
			method: 'GET',
			signal: controller.signal,
			headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TGUnbanBot-adlink/1.0)' }
		});
		if (!response.ok) return '';
		const html = await response.text();
		// 与 menshen ogDescriptionRe 同口径：只取 og:description 一段，截断防超长。
		const matched = /<meta property="og:description" content="([^"]*)"/.exec(String(html || ''));
		if (!matched) return '';
		let about = decodeBasicTelegramHtmlEntities(matched[1]).trim();
		// 没设简介时预览页给的是默认文案，那不是简介，别当成「这个 bot 自己说只留联系方式」。
		if (about.startsWith('You can contact @') && about.endsWith(' right away.')) return '';
		return about.slice(0, 600);
	} catch (_) {
		return '';
	} finally {
		clearTimeout(timer);
	}
}

// 从昵称与简介里取出公开用户名（@xxx 与 t.me/xxx），去重保序，上限 5 个。
//
// 【形态闸 = 成本闸】没有 handle 就返回空数组，resolveAdProfileLinks 据此一个请求
// 都不发 —— 这就是「资料干净的人不花 getChat」的落点，等价 menshen coldjudge.go:257
// 那句「链接解析放在预筛之后：每个链接一次 getChat，不该花在资料干净的人身上」。
// 我方的预筛比它的 coldSuspicious 更硬：不用猜这份资料可不可疑，链接形态本身就是
// 「有没有东西可查」的充要条件。
function extractAdProfileHandles(profile) {
	const text = [profile?.firstName, profile?.lastName, profile?.bio]
		.map((part) => String(part || '').trim())
		.filter(Boolean).join(' ');
	if (!text) return [];
	// 本人的 username 是账号标识不是「挂的链接」—— 查它等于查自己，白花一次请求。
	const self = String(profile?.username || '').replace(/^@/, '').toLowerCase();
	const out = [];
	const seen = new Set();
	for (const matched of text.matchAll(AD_PROFILE_HANDLE_RE)) {
		const handle = String(matched[1] || '');
		const key = handle.toLowerCase();
		// joinchat 出现在 t.me/joinchat/xxx 里，那是私密邀请、查不出目标。
		if (key === 'joinchat' || key === self || seen.has(key)) continue;
		seen.add(key);
		out.push(handle);
		if (out.length >= AD_LINK_MAX_HANDLES) break;
	}
	return out;
}

// 查一个公开用户名指向什么：类型（channel / supergroup / group / bot / user）、
// 标题、简介、案底。结果按小写 handle 缓存 6 小时。
async function resolveAdLink(env, handle) {
	const key = String(handle || '').toLowerCase();
	if (!key || !BOT_TOKEN) return null;
	const cached = await readAdLinkCache(env, key);
	if (cached) return cached;

	const info = { handle: key, kind: 'unknown', title: '', about: '', adKnown: false, adConfirmed: false };
	// cacheable=false 表示这次是暂时性故障，别缓存 —— 否则一次 429 会把这条链路
	// 按死 6 小时，期间这个号挂的频道永远显示 unknown。
	let cacheable = true;
	try {
		const response = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/getChat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: '@' + key })
		});
		const result = await response.json();
		const data = result?.result;
		if (result?.ok && data) {
			info.kind = String(data.type || 'unknown');
			info.title = String(data.title || [data.first_name, data.last_name].filter(Boolean).join(' ') || '').slice(0, 200);
			info.about = String(data.description || data.bio || '').slice(0, 600);
			// private 是用户与 bot 共有的 type。TG 硬性规定 bot 用户名必须以 bot 结尾。
			if (info.kind === 'private') info.kind = /bot$/.test(key) ? 'bot' : 'user';
			// bot 的简介 getChat 拿不到，只有公开预览页的 og:description 给。
			if (info.kind === 'bot' && !info.about) info.about = await fetchAdBotAbout(key);
			info.adKnown = await isAdKnownAccount(env, data.id);
		} else {
			// 私有群、已删号、打错的用户名都是常态而非故障 —— 这类要缓存，否则每条消息
			// 都重查一遍只是白撞速率限制（menshen 同样处理）。429 / 5xx 是暂时故障，不缓存。
			const description = String(result?.description || '');
			cacheable = response.status !== 429 && response.status < 500
				&& !/429|too many requests|internal server|timeout/i.test(description);
		}
	} catch (error) {
		cacheable = false;
		console.error('[广告检测·链接] 解析失败 handle=' + key + ':', error?.message || error);
	}
	if (cacheable) await writeAdLinkCache(env, info);
	return info;
}

// 批量解析一份资料里挂的链接。串行而不是并发：上限 5 个，串行最坏 5 次往返，
// 并发换来的那点速度不值得冒一次性打爆限流的险（menshen 也是串行 for）。
async function resolveAdProfileLinks(env, profile) {
	const handles = extractAdProfileHandles(profile);
	if (!handles.length) return [];
	const out = [];
	for (const handle of handles) {
		try {
			const info = await resolveAdLink(env, handle);
			if (info) out.push(info);
		} catch (error) {
			console.error('[广告检测·链接] 单条解析异常 handle=' + handle + ':', error?.message || error);
		}
	}
	return out;
}

// ===== 前置分档：先判这个人像不像广告，再决定要不要为他花 getChat 查挂的东西 =====
//
// 【为什么要有这道前置】2026-10-07 主人原话：「以正常用户跟广告用户作为前置判定条件，
// 要做好区分。」在这之前，只要资料里有 @xxx / t.me/xxx 就查 —— 挂自己频道的正常技术
// 博主、写「私信请走频道」的正常用户一样要付 0~5 个 getChat，而他们挂的东西查出来
// 最多 +2/+3，加上他们本来就净负的资料卡分（豁免词 -3）根本够不到观察线 5 分，
// 查与不查结局一样。分档把这类查询挡在门外，同时让「挂没挂链接」这件事彻底不进
// 广告号的判定链 —— 分界仍然不在挂没挂，而在这个人本身像不像广告。
//
// 【判据同源，一个字不改】直接用已有的 scoreAdProfile 与 scoreAdMessageText 算分：
// 不新建判据、不调阈值、不动词表。分档只决定「要不要解析」，本身不参与任何定罪，
// 所以它算错的方向也只是少查一次 getChat，不会凭空多出一个可定罪的分数。
// 加分项在 reasons 里恒以「+N 」开头（scoreAdProfile / scoreAdMessageText 的 add 约定）；
// 减分是「-N 」，不计分的记录是全角括号。格式被 test_ad_links.mjs 钉死，改了会红。
const AD_REASON_POSITIVE_RE = /^\+\d+\s/;

function isAdProfileElevated(profile, options = {}) {
	// 【为什么看「有没有加分项」而不是净分】净分会被豁免词压成负数：挂公开 t.me
	// 链接的人一律 -3，而广告号的 bio 恰恰也常挂 t.me 频道 —— 拿净分当档位，
	// 这类广告号会和正常博主一起掉进低档，正是要挡的那次漏。豁免词是【减分保护】，
	// 它不能把「这个人身上有广告特征」这个事实一起抹掉。所以档位只问一件事：
	// 资料卡与正文里，有没有任一条被计了分的特征。
	const profileScore = scoreAdProfile(profile, {
		whitelist: options.whitelist,
		skipMissingBioPenalty: true
	});
	// 正文只在闸二那一侧有；入群线那时人刚进门、一条消息都没发过，据实传空。
	// 漏传会让「资料干净但在正文里发广告」的人掉进低档，所以闸二必须传。
	const textScore = options.text
		? scoreAdMessageText(String(options.text), { whitelist: options.whitelist })
		: { reasons: [] };
	return profileScore.reasons.some((line) => AD_REASON_POSITIVE_RE.test(line))
		|| textScore.reasons.some((line) => AD_REASON_POSITIVE_RE.test(line));
}

// 解析入口（带前置）：低档直接返回空数组 —— 与「资料干净的人」走形态闸的结果
// 逐字节一致，下游 scoreAdProfileLinks([]) 得 0 分 0 条 reasons，判定逻辑零变化。
async function resolveAdProfileLinksElevated(env, profile, options = {}) {
	if (!isAdProfileElevated(profile, options)) return [];
	return resolveAdProfileLinks(env, profile);
}

// 被挂账号的判据。【只加分，不产生 hardHit】—— 定罪仍要过原有阈值
// （scoreThreshold / 指纹 / AI / 结构通道），链接这一层永远只是抬高总分的证据之一。
//
// 这是与 menshen 的实质差别，也是必须的：它把资料交给生成式模型推理
//（bioLinksClause），我方是规则化，规则化只能认「写明白了的」，认不出反向否证
//（「标题吓人但简介是技术群」）。既然认不出反向，就不该让它有单独定罪的权力。
//
// ③ 那三条「不加」的分支正是本功能的核心：**正常用户与广告号都带 t.me，分界不在这
// 串字符上，而在被挂账号写没写招揽、有没有案底。** 只挂链接、指向正常号、简介为空、
// 查不到 —— 一律不加分，正常人挂自己的频道一个分都不涨。
function scoreAdProfileLinks(links) {
	if (!Array.isArray(links) || !links.length) return { score: 0, reasons: [], scoredHandles: [] };
	let score = 0;
	const reasons = [];
	// 本次【确实贡献了分】的 handle —— 自举案底只认这些。挂了个正常频道的广告号
	// 被判广告时，那个正常频道一个分都没加，绝不该被标成广告位，否则连坐所有挂它的人。
	const scoredHandles = [];
	const add = (delta, label) => { score += delta; reasons.push((delta >= 0 ? '+' : '') + delta + ' ' + label); };

	for (const link of links) {
		const handle = String(link?.handle || '');
		if (!handle) continue;
		const kind = String(link.kind || 'unknown');
		const title = String(link.title || '');
		const about = String(link.about || '');
		// 广告位类型：只有频道 / 群 / bot 构成广告位，挂个人号一律不算 ——
		// 与 +2 同一批。2026-09-08 主人口径是「挂个人号不构成广告位」，而 +3 此前
		// 不筛 kind，会与它相悖：挂一个被封过的个人号照样 +3，测试里那条
		//「挂个人号 → 0 分」的断言也就名不副实。两处口径现在一致。
		const isAdSlot = ['channel', 'supergroup', 'group', 'bot'].includes(kind);
		// 自举案底：这个 handle 已被我方确认过是广告位（见 confirmAdLinkOnBan）。
		// 它与下面的「简介含招揽」同源 —— 当初正是那条 +2 触发后才标的，所以
		// 已确认时只给 +3、跳过 +2，否则同一条简介会被算两遍（+5 虚高）。
		const confirmed = link.adConfirmed === true;
		// ① 案底：我方账本判过它广告、或它还在黑名单里、或已被自举确认。
		//    这条最强 —— 它不是模式匹配，是已经发生过、还能被 /ignore 纠错掉的定罪。
		//    【自举补上了原判据的死路】isAdKnownAccount 查的是用户黑名单，而频道/群的
		//    chat id 是负数、两本账全是正数用户 id，永远查不到（线上 98 行案底命中 0）。
		if (isAdSlot && (link.adKnown || confirmed)) {
			add(3, '挂的 @' + handle + ' 有广告案底（黑名单 / 曾被判定）');
			scoredHandles.push(handle);
		}
		// ② 被挂账号【自己写的简介】含招揽：这是攻击者写的引流落地页文案，
		//    用打 bio 的同一条广告语境正则（金额承诺 / 灰产词 / 强招揽）打它 ——
		//    判据同源，不新造一套。
		if (isAdSlot && !confirmed && about && AD_EXEMPT_CANCEL_RE.test(about)) {
			add(2, '挂的 @' + handle + '（' + kind + '「' + title.slice(0, 30) + '」）简介含招揽话术');
			scoredHandles.push(handle);
		}
		// ③ 其余一律不加：kind=unknown（查不到）、about 为空（没设置或抓不到）、
		//    kind=user（挂个人号）、正常技术/兴趣社群的简介。
	}
	return { score, reasons, scoredHandles };
}

// ===== 自举案底：把这次判成广告的广告位记下来 =====
//
// 【补的是哪个洞】isAdKnownAccount 查的是「用户黑名单 + 判过且未回滚的用户快照」，
// 这两本账里全是正数用户 id；而被挂频道/群的 getChat 返回的是负数 chat id。
// 线上实测：blacklist 14934 行负数 0、有效快照 4546 行负数 0、ad_link_cache 98 行
// 案底命中合计 0 —— 两个 id 命名空间永不相交，所以那条 +3 对频道/群从来没生效过。
//
// 案底因此改存在 ad_link_cache.ad_confirmed 上，语义是「这个 handle 被我方判过是
// 广告位」。只在真正定罪时写、只写【本次贡献了分】的 handle，/ignore 可撤销。
async function confirmAdLinkOnBan(env, evaluation) {
	if (!env?.DB || evaluation?.verdict !== 'ban') return 0;
	const handles = Array.isArray(evaluation?.snapshot?.scoredLinks)
		? evaluation.snapshot.scoredLinks : [];
	if (!handles.length) return 0;
	if (!(await ensureAdLinkCacheTable(env))) return 0;
	let marked = 0;
	for (const handle of handles) {
		const key = String(handle || '').toLowerCase();
		if (!key) continue;
		try {
			const result = await env.DB.prepare(
				'UPDATE ad_link_cache SET ad_confirmed = 1 WHERE handle = ?'
			).bind(key).run();
			// 影响 0 行 = 这个 handle 没进过缓存（写缓存那步被 D1 抖动吃掉了）——
			// 记不住就不记，绝不为了「补一行」把 kind/about 猜着写进去。
			if (Number(result?.meta?.changes || 0) > 0) marked += 1;
		} catch (error) {
			console.error('[广告检测·链接] 标记案底失败 handle=' + key + ':', error?.message || error);
		}
	}
	if (marked) console.log('[广告检测·链接] 已标记广告位案底 ' + marked + ' 个');
	return marked;
}

// /ignore 纠错：被误封的人挂的那个频道不能继续挂着「已确认广告位」，
// 否则下一个人挂同款照样 +3 —— 与头像 / 会员标 / 正文图片的纠错完全同一理由。
async function clearAdLinkConfirmedOnIgnore(env, handles) {
	if (!env?.DB || !Array.isArray(handles) || !handles.length) return 0;
	if (!(await ensureAdLinkCacheTable(env))) return 0;
	let cleared = 0;
	for (const handle of handles) {
		const key = String(handle || '').toLowerCase();
		if (!key) continue;
		try {
			const result = await env.DB.prepare(
				'UPDATE ad_link_cache SET ad_confirmed = 0 WHERE handle = ?'
			).bind(key).run();
			if (Number(result?.meta?.changes || 0) > 0) cleared += 1;
		} catch (error) {
			console.error('[广告检测·链接] 撤销案底失败 handle=' + key + ':', error?.message || error);
		}
	}
	return cleared;
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
	// 昵称同样用逐字分隔躲词表（线上见「✨水果专卖店搞 nyh米点我付叶 ⭐」这类）。
	// 给 3 分而非正文的 4 分：昵称短、样本少，留一分余量给结构判据组合定罪。
	if (displayName && hasAdCharSplitObfuscation(displayName)) add(3, '名称逐字分隔混淆（规避词表匹配）');

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
	// 广告语境判定：昵称 / 简介里同时有招揽特征时，t.me 与「代理」不再当护身符。
	// 【排在私有邀请那条之后】两条剔除各管一档、提示语不同，先到先得会让后一条永不触发：
	// 私有邀请链接（t.me/+、joinchat）命中时上面已经剔过并给出更精确的原因。
	// 这条专治上面管不到的形态 —— 随机用户名式引流号（t.me/cyy42Y4H2DgyZGNI），
	// 它既不是私有邀请链接，也不该吃到 -3 豁免（实测曾因此把广告简介打到比不查还低）。
	exemptHits = dropAdContextExempt(exemptHits, combined, reasons);
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

	// ===== 资料里挂的频道 / 群 / bot（见 scoreAdProfileLinks）=====
	// 只有调用方（入群线、闸二）真的解析过才会有这个字段；闸一的 cheapProfile
	// 没有它 → scoreAdProfileLinks([]) 直接返回 0 分，零请求、零分、零 reasons。
	// 放在所有既有加减分之后：链接证据是「附在资料上的外部佐证」，
	// 排在后面才不会挤掉它上面那些更直接的判据在 reasons 里的位置。
	const linkResult = scoreAdProfileLinks(profile?.adLinks);
	if (linkResult.score) {
		score += linkResult.score;
		reasons.push(...linkResult.reasons);
	}

	// 下限 AD_SCORE_FLOOR（-3）而非 0：夹到 0 会让豁免词减分完全失效，详见该常量说明。
	// scoredLinks：本次真的给分了的被挂 handle，随 evaluation 进快照 —— enforcement
	// 那侧只拿得到 evaluation（与 badgeId / imageId / customEmojiIds 同一职责），
	// 定罪时靠它决定要把哪些 handle 标成已确认广告位。上限 5 = AD_LINK_MAX_HANDLES。
	return {
		score: Math.max(AD_SCORE_FLOOR, score), rawScore: score, reasons, tradeHits, businessHits,
		scoredLinks: (Array.isArray(linkResult.scoredHandles) ? linkResult.scoredHandles : []).slice(0, 5)
	};
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
	// 逐字分隔混淆（A1）：这是【规避行为本身】的特征，不依赖任何广告词汇 ——
	// 广告内容随便换，只要还想躲词表匹配就必须用这个手法。正常人不会在汉字间插点号，
	// 所以给到接近定罪的分量；配合 A2 的去混淆匹配，两条同时命中基本就是 7 分阈值。
	if (hasAdCharSplitObfuscation(source)) add(4, '正文逐字分隔混淆（规避词表匹配）');
	if (hasAdRepeatedSegment(source)) add(1, '正文重复段落');

	// ===== emoji 切断关键词（批次 B-1）=====
	// 形态：点 + emoji + 看/查（「点⚔️查」「点💰看」）—— 广告用 emoji 把「点击查看」
	// 从中间切开，词表按连续字匹配就失效。这是【规避行为】不是内容，内容换多少次都一样。
	//
	// 【单证不定分】正常人也会发「点👍看教程」，所以只有骨架一律不计分、只记 reasons；
	// 必须同时有承诺/招揽语境才加 —— 那正好是主人反复要求的「多特征组合，单特征易误封」。
	// 承诺/招揽词一律复用现成的判据源（交易动词、业务关键词、金额收益、招揽动作），
	// 不为此新建词表：每加一张词表就多一片误封面。
	const emojiSpliceHit = AD_EMOJI_SPLICE_RE.test(source);
	if (emojiSpliceHit) {
		const spliceMatch = String(source.match(AD_EMOJI_SPLICE_RE) || '');
		const hasSolicitContext = tradeHits.length > 0 || businessHits.length > 0
			|| AD_MONEY_GAIN_RE.test(source) || AD_MONEY_SOLICIT_RE.test(source);
		if (hasSolicitContext) {
			add(AD_EMOJI_SPLICE_SCORE, 'emoji 切断关键词（' + spliceMatch + '）且有承诺/招揽语境');
		} else {
			reasons.push('（emoji 切断关键词，单证不定分：' + spliceMatch + '）');
		}
	}

	// ===== 私有群一次性邀请链接（2026-10-11：从资料卡侧扩到正文侧）=====
	//
	// 【补的是哪个洞】同一套判据在 scoreAdProfile 里 2026-09-09 就落地了，
	// 当时的注释写明「【只管资料卡、不管正文】……要扩到正文得另开一轮」。
	// 这一轮就是那个「另开一轮」：2026-10-11 线上样本（群 -1001883549197，checklist 消息）
	// 把广告全写在【正文】里，于是在这一侧一个字都没被读到 ——
	// 正文侧唯一的分项是「-3 命中豁免词：t.me」，广告号拿主人给正常用户的护身符
	// 把自己从 0 分压到 -3 分，与 9 月那两张资料卡【同一个漏放模式，只是换了一侧】。
	//
	// 【判据复用资料卡侧、分值刻意低一档】判据（什么算私有邀请链接）完全复用
	// hasAdPrivateInviteLink，不另写正则 —— 两条正则分散在文件两头早晚会一改一漏。
	// 分值用 AD_BODY_PRIVATE_INVITE_SCORE（3 分）而不是资料卡那个 7 分，理由见常量说明：
	// 简介是本人长期挂着的自证，正文只是一条转发链接，误封面差着一个数量级。
	const privateInvite = hasAdPrivateInviteLink(source);
	if (privateInvite) add(AD_BODY_PRIVATE_INVITE_SCORE, '正文含私有群一次性邀请链接（t.me/+ 或 joinchat）');

	let exemptHits = countAdKeywordHits(source, AD_EXEMPT_KEYWORDS);
	// 私有邀请链接不吃 t.me 豁免 —— 与资料卡侧同一条分流规则：同时写了
	// t.me/mychannel（公开频道）和 t.me/+xxx（私有群）的人，公开那条仍是正常用法，
	// 豁免照给；只有正文里【只有私有形态】时才剔。
	if (privateInvite && exemptHits.length && !hasAdPublicTelegramLink(source)) {
		const isTelegramExempt = (word) => AD_TELEGRAM_LINK_EXEMPT_WORDS.has(String(word).toLowerCase());
		const dropped = exemptHits.filter(isTelegramExempt);
		if (dropped.length) {
			exemptHits = exemptHits.filter((word) => !isTelegramExempt(word));
			reasons.push('（私有群邀请链接不吃 ' + dropped.join('/') + ' 豁免：该豁免只保护公开账号链接）');
		}
	}
	if (exemptHits.length) {
		const penalty = tradeHits.length ? AD_EXEMPT_PENALTY_WITH_TRADE : AD_EXEMPT_PENALTY;
		add(penalty, '正文命中豁免词：' + exemptHits.slice(0, 3).join('/') + (tradeHits.length ? '（含交易动词，减免打折）' : ''));
	}

	// ===== 私有邀请 + 同一个招揽/行业词重复 ≥3 次（2026-10-11 新增）=====
	//
	// 【治什么】词表盖不住的那一类 —— 线上样本正文里只有行业词（「假钞」×5、约炮），
	// 一个招揽动词都没有，于是掉进「单类词不计分」。私有邀请那条只给 3 分，
	// 单靠它到不了封禁线（这是刻意的，见 AD_BODY_PRIVATE_INVITE_SCORE），
	// 所以必须有第二条独立的定罪路径：不依赖招揽动词，看的是【规避行为本身】。
	// 3 + 8 = 11 撞线；正文里还带别的豁免词（「下载」「教程」这类）时 11 - 3 = 8，仍在封禁线之上。
	//
	// 【为什么是「同一个词 ≥3 次」而不是「合计 ≥3 次」】合计会把技术群里
	//「代理」+「订阅」+「节点」各出现一次算成 3 次，那是日常讨论。单个词连说三遍
	// 配上私有邀请码，在正常语境里只有一种解释：他要你扫码进群看这个。
	//
	// 【为什么不计豁免词】下面这个函数只数 AD_TRADE_VERBS 与 AD_BUSINESS_KEYWORDS，
	// 豁免词本来就不在其中 —— 「反复说『订阅』再拉群」不会误杀，正是这层想要的边界。
	if (privateInvite) {
		const repeat = findAdRepeatedSolicitWord(source);
		if (repeat.count >= AD_INVITE_REPEAT_MIN) {
			add(AD_INVITE_REPEAT_SCORE, '私有群邀请 + 同一招揽/行业词重复 '
				+ repeat.count + ' 次（' + repeat.word + '）');
		}
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
	// 判据本身足够严（4~6 位纯小写字母且零元音），正常频道极难命中。
	// 【现状与上面这段意图不符，如实标注】AD_RANDOM_CHANNEL_SCORE 自 b5899ab 创建起
	// 就是 0，从未落地过注释里说的「4 分 = isAd 门槛」（git -S 只有创建这一笔），
	// 也从未落地过「此前给 2 分」。所以这条判据当前【完全不计分】，只留一条痕。
	// 要恢复计分是改判据，得主人拍板，不在自动修复范围内。
	if (isAdRandomChannelName(title) || isAdRandomChannelName(username)) {
		if (AD_RANDOM_CHANNEL_SCORE > 0) add(AD_RANDOM_CHANNEL_SCORE, '来源频道名为随机字母串');
		// 0 分时走本文件其余 8 处统一的「不计分」留痕格式，不用 add(0, ...)：
		// 后者会 push 出「+0 xxx」，与按前缀识别正分判据的 AD_REASON_POSITIVE_RE 撞车
		//（虽然闸二那边已经改用 /^[1-9]/ 规避了，但格式不该有两种）。
		else reasons.push('（来源频道名为随机字母串，不计分：AD_RANDOM_CHANNEL_SCORE 当前为 0）');
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

// \u624B\u673A\u53F7\u6307\u7EB9\u7684\u5F52\u4E00\u5316\uFF1A\u5265\u6389 +\u3001\u7A7A\u683C\u3001\u8FDE\u5B57\u7B26\uFF0C\u53EA\u7559\u6570\u5B57\u3002
//
// \u3010\u4E3A\u4EC0\u4E48\u5FC5\u987B\u5355\u72EC\u5F52\u4E00\u3011\u540C\u4E00\u4E2A\u53F7\u5728\u4E0D\u540C\u540D\u7247\u91CC\u5199\u6CD5\u4F1A\u53D8\uFF1A\u300C+1 667 701 4838\u300D
// \u300C+16677014838\u300D\u300C1-667-701-4838\u300D\u3002\u53F7\u7801\u662F\u3010\u4E3B\u952E\u3011\uFF0C\u683C\u5F0F\u5DEE\u5F02\u4E0D\u8BE5\u8BA9\u5B83\u53D8\u6210\u4E09\u4E2A\u53F7 \u2014\u2014
// \u5E7F\u544A\u7EC4\u7EC7\u6362\u884C\u53F7\u683C\u5F0F\u518D\u6765\u4E00\u6B21\uFF0C\u6B63\u662F\u8FD9\u6761\u6307\u7EB9\u8981\u6321\u4F4F\u7684\u4E8B\u3002
//
// \u301010~15 \u4F4D\u7684\u4E0B\u4E0A\u9650\u3011E.164 \u5141\u8BB8\u6700\u957F 15 \u4F4D\uFF1B\u4E0B\u9650 10 \u4F4D\u662F\u4E3A\u4E86\u4E0D\u628A\u300C2026101112\u300D
// \u8FD9\u7C7B\u8BEF\u6293\u7684\u957F\u6570\u5B57\u4E32\u5F53\u6210\u53F7\u7801\u5165\u5E93 \u2014\u2014 \u4F4D\u6570\u4E0D\u591F\u7684\u591A\u534A\u4E0D\u662F\u7535\u8BDD\uFF0C\u5B81\u53EF\u4E0D\u5B66\u3002
function normalizeAdPhoneNumber(value) {
	const digits = String(value ?? '').replace(/[^\d]/g, '');
	if (digits.length < 10 || digits.length > 15) return '';
	return digits;
}

// ===== 资料形状哈希 · 同模板批量号跨账号复用 =====
//
// 批量广告号常常同模板：bio 是同一套文案，只换邀请链接、号码或昵称。第一个号被定罪后把
// 这份 bio 的「形状」学进 ad_profile_shapes，之后同形状的号在【零 AI】下就能命中 ——
// 模板再怎么换链接，也不会把同一套话术重新烧一遍判定。
//
// 【为什么只取 bio、不取昵称】昵称是低熵文本（同名者众，而且改昵称本来就是广告号的日常
// 操作），拿它做形状会显著扩大零 AI 的误伤面；号商与引流模板都写在 bio 里。bio 为空、
// 或归一化后没有区分度（只剩占位符、实质内容不足 4 字）时返回空串，不参与复用 ——
// 宁可不命中，也不能让两个正常人的短 bio 撞成同一个形状。
//
// 【占位符】链接、@用户名、数字段都是每换一个号就要改的部分，归一成同一串才对得上：
// 「专业收号 秒结 t.me/aaa」与「专业收号 秒结 t.me/bbb」必须是同一个形状。
// 替换必须【先长后短】：`http://t.me/xxx` 先被 t.me 那条整段吃掉，剩下的半截才不会被
// URL 那条再吃一次 —— 否则同一份资料会裂出两个形状，复用直接失效。
function adProfileShape(profile) {
	const raw = String(profile?.bio ?? '');
	if (!raw) return '';
	let s = raw
		// 零宽与不可见格式符：攻击者用它们在词内拆行规避匹配，
		// 残留会让同一份模板裂成多个形状。
		.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g, '')
		.toLowerCase();
	s = s
		.replace(/(?:https?:\/\/)?(?:www\.)?(?:t|telegram)\.(?:me|dog)\/\S+/g, '[链接]')
		.replace(/https?:\/\/\S+/g, '[链接]')
		.replace(/www\.\S+/g, '[链接]')
		.replace(/@[a-z0-9_]{3,}/g, '[号]')
		.replace(/\d+/g, '[数]')
		// 只保留字母（含中日韩）、数字与占位符，其余标点一律当分隔符清掉。
		.replace(/[^\p{L}\p{N}\[\]]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (!s) return '';
	// 实质内容（剥掉全部占位符）不足 4 字 = 没有区分度，两个人的短 bio 会撞成同一形状。
	const core = s.replace(/\[(?:链接|号|数)\]/g, '').replace(/\s+/g, '');
	if (core.length < 4) return '';
	return adTextHash(s);
}
// 读一条资料形状。查不到返回 null（= 未入库，既不算命中也不算干净）。
// 查询失败同样返回 null：形状层【只加分】，失败时少加一次分的代价是放行方向，
// 绝不会因为一次 D1 抖动就把正常人推向定罪 —— 与头像库那种「失败不得当 clean」
// 的方向性要求正好相反，这里 fail-open 才是对的。
async function readAdProfileShape(env, shape) {
	const key = String(shape || '');
	if (!env?.DB || !key) return null;
	try {
		const row = await env.DB.prepare(
			'SELECT shape, hits, false_positive_count, last_hit, sample FROM ad_profile_shapes WHERE shape = ?'
		).bind(key).first();
		return row || null;
	} catch (error) {
		console.error('[广告检测] 读取资料形状库失败:', error);
		return null;
	}
}

// 定罪即学习：此人被封时，把他 bio 的形状记进库并给复用次数 +1。
// 与指纹库同一语义 —— 资料模板是广告团队的公开复用资产，一次定罪就该拦住后面
// 所有同模板的号；而模板换多少个链接、换多少个号码都不改变形状本身。
async function learnAdProfileShape(env, shape, sample) {
	const key = String(shape || '');
	if (!env?.DB || !key) return false;
	const now = Math.floor(Date.now() / 1000);
	try {
		await env.DB.prepare(
			'INSERT INTO ad_profile_shapes (shape, hits, false_positive_count, last_hit, sample, created_at, updated_at) '
			+ 'VALUES (?, 1, 0, ?, ?, ?, ?) '
			+ 'ON CONFLICT(shape) DO UPDATE SET hits = ad_profile_shapes.hits + 1, '
			+ 'last_hit = excluded.last_hit, updated_at = excluded.updated_at'
		).bind(key, now, String(sample || '').slice(0, 300), now, now).run();
		return true;
	} catch (error) {
		console.error('[广告检测] 资料形状学习失败:', error);
		return false;
	}
}

// 误判纠错（/ignore 走这条路）：给命中的形状记一次误报，或直接删掉。
// 档位与指纹库 markAdFingerprintFalsePositive 一致：
//   默认档只累加误报（被动噪声清理）；purge 档（/ignore）当次即删 —— 主人已经明确
//   说了「这是误判」，不再攒次数。两张表的纠错口径必须同进同退。
async function markAdProfileShapeFalsePositive(env, shape, options = {}) {
	const key = String(shape || '');
	if (!env?.DB || !key) return { ok: false, reason: 'unavailable' };
	const purge = options.purge === true;
	const now = Math.floor(Date.now() / 1000);
	try {
		if (purge) {
			const res = await env.DB.prepare('DELETE FROM ad_profile_shapes WHERE shape = ?').bind(key).run();
			return { ok: true, removed: Number(res?.meta?.changes || 0) };
		}
		await env.DB.prepare(
			'UPDATE ad_profile_shapes SET false_positive_count = false_positive_count + 1, updated_at = ? WHERE shape = ?'
		).bind(now, key).run();
		return { ok: true, affected: 1 };
	} catch (error) {
		console.error('[广告检测] 资料形状纠错失败:', error);
		return { ok: false, reason: 'error' };
	}
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
		// phone 型指纹只比对名片里的手机号，不扫 haystack —— 与 username 同一个道理：
		// 号码是【主键】不是【文本】，扫进正文里会把「群里贴了个广告号码」的旁观者也命中。
		//
		// 【命中的语义】这个号码【有广告案底】（曾被定罪并入库），不是「有号码就算广告」。
		// 正常人的号码永远不会进库，自然永远命不中 —— 这正是主人 2026-10-11 定的口径：
		// 号码不是定位特征，已收录的广告指纹特征才是。
		if (row.type === 'phone') {
			const selfPhone = String(payload?.phone || '');
			if (!selfPhone || selfPhone !== row.normalized) continue;
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
	const AD_FINGERPRINT_QUOTA = { keyword: 6, bio: 1, domain: 3, username: 2, phone: 1 };
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

	// 手机号指纹（2026-10-11）。【只有名片消息才会有值】—— 非名片消息的 payload.phone
	// 恒为空串，这里连候选都不产生，学习路径零开销。
	// 权重给满 1：它与 domain / username 同属「身份复用键」，命中即定罪；
	// 误封面的挡板不在权重，而在【这个号必须先被定罪过才会进库】。
	if (payload?.phone) {
		const phone = normalizeAdPhoneNumber(payload.phone);
		if (phone) push('phone', phone, 1);
	}

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
// ===== 人工判定的学习：/spam /ban /sban 三条命令共用 =====
//
// 【为什么 /ban 与 /sban 也要学】此前只有 /spam 和自动定罪学，/ban 一个特征都不学。
// 而 /ban 是【人已经看过并认定是广告】，比模型判得准 —— menshen 把 /ban 的人工标记
// 称作「质量最高的训练样本」（它的闭环学习一节）。本项目此前的净效果是：
// 主人封得越多、漏得越多：封掉的那些【判定链压根没命中过】，特征一条都没进库，
// 下一批换个说法照样漏。演练同理 —— 它学的是「判定链命中过的」，而人工封的那些
// 恰恰是判定链没命中的。
//
// 【三段内容与 /spam 原有实现逐字一致，只是抽出来复用，逻辑一个字没改】
//   ① learnAdFingerprints —— 学指纹（keyword / domain / bio / phone）
//   ② addAdSample —— 加 AI 语义样本，正文太短时用引用块兜底
//   ③ enrichAdCommonPhrases —— 攒够一批新样本就提炼共现短语
//
// 【source 三档 spam / manual / sban】分开是为了将来按来源批量回滚。
// learnAdFingerprints 的豁免词闸门【只对 source='auto' 生效】，人工路径自动跳过 ——
// 那是既有设计（人工判定可信），这里不需要任何额外处理。
//
// 【options.text】调用方没给正文时才回退到 message 的 text/caption。
// 「不带引用的 /ban <id>」就走这条路：正文无从得知，只学资料卡。
async function learnAdFromOperatorAction(env, targetUserId, message, options = {}) {
	const source = String(options.source || 'manual');
	const createdBy = String(options.createdBy || '');
	const out = { learned: 0, sampleAdded: 0, enriched: 0 };
	try {
		// checklist 是与 text/caption 互斥的第六类正文来源 —— /spam /ban /sban 引用【清单】时
		// message.text 恒为 undefined，不接它就只学得到一张空正文的资料卡。
		const text = String(options.text ?? message?.text ?? message?.caption
			?? extractAdChecklistText(message));
		const profile = await fetchAdUserProfile(targetUserId, message?.from || {});
		const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
		const payload = {
			name,
			username: profile.username ? '@' + String(profile.username).replace(/^@/, '') : '',
			bio: profile.bio || '',
			text,
			domains: extractAdDomains([name, profile.bio, text].filter(Boolean).join('\n'))
		};
		const learn = await learnAdFingerprints(env, payload, { source, createdBy });
		out.learned = Number(learn?.learned || 0);

		// 语义样本：正文太短且不含举报 / 吐槽语义时改用引用块内容。
		// 线上漏放 50+ 个号的共同形态正是「正文只有一个字母 c、广告全在引用块里」——
		// 不这样做学进去的就是纯噪声，对召回零帮助还会误伤正常外国用户。
		const quoted = message ? getAdQuotedText(message) : '';
		const useQuoted = Boolean(quoted)
			&& text.trim().length <= AD_QUOTED_KILL_MAX_OWN_TEXT
			&& !countAdKeywordHits(text, AD_QUOTED_KILL_NEGATORS).length;
		const sampleText = buildAdSampleText({ name, bio: profile.bio || '', text: useQuoted ? quoted : text });
		if (sampleText.length >= 4) {
			const sample = await addAdSample(env, sampleText,
				{ source: useQuoted ? source + '-quoted' : source });
			if (sample.added) out.sampleAdded = 1;
		}

		// 短语提炼【无条件调用】—— 即使本次是重复样本，也可能已有若干新样本在等提炼，
		// 由函数内部的检查点判断是否到触发线。
		const enrich = await enrichAdCommonPhrases(env, loadAdDetectionConfig(env), {});
		if (enrich && enrich.learned > 0) out.enriched = enrich.learned;
	} catch (error) {
		// 【学习失败绝不影响命令本职】—— 加黑与封禁已经做完了，学习只是附带。
		console.error('[广告检测] 人工判定学习失败（' + source + '）:', error);
	}
	return out;
}

// 渲染学习回执。三条命令用同一套文案，只是来源不同。
function renderAdLearnLines(learn, source) {
	const lines = [];
	if (!learn) return lines;
	if (learn.learned > 0) lines.push('🧬 已学习广告指纹:' + learn.learned + ' 条(来源 /' + source + ' 人工判定)');
	if (learn.sampleAdded > 0) lines.push('🧠 已加 AI 语义样本:' + learn.sampleAdded + ' 条');
	if (learn.enriched > 0) lines.push('🧠 共性提炼:从新样本自动提炼出 ' + learn.enriched + ' 条指纹(共现 ≥2 次)');
	return lines;
}

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
			// is_seed：标记这条是【人工审过的中心特征】还是【/spam 学来的样本】。
			// 形态 E 的 fallback 要按「学来的样本数」判断冷启动 —— 种子永远在库（约 34 条），
			// 用总数判会让 fallback 永不触发（实现时实测：total 恒为 9~13，条件是死的）。
			const { results } = await env.DB.prepare(
				"SELECT sample_text, embedding, 1 AS is_seed FROM ad_sample_embeddings "
				+ "WHERE embedding IS NOT NULL AND COALESCE(source, '') IN ('seed', 'seed-core') "
				+ "UNION ALL "
				+ "SELECT sample_text, embedding, 0 AS is_seed FROM ("
				+ "SELECT sample_text, embedding, id FROM ad_sample_embeddings "
				+ "WHERE embedding IS NOT NULL AND COALESCE(source, '') NOT IN ('seed', 'seed-core') "
				+ "ORDER BY id DESC LIMIT ?"
				+ ")"
			).bind(AD_SAMPLE_LEARNED_QUERY_LIMIT).all();
			const rows = [];
			for (const row of results || []) {
				try {
					const vector = JSON.parse(String(row.embedding));
					if (Array.isArray(vector) && vector.length) {
						rows.push({
							text: String(row.sample_text || ''),
							vector,
							isSeed: Number(row.is_seed) === 1
						});
					}
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
	const sims = [];   // 形态 E：收集全部可比样本的相似度，供 top-K 排序（不额外调 AI）
	for (const sample of samples) {
		// 维度守卫：cosineSimilarity 用 Math.min(a.length, b.length) 截断，维度不一致时会
		// 静默算出一个无意义的相似度，可能随机越过阈值造成误封。换模型后库里必然残留旧维度向量
		// （本项目就从 768 维换到 1024 维），所以这里必须显式跳过而不是让它算。
		if (sample.vector.length !== vector.length) { skippedDim += 1; continue; }
		const similarity = cosineSimilarity(vector, sample.vector);
		sims.push(similarity);
		if (similarity > best) { best = similarity; bestSample = sample.text; }
	}
	if (skippedDim > 0) {
		// 提示运维：换过模型且未清空样本库。/clearsamples 后重新 /warmup 即可恢复第三层。
		console.warn('[广告检测] 跳过 ' + skippedDim + ' 条维度不匹配的样本向量'
			+ '（当前模型 ' + AD_EMBEDDING_MODEL + ' 输出 ' + vector.length + ' 维）'
			+ '，请用 /clearsamples 清空后重新 /warmup 生成。');
	}

	// ===== 形态 E：多样本聚合（top-K）=====
	// 关闭（K=0，默认）时 isMatch 仍是最朴素的「max 一条越线即定罪」。
	// 打开时要求 top-K 里至少 **过半** 条达硬阈值 —— 把定罪从单证改成多证。
	// 门槛随 K 自动走（K=3→2、K=5→3），不单独配 MIN_HITS：K 调了门槛还停在旧值会悄悄失衡。
	// 可比样本 < K 时**退回 max**：新广告刚学进 1 条样本，不该因为「凑不满 K 条」而漏。
	// 只收紧 isMatch，不动 isSoft —— 软加分只是凑分（+2），单条够宽松不会导致误封。
	const topK = Number(config?.aiTopK ?? AD_AI_TOP_K);
	let isMatch = best >= config.aiSimilarityThreshold;
	const topKInfo = { enabled: false, k: 0, minHits: 0, hits: 0, total: sims.length, learned: 0, rejected: false, fallback: false };
	if (topK > 0) {
		topKInfo.enabled = true;
		topKInfo.k = topK;
		// 过半（K=3→2、K=5→3），至少 1
		const minHits = Math.max(1, Math.ceil(topK / 2));
		topKInfo.minHits = minHits;
		// 【按学来的样本数判断冷启动，不能按总数】种子永远在库（约 34 条），
		// 按总数判 fallback 永不触发（实测 total 恒为 9~13 ≥ K），新广告学进 1 条就会被判
		// hits=1<2 而漏掉。种子仍【参与 top-K 排序】—— 它是人工审过的有效证据，
		// 只是不参与「样本够不够」这个冷启动判断。
		// 用 `=== false` 而不是 `!isSeed`：万一读到改代码之前的旧缓存（没有该字段），
		// undefined 会被算成「学来的」→ learned 虚高 → 漏掉 fallback 收紧了判据。
		// 宁可 learned=0 走 fallback 退回宽松的 max，也不能朝误封的方向偏。
		topKInfo.learned = samples.filter((s) => s.isSeed === false).length;
		if (topKInfo.learned < topK) {
			topKInfo.fallback = true;   // 学来的样本不足 K → 保持 max 判定（冷启动保召回）
		} else {
			const sorted = [...sims].sort((a, b) => b - a).slice(0, topK);
			topKInfo.hits = sorted.filter((s) => s >= config.aiSimilarityThreshold).length;
			if (topKInfo.hits >= minHits) {
				isMatch = true;    // 必然成立：max 是 sorted[0]，hits≥min 已隐含 max 达线
			} else {
				isMatch = false;
				// 【只有 max 确实越线、但达线条数不够】才配叫 rejected —— 那才是注释里的
				//「越线但证据不够」。max 压根没越线的是普通未命中：原先无条件置 true，
				// 会让使用处那条文案输出「相似度 0.417 ≥ 阈值 0.78」这种自相矛盾的话，
				// 把「没达线」说成「达线了但证据不足」—— 线上 ad_join_checks 里大量存在，
				// /pending 复核与诊断都会被它误导（本轮诊断就被带偏过一次）。
				// isMatch 两种情况都是 false，判定结果一字不变，错的只是留痕。
				topKInfo.rejected = best >= config.aiSimilarityThreshold;
			}
		}
	}

	return {
		available: true,
		similarity: best,
		sample: bestSample,
		isMatch,
		isSoft: best >= AD_AI_SOFT_BONUS_FLOOR && best < config.aiSimilarityThreshold,
		topK: topKInfo
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

// 正文侧的私有邀请分值 —— 【与资料卡侧刻意不同档，是 3 分而不是 7 分】
//
// 【为什么正文要低一档】资料卡那个 7 分的全部依据是主人那句「正常用户是不会放私有群
// 在用户简介上的」，而简介是【他写的、长期挂着的】，写进去等于自己站台。
// 正文不是：群里发一条邀请链接（拉人进群、分享自己的群、群活动报名）是极常见的正常行为，
// 现有注释也写着「正文里发群链接在正常群聊里远比写进个人简介常见」。
// 所以正文侧拿 +7 会让「谁发一次邀请链接就封谁」成为现实的误封面 —— 那不是判据，是陷阱。
//
// 【为什么是 3】它只负责把这条证据【记账】，不负责定罪。定罪交给下面那条
// 「私有邀请 + 同一招揽/行业词复读 ≥3 次」（AD_INVITE_REPEAT_SCORE = 8）——
// 单发一条链接是 3 分（< 观察线 5，直接 PASS）；
// 带着行业词复读三遍再拉群的才是广告，3 + 8 = 11 分撞封禁线。
// 这样分层后，两侧行为不同却各自说得通：资料卡 = 自己站台（重判），正文 = 转发一条链接（轻判）。
const AD_BODY_PRIVATE_INVITE_SCORE = 3;

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

// ===== 私有邀请 + 招揽词复读（2026-10-11）=====
// 判据本体见 scoreAdMessageText 里那一段。这两个常量与 AD_PRIVATE_INVITE_SCORE 放在
// 同一处物理位置 —— 它们描述的是同一个形态（私有群一次性邀请链接）的两档证据强度。
const AD_INVITE_REPEAT_MIN = 3;
// 【8 分而不是 7】这条判据必须在【豁免扣分之后】叠加，而正文侧仍有别的豁免词可能生效
//（比如同一句里带「下载」「教程」）。取 7 时被 -3 压到 4 分，刚好掉出观察线，
// 这条判据就白加了；取 8 则最坏情形 8 - 3 = 5 仍在观察线之上。
// 正常情形（无其它豁免词）8 分直接越过封禁线 7 —— 与私有邀请那条的分值不冲突，
// 两者同命中时叠加到 15 分，语义上也对：这是两条互相独立的证据。
const AD_INVITE_REPEAT_SCORE = 8;

// 找出正文里【出现次数最多的那一个】招揽动词或行业词，返回 { word, count }。
//
// 【为什么不去重后只看命中列表】countAdKeywordHits 返回的是去重后的词列表，
// 「假钞」出现 5 次和出现 1 次在它眼里完全一样，而这两者的含义天差地别 ——
// 复读本身是行为特征，不是内容特征。
//
// 【为什么要同时比对去混淆文本】与全项目词表匹配同一个口径（buildAdMatchTexts）：
// 逐字分隔、全角半角混排这类规避手法换个写法就绕过了 includes，那就等于没判。
//
// 【为什么不查重叠词】`假钞` 与 `假钞嫖娼` 里的 `假钞` 是同一个 needle，
// 子串计数天然算作两次，这正是想要的（复读计的是「这个词被写了几次」）。
function findAdRepeatedSolicitWord(text) {
	const source = String(text ?? '');
	if (!source) return { word: '', count: 0 };
	const variants = buildAdMatchTexts(source).map((v) => v.toLowerCase());
	let best = { word: '', count: 0 };
	for (const word of [...AD_TRADE_VERBS, ...AD_BUSINESS_KEYWORDS]) {
		const needle = String(word).toLowerCase();
		if (!needle) continue;
		for (const variant of variants) {
			let count = 0;
			let index = variant.indexOf(needle);
			while (index !== -1) {
				count += 1;
				index = variant.indexOf(needle, index + needle.length);
			}
			if (count > best.count) best = { word, count };
		}
	}
	return best;
}

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

// ===== 昵称剥离复验（2026-09-22 线上连环误封 7307358097 @svipultra）=====
//
// 【要治的病】这个号任意发言就被封，连发 5 次，相似度随封禁次数单调上升：
//   0.794(#1722) → 0.798(#1883) → 0.811(#2010) → 0.815(#1881) → 0.828(#2014)
// 这是一个自我强化闭环，四个环节咬在一起：
//   ① 闸一的 bio 写死为空且 ban 就地处置，他 bio 里的豁免词（私聊 / Bot）从未被读到 → 得分 0
//   ② 得分 0 时 #1615 那道 `score < 0` 的豁免否证不生效（0 < 0 为假）
//   ③ 语义文本 = name + bio + text，bio 为空时「Angel 有毒」里昵称占 5/7 字 → 昵称主导向量
//   ④ 每次误封都学一条「Angel ×××」进样本库 → 下次他说任何话都必然高相似
// 关键事实：他被封时【得分 0、指纹层未命中、四通道结构查杀全放行】—— 四层里三层都说他没问题，
// 只有 AI 层一个人定罪，而那个相似度完全是昵称跟库里 5 条「Angel ×××」重合刷出来的。
//
// 【为什么不调阈值、不改 buildAdSampleText 的拼法】
//   · 调阈值（或把 `score < 0` 改成 `score <= 0`）是按样本调数字 —— 本项目在连带门槛上
//     已经吃过三次这个教训（12 字 → 4 字 → 取消），下个样本 0.86 又要再调一轮。
//   · 改 buildAdSampleText 去掉 name 会让全库存量样本的 adTextHash 全部失效，
//     历史 /ignore 与 /unban 的回滚记录一次性作废，还会丢掉「昵称即广告」那类号的召回。
//     所以【那个函数一个字都不动】，这里另开一个同源取材口径。
//
// 【改的是判据】AI 层定罪时，必须确认这份相似度不是只由「与广告话术无关的恒定字段」贡献的。
// 落法就是把昵称剥掉重算一次：
//   真广告号的话术写在 bio 与正文里（要让人看见广告，就得写在别人看得见的地方），
//   剥掉昵称照样命中 → 定罪成立，召回零损失。
//   Angel 剥掉昵称后只剩「有毒」两个字 → 什么都不像 → 降级为软加分。
//
// 【刻意与 buildAdSampleText 共用 normalizeAdSemanticText】复验文本与样本文本必须经过
// 同一套链接归一化，否则一边把 URL 换成占位符、一边留着原文，两边的向量不可比。
function buildAdSampleTextWithoutName(payload) {
	return normalizeAdSemanticText([payload?.bio, payload?.text].filter(Boolean).join(' ').trim());
}

// 剥掉昵称之后还剩多少【实质广告话术】（再剥一层链接占位符，理由见 adSemanticCoreLength）。
// 两端共用：检测端判「这次的相似度是否昵称独占贡献」，学习端判「这条样本值不值得入库」。
// 一处定义保证两端永不分叉 —— 检测端 veto 了却照样把样本学进库，下次照样误封。
function adSampleBodyCoreLength(payload) {
	return adSemanticCoreLength(buildAdSampleTextWithoutName(payload));
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
		// 【avatarId / avatarFileId 必须跟着进缓存】原先这里只存
		// firstName/lastName/username/bio 与后来补上的 badgeId，于是缓存命中时
		// 这两个字段是 undefined —— applyAvatarToEvaluation 拿到空串直接返回，
		// 【头像判据在 5 分钟缓存有效期内完全失效】：同一个人 5 分钟内第二条
		// 消息起，头像指纹一次都不查。而刷屏 / 连续对话恰恰是缓存最热的时候，
		// 也就是广告号连发消息时最查不到。实测（test_ad_badge [2] 段）：
		// 修前 profile.avatarId 是 undefined，修后读得回 big_file_unique_id。
		//
		// avatarFileId 一并存的理由：registerAdAvatar 要靠它登记 L2 的下载句柄，
		// 丢了它，「缓存命中且表里还没这行」会把空 file_id 写进去，
		// 之后视觉识别无句柄可用。5 分钟内 file_id 必然还有效（图没换），
		// 所以存它不会过期失效。
		//
		// badgeId 是批次 C 补的，理由相同（漏存则第二条消息起会员标判据失效）。
		profile: {
			firstName: profile.firstName,
			lastName: profile.lastName,
			username: profile.username,
			bio: profile.bio,
			avatarId: profile.avatarId,
			avatarFileId: profile.avatarFileId,
			badgeId: profile.badgeId
		},
		expiresAt: Date.now() + AD_PROFILE_CACHE_TTL_MS
	});
}

// getChat 失败时该不该重试、等多久。返回等待秒数 = 值得重试；返回 null = 不重试。
//
// 只有 429（Too Many Requests / flood control）是「等一下就会好」的，读 Telegram
// 给的 retry_after；其余错误重试纯属浪费子请求预算 —— 最常见的是 400 chat not found，
// 那是「对方从未与 bot 私聊过」的常态拒答，等多久都不会变。
function adFetchRetryAfter(result) {
	const code = Number(result?.error_code) || 0;
	const desc = String(result?.description || '');
	if (code !== 429 && !/too many requests|flood/i.test(desc)) return null;
	const wait = Number(result?.parameters?.retry_after);
	// 上限 3 秒：retry_after 再长也不值得把这一次判定挂住 —— 复查是按队列轮转的，
	// 下一轮 cron 还会再取到这个人。
	return Number.isFinite(wait) && wait > 0 ? Math.min(wait, 3) : 1;
}

async function fetchAdUserProfile(userId, fallback = {}) {
	const profile = {
		firstName: String(fallback.firstName ?? fallback.first_name ?? ''),
		lastName: String(fallback.lastName ?? fallback.last_name ?? ''),
		username: String(fallback.username ?? ''),
		bio: '',
		status: '',
		// 头像指纹（L1 主键）与下载句柄（L2 一次性用）：
		//   avatarId       ← ChatPhoto.big_file_unique_id / small_file_unique_id，
		//                     官方：跨时间、跨 bot 稳定 → 指纹主键，可跨号比对；
		//   avatarFileId   ← big_file_id / small_file_id，
		//                     官方：只能用于下载且「only for as long as the photo is not
		//                     changed」→ 只在视觉识别那一刻用，绝不入库当主键。
		avatarId: '',
		avatarFileId: '',
		// 会员标（emoji status）指纹主键 ← ChatFullInfo.emoji_status_custom_emoji_id。
		// getChat 已经把整份 ChatFullInfo 带回来了，取它是零成本的（见 ad_badges）。
		// 与 avatarId 一样，空串表示「此人没有自定义标」—— 没有标就无从谈同款，
		// 既不查库也不登记。挂官方 Premium 蓝星的号若不带这个字段，同样落到空串。
		badgeId: '',
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
		// 【429 重试】定时滚动复查是一次性批量连打几十人，撞 Telegram 限流是常态
		// （本文件另一处注释就写着「失败多半是 429」）。线上实测：入群线单发成功率
		// 约 69%，复查线批量只有约 2% —— 名册 16109 人里走到判定的仅 6 人，绝大多数
		// 卡在 bioFetched 处早退，闸三等于空转。只对可重试错误多试一次，见
		// adFetchRetryAfter：429 才重试，400 chat not found 一次都不重试。
		let result = null;
		let retryWait = 0;
		for (let attempt = 0; attempt < 2; attempt++) {
			if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, retryWait * 1000));
			const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ chat_id: String(userId) })
			});
			result = await response.json();
			if (result?.ok) break;
			retryWait = adFetchRetryAfter(result);
			if (retryWait === null) break;
		}
		const data = result?.result;
		if (result?.ok && data) {
			profile.firstName = String(data.first_name ?? profile.firstName);
			profile.lastName = String(data.last_name ?? profile.lastName);
			profile.username = String(data.username ?? profile.username);
			profile.bio = String(data.bio ?? data.description ?? '');
			// 头像两个字段一起取（getChat 已经把 ChatFullInfo 带回来了，取它是零成本的）。
			// 没有头像的号留空 —— 空 avatarId 表示「此人无头像」，既不查库也不推理。
			const photo = data.photo || null;
			profile.avatarId = String(photo?.big_file_unique_id || photo?.small_file_unique_id || '');
			profile.avatarFileId = String(photo?.big_file_id || photo?.small_file_id || '');
			// 会员标同样在这一份 ChatFullInfo 里（emoji_status_custom_emoji_id），
			// 与头像并排取，不多花一个请求。空串 = 没有自定义标（含挂官方蓝星的号，
			// 若官方标不走这个字段）—— 见 ad_badges 表注释里对蓝星的处理。
			profile.badgeId = String(data.emoji_status_custom_emoji_id || '');
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
// ===== 头像指纹（L1）=====
// 主键是 ChatPhoto.big_file_unique_id：官方保证「跨时间、跨 bot 稳定」，
// 所以同一个广告素材做的马甲号会落到同一行，一次判定终身复用。
// 这一层不花任何 Telegram 请求 —— 头像是 getChat 顺带返回的字段。

// 读一条头像指纹。查不到返回 null（= 未入库，既不是 ad 也不是 clean）。
async function readAdAvatar(env, fileUniqueId) {
	const key = String(fileUniqueId || '');
	if (!env?.DB || !key) return null;
	try {
		const row = await env.DB.prepare('SELECT file_unique_id, verdict, hits, source, last_user_id, vision_checked_at, created_at, updated_at FROM ad_avatars WHERE file_unique_id = ?').bind(key).first();
		return row || null;
	} catch (error) {
		// 查不到不等于干净：失败按「未入库」处理，下一条消息再试，
		// 绝不把查询失败当成 clean 去放行。
		console.error('[广告检测] 读取头像指纹失败:', error);
		return null;
	}
}

// 登记一个头像（verdict=pending），供 L2 视觉识别排队。
// 只在「表里还没有这一行」时调用一次 —— 稳定态下每条消息零写入。
async function registerAdAvatar(env, profile, userId) {
	const fileUniqueId = String(profile?.avatarId || '');
	if (!env?.DB || !fileUniqueId) return false;
	return upsertAdAvatar(env, fileUniqueId, {
		verdict: 'pending',
		fileId: String(profile?.avatarFileId || ''),
		lastUserId: String(userId || '')
	});
}

// 写入 / 更新一条头像指纹。patch 里的字段只覆盖传了的那几个。
async function upsertAdAvatar(env, fileUniqueId, patch = {}) {
	const key = String(fileUniqueId || '');
	if (!env?.DB || !key) return false;
	const now = Math.floor(Date.now() / 1000);
	const verdict = patch.verdict != null ? String(patch.verdict) : 'pending';
	const fileId = patch.fileId != null ? String(patch.fileId) : '';
	const source = patch.source != null ? String(patch.source) : null;
	const lastUserId = patch.lastUserId != null ? String(patch.lastUserId) : null;
	const visionCheckedAt = Number(patch.visionCheckedAt) || 0;
	try {
		await env.DB.prepare(
			'INSERT INTO ad_avatars (file_unique_id, verdict, hits, file_id, source, last_user_id, vision_checked_at, created_at, updated_at) '
			+ 'VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?) '
			+ 'ON CONFLICT(file_unique_id) DO UPDATE SET '
			+ 'verdict = CASE WHEN ad_avatars.verdict = \'ad\' THEN ad_avatars.verdict ELSE excluded.verdict END, '
			+ 'file_id = CASE WHEN excluded.file_id != \'\' THEN excluded.file_id ELSE ad_avatars.file_id END, '
			+ 'source = COALESCE(excluded.source, ad_avatars.source), '
			+ 'last_user_id = COALESCE(excluded.last_user_id, ad_avatars.last_user_id), '
			+ 'vision_checked_at = CASE WHEN excluded.vision_checked_at > 0 THEN excluded.vision_checked_at ELSE ad_avatars.vision_checked_at END, '
			+ 'updated_at = excluded.updated_at'
		).bind(key, verdict, fileId, source, lastUserId, visionCheckedAt, now, now).run();
		return true;
	} catch (error) {
		console.error('[广告检测] 写入头像指纹失败:', error);
		return false;
	}
}

// 定罪即学习：此人被封时，把他的头像记成广告头像，并给该头像的「复用次数」+1。
// 与指纹库的定罪即学习同一逻辑 —— 头像素材是广告团队批量复用的，
// 一次定罪就能拦住后面所有用同一张图的号。
async function learnAdAvatarOnBan(env, fileUniqueId, userId) {
	const key = String(fileUniqueId || '');
	if (!env?.DB || !key) return false;
	const now = Math.floor(Date.now() / 1000);
	try {
		await env.DB.prepare(
			'INSERT INTO ad_avatars (file_unique_id, verdict, hits, source, last_user_id, vision_checked_at, created_at, updated_at) '
			+ 'VALUES (?, \'ad\', 1, \'learned\', ?, 0, ?, ?) '
			+ 'ON CONFLICT(file_unique_id) DO UPDATE SET verdict = \'ad\', hits = ad_avatars.hits + 1, '
			+ 'source = \'learned\', last_user_id = excluded.last_user_id, updated_at = excluded.updated_at'
		).bind(key, String(userId || ''), now, now).run();
		return true;
	} catch (error) {
		console.error('[广告检测] 头像定罪学习失败:', error);
		return false;
	}
}

// 误封纠错（/ignore 走这条路）：把该用户的头像转成 clean，
// 防止「同头像的人全被连坐」—— 头像会被盗用，这是头像判据唯一的安全阀。
async function clearAdAvatarOnIgnore(env, fileUniqueId) {
	const key = String(fileUniqueId || '');
	if (!env?.DB || !key) return false;
	const now = Math.floor(Date.now() / 1000);
	try {
		await env.DB.prepare('INSERT INTO ad_avatars (file_unique_id, verdict, hits, source, vision_checked_at, created_at, updated_at) VALUES (?, \'clean\', 0, \'manual\', 0, ?, ?) ON CONFLICT(file_unique_id) DO UPDATE SET verdict = \'clean\', hits = 0, source = \'manual\', updated_at = excluded.updated_at').bind(key, now, now).run();
		return true;
	} catch (error) {
		console.error('[广告检测] 头像纠错失败:', error);
		return false;
	}
}

// 把头像命中叠加到已有判定结果上（纯函数，不动原对象）。
// 【为什么单独一层而不塞进评分函数】头像是「人跨消息恒定」的证据，
// 与正文/简介的「单条消息证据」性质不同；混进评分会重复计分，
// 也会让既有的评分断言全部失真。叠在 applyHistory 之后 = 最终裁决位。
//
// 分档（防误封的核心）：
//   ad + 复用定罪 >= 2 次  → 单独即可封（同一张广告素材反复出现在被封的人身上）
//   ad + 本次已有任何判据   → 封（头像与正文/简介互相印证）
//   ad + 本次干净           → 只进观察，不封（头像可能被盗用，单证不定罪）
//   clean / pending / 无头像 → 原样返回，一个字节都不改
function applyAvatarVerdict(evaluation, avatar) {
	if (!evaluation || !avatar) return evaluation;
	if (String(avatar.verdict || '') !== 'ad') return evaluation;
	const hits = Number(avatar.hits) || 0;
	const hasCorroboration = (evaluation.reasons || []).length > 0 || (Number(evaluation.score) || 0) >= 2;
	const reason = '头像命中广告图库（复用定罪 ' + hits + ' 次）';
	const reasons = (evaluation.reasons || []).concat([reason]);
	let verdict = evaluation.verdict;
	if (hits >= 2) verdict = 'ban';
	else if (hasCorroboration) verdict = 'ban';
	else verdict = evaluation.verdict === 'ban' ? 'ban' : 'observe';
	// score 只作展示：头像不改评分口径，避免与历史分叠加时重复计分。
	return Object.assign({}, evaluation, { verdict, reasons });
}

// 异步包装：有头像就读库叠判，没头像（闸一的 cheapProfile 恒为空、getChat 失败的号）
// 直接原样返回 —— 于是【闸一热路径零 D1 读、零 Telegram 请求】，预算不受影响。
async function applyAvatarToEvaluation(env, evaluation, profile) {
	const avatarId = String(profile?.avatarId || '');
	if (!evaluation || !avatarId) return evaluation;
	const avatar = await readAdAvatar(env, avatarId);
	if (!avatar) {
		// 首次见到这个头像：登记成 pending，L2 视觉识别才有东西可排队。
		// 只发生一次 —— 行存在之后就走稳定态的「只读不写」，热路径零额外写入。
		await registerAdAvatar(env, profile);
		return evaluation;
	}
	return applyAvatarVerdict(evaluation, avatar);
}

// ===== 同款会员标指纹（L1）=====
//
// 【它凭什么是一个判据】主人给的六个广告号里有三个挂同一个自定义标
// （标上写的就是「看我简介」，与他们共用的那张头像同一套话术）——
// 标是广告组织统一配发的物料，正常用户挂的是官方 Premium 蓝星或各挑各的，
// 所以「同一个标出现在多个被定罪的号身上」= 同一批人在作案。
// 主键 emoji_status_custom_emoji_id 是 getChat 顺带返回的，零 Telegram 请求。
//
// 【与头像层的三点不同，别照抄头像的分档】
//   ① 没有 register / pending：这层不做视觉识别，没有队列可排队，
//      查不到就是没入过库，直接原样返回（少一次写入，热路径更省）
//   ② 分档【刻意比头像严】：头像是 `hits >= 2 单独即可封`，这里取消了那一档
//   ③ 命中时【只加 reasons 不改 score】，与头像层一致，避免历史分重复计分
//
// 【安全阀：会员标永不单独定罪】这是这个判据唯一需要小心的地方 ——
// 官方蓝星若也带 emoji_status_custom_emoji_id，那它对所有挂星的号是【同一个值】：
// 只要一个挂星的号因头像/bio 被定罪，蓝星 id 就进库，之后所有挂星的人全命中。
// 没有这道阀，一次误封会被同款指纹放大成一批误封，正好砸在「正常号 vs 广告号」
// 这条主人反复强调的分界上。于是：
//   · hits < 3（这个标最多只在 1~2 个被定罪的号上出现过）→ 无论本次多像广告都不由它定罪
//   · 本次一条佐证都没有 → 同样不由它定罪（单证不定罪，与分档总原则一致）
//   · 两者都满足才推封；否则原 verdict 一个字节不改，只在 reasons 里留痕
// 真广告标会被反复定罪、hits 很快越过 3；而一个「碰巧常见」的标（蓝星）
// 要越过 3 意味着已经有三个挂它的人各自因别的强证据被定罪 ——
// 那时该封的本来也封了，badge 只是确认了他们同属一批。
const AD_BADGE_BAN_HITS = 3;

// 读一条会员标指纹。查不到返回 null（= 未入库，既不是 ad 也不是 clean）。
async function readAdBadge(env, badgeId) {
	const key = String(badgeId || '');
	if (!env?.DB || !key) return null;
	try {
		const row = await env.DB.prepare('SELECT badge_id, verdict, hits, source, last_user_id, created_at, updated_at FROM ad_badges WHERE badge_id = ?').bind(key).first();
		return row || null;
	} catch (error) {
		// 查不到不等于干净：失败按「未入库」处理，下一条消息再试，
		// 绝不把查询失败当成 clean 去放行（与头像层同一条方向性要求）。
		console.error('[广告检测] 读取会员标指纹失败:', error);
		return null;
	}
}

// 定罪即学习：这个号被封时，把他的会员标记成广告素材。
// hits 累加 = 挂过这个标且被定罪的人数，正是安全阀读的那个数。
async function learnAdBadgeOnBan(env, badgeId, userId) {
	const key = String(badgeId || '');
	if (!env?.DB || !key) return false;
	const now = Math.floor(Date.now() / 1000);
	try {
		await env.DB.prepare(
			'INSERT INTO ad_badges (badge_id, verdict, hits, source, last_user_id, created_at, updated_at) '
			+ 'VALUES (?, \'ad\', 1, \'learned\', ?, ?, ?) '
			+ 'ON CONFLICT(badge_id) DO UPDATE SET verdict = \'ad\', hits = ad_badges.hits + 1, '
			+ 'source = \'learned\', last_user_id = excluded.last_user_id, updated_at = excluded.updated_at'
		).bind(key, String(userId || ''), now, now).run();
		return true;
	} catch (error) {
		console.error('[广告检测] 会员标定罪学习失败:', error);
		return false;
	}
}

// 误封纠错（/ignore 走这条路）：把这个标转成 clean 并把 hits 归零，
// 防止「同标的人全被连坐」—— 与头像、图片两张表的纠错口径逐字一致。
async function clearAdBadgeOnIgnore(env, badgeId) {
	const key = String(badgeId || '');
	if (!env?.DB || !key) return false;
	const now = Math.floor(Date.now() / 1000);
	try {
		await env.DB.prepare('INSERT INTO ad_badges (badge_id, verdict, hits, source, created_at, updated_at) VALUES (?, \'clean\', 0, \'manual\', ?, ?) ON CONFLICT(badge_id) DO UPDATE SET verdict = \'clean\', hits = 0, source = \'manual\', updated_at = excluded.updated_at').bind(key, now, now).run();
		return true;
	} catch (error) {
		console.error('[广告检测] 会员标纠错失败:', error);
		return false;
	}
}

// 把会员标命中叠加到已有判定结果上（纯函数，不动原对象）。
// 结构对齐 applyAvatarVerdict，分档差异见 AD_BADGE_BAN_HITS 上方那段说明。
function applyBadgeVerdict(evaluation, badge) {
	if (!evaluation || !badge) return evaluation;
	if (String(badge.verdict || '') !== 'ad') return evaluation;
	const hits = Number(badge.hits) || 0;
	const hasCorroboration = (evaluation.reasons || []).length > 0 || (Number(evaluation.score) || 0) >= 2;
	// 文案对两种来源都成立：昵称旁的会员标与正文里的贴纸 emoji 共用这张表、
	// 这道阀，所以措辞是「自定义 emoji 素材」而不是专指会员标。
	const reasons = (evaluation.reasons || []).concat([
		'同款自定义 emoji 素材（挂过它且被定罪 ' + hits + ' 次）'
		+ (hits >= AD_BADGE_BAN_HITS && hasCorroboration ? '' : '，单证不足不单独定罪')
	]);
	let verdict = evaluation.verdict;
	if (hits >= AD_BADGE_BAN_HITS && hasCorroboration) verdict = 'ban';
	// 其余情形 verdict 保持原样：不把 pass 提成 observe（那会让每一个撞上
	// 常见标的人被记一笔、在观察窗口里叠历史分），也不降级。
	// score 同样不改 —— 会员标不是评分口径的一部分，改了会与历史分重复计。
	return Object.assign({}, evaluation, { verdict, reasons });
}

// 叠判入口：一次处理【昵称旁的会员标】与【正文里的自定义贴纸 emoji】两件事。
// 两者同源（都是 custom emoji、同一个数字 id 体系）、同表（ad_badges）、同阀
// （AD_BADGE_BAN_HITS + 必须有佐证），所以合成一个入口 —— 5 个调用点一个都不用改，
// 只要调用方把 profile.customEmojiIds 挂上即可。
async function applyBadgeToEvaluation(env, evaluation, profile) {
	let current = evaluation;
	if (!current) return current;
	// ① 昵称旁的会员标（批次 C）：id 在 getChat 的 ChatFullInfo 里。
	const badgeId = String(profile?.badgeId || '');
	if (badgeId) {
		const badge = await readAdBadge(env, badgeId);
		if (badge) current = applyBadgeVerdict(current, badge);
	}
	// ② 正文里的自定义贴纸 emoji（批次 B-2）：id 在 update 的 entities 里，
	//    闸一就拿得到 —— 所以这一半连 getChat 都不需要，纯查库。
	const ids = Array.isArray(profile?.customEmojiIds) ? profile.customEmojiIds : [];
	for (const id of ids) {
		if (!id || id === badgeId) continue;
		const badge = await readAdBadge(env, id);
		if (badge) current = applyBadgeVerdict(current, badge);
	}
	return current;
}

// ===== 第四路：生成式深度判定（LLM）=====
//
// 前三层全是【查表】：词表要列到、指纹库要学过、bge-m3 要样本库里有近似才超阈值。
// 样本外的新话术一律 0 分（线上实测 `来替我收米 一天9千` 拿 0 分）。这一路不查表，
// 直接把资料与正文交给生成式模型判 —— 模型不用有人教它「收米 = 收钱」。
//
// 定位是【补位不是替代】：只在前三层没能定罪时才跑，命中理由写进 reasons 与
// `/pending` 快照，与其它判据一样可用 `/ignore` 纠错。

// 载荷 → JSON 字符串。字段与前三层共用同一个 profile 对象，零额外 Telegram 请求。
function buildAdLLMPayload(input) {
	const profile = input?.profile || {};
	return JSON.stringify({
		username: String(profile.username || ''),
		first_name: String(profile.firstName ?? profile.first_name ?? ''),
		last_name: String(profile.lastName ?? profile.last_name ?? ''),
		bio: String(profile.bio || ''),
		message: String(input?.text || '').slice(0, 600)
	});
}

// 从模型回答里抠 JSON。解析不出来一律按「未命中」处理 —— 宁可漏判也不能靠猜定罪。
// 结构与 parseAvatarVisionAnswer 同构（同是「模型吐 JSON、抠不出就当没判」）。
// 从 Workers AI 的返回里取出模型的文本回答。
//
// 【治的是什么】2026-10-11 线上日志实锤：`原文前200字: [object Object]` ——
// 旧代码只认 `aiResult.response ?? aiResult.result`，而 Workers AI 对【chat 模型】
// 返回的是 OpenAI 兼容结构 `{ id, object, created, model, choices[0].message.content, usage }`，
// 两个字段名都不在，于是兜底到整个对象、String 化成 `[object Object]`。
// 结果是第⑥层【从上线到今天一次都没真正读到过模型的回答】——
// 242 次调用、0 次判为广告，不是模型保守，是答案根本没被取出来。
//
// 【为什么要留旧字段名】Workers AI 对不同模型返回的外壳并不统一：
// 部分视觉 / 嵌入模型走 `{ result: ... }`，早期版本与部分任务走 `{ response: ... }`。
// 一律按「能拿到字符串就用」的顺序兜，宁可多认几个字段，
// 也不要因为换了个模型又静默回到「读不出来但不报错」的老状态。
//
// 【顺序有讲究】choices 必须排最前 —— 它是 chat 模型唯一权威的正文位置。
// 排在 response 之后的话，某些返回同时带这两个字段时会取到外壳而不是正文。
function extractAdLLMResponseText(aiResult) {
	if (!aiResult) return '';
	// ① OpenAI 兼容结构（chat 模型的默认返回）
	const content = aiResult?.choices?.[0]?.message?.content;
	if (typeof content === 'string' && content.trim()) return content;
	// ② 旧式单字段结构与嵌套变体
	for (const key of ['response', 'result', 'output', 'answer']) {
		const value = aiResult?.[key];
		if (typeof value === 'string' && value.trim()) return value;
		if (value && typeof value === 'object') {
			const nested = value?.response ?? value?.content ?? value?.text;
			if (typeof nested === 'string' && nested.trim()) return nested;
		}
	}
	// ③ 整个返回本身就是一段纯文本
	if (typeof aiResult === 'string' && aiResult.trim()) return aiResult;
	return '';
}

function parseAdLLMAnswer(raw) {
	const text = String(raw || '').trim();
	if (!text) return null;
	const matched = text.match(/\{[\s\S]*\}/);
	if (matched) {
		try {
			return buildAdLLMAnswer(JSON.parse(matched[0]));
		} catch (_) {
			// JSON 抠到了但解析失败 —— 多半是 max_tokens 截断把右括号切掉了，
			// 落到下面的宽松兜底再试一次，别直接判死。
		}
	}
	// ===== 宽松兜底（2026-10-11 新增）=====
	//
	// 【治什么】线上 /adstats 实测 221 次调用里有 22 次解析失败，日志却是一片空白 ——
	// 因为这里失败只返回 null，不打任何东西，而命中计数只在 answer 非空时才写，
	// 于是「模型判 false」与「模型压根没输出 JSON」在看板上长得一模一样。
	// qwen3-30b-a3b 是 Reasoning 模型（官方标注 Reasoning: Yes），思考内容会先于
	// 正文输出并占用 max_tokens —— 旧配置只给 200，JSON 经常被切在半截。
	//
	// 【为什么兜底不算「靠猜定罪」】它只认【完整字段名】的字面量："ad": true / false。
	// 抠不到这个字段就返回 null，与改动前完全一致。confidence 缺失时按「判了广告就满置信、
	// 判了正常就 0」处理，与 JSON 分支同一口径 —— 不给兜底结果任何额外权重。
	// 风险敞口只有「模型在一段无关文本里写了 "ad": false」，而 false 本身不处置任何东西。
	return parseAdLLMAnswerLoose(text);
}

// 从残缺 / 被包裹的模型输出里按字段抠答案。抠不出 ad 字段一律返回 null。
function parseAdLLMAnswerLoose(text) {
	const adMatch = /"ad"\s*:\s*(true|false)/i.exec(String(text || ''));
	if (!adMatch) return null;
	const ad = adMatch[1].toLowerCase() === 'true';
	const confMatch = /"confidence"\s*:\s*([0-9]*\.?[0-9]+)/.exec(text);
	const confidence = confMatch ? Number(confMatch[1]) : (ad ? 1 : 0);
	const reasonMatch = /"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
	return {
		ad,
		confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : (ad ? 1 : 0),
		reason: String((reasonMatch && reasonMatch[1]) || '').slice(0, 200)
	};
}

// 统一组装：两个分支共用同一套字段归一化，避免 JSON 分支与兜底分支各写一遍、
// 以后一改一漏（那正是「兜底比正路宽松」最容易发生的地方）。
function buildAdLLMAnswer(parsed) {
	const ad = parsed?.ad === true || String(parsed?.ad).toLowerCase() === 'true';
	const confidence = Number(parsed?.confidence);
	return {
		ad,
		// 模型没给 confidence 时：判了广告就按满置信、判了正常就按 0 ——
		// 缺字段不该把一次有效结论丢掉。
		confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : (ad ? 1 : 0),
		reason: String(parsed?.reason || '').slice(0, 200)
	};
}

// 同载荷内存去重：同一条文案在一个 Worker 实例内只判一次。
// Cloudflare 实例短命、这个 Set 会随实例回收 —— 它只是尽力省额度的兜底，
// 真正的硬闸是每日上限。刻意不落库：那会往热路径加 SQL，撞「稳定态核心 ≤3 条」的断言。
const adLLMSeen = new Set();

// 跑一次深度判定。返回 {ad, confidence, reason} 或 null（未跑 / 失败 / 额度用尽）。
// 取某一个池的今日上限。config 里没有这个键时回落到代码默认值，【不是回落到 0】——
// 0 的语义是「关掉这一路的 LLM」，拿它当缺省会让没传分池配置的调用方静默失去第⑥层。
function adLLMPoolLimit(config, pool) {
	const fallback = {
		message: AD_LLM_DAILY_MESSAGE,
		join: AD_LLM_DAILY_JOIN,
		cron: AD_LLM_DAILY_CRON
	};
	const raw = ({
		message: config?.llmDailyMessage,
		join: config?.llmDailyJoin,
		cron: config?.llmDailyCron
	})[pool];
	if (raw === undefined || raw === null) return fallback[pool];
	const parsed = Number(raw);
	return Number.isFinite(parsed) ? parsed : fallback[pool];
}

// 记第⑥层的【解析失败】次数。
//
// 【为什么必须单独记】parseAdLLMAnswer 抠不出 JSON 就返回 null（宁可漏判也不能靠猜定罪），
// 而 answer 为 null 时 bumpAdLLMOutcome 一次都不会调 —— 于是「模型判 false」
// 与「模型输出压根没解析出来」在 /adstats 上长得一模一样，都是「调用 N 次、命中 0 次」。
// 线上 2026-10-11 的真实状态就是 200/200 调用、0 命中，排查时唯一能排除的是
// 调用异常（日志空白），这一层到底有没有真跑过，没有任何手段能证明。
// 加这个计数之后：命中 0 但解析失败也 0 = 模型确实判 false；解析失败一大片 = 输出格式跑偏。
async function bumpAdLLMParseFail(env) {
	if (!env?.DB) return;
	try {
		const now = Math.floor(Date.now() / 1000);
		await writeAdScanState(env, 'llm_parse_fail',
			String((await readAdScanState(env, 'llm_parse_fail', '0')) * 1 + 1), now);
	} catch (error) {
		console.error('[广告检测·深度判定] 记录解析失败计数失败:', error);
	}
}

async function judgeAdByLLM(env, config, input, options) {
	// 未绑 Workers AI：与广告检测整体的降级口径一致 —— 跳过而不是报错。
	if (!(env?.AI && typeof env.AI.run === 'function')) return null;
	const daily = Number(config?.llmDaily);
	if (!Number.isFinite(daily) || daily <= 0) return null;
	// 调用方不指名池时按 message 记账 —— 那是「消息路径」的池，
	// 也是最该拿额度的一路；宁可把来路不明的调用记给主池，也不能记给谁都不算。
	const pool = AD_LLM_POOLS.includes(String(options?.pool || '')) ? String(options.pool) : 'message';
	const poolDaily = adLLMPoolLimit(config, pool);
	if (poolDaily <= 0) return null;
	const payload = buildAdLLMPayload(input);
	const key = adTextHash(payload);
	if (adLLMSeen.has(key)) return null;
	const nowSeconds = Math.floor(Date.now() / 1000);
	const quota = await readAdLLMQuota(env, nowSeconds);
	// 两道闸：总池（所有轨共用的天花板）先挡，再挡本轨的分池。
	// 顺序不能反 —— 总池打满时本池再有余量也不该继续烧，
	// 那等于用本轨的额度把视觉识别与其他轨一起拖下水。
	// 熔断优先于一切额度判断 —— 链路已经坏掉的时候，再花一次钱去验证它坏没坏，
	// 是纯粹的浪费（这正是 2026-10-11 那轮：276 次调用全部取错字段，一次次白烧）。
	if (quota.broken) return null;
	if (quota.used >= daily) return null;
	const poolUsed = Number(quota.pools?.[pool]) || 0;
	if (poolUsed >= poolDaily) return null;
	let answer = null;
	let rawText = '';
	let aiResult = null;
	try {
		aiResult = await env.AI.run(String(config?.llmModel || AD_LLM_MODEL), {
			messages: [
				{ role: 'system', content: AD_LLM_PROMPT },
				{ role: 'user', content: payload }
			],
			// 【1000 而不是 200】qwen3-30b-a3b 是 Reasoning 模型（官方标注 Reasoning: Yes），
			// 思考内容先于正文输出、并且【计入 max_tokens】—— 旧配置给 200，JSON 经常被切在
			// 半截，第⑥层从上线到 2026-10-11 一次都没真正读到过模型的回答。
			// 【600 → 1000】修好取值路径后实测仍有约 7% 解析失败（thinking 偶尔写得更长），
			// 主人拍板买断这一类故障：1000 次调用 ≈ 22,000 Neurons，
			// 超免费额度 12,000 ≈ $4/月，换来的是「解析失败」不再是随时会放大的坑。
			// 真实输出只有 100~200 token（一条 JSON 判据），多给的是思考空间不是正文空间。
			max_tokens: 1000,
			temperature: 0.1
		});
		// Workers AI 对 chat 模型返回 OpenAI 兼容结构，正文在 choices[0].message.content，
		// 旧写法 `aiResult?.response ?? aiResult?.result` 两个字段都取不到 —— 详见 extractAdLLMResponseText。
		rawText = extractAdLLMResponseText(aiResult);
		answer = parseAdLLMAnswer(rawText);
	} catch (error) {
		console.error('[广告检测·深度判定] 调用失败:', error);
		return null;
	}
	// 无论判没判出来都记额度与去重键：解析失败同样花了 Neurons，
	// 不记的话同一条解析不出来的载荷会被反复重试，把当天预算烧在同一个坑上。
	adLLMSeen.add(key);
	await bumpAdLLMQuota(env, quota.used + 1, pool, poolUsed + 1, nowSeconds);
	if (!answer) {
		// 解析不出来要能被看见 —— 理由见 bumpAdLLMParseFail。
		// 【这行日志是排查这一层的唯一抓手】命中计数只在 answer 非空时才写，
		// 没有它的话，解析失败与「模型判 false」在线上完全无法区分 ——
		// 线上真实状态正是「221 调用、0 命中、22 解析失败」，其中那 22 次此前无从查证。
		console.error('[广告检测·深度判定] 模型输出未能解析 pool=' + pool
			+ ' model=' + String(config?.llmModel || AD_LLM_MODEL)
			// rawText 为空 = extractAdLLMResponseText 没认出这个返回外壳。
			// 那时必须把整个返回结构打出来 —— 否则又是一次「只有 [object Object]」的排查，
			// 2026-10-11 那轮就卡在这里：日志确实打了，但打的正是那个没用的对象字符串。
			+ (rawText
				? ' 原文前200字: ' + rawText.slice(0, 200)
				: ' 取不到文本字段，返回结构前300字: ' + String(JSON.stringify(aiResult)).slice(0, 300)));
		await bumpAdLLMParseFail(env);
		// 连续失败计数：连着 AD_LLM_FAIL_BREAK 次取不到回答就熔断，当天不再花钱。
		const consecFail = (Number(quota.consecFail) || 0) + 1;
		await writeAdScanState(env, 'llm_consec_fail', String(consecFail), nowSeconds);
		// 只记【字段名】不记内容（隐私面见 readAdLLMQuota 里的说明）：
		// 排查需要的只是「正文在哪个字段」，而返回体里带着别人的 bio 与消息片段。
		await writeAdScanState(env, 'llm_last_shape',
			JSON.stringify(Object.keys(aiResult || {}).slice(0, 12)), nowSeconds);
		await writeAdScanState(env, 'llm_last_fail_seq', String(quota.used + 1), nowSeconds);
		if (consecFail >= AD_LLM_FAIL_BREAK) {
			await writeAdScanState(env, 'llm_broken_day', String(quota.today), nowSeconds);
			console.error('[广告检测·深度判定] 已熔断：连续 ' + consecFail + ' 次取不到模型回答，'
				+ '今日不再调用第⑥层。返回结构的字段名见 /adstats 的「上次返回字段」。');
		}
	} else {
		// 成功时刻要记：看板判断「链路健康」靠的就是「最后一次失败之后有没有成功过」。
		await writeAdScanState(env, 'llm_last_success_seq', String(quota.used + 1), nowSeconds);
		// 一次成功就说明链路是通的，把连续失败计数清零。不清的话，一天里夹着的
		// 零星失败（模型偶尔不守 JSON 格式、thinking 偶尔过长）会累计到熔断线，
		// 把一条其实正常的第⑥层误关掉 —— 那比不加熔断更糟。
		if (Number(quota.consecFail) > 0) {
			await writeAdScanState(env, 'llm_consec_fail', '0', nowSeconds);
		}
	}
	return answer;
}

// 叠判入口：与 applyAvatarVerdict / applyBadgeVerdict 同位、同取向 ——
// 只动 verdict 与 reasons，恒不改 score（改了会与历史分重复计）。
// ===== 第⑥层单独定罪所需的【代码可核验】硬证据 =====
//
// 【治什么】2026-10-12 线上快照 #6269：用户 7303290631「初照」，正文只有一个「签到」，
// bio 是「私聊请 @chuzhaoxi_bot 或 t.me/jphrcjy」。
//   · 评分层算出来【-2 分】，明确判定不是广告；
//   · 第⑥层却单独定罪（置信度 0.90），理由是「bio 中包含私有群组邀请链接 t.me/jphrcjy」。
// 而【代码一验就是假的】：t.me/jphrcjy 是公开的用户名链接，私有邀请链接的形态是
// t.me/+xxx 或 t.me/joinchat/xxx（一次性、不可搜索、点进去直接进群）。
// 实测：t.me/jphrcjy → false，t.me/+giwR6i… → true，t.me/username → false。
//
// 根因是主人反复强调的那条：【单特征不封】。模型的判断是【生成的】不是【证据】，
// 它说「这是私有邀请链接」而代码一验就穿帮 —— 这种话不能拿来封人。
// 所以达线之后还要看【代码算得出来的】硬证据，两者都成立才动手。
//
// 【只认能被代码验证的】不放任何「模型说像」的东西进来：
//   ① 真私有群邀请链接 —— 形态写死在 AD_PRIVATE_INVITE_RE，一次都骗不过
//   ② 引流出口 ∧ 招揽动作 —— 两类同现，与结构查杀同口径
function collectAdLLMHardEvidence(input) {
	const profile = input?.profile || {};
	const text = [profile.firstName, profile.lastName, profile.bio, input?.text]
		.filter(Boolean).join(' ');
	if (!text.trim()) return [];
	const hits = [];
	// ① 真私有群一次性邀请链接：正常人发的是 t.me/username，不是 t.me/+xxx
	if (hasAdPrivateInviteLink(text)) hits.push('私有群邀请链接');
	// ② 引流出口（@handle / 电话）∧ 招揽动作（强交易动词 / 收益承诺 / 招揽词）
	const hasExit = /@[A-Za-z0-9_]{4,}/.test(text) || /[+\d][\d\s-]{9,}/.test(text);
	if (hasExit
		&& (countAdKeywordHits(text, AD_TRADE_VERBS).length
			|| AD_MONEY_GAIN_RE.test(text)
			|| AD_MONEY_SOLICIT_RE.test(text))) {
		hits.push('引流出口与招揽同现');
	}
	return hits;
}

// ===== 误判反例池（/ignore 的「不白判」那一半）=====
//
// 【治什么】此前 /ignore 只做【删除】：删指纹、删 AI 样本、删模板形状、移出黑名单。
// 删完之后，模型下次看到【同类内容】还会再判一次 —— 因为没有任何东西告诉它
// 「这个形态主人已经确认过是正常的」。menshen 的做法是把反例【直接写进判定提示词】，
// 本项目改为【代码侧比对】：每次调用不膨胀 prompt（那会让 1000 次/天的调用每条多
// 花 2 Neurons，且 prompt 越长模型越容易跑偏），代价只是达线时多一次 D1 查询。
//
// 【存片段不存整句】整句会因为空格、标点、emoji 差异匹配不上；存 30 字片段做
// 【子串比对】，既能覆盖「同款改写」（换几个字、加个表情），又不会因为一个词就
// 放行整类 —— 主人确认的是【这一段话】不是【这一个词】。
const AD_FALSE_POSITIVE_MAX = 20;
const AD_FALSE_POSITIVE_CLIP = 30;

// 判定载荷里用于比对的正文（与 payload.text 同源，不带引用体 —— 那不是本人写的）。
function adFalsePositiveSource(input) {
	const profile = input?.profile || {};
	const text = [profile.firstName, profile.lastName, profile.bio, input?.text]
		.filter(Boolean).join(' ');
	return normalizeAdFingerprintValue(text).slice(0, AD_FALSE_POSITIVE_CLIP);
}

// 主人 /ignore 时调用：把这次的正文片段记进反例池。
// 【幂等】同值重复写只刷新时间，不新增行；超出上限丢最旧的，表永远很小。
// 【绝不影响 /ignore 本职】失败只记日志，回滚照常完成。
// 【懒建表】首次读写时自动建，不动 D1_SCHEMA_VERSION —— 与 ad_spam_texts 同一取向：
// 这是 /ignore 的附属能力，不该因为它的 schema 变更去触发整套核心迁移。
const D1_FP_INIT = new WeakMap();
async function ensureAdFalsePositivesTable(env) {
	if (!env?.DB) return false;
	let init = D1_FP_INIT.get(env.DB);
	if (!init) {
		init = (async () => {
			try {
				await runD1SchemaStatement(env, 'ad_false_positives',
					"CREATE TABLE IF NOT EXISTS ad_false_positives (value TEXT PRIMARY KEY, source TEXT NOT NULL DEFAULT 'ignore', at INTEGER NOT NULL)");
				return true;
			} catch (error) {
				console.error('[广告检测] 误判反例表初始化失败:', error);
				return false;
			}
		})();
		D1_FP_INIT.set(env.DB, init);
	}
	const ok = await init;
	if (!ok) D1_FP_INIT.delete(env.DB);   // 失败不缓存，下次再试
	return ok;
}


async function addAdFalsePositive(env, rawText) {
	if (!env?.DB) return 0;
	if (!(await ensureAdFalsePositivesTable(env))) return 0;
	const value = normalizeAdFingerprintValue(rawText).slice(0, AD_FALSE_POSITIVE_CLIP);
	// 短于 4 字的片段比对价值为零（「签到」「你好」会把太多东西放进放行名单）
	if (value.length < 4) return 0;
	try {
		await env.DB.prepare(
			'INSERT INTO ad_false_positives (value, source, at) VALUES (?, ?, ?) '
			+ 'ON CONFLICT(value) DO UPDATE SET at = excluded.at')
			.bind(value, 'ignore', Date.now()).run();
		// LRU：只保留最近 N 条。按时间倒序删，超过上限的自然被淘汰。
		await env.DB.prepare(
			'DELETE FROM ad_false_positives WHERE value NOT IN '
			+ '(SELECT value FROM ad_false_positives ORDER BY at DESC LIMIT ?)')
			.bind(AD_FALSE_POSITIVE_MAX).run();
		return 1;
	} catch (error) {
		console.error('[广告检测] 写入误判反例失败:', error);
		return 0;
	}
}

// 达线之后先问一句反例池：主人确认过的形态，模型再判也只降级。
async function matchAdFalsePositive(env, input) {
	if (!env?.DB) return null;
	if (!(await ensureAdFalsePositivesTable(env))) return null;
	const value = adFalsePositiveSource(input);
	if (value.length < 4) return null;
	try {
		const rows = await env.DB.prepare(
			'SELECT value, at FROM ad_false_positives ORDER BY at DESC').all();
		const list = (rows && rows.results) || rows || [];
		// 子串比对：本次正文里【包含】任何一条反例片段就算命中。
		return list.find((r) => r && String(r.value) && value.includes(String(r.value))) || null;
	} catch (error) {
		console.error('[广告检测] 查询误判反例失败:', error);
		return null;
	}
}


async function applyAdLLMToEvaluation(env, evaluation, config, input, options) {
	let current = evaluation;
	if (!current) return current;
	// 前三层已经定罪的不再花钱。
	if (String(current.verdict) === 'ban') return current;
	// options 透传给 judgeAdByLLM，唯一被读的键是 pool（这一轨归哪个额度池记账）。
	const answer = await judgeAdByLLM(env, config, input, options);
	if (!answer || !answer.ad) return current;
	const line = Number(config?.llmConf) || AD_LLM_CONF;
	// 观测：这一层到底有没有在起作用，必须能在 /adstats 上直接看到 ——
	// 否则「调了但从没命中」与「压根没跑」在线上完全无法区分（上线首日就是这个状态）。
	// 只在模型真给出 ad 结论时写（低频），也只有 /adstats 读它，热路径不为它多付 SQL。
	await bumpAdLLMOutcome(env, answer.confidence >= line);
	const reason = 'AI 深度判定命中（置信度 ' + answer.confidence.toFixed(2) + '）：' + answer.reason;
	const reasons = (current.reasons || []).concat([reason]);
	if (answer.confidence >= line) {
		// ===== 达线之后还要看【代码算得出的】硬证据 =====
		//
		// 【主人的硬口径】单特征不封。模型的判断是【生成的】不是【证据】——
		// #6269 就是模型说「bio 含私有群邀请链接 t.me/jphrcjy」，而代码一验就穿帮：
		// t.me/jphrcjy 是公开的用户名链接，私有邀请链接的形态是 t.me/+xxx 或
		// t.me/joinchat/xxx（一次性、不可搜索、点进去直接进群）。
		// 那一条评分层算出来是【-2 分】，第⑥层一句话就把它封了 12 个群。
		//
		// 所以：模型达线 ∧ 代码验证有硬证据 → 封；只有模型一句话 → 降级观察，不封。
		// 降级的那些写进观察窗口（/pending 可见），主人可以 /ban 手动处置 ——
		// 而 /ban 会自动学特征（learnAdFromOperatorAction），下一次同类就能拦住。
		// ===== 反例池优先级最高 =====
		// 主人 /ignore 过的形态 —— 他看过完整判据后拍板说这是正常内容，
		// 模型再判也只降级。排在硬证据之前：反例是【人给的结论】，证据是【代码算的】，
		// 人给的结论优先。
		const knownFP = await matchAdFalsePositive(env, input);
		if (knownFP) {
			return Object.assign({}, current, {
				verdict: 'observe',
				reasons: reasons.concat(['（已拦下：这个形态主人此前 /ignore 判过误判'
					+ ' —— 反例片段「' + String(knownFP.value || '').slice(0, 20) + '」。模型再判也只降级）'])
			});
		}
		const hardEvidence = collectAdLLMHardEvidence(input);
		// 【不能给 reasons 重新赋值】它是 const —— 直接 `reasons = reasons.concat(...)`
		// 会抛 Assignment to constant variable，整条检测链在 try 里炸掉、返回 result: error。
		if (hardEvidence.length) {
			return Object.assign({}, current, {
				verdict: 'ban',
				reasons: reasons.concat(['（代码验证：' + hardEvidence.join('、') + '）'])
			});
		}
		return Object.assign({}, current, {
			verdict: 'observe',
			reasons: reasons.concat(['（已拦下：模型判为广告且够采信线，但【代码算不出任何硬证据】'
				+ '—— 没有私有群邀请链接，也没有引流出口与招揽同现。降级为观察，不封禁）'])
		});
	}
	if (answer.confidence >= AD_LLM_OBSERVE_CONF) {
		// 低于采信线只提观察：模型输出「是广告」却只有 0.5 把握是常态，
		// 进门那一步直接限制人发言，误伤代价比漏一条大得多（menshen 同一取向）。
		return Object.assign({}, current, { verdict: 'observe', reasons });
	}
	// 可疑度太低：理由留进快照供复核，verdict 与 score 都不动。
	return Object.assign({}, current, { reasons });
}

// ===== 正文里的自定义贴纸 emoji（批次 B-2）=====
//
// 【它与会员标是同一种东西】都叫 custom emoji、都由贴纸包生成、都只有一个数字 id；
// 差别只在贴的位置 —— 贴在昵称旁是 emoji status（批次 C），插进消息正文是这一层。
//
// 【为什么必须读 entities】message.text 里【没有它】：正文位置只存一个 id，
// 图不随消息走。全文件此前 custom_emoji 处理 0 处，等于这整类素材从未进过检测。
//
// 【成本怎么压】
//   · 形态闸：正文没有 custom_emoji 实体 → 返回空数组 → 一个请求都不发
//     （绝大多数消息是普通文本，连 ids 都凑不出来）
//   · 闸一只做【查库】：ids 在 update 里现成带着，查 ad_badges 是 D1 不是 Telegram 请求
//     —— 于是闸一「零 Telegram 请求」这个不变量原样保住
//   · 闸二才调 getCustomEmojiStickers 拿贴纸包名（本来就已经为这次判定花过 getChat）
//   · 结果按 id 进程内缓存，同一贴纸包第二次起零请求
function extractCustomEmojiIds(message) {
	const entities = message?.entities || message?.caption_entities;
	if (!Array.isArray(entities) || !entities.length) return [];
	// 去重：同一条正文里重复贴同一个 emoji 很常见，不去重会让同 id 被反复查库，
	// 也会让定罪学习对同一个 id 重复 +1（hits 虚高会提前拱开安全阀）。
	const seen = new Set();
	const ids = [];
	for (const entity of entities) {
		if (entity?.type !== 'custom_emoji') continue;
		const id = String(entity.custom_emoji_id || '');
		if (!id || seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
	}
	return ids;
}

// 进程内缓存：id → 贴纸包名 / 对应标准 emoji。TTL 与资料缓存对齐。
const AD_CUSTOM_EMOJI_CACHE = new Map();
const AD_CUSTOM_EMOJI_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const AD_CUSTOM_EMOJI_CACHE_MAX = 2000;

// 查自定义 emoji 的完整信息（贴纸包名 set_name、对应的标准 emoji）。
// 返回 { id → { set_name, emoji } }，查不到的 id 不进结果（由调用方按「未知」处理）。
// 【429 / 5xx 不缓存】否则一次限流会把这条链路按死 6 小时，
// 与 resolveAdLink 的 cacheable 处理同一口径。
async function resolveCustomEmojiStickers(env, ids) {
	const wanted = (Array.isArray(ids) ? ids : [])
		.map((id) => String(id || '')).filter(Boolean);
	const out = {};
	if (!wanted.length || !BOT_TOKEN) return out;
	const now = Date.now();
	const pending = [];
	for (const id of wanted) {
		const hit = AD_CUSTOM_EMOJI_CACHE.get(id);
		if (hit && hit.expiresAt > now) out[id] = hit.value;
		else pending.push(id);
	}
	if (!pending.length) return out;
	try {
		const response = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/getCustomEmojiStickers', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ custom_emoji_ids: pending.slice(0, 200) })
		});
		const result = await response.json();
		const cacheable = response.status !== 429 && response.status < 500
			&& !/429|too many requests|internal server|timeout/i.test(String(result?.description || ''));
		if (result?.ok && Array.isArray(result.result)) {
			for (const sticker of result.result) {
				const id = String(sticker?.custom_emoji_id || '');
				if (!id) continue;
				const value = {
					setName: String(sticker?.set_name || ''),
					emoji: String(sticker?.emoji || '')
				};
				out[id] = value;
				if (cacheable) {
					if (AD_CUSTOM_EMOJI_CACHE.size >= AD_CUSTOM_EMOJI_CACHE_MAX) {
						const oldest = AD_CUSTOM_EMOJI_CACHE.keys().next();
						if (!oldest.done) AD_CUSTOM_EMOJI_CACHE.delete(oldest.value);
					}
					AD_CUSTOM_EMOJI_CACHE.set(id, { value, expiresAt: now + AD_CUSTOM_EMOJI_CACHE_TTL_MS });
				}
			}
		}
	} catch (error) {
		console.error('[广告检测·自定义emoji] 解析失败:', error?.message || error);
	}
	return out;
}


// ===== 正文图片指纹（L1）=====
//
// 【补的是哪个洞】detectAdOnMessage 的早退闸门只认 text / caption / 转发 / 引用体 /
// 名片显示名五样，而一条【裸图片消息】（caption 为空）这五样全空 —— 于是整条消息
// 在闸门就 return 了，四条通道一条都跑不到，连名册都不进。线上看到的形态是：
// 同款引流图连发三条，每条的话术全写在图片像素里，caption 一个字没有。
// 这一层让那类消息至少能进到「查一次指纹表」这一步。
//
// 与头像 L1 同构：主键 file_unique_id、verdict 三态、hits 复用计数。
// 差别在于触发条件 —— 头像要等 getChat 顺带返回，这里 message 里现成带着，
// 零 Telegram 请求；代价是消息路径多一条 D1 读，靠下面 extractAdMedia 的
// 「没有媒体就返回 null」把它挡在纯文本消息之外，稳态断言不受影响。

// 从消息里取参与指纹比对的那一个媒体。
// 一条 Telegram 消息只有一个媒体载体，按固定顺序取第一个命中的。
// photo 是【升序的尺寸数组】，最后一项即最大尺寸 —— 同一张图各尺寸的
// file_unique_id 是同一个，取哪项都对，取最大项只为语义清晰。
//
// 【visionFileId 才是真正该下载给模型的那个】官方对 Sticker 的原文：
//   type   —— "regular"/"mask"/"custom_emoji"，与格式无关
//   format —— 由 is_animated 与 is_video 决定：静态 .webp、animated .tgs、video .webm
//   thumbnail —— "Sticker thumbnail in the .WEBP or .JPG format"
// moondream 只吃位图，animated/video 贴纸的【本体不是位图】，拿
// data:image/webp 去装 .tgs 字节必然解析失败 —— 而失败会计入 failed 并
// 推进 vision_checked_at，等于这张图【永久跳过、再也不看】。Telegram 现在
// 主推的正是这两类贴纸，所以必须改下它的静态 thumbnail。
// 没有 thumbnail 的（如 document）返回空串，队列条件 file_id != '' 会把它
// 挡在推理之外，只留 L1 同款复用这一条路 —— 宁可不判，也不能判一次就废。
function extractAdMedia(message) {
	if (!message) return null;
	const pick = (node, kind) => {
		if (!node) return null;
		const fileUniqueId = String(node.file_unique_id || '');
		if (!fileUniqueId) return null;
		const thumb = node.thumbnail || node.thumb || null;
		const thumbFileId = String(thumb?.file_id || '');
		// 本体是不是 moondream 能直接吃的静态位图
		let bodyIsBitmap = false;
		if (kind === 'photo') bodyIsBitmap = true;
		else if (kind === 'sticker') bodyIsBitmap = !node.is_animated && !node.is_video;
		// animation 是 GIF/H.264、video 是容器、document 格式未知 —— 一律不取本体。
		const visionFileId = bodyIsBitmap ? String(node.file_id || '') : thumbFileId;
		return {
			kind,
			fileUniqueId,
			fileId: String(node.file_id || ''),
			visionFileId
		};
	};
	if (Array.isArray(message.photo) && message.photo.length) {
		return pick(message.photo[message.photo.length - 1], 'photo') || null;
	}
	return pick(message.sticker, 'sticker')
		|| pick(message.animation, 'animation')
		|| pick(message.video, 'video')
		|| pick(message.document, 'document');
}

// 按字节头猜图片 MIME。比「按 kind 猜」可靠得多 —— kind 只说明载体类型，
// 说明不了里面到底是什么字节；而下载之后最权威的信息就是文件头。
// 认不出来返回 null，调用方据此跳过推理（不去猜、不拿错格式硬喂模型）。
function sniffImageMime(bytes) {
	if (!bytes || bytes.length < 12) return null;
	// PNG: 89 50 4E 47
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
	// JPEG: FF D8 FF
	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	// GIF: "GIF8"
	if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
	// WEBP: "RIFF" .... "WEBP"
	if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
		&& bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
	return null;
}

// 读一条图片指纹。查不到返回 null（= 未入库，既不是 ad 也不是 clean）。
async function readAdImage(env, fileUniqueId) {
	const key = String(fileUniqueId || '');
	if (!env?.DB || !key) return null;
	try {
		const row = await env.DB.prepare('SELECT file_unique_id, verdict, hits, kind, source, last_user_id, vision_checked_at, created_at, updated_at FROM ad_images WHERE file_unique_id = ?').bind(key).first();
		return row || null;
	} catch (error) {
		// 查不到不等于干净：失败按「未入库」处理，下一条消息再试，
		// 绝不把查询失败当成 clean 去放行 —— 与头像那张表同一口径。
		console.error('[广告检测] 读取图片指纹失败:', error);
		return null;
	}
}

// 登记一张正文图片（verdict=pending），供 L2 视觉识别排队。
// 只在「表里还没有这一行」时调用一次 —— 稳定态下同款图每条消息零写入。
async function registerAdImage(env, media, userId) {
	const fileUniqueId = String(media?.fileUniqueId || '');
	if (!env?.DB || !fileUniqueId) return false;
	// file_id 是【下载句柄】，存 visionFileId 而不是本体的 fileId ——
	// animated/video 贴纸的本体不是位图，能下的是 thumbnail；
	// visionFileId 为空（无 thumbnail）时写空串，队列条件 file_id != ''
	// 会把它挡在推理队列外，只留 L1 同款复用，不给它一次必失败的推理机会。
	return upsertAdImage(env, fileUniqueId, {
		verdict: 'pending',
		fileId: String(media?.visionFileId || ''),
		kind: String(media?.kind || ''),
		lastUserId: String(userId || '')
	});
}

// 写入 / 更新一条图片指纹。patch 里的字段只覆盖传了的那几个。
// 与 upsertAdAvatar 逐句对齐，只多了 kind 一列。
async function upsertAdImage(env, fileUniqueId, patch = {}) {
	const key = String(fileUniqueId || '');
	if (!env?.DB || !key) return false;
	const now = Math.floor(Date.now() / 1000);
	const verdict = patch.verdict != null ? String(patch.verdict) : 'pending';
	const fileId = patch.fileId != null ? String(patch.fileId) : '';
	const kind = patch.kind != null ? String(patch.kind) : '';
	const source = patch.source != null ? String(patch.source) : null;
	const lastUserId = patch.lastUserId != null ? String(patch.lastUserId) : null;
	const visionCheckedAt = Number(patch.visionCheckedAt) || 0;
	try {
		await env.DB.prepare(
			'INSERT INTO ad_images (file_unique_id, verdict, hits, file_id, kind, source, last_user_id, vision_checked_at, created_at, updated_at) '
			+ 'VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?) '
			+ 'ON CONFLICT(file_unique_id) DO UPDATE SET '
			+ 'verdict = CASE WHEN ad_images.verdict = \'ad\' THEN ad_images.verdict ELSE excluded.verdict END, '
			+ 'file_id = CASE WHEN excluded.file_id != \'\' THEN excluded.file_id ELSE ad_images.file_id END, '
			+ 'kind = CASE WHEN excluded.kind != \'\' THEN excluded.kind ELSE ad_images.kind END, '
			+ 'source = COALESCE(excluded.source, ad_images.source), '
			+ 'last_user_id = COALESCE(excluded.last_user_id, ad_images.last_user_id), '
			+ 'vision_checked_at = CASE WHEN excluded.vision_checked_at > 0 THEN excluded.vision_checked_at ELSE ad_images.vision_checked_at END, '
			+ 'updated_at = excluded.updated_at'
		).bind(key, verdict, fileId, kind, source, lastUserId, visionCheckedAt, now, now).run();
		return true;
	} catch (error) {
		console.error('[广告检测] 写入图片指纹失败:', error);
		return false;
	}
}

// 定罪即学习：此人被封时，把这张图记成广告素材，并给它的「复用次数」+1。
// 正是这一层让 L1 的价值随时间复利 —— 第一张图要等 L2 判，之后同款全部零成本。
async function learnAdImageOnBan(env, fileUniqueId, userId) {
	const key = String(fileUniqueId || '');
	if (!env?.DB || !key) return false;
	const now = Math.floor(Date.now() / 1000);
	try {
		await env.DB.prepare(
			'INSERT INTO ad_images (file_unique_id, verdict, hits, file_id, kind, source, last_user_id, vision_checked_at, created_at, updated_at) '
			+ 'VALUES (?, \'ad\', 1, \'\', \'\', \'learned\', ?, 0, ?, ?) '
			+ 'ON CONFLICT(file_unique_id) DO UPDATE SET verdict = \'ad\', hits = ad_images.hits + 1, '
			+ 'source = \'learned\', last_user_id = excluded.last_user_id, updated_at = excluded.updated_at'
		).bind(key, String(userId || ''), now, now).run();
		return true;
	} catch (error) {
		console.error('[广告检测] 图片定罪学习失败:', error);
		return false;
	}
}

// 误封纠错（/ignore 走这条路）：把这张图转成 clean，
// 防止「发过同款图的人全被连坐」—— 正常群里撞同一张梗图是常态。
async function clearAdImageOnIgnore(env, fileUniqueId) {
	const key = String(fileUniqueId || '');
	if (!env?.DB || !key) return false;
	const now = Math.floor(Date.now() / 1000);
	try {
		await env.DB.prepare('INSERT INTO ad_images (file_unique_id, verdict, hits, file_id, kind, source, vision_checked_at, created_at, updated_at) VALUES (?, \'clean\', 0, \'\', \'\', \'manual\', 0, ?, ?) ON CONFLICT(file_unique_id) DO UPDATE SET verdict = \'clean\', hits = 0, source = \'manual\', updated_at = excluded.updated_at').bind(key, now, now).run();
		return true;
	} catch (error) {
		console.error('[广告检测] 图片纠错失败:', error);
		return false;
	}
}

// 把图片命中叠加到已有判定结果上（纯函数，不动原对象）。与 applyAvatarVerdict 同位。
//
// 分档（【比头像严一档】，这是与头像唯一的实质差异）：
//   ad + 本次已有任何判据   → 封（图片与正文/简介互相印证）
//   ad + 复用定罪 >= 5 次   → 单独即可封（同一张素材已被反复用于被封的人）
//   ad + 本次干净           → 只进观察，不封
//   clean / pending / 无图片 → 原样返回，一个字节都不改
//
// 【为什么头像是 2、图片是 5】头像被盗用需要主动换图，正常用户撞上同一张
// 广告头像的概率低；而正文图片的载体是「群里发的图」，梗图、热门截图、
// 别人转的图都可能被多人正常转发 —— 复用门槛必须更高，否则一张被 2 个人
// 转过的普通图就会开始单独定罪。单证（本次干净）一律不定罪这条两层一致。
const AD_IMAGE_SINGLE_EVIDENCE_BAN_HITS = 5;
function applyImageVerdict(evaluation, image) {
	if (!evaluation || !image) return evaluation;
	if (String(image.verdict || '') !== 'ad') return evaluation;
	const hits = Number(image.hits) || 0;
	const hasCorroboration = (evaluation.reasons || []).length > 0 || (Number(evaluation.score) || 0) >= 2;
	const reason = '消息图片命中广告素材库（复用定罪 ' + hits + ' 次）';
	const reasons = (evaluation.reasons || []).concat([reason]);
	let verdict = evaluation.verdict;
	if (hasCorroboration) verdict = 'ban';
	else if (hits >= AD_IMAGE_SINGLE_EVIDENCE_BAN_HITS) verdict = 'ban';
	else verdict = evaluation.verdict === 'ban' ? 'ban' : 'observe';
	// score 只作展示：图片不改评分口径，避免与历史分叠加时重复计分。
	return Object.assign({}, evaluation, { verdict, reasons });
}

// 取这条消息对应的图片指纹，【一次消息只读一遍】，两道闸共用同一份结果。
//
// 【为什么不沿用头像那种「每处各自读」】头像只有闸二一个调用点，读一次就够；
// 图片不同 —— 闸一没定罪才会走到闸二，两道闸都在同一条消息的执行流里，
// 各读各的会把同一行读两遍（首见还要多写一次），纯属把热路径 SQL 推高一倍。
// 读出来的行交给 applyImageVerdict 这个纯函数分别叠到两道闸的判定上，
// 结果与各读各的完全一致，代价只是第一次 D1 读。
//
// 返回值语义与 readAdImage 一致：null = 未入库（既不是 ad 也不是 clean，不参与裁决）。
// 同一张图至少被这么多个【不同】用户发过，就标记为广告素材。
//
// 【为什么是 3 不是 2】正常群里两个人转同一张梗图太常见了，2 会误伤；
// 3 个互不相干的陌生人各发一次同一张图，正常语境下几乎不发生 ——
// 而广告组织批量投放时，同一个素材会被一批号轮流发，很容易撞到。
const AD_IMAGE_CROSS_USER_MIN = 3;
const AD_IMAGE_CROSS_USER_CAP = 20;

// 记录「这张图又被谁发了一次」。返回 true 表示【本次刚把它标记为广告素材】。
//
// 【为什么要有它】moondream 视觉识别 2026-10-11 起全线失败（模型返回空对象 {}），
// ad_images 里「广告图」恒为 0，L1 同款指纹因此没料可依 —— 图片广告一张都杀不掉。
// 这条判据【不调任何模型、不花一个 Neurons】，用的是「跨用户复用」这个
// moondream 也给不了的信号，作为它恢复之前的兜底；模型修好之后两者并存，
// 谁先命中都算数。
async function bumpAdImageSender(env, fileUniqueId, userId, row) {
	if (!env?.DB) return false;
	const uid = String(userId || '');
	const key = String(fileUniqueId || '');
	if (!uid || !key) return false;
	// 只管「还没判过的图」。已判 clean 的是正常图（含人工 /ignore 纠错的），
	// 已判 ad 的早已进库，两者都不该被这条路径翻案。
	if (String(row?.verdict || '') !== 'pending') return false;
	const now = Math.floor(Date.now() / 1000);
	try {
		// INSERT OR IGNORE：同一个 file + 同一个人只留一行。
		// 【同一个人反复发同一张图不计】广告号刷屏是一个人干的，这条判据抓的是
		//【跨账号复用】；不排掉的话单人刷屏就能把计数顶上去，误伤正常梗图。
		const inserted = await env.DB.prepare(
			'INSERT OR IGNORE INTO ad_image_senders (file_unique_id, user_id, created_at) VALUES (?, ?, ?)')
			.bind(key, uid, now).run();
		if (!(inserted?.results?.[0]?.meta?.changes > 0)) return false;
		const row2 = await env.DB.prepare(
			'SELECT COUNT(*) AS c FROM ad_image_senders WHERE file_unique_id = ?').bind(key).first();
		const senders = Number(row2?.c) || 0;
		if (senders < AD_IMAGE_CROSS_USER_MIN) return false;
		// verdict 仍是 pending 才改：与 upsertAdImage 同一守则，任何地方都不能把
		// 已经定过的 ad 翻回 pending。
		const updated = await env.DB.prepare(
			"UPDATE ad_images SET verdict = 'ad', source = COALESCE(source, 'cross_user'), updated_at = ? "
			+ "WHERE file_unique_id = ? AND verdict = 'pending'").bind(now, key).run();
		if (!(updated?.results?.[0]?.meta?.changes > 0)) return false;
		console.log('[图片跨用户复用] 同一张图被 ' + senders + ' 个用户发过，标记为广告素材',
			JSON.stringify({ file: key.slice(0, 24) }));
		return true;
	} catch (error) {
		console.error('[图片跨用户复用] 处理失败:', error);
		return false;
	}
}

async function loadAdImageForMessage(env, media, userId) {
	if (!media?.fileUniqueId) return null;
	const row = await readAdImage(env, media.fileUniqueId);
	if (row) {
		// 【2026-10-11 跨用户复用】这是图片内容判据（moondream）之外、
		// 唯一不依赖模型的第一发之后的信号 —— 同一张图被多个【不同】用户发出来。
		// 只在 verdict 仍是 pending 时累加：已判 clean 的是正常图、已判 ad 的早已入库。
		if (await bumpAdImageSender(env, media.fileUniqueId, userId, row)) return { ...row, verdict: 'ad' };
		return row;
	}
	// 首次见到这张图：登记成 pending，L2 视觉识别才有东西可排队。
	// 只发生一次 —— 行存在之后就走稳定态的「只读不写」。
	await registerAdImage(env, media, userId);
	return null;
}

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
// 写回「上次判时这份资料的形状 + 结论」。只动这两列，不碰 bio_checked_at ——
// 那个时间戳在判定【之前】就已经推过一次（429 防卡死），这里再推等于重复。
async function markAdProfileVerdict(env, userId, profileHash, verdict) {
	if (!env?.DB) return false;
	const uid = String(userId || '');
	if (!uid) return false;
	try {
		await env.DB.prepare(
			'UPDATE ad_group_members SET profile_hash = ?, last_verdict = ? WHERE user_id = ?'
		).bind(String(profileHash || ''), String(verdict || ''), uid).run();
		return true;
	} catch (error) {
		console.error('[广告检测] 写回资料结论失败:', error);
		return false;
	}
}

// 判据库的最新变动时刻：四张表里最新的一次写入。
//
// 【为什么不靠在写入点埋标记】指纹、样本、头像、形状四张表的写入点分散在十几处
// （自动学习、/spam 学习、纠错、种子灌入、补向量…），漏埋一处 = 漏放一次，
// 而漏放正是本项目最不能出的错。直接查 MAX 时间戳是【零钩子】的：
// 新增一个学习点不用记得改这里，查漏是结构性的，不依赖人记得。
//
// 失败返回 0：读不到就当「库没变动过」，门会跳过判定 —— 方向上是「多省一次」，
// 但跳过本身需要「bio 没变 + 上次判 pass」两条硬条件同时成立，不构成新的误封路径。
async function readAdJudgeLibStamp(env) {
	if (!env?.DB) return 0;
	try {
		const row = await env.DB.prepare(
			'SELECT COALESCE(MAX(u.t), 0) AS t FROM ('
			+ 'SELECT MAX(updated_at) AS t FROM ad_fingerprints '
			+ 'UNION ALL SELECT MAX(created_at) FROM ad_sample_embeddings '
			+ 'UNION ALL SELECT MAX(updated_at) FROM ad_avatars '
			+ 'UNION ALL SELECT MAX(updated_at) FROM ad_profile_shapes'
			+ ') u'
		).first();
		return Number(row?.t) || 0;
	} catch (error) {
		console.error('[广告检测] 读取判据库版本失败:', error);
		return 0;
	}
}

// 是否需要为这个人拉一次 bio。三种情况都要查：
//   ① 名册里没有他（首次发言，或 D1 读失败 —— 见 readAdGroupMember 的 fail-open 说明）；
//   ② bio_checked_at 为 0（从没查过）；
//   ③ 距上次查超过 AD_BIO_RECHECK_DAYS 天。
// 时间倒流（时钟回拨或数据被手改到未来）时 now - checked 为负，也判定为不查 —— 无所谓，
// cron 那一轨仍会按 bio_checked_at ASC 把他排到队首。
// 是否需要为这个人拉一次 bio。三种情况都要查：
//   ① 名册里没有他（首次发言，或 D1 读失败 —— 见 readAdGroupMember 的 fail-open 说明）；
//   ② bio_checked_at 为 0（从没查过）；
//   ③ 距上次查已过【他这一档】的间隔 —— 档位按进群时长分，新人查得密、老人照旧 3 天，
//      与 cron 轨共用 adRescanTierSeconds 的同一组数字，两条轨节奏必须一致。
// 时间倒流（时钟回拨或数据被手改到未来）时 now - checked 为负，判定为不查 —— 无所谓，
// cron 那一轨仍会按到期时刻把他排到队首。
function shouldCheckAdBio(member, nowSeconds = Math.floor(Date.now() / 1000)) {
	if (!member) return true;
	const checked = Number(member.bio_checked_at) || 0;
	if (checked <= 0) return true;
	return (Number(nowSeconds) || 0) - checked >= adRescanTierSeconds(member, nowSeconds);
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

// 在【任意一个】配置群是群主或管理员 → 所有群都豁免广告自动检测。
// 只在检测已经判定要封的那一刻调用（低频），逐群复用 isAdminForAdDetection 的 5 分钟缓存，
// 普通发言热路径不多花任何请求。当前群已由入口处的按群豁免查过，这里跳过避免重复。
// 某群查询失败且无缓存时按「不是该群管理员」处理，与 isAdminForAdDetection 口径一致。
async function isAdminInAnyConfiguredGroup(userId, skipChatId = '') {
	const uid = String(userId || '');
	if (!uid) return false;
	const skip = String(skipChatId || '');
	for (const groupId of GROUP_IDS) {
		const gid = String(groupId || '');
		if (!gid || gid === skip) continue;
		if (await isAdminForAdDetection(gid, uid)) return true;
	}
	return false;
}

// 受保护角色：主人 / 副主人 / 超级管理员 / 任意一个配置群的群主或管理员。
// 这些人【任何自动路径】都不封禁、不禁言（广告自动检测、同款直封、同款连带、黑名单发言拦截、
// 复入群拦截、/ad 投票）。手动 /ban /spam 不走这里、口径不变（主人口径）。
// 异步：先做同步的主/副/超管判断，再按需查「任意配置群管理员」（复用 5 分钟缓存），
// 只在「已判定要封的那一刻」调用，普通发言热路径不触发。
async function isProtectedFromAutoModeration(userId, skipChatId = '') {
	if (isAdDetectionExemptUser(userId)) return true;
	return await isAdminInAnyConfiguredGroup(userId, skipChatId);
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
// ===== 复查档位：进群越久资料越稳定，查得越稀 =====
//
// 【为什么新人要密】广告号的标准玩法是「先用干净资料混进来，过几天再改 bio」——
// 改的那一刻起他就不再发言，消息路径永远触发不到，只有这一闸抓得到。
// 入群后的头 72 小时正是这个动作的高发窗口，也是整条闸三唯一还来得及拦的时机。
// 72 小时之后回落到 3 天（AD_BIO_RECHECK_SECONDS 的既有口径），
// 老成员的轮询成本一个字节都没涨。
//
// ⚠️ 三个档位数字【必须与 JS 版 adRescanTierSeconds 完全一致】：SQL 这份决定 cron
// 扫谁、JS 那份决定发言路径什么时候重拉 bio，两边口径分叉会让同一个人在两条轨上
// 得到不同的复查节奏，排查时完全看不出来。
const AD_RESCAN_TIERS_SQL = 'CASE '
	+ 'WHEN ? - m.first_seen <= 21600 THEN 7200 '        // 入群 ≤ 6h：每 2 小时
	+ 'WHEN ? - m.first_seen <= 86400 THEN 21600 '       // ≤ 24h：每 6 小时
	+ 'WHEN ? - m.first_seen <= 259200 THEN 86400 '      // ≤ 72h：每 24 小时
	+ 'ELSE ' + AD_BIO_RECHECK_SECONDS + ' END';

// JS 侧同口径档位。first_seen 为 0（bot 部署前已在群、老数据没这列）一律按最老一档，
// 不把存量成员当刚进门的号高频重扫。
function adRescanTierSeconds(member, nowSeconds) {
	const firstSeen = Number(member?.first_seen) || 0;
	if (!firstSeen) return AD_BIO_RECHECK_SECONDS;
	const age = (Number(nowSeconds) || 0) - firstSeen;
	if (age <= 21600) return 7200;
	if (age <= 86400) return 21600;
	if (age <= 259200) return 86400;
	return AD_BIO_RECHECK_SECONDS;
}

// 取下一批待复查的人。
//
// 三个关键点：
//   ① 到期判断【按档位】而不是统一 3 天 —— 新人 2 小时就到期，老人照旧 3 天。
//   ② 排序按【到期时刻】而不是 bio_checked_at。新人档位短，他刚查完 bio_checked_at
//      就是最新值；按 bio_checked_at 排他永远轮不到队首，阶梯等于白做。
//   ③ 先用 bio_checked_at 走索引收窄（最小档位 7200 秒），再算各自到期时刻 ——
//      直接对表达式排序会让 idx_ad_members_bio_checked 完全失效，变成全表扫。
// 查完就把 bio_checked_at 推到现在，到期时刻随之后移，自平衡性质与原来一致：
// 增删行、跨天中断、Worker 重启都不会让扫描错位或重复。
async function loadAdRescanBatch(env, limit, nowSeconds = Math.floor(Date.now() / 1000)) {
	if (!env?.DB) return [];
	const now = Number(nowSeconds) || 0;
	try {
		const rows = await env.DB.prepare(
			'SELECT m.user_id, m.chat_id, m.first_name, m.last_name, m.username, m.bio_checked_at, '
			+ 'm.first_seen, m.profile_hash, m.last_verdict '
			+ 'FROM ad_group_members m LEFT JOIN blacklist b ON b.id = m.user_id '
			+ 'WHERE b.id IS NULL '
			+ 'AND m.bio_checked_at <= ? '
			+ 'AND (m.bio_checked_at + ' + AD_RESCAN_TIERS_SQL + ') <= ? '
			+ 'ORDER BY (m.bio_checked_at + ' + AD_RESCAN_TIERS_SQL + ') ASC LIMIT ?'
		).bind(
			now - 7200,            // 索引收窄：最小档位之前的根本没到期
			now, now, now,         // WHERE 里的档位 CASE（三个 WHEN 共用一个 now）
			now,                   // WHERE 的到期比较
			now, now, now,         // ORDER BY 里的档位 CASE
			Math.max(1, Number(limit) || 1)
		).all();
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
	if (isAdDetectionExemptUser(userId)) {
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

	// ===== 变化门：资料一个字没改、上次结论又是干净的，就跳过整轮判定 =====
	// 这一轨的输入【只有资料、没有正文】，所以「同一份 bio + 空正文」必然得出同一结论 ——
	// 再跑一遍 evaluateAdSuspect 只是把上次的结论重算一次，而那一遍要花指纹库查询、
	// 头像库查询，外加一次 bge-m3 嵌入。getChat 省不掉（不拉 bio 就不知道变没变），
	// 省掉的是拉到 bio 之后的全部判定开销。
	//
	// 【三道条件缺一不可】
	//   ① 形状非空且与上次一致 —— bio 真的没改过；
	//   ② 上次结论是 pass（干净）—— 上次判出 observe / ban 的一律重判，漏的风险不担；
	//   ③ 判据库自上次判以来没被写过（bio_checked_at 严格晚于四张表的最新写入）。
	//      这一条是【零钩子】的：指纹、样本、头像、形状任何一处新增或纠错都会把门关上。
	//      少了它，「他没改 bio，但库里刚学进一条正好命中新 bio 的指纹」就会被整轮跳过 ——
	//      而判据库的写入点分散在十几处，靠埋标记迟早漏一处，漏一处就是漏放。
	const shape = adProfileShape(profile);
	const lastHash = String(row.profile_hash || '');
	const lastVerdict = String(row.last_verdict || '');
	if (shape && shape === lastHash && lastVerdict === 'pass'
		&& (Number(row.bio_checked_at) || 0) > await readAdJudgeLibStamp(env)) {
		return { scanned: false, banned: false, reason: 'unchanged' };
	}


	const baseEvaluation = await evaluateAdSuspect(
		env,
		{ profile, text: '', forwardChat: null },
		{ config: options.config, whitelist: options.whitelist, skipMissingBioPenalty: false }
	);
	// 头像指纹叠加（无头像则原样返回，本轨零额外开销）
	const avatarEvaluation = await applyAvatarToEvaluation(env, baseEvaluation, profile);
	// 同款会员标叠加（无标则原样返回）：与头像同一层位、同一零开销条件，
	// 排在头像之后 —— 两层都只加 reasons 不改 score，先后不影响分数。
	let evaluation = await applyBadgeToEvaluation(env, avatarEvaluation, profile);
	// 第四路补位：这一轨扫的是「不发言的人」，正文恒空，模型判的就是资料本身 ——
	// 正对准「改了 bio 的潜伏号」。日限 300 人，LLM 每日上限还绰绰有余。
	evaluation = await applyAdLLMToEvaluation(env, evaluation,
		options.config || loadAdDetectionConfig(env), { profile, text: '' }, { pool: 'cron' });
	// 写回形状与结论：pass 让下一轮能走门，observe / ban 则让门始终关着。
	// 不碰 bio_checked_at —— 那个时间戳在判定之前已经推过一次（429 防卡死）。
	await markAdProfileVerdict(env, userId, shape, evaluation.verdict);

	if (evaluation.verdict !== 'ban') {
		// 【不写观察记录】。观察窗口的语义是「短期内再有动作就合并裁决」，
		// 而这一轨扫的正是不发言的人 —— 给他们写观察记录只会让 ad_user_screening
		// 被 300 条/天的扫描结果灌满，把真正需要盯的新入群用户挤掉。
		return { scanned: true, banned: false };
	}
	// 任意配置群的群主/管理员全群豁免：定罪后才查，未定罪的人不花这笔请求。
	if (await isAdminInAnyConfiguredGroup(userId, chatId)) {
		console.log('[广告检测·扫描] user=' + userId + ' 是其他配置群的管理员，豁免不封');
		return { scanned: true, banned: false, reason: 'admin' };
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

// 待补学头像的队列（状态串，JSON 数组）。封禁发生在闸一时拿不到头像，
// 把 userId 记在这儿，由 cron 轨异步补拉 —— 热路径只写一次 D1，不加 Telegram 请求。
const AD_AVATAR_LEARN_QUEUE_LIMIT = 200;

async function queueAdAvatarLearning(env, userId) {
	const uid = String(userId || '');
	if (!env?.DB || !uid) return false;
	try {
		const raw = await readAdScanState(env, 'avatar_learn_queue', '[]');
		let list = [];
		try { list = JSON.parse(String(raw || '[]')); } catch (_) { list = []; }
		if (!Array.isArray(list)) list = [];
		list = list.map((v) => String(v)).filter((v) => v && v !== uid);
		list.push(uid);
		// 极端刷封时只留最近 200 个：状态串不能无限膨胀，
		// 被挤掉的号下次发言或入群时仍会走正常路径再进来。
		if (list.length > AD_AVATAR_LEARN_QUEUE_LIMIT) list = list.slice(-AD_AVATAR_LEARN_QUEUE_LIMIT);
		await writeAdScanState(env, 'avatar_learn_queue', JSON.stringify(list), Math.floor(Date.now() / 1000));
		return true;
	} catch (error) {
		console.error('[广告检测·头像] 写入补学队列失败:', error);
		return false;
	}
}

// 消化补学队列：逐个拉资料拿头像，学进指纹库。由 cron 调用。
// 单轮最多 limit 个（默认 30）—— 每个一次 getChat，不能让一轮 cron 把
// Telegram 限流打满；没消化完的留在队列里，下一轮继续。
async function drainAdAvatarLearningQueue(env, limit = 30) {
	const stats = { queued: 0, learned: 0, failed: 0 };
	if (!env?.DB) return stats;
	let list = [];
	try {
		const raw = await readAdScanState(env, 'avatar_learn_queue', '[]');
		list = JSON.parse(String(raw || '[]'));
		if (!Array.isArray(list)) list = [];
	} catch (_) { list = []; }
	stats.queued = list.length;
	if (!list.length) return stats;

	const batch = list.slice(0, limit);
	for (const uid of batch) {
		try {
			// fetchAdUserProfile 有 5 分钟按人缓存，连着补学同一个人不会重复打接口。
			const profile = await fetchAdUserProfile(uid, {});
			const avatarId = String(profile?.avatarId || '');
			if (avatarId) await learnAdAvatarOnBan(env, avatarId, uid);
			// 会员标搭同一趟补学：这一轨存在的唯一理由就是「闸一定罪时那份
			// cheapProfile 没有 getChat 的字段」，而会员标正是那个响应里的字段，
			// 与头像同源。复用同一个队列 = 不新增队列、不新增 Telegram 请求，
			// 这次 fetchAdUserProfile 顺带就把它带回来了。
			const badgeId = String(profile?.badgeId || '');
			if (badgeId) await learnAdBadgeOnBan(env, badgeId, uid);
			// 没头像的号也算处理完：不留队列里反复重试（他本来就没图可学）。
		} catch (error) {
			stats.failed += 1;
			console.error('[广告检测·头像] 补学失败 user=' + uid + ':', error);
		}
	}
	const rest = list.slice(limit);
	try {
		await writeAdScanState(env, 'avatar_learn_queue', JSON.stringify(rest), Math.floor(Date.now() / 1000));
	} catch (error) {
		console.error('[广告检测·头像] 更新补学队列失败:', error);
	}
	stats.learned = batch.length;
	return stats;
}

// ===== 头像视觉识别（L2）=====
// L1 的指纹复用只能拦「库里已有的头像」，识别「主页赚钱」这类图上写着广告的头像
// 必须真看图。模型由主人选定：moondream3.1-9B-A2B（官方定位含 OCR 与结构化输出）。
//
// 【为什么挂 cron 而不是消息路径】一次推理要 getFile + 下载 + 模型调用，
// 挂在消息上会拖慢每一次回复，且撞子请求配额。cron 里按队列慢慢消费，
// 消息路径只做 L1 查表（一次 D1 读）。
//
// 【为什么按张数熔断而不是按 Neurons】免费层每天 10,000 Neurons 且超限【直接报错】，
// 而单张图的 Neurons 消耗官方文档没有给出，按未验证的单价做预算等于拿线上可用性赌。
// 张数上限 + 每张最多一次推理，最坏消耗是可数的；宁可少判几十张也不能让 cron 天天报错。
// 【2026-10-11 换模型：moondream → llama-3.2-11b-vision】
// moondream3.1-9B-A2B 实测【调用成功但返回空对象 {}】—— 正确账号 ID、URL 与 base64
// 两种入参、task=query 与 caption 两种任务，四条路全部一样，模型就是不输出。
// 换成 llama 视觉（许可已同意，账号级一次性），实测能正常返回，
// 且单张约 4 Neurons —— 350 张/天 ≈ 1400 Neurons，付费版完全无压力。
//
// 【为什么不用 Cloudflare 的专用小模型】menshen 的做法是走上游多模态模型
//（openrouter/openai/gpt-4o），不绑死在一家的视觉模型上 —— 模型坏了换一个上游就行。
// 本项目在 Workers AI 里跑，等效做法就是换一个能用的多模态模型。
const AD_AVATAR_VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';
const AD_AVATAR_VISION_DAILY = 50;
const AD_AVATAR_VISION_PROMPT = '这是一张社交软件的用户头像图片。判断它是否属于广告用途：'
	+ '图里若有引流文字（赚钱、代理、代购、招租、微信号、二维码、"看主页/看简介"）、'
	+ '明显商品推销、联系方式、赌博或灰产图案，即为广告。自拍、风景、宠物、家人、'
	+ '动漫头像、纯色与图案均不是广告。'
	+ '只输出 JSON，不要任何其它文字，格式：{"ad":true 或 false,"text":"图中读到的文字，没有则空","reason":"一句话理由"}';

// ===== 正文图片视觉识别（L2）的常量 =====
//
// 与头像那套共用模型（moondream 的 OCR 与结构化输出正好是这里的主需求），
// 但【预算、队列、状态键、分档全部独立】—— 正文图片的量级与头像不是一回事：
// 头像是「一个人一张、一辈子换不了几次」，正文图片是「一个群一天几百张」，
// 共用同一个日预算会让正文把头像那 50 张挤成零。
//
// 【默认值为什么敢给到 300 而头像是 50】见 AD_AVATAR_VISION_DAILY 上方那条
//「按张数熔断而不是按 Neurons」的理由：免费层超限【直接报错】，所以必须保守。
// 主人是付费 Workers（Workers Paid），官方 pricing 页原文口径是
// 「超出每日免费额度按 $0.011 / 1,000 Neurons 计费」，付费层是【计费不是报错】，
// 可用性风险不复存在。默认值仍保留上限，是为了让账单不随群活跃度无界增长 ——
// 这个上限管的是钱，不是可用性。要关掉整条 L2，设 AD_IMAGE_VISION_DAILY=0。
//
// 单张 Neurons 消耗官方仍未公布；按 moondream 的 $0.30/M input、$1.00/M output
// 与 $11/M Neurons 反推，单张约 35~50 Neurons —— 这是【估算值】，不是官方数。
// 300 张/天 ≈ 1.5 万 Neurons，仅占免费额度的 1.5 倍量级，超出部分按单价计费。
const AD_IMAGE_VISION_DAILY = 300;

// ===== 视觉识别失败熔断（2026-10-11，与第⑥层的 AD_LLM_FAIL_BREAK 同一套机制）=====
//
// 【治什么】线上真实状态：头像与正文图视觉识别【全线失败】，一天 350 张一张都没判成，
// 却照样把 moondream 的额度全烧掉（每张 35~50 Neurons，350 张 ≈ 1.5 万）。
// 与第⑥层那个「取值取错」是同一类病：调用发出去了、额度扣掉了、结论拿不到，
// 而所有既有的闸（每日张数上限、队列推进）都只管「跑了多少」，不管「跑成没有」。
//
// 【为什么必须失败即停】视觉识别是【可延迟】的活：一张图今天不判，明天还能判；
// 但额度烧掉就没了。链路坏着的时候继续跑，等于拿钱换一堆 failed 计数。
// 失败即停之后，/adstats 会显示「⛔ 已熔断」，主人一眼就知道该来查了 ——
// 这比「每天 350 条 error 日志但功能照常显示启用」要诚实得多。
// 【20 → 10】2026-10-12。moondream 时代连败 21 次才熔断，前 20 次全是白烧，
// 那时 20 该更紧；但【换 llama 之后失败率从 100% 降到接近 0】（/adstats 实测解析失败 0 次），
// 再压到 3 会让一次网络抖动就把整天的识图停掉 —— 那是拿可用性换额度。
// 10 是折中：偶发抖动扛得住，链路真坏了也不会像 moondream 那样烧满 20 次。
const AD_VISION_FAIL_BREAK = 10;

// moondream/llama 输入图的字节上限。官方没公布精确值，取 2MB ——
// 头像（几 KB~几百 KB）永不触发；正文图取的是【原图】，几 MB 的会撞上。

// 【为什么必须有这一道】2026-10-12 实测：512×512 的图直接调用失败
// （128 与 256 都正常，512 拿不到 usage），说明超大图有体积上限；
// 而正文图下载的就是原图不是缩略图。超限的图喂进去必然失败 ——
// 白烧额度、计入失败计数，还可能连带触发熔断把正常图一起停掉。
// 跳过是省额度不是降功能：那些图本来一条都判不出。
const AD_VISION_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
// 单轮 cron 最多推理多少张。取「日预算 ÷ 每天轮次」，正好让两轮吃完 300：
// crons 是每天 2 次（03:17 / 15:17），设 100 的话日预算永远用不完，
// 配置上限与实际消耗对不上，看板上「当日 x/300」会一直停在 200 以下。
// 队列靠 vision_checked_at 自平衡，轮与轮之间不会重复取同一条。
const AD_IMAGE_VISION_BATCH = 150;
const AD_IMAGE_VISION_MODEL = AD_AVATAR_VISION_MODEL;
// 状态键与头像的 avatar_day / avatar_count 各自独立，两轨互不挤占。
const AD_IMAGE_VISION_DAY_KEY = 'img_day';
const AD_IMAGE_VISION_COUNT_KEY = 'img_count';
const AD_IMAGE_VISION_PROMPT = '这是社交软件聊天记录里的一条【图片消息】。判断它是否是广告引流图：'
	+ '图里若有引流文字（点我一下、免费观看、看主页、看简介、加V、进群、'
	+ '赚钱、代理、代购、招租、约、开车、上车）、二维码、联系方式、'
	+ '色情或赌博内容、明显商品推销、以及「标题条 + 缩略图 + 底部条」这种'
	+ '批量套版的引流图，即为广告。'
	+ '以下一律【不是】广告：自拍、风景、宠物、家人、动漫与表情包、梗图、'
	+ '群聊截图（截的是文字对话）、文档与代码截图、菜单与价目表照片、'
	+ '游戏与软件界面、纯色与普通图案。'
	// 【唯一例外，优先级高于上面那条豁免】色情本身就是一个广告类型（色情广告），
	// 而贴纸 / 表情包 / 动漫只是载体 —— 载体不构成豁免。原措辞里
	//「色情即广告」与「表情包一律不是广告」两条同时命中一张色情贴纸，
	// 模型判哪边都算合规，等于这条判据随机失效。
	+ '【唯一例外】上面任何一类只要含色情内容，一律判 true —— 色情是广告类型，'
	+ '表情包 / 贴纸 / 动漫这个载体不豁免；普通表情包（不含色情）照旧不判。'
	+ '拿不准就判 false —— 这一层只加分与进观察，宁可漏判也不能误伤正常发言。'
	+ '只输出 JSON，不要任何其它文字，格式：{"ad":true 或 false,"text":"图中读到的文字，没有则空","reason":"一句话理由"}';

// 从模型回答里抠 JSON。解析不出来一律按「未判」处理 —— 宁可漏判也不能靠猜定罪。
// ===== 视觉模型的统一调用口 =====
//
// 【返回结构与 moondream 完全不同】llama 系返回 {"response":"..."}，而且会把
// prompt【一起回显】在答案后面 —— 实测是「答案在前，<image> 之后是完整 prompt」。
// 所以必须先截到第一个 <image> 之前，剩下的才是模型自己写的。
//
// 【空响应重试一次】menshen 同款处理（HANDOFF.md：「识图拿思考内容兜底，
// 推理模型偶发正文为空 + 空响应重试一次」）。推理模型确实会偶发吐空，
// 一次重试能把这种抖动挡住，而单张只花 4 Neurons。
async function runVisionModel(env, model, imageUri, prompt) {
	let lastText = '';
	for (let attempt = 1; attempt <= 2; attempt++) {
		let aiResult = null;
		try {
			aiResult = await env.AI.run(model, {
				prompt: '<image>\n' + prompt,
				image_url: { url: imageUri },
				max_tokens: 512,
				temperature: 0.2
			});
		} catch (error) {
			// 调用异常直接抛给调用方（它有 stage 日志），不在这里吞掉重试 ——
			// 网络/权限类错误重试也是同样的错，白花一次。
			throw error;
		}
		const raw = aiResult?.response ?? aiResult?.result ?? aiResult;
		lastText = extractVisionResponseText(raw);
		if (lastText) return lastText;
		// 两次都空：把返回字段名打出来。今天连栽两次都是「返回结构靠猜」，
		// 这行日志是唯一能一次定位的东西（只记字段名不记内容，不泄露图上信息）。
		console.error('[广告检测·视觉识别] 模型返回里取不到文本', JSON.stringify({
			model,
			keys: raw && typeof raw === 'object' ? Object.keys(raw).slice(0, 12) : typeof raw
		}));
	}
	return lastText;
}

// 从模型返回里抠出「模型自己写的那部分」：截掉 prompt 回显。
function extractVisionResponseText(raw) {
	if (raw == null) return '';
	const text = String(raw).trim();
	if (!text) return '';
	const cut = text.indexOf('<image>');
	return (cut >= 0 ? text.slice(0, cut) : text).trim();
}

function parseAvatarVisionAnswer(raw) {
	const text = String(raw || '').trim();
	if (!text) return null;
	const matched = text.match(/\{[\s\S]*\}/);
	if (!matched) return null;
	try {
		const parsed = JSON.parse(matched[0]);
		const ad = parsed?.ad === true || String(parsed?.ad).toLowerCase() === 'true';
		return { ad, text: String(parsed?.text || '').slice(0, 120), reason: String(parsed?.reason || '').slice(0, 120) };
	} catch (_) {
		return null;
	}
}

// 图片字节 → base64（分块拼接，避免大图 spread 爆调用栈）。
function bytesToBase64(bytes) {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

// 取消今日的头像推理额度（与 bio 扫描共用 ad_scan_state，key 不同互不干扰）。
// 取今日的 LLM 深度判定额度。状态键 llm_day / llm_count 与头像、图片两轨各自独立。
//
// 【与 readAvatarVisionQuota 的一处刻意差异：跨天时把计数一并写回 0】
// 那个函数只写 day 不写 count，于是「某天空跑一轮」（队列空提前 return、没走到写
// count 那行）之后，第二天第一次读会把昨天的残留当成今天已用 —— 新轨道不复制这个隐患。
// 这里不顺手改旧函数：它不在这次任务范围内，改它要连带复验视觉识别的额度行为。
// 分池记账键。四个调用点各归各的池，谁也挤不掉谁 —— 详见 AD_LLM_DAILY 的说明。
const AD_LLM_POOLS = ['message', 'join', 'cron'];

// 一次消耗同时写总计数与分池计数。两笔必须在同一个函数里写完 ——
// 拆成两个调用点的话，中间任何一步失败都会留下「总池扣了、分池没扣」的账，
// 分池从此虚高、永远够不着上限，白分。
async function bumpAdLLMQuota(env, nextTotal, pool, nextPoolUsed, nowSeconds) {
	await writeAdScanState(env, 'llm_count', String(nextTotal), nowSeconds);
	if (AD_LLM_POOLS.includes(String(pool))) {
		await writeAdScanState(env, 'llm_pool_' + pool, String(nextPoolUsed), nowSeconds);
	}
}

async function readAdLLMQuota(env, nowSeconds) {
	const today = new Date(nowSeconds * 1000).toISOString().slice(0, 10);
	const savedDay = await readAdScanState(env, 'llm_day', '');
	if (savedDay !== today) {
		await writeAdScanState(env, 'llm_day', today, nowSeconds);
		await writeAdScanState(env, 'llm_count', '0', nowSeconds);
		// 观测计数一并归零：它们与额度同处一天窗口，只在这里清就永远是当天值
		//（bumpAdLLMOutcome 写入时也判一次跨天，两头都兜住才不会残留）。
		await writeAdScanState(env, 'llm_hits', '0', nowSeconds);
		await writeAdScanState(env, 'llm_bans', '0', nowSeconds);
		await writeAdScanState(env, 'llm_parse_fail', '0', nowSeconds);
		// 分池计数同样必须在这里清 —— 只清总计数不清池，第二天第一轮会把
		// 昨天各池的消耗当成今天的，池额度在凌晨直接就是满的，等于白分。
		for (const pool of AD_LLM_POOLS) {
			await writeAdScanState(env, 'llm_pool_' + pool, '0', nowSeconds);
		}
		// 熔断状态也只在跨天清 —— 昨天链路坏了不等于今天也坏；不清的话
		// 第二天第一次调用仍读到「已熔断」，第⑥层会被永久关掉，比不加熔断更糟。
		await writeAdScanState(env, 'llm_consec_fail', '0', nowSeconds);
		await writeAdScanState(env, 'llm_broken_day', '', nowSeconds);
		await writeAdScanState(env, 'llm_last_shape', '', nowSeconds);
		// 解析成功 / 失败的时间戳也一并清 —— 它们只对「当天链路现在健不健康」有意义。
		await writeAdScanState(env, 'llm_last_fail_seq', '0', nowSeconds);
		await writeAdScanState(env, 'llm_last_success_seq', '0', nowSeconds);
		return { today, used: 0, pools: { message: 0, join: 0, cron: 0 }, broken: false, consecFail: 0, lastShape: '' };
	}
	const used = Number(await readAdScanState(env, 'llm_count', '0')) || 0;
	const pools = {};
	for (const pool of AD_LLM_POOLS) {
		pools[pool] = Number(await readAdScanState(env, 'llm_pool_' + pool, '0')) || 0;
	}
	// 熔断标记存的是「触发当天的日期」而不是布尔 —— 这样过期的标记天然失效，
	// 不需要在别处再写一遍「昨天的不算」的判断。
	const broken = String(await readAdScanState(env, 'llm_broken_day', '')) === today;
	const consecFail = Number(await readAdScanState(env, 'llm_consec_fail', '0')) || 0;
	// 上次解析失败时，Workers AI 返回对象的【字段名清单】。只记字段名不记内容 ——
	// 那里面带着别人的 bio 与消息片段，摆到 /adstats 上是实打实的隐私泄露面；
	// 而排查需要的恰恰只是「正文在哪个字段」，字段名足够。
	const lastShape = String(await readAdScanState(env, 'llm_last_shape', ''));
	return { today, used, pools, broken, consecFail, lastShape };
}

// 记第 ⑥ 层的观测计数：模型判为广告几次、其中真正达采信线几次。
//
// 【为什么要有它】上线首日的线上状态是「调了 5 次、0 命中」，而这个 0 在没有计数时
// 与「压根没跑」完全无法区分 —— 主人问「修好了吗」时我只能靠 ad_scan_state 的调用
// 次数反推，看不出判定结论。摆在 /adstats 上才是可自查的。
//
// 【开销】只在模型真给出 ad 结论时写（低频），也只有 /adstats 读它 —— 热路径不为
// 它多付 SQL：judgeAdByLLM 那条路上一个字段都不读。
async function bumpAdLLMOutcome(env, reachedLine) {
	if (!env?.DB) return;
	try {
		const now = Math.floor(Date.now() / 1000);
		await writeAdScanState(env, 'llm_hits',
			String((await readAdScanState(env, 'llm_hits', '0')) * 1 + 1), now);
		if (reachedLine) {
			await writeAdScanState(env, 'llm_bans',
				String((await readAdScanState(env, 'llm_bans', '0')) * 1 + 1), now);
		}
	} catch (error) {
		// 观测计数失败不影响判定 —— 宁可少记一次也不能把这条路径弄崩。
		console.error('[广告检测·深度判定] 记录观测计数失败:', error);
	}
}

// 读第 ⑥ 层的今日观测计数。只给 /adstats 用，不在任何判定路径上。
// 与 readAdLLMQuota 同一把尺：day 不是今天就一律按 0 报，不读昨天的残留。
async function readAdLLMOutcome(env, nowSeconds) {
	const empty = { used: 0, hits: 0, bans: 0, parseFail: 0, pools: { message: 0, join: 0, cron: 0 }, broken: false, consecFail: 0, lastShape: '', lastFailSeq: 0, lastSuccessSeq: 0 };
	if (!env?.DB) return empty;
	const today = new Date(nowSeconds * 1000).toISOString().slice(0, 10);
	const day = await readAdScanState(env, 'llm_day', '');
	if (day !== today) return empty;
	const num = async (key) => Number(await readAdScanState(env, key, '0')) || 0;
	const pools = {};
	for (const pool of AD_LLM_POOLS) pools[pool] = await num('llm_pool_' + pool);
	// parseFail：模型返回了内容但抠不出 JSON 的次数。与 hits 一起看才能分辨
	// 「模型判 false」与「输出格式跑偏」—— 详见 bumpAdLLMParseFail。
	return {
		used: await num('llm_count'),
		hits: await num('llm_hits'),
		bans: await num('llm_bans'),
		parseFail: await num('llm_parse_fail'),
		pools,
		// 熔断状态与连续失败数：摆出来才知道第⑥层到底是「没起作用」还是「已经停了」。
		broken: String(await readAdScanState(env, 'llm_broken_day', '')) === today,
		consecFail: await num('llm_consec_fail'),
		// 上次解析失败时返回对象的字段名清单（不含内容，理由见 readAdLLMQuota）。
		lastShape: String(await readAdScanState(env, 'llm_last_shape', '')),
		// 最后一次失败 / 成功的时刻。看板据此判断「链路现在健不健康」，
		// 而不是看「今天失败过几次」—— 那个数字只会单调上涨，修好了也不归零，
		// 挂着一个吓人的感叹号却什么都没坏（2026-10-11 主人的原话：「我希望它完美的打勾」）。
		// 【用调用序号不用时间戳】同一秒内「先失败后成功」时两个时间戳相等，
		// 按 >= 判断会误报「链路坏了」，按 > 判断又会漏报。序号（本次调用后的总次数）
		// 天然单调，谁先谁后一目了然。
		lastFailSeq: Number(await readAdScanState(env, 'llm_last_fail_seq', '0')) || 0,
		lastSuccessSeq: Number(await readAdScanState(env, 'llm_last_success_seq', '0')) || 0
	};
}

async function readAvatarVisionQuota(env, nowSeconds) {
	const today = new Date(nowSeconds * 1000).toISOString().slice(0, 10);
	const savedDay = await readAdScanState(env, 'avatar_day', '');
	const count = savedDay === today ? (Number(await readAdScanState(env, 'avatar_count', '0')) || 0) : 0;
	if (savedDay !== today) await writeAdScanState(env, 'avatar_day', today, nowSeconds);
	return { today, used: count };
}

// 视觉识别失败的统一日志。
//
// 【为什么单独抽一个函数】头像与正文图两条轨的失败日志原本是
// `console.error('识别失败 id=' + id + ':', error)`。线上真实日志里这个 error 的
// message 是【空的】—— Workers Logs 只打印出裸栈「at runAdImageVision (_worker.js:13084:26)」，
// 看不出是 getFile 401、下载 404、图片超限，还是 AI 调用被拒。
// 2026-10-11 那轮头像与正文图【全线失败】，几十条 error 日志一条都没带出可用信息。
// 把 name / message / 字符串化结果 / stack 全部拆开打，再带上阶段标记，才是可排查的日志。
//
// 【不改变任何处置】只多打几行日志。失败仍照旧计数、仍照旧推进 vision_checked_at，
// 不会让一张失败的图被反复重试烧额度（那是 upsertAdAvatar 那侧的既有保证）。
// 这个错误是不是「限流」而不是「链路故障」。
//
// 【为什么必须分开】Workers AI 对【需付费计划的模型】限 **20 RPM**
//（官方 limits 页：标准计费 20 RPM，预付 AI Gateway 50 RPM），
// 而 llama-3.2-11b-vision-instruct 就属于这类。两轨串行跑几百张，
// 撞上 429 是【必然】，不是故障。
//
// 如果把它算进 failed：熔断会被限流触发，当天识图全部停摆 ——
// 拿可用性换了一个本来就会自己恢复的临时状态。
// 正确处理是【跳过这一张、下一轮 cron 再来】：不烧额度、不计失败、不触发熔断。
function isVisionRateLimited(error) {
	const msg = String(error?.message || error || '');
	return /429|too many requests|rate\s*limit/i.test(msg);
}

function logAdVisionFailure(kind, stage, id, error) {
	console.error('[广告检测·' + kind + '] 识别失败 stage=' + stage
		+ ' id=' + String(id || '')
		+ ' errorName=' + String(error?.name || '(无)')
		+ ' errorMessage=' + String(error?.message || '(空)')
		+ ' errorString=' + String(error).slice(0, 200)
		+ ' stack=' + String(error?.stack || '').replace(/\s+/g, ' ').slice(0, 300));
}

// 视觉识别熔断状态（头像与正文图【共用一套】—— 同一个模型、同一根因，分两套只会让排查翻倍）。
// 跨天自动恢复：熔断标记存的是「触发当天的日期」，过期即失效。
// 把视觉识别的熔断状态渲染成一行后缀。健康时返回空串 —— 看板上不添废话。
function describeVisionBreak(visionBreak) {
	if (visionBreak?.broken) {
		return '　⛔ 已熔断：连续 ' + Number(visionBreak.consecFail || 0) + ' 次识别失败，'
			+ '今日不再调用 moondream（排查见「识别失败 stage=」日志）';
	}
	if (Number(visionBreak?.consecFail) > 0) {
		return '　⚠️ 已连续失败 ' + Number(visionBreak.consecFail) + ' 次（满 ' + AD_VISION_FAIL_BREAK + ' 次自动熔断）';
	}
	return '';
}

async function readVisionBreakState(env, nowSeconds) {
	const today = new Date(nowSeconds * 1000).toISOString().slice(0, 10);
	const savedDay = String(await readAdScanState(env, 'vision_day', ''));
	if (savedDay !== today) {
		await writeAdScanState(env, 'vision_day', today, nowSeconds);
		await writeAdScanState(env, 'vision_consec_fail', '0', nowSeconds);
		await writeAdScanState(env, 'vision_broken_day', '', nowSeconds);
		return { broken: false, consecFail: 0 };
	}
	const broken = String(await readAdScanState(env, 'vision_broken_day', '')) === today;
	const consecFail = Number(await readAdScanState(env, 'vision_consec_fail', '0')) || 0;
	return { broken, consecFail };
}

// 记一次视觉识别结果：成功清零连续失败，失败累加，连着 AD_VISION_FAIL_BREAK 次就熔断。
// 视觉识别是【可延迟】的活 —— 一张图今天不判明天还能判，但额度烧掉就没了，
// 所以链路坏着的时候继续跑等于拿钱换一堆 failed 计数。
async function bumpVisionBreakState(env, ok, nowSeconds) {
	const { consecFail } = await readVisionBreakState(env, nowSeconds);
	if (ok) {
		if (consecFail > 0) await writeAdScanState(env, 'vision_consec_fail', '0', nowSeconds);
		return;
	}
	const next = consecFail + 1;
	await writeAdScanState(env, 'vision_consec_fail', String(next), nowSeconds);
	if (next >= AD_VISION_FAIL_BREAK) {
		const today = new Date(nowSeconds * 1000).toISOString().slice(0, 10);
		await writeAdScanState(env, 'vision_broken_day', today, nowSeconds);
		console.error('[广告检测·视觉识别] 已熔断：连续 ' + next + ' 次识别失败，今日不再调用 moondream。'
			+ '排查线索见「识别失败 stage=」那几行日志。');
	}
}

async function runAdAvatarVision(env, options = {}) {
	const stats = { queued: 0, done: 0, ad: 0, clean: 0, failed: 0, skipped: '', skippedLarge: 0, rateLimited: 0 };
	if (!env?.DB) { stats.skipped = 'no_db'; return stats; }
	if (!(await adDetectionReady(env))) { stats.skipped = 'not_ready'; return stats; }

	// 先消化补学队列。它排在 AI 判断【之前】：闸一定罪的号只有这里能补到头像，
	// 与模型绑不绑毫无关系 —— 挪到 AI 分支后面的话，未绑 AI 的部署永远学不到头像。
	stats.learnQueue = await drainAdAvatarLearningQueue(env, Number(options.learnLimit) || 30);

	// 未绑 Workers AI：与广告检测整体的降级口径一致 —— 跳过而不是报错。
	if (!env.AI) { stats.skipped = 'no_ai'; return stats; }

	const config = loadAdDetectionConfig(env);
	// 环境变量 AD_AVATAR_VISION_DAILY=0 即关闭 L2（只保留 L1 指纹查表，零 Neurons）。
	// options.dailyLimit 仅供测试注入，传了就覆盖。
	const dailyLimit = Number(options.dailyLimit) >= 0 ? Number(options.dailyLimit) : config.avatarVisionDaily;
	const nowSeconds = Math.floor(Date.now() / 1000);
	const quota = await readAvatarVisionQuota(env, nowSeconds);
	const remaining = dailyLimit - quota.used;
	if (dailyLimit <= 0) { stats.skipped = 'disabled'; return stats; }
	if (remaining <= 0) { stats.skipped = 'daily_limit_reached'; stats.queued = quota.used; return stats; }
	// 熔断：连续 AD_VISION_FAIL_BREAK 次失败后当天不再调用 moondream —— 理由见 AD_VISION_FAIL_BREAK。
	if ((await readVisionBreakState(env, nowSeconds)).broken) { stats.skipped = 'broken'; return stats; }

	let rows = [];
	try {
		rows = await env.DB.prepare(
			'SELECT file_unique_id, file_id, last_user_id FROM ad_avatars '
			+ 'WHERE verdict = \'pending\' AND vision_checked_at = 0 AND file_id != \'\' '
			+ 'ORDER BY updated_at ASC LIMIT ?'
		).bind(Math.min(remaining, Number(options.batchSize) > 0 ? Number(options.batchSize) : dailyLimit)).all();
		rows = (rows && rows.results) || rows || [];
	} catch (error) {
		console.error('[广告检测·头像] 取队列失败:', error);
		stats.skipped = 'queue_error';
		return stats;
	}
	stats.queued = rows.length;
	if (!rows.length) return stats;

	let used = quota.used;
	// 末条判定摘要，仅供日志。声明必须在循环外 —— 否则日志那一行会 ReferenceError，
	// 而这个函数整趟跑在 cron 里，崩了就等于当天头像识别全部白跑。
	let lastNote = '';
	for (const row of rows) {
		// 无论成败都推进 vision_checked_at：否则一次 429 或模型抽风会让这张图
		// 每轮都被取出来反复烧额度，把当天预算全耗在同一个失败项上。
		let verdict = 'pending';
		let note = '';
		// 失败定位用。线上真实日志里这个 error 的 message 是【空的】，Workers Logs 只打出了
		// 裸栈「at runAdImageVision …」—— getFile 401、下载 404、图片超限、AI 调用被拒，
		// 在看板上长得一模一样。有这个变量才知道挂在哪一步。
		let stage = 'init';
		try {
			stage = 'getFile';
			// 与全文件其它 Telegram 调用同一写法（项目没有通用封装，一律直连 fetch）。
			const fileResponse = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/getFile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ file_id: String(row.file_id) })
			});
			const fileResult = await fileResponse.json();
			if (!fileResult?.ok) throw new Error(fileResult?.description || 'getFile 失败');
			const filePath = String(fileResult?.result?.file_path || '');
			if (!filePath) throw new Error('file_path 为空');
			// 官方：该下载链接至少 1 小时有效，文件上限 20MB（头像远小于它）。
			stage = 'download';
			const imageResponse = await fetch('https://api.telegram.org/file/bot' + BOT_TOKEN + '/' + filePath);
			if (!imageResponse.ok) throw new Error('下载失败 status=' + imageResponse.status);
			const buffer = await imageResponse.arrayBuffer();
			// 【尺寸闸】超限的图喂进去必然失败 —— 2026-10-12 实测 512×512 直接调用失败，
			// 而正文图下载的是【原图】不是缩略图。跳过是省额度不是降功能：
			// 白烧一次、计一次 failed，还可能连带触发熔断把正常图一起停掉。
			if (buffer.byteLength > AD_VISION_MAX_IMAGE_BYTES) {
				stats.skippedLarge += 1;
				console.log('[视觉识别] 图片超过尺寸上限，跳过推理', JSON.stringify({ 字节: buffer.byteLength, 上限: AD_VISION_MAX_IMAGE_BYTES }));
				continue;
			}
			stage = 'encode';
			const image = 'data:image/jpeg;base64,' + bytesToBase64(new Uint8Array(buffer));
			stage = 'ai.run';
			const answerText = await runVisionModel(env, AD_AVATAR_VISION_MODEL, image, AD_AVATAR_VISION_PROMPT);
			const parsed = parseAvatarVisionAnswer(answerText);
			if (!parsed) throw new Error('模型回答无法解析: ' + String(answerText).slice(0, 200));
			verdict = parsed.ad ? 'ad' : 'clean';
			lastNote = (parsed.text ? ' 文字:' + parsed.text : '') + (parsed.reason ? ' 理由:' + parsed.reason : '');
		} catch (error) {
			// 【429 不计入失败、不触发熔断】限流是必然会遇到的临时状态，不是链路故障 ——
			// Workers AI 对需付费计划的模型限 20 RPM，串行跑几百张【必然】撞上。
			// 而且【不推进 vision_checked_at】：这张图下一轮 cron 还会被取出来重判，
			// 这中间一个 Neurons 都没花（调用本身就被拒了）。
			if (isVisionRateLimited(error)) {
				stats.rateLimited += 1;
				continue;
			}
			stats.failed += 1;
			logAdVisionFailure('头像', stage, row.file_unique_id, error);
		}
		try {
			await upsertAdAvatar(env, row.file_unique_id, {
				verdict,
				source: verdict === 'pending' ? null : 'vision',
				visionCheckedAt: Math.floor(Date.now() / 1000)
			});
		} catch (error) {
			console.error('[广告检测·头像] 写回结果失败:', error);
		}
		// 熔断计数：verdict 仍是 'pending' 就是这次没判成（失败或跳过），
		// 连着 AD_VISION_FAIL_BREAK 次没判成，当天就别再烧 moondream 额度了。
		await bumpVisionBreakState(env, verdict !== 'pending', Math.floor(Date.now() / 1000));
		if (verdict === 'ad') stats.ad += 1;
		else if (verdict === 'clean') stats.clean += 1;
		if (verdict !== 'pending') stats.done += 1;
		used += 1;
		await writeAdScanState(env, 'avatar_count', String(used), Math.floor(Date.now() / 1000));
	}
	console.log('[广告检测·头像] 本轮 队列=' + stats.queued + ' 完成=' + stats.done
		+ ' 广告=' + stats.ad + ' 干净=' + stats.clean + ' 失败=' + stats.failed
		+ ' 当日=' + used + '/' + dailyLimit + (lastNote ? ' 末条:' + lastNote : ''));
	return stats;
}

// 能交给 moondream 推理的载体。只有静态位图。
// animation / video 是 mp4、webm，document 未知（要下载才知道 MIME），
// 塞给一个图片模型只会白烧一次请求再记一笔失败 —— 它们的出路是 L1：
// 登记进指纹表，靠「同款复用」命中。所以在取队列时就按 kind 排除，
// 让这几类永远不进推理队列，而不是进去后失败再标记。
const AD_IMAGE_VISION_KINDS = ['photo', 'sticker'];

// 取今日的正文图片推理额度。与头像的 avatar_day / avatar_count 各自独立，
// 两轨互不挤占 —— 正文图片量大，共用一个计数器会把头像那 50 张挤成零。
async function readImageVisionQuota(env, nowSeconds) {
	const today = new Date(nowSeconds * 1000).toISOString().slice(0, 10);
	const savedDay = await readAdScanState(env, AD_IMAGE_VISION_DAY_KEY, '');
	const count = savedDay === today ? (Number(await readAdScanState(env, AD_IMAGE_VISION_COUNT_KEY, '0')) || 0) : 0;
	if (savedDay !== today) await writeAdScanState(env, AD_IMAGE_VISION_DAY_KEY, today, nowSeconds);
	return { today, used: count };
}

// ===== 正文图片视觉识别（L2）=====
// 结构照抄 runAdAvatarVision：cron 队列消费、按张数熔断、逐张推 vision_checked_at。
// 挂 cron 而不是消息路径的理由与头像完全相同 —— 一次推理要 getFile + 下载 +
// 模型调用，挂在消息上会拖慢每一次回复，且撞子请求配额；付费层解决的是
// 「超限报错」，解决不了「每条消息慢半秒」。
async function runAdImageVision(env, options = {}) {
	const stats = { queued: 0, done: 0, ad: 0, clean: 0, failed: 0, skipped: '', skippedLarge: 0, rateLimited: 0 };
	if (!env?.DB) { stats.skipped = 'no_db'; return stats; }
	if (!(await adDetectionReady(env))) { stats.skipped = 'not_ready'; return stats; }
	// 未绑 Workers AI：与广告检测整体的降级口径一致 —— 跳过而不是报错。
	if (!env.AI) { stats.skipped = 'no_ai'; return stats; }

	const config = loadAdDetectionConfig(env);
	// 环境变量 AD_IMAGE_VISION_DAILY=0 即关闭 L2（只保留 L1 指纹查表，零 Neurons）。
	const dailyLimit = Number(options.dailyLimit) >= 0 ? Number(options.dailyLimit) : config.imageVisionDaily;
	const nowSeconds = Math.floor(Date.now() / 1000);
	const quota = await readImageVisionQuota(env, nowSeconds);
	const remaining = dailyLimit - quota.used;
	if (dailyLimit <= 0) { stats.skipped = 'disabled'; return stats; }
	if (remaining <= 0) { stats.skipped = 'daily_limit_reached'; stats.queued = quota.used; return stats; }
	// 熔断：连续 AD_VISION_FAIL_BREAK 次失败后当天不再调用 moondream —— 理由见 AD_VISION_FAIL_BREAK。
	if ((await readVisionBreakState(env, nowSeconds)).broken) { stats.skipped = 'broken'; return stats; }

	let rows = [];
	try {
		const kinds = AD_IMAGE_VISION_KINDS.map((k) => '\'' + k + '\'').join(', ');
		rows = await env.DB.prepare(
			'SELECT file_unique_id, file_id, kind, last_user_id FROM ad_images '
			+ 'WHERE verdict = \'pending\' AND vision_checked_at = 0 AND file_id != \'\' '
			+ 'AND kind IN (' + kinds + ') '
			+ 'ORDER BY updated_at ASC LIMIT ?'
		).bind(Math.min(remaining, Number(options.batchSize) > 0 ? Number(options.batchSize) : dailyLimit)).all();
		rows = (rows && rows.results) || rows || [];
	} catch (error) {
		console.error('[广告检测·图片] 取队列失败:', error);
		stats.skipped = 'queue_error';
		return stats;
	}
	stats.queued = rows.length;
	if (!rows.length) return stats;

	let used = quota.used;
	let lastNote = '';
	for (const row of rows) {
		// 无论成败都推进 vision_checked_at：否则一次 429 或模型抽风会让这张图
		// 每轮都被取出来反复烧额度 —— 付费层虽然不报错，但会照单计费。
		let verdict = 'pending';
		let note = '';
		// 失败定位用，理由见 logAdVisionFailure。
		let stage = 'init';
		try {
			stage = 'getFile';
			const fileResponse = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/getFile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ file_id: String(row.file_id) })
			});
			const fileResult = await fileResponse.json();
			if (!fileResult?.ok) throw new Error(fileResult?.description || 'getFile 失败');
			const filePath = String(fileResult?.result?.file_path || '');
			if (!filePath) throw new Error('file_path 为空');
			stage = 'download';
			const imageResponse = await fetch('https://api.telegram.org/file/bot' + BOT_TOKEN + '/' + filePath);
			if (!imageResponse.ok) throw new Error('下载失败 status=' + imageResponse.status);
			const buffer = await imageResponse.arrayBuffer();
			// 【尺寸闸】超限的图喂进去必然失败 —— 2026-10-12 实测 512×512 直接调用失败，
			// 而正文图下载的是【原图】不是缩略图。跳过是省额度不是降功能：
			// 白烧一次、计一次 failed，还可能连带触发熔断把正常图一起停掉。
			if (buffer.byteLength > AD_VISION_MAX_IMAGE_BYTES) {
				stats.skippedLarge += 1;
				console.log('[视觉识别] 图片超过尺寸上限，跳过推理', JSON.stringify({ 字节: buffer.byteLength, 上限: AD_VISION_MAX_IMAGE_BYTES }));
				continue;
			}
			// 按字节头认格式，不按 kind 猜。kind 只说明载体类型（photo/sticker），
			// 说明不了里面是什么字节 —— 存量行存的可能是本体，新行存的是 thumbnail，
			// 两者格式不同但都要能认出来。认不出就跳过，绝不拿错格式硬喂模型
			// （喂错格式 = 模型抛错 = 计 failed，那正是这个 bug 的原貌）。
			stage = 'sniff';
			const mime = sniffImageMime(new Uint8Array(buffer));
			if (!mime) throw new Error('下载到的不是位图（可能是 .tgs / .webm 容器），跳过推理');
			stage = 'encode';
			const image = 'data:' + mime + ';base64,' + bytesToBase64(new Uint8Array(buffer));
			stage = 'ai.run';
			const answerText = await runVisionModel(env, AD_IMAGE_VISION_MODEL, image, AD_IMAGE_VISION_PROMPT);
			const parsed = parseAvatarVisionAnswer(answerText);
			if (!parsed) throw new Error('模型回答无法解析: ' + String(answerText).slice(0, 200));
			verdict = parsed.ad ? 'ad' : 'clean';
			note = (parsed.text ? ' 文字:' + parsed.text : '') + (parsed.reason ? ' 理由:' + parsed.reason : '');
			lastNote = note;
		} catch (error) {
			// 【429 不计入失败、不触发熔断】限流是必然会遇到的临时状态，不是链路故障 ——
			// Workers AI 对需付费计划的模型限 20 RPM，串行跑几百张【必然】撞上。
			// 而且【不推进 vision_checked_at】：这张图下一轮 cron 还会被取出来重判，
			// 这中间一个 Neurons 都没花（调用本身就被拒了）。
			if (isVisionRateLimited(error)) {
				stats.rateLimited += 1;
				continue;
			}
			stats.failed += 1;
			logAdVisionFailure('图片', stage, row.file_unique_id, error);
		}
		try {
			await upsertAdImage(env, row.file_unique_id, {
				verdict,
				source: verdict === 'pending' ? null : 'vision',
				kind: String(row.kind || ''),
				visionCheckedAt: Math.floor(Date.now() / 1000)
			});
		} catch (error) {
			console.error('[广告检测·图片] 写回结果失败:', error);
		}
		// 熔断计数：verdict 仍是 'pending' 就是这次没判成（失败或跳过），
		// 连着 AD_VISION_FAIL_BREAK 次没判成，当天就别再烧 moondream 额度了。
		await bumpVisionBreakState(env, verdict !== 'pending', Math.floor(Date.now() / 1000));
		if (verdict === 'ad') stats.ad += 1;
		else if (verdict === 'clean') stats.clean += 1;
		if (verdict !== 'pending') stats.done += 1;
		used += 1;
		await writeAdScanState(env, AD_IMAGE_VISION_COUNT_KEY, String(used), Math.floor(Date.now() / 1000));
	}
	console.log('[广告检测·图片] 本轮 队列=' + stats.queued + ' 完成=' + stats.done
		+ ' 广告=' + stats.ad + ' 干净=' + stats.clean + ' 失败=' + stats.failed
		+ ' 当日=' + used + '/' + dailyLimit + (lastNote ? ' 末条:' + lastNote : ''));
	return stats;
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
// ===== 形态 E · 金额招揽 =====
//
// 2026-10-05 线上实测这批漏放的共同形态：把【钱】和【招人/收钱的动作】写在一起，
// 但既不命中「招揽动词 × 行业词」形态 A（那些词一个都不在词表），也不在任何既有形态里：
//   「进群了解项目 一天8000」「微信帮我收款 赚一万」「带单老师带你赚5万」「收款码发我 一单800」
// 逐个往词表里加词治不了 —— 变体无穷无尽，加一次漏一批（正是前几轮的教训）。
// 所以判的是【结构】：金额 与 收益/招揽动作 同现，两类缺一不可。
//
// 【+5 而不是直接封】金额+收钱在正常对话里也常见（「收款码发我 转你200」），
// 所以这一档最高只把人推到观察线：撞观察 = 进观察窗口 + 通知主人复核，不封不禁言。
// 真广告要么再发一条撞到 7 分，要么被 /pending 复核时一眼看出来。宁可多观察，不可误封。
const AD_MONEY_SOLICIT_SCORE = 5;
// 金额：数字带货币单位 / 货币符号 / 大写人民币数额 / 【单位在前】的时薪业务量写法。
// 「一天8000」「一单800」这类单位在前的写法是线上实测原文（Lisa 的简介、收款变体），
// 只写「数字+单位」会整批漏掉 —— 这也是为什么金额正则要正反两个方向都覆盖。
const AD_MONEY_AMOUNT_RE = new RegExp(
	'(?:¥|￥)'
	+ '|(?:\\d[\\d,\\.\\s]{0,6}\\s*(?:万|千|百|[kKwW]|元|块|rmb|usdt))'
	+ '|(?:[一二三四五六七八九十两]\\s*[万亿])'
	+ '|(?:[一两\\d]+\\s*(?:天|日|单|笔)\\s*\\d{2,6})'	// 一天8000 / 一单800 / 两单5000
	+ '|(?:\\b\\d{3,6}\\b(?=\\s*(?:[个张单笔天]|/天)))'
	, 'i');
// 收益动作：承诺赚钱、回报、赌博类。
const AD_MONEY_GAIN_RE = /赚|收益|利润|稳赚|日赚|日结|月结|躺赚|月入|回本|分红|上分|回血|包赢|带单|跟单|带你/;
// 招人 / 收钱动作：拉人入群、代收款、带货销售。
const AD_MONEY_SOLICIT_RE = /进群|入群|拉群|了解项目|了解详情|加[薇微vV信]|私我|点我|接单|一单|代收|代付|跑分|收款|收钱|出货|批发|低价|七折|折扣|专卖|上新|代购|带货|面交/;

// 命中返回 {score, reason}，不命中返回 null（由调用方决定加不加）。
function scoreAdMoneySolicit(text) {
	const source = String(text || '');
	if (!source.trim()) return null;
	const amount = AD_MONEY_AMOUNT_RE.test(source);
	if (!amount) return null;
	const gain = AD_MONEY_GAIN_RE.test(source);
	const solicit = AD_MONEY_SOLICIT_RE.test(source);
	// 金额 + 任一动作即成立（两类同现的下限）。两个都没有就只是在报数，不算招揽。
	if (!gain && !solicit) return null;
	const labels = [gain ? '收益动作' : '', solicit ? '招人/收钱动作' : ''].filter(Boolean).join(' × ');
	return { score: AD_MONEY_SOLICIT_SCORE, reason: '金额与' + labels + '同现（形态 E 金额招揽，达观察线不定罪）' };
}

// ===== 自定义 emoji 的贴纸包名判据（批次 B-2）=====
// getCustomEmojiStickers 返回的 set_name 是这个 emoji 出自哪个贴纸包。
// 广告组织的包名往往直接写着广告内容（加微信 / 日赚 / 看我简介 …），与
// 「资料挂的频道简介含招揽」同一个打法：判的是【内容】，不是【有没有挂】。
//
// 判据源一律复用现成词表（业务关键词 + 招揽动作），不新建词表 ——
// 每加一张词表就多一片误封面，这是本项目四次误封换来的规矩。
// 【只加分不定罪】包名是共享资源：正常人转一个 emoji 也会带上同一个包名，
// 与会员标、正文同款 id 一样，靠分值参与裁决而不是单独定罪。
const AD_CUSTOM_EMOJI_PACK_SCORE = 2;
function scoreAdCustomEmojiPacks(packs) {
	if (!packs || typeof packs !== 'object') return null;
	for (const info of Object.values(packs)) {
		const name = String(info?.setName || '');
		if (!name) continue;
		const bizHits = countAdKeywordHits(name, AD_BUSINESS_KEYWORDS);
		if (bizHits.length) {
			return {
				score: AD_CUSTOM_EMOJI_PACK_SCORE,
				reason: '自定义 emoji 出自贴纸包「' + name.slice(0, 40) + '」含业务关键词：' + bizHits.slice(0, 3).join('/')
			};
		}
		if (AD_MONEY_SOLICIT_RE.test(name)) {
			return {
				score: AD_CUSTOM_EMOJI_PACK_SCORE,
				reason: '自定义 emoji 出自贴纸包「' + name.slice(0, 40) + '」含招揽词'
			};
		}
	}
	return null;
}

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
	// 形态 E · 金额招揽：简介 + 本条正文合起来看（广告常常一半写简介一半写正文）。
	// 只加分、不定罪 —— 分数自然决定去观察还是封禁，见 AD_MONEY_SOLICIT_SCORE 说明。
	const moneySolicit = scoreAdMoneySolicit([String(profile.bio || ''), String(text || '')].filter(Boolean).join('\n'));
	if (moneySolicit) {
		score += moneySolicit.score;
		reasons.push('+' + moneySolicit.score + ' ' + moneySolicit.reason);
	}
	// 自定义 emoji 的贴纸包名（批次 B-2）。只有闸二调过 getCustomEmojiStickers 才有
	// 这个字段 —— 闸一与 cron 那两轨没有它，下面直接返回 null，零分零 reasons。
	const emojiPack = scoreAdCustomEmojiPacks(profile.customEmojiPacks);
	if (emojiPack) {
		score += emojiPack.score;
		reasons.push('+' + emojiPack.score + ' ' + emojiPack.reason);
	}
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
		domains: extractAdDomains([displayName, profile.bio, text].filter(Boolean).join('\n')),
		// 头像指纹主键（ChatPhoto.big_file_unique_id）。跟到这里是为了让定罪处置
		// 能就地写头像库 —— enforceAdDetection 只拿到 evaluation，没有 profile。
		// 它【不进 domains、不进 semanticText、不进指纹学习】：那是图片标识不是文本，
		// 喂给任何文本判据都会变成噪声。
		avatarId: profile.avatarId || '',
		// 会员标指纹主键（emoji_status_custom_emoji_id）。与 avatarId 完全同职责：
		// enforceAdDetection 只拿到 evaluation、没有 profile，定罪即学习与 /ignore 回滚
		// 都要靠它定位 ad_badges 的行。同样【不进 domains / semanticText / 指纹学习】。
		// 闸一的 cheapProfile 没有这个字段 → 恒为空串 → 走补学队列异步补，
		// 与头像的 immediateAvatar / queueAdAvatarLearning 是同一套分流。
		badgeId: profile.badgeId || '',
		// 手机号（只来自名片消息 message.contact.phone_number）。【已归一成纯数字】。
		// 【它只做指纹复用键，不参与任何评分】主人 2026-10-11 定的口径：
		// 「定罪不看手机号为特征，因为正常用户如果也会发手机号名片就会被误杀，
		//   那么定位是只看手机号+广告，所以广告指纹特征是关键定位，而不是手机号是定位。」
		// 也就是说：号码本身不构成证据，【这个号有广告案底】才构成 ——
		// 所以它进指纹库当主键，命中即杀；而没进过库的号码（正常人发的名片）一分都不加。
		// 非名片消息恒为空串 → matchAdFingerprints 的 phone 分支直接跳过，零开销。
		phone: normalizeAdPhoneNumber(input?.phone || ''),
		// 正文里的自定义贴纸 emoji id 列表（批次 B-2）。与 avatarId 同职责：
		// 定罪即学习与 /ignore 回滚都靠它定位 ad_badges 的行。
		// 【这一项闸一就拿得到】id 在 update 的 entities 里，不依赖 getChat ——
		// 所以闸一定罪时它可以立即学，不像头像那条必须等队列异步补拉。
		customEmojiIds: Array.isArray(profile.customEmojiIds) ? profile.customEmojiIds.slice(0, 20) : [],
		// 正文图片指纹主键（message 里那个媒体的 file_unique_id）。与 avatarId 同一职责：
		// enforceAdDetection 只拿到 evaluation、没有 message，定罪即学习与 /ignore 回滚
		// 都要靠它定位 ad_images 的行。同样【不进 domains / semanticText / 指纹学习】。
		// 没有媒体的调用方（入群线、cron 复查、各种命令路径）不传 media，这里自然是空串，
		// 那几条链路的行为与改动前逐字节一致。
		imageId: String(input?.media?.fileUniqueId || '')
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
	// ===== 资料形状层（零 AI，只加分不定罪）=====
	// 前置条件卡在【资料本身已有可疑分】上：scoreAdProfile 得 0 分说明这份 bio 里
	// 一个广告判据都没有，自然也谈不上「与已知广告模板同形」。把这条卡在前面，
	// 干净资料的普通发言在这里【零 D1 读】—— 热路径「稳定态核心 SQL ≤ 3 条」的
	// 预算断言落点就在这道前置上，别把它挪到没有条件的地方。
	const shapeKey = adProfileShape(profile);
	if (shapeKey && profileResult.score > 0) {
		const shapeRow = await readAdProfileShape(env, shapeKey);
		if (shapeRow && (Number(shapeRow.hits) || 0) >= AD_PROFILE_SHAPE_MIN_HITS) {
			score += AD_PROFILE_SHAPE_SCORE;
			reasons.push('+' + AD_PROFILE_SHAPE_SCORE + ' 资料形状与已知广告模板一致（复用定罪 '
				+ (Number(shapeRow.hits) || 0) + ' 次）');
		}
	}


	let ai = { available: false, similarity: 0, sample: null, isMatch: false, isSoft: false };
	// AI 硬命中是否被豁免词否证。声明在这里而不是 if 块内：下面的 hardHit 汇总点
	// （真正决定 verdict 与 layer 的地方）必须读到它 —— 只在 if 块里判断等于没改，
	// 那里照样会用裸 ai.isMatch 定罪（离线实测踩到过：reasons 写了降级、verdict 仍是 ban）。
	let aiExemptVeto = false;
	// AI 硬命中是否被「昵称剥离复验」否证 —— 与 aiExemptVeto 同理，必须声明在 if 块外，
	// 因为下面的 hardHit / layer 汇总点才是真正决定 verdict 的地方（#1615 已踩过这个坑：
	// 只在 if 块里改 reasons，hardHit 读裸 ai.isMatch，结果 reasons 写了降级、verdict 仍是 ban）。
	let aiNameStripVeto = false;
	let aiNameStripNote = '';
	// 【检测端与学习端共用同一个拼装函数】原来这里手写 join，与 buildAdSampleText 拼法碰巧一致
	// 靠的是两处各自维护 —— 一改就会分叉。2026-09-09 加链接归一化时正式收敛到一处：
	// payload 的 name / bio / text 与 buildAdSampleText 取的三个字段完全对应，
	// 换成函数调用后行为与改动前唯一的差别就是「URL 被换成语义占位符」，
	// 这也正是要的效果 —— 比对时剥链接、学习时也剥链接，两边看到的是同一种文本。
	const semanticText = buildAdSampleText(payload);
	if (config.aiEnabled && semanticText.length >= 6) {
		ai = await checkAdAiSimilarity(env, semanticText, { config });
		// ===== 豁免词否证优先于 AI 硬命中（2026-09-12 线上误封 #1615）=====
		// 线上误封：正常用户简介写「我的频道 https://t.me/xxx 私聊机器人 @xxx_bot」、
		// 正文只发「签到」，得分 -4（豁免词已正确扣 6 分：机器人/bot/私聊 -3、签到 -3），
		// 却因 AI 相似度 0.789 越过阈值 0.78【仅超 0.009】被硬命中定罪，封了 13 个群。
		//
		// 【为什么让豁免词赢】两类证据的性质不同：
		//   · 豁免词是【确定性证据】—— 正文确实含「签到」、简介确实含「机器人」，是事实；
		//   · AI 相似度是【概率性判断】—— 0.789 与 0.78 的差距在噪声范围内。
		// 确定性证据已明确否证时，不该让概率性判断单独推翻它。
		//
		// 【为什么不调阈值】那是按样本调数字，下次来个 0.86 的正常用户又要调一轮 ——
		// 本项目在连带门槛上已经吃过三次这个教训（12 字 → 4 字 → 取消）。
		// 这里改判据：负分意味着豁免词占了上风，此时 AI 硬命中降级为软加分，
		// 让它回到「凑分」赛道而不是「秒杀」赛道。得分 ≥ 0 时 AI 硬命中照旧生效，召回不受影响。
		aiExemptVeto = ai.isMatch && score < 0;

		// ===== 昵称剥离复验（2026-09-22）=====
		// 完整推演见 buildAdSampleTextWithoutName 处的注释。一句话：AI 层定罪前，
		// 先确认这份相似度不是只由昵称这个「与广告话术无关的恒定字段」刷出来的。
		//
		// 【只挂在这一个分支上】ai.isMatch && !aiExemptVeto 是 AI 层唯一会单独定罪的入口。
		// 评分层撞阈值、指纹层命中、四通道结构查杀这三条定罪路径完全不经过这里，
		// 一行都没被碰到 —— 这是「现有功能不受影响」的落点。
		if (ai.isMatch && !aiExemptVeto) {
			const bodyCore = adSampleBodyCoreLength(payload);
			if (bodyCore < AD_SAMPLE_MIN_CORE_LENGTH) {
				// 剥掉昵称就没剩下实质话术 —— 相似度是昵称独占贡献的，不必再跑一次推理。
				// 【这一步不花任何额外开销】checkAdAiSimilarity 对 < 4 字的文本本来就直接返回 0，
				// 提前判断只是顺手省掉一次 D1 往返与一次 Workers AI 调用。
				// 门槛复用 AD_SAMPLE_MIN_CORE_LENGTH 而不另立数字：它表达的正是
				// 「这段文本有没有实质话术」，与入库门槛同一个语义，两处必须同进同退。
				aiNameStripVeto = true;
				aiNameStripNote = '剥离昵称后仅剩 ' + bodyCore + ' 字实质话术（不足 '
					+ AD_SAMPLE_MIN_CORE_LENGTH + ' 字）';
			} else {
				// 还有实质话术 → 老老实实再嵌入一次比对。真广告号走的就是这条路，
				// 而它们的话术本来就在 bio / 正文里，剥掉昵称照样命中，结论不变。
				const recheck = await checkAdAiSimilarity(env, buildAdSampleTextWithoutName(payload), { config });
				if (!recheck.isMatch) {
					aiNameStripVeto = true;
					aiNameStripNote = '剥离昵称后相似度降至 ' + Number(recheck.similarity || 0).toFixed(3)
						+ '（< 阈值 ' + config.aiSimilarityThreshold + '）';
				}
			}
		}

		const exemptVeto = aiExemptVeto || aiNameStripVeto;
		if (ai.isMatch && !exemptVeto) {
			layer = 'ai';
			reasons.push('AI 语义相似度 ' + ai.similarity.toFixed(3) + ' ≥ 阈值 ' + config.aiSimilarityThreshold
				// 形态 E 打开时写明多证依据，/pending 复核能直接看出这次是靠几条样本定的罪
				+ (ai.topK?.enabled
					? '，top-' + ai.topK.k + ' 中 ' + ai.topK.hits + '/' + ai.topK.k + ' 超线'
					: ''));
		} else if (aiExemptVeto) {
			score += AD_AI_SOFT_BONUS_SCORE;
			reasons.push('AI 语义相似度 ' + ai.similarity.toFixed(3) + ' ≥ 阈值 ' + config.aiSimilarityThreshold
				+ '，但豁免词已判负（得分 ' + (score - AD_AI_SOFT_BONUS_SCORE) + '）→ 降级为 +'
				+ AD_AI_SOFT_BONUS_SCORE + ' 软加分，不直接定罪');
		} else if (aiNameStripVeto) {
			// 与豁免词否证走【同一条降级通道】，不是放行 —— 只是把它从「秒杀」赛道
			// 踢回「凑分」赛道。昵称本身确实是广告的号（「【出租账号】收U」这一类）不会因此漏掉：
			// scoreAdProfile 照常给昵称里的广告词计分，四通道的 card / identity 照常盯着昵称，
			// 再加上这 2 分，该撞封禁线的照样撞。被 veto 掉的只有「AI 单独秒杀」这一种最弱形态。
			score += AD_AI_SOFT_BONUS_SCORE;
			reasons.push('AI 语义相似度 ' + ai.similarity.toFixed(3) + ' ≥ 阈值 ' + config.aiSimilarityThreshold
				+ '，但' + aiNameStripNote + '，相似度由昵称贡献 → 降级为 +'
				+ AD_AI_SOFT_BONUS_SCORE + ' 软加分，不直接定罪');
		} else if (ai.topK?.rejected) {
			// 形态 E：max 越线但 top-K 里达标条数不足 → 不定罪，且【必须留痕】。
			// 否则这次 AI 判定完全不可观测：/pending 复核时看不出「AI 判过、够线、但证据不够」，
			// 会误以为 AI 层根本没跑。放在 ai.isSoft 之前 —— 此时 best ≥ 阈值，
			// isSoft 恒为 false，两者不会抢分支。
			reasons.push('AI 语义相似度 ' + ai.similarity.toFixed(3) + ' ≥ 阈值 ' + config.aiSimilarityThreshold
				+ '，但 top-' + ai.topK.k + ' 中仅 ' + ai.topK.hits + '/' + ai.topK.k
				+ ' 超线 → 单证不足，不直接定罪');
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
				// 弱档（形态 B 弱档，guilty=false 但 weak=true）必须一并带出来：
				// 旧写法只在 body.guilty 时取 body，弱档会被 judgeAdQuotedKill 的结果
				// 覆盖，weak 标记与 reasons 就此丢失 —— 上层既看不到也加不上分。
				if (body.guilty || body.weak) structure = body;
				else structure = judgeAdQuotedKill(payload);
				// 引用体查杀被门槛二 / 豁免词放行时留一行记录 —— 主人复核时要能看出
				// 「引用的确实是广告，但本人是在举报」，否则这条放行路径完全不可观测。
				if (!structure.guilty && structure.reasons.length) reasons.push(...structure.reasons);
			}
			// 身份查杀被豁免词放行时也留一行记录 —— 主人复核误封/漏放时要能看出
			// 「命中过、被豁免词赦免了」，否则这条路径完全不可观测。
			if (!structure.guilty && identity.reasons.length) reasons.push(...identity.reasons);
		}
		if (structure.guilty) reasons.push(...structure.reasons);
		// ===== 形态 B 弱档：只加分，不进 hardHit =====
		// reasons 上面已经在 `!guilty && reasons.length` 那一支写进去了（写着
		//「弱命中…只加分不定罪」），这里只补分数本身。
		// 放在结构块内而不是外面：structureKill = 'off' 时整块跳过，弱档也必须
		// 跟着关掉 —— 关掉结构通道却还留一条结构分，是自相矛盾的。
		if (!structure.guilty && structure.weak) {
			score += AD_FORMB_WEAK_SCORE;
			reasons.push('+' + AD_FORMB_WEAK_SCORE + ' 结构弱命中（形态 B 弱档：'
				+ '多个引流出口同现但没有「裸艾特代发」形态，抬分不定罪）');
		}
	}
	const structureBan = structure.guilty && config.structureKill === 'ban';

	// aiHardHit：AI 硬命中，但被豁免词否证时不算 —— 详见上面 aiExemptVeto 处的注释。
	// 【必须在这里生效，不能只改上面那个 reasons 分支】这里才是决定 verdict 与 layer 的地方；
	// 线上误封 #1615 的样本离线实测正是这样：reasons 已写「降级为软加分」，
	// 而 hardHit 读裸 ai.isMatch 照样定罪、layer 照样标 ai。
	const aiHardHit = Boolean(ai.isMatch) && !aiExemptVeto && !aiNameStripVeto;
	const hardHit = fingerprintBan || aiHardHit || structureBan;
	const verdict = (score >= config.scoreThreshold || hardHit)
		? 'ban'
		// observe 模式下的结构命中不封，但必须留观察记录 + 推快照给主人人工过目，
		// 否则这个模式就只是「静默放过」，起不到看误伤面的作用。
		: ((structure.guilty || score >= config.observationScore) ? 'observe' : 'pass');

	return {
		verdict,
		score,
		layer: structureBan ? structure.channel
			// 用 aiHardHit 而非裸 ai.isMatch：被豁免词否证时这次判定并非 AI 定罪，
			// 标成 'ai' 会让复盘时误以为是 AI 层封的。
			: (hardHit ? (aiHardHit ? 'ai' : 'fingerprint')
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
		// 昵称剥离复验是否否决了这次 AI 硬命中。透传给处置端与测试：
		// 处置端据此决定「这条要不要学进样本库」（学习端复检见 enforceAdDetection），
		// 测试据此断言「被拦下的是 AI 秒杀而不是整条判定」。
		aiNameStripVeto,
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
			// 头像指纹主键：跟着快照进 D1，/ignore 回滚时才能找到该清哪一行。
			// 不展示给主人（图片标识对人没意义），纯粹是回滚链路的外键。
			avatarId: String(profile.avatarId || ''),
			// 会员标指纹主键：与 avatarId 同一职责，/ignore 回滚时反查 ad_badges 那一行。
			// 老快照冻结于会员标上线之前 → 空串 → 回滚端自动跳过。
			badgeId: String(profile.badgeId || ''),
			// 正文自定义 emoji id 列表：与 badgeId 同一职责，/ignore 回滚时逐个反查
			// ad_badges。存进快照是因为 enforcement 那侧只拿得到 evaluation。
			customEmojiIds: (Array.isArray(profile.customEmojiIds) ? profile.customEmojiIds : []).slice(0, 20),
			// 正文图片指纹主键：与 avatarId 同一职责，/ignore 回滚时反查 ad_images 那一行。
			// 没有媒体的消息是空串，回滚端读到空串自动跳过 —— 老快照同样如此。
			imageId: String(payload.imageId || ''),
			// 资料形状主键：跟着快照进 D1，/ignore 回滚时直接拿它反查要清哪一行。
			// 【不能让回滚端拿 snapshot.bio 重算】—— bio 在快照里被截到 200 字，
			// 长简介重算出来的形状与判定时那个对不上，会静默清不掉，
			// 表现为「/ignore 说成功了，同模板下一个人照样被加 3 分」。
			profileShape: shapeKey || '',

			// 本次计了分的被挂 handle：定罪时拿它去标记自举案底（confirmAdLinkOnBan），
			// /ignore 时拿它去撤标记（clearAdLinkConfirmedOnIgnore）。老快照没这个字段
			// → 空数组 → 两端循环都不执行，与加它之前逐字节一致。
			scoredLinks: (Array.isArray(profileResult?.scoredLinks) ? profileResult.scoredLinks : []).slice(0, 5),

			forwardTitle: String(input?.forwardChat?.title || '').slice(0, 120)
		}
	};
}

const AD_LAYER_LABELS = {
	score: '结构化评分', fingerprint: '指纹库', ai: 'AI 语义',
	card: '资料卡查杀（用户名+简介）', body: '正文查杀（简介+正文）',
	contact: '名片广告查杀（显示名+手机号）'
};

// 渲染推送给第一主人的判定通知。序号是 /ignore 的唯一入口。
function renderAdDetectionNotice(evaluation, context) {
	const lines = [];
	// 演练命中必须换标题：复用正常回执却挂着「广告号自动封禁」，
	// 主人会以为真封了，转头去群里一看人还在、消息也在。
	if (context?.dryrun) {
		lines.push('<b>🧪 广告号演练命中（未处置）</b>');
		lines.push('演练模式：判定照跑，本群不删不封、不加黑，但当场就学特征（全部配置群通用）');
	} else {
		lines.push('<b>🚫 广告号自动封禁</b>');
	}
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
	// 封禁结果拆三行：成功数 / 失败群（每群一行、只给中文原因）/ 自动学习结果，不再挤成一整行长句。
	if (context?.banResultLine) {
		lines.push('封禁结果：' + escapeHtml(String(context.banResultLine)));
		const failed = Array.isArray(context.failedGroupLines) ? context.failedGroupLines : [];
		failed.forEach((text, idx) => {
			lines.push((idx === 0 ? '失败群：' : '　　　　') + escapeHtml(String(text)));
		});
		if (context.learnLine) lines.push('自动学习：' + escapeHtml(String(context.learnLine)));
	} else if (context?.banSummary) {
		lines.push('封禁结果：' + escapeHtml(String(context.banSummary)));
	}
	if (context?.seq) {
		lines.push('');
		// 判定正确不给出口：指纹与 AI 样本已在 enforceAdDetection 里自动学入，
		// 主人【什么都不用做】。/confirm 已于 2026-09-08 删除。
		lines.push('判定正确：无需任何操作（已自动学入指纹与 AI 样本）');
		lines.push('判定错误并解封：/ignore ' + context.seq);
	}
	return lines.join('\n');
}


// 封禁回执上的两个纠错按钮。与演练那对（dry:ok / dry:no）分工不同：
// 演练那对是【判前拍板】—— 还没封，决定要不要封；这对是【判后纠错】——
// 已经封了，决定撤不撤。回调共用同一套基础设施（answerAdVoteCallback 回执 +
// editTelegramMessage 原地补行），权限也都是仅第一主人。
//
// 两档的分界（照 menshen alert.go 的 adAlertRows）：
//   ↩️ 误判 = 撤判定：解黑 + 全群解封 + 指纹/形状/AI 样本 purge + 清观察 + 删快照，
//              即 /ignore <seq> 的完整 8 项回滚 —— 判据库跟着改，下次不再封同样的号。
//   🔓 解封（判定维持）= 只把人放出来：移除黑名单记录 + 全群解封，指纹、样本、形状、
//              快照、观察一律不动 —— 判定仍是「对的」，只是这次不执行处罚
//              （典型场景：人是广告，但想先留着他配合查上下游）。
//
// 【为什么不直接调 /unban 命令那条路】它有硬闸门「目标仍在 D1 黑名单，已拒绝解封」，
// 而刚被自动封的人【必然】还在黑名单里，直接调等于点了没反应。这里显式传
// allowD1Removal: true 走管理层移除路径（checkManyUnbanEligibility 内部处理），
// 语义与 menshen 的「解封（判定维持）」对齐：动限制、不动账本。
function buildAdNoticeKeyboard(seq, userId) {
	const uid = String(userId || '');
	if (!/^\d+$/.test(uid)) return null;
	const rows = [];
	// 没有 seq 就没有回滚目标（快照没写成），此时只给解封那一档 ——
	// 挂一个点了必报「序号不存在」的按钮，比不挂更让人困惑。
	if (seq) rows.push([{ text: '↩️ 误判（回滚全部）', callback_data: ADFIX_BUTTON_PREFIX + 'ig:' + Number(seq) }]);
	rows.push([{ text: '🔓 解封（判定维持）', callback_data: ADFIX_BUTTON_PREFIX + 'ub:' + uid }]);
	return { inline_keyboard: rows };
}

async function handleAdFixButtonCallback(callbackQuery, env) {
	const data = String(callbackQuery?.data || '');
	const match = data.slice(ADFIX_BUTTON_PREFIX.length).match(/^(ig|ub):(\d+)$/);
	if (!match) {
		await answerAdVoteCallback(callbackQuery?.id);
		return;
	}
	const action = match[1];
	const payload = Number(match[2]);
	const fromId = String(callbackQuery?.from?.id || '');
	if (!isPrimaryOwner(fromId)) {
		await answerAdVoteCallback(callbackQuery?.id, '这两个按钮只有第一主人能点', true);
		return;
	}
	const chatId = String(callbackQuery?.message?.chat?.id || '');
	const messageId = Number(callbackQuery?.message?.message_id) || 0;
	const originText = String(callbackQuery?.message?.text || '');

	if (action === 'ig') {
		// 复用 /ignore 全链路：序号不存在、已复核过这两种情况它自己会回执，
		// 不在这里预判 —— 预判与命令侧的口径迟早分叉，主人会看到两套说法。
		await answerAdVoteCallback(callbackQuery?.id, '已按误判回滚 #' + payload);
		await handleAdIgnoreCommand(env, chatId, fromId, String(payload));
		await editTelegramMessage(chatId, messageId, originText + '\n─────\n↩️ 已按误判回滚　快照 #' + payload
			+ '\n解封 + 指纹/形状/AI 样本修正已执行，明细在上一条消息。');
		return;
	}

	const uid = String(payload);
	const eligibility = await checkManyUnbanEligibility([uid], env, { allowD1Removal: true });
	if (!eligibility.eligible.includes(uid)) {
		const failure = (eligibility.failed || []).find((item) => String(item.id) === uid);
		await answerAdVoteCallback(callbackQuery?.id, failure?.msg || '解封未执行：无法确认 D1 黑名单状态', true);
		return;
	}
	let results = [];
	try {
		results = await unbanUserFromAllGroups(uid);
	} catch (error) {
		console.error('[封禁回执] 解封按钮执行失败:', error);
	}
	const okCount = (results || []).filter((item) => item.ok).length;
	const d1Removed = (eligibility.d1Removed || []).includes(uid);
	await answerAdVoteCallback(callbackQuery?.id, '已解封 ' + uid + '（' + okCount + ' 个群）');
	await editTelegramMessage(chatId, messageId, originText + '\n─────\n🔓 已解封 <code>' + escapeHtml(uid) + '</code>　'
		+ okCount + '/' + (results || []).length + ' 个群' + (d1Removed ? '　D1 记录已移除' : '')
		+ '\n判定维持：指纹、AI 样本、形状、快照一律未动。');
	console.log('[封禁回执] 主人点解封（判定维持）user=' + uid + ' 群=' + okCount + ' d1Removed=' + d1Removed);
}

// 演练命中的私聊通知。与正常封禁回执同一条链路（第一主人私聊），但标题与处置结果
// 必须让人一眼看出【没有真的动手】—— 否则主人会以为广告已经清掉，转头去群里一看还在。
async function pushAdDryRunNotice(env, context) {
	const ownerId = getOwnerNotifyTargets()[0] || '';
	if (!ownerId) return;
	try {
		const evaluation = context?.evaluation || {};
		const notice = renderAdDetectionNotice(evaluation, {
			userId: context?.userId,
			chatTitle: context?.input?.chatTitle || '',
			seq: null,
			dryrun: true,
			banResultLine: '演练命中，处置未执行（不加黑 / 不封禁 / 不删消息），但本次特征已学入判据库'
		});
		const learnedCount = Number(context?.learnedCount) || 0;
		const sampleLearned = context?.sampleLearned === true;
		const learnBits = [];
		if (learnedCount) learnBits.push('指纹 +' + learnedCount + ' 条');
		if (sampleLearned) learnBits.push('AI 样本 +1 条');
		const learnLine = learnBits.length
			? '✅ 已学特征：' + learnBits.join('，') + ' —— 同款【申请进群】即拦'
			: '本次没有学到新特征（指纹与样本都已存在，或载荷里没有可用素材）';
		const tail = [
			'',
			learnLine,
			'本来会执行但没做：加黑 + 全群封禁 + 删消息',
			'流水号：' + (context?.dryRunId ? '#' + context.dryRunId : '（未写入，D1 写失败）'),
			'',
			'<b>你判断这条该不该封？</b>',
			'✅ 确认封 = 当场真处置（特征演练期已学，不会重复学）',
			'❌ 不该封 = 撤销本次学到的特征 + 标为误报',
			'查看本群命中：<code>/adstats</code>　关闭本群演练：<code>/dryrun</code>',
			'⚠️ 演练期间本群完全不设防，广告照发 —— 看完记得关。'
		];
		// 按钮只在流水写成功时挂：没有 id 就没有回调目标，挂了也是死按钮。
		// callback_data 有 64 字节上限，`dry:ok:123` 这种短格式远够。
		const keyboard = context?.dryRunId ? {
			inline_keyboard: [[
				{ text: '✅ 确认封（立即处置）', callback_data: DRYRUN_BUTTON_PREFIX + 'ok:' + context.dryRunId },
				{ text: '❌ 不该封（标为误报）', callback_data: DRYRUN_BUTTON_PREFIX + 'no:' + context.dryRunId }
			]]
		} : null;
		await sendTelegramMessageChunks(ownerId, notice + '\n' + tail.join('\n'), keyboard);
	} catch (error) {
		console.error('[广告检测·演练] 推送通知失败:', error);
	}
}

// 演练的「❌ 不该封」：把这一条演练【已经学进去】的特征撤掉。
//
// 演练一开就学（见 enforceAdDetection 的演练分支），误学的出口必须同时在场 ——
// 否则主人误标一条，同款的正常人之后在【申请进群】那一步就被必封，而他还得逐个
// 找出来用 /ignore 回滚。
//
// 与 /ignore 走【同一批 purge 函数】（purge: true = 主人已明确表态这是误判，当次
// 即删，不再攒 3 次误报）。「❌ 不该封」同样是主人的明确表态，语义应当一致。
//
// 【代价说清楚】purge 是【整条删】而不是「hits 减一」：如果同一个指纹在别处也被
// 正式封禁学过，这一次会把它一并删掉。这与 /ignore 的既有取舍相同 —— 主人随后再
// 封一个同款就会重新学回来。真要精确减一得另写一套计数回退，目前没有这个需求。
//
// 任何一步失败都只影响撤销的完整度，不能影响「标为误报」这个标记本身。
async function revertDryRunLearning(env, evaluation) {
	const payload = evaluation?.payload || {};
	const out = { avatar: null, badge: null, image: null, shape: false, fp: null, sample: null };
	try { out.avatar = await clearAdAvatarOnIgnore(env, payload.avatarId); } catch (_) { /* 撤销失败只记日志 */ }
	try { out.badge = await clearAdBadgeOnIgnore(env, payload.badgeId); } catch (_) { /* 同上 */ }
	// 正文自定义 emoji 逐个撤，跳过与会员标重复的那个 —— 学的时候就是这么跳的，
	// 两端不对称会把会员标误撤掉。
	for (const emojiId of (Array.isArray(payload.customEmojiIds) ? payload.customEmojiIds : [])) {
		if (!emojiId || emojiId === String(payload.badgeId || '')) continue;
		try { await clearAdBadgeOnIgnore(env, emojiId); } catch (_) { /* 同上 */ }
	}
	try { out.image = await clearAdImageOnIgnore(env, payload.imageId); } catch (_) { /* 同上 */ }
	try {
		out.shape = await markAdProfileShapeFalsePositive(env, evaluation?.snapshot?.profileShape, { purge: true });
	} catch (_) { /* 同上 */ }
	try { out.fp = await markAdFingerprintFalsePositive(env, payload, { purge: true }); } catch (_) { /* 同上 */ }
	try { out.sample = await removeAdSampleByText(env, buildAdSampleText(payload)); } catch (_) { /* 同上 */ }
	return out;
}

// 关演练时给一份「这一轮学到什么」的汇总。
//
// 窗口起点取 dryrun_groups.at（开演练那一刻写的 ISO 时间戳）：演练是按群开关的，
// 主人关掉时想看的正是「这一次挂演练攒下了什么」，而不是历史全部。
//
// 数据来自 ad_dryrun_log 的记账列（见 markAdDryRunLearned）：演练当场就学，
// 所以流水里的数字就是真实学到的量，不是「本来会学」。
async function summarizeDryRunLearning(env, chatId, sinceISO) {
	const out = { hits: 0, fingerprints: 0, samples: 0, badges: 0, avatars: 0, images: 0, shapes: 0, links: 0 };
	if (!env?.DB) return out;
	if (!(await ensureAdDryRunLogTable(env))) return out;
	const since = sinceISO ? Math.floor(Date.parse(sinceISO) / 1000) : 0;
	if (!Number.isFinite(since) || since <= 0) return out;
	try {
		const row = await env.DB.prepare(
			'SELECT COUNT(*) AS hits, COALESCE(SUM(learned),0) AS fingerprints,'
			+ ' COALESCE(SUM(sample),0) AS samples, COALESCE(SUM(badges),0) AS badges,'
			+ ' COALESCE(SUM(avatars),0) AS avatars, COALESCE(SUM(images),0) AS images,'
			+ ' COALESCE(SUM(shapes),0) AS shapes, COALESCE(SUM(links),0) AS links'
			+ ' FROM ad_dryrun_log WHERE chat_id = ? AND created_at >= ?'
		).bind(String(chatId), since).first();
		if (row) {
			out.hits = Number(row.hits) || 0;
			out.fingerprints = Number(row.fingerprints) || 0;
			out.samples = Number(row.samples) || 0;
			out.badges = Number(row.badges) || 0;
			out.avatars = Number(row.avatars) || 0;
			out.images = Number(row.images) || 0;
			out.shapes = Number(row.shapes) || 0;
			out.links = Number(row.links) || 0;
		}
	} catch (error) {
		console.error('[演练模式] 汇总学习成果失败:', error);
	}
	return out;
}

// 读这个群开演练的时刻（dryrun_groups.at，ISO 时间戳）。没开或读不到返回空串。
async function readDryRunOpenedAt(env, chatId) {
	if (!env?.DB) return '';
	if (!(await ensureDryRunTable(env))) return '';
	try {
		const row = await env.DB.prepare('SELECT at FROM dryrun_groups WHERE chat_id = ?')
			.bind(String(chatId || '')).first();
		return String(row?.at || '');
	} catch (error) {
		return '';
	}
}

// 把汇总渲染成关演练回执里的几行。0 的项不列，否则每次都是八行零蛋。
function renderDryRunLearnSummary(t) {
	const bits = [];
	if (t.fingerprints) bits.push('指纹 +' + t.fingerprints + ' 条');
	if (t.samples) bits.push('AI 语义样本 +' + t.samples + ' 条');
	if (t.shapes) bits.push('资料形状 +' + t.shapes + ' 条');
	if (t.avatars) bits.push('头像 +' + t.avatars + ' 张');
	if (t.badges) bits.push('会员标/贴纸 +' + t.badges + ' 个');
	if (t.images) bits.push('正文图片 +' + t.images + ' 张');
	if (t.links) bits.push('自举案底 +' + t.links + ' 个');
	if (!bits.length) {
		return '本轮演练没有学到新特征（命中的要么与库中已有判据重复，要么资料里没有可学素材）。';
	}
	return '本轮演练命中 ' + t.hits + ' 条，学到：\n  ' + bits.join('　')
		+ '\n这些判据【全部配置群通用】，广告号在申请进群那一步就会被拦下。';
}

// 演练通知上的两个结论按钮。只有第一主人能点 —— 一个会真的封人、一个往统计里
// 写结论，与 /ignore 同一档权限。
async function handleDryRunButtonCallback(callbackQuery, env) {
	const data = String(callbackQuery?.data || '');
	const match = data.slice(DRYRUN_BUTTON_PREFIX.length).match(/^(ok|no):(\d+)$/);
	if (!match) {
		await answerAdVoteCallback(callbackQuery?.id);
		return;
	}
	const action = match[1];
	const rowId = Number(match[2]);
	const fromId = String(callbackQuery?.from?.id || '');
	if (!isPrimaryOwner(fromId)) {
		await answerAdVoteCallback(callbackQuery?.id, '这两个按钮只有第一主人能点', true);
		return;
	}

	const row = await readAdDryRunRow(env, rowId);
	if (!row) {
		await answerAdVoteCallback(callbackQuery?.id, '这条流水不存在或已清理', true);
		return;
	}
	if (Number(row.fp) === 1 || Number(row.done) === 1) {
		await answerAdVoteCallback(callbackQuery?.id, '这条已经处理过了', true);
		return;
	}

	const chatId = String(callbackQuery?.message?.chat?.id || '');
	const messageId = Number(callbackQuery?.message?.message_id) || 0;
	const originText = String(callbackQuery?.message?.text || '');

	// 两个分支都要用这份判定：❌ 撤销演练期学到的特征、✅ 原样交回处置链。
	let evaluation = null;
	try { evaluation = JSON.parse(String(row.evaluation || '{}')); } catch (_) { evaluation = null; }

	if (action === 'no') {
		// 误报：标记统计 + 【撤销演练期已经学进去的特征】。
		// 演练一开就学（见 enforceAdDetection 的演练分支），所以撤销的出口必须同时在场，
		// 否则主人误标一条，同款的正常人之后在申请进群那一步就被必封。
		const marked = await markAdDryRunVerdict(env, rowId, 'fp');
		if (!marked.ok) {
			await answerAdVoteCallback(callbackQuery?.id, '标记失败：' + (marked.reason || '未知'), true);
			return;
		}
		if (evaluation && typeof evaluation === 'object' && Array.isArray(evaluation.reasons)) {
			try {
				await revertDryRunLearning(env, evaluation);
			} catch (error) {
				// 撤销不完整只影响这一条，标记本身已经落库 —— 回执照实说。
				console.error('[演练模式] 撤销学到的特征失败:', error);
			}
		}
		await answerAdVoteCallback(callbackQuery?.id, '已标为误报，并撤销本次学到的特征');
		const fpLine = [
			'─────',
			'❌ 已标为误报　流水 #' + rowId + '　得分 ' + (Number(row.score) || 0) + '/' + (Number(row.threshold) || 0),
			'已撤销本次演练学到的特征（指纹 / 资料形状 / 头像 / 会员标 / 正文图片 / AI 样本）。',
			'只计入 /adstats 的演练统计。看统计：/adstats'
		];
		await editTelegramMessage(chatId, messageId, originText + '\n' + fpLine.join('\n'));
		return;
	}

	// 确认封：把流水里存的整份判定原样交回处置链，force 绕过演练短路。
	if (!evaluation || typeof evaluation !== 'object' || !Array.isArray(evaluation.reasons)) {
		await answerAdVoteCallback(callbackQuery?.id, '流水里没有可用的判定数据，无法处置', true);
		return;
	}

	const config = loadAdDetectionConfig(env);
	const whitelist = await loadAdDomainWhitelist(env);
	// 演练期已经学过的特征不再学第二次：hits 是 +1 语义，确认封那一次再学一遍会让
	// 头像与资料形状各 +1，直接顶到封禁档（AD_PROFILE_SHAPE_MIN_HITS=2、头像 hits>=2），
	// 等于主人点一次按钮就把安全阀拱开。记账见 markAdDryRunLearned。
	const alreadyLearned = Number(row.learned) > 0 || Number(row.sample) === 1;
	let result = null;
	try {
		result = await enforceAdDetection(env, {
			userId: String(row.user_id),
			chatId: String(row.chat_id),
			chatTitle: String(callbackQuery?.message?.chat?.title || ''),
			messageId: null
		}, Object.assign({}, evaluation, { verdict: 'ban' }), {
			config, whitelist, force: true, skipLearning: alreadyLearned
		});
	} catch (error) {
		console.error('[演练模式] 确认封执行失败:', error);
	}
	if (!result || result.banned !== true) {
		await answerAdVoteCallback(callbackQuery?.id, '处置未完成：' + (result?.reason || '见日志'), true);
		return;
	}
	const marked = await markAdDryRunVerdict(env, rowId, 'done');
	await answerAdVoteCallback(callbackQuery?.id, '已按广告处置 ' + String(row.user_id));
	const okLine = [
		'─────',
		'✅ 已确认封禁　流水 #' + rowId + '　' + (result.banSummary || '已处置'),
		'加黑 + 全群封禁 + 学指纹与 AI 样本已执行。',
		'判错了仍可 /unban ' + String(row.user_id) + ' 一键回滚'
	];
	await editTelegramMessage(chatId, messageId, originText + '\n' + okLine.join('\n'));
	console.log('[演练模式] 主人确认封 user=' + row.user_id + ' 流水=#' + rowId + ' marked=' + marked.ok);
}

// 回执里给结论落款用的时间行（私聊通知已经过了发送时刻，落款要重新取）。
function nowStampLine() {
	return new Date().toLocaleString('zh-CN', { hour12: false });
}
// ===== 定罪即学习：把这次定罪的特征学进判据库 =====
//
// 两个调用点，判据必须同一份（否则一改就分叉）：
//   ① 正式处置（enforceAdDetection 主流程）
//   ② 演练模式 —— 主人的口径是「演练就是为了学习」：演练期学到的特征立刻在
//      【申请进群】那一步生效，等关掉演练时判据库已经攒够了，同款再来直接拦。
//
// 撤销出口在 /ignore（markAdFingerprintFalsePositive / markAdProfileShapeFalsePositive /
// clearAd*OnIgnore / removeAdSampleByText），演练的「❌ 不该封」走同一批函数。
//
// 顺序：原来是「学头像那批 → 统计封禁结果 → 学指纹+样本」，抽函数后合并成一次。
// 两批之间没有依赖（都是独立的 D1 写入，统计读的是 banResults 不是学习结果），
// 且 learned / sampleAdded 只在后面的通知与返回值里用到 —— 合并后仍然先算后用。
async function learnAdFeaturesOnVerdict(env, evaluation, options = {}) {
	const userId = String(options.userId || '');
	let learned = 0;
	let sampleAdded = false;
	// 各类计数：关演练时要给一份「这一轮学到什么」的汇总，光靠 learned/sample
	// 两列说不清七类分别学了多少。布尔型学习函数成功记 1；
	// confirmAdLinkOnBan 返回的就是本次盖章的 handle 数，直接累加。
	let badges = 0, avatars = 0, images = 0, shapes = 0, links = 0;

	// ===== 自举案底：这次定罪把哪几个被挂 handle 坐实了 =====
	//
	// 【为什么要挪进学习函数】它与头像 / 指纹 / 资料形状那批一样是【判据学习】，
	// 而不是「处置动作」。原先它单独挂在 enforceAdDetection 里、位置在演练分支之后，
	// 注释写的理由是「演练的定义是一个动作都不做，给广告位盖章同样是动作」——
	// 那是演练还不学的时候的口径。现在演练当场就学（主人口径：「演练就是为了
	// 学习」「要的就是全学」），它必须跟着一起学，否则演练期封一批挂同款频道的
	// 号，那个频道不会被标成案底，下一个人挂它还是只按普通链接算分。
	//
	// 只标 snapshot.scoredLinks 里【本次真的加过分】的 handle：挂了个正常频道的
	// 广告号被封时，那个正常频道一个分都没加，绝不能被盖成广告位，否则连坐所有
	// 挂它的人 —— 这正是会员标那次误封的同一类连坐。这条保护在 confirmAdLinkOnBan
	// 内部，演练期调它同样受保护，风险与正式处置一致。
	try {
		links += Number(await confirmAdLinkOnBan(env, evaluation)) || 0;
	} catch (error) {
		// 案底记不上只意味着下次少一条 +3，不能因此让整次学习判失败。
		console.error('[广告检测·链接] 案底标记异常:', error?.message || error);
	}

	// 定罪即学习头像：广告团队批量复用同一批素材头像，一次定罪就把这张图挂上黑名单，
	// 之后用同一张头像进群的号在【入群那一步】就能被拦住（applyAvatarVerdict 分档）。
	//
	// 【为什么只排队、不在这里拉资料】闸一（零成本判定）封禁时 profile.avatarId 恒为空 ——
	// 那条路径压根不调 getChat，而它恰恰是最常见的封禁路径。三条既有断言
	// （test_ad_detection ×2、test_ad_name_strip ×1）守的正是「闸一定罪零 getChat」，
	// 在这里补一次 fetchAdUserProfile 会让它们全红 —— 那不是断言过时，而是热路径成本
	// 真的涨了。所以改成写一个待学队列，由 cron 轨异步补拉：热路径只多一次 D1 写，
	// Telegram 请求一次不加，闸一保持零成本。
	try {
		// 判定载荷里已经带着头像（闸二 / 入群筛查 / cron 复查定罪的都拉过 getChat）
		// → 立即学，不排队。只有闸一那条零成本路径的 avatarId 为空，才走队列异步补。
		const immediateAvatar = String(evaluation?.payload?.avatarId || '');
		const immediateBadge = String(evaluation?.payload?.badgeId || '');
		const immediateEmojiIds = Array.isArray(evaluation?.payload?.customEmojiIds)
			? evaluation.payload.customEmojiIds : [];
		// 正文自定义 emoji：id 在 update 的 entities 里现成，闸一就拿得到 ——
		// 所以【永远立即学】，不必像头像那样等补学队列去补 getChat。
		// 跳过与会员标重复的那个 id：hits 是 +1 语义，重复学会把安全阀提前拱开。
		for (const emojiId of immediateEmojiIds) {
			if (!emojiId || emojiId === immediateBadge) continue;
			if (await learnAdBadgeOnBan(env, emojiId, userId)) badges += 1;
		}
		if (immediateAvatar) {
			if (await learnAdAvatarOnBan(env, immediateAvatar, userId)) avatars += 1;
			// 会员标跟着同一条路径学：两者都来自同一份 getChat 响应，
			// 要么一起有（闸二 / 入群 / cron 定罪）要么一起空（闸一定罪）。
			// 【刻意嵌在 if 里】否则「avatar 空 + badge 有」会既立即学一次、
			// 又进队列被 worker 学第二次 —— hits 是 +1 语义，重复就虚高，
			// 会把 AD_BADGE_BAN_HITS 的安全阀提前拱开。
			if (immediateBadge && await learnAdBadgeOnBan(env, immediateBadge, userId)) badges += 1;
		} else if (await queueAdAvatarLearning(env, userId)) {
			// 进补学队列：cron 轨才真正学，这里只记「排上了」—— 汇总里要写明白
			// 否则主人看到 avatars=0 会以为头像白学了。
			avatars += 1;
		}
	} catch (_) { /* 头像学习失败不影响本次处置 */ }
	// 定罪即学习正文图片：与头像同一逻辑（引流素材是批量复用的，学一次拦住同款）。
	// 【为什么不需要头像那套补学队列】头像要等 getChat 才拿得到，而闸一压根不调它，
	// 所以那条路径 avatarId 恒为空、只能排队异步补；媒体却是 update 自带的字段，
	// 闸一就取得到 —— payload.imageId 在闸一定罪时已经非空，没有「恒为空」这个缺口。
	try {
		const learnedImageId = String(evaluation?.payload?.imageId || '');
		if (learnedImageId && await learnAdImageOnBan(env, learnedImageId, userId)) images += 1;
	} catch (_) { /* 图片学习失败不影响本次处置 */ }
	// 定罪即学习资料形状：资料模板是批量号的【公开复用资产】，学一次之后同模板的号
	// 在零 AI 下就能命中（只加分，仍要过原有阈值）。取 snapshot 里存好的形状，
	// 不在这里重算 —— 重算要拿完整 bio，而处置端只拿到 evaluation。
	try {
		if (await learnAdProfileShape(env, evaluation?.snapshot?.profileShape || '',
			String(evaluation?.snapshot?.bio || ''))) shapes += 1;
	} catch (_) { /* 形状学习失败不影响本次处置 */ }

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
	try {
		// options.sampleText 让调用方覆盖取材口径。目前唯一的覆盖方是 /spam 的回复学习：
		// 那条路径碰到「本人正文一个字母 + 广告全在引用块里」时会拿引用体当样本，
		// 比这里默认的 name + bio + text 准得多。有覆盖就用覆盖，避免同一次处置写两条样本
		// （其中一条还是「英文人名 + 单字母」那种纯噪声）。
		const sampleOverridden = options.sampleText != null;
		const sampleText = sampleOverridden
			? String(options.sampleText).trim()
			: buildAdSampleText(evaluation.payload);
		// ===== 剥昵称复检：断掉「误封 → 学样本 → 下次更容易误封」的闭环（2026-09-22）=====
		//
		// 这是 @svipultra 连环误封的第 ④ 环，也是让相似度单调爬升的那一环：
		// 每误封一次就把「Angel ×××」学进样本库，下次他说任何话，昵称都跟库里的样本重合，
		// 相似度必然更高 —— 0.794 → 0.798 → 0.811 → 0.815 → 0.828，五次封禁一次比一次稳。
		// 检测端的昵称剥离复验（见 evaluateAdSuspect）已经拦住了这类定罪，但那只挡住了「入口」；
		// 样本仍可能从别的定罪层（评分层撞阈值、结构查杀）流进来，所以出口也必须堵。
		// 两端共用 adSampleBodyCoreLength，保证判据永不分叉。
		//
		// 【存进去的仍是完整文本，拼法一个字都没动】收紧的只是「准不准进」这道闸 ——
		// buildAdSampleText 照旧返回 name + bio + text，adTextHash 因此完全不变，
		// 全库存量样本与历史 /ignore、/unban 的双 hash 试删【全部继续有效】。
		//
		// 【/spam 回复学习不受此闸约束】options.sampleText 覆盖时取材的是引用体正文，
		// 那段文本本来就不含昵称，再套一次剥昵称检查等于凭空多一道无关门槛。
		const sampleSubstantial = sampleOverridden
			|| adSampleBodyCoreLength(evaluation.payload) >= AD_SAMPLE_MIN_CORE_LENGTH;
		// 长度门槛与 addAdSample 内部一致（< 4 字符直接拒），这里先判一次是为了少一次 D1 往返。
		// 引用体形态的号（本人正文只有一个字母）在这里拼出来的通常只有昵称，
		// 短到 4 字符以下就跳过 —— 那种样本语义太稀薄，进库只会拉高误判面。
		if (sampleText.length >= 4 && sampleSubstantial) {
			const sample = await addAdSample(env, sampleText, { source: String(options.sampleSource || 'auto') });
			sampleAdded = Boolean(sample?.ok && sample?.added);
		}
	} catch (error) {
		console.error('[广告检测] 自动学习语义样本失败:', error);
	}

	return { learned, sampleAdded, badges, avatars, images, shapes, links };
}

// === 处置执行 ===
// 判定为广告后的统一处置链：加黑 → 全群封禁 → 删触发消息 → 自动学指纹 → 存快照 → 推私聊 → 清观察记录。
// 每一步独立容错：加黑失败仍继续封禁，封禁部分失败仍推送通知，
// 保证主人一定能看到现场快照并可用 /ignore <序号> 一键回滚。
async function enforceAdDetection(env, input, evaluation, options = {}) {
	const userId = String(input?.userId ?? '');
	const chatId = input?.chatId != null ? String(input.chatId) : '';
	if (!userId) return { banned: false, seq: null, reason: 'no_user' };

	// ===== 演练模式：命中记流水 + 学特征 + 推私聊，处置一个都不做 =====
	//
	// 【必须插在这个位置】在 noteParts、加黑、全群封禁、删消息、/ignore 快照之前 ——
	// 演练的定义就是这些动作一个都不做，挪到后面就晚了。
	//
	// 【但学习【照做】】主人口径：「演练就是为了学习」「只有演练学习的特征多、搭配多
	// 特征封禁，广告号命中率才会更高，特征学习才会更快更精准」。学到的头像 / 会员标 /
	// 资料形状 / 正文图片 / 指纹 / AI 样本立刻在【申请进群】那一步生效（screenJoinRequestAd
	// 与入群筛查读的是同一批表），等主人关掉演练时判据库已经攒够了。
	// 误学有出口：点「❌ 不该封」会把这一条学到的特征撤掉，见 revertDryRunLearning。
	//
	// 【chatId 为空不演练】演练开关是按群开的，chatId 空说明这次处置没有可归属的群，
	// 查不出属于哪个群就不该猜，按正常处置继续。
	//
	// 【读开关失败也不演练】见 isDryRunGroup：一次 D1 抖动不能把整个群静默变成不设防。
	// options.force：主人在演练通知上点「✅ 确认封」时用 —— 那一刻他已经在
	// 看完完整判据后拍过板，不能再被演练开关挡回来（否则按钮点了没反应）。
	if (!options.force && chatId && (await isDryRunGroup(env, chatId))) {
		let dryRunId = null;
		try {
			dryRunId = await recordAdDryRun(env, { userId, chatId, evaluation, input });
		} catch (error) {
			console.error('[广告检测·演练] 记录流水失败:', error);
		}
		// 演练只挡处置，不挡「同款」触发：先把这条文案记进重发只删名单。
		// 演练不删消息，广告正文还留在群里，bot / 带引用体重发同一段时必须照样删得掉 ——
		// 否则演练一开，主人连「这条广告被重发了几次」都观察不到。
		// 【刻意只写这一份】ad_spam_texts（同款直封）命中会真加黑 + 全群封禁，
		// 演练群里写了它，下一个人直发同款就被真封，演练就不成其为演练了。
		try {
			await recordHandledAdText(env, evaluation?.payload?.text || evaluation?.snapshot?.text || '');
		} catch (_) {
			// 记录失败只影响后续重发能否被删，不影响这次演练流水与通知。
		}
		// 学特征（演练的核心目的）。与正式处置共用 learnAdFeaturesOnVerdict，
		// 判据不另写一套。学完把七类结果一并写进流水：确认封时据此跳过重复学习，
		// 关演练时据此出汇总回执。
		let tally = { learned: 0, sampleAdded: false, badges: 0, avatars: 0, images: 0, shapes: 0, links: 0 };
		try {
			tally = await learnAdFeaturesOnVerdict(env, evaluation, {
				userId,
				whitelist: options.whitelist
			});
		} catch (error) {
			console.error('[广告检测·演练] 特征学习失败:', error);
		}
		const learnedCount = Number(tally.learned) || 0;
		const sampleLearned = Boolean(tally.sampleAdded);
		if (dryRunId) {
			try {
				await markAdDryRunLearned(env, dryRunId, tally);
			} catch (error) {
				// 写不进去只意味着「确认封时会再学一次」，不影响本次演练。
				console.error('[广告检测·演练] 记录学习结果失败:', error);
			}
		}
		await pushAdDryRunNotice(env, {
			userId, chatId, evaluation, input, dryRunId,
			learnedCount, sampleLearned
		});
		console.log('[广告检测·演练] 命中未处置 user=' + userId + ' chat=' + chatId
			+ ' score=' + evaluation?.score + '/' + evaluation?.threshold
			+ ' layer=' + evaluation?.layer + ' 流水=' + dryRunId
			+ ' 指纹=' + learnedCount + ' 样本=' + (sampleLearned ? 1 : 0)
			+ ' 形状=' + tally.shapes + ' 头像=' + tally.avatars
			+ ' 会员标=' + tally.badges + ' 图片=' + tally.images + ' 案底=' + tally.links);
		// 返回结构刻意对齐正常处置，只是 banned=false、seq=null：
		// cron 那条调用点读的是 result?.banned !== false，会正确记成「未封」；
		// banSummary 给非空值是让 /spam 那条群内闪屏读到时能显示演练字样而不是「未知」。
		return {
			banned: false,
			dryrun: true,
			seq: null,
			dryRunId,
			blacklistCode: null,
			banSummary: '演练命中（已学特征，未处置）',
			learned: learnedCount,
			sampleAdded: sampleLearned
		};
	}

	// ===== 自举案底：这次定罪把哪几个被挂 handle 坐实了 =====
	// 已并入 learnAdFeaturesOnVerdict：它与头像 / 指纹 / 资料形状那批一样是【判据
	// 学习】，正式处置与演练两条路共用一份，见该函数里这段的说明。

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
		banResults = await banUserFromAllGroups(userId, {
			// 入群路径会传 primaryGroupId：事发群【同步】先封，其余群并发补上。
			// 改动前是 for 串行遍历全部群，每个群 2 次 HTTP（探测 + 封禁）依次排队 ——
			// 20 个群就是 40 次串行往返，人进群后要好几秒才被请出去。见 banUserFromAllGroups。
			// 其余 6 个调用点不传，走「全部群一起并发」，与改动前只有并发度的差别。
			primaryGroupId: options.primaryGroupId,
			// 默认仍探测（`!== false`：不传 = true，逐字节等于改动前的硬编码 true）。
			// /ban、/spam、批量那些回执靠 memberProbe 渲染「昵称 + 状态」，砍掉会让回执
			// 从「昵称 + TGID」退化成只剩一串 TGID。入群路径显式传 false：人刚进群状态
			// 必然是 member，这一次 getChatMember 纯属浪费（与 screenAdJoinMember 里
			// 「不查 getChatMember」那条注释同一取向）。
			probeMembership: options.probeMembership !== false,
			revokeMessages: true
		});
	} catch (error) {
		console.error('[广告检测] 全群封禁失败:', error);
	}

	// 记下这次处置的广告文案，供【重发删除通道】比对。
	// 记的是判定载荷里的正文（evaluation.payload.text），不是昵称或简介 ——
	// 重发者贴的正是这段正文，而昵称/简介是它自己的，对不上。
	try {
		await recordHandledAdText(env, evaluation?.payload?.text || evaluation?.snapshot?.text || '');
	} catch (_) { /* 记录失败不影响本次处置 */ }
	// 定罪即学习：头像 / 会员标 / 正文 emoji / 正文图片 / 资料形状 / 指纹 / AI 样本。
	// 与演练模式共用同一个函数 —— 判据一旦分叉，「演练学到的」和「正式学到的」就会
	// 随时间漂移，主人会看到同一批号在两条路上判据不同。见 learnAdFeaturesOnVerdict。
	//
	// skipLearning：演练期已经学过、主人这时才点「✅ 确认封」。hits 是 +1 语义，
	// 确认封那一次再学一遍会让头像与资料形状各 +1，直接顶到封禁档
	// （AD_PROFILE_SHAPE_MIN_HITS=2、头像 hits>=2），把安全阀提前拱开。
	let learned = 0;
	let sampleAdded = false;
	if (options.skipLearning !== true) {
		({ learned, sampleAdded } = await learnAdFeaturesOnVerdict(env, evaluation, {
			userId,
			whitelist: options.whitelist,
			sampleText: options.sampleText,
			sampleSource: options.sampleSource
		}));
	}

	const okCount = banResults.filter((r) => r.ok).length;
	const failedBans = banResults.filter((r) => !r.ok);
	// 风控·处置：按实际封成功的群逐群 +1（面板「本群挡下 N 次」的唯一数据来源）。
	// 放在这里而不是黑名单写入之后 —— 加黑可能因已存在而没写成，但封禁成功了就是挡下了。
	await recordDisposalsFromBanResults(env, banResults);
	const banResultLine = okCount + '/' + banResults.length + ' 个群成功';
	// 失败原因只给中文（英文原文由翻译兜底写入 Worker 日志）；最多列 3 个群，其余汇总成一句。
	const failedGroupLines = failedBans.slice(0, 3)
		.map((r) => r.groupId + '（' + toChineseErrorText(r.error || '未知') + '）');
	if (failedBans.length > 3) failedGroupLines.push('等共 ' + failedBans.length + ' 个群失败');
	// banSummary 仍是单行字符串：/learnlast 回执与日志沿用它，只是失败原因换成了中文。
	let banSummary = banResultLine;
	if (failedGroupLines.length) banSummary += '；失败群：' + failedGroupLines.join('、');

	// 触发消息再单独删一次：revoke_messages 只对该群自己生效，服务消息也偶发残留。
	if (chatId && input?.messageId) {
		try {
			await deleteMessage(chatId, input.messageId);
		} catch (error) {
			console.error('[广告检测] 删除触发消息失败:', error);
		}
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
		const learnParts = [];
		if (learned) learnParts.push('指纹 +' + learned + ' 条');
		if (sampleAdded) learnParts.push('AI 样本 +1 条');
		// 演练期已经学过就不重复学（见 skipLearning）：回执照实说，
		// 别让主人以为这次确认封又学了一遍。
		if (!learned && !sampleAdded && options.skipLearning === true) {
			learnParts.push('特征已在演练期学入，未重复学习');
		}
		const notice = renderAdDetectionNotice(evaluation, {
			userId,
			chatTitle: input?.chatTitle || '',
			seq,
			banResultLine,
			failedGroupLines,
			learnLine: learnParts.join('，')
		});
		try {
			// 回执底部挂两档纠错按钮：主人不用手打 /ignore <序号>（他手上未必有那个号），
			// 也不用去查 /unban 的黑名单硬闸门 —— 看完判据当场就能点。见 buildAdNoticeKeyboard。
			await sendTelegramMessageChunks(ownerId, notice, buildAdNoticeKeyboard(seq, userId));
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
	if (isAdDetectionExemptUser(userId)) return 'skipped';		// 主人 / 副主人 / 超管豁免
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
		// 申请进群那条路传 noBioLock，不受这把三天冷却锁约束：广告号被拒后等三天
		// 再申请就绕过去了，而申请阶段正是「还没让他进门就拦住」的唯一机会。
		// 其余两条入群路径照旧走锁（同一次进群会推两种 update，靠它去重）。
		if (!options.noBioLock && !shouldCheckAdBio(existing, nowSeconds)) return 'cooled';

		const profile = await fetchAdUserProfile(userId, member);
		// 不查 getChatMember：restricted 已归零不计分，入群时状态必然是 member，
		// 拉一次纯属浪费配额。留空后通知文案会显示「未查询」。
		profile.status = '';
		await markAdBioChecked(env, userId, nowSeconds);

		// config / whitelist 必须先于链接解析拿到：前置分档要用同一份白名单算资料卡分，
		// 与下面 evaluateAdSuspect 里那次保持同源。两行都是幂等读取，提前不改语义。
		const config = options.config || loadAdDetectionConfig(env);
		const whitelist = options.whitelist || await loadAdDomainWhitelist(env);

		// ===== 解析资料里挂的频道 / 群 / bot（对齐 menshen resolveLink）=====
		// 放在这里的理由：入群是「一次定终身」的事件，前面还有三天冷却锁兜着，
		// 多花的 0~5 个 getChat 摊到每个人一生只有一次；而进群那一刻正是 menshen
		// 冷判定（coldjudge）跑链接解析的同一条时机 —— 你要的「进群直接拦」靠它。
		// 形态闸在 extractAdProfileHandles：bio 里没有 @xxx / t.me/xxx 就一个请求都不发。
		// 【先判人，再查链接】2026-10-07 主人要的前置判定：资料卡与正文净分都不到 1 分的
		// 正常人直接返回空数组，一个 getChat 都不花 —— 形态闸管「有没有链接可查」，
		// 这道管「值不值得为他查」，两道各管一半。
		profile.adLinks = await resolveAdProfileLinksElevated(env, profile, { whitelist });

		// ===== 入群专用封禁线 =====
		// 见 DEFAULT_AD_JOIN_SCORE_THRESHOLD 的说明：进群那一刻只有资料卡一份证据，
		// 发消息那条路有正文 / 上下文 / 转发 / 历史累积多份 —— 证据少却用同一条线裁决，
		// 等于对刚进门的人从严。所以入群单开一条更高的线，没到线就按现状转观察、不拦。
		//
		// 取 max 是防线：配置项写得比消息线还低时，不能让「进群」反而比「发言」更容易被封。
		//
		// 只覆盖 scoreThreshold —— 指纹硬命中、AI 硬命中、四通道结构查杀、头像定罪
		// 在 evaluateAdSuspect 里都与 scoreThreshold 无关（`score >= threshold || hardHit`），
		// 强证据照旧直接拦。这与 menshen「规则门与形状命中排在采信线之前、零 AI 直接处置」
		// 是同一个取向：门槛收紧的只是「凭一份资料卡凑够分数就封」这一条路。
		const joinScore = Math.max(Number(config.joinScoreThreshold) || 0, Number(config.scoreThreshold) || 0)
			|| Number(config.scoreThreshold);
		const joinConfig = joinScore === config.scoreThreshold
			? config
			: Object.assign({}, config, { scoreThreshold: joinScore });

		const baseEvaluation = await evaluateAdSuspect(
			env,
			{ profile, text: '', forwardChat: null },
			// getChat 失败时不能扣「无 Bio」那一分 —— 那是「查到了、确实是空」才成立的判据。
			{ config: joinConfig, whitelist, skipMissingBioPenalty: profile.bioFetched !== true }
		);
		// 入群即判头像：这是「广告号还没发广告就被拦住」的主通道，
		// 头像指纹命中时即便正文干净也能进判据（分档见 applyAvatarVerdict）。
		// 头像与其它强证据一样不走入群线，仍按原样定罪。
		const avatarEvaluation = await applyAvatarToEvaluation(env, baseEvaluation, profile);
		// 同款会员标同位叠加：走到这里已经为这次判定花过 getChat 了，
		// 会员标就在那一份响应里，查一次库即可，零额外 Telegram 请求。
		let evaluation = await applyBadgeToEvaluation(env, avatarEvaluation, profile);
		// ===== 第四路补位：前三层都没定罪时交给生成式模型 =====
		// 入群时正文为空（他还没发过言），载荷里 message 就是空串 —— 提示词
		// 明写「message 为空不构成怀疑理由」，所以这一路在这里判的纯粹是资料卡。
		evaluation = await applyAdLLMToEvaluation(env, evaluation, config, { profile, text: '' }, { pool: 'join' });

		// ===== 入群检查流水：任何 verdict 都记 =====
		// 只记命中的话，看板上对绝大多数新成员是一片空白，管理员分不清
		//「检查过、这个人正常」和「压根没看过他」—— 而后者正是漏放最典型的形态。
		// 失败不影响入群筛查的返回值：流水只是看板数据。
		try {
			await recordAdJoinCheck(env, { userId, chatId, evaluation });
		} catch (error) {
			console.error('[入群检查] 记录流水失败:', error);
		}

		if (evaluation.verdict === 'ban') {
			// 任意配置群的群主/管理员全群豁免（当前群入口处已查过）。
			if (await isAdminInAnyConfiguredGroup(userId, chatId)) {
				console.log('[广告检测] 入群筛查 user=' + userId + ' 是其他配置群的管理员，豁免不封');
				return 'skipped';
			}
			const result = await enforceAdDetection(env, {
				userId,
				chatId,
				chatTitle: options.chatTitle || '',
				messageId: options.messageId ?? null
			}, evaluation, {
				config,
				whitelist,
				// 【入群秒封的两条提速】
				// ① primaryGroupId：他刚进的这个群同步先封（1 次 banChatMember 就把人
				//    请出去），其余群并发补上。改动前是 for 串行遍历全部群，每群还多一次
				//    成员探测，20 个群 = 40 次串行往返 —— 人进群后要好几秒才被踢。
				// ② probeMembership: false：人刚进群状态必然是 member，那次 getChatMember
				//    换不来任何信息，入群回执也不展示 memberProbe（见 renderAdDetectionNotice）。
				primaryGroupId: chatId,
				probeMembership: false
			});
			// 风控·新人治理（方案 b 精确计数）：只统计【入群筛查当场处置】的新人，
			// 口径严格等于「新人被处理数」—— 不含老成员被违规踢出（那是 kicked_count 的事）。
			// 上面管理员豁免的分支已经 return，走不到这里，不会把豁免记成治理。
			// disposal 这一格已由 enforceAdDetection 按封禁结果记过，这里只补 newcomer，不重复计。
			// 演练命中不记 newcomer：风控这一格的口径是【真被处置过的新人】，
			// 演练一个都没动，记进去会让面板的治理数据虚高。
			if (result?.dryrun) return 'dryrun';
			await recordStatAction(env, chatId, 'newcomer');
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
// 返回 true 表示已处置（调用方应立即 return）；'observe' 表示转入观察（调用方继续走后续逻辑，
// 但不把这条正文写进 moderation_messages —— 那是 /search 的检索源）；false 表示放行。
async function detectAdOnMessage(message, env) {
	if (!env?.DB) return false;
	const chat = message?.chat;
	const from = message?.from;
	if (!chat || !from) return false;
	// 【2026-09-21 bot 消息不再整体免检】原来这里是 `from.is_bot` 直接 return false，
	// 于是【任何 bot 发的消息都不进广告检测】。线上被这样利用：
	// 广告号艾特若干 @xxxbot 后自行删除原消息，那些 bot 并不在群里，
	// 而是由一个常驻 bot 账号把广告正文带引用重新发出来（引用的还是主人自己的
	// /ban / /spam 命令消息）—— 主人处置一次，广告就被重发一次，且重发的那条一律免检。
	// 现在只豁免三类（自己 / 匿名管理员 / 白名单协作 bot），其余 bot 走完整检测。
	// 换 handle 无效：判据是 analyzeAdOutlets 的「多个 bot 结尾 handle 同现」等结构特征，
	// 不依赖任何具体 handle 名单（快照 #1961 正是靠「引流出口×3(含bot)」命中的）。
	if (isAdExemptBot(from)) return false;
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
	if (isAdDetectionExemptUser(userId)) return false;

	// checklist 消息的 text / caption 恒为 undefined（官方：checklist 与它互斥），
	// 所以这里用短路回退 —— 有 text/caption 时行为与改动前逐字节一致，
	// 只有 checklist 消息才会落到 checklist 那一支。这一处改完，下面的
	// 早退闸门、闸一/闸二/AI 补查三处 payload.text、指纹、AI 语义、四通道
	// 【全部自动看到 checklist 的文字】，不必逐处接线。
	const text = String(message.text ?? message.caption ?? '').trim()
		|| extractAdChecklistText(message);
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
	// ===== 正文图片（裸图片消息此前在这里被整体丢弃）=====
	//
	// 下面这道闸门原先只认 text / 转发 / 引用体 / 名片显示名四样。一条
	// 【caption 为空的图片消息】这四样全空 —— 于是整条消息在这里就 return，
	// 后面的名册、评分、四条通道、头像判据一条都跑不到。而引流图的全部话术
	// 都写在图片像素里，caption 恒为空（线上样本：同款引流图连发三条）。
	//
	// 提取是纯函数、零成本；真正花 D1 的是后面的 loadAdImageForMessage，
	// 那一步同样被 media 为空挡在纯文本消息之外 —— 「稳定态核心 SQL ≤ 3 条」
	// 那条断言测的正是纯文本消息，不会因此变红。
	const media = extractAdMedia(message);
	if (!text && !forwardChat && !quotedText && !contactName && !media) return false;
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
	// 图片指纹【一条消息只读这一次】，闸一闸二共用同一份结果（理由见 loadAdImageForMessage）。
	// media 为空（纯文本消息）时本行一个 D1 都不发，热路径预算与改动前完全一致。
	const imageRow = media ? await loadAdImageForMessage(env, media, userId) : null;
	const cheapProfile = {
		firstName: from.first_name || '',
		lastName: from.last_name || '',
		username: from.username || '',
		bio: '',
		status: '',
		// 正文里的自定义贴纸 emoji（批次 B-2）。ids 就在 update 的 entities 里现成带着，
		// 不需要 getChat —— 这是本闸唯一新增的判据来源，且仍然一个 Telegram 请求都不发。
		customEmojiIds: extractCustomEmojiIds(message)
	};
	let cheap = applyHistory(await evaluateAdSuspect(
		env,
		// text || contactName：名片消息的 text 恒为空，所以不存在覆盖正文的情况。
		// 用「短路取值」而非拼接，是为了让名片显示名走进 payload.text 后，
		// 结构评分 / 指纹库 / AI 语义 / 四通道结构查杀【四层全都能看到它】。
		{ profile: cheapProfile, text: text || contactName, quotedText, forwardChat, media,
				// 名片消息的手机号（已归一成纯数字）。零 Telegram 请求 —— 就在 update 里。
				// 只用于指纹复用键，不参与评分，理由见 payload.phone 的说明。
				phone: message?.contact?.phone_number },
		// skipMissingBioPenalty：这一闸的 bio 是「没查」而不是「没有」，不能拿它减分。
		{ config, whitelist, skipMissingBioPenalty: true }
	));
	// 正文图片指纹：与头像同位（叠在 applyHistory 之后 = 最终裁决位），
	// 而且排在闸一 —— 媒体在 update 里现成带着，不需要等 getChat，
	// 所以「图片是唯一证据」时闸一就能封，不必为一次图片判据多花一个 Telegram 请求。
	// imageRow 为 null（无媒体 / 尚未入库）时 applyImageVerdict 原样返回，一个字节不改。
	cheap = applyImageVerdict(cheap, imageRow);

	// ===== 同款自定义 emoji 叠判（批次 B-2 的正文一半）=====
	// 【为什么闸一也要叠】批次 C 时闸一没有这个调用点，因为 cheapProfile 拿不到
	// badgeId（那要 getChat）。但正文里的自定义 emoji id 就在 update 的 entities 里，
	// 闸一现成就有 —— 不叠等于这一层在最常用的那道闸上完全失效。
	// 【成本】customEmojiIds 为空时函数立即返回，一个 D1 都不发；
	// 有 id 时也只是查 ad_badges（D1），仍然零 Telegram 请求，
	// 所以「闸一零 getChat」那条不变量原样保住。
	cheap = await applyBadgeToEvaluation(env, cheap, cheapProfile);

	// ===== 名片广告专用定罪（2026-10-11）=====
	// 与头像、会员标同一层位：message.contact 在 update 里现成带着，
	// 零 Telegram 请求、零 D1 查询 —— 「闸一零 getChat」的不变量原样保住。
	// 纯函数，非名片消息一次判定都不做（contact 为空直接原样返回）。
	// 排在 applyBadgeToEvaluation 之后：名片定罪会覆盖 layer，放在前面会被会员标的
	// reasons 顺序弄乱（/pending 复核要能一眼看出是哪一层定的罪）。
	cheap = applyContactCardVerdict(cheap, message);

	// ===== 可疑信号把 bio 冷却期压到 10 分钟（见 AD_SUSPECT_BIO_COOLDOWN_SECONDS）=====
	// 闸一真拿到正分判据 → 不再让入群那次「bio 还是空的」查询把接下来两小时都挡在深判外；
	// 0 正分的普通聊天照旧走原分档，稳态零 Telegram 请求的不变量对它原样成立。
	//
	// ===== 2026-10-11：新增第二条触发路径（业务词 / 交易动词命中，不论分正负）=====
	//
	// 【补的是哪个洞】原判据只认「本次真拿到正分」，而线上漏放的两类样本恰恰拿不到正分：
	//   · checklist 广告正文只有行业词（「假钞」×5、约炮）→ 掉进「单类词不计分」，
	//     reasons 里一行以 + 开头的都没有，suspectSignal 恒为 false；
	//   · 名片广告显示名（「新澳🔥六合彩内幕发布群」）四张词表逐词零命中，同理。
	// 于是第⑥层生成式判定 —— 它存在的理由正是「词表外话术」—— 对这两类永远够不着。
	// 这是设计上的自相矛盾：越是词表抓不住的东西越需要它，而它偏偏被关在门外。
	//
	// 【为什么这个条件安全】触发之后只做两件事：① bio 冷却期压到 10 分钟（多一次 getChat）；
	// ② 送一次 LLM（有 AD_LLM_DAILY 每日上限 + 同载荷内存去重兜着）。
	// 封不禁人仍然由原有评分阈值与 LLM 的 0.85 采信线说了算，这一行【不改任何裁决】。
	// 技术群里天天说的「代理 / 订阅 / 节点 / 教程」全是豁免词，不在下面这两张表里，
	// 普通技术讨论一条都不会被它拉起来 —— 这两行的命中者，本来就已经在 reasons 里
	// 留下了「仅业务关键词」「仅交易动词」的记录，它们只是此前没资格往下走而已。
	const solicitHits = countAdKeywordHits(text || contactName, AD_TRADE_VERBS).length
		+ countAdKeywordHits(text || contactName, AD_BUSINESS_KEYWORDS).length;
	const suspectSignal = solicitHits > 0
		|| (Array.isArray(cheap.reasons)
			&& cheap.reasons.some((line) => AD_POSITIVE_SIGNAL_RE.test(line)));
	const bioCheckedAt = Number(member?.bio_checked_at) || 0;
	const needBio = suspectSignal
		? (bioCheckedAt <= 0 || nowSeconds - bioCheckedAt >= AD_SUSPECT_BIO_COOLDOWN_SECONDS)
		: shouldCheckAdBio(member, nowSeconds);

	// ===== AI 层单独定罪 → 强制补查 bio 再复评（2026-09-22）=====
	//
	// 这是 @svipultra 连环误封的第 ①② 环：闸一的 bio 写死为空 + ban 就地返回，
	// 于是他简介里的「私聊」「Bot」两个豁免词【从头到尾没被读到过】，得分停在 0；
	// 而 #1615 那道豁免否证的条件是 score < 0，0 < 0 为假，那道闸也跟着失效。
	// 查一次 bio 就能同时解决这两环 —— 豁免词一进来分就是负的，现成的 aiExemptVeto 自动生效。
	//
	// 【触发条件刻意收到最窄】必须同时满足：
	//   · verdict 是 ban（不是 ban 的本来就要往下走闸二，不归这里管）
	//   · layer === 'ai'（AI 层定的罪）
	//   · score < 封禁线（评分层自己没撞线 —— 撞了线就不是「AI 单独定罪」）
	// 所以评分层撞阈值、指纹层命中、四通道结构查杀这三种定罪【照旧就地处置，
	// 一次 getChat 都不会多花】。只有「四层里唯独 AI 说有罪」这一种最弱的证据形态才补查。
	//
	// 【为什么无视 bio 冷却期】shouldCheckAdBio 是给稳态聊天做节流的，而这里是一次
	// 即将发生的封禁。@svipultra 早就有 bio_checked_at 了，尊重冷却期等于第 2 次之后
	// 永远查不到他的简介 —— 那正是他连中 5 次的原因。AI 单独定罪本身是低频事件，
	// 为它多花一个 Telegram 请求，换的是把误封挡在发生之前。
	// ===== 可疑但不够封时，闸一同步跑第⑥层 =====
	//
	// 【为什么闸一是唯一还够得着的位置】闸二要等 bio 冷却到期，而入群那次查询
	// 常常查到的是空 bio 却把之后两小时都挡在外面 —— 线上 11/15 人工封的号正是
	// 这个形态（闸一 score 1 或 −1、闸二没进、观察窗口也没有）。冷却已由上面那步
	// 压到 10 分钟，但 10 分钟内的广告消息仍然只有这一层够得着。
	//
	// 【成本为什么可以接受】触发条件是 suspectSignal —— 闸一本次真拿到了正分判据。
	// 0 正分的普通聊天一个调用都不发（占绝大多数），「稳态零额外开销」不变；
	// 可疑消息才花这一次，另有每日上限与同载荷内存去重两道闸兜着。
	// 闸一本就有同步的 bge-m3 嵌入调用，这一层不改变它的性质，只是更慢一点。
	// cheapProfile 没有 bio（闸一是零 getChat 路径），所以这一层判的是昵称 + 正文。
	let decision = suspectSignal
		? await applyAdLLMToEvaluation(env, cheap, config, { profile: cheapProfile, text: text || contactName }, { pool: 'message' })
		: cheap;
	let bioVerified = false;
	if (cheap.verdict === 'ban' && cheap.layer === 'ai' && cheap.score < config.scoreThreshold) {
		const verifyProfile = await fetchAdUserProfile(userId, from);
		// 与闸二同口径：不查 getChatMember，status 留空由 formatAdMemberStatus 渲染成「未查询」。
		verifyProfile.status = '';
		await markAdBioChecked(env, userId, nowSeconds);
		// 只在真拿到 bio 时才改判。getChat 失败（多半是 429）时维持闸一结论 ——
		// 拿不到证据不等于证据不利，但也不能让一次网络抖动把该封的号放过去。
		if (verifyProfile.bioFetched === true) {
			bioVerified = true;
			const verifyEvaluation = applyHistory(await evaluateAdSuspect(
				env,
				{ profile: verifyProfile, text: text || contactName, quotedText, forwardChat,
				// 名片手机号同样带进复评：复评是换 bio 重跑整条判据链，
				// 漏了它会让同一个人的号码指纹在这条路上查不到。
				phone: message?.contact?.phone_number },
				// 这次是【据实传】：bio 真查到了，空简介该减分就减分。
				{ config, whitelist }
			));
			const verifyAvatarEvaluation = await applyAvatarToEvaluation(env, verifyEvaluation, verifyProfile);
			decision = await applyBadgeToEvaluation(env, verifyAvatarEvaluation, verifyProfile);
			console.log('[广告检测] AI 单独定罪已补查 bio 复评 user=' + userId
				+ ' 闸一=' + cheap.verdict + '/' + cheap.score
				+ ' 复评=' + decision.verdict + '/' + decision.score);
		}
	}

	// 闸一够封禁线就地处置，不再花 getChat —— 已经确定要封的人，bio 是什么无关紧要。
	// （唯一的例外是上面那段 AI 单独定罪的补查，它已经把 decision 换成复评结论了。）
	if (decision.verdict === 'ban') {
		// 任意配置群的群主/管理员全群豁免：定罪后才查（低频），当前群入口处已查过。
		if (await isAdminInAnyConfiguredGroup(userId, chat.id)) {
			console.log('[广告检测] user=' + userId + ' 是其他配置群的管理员，豁免不封');
			return false;
		}
		await enforceAdDetection(env, {
			userId,
			chatId: chat.id,
			chatTitle: chat.title || '',
			messageId: message.message_id
		}, decision, { config, whitelist });
		return true;
	}

	// 闸一没定罪、且这个人的 bio 在冷却期内 —— 到此结束，本条消息 0 个 Telegram 请求。
	// 这是稳态下的绝大多数情况（正常聊天），也是「不要每条信息都拉」的落点。
	// bioVerified 短路：上面补查时已经拉过 bio 并复评过了，再进闸二就是拉第二次。
	if (!needBio || bioVerified) {
		if (decision.verdict === 'observe') {
			await upsertAdScreening(env, userId, {
				chatId: chat.id,
				// 只存行为分，见 retainScore 说明。
				score: decision.retainScore ?? 0,
				reasons: decision.reasons,
				snapshot: decision.snapshot,
				layer: decision.layer
			}, config);
			console.log('[广告检测] 闸一转入观察 user=' + userId + ' score=' + decision.score + '/' + config.scoreThreshold
				+ ' 留存行为分=' + (decision.retainScore ?? 0));
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

	// ===== 正文里的自定义贴纸 emoji（批次 B-2）=====
	// 【为什么闸二可以花这个钱】与链接解析同一个理由：走到这里 = needBio 为真，
	// 本来就已经为这次判定花了一个 getChat；形态闸兜底 —— 正文没有 custom_emoji
	// 实体时 ids 是空数组，下面连一个请求都不发（绝大多数消息走不到这一步）。
	// 闸一只查库（id 在 update 的 entities 里现成），不碰这一步，
	// 「闸一定罪零 getChat」那三条断言原样不受影响。
	profile.customEmojiIds = extractCustomEmojiIds(message);
	if (profile.customEmojiIds.length) {
		// 拿贴纸包名（set_name）—— 它是这里唯一有判据价值的产出：广告组织的包名
		// 往往直接写着广告内容，与「资料挂的频道简介含招揽」同一个打法。
		// 结果按 id 进程内缓存 6 小时，同一个包第二次起零请求。
		profile.customEmojiPacks = await resolveCustomEmojiStickers(env, profile.customEmojiIds);
	}

	// ===== 解析资料里挂的频道 / 群 / bot（对齐 menshen resolveLink）=====
	// 【为什么闸二可以花这个钱】走到这里 = needBio 为真（首次发言或 bio 复查期已到），
	// 本来就已经为这次判定花了一个 getChat；链接解析再花 0~5 个，且结果按 handle
	// 缓存 6 小时 —— 群里十个人挂同一个频道只查第一次。形态闸同样兜底：
	// bio 里没有链接形态，这一步连一个请求都不发。
	// 闸一不走这里，「闸一定罪零 getChat」三条断言不受影响。
	// 【先判人，再查链接】与入群线同一道前置。闸二这边必须把正文一起传进去 ——
	// 资料卡干净但正文在发广告的人要靠 textScore 抬进高档，漏传就会把这类人
	// 挡在解析之外，白丢掉他挂的链接那 2~3 分。口径与下面 evaluateAdSuspect
	// 那次的 `text || contactName` 完全一致，两处算的是同一份证据。
	profile.adLinks = await resolveAdProfileLinksElevated(env, profile, {
		whitelist,
		text: text || contactName
	});

	// 据实传：getChat 成功就正常判定（空 bio 该减分就减），失败则跳过减分。
	// 两轨用同一个判断依据（profile.bioFetched），阈值与判据完全一致，不另立标准。
	const baseEvaluation = applyHistory(await evaluateAdSuspect(
		env,
		// 与闸一同一口径传名片显示名。漏传这里会造成一种诡异形态：
		// 名片消息在闸一（无 bio）没定罪 → 走到闸二拉了 bio 本该更容易定罪，
		// 结果因为 text 又变回空串，反而比闸一更判不出来。
		{ profile, text: text || contactName, quotedText, forwardChat, media,
			// 闸二同样带名片手机号 —— 与闸一同源，否则闸二的复评读不到号码指纹。
			phone: message?.contact?.phone_number },
		{ config, whitelist, skipMissingBioPenalty: profile.bioFetched !== true }
	));
	// 闸二已拉到 getChat，头像就在响应里 —— 读指纹零成本，叠加在历史分之后作最终裁决。
	// 图片判据【必须在这里再叠一次】：闸二的 baseEvaluation 是重新算出来的，
	// 闸一叠进去的那份并不跟过来。图片是唯一证据、且闸一没定罪时，
	// 少了这一行就会在这一步漏回放行。
	// 叠的是闸前已经读好的 imageRow —— 同一行不读第二遍，热路径 SQL 只付一次。
	// 两者都只改 verdict / reasons 不碰 score，所以叠放顺序只影响 reasons 的排列，
	// 不影响分值与阈值比较。
	const avatarEvaluation = await applyAvatarToEvaluation(
		env,
		applyImageVerdict(baseEvaluation, imageRow),
		profile
	);
	// 同款会员标叠在最外层：闸一那条零成本路径拿不到会员标（getChat 还没发），
	// 所以这一层只在闸二及其后（入群线、AI 补查、cron 复查）生效 ——
	// 与头像完全同位，热路径的 Telegram 请求数一个都不多。
	let evaluation = await applyBadgeToEvaluation(env, avatarEvaluation, profile);
	// ===== 第四路补位：前三层都没定罪时交给生成式模型 =====
	// 这是治「样本外话术」的那一处 —— 词表没列到、指纹没学过、bge-m3 样本库里
	// 没有近似的正文，在这里由模型直接判。载荷口径与上面 evaluateAdSuspect 一致
	// （text || contactName），两层看到的是同一份内容。
	evaluation = await applyAdLLMToEvaluation(env, evaluation, config, {
		profile, text: text || contactName
	}, { pool: 'message' });

	if (evaluation.verdict === 'ban') {
		if (await isAdminInAnyConfiguredGroup(userId, chat.id)) {
			console.log('[广告检测] user=' + userId + ' 是其他配置群的管理员，豁免不封');
			return false;
		}
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
		// 【第2批 · 广告不进搜索库】转入观察 = 已经可疑但还没定罪，这条正文不该留在
		// moderation_messages 里供 /search 检索（已封的那条天然不写 —— detectAdOnMessage
		// 返回 true 时调用方直接收尾，根本走不到写缓存；缺口只有 observe 这一条）。
		// 在这里返回标记，而不是回头去删：此刻消息还没写进缓存，写入在更后面的 cacheModerationMessage。
		return 'observe';
	}
	return false;
}

// === 命令层 ===
// 10 条广告检测命令一律走这一个入口，handleMessage 里只挂一个钩子，
// 不改动任何既有命令分支。返回 true 表示命令已被处理，调用方应立即 return。
// 【2026-09-08 从 11 条减为 10 条】confirm 已删除，见 handleAdIgnoreCommand 上方的说明。
// /learnlast 放进这里是因为它与本组命令的约束完全一致：仅第一主人、强制私聊。
// /recent 【刻意不在】这里 —— 它必须群内可用（在群里看到广告被删就顺手拉列表），
// 而本函数对群内命令一律撤回 + 引导私聊，会把 /recent 的主用法直接堵死。
const AD_COMMAND_RE = /^\/(pending|ignore|addword|delword|words|addsample|clearsamples|adstats|whitelist|rescreen|warmup|learnlast)(?:@[^\s]+)?(?:\s|$)/i;

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
		// 头像指纹主键。【白名单重建】这里漏一个字段，那条链路就整体静默失效 ——
		// /ignore 的头像纠错必须从这里拿到 avatarId 才能定位到 ad_avatars 的行。
		avatarId: String(snap.avatarId || ''),
		// 会员标主键。与 avatarId 完全同构 —— 这同样是【白名单重建】，
		// 漏了它，/ignore 的会员标纠错就会「说成功了」却一行都没清，
		// 同款标下一个人照样命中，而且标很少换，连坐会一直持续。
		badgeId: String(snap.badgeId || ''),
		// 正文自定义 emoji id 列表。同样是【白名单重建】—— 漏了它，
		// /ignore 会「说成功了」却一行都没清，同款 emoji 下一个人照样命中。
		// 老快照无此字段 → 空数组 → 回滚端逐个跳过。
		customEmojiIds: Array.isArray(snap.customEmojiIds) ? snap.customEmojiIds : [],
		// 正文图片主键。与 avatarId 完全同构 —— 漏了这一个字段，/ignore 的图片纠错
		// 就会「说成功了」却一行都没清，同款图下一个人照样命中。老快照无此字段，
		// 还原成空串，回滚端读到空串自动跳过。
		imageId: String(snap.imageId || ''),
		// 本次计了分的被挂 handle。同样是【白名单重建】—— 漏了它，/ignore 就撤不掉
		// 自举案底，被误封的人挂的那个频道仍挂着「已确认广告位」，下一个人挂同款
		// 照样 +3。老快照无此字段 → 空数组 → 回滚端循环不执行。
		scoredLinks: Array.isArray(snap.scoredLinks) ? snap.scoredLinks : [],
		// 资料形状主键。与 avatarId 同理：这是一份【白名单重建】，
		// 漏一个字段整条纠错链路就静默失效 —— /ignore 会「说成功了」，
		// 但同模板的下一个人照样被加 3 分，谁也看不出来哪里断了。
		profileShape: String(snap.profileShape || ''),

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
			case 'learnlast': await handleAdLearnLastCommand(env, chatId, ownerId, arg); break;
		}
	} catch (error) {
		console.error('[广告检测] 命令 /' + command + ' 执行异常:', error);
		await sendTelegramMessage(chatId, '❌ 命令执行异常：' + escapeHtml(toChineseErrorText(String(error?.message || error))));
	}
	return true;
}

// /recent [N]：拉取最近缓存的群消息作为学习候选，冻结成快照后把带序号列表推私聊。
// 群内可用（这是主用法：在群里看到广告被别的 bot 删掉，顺手拉一份），
// 但列表只走私聊 —— 候选里含 TGID 与广告原文，不该公开在群里。
async function handleAdRecentCommand(message, env, ctx) {
	const chatId = message.chat.id;
	const ownerId = String(getMessageActorId(message));
	const isInGroup = message.chat.type !== 'private';
	const arg = String(message.text || '').replace(/^\/recent(?:@[^\s]+)?\s*/i, '').trim();
	const limit = /^\d+$/.test(arg) ? parseInt(arg, 10) : RECENT_LEARN_MAX_ITEMS;

	const items = await loadRecentLearnCandidates(env, isInGroup ? chatId : '', limit);
	const scopeLabel = isInGroup ? (message.chat.title || '本群') : '全部配置群';
	if (!items.length) {
		const emptyText = 'ℹ️ 最近 48 小时内没有可学习的缓存消息（范围：' + escapeHtml(scopeLabel) + '）。';
		await replyToAdmin(message, ctx, {
			flashText: 'ℹ️ 暂无学习候选，详情已私聊',
			detailText: emptyText,
			isInGroup
		});
		return;
	}
	await saveLearnSnapshot(env, ownerId, items, scopeLabel);

	const lines = [
		'📋 <b>学习候选快照</b>（' + escapeHtml(scopeLabel) + ' · ' + items.length + ' 条 · 已冻结）',
		'已排除零特征的正常发言；多号刷同款的一律保留。按特征强度排序。',
		''
	];
	items.forEach((it, i) => {
		lines.push((i + 1) + '. <code>' + escapeHtml(String(it.text).slice(0, 60)) + '</code>');
		const meta = [];
		if (it.hints.length) meta.push(it.hints.join(' / '));
		if (it.senderCount > 1) meta.push(it.senderCount + ' 个号发过');
		meta.push('TGID <code>' + escapeHtml(it.fromId) + '</code>');
		lines.push('   — ' + meta.join('　'));
		// 每条候选直接跟一条【裸文本】命令：Telegram 只把纯文本里的 /xxx 识别成命令实体、
		// 支持点一下直接发送；包进 <code> 就只能点击复制，还得手动粘贴再补序号。
		// 这与 /help 清单的处理口径一致（那边同样刻意写裸文本，见 handleHelpCommand 注释）。
		lines.push('   /learnlast ' + (i + 1));
	});
	lines.push('');
	lines.push('✅ <b>请私聊我</b>核对后学习（群内不能学）：');
	lines.push('单条直接点上面对应的 /learnlast 序号即可发送；');
	lines.push('多条手打一条即可，如 /learnlast 1,3,5');
	lines.push('⚠️ 学习会<b>同时加黑并全群封禁</b>该条的发送者，判错用回执里的 <code>/unban</code> 一键回滚。');

	await replyToAdmin(message, ctx, {
		flashText: '📋 ' + items.length + ' 条学习候选已推送私聊',
		detailText: lines.join('\n'),
		isInGroup
	});
}

// /learnlast 序号[,序号...]：按 /recent 冻结的快照序号学习。仅私聊（由 AD_COMMAND_RE 分支保证）。
// 【只入库不封禁】学习与处置刻意分开：主人核对的是「这段文案是不是广告」，
// 而封谁是另一个决定 —— 合在一起的话点错序号就会连带封错人。
async function handleAdLearnLastCommand(env, chatId, ownerId, arg) {
	const snap = await loadLearnSnapshot(env, ownerId);
	const list = snap?.items || [];
	if (!list.length) {
		await sendTelegramMessage(chatId, 'ℹ️ 没有可用的快照。\n请先发 <code>/recent</code> 拉取学习候选列表，再回来用 <code>/learnlast 序号</code>。');
		return;
	}
	const indices = [...new Set(
		String(arg || '').split(/[,，\s]+/)
			.map((s) => parseInt(s, 10))
			.filter((n) => Number.isInteger(n) && n >= 1 && n <= list.length)
	)];
	if (!indices.length) {
		await sendTelegramMessage(chatId, [
			'❌ 请给出有效序号（快照共 <b>' + list.length + '</b> 条）。',
			'例：<code>/learnlast 3</code>　或　<code>/learnlast 1,3,5</code>'
		].join('\n'));
		return;
	}

	const lines = ['📖 <b>已学习 ' + indices.length + ' 条</b>（序号 ' + indices.join(',') + '）', ''];
	let learnedTotal = 0;
	let sampleTotal = 0;
	// 发广告的号：学完顺手加黑 + 全群封禁，不必再手动发 /ban。
	// 【为什么能直接封】能进这一步的前提是第一主人已经逐条核对过快照内容 ——
	// 与 /spam 同等的人工判定强度，没有理由再让他多打一条命令。
	const banTargets = new Set();
	for (const idx of indices) {
		const it = list[idx - 1];
		if (!it) continue;
		const text = String(it.text || '');
		if (it.fromId && /^\d+$/.test(String(it.fromId))) banTargets.add(String(it.fromId));
		// source 用 'learnlast'：不是 'auto' → 自动跳过 learnAdFingerprints 的强动词闸门
		//（人工判定不需要那道防自动学习的闸）；又不是 'manual' → 仍受误报退役机制约束，
		// 万一学错了，/ignore 累计误报后能自动清掉，不会留成永久误封源。
		const learn = await learnAdFingerprints(env, { name: '', username: '', bio: '', text }, {
			source: 'learnlast',
			createdBy: ownerId
		});
		const learned = Number(learn?.learned || 0);
		learnedTotal += learned;
		let sampleAdded = 0;
		const sampleText = buildAdSampleText({ name: '', bio: '', text });
		if (sampleText.length >= 4) {
			const s = await addAdSample(env, sampleText, { source: 'learnlast' });
			if (s?.added) { sampleAdded = 1; sampleTotal += 1; }
		}
		lines.push(idx + '. <code>' + escapeHtml(text.slice(0, 60)) + '</code>');
		lines.push('   指纹 +' + learned + '　AI 样本 +' + sampleAdded
			+ (it.senderCount > 1 ? '　（' + it.senderCount + ' 个号发过）' : ''));
	}
	lines.push('');
	lines.push('合计：指纹 <b>+' + learnedTotal + '</b>　AI 样本 <b>+' + sampleTotal + '</b>');

	// ===== 处置发广告的号：加黑 + 全群封禁（2026-09-12 主人要求）=====
	// 同步 / 批量的分流【按子请求预算动态判断】，与连带查杀同一套口径（shouldUseBulkQueue）——
	// 离线实测 15 群时：1 个号 57 子请求（安全），3 个号 119 已超同步预算 100。
	// 写死号数会在群数增长后失效，所以一律交给预算函数判断。
	const targetIds = [...banTargets];
	if (targetIds.length) {
		lines.push('');
		try {
			if (shouldRunLinkedSpamSync(targetIds.length)) {
				const done = [];
				for (const uid of targetIds) {
					const added = await addToBlacklist(uid, env, {
						reason: 'spam', by: ownerId, note: '/learnlast 学习并处置'
					});
					const banResults = await banUserFromAllGroups(uid, { probeMembership: false });
					// 风控·处置：/learnlast 学习并处置按封成功群逐群 +1。
					await recordDisposalsFromBanResults(env, banResults);
					const okCount = banResults.filter((r) => r?.ok).length;
					done.push({ uid, code: String(added?.code || (added?.success ? 'ADDED' : 'ERROR')), ban: okCount + '/' + banResults.length });
				}
				lines.push('<b>已处置 ' + done.length + ' 个发广告的号</b>');
				for (const d of done) {
					lines.push('· <code>' + escapeHtml(d.uid) + '</code>　黑名单:'
						+ (d.code === 'ADDED' ? '已加入' : d.code === 'EXISTS' ? '此前已在' : d.code)
						+ '　封禁:' + d.ban);
				}
			} else {
				// 超同步预算：转 D1 批量任务 + Queues 分片续接，复用既有机制。
				const job = await createBulkJob(env, 'spam', targetIds, [], '/learnlast 学习并处置', {
					chat: { id: chatId, type: 'private' },
					from: { id: Number(ownerId) || 0 }
				});
				if (!getBulkQueue(env)) { job.autoContinue = false; await saveBulkJob(env, job); }
				lines.push('<b>' + targetIds.length + ' 个发广告的号已转批量任务</b>（超同步子请求预算）');
				lines.push('任务号:<code>' + escapeHtml(job.id) + '</code>　进度:<code>/job ' + escapeHtml(job.id) + '</code>');
			}
			lines.push('');
			lines.push('判错一键回滚：<code>/unban ' + escapeHtml(targetIds.join(',')) + '</code>');
		} catch (error) {
			// 处置失败绝不回滚已完成的学习 —— 指纹与样本已经入库，那部分是有效成果。
			console.error('[learnlast] 加黑/封禁失败:', error);
			lines.push('⚠️ 学习已完成，但加黑/封禁出错：' + escapeHtml(toChineseErrorText(String(error?.message || error))));
			lines.push('可手动执行：<code>/ban ' + escapeHtml(targetIds.join(',')) + '</code>');
		}
	} else {
		lines.push('ℹ️ 快照里没有可处置的发送者 TGID，仅完成入库。');
	}
	await sendTelegramMessageChunks(chatId, lines.join('\n'));
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
			unbanSummary += '；失败群：' + failed.slice(0, 3).map((r) => r.groupId + '（' + toChineseErrorText(r.error || '未知', { action: 'unban' }) + '）').join('、');
		}
	}

	const payload = adPayloadFromSnapshot(snapshot);
	// 头像同步纠错：既然这个号是误封，他的头像就不能继续挂着「广告头像」标签，
	// 否则同用这张图（自拍、风景、家人照被盗用）的正常用户会被连坐。
	// 老快照冻结于头像功能上线之前，还原出的 avatarId 是空串 → 本步自动跳过。
	const avatarCleared = await clearAdAvatarOnIgnore(env, payload?.avatarId);
	// 会员标同步纠错：与头像同一理由，但更必须 —— 会员标是【一个数字串】，
	// 一旦挂上「广告标」标签，挂同款的每个人都会命中；而标又很少换，
	// 连坐的持续时间比头像长得多。误封一个就把它清掉，安全阀才有第二道。
	// 老快照冻结于会员标功能上线之前，还原出的 badgeId 是空串 → 本步自动跳过。
	const badgeCleared = await clearAdBadgeOnIgnore(env, payload?.badgeId);
	// 正文自定义 emoji 同步纠错：逐个清。与会员标同一理由 —— 这类素材是
	// 一个 id 被多人复用，误封一个却不清库，下一个人用同款 emoji 还会被命中。
	// 老快照没有这个字段 → 数组为空 → 循环不执行，与改动前逐字节一致。
	const bodyEmojiCleared = [];
	for (const emojiId of (Array.isArray(payload?.customEmojiIds) ? payload.customEmojiIds : [])) {
		if (!emojiId || emojiId === String(payload?.badgeId || '')) continue;
		bodyEmojiCleared.push(await clearAdBadgeOnIgnore(env, emojiId));
	}
	// 正文图片同步纠错：与头像同一理由 —— 这个号既然是误封，这张图就不能继续挂着
	// 「广告素材」标签，否则正常群里转发过同款图（梗图、截图、别人转的图）的人
	// 会被连坐，而且图片比头像更容易被多人正常转发，这个口子必须同时堵上。
	// 老快照冻结于图片功能上线之前，还原出的 imageId 是空串 → 本步自动跳过。
	const imageCleared = await clearAdImageOnIgnore(env, payload?.imageId);
	// 被挂链接的自举案底同步纠错：与头像 / 会员标 / 正文图片完全同一理由 ——
	// 这个号既然是误封，他挂的那个频道就不能继续挂着「已确认广告位」，否则
	// 下一个人挂同款照样 +3，连坐持续到缓存被自然覆盖为止。
	// 老快照没有 scoredLinks 字段 → 空数组 → 循环不执行，与加它之前逐字节一致。
	const linkConfirmedCleared = await clearAdLinkConfirmedOnIgnore(env, payload?.scoredLinks);
	// purge: true —— 主人已明确说这是误判，命中的指纹当次即删，不再攒 3 次误报。
	// 同批改动拆掉了自动学习的强动词闸门，指纹写入变宽，纠错端必须同步变快。
	const fp = await markAdFingerprintFalsePositive(env, payload, { purge: true });
		// 资料形状同步纠错：同一份 bio 判成误封时，它的形状也必须跟着撤 ——
		// 否则下一个人只是碰巧用了同一套模板，就会被这条错形状再加一次分。
		const shapeCleared = await markAdProfileShapeFalsePositive(env, payload?.profileShape, { purge: true });

	// 删掉当初自动学进去的那条 AI 语义样本。在这批改动之前 /ignore 碰都没碰样本库 ——
	// 于是指纹删了、号解封了，错样本却永久留在 AI 样本库里继续误伤相似的正常用户，
	// 而 AI 层是硬命中即封、不看豁免词也不看总分的，一条错样本比一条错指纹更危险。
	const sampleRemoved = await removeAdSampleByText(env, buildAdSampleText(payload));
	await deleteAdScreening(env, targetId);
	await deleteAdPendingSnapshot(env, ownerId, seq);
	return { targetId, removed, unbanSummary, fp, sampleRemoved, avatarCleared, badgeCleared, bodyEmojiCleared, imageCleared, linkConfirmedCleared, shapeCleared };
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

			// ===== 记反例（/ignore 的「不白判」那一半）=====
			// 回滚只是【删掉特征】—— 删完之后模型下次看到同类内容还会再判一次，
			// 因为没有任何东西告诉它「这段话主人已经确认过是正常的」。
			// 记下这次的正文片段，下次达线时先问反例池，命中就降级不封。
			// 【绝不影响 /ignore 本职】失败只记日志，回滚照常完成。
			try {
				await addAdFalsePositive(env, String(snapshot?.text || ''));
			} catch (error) {
				console.error('[广告检测] /ignore 记反例失败:', error);
			}
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
			lines.push('形状修正：' + (r.shapeCleared.ok ? (r.shapeCleared.removed > 0 ? '已删除 ' + r.shapeCleared.removed + ' 条模板形状' : '无对应形状') : '删除失败'));

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
	let avatarRows = [];
	let imageRows = [];
	let badgeRows = [];
	try {
		const rows = await env.DB.batch([
			env.DB.prepare('SELECT COUNT(*) AS c FROM ad_fingerprints'),
			env.DB.prepare('SELECT type, COUNT(*) AS c FROM ad_fingerprints GROUP BY type ORDER BY c DESC'),
			env.DB.prepare('SELECT type, value, match_count FROM ad_fingerprints ORDER BY match_count DESC, updated_at DESC LIMIT 5'),
			env.DB.prepare('SELECT COUNT(*) AS c FROM ad_user_screening WHERE expires_at > ?').bind(now),
			env.DB.prepare('SELECT COUNT(*) AS c FROM ad_pending_snapshots WHERE expires_at > ?').bind(now),
			env.DB.prepare('SELECT COUNT(*) AS c FROM ad_domain_whitelist'),
			// 头像指纹库按判决分档：ad = 已定为广告图、pending = 等 L2 判、clean = 已判干净。
			env.DB.prepare('SELECT verdict, COUNT(*) AS c FROM ad_avatars GROUP BY verdict'),
			// 正文图片指纹库同口径分档。
			env.DB.prepare('SELECT verdict, COUNT(*) AS c FROM ad_images GROUP BY verdict'),
			// 会员标指纹库同口径分档。它没有「待识别」这一档（不做视觉识别），
			// pending 恒为 0，但列结构与另两张对齐，所以照同一条 SQL 查，展示时
			// 照样给出三档，主人看到 pending=0 不会以为卡住了 —— 说明行里写清原因。
			env.DB.prepare('SELECT verdict, COUNT(*) AS c FROM ad_badges GROUP BY verdict')
		]);
		fpTotal = Number(rows[0]?.results?.[0]?.c) || 0;
		fpByType = rows[1]?.results || [];
		fpTop = rows[2]?.results || [];
		screeningCount = Number(rows[3]?.results?.[0]?.c) || 0;
		pendingCount = Number(rows[4]?.results?.[0]?.c) || 0;
		whitelistRows = Number(rows[5]?.results?.[0]?.c) || 0;
		avatarRows = rows[6]?.results || [];
		imageRows = rows[7]?.results || [];
		badgeRows = rows[8]?.results || [];
	} catch (error) {
		console.error('[广告检测] 统计查询失败:', error);
	}

	// 第 ⑥ 层的今日观测：调了几次、模型判了几次广告、其中几次真到采信线。
	// 没有这三个数时，「调了但 0 命中」与「压根没跑」在线上完全无法区分。
	const llmStat = await readAdLLMOutcome(env, Math.floor(Date.now() / 1000));

	const lines = [
		'<b>📊 广告检测状态</b>',
		'',
		'<b>判定配置</b>',
		'封禁阈值：<b>' + config.scoreThreshold + '</b>　观察阈值：<b>' + config.observationScore + '</b>',
		'观察窗口：' + config.observationHours + ' 小时',
		'AI 语义阈值：' + config.aiSimilarityThreshold + '　指纹最低置信：' + config.fingerprintMinConfidence,
		'第三层 AI：' + (config.aiEnabled ? '✅ 已绑定（' + AD_EMBEDDING_MODEL + ' / ' + AD_EMBEDDING_DIMENSION + ' 维）' : '⚠️ 未绑定，降级为评分 + 指纹两层'),
		// 第 ⑥ 层必须在这里显式报状态：它与第三层共用一个 AI 绑定，绑了却把
		// AD_LLM_DAILY 设成 0 时会静默不跑 —— 与「三个静默失效点」同一类问题，
		// 不摆出来没人看得见自己关了它。
		'第⑥层深度判定：' + (!config.aiEnabled
			? '⚠️ 未绑定 Workers AI，本层跳过'
			: (config.llmDaily <= 0
				? '⏸️ 已关闭（AD_LLM_DAILY=0），前五层照跑'
				: '✅ 已启用　每日 <b>' + config.llmDaily + '</b> 次　采信线 <b>' + config.llmConf + '</b>　模型 ' + escapeHtml(config.llmModel))),
		'　↳ 今日调用 <b>' + llmStat.used + '</b>/' + config.llmDaily
			+ '　模型判为广告 <b>' + llmStat.hits + '</b> 次　其中达线处置 <b>' + llmStat.bans + '</b> 次'
			+ '　解析失败 <b>' + llmStat.parseFail + '</b> 次'
			+ (llmStat.used > 0 && llmStat.hits === 0 && llmStat.parseFail === 0
				? '　⚠️ 调用有、0 命中且 0 解析失败 —— 模型确实判了「不是广告」，问题在送进去的载荷内容，不在输出格式'
				: '')
			// 【健康判断看「最后一次失败之后有没有成功过」，不是「今天失败过几次」】
			// 累计失败数只会单调上涨，修好了也不归零 —— 挂着感叹号却什么都没坏，
			// 正是主人 2026-10-11 说的「我希望它完美的打勾」。
			// 2026-10-11 实例：81 次失败里 76 次是修复前的存量，之后连续 42 次调用 0 失败，
			// 看板却一直挂着「⚠️ 有解析失败」。
			+ (llmStat.lastFailSeq > llmStat.lastSuccessSeq
				? '　⚠️ 最近一次解析失败之后没有成功过 —— 链路可能又坏了'
				: (llmStat.parseFail > 0
					? '　✅ 解析正常（' + llmStat.parseFail + ' 次历史失败已被后续成功证明链路已恢复）'
					: (llmStat.used > 0 ? '　✅ 解析正常' : ''))),
		// 分池：哪条轨吃了多少额度。旧配置三条轨共用一个 200 次的池，而入群与 cron 两条轨
		// 没有触发门槛、送进去的 message 恒为空 —— 额度全被普通新用户吃光，
		// 消息路径（广告真正出现的地方）一次都轮不到。摆出来才看得见分得对不对。
		'　↳ 分池　消息 <b>' + Number(llmStat.pools?.message || 0) + '</b>/' + config.llmDailyMessage
			+ '　入群 <b>' + Number(llmStat.pools?.join || 0) + '</b>/' + config.llmDailyJoin
			+ '　定时扫描 <b>' + Number(llmStat.pools?.cron || 0) + '</b>/' + config.llmDailyCron,
		// 熔断状态：连着 AD_LLM_FAIL_BREAK 次取不到模型回答，第⑥层当天自动停。
		// 这一行回答的是「第⑥层到底还活着吗」—— 2026-10-11 那轮它一直在空转烧钱，
		// 看板上却只显示「调用 276 次、命中 0 次」，怎么看都像模型保守，
		// 实际是取值取错、一次都没读到答案。
		(llmStat.broken
			? '　⛔ 已熔断：连续 ' + Number(llmStat.consecFail || 0) + ' 次取不到模型回答，今日不再调用第⑥层。'
				+ '修好返回结构后等跨天自动恢复。'
			: (Number(llmStat.consecFail) > 0
				? '　⚠️ 已连续 ' + Number(llmStat.consecFail) + ' 次取不到回答（满 ' + AD_LLM_FAIL_BREAK + ' 次自动熔断）'
				: ''))
			// 上次解析失败时返回对象的【字段名】—— 直接回答「正文到底在哪个字段」。
			// 只有字段名不含内容：返回体里带着别人的 bio 与消息片段，摆出来是隐私泄露面。
			+ (llmStat.lastShape ? '　↳ 上次返回字段：' + escapeHtml(llmStat.lastShape) : ''),
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
	// 头像指纹库：广告头像的复用是批量化马甲的核心特征，这一行让主人一眼看到
	// 「L1 攒了多少、L2 还有多少没判、模型开关是什么状态」。
	const avatarAd = Number(avatarRows.find((r) => String(r.verdict) === 'ad')?.c) || 0;
	const visionBreak = await readVisionBreakState(env, Math.floor(Date.now() / 1000));
	const avatarPending = Number(avatarRows.find((r) => String(r.verdict) === 'pending')?.c) || 0;
	const avatarClean = Number(avatarRows.find((r) => String(r.verdict) === 'clean')?.c) || 0;
	lines.push('<b>头像指纹</b>　广告图 <b>' + avatarAd + '</b>　待识别 <b>' + avatarPending + '</b>　已排除 <b>' + avatarClean + '</b>');
	// 视觉识别的熔断状态必须摆出来：旧版这里永远显示「✅ 每日上限 50 张」，
	// 而线上真实状态是【全线失败、一张没判成却照样烧额度】—— 配置正常 ≠ 链路健康。
	lines.push('　↳ 视觉识别：' + (config.avatarVisionDaily > 0
		? '✅ 每日上限 ' + config.avatarVisionDaily + ' 张（模型 ' + AD_AVATAR_VISION_MODEL + '）'
		: '⏸️ 已关闭（AD_AVATAR_VISION_DAILY=0），只跑头像指纹，不调模型')
		+ describeVisionBreak(visionBreak));
	// 正文图片指纹库。与头像同口径，但「待识别」里混着三类【永远不进推理队列】的载体
	// （动图 / 视频 / 文件）—— moondream 只吃静态位图，它们只能靠 L1 同款复用命中，
	// 所以这个数字不会随 L2 跑完归零，不是卡住了。
	const imageAd = Number(imageRows.find((r) => String(r.verdict) === 'ad')?.c) || 0;
	const imagePending = Number(imageRows.find((r) => String(r.verdict) === 'pending')?.c) || 0;
	const imageClean = Number(imageRows.find((r) => String(r.verdict) === 'clean')?.c) || 0;
	lines.push('<b>正文图片指纹</b>　广告图 <b>' + imageAd + '</b>　待识别 <b>' + imagePending + '</b>　已排除 <b>' + imageClean + '</b>');
	lines.push('　↳ 视觉识别：' + (config.imageVisionDaily > 0
		? '✅ 每日上限 ' + config.imageVisionDaily + ' 张（模型 ' + AD_IMAGE_VISION_MODEL + '，只判 photo / sticker）'
		: '⏸️ 已关闭（AD_IMAGE_VISION_DAILY=0），只跑图片指纹，不调模型')
		+ describeVisionBreak(visionBreak));
	// 同款会员标指纹库。pending 恒为 0 是【设计如此】—— 这一层只做同款复用，
	// 不做视觉识别，没有排队判一说；命中要过 AD_BADGE_BAN_HITS 次定罪才算数。
	const badgeAd = Number(badgeRows.find((r) => String(r.verdict) === 'ad')?.c) || 0;
	const badgePending = Number(badgeRows.find((r) => String(r.verdict) === 'pending')?.c) || 0;
	const badgeClean = Number(badgeRows.find((r) => String(r.verdict) === 'clean')?.c) || 0;
	lines.push('<b>自定义 emoji 指纹</b>　广告素材 <b>' + badgeAd + '</b>　待识别 <b>' + badgePending + '</b>　已排除 <b>' + badgeClean + '</b>');
	lines.push('　↳ 含昵称旁会员标与正文贴纸 emoji 两类来源，共用一张表');
	lines.push('　↳ 同款定罪 <b>' + AD_BADGE_BAN_HITS + '</b> 次起、且本次有其他佐证才参与定罪（单证永不单独定罪，防常见标连坐）');
	lines.push('<b>域名白名单</b>　生效 <b>' + whitelist.size + '</b> 条（D1 自定义 ' + whitelistRows + ' 条，内置种子 ' + AD_DOMAIN_WHITELIST_SEED.length + ' 条）');
	// 入群检查流水。只记命中的话这一屏对绝大多数新成员是一片空白，
	// 主人分不清「检查过、这个人正常」和「压根没看过他」—— 后者正是漏放的形态。
	if (isConfiguredGroup(chatId)) {
		const joinCounts = await countAdJoinChecks(env, chatId);
		const joinLine = Math.max(Number(config.joinScoreThreshold) || 0, Number(config.scoreThreshold) || 0);
		lines.push('<b>入群检查</b>　今日 <b>' + joinCounts.today + '</b> 人，处置 <b>' + joinCounts.hits + '</b>，'
			+ '累计 <b>' + joinCounts.total + '</b> 条（保留 30 天）');
		lines.push('　↳ 封禁线 <b>' + joinLine + '</b>（消息线 ' + config.scoreThreshold + '）'
			+ (joinLine > config.scoreThreshold
				? '—— 进群只有资料卡一份证据，线比发言高，没到线只转观察不拦'
				: '—— 与消息线相同（未设 AD_JOIN_SCORE_THRESHOLD 或设得更低）'));
		if (joinCounts.total > 0) {
			const joinRows = await readAdJoinChecks(env, { chatId, limit: 3 });
			for (const row of joinRows) {
				let joinReasons = [];
				try { joinReasons = JSON.parse(String(row.reasons || '[]')); } catch (_) {}
				const when = new Date((Number(row.created_at) || 0) * 1000).toISOString().slice(5, 16).replace('T', ' ');
				const verdictLabel = String(row.verdict) === 'ban' ? '处置'
					: (String(row.verdict) === 'observe' ? '转观察' : '正常');
				lines.push('· #' + row.id + ' ' + when + '　user=' + escapeHtml(String(row.user_id))
					+ '　' + (Number(row.score) || 0) + '/' + (Number(row.threshold) || 0) + '　' + verdictLabel);
				if (joinReasons.length && String(row.verdict) !== 'pass') {
					lines.push('　依据：' + escapeHtml(String(joinReasons[0]).slice(0, 60)));
				}
			}
		}
	}
	// 演练模式：本群开关 + 命中流水。放在最后一屏，与判定、库状态分开 ——
	// 主人调阈值时要的正是「刚才有没有命中、命中是因为什么」。
	if (isConfiguredGroup(chatId)) {
		const dryOn = await isDryRunGroup(env, chatId);
		lines.push('<b>演练模式</b>　' + (dryOn ? '🧪 本群【开启】—— 判定照跑，不删不封不加黑，但当场学特征（全部配置群通用）' : '✅ 本群关闭（正常自动处置）'));
		const dryCounts = await countAdDryRun(env, chatId);
		if (dryCounts.total > 0) {
			lines.push('　↳ 命中：今日 <b>' + dryCounts.today + '</b> 条，累计 <b>' + dryCounts.total + '</b> 条（流水保留 30 天）');
			// 主人在演练通知上点按钮留下的结论汇总。待判数 = 还没拍板的，
			// 最低误报分贴住封禁线时直接告诉他往哪调 —— 误封处理的数据出口在这里。
			const dryPending = dryCounts.total - dryCounts.fp - dryCounts.done;
			const verdictParts = ['　↳ 结论：✅确认封 <b>' + dryCounts.done + '</b>　❌误报 <b>' + dryCounts.fp + '</b>　待判 <b>' + dryPending + '</b>'];
			if (dryCounts.lowestFp !== null) {
				verdictParts.push('　误报最低分 <b>' + dryCounts.lowestFp + '/' + (Number(config.scoreThreshold) || 0) + '</b>');
			}
			lines.push(verdictParts.join(''));
			if (dryCounts.lowestFp !== null && dryCounts.lowestFp >= Number(config.scoreThreshold)) {
				lines.push('　⚠️ 被判误报的分数已顶到封禁线 —— 拉高 <code>AD_SCORE_THRESHOLD</code> 才不会再封错人');
			}
			const dryRows = await readAdDryRunLog(env, { chatId, limit: 5 });
			for (const row of dryRows) {
				let reasons = [];
				const mark = Number(row.fp) === 1 ? '　<b>❌误报</b>' : (Number(row.done) === 1 ? '　<b>✅已封</b>' : '　⏳待判');
				try { reasons = JSON.parse(String(row.reasons || '[]')); } catch (_) {}
				const when = new Date((Number(row.created_at) || 0) * 1000).toISOString().slice(5, 16).replace('T', ' ');
				lines.push('· #' + row.id + ' ' + when + '　user=' + escapeHtml(String(row.user_id))
					+ '　' + (Number(row.score) || 0) + '/' + (Number(row.threshold) || 0)
					+ '　' + escapeHtml(AD_LAYER_LABELS[String(row.layer)] || String(row.layer)) + mark);
				if (reasons.length) lines.push('　依据：' + escapeHtml(String(reasons[0]).slice(0, 60)));
			}
		} else if (dryOn) {
			lines.push('　↳ 尚无命中记录');
		}
	}
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
	// 演练命中的单独归类：混进 banned 会拼成「已封禁 N 人」，而一个人都没动。
	const dryRunHits = [];
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
			if (isAdDetectionExemptUser(userId)) { cleared.push(userId); await deleteAdScreening(env, userId); continue; }
			const already = await checkBlacklist(userId, env);
			if (already.isBlacklisted) { cleared.push(userId); await deleteAdScreening(env, userId); continue; }

			const profile = await fetchAdUserProfile(userId, {});
			if (targetChatId) profile.status = await fetchAdMemberStatus(targetChatId, userId);
			// 复判用当前库重新算分，不叠加历史分：历史分本就来自同一份资料，叠加等于重复计分。
			const baseEvaluation = await evaluateAdSuspect(
				env,
				{ profile, text: String(snapshot.text || ''), forwardChat: null },
				{ config, whitelist }
			);
			// 重新筛查也看头像：观察窗口里的号可能改了 bio，但头像换不换都同库可查。
			const avatarEvaluation = await applyAvatarToEvaluation(env, baseEvaluation, profile);
			// 同款会员标同理 —— 会员标比头像更少换，观察窗口里命中它的概率更高。
			const evaluation = await applyBadgeToEvaluation(env, avatarEvaluation, profile);

			if (evaluation.verdict === 'ban' && await isAdminInAnyConfiguredGroup(userId)) {
				// 任意配置群的群主/管理员全群豁免，不封、清掉观察记录。
				await deleteAdScreening(env, userId);
				cleared.push(userId);
			} else if (evaluation.verdict === 'ban') {
				const dryResult = await enforceAdDetection(env, {
					userId,
					chatId: targetChatId,
					chatTitle: '',
					messageId: null
				}, evaluation, { config, whitelist });
				if (dryResult?.dryrun) dryRunHits.push(userId + '(' + evaluation.score + ')');
			else banned.push(userId + '(' + evaluation.score + ')');
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
		'演练命中（未处置）：<b>' + dryRunHits.length + '</b>',
		'继续观察：<b>' + kept.length + '</b>',
		'解除观察：<b>' + cleared.length + '</b>',
		'复判失败：<b>' + failed.length + '</b>'
	];
	if (banned.length) {
		lines.push('');
		lines.push('已封禁：');
		for (const item of banned.slice(0, 10)) lines.push('· <code>' + escapeHtml(item) + '</code>');
	}
	if (dryRunHits.length) {
		lines.push('');
		lines.push('🧪 演练命中（不删不封，已学特征并记流水）：');
		for (const item of dryRunHits.slice(0, 10)) lines.push('· <code>' + escapeHtml(item) + '</code>');
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
		// ===== 判据回滚（删指纹 / 形状 / AI 样本）只给第一主人 =====
		//
		// 解封与删判据是两件事。群管理员、副主人、超管可以解封一个他们认为误封的人 ——
		// 这个权限一字不动。但删判据会让主人演练与 /spam 一点点攒起来的特征当场作废：
		// purge 是【整条删】而不是 hits 减一，同一条指纹在别处也被正式封禁学过的话一并没。
		// 所以这里拆两档：
		//   · 第一主人：解封 + 判据回滚（原行为不变）
		//   · 其他人：只解封，指纹 / 形状 / AI 样本 / 观察记录一个都不动，
		//     回执写「未执行」而不是「删除失败」—— 写成失败会让人以为出了故障去重试，
		//     而它本来就不该由这些人执行。
		//
		// 【为什么现在就要堵】这条路径今天踩不到：AD_REPLY_LEARN_NEGATORS 是空数组，
		// classifyAdReplyIntent 永远返回不了 negative。但权限写在代码里、安全却靠的是
		// 「词表恰好空着」—— 哪天往里加一个「误判」，副主人和群管理员立刻就能删判据。
		const canRollback = isPrimaryOwner(operatorId);
		let fp = { ok: false, affected: 0, retired: 0 };
		let shapeCleared = { ok: false, removed: 0 };
		let sampleRemoved = { ok: false, removed: 0 };
		if (canRollback) {
			// purge: true —— 第一主人已经明确声明这是误判，指纹当次即删，不再攒 3 次误报。
			// 主人原话：「除非说误判了，我就可以通过指定的指令执行全群解封并给指纹记误报 + 删除记录的指纹。」
			fp = await markAdFingerprintFalsePositive(env, payload, { purge: true });
			// 资料形状同步纠错：同一份 bio 判成误封时，它的形状也必须跟着撤 ——
			// 否则下一个人只是碰巧用了同一套模板，就会被这条错形状再加一次分。
			shapeCleared = await markAdProfileShapeFalsePositive(env, payload?.profileShape, { purge: true });
			// 同步清掉当初自动学进去的那条 AI 语义样本。拼法必须走 buildAdSampleText，
			// 与 enforceAdDetection 写入时完全一致，否则 text_hash 对不上、静默删不掉，
			// 错样本会永久留在库里继续把相似的正常用户往高相似度上拉（AI 层是硬命中即封）。
			sampleRemoved = await removeAdSampleByText(env, buildAdSampleText(payload));
			await deleteAdScreening(env, targetId);
		}
		const skipNote = '⏭️ 未执行（判据回滚仅限第一主人）';
		await sendTelegramMessage(chat.id, [
			'<b>♻️ 已按误判处理</b>',
			'用户：<code>' + escapeHtml(targetId) + '</code>',
			'黑名单：' + (removed.success ? '已移除' : (removed.code === 'NOT_FOUND' ? '本就不在黑名单' : '移除失败')),
			'解封：' + unbanOk + '/' + unbanTotal + ' 个群成功',
			'指纹修正：' + (canRollback ? (fp.ok ? '标记 ' + (fp.affected || 0) + ' 条误判，删除 ' + (fp.retired || 0) + ' 条' : '标记失败') : skipNote),
			'形状修正：' + (canRollback ? (shapeCleared.ok ? (shapeCleared.removed > 0 ? '已删除 ' + shapeCleared.removed + ' 条模板形状' : '无对应形状') : '删除失败') : skipNote),
			'AI 样本：' + (canRollback ? (sampleRemoved.ok ? (sampleRemoved.removed > 0 ? '已删除 ' + sampleRemoved.removed + ' 条' : '无对应样本') : '删除失败') : skipNote)
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
	await sendFlashMessage(chat.id, enforced?.dryrun
		? [
			'🧪 演练命中（未处置）' + targetId,
			'本来会：加黑 + 全群封禁 + 删消息 + 学指纹',
			'本群不设防中，看完发 /dryrun 关闭'
		]
		: [
			'✅ 已按广告处置 ' + targetId,
			'指纹 +' + (Number(learn?.learned) || 0) + '　封禁 ' + (enforced.banSummary || '未知')
		], ctx);

	// 群内只留 5 秒闪屏（含 TGID 与指纹计数，不宜长期公开），完整详情私聊第一主人。
	// enforceAdDetection 内部只在【自动判定】路径推送快照通知；回复学习是管理员主动触发，
	// 此前没有任何私聊回执 —— 群里闪屏一撤回就什么都不剩，主人无从知晓谁在替他做处置。
	// 这里补上操作人、目标、判定依据与后续可用命令，与自动判定通知的信息量对齐。
	const ownerId = getOwnerNotifyTargets()[0] || '';
	if (ownerId) {
		const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
		const noticeLines = [
			// 演练命中不能挂「已执行」：主人会照着下面的撤销命令去解一个根本没封的人。
			enforced?.dryrun ? '<b>🧪 回复学习 · 演练命中（未处置）</b>' : '<b>🛡 回复学习已执行</b>',
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
			...(enforced?.dryrun
				? ['🧪 演练模式：不加黑、不封禁、不删消息、未学入指纹',
					'本来会：加黑 + 全群封禁 + 删消息 + 学指纹与 AI 样本']
				: ['黑名单：' + (enforced.blacklistCode === 'ADDED' ? '已加入' : enforced.blacklistCode === 'EXISTS' ? '此前已在黑名单' : String(enforced.blacklistCode || '未知')),
					'全群封禁：' + (enforced.banSummary || '未知'),
					'学入指纹：' + (Number(learn?.learned) || 0) + ' 条（manual 来源，豁免误报退役）',
					'']),
		];
		if (enforced?.dryrun) {
			// 没有 seq 也没有真封：/unban 会去解一个根本没封的人，必须把这条路堵掉。
			noticeLines.push('无需撤销（没有真的处置）。本群不设防中，看完发 <code>/dryrun</code> 关闭；'
				+ '命中流水看 <code>/adstats</code>。');
		} else if (enforced.seq) {
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

// ============================================================================
// 群统计：发言数 / 入群数 / 退群数（2026-09-24 新增）
// 设计口径（主人定）：仅统计【当前群】、按天存、北京时区(UTC+8，可环境变量覆盖)、
// 真人所有非服务消息计一次发言（含命令、含管理员/主人；bot 与服务消息不计）。
// 【独立建表】不动核心 D1_SCHEMA_VERSION，仿 ensureAdDetectionTables 用独立 promise 去重 +
// 失败冷却降级：统计表建失败只让 /stats 返回空，绝不影响 /ban /spam /unban /ad 等既有功能。
// ============================================================================
const D1_STAT_INIT_PROMISES = new WeakMap();
const D1_STAT_RETRY_AT = new WeakMap();
const STAT_SCHEMA_RETRY_COOLDOWN_MS = 60000;
const STAT_RANKING_PAGE_LIMIT = 30;      // 发言排行每页条数（Top N + 翻页）
const STAT_RETENTION_DAYS = 180;         // 明细保留天数，超期由 cron 剪枝
const STAT_RANKING_QUERY_CAP = 2000;     // 排行分页的总人数上限，防超大群把翻页拉到天文数字

// 统计时区偏移（小时）。默认 +8（北京）。环境变量 STATS_TZ_OFFSET 覆盖，范围 -12~14，非法回落 +8。
// 「今日/本周/本月」的切天都以此为准 —— 与项目 cron 的 UTC 日期戳刻意分开，那个是平台调度，
// 这个是给中文用户看的「今天」。
function getStatTzOffsetHours(env) {
	const raw = env?.STATS_TZ_OFFSET;
	if (raw === undefined || raw === null || String(raw).trim() === '') return 8;
	const n = parseInt(String(raw).trim(), 10);
	return Number.isFinite(n) && n >= -12 && n <= 14 ? n : 8;
}

// 毫秒时间戳 → 统计时区的 YYYY-MM-DD。做法：偏移后走 UTC 取年月日，避免依赖运行环境本地时区。
function statDayString(env, nowMs = Date.now()) {
	const offsetMs = getStatTzOffsetHours(env) * 3600 * 1000;
	return new Date(nowMs + offsetMs).toISOString().slice(0, 10);
}

// 计算粒度的起止日（含端点，统计时区 YYYY-MM-DD）。周一为一周起点（中国习惯）。
function statRangeDays(env, range, nowMs = Date.now()) {
	// 第2批·自定义时间：range 除了 day/week/month，还可能是任意日期串
	// （'2026-09-01..2026-09-15'、'昨天'、'上周'、'近7天' 等），先走这条解析。
	const custom = resolveStatRange(env, range, nowMs);
	if (custom) return custom;

	const offsetMs = getStatTzOffsetHours(env) * 3600 * 1000;
	const local = new Date(nowMs + offsetMs);
	const y = local.getUTCFullYear();
	const m = local.getUTCMonth();
	const d = local.getUTCDate();
	const today = new Date(Date.UTC(y, m, d));
	const fmt = (dt) => dt.toISOString().slice(0, 10);
	if (range === 'month') {
		return { start: fmt(new Date(Date.UTC(y, m, 1))), end: fmt(today), label: '本月', range: 'month' };
	}
	if (range === 'week') {
		const dow = today.getUTCDay();            // 0=周日,1=周一,…
		const back = dow === 0 ? 6 : dow - 1;     // 回退到本周一
		const start = new Date(today);
		start.setUTCDate(today.getUTCDate() - back);
		return { start: fmt(start), end: fmt(today), label: '本周', range: 'week' };
	}
	return { start: fmt(today), end: fmt(today), label: '今日', range: 'day' };
}

// 解析自定义区间字符串 → {start, end, label}；不认识就返回 null，让上层走 day/week/month。
// 【为什么不用对象传参】/stats 的翻页与按钮把 range 编码进 callback token（64 字节上限），
// 对象没法编码；统一成字符串后按钮与命令能共用同一套 token。
// 【时区】一律用 statRangeDays 同款算法（getStatTzOffsetHours，默认 +8），与 day/week/month 同口径，
// 保证「每天/每周/每月条数对得上」这条要求不受影响。
function resolveStatRange(env, range, nowMs) {
	if (!range) return null;
	const v = String(range).trim();

	// 绝对日期：'YYYY-MM-DD'（单日）或 'YYYY-MM-DD..YYYY-MM-DD'（区间，端点含）
	if (/^\d{4}-\d{2}-\d{2}(\.\.\d{4}-\d{2}-\d{2})?$/.test(v)) {
		const parts = v.split('..');
		const start = parts[0];
		const end = parts[1] || start;
		if (start > end) return { start: end, end: start, label: end + ' ~ ' + start, range: 'custom' };
		return { start, end, label: start === end ? start : (start + ' ~ ' + end), range: 'custom' };
	}

	const offsetMs = getStatTzOffsetHours(env) * 3600 * 1000;
	const local = new Date(nowMs + offsetMs);
	const today = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
	const fmt = (dt) => dt.toISOString().slice(0, 10);
	// 以「今天」为基准偏移 N 天；用 setUTCDate 让它自己跨月/跨年进位，不手工算月长。
	const shift = (n) => { const t = new Date(today); t.setUTCDate(t.getUTCDate() + n); return t; };
	const dayOf = (t, label) => ({ start: fmt(t), end: fmt(t), label, range: 'custom' });
	const span = (a, b, label) => ({ start: fmt(a), end: fmt(b), label, range: 'custom' });

	const L = v.toLowerCase();
	if (L === 'yesterday' || v === '昨天') return dayOf(shift(-1), '昨天');
	if (L === 'd2' || v === '前天') return dayOf(shift(-2), '前天');
	// 近 N 天：含今天
	if (L === '7d' || L === 'last7d' || /^近\s*7\s*天$/.test(v)) return span(shift(-6), today, '近 7 天');
	if (L === '30d' || L === 'last30d' || /^近\s*30\s*天$/.test(v)) return span(shift(-29), today, '近 30 天');
	// 上周：周一到周日（与 day/week 同口径，周一为一周起点）
	if (L === 'lastweek' || v === '上周') {
		const dow = today.getUTCDay();
		const backToMon = dow === 0 ? 6 : dow - 1;      // 本周一相对今天的偏移
		return span(shift(-backToMon - 7), shift(-backToMon - 1), '上周');
	}
	// 上月：1 号到月末（Date.UTC(y, m, 0) = 本月 0 号 = 上月最后一天，JS 月份进位自动处理跨年）
	if (L === 'lastmonth' || v === '上月') {
		const y = today.getUTCFullYear();
		const mm = today.getUTCMonth();
		return span(new Date(Date.UTC(y, mm - 1, 1)), new Date(Date.UTC(y, mm, 0)), '上月');
	}
	return null;
}

// 建统计两张表：stat_speech（群+人+日 发言数）、stat_member（群+日 进/退/被移出）。
async function ensureStatTables(env) {
	if (!env.DB) return false;
	const cached = D1_STAT_INIT_PROMISES.get(env.DB);
	if (cached) return cached;
	const retryAt = D1_STAT_RETRY_AT.get(env.DB);
	if (retryAt && Date.now() < retryAt) return false;
	const initPromise = (async () => {
		try {
			if (!(await ensureD1Table(env))) throw new Error('D1 核心结构不可用');
			await runD1SchemaStatement(env, 'stat_speech',
				'CREATE TABLE IF NOT EXISTS stat_speech (chat_id TEXT NOT NULL, user_id TEXT NOT NULL, day TEXT NOT NULL, '
				+ 'msg_count INTEGER NOT NULL DEFAULT 0, display_name TEXT, username TEXT, updated_at INTEGER NOT NULL, '
				+ 'last_msg_id INTEGER NOT NULL DEFAULT 0, '
				+ 'PRIMARY KEY (chat_id, user_id, day))');
			// 存量库补列：CREATE TABLE IF NOT EXISTS 对已存在的表完全无效，老部署必须单独 ALTER。
			// 【先查后加】新建表在上面那句里已经带了 last_msg_id，无脑 ALTER 必然撞 duplicate column，
			// 每次冷启动都在日志留一条无意义的 warn。先看列在不在，在就直接跳过。
			try {
				const colRows = await env.DB.prepare('PRAGMA table_info(stat_speech)').all();
				const hasLastMsg = (colRows?.results || []).some((c) => String(c?.name || '') === 'last_msg_id');
				if (!hasLastMsg) {
					await runD1SchemaStatement(env, 'stat_speech.last_msg_id',
						'ALTER TABLE stat_speech ADD COLUMN last_msg_id INTEGER NOT NULL DEFAULT 0', { optional: true });
				}
			} catch (error) {
				// PRAGMA 查不到就当老库补一次列；补不上的后果是写入端 upsert 报错、只影响计数，
				// 不该让整张统计表的初始化失败（那会连累发言/进退群全部功能）。
				console.warn('[群统计] 检查 last_msg_id 列失败，尝试直接补列:', error && error.message);
				await runD1SchemaStatement(env, 'stat_speech.last_msg_id',
					'ALTER TABLE stat_speech ADD COLUMN last_msg_id INTEGER NOT NULL DEFAULT 0', { optional: true });
			}
			await runD1SchemaStatement(env, 'idx_stat_speech_chat_day',
				'CREATE INDEX IF NOT EXISTS idx_stat_speech_chat_day ON stat_speech (chat_id, day)', { optional: true });
			await runD1SchemaStatement(env, 'stat_member',
				'CREATE TABLE IF NOT EXISTS stat_member (chat_id TEXT NOT NULL, day TEXT NOT NULL, '
				+ 'join_count INTEGER NOT NULL DEFAULT 0, leave_count INTEGER NOT NULL DEFAULT 0, kicked_count INTEGER NOT NULL DEFAULT 0, '
				+ 'updated_at INTEGER NOT NULL, PRIMARY KEY (chat_id, day))');
			if (!(await d1TablesExist(env, ['stat_speech', 'stat_member']))) throw new Error('群统计表迁移不完整');
			return true;
		} catch (error) {
			console.error('[群统计] 建表失败: ' + formatD1SchemaError(error));
			return false;
		}
	})();
	D1_STAT_INIT_PROMISES.set(env.DB, initPromise);
	const ok = await initPromise;
	if (!ok) {
		D1_STAT_INIT_PROMISES.delete(env.DB);
		D1_STAT_RETRY_AT.set(env.DB, Date.now() + STAT_SCHEMA_RETRY_COOLDOWN_MS);
	} else {
		D1_STAT_RETRY_AT.delete(env.DB);
	}
	return ok;
}

async function statReady(env) {
	if (!env?.DB) return false;
	try { return await ensureStatTables(env); } catch (error) { console.error('[群统计] 就绪检查失败:', error); return false; }
}

// 计一次发言的完整判断（主人口径：真人所有非服务消息计一次，含命令、含管理员/主人；
// bot、服务消息、频道自动转发、新成员进群消息一律不计）。条件收敛在这里，
// 让「广告检测之前」的几个早退分支和「之后」的主路径共用同一套判据，绝不各写一份走样。
// 后台写不阻塞热路径；统计表未就绪时 recordSpeechStat 内部静默跳过。
async function tryRecordSpeechStat(message, env, chatId, ctx) {
	if (!isConfiguredGroup(chatId)) return;
	if (!message?.from || message.from.is_bot) return;
	if (isTelegramServiceMessage(message)) return;
	if (Array.isArray(message.new_chat_members) && message.new_chat_members.length) return;
	// message_id 交给写入端做幂等：Telegram webhook 重投同一条消息时不再重复 +1。
	const msgId = Number(message?.message_id) || 0;
	if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(recordSpeechStat(env, chatId, message.from, Date.now(), msgId));
	else await recordSpeechStat(env, chatId, message.from, Date.now(), msgId);
}

// 记一次发言（+1）。真人非服务消息由 handleMessage 钩子调用；用 ctx.waitUntil 后台写，不阻塞热路径。
// 昵称/用户名每次覆盖为最新，供排行展示（Bot API 列不出全部成员，只能这样冗余存）。
// 【幂等 msg_id】msgId>0 时用 last_msg_id 判重：同一条消息被 webhook 重投，第二遍走
// `stat_speech.last_msg_id IS NOT excluded.last_msg_id` 判 false，msg_count 不再 +1。
// 关键是判重写在【同一条 upsert 里】，热路径 SQL 条数仍是 1 条，不碰 D1 预算断言。
// msgId 拿不到（异常路径）时退回原来的无条件 +1 —— 宁可极小概率多计，也不能把计数弄丢。
async function recordSpeechStat(env, chatId, from, nowMs = Date.now(), msgId = 0) {
	if (!(await statReady(env))) return;
	try {
		const uid = String(from?.id || '');
		if (!uid) return;
		const day = statDayString(env, nowMs);
		const displayName = [from?.first_name, from?.last_name].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);
		const username = String(from?.username || '').replace(/^@+/, '').slice(0, 64);
		const at = Math.floor(nowMs / 1000);
		if (Number(msgId) > 0) {
			await env.DB.prepare(
				'INSERT INTO stat_speech (chat_id, user_id, day, msg_count, display_name, username, updated_at, last_msg_id) VALUES (?, ?, ?, 1, ?, ?, ?, ?) '
				+ 'ON CONFLICT(chat_id, user_id, day) DO UPDATE SET '
				+ 'msg_count = msg_count + (CASE WHEN stat_speech.last_msg_id IS NOT excluded.last_msg_id THEN 1 ELSE 0 END), '
				+ 'last_msg_id = excluded.last_msg_id, '
				+ 'display_name = excluded.display_name, username = excluded.username, updated_at = excluded.updated_at'
			).bind(String(chatId), uid, day, displayName, username, at, Number(msgId)).run();
			return;
		}
		await env.DB.prepare(
			'INSERT INTO stat_speech (chat_id, user_id, day, msg_count, display_name, username, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?) '
			+ 'ON CONFLICT(chat_id, user_id, day) DO UPDATE SET msg_count = msg_count + 1, '
			+ 'display_name = excluded.display_name, username = excluded.username, updated_at = excluded.updated_at'
		).bind(String(chatId), uid, day, displayName, username, at).run();
	} catch (error) { console.error('[群统计] 记录发言失败:', error); }
}

// 记一次成员事件。kind ∈ join(入群) / leave(主动退群) / kicked(被踢或被封)。
async function recordMemberEvent(env, chatId, kind, nowMs = Date.now()) {
	if (!['join', 'leave', 'kicked'].includes(kind)) return;
	if (!(await statReady(env))) return;
	try {
		const day = statDayString(env, nowMs);
		const col = kind === 'join' ? 'join_count' : (kind === 'leave' ? 'leave_count' : 'kicked_count');
		// kind 已白名单校验，列名/初值拼接安全；其余值走参数绑定。
		await env.DB.prepare(
			'INSERT INTO stat_member (chat_id, day, join_count, leave_count, kicked_count, updated_at) VALUES (?, ?, '
			+ (kind === 'join' ? 1 : 0) + ', ' + (kind === 'leave' ? 1 : 0) + ', ' + (kind === 'kicked' ? 1 : 0) + ', ?) '
			+ 'ON CONFLICT(chat_id, day) DO UPDATE SET ' + col + ' = ' + col + ' + 1, updated_at = excluded.updated_at'
		).bind(String(chatId), day, Math.floor(nowMs / 1000)).run();
	} catch (error) { console.error('[群统计] 记录成员事件失败:', error); }
}

// ===== 入群 / 退群 / 申请 事件明细（第2批 · 2026-10-02）=====
// 与 stat_member 的分工：那张表只存「哪天有几人进出」（计数），这张存
// 「谁、什么时候、被谁操作、走了哪条邀请链接」—— /profile 的时间线读它（readMemberEvents）。
// 表由代码懒建，不动 D1_SCHEMA_VERSION（与 killer_mode、ad_spam_texts 同一套做法）。
const D1_STAT_MEMBER_EVENTS_INIT = new WeakMap();

async function ensureStatMemberEventsTable(env) {
	if (!env?.DB) return false;
	const cached = D1_STAT_MEMBER_EVENTS_INIT.get(env.DB);
	if (cached) return cached;
	const init = (async () => {
		try {
			await runD1SchemaStatement(env, 'stat_member_events',
				'CREATE TABLE IF NOT EXISTS stat_member_events ('
				+ 'chat_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, at INTEGER NOT NULL, '
				+ 'actor_id TEXT, invite_link TEXT, via_request INTEGER NOT NULL DEFAULT 0, '
				+ 'PRIMARY KEY (chat_id, user_id, kind, at))');
			await runD1SchemaStatement(env, 'idx_stat_member_events_user',
				'CREATE INDEX IF NOT EXISTS idx_stat_member_events_user ON stat_member_events (user_id, at)', { optional: true });
			return true;
		} catch (error) {
			console.error('[入群记录] 建表失败:', formatD1SchemaError(error));
			return false;
		}
	})();
	D1_STAT_MEMBER_EVENTS_INIT.set(env.DB, init);
	const ok = await init;
	if (!ok) D1_STAT_MEMBER_EVENTS_INIT.delete(env.DB);   // 失败不缓存，下次重试
	return ok;
}

// 记一条明细。失败只打日志不抛 —— 时间线缺一条不影响封禁、统计等任何其它功能。
// atMs 优先用事件自带的 date（ChatMemberUpdated.date / ChatJoinRequest.date，官方字段），
// 拿不到才退回 Date.now()：两条通道给的都是「事件发生时刻」，差值在秒级以内，兜底是安全的。
// at 存 unix 秒，与 formatBeijingTime 兼容（它同时接受秒 / 毫秒 / ISO）。
async function recordMemberEventDetail(env, chatId, userId, kind, atMs = Date.now(), meta = {}) {
	if (!env?.DB || !userId || !kind) return;
	// 只收事件流真正产生的四种 kind。曾短暂加过 'promote'（第3批回填），但官方文档确认
	// channelParticipantAdmin.date 就是入群时间（"When did the user join"），不存在
	// 单独的任命时间 —— 那个 kind 已从 D1 清除、这里也一并去掉，不留一个永不写入的白名单项。
	if (!['join', 'leave', 'kicked', 'join_request'].includes(kind)) return;
	if (!(await ensureStatMemberEventsTable(env))) return;
	try {
		await env.DB.prepare(
			'INSERT INTO stat_member_events (chat_id, user_id, kind, at, actor_id, invite_link, via_request) '
			+ 'VALUES (?, ?, ?, ?, ?, ?, ?) '
			+ 'ON CONFLICT(chat_id, user_id, kind, at) DO NOTHING'
		).bind(
			String(chatId),
			String(userId),
			kind,
			Math.floor(Number(atMs) / 1000),
			meta.actorId ? String(meta.actorId) : null,
			meta.inviteLink ? String(meta.inviteLink) : null,
			meta.viaRequest ? 1 : 0
		).run();
	} catch (error) {
		console.error('[入群记录] 写入失败:', error);
	}
}

// ===== 风控处置 / 新人治理 计数（第2批 · 2026-10-02）=====
// 与 stat_member 的分工：那张表记「进出群几个人」（人数），这一格记「bot 做了几次风控动作」（次数）。
//   · disposal = 本群封禁/加黑成功的次数
//   · newcomer = 入群筛查当场处置的次数（方案 b 精确计数，口径严格等于「新人被处理数」）
//
// 【为什么不能从 blacklist 聚合】blacklist 表结构是 (id, reason, by_user, at, note)，
// 没有 chat_id 列，8 个加黑调用点的 note 也全是中文描述不带群 —— 它是【全 bot 共享】的。
// 面板要的是「本群挡下 N 次」，所以必须在【能确定群的处置点】当场记，事后聚合拿不到群归属。
// blacklist.at 是 UTC ISO（new Date().toISOString()），跨 UTC/北京日界的记录直接按天切会错一天，
// 当场记则由 statDayString 统一切天（默认 +8），8 小时时区换算在写入端一次完成。
//
// 一张表两个 kind：入群封禁两个口径都要 +1（既是处置、也是新人治理），天然保持一致。
// 表由代码懒建，不动 D1_SCHEMA_VERSION（与 stat_member_events 同一套做法）。
const D1_STAT_ACTIONS_INIT = new WeakMap();

async function ensureStatActionsTable(env) {
	if (!env?.DB) return false;
	const cached = D1_STAT_ACTIONS_INIT.get(env.DB);
	if (cached) return cached;
	const init = (async () => {
		try {
			await runD1SchemaStatement(env, 'stat_actions',
				'CREATE TABLE IF NOT EXISTS stat_actions ('
				+ 'chat_id TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL, '
				+ 'cnt INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, '
				+ 'PRIMARY KEY (chat_id, day, kind))');
			await runD1SchemaStatement(env, 'idx_stat_actions_day',
				'CREATE INDEX IF NOT EXISTS idx_stat_actions_day ON stat_actions (chat_id, day)', { optional: true });
			return true;
		} catch (error) {
			console.error('[群统计] 处置计数表建表失败:', formatD1SchemaError(error));
			return false;
		}
	})();
	D1_STAT_ACTIONS_INIT.set(env.DB, init);
	const ok = await init;
	if (!ok) D1_STAT_ACTIONS_INIT.delete(env.DB);   // 失败不缓存，下次重试
	return ok;
}

// 记一次风控动作。失败只打日志不抛 —— 少计一次绝不能影响封禁本身。
// kind 白名单校验后再拼进 SQL（与 recordMemberEvent 同一处理法），其余值一律参数绑定。
async function recordStatAction(env, chatId, kind, nowMs = Date.now()) {
	if (!env?.DB || !chatId) return;
	if (kind !== 'disposal' && kind !== 'newcomer') return;
	if (!(await ensureStatActionsTable(env))) return;
	try {
		const day = statDayString(env, nowMs);
		await env.DB.prepare(
			'INSERT INTO stat_actions (chat_id, day, kind, cnt, updated_at) VALUES (?, ?, ?, 1, ?) '
			+ 'ON CONFLICT(chat_id, day, kind) DO UPDATE SET cnt = cnt + 1, updated_at = excluded.updated_at'
		).bind(String(chatId), day, kind, Math.floor(nowMs / 1000)).run();
	} catch (error) { console.error('[群统计] 记录风控处置失败:', error); }
}

// 查一段区间（含端点，统计时区 YYYY-MM-DD）内的两格计数。表还没建过 = 从未处置过 = 全 0。
async function queryStatActions(env, chatId, start, end) {
	const empty = { disposal: 0, newcomer: 0 };
	if (!env?.DB) return empty;
	if (!(await ensureStatActionsTable(env))) return empty;
	try {
		const { results } = await env.DB.prepare(
			'SELECT kind, COALESCE(SUM(cnt),0) AS c FROM stat_actions '
			+ 'WHERE chat_id = ? AND day >= ? AND day <= ? GROUP BY kind'
		).bind(String(chatId), start, end).all();
		const out = { ...empty };
		for (const row of results || []) {
			if (row.kind === 'disposal') out.disposal = Number(row.c) || 0;
			else if (row.kind === 'newcomer') out.newcomer = Number(row.c) || 0;
		}
		return out;
	} catch (error) { console.error('[群统计] 处置计数查询失败:', error); return empty; }
}

// 按 banUserFromAllGroups / banUserFromGroup 的结果逐群记一次处置。
// 【口径】只有封成功（或禁言模式下禁言成功）的群才 +1 —— 面板上的「本群挡下 N 次」
// 指的是「本群实际拦下了几次」，一个群成功封掉这个号才算挡下一次，失败的不算。
// 一次处置常常横扫全部配置群，每个群各自 +1，各群的数字与它自己拦下的次数严格相等。
async function recordDisposalsFromBanResults(env, banResults) {
	if (!env?.DB || !Array.isArray(banResults)) return;
	for (const r of banResults) {
		if (!r || !r.ok || !r.groupId) continue;
		await recordStatAction(env, r.groupId, 'disposal');
	}
}

// 取群【此刻】的成员总数（getChatMemberCount）。面板报头的「当前成员」用它，是实时值，
// 不是区间内的任何统计 —— 与「活跃人数」（区间内发言过的人）是两回事，不能互相替代。
// 失败返回 null：让面板显示「未知」，绝不编一个数字出来。
async function fetchChatMemberCount(chatId) {
	if (!chatId) return null;
	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatMemberCount`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: String(chatId) })
		});
		const result = await response.json();
		// 必须判 typeof number：`Number(null)` 是 0，直接 Number() 会让「接口没返回」
		// 静默变成「当前成员 0」—— 那是编出来的数字，比显示「未知」糟得多。
		const raw = result?.result;
		return result?.ok && typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
	} catch (error) {
		console.error('[群统计] 取成员总数失败:', error);
		return null;
	}
}

// ===== 趋势（第2批 · 第4步）：逐日列表 + 汇总 + 环比 =====
// 【不出图】项目里没有任何画图能力，方案已定「逐日列表 + 汇总对比」—— 用数字表，不引图表库。
// 没数据的天补 0：列表因此不断档，环比的分母也不会因为中间缺天而虚高。
// 天数上限 365、下限 1，防手滑传个天文数字把 D1 扫穿。
async function queryStatTrend(env, chatId, days, nowMs = Date.now()) {
	const empty = { days: [], start: '', end: '' };
	if (!env?.DB) return empty;
	const n = Math.max(1, Math.min(365, Number(days) || 7));
	// 与 resolveStatRange 的 shift 同算法：以「统计时区的今天」为基准往回 n-1 天，
	// 用 setUTCDate 让它自己跨月/跨年进位，不手工算月长。
	const offsetMs = getStatTzOffsetHours(env) * 3600 * 1000;
	const local = new Date(nowMs + offsetMs);
	const today = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
	const start = new Date(today);
	start.setUTCDate(today.getUTCDate() - (n - 1));
	const fmt = (d) => d.toISOString().slice(0, 10);
	const startDay = fmt(start);
	const endDay = fmt(today);

	const days2 = [];
	for (let i = 0; i < n; i += 1) {
		const d = new Date(start);
		d.setUTCDate(start.getUTCDate() + i);
		days2.push({ day: fmt(d), msg: 0, active: 0, join: 0, leave: 0, disposal: 0, newcomer: 0 });
	}
	const byDay = new Map(days2.map((r) => [r.day, r]));
	// 先补满今天这条，否则一天数据都没有时趋势页会是空的（今天是 0 也该显示出来）。

	if (!(await statReady(env))) return { days: days2, start: startDay, end: endDay };
	try {
		const speech = await env.DB.prepare(
			'SELECT day, COALESCE(SUM(msg_count),0) AS msg, COUNT(DISTINCT user_id) AS users '
			+ 'FROM stat_speech WHERE chat_id = ? AND day >= ? AND day <= ? GROUP BY day'
		).bind(String(chatId), startDay, endDay).all();
		for (const r of speech.results || []) {
			const row = byDay.get(String(r.day));
			if (row) { row.msg = Number(r.msg) || 0; row.active = Number(r.users) || 0; }
		}
		const member = await env.DB.prepare(
			'SELECT day, COALESCE(SUM(join_count),0) AS j, COALESCE(SUM(leave_count),0) AS l '
			+ 'FROM stat_member WHERE chat_id = ? AND day >= ? AND day <= ? GROUP BY day'
		).bind(String(chatId), startDay, endDay).all();
		for (const r of member.results || []) {
			const row = byDay.get(String(r.day));
			if (row) { row.join = Number(r.j) || 0; row.leave = Number(r.l) || 0; }
		}
	} catch (error) { console.error('[群统计] 趋势查询失败:', error); }

	// 处置 / 新人治理是懒建表，可能一次都没处置过 —— 拿不到就当全 0，不阻断趋势。
	try {
		if (await ensureStatActionsTable(env)) {
			const acts = await env.DB.prepare(
				'SELECT day, kind, COALESCE(SUM(cnt),0) AS c FROM stat_actions '
				+ 'WHERE chat_id = ? AND day >= ? AND day <= ? GROUP BY day, kind'
			).bind(String(chatId), startDay, endDay).all();
			for (const r of acts.results || []) {
				const row = byDay.get(String(r.day));
				if (!row) continue;
				if (r.kind === 'disposal') row.disposal = Number(r.c) || 0;
				else if (r.kind === 'newcomer') row.newcomer = Number(r.c) || 0;
			}
		}
	} catch (error) { console.error('[群统计] 趋势处置查询失败:', error); }

	return { days: days2, start: startDay, end: endDay };
}

// 同长度的上一个区间（环比用）。复用 queryStatTrend：把 nowMs 往回推 n 天即可，
// 算法与区间切法天然一致，不会出现「本期含今天、上期不含今天」这种错位。
async function queryStatTrendPrev(env, chatId, days, nowMs = Date.now()) {
	const n = Math.max(1, Math.min(365, Number(days) || 7));
	return await queryStatTrend(env, chatId, n, nowMs - n * 86400000);
}

// ===== 运行检查（第2批 · 第5步）：两层 + 三权限 =====
// 【第一层 · 状态自检】查 bot 自己：token / 身份、D1、统计活性、Workers AI 绑定、配置规模。
// 【第二层 · 逐群体检】查每个配置群：bot 在不在群、是不是管理员、三个关键权限。
//
// 三权限固定是这三个，因为它们各自决定一条功能能不能用（方案选定的「权限粒度 b」）：
//   can_delete_messages  → /rm 与删广告消息（没这权限 /rm 会静默删不掉）
//   can_restrict_members → 封禁 / 禁言（杀手模式全靠它）
//   can_invite_users     → 私密群取邀请链接
//
// 统计活性是方案选定的「第二层 b」：只看「bot 在线」根本发现不了「统计其实已经断了」——
// bot 活得好好的、token 也正常，但最近一条发言记录停在三天前，那才是要命的。
const HEALTH_GROUP_CONCURRENCY = 4;

// 单群体检：getChat 拿群名，getChatAdministrators 拿「bot 在不在 + 三权限」。
// 不额外发 getChatMember —— 管理员列表里找得到 bot 就是管理员，找不到但列表拉得动
// 说明 bot 在群里只是普通成员，两者够区分，省一次请求。
async function checkGroupHealth(groupId, botId) {
	const out = {
		groupId: String(groupId), title: '', present: false, isAdmin: false,
		canDelete: false, canRestrict: false, canInvite: false, error: ''
	};
	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: out.groupId })
		});
		const result = await response.json();
		if (!result?.ok) { out.error = String(result?.description || 'getChat 失败'); return out; }
		out.title = String(result.result?.title || result.result?.first_name || '');
	} catch (error) { out.error = error.message || String(error); return out; }

	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatAdministrators`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: out.groupId })
		});
		const result = await response.json();
		// 拉不动管理员列表 ≈ bot 不在群里（或群已不可达），按「不在」报。
		if (!result?.ok) { out.error = String(result?.description || 'getChatAdministrators 失败'); return out; }
		out.present = true;
		const me = (result.result || []).find((m) => String(m?.user?.id) === String(botId));
		if (!me) return out;                 // 在群里，但不是管理员
		out.isAdmin = true;
		out.canDelete = me.can_delete_messages === true;
		out.canRestrict = me.can_restrict_members === true;
		out.canInvite = me.can_invite_users === true;
	} catch (error) { out.error = error.message || String(error); }
	return out;
}

// 第一层：bot 自己的状态。每项独立 try —— 一项挂了不能把整份报告拖成空白。
async function runHealthLayerOne(env) {
	const items = [];

	// ① token / 身份：getMe 挂掉是最要命的（token 失效 = bot 整个下线）
	try {
		const id = await getBotId();
		items.push(id
			? { ok: true, text: 'Bot 身份　<code>@' + escapeHtml(String(BOT_USERNAME || '')) + '</code>（' + escapeHtml(String(id)) + '）' }
			: { ok: false, text: 'Bot 身份　❌ getMe 未返回 —— token 可能失效或网络不通' });
	} catch (error) {
		items.push({ ok: false, text: 'Bot 身份　❌ ' + escapeHtml(toChineseErrorText(error.message || '未知错误')) });
	}

	// ② D1
	const dbOk = await statReady(env);
	items.push(dbOk
		? { ok: true, text: 'D1 存储　✅ 已连接（统计表就绪）' }
		: { ok: false, text: 'D1 存储　❌ 不可用 —— 统计、黑名单、封禁记录全部写不进去' });

	// ③ 统计活性：最近一条发言记录是不是今天。这是「统计断了」唯一的信号。
	if (dbOk) {
		try {
			const row = await env.DB.prepare('SELECT MAX(day) AS d FROM stat_speech').first();
			const latest = row?.d ? String(row.d) : '';
			const today = statDayString(env);
			if (!latest) {
				items.push({ ok: null, text: '统计活性　⚠️ 还没有任何发言记录（群太安静，或统计钩子没跑）' });
			} else if (latest === today) {
				items.push({ ok: true, text: '统计活性　✅ 最近写入 <b>' + escapeHtml(latest) + '</b>（今天）' });
			} else {
				const gap = Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(latest + 'T00:00:00Z')) / 86400000);
				items.push({
					ok: false,
					text: '统计活性　❌ 最近写入 <b>' + escapeHtml(latest) + '</b>，已停 <b>' + gap + '</b> 天 —— 统计可能断了'
				});
			}
		} catch (error) {
			items.push({ ok: false, text: '统计活性　❌ 查询失败：' + escapeHtml(toChineseErrorText(error.message || '未知错误')) });
		}
	}

	// ④ Workers AI：没绑不是故障，是降级 —— 标警告不标红。
	const aiOk = Boolean(env?.AI && typeof env.AI.run === 'function');
	items.push(aiOk
		? { ok: true, text: 'Workers AI　✅ 已绑定（广告检测三层全开）' }
		: { ok: null, text: 'Workers AI　⚠️ 未绑定 —— 广告检测降级为「评分 + 指纹」两层（不是故障）' });

	// ⑤ 配置规模
	const killerCount = KILLER_MODE_GROUPS.length;
	items.push({
		ok: true,
		text: '配置规模　📋 配置群 <b>' + GROUP_IDS.length + '</b> 个　杀手模式 <b>' + killerCount + '</b> 个'
	});
	return items;
}

// 整份报告：第一层自检 + 第二层逐群（并发 4，避免一次打满 Telegram 限流）。
async function runHealthCheck(env) {
	const layer1 = await runHealthLayerOne(env);
	let botId = '';
	try { botId = String(await getBotId() || ''); } catch (_) {}

	const targets = GROUP_IDS.filter(Boolean).map(String);
	let layer2 = [];
	if (botId && targets.length) {
		layer2 = await mapWithConcurrency(targets, HEALTH_GROUP_CONCURRENCY, async (g) => {
			try { return await checkGroupHealth(g, botId); }
			catch (error) {
				return { groupId: String(g), title: '', present: false, isAdmin: false,
					canDelete: false, canRestrict: false, canInvite: false, error: error.message || String(error) };
			}
		});
	}
	return { layer1, layer2, total: targets.length };
}

// 「返回群设置」按钮。【只在第一主人打开时挂】—— 非第一主人进不了菜单页，
// 给他们显示这颗按钮就是一颗点了没用的死按钮（方案 A 的核心要求：无死按钮）。
// 调用方用 isPrimaryOwner(actorId) 决定传不传，本函数只负责造键盘。
function buildSettingsBackKeyboard(chatId) {
	const data = SETTINGS_MENU_PREFIX + encodeAdCallbackToken('root|' + String(chatId));
	return adCallbackDataFits(data) ? { inline_keyboard: [[{ text: '↩️ 返回群设置', callback_data: data }]] } : null;
}

// ===== 群设置菜单页（第2批 · 第6步，方案 a）=====
// 首页三个入口：群统计 / 资料卡 / 运行检查。仅第一主人可进 ——
// 这也是「返回群设置」按钮只给第一主人显示的依据：非第一主人根本进不来，
// 给他们显示那个按钮就是一颗点了没用的死按钮（方案 A 要求「无死按钮」）。
function renderGroupSettingsMenu(chatId, title) {
	const scope = title ? escapeHtml(String(title)) : ('群 <code>' + escapeHtml(String(chatId)) + '</code>');
	const mk = (label, action) => {
		const data = SETTINGS_MENU_PREFIX + encodeAdCallbackToken(action + '|' + String(chatId));
		return adCallbackDataFits(data) ? { text: label, callback_data: data } : null;
	};
	const row1 = [mk('📊 统计', 'sm'), mk('👤 资料卡', 'profile')];
	const row2 = [mk('🏥 运行检查', 'health')];
	// 切换群：回到首页（群选择）。与「统计 → 返回首页」是同一个落点，
	// 但按钮文案按他的原话分成两个场景，不合并成一颗。
	const row3 = [mk('🔄 切换群', 'pk')];
	const rows = [];
	if (row1.every(Boolean)) rows.push(row1);
	if (row2.every(Boolean)) rows.push(row2);
	if (row3.every(Boolean)) rows.push(row3);
	return {
		text: [
			'⚙️ <b>群设置</b> · ' + scope,
			'',
			'选择要打开的面板：'
		].join('\n'),
		keyboard: rows.length ? { inline_keyboard: rows } : null
	};
}

// ===== 统计面板（只读 D1，零建表零改列）=====
// 层级（固定 4 层树）：首页 pk → 群设置 root → 统计子菜单 sm → 统计页 g1..g5。
// 全部复用 menu: 前缀 + base64url("<action>|<chatId>[|<page>]")，与既有菜单页同一套 token。
// 【为什么复用 menu: 不新开前缀】handleMenuCallback 走的就是 editAdPagedMessage 原地编辑，
// 正好满足「按钮都在当前层返回、不新开另一条回复」这条硬要求；新开前缀还要同步改
// handleAdCallbackQuery 的分流，白白多一处改点。
// 【为什么返回键写死指向上一层】层级是固定树，token 里不带父指针 —— 带了会把
// callback_data 撑到 Telegram 的 64 字节上限。
// 【为什么不放「·发言统计·」这类分组标题按钮】Telegram 的 inline 键盘没有纯文本行，
// 造那种按钮点了没有任何反应，就是死按钮；分组信息改用消息正文表达。

// 统计子菜单 5 个入口（对应截图：去掉邀请两格 —— 邀请统计他没提，不渲染）。
const STATS_PANEL_ENTRIES = [
	{ action: 'g1', label: '今日发言排名', kind: 'today_rank' },
	{ action: 'g2', label: '7日发言排名', kind: 'week_rank' },
	{ action: 'g3', label: '7日发言统计', kind: 'week_daily' },
	{ action: 'g4', label: '今日进退群数据', kind: 'today_jl' },
	{ action: 'g5', label: '7日进退群统计', kind: 'week_jl' }
];

// 造一个 menu: 按钮；塞不下（群 ID 异常长）就返回 null，由调用方丢整行避免半残键盘。
function mkMenuButton(action, chatId, label, page) {
	const token = String(chatId) + (page ? '|' + String(page) : '');
	const data = SETTINGS_MENU_PREFIX + encodeAdCallbackToken(action + '|' + token);
	return adCallbackDataFits(data) ? { text: label, callback_data: data } : null;
}

// ===== 首页：群选择 + 添加按钮 =====
// 【仅第一主人能到达】入口在 /start 分叉（非第一主人走原介绍语，根本到不了这里），
// 回调端 handleMenuCallback 又复查了一次 isPrimaryOwner，双闸。
// 【群名查询】每个群一次 getChat，用 mapWithConcurrency 限并发以免打满 Telegram 限流；
// 单个群查失败回落成群 ID 文本，不整页崩掉。
async function renderOwnerHome(env) {
	const botName = String(await getBotUsername() || '').replace(/^@+/, '');
	const targets = GROUP_IDS.filter(Boolean).map(String);
	let titles = new Map();
	if (targets.length) {
		try {
			const infos = await mapWithConcurrency(targets, 4, async (g) => {
				try { const gi = await getChatInfoFromId(g); return [g, String(gi?.title || '')]; }
				catch (_) { return [g, '']; }
			});
			titles = new Map(infos.filter(Boolean));
		} catch (_) { /* 查不到就全部回落成群 ID */ }
	}

	const rows = [];
	let row = [];
	for (const g of targets) {
		const name = titles.get(g) || ('群 ' + g);
		const btn = mkMenuButton('root', g, '👥 ' + name);
		if (!btn) continue;
		row.push(btn);
		if (row.length === 2) { rows.push(row); row = []; }
	}
	if (row.length) rows.push(row);

	// 添加按钮走 url（Telegram 官方的 bot 深链），不需要 callback，也没有死按钮问题。
	if (botName) {
		rows.push([
			{ text: '添加到群组 ➕', url: 'https://t.me/' + botName + '?startgroup=true' },
			{ text: '添加到频道 ➕', url: 'https://t.me/' + botName + '?startchannel=true' }
		]);
	}

	const lines = ['👋 <b>统计面板</b>', '', '👇 选择群组进行管理'];
	if (!targets.length) lines.push('', '⚠️ 当前没有配置群。');
	return {
		text: lines.join('\n'),
		keyboard: rows.length ? { inline_keyboard: rows } : null
	};
}

// 导航键盘：返回上一层 + 首页。parentAction 是上一层的 action，写死不带参。
function buildStatNavKeyboard(chatId, parentAction, withHome = true) {
	const rows = [];
	const up = mkMenuButton(parentAction, chatId, '↩️ 返回上一层');
	if (up) rows.push([up]);
	if (withHome) {
		const home = mkMenuButton('pk', chatId, '🏠 返回首页');
		if (home) rows.push([home]);
	}
	return rows.length ? { inline_keyboard: rows } : null;
}

// 统计子菜单。分组写进正文（Telegram 键盘没有分组标题位）。
function renderStatsSubmenu(chatId, title) {
	const scope = title ? escapeHtml(String(title)) : ('群 <code>' + escapeHtml(String(chatId)) + '</code>');
	const rows = [];
	const r1 = [mkMenuButton('g1', chatId, '今日发言排名'), mkMenuButton('g2', chatId, '7日发言排名')];
	const r2 = [mkMenuButton('g3', chatId, '7日发言统计')];
	const r3 = [mkMenuButton('g4', chatId, '今日进退群数据'), mkMenuButton('g5', chatId, '7日进退群统计')];
	// 任一格塞不下就丢整行，宁可少一行也不要残缺行。
	if (r1.every(Boolean)) rows.push(r1);
	if (r2.every(Boolean)) rows.push(r2);
	if (r3.every(Boolean)) rows.push(r3);
	const nav = buildStatNavKeyboard(chatId, 'root');
	if (nav) for (const r of nav.inline_keyboard) rows.push(r);
	return {
		text: [
			'📊 <b>' + scope + ' · 统计</b>',
			'',
			'· 发言统计 ·',
			'　今日发言排名 / 7日发言排名 / 7日发言统计',
			'· 进退群统计 ·',
			'　今日进退群数据 / 7日进退群统计'
		].join('\n'),
		keyboard: rows.length ? { inline_keyboard: rows } : null
	};
}

// 排行榜渲染（今日 / 7日 共用）。文案对齐截图：`1. 昵称 80 条` + 翻页。
function renderRankingLines(ranking) {
	if (!ranking.rows.length) return ['（本时段暂无发言记录）'];
	const lines = ['🏆 <b>发言排行</b>（第 ' + ranking.page + '/' + ranking.totalPages + ' 页）'];
	for (const row of ranking.rows) {
		const label = row.displayName || (row.username ? '@' + row.username : row.userId);
		const link = '<a href="tg://user?id=' + escapeHtml(row.userId) + '">' + escapeHtml(label) + '</a>';
		lines.push(row.rank + '. ' + link + ' <b>' + row.count + '</b> 条');
	}
	return lines;
}

// 排行页翻页键盘：翻页仍在本页（原地编辑），末行是导航。
function buildRankingKeyboard(chatId, action, page, totalPages, parentAction) {
	const rows = [];
	const pager = [];
	if (page > 1) {
		const prev = mkMenuButton(action, chatId, '⬅️ 上一页', page - 1);
		if (prev) pager.push(prev);
	}
	pager.push({ text: page + '/' + totalPages, callback_data: SETTINGS_MENU_PREFIX + 'noop' });
	if (page < totalPages) {
		const next = mkMenuButton(action, chatId, '下一页 ➡️', page + 1);
		if (next) pager.push(next);
	}
	rows.push(pager);
	const nav = buildStatNavKeyboard(chatId, parentAction);
	if (nav) for (const r of nav.inline_keyboard) rows.push(r);
	return { inline_keyboard: rows };
}

// 统计子页面（5 种）。全部只读既有查询，不新增任何 SQL、不改任何表。
async function renderStatsSubPage(env, chatId, kind, title, page = 1, nowMs = Date.now()) {
	const scope = title ? escapeHtml(String(title)) : ('群 <code>' + escapeHtml(String(chatId)) + '</code>');
	const nav = (parent) => buildStatNavKeyboard(chatId, parent);

	// 发言排名两档：汇总行 + 排行 + 翻页。
	if (kind === 'today_rank' || kind === 'week_rank') {
		const range = kind === 'today_rank' ? 'day' : '7d';
		const [summary, ranking] = await Promise.all([
			queryStatSummary(env, chatId, range, nowMs),
			queryStatRanking(env, chatId, range, page, nowMs)
		]);
		const head = kind === 'today_rank'
			? '今日总发言:<b>' + summary.totalMsg + '</b> 条；活跃人数:<b>' + summary.activeUsers + '</b>'
			: '7日发言总数:<b>' + summary.totalMsg + '</b> 条；活跃人数:<b>' + summary.activeUsers + '</b>';
		const action = kind === 'today_rank' ? 'g1' : 'g2';
		const info = statRangeDays(env, range, nowMs);
		const lines = [
			(kind === 'today_rank' ? '📈 今日发言排名' : '📈 7日发言排名') + ' · ' + scope,
			'📅 ' + info.label + ' ' + (info.start === info.end ? info.start : (info.start + ' ~ ' + info.end)) + '（北京时间）',
			'',
			head
		].concat(renderRankingLines({ ...ranking, page }));
		return {
			text: lines.join('\n'),
			keyboard: buildRankingKeyboard(chatId, action, page, ranking.totalPages, 'sm')
		};
	}

	// 7日发言统计：逐日消息数。
	if (kind === 'week_daily') {
		const trend = await queryStatTrend(env, chatId, 7, nowMs);
		const lines = ['📊 <b>7日发言统计</b> · ' + scope, ''];
		let total = 0;
		for (const d of trend.days) {
			total += d.msg;
			lines.push('<code>' + d.day + '</code>: <b>' + d.msg + '</b> 条');
		}
		lines.push('', '合计 <b>' + total + '</b> 条');
		return { text: lines.join('\n'), keyboard: nav('sm') };
	}

	// 今日进退群数据。
	if (kind === 'today_jl') {
		const summary = await queryStatSummary(env, chatId, 'day', nowMs);
		const lines = [
			'👥 <b>今日进退群数据</b> · ' + scope,
			'',
			'今日进群:<b>' + summary.join + '</b>人，退群:<b>' + summary.leave + '</b>人',
			'净增 <b>' + ((summary.join - summary.leave > 0 ? '+' : '') + (summary.join - summary.leave)) + '</b> 人',
			'被移出 <b>' + summary.kicked + '</b> 人'
		];
		return { text: lines.join('\n'), keyboard: nav('sm') };
	}

	// 7日进退群统计：逐日 +入 / -出。
	const trend = await queryStatTrend(env, chatId, 7, nowMs);
	let j = 0; let l = 0;
	for (const d of trend.days) { j += d.join; l += d.leave; }
	const lines = [
		'👥 <b>7日进退群统计</b> · ' + scope,
		'',
		'入群共:<b>' + j + '</b>人，退群共:<b>' + l + '</b>人',
		''
	];
	for (const d of trend.days) {
		lines.push('<code>' + d.day + '</code>: <b>+' + d.join + '</b> 人，<b>-' + d.leave + '</b> 人');
	}
	return { text: lines.join('\n'), keyboard: nav('sm') };
}

// 菜单里「资料卡」那一格：它需要一个 TGID 参数，按钮给不了 ——
// 原地改成用法提示 + 返回键，不去伪造一个空参数去调 buildProfileBlock。
function renderProfileHint(chatId, title) {
	const back = buildSettingsBackKeyboard(chatId);
	return {
		text: [
			'👤 <b>资料卡</b> · ' + (title ? escapeHtml(String(title)) : '群 <code>' + escapeHtml(String(chatId)) + '</code>'),
			'',
			'发送 <code>/profile TGID</code> 查询指定的人（昵称 / 用户名 / 简介 / 时间线 / 黑名单 / GKY）。',
			'也可以<b>回复某条消息</b>再发 <code>/profile</code>，直接查发信人。',
			'',
			'仅第一主人可用；群内不撤回命令。'
		].join('\n'),
		// buildSettingsBackKeyboard 返回的已是 { inline_keyboard: [[按钮]] } 整个对象，
		// 再包一层 [[back]] 会得到没有 text 的空按钮。
		keyboard: back
	};
}

// /menu 指令：仅第一主人，且【仅群内】——菜单叫「群设置」，天然属于某个群的上下文；
// 私聊没有当前群，点「群统计」会拿用户 ID 当群号查出一片空白。
async function handleMenuCommand(message, env) {
	const userId = getMessageActorId(message);
	const isInGroup = message.chat?.type !== 'private';
	if (!isPrimaryOwner(userId)) {
		if (isInGroup) return true;   // 群内不暴露这条隐藏命令的存在
		await sendTelegramMessage(String(message.chat?.id || ''), '❌ <b>权限不足</b>\n\n/menu 群设置菜单仅限第一主人使用。');
		return true;
	}
	const chatId = String(message.chat?.id || '');
	if (!isInGroup) {
		await sendTelegramMessage(chatId, 'ℹ️ 群设置菜单是按群的，请到<b>配置群里</b>发送 <code>/menu</code>。');
		return true;
	}
	// 不再判 isConfiguredGroup：非配置群的命令在分发之前就被 isNonConfiguredGroup 拦掉
	// （与 /rm 同策略），走不到这里，加了就是一段永不执行的分支。
	const title = String(message.chat?.title || '');
	const menu = renderGroupSettingsMenu(chatId, title);
	await sendTelegramMessage(chatId, menu.text, menu.keyboard);
	return true;
}

function isMenuCommand(text) {
	return /^\/menu(?:@[^\s]+)?(?:\s|$)/i.test(String(text || '').trim());
}

function isSearchCommand(text) {
	return /^\/search(?:@[^\s]+)?(?:\s|$)/i.test(String(text || '').trim());
}

// /search 权限：第一主人 + 【该群 Telegram 群主】（creator），普通管理员一律不给。
// 主人的口径是「能看历史发言的人越少越好」—— /stats 还只是数字，这里能看到谁说过什么。
// 不复用 checkIfUserIsAdminInGroup：那个只回答「是不是管理员」，区分不出 creator。
// 不接 AD_ADMIN_CACHE：它存的是 id 列表、没有 status，判不了群主；搜索低频，直接查一次。
async function isGroupCreator(userId, chatId) {
	const uid = String(userId || '');
	const gid = String(chatId || '');
	if (!uid || !gid || !isConfiguredGroup(gid)) return false;
	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getChatAdministrators`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: gid }),
		});
		const result = await response.json();
		if (!result?.ok || !Array.isArray(result.result)) return false;
		const hit = result.result.find((m) => String(m?.user?.id) === uid);
		return hit?.status === 'creator';
	} catch (error) {
		console.error('[搜索] 查询群主失败:', error);
		return false;
	}
}

// ===== 关键词搜索（第2批 · 第7步）=====
// 检索源是 moderation_messages 的 text_norm（小写化的归一正文，写入时截断 200 字）。
// 两个已知边界，方案里明说接受：① 正文只存到第 200 个字符，后面的内容搜不到；
// ② 命令消息（/xxx 开头）从来不进这张表，搜不到任何命令。
const SEARCH_PAGE_SIZE = 10;
const SEARCH_PREFIX = 'searchpg:';

// 分类查询词：@用户名 → username 检索；纯数字（≥5 位）→ 当 TGID 查发送者；其余当关键词。
function classifySearchQuery(raw) {
	const v = String(raw || '').trim();
	if (!v) return null;
	if (/^@?[A-Za-z0-9_]{4,}$/.test(v) && v.startsWith('@')) return { kind: 'username', value: v.slice(1) };
	if (/^\d{5,}$/.test(v)) return { kind: 'user', value: v };
	return { kind: 'keyword', value: v };
}

// @username → TGID。Bot API 没有「按用户名查用户 ID」的接口，
// 但 stat_speech 存了每个发言者的 username（由发言钩子写入、覆盖面最广），反查一次即可。
// 拿不到就是查不到 —— 返回空串让上层明说「没找到这个用户名」，绝不退回成「搜全部」。
async function resolveUsernameToUserId(env, rawName) {
	const name = String(rawName || '').replace(/^@+/, '').trim().toLowerCase();
	if (!name || !env?.DB) return '';
	if (!(await statReady(env))) return '';
	try {
		const row = await env.DB.prepare(
			'SELECT user_id FROM stat_speech WHERE LOWER(username) = ? ORDER BY day DESC LIMIT 1'
		).bind(name).first();
		return row?.user_id ? String(row.user_id) : '';
	} catch (error) {
		console.error('[搜索] 用户名反查失败:', error);
		return '';
	}
}

// 执行检索。三个条件可组合（群范围 + 发送者 + 关键词），LIKE 一律转义并走 ESCAPE，
// 免得查询词里的 % _ 把整库都匹出来。
async function runSearchMessages(env, opts) {
	const empty = { rows: [], total: 0, totalPages: 1 };
	if (!env?.DB) return empty;
	const pageSize = SEARCH_PAGE_SIZE;
	const page = Math.max(1, Number(opts.page) || 1);
	const where = [];
	const params = [];
	if (Array.isArray(opts.chatIds) && opts.chatIds.length) {
		where.push('chat_id IN (' + opts.chatIds.map(() => '?').join(',') + ')');
		params.push(...opts.chatIds.map(String));
	}
	if (opts.userId) { where.push('from_id = ?'); params.push(String(opts.userId)); }
	if (opts.keyword) {
		where.push("text_norm LIKE ? ESCAPE '\\'");
		const escaped = String(opts.keyword).toLowerCase().replace(/[\\%_]/g, (c) => '\\' + c);
		params.push('%' + escaped + '%');
	}
	if (!where.length) return empty;
	// 广告不进检索源（第 2 批既定规则）：is_ad=1 的行是被判过的消息 —— 封禁、演练命中、
	// 转入观察的都写进了缓存，只为让 /spam 的同款反查与当前群清扫追得到，不给 /search 检索。
	// 放在「至少一个条件」判定之后：否则无条件查询会因这条而不再返回空，行为就变了。
	where.push('(is_ad IS NULL OR is_ad = 0)');
	const whereSql = 'WHERE ' + where.join(' AND ');
	try {
		const totalRow = await env.DB.prepare('SELECT COUNT(*) AS c FROM moderation_messages ' + whereSql).bind(...params).first();
		const total = Number(totalRow?.c) || 0;
		const totalPages = Math.max(1, Math.ceil(total / pageSize));
		const { results } = await env.DB.prepare(
			'SELECT mid, chat_id, from_id, created_at, text_norm FROM moderation_messages ' + whereSql
			+ ' ORDER BY id DESC LIMIT ? OFFSET ?'
		).bind(...params, pageSize, (page - 1) * pageSize).all();
		return { rows: results || [], total, totalPages };
	} catch (error) {
		console.error('[搜索] 查询失败:', error);
		return empty;
	}
}

// /search 权限统一入口：第一主人无条件放行；其余必须是【该群 Telegram 群主】（creator）。
// 群内才判得到群主；私聊没有群上下文，只有第一主人能用。
async function canUseSearch(userId, chatId) {
	if (isPrimaryOwner(userId)) return true;
	if (!chatId) return false;
	return await isGroupCreator(userId, chatId);
}

// 渲染搜索结果。o: { scopeLabel, queryLabel, rows, total, page, totalPages, showChatId, historyNote }
function renderSearchResult(o) {
	const lines = ['🔍 <b>搜索</b> · ' + o.scopeLabel, '查询：' + o.queryLabel, ''];
	if (!o.total) {
		lines.push('（没有匹配的记录）');
	} else {
		lines.push('共 <b>' + o.total + '</b> 条'
			+ (o.totalPages > 1 ? '　第 <b>' + o.page + '/' + o.totalPages + '</b> 页' : ''));
		lines.push('');
		for (const r of o.rows) {
			const who = '<a href="tg://user?id=' + escapeHtml(String(r.from_id || '')) + '">'
				+ escapeHtml(String(r.from_id || '')) + '</a>';
			// 跨群搜索时标出群 ID（群内搜索标题里已有群名，不必重复）
			const where = o.showChatId ? '　<code>' + escapeHtml(String(r.chat_id || '')) + '</code>' : '';
			// text_norm 可能为 null（迁移没跑完时的降级写入），显示「无正文」而不是空白行。
			const body = r.text_norm ? escapeHtml(String(r.text_norm).slice(0, 200)) : '<i>（无正文）</i>';
			lines.push('• <code>' + escapeHtml(formatBeijingTime(r.created_at)) + '</code>　' + who + where);
			lines.push('　' + body);
		}
	}
	if (o.historyNote) lines.push('', o.historyNote);
	return lines.join('\n');
}

// 保留策略提示：说清楚「为什么有些群只有最近 200 条」，别让人以为是 bug。
function searchHistoryNote(scopeChatIds) {
	const configured = scopeChatIds.filter((c) => STAT_SEARCH_GROUPS.includes(String(c)));
	if (configured.length === scopeChatIds.length && configured.length > 0) {
		return '📖 本群正文保留 <b>' + STAT_SEARCH_RETENTION_DAYS + '</b> 天（在 <code>STAT_SEARCH_GROUPS</code> 里）。';
	}
	if (configured.length === 0) {
		return '📖 本群未列入 <code>STAT_SEARCH_GROUPS</code>，只保留全局最新 200 条 —— 更早的搜不到。';
	}
	return '📖 列入 <code>STAT_SEARCH_GROUPS</code> 的群保留 <b>' + STAT_SEARCH_RETENTION_DAYS
		+ '</b> 天，其余群只有全局最新 200 条。';
}

// /search 权限与用法
function buildSearchUsage() {
	return [
		'🔍 <b>搜索</b> · 用法',
		'在消息缓存里查谁发过什么。<b>权限：第一主人 + 该群群主</b>。',
		'',
		'• <code>/search 关键词</code>　按正文搜（大小写不敏感）',
		'• <code>/search 709xxxxx</code>　按 TGID 查这个人发过什么',
		'• <code>/search @用户名</code>　按用户名查（内部反查成 TGID）',
		'',
		'群内发 = 只查本群；私聊发 = 跨全部配置群（仅第一主人）。',
		'',
		'⚠️ 两个已知边界：正文写入时截断 <b>200 字</b>，后面的搜不到；命令消息（<code>/</code> 开头）从不入库，搜不到任何命令。'
	].join('\n');
}

// /search 命令处理。返回 true 表示已处理。
async function handleSearchCommand(message, env) {
	const userId = getMessageActorId(message);
	const isInGroup = message.chat?.type !== 'private';
	const chatId = String(message.chat?.id || '');
	const raw = String(message.text || '').replace(/^\/search(?:@[^\s]+)?\s*/i, '').trim();

	if (!isInGroup) {
		// 私聊没有群上下文，群主无从判起 —— 只给第一主人（可跨全部配置群）。
		if (!isPrimaryOwner(userId)) {
			await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n/search 仅限第一主人或配置群群主使用；私聊查询仅限第一主人。');
			return true;
		}
	} else if (!(await canUseSearch(userId, chatId))) {
		// 群内非第一主人且非本群群主 → 静默，不暴露这条隐藏命令的存在。
		return true;
	}

	if (!raw) {
		await sendTelegramMessage(chatId, buildSearchUsage());
		return true;
	}

	const q = classifySearchQuery(raw);
	if (!q) { await sendTelegramMessage(chatId, buildSearchUsage()); return true; }

	let userIdFilter = null;
	let keywordFilter = null;
	let queryLabel = '';
	if (q.kind === 'user') {
		userIdFilter = q.value;
		queryLabel = '发送者 <code>' + escapeHtml(q.value) + '</code>';
	} else if (q.kind === 'username') {
		userIdFilter = await resolveUsernameToUserId(env, q.value);
		if (!userIdFilter) {
			// 查不到就明说查不到 —— 不能退回成「搜全部关键词」，那是完全不同的结果集。
			await sendTelegramMessage(chatId, '⚠️ 没找到用户名 <code>@' + escapeHtml(q.value)
				+ '</code> 的记录。\n\n该用户可能没在发言统计里出现过，或用户名拼写有误。');
			return true;
		}
		queryLabel = '@' + escapeHtml(q.value) + '（<code>' + escapeHtml(userIdFilter) + '</code>）';
	} else {
		keywordFilter = q.value;
		queryLabel = '关键词「' + escapeHtml(q.value) + '」';
	}

	// 群内只查本群；私聊（已确认是第一主人）跨全部配置群。
	const scopeChatIds = isInGroup ? [String(chatId)] : GROUP_IDS.map(String);
	const result = await runSearchMessages(env, {
		chatIds: scopeChatIds, userId: userIdFilter, keyword: keywordFilter, page: 1
	});
	// token 只存查询的三个要素（类型|值|范围），翻页回调据此原样重跑。
	const token = [q.kind, q.value, isInGroup ? String(chatId) : 'all'].join('|');
	const scopeLabel = isInGroup
		? (String(message.chat?.title || '') || '群 <code>' + escapeHtml(String(chatId)) + '</code>')
		: '全部配置群';
	const text = renderSearchResult({
		scopeLabel,
		queryLabel,
		rows: result.rows,
		total: result.total,
		page: 1,
		totalPages: result.totalPages,
		showChatId: !isInGroup,
		historyNote: searchHistoryNote(scopeChatIds)
	});
	const keyboard = buildAdPaginationKeyboard(SEARCH_PREFIX, 1, result.totalPages, encodeAdCallbackToken(token));
	await sendAdPagedMessage(chatId, text, keyboard, '（记录较多，用下方按钮翻页）');
	return true;
}

// chat_join_request 处理：申请人「发起申请」的那一刻（还不是群成员）。
// 先记时间线，再做广告筛查 —— 命中就【预封 + 拒绝申请】，人在管理员点同意之前
// 就被拦下，压根进不了群。
// 群未开启入群审批时，这个 update 永远不会推送，本函数不会被执行。
// （函数名原为 handleBotChatJoinRequest，2026-10-02 随 update 名纠正一并改名。）
//
// 【2026-10-10 起不再「只记时间」】原先这里对审批一律不碰，结果广告号提交申请时
// 无人过问：要等管理员手动批准、人进了群，chat_member / new_chat_members 那两条路
// 才筛查得到，而那时人已经在群里活动过了。改成申请那一刻就判，判成广告当场预封。
async function handleChatJoinRequest(req, env) {
	const chat = req?.chat;
	const user = req?.user;
	const chatId = String(chat?.id || '');
	const userId = String(user?.id || '');
	if (!chatId || !userId || !isConfiguredGroup(chatId)) return;

	try {
		await recordMemberEventDetail(env, chatId, userId, 'join_request', req.date ? req.date * 1000 : Date.now(), {
			inviteLink: req.invite_link?.invite_link || null,
			viaRequest: true,
		});
	} catch (error) {
		console.error('[入群记录] 申请事件处理失败:', error);
	}

	// 筛查与记录各自 try：记录写不进去不能吞掉筛查，筛查炸了也不能吞掉记录。
	try {
		await screenJoinRequestAd(env, user, chatId, String(chat?.title || ''));
	} catch (error) {
		console.error('[申请筛查] 异常:', error);
	}
}

// === 申请进群即筛查 ===
//
// 【为什么复用 screenAdJoinMember 而不是另写一套判据】判据一旦分叉，两条路的宽严
// 就会随时间漂移：这边漏掉的形态那边照样抓，管理员会看到「同一份资料，申请时放过、
// 进群时又封」。所以这里只加一个 noBioLock 开关，评分 / 指纹 / 头像 / 会员标 / LLM
// 全部与进群后逐字节同源。
//
// chat_join_request.user 与入群事件里的 member 同为 User 结构，可直接传入。
async function screenJoinRequestAd(env, user, chatId, chatTitle) {
	const userId = String(user?.id || '');
	if (!userId || user?.is_bot) return;
	if (!env?.DB) return;
	if (!(await adDetectionReady(env))) return;

	const verdict = await screenAdJoinMember(env, user, {
		chatId,
		chatTitle,
		messageId: null,			// 申请阶段没有消息可删
		skipBlacklistCheck: false,	// 已在 D1 黑名单的人由下面这一步拦，不必再筛一遍
		noBioLock: true,			// 被拒后等三天再申请就绕过去了，不能套这把锁
		source: 'join_request'
	});
	if (verdict !== 'banned') return;

	// enforceAdDetection 已经做过 banUserFromAllGroups：对【还不在群里】的人，
	// banChatMember 会把他加进群封禁列表（预封），申请随之失效、日后也进不来。
	// 再显式拒一次申请，是让审批列表里不留一个「点了同意也不生效」的死条目 ——
	// 管理员看到的应该是干净的列表，而不是一个需要他去猜的申请。
	await declineJoinRequest(env, chatId, userId);
	console.log('[申请筛查] 广告号在进群前被拦下 user=' + userId + ' chat=' + chatId);
}

// 拒绝一条入群申请。返回是否成功；失败只记日志 —— 预封已经生效，这一步只是收尾。
async function declineJoinRequest(env, chatId, userId) {
	try {
		const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/declineChatJoinRequest`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ chat_id: String(chatId), user_id: Number(userId) })
		});
		const result = await response.json();
		if (!result?.ok) {
			console.log('[申请筛查] 拒绝申请失败 chat=' + chatId + ' user=' + userId
				+ ' desc=' + (result?.description || ('HTTP ' + response.status)));
		}
		return result?.ok === true;
	} catch (error) {
		console.error('[申请筛查] 拒绝申请异常:', error);
		return false;
	}
}

// 汇总：某群某粒度的总发言、活跃人数、入群、退群、被移出。
async function queryStatSummary(env, chatId, range, nowMs = Date.now()) {
	const empty = { totalMsg: 0, activeUsers: 0, join: 0, leave: 0, kicked: 0 };
	if (!(await statReady(env))) return empty;
	const { start, end } = statRangeDays(env, range, nowMs);
	try {
		const s = await env.DB.prepare(
			'SELECT COALESCE(SUM(msg_count),0) AS total, COUNT(DISTINCT user_id) AS users '
			+ 'FROM stat_speech WHERE chat_id = ? AND day >= ? AND day <= ?'
		).bind(String(chatId), start, end).first();
		const m = await env.DB.prepare(
			'SELECT COALESCE(SUM(join_count),0) AS j, COALESCE(SUM(leave_count),0) AS l, COALESCE(SUM(kicked_count),0) AS k '
			+ 'FROM stat_member WHERE chat_id = ? AND day >= ? AND day <= ?'
		).bind(String(chatId), start, end).first();
		return {
			totalMsg: Number(s?.total) || 0,
			activeUsers: Number(s?.users) || 0,
			join: Number(m?.j) || 0,
			leave: Number(m?.l) || 0,
			kicked: Number(m?.k) || 0
		};
	} catch (error) { console.error('[群统计] 汇总查询失败:', error); return empty; }
}

// 发言排行分页。按发言数倒序，昵称取该人任一天的记录（同人昵称基本不变，MAX 足够）。
async function queryStatRanking(env, chatId, range, page = 1, nowMs = Date.now()) {
	if (!(await statReady(env))) return { ok: false, rows: [], total: 0, totalPages: 1 };
	const { start, end } = statRangeDays(env, range, nowMs);
	const limit = STAT_RANKING_PAGE_LIMIT;
	const safePage = Math.max(1, Number(page) || 1);
	try {
		const totalRow = await env.DB.prepare(
			'SELECT COUNT(*) AS c FROM (SELECT user_id FROM stat_speech WHERE chat_id = ? AND day >= ? AND day <= ? GROUP BY user_id)'
		).bind(String(chatId), start, end).first();
		const total = Math.min(STAT_RANKING_QUERY_CAP, Number(totalRow?.c) || 0);
		const totalPages = Math.max(1, Math.ceil(total / limit));
		const { results } = await env.DB.prepare(
			'SELECT user_id, SUM(msg_count) AS cnt, MAX(display_name) AS display_name, MAX(username) AS username '
			+ 'FROM stat_speech WHERE chat_id = ? AND day >= ? AND day <= ? '
			+ 'GROUP BY user_id ORDER BY cnt DESC, user_id ASC LIMIT ? OFFSET ?'
		).bind(String(chatId), start, end, limit, (safePage - 1) * limit).all();
		const rows = (results || []).map((r, i) => ({
			rank: (safePage - 1) * limit + i + 1,
			userId: String(r.user_id || ''),
			count: Number(r.cnt) || 0,
			displayName: String(r.display_name || ''),
			username: String(r.username || '')
		}));
		return { ok: true, rows, total, totalPages };
	} catch (error) { console.error('[群统计] 排行查询失败:', error); return { ok: false, rows: [], total: 0, totalPages: 1 }; }
}

// 剪枝：删除超过保留期的统计明细。cron 搭车执行。
async function pruneStatData(env, nowMs = Date.now()) {
	if (!env?.DB) return;
	const cutoff = statDayString(env, nowMs - STAT_RETENTION_DAYS * 86400000);
	try {
		if (!(await statReady(env))) return;
		await env.DB.batch([
			env.DB.prepare('DELETE FROM stat_speech WHERE day < ?').bind(cutoff),
			env.DB.prepare('DELETE FROM stat_member WHERE day < ?').bind(cutoff)
		]);
	} catch (error) { console.error('[群统计] 剪枝失败:', error); }

	// 处置 / 新人治理计数单独剪枝，且【单独一条语句】：
	// 它是懒建表，可能还没被建过（一次处置都没发生过），混进上面那个 batch
	// 会让「no such table」把发言与成员的剪枝一起回滚。
	// 留 180 天与 stat_speech / stat_member 同口径；剪掉的是计数行，不是事件明细
	//（入群/退群/申请的 stat_member_events 按主人要求永久不剪）。
	try {
		if (!(await ensureStatActionsTable(env))) return;
		await env.DB.prepare('DELETE FROM stat_actions WHERE day < ?').bind(cutoff).run();
	} catch (error) { console.error('[群统计] 处置计数剪枝失败:', error); }
}

// ===== /stats 命令层 =====
// 公开命令（展示在外、进 /help，不隐藏）：群内=本群管理员/群主可查，主人/副主人随时可查；
// 只汇总当前群，粒度 今日 / 本周 / 本月。排行 Top N + inline 翻页，复用广告翻页基建。
const STAT_PAGINATION_PREFIX = 'statpg:';
// 用法面板按钮：点一下【新发一条】对应范围的数据消息（不改面板），token=base64url(range|chatId)。
const STAT_GO_PREFIX = 'statgo:';
// 趋势页按钮：原地编辑成逐日列表，token=base64url(range|chatId)，range 供「返回统计」用。
const STAT_TREND_PREFIX = 'stattrend:';
// 群设置菜单页：token=base64url("<动作>|<chatId>")，动作 ∈ stats / profile / health。
const SETTINGS_MENU_PREFIX = 'menu:';

function isStatsCommand(text) {
	return typeof text === 'string' && /^\/stats(?:@[^\s]+)?(?:\s|$)/i.test(text.trim());
}

function isKillerCommand(text) {
	return typeof text === 'string' && /^\/killer(?:@[^\s]+)?(?:\s|$)/i.test(text.trim());
}

// /killer 杀手模式切换。仅第一主人；仅对 KILLER_MODE_GROUPS 里的群生效。返回 true 表示已处理。
// 群内：/killer 翻转当前群 ON/OFF；/killer on|off 显式设置；/killer status 只看不改。
// 私聊：列出所有杀手模式群的当前状态（不改）。非第一主人一律静默（不暴露命令存在）。
async function handleKillerCommand(message, env) {
	const userId = getMessageActorId(message);
	if (!isPrimaryOwner(userId)) return true; // 非第一主人：静默吞掉（群内不暴露、私聊不回）
	const chatId = String(message.chat?.id || '');
	const isInGroup = message.chat?.type !== 'private';
	const arg = String(message.text || '').replace(/^\/killer(?:@[^\s]+)?\s*/i, '').trim().toLowerCase();

	if (!isInGroup) {
		if (!KILLER_MODE_GROUPS.length) {
			await sendTelegramMessage(chatId, 'ℹ️ 未配置 <code>KILLER_MODE_GROUPS</code>，杀手模式功能未启用。');
			return true;
		}
		const stateMap = await readKillerStateMap(env);
		const lines = ['☠️ <b>杀手模式 · 各群状态</b>（在目标群内发 <code>/killer</code> 切换）'];
		for (const g of KILLER_MODE_GROUPS) {
			const on = stateMap.has(String(g)) ? stateMap.get(String(g)) === 1 : KILLER_MODE_DEFAULT_ON;
			// 额外显示群名（getChat 实时取；取不到就只显示 ID）。
			let title = '';
			try { const gi = await getChatInfoFromId(String(g)); title = String(gi?.title || ''); } catch (_) {}
			const label = title ? '<b>' + escapeHtml(title) + '</b> <code>' + escapeHtml(String(g)) + '</code>' : '<code>' + escapeHtml(String(g)) + '</code>';
			lines.push('• ' + label + '：' + (on ? '☠️ 开启（封禁踢出）' : '🔇 关闭（仅禁言）'));
		}
		await sendTelegramMessage(chatId, lines.join('\n'));
		return true;
	}

	if (!isKillerModeGroup(chatId)) {
		await sendTelegramMessage(chatId, '⚠️ 本群未启用杀手模式功能：请把本群 ID <code>' + escapeHtml(chatId) + '</code> 加进 <code>KILLER_MODE_GROUPS</code> 环境变量后重新初始化。');
		return true;
	}

	const currentlyOn = await isKillerOn(env, chatId);
	if (/^(status|状态)$/.test(arg)) {
		await sendTelegramMessage(chatId, currentlyOn ? '☠️ 当前：杀手模式【开启】（封禁踢出）' : '🔇 当前：杀手模式【关闭】（仅禁言不踢出）');
		return true;
	}
	let target;
	if (/^(on|开|开启|启用|封禁)$/.test(arg)) target = true;
	else if (/^(off|关|关闭|禁言|静音)$/.test(arg)) target = false;
	else target = !currentlyOn; // 裸 /killer = 翻转

	const r = await setKillerMode(env, chatId, target, userId);
	if (!r.ok) { await sendTelegramMessage(chatId, '❌ 切换失败：' + escapeHtml(toChineseErrorText(r.error || '未知错误'))); return true; }
	await sendTelegramMessage(chatId, target
		? '☠️ <b>杀手模式已开启</b>\n本群此后触发处置的用户将【全群封禁 + 踢出】。'
		: '🔇 <b>杀手模式已关闭</b>\n本群此后触发处置的用户【仅永久禁言、不踢出】，仍写入全局黑名单。');
	return true;
}
function isDryRunCommand(text) {
	return typeof text === 'string' && /^\/dryrun(?:@[^\s]+)?(?:\s|$)/i.test(text.trim());
}

// /dryrun 演练模式切换。仅第一主人（与 /killer 同一道门：敏感开关不放开给群管理员）。
// 返回 true = 本条已处理，调用方短路；非第一主人同样返回 true 但只静默吞掉，
// 不回任何话 —— 群里不暴露这条命令的存在。
// 群内：/dryrun 翻转本群；/dryrun on|off 显式设置；/dryrun status 只看不改。
// 私聊：列出已开演练的群与命中数（只读）。
// /dryrun 演练模式切换。仅第一主人（与 /killer 同一道门：敏感开关不放开给群管理员）。
// 返回 true = 本条已处理，调用方短路；非第一主人同样返回 true 但只静默吞掉，
// 不回任何话 —— 群里不暴露这条命令的存在。
// 群内：/dryrun 翻转本群；/dryrun on|off 显式设置；/dryrun status 只看不改。
// 私聊：列出已开演练的群与命中数（只读）。
// 群内回执发完立即撤回。它只为了让发送者看到「命令收到了」，下一毫秒就撤 ——
// 主人的口径是群里不留痕（命令与回执都清掉），完整信息另行推私聊。
async function sendAndRecall(chatId, text) {
	const sent = await sendTelegramMessage(chatId, text);
	const mid = sent?.result?.message_id;
	if (mid) await deleteMessage(chatId, mid);
	return sent;
}

// 群内回执已经撤了，不补这一份就等于什么都没发生 —— 完整信息必须到私聊。
async function pushDryRunDetail(chatId, text) {
	const ownerId = getOwnerNotifyTargets()[0] || "";
	// 私聊里操作的那条分支本来就在第一主人窗口里，再推一份是重复。
	if (!ownerId || String(ownerId) === String(chatId)) return;
	try {
		await sendTelegramMessage(ownerId, text);
	} catch (error) {
		console.error('[演练模式] 推送私聊详情失败:', error);
	}
}

async function handleDryRunCommand(message, env) {
	const userId = getMessageActorId(message);
	if (!isPrimaryOwner(userId)) return true;
	const chatId = String(message.chat?.id || '');
	const isInGroup = message.chat?.type !== 'private';
	const arg = String(message.text || '').replace(/^\/dryrun(?:@\[^\s]+)?\s*/i, '').trim().toLowerCase();

	if (!isInGroup) {
		const stateMap = await readDryRunStateMap(env);
		if (!stateMap.size) {
			await sendTelegramMessage(chatId, '🧪 当前没有任何群处于演练模式。到目标群内发 <code>/dryrun</code> 开启。');
			return true;
		}
		const lines = ['🧪 <b>演练模式 · 已开启的群</b>（在目标群内发 <code>/dryrun</code> 切换）'];
		for (const id of stateMap.keys()) {
			let title = '';
			try { const gi = await getChatInfoFromId(id); title = String(gi?.title || ""); } catch (_) {}
			const label = title
				? '<b>' + escapeHtml(title) + '</b> <code>' + escapeHtml(id) + '</code>'
				: '<code>' + escapeHtml(id) + '</code>';
			const counts = await countAdDryRun(env, id);
			lines.push('• ' + label + '：今日命中 ' + counts.today + ' 条（累计 ' + counts.total + '）');
		}
		lines.push('');
		lines.push('⚠️ 演练期间这些群不删不封，调完阈值记得回来关。');
		await sendTelegramMessage(chatId, lines.join('\n'));
		return true;
	}

	// 群内：回执发完立即撤回，同时把同一份完整信息补推到第一主人私聊。
	// 撤回命令本身用的是项目通用封装（防重复删标记在 message 上）。
	const reply = async (text, detail) => {
		await deleteAuthorizedGroupCommandMessage(message, 'dryrun');
		await sendAndRecall(chatId, text);
		await pushDryRunDetail(chatId, detail || text);
	};

	if (!isConfiguredGroup(chatId)) {
		await reply('⚠️ 本群不在配置群列表：请先在群里发 <code>/addgroup</code>，'
			+ '或把本群 ID 加进 <code>GROUP_IDS</code> 环境变量。本群本来就不做广告处置，开演练没有意义。');
		return true;
	}

	const currentlyOn = await isDryRunGroup(env, chatId);
	if (/^(status|状态)$/.test(arg)) {
		await reply(
			currentlyOn
				? '🧪 当前：演练模式【开启】—— 判定照跑，不删不封，但【当场就学特征】（全部配置群通用，入群申请那一步立刻生效），只写流水并私聊通知你。'
				: '✅ 当前：演练模式【关闭】—— 正常自动处置。');
		return true;
	}
	let target;
	if (/^(on|开|开启|启用)$/.test(arg)) target = true;
	else if (/^(off|关|关闭)$/.test(arg)) target = false;
	else target = !currentlyOn;   // 裸 /dryrun = 翻转

	// 关演练前先取开演练的时刻：setDryRun 会覆盖 dryrun_groups.at，晚一步就取不到
	// 「本轮」的窗口了。目标仍是「开」= 本轮没结束，不取。
	const openedAt = currentlyOn && !target ? await readDryRunOpenedAt(env, chatId) : '';
	const r = await setDryRun(env, chatId, target, userId);
	if (!r.ok) {
		await reply('❌ 切换失败：' + escapeHtml(toChineseErrorText(r.error || '未知错误')));
		return true;
	}
	const groupLabel = escapeHtml(String(message.chat?.title || '') || chatId);
	const counts = await countAdDryRun(env, chatId);
	// 关掉演练时给一份「这一轮学到什么」：演练当场就学，所以这份汇总就是判据库
	// 真实的增量，不是「本来会学」。
	let learnSummary = '';
	if (!target && openedAt) {
		const tally = await summarizeDryRunLearning(env, chatId, openedAt);
		learnSummary = '\n\n' + renderDryRunLearnSummary(tally);
	}
	const short = target
		? '🧪 <b>演练模式已开启</b>\n'
			+ '判定照常跑，本群【不删消息、不封禁、不加黑】，命中只写流水并私聊通知你。\n'
			+ '✅ 但当场就学特征：头像 / 会员标 / 资料形状 / 正文图片 / 指纹 / AI 样本 / 自举案底，\n'
			+ '学到的判据【全部配置群通用】，广告号在申请进群那一步就会被拦下。\n'
			+ '⚠️ 演练期间本群完全不设防，广告照发 —— 调完阈值记得再发一次 <code>/dryrun</code> 关闭。\n'
			+ '查看命中：<code>/adstats</code>'
	: '✅ <b>演练模式已关闭</b>\n本群恢复自动处置（加黑 + 全群封禁 + 删消息）。' + learnSummary;
	const detail = target
		? '<b>🧪 演练模式已开启</b>\n'
			+ '群：<b>' + groupLabel + '</b> <code>' + escapeHtml(chatId) + '</code>\n'
			+ '判定照常跑，本群【不删消息、不封禁、不加黑】，命中只写流水。\n'
			+ '✅ 但当场就学特征：头像 / 会员标 / 资料形状 / 正文图片 / 指纹 / AI 样本 / 自举案底。\n'
			+ '学到的判据【全部配置群通用】，广告号在申请进群那一步就会被拦下。\n'
			+ '本群命中：今日 ' + counts.today + ' 条，累计 ' + counts.total + ' 条。\n'
			+ '⚠️ 演练期间本群完全不设防，广告照发 —— 调完阈值记得再发一次 <code>/dryrun</code> 关闭。\n'
			+ '查看：<code>/adstats</code>'
		: '<b>✅ 演练模式已关闭</b>\n'
			+ '群：<b>' + groupLabel + '</b> <code>' + escapeHtml(chatId) + '</code>\n'
			+ '恢复自动处置（加黑 + 全群封禁 + 删消息）。' + learnSummary;
	await reply(short, detail);
	return true;
}
// 解析粒度参数：week/周 → 本周，month/月 → 本月，其余（含空）→ 今日。
// 解析 /stats 的时间范围参数。
// 返回 'day'/'week'/'month'；空参数或无法识别的参数返回 null，
// 由调用方决定「显示用法」还是「默认今日」。裸 /stats（null）在群内=显示用法。
function parseStatsRange(arg) {
	const raw = String(arg || '').trim();
	if (!raw) return null;
	// 绝对日期：'YYYY-MM-DD' 单日 / 'YYYY-MM-DD..YYYY-MM-DD' 区间（原样交给 resolveStatRange）
	if (/^\d{4}-\d{2}-\d{2}(\.\.\d{4}-\d{2}-\d{2})?$/.test(raw)) return raw;
	// 两个日期空格分隔：'2026-09-01 2026-09-15'（主人手打的习惯写法）→ 归一成 '..' 形式
	const dateList = raw.match(/\d{4}-\d{2}-\d{2}/g);
	if (dateList && dateList.length >= 2) return dateList[0] + '..' + dateList[1];
	const v = raw.toLowerCase();
	// 相对词必须排在 week/month/day 之前 —— 「上周」含「周」、「上月」含「月」，
	// 先判 /week|周/ 就会被误判成本周、自定义时间永远生效不了。
	if (v === 'yesterday' || raw === '昨天') return 'yesterday';
	if (v === 'd2' || raw === '前天') return 'd2';
	if (v === 'lastweek' || raw === '上周') return 'lastweek';
	if (v === 'lastmonth' || raw === '上月') return 'lastmonth';
	if (v === '7d' || v === 'last7d' || /^近\s*7\s*天$/.test(raw)) return '7d';
	if (v === '30d' || v === 'last30d' || /^近\s*30\s*天$/.test(raw)) return '30d';
	if (/week|周/.test(v)) return 'week';
	if (/month|月/.test(v)) return 'month';
	if (/today|day|今日|日/.test(v)) return 'day';
	return null;
}

// 群内 /stats 用法（不含私聊指定群那条——主人要求群里不展示）。
function buildGroupStatsUsage() {
	return [
		'📊 <b>群发言统计</b> · 用法',
		'统计本群真人发言数与进 / 退群人数，仅本群，按日 / 周 / 月汇总。',
		'',
		'• <code>/stats today</code> 今日',
		'• <code>/stats week</code>  本周',
		'• <code>/stats month</code> 本月',
		'• <code>/stats 昨天</code> · <code>前天</code> · <code>上周</code> · <code>上月</code>',
		'• <code>/stats 近7天</code> · <code>近30天</code>',
		'• <code>/stats 2026-09-10</code> 指定某天',
		'• <code>/stats 2026-09-01 2026-09-15</code> 指定区间',
		'',
		'下方按钮可切换常用区间。'
	].join('\n');
}

// 私聊 /stats 用法（仅主人 / 副主人，必须带配置群 ID）。
function buildPrivateStatsUsage() {
	return [
		'📊 <b>群发言统计</b> · 用法（私聊查指定群，仅主人 / 副主人）',
		'按日 / 周 / 月汇总，只统计该群。',
		'',
		'• <code>/stats -100群ID</code> 指定群今日　<code>week</code> 本周　<code>month</code> 本月',
		'• <code>/stats -100群ID 昨天</code> · <code>前天</code> · <code>上周</code> · <code>上月</code>',
		'• <code>/stats -100群ID 近7天</code> · <code>近30天</code>',
		'• <code>/stats -100群ID 2026-09-10</code>　指定某天',
		'• <code>/stats -100群ID 2026-09-01 2026-09-15</code>　指定区间'
	].join('\n');
}

// 群内用法面板按钮：今日 / 本周 / 本月。点一下由 handleStatsGoCallback 新发一条对应数据。
// callback_data 超 64 字节（群 ID 异常长）时整块放弃按钮，只留文字用法，绝不挂死按钮。
function buildStatsPanelKeyboard(chatId) {
	const mk = (label, r) => {
		const d = STAT_GO_PREFIX + encodeAdCallbackToken(r + '|' + String(chatId));
		return adCallbackDataFits(d) ? { text: label, callback_data: d } : null;
	};
	const row = [mk('📅 今日', 'day'), mk('📆 本周', 'week'), mk('🗓 本月', 'month')];
	return row.every(Boolean) ? { inline_keyboard: [row] } : null;
}

// 渲染一页统计（汇总 + 发言排行 + 翻页键盘）。命令首发与按钮翻页共用，排版一致。
// 【时间锚点只取一次】标题日期、汇总、排行必须落在同一天。原来三处各自取 Date.now()，
// 查询恰好跨过统计时区 0 点时，可能出现标题写 09-25、汇总或排行却按 09-24 算。
// 数据页键盘：时间切换行 + 多页时的翻页行。
// 【为什么时间切换走 statpg 而不是 statgo】statgo 是「面板保留、另发一条数据」，
// 原消息上的选中态 · 永远不会跟着变；statpg 是【原地编辑那条数据消息】，
// 切完立刻把新的 ·标到刚点的那个按钮上 —— 正是截图里「可点切换 + 当前态标记」的形态。
// 回调端零新增：handleStatsPaginationCallback 本来就按 token 里的 range 重查，只换了个 range。
function buildStatsDataKeyboard(chatId, range, page, totalPages, showMenuBack = false) {
	const mk = (label, r) => {
		// 只有 range 与按钮值完全相等才标选中态；自定义日期区间没有对应按钮，就没有 ·
		const text = (range === r ? '·' : '') + label;
		const data = STAT_PAGINATION_PREFIX + '1:' + encodeAdCallbackToken(r + '|' + String(chatId));
		return adCallbackDataFits(data) ? { text, callback_data: data } : null;
	};
	const rows = [];
	const row1 = [mk('今日', 'day'), mk('昨天', 'yesterday'), mk('前天', 'd2'), mk('本周', 'week')];
	const row2 = [mk('本月', 'month'), mk('近7天', '7d'), mk('近30天', '30d')];
	// 任一格塞不下（群 ID 异常长）就丢整行，避免半残键盘。
	if (row1.every(Boolean)) rows.push(row1);
	if (row2.every(Boolean)) rows.push(row2);
	// 趋势按钮：与时间切换不同前缀（stattrend:），点下去是原地编辑成逐日列表。
	const trendMk = (label, d) => {
		const data = STAT_TREND_PREFIX + d + ':' + encodeAdCallbackToken(range + '|' + String(chatId));
		return adCallbackDataFits(data) ? { text: label, callback_data: data } : null;
	};
	const row3 = [trendMk('📈 7天趋势', 7), trendMk('📈 30天趋势', 30)];
	if (row3.every(Boolean)) rows.push(row3);
	const pager = buildAdPaginationKeyboard(STAT_PAGINATION_PREFIX, page, totalPages,
		encodeAdCallbackToken(range + '|' + String(chatId)));
	if (pager && pager.inline_keyboard && pager.inline_keyboard[0]) rows.push(pager.inline_keyboard[0]);
	// 「返回群设置」排在最后（导航惯例），且只在第一主人打开时出现。
	if (showMenuBack) {
		const back = buildSettingsBackKeyboard(chatId);
		if (back) rows.push(back.inline_keyboard[0]);
	}
	return rows.length ? { inline_keyboard: rows } : null;
}

async function renderStatPage(env, chatId, range, page, chatTitle, nowMs = Date.now(), showMenuBack = false) {
	const info = statRangeDays(env, range, nowMs);
	// 四项互不依赖，并发取：成员总数是实时 API，其余三项各一条 SQL。
	const [summary, ranking, actions, memberCount] = await Promise.all([
		queryStatSummary(env, chatId, range, nowMs),
		queryStatRanking(env, chatId, range, page, nowMs),
		queryStatActions(env, chatId, info.start, info.end),
		fetchChatMemberCount(chatId)
	]);
	const scope = chatTitle ? escapeHtml(String(chatTitle)) : ('群 <code>' + escapeHtml(String(chatId)) + '</code>');
	const dateLabel = info.start === info.end ? info.start : (info.start + ' ~ ' + info.end);
	const net = summary.join - summary.leave;
	const netText = (net > 0 ? '+' : '') + net;
	const lines = [
		'📊 <b>群统计</b> · ' + scope,
		'📅 统计日期: <b>' + info.label + ' ' + dateLabel + '</b>　当前成员: <b>' + (memberCount == null ? '未知' : memberCount) + '</b>（北京时间）',
		'',
		'💡 本时段本群挡下 <b>' + actions.disposal + '</b> 次风险，其中新人处置 <b>' + actions.newcomer + '</b> 人。',
		'',
		'━━━ <b>活跃</b> ━━━',
		'💬 消息 <b>' + summary.totalMsg + '</b>　👥 活跃人数 <b>' + summary.activeUsers + '</b>',
		'━━━ <b>增长</b> ━━━',
		'➕ 新增 <b>' + summary.join + '</b>　➖ 离开 <b>' + summary.leave + '</b>　📈 净增 <b>' + netText + '</b>',
		'━━━ <b>风控</b> ━━━',
		// 被移出这一格保留：它是 Telegram 侧的口径（含人工手动踢），与 disposal（bot 处置）
		// 互补，去掉等于丢掉现有功能。方案表格的 8 指标里没有它，这里是按「不倒退」补上的第 9 项。
		'🛡 处置 <b>' + actions.disposal + '</b>　👶 新人治理 <b>' + actions.newcomer + '</b>　🚫 被移出 <b>' + summary.kicked + '</b>',
		''
	];
	if (!ranking.rows.length) {
		lines.push('（本时段暂无发言记录）');
	} else {
		lines.push('🏆 <b>发言排行</b>（第 ' + page + '/' + ranking.totalPages + ' 页）');
		for (const row of ranking.rows) {
			const label = row.displayName || (row.username ? '@' + row.username : row.userId);
			const link = '<a href="tg://user?id=' + escapeHtml(row.userId) + '">' + escapeHtml(label) + '</a>';
			const uname = (row.displayName && row.username) ? ' <code>@' + escapeHtml(row.username) + '</code>' : '';
			lines.push(row.rank + '. ' + link + uname + ' — ' + row.count + ' 条');
		}
	}
	const keyboard = buildStatsDataKeyboard(chatId, range, page, ranking.totalPages, showMenuBack);
	// 多块消息挂不上按钮（sendAdPagedMessage 的既有限制），退回文本提示。
	const fallbackLine = ranking.totalPages > 1
		? '翻页：<code>/stats ' + (range === 'day' ? '' : range + ' ') + '第 ' + Math.min(ranking.totalPages, page + 1) + ' 页需用按钮</code>'
		: '';
	return { text: lines.join('\n'), keyboard, fallbackLine, totalPages: ranking.totalPages };
}

// 趋势页键盘：切换天数 + 返回统计页。返回键带上原 range，回到的就是点进来之前的那个区间。
// callback 形如 stattrend:<天数>:<base64url "range|chatId">，或 statpg:1:<...> 用于返回。
function buildStatsTrendKeyboard(chatId, days, range) {
	const mk = (label, d) => {
		const text = (Number(days) === d ? '·' : '') + label;
		const data = STAT_TREND_PREFIX + d + ':' + encodeAdCallbackToken(range + '|' + String(chatId));
		return adCallbackDataFits(data) ? { text, callback_data: data } : null;
	};
	const back = (() => {
		const data = STAT_PAGINATION_PREFIX + '1:' + encodeAdCallbackToken(range + '|' + String(chatId));
		return adCallbackDataFits(data) ? { text: '↩️ 返回统计', callback_data: data } : null;
	})();
	const row1 = [mk('📈 7天趋势', 7), mk('📈 30天趋势', 30)];
	const rows = [];
	if (row1.every(Boolean)) rows.push(row1);
	if (back) rows.push([back]);
	return rows.length ? { inline_keyboard: rows } : null;
}

// 趋势页：逐日列表 + 汇总 + 环比（方案 a+b，不出图）。
async function renderStatTrend(env, chatId, days, range, chatTitle, nowMs = Date.now()) {
	const [cur, prev] = await Promise.all([
		queryStatTrend(env, chatId, days, nowMs),
		queryStatTrendPrev(env, chatId, days, nowMs)
	]);
	const scope = chatTitle ? escapeHtml(String(chatTitle)) : ('群 <code>' + escapeHtml(String(chatId)) + '</code>');
	const sum = (rows, key) => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
	const peak = (rows, key) => rows.reduce((a, r) => Math.max(a, Number(r[key]) || 0), 0);

	const curMsg = sum(cur.days, 'msg');
	const curJoin = sum(cur.days, 'join');
	const curLeave = sum(cur.days, 'leave');
	const curDisp = sum(cur.days, 'disposal');
	const curNew = sum(cur.days, 'newcomer');
	const peakActive = peak(cur.days, 'active');
	const avgMsg = cur.days.length ? Math.round(curMsg / cur.days.length) : 0;

	// 环比：百分比。上期为 0 时不编百分比 —— 「新增 / 上期无数据」比「∞%」诚实。
	const pct = (now, before) => {
		if (!before) return now ? '新增' : '持平';
		const v = ((now - before) / before) * 100;
		return (v > 0 ? '+' : '') + v.toFixed(0) + '%';
	};
	const prevMsg = sum(prev.days, 'msg');
	const prevJoin = sum(prev.days, 'join');
	const prevLeave = sum(prev.days, 'leave');
	const prevDisp = sum(prev.days, 'disposal');

	const lines = [
		'📈 <b>群统计</b> · ' + scope,
		'📅 近 <b>' + cur.days.length + '</b> 天　' + cur.start + ' ~ ' + cur.end + '（北京时间）',
		''
	];
	for (const r of cur.days) {
		// 每行只显示日期的 MM-DD（同一年内足够辨识），处置非 0 才占一格。
		const md = r.day.slice(5);
		let line = '<code>' + md + '</code>　💬 ' + r.msg + '　👥 ' + r.active
			+ '　➕' + r.join + ' ➖' + r.leave;
		if (r.disposal) line += '　🛡' + r.disposal;
		lines.push(line);
	}
	lines.push(
		'',
		'━━━ <b>汇总</b> ━━━',
		'💬 总发言 <b>' + curMsg + '</b>　日均 <b>' + avgMsg + '</b>　单日活跃峰值 <b>' + peakActive + '</b>',
		'➕ 新增 <b>' + curJoin + '</b>　➖ 离开 <b>' + curLeave + '</b>　📈 净增 <b>'
			+ ((curJoin - curLeave) > 0 ? '+' : '') + (curJoin - curLeave) + '</b>',
		'🛡 处置 <b>' + curDisp + '</b>　👶 新人治理 <b>' + curNew + '</b>',
		'',
		'━━━ <b>环比</b>（上一个 ' + prev.days.length + ' 天 ' + prev.start + ' ~ ' + prev.end + '）━━━',
		'💬 发言 ' + prevMsg + ' → ' + curMsg + '　<b>' + pct(curMsg, prevMsg) + '</b>',
		'➕ 新增 ' + prevJoin + ' → ' + curJoin + '　<b>' + pct(curJoin, prevJoin) + '</b>'
			+ '　➖ 离开 ' + prevLeave + ' → ' + curLeave + '　<b>' + pct(curLeave, prevLeave) + '</b>',
		'🛡 处置 ' + prevDisp + ' → ' + curDisp + '　<b>' + pct(curDisp, prevDisp) + '</b>'
	);
	return { text: lines.join('\n'), keyboard: buildStatsTrendKeyboard(chatId, days, range) };
}

// /stats 命令处理。返回 true 表示已处理。
async function handleStatsCommand(message, env, ctx) {
	const chat = message.chat;
	const isInGroup = chat.type !== 'private';
	const actorId = getMessageActorId(message);
	const rawId = message.from?.id;
	const rawArg = String(message.text || '').replace(/^\/stats(?:@[^\s]+)?\s*/i, '').trim();

	if (isInGroup) {
		// 群内只查本群，且必须是配置群（非配置群无统计数据）。
		if (!isConfiguredGroup(chat.id)) return true;
		// 权限：主人/副主人随时可查；否则必须是本群 Telegram 管理员/群主；普通成员静默（不回、不撤回）。
		const allowed = isPrivilegedManager(actorId) || (rawId && await checkIfUserIsAdminInGroup(rawId, chat.id));
		if (!allowed) return true;
		await deleteAuthorizedGroupCommandMessage(message, '/stats');
		// 裸 /stats（或无法识别的参数）= 只显示用法，不甩数据；今日数据走 /stats today。
		const range = parseStatsRange(rawArg);
		if (range === null) {
			await sendTelegramMessage(chat.id, buildGroupStatsUsage(), buildStatsPanelKeyboard(chat.id));
			return true;
		}
		// 第 6 个参数 nowMs 走默认值（命令层内部自己取时间），第 7 个是「要不要挂返回群设置」。
		const rendered = await renderStatPage(env, String(chat.id), range, 1, chat.title || '', undefined, isPrimaryOwner(actorId));
		await sendAdPagedMessage(chat.id, rendered.text, rendered.keyboard, rendered.fallbackLine);
		return true;
	}

	// 私聊：仅主人/副主人，需指定配置群 ID（私聊没有「当前群」）。
	if (!isPrivilegedManager(actorId)) {
		await sendTelegramMessage(chat.id, '❌ <b>权限不足</b>\n\n群内 /stats 限本群管理员/群主，私聊 /stats 限主人/副主人。');
		return true;
	}
	const parts = rawArg.split(/\s+/).filter(Boolean);
	const targetGroup = parts.find((p) => /^-\d+$/.test(p)) || '';
	// 私聊带群 ID 时默认查今日（range 为 null 回落 day）；不带群 ID = 显示用法。
	const range = parseStatsRange(parts.filter((p) => !/^-\d+$/.test(p)).join(' ')) || 'day';
	if (!targetGroup) {
		await sendTelegramMessage(chat.id, buildPrivateStatsUsage());
		return true;
	}
	if (!isConfiguredGroup(targetGroup)) {
		await sendTelegramMessage(chat.id, '⚠️ <code>' + escapeHtml(targetGroup) + '</code> 不在配置群范围，没有统计数据。');
		return true;
	}
	let title = '';
	try { const gi = await getChatInfoFromId(targetGroup); title = String(gi?.title || ''); } catch (_) {}
	const rendered = await renderStatPage(env, String(targetGroup), range, 1, title, undefined, isPrimaryOwner(actorId));
	await sendAdPagedMessage(chat.id, rendered.text, rendered.keyboard, rendered.fallbackLine);
	return true;
}

// /stats 翻页回调。data 形如 statpg:<页码>:<base64url "range|chatId">，或 statpg:noop。
async function handleStatsPaginationCallback(callbackQuery, env) {
	const data = String(callbackQuery?.data || '');
	const clickerId = String(callbackQuery?.from?.id || '');
	const body = data.slice(STAT_PAGINATION_PREFIX.length);
	if (body === 'noop') { await answerAdVoteCallback(callbackQuery?.id); return; }
	const match = body.match(/^(\d+):(.*)$/);
	if (!match) { await answerAdVoteCallback(callbackQuery?.id, '按钮数据已失效', true); return; }
	const page = Math.max(1, parseInt(match[1], 10) || 1);
	const token = decodeAdCallbackToken(match[2]);
	const sep = token.indexOf('|');
	const range = sep >= 0 ? token.slice(0, sep) : 'day';
	const statChatId = sep >= 0 ? token.slice(sep + 1) : '';
	if (!statChatId) { await answerAdVoteCallback(callbackQuery?.id, '按钮数据已失效', true); return; }
	// 权限复查（与 /stats 命令一致）：主人/副主人，或该统计群的管理员/群主。
	const allowed = isPrivilegedManager(clickerId) || await checkIfUserIsAdminInGroup(clickerId, statChatId);
	if (!allowed) { await answerAdVoteCallback(callbackQuery?.id, '仅限该群管理员或主人操作', true); return; }
	const msgChatId = String(callbackQuery?.message?.chat?.id || '');
	const messageId = Number(callbackQuery?.message?.message_id) || 0;
	let title = '';
	try { const gi = await getChatInfoFromId(statChatId); title = String(gi?.title || ''); } catch (_) {}
	const rendered = await renderStatPage(env, statChatId, range, page, title, undefined, isPrimaryOwner(clickerId));
	await editAdPagedMessage(msgChatId, messageId, rendered.text, rendered.keyboard);
	await answerAdVoteCallback(callbackQuery?.id);
}

// 用法面板按钮回调：点「今日/本周/本月」→ 复查权限后【新发一条】对应数据消息（面板保留、可连点）。
// 与翻页回调的区别：翻页是原地编辑那条数据；这里是发新消息，不动面板。
async function handleStatsGoCallback(callbackQuery, env) {
	const data = String(callbackQuery?.data || '');
	const clickerId = String(callbackQuery?.from?.id || '');
	const token = decodeAdCallbackToken(data.slice(STAT_GO_PREFIX.length));
	const sep = token.indexOf('|');
	const range = sep >= 0 ? token.slice(0, sep) : 'day';
	const statChatId = sep >= 0 ? token.slice(sep + 1) : '';
	if (!statChatId) { await answerAdVoteCallback(callbackQuery?.id, '按钮数据已失效', true); return; }
	// 权限复查（与 /stats 命令一致）：主人/副主人，或该群管理员/群主。
	const allowed = isPrivilegedManager(clickerId) || await checkIfUserIsAdminInGroup(clickerId, statChatId);
	if (!allowed) { await answerAdVoteCallback(callbackQuery?.id, '仅限该群管理员或主人操作', true); return; }
	let title = '';
	try { const gi = await getChatInfoFromId(statChatId); title = String(gi?.title || ''); } catch (_) {}
	const rendered = await renderStatPage(env, statChatId, range, 1, title, undefined, isPrimaryOwner(clickerId));
	// 【原地编辑】原来是 sendAdPagedMessage 新发一条（面板不动、数据挂在下方），
	// 与「按钮都在当前层返回、不新开另一条回复」冲突，改成与趋势页同款的原地编辑。
	const msgChatId = String(callbackQuery?.message?.chat?.id || statChatId);
	const messageId = Number(callbackQuery?.message?.message_id) || 0;
	await editAdPagedMessage(msgChatId, messageId, rendered.text, rendered.keyboard);
	await answerAdVoteCallback(callbackQuery?.id);
}

// 趋势按钮回调：原地把那条统计消息编辑成逐日列表。权限复查与 /stats、翻页回调完全一致。
// data 形如 stattrend:<天数>:<base64url "range|chatId">（range 供「返回统计」键还原区间）。
async function handleStatsTrendCallback(callbackQuery, env) {
	const data = String(callbackQuery?.data || '');
	const clickerId = String(callbackQuery?.from?.id || '');
	const body = data.slice(STAT_TREND_PREFIX.length);
	const match = body.match(/^(\d+):(.*)$/);
	if (!match) { await answerAdVoteCallback(callbackQuery?.id, '按钮数据已失效', true); return; }
	const days = Math.max(1, Math.min(365, parseInt(match[1], 10) || 7));
	const token = decodeAdCallbackToken(match[2]);
	const sep = token.indexOf('|');
	const range = sep >= 0 ? token.slice(0, sep) : 'day';
	const statChatId = sep >= 0 ? token.slice(sep + 1) : '';
	if (!statChatId) { await answerAdVoteCallback(callbackQuery?.id, '按钮数据已失效', true); return; }
	// 权限复查（与 /stats 命令一致）：主人/副主人，或该统计群的管理员/群主。
	const allowed = isPrivilegedManager(clickerId) || await checkIfUserIsAdminInGroup(clickerId, statChatId);
	if (!allowed) { await answerAdVoteCallback(callbackQuery?.id, '仅限该群管理员或主人操作', true); return; }
	const msgChatId = String(callbackQuery?.message?.chat?.id || '');
	const messageId = Number(callbackQuery?.message?.message_id) || 0;
	let title = '';
	try { const gi = await getChatInfoFromId(statChatId); title = String(gi?.title || ''); } catch (_) {}
	const rendered = await renderStatTrend(env, statChatId, days, range, title);
	await editAdPagedMessage(msgChatId, messageId, rendered.text, rendered.keyboard);
	await answerAdVoteCallback(callbackQuery?.id);
}

// 群设置菜单页回调：原地在「菜单 ↔ 子页面」之间切换。
// data 形如 menu:<base64url "动作|chatId">，动作 ∈ root(回菜单) / stats / profile / health。
// 【仅第一主人】菜单页本身就是仅第一主人的入口，回调端必须复查 ——
// 按钮消息可能被转发出去，不能只靠「发起时是第一主人」。
async function handleMenuCallback(callbackQuery, env) {
	const data = String(callbackQuery?.data || '');
	const clickerId = String(callbackQuery?.from?.id || '');
	if (!isPrimaryOwner(clickerId)) { await answerAdVoteCallback(callbackQuery?.id, '仅限第一主人', true); return; }
	const token = decodeAdCallbackToken(data.slice(SETTINGS_MENU_PREFIX.length));
	// 页码指示位（第 x/y 页）点了什么都不做，只要应答，否则 Telegram 会一直转圈。
	if (token === 'noop') { await answerAdVoteCallback(callbackQuery?.id); return; }
	// token 支持第三段页码：action|chatId[|page]。既有 token 只有两段，split 后
	// parts[2] 是 undefined → parseInt 得 NaN → 回落 1，老按钮行为完全不变。
	const parts = String(token || '').split('|');
	const action = parts[0] || 'root';
	const statChatId = parts[1] || '';
	const page = Math.max(1, parseInt(parts[2], 10) || 1);
	if (!statChatId) { await answerAdVoteCallback(callbackQuery?.id, '按钮数据已失效', true); return; }

	const msgChatId = String(callbackQuery?.message?.chat?.id || '');
	const messageId = Number(callbackQuery?.message?.message_id) || 0;
	let title = '';
	if (isConfiguredGroup(statChatId)) {
		try { const gi = await getChatInfoFromId(statChatId); title = String(gi?.title || ''); } catch (_) {}
	}

	let text = '';
	let keyboard = null;
	if (action === 'root') {
		const menu = renderGroupSettingsMenu(statChatId, title);
		text = menu.text; keyboard = menu.keyboard;
	} else if (action === 'stats') {
		// 从菜单进入 → 必挂「返回群设置」（本回调已确认是第一主人）。
		const r = await renderStatPage(env, statChatId, 'day', 1, title, undefined, true);
		text = r.text; keyboard = r.keyboard;
	} else if (action === 'health') {
		const report = await runHealthCheck(env);
		text = renderHealthReport(report);
		keyboard = buildSettingsBackKeyboard(statChatId);
	} else if (action === 'profile') {
		const hint = renderProfileHint(statChatId, title);
		text = hint.text; keyboard = hint.keyboard;
	} else if (action === 'pk') {
		// 首页（群选择 + 添加按钮）。statChatId 只是 token 占位，首页本身不依赖某个群。
		const home = await renderOwnerHome(env);
		text = home.text; keyboard = home.keyboard;
	} else if (action === 'sm') {
		const sub = renderStatsSubmenu(statChatId, title);
		text = sub.text; keyboard = sub.keyboard;
	} else {
		const entry = STATS_PANEL_ENTRIES.find((e) => e.action === action);
		if (!entry) {
			await answerAdVoteCallback(callbackQuery?.id, '按钮数据已失效', true); return;
		}
		const r = await renderStatsSubPage(env, statChatId, entry.kind, title, page);
		text = r.text; keyboard = r.keyboard;
	}
	await editAdPagedMessage(msgChatId, messageId, text, keyboard);
	await answerAdVoteCallback(callbackQuery?.id);
}

// /search 翻页回调：原地编辑成下一页。data 形如 searchpg:<页>:<base64url "类型|值|范围">。
// 权限与命令端完全一致地重查一遍 —— 按钮消息可能被转发，不能只靠发起时验过。
async function handleSearchPaginationCallback(callbackQuery, env) {
	const data = String(callbackQuery?.data || '');
	const clickerId = String(callbackQuery?.from?.id || '');
	const body = data.slice(SEARCH_PREFIX.length);
	if (body === 'noop') { await answerAdVoteCallback(callbackQuery?.id); return; }
	const match = body.match(/^(\d+):(.*)$/);
	if (!match) { await answerAdVoteCallback(callbackQuery?.id, '按钮数据已失效', true); return; }
	const page = Math.max(1, parseInt(match[1], 10) || 1);
	const parts = decodeAdCallbackToken(match[2]).split('|');
	const kind = parts[0] || 'keyword';
	const value = parts[1] || '';
	const scope = parts[2] || 'all';
	if (!value) { await answerAdVoteCallback(callbackQuery?.id, '按钮数据已失效', true); return; }

	// 权限复查：'all' 表示私聊发起的跨群搜索（只有第一主人），否则按群判群主。
	if (scope === 'all') {
		if (!isPrimaryOwner(clickerId)) { await answerAdVoteCallback(callbackQuery?.id, '仅限第一主人或该群群主', true); return; }
	} else if (!(await canUseSearch(clickerId, scope))) {
		await answerAdVoteCallback(callbackQuery?.id, '仅限第一主人或该群群主', true);
		return;
	}

	const scopeChatIds = scope === 'all' ? GROUP_IDS.map(String) : [String(scope)];
	let userIdFilter = null;
	let keywordFilter = null;
	let queryLabel = '';
	if (kind === 'user') { userIdFilter = value; queryLabel = '发送者 <code>' + escapeHtml(value) + '</code>'; }
	else if (kind === 'username') {
		userIdFilter = await resolveUsernameToUserId(env, value);
		if (!userIdFilter) { await answerAdVoteCallback(callbackQuery?.id, '没有该用户名的记录', true); return; }
		queryLabel = '@' + escapeHtml(value) + '（<code>' + escapeHtml(userIdFilter) + '</code>）';
	} else { keywordFilter = value; queryLabel = '关键词「' + escapeHtml(value) + '」'; }

	const result = await runSearchMessages(env, {
		chatIds: scopeChatIds, userId: userIdFilter, keyword: keywordFilter, page
	});
	const msgChatId = String(callbackQuery?.message?.chat?.id || '');
	const messageId = Number(callbackQuery?.message?.message_id) || 0;
	let scopeLabel = scope === 'all' ? '全部配置群' : '';
	if (scope !== 'all') {
		try { const gi = await getChatInfoFromId(scope); scopeLabel = String(gi?.title || '') || ('群 <code>' + escapeHtml(scope) + '</code>'); }
		catch (_) { scopeLabel = '群 <code>' + escapeHtml(scope) + '</code>'; }
	}
	const text = renderSearchResult({
		scopeLabel, queryLabel, rows: result.rows, total: result.total, page,
		totalPages: result.totalPages, showChatId: scope === 'all',
		historyNote: searchHistoryNote(scopeChatIds)
	});
	const keyboard = buildAdPaginationKeyboard(SEARCH_PREFIX, page, result.totalPages,
		encodeAdCallbackToken([kind, value, scope].join('|')));
	await editAdPagedMessage(msgChatId, messageId, text, keyboard);
	await answerAdVoteCallback(callbackQuery?.id);
}
