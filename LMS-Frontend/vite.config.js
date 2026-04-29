import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
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
        // Отключаем дебаг-логи Workbox в консоли
        mode: 'production', 
        
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
  
  // --- ДОБАВЛЕНО: Настройка сборки и разделения кода (Code Splitting) ---
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Если модуль находится в папке node_modules, выносим его в отдельный чанк
          if (id.includes('node_modules')) {
            // Выделяем ядро React в отдельный файл
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            // Выделяем тяжелый генератор PDF
            if (id.includes('@react-pdf')) {
              return 'vendor-pdf';
            }
            // Выделяем библиотеку Drag-and-Drop (используется для конструктора плей-офф)
            if (id.includes('@dnd-kit')) {
              return 'vendor-dnd';
            }
            // Все остальные сторонние библиотеки пойдут в общий vendor
            return 'vendor-utils';
          }
        }
      }
    },
    // Немного увеличиваем лимит предупреждения, так как vendor-react может весить ~600kb, и это нормально
    chunkSizeWarningLimit: 800,
  }
})