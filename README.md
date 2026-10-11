# Wattcher

A small ESP32 box with no screen, plus an Android app, that watches your Victron SmartShunt/BMV and SmartSolar MPPT
over Bluetooth and keeps the history for you. Plug it into USB power in the van, add your Victron keys in the app,
and see state of charge, time left, solar, history graphs and alarms. Apache-2.0.

## What you need
- ESP32-C3 SuperMini (about $5), any USB power
- A Victron SmartShunt/BMV and/or SmartSolar MPPT with Instant Readout on
- An Android phone

## Install
1. Flash `wattcher-c3-factory.bin` from the latest Release at address 0x0 (https://espressif.github.io/esptool-js/ works from Chrome).
2. Install `wattcher.apk` from the same Release (allow installs from your browser; set Wattcher battery to Unrestricted so alerts keep working in the background).
3. Open the app and follow the setup. Power the unit and claim it within 5 minutes.
No Android? https://tubby2727.github.io/Wattcher/ runs the same app in Chrome using Web Bluetooth.

## Layout
- `firmware/` PlatformIO. `lib/victron` decoder, `lib/core` alarms/history/claim, host tests in `firmware/test`.
- `app/` Vite + Capacitor app (`npm run sync` builds, `scripts/patch_android.py` configures Android).
- `docs/` protocol and Victron notes.

## Releasing
Tag `vX.Y.Z`. The release workflow builds the APK and firmware and attaches `wattcher.apk`, `wattcher-c3-app.bin` (for in-app updates) and `wattcher-c3-factory.bin`.
Signed APKs need repo secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`; without them the APK is debug-signed and cannot update over a previous install.

Never commit Victron encryption keys. Battery-monitor decoding is verified on real hardware; Orion, inverter and Battery Sense decoders and temperature sensors are experimental.
