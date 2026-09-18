import { Capacitor, registerPlugin } from '@capacitor/core';

export interface NativeResolvedAudio {
  audioUrl: string;
  durationMs: number;
  durationStr: string;
  format: string;
  source: 'native';
  title: string;
  artist: string;
  size: number;
}

interface NativeAudioResolverPlugin {
  resolve(options: { title: string; artist: string; durationMs?: number }): Promise<NativeResolvedAudio>;
}

const NativeAudioResolver = registerPlugin<NativeAudioResolverPlugin>('NativeAudioResolver');

export async function resolveNativeAudio(
  title: string,
  artist: string,
  durationMs?: number
): Promise<NativeResolvedAudio | null> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null;
  try {
    return await NativeAudioResolver.resolve({ title, artist, durationMs });
  } catch (err) {
    console.warn('NativeAudioResolver notice (falling back to stream resolver):', err);
    return null;
  }
}
