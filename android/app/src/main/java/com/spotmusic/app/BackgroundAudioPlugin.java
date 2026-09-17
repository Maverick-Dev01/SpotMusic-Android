package com.spotmusic.app;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Build;
import android.os.IBinder;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "BackgroundAudio",
    permissions = {
        @Permission(
            alias = "notifications",
            strings = { "android.permission.POST_NOTIFICATIONS" }
        )
    }
)
public class BackgroundAudioPlugin extends Plugin {

    private MusicPlaybackService musicService;
    private boolean isBound = false;

    private final ServiceConnection serviceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            MusicPlaybackService.LocalBinder localBinder = (MusicPlaybackService.LocalBinder) binder;
            musicService = localBinder.getService();
            isBound = true;
            attachListener();
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            musicService = null;
            isBound = false;
        }
    };

    @Override
    public void load() {
        super.load();
        bindPlaybackService();
    }

    private void bindPlaybackService() {
        Context context = getContext();
        Intent intent = new Intent(context, MusicPlaybackService.class);
        context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
    }

    private void ensureServiceRunning() {
        if (musicService == null) {
            musicService = MusicPlaybackService.getInstance();
        }
        if (musicService != null) {
            attachListener();
            return;
        }
        Context context = getContext();
        Intent intent = new Intent(context, MusicPlaybackService.class);
        try {
            ContextCompat.startForegroundService(context, intent);
        } catch (Exception e) {
            context.startService(intent);
        }
        context.bindService(intent, serviceConnection, Context.BIND_AUTO_CREATE);
    }

    private void attachListener() {
        if (musicService == null) return;
        musicService.setListener(new MusicPlaybackService.ServiceListener() {
            @Override
            public void onPlay() {
                JSObject ret = new JSObject();
                ret.put("isPlaying", true);
                notifyListeners("onPlay", ret);
            }

            @Override
            public void onPause() {
                JSObject ret = new JSObject();
                ret.put("isPlaying", false);
                notifyListeners("onPause", ret);
            }

            @Override
            public void onNext() {
                notifyListeners("onNext", new JSObject());
            }

            @Override
            public void onPrevious() {
                notifyListeners("onPrevious", new JSObject());
            }

            @Override
            public void onTimeUpdate(long positionMs, long durationMs) {
                JSObject ret = new JSObject();
                ret.put("currentTime", positionMs / 1000.0);
                ret.put("duration", durationMs / 1000.0);
                ret.put("positionMs", positionMs);
                ret.put("durationMs", durationMs);
                notifyListeners("onTimeUpdate", ret);
            }

            @Override
            public void onEnded() {
                notifyListeners("onEnded", new JSObject());
            }

            @Override
            public void onError(String message) {
                JSObject ret = new JSObject();
                ret.put("message", message);
                notifyListeners("onError", ret);
            }
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL requerida");
            return;
        }

        String title = call.getString("title", "SpotMusic");
        String artist = call.getString("artist", "Reproduciendo");
        String album = call.getString("album", "SpotMusic Mobile");
        String coverUrl = call.getString("coverUrl", "");
        Long durationMs = call.getLong("durationMs", 0L);
        Long positionMs = call.getLong("positionMs", 0L);

        ensureServiceRunning();

        // Check if service is immediately available
        if (musicService == null) {
            musicService = MusicPlaybackService.getInstance();
        }

        if (musicService != null) {
            attachListener();
            musicService.play(url, title, artist, album, coverUrl, durationMs != null ? durationMs : 0L, positionMs != null ? positionMs : 0L);
            call.resolve();
        } else {
            // Wait slightly for bind if starting from cold
            getActivity().runOnUiThread(() -> {
                new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                    if (musicService == null) musicService = MusicPlaybackService.getInstance();
                    if (musicService != null) {
                        attachListener();
                        musicService.play(url, title, artist, album, coverUrl, durationMs != null ? durationMs : 0L, positionMs != null ? positionMs : 0L);
                        call.resolve();
                    } else {
                        call.reject("El servicio multimedia no está disponible");
                    }
                }, 150);
            });
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        if (musicService != null) {
            musicService.pause();
        }
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        if (musicService != null) {
            musicService.resume();
        }
        call.resolve();
    }

    @PluginMethod
    public void togglePlay(PluginCall call) {
        if (musicService != null) {
            musicService.togglePlay();
        }
        call.resolve();
    }

    @PluginMethod
    public void seek(PluginCall call) {
        Long positionMs = call.getLong("positionMs", 0L);
        if (musicService != null && positionMs != null) {
            musicService.seekTo(positionMs.intValue());
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (musicService != null) {
            musicService.stopPlayback();
        }
        call.resolve();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject ret = new JSObject();
        if (musicService != null) {
            ret.put("isPlaying", musicService.isPlaying());
            ret.put("currentTime", musicService.getCurrentPosition() / 1000.0);
            ret.put("duration", musicService.getDuration() / 1000.0);
        } else {
            ret.put("isPlaying", false);
            ret.put("currentTime", 0);
            ret.put("duration", 0);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (getPermissionState("notifications") != PermissionState.GRANTED) {
                requestPermissionForAlias("notifications", call, "notificationPermCallback");
                return;
            }
        }
        JSObject ret = new JSObject();
        ret.put("granted", true);
        call.resolve(ret);
    }

    @PermissionCallback
    private void notificationPermCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (isBound) {
            try {
                getContext().unbindService(serviceConnection);
            } catch (Exception ignored) {}
            isBound = false;
        }
    }
}
