// src/components/WebGraphics/Graphics_3/Scoreboard.jsx
//
// Табло лиги 3: единый «шеврон» по ЦЕНТРУ ВЕРХНЕЙ КРОМКИ кадра.
// Дефолтное табло — тёмный параллелограмм в левом верхнем углу, две строки команд
// друг под другом и блок времени сбоку. Здесь всё в одну линию и симметрично
// относительно центра: [ХОЗЯЕВА][счёт] [ЛЕДЯНОЕ ОКНО ВРЕМЕНИ] [счёт][ГОСТИ],
// время — тёмным по светлому на выступающем вниз шевроне, штрафы свисают под
// краями, а бренд лиги и дивизион вынесены отдельной плашкой в левый угол.
import React, { useState, useEffect, useRef } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { Reveal } from './Reveal';
import { Hatch, Snowflake } from './IcePattern';
import { LeagueMark, DivisionChip } from './Frame';
import { C, cut, blade, chevron, shadow } from './theme';

const formatTime = (s) => {
  if (s === undefined || s === null || isNaN(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;
};

export default function Scoreboard({
  game, events = [], soLength = 3, timerSeconds, currentPeriod, isTimerRunning,
  activePenalties, periodLength, otLength, overlay, isScoreboardVisible
}) {

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
    if (currentPeriod === 'OT') return 'ОВЕРТАЙМ';
    if (currentPeriod === 'SO') return 'БУЛЛИТЫ';
    return `${currentPeriod} ПЕРИОД`;
  };

  const displaySeconds = getDisplaySeconds();
  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const homeLogo = getSafeUrl(game.home_team_logo);
  const awayLogo = getSafeUrl(game.away_team_logo);

  const homeColor = game.home_color_1 || C.blueDk;
  const awayColor = game.away_color_1 || C.navy2;

  // =======================================================================
  // ЭФФЕКТ ГОЛА
  // =======================================================================
  const prevScoreRef = useRef({ home: game.home_score, away: game.away_score });
  const [goalEffect, setGoalEffect] = useState(null); // 'home' | 'away' | null
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const prev = prevScoreRef.current;
    const newHome = game.home_score ?? 0;
    const newAway = game.away_score ?? 0;

    const scored = (prev.home !== undefined && newHome > prev.home) ? 'home'
      : (prev.away !== undefined && newAway > prev.away) ? 'away' : null;

    if (scored) {
      setGoalEffect(scored);
      setFlash(true);
      setTimeout(() => setFlash(false), 1100);
      setTimeout(() => setGoalEffect(null), 3400);
    }

    prevScoreRef.current = { home: newHome, away: newAway };
  }, [game.home_score, game.away_score]);

  const isTech = !!game.is_technical;
  const techHome = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[0] : '+';
  const techAway = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[1] : '-';

  // =======================================================================
  // СЕРИЯ БУЛЛИТОВ
  // =======================================================================
  const homeShootout = events.filter(e => e.period === 'SO' && e.team_id === game.home_team_id && ['shootout_goal', 'shootout_miss'].includes(e.event_type));
  const awayShootout = events.filter(e => e.period === 'SO' && e.team_id === game.away_team_id && ['shootout_goal', 'shootout_miss'].includes(e.event_type));

  let displaySlots = soLength;

  if (currentPeriod === 'SO') {
    const maxTaken = Math.max(homeShootout.length, awayShootout.length);
    const isRoundComplete = homeShootout.length === maxTaken && awayShootout.length === maxTaken;
    const homeSOGoals = homeShootout.filter(s => s.event_type === 'shootout_goal').length;
    const awaySOGoals = awayShootout.filter(s => s.event_type === 'shootout_goal').length;

    // Раунд сыгран, счёт равный и бросков не меньше базового soLength — добавляем слот sudden death
    if (isRoundComplete && homeSOGoals === awaySOGoals && maxTaken >= displaySlots) displaySlots = maxTaken + 1;
    else displaySlots = Math.max(displaySlots, maxTaken);
  }

  // =======================================================================
  // СКРЫТИЕ ТАБЛО ПОД ПОЛНОЭКРАННЫМИ ПЛАШКАМИ (защита от мигания на переходах)
  // =======================================================================
  const fullScreenOverlays = ['prematch', 'intermission', 'team_leaders', 'team_roster'];
  const isFullScreenActive = overlay?.visible && fullScreenOverlays.includes(overlay?.type);

  const [hideForOverlay, setHideForOverlay] = useState(false);

  useEffect(() => {
    if (isFullScreenActive) setHideForOverlay(true);
    else {
      const timer = setTimeout(() => setHideForOverlay(false), 600);
      return () => clearTimeout(timer);
    }
  }, [isFullScreenActive]);

  const isHidden = !isScoreboardVisible || hideForOverlay;

  // =======================================================================
  // ШТРАФЫ
  // =======================================================================
  const safePenalties = Array.isArray(activePenalties) ? activePenalties : [];
  const visibleHome = safePenalties.filter(p => p.team_id === game.home_team_id).slice(0, 2);
  const visibleAway = safePenalties.filter(p => p.team_id === game.away_team_id).slice(0, 2);

  const homePlayers = 5 - visibleHome.length;
  const awayPlayers = 5 - visibleAway.length;

  let strengthText = null;
  let isPP = false;
  if (homePlayers < 5 || awayPlayers < 5) {
    if (homePlayers === awayPlayers) strengthText = `${homePlayers} НА ${awayPlayers}`;
    else { isPP = true; strengthText = 'БОЛЬШИНСТВО'; }
  }

  // =======================================================================
  // ЭЛЕМЕНТЫ
  // =======================================================================
  const TeamCap = ({ logo, name, side }) => (
    <div
      className="h-[92px] flex items-center gap-4 relative"
      style={{
        backgroundColor: C.navy,
        paddingLeft: side === 'left' ? 34 : 22,
        paddingRight: side === 'left' ? 22 : 34,
        clipPath: side === 'left'
          ? 'polygon(0 0, 100% 0, 100% 100%, 30px 100%, 0 calc(100% - 30px))'
          : 'polygon(0 0, 100% 0, 100% calc(100% - 30px), calc(100% - 30px) 100%, 0 100%)',
      }}
    >
      <Hatch color="rgba(255,255,255,0.04)" step={20} />
      {/* Логотип всегда у ВНЕШНЕЙ кромки кадра, название — ближе к центру табло */}
      {side === 'right' && (
        <span className="font-black text-[30px] uppercase tracking-[0.06em] leading-none relative z-10" style={{ color: C.white }}>
          {name}
        </span>
      )}
      {logo && (
        <img
          src={logo} alt=""
          className="w-[50px] h-[50px] object-contain relative z-10"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      )}
      {side === 'left' && (
        <span className="font-black text-[30px] uppercase tracking-[0.06em] leading-none relative z-10" style={{ color: C.white }}>
          {name}
        </span>
      )}
    </div>
  );

  const ScoreTile = ({ value, color, side, scored }) => (
    <div
      className="h-[92px] w-[96px] flex items-center justify-center relative"
      style={{
        backgroundColor: scored ? C.white : color,
        clipPath: side === 'left' ? cut(0, 0, 18, 0) : cut(0, 0, 0, 18),
        transition: 'background-color .25s',
      }}
    >
      <Hatch color="rgba(4,18,43,0.12)" step={16} />
      <span
        className={`font-mono font-black text-[50px] tabular-nums leading-none relative z-10 ${scored ? 'g3-score-pop' : ''}`}
        style={{ color: scored ? C.deep : C.white, textShadow: scored ? 'none' : '0 3px 10px rgba(4,18,43,0.45)' }}
      >
        {value}
      </span>
    </div>
  );

  // Слоты буллитов: ромбы — залитый (гол), контурный (промах), точка (не пробит).
  const ShootoutRow = ({ shots, align }) => (
    <div className={`flex gap-2.5 items-center ${align === 'right' ? 'justify-end' : ''}`}>
      {Array.from({ length: displaySlots }).map((_, i) => {
        const shot = shots[i];
        if (!shot) return <div key={i} className="w-2 h-2 rotate-45" style={{ backgroundColor: 'rgba(232,241,248,0.28)' }} />;
        if (shot.event_type === 'shootout_goal') return <div key={i} className="w-3.5 h-3.5 rotate-45" style={{ backgroundColor: C.blue, boxShadow: `0 0 12px ${C.blue}` }} />;
        return <div key={i} className="w-3.5 h-3.5 rotate-45 border-2" style={{ borderColor: 'rgba(232,241,248,0.4)' }} />;
      })}
    </div>
  );

  const PenaltyStack = ({ list, align }) => (
    <div className={`flex flex-col gap-1.5 ${align === 'right' ? 'items-end' : 'items-start'}`}>
      {list.map(p => (
        <div
          key={p.id}
          className="flex items-center gap-2.5 px-3.5 py-1.5"
          style={{ backgroundColor: C.hot, clipPath: align === 'right' ? cut(0, 0, 10, 0) : cut(0, 0, 0, 10) }}
        >
          <span className="font-black uppercase text-[11px] tracking-[0.16em]" style={{ color: C.white }}>
            {p.player_name || 'ШТРАФ'}
          </span>
          <span className="font-mono font-black text-[17px] tabular-nums leading-none" style={{ color: C.white }}>
            {formatTime(p.remaining)}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes g3ScorePop {
          0%   { transform: scale(1); }
          14%  { transform: scale(1.85); }
          30%  { transform: scale(1.3); }
          48%  { transform: scale(1.6); }
          68%  { transform: scale(1.35); }
          100% { transform: scale(1); }
        }
        .g3-score-pop { animation: g3ScorePop 3.2s cubic-bezier(0.2, 0.9, 0.2, 1); display: inline-block; }

        /* Вспышка гола — диагональная волна по всему табло */
        @keyframes g3GoalFlash {
          0%   { left: -60%; opacity: 0; }
          10%  { opacity: 1; }
          100% { left: 150%; opacity: 0; }
        }
        .g3-goal-flash {
          position: absolute; top: -80%; bottom: -80%; width: 30%;
          transform: rotate(45deg);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
          animation: g3GoalFlash 1.1s cubic-bezier(0.3, 0, 0.2, 1);
          pointer-events: none;
        }
      `}</style>

      {/* --- Бренд лиги и дивизион: плашка в ПРАВОМ верхнем углу.
              Левый угол оставлен свободным под вертикальный постер события. --- */}
      <Reveal isVisible={!isHidden} variant="slideR" className="absolute top-[132px] right-0 z-40" style={{ filter: shadow('md') }}>
        <div className="flex flex-col gap-2 items-end">
          <div
            className="flex items-center pl-9 pr-10 py-3"
            style={{ backgroundColor: C.ice, clipPath: 'polygon(26px 0, 100% 0, 100% 100%, 0 100%)' }}
          >
            <LeagueMark game={game} compact />
          </div>
          <div className="pr-10">
            <DivisionChip game={game} tone="dark" />
          </div>
        </div>
      </Reveal>

      {/* --- Главный шеврон табло --- */}
      <Reveal isVisible={!isHidden} variant="blade" className="absolute top-0 left-1/2 z-50">
        <div className="relative" style={{ filter: shadow('lg') }}>
          <div className="flex items-start relative">
            {flash && <div className="g3-goal-flash z-40" />}

            <TeamCap logo={homeLogo} name={homeShortName} side="left" />
            <ScoreTile value={isTech ? techHome : game.home_score} color={homeColor} side="left" scored={goalEffect === 'home'} />

            {/* Ледяное окно времени — выступает вниз шевроном */}
            <div
              className="w-[236px] h-[126px] flex flex-col items-center pt-4 relative"
              style={{ backgroundColor: C.ice, clipPath: chevron(30) }}
            >
              <Hatch color="rgba(11,42,91,0.06)" step={18} />
              <div className="g3-gleam g3-gleam-dark" style={{ left: '-60%' }} />

              <span className="font-black uppercase tracking-[0.28em] text-[11px] relative z-10" style={{ color: C.blueDk }}>
                {getPeriodText()}
              </span>
              <span
                className="font-mono font-black text-[46px] tabular-nums leading-none tracking-tight relative z-10 mt-1.5"
                style={{ color: isTimerRunning ? C.deep : C.slate }}
              >
                {currentPeriod === 'SO' ? '0:00' : formatTime(displaySeconds)}
              </span>

              {/* Отметки периодов */}
              <div className="flex gap-2 mt-2 relative z-10">
                {['1', '2', '3', 'OT'].map((p) => {
                  const idx = ['1', '2', '3', 'OT'].indexOf(currentPeriod);
                  const myIdx = ['1', '2', '3', 'OT'].indexOf(p);
                  const done = idx > myIdx && idx !== -1;
                  const active = currentPeriod === p;
                  return (
                    <div
                      key={p}
                      className={`w-2 h-2 rotate-45 ${active ? 'g3-blink' : ''}`}
                      style={{ backgroundColor: active || done ? C.blueDk : 'rgba(11,42,91,0.2)' }}
                    />
                  );
                })}
              </div>
            </div>

            <ScoreTile value={isTech ? techAway : game.away_score} color={awayColor} side="right" scored={goalEffect === 'away'} />
            <TeamCap logo={awayLogo} name={awayShortName} side="right" />
          </div>

          {/* Штрафы / буллиты — свисают под краями табло */}
          {!isTech && (
            currentPeriod === 'SO' ? (
              <>
                <div className="absolute left-[34px] top-[100px]"><ShootoutRow shots={homeShootout} /></div>
                <div className="absolute right-[34px] top-[100px]"><ShootoutRow shots={awayShootout} align="right" /></div>
              </>
            ) : (
              <>
                {visibleHome.length > 0 && (
                  <div className="absolute left-[10px] top-[96px]" style={{ filter: shadow('sm') }}>
                    <PenaltyStack list={visibleHome} />
                  </div>
                )}
                {visibleAway.length > 0 && (
                  <div className="absolute right-[10px] top-[96px]" style={{ filter: shadow('sm') }}>
                    <PenaltyStack list={visibleAway} align="right" />
                  </div>
                )}
              </>
            )
          )}

          {/* Технический результат / неравные составы — язычок под шевроном */}
          {isTech ? (
            <div className="absolute left-1/2 -translate-x-1/2 top-[132px]" style={{ filter: shadow('sm') }}>
              <div className="px-7 py-2" style={{ backgroundColor: C.hot, clipPath: blade(12) }}>
                <span className="block font-black uppercase tracking-[0.28em] text-[11px]" style={{ color: C.white }}>
                  ТЕХНИЧЕСКИЙ РЕЗУЛЬТАТ
                </span>
              </div>
            </div>
          ) : strengthText && currentPeriod !== 'SO' ? (
            <div className="absolute left-1/2 -translate-x-1/2 top-[132px]" style={{ filter: shadow('sm') }}>
              <div
                className="px-7 py-2 flex items-center gap-3 relative overflow-hidden"
                style={{ backgroundColor: isPP ? C.blue : C.navy2, clipPath: blade(12) }}
              >
                {isPP && <Hatch color="rgba(4,18,43,0.16)" step={12} drift />}
                <Snowflake size={13} color={isPP ? C.deep : C.blue} strokeWidth={1.5} style={{ animation: 'g3Spin 12s linear infinite' }} />
                <span className="block font-black uppercase tracking-[0.28em] text-[11px] relative z-10" style={{ color: isPP ? C.deep : C.ice }}>
                  {strengthText}
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </Reveal>
    </>
  );
}
