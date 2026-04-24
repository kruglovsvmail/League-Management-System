import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from "./components/Sidebar";

export function AdminLayout({ user, onLogout, selectedLeague, onLeagueChange }) {
  // Наш супер-сложный фон
const complexMeshGradient = {
  backgroundImage: `
    /* 1. Строгая инженерная микро-сетка (создает системный паттерн и текстуру данных) */
    repeating-linear-gradient(0deg, rgba(20, 30, 40, 0.02) 0px, rgba(20, 30, 40, 0.02) 1px, transparent 1px, transparent 32px),
    repeating-linear-gradient(90deg, rgba(20, 30, 40, 0.02) 0px, rgba(20, 30, 40, 0.02) 1px, transparent 1px, transparent 32px),

    /* 2. Макро-векторы и технологические диагонали (задают направление и динамику) */
    repeating-linear-gradient(135deg, transparent 0px, transparent 200px, rgba(255, 255, 255, 0.5) 200px, rgba(255, 255, 255, 0.5) 201px, transparent 201px, transparent 400px),
    repeating-linear-gradient(45deg, transparent 0px, transparent 150px, rgba(20, 30, 40, 0.03) 150px, rgba(20, 30, 40, 0.03) 151px, transparent 151px, transparent 300px),

    /* 3. Концентрические кольца-радары (добавляют фокусность и системную глубину в левом углу) */
    repeating-radial-gradient(circle at 10% 20%, transparent 0, transparent 60px, rgba(255, 255, 255, 0.15) 60px, rgba(255, 255, 255, 0.15) 61px),

    /* 4. Атмосферное освещение (Mesh-база: переходы от холодного серого к теплым бежевым теням) */
    radial-gradient(ellipse 100% 100% at 20% 0%, #baaf92ff 0%, transparent 60%),     /* Чистый светлый источник сверху */
    radial-gradient(ellipse 120% 100% at 85% 15%, #bbd0ddff 0%, transparent 65%),     /* Теплый титановый (беж) справа */
    radial-gradient(ellipse 100% 120% at 10% 90%, #bfcbd7ff 0%, transparent 60%),     /* Глубокий стальной серый снизу слева */
    radial-gradient(ellipse 120% 100% at 90% 85%, #d1b99bff 0%, transparent 65%),     /* Мягкий платиновый снизу справа */
    radial-gradient(circle at 50% 50%, #cae4a6ff 0%, transparent 50%),                /* Нейтральный центр для контента */

    /* 5. Объемное виньетирование (создает атмосферу большого, глубокого пространства) */
    radial-gradient(circle at 50% 50%, transparent 40%, rgba(120, 125, 130, 0.15) 100%),

    /* 6. Базовая градиентная подложка (матовый металлик) */
    linear-gradient(135deg, #e8ecef 0%, #d4d8db 50%, #c5c1ba 100%)
  `,
  backgroundAttachment: 'fixed',
  backgroundSize: 'cover',
  backgroundPosition: 'center'
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