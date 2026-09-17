package com.spotmusic.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MusicPlaybackService extends Service {

    public static final String ACTION_PLAY = "com.spotmusic.app.ACTION_PLAY";
    public static final String ACTION_PAUSE = "com.spotmusic.app.ACTION_PAUSE";
    public static final String ACTION_TOGGLE = "com.spotmusic.app.ACTION_TOGGLE";
    public static final String ACTION_NEXT = "com.spotmusic.app.ACTION_NEXT";
    public static final String ACTION_PREV = "com.spotmusic.app.ACTION_PREV";
    public static final String ACTION_STOP = "com.spotmusic.app.ACTION_STOP";

    private static final String CHANNEL_ID = "spotmusic_playback";
    private static final int NOTIFICATION_ID = 1001;

    private static MusicPlaybackService instance;
    private final IBinder binder = new LocalBinder();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService artworkExecutor = Executors.newSingleThreadExecutor();

    private MediaPlayer mediaPlayer;
    private MediaSessionCompat mediaSession;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    // Current metadata
    private String currentUrl = "";
    private String currentTitle = "SpotMusic";
    private String currentArtist = "Reproduciendo...";
    private String currentAlbum = "SpotMusic Mobile";
    private String currentCoverUrl = "";
    private Bitmap currentCoverBitmap = null;
    private long currentDurationMs = 0;
    private boolean isPrepared = false;

    public interface ServiceListener {
        void onPlay();
        void onPause();
        void onNext();
        void onPrevious();
        void onTimeUpdate(long positionMs, long durationMs);
        void onEnded();
        void onError(String message);
    }

    private ServiceListener listener;

    public class LocalBinder extends Binder {
        public MusicPlaybackService getService() {
            return MusicPlaybackService.this;
        }
    }

    public static MusicPlaybackService getInstance() {
        return instance;
    }

    public void setListener(ServiceListener listener) {
        this.listener = listener;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;

        createNotificationChannel();
        initLocks();
        initMediaSession();
        initMediaPlayer();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && intent.getAction() != null) {
            handleAction(intent.getAction());
        }
        return START_STICKY;
    }

    private void handleAction(String action) {
        switch (action) {
            case ACTION_PLAY:
                resume();
                break;
            case ACTION_PAUSE:
                pause();
                break;
            case ACTION_TOGGLE:
                togglePlay();
                break;
            case ACTION_NEXT:
                if (listener != null) listener.onNext();
                break;
            case ACTION_PREV:
                if (listener != null) listener.onPrevious();
                break;
            case ACTION_STOP:
                stopPlayback();
                break;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "SpotMusic Playback",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Controles multimedia en segundo plano");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.createNotificationChannel(channel);
            }
        }
    }

    private void initLocks() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SpotMusic:PlaybackWakeLock");
            wakeLock.setReferenceCounted(false);
        }
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null) {
            int wifiMode = WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = wm.createWifiLock(wifiMode, "SpotMusic:PlaybackWifiLock");
            wifiLock.setReferenceCounted(false);
        }
    }

    private void acquireLocks() {
        try {
            if (wakeLock != null && !wakeLock.isHeld()) wakeLock.acquire(12 * 60 * 60 * 1000L); // max 12h safety
            if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
        } catch (Exception ignored) {}
    }

    private void releaseLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
            if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        } catch (Exception ignored) {}
    }

    private void initMediaSession() {
        mediaSession = new MediaSessionCompat(this, "SpotMusicMediaSession");
        mediaSession.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                resume();
            }

            @Override
            public void onPause() {
                pause();
            }

            @Override
            public void onSkipToNext() {
                if (listener != null) listener.onNext();
            }

            @Override
            public void onSkipToPrevious() {
                if (listener != null) listener.onPrevious();
            }

            @Override
            public void onSeekTo(long pos) {
                seekTo((int) pos);
            }

            @Override
            public void onStop() {
                stopPlayback();
            }
        });
        mediaSession.setActive(true);
    }

    private void initMediaPlayer() {
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        mediaPlayer = new MediaPlayer();
        mediaPlayer.setAudioAttributes(
            new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .build()
        );
        mediaPlayer.setWakeMode(getApplicationContext(), PowerManager.PARTIAL_WAKE_LOCK);

        mediaPlayer.setOnPreparedListener(mp -> {
            isPrepared = true;
            if (currentDurationMs <= 0 && mp.getDuration() > 0) {
                currentDurationMs = mp.getDuration();
            }
            if (requestAudioFocus()) {
                mp.start();
                acquireLocks();
                updateMediaSessionPlaybackState(PlaybackStateCompat.STATE_PLAYING);
                updateNotification();
                startProgressTicker();
                if (listener != null) listener.onPlay();
            }
        });

        mediaPlayer.setOnCompletionListener(mp -> {
            updateMediaSessionPlaybackState(PlaybackStateCompat.STATE_PAUSED);
            stopProgressTicker();
            updateNotification();
            if (listener != null) listener.onEnded();
        });

        mediaPlayer.setOnErrorListener((mp, what, extra) -> {
            isPrepared = false;
            stopProgressTicker();
            releaseLocks();
            if (listener != null) listener.onError("Error de reproducción (" + what + ", " + extra + ")");
            return true;
        });
    }

    public void play(String url, String title, String artist, String album, String coverUrl, long durationMs, long startPositionMs) {
        this.currentUrl = url;
        this.currentTitle = (title != null && !title.isEmpty()) ? title : "SpotMusic";
        this.currentArtist = (artist != null && !artist.isEmpty()) ? artist : "Artista";
        this.currentAlbum = (album != null && !album.isEmpty()) ? album : "SpotMusic";
        this.currentDurationMs = durationMs;

        // Fetch new artwork if changed
        if (coverUrl != null && !coverUrl.equals(this.currentCoverUrl)) {
            this.currentCoverUrl = coverUrl;
            loadArtwork(coverUrl);
        }

        try {
            isPrepared = false;
            mediaPlayer.reset();

            if (url.startsWith("content://")) {
                mediaPlayer.setDataSource(this, Uri.parse(url));
            } else if (url.startsWith("file://")) {
                mediaPlayer.setDataSource(this, Uri.parse(url));
            } else if (url.startsWith("/")) {
                mediaPlayer.setDataSource(url);
            } else {
                mediaPlayer.setDataSource(this, Uri.parse(url));
            }

            updateMediaSessionMetadata();
            updateMediaSessionPlaybackState(PlaybackStateCompat.STATE_BUFFERING);
            updateNotification();

            mediaPlayer.prepareAsync();
        } catch (Exception e) {
            if (listener != null) listener.onError("No se pudo iniciar el audio: " + e.getMessage());
        }
    }

    public void pause() {
        if (mediaPlayer != null && isPrepared && mediaPlayer.isPlaying()) {
            mediaPlayer.pause();
            stopProgressTicker();
            releaseLocks();
            updateMediaSessionPlaybackState(PlaybackStateCompat.STATE_PAUSED);
            updateNotification();
            if (listener != null) listener.onPause();
        }
    }

    public void resume() {
        if (mediaPlayer != null && isPrepared && !mediaPlayer.isPlaying()) {
            if (requestAudioFocus()) {
                mediaPlayer.start();
                acquireLocks();
                startProgressTicker();
                updateMediaSessionPlaybackState(PlaybackStateCompat.STATE_PLAYING);
                updateNotification();
                if (listener != null) listener.onPlay();
            }
        }
    }

    public void togglePlay() {
        if (mediaPlayer != null && isPrepared) {
            if (mediaPlayer.isPlaying()) {
                pause();
            } else {
                resume();
            }
        }
    }

    public void seekTo(int positionMs) {
        if (mediaPlayer != null && isPrepared) {
            mediaPlayer.seekTo(positionMs);
            updateMediaSessionPlaybackState(
                mediaPlayer.isPlaying() ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED
            );
        }
    }

    public void stopPlayback() {
        stopProgressTicker();
        releaseLocks();
        abandonAudioFocus();
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.reset();
            } catch (Exception ignored) {}
        }
        isPrepared = false;
        updateMediaSessionPlaybackState(PlaybackStateCompat.STATE_STOPPED);
        stopForeground(true);
        stopSelf();
    }

    public boolean isPlaying() {
        return mediaPlayer != null && isPrepared && mediaPlayer.isPlaying();
    }

    public long getCurrentPosition() {
        if (mediaPlayer != null && isPrepared) {
            try {
                return mediaPlayer.getCurrentPosition();
            } catch (Exception ignored) {}
        }
        return 0;
    }

    public long getDuration() {
        if (mediaPlayer != null && isPrepared) {
            try {
                int dur = mediaPlayer.getDuration();
                if (dur > 0) return dur;
            } catch (Exception ignored) {}
        }
        return currentDurationMs;
    }

    private final Runnable progressRunnable = new Runnable() {
        @Override
        public void run() {
            if (mediaPlayer != null && isPrepared && mediaPlayer.isPlaying()) {
                long pos = getCurrentPosition();
                long dur = getDuration();
                if (listener != null) {
                    listener.onTimeUpdate(pos, dur);
                }
                mainHandler.postDelayed(this, 500);
            }
        }
    };

    private void startProgressTicker() {
        stopProgressTicker();
        mainHandler.post(progressRunnable);
    }

    private void stopProgressTicker() {
        mainHandler.removeCallbacks(progressRunnable);
    }

    private void loadArtwork(String urlString) {
        artworkExecutor.execute(() -> {
            Bitmap bmp = null;
            try {
                if (urlString.startsWith("http://") || urlString.startsWith("https://")) {
                    URL url = new URL(urlString);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(12000);
                    conn.setDoInput(true);
                    conn.connect();
                    InputStream is = conn.getInputStream();
                    bmp = BitmapFactory.decodeStream(is);
                    is.close();
                    conn.disconnect();
                } else if (urlString.startsWith("content://") || urlString.startsWith("file://")) {
                    InputStream is = getContentResolver().openInputStream(Uri.parse(urlString));
                    if (is != null) {
                        bmp = BitmapFactory.decodeStream(is);
                        is.close();
                    }
                }
            } catch (Exception ignored) {}

            currentCoverBitmap = bmp;
            mainHandler.post(() -> {
                updateMediaSessionMetadata();
                updateNotification();
            });
        });
    }

    private void updateMediaSessionMetadata() {
        if (mediaSession == null) return;
        MediaMetadataCompat.Builder builder = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentAlbum)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, getDuration());

        if (currentCoverBitmap != null && !currentCoverBitmap.isRecycled()) {
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentCoverBitmap);
            builder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, currentCoverBitmap);
        }

        mediaSession.setMetadata(builder.build());
    }

    private void updateMediaSessionPlaybackState(int state) {
        if (mediaSession == null) return;
        long actions = PlaybackStateCompat.ACTION_PLAY
            | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE
            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            | PlaybackStateCompat.ACTION_SEEK_TO
            | PlaybackStateCompat.ACTION_STOP;

        long position = getCurrentPosition();
        float speed = (state == PlaybackStateCompat.STATE_PLAYING) ? 1.0f : 0.0f;

        PlaybackStateCompat playbackState = new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(state, position, speed)
            .build();

        mediaSession.setPlaybackState(playbackState);
    }

    private void updateNotification() {
        boolean playing = isPlaying();

        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pOpenApp = PendingIntent.getActivity(
            this, 0, openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        PendingIntent pPrev = createActionPendingIntent(ACTION_PREV, 1);
        PendingIntent pToggle = createActionPendingIntent(ACTION_TOGGLE, 2);
        PendingIntent pNext = createActionPendingIntent(ACTION_NEXT, 3);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(currentTitle)
            .setContentText(currentArtist)
            .setSubText(currentAlbum)
            .setSmallIcon(R.drawable.ic_stat_music)
            .setContentIntent(pOpenApp)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setOngoing(playing)
            .setShowWhen(false)
            .setStyle(
                new MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .addAction(R.drawable.ic_prev, "Anterior", pPrev)
            .addAction(playing ? R.drawable.ic_pause : R.drawable.ic_play, playing ? "Pausar" : "Reproducir", pToggle)
            .addAction(R.drawable.ic_next, "Siguiente", pNext);

        if (currentCoverBitmap != null && !currentCoverBitmap.isRecycled()) {
            builder.setLargeIcon(currentCoverBitmap);
        } else {
            Bitmap defaultIcon = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
            if (defaultIcon != null) {
                builder.setLargeIcon(defaultIcon);
            }
        }

        Notification notification = builder.build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private PendingIntent createActionPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MusicPlaybackService.class);
        intent.setAction(action);
        return PendingIntent.getService(
            this, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );
    }

    private boolean requestAudioFocus() {
        if (audioManager == null) return true;
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .build()
                )
                .setOnAudioFocusChangeListener(afChangeListener)
                .build();
            result = audioManager.requestAudioFocus(audioFocusRequest);
        } else {
            result = audioManager.requestAudioFocus(afChangeListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonAudioFocus() {
        if (audioManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
            audioManager.abandonAudioFocusRequest(audioFocusRequest);
        } else {
            audioManager.abandonAudioFocus(afChangeListener);
        }
    }

    private final AudioManager.OnAudioFocusChangeListener afChangeListener = focusChange -> {
        switch (focusChange) {
            case AudioManager.AUDIOFOCUS_LOSS:
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                pause();
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                // Do not resume automatically unless desired, or resume if transient
                break;
        }
    };

    @Override
    public void onDestroy() {
        super.onDestroy();
        instance = null;
        stopProgressTicker();
        artworkExecutor.shutdownNow();
        releaseLocks();
        abandonAudioFocus();
        if (mediaPlayer != null) {
            try {
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
    }
}
