// Home: battery ring, time left, power flow, key readings, optional temperature tiles.
import { h, icon } from '../dom.js';
import { app, banner, th } from '../app.js';
import { fmtDur, fmtAgo, fmtDate } from '../proto.js';
import { store } from '../store.js';

const NS = (n, a = {}, ...k) => h('svg:' + n, a, ...k);
const BODY = { x: 112, y: 16, w: 104, h: 72 };

// Smoothly count a number up or down in an element.
function tween(el, to, fmt = (v) => Math.round(v)) {
  if (to == null || Number.isNaN(to)) { el.textContent = '--'; el._v = null; return; }
  const from = el._v == null ? to : el._v; el._v = to;
  cancelAnimationFrame(el._raf);
  const t0 = performance.now(), dur = from === to ? 0 : 700;
  const step = (t) => { const k = dur ? Math.min(1, (t - t0) / dur) : 1, e = 1 - (1 - k) ** 3; el.textContent = fmt(from + (to - from) * e); if (k < 1) el._raf = requestAnimationFrame(step); };
  step(t0);
}

function dots(x1, x2, y, color) {
  return [NS('line', { x1, x2, y1: y, y2: y, cls: 'track-line' }), NS('line', { x1, x2, y1: y, y2: y, cls: 'dots', stroke: color })];
}

export function Home() {
  const bannerEl = h('div', { cls: 'banner' });
  const clipId = `bc${Math.random().toString(36).slice(2, 7)}`;
  const fill = NS('rect', { x: BODY.x + 4, y: BODY.y + 4, width: 0, height: BODY.h - 8, rx: 8, cls: 'bfill' });
  const shimmer = NS('rect', { x: BODY.x + 4, y: BODY.y + 4, width: 34, height: BODY.h - 8, cls: 'bshimmer' });
  const bolt = NS('path', { d: 'M56 6 46 24h8l-3 14 12-18h-8z', cls: 'bbolt', transform: 'translate(79 32) scale(.9)' });
  const pctTxt = NS('text', { x: BODY.x + BODY.w / 2 + 9, y: BODY.y + BODY.h / 2 + 10, 'text-anchor': 'middle', cls: 'bpct' }, '--');
  const [solTrack, solDots] = dots(66, 108, 52, '#7CC4FF');
  const [vanTrack, vanDots] = dots(222, 268, 52, '#F2B36B');
  const sunRays = NS('g', { cls: 'sun', fill: 'none', stroke: 'var(--text)', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, NS('circle', { cx: 12, cy: 12, r: 4.2 }), NS('path', { d: 'M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6' }));
  const svg = NS('svg', { viewBox: '0 0 330 104', cls: 'pf' },
    NS('defs', {}, NS('clipPath', { id: clipId }, NS('rect', { x: BODY.x + 4, y: BODY.y + 4, width: BODY.w - 8, height: BODY.h - 8, rx: 8 }))),
    solTrack, solDots, vanTrack, vanDots,
    NS('circle', { cx: 38, cy: 52, r: 26, cls: 'node-c' }),
    NS('g', { transform: 'translate(24 38) scale(1.17)' }, sunRays),
    NS('rect', { x: BODY.x, y: BODY.y, width: BODY.w, height: BODY.h, rx: 14, cls: 'bbody' }),
    NS('rect', { x: BODY.x + BODY.w, y: 40, width: 7, height: 24, rx: 3, cls: 'bnub' }),
    NS('g', { 'clip-path': `url(#${clipId})` }, fill, NS('g', { cls: 'shimmer-wrap' }, shimmer)),
    bolt, pctTxt,
    NS('circle', { cx: 292, cy: 52, r: 26, cls: 'node-c' }),
    NS('g', { transform: 'translate(277 38) scale(1.2)', fill: 'none', stroke: 'var(--text)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, NS('path', { d: 'M3 16V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v8zM19 14h3' }), NS('circle', { cx: 9, cy: 17.5, r: 2 })));
  const wS = h('b', { cls: 'num' }, '--'), wB = h('b', { cls: 'num' }, '--'), wU = h('b', { cls: 'num' }, '--');
  const watts = h('div', { cls: 'watts' },
    h('div', {}, wS, h('small', {}, 'Solar')), h('div', {}, wB, h('small', {}, 'Battery')), h('div', {}, wU, h('small', {}, 'Van using')));
  const strip = h('div', { cls: 'strip' }, h('span', {}, ''));
  const hero = h('div', { cls: 'card hero' }, svg, watts, strip);

  const todayV = [h('b', { cls: 'num' }, '--'), h('b', { cls: 'num' }, '--'), h('b', { cls: 'num' }, '--')];
  const today = h('div', { cls: 'card' }, h('h3', {}, 'Today'), h('div', { cls: 'today' },
    h('div', {}, todayV[0], h('small', {}, 'Solar in')), h('div', {}, todayV[1], h('small', {}, 'Van used')), h('div', {}, todayV[2], h('small', {}, 'Lowest overnight'))));
  const tteB = { textContent: '' }, tteS = { textContent: '' };

  const tile = (label, unit) => { const v = h('div', { cls: 'v num' }, '--'); const n = h('div', { cls: 'note' }, ''); const el = h('div', { cls: 'tile' }, h('small', {}, label), v, n); return { el, v, n, unit }; };
  const tV = tile('Voltage'), tA = tile('Current'), tS = tile('Solar');
  const full = h('div', { cls: 'tile span2' }, h('small', {}, 'Last full charge'), h('div', { cls: 'v', style: 'font-size:24px' }, ''), h('div', { cls: 'note' }, ''));
  const temps = h('div', { cls: 'grid2' });
  const foot = h('div', { cls: 'help', style: 'text-align:center;padding:8px 0' }, '');
  const grid = h('div', { cls: 'grid2' }, tV.el, tA.el, tS.el, full);

  const el = h('div', { cls: 'stack rise' }, bannerEl, hero, today, grid, temps, foot);

  const set = (t, val, unit, note, tone) => {
    t.v.innerHTML = ''; t.v.append(val == null ? '--' : String(val), val == null || !unit ? '' : h('u', {}, unit));
    t.n.textContent = note || ''; t.el.className = `tile ${tone ? 's-' + tone : ''}`;
  };

  function update() {
    const l = app.live, b = banner(), stale = app.conn !== 'ready';
    bannerEl.className = `banner ${b.tone === 'ok' ? '' : b.tone}`;
    bannerEl.replaceChildren(b.icon ? icon(b.icon) : icon('bolt'), h('div', {}, b.title, b.sub ? h('small', {}, b.sub) : null));
    const t = th();
    // battery picture
    const soc = l?.soc, charging = l?.amps != null && l.amps > 0.2, discharging = l?.amps != null && l.amps < -0.2;
    const tone = soc == null || stale ? 'stale' : soc <= t.socCrit ? 'bad' : soc <= t.socLow ? 'warn' : discharging ? 'amber' : 'ok';
    hero.dataset.tone = tone; hero.classList.toggle('charging', charging && !stale); hero.classList.toggle('stale', stale);
    fill.setAttribute('width', ((BODY.w - 8) * (soc == null ? 0 : Math.max(0.02, Math.min(1, soc / 100)))).toFixed(1));
    tween(pctTxt, soc, (v) => `${Math.round(v)}%`);
    bolt.style.opacity = charging && !stale ? 1 : 0;
    // flow
    const hasSolar = l && l.pv != null, battW = l && l.amps != null && l.volts != null ? Math.round(l.amps * l.volts) : null;
    const pv = hasSolar ? l.pv : 0, use = battW == null ? null : Math.max(0, Math.round(pv - battW));
    const live = !stale && !!l;
    solDots.classList.toggle('on', live && hasSolar && pv > 5); solTrack.classList.toggle('lit', live && hasSolar && pv > 5);
    vanDots.classList.toggle('on', live && use != null && use > 2); vanTrack.classList.toggle('lit', live && use != null && use > 2);
    sunRays.classList.toggle('spin', live && hasSolar && pv > 5);
    tween(wS, hasSolar ? pv : null, (v) => `${Math.round(v)} W`); wS.parentElement.classList.toggle('hidden', !hasSolar && !!l);
    tween(wB, battW, (v) => `${v > 0.5 ? '+' : ''}${Math.round(v)} W`); wB.style.color = battW == null || Math.abs(battW) < 3 ? '' : battW > 0 ? 'var(--ok)' : 'var(--warn)';
    tween(wU, use, (v) => `${Math.round(v)} W`);
    // status strip
    let st = '', stTone = 'none';
    if (!l) st = 'Waiting for readings';
    else if (soc != null && soc >= 99.5 && l.amps > -0.3) { st = 'BATTERY FULL'; stTone = 'ok'; }
    else if (charging && l.tte != null) { st = `CHARGING - full in ${fmtDur(l.tte)}`; stTone = 'ok'; }
    else if (discharging && l.tte != null) { st = `ON BATTERY - ${fmtDur(l.tte)} left`; stTone = 'warn'; }
    else if (charging) { st = 'CHARGING'; stTone = 'ok'; }
    else if (discharging) { st = 'ON BATTERY'; stTone = 'warn'; }
    else if (soc != null) { st = 'STEADY - nothing using or adding power'; }
    strip.className = `strip ${stale && l ? 'none' : stTone}`; strip.firstChild.textContent = st;
    // today
    const td = todaySummary();
    if (td) { tween(todayV[0], td.solarKwh, (v) => `${v.toFixed(1)} kWh`); tween(todayV[1], td.usedKwh, (v) => `${v.toFixed(1)} kWh`); tween(todayV[2], td.lowSoc, (v) => `${Math.round(v)}%`); }
    today.classList.toggle('hidden', !td || !hasSolar && !td.usedKwh);
    // tiles
    const vTone = l?.volts == null ? '' : l.volts <= t.voltLow || l.volts >= t.voltHigh ? 'bad' : 'ok';
    set(tV, l?.volts?.toFixed(2), 'V', '', stale ? 'stale' : vTone);
    set(tA, l?.amps == null ? null : (l.amps > 0 ? '+' : '') + l.amps.toFixed(1), 'A', l?.amps == null ? '' : l.amps > 0.2 ? 'Charging' : l.amps < -0.2 ? 'Discharging' : 'Resting', stale ? 'stale' : '');
    tS.el.classList.add('hidden');

    full.classList.toggle('hidden', !l);
    if (l) { full.children[1].textContent = l.lastFull ? fmtAgo(l.lastFull) : 'Not yet seen'; full.children[2].textContent = l.lastFull ? fmtDate(l.lastFull) : 'Counts when the battery sits at full for a couple of minutes'; }
    // temperature sensors: only those the unit reports (none configured => nothing drawn)
    temps.replaceChildren();
    const names = Object.fromEntries((app.status?.temps || []).map((s) => [s.i, s.n]));
    for (const s of app.sensors) {
      const t2 = tile(names[s.idx] || 'Sensor');
      set(t2, s.temp == null ? null : s.temp.toFixed(1), '°C', s.fresh ? (s.batt ? `Battery ${s.batt}%` : '') : 'No signal', s.fresh ? '' : 'stale');
      temps.append(t2.el);
    }
    temps.classList.toggle('hidden', !app.sensors.length);
    foot.textContent = l ? `Updated ${fmtAgo(l.epoch) === 'Just now' ? 'just now' : fmtAgo(l.epoch).toLowerCase()}${app.status?.fw ? ` - unit v${app.status.fw}` : ''}` : '';
  }
  return { el, update, events: ['live', 'sensors', 'state', 'status', 'van'] };
}

// Energy and lowest battery level since midnight, from the cached history samples [t, v, a, soc, pv].
function todaySummary() {
  if (!app.van) return null;
  const c = store.loadHist(app.van.id), rows = c.fine.length ? c.fine : c.coarse;
  if (rows.length < 3) return null;
  const mid = new Date(); mid.setHours(0, 0, 0, 0); const m = mid.getTime() / 1000;
  let solarWs = 0, usedWs = 0, low = null;
  const nightFrom = m - 6 * 3600, nightTo = m + 10 * 3600;
  for (let i = 1; i < rows.length; i++) {
    const [t, v, a, soc, pv] = rows[i], dt = Math.min(t - rows[i - 1][0], 300);
    if (t >= nightFrom && t <= nightTo && soc != null && (low == null || soc < low)) low = soc;
    if (t < m || dt <= 0) continue;
    const bw = v != null && a != null ? v * a : null, p = pv == null ? 0 : pv;
    solarWs += p * dt; if (bw != null) usedWs += Math.max(0, p - bw) * dt;
  }
  return { solarKwh: solarWs / 3.6e6, usedKwh: usedWs / 3.6e6, lowSoc: low };
}
