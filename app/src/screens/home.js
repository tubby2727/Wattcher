// Home: battery ring, time left, power flow, key readings, optional temperature tiles.
import { h, icon } from '../dom.js';
import { app, banner, th } from '../app.js';
import { fmtDur, fmtAgo, fmtDate } from '../proto.js';

const C = 2 * Math.PI * 100;

export function Home() {
  const bannerEl = h('div', { cls: 'banner' });
  const bar = h('svg:circle', { cx: 118, cy: 118, r: 100, fill: 'none', 'stroke-width': 16, 'stroke-linecap': 'round', cls: 'bar', 'stroke-dasharray': `0 ${C}` });
  const big = h('div', { cls: 'big num' }, '--');
  const sub = h('div', { cls: 'sub' }, '');
  const ring = h('div', { cls: 'ring' },
    h('svg:svg', { viewBox: '0 0 236 236' }, h('svg:circle', { cx: 118, cy: 118, r: 100, fill: 'none', 'stroke-width': 16, 'stroke-linecap': 'round', cls: 'track', 'stroke-dasharray': `${0.75 * C} ${C}` }), bar),
    h('div', { cls: 'center' }, big, sub));
  const tteB = h('b', {}, ''), tteS = h('span', {}, '');
  const hero = h('div', { cls: 'card hero' }, ring, h('div', { cls: 'heroline' }, tteB, tteS));

  const fSolar = h('b', { cls: 'num' }, '--'), fBatt = h('b', { cls: 'num' }, '--'), fUse = h('b', { cls: 'num' }, '--');
  const a1 = h('div', { cls: 'arrow' }), a2 = h('div', { cls: 'arrow' });
  const flow = h('div', { cls: 'card' }, h('h3', {}, 'Power flow'), h('div', { cls: 'flow' },
    h('div', { cls: 'node' }, fSolar, h('small', {}, 'Solar')), a1,
    h('div', { cls: 'node' }, fBatt, h('small', {}, 'Battery')), a2,
    h('div', { cls: 'node' }, fUse, h('small', {}, 'Using'))));

  const tile = (label, unit) => { const v = h('div', { cls: 'v num' }, '--'); const n = h('div', { cls: 'note' }, ''); const el = h('div', { cls: 'tile' }, h('small', {}, label), v, n); return { el, v, n, unit }; };
  const tV = tile('Voltage'), tA = tile('Current'), tS = tile('Solar');
  const full = h('div', { cls: 'tile span2' }, h('small', {}, 'Last full charge'), h('div', { cls: 'v', style: 'font-size:24px' }, ''), h('div', { cls: 'note' }, ''));
  const temps = h('div', { cls: 'grid2' });
  const foot = h('div', { cls: 'help', style: 'text-align:center;padding:8px 0' }, '');
  const grid = h('div', { cls: 'grid2' }, tV.el, tA.el, tS.el, full);

  const el = h('div', { cls: 'stack' }, bannerEl, hero, flow, grid, temps, foot);

  const set = (t, val, unit, note, tone) => {
    t.v.innerHTML = ''; t.v.append(val == null ? '--' : String(val), val == null || !unit ? '' : h('u', {}, unit));
    t.n.textContent = note || ''; t.el.className = `tile ${tone ? 's-' + tone : ''}`;
  };

  function update() {
    const l = app.live, b = banner(), stale = app.conn !== 'ready';
    bannerEl.className = `banner ${b.tone === 'ok' ? '' : b.tone}`;
    bannerEl.replaceChildren(b.icon ? icon(b.icon) : icon('bolt'), h('div', {}, b.title, b.sub ? h('small', {}, b.sub) : null));
    const t = th();
    // ring
    const soc = l?.soc;
    const tone = soc == null ? 'var(--stale)' : soc <= t.socCrit ? 'var(--bad)' : soc <= t.socLow ? 'var(--warn)' : 'var(--ok)';
    bar.setAttribute('stroke', stale && soc != null ? 'var(--stale)' : tone); hero.style.setProperty('--glow', tone);
    bar.setAttribute('stroke-dasharray', `${(soc == null ? 0 : Math.max(0.008, soc / 100)) * 0.75 * C} ${C}`);
    big.innerHTML = ''; big.append(soc == null ? '--' : Math.round(soc).toString(), soc == null ? '' : h('sup', {}, '%'));
    sub.textContent = soc == null ? 'Battery' : l.amps != null && l.amps > 0.2 ? 'Charging' : l.amps != null && l.amps < -0.2 ? 'In use' : 'Resting';
    // time left / to full
    if (l && l.amps != null && l.amps < -0.05 && l.tte != null) { tteB.textContent = `Empty in ${fmtDur(l.tte)}`; tteS.textContent = `at ${Math.abs(l.amps).toFixed(1)} A${l.volts ? ` (${Math.round(Math.abs(l.amps) * l.volts)} W)` : ''}`; }
    else if (l && l.amps != null && l.amps > 0.05 && l.tte != null) { tteB.textContent = soc != null && soc >= 99.5 ? 'Fully charged' : `Full in ${fmtDur(l.tte)}`; tteS.textContent = `charging at ${l.amps.toFixed(1)} A${l.volts ? ` (${Math.round(l.amps * l.volts)} W)` : ''}`; }
    else { tteB.textContent = l ? 'Steady' : 'Waiting for readings'; tteS.textContent = l ? 'Nothing is using or adding power right now' : ''; }
    // flow
    const hasSolar = l && l.pv != null, battW = l && l.amps != null && l.volts != null ? Math.round(l.amps * l.volts) : null;
    flow.classList.toggle('hidden', !hasSolar);
    if (hasSolar) {
      fSolar.textContent = `${l.pv} W`; fBatt.textContent = battW == null ? '--' : `${battW > 0 ? '+' : ''}${battW} W`;
      const use = battW == null ? null : Math.max(0, Math.round(l.pv - battW)); fUse.textContent = use == null ? '--' : `${use} W`;
      a1.className = `arrow ${l.pv > 5 && !stale ? '' : 'idle'}`; a1.style.setProperty('--c', 'var(--warn)');
      a2.className = `arrow ${battW != null && Math.abs(battW) > 5 && !stale ? '' : 'idle'}`; a2.style.setProperty('--c', battW > 0 ? 'var(--ok)' : 'var(--accent)'); a2.style.setProperty('--dir', battW > 0 ? 'normal' : 'reverse');
    }
    // tiles
    const vTone = l?.volts == null ? '' : l.volts <= t.voltLow || l.volts >= t.voltHigh ? 'bad' : 'ok';
    set(tV, l?.volts?.toFixed(2), 'V', '', stale ? 'stale' : vTone);
    set(tA, l?.amps == null ? null : (l.amps > 0 ? '+' : '') + l.amps.toFixed(1), 'A', l?.amps == null ? '' : l.amps > 0.2 ? 'Charging' : l.amps < -0.2 ? 'Discharging' : 'Resting', stale ? 'stale' : '');
    tS.el.classList.toggle('hidden', !hasSolar);
    if (hasSolar) set(tS, l.pv, 'W', l.pv > 5 ? 'Making power' : 'No sun right now', stale ? 'stale' : l.pv > 5 ? 'ok' : '');
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
