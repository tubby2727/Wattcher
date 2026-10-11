// Pushes the latest readings to the Android home-screen widgets (native only).
import { Capacitor, registerPlugin } from '@capacitor/core';
import { fmtDur } from './proto.js';

const Widget = Capacitor.isNativePlatform() ? registerPlugin('WattcherWidget') : null;
let last = 0;
const eta = (min) => new Date(Date.now() + min * 60000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function pushWidget(l, van, th, force = false) {
  if (!Widget || !l || (!force && Date.now() - last < 5000)) return;
  last = Date.now();
  const soc = l.soc, charging = l.amps != null && l.amps > 0.2, dis = l.amps != null && l.amps < -0.2;
  const battW = l.amps != null && l.volts != null ? Math.round(l.amps * l.volts) : null, pv = l.pv ?? 0;
  const van_w = battW == null ? null : Math.max(0, Math.round(pv - battW));
  let strip = 'STEADY', short = 'STEADY';
  if (soc != null && soc >= 99.5 && (l.amps ?? 0) > -0.3) { strip = short = 'BATTERY FULL'; }
  else if (charging) { strip = l.tte != null ? `CHARGING - full in ${fmtDur(l.tte)} (about ${eta(l.tte)})` : 'CHARGING'; short = l.tte != null ? `Full ${eta(l.tte)}` : 'CHARGING'; }
  else if (dis) { strip = l.tte != null ? `ON BATTERY - ${fmtDur(l.tte)} left` : 'ON BATTERY'; short = l.tte != null ? `${fmtDur(l.tte)} left` : 'ON BATTERY'; }
  let tone = soc == null ? 4 : soc <= th.socCrit ? 3 : soc <= th.socLow ? 2 : dis ? 1 : 0;
  if (l.alarms) { strip = 'ALARM - open Wattcher'; short = 'ALARM'; tone = 3; }
  Widget.update({ soc: soc == null ? -1 : Math.round(soc), solar: l.pv == null ? -9999 : l.pv, batt: battW ?? -9999, van: van_w ?? -9999, tone, strip, shortStrip: short, name: van.name }).catch(() => {});
}
