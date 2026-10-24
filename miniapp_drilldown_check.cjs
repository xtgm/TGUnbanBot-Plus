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
new vm.Script(fs.readFileSync('_worker.js', 'utf8').replace('export default {', 'globalThis.__handler = {')).runInContext(ctx);
const mainHtml = ctx.renderMiniAppHtml();
const killerHtml = ctx.renderKillerMiniAppHtml();

let pass = 0, fail = 0;
function check(name, cond, detail) {
	if (cond) { pass++; console.info('  ✅ ' + name); }
	else { fail++; console.info('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
}

const calls = [];
let lastStats = null, lastMembers = null, lastAdsQuery = null;
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
		case 'ads/whitelist': return { items: [{ userId: '720003', name: '白名单丙', username: 'wl', by: '10001', at: '2026-10-10T00:00:00Z', note: '老成员' }], page: 1, total: 1, totalPages: 1 };
		case 'search': return { kind: 'keyword', value: body.query, page: 1, total: 1, totalPages: 1, rows: searchRows };
		case 'users/query': return userData(body.userId);
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

		check('全程无页面脚本错误', errors.length === 0, errors.join(' | '));
		check('只调用已有接口 + 批次 2 的 6 个广告下钻 + 批次 3 的 killer/stats/members', calls.every((a) => ['bootstrap', 'groups/list', 'health', 'admins/list', 'ads/summary', 'ads/pending', 'ads/fingerprints', 'ads/samples', 'ads/observing', 'ads/llm', 'ads/dryrun', 'ads/whitelist', 'search', 'users/query', 'killer/bootstrap', 'killer/groups', 'killer/stats', 'killer/stats/members', 'killer/search', 'killer/users/query'].includes(a)), calls.join(','));
	} finally {
		await browser.close();
	}
	console.info('\n=== 总计 ' + (pass + fail) + ' 项，通过 ' + pass + '，失败 ' + fail + ' ===');
	process.exit(fail ? 1 : 0);
}
run().catch((error) => { console.error(error); process.exit(1); });
