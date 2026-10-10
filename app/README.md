# Wattcher Android app (Capacitor)

Status: scaffold only. `www/` starts as a copy of `web/index.html` (Web Bluetooth). Next steps, in order:
1. Replace Web Bluetooth calls with `@capacitor-community/bluetooth-le` so it works in the native WebView.
2. Add a foreground service so the live connection and alarm notifications survive the screen being off.
3. Setup wizard, saved vans, history graphs, alarm settings screens.

Local build: `npm install && npm run sync && cd android && ./gradlew assembleDebug`
(needs `npx cap add android` once, and JDK 17 + Android SDK). CI builds the APK in `.github/workflows/android.yml`.
