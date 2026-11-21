import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: { host: true }, // lets you open the dev server from your phone on the same wifi
  plugins: [
    VitePWA({
      // 'prompt': the app decides when to switch to a new version (never mid-entry), see src/main.js
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: '/',
        name: 'SCS External Princess Mood Checker',
        short_name: "Tina's Moods",
        description: 'A very girly mood tracker for the SCS External Princess. Works offline.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fff1f8',
        theme_color: '#ff5fa8',
        categories: ['lifestyle', 'health', 'productivity'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Check in now', short_name: 'Check in', url: '/#checkin', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Dashboard', short_name: 'Dashboard', url: '/#dash', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Royal Diary', short_name: 'Diary', url: '/#diary', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // the whole app (html, js, css, fonts, icons) is cached on first visit so it opens with no signal
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
});
