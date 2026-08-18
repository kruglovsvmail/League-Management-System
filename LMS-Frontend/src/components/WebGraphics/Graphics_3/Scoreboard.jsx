// src/components/WebGraphics/Graphics_3/Scoreboard.jsx
//
// Табло лиги 3 — светлая стеклянная плашка у левой кромки. Слева медальон
// федерации (по нему графика опознаётся с первого кадра), в середине две строки
// команд, справа встык — тёмно-синий блок времени: то самое единственное тёмное
// пятно системы, что и тёмный центр эмблемы на светлом поле.
import React, { useState, useEffect, useRef } from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { Icon } from '../../../ui/Icon';
import { Reveal } from './Reveal';
import { Glass, Dark, Rule } from './Frost';
import { LeagueMark } from './Emblem';
import { Head, Num, Label, Pill } from './Type';
import { T, R, formatClock, periodLabel } from './theme';

const ROW_H = 64;
const BOARD_H = ROW_H * 2;
const BRAND_W = 92;
const TEAMS_W = 250;
const SCORE_W = 74;
const CLOCK_W = 152;
const LANE_GAP = 12;   // отступ дорожки штрафов от правой кромки табло

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

  const displaySeconds = getDisplaySeconds();
  const homeShort = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShort = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const homeLogo = getSafeUrl(game.home_team_logo);
  const awayLogo = getSafeUrl(game.away_team_logo);

  const homeColor = game.home_color_1 || T.acc;
  const awayColor = game.away_color_1 || T.muted;

  // ---- Эффект гола --------------------------------------------------------
  const prevScoreRef = useRef({ home: game.home_score, away: game.away_score });
  const [goalEffect, setGoalEffect] = useState(null);
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    const prev = prevScoreRef.current;
    const h = game.home_score ?? 0;
    const a = game.away_score ?? 0;
    const scored = (prev.home !== undefined && h > prev.home) ? 'home'
      : (prev.away !== undefined && a > prev.away) ? 'away' : null;

    if (scored) {
      setGoalEffect(scored);
      setNudge(true);
      setTimeout(() => setNudge(false), 640);
      setTimeout(() => setGoalEffect(null), 2900);
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

  // Большинство называет команду и счёт составов одной строкой: «БОЛЬШИНСТВО»
  // само по себе не отвечает на главный вопрос — у кого именно.
  let strength = null;
  if (homePlayers < 5 || awayPlayers < 5) {
    if (homePlayers === awayPlayers) {
      strength = { isPP: false, label: `${homePlayers} НА ${awayPlayers}` };
    } else {
      const ppHome = homePlayers > awayPlayers;
      const short = ppHome ? homeShort : awayShort;
      strength = {
        isPP: true,
        label: `БОЛЬШИНСТВО ${short} · ${Math.max(homePlayers, awayPlayers)} НА ${Math.min(homePlayers, awayPlayers)}`,
      };
    }
  }

  // ---- Строка команды -----------------------------------------------------
  return (
    <Reveal isVisible={!isHidden} variant="slide" className="absolute top-10 left-12 z-50 flex flex-col items-start gap-3">

      {/* ---------- ТАБЛО ---------- */}
      <div className={`relative ${nudge ? 'g3-nudge' : ''}`}>
        <Glass over="video" radius={R.card} style={{ height: BOARD_H }}>
          <div className="flex items-stretch h-full">

            {/* Медальон федерации */}
            <div
              className="flex items-center justify-center shrink-0"
              style={{ width: BRAND_W, backgroundColor: 'rgba(255,255,255,0.5)' }}
            >
              <LeagueMark game={game} size={64} />
            </div>
            <Rule vertical tone="silver" />

            {/* Команды */}
            <div className="flex flex-col shrink-0" style={{ width: TEAMS_W }}>
              <TeamRow logo={homeLogo} short={homeShort} score={isTech ? techHome : game.home_score}
                       color={homeColor} scored={goalEffect === 'home'} isTech={isTech} isTop />
              <TeamRow logo={awayLogo} short={awayShort} score={isTech ? techAway : game.away_score}
                       color={awayColor} scored={goalEffect === 'away'} isTech={isTech} />
            </div>

            {/* Время */}
            <Dark radius={0} className="shrink-0" style={{ width: CLOCK_W }}>
              <div className="h-full flex flex-col items-center justify-center gap-2.5">
                <Num size={40} color={isTimerRunning ? T.white : 'rgba(255,255,255,0.45)'}>
                  {currentPeriod === 'SO' ? '0:00' : formatClock(displaySeconds)}
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
        </Glass>

        {/* Дорожки штрафов и буллитов — ЗА правой кромкой табло. Они снаружи
            Glass намеренно: внутри их обрезал бы overflow, а снаружи они ещё и
            не раздувают саму плашку, когда удалений нет. */}
        {!isTech && (
          <div
            className="absolute top-0 flex flex-col"
            style={{ left: '100%', paddingLeft: LANE_GAP, height: BOARD_H }}
          >
            <Lane penalties={penHome} shots={homeSO} isSO={currentPeriod === 'SO'} slots={slots} />
            <Lane penalties={penAway} shots={awaySO} isSO={currentPeriod === 'SO'} slots={slots} />
          </div>
        )}
      </div>

      {/* ---------- СОСТАВЫ / ТЕХНИЧЕСКИЙ РЕЗУЛЬТАТ ----------
          Лига, дивизион и тур под табло намеренно не выводятся: постоянная
          подпись висела бы весь матч, а принадлежность к лиге и так читается
          по эмблеме федерации слева в самом табло. Эти данные показываются
          на полноэкранных плашках, где для них есть шапка. */}
      {isTech ? (
        <Pill size={11} bg={T.danger} color={T.white} border={T.danger} style={{ boxShadow: '0 8px 20px rgba(20,55,95,0.18)' }}>
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
      ) : null}
    </Reveal>
  );
}

// ---- Строка команды --------------------------------------------------------
// Объявлена НА УРОВНЕ МОДУЛЯ, а не внутри Scoreboard: табло перерисовывается
// каждые 100 мс из-за таймера, и вложенный компонент React считал бы новым
// типом на каждом кадре — эмблемы команд перезагружались бы без остановки.
function TeamRow({ logo, short, score, color, scored, isTop, isTech }) {
  return (
    <div
      className="flex items-stretch relative"
      style={{ height: ROW_H, borderBottom: isTop ? `1px solid ${T.divider}` : 'none' }}
    >
      {/* Цветовой рельс команды: на голе разгорается свечением, но ширины не
          меняет — она участвует в раскладке, и её анимация дёргала бы всё табло */}
      <div
        className="w-[6px] shrink-0"
        style={{ backgroundColor: color, boxShadow: scored ? `0 0 22px 4px ${color}` : 'none', transition: 'box-shadow .25s' }}
      />

      <div className="flex items-center gap-3.5 flex-1 min-w-0 pl-4 pr-3">
        {logo && (
          <img src={logo} alt="" className="w-9 h-9 object-contain shrink-0"
               onError={(e) => { e.target.style.display = 'none'; }} />
        )}
        <Head size={24} className="truncate">{short}</Head>
      </div>

      {/* Счёт. На голе ячейка заливается цветом команды, из неё расходится
          кольцо — «круги по льду» от точки события */}
      <div
        className="shrink-0 flex items-center justify-center relative overflow-hidden"
        style={{
          width: SCORE_W,
          backgroundColor: scored ? color : 'rgba(18,49,74,0.055)',
          borderLeft: `1px solid ${T.divider}`,
          transition: 'background-color .3s',
        }}
      >
        {scored && (
          <div
            key={`${score}`}
            className="g3-ring absolute left-1/2 top-1/2 rounded-full pointer-events-none"
            style={{ width: SCORE_W, height: SCORE_W, border: `3px solid rgba(255,255,255,0.85)` }}
          />
        )}
        <span className={`relative z-10 ${scored ? 'g3-score-pop' : ''}`}>
          <Num size={34} color={scored ? T.white : (isTech ? T.danger : T.head)}>{score}</Num>
        </span>
      </div>
    </div>
  );
}

// ---- Дорожка команды -------------------------------------------------------
// Всё, что относится к КОНКРЕТНОЙ команде и не помещается внутрь плашки:
// таймеры удалений (их бывает один или два) и слоты буллитов. Высота дорожки
// равна высоте строки, и стоит она ровно напротив своей команды — поэтому в
// самом счётчике не нужны ни фамилия, ни аббревиатура клуба.
function Lane({ penalties, shots, isSO, slots }) {
  return (
    <div className="flex items-center gap-2.5" style={{ height: ROW_H }}>
      {isSO ? (
        <Glass over="video" radius={R.pill} sheen={false}>
          <div className="flex items-center gap-3 px-5 py-2">
            {Array.from({ length: slots }).map((_, i) => {
              const s = shots[i];
              // Иконки те же, что в протоколе матча (ui/Icon.jsx) — шайба с
              // галочкой, шайба с крестом и просто шайба под несыгранный слот.
              // Цвет идёт через currentColor, размер — как у эмблем команд в
              // строках табло, чтобы слоты читались с эфирного расстояния.
              const [name, color] = !s
                ? ['puck', 'rgba(113,145,168,0.5)']
                : s.event_type === 'shootout_goal'
                  ? ['shootout_goal', T.ok]
                  : ['shootout_miss', T.danger];

              return (
                <span key={i} className="shrink-0" style={{ color }}>
                  <Icon name={name} className="w-9 h-9" />
                </span>
              );
            })}
          </div>
        </Glass>
      ) : (
        penalties.map(p => (
          <Glass key={p.id} over="video" radius={R.pill} sheen={false}>
            <div className="px-4 py-2">
              <Num size={22} color={T.danger}>{formatClock(p.remaining)}</Num>
            </div>
          </Glass>
        ))
      )}
    </div>
  );
}

