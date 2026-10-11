import SparkMD5 from 'spark-md5';
// Checks GitHub Releases for a newer app version (the unit firmware is updated from the app separately).
import { sheet, h, toast } from './dom.js';

const REPO = 'tubby2727/Wattcher';
const VER = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; };

export async function latestRelease() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('No release found');
  return r.json();
}

export async function checkForUpdate(verbose = false) {
  try {
    const rel = await latestRelease(), tag = (rel.tag_name || '').replace(/^v/, '');
    const apk = (rel.assets || []).find((a) => a.name.endsWith('.apk'));
    if (cmp(tag, VER) > 0) {
      sheet((close) => h('div', { cls: 'stack' }, h('h2', {}, `Update ${tag} available`), h('div', { cls: 'help' }, (rel.body || '').slice(0, 400) || 'A new version of Wattcher is ready.'),
        h('button', { cls: 'btn', onClick: () => { window.open(apk?.browser_download_url || rel.html_url, '_blank'); close(); } }, apk ? 'Download update' : 'See release'),
        h('div', { cls: 'help' }, 'After it downloads, open it and tap Install. Your vans and settings stay.'), h('button', { cls: 'btn ghost', onClick: close }, 'Later')));
      return rel;
    }
    if (verbose) toast('You have the latest version');
  } catch (e) { if (verbose) toast('Could not check for updates right now'); }
  return null;
}

export const APP_VERSION = VER;
export const cmpVer = cmp;

// Newest firmware image published on GitHub (asset named wattcher-c3-app.bin) as { version, bytes, md5, notes }.
export async function fetchFirmware() {
  const rel = await latestRelease();
  const asset = (rel.assets || []).find((a) => a.name === 'wattcher-c3-app.bin');
  if (!asset) throw new Error('This release has no firmware file');
  const r = await fetch(asset.url, { headers: { Accept: 'application/octet-stream' } });
  if (!r.ok) throw new Error('Could not download the firmware');
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { version: (rel.tag_name || '').replace(/^v/, ''), bytes, md5: md5hex(bytes), notes: rel.body || '' };
}
export async function peekFirmwareVersion() { const rel = await latestRelease(); return (rel.tag_name || '').replace(/^v/, ''); }
export function md5hex(bytes) { const m = new SparkMD5.ArrayBuffer(); m.append(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)); return m.end(); }
