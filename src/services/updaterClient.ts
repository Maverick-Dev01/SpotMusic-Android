import { Capacitor, registerPlugin } from '@capacitor/core';

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  apkUrl?: string;
  apkName?: string;
  releaseNotes?: string;
}

export interface DownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
}

export interface AppUpdaterPluginType {
  downloadAndInstall(options: { url: string }): Promise<{ success?: boolean; needsPermission?: boolean; path?: string }>;
  installApk(options?: { path?: string }): Promise<{ success: boolean; needsPermission?: boolean }>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (progress: DownloadProgress) => void
  ): Promise<any>;
  removeAllListeners(): Promise<void>;
}

export const AppUpdater = registerPlugin<AppUpdaterPluginType>('AppUpdater');

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

  public async downloadAndInstall(
    apkUrl: string,
    onProgress?: (pct: number) => void
  ): Promise<{ success?: boolean; needsPermission?: boolean; path?: string }> {
    if (!apkUrl) throw new Error('URL de APK no disponible');

    if (Capacitor.isNativePlatform()) {
      let handle: any = null;
      try {
        if (onProgress) {
          handle = await AppUpdater.addListener('downloadProgress', (data: DownloadProgress) => {
            onProgress(data.percent);
          });
        }

        const res = await AppUpdater.downloadAndInstall({ url: apkUrl });
        return res;
      } finally {
        if (handle && typeof handle.remove === 'function') {
          handle.remove();
        }
      }
    } else {
      window.open(apkUrl, '_blank');
      return { success: true };
    }
  }

  public async installApk(path?: string): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await AppUpdater.installApk({ path });
    }
  }

  public async openInstallSettings(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await AppUpdater.openInstallSettings();
    }
  }
}

export const updaterClient = new UpdaterClient();
