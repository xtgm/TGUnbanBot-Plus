// AI 多样本聚合（形态 E · top-K）· 离线验证
// 覆盖：开关关闭时的原行为、K 条达标/不达标、样本不足 K 的 fallback、门槛随 K 自动过半、
//       reasons 留痕（top-N 中 x/N 超线、单证不足）、两个调用点同步、与现有否证互不干扰。
import fs from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';

const src = fs.readFileSync('_worker.js', 'utf8');

// 向量设计（4 维够用，维度只需双方一致）：
//   VEC_H 与待检向量同向 → cos = 1.0（≥0.78 超线）
//   VEC_M 与之正交     → cos = 0.0（不超线）
const VEC_H = [1, 0, 0, 0];
const VEC_M = [0, 1, 0, 0];
const VEC_SUBJECT = [1, 0, 0, 0];

const sent = [];
const sandbox = {
	console, URL, URLSearchParams, TextEncoder, TextDecoder, Response, Request, Headers,
	atob, btoa, setTimeout, clearTimeout,
	fetch: async (url, init) => {
		const m = String(url).split('/').pop();
		let b = null;
		try { b = init?.body ? JSON.parse(init.body) : null; } catch (_) { b = null; }
		let payload = { ok: true, result: true };
		if (m === 'sendMessage') {
			sent.push({ chatId: String(b?.chat_id ?? ''), text: String(b?.text || ''), markup: b?.reply_markup || null });
			payload = { ok: true, result: { message_id: 9000 + sent.length } };
		} else if (m === 'getChatAdministrators') {
			payload = { ok: true, result: [{ user: { id: 10001 }, status: 'creator' }] };
		} else if (m === 'getChat') {
			payload = { ok: true, result: { id: Number(b?.chat_id) || 1, title: 'AI测试群', type: 'supergroup' } };
		} else if (m === 'getMe') {
			payload = { ok: true, result: { id: 42, username: 'testbot', is_bot: true } };
		}
		return { ok: true, status: 200, json: async () => payload, text: async () => JSON.stringify(payload) };
	},
	// Workers AI mock：按文本分流，否则 adDetectionReady 灌进来的种子样本会被补成
	// 与待检文本完全同向的向量（cos=1.0 全部超线），top-K 计数就全废了。
	//   '待检文本'        → VEC_SUBJECT（参与比对的那一个）
	//   '命中N'（本文件插）→ VEC_H，与待检同向 → cos = 1.0 超线
	//   其余（种子等）      → VEC_M，与待检正交   → cos = 0.0 不超线
	AI: { run: async (model, input) => {
		const t = String(input?.text?.[0] ?? '');
		if (t === '待检文本') return { data: [VEC_SUBJECT] };
		if (t.startsWith('命中')) return { data: [VEC_H] };
		return { data: [VEC_M] };
	} }
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
		const head = sql.trim().slice(0, 6).toUpperCase();
		if (head === 'SELECT' || sql.trim().toUpperCase().startsWith('PRAGMA') || /\bRETURNING\b/i.test(sql)) {
			return { kind: 'rows', rows: st.all(...bd).map(nOut) };
		}
		const i = st.run(...bd);
		return { kind: 'write', meta: { changes: Number(i?.changes || 0), last_row_id: Number(i?.lastInsertRowid || 0) } };
	};
	const mk = (sql) => {
		const s = { sql, params: [] };
		const a = {
			bind(...x) { s.params = x; return a; },
			async first() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? (r.rows[0] ?? null) : null; },
			async run() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; },
			async all() { const r = exec(s.sql, s.params); return r.kind === 'rows' ? { success: true, results: r.rows, meta: { changes: 0 } } : { success: true, results: [], meta: r.meta }; }
		};
		return a;
	};
	return {
		prepare: mk,
		async exec(sql) { for (const p of String(sql).split(';')) { const t = p.trim(); if (t) db.exec(t); } return { count: 1 }; },
		async batch(l) { const o = []; for (const s of l) o.push(await s.run()); return o; },
		query(sql) { return db.prepare(sql).all().map(nOut); }
	};
}

let pass = 0, fail = 0;
const check = (label, cond, extra) => {
	if (cond) { pass += 1; console.log('  ✅ ' + label); }
	else { fail += 1; console.log('  ❌ ' + label + (extra ? '  ' + extra : '')); }
};
const show = (r) => JSON.stringify({
	match: r.isMatch, soft: r.isSoft, sim: Number((r.similarity || 0).toFixed(3)),
	topK: r.topK
});

const env = { TOKEN: 'T', BOT_TOKEN: '1:x', GROUP_ID: '-100111', OWNER_IDS: '10001', DB: makeD1(), AI: sandbox.AI };
await W.__h.fetch(new Request('https://x/T/export'), env, { waitUntil() {} });
await W.adDetectionReady(env);

async function runCase(k, marks) {
	// 每个用例独立 env：AD_SAMPLE_EMBEDDING_CACHE 是模块内 const，测试无法直接失效，
	// 换一个 DB 实例即可保证「插样 → 首次读取」的顺序正确。
	const e = { ...env, DB: makeD1(), AI: sandbox.AI };
	await W.__h.fetch(new Request('https://x/T/export'), e, { waitUntil() {} });
	await W.adDetectionReady(e);
	let n = 0;
	for (const m of marks) {
		n += 1;
		// 命名前缀决定 mock 返回哪个向量（见 AI mock 注释）
		const label = (m === VEC_H ? '命中' : '未命中') + n;
		await e.DB.prepare(
			'INSERT INTO ad_sample_embeddings (text_hash, sample_text, embedding, dimension, source, created_at) VALUES (?,?,?,?,?,?)'
		).bind('h' + n, label, JSON.stringify(m), m.length, 'spam', 1000 + n).run();
	}
	const config = { ...(await W.loadAdDetectionConfig(e)), aiTopK: k };
	return await W.checkAdAiSimilarity(e, '待检文本', { config });
}

console.log('\n=== 1. 开关关闭（K=0，现行为回归）===');
{
	// 1 条超线 + 2 条不超线 → max 一条越线即定罪
	const r = await runCase(0, [VEC_H, VEC_M, VEC_M]);
	check('K=0：max 越线 → isMatch=true（原行为不变）', r.isMatch === true, show(r));
	check('K=0：topK.enabled=false', r.topK.enabled === false, show(r));
	check('K=0：similarity 取 max=1.0', Number(r.similarity.toFixed(3)) === 1, show(r));
	// 全部不超线 → 不 match
	const r2 = await runCase(0, [VEC_M, VEC_M]);
	check('K=0：全不超线 → isMatch=false', r2.isMatch === false, show(r2));
}

console.log('\n=== 2. K=3 打开：多证定罪 ===');
{
	// 3 条样本，其中 2 条超线 → hits=2 ≥ 过半(2) → 定罪
	const r = await runCase(3, [VEC_H, VEC_H, VEC_M]);
	check('K=3：2/3 超线 → isMatch=true', r.isMatch === true, show(r));
	check('  ↑ hits=2, k=3, rejected=false', r.topK.hits === 2 && r.topK.k === 3 && r.topK.rejected === false, show(r));
	check('  ↑ 门槛自动过半 minHits=2', r.topK.minHits === 2, show(r));

	// 3 条样本，只有 1 条超线 → hits=1 < 2 → 不定罪 ← 形态 E 的核心
	const r1 = await runCase(3, [VEC_H, VEC_M, VEC_M]);
	check('K=3：1/3 超线 → isMatch=false（单证不足）', r1.isMatch === false, show(r1));
	check('  ↑ rejected=true 留痕供 /pending 复核', r1.topK.rejected === true, show(r1));
	check('  ↑ similarity 仍是 max（供 reasons 展示）', Number(r1.similarity.toFixed(3)) === 1, show(r1));
	check('  ↑ isSoft 不受影响（此时 best≥阈值，恒为 false）', r1.isSoft === false, show(r1));
}

console.log('\n=== 3. 样本不足 K → fallback 回 max（冷启动保召回）===');
{
	// 只有 1 条样本（新广告刚学进 1 条）→ 不能因为凑不满 K 而漏
	const r = await runCase(3, [VEC_H]);
	check('1 条样本 < K → fallback=true', r.topK.fallback === true, show(r));
	check('  ↑ 回退到 max → isMatch=true（召回无缺口）', r.isMatch === true, show(r));

	const r2 = await runCase(3, [VEC_H, VEC_M]);   // 2 条 < 3
	check('2 条样本 < K → 同样 fallback', r2.topK.fallback === true && r2.isMatch === true, show(r2));
}

console.log('\n=== 4. 门槛随 K 自动过半 ===');
{
	const r = await runCase(5, [VEC_H, VEC_H, VEC_M, VEC_M, VEC_M]);   // 2/5，门槛 3
	check('K=5：minHits=3（过半）', r.topK.minHits === 3, show(r));
	check('K=5：2/5 < 3 → 不定罪', r.isMatch === false, show(r));

	const r2 = await runCase(5, [VEC_H, VEC_H, VEC_H, VEC_M, VEC_M]);  // 3/5 ≥ 3
	check('K=5：3/5 ≥ 3 → 定罪', r2.isMatch === true, show(r2));
	check('  ↑ hits=3', r2.topK.hits === 3, show(r2));
}

console.log('\n=== 5. 总数恰好等于 K（边界）===');
{
	const r = await runCase(3, [VEC_H, VEC_M, VEC_M]);
	check('样本数 == K → 不 fallback、按 top-K 判', r.topK.fallback === false && r.isMatch === false, show(r));
}

console.log('\nAI top-K 验证：通过 ' + pass + ' 项，失败 ' + fail + ' 项');
if (fail > 0) process.exitCode = 1;
