import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served under /AttendWise/ on GitHub Pages, but at the domain root in dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/AttendWise/' : '/',
  plugins: [
    react(),
    tailwindcss(),
    // The native app loads this site from GitHub Pages over the network on every
    // launch. Precaching the shell (JS/CSS/fonts) with a service worker makes
    // repeat launches instant and offline-capable, while `autoUpdate` keeps the
    // "push a web build and it goes live" workflow -- the new bundle is fetched
    // in the background and swapped in on the next launch. Supabase requests are
    // cross-origin and never precached, so data stays live.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        // SPA: unknown routes resolve to the app shell instead of a 404.
        navigateFallback: '/AttendWise/index.html',
      },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'AttendWise',
        short_name: 'AttendWise',
        start_url: '/AttendWise/',
        scope: '/AttendWise/',
        display: 'standalone',
        background_color: '#f6f7f9',
        theme_color: '#4f46e5',
      },
    }),
  ],
}))
