// src/components/WebGraphics/Graphics_3/PreMatchOverlay.jsx
//
// Предматч на ВЕСЬ кадр 1920×1080 без полей и скруглений.
// Дефолт: центрированная коробка 1500px, три вертикальные колонки «команда | таймер | команда».
// Здесь: команды разнесены по верхним углам, между ними — ледяной ромб с логотипом лиги,
// обратный отсчёт вынесен вниз на широкую светлую плиту, всё поле прошито диагоналями 45°.
import React, { useState, useEffect } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { Reveal } from './Reveal';
import { FullFrame } from './Frame';
import { RippleField } from './RippleField';
import { Hatch, Snowflake } from './IcePattern';
import { C, cut, blade, shadow } from './theme';

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
      const update = () => setTimeLeft(Math.max(0, Math.floor((overlay.data.endTime - Date.now()) / 1000)));
      update();
      const interval = setInterval(update, 1000);
      return () => clearInterval(interval);
    }
  }, [isVisible, overlay.data]);

  if (!game) return null;

  const formatCountdown = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  const homeLogo = getSafeUrl(game.home_team_logo);
  const awayLogo = getSafeUrl(game.away_team_logo);
  const leagueLogo = getSafeUrl(game.league_logo);

  const homeColor = game.home_color_1 || C.blueDk;
  const awayColor = game.away_color_1 || C.ice2;

  const isPaused = !!overlay.data?.isPaused;
  const isHot = timeLeft <= 60 && !isPaused;

  const TeamBlock = ({ logo, name, short, color, side }) => (
    <div
      className="absolute top-[36px] w-[600px] flex flex-col items-center"
      style={{ [side]: 120 }}
    >
      <div className="relative mb-8">
        {/* Гранёные кольца под интро — независимые вспышки на бас/средние/высокие */}
        <RippleField size={500} />
        <img
          src={logo}
          alt={name}
          className="relative z-10 w-[290px] h-[290px] object-contain drop-shadow-[0_24px_44px_rgba(0,0,0,0.85)]"
          style={{ transform: 'scale(calc(1 + var(--audio-beat, 0) * 0.10 + var(--audio-pulse, 0) * 0.05))', willChange: 'transform' }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      </div>

      {/* Короткое имя команды — крупной «ледяной» плиткой */}
      <div className="px-7 py-2 mb-4" style={{ backgroundColor: color, clipPath: blade(14) }}>
        <span className="font-black uppercase text-[22px] tracking-[0.3em] leading-none" style={{ color: C.white }}>
          {short}
        </span>
      </div>

      <span className="font-black uppercase text-[52px] leading-[0.95] tracking-tight text-center w-full line-clamp-2" style={{ color: C.white }}>
        {name}
      </span>
    </div>
  );

  return (
    <Reveal isVisible={isVisible} variant="takeover" className="absolute inset-0 z-50">
      <FullFrame game={game} title="НАЧАЛО МАТЧА">
        <div className="relative flex-1">

          <TeamBlock
            logo={homeLogo} name={game.home_team_name}
            short={game.home_short_name || 'ХОЗ'} color={homeColor} side="left"
          />
          <TeamBlock
            logo={awayLogo} name={game.away_team_name}
            short={game.away_short_name || 'ГОС'} color={awayColor} side="right"
          />

          {/* Ледяной ромб с логотипом лиги — точка схода композиции */}
          <div className="absolute left-1/2 top-[168px] -translate-x-1/2 z-20" style={{ filter: shadow('xl') }}>
            <div
              className="w-[208px] h-[208px] rotate-45 flex items-center justify-center relative overflow-hidden"
              style={{ backgroundColor: C.ice }}
            >
              <Hatch color="rgba(11,42,91,0.06)" step={18} />
              <div className="-rotate-45 flex flex-col items-center relative z-10">
                {leagueLogo ? (
                  <img src={leagueLogo} alt="" className="w-[112px] h-[112px] object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                ) : (
                  <Snowflake size={104} color={C.blueDk} strokeWidth={1.6} />
                )}
              </div>
            </div>
          </div>

          {/* Диагональные «клинья» под ромбом — связка с паттерном лиги */}
          <div className="absolute left-1/2 top-[430px] -translate-x-1/2 flex gap-3 z-20">
            {[0, 1, 2].map(i => (
              <div key={i} className="w-3.5 h-3.5 rotate-45" style={{ backgroundColor: i === 1 ? C.blue : C.navy2 }} />
            ))}
          </div>

          {/* Обратный отсчёт — широкая светлая плита у нижней кромки поля */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[34px] z-20" style={{ filter: shadow('xl') }}>
            <div
              className="w-[880px] h-[248px] flex items-center relative overflow-hidden"
              style={{ backgroundColor: C.ice, clipPath: cut(48, 0, 48, 0) }}
            >
              <Hatch color="rgba(11,42,91,0.055)" step={24} />
              <div className="g3-gleam g3-gleam-dark" style={{ left: '-60%' }} />

              <Snowflake
                size={260} color={C.blueDk} strokeWidth={0.9}
                className="absolute -left-14 -top-12 pointer-events-none"
                style={{ opacity: 0.12, animation: 'g3Spin 60s linear infinite' }}
              />

              <div className="flex items-center justify-between w-full px-16 relative z-10">
                <div className="flex flex-col gap-3">
                  <span className="font-black uppercase tracking-[0.32em] text-[15px]" style={{ color: C.blueDk }}>
                    ДО НАЧАЛА МАТЧА
                  </span>
                  <span className="font-bold uppercase tracking-[0.2em] text-[14px]" style={{ color: C.slate }}>
                    {isPaused ? 'ОТСЧЁТ ПРИОСТАНОВЛЕН' : 'ПРЯМАЯ ТРАНСЛЯЦИЯ'}
                  </span>
                </div>

                <span
                  className={`font-mono font-black text-[132px] tabular-nums leading-none tracking-tighter ${isHot ? 'g3-blink' : ''}`}
                  style={{ color: isHot ? C.hot : C.deep }}
                >
                  {formatCountdown(timeLeft)}
                </span>
              </div>
            </div>
          </div>

        </div>
      </FullFrame>
    </Reveal>
  );
}
