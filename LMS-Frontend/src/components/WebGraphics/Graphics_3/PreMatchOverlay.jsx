import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';
import { BigPlate } from './BigPlate';
import { DiagonalTicker, DiagonalStripes, Snowfall, Snowflake } from './IceDecor';
import { RippleField } from './RippleField';
import { TFH, cut } from './theme';

const BODY_H = 560;

export default function PreMatchOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'prematch';
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!isVisible || !overlay.data) return;

    if (overlay.data.isPaused) {
       setTimeLeft(overlay.data.timeLeft || 0);
       return;
    }

    if (overlay.data.endTime) {
       const updateTimer = () => {
          setTimeLeft(Math.max(0, Math.floor((overlay.data.endTime - Date.now()) / 1000)));
       };
       updateTimer();
       const interval = setInterval(updateTimer, 1000);
       return () => clearInterval(interval);
    }
  }, [isVisible, overlay.data]);

  if (!game) return null;

  const formatCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sc = ('0' + (s % 60)).slice(-2);
    return `${m}:${sc}`;
  };

  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);

  const homeColor = game.home_color_1 || TFH.blue;
  const awayColor = game.away_color_1 || TFH.ice;

  // Определяем стадию и номер матча
  const isPlayoff = game.stage_type === 'playoff';
  const stageLabel = game.stage_label ? game.stage_label.toUpperCase() : (isPlayoff ? 'РАУНД' : 'РЕГУЛЯРНЫЙ ЧЕМПИОНАТ');
  const matchNumberText = isPlayoff
    ? `МАТЧ № ${game.series_number || 1}`
    : `ТУР ${game.series_number || 1}`;

  const isHot = timeLeft <= 60 && !overlay.data?.isPaused;

  const TeamSide = ({ logo, name, color }) => (
    <div className="w-[37%] flex items-center justify-center relative overflow-hidden">
      {logo && (
        <img src={logo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.22] blur-2xl scale-[160%] z-0 pointer-events-none" />
      )}
      <DiagonalStripes color="rgba(255,255,255,0.035)" step={30} />

      <div className="flex flex-col items-center z-10 px-10 w-full text-center">
        {logo && (
          <div className="relative mb-9">
            {/* Гранёные кольца под интро — независимые вспышки на бас/средние/высокие */}
            <RippleField size={480} />
            <img
              src={logo}
              alt={name}
              className="relative z-10 w-60 h-60 object-contain drop-shadow-[0_18px_34px_rgba(0,0,0,0.85)]"
              style={{ transform: 'scale(calc(1 + var(--audio-beat, 0) * 0.10 + var(--audio-pulse, 0) * 0.05))', willChange: 'transform' }}
              onError={(e) => e.target.style.display = 'none'}
            />
          </div>
        )}

        <div className="w-full flex justify-center px-2">
          <span className="text-[46px] font-black uppercase tracking-tight leading-[0.95] w-full line-clamp-2" style={{ color: TFH.white }}>
            {name}
          </span>
        </div>

        {/* Акцент в цвете команды — срезанная под 45° планка */}
        <div
          className="h-[7px] w-[190px] mt-6"
          style={{ backgroundColor: color, clipPath: cut(0, 7, 0, 7) }}
        />
      </div>
    </div>
  );

  return (
    <AnimationWrapper
      type="prematch"
      isVisible={isVisible}
      className="absolute inset-0 flex items-center justify-center z-50 p-20"
    >
      <BigPlate title={`${stageLabel} • ${matchNumberText}`} game={game}>
        <div className="flex w-full relative z-0 overflow-hidden" style={{ height: BODY_H, backgroundColor: TFH.navy }}>
          <DiagonalTicker texts={[game.league_name, game.home_short_name, game.away_short_name, game.division_name, game.home_team_name, game.away_team_name]} />
          <Snowfall count={16} fallHeight={BODY_H} />

          <TeamSide logo={homeLogo} name={game.home_team_name} color={homeColor} />

          {/* ЦЕНТР: обратный отсчёт */}
          <div className="w-[26%] flex items-center justify-center relative z-10 px-3">
            <div
              className="flex flex-col items-center justify-center w-full h-full relative overflow-hidden"
              style={{ backgroundColor: TFH.navyDeep, clipPath: cut(52, 0, 52, 0) }}
            >
              <DiagonalStripes color="rgba(41,169,225,0.07)" step={26} drift />
              <Snowflake
                size={230}
                color={TFH.blue}
                strokeWidth={0.9}
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ opacity: 0.1, animation: 'tfhSpin 60s linear infinite' }}
              />

              <span className="text-[12px] font-black uppercase tracking-[0.3em] mb-5 z-10" style={{ color: TFH.blue }}>
                ДО НАЧАЛА МАТЧА
              </span>

              <span
                className={`font-mono text-[86px] font-black tabular-nums tracking-tighter leading-none z-10 transition-colors ${isHot ? 'tfh-breathe' : ''}`}
                style={{ color: isHot ? '#FF6B6B' : TFH.white }}
              >
                {formatCountdown(timeLeft)}
              </span>

              <div className="flex items-center gap-3 mt-7 z-10">
                <div className="w-2 h-2 rotate-45" style={{ backgroundColor: TFH.blue }} />
                <div className="w-2 h-2 rotate-45" style={{ backgroundColor: TFH.blueSoft }} />
                <div className="w-2 h-2 rotate-45" style={{ backgroundColor: TFH.blue }} />
              </div>
            </div>
          </div>

          <TeamSide logo={awayLogo} name={game.away_team_name} color={awayColor} />
        </div>
      </BigPlate>
    </AnimationWrapper>
  );
}
