// src/components/WebGraphics/Graphics_2/kit.jsx
//
// Общие детали графики лиги 2: появление «срезом конька», линии конька,
// эмблема в плитке-иконке, фото, ужимание длинных фамилий, счётчики.
//
// Стили — свои классы с префиксом g2-, без Tailwind: оверлей живёт в OBS, и
// всё, от чего зависит картинка, должно лежать рядом с ней.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { onBandOnset } from '../audioReactive';
import { C, FONT, NUM, GRAPHITE, LIFT_SM, ACCENT_FILL } from './theme';

export const DEFAULT_AVATAR = 'default/user_default.webp';

const toUrl = (url) => (url ? getImageUrl(url) : '');

// ---------------------------------------------------------------------------
// СТИЛИ
// ---------------------------------------------------------------------------
//
// ПОЯВЛЕНИЕ «СРЕЗОМ КОНЬКА». Плашка открывается косой кромкой под 45° — тем же
// углом, что линии конька на иконках HockeyEco, — а по кромке бежит синее
// лезвие. Уходит тем же движением дальше вправо: въехала слева, уехала вправо.
//
// Угол держится ровно 45° на плашке любой пропорции: кромка считается в
// пикселях от высоты элемента (--g2h, меряется в Reveal), а не в процентах.
// --g2m — запас за край, чтобы тени плашки не обрезались.
//
// Ход кромки — зарегистрированное свойство --g2p (0 → 1). Его анимирует
// Chromium, то есть и браузерный источник OBS.
const CSS = `
@property --g2p { syntax: '<number>'; inherits: true; initial-value: 0; }
@font-face { font-family: 'Tektur'; src: url('/fonts/Tektur-ExtraBold.ttf') format('truetype'); font-weight: 700 800; font-display: block; }
@font-face { font-family: 'Tektur'; src: url('/fonts/Tektur-Black.ttf') format('truetype'); font-weight: 900; font-display: block; }

.g2-root, .g2-root *, .g2-root *::before, .g2-root *::after { box-sizing: border-box; }
.g2-root { font-family: ${FONT}; color: ${C.text}; -webkit-font-smoothing: antialiased; font-feature-settings: 'tnum' 1, 'lnum' 1; }
.g2-num { font-family: ${NUM}; font-variant-numeric: tabular-nums lining-nums; font-feature-settings: 'tnum' 1, 'lnum' 1; letter-spacing: 0; }
/* Громкие слова (ГОЛ, УДАЛЕНИЕ) — тем же Tektur */
.g2-loud { font-family: ${NUM}; font-weight: 900; letter-spacing: 0.02em; }

.g2-reveal { --g2c: calc(-1 * var(--g2h) - 2 * var(--g2m) + var(--g2p) * (100% + var(--g2h) + 4 * var(--g2m))); }
.g2-reveal.is-idle, .g2-reveal.is-gone { visibility: hidden; }
.g2-reveal.is-in {
  animation: g2CutIn var(--g2in, 700ms) cubic-bezier(.5,.02,.22,1) both;
  clip-path: polygon(calc(-1 * var(--g2m)) calc(-1 * var(--g2m)),
                     calc(var(--g2c) + var(--g2h) + var(--g2m)) calc(-1 * var(--g2m)),
                     calc(var(--g2c) - var(--g2m)) calc(100% + var(--g2m)),
                     calc(-1 * var(--g2m)) calc(100% + var(--g2m)));
}
.g2-reveal.is-out {
  animation: g2CutOut var(--g2out, 460ms) cubic-bezier(.55,0,.78,.38) both;
  clip-path: polygon(calc(var(--g2c) + var(--g2h) + var(--g2m)) calc(-1 * var(--g2m)),
                     calc(100% + var(--g2m)) calc(-1 * var(--g2m)),
                     calc(100% + var(--g2m)) calc(100% + var(--g2m)),
                     calc(var(--g2c) - var(--g2m)) calc(100% + var(--g2m)));
}
@keyframes g2CutIn { from { --g2p: 0; } to { --g2p: 1; } }
@keyframes g2CutOut { from { --g2p: 0; } to { --g2p: 1; } }

/* Лезвие по кромке. Его можно положить и внутрь дочерней плашки (Blade), если
   она начинается от левого края Reveal и той же ширины: --g2oy — насколько
   она ниже верха Reveal, точки пересчитываются в её координаты. Так лезвие
   режет только саму плашку, а не пустой кадр вокруг висячих деталей. */
.g2-blade, .g2-blade-glow {
  position: absolute; inset: 0; pointer-events: none; z-index: 40; opacity: 0;
  --bt: calc(-1 * var(--g2m) - var(--g2oy, 0px));
  --bb: calc(var(--g2h) + var(--g2m) - var(--g2oy, 0px));
  --xt: calc(var(--g2c) + var(--g2h) + var(--g2m));
  --xb: calc(var(--g2c) - var(--g2m));
}
.g2-blade { background: #BFE6FF; --bw: 4px; }
.g2-blade-glow { background: rgba(67,181,245,0.28); --bw: 46px; }
.g2-reveal.is-in .g2-blade, .g2-reveal.is-in .g2-blade-glow {
  animation: g2Blade var(--g2in, 700ms) linear both;
  clip-path: polygon(calc(var(--xt) - var(--bw)) var(--bt), var(--xt) var(--bt), var(--xb) var(--bb), calc(var(--xb) - var(--bw)) var(--bb));
}
.g2-reveal.is-out .g2-blade, .g2-reveal.is-out .g2-blade-glow {
  animation: g2Blade var(--g2out, 460ms) linear both;
  clip-path: polygon(var(--xt) var(--bt), calc(var(--xt) + var(--bw)) var(--bt), calc(var(--xb) + var(--bw)) var(--bb), var(--xb) var(--bb));
}
@keyframes g2Blade { 0% { opacity: 0; } 8% { opacity: 1; } 82% { opacity: 1; } 100% { opacity: 0; } }

/* Содержимое догоняет кромку — каскадом, с задержкой из --d */
.g2-reveal.is-in .g2-rise, .g2-reveal.is-shown .g2-rise { animation: g2Rise 620ms cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--d, 0ms); }
.g2-reveal.is-in .g2-slide, .g2-reveal.is-shown .g2-slide { animation: g2Slide 680ms cubic-bezier(.2,.8,.2,1) both; animation-delay: var(--d, 0ms); }
.g2-reveal.is-in .g2-pop, .g2-reveal.is-shown .g2-pop { animation: g2Pop 760ms cubic-bezier(.2,1.3,.35,1) both; animation-delay: var(--d, 0ms); }
@keyframes g2Rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes g2Slide { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: none; } }
@keyframes g2Pop { from { opacity: 0; transform: scale(.82); } to { opacity: 1; transform: none; } }

/* Линии конька прорисовываются при появлении плашки */
.g2-skate path.g2-line { stroke-dasharray: 1; stroke-dashoffset: 0; }
.g2-reveal.is-in .g2-skate path.g2-line, .g2-reveal.is-shown .g2-skate path.g2-line { animation: g2Draw 900ms cubic-bezier(.3,.7,.2,1) both; animation-delay: calc(var(--d, 0ms) + var(--ld, 260ms)); }
@keyframes g2Draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }

/* Блик, который раз в несколько секунд проходит по плашке */
.g2-sheen { position: absolute; inset: 0; overflow: hidden; pointer-events: none; border-radius: inherit; }
.g2-sheen::after { content: ''; position: absolute; top: -20%; bottom: -20%; width: 34%; left: -50%;
  background: linear-gradient(105deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.07) 45%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0.07) 55%, rgba(255,255,255,0) 100%);
  animation: g2Sheen var(--sheen, 7s) ease-in-out infinite; animation-delay: var(--sheen-d, 1.2s); }
@keyframes g2Sheen { 0% { left: -50%; } 22% { left: 125%; } 100% { left: 125%; } }

/* Гол: счёт подпрыгивает, полоса команды вспыхивает, по ячейке проходит лезвие */
@keyframes g2ScorePop { 0% { transform: scale(1); } 14% { transform: scale(1.42); } 30% { transform: scale(.94); } 46% { transform: scale(1.12); } 64% { transform: scale(1); } 100% { transform: scale(1); } }
@keyframes g2Wash { 0% { opacity: 0; transform: translateX(-100%); } 18% { opacity: 1; } 60% { opacity: .9; transform: translateX(0); } 100% { opacity: 0; transform: translateX(0); } }
@keyframes g2Slice { 0% { left: -30%; opacity: 0; } 10% { opacity: 1; } 70% { opacity: 1; } 100% { left: 130%; opacity: 0; } }
@keyframes g2Breath { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes g2Tick { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
@keyframes g2Spin { to { transform: rotate(360deg); } }
.g2-score-pop { animation: g2ScorePop 1.6s cubic-bezier(.2,.8,.2,1) both; }

/* Висячие плашки под табло (удаления, большинство) выпадают из-под него */
@keyframes g2Drop { from { opacity: 0; transform: translateY(-14px); } to { opacity: 1; transform: none; } }
.g2-drop { animation: g2Drop 460ms cubic-bezier(.2,.8,.2,1) both; }

/* Смена страниц внутри полноэкранной плашки */
@keyframes g2PageIn { from { opacity: 0; transform: translateX(34px); } to { opacity: 1; transform: none; } }
.g2-page-in { animation: g2PageIn 520ms cubic-bezier(.2,.8,.2,1) both; }
.g2-page-out { opacity: 0; transform: translateX(-26px); transition: opacity 200ms ease-in, transform 200ms ease-in; }
`;

export function G2Style() {
  return <style>{CSS}</style>;
}

// ---------------------------------------------------------------------------
// ПОЯВЛЕНИЕ
// ---------------------------------------------------------------------------
//
// ВНИМАНИЕ: кромка считается от рамки самого элемента, поэтому className
// обязан его позиционировать (absolute). Свой transform элементу не задавайте
// — центруйте раскладкой (inset-x + flex), как и в остальной графике.
export function Blade({ offsetY = 0 }) {
  return (
    <>
      <div className="g2-blade-glow" style={{ '--g2oy': `${offsetY}px` }} aria-hidden />
      <div className="g2-blade" style={{ '--g2oy': `${offsetY}px` }} aria-hidden />
    </>
  );
}

// blade={false} — лезвие кладёт сам вызывающий (<Blade/> внутри плашки).
export function Reveal({ visible, className = '', style, margin = 100, inMs = 700, outMs = 460, blade = true, children }) {
  const ref = useRef(null);
  const [phase, setPhase] = useState('idle');   // idle → in → shown → out → gone
  const [h, setH] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setH(el.offsetHeight || 0);
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (visible) setPhase(p => (p === 'in' || p === 'shown' ? p : 'in'));
    else setPhase(p => (p === 'idle' || p === 'gone' ? p : 'out'));
  }, [visible]);

  // Страховка к animationend: если событие не пришло (вкладка была скрыта,
  // источник OBS неактивен), фаза всё равно доходит до конца — иначе
  // плашка так и осталась бы под маской с обрезанной тенью.
  useEffect(() => {
    if (phase !== 'in' && phase !== 'out') return undefined;
    const t = setTimeout(() => setPhase(p => (p === 'in' ? 'shown' : p === 'out' ? 'gone' : p)),
      (phase === 'in' ? inMs : outMs) + 120);
    return () => clearTimeout(t);
  }, [phase, inMs, outMs]);

  const onEnd = (e) => {
    if (e.target !== ref.current) return;
    if (e.animationName === 'g2CutIn') setPhase('shown');
    if (e.animationName === 'g2CutOut') setPhase('gone');
  };

  return (
    <div
      ref={ref}
      className={`g2-root g2-reveal is-${phase} ${className}`}
      style={{ ...style, '--g2h': `${h}px`, '--g2m': `${margin}px`, '--g2in': `${inMs}ms`, '--g2out': `${outMs}ms` }}
      onAnimationEnd={onEnd}
    >
      <G2Style />
      {children}
      {blade && <Blade />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ЛИНИИ КОНЬКА
// ---------------------------------------------------------------------------
//
// Две параллельные линии под 45° и едва заметный треугольник подцветки — как
// на иконке TR. Только углы tl и br: на иконке линии идут «/», и срезать ими
// можно только эти два угла. Через текст их не проводим.
export function SkateLines({ corner = 'br', size = 160, color = C.skate, opacity = 1, width = 3, tint = true, delay = 0, style }) {
  const flip = corner === 'tl' ? 'scale(-1,-1)' : 'none';
  const pos = corner === 'tl' ? { left: 0, top: 0 } : { right: 0, bottom: 0 };
  // Толщина в пикселях кадра: viewBox 100 растягивается на size.
  const sw = (width * 100) / size;
  return (
    <svg
      className="g2-skate"
      width={size} height={size} viewBox="0 0 100 100"
      style={{ position: 'absolute', ...pos, transform: flip, pointerEvents: 'none', opacity, overflow: 'visible', '--ld': `${delay}ms`, ...style }}
      aria-hidden
    >
      {tint && <path d="M0 100 L100 0 V100 Z" fill={color} opacity="0.07" />}
      <path className="g2-line" pathLength="1" d="M0 100 L100 0" stroke={color} strokeOpacity="0.55" strokeWidth={sw} fill="none" />
      <path className="g2-line" pathLength="1" d="M34 100 L100 34" stroke={color} strokeOpacity="0.36" strokeWidth={sw} fill="none" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// КАРТИНКИ
// ---------------------------------------------------------------------------

// Эмблема/логотип: не загрузилась — исчезает, а не показывает битую иконку.
export function Img({ url, style, className, alt = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return null;
  return <img src={toUrl(url)} alt={alt} className={className} style={style} draggable={false} onError={() => setFailed(true)} />;
}

// Фото игрока: не загрузилось — заглушка лиги, не загрузилась и она — пусто.
//
// В графике лиги 2 фото игроков КВАДРАТНЫЕ. Исходники бывают любые: вытянутый
// по вертикали снимок обрезается снизу (лицо — в верхней части кадра), по
// горизонтали — с боков, по центру. Растягивать нельзя: только cover.
export function Photo({ url, style, className }) {
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [url]);
  const src = stage === 0 && url ? toUrl(url) : stage <= 1 ? getImageUrl(DEFAULT_AVATAR) : null;
  if (!src) return <div className={className} style={{ ...style, background: C.ink }} />;
  return (
    <img
      key={src} src={src} alt="" draggable={false}
      className={className}
      style={{ objectFit: 'cover', objectPosition: '50% 0%', ...style }}
      onError={() => setStage(s => (s === 0 && url ? 1 : 2))}
    />
  );
}

// Эмблема команды в плитке-иконке HockeyEco: графит с осветлением края,
// скругление как у иконки (≈20%), линии конька цветом команды.
export function Crest({ url, size = 200, color = C.skate, lines = true, fill = 0.7, style, imgStyle, children }) {
  return (
    <div style={{
      position: 'relative', width: size, height: size, flexShrink: 0,
      borderRadius: Math.round(size * 0.2), background: GRAPHITE, boxShadow: LIFT_SM,
      overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', ...style,
    }}>
      {lines && <SkateLines corner="br" size={size * 0.56} color={color} width={Math.max(1.5, size / 70)} />}
      {lines && size >= 120 && <SkateLines corner="tl" size={size * 0.34} color={color} width={Math.max(1, size / 110)} tint={false} opacity={0.7} />}
      <Img url={url} style={{ position: 'relative', width: `${fill * 100}%`, height: `${fill * 100}%`, objectFit: 'contain', filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.45))', ...imgStyle }} />
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ТЕКСТ
// ---------------------------------------------------------------------------

// Длинная фамилия поджимается по ширине до 68%, дальше обрезается. Мерить
// приходится и после загрузки шрифта: до неё строка короче, чем будет.
export function FitText({ children, min = 0.68, align = 'left', style, className }) {
  const box = useRef(null);
  const inner = useRef(null);
  const [k, setK] = useState(1);

  useLayoutEffect(() => {
    const measure = () => {
      const b = box.current; const i = inner.current;
      if (!b || !i) return;
      const w = i.scrollWidth; const max = b.clientWidth;
      setK(w > max && max > 0 ? Math.max(min, max / w) : 1);
    };
    measure();
    // Ширина строки меняется, когда догружается шрифт, а ширина коробки — при
    // раскладке соседей. Следим за обеими: scaleX на ширину в раскладке не влияет.
    if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    ro.observe(inner.current);
    return () => ro.disconnect();
  }, [children, min]);

  return (
    // Коробка — flex, а не text-align: строку шире коробки text-align не
    // выравнивает (она всегда вылезает вправо), а flex-end/center — выравнивает.
    <div ref={box} className={className} style={{
      overflow: 'hidden', whiteSpace: 'nowrap', display: 'flex',
      justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start', ...style,
    }}>
      <span ref={inner} style={{
        display: 'inline-block', flexShrink: 0,
        transform: k < 1 ? `scaleX(${k})` : undefined,
        transformOrigin: align === 'right' ? 'right center' : align === 'center' ? 'center' : 'left center',
      }}>
        {children}
      </span>
    </div>
  );
}

// Надстрочник: мелкий разреженный капс приглушённым цветом.
// Не мельче 15 px: мельче в эфире размывает сжатие видео (YouTube, VK, 720p).
export function Kicker({ children, color = C.muted, size = 15, spacing = '0.2em', style }) {
  return (
    <div style={{ fontSize: Math.max(15, size), fontWeight: 800, letterSpacing: spacing, textTransform: 'uppercase', color, lineHeight: 1.15, ...style }}>
      {children}
    </div>
  );
}

// Синяя плашка — заливка основной кнопки TR.
export function AccentChip({ children, fill = ACCENT_FILL, color = '#FFFFFF', size = 13, pad = '6px 12px', radius = 8, style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, background: fill, color, padding: pad, borderRadius: radius,
      fontSize: size, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 6px 16px -4px rgba(23,148,221,0.45)', whiteSpace: 'nowrap', ...style,
    }}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// НИЖНИЙ ТИТР — арена, комментатор, судьи
// ---------------------------------------------------------------------------
//
// Слева синяя плитка с иконкой (кнопка TR), справа графит с текстом. Стоит в
// левом нижнем углу — там же, где и у остальной графики, чтобы не спорить с
// титром гола по центру.
export function LowerThird({ visible, icon, children }) {
  return (
    <Reveal visible={visible} margin={90} style={{ position: 'absolute', zIndex: 40, left: 64, bottom: 72 }}>
      <div style={{ position: 'relative', display: 'flex', borderRadius: 24, overflow: 'hidden', background: GRAPHITE, boxShadow: LIFT_SM, minHeight: 120 }}>
        <div className="g2-sheen" style={{ '--sheen': '7s', '--sheen-d': '1.6s' }} />
        <div style={{ position: 'relative', width: 110, flexShrink: 0, background: ACCENT_FILL, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          <SkateLines corner="br" size={84} color="#FFFFFF" width={2} tint={false} opacity={0.45} />
          <div className="g2-pop" style={{ '--d': '220ms', display: 'flex' }}>
            <Icon name={icon} size={46} color="#FFFFFF" stroke={1.7} />
          </div>
        </div>
        <div style={{ position: 'relative', padding: '22px 40px 22px 32px', display: 'flex', alignItems: 'center' }}>
          {children}
        </div>
      </div>
    </Reveal>
  );
}

// Плашка сама уходит через displayDuration секунд — панель её не снимает.
export function useTimedVisible(globalVisible, seconds, data) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!globalVisible) { setOn(false); return undefined; }
    setOn(true);
    const t = setTimeout(() => setOn(false), (Number(seconds) || 10) * 1000);
    return () => clearTimeout(t);
  }, [globalVisible, seconds, data]);
  return on;
}

// ---------------------------------------------------------------------------
// ИКОНКИ — тонкий контур, как в интерфейсе TR
// ---------------------------------------------------------------------------

const ICONS = {
  pin: 'M12 21s-6.5-5.7-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.3 12 21 12 21z M12 12.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M19 11a7 7 0 0 1-14 0 M12 18v3 M8.5 21h7',
  // Свисток — тот же, что в интерфейсе LMS (src/ui/Icon.jsx), два контура
  whistle: 'M6.75 16.75C7.91667 17.9167 9.33333 18.5 11 18.5C12.6667 18.5 14.0833 17.9167 15.25 16.75C16.4167 15.5833 17 14.1667 17 12.5V10.5H22V6.5H11C10.2 6.5 9.44583 6.65 8.7375 6.95C8.02917 7.25 7.4 7.65 6.85 8.15C6.46667 8.53333 5.58 9.72 5.1 11.4C5.06667 11.5833 5.04167 11.7667 5.025 11.95C5.00833 12.1333 5 12.3167 5 12.5C5 14.1667 5.58333 15.5833 6.75 16.75ZM13.6527 12.3473C13.6527 13.08 13.3937 13.7052 12.8758 14.2231C12.3579 14.741 11.7326 15 11 15C10.2674 15 9.64208 14.741 9.12418 14.2231C8.60627 13.7052 8.34732 13.08 8.34732 12.3473C8.34732 11.6147 8.60627 10.9894 9.12418 10.4715C9.64208 9.95359 10.2674 9.69464 11 9.69464C11.7326 9.69464 12.3579 9.95359 12.8758 10.4715C13.3937 10.9894 13.6527 11.6147 13.6527 12.3473Z M4.8 11.475C4.91667 11.4583 5.01667 11.4333 5.1 11.4C5.58 9.72 6.46667 8.53333 6.85 8.15C6.66667 7.66667 6.35417 7.27083 5.9125 6.9625C5.47083 6.65417 4.975 6.5 4.425 6.5C3.725 6.5 3.14583 6.74167 2.6875 7.225C2.22917 7.70833 2 8.3 2 9C2 9.7 2.24167 10.2917 2.725 10.775C3.20833 11.2583 3.8 11.5 4.5 11.5C4.58333 11.5 4.68333 11.4917 4.8 11.475Z',
  // Погода (титр арены)
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  partly: 'M12 2v1.5 M5.6 4.6l1 1 M2.5 10.5H4 M17.4 4.6l-1 1 M8.2 9.3a4 4 0 0 1 7.5-1.6 M16.5 21H9a4 4 0 1 1 .9-7.9 5 5 0 0 1 9.6 1.9 3 3 0 0 1-3 6z',
  cloud: 'M17.5 19H8a5 5 0 1 1 1.1-9.9A6 6 0 0 1 20.6 11 4 4 0 0 1 17.5 19z',
  fog: 'M8 5h8 M4 9h16 M2 13h20 M6 17h12 M9 21h6',
  rain: 'M17 15H8a4.5 4.5 0 1 1 1-8.9A5.5 5.5 0 0 1 19.6 8.4 3.5 3.5 0 0 1 17 15z M8 18l-1 3 M12 18l-1 3 M16 18l-1 3',
  snow: 'M17 15H8a4.5 4.5 0 1 1 1-8.9A5.5 5.5 0 0 1 19.6 8.4 3.5 3.5 0 0 1 17 15z M8 18.5h.01 M12 18.5h.01 M16 18.5h.01 M10 21.5h.01 M14 21.5h.01',
  storm: 'M17 14H8a4.5 4.5 0 1 1 1-8.9A5.5 5.5 0 0 1 19.6 7.4 3.5 3.5 0 0 1 17 14z M12.5 14l-2 4h3l-2 4',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z M4 10h16 M8.5 3v4 M15.5 3v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.5V12l3 2',
  puck: 'M4 9c0-1.7 3.6-3 8-3s8 1.3 8 3v5c0 1.7-3.6 3-8 3s-8-1.3-8-3z M4 9c0 1.7 3.6 3 8 3s8-1.3 8-3',
  team: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M2.5 20a6.5 6.5 0 0 1 13 0 M16 4.3a3.5 3.5 0 0 1 0 6.4 M18 14.2a6.5 6.5 0 0 1 3.5 5.8',
};

export function Icon({ name, size = 24, color = 'currentColor', stroke = 1.8, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke}
         strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, ...style }} aria-hidden>
      {ICONS[name].split(' M').map((d, i) => <path key={i} d={i ? `M${d}` : d} />)}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ХУКИ
// ---------------------------------------------------------------------------

// Обратный отсчёт до начала матча / периода. Панель присылает либо момент
// окончания (endTime), либо замороженный остаток на паузе.
export function useCountdown(visible, data) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!visible || !data) return undefined;
    if (data.isPaused) { setLeft(data.timeLeft || 0); return undefined; }
    if (!data.endTime) return undefined;
    const tick = () => setLeft(Math.max(0, Math.floor((data.endTime - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [visible, data]);
  return left;
}

// Чей был гол — на несколько секунд после того, как счёт вырос.
export function useGoalFlash(game, ms = 3200) {
  const prev = useRef({ home: game?.home_score, away: game?.away_score });
  const [side, setSide] = useState(null);
  const [stamp, setStamp] = useState(0);
  useEffect(() => {
    const p = prev.current;
    const h = game?.home_score ?? 0;
    const a = game?.away_score ?? 0;
    let who = null;
    if (p.home !== undefined && h > p.home) who = 'home';
    else if (p.away !== undefined && a > p.away) who = 'away';
    prev.current = { home: h, away: a };
    if (!who) return undefined;
    setSide(who);
    setStamp(Date.now());
    const t = setTimeout(() => setSide(null), ms);
    return () => clearTimeout(t);
  }, [game?.home_score, game?.away_score]);
  return { side, stamp };
}

// Автолистание страниц внутри плашки.
export function usePager(visible, count, seconds, resetKey = '') {
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [visible, resetKey]);
  useEffect(() => {
    if (!visible || count < 2) return undefined;
    const id = setInterval(() => setPage(p => (p + 1) % count), Math.max(3, Number(seconds) || 8) * 1000);
    return () => clearInterval(id);
  }, [visible, count, seconds, resetKey]);
  return count ? page % count : 0;
}

// Перелистывание: старое уходит влево, новое въезжает справа.
export function Page({ pageKey, children, style, className = '' }) {
  const [shown, setShown] = useState(pageKey);
  const [phase, setPhase] = useState('in');
  const last = useRef(children);
  if (shown === pageKey) last.current = children;
  useEffect(() => {
    if (shown === pageKey) return undefined;
    setPhase('out');
    const t = setTimeout(() => { setShown(pageKey); setPhase('in'); }, 200);
    return () => clearTimeout(t);
  }, [pageKey]);
  return (
    <div key={shown} className={`${className} ${phase === 'out' ? 'g2-page-out' : 'g2-page-in'}`} style={style}>
      {shown === pageKey ? children : last.current}
    </div>
  );
}

// ---------------------------------------------------------------------------
// РЯБЬ ПОД ИНТРО
// ---------------------------------------------------------------------------
//
// Под музыку интро от плитки-эмблемы расходятся контуры той же скруглённой
// формы — по одному на каждый удар баса, средних и высоких (onBandOnset из
// audioReactive.js). Без интро ударов нет — нет и ряби.
const RIPPLE = {
  bass: { from: 1.0, to: 1.55, life: 1000, width: 3, alpha: 0.42, color: '67,181,245' },
  mid: { from: 1.0, to: 1.35, life: 760, width: 1.5, alpha: 0.3, color: '232,232,228' },
  high: { from: 1.0, to: 1.25, life: 600, width: 1.2, alpha: 0.32, color: '96,165,250' },
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function TileRipple({ tile = 260, area = 520 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = area * dpr;
    canvas.height = area * dpr;
    ctx.scale(dpr, dpr);
    const items = [];
    let raf = null;

    const loop = () => {
      raf = null;
      const now = performance.now();
      ctx.clearRect(0, 0, area, area);
      for (let i = items.length - 1; i >= 0; i -= 1) {
        const it = items[i];
        const cfg = RIPPLE[it.band];
        const t = (now - it.born) / cfg.life;
        if (t >= 1) { items.splice(i, 1); continue; }
        const e = 1 - (1 - t) * (1 - t);
        const s = tile * (cfg.from + (cfg.to - cfg.from) * e);
        const a = cfg.alpha * it.strength * Math.pow(1 - t, 1.4);
        roundRect(ctx, (area - s) / 2, (area - s) / 2, s, s, s * 0.2);
        ctx.strokeStyle = `rgba(${cfg.color},${a.toFixed(3)})`;
        ctx.lineWidth = cfg.width;
        ctx.stroke();
      }
      if (items.length) raf = requestAnimationFrame(loop);
    };

    const off = onBandOnset((band, strength) => {
      if (!RIPPLE[band]) return;
      if (items.filter(i => i.band === band).length >= 3) {
        const idx = items.findIndex(i => i.band === band);
        if (idx >= 0) items.splice(idx, 1);
      }
      items.push({ band, born: performance.now(), strength: Math.max(0.45, strength || 0) });
      if (raf == null) raf = requestAnimationFrame(loop);
    });
    return () => { off(); if (raf) cancelAnimationFrame(raf); items.length = 0; };
  }, [tile, area]);

  return (
    <canvas ref={ref} style={{
      position: 'absolute', width: area, height: area, left: '50%', top: '50%',
      marginLeft: -area / 2, marginTop: -area / 2, pointerEvents: 'none',
    }} />
  );
}

// Пульс под интро для эмблем — CSS-переменные из audioReactive.js, без ререндеров.
export const beat = (k = 1) => ({
  transform: `scale(calc(1 + var(--audio-beat, 0) * ${0.08 * k} + var(--audio-pulse, 0) * ${0.04 * k}))`,
  willChange: 'transform',
});
