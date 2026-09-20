export interface Track {
  id: string;
  name: string;
  artists: string;
  album: string;
  duration_ms: number;
  duration_str: string;
  cover_url: string;
  preview_url?: string | null;
  audio_url?: string;
  isLocal?: boolean;
  localPath?: string;
  format?: string;
  size?: string;
  addedAt?: number;
  isFavorite?: boolean;
  externalUrl?: string;
  isrc?: string;
  // Spotify's 0-100 popularity, present only on results that came from its API.
  popularity?: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  cover_url?: string;
  trackCount: number;
  tracks: Track[];
  source?: 'local' | 'spotify';
  sourceUrl?: string;
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface LicenseInfo {
  valid: boolean;
  status: 'active' | 'revoked' | 'expired' | 'unlicensed';
  clientName?: string;
  expiresAt?: string | number;
  licenseType?: string;
  machineId?: string;
  token?: string;
  error?: string;
}

export interface DownloadTask {
  track: Track;
  status: 'queued' | 'downloading' | 'completed' | 'error' | 'cancelled';
  percent: number;
  speed?: string;
  error?: string;
  quality?: string;
  attempts?: number;
  nextAttemptAt?: number;
}

export type DownloadQuality = '320k' | '192k' | '128k' | 'flac';
export type StorageLocation = 'Music' | 'Download' | 'Documents';
