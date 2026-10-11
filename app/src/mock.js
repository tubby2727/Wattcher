// Simulated Wattcher unit for the demo mode and for design previews. Same interface as the real Link.
import { DEFAULT_TH } from './proto.js';

class Emitter {
  constructor() { this.h = {}; }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); return () => { this.h[ev] = this.h[ev].filter((f) => f !== fn); }; }
  emit(ev, ...a) { (this.h[ev] || []).slice().forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- shared simulated unit
const unit = {
  claimed: false, pin: null, name: 'Demo van', cap: 200,
  shunt: 'ff:56:f2:c6:0b:92', mppt: 'fb:55:45:cf:26:63', temps: [{ i: 0, n: 'Fridge', m: 'a4:c1:38:00:00:01', t: 3.6 }, { i: 1, n: 'Freezer', m: 'a4:c1:38:00:00:02', t: -17.8 }],
  th: { ...DEFAULT_TH }, off: {}, fw: '0.2.0', soc: 76, lastFull: Math.floor(Date.now() / 1000) - 26 * 3600,
};

function solar(tsec, cloud = 1) {
  const d = new Date(tsec * 1000), h = d.getHours() + d.getMinutes() / 60;
  const x = (h - 6.5) / 11;
  return x <= 0 || x >= 1 ? 0 : Math.round(Math.sin(Math.PI * x) ** 1.4 * 420 * cloud);
}
function loadA(tsec) {
  const d = new Date(tsec * 1000), h = d.getHours() + d.getMinutes() / 60;
  let a = 2.2 + (Math.sin(tsec / 1800) + 1) * 0.7;                       // fridge cycling
  if (h > 17.5 && h < 22.5) a += 4 + Math.sin(tsec / 700) * 1.5;           // evening lights, TV, pump
  if (h > 6.5 && h < 8.5) a += 4;                                         // kettle, toaster
  return a;
}

let histCache = null;
function buildHistory() {
  if (histCache) return histCache;
  const end = Math.floor(Date.now() / 60000) * 60, start = end - 30 * 86400, fine = [], coarse = [];
  let soc = 78, acc = [];
  for (let t = start; t <= end; t += 60) {
    const day = Math.floor(t / 86400), cloud = [1, 0.9, 0.35, 0.6, 1, 0.8, 0.25][day % 7];
    const pv = solar(t, cloud), v = 12.4 + soc / 100 * 1.05 + (pv > 50 ? 0.25 : 0) - loadA(t) * 0.012;
    const a = pv / Math.max(v, 11) * 0.93 - loadA(t);
    soc = Math.max(12, Math.min(100, soc + (a * (60 / 3600)) / unit.cap * 100));
    if (soc >= 100 && a > 0) soc = 100;
    const s = { t, v: +v.toFixed(2), a: +a.toFixed(1), soc: +soc.toFixed(1), pv };
    if (t > end - 86400) fine.push(s);
    acc.push(s);
    if (acc.length === 15) {
      const avg = (k) => acc.reduce((x, y) => x + y[k], 0) / acc.length;
      coarse.push({ t: acc[0].t - (acc[0].t % 900), v: +avg('v').toFixed(2), a: +avg('a').toFixed(1), soc: +avg('soc').toFixed(1), pv: Math.round(avg('pv')) });
      acc = [];
    }
  }
  unit.soc = soc;
  histCache = { fine, coarse };
  return histCache;
}

export class MockLink extends Emitter {
  constructor() { super(); this.state = 'idle'; this.status = null; this.want = false; this.timer = null; }
  setState(s) { if (this.state !== s) { this.state = s; this.emit('state', s); } }
  async connectOnly() { this.setState('connecting'); await sleep(500); return { claimed: unit.claimed }; }
  async authenticate(mode, pin) { return this.open(null, mode, pin, true); }
  async open(deviceId, mode, pin, skipConnect) {
    if (!skipConnect) { this.setState('connecting'); await sleep(500); }
    if (mode === 'claim') {
      if (unit.claimed) { this.setState('idle'); throw new Error('already claimed'); }
      unit.claimed = true; unit.pin = pin;
    } else if (unit.claimed && unit.pin !== pin) { this.setState('idle'); throw new Error('bad pin'); }
    unit.claimed = true; unit.pin = unit.pin || pin;
    buildHistory();
    this.setState('ready'); this.status = this.statusObj(); this.emit('status', this.status);
    this.tick(); clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 1000);
  }
  statusObj() {
    return { fw: unit.fw, name: unit.name, claimed: 1, cap: unit.cap, shunt: unit.shunt, mppt: unit.mppt, th: [unit.th.socLow, unit.th.socCrit, unit.th.voltLow, unit.th.voltHigh, unit.th.tteMin, unit.th.noChargeH],
      temps: unit.temps.map((t) => ({ i: t.i, n: t.n, m: t.m })), clock: 1, hist: [1440, 2880] };
  }
  async refreshStatus() { this.status = this.statusObj(); this.emit('status', this.status); return this.status; }
  tick() {
    const now = Math.floor(Date.now() / 1000), pv = unit.mppt ? solar(now) : null, load = loadA(now);
    const v = 12.4 + unit.soc / 100 * 1.05 + (pv > 50 ? 0.25 : 0);
    const a = (pv || 0) / v * 0.93 - load + Math.sin(now / 13) * 0.2;
    unit.soc = Math.max(5, Math.min(100, unit.soc + (a / 3600) / unit.cap * 100));
    if (unit.soc >= 99.5) unit.lastFull = now;
    const tte = a < -0.05 ? Math.round((unit.cap * unit.soc / 100) / -a * 60) : a > 0.05 ? Math.round((unit.cap * (100 - unit.soc) / 100) / a * 60) : null;
    let alarms = 0, off = 0;
    const act = [unit.soc <= unit.th.socLow && unit.soc > unit.th.socCrit, unit.soc <= unit.th.socCrit, v <= unit.th.voltLow, v >= unit.th.voltHigh, a < 0 && tte != null && tte <= unit.th.tteMin, false, false, false];
    act.forEach((on, i) => { const o = unit.off[i]; const isOff = o !== undefined && (o === Infinity || o > Date.now()); if (isOff) off |= 1 << i; else if (on) alarms |= 1 << i; });
    this.emit('live', { epoch: now, volts: +v.toFixed(2), amps: +a.toFixed(1), soc: +unit.soc.toFixed(1), tte, lastFull: unit.lastFull, pv, alarms, off, shuntFresh: !!unit.shunt, mpptFresh: !!unit.mppt, hasTemps: unit.temps.length > 0, at: Date.now() });
    this.emit('sensors', unit.temps.map((t) => ({ idx: t.i, temp: +(t.t + Math.sin(now / 400 + t.i) * 0.4).toFixed(2), hum: 55, batt: 87, fresh: true })));
  }
  async close() { this.want = false; clearInterval(this.timer); this.setState('idle'); }
  async cmd(text) {
    await sleep(80);
    const [verb, ...rest] = text.split(' '); const arg = rest.join(' ');
    switch (verb) {
      case 'TIME': case 'SAVE': case 'UNMUTE': if (verb === 'UNMUTE') delete unit.off[+arg]; return 'OK';
      case 'STATUS': return JSON.stringify(this.statusObj());
      case 'CAP': unit.cap = +arg; return 'OK';
      case 'NAME': unit.name = arg; return 'OK';
      case 'THRESH': { const [a, b, c, d, e, f] = arg.split(' ').map(Number); unit.th = { socLow: a, socCrit: b, voltLow: c, voltHigh: d, tteMin: e, noChargeH: f }; return 'OK'; }
      case 'SETDEV': { const [k, mac] = arg.split(' '); unit[k] = mac; return 'OK reboot'; }
      case 'DELDEV': unit[arg] = null; return 'OK reboot';
      case 'SENSOR': { const [op, idx, mac, ...name] = arg.split(' '); if (op === 'add') unit.temps = unit.temps.filter((t) => t.i !== +idx).concat({ i: +idx, n: name.join(' ') || 'Sensor', m: mac, t: 5 }); else unit.temps = unit.temps.filter((t) => t.i !== +idx); return 'OK reboot'; }
      case 'MUTE': { const [id, s] = arg.split(' ').map(Number); if (id === 1) return 'ERR cannot mute'; unit.off[id] = s === 0 ? Infinity : Date.now() + s * 1000; return 'OK'; }
      case 'OTA': return 'OK';
      case 'RESET': unit.claimed = false; unit.pin = null; return 'OK reboot';
      default: return 'ERR unknown';
    }
  }
  async ota(bytes, md5, onProgress) { for (let i = 1; i <= 20; i++) { await sleep(120); onProgress?.(i / 20); } unit.fw = '0.3.0'; this.status = this.statusObj(); this.emit('status', this.status); }
  async history(kind, since = 0) { const h = buildHistory(); await sleep(400); return (kind === 'coarse' ? h.coarse : h.fine).filter((s) => s.t > since); }
  async keepConnected(van) { this.want = true; if (this.state !== 'ready') await this.open(van.deviceId, 'auth', van.pin).catch((e) => this.emit('error', e)); }
}

export async function mockPickUnit() { await sleep(300); return { deviceId: 'mock-unit-1', name: 'Wattcher-BBDA' }; }
export async function mockScanNearby(kind, onFound) {
  const items = kind === 'victron'
    ? [{ mac: 'FF:56:F2:C6:0B:92', name: 'SmartShunt 500A', role: 'shunt', product: 0xc038, rssi: -61 }, { mac: 'FB:55:45:CF:26:63', name: 'SmartSolar MPPT 150/45', role: 'solar', product: 0xa073, rssi: -72 }]
    : [{ mac: 'A4:C1:38:00:00:03', name: 'ATC_000003', rssi: -58 }];
  const timers = items.map((it, i) => setTimeout(() => onFound(it), 600 + i * 700));
  return async () => timers.forEach(clearTimeout);
}
