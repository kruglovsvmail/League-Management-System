// HockeyEco-React/src/utils/helpers.js

export const getImageUrl = (path) => {
  if (!path) return '';
  
  // Если в БД уже лежит полная ссылка (начинается с http или https), возвращаем как есть
  if (path.startsWith('http')) {
    return path;
  }
  
  // Убираем случайный начальный слеш, если он попал в БД (например, /uploads/...)
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // Подставляем базовый URL вашего бакета Timeweb
  return `https://s3.twcstorage.ru/hockeyeco-uploads/${cleanPath}`;
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