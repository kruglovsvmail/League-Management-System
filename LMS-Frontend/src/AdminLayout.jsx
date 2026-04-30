import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from "./components/Sidebar";

export function AdminLayout({ user, onLogout, selectedLeague, onLeagueChange }) {
  // Наш супер-сложный фон
const complexMeshGradient = {
  backgroundImage: `
    /* 1. Эффект виньетки (затемнение по краям создает эффект "коробки" и погружает центр в глубину) */
    radial-gradient(circle at 50% 50%, transparent 50%, rgba(119, 119, 119, 0.35) 100%),


    /* 15. Базовая подложка */
    linear-gradient(135deg, #d6cec6ff 0%, #c3c3c3ff 100%)
  `,
  backgroundAttachment: 'fixed',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundColor: '#acb1b8'
};

  return (
    // Убрали bg-[#dededeff], добавили style
    <div className="flex min-h-screen" style={complexMeshGradient}>
      <Sidebar 
        user={user} 
        onLogout={onLogout} 
        selectedLeague={selectedLeague}
        onLeagueChange={onLeagueChange}
      />
      
      <div className="flex-1 ml-[230px] flex flex-col min-h-screen relative z-10">
        <Outlet context={{ user, selectedLeague }} /> 
      </div>
    </div>
  );
}