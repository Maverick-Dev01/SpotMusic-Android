import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  apkUrl?: string;
  apkName?: string;
  releaseNotes?: string;
}

class UpdaterClient {
  public currentVersion = '1.0.6';
  private repoOwner = 'Maverick-Dev01';
  private repoName = 'SpotMusic-Android';

  public async checkForUpdates(): Promise<UpdateInfo> {
    try {
      const res = await fetch(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/releases`);
      if (!res.ok) {
        return { hasUpdate: false, currentVersion: this.currentVersion, latestVersion: this.currentVersion };
      }

      const releases = await res.json();
      if (!Array.isArray(releases) || releases.length === 0) {
        return { hasUpdate: false, currentVersion: this.currentVersion, latestVersion: this.currentVersion };
      }

      // Find the newest release that contains an .apk asset
      let targetRelease: any = null;
      let apkUrl = '';
      let apkName = '';

      for (const rel of releases) {
        if (Array.isArray(rel.assets)) {
          const apk = rel.assets.find((a: any) => a.name && a.name.toLowerCase().endsWith('.apk'));
          if (apk) {
            targetRelease = rel;
            apkUrl = apk.browser_download_url;
            apkName = apk.name;
            break;
          }
        }
      }

      if (!targetRelease || !apkUrl) {
        return { hasUpdate: false, currentVersion: this.currentVersion, latestVersion: this.currentVersion };
      }

      const tagName = targetRelease.tag_name || targetRelease.version || '';
      const latestVersion = tagName.replace(/^v/, '').trim();
      const hasUpdate = this.isNewer(latestVersion, this.currentVersion);

      return {
        hasUpdate,
        currentVersion: this.currentVersion,
        latestVersion,
        apkUrl,
        apkName,
        releaseNotes: targetRelease.body || 'Nuevas mejoras y optimizaciones para Android'
      };
    } catch (e: any) {
      console.warn('Update check failed:', e.message);
      return { hasUpdate: false, currentVersion: this.currentVersion, latestVersion: this.currentVersion };
    }
  }

  private isNewer(latest: string, current: string): boolean {
    const pL = latest.split('.').map(n => parseInt(n, 10) || 0);
    const pC = current.split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pL.length, pC.length); i++) {
      const vL = pL[i] || 0;
      const vC = pC[i] || 0;
      if (vL > vC) return true;
      if (vL < vC) return false;
    }
    return false;
  }

  public async downloadAndInstall(apkUrl: string, onProgress?: (pct: number) => void): Promise<void> {
    if (!apkUrl) throw new Error('URL de APK no disponible');

    try {
      onProgress?.(25);
      // 1. Native background download using Capacitor Filesystem (No CORS, follows redirects)
      const dlRes = await Filesystem.downloadFile({
        url: apkUrl,
        path: 'SpotMusic_Update.apk',
        directory: Directory.Cache,
        recursive: true
      });

      onProgress?.(80);

      const AppUpdater = (Capacitor.Plugins as any).AppUpdater;
      if (AppUpdater && AppUpdater.installApk && dlRes.path) {
        onProgress?.(100);
        await AppUpdater.installApk({ path: dlRes.path });
        return;
      }
    } catch (e) {
      console.warn('Native download failed, opening browser:', e);
    }

    // 2. Guaranteed fallback: Open in native Android browser/system download manager
    onProgress?.(100);
    window.open(apkUrl, '_system');
  }
}

export const updaterClient = new UpdaterClient();
