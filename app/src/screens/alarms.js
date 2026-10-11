// Alarms: on/off with confirm + duration, thresholds, notification status. Off alarms are always visible.
import { h, sheet, toast } from '../dom.js';
import { app, cmd, setAlarmOff, setAlarmOn, offList, th, refreshStatus } from '../app.js';
import { ALARMS, fmtOffUntil } from '../proto.js';
import { store } from '../store.js';
import * as alerts from '../alerts.js';

const DURATIONS = [['1 hour', 3600], ['8 hours', 8 * 3600], ['3 days', 3 * 86400], ['Until I turn it on', 0]];

function offSheet(a) {
  sheet((close) => h('div', { cls: 'stack' },
    h('h2', {}, `Turn off "${a.name}"?`),
    h('div', { cls: 'help' }, 'You will not get notified for this alarm while it is off. The home screen will keep showing that it is off. Other alarms still work.'),
    DURATIONS.map(([label, s]) => h('button', { cls: 'btn ghost', onClick: async () => { close(); if (await setAlarmOff(a.id, s)) toast(`${a.name} off ${s ? 'for ' + label : 'until you turn it on'}`); } }, label)),
    h('button', { cls: 'btn', onClick: close }, 'Keep it on')));
}

function threshSheet() {
  const t = th();
  const inp = (label, key, step = 1) => { const i = h('input', { cls: 'input', type: 'number', inputmode: 'decimal', step, value: t[key] }); return { i, f: h('div', { cls: 'field' }, h('label', {}, label), i), key }; };
  const fields = [inp('Battery low (%)', 'socLow'), inp('Battery critical (%)', 'socCrit'), inp('Voltage low (V)', 'voltLow', 0.1), inp('Voltage high (V)', 'voltHigh', 0.1), inp('Running out soon (minutes left)', 'tteMin', 5), inp('No charging for (hours)', 'noChargeH')];
  sheet((close) => h('div', {}, h('h2', {}, 'Alarm levels'), h('div', { cls: 'help' }, 'These are stored on the unit, so they apply to any phone.'), fields.map((f) => f.f),
    h('button', { cls: 'btn', style: 'margin-top:10px', onClick: async () => {
      const v = Object.fromEntries(fields.map((f) => [f.key, Number(f.i.value)]));
      if (await cmd(`THRESH ${v.socLow} ${v.socCrit} ${v.voltLow} ${v.voltHigh} ${v.tteMin} ${v.noChargeH}`, 'Saved')) { store.updateVan(app.van.id, { th: v }); close(); app.emit('live'); }
    } }, 'Save')));
}

export function Alarms() {
  const el = h('div', { cls: 'stack' });
  let lastKey = '';
  function update() {
    const l = app.live; const key = `${l?.alarms}|${l?.off}|${app.conn}|${Object.keys(offList())}`;
    if (key === lastKey && el.childNodes.length) return; lastKey = key;
    el.replaceChildren();
    const offAny = ALARMS.some((a) => l && (l.off & (1 << a.id)));
    if (offAny) el.append(h('div', { cls: 'banner warn' }, h('div', {}, 'Some alarms are off', h('small', {}, 'They will not notify you until turned back on'))));
    const rows = ALARMS.map((a) => {
      const isOff = l ? !!(l.off & (1 << a.id)) : false, active = l ? !!(l.alarms & (1 << a.id)) : false, until = offList()[a.id];
      const sw = h('button', { cls: `switch ${!isOff ? 'on' : ''} ${a.mutable ? '' : 'locked'}`, 'aria-label': a.name, onClick: async () => {
        if (!app.link || app.conn !== 'ready') return toast('Connect to the unit first');
        if (isOff) { if (await setAlarmOn(a.id)) toast(`${a.name} is on`); } else offSheet(a);
      } });
      return h('div', { cls: 'row' }, h('div', { cls: 'grow' }, h('b', {}, a.name), h('small', {}, isOff ? `Off ${until === undefined ? '' : until === null ? 'until turned on' : fmtOffUntil(until)}`.trim() : a.desc)),
        active ? h('span', { cls: 'chip bad' }, 'Active') : isOff ? h('span', { cls: 'chip warn' }, 'Off') : null, sw);
    });
    el.append(h('div', { cls: 'card' }, h('h3', {}, 'Alarms'), h('div', { cls: 'list' }, rows)));
    el.append(h('button', { cls: 'btn ghost', onClick: () => app.conn === 'ready' ? threshSheet() : toast('Connect to the unit first') }, 'Change alarm levels'));
    // notifications
    const nCard = h('div', { cls: 'card' }, h('h3', {}, 'Notifications on this phone'));
    const sw = h('button', { cls: `switch ${store.settings.notifications ? 'on' : ''}`, onClick: async () => {
      const on = !store.settings.notifications; store.setSetting('notifications', on);
      if (on) { const ok = await alerts.ensurePermission(); if (!ok) toast('Allow notifications for Wattcher in Android settings'); alerts.startWatching(app.van); } else alerts.stopWatching();
      lastKey = ''; update();
    } });
    nCard.append(h('div', { cls: 'row' }, h('div', { cls: 'grow' }, h('b', {}, 'Alarm notifications'), h('small', {}, store.settings.notifications ? 'On. Wattcher keeps a quiet notification so Android lets it stay connected.' : 'Off. Alarms only show inside the app.')), sw));
    nCard.append(h('div', { cls: 'help', style: 'margin-top:10px' }, alerts.isNative() ? 'On Samsung phones, also set Battery to Unrestricted for Wattcher (Settings, Apps, Wattcher, Battery), otherwise Android may stop it overnight. Notifications follow your Do Not Disturb settings.' : 'In a browser, notifications only work while this page is open. Install the Android app for background alerts.'));
    el.append(nCard);
  }
  return { el, update, events: ['live', 'state', 'van'] };
}
