import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Stepper } from '../ui/Stepper';
import { SegmentButton } from '../ui/SegmentButton';
import { DateTimePicker } from '../ui/DateTimePicker';
import { getToken } from '../utils/helpers';
import dayjs from 'dayjs'; // <-- ДОБАВИЛИ ИМПОРТ

const REGULAR_ROUNDS = ['1-й круг', '2-й круг', '3-й круг', '4-й круг', '5-й круг', '6-й круг'];
const PLAYOFF_ROUNDS = ['1/8 финала', '1/4 финала', '1/2 финала', 'Финал', 'Матч за 3-е место'];

export function EditGameInfoDrawer({ isOpen, onClose, game, arenas = [], onSuccess }) {
  const [form, setForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [formKey, setFormKey] = useState(0); 

  useEffect(() => {
    if (isOpen && game) {
      setForm({
        game_date: game.game_date,
        arenaName: game.location_text || '',
        stage_type: game.stage_type || 'regular',
        stage_label: game.stage_label || (game.stage_type === 'regular' ? '1-й круг' : 'Финал'),
        series_number: game.series_number || 1,
        video_yt_url: game.video_yt_url || '',
        video_vk_url: game.video_vk_url || '',
        home_jersey_type: game.home_jersey_type || 'dark',
        away_jersey_type: game.away_jersey_type || 'light'
      });
      setFormKey(prev => prev + 1); 
    }
  }, [isOpen, game]);

  const handleSave = async () => {
    setIsSaving(true);
    const arenaObj = arenas.find(a => a.name === form.arenaName);
    
    // ФИКС ВРЕМЕНИ: Жестко форматируем локальную дату в строку, 
    // чтобы при отправке на сервер время не сместилось в UTC
    const formattedDate = form.game_date 
      ? dayjs(form.game_date).format('YYYY-MM-DDTHH:mm:ss') 
      : null;

    const payload = { 
        ...form, 
        arena_id: arenaObj ? arenaObj.id : null,
        game_date: formattedDate // <-- Передаем отформатированную дату
    };

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${game.id}/info`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        if (onSuccess) onSuccess();
        onClose();
      } else {
        alert('Ошибка при сохранении');
      }
    } catch (err) { alert('Ошибка сети'); }
    finally { setIsSaving(false); }
  };

  const isScheduled = game?.status === 'scheduled';

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className={`absolute top-0 right-0 h-full w-[450px] max-w-full bg-[#F8F9FA] transform transition-transform duration-300 ease-out flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        <div className="flex items-center justify-between px-8 py-6 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-[18px] text-graphite uppercase tracking-wide">Настройки матча</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div key={formKey} className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar flex flex-col gap-6">
          <div className={`space-y-6 ${!isScheduled ? 'opacity-50 pointer-events-none' : ''}`}>
            
            <div className="space-y-4">
              <DateTimePicker value={form.game_date} onChange={(val) => setForm({...form, game_date: val})} />
              <Select options={arenas.map(a=>a.name)} value={form.arenaName} onChange={(val) => setForm({...form, arenaName: val})} placeholder="Арена" />
            </div>

            <div className="bg-white border border-graphite/5 shadow-sm p-5 rounded-xl space-y-4">
              <SegmentButton options={['Регулярка', 'Плей-офф']} defaultIndex={form.stage_type === 'regular' ? 0 : 1} onChange={(i) => setForm({...form, stage_type: i === 0 ? 'regular' : 'playoff', stage_label: i === 0 ? '1-й круг' : 'Финал', series_number: 1})} />
              <div className="flex gap-4">
                <div className="flex-1">
                  {form.stage_type === 'regular' ? (
                    <Select label="Круг" options={REGULAR_ROUNDS} value={form.stage_label || '1-й круг'} onChange={val => setForm({...form, stage_label: val})} />
                  ) : (
                    <Select label="Раунд" options={PLAYOFF_ROUNDS} value={form.stage_label || 'Финал'} onChange={val => setForm({...form, stage_label: val})} />
                  )}
                </div>
                <div className="w-[100px]">
                  <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide block">{form.stage_type === 'regular' ? 'Тур' : 'Матч'}</span>
                  <Stepper initialValue={form.series_number} min={1} max={50} onChange={val => setForm({...form, series_number: val})} />
                </div>
              </div>
            </div>

            <div className="flex gap-4 bg-white border border-graphite/5 shadow-sm p-4 rounded-xl">
              <div className="flex-1 flex flex-col">
                <span className="text-[10px] font-bold text-graphite-light mb-3 uppercase tracking-wide block text-center">Форма хозяев</span>
                <div className="w-full [&>div]:w-full">
                  <SegmentButton options={['Темная', 'Светлая']} defaultIndex={form.home_jersey_type === 'dark' ? 0 : 1} onChange={(i) => setForm({...form, home_jersey_type: i === 0 ? 'dark' : 'light'})} />
                </div>
              </div>
              <div className="flex-1 flex flex-col">
                <span className="text-[10px] font-bold text-graphite-light mb-3 uppercase tracking-wide block text-center">Форма гостей</span>
                <div className="w-full [&>div]:w-full">
                  <SegmentButton options={['Темная', 'Светлая']} defaultIndex={form.away_jersey_type === 'dark' ? 0 : 1} onChange={(i) => setForm({...form, away_jersey_type: i === 0 ? 'dark' : 'light'})} />
                </div>
              </div>
            </div>

          </div>

          <div className="space-y-4 pt-2 border-t border-graphite/10">
            <h4 className="text-[12px] font-black uppercase text-graphite-light tracking-widest">Медиа трансляции</h4>
            <Input label="Ссылка на YouTube" placeholder="https://youtu.be/..." value={form.video_yt_url} onChange={e => setForm({...form, video_yt_url: e.target.value})} />
            <Input label="Ссылка на VK Видео" placeholder="https://vk.com/video..." value={form.video_vk_url} onChange={e => setForm({...form, video_vk_url: e.target.value})} />
          </div>
        </div>

        <div className="p-6 bg-white border-t border-graphite/10 shrink-0">
          <Button onClick={handleSave} isLoading={isSaving} className="w-full py-3">
            Сохранить настройки
          </Button>
        </div>

      </div>
    </div>
  );
}