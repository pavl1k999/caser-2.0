/* Батлы кейсов против ботов. Форматы и режимы — как у Key-Drop, CSGORoll, Clash, DatDrop. */
(function () {
  'use strict';
  const FORMATS = {
    '1v1': { slots: 2, label: '1 vs 1' },
    '1v1v1': { slots: 3, label: '1 vs 1 vs 1' },
    '1v1v1v1': { slots: 4, label: '1 vs 1 vs 1 vs 1' },
    '2v2': { slots: 4, label: '2 vs 2', teams: [[0, 1], [2, 3]] },
    '3v3': { slots: 6, label: '3 vs 3', teams: [[0, 1, 2], [3, 4, 5]] },
  };
  const GAMES = {
    classic: { name: 'Классика', hint: 'Побеждает самая дорогая сумма дропа, победитель забирает всё' },
    crazy: { name: 'Crazy', hint: 'Побеждает самая дешёвая сумма дропа' },
    terminal: { name: 'Terminal', hint: 'Считается только последний раунд' },
    jackpot: { name: 'Jackpot', hint: 'Шанс победы = доля вашего дропа в банке, победителя выбирает колесо' },
    group: { name: 'Group', hint: 'Без победителя: банк делится поровну между всеми' },
  };
  const MAX_ROUNDS = 20;
  const battles = (App.battles = []);
  let seq = 1;

  const priceOf = (b) => Math.round(b.cases.reduce((a, id) => a + App.caseById(id).price, 0) * 100) / 100;
  const groupsOf = (b) => FORMATS[b.format].teams || b.slots.map((_, i) => [i]);
  const playable = () => App.cases.filter((c) => c.price > 0);

  function createBattle(cases, format, game, creator) {
    const b = {
      id: 'b' + seq++,
      cases, format, game,
      slots: Array(FORMATS[format].slots).fill(null),
      state: 'waiting',
      created: Date.now(),
    };
    b.price = priceOf(b);
    b.slots[0] = creator;
    battles.unshift(b);
    return b;
  }

  function botLobby() {
    const n = App.weighted([1, 2, 3, 4, 5], (x) => 6 - x);
    const pool = playable().filter((c) => c.price <= 600);
    const cases = [];
    for (let i = 0; i < n; i++) cases.push(App.weighted(pool, (c) => 1 / Math.sqrt(c.price + 3)).id);
    const format = App.weighted(Object.keys(FORMATS), (m) => (m === '1v1' ? 5 : m === '3v3' ? 0.5 : 1));
    const game = App.weighted(Object.keys(GAMES), (g) => (g === 'classic' ? 6 : 1));
    const b = createBattle(cases, format, game, App.makeBot());
    for (let i = 1; i < b.slots.length - 1; i++) if (Math.random() < 0.4) b.slots[i] = App.makeBot();
    return b;
  }

  // фоновая жизнь лобби
  function tickLobbies() {
    const waiting = battles.filter((b) => b.state === 'waiting' && !b.slots.some((s) => s && s.me));
    if (waiting.length < 7 && Math.random() < 0.6) botLobby();
    for (const b of waiting) {
      if (Math.random() < 0.15) {
        const i = b.slots.indexOf(null);
        if (i >= 0) b.slots[i] = App.makeBot();
        if (!b.slots.includes(null)) {
          b.state = 'bots';
          b.ended = Date.now() + App.randInt(15, 30) * 1000;
        }
      }
    }
    for (let i = battles.length - 1; i >= 0; i--) {
      const b = battles[i];
      if ((b.state === 'bots' && Date.now() > b.ended) || (b.state === 'done' && Date.now() - b.ended > 120000)) battles.splice(i, 1);
    }
    App.emit('battles');
  }
  for (let i = 0; i < 5; i++) botLobby();
  setInterval(tickLobbies, 2500);

  const gameBadge = (b) => (b.game !== 'classic' ? `<span class="badge badge-${b.game}" title="${GAMES[b.game].hint}">${GAMES[b.game].name}</span>` : '');
  const playerAva = (s, cls = '') =>
    s ? App.avatar(s.nick, s.hue, (s.me ? 'me ' : '') + cls, s.img) : '<span class="ava ava-empty">+</span>';

  /* ---------------- список ---------------- */
  App.route('/battles', (root) => {
    root.innerHTML = `
      ${App.pageHead('Батлы', 'Все открывают одинаковые кейсы, вход = сумма цен кейсов без комиссии. Соперники — боты, все броски provably fair.', 'crosshair', '#ff4d5e', '<button class="btn btn-accent btn-lg" id="newBattle">+ Создать батл</button>')}
      <div class="bmodes">${Object.values(GAMES).map((g) => `<span><b>${g.name}</b> — ${g.hint.toLowerCase()}</span>`).join('')}</div>
      <div class="blist" id="blist"></div>`;
    const draw = () => {
      const list = battles.filter((b) => b.state !== 'done' || b.slots.some((s) => s && s.me));
      App.$('#blist').innerHTML = list.length ? list.map(row).join('') : App.emptyState('Пока нет батлов — создайте свой!', 'crosshair');
    };
    const row = (b) => {
      const mine = b.slots.some((s) => s && s.me);
      const status =
        b.state === 'waiting'
          ? mine
            ? `<a class="btn btn-ghost" href="#/battle/${b.id}">Открыть</a>`
            : `<button class="btn btn-accent join" data-id="${b.id}">Войти ${App.coin(b.price)}</button>`
          : b.state === 'running'
          ? `<a class="btn btn-ghost" href="#/battle/${b.id}">Идёт игра</a>`
          : b.state === 'done'
          ? `<a class="btn btn-ghost" href="#/battle/${b.id}">Результат</a>`
          : '<span class="badge">Идёт игра</span>';
      return `<div class="brow ${mine ? 'mine' : ''}">
        <div class="brow-mode"><b>${FORMATS[b.format].label}</b>${gameBadge(b)}</div>
        <div class="brow-cases">${b.cases.slice(0, 6).map((id) => `<span class="bc-thumb" title="${App.esc(App.caseById(id).name)}">${App.caseArt(App.caseById(id))}</span>`).join('')}${b.cases.length > 6 ? `<em>+${b.cases.length - 6}</em>` : ''}<span class="muted small">${b.cases.length} раунд.</span></div>
        <div class="brow-players">${b.slots.map((s) => playerAva(s)).join('')}</div>
        <div class="brow-price">${App.coin(b.price)}</div>
        <div class="brow-act">${status}</div>
      </div>`;
    };
    App.$('#blist').onclick = (e) => {
      const j = e.target.closest('.join');
      if (!j) return;
      const b = battles.find((x) => x.id === j.dataset.id);
      if (!b || b.state !== 'waiting') return App.toast('Батл уже начался', 'error');
      const i = b.slots.indexOf(null);
      if (i < 0) return;
      if (!App.pay(b.price, 'Вход в батл')) return;
      b.slots[i] = App.me();
      App.go('/battle/' + b.id);
    };
    App.$('#newBattle').onclick = openCreate;
    draw();
    App.onLeave(App.on('battles', draw));
  });

  /* ---------------- создание ---------------- */
  function openCreate() {
    const picked = [];
    let format = '1v1';
    let game = 'classic';
    let q = '';
    const m = App.modal(`
      <h2>Создать батл</h2>
      <div class="bc-top">
        <div class="seg" id="bcFormat">${Object.entries(FORMATS).map(([k, v]) => `<button data-v="${k}" class="${k === format ? 'on' : ''}">${v.label}</button>`).join('')}</div>
        <div class="seg" id="bcGame">${Object.entries(GAMES).map(([k, v]) => `<button data-v="${k}" class="${k === game ? 'on' : ''}" title="${v.hint}">${v.name}</button>`).join('')}</div>
      </div>
      <p class="muted small" id="bcHint">${GAMES[game].hint}</p>
      <div class="bc-picked" id="bcPicked"></div>
      <input type="search" id="bcSearch" placeholder="Поиск кейса" autocomplete="off">
      <div class="bc-grid" id="bcGrid"></div>
      <div class="bc-foot"><span>Вход: <b id="bcTotal"></b></span><button class="btn btn-accent" id="bcGo">Создать</button></div>`, { cls: 'modal-lg' });

    const draw = () => {
      App.$('#bcPicked').innerHTML = picked.length
        ? picked.map((id, i) => `<span class="bc-chip" data-i="${i}">${App.caseArt(App.caseById(id))}<em>✕</em></span>`).join('') + `<span class="muted small">${picked.length}/${MAX_ROUNDS}</span>`
        : `<span class="muted">Выберите кейсы (до ${MAX_ROUNDS} раундов)</span>`;
      const list = playable().filter((c) => !q || c.name.toLowerCase().includes(q));
      App.$('#bcGrid').innerHTML = list
        .map((c) => {
          const n = picked.filter((x) => x === c.id).length;
          return `<button class="bc-case" data-id="${c.id}" style="--cc:${App.caseColor(c)}">${App.caseArt(c)}<span>${App.esc(c.name)}</span>${App.coin(c.price)}${n ? `<em class="bc-n">${n}</em>` : ''}</button>`;
        })
        .join('');
      const total = picked.reduce((a, id) => a + App.caseById(id).price, 0);
      App.$('#bcTotal').innerHTML = App.coin(total);
      App.$('#bcGo').disabled = !picked.length;
    };
    const seg = (sel, set) => (App.$(sel).onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      set(b.dataset.v);
      App.$$(sel + ' button').forEach((x) => x.classList.toggle('on', x === b));
      App.$('#bcHint').textContent = GAMES[game].hint;
    });
    seg('#bcFormat', (v) => (format = v));
    seg('#bcGame', (v) => (game = v));
    App.$('#bcSearch').oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
    App.$('#bcGrid').onclick = (e) => {
      const b = e.target.closest('.bc-case');
      if (!b) return;
      if (picked.length >= MAX_ROUNDS) return App.toast(`Максимум ${MAX_ROUNDS} раундов`, 'error');
      picked.push(b.dataset.id);
      App.sound.click();
      draw();
    };
    App.$('#bcPicked').onclick = (e) => {
      const c = e.target.closest('.bc-chip');
      if (!c) return;
      picked.splice(+c.dataset.i, 1);
      draw();
    };
    App.$('#bcGo').onclick = () => {
      const total = picked.reduce((a, id) => a + App.caseById(id).price, 0);
      if (!App.pay(total, 'Создание батла')) return;
      const b = createBattle(picked.slice(), format, game, App.me());
      m.close();
      App.go('/battle/' + b.id);
    };
    draw();
  }

  /* ---------------- подсчёт результата ---------------- */
  // предметы банка делятся между получателями поровну по стоимости: крупные — по очереди тому, у кого меньше,
  // остаток до равной доли игроку доплачивается монетами
  function split(items, n) {
    const shares = Array.from({ length: n }, () => ({ items: [], sum: 0 }));
    for (const it of items.slice().sort((a, b) => b.price - a.price)) {
      const s = shares.reduce((a, x) => (x.sum < a.sum ? x : a));
      s.items.push(it);
      s.sum += it.price;
    }
    return shares;
  }

  function finish(b) {
    const totals = b.results.map((list) => list.reduce((a, it) => a + it.price, 0));
    const groups = groupsOf(b);
    const value = (g, arr) => g.reduce((a, i) => a + arr[i], 0);
    const pot = totals.reduce((a, x) => a + x, 0);
    let winners;
    if (b.game === 'group') {
      winners = b.slots.map((_, i) => i);
    } else if (b.game === 'jackpot') {
      // колесо: доля сектора = доля стоимости дропа команды/игрока в банке
      const game = App.fair.begin('jackpot');
      const f = game.next();
      let acc = 0;
      const gi = groups.findIndex((g) => (acc += value(g, totals) / (pot || 1)) > f);
      winners = groups[gi < 0 ? groups.length - 1 : gi];
      b.jackpot = { f, shares: groups.map((g) => value(g, totals) / (pot || 1)) };
      App.fair.record(game.proof, { result: `Jackpot: колесо ${f.toFixed(4)} → место ${winners.map((i) => i + 1).join(', ')}` });
    } else {
      const last = b.results.map((list) => (list.length ? list[list.length - 1].price : 0));
      const score = b.game === 'terminal' ? last : totals;
      const scores = groups.map((g) => value(g, score));
      const best = b.game === 'crazy' ? Math.min(...scores) : Math.max(...scores);
      const cands = groups.filter((_, gi) => Math.abs(scores[gi] - best) < 1e-9);
      if (cands.length > 1) {
        // ничья: тай-брейк отдельным provably fair броском, равные доли (CSGORoll, cases.gg)
        const game = App.fair.begin('tiebreak');
        const idx = Math.floor(game.next() * cands.length);
        winners = cands[idx];
        b.tiebreak = App.fair.record(game.proof, { slots: cands.length, result: `Тай-брейк: победил вариант ${idx + 1} из ${cands.length}` });
      } else winners = cands[0];
    }
    b.winners = winners;
    b.pot = pot;
    const my = b.slots.findIndex((s) => s && s.me);
    App.state.stats.battles++;
    if (winners.includes(my)) {
      const shares = split(b.results.flat(), winners.length);
      // игроку — самая маленькая часть, до ровной доли доплачиваем монетами: итог ровно банк / победителей
      const mine = shares.reduce((a, x) => (x.sum < a.sum ? x : a));
      const fair = pot / winners.length;
      const topUp = Math.max(0, Math.round((fair - mine.sum) * 100) / 100);
      if (b.game !== 'group' || winners.length < b.slots.length) App.state.stats.batWins++;
      App.addItems(mine.items);
      if (topUp > 0.009) App.credit(topUp, 'Батл: доплата до равной доли');
      b.won = mine.sum + topUp;
      b.topUp = topUp;
      b.wonItems = mine.items.map((x) => x.uid);
      App.feedMine(mine.items.slice(0, 3), null);
    } else {
      App.save();
    }
  }

  /* ---------------- сам батл ---------------- */
  App.route('/battle/:id', (root, { id }) => {
    const b = battles.find((x) => x.id === id);
    if (!b) return App.go('/battles');
    const fmt = FORMATS[b.format];
    const teamOf = (i) => (fmt.teams ? fmt.teams.findIndex((t) => t.includes(i)) : -1);
    let alive = true;
    App.onLeave(() => (alive = false));

    root.innerHTML = `
      <a class="back" href="#/battles">← Все батлы</a>
      <div class="bt-head">
        <div><h1 class="page-title">${fmt.label} ${gameBadge(b)}</h1>
        <div class="muted">Вход: ${App.coin(b.price)} · ${GAMES[b.game].hint}</div></div>
        <div class="bt-rounds" id="btRounds">${b.cases.map((cid, i) => `<span class="bt-r" data-i="${i}">${App.caseArt(App.caseById(cid))}</span>`).join('')}</div>
        <div class="bt-status" id="btStatus"></div>
      </div>
      <div class="bt-cols n${b.slots.length}" id="btCols"></div>`;

    const cols = b.slots.map((_, i) => {
      const t = teamOf(i);
      const col = App.el(`<div class="bt-col ${t === 0 ? 'team-a' : t === 1 ? 'team-b' : ''}">
        <div class="bt-player"></div><div class="bt-spin"></div><div class="bt-items"></div></div>`);
      App.$('#btCols').appendChild(col);
      return col;
    });
    const status = (html) => (App.$('#btStatus').innerHTML = html);
    // показываем только уже открытые раунды
    const visible = (i) => (b.results ? b.results[i].slice(0, b.state === 'done' ? b.results[i].length : b.shown || 0) : []);
    const totals = () => b.slots.map((_, i) => visible(i).reduce((a, it) => a + it.price, 0));
    function drawPlayers() {
      const t = totals();
      b.slots.forEach((s, i) => {
        cols[i].querySelector('.bt-player').innerHTML = s
          ? `${playerAva(s)}<div><b>${App.esc(s.nick)}${s.me ? ' (вы)' : ''}${s.bot ? ' <span class="badge badge-bot">бот</span>' : ''}</b>${App.coin(t[i])}</div>`
          : '<span class="ava ava-empty">?</span><div><b class="muted">Ожидание…</b></div>';
        const over = b.state === 'done' && b.winners;
        cols[i].classList.toggle('winner', !!(over && b.winners.includes(i)));
        cols[i].classList.toggle('loser', !!(over && !b.winners.includes(i)));
      });
    }
    function drawItems() {
      if (!b.results) return;
      b.results.forEach((_, i) => {
        cols[i].querySelector('.bt-items').innerHTML = visible(i).map((it) => App.itemCard(it, { cls: 'mini' })).join('');
      });
    }
    drawPlayers();
    drawItems();

    if (b.state === 'done') return showEnd(false);
    if (b.state === 'running') {
      // вернулись на страницу идущего батла — ждём окончания
      status('Батл идёт…');
      const t = setInterval(() => {
        drawPlayers();
        drawItems();
        if (b.state === 'done') {
          clearInterval(t);
          showEnd(false);
        }
      }, 500);
      App.onLeave(() => clearInterval(t));
      return;
    }
    run();

    async function run() {
      status('Ожидаем соперников…');
      while (b.slots.includes(null)) {
        await App.sleep(App.randInt(500, 1100));
        b.slots[b.slots.indexOf(null)] = App.makeBot();
        if (alive) drawPlayers();
      }
      b.state = 'running';
      // Все броски делаются в момент старта и сразу засчитываются: анимация только показывает
      // готовый результат, поэтому уход со страницы или F5 посреди батла ничего не меняет.
      const plan = b.cases.map((cid) => {
        const c = App.caseById(cid);
        return b.slots.map(() => App.rollCase(c, 'Батл', App.fair.begin('battle')));
      });
      b.results = b.slots.map((_, i) => plan.map((round) => round[i]));
      b.shown = 0;
      finish(b);
      for (let n = 3; n > 0; n--) {
        if (alive) status(`<span class="bt-count">${n}</span>`);
        App.sound.click();
        await App.sleep(700);
      }
      for (let r = 0; r < b.cases.length; r++) {
        const c = App.caseById(b.cases[r]);
        const drops = plan[r];
        if (alive) {
          status(`Раунд ${r + 1} / ${b.cases.length}${b.game === 'terminal' && r === b.cases.length - 1 ? ' · решающий' : ''}`);
          App.$$('#btRounds .bt-r').forEach((x, i) => {
            x.classList.toggle('cur', i === r);
            x.classList.toggle('past', i < r);
          });
          const spins = cols.map((col) => {
            const ro = App.roulette({ caseObj: c, vertical: true, compact: true });
            const box = col.querySelector('.bt-spin');
            box.innerHTML = '';
            box.appendChild(ro.el);
            return ro;
          });
          await App.sleep(50);
          await Promise.all(spins.map((ro, i) => ro.spin(drops[i], { duration: 3800 })));
        } else {
          await App.sleep(1500);
        }
        b.shown = r + 1;
        if (alive) {
          drawItems();
          drawPlayers();
          await App.sleep(500);
        }
      }
      b.state = 'done';
      b.ended = Date.now();
      if (alive) showEnd(true);
    }

    function showEnd(fresh) {
      drawPlayers();
      drawItems();
      App.$$('#btRounds .bt-r').forEach((x) => { x.classList.remove('cur'); x.classList.add('past'); });
      cols.forEach((col) => (col.querySelector('.bt-spin').innerHTML = ''));
      const my = b.slots.findIndex((s) => s && s.me);
      const win = b.winners.includes(my);
      if (fresh) win ? App.sound.win(true) : App.sound.lose();
      const unsold = () => (b.wonItems || []).filter((u) => App.findItem(u)?.state === 'inv');
      const sellBtn = () => {
        const u = unsold();
        return u.length ? `<button class="btn btn-green" id="btSell">Продать выигрыш за ${App.coin(u.reduce((a, x) => a + App.findItem(x).price, 0))}</button>` : '';
      };
      const jp = b.jackpot ? `<span class="muted small">Колесо: ${b.jackpot.f.toFixed(4)} · ваш шанс был ${((b.jackpot.shares[groupsOf(b).findIndex((g) => g.includes(my))] || 0) * 100).toFixed(1)}%</span>` : '';
      const head = b.game === 'group'
        ? `Банк разделён поровну: ваша доля ${App.coin(b.won)}`
        : win
        ? `Вы выиграли ${App.coin(b.won)}!${b.winners.length > 1 ? ' (доля команды)' : ''}`
        : 'Вы проиграли';
      status(`<div class="bt-end ${win ? 'win' : 'lose'}">
        <b>${head}</b>
        <span class="muted">Банк: ${App.coin(b.pot)}${b.topUp > 0.009 ? ` · доплата монетами ${App.coin(b.topUp)}` : ''}</span>${jp}
        <div class="row">${win ? sellBtn() : ''}<button class="btn btn-accent" id="btAgain">Повторить за ${App.coin(b.price)}</button></div></div>`);
      const s = App.$('#btSell');
      if (s) s.onclick = () => { App.sellItems(unsold()); s.remove(); };
      App.$('#btAgain').onclick = () => {
        if (!App.pay(b.price, 'Создание батла')) return;
        const nb = createBattle(b.cases.slice(), b.format, b.game, App.me());
        App.go('/battle/' + nb.id);
      };
    }
  });
})();
