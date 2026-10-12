// src/components/WebGraphics/defaultGraphics/TeamComparisonOverlay.jsx
//
// Сравнение команд: по краям эмблемы, по центру строки показателей. У каждой
// строки — двусторонняя шкала: чья доля больше, та половина ярче. Для
// показателей, где меньше — лучше (пропущенные, штраф, место), шкала
// перевёрнута. Страницы и их число — из broadcastConfig, как у панели.
import React from 'react';
import { Crest, Kicker, FitText, usePager, Page } from './kit';
import { Stage, StageEmpty, BODY_H } from './Stage';
import { chunks, comparisonMetrics, COMPARISON_PAGE_SIZE } from '../broadcastConfig';
import { C, teamColor, teamInk, rgba } from './theme';

const LOWER_IS_BETTER = new Set(['losses', 'losses_reg', 'losses_ot', 'rank', 'goals_against', 'goals_against_avg', 'penalty_minutes']);

const fmt = (stat, key) => {
  const n = stat?.[key];
  if (n == null) return '—';
  if (key === 'power_play_pct') return `${Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
  if (key.endsWith('_avg')) return Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return key === 'goals_diff' && Number(n) > 0 ? `+${n}` : n;
};

// Доля хозяев 0..1 для шкалы. Отрицательные значения (разница шайб) сдвигаем.
function share(h, a, key) {
  let x = Number(h); let y = Number(a);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const min = Math.min(x, y, 0);
  x -= min; y -= min;
  if (x + y === 0) return 0.5;
  let s = x / (x + y);
  if (LOWER_IS_BETTER.has(key)) s = 1 - s;
  return s;
}

function Side({ game, side }) {
  const color = teamColor(game, side);
  return (
    <div style={{ width: 400, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 34px' }}>
      <div className="g2-pop" style={{ '--d': side === 'home' ? '240ms' : '320ms' }}>
        <Crest url={game[`${side}_team_logo`]} size={230} />
      </div>
      <div className="g2-rise" style={{ '--d': '380ms', width: '100%', marginTop: 34, textAlign: 'center' }}>
        <Kicker size={16} color={teamInk(game, side)} spacing="0.2em">{side === 'home' ? 'Хозяева' : 'Гости'}</Kicker>
        <FitText align="center" min={0.6} style={{ marginTop: 12, fontSize: 40, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.05, color: C.text }}>
          {game[`${side}_team_name`]}
        </FitText>
      </div>
    </div>
  );
}

export default function TeamComparisonOverlay({ game, overlay, broadcast }) {
  const visible = overlay.visible && overlay.type === 'team_comparison';
  const metrics = comparisonMetrics(broadcast?.data, overlay.data?.comparisonMetrics);
  const pages = chunks(metrics, COMPARISON_PAGE_SIZE);
  const keyStr = metrics.map(m => m.key).join(',');
  const page = usePager(visible, pages.length, overlay.data?.comparisonSwitch, keyStr);
  const hs = broadcast?.data?.comparison?.[game.home_team_id];
  const as = broadcast?.data?.comparison?.[game.away_team_id];
  const homeColor = teamColor(game, 'home');
  const awayColor = teamColor(game, 'away');
  // Шкалы тонкие — цвет для них поднят до читаемого, как у текста
  const homeBar = teamInk(game, 'home');
  const awayBar = teamInk(game, 'away');
  const rows = pages[page] || [];
  const rowH = Math.min(70, Math.floor((BODY_H - 120) / Math.max(1, rows.length)));

  return (
    <Stage game={game} visible={visible} title="Сравнение команд" kicker={broadcast?.data?.scope_label} glow={[homeColor, awayColor]}
           page={page} pages={pages.length}>
      {!pages.length ? <StageEmpty loading={broadcast?.loading} error={broadcast?.error} /> : (
        <div style={{ display: 'flex', height: BODY_H }}>
          <Side game={game} side="home" />
          <Page pageKey={`${keyStr}:${page}`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 10px' }}>
            {rows.map((m, i) => {
              const s = share(hs?.[m.key], as?.[m.key], m.key);
              const homeBetter = s != null && s > 0.5;
              const awayBetter = s != null && s < 0.5;
              return (
                <div key={m.key} className="g2-rise" style={{ '--d': `${300 + i * 45}ms`, height: rowH, display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                                             borderBottom: i < rows.length - 1 ? `1px solid ${C.divider}` : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="g2-num" style={{ width: 120, fontSize: 32, fontWeight: 800, color: homeBetter ? C.text : C.muted }}>{fmt(hs, m.key)}</span>
                    <span style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.main }}>{m.label}</span>
                    <span className="g2-num" style={{ width: 120, textAlign: 'right', fontSize: 32, fontWeight: 800, color: awayBetter ? C.text : C.muted }}>{fmt(as, m.key)}</span>
                  </div>
                  {s != null && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, height: 5 }}>
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                        <div style={{ width: `${s * 100}%`, borderRadius: 3, background: homeBetter ? homeBar : rgba(homeBar, 0.4), transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }} />
                      </div>
                      <div style={{ flex: 1, display: 'flex', borderRadius: 3, background: 'rgba(255,255,255,.06)', overflow: 'hidden' }}>
                        <div style={{ width: `${(1 - s) * 100}%`, borderRadius: 3, background: awayBetter ? awayBar : rgba(awayBar, 0.4), transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Page>
          <Side game={game} side="away" />
        </div>
      )}
    </Stage>
  );
}
