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

  App.route('/contracts', (root) => {
    const sel = new Set();
    let busy = false;
    let mode = 'medium';
    root.innerHTML = `
      <h1 class="page-title">Контракты</h1>
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
      btn.disabled = busy || sel.size < MIN;
      btn.textContent = sel.size < MIN ? `Нужно ещё ${MIN - sel.size}` : 'Подписать контракт';
      const inv = App.inventory().sort((a, b) => a.price - b.price);
      App.$('#ctCount').textContent = inv.length ? inv.length + ' шт.' : '';
      App.$('#ctInv').innerHTML = inv.length
        ? inv.map((it) => App.itemCard(it, { cls: 'pick ' + (sel.has(it.uid) ? 'sel' : '') })).join('')
        : '<div class="empty">Инвентарь пуст. <a href="#/">Откройте пару кейсов</a></div>';
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
      busy = true;
      root.classList.add('busy');
      const s = sum();
      const uids = Array.from(sel);
      const md = MODES[mode];
      const game = App.fair.begin('contract');
      const mult = contractMult(game.next(), mode);
      // ближайший по цене предмет, но не выходя за объявленный диапазон
      let entry = App.catalogNear(s * mult, 3, game.next());
      if (entry.price < s * md.lo || entry.price > s * md.hi) entry = App.catalogNear(Math.min(Math.max(s * mult, s * md.lo), s * md.hi), 0);
      const it = App.itemFromCatalog(entry, 'Контракт');
      it.proof = { ...game.proof, mult, mode };
      it.proof.id = App.fair.record(game.proof, { mult, mode, result: `${md.name}, x${mult.toFixed(2)} → ${App.itemName(it)}` });
      App.consumeItems(uids, 'contract');
      App.state.stats.contracts++;
      App.addItems([it]);

      // анимация: перебор карточек и раскрытие
      const m = App.modal('<div class="ct-anim"><h2>Подписываем контракт…</h2><div class="ct-flip" id="ctFlip"></div></div>', { sticky: true, cls: 'modal-sm' });
      m.el.querySelector('.modal-x').style.display = 'none';
      const flip = App.$('#ctFlip');
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
      m.el.insertAdjacentHTML('beforeend', `<div class="row"><button class="btn btn-green" id="ctSell">Продать за ${App.coin(it.price)}</button><button class="btn btn-accent" id="ctOk">Забрать</button></div>`);
      App.$('#ctSell').onclick = () => { App.sellItems([it.uid]); m.close(); };
      App.$('#ctOk').onclick = () => m.close();
      sel.clear();
      busy = false;
      root.classList.remove('busy');
      draw();
    };
    draw();
  });
})();
