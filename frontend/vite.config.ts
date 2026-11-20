/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Dev: run Django on :8000 (`python manage.py runserver`); Vite proxies /api to it.
// Build: assets are emitted under /static/ so Django (WhiteNoise) can serve frontend/dist.
//
// Offline: the service worker precaches the whole app (shell, fonts, logo) so a judge's phone
// opens it even when the tabulator is unreachable. Django serves the worker itself from /sw.js
// (root scope). Score data never goes through the worker's cache: /api is always network-only
// and the app keeps its own queue in localStorage.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/static/' : '/',
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      injectRegister: false, // registered in main.ts with scope "/"
      registerType: 'prompt',
      filename: 'sw.js',
      scope: '/',
      includeAssets: ['icpep-logo.png', 'favicon.svg'],
      manifest: {
        name: 'ICPEP Tabulator',
        short_name: 'Tabulator',
        description: 'Score entries on the event Wi-Fi, even when the connection drops.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0F172A',
        theme_color: '#1F4FD8',
        icons: [
          { src: '/static/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/static/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/static/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,webmanifest}'],
        globIgnores: ['setup.html'],
        // Files sit under /static/ while the worker lives at /sw.js.
        modifyURLPrefix: { '': '/static/' },
        navigateFallback: '/static/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/admin\//, /^\/setup/, /^\/ca\.crt/],
        inlineWorkboxRuntime: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      }
    }),
    // The PWA plugin also lists the logo, favicon and manifest on its own, without the /static/ prefix
    // (modifyURLPrefix does not reach them). globPatterns above already precaches them from dist with
    // the right URL, and duplicate entries make the service worker install fail, so drop the extras.
    {
      name: 'pwa-no-extra-entries',
      apply: 'build',
      buildStart() {
        const pwa = this.environment.config.plugins.find(p => p.name === 'vite-plugin-pwa')
        const api = pwa?.api as { extendManifestEntries?: (fn: (e: unknown[]) => unknown[]) => void } | undefined
        api?.extendManifestEntries?.(() => [])
      }
    }
  ],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8000' } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
}))
