import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from "./components/Sidebar";

export function AdminLayout({ user, onLogout, selectedLeague, onLeagueChange }) {
  // Наш супер-сложный фон
const complexMeshGradient = {
  backgroundColor: '#c6c6c6ff'
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