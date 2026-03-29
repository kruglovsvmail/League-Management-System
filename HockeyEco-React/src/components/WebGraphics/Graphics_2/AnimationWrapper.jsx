import React from 'react';

export function AnimationWrapper({ isVisible, type, className = '', children }) {
  const animationStyles = {
    'scoreboard': 'mts-fade-slide',
    'prematch': 'mts-fade-in',
    'event': 'mts-fade-slide',
    'intermission': 'mts-fade-in',
    'team_leaders': 'mts-fade-in',
    'team_roster': 'mts-fade-in',
    'commentator': 'mts-fade-slide',
  };

  const animation = animationStyles[type] || 'mts-fade-in';
  let activeClasses = '';

  if (animation === 'mts-fade-slide') {
    activeClasses = isVisible
      ? 'opacity-100 translate-y-0 transition-all duration-500 ease-out'
      : 'opacity-0 -translate-y-8 pointer-events-none transition-all duration-400 ease-in';
  } else if (animation === 'mts-fade-in') {
    activeClasses = isVisible 
      ? 'opacity-100 transition-opacity duration-500 ease-out' 
      : 'opacity-0 pointer-events-none transition-opacity duration-400 ease-in';
  }

  return (
    <>
      <style>{`
        /* Корпоративный чистый шрифт */
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');

        /* ФИРМЕННЫЕ ЦВЕТА МТС (Брендбук 2006) */
        .bg-mts-red { background-color: #FF0000; }
        .text-mts-red { color: #FF0000; }
        
        .bg-mts-black { background-color: #1E1E1E; }
        .text-mts-black { color: #1E1E1E; }
        
        .bg-mts-grey-light { background-color: #ADAFAF; }
        .text-mts-grey-light { color: #ADAFAF; }
        
        .bg-mts-grey-dark { background-color: #666465; }
        .text-mts-grey-dark { color: #666465; }

        .font-corp {
          font-family: 'Inter', sans-serif;
        }
      `}</style>

      <div 
        className={`${className} ${activeClasses} font-corp`}
        style={{ WebkitFontSmoothing: 'antialiased' }}
      >
        {children}
      </div>
    </>
  );
}