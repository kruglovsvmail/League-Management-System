import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function PreMatchOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'prematch';
  const [timeLeft, setTimeLeft] = useState(0);

  // Приемник команд от панели режиссера (Таймер до старта матча)
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

  if (!game) return null;

  // Форматирование таймера
  const formatCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sc = ('0' + (s % 60)).slice(-2);
    return `${m}:${sc}`;
  };

  // Логотипы Лиги и Дивизиона
  const leagueLogo = getImageUrl(game.league_logo);
  const divisionLogo = getImageUrl(game.division_logo);

  // Логотипы команд
  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);

  // Логика Джерси (с дефолтными заглушками, если форма не загружена)
  const homeJerseyDark = getImageUrl(game.home_jersey_dark || 'default/jersey_dark.webp');
  const homeJerseyLight = getImageUrl(game.home_jersey_light || 'default/jersey_light.webp');
  const homeActiveJersey = game.home_jersey_type === 'light' ? homeJerseyLight : homeJerseyDark;

  const awayJerseyDark = getImageUrl(game.away_jersey_dark || 'default/jersey_dark.webp');
  const awayJerseyLight = getImageUrl(game.away_jersey_light || 'default/jersey_light.webp');
  const awayActiveJersey = game.away_jersey_type === 'dark' ? awayJerseyDark : awayJerseyLight;

  // Форматирование даты
  const dateObj = game.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  // Тексты стадии матча (Плей-офф или Регулярка)
  const isPlayoff = game.stage_type === 'playoff';
  const tournamentType = isPlayoff ? 'ПЛЕЙ-ОФФ' : 'РЕГУЛЯРНЫЙ ЧЕМПИОНАТ';
  const stageLabel = game.stage_label ? game.stage_label.toUpperCase() : (isPlayoff ? 'РАУНД' : 'КРУГ');
  const matchNumberText = isPlayoff 
    ? `МАТЧ № ${game.series_number || 1}` 
    : `ТУР: ${game.series_number || 1}`;

  // Формирование текста места проведения
  const cityText = game.arena_city ? `г. ${game.arena_city}` : '';
  const arenaText = game.arena_name || game.location_text || 'Ледовая арена';
  const fullLocation = [cityText, arenaText].filter(Boolean).join(' • ');

  return (
    <AnimationWrapper
      type="prematch"
      isVisible={isVisible}
      className="absolute inset-0 flex items-center justify-center z-50"
    >
      {/* Затемнение фона */}
      <div className="absolute inset-0 bg-black/0 backdrop-blur-md pointer-events-none"></div>

      {/* Основная карточка */}
      <div className="relative flex flex-col items-center w-[1400px] h-[1000px] bg-[#000000ff]/[98%] rounded-[3rem] border border-white/10 shadow-[0_0_120px_rgba(0,0,0,0.8)] overflow-hidden">
        
        {/* Шапка: Лига (Слева) и Дивизион (Справа) */}
        <div className="w-full bg-white/5 border-b border-white/10 flex items-center justify-between px-16 py-6 relative shrink-0">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"></div>
          
          <div className="flex items-center gap-6 flex-1">
            {leagueLogo && <img src={leagueLogo} alt="League" className="h-16 object-contain drop-shadow-lg" />}
            <span className="text-xl font-bold text-white/70 uppercase tracking-[0.2em]">{game.league_name}</span>
          </div>

          <div className="flex items-center justify-end gap-6 flex-1">
            <span className="text-xl font-bold text-white/70 uppercase tracking-[0.2em]">{game.division_name}</span>
            {divisionLogo && <img src={divisionLogo} alt="Division" className="h-16 object-contain drop-shadow-lg" />}
          </div>
        </div>

        {/* Тело: Команды и Информация */}
        <div className="w-full flex items-center justify-between px-24 py-16 relative flex-1">
          
          {/* Блок Хозяев */}
          <div className="flex flex-col items-center w-[450px]">
            <div className="relative mb-12 flex justify-center w-full">
              {homeLogo && (
                <img 
                  src={homeLogo} 
                  alt="Home" 
                  className="w-72 h-72 object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)] z-10 relative" 
                />
              )}
              {homeActiveJersey && (
                <img 
                  src={homeActiveJersey} 
                  alt="Home Jersey" 
                  className="absolute bottom-0 right-0 w-16 h-16 object-contain opacity-95 drop-shadow-2xl z-20 translate-x-1/4 translate-y-1/4" 
                />
              )}
            </div>
            <span className="text-5xl font-black text-white text-center uppercase tracking-wide drop-shadow-md">{game.home_team_name}</span>
          </div>

          {/* Центральный блок (Стадия, Тур, VS, Таймер) */}
          <div className="flex flex-col items-center justify-center w-[400px]">
            
            <div className="flex flex-col items-center text-center mb-10">
               <span className="text-blue-400 text-xl font-black uppercase tracking-[0.25em] mb-3 drop-shadow-sm">{tournamentType}</span>
               <span className="text-white text-4xl font-black uppercase tracking-widest mb-4">{stageLabel}</span>
               <div className="bg-white/10 px-8 py-2 rounded-xl border border-white/5">
                 <span className="text-white/80 text-sm font-bold uppercase tracking-[0.2em]">{matchNumberText}</span>
               </div>
            </div>

            <div className="italic text-white/20 font-black text-8xl mb-10 select-none">
              VS
            </div>

            {/* БЛОК С ТАЙМЕРОМ ОБРАТНОГО ОТСЧЕТА */}
            <div className="flex flex-col items-center bg-white/5 px-12 py-5 rounded-3xl border border-white/10 shadow-inner w-full min-h-[140px] justify-center">
              {dateStr && <span className="text-white/50 text-sm font-bold tracking-widest uppercase mb-1 drop-shadow-sm">{dateStr}</span>}
              <span className="text-white/40 text-xs font-bold uppercase tracking-[0.3em] mb-1">До начала</span>
              
              <span className={`font-mono text-6xl font-black tracking-tighter leading-none mt-1 transition-colors ${timeLeft <= 60 && !overlay.data?.isPaused ? 'text-status-rejected animate-pulse drop-shadow-[0_0_15px_rgba(255,69,58,0.5)]' : 'text-blue-400 drop-shadow-[0_0_15px_rgba(96,165,250,0.3)]'}`}>
                {formatCountdown(timeLeft)}
              </span>
            </div>
            
          </div>

          {/* Блок Гостей */}
          <div className="flex flex-col items-center w-[450px]">
            <div className="relative mb-12 flex justify-center w-full">
              {awayLogo && (
                <img 
                  src={awayLogo} 
                  alt="Away" 
                  className="w-72 h-72 object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)] z-10 relative" 
                />
              )}
              {awayActiveJersey && (
                <img 
                  src={awayActiveJersey} 
                  alt="Away Jersey" 
                  className="absolute bottom-0 left-0 w-16 h-16 object-contain opacity-95 drop-shadow-2xl z-20 -translate-x-1/4 translate-y-1/4" 
                />
              )}
            </div>
            <span className="text-5xl font-black text-white text-center uppercase tracking-wide drop-shadow-md">{game.away_team_name}</span>
          </div>

        </div>

        {/* Подвал: Место проведения */}
        <div className="w-full bg-white/5 border-t border-white/10 flex justify-center items-center py-6 shrink-0">
          <div className="flex items-center gap-5 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-white/50 text-xl font-semibold tracking-widest uppercase drop-shadow-sm">{fullLocation}</span>
          </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}