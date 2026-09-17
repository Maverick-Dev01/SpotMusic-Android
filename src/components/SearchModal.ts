import { spotifyClient, SpotifyPlaylistResult } from '../services/spotifyClient';
import { audioEngine } from '../services/audioEngine';
import { downloadEngine } from '../services/downloadEngine';
import { localLibrary } from '../services/localLibrary';
import { Track } from '../types';

export class SearchModal {
  private overlay: HTMLElement;
  private inputElement: HTMLInputElement | null = null;
  private resultsContainer: HTMLElement | null = null;
  private isSearching = false;
  private currentSpotifyPlaylist: SpotifyPlaylistResult | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'search-modal-overlay';
    this.overlay.className = 'fixed inset-0 bg-obsidian-900/95 backdrop-blur-xl z-50 flex flex-col p-4 transition-opacity duration-300 opacity-0 pointer-events-none';

    this.overlay.innerHTML = `
      <!-- Top Search Bar Header -->
      <div class="flex items-center gap-3 pt-2 pb-2.5 border-b border-white/10">
        <div class="relative flex-1 flex items-center">
          <svg class="absolute left-3.5 w-4 h-4 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input type="text" id="modal-search-input" placeholder="Buscar canción, artista o link de Spotify..." class="w-full pl-10 pr-10 py-3 rounded-2xl bg-white/10 border border-white/10 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-sonic-green transition-all" />
          <button id="btn-clear-search-input" class="absolute right-3 p-1 text-white/40 hover:text-white hidden">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <button id="btn-close-search-modal" class="px-3 py-2 text-xs font-semibold text-white/70 hover:text-white rounded-xl bg-white/5">
          Cerrar
        </button>
      </div>

      <!-- Quick Action Bar: Paste Spotify Link -->
      <div class="flex items-center justify-between gap-2 py-2.5 border-b border-white/5">
        <button id="btn-paste-spotify-link" class="flex-1 py-2 px-3 rounded-xl bg-sonic-green/10 hover:bg-sonic-green/20 border border-sonic-green/30 text-sonic-green font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
          <span>Pegar Playlist / Link de Spotify</span>
        </button>
      </div>

      <!-- Quick Category Pills -->
      <div class="flex gap-2 py-2 overflow-x-auto scrollbar-none flex-shrink-0" id="quick-search-pills">
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
          <p class="text-xs">Escribe el nombre de tu música o pega una playlist de Spotify</p>
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

    // Paste Spotify Link Button
    document.getElementById('btn-paste-spotify-link')?.addEventListener('click', async () => {
      let url = '';
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          url = await navigator.clipboard.readText();
        }
      } catch {}

      if (!url || !url.includes('spotify.com')) {
        const input = prompt('Pega el enlace de la playlist, álbum o canción de Spotify:\n(Ej: https://open.spotify.com/playlist/...)');
        if (input) url = input.trim();
      }

      if (url && (url.includes('spotify.com') || url.startsWith('spotify:'))) {
        if (this.inputElement) this.inputElement.value = url;
        this.loadSpotifyEntity(url);
      } else if (url) {
        alert('El enlace ingresado no parece ser de Spotify.');
      }
    });

    let debounceTimer: any = null;
    this.inputElement?.addEventListener('input', () => {
      const q = this.inputElement?.value.trim() || '';
      const clearBtn = document.getElementById('btn-clear-search-input');
      if (clearBtn) clearBtn.classList.toggle('hidden', !q);

      clearTimeout(debounceTimer);
      if (q.includes('spotify.com') || q.startsWith('spotify:')) {
        debounceTimer = setTimeout(() => this.loadSpotifyEntity(q), 300);
      } else if (q.length > 1) {
        debounceTimer = setTimeout(() => this.performSearch(q), 450);
      }
    });

    this.inputElement?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        const q = this.inputElement?.value.trim() || '';
        if (q.includes('spotify.com') || q.startsWith('spotify:')) {
          this.loadSpotifyEntity(q);
        } else {
          this.performSearch(q);
        }
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

  private async loadSpotifyEntity(url: string) {
    if (this.isSearching) return;
    this.isSearching = true;

    if (this.resultsContainer) {
      this.resultsContainer.innerHTML = `
        <div class="py-16 text-center text-white/70 flex flex-col items-center justify-center gap-3">
          <div class="w-8 h-8 rounded-full border-2 border-sonic-green border-t-transparent animate-spin"></div>
          <p class="text-xs font-medium">Extrayendo playlist de Spotify en tiempo real...</p>
        </div>
      `;
    }

    try {
      const sp = await spotifyClient.fetchSpotifyEntity(url);
      this.currentSpotifyPlaylist = sp;
      this.renderSpotifyPlaylist(sp);
    } catch (err: any) {
      if (this.resultsContainer) {
        this.resultsContainer.innerHTML = `
          <div class="py-14 text-center space-y-3 px-4">
            <div class="w-10 h-10 mx-auto rounded-full bg-red-500/10 text-red-400 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <p class="text-xs text-red-300">${err.message}</p>
            <p class="text-[11px] text-white/40">Verifica que la playlist sea pública en Spotify</p>
          </div>
        `;
      }
    } finally {
      this.isSearching = false;
    }
  }

  private renderSpotifyPlaylist(sp: SpotifyPlaylistResult) {
    if (!this.resultsContainer) return;

    this.resultsContainer.innerHTML = `
      <!-- Spotify Playlist Header Card -->
      <div class="bg-obsidian-800/90 border border-white/10 rounded-2xl p-4 mb-3 space-y-3 shadow-xl">
        <div class="flex items-center gap-3.5">
          <div class="w-16 h-16 rounded-xl overflow-hidden bg-obsidian-900 border border-white/10 flex-shrink-0 shadow-md">
            <img src="${sp.cover_url || '/logo.png'}" alt="Cover" class="w-full h-full object-cover" onerror="this.src='/logo.png'" />
          </div>
          <div class="min-w-0 flex-1">
            <span class="text-[9px] uppercase tracking-wider font-bold text-sonic-green px-2 py-0.5 rounded bg-sonic-green/10">Spotify ${sp.type.toUpperCase()}</span>
            <h3 class="text-sm font-bold text-white truncate mt-1">${sp.name}</h3>
            <p class="text-[11px] text-white/50 truncate">${sp.owner} · ${sp.total_tracks} canciones</p>
          </div>
        </div>

        <!-- Hero Actions -->
        <div class="grid grid-cols-3 gap-2 pt-1">
          <button id="btn-sp-play-all" class="py-2 px-2 rounded-xl bg-sonic-green hover:bg-emerald-400 text-black font-bold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all shadow-md shadow-green-500/20">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            <span>Reproducir</span>
          </button>

          <button id="btn-sp-download-all" class="py-2 px-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all border border-white/10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Descargar</span>
          </button>

          <button id="btn-sp-save-app" class="py-2 px-2 rounded-xl bg-sonic-cyan/15 hover:bg-sonic-cyan/25 text-sonic-cyan font-bold text-xs flex items-center justify-center gap-1 active:scale-95 transition-all border border-sonic-cyan/30">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
            <span>A la App</span>
          </button>
        </div>
      </div>

      <!-- Tracks List -->
      <div class="divide-y divide-white/5 space-y-1.5" id="sp-tracks-list">
        ${sp.tracks.map((t, idx) => `
          <div class="flex items-center justify-between p-2 rounded-2xl hover:bg-white/5 transition-all group" data-sp-idx="${idx}">
            <div class="flex items-center gap-3 min-w-0 flex-1 cursor-pointer btn-sp-play-track">
              <span class="text-[11px] font-mono text-white/30 w-5 text-center flex-shrink-0">${idx + 1}</span>
              <div class="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-obsidian-800 border border-white/10">
                <img src="${t.cover_url || ''}" alt="Cover" class="w-full h-full object-cover" onerror="this.style.display='none'" />
              </div>
              <div class="min-w-0 flex-1">
                <h4 class="text-xs font-semibold text-white truncate">${t.name}</h4>
                <p class="text-[11px] text-white/50 truncate">${t.artists}</p>
              </div>
            </div>

            <div class="flex items-center gap-1.5 pl-2">
              <span class="text-[10px] font-mono text-white/40 mr-1">${t.duration_str}</span>
              <!-- Direct Play Button -->
              <button class="btn-sp-play-track p-2 rounded-xl bg-sonic-green text-black hover:bg-emerald-400 font-bold flex items-center justify-center active:scale-90 shadow-md shadow-green-500/20 transition-all" title="Reproducir canción">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
              </button>
              <!-- Direct Download Button -->
              <button class="btn-sp-download-track p-2 rounded-xl bg-white/10 text-white/80 hover:text-white hover:bg-white/15 active:scale-90 transition-all" title="Descargar tema">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // 1. Play All
    document.getElementById('btn-sp-play-all')?.addEventListener('click', () => {
      audioEngine.playQueue(sp.tracks, 0);
      this.close();
      document.getElementById('nav-btn-player')?.click();
    });

    // 2. Download All
    document.getElementById('btn-sp-download-all')?.addEventListener('click', async () => {
      try {
        const btn = document.getElementById('btn-sp-download-all') as HTMLButtonElement;
        btn.disabled = true;
        btn.innerHTML = '<span class="text-[10px] animate-pulse">Agregando...</span>';
        const count = await downloadEngine.addBatchDownloads(sp.tracks);
        alert(`¡Se agregaron ${count} canciones a la cola de descargas!`);
        document.getElementById('nav-btn-downloads')?.click();
        this.close();
      } catch (err: any) {
        alert(err.message || 'Error al iniciar descarga masiva');
      } finally {
        const btn = document.getElementById('btn-sp-download-all') as HTMLButtonElement;
        if (btn) btn.disabled = false;
      }
    });

    // 3. Save as Local App Playlist
    document.getElementById('btn-sp-save-app')?.addEventListener('click', async () => {
      try {
        const created = await localLibrary.createPlaylist(sp.name);
        for (const t of sp.tracks) {
          await localLibrary.addTrackToPlaylist(created.id, t);
        }
        alert(`¡Playlist "${sp.name}" guardada en la app con éxito! La encontrarás en la pestaña Playlists.`);
      } catch (err: any) {
        alert('Error al guardar playlist: ' + (err.message || err));
      }
    });

    // Track rows play
    this.resultsContainer.querySelectorAll('.btn-sp-play-track').forEach((btn) => {
      btn.addEventListener('click', () => {
        const row = btn.closest('[data-sp-idx]');
        const idx = parseInt(row?.getAttribute('data-sp-idx') || '0', 10);
        audioEngine.playTrack(sp.tracks[idx]);
        this.close();
        document.getElementById('nav-btn-player')?.click();
      });
    });

    // Track rows download
    this.resultsContainer.querySelectorAll('.btn-sp-download-track').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const row = btn.closest('[data-sp-idx]');
        const idx = parseInt(row?.getAttribute('data-sp-idx') || '0', 10);
        try {
          btn.innerHTML = `<span class="w-3.5 h-3.5 rounded-full border border-sonic-green border-t-transparent animate-spin"></span>`;
          await downloadEngine.addDownload(sp.tracks[idx]);
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-sonic-green"><polyline points="20 6 9 17 4 12"/></svg>`;
        } catch (err: any) {
          alert(err.message || 'Error al iniciar descarga');
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
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
        <div class="flex items-center gap-3 min-w-0 flex-1 cursor-pointer btn-play-row">
          <div class="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-obsidian-800 border border-white/10">
            <img src="${t.cover_url}" alt="Cover" class="w-full h-full object-cover" onerror="this.style.display='none'" />
          </div>
          <div class="min-w-0 flex-1">
            <h4 class="text-xs font-semibold text-white truncate">${t.name}</h4>
            <p class="text-[11px] text-white/50 truncate">${t.artists}</p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 pl-2">
          <!-- Direct Play Button (Requested by user) -->
          <button class="btn-play-action p-2 rounded-xl bg-sonic-green text-black hover:bg-emerald-400 font-bold flex items-center justify-center active:scale-90 shadow-md shadow-green-500/20 transition-all" title="Reproducir ahora" data-idx="${idx}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
          </button>
          <!-- Direct Download Button -->
          <button class="btn-download-result p-2 rounded-xl bg-white/10 text-white/80 hover:text-white hover:bg-white/15 text-xs font-medium flex items-center justify-center active:scale-90 transition-all" title="Descargar tema" data-idx="${idx}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Play click (row or direct Play button)
    const handlePlay = (idx: number) => {
      audioEngine.playTrack(tracks[idx]);
      this.close();
      const navPlayerBtn = document.getElementById('nav-btn-player');
      navPlayerBtn?.click();
    };

    this.resultsContainer.querySelectorAll('.btn-play-row').forEach((el, i) => {
      el.addEventListener('click', () => handlePlay(i));
    });

    this.resultsContainer.querySelectorAll('.btn-play-action').forEach((btn, i) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        handlePlay(i);
      });
    });

    // Download click
    this.resultsContainer.querySelectorAll('.btn-download-result').forEach((btn, i) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          btn.innerHTML = `<span class="w-3.5 h-3.5 rounded-full border border-sonic-green border-t-transparent animate-spin"></span>`;
          await downloadEngine.addDownload(tracks[i]);
          btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-sonic-green"><polyline points="20 6 9 17 4 12"/></svg>`;
        } catch (err: any) {
          alert(err.message || 'Error al iniciar descarga');
          btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
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
