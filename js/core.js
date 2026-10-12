/* Ядро: утилиты, данные, состояние игрока, звук, модалки, роутер. */
(function () {
  'use strict';
  const App = (window.App = {});

  App.config = {
    brand: 'CASE',
    brandAccent: 'SIM',
    currency: 'монет',
    startBalance: 500,
    storageKey: 'casesim_state_v1',
  };

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
    { short: 'FN', name: 'Прямо с завода', max: 0.07, mult: 1.6 },
    { short: 'MW', name: 'Немного поношенное', max: 0.15, mult: 1.2 },
    { short: 'FT', name: 'После полевых испытаний', max: 0.38, mult: 1.0 },
    { short: 'WW', name: 'Поношенное', max: 0.45, mult: 0.85 },
    { short: 'BS', name: 'Закалённое в боях', max: 1.0, mult: 0.75 },
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
    const fl = opts.fl != null ? opts.fl : App.rand(s.min, s.max);
    const wear = App.wearOf(fl);
    const st = opts.st != null ? opts.st : s.st && Math.random() < App.ST_CHANCE;
    return { uid: App.uid(), sid, fl: Math.round(fl * 1e6) / 1e6, wear, st, price: App.priceOf(sid, wear, st), ts: Date.now(), src: opts.src || '', state: 'inv' };
  };
  App.itemName = (it) => {
    const s = App.skin(it.sid);
    return `${it.st ? 'StatTrak™ ' : ''}${s.title} | ${s.sub}${it.wear != null ? ' (' + App.WEARS[it.wear].short + ')' : ''}`;
  };

  /* ---------------- кейсы ---------------- */
  App.cases = DB.cases.map((c) => {
    const total = c.items.reduce((a, [, w]) => a + w, 0);
    const items = c.items.map(([sid, w]) => ({ sid, chance: w / total, skin: App.skin(sid) }));
    return {
      ...c,
      items,
      cover: c.img ? App.localImg('cases/' + c.id, DB.img + c.img + '/256fx256f') : App.skin(c.cover).img,
      isCrate: !!c.img,
    };
  });
  App.caseById = (id) => App.cases.find((c) => c.id === id);
  App.rollCase = (c, src) => {
    const pick = App.weighted(c.items, (x) => x.chance);
    return App.makeItem(pick.sid, { src: src || c.name });
  };
  App.casePriceRange = (c) => {
    let lo = Infinity, hi = 0;
    for (const x of c.items) {
      lo = Math.min(lo, App.priceOf(x.sid, x.skin.whi, false));
      hi = Math.max(hi, App.priceOf(x.sid, x.skin.wlo, x.skin.st));
    }
    return [lo, hi];
  };

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
  App.catalogNear = (price, spread = 6) => {
    const cat = App.catalog();
    let lo = 0, hi = cat.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cat[m].price < price) lo = m + 1;
      else hi = m;
    }
    const i = Math.min(cat.length - 1, Math.max(0, lo + App.randInt(-spread, spread)));
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
  function load() {
    try {
      const raw = localStorage.getItem(App.config.storageKey);
      if (raw) return Object.assign(defaults(), JSON.parse(raw));
    } catch (e) { /* приватный режим и т.п. */ }
    return defaults();
  }
  App.state = load();
  App.save = () => {
    const st = App.state;
    // храним всю историю инвентаря, но не бесконечно
    const inv = st.items.filter((i) => i.state === 'inv');
    const old = st.items.filter((i) => i.state !== 'inv').slice(-300);
    st.items = inv.concat(old).sort((a, b) => a.ts - b.ts);
    st.log = st.log.slice(-100);
    try {
      localStorage.setItem(App.config.storageKey, JSON.stringify(st));
    } catch (e) { /* ignore */ }
    App.emit('state');
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
  App.pay = (n, what) => {
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
  App.avatar = (nick, hue, cls = '') =>
    `<span class="ava ${cls}" style="${App.avatarStyle(hue)}">${App.esc((nick || '?').slice(0, 1).toUpperCase())}</span>`;

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
