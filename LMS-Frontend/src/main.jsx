// main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom' 
import App from './App.jsx'
import './assets/global.css'

// --- ДОБАВЛЯЕМ НАСТРОЙКУ DAYJS СЮДА ---
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import 'dayjs/locale/ru';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ru');
// --------------------------------------

import { registerSW } from 'virtual:pwa-register'

// Оверлей OBS (/games/:gameId/graphics) — киоск-дисплей, который держат открытым сутками
// (browser source в OBS почти никогда не перезагружают руками). PWA тут вредна дважды:
// 1) registerType:'prompt' без onNeedRefresh никогда не активирует новый билд на уже открытой
//    вкладке — после деплоя оверлей годами крутит старый JS, пока кто-то не перезагрузит вручную;
// 2) NetworkFirst-кэш /api/* с фолбэком на сутки старых данных при малейшей заминке сети тихо
//    подменяет актуальный счёт/составы вчерашним кэшем.
// Поэтому для этого маршрута сервис-воркер просто не регистрируем — каждая загрузка идёт
// напрямую в сеть, как у обычного (не PWA) сайта.
const isObsOverlayRoute = /^\/games\/[^/]+\/graphics\/?$/.test(window.location.pathname);
if (!isObsOverlayRoute) {
  registerSW({ immediate: true })
} else if ('serviceWorker' in navigator) {
  // На случай, если в этом же браузерном профиле раньше уже открывали панель (и SW успел
  // зарегистрироваться на весь origin) — снимаем его и чистим кэш, чтобы оверлей гарантированно
  // ходил напрямую в сеть, а не через уже активный воркер с чужой вкладки.
  navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.unregister()));
  if (window.caches) caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)