import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { CapacitorHttp } from '@capacitor/core';
import { spotifyClient } from './spotifyClient';

type AuthListener = () => void;

const REDIRECT_URI = 'spotmusic-login://callback';
// OAuth client IDs are public identifiers in installed apps. Authentication uses PKCE;
// a client secret must never be bundled in the APK.
const DEFAULT_CLIENT_ID = 'e0e9be08cc8f4815a6b726ee648016f2';
const CLIENT_ID_KEY = 'spotmusic_spotify_client_id';
const ACCESS_TOKEN_KEY = 'spotmusic_spotify_access_token_v2';
const REFRESH_TOKEN_KEY = 'spotmusic_spotify_refresh_token';
const EXPIRES_AT_KEY = 'spotmusic_spotify_expires_at';
const VERIFIER_KEY = 'spotmusic_spotify_pkce_verifier';
const STATE_KEY = 'spotmusic_spotify_oauth_state';

class SpotifyAuth {
  private initialized = false;
  private listeners = new Set<AuthListener>();

  public get clientId(): string {
    const configured = localStorage.getItem(CLIENT_ID_KEY)?.trim() || '';
    const buildEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    return configured || String(buildEnv?.VITE_SPOTIFY_CLIENT_ID || '').trim() || DEFAULT_CLIENT_ID;
  }

  public get configured() { return !!this.clientId; }
  public get connected() { return spotifyClient.hasAccessToken; }
  public get redirectUri() { return REDIRECT_URI; }

  public subscribe(listener: AuthListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  public setClientId(value: string) {
    const clean = value.trim();
    if (clean && !/^[a-zA-Z0-9]{20,64}$/.test(clean)) {
      throw new Error('El Client ID de Spotify no tiene un formato válido.');
    }
    if (clean) localStorage.setItem(CLIENT_ID_KEY, clean);
    else localStorage.removeItem(CLIENT_ID_KEY);
    this.disconnect(false);
    this.notify();
  }

  public async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    await App.addListener('appUrlOpen', ({ url }) => {
      if (url?.startsWith(REDIRECT_URI)) void this.handleCallback(url);
    });

    const token = localStorage.getItem(ACCESS_TOKEN_KEY) || '';
    const expiresAt = Number(localStorage.getItem(EXPIRES_AT_KEY) || 0);
    if (token && expiresAt > Date.now() + 30_000) {
      spotifyClient.setAccessToken(token);
      this.notify();
      return;
    }
    if (localStorage.getItem(REFRESH_TOKEN_KEY) && this.configured) {
      try { await this.refreshAccessToken(); } catch { this.disconnect(false); }
    }
  }

  public async ensureAccessToken(): Promise<boolean> {
    const expiresAt = Number(localStorage.getItem(EXPIRES_AT_KEY) || 0);
    if (spotifyClient.hasAccessToken && expiresAt > Date.now() + 30_000) return true;
    if (localStorage.getItem(REFRESH_TOKEN_KEY) && this.configured) {
      try {
        await this.refreshAccessToken();
        return spotifyClient.hasAccessToken;
      } catch {
        this.disconnect(false);
      }
    }
    return false;
  }

  public async connect() {
    if (!this.clientId) throw new Error('Primero guarda el Client ID de tu aplicación de Spotify.');
    const verifier = this.randomUrlSafe(64);
    const state = this.randomUrlSafe(24);
    const challenge = await this.pkceChallenge(verifier);
    localStorage.setItem(VERIFIER_KEY, verifier);
    localStorage.setItem(STATE_KEY, state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: 'playlist-read-private playlist-read-collaborative',
      code_challenge_method: 'S256',
      code_challenge: challenge,
      redirect_uri: REDIRECT_URI,
      state,
      show_dialog: 'true'
    });
    await Browser.open({ url: `https://accounts.spotify.com/authorize?${params.toString()}` });
  }

  private async handleCallback(callbackUrl: string) {
    try { await Browser.close(); } catch {}
    try {
      const parsed = new URL(callbackUrl);
      const error = parsed.searchParams.get('error');
      if (error) throw new Error(error === 'access_denied' ? 'Conexión cancelada.' : `Spotify rechazó la conexión: ${error}`);
      const state = parsed.searchParams.get('state') || '';
      const expectedState = localStorage.getItem(STATE_KEY) || '';
      const code = parsed.searchParams.get('code') || '';
      const verifier = localStorage.getItem(VERIFIER_KEY) || '';
      if (!state || !expectedState || state !== expectedState) throw new Error('La respuesta de Spotify no pasó la validación de seguridad.');
      if (!code || !verifier) throw new Error('Spotify no devolvió el código de autorización.');
      const tokens = await this.tokenRequest(new URLSearchParams({
        client_id: this.clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier
      }));
      this.storeTokens(tokens);
    } catch (error) {
      console.warn('Spotify OAuth:', error);
      this.disconnect(false);
    } finally {
      localStorage.removeItem(VERIFIER_KEY);
      localStorage.removeItem(STATE_KEY);
      this.notify();
    }
  }

  private async refreshAccessToken() {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY) || '';
    if (!refreshToken || !this.clientId) throw new Error('No hay una sesión renovable de Spotify.');
    const tokens = await this.tokenRequest(new URLSearchParams({
      client_id: this.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }));
    this.storeTokens(tokens);
    this.notify();
  }

  private async tokenRequest(body: URLSearchParams): Promise<any> {
    const response = await CapacitorHttp.request({
      method: 'POST',
      url: 'https://accounts.spotify.com/api/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      data: body.toString(),
      connectTimeout: 15000,
      readTimeout: 20000
    });
    const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (response.status < 200 || response.status >= 300 || !data?.access_token) {
      throw new Error(data?.error_description || `Spotify respondió HTTP ${response.status}`);
    }
    return data;
  }

  private storeTokens(tokens: any) {
    const accessToken = String(tokens.access_token || '');
    if (!accessToken) throw new Error('Spotify no devolvió un token válido.');
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(EXPIRES_AT_KEY, String(Date.now() + Math.max(60, Number(tokens.expires_in) || 3600) * 1000));
    if (tokens.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, String(tokens.refresh_token));
    spotifyClient.setAccessToken(accessToken);
  }

  public disconnect(notify = true) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(EXPIRES_AT_KEY);
    localStorage.removeItem(VERIFIER_KEY);
    localStorage.removeItem(STATE_KEY);
    spotifyClient.setAccessToken('');
    if (notify) this.notify();
  }

  private randomUrlSafe(length: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return this.base64Url(bytes);
  }

  private async pkceChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return this.base64Url(new Uint8Array(digest));
  }

  private base64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
}

export const spotifyAuth = new SpotifyAuth();
