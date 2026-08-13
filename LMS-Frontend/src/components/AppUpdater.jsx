import React, { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { UpdatePromptModal } from '../modals/UpdatePromptModal';

/**
 * Жизненный цикл сервис-воркера и окно «есть обновление».
 *
 * Зачем вообще: сборка собрана с registerType: 'prompt' (vite.config.js). При
 * деплое новый воркер скачивается, но остаётся в waiting и не подхватывает
 * управление, пока кто-нибудь не вызовет skipWaiting. Раньше его никто не
 * вызывал — отсюда и старый интерфейс до ручного Ctrl+F5. updateServiceWorker(true)
 * активирует ждущего воркера и перезагружает страницу.
 *
 * Разлогина при этом не происходит: чистятся кэши сборки, а токен и профиль
 * лежат в localStorage/sessionStorage, которые перезагрузку переживают.
 */

// Оверлей OBS — киоск-дисплей, ему сервис-воркер не нужен вовсе (подробности в main.jsx).
// Проверка живёт здесь же, рядом с регистрацией, чтобы правило было одно на всё приложение.
export const isObsOverlayPath = (pathname) => /^\/games\/[^/]+\/graphics\/?$/.test(pathname || '');

export function AppUpdater() {
  const registrationRef = useRef(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    immediate: true,
    onRegistered(r) {
      registrationRef.current = r || null;
    },
  });

  /**
   * Обновление по кнопке — то же самое, что Ctrl+F5: снимаем сервис-воркера,
   * выкидываем все его кэши и перезагружаемся. Свежая сборка зарегистрирует
   * воркера заново уже сама.
   *
   * Через updateServiceWorker(true) перезагрузки можно было не дождаться вовсе:
   * он лишь отправляет SKIP_WAITING ждущему воркеру, а reload происходит только
   * по событию controlling. Если к моменту нажатия registration.waiting уже пуст
   * (окно провисело открытым, воркера подобрала другая вкладка), сообщение уходит
   * в никуда, события нет — и кнопка крутится бесконечно. Здесь ждать нечего:
   * воркера больше нет, загрузка идёт прямо в сеть.
   */
  const applyUpdate = async () => {
    setNeedRefresh(false);

    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(r => r.unregister()));
      }
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch (err) {
      // Чистка не удалась — перезагрузиться всё равно надо, хуже от этого не станет
      console.error('Не удалось очистить кэш перед обновлением:', err);
    }

    window.location.reload();
  };

  // Сам браузер проверяет воркер только при загрузке и навигации. В LMS вкладку
  // держат открытой сутками, поэтому спрашиваем сервер сами: раз в 5 минут и
  // каждый раз, когда пользователь возвращается на вкладку после деплоя.
  useEffect(() => {
    const check = () => { registrationRef.current?.update().catch(() => {}); };

    const intervalId = setInterval(check, 5 * 60 * 1000);
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return <UpdatePromptModal isOpen={needRefresh} onUpdate={applyUpdate} />;
}
