/* Шапка, лента живых дропов, запуск приложения. */
(function () {
  'use strict';
  const { $, $$ } = App;

  // баланс в шапке плавно «докручивается» до нового значения
  let shownBal = null, balAnim = 0, lastLvl = null;
  function animateBalance(to) {
    if (shownBal == null || Math.abs(to - shownBal) < 0.005) {
      shownBal = to;
      $('#balance').innerHTML = App.coin(to);
      return;
    }
    const from = shownBal, t0 = performance.now(), dur = 700, id = ++balAnim;
    const bal = $('.bal');
    bal.classList.remove('up', 'down');
    void bal.offsetWidth;
    bal.classList.add(to > from ? 'up' : 'down');
    const step = (now) => {
      if (id !== balAnim) return;
      const k = Math.min(1, (now - t0) / dur);
      shownBal = from + (to - from) * (1 - Math.pow(1 - k, 3));
      $('#balance').innerHTML = App.coin(shownBal);
      if (k < 1) requestAnimationFrame(step);
      else shownBal = to;
    };
    requestAnimationFrame(step);
  }
  function header() {
    const st = App.state;
    const on = App.loggedIn();
    document.body.classList.toggle('guest', !on);
    animateBalance(st.balance);
    const lvl = App.levelInfo().lvl;
    if (on && lastLvl != null && lvl > lastLvl) {
      App.toast(`🎉 Новый уровень: ${lvl}! Множитель колеса теперь ×${App.fmt(App.wheelMult(lvl))}`, 'success');
      App.fx.burst(innerWidth - 120, 40, ['#ffd23f', '#ff6a00', '#ffffff'], 70, 8);
      App.sound.win(true);
    }
    lastLvl = on ? lvl : null;
    $('.bal').hidden = !on;
    $('.user').hidden = !on;
    $('#userAva').innerHTML = App.myAvatar();
    $('#steamBtn').hidden = on;
    $('#userNick').textContent = st.nick;
    $('#userLvl').textContent = App.levelInfo().lvl + ' ур.';
    $('#soundBtn').classList.toggle('off', !st.sound);
  }
  function activeNav(path) {
    const sect = '/' + (path.split('/')[1] || '');
    $$('[data-nav]').forEach((a) => {
      const n = a.dataset.nav;
      a.classList.toggle('on', n === sect || (n === '/' && sect === '/case') || (n === '/battles' && sect === '/battle'));
    });
  }

  /* ---------------- лента ---------------- */
  let feedFilter = 'all';
  function feedCard(e) {
    const s = App.skin(e.it.sid);
    const color = App.RARITY[s.rarity].color;
    return `<a class="drop ${e.mine ? 'mine' : ''}" style="--rc:${color}" href="${e.caseObj ? '#/case/' + e.caseObj.id : '#/'}">
      ${App.imgTag(s.img)}
      <div class="drop-hover">
        ${e.caseObj ? `<span class="drop-case">${App.caseArt(e.caseObj)}</span>` : ''}
        <span>${App.esc(e.user.nick)}</span>
      </div>
      <div class="drop-name"><span>${App.esc(s.title)}</span><b>${App.esc(s.sub)}</b></div>
    </a>`;
  }
  const passes = (e) => feedFilter === 'all' || e.it.price >= 500;
  function drawFeed() {
    $('#feedList').innerHTML = App.feed.filter(passes).slice(0, 24).map(feedCard).join('');
  }
  App.on('feed', (e) => {
    if (!passes(e)) return;
    const list = $('#feedList');
    const el = App.el(feedCard(e));
    el.classList.add('new');
    list.prepend(el);
    while (list.children.length > 24) list.lastElementChild.remove();
  });
  function botLoop() {
    // редкие дропы дорогих вещей для «топа»
    let d = App.botDrop();
    if (Math.random() < 0.08) {
      const c = App.weighted(App.cases.filter((x) => x.price > 300), () => 1);
      d = { it: App.rollCase(c, null, App.fair.random()), user: App.makeBot(), caseObj: c };
    }
    App.pushFeed(d);
    setTimeout(botLoop, App.randInt(1200, 4200));
  }

  /* ---------------- онлайн ---------------- */
  let online = App.randInt(900, 1400);
  function tickOnline() {
    online = Math.max(600, online + App.randInt(-15, 18));
    $('#online').textContent = online.toLocaleString('ru-RU');
  }

  function init() {
    $('#brand').innerHTML = `${App.config.brand}<span>${App.config.brandAccent}</span>`;
    document.title = `${App.config.brand}${App.config.brandAccent} — симулятор кейсов CS2`;
    $('#steamBtn').onclick = (e) => {
      e.preventDefault();
      App.auth.login();
    };
    App.auth.init();
    $('#soundBtn').onclick = () => {
      App.state.sound = !App.state.sound;
      App.save();
    };
    $('#feedTabs').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      feedFilter = b.dataset.f;
      $$('#feedTabs button').forEach((x) => x.classList.toggle('on', x === b));
      drawFeed();
    };
    for (let i = 0; i < 18; i++) App.feed.push(App.botDrop());
    // в стартовой ленте пара «топовых» дропов
    for (let i = 0; i < 3; i++) {
      const c = App.pickOne(App.cases.filter((x) => x.series === 'premium'));
      App.feed.splice(App.randInt(0, 12), 0, { it: App.rollCase(c, null, App.fair.random()), user: App.makeBot(), caseObj: c });
    }
    drawFeed();
    setTimeout(botLoop, 1500);
    tickOnline();
    setInterval(tickOnline, 4000);
    App.on('state', header);
    App.on('sync', header);
    App.on('route', activeNav);
    // синхронизация между вкладками
    window.addEventListener('storage', (e) => {
      if (e.key === App.stateKey() && e.newValue) {
        try { Object.assign(App.state, JSON.parse(e.newValue)); } catch (err) { return; }
        App.emit('state');
      }
    });
    header();
    $('#year').textContent = new Date().getFullYear();
    window.addEventListener('hashchange', App.navigate);
    App.navigate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
