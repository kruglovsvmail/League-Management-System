import React from 'react';
import { T, FONT_DISPLAY, FONT_TEXT } from './theme';

// Типографика оверлея лиги 3 — ровно та пара, что на сайте ТФХ:
// заголовки Aire Exterior (класс .font-display на сайте), всё остальное Manrope.
//
// Разделение жёсткое: ЦИФРЫ ВСЕГДА НАБИРАЕТ MANROPE. У Aire Exterior нет
// табличных цифр, и бегущий таймер на нём «дышал» бы по ширине на каждой смене
// разряда — на трансляции это первое, что бросается в глаза.

export function Display({ children, size = 56, color = T.head, tracking = '0.02em', className = '', style = {} }) {
  return (
    <span
      className={`uppercase leading-[0.98] inline-block ${className}`}
      style={{ fontFamily: FONT_DISPLAY, fontSize: size, letterSpacing: tracking, color, ...style }}
    >
      {children}
    </span>
  );
}

// Плотный текстовый заголовок: названия команд в строках, фамилии в списках.
export function Head({ children, size = 22, color = T.head, weight = 800, tracking = '0.01em', className = '', style = {} }) {
  return (
    <span
      className={`uppercase leading-none inline-block ${className}`}
      style={{ fontFamily: FONT_TEXT, fontWeight: weight, fontSize: size, letterSpacing: tracking, color, ...style }}
    >
      {children}
    </span>
  );
}

export function Num({ children, size = 40, color = T.head, weight = 800, className = '', style = {} }) {
  return (
    <span
      className={`tabular-nums leading-none inline-block ${className}`}
      style={{
        fontFamily: FONT_TEXT,
        fontWeight: weight,
        fontSize: size,
        letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Служебная подпись: разрядка и верхний регистр, как у .page-heading__subtitle
// и заголовков таблиц на сайте.
export function Label({ children, size = 12, color = T.label, tracking = '0.2em', weight = 700, className = '', style = {} }) {
  return (
    <span
      className={`uppercase leading-none whitespace-nowrap inline-block ${className}`}
      style={{ fontFamily: FONT_TEXT, fontWeight: weight, fontSize: size, letterSpacing: tracking, color, ...style }}
    >
      {children}
    </span>
  );
}

// Надзаголовок группы: шайба-точка + подпись акцентом. Круг вместо привычной
// полоски — тот же мотив, что у эмблемы федерации.
export function Kicker({ children, size = 12, color = T.acc, dot = true, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {dot && <div className="rounded-full shrink-0" style={{ width: 9, height: 9, backgroundColor: color }} />}
      <Label size={size} color={color} tracking="0.26em" weight={800}>{children}</Label>
    </div>
  );
}

// Чип-пилюля: скругление 999px, полупрозрачная заливка и тонкая рамка —
// один в один кнопки и метки сайта.
export function Pill({
  children,
  bg = T.accChip,
  color = T.acc,
  border = 'rgba(18,49,74,0.28)',
  size = 12,
  className = '',
  style = {},
}) {
  return (
    <div
      className={`inline-flex items-center px-4 py-2 rounded-full shrink-0 ${className}`}
      style={{ backgroundColor: bg, border: `1px solid ${border}`, ...style }}
    >
      <Label size={size} color={color} tracking="0.18em" weight={800}>{children}</Label>
    </div>
  );
}

// Заголовок секции с линейкой на всю ширину — как разделители внутри карточек сайта.
export function SectionHead({ children, right = null, color = T.acc, className = '' }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <Kicker size={11} color={color}>{children}</Kicker>
      <div className="flex-1 h-px" style={{ backgroundColor: T.divider }} />
      {right}
    </div>
  );
}
