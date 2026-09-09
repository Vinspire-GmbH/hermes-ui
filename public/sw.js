/*
 * Service worker: notifications first, offline second.
 *
 * There is deliberately no caching of API responses. A console that shows a
 * stale channel while claiming to be live is worse than one that says it is
 * offline — so only the shell is cached, and everything under /api goes to the
 * network or fails honestly.
 */
const SHELL = 'hermes-shell-v1'
const SHELL_FILES = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then(cache => cache.addAll(SHELL_FILES))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  // Network first: the app should always be the current build. The cache is
  // the fallback for a train tunnel, not the primary source.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.mode === 'navigate') {
          const copy = response.clone()
          caches.open(SHELL).then(cache => cache.put('/', copy)).catch(() => {})
        }
        return response
      })
      .catch(() => caches.match(request).then(hit => hit || caches.match('/'))),
  )
})

self.addEventListener('push', (event) => {
  let data = { title: 'Hermes', body: '', url: '/' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    if (event.data) data.body = event.data.text()
  }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    // A replaced notification should still get attention: a new answer in a
    // channel you are watching is not the same event as the last one.
    renotify: Boolean(data.tag),
    data: { url: data.url || '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/'
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Reuse a window that is already open rather than stacking up tabs.
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.focus()
        if ('navigate' in client) await client.navigate(target)
        return
      }
    }
    await self.clients.openWindow(target)
  })())
})
