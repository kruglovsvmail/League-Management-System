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
   * Обновление по кнопке.
   *
   * Сначала штатный путь: ждущему воркеру — SKIP_WAITING, ждём, пока он возьмёт
   * управление (controllerchange), и перезагружаемся уже под ним. Одного «снять
   * воркера и перезагрузиться» мало: пока страница перезагружается, старый воркер
   * ещё её обслуживает, и регистрация переживает перезагрузку вместе с ждущим
   * воркером — тот так и остаётся в waiting, и окно появляется снова, сколько ни
   * нажимай. Локально это видно после каждого перезапуска vite: у dev-воркера
   * при каждом запуске новая ревизия, то есть «новая версия».
   *
   * Запасной путь — то же, что Ctrl+F5: снимаем сервис-воркера, выкидываем все его
   * кэши и перезагружаемся. Нужен, когда ждать некого: registration.waiting уже
   * пуст (окно провисело открытым, воркера подобрала другая вкладка) или воркер
   * не ответил за 3 секунды. Ждать события здесь нельзя без тайм-аута — раньше
   * через updateServiceWorker(true) кнопка в таком случае крутилась бесконечно.
   */
  const applyUpdate = async () => {
    setNeedRefresh(false);

    try {
      const registration = registrationRef.current
        || (('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration() : null);
      const waiting = registration?.waiting;
      if (waiting && navigator.serviceWorker.controller) {
        const activated = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), 3000);
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            clearTimeout(timer);
            resolve(true);
          }, { once: true });
          waiting.postMessage({ type: 'SKIP_WAITING' });
        });
        if (activated) {
          window.location.reload();
          return;
        }
      }
    } catch (err) {
      console.error('Ждущий воркер не взял управление, обновляемся через сброс:', err);
    }

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
