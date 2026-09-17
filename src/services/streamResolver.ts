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
  private scClientId: string = 'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo';
  private backupScClientIds: string[] = [
    'Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo',
    'b7h4Jv4c0iFh3eU08K8k0K944J23t40F',
    'y5bYq3fR78uK13H5k2A78L00p44J22x1'
  ];

  constructor() {
    this.refreshSoundCloudClientId();
  }

  private async refreshSoundCloudClientId() {
    try {
      const pageRes = await fetch('https://soundcloud.com', { signal: AbortSignal.timeout(4000) });
      if (!pageRes.ok) return;
      const html = await pageRes.text();
      const scriptUrls = [...html.matchAll(/https:\/\/a-v2\.sndcdn\.com\/assets\/[a-zA-Z0-9-]+\.js/g)].map(m => m[0]);
      for (const s of scriptUrls.slice(-4)) {
        const js = await (await fetch(s, { signal: AbortSignal.timeout(3000) })).text();
        const match = js.match(/client_id:"([a-zA-Z0-9]{32})"/);
        if (match && match[1]) {
          this.scClientId = match[1];
          break;
        }
      }
    } catch (e) {
      // silently keep working client ID
    }
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
      const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.results || !data.results.length) return null;

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
        const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
        if (!res.ok) continue;
        const data = await res.json();
        if (!data.collection || !data.collection.length) continue;

        for (const track of data.collection) {
          const prog = track.media?.transcodings?.find((t: any) => t.format?.protocol === 'progressive');
          if (prog) {
            const streamRes = await fetch(`${prog.url}?client_id=${cId}`, { signal: AbortSignal.timeout(3000) });
            if (streamRes.ok) {
              const streamData = await streamRes.json();
              if (streamData.url) {
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
        }
      } catch (e) {}
    }
    return null;
  }

  public async resolveFallbackPreview(title: string, artist: string): Promise<ResolvedAudio | null> {
    try {
      const q = encodeURIComponent(`${title} ${artist}`);
      const res = await fetch(`https://itunes.apple.com/search?term=${q}&media=music&limit=1`, { signal: AbortSignal.timeout(3500) });
      if (res.ok) {
        const data = await res.json();
        if (data.results && data.results.length > 0) {
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
      }
    } catch (e) {}
    return null;
  }

  public async resolveFullAudio(title: string, artist: string): Promise<ResolvedAudio | null> {
    const cleanT = this.cleanTitle(title);
    const query = `${cleanT} ${artist}`.trim();

    // 1. Check JioSaavn for 320 KBPS AAC high-fidelity full audio
    let result = await this.resolveJioSaavn(query);
    if (result && result.durationMs > 60000) {
      return result;
    }

    // 2. Check SoundCloud for full-length track (excellent for Latin, reggaeton, electronic)
    result = await this.resolveSoundCloud(query);
    if (result && result.durationMs > 60000) {
      return result;
    }

    // 3. Retry SoundCloud with just the clean song title
    result = await this.resolveSoundCloud(cleanT);
    if (result && result.durationMs > 60000) {
      return result;
    }

    // 4. Retry JioSaavn with clean song title
    result = await this.resolveJioSaavn(cleanT);
    if (result && result.durationMs > 60000) {
      return result;
    }

    // 5. Ultimate fallback to ensure music plays
    return await this.resolveFallbackPreview(cleanT, artist);
  }
}

export const streamResolver = new StreamResolver();
