/* Апгрейд: ставим скины (и/или монеты) против более дорогого предмета. */
(function () {
  'use strict';
  // шанс = ставка / цена цели × 0.9 — ровно как у Key-Drop и Cases.gg (10% преимущества);
  // шанс от 1% до 75%: цели дешевле ставки × 1.2 не предлагаются, поэтому потолок не «срезает» RTP
  const RTP = (App.UPGRADE_RTP = 0.9);
  const MAX_CHANCE = (App.UPGRADE_MAX = 0.75);
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

    root.innerHTML = `
      <h1 class="page-title">Апгрейд</h1>
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
        : '<div class="empty">Инвентарь пуст. <a href="#/">Откройте кейс</a></div>';
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
        : '<div class="empty">Нет подходящих предметов</div>';
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
    App.$('#upMult').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || busy) return;
      if (!stake()) return App.toast('Сначала выберите предметы', 'error');
      const m = b.dataset.m === 'rnd' ? Math.round(App.rand(1.5, 20) * 10) / 10 : +b.dataset.m;
      target = App.catalogNear(stake() * m, 0);
      if (target.price < stake() * MIN_MULT) target = App.catalogNear(stake() * MIN_MULT * 1.001, 0);
      drawAll();
    };

    App.$('#upBtn').onclick = async () => {
      if (!App.requireLogin()) return;
      if (busy || !target) return;
      const ch = chance();
      if (coins > 0 && !App.pay(coins, 'Апгрейд (монеты)')) return;
      busy = true;
      root.classList.add('busy');
      App.$('#upBtn').disabled = true;
      const uids = Array.from(sel);
      const tgt = target;
      // provably fair: число [0,1); «Меньше» — победа при roll < шанс, «Больше» — при roll ≥ 1 − шанс
      const game = App.fair.begin('upgrade');
      const roll = game.next();
      const win = dir === 'over' ? roll >= 1 - ch : roll < ch;
      // результат фиксируем сразу, до анимации: уход со страницы ничего не меняет
      App.state.stats.upgrades++;
      App.consumeItems(uids, win ? 'upgraded' : 'lost');
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
      if (!root.isConnected) return;
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
      stage.classList.remove('up-win', 'up-lose');
      busy = false;
      root.classList.remove('busy');
      drawAll();
    };

    drawAll();
  });
})();
