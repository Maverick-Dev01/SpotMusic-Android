import { appDialog } from './AppDialog';
import { updaterClient, UpdateInfo } from '../services/updaterClient';

export class UpdatesModal {
  private overlay: HTMLElement;
  private currentInfo: UpdateInfo | null = null;
  private isUpdating = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'updates-modal-overlay';
    this.overlay.className = 'fixed inset-0 bg-obsidian-900/95 backdrop-blur-2xl z-50 flex items-center justify-center p-5 transition-opacity duration-300 opacity-0 pointer-events-none';

    this.overlay.innerHTML = `
      <div class="w-full max-w-sm rounded-3xl bg-obsidian-800 border border-white/10 p-6 flex flex-col gap-4 shadow-2xl">
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-sonic-green/10 border border-sonic-green/20 flex items-center justify-center text-sonic-green">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </div>
            <div>
              <h3 class="text-sm font-bold text-white">Actualizaciones</h3>
              <p class="text-[11px] text-white/50" id="updates-current-ver">SpotMusic v${updaterClient.currentVersion}</p>
            </div>
          </div>
          <button id="btn-close-updates" class="p-2 text-white/40 hover:text-white rounded-full hover:bg-white/5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Status Box -->
        <div class="rounded-2xl bg-white/5 border border-white/5 p-4 flex flex-col gap-2" id="updates-status-box">
          <div class="flex items-center justify-between text-xs">
            <span class="text-white/60">Estado:</span>
            <span id="updates-status-badge" class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white/70">Comprobando...</span>
          </div>
          <p id="updates-status-msg" class="text-xs text-white/80">Buscando la versión más reciente en GitHub...</p>
        </div>

        <!-- Progress Bar (hidden by default) -->
        <div id="updates-progress-container" class="hidden flex flex-col gap-1.5">
          <div class="flex justify-between text-[11px] text-white/60">
            <span>Descargando APK...</span>
            <span id="updates-progress-pct">0%</span>
          </div>
          <div class="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div id="updates-progress-bar" class="h-full bg-gradient-to-r from-sonic-green to-sonic-emerald transition-all duration-300" style="width: 0%;"></div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-2.5 pt-2">
          <button id="btn-check-updates-now" class="flex-1 py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs active:scale-95 transition-all">
            Buscar
          </button>
          <button id="btn-install-update-action" class="hidden flex-1 py-3 rounded-2xl bg-sonic-green hover:bg-emerald-400 text-black font-bold text-xs shadow-lg shadow-green-500/20 active:scale-95 transition-all">
            Actualizar Ahora
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.setupEvents();
  }

  private setupEvents() {
    document.getElementById('btn-close-updates')?.addEventListener('click', () => this.close());
    document.getElementById('btn-check-updates-now')?.addEventListener('click', () => this.check());

    document.getElementById('btn-install-update-action')?.addEventListener('click', async () => {
      if (!this.currentInfo?.apkUrl || this.isUpdating) return;
      this.isUpdating = true;

      const progContainer = document.getElementById('updates-progress-container');
      const progBar = document.getElementById('updates-progress-bar');
      const progPct = document.getElementById('updates-progress-pct');
      const statusMsg = document.getElementById('updates-status-msg');
      const actionBtn = document.getElementById('btn-install-update-action') as HTMLButtonElement;

      if (progContainer) progContainer.classList.remove('hidden');
      if (actionBtn) actionBtn.disabled = true;
      if (statusMsg) statusMsg.textContent = 'Descargando paquete de actualización...';

      try {
        const result = await updaterClient.downloadAndInstall(this.currentInfo.apkUrl, (pct) => {
          if (progBar) progBar.style.width = `${pct}%`;
          if (progPct) progPct.textContent = `${pct}%`;
        });
        if (statusMsg) statusMsg.textContent = result.needsPermission ? 'Permite instalar apps en Ajustes y vuelve a pulsar Instalar.' : 'Instalador solicitado. Confirma la instalación en Android.';
        actionBtn.textContent = 'Instalar';
      } catch (err: any) {
        await appDialog.alert('Error en la actualización: ' + (err.message || err));
        if (statusMsg) statusMsg.textContent = 'Fallo en la descarga. Puedes intentar nuevamente.';
      } finally {
        this.isUpdating = false;
        if (actionBtn) actionBtn.disabled = false;
      }
    });
  }

  public async check() {
    if (this.isUpdating) return;
    const statusBadge = document.getElementById('updates-status-badge');
    const statusMsg = document.getElementById('updates-status-msg');
    const actionBtn = document.getElementById('btn-install-update-action');
    const badgeTop = document.getElementById('badge-update-available');

    if (statusBadge) {
      statusBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white/70';
      statusBadge.textContent = 'Buscando...';
    }
    if (statusMsg) statusMsg.textContent = 'Conectando con el repositorio oficial...';
    if (actionBtn) actionBtn.classList.add('hidden');

    try {
      const info = await updaterClient.checkForUpdates();
      this.currentInfo = info;
      const versionLabel = document.getElementById('updates-current-ver');
      if (versionLabel) versionLabel.textContent = `SpotMusic v${info.currentVersion}`;

      if (info.hasUpdate) {
        if (statusBadge) {
          statusBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-sonic-green/20 text-sonic-green';
          statusBadge.textContent = `v${info.latestVersion} Disponible`;
        }
        if (statusMsg) statusMsg.textContent = `¡Nueva versión disponible! (${info.releaseNotes || 'Mejoras y correcciones'})`;
        if (actionBtn) actionBtn.classList.remove('hidden');
        if (badgeTop) badgeTop.classList.remove('hidden');
      } else {
        if (statusBadge) {
          statusBadge.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-sonic-green';
          statusBadge.textContent = 'Al día ✓';
        }
        if (statusMsg) statusMsg.textContent = `Tienes la versión más reciente (v${updaterClient.currentVersion}).`;
        if (badgeTop) badgeTop.classList.add('hidden');
      }
    } catch (e: any) {
      if (statusBadge) statusBadge.textContent = 'Sin comprobar';
      if (statusMsg) statusMsg.textContent = e.message || 'No se pudo comprobar actualizaciones.';
    }
  }

  public open() {
    this.overlay.classList.remove('pointer-events-none', 'opacity-0');
    this.overlay.classList.add('opacity-100');
    this.check();
  }

  public close() {
    this.overlay.classList.add('pointer-events-none', 'opacity-0');
    this.overlay.classList.remove('opacity-100');
  }
}
