import { spotifyClient } from '../services/spotifyClient';
import { audioEngine } from '../services/audioEngine';
import { downloadEngine } from '../services/downloadEngine';
import { Track } from '../types';

export class SearchModal {
  private overlay: HTMLElement;
  private inputElement: HTMLInputElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private isSearching = false;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'search-modal-overlay';
    this.overlay.className = 'fixed inset-0 bg-obsidian-900/95 backdrop-blur-xl z-50 flex flex-col p-4 transition-opacity duration-300 opacity-0 pointer-events-none';

    this.overlay.innerHTML = `
      <!-- Top Search Bar Header -->
      <div class="flex items-center gap-3 pt-2 pb-3 border-b border-white/10">
        <div class="relative flex-1 flex items-center">
          <svg class="absolute left-3.5 w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" id="modal-search-input" placeholder="Canción, artista o link de Spotify..." class="w-full pl-10 pr-10 py-3 rounded-2xl bg-white/10 border border-white/10 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-sonic-green transition-all" />
          <button id="btn-clear-search-input" class="absolute right-3 p-1 text-white/40 hover:text-white hidden">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <button id="btn-close-search-modal" class="px-3 py-2 text-xs font-semibold text-white/70 hover:text-white rounded-xl bg-white/5">
          Cerrar
        </button>
      </div>

      <!-- Quick Category Pills -->
      <div class="flex gap-2 py-3 overflow-x-auto scrollbar-none flex-shrink-0" id="quick-search-pills">
        ${['Pop', 'Rock', 'Reggaeton', 'Hip Hop', 'Electrónica', 'Éxitos 2026'].map(genre => `
          <button class="btn-genre-pill px-3 py-1.5 rounded-full text-xs bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-sonic-green flex-shrink-0" data-genre="${genre}">
            ${genre}
          </button>
        `).join('')}
      </div>

      <!-- Results Container -->
      <div class="flex-1 overflow-y-auto divide-y divide-white/5 space-y-2 py-2" id="search-modal-results">
        <div class="py-16 text-center text-white/40 flex flex-col items-center justify-center gap-3">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <p class="text-xs">Escribe el nombre de tu música favorita</p>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.inputElement = document.getElementById('modal-search-input') as HTMLInputElement;
    this.resultsContainer = document.getElementById('search-modal-results');
    this.setupEvents();
  }

  private setupEvents() {
    document.getElementById('btn-close-search-modal')?.addEventListener('click', () => this.close());

    let debounceTimer: any = null;
    this.inputElement?.addEventListener('input', () => {
      const q = this.inputElement?.value.trim() || '';
      const clearBtn = document.getElementById('btn-clear-search-input');
      if (clearBtn) clearBtn.classList.toggle('hidden', !q);

      clearTimeout(debounceTimer);
      if (q.length > 1) {
        debounceTimer = setTimeout(() => this.performSearch(q), 450);
      }
    });

    this.inputElement?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        this.performSearch(this.inputElement?.value.trim() || '');
      }
    });

    document.getElementById('btn-clear-search-input')?.addEventListener('click', () => {
      if (this.inputElement) {
        this.inputElement.value = '';
        this.inputElement.focus();
        document.getElementById('btn-clear-search-input')?.classList.add('hidden');
      }
    });

    this.overlay.querySelectorAll('.btn-genre-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const g = pill.getAttribute('data-genre') || '';
        if (this.inputElement) {
          this.inputElement.value = g;
          this.performSearch(g);
        }
      });
    });
  }

  private async performSearch(query: string) {
    if (!query || this.isSearching) return;
    this.isSearching = true;

    if (this.resultsContainer) {
      this.resultsContainer.innerHTML = `
        <div class="py-16 text-center text-white/50 flex flex-col items-center justify-center gap-3">
          <div class="w-8 h-8 rounded-full border-2 border-sonic-green border-t-transparent animate-spin"></div>
          <p class="text-xs">Explorando catálogo...</p>
        </div>
      `;
    }

    try {
      const res = await spotifyClient.search(query);
      this.renderResults(res.tracks);
    } catch (e: any) {
      if (this.resultsContainer) {
        this.resultsContainer.innerHTML = `
          <div class="py-12 text-center text-red-400 text-xs">Error al buscar: ${e.message}</div>
        `;
      }
    } finally {
      this.isSearching = false;
    }
  }

  private renderResults(tracks: Track[]) {
    if (!this.resultsContainer) return;

    if (!tracks.length) {
      this.resultsContainer.innerHTML = `
        <div class="py-16 text-center text-white/40 text-xs">No se encontraron canciones para esta búsqueda</div>
      `;
      return;
    }

    this.resultsContainer.innerHTML = tracks.map((t, idx) => `
      <div class="flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/5 transition-all group" data-idx="${idx}">
        <div class="flex items-center gap-3 min-w-0 flex-1 cursor-pointer btn-play-result">
          <div class="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-obsidian-800 border border-white/10">
            <img src="${t.cover_url}" alt="Cover" class="w-full h-full object-cover" onerror="this.style.display='none'" />
          </div>
          <div class="min-w-0 flex-1">
            <h4 class="text-xs font-semibold text-white truncate">${t.name}</h4>
            <p class="text-[11px] text-white/50 truncate">${t.artists}</p>
          </div>
        </div>

        <div class="flex items-center gap-2 pl-2">
          <button class="btn-download-result p-2 rounded-xl bg-sonic-green/10 text-sonic-green hover:bg-sonic-green/20 text-xs font-medium flex items-center gap-1" title="Descargar tema">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Play click
    this.resultsContainer.querySelectorAll('.btn-play-result').forEach((el, i) => {
      el.addEventListener('click', () => {
        audioEngine.playTrack(tracks[i]);
        this.close();
      });
    });

    // Download click
    this.resultsContainer.querySelectorAll('.btn-download-result').forEach((btn, i) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          btn.innerHTML = `<span class="w-3.5 h-3.5 rounded-full border border-sonic-green border-t-transparent animate-spin"></span>`;
          await downloadEngine.addDownload(tracks[i]);
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-sonic-green"><polyline points="20 6 9 17 4 12"/></svg>`;
        } catch (err: any) {
          alert(err.message || 'Error al iniciar descarga');
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
        }
      });
    });
  }

  public open() {
    this.overlay.classList.remove('pointer-events-none', 'opacity-0');
    this.overlay.classList.add('opacity-100');
    this.inputElement?.focus();
  }

  public close() {
    this.overlay.classList.add('pointer-events-none', 'opacity-0');
    this.overlay.classList.remove('opacity-100');
  }

  public toggle() {
    if (this.overlay.classList.contains('opacity-100')) this.close();
    else this.open();
  }
}
