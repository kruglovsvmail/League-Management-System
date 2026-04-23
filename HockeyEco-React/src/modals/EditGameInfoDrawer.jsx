import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SegmentButton } from '../ui/SegmentButton';
import { getToken, getImageUrl } from '../utils/helpers';
import { AccessFallback } from '../ui/AccessFallback';

export function EditGameInfoDrawer({ isOpen, onClose, game, onSuccess, readOnly = false }) {
  const [form, setForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Проверка статуса матча: Джерси можно менять только у матчей "В расписании" (scheduled)
  const isStatusLocked = game && game.status !== 'scheduled';
  
  // Джерси блокируются, если либо нет прав, либо матч уже начался
  const isJerseysDisabled = readOnly || isStatusLocked;

  useEffect(() => {
    if (isOpen && game) {
      setForm({
        game_date: game.game_date,
        stage_type: game.stage_type,
        stage_label: game.stage_label,
        series_number: game.series_number,
        arena_id: game.arena_id, 
        video_yt_url: game.video_yt_url || '',
        video_vk_url: game.video_vk_url || '',
        home_jersey_type: game.home_jersey_type || 'dark',
        away_jersey_type: game.away_jersey_type || 'light'
      });
    }
  }, [isOpen, game]);

  const handleSave = async () => {
    if (readOnly) return;
    
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${game.id}/info`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      }
    } catch (e) {
      console.error('Ошибка сохранения настроек матча:', e);
    } finally {
      setIsSaving(false);
    }
  };

  // Безопасное получение текущего типа формы
  const currentHomeType = form.home_jersey_type || game?.home_jersey_type || 'dark';
  const currentAwayType = form.away_jersey_type || game?.away_jersey_type || 'light';

  // Вычисляем картинки джерси. Если реальной нет — берем дефолтную из S3!
  const homeJerseyImg = currentHomeType === 'dark' 
    ? (game?.home_jersey_dark || '/default/jersey_dark.webp') 
    : (game?.home_jersey_light || '/default/jersey_light.webp');

  const awayJerseyImg = currentAwayType === 'dark' 
    ? (game?.away_jersey_dark || '/default/jersey_dark.webp') 
    : (game?.away_jersey_light || '/default/jersey_light.webp');

  return (
    <div className={`fixed inset-y-0 right-0 w-[450px] bg-white shadow-2xl z-[1000] transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      
      <div className="p-6 border-b border-graphite/10 flex items-center justify-between bg-graphite/5 shrink-0">
        <h3 className="text-[18px] font-black uppercase text-graphite tracking-tight">Форма и ссылки</h3>
        <button onClick={onClose} className="p-2 hover:bg-graphite/10 rounded-full transition-colors">
          <svg className="w-6 h-6 text-graphite/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
        
        {readOnly && (
           <AccessFallback variant="readonly" message="У вас нет прав на редактирование медиа-настроек." />
        )}

        <div className={`space-y-6 ${isJerseysDisabled ? 'opacity-40 pointer-events-none grayscale-[30%]' : ''}`}>
          <h4 className="text-[12px] font-black uppercase text-graphite-light tracking-widest flex items-center gap-2">
            {isStatusLocked && !readOnly && (
               <span className="text-[9px] font-bold text-orange normal-case tracking-normal bg-orange/10 px-2 py-0.5 rounded-full">Только до начала матча</span>
            )}
          </h4>
          <div className="flex gap-4">
            
            {/* Хозяева */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-[11px] font-bold text-graphite-light mb-3 uppercase tracking-wide block text-center truncate w-full px-2" title={game?.home_team_name}>
                {game?.home_team_name || 'Хозяева'}
              </span>
              <div className="w-full">
                <SegmentButton 
                  key={`home-seg-${game?.id}`}
                  options={['Темная', 'Светлая']} 
                  defaultIndex={currentHomeType === 'dark' ? 0 : 1} 
                  onChange={(i) => setForm({...form, home_jersey_type: i === 0 ? 'dark' : 'light'})} 
                />
              </div>
              <div className="mt-4 w-[130px] h-[130px] bg-graphite/[0.02] border border-graphite/10 rounded-xl flex flex-col items-center justify-center p-3 relative group overflow-hidden">
                <img src={getImageUrl(homeJerseyImg)} alt="Home Jersey" className="w-full h-full object-contain drop-shadow-sm transition-transform group-hover:scale-105 duration-300" />
              </div>
            </div>

            {/* Гости */}
            <div className="flex-1 flex flex-col items-center">
              <span className="text-[11px] font-bold text-graphite-light mb-3 uppercase tracking-wide block text-center truncate w-full px-2" title={game?.away_team_name}>
                {game?.away_team_name || 'Гости'}
              </span>
              <div className="w-full">
                <SegmentButton 
                  key={`away-seg-${game?.id}`}
                  options={['Темная', 'Светлая']} 
                  defaultIndex={currentAwayType === 'dark' ? 0 : 1} 
                  onChange={(i) => setForm({...form, away_jersey_type: i === 0 ? 'dark' : 'light'})} 
                />
              </div>
              <div className="mt-4 w-[130px] h-[130px] bg-graphite/[0.02] border border-graphite/10 rounded-xl flex flex-col items-center justify-center p-3 relative group overflow-hidden">
                <img src={getImageUrl(awayJerseyImg)} alt="Away Jersey" className="w-full h-full object-contain drop-shadow-sm transition-transform group-hover:scale-105 duration-300" />
              </div>
            </div>

          </div>
        </div>

        <div className={`space-y-4 pt-4 border-t border-graphite/10 ${readOnly ? 'opacity-50 pointer-events-none' : ''}`}>
          <h4 className="text-[12px] font-black uppercase text-graphite-light tracking-widest"></h4>
          <Input 
            label="Ссылка на YouTube" 
            placeholder="https://youtu.be/..." 
            value={form.video_yt_url} 
            onChange={e => setForm({...form, video_yt_url: e.target.value})} 
          />
          <Input 
            label="Ссылка на VK Видео" 
            placeholder="https://vk.com/video..." 
            value={form.video_vk_url} 
            onChange={e => setForm({...form, video_vk_url: e.target.value})} 
          />
        </div>
      </div>

      {!readOnly && (
        <div className="p-6 bg-white border-t border-graphite/10 shrink-0">
          <Button 
            onClick={handleSave} 
            className="w-full shadow-lg" 
            isLoading={isSaving}
            disabled={isSaving}
          >
            Сохранить медиа-настройки
          </Button>
        </div>
      )}
    </div>
  );
}