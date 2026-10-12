/* Контракты: 3–10 предметов → один случайный предмет в диапазоне цен. */
(function () {
  'use strict';
  const MIN = 3, MAX = 10;
  /*
   * Режимы как у Hellcase / BloodyCase: лёгкий x0.8–1.2, средний x0.2–5, сложный x0.05–10.
   * Множитель m = L + (H − L) · f^k, где k = (H − L) / (RTP − L) − 1 — тогда среднее m ровно равно RTP.
   */
  const MODES = (App.CONTRACT_MODES = {
    easy: { name: 'Лёгкий', lo: 0.8, hi: 1.2, rtp: 0.95 },
    medium: { name: 'Средний', lo: 0.2, hi: 5, rtp: 0.9 },
    hard: { name: 'Сложный', lo: 0.05, hi: 10, rtp: 0.9 },
  });
  for (const m of Object.values(MODES)) {
    m.k = (m.hi - m.lo) / (m.rtp - m.lo) - 1;
    m.profit = 1 - Math.pow((1 - m.lo) / (m.hi - m.lo), 1 / m.k); // шанс получить дороже, чем отдали
  }
  const contractMult = (App.contractMult = (f, mode = 'medium') => {
    const m = MODES[mode] || MODES.medium;
    return m.lo + (m.hi - m.lo) * Math.pow(f, m.k);
  });

  // допустимая стоимость контракта: весь диапазон [s·lo, s·hi] должен быть покрыт каталогом
  const limits = (md) => {
    const cat = App.catalog();
    return { min: Math.ceil((cat[0].price / md.lo) * 100) / 100, max: Math.floor((cat[cat.length - 1].price / md.hi) * 100) / 100 };
  };
  /*
   * Цель t = s · m. Берём соседние цены каталога a ≤ t ≤ b и выбираем b с вероятностью (t − a)/(b − a):
   * матожидание цены ровно t, поэтому RTP режима не зависит от того, насколько «редкий» каталог в этой зоне.
   * f2 — выбор между a и b, f3 — выбор предмета среди всех с этой ценой.
   */
  const pick = (App.contractPick = (s, mode, f1, f2, f3) => {
    const md = MODES[mode];
    const cat = App.catalog();
    const lo = s * md.lo - 1e-9, hi = s * md.hi + 1e-9;
    const t = Math.min(Math.max(s * contractMult(f1, mode), lo), hi);
    let i = 0;
    while (i < cat.length && cat[i].price < t) i++; // первый ≥ t
    let b = Math.min(i, cat.length - 1);
    let a = cat[b].price > t && b > 0 ? b - 1 : b;
    if (cat[a].price < lo) a = b;
    if (cat[b].price > hi) b = a;
    const pa = cat[a].price, pb = cat[b].price;
    const price = pb > pa && f2 < (t - pa) / (pb - pa) ? pb : pa;
    let from = cat.findIndex((e) => e.price === price);
    let to = from;
    while (to + 1 < cat.length && cat[to + 1].price === price) to++;
    return { mult: contractMult(f1, mode), entry: cat[from + Math.floor(f3 * (to - from + 1))] };
  });

  App.route('/contracts', (root) => {
    const sel = new Set();
    let busy = false;
    let mode = 'medium';
    let alive = true;
    App.onLeave(() => (alive = false));
    root.innerHTML = `
      ${App.pageHead('Контракты', 'Отдай от 3 до 10 скинов — получи один новый. Чем сложнее режим, тем шире разброс цены.', 'dice', '#7c5cff')}
      <section class="ct-stage panel">
        <div class="ct-slots" id="ctSlots"></div>
        <div class="ct-side">
          <div class="seg ct-modes" id="ctMode">${Object.entries(MODES).map(([k, m]) => `<button data-m="${k}" class="${k === 'medium' ? 'on' : ''}">${m.name}</button>`).join('')}</div>
          <div class="ct-stat"><span>Стоимость контракта</span><b id="ctSum">0</b></div>
          <div class="ct-stat"><span>Возможный результат</span><b id="ctRange">—</b></div>
          <button class="btn btn-accent btn-lg" id="ctBtn" disabled>Подписать контракт</button>
          <button class="btn btn-ghost btn-sm" id="ctAuto">Автовыбор дешёвых</button>
          <p class="muted small" id="ctHelp"></p>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><b>Ваши предметы</b><span class="muted" id="ctCount"></span></div>
        <div class="igrid igrid-sm" id="ctInv"></div>
      </section>`;

    const sum = () => Array.from(sel).reduce((a, u) => a + (App.findItem(u)?.price || 0), 0);
    function draw() {
      const items = Array.from(sel).map(App.findItem).filter(Boolean);
      const slots = [];
      for (let i = 0; i < MAX; i++) {
        slots.push(items[i] ? App.itemCard(items[i], { cls: 'mini pick sel', noPrice: false }) : `<div class="ct-empty">${i + 1}</div>`);
      }
      App.$('#ctSlots').innerHTML = slots.join('');
      const s = sum();
      App.$('#ctSum').innerHTML = App.coin(s);
      const md = MODES[mode];
      App.$('#ctRange').innerHTML = sel.size ? `${App.coin(s * md.lo)} — ${App.coin(s * md.hi)}` : `x${md.lo} — x${md.hi}`;
      App.$('#ctHelp').innerHTML = `Выберите от ${MIN} до ${MAX} предметов. Результат — случайный скин от x${App.fmt(md.lo)} до x${App.fmt(md.hi)} от суммы. Средний возврат ${Math.round(md.rtp * 100)}%, шанс получить дороже — ${(md.profit * 100).toFixed(0)}%.`;
      const btn = App.$('#ctBtn');
      const lim = limits(md);
      btn.disabled = busy || sel.size < MIN || s < lim.min || s > lim.max;
      btn.textContent = sel.size < MIN ? `Нужно ещё ${MIN - sel.size}` : s < lim.min ? `Минимум ${App.fmt(lim.min)} для режима` : s > lim.max ? `Максимум ${App.fmt(lim.max)} для режима` : 'Подписать контракт';
      const inv = App.inventory().sort((a, b) => a.price - b.price);
      App.$('#ctCount').textContent = inv.length ? inv.length + ' шт.' : '';
      App.$('#ctInv').innerHTML = inv.length
        ? inv.map((it) => App.itemCard(it, { cls: 'pick ' + (sel.has(it.uid) ? 'sel' : '') })).join('')
        : App.emptyState('Инвентарь пуст', 'ghost', '<a class="btn btn-accent btn-sm" href="#/">Открыть пару кейсов</a>');
    }
    const toggle = (e) => {
      const card = e.target.closest('.icard');
      if (!card || busy) return;
      const uid = card.dataset.uid;
      if (sel.has(uid)) sel.delete(uid);
      else if (sel.size < MAX) sel.add(uid);
      else return App.toast(`Максимум ${MAX} предметов`, 'error');
      App.sound.click();
      draw();
    };
    App.$('#ctInv').onclick = toggle;
    App.$('#ctSlots').onclick = toggle;
    App.$('#ctMode').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || busy) return;
      mode = b.dataset.m;
      App.$$('#ctMode button').forEach((x) => x.classList.toggle('on', x === b));
      draw();
    };
    App.$('#ctAuto').onclick = () => {
      if (busy) return;
      sel.clear();
      App.inventory().sort((a, b) => a.price - b.price).slice(0, MAX).forEach((i) => sel.add(i.uid));
      draw();
    };

    App.$('#ctBtn').onclick = async () => {
      if (!App.requireLogin()) return;
      if (busy || sel.size < MIN) return;
      const uids = Array.from(sel);
      if (uids.some((u) => App.findItem(u)?.state !== 'inv')) {
        prune();
        return App.toast('Часть предметов уже недоступна', 'error');
      }
      const s = Math.round(sum() * 100) / 100;
      const md = MODES[mode];
      const lim = limits(md);
      if (s < lim.min || s > lim.max) return;
      if (!App.consumeItems(uids, 'contract')) return;
      busy = true;
      root.classList.add('busy');
      const game = App.fair.begin('contract');
      const { mult, entry } = pick(s, mode, game.next(), game.next(), game.next());
      const it = App.itemFromCatalog(entry, 'Контракт');
      it.proof = { ...game.proof, mult, mode, sum: s };
      it.proof.id = App.fair.record(game.proof, { mult, mode, sum: s, result: `${md.name}, ${App.fmt(s)} × ${mult.toFixed(4)} → ${App.itemName(it)} (${App.fmt(it.price)})` });
      App.state.stats.contracts++;
      App.addItems([it]);

      // анимация: перебор карточек и раскрытие
      const m = App.modal('<div class="ct-anim"><h2>Подписываем контракт…</h2><div class="ct-flip" id="ctFlip"></div></div>', { sticky: true, cls: 'modal-sm' });
      m.el.querySelector('.modal-x').style.display = 'none';
      try {
      const flip = m.el.querySelector('#ctFlip');
      for (let i = 0; i < 18; i++) {
        const e = App.catalogNear(s * App.rand(md.lo, md.hi), 10);
        flip.innerHTML = App.itemCard(e, { cls: 'big', noPrice: true });
        App.sound.tick();
        await App.sleep(60 + i * 12);
      }
      flip.innerHTML = App.itemCard(it, { cls: 'big reveal' });
      App.feedMine([it], null);
      App.sound.win(it.price > s);
      m.el.querySelector('h2').textContent = it.price >= s ? 'Отличный контракт!' : 'Контракт выполнен';
      m.el.querySelector('.modal-x').style.display = '';
      m.unstick();
      m.el.insertAdjacentHTML('beforeend', `<div class="row"><button class="btn btn-green" id="ctSell">Продать за ${App.coin(it.price)}</button><button class="btn btn-accent" id="ctOk">Забрать</button></div>`);
      m.el.querySelector('#ctSell').onclick = () => { App.sellItems([it.uid]); m.close(); };
      m.el.querySelector('#ctOk').onclick = () => m.close();
      } finally {
        sel.clear();
        busy = false;
        root.classList.remove('busy');
        if (alive) draw();
      }
    };
    // предметы могли продать в другой вкладке — убираем их из выбора
    const prune = () => {
      for (const u of sel) if (App.findItem(u)?.state !== 'inv') sel.delete(u);
      if (!busy && alive) draw();
    };
    App.onLeave(App.on('state', prune));
    draw();
  });
})();
