import { appDialog } from './AppDialog';
import { escapeHtml } from '../utils/html';
import { localLibrary } from '../services/localLibrary';
import { Track, Playlist } from '../types';

export class FolderModal {
  private overlay: HTMLElement;
  private selectedTracks: Track[] = [];
  private onAssignedCallback: (() => void) | null = null;

  constructor() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'folder-modal-overlay';
    this.overlay.className = 'fixed inset-0 bg-obsidian-900/95 backdrop-blur-2xl z-50 flex flex-col p-5 transition-opacity duration-300 opacity-0 pointer-events-none';

    this.overlay.innerHTML = `
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-white/10">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-2xl bg-sonic-cyan/10 border border-sonic-cyan/20 flex items-center justify-center text-sonic-cyan">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div>
            <h3 class="text-sm font-bold text-white">Carpetas y Playlists</h3>
            <p class="text-[11px] text-white/50" id="folder-modal-subtitle">Asignar canciones seleccionadas</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="btn-folder-create-new" class="px-3 py-1.5 rounded-xl bg-sonic-green text-black font-bold text-xs flex items-center gap-1 active:scale-95 transition-all">
            <span>+ Nueva Carpeta</span>
          </button>
          <button id="btn-folder-modal-close" class="p-2 text-white/40 hover:text-white rounded-full">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      <!-- Playlists / Folders List -->
      <div class="flex-1 overflow-y-auto space-y-2 py-4" id="folder-playlists-container">
        <!-- Rendered dynamically -->
      </div>
    `;

    this.overlay.style.zIndex = '60';
    document.body.appendChild(this.overlay);
    this.setupEvents();
  }

  private setupEvents() {
    document.getElementById('btn-folder-modal-close')?.addEventListener('click', () => this.close());

    document.getElementById('btn-folder-create-new')?.addEventListener('click', async () => {
      const name = await appDialog.prompt('Nombre de la nueva carpeta / playlist:');
      if (!name || !name.trim()) return;

      try {
        const newPl = await localLibrary.createPlaylist(name.trim());
        if (this.selectedTracks.length > 0) {
          const added = await localLibrary.addTracksToPlaylist(newPl.id, this.selectedTracks);
          await appDialog.alert(`Carpeta "${name.trim()}" creada con ${added} canciones agregadas.`);
          this.close();
          if (this.onAssignedCallback) this.onAssignedCallback();
        } else {
          await this.renderFolders();
        }
      } catch (err: any) {
        await appDialog.alert('Error al crear carpeta: ' + (err.message || err));
      }
    });
  }

  private async renderFolders() {
    const container = document.getElementById('folder-playlists-container');
    if (!container) return;

    const playlists = await localLibrary.getAllPlaylists();

    if (!playlists.length) {
      container.innerHTML = `
        <div class="py-16 text-center text-white/40 flex flex-col items-center justify-center gap-3">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <p class="text-xs">No tienes carpetas ni playlists creadas aún.<br/>Pulsa "+ Nueva Carpeta" para crear la primera.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = playlists.map((pl) => `
      <div class="btn-assign-folder flex items-center justify-between p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 cursor-pointer transition-all active:scale-[0.99]" data-id="${escapeHtml(pl.id)}">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-11 h-11 rounded-xl overflow-hidden bg-obsidian-800 border border-white/10 flex items-center justify-center flex-shrink-0">
            ${pl.cover_url ? `<img src="${escapeHtml(pl.cover_url)}" class="w-full h-full object-cover" />` : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-sonic-green"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`}
          </div>
          <div class="min-w-0">
            <h4 class="text-xs font-bold text-white truncate">${escapeHtml(pl.name)}</h4>
            <p class="text-[11px] text-white/50">${pl.trackCount || pl.tracks.length} canciones</p>
          </div>
        </div>
        <button class="px-3 py-1.5 rounded-xl bg-sonic-green/20 hover:bg-sonic-green/30 text-sonic-green border border-sonic-green/30 font-bold text-xs pointer-events-none">
          + Agregar aquí
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.btn-assign-folder').forEach(el => {
      el.addEventListener('click', async () => {
        const plId = el.getAttribute('data-id');
        if (!plId) return;
        const targetPl = playlists.find(p => p.id === plId);
        if (!targetPl) return;

        try {
          const added = await localLibrary.addTracksToPlaylist(plId, this.selectedTracks);
          await appDialog.alert(`¡${added} canciones agregadas a la carpeta "${targetPl.name}"!`);
          this.close();
          if (this.onAssignedCallback) this.onAssignedCallback();
        } catch (err: any) {
          await appDialog.alert('Error al asignar canciones: ' + (err.message || err));
        }
      });
    });
  }

  public open(tracks: Track[], onAssigned?: () => void) {
    this.selectedTracks = [...tracks];
    this.onAssignedCallback = onAssigned || null;
    const subEl = document.getElementById('folder-modal-subtitle');
    if (subEl) {
      subEl.textContent = `${this.selectedTracks.length} canción(es) seleccionada(s) para mover/asignar`;
    }

    this.overlay.classList.remove('pointer-events-none', 'opacity-0');
    this.overlay.classList.add('opacity-100');
    this.renderFolders();
  }

  public close() {
    this.overlay.classList.add('pointer-events-none', 'opacity-0');
    this.overlay.classList.remove('opacity-100');
    this.selectedTracks = [];
  }
}

export const folderModal = new FolderModal();
