/* Общие компоненты: карточки предметов и кейсов, рулетка, боты. */
(function () {
  'use strict';
  const { esc, fmt } = App;

  const FALLBACK =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60"><path fill="#ffffff22" d="M8 30h70l6-8h18l4 4-6 6h12v8H90l-8 12H66l4-12H40l-6 6H18l4-6H8z"/></svg>'
    );
  App.imgFallback = (img) => {
    // локальной картинки нет — пробуем Steam CDN, потом заглушку
    const cdn = App.cdnOf[img.getAttribute('src')];
    if (cdn) img.src = cdn;
    else {
      img.onerror = null;
      img.src = FALLBACK;
    }
  };
  // eager — для рулетки: полосу двигает композитор, и ленивые картинки могли бы не успеть подгрузиться
  const imgTag = (src, cls = '', eager = false) =>
    `<img class="${cls}" src="${esc(src)}" alt="" ${eager ? 'decoding="async"' : 'loading="lazy"'} draggable="false" onerror="App.imgFallback(this)">`;
  App.imgTag = imgTag;

  /**
   * Карточка предмета.
   * it: экземпляр ({sid, wear, st, price}) или запись каталога/кейса ({sid, price?})
   */
  App.itemCard = (it, opts = {}) => {
    const s = App.skin(it.sid);
    const color = App.RARITY[s.rarity].color;
    const price = it.price != null ? it.price : s.base;
    const wear = it.wear != null ? `<span class="ic-wear">${App.WEARS[it.wear].short}</span>` : '';
    const st = it.st ? '<span class="ic-st">ST</span>' : '';
    const chance = opts.chance != null ? `<span class="ic-chance">${opts.chance}</span>` : '';
    return `<div class="icard ${opts.cls || ''}" style="--rc:${color}" ${it.uid ? `data-uid="${it.uid}"` : ''} ${opts.attrs || ''} title="${esc(it.wear != null ? App.itemName(it) : s.title + ' | ' + s.sub)}">
      <div class="ic-top">${st}${wear}${chance}</div>
      <div class="ic-img">${imgTag(s.img, '', opts.eager)}</div>
      <div class="ic-name"><span>${esc(s.title)}</span><b>${esc(s.sub)}</b></div>
      ${opts.noPrice ? '' : `<div class="ic-price">${App.coin(price)}</div>`}
      ${opts.extra || ''}
    </div>`;
  };

  // обложка кейса: у копий кейсов CS2 — картинка Steam, у кейсов сайта — своя коробка в SVG.
  // SVG собирается один раз в blob-URL (App.art.caseUrl): в DOM один <img> вместо сотни узлов,
  // и витрина, лента, батлы и страница кейса делят одну и ту же картинку.
  // opts.eager — обложка в шапке страницы кейса, грузим сразу
  App.caseArtUrl = (c) => (c.isCrate ? c.cover : App.art.caseUrl({ id: c.id, label: c.name, ...c.theme }));
  App.caseArt = (c, opts = {}) => {
    if (c.isCrate) return imgTag(c.cover, 'crate-art', opts.eager);
    return `<img class="case-art" src="${App.caseArtUrl(c)}" width="240" height="190" alt="" decoding="async" loading="${opts.eager ? 'eager' : 'lazy'}" draggable="false">`;
  };
  App.caseColor = (c) => (c.theme && c.theme.colors ? c.theme.colors[0] : '#8a91a8');
  // цвет ореола за коробкой (акцент темы)
  const caseGlow = (c) => (c.theme && c.theme.colors ? c.theme.colors[2] || c.theme.colors[0] : '#8a91a8');

  App.caseCard = (c) => {
    const tags = [];
    if (c.free) tags.push(App.levelInfo().lvl >= c.level ? '<span class="cc-tag t-lvl">Бесплатно</span>' : `<span class="cc-tag">🔒 ${c.level} ур.</span>`);
    if (c.tag === 'hot') tags.push('<span class="cc-tag t-hot">Хит</span>');
    if (c.tag === 'new') tags.push('<span class="cc-tag t-new">Новый</span>');
    if (c.mode === 'lottery') tags.push('<span class="cc-tag">Лотерея</span>');
    if (c.mode === 'joker') tags.push('<span class="cc-tag">Равные шансы</span>');
    const top = c.rows[c.rows.length - 1].price;
    return `<a class="ccard ${c.isCrate ? 'is-crate' : 'is-custom'}" href="#/case/${c.id}" style="--cc:${App.caseColor(c)};--ca:${caseGlow(c)}">
      <div class="cc-tags">${tags.join('')}</div>
      <div class="cc-art">${App.caseArt(c)}</div>
      <div class="cc-name">${esc(c.name)}</div>
      <div class="cc-meta">${c.items.length} предметов · до ${App.fmtShort(top)}</div>
      <div class="cc-price">${c.free ? (App.levelInfo().lvl >= c.level ? 'Открыть' : `с ${c.level} уровня`) : App.coin(c.price)}</div>
    </a>`;
  };

  // фирменная шапка раздела: эмблема в светящемся бейдже, заголовок и подзаголовок
  App.pageHead = (title, sub, icon, color, extra = '') =>
    `<section class="page-hero" style="--ph:${color}">
      <i class="ph-ic"><svg viewBox="0 0 64 64">${App.art.icon(icon)}</svg></i>
      <div class="ph-txt"><h1 class="page-title">${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>
      ${extra ? `<div class="ph-extra">${extra}</div>` : ''}
    </section>`;
  // пустое состояние с иконкой
  App.emptyState = (text, icon = 'ghost', link = '') =>
    `<div class="empty"><svg class="empty-ic" viewBox="0 0 64 64">${App.art.icon(icon)}</svg><div>${text}</div>${link}</div>`;

  /* ---------------- эффекты: частицы и вспышки ---------------- */
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fx = (App.fx = { parts: [], running: false });
  function fxLoop() {
    const cv = document.getElementById('fx');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== innerWidth * dpr || cv.height !== innerHeight * dpr) {
      cv.width = innerWidth * dpr;
      cv.height = innerHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    fx.parts = fx.parts.filter((p) => p.life > 0);
    for (const p of fx.parts) {
      p.vy += p.g;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'spark') {
        ctx.beginPath();
        ctx.moveTo(0, -p.s * 2);
        ctx.lineTo(p.s * 0.5, 0);
        ctx.lineTo(0, p.s * 2);
        ctx.lineTo(-p.s * 0.5, 0);
        ctx.fill();
      } else ctx.fillRect(-p.s, -p.s * 0.5, p.s * 2, p.s);
      ctx.restore();
    }
    if (fx.parts.length) requestAnimationFrame(fxLoop);
    else {
      fx.running = false;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
    }
  }
  // взрыв частиц из точки (x, y) экрана
  fx.burst = (x, y, colors, count = 60, power = 9) => {
    if (reduced) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, v = power * (0.35 + Math.random() * 0.75);
      fx.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.35, g: 0.22, vr: (Math.random() - 0.5) * 0.4, rot: Math.random() * 6,
        s: 2.5 + Math.random() * 3.5, life: 60 + Math.random() * 50, color: colors[i % colors.length], shape: i % 3 ? 'rect' : 'spark',
      });
    }
    if (!fx.running) {
      fx.running = true;
      requestAnimationFrame(fxLoop);
    }
  };
  fx.burstAt = (el, colors, count, power) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    fx.burst(r.left + r.width / 2, r.top + r.height / 2, colors, count, power);
  };
  fx.flash = (color) => {
    if (reduced) return;
    const f = document.createElement('div');
    f.className = 'flash';
    f.style.setProperty('--fc', color);
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 950);
  };
  // насколько «громко» праздновать дроп: по редкости и по тому, во сколько раз он дороже цены
  const TIER = { consumer: 0, industrial: 0, milspec: 0, restricted: 1, classified: 2, covert: 3, gold: 4, contraband: 4 };
  fx.celebrate = (el, it, cost) => {
    const s = App.skin(it.sid);
    let tier = TIER[s.rarity] || 0;
    if (cost && it.price >= cost * 10) tier = Math.max(tier, 3);
    else if (cost && it.price >= cost * 3) tier = Math.max(tier, 2);
    const col = App.RARITY[s.rarity].color;
    if (tier >= 1) fx.burstAt(el, [col, '#ffffff', App.art.lighten(col, 0.4)], 30 + tier * 25, 6 + tier * 2);
    if (tier >= 3) fx.flash(col);
    if (tier >= 4) setTimeout(() => fx.burstAt(el, ['#ffd700', '#fff3b0', '#ff9f1c'], 140, 14), 180);
    return tier;
  };

  /* ---------------- бесконечные анимации: пауза вне экрана и в фоновой вкладке ---------------- */
  // класс .anim-off ставит animation-play-state: paused (см. css). Следим за героем и обложкой кейса.
  const motionIO = 'IntersectionObserver' in window
    ? new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.target.isConnected) return motionIO.unobserve(e.target);
      e.target.classList.toggle('anim-off', !e.isIntersecting);
    }))
    : null;
  App.watchMotion = (root = document) => {
    if (motionIO) root.querySelectorAll('.hero-scene, .case-cover').forEach((el) => motionIO.observe(el));
  };
  document.addEventListener('visibilitychange', () => document.documentElement.classList.toggle('doc-hidden', document.hidden));
  App.on('route', () => {
    App.watchMotion();
    // обложка в шапке страницы кейса видна сразу — грузим без ленивой очереди
    const cov = document.querySelector('#caseCover img[loading="lazy"]');
    if (cov) {
      cov.loading = 'eager';
      cov.fetchPriority = 'high';
    }
  });

  /* ---------------- рулетка ---------------- */
  // после выигрыша видно не больше 4 карточек справа, поэтому хвост полосы короткий
  const WIN_AT = 50;
  const STRIP = WIN_AT + 6;
  const NEAR = 6; // сколько соседей выигрыша видно в конце прокрутки (с запасом)
  const KEYS = 120; // точек в ключевых кадрах прокрутки
  const ease = (t) => 1 - Math.pow(1 - t, 4.2);
  const preload = (src) => {
    const im = new Image();
    im.decoding = 'async';
    im.src = src;
    if (im.decode) im.decode().catch(() => {});
  };

  /**
   * App.roulette({ caseObj, vertical }) → { el, spin(win, {fast}) : Promise, reset() }
   * Полоса заполняется случайными предметами кейса (по шансам), на позиции WIN_AT стоит выигрыш.
   * Прокрутка — Web Animation на transform: её считает композитор, главный поток в это время свободен.
   * Результат решён до анимации; точка остановки и доводка к центру считаются так же, как раньше.
   */
  App.roulette = ({ caseObj, vertical = false, compact = false }) => {
    const el = App.el(`<div class="roul ${vertical ? 'roul-v' : 'roul-h'} ${compact ? 'roul-compact' : ''}">
      <div class="roul-track"></div><div class="roul-marker"></div><div class="roul-fade"></div></div>`);
    const track = el.querySelector('.roul-track');
    const filler = () => App.weighted(caseObj.items, (x) => Math.pow(x.chance, 0.6));
    const card = (it) => App.itemCard(it, { noPrice: true, cls: 'roul-card', eager: true });
    const at = (p) => (vertical ? `translate3d(0,${p}px,0)` : `translate3d(${p}px,0,0)`);
    let anims = [];
    let run = 0; // номер текущего спина: старые колбэки после reset() ничего не делают
    let used = false; // полоса уже крутилась — соседи прошлого выигрыша знакомы зрителю
    let refreshT = 0;

    track.innerHTML = Array.from({ length: STRIP }, () => card({ sid: filler().sid })).join('');
    // заменить карточки [a, b) новыми случайными; остальные элементы полосы остаются на месте
    function refill(a, b) {
      const kids = Array.from(track.children).slice(a, b);
      const t = document.createElement('template');
      t.innerHTML = kids.map(() => card({ sid: filler().sid })).join('');
      const fresh = Array.from(t.content.children);
      kids.forEach((k, i) => k.replaceWith(fresh[i]));
    }
    // дальние карточки обновляем после остановки, пока их не видно
    const flushRefresh = () => {
      if (!refreshT) return;
      clearTimeout(refreshT);
      refreshT = 0;
      refill(0, WIN_AT - NEAR);
    };
    const stop = () => {
      run++;
      anims.forEach((a) => a.cancel());
      anims = [];
    };
    const startShift = () => {
      const c = track.children[0];
      if (!c) return 0;
      return (vertical ? c.offsetHeight : c.offsetWidth) * 2;
    };
    function setPos(p) {
      track.style.transform = at(p);
    }
    requestAnimationFrame(() => setPos(-startShift()));

    function spin(win, { fast = false, duration } = {}) {
      stop();
      const my = run;
      flushRefresh();
      // соседей прошлого выигрыша меняем сейчас: полоса всё равно прыгает к началу
      if (used) refill(WIN_AT - NEAR, STRIP);
      used = true;
      const s = App.skin(win.sid);
      preload(s.img);
      track.children[WIN_AT].replaceWith(App.el(card(win)));
      el.classList.remove('done');
      const cards = track.children;
      const first = cards[0];
      const gap = parseFloat(getComputedStyle(track).gap) || 0;
      const size = (vertical ? first.offsetHeight : first.offsetWidth) + gap;
      const view = vertical ? el.offsetHeight : el.offsetWidth;
      const from = startShift();
      const inner = App.rand(0.12, 0.88) * (size - gap);
      const to = WIN_AT * size + inner - view / 2;
      const dur = duration || (fast ? 1400 : 6500);
      const posAt = (t) => from + (to - from) * ease(t);
      // ключевые кадры по той же кривой; последний — ровно to
      const keys = [];
      for (let i = 0; i <= KEYS; i++) keys.push({ offset: i / KEYS, transform: at(-posAt(i / KEYS)) });
      keys[KEYS].transform = at(-to);
      el.classList.add('spinning');
      const anim = track.animate(keys, { duration: dur, easing: 'linear', fill: 'forwards' });
      anims.push(anim);
      // щелчки: позицию берём из времени анимации, DOM не трогаем
      let lastIdx = -1;
      const tick = () => {
        if (my !== run || anim.playState !== 'running') return;
        const t = Math.min(1, (anim.currentTime || 0) / dur);
        const idx = Math.floor((posAt(t) + view / 2) / size);
        if (idx !== lastIdx) {
          lastIdx = idx;
          App.sound.tick();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return new Promise((resolve) => {
        anim.finished.then(() => {
          if (my !== run) return resolve(win);
          // плавно доводим ровно к центру выигрышной карточки
          const center = WIN_AT * size + (size - gap) / 2 - view / 2;
          setPos(-center);
          const settle = track.animate([{ transform: at(-to) }, { transform: at(-center) }], { duration: 500, easing: 'ease', fill: 'forwards' });
          anim.cancel();
          anims = [settle];
          settle.finished.then(() => my === run && settle.cancel(), () => {});
          const kids = track.children;
          for (let i = WIN_AT - NEAR; i < STRIP; i++) kids[i].classList.add('near');
          kids[WIN_AT].classList.add('roul-win');
          el.classList.remove('spinning');
          el.classList.add('done');
          refreshT = setTimeout(() => {
            refreshT = 0;
            refill(0, WIN_AT - NEAR);
          }, 800);
          setTimeout(() => resolve(win), fast ? 250 : 550);
        }, () => resolve(win));
      });
    }
    function reset() {
      stop();
      flushRefresh();
      if (used) refill(WIN_AT - NEAR, STRIP);
      used = false;
      el.classList.remove('done', 'spinning');
      setPos(-startShift());
    }
    return { el, spin, reset };
  };

  /* ---------------- боты ---------------- */
  App.BOT_NAMES = [
    's1mple_fan', 'Короче', 'NaVi4Life', 'дядя Витя', 'AWPer228', 'kenny', 'Хэдшот', 'Zeus007',
    'tilted', 'Мажор', 'Глок_Бог', 'qwerty', 'FlickMaster', 'Сашка', 'BOT Valera', 'Гоша', 'xX_Pro_Xx',
    'monesy_fan', 'Karambit☆', 'КиберКотлета', 'lucky', 'Дропыч', 'Rush B', 'eco round', 'Clutch',
    'Нуб', 'фортуна', 'Silver2', 'Global', 'Lem', 'Faker', 'Ваня', 'skinhunter', 'Opener', 'Флешка',
  ];
  App.makeBot = () => ({ nick: App.pickOne(App.BOT_NAMES), hue: App.randInt(0, 359), bot: true });

  /* ---------------- лента дропов ---------------- */
  App.feed = [];
  const cheapWeight = (c) => 1 / Math.sqrt(c.price + 5);
  App.botDrop = () => {
    const c = App.weighted(App.cases, cheapWeight);
    const it = App.rollCase(c, null, App.fair.random());
    return { it, user: App.makeBot(), caseObj: c };
  };
  App.pushFeed = (entry) => {
    App.feed.unshift(entry);
    App.feed.length = Math.min(App.feed.length, 30);
    App.emit('feed', entry);
  };
  App.feedMine = (items, caseObj) => {
    const me = App.me();
    items.forEach((it) => App.pushFeed({ it, user: me, caseObj, mine: true }));
  };
  App.formatChance = (p) => {
    const v = p * 100;
    if (v >= 10) return v.toFixed(1) + '%';
    if (v >= 1) return v.toFixed(2) + '%';
    return v.toFixed(3) + '%';
  };
  App.fmtShort = (n) => (n >= 1e6 ? fmt(n / 1e6) + 'M' : n >= 1e4 ? fmt(Math.round(n / 100) / 10) + 'K' : fmt(n));
})();
