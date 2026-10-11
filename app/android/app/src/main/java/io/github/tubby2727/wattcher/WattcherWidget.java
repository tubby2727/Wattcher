package io.github.tubby2727.wattcher;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

public class WattcherWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        WidgetRender.update(context, mgr, WattcherWidget.class, true);
    }
}
