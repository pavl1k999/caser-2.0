/*
 * Собственная графика сайта: коробки кейсов в SVG, иллюстрации и иконки режимов.
 * Всё рисуется кодом — без внешних картинок, поэтому работает и офлайн.
 *
 * App.art.caseSVG(theme, opts)  — коробка кейса. theme = { id, colors: [main, dark, accent], style, emblem, label }
 *   style: military | neon | graffiti | lux | tech | arcade
 * App.art.caseUrl(theme)         — та же коробка картинкой: SVG собирается один раз и кешируется как blob-URL
 * App.art.hero()                 — иллюстрация для баннеров и окна входа (HTML: картинки в отдельных слоях)
 * App.art.icon(name)             — эмблема из js/art/icons.js (64×64, currentColor)
 *
 * Коробки показываются через <img>, а SVG-картинке недоступны веб-шрифты,
 * поэтому надпись CASESIM на крышке — готовый контур (Unbounded 800), а наклейка — системный жирный шрифт.
 */
(function () {
  'use strict';
  let uidSeq = 0;

  // детерминированный генератор по строке: у каждого кейса свой узор
  function rng(seed) {
    let h = 2166136261;
    for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => {
      h += 0x6d2b79f5;
      let t = h;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hex2rgb = (h) => {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const mix = (a, b, t) => {
    const x = hex2rgb(a), y = hex2rgb(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  const lighten = (c, t) => mix(c, '#ffffff', t);
  const darken = (c, t) => mix(c, '#000000', t);
  // SVG идёт в картинку как XML: текст экранируем
  const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

  const FALLBACK_ICON = '<path fill="currentColor" d="M32 6l7.6 16.4L58 24.6 44.6 37.2 48 56 32 46.8 16 56l3.4-18.8L6 24.6l18.4-2.2z"/>';
  function icon(name) {
    const lib = window.ART_ICONS || {};
    return lib[name] || FALLBACK_ICON;
  }

  // геометрия коробки (вид спереди-сверху-справа)
  const F = { x: 30, y: 66, w: 168, h: 104 }; // передняя грань
  const D = { x: 24, y: -20 };                // смещение глубины
  const top = `M${F.x} ${F.y} L${F.x + F.w} ${F.y} L${F.x + F.w + D.x} ${F.y + D.y} L${F.x + D.x} ${F.y + D.y} Z`;
  const side = `M${F.x + F.w} ${F.y} L${F.x + F.w + D.x} ${F.y + D.y} L${F.x + F.w + D.x} ${F.y + F.h + D.y} L${F.x + F.w} ${F.y + F.h} Z`;
  const LID = 26; // высота крышки на передней грани
  // «CASESIM» контуром (Unbounded 800, 7.4px, разрядка 1): центр по x = 0, базовая линия y = 0
  const PLATE = 'M-18.8-2.4Q-18.9-1.6-19.4-1.1Q-19.8-.5-20.5-.2Q-21.2 .1-22.1 .1Q-23.1 .1-23.8-.2Q-24.5-.6-24.9-1.2Q-25.3-1.9-25.3-2.8Q-25.3-3.6-24.9-4.3Q-24.5-5-23.8-5.3Q-23.1-5.7-22.1-5.7Q-21.2-5.7-20.5-5.4Q-19.8-5-19.4-4.5Q-18.9-3.9-18.8-3.2H-20.6Q-20.6-3.5-20.8-3.7Q-21-4-21.3-4.1Q-21.6-4.2-22.1-4.2Q-22.6-4.2-22.9-4Q-23.2-3.9-23.4-3.5Q-23.6-3.2-23.6-2.8Q-23.6-2.3-23.4-2Q-23.2-1.7-22.9-1.5Q-22.6-1.4-22.1-1.4Q-21.6-1.4-21.3-1.5Q-21-1.6-20.8-1.8Q-20.6-2-20.6-2.4ZM-16.2-1V-2.4H-12.4V-1ZM-13.2-5.5-10.7 0H-12.5L-14.5-4.8H-14.1L-16.1 0H-17.9L-15.4-5.5ZM-9.7-1.8H-8Q-7.9-1.6-7.8-1.5Q-7.6-1.3-7.3-1.3Q-7.1-1.2-6.7-1.2Q-6.2-1.2-5.9-1.3Q-5.6-1.4-5.6-1.7Q-5.6-1.8-5.8-1.9Q-5.9-2-6.4-2.1L-7.4-2.2Q-8.6-2.3-9.1-2.7Q-9.7-3.1-9.7-3.9Q-9.7-4.5-9.3-4.9Q-9-5.3-8.3-5.5Q-7.7-5.7-6.9-5.7Q-6.1-5.7-5.4-5.5Q-4.8-5.2-4.4-4.8Q-4.1-4.4-4-3.8H-5.8Q-5.8-4-5.9-4.1Q-6.1-4.2-6.3-4.3Q-6.6-4.4-6.9-4.4Q-7.4-4.4-7.7-4.3Q-7.9-4.1-7.9-3.9Q-7.9-3.8-7.8-3.7Q-7.6-3.5-7.2-3.5L-6.1-3.4Q-5.3-3.4-4.8-3.2Q-4.3-3-4.1-2.7Q-3.9-2.4-3.9-1.9Q-3.9-1.3-4.2-.8Q-4.6-.4-5.2-.1Q-5.9 .1-6.7 .1Q-7.6 .1-8.3-.1Q-8.9-.4-9.3-.8Q-9.7-1.2-9.7-1.8ZM2.7-3.4V-2.2H-1.4V-3.4ZM-.3-2.8-.6-.6-1.3-1.4H2.9V0H-2.3L-1.9-2.8L-2.3-5.5H2.9V-4.2H-1.3L-.6-4.9ZM4.5-1.8H6.3Q6.3-1.6 6.5-1.5Q6.6-1.3 6.9-1.3Q7.2-1.2 7.6-1.2Q8.1-1.2 8.4-1.3Q8.6-1.4 8.6-1.7Q8.6-1.8 8.5-1.9Q8.3-2 7.8-2.1L6.9-2.2Q5.7-2.3 5.1-2.7Q4.6-3.1 4.6-3.9Q4.6-4.5 4.9-4.9Q5.3-5.3 5.9-5.5Q6.5-5.7 7.4-5.7Q8.2-5.7 8.8-5.5Q9.4-5.2 9.8-4.8Q10.2-4.4 10.2-3.8H8.5Q8.4-4 8.3-4.1Q8.2-4.2 7.9-4.3Q7.7-4.4 7.3-4.4Q6.9-4.4 6.6-4.3Q6.3-4.1 6.3-3.9Q6.3-3.8 6.5-3.7Q6.7-3.5 7.1-3.5L8.2-3.4Q8.9-3.4 9.4-3.2Q9.9-3 10.2-2.7Q10.4-2.4 10.4-1.9Q10.4-1.3 10-.8Q9.7-.4 9-.1Q8.4 .1 7.5 .1Q6.7 .1 6-.1Q5.3-.4 4.9-.8Q4.6-1.2 4.5-1.8ZM12.1-5.5H13.8V0H12.1ZM24.1-5.5V0H22.5V-4.9L22.8-4.9L20.8 0H19.1L17.1-4.9L17.4-4.9V0H15.8V-5.5H18.4L20.3-.9H19.6L21.4-5.5Z';
  // наклейка на граффити-кейсах: текст любой, поэтому системный жирный шрифт
  const STICKER_FONT = "'Arial Black', 'Segoe UI Black', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

  function patternFront(style, c, r, id) {
    const [main, dark, acc] = c;
    const out = [];
    const X0 = F.x, Y0 = F.y, W = F.w, H = F.h;
    if (style === 'military') {
      // рифлёные полосы и заклёпки
      for (let i = 0; i < 9; i++) out.push(`<rect x="${X0 + 6 + i * 18.5}" y="${Y0 + LID + 8}" width="3" height="${H - LID - 16}" rx="1.5" fill="${darken(main, 0.25)}" opacity=".35"/>`);
      for (const [x, y] of [[X0 + 9, Y0 + 9], [X0 + W - 9, Y0 + 9], [X0 + 9, Y0 + H - 9], [X0 + W - 9, Y0 + H - 9]]) {
        out.push(`<circle cx="${x}" cy="${y}" r="2.6" fill="${lighten(acc, 0.35)}"/>`);
      }
    } else if (style === 'neon') {
      for (let i = 0; i < 7; i++) {
        const y = Y0 + LID + 10 + i * 10;
        out.push(`<line x1="${X0}" y1="${y}" x2="${X0 + W}" y2="${y}" stroke="${acc}" stroke-opacity="${0.06 + (i % 2) * 0.05}" stroke-width="1"/>`);
      }
      for (let i = 0; i < 14; i++) {
        const x = X0 + 6 + r() * (W - 12), y = Y0 + LID + 6 + r() * (H - LID - 12);
        out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.6 + r() * 1.2).toFixed(1)}" fill="${acc}" opacity="${(0.3 + r() * 0.5).toFixed(2)}"/>`);
      }
    } else if (style === 'graffiti') {
      // потёки краски с крышки и брызги
      const cols = [acc, lighten(main, 0.35), '#ffffff'];
      for (let i = 0; i < 9; i++) {
        const x = X0 + 8 + r() * (W - 16), len = 10 + r() * 34, w = 3 + r() * 5, col = cols[i % 3];
        out.push(`<rect x="${x.toFixed(1)}" y="${Y0 + LID - 2}" width="${w.toFixed(1)}" height="${len.toFixed(1)}" rx="${(w / 2).toFixed(1)}" fill="${col}" opacity=".85"/>`);
        out.push(`<circle cx="${(x + w / 2).toFixed(1)}" cy="${(Y0 + LID - 2 + len).toFixed(1)}" r="${(w / 1.6).toFixed(1)}" fill="${col}" opacity=".85"/>`);
      }
      for (let i = 0; i < 16; i++) {
        const x = X0 + r() * W, y = Y0 + LID + r() * (H - LID);
        out.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.8 + r() * 2.4).toFixed(1)}" fill="${cols[i % 3]}" opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`);
      }
      // «тег» — каракуля маркером
      let d = `M${X0 + 14} ${Y0 + H - 16}`;
      for (let i = 0; i < 6; i++) d += ` q ${(6 + r() * 8).toFixed(1)} ${(-10 - r() * 10).toFixed(1)} ${(12 + r() * 8).toFixed(1)} 0`;
      out.push(`<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="2.4" stroke-linecap="round"/>`);
    } else if (style === 'lux') {
      // стёганый ромб
      for (let i = -1; i < 11; i++) {
        const x = X0 + i * 18;
        out.push(`<path d="M${x} ${Y0 + LID} l${H - LID} ${H - LID}" stroke="${lighten(acc, 0.2)}" stroke-opacity=".18" stroke-width="1.2"/>`);
        out.push(`<path d="M${x + (H - LID)} ${Y0 + LID} l${-(H - LID)} ${H - LID}" stroke="${lighten(acc, 0.2)}" stroke-opacity=".18" stroke-width="1.2"/>`);
      }
    } else if (style === 'tech') {
      // дорожки микросхемы
      for (let i = 0; i < 8; i++) {
        let x = X0 + 8 + r() * (W - 16), y = Y0 + LID + 6 + r() * (H - LID - 12);
        let d = `M${x.toFixed(1)} ${y.toFixed(1)}`;
        for (let k = 0; k < 3; k++) {
          if (k % 2) y += (r() - 0.5) * 30;
          else x += (r() - 0.5) * 50;
          x = Math.max(X0 + 4, Math.min(X0 + W - 4, x));
          y = Math.max(Y0 + LID + 4, Math.min(Y0 + H - 4, y));
          d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        out.push(`<path d="${d}" fill="none" stroke="${acc}" stroke-opacity=".45" stroke-width="1.3"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="${acc}" opacity=".7"/>`);
      }
    } else if (style === 'arcade') {
      // пиксели
      const s = 8;
      for (let gx = 0; gx < W / s; gx++) {
        for (let gy = 0; gy < (H - LID) / s; gy++) {
          if (r() < 0.22) out.push(`<rect x="${X0 + gx * s}" y="${Y0 + LID + gy * s}" width="${s}" height="${s}" fill="${r() < 0.5 ? acc : lighten(main, 0.3)}" opacity="${(0.12 + r() * 0.25).toFixed(2)}"/>`);
        }
      }
    }
    return out.join('');
  }

  /**
   * Коробка кейса. Возвращает строку <svg>.
   */
  function caseSVG(theme, opts = {}) {
    const id = 'cs' + ++uidSeq;
    const style = theme.style || 'military';
    let [main, dark, acc] = theme.colors || ['#ff8a00', '#5a2a00', '#ffd23f'];
    if (style === 'neon') {
      dark = '#07080f';
      main = mix(main, '#0b0d18', 0.78);
    }
    const r = rng(theme.id || theme.emblem || 'x');
    const metal = style === 'lux' ? ['#fff1b8', '#d9a520', '#7a5208'] : style === 'neon' ? [acc, acc, acc] : ['#f1f3f8', '#9aa3b5', '#3c4252'];
    const edge = style === 'neon' ? `stroke="${acc}" stroke-width="2.2" filter="url(#${id}g)"` : '';
    const cx = F.x + F.w / 2, cy = F.y + LID + (F.h - LID) / 2 + 1;
    const badge = style === 'lux' || style === 'military'
      ? `<path d="M${cx} ${cy - 33} l29 11 v20 c0 16 -13 25 -29 31 c-16 -6 -29 -15 -29 -31 v-20 z" fill="url(#${id}b)" stroke="url(#${id}m)" stroke-width="3"/>`
      : style === 'arcade'
      ? `<rect x="${cx - 29}" y="${cy - 29}" width="58" height="58" rx="6" fill="url(#${id}b)" stroke="${acc}" stroke-width="3"/>`
      : `<circle cx="${cx}" cy="${cy}" r="30" fill="url(#${id}b)" stroke="${style === 'neon' ? acc : lighten(acc, 0.1)}" stroke-width="3" ${style === 'neon' ? `filter="url(#${id}g)"` : ''}/>`;
    const straps = style === 'military' || style === 'lux'
      ? [F.x + 22, F.x + F.w - 34].map((x) => `<rect x="${x}" y="${F.y - 1}" width="12" height="${F.h + 2}" fill="url(#${id}s)"/>
          <rect x="${x - 2}" y="${F.y + LID - 7}" width="16" height="14" rx="2.5" fill="url(#${id}m)"/>
          <rect x="${x + 2}" y="${F.y + LID - 3}" width="8" height="6" rx="1.5" fill="${darken(main, 0.55)}"/>`).join('')
      : '';
    const corners = style === 'neon' || style === 'graffiti'
      ? ''
      : [[F.x, F.y, 1, 1], [F.x + F.w, F.y, -1, 1], [F.x, F.y + F.h, 1, -1], [F.x + F.w, F.y + F.h, -1, -1]]
          .map(([x, y, sx, sy]) => `<path d="M${x} ${y} h${18 * sx} v${5 * sy} h${-13 * sx} v${13 * sy} h${-5 * sx} z" fill="url(#${id}m)"/>`)
          .join('');
    const sticker = style === 'graffiti'
      ? `<g transform="rotate(-8 ${F.x + 34} ${F.y + F.h - 24})"><rect x="${F.x + 12}" y="${F.y + F.h - 34}" width="46" height="18" rx="4" fill="#fff"/><text x="${F.x + 35}" y="${F.y + F.h - 21.5}" text-anchor="middle" font-family="${STICKER_FONT}" font-weight="900" font-size="8.5" fill="${dark}">${xmlEsc((theme.label || 'CASE').slice(0, 7))}</text></g>`
      : '';
    // фирменная надпись на крышке, как логотип на кейсах CS2
    const plate = style === 'graffiti' ? '' : `<rect x="${cx - 30}" y="${F.y + 7}" width="60" height="12" rx="3" fill="${darken(main, 0.45)}" opacity=".8"/>
      <path transform="translate(${cx} ${F.y + 16})" d="${PLATE}" fill="${style === 'neon' ? acc : lighten(acc, 0.25)}"/>`;

    return `<svg class="case-art" width="240" height="190" viewBox="0 0 240 190" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${xmlEsc(theme.label || 'Кейс')}">
  <defs>
    <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(main, 0.12)}"/><stop offset=".55" stop-color="${main}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="${id}t" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${lighten(main, 0.28)}"/><stop offset="1" stop-color="${lighten(main, 0.08)}"/></linearGradient>
    <linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${darken(main, 0.25)}"/><stop offset="1" stop-color="${darken(dark, 0.3)}"/></linearGradient>
    <linearGradient id="${id}m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${metal[0]}"/><stop offset=".5" stop-color="${metal[1]}"/><stop offset="1" stop-color="${metal[2]}"/></linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${darken(main, 0.6)}"/><stop offset=".5" stop-color="${darken(main, 0.35)}"/><stop offset="1" stop-color="${darken(main, 0.6)}"/></linearGradient>
    <radialGradient id="${id}b" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="${style === 'neon' ? '#141729' : lighten(dark, 0.15)}"/><stop offset="1" stop-color="${style === 'neon' ? '#07080f' : darken(dark, 0.35)}"/></radialGradient>
    <radialGradient id="${id}a" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${acc}" stop-opacity=".55"/><stop offset="1" stop-color="${acc}" stop-opacity="0"/></radialGradient>
    <clipPath id="${id}c"><rect x="${F.x}" y="${F.y}" width="${F.w}" height="${F.h}" rx="9"/></clipPath>
    <filter id="${id}g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  ${opts.noGlow ? '' : `<ellipse cx="122" cy="110" rx="112" ry="78" fill="url(#${id}a)" class="case-aura" opacity=".7"/>`}
  <ellipse cx="124" cy="178" rx="92" ry="9" fill="#000" opacity=".45"/>
  <path d="${side}" fill="url(#${id}r)" ${edge}/>
  <rect x="${F.x + F.w + 7}" y="${F.y + 18}" width="10" height="34" rx="5" transform="skewY(-40)" transform-origin="${F.x + F.w + 12} ${F.y + 35}" fill="${darken(dark, 0.45)}" opacity=".85"/>
  <path d="${top}" fill="url(#${id}t)" ${edge}/>
  <path d="M${F.x + 6} ${F.y - 2} L${F.x + D.x + 4} ${F.y + D.y + 2}" stroke="#fff" stroke-opacity=".25" stroke-width="1.5"/>
  <rect x="${F.x}" y="${F.y}" width="${F.w}" height="${F.h}" rx="9" fill="url(#${id}f)" ${edge}/>
  <g clip-path="url(#${id}c)">
    ${patternFront(style, [main, dark, acc], r, id)}
    <rect x="${F.x}" y="${F.y}" width="${F.w}" height="${LID}" fill="${lighten(main, 0.06)}" opacity=".55"/>
    <rect x="${F.x}" y="${F.y + LID}" width="${F.w}" height="2.5" fill="${darken(dark, 0.4)}"/>
    <rect x="${F.x}" y="${F.y}" width="${F.w}" height="2" fill="#fff" opacity=".22"/>
    ${sticker}
  </g>
  ${straps}${corners}
  <ellipse cx="${cx}" cy="${cy}" rx="44" ry="40" fill="url(#${id}a)"/>
  ${badge}
  <g transform="translate(${cx - 21} ${cy - 21}) scale(.656)" color="${style === 'neon' ? acc : lighten(acc, 0.2)}" ${style === 'neon' ? `filter="url(#${id}g)"` : ''}>${icon(theme.emblem)}</g>
  ${plate}
</svg>`;
  }

  // SVG → картинка: строка собирается один раз, дальше все <img> берут один и тот же blob-URL
  const urls = new Map();
  function svgUrl(key, build) {
    let u = urls.get(key);
    if (!u) {
      const svg = build();
      try {
        u = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      } catch (e) {
        u = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      }
      urls.set(key, u);
    }
    return u;
  }
  const caseUrl = (theme) => svgUrl('case:' + (theme.id || theme.emblem || theme.label), () => caseSVG(theme));
  const coinUrl = () => svgUrl('coin', () => '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="-14 -14 28 28"><circle r="14" fill="#e08a00"/><circle r="11.5" fill="#ffcc33"/><circle r="8" fill="none" stroke="#e08a00" stroke-width="2"/><circle cx="-4" cy="-5" r="3" fill="#fff8d0" opacity=".8"/></svg>');

  // иллюстрация: три коробки веером, монеты и искры.
  // Коробки и монеты — картинки в своих обёртках: «парение» сдвигает готовый слой (transform на композиторе)
  // и ничего не перерисовывает. Мерцает только каждая третья искра.
  function hero() {
    const themes = [
      { id: 'h1', colors: ['#7c3aed', '#2a0d5c', '#c4b5fd'], style: 'neon', emblem: 'bolt' },
      { id: 'h2', colors: ['#ff8a00', '#6b2300', '#ffd23f'], style: 'military', emblem: 'crown' },
      { id: 'h3', colors: ['#10b981', '#063d2c', '#a7f3d0'], style: 'graffiti', emblem: 'skull', label: 'DROP' },
    ];
    const r = rng('hero');
    // координаты сцены 400×230 → проценты
    const pos = (x, y, w, h) => `left:${(x / 4).toFixed(2)}%;top:${(y / 2.3).toFixed(2)}%;width:${(w / 4).toFixed(2)}%;height:${(h / 2.3).toFixed(2)}%`;
    const sparks = Array.from({ length: 14 }, (_, i) => {
      const x = 20 + r() * 360, y = 10 + r() * 200, s = 2 + r() * 4;
      const o = (0.35 + r() * 0.6).toFixed(2), d = (r() * 3).toFixed(2);
      return `<i class="hs-spark${i % 3 ? '' : ' tw'}" style="${pos(x - s, y - s, s * 2, s * 2)};opacity:${o};animation-delay:${d}s"></i>`;
    }).join('');
    const coin = (x, y, s, d) =>
      `<span class="hs-float" style="${pos(x - 14 * s, y - 14 * s, 28 * s, 28 * s)};animation-delay:${d}s"><img src="${coinUrl()}" width="28" height="28" alt="" decoding="async" draggable="false"></span>`;
    const box = (t, x, y, s, rot, d) =>
      `<span class="hs-float" style="${pos(x - 120 * s, y - 95 * s, 240 * s, 190 * s)};animation-delay:${d}s"><img src="${caseUrl(t)}" width="240" height="190" alt="" decoding="async" draggable="false"${rot ? ` style="transform:rotate(${rot}deg)"` : ''}></span>`;
    return `<div class="hero-scene" aria-hidden="true">
      ${sparks}
      ${box(themes[0], 108, 130, 0.72, -12, 0.4)}
      ${box(themes[2], 300, 128, 0.72, 11, 0.9)}
      ${box(themes[1], 204, 112, 0.98, 0, 0)}
      ${coin(54, 60, 1, 0.2)}${coin(352, 48, 0.8, 1.1)}${coin(330, 200, 0.7, 0.6)}${coin(70, 196, 0.6, 1.4)}
    </div>`;
  }

  App.art = { caseSVG, caseUrl, svgUrl, hero, icon, lighten, darken, mix };
})();
