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

    const ext = url.includes('.mp4') ? 'm4a' : 'mp3';
    const filename = `${track.artists} - ${track.name}.${ext}`.replace(/[\/\\?%*:|"<>]/g, '_');
    const relPath = `${this.downloadFolder}/${filename}`;
    let localPath = '';
    let fileSizeStr = 'Full Audio';

    try {
      task.percent = 30;
      this.notify();

      // 1. Download file directly to device storage using Capacitor Filesystem native download
      try {
        const dlResult = await Filesystem.downloadFile({
          url,
          path: relPath,
          directory: Directory.Documents,
          recursive: true
        });
        if (dlResult && dlResult.path) {
          localPath = dlResult.path;
        }
      } catch (dlErr) {
        console.warn('Filesystem.downloadFile notice:', dlErr);
      }

      task.percent = 60;
      this.notify();

      // 2. Fetch or create blob to store in IndexedDB for 100% offline instant playback
      try {
        let blob: Blob | null = null;
        try {
          const resp = await fetch(url);
          if (resp.ok) {
            blob = await resp.blob();
          }
        } catch {}

        if (!blob && localPath) {
          try {
            const fileData = await Filesystem.readFile({
              path: relPath,
              directory: Directory.Documents
            });
            if (fileData && typeof fileData.data === 'string') {
              const byteCharacters = atob(fileData.data);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              blob = new Blob([byteArray], { type: ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg' });
            }
          } catch {}
        }

        if (blob) {
          await localLibrary.saveAudioBlob(track.id, blob);
          fileSizeStr = (blob.size / (1024 * 1024)).toFixed(1) + ' MB';
        }
      } catch (blobErr) {
        console.warn('Audio blob cache notice:', blobErr);
      }

      task.percent = 85;
      this.notify();

      if (!localPath) {
        const uriRes = await Filesystem.getUri({
          path: relPath,
          directory: Directory.Documents
        }).catch(() => null);
        if (uriRes) localPath = uriRes.uri;
      }

      // Save to local offline library
      const localTrack: Track = {
        ...track,
        isLocal: true,
        localPath: localPath || url,
        audio_url: localPath || url,
        format: track.format || this.quality.toUpperCase(),
        size: fileSizeStr,
        addedAt: Date.now()
      };

      await localLibrary.saveTrack(localTrack);

      task.status = 'completed';
      task.percent = 100;
      this.notify();
    } catch (err: any) {
      console.error('Download execution error:', err);
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
