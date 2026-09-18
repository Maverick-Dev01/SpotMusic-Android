import { Capacitor } from '@capacitor/core';
import { Track, RepeatMode, EqualizerPreset } from '../types';
import { localLibrary } from './localLibrary';
import { streamResolver } from './streamResolver';
import { BackgroundAudio } from './backgroundAudio';

export const EQ_PRESETS: Record<string, EqualizerPreset> = {
  'Flat': { name: 'Plano (Flat)', gains: [0, 0, 0, 0, 0], bassBoost: 0 },
  'Phone': { name: 'Altavoz del teléfono', gains: [-6, -3, 1, 2, 0], bassBoost: -4 },
  'AntiBoom': { name: 'Reducir retumbo', gains: [-9, -5, -1, 1, 0], bassBoost: -6 },
  'Speaker': { name: 'Bocina externa', gains: [-3, -2, 0, 1, 1], bassBoost: -2 },
  'Headphones': { name: 'Audífonos', gains: [-1, 0, 0, 1, 1], bassBoost: 0 },
  'BassBoost': { name: 'Bajos moderados', gains: [3, 2, 0, 0, 1], bassBoost: 3 },
  'Rock': { name: 'Rock Energético', gains: [2, 1, -1, 2, 2], bassBoost: 1 },
  'Pop': { name: 'Pop Brillante', gains: [-1, 1, 3, 2, 0], bassBoost: 1 },
  'Electronic': { name: 'Electrónica / EDM', gains: [3, 2, 0, 1, 2], bassBoost: 2 },
  'Jazz': { name: 'Jazz Acústico', gains: [1, 1, -1, 1, 2], bassBoost: 0 },
  'Vocal': { name: 'Claridad Vocal', gains: [-2, -1, 5, 4, 1], bassBoost: 0 },
  'Acoustic': { name: 'Acústico & En Vivo', gains: [1, 1, 1, 2, 2], bassBoost: 0 },
};

type AudioEventCallback = (data?: any) => void;

class AudioEngine {
  private audio: HTMLAudioElement;
  private playRequest = 0;
  private objectUrl?: string;
  private audioCtx: AudioContext | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private bassBoostNode: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Native background audio state (Android only - iOS uses WKWebView HTML5 audio with UIBackgroundModes)
  private isNative: boolean = typeof Capacitor !== 'undefined' && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  private nativeIsPlaying: boolean = false;
  private nativeCurrentTime: number = 0;
  private nativeDuration: number = 0;

  // Queue state
  public queue: Track[] = [];
  public currentIndex: number = -1;
  public repeatMode: RepeatMode = 'off';
  public shuffle: boolean = false;
  private shuffledOrder: number[] = [];

  // Equalizer state
  public currentPreset: string = 'Phone';
  public currentGains: [number, number, number, number, number] = [-6, -3, 1, 2, 0];
  public currentBassBoost: number = -4;

  // Sleep timer state
  private sleepTimerId: any = null;
  private sleepTimerEndTimestamp: number | null = null;
  private sleepOnTrackEnd: boolean = false;

  // Event subscribers
  private listeners: Map<string, Set<AudioEventCallback>> = new Map();

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = 1.0;
    this.audio.setAttribute('playsinline', 'true');
    this.audio.setAttribute('webkit-playsinline', 'true');
    this.restoreEqualizer();
    this.setupAudioListeners();
    if (this.isNative) {
      this.setupNativeListeners();
      BackgroundAudio.requestNotificationPermission().catch(() => {});
    }
  }

  public get equalizerAvailable(): boolean { return this.eqFilters.length === 5; }
  public get currentPresetLabel(): string { return EQ_PRESETS[this.currentPreset]?.name || 'Personalizado'; }

  private restoreEqualizer() {
    if (typeof localStorage === 'undefined') return;
    try {
      const savedPreset = localStorage.getItem('spotmusic_eq_preset') || 'Phone';
      const savedGains = JSON.parse(localStorage.getItem('spotmusic_eq_gains') || 'null');
      const savedBassValue = localStorage.getItem('spotmusic_eq_bass');
      const savedBass = savedBassValue === null ? null : Number(savedBassValue);
      if (EQ_PRESETS[savedPreset]) {
        this.currentPreset = savedPreset;
        this.currentGains = [...EQ_PRESETS[savedPreset].gains];
        this.currentBassBoost = EQ_PRESETS[savedPreset].bassBoost;
      }
      if (Array.isArray(savedGains) && savedGains.length === 5 && savedGains.every(Number.isFinite)) {
        this.currentGains = savedGains.map(value => Math.max(-12, Math.min(12, Number(value)))) as EqualizerPreset['gains'];
      }
      if (savedBass !== null && Number.isFinite(savedBass)) this.currentBassBoost = Math.max(-10, Math.min(6, savedBass));
    } catch {}
  }

  private persistEqualizer() {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem('spotmusic_eq_preset', this.currentPreset);
    localStorage.setItem('spotmusic_eq_gains', JSON.stringify(this.currentGains));
    localStorage.setItem('spotmusic_eq_bass', String(this.currentBassBoost));
  }

  private initAudioContext() {
    if (this.audioCtx) return;
    try {
      this.audioCtx = new AudioContext();
      const source = this.audioCtx.createMediaElementSource(this.audio);
      this.eqFilters = [60, 230, 910, 3600, 14000].map((frequency, index) => {
        const filter = this.audioCtx!.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = frequency;
        filter.Q.value = 1;
        filter.gain.value = this.currentGains[index];
        return filter;
      });
      this.bassBoostNode = this.audioCtx.createBiquadFilter();
      this.bassBoostNode.type = 'lowshelf';
      this.bassBoostNode.frequency.value = 90;
      this.bassBoostNode.gain.value = this.currentBassBoost;
      this.masterGain = this.audioCtx.createGain();
      this.compressor = this.audioCtx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 4;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      let previous: AudioNode = source;
      for (const node of [...this.eqFilters, this.bassBoostNode, this.masterGain, this.compressor, this.analyser]) {
        previous.connect(node);
        previous = node;
      }
      previous.connect(this.audioCtx.destination);
      this.updateHeadroom();
    } catch (error) {
      this.emit('error', new Error('No se pudo iniciar el ecualizador de este dispositivo.'));
    }
  }

  private updateHeadroom() {
    if (this.masterGain && this.audioCtx) {
      const boost = Math.max(0, ...this.currentGains) + Math.max(0, this.currentBassBoost);
      this.masterGain.gain.setTargetAtTime(Math.pow(10, -boost / 20), this.audioCtx.currentTime, .03);
    }
  }

  private setupAudioListeners() {
    this.audio.addEventListener('play', () => {
      this.emit('play', this.currentTrack);
      this.updateMediaSessionState('playing');
    });

    this.audio.addEventListener('pause', () => {
      this.emit('pause', this.currentTrack);
      this.updateMediaSessionState('paused');
    });

    this.audio.addEventListener('timeupdate', () => {
      this.emit('timeupdate', {
        currentTime: this.audio.currentTime,
        duration: this.audio.duration || 0,
        percent: this.audio.duration ? (this.audio.currentTime / this.audio.duration) * 100 : 0
      });
    });

    this.audio.addEventListener('ended', () => {
      if (this.sleepOnTrackEnd) {
        this.sleepOnTrackEnd = false;
        this.cancelSleepTimer();
        this.pause();
        this.emit('sleeptimerend');
        return;
      }

      if (this.repeatMode === 'one') {
        this.audio.currentTime = 0;
        this.audio.play().catch(e => console.warn(e));
      } else {
        this.next(false);
      }
    });

    this.audio.addEventListener('error', (e) => {
      if (e.target !== this.audio || !this.currentTrack || !this.audio.getAttribute('src')) return;
      if (this.currentTrack && !this.currentTrack.isLocal) {
        this.currentTrack.audio_url = undefined;
        streamResolver.clearCache();
      }
      this.emit('error', new Error('No se pudo cargar el audio. Intenta reproducirlo nuevamente.'));
    });
  }

  private setupNativeListeners() {
    BackgroundAudio.addListener('onPlay', () => {
      this.nativeIsPlaying = true;
      this.emit('play', this.currentTrack);
    });

    BackgroundAudio.addListener('onPause', () => {
      this.nativeIsPlaying = false;
      this.emit('pause', this.currentTrack);
    });

    BackgroundAudio.addListener('onNext', () => {
      this.next(true);
    });

    BackgroundAudio.addListener('onPrevious', () => {
      this.prev();
    });

    BackgroundAudio.addListener('onTimeUpdate', (data) => {
      this.nativeCurrentTime = data.currentTime;
      if (data.duration > 0) this.nativeDuration = data.duration;
      const dur = this.nativeDuration || (this.currentTrack?.duration_ms ? this.currentTrack.duration_ms / 1000 : 0);
      this.emit('timeupdate', {
        currentTime: data.currentTime,
        duration: dur,
        percent: dur ? (data.currentTime / dur) * 100 : 0
      });
    });

    BackgroundAudio.addListener('onEnded', () => {
      if (this.sleepOnTrackEnd) {
        this.sleepOnTrackEnd = false;
        this.cancelSleepTimer();
        this.pause();
        this.emit('sleeptimerend');
        return;
      }

      if (this.repeatMode === 'one') {
        if (this.currentTrack) this.playIndex(this.currentIndex);
      } else {
        this.next(false);
      }
    });

    BackgroundAudio.addListener('onError', (err) => {
      this.emit('error', new Error(err.message || 'Error en reproducción de audio.'));
    });
  }

  public get currentTrack(): Track | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      return this.queue[this.currentIndex];
    }
    return null;
  }

  public get isPlaying(): boolean {
    if (this.isNative) return this.nativeIsPlaying;
    return !this.audio.paused && !this.audio.ended && this.audio.currentTime > 0;
  }

  public get duration(): number {
    if (this.isNative) {
      return this.nativeDuration || (this.currentTrack?.duration_ms ? this.currentTrack.duration_ms / 1000 : 0);
    }
    return this.audio.duration || 0;
  }

  public get currentTime(): number {
    if (this.isNative) return this.nativeCurrentTime;
    return this.audio.currentTime || 0;
  }

  public async playTrack(track: Track) {
    // Add to queue if not present, or find index
    let idx = this.queue.findIndex(t => t.id === track.id);
    if (idx === -1) {
      this.queue.push(track);
      idx = this.queue.length - 1;
      this.regenerateShuffleOrder();
    }
    await this.playIndex(idx);
  }

  public async playQueue(tracks: Track[], startIndex = 0) {
    if (!tracks.length) return;
    this.queue = [...tracks];
    this.regenerateShuffleOrder();
    await this.playIndex(startIndex);
  }

  public async playIndex(index: number) {
    if (index < 0 || index >= this.queue.length) return;
    const request = ++this.playRequest;

    // Synchronously prime/unlock HTMLAudioElement on iOS Safari / WebKit during user click tick
    if (!this.isNative) {
      try {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          void this.audioCtx.resume();
        }
        if (!this.audio.src) {
          this.audio.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
          const p = this.audio.play();
          if (p) p.then(() => this.audio.pause()).catch(() => {});
        }
      } catch {}
    }

    this.audio.pause();
    this.currentIndex = index;
    const track = this.queue[index];

    let audioUrl = track.audio_url;
    let newObjectUrl: string | undefined;

    // 1. If local track, check if we have offline audio blob in IndexedDB (100% offline, zero-CORS)
    if (track.isLocal || track.localPath) {
      try {
        const blob = await localLibrary.getAudioBlob(track.id);
        if (blob) {
          audioUrl = newObjectUrl = URL.createObjectURL(blob);
        } else if (track.localPath) {
          audioUrl = track.localPath;
        }
      } catch (e) {
        console.warn('Local blob read notice:', e);
      }
    }

    // 2. Resolve full audio stream if missing or if it is a 30s preview
    const isPreview = !audioUrl || audioUrl.includes('apple.com') || audioUrl.includes('mzstatic') || audioUrl.includes('preview') || track.duration_ms === 30000;
    let resolutionError: unknown;
    if (isPreview && !track.isLocal) {
      audioUrl = undefined;
      try {
        const resolved = await streamResolver.resolveFullAudio(track.name, track.artists, track.duration_ms);
        if (resolved) {
          audioUrl = resolved.audioUrl;
          track.audio_url = resolved.audioUrl;
          track.duration_ms = resolved.durationMs;
          track.duration_str = resolved.durationStr;
          track.format = resolved.format;
          if (resolved.coverUrl && !track.cover_url) {
            track.cover_url = resolved.coverUrl;
          }
        }
      } catch (err) {
        resolutionError = err;
        console.warn('Full stream resolver error:', err);
      }
    }

    if (request !== this.playRequest) {
      if (newObjectUrl) URL.revokeObjectURL(newObjectUrl);
      return;
    }
    if (!audioUrl) {
      this.emit('error', resolutionError instanceof Error
        ? resolutionError
        : new Error('No se encontró audio completo para esta canción. Intenta nuevamente.'));
      return;
    }

    const nativeSource = track.localPath || audioUrl;

    if (this.isNative) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = undefined;
      }
      try {
        await BackgroundAudio.play({
          url: nativeSource,
          title: track.name,
          artist: track.artists,
          album: track.album || 'SpotMusic Mobile',
          coverUrl: track.cover_url || '',
          durationMs: track.duration_ms || 0,
          positionMs: 0
        });
        if (request !== this.playRequest) return;
        this.nativeIsPlaying = true;
        this.nativeCurrentTime = 0;
        this.nativeDuration = track.duration_ms ? track.duration_ms / 1000 : 0;
        this.emit('trackchange', track);
        this.emit('queuechange', { queue: this.queue, currentIndex: this.currentIndex });
        this.emit('play', track);
        return;
      } catch (err: any) {
        if (request !== this.playRequest) return;
        console.warn('Native playback error:', err);
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
        return;
      }
    }

    // Convert native file:// URIs into WebView-safe Capacitor streaming URLs if needed
    if (audioUrl.startsWith('file://') || (track.isLocal && !audioUrl.startsWith('http') && !audioUrl.startsWith('blob:'))) {
      audioUrl = Capacitor.convertFileSrc(audioUrl);
    }

    this.audio.pause();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = newObjectUrl;

    this.audio.crossOrigin = 'anonymous';
    this.audio.setAttribute('playsinline', 'true');
    this.audio.setAttribute('webkit-playsinline', 'true');
    this.audio.src = audioUrl;

    const localAudio = audioUrl.startsWith('blob:') || audioUrl.startsWith('data:') ||
      (track.isLocal && new URL(audioUrl, location.href).origin === location.origin);
    if (localAudio) {
      this.initAudioContext();
    }
    this.emit('eqavailability', this.equalizerAvailable);
    this.audio.load();
    this.audio.volume = 1.0;
    this.updateMediaSessionMetadata(track);

    try {
      if (this.audioCtx?.state === 'suspended') await this.audioCtx.resume();
      await this.audio.play();
      if (request !== this.playRequest) return;
      this.emit('trackchange', track);
      this.emit('queuechange', { queue: this.queue, currentIndex: this.currentIndex });
    } catch (e: any) {
      if (request !== this.playRequest) return;
      console.warn('Playback error:', e);
      this.emit('error', e);
    }
  }

  public togglePlay(): boolean {
    if (!this.currentTrack && this.queue.length > 0) {
      this.playIndex(0);
      return true;
    }
    if (this.isNative) {
      if (this.nativeIsPlaying) {
        this.pause();
        return false;
      } else {
        this.resume();
        return true;
      }
    }
    if (this.audio.paused) {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      this.audio.play().catch(e => console.warn(e));
      return true;
    } else {
      this.audio.pause();
      return false;
    }
  }

  public pause() {
    this.playRequest++;
    if (this.isNative) {
      this.nativeIsPlaying = false;
      BackgroundAudio.pause().catch(e => console.warn(e));
      this.emit('pause', this.currentTrack);
      return;
    }
    this.audio.pause();
  }

  public resume() {
    if (this.isNative) {
      this.nativeIsPlaying = true;
      BackgroundAudio.resume().catch(e => console.warn(e));
      this.emit('play', this.currentTrack);
      return;
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    this.audio.play().catch(e => console.warn(e));
  }

  public seek(seconds: number) {
    if (this.isNative) {
      this.nativeCurrentTime = Math.max(0, Math.min(seconds, this.duration || seconds));
      BackgroundAudio.seek({ positionMs: Math.round(this.nativeCurrentTime * 1000) }).catch(e => console.warn(e));
      return;
    }
    if (this.audio.duration) {
      this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration));
    }
  }

  public seekPercent(percent: number) {
    if (this.audio.duration) {
      this.seek((percent / 100) * this.audio.duration);
    }
  }

  public next(userTriggered = true) {
    if (!this.queue.length) return;

    if (this.repeatMode === 'one' && !userTriggered) {
      this.audio.currentTime = 0;
      this.audio.play().catch(e => console.warn(e));
      return;
    }

    if (this.shuffle && this.shuffledOrder.length === this.queue.length) {
      const currentPosInShuffle = this.shuffledOrder.indexOf(this.currentIndex);
      let nextPos = currentPosInShuffle + 1;
      if (nextPos >= this.shuffledOrder.length) {
        if (this.repeatMode === 'all') {
          nextPos = 0;
        } else {
          this.audio.currentTime = 0;
          this.pause();
          return;
        }
      }
      this.playIndex(this.shuffledOrder[nextPos]);
    } else {
      let nextIdx = this.currentIndex + 1;
      if (nextIdx >= this.queue.length) {
        if (this.repeatMode === 'all') {
          nextIdx = 0;
        } else {
          this.audio.currentTime = 0;
          this.pause();
          return;
        }
      }
      this.playIndex(nextIdx);
    }
  }

  public prev() {
    if (!this.queue.length) return;

    // If more than 3 seconds into the track, restart it
    if (this.audio.currentTime > 3) {
      this.audio.currentTime = 0;
      return;
    }

    if (this.shuffle && this.shuffledOrder.length === this.queue.length) {
      const currentPosInShuffle = this.shuffledOrder.indexOf(this.currentIndex);
      let prevPos = currentPosInShuffle - 1;
      if (prevPos < 0) {
        prevPos = this.repeatMode === 'all' ? this.shuffledOrder.length - 1 : 0;
      }
      this.playIndex(this.shuffledOrder[prevPos]);
    } else {
      let prevIdx = this.currentIndex - 1;
      if (prevIdx < 0) {
        prevIdx = this.repeatMode === 'all' ? this.queue.length - 1 : 0;
      }
      this.playIndex(prevIdx);
    }
  }

  // Queue Operations
  public addToQueue(track: Track) {
    this.queue.push(track);
    this.regenerateShuffleOrder();
    this.emit('queuechange', { queue: this.queue, currentIndex: this.currentIndex });
  }

  public playNext(track: Track) {
    if (this.currentIndex === -1) {
      this.queue.push(track);
      this.playIndex(0);
    } else {
      this.queue.splice(this.currentIndex + 1, 0, track);
      this.regenerateShuffleOrder();
      this.emit('queuechange', { queue: this.queue, currentIndex: this.currentIndex });
    }
  }

  public removeFromQueue(index: number) {
    if (index < 0 || index >= this.queue.length) return;
    this.queue.splice(index, 1);
    if (index < this.currentIndex) {
      this.currentIndex--;
    } else if (index === this.currentIndex) {
      if (this.queue.length > 0) {
        this.playIndex(Math.min(this.currentIndex, this.queue.length - 1));
      } else {
        this.currentIndex = -1;
        this.audio.src = '';
        this.pause();
      }
    }
    this.regenerateShuffleOrder();
    this.emit('queuechange', { queue: this.queue, currentIndex: this.currentIndex });
  }

  public clearQueue() {
    this.playRequest++;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = undefined;
    this.queue = [];
    this.currentIndex = -1;
    if (this.isNative) {
      BackgroundAudio.stop().catch(e => console.warn(e));
      this.nativeIsPlaying = false;
      this.nativeCurrentTime = 0;
      this.nativeDuration = 0;
    } else {
      this.audio.src = '';
      this.pause();
    }
    this.emit('queuechange', { queue: [], currentIndex: -1 });
  }

  public toggleShuffle(): boolean {
    this.shuffle = !this.shuffle;
    if (this.shuffle) {
      this.regenerateShuffleOrder();
    }
    this.emit('shufflechange', this.shuffle);
    return this.shuffle;
  }

  public cycleRepeat(): RepeatMode {
    if (this.repeatMode === 'off') this.repeatMode = 'all';
    else if (this.repeatMode === 'all') this.repeatMode = 'one';
    else this.repeatMode = 'off';
    this.emit('repeatchange', this.repeatMode);
    return this.repeatMode;
  }

  private regenerateShuffleOrder() {
    this.shuffledOrder = this.queue.map((_, i) => i);
    for (let i = this.shuffledOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.shuffledOrder[i], this.shuffledOrder[j]] = [this.shuffledOrder[j], this.shuffledOrder[i]];
    }
  }

  // Equalizer & Bass Booster
  public applyPreset(presetName: string) {
    const preset = EQ_PRESETS[presetName] || EQ_PRESETS['Flat'];
    this.currentPreset = EQ_PRESETS[presetName] ? presetName : 'Flat';
    this.currentGains = [...preset.gains];
    this.currentBassBoost = preset.bassBoost;

    this.eqFilters.forEach((filter, i) => {
      filter.gain.setTargetAtTime(this.currentGains[i], this.audioCtx?.currentTime || 0, 0.05);
    });

    if (this.bassBoostNode) {
      this.bassBoostNode.gain.setTargetAtTime(this.currentBassBoost, this.audioCtx?.currentTime || 0, 0.05);
    }

    this.updateHeadroom();
    this.persistEqualizer();
    this.emit('eqchange', {
      preset: this.currentPreset,
      gains: this.currentGains,
      bassBoost: this.currentBassBoost
    });
  }

  public setBandGain(bandIndex: number, gainDb: number) {
    if (bandIndex < 0 || bandIndex >= this.eqFilters.length) return;
    this.currentGains[bandIndex] = gainDb;
    this.currentPreset = 'Custom';
    this.eqFilters[bandIndex].gain.setTargetAtTime(gainDb, this.audioCtx?.currentTime || 0, 0.05);
    this.updateHeadroom();
    this.persistEqualizer();
    this.emit('eqchange', {
      preset: this.currentPreset,
      gains: this.currentGains,
      bassBoost: this.currentBassBoost
    });
  }

  public setBassBoost(level: number) {
    this.currentBassBoost = Math.max(-10, Math.min(6, level));
    this.currentPreset = 'Custom';
    if (this.bassBoostNode) {
      this.bassBoostNode.gain.setTargetAtTime(this.currentBassBoost, this.audioCtx?.currentTime || 0, 0.05);
    }
    this.updateHeadroom();
    this.persistEqualizer();
    this.emit('eqchange', {
      preset: this.currentPreset,
      gains: this.currentGains,
      bassBoost: this.currentBassBoost
    });
  }

  // Visualizer Data
  public getWaveformData(): Uint8Array {
    const arr = new Uint8Array(32);
    if (!this.isPlaying) return arr;
    if (this.analyser) {
      const bins = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.getByteFrequencyData(bins);
      return bins.slice(0, 32);
    }
    const t = (this.audio.currentTime || 0) * 5;
    for (let i = 0; i < 32; i++) {
      const v = Math.sin(t + i * 0.45) * 0.5 + Math.cos(t * 1.3 + i * 0.25) * 0.5;
      arr[i] = Math.floor(Math.max(25, Math.min(235, 120 + v * 95)));
    }
    return arr;
  }

  // Sleep Timer
  public startSleepTimer(minutes: number) {
    this.cancelSleepTimer();
    const durationMs = minutes * 60 * 1000;
    this.sleepTimerEndTimestamp = Date.now() + durationMs;
    this.sleepOnTrackEnd = false;

    // Check every second for timer expiration and fade out
    this.sleepTimerId = setInterval(() => {
      const remaining = (this.sleepTimerEndTimestamp || 0) - Date.now();
      if (remaining <= 0) {
        this.cancelSleepTimer();
        this.pause();
        this.emit('sleeptimerend');
      } else {
        // Fade out in last 15 seconds
        if (remaining < 15000) {
          const factor = Math.max(0, remaining / 15000);
          this.audio.volume = factor;
        }
        this.emit('sleeptimertick', Math.ceil(remaining / 1000));
      }
    }, 1000);

    this.emit('sleeptimerstart', { minutes, endTimestamp: this.sleepTimerEndTimestamp });
  }

  public setSleepOnTrackEnd() {
    this.cancelSleepTimer();
    this.sleepOnTrackEnd = true;
    this.emit('sleeptimerstart', { trackEnd: true });
  }

  public cancelSleepTimer() {
    this.audio.volume = 1;
    if (this.sleepTimerId) {
      clearInterval(this.sleepTimerId);
      this.sleepTimerId = null;
    }
    this.sleepTimerEndTimestamp = null;
    this.sleepOnTrackEnd = false;
    if (this.masterGain && this.audioCtx) {
      this.updateHeadroom();
    }
    this.emit('sleeptimercancel');
  }

  public get isSleepTimerActive(): boolean {
    return this.sleepTimerEndTimestamp !== null || this.sleepOnTrackEnd;
  }

  // MediaSession API (Android Lockscreen & Notification Controls)
  private updateMediaSessionMetadata(track: Track) {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.name,
      artist: track.artists,
      album: track.album || 'SpotMusic Mobile',
      artwork: [
        { src: track.cover_url || '', sizes: '512x512', type: 'image/jpeg' }
      ]
    });

    navigator.mediaSession.setActionHandler('play', () => this.resume());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) this.seek(details.seekTime);
    });
  }

  private updateMediaSessionState(state: 'playing' | 'paused') {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  // Event Pub/Sub
  public on(event: string, cb: AudioEventCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
    return () => this.off(event, cb);
  }

  public off(event: string, cb: AudioEventCallback) {
    this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, data?: any) {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(data); } catch (e) { console.error(e); }
    });
  }
}

export const audioEngine = new AudioEngine();
