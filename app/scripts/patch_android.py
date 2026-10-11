#!/usr/bin/env python3
"""Run after `npx cap add android`: adds permissions, foreground service, icons, version, optional release signing."""
import json, os, re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent / 'android'
pkg = json.load(open(root.parent / 'package.json'))
ver = pkg['version']; code = int(os.environ.get('GITHUB_RUN_NUMBER', '1'))

# ---- manifest
mf = root / 'app/src/main/AndroidManifest.xml'; s = mf.read_text()
perms = ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_CONNECTED_DEVICE', 'POST_NOTIFICATIONS', 'BLUETOOTH_CONNECT', 'WAKE_LOCK', 'RECEIVE_BOOT_COMPLETED']
add = ''.join(f'    <uses-permission android:name="android.permission.{p}" />\n' for p in perms if f'permission.{p}"' not in s)
add += '    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" tools:targetApi="s" tools:node="replace" />\n'
add += '    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />\n    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />\n    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" android:maxSdkVersion="30" />\n'
add += '    <uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />\n'
if 'xmlns:tools' not in s: s = s.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ', 1)
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

# ---- alarm sound (res/raw/alarm_beep.wav): three urgent beeps, generated here so no binary sits in the repo
import math, struct, wave
raw = res / 'raw'; raw.mkdir(exist_ok=True)
with wave.open(str(raw / 'alarm_beep.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
    frames = bytearray(); sr = 22050
    def tone(f, d, vol=0.8):
        for i in range(int(sr * d)):
            env = min(1, i / 200, (sr * d - i) / 200)
            frames.extend(struct.pack('<h', int(32767 * vol * env * math.sin(2 * math.pi * f * i / sr))))
    for _ in range(3):
        tone(1760, 0.18); tone(0, 0.08); tone(1320, 0.18); tone(0, 0.12)
    w.writeframes(bytes(frames))

# ---- home-screen widgets (4x2 and 2x2), drawn natively from the last data the app pushed
pkgdir = root / 'app/src/main/java/io/github/tubby2727/wattcher'; pkgdir.mkdir(parents=True, exist_ok=True)
(pkgdir / 'MainActivity.java').write_text('''package io.github.tubby2727.wattcher;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WattcherWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
''')
(pkgdir / 'WattcherWidgetPlugin.java').write_text('''package io.github.tubby2727.wattcher;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WattcherWidget")
public class WattcherWidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        SharedPreferences.Editor e = getContext().getSharedPreferences(WidgetRender.PREFS, Context.MODE_PRIVATE).edit();
        e.putInt("soc", call.getInt("soc", -1));
        e.putInt("solar", call.getInt("solar", -9999));
        e.putInt("batt", call.getInt("batt", -9999));
        e.putInt("van", call.getInt("van", -9999));
        e.putInt("tone", call.getInt("tone", 4));
        e.putString("strip", call.getString("strip", ""));
        e.putString("shortStrip", call.getString("shortStrip", ""));
        e.putString("name", call.getString("name", "Wattcher"));
        e.putLong("at", System.currentTimeMillis());
        e.apply();
        WidgetRender.updateAll(getContext());
        call.resolve();
    }
}
''')
(pkgdir / 'WidgetRender.java').write_text('''package io.github.tubby2727.wattcher;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.widget.RemoteViews;

public class WidgetRender {
    static final String PREFS = "wattcher_widget";
    static final int BG = 0xFF151B23, DIM = 0xFF8A96A3, TXT = 0xFFF2F5F8, INNER = 0xFF1B232D;

    static int fillColor(int tone, boolean stale) {
        if (stale) return 0xFF3A4553;
        switch (tone) { case 1: return 0xFF9A5B14; case 2: return 0xFFB7791F; case 3: return 0xFFB91C1C; case 4: return 0xFF3A4553; default: return 0xFF16804A; }
    }

    static Paint p(int color, float size, boolean bold) {
        Paint x = new Paint(Paint.ANTI_ALIAS_FLAG);
        x.setColor(color); x.setTextSize(size); x.setTypeface(bold ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        return x;
    }

    static String w(int v) { return v == -9999 ? "--" : (v > 0 ? "+" : "") + v + " W"; }

    static Bitmap draw(Context c, boolean large) {
        SharedPreferences s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int soc = s.getInt("soc", -1), tone = s.getInt("tone", 4);
        boolean stale = System.currentTimeMillis() - s.getLong("at", 0) > 5 * 60 * 1000L;
        int W = large ? 640 : 320, H = 320;
        Bitmap b = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(b);
        Paint bg = p(BG, 0, false);
        cv.drawRoundRect(new RectF(0, 0, W, H), 40, 40, bg);
        // battery
        float bx = 28, by = large ? 34 : 30, bw = large ? 268 : 264, bh = large ? 140 : 120;
        Paint body = p(INNER, 0, false);
        cv.drawRoundRect(new RectF(bx, by, bx + bw, by + bh), 28, 28, body);
        if (soc >= 0) {
            Paint f = p(fillColor(tone, stale), 0, false);
            float fw = Math.max(14f, (bw - 16) * soc / 100f);
            cv.save(); cv.clipRect(bx + 8, by + 8, bx + bw - 8, by + bh - 8);
            cv.drawRoundRect(new RectF(bx + 8, by + 8, bx + 8 + fw, by + bh - 8), 20, 20, f);
            cv.restore();
        }
        Paint ring = p(DIM, 0, false); ring.setStyle(Paint.Style.STROKE); ring.setStrokeWidth(9);
        cv.drawRoundRect(new RectF(bx, by, bx + bw, by + bh), 28, 28, ring);
        Paint nub = p(DIM, 0, false);
        cv.drawRoundRect(new RectF(bx + bw + 4, by + bh / 2 - 22, bx + bw + 20, by + bh / 2 + 22), 6, 6, nub);
        Paint pct = p(0xFFFFFFFF, large ? 72 : 66, true); pct.setTextAlign(Paint.Align.CENTER);
        pct.setShadowLayer(4, 0, 2, 0x88000000);
        cv.drawText(soc < 0 ? "--" : soc + "%", bx + bw / 2, by + bh / 2 + (large ? 25 : 23), pct);
        if (large) {
            float x = 340, y = 66;
            String[] lab = {"Solar", "Battery", "Van using"};
            int[] vals = {s.getInt("solar", -9999), s.getInt("batt", -9999), s.getInt("van", -9999)};
            for (int i = 0; i < 3; i++) {
                Paint l = p(DIM, 24, false), v = p(i == 1 && vals[1] != -9999 ? (vals[1] > 3 ? 0xFF4ADE80 : vals[1] < -3 ? 0xFFFBBF24 : TXT) : TXT, 40, true);
                float yy = 38 + i * 52;
                cv.drawText(lab[i], x, yy + 8, l);
                cv.drawText(i == 0 || i == 2 ? (vals[i] == -9999 ? "--" : vals[i] + " W") : w(vals[i]), x + 190, yy + 12, v);
            }
        }
        // status strip
        String strip = s.getString(large ? "strip" : "shortStrip", "");
        if (stale) strip = "No recent data";
        int sbg = 0xFF232C37, stx = DIM;
        if (!stale) { if (tone == 0) { sbg = 0xFF12301F; stx = 0xFF4ADE80; } else if (tone == 1 || tone == 2) { sbg = 0xFF33240F; stx = 0xFFFBBF24; } else if (tone == 3) { sbg = 0xFF3A1414; stx = 0xFFF87171; } }
        float sy = by + bh + (large ? 30 : 26), sh = H - sy - 22;
        cv.drawRoundRect(new RectF(28, sy, W - 28, sy + sh), 22, 22, p(sbg, 0, false));
        Paint st = p(stx, large ? 30 : 28, true); st.setTextAlign(Paint.Align.CENTER);
        while (st.measureText(strip) > W - 70 && st.getTextSize() > 14) st.setTextSize(st.getTextSize() - 1);
        cv.drawText(strip, W / 2f, sy + sh / 2 + st.getTextSize() * 0.35f, st);
        return b;
    }

    static void update(Context c, AppWidgetManager m, Class<?> cls, boolean large) {
        int[] ids = m.getAppWidgetIds(new ComponentName(c, cls));
        if (ids.length == 0) return;
        Bitmap b = draw(c, large);
        Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        PendingIntent pi = PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        for (int id : ids) {
            RemoteViews rv = new RemoteViews(c.getPackageName(), R.layout.widget_view);
            rv.setImageViewBitmap(R.id.img, b);
            rv.setOnClickPendingIntent(R.id.img, pi);
            m.updateAppWidget(id, rv);
        }
    }

    public static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        update(c, m, WattcherWidget.class, true);
        update(c, m, WattcherWidgetSmall.class, false);
    }
}
''')
for cls, large in (('WattcherWidget', 'true'), ('WattcherWidgetSmall', 'false')):
    (pkgdir / f'{cls}.java').write_text(f'''package io.github.tubby2727.wattcher;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

public class {cls} extends AppWidgetProvider {{
    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {{
        WidgetRender.update(context, mgr, {cls}.class, {large});
    }}
}}
''')
(res / 'layout').mkdir(exist_ok=True)
(res / 'layout/widget_view.xml').write_text('<?xml version="1.0" encoding="utf-8"?>\n<ImageView xmlns:android="http://schemas.android.com/apk/res/android" android:id="@+id/img" android:layout_width="match_parent" android:layout_height="match_parent" android:scaleType="fitCenter" />\n')
(res / 'xml').mkdir(exist_ok=True)
for name, mw, mh, cw, ch in (('widget_info', 250, 110, 4, 2), ('widget_info_small', 110, 110, 2, 2)):
    (res / f'xml/{name}.xml').write_text(f'<?xml version="1.0" encoding="utf-8"?>\n<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android" android:minWidth="{mw}dp" android:minHeight="{mh}dp" android:targetCellWidth="{cw}" android:targetCellHeight="{ch}" android:updatePeriodMillis="1800000" android:initialLayout="@layout/widget_view" android:resizeMode="horizontal|vertical" android:widgetCategory="home_screen" />\n')
mf = root / 'app/src/main/AndroidManifest.xml'; s = mf.read_text()
if 'WattcherWidget"' not in s:
    rcv = ''
    for cls, info, label in (('WattcherWidget', 'widget_info', 'Wattcher'), ('WattcherWidgetSmall', 'widget_info_small', 'Wattcher (small)')):
        rcv += f'        <receiver android:name=".{cls}" android:exported="true" android:label="{label}"><intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter><meta-data android:name="android.appwidget.provider" android:resource="@xml/{info}" /></receiver>\n'
    s = s.replace('</application>', rcv + '    </application>'); mf.write_text(s)
