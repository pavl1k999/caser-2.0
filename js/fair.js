/*
 * Provably fair: каждый результат вычисляется из сидов и его можно проверить.
 *
 *   hash  = HMAC-SHA256(key = serverSeed, message = `${clientSeed}:${nonce}:${cursor}`)
 *   i-е число действия = байты 4i…4i+3 хэша (cursor = floor(i/8)) как дробь b0/256 + b1/256² + b2/256³ + b3/256⁴ ∈ [0, 1)
 *   — та же схема, что у Stake (проверочный вектор в tests/fair.test.cjs)
 *   билет = floor(число × 100 000) + 1                                          ∈ 1…100 000
 *
 * До игры показывается SHA-256(serverSeed). После смены сида старый serverSeed раскрывается,
 * и любой результат можно пересчитать на странице «Честная игра» или любым сторонним HMAC-калькулятором.
 * Каждое действие (кейс, апгрейд, контракт, раунд батла) использует новый nonce;
 * Несколько чисел внутри одного действия (билет, float) — подряд идущие четвёрки байт.
 */
(function () {
  'use strict';
  const TICKETS = 100000;

  /* ---------- SHA-256 / HMAC (синхронно, работает и без https) ---------- */
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const utf8 = (s) => new TextEncoder().encode(s);
  function sha256(bytes) {
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(total);
    m.set(bytes);
    m[len] = 0x80;
    const bits = len * 8;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(total - 4, bits >>> 0);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const a = W[i - 15], b = W[i - 2];
        const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
        const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32);
    const ov = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) ov.setUint32(i * 4, H[i]);
    return out;
  }
  function hmac(keyStr, msgStr) {
    let key = utf8(keyStr);
    if (key.length > 64) key = sha256(key);
    const k = new Uint8Array(64);
    k.set(key);
    const ipad = new Uint8Array(64), opad = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      ipad[i] = k[i] ^ 0x36;
      opad[i] = k[i] ^ 0x5c;
    }
    const msg = utf8(msgStr);
    const inner = new Uint8Array(64 + msg.length);
    inner.set(ipad);
    inner.set(msg, 64);
    const ih = sha256(inner);
    const outer = new Uint8Array(96);
    outer.set(opad);
    outer.set(ih, 64);
    return sha256(outer);
  }
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const randHex = (n) => {
    const b = new Uint8Array(n);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => (b[i] = Math.random() * 256));
    return hex(b);
  };

  /* ---------- API ---------- */
  const Fair = (App.fair = { TICKETS, sha256Hex: (s) => hex(sha256(utf8(s))), hmacHex: (k, m) => hex(hmac(k, m)) });

  // число в [0,1) из сидов — чистая функция, ею же пользуется проверка
  // i-е число действия — как у Stake: байты 4i…4i+3 из HMAC(serverSeed, `${clientSeed}:${nonce}:${cursor}`),
  // где cursor = floor(i / 8) (одного хэша хватает на 8 чисел)
  Fair.float = (serverSeed, clientSeed, nonce, i = 0) => {
    const h = hmac(serverSeed, `${clientSeed}:${nonce}:${Math.floor(i / 8)}`);
    const o = (i % 8) * 4;
    return h[o] / 256 + h[o + 1] / 65536 + h[o + 2] / 16777216 + h[o + 3] / 4294967296;
  };
  Fair.ticket = (f) => Math.floor(f * TICKETS) + 1;

  const AUTO_ROTATE = 1000; // как на cases.gg: новый server seed каждые 1000 игр

  function fresh() {
    const seed = randHex(32);
    return { seed, hash: Fair.sha256Hex(seed) };
  }
  function seeds() {
    const st = App.state;
    let f = st.fair;
    if (!f || !f.serverSeed || !f.nextSeed) {
      const cur = fresh(), next = fresh();
      f = st.fair = {
        serverSeed: cur.seed,
        serverHash: cur.hash,
        // следующий seed тоже зафиксирован заранее: его хэш виден до того, как вы смените client seed
        nextSeed: next.seed,
        nextHash: next.hash,
        clientSeed: (f && f.clientSeed) || randHex(8),
        nonce: 0,
        history: (f && f.history) || [],
      };
    }
    return f;
  }
  Fair.current = () => {
    const s = seeds();
    return { serverHash: s.serverHash, nextHash: s.nextHash, clientSeed: s.clientSeed, nonce: s.nonce };
  };

  /**
   * Начать действие: берёт следующий nonce и возвращает генератор чисел этого действия.
   * game.next() → число [0,1) для курсоров 0, 1, 2…; game.proof → данные для проверки.
   */
  Fair.begin = (kind) => {
    const s = seeds();
    if (s.nonce >= AUTO_ROTATE) Fair.rotate();
    const nonce = s.nonce++;
    const serverSeed = s.serverSeed, clientSeed = s.clientSeed;
    let cursor = 0;
    return {
      proof: { kind, serverHash: s.serverHash, clientSeed, nonce },
      next() {
        return Fair.float(serverSeed, clientSeed, nonce, cursor++);
      },
    };
  };
  // для ботов и фоновой ленты: обычный генератор, сиды игрока не тратятся
  Fair.random = () => ({ proof: null, next: Math.random });

  // раскрыть текущий server seed, следующий становится текущим, nonce с нуля
  Fair.rotate = (newClientSeed) => {
    const s = seeds();
    s.history.unshift({ serverSeed: s.serverSeed, serverHash: s.serverHash, clientSeed: s.clientSeed, nonces: s.nonce, at: Date.now() });
    s.history = s.history.slice(0, 50);
    const next = fresh();
    Object.assign(s, {
      serverSeed: s.nextSeed,
      serverHash: s.nextHash,
      nextSeed: next.seed,
      nextHash: next.hash,
      clientSeed: newClientSeed || s.clientSeed,
      nonce: 0,
    });
    App.save();
    return s.history[0];
  };
  // смена client seed тоже раскрывает текущую пару: иначе client seed можно было бы подобрать под известный server seed
  Fair.setClientSeed = (seed) => {
    seed = String(seed || '').trim().slice(0, 64);
    if (!seed) return false;
    Fair.rotate(seed);
    return true;
  };
  Fair.randomClientSeed = () => randHex(8);
  // журнал игр для проверки (последние 100)
  Fair.record = (proof, extra) => {
    if (!proof) return null;
    const st = App.state;
    const rec = { id: App.uid(), ts: Date.now(), ...proof, ...extra };
    st.proofs = [rec].concat(st.proofs || []).slice(0, 100);
    return rec.id;
  };
  Fair.findProof = (id) => (App.state.proofs || []).find((p) => p.id === id) || null;
  // раскрытый server seed по хэшу (для проверки старых результатов)
  Fair.revealed = (hash) => seeds().history.find((h) => h.serverHash === hash) || null;
})();
