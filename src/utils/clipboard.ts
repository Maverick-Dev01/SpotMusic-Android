/**
 * Universal clipboard utility with full support for iOS Safari, WebViews,
 * and insecure HTTP origins where navigator.clipboard is unavailable.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern navigator.clipboard if available (HTTPS or localhost)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, attempting execCommand fallback:', err);
    }
  }

  // 2. Universal fallback using hidden textarea and document.execCommand('copy')
  // This works universally across iOS Safari, Android WebViews, and HTTP origins
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    textarea.style.fontSize = '16px'; // Prevents iOS Safari zoom on focus
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);

    // iOS specific selection
    const range = document.createRange();
    range.selectNodeContents(textarea);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    textarea.focus();
    textarea.setSelectionRange(0, text.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return successful;
  } catch (e) {
    console.error('execCommand copy fallback failed:', e);
    return false;
  }
}
