// src/components/WebGraphics/Graphics_2/Scoreboard.jsx
//
// Табло лиги 2 — графитовая плашка у левой кромки, к которой встык приставлен
// ЖЁЛТЫЙ блок времени с тёмными цифрами. Из стыка вылетает россыпь осколков.
// Под плашкой — тонкая строка лиги, дивизиона и тура, ниже штрафы.
import React, { useState, useEffect, useRef } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { Cut } from './Cut';
import { Card } from './Stage';
import { ShardField, ShardBurst, Halftone, Tri, TriOutline, Bar } from './Shards';
import { Big, Num, Cap } from './Type';
import { S, SHARD_PALETTE, drop } from './theme';

const formatTime = (s) => {
  if (s === undefined || s === null || isNaN(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;
};

const BAR_W = 660;
const BAR_H = 98;
const CLOCK_W = 224;

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
  const homeShort = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShort = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const homeLogo = getSafeUrl(game.home_team_logo);
  const awayLogo = getSafeUrl(game.away_team_logo);

  const homeColor = game.home_color_1 || S.yellow;
  const awayColor = game.away_color_1 || S.ash;

  // ---- Эффект гола --------------------------------------------------------
  const prevScoreRef = useRef({ home: game.home_score, away: game.away_score });
  const [goalEffect, setGoalEffect] = useState(null);
  const [jolt, setJolt] = useState(false);

  useEffect(() => {
    const prev = prevScoreRef.current;
    const h = game.home_score ?? 0;
    const a = game.away_score ?? 0;
    const scored = (prev.home !== undefined && h > prev.home) ? 'home'
      : (prev.away !== undefined && a > prev.away) ? 'away' : null;

    if (scored) {
      setGoalEffect(scored);
      setJolt(true);
      setTimeout(() => setJolt(false), 620);
      setTimeout(() => setGoalEffect(null), 3200);
    }
    prevScoreRef.current = { home: h, away: a };
  }, [game.home_score, game.away_score]);

  const isTech = !!game.is_technical;
  const techHome = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[0] : '+';
  const techAway = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[1] : '-';

  // ---- Буллиты ------------------------------------------------------------
  const homeSO = events.filter(e => e.period === 'SO' && e.team_id === game.home_team_id && ['shootout_goal', 'shootout_miss'].includes(e.event_type));
  const awaySO = events.filter(e => e.period === 'SO' && e.team_id === game.away_team_id && ['shootout_goal', 'shootout_miss'].includes(e.event_type));

  let slots = soLength;
  if (currentPeriod === 'SO') {
    const maxTaken = Math.max(homeSO.length, awaySO.length);
    const roundComplete = homeSO.length === maxTaken && awaySO.length === maxTaken;
    const hG = homeSO.filter(s => s.event_type === 'shootout_goal').length;
    const aG = awaySO.filter(s => s.event_type === 'shootout_goal').length;
    // Раунд сыгран, счёт равный и бросков не меньше базового soLength — слот на sudden death
    if (roundComplete && hG === aG && maxTaken >= slots) slots = maxTaken + 1;
    else slots = Math.max(slots, maxTaken);
  }

  // ---- Скрытие под полноэкранными плашками --------------------------------
  // scorebar — не полноэкранная плашка, но это РАЗВЁРНУТОЕ табло внизу кадра:
  // вместе с компактным счёт висел бы в кадре дважды, поэтому прячемся так же.
  const fullScreen = ['prematch', 'scorebar', 'bumper', 'intermission', 'team_leaders', 'team_roster'];
  const isFullScreenActive = overlay?.visible && fullScreen.includes(overlay?.type);
  const [hideForOverlay, setHideForOverlay] = useState(false);

  useEffect(() => {
    if (isFullScreenActive) setHideForOverlay(true);
    else {
      const t = setTimeout(() => setHideForOverlay(false), 600);
      return () => clearTimeout(t);
    }
  }, [isFullScreenActive]);

  const isHidden = !isScoreboardVisible || hideForOverlay;

  // ---- Штрафы -------------------------------------------------------------
  const safePenalties = Array.isArray(activePenalties) ? activePenalties : [];
  const penHome = safePenalties.filter(p => p.team_id === game.home_team_id).slice(0, 2);
  const penAway = safePenalties.filter(p => p.team_id === game.away_team_id).slice(0, 2);

  const homePlayers = 5 - penHome.length;
  const awayPlayers = 5 - penAway.length;

  let strengthText = null;
  let isPP = false;
  if (homePlayers < 5 || awayPlayers < 5) {
    if (homePlayers === awayPlayers) strengthText = `${homePlayers} НА ${awayPlayers}`;
    else { isPP = true; strengthText = 'БОЛЬШИНСТВО'; }
  }

  const stubText = [
    game.league_name,
    game.division_name || game.division_short_name,
    game.stage_type === 'playoff' ? `МАТЧ ${game.series_number || 1}` : `ТУР ${game.series_number || 1}`,
  ].filter(Boolean).join('  ·  ').toUpperCase();

  // ---- Элементы -----------------------------------------------------------
  const TeamSide = ({ logo, short, score, color, scored, side }) => {
    const home = side === 'home';
    return (
      <div className={`flex items-center gap-4 ${home ? '' : 'flex-row-reverse'}`}>
        {logo && (
          <img src={logo} alt="" className="w-[46px] h-[46px] object-contain shrink-0"
               onError={(e) => { e.target.style.display = 'none'; }} />
        )}

        <div className={`flex flex-col ${home ? 'items-start' : 'items-end'} gap-2.5`}>
          <Big size={27} color={S.white}>{short}</Big>
          <div className="h-[5px] w-[36px]" style={{ backgroundColor: color, clipPath: 'polygon(0 0, 100% 0, calc(100% - 5px) 100%, 0 100%)' }} />
        </div>

        <div className="relative flex items-center justify-center" style={{ width: 76 }}>
          {scored && (
            <ShardBurst size={230} seed={7} className="g2-burst left-1/2 top-1/2 z-0" style={{ transform: 'translate(-50%,-50%)' }} />
          )}
          <span className={`relative z-10 ${scored ? 'g2-score-pop' : ''}`}>
            <Num size={52} color={scored ? S.yellow : S.white}>{score}</Num>
          </span>
        </div>
      </div>
    );
  };

  // Буллиты: треугольник — залитый (гол), контурный (промах), точка (не пробит)
  const SoRow = ({ shots }) => (
    <div className="flex gap-2.5 items-center">
      {Array.from({ length: slots }).map((_, i) => {
        const s = shots[i];
        if (!s) return <div key={i} className="w-2 h-2 rounded-full" style={{ backgroundColor: S.line }} />;
        if (s.event_type === 'shootout_goal') return <Tri key={i} size={14} color={S.yellow} />;
        return <TriOutline key={i} size={14} color={S.ash} />;
      })}
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes g2ScorePop {
          0%   { transform: scale(1); }
          14%  { transform: scale(1.65); }
          32%  { transform: scale(1.22); }
          52%  { transform: scale(1.42); }
          76%  { transform: scale(1.14); }
          100% { transform: scale(1); }
        }
        .g2-score-pop { animation: g2ScorePop 3s cubic-bezier(0.2, 0.9, 0.2, 1); display: inline-block; }
      `}</style>

      <Cut isVisible={!isHidden} variant="shear" className="absolute top-10 left-0 z-50">
        <div className={`relative ${jolt ? 'g2-jolt' : ''}`}>

          {/* Осколки, вылетающие из стыка плашек вправо */}
          <ShardField
            count={16} seed={11} origin={[0, 60]} dir={-24} spread={80} reach={86} size={20}
            palette={SHARD_PALETTE.onCoal} opacity={0.9}
            className="pointer-events-none"
            style={{ left: BAR_W + CLOCK_W - 30, top: -40, width: 320, height: BAR_H + 120 }}
          />

          <div className="flex items-stretch relative z-10">
            <Card style={{ width: BAR_W, height: BAR_H }} seed={13}>
              <div className="flex items-center justify-between h-full pl-8 pr-7">
                <TeamSide logo={homeLogo} short={homeShort} score={isTech ? techHome : game.home_score}
                          color={homeColor} scored={goalEffect === 'home'} side="home" />

                <Bar w={24} h={7} color={S.line} className="mx-2" />

                <TeamSide logo={awayLogo} short={awayShort} score={isTech ? techAway : game.away_score}
                          color={awayColor} scored={goalEffect === 'away'} side="away" />
              </div>
            </Card>

            {/* Жёлтый блок времени */}
            <div style={{ filter: drop('lg') }}>
              <div
                className="relative overflow-hidden flex flex-col items-center justify-center"
                style={{ width: CLOCK_W, height: BAR_H, backgroundColor: S.yellow }}
              >
                <Halftone color="rgba(43,43,43,0.16)" cell={9} dot={1.4} fade="to bottom" opacity={0.9} />
                <div className="g2-gleam z-20" style={{ left: '-40%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)' }} />

                <Num size={46} color={S.coalDeep} className="relative z-10"
                     style={isTimerRunning ? undefined : { opacity: 0.42 }}>
                  {currentPeriod === 'SO' ? '0:00' : formatTime(displaySeconds)}
                </Num>
                <div className="mt-2 relative z-10">
                  <Cap size={11} color={S.coalDeep} tracking="0.22em">{getPeriodText()}</Cap>
                </div>
              </div>
            </div>
          </div>

          {/* Строка лиги · дивизиона · тура */}
          <div
            className="absolute left-0 flex items-center gap-4 pl-8 pr-7"
            style={{ top: BAR_H, height: 38, backgroundColor: 'rgba(20,20,20,0.92)', maxWidth: BAR_W }}
          >
            <Tri size={11} color={S.yellow} rotate={90} />
            <Cap size={11} color={S.ash} tracking="0.2em" className="truncate">{stubText}</Cap>
          </div>

          {/* Штрафы / буллиты */}
          {!isTech && (
            currentPeriod === 'SO' ? (
              <div className="absolute left-8 flex items-center gap-9" style={{ top: BAR_H + 58 }}>
                {[{ s: homeSO, n: homeShort }, { s: awaySO, n: awayShort }].map((x, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Cap size={11} color={S.ash} tracking="0.2em">{x.n}</Cap>
                    <SoRow shots={x.s} />
                  </div>
                ))}
              </div>
            ) : (penHome.length > 0 || penAway.length > 0) && (
              <div className="absolute left-0 flex flex-col gap-2 items-start" style={{ top: BAR_H + 54 }}>
                {[...penHome, ...penAway].map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-4 pl-5 pr-6 py-2.5"
                    style={{ backgroundColor: S.red, filter: drop('sm'), clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)' }}
                  >
                    <Cap size={11} color={S.white} tracking="0.16em">{p.player_name || 'ШТРАФ'}</Cap>
                    <Num size={20} color={S.white}>{formatTime(p.remaining)}</Num>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Технический результат / неравные составы */}
          {isTech ? (
            <div className="absolute" style={{ left: BAR_W + 20, top: BAR_H + 14, filter: drop('sm') }}>
              <div className="px-5 py-2.5" style={{ backgroundColor: S.red, clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)' }}>
                <Cap size={10} color={S.white} tracking="0.22em">ТЕХНИЧЕСКИЙ РЕЗУЛЬТАТ</Cap>
              </div>
            </div>
          ) : strengthText && currentPeriod !== 'SO' ? (
            <div className="absolute" style={{ left: BAR_W + 20, top: BAR_H + 14, filter: drop('sm') }}>
              <div
                className="flex items-center gap-3 px-5 py-2.5"
                style={{ backgroundColor: isPP ? S.yellow : 'rgba(20,20,20,0.92)', clipPath: 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)' }}
              >
                <Tri size={11} color={isPP ? S.coalDeep : S.yellow} className={isPP ? 'g2-blink' : ''} />
                <Cap size={10} color={isPP ? S.coalDeep : S.ash} tracking="0.22em">{strengthText}</Cap>
              </div>
            </div>
          ) : null}
        </div>
      </Cut>
    </>
  );
}
