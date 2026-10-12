/* Главная: баннеры и витрина кейсов. */
(function () {
  'use strict';
  const GROUPS = [
    { id: 'popular', title: 'Популярные кейсы', icon: '🔥' },
    { id: 'elite', title: 'Элитные кейсы', icon: '👑' },
    { id: 'official', title: 'Официальные кейсы CS2', icon: '📦' },
  ];

  App.route('/', (root) => {
    const st = App.state;
    root.innerHTML = `
      <section class="hero">
        <a class="hero-main" href="#/bonus">
          <div class="hero-txt">
            <span class="hero-tag">Ежедневно</span>
            <h1>Бесплатные монеты<br>каждый день</h1>
            <p>Забирай ежедневный бонус, вводи промокоды и открывай кейсы без реальных денег</p>
            <span class="btn btn-accent">Забрать бонус</span>
          </div>
          <div class="hero-art">${App.imgTag(App.caseById('karambit').cover)}</div>
        </a>
        <a class="hero-side hs-upgrade" href="#/upgrade"><b>Апгрейд</b><span>Улучши скин до x20</span></a>
        <a class="hero-side hs-battle" href="#/battles"><b>Батлы</b><span>Победитель забирает всё</span></a>
        <a class="hero-side hs-contract" href="#/contracts"><b>Контракты</b><span>3–10 скинов → 1 новый</span></a>
      </section>
      <div class="filters">
        <div class="search"><input id="caseSearch" type="search" placeholder="Поиск кейса" autocomplete="off"></div>
        <div class="seg" id="caseSort">
          <button data-s="def" class="on">По умолчанию</button>
          <button data-s="asc">Дешевле</button>
          <button data-s="desc">Дороже</button>
        </div>
        <label class="chk"><input type="checkbox" id="caseAfford"> Хватает монет</label>
      </div>
      <div id="caseGroups"></div>`;

    let sort = 'def';
    const draw = () => {
      const q = App.$('#caseSearch').value.trim().toLowerCase();
      const afford = App.$('#caseAfford').checked;
      const out = [];
      for (const g of GROUPS) {
        let list = App.cases.filter((c) => c.group === g.id);
        if (q) list = list.filter((c) => c.name.toLowerCase().includes(q));
        if (afford) list = list.filter((c) => c.price <= st.balance);
        if (sort === 'asc') list = list.slice().sort((a, b) => a.price - b.price);
        if (sort === 'desc') list = list.slice().sort((a, b) => b.price - a.price);
        if (!list.length) continue;
        out.push(`<section class="cgroup"><h2 class="sec-title"><span>${g.icon}</span>${g.title}<em>${list.length}</em></h2>
          <div class="cgrid">${list.map(App.caseCard).join('')}</div></section>`);
      }
      App.$('#caseGroups').innerHTML = out.join('') || '<div class="empty">Ничего не найдено</div>';
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
})();
