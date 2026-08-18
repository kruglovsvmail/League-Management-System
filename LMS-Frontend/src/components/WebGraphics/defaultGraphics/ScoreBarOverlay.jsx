// src/components/WebGraphics/defaultGraphics/ScoreBarOverlay.jsx
//
// Табло по центру: тот же счёт, что в компактной плашке в углу, но развёрнутый
// в широкий титр внизу кадра — полные названия команд, крупные цифры, время и
// период между ними, эмблема лиги на верхней кромке.
//
// С компактным табло показывается ВЗАИМОИСКЛЮЧАЮЩЕ: пока этот титр в эфире,
// Scoreboard прячется сам (см. fullScreenOverlays в Scoreboard.jsx) — иначе счёт
// висел бы в кадре дважды.
//
// Геометрия та же, что у остальных плашек дефолтной графики: параллелограммы
// со скосом -10°, содержимое возвращается в вертикаль встречным +10°.
import React, { useState, useEffect, useRef } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';

const BAR_W = 1360;
const BAR_H = 150;
const SCORE_W = 104;
const CLOCK_W = 190;

const formatTime = (s) => {
  if (s === undefined || s === null || isNaN(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${('0' + (Math.floor(s) % 60)).slice(-2)}`;
};

// Компоненты — на уровне модуля: титр перерисовывается вместе с таймером матча,
// и вложенный компонент React считал бы новым типом на каждом кадре, перезагружая
// эмблемы команд.
function TeamSide({ logo, name, align }) {
  const right = align === 'right';
  return (
    <div className={`flex-1 min-w-0 flex items-center gap-4 px-5 skew-x-[10deg] ${right ? 'flex-row-reverse' : ''}`}>
      {logo && (
        <img src={logo} alt="" className="w-[60px] h-[60px] object-contain shrink-0"
             onError={(e) => { e.target.style.display = 'none'; }} />
      )}
      <span
        className={`min-w-0 flex-1 truncate font-bold text-[28px] uppercase tracking-wide text-white ${right ? 'text-right' : ''}`}
      >
        {name}
      </span>
    </div>
  );
}

function ScoreCell({ value, isTech, glow }) {
  return (
    <div className="shrink-0 flex items-center justify-center bg-zinc-900" style={{ width: SCORE_W }}>
      <span
        className={`skew-x-[10deg] font-mono font-black text-[62px] tabular-nums leading-none tracking-tighter ${isTech ? 'text-status-rejected' : 'text-white'} ${glow ? 'goal-score-pop' : ''}`}
        style={glow ? { textShadow: `0 0 30px ${glow}, 0 0 60px ${glow}` } : {}}
      >
        {value}
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
        <div key={p.id} className="skew-x-[-10deg] bg-yellow-400 px-4 py-1 rounded-sm shadow-md">
          <span className="skew-x-[10deg] block font-mono font-black text-[19px] tabular-nums tracking-tighter text-black">
            {formatTime(p.remaining)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ScoreBarOverlay({
  game, timerSeconds, currentPeriod, isTimerRunning,
  activePenalties, periodLength, otLength, overlay,
}) {
  const isVisible = overlay.visible && overlay.type === 'scorebar';

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
      setTimeout(() => setGoalEffect(null), 3000);
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

  const getPeriodText = () => {
    if (currentPeriod === 'OT') return 'ОТ';
    if (currentPeriod === 'SO') return 'БУЛЛИТЫ';
    return `${currentPeriod} ПЕРИОД`;
  };

  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);
  const leagueLogo = getImageUrl(game.league_logo);

  const homeColor = game.home_color_1 || '#facc15';
  const awayColor = game.away_color_1 || '#ffffff';

  const isTech = !!game.is_technical;
  const techHome = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[0] : '+';
  const techAway = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[1] : '-';

  const safePenalties = Array.isArray(activePenalties) ? activePenalties : [];
  const penHome = safePenalties.filter(p => p.team_id === game.home_team_id).slice(0, 2);
  const penAway = safePenalties.filter(p => p.team_id === game.away_team_id).slice(0, 2);

  const homePlayers = 5 - penHome.length;
  const awayPlayers = 5 - penAway.length;

  let strengthText = null;
  let isPP = false;
  if (homePlayers < 5 || awayPlayers < 5) {
    if (homePlayers === awayPlayers) strengthText = `${homePlayers} НА ${awayPlayers}`;
    else {
      isPP = true;
      const short = homePlayers > awayPlayers
        ? (game.home_short_name || 'ХОЗЯЕВА')
        : (game.away_short_name || 'ГОСТИ');
      strengthText = `БОЛЬШИНСТВО ${short} · ${Math.max(homePlayers, awayPlayers)} НА ${Math.min(homePlayers, awayPlayers)}`;
    }
  }

  const stageLabel = game.stage_type === 'playoff'
    ? `МАТЧ ${game.series_number || 1}`
    : `ТУР ${game.series_number || 1}`;
  const division = game.division_name || game.division_short_name;

  return (
    <AnimationWrapper
      type="scorebar"
      isVisible={isVisible}
      className="absolute bottom-16 left-1/2 -translate-x-1/2 z-50 drop-shadow-2xl"
    >
      <div style={{ width: BAR_W }}>

        {/* ---------- ПОЛОСА СЧЁТА ---------- */}
        <div className="relative" style={{ height: BAR_H }}>
          <div
            className="flex items-stretch skew-x-[-10deg] overflow-hidden rounded-md bg-zinc-950 h-full"
          >
            <div className="w-2 shrink-0" style={{ backgroundColor: homeColor }} />

            <TeamSide logo={homeLogo} name={game.home_team_name} />
            <ScoreCell value={isTech ? techHome : game.home_score} isTech={isTech} glow={goalEffect === 'home' ? homeColor : null} />

            {/* Время и период — между цифрами счёта */}
            <div className="shrink-0 flex flex-col items-center justify-center bg-zinc-950 relative overflow-hidden" style={{ width: CLOCK_W }}>
              <div className="absolute top-0 bottom-0 w-[200%] bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-[-20deg] animate-glare pointer-events-none z-0"></div>
              <div className="skew-x-[10deg] flex flex-col items-center z-10 w-full px-2">
                <span className={`font-mono text-[46px] font-black tabular-nums leading-none tracking-tight transition-colors ${isTimerRunning ? 'text-white' : 'text-zinc-500'}`}>
                  {currentPeriod === 'SO' ? '0:00' : formatTime(getDisplaySeconds())}
                </span>
                <span className="text-[12px] font-bold text-zinc-400 uppercase tracking-widest mt-2">
                  {getPeriodText()}
                </span>
              </div>
            </div>

            <ScoreCell value={isTech ? techAway : game.away_score} isTech={isTech} glow={goalEffect === 'away' ? awayColor : null} />
            <TeamSide logo={awayLogo} name={game.away_team_name} align="right" />

            <div className="w-2 shrink-0" style={{ backgroundColor: awayColor }} />
          </div>

          {/* Эмблема лиги сидит на верхней кромке по центру и заполняет круг
              целиком: логотипы лиг сами круглые, внутреннее поле только
              уменьшало бы их без пользы. */}
          {leagueLogo && (
            <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ top: -46 }}>
              <div className="w-[92px] h-[92px] rounded-full bg-zinc-950 border-2 border-zinc-800 overflow-hidden shadow-2xl">
                <img src={leagueLogo} alt="" className="w-full h-full object-contain"
                     onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
            </div>
          )}
        </div>

        {/* ---------- НИЖНЯЯ СТРОКА ----------
            Три колонки: штрафы под своей половиной полосы, а по центру всегда
            ОДНА метка — дивизион с туром, которую на время неравных составов
            ЗАМЕНЯЕТ подпись большинства. Две метки рядом сдвигали дивизион с
            центра, а состояние составов важнее справки о турнире. */}
        <div className="grid items-center mt-3" style={{ gridTemplateColumns: '1fr auto 1fr', gap: 16 }}>
          <PenaltyChips rows={penHome} align="left" column={1} />

          <div className="flex justify-center" style={{ gridColumn: 2 }}>
            {isTech ? (
              <div className="skew-x-[-10deg] bg-status-rejected px-5 py-1.5 rounded-sm shadow-md">
                <span className="skew-x-[10deg] block text-[11px] font-black uppercase tracking-[0.2em] text-white">
                  ТЕХНИЧЕСКИЙ РЕЗУЛЬТАТ
                </span>
              </div>
            ) : strengthText && currentPeriod !== 'SO' ? (
              <div className={`skew-x-[-10deg] px-5 py-1.5 rounded-sm shadow-md ${isPP ? 'bg-yellow-400' : 'bg-zinc-800'}`}>
                <span className={`skew-x-[10deg] block text-[11px] font-black uppercase tracking-[0.2em] ${isPP ? 'text-black' : 'text-white'}`}>
                  {strengthText}
                </span>
              </div>
            ) : division ? (
              <div className="skew-x-[-10deg] bg-zinc-900 px-5 py-1.5 rounded-sm shadow-md">
                <span className="skew-x-[10deg] block text-[11px] font-black uppercase tracking-[0.2em] text-zinc-300">
                  {division} · {stageLabel}
                </span>
              </div>
            ) : null}
          </div>

          <PenaltyChips rows={penAway} align="right" column={3} />
        </div>
      </div>
    </AnimationWrapper>
  );
}
