import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function PreMatchOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'prematch';
  const [timeLeft, setTimeLeft] = useState(0);

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

  const formatCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sc = ('0' + (s % 60)).slice(-2);
    return `${m}:${sc}`;
  };

  const leagueLogo = getImageUrl(game.league_logo);
  const divisionLogo = getImageUrl(game.division_logo);

  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);

  const homeJerseyDark = getImageUrl(game.home_jersey_dark || 'default/jersey_dark.webp');
  const homeJerseyLight = getImageUrl(game.home_jersey_light || 'default/jersey_light.webp');
  const homeActiveJersey = game.home_jersey_type === 'light' ? homeJerseyLight : homeJerseyDark;

  const awayJerseyDark = getImageUrl(game.away_jersey_dark || 'default/jersey_dark.webp');
  const awayJerseyLight = getImageUrl(game.away_jersey_light || 'default/jersey_light.webp');
  const awayActiveJersey = game.away_jersey_type === 'dark' ? awayJerseyDark : awayJerseyLight;

  const dateObj = game.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

  const isPlayoff = game.stage_type === 'playoff';
  const tournamentType = isPlayoff ? 'ПЛЕЙ-ОФФ' : 'РЕГУЛЯРНЫЙ ЧЕМПИОНАТ';
  const stageLabel = game.stage_label ? game.stage_label.toUpperCase() : (isPlayoff ? 'РАУНД' : 'КРУГ');
  const matchNumberText = isPlayoff 
    ? `МАТЧ № ${game.series_number || 1}` 
    : `ТУР: ${game.series_number || 1}`;

  const cityText = game.arena_city ? `г. ${game.arena_city}` : '';
  const arenaText = game.arena_name || game.location_text || 'Ледовая арена';
  const fullLocation = [cityText, arenaText].filter(Boolean).join(' • ');

  return (
    <AnimationWrapper
      type="complex_construct"
      isVisible={isVisible}
      className="absolute inset-0 flex items-center justify-center z-50"
    >
      {/* Затемнение фона с кибер-виньеткой */}
      <div className="absolute inset-0 bg-[#020611]/80 backdrop-blur-md pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, transparent 0%, #000 100%)' }}></div>

      {/* Основная кибер-панель */}
      <div className="relative flex flex-col items-center w-[1400px] bg-[#051125]/90 backdrop-blur-[30px] border border-[#1A3A6D]/80 shadow-[0_0_100px_rgba(0,229,255,0.1),_inset_0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
        
        {/* Неоновые линии сверху и снизу */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent shadow-[0_0_15px_#00E5FF]"></div>
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#00E5FF] to-transparent shadow-[0_0_15px_#00E5FF]"></div>

        {/* Шапка: Лига и Дивизион */}
        <div className="w-full flex items-center justify-between px-20 py-8 relative bg-[#0A1D37]/50 border-b border-[#1A3A6D]/50 z-10">
          <div className="flex items-center gap-6 flex-1">
            {leagueLogo && <img src={leagueLogo} alt="League" className="h-16 object-contain drop-shadow-[0_0_15px_rgba(0,229,255,0.3)]" />}
            <span className="text-xl font-black text-white uppercase tracking-[0.3em] font-sans drop-shadow-md">{game.league_name}</span>
          </div>

          <div className="flex items-center justify-end gap-6 flex-1">
            <span className="text-xl font-black text-white uppercase tracking-[0.3em] font-sans drop-shadow-md">{game.division_name}</span>
            {divisionLogo && <img src={divisionLogo} alt="Division" className="h-16 object-contain drop-shadow-[0_0_15px_rgba(0,229,255,0.3)]" />}
          </div>
        </div>

        {/* Тело: Команды и Информация */}
        <div className="w-full flex items-center justify-between px-12 py-20 relative z-10">
          
          {/* Блок Хозяев */}
          <div className="flex flex-col items-center w-[450px]">
            <div className="relative mb-12 flex justify-center w-full">
              {/* Технологичный постамент для логотипа */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#112547]/40 border border-[#1A3A6D] rotate-45 shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]"></div>
              {homeLogo && (
                <img 
                  src={homeLogo} 
                  alt="Home" 
                  className="w-72 h-72 object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)] z-10 relative" 
                />
              )}
              {homeActiveJersey && (
                <img 
                  src={homeActiveJersey} 
                  alt="Home Jersey" 
                  className="absolute bottom-0 right-0 w-20 h-20 object-contain drop-shadow-2xl z-20 translate-x-1/4 translate-y-1/4" 
                />
              )}
            </div>
            <div className="bg-[#112547] px-8 py-3 border-l-4 border-[#00E5FF] shadow-[10px_10px_30px_rgba(0,0,0,0.5)]" style={{ transform: 'skewX(-10deg)' }}>
              <span className="block text-4xl font-black text-white text-center uppercase tracking-widest drop-shadow-md" style={{ transform: 'skewX(10deg)' }}>{game.home_team_name}</span>
            </div>
          </div>

          {/* Центральный блок (Стадия, VS, Таймер) */}
          <div className="flex flex-col items-center justify-center w-[400px]">
            
            <div className="flex flex-col items-center text-center mb-10 w-full relative">
               <span className="text-[#00E5FF] text-xl font-black uppercase tracking-[0.3em] mb-3 drop-shadow-[0_0_10px_rgba(0,229,255,0.5)]">{tournamentType}</span>
               <span className="text-white text-3xl font-black uppercase tracking-widest mb-4">{stageLabel}</span>
               <div className="relative flex items-center justify-center">
                 <div className="absolute inset-0 bg-[#0A1D37] border border-[#1A3A6D] shadow-[0_0_20px_rgba(0,0,0,0.5)]" style={{ transform: 'skewX(-15deg)' }}></div>
                 <span className="relative z-10 text-white/90 text-sm font-bold uppercase tracking-[0.3em] px-8 py-2">{matchNumberText}</span>
               </div>
            </div>

            <div className="relative mb-10 flex items-center justify-center w-full">
               <div className="absolute w-full h-[1px] bg-[#1A3A6D]/50 z-0"></div>
               <span className="italic text-[#1A3A6D] font-black text-8xl z-10 bg-[#051125] px-6" style={{ textShadow: '0 0 30px rgba(0,229,255,0.1)' }}>VS</span>
            </div>

            {/* БЛОК С ТАЙМЕРОМ */}
            <div className="relative flex flex-col items-center w-full min-h-[160px] justify-center overflow-hidden border border-[#1A3A6D]/50 bg-[#0A1D37]/50 shadow-[inset_0_0_50px_rgba(0,0,0,0.6)]">
              {/* Геометрический вырез */}
              <div className="absolute -top-4 -left-4 w-12 h-12 border-t-2 border-l-2 border-[#00E5FF] z-10"></div>
              <div className="absolute -bottom-4 -right-4 w-12 h-12 border-b-2 border-r-2 border-[#00E5FF] z-10"></div>
              
              <div className="relative z-10 flex flex-col items-center py-6">
                {dateStr && <span className="text-[#A0BCE0] text-sm font-black tracking-widest uppercase mb-2 drop-shadow-sm">{dateStr}</span>}
                <span className="text-white/40 text-xs font-bold uppercase tracking-[0.4em] mb-2">До начала матча</span>
                
                <span className={`font-mono text-7xl font-black tracking-tighter leading-none transition-colors ${timeLeft <= 60 && !overlay.data?.isPaused ? 'text-[#FF3366] drop-shadow-[0_0_20px_rgba(255,51,102,0.6)] animate-pulse' : 'text-[#00E5FF] drop-shadow-[0_0_20px_rgba(0,229,255,0.4)]'}`}>
                  {formatCountdown(timeLeft)}
                </span>
              </div>
            </div>
            
          </div>

          {/* Блок Гостей */}
          <div className="flex flex-col items-center w-[450px]">
            <div className="relative mb-12 flex justify-center w-full">
              {/* Технологичный постамент для логотипа */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#112547]/40 border border-[#1A3A6D] rotate-45 shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]"></div>
              {awayLogo && (
                <img 
                  src={awayLogo} 
                  alt="Away" 
                  className="w-72 h-72 object-contain drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)] z-10 relative" 
                />
              )}
              {awayActiveJersey && (
                <img 
                  src={awayActiveJersey} 
                  alt="Away Jersey" 
                  className="absolute bottom-0 left-0 w-20 h-20 object-contain drop-shadow-2xl z-20 -translate-x-1/4 translate-y-1/4" 
                />
              )}
            </div>
            <div className="bg-[#112547] px-8 py-3 border-r-4 border-[#00E5FF] shadow-[10px_10px_30px_rgba(0,0,0,0.5)]" style={{ transform: 'skewX(-10deg)' }}>
              <span className="block text-4xl font-black text-white text-center uppercase tracking-widest drop-shadow-md" style={{ transform: 'skewX(10deg)' }}>{game.away_team_name}</span>
            </div>
          </div>

        </div>

        {/* Подвал: Место проведения */}
        <div className="w-full bg-[#0A1D37]/50 border-t border-[#1A3A6D]/50 flex justify-center items-center py-6 z-10 relative overflow-hidden">
          {/* Декоративный сканлайн на фоне */}
          <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,229,255,0.05)_50%)] bg-[length:100%_4px] pointer-events-none"></div>
          
          <div className="flex items-center gap-5 text-white relative z-10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#00E5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-[#A0BCE0] text-xl font-bold tracking-[0.2em] uppercase drop-shadow-sm">{fullLocation}</span>
          </div>
        </div>

      </div>
    </AnimationWrapper>
  );
}