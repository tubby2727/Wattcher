package io.github.tubby2727.wattcher;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

public class WattcherWidgetSmall extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        WidgetRender.update(context, mgr, WattcherWidgetSmall.class, false);
    }
}
