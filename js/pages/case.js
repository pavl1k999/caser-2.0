/* Страница кейса: рулетка, мульти-открытие, содержимое. */
(function () {
  'use strict';

  App.route('/case/:id', (root, { id }) => {
    const c = App.caseById(id);
    if (!c) return App.go('/');
    let count = 1;
    let fast = false;
    try { fast = localStorage.getItem('fastOpen') === '1'; } catch (e) { /* ignore */ }
    let busy = false;
    let rouls = [];

    const [lo, hi] = App.casePriceRange(c);
    root.innerHTML = `
      <a class="back" href="#/">← Все кейсы</a>
      <section class="case-head" style="--cc:${c.color || '#ffb400'}">
        <div class="case-cover ${c.isCrate ? 'is-crate' : 'is-custom'}">
          ${c.isCrate ? '' : '<div class="cc-glow"></div><div class="cc-box"></div>'}${App.imgTag(c.cover)}
        </div>
        <div class="case-info">
          <h1>${App.esc(c.name)}</h1>
          <div class="case-meta">
            <span>${c.items.length} предметов</span>
            <span>от ${App.coin(lo)} до ${App.coin(hi)}</span>
          </div>
        </div>
      </section>
      <section class="opener">
        <div id="rouls" class="rouls"></div>
        <div class="open-ctrl" id="openCtrl">
          <div class="seg seg-count" id="cnt">
            ${[1, 2, 3, 4, 5].map((n) => `<button data-n="${n}" class="${n === 1 ? 'on' : ''}">x${n}</button>`).join('')}
          </div>
          <button class="btn btn-accent btn-lg" id="openBtn"></button>
          <label class="switch"><input type="checkbox" id="fast" ${fast ? 'checked' : ''}><i></i>Быстрое открытие</label>
        </div>
        <div class="fair-line" id="fairLine"></div>
        <div id="result" class="result hidden"></div>
      </section>
      <section>
        <div class="contents-head">
          <h2 class="sec-title"><span>🎁</span>Содержимое кейса</h2>
          <div class="seg" id="oddsMode"><button data-m="chance" class="on">Шансы</button><button data-m="tickets">Билеты</button></div>
        </div>
        <div class="odds-box">
          <div class="odds-bar">${oddsByRarity().map((r) => `<i style="flex:${r.p};background:${App.RARITY[r.rarity].color}" title="${App.RARITY[r.rarity].name}: ${App.formatChance(r.p)}"></i>`).join('')}</div>
          <div class="odds-legend">${oddsByRarity().map((r) => `<span><i style="background:${App.RARITY[r.rarity].color}"></i>${App.RARITY[r.rarity].name} <b>${App.formatChance(r.p)}</b></span>`).join('')}</div>
          <div class="odds-stats">
            ${c.free ? `<span>Бесплатно раз в 24 часа с <b>${c.level}</b> уровня</span>` : `<span title="Вероятность, что выпадет предмет не дешевле кейса">Шанс окупа <b>${App.formatChance(c.payback)}</b></span>
            <span title="Средняя стоимость дропа к цене кейса">RTP <b>${(c.rtp * 100).toFixed(1).replace('.', ',')}%</b></span>`}
            <span>Средний дроп ${App.coin(c.ev)}</span>
            <a href="#" id="allRanges">Проверить диапазоны</a>
            <a href="#/fair">Как это работает?</a>
          </div>
        </div>
        <div class="igrid" id="contents"></div>
      </section>`;

    function oddsByRarity() {
      const m = {};
      for (const x of c.items) m[x.skin.rarity] = (m[x.skin.rarity] || 0) + x.chance;
      return App.RARITY_ORDER.filter((r) => m[r]).map((r) => ({ rarity: r, p: m[r] }));
    }

    // содержимое: дорогие сверху; у предмета суммарный шанс, цены по износам и диапазоны билетов
    const fmtT = (n) => n.toLocaleString('ru-RU');
    const ranges = (card) => (card.rows.length === 1 ? `${fmtT(card.rows[0].from)}–${fmtT(card.rows[0].to)}` : `${card.rows.length} диапазона`);
    const drawContents = (mode) => {
      const sorted = c.items.slice().sort((a, b) => b.hi - a.hi);
      App.$('#contents').innerHTML = sorted
        .map((card) =>
          App.itemCard(
            { sid: card.sid, price: card.rows.length === 1 ? card.price : card.lo, wear: card.wear, st: card.st },
            {
              chance: mode === 'tickets' ? ranges(card) : App.formatChance(card.chance),
              extra: card.rows.length > 1 ? `<div class="ic-range">до ${App.fmt(card.hi)}</div>` : '',
              cls: 'pick ' + (card.rows.length > 1 ? 'from' : ''),
              attrs: `data-sid="${card.sid}"`,
            }
          )
        )
        .join('');
    };
    drawContents('chance');
    App.$('#oddsMode').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      App.$$('#oddsMode button').forEach((x) => x.classList.toggle('on', x === b));
      drawContents(b.dataset.m);
    };
    // таблица диапазонов: всего кейса или одного предмета (как «Check odds range» у Skin.club)
    const rowsTable = (rows) => `<div class="odds-table-wrap"><table class="odds-table"><thead><tr><th>Предмет</th><th>Износ</th><th>Цена</th><th>Шанс</th><th>Билеты</th></tr></thead><tbody>${rows
      .map((r) => `<tr style="--rc:${App.RARITY[r.skin.rarity].color}"><td><i></i>${r.st ? '<b class="st">ST</b> ' : ''}${App.esc(r.skin.title)} | ${App.esc(r.skin.sub)}</td><td>${App.WEARS[r.wear].short}</td><td>${App.fmt(r.price)}</td><td>${App.formatChance(r.chance)}</td><td>${fmtT(r.from)}–${fmtT(r.to)}</td></tr>`)
      .join('')}</tbody></table></div>`;
    App.$('#contents').onclick = (e) => {
      const el = e.target.closest('.icard');
      if (!el) return;
      const card = c.items.find((x) => x.sid === el.dataset.sid);
      App.modal(`<h2>${App.esc(card.skin.title)} | ${App.esc(card.skin.sub)}</h2>
        <p class="muted">Шанс предмета ${App.formatChance(card.chance)} — сумма шансов всех строк. Выпадает строка, в диапазон которой попал билет.</p>
        ${rowsTable(card.rows)}`, { cls: 'modal-lg' });
    };
    App.$('#allRanges').onclick = (e) => {
      e.preventDefault();
      App.modal(`<h2>Диапазоны билетов · ${App.esc(c.name)}</h2>
        <p class="muted">Билет — число от 1 до 100 000 из provably fair. Строки отсортированы по цене; 1% = 1000 билетов.</p>
        ${rowsTable(c.rows)}`, { cls: 'modal-lg' });
    };
    const drawFair = () => {
      const f = App.fair.current();
      App.$('#fairLine').innerHTML = `<i class="lock-ic"></i>Provably fair · server hash <code title="${f.serverHash}">${f.serverHash.slice(0, 12)}…</code> · client seed <code>${App.esc(f.clientSeed)}</code> · nonce <code>${f.nonce}</code> <a href="#/fair">Проверка</a>`;
    };
    drawFair();
    App.onLeave(App.on('state', drawFair));

    const btn = App.$('#openBtn');
    const updBtn = () => {
      if (c.free) {
        const fs = App.freeStatus(c);
        btn.innerHTML = fs.ok ? 'Открыть бесплатно' : `Бесплатно ${fs.why}`;
        btn.classList.toggle('btn-muted', !fs.ok);
        return;
      }
      const total = c.price * count;
      btn.innerHTML = App.canPay(total) ? `Открыть за ${App.coin(total)}` : `Не хватает ${App.coin(total - App.state.balance)}`;
      btn.classList.toggle('btn-muted', !App.canPay(total));
    };
    if (c.free) {
      App.$('#cnt').hidden = true;
      const t = setInterval(updBtn, 1000);
      App.onLeave(() => clearInterval(t));
    }
    const buildRouls = () => {
      const box = App.$('#rouls');
      box.innerHTML = '';
      box.className = 'rouls rouls-' + count;
      rouls = [];
      for (let i = 0; i < count; i++) {
        const r = App.roulette({ caseObj: c, vertical: count > 1, compact: count > 1 });
        box.appendChild(r.el);
        rouls.push(r);
      }
    };
    buildRouls();
    updBtn();
    App.onLeave(App.on('state', updBtn));

    App.$('#cnt').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b || busy) return;
      count = +b.dataset.n;
      App.$$('#cnt button').forEach((x) => x.classList.toggle('on', x === b));
      App.$('#result').classList.add('hidden');
      buildRouls();
      updBtn();
    };
    App.$('#fast').onchange = (e) => {
      fast = e.target.checked;
      try { localStorage.setItem('fastOpen', fast ? '1' : '0'); } catch (err) { /* ignore */ }
    };

    btn.onclick = async () => {
      if (busy) return;
      if (c.free) {
        const fs = App.freeStatus(c);
        if (!fs.ok) return App.toast(`Этот кейс откроется ${fs.why}`, 'error');
        App.state.freeCases = { ...(App.state.freeCases || {}), [c.id]: Date.now() };
      } else {
        const total = Math.round(c.price * count * 100) / 100;
        if (!App.canPay(total)) {
          App.toast('Недостаточно монет — заберите бесплатный бонус', 'error');
          return App.go('/bonus');
        }
        if (!App.pay(total, `Открытие кейса «${c.name}» x${count}`)) return;
      }
      busy = true;
      root.classList.add('busy');
      App.$('#result').classList.add('hidden');
      App.$('#openCtrl').classList.add('locked');
      const wins = rouls.map(() => App.rollCase(c));
      App.state.stats.opened += count;
      App.addItems(wins);
      await Promise.all(rouls.map((r, i) => r.spin(wins[i], { fast, duration: fast ? 1400 : 6000 + i * 120 })));
      App.feedMine(wins, c);
      const best = Math.max(...wins.map((w) => w.price));
      App.sound.win(best >= (c.price || c.value) * 3);
      busy = false;
      root.classList.remove('busy');
      App.$('#openCtrl').classList.remove('locked');
      showResult(wins);
    };

    function showResult(wins) {
      const box = App.$('#result');
      const live = () => wins.filter((w) => App.findItem(w.uid)?.state === 'inv');
      const draw = () => {
        const left = live();
        const sum = left.reduce((a, w) => a + w.price, 0);
        box.innerHTML = `
          <div class="result-title">Ваш дроп</div>
          <div class="result-items">${wins
            .map((w) => {
              const sold = App.findItem(w.uid)?.state !== 'inv';
              return App.itemCard(w, {
                cls: 'big ' + (sold ? 'sold' : ''),
                extra:
                  (w.proof ? `<a class="ic-proof" href="#/fair/${w.uid}" title="Проверить результат">билет ${w.proof.ticket.toLocaleString('ru-RU')} · nonce ${w.proof.nonce}</a>` : '') +
                  (sold
                    ? '<div class="ic-sold">Продано</div>'
                    : `<button class="btn btn-sm btn-ghost sell-one" data-uid="${w.uid}">Продать</button>`),
              });
            })
            .join('')}</div>
          <div class="result-actions">
            ${left.length ? `<button class="btn btn-green" id="sellAll">Продать ${left.length > 1 ? 'всё ' : ''}за ${App.coin(sum)}</button>` : ''}
            ${c.free ? '' : '<button class="btn btn-accent" id="again">Открыть ещё</button>'}
            ${left.length ? '<a class="btn btn-ghost" href="#/profile">В инвентарь</a>' : ''}
            ${left.length ? '<a class="btn btn-ghost" href="#/upgrade">Апгрейд</a>' : ''}
          </div>`;
        box.classList.remove('hidden');
        box.querySelectorAll('.sell-one').forEach((b) => (b.onclick = () => { App.sellItems([b.dataset.uid]); draw(); }));
        const sa = box.querySelector('#sellAll');
        if (sa) sa.onclick = () => { App.sellItems(left.map((w) => w.uid)); draw(); };
        const again = box.querySelector('#again');
        if (again) again.onclick = () => {
          box.classList.add('hidden');
          rouls.forEach((r) => r.reset());
          btn.click();
        };
      };
      draw();
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });
})();
