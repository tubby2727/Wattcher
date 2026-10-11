// Dependency-free SVG line/area charts with a touch/mouse scrubber.
import { h } from './dom.js';

const W = 360, H = 150, PL = 34, PR = 8, PT = 8, PB = 20;

export function lineChart({ points, color = 'var(--accent)', min = null, max = null, unit = '', fmt = (v) => v.toFixed(1), area = true, zero = false, rangeSec, onScrub }) {
  const valid = points.filter((p) => p.y != null);
  const svg = h('svg:svg', { viewBox: `0 0 ${W} ${H}`, cls: 'chart', preserveAspectRatio: 'none' });
  if (!valid.length) { svg.append(h('svg:text', { x: W / 2, y: H / 2, 'text-anchor': 'middle' }, 'No data yet')); return svg; }
  let lo = min ?? Math.min(...valid.map((p) => p.y)), hi = max ?? Math.max(...valid.map((p) => p.y));
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * (min == null ? 0.08 : 0); if (min == null) lo -= pad; if (max == null) hi += pad;
  const t0 = points[0].x, t1 = points[points.length - 1].x || t0 + 1;
  const X = (t) => PL + ((t - t0) / Math.max(1, t1 - t0)) * (W - PL - PR);
  const Y = (v) => PT + (1 - (v - lo) / (hi - lo)) * (H - PT - PB);

  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) * i) / 3, y = Y(v);
    svg.append(h('svg:line', { x1: PL, x2: W - PR, y1: y, y2: y, cls: 'grid' }), h('svg:text', { x: PL - 5, y: y + 3.5, 'text-anchor': 'end' }, fmt(v)));
  }
  if (zero && lo < 0 && hi > 0) svg.append(h('svg:line', { x1: PL, x2: W - PR, y1: Y(0), y2: Y(0), stroke: 'var(--dim)', 'stroke-dasharray': '3 3', 'stroke-width': 1 }));
  // x labels: 4 ticks
  for (let i = 0; i <= 3; i++) {
    const t = t0 + ((t1 - t0) * i) / 3, d = new Date(t * 1000);
    const lab = rangeSec > 2 * 86400 ? d.toLocaleDateString([], { day: 'numeric', month: 'short' }) : d.toLocaleTimeString([], { hour: 'numeric', minute: i === 0 && false ? '2-digit' : undefined });
    svg.append(h('svg:text', { x: X(t), y: H - 5, 'text-anchor': i === 0 ? 'start' : i === 3 ? 'end' : 'middle' }, lab));
  }
  // path with gaps where data is missing
  let d = '', ad = '', open = false, lastX = 0, firstX = 0;
  const base = Y(zero && lo < 0 && hi > 0 ? 0 : lo);
  for (const p of points) {
    if (p.y == null) { if (open) { ad += `L${lastX},${base}Z`; open = false; } continue; }
    const x = X(p.x), y = Y(p.y);
    if (!open) { d += `M${x},${y}`; ad += `M${x},${base}L${x},${y}`; open = true; firstX = x; } else { d += `L${x},${y}`; ad += `L${x},${y}`; }
    lastX = x;
  }
  if (open) ad += `L${lastX},${base}Z`;
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  svg.append(h('svg:defs', {}, h('svg:linearGradient', { id, x1: 0, x2: 0, y1: 0, y2: 1 },
    h('svg:stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.38 }), h('svg:stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }))));
  if (area) svg.append(h('svg:path', { d: ad, fill: `url(#${id})` }));
  svg.append(h('svg:path', { d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));

  const cursor = h('svg:line', { y1: PT, y2: H - PB, stroke: 'var(--dim)', 'stroke-width': 1, opacity: 0 });
  const dot = h('svg:circle', { r: 4, fill: color, stroke: 'var(--tile)', 'stroke-width': 2, opacity: 0 });
  svg.append(cursor, dot);
  const move = (e) => {
    const r = svg.getBoundingClientRect(), cx = (e.touches ? e.touches[0].clientX : e.clientX);
    const t = t0 + ((cx - r.left) / r.width * W - PL) / (W - PL - PR) * (t1 - t0);
    let best = null;
    for (const p of valid) if (best === null || Math.abs(p.x - t) < Math.abs(best.x - t)) best = p;
    if (!best) return;
    cursor.setAttribute('x1', X(best.x)); cursor.setAttribute('x2', X(best.x)); cursor.setAttribute('opacity', 1);
    dot.setAttribute('cx', X(best.x)); dot.setAttribute('cy', Y(best.y)); dot.setAttribute('opacity', 1);
    onScrub?.(best);
  };
  const leave = () => { cursor.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); onScrub?.(null); };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave); svg.addEventListener('pointerup', leave); svg.addEventListener('pointercancel', leave);
  return svg;
}

// Battery % line with solar shaded behind it and night bands. rows: [t, v, a, soc, pv]. onScrub(row|null).
export function trendChart({ rows, rangeSec, nights = [], onScrub }) {
  const Wd = 360, Hd = 190, L = 34, R = 34, T = 10, B = 22;
  const svg = h('svg:svg', { viewBox: `0 0 ${Wd} ${Hd}`, cls: 'chart trend', preserveAspectRatio: 'none' });
  const t0 = rows[0][0], t1 = Math.max(rows[rows.length - 1][0], t0 + 60);
  const X = (t) => L + ((t - t0) / (t1 - t0)) * (Wd - L - R), Y = (v) => T + (1 - v / 100) * (Hd - T - B);
  const pvMax = Math.max(50, ...rows.map((r) => r[4] || 0)), hasSolar = rows.some((r) => r[4] != null && r[4] > 0), YS = (w) => T + (1 - w / (pvMax * 1.08)) * (Hd - T - B);
  const id = 'tr' + Math.random().toString(36).slice(2, 7);
  svg.append(h('svg:defs', {},
    h('svg:linearGradient', { id: id + 's', x1: 0, x2: 0, y1: 0, y2: 1 }, h('svg:stop', { offset: '0%', 'stop-color': '#F2B36B', 'stop-opacity': 0.55 }), h('svg:stop', { offset: '100%', 'stop-color': '#F2B36B', 'stop-opacity': 0.04 })),
    h('svg:linearGradient', { id: id + 'b', x1: 0, x2: 0, y1: 0, y2: 1 }, h('svg:stop', { offset: '0%', 'stop-color': 'var(--ok)', 'stop-opacity': 0.28 }), h('svg:stop', { offset: '100%', 'stop-color': 'var(--ok)', 'stop-opacity': 0 }))));
  for (const [a, b] of nights) svg.append(h('svg:rect', { x: X(a), y: T, width: Math.max(0, X(b) - X(a)), height: Hd - T - B, fill: 'var(--dim)', opacity: 0.12 }));
  for (const v of [0, 25, 50, 75, 100]) svg.append(h('svg:line', { x1: L, x2: Wd - R, y1: Y(v), y2: Y(v), cls: 'grid' }), h('svg:text', { x: L - 5, y: Y(v) + 3.5, 'text-anchor': 'end' }, `${v}%`));
  if (hasSolar) { svg.append(h('svg:text', { x: Wd - R + 5, y: T + 8, 'text-anchor': 'start', fill: '#F2B36B' }, `${Math.round(pvMax)}W`), h('svg:text', { x: Wd - R + 5, y: Y(0) + 3, 'text-anchor': 'start', fill: '#F2B36B' }, '0')); }
  for (let i = 0; i <= 3; i++) { const t = t0 + ((t1 - t0) * i) / 3, d = new Date(t * 1000); svg.append(h('svg:text', { x: X(t), y: Hd - 6, 'text-anchor': i === 0 ? 'start' : i === 3 ? 'end' : 'middle' }, rangeSec > 2 * 86400 ? d.toLocaleDateString([], { day: 'numeric', month: 'short' }) : d.toLocaleTimeString([], { hour: 'numeric' }))); }
  const gap = rangeSec > 2 * 86400 ? 3600 * 2 : 600;
  // solar area
  if (hasSolar) {
    let ad = '', open = false, lx = 0;
    rows.forEach((r, i) => { const brk = i > 0 && r[0] - rows[i - 1][0] > gap, x = X(r[0]), y = YS(r[4] || 0); if (brk && open) { ad += `L${lx},${YS(0)}Z`; open = false; } if (!open) { ad += `M${x},${YS(0)}L${x},${y}`; open = true; } else ad += `L${x},${y}`; lx = x; });
    if (open) ad += `L${lx},${YS(0)}Z`; svg.append(h('svg:path', { d: ad, fill: `url(#${id}s)`, stroke: '#F2B36B', 'stroke-width': 1.2, 'stroke-opacity': 0.8, 'vector-effect': 'non-scaling-stroke' }));
  }
  // battery line and soft fill
  let d = '', fd = '', open = false, lx = 0;
  rows.forEach((r, i) => { if (r[3] == null) return; const brk = i > 0 && r[0] - rows[i - 1][0] > gap, x = X(r[0]), y = Y(r[3]); if (brk && open) { fd += `L${lx},${Y(0)}Z`; open = false; } if (!open) { d += `M${x},${y}`; fd += `M${x},${Y(0)}L${x},${y}`; open = true; } else { d += `L${x},${y}`; fd += `L${x},${y}`; } lx = x; });
  if (open) fd += `L${lx},${Y(0)}Z`;
  svg.append(h('svg:path', { d: fd, fill: `url(#${id}b)` }), h('svg:path', { d, fill: 'none', stroke: 'var(--ok)', 'stroke-width': 2.4, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', cls: 'draw' }));
  const cursor = h('svg:line', { y1: T, y2: Hd - B, stroke: 'var(--dim)', opacity: 0 }), dot = h('svg:circle', { r: 4.5, fill: 'var(--ok)', stroke: 'var(--tile)', 'stroke-width': 2, opacity: 0 });
  svg.append(cursor, dot);
  const move = (e) => {
    const r = svg.getBoundingClientRect(), cx = e.touches ? e.touches[0].clientX : e.clientX, t = t0 + (((cx - r.left) / r.width * Wd - L) / (Wd - L - R)) * (t1 - t0);
    let best = null; for (const q of rows) if (q[3] != null && (best === null || Math.abs(q[0] - t) < Math.abs(best[0] - t))) best = q;
    if (!best) return; cursor.setAttribute('x1', X(best[0])); cursor.setAttribute('x2', X(best[0])); cursor.setAttribute('opacity', 1);
    dot.setAttribute('cx', X(best[0])); dot.setAttribute('cy', Y(best[3])); dot.setAttribute('opacity', 1); onScrub?.(best);
  };
  const leave = () => { cursor.setAttribute('opacity', 0); dot.setAttribute('opacity', 0); onScrub?.(null); };
  svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move); svg.addEventListener('pointerleave', leave); svg.addEventListener('pointerup', leave); svg.addEventListener('pointercancel', leave);
  return svg;
}

// Vertical bars, one per day. items: [{label, value}]
export function barChart({ items, color = '#F2B36B', fmt = (v) => v.toFixed(1), unit = '' }) {
  const Wd = 360, Hd = 130, L = 8, R = 8, T = 18, B = 20, max = Math.max(0.001, ...items.map((i) => i.value));
  const svg = h('svg:svg', { viewBox: `0 0 ${Wd} ${Hd}`, cls: 'chart', preserveAspectRatio: 'none' });
  const bw = (Wd - L - R) / items.length;
  items.forEach((it, i) => {
    const hh = (it.value / max) * (Hd - T - B), x = L + i * bw + bw * 0.15;
    svg.append(h('svg:rect', { x, y: Hd - B - hh, width: bw * 0.7, height: Math.max(1, hh), rx: Math.min(4, bw * 0.3), fill: color, opacity: it.today ? 1 : 0.75, cls: 'bar-rise', style: `animation-delay:${i * 18}ms` }));
    if (items.length <= 10 || i % 5 === 0) svg.append(h('svg:text', { x: x + bw * 0.35, y: Hd - 6, 'text-anchor': 'middle' }, it.label));
    if (items.length <= 10) svg.append(h('svg:text', { x: x + bw * 0.35, y: Hd - B - hh - 4, 'text-anchor': 'middle', fill: 'var(--text)' }, fmt(it.value)));
  });
  return svg;
}
