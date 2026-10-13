/**
 * Сервер входа через Steam для CASESIM (Cloudflare Worker, без зависимостей).
 *
 * Что делает:
 *   GET  /auth/steam?return=<url сайта>   → редирект на официальный steamcommunity.com (OpenID 2.0)
 *   GET  /auth/steam/callback              → проверяет ответ Steam (check_authentication),
 *                                            берёт ник и аватар, возвращает на сайт с токеном в #/auth/<token>
 *   GET  /api/me                           → профиль по токену
 *   GET  /api/state                        → облачное сохранение (нужен KV STATE)
 *   PUT  /api/state                        → записать сохранение
 *
 * Переменные окружения (Settings → Variables):
 *   SESSION_SECRET   (секрет, обязательно) — длинная случайная строка для подписи токенов
 *   STEAM_API_KEY    (секрет, желательно)  — ключ с https://steamcommunity.com/dev/apikey для ника и аватара
 *   ALLOWED_ORIGINS  (обязательно)         — адреса сайта через запятую,
 *                                            например: https://pavl1k999.github.io,http://localhost:8000
 *   STATE            (KV, по желанию)      — привязка KV-хранилища для облачных сохранений
 *
 * Пароли, Steam Guard и прочие данные аккаунта сюда не попадают: вход происходит на сайте Steam,
 * а нам возвращается только подписанный Steam ответ с SteamID.
 */

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656\d{13})\/?$/;
// поля, которые Steam обязан подписать (как проверяет xPaw/SteamOpenID.php)
const MUST_SIGN = ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce'];
const TOKEN_TTL = 7 * 24 * 3600; // 7 дней
const TOKEN_VERSION = 1;
const STEAM_TIMEOUT = 8000;
const NONCE_MAX_AGE = 5 * 60; // ответ Steam действителен 5 минут
const MAX_STATE_BYTES = 1024 * 1024;

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      console.error(e);
      return json({ error: 'internal' }, 500, cors(request, env));
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const headers = cors(request, env);

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 16) {
    return json({ error: 'misconfigured', message: 'SESSION_SECRET не задан (минимум 16 символов)' }, 500, headers);
  }

  switch (url.pathname) {
    case '/':
      return new Response('CASESIM auth: OK', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    case '/auth/steam':
      return login(url, env);
    case '/auth/steam/callback':
      return callback(url, env);
    case '/api/me': {
      const user = await auth(request, env);
      if (!user) return json({ error: 'unauthorized' }, 401, headers);
      return json({ user }, 200, headers);
    }
    case '/api/profile':
      return profile(request, env, headers);
    case '/api/state':
      return state(request, env, headers);
    default:
      return json({ error: 'not_found' }, 404, headers);
  }
}

/* ---------------- вход ---------------- */

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

// куда можно вернуть пользователя: только на разрешённые адреса сайта (защита от open redirect)
function safeReturn(raw, env) {
  if (!raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!allowedOrigins(env).includes(u.origin)) return null;
  u.hash = '';
  return u.toString();
}

// state — случайная строка со страницы сайта: защищает от подсовывания чужого входа (login CSRF)
const STATE_RE = /^[A-Za-z0-9_-]{8,64}$/;

function login(url, env) {
  const ret = safeReturn(url.searchParams.get('return'), env);
  if (!ret) return text('Недопустимый адрес возврата. Добавьте адрес сайта в ALLOWED_ORIGINS.', 400);
  const state = url.searchParams.get('state') || '';
  if (!STATE_RE.test(state)) return text('Нет параметра state.', 400);
  const returnTo = `${url.origin}/auth/steam/callback?return=${encodeURIComponent(ret)}&state=${state}`;
  const q = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': url.origin + '/',
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return Response.redirect(`${STEAM_OPENID}?${q}`, 302);
}

async function callback(url, env) {
  const p = url.searchParams;
  const ret = safeReturn(p.get('return'), env);
  if (!ret) return text('Недопустимый адрес возврата.', 400);
  const state = p.get('state') || '';
  if (!STATE_RE.test(state)) return text('Нет параметра state.', 400);
  const back = (hash) => Response.redirect(`${ret}#/auth/${hash}/${state}`, 302);

  if (p.get('openid.mode') !== 'id_res') return back('error-cancelled');
  if (p.get('openid.ns') !== OPENID_NS || p.get('openid.op_endpoint') !== STEAM_OPENID) return back('error-invalid');
  const m = CLAIMED_ID_RE.exec(p.get('openid.claimed_id') || '');
  if (!m || p.get('openid.identity') !== p.get('openid.claimed_id')) return back('error-invalid');
  const signed = String(p.get('openid.signed') || '').split(',');
  if (!MUST_SIGN.every((f) => signed.includes(f))) return back('error-invalid');

  // return_to в ответе обязан совпадать с адресом, на который пришёл ответ
  let rt;
  try {
    rt = new URL(p.get('openid.return_to') || '');
  } catch (e) {
    return back('error-invalid');
  }
  if (
    rt.origin + rt.pathname !== url.origin + url.pathname ||
    rt.searchParams.get('return') !== p.get('return') ||
    rt.searchParams.get('state') !== state
  ) {
    return back('error-invalid');
  }

  // свежесть ответа (Steam сам подтверждает каждый ответ только один раз)
  const nonce = p.get('openid.response_nonce') || '';
  const ts = Date.parse(nonce.slice(0, 20));
  if (!ts || Math.abs(Date.now() - ts) > NONCE_MAX_AGE * 1000) return back('error-expired');
  const nonceKey = 'nonce:' + nonce;
  if (env.STATE && (await env.STATE.get(nonceKey))) return back('error-replay');

  // проверка подписи на стороне Steam: всегда на зашитый адрес, а не на присланный op_endpoint
  const body = new URLSearchParams();
  for (const [k, v] of p) if (k.startsWith('openid.')) body.set(k, v);
  body.set('openid.mode', 'check_authentication');
  let res, answer;
  try {
    res = await fetch(STEAM_OPENID, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(STEAM_TIMEOUT),
    });
    answer = await res.text();
  } catch (e) {
    return back('error-steam');
  }
  if (res.status === 403 || res.status === 429) return back('error-ratelimit');
  if (!res.ok) return back('error-steam');
  if (!/(^|\n)is_valid\s*:\s*true(\r?\n|$)/.test(answer) || !/(^|\n)ns\s*:\s*http:\/\/specs\.openid\.net\/auth\/2\.0(\r?\n|$)/.test(answer)) {
    return back('error-invalid');
  }
  // отметку об использованном ответе пишем только после успешной проверки (бережём лимит записей KV)
  if (env.STATE) await env.STATE.put(nonceKey, '1', { expirationTtl: 3600 });

  const sid = m[1];
  const profile = await steamProfile(sid, env);
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({ v: TOKEN_VERSION, aud: new URL(ret).origin, sid, name: profile.name, avatar: profile.avatar, iat: now, exp: now + TOKEN_TTL }, env);
  return back(token);
}

async function steamProfile(sid, env) {
  const fallback = { name: 'Steam ' + sid.slice(-4), avatar: '' };
  // 1) Steam Web API, если задан ключ
  if (env.STEAM_API_KEY) {
    try {
      // ключ — в заголовке x-webapi-key, чтобы не светить его в адресе; если Steam его не принял — параметром
      const base = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?steamids=${sid}`;
      let r = await fetch(base, { headers: { 'x-webapi-key': env.STEAM_API_KEY }, signal: AbortSignal.timeout(STEAM_TIMEOUT) });
      if (r.status === 401 || r.status === 403) {
        r = await fetch(`${base}&key=${encodeURIComponent(env.STEAM_API_KEY)}`, { signal: AbortSignal.timeout(STEAM_TIMEOUT) });
      }
      const d = await r.json();
      const pl = d && d.response && d.response.players && d.response.players[0];
      if (pl) return { name: clean(pl.personaname) || fallback.name, avatar: safeUrl(pl.avatarfull || pl.avatarmedium) };
    } catch (e) { /* пробуем публичный профиль */ }
  }
  // 2) публичный XML-профиль: ключ не нужен (работает, если профиль открыт)
  try {
    const r = await fetch(`https://steamcommunity.com/profiles/${sid}/?xml=1`, { signal: AbortSignal.timeout(STEAM_TIMEOUT) });
    const xml = await r.text();
    const tag = (t) => {
      const m = new RegExp(`<${t}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${t}>`).exec(xml);
      return m ? (m[1] != null ? m[1] : m[2]) : '';
    };
    const name = clean(tag('steamID'));
    if (name) return { name, avatar: safeUrl(tag('avatarFull') || tag('avatarMedium')) };
  } catch (e) { /* ignore */ }
  return fallback;
}

const clean = (s) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 32);
// аватар — только https-ссылка на CDN Steam
const safeUrl = (u) => (/^https:\/\/[a-z0-9.-]+\.(steamstatic|akamaihd|steampowered|steamcommunity)\.(com|net)\//i.test(String(u || '')) ? String(u) : '');

/* ---------------- токены ---------------- */

const enc = new TextEncoder();
const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const hmacKey = (env) =>
  crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

async function sign(payload, env) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

async function verify(token, env) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(env), fromB64url(parts[1]), enc.encode(parts[0]));
  } catch (e) {
    return null;
  }
  if (!ok) return null;
  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
  } catch (e) {
    return null;
  }
  if (!data || data.v !== TOKEN_VERSION || !/^7656\d{13}$/.test(data.sid) || !(data.exp > Date.now() / 1000)) return null;
  return data;
}

function auth(request, env) {
  const h = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(\S+)$/.exec(h);
  return m ? verify(m[1], env) : null;
}

/* ---------------- свежий профиль Steam ---------------- */

// ник и аватар могли поменяться в Steam после входа: сайт спрашивает их при каждом заходе.
// Ответ кэшируется в KV на час, чтобы не упираться в лимиты Steam.
const PROFILE_TTL = 3600;
async function profile(request, env, headers) {
  const user = await auth(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401, headers);
  const key = 'profile:' + user.sid;
  if (env.STATE) {
    const cached = await env.STATE.get(key);
    if (cached) return json(JSON.parse(cached), 200, headers);
  }
  const p = await steamProfile(user.sid, env);
  const out = { sid: user.sid, name: p.name, avatar: p.avatar };
  // запасной ник «Steam 1234» не кэшируем: скорее всего Steam просто не ответил
  if (env.STATE && p.avatar) await env.STATE.put(key, JSON.stringify(out), { expirationTtl: PROFILE_TTL });
  return json(out, 200, headers);
}

/* ---------------- облачные сохранения ---------------- */

async function state(request, env, headers) {
  const user = await auth(request, env);
  if (!user) return json({ error: 'unauthorized' }, 401, headers);
  if (!env.STATE) return json({ error: 'no_storage', message: 'KV STATE не подключён' }, 501, headers);
  const key = 'state:' + user.sid;

  if (request.method === 'GET') {
    const raw = await env.STATE.get(key);
    return json(raw ? JSON.parse(raw) : { state: null, updatedAt: 0 }, 200, headers);
  }
  if (request.method === 'PUT') {
    const raw = await request.text();
    if (raw.length > MAX_STATE_BYTES) return json({ error: 'too_large' }, 413, headers);
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return json({ error: 'bad_json' }, 400, headers);
    }
    if (!data || typeof data.state !== 'object' || !data.state) return json({ error: 'bad_state' }, 400, headers);
    const updatedAt = Number(data.updatedAt) || Date.now();
    // не затираем более свежую версию с другого устройства
    const prev = await env.STATE.get(key);
    if (prev) {
      const p = JSON.parse(prev);
      if (p.updatedAt > updatedAt) return json({ error: 'stale', ...p }, 409, headers);
    }
    await env.STATE.put(key, JSON.stringify({ state: data.state, updatedAt }));
    return json({ ok: true, updatedAt }, 200, headers);
  }
  return json({ error: 'method_not_allowed' }, 405, headers);
}

/* ---------------- утилиты ---------------- */

function cors(request, env) {
  const origin = request.headers.get('origin');
  const h = { vary: 'Origin' };
  if (origin && allowedOrigins(env).includes(origin)) {
    h['access-control-allow-origin'] = origin;
    h['access-control-allow-methods'] = 'GET, PUT, OPTIONS';
    h['access-control-allow-headers'] = 'authorization, content-type';
    h['access-control-max-age'] = '86400';
  }
  return h;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function text(msg, status) {
  return new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
