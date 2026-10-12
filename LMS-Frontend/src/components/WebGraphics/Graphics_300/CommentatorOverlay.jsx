// src/components/WebGraphics/defaultGraphics/CommentatorOverlay.jsx
//
// Комментатор (или двое) — нижний титр слева с фото. Уходит сам через
// displayDuration секунд.
import React from 'react';
import { LowerThird, Kicker, Photo, useTimedVisible } from './kit';
import { C, officialsOf } from './theme';

export default function CommentatorOverlay({ game, overlay }) {
  const globalVisible = overlay.visible && overlay.type === 'commentator';
  const on = useTimedVisible(globalVisible, overlay.data?.displayDuration, overlay.data);
  const people = officialsOf(game).commentators;
  if (!game || !people.length) return null;

  return (
    <LowerThird visible={on} icon="mic">
      <div>
        <div className="g2-rise" style={{ '--d': '240ms' }}>
          <Kicker size={16} color={C.accentSoft}>{people.length > 1 ? 'Комментаторы матча' : 'Комментатор матча'}</Kicker>
        </div>
        <div style={{ display: 'flex', gap: 34, marginTop: 14 }}>
          {people.map((p, i) => (
            <div key={p.id || i} className="g2-slide" style={{ '--d': `${300 + i * 120}ms`, display: 'flex', alignItems: 'center', gap: 16 }}>
              <Photo url={p.avatar_url} style={{ width: 62, height: 62, borderRadius: 16, boxShadow: `inset 0 0 0 1px ${C.rim}` }} />
              <div style={{ lineHeight: 1.05, whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: C.text, textTransform: 'uppercase' }}>{p.last_name}</div>
                <div style={{ fontSize: 21, fontWeight: 600, color: C.main, marginTop: 4 }}>{p.first_name}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </LowerThird>
  );
}
