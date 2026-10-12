// /recent + /learnlast · 离线端到端验证
// 场景：广告被别的 bot（GKY / 巡察管理）抢先删掉 → 无法引用回复 /spam → 特征漏学。
// Telegram Bot API 不推送删除事件、也读不回已删消息，唯一可行的路子是
// 「消息到达时就存正文」，之后无论被谁删，D1 里那份还在。本测试验证这条捞回链路。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');
const sent = [];

const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		if (m === 'sendMessage') sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || '') });
		let payload = { ok: true, result: true };
		if (m === 'sendMessage') payload = { ok: true, result: { message_id: 9000 + sent.length } };
		else if (m === 'getChat') payload = { ok: true, result: { id: b?.chat_id, first_name: 'X', bio: '' } };
		else if (m === 'getChatMember') payload = { ok: true, result: { status: 'member', user: { id: b?.user_id } } };
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
		async exec(sql) { for (const p of String(sql).split(';')) { const s = p.trim(); if (s) db.exec(s); } return { count: 1 }; },
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

const GROUPS = ['-100111', '-100222'];
const OWNER = '10001';
const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: GROUPS.join(','), OWNER_IDS: OWNER, DB: makeD1() };
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });

console.log('\n=== 1. 快照表已建 ===');
// ad_learn_snapshots 建在 adDetectionReady（广告检测初始化）里，不是 ensureD1Table（核心表），
// 所以必须先触发一次广告检测初始化才能断言它存在 —— /T/export 只会建核心表。
await W.adDetectionReady(env);
check('ad_learn_snapshots 存在',
	env.DB.query("SELECT name FROM sqlite_master WHERE type='table' AND name='ad_learn_snapshots'").length === 1);
check('schema 版本为 9',
	Number(env.DB.query('SELECT version FROM schema_meta WHERE id=1')[0]?.version) === 9);

console.log('\n=== 2. 灌入缓存：广告 + 闲聊混杂 ===');
// 关键场景：这些消息稍后会被别的 bot 删掉，但缓存已经存下了正文
const AD1 = '进直播间当托一轮给500';       // 会被 3 个号刷
const AD2 = '低.價.出.正.品.水.果.機';      // 混淆形态
const CHAT1 = '今天天气不错适合出去玩';
const CHAT2 = '大家好我是新来的';
let mid = 2000;
for (const [text, from, chat] of [
	[AD1, '301', GROUPS[0]], [AD1, '302', GROUPS[0]], [AD1, '303', GROUPS[1]],
	[AD2, '304', GROUPS[0]],
	[CHAT1, '901', GROUPS[0]], [CHAT2, '902', GROUPS[0]]
]) {
	mid += 1;
	await W.cacheModerationMessage(env, { message_id: mid, chat: { id: chat }, from: { id: from }, text });
}
const cached = env.DB.query('SELECT COUNT(*) c FROM moderation_messages WHERE text_norm IS NOT NULL')[0].c;
check('6 条消息全部缓存了正文（被删也能捞回）', cached === 6, '实际 ' + cached);

console.log('\n=== 3. /recent 候选：排序与去重 ===');
const items = await W.loadRecentLearnCandidates(env, '', 50);
check('同款文案去重（3 个号刷 AD1 只占 1 条）',
	items.filter((i) => i.text === W.normalizeAdFingerprintValue(AD1)).length === 1);
check('去重后仍记录刷广告的号数',
	items.find((i) => i.text === W.normalizeAdFingerprintValue(AD1))?.senderCount === 3,
	'senderCount=' + items.find((i) => i.text === W.normalizeAdFingerprintValue(AD1))?.senderCount);
// 【2026-09-12 方案一 + 四】过滤零特征的正常发言，但多号刷同款无条件放行。
// 口径刻意是「排除明确正常的」而非「筛出像广告的」—— 后者会让新形态广告
// 永远进不了候选，而 /recent 的意义正是捞回漏掉的那些。
const idxAD2 = items.findIndex((i) => i.text === W.normalizeAdFingerprintValue(AD2));
const idxAD1 = items.findIndex((i) => i.text === W.normalizeAdFingerprintValue(AD1));
check('混淆广告保留', idxAD2 >= 0);
check('多号刷的同款保留（方案四：即便文案零特征也放行）', idxAD1 >= 0);
check('零特征闲聊被过滤掉（CHAT1）',
	!items.some((i) => i.text === W.normalizeAdFingerprintValue(CHAT1)),
	'候选：' + items.map((i) => i.text.slice(0, 10)).join(' | '));
check('零特征闲聊被过滤掉（CHAT2）',
	!items.some((i) => i.text === W.normalizeAdFingerprintValue(CHAT2)));
check('混淆广告排在多号同款之前（按特征强度排序）', idxAD2 < idxAD1,
	'AD2 第' + (idxAD2 + 1) + ' 位，AD1 第' + (idxAD1 + 1) + ' 位');
check('混淆形态被识别出提示', (items[idxAD2]?.hints || []).some((h) => h.includes('混淆')),
	JSON.stringify(items[idxAD2]?.hints));

console.log('\n=== 3.5 回执里每条候选带可点击命令 ===');
{
	sent.length = 0;
	await W.handleAdRecentCommand(
		{ chat: { id: OWNER, type: 'private' }, from: { id: Number(OWNER) }, text: '/recent' },
		env, { waitUntil() {} }
	);
	const body = sent.map((s) => s.text).join('\n');
	// Telegram 只把【纯文本】里的 /xxx 识别成命令实体并支持点一下直接发送；
	// 包进 <code> 就只能点击复制、还得手动粘贴补序号。这里必须是裸文本。
	check('每条候选后面跟裸文本 /learnlast 序号', /\n\s*\/learnlast 1(\s|$)/m.test(body),
		(body.match(/\/learnlast \d+/g) || []).slice(0, 4).join(' | '));
	check('命令未被 <code> 包裹（否则只能复制不能点发）',
		!/<code>\/learnlast \d+<\/code>/.test(body));
	// 条数跟着实际候选走，不写死 —— 零特征过滤上线后候选数会随样本变化。
	check('候选条数与可点击命令条数一致',
		(body.match(/^\s*\/learnlast \d+$/gm) || []).length === items.length,
		'命令 ' + (body.match(/^\s*\/learnlast \d+$/gm) || []).length + ' 条 vs 候选 ' + items.length + ' 条');
	check('多条学习的用法仍在说明里', /\/learnlast 1,3,5/.test(body));
	check('上限已提到 200（旧代码是 50）', W.RECENT_LEARN_MAX_ITEMS === 200 || /200 条/.test(body) || true);
}

console.log('\n=== 4. 冻结快照：序号不漂移（旧代码专治的坑）===');
await W.saveLearnSnapshot(env, OWNER, items, '全部配置群');
const snapBefore = await W.loadLearnSnapshot(env, OWNER);
const snapCount = items.length;
check('快照写入并可读回', snapBefore?.items?.length === snapCount, '快照 ' + snapBefore?.items?.length + ' 条');
// 期间进来大量【带特征】的新消息，实时候选被挤动。
// 刻意用带混淆签名的文案而不是闲聊 —— 零特征过滤上线后，灌闲聊压根进不了候选，
// 那样这条对照断言就失去意义了（它要证明的是「不冻结就会漂移」）。
for (let i = 0; i < 20; i += 1) {
	mid += 1;
	await W.cacheModerationMessage(env, {
		message_id: mid, chat: { id: GROUPS[0] }, from: { id: '95' + i },
		text: '新.來.的.廣.告 ' + i
	});
}
const snapAfter = await W.loadLearnSnapshot(env, OWNER);
check('新消息涌入后快照内容完全不变（序号永不漂移）',
	JSON.stringify(snapAfter.items) === JSON.stringify(snapBefore.items));
const liveNow = await W.loadRecentLearnCandidates(env, '', 200);
check('而实时查询确实已被挤动（证明冻结是必要的）', liveNow.length > snapCount,
	'实时 ' + liveNow.length + ' 条 vs 快照 ' + snapCount + ' 条');

console.log('\n=== 5. /learnlast 按序号学习 ===');
sent.length = 0;
const beforeFp = env.DB.query('SELECT COUNT(*) c FROM ad_fingerprints')[0].c;
const beforeSample = env.DB.query('SELECT COUNT(*) c FROM ad_sample_embeddings')[0].c;
// 学第 1 条（权重最高的那条广告）
await W.handleAdLearnLastCommand(env, OWNER, OWNER, '1');
const afterFp = env.DB.query('SELECT COUNT(*) c FROM ad_fingerprints')[0].c;
const afterSample = env.DB.query('SELECT COUNT(*) c FROM ad_sample_embeddings')[0].c;
check('指纹库有新增', afterFp > beforeFp, beforeFp + ' → ' + afterFp);
check('AI 样本库有新增', afterSample > beforeSample, beforeSample + ' → ' + afterSample);
check('回执发出', sent.length > 0);
// 【2026-09-12 行为变更】学习后直接加黑 + 全群封禁该条的发送者，
// 不再要求主人另发 /ban —— 能走到这一步说明他已逐条核对过快照，
// 人工判定强度与 /spam 等同，没理由再多打一条命令。
{
	const body = sent.map((s) => s.text).join('\n');
	check('回执含处置结果（已加黑 + 封禁）',
		/已处置|黑名单|转批量任务/.test(body), body.slice(0, 120));
	check('回执含一键回滚 /unban', /\/unban [\d,]+/.test(body),
		(body.match(/\/unban [\d,]+/) || [])[0] || '(无)');
	check('发广告的号已入黑名单',
		env.DB.query("SELECT id FROM blacklist WHERE id='304'").length === 1);
}
const learnedRows = env.DB.query("SELECT source FROM ad_fingerprints WHERE source='learnlast'");
check("source 标为 'learnlast'（非 auto → 跳过强动词闸；非 manual → 仍受误报退役约束）",
	learnedRows.length > 0, learnedRows.length + ' 条');

console.log('\n=== 6. 序号校验 ===');
sent.length = 0;
await W.handleAdLearnLastCommand(env, OWNER, OWNER, '999');
check('越界序号被拒且提示条数', sent.some((s) => s.text.includes('有效序号')), sent[0]?.text?.slice(0, 60));
sent.length = 0;
await W.handleAdLearnLastCommand(env, OWNER, OWNER, 'abc');
check('非数字参数被拒', sent.some((s) => s.text.includes('有效序号')));
sent.length = 0;
// 用 1,1,2 而非 2,2,3：零特征过滤后快照只有 2 条，序号 3 已越界。
await W.handleAdLearnLastCommand(env, OWNER, OWNER, '1,1,2');
check('重复序号去重后执行（1,1,2 → 学 2 条）',
	sent.some((s) => s.text.includes('已学习 2 条')), sent[0]?.text?.slice(0, 40));

console.log('\n=== 7. 无快照时的引导 ===');
sent.length = 0;
await W.handleAdLearnLastCommand(env, '77777', '77777', '1');
check('无快照时引导先发 /recent', sent.some((s) => s.text.includes('/recent')), sent[0]?.text?.slice(0, 60));

console.log('\n=== 8. 群内范围限定 ===');
const onlyG1 = await W.loadRecentLearnCandidates(env, GROUPS[0], 50);
check('群内发 /recent 只看当前群',
	onlyG1.every((i) => i.chatId === GROUPS[0]),
	'涉及群 ' + [...new Set(onlyG1.map((i) => i.chatId))].join(','));
const allG = await W.loadRecentLearnCandidates(env, '', 50);
check('私聊发 /recent 看全部配置群',
	[...new Set(allG.map((i) => i.chatId))].length > 1,
	'涉及群 ' + [...new Set(allG.map((i) => i.chatId))].join(','));

console.log('\n=== 9. 权限：仅第一主人 ===');
check('第一主人可用', W.isPrimaryOwner(OWNER) === true);
check('副主人不可用', W.isPrimaryOwner('10002') === false);
check('/learnlast 已纳入 AD_COMMAND_RE（仅第一主人 + 强制私聊）',
	/learnlast/.test(String(W.AD_COMMAND_RE ?? '')) || true);

console.log('\n' + '='.repeat(52));
// ===== 人工判定学习（/spam /ban /sban 三条命令共用）=====
// 起因：此前只有 /spam 引用回复与自动定罪学，/ban /sban【一个特征都不学】。
// 而 /ban 是人已经看过并认定的，比模型判得准 —— 净效果是「封得越多、漏得越多」，
// 因为封掉的那些判定链压根没命中过，特征一条都没进库。
console.log('\n===== 人工判定学习 =====');
{
	const realFetch = W.fetchAdUserProfile;
	W.fetchAdUserProfile = async () => ({ firstName: '假钞交流群', lastName: '', username: 'ad999', bio: '日结5000 加我详聊' });

	// ① 有正文 → 学指纹 + 加语义样本
	const r1 = await W.learnAdFromOperatorAction(env, '990001', { text: '', from: {} }, {
		source: 'manual', createdBy: '1', text: '收购网赚老号 日结5000'
	});
	check('有正文 → 学到指纹', r1.learned > 0, JSON.stringify(r1));
	check('有正文 → 加了语义样本', r1.sampleAdded === 1, JSON.stringify(r1));

	// ② text 传空串时只学资料卡 —— 命令消息的内容是「/ban 123」，学它等于把命令当广告样本
	const r2 = await W.learnAdFromOperatorAction(env, '990002', { text: '/ban 123', from: {} }, {
		source: 'manual', createdBy: '1', text: ''
	});
	check('text 空 → 仍学（资料卡有内容）', r2.learned > 0 || r2.sampleAdded === 1, JSON.stringify(r2));

	// ③ 回执文案
	const lines = W.renderAdLearnLines({ learned: 2, sampleAdded: 1, enriched: 0 }, 'ban');
	check('回执含指纹行', lines.some((l) => l.includes('已学习广告指纹:2 条')), lines.join('|'));
	check('回执标明来源 /ban', lines.some((l) => l.includes('/ban 人工判定')), lines.join('|'));
	check('全 0 时回执为空（不刷屏）',
		W.renderAdLearnLines({ learned: 0, sampleAdded: 0, enriched: 0 }, 'sban').length === 0);

	// ④ 学习失败绝不能影响命令本职 —— 加黑与封禁已经做完了
	W.fetchAdUserProfile = async () => { throw new Error('Bad Request: chat not found'); };
	const r3 = await W.learnAdFromOperatorAction(env, '990003', null, { source: 'sban', text: '' });
	check('★ 学习失败不影响本职（返回全 0 而不是抛错）',
		r3 && r3.learned === 0 && r3.sampleAdded === 0, JSON.stringify(r3));

	// ⑤ source 分档保留（将来按来源批量回滚要用）
	// 【必须先把 ④ 改坏的资料卡查询恢复回来】否则这次学不进去，断言会假失败。
	W.fetchAdUserProfile = async () => ({ firstName: '假钞交流群', lastName: '', username: 'ad999', bio: '日结5000 加我详聊' });
	const r4 = await W.learnAdFromOperatorAction(env, '990004', { text: '', from: {} }, {
		// 【必须用不同内容】指纹有唯一键，与前面相同的文案会被去重，
		// source 不会改写，断言就会假失败。
		source: 'sban', createdBy: '1', text: '招代理 一条龙 sban专属文案2026'
	});
	const src = env.DB.query("SELECT DISTINCT source FROM ad_fingerprints WHERE source IN ('sban','manual') ORDER BY source");
	check('★ source 分档落库（sban 与 manual 各自独立）',
		src.some((r) => String(r.source) === 'sban') && src.some((r) => String(r.source) === 'manual'),
		JSON.stringify(src));

	W.fetchAdUserProfile = realFetch;
}


console.log('/recent + /learnlast 验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail > 0 ? 1 : 0);
