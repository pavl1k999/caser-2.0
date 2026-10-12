/* Честная игра: текущие сиды, смена сидов, проверка любого результата. */
(function () {
  'use strict';
  const { esc } = App;
  const KIND_RU = { case: 'Кейс', battle: 'Батл', upgrade: 'Апгрейд', contract: 'Контракт', tiebreak: 'Тай-брейк', jackpot: 'Jackpot', wheel: 'Колесо бонусов' };
  const short = (h) => (h ? h.slice(0, 10) + '…' : '—');

  // пересчёт результата по сидам — тот же код, что в игре
  App.verifyGame = ({ kind, serverSeed, clientSeed, nonce, caseId, chance, dir, slots, mode, sum, shares, seats }) => {
    const F = App.fair;
    // хэш курсора 0 даёт первые 8 чисел; нам нужны числа 0–2 (байты 0–11)
    const hex = F.hmacHex(serverSeed, `${clientSeed}:${nonce}:0`);
    const rows = (kind === 'contract' ? [0, 1, 2] : [0, 1]).map((cur) => ({ cur, hex, f: F.float(serverSeed, clientSeed, nonce, cur) }));
    const out = { rows, lines: [] };
    if (kind === 'case' || kind === 'battle') {
      const c = App.caseById(caseId);
      if (!c) return out;
      const ticket = App.ticketOf(rows[0].f);
      const r = App.rowByTicket(c, ticket);
      const [lo, hi] = App.wearBounds(r.skin, r.wear);
      const fl = lo + (hi - lo) * rows[1].f;
      out.ticket = ticket;
      out.lines.push(['Кейс', esc(c.name)]);
      out.lines.push(['Билет', `${ticket.toLocaleString('ru-RU')} → диапазон ${r.from.toLocaleString('ru-RU')}–${r.to.toLocaleString('ru-RU')}`]);
      out.lines.push(['Предмет', `${r.st ? 'StatTrak™ ' : ''}${esc(r.skin.title)} | ${esc(r.skin.sub)} (${App.WEARS[r.wear].short})`]);
      out.lines.push(['Float', `${fl.toFixed(6)} (${App.WEARS[r.wear].name})`]);
    } else if (kind === 'upgrade') {
      const r = rows[0].f;
      const win = dir === 'over' ? r >= 1 - chance : r < chance;
      out.lines.push(['Шанс', (chance * 100).toFixed(4) + '%']);
      out.lines.push(['Выпало', `${r.toFixed(6)} — ${dir === 'over' ? `нужно ≥ ${(1 - chance).toFixed(6)}` : `нужно < ${chance.toFixed(6)}`}`]);
      out.lines.push(['Итог', win ? '<b class="ok">победа</b>' : '<b class="bad">проигрыш</b>']);
    } else if (kind === 'contract') {
      const md = App.CONTRACT_MODES[mode] || App.CONTRACT_MODES.medium;
      out.lines.push(['Режим', `${md.name} (x${md.lo}–x${md.hi})`]);
      out.lines.push(['Множитель', 'x' + App.contractMult(rows[0].f, mode).toFixed(4)]);
      if (sum > 0) {
        const { entry } = App.contractPick(sum, mode, rows[0].f, rows[1].f, rows[2].f);
        const sk = App.skin(entry.sid);
        out.lines.push(['Цель', `${App.fmt(sum)} × ${App.contractMult(rows[0].f, mode).toFixed(4)} = ${App.fmt(sum * App.contractMult(rows[0].f, mode))}`]);
        out.lines.push(['Предмет', `${esc(sk.title)} | ${esc(sk.sub)} (${App.WEARS[entry.wear].short}) — ${App.fmt(entry.price)}`]);
      }
    } else if (kind === 'wheel') {
      const sec = App.wheelSector(rows[0].f);
      out.lines.push(['Сектор', `${sec.v} (шанс ${((sec.w / App.WHEEL.reduce((a, x) => a + x.w, 0)) * 100).toFixed(0)}%), затем × множитель уровня`]);
    } else if (kind === 'jackpot') {
      out.lines.push(['Колесо', `${rows[0].f.toFixed(6)} — побеждает сектор, на который приходится это число (секторы по доле стоимости дропа, в порядке мест)`]);
      if (shares && shares.length) {
        const tot = shares.reduce((a, x) => a + x, 0) || 1;
        let acc = 0;
        let gi = shares.findIndex((x) => (acc += x / tot) > rows[0].f);
        if (gi < 0) gi = shares.length - 1;
        out.lines.push(['Победитель', `сектор ${gi + 1} из ${shares.length} (доли: ${shares.map((x) => ((x / tot) * 100).toFixed(2) + '%').join(', ')})`]);
      }
    } else if (kind === 'tiebreak') {
      const k = Math.floor(rows[0].f * slots);
      out.lines.push(['Победитель', `кандидат ${k + 1} из ${slots}${seats && seats[k] ? ` (${esc(seats[k])})` : ''}`]);
    }
    return out;
  };

  function render(root, presetId) {
    const f = App.fair.current();
    const st = App.state;
    const proofs = st.proofs || [];
    const hist = (st.fair && st.fair.history) || [];
    root.innerHTML = `
      ${App.pageHead('Честная игра', 'Provably fair: любой результат можно пересчитать', 'shield', '#2fd27a')}
      <p class="fair-note">Каждый результат на сайте — кейс, апгрейд, контракт, раунд батла — вычисляется из трёх значений: <b>server seed</b>, <b>client seed</b> и <b>nonce</b>. Хэш server seed показан заранее, а сам seed раскрывается при смене. После этого любой результат можно пересчитать здесь или в любом HMAC-калькуляторе.</p>
      <section class="fair">
        <div class="panel">
          <h3>Текущая пара сидов</h3>
          <div class="kv">
            <span>Server seed (хэш)</span><code>${f.serverHash}</code>
            <span>Следующий (хэш)</span><code>${f.nextHash}</code>
            <span>Client seed</span><div class="row" style="justify-content:flex-start"><input id="fCs" value="${esc(f.clientSeed)}" maxlength="64" style="flex:1;min-width:0"><button class="btn btn-sm btn-ghost" id="fCsRnd" title="Случайный">🎲</button></div>
            <span>Nonce</span><code>${f.nonce}</code>
          </div>
          <div class="row" style="justify-content:flex-start">
            <button class="btn btn-accent btn-sm" id="fSave">Сохранить client seed</button>
            <button class="btn btn-ghost btn-sm" id="fRotate">Раскрыть server seed и сменить</button>
          </div>
          <p class="fair-note small">Смена client seed тоже раскрывает текущий server seed и начинает новую пару с nonce 0. Хэш следующего server seed зафиксирован заранее, поэтому его нельзя подобрать под ваш новый client seed. Server seed меняется автоматически каждые 1000 игр.</p>
          <h3>Алгоритм</h3>
          <div class="fair-algo">hash    = HMAC_SHA256(key = serverSeed, msg = clientSeed + ":" + nonce + ":" + cursor)
число i = байты 4i…4i+3 из hash (cursor = i div 8):  b0/256 + b1/256² + b2/256³ + b3/256⁴
билет   = floor(число × 100000) + 1                   // 1…100000

Кейс:     число 0 → билет (предмет, износ, StatTrak), число 1 → float внутри износа
Апгрейд:  число 0 → победа, если число &lt; шанс (или ≥ 1 − шанс при «Больше»)
Контракт: число 0 → множитель m, цель t = сумма × m; соседние цены a ≤ t ≤ b,
          число 1 → b, если число &lt; (t − a)/(b − a), иначе a; число 2 → предмет среди равных по цене
Батл:     каждое место в каждом раунде — отдельный nonce (раунд за раундом, места по порядку)
Колесо, Jackpot, тай-брейк: число 0</div>
          <p class="fair-note small">Схема совпадает со Stake. Проверочный вектор: server «some server seed», client «some client seed», nonce 1 → числа <code>${App.fair.float('some server seed', 'some client seed', 1, 0)}</code>, <code>${App.fair.float('some server seed', 'some client seed', 1, 1)}</code>.</p>
          <p class="fair-note small"><b>Ограничения.</b> Это симулятор: server seed создаётся и хранится в вашем браузере, поэтому проверка доказывает только то, что каждый результат — детерминированная функция заранее зафиксированного seed, вашего client seed и nonce, а таблица билетов совпадает с показанной. Она не доказывает щедрость шансов. На настоящих сайтах provably fair тоже не доказывает RTP и честность цен.</p>
        </div>
        <div class="panel">
          <h3>Проверить результат</h3>
          <form class="fair-form" id="fForm">
            <label>Игра<select id="vKind">
              <option value="case">Кейс / батл</option><option value="upgrade">Апгрейд</option><option value="contract">Контракт</option><option value="tiebreak">Тай-брейк батла</option><option value="jackpot">Jackpot батла</option><option value="wheel">Колесо бонусов</option>
            </select></label>
            <label>Server seed (раскрытый)<input id="vSs" autocomplete="off" spellcheck="false"></label>
            <label>Client seed<input id="vCs" autocomplete="off" spellcheck="false"></label>
            <label>Nonce<input id="vNonce" type="number" min="0" value="0"></label>
            <label data-k="case">Кейс<select id="vCase">${App.cases.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
            <label data-k="upgrade">Шанс, %<input id="vChance" type="number" step="0.0001" min="0" max="100" value="50"></label>
            <label data-k="upgrade">Режим<select id="vDir"><option value="under">Меньше (по умолчанию)</option><option value="over">Больше</option></select></label>
            <label data-k="contract">Режим<select id="vMode">${Object.entries(App.CONTRACT_MODES).map(([k, m]) => `<option value="${k}">${m.name}</option>`).join('')}</select></label>
            <label data-k="contract">Стоимость контракта<input id="vSum" type="number" step="0.01" min="0" placeholder="необязательно"></label>
            <label data-k="jackpot">Доли участников (через запятую)<input id="vShares" autocomplete="off" placeholder="например 120.5, 80"></label>
            <label data-k="tiebreak">Участников с равной суммой<input id="vSlots" type="number" min="2" max="6" value="2"></label>
            <button class="btn btn-accent">Проверить</button>
          </form>
          <div class="fair-out" id="vOut"></div>
        </div>
      </section>
      <section class="panel" style="margin-top:16px">
        <div class="panel-head"><b>Мои игры</b><span class="muted small">последние ${proofs.length}</span></div>
        <div class="fair-hist-wrap">${proofs.length ? `<table class="fair-hist"><tbody>${proofs
          .slice(0, 40)
          .map((p) => {
            const open = App.fair.revealed(p.serverHash);
            return `<tr><td class="muted">${new Date(p.ts).toLocaleString('ru-RU')}</td><td>${KIND_RU[p.kind] || p.kind}</td><td>${esc(p.result || '')}</td><td class="muted">nonce ${p.nonce}</td><td>${open ? `<a href="#/fair/${p.id}">Проверить</a>` : '<span class="muted" title="Server seed ещё не раскрыт">seed скрыт</span>'}</td></tr>`;
          })
          .join('')}</tbody></table>` : App.emptyState('Здесь появятся ваши игры', 'hourglass')}</div>
      </section>
      <section class="panel">
        <div class="panel-head"><b>Раскрытые server seed</b></div>
        <div class="fair-hist-wrap">${hist.length ? `<table class="fair-hist"><tbody>${hist
          .map((h) => `<tr><td class="muted">${new Date(h.at).toLocaleString('ru-RU')}</td><td><code>${h.serverSeed}</code></td><td class="muted">хэш ${short(h.serverHash)}</td><td class="muted">client ${esc(h.clientSeed)}</td><td class="muted">игр: ${h.nonces}</td></tr>`)
          .join('')}</tbody></table>` : '<div class="empty">Пока нет. Нажмите «Раскрыть server seed и сменить».</div>'}</div>
      </section>`;

    let presetProof = null;
    const kindSel = App.$('#vKind');
    const syncKind = () => App.$$('#fForm [data-k]').forEach((l) => (l.hidden = l.dataset.k !== kindSel.value));
    kindSel.onchange = syncKind;
    App.$('#fCsRnd').onclick = () => (App.$('#fCs').value = App.fair.randomClientSeed());
    App.$('#fSave').onclick = () => {
      const v = App.$('#fCs').value.trim();
      if (!v) return App.toast('Client seed не может быть пустым', 'error');
      if (v === f.clientSeed) return App.toast('Это текущий client seed', 'info');
      App.fair.setClientSeed(v);
      App.toast('Client seed сохранён, прошлый server seed раскрыт', 'success');
      render(root);
    };
    App.$('#fRotate').onclick = () => {
      App.fair.rotate();
      App.toast('Server seed раскрыт, начата новая пара', 'success');
      render(root, presetId);
    };
    App.$('#fForm').onsubmit = (e) => {
      e.preventDefault();
      check();
    };

    function check() {
      const kind = kindSel.value;
      const serverSeed = App.$('#vSs').value.trim();
      const clientSeed = App.$('#vCs').value.trim();
      const nonce = Math.max(0, Math.floor(+App.$('#vNonce').value || 0));
      if (!serverSeed || !clientSeed) {
        App.$('#vOut').innerHTML = '<span class="bad">Заполните server seed и client seed</span>';
        return;
      }
      const tableNote = presetProof && presetProof.table && presetProof.caseId === App.$('#vCase').value && (kind === 'case')
        ? (App.tableHash(App.caseById(presetProof.caseId)) === presetProof.table ? '' : '<span class="bad">Внимание: таблица билетов этого кейса изменилась после игры, предмет может не совпасть</span>')
        : '';
      const res = App.verifyGame({
        kind, serverSeed, clientSeed, nonce,
        caseId: App.$('#vCase').value,
        chance: Math.min(1, Math.max(0, (+App.$('#vChance').value || 0) / 100)),
        dir: App.$('#vDir').value,
        slots: Math.max(2, Math.floor(+App.$('#vSlots').value || 2)),
        mode: App.$('#vMode').value,
        sum: +App.$('#vSum').value || 0,
        shares: App.$('#vShares').value.split(/[,;\s]+/).map(Number).filter((x) => x > 0),
        seats: presetProof && presetProof.kind === kind ? presetProof.seats : null,
      });
      const hash = App.fair.sha256Hex(serverSeed);
      const known = hash === f.serverHash || hash === f.nextHash || App.fair.revealed(hash);
      App.$('#vOut').innerHTML = `
        <div class="kv">
          <span>SHA-256(server)</span><code>${hash}</code>
          <span></span><span class="${known ? 'ok' : 'bad'}">${known ? '✓ совпадает с опубликованным хэшем' : 'хэш не найден среди ваших сидов'}</span>
          <span>HMAC (cursor 0)</span><code><span class="fair-hl">${res.rows[0].hex.slice(0, 8)}</span><span class="fair-hl2">${res.rows[0].hex.slice(8, 16)}</span>${res.rows[0].hex.slice(16)}</code>
          ${res.rows.map((r) => `<span>Число ${r.cur} (байты ${r.cur * 4}–${r.cur * 4 + 3})</span><code>${r.f.toFixed(10)}</code>`).join('')}
          ${res.lines.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}
          <span>Web Crypto</span><span id="vWc" class="muted">${window.isSecureContext && window.crypto && crypto.subtle ? 'проверяем…' : 'недоступно (нужен https)'}</span>
        </div>${tableNote}`;
      // независимая перепроверка встроенным в браузер HMAC
      if (window.isSecureContext && window.crypto && crypto.subtle) {
        const enc = new TextEncoder();
        crypto.subtle.importKey('raw', enc.encode(serverSeed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
          .then((key) => crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}:0`)))
          .then((sig) => {
            const hex = Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
            const el = App.$('#vWc');
            if (el) el.innerHTML = hex === res.rows[0].hex ? '<b class="ok">совпадает</b>' : '<b class="bad">не совпадает</b>';
          })
          .catch(() => {});
      }
    }

    // предзаполнение из «Мои игры» или из карточки дропа
    let p = presetId ? App.fair.findProof(presetId) : null;
    if (!p && presetId) {
      const it = App.findItem(presetId);
      if (it && it.proof) p = App.fair.findProof(it.proof.id) || it.proof;
    }
    presetProof = p;
    if (p) {
      const open = App.fair.revealed(p.serverHash);
      kindSel.value = p.kind === 'battle' ? 'case' : p.kind;
      App.$('#vCs').value = p.clientSeed;
      App.$('#vNonce').value = p.nonce;
      if (p.caseId) App.$('#vCase').value = p.caseId;
      if (p.chance != null) App.$('#vChance').value = +(p.chance * 100).toFixed(6);
      if (p.dir) App.$('#vDir').value = p.dir;
      if (p.slots) App.$('#vSlots').value = p.slots;
      if (p.mode) App.$('#vMode').value = p.mode;
      if (p.sum) App.$('#vSum').value = p.sum;
      if (p.shares) App.$('#vShares').value = p.shares.map((x) => +x.toFixed(6)).join(', ');
      if (open) {
        App.$('#vSs').value = open.serverSeed;
        syncKind();
        check();
      } else {
        App.$('#vOut').innerHTML = `<span class="muted">Этот результат получен на текущем server seed (хэш <code>${short(p.serverHash)}</code>). Чтобы проверить, раскройте его кнопкой «Раскрыть server seed и сменить».</span>`;
      }
    }
    syncKind();
  }

  App.route('/fair', (root) => render(root));
  App.route('/fair/:id', (root, { id }) => render(root, id));
})();
