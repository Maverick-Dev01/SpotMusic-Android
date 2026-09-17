import { audioEngine } from './services/audioEngine';
import { localLibrary } from './services/localLibrary';
import { licenseClient } from './services/licenseClient';
import { downloadEngine } from './services/downloadEngine';
import { Track } from './types';

// UI Components
import { VinylDeck } from './components/VinylDeck';
import { WaveVisualizer } from './components/WaveVisualizer';
import { QueueDrawer } from './components/QueueDrawer';
import { EqualizerModal } from './components/EqualizerModal';
import { SleepTimerModal } from './components/SleepTimerModal';
import { SearchModal } from './components/SearchModal';
import { SettingsModal } from './components/SettingsModal';
import { PlaylistModal } from './components/PlaylistModal';
import { updaterClient } from './services/updaterClient';

document.addEventListener('DOMContentLoaded', async () => {
  // 0. Restore Theme & Accent
  const savedMode = localStorage.getItem('spotmusic_theme_mode') || 'dark';
  if (savedMode === 'light') {
    document.body.classList.add('theme-light');
    document.documentElement.classList.remove('dark');
  } else {
    document.body.classList.remove('theme-light');
    document.documentElement.classList.add('dark');
  }
  const savedAccent = localStorage.getItem('spotmusic_accent_color') || '#1ED760';
  document.documentElement.style.setProperty('--accent-color', savedAccent);
  try {
    const hex = savedAccent.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    document.documentElement.style.setProperty('--accent-color-rgb', `${r}, ${g}, ${b}`);
  } catch {}

  // 1. Initialize Components
  const vinylDeck = new VinylDeck('vinyl-deck-container');
  const waveVisualizer = new WaveVisualizer('waveform-container');
  const queueDrawer = new QueueDrawer();
  const equalizerModal = new EqualizerModal();
  const sleepTimerModal = new SleepTimerModal();
  const searchModal = new SearchModal();
  const settingsModal = new SettingsModal();
  const playlistModal = new PlaylistModal();

  // 2. DOM Elements
  const trackNameEl = document.getElementById('current-track-name');
  const trackArtistEl = document.getElementById('current-track-artist');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const iconPlayHero = document.getElementById('icon-play-hero');
  const iconPauseHero = document.getElementById('icon-pause-hero');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnShuffle = document.getElementById('btn-shuffle');
  const btnRepeat = document.getElementById('btn-repeat');
  const btnPlayerFavorite = document.getElementById('btn-player-favorite');
  const playerQueueCount = document.getElementById('player-queue-count');
  const playerEqBadge = document.getElementById('player-eq-badge');
  const playerSleepBadge = document.getElementById('player-sleep-badge');

  // Mini-Player DOM Elements
  const miniPlayerBar = document.getElementById('mini-player-bar');
  const miniPlayerTitle = document.getElementById('mini-player-title');
  const miniPlayerArtist = document.getElementById('mini-player-artist');
  const miniPlayerCover = document.getElementById('mini-player-cover') as HTMLImageElement;
  const btnMiniPlayPause = document.getElementById('btn-mini-play-pause');
  const iconMiniPlay = document.getElementById('icon-mini-play');
  const iconMiniPause = document.getElementById('icon-mini-pause');
  const btnMiniNext = document.getElementById('btn-mini-next');

  // Modals Triggers
  document.getElementById('btn-open-queue')?.addEventListener('click', () => queueDrawer.open());
  document.getElementById('btn-open-eq')?.addEventListener('click', () => equalizerModal.open());
  document.getElementById('btn-open-sleep')?.addEventListener('click', () => sleepTimerModal.open());
  document.getElementById('btn-open-search')?.addEventListener('click', () => searchModal.open());
  document.getElementById('btn-open-settings')?.addEventListener('click', () => settingsModal.open());
  document.getElementById('btn-open-playlists-tab')?.addEventListener('click', () => playlistModal.open());
  document.getElementById('nav-btn-playlists')?.addEventListener('click', () => playlistModal.open());

  // In-Player Direct Download Button
  const btnPlayerDownload = document.getElementById('btn-player-download');
  btnPlayerDownload?.addEventListener('click', async () => {
    const track = audioEngine.currentTrack;
    if (!track) {
      alert('Selecciona una canción primero para descargar.');
      return;
    }
    try {
      btnPlayerDownload.classList.add('text-sonic-green', 'scale-125');
      setTimeout(() => btnPlayerDownload.classList.remove('scale-125'), 300);
      const added = await downloadEngine.addDownload(track);
      if (added) {
        alert(`¡Descargando "${track.name}" en calidad completa! Revisa la pestaña Descargas.`);
      } else {
        alert(`"${track.name}" ya se encuentra en cola o descargada.`);
      }
    } catch (e: any) {
      alert(e.message || 'Error al descargar canción');
    }
  });

  // Mini Player Events
  miniPlayerBar?.addEventListener('click', () => {
    switchView('view-player');
  });

  btnMiniPlayPause?.addEventListener('click', (e) => {
    e.stopPropagation();
    audioEngine.togglePlay();
  });

  btnMiniNext?.addEventListener('click', (e) => {
    e.stopPropagation();
    audioEngine.next();
  });

  // 3. Playback Controls
  btnPlayPause?.addEventListener('click', () => {
    audioEngine.togglePlay();
  });

  btnPrev?.addEventListener('click', () => audioEngine.prev());
  btnNext?.addEventListener('click', () => audioEngine.next());

  btnShuffle?.addEventListener('click', () => {
    const isShuffle = audioEngine.toggleShuffle();
    if (btnShuffle) {
      btnShuffle.className = `p-3 rounded-full transition-colors ${isShuffle ? 'text-sonic-green' : 'text-white/40 hover:text-white'}`;
    }
  });

  btnRepeat?.addEventListener('click', () => {
    const mode = audioEngine.cycleRepeat();
    if (btnRepeat) {
      if (mode === 'off') {
        btnRepeat.className = 'p-3 rounded-full text-white/40 hover:text-white transition-colors';
        btnRepeat.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>';
      } else if (mode === 'all') {
        btnRepeat.className = 'p-3 rounded-full text-sonic-green transition-colors';
        btnRepeat.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>';
      } else {
        btnRepeat.className = 'p-3 rounded-full text-sonic-cyan transition-colors';
        btnRepeat.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><text x="11" y="15" font-size="8" font-weight="bold" fill="currentColor">1</text></svg>';
      }
    }
  });

  btnPlayerFavorite?.addEventListener('click', async () => {
    const track = audioEngine.currentTrack;
    if (track) {
      const isFav = await localLibrary.toggleFavorite(track);
      track.isFavorite = isFav;
      updateFavoriteButton(isFav);
      refreshLibraryView();
    }
  });

  function updateFavoriteButton(isFav: boolean) {
    if (!btnPlayerFavorite) return;
    if (isFav) {
      btnPlayerFavorite.className = 'p-2 text-sonic-rose transition-colors';
      btnPlayerFavorite.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
    } else {
      btnPlayerFavorite.className = 'p-2 text-white/40 hover:text-sonic-rose transition-colors';
      btnPlayerFavorite.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
    }
  }

  // View Tracking and Mini-Player Visibility Manager
  let currentActiveViewId = 'view-player';

  function updateMiniPlayerVisibility() {
    if (!miniPlayerBar) return;
    // On the main turntable player screen, NEVER show duplicate mini player controls
    if (currentActiveViewId === 'view-player') {
      miniPlayerBar.classList.add('hidden');
    } else {
      // In Library or Downloads views, show mini player if a track is active
      if (audioEngine.currentTrack) {
        miniPlayerBar.classList.remove('hidden');
      } else {
        miniPlayerBar.classList.add('hidden');
      }
    }
  }

  // 4. Audio Engine Event Listeners
  audioEngine.on('play', () => {
    if (iconPlayHero) iconPlayHero.style.display = 'none';
    if (iconPauseHero) iconPauseHero.style.display = 'block';
    if (iconMiniPlay) iconMiniPlay.style.display = 'none';
    if (iconMiniPause) iconMiniPause.style.display = 'block';
    updateMiniPlayerVisibility();
  });

  audioEngine.on('pause', () => {
    if (iconPlayHero) iconPlayHero.style.display = 'block';
    if (iconPauseHero) iconPauseHero.style.display = 'none';
    if (iconMiniPlay) iconMiniPlay.style.display = 'block';
    if (iconMiniPause) iconMiniPause.style.display = 'none';
  });

  audioEngine.on('trackchange', (track: Track) => {
    if (trackNameEl) trackNameEl.textContent = track.name;
    if (trackArtistEl) trackArtistEl.textContent = `${track.artists} · ${track.album || 'SpotMusic'}`;
    if (miniPlayerTitle) miniPlayerTitle.textContent = track.name;
    if (miniPlayerArtist) miniPlayerArtist.textContent = track.artists;
    if (miniPlayerCover) miniPlayerCover.src = track.cover_url || '/logo.png';
    updateMiniPlayerVisibility();
    updateFavoriteButton(track.isFavorite || false);
    localLibrary.logHistory(track);
  });

  audioEngine.on('queuechange', ({ queue }: any) => {
    if (playerQueueCount) playerQueueCount.textContent = queue.length.toString();
  });

  audioEngine.on('eqchange', (data: any) => {
    if (playerEqBadge) playerEqBadge.textContent = `EQ: ${data.preset}`;
  });

  audioEngine.on('sleeptimertick', (secRemaining: number) => {
    if (playerSleepBadge) {
      const m = Math.floor(secRemaining / 60);
      const s = secRemaining % 60;
      playerSleepBadge.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      playerSleepBadge.parentElement?.classList.add('text-sonic-violet', 'border-sonic-violet/40');
    }
  });

  audioEngine.on('sleeptimercancel', () => {
    if (playerSleepBadge) {
      playerSleepBadge.textContent = 'Timer';
      playerSleepBadge.parentElement?.classList.remove('text-sonic-violet', 'border-sonic-violet/40');
    }
  });

  audioEngine.on('sleeptimerend', () => {
    if (playerSleepBadge) {
      playerSleepBadge.textContent = 'Timer';
      playerSleepBadge.parentElement?.classList.remove('text-sonic-violet', 'border-sonic-violet/40');
    }
  });

  // 5. Navigation Dock (View Switching)
  const views = {
    'view-player': document.getElementById('view-player'),
    'view-library': document.getElementById('view-library'),
    'view-downloads': document.getElementById('view-downloads')
  };

  const dockButtons = document.querySelectorAll('.nav-dock-btn');

  function switchView(targetViewId: string) {
    currentActiveViewId = targetViewId;
    Object.keys(views).forEach(id => {
      const el = (views as any)[id];
      if (id === targetViewId) {
        el?.classList.remove('hidden');
      } else {
        el?.classList.add('hidden');
      }
    });

    dockButtons.forEach(btn => {
      const viewId = btn.getAttribute('data-view');
      const icon = btn.querySelector('svg');
      if (viewId === targetViewId) {
        btn.className = 'nav-dock-btn flex-1 py-2 rounded-full flex flex-col items-center gap-1 text-sonic-green font-bold text-[10px] transition-all';
        if (icon) icon.setAttribute('fill', 'currentColor');
      } else {
        btn.className = 'nav-dock-btn flex-1 py-2 rounded-full flex flex-col items-center gap-1 text-white/50 hover:text-white font-medium text-[10px] transition-all';
        if (icon) icon.setAttribute('fill', 'none');
      }
    });

    updateMiniPlayerVisibility();

    if (targetViewId === 'view-library') refreshLibraryView();
    if (targetViewId === 'view-downloads') renderDownloadedTracks();
  }

  dockButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-view');
      if (v) switchView(v);
    });
  });

  // 6. Library View Controller
  let currentLibTab: 'all' | 'favs' | 'recent' = 'all';
  const libTracksContainer = document.getElementById('library-tracks-container');
  const libTotalCount = document.getElementById('library-total-count');

  document.querySelectorAll('.btn-lib-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-lib-filter').forEach(b => {
        b.className = 'btn-lib-filter px-3.5 py-1.5 rounded-full text-xs font-medium bg-white/5 text-white/70 border border-white/10';
      });
      btn.className = 'btn-lib-filter px-3.5 py-1.5 rounded-full text-xs font-semibold bg-sonic-green text-black';
      currentLibTab = (btn.getAttribute('data-tab') as any) || 'all';
      refreshLibraryView();
    });
  });

  document.getElementById('btn-refresh-library')?.addEventListener('click', refreshLibraryView);

  document.getElementById('btn-scan-device-audio')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-scan-device-audio');
    const originalHtml = btn?.innerHTML || '';
    if (btn) btn.innerHTML = '<span class="text-sonic-green font-bold animate-pulse">Buscando...</span>';
    try {
      const found = await localLibrary.scanDeviceAudio();
      alert(`Escaneo completado: se encontraron y agregaron ${found.length} archivos de audio de tu dispositivo.`);
      refreshLibraryView();
    } catch (e: any) {
      alert('Aviso al escanear almacenamiento: ' + (e.message || e));
    } finally {
      if (btn) btn.innerHTML = originalHtml;
    }
  });

  async function refreshLibraryView() {
    if (!libTracksContainer) return;

    let tracks: Track[] = [];
    if (currentLibTab === 'all') tracks = await localLibrary.getAllTracks();
    else if (currentLibTab === 'favs') tracks = await localLibrary.getFavorites();
    else tracks = await localLibrary.getRecentHistory(40);

    if (libTotalCount) libTotalCount.textContent = tracks.length.toString();

    if (!tracks.length) {
      libTracksContainer.innerHTML = `
        <div class="py-16 text-center text-white/40 flex flex-col items-center justify-center gap-3">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <p class="text-xs">No hay canciones en esta sección.<br/>Usa la lupa para buscar y descargar música.</p>
        </div>
      `;
      return;
    }

    libTracksContainer.innerHTML = tracks.map((t, idx) => `
      <div class="flex items-center justify-between p-2.5 rounded-2xl hover:bg-white/5 transition-all cursor-pointer group" data-lib-idx="${idx}">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class="relative w-11 h-11 rounded-xl overflow-hidden flex-shrink-0 bg-obsidian-800 border border-white/10">
            <img src="${t.cover_url || ''}" alt="Cover" class="w-full h-full object-cover" onerror="this.style.display='none'" />
          </div>
          <div class="min-w-0 flex-1">
            <h4 class="text-xs font-semibold text-white truncate">${t.name}</h4>
            <p class="text-[11px] text-white/50 truncate">${t.artists}</p>
          </div>
        </div>

        <div class="flex items-center gap-2 pl-2">
          <span class="text-[10px] font-mono text-white/40">${t.duration_str || '--:--'}</span>
          <button class="btn-lib-delete p-1.5 text-white/30 hover:text-red-400 rounded-lg" data-id="${t.id}" title="Eliminar de biblioteca">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Click track to play
    libTracksContainer.querySelectorAll('[data-lib-idx]').forEach((el, i) => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.btn-lib-delete')) return;
        audioEngine.playQueue(tracks, i);
        switchView('view-player');
      });
    });

    // Delete single track
    libTracksContainer.querySelectorAll('.btn-lib-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (id && confirm('¿Deseas quitar esta canción de tu biblioteca?')) {
          await localLibrary.deleteTrack(id);
          refreshLibraryView();
        }
      });
    });
  }

  // 7. Downloads Hub Controller
  const downloadsContainer = document.getElementById('downloads-tasks-container');
  const downloadedContainer = document.getElementById('downloaded-tracks-list');
  const downloadedCountBadge = document.getElementById('downloaded-count-badge');
  const downloadTasksBadge = document.getElementById('download-tasks-badge');
  const navDownloadsBadge = document.getElementById('nav-downloads-badge');
  const tabBtnDownloaded = document.getElementById('tab-btn-downloaded');
  const tabBtnTasks = document.getElementById('tab-btn-tasks');

  // Segmented Tabs: Descargadas vs En Progreso
  tabBtnDownloaded?.addEventListener('click', () => {
    tabBtnDownloaded.className = 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-sonic-green text-black transition-all';
    if (tabBtnTasks) tabBtnTasks.className = 'px-3.5 py-1.5 rounded-full text-xs font-medium bg-white/5 text-white/70 border border-white/10 transition-all';
    downloadedContainer?.classList.remove('hidden');
    downloadsContainer?.classList.add('hidden');
    renderDownloadedTracks();
  });

  tabBtnTasks?.addEventListener('click', () => {
    if (tabBtnTasks) tabBtnTasks.className = 'px-3.5 py-1.5 rounded-full text-xs font-bold bg-sonic-green text-black transition-all';
    if (tabBtnDownloaded) tabBtnDownloaded.className = 'px-3.5 py-1.5 rounded-full text-xs font-medium bg-white/5 text-white/70 border border-white/10 transition-all';
    downloadedContainer?.classList.add('hidden');
    downloadsContainer?.classList.remove('hidden');
  });

  async function renderDownloadedTracks() {
    if (!downloadedContainer) return;
    const allTracks = await localLibrary.getAllTracks();
    const dlTracks = allTracks.filter(t => t.isLocal || !!t.localPath);
    if (downloadedCountBadge) downloadedCountBadge.textContent = dlTracks.length.toString();

    if (!dlTracks.length) {
      downloadedContainer.innerHTML = `
        <div class="py-16 text-center text-white/40 flex flex-col items-center justify-center gap-3">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <p class="text-xs">No tienes canciones descargadas aún.<br/>Usa la lupa o el botón ⬇️ en el reproductor.</p>
        </div>
      `;
      return;
    }

    downloadedContainer.innerHTML = dlTracks.map((t, idx) => `
      <div class="flex items-center justify-between p-3 rounded-2xl bg-obsidian-800/80 border border-white/10 hover:border-sonic-green/30 transition-all cursor-pointer group" data-dl-idx="${idx}">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class="relative w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-obsidian-900 border border-white/10">
            <img src="${t.cover_url || './logo.png'}" alt="Cover" class="w-full h-full object-cover" onerror="this.src='./logo.png'" />
            <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" class="text-sonic-green"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <h4 class="text-xs font-bold text-white truncate">${t.name}</h4>
            <p class="text-[11px] text-white/60 truncate">${t.artists}</p>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sonic-green/20 text-sonic-green font-semibold">${t.format || '320 KBPS'}</span>
              <span class="text-[9px] font-mono text-white/40">${t.size || ''}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2 pl-2">
          <button class="btn-play-dl w-9 h-9 rounded-full bg-sonic-green hover:bg-emerald-400 text-black flex items-center justify-center shadow-md active:scale-90 transition-all" data-dl-idx="${idx}" title="Reproducir ahora">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
          </button>
          <button class="btn-del-dl p-2 text-white/30 hover:text-red-400 rounded-lg active:scale-90 transition-all" data-id="${t.id}" title="Eliminar archivo descargado">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    // Click track row or play button
    downloadedContainer.querySelectorAll('.btn-play-dl, [data-dl-idx]').forEach(el => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.btn-del-dl')) return;
        const idxStr = el.getAttribute('data-dl-idx');
        const idx = idxStr !== null ? parseInt(idxStr, 10) : 0;
        audioEngine.playQueue(dlTracks, idx);
        switchView('view-player');
      });
    });

    // Delete track
    downloadedContainer.querySelectorAll('.btn-del-dl').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (id && confirm('¿Deseas eliminar este archivo descargado?')) {
          await localLibrary.deleteTrack(id);
          renderDownloadedTracks();
          refreshLibraryView();
        }
      });
    });
  }

  // Initial render of downloaded tracks
  renderDownloadedTracks();

  // Active Downloads Subscription
  downloadEngine.subscribe((tasks) => {
    const active = tasks.some(t => t.status === 'downloading' || t.status === 'queued');
    if (navDownloadsBadge) navDownloadsBadge.classList.toggle('hidden', !active);
    if (downloadTasksBadge) downloadTasksBadge.textContent = tasks.length.toString();

    // If any completed, refresh downloaded library
    if (tasks.some(t => t.status === 'completed')) {
      renderDownloadedTracks();
      refreshLibraryView();
    }

    if (!downloadsContainer) return;
    if (!tasks.length) {
      downloadsContainer.innerHTML = `
        <div class="py-20 text-center text-white/40 flex flex-col items-center justify-center gap-3">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <p class="text-xs">No hay descargas activas en este momento</p>
        </div>
      `;
      return;
    }

    downloadsContainer.innerHTML = tasks.map(task => `
      <div class="bg-obsidian-800/80 border border-white/10 rounded-2xl p-3.5 space-y-2">
        <div class="flex items-center justify-between">
          <div class="min-w-0 flex-1 pr-2">
            <h4 class="text-xs font-bold text-white truncate">${task.track.name}</h4>
            <p class="text-[11px] text-white/50 truncate">${task.track.artists}</p>
          </div>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded-full ${task.status === 'completed' ? 'bg-sonic-green/20 text-sonic-green' : task.status === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/70'}">
            ${task.status === 'completed' ? 'Listo ✓' : task.status === 'downloading' ? `${task.percent}%` : task.status === 'error' ? 'Error' : 'En cola'}
          </span>
        </div>

        ${task.status === 'downloading' ? `
          <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r from-sonic-green to-sonic-cyan rounded-full transition-all duration-300" style="width: ${task.percent}%"></div>
          </div>
        ` : ''}

        ${task.error ? `<div class="text-[10px] text-red-400">${task.error}</div>` : ''}
      </div>
    `).join('');
  });

  document.getElementById('btn-clear-downloads')?.addEventListener('click', () => {
    downloadEngine.clearFinished();
  });

  // 8. License State Reactive Sync
  function updateSettingsBadge(info: any) {
    const dot = document.getElementById('settings-status-dot');
    if (dot) {
      if (info.valid) {
        dot.className = 'absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-sonic-green border-2 border-obsidian-900';
      } else if (info.status === 'revoked') {
        dot.className = 'absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-obsidian-900';
      } else {
        dot.className = 'absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-yellow-400 border-2 border-obsidian-900';
      }
    }
  }

  licenseClient.on('change', updateSettingsBadge);
  const initialLicense = await licenseClient.checkLicense();
  updateSettingsBadge(initialLicense);

  // Load sample initial song if library has any
  const existingTracks = await localLibrary.getAllTracks();
  if (existingTracks.length > 0) {
    vinylDeck.updateTrack(existingTracks[0]);
    if (trackNameEl) trackNameEl.textContent = existingTracks[0].name;
    if (trackArtistEl) trackArtistEl.textContent = `${existingTracks[0].artists} · ${existingTracks[0].album || 'SpotMusic'}`;
    audioEngine.addToQueue(existingTracks[0]);
  }

  // 9. Silent Auto-Check for Updates on Launch
  try {
    const update = await updaterClient.checkForUpdates();
    const dot = document.getElementById('settings-status-dot');
    if (update.hasUpdate && dot) {
      dot.className = 'absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-sonic-cyan border-2 border-obsidian-900 animate-pulse';
    }
  } catch (e) {
    console.warn('Auto update check failed silently:', e);
  }
});
