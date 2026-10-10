# Wattcher

Screenless ESP32 + Android phone monitor for Victron SmartShunt/BMV and SmartSolar MPPT.
Plug it into USB, add your Victron keys in the app, watch your battery and solar. Apache-2.0.

Status: milestone 1 (decoder proven against real SmartShunt/MPPT captures). See `docs/spec.md`.

## Layout
- `firmware/` PlatformIO (ESP32-C3, NimBLE). `lib/victron` is a pure C++ decoder with host tests.
- `app/` Android app (Capacitor), `web/` Web Bluetooth backup dashboard, `docs/`, `hardware/`.

## Test the decoder (no hardware)
    g++ -std=c++17 -Ifirmware/lib/victron firmware/test/test_victron.cpp firmware/lib/victron/victron.cpp -o t && ./t

Never commit Victron encryption keys.
