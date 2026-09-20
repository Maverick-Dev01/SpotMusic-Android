import { Capacitor, CapacitorHttp } from '@capacitor/core';
import CryptoJS from 'crypto-js';
import { resolveNativeAudio } from './nativeAudioResolver';
import { isFullAudio } from './audioValidation';

/**
 * Markers of a recording that is NOT the studio original. The catalogues are full
 * of these (searching "Despacito" returns an Afro House edit, "Blinding Lights" a
 * Nightcore one), and they are what makes a song feel like it is "missing a part":
 * it is a different, shorter take. The check is symmetric, so asking for a remix
 * still finds one.
 */
const UNWANTED_VERSION_MARKERS = [
  'remix', 'nightcore', 'slowed', 'reverb', 'sped up', 'speed up', '8d audio', '8d',
  'cover', 'karaoke', 'instrumental', 'acapella', 'a cappella', 'tribute',
  'originally performed', 'made famous by', 'in the style of',
  // "edit" is deliberately absent: "Radio Edit" is usually the standard single.
  'live', 'extended mix', 'mix', 'mashup', 'bootleg',
  'afro house', 'techno', 'house version', 'piano version', 'string quartet',
  'lofi', 'lo-fi', 'bass boosted', 'reverse', '1 hour', '10 hours', 'loop',
];

// The server may have to fall back to YouTube for tracks the fast catalogues do
// not carry, which takes several seconds. The old 3s budget aborted every one of
// those requests before it could answer.
const SERVER_REQUEST_TIMEOUT_MS = 12000;
// Guard against a slow endpoint list stacking up one timeout after another.
const SERVER_TOTAL_BUDGET_MS = 20000;

export interface ResolvedAudio {
  audioUrl: string;
  durationMs: number;
  durationStr: string;
  format: string;
  source: 'jiosaavn' | 'soundcloud' | 'native' | 'fallback';
  coverUrl?: string;
  title?: string;
  artist?: string;
  matchScore?: number;
}

class StreamResolver {
  private cache: Map<string, ResolvedAudio> = new Map();

  private cachedAt = new Map<string, number>();
  private pending = new Map<string, Promise<ResolvedAudio | null>>();
  public clearCache() { this.cache.clear(); this.cachedAt.clear(); }

  public async resolveFullAudio(title: string, artist: string, expectedDurationMs?: number): Promise<ResolvedAudio | null> {
    const key = `${this.cleanTitle(title)}---${artist}---${expectedDurationMs || 0}`.toLowerCase();
    if (Date.now() - (this.cachedAt.get(key) || 0) > 300000) this.cache.delete(key);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.resolveUncached(title, artist, expectedDurationMs).then(result => {
      if (result) this.cachedAt.set(key, Date.now());
      if (this.cache.size > 100) {
        const oldest = this.cache.keys().next().value;
        if (oldest) { this.cache.delete(oldest); this.cachedAt.delete(oldest); }
      }
      return result;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
  private scClientId: string = 'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo';
  private backupScClientIds: string[] = [
    'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo',
    'b7h4Jv4c0iFh3eU08K8k0K944J23t40F',
    'y5bYq3fR78uK13H5k2A78L00p44J22x1'
  ];

  constructor() {
    this.refreshSoundCloudClientId();
  }

  private async httpGet(url: string, headers: Record<string, string> = {}, timeoutMs = 4000): Promise<any> {
    // 1. Prefer native CapacitorHttp on Android: NO CORS, NO origin restrictions!
    try {
      const res = await CapacitorHttp.get({
        url,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          ...headers
        },
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs
      });
      if (res.status >= 200 && res.status < 300) {
        if (typeof res.data === 'string') {
          try {
            return JSON.parse(res.data);
          } catch {
            return res.data;
          }
        }
        return res.data;
      }
    } catch (e) {
      // 2. Fallback to window.fetch
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        if (r.ok) return await r.json();
      } catch {}
    }
    return null;
  }

  private async refreshSoundCloudClientId() {
    try {
      const pageData = await this.httpGet('https://soundcloud.com');
      const html = typeof pageData === 'string' ? pageData : JSON.stringify(pageData || '');
      const scriptUrls = [...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[a-zA-Z0-9-]+\.js/g)].map(m => m[0]);
      for (const s of scriptUrls.slice(-4)) {
        const jsData = await this.httpGet(s);
        const js = typeof jsData === 'string' ? jsData : '';
        const match = js.match(/client_id:"([a-zA-Z0-9]{32})"/);
        if (match && match[1]) {
          this.scClientId = match[1];
          break;
        }
      }
    } catch (e) {}
  }

  private decryptJioMediaUrl(encUrl: string): string | null {
    try {
      const key = CryptoJS.enc.Utf8.parse('38346591');
      const decrypted = CryptoJS.DES.decrypt(
        { ciphertext: CryptoJS.enc.Base64.parse(encUrl) } as any,
        key,
        {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7
        }
      );
      const url = decrypted.toString(CryptoJS.enc.Utf8);
      if (!url || !url.startsWith('http')) return null;
      return url;
    } catch (e) {
      return null;
    }
  }

  private upgradeJioQuality(url: string | null): string | null {
    if (!url) return null;
    return url.replace(/_(?:12|48|96|160)\.mp4(\b|$)/, '_320.mp4$1');
  }

  private formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private cleanTitle(title: string): string {
    return title.trim();
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\b(official|audio|video|lyrics?)\b/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private similarity(expected: string, actual: string): number {
    const a = new Set(this.normalize(expected).split(' ').filter(Boolean));
    const b = new Set(this.normalize(actual).split(' ').filter(Boolean));
    if (!a.size || !b.size) return 0;
    const intersection = [...a].filter(token => b.has(token)).length;
    return (2 * intersection) / (a.size + b.size);
  }

  private matchScore(
    title: string,
    artist: string,
    durationMs: number | undefined,
    candidate: Pick<ResolvedAudio, 'title' | 'artist' | 'durationMs'>
  ): number {
    const titleScore = this.similarity(this.cleanTitle(title), candidate.title || '');
    const unwanted = UNWANTED_VERSION_MARKERS;
    const titleLower = title.toLowerCase();
    const candLower = (candidate.title || '').toLowerCase();
    for (const word of unwanted) {
      const pattern = new RegExp(`\\b${word}\\b`, 'i');
      if (pattern.test(titleLower) !== pattern.test(candLower)) {
        return 0;
      }
    }

    const firstArtist = (artist || '').split(/[,&/]/)[0].trim();
    const artistScore = this.similarity(firstArtist, candidate.artist || '');
    const firstArtistNorm = this.normalize(firstArtist);
    const candArtistNorm = this.normalize(candidate.artist || '');
    const candTitleNorm = this.normalize(candidate.title || '');
    const artMatches = artistScore >= 0.20 || candArtistNorm.includes(firstArtistNorm) || candTitleNorm.includes(firstArtistNorm);
    if (!artMatches) return 0;

    const cleanTNorm = this.normalize(this.cleanTitle(title));
    const titleMatches = titleScore >= 0.40 || candTitleNorm.includes(cleanTNorm) || cleanTNorm.includes(candTitleNorm);
    if (!titleMatches) return 0;

    const durationScore = durationMs && candidate.durationMs
      ? Math.max(0, 1 - Math.abs(durationMs - candidate.durationMs) / Math.max(durationMs, 1))
      : 0.8;
    return titleScore * 0.50 + artistScore * 0.30 + durationScore * 0.20;
  }

  private bestMatch(
    title: string,
    artist: string,
    durationMs: number | undefined,
    candidates: ResolvedAudio[]
  ): ResolvedAudio | null {
    const ranked = candidates
      .map(candidate => ({ candidate, score: this.matchScore(title, artist, durationMs, candidate) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 0.65) return null;
    return { ...best.candidate, matchScore: best.score };
  }

  public async resolveJioSaavn(title: string, artist: string, durationMs?: number): Promise<ResolvedAudio | null> {
    try {
      const query = `${this.cleanTitle(title)} ${artist}`.trim();
      const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&n=10&p=1&q=${encodeURIComponent(query)}`;
      const data = await this.httpGet(url, {}, 3500);
      if (!data || !data.results || !data.results.length) return null;

      const candidates: ResolvedAudio[] = [];
      for (const item of data.results) {
        if (item.encrypted_media_url) {
          // JioSaavn hands out the 96kbps variant; the 320kbps one lives at the
          // same path and is a straight substitution (verified ~317kbps real).
          const streamUrl = this.upgradeJioQuality(this.decryptJioMediaUrl(item.encrypted_media_url));
          if (streamUrl) {
            const durSec = parseInt(item.duration, 10) || 180;
            const dom = new DOMParser().parseFromString(item.song || '', 'text/html');
            const cleanName = dom.body.textContent || item.song;
            const artistDom = new DOMParser().parseFromString(item.singers || '', 'text/html');
            const cleanArtist = artistDom.body.textContent || item.singers;

            candidates.push({
              audioUrl: streamUrl,
              durationMs: durSec * 1000,
              durationStr: this.formatDuration(durSec),
              format: 'Audio de la fuente',
              source: 'jiosaavn',
              coverUrl: item.image?.replace('150x150', '500x500'),
              title: cleanName,
              artist: cleanArtist
            });
          }
        }
      }
      return this.bestMatch(title, artist, durationMs, candidates);
    } catch (e) {}
    return null;
  }

  public async resolveSoundCloud(title: string, artist: string, durationMs?: number): Promise<ResolvedAudio | null> {
    const query = `${this.cleanTitle(title)} ${artist}`.trim();
    const clientIds = [this.scClientId, ...this.backupScClientIds];
    for (const cId of clientIds) {
      try {
        const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${cId}&limit=4`;
        const data = await this.httpGet(url, {}, 3500);
        if (!data || !data.collection || !data.collection.length) continue;

        const candidates: Array<{ result: ResolvedAudio; endpoint: string }> = [];
        for (const track of data.collection) {
          const prog = track.media?.transcodings?.find((t: any) => t.format?.protocol === 'progressive');
          if (prog && track.policy !== 'SNIP' && !prog.snipped && (!prog.duration || prog.duration >= track.duration * 0.8)) {
            const durSec = Math.round((track.duration || 180000) / 1000);
            candidates.push({
              endpoint: `${prog.url}?client_id=${cId}`,
              result: {
                audioUrl: '',
                durationMs: durSec * 1000,
                durationStr: this.formatDuration(durSec),
                format: 'MP3 Estándar (Full)',
                source: 'soundcloud',
                coverUrl: track.artwork_url?.replace('large', 't500x500'),
                title: track.title,
                artist: track.user?.username
              }
            });
          }
        }
        const best = this.bestMatch(title, artist, durationMs, candidates.map(item => item.result));
        if (!best) continue;
        const selected = candidates.find(item => item.result.title === best.title && item.result.artist === best.artist);
        if (!selected) continue;
        const streamData = await this.httpGet(selected.endpoint, {}, 3000);
        if (streamData?.url) return { ...best, audioUrl: streamData.url };
      } catch (e) {}
    }
    return null;
  }

  // Ordered by how likely each one is to answer. A stale LAN address used to sit
  // first and burned its full 3s timeout before every single song.
  private serverEndpoints: string[] = [
    '/api/stream',
    'https://license-eight-ruby.vercel.app/api/stream',
    'http://localhost:3000/api/stream',
    'https://license-dwtlltjib-lamb-dev.vercel.app/api/stream'
  ];

  public async resolveServerStream(title: string, artist: string, expectedDurationMs?: number): Promise<ResolvedAudio | null> {
    const query = `${this.cleanTitle(title)} ${artist}`.trim();
    const deadline = Date.now() + SERVER_TOTAL_BUDGET_MS;
    for (const ep of this.serverEndpoints) {
      if (Date.now() > deadline) break;
      try {
        const url = `${ep}?q=${encodeURIComponent(query)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}${expectedDurationMs ? `&durationMs=${expectedDurationMs}` : ''}`;
        let data: any = null;
        if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.() && Capacitor.getPlatform() === 'android') {
          const res = await CapacitorHttp.get({ url, connectTimeout: 5000, readTimeout: SERVER_REQUEST_TIMEOUT_MS });
          if (res.status === 200) data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
        } else {
          const res = await fetch(url, { signal: AbortSignal.timeout(SERVER_REQUEST_TIMEOUT_MS) });
          if (res.ok) data = await res.json();
        }
        if (data && data.success && isFullAudio(data, expectedDurationMs) && data.title && data.artist) {
          const score = this.matchScore(title, artist, expectedDurationMs, {
            title: data.title || title,
            artist: data.artist || artist,
            durationMs: data.durationMs
          });
          // Strictly reject server response if match score is below 0.50 (e.g. wrong artist or wrong song)
          if (score < 0.65) {
            console.warn('Server stream candidate rejected due to mismatch:', data.title, data.artist, 'expected:', title, artist);
            continue;
          }
          // A URL the server resolved from YouTube is bound to the server's IP, so
          // playing it straight from this device would be refused. When the server
          // offers a proxy path, stream through it instead.
          let audioUrl = data.audioUrl;
          if (data.proxyPath) {
            try { audioUrl = new URL(data.proxyPath, new URL(url, location.href).origin).toString(); } catch {}
          }
          return {
            audioUrl,
            durationMs: data.durationMs || 180000,
            durationStr: data.durationStr || '3:00',
            format: data.format || 'MP4 / 320kbps (Hi-Fi)',
            source: (data.source as any) || 'jiosaavn',
            coverUrl: data.coverUrl,
            title: data.title || title,
            artist: data.artist || artist,
            matchScore: score || data.matchScore || 0.9
          };
        }
      } catch {}
    }
    return null;
  }

  private async resolveUncached(title: string, artist: string, expectedDurationMs?: number): Promise<ResolvedAudio | null> {
    const cleanT = this.cleanTitle(title);
    const cacheKey = `${cleanT}---${artist}---${expectedDurationMs || 0}`.toLowerCase();

    // Check memory cache for 0ms instant playback
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Android resolves through its installed extractor before consulting remote servers.
    const nativeAudio = await resolveNativeAudio(title, artist, expectedDurationMs);
    if (nativeAudio && isFullAudio(nativeAudio, expectedDurationMs)) {
      this.cache.set(cacheKey, nativeAudio);
      return nativeAudio;
    }

    // The server is the most accurate source — it can fall back to YouTube for the
    // western catalogue that JioSaavn and SoundCloud simply do not carry — but it
    // is also the slowest. Start it now and race the fast catalogues against it
    // instead of waiting for one before trying the other.
    const serverRequest = this.resolveServerStream(cleanT, artist, expectedDurationMs)
      .catch(e => { console.warn('Server stream resolver notice:', e); return null; });

    const fastRequest = Promise.all([
      this.resolveJioSaavn(cleanT, artist, expectedDurationMs).catch(() => null),
      this.resolveSoundCloud(cleanT, artist, expectedDurationMs).catch(() => null)
    ]).then(([jioRes, scRes]) => {
      const fullCandidates = [jioRes, scRes].filter((item): item is ResolvedAudio => !!item && isFullAudio(item, expectedDurationMs));
      return fullCandidates.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))[0] || null;
    }).catch(e => { console.warn('Fast parallel stream resolution notice:', e); return null; });

    // A confident catalogue hit plays immediately; anything less waits for the
    // server, which is far better at telling the original from a look-alike.
    const fast = await fastRequest;
    if (fast && (fast.matchScore || 0) >= 0.8) {
      this.cache.set(cacheKey, fast);
      return fast;
    }

    const serverStream = await serverRequest;
    if (serverStream) {
      this.cache.set(cacheKey, serverStream);
      return serverStream;
    }

    if (fast) {
      this.cache.set(cacheKey, fast);
      return fast;
    }

    return null;
  }
}

export const streamResolver = new StreamResolver();
