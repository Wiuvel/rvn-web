// Service Worker для PWA
// Базовая версия без push-уведомлений

self.addEventListener('install', function (event) {
  console.log('[SW] Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  console.log('[SW] Service Worker activating...');
  event.waitUntil(self.clients.claim());
});
