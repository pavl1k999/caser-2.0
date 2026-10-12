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
    img.onerror = null;
    img.src = FALLBACK;
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

  App.caseCard = (c) => {
    return `<a class="ccard ${c.isCrate ? 'is-crate' : 'is-custom'}" href="#/case/${c.id}" style="--cc:${c.color || '#ffb400'}">
      <div class="cc-img">${c.isCrate ? '' : '<div class="cc-glow"></div><div class="cc-box"></div>'}${imgTag(c.cover)}</div>
      <div class="cc-name">${esc(c.name)}</div>
      <div class="cc-price">${App.coin(c.price)}</div>
    </a>`;
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
        function frame(now) {
          const t = Math.min(1, (now - t0) / dur);
          const pos = from + (to - from) * ease(t);
          setPos(-pos);
          const idx = Math.floor((pos + view / 2) / size);
          if (idx !== lastIdx) {
            lastIdx = idx;
            App.sound.tick();
          }
          if (t < 1) requestAnimationFrame(frame);
          else {
            // плавно доводим ровно к центру выигрышной карточки
            const center = WIN_AT * size + (size - gap) / 2 - view / 2;
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
    const it = App.rollCase(c);
    return { it, user: App.makeBot(), caseObj: c };
  };
  App.pushFeed = (entry) => {
    App.feed.unshift(entry);
    App.feed.length = Math.min(App.feed.length, 30);
    App.emit('feed', entry);
  };
  App.feedMine = (items, caseObj) => {
    const me = { nick: App.state.nick, hue: App.state.avatar };
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
