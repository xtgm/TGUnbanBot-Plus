// 同款广告连带查杀 · 离线端到端验证（临时脚本，验完即删）
// 真 SQLite + vm 沙箱实跑，不靠读代码推演。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const banned = [];
const deleted = [];
const sent = [];

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		if (m === 'banChatMember') banned.push(b.chat_id + ':' + b.user_id);
		if (m === 'deleteMessage') deleted.push(b.chat_id + ':' + b.message_id);
		if (m === 'sendMessage') sent.push(String(b.text || ''));
		let payload = { ok: true, result: true };
		if (m === 'getChat') payload = { ok: true, result: { id: b?.chat_id, first_name: 'X', bio: '' } };
		else if (m === 'getChatMember') payload = { ok: true, result: { status: 'member', user: { id: b?.user_id } } };
		else if (m === 'sendMessage') payload = { ok: true, result: { message_id: 9000 + sent.length } };
		return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
	}
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.replace(/export\s+default\s*/, 'globalThis.__h = '), sandbox, { filename: '_worker.js' });
const W = sandbox;

function makeD1() {
	const db = new DatabaseSync(':memory:');
	const nIn = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : typeof v === 'bigint' ? Number(v) : v);
	const nOut = (r) => { if (!r) return null; const o = {}; for (const k of Object.keys(r)) o[k] = typeof r[k] === 'bigint' ? Number(r[k]) : r[k]; return o; };
	const exec = (sql, params) => {
		const st = db.prepare(sql);
		const bd = params.map(nIn);
		const up = sql.trim().slice(0, 6).toUpperCase();
		if (up === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA')) return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		const i = st.run(...bd);
		return { kind: 'write', meta: { changes: Number(i?.changes || 0), last_row_id: Number(i?.lastInsertRowid || 0), rows_written: Number(i?.changes || 0) } };
	};
	const mk = (sql) => {
		const s = { sql, params: [] };
		const a = {
			__d1: s,
			bind(...x) { s.params = x; return a; },
			async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
			async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; },
			async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; }
		};
		return a;
	};
	return {
		prepare: mk,
		// 建表走的是 env.DB.exec（runD1SchemaStatement），mock 必须提供，否则整个 schema 初始化失败
		async exec(sql) {
			for (const part of String(sql).split(';')) {
				const s = part.trim();
				if (s) db.exec(s);
			}
			return { count: 1, duration: 0 };
		},
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; },
		query(sql) { return db.prepare(sql).all().map(nOut); }
	};
}

let pass = 0;
let fail = 0;
function check(label, cond, extra) {
	if (cond) { pass += 1; console.log('  ✅ ' + label + (extra ? '  ' + extra : '')); }
	else { fail += 1; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
}

const GROUPS = ['-100111', '-100222', '-100333'];
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUPS.join(','), OWNER_IDS: '10001', DB: makeD1() };
const AD_TEXT = '来跑分一天一万包吃住有意者私聊我详谈';
const now = Date.now();

await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });

console.log('\n=== 1. 表结构 ===');
const cols = env.DB.query('PRAGMA table_info(moderation_messages)').map((c) => c.name);
check('text_hash + text_norm 已加列', cols.includes('text_hash') && cols.includes('text_norm'), cols.join(','));
const idx = env.DB.query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='moderation_messages'").map((r) => r.name);
check('哈希索引已建（先加列再建索引）', idx.includes('idx_moderation_text_hash'), idx.join(','));

console.log('\n=== 2. 归一化与哈希 ===');
const k1 = W.buildModerationTextKey({ text: AD_TEXT });
const k2 = W.buildModerationTextKey({ text: '  来跑分一天一万包吃住有意者私聊我详谈  ' });
const k3 = W.buildModerationTextKey({ text: '完全不同的另一段文案内容在这里' });
check('同文案（带多余空白）哈希一致', k1.hash === k2.hash, k1.hash);
check('不同文案哈希不同', k1.hash !== k3.hash);
// 【2026-09-11 断言翻转】原为「短文案不参与连带（<12 字）」，而 12 字门槛正是
// 线上两次漏放的原因（「来跑分 一天1万」「来洗钱 挣8千」都是 8 字，恰好被放过）。
// 门槛降到 4 字后这条必须能进；下限只防「在吗」这类退化情形，详见第 10.5 组。
check('8 字短广告可进连带（旧 12 字门槛已废除）', W.buildModerationTextKey({ text: '来跑分 一天1万' }) !== null);
check('过短文案仍被拦（4 字下限）', W.buildModerationTextKey({ text: '在吗' }) === null);
check('斜杠命令不参与连带', W.buildModerationTextKey({ text: '/ban 1919451354 广告号' }) === null);

console.log('\n=== 3. 灌入缓存（5 号刷同款 × 2 群 + 2 个正常号）===');
const AD_USERS = ['201', '202', '203', '204', '205'];
let mid = 1000;
for (const u of AD_USERS) {
	for (const g of GROUPS.slice(0, 2)) {
		mid += 1;
		await W.cacheModerationMessage(env, { message_id: mid, chat: { id: g }, from: { id: u }, text: AD_TEXT });
	}
}
mid += 1;
await W.cacheModerationMessage(env, { message_id: mid, chat: { id: GROUPS[0] }, from: { id: '999' }, text: '大家好我是新来的请多指教' });
mid += 1;
await W.cacheModerationMessage(env, { message_id: mid, chat: { id: GROUPS[0] }, from: { id: '998' }, text: '今天天气不错适合出去玩玩' });
const hashRows = env.DB.query("SELECT COUNT(*) c FROM moderation_messages WHERE text_hash='" + k1.hash + "'")[0].c;
check('同款哈希命中 10 行（5 号 × 2 群）', hashRows === 10, '实际 ' + hashRows);

console.log('\n=== 4. 反查（排除当事人 201）===');
const found = await W.findLinkedSpamTargets(env, k1, '201');
check('排除 /spam 当事人', !found.targets.some((t) => t.userId === '201'));
check('不含正常发言者', !found.targets.some((t) => ['999', '998'].includes(t.userId)));
check('命中 4 个同款号', found.targets.length === 4, '实际 ' + found.targets.length + ' → ' + found.targets.map((t) => t.userId).join(','));
check('跨群聚合（每号 2 群）', found.targets[0]?.chatIds?.size === 2, '实际 ' + found.targets[0]?.chatIds?.size);

console.log('\n=== 5. 哈希碰撞防护 ===');
env.DB.prepare('INSERT INTO moderation_messages (mid,chat_id,from_id,created_at,text_hash,text_norm) VALUES (?,?,?,?,?,?)')
	.bind(9999, GROUPS[0], '777', new Date().toISOString(), k1.hash, '这是碰撞的不同正文内容啊').run();
const f2 = await W.findLinkedSpamTargets(env, k1, '201');
check('哈希相同但正文不同 → 被 text_norm 剔除', !f2.targets.some((t) => t.userId === '777'));

console.log('\n=== 6. 24 小时窗口 ===');
env.DB.prepare('INSERT INTO moderation_messages (mid,chat_id,from_id,created_at,text_hash,text_norm) VALUES (?,?,?,?,?,?)')
	.bind(8888, GROUPS[0], '888', new Date(now - 30 * 3600 * 1000).toISOString(), k1.hash, k1.norm).run();
const f3 = await W.findLinkedSpamTargets(env, k1, '201');
check('30 小时前的同款号被排除', !f3.targets.some((t) => t.userId === '888'));

console.log('\n=== 7. 上限截断（子请求预算所限）===');
for (let i = 0; i < 25; i += 1) {
	mid += 1;
	await W.cacheModerationMessage(env, { message_id: mid, chat: { id: GROUPS[0] }, from: { id: '3' + String(i).padStart(3, '0') }, text: AD_TEXT });
}
const f4 = await W.findLinkedSpamTargets(env, k1, '201');
check('单次最多返回 20 个', f4.targets.length === 20, '实际 ' + f4.targets.length);
check('超限数量已记录', f4.truncated > 0, 'truncated=' + f4.truncated);
check('overflowIds 数量与 truncated 一致（可复制手动处理）', (f4.overflowIds || []).length === f4.truncated);

console.log('\n=== 8. 实际处置（3 号 × 3 群）===');
banned.length = 0;
deleted.length = 0;
const done = await W.enforceLinkedSpamTargets(env, found.targets.slice(0, 3), { operatorId: '10001', note: 'test' });
done.forEach((d) => console.log('     ' + d.userId + ': 黑名单=' + d.blacklistCode + ' 封禁=' + d.banSummary + ' 删=' + d.deleted + '条'));
check('banChatMember 调用 9 次（3 号 × 3 群）', banned.length === 9, '实际 ' + banned.length);
check('deleteMessage 调用 6 次（3 号 × 2 群各 1 条）', deleted.length === 6, '实际 ' + deleted.length);
const bl = env.DB.query('SELECT id FROM blacklist ORDER BY id').map((r) => r.id);
check('3 个号全部入黑名单', bl.length === 3, bl.join(','));

console.log('\n=== 9. 通知与一键回滚 ===');
sent.length = 0;
await W.notifyLinkedSpamResult(env, {
	operatorId: '10001',
	message: { chat: { id: GROUPS[0], title: '测试群' }, from: { id: 10001, first_name: '主人' } },
	sourceUserId: '201', textNorm: k1.norm, done,
	overflowIds: ['301', '302'], truncated: 2
});
const notice = sent.join('\n');
check('通知已发出', sent.length > 0);
check('通知含文案原文（非哈希）', notice.includes('来跑分'));
const m = notice.match(/\/unban ([\d,]+)/);
check('含一键回滚 /unban 命令', Boolean(m), m ? m[0] : '(无)');
check('回滚命令覆盖全部已处置号', m ? m[1].split(',').length === done.length : false);
check('含超限手动处理提示', notice.includes('超出单次上限'));
check('含来源群名与群 ID', notice.includes('测试群') && notice.includes('-100111'));

console.log('\n=== 10. 子请求预算核对（15 群场景）===');
for (const n of [3, 10, 20, 30]) {
	const e = W.estimateBulkTaskSubrequests(n, 15, {});
	const flag = e.total > 1000 ? '撞 1000 硬限' : e.total > 100 ? '转批量任务' : '可同步执行';
	console.log('     ' + String(n).padStart(2) + ' 个号 → ' + String(e.total).padStart(4) + ' 子请求　' + flag);
}
// 实测口径：15 群时 20 个号 = 646、30 个号 = 957，都在 Cloudflare 1000 硬限内。
// 但【上限 20 仍然必要】——真正的约束不是硬限而是安全余量：
//   · 646 已占硬限 65%，30 个号占 96%，一旦某群重试或补删多几条就会溢出；
//   · 群数会随 /addgroup 增长，20 群时 30 个号就是 1272，直接爆。
// 所以上限按「群数增长后仍安全」来定，而不是贴着当前群数的硬限算。
const e20 = W.estimateBulkTaskSubrequests(20, 15, {});
const e30 = W.estimateBulkTaskSubrequests(30, 15, {});
const e30x20g = W.estimateBulkTaskSubrequests(30, 20, {});
check('上限 20 在 15 群时留足余量（<70% 硬限）', e20.total < 700, e20.total + ' / 1000');
check('30 个号在 15 群时已占 95%+ 硬限（余量不足）', e30.total > 900, e30.total + ' / 1000');
check('群数增至 20 时 30 个号会撞硬限（证明上限必要）', e30x20g.total > 1000, e30x20g.total + ' > 1000');
// 所有连带都走批量任务：3 个号已是 119 > 同步预算 100，故同步分支实际不会触发。
const e3 = W.estimateBulkTaskSubrequests(3, 15, {});
check('3 个号已超同步预算 100 → 连带一律走批量任务', e3.total > 100, e3.total + ' > 100');

console.log('\n=== 10.2 批量路径也删同款消息（线上漏删回归）===');
// 线上实测：3 个目标超同步预算 → 走批量任务 → 只加黑封禁，消息原样留在群里。
// 根因是删消息逻辑只写在 enforceLinkedSpamTargets（同步分支），批量分支完全绕过。
// 而 banChatMember 的 revoke_messages 兜不住：它只撤 48 小时内、且要求目标仍在群里 ——
// 线上那个号显示「已注销用户 The account was frozen」，revoke 完全无效。
{
	const jobEnv = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUPS.join(','), OWNER_IDS: '10001', DB: makeD1() };
	await W.__h.fetch(new Request('https://x/T/export'), jobEnv, { waitUntil() {} });
	const msg = { chat: { id: GROUPS[0], title: '测试群', type: 'supergroup' }, from: { id: 10001, first_name: '主人' } };
	// 模拟连带反查整形出的结构：两个目标，各自在两个群有同款消息
	const deleteTargets = {
		'801': { [GROUPS[0]]: [5101, 5102], [GROUPS[1]]: [5103] },
		'802': { [GROUPS[0]]: [5201] }
	};
	const job = await W.createBulkJob(jobEnv, 'spam', ['801', '802'], [], '连带测试', msg, { deleteTargets });
	check('deleteTargets 写入任务 payload', Boolean(job.deleteTargets), JSON.stringify(job.deleteTargets || null));
	check('payload 结构为 用户→群→mid列表',
		Array.isArray(job.deleteTargets?.['801']?.[GROUPS[0]])
		&& job.deleteTargets['801'][GROUPS[0]].length === 2);
	// 普通批量（不传 options）不该带这个字段，避免详情里多出空统计行
	const plainJob = await W.createBulkJob(jobEnv, 'ban', ['901'], [], '普通批量', msg);
	check('普通 /ban 批量不带 deleteTargets', plainJob.deleteTargets === null || plainJob.deleteTargets === undefined);

	// 实跑一个操作分片，验证封禁之后真的发出了 deleteMessage
	deleted.length = 0;
	banned.length = 0;
	job.status = 'running';
	// 结构对齐 prepareBulkJobBatch 真实产出（_worker.js:2825）：
	// actionableIds 是 D1 写库成功/已存在的那批，操作任务 = actionableIds × groupIds。
	job.activeBatch = {
		startCursor: 0, userCount: 2,
		ids: ['801', '802'],
		actionableIds: ['801', '802'],
		groupIds: [...GROUPS],
		operationCursor: 0, totalOperations: 2 * GROUPS.length
	};
	await W.processBulkJobOperationSlice(job, jobEnv);
	check('批量分片发出了 banChatMember', banned.length > 0, banned.length + ' 次');
	check('批量分片发出了 deleteMessage（此前一次都没有）', deleted.length > 0, deleted.length + ' 次');
	// 801 在 -100111 有 2 条、-100222 有 1 条；802 在 -100111 有 1 条 → 共 4 条
	check('删的是精确的那几条同款消息', deleted.includes(GROUPS[0] + ':5101')
		&& deleted.includes(GROUPS[0] + ':5102')
		&& deleted.includes(GROUPS[1] + ':5103')
		&& deleted.includes(GROUPS[0] + ':5201'),
		deleted.join(' '));
	check('未误删无关消息（只删 payload 里列出的 mid）', deleted.length === 4, deleted.join(' '));
	check('删除结果计入统计', Number(job.stats?.linkedMsgDeleted || 0) === 4,
		'已删 ' + job.stats?.linkedMsgDeleted + ' 失败 ' + (job.stats?.linkedMsgDeleteFailed || 0));
}

console.log('\n=== 10.5 门槛 4 字：短广告必须能进（线上两次漏放的形态）===');
// 原先照搬「整段正文指纹」的 12 字门槛是判据错配 —— 那道门槛防的是【自动学习】误伤，
// 而连带的前提是第一主人亲自 /spam，已经过最强人工判定。
// 线上两个真实短广告都是 8 字，全被 12 字门槛放过。
for (const short of ['来跑分 一天1万', '来洗钱 挣8千', '来洗钱挣8千']) {
	const k = W.buildModerationTextKey({ text: short });
	check('短广告可进连带 [' + short + ']', k !== null, k ? '归一化 ' + k.norm.length + ' 字' : '被拒');
}
check('4 字下限仍拦住退化情形（「在吗」）', W.buildModerationTextKey({ text: '在吗' }) === null);
check('恰好 4 字可进', W.buildModerationTextKey({ text: '来洗钱吧' }) !== null);

console.log('\n=== 11. 旧库降级写入（线上事故回归）===');
// 线上真实故障：D1_SCHEMA_VERSION 没提 → ensureD1Table 在 version >= 目标版本时短路 →
// text_hash/text_norm 两列没加上 → 带新列的 INSERT 每条都失败 → 消息缓存整体停写。
// 这里模拟「旧库」：另建一个只有四列的表，验证降级分支能把消息照常写进去。
{
	const legacyEnv = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUPS.join(','), OWNER_IDS: '10001', DB: makeD1() };
	// 手动建旧结构（不含 text_hash / text_norm），并把 schema 版本写成已完成，
	// 让 ensureD1Table 短路 —— 完整复现线上那条路径。
	await legacyEnv.DB.exec('CREATE TABLE IF NOT EXISTS schema_meta (id INTEGER PRIMARY KEY, version INTEGER, updated_at TEXT)');
	await legacyEnv.DB.exec('CREATE TABLE IF NOT EXISTS moderation_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, mid INTEGER, chat_id TEXT, from_id TEXT, created_at TEXT)');
	await legacyEnv.DB.exec('CREATE TABLE IF NOT EXISTS blacklist (id TEXT PRIMARY KEY, reason TEXT, by_user TEXT, at TEXT, note TEXT)');
	await legacyEnv.DB.exec('CREATE TABLE IF NOT EXISTS batch_jobs (id TEXT PRIMARY KEY, type TEXT, status TEXT, payload TEXT NOT NULL, created_at TEXT, updated_at TEXT)');
	await legacyEnv.DB.exec('CREATE TABLE IF NOT EXISTS dynamic_groups (chat_id TEXT PRIMARY KEY, title TEXT, added_by TEXT NOT NULL, added_at TEXT NOT NULL, note TEXT)');
	await legacyEnv.DB.prepare('INSERT OR REPLACE INTO schema_meta (id, version, updated_at) VALUES (1, ?, ?)')
		.bind(99, new Date().toISOString()).run();

	await W.cacheModerationMessage(legacyEnv, {
		message_id: 7001, chat: { id: GROUPS[0] }, from: { id: '601' }, text: AD_TEXT
	});
	const legacyRows = legacyEnv.DB.query('SELECT mid, from_id FROM moderation_messages');
	check('旧库（无新列）消息仍写入成功，清扫能力不受影响', legacyRows.length === 1 && String(legacyRows[0].from_id) === '601',
		'写入 ' + legacyRows.length + ' 行');
	const legacyCols = legacyEnv.DB.query('PRAGMA table_info(moderation_messages)').map((c) => c.name);
	check('确认走的是降级分支（库里确实没有新列）', !legacyCols.includes('text_hash'));
}

console.log('\n=== 11.5 连带仅第一主人可触发（核心安全闸）===');
// 误封的根源不是「代码判得不准」而是「谁有资格触发这个不可逆的批量操作」——
// 线上那次误封（管理员回复「广告」封了 14 个群）正是触发权开给群管理员的后果。
// 连带的杀伤力是单次封禁的 N 倍，所以只给第一主人。
{
	// 沙箱里 OWNER_IDS = '10001'（第一个即第一主人）
	check('第一主人 isPrimaryOwner 为真', W.isPrimaryOwner('10001') === true);
	check('副主人不是第一主人', W.isPrimaryOwner('10002') === false);
	check('超级管理员不是第一主人', W.isPrimaryOwner('20001') === false);
	check('群管理员不是第一主人', W.isPrimaryOwner('30001') === false);
	// isPrimaryOwner 只认 OWNER_IDS[0]，这是连带的唯一准入判据
	W.applyRuntimeConfig(W.loadRequiredConfig({
		TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUPS.join(','), OWNER_IDS: '10001,10002'
	}));
	check('多主人配置下仍只认第一个', W.isPrimaryOwner('10001') === true && W.isPrimaryOwner('10002') === false);
	// 还原沙箱配置，避免影响后续用例
	W.applyRuntimeConfig(W.loadRequiredConfig({
		TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUPS.join(','), OWNER_IDS: '10001'
	}));
}

console.log('\n=== 12. 同步/批量分流按预算动态判断 ===');
// 当前沙箱只有 3 个群，少群场景下小批量应当可以同步执行。
check('3 群 + 2 个目标 → 同步执行', W.shouldRunLinkedSpamSync(2) === true);
check('3 群 + 20 个目标 → 转批量任务', W.shouldRunLinkedSpamSync(20) === false);
const b3 = W.shouldUseBulkQueue(2, 3, { probeMembership: false });
const b15 = W.shouldUseBulkQueue(2, 15, { probeMembership: false });
console.log('     3 群 2 号 → ' + b3.estimate.total + ' 子请求，useQueue=' + b3.useQueue);
console.log('     15 群 2 号 → ' + b15.estimate.total + ' 子请求，useQueue=' + b15.useQueue);
check('同一目标数在群多时自动改走批量（不写死号数是必要的）', b3.useQueue === false && b15.useQueue === true);

console.log('\n' + '='.repeat(52));
console.log('连带查杀验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail > 0 ? 1 : 0);
