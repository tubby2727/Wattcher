// Tiny DOM helpers: h() builds elements, sheet() shows a bottom sheet, toast() a short message.
const SVGNS = 'http://www.w3.org/2000/svg';
export function h(tag, props = {}, ...kids) {
  const svg = tag.startsWith('svg:');
  const el = svg ? document.createElementNS(SVGNS, tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k === 'cls' ? 'class' : k, v === true ? '' : v);
  }
  const add = (k) => { if (Array.isArray(k)) k.forEach(add); else if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k))); };
  kids.forEach(add);
  return el;
}

const P = {
  home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z"/>',
  chart: '<path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L19 8"/>',
  bell: '<path d="M6 17V11a6 6 0 1 1 12 0v6l1.5 2h-15zM10 21h4"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
  warn: '<path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17v.1"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
};
export function icon(name, extra = '') {
  const s = h('span', { html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${P[name] || ''}</svg>`, style: 'display:contents' });
  return s.firstChild;
}

export function sheet(build) {
  const back = h('div', { cls: 'backdrop' });
  const box = h('div', { cls: 'sheet' }, h('div', { cls: 'grab' }));
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  box.append(build(close));
  back.append(box);
  document.body.append(back);
  return close;
}

let toastTimer;
export function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { cls: 'toast' }, msg);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3200);
}

export function confirmSheet({ title, body, action, danger = false }) {
  return new Promise((resolve) => {
    sheet((close) => h('div', { cls: 'stack' },
      h('h2', {}, title), h('div', { cls: 'help' }, body),
      h('button', { cls: `btn ${danger ? 'danger' : ''}`, onClick: () => { close(); resolve(true); } }, action),
      h('button', { cls: 'btn ghost', onClick: () => { close(); resolve(false); } }, 'Cancel')));
  });
}
