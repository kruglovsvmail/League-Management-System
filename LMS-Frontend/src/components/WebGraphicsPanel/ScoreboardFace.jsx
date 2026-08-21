import React from 'react';
import { getImageUrl } from '../../utils/helpers';

// Содержимое полосы «Табло»: живой счёт, остаток периода и активные штрафы.
//
// Раньше это была отдельная плитка-кнопка. Теперь это только КАРТИНКА внутри
// полосы: эфир, подсветку и рамку рисует BroadcastTile. Стоит в полосе углового
// табло — того, что висит в кадре почти весь матч; широкому табло по центру
// хватает одной строки, и дублировать счёт дважды в одной плитке незачем.
export function ScoreboardFace({
  game, currentPeriod, isTimerRunning, activePenalties,
  timerSeconds, periodLength, otLength,
}) {
  if (!game) return null;

  const formatTime = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  // Остаток времени периода
  const getCountdown = () => {
    if (currentPeriod === 'SO') return 0;
    const p = parseInt(periodLength, 10) || 20;
    const o = isNaN(parseInt(otLength, 10)) ? 5 : parseInt(otLength, 10);
    let end = 0;
    if (currentPeriod === '1') end = p * 60;
    else if (currentPeriod === '2') end = p * 2 * 60;
    else if (currentPeriod === '3') end = p * 3 * 60;
    else if (currentPeriod === 'OT') end = p * 3 * 60 + o * 60;
    return Math.max(0, end - timerSeconds);
  };

  const countdownSecs = getCountdown();

  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);

  const homeShortName = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const homePens = activePenalties?.filter(p => p.team_id === game.home_team_id) || [];
  const awayPens = activePenalties?.filter(p => p.team_id === game.away_team_id) || [];

  const isTech = !!game.is_technical;
  const techHome = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[0] : '+';
  const techAway = isTech && typeof game.is_technical === 'string' ? game.is_technical.split('/')[1] : '-';

  return (
    <div className="flex items-center justify-between w-full px-1">
      {/* Хозяева */}
      <div className="flex flex-col items-center w-[34%]">
        {homeLogo && <img src={homeLogo} alt="" className="h-9 w-9 object-contain mb-1 drop-shadow-sm" />}
        <span className="text-[15px] font-bold uppercase tracking-wide truncate w-full text-center text-graphite/70">{homeShortName}</span>
        {homePens.length > 0 && !isTech && (
          <span className="text-[11px] font-mono font-bold bg-status-rejected/10 text-status-rejected px-1 rounded mt-0.5">
            {formatTime(homePens[0].remaining)}{homePens.length > 1 ? ` +${homePens.length - 1}` : ''}
          </span>
        )}
      </div>

      {/* Центр: счёт, таймер, период */}
      <div className="flex flex-col items-center justify-center w-[32%]">
        <div className="flex items-center justify-center gap-1.5 mb-2">
          {isTech ? (
            <>
              <span className="text-[26px] font-bold text-status-rejected leading-none">{techHome}</span>
              <span className="text-graphite/30 font-black text-base leading-none">:</span>
              <span className="text-[26px] font-bold text-status-rejected leading-none">{techAway}</span>
            </>
          ) : (
            <>
              <span className="text-[26px] font-bold text-graphite leading-none">{game.home_score || 0}</span>
              <span className="text-graphite/30 font-black text-base leading-none">:</span>
              <span className="text-[26px] font-bold text-graphite leading-none">{game.away_score || 0}</span>
            </>
          )}
        </div>

        <span className={`font-mono text-[20px] font-black tracking-tighter leading-none ${isTimerRunning && countdownSecs <= 60 ? 'text-status-rejected animate-pulse' : isTimerRunning ? 'text-status-accepted' : 'text-graphite/60'}`}>
          {currentPeriod === 'SO' ? '0:00' : formatTime(countdownSecs)}
        </span>

        <span className={`text-[11px] font-bold uppercase tracking-widest mt-1 ${isTech ? 'text-status-rejected' : 'text-graphite/35'}`}>
          {isTech ? 'Технический' : currentPeriod === 'OT' ? 'Овертайм' : currentPeriod === 'SO' ? 'Буллиты' : `${currentPeriod} период`}
        </span>
      </div>

      {/* Гости */}
      <div className="flex flex-col items-center w-[34%]">
        {awayLogo && <img src={awayLogo} alt="" className="h-9 w-9 object-contain mb-1 drop-shadow-sm" />}
        <span className="text-[15px] font-bold uppercase tracking-wide truncate w-full text-center text-graphite/70">{awayShortName}</span>
        {awayPens.length > 0 && !isTech && (
          <span className="text-[11px] font-mono font-bold bg-status-rejected/10 text-status-rejected px-1 rounded mt-0.5">
            {formatTime(awayPens[0].remaining)}{awayPens.length > 1 ? ` +${awayPens.length - 1}` : ''}
          </span>
        )}
      </div>
    </div>
  );
}
