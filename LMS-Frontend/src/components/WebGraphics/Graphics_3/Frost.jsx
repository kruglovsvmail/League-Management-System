import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { getImageUrl } from '../../../utils/helpers';
import { Icon } from '../../../ui/Icon';
import { T, R, SHADOW, GLASS_SHEEN, silver } from './theme';
import { Head, Label } from './Type';

// Поверхности оверлея лиги 3. Их всего три, и вся графика собирается из них:
//
//   Glass  — белое матовое стекло, основная поверхность (карточки сайта ТФХ);
//   Dark   — тёмно-синяя «шайба», единственное тёмное пятно системы: блок
//            времени, счёт, акцентные ячейки. Ровно так же работает тёмный
//            центр эмблемы федерации на светлом фоне;
//   Ring   — круг в серебряной кайме: портреты, эмблемы команд, иконки.
//            Кайма — прямая цитата ободка эмблемы.
//
// Стекло симулируется заливкой и бликом, а не backdrop-filter: в OBS размывать
// нечего, за страницей пусто (подробнее — в theme.js).

export function Glass({
  children,
  radius = R.card,
  over = 'video',          // 'video' — поверх живой картинки, 'scene' — внутри своей светлой сцены
  sheen = true,
  className = '',
  style = {},
  bodyClassName = '',
}) {
  const onVideo = over === 'video';
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        borderRadius: radius,
        backgroundColor: onVideo ? T.glass : T.glassSoft,
        border: `1px solid ${onVideo ? T.brd : T.brdSoft}`,
        boxShadow: onVideo ? SHADOW.float : SHADOW.card,
        ...style,
      }}
    >
      {/* Верхний блик — то, что делает заливку «стеклом», а не просто белым прямоугольником */}
      <div className="absolute inset-x-0 top-0 h-1/2 pointer-events-none" style={{ background: GLASS_SHEEN }} />
      {sheen && <div className="g3-sheen z-30" style={{ left: '-40%' }} />}
      <div className={`relative z-10 h-full ${bodyClassName}`}>{children}</div>
    </div>
  );
}

// Тёмно-синяя плашка. Блик сверху слабый и холодный — на тёмном белая полоса
// сайта выглядела бы подсветкой, а не стеклом.
export function Dark({ children, radius = R.plate, className = '', style = {}, sheen = false }) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ borderRadius: radius, backgroundColor: T.head, boxShadow: SHADOW.dark, ...style }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 100%)' }}
      />
      {sheen && <div className="g3-sheen z-30" style={{ left: '-40%', opacity: 0.35 }} />}
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

// Круг в серебряной кайме. inner — цвет поля внутри кольца; по умолчанию
// светло-серое, как поле эмблемы федерации.
export function Ring({
  size = 120,
  thickness = 5,
  inner = 'rgba(255,255,255,0.94)',
  angle = 135,
  children,
  className = '',
  style = {},
  innerClassName = '',
}) {
  return (
    <div
      className={`relative shrink-0 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        padding: thickness,
        background: silver(angle),
        boxShadow: `0 10px 22px rgba(25,65,110,0.26), inset 0 0 0 1px rgba(18,49,74,0.22)`,
        ...style,
      }}
    >
      <div
        className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center ${innerClassName}`}
        style={{ backgroundColor: inner, boxShadow: 'inset 0 0 0 1px rgba(18,49,74,0.18)' }}
      >
        {children}
      </div>
    </div>
  );
}

// Волосяная линейка. Серебряная — там, где обычный divider теряется на светлом.
//
// Три режима, потому что линейка живёт и в колонках, и в строках:
//   vertical — вертикальная, тянется на высоту строки;
//   grow     — горизонтальная, забирает остаток ширины во flex-строке;
//   по умолчанию — горизонтальная во всю ширину родителя.
export function Rule({ vertical = false, grow = false, tone = 'ink', className = '', style = {} }) {
  const bg = tone === 'silver' ? silver(vertical ? 180 : 90) : T.divider;
  const box = vertical
    ? { width: 1, alignSelf: 'stretch', flexShrink: 0 }
    : grow
      ? { height: 1, flex: '1 1 0%', minWidth: 0 }
      : { height: 1, width: '100%', flexShrink: 0 };

  return (
    <div
      className={className}
      style={{ ...box, background: bg, opacity: tone === 'silver' ? 0.85 : 1, ...style }}
    />
  );
}

// Круглый портрет: фото человека в серебряном кольце, снизу — цветная дуга
// команды. Используется в событиях, лидерах, судьях и комментаторах.
export function Portrait({ person, size = 128, ring = 6, accent = null, className = '', style = {} }) {
  const fallback = getImageUrl('default/user_default.webp');
  const photo = (person && getSafeUrl(person.avatar_url)) || fallback;

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size, ...style }}>
      {/* Цвет команды — тонкая кайма ПОД серебром: она подсказывает сторону, но
          главным кольцом остаётся серебро, иначе теряется связь с эмблемой */}
      {accent && (
        <div
          className="absolute rounded-full"
          style={{ inset: -4, backgroundColor: accent, boxShadow: `0 0 20px ${accent}55` }}
        />
      )}
      <Ring size={size} thickness={ring} inner="#dfe7ee">
        <img
          src={photo}
          alt=""
          className="w-full h-full object-cover object-top"
          onError={(e) => { e.target.onerror = null; e.target.src = fallback; }}
        />
      </Ring>
    </div>
  );
}

// Эмблема команды в круге. Логотипы клубов приходят с прозрачным фоном и разной
// плотностью — светлое поле под ними обязательно, иначе тёмные эмблемы сливаются
// с тёмной плашкой, а светлые — со стеклом.
export function Crest({ logo, size = 120, pad = 0.18, accent = null, className = '', style = {} }) {
  const url = getSafeUrl(logo);
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size, ...style }}>
      {/* Клубный цвет — подсвеченное кольцо под серебром, видно узкой каймой */}
      {accent && (
        <div
          className="absolute rounded-full"
          style={{ inset: -6, backgroundColor: accent, boxShadow: `0 0 30px ${accent}55` }}
        />
      )}
      <Ring size={size} thickness={4} inner="rgba(255,255,255,0.96)">
        {url ? (
          <img
            src={url}
            alt=""
            className="w-full h-full object-contain"
            style={{ padding: size * pad }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          accent && <div className="w-1/2 h-1/2 rounded-full" style={{ backgroundColor: accent }} />
        )}
      </Ring>
    </div>
  );
}

// Иконка нижней плашки. Берётся из общего набора ui/Icon.jsx — того же, что
// в интерфейсе LMS. Цвет и размер задаются обёрткой: сам Icon красится через
// currentColor и принимает только className.
export function PlateIcon({ name, size = 52 }) {
  return (
    <span style={{ color: T.accOnDark, width: size, height: size, display: 'block' }}>
      <Icon name={name} className="w-full h-full" />
    </span>
  );
}

// Нижняя информационная плашка (арена, комментаторы, судьи). Общая форма
// вынесена сюда: иконка в круге + заголовок-надстрока + содержимое.
export function InfoCard({ icon, label, right = null, children, className = '', style = {} }) {
  return (
    <Glass over="video" className={className} style={style}>
      <div className="flex items-stretch">
        {/* Тёмная колонка с иконкой — та же «шайба», что и в табло */}
        <div
          className="flex items-center justify-center shrink-0 relative"
          style={{ width: 104, backgroundColor: T.head }}
        >
          <div
            className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0))' }}
          />
          <div className="relative z-10">{icon}</div>
        </div>

        <div className="flex-1 min-w-0 px-8 py-5">
          <div className="flex items-center gap-4 mb-3">
            <Label size={10} color={T.acc} tracking="0.28em" weight={800}>{label}</Label>
            <div className="flex-1 h-px" style={{ backgroundColor: T.divider }} />
            {right}
          </div>
          {children}
        </div>
      </div>
    </Glass>
  );
}

// Имя человека в один блок: фамилия крупно, имя подписью. Повторяется в судьях,
// комментаторах и списках голов — вынесено, чтобы кегли не разъезжались.
export function PersonName({ person, size = 30, align = 'left', className = '' }) {
  if (!person) return null;
  return (
    <div className={`flex flex-col min-w-0 ${align === 'right' ? 'items-end' : ''} ${className}`}>
      <Head size={size} className="truncate max-w-full">{person.last_name}</Head>
      <Label size={Math.max(11, Math.round(size * 0.44))} color={T.label} tracking="0.16em" className="mt-2 truncate max-w-full">
        {person.first_name}
      </Label>
    </div>
  );
}
