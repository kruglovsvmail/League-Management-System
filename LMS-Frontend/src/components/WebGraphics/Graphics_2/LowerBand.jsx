import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { getImageUrl } from '../../../utils/helpers';
import { Hatch, Snowflake } from './IcePattern';
import { C, cut, shadow } from './theme';

// Общий каркас служебных плашек (арена, комментаторы, судьи): ЛЕНТА ВО ВСЮ ШИРИНУ
// кадра, прижатая к нижней кромке.
//
// В дефолтной графике это три почти одинаковых маленьких параллелограмма в левом
// нижнем углу. Здесь одна узнаваемая лента 1920×156 с общей левой светлой плитой
// (иконка + подпись) и совершенно разной внутренней раскладкой у каждой плашки —
// у судей и комментаторов появляются фотографии, которых в дефолте нет.

export function LowerBand({ icon, label, children }) {
  return (
    <div style={{ filter: shadow('xl') }}>
      <div className="w-[1920px] h-[156px] flex items-stretch relative overflow-hidden" style={{ backgroundColor: C.navy }}>
        <Hatch color="rgba(255,255,255,0.04)" step={30} drift />
        <div className="g3-gleam z-40" style={{ left: '-60%', width: '18%' }} />
        <div className="absolute inset-x-0 top-0 h-[6px] z-30" style={{ backgroundColor: C.blue }} />

        <Snowflake
          size={230} color={C.blue} strokeWidth={0.9}
          className="absolute right-[380px] -top-16 pointer-events-none z-0"
          style={{ opacity: 0.1, animation: 'g3Spin 70s linear infinite' }}
        />

        {/* Левая светлая плита: иконка + подпись, правая кромка срезана под 45° */}
        <div
          className="flex items-center gap-7 pl-14 pr-[74px] relative shrink-0"
          style={{ backgroundColor: C.ice, clipPath: 'polygon(0 0, 100% 0, calc(100% - 50px) 100%, 0 100%)' }}
        >
          <Hatch color="rgba(11,42,91,0.05)" step={20} />
          <div className="relative z-10">{icon}</div>
          <div className="relative z-10 flex flex-col leading-none max-w-[230px]">
            {label.split('\n').map((line, i) => (
              <span
                key={i}
                className="font-black uppercase tracking-[0.16em]"
                style={{ color: i === 0 ? C.deep : C.blueDk, fontSize: i === 0 ? 24 : 14, marginTop: i ? 7 : 0 }}
              >
                {line}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 flex items-center pl-12 pr-14 relative z-10 min-w-0">{children}</div>
      </div>
    </div>
  );
}

// Персона с фотографией: используется судьями и комментаторами.
export function PersonTile({ person, role, wide = false }) {
  if (!person) return null;
  const fallback = getImageUrl('default/user_default.webp');
  const photo = getSafeUrl(person.avatar_url) || fallback;

  return (
    <div className="flex items-center gap-5 min-w-0">
      <div className="w-[86px] h-[86px] shrink-0 relative" style={{ backgroundColor: C.navy2, clipPath: cut(16, 0, 16, 0) }}>
        <img
          src={photo}
          alt=""
          className="w-full h-full object-cover object-top"
          style={{ clipPath: cut(16, 0, 16, 0) }}
          onError={(e) => { e.target.onerror = null; e.target.src = fallback; }}
        />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="font-black uppercase tracking-[0.28em] text-[10px] mb-2" style={{ color: C.blue }}>
          {role}
        </span>
        <span
          className="font-black uppercase leading-none truncate"
          style={{ color: C.white, fontSize: wide ? 28 : 23, letterSpacing: '0.03em' }}
        >
          {person.last_name}
        </span>
        <span className="font-bold uppercase tracking-[0.14em] leading-none mt-1.5 truncate" style={{ color: C.steel, fontSize: wide ? 15 : 13 }}>
          {person.first_name}
        </span>
      </div>
    </div>
  );
}

export function BandDivider() {
  return <div className="w-px h-[92px] shrink-0" style={{ backgroundColor: C.line }} />;
}
