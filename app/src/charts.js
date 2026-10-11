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
