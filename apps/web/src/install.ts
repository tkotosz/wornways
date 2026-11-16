// Making the app installable and able to start without a network.
//
// Chrome and Edge offer to install the app with an event; the app keeps that offer for its
// Install button, which can use it once. Safari and Firefox install from their own menus
// and send no such event, so the button stays hidden there.

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
