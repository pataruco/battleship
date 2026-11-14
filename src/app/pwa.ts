/**
 * iOS Safari, not the Home Screen app (spec §13 iOS caveat, Review 8). iPadOS Safari reports a
 * Mac user agent, so a touch "Mac" counts as an iPad.
 */
export function isIosSafari(nav: Navigator = navigator): boolean {
  const ios = /iPhone|iPad|iPod/.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
  return ios && (nav as Navigator & { standalone?: boolean }).standalone !== true;
}

/** Registers the service worker; production builds only (dev would cache stale modules). */
export function registerSw(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const url = `${import.meta.env.BASE_URL}sw.js`;
  const scope = import.meta.env.BASE_URL;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url, { scope }).catch(() => {});
  });
}

/** Asks the browser not to evict our storage; never throws. */
export function requestPersist(): void {
  try {
    void navigator.storage?.persist?.().catch(() => {});
  } catch {
    // Unsupported or blocked: the app works either way.
  }
}

type InstallEvent = Event & { prompt(): Promise<unknown> };
let deferred: InstallEvent | null = null;
const target = new EventTarget();

/** Captures Chrome's install prompt so Home can offer an Install button. Call once at boot. */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    target.dispatchEvent(new Event('change'));
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    target.dispatchEvent(new Event('change'));
  });
}

export function canInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<void> {
  const d = deferred;
  deferred = null;
  target.dispatchEvent(new Event('change'));
  await d?.prompt();
}

export function onInstallChange(fn: () => void): () => void {
  target.addEventListener('change', fn);
  return () => target.removeEventListener('change', fn);
}
