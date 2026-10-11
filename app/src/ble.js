// Bluetooth link to a Wattcher unit (works natively through Capacitor and in Chrome through Web Bluetooth),
// plus nearby-device scanning for the setup wizard. A mock unit is used for the demo and design previews.
import { BleClient } from '@capacitor-community/bluetooth-le';
import { SVC, CH, parseLive, parseSensors, parseHistPacket } from './proto.js';
import { MockLink, mockScanNearby, mockPickUnit } from './mock.js';

export const isMock = () => new URLSearchParams(location.search).has('mock') || sessionStorage.getItem('wattcher.demo') === '1';

class Emitter {
  constructor() { this.h = {}; }
  on(ev, fn) { (this.h[ev] ||= []).push(fn); return () => { this.h[ev] = this.h[ev].filter((f) => f !== fn); }; }
  emit(ev, ...a) { (this.h[ev] || []).slice().forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (s) => new DataView(new TextEncoder().encode(s).buffer);
const dec = new TextDecoder();
let initialized = false;
async function init() { if (!initialized) { await BleClient.initialize({ androidNeverForLocation: true }); initialized = true; } }

export class Link extends Emitter {
  constructor() { super(); this.state = 'idle'; this.deviceId = null; this.buf = ''; this.waiting = null; this.queue = Promise.resolve(); this.hist = null; this.want = false; this.status = null; }
  setState(s) { if (this.state !== s) { this.state = s; this.emit('state', s); } }

  async open(deviceId, mode, pin) { await this.connectOnly(deviceId); await this.authenticate(mode, pin); }
  // Connect and read the unit's public info ({claimed}) without logging in; used by the setup wizard.
  async connectOnly(deviceId) {
    await init();
    this.deviceId = deviceId; this.setState('connecting'); this.buf = '';
    await BleClient.connect(deviceId, () => this.dropped(), { timeout: 15000 });
    try { const dv = await BleClient.read(deviceId, SVC, CH.info); return JSON.parse(dec.decode(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength))); } catch (e) { return { claimed: true }; }
  }
  async authenticate(mode, pin) {   // mode: 'auth' | 'claim'
    const deviceId = this.deviceId;
    await BleClient.startNotifications(deviceId, SVC, CH.ctrl, (dv) => this.onCtrl(dv));
    await BleClient.startNotifications(deviceId, SVC, CH.live, (dv) => { const l = parseLive(dv); if (l) this.emit('live', l); });
    await BleClient.startNotifications(deviceId, SVC, CH.sens, (dv) => this.emit('sensors', parseSensors(dv)));
    await BleClient.startNotifications(deviceId, SVC, CH.hist, (dv) => this.onHist(dv));
    await this.cmd(`TIME ${Math.floor(Date.now() / 1000)}`);
    const r = await this.cmd(mode === 'claim' ? `CLAIM ${pin}` : `AUTH ${pin}`);
    if (!r.startsWith('OK')) { await this.close(); throw new Error(r.replace('ERR ', '')); }
    this.setState('ready');
    this.refreshStatus().catch(() => {});
  }
  async refreshStatus() {
    const r = await this.cmd('STATUS');
    try { this.status = JSON.parse(r); this.emit('status', this.status); } catch (e) { /* ignore */ }
    return this.status;
  }
  async close() {
    this.want = false;
    if (this.deviceId) { try { await BleClient.disconnect(this.deviceId); } catch (e) { /* already gone */ } }
    this.setState('idle');
  }
  dropped() { this.setState('lost'); if (this.waiting) { this.waiting.reject(new Error('Disconnected')); this.waiting = null; } this.emit('dropped'); }

  onCtrl(dv) {
    this.buf += dec.decode(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), { stream: true });
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
      if (this.waiting) { const w = this.waiting; this.waiting = null; w.resolve(line); }
    }
  }
  cmd(text, timeout = 8000) {
    const run = () => new Promise(async (resolve, reject) => {
      const t = setTimeout(() => { this.waiting = null; reject(new Error('The unit did not answer')); }, timeout);
      this.waiting = { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } };
      try { await BleClient.write(this.deviceId, SVC, CH.ctrl, enc(text)); } catch (e) { clearTimeout(t); this.waiting = null; reject(e); }
    });
    this.queue = this.queue.then(run, run);
    return this.queue;
  }
  // Over-the-air firmware update. bytes: Uint8Array of the app image; md5: hex string.
  async ota(bytes, md5, onProgress) {
    const r = await this.cmd(`OTA BEGIN ${bytes.length} ${md5}`);
    if (!r.startsWith('OK')) throw new Error(r.replace('ERR ', ''));
    const mtu = 180;
    for (let o = 0; o < bytes.length; o += mtu) {
      const part = bytes.slice(o, o + mtu);
      await BleClient.write(this.deviceId, SVC, CH.ota, new DataView(part.buffer));
      if ((o / mtu) % 20 === 0) onProgress?.(o / bytes.length);
    }
    onProgress?.(1);
    const e = await this.cmd('OTA END', 20000);
    if (!e.startsWith('OK')) throw new Error(e.replace('ERR ', ''));
  }
  onHist(dv) {
    if (!this.hist) return;
    const p = parseHistPacket(dv);
    this.hist.samples.push(...p.samples);
    if (p.end) { const h = this.hist; this.hist = null; h.resolve(h.samples); }
  }
  async history(kind, since = 0) {
    const done = new Promise((resolve, reject) => { this.hist = { samples: [], resolve, reject }; setTimeout(() => { if (this.hist) { const h = this.hist; this.hist = null; h.resolve(h.samples); } }, 40000); });
    const r = await this.cmd(`HIST ${kind} ${since}`);
    if (!r.startsWith('OK')) { this.hist = null; throw new Error(r); }
    return done;
  }

  // Keep trying to reconnect (used while the app or its foreground service is running).
  async keepConnected(van) {
    this.want = true; let delay = 2000;
    while (this.want) {
      if (this.state === 'ready') { await sleep(1500); continue; }
      try { await this.open(van.deviceId, 'auth', van.pin); delay = 2000; }
      catch (e) { this.emit('error', e); this.setState('lost'); await sleep(delay); delay = Math.min(delay * 2, 30000); }
    }
  }
}

export function makeLink() { return isMock() ? new MockLink() : new Link(); }

// ---- discovery
export async function pickUnit() {
  if (isMock()) return mockPickUnit();
  await init();
  const d = await BleClient.requestDevice({ namePrefix: 'Wattcher', optionalServices: [SVC] });
  return { deviceId: d.deviceId, name: d.name || 'Wattcher' };
}

// kind: 'victron' | 'temp'. Calls onFound for each distinct device; returns a stop function.
export async function scanNearby(kind, onFound) {
  if (isMock()) return mockScanNearby(kind, onFound);
  await init();
  const seen = new Set();
  await BleClient.requestLEScan({ allowDuplicates: true }, (r) => {
    const mac = r.device.deviceId, name = r.localName || r.device.name || '';
    if (kind === 'victron') {
      const md = r.manufacturerData && (r.manufacturerData['737'] || r.manufacturerData[737]);
      if (!md || md.getUint8(0) !== 0x10) return;
      const type = md.getUint8(4), product = md.getUint8(2) | (md.getUint8(3) << 8);
      const role = type === 0x02 ? 'shunt' : type === 0x01 ? 'solar' : type === 0x04 || type === 0x0f ? 'dcdc' : type === 0x03 ? 'inverter' : 'other';
      const k = mac + role; if (seen.has(k)) return; seen.add(k);
      onFound({ mac, name: name || 'Victron device', role, product, rssi: r.rssi });
    } else {
      const sd = r.serviceData && Object.entries(r.serviceData).find(([u]) => u.toLowerCase().includes('181a'));
      if (!sd || seen.has(mac)) return; seen.add(mac);
      onFound({ mac, name: name || 'Temperature sensor', rssi: r.rssi });
    }
  });
  return async () => { try { await BleClient.stopLEScan(); } catch (e) { /* ignore */ } };
}
