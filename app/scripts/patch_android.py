#!/usr/bin/env python3
"""Run after `npx cap add android`: adds permissions, foreground service, icons, version, optional release signing."""
import json, os, re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'android'
pkg = json.load(open(root.parent / 'package.json'))
ver = pkg['version']; code = int(os.environ.get('GITHUB_RUN_NUMBER', '1'))

# ---- manifest
mf = root / 'app/src/main/AndroidManifest.xml'; s = mf.read_text()
perms = ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_CONNECTED_DEVICE', 'POST_NOTIFICATIONS', 'BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT', 'WAKE_LOCK', 'RECEIVE_BOOT_COMPLETED']
add = ''.join(f'    <uses-permission android:name="android.permission.{p}" />\n' for p in perms if f'permission.{p}"' not in s)
add += '    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />\n    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />\n'
add += '    <uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />\n'
s = s.replace('</manifest>', add + '</manifest>')
svc = '''        <service android:name="io.capawesome.capacitorjs.plugins.foregroundservice.AndroidForegroundService" android:foregroundServiceType="connectedDevice" android:exported="false" />
        <receiver android:name="io.capawesome.capacitorjs.plugins.foregroundservice.NotificationActionBroadcastReceiver" android:exported="false" />
'''
s = s.replace('</application>', svc + '    </application>')
s = s.replace('android:label="@string/app_name"', 'android:label="Wattcher"', 1)
mf.write_text(s)

# ---- icons (adaptive launcher + notification glyph), drawn as vectors
res = root / 'app/src/main/res'
bolt = 'M36,8 L16,36 L29,36 L26,56 L48,26 L34,26 Z'
(res / 'drawable').mkdir(exist_ok=True)
(res / 'drawable/ic_stat_wattcher.xml').write_text(f'''<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="64" android:viewportHeight="64"><path android:fillColor="#FFFFFFFF" android:pathData="{bolt}"/></vector>''')
(res / 'drawable/ic_launcher_fg.xml').write_text(f'''<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><group android:scaleX="0.62" android:scaleY="0.62" android:pivotX="54" android:pivotY="54" android:translateX="22" android:translateY="22"><path android:fillColor="#4AA3FF" android:pathData="{bolt}"/></group></vector>''')
(res / 'drawable/ic_launcher_bg.xml').write_text('<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#0B0F14"/></shape>')
for n in ('ic_launcher', 'ic_launcher_round'):
    d = res / 'mipmap-anydpi-v26'; d.mkdir(exist_ok=True)
    (d / f'{n}.xml').write_text('<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@drawable/ic_launcher_bg"/><foreground android:drawable="@drawable/ic_launcher_fg"/><monochrome android:drawable="@drawable/ic_launcher_fg"/></adaptive-icon>')

# ---- version + optional signing
g = root / 'app/build.gradle'; t = g.read_text()
t = re.sub(r'versionCode \d+', f'versionCode {code}', t); t = re.sub(r'versionName "[^"]*"', f'versionName "{ver}"', t)
if os.environ.get('WATT_KEYSTORE'):
    sign = '''    signingConfigs {
        release {
            storeFile file(System.getenv("WATT_KEYSTORE"))
            storePassword System.getenv("WATT_STORE_PASS")
            keyAlias System.getenv("WATT_KEY_ALIAS")
            keyPassword System.getenv("WATT_KEY_PASS")
        }
    }
'''
    t = t.replace('    buildTypes {', sign + '    buildTypes {', 1)
    t = re.sub(r'(buildTypes \{\s*release \{)', r'\1\n            signingConfig signingConfigs.release', t, 1)
g.write_text(t)
print('patched android project', ver, code, 'signed' if os.environ.get('WATT_KEYSTORE') else 'unsigned/debug')
