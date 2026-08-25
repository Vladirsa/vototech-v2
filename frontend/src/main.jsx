import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'

// 🆕 Sentry del lado del navegador — captura errores que pasan en la
// pantalla de la persona (que nunca llegan a tus logs de Render,
// porque son errores de React/JS, no del servidor). Si no hay
// VITE_SENTRY_DSN configurado, simplemente no hace nada.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  });
}

/**
 * 🆕 LA CORRECCIÓN REAL DEL "SIGO VIENDO LA VERSIÓN VIEJA" — antes no
 * había NINGÚN registro personalizado del Service Worker; sin esto,
 * el navegador solo revisa si hay una versión nueva cuando le da la
 * gana (básicamente nunca, en una PWA instalada que la gente no
 * cierra por completo). Con esto:
 *
 * 1. Se revisa una versión nueva cada 60 segundos mientras la app
 *    está abierta, Y cada vez que vuelves a ella desde segundo plano
 *    (que es exactamente cuándo la gente reabre el ícono instalado).
 * 2. En cuanto se detecta una versión nueva, se activa sola
 *    (skipWaiting + clients.claim ya viven en sw.js) y se recarga la
 *    página automáticamente — ya no hace falta borrar caché a mano.
 */
const actualizarSW = registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;

    // Revisión activa cada 60 segundos
    setInterval(() => {
      registration.update().catch(() => {});
    }, 60 * 1000);

    // Y también justo al volver a la app (celular bloqueado → desbloqueado,
    // o cambiar de app y regresar) — el momento más común en que la
    // gente "reabre" el ícono sin que eso cuente como recarga completa.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        registration.update().catch(() => {});
      }
    });
  },
  onNeedRefresh() {
    // Ya hay una versión nueva lista — se recarga sola, sin pedirle
    // nada a la persona (evita que alguien se quede atorado sin saber
    // que existe un botón de actualizar).
    actualizarSW(true);
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
