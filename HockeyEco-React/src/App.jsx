import { getToken } from './utils/helpers';
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';

// Импорт страниц
import { LoginPage } from './pages/LoginPage';
import { HandbookPage } from './pages/HandbookPage';
import { SettingsPage } from './pages/SettingsPage';
import { DivisionsPage } from './pages/DivisionsPage';
import { TransfersPage } from './pages/TransfersPage';
import { DisqualificationsPage } from './pages/DisqualificationsPage';
import { GlobalRegistryPage } from './pages/GlobalRegistryPage';
import { TeamManagementPage } from './pages/TeamManagementPage';
import { GamesPage } from './pages/GamesPage';
import { GamePage } from './pages/GamePage';
import { GameLiveDesk } from './pages/GameLiveDesk'; // <-- НОВЫЙ ИМПОРТ ПАНЕЛИ СЕКРЕТАРЯ

// Импорт каркаса и UI
import { AdminLayout } from './AdminLayout';
import { Loader } from './ui/Loader';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedLeague, setSelectedLeague] = useState(null);
  
  const [isInitializing, setIsInitializing] = useState(true);
  const [showGlobalLoader, setShowGlobalLoader] = useState(true);
  
  const navigate = useNavigate();

  const initLeague = (user) => {
    const savedLeagueId = localStorage.getItem('hockeyeco_selected_league');
    if (user?.leagues && user.leagues.length > 0) {
      const found = user.leagues.find(l => l.id.toString() === savedLeagueId);
      setSelectedLeague(found || user.leagues[0]);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('hockeyeco_user');
    sessionStorage.removeItem('hockeyeco_user');
    localStorage.removeItem('hockeyeco_token');
    sessionStorage.removeItem('hockeyeco_token');
    localStorage.removeItem('hockeyeco_selected_league');
    sessionStorage.clear(); 

    setIsAuthenticated(false);
    setCurrentUser(null);
    setSelectedLeague(null);
    navigate('/login');
  };

  useEffect(() => {
    const savedUserStr = localStorage.getItem('hockeyeco_user') || sessionStorage.getItem('hockeyeco_user');
    const token = getToken();
    
    if (savedUserStr && token) {
      const parsedUser = JSON.parse(savedUserStr);
      setCurrentUser(parsedUser);
      setIsAuthenticated(true);
      initLeague(parsedUser);

      fetch(`${import.meta.env.VITE_API_URL}/api/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setCurrentUser(data.user);
            initLeague(data.user);
            if (localStorage.getItem('hockeyeco_user')) {
              localStorage.setItem('hockeyeco_user', JSON.stringify(data.user));
            } else {
              sessionStorage.setItem('hockeyeco_user', JSON.stringify(data.user));
            }
          } else {
            handleLogout();
          }
        })
        .catch(console.error)
        .finally(() => {
          setIsInitializing(false);
          setTimeout(() => setShowGlobalLoader(false), 500);
        });
    } else {
      setIsInitializing(false);
      setTimeout(() => setShowGlobalLoader(false), 500);
    }
  }, []); 

  const handleLoginSuccess = (userData) => {
    setCurrentUser(userData);
    setIsAuthenticated(true);
    initLeague(userData);
    navigate('/divisions'); 
  };

  const handleLeagueChange = (league) => {
    setSelectedLeague(league);
    localStorage.setItem('hockeyeco_selected_league', league.id);
    navigate('/divisions'); 
  };

  return (
    <>
      {showGlobalLoader && (
        <div className={`fixed inset-0 z-[10000] bg-[#F0F2F5] flex items-center justify-center transition-opacity duration-500 ease-in-out ${isInitializing ? 'opacity-100' : 'opacity-0'}`}>
          <Loader text="Запуск HockeyEco Pro..." />
        </div>
      )}

      {!isInitializing && (
        <Routes>
          <Route 
            path="/login" 
            element={ isAuthenticated ? <Navigate to="/divisions" replace /> : <LoginPage onLoginSuccess={handleLoginSuccess} /> } 
          />

          {/* === НОВЫЙ РОУТ ДЛЯ ПАНЕЛИ СЕКРЕТАРЯ (БЕЗ ADMIN LAYOUT) === */}
          <Route 
            path="/games/:gameId/live-desk" 
            element={
              isAuthenticated 
                ? <GameLiveDesk user={currentUser} /> 
                : <Navigate to="/login" replace />
            } 
          />

          <Route 
            path="/" 
            element={
              isAuthenticated 
                ? <AdminLayout 
                    user={currentUser} 
                    onLogout={handleLogout} 
                    selectedLeague={selectedLeague}
                    onLeagueChange={handleLeagueChange}
                  /> 
                : <Navigate to="/login" replace />
            }
          >
            <Route index element={<Navigate to="/divisions" replace />} />
            
            {/* ЗАЩИТА: Только для global_role === 'admin' */}
            <Route 
              path="registry" 
              element={currentUser?.globalRole === 'admin' ? <GlobalRegistryPage /> : <Navigate to="/divisions" replace />} 
            />
            <Route 
              path="teams" 
              element={currentUser?.globalRole === 'admin' ? <TeamManagementPage /> : <Navigate to="/divisions" replace />} 
            />
            
            <Route path="divisions" element={<DivisionsPage />} />
            <Route path="games" element={<GamesPage />} />
            <Route path="handbook" element={<HandbookPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="transfers" element={<TransfersPage />} />
            <Route path="games/:gameId" element={<GamePage />} />
            <Route path="disqualifications" element={<DisqualificationsPage />} />
            <Route path="*" element={<Navigate to="/divisions" replace />} />
          </Route>
        </Routes>
      )}
    </>
  );
}