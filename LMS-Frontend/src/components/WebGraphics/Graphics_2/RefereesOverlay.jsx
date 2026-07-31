import React, { useState, useEffect } from 'react';
import { Cut } from './Cut';
import { Card, PersonTile } from './Stage';
import { Kicker } from './Type';
import { S, pickOfficial } from './theme';

// Судейская бригада: графитовая плашка у левой кромки снизу, четыре судьи
// сеткой 2×2 с портретами со срезанным углом.
//
// Ключи ролей в публичном эндпоинте — 'main-1'/'main-2'/'linesman-1'/'linesman-2'
// (см. getPublicGameById). Дефолтная плашка ищет head_1/linesman_1, которых в
// ответе нет, поэтому у неё этот оверлей не появляется вообще.
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
    <Cut isVisible={localVisible} variant="slide" className="absolute bottom-16 left-0 z-40">
      <Card style={{ width: twoCols ? 1060 : 740 }} seed={35}>
        <div className="pl-11 pr-12 py-8">
          <div className="flex items-center gap-4 mb-7">
            <Kicker size={12}>СУДЕЙСКАЯ БРИГАДА МАТЧА</Kicker>
            <div className="flex-1 h-[2px]" style={{ backgroundColor: S.line }} />
          </div>

          <div
            className="grid gap-x-12 gap-y-7"
            style={{ gridTemplateColumns: twoCols ? 'repeat(2, minmax(0, 1fr))' : '1fr' }}
          >
            {crew.map((c, i) => (
              <PersonTile key={i} person={c.person} role={c.role} size={92} nameSize={25} />
            ))}
          </div>
        </div>
      </Card>
    </Cut>
  );
}
