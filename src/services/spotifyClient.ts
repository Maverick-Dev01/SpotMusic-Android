import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Track, Playlist } from '../types';
import { rankSearchResults } from './searchRanking';

// KeyForge reads the Spotify embed server side and returns it with CORS, which is
// the only way a browser build can import a playlist.
const PLAYLIST_ENDPOINTS = [
  '/api/playlist',
  'https://license-eight-ruby.vercel.app/api/playlist',
  'http://localhost:3000/api/playlist',
];

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

    // A linked account unlocks every page of the playlist, but it is an upgrade,
    // never a requirement: without it the public embed still returns the list.
    if (this.accessToken) {
      try {
        return await this.fetchOfficialEntity(info, inputUrl);
      } catch (error: any) {
        const message = error?.message || '';
        // An explicit denial has to stay visible: silently serving the partial
        // public view instead would hide that the account cannot see this list.
        if (/401|403/.test(message)) {
          if (/401/.test(message)) this.setAccessToken('');
          throw error;
        }
        console.warn('Spotify API import failed, falling back to the public reader:', message);
      }
    }

    try {
      return await this.fetchEmbedEntity(info);
    } catch (embedError: any) {
      // Browsers (the iOS PWA, any web build) cannot read open.spotify.com
      // directly because it sends no CORS headers. KeyForge reads it for them.
      const viaServer = await this.fetchEntityFromServer(inputUrl);
      if (viaServer) return viaServer;
      throw embedError;
    }
  }

  private async fetchEntityFromServer(inputUrl: string): Promise<SpotifyPlaylistResult | null> {
    for (const endpoint of PLAYLIST_ENDPOINTS) {
      try {
        const url = `${endpoint}?url=${encodeURIComponent(inputUrl)}`;
        let data: any = null;
        if (Capacitor?.isNativePlatform?.() && Capacitor.getPlatform() === 'android') {
          const res = await CapacitorHttp.get({ url, connectTimeout: 15000, readTimeout: 20000 });
          if (res.status === 200) data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        } else {
          const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
          if (res.ok) data = await res.json();
        }
        if (data?.success && Array.isArray(data.tracks) && data.tracks.length) {
          return {
            id: data.id,
            type: data.type,
            name: data.name,
            description: data.description || '',
            cover_url: data.cover_url || '',
            owner: data.owner || 'Spotify',
            total_tracks: Number(data.total_tracks) || data.tracks.length,
            tracks: data.tracks as Track[],
            partial: !!data.partial,
          };
        }
      } catch {}
    }
    return null;
  }

  private async fetchEmbedEntity(info: { type: 'playlist' | 'album' | 'track'; id: string }): Promise<SpotifyPlaylistResult> {
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
        audio_url: undefined,
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
      total_tracks: Number(entity.totalTracks ?? entity.tracks?.total ?? entity.trackCount) || tracks.length,
      tracks,
      partial: info.type !== 'track'
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
      if (response.status === 401) throw new Error('La sesión de Spotify venció (401). Vuelve a intentar la importación para renovar el acceso.');
      if (response.status === 403) throw new Error('Spotify rechazó el acceso (403). Si la aplicación está en modo desarrollo, el administrador debe autorizar tu cuenta en Spotify Developer. Revisa también que tengas permiso para acceder a esta playlist.');
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
      audio_url: undefined,
      format: 'Audio Completo',
      externalUrl: item.external_urls?.spotify,
      isrc: item.external_ids?.isrc,
      popularity: typeof item.popularity === 'number' ? item.popularity : undefined
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
      if (!Array.isArray(page.items)) throw new Error('Spotify devolvió una página de canciones inválida. Intenta importar de nuevo.');
      total = Number(page.total ?? total);
      for (const raw of page.items || []) {
        const track = this.mapOfficialTrack(raw, cover, entity.name || 'Spotify');
        if (track) tracks.push(track);
      }
      offset += page.items?.length || 0;
      if (!page.next) break;
      if (!page.items.length) throw new Error('Spotify interrumpió la importación antes de terminar. Intenta nuevamente.');
    } while (true);

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

  private searchCache: Map<string, { timestamp: number; data: SearchResults }> = new Map();

  // Search catalog across Spotify Web API and iTunes with 0ms in-memory cache
  public async search(query: string): Promise<SearchResults> {
    const q = query.trim();
    if (!q) return { tracks: [], albums: [], playlists: [] };

    // 0. Instant Cache Hit
    const cacheKey = q.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return cached.data;
    }

    // Auto-detect Spotify playlist / album links
    if (q.includes('spotify.com') || q.startsWith('spotify:')) {
      try {
        const sp = await this.fetchSpotifyEntity(q);
        const result: SearchResults = {
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
        this.searchCache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
      } catch (err) {
        console.warn('Spotify direct link auto-fetch warning:', err);
      }
    }

    // 1. Try Spotify Web API
    let spotifyResults: SearchResults | undefined;
    const token = this.accessToken;
    if (token) {
      try {
        const encoded = encodeURIComponent(q);
        const res = await CapacitorHttp.get({
          url: `https://api.spotify.com/v1/search?q=${encoded}&type=track,album&limit=10`,
          headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'SpotMusic-Android/1.0'
          },
          connectTimeout: 3500,
          readTimeout: 3500
        });

        let data = res.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch {}
        }

        if (data && (data.tracks?.items?.length || data.albums?.items?.length)) {
          const tracks: Track[] = (data.tracks?.items || []).map((t: any) => {
            const artists = (t.artists || []).map((a: any) => a.name).join(', ') || 'Artista desconocido';
            const durMs = t.duration_ms || 180000;
            const mins = Math.floor(durMs / 60000);
            const secs = Math.floor((durMs % 60000) / 1000);
            return {
              id: `sp-${t.id}`,
              name: t.name,
              artists,
              album: t.album?.name || 'Sencillo',
              duration_ms: durMs,
              duration_str: `${mins}:${secs.toString().padStart(2, '0')}`,
              cover_url: t.album?.images?.[0]?.url || null,
              preview_url: null,
              format: 'MP3',
              // The signal that tells the studio original from the covers that
              // share its exact title; nothing else in the payload reveals it.
              popularity: typeof t.popularity === 'number' ? t.popularity : undefined
            };
          });

          const albums = (data.albums?.items || []).map((a: any) => ({
            id: `sp-alb-${a.id}`,
            name: a.name,
            artist: (a.artists || []).map((art: any) => art.name).join(', ') || 'Varios Artistas',
            cover_url: a.images?.[0]?.url || null,
            trackCount: a.total_tracks || 1
          }));

          const results: SearchResults = { tracks: rankSearchResults(q, tracks), albums, playlists: [] };
          if (tracks.length >= 10) {
            this.searchCache.set(cacheKey, { timestamp: Date.now(), data: results });
            return results;
          }
          spotifyResults = results;
        }
      } catch (spErr) {
        console.warn('Spotify search notice, using iTunes fallback:', spErr);
      }
    }

    // 2. Fast iTunes search fallback
    try {
      const encoded = encodeURIComponent(q);
      const res = await fetch(`https://itunes.apple.com/search?term=${encoded}&entity=song&limit=25`);
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
          preview_url: null,
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

      const itunesResults: SearchResults = {
        tracks: [...(spotifyResults?.tracks || []), ...tracks].filter((track, index, all) =>
          all.findIndex(other => `${other.name}|${other.artists}`.toLocaleLowerCase() === `${track.name}|${track.artists}`.toLocaleLowerCase()) === index),
        albums: Array.from(albumMap.values()).slice(0, 10),
        playlists: []
      };
      this.searchCache.set(cacheKey, { timestamp: Date.now(), data: itunesResults });
      itunesResults.tracks = rankSearchResults(q, itunesResults.tracks);
      return itunesResults;
    } catch (err: any) {
      console.error('Catalog search error:', err);
      return spotifyResults || { tracks: [], albums: [], playlists: [] };
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
            audio_url: undefined,
            format: 'MP3'
          };
        });
      }
    } catch (e) {}
    return [];
  }
}

export const spotifyClient = new SpotifyClient();
