// src/components/WebGraphics/Graphics_3/IntermissionOverlay.jsx
//
// Перерыв на ВЕСЬ кадр. Дефолт показывает счёт и вертикальную карусель голов по
// одному. Здесь перерыв превращён в «карточку матча»: счёт одной строкой сверху,
// ледяная таблица ПО ПЕРИОДАМ (шайбы + броски в створ — поля period_scores и
// shots_summary, которых дефолтная графика не использует вообще) и сетка авторов
// заброшенных шайб сразу по шесть, с постраничным перелистыванием.
import React, { useState, useEffect, useMemo } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { getImageUrl } from '../../../utils/helpers';
import { Reveal } from './Reveal';
import { FullFrame } from './Frame';
import { Hatch, Snowflake } from './IcePattern';
import { C, cut, blade, shadow } from './theme';

const PERIOD_ORDER = ['1', '2', '3', 'OT', 'SO'];
const PERIOD_LABEL = { 1: '1', 2: '2', 3: '3', OT: 'ОТ', SO: 'Б' };
const PAGE_SIZE = 6;

export default function IntermissionOverlay({ game, overlay, timerSeconds, periodLength }) {
  const isVisible = overlay.visible && overlay.type === 'intermission';
  const [timeLeft, setTimeLeft] = useState(0);
  const [page, setPage] = useState(0);

  // Таймер перерыва
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

  // Перелистывание страниц авторов шайб
  useEffect(() => {
    if (!isVisible || pageCount <= 1) { setPage(0); return; }
    const interval = setInterval(() => setPage(p => (p + 1) % pageCount), 6000);
    return () => clearInterval(interval);
  }, [isVisible, pageCount]);

  // Таблица по периодам: шайбы из period_scores, броски из shots_summary.
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

    const build = (side, teamId) => {
      const goalCells = cols.map(p => (scores[p] ? Number(scores[p][side] ?? 0) : null));
      const shotCells = cols.map(p => shotFor(teamId, p));
      const sum = (arr) => arr.reduce((a, v) => a + (v || 0), 0);
      return {
        goals: goalCells,
        shots: shotCells,
        goalsTotal: sum(goalCells),
        shotsTotal: shotCells.some(v => v !== null) ? sum(shotCells) : null,
      };
    };

    return {
      cols,
      home: build('home', game?.home_team_id),
      away: build('away', game?.away_team_id),
    };
  }, [game?.period_scores, game?.shots_summary, game?.home_team_id, game?.away_team_id]);

  if (!game) return null;

  const formatCountdown = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  const homeLogo = getSafeUrl(game.home_team_logo);
  const awayLogo = getSafeUrl(game.away_team_logo);
  const defaultAvatar = getImageUrl('default/user_default.webp');

  const homeColor = game.home_color_1 || C.blueDk;
  const awayColor = game.away_color_1 || C.ice2;

  const getPeriodStatusText = () => {
    const pLen = (periodLength || 20) * 60;
    if (timerSeconds >= pLen * 3) return 'МАТЧ ЗАВЕРШЁН';
    if (timerSeconds >= pLen * 2) return 'ПЕРЕРЫВ ПОСЛЕ 2 ПЕРИОДА';
    if (timerSeconds >= pLen) return 'ПЕРЕРЫВ ПОСЛЕ 1 ПЕРИОДА';
    return 'ПЕРЕРЫВ';
  };

  const formatGoalTime = (secs) => {
    const pLen = (periodLength || 20) * 60;
    let p = 1; let r = secs;
    if (secs >= pLen * 3) { p = 'ОТ'; r = secs - pLen * 3; }
    else if (secs >= pLen * 2) { p = 3; r = secs - pLen * 2; }
    else if (secs >= pLen) { p = 2; r = secs - pLen; }
    return `${p}П ${Math.floor(r / 60)}:${('0' + (r % 60)).slice(-2)}`;
  };

  const getPlayerPhoto = (goal) => {
    const roster = goal.team_id === game.home_team_id ? game.home_roster : game.away_roster;
    const player = roster?.find(p => p.last_name === goal.scorer_last_name && p.first_name === goal.scorer_first_name);
    return getSafeUrl(player?.avatar_url) || defaultAvatar;
  };

  const isHot = timeLeft <= 60 && !overlay.data?.isPaused;
  const pageGoals = allGoals.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // --- Строка счёта ---------------------------------------------------------
  const ScoreSide = ({ logo, name, score, color, align }) => (
    <div className={`flex items-center gap-8 flex-1 min-w-0 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {logo && (
        <img src={logo} alt="" className="w-[128px] h-[128px] object-contain shrink-0 drop-shadow-[0_14px_26px_rgba(0,0,0,0.7)]"
             onError={(e) => { e.target.style.display = 'none'; }} />
      )}
      <div className={`flex flex-col min-w-0 ${align === 'right' ? 'items-end' : ''}`}>
        <span className={`font-black uppercase text-[44px] leading-[0.95] truncate max-w-[440px] ${align === 'right' ? 'text-right' : ''}`} style={{ color: C.white }}>
          {name}
        </span>
        <div className="h-[7px] w-[130px] mt-4" style={{ backgroundColor: color, clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 100%, 7px 100%)' }} />
      </div>
      <div className="flex-1" />
      <div
        className="w-[140px] h-[132px] shrink-0 flex items-center justify-center relative"
        style={{ backgroundColor: C.ice, clipPath: align === 'right' ? cut(0, 26, 0, 26) : cut(26, 0, 26, 0) }}
      >
        <Hatch color="rgba(11,42,91,0.06)" step={18} />
        <span className="font-mono font-black text-[96px] tabular-nums leading-none relative z-10" style={{ color: C.deep }}>
          {score}
        </span>
      </div>
    </div>
  );

  // --- Таблица по периодам --------------------------------------------------
  const TableRow = ({ label, color, cells, total, dim }) => (
    <div className="flex items-center h-[54px]">
      <div className="w-[172px] flex items-center gap-3 shrink-0">
        {color && <div className="w-2.5 h-2.5 rotate-45 shrink-0" style={{ backgroundColor: color }} />}
        <span className="font-black uppercase tracking-[0.14em] text-[13px] truncate" style={{ color: dim ? C.slate : C.deep }}>
          {label}
        </span>
      </div>
      {cells.map((v, i) => (
        <div key={i} className="flex-1 text-center">
          <span className="font-mono font-black text-[26px] tabular-nums" style={{ color: v === null ? 'rgba(76,100,128,0.35)' : (dim ? C.slate : C.deep) }}>
            {v === null ? '–' : v}
          </span>
        </div>
      ))}
      <div className="w-[86px] text-center shrink-0" style={{ borderLeft: `2px solid rgba(11,42,91,0.14)` }}>
        <span className="font-mono font-black text-[30px] tabular-nums" style={{ color: total === null ? 'rgba(76,100,128,0.35)' : C.blueDk }}>
          {total === null ? '–' : total}
        </span>
      </div>
    </div>
  );

  return (
    <Reveal isVisible={isVisible} variant="takeover" className="absolute inset-0 z-50">
      <FullFrame game={game} title={getPeriodStatusText()}>
        <div className="flex-1 flex flex-col px-14 pt-9 pb-6 min-h-0">

          {/* ---------- СЧЁТ + ОБРАТНЫЙ ОТСЧЁТ ---------- */}
          <div className="flex items-stretch gap-10 shrink-0">
            <div className="flex-1 flex items-center gap-10 min-w-0">
              <ScoreSide logo={homeLogo} name={game.home_team_name} score={game.home_score} color={homeColor} />
              <div className="flex flex-col items-center gap-2 shrink-0">
                <div className="w-3 h-3 rotate-45" style={{ backgroundColor: C.blue }} />
                <div className="w-3 h-3 rotate-45" style={{ backgroundColor: C.blue }} />
              </div>
              <ScoreSide logo={awayLogo} name={game.away_team_name} score={game.away_score} color={awayColor} align="right" />
            </div>

            <div className="w-[400px] shrink-0" style={{ filter: shadow('lg') }}>
              <div className="h-full flex flex-col items-center justify-center relative overflow-hidden"
                   style={{ backgroundColor: C.navy2, clipPath: cut(30, 0, 30, 0) }}>
                <Hatch color="rgba(255,255,255,0.05)" step={22} drift />
                <Snowflake size={170} color={C.blue} strokeWidth={1}
                           className="absolute -right-8 -top-8 pointer-events-none"
                           style={{ opacity: 0.16, animation: 'g3Spin 50s linear infinite' }} />
                <span className="font-black uppercase tracking-[0.3em] text-[12px] relative z-10" style={{ color: C.blue }}>
                  ДО СТАРТА ПЕРИОДА
                </span>
                <span
                  className={`font-mono font-black text-[86px] tabular-nums leading-none tracking-tighter relative z-10 mt-2 ${isHot ? 'g3-blink' : ''}`}
                  style={{ color: isHot ? C.hot : C.white }}
                >
                  {formatCountdown(timeLeft)}
                </span>
              </div>
            </div>
          </div>

          {/* ---------- ТАБЛИЦА + АВТОРЫ ШАЙБ ---------- */}
          <div className="flex-1 flex gap-10 mt-9 min-h-0">

            {/* Таблица по периодам */}
            <div className="w-[620px] shrink-0" style={{ filter: shadow('lg') }}>
              <div className="h-full relative overflow-hidden px-9 py-7" style={{ backgroundColor: C.ice, clipPath: blade(40) }}>
                <Hatch color="rgba(11,42,91,0.05)" step={22} />
                <div className="g3-gleam g3-gleam-dark" style={{ left: '-60%' }} />

                <div className="relative z-10 flex flex-col h-full">
                  {/* Заголовок колонок */}
                  <div className="flex items-center h-[42px]">
                    <div className="w-[172px] shrink-0">
                      <span className="font-black uppercase tracking-[0.3em] text-[11px]" style={{ color: C.blueDk }}>ПЕРИОД</span>
                    </div>
                    {table.cols.map(p => (
                      <div key={p} className="flex-1 text-center">
                        <span className="font-black uppercase text-[15px]" style={{ color: C.blueDk }}>{PERIOD_LABEL[p]}</span>
                      </div>
                    ))}
                    <div className="w-[86px] text-center shrink-0">
                      <span className="font-black uppercase text-[13px] tracking-[0.1em]" style={{ color: C.blueDk }}>ИТОГ</span>
                    </div>
                  </div>

                  <div className="h-[3px] w-full my-2" style={{ backgroundColor: 'rgba(11,42,91,0.16)' }} />

                  <span className="font-black uppercase tracking-[0.3em] text-[10px] mt-1 mb-1" style={{ color: C.slate }}>ЗАБРОШЕННЫЕ ШАЙБЫ</span>
                  <TableRow label={game.home_short_name || 'ХОЗЯЕВА'} color={homeColor} cells={table.home.goals} total={table.home.goalsTotal} />
                  <TableRow label={game.away_short_name || 'ГОСТИ'} color={awayColor} cells={table.away.goals} total={table.away.goalsTotal} />

                  <div className="h-px w-full my-3" style={{ backgroundColor: 'rgba(11,42,91,0.12)' }} />

                  <span className="font-black uppercase tracking-[0.3em] text-[10px] mb-1" style={{ color: C.slate }}>БРОСКИ В СТВОР</span>
                  <TableRow label={game.home_short_name || 'ХОЗЯЕВА'} color={homeColor} cells={table.home.shots} total={table.home.shotsTotal} dim />
                  <TableRow label={game.away_short_name || 'ГОСТИ'} color={awayColor} cells={table.away.shots} total={table.away.shotsTotal} dim />
                </div>
              </div>
            </div>

            {/* Авторы заброшенных шайб */}
            <div className="flex-1 flex flex-col min-w-0">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <div className="flex items-center gap-3.5">
                  <div className="w-3 h-3 rotate-45" style={{ backgroundColor: C.blue }} />
                  <span className="font-black uppercase tracking-[0.28em] text-[13px]" style={{ color: C.blue }}>
                    АВТОРЫ ЗАБРОШЕННЫХ ШАЙБ
                  </span>
                </div>
                {pageCount > 1 && (
                  <div className="flex gap-2">
                    {Array.from({ length: pageCount }).map((_, i) => (
                      <div key={i} className="w-2.5 h-2.5 rotate-45 transition-colors duration-300"
                           style={{ backgroundColor: i === page ? C.blue : 'rgba(232,241,248,0.25)' }} />
                    ))}
                  </div>
                )}
              </div>

              {allGoals.length > 0 ? (
                <div key={page} className="grid grid-cols-2 gap-x-6 gap-y-4 content-start g3-stagger">
                  {pageGoals.map((goal, idx) => {
                    const isHome = goal.team_id === game.home_team_id;
                    const color = isHome ? homeColor : awayColor;
                    const logo = isHome ? homeLogo : awayLogo;

                    const assists = [];
                    if (goal.a1_last_name) assists.push(`${goal.a1_last_name} ${goal.a1_first_name?.[0] || ''}.`.trim());
                    if (goal.a2_last_name) assists.push(`${goal.a2_last_name} ${goal.a2_first_name?.[0] || ''}.`.trim());

                    return (
                      <div
                        key={goal.id || idx}
                        className="flex items-center h-[124px] relative overflow-hidden"
                        style={{ backgroundColor: C.navy2, clipPath: cut(22, 0, 22, 0) }}
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-[7px] z-20" style={{ backgroundColor: color }} />
                        <Hatch color="rgba(255,255,255,0.04)" step={18} />

                        <img
                          src={getPlayerPhoto(goal)} alt=""
                          className="w-[104px] h-[124px] object-cover object-top shrink-0 ml-[7px] relative z-10"
                          onError={(e) => { e.target.onerror = null; e.target.src = defaultAvatar; }}
                        />

                        <div className="flex-1 min-w-0 px-5 relative z-10">
                          <div className="flex items-center gap-2.5 mb-1.5">
                            <span className="font-mono font-black text-[12px] px-2 py-0.5"
                                  style={{ backgroundColor: C.blue, color: C.deep }}>
                              {formatGoalTime(goal.time_seconds)}
                            </span>
                            {goal.player_number != null && (
                              <span className="font-mono font-black text-[13px]" style={{ color: C.steel }}>
                                №{goal.player_number}
                              </span>
                            )}
                          </div>
                          <span className="block font-black uppercase text-[24px] leading-none truncate" style={{ color: C.white }}>
                            {goal.scorer_last_name}
                          </span>
                          <span className="block font-bold uppercase text-[13px] tracking-[0.14em] leading-none mt-1.5 truncate" style={{ color: C.steel }}>
                            {goal.scorer_first_name}
                          </span>
                          {assists.length > 0 && (
                            <span className="block font-bold uppercase text-[11px] tracking-[0.12em] leading-none mt-2 truncate" style={{ color: C.blue }}>
                              {assists.join(' • ')}
                            </span>
                          )}
                        </div>

                        {logo && (
                          <img src={logo} alt="" className="w-[54px] h-[54px] object-contain mr-5 shrink-0 relative z-10 opacity-80"
                               onError={(e) => { e.target.style.display = 'none'; }} />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <Snowflake size={110} color={C.blue} strokeWidth={1.1} style={{ opacity: 0.3, animation: 'g3Spin 40s linear infinite' }} />
                  <span className="font-black uppercase tracking-[0.24em] text-[15px] mt-7" style={{ color: C.steel }}>
                    Заброшенные шайбы отсутствуют
                  </span>
                </div>
              )}
            </div>
          </div>

        </div>
      </FullFrame>
    </Reveal>
  );
}
