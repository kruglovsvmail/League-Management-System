import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { LeagueSelectModal } from '../modals/LeagueSelectModal';
import { ProfileDrawer } from '../modals/ProfileDrawer';
import { getImageUrl } from '../utils/helpers';

const ROLE_NAMES = {
  'top_manager': 'Руководитель',
  'league_admin': 'Админ',
  'referee': 'Судья',
  'media': 'Медиа',
};

const translateRoles = (roleString) => {
  if (!roleString) return 'Пользователь';
  return roleString.split(', ').map(r => ROLE_NAMES[r] || r).join(', ');
};

export function Sidebar({ user, onLogout, selectedLeague, onLeagueChange }) {
  const [isLeagueModalOpen, setIsLeagueModalOpen] = useState(false);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setLogoError(false);
  }, [selectedLeague]);

  const baseMenuItems = [
    { name: "Матчи", path: "/games", icon: "matches" },
    { name: "Дивизионы", path: "/divisions", icon: "divisions" },
    { name: "Трансферы", path: "/transfers", icon: "transfers" },
    { name: "Дисквалификации", path: "/disqualifications", icon: "disqualifications" },
    { name: "Справочник", path: "/handbook", icon: "handbook" },
    { name: "Настройки", path: "/settings", icon: "settings" }
  ];

  let displayRole = 'Пользователь';
  if (user?.globalRole === 'admin') {
    displayRole = 'Властелин';
  } else if (selectedLeague && selectedLeague.role) {
    displayRole = translateRoles(selectedLeague.role);
  }

  const hasValidLogo = selectedLeague?.logo_url && !logoError;

  // Вспомогательная функция для рендера кнопок меню
  const renderNavLink = (item) => (
    <NavLink
      key={item.path}
      to={item.path}
      className={({ isActive }) => `
        flex items-center gap-3.5 px-3 py-3 rounded-lg transition-all duration-200 group border border-transparent
        ${isActive ? 'bg-white/10 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'text-gray-400 hover:border-white/20'}
      `}
    >
      {({ isActive }) => (
        <>
          <Icon 
            name={item.icon} 
            className={`w-5 h-5 transition-colors duration-200 ${isActive ? 'text-orange' : 'opacity-60'}`} 
          />
          <span className={`text-[13px] tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>{item.name}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <>
      <aside className="fixed left-0 top-0 h-screen w-[230px] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#2a2d32] via-[#1a1c1e] to-[#0a0b0c] text-white flex flex-col z-40 border-r border-white/5 shadow-[4px_0_24px_rgba(0,0,0,0.2)]">
        
        {/* Логотип и выбор лиги */}
        <div className="p-7 pb-2">
          <h1 className="text-[1.15rem] font-bold tracking-[0.1em] text-white uppercase flex items-center justify-center gap-1.5 mb-6">
            Hockey <span className="text-orange font-medium">Eco</span>
          </h1>
          
          {user?.leagues && user.leagues.length > 0 && (
            <div 
              onClick={() => setIsLeagueModalOpen(true)}
              className="flex justify-center cursor-pointer group transition-all pb-2"
              title={selectedLeague?.name ? `Лига: ${selectedLeague.name} (нажмите, чтобы изменить)` : 'Выбрать лигу'}
            >
              <div className={`w-[100px] h-[100px] shrink-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-110 ${
                hasValidLogo ? '' : 'bg-white rounded-xl overflow-hidden shadow-md group-hover:shadow-lg'
              }`}>
                {hasValidLogo ? (
                  <img 
                    src={getImageUrl(selectedLeague.logo_url)} 
                    alt="Logo" 
                    className="w-full h-full object-contain drop-shadow-md" 
                    onError={() => setLogoError(true)} 
                  />
                ) : (
                  <span className="text-graphite font-black text-[22px]">
                    {selectedLeague?.short_name?.substring(0, 2) || 'ЛГ'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Навигация */}
        <nav className="flex-1 overflow-y-auto px-4 mt-4 custom-scrollbar">
          
          {/* Основные разделы */}
          <div className="space-y-1">
            {baseMenuItems.map(renderNavLink)}
          </div>

          {/* Разделитель и админские разделы */}
          {user?.globalRole === 'admin' && (
            <div className="mt-6 pt-4 border-t border-white/10 space-y-1">
              {renderNavLink({ name: "Глобальный Реестр", path: "/registry", icon: "registry" })}
              {renderNavLink({ name: "Упр. командой", path: "/teams", icon: "team" })}
            </div>
          )}
          
        </nav>

        {/* Нижний блок: профиль и выход */}
        <div className="mt-auto p-4 bg-black/10 border-t border-white/5">
          <div 
            onClick={() => setIsProfileDrawerOpen(true)}
            className="flex gap-3 px-2 mb-4 cursor-pointer hover:opacity-80 transition-opacity"
            title="Открыть настройки профиля"
          >
            <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-graphite border border-white/10 mt-0.5">
              <img 
                src={getImageUrl(user?.avatarUrl || '/default/user_default.webp')} 
                alt="Profile" 
                className="w-full h-full object-cover" 
                onError={(e) => { e.target.src = getImageUrl('/default/user_default.webp') }} 
              />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[13px] font-bold truncate text-white leading-tight">
                {user?.firstName || 'Имя'} {user?.lastName ? `${user.lastName.charAt(0)}.` : ''}
              </span>
              <span 
                className="text-[11px] font-medium text-orange/80 mt-1 leading-[1.2] line-clamp-2"
                title={displayRole}
              >
                {displayRole}
              </span>
            </div>
          </div>

          <button onClick={onLogout} className="w-full flex items-center gap-3 px-2 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors group">
            <svg className="w-5 h-5 opacity-70 group-hover:text-status-rejected group-hover:opacity-100 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span className="text-[13px] font-medium group-hover:text-white/50 transition-colors tracking-wide">Выйти из системы</span>
          </button>
        </div>
      </aside>

      <LeagueSelectModal 
        isOpen={isLeagueModalOpen}
        onClose={() => setIsLeagueModalOpen(false)}
        leagues={user?.leagues || []}
        currentLeagueId={selectedLeague?.id}
        onSelect={onLeagueChange}
      />

      <ProfileDrawer 
        isOpen={isProfileDrawerOpen}
        onClose={() => setIsProfileDrawerOpen(false)}
        user={user}
      />
    </>
  );
}