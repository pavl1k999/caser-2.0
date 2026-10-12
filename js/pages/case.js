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
        <div id="result" class="result hidden"></div>
      </section>
      <section>
        <h2 class="sec-title"><span>🎁</span>Содержимое кейса</h2>
        <div class="igrid" id="contents"></div>
      </section>`;

    // содержимое
    const sorted = c.items.slice().sort((a, b) => b.skin.base - a.skin.base);
    App.$('#contents').innerHTML = sorted
      .map((x) => App.itemCard({ sid: x.sid, price: x.skin.base }, { chance: App.formatChance(x.chance) }))
      .join('');

    const btn = App.$('#openBtn');
    const updBtn = () => {
      const total = c.price * count;
      btn.innerHTML = App.canPay(total) ? `Открыть за ${App.coin(total)}` : `Не хватает ${App.coin(total - App.state.balance)}`;
      btn.classList.toggle('btn-muted', !App.canPay(total));
    };
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
      const total = Math.round(c.price * count * 100) / 100;
      if (!App.canPay(total)) {
        App.toast('Недостаточно монет — заберите бесплатный бонус', 'error');
        return App.go('/bonus');
      }
      if (!App.pay(total, `Открытие кейса «${c.name}» x${count}`)) return;
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
      App.sound.win(best >= c.price * 3);
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
                extra: sold
                  ? '<div class="ic-sold">Продано</div>'
                  : `<button class="btn btn-sm btn-ghost sell-one" data-uid="${w.uid}">Продать</button>`,
              });
            })
            .join('')}</div>
          <div class="result-actions">
            ${left.length ? `<button class="btn btn-green" id="sellAll">Продать ${left.length > 1 ? 'всё ' : ''}за ${App.coin(sum)}</button>` : ''}
            <button class="btn btn-accent" id="again">Открыть ещё</button>
            ${left.length ? '<a class="btn btn-ghost" href="#/profile">В инвентарь</a>' : ''}
            ${left.length ? '<a class="btn btn-ghost" href="#/upgrade">Апгрейд</a>' : ''}
          </div>`;
        box.classList.remove('hidden');
        box.querySelectorAll('.sell-one').forEach((b) => (b.onclick = () => { App.sellItems([b.dataset.uid]); draw(); }));
        const sa = box.querySelector('#sellAll');
        if (sa) sa.onclick = () => { App.sellItems(left.map((w) => w.uid)); draw(); };
        box.querySelector('#again').onclick = () => {
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
