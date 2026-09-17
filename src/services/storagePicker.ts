import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

export interface StorageDirectoryInfo {
  selected: boolean;
  uri?: string;
  label?: string;
}

interface StoragePickerPlugin {
  chooseDirectory(): Promise<StorageDirectoryInfo>;
  getDirectory(): Promise<StorageDirectoryInfo>;
  useDefaultDirectory(): Promise<StorageDirectoryInfo>;
  downloadFile(options: { url: string; filename: string }): Promise<{ uri: string; size: number }>;
  copyFile(options: { source: string; filename: string }): Promise<{ uri: string; size: number }>;
  deleteFile(options: { uri: string }): Promise<void>;
  addListener(eventName: 'downloadProgress', listener: (event: { downloaded: number; total: number; percent: number }) => void): Promise<PluginListenerHandle>;
}

const NativeStoragePicker = registerPlugin<StoragePickerPlugin>('StoragePicker');

class StoragePickerClient {
  get available() { return Capacitor.isNativePlatform(); }
  async chooseDirectory() { return NativeStoragePicker.chooseDirectory(); }
  async getDirectory(): Promise<StorageDirectoryInfo> {
    return this.available ? NativeStoragePicker.getDirectory() : { selected: false };
  }
  async useDefaultDirectory() {
    return this.available ? NativeStoragePicker.useDefaultDirectory() : { selected: false };
  }
  async downloadFile(url: string, filename: string, onProgress?: (percent: number) => void) {
    const listener = onProgress
      ? await NativeStoragePicker.addListener('downloadProgress', event => onProgress(event.percent))
      : null;
    try {
      return await NativeStoragePicker.downloadFile({ url, filename });
    } finally {
      await listener?.remove();
    }
  }
  async copyFile(source: string, filename: string) {
    return NativeStoragePicker.copyFile({ source, filename });
  }
  async deleteFile(uri: string) {
    if (this.available && uri) await NativeStoragePicker.deleteFile({ uri });
  }
}

export const storagePicker = new StoragePickerClient();
