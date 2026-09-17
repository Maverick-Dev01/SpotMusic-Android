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

    // Resolve full audio stream if missing or preview
    if (!url || url.includes('apple.com') || url.includes('mzstatic') || url.includes('preview') || track.duration_ms === 30000) {
      try {
        const resolved = await streamResolver.resolveFullAudio(track.name, track.artists);
        if (resolved) {
          url = resolved.audioUrl;
          track.audio_url = resolved.audioUrl;
          track.duration_ms = resolved.durationMs;
          track.duration_str = resolved.durationStr;
          track.format = resolved.format;
          if (resolved.coverUrl) track.cover_url = resolved.coverUrl;
        }
      } catch (err) {
        console.warn('Stream resolver error during download:', err);
      }
    }

    if (!url) {
      task.status = 'error';
      task.error = 'No se encontró archivo de audio para este tema';
      this.notify();
      return;
    }

    try {
      task.percent = 30;
      this.notify();

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      task.percent = 60;
      this.notify();

      const blob = await response.blob();
      
      // Save Blob directly to IndexedDB for instant, zero-CORS offline playback
      await localLibrary.saveAudioBlob(track.id, blob);

      task.percent = 80;
      this.notify();

      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const res = reader.result as string;
          const base64 = res.split(',')[1] || res;
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      task.percent = 90;
      this.notify();

      const ext = url.includes('.mp4') ? 'm4a' : 'mp3';
      const filename = `${track.artists} - ${track.name}.${ext}`.replace(/[\/\\?%*:|"<>]/g, '_');
      let localPath = '';

      try {
        const writeRes = await Filesystem.writeFile({
          path: `${this.downloadFolder}/${filename}`,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true
        });
        localPath = writeRes.uri;
      } catch (fsErr) {
        console.warn('Filesystem write notice, saved in offline IndexedDB:', fsErr);
      }

      // Save to local offline library
      const localTrack: Track = {
        ...track,
        isLocal: true,
        localPath: localPath || url,
        audio_url: localPath || url,
        format: track.format || this.quality.toUpperCase(),
        size: (blob.size / (1024 * 1024)).toFixed(1) + ' MB',
        addedAt: Date.now()
      };

      await localLibrary.saveTrack(localTrack);

      task.status = 'completed';
      task.percent = 100;
      this.notify();
    } catch (err: any) {
      console.error('Download error:', err);
      task.status = 'error';
      task.error = err.message || 'Error en la descarga';
      this.notify();
    }
  }

  public cancel(trackId: string) {
    const task = this.queue.find(t => t.track.id === trackId);
    if (task) {
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
