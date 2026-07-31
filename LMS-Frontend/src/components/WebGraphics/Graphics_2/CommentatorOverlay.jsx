import React, { useState, useEffect } from 'react';
import { Cut } from './Cut';
import { Card, PersonTile } from './Stage';
import { Tri } from './Shards';
import { Cap, Kicker } from './Type';
import { S, pickOfficial } from './theme';

// Комментаторы: графитовая плашка у левой кромки снизу, портреты со срезанным
// углом и жёлтой подложкой.
//
// Ключи ролей в публичном эндпоинте — 'commentator-1' / 'commentator-2'
// (см. getPublicGameById). Дефолтная плашка ищет officials.media, которого в
// ответе нет, поэтому у неё этот оверлей не появляется вообще.
export default function CommentatorOverlay({ game, overlay }) {
  const isGlobalVisible = overlay.visible && overlay.type === 'commentator';
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

  const first = pickOfficial(game.officials, 'commentator-1', 'media');
  const second = pickOfficial(game.officials, 'commentator-2');
  const people = [first, second].filter(Boolean);
  if (people.length === 0) return null;

  const wide = people.length > 1;

  return (
    <Cut isVisible={localVisible} variant="slide" className="absolute bottom-16 left-0 z-40">
      <Card style={{ width: wide ? 1040 : 760 }} seed={33}>
        <div className="pl-11 pr-12 py-8">
          <div className="flex items-center gap-4 mb-7">
            <Kicker size={12}>{wide ? 'КОММЕНТАТОРЫ МАТЧА' : 'КОММЕНТАТОР МАТЧА'}</Kicker>
            <div className="flex-1 h-[2px]" style={{ backgroundColor: S.line }} />
            <div className="flex items-center gap-3 px-4 py-2" style={{ backgroundColor: S.red, clipPath: 'polygon(0 0, 100% 0, calc(100% - 12px) 100%, 0 100%)' }}>
              <Tri size={10} color={S.white} className="g2-blink" />
              <Cap size={11} color={S.white} tracking="0.24em">В ЭФИРЕ</Cap>
            </div>
          </div>

          <div className="flex items-center gap-11 min-w-0">
            <PersonTile person={first} role="ВЕДЁТ РЕПОРТАЖ" size={104} nameSize={29} />
            {second && <div className="w-[2px] h-[78px] shrink-0" style={{ backgroundColor: S.line }} />}
            {second && <PersonTile person={second} role="ВЕДЁТ РЕПОРТАЖ" size={104} nameSize={29} />}
          </div>
        </div>
      </Card>
    </Cut>
  );
}
