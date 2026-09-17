import { Track, Playlist } from '../types';

const DB_NAME = 'SpotMusicDB';
const DB_VERSION = 1;

class LocalLibrary {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<IDBDatabase>;

  constructor() {
    this.initPromise = this.openDB();
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('tracks')) {
          const trackStore = db.createObjectStore('tracks', { keyPath: 'id' });
          trackStore.createIndex('artists', 'artists', { unique: false });
          trackStore.createIndex('album', 'album', { unique: false });
          trackStore.createIndex('isFavorite', 'isFavorite', { unique: false });
          trackStore.createIndex('addedAt', 'addedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('playlists')) {
          db.createObjectStore('playlists', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('history')) {
          const histStore = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
          histStore.createIndex('playedAt', 'playedAt', { unique: false });
        }
      };

      req.onsuccess = () => {
        this.db = req.result;
        resolve(req.result);
      };

      req.onerror = () => {
        reject(req.error);
      };
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return this.initPromise;
  }

  // Track operations
  public async saveTrack(track: Track): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      const store = tx.objectStore('tracks');
      track.addedAt = track.addedAt || Date.now();
      store.put(track);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getAllTracks(): Promise<Track[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readonly');
      const store = tx.objectStore('tracks');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async deleteTrack(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      const store = tx.objectStore('tracks');
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async toggleFavorite(track: Track): Promise<boolean> {
    const db = await this.getDB();
    return new Promise(async (resolve, reject) => {
      const tx = db.transaction('tracks', 'readwrite');
      const store = tx.objectStore('tracks');
      const getReq = store.get(track.id);

      getReq.onsuccess = () => {
        const existing = getReq.result || { ...track };
        existing.isFavorite = !existing.isFavorite;
        store.put(existing);
        tx.oncomplete = () => resolve(existing.isFavorite);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  public async getFavorites(): Promise<Track[]> {
    const all = await this.getAllTracks();
    return all.filter(t => t.isFavorite);
  }

  // Playlists
  public async createPlaylist(name: string, description = ''): Promise<Playlist> {
    const db = await this.getDB();
    const playlist: Playlist = {
      id: 'pl-' + Date.now(),
      name,
      description,
      trackCount: 0,
      tracks: []
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('playlists', 'readwrite');
      const store = tx.objectStore('playlists');
      store.put(playlist);
      tx.oncomplete = () => resolve(playlist);
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getAllPlaylists(): Promise<Playlist[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('playlists', 'readonly');
      const store = tx.objectStore('playlists');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  public async addTrackToPlaylist(playlistId: string, track: Track): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('playlists', 'readwrite');
      const store = tx.objectStore('playlists');
      const req = store.get(playlistId);

      req.onsuccess = () => {
        const pl: Playlist = req.result;
        if (pl) {
          if (!pl.tracks.some(t => t.id === track.id)) {
            pl.tracks.push(track);
            pl.trackCount = pl.tracks.length;
            if (!pl.cover_url && track.cover_url) pl.cover_url = track.cover_url;
            store.put(pl);
          }
        }
        tx.oncomplete = () => resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async removeTrackFromPlaylist(playlistId: string, trackId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('playlists', 'readwrite');
      const store = tx.objectStore('playlists');
      const req = store.get(playlistId);

      req.onsuccess = () => {
        const pl: Playlist = req.result;
        if (pl) {
          pl.tracks = pl.tracks.filter(t => t.id !== trackId);
          pl.trackCount = pl.tracks.length;
          store.put(pl);
        }
        tx.oncomplete = () => resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async deletePlaylist(playlistId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('playlists', 'readwrite');
      const store = tx.objectStore('playlists');
      store.delete(playlistId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async renamePlaylist(playlistId: string, newName: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('playlists', 'readwrite');
      const store = tx.objectStore('playlists');
      const req = store.get(playlistId);

      req.onsuccess = () => {
        const pl: Playlist = req.result;
        if (pl) {
          pl.name = newName.trim() || pl.name;
          store.put(pl);
        }
        tx.oncomplete = () => resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  public async reorderPlaylist(playlistId: string, fromIndex: number, toIndex: number): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('playlists', 'readwrite');
      const store = tx.objectStore('playlists');
      const req = store.get(playlistId);

      req.onsuccess = () => {
        const pl: Playlist = req.result;
        if (pl && fromIndex >= 0 && toIndex >= 0 && fromIndex < pl.tracks.length && toIndex < pl.tracks.length) {
          const [moved] = pl.tracks.splice(fromIndex, 1);
          pl.tracks.splice(toIndex, 0, moved);
          store.put(pl);
        }
        tx.oncomplete = () => resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  // Scan device folders for offline music files
  public async scanDeviceAudio(): Promise<Track[]> {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const scannedTracks: Track[] = [];
    const validExtensions = ['.mp3', '.m4a', '.flac', '.wav', '.ogg', '.opus', '.aac'];

    const searchDirs = [
      { dir: Directory.Documents, path: 'SpotMusic' },
      { dir: Directory.Documents, path: '' }
    ];

    for (const location of searchDirs) {
      try {
        const res = await Filesystem.readdir({
          directory: location.dir,
          path: location.path
        });

        for (const file of res.files) {
          const fileName = typeof file === 'string' ? file : file.name;
          const ext = '.' + fileName.split('.').pop()?.toLowerCase();
          if (validExtensions.includes(ext)) {
            const filePath = location.path ? `${location.path}/${fileName}` : fileName;
            const uriRes = await Filesystem.getUri({
              directory: location.dir,
              path: filePath
            });

            // Extract Artist - Title
            const baseName = fileName.replace(ext, '');
            let artist = 'Audio Local';
            let title = baseName;
            if (baseName.includes(' - ')) {
              const parts = baseName.split(' - ');
              artist = parts[0].trim();
              title = parts.slice(1).join(' - ').trim();
            }

            const track: Track = {
              id: 'local-' + btoa(encodeURIComponent(filePath)).replace(/[/+=]/g, ''),
              name: title,
              artists: artist,
              album: 'Música en Dispositivo',
              duration_ms: 180000,
              duration_str: '--:--',
              cover_url: '',
              isLocal: true,
              localPath: uriRes.uri,
              audio_url: uriRes.uri,
              format: ext.replace('.', '').toUpperCase(),
              addedAt: Date.now()
            };

            await this.saveTrack(track);
            scannedTracks.push(track);
          }
        }
      } catch (e) {
        // Directory may not exist yet, continue
      }
    }

    return scannedTracks;
  }

  // History
  public async logHistory(track: Track): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('history', 'readwrite');
      const store = tx.objectStore('history');
      store.add({
        track,
        playedAt: Date.now()
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  public async getRecentHistory(limit = 30): Promise<Track[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('history', 'readonly');
      const store = tx.objectStore('history');
      const index = store.index('playedAt');
      const req = index.openCursor(null, 'prev');
      const results: Track[] = [];
      const seenIds = new Set<string>();

      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest).result;
        if (cursor && results.length < limit) {
          const item = cursor.value;
          if (!seenIds.has(item.track.id)) {
            seenIds.add(item.track.id);
            results.push(item.track);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }
}

export const localLibrary = new LocalLibrary();
