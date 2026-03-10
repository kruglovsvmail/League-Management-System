import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from "./components/Sidebar";

export function AdminLayout({ user, onLogout, selectedLeague, onLeagueChange }) {
  // Наш супер-сложный 10-слойный волнистый градиент
  const complexMeshGradient = {
    backgroundImage: `
      radial-gradient(ellipse 100% 40% at 20% -10%, #5e5e5eff 0%, transparent 70%), /* 1. Ледяной акцент сверху */
      radial-gradient(ellipse 120% 50% at 80% 10%, #c6c6c6ff 0%, transparent 80%), /* 2. Яркий белый блик справа */
      radial-gradient(ellipse 90% 60% at 5% 40%, #dee2e6 0%, transparent 70%),   /* 3. Средне-серая волна слева */
      radial-gradient(ellipse 140% 40% at 95% 45%, #c3c3c3ff 0%, transparent 80%), /* 4. Светло-серая волна справа */
      radial-gradient(ellipse 110% 50% at 30% 70%, #b6b6b6ff 0%, transparent 80%), /* 5. Стальной акцент внизу слева */
      radial-gradient(ellipse 130% 60% at 75% 85%, #ffedd5 0%, transparent 70%), /* 6. Теплый (песочный) акцент внизу */
      radial-gradient(ellipse 80% 50% at 10% 110%, #bdbdbdff 0%, transparent 70%), /* 7. Темно-серая тень в левом углу */
      radial-gradient(ellipse 100% 60% at 90% -10%, #e9ecef 0%, transparent 70%),/* 8. Мягкий перелив в правом верхнем */
      radial-gradient(circle at 50% 50%, #fdfdfd 0%, transparent 60%),           /* 9. Центральное высветление */
      linear-gradient(135deg, #f1f3f5 0%, #e9ecef 50%, #dce0e5 100%)             /* 10. Базовая диагональная подложка */
    `,
    backgroundAttachment: 'fixed', // Чтобы градиент не уезжал при скролле страницы
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