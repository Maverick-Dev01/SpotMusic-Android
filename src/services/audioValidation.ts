export function isPreviewAudio(url: string | undefined | null): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return /(^|\.)(apple\.com|mzstatic\.com)$/.test(parsed.hostname) ||
      /preview|\/clip(?:s)?\//i.test(parsed.pathname);
  } catch { return true; }
}

export function isFullAudio(candidate: { audioUrl: string; durationMs: number; source?: string }, expectedMs?: number): boolean {
  if (candidate.source === 'fallback' || isPreviewAudio(candidate.audioUrl)) return false;
  if (!Number.isFinite(candidate.durationMs) || candidate.durationMs <= 0) return false;
  // Catalogue duration is not proof that the returned stream contains the full song.
  if (expectedMs && expectedMs > 45000 && candidate.durationMs < expectedMs * 0.8) return false;
  return true;
}

export function validateAudioBlob(blob: Blob, expectedMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => finish(new Error('No se pudo verificar la duración del archivo.')), 15000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration * 1000;
      finish(!Number.isFinite(duration) || duration <= 0 || (expectedMs > 45000 && duration < expectedMs * .8)
        ? new Error('El proveedor entregó un fragmento o un archivo incompleto. No se guardó como canción completa.') : undefined);
    };
    audio.onerror = () => finish(new Error('El archivo recibido no es audio válido.'));
    audio.src = url;
  });
}
