import { appDialog } from './AppDialog';
import { licenseClient, licenseDetails } from '../services/licenseClient';
import { updaterClient, UpdateInfo } from '../services/updaterClient';
import { streamResolver } from '../services/streamResolver';
import { downloadEngine } from '../services/downloadEngine';
import { storagePicker } from '../services/storagePicker';
import { spotifyAuth } from '../services/spotifyAuth';
import { audioEngine } from '../services/audioEngine';
import { copyToClipboard } from '../utils/clipboard';

export class SettingsModal {
  private overlay: HTMLElement;
  private currentUpdateInfo: UpdateInfo | null = null;
  private isUpdating = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'settings-modal-overlay';
    this.overlay.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-opacity duration-300 opacity-0 pointer-events-none';

    this.overlay.innerHTML = `
      <div class="bg-obsidian-800 border border-white/15 rounded-[28px] p-5 w-full max-w-md max-h-[90vh] flex flex-col gap-4 shadow-2xl scale-95 transition-transform duration-300 overflow-hidden" id="settings-modal-card">
        
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-white/10 pb-3 flex-shrink-0">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl bg-sonic-green/15 text-sonic-green flex items-center justify-center border border-sonic-green/30">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </div>
            <div>
              <h3 class="text-sm font-bold text-white">Configuración & Perfil</h3>
              <p class="text-[11px] text-white/50">Ajustes generales del sistema</p>
            </div>
          </div>
          <button id="btn-close-settings" class="p-2 rounded-xl bg-white/10 text-white/70 hover:text-white transition-all active:scale-90">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-none text-xs">
          
          <!-- SECTION 1: LICENCIA KEYFORGE -->
          <div class="rounded-2xl bg-obsidian-900/80 border border-white/10 p-3.5 space-y-3">
            <div class="flex items-center justify-between">
              <span class="font-bold text-white flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>Licencia KeyForge</span>
              </span>
              <span id="settings-license-badge" class="px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">Sin Licencia</span>
            </div>

            <div class="space-y-1.5 pt-1 border-t border-white/5">
              <div class="flex items-center justify-between text-[11px]">
                <span class="text-white/50">Titular:</span>
                <span id="settings-license-client" class="font-medium text-white/90">--</span>
              </div>
              <div class="flex items-center justify-between text-[11px]">
                <span class="text-white/50">Device ID:</span>
                <div class="flex items-center gap-1.5">
                  <span id="settings-device-id" class="font-mono text-[10px] text-sonic-green select-all truncate max-w-[130px]">Cargando...</span>
                  <button id="btn-settings-copy-device-id" class="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/15 text-[10px] font-semibold text-white/80 active:scale-95 transition-all">
                    <span id="settings-copy-text">Copiar</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Token Activation -->
            <div class="space-y-2 pt-1 border-t border-white/5">
              <textarea id="settings-input-token" rows="2" placeholder="Pega aquí la clave o token copiado de KeyForge..." class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white font-mono text-[11px] placeholder:text-white/30 focus:outline-none focus:border-sonic-green transition-all resize-none"></textarea>
              <div class="flex gap-2">
                <button id="btn-settings-activate" class="flex-1 py-2 rounded-xl bg-sonic-green hover:bg-emerald-400 text-black font-bold text-xs transition-all flex items-center justify-center gap-1 shadow-md shadow-green-500/20 active:scale-95">
                  <span>Activar Licencia</span>
                </button>
                <button id="btn-settings-revoke" class="hidden py-2 px-3 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold text-xs transition-all active:scale-95">
                  <span>Desvincular</span>
                </button>
              </div>
            </div>
          </div>

          <!-- SECTION 2: ACTUALIZACIONES -->
          <div class="rounded-2xl bg-obsidian-900/80 border border-white/10 p-3.5 space-y-3">
            <div class="flex items-center justify-between">
              <span class="font-bold text-white flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span>Actualizaciones del Sistema</span>
              </span>
              <span class="font-mono text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/70">v${updaterClient.currentVersion}</span>
            </div>

            <p id="settings-update-msg" class="text-[11px] text-white/60">Comprueba si hay nuevas versiones publicadas en GitHub.</p>

            <div id="settings-update-progress-container" class="hidden space-y-1">
              <div class="flex justify-between text-[10px] text-white/60">
                <span>Descargando nueva versión...</span>
                <span id="settings-update-pct">0%</span>
              </div>
              <div class="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div id="settings-update-bar" class="h-full bg-sonic-green transition-all duration-300" style="width: 0%;"></div>
              </div>
            </div>

            <div class="flex gap-2">
              <button id="btn-settings-check-update" class="flex-1 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs active:scale-95 transition-all">
                Buscar Actualización
              </button>
              <button id="btn-settings-download-apk" class="hidden flex-1 py-2 rounded-xl bg-sonic-green hover:bg-emerald-400 text-black font-bold text-xs shadow-md shadow-green-500/20 active:scale-95 transition-all">
                Actualizar APK
              </button>
            </div>
          </div>

          <!-- SECTION 3: SPOTIFY -->
          <div class="rounded-2xl bg-obsidian-900/80 border border-white/10 p-3.5 space-y-3">
            <div class="flex items-center justify-between gap-3">
              <span class="font-bold text-white flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" class="text-sonic-green"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.1-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.3c-.3.42-.84.6-1.26.3-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.6-.12-.48.12-1.02.6-1.14C9.6 9.9 15 10.56 18.72 12.84c.36.18.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.3c-.6.18-1.2-.18-1.38-.72-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.3.72 1.02.42 1.56-.3.42-1.02.6-1.56.3z"/></svg>
                <span>Importación de Spotify</span>
              </span>
              <span id="settings-spotify-status" class="px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-sonic-green/20 text-sonic-green border border-sonic-green/30">Integrado ✓</span>
            </div>
            <p id="settings-spotify-help" class="text-[10px] leading-relaxed text-white/60">Vincula tu cuenta para importar todas las páginas de las playlists a las que Spotify te permita acceder.</p>
            <button id="btn-settings-connect-spotify" class="w-full py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs active:scale-95 transition-all">Vincular Cuenta Spotify</button>
          </div>

          <!-- SECTION 4: SALIDA DE AUDIO -->
          <div class="rounded-2xl bg-obsidian-900/80 border border-white/10 p-3.5 space-y-3">
            <div>
              <span class="font-bold text-white flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 5a9 9 0 0 1 0 14"/></svg>
                <span>Salida de audio</span>
              </span>
              <p class="text-[10px] text-white/45 mt-1">Elige el perfil que corresponde al teléfono, bocina o audífonos.</p>
            </div>
            <select id="settings-audio-profile" class="w-full bg-obsidian-800 border border-white/10 rounded-xl px-3 py-2 text-sonic-green font-bold focus:outline-none">
              <option value="Phone">Altavoz del teléfono</option>
              <option value="AntiBoom">Reducir retumbo</option>
              <option value="Speaker">Bocina externa</option>
              <option value="Headphones">Audífonos</option>
              <option value="Flat">Plano / sin ajuste</option>
            </select>
            <div class="flex items-center justify-between gap-3 pt-1">
              <p id="settings-audio-profile-help" class="text-[10px] leading-relaxed text-white/50">Reduce los subgraves para proteger altavoces pequeños.</p>
              <button id="btn-settings-open-eq" class="flex-shrink-0 py-1.5 px-3 rounded-xl bg-white/10 text-sonic-green font-semibold text-xs">Ajuste fino</button>
            </div>
          </div>

          <!-- SECTION 5: APARIENCIA Y TEMA -->
          <div class="rounded-2xl bg-obsidian-900/80 border border-white/10 p-3.5 space-y-3">
            <span class="font-bold text-white flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
              <span>Apariencia y Tema</span>
            </span>

            <div class="grid grid-cols-2 gap-2">
              <button class="btn-theme-mode py-2 px-3 rounded-xl border border-sonic-green bg-sonic-green/15 text-white font-semibold flex items-center justify-center gap-1.5 transition-all" data-mode="dark">
                <span>🌑 Modo Oscuro</span>
              </button>
              <button class="btn-theme-mode py-2 px-3 rounded-xl border border-white/10 bg-white/5 text-white/60 font-semibold flex items-center justify-center gap-1.5 transition-all" data-mode="light">
                <span>☀️ Modo Claro</span>
              </button>
            </div>

            <!-- Color Accents -->
            <div class="pt-1 border-t border-white/5 space-y-1.5">
              <span class="text-[10px] text-white/50 uppercase tracking-wider font-semibold">Color de Acento:</span>
              <div class="flex items-center gap-2 pt-0.5">
                <button class="btn-accent-color w-7 h-7 rounded-full bg-[#1ED760] border-2 border-white transition-all scale-110" data-color="#1ED760" title="Sonic Green"></button>
                <button class="btn-accent-color w-7 h-7 rounded-full bg-[#06B6D4] border border-white/20 transition-all hover:scale-105" data-color="#06B6D4" title="Cyan Neón"></button>
                <button class="btn-accent-color w-7 h-7 rounded-full bg-[#A855F7] border border-white/20 transition-all hover:scale-105" data-color="#A855F7" title="Electric Violet"></button>
                <button class="btn-accent-color w-7 h-7 rounded-full bg-[#F43F5E] border border-white/20 transition-all hover:scale-105" data-color="#F43F5E" title="Sunset Rose"></button>
                <button class="btn-accent-color w-7 h-7 rounded-full bg-[#F59E0B] border border-white/20 transition-all hover:scale-105" data-color="#F59E0B" title="Cyber Amber"></button>
              </div>
            </div>
          </div>

          <!-- SECTION 6: CALIDAD Y DESCARGAS -->
          <div class="rounded-2xl bg-obsidian-900/80 border border-white/10 p-3.5 space-y-3">
            <span class="font-bold text-white flex items-center gap-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
              <span>Calidad de Audio & Descargas</span>
            </span>

            <div class="space-y-1.5">
              <label class="text-[10px] text-white/50 uppercase tracking-wider font-semibold">Calidad de Streaming & Descarga:</label>
              <select id="settings-select-quality" class="w-full bg-obsidian-800 border border-white/10 rounded-xl px-3 py-2 text-sonic-green font-bold focus:outline-none">
                <option value="source">Calidad original de la fuente</option>
              </select>
            </div>

            <div class="flex items-center justify-between gap-3 pt-2 border-t border-white/5">
              <div class="min-w-0">
                <p class="font-semibold text-white">Carpeta de descargas</p>
                <p id="settings-storage-folder" class="text-[10px] text-white/50 truncate">Documents/SpotMusic</p>
              </div>
              <div class="flex gap-1.5 flex-shrink-0">
                <button id="btn-settings-default-folder" class="hidden py-1.5 px-2.5 rounded-xl bg-white/5 text-white/70 text-xs">Predeterminada</button>
                <button id="btn-settings-pick-folder" class="py-1.5 px-2.5 rounded-xl bg-white/10 text-sonic-green font-semibold text-xs">Elegir</button>
              </div>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-white/5">
              <div>
                <p class="font-semibold text-white">Limpiar Caché de la App</p>
                <p class="text-[10px] text-white/40">Libera espacio temporal</p>
              </div>
              <button id="btn-settings-clear-cache" class="py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-xs font-semibold active:scale-95 transition-all">
                Limpiar
              </button>
            </div>
          </div>

        </div>

      </div>
    `;

    document.body.appendChild(this.overlay);
    this.setupEvents();
    this.setupTheme();
  }

  private setupEvents() {
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    document.getElementById('btn-close-settings')?.addEventListener('click', () => this.close());

    document.getElementById('btn-settings-connect-spotify')?.addEventListener('click', async () => {
      if (spotifyAuth.connected) {
        spotifyAuth.disconnect();
        this.refreshSpotifyUI();
        return;
      }
      try {
        await spotifyAuth.connect();
      } catch (error: any) {
        await appDialog.alert(error.message || 'No se pudo abrir la conexión con Spotify.');
      }
    });

    spotifyAuth.subscribe(() => this.refreshSpotifyUI());

    const audioProfile = document.getElementById('settings-audio-profile') as HTMLSelectElement;
    audioProfile?.addEventListener('change', () => {
      audioEngine.applyPreset(audioProfile.value);
      this.refreshAudioUI();
    });
    document.getElementById('btn-settings-open-eq')?.addEventListener('click', () => {
      this.close();
      document.dispatchEvent(new CustomEvent('spotmusic:open-equalizer'));
    });
    audioEngine.on('eqchange', () => this.refreshAudioUI());

    // Copy Device ID
    document.getElementById('btn-settings-copy-device-id')?.addEventListener('click', async () => {
      const devId = await licenseClient.getDeviceId();
      const success = await copyToClipboard(devId);
      const copyBtn = document.getElementById('btn-settings-copy-device-id');
      const copyText = document.getElementById('settings-copy-text');
      if (copyText) {
        copyText.textContent = success ? '¡Copiado! ✓' : 'Error al copiar';
      }
      if (copyBtn) {
        copyBtn.classList.add('!bg-emerald-500/20', '!text-emerald-400');
      }
      await appDialog.alert(`ID del dispositivo copiado al portapapeles:\n\n${devId}`);
      setTimeout(() => {
        if (copyText) copyText.textContent = 'Copiar';
        if (copyBtn) copyBtn.classList.remove('!bg-emerald-500/20', '!text-emerald-400');
      }, 2500);
    });

    // Activate License Token
    document.getElementById('btn-settings-activate')?.addEventListener('click', async () => {
      const input = document.getElementById('settings-input-token') as HTMLTextAreaElement;
      const btn = document.getElementById('btn-settings-activate') as HTMLButtonElement;
      const token = input?.value.trim() || '';

      if (!token) return await appDialog.alert('Por favor introduce tu clave de licencia KeyForge.');

      btn.disabled = true;
      btn.innerHTML = '<span class="w-3.5 h-3.5 rounded-full border-2 border-black border-t-transparent animate-spin"></span>';

      try {
        const res = await licenseClient.activateToken(token);
        if (res.valid) {
          await appDialog.alert(`¡Licencia activada con éxito para ${res.clientName || 'tu dispositivo'}!`);
          this.refreshLicenseUI();
        } else {
          await appDialog.alert(res.error || 'No se pudo activar la licencia');
        }
      } catch (e: any) {
        await appDialog.alert(e.message || 'Error al conectar con KeyForge');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>Activar Licencia</span>';
      }
    });

    // Revoke License
    document.getElementById('btn-settings-revoke')?.addEventListener('click', async () => {
      if (await appDialog.confirm('¿Quitar la licencia guardada en esta app? Esto no libera el dispositivo en KeyForge.')) {
        licenseClient.removeLicense();
        const input = document.getElementById('settings-input-token') as HTMLTextAreaElement;
        if (input) input.value = '';
        this.refreshLicenseUI();
      }
    });

    // Check Updates
    document.getElementById('btn-settings-check-update')?.addEventListener('click', () => this.checkForUpdates());

    // Download & Install APK
    let lastDownloadedApkPath = '';
    document.getElementById('btn-settings-download-apk')?.addEventListener('click', async () => {
      if (!this.currentUpdateInfo?.apkUrl || this.isUpdating) return;
      this.isUpdating = true;

      const progContainer = document.getElementById('settings-update-progress-container');
      const progBar = document.getElementById('settings-update-bar');
      const progPct = document.getElementById('settings-update-pct');
      const statusMsg = document.getElementById('settings-update-msg');
      const actionBtn = document.getElementById('btn-settings-download-apk') as HTMLButtonElement;

      if (progContainer) progContainer.classList.remove('hidden');
      if (actionBtn) {
        actionBtn.disabled = true;
        actionBtn.innerHTML = '<span class="text-xs font-bold animate-pulse">Descargando...</span>';
      }
      if (statusMsg) statusMsg.textContent = 'Descargando actualización directamente en la app...';

      try {
        const res = await updaterClient.downloadAndInstall(this.currentUpdateInfo.apkUrl, (pct) => {
          if (progBar) progBar.style.width = `${pct}%`;
          if (progPct) progPct.textContent = `${pct}%`;
        });

        if (res && res.path) {
          lastDownloadedApkPath = res.path;
        }

        if (res && res.needsPermission) {
          if (statusMsg) statusMsg.textContent = 'Habilita "Instalar apps desconocidas" en Ajustes y presiona Instalar.';
          if (actionBtn) {
            actionBtn.disabled = false;
            actionBtn.innerHTML = '<span>Instalar Ahora</span>';

          }
        } else {
          if (statusMsg) statusMsg.textContent = '¡Descarga completada! Abriendo instalador de Android...';
          if (actionBtn) {
            actionBtn.disabled = false;
            actionBtn.innerHTML = '<span>Instalar Ahora</span>';

          }
        }
      } catch (err: any) {
        console.warn('In-app updater notice:', err);
        if (statusMsg) statusMsg.textContent = err.message || 'Error al descargar actualización.';
        if (actionBtn) {
          actionBtn.disabled = false;
          actionBtn.innerHTML = '<span>Reintentar</span>';
        }
      } finally {
        this.isUpdating = false;
      }
    });

    // Quality Selector
    const selectQ = document.getElementById('settings-select-quality') as HTMLSelectElement;
    if (selectQ) {
      selectQ.value = 'source';
      selectQ.disabled = true;
      selectQ.title = 'La app no convierte el bitrate del archivo de origen';
      selectQ.addEventListener('change', () => {
        downloadEngine.setQuality(selectQ.value);
      });
    }

    document.getElementById('btn-settings-pick-folder')?.addEventListener('click', async () => {
      if (!storagePicker.available) return await appDialog.alert('La selección de carpeta está disponible en Android.');
      try {
        await storagePicker.chooseDirectory();
        await this.refreshStorageUI();
      } catch (error: any) {
        if (!/No se seleccionó/.test(error?.message || '')) await appDialog.alert(error?.message || 'No se pudo seleccionar la carpeta.');
      }
    });

    document.getElementById('btn-settings-default-folder')?.addEventListener('click', async () => {
      await storagePicker.useDefaultDirectory();
      await this.refreshStorageUI();
    });

    // Clear Cache
    document.getElementById('btn-settings-clear-cache')?.addEventListener('click', async () => {
      if (await appDialog.confirm('¿Deseas vaciar la caché temporal de audio?')) {
        streamResolver.clearCache();
        await appDialog.alert('Caché de enlaces de audio liberada. Tu música descargada se conserva.');
      }
    });

    // Listen to real-time license events
    licenseClient.on('change', () => this.refreshLicenseUI());
  }

  private setupTheme() {
    // Mode toggles
    const modeButtons = this.overlay.querySelectorAll('.btn-theme-mode');
    const savedMode = localStorage.getItem('spotmusic_theme_mode') || 'dark';
    this.applyThemeMode(savedMode);

    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') || 'dark';
        this.applyThemeMode(mode);
      });
    });

    // Color accents
    const accentButtons = this.overlay.querySelectorAll('.btn-accent-color');
    const savedColor = localStorage.getItem('spotmusic_accent_color') || '#1ED760';
    this.applyAccentColor(savedColor);

    accentButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.getAttribute('data-color') || '#1ED760';
        this.applyAccentColor(color);
      });
    });
  }

  private applyThemeMode(mode: string) {
    localStorage.setItem('spotmusic_theme_mode', mode);
    document.documentElement.style.colorScheme = mode === 'light' ? 'light' : 'dark';
    if (mode === 'light') {
      document.body.classList.add('theme-light');
      document.documentElement.classList.remove('dark');
    } else {
      document.body.classList.remove('theme-light');
      document.documentElement.classList.add('dark');
    }

    const modeButtons = this.overlay.querySelectorAll('.btn-theme-mode');
    modeButtons.forEach(b => {
      const isCurrent = b.getAttribute('data-mode') === mode;
      b.className = `btn-theme-mode py-2 px-3 rounded-xl border flex items-center justify-center gap-1.5 transition-all font-semibold ${
        isCurrent ? 'border-sonic-green bg-sonic-green/15 text-sonic-green' : 'border-white/10 bg-white/5 text-white/60'
      }`;
    });
  }

  private applyAccentColor(color: string) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#1ED760';
    localStorage.setItem('spotmusic_accent_color', color);
    document.documentElement.style.setProperty('--accent-color', color);
    const ink: Record<string, string> = { '#1ED760': '#087443', '#06B6D4': '#0e677d', '#A855F7': '#7834b0', '#F43F5E': '#b22040', '#F59E0B': '#8a5005' };
    document.documentElement.style.setProperty('--accent-ink', ink[color.toUpperCase()] || '#087443');

    try {
      const hex = color.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      document.documentElement.style.setProperty('--accent-color-rgb', `${r}, ${g}, ${b}`);
    } catch {}

    const accentButtons = this.overlay.querySelectorAll('.btn-accent-color');
    accentButtons.forEach(b => {
      (b as HTMLElement).style.backgroundColor = b.getAttribute('data-color') || '#1ED760';
      const isSelected = b.getAttribute('data-color') === color;
      if (isSelected) {
        b.className = 'btn-accent-color w-7 h-7 rounded-full border-2 border-white scale-110 shadow-lg';
      } else {
        b.className = 'btn-accent-color w-7 h-7 rounded-full border border-white/20 hover:scale-105';
      }
    });
  }

  public async refreshLicenseUI() {
    const info = await licenseClient.checkLicense();
    const devId = await licenseClient.getDeviceId();

    const badge = document.getElementById('settings-license-badge');
    const clientName = document.getElementById('settings-license-client');
    const devIdSpan = document.getElementById('settings-device-id');
    const revokeBtn = document.getElementById('btn-settings-revoke');

    if (devIdSpan) devIdSpan.textContent = devId;
    let details = document.getElementById('settings-license-client-details');
    if (!details && clientName) {
      details = document.createElement('p');
      details.id = 'settings-license-client-details';
      details.className = 'text-xs text-white/70 leading-relaxed';
      clientName.parentElement?.after(details);
    }
    if (details) details.textContent = licenseDetails(info);
    if (clientName) clientName.textContent = info.clientName || 'Sin Registrar';

    if (revokeBtn) {
      revokeBtn.classList.toggle('hidden', !info.valid);
    }

    if (badge) {
      if (info.valid) {
        badge.className = 'px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-sonic-green/20 text-sonic-green border border-sonic-green/30';
        badge.textContent = 'Activa ✓';
      } else if (info.status === 'revoked') {
        badge.className = 'px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-red-500/20 text-red-400 border border-red-500/30';
        badge.textContent = 'Revocada ✗';
      } else {
        badge.className = 'px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
        badge.textContent = info.status === 'expired' ? 'Vencida' : 'Sin Licencia';
      }
    }
  }

  public async checkForUpdates() {
    if (this.isUpdating) return;
    const statusMsg = document.getElementById('settings-update-msg');
    const dlBtn = document.getElementById('btn-settings-download-apk');
    if (statusMsg) statusMsg.textContent = 'Consultando GitHub Releases...';

    try {
      const info = await updaterClient.checkForUpdates();
      this.currentUpdateInfo = info;

      if (info.hasUpdate) {
        if (statusMsg) statusMsg.textContent = `¡Nueva versión ${info.latestVersion} disponible!`;
        if (dlBtn) dlBtn.classList.remove('hidden');
      } else {
        if (statusMsg) statusMsg.textContent = `Ya tienes instalada la versión más reciente (${info.currentVersion}).`;
        if (dlBtn) dlBtn.classList.add('hidden');
      }
    } catch (e: any) {
      if (statusMsg) statusMsg.textContent = 'No se pudo comprobar: ' + e.message;
    }
  }

  public open() {
    this.overlay.classList.remove('pointer-events-none', 'opacity-0');
    this.overlay.classList.add('opacity-100');
    const card = document.getElementById('settings-modal-card');
    card?.classList.remove('scale-95');
    card?.classList.add('scale-100');
    this.refreshLicenseUI();
    this.refreshStorageUI();
    this.refreshSpotifyUI();
    this.refreshAudioUI();
  }

  private refreshAudioUI() {
    const select = document.getElementById('settings-audio-profile') as HTMLSelectElement | null;
    const help = document.getElementById('settings-audio-profile-help');
    const knownProfile = ['Phone', 'AntiBoom', 'Speaker', 'Headphones', 'Flat'].includes(audioEngine.currentPreset)
      ? audioEngine.currentPreset
      : 'Flat';
    if (select) select.value = knownProfile;
    const messages: Record<string, string> = {
      Phone: 'Reduce subgraves y da claridad a los altavoces pequeños.',
      AntiBoom: 'Recorta con mayor fuerza las frecuencias que producen retumbo.',
      Speaker: 'Balance moderado para bocinas Bluetooth o externas.',
      Headphones: 'Respuesta equilibrada para audífonos y manos libres.',
      Flat: 'Mantiene la respuesta original, sin realces.'
    };
    if (help) help.textContent = messages[knownProfile];
  }

  private refreshSpotifyUI() {
    const help = document.getElementById('settings-spotify-help');
    if (help) help.textContent = spotifyAuth.lastError || (spotifyAuth.connected ? 'Cuenta vinculada. Ya puedes importar tus playlists.' : 'Vincula tu cuenta para importar todas las páginas de tus playlists accesibles.');
    const badge = document.getElementById('settings-spotify-status');
    const button = document.getElementById('btn-settings-connect-spotify');
    if (badge) {
      badge.textContent = spotifyAuth.connected ? 'Cuenta vinculada ✓' : 'Sin vincular';
      badge.className = 'px-2.5 py-0.5 rounded-full font-bold text-[10px] bg-sonic-green/20 text-sonic-green border border-sonic-green/30';
    }
    if (button) button.textContent = spotifyAuth.connected ? 'Desvincular Cuenta' : 'Vincular Cuenta Spotify';
  }

  private async refreshStorageUI() {
    const label = document.getElementById('settings-storage-folder');
    const reset = document.getElementById('btn-settings-default-folder');
    const info = await storagePicker.getDirectory();
    if (label) label.textContent = info.selected ? (info.label || 'Carpeta elegida') : 'Documents/SpotMusic';
    reset?.classList.toggle('hidden', !info.selected);
  }

  public close() {
    this.overlay.classList.add('pointer-events-none', 'opacity-0');
    this.overlay.classList.remove('opacity-100');
    const card = document.getElementById('settings-modal-card');
    card?.classList.add('scale-95');
    card?.classList.remove('scale-100');
  }

  public toggle() {
    if (this.overlay.classList.contains('opacity-100')) this.close();
    else this.open();
  }
}
