import { escapeHtml } from '../utils/html';
import { audioEngine } from '../services/audioEngine';

export class QueueDrawer {
  private overlay: HTMLElement;
  private listElement: HTMLElement | null = null;
  private isOpen = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'queue-drawer-overlay';
    this.overlay.className = 'fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex flex-col justify-end transition-opacity duration-300 opacity-0 pointer-events-none';

    this.overlay.innerHTML = `
      <div class="bg-obsidian-800 border-t border-white/10 rounded-t-[32px] p-5 max-h-[82vh] flex flex-col shadow-2xl transform translate-y-full transition-transform duration-300 ease-out" id="queue-drawer-sheet">
        <!-- Drag pill handle -->
        <div class="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4 cursor-pointer"></div>

        <!-- Header -->
        <div class="flex items-center justify-between pb-3 border-b border-white/10">
          <div>
            <h3 class="text-base font-bold text-white flex items-center gap-2">
              <span>Cola de Reproducción</span>
              <span id="queue-badge-count" class="text-xs px-2 py-0.5 rounded-full bg-sonic-green/20 text-sonic-green font-mono">0</span>
            </h3>
            <p class="text-xs text-white/50">Toca cualquier canción para saltar a ella</p>
          </div>
          <div class="flex items-center gap-2">
            <button id="btn-clear-queue" class="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-red-400 text-xs flex items-center gap-1.5 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span>Vaciar</span>
            </button>
            <button id="btn-close-queue" class="p-2 rounded-xl bg-white/10 text-white/70 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <!-- Track List -->
        <div class="flex-1 overflow-y-auto py-3 space-y-2 divide-y divide-white/5" id="queue-track-list">
          <!-- Dynamic queue items -->
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.listElement = document.getElementById('queue-track-list');
    this.setupEvents();
  }

  private setupEvents() {
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    document.getElementById('btn-close-queue')?.addEventListener('click', () => this.close());
    document.getElementById('btn-clear-queue')?.addEventListener('click', () => {
      audioEngine.clearQueue();
      this.renderList();
    });

    audioEngine.on('queuechange', () => {
      if (this.isOpen) this.renderList();
    });

    audioEngine.on('trackchange', () => {
      if (this.isOpen) this.renderList();
    });
  }

  public open() {
    this.isOpen = true;
    this.overlay.classList.remove('pointer-events-none', 'opacity-0');
    this.overlay.classList.add('opacity-100');

    const sheet = document.getElementById('queue-drawer-sheet');
    sheet?.classList.remove('translate-y-full');
    sheet?.classList.add('translate-y-0');

    this.renderList();
  }

  public close() {
    this.isOpen = false;
    this.overlay.classList.add('pointer-events-none', 'opacity-0');
    this.overlay.classList.remove('opacity-100');

    const sheet = document.getElementById('queue-drawer-sheet');
    sheet?.classList.add('translate-y-full');
    sheet?.classList.remove('translate-y-0');
  }

  public toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  private renderList() {
    if (!this.listElement) return;
    const queue = audioEngine.queue;
    const curIdx = audioEngine.currentIndex;

    const countBadge = document.getElementById('queue-badge-count');
    if (countBadge) countBadge.textContent = queue.length.toString();

    if (!queue.length) {
      this.listElement.innerHTML = `
        <div class="py-12 text-center text-white/40 flex flex-col items-center justify-center gap-3">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <span class="text-sm">La cola de reproducción está vacía</span>
        </div>
      `;
      return;
    }

    this.listElement.innerHTML = queue.map((track, i) => {
      const isCurrent = i === curIdx;
      return `
        <div class="group flex items-center justify-between p-2.5 rounded-2xl ${isCurrent ? 'bg-sonic-green/10 border border-sonic-green/30' : 'hover:bg-white/5'} transition-all cursor-pointer" data-index="${i}">
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-obsidian-900 border border-white/10">
              <img src="${escapeHtml(track.cover_url || '')}" alt="Cover" class="w-full h-full object-cover" data-hide-on-error />
              ${isCurrent ? `
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span class="w-2.5 h-2.5 rounded-full bg-sonic-green animate-ping"></span>
                </div>
              ` : ''}
            </div>
            <div class="min-w-0 flex-1">
              <h4 class="text-xs font-semibold ${isCurrent ? 'text-sonic-green' : 'text-white'} truncate">${escapeHtml(track.name)}</h4>
              <p class="text-[11px] text-white/50 truncate">${escapeHtml(track.artists)}</p>
            </div>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0 pl-2">
            <span class="text-[10px] font-mono text-white/40">${escapeHtml(track.duration_str || '--:--')}</span>
            <button class="btn-remove-queue-item p-1.5 text-white/30 hover:text-red-400 rounded-lg" data-index="${i}" title="Eliminar de cola">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Click track to play
    this.listElement.querySelectorAll('[data-index]').forEach(el => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.btn-remove-queue-item')) return;
        const idx = parseInt(el.getAttribute('data-index') || '0', 10);
        audioEngine.playIndex(idx);
      });
    });

    // Remove single item
    this.listElement.querySelectorAll('.btn-remove-queue-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-index') || '0', 10);
        audioEngine.removeFromQueue(idx);
        this.renderList();
      });
    });
  }
}
