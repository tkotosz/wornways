// Making the app installable and able to start without a network.
//
// Chrome and Edge offer to install the app with an event; the app keeps that offer for its
// Install button, which can use it once. Safari on iPhone and iPad sends no such event and
// installs only from its Share menu, so there the button explains how instead. Other
// browsers, such as Firefox, install from their own menus, and the button stays hidden.

import { shallowRef } from 'vue';

/** The browser's offer to install the app (the beforeinstallprompt event). */
interface InstallOffer extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const installOffer = shallowRef<InstallOffer | null>(null);

export function listenForInstallOffer(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Without this, a phone shows its own install bar over the app.
    event.preventDefault();
    installOffer.value = event as InstallOffer;
  });
  window.addEventListener('appinstalled', () => (installOffer.value = null));
}

/**
 * Whether the Install button should explain Safari's Add to Home Screen: on an iPhone, iPod
 * or iPad, and not already running as the installed app. iPadOS reports itself as a Mac, so
 * a Mac with a touch screen counts as an iPad.
 */
export function showsAppleInstallHelp(): boolean {
  const agent = navigator.userAgent;
  const appleMobile =
    /iPhone|iPad|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
  const installed =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return appleMobile && !installed;
}

export async function install(): Promise<void> {
  const offer = installOffer.value;
  installOffer.value = null;
  await offer?.prompt();
}

/** Only in a build: during development the files change all the time. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
    // Without it the app still works, just not offline (e.g. over HTTPS with an untrusted
    // certificate, as when serving to a phone on the local network).
    console.warn('The app cannot work offline:', error);
  });
}
