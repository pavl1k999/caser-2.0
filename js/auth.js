/* Вход через Steam (OpenID 2.0) и облачные сохранения. */
(function () {
  'use strict';
  const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
  const OPENID_NS = 'http://specs.openid.net/auth/2.0';
  const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
  const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(7656\d{13})\/?$/;
  // бесплатный KV Cloudflare — 1000 записей в сутки, поэтому в облако пишем не чаще раза в минуту и при уходе со страницы
  const SYNC_DELAY = 60000;
  const STATE_KEY = 'casesim_login_state';

  const api = () => App.config.authApi;
  const siteBase = () => location.origin + location.pathname;
  const fromB64url = (s) => {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  };

  const auth = (App.auth = {
    sync: 'off', // off | idle | saving | error
    syncError: '',
  });

  auth.canLogin = () => /^https?:$/.test(location.protocol);

  // Переход на официальный steamcommunity.com — пароль вводится только там.
  auth.login = () => {
    if (!auth.canLogin()) {
      App.toast('Вход через Steam работает, когда сайт открыт по адресу http(s)://, а не как файл', 'error');
      return;
    }
    if (api()) {
      // одноразовый state против подмены входа (login CSRF): сервер вернёт его вместе с токеном
      const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
      try { sessionStorage.setItem(STATE_KEY, state); } catch (e) { /* ignore */ }
      location.href = `${api()}/auth/steam?return=${encodeURIComponent(siteBase())}&state=${state}`;
      return;
    }
    const q = new URLSearchParams({
      'openid.ns': OPENID_NS,
      'openid.mode': 'checkid_setup',
      'openid.return_to': `${siteBase()}?steam_return=1`,
      'openid.realm': location.origin + '/',
      'openid.identity': IDENTIFIER_SELECT,
      'openid.claimed_id': IDENTIFIER_SELECT,
    });
    location.href = `${STEAM_OPENID}?${q}`;
  };

  auth.logout = () => {
    App.writeState(App.stateKey(), App.state);
    App.setSession(null);
    App.loadState(App.readState(App.stateKey()) || App.defaults());
    auth.sync = 'off';
    App.toast('Вы вышли из аккаунта Steam', 'success');
  };

  // Вход выполнен: переключаемся на сохранение этого аккаунта
  function signIn(session) {
    const guestKey = App.stateKey(null);
    const accKey = App.stateKey(session.sid);
    let st = App.readState(accKey);
    const isNew = !st;
    if (isNew) {
      // новый аккаунт: стартовый баланс; прогресс, накопленный гостем в прошлых версиях сайта, переносим
      const legacy = App.readState(guestKey);
      st = legacy && (legacy.stats.opened || legacy.items.length) ? legacy : App.defaults();
      App.writeState(guestKey, App.defaults());
      st.nick = session.name ? session.name.slice(0, 20) : `Игрок ${session.sid.slice(-4)}`;
    } else if (session.name && session.verified) {
      st.nick = session.name.slice(0, 20);
    }
    st.steam = { sid: session.sid, since: st.steam ? st.steam.since : Date.now() };
    App.setSession(session);
    App.loadState(st);
    App.closeLogin && App.closeLogin();
    App.toast(isNew ? `Аккаунт создан: ${App.esc(st.nick)}. На счету ${App.fmt(st.balance)} монет` : `С возвращением, ${App.esc(st.nick)}!`, 'success');
    if (session.token) pull();
    // без сервера Steam не отдаёт ник — предлагаем выбрать его один раз
    if (isNew && !session.name) setTimeout(askNick, 400);
  }

  function askNick() {
    const m = App.modal(`<div class="nick-modal"><h2>Как вас называть?</h2>
      <p class="muted">Ник увидят соперники в батлах и лента дропов. Его можно поменять в профиле.</p>
      <form id="nickForm" class="row"><input id="nickIn" maxlength="20" value="${App.esc(App.state.nick)}" autocomplete="off"><button class="btn btn-accent">Сохранить</button></form></div>`, { cls: 'modal-sm' });
    const inp = App.$('#nickIn');
    inp.focus();
    inp.select();
    App.$('#nickForm').onsubmit = (e) => {
      e.preventDefault();
      const v = inp.value.trim().slice(0, 20);
      if (v) {
        App.state.nick = v;
        App.save();
      }
      m.close();
    };
  }

  // окно входа: показывается при любой попытке играть без аккаунта
  let loginModal = null;
  App.closeLogin = () => loginModal && loginModal.close();
  App.on('need-login', () => {
    if (loginModal) return;
    loginModal = App.modal(`<div class="login-modal">
        <div class="login-art">${App.art ? App.art.hero() : ''}</div>
        <h2>Войдите, чтобы играть</h2>
        <p>Аккаунт создаётся автоматически при первом входе через Steam. Сразу на счету <b>${App.fmt(App.config.startBalance)} монет</b>, дальше — бонусы каждый день.</p>
        <ul class="login-list">
          <li>${App.config.authApi ? 'Ник и аватар подтягиваются из Steam' : 'Аккаунт привязан к вашему SteamID'}</li>
          <li>Свой инвентарь, уровень и статистика</li>
          <li>Только виртуальные монеты — никаких пополнений и выводов</li>
        </ul>
        <button class="steam-btn steam-btn-lg" id="loginGo"><i class="steam-ic"></i><span>Войти через Steam</span></button>
        <p class="muted small">Вход проходит на официальном steamcommunity.com — проверьте адрес в строке браузера. Сайт получает только ваш SteamID и никогда не спрашивает пароль или код Steam Guard.</p>
      </div>`, { cls: 'modal-sm', onClose: () => (loginModal = null) });
    App.$('#loginGo').onclick = () => auth.login();
  });

  // Возврат со Steam без сервера: SteamID берём из ответа (без проверки подписи)
  function handleDirectReturn() {
    const p = new URLSearchParams(location.search);
    if (!p.has('steam_return')) return;
    const mode = p.get('openid.mode');
    const m = CLAIMED_ID_RE.exec(p.get('openid.claimed_id') || '');
    // убираем параметры OpenID из адреса
    history.replaceState(null, '', siteBase() + location.hash);
    if (mode === 'cancel') return App.toast('Вход через Steam отменён', 'error');
    if (mode !== 'id_res' || !m || p.get('openid.op_endpoint') !== STEAM_OPENID) {
      return App.toast('Steam вернул некорректный ответ, попробуйте ещё раз', 'error');
    }
    signIn({ sid: m[1], name: '', avatar: '', verified: false, via: 'direct', at: Date.now() });
  }

  const ERRORS = {
    'error-cancelled': 'Вход через Steam отменён',
    'error-invalid': 'Steam не подтвердил вход. Попробуйте ещё раз',
    'error-expired': 'Ответ Steam устарел. Попробуйте ещё раз',
    'error-replay': 'Эта ссылка входа уже использована',
    'error-steam': 'Steam не ответил. Попробуйте ещё раз',
    'error-ratelimit': 'Steam временно ограничил вход, попробуйте через минуту',
  };

  // Возврат с сервера: #/auth/<token>/<state>
  App.route('/auth/:token/:state', (root, { token, state }) => {
    let expected = null;
    try {
      expected = sessionStorage.getItem(STATE_KEY);
      sessionStorage.removeItem(STATE_KEY);
    } catch (e) { /* ignore */ }
    // заменяем адрес с токеном, чтобы он не остался в истории браузера
    const toProfile = () => location.replace(siteBase() + '#/profile');
    if (!expected || expected !== state) {
      App.toast('Вход не подтверждён: начните его заново кнопкой «Войти через Steam» на этом сайте', 'error');
      return toProfile();
    }
    if (ERRORS[token]) {
      App.toast(ERRORS[token], 'error');
      return toProfile();
    }
    let data = null;
    try {
      data = JSON.parse(fromB64url(token.split('.')[0]));
    } catch (e) { /* ignore */ }
    if (!data || !/^7656\d{13}$/.test(data.sid) || !(data.exp > Date.now() / 1000)) {
      App.toast('Не удалось войти: повреждённый токен', 'error');
      return toProfile();
    }
    signIn({ sid: data.sid, name: data.name || '', avatar: data.avatar || '', exp: data.exp, token, verified: true, via: 'server', at: Date.now() });
    toProfile();
  });

  /* ---------------- облачные сохранения ---------------- */
  async function call(method, body) {
    const s = App.session;
    const res = await fetch(`${api()}/api/state`, {
      method,
      headers: { authorization: `Bearer ${s.token}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    return { status: res.status, data };
  }
  const cloudOn = () => !!(api() && App.session && App.session.token);
  const setSync = (v, err = '') => {
    auth.sync = v;
    auth.syncError = err;
    App.emit('sync');
  };

  async function pull() {
    if (!cloudOn()) return;
    setSync('saving');
    try {
      const { status, data } = await call('GET');
      if (status === 401) return expired();
      if (status === 501) return setSync('off', 'Облачные сохранения не настроены на сервере');
      if (status !== 200) throw new Error('HTTP ' + status);
      if (data.state && data.updatedAt > (App.state.updatedAt || 0)) {
        App.loadState(data.state);
        App.toast('Загружено сохранение из облака', 'success');
        setSync('idle');
      } else {
        await push();
      }
    } catch (e) {
      setSync('error', 'Нет связи с сервером сохранений');
    }
  }

  let timer = null;
  let busy = false;
  async function push() {
    if (!cloudOn() || busy) return;
    busy = true;
    setSync('saving');
    try {
      const { status, data } = await call('PUT', { state: App.state, updatedAt: App.state.updatedAt || Date.now() });
      if (status === 401) return expired();
      if (status === 501) return setSync('off', 'Облачные сохранения не настроены на сервере');
      if (status === 409 && data && data.state) {
        App.loadState(data.state);
        App.toast('Загружено более новое сохранение с другого устройства', 'success');
      } else if (status !== 200) throw new Error('HTTP ' + status);
      setSync('idle');
    } catch (e) {
      setSync('error', 'Не удалось сохранить в облако, попробуем позже');
    } finally {
      busy = false;
    }
  }
  function expired() {
    setSync('off');
    App.toast('Сессия Steam истекла, войдите снова', 'error');
    auth.logout();
  }
  App.on('saved', () => {
    if (!cloudOn()) return;
    clearTimeout(timer);
    timer = setTimeout(push, SYNC_DELAY);
  });
  const flush = () => {
    if (cloudOn() && timer) {
      clearTimeout(timer);
      timer = null;
      push();
    }
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  window.addEventListener('pagehide', flush);

  auth.init = () => {
    const s = App.session;
    if (s && s.exp && s.exp < Date.now() / 1000) {
      App.setSession(null);
      App.loadState(App.readState(App.stateKey()) || App.defaults(), { silent: true });
    }
    handleDirectReturn();
    if (cloudOn()) pull();
  };
})();
