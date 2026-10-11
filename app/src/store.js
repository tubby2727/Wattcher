// Saved vans / units and settings, in localStorage. A "van" = one Wattcher unit plus its profile.
import { DEFAULT_TH } from './proto.js';

const KEY = 'wattcher.v1';
let state = { vans: [], activeId: null, settings: { notifications: true, theme: 'auto' } };

try { const raw = localStorage.getItem(KEY); if (raw) state = { ...state, ...JSON.parse(raw) }; } catch (e) { /* private mode: run in memory */ }

function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }
const uid = () => Math.random().toString(36).slice(2, 10);

export const store = {
  get vans() { return state.vans; },
  get settings() { return state.settings; },
  active() { return state.vans.find((v) => v.id === state.activeId) || state.vans[0] || null; },
  setActive(id) { state.activeId = id; save(); },
  addVan({ name, deviceId, deviceName, pin, cap = 100 }) {
    const old = state.vans.find((x) => x.deviceId === deviceId);
    if (old) { Object.assign(old, { name: name || old.name, deviceName: deviceName || old.deviceName, pin, cap }); state.activeId = old.id; save(); return old; }
    const van = { id: uid(), name: name || 'My van', deviceId, deviceName: deviceName || 'Wattcher', pin, cap, th: { ...DEFAULT_TH }, createdAt: Date.now(), last: null };
    state.vans.push(van); state.activeId = van.id; save(); return van;
  },
  updateVan(id, patch) { const v = state.vans.find((x) => x.id === id); if (v) { Object.assign(v, patch); save(); } return v; },
  removeVan(id) {
    state.vans = state.vans.filter((v) => v.id !== id);
    if (state.activeId === id) state.activeId = state.vans[0]?.id || null;
    try { localStorage.removeItem(`wattcher.hist.${id}`); } catch (e) { /* ignore */ }
    save();
  },
  alarmLog() { try { return JSON.parse(localStorage.getItem('wattcher.alog')) || []; } catch (e) { return []; } },
  logAlarm(vanId, alarm, kind) { const l = store.alarmLog(); l.push({ t: Math.floor(Date.now() / 1000), vanId, alarm, kind }); try { localStorage.setItem('wattcher.alog', JSON.stringify(l.slice(-60))); } catch (e) { /* ignore */ } },
  setSetting(k, v) { state.settings[k] = v; save(); },
  // History cache per van: { fine: [[t,v,a,soc,pv]...], coarse: [...] }
  loadHist(id) { try { return JSON.parse(localStorage.getItem(`wattcher.hist.${id}`)) || { fine: [], coarse: [] }; } catch (e) { return { fine: [], coarse: [] }; } },
  saveHist(id, h) { try { localStorage.setItem(`wattcher.hist.${id}`, JSON.stringify(h)); } catch (e) { /* quota: ignore */ } },
};
