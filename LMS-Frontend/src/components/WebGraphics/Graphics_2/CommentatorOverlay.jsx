import React, { useState, useEffect } from 'react';
import { Reveal } from './Reveal';
import { LowerBand, PersonTile, BandDivider } from './LowerBand';
import { MicIcon } from './IcePattern';
import { C, pickOfficial } from './theme';

// Комментаторы: лента во всю ширину внизу, с ФОТОГРАФИЯМИ (avatar_url приходит
// с сервера, дефолтная графика его не показывает) и обоими комментаторами сразу.
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

  return (
    <Reveal isVisible={localVisible} variant="band" className="absolute bottom-0 left-0 z-40">
      <LowerBand icon={<MicIcon size={52} />} label={people.length > 1 ? 'КОММЕНТАТОРЫ\nМАТЧА' : 'КОММЕНТАТОР\nМАТЧА'}>
        <div className="flex items-center gap-12 w-full min-w-0">
          <PersonTile person={first} role="ВЕДЁТ РЕПОРТАЖ" wide />
          {second && <BandDivider />}
          {second && <PersonTile person={second} role="ВЕДЁТ РЕПОРТАЖ" wide />}

          <div className="flex-1" />

          {/* Индикатор прямого эфира */}
          <div className="flex items-center gap-3.5 shrink-0 pl-10" style={{ borderLeft: `1px solid ${C.line}` }}>
            <div className="w-3.5 h-3.5 rotate-45 g3-blink" style={{ backgroundColor: C.hot }} />
            <span className="font-black uppercase tracking-[0.3em] text-[15px]" style={{ color: C.ice }}>
              В ЭФИРЕ
            </span>
          </div>
        </div>
      </LowerBand>
    </Reveal>
  );
}
