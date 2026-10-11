// Notifications and the keep-alive foreground service (Android). In a browser, falls back to the
// Notification API, which only works while the page is open.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { ForegroundService } from '@capawesome-team/capacitor-android-foreground-service';
import { ALARMS, fmtDur } from './proto.js';

export const isNative = () => Capacitor.isNativePlatform();
let ready = false;

export async function ensurePermission() {
  try {
    if (isNative()) {
      let p = await LocalNotifications.checkPermissions();
      if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
      if (!ready && p.display === 'granted') {
        await LocalNotifications.createChannel({ id: 'alarms', name: 'Battery alarms', description: 'Low battery and other alarms', importance: 5, visibility: 1, vibration: true });
        try { await ForegroundService.createNotificationChannel({ id: 'watch', name: 'Watching your unit', description: 'Keeps the connection alive so alarms can reach you', importance: 2 }); } catch (e) { /* older plugin */ }
        ready = true;
      }
      return p.display === 'granted';
    }
    if ('Notification' in window) { if (Notification.permission === 'default') await Notification.requestPermission(); return Notification.permission === 'granted'; }
  } catch (e) { console.warn(e); }
  return false;
}

export async function permissionState() {
  try {
    if (isNative()) return (await LocalNotifications.checkPermissions()).display;
    if ('Notification' in window) return Notification.permission;
  } catch (e) { /* ignore */ }
  return 'unsupported';
}

const detail = (id, live) => {
  if (!live) return '';
  switch (id) {
    case 0: case 1: return `Battery at ${live.soc?.toFixed(0)}%${live.tte != null && live.amps < 0 ? `, about ${fmtDur(live.tte)} left` : ''}.`;
    case 2: case 3: return `Battery voltage is ${live.volts?.toFixed(2)} V.`;
    case 4: return `About ${fmtDur(live.tte)} of battery left at the current use.`;
    case 5: return 'The battery has not been charged for a long time.';
    default: return ALARMS[id].desc;
  }
};

// Called with the previous and new alarm masks. Notifies only for newly raised alarms.
export async function raise(prevMask, mask, van, live, enabled = true) {
  if (!enabled) return;
  for (const a of ALARMS) {
    const bit = 1 << a.id;
    if ((mask & bit) && !(prevMask & bit)) {
      const title = `${van.name}: ${a.name}`, body = detail(a.id, live);
      try {
        if (isNative()) await LocalNotifications.schedule({ notifications: [{ id: 100 + a.id, title, body, channelId: 'alarms', smallIcon: 'ic_stat_wattcher', ongoing: false }] });
        else if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body });
      } catch (e) { console.warn(e); }
    }
    if (!(mask & bit) && (prevMask & bit) && isNative()) { try { await LocalNotifications.cancel({ notifications: [{ id: 100 + a.id }] }); } catch (e) { /* ignore */ } }
  }
}

export async function startWatching(van) {
  if (!isNative()) return;
  try {
    await ForegroundService.startForegroundService({ id: 1001, title: 'Wattcher', body: `Watching ${van.name}`, smallIcon: 'ic_stat_wattcher', serviceType: 16, notificationChannelId: 'watch', silent: true });
  } catch (e) { console.warn('foreground service', e); }
}
export async function stopWatching() { if (isNative()) { try { await ForegroundService.stopForegroundService(); } catch (e) { /* ignore */ } } }
