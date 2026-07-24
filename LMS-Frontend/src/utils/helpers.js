// LMS-Frontend/src/utils/helpers.js

// Константа для инвалидации кэша статических системных картинок (заглушек).
// Просто меняй это значение (например, на сегодняшнюю дату), когда заливаешь новые дефолтные файлы в Timeweb S3.
const STATIC_ASSETS_VERSION = '20260331';

export const getImageUrl = (path, forceCacheBust = false) => {
  if (!path) return '';
  
  let url = '';

  // Если в БД уже лежит полная ссылка (начинается с http или https), берем её
  if (path.startsWith('http')) {
    url = path;
  } else {
    // Убираем случайный начальный слеш, если он попал в БД (например, /uploads/...)
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    // Подставляем базовый URL вашего бакета Timeweb
    url = `https://s3.twcstorage.ru/hockeyeco-uploads/${cleanPath}`;
  }

  // --- ЛОГИКА СБРОСА КЭША (CACHE BUSTING) ---

  // Укажи здесь точное имя файла твоей заглушки из бакета
  const isDefaultAvatar = url.includes('user_default.webp'); // <-- ВАЖНО: ЗАМЕНИ НА РЕАЛЬНОЕ ИМЯ ТВОЕГО ФАЙЛА

  if (forceCacheBust || isDefaultAvatar) {
    // Проверяем, есть ли уже параметры в URL (вдруг S3 отдает ссылки с токенами), чтобы не сломать строку
    const separator = url.includes('?') ? '&' : '?';
    
    // Если нужен жесткий сброс (например, юзер только что обновил свое фото) — берем Date.now().
    // Для системной заглушки используем общую константу, чтобы CDN работал исправно.
    const busterValue = forceCacheBust ? Date.now() : STATIC_ASSETS_VERSION;
    
    url += `${separator}v=${busterValue}`;
  }

  return url;
};

export const formatAge = (age) => {
  if (!age) return '-';
  const val = Math.round(Number(age));
  const last = val % 10;
  const last2 = val % 100;
  
  if (last2 >= 11 && last2 <= 14) return `${val} лет`;
  if (last === 1) return `${val} год`;
  if (last >= 2 && last <= 4) return `${val} года`;
  return `${val} лет`;
};

// Сохраняем значение вместе с текущим временем
export const setExpiringStorage = (key, value) => {
  sessionStorage.setItem(key, JSON.stringify({ value, timestamp: Date.now() }));
};

// Читаем значение. Если прошло больше 5 минут (по умолчанию) — удаляем и возвращаем null
export const getExpiringStorage = (key, maxAgeMinutes = 5) => {
  const itemStr = sessionStorage.getItem(key);
  if (!itemStr) return null;
  try {
    const item = JSON.parse(itemStr);
    if (Date.now() - item.timestamp > maxAgeMinutes * 60 * 1000) {
      sessionStorage.removeItem(key);
      return null;
    }
    return item.value;
  } catch (e) {
    return null;
  }
};

export const getToken = () => {
  return localStorage.getItem('hockeyeco_token') || sessionStorage.getItem('hockeyeco_token');
};

export const getAuthHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  };
};

/**
 * Раунд плей-офф (games.stage_label, например "Финал") может физически содержать
 * несколько разных пар (playoff_matchups) — за 1-е место и за 3-е место и т.д.
 * games.playoff_match_type хранит это (NULL — обычная/главная пара, используем
 * stage_label как есть; "place_3"/"place_5"/... — переопределяем текст на "Матч за
 * N-е место"), заполняется в GameCard.jsx при назначении игры на раунд.
 */
export const getPlayoffStageDisplayLabel = (stageLabel, playoffMatchType) => {
  if (!playoffMatchType) return stageLabel;
  const n = playoffMatchType.replace('place_', '');
  return `Матч за ${n}-е место`;
};

/**
 * Определяет площадку трансляции по домену ссылки (пользователь может вставить
 * любую ссылку в любое из полей video_yt_url/video_vk_url — поле само по себе
 * не гарантирует платформу), чтобы показать реальное название вместо родового
 * «Ссылка на трансляцию N».
 */
export const getStreamPlatformLabel = (url) => {
  if (!url) return null;
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'Трансляция';
  }
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
  if (host.includes('vk.com') || host.includes('vkvideo.ru') || host.includes('vk.ru')) return 'VK Видео';
  if (host.includes('rutube.ru')) return 'RuTube';
  return 'Трансляция';
};

// =============================================================================
// СЕТЕВОЙ ГЛОБАЛЬНЫЙ ИНТЕРЦЕПТОР ПРОТУХШЕЙ СЕССИИ (401/403)
// =============================================================================

// Полная очистка сессии на устройстве (токен + кэш профиля + выбранная лига)
export const removeToken = () => {
  localStorage.removeItem('hockeyeco_token');
  sessionStorage.removeItem('hockeyeco_token');
  localStorage.removeItem('hockeyeco_user');
  sessionStorage.removeItem('hockeyeco_user');
  localStorage.removeItem('hockeyeco_selected_league');
};

let isRevalidating = false;
let revalidatePromise = null;

// Эндпоинты аутентификации: их 401/403 — это ошибки самого процесса входа
// (неверный пароль и т.п.), а не протухшая сессия — их не перехватываем.
const isAuthUrl = (urlStr) =>
  urlStr.includes('/api/login') ||
  urlStr.includes('/api/lookup-') ||
  urlStr.includes('/api/reset-password') ||
  urlStr.includes('/api/me');

// Публичный оверлей веб-графики (/games/:id/graphics) работает без сессии
// и крутится в OBS на трансляции — его нельзя уводить на страницу логина.
const isPublicOverlay = () =>
  typeof window !== 'undefined' && window.location?.pathname?.endsWith('/graphics');

const forceLogout = () => {
  removeToken();
  // replace, а не pushState — чтобы кнопка "назад" не возвращала на мёртвую сессию
  if (typeof window !== 'undefined' && window.location?.pathname !== '/login' && !isPublicOverlay()) {
    window.location.replace('/login');
  }
};

if (typeof window !== 'undefined' && !window.__fetchInterceptorInitialized) {
  window.__fetchInterceptorInitialized = true;
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch(...args);

    const url = args[0];
    const urlStr = typeof url === 'string' ? url : (url?.url || '');

    // 401 — бэкенд не увидел заголовок Authorization вовсе: сессии фактически нет
    if (response.status === 401 && !isAuthUrl(urlStr) && getToken()) {
      forceLogout();
    }

    // 403 — либо протух токен, либо просто нет прав на конкретное действие.
    // Различаем одной контрольной проверкой /api/me: если сессия жива —
    // это обычный отказ в правах, ничего не делаем.
    if (response.status === 403 && !isAuthUrl(urlStr) && getToken()) {
      if (!isRevalidating) {
        isRevalidating = true;
        revalidatePromise = originalFetch(`${import.meta.env.VITE_API_URL}/api/me`, {
          headers: getAuthHeaders()
        })
          .then(res => {
            if (res.status === 401 || res.status === 403) {
              forceLogout();
            }
          })
          .catch(() => {}) // сетевой сбой — не повод разлогинивать
          .finally(() => {
            isRevalidating = false;
            revalidatePromise = null;
          });
      }
      // Лавина параллельных 403 ждёт выполнения одной этой микро-проверки
      await revalidatePromise;
    }

    return response;
  };
}