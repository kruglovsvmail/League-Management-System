// src/components/WebGraphics/Graphics_3/EventOverlay.jsx
//
// Гол / штраф — ВЕРТИКАЛЬНЫЙ ПОСТЕР у левой кромки кадра, во всю его высоту.
// Дефолт показывает широкую горизонтальную ленту по центру снизу; здесь наоборот:
// узкая высокая карточка слева, игрок в полный рост, огромный номер на светлой
// плите и расшифровка goal_strength (большинство / меньшинство / пустые ворота /
// штрафной бросок) — это поле дефолтная графика не выводит вообще.
import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { getImageUrl } from '../../../utils/helpers';
import { Reveal } from './Reveal';
import { Hatch, Snowflake } from './IcePattern';
import { C, cut, blade, shadow, GOAL_STRENGTH } from './theme';

export default function EventOverlay({ game, overlay }) {
  if (!overlay.data) return null;

  const isVisible = overlay.visible && (overlay.type === 'goal' || overlay.type === 'penalty');
  const isGoal = overlay.type === 'goal';

  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const defaultPhoto = getImageUrl('default/user_default.webp');
  const playerPhoto = getSafeUrl(overlay.data?.primary_photo_url) || defaultPhoto;
  const teamLogo = getSafeUrl(overlay.data?.team_logo);

  const isHomeEvent = overlay.data?.team_id === game.home_team_id;
  const accent = isHomeEvent ? (game.home_color_1 || C.blueDk) : (game.away_color_1 || C.navy2);
  const teamName = isHomeEvent ? homeShortName : awayShortName;

  // Номер: сначала ищем игрока в заявке на матч, потом любые поля самого события.
  const roster = isHomeEvent ? game.home_roster : game.away_roster;
  const matched = roster?.find(p =>
    p.last_name === overlay.data?.primary_last_name &&
    p.first_name === overlay.data?.primary_first_name
  );
  const playerNumber =
    matched?.jersey_number ||
    overlay.data?.player_number ||
    overlay.data?.jersey_number ||
    overlay.data?.primary_jersey_number ||
    '00';

  const strengthLabel = isGoal ? GOAL_STRENGTH[overlay.data?.goal_strength] : null;
  const periodLabel = overlay.data?.period
    ? (overlay.data.period === 'OT' ? 'ОВЕРТАЙМ' : overlay.data.period === 'SO' ? 'БУЛЛИТЫ' : `${overlay.data.period} ПЕРИОД`)
    : null;

  const assists = [overlay.data.assist1_last_name, overlay.data.assist2_last_name].filter(Boolean);

  return (
    <Reveal isVisible={isVisible} variant="poster" className="absolute left-[72px] top-1/2 z-50">
      <div style={{ filter: shadow('xl') }}>
        <div
          /* Высота подобрана так, чтобы постер не наезжал на нижнюю ленту (156px):
             при top-1/2 он занимает 160…920 в кадре 1080. */
          className="w-[478px] h-[760px] flex flex-col relative overflow-hidden"
          style={{ backgroundColor: C.deep, clipPath: cut(0, 0, 64, 0) }}
        >
          <div className="g3-gleam z-40" style={{ left: '-60%' }} />

          {/* Вертикальный рельс команды во всю высоту */}
          <div className="absolute left-0 top-0 bottom-0 w-[14px] z-30" style={{ backgroundColor: accent }} />

          {/* --- ШАПКА: команда --- */}
          <div className="h-[92px] shrink-0 flex items-center gap-4 pl-9 pr-6 relative" style={{ backgroundColor: accent }}>
            <Hatch color="rgba(4,18,43,0.14)" step={18} drift />
            {teamLogo && (
              <img src={teamLogo} alt="" className="w-[56px] h-[56px] object-contain relative z-10 drop-shadow-[0_6px_12px_rgba(0,0,0,0.5)]"
                   onError={(e) => { e.target.style.display = 'none'; }} />
            )}
            <div className="flex flex-col relative z-10">
              <span className="font-black uppercase text-[28px] leading-none tracking-[0.05em]" style={{ color: C.white }}>
                {teamName}
              </span>
              {periodLabel && (
                <span className="font-bold uppercase tracking-[0.24em] text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  {periodLabel}
                </span>
              )}
            </div>
          </div>

          {/* --- ФОТО ИГРОКА --- */}
          <div className="flex-1 relative overflow-hidden min-h-0">
            {teamLogo && (
              <img src={teamLogo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.14] blur-2xl scale-150 z-0 pointer-events-none" />
            )}
            <img
              key={overlay.data.id || overlay.data.primary_player_id}
              src={playerPhoto}
              alt="Player"
              className="absolute inset-0 w-full h-full object-cover object-top z-10"
              onError={(e) => { e.target.onerror = null; e.target.src = defaultPhoto; }}
            />
            {/* Растворение фото в тёмный низ — стык со светлой плитой без жёсткой границы */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 z-20" style={{ background: `linear-gradient(to bottom, transparent, ${C.deep})` }} />

            {/* Номер игрока — плитка в правом верхнем углу */}
            <div
              className="absolute top-6 right-0 z-30 flex items-center justify-center px-6 h-[92px] min-w-[112px]"
              style={{ backgroundColor: C.ice, clipPath: 'polygon(28px 0, 100% 0, 100% 100%, 0 100%)' }}
            >
              <span className="font-mono font-black text-[54px] tabular-nums leading-none" style={{ color: C.deep }}>
                {playerNumber}
              </span>
            </div>

            <Snowflake
              size={190} color={C.blue} strokeWidth={0.9}
              className="absolute -left-10 bottom-10 z-20 pointer-events-none"
              style={{ opacity: 0.16, animation: 'g3Spin 50s linear infinite' }}
            />
          </div>

          {/* --- СВЕТЛАЯ ПЛИТА С ДАННЫМИ --- */}
          <div className="h-[290px] shrink-0 relative pl-9 pr-8 pt-6 pb-7 flex flex-col" style={{ backgroundColor: C.ice }}>
            <Hatch color="rgba(11,42,91,0.055)" step={22} />

            {/* Водяной номер за текстом */}
            <span
              className="absolute -right-2 -bottom-10 font-black italic text-[230px] leading-none tabular-nums select-none pointer-events-none z-0"
              style={{ color: 'rgba(11,42,91,0.07)' }}
            >
              {playerNumber}
            </span>

            <div className="relative z-10 flex flex-col g3-stagger">
              {/* Бейдж события */}
              <div className="flex items-center gap-3 mb-4">
                <div className="px-5 py-2" style={{ backgroundColor: isGoal ? accent : C.hot, clipPath: blade(12) }}>
                  <span className="font-black uppercase tracking-[0.3em] text-[15px] leading-none" style={{ color: C.white }}>
                    {isGoal ? 'ГОЛ' : 'ШТРАФ'}
                  </span>
                </div>
                {strengthLabel && (
                  <div className="px-4 py-2" style={{ backgroundColor: C.navy2, clipPath: blade(10) }}>
                    <span className="font-black uppercase tracking-[0.22em] text-[11px] leading-none" style={{ color: C.blue }}>
                      {strengthLabel}
                    </span>
                  </div>
                )}
              </div>

              {/* Фамилия */}
              <span className="font-black uppercase text-[52px] leading-[0.92] tracking-[-0.01em] break-words" style={{ color: C.deep }}>
                {overlay.data.primary_last_name}
              </span>

              {/* Имя */}
              <span className="font-bold uppercase text-[22px] tracking-[0.16em] leading-none mt-2.5" style={{ color: C.slate }}>
                {overlay.data.primary_first_name}
              </span>

              {/* Разделитель */}
              <div className="h-[3px] w-full mt-5 mb-4" style={{ backgroundColor: 'rgba(11,42,91,0.16)' }} />

              {/* Детали */}
              {isGoal ? (
                assists.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="font-black uppercase tracking-[0.3em] text-[10px]" style={{ color: C.blueDk }}>ПЕРЕДАЧИ</span>
                    <span className="font-black uppercase tracking-[0.06em] text-[21px] leading-tight" style={{ color: C.deep }}>
                      {assists.join(' • ')}
                    </span>
                  </div>
                ) : (
                  <span className="font-black uppercase tracking-[0.22em] text-[13px]" style={{ color: C.slate }}>БЕЗ АССИСТЕНТОВ</span>
                )
              ) : (
                <div className="flex items-center gap-4">
                  <div className="px-4 py-2 flex items-baseline gap-1.5" style={{ backgroundColor: C.hot, clipPath: blade(10) }}>
                    <span className="font-mono font-black text-[30px] tabular-nums leading-none" style={{ color: C.white }}>
                      {overlay.data.penalty_minutes}
                    </span>
                    <span className="font-black uppercase text-[13px] tracking-[0.18em]" style={{ color: C.white }}>МИН</span>
                  </div>
                  <span className="font-black uppercase tracking-[0.1em] text-[15px] leading-tight flex-1" style={{ color: C.deep }}>
                    {overlay.data.penalty_violation}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}
