// History: range chips + SOC, battery power, solar and voltage charts from the cached samples.
import { h } from '../dom.js';
import { app } from '../app.js';
import { store } from '../store.js';
import { lineChart, trendChart, barChart } from '../charts.js';
import { nightSpans } from '../sun.js';

const RANGES = [{ k: '6h', sec: 6 * 3600, ring: 'fine' }, { k: '24h', sec: 24 * 3600, ring: 'fine' }, { k: '7 days', sec: 7 * 86400, ring: 'coarse' }, { k: '30 days', sec: 30 * 86400, ring: 'coarse' }];
let range = 1;

function chartCard({ title, points, color, unit, fmt, min, max, zero, sec, area = true, latest }) {
  const big = h('b', { cls: 'num' }, ''), meta = h('span', {}, '');
  const setLatest = () => { big.textContent = latest == null ? '--' : `${fmt(latest)} ${unit}`; meta.textContent = 'Latest'; };
  setLatest();
  const chart = lineChart({ points, color, unit, fmt, min, max, zero, area, rangeSec: sec, onScrub: (p) => {
    if (!p) return setLatest();
    big.textContent = `${fmt(p.y)} ${unit}`; meta.textContent = new Date(p.x * 1000).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  } });
  return h('div', { cls: 'card' }, h('h3', {}, title), h('div', { cls: 'legend' }, big, meta), chart);
}

export function History() {
  const el = h('div', { cls: 'stack' });

  function update() {
    el.replaceChildren();
    const r = RANGES[range], c = app.van ? store.loadHist(app.van.id) : { fine: [], coarse: [] };
    const now = Date.now() / 1000;
    const rows = (r.ring === 'fine' ? c.fine : c.coarse).filter((s) => s[0] >= now - r.sec);
    const seg = h('div', { cls: 'seg' }, RANGES.map((x, i) => h('button', { cls: i === range ? 'on' : '', onClick: () => { range = i; update(); } }, x.k)));
    el.append(seg);
    if (!rows.length) {
      el.append(h('div', { cls: 'card empty' }, h('b', {}, app.syncing ? 'Loading history...' : 'No history yet'), h('div', { cls: 'help', style: 'margin-top:6px' }, 'The unit records a reading every minute once your phone has connected and set its clock. Come back in a little while.')));
      return;
    }
    const X = (i) => rows[i][0];
    const pts = (k, f = (v) => v) => rows.map((s) => ({ x: s[0], y: s[k] == null ? null : f(s[k]) }));
    const watts = rows.map((s) => ({ x: s[0], y: s[1] != null && s[2] != null ? Math.round(s[1] * s[2]) : null }));
    const last = rows[rows.length - 1], dt = r.ring === 'fine' ? 60 : 900;
    const solarWh = rows.reduce((a, s) => a + (s[4] || 0) * dt / 3600, 0), hasSolar = rows.some((s) => s[4] != null);
    const minSoc = Math.min(...rows.filter((s) => s[3] != null).map((s) => s[3]));
    const useW = rows.filter((s) => s[1] != null && s[2] != null).map((s) => (s[4] || 0) - s[1] * s[2]);
    const avgUse = useW.length ? useW.reduce((a, b) => a + b, 0) / useW.length : null;
    const stat = (label, val, unit) => h('div', { cls: 'tile' }, h('small', {}, label), h('div', { cls: 'v num', style: 'font-size:24px' }, val, h('u', {}, unit)));
    el.append(h('div', { cls: 'grid2', style: 'grid-template-columns:repeat(3,1fr);gap:8px' },
      stat('Solar', hasSolar ? (solarWh >= 1000 ? (solarWh / 1000).toFixed(2) : Math.round(solarWh)) : '--', hasSolar ? (solarWh >= 1000 ? 'kWh' : 'Wh') : ''),
      stat('Lowest', isFinite(minSoc) ? Math.round(minSoc) : '--', '%'),
      stat('Avg use', avgUse == null ? '--' : Math.round(Math.max(0, avgUse)), 'W')));
    // hero: battery % with solar shaded behind and night bands
    const loc = store.settings.location || { lat: -38.1, lon: 145.8 };
    const big = h('b', { cls: 'num' }, ''), meta = h('span', {}, '');
    const showLatest = () => { big.textContent = last[3] == null ? '--' : `${Math.round(last[3])}%`; meta.textContent = 'Latest'; };
    showLatest();
    const chart = trendChart({ rows, rangeSec: r.sec, nights: nightSpans(rows[0][0], last[0], loc.lat, loc.lon), onScrub: (q) => {
      if (!q) return showLatest();
      big.textContent = `${Math.round(q[3])}%`;
      const bits = [new Date(q[0] * 1000).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })];
      if (q[1] != null) bits.push(`${q[1].toFixed(2)} V`); if (q[2] != null) bits.push(`${q[2] > 0 ? '+' : ''}${q[2].toFixed(1)} A`); if (q[4] != null) bits.push(`${Math.round(q[4])} W solar`);
      meta.textContent = bits.join('  -  ');
    } });
    el.append(h('div', { cls: 'card' }, h('h3', {}, 'Battery and solar'), h('div', { cls: 'legend' }, big, meta), chart,
      h('div', { cls: 'key' }, h('span', {}, h('i', { style: 'background:var(--ok)' }), 'Battery'), hasSolar ? h('span', {}, h('i', { style: 'background:#F2B36B' }), 'Solar') : null, h('span', {}, h('i', { style: 'background:var(--dim);opacity:.4' }), 'Night'))));
    if (r.sec >= 7 * 86400 && hasSolar) {
      const perDay = new Map();
      rows.forEach((s0, i) => { if (i === 0) return; const d0 = new Date(s0[0] * 1000); d0.setHours(0, 0, 0, 0); const k = d0.getTime(); perDay.set(k, (perDay.get(k) || 0) + (s0[4] || 0) * Math.min(s0[0] - rows[i - 1][0], 1800) / 3.6e6); });
      const items = [...perDay.entries()].map(([k, v]) => ({ label: new Date(k).getDate().toString(), value: v, today: new Date(k).toDateString() === new Date().toDateString() }));
      el.append(h('div', { cls: 'card' }, h('h3', {}, 'Solar per day (kWh)'), barChart({ items })));
    }
    el.append(chartCard({ title: 'Battery power (+ charging / - using)', points: watts, color: 'var(--accent)', unit: 'W', fmt: (v) => Math.round(v), zero: true, sec: r.sec, latest: watts[watts.length - 1].y }));
    el.append(chartCard({ title: 'Voltage', points: pts(1), color: '#C084FC', unit: 'V', fmt: (v) => v.toFixed(2), sec: r.sec, area: false, latest: last[1] }));
    el.append(h('div', { cls: 'help', style: 'text-align:center' }, 'Touch a chart to read exact values. Up to 24 hours is kept per minute, up to 30 days per 15 minutes.'));
  }
  return { el, update, events: ['history', 'van'] };
}
