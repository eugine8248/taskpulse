import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiHttp = env.VITE_API_PROXY || 'http://localhost:3000';
  const apiWs = apiHttp.replace(/^http/, 'ws');
  return {
    plugins: [
      react(),
      // PWA: precache HTML/CSS/JS, runtime-cache /api/reports/today for
      // 60s stale tolerance (network-first). Auth + mutation endpoints are
      // intentionally NOT cached — must always hit the server.
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
        manifest: {
          name: 'taskpulse',
          short_name: 'taskpulse',
          description: 'Kanban + reports + CLI — terminal-friendly task management',
          theme_color: '#1e1e1e',
          background_color: '#1e1e1e',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,ico,png,woff2}'],
          // Don't intercept API mutations or auth.
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /\/api\/reports\/today/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'reports-today',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 4, maxAgeSeconds: 60 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': { target: apiHttp, changeOrigin: true },
        '/ws': { target: apiWs, ws: true, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
