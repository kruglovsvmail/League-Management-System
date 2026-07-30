import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { AnimationWrapper } from './AnimationWrapper';
import { BigPlate } from './BigPlate';
import { DiagonalTicker, DiagonalStripes, Snowfall, Snowflake } from './IceDecor';
import { TFH, cut } from './theme';

const BODY_H = 610;

export default function IntermissionOverlay({ game, overlay, timerSeconds, periodLength }) {
  const isVisible = overlay.visible && overlay.type === 'intermission';
  const [timeLeft, setTimeLeft] = useState(0);
  const [goalIndex, setGoalIndex] = useState(0);

  // Таймер перерыва
  useEffect(() => {
    if (!isVisible || !overlay.data) return;

    if (overlay.data.isPaused) {
       setTimeLeft(overlay.data.timeLeft || 0);
       return;
    }

    if (overlay.data.endTime) {
       const updateTimer = () => {
          setTimeLeft(Math.max(0, Math.floor((overlay.data.endTime - Date.now()) / 1000)));
       };
       updateTimer();
       const interval = setInterval(updateTimer, 1000);
       return () => clearInterval(interval);
    }
  }, [isVisible, overlay.data]);

  // Собираем и сортируем все голы хронологически
  const allGoals = [...(game.goals || [])].sort((a, b) => a.time_seconds - b.time_seconds);

  // Таймер для карусели голов
  useEffect(() => {
    if (!isVisible || allGoals.length <= 1) {
      setGoalIndex(0);
      return;
    }

    const carouselInterval = setInterval(() => {
      setGoalIndex((prev) => (prev + 1) % allGoals.length);
    }, 3000);

    return () => clearInterval(carouselInterval);
  }, [isVisible, allGoals.length]);

  if (!game) return null;

  const formatCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sc = ('0' + (s % 60)).slice(-2);
    return `${m}:${sc}`;
  };

  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);
  const defaultAvatar = getImageUrl('default/user_default.webp');

  const homeColor = game.home_color_1 || TFH.blue;
  const awayColor = game.away_color_1 || TFH.ice;

  // Определение статуса периода
  const getPeriodStatusText = () => {
    const pLenSecs = (periodLength || 20) * 60;
    if (timerSeconds >= pLenSecs * 3) return 'МАТЧ ЗАВЕРШЁН';
    if (timerSeconds >= pLenSecs * 2) return 'ПЕРЕРЫВ • ПОСЛЕ 2 ПЕРИОДА';
    if (timerSeconds >= pLenSecs) return 'ПЕРЕРЫВ • ПОСЛЕ 1 ПЕРИОДА';
    return 'ПЕРЕРЫВ';
  };

  // Форматирование времени гола
  const formatGoalTime = (secs) => {
    const pLenSecs = (periodLength || 20) * 60;
    let p = 1; let rSecs = secs;
    if (secs >= pLenSecs * 3) { p = 'ОТ'; rSecs = secs - pLenSecs * 3; }
    else if (secs >= pLenSecs * 2) { p = 3; rSecs = secs - pLenSecs * 2; }
    else if (secs >= pLenSecs) { p = 2; rSecs = secs - pLenSecs; }
    return `${p}П • ${Math.floor(rSecs / 60)}:${('0' + (rSecs % 60)).slice(-2)}`;
  };

  // Поиск фото игрока в ростере
  const getPlayerPhoto = (goal) => {
    const isHome = goal.team_id === game.home_team_id;
    const roster = isHome ? game.home_roster : game.away_roster;
    if (!roster) return defaultAvatar;

    const player = roster.find(p => p.last_name === goal.scorer_last_name && p.first_name === goal.scorer_first_name);
    return getSafeUrl(player?.avatar_url) || defaultAvatar;
  };

  const isHot = timeLeft <= 60 && !overlay.data?.isPaused;

  const ScoreRow = ({ logo, name, score, color, isTop }) => (
    <div
      className="flex-1 flex items-center px-10 relative overflow-hidden"
      style={{ borderBottom: isTop ? `2px solid ${TFH.navyLine}` : 'none' }}
    >
      {logo && (
        <img src={logo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-[0.2] blur-2xl scale-110 z-0 pointer-events-none" />
      )}
      <DiagonalStripes color="rgba(255,255,255,0.03)" step={28} />

      {/* Цветовой рельс команды */}
      <div className="absolute left-0 top-0 bottom-0 w-[10px] z-10" style={{ backgroundColor: color }} />

      <div className="flex items-center gap-8 z-10 w-full pl-4">
        {logo && (
          <img src={logo} alt={name} className="w-36 h-36 object-contain drop-shadow-[0_14px_28px_rgba(0,0,0,0.8)] shrink-0" onError={(e) => e.target.style.display = 'none'} />
        )}
        <span className="text-[54px] font-black uppercase tracking-tight leading-[0.95] flex-1 line-clamp-2" style={{ color: TFH.white }}>
          {name}
        </span>
        <div
          className="shrink-0 w-[150px] h-[130px] flex items-center justify-center relative"
          style={{ backgroundColor: TFH.navyDeep, clipPath: cut(26, 0, 26, 0) }}
        >
          <DiagonalStripes color="rgba(41,169,225,0.08)" step={18} />
          <span className="text-[104px] font-mono font-black tabular-nums leading-none tracking-tighter relative z-10" style={{ color: TFH.white }}>
            {score}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <AnimationWrapper
      type="intermission"
      isVisible={isVisible}
      className="absolute inset-0 flex items-center justify-center z-50 p-20"
    >
      <BigPlate title={getPeriodStatusText()} game={game}>
        <div className="flex w-full relative z-0 overflow-hidden" style={{ height: BODY_H, backgroundColor: TFH.navy }}>
          <DiagonalTicker texts={[game.league_name, game.home_short_name, game.away_short_name, game.division_name, game.home_team_name, game.away_team_name]} />
          <Snowfall count={14} fallHeight={BODY_H} />

          {/* ЛЕВАЯ КОЛОНКА: СЧЁТ */}
          <div className="w-[58%] flex flex-col relative z-10" style={{ borderRight: `3px solid ${TFH.navyLine}` }}>
            <ScoreRow logo={homeLogo} name={game.home_team_name} score={game.home_score} color={homeColor} isTop />
            <ScoreRow logo={awayLogo} name={game.away_team_name} score={game.away_score} color={awayColor} />
          </div>

          {/* ПРАВАЯ КОЛОНКА: ТАЙМЕР + КАРУСЕЛЬ ГОЛОВ */}
          <div className="w-[42%] flex flex-col relative z-10" style={{ backgroundColor: TFH.navy }}>

            {/* ТАЙМЕР */}
            <div
              className="flex flex-col items-center justify-center h-[34%] shrink-0 relative overflow-hidden"
              style={{ backgroundColor: TFH.navyDeep, borderBottom: `3px solid ${TFH.navyLine}` }}
            >
              <DiagonalStripes color="rgba(41,169,225,0.08)" step={24} drift />
              <Snowflake
                size={150}
                color={TFH.blue}
                strokeWidth={1}
                className="absolute -right-8 -top-8 pointer-events-none"
                style={{ opacity: 0.12, animation: 'tfhSpin 48s linear infinite' }}
              />

              <span className="text-[12px] font-black uppercase tracking-[0.3em] mb-3 z-10" style={{ color: TFH.blue }}>
                ДО СТАРТА ПЕРИОДА
              </span>
              <span
                className={`font-mono text-[76px] font-black tabular-nums tracking-tighter leading-none z-10 ${isHot ? 'tfh-breathe' : ''}`}
                style={{ color: isHot ? '#FF6B6B' : TFH.white }}
              >
                {formatCountdown(timeLeft)}
              </span>
            </div>

            {/* КАРУСЕЛЬ ГОЛОВ */}
            <div className="flex flex-col flex-1 p-8 overflow-hidden relative">
              <DiagonalStripes color="rgba(255,255,255,0.025)" step={32} />

              {allGoals.length > 0 ? (
                <>
                  <div className="flex justify-between items-center mb-5 shrink-0 z-20">
                    <div className="flex items-center gap-3">
                      <div className="w-2.5 h-2.5 rotate-45" style={{ backgroundColor: TFH.blue }} />
                      <span className="font-black uppercase tracking-[0.24em] text-[11px]" style={{ color: TFH.blue }}>
                        АВТОРЫ ЗАБРОШЕННЫХ ШАЙБ
                      </span>
                    </div>
                    <span className="font-black uppercase tracking-[0.14em] text-[11px] font-mono" style={{ color: TFH.iceDim }}>
                      {goalIndex + 1} / {allGoals.length}
                    </span>
                  </div>

                  <div className="relative flex-1 w-full overflow-hidden z-10">
                    {allGoals.map((goal, idx) => {
                      const isHome = goal.team_id === game.home_team_id;
                      const teamLogo = isHome ? homeLogo : awayLogo;
                      const teamColor = isHome ? homeColor : awayColor;

                      // Карусель: активный по центру, предыдущий уезжает вверх, остальные ждут внизу
                      const isActive = idx === goalIndex;
                      const isPrev = idx === (goalIndex - 1 + allGoals.length) % allGoals.length && allGoals.length > 1;

                      let positionClass = 'translate-y-full opacity-0 pointer-events-none';
                      if (isActive) positionClass = 'translate-y-0 opacity-100 z-10';
                      else if (isPrev) positionClass = '-translate-y-full opacity-0 pointer-events-none z-0';

                      let assists = [];
                      if (goal.a1_last_name) assists.push(`${goal.a1_last_name} ${goal.a1_first_name?.[0] || ''}.`.trim());
                      if (goal.a2_last_name) assists.push(`${goal.a2_last_name} ${goal.a2_first_name?.[0] || ''}.`.trim());

                      return (
                        <div
                          key={goal.id || idx}
                          className={`absolute inset-0 flex items-center p-5 transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] ${positionClass}`}
                          style={{ backgroundColor: TFH.navyMid, clipPath: cut(24, 0, 24, 0) }}
                        >
                          <div className="absolute left-0 top-0 bottom-0 w-[6px]" style={{ backgroundColor: teamColor }} />

                          {/* Фото игрока */}
                          <div className="relative w-40 h-40 shrink-0 ml-3 mr-6">
                            <img
                              src={getPlayerPhoto(goal)}
                              alt="Player"
                              className="w-full h-full object-cover object-top"
                              style={{ clipPath: cut(18, 0, 18, 0) }}
                              onError={(e) => { e.target.src = defaultAvatar; }}
                            />
                            {teamLogo && (
                              <div
                                className="absolute -bottom-3 -right-4 w-[68px] h-[68px] flex items-center justify-center p-2"
                                style={{ backgroundColor: TFH.navyDeep, clipPath: cut(12, 0, 12, 0) }}
                              >
                                <img src={teamLogo} alt="team" className="w-full h-full object-contain" onError={(e) => e.target.style.display = 'none'} />
                              </div>
                            )}
                          </div>

                          {/* Данные гола */}
                          <div className="flex flex-col flex-1 justify-center min-w-0 pr-2">
                            <div className="flex items-center gap-3 mb-2.5">
                              <div className="px-2.5 py-0.5" style={{ backgroundColor: TFH.blue, clipPath: cut(0, 0, 8, 8) }}>
                                <span className="font-mono font-black text-[13px] tracking-wide" style={{ color: TFH.navyDeep }}>
                                  {formatGoalTime(goal.time_seconds)}
                                </span>
                              </div>
                            </div>

                            <span className="text-[30px] font-black uppercase tracking-tight leading-none truncate w-full mb-1" style={{ color: TFH.white }}>
                              {goal.scorer_last_name}
                            </span>
                            <span className="text-[17px] font-bold uppercase tracking-[0.1em] leading-none truncate w-full mb-3" style={{ color: TFH.blueSoft }}>
                              {goal.scorer_first_name}
                            </span>

                            {assists.length > 0 && (
                              <span
                                className="text-[11px] font-black uppercase tracking-[0.18em] truncate w-full pt-2.5"
                                style={{ color: TFH.iceDim, borderTop: `1px solid ${TFH.navyLine}` }}
                              >
                                {assists.join(' • ')}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center z-10">
                  <Snowflake size={84} color={TFH.blue} strokeWidth={1.2} style={{ opacity: 0.35, animation: 'tfhSpin 40s linear infinite' }} />
                  <span className="font-black uppercase tracking-[0.2em] text-[13px] mt-6" style={{ color: TFH.iceDim }}>
                    Заброшенные шайбы отсутствуют
                  </span>
                </div>
              )}
            </div>

          </div>
        </div>
      </BigPlate>
    </AnimationWrapper>
  );
}
