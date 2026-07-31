import React from 'react';
import { S } from './theme';

// Типографика оверлея лиги 2. Главный приём с референса — заголовок, у которого
// СОСЕДНИЕ СЛОВА НАБРАНЫ РАЗНЫМ ЦВЕТОМ (белое / жёлтое / графит). Поэтому базовый
// компонент здесь не «строка текста», а Split: он сам режет фразу на слова и
// раскрашивает их по кругу из переданной палитры.

export function Big({ children, size = 64, color = S.white, tracking = '-0.02em', className = '', style = {} }) {
  return (
    <span
      className={`font-black uppercase leading-[0.9] inline-block ${className}`}
      style={{ color, fontSize: size, letterSpacing: tracking, ...style }}
    >
      {children}
    </span>
  );
}

// Заголовок с чередованием цвета по словам.
// gapClass задаёт межсловный пробел: обычный space схлопывается при переносе.
export function Split({
  text = '',
  size = 64,
  colors = [S.white, S.yellow],
  tracking = '-0.02em',
  className = '',
  style = {},
}) {
  const words = String(text).split(/\s+/).filter(Boolean);
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-[0.28em] gap-y-1 ${className}`} style={style}>
      {words.map((w, i) => (
        <Big key={i} size={size} color={colors[i % colors.length]} tracking={tracking}>{w}</Big>
      ))}
    </span>
  );
}

// Цифры: табличные ширины — счёт и таймер не должны «дышать» при смене разрядов.
export function Num({ children, size = 96, color = S.white, className = '', style = {} }) {
  return (
    <span
      className={`font-black tabular-nums leading-none inline-block ${className}`}
      style={{ color, fontSize: size, letterSpacing: '-0.035em', ...style }}
    >
      {children}
    </span>
  );
}

// Служебная подпись: широкая разрядка, без сжатия.
export function Cap({ children, size = 12, color = S.ash, tracking = '0.24em', className = '', style = {} }) {
  return (
    <span
      className={`font-black uppercase leading-none whitespace-nowrap ${className}`}
      style={{ fontSize: size, letterSpacing: tracking, color, ...style }}
    >
      {children}
    </span>
  );
}

// Плашка-метка сплошной заливкой.
export function Tag({ children, bg = S.yellow, color = S.coalDeep, size = 12, className = '', style = {} }) {
  return (
    <div className={`inline-flex items-center px-3.5 py-2 ${className}`} style={{ backgroundColor: bg, ...style }}>
      <span className="font-black uppercase leading-none whitespace-nowrap" style={{ color, fontSize: size, letterSpacing: '0.2em' }}>
        {children}
      </span>
    </div>
  );
}

// Надзаголовок: жёлтая скошенная полоска + подпись. Ставится над каждой группой.
export function Kicker({ children, color = S.yellow, textColor, size = 12, className = '' }) {
  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      <div
        className="shrink-0"
        style={{ width: 26, height: 7, backgroundColor: color, clipPath: 'polygon(0 0, 100% 0, calc(100% - 7px) 100%, 0 100%)' }}
      />
      <span
        className="font-black uppercase leading-none whitespace-nowrap"
        style={{ fontSize: size, letterSpacing: '0.3em', color: textColor || color }}
      >
        {children}
      </span>
    </div>
  );
}

// Заголовок секции с линейкой на всю ширину.
export function SectionHead({ children, right = null, onPaper = false, className = '' }) {
  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <Kicker size={12} textColor={onPaper ? S.coal : S.white}>{children}</Kicker>
      <div className="flex-1 h-[2px]" style={{ backgroundColor: onPaper ? S.paperLine : S.line }} />
      {right}
    </div>
  );
}
