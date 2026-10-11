// Wattcher protocol helpers (see docs/protocol.md). Frame layouts mirror firmware/lib/core/frame.h.
export const SVC = '7a7c0001-0000-4a77-8a77-63686572776d';
export const CH = {
  info: '7a7c0002-0000-4a77-8a77-63686572776d',
  live: '7a7c0003-0000-4a77-8a77-63686572776d',
  ctrl: '7a7c0005-0000-4a77-8a77-63686572776d',
  hist: '7a7c0006-0000-4a77-8a77-63686572776d',
  ota: '7a7c0007-0000-4a77-8a77-63686572776d',
  sens: '7a7c0008-0000-4a77-8a77-63686572776d',
};

// Alarm ids match firmware AlarmId. `mutable: false` = cannot be switched off (critical battery).
export const ALARMS = [
  { id: 0, name: 'Battery low', desc: 'State of charge is below the low level', mutable: true },
  { id: 1, name: 'Battery critical', desc: 'State of charge is critically low. Cannot be switched off.', mutable: false },
  { id: 2, name: 'Voltage low', desc: 'Battery voltage is below the low limit', mutable: true },
  { id: 3, name: 'Voltage high', desc: 'Battery voltage is above the high limit', mutable: true },
  { id: 4, name: 'Running out soon', desc: 'Estimated time left is short', mutable: true },
  { id: 5, name: 'No charging', desc: 'The battery has not been charged for a long time', mutable: true },
  { id: 6, name: 'Victron fault', desc: 'A Victron device is reporting an alarm', mutable: true },
  { id: 7, name: 'Signal lost', desc: 'No readings from the shunt', mutable: true },
];

export const DEFAULT_TH = { socLow: 20, socCrit: 10, voltLow: 11.8, voltHigh: 14.8, tteMin: 60, noChargeH: 24 };

const NA16 = 0x7fff, NAU16 = 0xffff, NA32 = 0x7fffffff;

export function parseLive(dv) {
  if (dv.byteLength < 30 || dv.getUint8(0) !== 0) return null;
  const i16 = (o) => { const v = dv.getInt16(o, true); return v === NA16 ? null : v; };
  const soc = dv.getUint16(9, true), tte = dv.getInt32(11, true), full = dv.getUint32(15, true);
  const volts = i16(5), amps = i16(7), pv = i16(19);
  return {
    epoch: dv.getUint32(1, true),
    volts: volts === null ? null : volts / 100,
    amps: amps === null ? null : amps / 10,
    soc: soc === NAU16 ? null : soc / 10,
    tte: tte === NA32 ? null : tte,
    lastFull: full === 0 ? null : full,
    pv,
    alarms: dv.getUint32(21, true),
    off: dv.getUint32(25, true),
    shuntFresh: !!(dv.getUint8(29) & 1),
    mpptFresh: !!(dv.getUint8(29) & 2),
    hasTemps: !!(dv.getUint8(29) & 4),
    at: Date.now(),
  };
}

export function parseSensors(dv) {
  const n = dv.getUint8(0), out = [];
  for (let i = 0; i < n && 1 + i * 6 + 6 <= dv.byteLength; i++) {
    const o = 1 + i * 6, t = dv.getInt16(o + 1, true);
    out.push({ idx: dv.getUint8(o), temp: t === NA16 ? null : t / 100, hum: dv.getUint8(o + 3), batt: dv.getUint8(o + 4), fresh: dv.getUint8(o + 5) === 1 });
  }
  return out;
}

// History packet: [seq u8][12-byte samples...] or [0xFF][u32 total] at the end.
export function parseHistPacket(dv) {
  if (dv.getUint8(0) === 0xff) return { end: true, total: dv.byteLength >= 5 ? dv.getUint32(1, true) : 0, samples: [] };
  const samples = [];
  for (let o = 1; o + 12 <= dv.byteLength; o += 12) {
    const v = dv.getInt16(o + 4, true), a = dv.getInt16(o + 6, true), s = dv.getUint16(o + 8, true), p = dv.getInt16(o + 10, true);
    samples.push({ t: dv.getUint32(o, true), v: v === NA16 ? null : v / 100, a: a === NA16 ? null : a / 10, soc: s === NAU16 ? null : s / 10, pv: p === NA16 ? null : p });
  }
  return { end: false, samples };
}

// ---- formatting
export function fmtDur(min) {
  if (min == null || min < 0) return '';
  if (min < 1) return 'under a minute';
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = Math.round(min % 60);
  if (d >= 1) return `${d} d ${h} h`;
  if (h >= 1) return `${h} h ${m} min`;
  return `${m} min`;
}
export function fmtAgo(epoch, nowS = Date.now() / 1000) {
  if (!epoch) return 'Not seen yet';
  const s = Math.max(0, nowS - epoch);
  if (s < 90) return 'Just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'Yesterday' : `${d} days ago`;
}
export function fmtDate(epoch) {
  return new Date(epoch * 1000).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
export function fmtOffUntil(ms) {
  if (ms == null) return 'until turned on';
  const mins = Math.round((ms - Date.now()) / 60000);
  if (mins < 60) return `for ${Math.max(1, mins)} min`;
  if (mins < 2880) return `for ${Math.round(mins / 60)} h`;
  return `for ${Math.round(mins / 1440)} days`;
}
