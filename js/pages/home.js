/* Главная: баннер, режимы и витрина кейсов по сериям. */
(function () {
  'use strict';

  // серии приходят из data.js (scripts/build_data.py); бесплатные и официальные — отдельно
  const sections = () => [
    { id: 'free', name: 'Бесплатные кейсы', desc: 'Раз в сутки, открываются с уровнем', emblem: 'egg', color: '#2fd27a', filter: (c) => c.free },
    ...(DB.series || []).map((s) => ({ ...s, filter: (c) => !c.free && !c.isCrate && c.series === s.id })),
    { id: 'official', name: 'Кейсы CS2', desc: 'Копии официальных кейсов с шансами как у кейс-сайтов', emblem: 'crosshair', color: '#8a91a8', filter: (c) => c.isCrate },
  ];

  App.route('/', (root) => {
    const guest = !App.loggedIn();
    root.innerHTML = `
      <section class="hero">
        <div class="hero-main">
          <div class="hero-txt">
            <span class="hero-tag">⚡ Симулятор кейсов CS2</span>
            <h1>Открывай. <em>Выбивай.</em> Апгрейдь.</h1>
            <p>${App.cases.filter((c) => !c.isCrate).length} авторских кейсов в ${(DB.series || []).length} сериях, батлы, апгрейды и контракты. Только виртуальные монеты — без пополнений и выводов.</p>
            ${guest
              ? `<button class="steam-btn steam-btn-lg" id="heroLogin"><i class="steam-ic"></i><span>Войти и получить ${App.fmt(App.config.startBalance)} монет</span></button>`
              : `<a class="btn btn-accent btn-lg" href="#/bonus">Крутить колесо бонусов</a>`}
          </div>
          <div class="hero-art">${App.art.hero()}</div>
        </div>
        <div class="hero-modes">
          ${tile('upgrade', '#/upgrade', 'rocket', 'Апгрейд', 'Улучши скин до x20')}
          ${tile('battle', '#/battles', 'crosshair', 'Батлы', 'До 3 на 3, 5 режимов')}
          ${tile('contract', '#/contracts', 'dice', 'Контракты', '3–10 скинов → 1 новый')}
          ${tile('bonus', '#/bonus', 'coin', 'Бонусы', 'Колесо и бесплатные кейсы')}
        </div>
      </section>
      <div class="filters">
        <div class="search"><input id="caseSearch" type="search" placeholder="Поиск кейса" autocomplete="off"></div>
        <div class="seg" id="caseSort">
          <button data-s="def" class="on">По сериям</button>
          <button data-s="asc">Дешевле</button>
          <button data-s="desc">Дороже</button>
        </div>
        <label class="chk"><input type="checkbox" id="caseAfford"> Хватает монет</label>
      </div>
      <div id="caseGroups"></div>`;
    const hl = App.$('#heroLogin');
    if (hl) hl.onclick = () => App.auth.login();

    let sort = 'def';
    // секции вне экрана не рисуются (content-visibility), а до первой отрисовки занимают оценочную высоту --ch:
    // столбцы и высота карточки — как у .cgrid в css, чтобы полоса прокрутки не прыгала
    const sizer = () => {
      const mob = innerWidth <= 640;
      const gap = mob ? 10 : 14;
      const W = App.$('#caseGroups').clientWidth || innerWidth - 40;
      const cols = mob ? 2 : Math.max(1, Math.floor((W + gap) / (200 + gap)));
      const cardH = ((W - (cols - 1) * gap) / cols - 24) * 190 / 240 + 115;
      return (n, head = 48) => {
        const rows = Math.ceil(n / cols);
        return Math.round(head + rows * cardH + (rows - 1) * gap);
      };
    };
    const draw = () => {
      const q = App.$('#caseSearch').value.trim().toLowerCase();
      const afford = App.$('#caseAfford').checked;
      const ok = (c) => (!q || c.name.toLowerCase().includes(q)) && (!afford || (c.free ? App.freeStatus(c).ok : c.price <= App.state.balance));
      const est = sizer();
      let html = '';
      if (sort === 'def') {
        for (const s of sections()) {
          const list = App.cases.filter((c) => s.filter(c) && ok(c));
          if (!list.length) continue;
          html += `<section class="series" style="--sc:${s.color};--ch:${est(list.length)}px">
            <div class="series-head"><div><h2><i><svg viewBox="0 0 64 64">${App.art.icon(s.emblem)}</svg></i>${App.esc(s.name)} <em>${list.length}</em></h2></div>
            <p>${App.esc(s.desc || '')}</p></div>
            <div class="cgrid">${list.map(App.caseCard).join('')}</div></section>`;
        }
      } else {
        const list = App.cases.filter(ok).sort((a, b) => (sort === 'asc' ? a.price - b.price : b.price - a.price));
        html = `<section class="series" style="--ch:${est(list.length, 0)}px"><div class="cgrid">${list.map(App.caseCard).join('')}</div></section>`;
      }
      App.$('#caseGroups').innerHTML = html || App.emptyState('Ничего не найдено', 'eye');
    };
    App.$('#caseSearch').oninput = draw;
    App.$('#caseAfford').onchange = draw;
    App.$('#caseSort').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      sort = b.dataset.s;
      App.$$('#caseSort button').forEach((x) => x.classList.toggle('on', x === b));
      draw();
    };
    draw();
  });

  // плитка режима: значок из спрайта меню, крупная эмблема фоном и стрелка
  function tile(cls, href, icon, title, sub) {
    const sym = { upgrade: 'i-up', battle: 'i-bt', contract: 'i-ct', bonus: 'i-bonus' }[cls] || 'i-cases';
    return `<a class="mode-tile mt-${cls}" href="${href}">
      <svg class="mt-bg" viewBox="0 0 64 64" aria-hidden="true">${App.art.icon(icon)}</svg>
      <span class="mt-badge"><svg class="nic" aria-hidden="true"><use href="#${sym}"/></svg></span>
      <span class="mt-go"><svg aria-hidden="true"><use href="#i-go"/></svg></span>
      <b>${title}</b><span class="mt-sub">${sub}</span></a>`;
  }
})();
