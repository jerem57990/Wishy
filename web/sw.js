// Service worker de Wishy : fonctionnement hors-ligne et notifications de promo.
const CACHE = 'wishy-__BUILD__';
const SHELL = __SHELL__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Supabase, images… : réseau direct
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      const net = fetch(e.request).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => hit);
      return hit || net;
    })
  );
});

self.addEventListener('push', (e) => {
  let m = {};
  try { m = e.data.json(); } catch { m = { title: 'Wishy', body: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(m.title || 'Wishy', {
    body: m.body || '', icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', tag: m.tag, data: { url: m.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data?.url || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { c.navigate(target).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
