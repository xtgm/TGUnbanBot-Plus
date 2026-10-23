// Offline Telegram Mini App authentication and HTTP boundary tests.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const source = fs.readFileSync(new URL('./_worker.js', import.meta.url), 'utf8');
const env = { TOKEN: 'offline-admin-token', BOT_TOKEN: '123456:offline-bot-token', GROUP_ID: '-1001234567890', OWNER_IDS: '10001,10002' };
let dbReads = 0;
const quiet = { log() {}, warn() {}, error() {} };
const context = vm.createContext({ console: quiet, URL, URLSearchParams, Request, Response, Headers, TextEncoder, TextDecoder, AbortController, crypto: globalThis.crypto, setTimeout, clearTimeout, fetch: async () => { throw new Error('Unexpected network call'); } });
vm.runInContext(source.replace('export default {', 'globalThis.__handler = {'), context);
assert.equal(typeof context.validateMiniAppInitData, 'function', 'Mini App authentication must exist');
context.applyRuntimeConfig(context.loadRequiredConfig(env));
const now = Math.floor(Date.now() / 1000);
function signed(fields = {}, token = env.BOT_TOKEN) {
  const params = new URLSearchParams({ auth_date: String(now), query_id: 'offline-query', user: JSON.stringify({ id: 10001, first_name: 'Owner' }), ...fields });
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
const valid = signed({ signature: 'telegram-ed25519-field-is-also-hmac-signed', start_param: 'a b/c' });
const auth = await context.validateMiniAppInitData(valid, env.BOT_TOKEN, now);
assert.equal(auth.userId, '10001');
assert.equal(auth.user.first_name, 'Owner');
for (const value of [
  '', valid.replace('Owner', 'Intruder'), signed({}, 'wrong-token'),
  signed({ auth_date: String(now - 3601) }), signed({ auth_date: String(now + 61) }),
  signed({ auth_date: 'not-a-date' }), signed({ auth_date: String(now) + '.0' }),
  signed({ user: 'null' }), signed({ user: '{bad-json' }), signed({ user: JSON.stringify({ id: -1 }) }),
  signed({ user: JSON.stringify({ id: 1.5 }) }), signed({ user: JSON.stringify({ id: 9007199254740992 }) }),
  valid + '&user=' + encodeURIComponent(JSON.stringify({ id: 10002 })),
  valid + '&hash=' + '0'.repeat(64), valid.replace(/hash=[^&]+/, 'hash=bad'),
  signed({ user: JSON.stringify({ id: '10001' }) })
]) await assert.rejects(() => context.validateMiniAppInitData(value, env.BOT_TOKEN, now), e => e.status === 401);
assert.equal((await context.validateMiniAppInitData(signed({ auth_date: String(now - 3600) }), env.BOT_TOKEN, now)).userId, '10001');

// Reject requests before database access and trust only the signed user.
const dbEnv = { ...env, DB: { prepare() { dbReads++; throw new Error('Database must remain untouched'); } } };
context.dispatchMiniAppAction = async (action, body, runtimeEnv, signedAuth) => ({ action, signedUser: signedAuth.userId });
async function send(body, options = {}) {
  const request = new Request('https://bot.example/app/api/' + (options.action || 'bootstrap'), { method: options.method || 'POST', headers: { 'Content-Type': 'application/json', ...options.headers }, body: (options.method === 'GET' ? undefined : options.raw ?? JSON.stringify(body)) });
  return context.__handler.fetch(request, options.env || dbEnv, { waitUntil() {} });
}
for (const body of [{}, { initData: '' }, { initData: signed({ user: JSON.stringify({ id: 10002 }) }) }, { initData: signed({ user: JSON.stringify({ id: 10003 }) }), userId: '10001' }]) {
  const response = await send(body);
  assert.ok([401, 403].includes(response.status));
  assert.equal((await response.json()).success, false);
}
assert.equal(dbReads, 0);
let response = await send({ initData: valid, userId: '10003' });
assert.equal(response.status, 200);
assert.equal((await response.json()).data.signedUser, '10001');
assert.match(response.headers.get('Cache-Control'), /no-store/);
assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
assert.equal((await send({ initData: valid }, { headers: { Origin: 'https://attacker.example' } })).status, 403);
assert.equal((await send({ initData: valid }, { headers: { Origin: 'https://bot.example' } })).status, 200);
assert.equal((await send({}, { method: 'GET' })).status, 405);
assert.equal((await send({}, { raw: '{bad-json' })).status, 400);
assert.equal((await send({}, { raw: 'null' })).status, 400);
assert.equal((await send({}, { raw: '[]' })).status, 400);
assert.equal((await send({}, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
assert.equal((await send({ initData: valid }, { action: 'unknown' })).status, 404);
assert.equal((await send({ initData: valid }, { env: { ...dbEnv, OWNER_IDS: '' } })).status, 403);
assert.equal((await send({}, { raw: JSON.stringify({ initData: valid, padding: 'x'.repeat(33000) }) })).status, 413);
const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('x'.repeat(33000))); controller.close(); } });
response = await context.__handler.fetch(new Request('https://bot.example/app/api/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' }), dbEnv, {});
assert.equal(response.status, 413);
assert.equal(dbReads, 0);

// Public shell needs no config or DB; scripts receive a fresh CSP nonce.
response = await context.__handler.fetch(new Request('https://bot.example/app'), {}, {});
assert.equal(response.status, 200);
assert.match(response.headers.get('Content-Type'), /text\/html/);
assert.match(response.headers.get('Content-Security-Policy'), /nonce-/);
const html = await response.text();
assert.match(html, /telegram\.org\/js\/telegram-web-app\.js/);
assert.ok(!html.includes(env.TOKEN) && !html.includes(env.BOT_TOKEN));
assert.equal((await context.__handler.fetch(new Request('https://bot.example/app', { method: 'POST' }), {}, {})).status, 405);

// Initialization configures only the owner's menu, with a public HTTPS URL.
const calls = [];
context.fetch = async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return Response.json({ ok: true, result: true }); };
context.syncAdGroupAdmins = async () => ({ groups: 0 });
context.applyRuntimeConfig(context.loadRequiredConfig(env));
response = await context.handleInitialization(new Request('https://bot.example/' + env.TOKEN + '?raw=1'), env);
assert.equal(response.status, 200);
const menu = calls.find(call => call.url.endsWith('/setChatMenuButton'));
assert.ok(menu);
assert.equal(menu.body.chat_id, '10001');
assert.equal(menu.body.menu_button.web_app.url, 'https://bot.example/app');
assert.equal(menu.body.menu_button.type, 'web_app');
assert.equal(calls.find(call => call.url.endsWith('/setMyCommands')).body.commands.length, 21);
context.fetch = async (url) => Response.json(url.endsWith('/setChatMenuButton') ? { ok: false, description: 'menu failed' } : { ok: true, result: true });
response = await context.handleInitialization(new Request('https://bot.example/' + env.TOKEN + '?raw=1'), env);
assert.equal(response.status, 500);
assert.equal((await response.json()).MiniApp['\u5df2\u8bbe\u7f6e'], false);
console.log('Mini App authentication, HTTP boundary and owner-menu tests passed');
