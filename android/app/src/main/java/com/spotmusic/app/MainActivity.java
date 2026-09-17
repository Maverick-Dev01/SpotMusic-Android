package com.spotmusic.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
            }
        } catch (Exception ignored) {}
    }

    @CapacitorPlugin(name = "AppUpdater")
    public static class AppUpdaterPlugin extends Plugin {
        @PluginMethod
        public void installApk(PluginCall call) {
            String path = call.getString("path");
            if (path == null) {
                call.reject("Path is required");
                return;
            }

            try {
                if (path.startsWith("file://")) {
                    path = path.substring(7);
                }

                File file = new File(path);
                if (!file.exists()) {
                    call.reject("APK file does not exist at: " + path);
                    return;
                }

                Uri apkUri;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    apkUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                } else {
                    apkUri = Uri.fromFile(file);
                }

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to trigger APK install: " + e.getMessage());
            }
        }
    }
}
