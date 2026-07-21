// 批量 /ban /unban 离线测试
// 用 vm 加载 _worker.js 的源代码（绕开 ESM default-export 约束），
// 然后单独驱动批量函数和解析器。
// 验证目标：parseBatchTgids、addManyToBlacklist、removeManyFromBlacklist、
// 渲染函数、D1-only 写入与重复项处理。

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '_worker.js'), 'utf8');

// 把 ESM `export default { ... };` 块剥成空对象，保留它后面的所有顶层函数定义。
// 用花括号配对扫描而不是贪婪正则，避免把整个文件尾巴一起吃掉
function stripExportDefault(source) {
	const start = source.indexOf('export default');
	if (start < 0) return source;
	const braceStart = source.indexOf('{', start);
	if (braceStart < 0) return source;
	let depth = 0;
	let i = braceStart;
	for (; i < source.length; i++) {
		const ch = source[i];
		if (ch === '{') depth += 1;
		else if (ch === '}') {
			depth -= 1;
			if (depth === 0) {
				i += 1; // 包含闭合花括号
				break;
			}
		}
	}
	// 跳过末尾分号
	if (source[i] === ';') i += 1;
	return source.slice(0, start) + '/* stripped default export */' + source.slice(i);
}
const stripped = stripExportDefault(src);

// 末尾追加一个导出钩子：vm 里 function/const 是脚本作用域，不会绑到 sandbox 上，
// 所以显式塞回 globalThis 给外部读取
const exposeNames = [
	'parseBatchTgids',
	'addToBlacklistCore',
	'addToBlacklist',
	'removeFromBlacklistCore',
	'removeFromBlacklist',
	'addManyToBlacklist',
	'removeManyFromBlacklist',
	'renderBatchAddResult',
	'renderBatchRemoveResult',
	'formatBatchUserTarget',
	'estimateBulkTaskSubrequests',
	'shouldUseBulkQueue',
	'shouldRetryTelegramMutationFailure',
	'getTelegramMutationRetryDelayMs',
	'getBulkJobSafeConcurrency',
	'splitTelegramHtmlBlocks',
	'telegramMessageLength',
	'BATCH_LIMIT',
];
const tail =
	'\nglobalThis.__exports = {' +
	exposeNames.map((n) => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(', ') +
	'};\n';

const sandbox = {
	console,
	URL,
	URLSearchParams,
	TextEncoder,
	TextDecoder,
	fetch: globalThis.fetch,
	Response,
	Request,
	Headers,
	atob,
	btoa,
	setTimeout,
	clearTimeout,
};
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
// 注入 source —— 脚本里的 const/function 都会变成 sandbox 上的属性
vm.runInContext(stripped + tail, sandbox, { filename: '_worker.js' });

const {
	parseBatchTgids,
	addToBlacklistCore,
	addToBlacklist,
	addManyToBlacklist,
	removeManyFromBlacklist,
	renderBatchAddResult,
	renderBatchRemoveResult,
	formatBatchUserTarget,
	estimateBulkTaskSubrequests,
	shouldUseBulkQueue,
	shouldRetryTelegramMutationFailure,
	getTelegramMutationRetryDelayMs,
	getBulkJobSafeConcurrency,
	splitTelegramHtmlBlocks,
	telegramMessageLength,
	BATCH_LIMIT,
} = sandbox.__exports;

// ---------- 伪 D1 ----------
function makeFakeDB(options = {}) {
	const rows = new Map();
	const mutationCalls = [];
	let mutationCallIndex = 0;
	const failMutationCalls = new Set(options.failMutationCalls || []);
	return {
		_rows: rows,
		_mutationCalls: mutationCalls,
		exec: async () => {},
		prepare(sql) {
			let bound = [];
			const stmt = {
				bind(...args) {
					bound = args;
					return stmt;
				},
				async first() {
					if (sql.startsWith('SELECT id FROM blacklist WHERE id = ?')) {
						const id = String(bound[0]);
						return rows.has(id) ? { id } : null;
					}
					return null;
				},
				async run() {
					if (sql.startsWith('INSERT OR IGNORE INTO blacklist')) {
						const [rawId, reason, by, at, note] = bound;
						const id = String(rawId);
						if (rows.has(id)) return { meta: { changes: 0 } };
						rows.set(id, { id, reason, by_user: by, at, note: note ?? null });
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('DELETE FROM blacklist WHERE id = ?')) {
						const id = String(bound[0]);
						const had = rows.delete(id);
						return { meta: { changes: had ? 1 : 0 } };
					}
					return { meta: { changes: 0 } };
				},
				async all() {
					if (sql.startsWith('INSERT OR IGNORE INTO blacklist') && sql.includes('RETURNING id')) {
						mutationCallIndex += 1;
						mutationCalls.push({ index: mutationCallIndex, type: 'insert', sql, bound: [...bound] });
						if (failMutationCalls.has(mutationCallIndex)) throw new Error(`forced mutation failure ${mutationCallIndex}`);
						const results = [];
						for (let i = 0; i < bound.length; i += 5) {
							const id = String(bound[i]);
							if (rows.has(id)) continue;
							rows.set(id, {
								id,
								reason: bound[i + 1] ?? null,
								by_user: bound[i + 2] ?? null,
								at: bound[i + 3] ?? null,
								note: bound[i + 4] ?? null,
							});
							results.push({ id });
						}
						return { results: options.reverseReturning ? results.reverse() : results };
					}
					if (sql.startsWith('DELETE FROM blacklist WHERE id IN') && sql.includes('RETURNING id')) {
						mutationCallIndex += 1;
						mutationCalls.push({ index: mutationCallIndex, type: 'delete', sql, bound: [...bound] });
						if (failMutationCalls.has(mutationCallIndex)) throw new Error(`forced mutation failure ${mutationCallIndex}`);
						const results = [];
						for (const rawId of bound) {
							const id = String(rawId);
							if (rows.delete(id)) results.push({ id });
						}
						return { results: options.reverseReturning ? results.reverse() : results };
					}
					const results = [...rows.values()];
					results.sort((a, b) => String(a.at).localeCompare(String(b.at)));
					return { results };
				},
			};
			return stmt;
		},
	};
}

// ---------- 测试工具 ----------
let pass = 0;
let fail = 0;
function assert(name, cond, detail) {
	if (cond) {
		pass += 1;
		console.log(`  ✅ ${name}`);
	} else {
		fail += 1;
		console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
	}
}
function eq(a, b) {
	return JSON.stringify(a) === JSON.stringify(b);
}

// ---------- 1. parseBatchTgids ----------
console.log('\n[1] parseBatchTgids 解析器');
{
	let r = parseBatchTgids('123');
	assert('单条', eq(r, { valid: ['123'], invalid: [] }));

	r = parseBatchTgids('123,456,789');
	assert('半角逗号', eq(r, { valid: ['123', '456', '789'], invalid: [] }));

	r = parseBatchTgids('123，456');
	assert('全角逗号', eq(r, { valid: ['123', '456'], invalid: [] }));

	r = parseBatchTgids('123 456');
	assert('空格分隔', eq(r, { valid: ['123', '456'], invalid: [] }));

	r = parseBatchTgids('123\n456');
	assert('换行分隔', eq(r, { valid: ['123', '456'], invalid: [] }));

	r = parseBatchTgids('123,abc,456');
	assert('混合：abc 进 invalid', eq(r, { valid: ['123', '456'], invalid: ['abc'] }));

	r = parseBatchTgids('123,123,456');
	assert('去重', eq(r, { valid: ['123', '456'], invalid: [] }));

	r = parseBatchTgids(' , ,  ');
	assert('全空', eq(r, { valid: [], invalid: [] }));

	r = parseBatchTgids('  123 ， 456 , abc , 123  ');
	assert('混合分隔+去重', eq(r, { valid: ['123', '456'], invalid: ['abc'] }));

	r = parseBatchTgids('[123,456,789]');
	assert('数组外壳+半角逗号', eq(r, { valid: ['123', '456', '789'], invalid: [] }));

	r = parseBatchTgids('[123，456，789]');
	assert('数组外壳+全角逗号', eq(r, { valid: ['123', '456', '789'], invalid: [] }));

	r = parseBatchTgids('[\n123,\n456 789\n]');
	assert('数组外壳+换行+空格', eq(r, { valid: ['123', '456', '789'], invalid: [] }));
}

// ---------- 2. BATCH_LIMIT 常量 ----------
console.log('\n[2] BATCH_LIMIT');
assert('BATCH_LIMIT === 50', BATCH_LIMIT === 50);

// ---------- 3. 单条 addToBlacklist（D1-only） ----------
console.log('\n[3] 单条添加 - D1');
{
	const db = makeFakeDB();
	const env = { DB: db };
	const r = await addToBlacklist('123', env, { reason: 'manual', by: '999' });
	assert('添加成功 success=true', r.success === true);
	assert('消息含 已将用户', r.message.includes('已将用户'));
	const row = db._rows.get('123');
	assert('D1 中有 1 条', db._rows.size === 1 && !!row);
	assert('reason=manual', row.reason === 'manual');
	assert('by=999', row.by_user === '999');
}

// ---------- 4. 批量添加 - D1 ----------
console.log('\n[4] 批量添加 - D1');
{
	const db = makeFakeDB();
	const env = { DB: db };
	const results = await addManyToBlacklist(['100', '200', '300'], env, { reason: 'manual', by: '1' });
	assert('3 个全部成功', eq(results.success, ['100', '200', '300']));
	assert('exists 空', results.exists.length === 0);
	assert('failed 空', results.failed.length === 0);
	assert('D1 有 3 条', db._rows.size === 3);
}

// ---------- 5. 批量添加 - 部分已存在 ----------
console.log('\n[5] 批量添加 - 部分已存在');
{
	const db = makeFakeDB();
	const env = { DB: db };
	await addManyToBlacklist(['100', '200'], env, { reason: 'manual', by: '1' });
	const r = await addManyToBlacklist(['200', '300', '400'], env, { reason: 'manual', by: '1' });
	assert('成功 2', r.success.length === 2);
	assert('exists 1（200）', r.exists.length === 1 && r.exists[0] === '200');
	assert('failed 0', r.failed.length === 0);
	assert('D1 共 4 条', db._rows.size === 4);
}

// ---------- 6. 批量移除 ----------
console.log('\n[6] 批量移除');
{
	const db = makeFakeDB();
	const env = { DB: db };
	await addManyToBlacklist(['100', '200', '300'], env, { reason: 'manual', by: '1' });
	const r = await removeManyFromBlacklist(['100', '200', '999'], env);
	assert('成功 2', r.success.length === 2);
	assert('notFound 1（999）', r.notFound.length === 1 && r.notFound[0] === '999');
	assert('failed 0', r.failed.length === 0);
	assert('D1 剩 1 条（300）', db._rows.size === 1 && db._rows.has('300'));
}

// ---------- 7. 渲染函数 ----------
console.log('\n[7] 渲染函数');
{
	const text = renderBatchAddResult(
		{ success: ['100', '200'], exists: ['300'], failed: [{ id: '400', msg: 'oops' }] },
		['abc']
	);
	assert('add：包含成功 2', text.includes('成功: 2'));
	assert('add：包含已存在 1', text.includes('已存在: 1'));
	assert('add：包含格式错误 1', text.includes('格式错误: 1'));
	assert('add：包含失败 1', text.includes('失败: 1'));
	assert('add：详情含 100', text.includes('<code>100</code>'));
	assert('add：详情含 abc 转义', text.includes('<code>abc</code>'));
}
{
	const profiles = new Map([
		['100', { id: 100, first_name: 'A&B', last_name: '<X>', username: 'user100' }],
		['200', { id: 200, username: 'only_user' }],
	]);
	const text = renderBatchAddResult(
		{ success: ['100', '200', '7965398892'], exists: ['300'], failed: [] },
		[],
		null,
		profiles
	);
	assert('add profile：姓名为 tg:// 可点击链接', text.includes('<a href="tg://user?id=100">A&amp;B &lt;X&gt;</a>'));
	assert('add profile：有姓名时追加 username', text.includes('<code>@user100</code>'));
	assert('add profile：仅 username 时显示 @username 链接', text.includes('<a href="tg://user?id=200">@only_user</a>'));
	assert('add profile：大 TGID 精确且可点击', text.includes('<a href="tg://user?id=7965398892">7965398892</a> <code>7965398892</code>'));
	assert('add profile：无资料回退可点击 TGID', text.includes('<a href="tg://user?id=300">300</a> <code>300</code>'));
}
{
	const text = renderBatchRemoveResult(
		{ success: ['100'], notFound: ['200'], failed: [] },
		[]
	);
	assert('remove：含已移除', text.includes('已移除'));
	assert('remove：含不在黑名单', text.includes('不在黑名单'));
}

// ---------- 8. D1 单后端的批量 ----------
console.log('\n[8] D1 后端批量');
{
	const db = makeFakeDB();
	const env = { DB: db };
	const r = await addManyToBlacklist(['100', '200', '100'], env, { reason: 'manual', by: '1' });
	assert('D1 时成功 2', r.success.length === 2);
	assert('D1 写入 2 条', db._rows.size === 2);
}

// ---------- 9. 无 D1 ----------
console.log('\n[9] 无 D1');
{
	const r = await addManyToBlacklist(['100'], {}, { reason: 'manual', by: '1' });
	assert('无 D1：success 空', r.success.length === 0);
	assert('无 D1：failed 1', r.failed.length === 1);
	assert('无 D1：消息含未绑定', r.failed[0].msg.includes('未绑定'));
}

// ---------- 10. D1 多行 SQL 分块与混合结果 ----------
console.log('\n[10] D1 多行 SQL 分块');
for (const total of [20, 21, 50]) {
	const db = makeFakeDB();
	const ids = Array.from({ length: total }, (_, i) => String(10000 + i));
	const result = await addManyToBlacklist(ids, { DB: db }, { reason: 'manual', by: '1', note: '批量' });
	assert(`${total} 人全部写入`, result.success.length === total && db._rows.size === total);
	assert(`${total} 人 mutation SQL 数正确`, db._mutationCalls.length === Math.ceil(total / 20));
	assert(`${total} 人每条 INSERT 最多绑定 100 参数`, db._mutationCalls.every((call) => call.bound.length <= 100));
}
{
	const db = makeFakeDB({ reverseReturning: true });
	await addManyToBlacklist(['1', '2'], { DB: db }, { reason: 'manual', by: '1' });
	const result = await addManyToBlacklist(['2', '3', '4'], { DB: db }, { reason: 'manual', by: '1' });
	assert('RETURNING 乱序仍按输入顺序分类新增', eq(result.success, ['3', '4']));
	assert('RETURNING 乱序仍识别已存在', eq(result.exists, ['2']));
}
{
	const db = makeFakeDB({ failMutationCalls: [2] });
	db._rows.set('19999', { id: '19999', reason: 'manual', by_user: '1', at: 'old' });
	const freshIds = Array.from({ length: 40 }, (_, i) => String(20000 + i));
	const result = await addManyToBlacklist(['19999', ...freshIds], { DB: db }, { reason: 'manual', by: '1' });
	assert('同一调用正确分类新增', eq(result.success, [...freshIds.slice(0, 19), freshIds[39]]));
	assert('同一调用正确分类已存在', eq(result.exists, ['19999']));
	assert('同一调用正确分类失败', eq(result.failed.map((item) => item.id), freshIds.slice(19, 39)));
	assert('失败 chunk 不影响前后 chunk 且不产生脏写入', db._mutationCalls.length === 3 && db._rows.size === 21);
}
{
	const db = makeFakeDB();
	const ids = Array.from({ length: 21 }, (_, i) => String(30000 + i));
	await addManyToBlacklist(ids, { DB: db }, { reason: 'manual', by: '1' });
	db._mutationCalls.length = 0;
	const result = await removeManyFromBlacklist([...ids, '999999'], { DB: db });
	assert('批量 DELETE 正确区分成功和不存在', result.success.length === 21 && eq(result.notFound, ['999999']));
	assert('批量 DELETE 21+1 人分为 2 条 SQL', db._mutationCalls.length === 2);
}

// ---------- 11. 同步请求预算 ----------
console.log('\n[11] 同步请求预算');
{
	const cases = [
		[19, 1, false, 69],
		[12, 2, false, 73],
		[3, 8, false, 70],
		[4, 7, true, 78],
		[20, 1, true, 72],
	];
	for (const [users, groups, useQueue, expected] of cases) {
		const budget = shouldUseBulkQueue(users, groups);
		assert(`${users}×${groups} Queue 判定`, budget.useQueue === useQueue);
		assert(`${users}×${groups} 请求估算`, budget.estimate.total === expected);
	}
	const probeBelowBudget = shouldUseBulkQueue(1, 22, { probeMembership: true });
	assert('单用户逐群探测 22 群仍在 100 请求预算内', !probeBelowBudget.useQueue && probeBelowBudget.estimate.total === 99);
	const probeOverBudget = shouldUseBulkQueue(1, 23, { probeMembership: true });
	assert('单用户逐群探测 23 群仅因超过 100 请求进入 Queue', probeOverBudget.useQueue && probeOverBudget.operations === 23 && probeOverBudget.estimate.total === 103);
	assert('单用户逐群探测按 G 次资料请求估算', probeOverBudget.estimate.profileRequests === 23);
	const noProbeBudget = shouldUseBulkQueue(1, 23);
	assert('不逐群探测的单用户路径保持一次资料查询', !noProbeBudget.useQueue && noProbeBudget.estimate.profileRequests === 1);
	const ordinaryAdminBudget = shouldUseBulkQueue(1, 18, { probeMembership: true, authorizationRequests: 18 });
	assert('普通管理员逐群鉴权计入 100 请求预算', ordinaryAdminBudget.useQueue && ordinaryAdminBudget.operations === 18 && ordinaryAdminBudget.estimate.total === 101);
	assert('预算单独记录普通管理员鉴权请求', ordinaryAdminBudget.estimate.authorizationRequests === 18);
	assert('D1 批处理估算按每 20 人一批', estimateBulkTaskSubrequests(41, 1).d1MutationBatches === 3);
	assert('网络异常允许重试', shouldRetryTelegramMutationFailure({ networkError: true }));
	assert('HTTP 429 允许重试', shouldRetryTelegramMutationFailure({ httpStatus: 429 }));
	assert('Telegram 429 允许重试', shouldRetryTelegramMutationFailure({ errorCode: 429 }));
	assert('HTTP 5xx 允许重试', shouldRetryTelegramMutationFailure({ httpStatus: 503 }));
	assert('Telegram 5xx 允许重试', shouldRetryTelegramMutationFailure({ errorCode: 500 }));
	assert('USER_ID_INVALID 400 不重试', !shouldRetryTelegramMutationFailure({ httpStatus: 400, errorCode: 400, error: 'Bad Request: USER_ID_INVALID' }));
	assert('PARTICIPANT_ID_INVALID 400 不重试', !shouldRetryTelegramMutationFailure({ httpStatus: 400, errorCode: 400, error: 'Bad Request: PARTICIPANT_ID_INVALID' }));
	assert('权限不足 403 不重试', !shouldRetryTelegramMutationFailure({ httpStatus: 403, errorCode: 403 }));
	assert('retry_after 30 秒不会提前截断', getTelegramMutationRetryDelayMs({ retryAfterSeconds: 30 }) === 30000);
	assert('旧任务并发 99 被硬限制为 3', getBulkJobSafeConcurrency({ concurrency: 99 }) === 3);
	assert('合法并发 2 保持不变', getBulkJobSafeConcurrency({ concurrency: 2 }) === 2);
}

// ---------- 12. 姓名与 username 安全格式 ----------
console.log('\n[12] 姓名与 username 安全格式');
{
	const longName = '名'.repeat(60) + '<&>';
	const profiles = new Map([['900', { id: 900, first_name: longName, username: 'valid_user' }]]);
	const text = formatBatchUserTarget('900', profiles);
	const anchorLabel = text.match(/<a href="tg:\/\/user\?id=900">([^<]+)<\/a>/)?.[1] || '';
	assert('姓名最多显示 48 个字符并加省略号', Array.from(anchorLabel.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&')).length === 48 && anchorLabel.endsWith('…'));
	assert('合法 username 正常显示', text.includes('<code>@valid_user</code>'));
	const invalid = formatBatchUserTarget('901', new Map([['901', { id: 901, first_name: '安全用户', username: 'bad name<script>' }]]));
	assert('非法 username 不进入 HTML', !invalid.includes('bad name') && !invalid.includes('script'));
}

// ---------- 13. Telegram 3500 字安全分块 ----------
console.log('\n[13] Telegram 安全分块');
{
	const hasBalancedTelegramHtml = (text) => {
		const stack = [];
		for (const match of String(text).matchAll(/<\/?(b|a|code)(?:\s+[^>]*)?>/g)) {
			const tag = match[1];
			const closing = match[0].startsWith('</');
			if (!closing) stack.push(tag);
			else if (stack.pop() !== tag) return false;
		}
		return stack.length === 0;
	};
	const blocks = Array.from({ length: 35 }, (_, i) =>
		`<b>用户 ${i + 1}</b> <a href="tg://user?id=${900000 + i}">姓名&amp;${i + 1}</a> <code>${'备注'.repeat(35)}</code>`
	);
	const chunks = splitTelegramHtmlBlocks(blocks.join('\n\n'));
	assert('长消息会被拆成多块', chunks.length > 1);
	assert('每块都不超过 3500 字', chunks.every((chunk) => telegramMessageLength(chunk) <= 3500));
	const merged = chunks.join('\n\n');
	assert('拆分不丢用户区块', blocks.every((_, i) => merged.includes(`用户 ${i + 1}`)));
	assert('每块 Telegram HTML 标签正确嵌套', chunks.every(hasBalancedTelegramHtml));

	const exact = `<b>${'A'.repeat(3493)}</b>`;
	const exactChunks = splitTelegramHtmlBlocks(exact);
	assert('恰好 3500 字的 HTML 块保持原样', exactChunks.length === 1 && exactChunks[0] === exact);

	const userBlocks = Array.from({ length: 8 }, (_, i) => {
		const id = String(910000 + i);
		return `<b>用户</b> <a href="tg://user?id=${id}">${id}</a> ${'头'.repeat(70)}\n✅ 用户 ${id} 汇总 ${'总'.repeat(35)}\n  ✅ 群甲 ${'甲'.repeat(45)}\n  ✅ 群乙 ${'乙'.repeat(45)}`;
	});
	const atomicChunks = splitTelegramHtmlBlocks(`<b>批量详情</b>\n\n${userBlocks.join('\n\n')}`, 420);
	assert('完整用户区块测试会触发多消息', atomicChunks.length > 1);
	assert('每个完整用户区块只存在于一个 chunk', userBlocks.every((block) => atomicChunks.filter((chunk) => chunk.includes(block)).length === 1));
	assert('原子用户块拆分后每块不超过限制', atomicChunks.every((chunk) => telegramMessageLength(chunk) <= 420));
	assert('原子用户块拆分后 HTML 仍正确嵌套', atomicChunks.every(hasBalancedTelegramHtml));

	const visible = 'A&<>'.repeat(1200);
	const escapedVisible = visible.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const oversized = splitTelegramHtmlBlocks(`<b><a href="tg://user?id=900">${escapedVisible}</a></b>`);
	assert('异常超长单块安全降级为纯文本', oversized.length > 1 && oversized.every((chunk) => telegramMessageLength(chunk) <= 3500 && !/<\/?(?:b|a|code)\b/i.test(chunk)));
	assert('异常超长单块不产生破损 HTML 实体', oversized.every((chunk) => !/&(?!amp;|lt;|gt;|quot;)/.test(chunk)));
	const recovered = oversized.join('').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
	assert('异常超长单块降级后可见内容不丢失', recovered === visible);
}

// ---------- 总结 ----------
console.log(`\n=== 总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
