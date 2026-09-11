// 只读资料群（PROFILE_LOOKUP_GROUPS）· 离线验证
// 核心验证点不是「能不能查到资料」，而是【治理隔离】——
// 这些群绝不能被 isConfiguredGroup 认作配置群，否则等于把封禁能力和命令权限
// 一起开放给了一个本来只想借来查昵称的群。
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync('_worker.js', 'utf8');
const calls = [];

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		calls.push({ method: m, chatId: String(b?.chat_id ?? ''), userId: String(b?.user_id ?? '') });
		let payload = { ok: true, result: true };
		if (m === 'getChatAdministrators') {
			// 治理群 -100111 有管理员 5001；只读资料群 -100999 的管理员列表里没有 7002
			payload = String(b?.chat_id) === '-100111'
				? { ok: true, result: [{ status: 'administrator', user: { id: 5001, first_name: '治理群管理员', username: 'gov_admin' } }] }
				: { ok: true, result: [] };
		} else if (m === 'getChatMember') {
			// 7002 只在只读资料群里，且只是普通成员 —— 这是本功能的主场景
			if (String(b?.chat_id) === '-100999' && String(b?.user_id) === '7002') {
				payload = { ok: true, result: { status: 'member', user: { id: 7002, first_name: '威廉', last_name: '', username: 'RealNeoMan' } } };
			} else {
				payload = { ok: false, description: 'Bad Request: user not found' };
			}
		} else if (m === 'getChat') {
			// -100111 公开群（有 username → 可跳转）；-100222 私密群（无 username 也无 invite_link）
			payload = String(b?.chat_id) === '-100111'
				? { ok: true, result: { id: -100111, title: '老王技术交流分享群', type: 'supergroup', username: 'laowang' } }
				: { ok: true, result: { id: Number(b?.chat_id), title: '私密群', type: 'supergroup' } };
		} else if (m === 'sendMessage') {
			payload = { ok: true, result: { message_id: 1 } };
		}
		return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.replace(/export\s+default\s*/, 'globalThis.__h = '), sandbox, { filename: '_worker.js' });
const W = sandbox;

let pass = 0;
let fail = 0;
function check(label, cond, extra) {
	if (cond) { pass += 1; console.log('  ✅ ' + label + (extra ? '  ' + extra : '')); }
	else { fail += 1; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
}

console.log('\n=== 1. 环境变量解析 ===');
check('逗号分隔正常解析', JSON.stringify(W.parseProfileLookupGroups('-100999,-100888', [])) === '["-100999","-100888"]');
check('全角逗号兼容', JSON.stringify(W.parseProfileLookupGroups('-100999，-100888', [])) === '["-100999","-100888"]');
check('留空返回空数组', JSON.stringify(W.parseProfileLookupGroups('', [])) === '[]');
check('未配置返回空数组', JSON.stringify(W.parseProfileLookupGroups(undefined, [])) === '[]');
check('正数（用户ID误填）被剔除', JSON.stringify(W.parseProfileLookupGroups('123456,-100999', [])) === '["-100999"]');
check('非法值被剔除', JSON.stringify(W.parseProfileLookupGroups('abc,-100999, ,-x', [])) === '["-100999"]');
check('去重', JSON.stringify(W.parseProfileLookupGroups('-100999,-100999', [])) === '["-100999"]');
check('已在 GROUP_ID 的群被剔除（避免重复请求）',
	JSON.stringify(W.parseProfileLookupGroups('-100111,-100999', ['-100111'])) === '["-100999"]');

console.log('\n=== 2. 治理隔离（本功能最关键的安全属性）===');
const env = {
	TOKEN: 'T', BOT_TOKEN: '1:x',
	GROUP_ID: '-100111,-100222',
	PROFILE_LOOKUP_GROUPS: '-100999',
	OWNER_IDS: '10001'
};
W.applyRuntimeConfig(W.loadRequiredConfig(env));
// 注：GROUP_IDS / PROFILE_LOOKUP_GROUPS 是 let 声明的模块级变量，不挂 vm 沙箱全局
//（读出来是 undefined），所以这里一律断言【可观测行为】而不是变量本身 ——
// 行为断言反而更严：它验证的是「治理逻辑到底认不认这个群」，而非变量长什么样。
check('loadRequiredConfig 把只读资料群与治理群分开返回',
	JSON.stringify(W.loadRequiredConfig(env).GROUP_IDS) === '["-100111","-100222"]'
	&& JSON.stringify(W.loadRequiredConfig(env).PROFILE_LOOKUP_GROUPS) === '["-100999"]',
	'GROUP_IDS=' + JSON.stringify(W.loadRequiredConfig(env).GROUP_IDS)
	+ ' LOOKUP=' + JSON.stringify(W.loadRequiredConfig(env).PROFILE_LOOKUP_GROUPS));
check('只读资料群未被并入治理群列表',
	!W.loadRequiredConfig(env).GROUP_IDS.includes('-100999'));
check('isConfiguredGroup 认治理群', W.isConfiguredGroup('-100111') === true);
check('isConfiguredGroup【不认】只读资料群 → 封禁/检测/鉴权全部隔离',
	W.isConfiguredGroup('-100999') === false);

console.log('\n=== 3. 治理路径不会碰只读资料群 ===');
// checkIfUserIsAdminInGroup 是 /ban /spam 的鉴权入口，第一行就是 isConfiguredGroup 判断。
// 只读资料群不过这道门 → 该群管理员拿不到任何封禁权限。
calls.length = 0;
const authInLookup = await W.checkIfUserIsAdminInGroup('5001', '-100999');
check('只读资料群内无法通过封禁命令鉴权', authInLookup === false);
check('鉴权被前置拦下，未发出任何 API 请求', calls.length === 0, '请求数 ' + calls.length);

console.log('\n=== 4. /admins 资料查询覆盖只读资料群 ===');
calls.length = 0;
// 7002 只存在于只读资料群、且只是普通成员 —— 改动前这个人查不到，只能显示「未获取」
const profiles = await W.resolvePermissionUserProfiles(['5001', '7002']);
const p7002 = profiles.get('7002');
check('查到只在只读资料群里的普通成员', Boolean(p7002), p7002 ? '昵称=' + p7002.user.first_name : '未查到');
check('昵称正确', p7002?.user?.first_name === '威廉');
check('用户名正确', p7002?.user?.username === 'RealNeoMan');
check('来源群指向只读资料群', p7002?.groupId === '-100999', '来源=' + p7002?.groupId);
check('走的是 getChatMember 一轨（getChatAdministrators 查不到普通成员）',
	p7002?.source === 'getChatMember', 'source=' + p7002?.source);
const p5001 = profiles.get('5001');
check('治理群管理员照常查到（原有行为未变）', p5001?.user?.username === 'gov_admin');
check('治理群优先：管理员来源群仍是治理群', p5001?.groupId === '-100111', '来源=' + p5001?.groupId);
const lookupCalls = calls.filter((c) => c.chatId === '-100999');
check('只读资料群确实被查询了', lookupCalls.length > 0, '请求数 ' + lookupCalls.length);

console.log('\n=== 5. 未配置时行为完全不变（向后兼容）===');
W.applyRuntimeConfig(W.loadRequiredConfig({
	TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: '-100111,-100222', OWNER_IDS: '10001'
}));
check('未配置 → 解析结果为空数组', JSON.stringify(W.loadRequiredConfig({
	TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: '-100111,-100222', OWNER_IDS: '10001'
}).PROFILE_LOOKUP_GROUPS) === '[]');
calls.length = 0;
const profiles2 = await W.resolvePermissionUserProfiles(['7002']);
check('未配置时查不到只读群里的人（回到改动前行为）', !profiles2.get('7002'));
check('未配置时不会请求任何非治理群',
	calls.every((c) => ['-100111', '-100222'].includes(c.chatId)),
	'涉及群 ' + [...new Set(calls.map((c) => c.chatId))].join(','));

console.log('\n=== 6. 与 STATIC_USER_PROFILES 的优先级 ===');
W.applyRuntimeConfig(W.loadRequiredConfig({
	TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: '-100111', OWNER_IDS: '10001',
	PROFILE_LOOKUP_GROUPS: '-100999',
	STATIC_USER_PROFILES: '{"7002":{"first_name":"静态旧昵称","username":"old_handle"}}'
}));
const profiles3 = await W.resolvePermissionUserProfiles(['7002']);
const p3 = profiles3.get('7002');
check('实时查询结果覆盖静态兜底（昵称改了会自动更新）',
	p3?.user?.first_name === '威廉' && p3?.source === 'getChatMember',
	'昵称=' + p3?.user?.first_name + ' source=' + p3?.source);

console.log('\n=== 7. 来源群显示群名 + 可点击跳转 ===');
{
	// 公开群（有 username）→ t.me 永久链接，一定可跳转
	const pub = W.renderPermissionGroupText('-100111', { title: '老王技术交流分享群', url: 'https://t.me/laowang' });
	check('公开群：群名做成超链接', pub.includes('<a href="https://t.me/laowang">老王技术交流分享群</a>'), pub);
	check('公开群：ID 仍保留（排查时要复制）', pub.includes('<code>-100111</code>'), pub);
	// 私密群且 bot 非管理员 → 拿不到 invite_link，只显示群名
	const priv = W.renderPermissionGroupText('-100222', { title: '私密群', url: '' });
	check('私密群：只显示群名不做链接', priv.includes('私密群') && !priv.includes('<a href'), priv);
	check('私密群：ID 仍保留', priv.includes('<code>-100222</code>'), priv);
	// 查不到群资料 → 回落纯 ID，与改动前显示一致
	const fallback = W.renderPermissionGroupText('-100333', undefined);
	check('查不到群资料时回落纯 ID（不比改动前更难读）', fallback === '<code>-100333</code>', fallback);
	// 群名里的 HTML 特殊字符必须转义，否则会破坏 parse_mode=HTML 整条消息
	const risky = W.renderPermissionGroupText('-100444', { title: '<b>群&名</b>', url: 'https://t.me/x?a=1&b=2' });
	check('群名 HTML 转义（防破坏整条消息）', risky.includes('&lt;b&gt;群&amp;名&lt;/b&gt;'), risky);
	check('链接 URL 也转义', risky.includes('a=1&amp;b=2'), risky);
	// resolveChatInviteUrl 的两条路径
	check('resolveChatInviteUrl：公开群走 t.me/username',
		W.resolveChatInviteUrl({ username: 'laowang' }) === 'https://t.me/laowang');
	check('resolveChatInviteUrl：无 username 时用 invite_link',
		W.resolveChatInviteUrl({ invite_link: 'https://t.me/+abcdef' }) === 'https://t.me/+abcdef');
	check('resolveChatInviteUrl：两者都无则返回空（不硬造链接）',
		W.resolveChatInviteUrl({}) === '');
	// 去重：同一个群在名单里出现多次，只应查一次
	calls.length = 0;
	const labels = await W.resolvePermissionGroupLabels(['-100111', '-100111', '-100111', '-100222']);
	const getChatCalls = calls.filter((c) => c.method === 'getChat');
	check('同群去重：3 次重复只查 1 次', getChatCalls.length === 2, 'getChat 调用 ' + getChatCalls.length + ' 次');
	// 不用 instanceof Map —— vm 沙箱里的 Map 与宿主 realm 的 Map 不是同一个构造器，
	// instanceof 必然为 false。改成验证实际可用性（鸭子类型），这才是调用方真正依赖的。
	check('返回值可按群 ID 取到群名', labels?.get?.('-100111')?.title === '老王技术交流分享群',
		JSON.stringify(labels?.get?.('-100111')));
	check('返回值可按群 ID 取到跳转链接', labels?.get?.('-100111')?.url === 'https://t.me/laowang');
}

console.log('\n' + '='.repeat(52));
console.log('只读资料群验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail > 0 ? 1 : 0);
