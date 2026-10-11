package io.github.tubby2727.wattcher;

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
