// Firmware update sheet: download the newest image from GitHub (or pick a .bin) and send it to the unit over Bluetooth.
import { h, sheet, toast, confirmSheet } from '../dom.js';
import { app } from '../app.js';
import { fetchFirmware, md5hex, cmpVer } from '../updates.js';

export function firmwareSheet() {
  sheet((close) => {
    const cur = app.status?.fw || '?';
    const msg = h('div', { cls: 'help' }, 'Checking for the newest firmware...');
    const bar = h('div', { style: 'height:10px;border-radius:6px;background:var(--line);overflow:hidden;display:none' }, h('div', { style: 'height:100%;width:0;background:var(--accent);transition:width .2s' }));
    const go = h('button', { cls: 'btn', style: 'display:none' }, 'Update unit');
    const file = h('input', { type: 'file', accept: '.bin', style: 'display:none' });
    const pick = h('button', { cls: 'btn ghost', onClick: () => file.click() }, 'Use a file instead');
    let fw = null, busy = false;

    async function send(img, ver) {
      if (busy) return;
      if (!(await confirmSheet({ title: `Install firmware ${ver}?`, body: 'Keep the phone close to the unit. It takes about two minutes and the unit restarts when done. Do not close the app.', action: 'Install' }))) return;
      busy = true; go.disabled = true; pick.disabled = true; bar.style.display = 'block';
      try {
        await app.link.ota(img, md5hex(img), (p) => { bar.firstChild.style.width = `${Math.round(p * 100)}%`; msg.textContent = `Sending ${Math.round(p * 100)}%`; });
        msg.textContent = 'Installed. The unit is restarting and the app will reconnect.';
        toast('Firmware installed');
        setTimeout(close, 2500);
      } catch (e) { msg.textContent = `Update failed: ${e.message}. The unit keeps running its current firmware.`; busy = false; go.disabled = false; pick.disabled = false; bar.style.display = 'none'; }
    }
    file.addEventListener('change', async () => { const f = file.files[0]; if (f) send(new Uint8Array(await f.arrayBuffer()), f.name); });
    go.addEventListener('click', () => fw && send(fw.bytes, fw.version));

    fetchFirmware().then((f) => {
      fw = f;
      if (cmpVer(f.version, cur) > 0) { msg.textContent = `Version ${f.version} is available. This unit has ${cur}.`; go.style.display = 'block'; go.textContent = `Update to ${f.version}`; }
      else msg.textContent = `This unit is up to date (${cur}).`;
    }).catch((e) => { msg.textContent = `Could not get the newest firmware (${e.message}). You can pick a file instead.`; });

    const rollback = h('button', { cls: 'btn ghost', onClick: async () => {
      if (!(await confirmSheet({ title: 'Go back to the previous firmware?', body: 'The unit restarts on the version it had before the last update.', action: 'Go back', danger: true }))) return;
      try { const r = await app.link.cmd('OTA ROLLBACK'); toast(r.startsWith('OK') ? 'Restarting on the previous version' : 'No previous version on this unit'); } catch (e) { toast(e.message); }
    } }, 'Go back to previous version');
    return h('div', { cls: 'stack' }, h('h2', {}, 'Unit firmware'), h('div', { cls: 'help' }, `Installed: ${cur}`), msg, bar, go, pick, file, rollback);
  });
}
