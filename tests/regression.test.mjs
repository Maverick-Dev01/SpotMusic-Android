import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { indexedDB } from 'fake-indexeddb';
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
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

test('phone-safe audio profile is the default and device profiles persist', () => {
  const values = new Map();
  const engine = load('src/services/audioEngine.ts', {
    '@capacitor/core': { Capacitor: { convertFileSrc: value => value } },
    './localLibrary': { localLibrary: {} },
    './streamResolver': { streamResolver: { resolveFullAudio: async () => null, clearCache() {} } }
  }, {
    Audio: FakeAudio,
    navigator: {},
    location: { href: 'https://localhost', origin: 'https://localhost' },
    window: {},
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    }
  }).audioEngine;
  assert.equal(engine.currentPreset, 'Phone');
  assert.equal(engine.currentBassBoost, -4);
  engine.applyPreset('AntiBoom');
  assert.equal(engine.currentPreset, 'AntiBoom');
  assert.equal(engine.currentBassBoost, -6);
  assert.equal(values.get('spotmusic_eq_preset'), 'AntiBoom');
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
