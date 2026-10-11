# Wattcher phone <-> unit protocol (v1)

The unit advertises as `Wattcher` with a 128-bit service UUID (placeholder, change before wide release):
`7a7c0001-0000-4a77-8a77-63686572776d`. Little-endian throughout.

| Char | UUID suffix | Props | Purpose |
|------|-------------|-------|---------|
| Info | 0002 | read | JSON `{fw, claimed}`, readable without logging in |
| Live | 0003 | read, notify | 30-byte frame, once a second |
| Control | 0005 | write, notify | text commands, replies end with `\n`, split into 160-byte notifications |
| History | 0006 | notify | sample stream after `HIST` |
| OTA | 0007 | write | firmware image chunks after `OTA BEGIN` |
| Sensors | 0008 | read, notify | u8 count, then 6 bytes per temperature sensor |

## Live frame (30 bytes)
`u8 ver, u32 epoch, i16 volts_cV, i16 amps_dA, u16 soc_dpct, i32 tte_min, u32 last_full_epoch, i16 pv_w, u32 alarm_mask, u32 off_mask, u8 flags`
Flags: bit0 shunt fresh, bit1 solar fresh, bit2 temperature sensors configured. Unknown values are
`0x7FFF` / `0xFFFF` / `0x7FFFFFFF` and the app hides the tile.
`tte_min` is time to empty when discharging, time to full when charging.

## Claim and login
Unclaimed units accept `CLAIM <6 digits>` for 5 minutes after power-up. After that every session starts with
`TIME <epoch>` (the unit has no clock) and `AUTH <pin>`. Five wrong PINs lock for five minutes.
Hold BOOT for 10 s to factory reset.

## Commands (after AUTH)
| Command | Effect |
|---------|--------|
| `STATUS` | JSON: fw, name, cap, shunt/mppt MAC, thresholds, temps, history counts |
| `SETDEV shunt\|mppt <mac> <32 hex key>` | store a Victron device (applied live) |
| `DELDEV shunt\|mppt` | forget it |
| `CAP <Ah>` / `NAME <text>` | battery size, van name |
| `THRESH <soc_low> <soc_crit> <v_low> <v_high> <tte_min> <no_charge_h>` | alarm levels |
| `SENSOR add <0-3> <mac> <name>` / `SENSOR del <0-3>` | Xiaomi LYWSD03MMC with ATC firmware |
| `MUTE <alarm id> <seconds>` / `UNMUTE <id>` | 0 seconds = until turned back on. Id 1 (critical battery) cannot be muted |
| `HIST fine\|coarse <since epoch>` | stream samples on 0006 (`[seq][12-byte samples]`, end packet `[0xFF][u32 total]`) |
| `OTA BEGIN <size> <md5>` | then write chunks to 0007, then `OTA END` (verifies MD5, reboots) |
| `OTA ABORT` / `OTA ROLLBACK` | cancel, or boot the other firmware slot |
| `SAVE` / `REBOOT` / `RESET` | persist history now, restart, wipe |

Alarm ids: 0 battery low, 1 battery critical, 2 volts low, 3 volts high, 4 time left short, 5 no charge, 6 Victron fault, 7 sensor lost.

## Firmware update notes
OTA writes the inactive app slot and only switches after the MD5 matches, so an interrupted upload leaves the
running firmware untouched. There is no automatic boot-time rollback (the Arduino bootloader is built without it);
`OTA ROLLBACK` switches back to the previous slot manually.
