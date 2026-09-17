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
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  cover_url?: string;
  trackCount: number;
  tracks: Track[];
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface EqualizerPreset {
  name: string;
  gains: [number, number, number, number, number]; // 60Hz, 230Hz, 910Hz, 3600Hz, 14000Hz
  bassBoost: number; // 0 to 10
}

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
}

export type DownloadQuality = '320k' | '192k' | '128k' | 'flac';
export type StorageLocation = 'Music' | 'Download' | 'Documents';
