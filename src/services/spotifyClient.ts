import { Track, Playlist } from '../types';

export interface SearchResults {
  tracks: Track[];
  albums: any[];
  playlists: any[];
}

class SpotifyClient {
  private itunesCache: Map<string, string> = new Map();

  // Clean Spotify / YouTube URLs
  public parseUrl(url: string): { type: 'playlist' | 'album' | 'track' | null; id: string | null } {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const type = parts[0] as 'playlist' | 'album' | 'track';
        const id = parts[1].split('?')[0];
        if (['playlist', 'album', 'track'].includes(type)) {
          return { type, id };
        }
      }
    } catch (e) {}
    return { type: null, id: null };
  }

  // Resolve 600x600 HD artwork via iTunes Search API (fast, open, no auth)
  public async resolveCoverArt(artist: string, title: string): Promise<string> {
    const cacheKey = `${artist} - ${title}`.toLowerCase();
    if (this.itunesCache.has(cacheKey)) {
      return this.itunesCache.get(cacheKey)!;
    }

    try {
      const q = encodeURIComponent(`${artist} ${title}`);
      const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
          const rawArt = data.results[0].artworkUrl100 || '';
          const hdArt = rawArt.replace('100x100bb', '600x600bb');
          if (hdArt) {
            this.itunesCache.set(cacheKey, hdArt);
            return hdArt;
          }
        }
      }
    } catch (e) {
      console.warn('Cover art fetch warning:', e);
    }
    return '';
  }

  // Search catalog across iTunes and open audio databases
  public async search(query: string): Promise<SearchResults> {
    const q = query.trim();
    if (!q) return { tracks: [], albums: [], playlists: [] };

    try {
      const encoded = encodeURIComponent(q);
      const res = await fetch(`https://itunes.apple.com/search?term=${encoded}&entity=song&limit=35`);
      if (!res.ok) throw new Error(`Search failed: HTTP ${res.status}`);

      const data = await res.json();
      const tracks: Track[] = (data.results || []).map((item: any) => {
        const cover = (item.artworkUrl100 || '').replace('100x100bb', '600x600bb');
        const durMs = item.trackTimeMillis || 180000;
        const mins = Math.floor(durMs / 60000);
        const secs = Math.floor((durMs % 60000) / 1000);

        return {
          id: `itunes-${item.trackId || Math.random().toString(36).slice(2)}`,
          name: item.trackName || 'Canción',
          artists: item.artistName || 'Artista desconocido',
          album: item.collectionName || 'Sencillo',
          duration_ms: durMs,
          duration_str: `${mins}:${secs.toString().padStart(2, '0')}`,
          cover_url: cover,
          preview_url: item.previewUrl || null,
          audio_url: item.previewUrl || null,
          format: 'MP3'
        };
      });

      // Group distinct albums
      const albumMap = new Map<string, any>();
      tracks.forEach(t => {
        if (!albumMap.has(t.album)) {
          albumMap.set(t.album, {
            id: 'alb-' + t.album,
            name: t.album,
            artist: t.artists,
            cover_url: t.cover_url,
            trackCount: 1
          });
        }
      });

      return {
        tracks,
        albums: Array.from(albumMap.values()).slice(0, 10),
        playlists: []
      };
    } catch (err: any) {
      console.error('Catalog search error:', err);
      return { tracks: [], albums: [], playlists: [] };
    }
  }

  // Recommendations based on seed artist/track
  public async getRecommendations(seedQuery: string): Promise<Track[]> {
    try {
      const q = encodeURIComponent(seedQuery);
      const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=15`);
      if (res.ok) {
        const data = await res.json();
        return (data.results || []).map((item: any) => {
          const cover = (item.artworkUrl100 || '').replace('100x100bb', '600x600bb');
          const durMs = item.trackTimeMillis || 180000;
          const mins = Math.floor(durMs / 60000);
          const secs = Math.floor((durMs % 60000) / 1000);

          return {
            id: `rec-${item.trackId}`,
            name: item.trackName,
            artists: item.artistName,
            album: item.collectionName || 'Álbum',
            duration_ms: durMs,
            duration_str: `${mins}:${secs.toString().padStart(2, '0')}`,
            cover_url: cover,
            preview_url: item.previewUrl || null,
            audio_url: item.previewUrl || null,
            format: 'MP3'
          };
        });
      }
    } catch (e) {}
    return [];
  }
}

export const spotifyClient = new SpotifyClient();
