/* Бонусы: ежедневная награда, кран, промокоды. И страница FAQ. */
(function () {
  'use strict';
  const DAY = 24 * 3600 * 1000;
  const FAUCET_EVERY = 10 * 60 * 1000;
  const FAUCET_LIMIT = 50;
  const FAUCET_AMOUNT = 30;
  // промокоды — только виртуальные монеты
  const PROMOS = { WELCOME: 1000, CASESIM: 500, FREE: 250, KNIFE: 2000 };
  // Колесо бонусов раз в сутки (как «барабан» на GGDrop). Ширина сектора = его вероятность,
  // стрелка останавливается ровно на provably fair числе. Множитель растёт с уровнем.
  const WHEEL = (App.WHEEL = [
    { v: 25, w: 24, c: '#3b4a6b' }, { v: 50, w: 22, c: '#4b69ff' }, { v: 75, w: 18, c: '#5e98d9' },
    { v: 100, w: 14, c: '#8847ff' }, { v: 150, w: 10, c: '#d32ce6' }, { v: 250, w: 7, c: '#eb4b4b' },
    { v: 500, w: 4, c: '#ff7a00' }, { v: 1000, w: 1, c: '#ffd700' },
  ]);
  const WTOTAL = WHEEL.reduce((a, x) => a + x.w, 0);
  App.wheelMult = (lvl = App.levelInfo().lvl) => Math.min(3, 1 + (lvl - 1) * 0.1);
  App.wheelSector = (f) => {
    let acc = 0;
    return WHEEL.find((x) => (acc += x.w / WTOTAL) > f) || WHEEL[WHEEL.length - 1];
  };
  App.dailyAmount = (lvl = App.levelInfo().lvl) => Math.round(WHEEL.reduce((a, x) => a + (x.v * x.w) / WTOTAL, 0) * App.wheelMult(lvl));

  App.route('/bonus', (root) => {
    root.innerHTML = `
      ${App.pageHead('Бонусы', 'Колесо раз в сутки, бесплатные кейсы по уровням, кран и промокоды. Все монеты виртуальные.', 'coin', '#ffb400')}
      <p class="muted">Все монеты на сайте виртуальные: их нельзя купить, продать или вывести. Пополнение — только бонусами.</p>
      <section class="wheel-box panel">
        <div class="wheel-wrap">
          <div class="wheel-ptr"></div>
          <div class="wheel" id="wheel" style="background:conic-gradient(${(() => { let a = 0; return WHEEL.map((x) => { const from = a; a += (x.w / WTOTAL) * 360; return `${x.c} ${from}deg ${a}deg`; }).join(','); })()})">
            ${(() => { let a = 0; return WHEEL.map((x) => { const mid = a + (x.w / WTOTAL) * 180; a += (x.w / WTOTAL) * 360; return x.w / WTOTAL >= 0.05 ? `<span style="transform:rotate(${mid}deg)"><b>${x.v}</b></span>` : ''; }).join(''); })()}
          </div>
          <div class="wheel-hub" id="wheelHub">×${App.fmt(App.wheelMult())}</div>
        </div>
        <div class="wheel-side">
          <h3>Колесо бонусов</h3>
          <p class="muted">Крутите раз в сутки. Выигрыш умножается на множитель уровня: сейчас <b>×${App.fmt(App.wheelMult())}</b>, максимум ×3. В среднем колесо даёт ${App.coin(App.dailyAmount())}.</p>
          <div class="wheel-odds">${WHEEL.map((x) => `<span><i style="background:${x.c}"></i>${x.v} — ${((x.w / WTOTAL) * 100).toFixed(0)}%</span>`).join('')}</div>
          <button class="btn btn-accent btn-lg" id="dBtn"></button>
          <div class="muted small" id="wRes"></div>
        </div>
      </section>
      <section>
        <h2 class="sec-title"><span>🎁</span>Бесплатные кейсы</h2>
        <div class="cgrid" id="freeCases"></div>
      </section>
      <section class="bonus-grid">
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
        <div class="panel-head"><b>Множитель колеса по уровням</b><span class="muted small">Опыт начисляется за каждую потраченную монету</span></div>
        <div class="lvl-row" id="lvlRow"></div>
      </section>`;

    function draw() {
      const st = App.state;
      const now = Date.now();
      const dLeft = st.daily + DAY - now;
      const d = App.$('#dBtn');
      d.disabled = dLeft > 0 || spinning;
      d.innerHTML = spinning ? 'Крутим…' : dLeft > 0 ? `Через ${App.timeLeft(dLeft)}` : 'Крутить колесо';
      App.$('#freeCases').innerHTML = App.cases.filter((c) => c.free).map((c) => {
        const fs = App.freeStatus(c);
        return App.caseCard(c).replace('</a>', `<div class="cc-free ${fs.ok ? 'ok' : ''}">${fs.ok ? 'Доступен' : fs.why}</div></a>`);
      }).join('');
      const fLeft = st.faucet + FAUCET_EVERY - now;
      const f = App.$('#fBtn');
      f.disabled = fLeft > 0 || st.balance >= FAUCET_LIMIT;
      f.innerHTML = st.balance >= FAUCET_LIMIT ? 'Баланс выше лимита' : fLeft > 0 ? `Через ${App.timeLeft(fLeft)}` : 'Получить';
      const lv = App.levelInfo().lvl;
      App.$('#lvlRow').innerHTML = [1, 2, 3, 5, 8, 10, 15, 20]
        .map((l) => `<div class="lvl-cell ${l <= lv ? 'got' : ''}"><span class="lvl">${l}</span><b>×${App.fmt(App.wheelMult(l))}</b></div>`)
        .join('');
    }
    // #page переиспользуется между страницами, поэтому «ушли ли мы» отслеживаем флагом
    let alive = true;
    App.onLeave(() => (alive = false));
    let spinning = false;
    let rot = 0;
    App.$('#dBtn').onclick = async () => {
      if (!App.requireLogin()) return;
      if (spinning || App.state.daily + DAY > Date.now()) return;
      const game = App.fair.begin('wheel');
      const f = game.next();
      const sec = App.wheelSector(f);
      const mult = App.wheelMult();
      const amt = Math.round(sec.v * mult);
      // начисляем сразу, анимация только показывает результат
      App.state.daily = Date.now();
      const proofId = App.fair.record(game.proof, { roll: f, result: `Колесо: ${sec.v} × ${App.fmt(mult)} = ${amt}` });
      App.credit(amt, 'Колесо бонусов');
      spinning = true;
      draw();
      // точка f·360° колеса (по часовой от верха) встаёт под стрелку
      rot = Math.ceil(rot / 360) * 360 + 360 * 6 - f * 360;
      const wheel = App.$('#wheel');
      wheel.style.transition = 'transform 5s cubic-bezier(.12,.8,.18,1)';
      wheel.style.transform = `rotate(${rot}deg)`;
      const tick = setInterval(App.sound.tick, 110);
      setTimeout(() => clearInterval(tick), 3400);
      await App.sleep(5200);
      spinning = false;
      if (!alive) return;
      App.sound.win(sec.v >= 250);
      App.toast(`Колесо: +${App.fmt(amt)} ${App.config.currency}`, 'success');
      App.$('#wRes').innerHTML = `Выпало ${sec.v} × ${App.fmt(mult)} = <b>${App.fmt(amt)}</b> · число ${f.toFixed(4)} · <a href="#/fair/${proofId}">проверить</a>`;
      draw();
    };
    App.$('#fBtn').onclick = () => {
      if (!App.requireLogin()) return;
      const st = App.state;
      if (st.faucet + FAUCET_EVERY > Date.now() || st.balance >= FAUCET_LIMIT) return;
      st.faucet = Date.now();
      App.credit(FAUCET_AMOUNT, 'Бесплатные монеты');
      App.sound.win();
      draw();
    };
    App.$('#pForm').onsubmit = (e) => {
      e.preventDefault();
      if (!App.requireLogin()) return;
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
    const cs = App.cases.filter((c) => !c.free);
    const med = (arr) => { const a = arr.slice().sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
    const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%';
    const CM = App.CONTRACT_MODES;
    root.innerHTML = `
      ${App.pageHead('Вопросы и ответы', 'Как устроены шансы, режимы и проверка честности', 'eye', '#22d3ee')}
      <div class="faq">
        <details open><summary>Что это за сайт?</summary><p>Это симулятор открытия кейсов CS2. Здесь нет пополнений, выводов, обменов и реальных денег — только виртуальные монеты, которые выдаются бесплатно.</p></details>
        <details><summary>Можно ли вывести скины или монеты?</summary><p>Нет. Предметы и монеты не имеют никакой денежной стоимости: их нельзя купить, продать или передать. Без входа через Steam прогресс хранится в браузере, а с сервером входа — ещё и в облаке, привязанном к SteamID.</p></details>
        <details><summary>Зачем вход через Steam?</summary><p>Играть можно только с аккаунтом: он создаётся автоматически при первом входе, на счёт приходят ${App.fmt(App.config.startBalance)} монет. Вход идёт на официальном steamcommunity.com, сайт получает только SteamID — пароль, Steam Guard и инвентарь Steam ему недоступны.</p></details>
        <details><summary>Что за серии кейсов?</summary><p>Кейсы сайта собраны в серии по темам: ${(DB.series || []).map((x) => x.name).join(', ')}. Коробки нарисованы специально для сайта, в каждом кейсе 30–50 скинов, подобранных по теме. Отдельно есть копии кейсов CS2 и бесплатные кейсы по уровням.</p></details>
        <details><summary>Где взять монеты?</summary><p>В разделе <a href="#/bonus">«Бонусы»</a>: колесо раз в сутки, бесплатные кейсы по уровням, кран при низком балансе и промокоды. Также можно продавать выпавшие скины.</p></details>
        <details><summary>Как устроены шансы в кейсах?</summary>
          <p>Как у Hellcase, Key-Drop и Skin.club. У каждого предмета есть строки «износ × StatTrak», у каждой строки — своя цена и число билетов из 100 000 (1% = 1000 билетов). Шанс строки примерно обратно пропорционален её цене в степени 1,2 — такой наклон дают выгрузки кейсов Hellcase. Таблицу билетов любого кейса можно открыть кнопкой «Проверить диапазоны».</p>
          <table class="odds">
            <tr><td>Кейсов</td><td>${cs.length}</td></tr>
            <tr><td>Средний возврат (RTP), медиана</td><td>${pct(med(cs.map((c) => c.rtp)))} (обычные 88%, ножевые 90%, как у Hellcase и Skin.club)</td></tr>
            <tr><td>Шанс окупа, медиана</td><td>${pct(med(cs.map((c) => c.payback)))} (у Hellcase 17%, у Key-Drop 20%)</td></tr>
            <tr><td>Особые кейсы</td><td>«1% Нож» — лотерея, «50/50» — честные 50% на дорогую группу, «Джокер» — равные шансы</td></tr>
          </table>
          <p>Копии официальных кейсов перенастроены так же, как это делает Hellcase: шансы Valve (79,92 / 15,98 / 3,20 / 0,64 / 0,26%) там не используются, а нож выпадает с шансом в сотые доли процента.</p></details>
        <details><summary>Как работает апгрейд?</summary><p>Выберите до 6 предметов (можно добавить монеты) и цель. Шанс = ставка / цена цели × ${Math.round(App.UPGRADE_RTP * 100)}% — ровно так считают Key-Drop и Cases.gg. Шанс от 1% до ${Math.round(App.UPGRADE_MAX * 100)}%. Режим «Меньше»: победа, если число &lt; шанса; «Больше»: если число ≥ 1 − шанс. Стрелка останавливается ровно на выпавшем числе.</p></details>
        <details><summary>Как работают контракты?</summary><p>Отдайте 3–10 предметов и получите один скин. Режимы как у Hellcase: ${Object.values(CM).map((m) => `${m.name.toLowerCase()} — от x${App.fmt(m.lo)} до x${App.fmt(m.hi)}, средний возврат ${Math.round(m.rtp * 100)}%, шанс плюса ${(m.profit * 100).toFixed(0)}%`).join('; ')}.</p></details>
        <details><summary>Как работают батлы?</summary><p>Все участники открывают одинаковые кейсы, вход равен сумме цен кейсов без комиссии. Режимы: Классика (самая дорогая сумма забирает всё), Crazy (самая дешёвая), Terminal (только последний раунд), Jackpot (шанс = доля в банке), Group (банк поровну). Форматы 1v1, 1v1v1, 1v1v1v1, 2v2 и 3v3; в команде выигрыш делится поровну, остаток доплачивается монетами. Ничья решается отдельным provably fair броском. Соперники — боты, они помечены.</p></details>
        <details><summary>Как проверить честность?</summary><p>Каждый результат вычисляется из server seed, client seed и nonce — подробности и проверка на странице <a href="#/fair">«Честная игра»</a>.</p></details>
        <details><summary>Откуда картинки и названия скинов?</summary><p>Из открытой базы <a href="https://github.com/ByMykel/CSGO-API" target="_blank" rel="noopener">ByMykel/CSGO-API</a>, изображения загружаются со Steam CDN. Цены вымышленные и не связаны с реальным рынком; соотношение цен износов взято по медианам Hellcase.</p></details>
      </div>`;
  });
})();
