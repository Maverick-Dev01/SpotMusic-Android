import { localLibrary } from '../services/localLibrary';
import { audioEngine } from '../services/audioEngine';
import { Playlist, Track } from '../types';

export class PlaylistModal {
  private overlay: HTMLElement;
  private currentPlaylist: Playlist | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'playlist-modal-overlay';
    this.overlay.className = 'fixed inset-0 bg-obsidian-900/95 backdrop-blur-2xl z-50 flex flex-col p-5 transition-opacity duration-300 opacity-0 pointer-events-none';

    this.overlay.innerHTML = `
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-white/10">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-2xl bg-sonic-cyan/10 border border-sonic-cyan/20 flex items-center justify-center text-sonic-cyan">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
          </div>
          <div>
            <h3 class="text-sm font-bold text-white" id="pl-modal-title">Tus Playlists</h3>
            <p class="text-[11px] text-white/50" id="pl-modal-subtitle">Organiza y mueve tus canciones</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-create-new-pl" class="px-3 py-1.5 rounded-xl bg-sonic-green text-black font-bold text-xs flex items-center gap-1 active:scale-95 transition-all">
            <span>+ Nueva</span>
          </button>
          <button id="btn-close-pl-modal" class="p-2 text-white/40 hover:text-white rounded-full">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <!-- Playlists List View -->
      <div class="flex-1 overflow-y-auto space-y-2 py-3" id="pl-list-container"></div>

      <!-- Detail View -->
      <div class="flex-1 overflow-y-auto space-y-3 py-2 hidden" id="pl-detail-container">
        <div class="flex items-center justify-between pb-2 border-b border-white/5">
          <button id="btn-back-to-pl-list" class="text-xs text-white/60 hover:text-white flex items-center gap-1 py-1 px-2 rounded-lg bg-white/5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
            <span>Volver</span>
          </button>
          <div class="flex gap-1.5">
            <button id="btn-play-all-pl" class="px-3 py-1.5 rounded-xl bg-sonic-green text-black font-bold text-xs shadow-md shadow-green-500/20 active:scale-95">
              Reproducir Todo
            </button>
            <button id="btn-delete-current-pl" class="p-1.5 text-red-400 hover:text-red-300 rounded-xl bg-red-500/10" title="Eliminar Playlist">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        <div class="space-y-1.5" id="pl-tracks-container"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.setupEvents();
  }

  private setupEvents() {
    document.getElementById('btn-close-pl-modal')?.addEventListener('click', () => this.close());
    document.getElementById('btn-back-to-pl-list')?.addEventListener('click', () => this.showList());

    document.getElementById('btn-create-new-pl')?.addEventListener('click', async () => {
      const name = prompt('Nombre de la nueva playlist:');
      if (name && name.trim()) {
        await localLibrary.createPlaylist(name.trim());
        this.renderList();
      }
    });

    document.getElementById('btn-play-all-pl')?.addEventListener('click', () => {
      if (this.currentPlaylist && this.currentPlaylist.tracks.length > 0) {
        audioEngine.playQueue(this.currentPlaylist.tracks, 0);
        this.close();
        document.getElementById('nav-btn-player')?.click();
      }
    });

    document.getElementById('btn-delete-current-pl')?.addEventListener('click', async () => {
      if (!this.currentPlaylist) return;
      if (confirm(`¿Eliminar la playlist "${this.currentPlaylist.name}"?`)) {
        await localLibrary.deletePlaylist(this.currentPlaylist.id);
        this.showList();
        this.renderList();
      }
    });
  }

  private async renderList() {
    const container = document.getElementById('pl-list-container');
    if (!container) return;

    const playlists = await localLibrary.getAllPlaylists();

    if (!playlists.length) {
      container.innerHTML = `
        <div class="py-20 text-center text-white/40 flex flex-col items-center justify-center gap-3">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m9 18 6-6-6-6"/></svg>
          <p class="text-xs">Aún no tienes playlists creadas. Pulsa "+ Nueva" para crear una.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = playlists.map((pl, idx) => `
      <div class="btn-open-pl-card flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 cursor-pointer transition-all active:scale-[0.99]" data-idx="${idx}">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-12 h-12 rounded-xl overflow-hidden bg-obsidian-800 border border-white/10 flex items-center justify-center flex-shrink-0">
            ${pl.cover_url ? `<img src="${pl.cover_url}" class="w-full h-full object-cover" />` : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-sonic-green"><path d="m9 18 6-6-6-6"/></svg>`}
          </div>
          <div class="min-w-0">
            <h4 class="text-xs font-bold text-white truncate">${pl.name}</h4>
            <p class="text-[11px] text-white/50">${pl.trackCount || pl.tracks.length} canciones</p>
          </div>
        </div>
        <div class="text-white/40">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-open-pl-card').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-idx') || '0', 10);
        this.openPlaylistDetail(playlists[idx]);
      });
    });
  }

  private openPlaylistDetail(pl: Playlist) {
    this.currentPlaylist = pl;
    const listEl = document.getElementById('pl-list-container');
    const detailEl = document.getElementById('pl-detail-container');
    const titleEl = document.getElementById('pl-modal-title');
    const subEl = document.getElementById('pl-modal-subtitle');
    const tracksEl = document.getElementById('pl-tracks-container');

    if (listEl) listEl.classList.add('hidden');
    if (detailEl) detailEl.classList.remove('hidden');
    if (titleEl) titleEl.textContent = pl.name;
    if (subEl) subEl.textContent = `${pl.tracks.length} canciones`;

    if (!tracksEl) return;

    if (!pl.tracks.length) {
      tracksEl.innerHTML = `
        <div class="py-12 text-center text-white/40 text-xs">Esta playlist está vacía. Añade canciones desde la búsqueda.</div>
      `;
      return;
    }

    tracksEl.innerHTML = pl.tracks.map((t, idx) => `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all">
        <div class="btn-play-single-pl-track flex items-center gap-3 min-w-0 flex-1 cursor-pointer" data-idx="${idx}">
          <div class="w-10 h-10 rounded-lg overflow-hidden bg-obsidian-800 flex-shrink-0">
            <img src="${t.cover_url || ''}" class="w-full h-full object-cover" onerror="this.style.display='none'" />
          </div>
          <div class="min-w-0 flex-1">
            <h5 class="text-xs font-semibold text-white truncate">${t.name}</h5>
            <p class="text-[11px] text-white/50 truncate">${t.artists}</p>
          </div>
        </div>
        <button class="btn-remove-from-pl p-2 text-white/30 hover:text-red-400" data-id="${t.id}" title="Quitar de playlist">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `).join('');

    tracksEl.querySelectorAll('.btn-play-single-pl-track').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-idx') || '0', 10);
        audioEngine.playQueue(pl.tracks, idx);
        this.close();
        document.getElementById('nav-btn-player')?.click();
      });
    });

    tracksEl.querySelectorAll('.btn-remove-from-pl').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const tId = btn.getAttribute('data-id');
        if (tId && this.currentPlaylist) {
          await localLibrary.removeTrackFromPlaylist(this.currentPlaylist.id, tId);
          this.currentPlaylist.tracks = this.currentPlaylist.tracks.filter(t => t.id !== tId);
          this.openPlaylistDetail(this.currentPlaylist);
        }
      });
    });
  }

  private showList() {
    const listEl = document.getElementById('pl-list-container');
    const detailEl = document.getElementById('pl-detail-container');
    const titleEl = document.getElementById('pl-modal-title');
    const subEl = document.getElementById('pl-modal-subtitle');

    if (listEl) listEl.classList.remove('hidden');
    if (detailEl) detailEl.classList.add('hidden');
    if (titleEl) titleEl.textContent = 'Tus Playlists';
    if (subEl) subEl.textContent = 'Organiza y mueve tus canciones';
    this.currentPlaylist = null;
  }

  public open() {
    this.overlay.classList.remove('pointer-events-none', 'opacity-0');
    this.overlay.classList.add('opacity-100');
    this.showList();
    this.renderList();
  }

  public close() {
    this.overlay.classList.add('pointer-events-none', 'opacity-0');
    this.overlay.classList.remove('opacity-100');
  }
}
