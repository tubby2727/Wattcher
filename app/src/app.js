// App state + actions shared by the screens. One unit (the active van) is connected at a time.
import { store } from './store.js';
import { makeLink } from './ble.js';
import { ALARMS, DEFAULT_TH } from './proto.js';
import * as alerts from './alerts.js';
import { toast } from './dom.js';

class Emitter {
  constructor() { this.h = {}; }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); return () => { this.h[ev] = this.h[ev].filter((f) => f !== fn); }; }
  emit(ev, ...a) { (this.h[ev] || []).slice().forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }); }
}

export const app = new Emitter();
Object.assign(app, { link: null, van: null, live: null, sensors: [], status: null, conn: 'idle', prevMask: 0, histVersion: 0, syncing: false });

let lastPersist = 0, offStore = {};   // offStore: alarm id -> epoch ms (or null = until turned on); shown in the banner

export async function activate(van) {
  if (app.link) { app.link.want = false; await app.link.close().catch(() => {}); }
  app.van = van; app.live = van?.last?.live || null; app.sensors = []; app.status = null; app.prevMask = 0; app.conn = 'idle';
  if (!van) { app.emit('van'); return; }
  store.setActive(van.id);
  const link = makeLink(); app.link = link;
  link.on('live', (l) => {
    app.live = l; const prev = app.prevMask; app.prevMask = l.alarms;
    if (Date.now() - lastPersist > 20000) { lastPersist = Date.now(); store.updateVan(van.id, { last: { live: l, at: Date.now() } }); }
    alerts.raise(prev, l.alarms, van, l, store.settings.notifications);
    app.emit('live');
  });
  link.on('sensors', (s) => { app.sensors = s; app.emit('sensors'); });
  link.on('status', (s) => { app.status = s; app.emit('status'); });
  link.on('state', (s) => { app.conn = s; app.emit('state'); if (s === 'ready') syncHistory(); });
  link.on('error', (e) => { app.lastError = e; app.emit('state'); });
  app.emit('van');
  if (store.settings.notifications) { await alerts.ensurePermission(); alerts.startWatching(van); }
  link.keepConnected(van);
}

export async function cmd(text, okMsg) {
  try {
    const r = await app.link.cmd(text);
    if (!r.startsWith('OK')) { toast(r.replace('ERR ', '').replace(/^./, (c) => c.toUpperCase())); return false; }
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) { toast(e.message || 'Could not reach the unit'); return false; }
}

export async function refreshStatus() { try { await app.link.refreshStatus(); } catch (e) { /* ignore */ } }

// ---- alarms
export const offList = () => offStore;
export async function setAlarmOff(id, seconds) {
  if (await cmd(`MUTE ${id} ${seconds}`)) { offStore[id] = seconds === 0 ? null : Date.now() + seconds * 1000; app.emit('live'); return true; }
  return false;
}
export async function setAlarmOn(id) { if (await cmd(`UNMUTE ${id}`)) { delete offStore[id]; app.emit('live'); return true; } return false; }

// ---- history cache
const MAXF = 1440, MAXC = 2880;
export async function syncHistory() {
  if (app.syncing || !app.van) return; app.syncing = true;
  try {
    const id = app.van.id, c = store.loadHist(id);
    const pack = (s) => [s.t, s.v, s.a, s.soc, s.pv];
    const lastF = c.fine.length ? c.fine[c.fine.length - 1][0] : 0, lastC = c.coarse.length ? c.coarse[c.coarse.length - 1][0] : 0;
    const f = await app.link.history('fine', lastF); c.fine = c.fine.concat(f.map(pack)).slice(-MAXF);
    const co = await app.link.history('coarse', lastC); c.coarse = c.coarse.concat(co.map(pack)).slice(-MAXC);
    store.saveHist(id, c); app.histVersion++; app.emit('history');
  } catch (e) { console.warn('history sync', e); } finally { app.syncing = false; }
}

export const th = () => ({ ...DEFAULT_TH, ...(app.van?.th || {}) });
export const alarmName = (id) => ALARMS[id].name;
export function banner() {
  const l = app.live;
  if (!app.van) return { tone: 'warn', title: 'No unit set up', sub: 'Run setup to add your Wattcher' };
  if (app.conn !== 'ready' || !l) {
    return { tone: 'warn', title: app.conn === 'connecting' || app.conn === 'idle' ? 'Connecting to your unit...' : 'Unit not in range', sub: l ? 'Showing the last readings' : 'Make sure it is powered and nearby' };
  }
  const on = ALARMS.filter((a) => l.alarms & (1 << a.id)), off = ALARMS.filter((a) => l.off & (1 << a.id));
  if (on.length) return { tone: 'bad', title: on.map((a) => a.name).join(', '), sub: on.length > 1 ? `${on.length} alarms active` : 'Alarm active', icon: 'warn' };
  if (off.length) return { tone: 'warn', title: `All OK - ${off.map((a) => a.name).join(', ')} off`, sub: 'Open Alarms to turn back on', icon: 'warn' };
  if (!l.shuntFresh) return { tone: 'warn', title: 'No shunt readings yet', sub: 'Check the shunt is in range, or add it in Settings', icon: 'warn' };
  return { tone: 'ok', title: 'All OK', sub: '', icon: 'ok' };
}
