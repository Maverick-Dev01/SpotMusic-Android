package com.spotmusic.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

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
        public void canInstall(PluginCall call) {
            JSObject ret = new JSObject();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ret.put("allowed", getContext().getPackageManager().canRequestPackageInstalls());
            } else {
                ret.put("allowed", true);
            }
            call.resolve(ret);
        }

        @PluginMethod
        public void openInstallSettings(PluginCall call) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settingsIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(settingsIntent);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Error al abrir ajustes: " + e.getMessage());
            }
        }

        @PluginMethod
        public void downloadAndInstall(PluginCall call) {
            String urlString = call.getString("url");
            if (urlString == null || urlString.isEmpty()) {
                call.reject("URL es requerida");
                return;
            }

            new Thread(() -> {
                try {
                    URL currentUrl = new URL(urlString);
                    HttpURLConnection conn = null;
                    int redirects = 0;

                    // Follow GitHub redirects (302 -> AWS S3) in pure native Java
                    while (redirects < 6) {
                        conn = (HttpURLConnection) currentUrl.openConnection();
                        conn.setInstanceFollowRedirects(true);
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0 SpotMusic-Android-Updater");
                        conn.setConnectTimeout(20000);
                        conn.setReadTimeout(30000);
                        int status = conn.getResponseCode();

                        if (status == HttpURLConnection.HTTP_MOVED_TEMP || 
                            status == HttpURLConnection.HTTP_MOVED_PERM || 
                            status == 307 || status == 308) {
                            String location = conn.getHeaderField("Location");
                            if (location != null) {
                                currentUrl = new URL(location);
                                conn.disconnect();
                                redirects++;
                                continue;
                            }
                        }
                        break;
                    }

                    if (conn == null || conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                        int code = conn != null ? conn.getResponseCode() : -1;
                        call.reject("Servidor respondió con código HTTP " + code);
                        return;
                    }

                    int totalBytes = conn.getContentLength();
                    InputStream in = conn.getInputStream();
                    File outFile = new File(getContext().getCacheDir(), "SpotMusic_Update.apk");
                    if (outFile.exists()) {
                        outFile.delete();
                    }
                    FileOutputStream out = new FileOutputStream(outFile);

                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    long downloaded = 0;
                    long lastEmit = 0;

                    while ((bytesRead = in.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                        downloaded += bytesRead;

                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 150) {
                            lastEmit = now;
                            int percent = totalBytes > 0 ? (int) ((downloaded * 100) / totalBytes) : 0;
                            JSObject progress = new JSObject();
                            progress.put("percent", percent);
                            progress.put("downloaded", downloaded);
                            progress.put("total", totalBytes);
                            notifyListeners("downloadProgress", progress);
                        }
                    }

                    out.flush();
                    out.close();
                    in.close();
                    conn.disconnect();

                    // Final progress emit
                    JSObject finalProgress = new JSObject();
                    finalProgress.put("percent", 100);
                    finalProgress.put("downloaded", downloaded);
                    finalProgress.put("total", totalBytes);
                    notifyListeners("downloadProgress", finalProgress);

                    // Launch package installer
                    launchInstaller(outFile, call);

                } catch (Exception e) {
                    call.reject("Error al descargar paquete: " + e.getMessage(), e);
                }
            }).start();
        }

        @PluginMethod
        public void installApk(PluginCall call) {
            String path = call.getString("path");
            File file = (path != null && !path.isEmpty()) ? new File(path.replace("file://", "")) : new File(getContext().getCacheDir(), "SpotMusic_Update.apk");
            if (!file.exists()) {
                call.reject("El archivo de actualización no existe o fue eliminado.");
                return;
            }
            launchInstaller(file, call);
        }

        private void launchInstaller(File file, PluginCall call) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (!getContext().getPackageManager().canRequestPackageInstalls()) {
                        Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                        settingsIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
                        settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(settingsIntent);

                        JSObject ret = new JSObject();
                        ret.put("needsPermission", true);
                        ret.put("path", file.getAbsolutePath());
                        call.resolve(ret);
                        return;
                    }
                }

                Uri apkUri;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    apkUri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
                } else {
                    apkUri = Uri.fromFile(file);
                }

                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(installIntent);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("path", file.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error al iniciar instalador: " + e.getMessage(), e);
            }
        }
    }
}
