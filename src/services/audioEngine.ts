import { Track, RepeatMode, EqualizerPreset } from '../types';

export const EQ_PRESETS: Record<string, EqualizerPreset> = {
  'Flat': { name: 'Plano (Flat)', gains: [0, 0, 0, 0, 0], bassBoost: 0 },
  'BassBoost': { name: 'Potenciador de Bajos', gains: [7, 5, 0, 1, 2], bassBoost: 8 },
  'Rock': { name: 'Rock Energético', gains: [5, 3, -1, 3, 5], bassBoost: 4 },
  'Pop': { name: 'Pop Brillante', gains: [-1, 2, 5, 3, -1], bassBoost: 2 },
  'Electronic': { name: 'Electrónica / EDM', gains: [6, 4, 0, 2, 5], bassBoost: 6 },
  'Jazz': { name: 'Jazz Acústico', gains: [3, 2, -2, 2, 4], bassBoost: 2 },
  'Vocal': { name: 'Claridad Vocal', gains: [-2, -1, 5, 4, 1], bassBoost: 0 },
  'Acoustic': { name: 'Acústico & En Vivo', gains: [3, 2, 1, 3, 4], bassBoost: 1 },
};

type AudioEventCallback = (data?: any) => void;

class AudioEngine {
  private audio: HTMLAudioElement;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private bassBoostNode: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  // Queue state
  public queue: Track[] = [];
  public currentIndex: number = -1;
  public repeatMode: RepeatMode = 'off';
  public shuffle: boolean = false;
  private shuffledOrder: number[] = [];

  // Equalizer state
  public currentPreset: string = 'Flat';
  public currentGains: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  public currentBassBoost: number = 0;

  // Sleep timer state
  private sleepTimerId: any = null;
  private sleepTimerEndTimestamp: number | null = null;
  private sleepOnTrackEnd: boolean = false;

  // Event subscribers
  private listeners: Map<string, Set<AudioEventCallback>> = new Map();

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.setupAudioListeners();
  }

  private initAudioContext() {
    if (this.audioCtx) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      this.audioCtx = new AudioCtxClass();

      // Equalizer Frequencies: 60Hz, 230Hz, 910Hz, 3.6kHz, 14kHz
      const freqs = [60, 230, 910, 3600, 14000];
      const types: BiquadFilterType[] = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

      this.eqFilters = freqs.map((freq, i) => {
        const filter = this.audioCtx!.createBiquadFilter();
        filter.type = types[i];
        filter.frequency.value = freq;
        filter.gain.value = this.currentGains[i];
        return filter;
      });

      // Dedicated Bass Boost filter (lowshelf at 80Hz)
      this.bassBoostNode = this.audioCtx.createBiquadFilter();
      this.bassBoostNode.type = 'lowshelf';
      this.bassBoostNode.frequency.value = 80;
      this.bassBoostNode.gain.value = this.currentBassBoost * 1.5;

      // Analyser for real-time waveform visualizer
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 64;

      // Master Gain for smooth volume and fade-out
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = 1.0;

      // Connect graph: Audio -> Source -> EQ[0..4] -> BassBoost -> Analyser -> MasterGain -> Destination
      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);

      let prevNode: AudioNode = this.sourceNode;
      this.eqFilters.forEach(f => {
        prevNode.connect(f);
        prevNode = f;
      });

      prevNode.connect(this.bassBoostNode);
      this.bassBoostNode.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.audioCtx.destination);
    } catch (err) {
      console.warn('Web Audio API setup notice:', err);
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
      this.emit('error', e);
    });
  }

  public get currentTrack(): Track | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
      return this.queue[this.currentIndex];
    }
    return null;
  }

  public get isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended && this.audio.currentTime > 0;
  }

  public get duration(): number {
    return this.audio.duration || 0;
  }

  public get currentTime(): number {
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
    this.currentIndex = index;
    const track = this.queue[index];

    // Lazy init audio context on user interaction
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    const audioUrl = track.audio_url || track.preview_url || track.localPath;
    if (!audioUrl) {
      this.emit('error', new Error('No hay URL de audio para reproducir'));
      return;
    }

    this.audio.src = audioUrl;
    this.updateMediaSessionMetadata(track);

    try {
      await this.audio.play();
      this.emit('trackchange', track);
      this.emit('queuechange', { queue: this.queue, currentIndex: this.currentIndex });
    } catch (e: any) {
      console.warn('Playback error:', e);
      this.emit('error', e);
    }
  }

  public togglePlay(): boolean {
    if (!this.currentTrack && this.queue.length > 0) {
      this.playIndex(0);
      return true;
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
    this.audio.pause();
  }

  public resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    this.audio.play().catch(e => console.warn(e));
  }

  public seek(seconds: number) {
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
    this.queue = [];
    this.currentIndex = -1;
    this.audio.src = '';
    this.pause();
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
    this.currentPreset = presetName;
    this.currentGains = [...preset.gains];
    this.currentBassBoost = preset.bassBoost;

    this.eqFilters.forEach((filter, i) => {
      filter.gain.setTargetAtTime(this.currentGains[i], this.audioCtx?.currentTime || 0, 0.05);
    });

    if (this.bassBoostNode) {
      this.bassBoostNode.gain.setTargetAtTime(this.currentBassBoost * 1.5, this.audioCtx?.currentTime || 0, 0.05);
    }

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
    this.emit('eqchange', {
      preset: this.currentPreset,
      gains: this.currentGains,
      bassBoost: this.currentBassBoost
    });
  }

  public setBassBoost(level: number) {
    this.currentBassBoost = Math.max(0, Math.min(10, level));
    if (this.bassBoostNode) {
      this.bassBoostNode.gain.setTargetAtTime(this.currentBassBoost * 1.5, this.audioCtx?.currentTime || 0, 0.05);
    }
    this.emit('eqchange', {
      preset: this.currentPreset,
      gains: this.currentGains,
      bassBoost: this.currentBassBoost
    });
  }

  // Visualizer Data
  public getWaveformData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(32);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
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
        if (remaining < 15000 && this.masterGain && this.audioCtx) {
          const factor = Math.max(0, remaining / 15000);
          this.masterGain.gain.setValueAtTime(factor, this.audioCtx.currentTime);
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
    if (this.sleepTimerId) {
      clearInterval(this.sleepTimerId);
      this.sleepTimerId = null;
    }
    this.sleepTimerEndTimestamp = null;
    this.sleepOnTrackEnd = false;
    if (this.masterGain && this.audioCtx) {
      this.masterGain.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
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
