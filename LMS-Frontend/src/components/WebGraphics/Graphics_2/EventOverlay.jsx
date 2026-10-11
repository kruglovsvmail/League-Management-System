// src/components/WebGraphics/Graphics_2/EventOverlay.jsx
//
// Гол и удаление — титр внизу по центру.
//
//   [ГОЛ / УДАЛЕНИЕ] [фото] [команда · время · ситуация / ФАМИЛИЯ Имя / передачи] [эмблема]
//
// Левый блок у гола синий (кнопка TR), у удаления — красный (danger TR). За
// фамилией — крупный контурный номер игрока. Справа — эмблема команды игрока.
//
// Командный штраф (и штраф представителю) — без фото и номера: вместо фамилии
// название команды, в надстрочнике — «Командный штраф».
import React from 'react';
import { Reveal, Photo, Crest, SkateLines, FitText, Kicker } from './kit';
import { C, GRAPHITE_WIDE, ACCENT_FILL, DANGER_FILL, LIFT, rgba, teamColor, teamInk, teamShort, GOAL_STRENGTH, formatClock } from './theme';

const H = 178;

// Время события внутри периода: «2-й период · 12:34».
function eventTime(data, game) {
  const secs = Number(data?.time_seconds);
  const period = data?.period;
  if (!Number.isFinite(secs)) return null;
  const len = (game?.period_length || 20) * 60;
  if (period === 'OT') return `ОТ · ${formatClock(secs - len * 3)}`;
  if (period === 'SO') return 'Буллиты';
  const p = Number(period) || Math.min(3, Math.floor(secs / len) + 1);
  return `${p}-й период · ${formatClock(secs - (p - 1) * len)}`;
}

export default function EventOverlay({ game, overlay }) {
  const data = overlay?.data;
  const isEvent = overlay?.type === 'goal' || overlay?.type === 'penalty';
  const visible = !!(overlay?.visible && isEvent && data);
  // Пока плашка уходит, в overlay.type может прийти уже другой тип — держим
  // последний показанный, чтобы титр не перерисовался посреди ухода.
  const lastRef = React.useRef({ type: null, data: null });
  if (isEvent && data) lastRef.current = { type: overlay.type, data };
  const { type, data: d } = lastRef.current;
  if (!game || !d) return null;

  const isGoal = type === 'goal';
  const side = d.team_id === game.away_team_id ? 'away' : 'home';
  const color = teamColor(game, side);
  const roster = side === 'home' ? game.home_roster : game.away_roster;
  const matched = roster?.find(p => p.last_name === d.primary_last_name && p.first_name === d.primary_first_name);
  const number = matched?.jersey_number ?? d.primary_jersey_number ?? d.jersey_number ?? d.player_number ?? null;
  const photo = d.primary_photo_url || matched?.avatar_url;
  const teamLogo = d.team_logo || game[`${side}_team_logo`];

  // Тип нарушителя приходит из протокола; у старых записей его нет — тогда
  // командный штраф узнаём по пустому игроку.
  const offender = d.penalty_offender_type || (d.primary_player_id || d.primary_last_name ? 'player' : 'team');
  const teamWide = !isGoal && offender !== 'player';
  const showNumber = !teamWide && number != null && number !== '';

  const when = eventTime(d, game);
  const situation = isGoal ? GOAL_STRENGTH[d.goal_strength] : null;
  const assists = [d.assist1_last_name, d.assist2_last_name].filter(Boolean);
  const penDisplay = d.penalty_display ?? d.penalty_minutes;
  const penIsWords = penDisplay != null && !/^[\d+]+$/.test(String(penDisplay));
  const reason = d.penalty_reasons_text || d.penalty_violation;

  const teamName = game[`${side}_team_name`] || teamShort(game, side);
  const kickerParts = [teamWide ? (offender === 'official' ? 'Штраф представителю' : 'Командный штраф') : teamName, when, situation].filter(Boolean);

  return (
    <div style={{ position: 'absolute', zIndex: 50, bottom: 64, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
    <Reveal visible={visible} margin={90} inMs={760} style={{ position: 'relative' }}>
      <div style={{ position: 'relative', display: 'flex', height: H, width: 1280, borderRadius: 28, overflow: 'hidden',
                    background: GRAPHITE_WIDE, boxShadow: LIFT }}>
        <div className="g2-sheen" style={{ '--sheen': '6s', '--sheen-d': '1.4s' }} />

        {/* ---------- Метка события ---------- */}
        <div style={{ position: 'relative', width: 196, flexShrink: 0, background: isGoal ? ACCENT_FILL : DANGER_FILL, overflow: 'hidden',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <SkateLines corner="br" size={120} color="#FFFFFF" width={3} tint={false} opacity={0.5} />
          <SkateLines corner="tl" size={70} color="#FFFFFF" width={2} tint={false} opacity={0.35} />
          {isGoal ? (
            <>
              <span className="g2-pop g2-loud" style={{ '--d': '200ms', fontSize: 68, lineHeight: 1, color: '#fff',
                                                 textShadow: '0 6px 24px rgba(0,0,0,.25)' }}>ГОЛ!</span>
            </>
          ) : (
            <>
              <span className="g2-rise g2-loud" style={{ '--d': '200ms', fontSize: 19, color: 'rgba(255,255,255,.95)' }}>УДАЛЕНИЕ</span>
              <span className="g2-pop g2-num" style={{ '--d': '300ms', fontSize: penIsWords ? 44 : String(penDisplay).length > 2 ? 50 : 66, fontWeight: 800, lineHeight: 1, color: '#fff' }}>
                {penDisplay}
              </span>
              {!penIsWords && <span className="g2-rise" style={{ '--d': '420ms', fontSize: 15, fontWeight: 800, letterSpacing: '0.2em', color: 'rgba(255,255,255,.9)' }}>МИНУТ</span>}
            </>
          )}
        </div>

        {/* ---------- Фото (у командного штрафа его нет) ---------- */}
        {!teamWide && <div style={{ position: 'relative', width: 160, flexShrink: 0, background: C.ink, overflow: 'hidden' }}>
          <div className="g2-rise" style={{ position: 'absolute', inset: 0, '--d': '260ms' }}>
            <Photo url={photo} style={{ width: '100%', height: '100%' }} />
          </div>
          <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, transparent 55%, ${rgba(color, 0.35)} 100%)` }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, background: color }} />
        </div>}

        {/* ---------- Игрок (подкрашен цветом команды от фото) ---------- */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0, padding: '0 46px 0 38px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                      background: `linear-gradient(90deg, ${rgba(color, 0.26)} 0%, ${rgba(color, 0.06)} 45%, transparent 75%)` }}>
          {/* Номер на фоне — заливкой цвета команды, гаснет книзу. Не обводкой: у Manrope
              обводка рисует и внутренние стыки контуров, на углах цифр вылезают «рога». */}
          {showNumber && (
            <div className="g2-num" style={{ position: 'absolute', right: 26, top: '50%', transform: 'translateY(-50%)', fontSize: 210, fontWeight: 800,
                                               lineHeight: 1, color: 'transparent', WebkitBackgroundClip: 'text', backgroundClip: 'text',
                                               backgroundImage: `linear-gradient(180deg, ${rgba(teamInk(game, side), 0.34)} 0%, ${rgba(teamInk(game, side), 0.08)} 100%)`,
                                               letterSpacing: '-0.04em', pointerEvents: 'none' }}>
              {number}
            </div>
          )}

          <Kicker size={16} color={C.muted} spacing="0.14em" style={{ position: 'relative', display: 'flex', gap: 12, alignItems: 'center' }}>
            {kickerParts.map((t, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ width: 4, height: 4, borderRadius: 2, background: i === 2 && situation ? C.skate : C.subtle, flexShrink: 0 }} />}
                <span className={i === 0 ? 'g2-slide' : 'g2-rise'} style={{ '--d': `${300 + i * 80}ms`, color: i === 2 && situation ? C.accentSoft : undefined, whiteSpace: 'nowrap' }}>{t}</span>
              </React.Fragment>
            ))}
          </Kicker>

          <div className="g2-slide" style={{ '--d': '340ms', position: 'relative', display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 12, minWidth: 0 }}>
            {showNumber && (
              <span className="g2-num" style={{ fontSize: 30, fontWeight: 800, color: teamInk(game, side), flexShrink: 0 }}>#{number}</span>
            )}
            <FitText min={0.56} style={{ fontSize: 56, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.02, color: C.text, letterSpacing: '0.005em', minWidth: 0, flexShrink: 1 }}>
              {teamWide ? teamName : d.primary_last_name}
            </FitText>
            {!teamWide && <span style={{ fontSize: 24, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>{d.primary_first_name}</span>}
          </div>

          <div className="g2-rise" style={{ '--d': '480ms', position: 'relative', marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.divider}`,
                                              display: 'flex', alignItems: 'center', gap: 12, fontSize: 21, fontWeight: 700, color: C.main, minWidth: 0 }}>
            {isGoal ? (
              assists.length ? (
                <>
                  <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.16em', color: C.accentSoft, flexShrink: 0 }}>ПЕРЕДАЧИ</span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{assists.join('  ·  ')}</span>
                </>
              ) : (
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.16em', color: C.subtle }}>БЕЗ ПЕРЕДАЧ</span>
              )
            ) : (
              <>
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.16em', color: C.dangerSoft, flexShrink: 0 }}>НАРУШЕНИЕ</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reason || '—'}</span>
              </>
            )}
          </div>
        </div>

        {/* ---------- Справа: эмблема команды ---------- */}
        <div style={{ position: 'relative', width: 196, flexShrink: 0, background: 'rgba(0,0,0,.25)', borderLeft: `1px solid ${C.divider}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="g2-pop" style={{ '--d': '360ms', display: 'flex' }}>
            <Crest url={teamLogo} size={124} color={color} />
          </div>
        </div>
      </div>
    </Reveal>
    </div>
  );
}
