import { audioEngine } from '../services/audioEngine';

export class SleepTimerModal {
  private overlay: HTMLElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'sleep-timer-modal-overlay';
    this.overlay.className = 'fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-opacity duration-300 opacity-0 pointer-events-none';

    this.overlay.innerHTML = `
      <div class="bg-obsidian-800 border border-white/15 rounded-[28px] p-5 w-full max-w-xs flex flex-col gap-4 shadow-2xl scale-95 transition-transform duration-300" id="sleep-modal-card">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-sonic-violet/20 text-sonic-violet flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div>
              <h3 class="text-sm font-bold text-white">Temporizador de Sueño</h3>
              <p class="text-[11px] text-white/50">Apagado automático suave</p>
            </div>
          </div>
          <button id="btn-close-sleep" class="p-2 rounded-xl bg-white/10 text-white/70 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Active Timer Status Banner -->
        <div id="sleep-timer-active-banner" class="hidden bg-sonic-violet/10 border border-sonic-violet/30 rounded-2xl p-3 flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-sonic-violet">Temporizador Activo</div>
            <div id="sleep-timer-countdown-text" class="text-xs font-mono text-white/80">00:00 restantes</div>
          </div>
          <button id="btn-cancel-sleep-timer" class="px-2.5 py-1 rounded-xl bg-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/30">
            Cancelar
          </button>
        </div>

        <!-- Timer Options -->
        <div class="grid grid-cols-2 gap-2">
          ${[15, 30, 45, 60, 90].map(mins => `
            <button class="btn-sleep-option p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-left transition-all active:scale-95" data-mins="${mins}">
              <div class="text-sm font-bold text-white">${mins} minutos</div>
              <div class="text-[10px] text-white/40">Desvanecer y pausar</div>
            </button>
          `).join('')}

          <button class="btn-sleep-track-end p-3 rounded-2xl bg-sonic-violet/10 hover:bg-sonic-violet/20 border border-sonic-violet/30 text-left transition-all active:scale-95">
            <div class="text-sm font-bold text-sonic-violet">Fin de Canción</div>
            <div class="text-[10px] text-white/40">Pausar al terminar</div>
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

    document.getElementById('btn-close-sleep')?.addEventListener('click', () => this.close());

    // Minutes buttons
    this.overlay.querySelectorAll('.btn-sleep-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const mins = parseInt(btn.getAttribute('data-mins') || '30', 10);
        audioEngine.startSleepTimer(mins);
        this.updateBanner();
        this.close();
      });
    });

    // End of track button
    this.overlay.querySelector('.btn-sleep-track-end')?.addEventListener('click', () => {
      audioEngine.setSleepOnTrackEnd();
      this.updateBanner();
      this.close();
    });

    // Cancel button
    document.getElementById('btn-cancel-sleep-timer')?.addEventListener('click', () => {
      audioEngine.cancelSleepTimer();
      this.updateBanner();
    });

    audioEngine.on('sleeptimertick', (secRemaining: number) => {
      const banner = document.getElementById('sleep-timer-active-banner');
      const text = document.getElementById('sleep-timer-countdown-text');
      if (banner) banner.classList.remove('hidden');
      if (text) {
        const m = Math.floor(secRemaining / 60);
        const s = secRemaining % 60;
        text.textContent = `${m}:${s.toString().padStart(2, '0')} restantes`;
      }
    });

    audioEngine.on('sleeptimerend', () => {
      this.updateBanner();
    });

    audioEngine.on('sleeptimercancel', () => {
      this.updateBanner();
    });
  }

  private updateBanner() {
    const banner = document.getElementById('sleep-timer-active-banner');
    if (!banner) return;
    if (audioEngine.isSleepTimerActive) {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  }

  public open() {
    this.overlay.classList.remove('pointer-events-none', 'opacity-0');
    this.overlay.classList.add('opacity-100');
    const card = document.getElementById('sleep-modal-card');
    card?.classList.remove('scale-95');
    card?.classList.add('scale-100');
    this.updateBanner();
  }

  public close() {
    this.overlay.classList.add('pointer-events-none', 'opacity-0');
    this.overlay.classList.remove('opacity-100');
    const card = document.getElementById('sleep-modal-card');
    card?.classList.add('scale-95');
    card?.classList.remove('scale-100');
  }

  public toggle() {
    if (this.overlay.classList.contains('opacity-100')) this.close();
    else this.open();
  }
}
