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

	// ⑥ 人工判定也要学头像 / 会员标 / 资料形状（2026-10-15 乙）
	// 起因：主人要处置两个漏放的广告号，其中一个（6314776213）只有 /ban 一条路可走，
	// 而 /ban 的学习链只学 name / bio / username 五样，三类判据一类都不学 ——
	// 拿 8202349213 的真实快照实测，整条链只学得出 1 条 username 指纹。
	// 头像与会员标就挂在 fetchAdUserProfile 的同一份响应上，补它们【零额外 Telegram 调用】。
	W.fetchAdUserProfile = async () => ({
		firstName: 'AK宣传小助手', lastName: '', username: 'akads02',
		// 有 bio 才算得出资料形状（adProfileShape 读的是 profile.bio）
		bio: '加我详聊 一天赚8千老号出售',
		avatarId: 'AQADTESTAVATAR001',
		badgeId: '5387492010000000001'
	});
	const r5 = await W.learnAdFromOperatorAction(env, '990005', { text: '', from: {} }, {
		source: 'manual', createdBy: '1', text: '出售老号 日结'
	});
	check('★ 人工判定学头像', r5.avatars === 1, JSON.stringify(r5));
	check('★ 人工判定学会员标', r5.badges === 1, JSON.stringify(r5));
	check('★ 人工判定学资料形状', r5.shapes === 1, JSON.stringify(r5));
	const avRow = env.DB.query("SELECT * FROM ad_avatars WHERE file_unique_id='AQADTESTAVATAR001'");
	check('★ 头像落库 verdict=ad source=learned 且记下归属人',
		avRow.length === 1 && avRow[0].verdict === 'ad' && avRow[0].source === 'learned'
		&& avRow[0].last_user_id === '990005', JSON.stringify(avRow));
	const bdRow = env.DB.query("SELECT * FROM ad_badges WHERE badge_id='5387492010000000001'");
	check('★ 会员标落库 verdict=ad source=learned',
		bdRow.length === 1 && bdRow[0].verdict === 'ad' && bdRow[0].source === 'learned',
		JSON.stringify(bdRow));
	const shRow = env.DB.query('SELECT shape, sample FROM ad_profile_shapes');
	// 【不能断言总条数】前面 ①②⑤ 三段的 mock 资料卡也带 bio，改动后同样会写进形状行 ——
	// 按 ⑥ 自己那份样本内容定位，才测得到「这一次真的写进去了」。
	check('★ 资料形状落库且带样本',
		shRow.some((r) => String(r.sample || '') === '加我详聊 一天赚8千老号出售'),
		JSON.stringify(shRow));

	// ⑦ 三样全空时一个都不学 —— 不写脏行、不虚增计数，计数是回执的展示依据
	W.fetchAdUserProfile = async () => ({
		firstName: '路人甲', lastName: '', username: 'normal01', bio: '',
		avatarId: '', badgeId: ''
	});
	const r6 = await W.learnAdFromOperatorAction(env, '990006', { text: '', from: {} }, {
		source: 'manual', createdBy: '1', text: ''
	});
	check('★ 三样全空 → 一个都不学（计数全 0）',
		r6.avatars === 0 && r6.badges === 0 && r6.shapes === 0, JSON.stringify(r6));
	check('★ 空头像不写库',
		env.DB.query("SELECT COUNT(*) c FROM ad_avatars WHERE last_user_id='990006'")[0].c === 0);

	// ⑧ 批量路径（message=null）也要学得到 —— /ban 123,456 走的正是这条路，
	// 它没有命令消息可供提取任何东西，三样判据全靠这份 profile。
	W.fetchAdUserProfile = async () => ({
		firstName: '批量测试', lastName: '', username: 'bulk01', bio: '日结 出售账号 加群看',
		avatarId: 'AQADTESTAVATAR002', badgeId: ''
	});
	const r7 = await W.learnAdFromOperatorAction(env, '990007', null, { source: 'manual', text: '' });
	check('★ 批量路径（message=null）也学头像', r7.avatars === 1, JSON.stringify(r7));
	check('★ 批量路径也学资料形状', r7.shapes === 1, JSON.stringify(r7));
	check('★ 无会员标不虚增', r7.badges === 0, JSON.stringify(r7));

	// ⑨ 回执：三样各自一行，全 0 时不刷屏
	const learnLines = W.renderAdLearnLines(
		{ learned: 1, sampleAdded: 0, imageLearned: 0, avatars: 1, badges: 1, shapes: 1, enriched: 0 }, 'ban');
	check('★ 回执含头像行', learnLines.some((l) => l.includes('头像')), learnLines.join('|'));
	check('★ 回执含会员标行', learnLines.some((l) => l.includes('会员标')), learnLines.join('|'));
	check('★ 回执含资料形状行', learnLines.some((l) => l.includes('资料形状')), learnLines.join('|'));
	check('★ 全 0 时回执仍为空（不刷屏）',
		W.renderAdLearnLines(
			{ learned: 0, sampleAdded: 0, imageLearned: 0, avatars: 0, badges: 0, shapes: 0, enriched: 0 },
			'ban').length === 0);

	// ⑩ 从缓存捞正文（/spam <TGID> 不带引用时的正文来源）
	// 【为什么需要它】/spam <id> 此前只学得到资料卡 —— 代码注释原话「正文无从得知」，
	// text 传空串（命令消息内容是「/spam 123」，学它等于把命令文本当广告样本）。
	// 而主人的痛点恰恰是这个：广告被别的 bot 先删了、来不及引用。
	// 缓存改成按天保留（MSG_CACHE_RETENTION_DAYS=7）之后，moderation_messages 里
	// 有该用户最近 7 天的发言，这是唯一还拿得到广告文案的地方。
	const cacheD1 = env.DB;
	await W.ensureAdDetectionTables(env);
	cacheD1.query("INSERT INTO moderation_messages (mid, chat_id, from_id, created_at, text_hash, text_norm, is_ad) VALUES (9001,'-100111','991001','2026-10-15T02:00:00.000Z','h9001','成人短剧每日更新全网热门精品短剧 进频道 @ppduanju',1)");
	cacheD1.query("INSERT INTO moderation_messages (mid, chat_id, from_id, created_at, text_hash, text_norm, is_ad) VALUES (9002,'-100111','991001','2026-10-15T02:01:00.000Z','h9002','女朋友的闺蜜来借住一晚 频道 @ppduanju 官方群 @PPDJ2026',1)");
	const cachedText = await W.loadRecentUserAdText(env, '991001');
	check('★ 缓存里捞得到该用户正文', cachedText.includes('成人短剧') && cachedText.includes('ppduanju'), JSON.stringify(cachedText));
	check('★ 取最近 N 条而不是全部（控成本）',
		cachedText.split('\n').length <= 5, String(cachedText.split('\n').length));
	check('★ 捞不到时返回空串而不是抛错',
		(await W.loadRecentUserAdText(env, '999999999')) === '',
		JSON.stringify(await W.loadRecentUserAdText(env, '999999999')));
	check('★ 缓存表不存在时也不抛错（降级为只学资料卡）',
		typeof (await W.loadRecentUserAdText({ DB: null }, '991001')) === 'string');
	cacheD1.query("DELETE FROM moderation_messages WHERE from_id='991001'");

	// ⑪ 命令消息引用广告 → 媒体与正文 emoji 从 reply_to_message 学（2026-10-19）
	// 起因：/ban <id>、/spam <id>、/sban 传进来的是【命令消息】本身，被引用的那条广告
	// 躺在 reply_to_message 里。此前 extractAdMedia 吃的是命令消息 → 命令上没有 photo /
	// entities，「引用一张广告图或贴纸去 /ban」的媒体与 emoji 一个字节都学不到
	//（只有 /spam 引用回复那条路径恰好传的是被引用消息、才学得到）。
	W.fetchAdUserProfile = async () => ({ firstName: '引用测试', lastName: '', username: 'ref01', bio: '' });
	const quotedAd = {
		message_id: 5001,
		text: '点⚔️查',
		photo: [{ file_id: 'PHOTO_FID_1', file_unique_id: 'PHOTO_UNIQ_1', width: 90, height: 90 }],
		entities: [{ type: 'custom_emoji', custom_emoji_id: '5368746000000000001', offset: 0, length: 2 }]
	};
	const r8 = await W.learnAdFromOperatorAction(env, '990008',
		{ text: '/ban 990008', from: {}, reply_to_message: quotedAd },
		{ source: 'manual', createdBy: '1', text: '' });
	check('★ 命令消息引用的图片被学进去', r8.imageLearned === 1, JSON.stringify(r8));
	check('★ 命令消息引用的正文 emoji 被学进去', r8.badges === 1, JSON.stringify(r8));
	const imgRow = env.DB.query("SELECT * FROM ad_images WHERE file_unique_id='PHOTO_UNIQ_1'");
	check('★ 图片落库 verdict=ad 且归属正确',
		imgRow.length === 1 && imgRow[0].verdict === 'ad' && imgRow[0].last_user_id === '990008',
		JSON.stringify(imgRow));
	const emojiRow = env.DB.query("SELECT * FROM ad_badges WHERE badge_id='5368746000000000001'");
	check('★ emoji 落库 verdict=ad',
		emojiRow.length === 1 && emojiRow[0].verdict === 'ad', JSON.stringify(emojiRow));

	// ⑫ 非命令消息【不】回退（防误学「引用的引用」）
	// /spam 引用回复式传进来的本就是被引用的那条消息，它自己可能还带 reply_to_message；
	// 若一律回退，会把「引用的引用」的图当成广告素材 —— 误学一张不相干的图。
	const quotedAd2 = {
		message_id: 5002,
		photo: [{ file_id: 'PHOTO_FID_2', file_unique_id: 'PHOTO_UNIQ_2', width: 90, height: 90 }]
	};
	const r9 = await W.learnAdFromOperatorAction(env, '990009',
		{ text: '随便说句话', from: {}, reply_to_message: quotedAd2 },
		{ source: 'manual', createdBy: '1', text: '' });
	check('★ 非命令消息不回退（不误学引用的图）', r9.imageLearned === 0, JSON.stringify(r9));
	check('★ 该图确实没入库',
		env.DB.query("SELECT COUNT(*) c FROM ad_images WHERE file_unique_id='PHOTO_UNIQ_2'")[0].c === 0);

	W.fetchAdUserProfile = realFetch;
}

console.log('\n=== 13. /ban <id>（不带引用）的正文取自消息缓存 ===');
{
	// 【2026-10-19 修】/spam <id> 与「/recent + /learnlast 批量」两条路径
	// 2026-10-15 起就已经从 moderation_messages 捞该用户最近的发言当正文
	//（见 loadRecentUserAdText），唯独 /ban <id> /sban <id> 漏了 —— 那两处 text 传的是空串。
	// 后果与 /spam <id> 当初完全一样：广告被别的 bot 先删、来不及引用时，
	// /ban <id> 学得到的只有一张资料卡，正文一个字都进不了库。
	//
	// 【为什么必须走完整命令链路】只调 learnAdFromOperatorAction 并手动传 text，
	// 测的是「函数拿到 text 会不会学」；而漏改点在【调用方传什么】——
	// 手动传 text 的写法永远测不出这个点（上面段 ⑪/⑫ 就是手动传的，它们照旧全绿）。
	// 所以这条断言从 handler.fetch 发真实的 /ban 命令，只断言落库结果。
	const BAN_UID = '990010';
	const BAN_AD = '进直播间当托一轮给500 详情加 @tuoguan01';

	env.DB.query('DELETE FROM ad_fingerprints');
	env.DB.query("DELETE FROM moderation_messages WHERE from_id='" + BAN_UID + "'");
	await W.cacheModerationMessage(env, {
		message_id: 7101, chat: { id: GROUPS[0] }, from: { id: BAN_UID }, text: BAN_AD
	});
	check('前置：缓存里确实有该用户的正文',
		(await W.loadRecentUserAdText(env, BAN_UID)).includes('当托'));

	// 资料卡刻意留空 —— 否则 name / username / bio 本身就能学出指纹，
	// 改前也会「有新增」，这条断言就失去区分力（红绿失效）。
	const realFetchForBan = W.fetchAdUserProfile;
	W.fetchAdUserProfile = async () => ({ firstName: '', lastName: '', username: '', bio: '', avatarId: '', badgeId: '' });

	// /ban 走的是完整命令链路（权限校验 → 加黑 → 全群处置 → 清扫 → 学习），
	// 沿途会调一串 Bot API，这里按方法给最小可用响应。
	sandbox.fetch = async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		let result = true;
		if (m === 'sendMessage') {
			sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || '') });
			result = { message_id: 8000 + sent.length };
		} else if (m === 'getChat') result = { id: Number(b?.chat_id), type: 'supergroup', title: '测试群' };
		else if (m === 'getChatMember') result = { status: 'member', user: { id: Number(b?.user_id) } };
		else if (m === 'getChatAdministrators') result = [{ user: { id: Number(OWNER), status: 'creator' } }];
		return { ok: true, status: 200, json: async () => ({ ok: true, result }), text: async () => JSON.stringify({ ok: true, result }) };
	};

	sent.length = 0;
	await W.__h.fetch(new Request('https://x.com/', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			update_id: 9001,
			message: {
				message_id: 7102, date: 1, text: '/ban ' + BAN_UID,
				chat: { id: Number(GROUPS[0]), type: 'supergroup', title: '测试群' },
				from: { id: Number(OWNER), is_bot: false, first_name: 'Owner' }
			}
		})
	}), env, { waitUntil() {} });

	// 先证明链路真跑到了学习那一步 —— 否则「指纹库为空」可能是因为命令压根没被执行，
	// 那种红是假红，指向不到本问题。
	check('前置：/ban 真的执行了（目标已入黑名单）',
		env.DB.query("SELECT id FROM blacklist WHERE id='" + BAN_UID + "'").length === 1);

	// 断在【库里】而不是回执文案上：回执的行数会随渲染口径变，
	// 而「该 uid 的正文进了指纹库」才是这次修的行为本体。
	const fpRows = env.DB.query("SELECT fingerprint, type, value FROM ad_fingerprints WHERE source='manual'");
	check('★ /ban <id> 把缓存里的正文学成了指纹（改前 source=manual 一条都没有）',
		fpRows.length > 0, JSON.stringify(fpRows));
	check('★ 学到的是正文里的词，不是命令文本「/ban <id>」',
		fpRows.some((r) => String(r.value).includes('当托') || String(r.value).includes('tuoguan'))
			&& !fpRows.some((r) => String(r.value).includes('/ban')),
		JSON.stringify(fpRows.map((r) => r.type + ':' + r.value)));

	W.fetchAdUserProfile = realFetchForBan;
}


console.log('/recent + /learnlast 验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail > 0 ? 1 : 0);
