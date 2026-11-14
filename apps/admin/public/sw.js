const CACHE = 'stella-admin-shell-v1';
const SHELL = [
  '/offline.html',
  '/offline.js',
  '/offline-messages.json',
  '/icon.svg',
  '/icon-180.png',
  '/icon-192.png',
  '/icon-512.png',
  '/manifest.webmanifest',
];
self.addEventListener('install', (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener('activate', (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith('stella-admin-shell-') && key !== CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET')
    return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/offline.html')),
    );
    return;
  }
  if (
    !SHELL.includes(url.pathname) &&
    !url.pathname.startsWith('/_next/static/')
  )
    return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const response = await fetch(event.request);
      if (response.ok && !response.redirected)
        await cache.put(event.request, response.clone());
      return response;
    }),
  );
});
self.addEventListener('push', (event) =>
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data.json();
      } catch {}
      const messages = await (
        await caches.match('/offline-messages.json')
      ).json();
      const locale = Object.hasOwn(messages, data.locale) ? data.locale : 'en';
      await self.registration.showNotification('Stella Sharm Tours', {
        body: messages[locale].requests,
        tag: 'stella-new-requests',
        icon: '/icon.svg',
        badge: '/icon.svg',
        data: { path: '/requests' },
      });
    })(),
  ),
);
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.navigate('/requests');
          await client.focus();
          return;
        }
      }
      await self.clients.openWindow('/requests');
    })(),
  );
});
