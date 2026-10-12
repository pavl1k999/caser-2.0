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
  const imgTag = (src, cls = '') =>
    `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" draggable="false" onerror="App.imgFallback(this)">`;
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
      <div class="ic-img">${imgTag(s.img)}</div>
      <div class="ic-name"><span>${esc(s.title)}</span><b>${esc(s.sub)}</b></div>
      ${opts.noPrice ? '' : `<div class="ic-price">${App.coin(price)}</div>`}
      ${opts.extra || ''}
    </div>`;
  };

  // обложка кейса: у копий кейсов CS2 — картинка Steam, у кейсов сайта — своя коробка в SVG
  const artCache = new Map();
  App.caseArt = (c) => {
    if (c.isCrate) return imgTag(c.cover);
    if (!artCache.has(c.id)) artCache.set(c.id, App.art.caseSVG({ id: c.id, label: c.name, ...c.theme }));
    return artCache.get(c.id);
  };
  App.caseColor = (c) => (c.theme && c.theme.colors ? c.theme.colors[0] : '#8a91a8');

  App.caseCard = (c) => {
    const tags = [];
    if (c.free) tags.push(App.levelInfo().lvl >= c.level ? '<span class="cc-tag t-lvl">Бесплатно</span>' : `<span class="cc-tag">🔒 ${c.level} ур.</span>`);
    if (c.tag === 'hot') tags.push('<span class="cc-tag t-hot">Хит</span>');
    if (c.tag === 'new') tags.push('<span class="cc-tag t-new">Новый</span>');
    if (c.mode === 'lottery') tags.push('<span class="cc-tag">Лотерея</span>');
    if (c.mode === 'joker') tags.push('<span class="cc-tag">Равные шансы</span>');
    const top = c.rows[c.rows.length - 1].price;
    return `<a class="ccard ${c.isCrate ? 'is-crate' : 'is-custom'}" href="#/case/${c.id}" style="--cc:${App.caseColor(c)}">
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

  /* ---------------- рулетка ---------------- */
  const STRIP = 60;
  const WIN_AT = 50;
  const ease = (t) => 1 - Math.pow(1 - t, 4.2);

  /**
   * App.roulette({ caseObj, vertical }) → { el, spin(win, {fast}) : Promise }
   * Полоса заполняется случайными предметами кейса (по шансам), на позиции WIN_AT стоит выигрыш.
   */
  App.roulette = ({ caseObj, vertical = false, compact = false }) => {
    const el = App.el(`<div class="roul ${vertical ? 'roul-v' : 'roul-h'} ${compact ? 'roul-compact' : ''}">
      <div class="roul-track"></div><div class="roul-marker"></div><div class="roul-fade"></div></div>`);
    const track = el.querySelector('.roul-track');
    const filler = () => App.weighted(caseObj.items, (x) => Math.pow(x.chance, 0.6));

    function fill(win) {
      const cards = [];
      for (let i = 0; i < STRIP; i++) {
        const it = i === WIN_AT && win ? win : { sid: filler().sid };
        cards.push(App.itemCard(it, { noPrice: true, cls: 'roul-card' }));
      }
      track.innerHTML = cards.join('');
    }
    fill(null);
    const startShift = () => {
      const card = track.children[0];
      if (!card) return 0;
      const size = vertical ? card.offsetHeight : card.offsetWidth;
      return size * 2;
    };
    requestAnimationFrame(() => setPos(-startShift()));

    function setPos(p) {
      track.style.transform = vertical ? `translate3d(0,${p}px,0)` : `translate3d(${p}px,0,0)`;
    }

    function spin(win, { fast = false, duration } = {}) {
      fill(win);
      const cards = track.children;
      const first = cards[0];
      const gap = parseFloat(getComputedStyle(track).gap) || 0;
      const size = (vertical ? first.offsetHeight : first.offsetWidth) + gap;
      const view = vertical ? el.offsetHeight : el.offsetWidth;
      const from = startShift();
      const inner = App.rand(0.12, 0.88) * (size - gap);
      const to = WIN_AT * size + inner - view / 2;
      const dur = duration || (fast ? 1400 : 6500);
      el.classList.add('spinning');
      return new Promise((resolve) => {
        const t0 = performance.now();
        let lastIdx = -1;
        let lastPos = from, blurLvl = 0;
        function frame(now) {
          const t = Math.min(1, (now - t0) / dur);
          const pos = from + (to - from) * ease(t);
          setPos(-pos);
          // размытие в движении: три ступени, чтобы не перерисовывать фильтр каждый кадр
          const v = Math.abs(pos - lastPos);
          lastPos = pos;
          const lvl = v > 40 ? 2 : v > 18 ? 1 : 0;
          if (lvl !== blurLvl) {
            blurLvl = lvl;
            track.style.filter = lvl ? `blur(${lvl * 1.2}px)` : '';
          }
          const idx = Math.floor((pos + view / 2) / size);
          if (idx !== lastIdx) {
            lastIdx = idx;
            App.sound.tick();
          }
          if (t < 1) requestAnimationFrame(frame);
          else {
            // плавно доводим ровно к центру выигрышной карточки
            const center = WIN_AT * size + (size - gap) / 2 - view / 2;
            track.style.filter = '';
            track.style.transition = 'transform .5s ease';
            setPos(-center);
            cards[WIN_AT].classList.add('roul-win');
            el.classList.remove('spinning');
            el.classList.add('done');
            setTimeout(() => {
              track.style.transition = '';
              resolve(win);
            }, fast ? 250 : 550);
          }
        }
        requestAnimationFrame(frame);
      });
    }
    function reset() {
      el.classList.remove('done');
      fill(null);
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
