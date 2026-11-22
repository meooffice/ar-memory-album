// Minimal service worker so Android Chrome offers "Install app".
// It does not cache anything: every request goes to the network, so updates are never stale.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
