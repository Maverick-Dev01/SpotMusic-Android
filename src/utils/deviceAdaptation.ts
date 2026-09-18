/**
 * Device & Safe Area Adaptation Utility
 * Handles notch detection (iPhone 13 Pro Max, Dynamic Island, Android cutouts)
 * while maintaining bezel-less edge-to-edge layout for devices without notches (ZTE Nubia Z60 Ultra).
 * Also manages responsive tablet / iPad breakpoints.
 */

export function setupSafeAreaAndDeviceAdaptation() {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);

  if (isIOS) {
    document.body.classList.add('is-ios');
    document.body.classList.remove('is-android');
  } else if (isAndroid) {
    document.body.classList.add('is-android');
    document.body.classList.remove('is-ios');
  }

  // Measure real CSS env() safe areas via probe element
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;height:env(safe-area-inset-top, 0px);padding-bottom:env(safe-area-inset-bottom, 0px);pointer-events:none;visibility:hidden;z-index:-9999;';
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe);
  const envTop = parseFloat(computed.height) || 0;
  const envBottom = parseFloat(computed.paddingBottom) || 0;
  probe.remove();

  // Screen metrics
  const screenW = Math.min(window.screen.width, window.screen.height);
  const screenH = Math.max(window.screen.width, window.screen.height);
  const aspectRatio = screenH / (screenW || 1);

  let sat = envTop;
  let sab = envBottom;

  // Detect notched iPhone (iPhone X through 16 Pro Max, ratio >= 2.0 and height >= 812)
  const isNotchedIPhone = isIOS && (aspectRatio >= 2.0 && screenH >= 812);

  if (isNotchedIPhone) {
    document.body.classList.add('has-notch');
    // iPhone 14 Pro/15/16 Dynamic Island is ~54px; iPhone 13 Pro Max notch is ~47px
    const minNotchTop = (screenH >= 932 || screenH === 852) ? 54 : 48;
    sat = Math.max(envTop, minNotchTop);
    sab = Math.max(envBottom, 34);
  } else if (isIOS) {
    // iPad or older iPhone (SE/8)
    document.body.classList.remove('has-notch');
    sat = Math.max(envTop, 20);
    sab = Math.max(envBottom, 16);
  } else {
    // Android:
    // For notchless devices (like ZTE Nubia Z60 Ultra with under-display camera), envTop is 0 or minimal (~14px)
    if (envTop >= 34) {
      document.body.classList.add('has-notch');
      sat = envTop;
    } else {
      document.body.classList.remove('has-notch');
      sat = envTop > 0 ? envTop : 14;
    }
    sab = Math.max(envBottom, 8);
  }

  // Set CSS Custom Properties for live styling
  document.documentElement.style.setProperty('--sat', `${sat}px`);
  document.documentElement.style.setProperty('--sab', `${sab}px`);

  // Detect Tablet / iPad width
  const isTablet = window.innerWidth >= 768;
  if (isTablet) {
    document.body.classList.add('is-tablet');
  } else {
    document.body.classList.remove('is-tablet');
  }
}
