// Settings: unit & van, Victron devices, temperature sensors, saved vans, app (theme, updates, setup again).
import { h, sheet, toast, confirmSheet, icon } from '../dom.js';
import { app, cmd, refreshStatus, activate } from '../app.js';
import { store } from '../store.js';
import { victronForm, sensorForm } from '../forms.js';
import { startWizard } from './wizard.js';
import { checkForUpdate } from '../updates.js';
import { firmwareSheet } from './firmware.js';

const VER = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

function applyTheme(t) { document.documentElement.dataset.theme = t; }
export { applyTheme };

function textSheet({ title, label, value, type = 'text', hint, onSave }) {
  sheet((close) => {
    const i = h('input', { cls: 'input', type, value, inputmode: type === 'number' ? 'decimal' : null });
    return h('div', { cls: 'stack' }, h('h2', {}, title), h('div', { cls: 'field' }, h('label', {}, label), i), hint ? h('div', { cls: 'help' }, hint) : null,
      h('button', { cls: 'btn', onClick: async () => { if (await onSave(i.value.trim())) close(); } }, 'Save'));
  });
}

function locationSheet() {
  const cur = store.settings.location || { lat: -38.1, lon: 145.8 };
  const la = h('input', { cls: 'input', type: 'number', step: 'any', value: cur.lat }), lo = h('input', { cls: 'input', type: 'number', step: 'any', value: cur.lon });
  sheet((close) => h('div', { cls: 'stack' }, h('h2', {}, 'Location'), h('div', { cls: 'help' }, 'Only used on this phone to work out sunrise and sunset. South is negative latitude.'),
    h('div', { cls: 'field' }, h('label', {}, 'Latitude'), la), h('div', { cls: 'field' }, h('label', {}, 'Longitude'), lo),
    h('button', { cls: 'btn ghost', onClick: () => navigator.geolocation?.getCurrentPosition((p) => { la.value = p.coords.latitude.toFixed(3); lo.value = p.coords.longitude.toFixed(3); }, () => toast('Could not get your location')) }, 'Use my current location'),
    h('button', { cls: 'btn', onClick: () => { const a = Number(la.value), b = Number(lo.value); if (!(Math.abs(a) <= 90 && Math.abs(b) <= 180)) return toast('Check the numbers'); store.setSetting('location', { lat: a, lon: b }); app.emit('van'); app.emit('history'); close(); } }, 'Save')));
}
function needLink() { if (!app.link || app.conn !== 'ready') { toast('Connect to the unit first'); return false; } return true; }

export function vansSheet() {
  sheet((close) => h('div', { cls: 'stack' }, h('h2', {}, 'Your vans'),
    h('div', { cls: 'list' }, store.vans.map((v) => h('div', { cls: 'row' },
      h('button', { cls: 'grow', style: 'text-align:left', onClick: async () => { close(); if (store.active()?.id !== v.id) await activate(v); } }, h('b', {}, v.name), h('small', {}, v.deviceName + (v.id === app.van?.id ? ' - connected now' : ''))),
      v.id === app.van?.id ? h('span', { cls: 'chip ok' }, 'Active') : null,
      h('button', { 'aria-label': 'Remove', style: 'color:var(--dim);padding:6px', onClick: async () => {
        if (await confirmSheet({ title: `Remove ${v.name}?`, body: 'This only removes it from this phone. The unit keeps working and you can add it again with its PIN.', action: 'Remove from phone', danger: true })) {
          close(); const wasActive = v.id === app.van?.id; store.removeVan(v.id); if (wasActive) await activate(store.active()); if (!store.vans.length) startWizard(); else app.emit('van');
        } } }, icon('trash', 'width="20" height="20"'))))),
    h('button', { cls: 'btn', onClick: () => { close(); startWizard({ add: true }); } }, 'Add another unit')));
}

export function Settings() {
  const el = h('div', { cls: 'stack' });
  let key = '';
  function update() {
    const s = app.status, v = app.van;
    const k = JSON.stringify([s, v?.name, v?.cap, app.conn, store.settings.theme, store.vans.length, store.settings.location]);
    if (k === key && el.childNodes.length) return; key = k;
    el.replaceChildren();
    if (!v) { el.append(h('div', { cls: 'card empty' }, 'No unit yet.', h('div', { style: 'margin-top:12px' }, h('button', { cls: 'btn', onClick: () => startWizard() }, 'Set up a unit')))); return; }
    const row = (title, sub, right, onClick) => h('div', { cls: 'row', onClick, style: onClick ? 'cursor:pointer' : null }, h('div', { cls: 'grow' }, h('b', {}, title), sub ? h('small', {}, sub) : null), right);

    el.append(h('div', { cls: 'card' }, h('h3', {}, 'This unit'), h('div', { cls: 'list' },
      row('Name', v.name, h('span', { cls: 'chip' }, 'Edit'), () => needLink() && textSheet({ title: 'Name this van', label: 'Name', value: v.name, onSave: async (n) => { if (!n) return false; if (await cmd(`NAME ${n}`)) { store.updateVan(v.id, { name: n }); app.emit('van'); await refreshStatus(); return true; } return false; } })),
      row('Battery size', `${v.cap} Ah. Used for time left and time to full.`, h('span', { cls: 'chip' }, 'Edit'), () => needLink() && textSheet({ title: 'Battery size', label: 'Capacity (Ah)', value: v.cap, type: 'number', hint: 'Total usable amp-hours of your battery bank.', onSave: async (n) => { if (!(+n >= 1)) return false; if (await cmd(`CAP ${n}`)) { store.updateVan(v.id, { cap: +n }); return true; } return false; } })),
      row('Unit', `${v.deviceName}${s?.fw ? ` - firmware ${s.fw}` : ''}`, h('span', { cls: `chip ${app.conn === 'ready' ? 'ok' : 'warn'}` }, app.conn === 'ready' ? 'Connected' : 'Not connected')),
      row('Firmware', 'Update the unit over Bluetooth', h('span', { cls: 'chip' }, 'Update'), () => needLink() && firmwareSheet()))));

    const dev = (role, label, mac) => row(label, mac ? mac : 'Not added', h('div', { style: 'display:flex;gap:6px' },
      h('button', { cls: 'btn ghost small', onClick: () => needLink() && sheet((close) => { const f = victronForm(role, async (m, kk) => { if (await cmd(`SETDEV ${role} ${m} ${kk}`, 'Saved. Readings should appear in a few seconds.')) { close(); await refreshStatus(); return true; } return false; }); return h('div', {}, h('h2', {}, mac ? `Replace ${label}` : `Add ${label}`), f); }) }, mac ? 'Replace' : 'Add'),
      mac ? h('button', { cls: 'btn ghost small', onClick: async () => { if (needLink() && await confirmSheet({ title: `Remove ${label}?`, body: 'The unit stops reading it.', action: 'Remove', danger: true })) { await cmd(`DELDEV ${role}`, 'Removed'); await refreshStatus(); } } }, 'Remove') : null));
    el.append(h('div', { cls: 'card' }, h('h3', {}, 'Victron devices'), h('div', { cls: 'list' }, dev('shunt', 'Battery monitor', s?.shunt), dev('mppt', 'Solar charger', s?.mppt)),
      h('div', { cls: 'help', style: 'margin-top:8px' }, 'DC-DC chargers and inverters are decoded by the unit but not yet shown in the app.')));

    const temps = s?.temps || [];
    el.append(h('div', { cls: 'card' }, h('h3', {}, 'Temperature sensors'),
      temps.length ? h('div', { cls: 'list' }, temps.map((t) => row(t.n, t.m, h('button', { cls: 'btn ghost small', onClick: async () => { if (needLink() && await confirmSheet({ title: `Remove ${t.n}?`, body: 'It disappears from the home screen.', action: 'Remove', danger: true })) { await cmd(`SENSOR del ${t.i}`, 'Removed'); await refreshStatus(); } } }, 'Remove'))))
        : h('div', { cls: 'help' }, 'None added. Sensors only appear on the home screen once you add them.'),
      temps.length < 4 ? h('button', { cls: 'btn ghost', style: 'margin-top:10px', onClick: () => needLink() && sheet((close) => { const used = temps.map((t) => t.i); const idx = [0, 1, 2, 3].find((i) => !used.includes(i)); const f = sensorForm(async (m, n) => { if (await cmd(`SENSOR add ${idx} ${m} ${n}`, 'Sensor added')) { close(); await refreshStatus(); return true; } return false; }); return h('div', {}, h('h2', {}, 'Add temperature sensor'), f); }) }, 'Add a sensor') : null));

    el.append(h('div', { cls: 'card' }, h('h3', {}, 'Vans on this phone'), h('div', { cls: 'list' }, store.vans.map((x) => row(x.name, x.deviceName, x.id === v.id ? h('span', { cls: 'chip ok' }, 'Active') : h('span', { cls: 'chip' }, 'Switch'), x.id === v.id ? null : () => activate(x)))),
      h('div', { style: 'display:grid;gap:8px;margin-top:10px' }, h('button', { cls: 'btn ghost', onClick: () => startWizard({ add: true }) }, 'Add another unit'), h('button', { cls: 'btn ghost', onClick: vansSheet }, 'Manage vans'))));

    const themeSeg = h('div', { cls: 'seg' }, ['auto', 'dark', 'light'].map((t) => h('button', { cls: store.settings.theme === t ? 'on' : '', onClick: () => { store.setSetting('theme', t); applyTheme(t); key = ''; update(); } }, t[0].toUpperCase() + t.slice(1))));
    el.append(h('div', { cls: 'card' }, h('h3', {}, 'App'), h('div', { cls: 'field' }, h('label', {}, 'Theme'), themeSeg), row('Location', `${(store.settings.location?.lat ?? -38.1).toFixed(2)}, ${(store.settings.location?.lon ?? 145.8).toFixed(2)}. Used to shade night on the history graph.`, h('span', { cls: 'chip' }, 'Edit'), locationSheet),
      h('div', { style: 'display:grid;gap:8px;margin-top:6px' }, h('button', { cls: 'btn ghost', onClick: () => checkForUpdate(true) }, 'Check for updates'), h('button', { cls: 'btn ghost', onClick: () => startWizard({ rerun: true }) }, 'Run setup again')),
      h('div', { cls: 'help', style: 'margin-top:10px' }, `Wattcher app ${VER}. Open source, Apache-2.0.`)));

    el.append(h('div', { cls: 'card' }, h('h3', {}, 'Reset'), h('div', { cls: 'help' }, 'Wipes this unit: its PIN, devices, alarm levels and history. It can then be set up again from scratch. You can also hold the unit\'s BOOT button for 10 seconds.'),
      h('button', { cls: 'btn danger', style: 'margin-top:10px', onClick: async () => { if (needLink() && await confirmSheet({ title: 'Reset this unit?', body: 'This erases everything stored on the unit. This cannot be undone.', action: 'Reset unit', danger: true })) { await cmd('RESET', 'Unit reset'); store.removeVan(v.id); await activate(store.active()); if (!store.vans.length) startWizard(); } } }, 'Reset unit')));
  }
  return { el, update, events: ['status', 'state', 'van'] };
}
