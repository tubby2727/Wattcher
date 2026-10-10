# Wattcher phone <-> unit protocol (draft v0)

Unit advertises as `Wattcher-XXXX` (last 4 hex of MAC) with a 128-bit service UUID (placeholder:
`7a7c0001-0000-4a77-8a77-63686572776d`; replace before release). All multi-byte values little-endian.

| Char | UUID suffix | Props | Purpose |
|------|-------------|-------|---------|
| Device info | 0002 | read | fw version, board, claimed flag, uptime |
| Live state | 0003 | read, notify | latest decoded readings (struct below), 1 Hz max |
| Config | 0004 | read, write* | devices, keys, thresholds, van profile (chunked, CBOR) |
| Control | 0005 | write*, notify | claim, auth, mute, reset, set clock, factory reset |
| History | 0006 | write, notify | request range -> stream of 12-byte samples |
| OTA | 0007 | write no resp, notify | signed image upload with rollback confirm |

`*` requires auth after claim. Claim: write `CLAIM <6-digit PIN> <epoch>` within the first 300 s after
power-up while unclaimed. Five wrong PINs lock for five minutes. 10 s button hold while running = factory reset.

Live state frame (v0): `u8 ver, u32 epoch, i16 volts_cv, i16 amps_da, u16 soc_dpct, i32 tte_min, u32 last_full_epoch,
i16 pv_w, u32 alarm_mask, u32 off_mask, u8 device_flags` (flags: bit0 shunt fresh, bit1 mppt fresh, bit2 temp sensors).
Missing values use sentinel 0x7FFF / 0x7FFFFFFF so the app hides tiles rather than showing blanks.

The phone sets the clock on connect (no RTC). Samples before the first sync are stamped relative and fixed up.
