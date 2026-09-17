package com.spotmusic.app;

import android.media.MediaMetadataRetriever;
import android.net.Uri;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import dev.ffmpegkit_maintained.ytdlp.YtDlp;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONObject;

@CapacitorPlugin(name = "NativeAudioResolver")
public class NativeAudioResolverPlugin extends Plugin {
    private static final Object DOWNLOAD_LOCK = new Object();
    private static final long MIN_AUDIO_BYTES = 64 * 1024;
    private static final long MAX_CACHE_BYTES = 512L * 1024L * 1024L;
    private static final int MAX_CACHE_FILES = 20;

    @PluginMethod
    public void resolve(PluginCall call) {
        String title = cleanInput(call.getString("title"));
        String artist = cleanInput(call.getString("artist"));
        Long expectedDurationMs = call.getLong("durationMs", 0L);
        if (title.isEmpty()) {
            call.reject("Falta el nombre de la canción");
            return;
        }

        new Thread(() -> {
            try {
                JSObject result;
                synchronized (DOWNLOAD_LOCK) {
                    result = resolveAudio(title, artist, expectedDurationMs == null ? 0L : expectedDurationMs);
                }
                call.resolve(result);
            } catch (Exception error) {
                call.reject(userMessage(error), error);
            }
        }, "spotmusic-audio-resolver").start();
    }

    private JSObject resolveAudio(String title, String artist, long expectedDurationMs) throws Exception {
        File directory = new File(getContext().getCacheDir(), "resolved_audio");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new Exception("No se pudo preparar el almacenamiento temporal");
        }

        String key = sha256((title + "\n" + artist).toLowerCase());
        File audioFile = findCachedFile(directory, key);
        if (audioFile == null) {
            YtDlp.init(getContext().getApplicationContext());
            String query = title + " " + artist + " official audio";
            String outputTemplate = new File(directory, key + ".%(ext)s").getAbsolutePath();
            PyObject module = Python.getInstance().getModule("spotmusic_ytdlp");
            String json = module.callAttr("resolve", query, outputTemplate).toJava(String.class);
            JSONObject metadata = new JSONObject(json);
            audioFile = new File(metadata.optString("filepath", ""));
            if (!audioFile.exists()) audioFile = findCachedFile(directory, key);

            String candidateTitle = metadata.optString("title", "");
            String candidateArtist = metadata.optString("artist", "");
            long candidateDurationMs = metadata.optLong("durationMs", 0L);
            double titleScore = similarity(title, candidateTitle);
            double artistScore = similarity(artist, candidateArtist + " " + candidateTitle);
            if (titleScore < 0.40 || (titleScore < 0.68 && artistScore < 0.18)) {
                if (audioFile != null) audioFile.delete();
                throw new Exception("La coincidencia encontrada no corresponde al título y artista");
            }
            if (expectedDurationMs > 60_000 && candidateDurationMs > 0) {
                double difference = Math.abs(candidateDurationMs - expectedDurationMs) / (double) expectedDurationMs;
                if (difference > 0.38) {
                    if (audioFile != null) audioFile.delete();
                    throw new Exception("La coincidencia encontrada no corresponde a la duración de la canción");
                }
            }
        }

        if (audioFile == null || audioFile.length() < MIN_AUDIO_BYTES) {
            throw new Exception("No se encontró audio completo para esta canción");
        }

        long actualDurationMs = readDuration(audioFile);
        if (expectedDurationMs > 60_000 && actualDurationMs > 0) {
            double difference = Math.abs(actualDurationMs - expectedDurationMs) / (double) expectedDurationMs;
            if (difference > 0.38) {
                audioFile.delete();
                throw new Exception("La coincidencia encontrada no corresponde a la duración de la canción");
            }
        }

        audioFile.setLastModified(System.currentTimeMillis());
        pruneCache(directory, audioFile);
        long durationMs = actualDurationMs > 0 ? actualDurationMs : expectedDurationMs;
        JSObject result = new JSObject();
        result.put("audioUrl", Uri.fromFile(audioFile).toString());
        result.put("durationMs", durationMs);
        result.put("durationStr", formatDuration(durationMs));
        result.put("format", extension(audioFile).toUpperCase() + " · audio completo");
        result.put("source", "native");
        result.put("title", title);
        result.put("artist", artist);
        result.put("size", audioFile.length());
        return result;
    }

    private File findCachedFile(File directory, String key) {
        File[] matches = directory.listFiles(file ->
            file.isFile() && file.getName().startsWith(key + ".") &&
            !file.getName().endsWith(".part") && !file.getName().endsWith(".ytdl") &&
            file.length() >= MIN_AUDIO_BYTES
        );
        if (matches == null || matches.length == 0) return null;
        return Arrays.stream(matches).max(Comparator.comparingLong(File::lastModified)).orElse(null);
    }

    private long readDuration(File file) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(file.getAbsolutePath());
            String value = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            return value == null ? 0L : Long.parseLong(value);
        } catch (Exception ignored) {
            return 0L;
        } finally {
            try { retriever.release(); } catch (Exception ignored) {}
        }
    }

    private void pruneCache(File directory, File keep) {
        File[] files = directory.listFiles(file -> file.isFile() && file.length() >= MIN_AUDIO_BYTES);
        if (files == null) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified).reversed());
        long total = 0L;
        for (int index = 0; index < files.length; index++) {
            File file = files[index];
            total += file.length();
            if (file.equals(keep)) continue;
            if (index >= MAX_CACHE_FILES || total > MAX_CACHE_BYTES) file.delete();
        }
    }

    private String cleanInput(String value) {
        if (value == null) return "";
        String clean = value.replaceAll("[\\r\\n\\t]+", " ").trim();
        return clean.length() > 240 ? clean.substring(0, 240) : clean;
    }

    private double similarity(String expected, String actual) {
        Set<String> left = tokens(expected);
        Set<String> right = tokens(actual);
        if (left.isEmpty() || right.isEmpty()) return 0.0;
        int matches = 0;
        for (String token : left) if (right.contains(token)) matches++;
        return (2.0 * matches) / (left.size() + right.size());
    }

    private Set<String> tokens(String value) {
        String normalized = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFD)
            .replaceAll("\\p{M}", "")
            .toLowerCase(Locale.ROOT)
            .replaceAll("\\b(feat|ft|official|audio|video|lyrics?|remaster(?:ed)?|version)\\b.*$", "")
            .replaceAll("[^a-z0-9]+", " ")
            .trim();
        Set<String> result = new HashSet<>();
        if (!normalized.isEmpty()) result.addAll(Arrays.asList(normalized.split("\\s+")));
        return result;
    }

    private String sha256(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder output = new StringBuilder();
        for (byte item : digest) output.append(String.format("%02x", item));
        return output.toString();
    }

    private String extension(File file) {
        String name = file.getName();
        int dot = name.lastIndexOf('.');
        return dot >= 0 ? name.substring(dot + 1) : "audio";
    }

    private String formatDuration(long durationMs) {
        long seconds = Math.max(0, durationMs / 1000);
        return (seconds / 60) + ":" + String.format("%02d", seconds % 60);
    }

    private String userMessage(Exception error) {
        String message = error.getMessage() == null ? "" : error.getMessage();
        String lower = message.toLowerCase();
        if (lower.contains("sign in") || lower.contains("bot") || lower.contains("429")) {
            return "El proveedor limitó temporalmente la consulta. Intenta nuevamente en unos minutos.";
        }
        if (lower.contains("network") || lower.contains("unable to download") || lower.contains("timed out")) {
            return "No se pudo consultar el audio. Revisa la conexión e intenta nuevamente.";
        }
        if (message.startsWith("La ") || message.startsWith("No ") || message.startsWith("El ")) return message;
        return "No se pudo obtener el audio completo de esta canción.";
    }
}
