// Reusable forms: add a Victron device (scan or manual + key) and add a temperature sensor.
import { h } from './dom.js';
import { scanNearby } from './ble.js';

const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;
const normKey = (s) => s.replace(/[\s-]/g, '').toLowerCase();
export const validKey = (s) => /^[0-9a-f]{32}$/.test(normKey(s));
export const normMac = (s) => s.trim().toLowerCase();
export const validMac = (s) => MAC_RE.test(normMac(s));

function scanList(kind, filter, onPick) {
  const list = h('div', { cls: 'stack' }), note = h('div', { cls: 'help' }, 'Looking for devices nearby...');
  let stop = null, dead = false;
  scanNearby(kind, (d) => { if (dead || !filter(d)) return; note.textContent = 'Tap yours:';
    list.append(h('button', { cls: 'found', onClick: () => onPick(d) }, h('div', { cls: 'grow', style: 'flex:1' }, h('b', {}, d.name), h('small', { style: 'display:block;color:var(--dim)' }, `${d.mac}  ${d.rssi} dBm`)))); })
    .then((s) => { stop = s; if (dead) s(); }).catch(() => { note.textContent = 'Could not scan here. Type the address below instead.'; });
  const wrap = h('div', { cls: 'stack' }, note, list);
  wrap.dispose = () => { dead = true; stop?.(); };
  return wrap;
}

// role: 'shunt' | 'mppt'. onSave(mac, key) -> Promise<boolean>
export function victronForm(role, onSave, { skipLabel } = {}) {
  const label = role === 'shunt' ? 'battery monitor (SmartShunt / BMV)' : 'solar charger (SmartSolar MPPT)';
  const mac = h('input', { cls: 'input', placeholder: 'aa:bb:cc:dd:ee:ff', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
  const key = h('input', { cls: 'input', placeholder: '32 characters, from VictronConnect', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
  const err = h('div', { cls: 'help', style: 'color:var(--bad)' }, '');
  const scan = scanList('victron', (d) => (role === 'shunt' ? d.role === 'shunt' : d.role === 'solar'), (d) => { mac.value = d.mac.toLowerCase(); key.focus(); });
  const save = h('button', { cls: 'btn', onClick: async () => {
    err.textContent = '';
    if (!validMac(mac.value)) return (err.textContent = 'The address should look like aa:bb:cc:dd:ee:ff');
    if (!validKey(key.value)) return (err.textContent = 'The key should be 32 letters and numbers (0-9, a-f)');
    save.disabled = true; const ok = await onSave(normMac(mac.value), normKey(key.value)); save.disabled = false;
    if (ok) scan.dispose();
  } }, 'Save');
  const el = h('div', { cls: 'stack' }, h('div', { cls: 'help' }, `Add your ${label}.`), scan,
    h('div', { cls: 'field' }, h('label', {}, 'Bluetooth address'), mac), h('div', { cls: 'field' }, h('label', {}, 'Encryption key'), key), err,
    h('div', { cls: 'help' }, 'In VictronConnect: open the device, tap the gear, Product info, "Instant readout details", then Show. The key stays on your phone and the unit.'), save);
  el.dispose = () => scan.dispose();
  return el;
}

export function sensorForm(onSave, defaultName = 'Fridge') {
  const mac = h('input', { cls: 'input', placeholder: 'aa:bb:cc:dd:ee:ff', autocapitalize: 'off', spellcheck: 'false' });
  const name = h('input', { cls: 'input', value: defaultName, maxlength: 16 });
  const err = h('div', { cls: 'help', style: 'color:var(--bad)' }, '');
  const scan = scanList('temp', () => true, (d) => { mac.value = d.mac.toLowerCase(); });
  const chips = ['Fridge', 'Freezer', 'Cabin', 'Outside'].map((n) => h('button', { cls: 'btn ghost small', onClick: () => { name.value = n; } }, n));
  const save = h('button', { cls: 'btn', onClick: async () => {
    err.textContent = ''; if (!validMac(mac.value)) return (err.textContent = 'The address should look like aa:bb:cc:dd:ee:ff');
    save.disabled = true; const ok = await onSave(normMac(mac.value), name.value.trim() || 'Sensor'); save.disabled = false; if (ok) scan.dispose();
  } }, 'Add sensor');
  const el = h('div', { cls: 'stack' }, h('div', { cls: 'help' }, 'Works with Xiaomi LYWSD03MMC sensors flashed with the open ATC firmware. Sensors only appear on the home screen once added.'), scan,
    h('div', { cls: 'field' }, h('label', {}, 'Bluetooth address'), mac), h('div', { cls: 'field' }, h('label', {}, 'Name'), name), h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, chips), err, save);
  el.dispose = () => scan.dispose();
  return el;
}
