/* Батлы кейсов против ботов. Победитель забирает все предметы. */
(function () {
  'use strict';
  const MODES = {
    '1v1': { slots: 2, teams: false, label: '1 vs 1' },
    '1v1v1': { slots: 3, teams: false, label: '1 vs 1 vs 1' },
    '1v1v1v1': { slots: 4, teams: false, label: '1 vs 1 vs 1 vs 1' },
    '2v2': { slots: 4, teams: true, label: '2 vs 2' },
  };
  const MAX_ROUNDS = 10;
  const battles = (App.battles = []);
  let seq = 1;

  const me = () => ({ nick: App.state.nick, hue: App.state.avatar, me: true });
  const priceOf = (b) => Math.round(b.cases.reduce((a, id) => a + App.caseById(id).price, 0) * 100) / 100;

  function createBattle(cases, mode, crazy, creator) {
    const b = {
      id: 'b' + seq++,
      cases, mode, crazy,
      slots: Array(MODES[mode].slots).fill(null),
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
    const pool = App.cases.filter((c) => c.price <= 600);
    const cases = [];
    for (let i = 0; i < n; i++) cases.push(App.weighted(pool, (c) => 1 / Math.sqrt(c.price + 3)).id);
    const mode = App.weighted(Object.keys(MODES), (m) => (m === '1v1' ? 4 : 1));
    const b = createBattle(cases, mode, Math.random() < 0.2, App.makeBot());
    // иногда сразу кто-то уже зашёл
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

  /* ---------------- список ---------------- */
  App.route('/battles', (root) => {
    root.innerHTML = `
      <div class="page-head">
        <h1 class="page-title">Батлы</h1>
        <button class="btn btn-accent" id="newBattle">+ Создать батл</button>
      </div>
      <p class="muted">Открывайте одинаковые кейсы с соперниками. У кого дроп дороже — тот забирает все предметы. В режиме «Crazy» побеждает самый дешёвый дроп.</p>
      <div class="blist" id="blist"></div>`;
    const draw = () => {
      const list = battles.filter((b) => b.state !== 'done' || b.slots.some((s) => s && s.me));
      App.$('#blist').innerHTML = list.length
        ? list.map(row).join('')
        : '<div class="empty">Пока нет батлов — создайте свой!</div>';
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
        <div class="brow-mode"><b>${MODES[b.mode].label}</b>${b.crazy ? '<span class="badge badge-crazy">Crazy</span>' : ''}</div>
        <div class="brow-cases">${b.cases.slice(0, 6).map((id) => `<span class="bc-thumb" title="${App.esc(App.caseById(id).name)}">${App.imgTag(App.caseById(id).cover)}</span>`).join('')}${b.cases.length > 6 ? `<em>+${b.cases.length - 6}</em>` : ''}<span class="muted small">${b.cases.length} раунд.</span></div>
        <div class="brow-players">${b.slots.map((s) => (s ? App.avatar(s.nick, s.hue, s.me ? 'me' : '') : '<span class="ava ava-empty">+</span>')).join('')}</div>
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
      b.slots[i] = me();
      App.go('/battle/' + b.id);
    };
    App.$('#newBattle').onclick = openCreate;
    draw();
    App.onLeave(App.on('battles', draw));
  });

  /* ---------------- создание ---------------- */
  function openCreate() {
    const picked = [];
    let mode = '1v1';
    let crazy = false;
    let q = '';
    const m = App.modal(`
      <h2>Создать батл</h2>
      <div class="bc-top">
        <div class="seg" id="bcMode">${Object.entries(MODES).map(([k, v]) => `<button data-m="${k}" class="${k === mode ? 'on' : ''}">${v.label}</button>`).join('')}</div>
        <label class="switch"><input type="checkbox" id="bcCrazy"><i></i>Crazy</label>
      </div>
      <div class="bc-picked" id="bcPicked"></div>
      <input type="search" id="bcSearch" placeholder="Поиск кейса" autocomplete="off">
      <div class="bc-grid" id="bcGrid"></div>
      <div class="bc-foot"><span>Итого: <b id="bcTotal"></b></span><button class="btn btn-accent" id="bcGo">Создать</button></div>`, { cls: 'modal-lg' });

    const draw = () => {
      App.$('#bcPicked').innerHTML = picked.length
        ? picked.map((id, i) => `<span class="bc-chip" data-i="${i}">${App.imgTag(App.caseById(id).cover)}<em>✕</em></span>`).join('') + `<span class="muted small">${picked.length}/${MAX_ROUNDS}</span>`
        : '<span class="muted">Выберите кейсы (до 10 раундов)</span>';
      const list = App.cases.filter((c) => !q || c.name.toLowerCase().includes(q));
      App.$('#bcGrid').innerHTML = list
        .map((c) => {
          const n = picked.filter((x) => x === c.id).length;
          return `<button class="bc-case" data-id="${c.id}">${App.imgTag(c.cover)}<span>${App.esc(c.name)}</span>${App.coin(c.price)}${n ? `<em class="bc-n">${n}</em>` : ''}</button>`;
        })
        .join('');
      const total = picked.reduce((a, id) => a + App.caseById(id).price, 0);
      App.$('#bcTotal').innerHTML = App.coin(total);
      App.$('#bcGo').disabled = !picked.length;
    };
    App.$('#bcMode').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      mode = b.dataset.m;
      App.$$('#bcMode button').forEach((x) => x.classList.toggle('on', x === b));
    };
    App.$('#bcCrazy').onchange = (e) => (crazy = e.target.checked);
    App.$('#bcSearch').oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
    App.$('#bcGrid').onclick = (e) => {
      const b = e.target.closest('.bc-case');
      if (!b) return;
      if (picked.length >= MAX_ROUNDS) return App.toast('Максимум 10 раундов', 'error');
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
      const b = createBattle(picked.slice(), mode, crazy, me());
      m.close();
      App.go('/battle/' + b.id);
    };
    draw();
  }

  /* ---------------- сам батл ---------------- */
  App.route('/battle/:id', (root, { id }) => {
    const b = battles.find((x) => x.id === id);
    if (!b) return App.go('/battles');
    const mode = MODES[b.mode];
    let alive = true;
    App.onLeave(() => (alive = false));

    root.innerHTML = `
      <a class="back" href="#/battles">← Все батлы</a>
      <div class="bt-head">
        <div><h1 class="page-title">${mode.label} ${b.crazy ? '<span class="badge badge-crazy">Crazy</span>' : ''}</h1>
        <div class="muted">Вход: ${App.coin(b.price)}</div></div>
        <div class="bt-rounds" id="btRounds">${b.cases.map((cid, i) => `<span class="bt-r" data-i="${i}">${App.imgTag(App.caseById(cid).cover)}</span>`).join('')}</div>
        <div class="bt-status" id="btStatus"></div>
      </div>
      <div class="bt-cols ${mode.teams ? 'teams' : ''} n${b.slots.length}" id="btCols"></div>`;

    const cols = b.slots.map((_, i) => {
      const col = App.el(`<div class="bt-col ${mode.teams ? (i < 2 ? 'team-a' : 'team-b') : ''}">
        <div class="bt-player"></div><div class="bt-spin"></div><div class="bt-items"></div></div>`);
      App.$('#btCols').appendChild(col);
      return col;
    });
    const status = (html) => (App.$('#btStatus').innerHTML = html);
    const totals = () => b.slots.map((_, i) => (b.results ? b.results[i].reduce((a, it) => a + it.price, 0) : 0));
    function drawPlayers() {
      const t = totals();
      b.slots.forEach((s, i) => {
        cols[i].querySelector('.bt-player').innerHTML = s
          ? `${App.avatar(s.nick, s.hue, s.me ? 'me' : '')}<div><b>${App.esc(s.nick)}${s.me ? ' (вы)' : ''}</b>${App.coin(t[i])}</div>`
          : '<span class="ava ava-empty">?</span><div><b class="muted">Ожидание…</b></div>';
        cols[i].classList.toggle('winner', !!(b.winners && b.winners.includes(i)));
        cols[i].classList.toggle('loser', !!(b.winners && !b.winners.includes(i)));
      });
    }
    function drawItems() {
      if (!b.results) return;
      b.results.forEach((list, i) => {
        cols[i].querySelector('.bt-items').innerHTML = list.map((it) => App.itemCard(it, { cls: 'mini' })).join('');
      });
    }
    drawPlayers();
    drawItems();

    if (b.state === 'done') {
      showEnd(false);
      return;
    }
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
        const i = b.slots.indexOf(null);
        b.slots[i] = App.makeBot();
        if (alive) drawPlayers();
      }
      b.state = 'running';
      b.results = b.slots.map(() => []);
      for (let n = 3; n > 0; n--) {
        if (alive) status(`<span class="bt-count">${n}</span>`);
        App.sound.click();
        await App.sleep(700);
      }
      for (let r = 0; r < b.cases.length; r++) {
        const c = App.caseById(b.cases[r]);
        const drops = b.slots.map(() => App.rollCase(c, 'Батл'));
        if (alive) {
          status(`Раунд ${r + 1} / ${b.cases.length}`);
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
        drops.forEach((d, i) => b.results[i].push(d));
        if (alive) {
          drawItems();
          drawPlayers();
          await App.sleep(500);
        }
      }
      finish();
      if (alive) showEnd(true);
    }

    function finish() {
      const t = totals();
      let scores = t;
      let groups = b.slots.map((_, i) => [i]);
      if (mode.teams) {
        groups = [[0, 1], [2, 3]];
        scores = groups.map((g) => g.reduce((a, i) => a + t[i], 0));
      } else {
        scores = groups.map((g) => t[g[0]]);
      }
      const best = b.crazy ? Math.min(...scores) : Math.max(...scores);
      const cands = groups.filter((_, gi) => scores[gi] === best);
      b.winners = App.pickOne(cands);
      b.state = 'done';
      b.ended = Date.now();
      const my = b.slots.findIndex((s) => s && s.me);
      const all = b.results.flat();
      b.pot = all.reduce((a, it) => a + it.price, 0);
      App.state.stats.battles++;
      if (b.winners.includes(my)) {
        let mine = all;
        if (mode.teams) {
          // делим банк с напарником: вы забираете свой дроп и дроп «зеркального» соперника
          const opp = (my + 2) % 4;
          mine = b.results[my].concat(b.results[opp]);
        }
        App.state.stats.batWins++;
        App.addItems(mine);
        b.won = mine.reduce((a, it) => a + it.price, 0);
        b.wonItems = mine.map((x) => x.uid);
        App.feedMine(mine.slice(0, 3), null);
      } else {
        App.save();
      }
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
      status(`<div class="bt-end ${win ? 'win' : 'lose'}">
        <b>${win ? `Вы выиграли ${App.coin(b.won)}!` : 'Вы проиграли'}</b>
        <span class="muted">Банк: ${App.coin(b.pot)}</span>
        <div class="row">${win ? sellBtn() : ''}<button class="btn btn-accent" id="btAgain">Повторить за ${App.coin(b.price)}</button></div></div>`);
      const s = App.$('#btSell');
      if (s) s.onclick = () => { App.sellItems(unsold()); s.remove(); };
      App.$('#btAgain').onclick = () => {
        if (!App.pay(b.price, 'Создание батла')) return;
        const nb = createBattle(b.cases.slice(), b.mode, b.crazy, me());
        App.go('/battle/' + nb.id);
      };
    }
  });
})();
