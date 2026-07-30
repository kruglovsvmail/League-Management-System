import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { C, cut } from './theme';
import { Hatch, DiagonalBars, DiagonalMarquee, Snowfall, Snowflake } from './IcePattern';

// Каркас полноэкранных плашек лиги 3.
//
// Дефолтная графика центрирует коробку 1500×~700 со скруглением 70px и полями p-20;
// здесь плашка занимает ВЕСЬ кадр 1920×1080 встык, без полей и скруглений, и делится
// на три жёстких горизонтальных пояса: верхняя рейка бренда, поле, нижняя рейка.
// В рейках живут данные, которых в дефолте нет вообще — логотип и название лиги,
// логотип и название дивизиона, стадия и номер тура.

// tone: 'light' — на светлой плите (тёмный текст), 'dark' — на синей ленте.
export function LeagueMark({ game, compact = false, tone = 'light' }) {
  const logo = getSafeUrl(game?.league_logo);
  const name = game?.league_name;
  if (!logo && !name) return null;

  const isLight = tone === 'light';
  return (
    <div className="flex items-center gap-5 relative z-10">
      {logo && (
        <img
          src={logo}
          alt=""
          className={compact ? 'w-12 h-12 object-contain' : 'w-[74px] h-[74px] object-contain'}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      )}
      {name && (
        <div className="flex flex-col">
          <span
            className="font-black uppercase leading-[1.1] max-w-[560px]"
            style={{ color: isLight ? C.deep : C.ice, fontSize: compact ? 15 : 19, letterSpacing: '0.04em' }}
          >
            {name}
          </span>
          {!compact && (
            <span className="font-bold uppercase tracking-[0.34em] mt-1" style={{ color: isLight ? C.blueDk : C.blue, fontSize: 11 }}>
              ХОККЕЙ • ТЮМЕНЬ
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function DivisionChip({ game, tone = 'dark' }) {
  const logo = getSafeUrl(game?.division_logo);
  const name = game?.division_name || game?.division_short_name;
  if (!name && !logo) return null;

  const isDark = tone === 'dark';
  return (
    <div
      className="flex items-center gap-3 px-5 py-2.5"
      style={{ backgroundColor: isDark ? C.navy2 : C.ice, clipPath: cut(14, 0, 14, 0) }}
    >
      {logo && <img src={logo} alt="" className="w-7 h-7 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />}
      <span
        className="font-black uppercase tracking-[0.2em] text-[14px] leading-none"
        style={{ color: isDark ? C.ice : C.deep }}
      >
        {name}
      </span>
    </div>
  );
}

// Стадия и номер тура/матча — берём из g.stage_type / stage_label / series_number.
export function stageText(game) {
  if (!game) return '';
  const isPlayoff = game.stage_type === 'playoff';
  const stage = game.stage_label ? String(game.stage_label).toUpperCase() : (isPlayoff ? 'ПЛЕЙ-ОФФ' : 'РЕГУЛЯРНЫЙ ЧЕМПИОНАТ');
  const num = isPlayoff ? `МАТЧ № ${game.series_number || 1}` : `ТУР ${game.series_number || 1}`;
  return `${stage} • ${num}`;
}

export function TopRail({ game, title }) {
  return (
    <div className="h-[112px] shrink-0 flex items-stretch relative z-20" style={{ backgroundColor: C.navy2 }}>
      <Hatch color="rgba(255,255,255,0.045)" step={24} drift />

      {/* Светлая плита с брендом лиги — главный «ледяной» акцент кадра */}
      <div
        className="flex items-center pl-14 pr-20 relative"
        style={{ backgroundColor: C.ice, clipPath: 'polygon(0 0, 100% 0, calc(100% - 56px) 100%, 0 100%)' }}
      >
        <div className="g3-gleam g3-gleam-dark" style={{ left: '-60%' }} />
        <LeagueMark game={game} />
      </div>

      <div className="flex-1 flex items-center justify-between pl-10 pr-14 relative z-10">
        <span className="font-black uppercase tracking-[0.26em] text-[30px] leading-none" style={{ color: C.white }}>
          {title}
        </span>
        <div className="flex items-center gap-5">
          <span className="font-bold uppercase tracking-[0.24em] text-[13px]" style={{ color: C.blue }}>
            {stageText(game)}
          </span>
          <DivisionChip game={game} tone="light" />
        </div>
      </div>

      {/* Нижняя кромка рейки — фирменная синяя линия */}
      <div className="absolute left-0 right-0 bottom-0 h-[5px] z-20" style={{ backgroundColor: C.blue }} />
    </div>
  );
}

export function BottomRail({ game, extra }) {
  const dateObj = game?.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase() : 'ДАТА НЕ УКАЗАНА';
  const city = game?.arena_city ? game.arena_city.toUpperCase() : 'ГОРОД НЕ УКАЗАН';
  const arena = (game?.arena_name || game?.location_text || 'ЛЕДОВАЯ АРЕНА').toUpperCase();

  const Cell = ({ label, value, muted, align = 'left' }) => (
    <div className={`flex flex-col gap-1.5 ${align === 'right' ? 'items-end' : align === 'center' ? 'items-center' : 'items-start'}`}>
      <span className="font-black uppercase tracking-[0.32em] text-[10px]" style={{ color: C.blue }}>{label}</span>
      <span className="font-bold uppercase tracking-[0.16em] text-[19px] leading-none" style={{ color: muted ? C.steel : C.ice }}>
        {value}
      </span>
    </div>
  );

  return (
    <div className="h-[96px] shrink-0 flex items-center justify-between px-14 relative z-20" style={{ backgroundColor: C.deep }}>
      <Hatch color="rgba(255,255,255,0.03)" step={28} />
      <div className="absolute left-0 right-0 top-0 h-[5px]" style={{ backgroundColor: C.blue }} />

      <div className="relative z-10"><Cell label="ДАТА" value={dateStr} muted={!dateObj} /></div>
      <div className="relative z-10"><Cell label="ГОРОД" value={city} muted={!game?.arena_city} align="center" /></div>
      <div className="relative z-10"><Cell label="АРЕНА" value={arena} muted={!(game?.arena_name || game?.location_text)} align="right" /></div>

      {extra}
    </div>
  );
}

// Полноэкранный каркас: фон паттерна + верхняя рейка + поле + нижняя рейка.
export function FullFrame({ game, title, children, showBottom = true, marquee = true, bars = true, snow = true }) {
  return (
    <div className="w-[1920px] h-[1080px] flex flex-col relative overflow-hidden" style={{ backgroundColor: C.navy }}>
      <Hatch color="rgba(255,255,255,0.035)" step={34} />
      {bars && <DiagonalBars opacity={0.5} />}
      {marquee && (
        <DiagonalMarquee texts={[game?.league_name, game?.home_team_name, game?.division_name, game?.away_team_name]} />
      )}
      {snow && <Snowfall count={22} fallHeight={1080} className="z-[2]" />}

      <Snowflake
        size={520} color={C.blue} strokeWidth={0.8}
        className="absolute -left-40 -bottom-40 pointer-events-none z-[1]"
        style={{ opacity: 0.07, animation: 'g3Spin 120s linear infinite' }}
      />

      <TopRail game={game} title={title} />
      <div className="flex-1 relative z-10 flex flex-col min-h-0">{children}</div>
      {showBottom && <BottomRail game={game} />}
    </div>
  );
}
