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
      // injectManifest en vez de generateSW: necesitamos un Service
      // Worker propio (src/sw.js) para poder manejar notificaciones
      // push reales — generateSW no permite agregar ese código.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: { maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 },
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
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
})
