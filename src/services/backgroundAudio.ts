import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

export interface BackgroundAudioTrackInfo {
  url: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl?: string;
  durationMs?: number;
  positionMs?: number;
}

export interface BackgroundAudioState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export interface BackgroundAudioPlugin {
  play(options: BackgroundAudioTrackInfo): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  togglePlay(): Promise<void>;
  seek(options: { positionMs: number }): Promise<void>;
  stop(): Promise<void>;
  getState(): Promise<BackgroundAudioState>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  addListener(eventName: 'onPlay', listenerFunc: (data: { isPlaying: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'onPause', listenerFunc: (data: { isPlaying: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'onNext', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'onPrevious', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'onTimeUpdate', listenerFunc: (data: { currentTime: number; duration: number; positionMs: number; durationMs: number }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'onEnded', listenerFunc: () => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'onError', listenerFunc: (data: { message: string }) => void): Promise<PluginListenerHandle>;
}

const BackgroundAudio = registerPlugin<BackgroundAudioPlugin>('BackgroundAudio');

export { BackgroundAudio };

export const isNativeAudioSupported = (): boolean => {
  return Capacitor.isNativePlatform();
};
