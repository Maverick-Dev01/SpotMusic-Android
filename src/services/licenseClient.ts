import { Device } from '@capacitor/device';
import { LicenseInfo } from '../types';

const SUPABASE_URL = 'https://ekxbhsztryixtstksmiw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__6pHi1TcS0HVmW-XryfCnQ_r5MqzPG9';
const STORAGE_KEY = 'spotmusic_mobile_license';

class LicenseClient {
  private cachedLicense: LicenseInfo | null = null;
  private machineId: string = '';

  constructor() {
    this.initMachineId();
  }

  private async initMachineId(): Promise<string> {
    if (this.machineId) return this.machineId;
    try {
      const info = await Device.getId();
      this.machineId = info.identifier || 'ANDROID-' + Math.random().toString(36).slice(2, 10).toUpperCase();
    } catch (e) {
      let saved = localStorage.getItem('spotmusic_device_id');
      if (!saved) {
        saved = 'ANDROID-' + Math.random().toString(36).slice(2, 10).toUpperCase();
        localStorage.setItem('spotmusic_device_id', saved);
      }
      this.machineId = saved;
    }
    return this.machineId;
  }

  public async getDeviceId(): Promise<string> {
    return this.initMachineId();
  }

  public getSavedLicense(): LicenseInfo {
    if (this.cachedLicense) return this.cachedLicense;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.cachedLicense = JSON.parse(raw);
        return this.cachedLicense!;
      }
    } catch (e) {}

    return {
      valid: false,
      status: 'unlicensed',
      clientName: 'Sin Licencia',
      machineId: this.machineId
    };
  }

  public async checkLicense(forceRemote = false): Promise<LicenseInfo> {
    const current = this.getSavedLicense();
    if (!current.token || (!forceRemote && current.valid)) {
      return current;
    }

    try {
      const devId = await this.getDeviceId();
      // RPC check_license
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_license`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_token: current.token,
          p_machine_id: devId
        })
      });

      if (res.ok) {
        const data = await res.json();
        const info: LicenseInfo = {
          valid: data.valid === true,
          status: data.status || (data.valid ? 'active' : 'unlicensed'),
          clientName: data.client_name || current.clientName || 'Usuario SpotMusic',
          expiresAt: data.expires_at || undefined,
          machineId: devId,
          token: current.token,
          error: data.error
        };

        this.saveLicense(info);
        return info;
      }
    } catch (e: any) {
      console.warn('Remote license check failed, falling back to cached state:', e.message);
    }

    return current;
  }

  public async activateToken(rawToken: string): Promise<LicenseInfo> {
    const token = rawToken.trim().toUpperCase();
    const devId = await this.getDeviceId();

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_license`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_token: token,
          p_machine_id: devId
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.valid) {
          const info: LicenseInfo = {
            valid: true,
            status: 'active',
            clientName: data.client_name || 'Usuario SpotMusic',
            expiresAt: data.expires_at,
            machineId: devId,
            token
          };
          this.saveLicense(info);
          return info;
        } else {
          return {
            valid: false,
            status: data.status || 'unlicensed',
            machineId: devId,
            error: data.error || 'Token de licencia inválido o expirado'
          };
        }
      }
    } catch (e: any) {
      return {
        valid: false,
        status: 'unlicensed',
        machineId: devId,
        error: 'No se pudo conectar con el servidor de licencias KeyForge: ' + e.message
      };
    }

    return {
      valid: false,
      status: 'unlicensed',
      machineId: devId,
      error: 'Error desconocido al validar licencia'
    };
  }

  public removeLicense() {
    this.cachedLicense = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  private saveLicense(info: LicenseInfo) {
    this.cachedLicense = info;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  }
}

export const licenseClient = new LicenseClient();
