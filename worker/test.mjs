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
let lastVerifyBody = null;
globalThis.fetch = async (url, opts = {}) => {
  url = String(url);
  if (url === 'https://steamcommunity.com/openid/login') {
    lastVerifyBody = new URLSearchParams(String(opts.body));
    return new Response(`ns:http://specs.openid.net/auth/2.0\nis_valid:${steamValid}\n`);
  }
  if (url.startsWith('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/')) {
    return Response.json({ response: { players: [{ personaname: 'Тест <b>', avatarfull: 'https://avatars.example/a.jpg' }] } });
  }
  throw new Error('unexpected fetch ' + url);
};

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

async function startLogin(env) {
  const r = await call('/auth/steam?return=' + encodeURIComponent(SITE), {}, env);
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
  assert.ok(loc.startsWith(SITE + '#/auth/'), loc);
  return loc.slice((SITE + '#/auth/').length);
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
    assert.equal(user.avatar, 'https://avatars.example/a.jpg');
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
    const fake = `${W}/auth/steam/callback?return=${encodeURIComponent('https://pavl1k999.github.io/other/')}`;
    const path = steamAnswer(fake).replace(encodeURIComponent('https://pavl1k999.github.io/other/'), encodeURIComponent(SITE));
    // return в адресе не совпадает с return внутри подписанного return_to
    assert.equal(tokenFrom(await call(path, {}, env)), 'error-invalid');
  },
  async 'open redirect на чужой сайт невозможен'() {
    const env = baseEnv();
    const r = await call('/auth/steam?return=' + encodeURIComponent('https://evil.example/'), {}, env);
    assert.equal(r.status, 400);
    const r2 = await call('/auth/steam/callback?return=' + encodeURIComponent('https://evil.example/'), {}, env);
    assert.equal(r2.status, 400);
    const r3 = await call('/auth/steam?return=' + encodeURIComponent('javascript:alert(1)'), {}, env);
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
    const forged = Buffer.from(JSON.stringify({ sid: '76561198000000000', exp: 9e9 })).toString('base64url') + '.' + sig;
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
    assert.equal(user.name, 'Steam ' + SID.slice(-4));
    const r = await call('/api/state', { headers: { authorization: 'Bearer ' + token } }, env);
    assert.equal(r.status, 501);
  },
  async 'без SESSION_SECRET сервер не выдаёт токены'() {
    const r = await call('/auth/steam?return=' + encodeURIComponent(SITE), {}, { ...baseEnv(), SESSION_SECRET: '' });
    assert.equal(r.status, 500);
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
