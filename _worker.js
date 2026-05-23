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
	manual_ban: '管理员手动封禁（自动同步）'
};

// 6) GKY 封禁记录查询后端。改动者请确保返回 HTML 与 parseBanlistHTML 兼容。
//    环境变量名：GKY_BANLIST_ENDPOINT
const DEFAULT_GKY_BANLIST_ENDPOINT = 'https://gkybot.gmeow.cc/banlist';

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
					await handleMessage(update.message, env);
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

	// GROUP_ID 支持逗号分隔多群组，第一个作为主群
	const groupIds = String(env.GROUP_ID)
		.split(',')
		.map((id) => id.trim())
		.filter((id) => id !== '');

	if (groupIds.length === 0) {
		throw new Error('GROUP_ID is empty after parsing');
	}

	// 去重，保持顺序
	const uniqueGroupIds = [...new Set(groupIds)];

	// SUPER_ADMINS 可选，逗号分隔 TGID
	const superAdmins = env.SUPER_ADMINS
		? [...new Set(
			String(env.SUPER_ADMINS)
				.split(',')
				.map((id) => id.trim())
				.filter((id) => /^\d+$/.test(id))
		)]
		: [];

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

	return {
		TOKEN: String(env.TOKEN).trim(),
		BOT_TOKEN: String(env.BOT_TOKEN).trim(),
		GROUP_IDS: uniqueGroupIds,
		GROUP_ID: uniqueGroupIds[0],
		SUPER_ADMINS: superAdmins,
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

// 添加用户到黑名单
// options: { reason, by } —— reason 是封禁原因，by 是操作人 TGID
// 写入策略：D1 / KV 任一存在即可写入；都绑定时 D1 为权威，写完后镜像到 KV
async function addToBlacklist(userId, env, options = {}) {
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
			await mirrorToKV(env);
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

// 从黑名单中移除用户
async function removeFromBlacklist(userId, env) {
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
			await mirrorToKV(env);
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

	// 跳过：操作人是被操作用户本人（用户自愿 leave 不算管理员动作）
	if (targetIdStr === fromIdStr) return;

	// 跳过：操作人是机器人自己（避免与自助解封形成循环）
	const selfBotId = await getBotId();
	if (selfBotId && fromIdStr === String(selfBotId)) return;

	// 跳过：被操作用户是机器人（不要把别的机器人加入黑名单）
	if (targetUser.is_bot) return;

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
	} else if (oldStatus === 'kicked') {
		// 管理员手动解封 → 移黑（仅当原本在黑名单里才会有变化）
		const result = await removeFromBlacklist(targetIdStr, env);
		console.log('[chat_member] 同步移黑:', JSON.stringify({ ...logCommon, 结果: result.success ? '已移除' : result.message }));
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
		} else {
			await answerCallbackQuery(cb.id, `❌ 代发失败: ${result.description || '未知错误'}`, true);
			console.error('[callback_query] 代发失败:', result);
		}
	} catch (error) {
		await answerCallbackQuery(cb.id, '❌ 代发异常', true);
		console.error('[callback_query] 代发异常:', error);
	}
}

async function handleMessage(message, env) {
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
			await sendTelegramMessage(chatId, `✅ 已将用户 ${linkedUserId} 添加到黑名单`);
		} else {
			await sendTelegramMessage(chatId, `${result.message}\nTG ID: ${linkedUserId}`);
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

	// 处理 /ban 命令 - 添加用户到黑名单
	if (text && text.startsWith('/ban ')) {
		// 检查是否是私聊
		if (message.chat.type !== 'private') {
			return; // 非私聊不予回复
		}

		// 检查是否是群组管理员
		const isAdmin = await checkIfUserIsAdmin(userId);
		if (!isAdmin) {
			await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限群组管理员使用。');
			return;
		}

		// 提取要封禁的用户ID
		const parts = text.split(' ');
		if (parts.length < 2) {
			await sendTelegramMessage(chatId, '❌ 使用方法: <code>/ban 用户ID</code>');
			return;
		}

		const targetUserId = parts[1].trim();
		if (!/^\d+$/.test(targetUserId)) {
			await sendTelegramMessage(chatId, '❌ 用户ID必须是数字');
			return;
		}

		// 添加到黑名单
		const result = await addToBlacklist(targetUserId, env, { reason: 'manual', by: userId });
		await sendTelegramMessage(chatId, result.message);
		return;
	}

	// 处理 /unban 命令 - 从黑名单移除或显示欢迎消息
	if (text && text.startsWith('/unban')) {
		const parts = text.split(' ');
		
		// 如果有参数，处理黑名单移除
		if (parts.length > 1 && parts[1].trim()) {
			// 检查是否是私聊
			if (message.chat.type !== 'private') {
				return; // 非私聊不予回复
			}

			// 检查是否是群组管理员
			const isAdmin = await checkIfUserIsAdmin(userId);
			if (!isAdmin) {
				await sendTelegramMessage(chatId, '❌ <b>权限不足</b>\n\n此功能仅限群组管理员使用。');
				return;
			}

			const targetUserId = parts[1].trim();
			if (!/^\d+$/.test(targetUserId)) {
				await sendTelegramMessage(chatId, '❌ 用户ID必须是数字');
				return;
			}

			// 从黑名单移除
			const result = await removeFromBlacklist(targetUserId, env);
			await sendTelegramMessage(chatId, result.message);
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
async function checkIfUserIsAdmin(userId) {
	for (const groupId of GROUP_IDS) {
		try {
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
				console.error(`检查管理员权限失败 (group ${groupId}):`, result);
				continue;
			}

			const status = result.result.status;
			const isAdmin = status === 'creator' || status === 'administrator';

			console.log(`用户 ${userId} 在群 ${groupId} 的权限状态: ${status}, 是否为管理员: ${isAdmin}`);

			if (isAdmin) {
				return true;
			}
		} catch (error) {
			console.error(`检查管理员权限时出错 (group ${groupId}):`, error);
		}
	}
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
