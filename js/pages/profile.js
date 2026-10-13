/* Профиль: инвентарь, статистика, история операций. */
(function () {
  'use strict';

  App.route('/profile', (root) => {
    let tab = 'inv';
    let sort = 'new';
    let q = '';
    let rar = '';
    const sel = new Set();

    const draw = () => {
      if (!App.loggedIn()) {
        root.innerHTML = `<section class="guest-wall panel">
          <div class="guest-art">${App.art ? App.art.hero() : ''}</div>
          <div><h1 class="page-title">Профиль появится после входа</h1>
          <p class="muted">Войдите через Steam — аккаунт создастся автоматически, а на счёт придут ${App.fmt(App.config.startBalance)} монет.</p>
          <button class="steam-btn steam-btn-lg" id="pfSteam"><i class="steam-ic"></i><span>Войти через Steam</span></button></div>
        </section>`;
        App.$('#pfSteam').onclick = () => App.auth.login();
        return;
      }
      const st = App.state;
      const lv = App.levelInfo();
      const inv = App.inventory();
      const invSum = inv.reduce((a, i) => a + i.price, 0);
      const s = st.stats;
      // ник и аватар из Steam менять здесь нельзя — они обновляются при входе
      const steamNick = App.auth.steamNick && App.auth.steamNick();
      const steamAva = !!(App.session && App.session.avatar);
      root.innerHTML = `
        <section class="prof panel">
          <div class="prof-ava ${steamAva ? 'steam' : ''}" id="pfAva" title="${steamAva ? 'Аватар из Steam' : 'Сменить цвет'}">${App.myAvatar('xl')}</div>
          <div class="prof-main">
            <div class="prof-nick">${steamNick
              ? `<b class="prof-nick-steam">${App.esc(st.nick)}</b><span class="muted small"><i class="steam-ic"></i> из Steam</span>`
              : `<input id="pfNick" maxlength="20" value="${App.esc(st.nick)}"><span class="muted small">✎</span>`}</div>
            <div class="prof-lvl"><span class="lvl">${lv.lvl}</span><div class="bar"><i style="width:${(lv.cur / lv.next) * 100}%"></i></div><span class="muted small">${App.fmt(lv.cur)} / ${App.fmt(lv.next)} XP</span></div>
          </div>
          <div class="prof-bal"><span class="muted">Баланс</span>${App.coin(st.balance, 'lg')}<a class="btn btn-accent btn-sm" href="#/bonus">Получить монеты</a></div>
        </section>
        ${steamBlock()}
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
              <input type="search" id="pfQ" placeholder="Поиск" value="${App.esc(q)}" autocomplete="off">
              <select id="pfRar"><option value="">Все редкости</option>${App.RARITY_ORDER.filter((r) => r !== 'contraband').map((r) => `<option value="${r}" ${r === rar ? 'selected' : ''}>${App.RARITY[r].name}</option>`).join('')}</select>
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
    const SYNC_RU = { idle: 'сохранено в облаке', saving: 'сохраняем…', error: 'ошибка синхронизации', off: 'облако выключено' };
    function steamBlock() {
      const ses = App.session;
      if (!ses) {
        return `<section class="panel steam-box">
          <div class="steam-txt"><b>Привяжите аккаунт Steam</b>
            <span class="muted small">Прогресс будет храниться отдельно для вашего аккаунта${App.config.authApi ? ' и синхронизироваться между устройствами' : ''}. Вход происходит на официальном сайте steamcommunity.com: мы получаем только SteamID и никогда не спрашиваем пароль.</span></div>
          <button class="steam-btn steam-btn-lg" id="pfSteam"><i class="steam-ic"></i><span>Войти через Steam</span></button>
        </section>`;
      }
      const sync = App.auth.sync !== 'off' || App.auth.syncError
        ? `<span class="sync s-${App.auth.sync}">${App.esc(App.auth.syncError || SYNC_RU[App.auth.sync])}</span>` : '';
      return `<section class="panel steam-box">
        <div class="steam-txt">
          <b><i class="steam-ic"></i> Steam: ${App.esc(ses.name || App.state.nick)}
            ${ses.verified ? '<span class="badge badge-ok">подтверждён</span>' : '<span class="badge" title="Сайт работает без сервера входа: SteamID не проверяется, ник и аватар не загружаются">без проверки</span>'}</b>
          <span class="muted small">SteamID64: <a href="https://steamcommunity.com/profiles/${ses.sid}" target="_blank" rel="noopener">${ses.sid}</a> ${sync}</span>
        </div>
        <button class="btn btn-ghost btn-sm" id="pfLogout">Выйти</button>
      </section>`;
    }
    const tile = (t, v) => `<div class="tile"><span>${t}</span><b>${v}</b></div>`;
    const STATE_RU = { sold: 'Продан', upgraded: 'Апгрейд', lost: 'Сгорел', contract: 'Контракт', inv: 'В инвентаре' };

    function body(inv) {
      const box = App.$('#pfBody');
      if (tab === 'inv') {
        const all = inv.length;
        inv = inv.filter((it) => {
          const s = App.skin(it.sid);
          return (!rar || s.rarity === rar) && (!q || (s.weapon + ' ' + s.sub).toLowerCase().includes(q));
        });
        if (all && !inv.length) {
          box.innerHTML = App.emptyState('Ничего не найдено', 'eye');
          return;
        }
        if (sort === 'exp') inv.sort((a, b) => b.price - a.price);
        if (sort === 'cheap') inv.sort((a, b) => a.price - b.price);
        box.innerHTML = inv.length
          ? `<div class="igrid">${inv
              .map((it) => App.itemCard(it, { cls: 'pick ' + (sel.has(it.uid) ? 'sel' : ''), extra: `<button class="btn btn-sm btn-ghost sell-one" data-uid="${it.uid}">Продать</button>` }))
              .join('')}</div>`
          : App.emptyState('Инвентарь пуст', 'ghost', '<a class="btn btn-accent btn-sm" href="#/">Открыть кейс</a>');
      } else if (tab === 'hist') {
        const all = App.state.items.slice().sort((a, b) => b.ts - a.ts).slice(0, 120);
        box.innerHTML = all.length
          ? `<div class="igrid">${all.map((it) => App.itemCard(it, { cls: it.state !== 'inv' ? 'sold' : '', extra: `<div class="ic-state s-${it.state}">${STATE_RU[it.state]}</div>` })).join('')}</div>`
          : App.emptyState('Здесь появятся все ваши предметы', 'hourglass');
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
      const qEl = App.$('#pfQ');
      if (qEl) qEl.oninput = () => { q = qEl.value.trim().toLowerCase(); body(App.inventory()); };
      const rEl = App.$('#pfRar');
      if (rEl) rEl.onchange = () => { rar = rEl.value; body(App.inventory()); };
      const sortEl = App.$('#pfSort');
      if (sortEl) sortEl.onchange = (e) => { sort = e.target.value; draw(); };
      const nick = App.$('#pfNick');
      if (nick) nick.onchange = () => {
        const v = nick.value.trim().slice(0, 20);
        if (v) {
          App.state.nick = v;
          App.save();
          App.toast('Ник сохранён', 'success');
        }
      };
      const ls = App.$('#pfSteam');
      if (ls) ls.onclick = () => App.auth.login();
      const lo = App.$('#pfLogout');
      if (lo) lo.onclick = () => { App.auth.logout(); draw(); };
      App.$('#pfAva').onclick = () => {
        if (App.session && App.session.avatar) return;
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
    const redraw = () => {
      if (document.activeElement && document.activeElement.id === 'pfNick') return;
      draw();
    };
    App.onLeave(App.on('state', redraw));
    App.onLeave(App.on('sync', redraw));
  });
})();
