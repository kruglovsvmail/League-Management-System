// src/components/WebGraphics/Graphics_3/PreMatchOverlay.jsx
//
// Предматч: панель поверх картинки. Эмблемы команд в серебряных кольцах по
// краям, между ними тёмная «шайба» с VS, внизу плита обратного отсчёта.
import React, { useState, useEffect } from 'react';
import { Reveal } from './Reveal';
import { Stage, PAD_X } from './Rink';
import { Glass, Dark, Crest } from './Frost';
import { RippleField } from './RippleField';
import { Display, Head, Num, Label, Pill } from './Type';
import { T, R, formatClock } from './theme';

// ВАЖНО: компонент объявлен НА УРОВНЕ МОДУЛЯ, а не внутри PreMatchOverlay.
// Внутри он пересоздавался бы на каждый тик отсчёта, React считал бы его новым
// типом и перемонтировал поддерево — эмблемы команд перезагружались бы раз в
// секунду, а canvas волн начинал бы жизнь заново и не успевал ничего показать.
function TeamBlock({ logo, name, short, color, style }) {
  return (
    <div className="absolute w-[520px] flex flex-col items-center g3-seq" style={style}>
      <div className="relative">
        {/* Круги по льду под интро — см. RippleField.jsx */}
        <RippleField size={420} />
        <Crest logo={logo} size={224} accent={color} />
      </div>

      <div className="mt-7">
        <Pill size={12} bg={color} color={T.white} border={color}>{short}</Pill>
      </div>

      <div className="mt-5 w-full text-center">
        <Display size={40}>{name}</Display>
      </div>
    </div>
  );
}

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

  const homeColor = game.home_color_1 || T.acc;
  const awayColor = game.away_color_1 || T.head;

  const isPaused = !!overlay.data?.isPaused;
  const isHot = timeLeft <= 60 && !isPaused;

  return (
    <Reveal isVisible={isVisible} variant="full" className="absolute inset-0 z-50">
      <Stage game={game} title="НАЧАЛО МАТЧА">
        <div className="relative w-full h-full">

          <TeamBlock
            logo={game.home_team_logo} name={game.home_team_name}
            short={game.home_short_name || 'ХОЗЯЕВА'} color={homeColor}
            style={{ left: PAD_X + 20, top: 4 }}
          />
          <TeamBlock
            logo={game.away_team_logo} name={game.away_team_name}
            short={game.away_short_name || 'ГОСТИ'} color={awayColor}
            style={{ right: PAD_X + 20, top: 4 }}
          />

          {/* Тёмная «шайба» с VS в точке схода */}
          <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ top: 62 }}>
            <Dark radius={R.pill} style={{ width: 168, height: 168 }}>
              <div className="w-full h-full flex flex-col items-center justify-center">
                <Display size={52} color={T.white}>VS</Display>
                <div className="flex items-center gap-2 mt-3">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="rounded-full" style={{ width: 6, height: 6, backgroundColor: i === 1 ? T.white : T.accOnDark }} />
                  ))}
                </div>
              </div>
            </Dark>
          </div>

          {/* Обратный отсчёт */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-30" style={{ width: 880 }}>
            <Glass over="scene" radius={R.card} style={{ height: 164 }}>
              <div className="h-full flex items-center justify-between px-12">
                <div className="flex flex-col gap-3.5">
                  <Label size={12} color={T.acc} tracking="0.3em" weight={800}>ДО НАЧАЛА МАТЧА</Label>
                  <Head size={17} color={T.label} weight={700} tracking="0.1em">
                    {isPaused ? 'ОТСЧЁТ ПРИОСТАНОВЛЕН' : 'ТРАНСЛЯЦИЯ НАЧНЁТСЯ АВТОМАТИЧЕСКИ'}
                  </Head>
                </div>

                <span className={isHot ? 'g3-breathe' : ''}>
                  <Num size={106} color={isHot ? T.danger : T.head}>{formatClock(timeLeft)}</Num>
                </span>
              </div>
            </Glass>
          </div>

        </div>
      </Stage>
    </Reveal>
  );
}
