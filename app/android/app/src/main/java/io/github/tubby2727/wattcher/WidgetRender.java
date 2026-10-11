package io.github.tubby2727.wattcher;

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
