// src/components/WebGraphics/Graphics_2/IntermissionOverlay.jsx
//
// Перерыв во весь кадр: сверху на графите счёт и обратный отсчёт, снизу светлая
// панель во всю ширину с таблицей по периодам (шайбы + броски в створ из
// period_scores и shots_summary) и протоколом авторов шайб.
import React, { useState, useEffect, useMemo } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { Cut } from './Cut';
import { Stage, PaperPanel } from './Stage';
import { Halftone, Tri, Bar } from './Shards';
import { Big, Num, Cap, Kicker } from './Type';
import { S, drop } from './theme';

const PANEL_H = 545;
const PERIOD_ORDER = ['1', '2', '3', 'OT', 'SO'];
const PERIOD_LABEL = { 1: '1 ПЕРИОД', 2: '2 ПЕРИОД', 3: '3 ПЕРИОД', OT: 'ОВЕРТАЙМ', SO: 'БУЛЛИТЫ' };
const PAGE_SIZE = 8;

export default function IntermissionOverlay({ game, overlay, timerSeconds, periodLength }) {
  const isVisible = overlay.visible && overlay.type === 'intermission';
  const [timeLeft, setTimeLeft] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!isVisible || !overlay.data) return;

    if (overlay.data.isPaused) {
      setTimeLeft(overlay.data.timeLeft || 0);
      return;
    }
    if (overlay.data.endTime) {
      const update = () => setTimeLeft(Math.max(0, Math.floor((overlay.data.endTime - Date.now()) / 1000)));
      update();
      const interval = setInterval(update, 1000);
      return () => clearInterval(interval);
    }
  }, [isVisible, overlay.data]);

  const allGoals = useMemo(
    () => [...(game?.goals || [])].sort((a, b) => a.time_seconds - b.time_seconds),
    [game?.goals]
  );
  const pageCount = Math.max(1, Math.ceil(allGoals.length / PAGE_SIZE));

  useEffect(() => {
    if (!isVisible || pageCount <= 1) { setPage(0); return; }
    const interval = setInterval(() => setPage(p => (p + 1) % pageCount), 6500);
    return () => clearInterval(interval);
  }, [isVisible, pageCount]);

  const table = useMemo(() => {
    const scores = game?.period_scores || {};
    const shots = Array.isArray(game?.shots_summary) ? game.shots_summary : [];

    const present = new Set(['1', '2', '3']);
    Object.keys(scores).forEach(k => present.add(String(k)));
    shots.forEach(s => present.add(String(s.period)));

    const cols = PERIOD_ORDER.filter(p => present.has(p));
    const shotFor = (teamId, period) => {
      const row = shots.find(s => String(s.period) === period && s.team_id === teamId);
      return row ? Number(row.shots_count) : null;
    };
    const sum = (arr) => arr.reduce((a, v) => a + (v || 0), 0);

    const build = (side, teamId) => {
      const goals = cols.map(p => (scores[p] ? Number(scores[p][side] ?? 0) : 0));
      const shotCells = cols.map(p => shotFor(teamId, p));
      return {
        goals, shots: shotCells,
        goalsTotal: sum(goals),
        shotsTotal: shotCells.some(v => v !== null) ? sum(shotCells) : null,
      };
    };

    return { cols, home: build('home', game?.home_team_id), away: build('away', game?.away_team_id) };
  }, [game?.period_scores, game?.shots_summary, game?.home_team_id, game?.away_team_id]);

  if (!game) return null;

  const formatCountdown = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  const homeLogo = getSafeUrl(game.home_team_logo);
  const awayLogo = getSafeUrl(game.away_team_logo);
  const homeColor = game.home_color_1 || S.yellow;
  const awayColor = game.away_color_1 || S.white;
  const pLen = (periodLength || 20) * 60;

  const statusText = () => {
    if (timerSeconds >= pLen * 3) return 'МАТЧ ЗАВЕРШЁН';
    if (timerSeconds >= pLen * 2) return 'ПЕРЕРЫВ ПОСЛЕ 2 ПЕРИОДА';
    if (timerSeconds >= pLen) return 'ПЕРЕРЫВ ПОСЛЕ 1 ПЕРИОДА';
    return 'ПЕРЕРЫВ';
  };

  const formatGoalTime = (secs) => {
    let p = 1; let r = secs;
    if (secs >= pLen * 3) { p = 'ОТ'; r = secs - pLen * 3; }
    else if (secs >= pLen * 2) { p = 3; r = secs - pLen * 2; }
    else if (secs >= pLen) { p = 2; r = secs - pLen; }
    return `${p}П ${Math.floor(r / 60)}:${('0' + (r % 60)).slice(-2)}`;
  };

  const isHot = timeLeft <= 60 && !overlay.data?.isPaused;
  const pageGoals = allGoals.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const ScoreSide = ({ logo, name, score, color, align }) => (
    <div className={`flex items-center gap-6 flex-1 min-w-0 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {logo && (
        <img src={logo} alt="" className="w-[104px] h-[104px] object-contain shrink-0"
             style={{ filter: 'drop-shadow(0 10px 20px rgba(0,0,0,0.6))' }}
             onError={(e) => { e.target.style.display = 'none'; }} />
      )}
      <div className={`flex flex-col min-w-0 ${align === 'right' ? 'items-start' : 'items-end'}`}>
        <div className={`truncate max-w-[360px] ${align === 'right' ? 'text-left' : 'text-right'}`}>
          <Big size={36} color={S.white}>{name}</Big>
        </div>
        <div className="h-[6px] w-[86px] mt-4" style={{ backgroundColor: color, clipPath: 'polygon(0 0, 100% 0, calc(100% - 6px) 100%, 0 100%)' }} />
      </div>
      <Num size={98} color={S.white} className="shrink-0">{score}</Num>
    </div>
  );

  // Строка таблицы на светлой панели: тонкие линейки, жёлтая метка, итог тёмным.
  const TableRow = ({ label, color, cells, total, dim }) => (
    <div className="flex items-stretch h-[40px]" style={{ borderTop: `2px solid ${S.paperLine}` }}>
      <div className="flex items-center gap-3.5 shrink-0" style={{ width: 250 }}>
        {color && <div className="w-3.5 h-3.5 shrink-0" style={{ backgroundColor: color, clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }} />}
        <Cap size={13} color={dim ? S.paperMute : S.coal} tracking="0.16em">{label}</Cap>
      </div>
      {cells.map((v, i) => (
        <div key={i} className="flex items-center justify-center flex-1">
          <span className="font-black tabular-nums leading-none" style={{ color: v === null ? S.paperLine : (dim ? S.paperMute : S.coal), fontSize: 25 }}>
            {v === null ? '—' : v}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-center shrink-0" style={{ width: 128 }}>
        <Num size={30} color={dim ? S.paperMute : S.coalDeep}>{total === null ? '—' : total}</Num>
      </div>
    </div>
  );

  return (
    <Cut isVisible={isVisible} variant="split" className="absolute inset-0 z-50">
      <Stage game={game} kicker="СЧЁТ МАТЧА" title={statusText()}>
        <div className="relative w-full h-full">

          {/* ---- СЧЁТ НА ГРАФИТЕ ---- */}
          <div className="absolute left-0 right-0 top-0 flex items-center gap-12 px-20" style={{ height: 770 - PANEL_H - 16 }}>
            <div className="flex-1 flex items-center gap-8 min-w-0">
              <ScoreSide logo={homeLogo} name={game.home_team_name} score={game.home_score} color={homeColor} />
              <div className="flex flex-col gap-2.5 shrink-0">
                <Tri size={13} color={S.yellow} />
                <Tri size={13} color={S.yellow} rotate={180} />
              </div>
              <ScoreSide logo={awayLogo} name={game.away_team_name} score={game.away_score} color={awayColor} align="right" />
            </div>

            {/* Обратный отсчёт — жёлтый блок */}
            <div className="shrink-0" style={{ filter: drop('lg') }}>
              <div
                className="relative overflow-hidden flex flex-col items-center justify-center"
                style={{ width: 300, height: 150, backgroundColor: S.yellow, clipPath: 'polygon(0 0, 100% 0, calc(100% - 22px) 100%, 0 100%)' }}
              >
                <Halftone color="rgba(43,43,43,0.16)" cell={9} dot={1.4} fade="to bottom" opacity={0.9} />
                <Cap size={10} color={S.coalDeep} tracking="0.28em" className="relative z-10">ДО СТАРТА ПЕРИОДА</Cap>
                <div className="mt-3 relative z-10">
                  <Num size={58} color={isHot ? S.red : S.coalDeep} className={isHot ? 'g2-blink' : ''}>
                    {formatCountdown(timeLeft)}
                  </Num>
                </div>
              </div>
            </div>
          </div>

          {/* ---- СВЕТЛАЯ ПАНЕЛЬ С ДАННЫМИ ---- */}
          <PaperPanel className="absolute left-0 right-0 bottom-0" style={{ height: PANEL_H }} seed={51}>
            <div className="h-full flex flex-col px-20 py-6">

              <Kicker size={12} textColor={S.coal} className="mb-1">СТАТИСТИКА ПО ПЕРИОДАМ</Kicker>

              <div className="shrink-0">
                <div className="flex items-stretch h-[32px]">
                  <div className="shrink-0" style={{ width: 250 }} />
                  {table.cols.map(p => (
                    <div key={p} className="flex items-center justify-center flex-1">
                      <Cap size={10} color={S.paperMute} tracking="0.24em">{PERIOD_LABEL[p]}</Cap>
                    </div>
                  ))}
                  <div className="flex items-center justify-center shrink-0" style={{ width: 128 }}>
                    <Cap size={10} color={S.coal} tracking="0.24em">ИТОГ</Cap>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-1">
                  <Cap size={9} color={S.paperMute} tracking="0.32em">ЗАБРОШЕННЫЕ ШАЙБЫ</Cap>
                  <div className="flex-1 h-px" style={{ backgroundColor: S.paperLine }} />
                </div>
                <TableRow label={game.home_short_name || 'ХОЗЯЕВА'} color={homeColor} cells={table.home.goals} total={table.home.goalsTotal} />
                <TableRow label={game.away_short_name || 'ГОСТИ'} color={awayColor} cells={table.away.goals} total={table.away.goalsTotal} />

                <div className="flex items-center gap-3 py-1 mt-1">
                  <Cap size={9} color={S.paperMute} tracking="0.32em">БРОСКИ В СТВОР</Cap>
                  <div className="flex-1 h-px" style={{ backgroundColor: S.paperLine }} />
                </div>
                <TableRow label={game.home_short_name || 'ХОЗЯЕВА'} color={homeColor} cells={table.home.shots} total={table.home.shotsTotal} dim />
                <TableRow label={game.away_short_name || 'ГОСТИ'} color={awayColor} cells={table.away.shots} total={table.away.shotsTotal} dim />
              </div>

              <div className="flex-1 mt-3 min-h-0 flex flex-col">
                <div className="flex items-center gap-4 mb-1">
                  <Kicker size={12} textColor={S.coal}>АВТОРЫ ЗАБРОШЕННЫХ ШАЙБ</Kicker>
                  <div className="flex-1 h-[2px]" style={{ backgroundColor: S.paperLine }} />
                  {pageCount > 1 && (
                    <div className="flex gap-2">
                      {Array.from({ length: pageCount }).map((_, i) => (
                        <Tri key={i} size={12} color={i === page ? S.yellow : S.paperLine} />
                      ))}
                    </div>
                  )}
                </div>

                {allGoals.length > 0 ? (
                  <div key={page} className="flex-1 grid grid-cols-2 gap-x-16 content-start g2-seq">
                    {pageGoals.map((goal, idx) => {
                      const isHome = goal.team_id === game.home_team_id;
                      const color = isHome ? homeColor : awayColor;
                      const assists = [];
                      if (goal.a1_last_name) assists.push(`${goal.a1_last_name} ${goal.a1_first_name?.[0] || ''}.`.trim());
                      if (goal.a2_last_name) assists.push(`${goal.a2_last_name} ${goal.a2_first_name?.[0] || ''}.`.trim());

                      return (
                        <div key={goal.id || idx} className="flex items-center gap-4 h-[46px]" style={{ borderBottom: `2px solid ${S.paperLine}` }}>
                          <div className="w-3 h-3 shrink-0" style={{ backgroundColor: color, clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)' }} />
                          <span className="font-black tabular-nums leading-none shrink-0 w-[84px]" style={{ color: S.paperMute, fontSize: 15 }}>
                            {formatGoalTime(goal.time_seconds)}
                          </span>
                          {goal.player_number != null && (
                            <span className="font-black tabular-nums leading-none shrink-0 w-[44px] text-right" style={{ color: S.yellowDeep, fontSize: 20 }}>
                              {goal.player_number}
                            </span>
                          )}
                          <span className="font-black uppercase leading-none truncate" style={{ color: S.coal, fontSize: 21, letterSpacing: '-0.01em' }}>
                            {goal.scorer_last_name}
                          </span>
                          <Cap size={12} color={S.paperMute} tracking="0.12em" className="truncate">{goal.scorer_first_name}</Cap>
                          <div className="flex-1" />
                          {assists.length > 0 && (
                            <Cap size={12} color={S.paperMute} tracking="0.1em" className="truncate shrink-0" style={{ maxWidth: 240 }}>
                              {assists.join(' · ')}
                            </Cap>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center gap-6">
                    <Bar w={40} h={7} color={S.paperLine} />
                    <Cap size={15} color={S.paperMute} tracking="0.3em">ЗАБРОШЕННЫЕ ШАЙБЫ ОТСУТСТВУЮТ</Cap>
                    <Bar w={40} h={7} color={S.paperLine} />
                  </div>
                )}
              </div>
            </div>
          </PaperPanel>
        </div>
      </Stage>
    </Cut>
  );
}
