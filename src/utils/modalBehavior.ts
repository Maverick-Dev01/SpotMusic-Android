import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** Keep Escape, Android Back, and keyboard focus consistent across app sheets. */
export function setupModalBehavior() {
  const overlays = Array.from(document.querySelectorAll<HTMLElement>('[id$="modal-overlay"], #queue-drawer-overlay'));
  for (const overlay of overlays) {
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    const title = overlay.querySelector('h3');
    overlay.setAttribute('aria-label', title?.textContent?.trim() || 'Panel de SpotMusic');
    overlay.querySelectorAll<HTMLElement>('button[id^="btn-close"]').forEach(button => button.setAttribute('aria-label', 'Cerrar'));
  }
  const active = () => overlays.filter(overlay => overlay.classList.contains('opacity-100')).at(-1);
  const closeTop = () => {
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    if (dialog) { dialog.dispatchEvent(new Event('cancel', { cancelable: true })); return true; }
    const overlay = active();
    if (!overlay) return false;
    overlay.querySelector<HTMLButtonElement>('button[id^="btn-close"]')?.click();
    return true;
  };
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]')) return;
    if (event.key === 'Escape' && closeTop()) event.preventDefault();
    if (event.key === 'Tab') {
      const overlay = active();
      if (!overlay) return;
      const focusable = Array.from(overlay.querySelectorAll<HTMLElement>('button, input, textarea, select, [tabindex="0"]'))
        .filter(element => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
      const first = focusable[0], last = focusable.at(-1);
      if (!first) return;
      if (!overlay.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
  });
  if (Capacitor.isNativePlatform()) {
    void App.addListener('backButton', () => {
      if (closeTop()) return;
      const player = document.getElementById('view-player');
      if (player?.classList.contains('hidden')) document.getElementById('nav-btn-player')?.click();
      else void App.minimizeApp();
    });
  }
}
