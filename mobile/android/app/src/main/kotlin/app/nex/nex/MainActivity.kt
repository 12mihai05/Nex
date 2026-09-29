package app.nex.nex

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugins.urllauncher.UrlLauncherPlugin

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // An installed debug APK previously omitted this plugin while Dart still
        // called its channels. Keep a native compile-time dependency and guard
        // registration so a missing generated entry cannot silently break links.
        // The registry guard avoids attaching the plugin twice in normal builds.
        if (!flutterEngine.plugins.has(UrlLauncherPlugin::class.java)) {
            flutterEngine.plugins.add(UrlLauncherPlugin())
        }
    }
}
