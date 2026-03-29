import React, { useState, useEffect } from 'react';
import { getImageUrl } from '../../../utils/helpers';
import { AnimationWrapper } from './AnimationWrapper';

export default function PreMatchOverlay({ game, overlay }) {
  const isVisible = overlay.visible && overlay.type === 'prematch';
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!isVisible || !overlay.data) return;
    if (overlay.data.isPaused) {
       setTimeLeft(overlay.data.timeLeft || 0); return;
    }
    if (overlay.data.endTime) {
       const updateTimer = () => setTimeLeft(Math.max(0, Math.floor((overlay.data.endTime - Date.now()) / 1000)));
       updateTimer(); 
       const interval = setInterval(updateTimer, 1000);
       return () => clearInterval(interval);
    }
  }, [isVisible, overlay.data]);

  if (!game) return null;

  const formatCountdown = (s) => `${Math.floor(s / 60)}:${('0' + (s % 60)).slice(-2)}`;

  const leagueLogo = getImageUrl(game.league_logo);
  const homeLogo = getImageUrl(game.home_team_logo);
  const awayLogo = getImageUrl(game.away_team_logo);

  const dateObj = game.game_date ? new Date(game.game_date) : null;
  const dateStr = dateObj ? dateObj.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
  const arenaText = game.arena_name || game.location_text || 'Арена';

  return (
    <AnimationWrapper
      type="prematch"
      isVisible={isVisible}
      className="absolute inset-0 flex items-center justify-center z-50 bg-black/20 backdrop-blur-sm"
    >
      <div className="relative flex flex-col w-[1300px] h-[800px] bg-verba-green-main rounded-[40px] shadow-2xl overflow-hidden bg-verba-pattern">
        
        {/* Мягкие градиентные сферы на фоне */}
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-verba-lime rounded-full blur-[120px] opacity-20 pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-verba-green-light rounded-full blur-[120px] opacity-40 pointer-events-none"></div>

        {/* ШАПКА */}
        <div className="flex items-center justify-between px-16 py-10 relative z-10">
            <div className="flex items-center gap-6">
                {leagueLogo && <img src={leagueLogo} alt="League" className="h-16 object-contain" />}
                <div className="flex flex-col text-white">
                   <span className="font-verba-lato font-bold text-3xl tracking-wide">{game.league_name}</span>
                   <span className="text-white/70 font-bold uppercase tracking-widest text-sm">{game.division_name}</span>
                </div>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-full px-6 py-2 border border-white/20">
               <span className="text-white font-bold uppercase tracking-widest">{dateStr} • {arenaText}</span>
            </div>
        </div>

        {/* ОСНОВНАЯ ЗОНА (Команды и VS) */}
        <div className="flex-1 flex items-center justify-between px-20 relative z-10 pb-10">
            
            {/* Хозяева */}
            <div className="flex flex-col items-center w-[350px]">
                <div className="bg-white rounded-full w-[280px] h-[280px] flex items-center justify-center p-8 shadow-xl mb-8">
                    {homeLogo && <img src={homeLogo} alt="Home" className="w-full h-full object-contain" />}
                </div>
                <span className="font-verba-lato font-black text-4xl text-white text-center tracking-wide drop-shadow-md">
                  {game.home_team_name}
                </span>
            </div>

            {/* ЦЕНТР (VS и ТАЙМЕР) */}
            <div className="flex flex-col items-center justify-center w-[300px]">
                {/* Оранжевый VS как акцент бренда */}
                <div className="bg-verba-orange rounded-full w-24 h-24 flex items-center justify-center shadow-lg mb-10">
                    <span className="font-verba-lato font-black text-4xl text-white italic pr-1">VS</span>
                </div>
                
                <div className="flex flex-col items-center bg-white rounded-3xl p-8 shadow-2xl w-full text-center border-b-4 border-verba-yellow">
                    <span className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2">Начало матча через</span>
                    <span className={`font-verba-lato font-black text-6xl tracking-tighter ${timeLeft <= 60 && !overlay.data?.isPaused ? 'text-verba-orange' : 'text-gray-800'}`}>
                        {formatCountdown(timeLeft)}
                    </span>
                </div>
            </div>

            {/* Гости */}
            <div className="flex flex-col items-center w-[350px]">
                <div className="bg-white rounded-full w-[280px] h-[280px] flex items-center justify-center p-8 shadow-xl mb-8">
                    {awayLogo && <img src={awayLogo} alt="Away" className="w-full h-full object-contain" />}
                </div>
                <span className="font-verba-lato font-black text-4xl text-white text-center tracking-wide drop-shadow-md">
                  {game.away_team_name}
                </span>
            </div>

        </div>
      </div>
    </AnimationWrapper>
  );
}