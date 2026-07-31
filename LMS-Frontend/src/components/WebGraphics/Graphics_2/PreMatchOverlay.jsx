// src/components/WebGraphics/Graphics_2/PreMatchOverlay.jsx
//
// Предматч во весь кадр: эмблемы команд по краям, жёлтое «VS» в точке схода,
// внизу жёлтая плита обратного отсчёта с тёмными цифрами.
import React, { useState, useEffect } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { Cut } from './Cut';
import { Stage } from './Stage';
import { RippleField } from './RippleField';
import { ShardField, ShardBurst, Halftone, Bar } from './Shards';
import { Big, Num, Cap, Tag } from './Type';
import { S, SHARD_PALETTE, drop } from './theme';

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
  const homeColor = game.home_color_1 || S.yellow;
  const awayColor = game.away_color_1 || S.white;

  const isPaused = !!overlay.data?.isPaused;
  const isHot = timeLeft <= 60 && !isPaused;

  const TeamBlock = ({ logo, name, short, color, style }) => (
    <div className="absolute w-[540px] flex flex-col items-center g2-seq" style={style}>
      <div className="relative">
        <RippleField size={380} />
        {logo && (
          <img
            src={logo} alt={name}
            className="relative z-10 w-[228px] h-[228px] object-contain"
            style={{
              transform: 'scale(calc(1 + var(--audio-beat, 0) * 0.09 + var(--audio-pulse, 0) * 0.045))',
              willChange: 'transform',
              filter: 'drop-shadow(0 16px 30px rgba(0,0,0,0.6))',
            }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
      </div>

      <div className="mt-5">
        <Tag bg={color} color={S.coalDeep} size={12}>{short}</Tag>
      </div>

      <div className="mt-5 w-full text-center">
        <Big size={44} color={S.white} className="line-clamp-2">{name}</Big>
      </div>
    </div>
  );

  return (
    <Cut isVisible={isVisible} variant="split" className="absolute inset-0 z-50">
      <Stage game={game} kicker="ПРЯМАЯ ТРАНСЛЯЦИЯ" title="НАЧАЛО МАТЧА">
        <div className="relative w-full h-full">

          <TeamBlock logo={homeLogo} name={game.home_team_name} short={game.home_short_name || 'ХОЗЯЕВА'}
                     color={homeColor} style={{ left: 150, top: 18 }} />
          <TeamBlock logo={awayLogo} name={game.away_team_name} short={game.away_short_name || 'ГОСТИ'}
                     color={awayColor} style={{ right: 150, top: 18 }} />

          {/* VS в точке схода */}
          <div className="absolute left-1/2 -translate-x-1/2 top-[86px] flex flex-col items-center z-20">
            <ShardBurst size={340} seed={41} palette={[S.coalSoft, S.line, S.yellowDeep]}
                        className="left-1/2 top-1/2" style={{ transform: 'translate(-50%,-50%)' }} />
            <div className="relative z-10">
              <Big size={116} color={S.yellow}>VS</Big>
            </div>
            <Bar w={90} h={10} color={S.white} className="mt-7" />
          </div>

          {/* Обратный отсчёт — жёлтая плита */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-[26px] z-30" style={{ filter: drop('xl') }}>
            <div
              className="relative overflow-hidden flex items-center justify-between px-14"
              style={{
                width: 860, height: 182, backgroundColor: S.yellow,
                clipPath: 'polygon(0 0, 100% 0, calc(100% - 30px) 100%, 0 100%)',
              }}
            >
              <Halftone color="rgba(43,43,43,0.14)" cell={10} dot={1.5} fade="to right" opacity={0.9} />
              <ShardField
                count={10} seed={43} origin={[104, 100]} dir={-140} spread={60} reach={60} size={22}
                palette={SHARD_PALETTE.onYellow} opacity={0.5}
                className="right-0 bottom-0 w-[40%] h-full"
              />
              <div className="g2-gleam z-20" style={{ left: '-40%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)' }} />

              <div className="flex flex-col gap-4 relative z-10">
                <Cap size={13} color={S.coalDeep} tracking="0.34em">ДО НАЧАЛА МАТЧА</Cap>
                <Cap size={13} color="rgba(43,43,43,0.62)" tracking="0.22em">
                  {isPaused ? 'ОТСЧЁТ ПРИОСТАНОВЛЕН' : 'ТРАНСЛЯЦИЯ НАЧНЁТСЯ АВТОМАТИЧЕСКИ'}
                </Cap>
              </div>

              <span className={`relative z-10 ${isHot ? 'g2-blink' : ''}`}>
                <Num size={124} color={isHot ? S.red : S.coalDeep}>{formatCountdown(timeLeft)}</Num>
              </span>
            </div>
          </div>

        </div>
      </Stage>
    </Cut>
  );
}
