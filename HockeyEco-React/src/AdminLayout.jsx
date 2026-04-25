import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from "./components/Sidebar";

export function AdminLayout({ user, onLogout, selectedLeague, onLeagueChange }) {
  // Наш супер-сложный фон
const complexMeshGradient = {
  backgroundImage: `
    /* 1. Основной мягкий свет сверху (создает объем) */
    radial-gradient(circle at 50% -20%, #b4b4b4ff 0%, transparent 50%),

    /* 2. Теплый акцент: Насыщенный персиковый/оранжевый (для глубины размытия) */
    radial-gradient(circle at 85% 30%, rgba(203, 203, 203, 0.33) 0%, transparent 50%),

    /* 3. Мягкий золотисто-бежевый (воздушность) */
    radial-gradient(circle at 15% 45%, rgba(164, 164, 164, 0.34) 0%, transparent 45%),

    /* 4. Нижний теплый контур (поддержка "жидкого стекла") */
    radial-gradient(circle at 70% 85%, rgba(181, 181, 181, 0.24) 0%, transparent 40%),

    /* 5. Базовая чистая подложка в стиле HockeyEco */
    linear-gradient(135deg, #d3d3d3ff 0%, #edeef0 100%)
  `,
  backgroundAttachment: 'fixed',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundColor: '#f5f7f8'
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