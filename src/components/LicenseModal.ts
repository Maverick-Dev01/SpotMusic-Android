import { licenseClient } from '../services/licenseClient';

export class LicenseModal {
  private overlay: HTMLElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'license-modal-overlay';
    this.overlay.className = 'fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-opacity duration-300 opacity-0 pointer-events-none';

    this.overlay.innerHTML = `
      <div class="bg-obsidian-800 border border-white/15 rounded-[28px] p-5 w-full max-w-sm flex flex-col gap-4 shadow-2xl scale-95 transition-transform duration-300" id="license-modal-card">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-sonic-emerald/20 text-sonic-emerald flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <div>
              <h3 class="text-sm font-bold text-white">Licencia KeyForge Pro</h3>
              <p class="text-[11px] text-white/50">Activación de software</p>
            </div>
          </div>
          <button id="btn-close-license" class="p-2 rounded-xl bg-white/10 text-white/70 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- License Status Card -->
        <div class="bg-obsidian-900/80 rounded-2xl p-3.5 border border-white/5 space-y-2">
          <div class="flex items-center justify-between text-xs">
            <span class="text-white/50">Estado:</span>
            <span id="license-status-badge" class="px-2 py-0.5 rounded-full font-semibold text-[10px] bg-yellow-500/20 text-yellow-400">Sin Licencia</span>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-white/50">Titular:</span>
            <span id="license-client-name" class="font-medium text-white/80">--</span>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-white/50">Device ID:</span>
            <span id="license-device-id" class="font-mono text-[10px] text-white/60 select-all truncate max-w-[170px]">Cargando...</span>
          </div>
        </div>

        <!-- Token Input -->
        <div class="space-y-2">
          <label class="text-xs font-semibold text-white/70">Ingresa tu clave de licencia:</label>
          <input type="text" id="input-license-token" placeholder="KF-XXXX-XXXX-XXXX" class="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-xs placeholder:text-white/30 focus:outline-none focus:border-sonic-emerald transition-all uppercase" />
          <button id="btn-activate-token" class="w-full py-2.5 rounded-xl bg-sonic-emerald hover:bg-emerald-400 text-black font-bold text-xs transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/20">
            <span>Activar Licencia</span>
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.setupEvents();
  }

  private setupEvents() {
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    document.getElementById('btn-close-license')?.addEventListener('click', () => this.close());

    document.getElementById('btn-activate-token')?.addEventListener('click', async () => {
      const input = document.getElementById('input-license-token') as HTMLInputElement;
      const btn = document.getElementById('btn-activate-token') as HTMLButtonElement;
      const token = input?.value.trim() || '';

      if (!token) return alert('Escribe tu token de licencia');

      btn.disabled = true;
      btn.innerHTML = '<span class="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin"></span>';

      try {
        const res = await licenseClient.activateToken(token);
        if (res.valid) {
          alert('¡Licencia activada con éxito para ' + (res.clientName || 'tu dispositivo') + '!');
          this.refreshUI();
          this.close();
        } else {
          alert(res.error || 'No se pudo activar la licencia');
        }
      } catch (e: any) {
        alert(e.message || 'Error al conectar');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Activar Licencia</span>';
      }
    });
  }

  public async refreshUI() {
    const info = await licenseClient.checkLicense();
    const devId = await licenseClient.getDeviceId();

    const badge = document.getElementById('license-status-badge');
    const clientName = document.getElementById('license-client-name');
    const devIdSpan = document.getElementById('license-device-id');

    if (devIdSpan) devIdSpan.textContent = devId;
    if (clientName) clientName.textContent = info.clientName || 'Sin Registrar';

    if (badge) {
      if (info.valid) {
        badge.className = 'px-2 py-0.5 rounded-full font-semibold text-[10px] bg-sonic-green/20 text-sonic-green border border-sonic-green/30';
        badge.textContent = 'Activa ✓';
      } else if (info.status === 'revoked') {
        badge.className = 'px-2 py-0.5 rounded-full font-semibold text-[10px] bg-red-500/20 text-red-400 border border-red-500/30';
        badge.textContent = 'Revocada ✗';
      } else {
        badge.className = 'px-2 py-0.5 rounded-full font-semibold text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
        badge.textContent = 'Sin Licencia';
      }
    }
  }

  public open() {
    this.overlay.classList.remove('pointer-events-none', 'opacity-0');
    this.overlay.classList.add('opacity-100');
    const card = document.getElementById('license-modal-card');
    card?.classList.remove('scale-95');
    card?.classList.add('scale-100');
    this.refreshUI();
  }

  public close() {
    this.overlay.classList.add('pointer-events-none', 'opacity-0');
    this.overlay.classList.remove('opacity-100');
    const card = document.getElementById('license-modal-card');
    card?.classList.add('scale-95');
    card?.classList.remove('scale-100');
  }

  public toggle() {
    if (this.overlay.classList.contains('opacity-100')) this.close();
    else this.open();
  }
}
