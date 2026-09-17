import { CapacitorHttp } from '@capacitor/core';
import { Track, Playlist } from '../types';

export interface SearchResults {
  tracks: Track[];
  albums: any[];
  playlists: any[];
}

export interface SpotifyPlaylistResult {
  id: string;
  type: 'playlist' | 'album' | 'track';
  name: string;
  description: string;
  cover_url: string;
  owner: string;
  total_tracks: number;
  tracks: Track[];
  partial?: boolean;
}

class SpotifyClient {
  private itunesCache: Map<string, string> = new Map();
  private accessToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('spotmusic_spotify_access_token') || '' : '';

  public setAccessToken(token: string) {
    this.accessToken = token.trim();
    if (typeof sessionStorage !== 'undefined') {
      if (this.accessToken) sessionStorage.setItem('spotmusic_spotify_access_token', this.accessToken);
      else sessionStorage.removeItem('spotmusic_spotify_access_token');
    }
  }

  public get hasAccessToken() { return !!this.accessToken; }

  // Extract Spotify info from URL or URI
  public extractSpotifyInfo(input: string): { type: 'playlist' | 'album' | 'track'; id: string } | null {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim();

    // Match playlist: /playlist/{id} or spotify:playlist:{id}
    const plMatch = clean.match(/playlist[\/:]([a-zA-Z0-9]+)/);
    if (plMatch) return { type: 'playlist', id: plMatch[1] };

    // Match album: /album/{id} or spotify:album:{id}
    const albMatch = clean.match(/album[\/:]([a-zA-Z0-9]+)/);
    if (albMatch) return { type: 'album', id: albMatch[1] };

    // Match track: /track/{id} or spotify:track:{id}
    const trMatch = clean.match(/track[\/:]([a-zA-Z0-9]+)/);
    if (trMatch) return { type: 'track', id: trMatch[1] };

    // Raw 22-character Spotify ID
    if (/^[a-zA-Z0-9]{22}$/.test(clean)) {
      return { type: 'playlist', id: clean };
    }

    return null;
  }

  // Fetch Spotify Playlist / Album / Track directly from public embed
  public async fetchSpotifyEntity(inputUrl: string): Promise<SpotifyPlaylistResult> {
    const info = this.extractSpotifyInfo(inputUrl);
    if (!info) {
      throw new Error('El enlace no es válido. Ingresa un enlace de Spotify (ej: https://open.spotify.com/playlist/...)');
    }

    if (this.accessToken) {
      try {
        return await this.fetchOfficialEntity(info, inputUrl);
      } catch (error: any) {
        if (/401/.test(error?.message || '')) this.setAccessToken('');
        else throw error;
      }
    }

    const embedUrl = `https://open.spotify.com/embed/${info.type}/${info.id}`;
    let html = '';

    try {
      // Use native CapacitorHttp to bypass any CORS restrictions on Android
      const res = await CapacitorHttp.get({
        url: embedUrl,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
        }
      });
      html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
    } catch (httpErr) {
      // Fallback to fetch
      const r = await fetch(embedUrl);
      html = await r.text();
    }

    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
    if (!match) {
      throw new Error('No se pudieron extraer los datos de Spotify. Asegúrate de que la playlist sea pública.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(match[1]);
    } catch (e: any) {
      throw new Error('Error al decodificar la información de Spotify: ' + e.message);
    }

    const entity = parsed.props?.pageProps?.state?.data?.entity;
    if (!entity) {
      throw new Error('No se encontró información para este enlace de Spotify.');
    }

    const coverUrl = entity.coverArt?.sources?.[0]?.url || entity.visualIdentity?.image?.[0]?.url || '';
    const trackList = entity.trackList || (entity.tracks ? entity.tracks.items : []) || [];

    const tracks: Track[] = trackList.map((t: any, idx: number) => {
      const trackId = t.id || (t.uri ? t.uri.split(':')[2] : null) || `sp-${info.id}-${idx}`;
      const durMs = t.duration || t.duration_ms || 180000;
      const mins = Math.floor(durMs / 60000);
      const secs = Math.floor((durMs % 60000) / 1000);

      const artistName = t.subtitle || (t.artists ? (Array.isArray(t.artists) ? t.artists.map((a: any) => a.name).join(', ') : t.artists) : 'Desconocido');
      const trackName = t.title || t.name || 'Canción sin título';
      const preview = t.audioPreview?.url || t.preview_url || null;

      return {
        id: `spotify-${trackId}`,
        name: trackName,
        artists: artistName,
        album: entity.name || entity.title || 'Spotify Playlist',
        duration_ms: durMs,
        duration_str: `${mins}:${secs.toString().padStart(2, '0')}`,
        cover_url: t.thumbnail || coverUrl,
        preview_url: preview,
        audio_url: preview,
        format: 'MP3'
      };
    });

    return {
      id: info.id,
      type: info.type,
      name: entity.name || entity.title || 'Playlist de Spotify',
      description: entity.subtitle || entity.description || '',
      cover_url: coverUrl,
      owner: (entity.authors && entity.authors[0]?.name) || 'Spotify',
      total_tracks: tracks.length,
      tracks,
      partial: false
    };
  }

  private async spotifyApi(path: string, attempt = 0): Promise<any> {
    const response = await CapacitorHttp.get({
      url: `https://api.spotify.com/v1${path}`,
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json' },
      connectTimeout: 15000,
      readTimeout: 30000
    });
    if (response.status === 429 && attempt < 2) {
      const retry = Number(response.headers?.['retry-after'] || response.headers?.['Retry-After'] || 2);
      await new Promise(resolve => setTimeout(resolve, Math.min(60000, Math.max(1000, retry * 1000))));
      return this.spotifyApi(path, attempt + 1);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Spotify API respondió HTTP ${response.status}`);
    }
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }

  private mapOfficialTrack(raw: any, fallbackCover: string, fallbackAlbum: string): Track | null {
    const item = raw?.item || raw?.track || raw;
    if (!item || item.type !== 'track' || !item.id) return null;
    const duration = Number(item.duration_ms) || 0;
    return {
      id: `spotify-${item.id}`,
      name: item.name || 'Canción sin título',
      artists: Array.isArray(item.artists) ? item.artists.map((artist: any) => artist.name).filter(Boolean).join(', ') : 'Artista desconocido',
      album: item.album?.name || fallbackAlbum,
      duration_ms: duration,
      duration_str: `${Math.floor(duration / 60000)}:${Math.floor((duration % 60000) / 1000).toString().padStart(2, '0')}`,
      cover_url: item.album?.images?.[0]?.url || fallbackCover,
      preview_url: item.preview_url || null,
      audio_url: item.preview_url || undefined,
      format: item.preview_url ? 'Preview Spotify' : 'Pendiente de resolver',
      externalUrl: item.external_urls?.spotify,
      isrc: item.external_ids?.isrc
    };
  }

  private async fetchOfficialEntity(
    info: { type: 'playlist' | 'album' | 'track'; id: string },
    sourceUrl: string
  ): Promise<SpotifyPlaylistResult> {
    if (info.type === 'track') {
      const item = await this.spotifyApi(`/tracks/${info.id}`);
      const track = this.mapOfficialTrack(item, item.album?.images?.[0]?.url || '', item.album?.name || 'Spotify');
      if (!track) throw new Error('Spotify no devolvió una canción válida.');
      return {
        id: info.id, type: 'track', name: track.name, description: '', cover_url: track.cover_url,
        owner: track.artists, total_tracks: 1, tracks: [track]
      };
    }

    const entity = await this.spotifyApi(`/${info.type}s/${info.id}`);
    const cover = entity.images?.[0]?.url || '';
    const tracks: Track[] = [];
    let offset = 0;
    const limit = 50;
    let total = Number(entity.items?.total ?? entity.tracks?.total ?? entity.total_tracks ?? 0);
    do {
      const endpoint = info.type === 'playlist'
        ? `/playlists/${info.id}/items?limit=${limit}&offset=${offset}&additional_types=track`
        : `/albums/${info.id}/tracks?limit=${limit}&offset=${offset}`;
      const page = await this.spotifyApi(endpoint);
      total = Number(page.total ?? total);
      for (const raw of page.items || []) {
        const track = this.mapOfficialTrack(raw, cover, entity.name || 'Spotify');
        if (track) tracks.push(track);
      }
      offset += page.items?.length || 0;
      if (!page.next || !page.items?.length) break;
    } while (offset < total);

    return {
      id: info.id,
      type: info.type,
      name: entity.name || 'Playlist de Spotify',
      description: entity.description || '',
      cover_url: cover,
      owner: entity.owner?.display_name || entity.artists?.map((artist: any) => artist.name).join(', ') || 'Spotify',
      total_tracks: total || tracks.length,
      tracks,
      partial: tracks.length < total
    };
  }

  // Clean Spotify / YouTube URLs
  public parseUrl(url: string): { type: 'playlist' | 'album' | 'track' | null; id: string | null } {
    const info = this.extractSpotifyInfo(url);
    if (info) return info;
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

  // Search catalog across iTunes and open audio databases, or auto-fetch Spotify links
  public async search(query: string): Promise<SearchResults> {
    const q = query.trim();
    if (!q) return { tracks: [], albums: [], playlists: [] };

    // Auto-detect Spotify playlist / album links
    if (q.includes('spotify.com') || q.startsWith('spotify:')) {
      try {
        const sp = await this.fetchSpotifyEntity(q);
        return {
          tracks: sp.tracks,
          albums: [],
          playlists: [{
            id: sp.id,
            name: sp.name,
            owner: sp.owner,
            cover_url: sp.cover_url,
            trackCount: sp.total_tracks
          }]
        };
      } catch (err) {
        console.warn('Spotify direct link auto-fetch warning:', err);
      }
    }

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
