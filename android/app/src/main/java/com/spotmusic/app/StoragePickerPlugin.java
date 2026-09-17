package com.spotmusic.app;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.DocumentsContract;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "StoragePicker")
public class StoragePickerPlugin extends Plugin {
    private static final String PREFS = "spotmusic_storage";
    private static final String TREE_URI = "tree_uri";

    @PluginMethod
    public void chooseDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION |
            Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "directoryResult");
    }

    @ActivityCallback
    private void directoryResult(PluginCall call, androidx.activity.result.ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("No se seleccionó una carpeta");
            return;
        }
        Uri uri = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            prefs().edit().putString(TREE_URI, uri.toString()).apply();
            call.resolve(folderInfo(uri));
        } catch (Exception error) {
            call.reject("No se pudo conservar el permiso de la carpeta: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void getDirectory(PluginCall call) {
        String saved = prefs().getString(TREE_URI, null);
        if (saved == null) {
            JSObject result = new JSObject();
            result.put("selected", false);
            call.resolve(result);
            return;
        }
        call.resolve(folderInfo(Uri.parse(saved)));
    }

    @PluginMethod
    public void useDefaultDirectory(PluginCall call) {
        prefs().edit().remove(TREE_URI).apply();
        JSObject result = new JSObject();
        result.put("selected", false);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename");
        String savedTree = prefs().getString(TREE_URI, null);
        if (url == null || filename == null || savedTree == null) {
            call.reject("Falta la URL, el nombre o la carpeta de destino");
            return;
        }
        new Thread(() -> {
            Uri created = null;
            try {
                URL current = new URL(url);
                if (!"https".equalsIgnoreCase(current.getProtocol())) throw new Exception("La descarga debe usar HTTPS");
                HttpURLConnection connection = null;
                for (int redirects = 0; redirects < 6; redirects++) {
                    connection = (HttpURLConnection) current.openConnection();
                    connection.setInstanceFollowRedirects(false);
                    connection.setConnectTimeout(20000);
                    connection.setReadTimeout(45000);
                    connection.setRequestProperty("User-Agent", "SpotMusic-Android/1.0");
                    int status = connection.getResponseCode();
                    if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) {
                        String location = connection.getHeaderField("Location");
                        connection.disconnect();
                        if (location == null) throw new Exception("Redirección sin destino");
                        current = new URL(current, location);
                        if (!"https".equalsIgnoreCase(current.getProtocol())) throw new Exception("Redirección insegura");
                        continue;
                    }
                    if (status != 200) throw new Exception("HTTP " + status);
                    break;
                }
                if (connection == null || connection.getResponseCode() != 200) throw new Exception("No se pudo abrir la descarga");

                Uri tree = Uri.parse(savedTree);
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
                String mime = filename.toLowerCase().endsWith(".m4a") ? "audio/mp4" : "audio/mpeg";
                created = DocumentsContract.createDocument(getContext().getContentResolver(), parent, mime, filename);
                if (created == null) throw new Exception("La carpeta rechazó el archivo");

                long total = connection.getContentLengthLong();
                long downloaded = 0;
                try (InputStream input = connection.getInputStream();
                     OutputStream output = getContext().getContentResolver().openOutputStream(created, "w")) {
                    if (output == null) throw new Exception("No se pudo escribir el archivo");
                    byte[] buffer = new byte[32768];
                    int count;
                    long lastUpdate = 0;
                    while ((count = input.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                        downloaded += count;
                        long now = System.currentTimeMillis();
                        if (now - lastUpdate > 300) {
                            lastUpdate = now;
                            JSObject progress = new JSObject();
                            progress.put("downloaded", downloaded);
                            progress.put("total", total);
                            progress.put("percent", total > 0 ? (int) (downloaded * 100 / total) : 0);
                            notifyListeners("downloadProgress", progress);
                        }
                    }
                }
                connection.disconnect();
                if (downloaded <= 0 || (total > 0 && downloaded != total)) throw new Exception("La descarga quedó incompleta");
                JSObject result = new JSObject();
                result.put("uri", created.toString());
                result.put("size", downloaded);
                call.resolve(result);
            } catch (Exception error) {
                if (created != null) {
                    try { DocumentsContract.deleteDocument(getContext().getContentResolver(), created); } catch (Exception ignored) {}
                }
                call.reject("Error al guardar: " + error.getMessage(), error);
            }
        }).start();
    }

    @PluginMethod
    public void copyFile(PluginCall call) {
        String source = call.getString("source");
        String filename = call.getString("filename");
        String savedTree = prefs().getString(TREE_URI, null);
        if (source == null || filename == null || savedTree == null) {
            call.reject("Falta el archivo, el nombre o la carpeta de destino");
            return;
        }
        new Thread(() -> {
            Uri created = null;
            try {
                Uri sourceUri = Uri.parse(source);
                InputStream sourceStream = "content".equals(sourceUri.getScheme())
                    ? getContext().getContentResolver().openInputStream(sourceUri)
                    : new FileInputStream(new File(sourceUri.getPath()));
                if (sourceStream == null) throw new Exception("No se pudo abrir el audio temporal");

                Uri tree = Uri.parse(savedTree);
                Uri parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
                String lowerName = filename.toLowerCase();
                String mime = lowerName.endsWith(".m4a") ? "audio/mp4"
                    : lowerName.endsWith(".webm") ? "audio/webm"
                    : lowerName.endsWith(".ogg") || lowerName.endsWith(".opus") ? "audio/ogg"
                    : "audio/mpeg";
                created = DocumentsContract.createDocument(getContext().getContentResolver(), parent, mime, filename);
                if (created == null) throw new Exception("La carpeta rechazó el archivo");

                long copied = 0L;
                try (InputStream input = sourceStream;
                     OutputStream output = getContext().getContentResolver().openOutputStream(created, "w")) {
                    if (output == null) throw new Exception("No se pudo escribir el archivo");
                    byte[] buffer = new byte[32768];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                        copied += count;
                    }
                }
                if (copied <= 0) throw new Exception("El archivo copiado está vacío");
                JSObject result = new JSObject();
                result.put("uri", created.toString());
                result.put("size", copied);
                call.resolve(result);
            } catch (Exception error) {
                if (created != null) {
                    try { DocumentsContract.deleteDocument(getContext().getContentResolver(), created); } catch (Exception ignored) {}
                }
                call.reject("Error al guardar: " + error.getMessage(), error);
            }
        }, "spotmusic-local-copy").start();
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || !uri.startsWith("content://")) {
            call.reject("URI de archivo no válida");
            return;
        }
        try {
            DocumentsContract.deleteDocument(getContext().getContentResolver(), Uri.parse(uri));
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudo eliminar el archivo: " + error.getMessage(), error);
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, 0);
    }

    private JSObject folderInfo(Uri uri) {
        JSObject result = new JSObject();
        result.put("selected", true);
        result.put("uri", uri.toString());
        String id = DocumentsContract.getTreeDocumentId(uri);
        String label = id.contains(":") ? id.substring(id.indexOf(':') + 1) : id;
        result.put("label", label.isEmpty() ? "Carpeta seleccionada" : label);
        return result;
    }
}
