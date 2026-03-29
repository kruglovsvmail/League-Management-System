import React from 'react';

export function AnimationWrapper({ isVisible, type, className = '', children }) {
  const animationStyles = {
    'scoreboard': 'verba-fade-slide',
    'prematch': 'verba-fade-scale',
    'event': 'verba-slide-up',
    'intermission': 'verba-fade-scale',
    'team_leaders': 'verba-fade-scale',
    'team_roster': 'verba-fade-scale',
    'commentator': 'verba-slide-up',
    'arena': 'verba-slide-up'
  };

  const animation = animationStyles[type] || 'verba-fade-scale';
  let activeClasses = '';

  if (animation === 'verba-fade-slide') {
    activeClasses = isVisible
      ? 'opacity-100 translate-y-0 transition-all duration-700 ease-[cubic-bezier(0.25,0.8,0.25,1)]'
      : 'opacity-0 -translate-y-8 pointer-events-none transition-all duration-500 ease-in-out';
  } else if (animation === 'verba-slide-up') {
    activeClasses = isVisible
      ? 'opacity-100 translate-y-0 transition-all duration-700 ease-[cubic-bezier(0.25,0.8,0.25,1)]'
      : 'opacity-0 translate-y-8 pointer-events-none transition-all duration-500 ease-in-out';
  } else if (animation === 'verba-fade-scale') {
    activeClasses = isVisible 
      ? 'opacity-100 scale-100 transition-all duration-700 ease-[cubic-bezier(0.25,0.8,0.25,1)]' 
      : 'opacity-0 scale-95 pointer-events-none transition-all duration-500 ease-in-out';
  }

  return (
    <>
      <style>{`
        /* --- ШРИФТЫ (ВЕРБАТОРИЯ) --- */
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap');

        /* Основной шрифт бренда - Helvetica (системный) или Lato */
        .font-verba { font-family: 'Helvetica Neue', Helvetica, 'Lato', Arial, sans-serif; }
        .font-verba-lato { font-family: 'Lato', sans-serif; }

        /* --- ФИРМЕННЫЕ ЦВЕТА --- */
        .bg-verba-green-main { background-color: #2E8C52; }
        .text-verba-green-main { color: #2E8C52; }
        
        .bg-verba-green-light { background-color: #40B469; }
        .text-verba-green-light { color: #40B469; }

        .bg-verba-orange { background-color: #FF5D18; }
        .text-verba-orange { color: #FF5D18; }

        .bg-verba-yellow { background-color: #F1CC46; }
        .text-verba-yellow { color: #F1CC46; }

        .bg-verba-lime { background-color: #ABCF35; }
        
        /* Паттерн "Лист" из брендбука */
        .bg-verba-pattern {
          background-image: 
            linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.05) 41%, rgba(255,255,255,0.05) 60%, transparent 61%),
            linear-gradient(-65deg, transparent 30%, rgba(255,255,255,0.08) 31%, rgba(255,255,255,0.08) 45%, transparent 46%);
        }
      `}</style>

      <div 
        className={`${className} ${activeClasses} font-verba`}
        style={{ WebkitFontSmoothing: 'antialiased' }}
      >
        {children}
      </div>
    </>
  );
}