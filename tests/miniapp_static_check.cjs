// Mini App 前端静态检查：页面 HTML 从 _worker.js 里现取，不再依赖单独的 fragment 文件。
// 仓库只保留一份前端源码（内联在 _worker.js 的 renderMiniAppHtml 里），
// 这里若再读一个 fragment，改一处忘另一处就会静默漂移。
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', '_worker.js'), 'utf8');
// 只加载定义：把 export default 换成全局赋值，避免把 handler 挂到 ESM 上。
const context = vm.createContext({
	console: { log() {}, warn() {}, error() {} },
	URL, URLSearchParams, Request, Response, Headers, TextEncoder, TextDecoder,
	AbortController, crypto: globalThis.crypto, setTimeout, clearTimeout,
	fetch: async () => { throw new Error('Unexpected network call'); }
});
new vm.Script(source.replace('export default {', 'globalThis.__handler = {')).runInContext(context);

assert.equal(typeof context.renderMiniAppHtml, 'function', 'renderMiniAppHtml 必须内联在 _worker.js 里');
const html = context.renderMiniAppHtml();
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).filter(Boolean);
assert.equal(scripts.length, 1);
for (const script of scripts) new vm.Script(script);
assert(!/BOT_TOKEN|\bTOKEN\b/.test(html));
assert(!/innerHTML|insertAdjacentHTML|document\.write/.test(scripts.join('')));
assert(html.includes('https://telegram.org/js/telegram-web-app.js'));
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'Duplicate IDs');
const accessedIds = [...scripts.join('').matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
for (const id of accessedIds) assert(ids.includes(id), 'Missing element: ' + id);
console.log(JSON.stringify({ htmlBytes: Buffer.byteLength(html), scripts: scripts.length, ids: ids.length, syntax: 'passed', secrets: 'none', dynamicHtml: 'none' }));
