package io.github.tubby2727.wattcher;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WattcherWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
