// The app's service worker: it keeps the app's files so an installed app starts without a
// network. It is plain JavaScript because the browser loads it as it is; the build writes it
// to sw.js with two constants in front of it:
//
// - FILES: the path of every file of the app.
// - VERSION: a hash of their contents, so it changes whenever one of them does.
//
// A new version stores all files in a cache of its own. It takes over once no window uses
// the old version any more and then deletes the older caches; until then an open window keeps
// the files it started with.
//
// Pages come from the network first, so a reload shows a new version as soon as it is
// published; the stored page is used only when the network fails. The other files come from
// the cache: their names hold a hash of their contents, or they belong to the version.
// Requests to other sites, such as map tiles, are left alone: the app keeps tiles itself.

/* global FILES, VERSION */

const PREFIX = 'wornways-app-';
const CACHE = PREFIX + VERSION;
const PAGE = FILES.find((path) => path.endsWith('/index.html'));
// Servers may answer "Vary: Origin", and scripts are asked for with an Origin header that
// the stored copies were not, so the lookup ignores Vary: a file is the same either way.
const LOOKUP = { cacheName: CACHE, ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      const older = names.filter((name) => name.startsWith(PREFIX) && name !== CACHE);
      return Promise.all(older.map((name) => caches.delete(name)));
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const page = await caches.match(PAGE, LOOKUP);
        return page ?? Response.error();
      }),
    );
    return;
  }

  event.respondWith(caches.match(request, LOOKUP).then((stored) => stored ?? fetch(request)));
});
