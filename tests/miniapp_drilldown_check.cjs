// 主子后台「点击展示内容」浏览器检查（方案 C 分批，2026-10-24）
// 真 Chrome 打开两个后台页面，接口全部 mock，只测点下去之后有没有展示对应内容。
// 批次 1（纯前端，不加接口）：
//   主后台：运行检查三个数字点开筛选对应状态行；权限名单每个人点开查用户；
//           待复核数字点开滚到待复核列表；发言检索每条结果点开查发言人
//   杀手后台：发言排行每行点开查用户；发言检索每条结果点开查发言人；
//           发言 / 活跃人数点开滚到排行
//   所有可点项都能用键盘（Enter）触发
// 依赖本机 playwright-core 与 Chrome（同 miniapp_browser_check.cjs）：
//   NODE_PATH=<playwright-core 所在目录> node miniapp_drilldown_check.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const { chromium } = require('playwright-core');

const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, URL, URLSearchParams, Request, Response, Headers, TextEncoder, TextDecoder, AbortController, crypto: globalThis.crypto, setTimeout, clearTimeout, fetch: async () => { throw new Error('Unexpected network call'); } });
new vm.Script(fs.readFileSync(require('node:path').join(__dirname, '..', '_worker.js'), 'utf8').replace('export default {', 'globalThis.__handler = {')).runInContext(ctx);
const mainHtml = ctx.renderMiniAppHtml();
const killerHtml = ctx.renderKillerMiniAppHtml();

let pass = 0, fail = 0;
function check(name, cond, detail) {
	if (cond) { pass++; console.info('  ✅ ' + name); }
	else { fail++; console.info('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

const calls = [];
let lastStats = null, lastMembers = null, lastAdsQuery = null, lastGroupDetail = null;
let wlList = ['720003'];
const wlCalls = [];
const fpRows = [
	{ type: 'keyword', value: '下钻词甲', weight: 0.5, matchCount: 9, falsePositiveCount: 0, confidence: 1, source: 'auto', createdAt: 1780000000 },
	{ type: 'keyword', value: '下钻词乙', weight: 1, matchCount: 3, falsePositiveCount: 1, confidence: 1, source: 'seed', createdAt: 1780000000 }
];
const groups = [{ chatId: '-1001111111111', title: '示例群 A', source: 'dynamic' }];
const searchRows = [{ mid: 501, chat_id: '-1001111111111', from_id: '123456789', created_at: 1780000000, text_norm: '一条发言' }];
function userData(id) { return { userId: id, profile: { name: '用户' + id }, blacklist: null, events: [], cases: [], speech: { count: 1 }, gky: { success: true, banned: false } }; }

function mainData(action, body) {
	switch (action) {
		case 'bootstrap': return { user: { id: '10001', name: '主人' }, primaryOwner: true, groups, counts: {} };
		case 'groups/list': return groups;
		case 'health': return { layer1: [{ ok: true, text: '正常一' }, { ok: true, text: '正常二' }, { ok: null, text: '警告一' }, { ok: false, text: '异常一' }], layer2: [] };
		case 'admins/list': return { primary: [{ id: '10001', name: '主人', username: 'owner' }], secondary: [{ id: '10002', name: '副主人', username: '' }], superAdmins: [], groupLabels: {} };
		case 'ads/summary': return { counts: { fingerprints: 3, samples: 2, observing: 1, pending: 1 }, config: {} };
		case 'ads/pending': return { items: [{ seq: 1, userId: '555', chatId: '-1001111111111', score: 90, reasons: [], snapshot: {}, createdAt: 1780000000 }], page: 1, total: 1, totalPages: 1 };
		case 'ads/fingerprints': lastAdsQuery = body; return body.query ? { items: [fpRows[0]], page: 1, total: 1, totalPages: 1, query: body.query } : { items: fpRows, page: 1, total: 2, totalPages: 1, query: '' };
		case 'ads/samples': return { items: [{ id: 1, text: '<b>样本</b>原文', source: 'spam', createdAt: 1780000000, status: 'ready' }], counts: { total: 1, ready: 1, stale: 0, usable: 1 }, page: 1, total: 1, totalPages: 1 };
		case 'ads/observing': return { items: [{ userId: '700001', name: '观察甲', username: 'obs', chatId: '-1001111111111', score: 40, reasons: ['简介含联系方式'], layer: 'score', expiresAt: 1780003600, updatedAt: 1780000000 }], page: 1, total: 1, totalPages: 1 };
		case 'ads/llm': return { enabled: true, day: '2026-10-24', daily: 1000, used: 7, pools: { message: { used: 5, limit: 500 }, join: { used: 2, limit: 300 }, cron: { used: 0, limit: 100 } }, hits: 3, bans: 1, parseFail: 0, broken: false, consecFail: 0, candidates: { total: 2, promoted: 1 } };
		case 'ads/dryrun': return { items: [{ id: 1, chatId: '-1001111111111', userId: '710001', score: 88, threshold: 80, layer: 'score', reasons: [], status: 'fp', createdAt: 1780000000 }], chatId: '', page: 1, total: 1, totalPages: 1 };
		case 'ads/whitelist': return { items: wlList.map((id) => ({ userId: id, name: id === '720003' ? '白名单丙' : '', username: id === '720003' ? 'wl' : '', by: '10001', at: '2026-10-10T00:00:00Z', note: '老成员' })), page: 1, total: wlList.length, totalPages: 1 };
		case 'ads/whitelist/add': { wlCalls.push(['add', body.userIds]); const ids = String(body.userIds).match(/\d+/g) || []; ids.forEach((id) => { if (!wlList.includes(id)) wlList.push(id); }); return { added: ids, existed: [], failed: [], complete: true, message: '已加入白名单 ' + ids.length + ' 人。' }; }
		case 'ads/whitelist/remove': { wlCalls.push(['remove', body.userId]); const had = wlList.includes(body.userId); wlList = wlList.filter((x) => x !== body.userId); return { userId: body.userId, removed: had, message: '已移出白名单，恢复广告检测。' }; }
		case 'groups/detail': lastGroupDetail = body; return { chatId: body.chatId, title: '示例群 A', bot: { ok: false, status: 'administrator', reason: '', permissions: [{ key: 'can_restrict_members', label: '封禁用户', on: false }, { key: 'can_delete_messages', label: '删除消息', on: true }] }, dryRun: true, dryRunStats: { total: 1, today: 1, fp: 0, done: 0, lowestFp: null }, dryrunLog: [{ id: 1, chatId: body.chatId, userId: '810001', score: 88, threshold: 80, layer: 'score', reasons: ['<i>演练</i>原因'], status: 'open', createdAt: 1780000000 }], joinChecks: [{ id: 2, chatId: body.chatId, userId: '820001', score: 90, threshold: 80, verdict: 'ban', layer: 'profile', reasons: [], createdAt: 1780000000 }] };
		case 'search': return { kind: 'keyword', value: body.query, page: 1, total: 1, totalPages: 1, rows: searchRows };
		case 'users/query': { const d = userData(body.userId); d.whitelist = wlList.includes(body.userId) ? { by: '10001', at: '2026-10-10T00:00:00Z', note: '老成员' } : null; return d; }
		default: throw new Error('未 mock 的主后台接口 ' + action);
	}
}
function killerData(action, body) {
	switch (action) {
		case 'bootstrap': return { role: 'owner', user: { id: '10001', name: '主人' }, groups, banLimit: 50 };
		case 'groups': return groups;
		case 'stats': { lastStats = body; const single = /^\d{4}-\d{2}-\d{2}$/.test(String(body.range)); return { chatId: body.chatId, range: body.range || 'day', label: single ? body.range + ' 单日' : '今日', start: single ? body.range : '2026-10-24', end: single ? body.range : '2026-10-24', summary: { totalMsg: 9, activeUsers: 2, join: 1, leave: 1, kicked: 0 }, ranking: { rows: [{ rank: 1, userId: '777', displayName: '排行第一', count: 6 }, { rank: 2, userId: '888', displayName: '排行第二', count: 3 }], total: 2, page: 1, totalPages: 1 }, trend: [{ day: '2026-10-23', msg: 9 }] }; }
		case 'stats/members': lastMembers = body; return body.kind === 'join'
			? { kind: 'join', rows: [{ userId: '999', kind: 'join', at: 1780000000, displayName: '入群甲', username: 'jia' }], total: 1, page: 1, totalPages: 1 }
			: { kind: 'leave', rows: [{ userId: '998', kind: 'kicked', at: 1780000000, displayName: '被移出乙' }], total: 1, page: 1, totalPages: 1 };
		case 'search': return { page: 1, total: 1, totalPages: 1, rows: searchRows };
		case 'users/query': return userData(body.userId);
		case 'blacklist/list': return { items: [{ id: '55601', reason: '手动封禁', note: '', by: '10001', at: '2026-10-24T00:00:00Z' }], total: 1, page: 1, totalPages: 1 };
		case 'blacklist/ban': return String(body.userIds).includes('55609')
			? { complete: false, users: [{ userId: '55609', existed: true, ok: 0, total: 1, results: [{ groupId: '-1001111111111', ok: false, error: '机器人没有封禁权限' }] }], failed: [], skipped: ['10001'], invalid: ['abc'], scope: 1, note: '', message: '已处理 1 人，跳过 1 个受保护账号' }
			: { complete: true, users: [{ userId: '55601', existed: false, ok: 1, total: 1, results: [{ groupId: '-1001111111111', ok: true, error: null }] }], failed: [], skipped: [], invalid: [], scope: 1, note: body.note, message: '已处理 1 人' };
		case 'blacklist/unban': return { complete: true, users: [{ userId: '55601', removed: true, ok: 1, total: 1, results: [{ groupId: '-1001111111111', ok: true, error: null }] }], blocked: [], failed: [], invalid: [], scope: 1, message: '已解封 1 人' };
		default: throw new Error('未 mock 的杀手后台接口 ' + action);
	}
}

async function fixture(route) {
	const url = route.request().url();
	if (url === 'https://telegram.org/js/telegram-web-app.js') return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
	if (url === 'https://miniapp.test/app') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: mainHtml });
	if (url === 'https://miniapp.test/app/killer') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: killerHtml });
	const body = route.request().postDataJSON() || {};
	let data;
	try {
		if (url.startsWith('https://miniapp.test/app/api/killer/')) { const a = url.split('/app/api/killer/')[1]; calls.push('killer/' + a); data = killerData(a, body); }
		else if (url.startsWith('https://miniapp.test/app/api/')) { const a = url.split('/app/api/')[1]; calls.push(a); data = mainData(a, body); }
		else throw new Error('Unexpected request ' + url);
	} catch (error) { return route.fulfill({ status: 500, json: { success: false, error: error.message } }); }
	return route.fulfill({ status: 200, json: { success: true, data } });
}

async function waitText(page, id, needle) {
	try { await page.waitForFunction(([i, n]) => (document.getElementById(i)?.textContent || '').includes(n), [id, needle], { timeout: 4000 }); return true; }
	catch (_) { return false; }
}
const visibleLines = (page) => page.evaluate(() => [...document.querySelectorAll('#health-content .status-line')].filter((el) => !el.hidden).map((el) => el.textContent));

async function run() {
	const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
	const errors = [];
	try {
		const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
		await context.route('**/*', fixture);
		await context.addInitScript(() => { window.Telegram = { WebApp: { initData: 'mock-telegram-signed-data', colorScheme: 'light', isFullscreen: false, ready() {}, expand() {}, onEvent() {}, offEvent() {}, requestFullscreen() {}, exitFullscreen() {}, BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} }, HapticFeedback: { impactOccurred() {}, notificationOccurred() {} }, setHeaderColor() {}, setBackgroundColor() {} } }; });

		console.info('\n[主后台] 运行检查三个数字');
		const page = await context.newPage();
		page.on('pageerror', (e) => errors.push(e.message));
		await page.goto('https://miniapp.test/app');
		await page.waitForSelector('#app:not([hidden])');
		await page.locator('#health-run').click();
		await waitText(page, 'health-count', '正常');
		const stats = page.locator('#health-content .stat');
		check('三个数字都标成可点', (await page.locator('#health-content .stat.clickable').count()) === 3, String(await page.locator('#health-content .stat.clickable').count()));
		if ((await page.locator('#health-content .stat.clickable').count()) === 3) {
			await stats.nth(2).click();
			const bad = await visibleLines(page);
			check('点「异常」只剩异常行', bad.length === 1 && bad[0].includes('异常一'), JSON.stringify(bad));
			await stats.nth(0).click();
			const ok = await visibleLines(page);
			check('点「正常」只剩 2 条正常行', ok.length === 2 && ok.every((t) => t.includes('正常')), JSON.stringify(ok));
			await stats.nth(0).click();
			check('再点一次取消筛选，4 行全显示', (await visibleLines(page)).length === 4);
			await stats.nth(1).focus(); await page.keyboard.press('Enter');
			const warn = await visibleLines(page);
			check('键盘 Enter 点「警告」只剩警告行', warn.length === 1 && warn[0].includes('警告一'), JSON.stringify(warn));
		}

		console.info('\n[主后台] 权限名单每个人');
		await page.locator('#admins-run').click();
		await waitText(page, 'admins-count', '人');
		const person = page.locator('#admins-content .person.clickable');
		check('每个人都可点（2 人）', (await person.count()) === 2, String(await person.count()));
		if (await person.count()) {
			await person.nth(1).click();
			check('点副主人 → 跳到用户页查 10002', await waitText(page, 'users-content', 'ID 10002') && !(await page.locator('#page-users').isHidden()));
		}

		console.info('\n[主后台] 广告页待复核数字');
		await page.locator('#tab-ads').click();
		await waitText(page, 'ads-count', '条记录');
		const pendingStat = page.locator('#ads-summary .stat.clickable');
		check('待复核数字可点', (await pendingStat.count()) >= 1, String(await pendingStat.count()));
		if (await pendingStat.count()) {
			await page.evaluate(() => window.scrollTo(0, 0));
			await pendingStat.last().click();
			check('点待复核 → 焦点落到待复核列表', (await page.evaluate(() => document.activeElement && document.activeElement.id)) === 'ads-pending-label');
		}

		console.info('\n[主后台] 广告页下钻（批次 2）');
		await page.evaluate(() => window.scrollTo(0, 0));
		const drill = (k) => page.locator('#ads-summary [data-drill="' + k + '"]');
		check('概况里 3 个数字 + 3 个入口可下钻', (await page.locator('#ads-summary [data-drill]').count()) === 6, String(await page.locator('#ads-summary [data-drill]').count()));
		if ((await page.locator('#ads-summary [data-drill]').count()) === 6) {
			await drill('fingerprints').click();
			check('点「指纹」→ 展开指纹列表', await waitText(page, 'ads-drill', '下钻词甲'));
			check('指纹点开后标为展开', (await drill('fingerprints').getAttribute('aria-expanded')) === 'true');
			await page.locator('#ads-drill input[type=search]').fill('甲');
			await page.locator('#ads-drill form button[type=submit]').click();
			await page.waitForFunction(() => !(document.getElementById('ads-drill')?.textContent || '').includes('下钻词乙'), null, { timeout: 4000 }).catch(() => {});
			check('指纹搜索把关键词传给接口、只剩匹配项', lastAdsQuery && lastAdsQuery.query === '甲' && !(await page.locator('#ads-drill').textContent()).includes('下钻词乙'), JSON.stringify(lastAdsQuery));
			await drill('fingerprints').click();
			check('再点一次收起', (await page.locator('#ads-drill').textContent()) === '' && (await drill('fingerprints').getAttribute('aria-expanded')) === 'false');
			await drill('samples').focus(); await page.keyboard.press('Enter');
			check('键盘 Enter 点「广告样本」→ 原文按纯文本显示', await waitText(page, 'ads-drill', '<b>样本</b>原文') && (await page.locator('#ads-drill b').count()) === 0);
			await drill('observing').click();
			check('点「观察中」→ 列出观察用户', await waitText(page, 'ads-drill', '观察甲'));
			await drill('llm').click();
			check('点「AI 今日用量」→ 三池用量', await waitText(page, 'ads-drill', '5 / 500'));
			await drill('dryrun').click();
			check('点「演练流水」→ 列出演练记录', await waitText(page, 'ads-drill', '710001'));
			await drill('whitelist').click();
			check('点「白名单」→ 列出白名单用户', await waitText(page, 'ads-drill', '白名单丙'));
			const wl = page.locator('#ads-drill .card.clickable');
			check('白名单每人可点', (await wl.count()) === 1, String(await wl.count()));
			if (await wl.count()) {
				await wl.first().click();
				check('点白名单里的人 → 查用户 720003', await waitText(page, 'users-content', 'ID 720003'));
			}
		}

		console.info('\n[主后台] 白名单增删（批次 3）');
		check('用户页：在白名单的人显示「白名单中」与「移出白名单」', (await page.locator('#users-content').textContent()).includes('白名单中') && (await page.locator('#users-content button', { hasText: '移出白名单' }).count()) === 1);
		if ((await page.locator('#users-content button', { hasText: '移出白名单' }).count()) === 1) {
			await page.locator('#users-content button', { hasText: '移出白名单' }).click();
			await page.locator('#confirm-submit').click();
			await page.waitForFunction(() => [...document.querySelectorAll('#users-content button')].some((b) => b.textContent === '加入白名单'), null, { timeout: 4000 }).catch(() => {});
			check('用户页移出 → 调 remove 720003、按钮变「加入白名单」', JSON.stringify(wlCalls.at(-1)) === '["remove","720003"]' && (await page.locator('#users-content button', { hasText: '加入白名单' }).count()) === 1, JSON.stringify(wlCalls));
			await page.locator('#users-content button', { hasText: '加入白名单' }).click();
			await page.locator('#confirm-submit').click();
			await page.waitForFunction(() => [...document.querySelectorAll('#users-content button')].some((b) => b.textContent === '移出白名单'), null, { timeout: 4000 }).catch(() => {});
			check('用户页加入 → 调 add 720003、按钮变回「移出白名单」', JSON.stringify(wlCalls.at(-1)) === '["add","720003"]' && (await page.locator('#users-content button', { hasText: '移出白名单' }).count()) === 1, JSON.stringify(wlCalls));
		}
		await page.locator('#tab-ads').click();
		await page.waitForSelector('#ads-summary [data-drill="whitelist"]');
		if ((await page.locator('#ads-drill .whitelist-add').count()) === 0) await drill('whitelist').click();
		await waitText(page, 'ads-drill', '白名单丙');
		check('白名单明细有添加栏', (await page.locator('#ads-drill .whitelist-add input').count()) === 1);
		if ((await page.locator('#ads-drill .whitelist-add input').count()) === 1) {
			await page.locator('#ads-drill .whitelist-add input').fill('730001，730002');
			await page.locator('#ads-drill .whitelist-add button[type=submit]').click();
			await page.locator('#confirm-submit').click();
			check('白名单栏一次加 2 个 → 列表里出现', await waitText(page, 'ads-drill', '730002') && JSON.stringify(wlCalls.at(-1)) === '["add","730001 730002"]', JSON.stringify(wlCalls));
			const before = wlCalls.length;
			await page.locator('#ads-drill .card', { hasText: '730001' }).locator('button', { hasText: '移出白名单' }).click();
			check('点「移出白名单」先弹确认、不跳用户页', (await page.locator('#confirm-dialog').evaluate((d) => d.open)) && !(await page.locator('#page-ads').isHidden()));
			await page.locator('#confirm-cancel').click();
			check('取消确认 → 不调接口', wlCalls.length === before, JSON.stringify(wlCalls));
			await page.locator('#ads-drill .card', { hasText: '730001' }).locator('button', { hasText: '移出白名单' }).click();
			await page.locator('#confirm-submit').click();
			await page.waitForFunction(() => !(document.getElementById('ads-drill')?.textContent || '').includes('730001'), null, { timeout: 4000 }).catch(() => {});
			check('确认移出 → 列表里没了', JSON.stringify(wlCalls.at(-1)) === '["remove","730001"]' && !(await page.locator('#ads-drill').textContent()).includes('730001'), JSON.stringify(wlCalls));
		}

		console.info('\n[主后台] 群组详情（批次 3）');
		await page.locator('#tab-groups').click();
		await waitText(page, 'groups-content', '示例群 A');
		const more = page.locator('#groups-content button', { hasText: '查看详情' });
		check('群组卡片有「查看详情」', (await more.count()) === 1, String(await more.count()));
		if (await more.count()) {
			await more.click();
			check('展开后显示权限、演练、两份流水', await waitText(page, 'groups-content', '入群检查流水') && (await page.locator('#groups-content').textContent()).includes('✗ 封禁用户') && (await page.locator('#groups-content').textContent()).includes('近期演练流水') && lastGroupDetail?.chatId === '-1001111111111', JSON.stringify(lastGroupDetail));
			check('缺封禁权限 → 标出无法执行封禁', (await page.locator('#groups-content').textContent()).includes('无法执行封禁'));
			check('流水原因按纯文本显示', (await page.locator('#groups-content').textContent()).includes('<i>演练</i>原因') && (await page.locator('#groups-content i').count()) === 0);
			const rows = page.locator('#groups-content .group-detail .result-item.clickable');
			check('两份流水每条可点（2 条）', (await rows.count()) === 2, String(await rows.count()));
			await page.locator('#groups-content button', { hasText: '收起详情' }).click();
			check('再点收起', (await page.locator('#groups-content .group-detail').textContent()) === '');
			await page.locator('#groups-content button', { hasText: '查看详情' }).click();
			await waitText(page, 'groups-content', '入群检查流水');
			await page.locator('#groups-content .group-detail .result-item.clickable').nth(1).click();
			check('点入群检查里的人 → 查用户 820001', await waitText(page, 'users-content', 'ID 820001'));
		}

		console.info('\n[主后台] 发言检索结果');
		await page.locator('#tab-users').click();
		await page.locator('#search-query').fill('一条');
		await page.locator('#search-form button[type=submit]').click();
		await waitText(page, 'search-count', '条记录');
		const item = page.locator('#search-content .result-item.clickable');
		check('检索结果可点', (await item.count()) === 1, String(await item.count()));
		if (await item.count()) {
			await item.first().click();
			check('点结果 → 查发言人 123456789', await waitText(page, 'users-content', 'ID 123456789'));
		}

		console.info('\n[杀手后台] 统计排行与检索');
		const kp = await context.newPage();
		kp.on('pageerror', (e) => errors.push(e.message));
		await kp.goto('https://miniapp.test/app/killer');
		await kp.waitForSelector('#app:not([hidden])');
		await kp.locator('#tab-stats').click();
		await waitText(kp, 'stats-content', '排行第一');
		const rank = kp.locator('#stats-content .rank-row.clickable');
		check('排行每行可点（2 行）', (await rank.count()) === 2, String(await rank.count()));
		const rankText = await kp.evaluate(() => [...document.querySelectorAll('#stats-content .rank-row')].map((el) => el.textContent));
		check('排行有昵称时 TGID 照样显示', rankText[0] && rankText[0].includes('排行第一') && rankText[0].includes('ID 777'), JSON.stringify(rankText));
		const killerStat = kp.locator('#stats-content .stat.clickable');
		check('发言 / 活跃人数两个数字可点', await kp.evaluate(() => [...document.querySelectorAll('#stats-content .stat')].slice(0, 2).every((el) => el.classList.contains('clickable'))));
		if (await rank.count()) {
			await rank.first().click();
			check('点排行第一 → 查用户 777', await waitText(kp, 'users-content', 'ID 777') && !(await kp.locator('#page-users').isHidden()));
		}
		if (await killerStat.count()) {
			await kp.locator('#tab-stats').click();
			await waitText(kp, 'stats-content', '排行第一');
			await kp.locator('#stats-content .stat.clickable').first().click();
			check('点「发言」数字 → 焦点落到发言排行', (await kp.evaluate(() => document.activeElement && document.activeElement.textContent)) === '发言排行');
		}
		console.info('\n[杀手后台] 入群 / 退群明细与趋势日（批次 3）');
		await kp.locator('#tab-stats').click();
		await waitText(kp, 'stats-content', '排行第一');
		check('四个数字全部可点', (await kp.locator('#stats-content .stat.clickable').count()) === 4, String(await kp.locator('#stats-content .stat.clickable').count()));
		if ((await kp.locator('#stats-content .stat.clickable').count()) === 4) {
			await kp.locator('#stats-content .stat.clickable').nth(2).click();
			check('点「入群」→ 列出入群的人', await waitText(kp, 'stats-members', '入群甲'));
			check('入群明细请求带 kind=join', lastMembers && lastMembers.kind === 'join' && lastMembers.range === 'day', JSON.stringify(lastMembers));
			const mrow = kp.locator('#stats-members .rank-row.clickable');
			check('入群明细每行可点', (await mrow.count()) === 1, String(await mrow.count()));
			const mText = await kp.evaluate(() => document.querySelector('#stats-members .rank-row')?.textContent || '');
			check('明细同时显示昵称、@用户名、TGID', mText.includes('入群甲') && mText.includes('@jia') && mText.includes('ID 999'), mText);
			await kp.locator('#stats-content .stat.clickable').nth(3).focus(); await kp.keyboard.press('Enter');
			check('键盘 Enter 点「退群」→ 列出退群与被移出的人', await waitText(kp, 'stats-members', '被移出乙') && lastMembers.kind === 'leave');
			if (await mrow.count()) {
				await kp.locator('#stats-members .rank-row.clickable').first().click();
				check('点明细里的人 → 查用户 998', await waitText(kp, 'users-content', 'ID 998'));
			}
		}
		await kp.locator('#tab-stats').click();
		await waitText(kp, 'stats-content', '排行第一');
		const trendRow = kp.locator('#stats-content .trend-row.clickable');
		check('趋势每天都可点', (await trendRow.count()) === 1, String(await trendRow.count()));
		if (await trendRow.count()) {
			await trendRow.first().click();
			await waitText(kp, 'stats-content', '2026-10-23 单日');
			check('点趋势某天 → 按那一天重载统计', lastStats && lastStats.range === '2026-10-23', JSON.stringify(lastStats));
			check('时间下拉显示所选那天', (await kp.locator('#stats-range').inputValue()) === '2026-10-23');
		}

		await kp.locator('#tab-users').click();
		await kp.locator('#search-query').fill('一条');
		await kp.locator('#search-form button[type=submit]').click();
		await waitText(kp, 'search-count', '条记录');
		const kItem = kp.locator('#search-content .result-item.clickable');
		check('杀手检索结果可点', (await kItem.count()) === 1, String(await kItem.count()));
		if (await kItem.count()) {
			await kItem.first().focus(); await kp.keyboard.press('Enter');
			check('键盘 Enter 点结果 → 查发言人 123456789', await waitText(kp, 'users-content', 'ID 123456789'));
		}

		console.info('\n[杀手后台] 封禁 / 解封每次都给完整结果');
		const closeResult = async () => { if (await kp.locator('#confirm-dialog[open]').count()) await kp.locator('#confirm-submit').click(); await kp.waitForTimeout(150); };
		const dialogText = () => kp.evaluate(() => ({ open: !!document.querySelector('#confirm-dialog[open]'), title: document.getElementById('confirm-title').textContent, body: document.getElementById('confirm-description').textContent, cancelHidden: document.getElementById('confirm-cancel').hidden }));
		await kp.locator('#tab-blacklist').click();
		await waitText(kp, 'blacklist-content', 'ID 55601');
		await kp.locator('#ban-ids').fill('55601');
		await kp.locator('#ban-note').fill('发广告');
		await kp.locator('#ban-form button[type=submit]').click();
		await kp.locator('#confirm-submit').click();
		check('全部成功也弹结果窗「封禁完成」', await waitText(kp, 'confirm-title', '封禁完成'));
		let d = await dialogText();
		check('结果窗只有「知道了」', d.open && d.cancelHidden, JSON.stringify(d));
		check('结果写明作用范围与原因', d.body.includes('作用范围：1 个杀手群') && d.body.includes('原因：发广告'), d.body);
		check('结果逐人写踢出 x/y', d.body.includes('55601：踢出 1/1'), d.body);
		check('结果逐群列出成功的群（群名 + ID）', d.body.includes('✓ 示例群 A · -1001111111111'), d.body);
		await closeResult();

		await kp.locator('#ban-ids').fill('55609 10001 abc');
		await kp.locator('#ban-form button[type=submit]').click();
		await kp.locator('#confirm-submit').click();
		check('部分失败弹「封禁部分未完成」', await waitText(kp, 'confirm-title', '封禁部分未完成'));
		d = await dialogText();
		check('失败的群带原因', d.body.includes('✗ 示例群 A · -1001111111111 — 机器人没有封禁权限'), d.body);
		check('原本已在黑名单的要标出', d.body.includes('55609：踢出 0/1（原本已在杀手黑名单）'), d.body);
		check('跳过与格式错误都列出', d.body.includes('跳过（主人 / 杀手权限）：10001') && d.body.includes('格式不对已忽略：abc'), d.body);
		await closeResult();

		await waitText(kp, 'blacklist-content', 'ID 55601');
		await kp.locator('#blacklist-content .card-actions button', { hasText: '解除封禁' }).first().click();
		await kp.locator('#confirm-submit').click();
		check('解封全部成功也弹「解封完成」', await waitText(kp, 'confirm-title', '解封完成'));
		d = await dialogText();
		check('解封结果逐人逐群列出', d.body.includes('55601：解封 1/1（已移出杀手黑名单）') && d.body.includes('✓ 示例群 A · -1001111111111'), d.body);
		await closeResult();

		check('全程无页面脚本错误', errors.length === 0, errors.join(' | '));
		check('只调用已有接口 + 批次 2 的 6 个广告下钻 + 批次 3 的 killer/stats/members', calls.every((a) => ['bootstrap', 'groups/list', 'health', 'admins/list', 'ads/summary', 'ads/pending', 'ads/fingerprints', 'ads/samples', 'ads/observing', 'ads/llm', 'ads/dryrun', 'ads/whitelist', 'ads/whitelist/add', 'ads/whitelist/remove', 'groups/detail', 'search', 'users/query', 'killer/bootstrap', 'killer/groups', 'killer/stats', 'killer/stats/members', 'killer/search', 'killer/users/query', 'killer/blacklist/list', 'killer/blacklist/ban', 'killer/blacklist/unban'].includes(a)), calls.join(','));
	} finally {
		await browser.close();
	}
	console.info('\n=== 总计 ' + (pass + fail) + ' 项，通过 ' + pass + '，失败 ' + fail + ' ===');
	process.exit(fail ? 1 : 0);
}
run().catch((error) => { console.error(error); process.exit(1); });
