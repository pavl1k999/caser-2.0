/* Апгрейд: ставим скины (и/или монеты) против более дорогого предмета. */
(function () {
  'use strict';
  // шанс = ставка / цена цели: цель ровно вдвое дороже — 50%, впятеро — 20%, вдесятеро — 10%.
  // Показанный шанс и есть тот, с которым сравнивается бросок.
  // Шанс от 1% до 80%: цели дешевле ставки × 1.25 не предлагаются
  const RTP = (App.UPGRADE_RTP = 1);
  const MAX_CHANCE = (App.UPGRADE_MAX = 0.8);
  const MIN_CHANCE = 0.01;
  const MIN_MULT = RTP / MAX_CHANCE;
  const MAX_ITEMS = 6;

  App.route('/upgrade', (root) => {
    const sel = new Set();
    let coins = 0;
    let target = null;
    let busy = false;
    let q = '';
    let rot = 0;
    let dir = 'under';
    let alive = true;
    App.onLeave(() => (alive = false));

    root.innerHTML = `
      ${App.pageHead('Апгрейд', `Поставь скины или монеты и рискни ради более дорогого предмета. Шанс = ставка / цена цели: вдвое дороже — 50%, впятеро — 20%.`, 'rocket', '#2fd27a')}
      <section class="up-stage">
        <div class="up-slot" id="upFrom"></div>
        <div class="up-wheel">
          <svg viewBox="0 0 240 240" class="up-svg">
            <circle cx="120" cy="120" r="104" class="up-track"/>
            <circle cx="120" cy="120" r="104" class="up-arc" id="upArc"/>
          </svg>
          <div class="up-pointer" id="upPtr"><i></i></div>
          <div class="up-center">
            <div class="up-chance" id="upChance">0%</div>
            <div class="up-label">шанс</div>
            <div class="up-roll" id="upRoll"></div>
          </div>
        </div>
        <div class="up-slot" id="upTo"></div>
      </section>
      <div class="up-actions">
        <div class="up-coins">
          <span>+ монеты с баланса</span>
          <input type="number" id="upCoins" min="0" step="1" value="0">
        </div>
        <div class="seg" id="upDir" title="На какой части круга должна остановиться стрелка"><button data-d="under" class="on">Меньше</button><button data-d="over">Больше</button></div>
        <button class="btn btn-accent btn-lg" id="upBtn">Апгрейд</button>
        <div class="seg" id="upMult">${[1.5, 2, 5, 10, 20].map((m) => `<button data-m="${m}">x${m}</button>`).join('')}<button data-m="rnd" title="Случайный множитель от x1.5 до x20">Random x</button></div>
      </div>
      <section class="up-lists">
        <div class="panel">
          <div class="panel-head"><b>Ваши предметы</b><span class="muted" id="invCount"></span></div>
          <div class="igrid igrid-sm" id="upInv"></div>
        </div>
        <div class="panel">
          <div class="panel-head"><b>Выберите цель</b><input type="search" id="upSearch" placeholder="Поиск" autocomplete="off"></div>
          <div class="igrid igrid-sm" id="upCat"></div>
        </div>
      </section>`;

    const R = 104, CIRC = 2 * Math.PI * R;
    const arc = App.$('#upArc');
    arc.style.strokeDasharray = `0 ${CIRC}`;

    const stake = () =>
      Array.from(sel).reduce((a, uid) => a + (App.findItem(uid)?.price || 0), 0) + coins;
    const chance = () => {
      if (!target) return 0;
      const s = stake();
      if (!s) return 0;
      return Math.min(MAX_CHANCE, (s / target.price) * RTP);
    };

    function drawFrom() {
      const items = Array.from(sel).map(App.findItem).filter(Boolean);
      const box = App.$('#upFrom');
      if (!items.length && !coins) {
        box.innerHTML = '<div class="up-ph">Выберите до 6 предметов из инвентаря</div>';
        return;
      }
      box.innerHTML = `<div class="up-stack n${Math.min(items.length, 4)}">${items
        .slice(0, 4)
        .map((it) => App.itemCard(it, { cls: 'mini', noPrice: true }))
        .join('')}</div>
        <div class="up-sum">Ставка: ${App.coin(stake())}</div>`;
    }
    function drawTo() {
      const box = App.$('#upTo');
      if (!target) {
        box.innerHTML = '<div class="up-ph">Выберите предмет, который хотите получить</div>';
        return;
      }
      box.innerHTML = App.itemCard(target, { cls: 'big' }) +
        `<div class="up-sum">x${App.fmt(Math.round((target.price / Math.max(stake(), 0.01)) * 100) / 100)}</div>`;
    }
    function drawChance() {
      const ch = chance();
      App.$('#upChance').textContent = (ch * 100).toFixed(2).replace('.', ',') + '%';
      arc.style.strokeDasharray = `${ch * CIRC} ${CIRC}`;
      // «Больше»: зелёная дуга в конце круга
      arc.style.strokeDashoffset = dir === 'over' ? `${-(1 - ch) * CIRC}` : '0';
      const ok = target && stake() > 0 && ch >= MIN_CHANCE && target.price >= stake() * MIN_MULT - 1e-9;
      App.$('#upBtn').disabled = !ok || busy;
      App.$('#upBtn').textContent = !target ? 'Выберите цель' : !stake() ? 'Выберите предметы' : target.price < stake() * MIN_MULT - 1e-9 ? `Цель должна быть дороже ставки в ${MIN_MULT.toFixed(1)} раза` : ch < MIN_CHANCE ? 'Слишком низкий шанс' : 'Апгрейд';
    }

    function drawInv() {
      const inv = App.inventory().sort((a, b) => b.price - a.price);
      App.$('#invCount').textContent = inv.length ? inv.length + ' шт.' : '';
      App.$('#upInv').innerHTML = inv.length
        ? inv.map((it) => App.itemCard(it, { cls: 'pick ' + (sel.has(it.uid) ? 'sel' : '') })).join('')
        : App.emptyState('Инвентарь пуст', 'ghost', '<a class="btn btn-accent btn-sm" href="#/">Открыть кейс</a>');
    }
    function drawCat() {
      const min = Math.max(stake() * MIN_MULT, 0.05);
      let list = App.catalog().filter((e) => e.price >= min);
      if (q) {
        list = list.filter((e) => {
          const s = App.skin(e.sid);
          return (s.weapon + ' ' + s.pattern).toLowerCase().includes(q);
        });
      }
      list = list.slice(0, 120);
      App.$('#upCat').innerHTML = list.length
        ? list.map((e) => App.itemCard(e, { cls: 'pick ' + (target && target.sid === e.sid && target.wear === e.wear ? 'sel' : ''), attrs: `data-sid="${e.sid}" data-w="${e.wear}"` })).join('')
        : App.emptyState('Нет подходящих предметов', 'eye');
    }
    function drawAll() {
      if (target && target.price < stake() * MIN_MULT - 1e-9) target = null;
      drawFrom();
      drawTo();
      drawChance();
      drawInv();
      drawCat();
    }

    App.$('#upInv').onclick = (e) => {
      const card = e.target.closest('.icard');
      if (!card || busy) return;
      const uid = card.dataset.uid;
      if (sel.has(uid)) sel.delete(uid);
      else if (sel.size < MAX_ITEMS) sel.add(uid);
      else return App.toast('Максимум 6 предметов', 'error');
      App.sound.click();
      drawAll();
    };
    App.$('#upCat').onclick = (e) => {
      const card = e.target.closest('.icard');
      if (!card || busy) return;
      target = App.catalog().find((x) => x.sid === card.dataset.sid && x.wear === +card.dataset.w);
      App.sound.click();
      drawFrom(); drawTo(); drawChance(); drawCat();
    };
    App.$('#upSearch').oninput = (e) => { q = e.target.value.trim().toLowerCase(); drawCat(); };
    App.$('#upCoins').oninput = (e) => {
      coins = Math.max(0, Math.min(App.state.balance, Math.floor(+e.target.value || 0)));
      drawAll();
    };
    App.$('#upDir').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || busy) return;
      dir = b.dataset.d;
      App.$$('#upDir button').forEach((x) => x.classList.toggle('on', x === b));
      drawChance();
    };
    // цель с ценой, ближайшей к ставке × множитель (а не первой дороже — иначе x2 превращался в x2.1)
    const nearest = (want) => {
      const cat = App.catalog();
      const min = stake() * MIN_MULT - 1e-9;
      let best = null;
      for (const e of cat) {
        if (e.price < min) continue;
        if (!best || Math.abs(e.price - want) < Math.abs(best.price - want)) best = e;
        else if (e.price > want) break;
      }
      return best || cat[cat.length - 1];
    };
    App.$('#upMult').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || busy) return;
      if (!stake()) return App.toast('Сначала выберите предметы', 'error');
      const m = b.dataset.m === 'rnd' ? Math.round(App.rand(1.5, 20) * 10) / 10 : +b.dataset.m;
      target = nearest(Math.max(stake() * m, stake() * MIN_MULT));
      drawAll();
    };

    App.$('#upBtn').onclick = async () => {
      if (!App.requireLogin()) return;
      if (busy || !target) return;
      const uids = Array.from(sel);
      if (uids.some((u) => App.findItem(u)?.state !== 'inv')) {
        prune();
        return App.toast('Часть предметов уже недоступна', 'error');
      }
      const ch = chance();
      if (!ch || target.price < stake() * MIN_MULT - 1e-9) return;
      busy = true; // до списания: обработчик 'state' не должен трогать выбор
      if (coins > 0 && !App.pay(coins, 'Апгрейд (монеты)')) return void (busy = false);
      if (uids.length && !App.consumeItems(uids, 'upgrading')) {
        busy = false;
        if (coins > 0) App.credit(coins, 'Возврат: апгрейд отменён');
        return;
      }
      root.classList.add('busy');
      App.$('#upBtn').disabled = true;
      const tgt = target;
      // provably fair: число [0,1); «Меньше» — победа при roll < шанс, «Больше» — при roll ≥ 1 − шанс
      const game = App.fair.begin('upgrade');
      const roll = game.next();
      const win = dir === 'over' ? roll >= 1 - ch : roll < ch;
      // результат фиксируем сразу, до анимации: уход со страницы ничего не меняет
      App.state.stats.upgrades++;
      for (const u of uids) App.findItem(u).state = win ? 'upgraded' : 'lost';
      let it = null;
      if (win) {
        it = App.itemFromCatalog(tgt, 'Апгрейд');
        App.state.stats.upWins++;
        App.addItems([it]);
      }
      const proofId = App.fair.record(game.proof, {
        chance: ch, dir, roll,
        result: `${win ? 'Победа' : 'Проигрыш'}: ${App.skin(tgt.sid).title} | ${App.skin(tgt.sid).sub} (${(ch * 100).toFixed(2)}%)`,
      });
      if (it) it.proof = { ...game.proof, id: proofId, roll };
      App.save();

      // стрелка останавливается ровно на выпавшем числе: roll × 360°
      rot = Math.ceil(rot / 360) * 360 + 360 * 5 + roll * 360;
      const ptr = App.$('#upPtr');
      ptr.style.transition = 'transform 5s cubic-bezier(.15,.85,.2,1)';
      ptr.style.transform = `rotate(${rot}deg)`;
      const ticker = setInterval(App.sound.tick, 90);
      setTimeout(() => clearInterval(ticker), 3200);
      await App.sleep(5200);
      if (!alive) return;
      const stage = App.$('.up-stage');
      App.$('#upRoll').innerHTML = `Выпало <b>${roll.toFixed(4).replace('.', ',')}</b> · <a href="#/fair/${proofId}">проверить</a>`;
      if (win) {
        App.feedMine([it], null);
        App.sound.win(true);
        stage.classList.add('up-win');
        const m = App.modal(`<div class="win-modal"><h2>Апгрейд успешен!</h2>${App.itemCard(it, { cls: 'big' })}
          <div class="row"><button class="btn btn-green" id="wmSell">Продать за ${App.coin(it.price)}</button><button class="btn btn-accent" id="wmOk">Забрать</button></div></div>`);
        App.$('#wmSell').onclick = () => { App.sellItems([it.uid]); m.close(); };
        App.$('#wmOk').onclick = () => m.close();
      } else {
        App.sound.lose();
        stage.classList.add('up-lose');
        App.toast('Не повезло… Попробуйте ещё раз', 'error');
      }
      sel.clear();
      coins = 0;
      App.$('#upCoins').value = 0;
      target = null;
      await App.sleep(1200);
      if (!alive) return;
      stage.classList.remove('up-win', 'up-lose');
      busy = false;
      root.classList.remove('busy');
      drawAll();
    };

    // предметы могли продать в другой вкладке — убираем их из ставки
    const prune = () => {
      if (busy || !alive) return;
      for (const u of sel) if (App.findItem(u)?.state !== 'inv') sel.delete(u);
      coins = Math.min(coins, Math.floor(App.state.balance));
      drawAll();
    };
    App.onLeave(App.on('state', prune));

    drawAll();
  });
})();
