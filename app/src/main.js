// Wattcher app entry: screens, navigation, first-run wizard, update check.
import './styles.css';
import { h, icon, toast } from './dom.js';
import { app, activate, banner } from './app.js';
import { store } from './store.js';
import { Home } from './screens/home.js';
import { History } from './screens/history.js';
import { Alarms } from './screens/alarms.js';
import { Settings, applyTheme, vansSheet } from './screens/settings.js';
import { startWizard } from './screens/wizard.js';
import { checkForUpdate } from './updates.js';
import { isMock } from './ble.js';

applyTheme(store.settings.theme || 'auto');

const root = document.getElementById('app');
const screens = { home: Home(), history: History(), alarms: Alarms(), settings: Settings() };
const NAV = [['home', 'Home', 'home'], ['history', 'History', 'chart'], ['alarms', 'Alarms', 'bell'], ['settings', 'Settings', 'gear']];
let current = new URLSearchParams(location.search).get('tab') || 'home';

const vanName = h('span', {}, '');
const pill = h('span', { cls: 'pill' }, h('i'), h('span', {}, ''));
const top = h('div', { cls: 'top' }, h('button', { cls: 'van', onClick: () => (store.vans.length ? vansSheet() : startWizard()) }, vanName, icon('chev')), pill);
const body = h('div', { cls: 'screen' });
const nav = h('div', { cls: 'nav' });

function drawNav() {
  const alarmOn = app.live && app.live.alarms;
  nav.replaceChildren(...NAV.map(([k, label, ic]) => h('button', { cls: k === current ? 'on' : '', onClick: () => show(k) }, h('span', { style: 'position:relative;display:grid' }, icon(ic), k === 'alarms' && alarmOn ? h('span', { cls: 'badge' }) : null), label)));
}
function drawTop() {
  vanName.textContent = app.van?.name || 'Wattcher';
  const ready = app.conn === 'ready', wait = app.conn === 'connecting' || app.conn === 'idle';
  pill.className = `pill ${ready ? 'live' : wait && app.van ? 'wait' : ''}`;
  pill.lastChild.textContent = !app.van ? 'No unit' : ready ? 'Live' : wait ? 'Connecting' : 'Out of range';
}
function show(k) {
  current = k; body.replaceChildren(screens[k].el); screens[k].update(); drawNav(); window.scrollTo(0, 0);
}
function refresh(ev) {
  drawTop(); drawNav();
  if (screens[current].events.includes(ev) || ev === 'van') screens[current].update();
}
['live', 'sensors', 'state', 'status', 'history', 'van'].forEach((ev) => app.on(ev, () => refresh(ev)));

root.append(top, body, nav);
show(current);

(async () => {
  const van = store.active();
  if (isMock() && !van) {
    const v = store.addVan({ name: 'Demo van', deviceId: 'mock-unit-1', deviceName: 'Wattcher-BBDA', pin: '123456', cap: 200 });
    await activate(v);
  } else if (van) await activate(van);
  else startWizard();
  if (!isMock()) setTimeout(() => checkForUpdate(false), 4000);
})();

// Lightweight "demo" entry for the browser version: ?mock in the address bar.
if (isMock()) toast('Demo mode: simulated unit');
// pages rebuild
