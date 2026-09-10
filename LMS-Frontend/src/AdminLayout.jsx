import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from "./components/Sidebar";

export function AdminLayout({ user, onLogout, selectedLeague, onLeagueChange, onPatchSelectedLeague }) {
  // Наш супер-сложный фон
const complexMeshGradient = {
  backgroundColor: '#e2e4e7'
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
      
      <div className="flex-1 ml-[200px] flex flex-col min-h-screen relative z-10">
        {/* onPatchSelectedLeague — чтобы правка настроек лиги подхватывалась сразу,
            а не после перезагрузки страницы (см. PreferencesTab) */}
        <Outlet context={{ user, selectedLeague, onPatchSelectedLeague }} /> 
      </div>
    </div>
  );
}