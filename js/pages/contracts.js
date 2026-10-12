/* Контракты: 3–10 предметов → один случайный предмет в диапазоне цен. */
(function () {
  'use strict';
  const MIN = 3, MAX = 10;
  const LO = 0.25, HI = 4;
  // распределение множителя результата (ожидание ≈ 0.92)
  const rollMult = () => {
    const r = Math.random();
    if (r < 0.74) return App.rand(LO, 0.95);
    if (r < 0.96) return App.rand(1, 2.2);
    return App.rand(2.2, HI);
  };

  App.route('/contracts', (root) => {
    const sel = new Set();
    let busy = false;
    root.innerHTML = `
      <h1 class="page-title">Контракты</h1>
      <section class="ct-stage panel">
        <div class="ct-slots" id="ctSlots"></div>
        <div class="ct-side">
          <div class="ct-stat"><span>Стоимость контракта</span><b id="ctSum">0</b></div>
          <div class="ct-stat"><span>Возможный результат</span><b id="ctRange">—</b></div>
          <button class="btn btn-accent btn-lg" id="ctBtn" disabled>Подписать контракт</button>
          <button class="btn btn-ghost btn-sm" id="ctAuto">Автовыбор дешёвых</button>
          <p class="muted small">Выберите от ${MIN} до ${MAX} предметов. Результат — случайный скин стоимостью от x${LO} до x${HI} от суммы.</p>
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
      App.$('#ctRange').innerHTML = sel.size ? `${App.coin(s * LO)} — ${App.coin(s * HI)}` : '—';
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
    App.$('#ctAuto').onclick = () => {
      if (busy) return;
      sel.clear();
      App.inventory().sort((a, b) => a.price - b.price).slice(0, MAX).forEach((i) => sel.add(i.uid));
      draw();
    };

    App.$('#ctBtn').onclick = async () => {
      if (busy || sel.size < MIN) return;
      busy = true;
      root.classList.add('busy');
      const s = sum();
      const uids = Array.from(sel);
      const entry = App.catalogNear(s * rollMult(), 3);
      const it = App.itemFromCatalog(entry, 'Контракт');
      App.consumeItems(uids, 'contract');
      App.state.stats.contracts++;
      App.addItems([it]);

      // анимация: перебор карточек и раскрытие
      const m = App.modal('<div class="ct-anim"><h2>Подписываем контракт…</h2><div class="ct-flip" id="ctFlip"></div></div>', { sticky: true, cls: 'modal-sm' });
      m.el.querySelector('.modal-x').style.display = 'none';
      const flip = App.$('#ctFlip');
      for (let i = 0; i < 18; i++) {
        const e = App.catalogNear(s * App.rand(LO, HI), 10);
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
