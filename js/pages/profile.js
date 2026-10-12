/* Профиль: инвентарь, статистика, история операций. */
(function () {
  'use strict';

  App.route('/profile', (root) => {
    let tab = 'inv';
    let sort = 'new';
    const sel = new Set();

    const draw = () => {
      const st = App.state;
      const lv = App.levelInfo();
      const inv = App.inventory();
      const invSum = inv.reduce((a, i) => a + i.price, 0);
      const s = st.stats;
      root.innerHTML = `
        <section class="prof panel">
          <div class="prof-ava" id="pfAva" title="Сменить цвет">${App.avatar(st.nick, st.avatar, 'xl')}</div>
          <div class="prof-main">
            <div class="prof-nick"><input id="pfNick" maxlength="20" value="${App.esc(st.nick)}"><span class="muted small">✎</span></div>
            <div class="prof-lvl"><span class="lvl">${lv.lvl}</span><div class="bar"><i style="width:${(lv.cur / lv.next) * 100}%"></i></div><span class="muted small">${App.fmt(lv.cur)} / ${App.fmt(lv.next)} XP</span></div>
          </div>
          <div class="prof-bal"><span class="muted">Баланс</span>${App.coin(st.balance, 'lg')}<a class="btn btn-accent btn-sm" href="#/bonus">Получить монеты</a></div>
        </section>
        <section class="stats">
          ${tile('Открыто кейсов', s.opened)}
          ${tile('Апгрейды', `${s.upWins} / ${s.upgrades}`)}
          ${tile('Контракты', s.contracts)}
          ${tile('Батлы (победы)', `${s.batWins} / ${s.battles}`)}
          ${tile('Потрачено', App.coin(s.spent))}
          ${tile('Инвентарь', App.coin(invSum))}
        </section>
        ${s.best ? `<section class="panel best"><div><span class="muted">Лучший дроп</span><b>${App.esc(App.itemName(s.best))}</b>${App.coin(s.best.price)}</div>${App.itemCard(s.best, { cls: 'mini', noPrice: true })}</section>` : ''}
        <section class="panel">
          <div class="panel-head">
            <div class="seg" id="pfTabs">
              <button data-t="inv" class="${tab === 'inv' ? 'on' : ''}">Инвентарь (${inv.length})</button>
              <button data-t="hist" class="${tab === 'hist' ? 'on' : ''}">История предметов</button>
              <button data-t="log" class="${tab === 'log' ? 'on' : ''}">Операции</button>
            </div>
            ${tab === 'inv' ? `<div class="row">
              <select id="pfSort"><option value="new">Новые</option><option value="exp">Дорогие</option><option value="cheap">Дешёвые</option></select>
              ${sel.size ? `<button class="btn btn-green btn-sm" id="pfSellSel">Продать выбранные (${sel.size})</button>` : ''}
              ${inv.length ? `<button class="btn btn-ghost btn-sm" id="pfSellAll">Продать всё за ${App.coin(invSum)}</button>` : ''}
            </div>` : ''}
          </div>
          <div id="pfBody"></div>
        </section>
        <section class="danger">
          <button class="btn btn-ghost btn-sm" id="pfReset">Сбросить прогресс</button>
        </section>`;
      if (tab === 'inv') App.$('#pfSort').value = sort;
      body(inv);
      bind(inv);
    };
    const tile = (t, v) => `<div class="tile"><span>${t}</span><b>${v}</b></div>`;
    const STATE_RU = { sold: 'Продан', upgraded: 'Апгрейд', lost: 'Сгорел', contract: 'Контракт', inv: 'В инвентаре' };

    function body(inv) {
      const box = App.$('#pfBody');
      if (tab === 'inv') {
        if (sort === 'exp') inv.sort((a, b) => b.price - a.price);
        if (sort === 'cheap') inv.sort((a, b) => a.price - b.price);
        box.innerHTML = inv.length
          ? `<div class="igrid">${inv
              .map((it) => App.itemCard(it, { cls: 'pick ' + (sel.has(it.uid) ? 'sel' : ''), extra: `<button class="btn btn-sm btn-ghost sell-one" data-uid="${it.uid}">Продать</button>` }))
              .join('')}</div>`
          : '<div class="empty">Инвентарь пуст. <a href="#/">Открыть кейс</a></div>';
      } else if (tab === 'hist') {
        const all = App.state.items.slice().sort((a, b) => b.ts - a.ts).slice(0, 120);
        box.innerHTML = all.length
          ? `<div class="igrid">${all.map((it) => App.itemCard(it, { cls: it.state !== 'inv' ? 'sold' : '', extra: `<div class="ic-state s-${it.state}">${STATE_RU[it.state]}</div>` })).join('')}</div>`
          : '<div class="empty">Здесь появятся все ваши предметы</div>';
      } else {
        const log = App.state.log.slice().reverse();
        box.innerHTML = log.length
          ? `<table class="log"><tbody>${log
              .map((l) => `<tr><td class="muted">${new Date(l.ts).toLocaleString('ru-RU')}</td><td>${App.esc(l.what)}</td><td class="${l.d >= 0 ? 'pos' : 'neg'}">${l.d >= 0 ? '+' : '−'}${App.fmt(Math.abs(l.d))}</td></tr>`)
              .join('')}</tbody></table>`
          : '<div class="empty">Операций пока нет</div>';
      }
    }

    // подтверждение вторым нажатием (без confirm(), который блокируют некоторые браузеры)
    function armed(btn, text) {
      if (btn.dataset.armed) return true;
      btn.dataset.armed = '1';
      btn.textContent = text;
      setTimeout(() => btn.isConnected && draw(), 3000);
      return false;
    }

    function bind(inv) {
      App.$('#pfTabs').onclick = (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        tab = b.dataset.t;
        draw();
      };
      const sortEl = App.$('#pfSort');
      if (sortEl) sortEl.onchange = (e) => { sort = e.target.value; draw(); };
      const nick = App.$('#pfNick');
      nick.onchange = () => {
        const v = nick.value.trim().slice(0, 20);
        if (v) {
          App.state.nick = v;
          App.save();
          App.toast('Ник сохранён', 'success');
        }
      };
      App.$('#pfAva').onclick = () => {
        App.state.avatar = (App.state.avatar + 47) % 360;
        App.save();
        draw();
      };
      const body = App.$('#pfBody');
      body.onclick = (e) => {
        const sb = e.target.closest('.sell-one');
        if (sb) {
          sel.delete(sb.dataset.uid);
          App.sellItems([sb.dataset.uid]);
          return draw();
        }
        const card = e.target.closest('.icard.pick');
        if (!card) return;
        const uid = card.dataset.uid;
        sel.has(uid) ? sel.delete(uid) : sel.add(uid);
        draw();
      };
      const ss = App.$('#pfSellSel');
      if (ss) ss.onclick = () => { App.sellItems(Array.from(sel)); sel.clear(); draw(); };
      const sa = App.$('#pfSellAll');
      if (sa) sa.onclick = () => {
        if (!armed(sa, 'Точно продать всё?')) return;
        App.sellItems(inv.map((i) => i.uid));
        sel.clear();
        draw();
      };
      App.$('#pfReset').onclick = () => {
        if (!armed(App.$('#pfReset'), 'Нажмите ещё раз, чтобы удалить всё')) return;
        App.reset();
        App.toast('Прогресс сброшен', 'success');
        draw();
      };
    }

    draw();
  });
})();
