// Тесты сервера входа: node worker/test.mjs
// Steam и Steam Web API подменяются заглушками, сеть не нужна.
import assert from 'node:assert/strict';
import worker from './index.js';

const SITE = 'https://pavl1k999.github.io/caser-2.0/';
const W = 'https://auth.example.workers.dev';
const SID = '76561197960287930';

function kv() {
  const m = new Map();
  return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => void m.set(k, v), _m: m };
}
const baseEnv = () => ({
  SESSION_SECRET: 'test-secret-0123456789abcdef',
  STEAM_API_KEY: 'KEY',
  ALLOWED_ORIGINS: 'https://pavl1k999.github.io, http://localhost:8000',
  STATE: kv(),
});

let steamValid = true;
let steamReply = null; // переопределить ответ Steam целиком
let steamStatus = 200;
let lastVerifyBody = null;
let lastApiHeaders = null;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url === 'https://steamcommunity.com/openid/login') {
    lastVerifyBody = new URLSearchParams(String(opts.body));
    return new Response(steamReply != null ? steamReply : `ns:http://specs.openid.net/auth/2.0\nis_valid:${steamValid}\n`, { status: steamStatus });
  }
  if (url.startsWith('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/')) {
    lastApiHeaders = opts.headers || {};
    return Response.json({ response: { players: [{ personaname: 'Тест <b>', avatarfull: 'https://avatars.steamstatic.com/a_full.jpg' }] } });
  }
  if (url.startsWith('https://steamcommunity.com/profiles/')) {
    return new Response(`<?xml version="1.0"?><profile><steamID64>${SID}</steamID64><steamID><![CDATA[XML Ник]]></steamID><avatarFull><![CDATA[https://avatars.steamstatic.com/xml_full.jpg]]></avatarFull></profile>`);
  }
  throw new Error('unexpected fetch ' + url);
};
const STATE = 'teststate1234567';

const call = (path, init, env) => worker.fetch(new Request(W + path, init), env);

function steamAnswer(returnTo, { sid = SID, nonce } = {}) {
  const p = new URLSearchParams(new URL(returnTo).search);
  const n = nonce || new Date().toISOString().slice(0, 19) + 'Z' + Math.random().toString(36).slice(2, 8);
  const add = {
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${sid}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${sid}`,
    'openid.return_to': returnTo,
    'openid.response_nonce': n,
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'abc=',
  };
  for (const [k, v] of Object.entries(add)) p.set(k, v);
  return new URL(returnTo).pathname + '?' + p;
}

async function startLogin(env, state = STATE) {
  const r = await call('/auth/steam?return=' + encodeURIComponent(SITE) + '&state=' + state, {}, env);
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get('location'));
  assert.equal(loc.origin + loc.pathname, 'https://steamcommunity.com/openid/login');
  assert.equal(loc.searchParams.get('openid.mode'), 'checkid_setup');
  assert.equal(loc.searchParams.get('openid.realm'), W + '/');
  const rt = loc.searchParams.get('openid.return_to');
  assert.ok(rt.startsWith(loc.searchParams.get('openid.realm')), 'realm — префикс return_to');
  return rt;
}
const tokenFrom = (r) => {
  const loc = r.headers.get('location');
  assert.ok(loc && loc.startsWith(SITE + '#/auth/'), String(loc));
  const [token, state] = loc.slice((SITE + '#/auth/').length).split('/');
  assert.equal(state, STATE, 'state возвращается обратно');
  return token;
};
const withSteam = async (reply, status, fn) => {
  steamReply = reply;
  steamStatus = status;
  try { await fn(); } finally { steamReply = null; steamStatus = 200; }
};

const tests = {
  async 'полный вход: токен с ником и аватаром'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    const r = await call(steamAnswer(rt), {}, env);
    assert.equal(r.status, 302);
    const token = tokenFrom(r);
    assert.equal(lastVerifyBody.get('openid.mode'), 'check_authentication');
    assert.equal(lastVerifyBody.get('openid.sig'), 'abc=');
    assert.equal(lastVerifyBody.get('return'), null, 'наши параметры не уходят в Steam');
    const me = await call('/api/me', { headers: { authorization: 'Bearer ' + token } }, env);
    const { user } = await me.json();
    assert.equal(user.sid, SID);
    assert.equal(user.name, 'Тест <b>');
    assert.equal(user.avatar, 'https://avatars.steamstatic.com/a_full.jpg');
    assert.equal(user.v, 1);
    assert.equal(user.aud, 'https://pavl1k999.github.io');
    assert.equal(lastApiHeaders['x-webapi-key'], 'KEY', 'ключ API передаётся заголовком');
  },
  async 'Steam сказал is_valid:false → ошибка'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    steamValid = false;
    try {
      const r = await call(steamAnswer(rt), {}, env);
      assert.equal(tokenFrom(r), 'error-invalid');
    } finally {
      steamValid = true;
    }
  },
  async 'повтор того же ответа отклоняется'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    const ans = steamAnswer(rt);
    assert.notEqual(tokenFrom(await call(ans, {}, env)).slice(0, 6), 'error-');
    assert.equal(tokenFrom(await call(ans, {}, env)), 'error-replay');
  },
  async 'устаревший ответ отклоняется'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    const r = await call(steamAnswer(rt, { nonce: '2020-01-01T00:00:00Zabc' }), {}, env);
    assert.equal(tokenFrom(r), 'error-expired');
  },
  async 'подменённый claimed_id/identity отклоняется'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    const path = steamAnswer(rt).replace(encodeURIComponent(`https://steamcommunity.com/openid/id/${SID}`), encodeURIComponent('https://evil.example/openid/id/' + SID));
    assert.equal(tokenFrom(await call(path, {}, env)), 'error-invalid');
  },
  async 'чужой return_to отклоняется'() {
    const env = baseEnv();
    await startLogin(env);
    const fake = `${W}/auth/steam/callback?return=${encodeURIComponent('https://pavl1k999.github.io/other/')}&state=${STATE}`;
    const path = steamAnswer(fake).replace(encodeURIComponent('https://pavl1k999.github.io/other/'), encodeURIComponent(SITE));
    // return в адресе не совпадает с return внутри подписанного return_to
    assert.equal(tokenFrom(await call(path, {}, env)), 'error-invalid');
  },
  async 'open redirect на чужой сайт невозможен'() {
    const env = baseEnv();
    const r = await call('/auth/steam?state=' + STATE + '&return=' + encodeURIComponent('https://evil.example/'), {}, env);
    assert.equal(r.status, 400);
    const r2 = await call('/auth/steam/callback?state=' + STATE + '&return=' + encodeURIComponent('https://evil.example/'), {}, env);
    assert.equal(r2.status, 400);
    const r3 = await call('/auth/steam?state=' + STATE + '&return=' + encodeURIComponent('javascript:alert(1)'), {}, env);
    assert.equal(r3.status, 400);
  },
  async 'отмена входа'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    const p = new URL(rt);
    p.searchParams.set('openid.mode', 'cancel');
    assert.equal(tokenFrom(await call(p.pathname + p.search, {}, env)), 'error-cancelled');
  },
  async 'поддельный и просроченный токены отклоняются'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    const token = tokenFrom(await call(steamAnswer(rt), {}, env));
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ v: 1, sid: '76561198000000000', exp: 9e9 })).toString('base64url') + '.' + sig;
    for (const t of [forged, body + '.AAAA', 'garbage', '']) {
      const r = await call('/api/me', { headers: { authorization: 'Bearer ' + t } }, env);
      assert.equal(r.status, 401, t);
    }
    const other = { ...env, SESSION_SECRET: 'another-secret-0123456789' };
    assert.equal((await call('/api/me', { headers: { authorization: 'Bearer ' + token } }, other)).status, 401);
  },
  async 'облачное сохранение: запись, чтение, защита от старой версии'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    const token = tokenFrom(await call(steamAnswer(rt), {}, env));
    const h = { authorization: 'Bearer ' + token, 'content-type': 'application/json', origin: 'https://pavl1k999.github.io' };
    let r = await call('/api/state', { headers: h }, env);
    assert.deepEqual(await r.json(), { state: null, updatedAt: 0 });
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://pavl1k999.github.io');
    r = await call('/api/state', { method: 'PUT', headers: h, body: JSON.stringify({ state: { balance: 10 }, updatedAt: 200 }) }, env);
    assert.equal(r.status, 200);
    r = await call('/api/state', { method: 'PUT', headers: h, body: JSON.stringify({ state: { balance: 5 }, updatedAt: 100 }) }, env);
    assert.equal(r.status, 409);
    assert.equal((await r.json()).state.balance, 10);
    r = await call('/api/state', { headers: h }, env);
    assert.equal((await r.json()).state.balance, 10);
    r = await call('/api/state', { method: 'PUT', headers: h, body: 'x'.repeat(1024 * 1024 + 1) }, env);
    assert.equal(r.status, 413);
    r = await call('/api/state', { headers: { ...h, authorization: '' } }, env);
    assert.equal(r.status, 401);
  },
  async 'CORS: чужой origin не получает разрешения'() {
    const env = baseEnv();
    const r = await call('/api/state', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }, env);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
    const ok = await call('/api/state', { method: 'OPTIONS', headers: { origin: 'http://localhost:8000' } }, env);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:8000');
  },
  async 'без KV и без ключа Steam тоже работает'() {
    const env = { ...baseEnv(), STATE: undefined, STEAM_API_KEY: '' };
    const rt = await startLogin(env);
    const token = tokenFrom(await call(steamAnswer(rt), {}, env));
    const { user } = await (await call('/api/me', { headers: { authorization: 'Bearer ' + token } }, env)).json();
    // без ключа API ник и аватар берутся из публичного XML-профиля
    assert.equal(user.name, 'XML Ник');
    assert.equal(user.avatar, 'https://avatars.steamstatic.com/xml_full.jpg');
    const r = await call('/api/state', { headers: { authorization: 'Bearer ' + token } }, env);
    assert.equal(r.status, 501);
  },
  async 'без SESSION_SECRET сервер не выдаёт токены'() {
    const r = await call('/auth/steam?state=' + STATE + '&return=' + encodeURIComponent(SITE), {}, { ...baseEnv(), SESSION_SECRET: '' });
    assert.equal(r.status, 500);
  },
  async 'без state вход не начинается'() {
    const env = baseEnv();
    assert.equal((await call('/auth/steam?return=' + encodeURIComponent(SITE), {}, env)).status, 400);
    assert.equal((await call('/auth/steam?state=<x>&return=' + encodeURIComponent(SITE), {}, env)).status, 400);
  },
  async 'подменённый state в ответе отклоняется'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    const path = steamAnswer(rt).replace('state=' + STATE, 'state=otherstate999');
    const r = await call(path, {}, env);
    assert.ok(r.headers.get('location').includes('error-invalid'));
  },
  async 'чужой op_endpoint и похожий домен отклоняются'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    const a = steamAnswer(rt).replace(encodeURIComponent('https://steamcommunity.com/openid/login'), encodeURIComponent('https://evil.example/openid/login'));
    assert.equal(tokenFrom(await call(a, {}, env)), 'error-invalid');
    const b = steamAnswer(rt).replaceAll(encodeURIComponent('https://steamcommunity.com/openid/id/'), encodeURIComponent('https://staemcommunity.com/openid/id/'));
    assert.equal(tokenFrom(await call(b, {}, env)), 'error-invalid');
  },
  async 'неподписанный return_to отклоняется'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    const path = steamAnswer(rt).replace(encodeURIComponent('signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle'), encodeURIComponent('signed,op_endpoint,claimed_id,identity,response_nonce'));
    assert.equal(tokenFrom(await call(path, {}, env)), 'error-invalid');
  },
  async 'ответ Steam без строки ns или с ошибкой HTTP'() {
    const env = baseEnv();
    let rt = await startLogin(env);
    await withSteam('is_valid:true\n', 200, async () => assert.equal(tokenFrom(await call(steamAnswer(rt), {}, env)), 'error-invalid'));
    rt = await startLogin(env);
    await withSteam('', 429, async () => assert.equal(tokenFrom(await call(steamAnswer(rt), {}, env)), 'error-ratelimit'));
    rt = await startLogin(env);
    await withSteam('', 500, async () => assert.equal(tokenFrom(await call(steamAnswer(rt), {}, env)), 'error-steam'));
  },
  async 'неудачная проверка не тратит запись KV'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    steamValid = false;
    try { await call(steamAnswer(rt), {}, env); } finally { steamValid = true; }
    assert.equal([...env.STATE._m.keys()].filter((k) => k.startsWith('nonce:')).length, 0);
  },
  async 'SteamID вне диапазона 7656… отклоняется'() {
    const env = baseEnv();
    const rt = await startLogin(env);
    assert.equal(tokenFrom(await call(steamAnswer(rt, { sid: '12345678901234567' }), {}, env)), 'error-invalid');
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    await fn();
    console.log('ok   ', name);
  } catch (e) {
    failed++;
    console.log('FAIL ', name, '\n     ', e.message);
  }
}
console.log(failed ? `\n${failed} тест(ов) упало` : '\nвсе тесты прошли');
process.exit(failed ? 1 : 0);
