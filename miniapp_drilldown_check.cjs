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
		case 'search': return { kind: 'keyword', value: body.query, page: 1, total: 1, totalPages: 1, rows: searchRows };
		case 'users/query': return userData(body.userId);
		default: throw new Error('未 mock 的主后台接口 ' + action);
	}
}
function killerData(action, body) {
	switch (action) {
		case 'bootstrap': return { role: 'owner', user: { id: '10001', name: '主人' }, groups, banLimit: 50 };
		case 'groups': return groups;
		case 'stats': return { chatId: body.chatId, range: 'day', label: '今日', start: '2026-10-24', end: '2026-10-24', summary: { totalMsg: 9, activeUsers: 2, join: 1, leave: 0, kicked: 0 }, ranking: { rows: [{ rank: 1, userId: '777', displayName: '排行第一', count: 6 }, { rank: 2, userId: '888', displayName: '排行第二', count: 3 }], total: 2, page: 1, totalPages: 1 }, trend: [{ day: '2026-10-24', msg: 9 }] };
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
		const killerStat = kp.locator('#stats-content .stat.clickable');
		check('发言 / 活跃人数两个数字可点', (await killerStat.count()) === 2, String(await killerStat.count()));
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
		check('批次 1 不新增任何接口（只调用已有接口）', calls.every((a) => ['bootstrap', 'groups/list', 'health', 'admins/list', 'ads/summary', 'ads/pending', 'search', 'users/query', 'killer/bootstrap', 'killer/groups', 'killer/stats', 'killer/search', 'killer/users/query'].includes(a)), calls.join(','));
	} finally {
		await browser.close();
	}
	console.info('\n=== 总计 ' + (pass + fail) + ' 项，通过 ' + pass + '，失败 ' + fail + ' ===');
	process.exit(fail ? 1 : 0);
}
run().catch((error) => { console.error(error); process.exit(1); });
