import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      // Стратегия обновления: автоматическое применение новых файлов после скачивания
      registerType: 'autoUpdate',
      
      // Включаем поддержку PWA в режиме разработки (npm run dev)
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },

      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      
      manifest: {
        name: 'HockeyEco LMS',
        short_name: 'HockeyEco',
        description: 'Система управления лигой HockeyEco',
        theme_color: '#ffffff',
        background_color: '#e0e0e0',
        display: 'fullscreen', // Это убирает навигацию браузера
        orientation: 'any',    // Разрешаем поворот экрана
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },

      workbox: {
        // Очищаем старые кэши при обновлении
        cleanupOutdatedCaches: true,
        
        runtimeCaching: [
          {
            // API запросы (данные): Network First
            // Сначала идем в сеть, если сети нет — берем из кэша
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 24 * 60 * 60 // Храним данные 1 день
              },
              networkTimeoutSeconds: 5 // Ждем ответа от сервера 5 секунд
            }
          },
          {
            // Статические ресурсы (картинки, логотипы, аватарки): Stale-While-Revalidate
            // Показываем старое из кэша мгновенно, в фоне обновляем на новое
            urlPattern: /^https?:\/\/.*\.(?:png|jpg|jpeg|svg|webp)/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 30 * 24 * 60 * 60 // Храним картинки 30 дней
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    // Позволяет заходить на сайт по IP в локальной сети
    host: true, 
    port: 5173,
  },
})