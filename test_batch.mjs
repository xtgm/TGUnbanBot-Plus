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
	BATCH_LIMIT,
} = sandbox.__exports;

// ---------- 伪 D1 ----------
function makeFakeDB() {
	const rows = new Map();
	return {
		_rows: rows,
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
						const id = bound[0];
						return rows.has(id) ? { id } : null;
					}
					return null;
				},
				async run() {
					if (sql.startsWith('INSERT OR IGNORE INTO blacklist')) {
						const [id, reason, by, at] = bound;
						if (rows.has(id)) {
							return { meta: { changes: 0 } };
						}
						rows.set(id, { id, reason, by_user: by, at });
						return { meta: { changes: 1 } };
					}
					if (sql.startsWith('DELETE FROM blacklist WHERE id = ?')) {
						const id = bound[0];
						const had = rows.delete(id);
						return { meta: { changes: had ? 1 : 0 } };
					}
					return { meta: { changes: 0 } };
				},
				async all() {
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

// ---------- 总结 ----------
console.log(`\n=== 总计 ${pass + fail} 项，通过 ${pass}，失败 ${fail} ===`);
process.exit(fail === 0 ? 0 : 1);
