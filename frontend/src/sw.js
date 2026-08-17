import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache de los archivos de la app — esto es lo que antes generaba
// automáticamente el modo generateSW; ahora lo hacemos manual porque
// necesitamos agregar el manejo de 'push' más abajo, que generateSW
// no permite personalizar.
precacheAndRoute(self.__WB_MANIFEST);

// Mismo criterio que antes: datos geográficos casi no cambian, se
// pueden cachear agresivo; todo lo demás de la API siempre intenta
// red primero (LECCIÓN DE LA V1: CacheFirst en todo servía datos
// viejos eternamente y costó días de confusión).
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/geo/'),
  new CacheFirst({ cacheName: 'geo-cache', plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 })] })
);
// 🆕 LA CAUSA REAL DE "AGREGO ALGO Y NO SE VE" — antes esperaba solo
// 5 segundos antes de rendirse y servir la caché vieja SIN avisar.
// En una conexión de celular un poco lenta, eso pasaba seguido — la
// persona agregaba un promovido, y el mapa mostraba la lista de
// ANTES, calladamente. Se amplía a 15 segundos: sigue siendo rápido
// en conexión normal, pero ya no abandona tan fácil hacia datos viejos.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({ cacheName: 'api-cache', networkTimeoutSeconds: 15, plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 })] })
);

self.skipWaiting();
self.addEventListener('activate', () => self.clients.claim());

// ── PUSH: llega aunque el celular esté bloqueado o la app cerrada ──
self.addEventListener('push', (evento) => {
  if (!evento.data) return;
  const datos = evento.data.json();
  evento.waitUntil(
    self.registration.showNotification(datos.titulo || 'VotoTech', {
      body: datos.cuerpo || '',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: datos.url || '/dashboard' },
      vibrate: [200, 100, 200],
    })
  );
});

// Al tocar la notificación, abre la app en la pantalla correspondiente
// (o la enfoca si ya está abierta, en vez de abrir una pestaña nueva).
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const url = evento.notification.data?.url || '/dashboard';
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listaClientes) => {
      for (const cliente of listaClientes) {
        if (cliente.url.includes(self.location.origin) && 'focus' in cliente) {
          cliente.navigate(url);
          return cliente.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
