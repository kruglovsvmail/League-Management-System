// src/components/WebGraphics/Graphics_3/ScoreBarOverlay.jsx
//
// Табло по центру: тот же счёт, что в компактной плашке в углу, но развёрнутый
// в широкий титр внизу кадра — полные названия команд, крупные цифры, время и
// период тёмной вставкой между ними, медальон федерации на верхней кромке.
//
// С компактным табло показывается ВЗАИМОИСКЛЮЧАЮЩЕ: пока этот титр в эфире,
// Scoreboard прячется сам (см. список fullScreen в Scoreboard.jsx) — иначе счёт
// висел бы в кадре дважды.
import React, { useState, useEffect, useRef } from 'react';
import { Reveal } from './Reveal';
import { Glass, Dark, Crest } from './Frost';
import { Display, Num, Label, Pill } from './Type';
import { T, R, formatClock, periodLabel } from './theme';

const BAR_W = 1280;
const BAR_H = 164;
const SCORE_W = 104;
const CLOCK_W = 230;
const RAIL_W = 8;
const MARK = 92;

// Компоненты — на уровне модуля: титр перерисовывается вместе с таймером матча,
// и вложенный компонент React считал бы новым типом на каждом кадре, перезагружая
// эмблемы команд (см. тот же приём в Scoreboard.jsx).
function TeamSide({ logo, name, color, align }) {
  const right = align === 'right';
  return (
    <div className={`flex-1 min-w-0 flex items-center gap-5 ${right ? 'flex-row-reverse pr-6' : 'pl-6'}`}>
      <Crest logo={logo} size={76} accent={color} />
      <div className={`min-w-0 flex-1 truncate ${right ? 'text-right' : ''}`}>
        <Display size={34}>{name}</Display>
      </div>
    </div>
  );
}

function ScoreCell({ value, scored, color, isTech }) {
  return (
    <div
      className="shrink-0 flex items-center justify-center relative overflow-hidden"
      style={{
        width: SCORE_W,
        backgroundColor: scored ? color : 'rgba(18,49,74,0.05)',
        transition: 'background-color .3s',
      }}
    >
      {scored && (
        <div
          key={`${value}`}
          className="g3-ring absolute left-1/2 top-1/2 rounded-full pointer-events-none"
          style={{ width: SCORE_W, height: SCORE_W, border: '3px solid rgba(255,255,255,0.85)' }}
        />
      )}
      <span className={`relative z-10 ${scored ? 'g3-score-pop' : ''}`}>
        <Num size={64} color={scored ? T.white : (isTech ? T.danger : T.head)}>{value}</Num>
      </span>
    </div>
  );
}

// Колонка возвращается ВСЕГДА, даже пустой: в CSS Grid отсутствующий элемент
// не оставляет за собой ячейку, соседи съезжают влево, и центральная метка
// перестаёт стоять по центру.
function PenaltyChips({ rows, align, column }) {
  return (
    <div
      className={`flex items-center gap-2 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      style={{ gridColumn: column }}
    >
      {rows.map(p => (
        <Glass key={p.id} over="video" radius={R.pill} sheen={false}>
          <div className="px-4 py-1.5">
            <Num size={19} color={T.danger}>{formatClock(p.remaining)}</Num>
          </div>
        </Glass>
      ))}
    </div>
  );
}

export default function ScoreBarOverlay({
  game, timerSeconds, currentPeriod, isTimerRunning,
  activePenalties, periodLength, otLength, overlay,
}) {
  const isVisible = overlay.visible && overlay.type === 'scorebar';

  // ---- Эффект гола (тот же, что в компактном табло) -----------------------
  const prevScoreRef = useRef({ home: game?.home_score, away: game?.away_score });
  const [goalEffect, setGoalEffect] = useState(null);

  useEffect(() => {
    const prev = prevScoreRef.current;
    const h = game?.home_score ?? 0;
    const a = game?.away_score ?? 0;
    const scored = (prev.home !== undefined && h > prev.home) ? 'home'
      : (prev.away !== undefined && a > prev.away) ? 'away' : null;

    if (scored) {
      setGoalEffect(scored);
      setTimeout(() => setGoalEffect(null), 2900);
    }
    prevScoreRef.current = { home: h, away: a };
  }, [game?.home_score, game?.away_score]);

  if (!game) return null;

  const getDisplaySeconds = () => {
    let maxTime = 0;
    if (currentPeriod === '1') maxTime = periodLength * 60;
    else if (currentPeriod === '2') maxTime = periodLength * 2 * 60;
    else if (currentPeriod === '3') maxTime = periodLength * 3 * 60;
    else if (currentPeriod === 'OT') maxTime = (periodLength * 3 + otLength) * 60;
    else return 0;
    const remaining = maxTime - timerSeconds;
    return remaining > 0 ? remaining : 0;
  };

  const homeColor = game.home_color_1 || T.acc;
  const awayColor = game.away_color_1 || T.head;

  const isTech = !!game.is_technical;
  const techHome = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[0] : '+';
  const techAway = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[1] : '-';

  const safePenalties = Array.isArray(activePenalties) ? activePenalties : [];
  const penHome = safePenalties.filter(p => p.team_id === game.home_team_id).slice(0, 2);
  const penAway = safePenalties.filter(p => p.team_id === game.away_team_id).slice(0, 2);

  const homePlayers = 5 - penHome.length;
  const awayPlayers = 5 - penAway.length;

  let strength = null;
  if (homePlayers < 5 || awayPlayers < 5) {
    if (homePlayers === awayPlayers) {
      strength = { isPP: false, label: `${homePlayers} НА ${awayPlayers}` };
    } else {
      const ppHome = homePlayers > awayPlayers;
      const short = ppHome ? (game.home_short_name || 'ХОЗЯЕВА') : (game.away_short_name || 'ГОСТИ');
      strength = {
        isPP: true,
        label: `БОЛЬШИНСТВО ${short} · ${Math.max(homePlayers, awayPlayers)} НА ${Math.min(homePlayers, awayPlayers)}`,
      };
    }
  }

  const stageLabel = game.stage_type === 'playoff'
    ? `МАТЧ ${game.series_number || 1}`
    : `ТУР ${game.series_number || 1}`;
  const division = game.division_name || game.division_short_name;

  return (
    <Reveal isVisible={isVisible} variant="rise" className="absolute bottom-16 left-1/2 z-50">
      <div style={{ width: BAR_W }}>

        {/* ---------- ПОЛОСА СЧЁТА ---------- */}
        <div className="relative" style={{ height: BAR_H }}>
          <Glass over="video" radius={R.card} style={{ height: '100%' }}>
            <div className="flex items-stretch h-full">
              <div className="shrink-0" style={{ width: RAIL_W, backgroundColor: homeColor }} />

              <TeamSide logo={game.home_team_logo} name={game.home_team_name} color={homeColor} />
              <ScoreCell value={isTech ? techHome : game.home_score} scored={goalEffect === 'home'} color={homeColor} isTech={isTech} />

              {/* Время и период — тёмная вставка ровно между цифрами счёта */}
              <div className="shrink-0 py-3" style={{ width: CLOCK_W }}>
                <Dark radius={R.plate} style={{ width: '100%', height: '100%' }}>
                  <div className="h-full flex flex-col items-center justify-center gap-3">
                    <Num size={44} color={isTimerRunning ? T.white : 'rgba(255,255,255,0.45)'}>
                      {currentPeriod === 'SO' ? '0:00' : formatClock(getDisplaySeconds())}
                    </Num>
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-full" style={{ width: 7, height: 7, backgroundColor: T.accOnDark }} />
                      <Label size={11} color={T.accOnDark} tracking="0.22em" weight={800}>
                        {periodLabel(currentPeriod)}
                      </Label>
                    </div>
                  </div>
                </Dark>
              </div>

              <ScoreCell value={isTech ? techAway : game.away_score} scored={goalEffect === 'away'} color={awayColor} isTech={isTech} />
              <TeamSide logo={game.away_team_logo} name={game.away_team_name} color={awayColor} align="right" />

              <div className="shrink-0" style={{ width: RAIL_W, backgroundColor: awayColor }} />
            </div>
          </Glass>

          {/* Медальон федерации сидит на верхней кромке по центру.
              pad={0} — эмблема заполняет круг целиком: она и сама круглая,
              внутреннее поле только уменьшало бы её без всякой пользы. */}
          <div
            className="absolute z-20"
            style={{ left: '50%', top: -MARK / 2, transform: 'translateX(-50%)' }}
          >
            <Crest logo={game.league_logo} size={MARK} pad={0} />
          </div>
        </div>

        {/* ---------- НИЖНЯЯ СТРОКА ----------
            Три равные колонки: штрафы стоят под своей половиной полосы, а по
            центру всегда ОДНА метка — дивизион с туром, которую на время
            неравных составов ЗАМЕНЯЕТ подпись большинства. Две метки рядом
            сдвигали дивизион с центра, а состояние составов важнее справки
            о турнире. */}
        <div className="grid items-center mt-3.5" style={{ gridTemplateColumns: '1fr auto 1fr', gap: 16 }}>
          <PenaltyChips rows={penHome} align="left" column={1} />

          <div className="flex justify-center" style={{ gridColumn: 2 }}>
            {isTech ? (
              <Pill size={11} bg={T.danger} color={T.white} border={T.danger} style={{ boxShadow: '0 8px 20px rgba(20,55,95,0.2)' }}>
                ТЕХНИЧЕСКИЙ РЕЗУЛЬТАТ
              </Pill>
            ) : strength && currentPeriod !== 'SO' ? (
              <Pill
                size={11}
                bg={strength.isPP ? T.acc : 'rgba(255,255,255,0.92)'}
                color={strength.isPP ? T.white : T.body}
                border={strength.isPP ? T.acc : T.brdSoft}
                style={{ boxShadow: '0 8px 20px rgba(20,55,95,0.2)' }}
              >
                {strength.label}
              </Pill>
            ) : division ? (
              <Pill size={11} bg="rgba(255,255,255,0.92)" color={T.body} border={T.brdSoft} style={{ boxShadow: '0 8px 20px rgba(20,55,95,0.2)' }}>
                {division} · {stageLabel}
              </Pill>
            ) : null}
          </div>

          <PenaltyChips rows={penAway} align="right" column={3} />
        </div>
      </div>
    </Reveal>
  );
}
