// src/components/WebGraphics/Graphics_3/Scoreboard.jsx
import React, { useState, useEffect, useRef } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';
import { DiagonalStripes, Snowflake } from './IceDecor';
import { TFH, cut, dropShadow } from './theme';

const formatTime = (s) => {
  if (s === undefined || s === null || isNaN(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;
};

// Буллиты: попадание — залитый ромб, промах — контурный ромб (плоская геометрия
// паттерна, без «галочек/крестиков» дефолтной графики).
const ShootoutGoalIcon = () => (
  <div className="w-3.5 h-3.5 rotate-45" style={{ backgroundColor: TFH.blue, boxShadow: `0 0 10px ${TFH.blue}` }} />
);
const ShootoutMissIcon = () => (
  <div className="w-3.5 h-3.5 rotate-45 border-2" style={{ borderColor: 'rgba(214,220,227,0.35)' }} />
);
const ShootoutEmptyIcon = () => (
  <div className="w-2 h-2 rotate-45" style={{ backgroundColor: 'rgba(214,220,227,0.18)' }} />
);

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
    if (currentPeriod === 'OT') return 'ОТ';
    if (currentPeriod === 'SO') return 'БУЛЛИТЫ';
    return `${currentPeriod} ПЕРИОД`;
  };

  const displaySeconds = getDisplaySeconds();
  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const homeLogo = getSafeUrl(game.home_team_logo);
  const awayLogo = getSafeUrl(game.away_team_logo);

  const homeColorHex = game.home_color_1 || TFH.blue;
  const awayColorHex = game.away_color_1 || TFH.ice;

  // =======================================================================
  // ЭФФЕКТ ГОЛА
  // =======================================================================
  const prevScoreRef = useRef({ home: game.home_score, away: game.away_score });
  const [goalEffect, setGoalEffect] = useState(null); // 'home' | 'away' | null
  const [shakeBoard, setShakeBoard] = useState(false);

  useEffect(() => {
    const prev = prevScoreRef.current;
    const newHome = game.home_score ?? 0;
    const newAway = game.away_score ?? 0;

    if (prev.home !== undefined && newHome > prev.home) {
      setGoalEffect('home');
      setShakeBoard(true);
      setTimeout(() => setShakeBoard(false), 900);
      setTimeout(() => setGoalEffect(null), 3200);
    } else if (prev.away !== undefined && newAway > prev.away) {
      setGoalEffect('away');
      setShakeBoard(true);
      setTimeout(() => setShakeBoard(false), 900);
      setTimeout(() => setGoalEffect(null), 3200);
    }

    prevScoreRef.current = { home: newHome, away: newAway };
  }, [game.home_score, game.away_score]);

  const isTech = !!game.is_technical;
  const techHome = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[0] : '+';
  const techAway = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[1] : '-';

  // =======================================================================
  // ЛОГИКА СЕРИИ БУЛЛИТОВ
  // =======================================================================
  const homeShootout = events.filter(e => e.period === 'SO' && e.team_id === game.home_team_id && ['shootout_goal', 'shootout_miss'].includes(e.event_type));
  const awayShootout = events.filter(e => e.period === 'SO' && e.team_id === game.away_team_id && ['shootout_goal', 'shootout_miss'].includes(e.event_type));

  let displaySlots = soLength;

  if (currentPeriod === 'SO') {
    const maxTaken = Math.max(homeShootout.length, awayShootout.length);
    const isRoundComplete = homeShootout.length === maxTaken && awayShootout.length === maxTaken;
    const homeSOGoals = homeShootout.filter(s => s.event_type === 'shootout_goal').length;
    const awaySOGoals = awayShootout.filter(s => s.event_type === 'shootout_goal').length;

    // Если раунд завершен, счет равный, и бросков сделано не меньше базового soLength - добавляем слот для sudden death
    if (isRoundComplete && homeSOGoals === awaySOGoals && maxTaken >= displaySlots) {
        displaySlots = maxTaken + 1;
    } else {
        displaySlots = Math.max(displaySlots, maxTaken);
    }
  }

  // =======================================================================
  // УМНАЯ ЛОГИКА СКРЫТИЯ ТАБЛО (ЗАЩИТА ОТ МИГАНИЯ ПРИ ТРАНЗИШЕНАХ)
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
  // ЛОГИКА ШТРАФОВ
  // =======================================================================
  const safePenalties = Array.isArray(activePenalties) ? activePenalties : [];
  const visibleHome = safePenalties.filter(p => p.team_id === game.home_team_id).slice(0, 2);
  const visibleAway = safePenalties.filter(p => p.team_id === game.away_team_id).slice(0, 2);

  const homePlayers = 5 - visibleHome.length;
  const awayPlayers = 5 - visibleAway.length;

  let strengthText = null;
  let isPP = false;

  if (homePlayers < 5 || awayPlayers < 5) {
    if (homePlayers === awayPlayers) {
        strengthText = `${homePlayers} НА ${awayPlayers}`;
    } else {
        isPP = true;
        strengthText = `БОЛЬШИНСТВО`;
    }
  }

  // =======================================================================
  // ВНУТРЕННИЙ КОМПОНЕНТ СТРОКИ КОМАНДЫ
  // =======================================================================
  const TeamRow = ({ logo, shortName, score, color, penalties, shootoutShots, isTopRow, isTechnical, isGoalScored }) => (
    <div
      className="flex items-stretch h-[64px] relative"
      style={{
        backgroundColor: TFH.navy,
        borderBottom: isTopRow ? `1px solid ${TFH.navyLine}` : 'none',
      }}
    >
      {/* Цветовой маркер команды — на голе разрастается волной.
          Растёт через scaleX, а не width: ширина рельса участвует в раскладке
          колонки, и её анимация дёргала бы всё табло (включая блок времени). */}
      <div
        className={`w-[10px] shrink-0 z-20 ${isGoalScored ? 'tfh-goal-rail' : ''}`}
        style={{
          backgroundColor: color,
          transformOrigin: 'left center',
          boxShadow: isGoalScored ? `0 0 26px 6px ${color}` : 'none',
        }}
      />

      <div className="flex items-center gap-4 w-[176px] pl-4 pr-2 z-10">
        {logo && (
          <img src={logo} alt="logo" className="w-9 h-9 object-contain shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
        )}
        <span className="font-black text-[25px] uppercase tracking-[0.06em] leading-none truncate" style={{ color: TFH.white }}>
          {shortName}
        </span>
      </div>

      {/* Счёт — отдельный блок со срезом, ярко подсвечивается на голе */}
      <div
        className="w-[62px] shrink-0 flex items-center justify-center z-10 transition-colors duration-300"
        style={{
          backgroundColor: isGoalScored ? color : TFH.navyMid,
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 12px 100%)',
        }}
      >
        <span
          className={`font-mono font-black text-[30px] tabular-nums leading-none ${isGoalScored ? 'tfh-goal-pop' : ''}`}
          style={{
            color: isTechnical ? '#FF6B6B' : TFH.white,
            textShadow: isGoalScored ? `0 0 24px rgba(255,255,255,0.9)` : 'none',
          }}
        >
          {score}
        </span>
      </div>

      {/* Слоты буллитов ИЛИ таймеры штрафов (кроме технического результата) */}
      {!isTechnical && (
        currentPeriod === 'SO' ? (
          <div className="flex items-center px-4 z-0" style={{ backgroundColor: TFH.navyDeep }}>
            <div className="flex gap-2.5 items-center justify-center">
              {Array.from({ length: displaySlots }).map((_, i) => {
                const shot = shootoutShots[i];
                if (!shot) return <ShootoutEmptyIcon key={i} />;
                if (shot.event_type === 'shootout_goal') return <ShootoutGoalIcon key={i} />;
                return <ShootoutMissIcon key={i} />;
              })}
            </div>
          </div>
        ) : penalties.length > 0 && (
          <div className="flex items-center px-4 z-0 relative" style={{ backgroundColor: TFH.blue }}>
            <DiagonalStripes color="rgba(6,21,48,0.18)" step={14} />
            <div className="flex gap-3 font-mono font-black text-[21px] tabular-nums tracking-tight relative z-10" style={{ color: TFH.navyDeep }}>
              {penalties.map(p => (
                <span key={p.id}>{formatTime(p.remaining)}</span>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );

  return (
    <AnimationWrapper
      type="scoreboard"
      isVisible={!isHidden}
      className="absolute top-10 left-12 flex flex-col items-start z-50"
    >
      <style>{`
        @keyframes tfhGoalPop {
          0%   { transform: scale(1); }
          12%  { transform: scale(1.9); }
          28%  { transform: scale(1.35); }
          44%  { transform: scale(1.7); }
          60%  { transform: scale(1.4); }
          78%  { transform: scale(1.55); }
          100% { transform: scale(1); }
        }
        @keyframes tfhGoalRail {
          0%   { transform: scaleX(1); }
          14%  { transform: scaleX(4.6); }
          34%  { transform: scaleX(2.6); }
          54%  { transform: scaleX(3.8); }
          76%  { transform: scaleX(1.8); }
          100% { transform: scaleX(1); }
        }
        @keyframes tfhBoardShake {
          0%, 100% { transform: translate3d(0, 0, 0); }
          10% { transform: translate3d(-7px, 3px, 0); }
          20% { transform: translate3d(6px, -3px, 0); }
          32% { transform: translate3d(-5px, 2px, 0); }
          44% { transform: translate3d(4px, -2px, 0); }
          58% { transform: translate3d(-3px, 1px, 0); }
          72% { transform: translate3d(2px, 0, 0); }
          86% { transform: translate3d(-1px, 0, 0); }
        }
        .tfh-goal-pop  { animation: tfhGoalPop 3s cubic-bezier(0.2, 0.9, 0.2, 1); display: inline-block; }
        .tfh-goal-rail { animation: tfhGoalRail 3s cubic-bezier(0.2, 0.9, 0.2, 1); }
        .tfh-board-shake { animation: tfhBoardShake 0.9s ease-out; }
      `}</style>

      <div style={{ filter: dropShadow('md') }} className={shakeBoard ? 'tfh-board-shake' : ''}>
        <div
          className="flex items-stretch relative"
          style={{ clipPath: cut(22, 0, 22, 0), backgroundColor: TFH.navy }}
        >
          <div className="tfh-sheen z-40" style={{ left: '-70%' }} />

          <div className="flex flex-col">
            <TeamRow
              logo={homeLogo} shortName={homeShortName} score={isTech ? techHome : game.home_score}
              color={homeColorHex} penalties={visibleHome} shootoutShots={homeShootout} isTopRow={true} isTechnical={isTech}
              isGoalScored={goalEffect === 'home'}
            />
            <TeamRow
              logo={awayLogo} shortName={awayShortName} score={isTech ? techAway : game.away_score}
              color={awayColorHex} penalties={visibleAway} shootoutShots={awayShootout} isTopRow={false} isTechnical={isTech}
              isGoalScored={goalEffect === 'away'}
            />
          </div>

          {/* Блок времени: срезан слева сверху — «клин», врезающийся в строки команд */}
          <div
            className="flex flex-col items-center justify-center w-[152px] relative overflow-hidden"
            style={{ backgroundColor: TFH.navyDeep, clipPath: 'polygon(26px 0, 100% 0, 100% 100%, 0 100%)' }}
          >
            <DiagonalStripes color="rgba(41,169,225,0.09)" step={22} drift />

            <div className="flex flex-col items-center z-10 w-full pl-5 pr-2">
              <span
                className="font-mono text-[32px] font-black tabular-nums leading-none tracking-tight transition-colors duration-300"
                style={{ color: isTimerRunning ? TFH.white : TFH.iceDim }}
              >
                {currentPeriod === 'SO' ? '0:00' : formatTime(displaySeconds)}
              </span>
              <div className="flex items-center gap-1.5 mt-1.5">
                <Snowflake
                  size={11}
                  color={TFH.blue}
                  strokeWidth={1.4}
                  style={{ animation: 'tfhSpin 14s linear infinite' }}
                />
                <span className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: TFH.blue }}>
                  {getPeriodText()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Плашка Технического Результата или Большинства — «отколотый» под 45° язычок */}
      {isTech ? (
        <div className="flex justify-start ml-[34px] -mt-px z-[-1]" style={{ filter: dropShadow('sm') }}>
          <div className="px-6 py-1.5" style={{ backgroundColor: '#C7343B', clipPath: cut(0, 0, 14, 14) }}>
            <span className="block text-[11px] font-black uppercase tracking-[0.25em]" style={{ color: TFH.white }}>
              ТЕХНИЧЕСКИЙ РЕЗУЛЬТАТ
            </span>
          </div>
        </div>
      ) : strengthText && currentPeriod !== 'SO' ? (
        <div className="flex justify-start ml-[34px] -mt-px z-[-1]" style={{ filter: dropShadow('sm') }}>
          <div
            className="px-6 py-1.5 relative overflow-hidden"
            style={{ backgroundColor: isPP ? TFH.blue : TFH.navyMid, clipPath: cut(0, 0, 14, 14) }}
          >
            {isPP && <DiagonalStripes color="rgba(6,21,48,0.16)" step={14} drift />}
            <span
              className="block text-[11px] font-black uppercase tracking-[0.25em] relative z-10"
              style={{ color: isPP ? TFH.navyDeep : TFH.ice }}
            >
              {strengthText}
            </span>
          </div>
        </div>
      ) : null}

    </AnimationWrapper>
  );
}
