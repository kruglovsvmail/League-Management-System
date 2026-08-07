import React, { useState, useEffect } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { getImageUrl, getToken } from '../utils/helpers';

/**
 * Привязка существующей команды к клубу (teams.club_id).
 * Рядом с каждой командой показываем её текущий клуб: забрать команду у другой
 * организации можно, но админ должен видеть, что делает.
 */
export function AttachTeamDrawer({ isOpen, onClose, clubId, clubName, onSuccess }) {
  const [query, setQuery] = useState('');
  const [teams, setTeams] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');


  useEffect(() => {
    if (!isOpen) {
      setQuery(''); setTeams([]); setSelectedTeam(null); setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchTeams = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/clubs-manage/teams/search?q=${encodeURIComponent(query)}`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (data.success) setTeams(data.data);
      } catch (err) { console.error(err); }
      setIsLoading(false);
    };

    const timer = setTimeout(fetchTeams, 300);
    return () => clearTimeout(timer);
  }, [query, isOpen]);

  const save = async () => {
    if (!selectedTeam) return;
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/clubs-manage/${clubId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify({ teamId: selectedTeam.id })
      });
      const data = await res.json();
      if (data.success) {
        onSuccess?.(data);
        onClose();
      } else {
        setError(data.error || 'Не удалось привязать команду');
      }
    } catch (err) {
      console.error(err);
      setError('Сбой сети. Попробуйте ещё раз.');
    }
    setIsSaving(false);
  };

  const isAlreadyHere = selectedTeam && String(selectedTeam.club_id) === String(clubId);
  const isInAnotherClub = selectedTeam && selectedTeam.club_id && !isAlreadyHere;

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-[450px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-6 py-5 border-b border-graphite/10 bg-white shrink-0">
          <div className="min-w-0">
            <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Привязать команду</h2>
            <span className="block text-[12px] text-graphite-light font-bold truncate mt-0.5">{clubName}</span>
          </div>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-status-rejected/10 border border-status-rejected/30 rounded-md shrink-0">
            <p className="text-[13px] font-bold text-status-rejected leading-tight">{error}</p>
          </div>
        )}

        {!selectedTeam ? (
          <>
            <div className="p-6 bg-white border-b border-graphite/5 shrink-0">
              <Input placeholder="Поиск команды..." value={query} onChange={(e) => setQuery(e.target.value)} />
              <p className="text-[11px] text-graphite-light mt-2 px-1">
                Создать новую команду здесь нельзя — привязываются только уже существующие.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-2">
              {isLoading && <div className="text-center py-6 text-graphite-light font-medium text-[13px]">Поиск...</div>}
              {!isLoading && teams.map(t => (
                <div key={t.id} onClick={() => setSelectedTeam(t)} className="flex items-center gap-4 p-4 bg-white rounded-md border border-graphite/10 cursor-pointer hover:border-orange hover:shadow-sm transition-all">
                  <img
                    src={getImageUrl(t.logo_url) || '/default/Logo_team_default.webp'}
                    className="w-10 h-10 object-contain bg-graphite/5 rounded-lg shrink-0"
                    alt="logo"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block font-bold text-graphite text-[14px] truncate">{t.name}</span>
                    <span className="block text-[11px] text-graphite-light mt-0.5 truncate">
                      {t.city || 'Город не указан'}
                    </span>
                  </div>
                  {String(t.club_id) === String(clubId) ? (
                    <span className="text-[10px] font-black uppercase text-orange shrink-0">Уже в клубе</span>
                  ) : t.club_id ? (
                    <span className="text-[10px] font-bold uppercase text-status-rejected shrink-0 max-w-[110px] truncate" title={t.club_name}>
                      {t.club_name}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase text-graphite/40 shrink-0">Без клуба</span>
                  )}
                </div>
              ))}
              {!isLoading && teams.length === 0 && (
                <div className="text-center py-10 text-graphite-light font-medium text-[13px]">Команды не найдены</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col animate-zoom-in overflow-hidden">
            <div className="p-6 bg-white border-b border-graphite/10 flex items-center gap-4 shrink-0">
              <img
                src={getImageUrl(selectedTeam.logo_url) || '/default/Logo_team_default.webp'}
                className="w-16 h-16 object-contain bg-graphite/5 rounded-md shadow-sm"
                alt="logo"
              />
              <div className="min-w-0">
                <span className="block font-black text-graphite text-lg leading-tight truncate">{selectedTeam.name}</span>
                <span className="block text-[12px] text-graphite-light mt-0.5">{selectedTeam.city || 'Город не указан'}</span>
                <span className="block text-sm mt-1" onClick={() => setSelectedTeam(null)}>
                  <span className="text-orange hover:underline cursor-pointer">Выбрать другую</span>
                </span>
              </div>
            </div>

            <div className="p-6 flex-1 bg-gray-50/50 overflow-y-auto custom-scrollbar">
              {isAlreadyHere ? (
                <div className="p-4 bg-status-rejected/10 border border-status-rejected/30 rounded-md">
                  <p className="text-[13px] font-bold text-status-rejected leading-tight">Эта команда уже принадлежит клубу.</p>
                </div>
              ) : (
                <div className="p-4 bg-orange/10 border border-orange/30 rounded-md">
                  <p className="text-[13px] font-bold text-orange leading-tight">
                    Команда станет частью клуба: её события увидят все члены клуба, а клубный
                    штаб получит в ней свои полномочия.
                  </p>
                  {isInAnotherClub && (
                    <p className="text-[13px] font-bold text-status-rejected leading-tight mt-2">
                      Сейчас команда числится в клубе «{selectedTeam.club_name}» — он её потеряет.
                    </p>
                  )}
                </div>
              )}

              {!isAlreadyHere && (
                <div className="mt-4 p-4 bg-white border border-graphite/10 rounded-md">
                  <p className="text-[13px] font-bold text-graphite leading-tight">
                    Действующие игроки команды попадут в общую базу клуба
                  </p>
                  <p className="text-[12px] text-graphite-light leading-tight mt-2">
                    Иначе они видели бы клубные события, но не могли на них отметиться.
                    Ранее ушедшие из клуба вернутся в состав, но без прежних клубных ролей.
                    При отвязке команды эти люди из клуба уйдут — кроме тех, кого держит
                    другая команда клуба или клубная роль.
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 bg-white border-t border-graphite/10 shrink-0">
              <Button
                onClick={save}
                isLoading={isSaving}
                disabled={isSaving || isAlreadyHere}
                className={`w-full py-3 ${isAlreadyHere ? 'opacity-50 grayscale' : ''}`}
              >
                {isAlreadyHere ? 'Уже в клубе' : 'Привязать к клубу'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
