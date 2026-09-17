import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Track, DownloadTask } from '../types';
import { localLibrary } from './localLibrary';
import { licenseClient } from './licenseClient';
import { streamResolver } from './streamResolver';

type DownloadProgressCallback = (tasks: DownloadTask[]) => void;

class DownloadEngine {
  private queue: DownloadTask[] = [];
  private activeCount = 0;
  private maxConcurrency = 2;
  private listeners: Set<DownloadProgressCallback> = new Set();

  public get tasks(): DownloadTask[] {
    return [...this.queue];
  }

  public subscribe(cb: DownloadProgressCallback) {
    this.listeners.add(cb);
    cb(this.tasks);
    return () => this.listeners.delete(cb);
  }

  private notify() {
    this.listeners.forEach(cb => cb(this.tasks));
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

    const task: DownloadTask = {
      track,
      status: 'queued',
      percent: 0,
      quality: this.quality
    };

    this.queue.push(task);
    this.notify();
    this.processQueue();
    return true;
  }

  private async processQueue() {
    while (this.activeCount < this.maxConcurrency) {
      const task = this.queue.find(t => t.status === 'queued');
      if (!task) break;

      this.activeCount++;
      this.executeDownload(task).finally(() => {
        this.activeCount--;
        this.processQueue();
      });
    }
  }

  public async addBatchDownloads(tracks: Track[]): Promise<number> {
    const license = await licenseClient.checkLicense();
    if (!license.valid) {
      throw new Error('Se requiere una clave de KeyForge activa para descargar playlists completas. Toca en Licencia arriba para activar.');
    }

    let queuedCount = 0;
    for (const track of tracks) {
      const added = await this.addDownload(track);
      if (added) queuedCount++;
    }
    return queuedCount;
  }

  private async executeDownload(task: DownloadTask) {
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
        const resolved = await streamResolver.resolveFullAudio(track.name, track.artists);
        if (resolved && resolved.source !== 'fallback' && resolved.durationMs > 40000) {
          url = resolved.audioUrl;
          track.audio_url = resolved.audioUrl;
          track.duration_ms = resolved.durationMs;
          track.duration_str = resolved.durationStr;
          track.format = resolved.format;
          if (resolved.coverUrl) track.cover_url = resolved.coverUrl;
        } else {
          task.status = 'error';
          task.error = 'No se encontró la canción completa para descargar (solo disponible en streaming)';
          this.notify();
          return;
        }
      } catch (err: any) {
        task.status = 'error';
        task.error = err.message || 'Audio completo no disponible';
        this.notify();
        return;
      }
    }

    if (!url) {
      task.status = 'error';
      task.error = 'No se encontró archivo de audio para este tema';
      this.notify();
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
        const result = await Filesystem.downloadFile({ url, path: relPath, directory: Directory.Documents, recursive: true });
        if (!result.path) throw new Error('No se pudo guardar el archivo en el dispositivo');
        localPath = result.path;
        const stat = await Filesystem.stat({ path: relPath, directory: Directory.Documents });
        if (!stat.size) throw new Error('El archivo descargado está vacío');
        fileSizeStr = (stat.size / 1048576).toFixed(1) + ' MB';
        if (this.isCancelled(task)) {
          await Filesystem.deleteFile({ path: relPath, directory: Directory.Documents });
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
      task.status = 'error';
      task.error = err.message || 'Error en la descarga';
      this.notify();
    }
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
}

export const downloadEngine = new DownloadEngine();
