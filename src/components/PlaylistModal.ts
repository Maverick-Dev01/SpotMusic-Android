import { appDialog } from './AppDialog';
import { escapeHtml } from '../utils/html';
import { localLibrary } from '../services/localLibrary';
import { audioEngine } from '../services/audioEngine';
import { spotifyClient } from '../services/spotifyClient';
import { downloadEngine } from '../services/downloadEngine';
import { spotifyAuth } from '../services/spotifyAuth';
import { Playlist, Track } from '../types';

export class PlaylistModal {
  private overlay: HTMLElement;
  private currentPlaylist: Playlist | null = null;
  private selectedTrackIds = new Set<string>();

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'playlist-modal-overlay';
    this.overlay.className = 'fixed inset-0 bg-obsidian-900/95 backdrop-blur-2xl z-50 flex flex-col p-5 transition-opacity duration-300 opacity-0 pointer-events-none';

    this.overlay.innerHTML = `
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-white/10">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-2xl bg-sonic-cyan/10 border border-sonic-cyan/20 flex items-center justify-center text-sonic-cyan">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h10M4 11h10M4 16h7"/><path d="M17 5v11a2.5 2.5 0 1 1-2-2.45V7l5-1.5"/></svg>
          </div>
          <div>
            <h3 class="text-sm font-bold text-white" id="pl-modal-title">Tus Playlists</h3>
            <p class="text-[11px] text-white/50" id="pl-modal-subtitle">Organiza y transfiere tu música</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-import-spotify-pl" class="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-sonic-green border border-sonic-green/30 font-bold text-xs flex items-center gap-1 active:scale-95 transition-all" title="Importar desde Spotify">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
            <span>Spotify</span>
          </button>
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
        <div class="space-y-2 pb-2 border-b border-white/5">
          <div class="flex items-center justify-between gap-2">
          <button id="btn-back-to-pl-list" class="text-xs text-white/60 hover:text-white flex items-center gap-1 py-1 px-2 rounded-lg bg-white/5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
            <span>Volver</span>
          </button>
            <button id="btn-play-all-pl" class="px-3 py-1.5 rounded-xl bg-sonic-green text-black font-bold text-xs shadow-md shadow-green-500/20 active:scale-95">
              Reproducir
            </button>
            <button id="btn-delete-current-pl" class="p-1.5 text-red-400 hover:text-red-300 rounded-xl bg-red-500/10" title="Eliminar Playlist">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
          <div class="grid grid-cols-3 gap-1.5">
            <button id="btn-select-all-pl" class="px-2 py-2 rounded-xl bg-white/10 text-white/70 font-semibold text-[11px] leading-tight">Seleccionar todas</button>
            <button id="btn-download-selected-pl" class="px-2 py-2 rounded-xl bg-white/10 text-sonic-green font-semibold text-[11px] leading-tight">Descargar selección</button>
            <button id="btn-download-all-pl" class="px-2 py-2 rounded-xl bg-white/10 text-sonic-green font-semibold text-[11px] leading-tight">Descargar todas</button>
            <button id="btn-folder-selected-pl" class="px-2 py-2 rounded-xl bg-white/10 text-white/70 font-semibold text-[11px] leading-tight">Añadir a carpeta</button>
            <button id="btn-remove-selected-pl" class="px-2 py-2 rounded-xl bg-red-500/10 text-red-400 font-semibold text-[11px] leading-tight">Quitar selección</button>
          </div>
        </div>
        <div class="space-y-1.5" id="pl-tracks-container"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this.setupEvents();
  }

  private setupEvents() {
    document.getElementById('btn-folder-selected-pl')?.addEventListener('click', () => {
      const tracks = this.currentPlaylist?.tracks.filter(track => this.selectedTrackIds.has(track.id)) || [];
      if (tracks.length) window.dispatchEvent(new CustomEvent('organize-tracks', { detail: tracks }));
    });
    document.getElementById('btn-remove-selected-pl')?.addEventListener('click', async () => {
      const playlist = this.currentPlaylist;
      if (!playlist || !this.selectedTrackIds.size) return;
      if (!await appDialog.confirm(`¿Quitar ${this.selectedTrackIds.size} canciones de esta playlist?`)) return;
      try {
        const updated = { ...playlist, tracks: playlist.tracks.filter(track => !this.selectedTrackIds.has(track.id)) };
        await localLibrary.savePlaylist(updated);
        this.openPlaylistDetail(updated);
      } catch {
        await appDialog.alert('No se pudo guardar la playlist. Intenta de nuevo.');
      }
    });
    document.getElementById('btn-close-pl-modal')?.addEventListener('click', () => this.close());
    document.getElementById('btn-back-to-pl-list')?.addEventListener('click', () => this.showList());

    document.getElementById('btn-import-spotify-pl')?.addEventListener('click', async () => {
      const url = await appDialog.prompt('Pega el enlace de la playlist o álbum de Spotify:\n(Ejemplo: https://open.spotify.com/playlist/...)');
      if (!url || !url.trim()) return;

      const btn = document.getElementById('btn-import-spotify-pl');
      const originalHtml = btn?.innerHTML || '';
      if (btn) btn.innerHTML = '<span class="text-[10px] animate-pulse">Importando...</span>';

      try {
        await spotifyAuth.ensureAccessToken(true);
        const sp = await spotifyClient.fetchSpotifyEntity(url.trim());
        if (!sp.tracks || sp.tracks.length === 0) {
          throw new Error('No se encontraron canciones en este enlace de Spotify.');
        }
        await localLibrary.savePlaylist({
          id: `spotify-${sp.id}`,
          name: sp.name,
          description: sp.description,
          owner: sp.owner,
          cover_url: sp.cover_url,
          trackCount: sp.tracks.length,
          tracks: sp.tracks,
          source: 'spotify',
          sourceUrl: url.trim()
        });
        // Also register individual tracks to library
        for (const t of sp.tracks) {
          await localLibrary.saveTrack(t);
        }
        await appDialog.alert(sp.partial
          ? `Se importó una vista parcial de "${sp.name}" (${sp.tracks.length} canciones). Vincula tu cuenta de Spotify en Ajustes y vuelve a importar para consultar todas las canciones accesibles.`
          : `Playlist "${sp.name}" importada con ${sp.tracks.length} canciones.`);
        await this.renderList();
      } catch (err: any) {
        await appDialog.alert('Error al importar de Spotify: ' + (err.message || err));
      } finally {
        if (btn) btn.innerHTML = originalHtml;
      }
    });

    document.getElementById('btn-create-new-pl')?.addEventListener('click', async () => {
      const name = await appDialog.prompt('Nombre de la nueva playlist:');
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

    document.getElementById('btn-select-all-pl')?.addEventListener('click', () => {
      if (!this.currentPlaylist) return;
      const allSelected = this.selectedTrackIds.size === this.currentPlaylist.tracks.length;
      this.selectedTrackIds = allSelected ? new Set() : new Set(this.currentPlaylist.tracks.map(track => track.id));
      this.openPlaylistDetail(this.currentPlaylist, false);
    });

    document.getElementById('btn-download-selected-pl')?.addEventListener('click', async () => {
      if (!this.currentPlaylist) return;
      const tracks = this.currentPlaylist.tracks.filter(track => this.selectedTrackIds.has(track.id));
      if (!tracks.length) return await appDialog.alert('Selecciona al menos una canción para descargar.');
      await this.queueDownloads(tracks);
    });

    document.getElementById('btn-download-all-pl')?.addEventListener('click', async () => {
      if (!this.currentPlaylist) return;
      if (!this.currentPlaylist.tracks.length) return await appDialog.alert('Esta playlist todavía no tiene canciones.');
      await this.queueDownloads(this.currentPlaylist.tracks);
    });

    document.getElementById('btn-delete-current-pl')?.addEventListener('click', async () => {
      if (!this.currentPlaylist) return;
      if (await appDialog.confirm(`¿Eliminar la playlist "${this.currentPlaylist.name}"?`)) {
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
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6h10M4 11h10M4 16h7"/><path d="M17 5v11a2.5 2.5 0 1 1-2-2.45V7l5-1.5"/></svg>
          <p class="text-xs">Aún no tienes playlists creadas. Pulsa "+ Nueva" para crear una.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = playlists.map((pl, idx) => `
      <div class="btn-open-pl-card flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 cursor-pointer transition-all active:scale-[0.99]" data-idx="${idx}">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-12 h-12 rounded-xl overflow-hidden bg-obsidian-800 border border-white/10 flex items-center justify-center flex-shrink-0">
            ${pl.cover_url ? `<img src="${escapeHtml(pl.cover_url)}" class="w-full h-full object-cover" />` : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-sonic-green"><path d="M4 6h11M4 11h11M4 16h8"/><path d="M18 5v11a2.5 2.5 0 1 1-2-2.45V7l5-1.5"/></svg>`}
          </div>
          <div class="min-w-0">
            <h4 class="text-xs font-bold text-white truncate">${escapeHtml(pl.name)}</h4>
            <p class="text-[11px] text-white/50">${pl.trackCount || pl.tracks.length} canciones</p>
          </div>
        </div>
        <span class="px-2.5 py-1 rounded-lg bg-white/10 text-[11px] text-white/70">Abrir</span>
      </div>
    `).join('');

    container.querySelectorAll('.btn-open-pl-card').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-idx') || '0', 10);
        this.openPlaylistDetail(playlists[idx]);
      });
    });
  }

  private openPlaylistDetail(pl: Playlist, resetSelection = true) {
    this.currentPlaylist = pl;
    if (resetSelection) this.selectedTrackIds.clear();
    const listEl = document.getElementById('pl-list-container');
    const detailEl = document.getElementById('pl-detail-container');
    const titleEl = document.getElementById('pl-modal-title');
    const subEl = document.getElementById('pl-modal-subtitle');
    const tracksEl = document.getElementById('pl-tracks-container');

    if (listEl) listEl.classList.add('hidden');
    if (detailEl) detailEl.classList.remove('hidden');
    if (titleEl) titleEl.textContent = pl.name;
    if (subEl) subEl.textContent = `${pl.tracks.length} canciones · ${this.selectedTrackIds.size} seleccionadas`;
    const selectAllButton = document.getElementById('btn-select-all-pl');
    if (selectAllButton) {
      selectAllButton.textContent = pl.tracks.length > 0 && this.selectedTrackIds.size === pl.tracks.length ? 'Quitar selección' : 'Seleccionar todas';
      (selectAllButton as HTMLButtonElement).disabled = pl.tracks.length === 0;
      selectAllButton.classList.toggle('opacity-40', pl.tracks.length === 0);
    }
    for (const id of ['btn-download-selected-pl', 'btn-download-all-pl', 'btn-play-all-pl']) {
      const button = document.getElementById(id) as HTMLButtonElement | null;
      if (button) {
        button.disabled = pl.tracks.length === 0;
        button.classList.toggle('opacity-40', pl.tracks.length === 0);
      }
    }

    if (!tracksEl) return;

    if (!pl.tracks.length) {
      tracksEl.innerHTML = `
        <div class="py-12 text-center text-white/40 text-xs">Esta playlist está vacía. Añade canciones desde la búsqueda.</div>
      `;
      return;
    }

    tracksEl.innerHTML = pl.tracks.map((t, idx) => `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all">
        <input type="checkbox" class="pl-track-checkbox mr-2 accent-sonic-green" data-id="${escapeHtml(t.id)}" aria-label="Seleccionar ${escapeHtml(t.name)}" ${this.selectedTrackIds.has(t.id) ? 'checked' : ''} />
        <div class="btn-play-single-pl-track flex items-center gap-3 min-w-0 flex-1 cursor-pointer" data-idx="${idx}">
          <div class="w-10 h-10 rounded-lg overflow-hidden bg-obsidian-800 flex-shrink-0">
            <img src="${escapeHtml(t.cover_url || '')}" class="w-full h-full object-cover" data-hide-on-error />
          </div>
          <div class="min-w-0 flex-1">
            <h5 class="text-xs font-semibold text-white truncate">${escapeHtml(t.name)}</h5>
            <p class="text-[11px] text-white/50 truncate">${escapeHtml(t.artists)}</p>
          </div>
        </div>
        <button class="btn-remove-from-pl p-2 text-white/30 hover:text-red-400" data-id="${escapeHtml(t.id)}" title="Quitar de playlist">
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

    tracksEl.querySelectorAll<HTMLInputElement>('.pl-track-checkbox').forEach(input => {
      input.addEventListener('change', () => {
        const id = input.dataset.id!;
        if (input.checked) this.selectedTrackIds.add(id);
        else this.selectedTrackIds.delete(id);
        if (subEl) subEl.textContent = `${pl.tracks.length} canciones · ${this.selectedTrackIds.size} seleccionadas`;
        const selectAllButton = document.getElementById('btn-select-all-pl');
        if (selectAllButton) selectAllButton.textContent = this.selectedTrackIds.size === pl.tracks.length ? 'Quitar selección' : 'Seleccionar todas';
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

  private async queueDownloads(tracks: Track[]) {
    try {
      const count = await downloadEngine.addBatchDownloads(tracks);
      await appDialog.alert(`${count} canciones se agregaron a la cola. La cola continúa aunque cierres esta pantalla.`);
    } catch (error: any) {
      await appDialog.alert(error.message || 'No se pudieron agregar las canciones a descargas.');
    }
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
