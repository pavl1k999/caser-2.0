/* Ядро: утилиты, данные, состояние игрока, звук, модалки, роутер. */
(function () {
  'use strict';
  const App = (window.App = {});

  App.config = Object.assign(
    {
      brand: 'CASE',
      brandAccent: 'SIM',
      currency: 'монет',
      startBalance: 500,
      storageKey: 'casesim_state_v1',
      authApi: '',
    },
    window.CASESIM_CONFIG || {}
  );
  App.config.authApi = String(App.config.authApi || '').replace(/\/+$/, '');

  /* ---------------- утилиты ---------------- */
  App.$ = (s, r = document) => r.querySelector(s);
  App.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  App.el = (html) => {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  App.esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.fmt = (n) => {
    n = Math.round(n * 100) / 100;
    return n.toLocaleString('ru-RU', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  };
  App.coin = (n, cls = '') =>
    `<span class="coin ${cls}"><i class="coin-ic"></i>${App.fmt(n)}</span>`;
  App.rand = (a, b) => a + Math.random() * (b - a);
  App.randInt = (a, b) => Math.floor(App.rand(a, b + 1));
  App.pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
  App.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  App.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  App.weighted = (list, w) => {
    let total = 0;
    for (const x of list) total += w(x);
    let r = Math.random() * total;
    for (const x of list) {
      r -= w(x);
      if (r <= 0) return x;
    }
    return list[list.length - 1];
  };
  App.timeLeft = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const p = (x) => String(x).padStart(2, '0');
    return h ? `${p(h)}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
  };

  /* ---------------- предметы ---------------- */
  App.RARITY = {
    consumer: { name: 'Ширпотреб', color: '#b0c3d9' },
    industrial: { name: 'Промышленное', color: '#5e98d9' },
    milspec: { name: 'Армейское', color: '#4b69ff' },
    restricted: { name: 'Запрещённое', color: '#8847ff' },
    classified: { name: 'Засекреченное', color: '#d32ce6' },
    covert: { name: 'Тайное', color: '#eb4b4b' },
    gold: { name: 'Редкий ★', color: '#e4ae39' },
    contraband: { name: 'Контрабанда', color: '#e4ae39' },
  };
  App.RARITY_ORDER = ['consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert', 'gold', 'contraband'];
  // должно совпадать с scripts/build_data.py
  App.WEARS = [
    // множители цены — медианы Hellcase относительно Field-Tested
    { short: 'FN', name: 'Прямо с завода', max: 0.07, mult: 2.8 },
    { short: 'MW', name: 'Немного поношенное', max: 0.15, mult: 1.5 },
    { short: 'FT', name: 'После полевых испытаний', max: 0.38, mult: 1.0 },
    { short: 'WW', name: 'Поношенное', max: 0.45, mult: 0.94 },
    { short: 'BS', name: 'Закалённое в боях', max: 1.0, mult: 0.89 },
  ];
  App.ST_CHANCE = 0.1;
  App.ST_MULT = 1.6;
  App.wearOf = (fl) => {
    const i = App.WEARS.findIndex((w) => fl < w.max);
    return i < 0 ? 4 : i;
  };

  // картинки: из папки img/ (после scripts/download_images.py) или со Steam CDN
  App.cdnOf = {};
  App.localImg = (key, cdn) => {
    if (!window.LOCAL_IMAGES) return cdn;
    const local = 'img/' + key + '.png';
    App.cdnOf[local] = cdn;
    return local;
  };

  const skinCache = new Map();
  App.skin = (id) => {
    let s = skinCache.get(id);
    if (s) return s;
    const r = DB.skins[id];
    if (!r) return null;
    const [weapon, pattern, rarity, img, cat, min, max, st, base, phase] = r;
    s = {
      id, weapon, pattern, rarity, cat, min, max, st: !!st, base, phase,
      img: App.localImg('skins/' + id, (img.startsWith('http') ? img : DB.img + img) + '/256fx256f'),
      title: (rarity === 'gold' ? '★ ' : '') + weapon,
      sub: (pattern === 'Vanilla' ? 'Классика' : pattern) + (phase ? ' · ' + phase : ''),
    };
    s.wlo = App.wearOf(min);
    s.whi = App.wearOf(Math.max(min, max - 1e-6));
    skinCache.set(id, s);
    return s;
  };
  App.priceOf = (sid, wear, st) => {
    const s = App.skin(sid);
    return Math.max(0.01, Math.round(s.base * App.WEARS[wear].mult * (st ? App.ST_MULT : 1) * 100) / 100);
  };
  // создаёт экземпляр предмета (не добавляет в инвентарь)
  App.makeItem = (sid, opts = {}) => {
    const s = App.skin(sid);
    const raw = opts.fl != null ? opts.fl : App.rand(s.min, s.max);
    const wear = App.wearOf(raw);
    // float храним с 6 знаками; округление не должно перекинуть предмет в соседний износ
    let fl = Math.round(raw * 1e6) / 1e6;
    if (App.wearOf(fl) !== wear) fl = fl > raw ? Math.floor(raw * 1e6) / 1e6 : Math.ceil(raw * 1e6) / 1e6;
    const st = opts.st != null ? opts.st : s.st && Math.random() < App.ST_CHANCE;
    return { uid: App.uid(), sid, fl, wear, st, price: App.priceOf(sid, wear, st), ts: Date.now(), src: opts.src || '', state: 'inv' };
  };
  App.itemName = (it) => {
    const s = App.skin(it.sid);
    return `${it.st ? 'StatTrak™ ' : ''}${s.title} | ${s.sub}${it.wear != null ? ' (' + App.WEARS[it.wear].short + ')' : ''}`;
  };

  /* ---------------- кейсы ---------------- */
  // границы float для конкретного износа с учётом диапазона скина
  App.wearBounds = (s, wear) => [Math.max(s.min, wear ? App.WEARS[wear - 1].max : 0), Math.min(s.max, App.WEARS[wear].max - 1e-6)];

  /*
   * Кейсы — как у Hellcase / Key-Drop / Skin.club:
   *  - у каждого предмета есть строки «износ × StatTrak», у каждой строки своя цена и число билетов из 100 000;
   *  - шанс = билеты / 1000 %, диапазоны билетов идут подряд по возрастанию цены строки;
   *  - выпадает ровно та строка, в чей диапазон попал билет; float выбирается внутри её износа.
   */
  App.TICKETS = 100000;
  App.cases = DB.cases.map((c) => {
    const rows = [];
    const items = c.items.map(([sid, vs]) => {
      const skin = App.skin(sid);
      const card = { sid, skin, rows: [] };
      for (const [wear, st, tickets] of vs) {
        const r = { sid, skin, card, wear, st: !!st, tickets, chance: tickets / App.TICKETS, price: App.priceOf(sid, wear, !!st) };
        card.rows.push(r);
        rows.push(r);
      }
      card.tickets = card.rows.reduce((a, r) => a + r.tickets, 0);
      card.chance = card.tickets / App.TICKETS;
      card.price = card.rows.reduce((a, r) => a + r.price * r.tickets, 0) / card.tickets; // средняя цена дропа этого предмета
      card.lo = Math.min(...card.rows.map((r) => r.price));
      card.hi = Math.max(...card.rows.map((r) => r.price));
      card.wear = card.rows.length === 1 ? card.rows[0].wear : null;
      card.st = card.rows.length === 1 && card.rows[0].st;
      return card;
    });
    rows.sort((a, b) => a.price - b.price || (a.sid < b.sid ? -1 : a.sid > b.sid ? 1 : a.wear - b.wear || a.st - b.st));
    let from = 1;
    for (const r of rows) {
      r.from = from;
      r.to = from + r.tickets - 1;
      from = r.to + 1;
    }
    if (from !== App.TICKETS + 1) console.error(`Кейс ${c.id}: билетов ${from - 1} вместо ${App.TICKETS}`);
    const ev = rows.reduce((a, r) => a + r.chance * r.price, 0);
    return {
      ...c,
      items,
      rows,
      ev,
      rtp: c.price ? ev / c.price : 0,
      payback: c.price ? rows.reduce((a, r) => a + (r.price >= c.price ? r.chance : 0), 0) : 0,
      free: c.group === 'free',
      cover: c.img ? App.localImg('cases/' + c.id, DB.img + c.img + '/256fx256f') : App.skin(c.cover).img,
      isCrate: !!c.img,
    };
  });
  App.caseById = (id) => App.cases.find((c) => c.id === id);
  App.ticketOf = (f) => Math.floor(f * App.TICKETS) + 1;
  App.rowByTicket = (c, ticket) => {
    const r = c.rows.find((x) => ticket >= x.from && ticket <= x.to);
    if (!r) throw new Error(`Билет ${ticket} вне таблицы кейса ${c.id}`);
    return r;
  };
  // отпечаток таблицы билетов: если данные пересоберут, старая проверка предупредит, что таблица другая
  const tableHashes = new Map();
  App.tableHash = (c) => {
    if (!tableHashes.has(c.id)) {
      tableHashes.set(c.id, App.fair.sha256Hex(c.rows.map((r) => `${r.sid}|${r.wear}|${+r.st}|${r.from}|${r.to}`).join('\n')).slice(0, 16));
    }
    return tableHashes.get(c.id);
  };

  /**
   * Открыть кейс. game — генератор из App.fair.begin() (provably fair) или App.fair.random() (боты).
   * Курсор 0 — билет (строка: предмет + износ + StatTrak), курсор 1 — float внутри износа.
   */
  App.rollCase = (c, src, game) => {
    game = game || App.fair.begin('case');
    const ticket = App.ticketOf(game.next());
    const r = App.rowByTicket(c, ticket);
    const [lo, hi] = App.wearBounds(r.skin, r.wear);
    const it = App.makeItem(r.sid, { fl: lo + (hi - lo) * game.next(), st: r.st, src: src || c.name });
    if (game.proof) {
      it.proof = { ...game.proof, caseId: c.id, ticket, table: App.tableHash(c) };
      it.proof.id = App.fair.record(it.proof, { result: App.itemName(it), price: it.price });
    }
    return it;
  };
  // бесплатные кейсы: раз в 24 часа, с нужного уровня
  App.FREE_COOLDOWN = 24 * 3600 * 1000;
  App.freeStatus = (c) => {
    const lvl = App.levelInfo().lvl;
    if (lvl < c.level) return { ok: false, why: `с ${c.level} уровня` };
    const last = (App.state.freeCases || {})[c.id] || 0;
    const left = last + App.FREE_COOLDOWN - Date.now();
    if (left > 0) return { ok: false, left, why: `через ${App.timeLeft(left)}` };
    return { ok: true };
  };
  App.casePriceRange = (c) => [c.rows[0].price, c.rows[c.rows.length - 1].price];

  // каталог для апгрейда и контрактов: все скины во всех доступных износах
  let catalog = null;
  App.catalog = () => {
    if (catalog) return catalog;
    catalog = [];
    for (const id of Object.keys(DB.skins)) {
      const s = App.skin(id);
      for (let w = s.wlo; w <= s.whi; w++) {
        catalog.push({ sid: id, wear: w, st: false, price: App.priceOf(id, w, false) });
      }
    }
    catalog.sort((a, b) => a.price - b.price);
    return catalog;
  };
  // ближайший по цене предмет каталога (бинарный поиск + случайный разброс среди соседей)
  // f — необязательное число [0,1) из provably fair для выбора среди соседей
  App.catalogNear = (price, spread = 6, f = Math.random()) => {
    const cat = App.catalog();
    let lo = 0, hi = cat.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cat[m].price < price) lo = m + 1;
      else hi = m;
    }
    const i = Math.min(cat.length - 1, Math.max(0, lo + Math.floor(f * (2 * spread + 1)) - spread));
    return cat[i];
  };
  App.itemFromCatalog = (e, src) => {
    const s = App.skin(e.sid);
    const lo = Math.max(s.min, e.wear ? App.WEARS[e.wear - 1].max : 0);
    const hi = Math.min(s.max, App.WEARS[e.wear].max - 1e-4);
    return App.makeItem(e.sid, { fl: App.rand(lo, hi), st: e.st, src });
  };

  /* ---------------- состояние игрока ---------------- */
  const defaults = () => ({
    v: 1,
    nick: 'Игрок' + App.randInt(1000, 9999),
    avatar: App.randInt(0, 359),
    balance: App.config.startBalance,
    xp: 0,
    items: [],
    log: [],
    stats: { opened: 0, upgrades: 0, upWins: 0, contracts: 0, battles: 0, batWins: 0, spent: 0, best: null },
    daily: 0,
    faucet: 0,
    promos: [],
    sound: true,
    created: Date.now(),
  });
  App.defaults = defaults;

  // сессия Steam: у каждого аккаунта своё сохранение, у гостя — своё
  const SESSION_KEY = 'casesim_session';
  App.session = null;
  try {
    App.session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch (e) { /* ignore */ }
  App.setSession = (s) => {
    App.session = s;
    try {
      if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else localStorage.removeItem(SESSION_KEY);
    } catch (e) { /* ignore */ }
  };
  App.stateKey = (sid = App.session && App.session.sid) =>
    sid ? `${App.config.storageKey}:${sid}` : App.config.storageKey;
  App.readState = (key) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) { /* приватный режим и т.п. */ }
    return null;
  };
  App.writeState = (key, st) => {
    try {
      localStorage.setItem(key, JSON.stringify(st));
    } catch (e) { /* ignore */ }
  };
  App.state = App.readState(App.stateKey()) || defaults();
  // заменить текущее состояние (вход/выход, облачное сохранение)
  App.loadState = (st, { silent } = {}) => {
    App.state = Object.assign(defaults(), st || {});
    App.writeState(App.stateKey(), App.state);
    if (!silent) App.emit('state');
  };
  App.save = () => {
    const st = App.state;
    // храним всю историю инвентаря, но не бесконечно
    const inv = st.items.filter((i) => i.state === 'inv');
    const old = st.items.filter((i) => i.state !== 'inv').slice(-300);
    st.items = inv.concat(old).sort((a, b) => a.ts - b.ts);
    st.log = st.log.slice(-100);
    st.updatedAt = Date.now();
    App.writeState(App.stateKey(), st);
    App.emit('state');
    App.emit('saved');
  };
  App.reset = () => {
    App.state = defaults();
    App.save();
  };

  const listeners = {};
  App.on = (ev, fn) => {
    (listeners[ev] = listeners[ev] || []).push(fn);
    return () => (listeners[ev] = listeners[ev].filter((f) => f !== fn));
  };
  App.emit = (ev, data) => (listeners[ev] || []).forEach((f) => f(data));

  App.canPay = (n) => App.state.balance + 1e-9 >= n;
  // играть можно только после входа через Steam; без входа сайт открыт для просмотра
  App.loggedIn = () => !!App.session;
  App.requireLogin = () => {
    if (App.loggedIn()) return true;
    App.emit('need-login');
    return false;
  };
  App.pay = (n, what) => {
    if (!App.requireLogin()) return false;
    if (!App.canPay(n)) {
      App.toast('Недостаточно монет. Загляните в раздел «Бонусы»', 'error');
      return false;
    }
    const st = App.state;
    st.balance = Math.round((st.balance - n) * 100) / 100;
    st.stats.spent += n;
    st.xp += n;
    st.log.push({ ts: Date.now(), d: -n, what });
    App.save();
    return true;
  };
  App.credit = (n, what) => {
    const st = App.state;
    st.balance = Math.round((st.balance + n) * 100) / 100;
    st.log.push({ ts: Date.now(), d: n, what });
    App.save();
  };
  App.addItems = (items) => {
    const st = App.state;
    for (const it of items) {
      it.state = 'inv';
      st.items.push(it);
      if (!st.stats.best || it.price > st.stats.best.price) st.stats.best = { ...it };
    }
    App.save();
  };
  App.inventory = () => App.state.items.filter((i) => i.state === 'inv').sort((a, b) => b.ts - a.ts);
  App.findItem = (uid) => App.state.items.find((i) => i.uid === uid);
  App.sellItems = (uids, silent) => {
    let sum = 0, n = 0;
    for (const uid of uids) {
      const it = App.findItem(uid);
      if (it && it.state === 'inv') {
        it.state = 'sold';
        sum += it.price;
        n++;
      }
    }
    if (!n) return 0;
    App.credit(Math.round(sum * 100) / 100, n === 1 ? 'Продажа предмета' : `Продажа ${n} предметов`);
    if (!silent) App.toast(`Продано на ${App.fmt(sum)} ${App.config.currency}`, 'success');
    return sum;
  };
  App.consumeItems = (uids, state) => {
    for (const uid of uids) {
      const it = App.findItem(uid);
      if (it) it.state = state;
    }
    App.save();
  };

  // уровни: xp = потраченные монеты
  App.levelInfo = (xp = App.state.xp) => {
    let lvl = 1;
    const need = (l) => Math.round(150 * Math.pow(l, 1.8));
    while (xp >= need(lvl)) lvl++;
    const prev = lvl === 1 ? 0 : need(lvl - 1);
    return { lvl, cur: xp - prev, next: need(lvl) - prev };
  };
  App.avatarStyle = (hue) =>
    `background:linear-gradient(135deg,hsl(${hue},80%,55%),hsl(${(hue + 60) % 360},80%,40%))`;
  App.avatar = (nick, hue, cls = '', img = '') =>
    img
      ? `<img class="ava ${cls}" src="${App.esc(img)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(App.el(App.avatar(${App.esc(JSON.stringify(nick || '?'))}, ${+hue || 0}, '${cls}')))">`
      : `<span class="ava ${cls}" style="${App.avatarStyle(hue)}">${App.esc((nick || '?').slice(0, 1).toUpperCase())}</span>`;
  // аватар текущего игрока (Steam, если вошёл)
  App.me = () => ({ nick: App.state.nick, hue: App.state.avatar, img: (App.session && App.session.avatar) || '', me: true });
  App.myAvatar = (cls = '') => App.avatar(App.state.nick, App.state.avatar, cls, (App.session && App.session.avatar) || '');

  /* ---------------- звук ---------------- */
  let actx = null;
  function ctx() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    return actx;
  }
  function tone(freq, dur, type = 'square', vol = 0.04, delay = 0) {
    if (!App.state.sound) return;
    const c = ctx();
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  let lastTick = 0;
  App.sound = {
    tick() {
      const now = performance.now();
      if (now - lastTick < 35) return;
      lastTick = now;
      tone(1400, 0.03, 'square', 0.025);
    },
    win(big) {
      const notes = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
      notes.forEach((f, i) => tone(f, 0.18, 'triangle', 0.06, i * 0.08));
    },
    lose() {
      [330, 247].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.04, i * 0.15));
    },
    click() { tone(800, 0.02, 'square', 0.02); },
    shake() { [180, 150, 200, 140].forEach((f, i) => tone(f, 0.09, 'sawtooth', 0.03, i * 0.11)); tone(880, 0.25, 'triangle', 0.05, 0.5); },
  };

  /* ---------------- тосты и модалки ---------------- */
  App.toast = (text, type = 'info') => {
    let box = App.$('#toasts');
    if (!box) {
      box = App.el('<div id="toasts"></div>');
      document.body.appendChild(box);
    }
    const t = App.el(`<div class="toast toast-${type}">${text}</div>`);
    box.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3600);
  };
  App.modal = (inner, opts = {}) => {
    const m = App.el(`<div class="modal-wrap"><div class="modal ${opts.cls || ''}"><button class="modal-x" aria-label="Закрыть">✕</button></div></div>`);
    const box = m.querySelector('.modal');
    if (typeof inner === 'string') box.insertAdjacentHTML('beforeend', inner);
    else box.appendChild(inner);
    const close = () => {
      m.classList.add('out');
      setTimeout(() => m.remove(), 200);
      document.removeEventListener('keydown', onKey);
      opts.onClose && opts.onClose();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    m.addEventListener('click', (e) => {
      if (e.target === m && !opts.sticky) close();
    });
    m.querySelector('.modal-x').onclick = close;
    document.body.appendChild(m);
    return { el: box, close };
  };

  /* ---------------- роутер ---------------- */
  const routes = [];
  App.route = (pattern, render) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ re, keys, render });
  };
  let cleanups = [];
  App.onLeave = (fn) => cleanups.push(fn);
  App.go = (path) => (location.hash = '#' + path);
  App.navigate = () => {
    cleanups.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
    cleanups = [];
    App.$$('.modal-wrap').forEach((m) => m.remove());
    const path = (location.hash.slice(1) || '/').split('?')[0];
    const root = App.$('#page');
    for (const r of routes) {
      const m = path.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        root.innerHTML = '';
        root.className = 'page';
        window.scrollTo(0, 0);
        r.render(root, params);
        App.emit('route', path);
        return;
      }
    }
    App.go('/');
  };
})();
