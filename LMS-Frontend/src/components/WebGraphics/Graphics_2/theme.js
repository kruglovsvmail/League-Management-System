// src/components/WebGraphics/Graphics_2/theme.js
//
// Оверлей лиги 2 — визуальный код «SHARDS» (лоу-поли спортивный постер).
//
// Приёмы взяты с референса:
//   • россыпи ТРЕУГОЛЬНЫХ ОСКОЛКОВ, вылетающие из углов кадра — жёлтые, серые,
//     белые и чёрные, часть полупрозрачные, часть залиты полутоновым растром;
//   • заголовок, набранный РАЗНЫМИ ЦВЕТАМИ ПО СЛОВАМ (белое / жёлтое / графит);
//   • три поверхности одной системы: графит, светло-серая и жёлтая;
//   • много воздуха, плоские заливки, ни одного градиента в контенте.
//
// Разделение носителей:
//   поверх ЖИВОЙ картинки → графитовая плашка (белый текст, жёлтый акцент);
//   полноэкранные плашки  → графитовое поле, плотные данные на светлой панели.
// Мелкий текст по графиту читается, по жёлтому — нет, поэтому жёлтый работает
// только крупными пятнами: акцентные слова, блок времени, метки.

export const S = {
  coal: '#2B2B2B',       // основная поверхность
  coalDeep: '#1C1C1C',
  coalSoft: '#3A3A3A',   // вторичные блоки
  line: '#4C4C4C',       // разделители на тёмном
  ash: '#8E8E8E',        // приглушённый текст на тёмном
  paper: '#F2F2F2',      // светлая панель
  paper2: '#E2E2E2',
  paperLine: '#C9C9C9',
  paperMute: '#7A7A7A',  // приглушённый текст на светлом
  yellow: '#FFC800',     // акцент
  yellowDeep: '#E0A800',
  white: '#FFFFFF',
  red: '#E4483D',        // штраф, истекающее время
};

// Палитры осколков. Ключи используются генератором как веса частот.
export const SHARD_PALETTE = {
  onCoal: ['#FFC800', '#FFC800', '#E0A800', '#FFFFFF', '#8E8E8E', '#5A5A5A', '#3A3A3A', '#1C1C1C', 'halftone'],
  onPaper: ['#FFC800', '#FFC800', '#E0A800', '#2B2B2B', '#8E8E8E', '#C9C9C9', '#FFFFFF', 'halftone'],
  onYellow: ['#2B2B2B', '#1C1C1C', '#FFFFFF', '#8E8E8E', '#E0A800', 'halftone'],
};

// Детерминированный псевдослучай: одна и та же россыпь обязана выглядеть
// одинаково в каждом кадре, иначе осколки «кипят» при любом ре-рендере.
export function rnd(i, seed = 1) {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Генератор россыпи. Осколки летят из точки origin по направлению dir
// (в градусах), разлёт задаётся spread. Возвращает готовые к отрисовке данные.
export function makeShards(count, {
  seed = 1,
  origin = [0, 100],   // в процентах от бокса
  dir = -45,           // направление разлёта, градусы
  spread = 70,         // разброс по углу, градусы
  reach = 78,          // дальность разлёта, % от бокса
  size = 16,           // базовый размер осколка, % от бокса
  palette = SHARD_PALETTE.onCoal,
} = {}) {
  return Array.from({ length: count }).map((_, i) => {
    const a = ((dir + (rnd(i, seed) - 0.5) * spread) * Math.PI) / 180;
    const dist = Math.pow(rnd(i + 40, seed), 0.7) * reach;
    const cx = origin[0] + Math.cos(a) * dist;
    const cy = origin[1] + Math.sin(a) * dist;

    // Осколок — треугольник со случайными вершинами вокруг своего центра
    const sc = size * (0.35 + rnd(i + 80, seed) * 1.25) * (1 - dist / (reach * 2.2));
    const base = rnd(i + 120, seed) * Math.PI * 2;
    const pts = [0, 1, 2].map(v => {
      const va = base + (v * 2 * Math.PI) / 3 + (rnd(i * 3 + v + 200, seed) - 0.5) * 1.5;
      const vr = sc * (0.5 + rnd(i * 3 + v + 260, seed));
      return [cx + Math.cos(va) * vr, cy + Math.sin(va) * vr * 1.15];
    });

    const fill = palette[Math.floor(rnd(i + 320, seed) * palette.length)];
    return {
      pts,
      fill,
      opacity: fill === 'halftone' ? 1 : 0.35 + rnd(i + 360, seed) * 0.65,
      float: 5 + rnd(i + 400, seed) * 9,          // длительность дрейфа, с
      delay: -rnd(i + 440, seed) * 8,
      drift: (rnd(i + 480, seed) - 0.5) * 2.4,    // амплитуда дрейфа, % бокса
      spin: (rnd(i + 520, seed) - 0.5) * 8,       // амплитуда покачивания, градусы
    };
  });
}

export const drop = (s = 'md') => ({
  xl: 'drop-shadow(0 26px 52px rgba(0,0,0,0.6))',
  lg: 'drop-shadow(0 16px 34px rgba(0,0,0,0.55))',
  md: 'drop-shadow(0 10px 20px rgba(0,0,0,0.5))',
  sm: 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))',
}[s]);

// --- Данные -----------------------------------------------------------------

// Расшифровка game_events.goal_strength (equal|pp1|pp2|sh1|sh2|en|ps).
export const GOAL_STRENGTH = {
  pp1: 'В БОЛЬШИНСТВЕ', pp2: 'В БОЛЬШИНСТВЕ 5 НА 3',
  sh1: 'В МЕНЬШИНСТВЕ', sh2: 'В МЕНЬШИНСТВЕ 3 НА 5',
  en: 'В ПУСТЫЕ ВОРОТА', ps: 'ШТРАФНОЙ БРОСОК',
};

// Публичный эндпоинт отдаёт бригаду ключами 'main-1' / 'linesman-1' /
// 'commentator-1' (см. getPublicGameById). Старые имена оставлены запасным
// вариантом: дефолтная графика ищет head_1/media, которых в ответе нет.
export const pickOfficial = (officials, ...keys) => {
  if (!officials) return null;
  for (const k of keys) if (officials[k]) return officials[k];
  return null;
};
