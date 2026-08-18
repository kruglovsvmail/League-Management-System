import React, { useMemo } from 'react';
import { T, R, SHADOW, silver, stageText } from './theme';
import { Display, Label, Kicker, Pill } from './Type';
import { LeagueMark } from './Emblem';

// Крупные плашки лиги 3 (предматч, перерыв, лидеры, составы).
//
// Это НЕ полный кадр: плашка — прямоугольная панель со скруглением и тенью,
// вокруг неё остаётся живая картинка. Внутри панели живёт ледяное поле сайта
// ТФХ: голубой градиент (--pgbg / --scene1 / --scene2), разметка арены сверху,
// ледяная пыль и виньетка. Больше в фоне ничего нет — вся смысловая нагрузка
// на контенте, фон только держит атмосферу.

export const PLATE_W = 1680;
export const PLATE_H = 880;
export const HEADER_H = 148;
export const FOOTER_H = 78;
export const FIELD_H = PLATE_H - HEADER_H - FOOTER_H; // 654
export const PAD_X = 64;

// --- Разметка арены ---------------------------------------------------------
// Пропорции взяты «на глаз» под панель 1680×880: точная геометрия площадки не
// нужна, работает узнаваемость — центральный круг, красная центральная и две
// синие линии. Всё на низкой альфе: это текстура, а не иллюстрация.
function RinkMarks() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1680 880" fill="none">
      <rect x="40" y="32" width="1600" height="816" rx="150" stroke={T.lineBlue} strokeWidth="3" opacity="0.28" />
      <rect x="62" y="54" width="1556" height="772" rx="132" stroke={T.crease} strokeWidth="2" opacity="0.4" />

      <line x1="580" y1="38" x2="580" y2="842" stroke={T.lineBlue} strokeWidth="14" opacity="0.15" />
      <line x1="1100" y1="38" x2="1100" y2="842" stroke={T.lineBlue} strokeWidth="14" opacity="0.15" />
      <line x1="840" y1="38" x2="840" y2="842" stroke={T.lineRed} strokeWidth="9" opacity="0.17" />

      <circle cx="840" cy="440" r="208" stroke={T.lineBlue} strokeWidth="5" opacity="0.2" />
      <circle cx="840" cy="440" r="15" fill={T.lineRed} opacity="0.2" />

      <circle cx="300" cy="248" r="124" stroke={T.lineRed} strokeWidth="4" opacity="0.11" />
      <circle cx="300" cy="632" r="124" stroke={T.lineRed} strokeWidth="4" opacity="0.11" />
      <circle cx="1380" cy="248" r="124" stroke={T.lineRed} strokeWidth="4" opacity="0.11" />
      <circle cx="1380" cy="632" r="124" stroke={T.lineRed} strokeWidth="4" opacity="0.11" />

      <path d="M138 366 A 78 78 0 0 1 138 514" stroke={T.lineRed} strokeWidth="4" opacity="0.15" />
      <path d="M1542 366 A 78 78 0 0 0 1542 514" stroke={T.lineRed} strokeWidth="4" opacity="0.15" />
    </svg>
  );
}

// --- Ледяная пыль -----------------------------------------------------------
// Позиции детерминированы: иначе каждый ре-рендер плашки перекидывал бы частицы
// в новые места, и фон «кипел» бы при любом обновлении счёта.
export function IceDust({ count = 22, height = PLATE_H, className = '' }) {
  const bits = useMemo(() => {
    const rnd = (i, salt) => {
      const x = Math.sin((i + 1) * 12.9898 + salt * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };
    return Array.from({ length: count }).map((_, i) => ({
      left: rnd(i, 1) * 100,
      top: -8 - rnd(i, 7) * 12,
      size: 2 + rnd(i, 2) * 4,
      duration: 16 + rnd(i, 3) * 18,
      delay: -rnd(i, 4) * 26,
      driftX: (rnd(i, 5) - 0.5) * 260,
      opacity: 0.25 + rnd(i, 6) * 0.45,
    }));
  }, [count]);

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {bits.map((b, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: b.size,
            height: b.size,
            backgroundColor: '#ffffff',
            boxShadow: `0 0 ${b.size * 3}px rgba(255,255,255,0.9)`,
            '--g3-dust-x': `${b.driftX}px`,
            '--g3-dust-y': `${height + 40}px`,
            '--g3-dust-op': b.opacity,
            animation: `g3Dust ${b.duration}s linear ${b.delay}s infinite`,
            willChange: 'transform, opacity',
          }}
        />
      ))}
    </div>
  );
}

// --- Ледяное поле панели ----------------------------------------------------
export function IceScene({ children, marks = true, dust = true, className = '' }) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        width: PLATE_W,
        height: PLATE_H,
        borderRadius: 30,
        border: `1px solid ${T.brd}`,
        boxShadow: SHADOW.float,
        background: `radial-gradient(1200px 700px at 50% 24%, ${T.scene1} 0%, ${T.scene2} 50%, ${T.pgbg} 100%)`,
      }}
    >
      {marks && <RinkMarks />}

      {dust && <IceDust />}

      {/* Виньетка — как .ice-scene__vignette на сайте */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 118%, ${T.vig}, transparent 60%)` }}
      />

      {children}
    </div>
  );
}

// --- Каркас плашки ----------------------------------------------------------
// Шапка: медальон федерации и заголовок слева, метки турнира справа. Название
// федерации словами здесь не выводится — в шапке панели это три строки мелкого
// текста, которые спорят с заголовком; принадлежность несёт сам медальон.
export function Stage({ game, title, kicker, children, showFooter = true, dust = true }) {
  const dateObj = game?.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj
    ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()
    : 'ДАТА НЕ УКАЗАНА';
  const city = game?.arena_city ? game.arena_city.toUpperCase() : 'ГОРОД НЕ УКАЗАН';
  const arena = (game?.arena_name || game?.location_text || 'ЛЕДОВАЯ АРЕНА').toUpperCase();
  const division = game?.division_name || game?.division_short_name;

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <IceScene dust={dust}>

        {/* ---- ШАПКА ---- */}
        <div
          className="absolute top-0 left-0 right-0 flex items-center justify-between z-30"
          style={{ height: HEADER_H, paddingLeft: PAD_X, paddingRight: PAD_X }}
        >
          <div className="flex items-center gap-7 min-w-0">
            <LeagueMark game={game} size={84} />
            <div className="min-w-0">
              {kicker && <Kicker size={12} className="mb-3">{kicker}</Kicker>}
              <Display size={58} style={{ textShadow: `0 0 44px ${T.glow}` }}>{title}</Display>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 pl-8">
            <Pill size={11}>{stageText(game)}</Pill>
            {division && <Pill size={11} bg={T.head} color={T.white} border={T.head}>{division}</Pill>}
          </div>
        </div>

        <div
          className="absolute z-30"
          style={{ left: PAD_X, right: PAD_X, top: HEADER_H - 1, height: 1, background: silver(90), opacity: 0.9 }}
        />

        {/* ---- ПОЛЕ ---- */}
        <div
          className="absolute left-0 right-0 z-20"
          style={{ top: HEADER_H, bottom: showFooter ? FOOTER_H : 0 }}
        >
          {children}
        </div>

        {/* ---- ПОДВАЛ ----
            Три равные колонки, а не justify-between: при раскладке по краям
            середина смещалась вслед за длиной названия арены, и город переставал
            стоять по центру панели.

            Под текстом светлая подложка: сам по себе он ложится на нижнюю,
            самую насыщенную часть ледяного градиента плюс виньетку и теряет
            контраст. */}
        {showFooter && (
          <>
            <div
              className="absolute left-0 right-0 bottom-0 pointer-events-none z-20"
              style={{
                height: FOOTER_H + 24,
                background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.78) 100%)',
              }}
            />
            <div
              className="absolute z-30"
              style={{ left: PAD_X, right: PAD_X, bottom: FOOTER_H, height: 1, background: silver(90), opacity: 0.9 }}
            />
            <div
              className="absolute left-0 right-0 bottom-0 grid items-center z-30"
              style={{
                height: FOOTER_H,
                gridTemplateColumns: '1fr 1fr 1fr',
                paddingLeft: PAD_X,
                paddingRight: PAD_X,
              }}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="rounded-full shrink-0" style={{ width: 9, height: 9, backgroundColor: T.acc }} />
                <div className="truncate">
                  <Label size={17} color={dateObj ? T.head : T.muted} tracking="0.16em" weight={800}>{dateStr}</Label>
                </div>
              </div>

              <div className="text-center truncate min-w-0">
                <Label size={17} color={game?.arena_city ? T.accDeep : T.muted} tracking="0.16em" weight={800}>{city}</Label>
              </div>

              <div className="text-right truncate min-w-0">
                <Label
                  size={17}
                  color={(game?.arena_name || game?.location_text) ? T.head : T.muted}
                  tracking="0.16em"
                  weight={800}
                >
                  {arena}
                </Label>
              </div>
            </div>
          </>
        )}
      </IceScene>
    </div>
  );
}

// Светлая панель под плотные данные (таблицы, составы, протокол голов) —
// прямой аналог .glass-card на сайте, только шире и с меньшим внутренним полем.
export function DataPanel({ children, className = '', style = {}, radius = R.card }) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        borderRadius: radius,
        backgroundColor: 'rgba(255,255,255,0.78)',
        border: `1px solid ${T.brdSoft}`,
        boxShadow: '0 20px 50px rgba(85,125,170,0.20), inset 0 1.5px 0 rgba(255,255,255,1)',
        ...style,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-20 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0))' }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
