import { Device } from '@capacitor/device';
import { App } from '@capacitor/app';
import { LicenseInfo } from '../types';

const SUPABASE_URL = 'https://ekxbhsztryixtstksmiw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__6pHi1TcS0HVmW-XryfCnQ_r5MqzPG9';
const STORAGE_KEY = 'spotmusic_mobile_license';

class LicenseClient {
  private cachedLicense: LicenseInfo | null = null;
  private verifiedAt = 0;
  private machineId: string = '';
  private listeners: Set<(info: LicenseInfo) => void> = new Set();

  constructor() {
    this.initMachineId();
    this.initSyncListeners();
  }

  private initSyncListeners() {
    try {
      App.addListener('appStateChange', (state) => {
        if (state.isActive) {
          this.checkLicense(true);
        }
      });
    } catch (e) {}

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        this.checkLicense(true);
      });
    }

    // Fast heartbeat check every 15 seconds for rapid revocation & reactivation reflection
    setInterval(() => {
      const current = this.getSavedLicense();
      if (current && current.token) {
        this.checkLicense(false);
      }
    }, 15000);
  }

  public on(event: 'change', cb: (info: LicenseInfo) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(info: LicenseInfo) {
    this.listeners.forEach(cb => {
      try { cb(info); } catch (e) {}
    });
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
    if (this.cachedLicense) return this.withExpiry(this.cachedLicense);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.cachedLicense = JSON.parse(raw);
        return this.withExpiry(this.cachedLicense!);
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
    if (!current.token) return { ...current, valid: false, status: 'unlicensed' };
    
    const shouldCheckOnline = forceRemote || 
      !this.verifiedAt || 
      (Date.now() - this.verifiedAt > 15000);

    if (!shouldCheckOnline) {
      return current;
    }

    try {
      const devId = await this.getDeviceId();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_license`, {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
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
          expiresAt: data.expiresAt ?? data.expires_at ?? current.expiresAt,
          licenseType: data.licenseType ?? data.license_type ?? data.plan ?? current.licenseType,
          machineId: devId,
          token: current.token,
          error: data.message || data.error
        };

        this.saveLicense(info);
        return this.withExpiry(info);
      }
    } catch (e: any) {
      console.warn('Remote license verification unavailable:', e.message);
    }

    return { ...current, valid: false, error: 'Conéctate a KeyForge para verificar la licencia. Tu música local sigue disponible.' };
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
        signal: AbortSignal.timeout(12000),
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
            expiresAt: data.expiresAt ?? data.expires_at,
            licenseType: data.licenseType ?? data.license_type ?? data.plan,
            machineId: devId,
            token
          };
          this.saveLicense(info);
          return this.withExpiry(info);
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
    this.notify({
      valid: false,
      status: 'unlicensed',
      clientName: 'Sin Licencia',
      machineId: this.machineId
    });
  }

  private withExpiry(info: LicenseInfo): LicenseInfo {
    const expiry = licenseExpiry(info.expiresAt);
    if (expiry !== null && (!Number.isFinite(expiry) || expiry <= Date.now())) {
      return { ...info, valid: false, status: 'expired' };
    }
    return info;
  }

  private saveLicense(info: LicenseInfo) {
    info = this.withExpiry(info);
    this.verifiedAt = Date.now();
    this.cachedLicense = info;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
    this.notify(info);
  }
}

export const licenseClient = new LicenseClient();

export function licenseExpiry(value: LicenseInfo['expiresAt']): number | null {
  if (value === undefined || value === null || value === '' || String(value) === '-1') return null;
  const n = Number(value);
  return Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(String(value));
}

export function licenseDetails(info: LicenseInfo): string {
  const expiry = licenseExpiry(info.expiresAt);
  const type = info.licenseType || (String(info.expiresAt) === '-1' ? 'Permanente' : 'Tipo no informado');
  if (expiry === null) return `${type} · ${String(info.expiresAt) === '-1' ? 'Sin vencimiento' : 'Vigencia no informada'}`;
  if (!Number.isFinite(expiry)) return `${type} · Fecha no válida`;
  const remaining = expiry - Date.now();
  return `${type} · ${remaining <= 0 ? 'Vencida' : Math.ceil(remaining / 86400000) + ' días restantes'} · ${new Date(expiry).toLocaleString('es-MX')}`;
}
