import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA: la app se puede "instalar" desde Chrome en el celular,
    // con ícono propio, pantalla completa sin barra del navegador.
    VitePWA({
      registerType: 'autoUpdate',   // se actualiza sola cuando subimos versión nueva
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'VotoTech - Gestión Electoral',
        short_name: 'VotoTech',
        description: 'Sistema de gestión de campañas electorales',
        theme_color: '#1e1b4b',
        background_color: '#0f0f1a',
        display: 'standalone',       // pantalla completa, sin barra de Chrome
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // LECCIÓN APRENDIDA DE LA V1: NetworkFirst, nunca CacheFirst.
        // En la v1 (WordPress) el service worker con Cache First servía
        // versiones viejas eternamente y nos costó días de confusión.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/geo/'),
            // Los datos geográficos casi no cambian: cache con expiración
            handler: 'CacheFirst',
            options: {
              cacheName: 'geo-cache',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }, // 1 día
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',   // datos vivos: siempre intenta red primero
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 }, // 1 hora de respaldo offline
            },
          },
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
})
