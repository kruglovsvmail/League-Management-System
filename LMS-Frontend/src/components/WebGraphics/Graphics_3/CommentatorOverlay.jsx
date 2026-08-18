import React, { useState, useEffect } from 'react';
import { Reveal } from './Reveal';
import { InfoCard, PlateIcon, Portrait, PersonName, Rule } from './Frost';
import { Label } from './Type';
import { T, pickOfficial } from './theme';

// Комментаторы: светлая плашка у левой кромки снизу, круглые портреты в
// серебряных кольцах.
//
// Ключи ролей в публичном эндпоинте — 'commentator-1' / 'commentator-2'
// (см. getPublicGameById). Прежняя версия этой плашки искала officials.media,
// которого в ответе нет, из-за чего она не появлялась в эфире вообще.

// На уровне модуля, а не внутри плашки: вложенный компонент React считал бы
// новым типом на каждом рендере и перемонтировал бы поддерево.
function LiveTag() {
  return (
    <div
      className="flex items-center gap-2 px-3.5 py-1.5 rounded-full shrink-0"
      style={{ backgroundColor: T.danger }}
    >
      <div className="rounded-full g3-breathe" style={{ width: 8, height: 8, backgroundColor: T.white }} />
      <Label size={11} color={T.white} tracking="0.22em" weight={800}>В ЭФИРЕ</Label>
    </div>
  );
}

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
    <Reveal isVisible={localVisible} variant="slide" className="absolute bottom-16 left-12 z-40">
      <InfoCard
        icon={<PlateIcon name="mic" />}
        label={wide ? 'КОММЕНТАТОРЫ МАТЧА' : 'КОММЕНТАТОР МАТЧА'}
        right={<LiveTag />}
        style={{ width: wide ? 800 : 570 }}
      >
        <div className="flex items-center gap-8 min-w-0">
          <div className="flex items-center gap-5 min-w-0">
            <Portrait person={first} size={86} ring={4} />
            <PersonName person={first} size={25} />
          </div>

          {second && <Rule vertical tone="silver" style={{ height: 70 }} />}

          {second && (
            <div className="flex items-center gap-5 min-w-0">
              <Portrait person={second} size={86} ring={4} />
              <PersonName person={second} size={25} />
            </div>
          )}
        </div>
      </InfoCard>
    </Reveal>
  );
}
