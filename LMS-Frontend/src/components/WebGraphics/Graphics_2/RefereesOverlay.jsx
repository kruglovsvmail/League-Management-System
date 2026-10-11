// src/components/WebGraphics/Graphics_2/RefereesOverlay.jsx
//
// Судьи матча: главные и линейные двумя колонками, с фото. Уходит сам через
// displayDuration секунд.
import React from 'react';
import { LowerThird, Kicker, Photo, useTimedVisible } from './kit';
import { C, officialsOf } from './theme';

function Column({ title, people, delay }) {
  return (
    <div style={{ minWidth: 250 }}>
      <div className="g2-rise" style={{ '--d': `${delay}ms`, paddingBottom: 10, marginBottom: 14, borderBottom: `1px solid ${C.divider}` }}>
        <Kicker size={16} color={C.accentSoft}>{title}</Kicker>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {people.map((p, i) => (
          <div key={p.id || i} className="g2-slide" style={{ '--d': `${delay + 80 + i * 90}ms`, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Photo url={p.avatar_url} style={{ width: 46, height: 46, borderRadius: 12, boxShadow: `inset 0 0 0 1px ${C.rim}` }} />
            <div style={{ whiteSpace: 'nowrap', lineHeight: 1.05 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: C.text, textTransform: 'uppercase' }}>{p.last_name}</span>
              <span style={{ fontSize: 20, fontWeight: 600, color: C.main, marginLeft: 10 }}>{p.first_name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RefereesOverlay({ game, overlay }) {
  const globalVisible = overlay.visible && overlay.type === 'referees';
  const on = useTimedVisible(globalVisible, overlay.data?.displayDuration, overlay.data);
  const { heads, linesmen } = officialsOf(game);
  if (!game || (!heads.length && !linesmen.length)) return null;

  return (
    <LowerThird visible={on} icon="whistle">
      <div style={{ display: 'flex', gap: 56 }}>
        {heads.length > 0 && <Column title={heads.length > 1 ? 'Главные судьи' : 'Главный судья'} people={heads} delay={240} />}
        {linesmen.length > 0 && <Column title={linesmen.length > 1 ? 'Линейные судьи' : 'Линейный судья'} people={linesmen} delay={320} />}
      </div>
    </LowerThird>
  );
}
