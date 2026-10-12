// src/components/WebGraphics/defaultGraphics/Stage.jsx
//
// Сцена полноэкранных плашек: предматчевая, перерыв, лидеры, составы,
// сравнение, таблица, номинации.
//
//   шапка  — логотип лиги и название дивизиона | заголовок | этап и листалка
//   тело   — своё у каждой плашки
//   подвал — дата · арена · город
//
// Графит с осветлением края — как иконка HockeyEco, только размером с кадр.
// Линии конька — в свободном правом нижнем углу, через содержимое не идут.
// Под командными плашками по бокам светятся цвета команд.
import React from 'react';
import { Reveal, SkateLines, Crest, Kicker, AccentChip, Icon } from './kit';
import { C, LIFT, rgba, dateText, stageText } from './theme';

export const STAGE = { left: 110, top: 72, width: 1700, height: 936, head: 104, foot: 66 };
export const BODY_H = STAGE.height - STAGE.head - STAGE.foot;

const STAGE_BG = `radial-gradient(farthest-corner at 50% 45%, ${C.g1} 0%, ${C.g1} 50%, #2B2C2C 80%, #383A3A 100%)`;

export function Stage({ game, visible, title, kicker, glow, page = 0, pages = 1, children, chip }) {
  const division = game.division_name || game.division_short_name;
  const footer = [
    { icon: 'calendar', text: dateText(game) },
    { icon: 'pin', text: game.arena_name || game.location_text },
    { icon: null, text: game.arena_city },
  ].filter(f => f.text);

  return (
    <Reveal visible={visible} margin={120} inMs={900} outMs={520}
            style={{ position: 'absolute', zIndex: 50, left: STAGE.left, top: STAGE.top, width: STAGE.width, height: STAGE.height }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 44, overflow: 'hidden', background: STAGE_BG, boxShadow: LIFT,
                    display: 'flex', flexDirection: 'column' }}>
        {/* Свечение цветов команд по бокам */}
        {glow && (
          <>
            <div style={{ position: 'absolute', left: -320, top: '18%', width: 760, height: 760, borderRadius: '50%',
                          background: `radial-gradient(circle, ${rgba(glow[0], 0.4)} 0%, ${rgba(glow[0], 0)} 68%)`, pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', right: -320, top: '18%', width: 760, height: 760, borderRadius: '50%',
                          background: `radial-gradient(circle, ${rgba(glow[1], 0.4)} 0%, ${rgba(glow[1], 0)} 68%)`, pointerEvents: 'none' }} />
          </>
        )}
        {/* Синий отсвет TR сверху по центру */}
        <div style={{ position: 'absolute', left: '50%', top: -420, width: 1100, height: 640, marginLeft: -550, borderRadius: '50%',
                      background: `radial-gradient(ellipse, ${rgba(C.accent, 0.16)} 0%, ${rgba(C.accent, 0)} 70%)`, pointerEvents: 'none' }} />

        {/* Линии конька — только в правом нижнем углу: он свободен (подвал
            прижат влево), а в левом верхнем стоит название лиги */}
        <SkateLines corner="br" size={340} width={3} opacity={0.85} delay={320} />
        <div className="g2-sheen" style={{ '--sheen': '11s', '--sheen-d': '2.4s' }} />

        {/* ---------- ШАПКА ---------- */}
        <div style={{ position: 'relative', height: STAGE.head, flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
                      padding: '0 44px', borderBottom: `1px solid ${C.divider}` }}>
          <div className="g2-slide" style={{ '--d': '260ms', display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
            {game.league_logo && <Crest url={game.league_logo} size={72} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: C.main, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {game.league_name}
              </div>
              {division && <div style={{ fontSize: 16, fontWeight: 600, color: C.muted, marginTop: 4, whiteSpace: 'nowrap' }}>{division}</div>}
            </div>
          </div>

          <div className="g2-rise" style={{ '--d': '200ms', textAlign: 'center' }}>
            {kicker && <Kicker size={15} color={C.accentSoft} spacing="0.2em" style={{ marginBottom: 8 }}>{kicker}</Kicker>}
            <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text, whiteSpace: 'nowrap' }}>{title}</div>
          </div>

          <div className="g2-rise" style={{ '--d': '300ms', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
            {pages > 1 && (
              <div style={{ display: 'flex', gap: 6 }}>
                {Array.from({ length: pages }).map((_, i) => (
                  <span key={i} style={{ width: i === page ? 26 : 8, height: 8, borderRadius: 4, transition: 'all .4s cubic-bezier(.2,.8,.2,1)',
                                         background: i === page ? C.accent : 'rgba(255,255,255,.18)' }} />
                ))}
              </div>
            )}
            {chip !== false && <AccentChip size={15}>{chip || stageText(game)}</AccentChip>}
          </div>
        </div>

        {/* ---------- ТЕЛО ---------- */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>{children}</div>

        {/* ---------- ПОДВАЛ ---------- */}
        <div className="g2-rise" style={{ '--d': '420ms', position: 'relative', height: STAGE.foot, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 22,
                                           padding: '0 44px', borderTop: `1px solid ${C.divider}`, background: 'rgba(0,0,0,.18)' }}>
          {footer.map((f, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ width: 4, height: 4, borderRadius: 2, background: C.skate, opacity: 0.8 }} />}
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 19, fontWeight: 700, color: C.main, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {f.icon && <Icon name={f.icon} size={20} color={C.accentSoft} />}
                {f.text}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

// Пусто: данные грузятся или их нет.
export function StageEmpty({ loading, error }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 18 }}>
      {loading && <span style={{ width: 40, height: 40, borderRadius: 20, border: `3px solid ${C.subtle}`, borderTopColor: C.accent, animation: 'g2Spin 1s linear infinite' }} />}
      <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.muted }}>
        {loading ? 'Загрузка данных' : error ? 'Данные временно недоступны' : 'Нет данных для показа'}
      </span>
    </div>
  );
}
