// src/components/WebGraphics/Graphics_3/IntermissionOverlay.jsx
//
// Перерыв: панель поверх картинки. Сверху симметричный счёт — команды по краям,
// отсчёт до старта периода тёмной «шайбой» РОВНО ПО ЦЕНТРУ между ними. Снизу
// два блока рядом: слева таблица по периодам, справа протокол авторов шайб.
// Прежняя раскладка (отсчёт прижат к правому краю, одна широкая панель на всё)
// оставляла протокол в две колонки полупустым.
import React, { useState, useEffect, useMemo } from 'react';
import { Reveal } from './Reveal';
import { Stage, DataPanel, PAD_X } from './Rink';
import { Dark, Crest, Rule } from './Frost';
import { Display, Head, Num, Label, Kicker } from './Type';
import { T, R, formatClock } from './theme';

const TOP_H = 186;
const GOALS_W = 618;
const PERIOD_ORDER = ['1', '2', '3', 'OT', 'SO'];
const PERIOD_LABEL = { 1: '1 ПЕРИОД', 2: '2 ПЕРИОД', 3: '3 ПЕРИОД', OT: 'ОВЕРТАЙМ', SO: 'БУЛЛИТЫ' };
const PAGE_SIZE = 7;
const LABEL_W = 190;
const TOTAL_W = 96;

// Компоненты объявлены НА УРОВНЕ МОДУЛЯ: внутри плашки они пересоздавались бы
// на каждый тик отсчёта, и React перемонтировал бы поддерево — эмблемы команд
// перезагружались бы раз в секунду.
function ScoreSide({ logo, name, score, color, align }) {
  const right = align === 'right';
  return (
    <div className={`flex items-center gap-6 flex-1 min-w-0 ${right ? 'flex-row-reverse' : ''}`}>
      <Crest logo={logo} size={116} accent={color} />
      <div className={`flex flex-col min-w-0 flex-1 ${right ? 'items-start' : 'items-end'}`}>
        <div className={`w-full ${right ? 'text-left' : 'text-right'}`}>
          <Display size={34}>{name}</Display>
        </div>
        <div className="h-[5px] w-[82px] mt-3 rounded-full" style={{ backgroundColor: color }} />
      </div>
      <Num size={88} color={T.head} className="shrink-0">{score}</Num>
    </div>
  );
}

// Строка таблицы: пустая клетка — прочерк цветом --muted, итог акцентом.
function TableRow({ label, color, cells, total, dim }) {
  return (
    <div className="flex items-stretch h-[40px]" style={{ borderTop: `1px solid ${T.divider}` }}>
      <div className="flex items-center gap-3 shrink-0" style={{ width: LABEL_W }}>
        {color && <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />}
        <Label size={12} color={dim ? T.label : T.head} tracking="0.12em" weight={800}>{label}</Label>
      </div>
      {cells.map((v, i) => (
        <div key={i} className="flex items-center justify-center flex-1">
          <Num size={23} color={v === null ? T.muted : (dim ? T.label : T.body)}>{v === null ? '—' : v}</Num>
        </div>
      ))}
      <div className="flex items-center justify-center shrink-0" style={{ width: TOTAL_W }}>
        <Num size={26} color={dim ? T.label : T.accNum}>{total === null ? '—' : total}</Num>
      </div>
    </div>
  );
}

function GoalRow({ goal, color, time }) {
  const assists = [];
  if (goal.a1_last_name) assists.push(`${goal.a1_last_name} ${goal.a1_first_name?.[0] || ''}.`.trim());
  if (goal.a2_last_name) assists.push(`${goal.a2_last_name} ${goal.a2_first_name?.[0] || ''}.`.trim());

  return (
    <div className="flex items-center gap-3.5 h-[46px]" style={{ borderBottom: `1px solid ${T.divider}` }}>
      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <Num size={13} color={T.muted} className="shrink-0 w-[68px]">{time}</Num>
      {goal.player_number != null && (
        <div className="shrink-0 w-[36px] text-right">
          <Num size={19} color={T.accNum}>{goal.player_number}</Num>
        </div>
      )}
      <Head size={20} className="truncate">{goal.scorer_last_name}</Head>
      <div className="flex-1" />
      {assists.length > 0 && (
        <Label size={11} color={T.muted} tracking="0.08em" className="truncate shrink-0" style={{ maxWidth: 210 }}>
          {assists.join(' · ')}
        </Label>
      )}
    </div>
  );
}

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

  // Таблица по периодам: шайбы берём из period_scores, броски — из shots_summary.
  // Колонки показываем только те, что реально сыграны (плюс обязательные 1–3).
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

  const homeColor = game.home_color_1 || T.acc;
  const awayColor = game.away_color_1 || T.head;
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

  return (
    <Reveal isVisible={isVisible} variant="full" className="absolute inset-0 z-50">
      <Stage game={game} kicker="СЧЁТ МАТЧА" title={statusText()}>
        <div className="w-full h-full flex flex-col gap-4 pt-2 pb-3" style={{ paddingLeft: PAD_X, paddingRight: PAD_X }}>

          {/* ---- СЧЁТ: команды по краям, отсчёт по центру ---- */}
          <div className="flex items-center gap-8 shrink-0" style={{ height: TOP_H }}>
            <ScoreSide logo={game.home_team_logo} name={game.home_team_name} score={game.home_score} color={homeColor} />

            <Dark radius={R.card} className="shrink-0" style={{ width: 236, height: 132 }}>
              <div className="h-full flex flex-col items-center justify-center gap-2.5">
                <Label size={10} color={T.accOnDark} tracking="0.24em" weight={800}>ДО СТАРТА ПЕРИОДА</Label>
                <Num size={52} color={isHot ? '#ff8a8a' : T.white} className={isHot ? 'g3-breathe' : ''}>
                  {formatClock(timeLeft)}
                </Num>
              </div>
            </Dark>

            <ScoreSide logo={game.away_team_logo} name={game.away_team_name} score={game.away_score} color={awayColor} align="right" />
          </div>

          {/* ---- ДАННЫЕ: два блока рядом ---- */}
          <div className="flex-1 min-h-0 flex gap-5">

            <DataPanel className="flex-1 min-w-0">
              <div className="h-full flex flex-col px-8 py-5">
                <Kicker size={11} className="mb-2 shrink-0">СТАТИСТИКА ПО ПЕРИОДАМ</Kicker>

                {/* Таблица центрируется по высоте блока: строк всегда шесть, и
                    прижатая к верху она оставляла под собой пустую половину */}
                <div className="flex-1 flex flex-col justify-center">
                <div className="flex items-stretch h-[26px]">
                  <div className="shrink-0" style={{ width: LABEL_W }} />
                  {table.cols.map(p => (
                    <div key={p} className="flex items-center justify-center flex-1">
                      <Label size={10} color={T.label} tracking="0.18em">{PERIOD_LABEL[p]}</Label>
                    </div>
                  ))}
                  <div className="flex items-center justify-center shrink-0" style={{ width: TOTAL_W }}>
                    <Label size={10} color={T.head} tracking="0.18em" weight={800}>ИТОГ</Label>
                  </div>
                </div>

                <div className="flex items-center gap-3 py-1">
                  <Label size={9} color={T.muted} tracking="0.28em">ЗАБРОШЕННЫЕ ШАЙБЫ</Label>
                  <Rule grow />
                </div>
                <TableRow label={game.home_short_name || 'ХОЗЯЕВА'} color={homeColor} cells={table.home.goals} total={table.home.goalsTotal} />
                <TableRow label={game.away_short_name || 'ГОСТИ'} color={awayColor} cells={table.away.goals} total={table.away.goalsTotal} />

                <div className="flex items-center gap-3 py-1 mt-2">
                  <Label size={9} color={T.muted} tracking="0.28em">БРОСКИ В СТВОР</Label>
                  <Rule grow />
                </div>
                <TableRow label={game.home_short_name || 'ХОЗЯЕВА'} color={homeColor} cells={table.home.shots} total={table.home.shotsTotal} dim />
                <TableRow label={game.away_short_name || 'ГОСТИ'} color={awayColor} cells={table.away.shots} total={table.away.shotsTotal} dim />
                </div>
              </div>
            </DataPanel>

            <DataPanel className="shrink-0" style={{ width: GOALS_W }}>
              <div className="h-full flex flex-col px-8 py-5">
                <div className="flex items-center gap-4 mb-1 shrink-0">
                  <Kicker size={11}>АВТОРЫ ШАЙБ</Kicker>
                  <Rule grow />
                  {pageCount > 1 && (
                    <div className="flex gap-2 shrink-0">
                      {Array.from({ length: pageCount }).map((_, i) => (
                        <div
                          key={i}
                          className="rounded-full transition-all duration-500"
                          style={{ width: i === page ? 24 : 8, height: 8, backgroundColor: i === page ? T.acc : T.brdSoft }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {allGoals.length > 0 ? (
                  <div key={page} className="flex-1 flex flex-col content-start g3-seq">
                    {pageGoals.map((goal, idx) => (
                      <GoalRow
                        key={goal.id || idx}
                        goal={goal}
                        color={goal.team_id === game.home_team_id ? homeColor : awayColor}
                        time={formatGoalTime(goal.time_seconds)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <Label size={13} color={T.muted} tracking="0.24em">ШАЙБ ПОКА НЕТ</Label>
                  </div>
                )}
              </div>
            </DataPanel>
          </div>
        </div>
      </Stage>
    </Reveal>
  );
}
