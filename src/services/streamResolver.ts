import { CapacitorHttp } from '@capacitor/core';
import CryptoJS from 'crypto-js';

export interface ResolvedAudio {
  audioUrl: string;
  durationMs: number;
  durationStr: string;
  format: string;
  source: 'jiosaavn' | 'soundcloud' | 'fallback';
  coverUrl?: string;
  title?: string;
  artist?: string;
}

class StreamResolver {
  private cache: Map<string, ResolvedAudio> = new Map();
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
      // Upgrade 96 kbps to full studio 320 kbps stream
      return url.replace('_96.mp4', '_320.mp4');
    } catch (e) {
      return null;
    }
  }

  private formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private cleanTitle(title: string): string {
    return title
      .replace(/\(feat\.[^)]+\)/gi, '')
      .replace(/\(ft\.[^)]+\)/gi, '')
      .replace(/\(official[^)]*\)/gi, '')
      .replace(/\(video[^)]*\)/gi, '')
      .replace(/\[official[^\]]*\]/gi, '')
      .replace(/- remas.*$/i, '')
      .trim();
  }

  public async resolveJioSaavn(query: string): Promise<ResolvedAudio | null> {
    try {
      const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&n=3&p=1&q=${encodeURIComponent(query)}`;
      const data = await this.httpGet(url, {}, 3500);
      if (!data || !data.results || !data.results.length) return null;

      for (const item of data.results) {
        if (item.encrypted_media_url) {
          const streamUrl = this.decryptJioMediaUrl(item.encrypted_media_url);
          if (streamUrl) {
            const durSec = parseInt(item.duration, 10) || 180;
            const dom = new DOMParser().parseFromString(item.song || '', 'text/html');
            const cleanName = dom.body.textContent || item.song;
            const artistDom = new DOMParser().parseFromString(item.singers || '', 'text/html');
            const cleanArtist = artistDom.body.textContent || item.singers;

            return {
              audioUrl: streamUrl,
              durationMs: durSec * 1000,
              durationStr: this.formatDuration(durSec),
              format: '320 KBPS (Hi-Fi)',
              source: 'jiosaavn',
              coverUrl: item.image?.replace('150x150', '500x500'),
              title: cleanName,
              artist: cleanArtist
            };
          }
        }
      }
    } catch (e) {}
    return null;
  }

  public async resolveSoundCloud(query: string): Promise<ResolvedAudio | null> {
    const clientIds = [this.scClientId, ...this.backupScClientIds];
    for (const cId of clientIds) {
      try {
        const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(query)}&client_id=${cId}&limit=4`;
        const data = await this.httpGet(url, {}, 3500);
        if (!data || !data.collection || !data.collection.length) continue;

        for (const track of data.collection) {
          const prog = track.media?.transcodings?.find((t: any) => t.format?.protocol === 'progressive');
          if (prog) {
            const streamData = await this.httpGet(`${prog.url}?client_id=${cId}`, {}, 3000);
            if (streamData && streamData.url) {
              const durSec = Math.round((track.duration || 180000) / 1000);
              return {
                audioUrl: streamData.url,
                durationMs: durSec * 1000,
                durationStr: this.formatDuration(durSec),
                format: 'MP3 Estándar (Full)',
                source: 'soundcloud',
                coverUrl: track.artwork_url?.replace('large', 't500x500'),
                title: track.title,
                artist: track.user?.username
              };
            }
          }
        }
      } catch (e) {}
    }
    return null;
  }

  public async resolveFallbackPreview(title: string, artist: string): Promise<ResolvedAudio | null> {
    try {
      const q = encodeURIComponent(`${title} ${artist}`);
      const data = await this.httpGet(`https://itunes.apple.com/search?term=${q}&media=music&limit=1`, {}, 3000);
      if (data && data.results && data.results.length > 0) {
        const item = data.results[0];
        return {
          audioUrl: item.previewUrl,
          durationMs: (item.trackTimeMillis && item.trackTimeMillis > 40000) ? 30000 : (item.trackTimeMillis || 30000),
          durationStr: '0:30',
          format: 'Preview AAC',
          source: 'fallback',
          coverUrl: item.artworkUrl100?.replace('100x100bb', '600x600bb'),
          title: item.trackName,
          artist: item.artistName
        };
      }
    } catch (e) {}
    return null;
  }

  public async resolveFullAudio(title: string, artist: string): Promise<ResolvedAudio | null> {
    const cleanT = this.cleanTitle(title);
    const query = `${cleanT} ${artist}`.trim();
    const cacheKey = `${cleanT}---${artist}`.toLowerCase();

    // Check memory cache for 0ms instant playback
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Run JioSaavn and SoundCloud in PARALLEL for sub-second resolution
    try {
      const [jioRes, scRes] = await Promise.all([
        this.resolveJioSaavn(query).catch(() => null),
        this.resolveSoundCloud(query).catch(() => null)
      ]);

      // Choose high-fidelity stream with duration > 60s
      if (jioRes && jioRes.durationMs > 60000) {
        this.cache.set(cacheKey, jioRes);
        return jioRes;
      }
      if (scRes && scRes.durationMs > 60000) {
        this.cache.set(cacheKey, scRes);
        return scRes;
      }

      // Retry in parallel with just song title if artist caused a mismatch
      const [jioTitleRes, scTitleRes] = await Promise.all([
        this.resolveJioSaavn(cleanT).catch(() => null),
        this.resolveSoundCloud(cleanT).catch(() => null)
      ]);

      if (jioTitleRes && jioTitleRes.durationMs > 60000) {
        this.cache.set(cacheKey, jioTitleRes);
        return jioTitleRes;
      }
      if (scTitleRes && scTitleRes.durationMs > 60000) {
        this.cache.set(cacheKey, scTitleRes);
        return scTitleRes;
      }
    } catch (e) {
      console.warn('Fast parallel stream resolution notice:', e);
    }

    // Ultimate fallback if offline or no network
    const fallback = await this.resolveFallbackPreview(cleanT, artist);
    if (fallback) {
      this.cache.set(cacheKey, fallback);
    }
    return fallback;
  }
}

export const streamResolver = new StreamResolver();
