import { Filesystem, Directory } from '@capacitor/filesystem';
import { Track, DownloadTask } from '../types';
import { localLibrary } from './localLibrary';
import { licenseClient } from './licenseClient';

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

  public async addDownload(track: Track): Promise<boolean> {
    const license = await licenseClient.checkLicense();
    if (!license.valid) {
      throw new Error('Se requiere una licencia activa de KeyForge Pro para descargar música.');
    }

    if (this.queue.some(t => t.track.id === track.id && ['downloading', 'queued'].includes(t.status))) {
      return false;
    }

    const task: DownloadTask = {
      track,
      status: 'queued',
      percent: 0
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

  private async executeDownload(task: DownloadTask) {
    task.status = 'downloading';
    task.percent = 10;
    this.notify();

    const track = task.track;
    const url = track.audio_url || track.preview_url;

    if (!url) {
      task.status = 'error';
      task.error = 'No se encontró enlace de descarga para este tema';
      this.notify();
      return;
    }

    try {
      // Simulate/stream audio file download
      task.percent = 30;
      this.notify();

      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      task.percent = 60;
      this.notify();

      const blob = await response.blob();
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

      task.percent = 85;
      this.notify();

      const filename = `${track.artists} - ${track.name}.mp3`.replace(/[\/\\?%*:|"<>]/g, '_');
      let localPath = '';

      try {
        // Attempt saving to device filesystem
        const writeRes = await Filesystem.writeFile({
          path: `SpotMusic/${filename}`,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true
        });
        localPath = writeRes.uri;
      } catch (fsErr) {
        console.warn('Filesystem write notice, keeping in app library:', fsErr);
        localPath = URL.createObjectURL(blob);
      }

      // Save to local offline library
      const localTrack: Track = {
        ...track,
        isLocal: true,
        localPath: localPath || url,
        audio_url: localPath || url,
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
