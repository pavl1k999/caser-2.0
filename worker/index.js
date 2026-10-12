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
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
const TOKEN_TTL = 30 * 24 * 3600; // 30 дней
const NONCE_MAX_AGE = 5 * 60; // ответ Steam действителен 5 минут
const MAX_STATE_BYTES = 1024 * 1024;

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      return json({ error: 'internal', message: String(e && e.message || e) }, 500, cors(request, env));
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

function login(url, env) {
  const ret = safeReturn(url.searchParams.get('return'), env);
  if (!ret) return text('Недопустимый адрес возврата. Добавьте адрес сайта в ALLOWED_ORIGINS.', 400);
  const returnTo = `${url.origin}/auth/steam/callback?return=${encodeURIComponent(ret)}`;
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
  const back = (hash) => Response.redirect(`${ret}#/auth/${hash}`, 302);

  if (p.get('openid.mode') !== 'id_res') return back('error-cancelled');
  if (p.get('openid.ns') !== OPENID_NS || p.get('openid.op_endpoint') !== STEAM_OPENID) return back('error-invalid');
  const m = CLAIMED_ID_RE.exec(p.get('openid.claimed_id') || '');
  if (!m || p.get('openid.identity') !== p.get('openid.claimed_id')) return back('error-invalid');

  // return_to в ответе обязан совпадать с адресом, на который пришёл ответ
  let rt;
  try {
    rt = new URL(p.get('openid.return_to') || '');
  } catch (e) {
    return back('error-invalid');
  }
  if (rt.origin + rt.pathname !== url.origin + url.pathname || rt.searchParams.get('return') !== p.get('return')) {
    return back('error-invalid');
  }

  // свежесть и одноразовость ответа
  const nonce = p.get('openid.response_nonce') || '';
  const ts = Date.parse(nonce.slice(0, 20));
  if (!ts || Math.abs(Date.now() - ts) > NONCE_MAX_AGE * 1000) return back('error-expired');
  if (env.STATE) {
    const key = 'nonce:' + nonce;
    if (await env.STATE.get(key)) return back('error-replay');
    await env.STATE.put(key, '1', { expirationTtl: 3600 });
  }

  // проверка подписи на стороне Steam
  const body = new URLSearchParams();
  for (const [k, v] of p) if (k.startsWith('openid.')) body.set(k, v);
  body.set('openid.mode', 'check_authentication');
  const res = await fetch(STEAM_OPENID, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const answer = await res.text();
  if (!res.ok || !/(^|\n)is_valid\s*:\s*true(\n|$)/.test(answer)) return back('error-invalid');

  const sid = m[1];
  const profile = await steamProfile(sid, env);
  const now = Math.floor(Date.now() / 1000);
  const token = await sign({ sid, name: profile.name, avatar: profile.avatar, iat: now, exp: now + TOKEN_TTL }, env);
  return back(token);
}

async function steamProfile(sid, env) {
  const fallback = { name: 'Steam ' + sid.slice(-4), avatar: '' };
  if (!env.STEAM_API_KEY) return fallback;
  try {
    const r = await fetch(
      `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${encodeURIComponent(env.STEAM_API_KEY)}&steamids=${sid}`
    );
    const d = await r.json();
    const pl = d && d.response && d.response.players && d.response.players[0];
    if (!pl) return fallback;
    return { name: String(pl.personaname || fallback.name).slice(0, 32), avatar: String(pl.avatarfull || pl.avatarmedium || '') };
  } catch (e) {
    return fallback;
  }
}

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
  if (!data || !/^\d{17}$/.test(data.sid) || !(data.exp > Date.now() / 1000)) return null;
  return data;
}

function auth(request, env) {
  const h = request.headers.get('authorization') || '';
  const m = /^Bearer\s+(\S+)$/.exec(h);
  return m ? verify(m[1], env) : null;
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
