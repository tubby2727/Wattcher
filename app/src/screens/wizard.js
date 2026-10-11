// Setup wizard: find the unit, claim it with a PIN, name the van, add Victron devices and sensors, alerts.
import { h, icon, toast } from '../dom.js';
import { app, activate } from '../app.js';
import { store } from '../store.js';
import { makeLink, pickUnit } from '../ble.js';
import { victronForm, sensorForm } from '../forms.js';
import * as alerts from '../alerts.js';

const BOLT = '<svg viewBox="0 0 64 64"><path d="M36 8 16 36h13l-3 20 22-30H34z" fill="#4AA3FF"/></svg>';

export function startWizard(opts = {}) {
  document.querySelector('.wiz')?.remove();
  const w = { link: opts.rerun ? app.link : null, ownLink: !opts.rerun, info: null, device: null, van: opts.rerun ? app.van : null, name: opts.rerun ? app.van.name : 'My van', cap: opts.rerun ? app.van.cap : 100, added: { shunt: app.status?.shunt || '', mppt: app.status?.mppt || '' }, temps: [...(app.status?.temps || [])] };
  const steps = opts.rerun ? ['name', 'devices', 'temps', 'alerts', 'done'] : ['welcome', 'find', 'pin', 'name', 'devices', 'temps', 'alerts', 'done'];
  let i = 0;
  const root = h('div', { cls: 'wiz' });
  document.body.append(root);

  const close = async (open) => {
    if (w.ownLink && w.link) await w.link.close().catch(() => {});
    root.remove();
    if (open && w.van) { await activate(w.van); }
    app.emit('van');
  };
  const next = () => { i = Math.min(i + 1, steps.length - 1); render(); };
  const back = () => { i = Math.max(i - 1, 0); render(); };

  const frame = (kids, { showBack = true } = {}) => h('div', { cls: 'inner' },
    h('div', { cls: 'dots' }, steps.map((_, k) => h('i', { cls: k <= i ? 'on' : '' }))), kids,
    h('div', { style: 'flex:1' }));

  const S = {
    welcome: () => frame([h('div', { cls: 'logo', html: BOLT }), h('h1', {}, 'Welcome to Wattcher'),
      h('p', { cls: 'help' }, 'See your battery and solar from your phone: how much is left, how long it will last, and when it was last full. Setup takes about two minutes.'),
      h('div', { cls: 'card' }, h('div', { cls: 'list' },
        ['Plug the Wattcher unit into any USB power', 'Pick it here and choose a PIN', 'Add your Victron devices using their keys'].map((t, n) => h('div', { cls: 'row' }, h('span', { cls: 'chip ok' }, n + 1), h('div', { cls: 'grow' }, t))))),
      h('button', { cls: 'btn', onClick: next }, 'Get started'), store.vans.length ? h('button', { cls: 'btn ghost', onClick: () => close(false) }, 'Cancel') : null]),

    find: () => {
      const status = h('div', { cls: 'help' }, 'Power the unit from a USB charger or power bank. A brand-new unit accepts setup for 5 minutes after it starts, so unplug and re-plug it if it has been on a while.');
      const result = h('div', {});
      const btn = h('button', { cls: 'btn', onClick: async () => {
        btn.disabled = true; result.replaceChildren(h('div', { cls: 'help' }, 'Choose your Wattcher from the list...'));
        try {
          const d = await pickUnit(); w.device = d; result.replaceChildren(h('div', { cls: 'help' }, 'Connecting...'));
          w.link = makeLink(); w.info = await w.link.connectOnly(d.deviceId);
          result.replaceChildren(h('div', { cls: 'found sel' }, icon('ok', 'width="26" height="26" style="color:var(--ok)"'), h('div', { cls: 'grow', style: 'flex:1' }, h('b', {}, d.name), h('small', { style: 'display:block;color:var(--dim)' }, w.info.claimed === null ? `Could not read its status (${w.info.readError}). You can still continue.` : w.info.claimed ? 'Already set up. You will need its PIN.' : 'New unit, ready to set up'))));
          btn.replaceWith(h('button', { cls: 'btn', onClick: next }, 'Continue'));
        } catch (e) { btn.disabled = false; result.replaceChildren(h('div', { cls: 'help', style: 'color:var(--bad)' }, e.message?.includes('cancel') ? 'Nothing selected.' : `Could not connect: ${e.message || e}`)); }
      } }, 'Find my Wattcher');
      return frame([h('h1', {}, 'Find your unit'), status, result, btn, h('button', { cls: 'btn ghost', onClick: back }, 'Back')]);
    },

    pin: () => {
      if (w.info?.claimed === null && w.forceClaimed === undefined) w.forceClaimed = false;
      const claimed = w.info?.claimed === null ? w.forceClaimed : w.info?.claimed;
      const pin = h('input', { cls: 'input num', inputmode: 'numeric', maxlength: 6, placeholder: '6 digits', style: 'font-size:28px;letter-spacing:.3em;text-align:center' });
      const err = h('div', { cls: 'help', style: 'color:var(--bad)' }, '');
      const go = h('button', { cls: 'btn', onClick: async () => {
        err.textContent = ''; if (!/^\d{6}$/.test(pin.value)) return (err.textContent = 'Use exactly 6 digits');
        go.disabled = true;
        try {
          await w.link.authenticate(claimed ? 'auth' : 'claim', pin.value);
          w.van = store.addVan({ name: w.name, deviceId: w.device.deviceId, deviceName: w.device.name, pin: pin.value, cap: w.cap });
          next();
        } catch (e) {
          go.disabled = false;
          const m = e.message || '';
          err.textContent = m.includes('window') ? 'The 5 minute setup window has closed. Unplug the unit, plug it back in and try again.' : m.includes('locked') ? 'Too many wrong tries. Wait 5 minutes.' : m.includes('bad pin') ? 'That PIN is not right.' : m.includes('already') ? 'This unit already has a PIN. Reset it from its old phone, or hold its BOOT button for 10 seconds.' : m;
          if (m.includes('window') || m.includes('already')) { await w.link.close().catch(() => {}); }
        }
      } }, claimed ? 'Unlock' : 'Create PIN');
      return frame([h('h1', {}, claimed ? 'Enter the PIN' : 'Choose a PIN'),
        h('p', { cls: 'help' }, claimed ? 'This unit already has a PIN. Enter it to add it to this phone.' : 'You will use this PIN to change settings from any phone. Write it down somewhere safe. It cannot be recovered, only reset with the unit\'s BOOT button.'),
        pin, err, go,
        w.info?.claimed === null ? h('button', { cls: 'btn ghost', onClick: () => { w.forceClaimed = !w.forceClaimed; render(); } }, claimed ? 'This unit is new: choose a PIN instead' : 'This unit already has a PIN') : null,
        h('button', { cls: 'btn ghost', onClick: back }, 'Back')]);
    },

    name: () => {
      const name = h('input', { cls: 'input', value: w.name, maxlength: 24 });
      const cap = h('input', { cls: 'input', type: 'number', inputmode: 'numeric', value: w.cap });
      const chips = [100, 150, 200, 300].map((n) => h('button', { cls: 'btn ghost small', onClick: () => { cap.value = n; } }, `${n} Ah`));
      const go = h('button', { cls: 'btn', onClick: async () => {
        w.name = name.value.trim() || 'My van'; w.cap = Math.max(1, Number(cap.value) || 100); go.disabled = true;
        try { await w.link.cmd(`NAME ${w.name}`); await w.link.cmd(`CAP ${w.cap}`); } catch (e) { toast('Could not save to the unit'); }
        if (w.van) store.updateVan(w.van.id, { name: w.name, cap: w.cap }); go.disabled = false; next();
      } }, 'Continue');
      return frame([h('h1', {}, 'Your van'), h('div', { cls: 'field' }, h('label', {}, 'Name'), name),
        h('div', { cls: 'field' }, h('label', {}, 'Battery size (amp-hours)'), cap, h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:4px' }, chips), h('div', { cls: 'help' }, 'Used to work out how long the battery will last.')), go]);
    },

    devices: () => {
      const box = (role, label) => {
        const holder = h('div', {});
        const draw = () => {
          holder.replaceChildren(h('div', { cls: 'row' }, h('div', { cls: 'grow' }, h('b', {}, label), h('small', {}, w.added[role] || 'Not added')),
            w.added[role] ? h('span', { cls: 'chip ok' }, 'Added') : h('button', { cls: 'btn small', onClick: () => {
              const f = victronForm(role, async (m, k) => { try { const r = await w.link.cmd(`SETDEV ${role} ${m} ${k}`); if (!r.startsWith('OK')) { toast(r); return false; } w.added[role] = m; draw(); return true; } catch (e) { toast(e.message); return false; } });
              holder.replaceChildren(h('b', {}, label), f);
            } }, 'Add')));
        };
        draw(); return h('div', { cls: 'card' }, holder);
      };
      return frame([h('h1', {}, 'Victron devices'), h('p', { cls: 'help' }, 'Wattcher listens to your Victron gear over Bluetooth. You need each device\'s encryption key from VictronConnect. Add what you have now, the rest can be added later in Settings.'),
        box('shunt', 'Battery monitor (SmartShunt / BMV)'), box('mppt', 'Solar charger (SmartSolar MPPT)'),
        h('button', { cls: 'btn', onClick: next }, w.added.shunt || w.added.mppt ? 'Continue' : 'Skip for now')]);
    },

    temps: () => {
      const holder = h('div', {});
      const draw = () => {
        holder.replaceChildren(h('div', { cls: 'card' }, h('h3', {}, 'Temperature sensors (optional)'),
          w.temps.length ? h('div', { cls: 'list' }, w.temps.map((t) => h('div', { cls: 'row' }, h('div', { cls: 'grow' }, h('b', {}, t.n), h('small', {}, t.m)), h('span', { cls: 'chip ok' }, 'Added')))) : h('div', { cls: 'help' }, 'Fridge or freezer sensors show on the home screen only if you add them. No sensors, no blank tiles.'),
          w.temps.length < 4 ? h('button', { cls: 'btn ghost', style: 'margin-top:10px', onClick: () => {
            const used = w.temps.map((t) => t.i), idx = [0, 1, 2, 3].find((n) => !used.includes(n));
            const f = sensorForm(async (m, n) => { try { const r = await w.link.cmd(`SENSOR add ${idx} ${m} ${n}`); if (!r.startsWith('OK')) { toast(r); return false; } w.temps.push({ i: idx, n, m }); draw(); return true; } catch (e) { toast(e.message); return false; } });
            holder.replaceChildren(h('div', { cls: 'card' }, f));
          } }, 'Add a sensor') : null));
      };
      draw();
      return frame([h('h1', {}, 'Sensors'), holder, h('button', { cls: 'btn', onClick: next }, w.temps.length ? 'Continue' : 'Skip')]);
    },

    alerts: () => {
      const st = h('div', { cls: 'help' }, '');
      const on = h('button', { cls: 'btn', onClick: async () => { const ok = await alerts.ensurePermission(); store.setSetting('notifications', ok); st.textContent = ok ? 'Notifications are on.' : 'Notifications are blocked. You can allow them in Android settings.'; if (ok) setTimeout(next, 700); } }, 'Turn on alarm notifications');
      return frame([h('h1', {}, 'Alarm notifications'),
        h('p', { cls: 'help' }, 'Get a notification when the battery is low, the voltage is out of range, or the unit loses the shunt. You can mute or turn off any alarm later, and the app always shows what is off.'),
        h('div', { cls: 'card help' }, 'On Samsung phones, set Battery to Unrestricted for Wattcher (Settings, Apps, Wattcher, Battery) so Android keeps it running in the background. Notifications follow Do Not Disturb.'),
        on, st, h('button', { cls: 'btn ghost', onClick: next }, 'Maybe later')]);
    },

    done: () => frame([h('div', { cls: 'logo', html: BOLT }), h('h1', {}, 'You are all set'),
      h('p', { cls: 'help' }, `${w.name} is ready. Readings appear within about ten seconds of the unit hearing your Victron devices.`),
      h('div', { cls: 'card' }, h('div', { cls: 'list' }, [['Unit', w.device?.name || app.van?.deviceName || 'Wattcher'], ['Battery', `${w.cap} Ah`], ['Victron devices', [w.added.shunt && 'battery monitor', w.added.mppt && 'solar'].filter(Boolean).join(', ') || 'none yet'], ['Sensors', w.temps.length ? `${w.temps.length} added` : 'none']].map(([a, b]) => h('div', { cls: 'row' }, h('div', { cls: 'grow' }, h('small', { style: 'margin:0' }, a), h('b', {}, b)))))),
      h('button', { cls: 'btn', onClick: () => close(!opts.rerun) }, 'Open Wattcher')]),
  };

  function render() { root.replaceChildren(S[steps[i]]()); root.scrollTo(0, 0); }
  render();
}
