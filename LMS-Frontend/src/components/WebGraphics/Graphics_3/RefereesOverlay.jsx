import React, { useState, useEffect } from 'react';
import { Reveal } from './Reveal';
import { InfoCard, PlateIcon, Portrait, PersonName } from './Frost';
import { Label } from './Type';
import { T, pickOfficial } from './theme';

// Судейская бригада: светлая плашка у левой кромки снизу, до четырёх судей
// сеткой 2×2 с круглыми портретами.
//
// Ключи ролей в публичном эндпоинте — 'main-1'/'main-2'/'linesman-1'/'linesman-2'
// (см. getPublicGameById). Прежняя версия искала head_1/linesman_1, которых в
// ответе нет, из-за чего плашка не появлялась в эфире вообще.

export default function RefereesOverlay({ game, overlay }) {
  const isGlobalVisible = overlay.visible && overlay.type === 'referees';
  const [localVisible, setLocalVisible] = useState(false);
  const displayDuration = overlay.data?.displayDuration || 10;

  useEffect(() => {
    let timer;
    if (isGlobalVisible) {
      setLocalVisible(true);
      timer = setTimeout(() => setLocalVisible(false), displayDuration * 1000);
    } else {
      setLocalVisible(false);
    }
    return () => clearTimeout(timer);
  }, [isGlobalVisible, displayDuration, overlay.data]);

  if (!game?.officials) return null;

  const o = game.officials;
  const crew = [
    { person: pickOfficial(o, 'main-1', 'head_1'), role: 'ГЛАВНЫЙ СУДЬЯ' },
    { person: pickOfficial(o, 'main-2', 'head_2'), role: 'ГЛАВНЫЙ СУДЬЯ' },
    { person: pickOfficial(o, 'linesman-1', 'linesman_1'), role: 'ЛИНЕЙНЫЙ СУДЬЯ' },
    { person: pickOfficial(o, 'linesman-2', 'linesman_2'), role: 'ЛИНЕЙНЫЙ СУДЬЯ' },
  ].filter(x => x.person);

  if (crew.length === 0) return null;
  const twoCols = crew.length > 2;

  return (
    <Reveal isVisible={localVisible} variant="slide" className="absolute bottom-16 left-12 z-40">
      <InfoCard icon={<PlateIcon name="whistle" />} label="СУДЕЙСКАЯ БРИГАДА МАТЧА" style={{ width: twoCols ? 880 : 570 }}>
        <div
          className="grid gap-x-11 gap-y-5"
          style={{ gridTemplateColumns: twoCols ? 'repeat(2, minmax(0, 1fr))' : '1fr' }}
        >
          {crew.map((c, i) => (
            <div key={i} className="flex items-center gap-5 min-w-0">
              <Portrait person={c.person} size={76} ring={4} />
              <div className="flex flex-col min-w-0">
                <Label size={9} color={T.acc} tracking="0.26em" weight={800} className="mb-2">{c.role}</Label>
                <PersonName person={c.person} size={22} />
              </div>
            </div>
          ))}
        </div>
      </InfoCard>
    </Reveal>
  );
}
