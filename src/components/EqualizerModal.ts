import { audioEngine, EQ_PRESETS } from '../services/audioEngine';

const DEVICE_PROFILES = ['Phone', 'AntiBoom', 'Speaker', 'Headphones'];
const MUSIC_PRESETS = ['Flat', 'BassBoost', 'Rock', 'Pop', 'Electronic', 'Jazz', 'Vocal', 'Acoustic'];

export class EqualizerModal {
  private overlay: HTMLElement;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'equalizer-modal-overlay';
    this.overlay.className = 'fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-opacity duration-300 opacity-0 pointer-events-none';

    this.overlay.innerHTML = `
      <div class="bg-obsidian-800 border border-white/15 rounded-[28px] p-5 w-full max-w-md max-h-[92dvh] overflow-y-auto flex flex-col gap-4 shadow-2xl scale-95 transition-transform duration-300" id="eq-modal-card">
        <!-- Header -->
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-sonic-green/20 text-sonic-green flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"/></svg>
            </div>
            <div>
              <h3 class="text-sm font-bold text-white">Ecualizador de Audio</h3>
              <p class="text-[11px] text-white/50">Perfiles por dispositivo y ajuste fino</p>
            </div>
          </div>
          <button id="btn-close-eq" class="p-2 rounded-xl bg-white/10 text-white/70 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <p id="eq-availability" class="text-xs text-white/70 leading-relaxed"></p>

        <div class="space-y-2">
          <div>
            <p class="text-[10px] uppercase tracking-wider font-bold text-white/50">Tipo de salida</p>
            <p class="text-[10px] text-white/40">Si el teléfono retumba, usa “Reducir retumbo”.</p>
          </div>
          <div class="grid grid-cols-2 gap-2">
            ${DEVICE_PROFILES.map(key => `
              <button class="btn-eq-preset min-h-11 px-3 py-2 rounded-xl text-left border transition-all ${key === audioEngine.currentPreset ? 'bg-sonic-green/15 text-sonic-green border-sonic-green/40' : 'bg-white/5 text-white/70 border-white/10'}" data-preset="${key}" data-kind="profile">
                <span class="block text-[11px] font-bold">${EQ_PRESETS[key].name}</span>
                <span class="block text-[9px] opacity-70 mt-0.5">${key === 'Phone' ? 'Menos subgraves' : key === 'AntiBoom' ? 'Recorte fuerte de graves' : key === 'Speaker' ? 'Balance para bocinas' : 'Respuesta equilibrada'}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Musical Preset Pills -->
        <div class="flex gap-2 overflow-x-auto pb-1 scrollbar-none" id="eq-presets-container">
          ${MUSIC_PRESETS.map(key => `
            <button class="btn-eq-preset flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${key === audioEngine.currentPreset ? 'bg-sonic-green text-black font-bold border-sonic-green' : 'bg-white/5 text-white/70 border-white/10 hover:border-white/30'}" data-preset="${key}" data-kind="music">
              ${EQ_PRESETS[key].name.split(' ')[0]}
            </button>
          `).join('')}
        </div>

        <!-- 5 Frequency Sliders -->
        <div class="eq-band-panel bg-obsidian-900/60 rounded-2xl p-4 border border-white/5 flex justify-between items-center h-48">
          ${['60 Hz', '230 Hz', '910 Hz', '3.6 kHz', '14 kHz'].map((label, i) => `
            <div class="flex flex-col items-center gap-2 h-full flex-1">
              <span class="text-[10px] font-mono text-white/40" id="eq-val-${i}">0dB</span>
              <div class="relative flex-1 flex items-center justify-center">
                <input type="range" min="-12" max="12" step="1" value="0" class="eq-slider appearance-none bg-white/10 w-28 h-2 rounded-full cursor-pointer accent-sonic-green -rotate-90 origin-center" data-band="${i}" />
              </div>
              <span class="text-[10px] font-semibold text-white/60">${label}</span>
            </div>
          `).join('')}
        </div>

        <!-- Bass trim -->
        <div class="bg-white/5 rounded-2xl p-3 border border-white/5 flex items-center justify-between gap-4">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-sonic-cyan/20 text-sonic-cyan flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/></svg>
            </div>
            <div>
              <div class="text-xs font-bold text-white">Ajuste de graves</div>
              <div class="text-[10px] text-white/50">Negativo reduce el retumbo</div>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-1 max-w-[130px]">
            <input type="range" id="bass-boost-slider" min="-10" max="6" step="1" value="0" class="w-full h-2 rounded-full appearance-none bg-white/10 accent-sonic-cyan cursor-pointer" />
            <span id="bass-boost-val" class="text-xs font-mono font-bold text-sonic-cyan w-8 text-right">0</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.setupEvents();
    audioEngine.on('eqavailability', () => this.updateAvailability());
  }

  private setupEvents() {
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    document.getElementById('btn-close-eq')?.addEventListener('click', () => this.close());

    // Presets click
    this.overlay.querySelectorAll('.btn-eq-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset') || 'Flat';
        audioEngine.applyPreset(preset);
        this.updateSlidersFromEngine();
      });
    });

    // Sliders change
    this.overlay.querySelectorAll('.eq-slider').forEach(input => {
      input.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const band = parseInt(target.getAttribute('data-band') || '0', 10);
        const val = parseFloat(target.value);
        audioEngine.setBandGain(band, val);
        const valSpan = document.getElementById(`eq-val-${band}`);
        if (valSpan) valSpan.textContent = `${val > 0 ? '+' : ''}${val}dB`;
        this.updatePresetButtons('Custom');
      });
    });

    // Bass boost change
    const bassSlider = document.getElementById('bass-boost-slider') as HTMLInputElement;
    const bassVal = document.getElementById('bass-boost-val');
    bassSlider?.addEventListener('input', () => {
      const val = parseInt(bassSlider.value, 10);
      audioEngine.setBassBoost(val);
      if (bassVal) bassVal.textContent = `${val > 0 ? '+' : ''}${val}`;
    });

    audioEngine.on('eqchange', (data) => {
      this.updateSlidersFromEngine();
    });
  }

  private updateSlidersFromEngine() {
    audioEngine.currentGains.forEach((gain, i) => {
      const slider = this.overlay.querySelector(`[data-band="${i}"]`) as HTMLInputElement;
      const valSpan = document.getElementById(`eq-val-${i}`);
      if (slider) slider.value = gain.toString();
      if (valSpan) valSpan.textContent = `${gain > 0 ? '+' : ''}${gain}dB`;
    });

    const bassSlider = document.getElementById('bass-boost-slider') as HTMLInputElement;
    const bassVal = document.getElementById('bass-boost-val');
    if (bassSlider) bassSlider.value = audioEngine.currentBassBoost.toString();
    if (bassVal) bassVal.textContent = `${audioEngine.currentBassBoost > 0 ? '+' : ''}${audioEngine.currentBassBoost}`;

    this.updatePresetButtons(audioEngine.currentPreset);
  }

  private updatePresetButtons(activeName: string) {
    this.overlay.querySelectorAll('.btn-eq-preset').forEach(btn => {
      const p = btn.getAttribute('data-preset');
      const profile = btn.getAttribute('data-kind') === 'profile';
      if (p === activeName) {
        btn.className = profile
          ? 'btn-eq-preset min-h-11 px-3 py-2 rounded-xl text-left border transition-all bg-sonic-green/15 text-sonic-green border-sonic-green/40'
          : 'btn-eq-preset flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold bg-sonic-green text-black border border-sonic-green';
      } else {
        btn.className = profile
          ? 'btn-eq-preset min-h-11 px-3 py-2 rounded-xl text-left border transition-all bg-white/5 text-white/70 border-white/10'
          : 'btn-eq-preset flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 text-white/70 border border-white/10 hover:border-white/30';
      }
    });
  }

  private updateAvailability() {
    const available = audioEngine.equalizerAvailable;
    this.overlay.querySelectorAll<HTMLInputElement | HTMLButtonElement>('.eq-slider, .btn-eq-preset, #bass-boost-slider').forEach(control => control.disabled = !available);
    this.overlay.querySelector('#eq-availability')!.textContent = available
      ? 'Ecualizador activo. La protección dinámica reduce picos y distorsión.'
      : 'Reproduce una canción descargada para usar el ecualizador. Las fuentes externas usan su salida original.';
  }

  public open() {
    this.updateAvailability();
    this.overlay.classList.remove('pointer-events-none', 'opacity-0');
    this.overlay.classList.add('opacity-100');
    const card = document.getElementById('eq-modal-card');
    card?.classList.remove('scale-95');
    card?.classList.add('scale-100');
    this.updateSlidersFromEngine();
  }

  public close() {
    this.overlay.classList.add('pointer-events-none', 'opacity-0');
    this.overlay.classList.remove('opacity-100');
    const card = document.getElementById('eq-modal-card');
    card?.classList.add('scale-95');
    card?.classList.remove('scale-100');
  }

  public toggle() {
    if (this.overlay.classList.contains('opacity-100')) this.close();
    else this.open();
  }
}
