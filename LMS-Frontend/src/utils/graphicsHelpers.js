// HockeyEco-React/src/utils/graphicsHelpers.js
import { getImageUrl } from './helpers'; // Импортируем существующую функцию

export const getSafeUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return getImageUrl(url); // Эта функция превратит "/images/logos/team.png" в "http://твоя-апи/images/logos/team.png"
};