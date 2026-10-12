/* Бонусы: ежедневная награда, кран, промокоды. И страница FAQ. */
(function () {
  'use strict';
  const DAY = 24 * 3600 * 1000;
  const FAUCET_EVERY = 10 * 60 * 1000;
  const FAUCET_LIMIT = 50;
  const FAUCET_AMOUNT = 30;
  // промокоды — только виртуальные монеты
  const PROMOS = { WELCOME: 1000, CASESIM: 500, FREE: 250, KNIFE: 2000 };
  App.dailyAmount = (lvl = App.levelInfo().lvl) => 100 + (lvl - 1) * 40;

  App.route('/bonus', (root) => {
    root.innerHTML = `
      <h1 class="page-title">Бонусы</h1>
      <p class="muted">Все монеты на сайте виртуальные: их нельзя купить, продать или вывести. Пополнение — только бонусами.</p>
      <section class="bonus-grid">
        <div class="bcard b-daily">
          <div class="bcard-ic">🎁</div>
          <h3>Ежедневный бонус</h3>
          <p>Чем выше уровень, тем больше награда. Сейчас: <b id="dAmt"></b></p>
          <button class="btn btn-accent" id="dBtn"></button>
        </div>
        <div class="bcard b-faucet">
          <div class="bcard-ic">💧</div>
          <h3>Бесплатные монеты</h3>
          <p>Если баланс меньше ${App.coin(FAUCET_LIMIT)}, получите ${App.coin(FAUCET_AMOUNT)} раз в 10 минут.</p>
          <button class="btn btn-accent" id="fBtn"></button>
        </div>
        <div class="bcard b-promo">
          <div class="bcard-ic">🏷️</div>
          <h3>Промокод</h3>
          <p>Попробуйте <b>WELCOME</b> — каждый код можно активировать один раз.</p>
          <form class="promo" id="pForm"><input id="pCode" placeholder="Введите промокод" autocomplete="off"><button class="btn btn-accent">OK</button></form>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><b>Награда по уровням</b><span class="muted small">Опыт начисляется за каждую потраченную монету</span></div>
        <div class="lvl-row" id="lvlRow"></div>
      </section>`;

    function draw() {
      const st = App.state;
      const now = Date.now();
      App.$('#dAmt').innerHTML = App.coin(App.dailyAmount());
      const dLeft = st.daily + DAY - now;
      const d = App.$('#dBtn');
      d.disabled = dLeft > 0;
      d.innerHTML = dLeft > 0 ? `Через ${App.timeLeft(dLeft)}` : 'Забрать';
      const fLeft = st.faucet + FAUCET_EVERY - now;
      const f = App.$('#fBtn');
      f.disabled = fLeft > 0 || st.balance >= FAUCET_LIMIT;
      f.innerHTML = st.balance >= FAUCET_LIMIT ? 'Баланс выше лимита' : fLeft > 0 ? `Через ${App.timeLeft(fLeft)}` : 'Получить';
      const lv = App.levelInfo().lvl;
      App.$('#lvlRow').innerHTML = [1, 2, 3, 5, 8, 10, 15, 20]
        .map((l) => `<div class="lvl-cell ${l <= lv ? 'got' : ''}"><span class="lvl">${l}</span>${App.coin(App.dailyAmount(l))}</div>`)
        .join('');
    }
    App.$('#dBtn').onclick = () => {
      if (App.state.daily + DAY > Date.now()) return;
      const amt = App.dailyAmount();
      App.state.daily = Date.now();
      App.credit(amt, 'Ежедневный бонус');
      App.sound.win();
      App.toast(`+${App.fmt(amt)} ${App.config.currency}`, 'success');
      draw();
    };
    App.$('#fBtn').onclick = () => {
      const st = App.state;
      if (st.faucet + FAUCET_EVERY > Date.now() || st.balance >= FAUCET_LIMIT) return;
      st.faucet = Date.now();
      App.credit(FAUCET_AMOUNT, 'Бесплатные монеты');
      App.sound.win();
      draw();
    };
    App.$('#pForm').onsubmit = (e) => {
      e.preventDefault();
      const code = App.$('#pCode').value.trim().toUpperCase();
      if (!code) return;
      if (!(code in PROMOS)) return App.toast('Промокод не найден', 'error');
      if (App.state.promos.includes(code)) return App.toast('Этот промокод уже активирован', 'error');
      App.state.promos.push(code);
      App.credit(PROMOS[code], `Промокод ${code}`);
      App.sound.win(true);
      App.toast(`Промокод активирован: +${App.fmt(PROMOS[code])}`, 'success');
      App.$('#pCode').value = '';
    };
    draw();
    const t = setInterval(draw, 1000);
    App.onLeave(() => clearInterval(t));
  });

  App.route('/faq', (root) => {
    const odds = [
      ['milspec', '79,92%'], ['restricted', '15,98%'], ['classified', '3,20%'], ['covert', '0,64%'], ['gold', '0,26%'],
    ];
    root.innerHTML = `
      <h1 class="page-title">Вопросы и ответы</h1>
      <div class="faq">
        <details open><summary>Что это за сайт?</summary><p>Это симулятор открытия кейсов CS2. Здесь нет пополнений, выводов, обменов и реальных денег — только виртуальные монеты, которые выдаются бесплатно.</p></details>
        <details><summary>Можно ли вывести скины или монеты?</summary><p>Нет. Предметы и монеты существуют только в вашем браузере (localStorage) и не имеют никакой денежной стоимости. Их нельзя купить, продать или передать.</p></details>
        <details><summary>Где взять монеты?</summary><p>В разделе <a href="#/bonus">«Бонусы»</a>: ежедневная награда, бесплатный кран при низком балансе и промокоды. Также можно продавать выпавшие скины.</p></details>
        <details><summary>Какие шансы в официальных кейсах?</summary>
          <table class="odds">${odds.map(([r, p]) => `<tr><td><i style="background:${App.RARITY[r].color}"></i>${App.RARITY[r].name}</td><td>${p}</td></tr>`).join('')}</table>
          <p>В авторских кейсах шанс каждого предмета указан на странице кейса. Износ (float) выбирается случайно, StatTrak™ выпадает с шансом 10%.</p></details>
        <details><summary>Как работает апгрейд?</summary><p>Выберите до 6 предметов (можно добавить монеты) и цель дороже ставки. Шанс = ставка / цена цели × 95%, но не больше 80%. Если стрелка остановится на зелёной дуге — вы получите цель, иначе ставка сгорает.</p></details>
        <details><summary>Как работают контракты?</summary><p>Отдайте 3–10 предметов и получите один случайный скин стоимостью от x0,25 до x4 от суммы.</p></details>
        <details><summary>Как работают батлы?</summary><p>Все участники открывают одинаковые кейсы. Победитель (с самой дорогой суммой дропа, а в режиме Crazy — с самой дешёвой) забирает все предметы. Соперники — боты.</p></details>
        <details><summary>Откуда картинки и названия скинов?</summary><p>Из открытой базы <a href="https://github.com/ByMykel/CSGO-API" target="_blank" rel="noopener">ByMykel/CSGO-API</a>, изображения загружаются со Steam CDN. Цены вымышленные и не связаны с реальным рынком.</p></details>
      </div>`;
  });
})();
