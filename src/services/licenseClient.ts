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
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_license`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          p_token: current.token.trim(),
          p_machine_id: devId.trim().toUpperCase()
        })
      });

      if (res.ok) {
        const data = await res.json();
        const isValid = data.valid === true;
        const info: LicenseInfo = {
          valid: isValid,
          status: data.status || (isValid ? 'active' : 'unlicensed'),
          clientName: data.clientName || data.client_name || current.clientName || 'Usuario SpotMusic',
          expiresAt: data.expiresAt || data.expires_at || current.expiresAt,
          machineId: devId,
          token: current.token,
          error: data.message || data.error
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
    // IMPORTANT: NEVER uppercase the token! Base64URL and HMAC are strictly case-sensitive!
    const token = rawToken.trim();
    const devId = (await this.getDeviceId()).trim().toUpperCase();

    if (!token) {
      return {
        valid: false,
        status: 'unlicensed',
        machineId: devId,
        error: 'Por favor introduce una clave de licencia válida.'
      };
    }

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
        if (data.valid === true) {
          const info: LicenseInfo = {
            valid: true,
            status: 'active',
            clientName: data.clientName || data.client_name || 'Usuario SpotMusic',
            expiresAt: data.expiresAt || data.expires_at,
            machineId: devId,
            token
          };
          this.saveLicense(info);
          return info;
        } else {
          const errorMsg = data.message || data.error || (data.status === 'revoked' ? 'Esta licencia ha sido revocada en KeyForge.' : data.status === 'expired' ? 'Esta licencia ha expirado.' : 'Licencia no registrada o no coincide con este dispositivo.');
          return {
            valid: false,
            status: data.status || 'unlicensed',
            machineId: devId,
            error: errorMsg
          };
        }
      }
    } catch (e: any) {
      // Offline fallback verification: check if it's a standard signed token
      if (token.includes('.')) {
        try {
          const [payloadB64] = token.split('.');
          const jsonStr = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(jsonStr);

          if (payload.machineId && payload.machineId.toUpperCase() === devId) {
            const isExpired = payload.expiresAt !== -1 && payload.expiresAt < Date.now();
            if (!isExpired) {
              const info: LicenseInfo = {
                valid: true,
                status: 'active',
                clientName: payload.clientName || 'Usuario SpotMusic',
                expiresAt: payload.expiresAt,
                machineId: devId,
                token
              };
              this.saveLicense(info);
              return info;
            } else {
              return { valid: false, status: 'expired', machineId: devId, error: 'Esta licencia expiró según los registros locales.' };
            }
          }
        } catch {}
      }

      return {
        valid: false,
        status: 'unlicensed',
        machineId: devId,
        error: 'No se pudo conectar con el servidor KeyForge: ' + e.message
      };
    }

    return {
      valid: false,
      status: 'unlicensed',
      machineId: devId,
      error: 'Error desconocido al validar licencia con el servidor'
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
