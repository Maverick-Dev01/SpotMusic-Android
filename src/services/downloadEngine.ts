import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Track, DownloadTask } from '../types';
import { localLibrary } from './localLibrary';
import { licenseClient } from './licenseClient';
import { streamResolver } from './streamResolver';
import { storagePicker } from './storagePicker';

type DownloadProgressCallback = (tasks: DownloadTask[]) => void;

class DownloadEngine {
  private queue: DownloadTask[] = [];
  private activeCount = 0;
  private readonly maxConcurrency = 1;
  private readonly minStartIntervalMs = 3000;
  private lastStartedAt = 0;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;
  private listeners: Set<DownloadProgressCallback> = new Set();

  constructor() {
    if (typeof localStorage !== 'undefined') {
      this.paused = localStorage.getItem('spotmusic_downloads_paused') === 'true';
      try {
        const saved = JSON.parse(localStorage.getItem('spotmusic_download_queue_v2') || '[]') as DownloadTask[];
        this.queue = saved.map(task => ({
          ...task,
          status: task.status === 'downloading' ? 'queued' : task.status,
          percent: task.status === 'downloading' ? 0 : task.percent,
          track: {
            ...task.track,
            audio_url: task.track.isLocal ? task.track.audio_url : task.track.preview_url || undefined
          }
        }));
      } catch {
        this.queue = [];
      }
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.processQueue());
    }
    queueMicrotask(() => this.processQueue());
  }

  public get tasks(): DownloadTask[] {
    return [...this.queue];
  }

  public subscribe(cb: DownloadProgressCallback) {
    this.listeners.add(cb);
    cb(this.tasks);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.persist();
    this.listeners.forEach(cb => cb(this.tasks));
  }

  private persist() {
    if (typeof localStorage === 'undefined') return;
    const active = this.queue.filter(task => ['queued', 'downloading', 'error', 'cancelled'].includes(task.status));
    const completed = this.queue.filter(task => task.status === 'completed').slice(-100);
    try {
      localStorage.setItem('spotmusic_download_queue_v2', JSON.stringify([...active, ...completed]));
    } catch (error) {
      console.warn('No se pudo persistir toda la cola de descargas:', error);
    }
  }

  public get isPaused() { return this.paused; }

  public setPaused(value: boolean) {
    this.paused = value;
    localStorage.setItem('spotmusic_downloads_paused', String(value));
    this.notify();
    if (!value) this.processQueue();
  }

  public get quality(): string {
    return localStorage.getItem('spotmusic_download_quality') || '320k';
  }

  public setQuality(q: string) {
    localStorage.setItem('spotmusic_download_quality', q);
  }

  public get downloadFolder(): string {
    return localStorage.getItem('spotmusic_download_folder') || 'SpotMusic';
  }

  public setDownloadFolder(folder: string) {
    if (!/^[a-zA-Z0-9 _-]{1,60}$/.test(folder)) throw new Error('Nombre de carpeta no válido');
    localStorage.setItem('spotmusic_download_folder', folder);
  }

  public async addDownload(track: Track): Promise<boolean> {
    const license = await licenseClient.checkLicense();
    if (!license.valid) {
      throw new Error('Se requiere una clave activa para descargas ilimitadas. Pulsa en Licencia arriba para activar.');
    }

    if (this.queue.some(t => t.track.id === track.id && ['downloading', 'queued'].includes(t.status))) {
      return false;
    }

    this.queue.push(this.createTask(track));
    this.notify();
    this.processQueue();
    return true;
  }

  private createTask(track: Track): DownloadTask {
    return { track, status: 'queued', percent: 0, quality: this.quality, attempts: 0 };
  }

  private async processQueue() {
    if (this.paused || this.activeCount >= this.maxConcurrency || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    const now = Date.now();
    const task = this.queue.find(item => item.status === 'queued' && (item.nextAttemptAt || 0) <= now);
    if (!task) {
      const next = this.queue
        .filter(item => item.status === 'queued' && item.nextAttemptAt)
        .sort((a, b) => (a.nextAttemptAt || 0) - (b.nextAttemptAt || 0))[0];
      if (next && !this.wakeTimer) {
        this.wakeTimer = setTimeout(() => {
          this.wakeTimer = null;
          this.processQueue();
        }, Math.max(250, (next.nextAttemptAt || now) - now));
      }
      return;
    }
    const wait = Math.max(0, this.minStartIntervalMs - (now - this.lastStartedAt));
    if (wait > 0) {
      if (!this.wakeTimer) {
        this.wakeTimer = setTimeout(() => {
          this.wakeTimer = null;
          this.processQueue();
        }, wait);
      }
      return;
    }
    this.lastStartedAt = Date.now();
    this.activeCount++;
    this.executeDownload(task).finally(() => {
      this.activeCount--;
      this.processQueue();
    });
  }

  public async addBatchDownloads(tracks: Track[]): Promise<number> {
    const license = await licenseClient.checkLicense();
    if (!license.valid) {
      throw new Error('Se requiere una clave de KeyForge activa para descargar playlists completas. Toca en Licencia arriba para activar.');
    }

    let queuedCount = 0;
    for (const track of tracks) {
      if (this.queue.some(task => task.track.id === track.id && ['downloading', 'queued'].includes(task.status))) continue;
      this.queue.push(this.createTask(track));
      queuedCount++;
    }
    this.notify();
    this.processQueue();
    return queuedCount;
  }

  private async executeDownload(task: DownloadTask) {
    const license = await licenseClient.checkLicense();
    if (!license.valid) {
      task.status = 'queued';
      task.error = 'Cola pausada: verifica o renueva la licencia de KeyForge para continuar.';
      this.paused = true;
      localStorage.setItem('spotmusic_downloads_paused', 'true');
      this.notify();
      return;
    }
    task.attempts = (task.attempts || 0) + 1;
    task.nextAttemptAt = undefined;
    task.error = undefined;
    task.status = 'downloading';
    task.percent = 10;
    this.notify();

    const track = task.track;
    let url = track.audio_url;

    // Resolve full audio stream if missing or preview (NEVER download 30s previews)
    const isPreview = !url || url.includes('apple.com') || url.includes('mzstatic') || url.includes('preview') || track.duration_ms === 30000;
    if (isPreview) {
      task.percent = 15;
      this.notify();
      try {
        const resolved = await streamResolver.resolveFullAudio(track.name, track.artists, track.duration_ms);
        if (resolved && resolved.source !== 'fallback' && resolved.durationMs > 40000) {
          url = resolved.audioUrl;
          track.audio_url = resolved.audioUrl;
          track.duration_ms = resolved.durationMs;
          track.duration_str = resolved.durationStr;
          track.format = resolved.format;
          if (resolved.coverUrl) track.cover_url = resolved.coverUrl;
        } else {
          this.failTask(task, 'No se encontró una coincidencia confiable para esta canción.', false);
          return;
        }
      } catch (err: any) {
        this.failTask(task, err.message || 'Audio completo no disponible', this.isTransientError(err));
        return;
      }
    }

    if (!url) {
      this.failTask(task, 'No se encontró archivo de audio para este tema', false);
      return;
    }

    if (this.isCancelled(task)) return;
    const ext = url.includes('.mp4') ? 'm4a' : 'mp3';
    const filename = `${track.artists.slice(0, 60)} - ${track.name.slice(0, 80)} - ${track.id}.${ext}`.replace(/[\/\\?%*:|"<>]/g, '_');
    const relPath = `${this.downloadFolder}/${filename}`;
    let localPath = '';
    let fileSizeStr = 'Full Audio';

    try {
      task.percent = 30;
      this.notify();

      if (Capacitor.isNativePlatform()) {
        const customDirectory = await storagePicker.getDirectory();
        let fileSize = 0;
        if (customDirectory.selected) {
          const result = await storagePicker.downloadFile(url, filename, percent => {
            if (!this.isCancelled(task)) {
              task.percent = Math.max(30, Math.min(80, 30 + Math.round(percent * 0.5)));
              this.notify();
            }
          });
          localPath = result.uri;
          fileSize = result.size;
        } else {
          const result = await Filesystem.downloadFile({ url, path: relPath, directory: Directory.Documents, recursive: true });
          if (!result.path) throw new Error('No se pudo guardar el archivo en el dispositivo');
          localPath = result.path;
          const stat = await Filesystem.stat({ path: relPath, directory: Directory.Documents });
          fileSize = stat.size;
        }
        if (!fileSize) throw new Error('El archivo descargado está vacío');
        fileSizeStr = (fileSize / 1048576).toFixed(1) + ' MB';
        if (this.isCancelled(task)) {
          if (customDirectory.selected) await storagePicker.deleteFile(localPath);
          else await Filesystem.deleteFile({ path: relPath, directory: Directory.Documents });
          return;
        }
      } else {
        const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
        if (!response.ok) throw new Error(`Descarga rechazada (HTTP ${response.status}). Intenta más tarde.`);
        const blob = await response.blob();
        if (!blob.size || /text|json/.test(blob.type)) throw new Error('El servidor no devolvió un archivo de audio');
        if (this.isCancelled(task)) return;
        await localLibrary.saveAudioBlob(track.id, blob);
        fileSizeStr = (blob.size / 1048576).toFixed(1) + ' MB';
      }
      task.percent = 85;
      this.notify();

      // Save to local offline library
      const localTrack: Track = {
        ...track,
        isLocal: true,
        localPath: localPath || undefined,
        audio_url: localPath || undefined,
        format: track.format || this.quality.toUpperCase(),
        size: fileSizeStr,
        addedAt: Date.now()
      };

      await localLibrary.saveTrack(localTrack);

      task.status = 'completed';
      task.percent = 100;
      this.notify();
    } catch (err: any) {
      if (this.isCancelled(task)) return;
      console.error('Download execution error:', err);
      this.failTask(task, err.message || 'Error en la descarga', this.isTransientError(err));
    }
  }

  private isTransientError(error: unknown): boolean {
    const message = String((error as any)?.message || error).toLowerCase();
    return /429|too many|rate|timeout|timed out|network|connection|503|502/.test(message);
  }

  private failTask(task: DownloadTask, message: string, retryable: boolean) {
    if (retryable && (task.attempts || 0) < 4) {
      const rateLimited = /429|too many|rate/i.test(message);
      const delay = rateLimited ? 60000 * (task.attempts || 1) : 10000 * Math.pow(2, (task.attempts || 1) - 1);
      task.status = 'queued';
      task.nextAttemptAt = Date.now() + delay;
      task.error = `Reintento automático en ${Math.ceil(delay / 1000)} s: ${message}`;
    } else {
      task.status = 'error';
      task.error = message;
    }
    this.notify();
  }

  private isCancelled(task: DownloadTask): boolean { return task.status === 'cancelled'; }

  public cancel(trackId: string) {
    const task = this.queue.find(t => t.track.id === trackId && ['queued', 'downloading'].includes(t.status));
    if (task && ['queued', 'downloading'].includes(task.status)) {
      task.status = 'cancelled';
      this.notify();
    }
  }

  public clearFinished() {
    this.queue = this.queue.filter(t => ['downloading', 'queued'].includes(t.status));
    this.notify();
  }

  public retry(trackId: string) {
    const task = this.queue.find(item => item.track.id === trackId && ['error', 'cancelled'].includes(item.status));
    if (!task) return;
    task.status = 'queued';
    task.percent = 0;
    task.error = undefined;
    task.nextAttemptAt = undefined;
    task.attempts = 0;
    this.notify();
    this.processQueue();
  }
}

export const downloadEngine = new DownloadEngine();
