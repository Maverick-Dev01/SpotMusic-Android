import { Track } from '../types';
import { audioEngine } from '../services/audioEngine';

export class VinylDeck {
  private container: HTMLElement;
  private vinylElement: HTMLElement | null = null;
  private glowElement: HTMLElement | null = null;
  private currentCover: string = '';
  private isSpinning: boolean = false;
  private viewMode: 'vinyl' | 'cover' = 'vinyl';

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`VinylDeck container #${containerId} not found`);
    this.container = el;
    this.render();
    this.setupEvents();
  }

  private render() {
    this.container.innerHTML = `
      <div class="relative w-full aspect-square max-w-[310px] mx-auto flex items-center justify-center select-none">
        <!-- Dynamic Ambient Halo Glow -->
        <div id="deck-ambient-glow" class="absolute inset-0 rounded-full blur-3xl opacity-40 scale-105 pointer-events-none transition-all duration-1000" style="background: radial-gradient(circle, rgba(30, 215, 96, 0.4) 0%, rgba(139, 92, 246, 0.2) 60%, transparent 80%);"></div>

        <!-- Turntable Tonearm (Stylus decorative element) -->
        <div class="absolute -top-3 -right-2 w-16 h-28 pointer-events-none z-20 opacity-80">
          <svg viewBox="0 0 60 110" fill="none" class="w-full h-full drop-shadow-lg">
            <circle cx="48" cy="12" r="8" fill="#2A2F3D" stroke="#4B5563" stroke-width="2"/>
            <circle cx="48" cy="12" r="4" fill="#9CA3AF"/>
            <path d="M46 18 L34 75 L22 92" stroke="#D1D5DB" stroke-width="2.5" stroke-linecap="round"/>
            <rect x="14" y="90" width="16" height="10" rx="2" fill="#10B981" transform="rotate(-15 14 90)"/>
          </svg>
        </div>

        <!-- Vinyl Disc / Album Cover Interactive Disc -->
        <div id="deck-disc" class="relative w-[270px] h-[270px] rounded-full cursor-pointer shadow-2xl flex items-center justify-center transition-transform duration-700 active:scale-95" style="background: radial-gradient(circle, #0B0E14 0%, #151922 45%, #0B0E14 70%, #1A202C 95%, #0B0E14 100%); box-shadow: 0 20px 50px -10px rgba(0,0,0,0.8), inset 0 0 0 2px rgba(255,255,255,0.08);">
          <!-- Vinyl Grooves concentric rings -->
          <div class="absolute inset-2 rounded-full border border-white/5 pointer-events-none"></div>
          <div class="absolute inset-5 rounded-full border border-white/5 pointer-events-none"></div>
          <div class="absolute inset-8 rounded-full border border-white/5 pointer-events-none"></div>
          <div class="absolute inset-12 rounded-full border border-white/5 pointer-events-none"></div>
          <div class="absolute inset-16 rounded-full border border-white/5 pointer-events-none"></div>
          <div class="absolute inset-20 rounded-full border border-white/5 pointer-events-none"></div>

          <!-- Vinyl Sheen Reflection -->
          <div class="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none opacity-60"></div>

          <!-- Center Label with Artwork -->
          <div class="relative w-[110px] h-[110px] rounded-full overflow-hidden border-2 border-white/20 shadow-inner flex items-center justify-center bg-obsidian-800">
            <img id="deck-cover-img" src="" alt="Cover" class="w-full h-full object-cover select-none pointer-events-none" style="display: none;" />
            <!-- Default Placeholder Icon when no cover -->
            <div id="deck-placeholder" class="text-white/40 flex flex-col items-center justify-center">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M10 15V9l5 3-5 3z"/></svg>
            </div>
            <!-- Spindle Center Hole -->
            <div class="absolute w-5 h-5 rounded-full bg-obsidian-900 border border-white/30 shadow-inner"></div>
          </div>
        </div>

        <!-- View Mode Badge -->
        <button id="btn-toggle-deck-view" class="absolute bottom-1 right-3 px-2.5 py-1 rounded-full bg-obsidian-700/80 backdrop-blur-md border border-white/10 text-[10px] font-medium text-white/70 hover:text-white flex items-center gap-1">
          <span>Vinilo</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
        </button>
      </div>
    `;

    this.vinylElement = document.getElementById('deck-disc');
    this.glowElement = document.getElementById('deck-ambient-glow');
  }

  private setupEvents() {
    const toggleBtn = document.getElementById('btn-toggle-deck-view');
    toggleBtn?.addEventListener('click', () => {
      this.toggleViewMode();
    });

    this.vinylElement?.addEventListener('click', () => {
      audioEngine.togglePlay();
    });

    audioEngine.on('play', () => this.startSpin());
    audioEngine.on('pause', () => this.stopSpin());
    audioEngine.on('trackchange', (track: Track) => this.updateTrack(track));
  }

  public updateTrack(track: Track | null) {
    const img = document.getElementById('deck-cover-img') as HTMLImageElement;
    const placeholder = document.getElementById('deck-placeholder');

    if (track && track.cover_url) {
      this.currentCover = track.cover_url;
      if (img) {
        img.src = track.cover_url;
        img.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';

      // Update ambient glow with soft extracted light
      if (this.glowElement) {
        this.glowElement.style.background = `radial-gradient(circle, rgba(30, 215, 96, 0.45) 0%, rgba(6, 182, 212, 0.25) 50%, transparent 80%)`;
      }
    } else {
      if (img) img.style.display = 'none';
      if (placeholder) placeholder.style.display = 'flex';
    }

    if (audioEngine.isPlaying) {
      this.startSpin();
    } else {
      this.stopSpin();
    }
  }

  public startSpin() {
    if (this.vinylElement && !this.isSpinning) {
      this.isSpinning = true;
      this.vinylElement.style.animation = 'spin 18s linear infinite';
      this.vinylElement.style.animationPlayState = 'running';
    } else if (this.vinylElement) {
      this.vinylElement.style.animationPlayState = 'running';
    }
  }

  public stopSpin() {
    if (this.vinylElement) {
      this.vinylElement.style.animationPlayState = 'paused';
    }
  }

  public toggleViewMode() {
    const disc = this.vinylElement;
    const btn = document.getElementById('btn-toggle-deck-view');
    if (!disc) return;

    if (this.viewMode === 'vinyl') {
      this.viewMode = 'cover';
      disc.style.borderRadius = '24px';
      disc.style.animation = 'none';
      if (btn) btn.innerHTML = `<span>Tarjeta</span> <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
    } else {
      this.viewMode = 'vinyl';
      disc.style.borderRadius = '9999px';
      if (this.isSpinning) {
        disc.style.animation = 'spin 18s linear infinite';
        disc.style.animationPlayState = audioEngine.isPlaying ? 'running' : 'paused';
      }
      if (btn) btn.innerHTML = `<span>Vinilo</span> <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
    }
  }
}
