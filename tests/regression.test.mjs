import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { indexedDB } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8').replace(/\bimport\.meta\b/g, '({env:{}})'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: key => dependencies[key] ?? {}, console, AbortSignal, URL, Date, setInterval, clearInterval, setTimeout, clearTimeout, ...globals });
  return exports;
}
function license(fetch, saved) {
  const data = new Map(saved ? [['spotmusic_mobile_license', JSON.stringify(saved)]] : []);
  return load('src/services/licenseClient.ts', { '@capacitor/device': { Device: { getId: async () => ({ identifier: 'device' }) } } }, {
    fetch, localStorage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) },
    setInterval: () => ({ unref() {} }), clearInterval: () => {}
  });
}
test('unverified offline token cannot activate a license', async () => {
  const { licenseClient } = license(async () => { throw new Error('offline'); });
  const token = Buffer.from(JSON.stringify({ machineId: 'DEVICE', expiresAt: -1 })).toString('base64url') + '.fake';
  assert.equal((await licenseClient.activateToken(token)).valid, false);
});
test('persisted valid flag does not authorize downloads without remote verification', async () => {
  const { licenseClient } = license(async () => { throw new Error('offline'); }, { valid: true, token: 'fake', status: 'active' });
  assert.equal((await licenseClient.checkLicense()).valid, false);
});
test('expiry handles seconds, milliseconds, ISO dates and permanent licenses', () => {
  const { licenseExpiry } = license(async () => {});
  assert.equal(licenseExpiry(1700000000), 1700000000000);
  assert.equal(licenseExpiry(1700000000000), 1700000000000);
  assert.equal(licenseExpiry('2023-11-14T22:13:20Z'), 1700000000000);
  assert.equal(licenseExpiry(-1), null);
});
test('revoked license is cached briefly without a recursive remote check', async () => {
  let requests = 0;
  const { licenseClient } = license(async () => { requests++; return { ok: true, json: async () => ({ valid: false, status: 'revoked' }) }; }, { token: 'valid-format', valid: true });
  assert.equal((await licenseClient.checkLicense()).valid, false);
  await licenseClient.checkLicense();
  assert.equal(requests, 1);
});
test('catalog metadata cannot break out of HTML attributes', () => {
  const { escapeHtml } = load('src/utils/html.ts');
  assert.equal(escapeHtml('\" onerror=\"<script>&'), '&quot; onerror=&quot;&lt;script&gt;&amp;');
});
function updater(fetch) {
  return load('src/services/updaterClient.ts', { '@capacitor/core': { Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }, '../../package.json': { version: '1.0.6' } }, { fetch });
}
test('update network failure is not reported as up to date', async () => {
  const { updaterClient } = updater(async () => ({ ok: false, status: 403 }));
  await assert.rejects(updaterClient.checkForUpdates(), /403/);
});
test('prerelease APK is skipped and official stable APK is detected', async () => {
  const { updaterClient } = updater(async () => ({ ok: true, json: async () => [
    { tag_name: 'v2.0.0', prerelease: true, assets: [{ name: 'a.apk', browser_download_url: 'x' }] },
    { tag_name: 'v1.0.7', assets: [{ name: 'a.apk', browser_download_url: 'https://github.com/Maverick-Dev01/SpotMusic-Android/releases/download/v1.0.7/a.apk' }] }
  ] }));
  const result = await updaterClient.checkForUpdates();
  assert.equal(result.latestVersion, '1.0.7');
  assert.equal(result.hasUpdate, true);
  await assert.rejects(updaterClient.downloadAndInstall('https://attacker.example/a.apk'), /autorizada/);
});

class FakeAudio {
  src = ''; paused = true; ended = false; currentTime = 0; duration = 180;
  listeners = new Map();
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  setAttribute(name, value) {}
  pause() { this.paused = true; }
  load() {}
  removeAttribute() { this.src = ''; }
  async play() { this.paused = false; this.listeners.get('play')?.(); }
}
function audio(resolver) {
  return load('src/services/audioEngine.ts', {
    '@capacitor/core': { Capacitor: { convertFileSrc: value => value, isNativePlatform: () => false } },
    './localLibrary': { localLibrary: {} },
    './streamResolver': { streamResolver: { resolveFullAudio: resolver, clearCache() {} } },
    './backgroundAudio': { BackgroundAudio: { addListener: () => ({ remove: () => {} }), requestNotificationPermission: async () => ({ granted: true }) } }
  }, { Audio: FakeAudio, navigator: {}, location: { href: 'https://localhost', origin: 'https://localhost' }, window: {} }).audioEngine;
}
test('rapid track changes ignore an older asynchronous resolution', async () => {
  let complete;
  const engine = audio(title => title === 'B'
    ? Promise.resolve({ audioUrl: 'https://audio.example/b.mp3', durationMs: 180000 })
    : new Promise(resolve => { complete = resolve; }));
  const first = { id: 'a', name: 'A', artists: 'Artist', duration_ms: 30000 };
  const second = { id: 'b', name: 'B', artists: 'Artist', duration_ms: 180000, audio_url: 'https://audio.example/b.mp3' };
  const events = [];
  engine.on('trackchange', track => events.push(track.id));
  const pending = engine.playTrack(first);
  await engine.playTrack(second);
  complete({ audioUrl: 'https://audio.example/a.mp3', durationMs: 180000 });
  await pending;
  assert.equal(engine.currentTrack.id, 'b');
  assert.deepEqual(events, ['b']);
});
test('clearing the queue cancels an unresolved play request', async () => {
  let complete;
  const engine = audio(() => new Promise(resolve => { complete = resolve; }));
  let played = false;
  engine.on('trackchange', () => { played = true; });
  const pending = engine.playTrack({ id: 'a', name: 'A', artists: 'Artist', duration_ms: 30000 });
  engine.clearQueue();
  complete({ audioUrl: 'https://audio.example/a.mp3', durationMs: 180000 });
  await pending;
  assert.equal(engine.currentTrack, null);
  assert.equal(played, false);
});

test('a 30-second preview is never played when full audio resolution fails', async () => {
  const engine = audio(async () => null);
  let error;
  engine.on('error', value => { error = value; });
  await engine.playTrack({
    id: 'preview',
    name: 'Full song',
    artists: 'Artist',
    duration_ms: 30000,
    audio_url: 'https://audio-ssl.itunes.apple.com/preview.m4a'
  });
  assert.match(error.message, /audio completo/i);
  assert.equal(engine.isPlaying, false);
});


test('audio matching rejects an unrelated track and prefers the exact title and artist', () => {
  const { streamResolver } = load('src/services/streamResolver.ts', {
    '@capacitor/core': { CapacitorHttp: { get: async () => ({ status: 500 }) } },
    'crypto-js': { default: {} }
  });
  const candidates = [
    { title: 'Hello Again', artist: 'Neil Diamond', durationMs: 240000, audioUrl: 'wrong', source: 'soundcloud' },
    { title: 'Hello', artist: 'Adele', durationMs: 295000, audioUrl: 'right', source: 'soundcloud' }
  ];
  const match = streamResolver.bestMatch('Hello', 'Adele', 295000, candidates);
  assert.equal(match.audioUrl, 'right');
  assert.equal(streamResolver.bestMatch('Hello', 'Adele', 295000, [candidates[0]]), null);
});

test('official Spotify import follows every playlist page', async () => {
  const calls = [];
  const items = Array.from({ length: 1000 }, (_, index) => ({
    item: {
      id: `track-${index}`,
      type: 'track',
      name: `Song ${index}`,
      duration_ms: 180000,
      artists: [{ name: 'Artist' }],
      album: { name: 'Album', images: [] },
      external_urls: { spotify: `https://open.spotify.com/track/${index}` },
      external_ids: { isrc: `ISRC${index}` }
    }
  }));
  const { spotifyClient } = load('src/services/spotifyClient.ts', {
    '@capacitor/core': { CapacitorHttp: { get: async ({ url }) => {
      calls.push(url);
      if (url.endsWith('/playlists/1234567890123456789012')) {
        return { status: 200, data: { name: 'Large list', description: '', images: [], owner: { display_name: 'Owner' } } };
      }
      const offset = Number(new URL(url).searchParams.get('offset') || 0);
      const page = items.slice(offset, offset + 50);
      return { status: 200, data: { items: page, next: offset + page.length < 1000 ? 'next' : null } };
    } } }
  }, {
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} }
  });
  spotifyClient.setAccessToken('test-token');
  const result = await spotifyClient.fetchSpotifyEntity('https://open.spotify.com/playlist/1234567890123456789012');
  assert.equal(result.tracks.length, 1000);
  assert.equal(result.partial, false);
  assert.deepEqual(calls.filter(url => url.includes('/items?')).map(url => Number(new URL(url).searchParams.get('offset'))), Array.from({ length: 20 }, (_, i) => i * 50));
});

test('bulk deletion removes selected songs, blobs, history and folder references atomically', async () => {
  const { localLibrary } = load('src/services/localLibrary.ts', {}, { indexedDB });
  const a = { id: 'bulk-a', name: 'A' }, b = { id: 'bulk-b', name: 'B' };
  await localLibrary.saveTrack(a);
  await localLibrary.saveTrack(b);
  await localLibrary.logHistory(a);
  await localLibrary.logHistory(b);
  await localLibrary.saveAudioBlob(a.id, new Blob(['test']));
  const folder = await localLibrary.createPlaylist('Folder');
  await localLibrary.addTracksToPlaylist(folder.id, [a, b]);
  await localLibrary.deleteTracks([a.id]);
  assert.deepEqual(Array.from(await localLibrary.getAllTracks(), t => t.id), [b.id]);
  assert.deepEqual(Array.from(await localLibrary.getRecentHistory(), t => t.id), [b.id]);
  assert.equal(await localLibrary.getAudioBlob(a.id), null);
  const saved = (await localLibrary.getAllPlaylists())[0];
  assert.equal(saved.trackCount, 1);
  assert.equal(saved.tracks[0].id, b.id);
});

test('full audio validation rejects preview URLs and short provider responses', () => {
  const { isFullAudio } = load('src/services/audioValidation.ts');
  assert.equal(isFullAudio({ audioUrl: 'https://cdn.example/full.mp3', durationMs: 30000 }, 180000), false);
  assert.equal(isFullAudio({ audioUrl: 'https://cdn.example/preview.mp3', durationMs: 180000 }, 180000), false);
  assert.equal(isFullAudio({ audioUrl: 'https://cdn.example/full.mp3', durationMs: 180000 }, 180000), true);
  assert.equal(isFullAudio({ audioUrl: 'https://cdn.example/short-song.mp3', durationMs: 40000 }, 40000), true);
});

test('search ranks the exact title and artist ahead of covers with similar names', () => {
  const { rankSearchResults } = load('src/services/searchRanking.ts');
  const tracks = rankSearchResults('Sneaky Snitch Kevin MacLeod', [
    { name: 'Sneaky Snitch (feat. Kevin Macleod)', artists: 'Retromelon' },
    { name: 'Sneaky Snitch', artists: 'Kevin MacLeod' },
    { name: 'Sneaky Adventure', artists: 'Kevin MacLeod' }
  ]);
  assert.equal(tracks[0].artists, 'Kevin MacLeod');
  assert.equal(tracks[0].name, 'Sneaky Snitch');
});

test('actual playback duration catches a preview disguised as a full-song URL', async () => {
  const engine = audio(async () => ({ audioUrl: 'https://cdn.example/full.mp3', durationMs: 180000 }));
  let failure;
  engine.on('error', error => { failure = error; });
  await engine.playTrack({ id: 'disguised', name: 'Song', artists: 'Artist', duration_ms: 180000 });
  engine.audio.duration = 30;
  engine.audio.listeners.get('loadedmetadata')();
  assert.equal(engine.isPlaying, false);
  assert.match(failure.message, /fragmento/);
});

function spotifyAuthHarness(launchUrl) {
  const storage = new Map();
  let token = '', open, requests = 0;
  const opened = new Promise(resolve => { open = resolve; });
  const { spotifyAuth } = load('src/services/spotifyAuth.ts', {
    '@capacitor/app': { App: { addListener: async () => {}, getLaunchUrl: async () => launchUrl ? { url: launchUrl } : undefined } },
    '@capacitor/browser': { Browser: { addListener: async () => {}, open: async ({url}) => open(url), close: async () => {} } },
    '@capacitor/core': { CapacitorHttp: { request: async ({data}) => {
      requests++;
      const body = new URLSearchParams(data);
      assert.equal(body.get('client_secret'), null);
      assert.ok(body.get('code_verifier'));
      return { status: 200, data: { access_token: 'test-token', refresh_token: 'test-refresh', expires_in: 3600 } };
    } } },
    './spotifyClient': { spotifyClient: { get hasAccessToken() { return !!token; }, setAccessToken: value => { token = value; } } }
  }, { URLSearchParams, TextEncoder, crypto: webcrypto, btoa,
    localStorage: { getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key) }
  });
  return { auth: spotifyAuth, storage, opened, requests: () => requests };
}

test('mobile import waits for Spotify login and duplicate callbacks do not disconnect the account', async () => {
  const h = spotifyAuthHarness();
  await h.auth.initialize();
  const pending = h.auth.ensureAccessToken(true);
  const url = new URL(await h.opened);
  const callback = 'spotmusic-login://callback?code=test&state=' + url.searchParams.get('state');
  await h.auth.handleCallback(callback);
  assert.equal(await pending, true);
  await h.auth.handleCallback(callback);
  assert.equal(h.auth.connected, true);
  assert.equal(h.requests(), 1);
});

test('mobile cold-start callback restores Spotify login', async () => {
  const h = spotifyAuthHarness('spotmusic-login://callback?code=test&state=expected');
  h.storage.set('spotmusic_spotify_oauth_state', 'expected');
  h.storage.set('spotmusic_spotify_pkce_verifier', 'verifier');
  await h.auth.initialize();
  assert.equal(h.auth.connected, true);
});

test('Spotify access denial is visible and never replaced by a partial public import', async () => {
  let calls = 0;
  const { spotifyClient } = load('src/services/spotifyClient.ts', {
    '@capacitor/core': { CapacitorHttp: { get: async () => { calls++; return { status: 403 }; } } }
  }, { sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } });
  spotifyClient.setAccessToken('user-token');
  await assert.rejects(spotifyClient.fetchSpotifyEntity('https://open.spotify.com/playlist/1234567890123456789012'), /autorizar tu cuenta/);
  assert.equal(calls, 1);
});

test('a pasted playlist link imports without any Spotify login, through the server when CORS blocks the embed', async () => {
  const requested = [];
  const serverPayload = {
    success: true, id: '1234567890123456789012', type: 'playlist', name: 'Mi Playlist',
    description: '', cover_url: '', owner: 'Spotify', total_tracks: 2, partial: false,
    tracks: [
      { id: 'spotify-a', name: 'Canción A', artists: 'Artista', duration_ms: 200000, preview_url: null },
      { id: 'spotify-b', name: 'Canción B', artists: 'Artista', duration_ms: 210000, preview_url: null }
    ]
  };
  const { spotifyClient } = load('src/services/spotifyClient.ts', {
    '@capacitor/core': {
      Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
      CapacitorHttp: { get: async () => { throw new Error('CORS'); } }
    }
  }, {
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async (url) => {
      requested.push(String(url));
      // The browser cannot read open.spotify.com directly: no CORS headers.
      // Matched on the origin, since the server URL carries the link encoded in its query.
      if (String(url).startsWith('https://open.spotify.com')) throw new TypeError('Failed to fetch');
      return { ok: true, json: async () => serverPayload };
    }
  });

  const result = await spotifyClient.fetchSpotifyEntity('https://open.spotify.com/playlist/1234567890123456789012');
  assert.equal(result.tracks.length, 2);
  assert.equal(result.name, 'Mi Playlist');
  // No 30 second snippet may ever reach the player.
  assert.equal(result.tracks.some(track => track.preview_url), false);
  assert.ok(requested.some(url => url.includes('/api/playlist')), 'debe consultar el lector del servidor');
});

test('JioSaavn streams are upgraded from the 96kbps variant to 320kbps', () => {
  const { streamResolver } = load('src/services/streamResolver.ts', {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' }, CapacitorHttp: { get: async () => { throw new Error('offline'); } } },
    'crypto-js': {},
    './nativeAudioResolver': { resolveNativeAudio: async () => null },
    './audioValidation': { isFullAudio: () => true }
  }, { DOMParser: class {}, fetch: async () => { throw new Error('offline'); } });

  const upgrade = url => streamResolver.upgradeJioQuality(url);
  assert.equal(upgrade('https://aac.saavncdn.com/344/abc_96.mp4'), 'https://aac.saavncdn.com/344/abc_320.mp4');
  assert.equal(upgrade('https://aac.saavncdn.com/344/abc_160.mp4'), 'https://aac.saavncdn.com/344/abc_320.mp4');
  assert.equal(upgrade('https://aac.saavncdn.com/344/abc_320.mp4'), 'https://aac.saavncdn.com/344/abc_320.mp4');
  assert.equal(upgrade(null), null);
});

test('search ranking pushes covers and alternate versions below the original', () => {
  const { rankSearchResults } = load('src/services/searchRanking.ts');
  const results = [
    { name: 'Blinding Lights', artists: 'Teddy Swims' },
    { name: 'Blinding Lights (Remix)', artists: 'The Weeknd & ROSALÍA' },
    { name: 'Blinding Lights', artists: 'KIDZ BOP Kids' },
    { name: 'Blinding Lights (Country Version)', artists: 'Tebey' },
    { name: 'Blinding Lights', artists: 'The Weeknd' },
    { name: 'Blinding Lights', artists: 'Lullapop' }
  ];
  const ranked = rankSearchResults('Blinding Lights', results);
  const positionOf = artist => ranked.findIndex(track => track.artists === artist);
  assert.ok(positionOf('The Weeknd') < positionOf('KIDZ BOP Kids'), 'el original va antes que KIDZ BOP');
  assert.ok(positionOf('The Weeknd') < positionOf('Lullapop'), 'el original va antes que la version de cuna');
  assert.ok(positionOf('The Weeknd') < positionOf('Tebey'), 'el original va antes que la version country');
  assert.ok(positionOf('The Weeknd') < positionOf('The Weeknd & ROSALÍA'), 'el original va antes que el remix');

  // Asking for a remix must still surface remixes.
  const remixFirst = rankSearchResults('Blinding Lights Remix', results);
  assert.match(remixFirst[0].name, /Remix/);
});

test('Spotify popularity outranks an identically titled cover with no textual marker', () => {
  const { rankSearchResults } = load('src/services/searchRanking.ts');
  // Neither title nor artist reveals which one is the original: only popularity does.
  const ranked = rankSearchResults('Blinding Lights', [
    { name: 'Blinding Lights', artists: 'Teddy Swims', popularity: 41 },
    { name: 'Blinding Lights', artists: 'All Time Low', popularity: 22 },
    { name: 'Blinding Lights', artists: 'The Weeknd', popularity: 93 }
  ]);
  assert.equal(ranked[0].artists, 'The Weeknd');
  assert.equal(ranked[2].artists, 'All Time Low');
});

test('results without popularity still rank by the text heuristics', () => {
  const { rankSearchResults } = load('src/services/searchRanking.ts');
  const ranked = rankSearchResults('Blinding Lights', [
    { name: 'Blinding Lights', artists: 'KIDZ BOP Kids' },
    { name: 'Blinding Lights', artists: 'The Weeknd' }
  ]);
  assert.equal(ranked[0].artists, 'The Weeknd');
});
