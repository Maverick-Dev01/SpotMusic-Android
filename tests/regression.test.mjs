import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: key => dependencies[key] ?? {}, console, AbortSignal, URL, Date, ...globals });
  return exports;
}
function license(fetch, saved) {
  const data = new Map(saved ? [['spotmusic_mobile_license', JSON.stringify(saved)]] : []);
  return load('src/services/licenseClient.ts', { '@capacitor/device': { Device: { getId: async () => ({ identifier: 'device' }) } } }, {
    fetch, localStorage: { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
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
  pause() { this.paused = true; }
  load() {}
  removeAttribute() { this.src = ''; }
  async play() { this.paused = false; this.listeners.get('play')?.(); }
}
function audio(resolver) {
  return load('src/services/audioEngine.ts', {
    '@capacitor/core': { Capacitor: { convertFileSrc: value => value } },
    './localLibrary': { localLibrary: {} },
    './streamResolver': { streamResolver: { resolveFullAudio: resolver, clearCache() {} } }
  }, { Audio: FakeAudio, navigator: {}, location: { href: 'https://localhost', origin: 'https://localhost' }, window: {} }).audioEngine;
}
test('rapid track changes ignore an older asynchronous resolution', async () => {
  let complete;
  const engine = audio(() => new Promise(resolve => { complete = resolve; }));
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
