import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: '/dashboard',
        name: 'ZC FNB',
        short_name: 'ZC FNB',
        description: '영수증과 근무표로 시작하는 우리 가게 운영 관리',
        lang: 'ko',
        theme_color: '#2563eb',
        background_color: '#f7f8fa',
        display: 'standalone',
        start_url: '/dashboard',
        scope: '/',
        shortcuts: [
          { name: '문서 올리기', short_name: '팀 채팅', url: '/rooms/room_demo_01', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: '주간 근무표', short_name: '근무표', url: '/schedules', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) =>
          /node_modules[\\/](recharts|victory-vendor|d3-[^\\/]+)/.test(id) ? 'charts' : undefined,
      },
    },
  },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
