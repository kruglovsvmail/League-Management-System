import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';

export function TimerSettingsDrawer({
  isOpen, 
  onClose,
  periodsCount,
  setPeriodsCount,
  periodLength, 
  setPeriodLength,
  otLength, 
  setOtLength,
  soLength,
  setSoLength,
  trackPlusMinus, 
  setTrackPlusMinus,
  saveTimerSettings
}) {
  
  const handleSave = () => {
    saveTimerSettings();
    onClose();
  };

  const drawerContent = (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className={`absolute top-0 right-0 h-full w-[400px] max-w-full bg-[#F8F9FA] transform transition-transform duration-300 ease-out flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        <div className="flex items-center justify-between px-8 py-6 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-[18px] text-graphite uppercase tracking-wide">Настройки матча</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar flex flex-col gap-6">
          
          <div className="bg-white border border-graphite/5 shadow-sm p-5 rounded-xl space-y-5">
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-bold text-graphite">Количество периодов:</span>
              <input 
                type="number" 
                min="1"
                max="10"
                value={periodsCount ?? ''} 
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setPeriodsCount(isNaN(val) || val < 1 ? 1 : val);
                }} 
                className="w-20 bg-[#F8F9FA] border border-graphite/20 rounded-md px-3 py-2 text-center text-graphite font-black outline-none focus:border-orange focus:ring-1 focus:ring-orange/50 transition-all shadow-inner" 
              />
            </div>

            <div className="flex justify-between items-center pt-5 border-t border-graphite/10">
              <span className="text-[13px] font-bold text-graphite">Длительность (мин):</span>
              <input 
                type="number" 
                min="1"
                value={periodLength ?? ''} 
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setPeriodLength(isNaN(val) || val < 1 ? 1 : val);
                }} 
                className="w-20 bg-[#F8F9FA] border border-graphite/20 rounded-md px-3 py-2 text-center text-graphite font-black outline-none focus:border-orange focus:ring-1 focus:ring-orange/50 transition-all shadow-inner" 
              />
            </div>
            
            <div className="flex justify-between items-center pt-5 border-t border-graphite/10">
              <span className="text-[13px] font-bold text-graphite">Овертайм (мин):</span>
              <input 
                type="number" 
                min="0"
                value={otLength ?? ''} 
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setOtLength(isNaN(val) || val < 0 ? 0 : val);
                }} 
                className="w-20 bg-[#F8F9FA] border border-graphite/20 rounded-md px-3 py-2 text-center text-graphite font-black outline-none focus:border-orange focus:ring-1 focus:ring-orange/50 transition-all shadow-inner" 
              />
            </div>

            <div className="flex justify-between items-center pt-5 border-t border-graphite/10">
              <span className="text-[13px] font-bold text-graphite">Бросков в серии буллитов:</span>
              <input 
                type="number" 
                min="1"
                value={soLength ?? ''} 
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setSoLength(isNaN(val) || val < 1 ? 1 : val);
                }} 
                className="w-20 bg-[#F8F9FA] border border-graphite/20 rounded-md px-3 py-2 text-center text-graphite font-black outline-none focus:border-orange focus:ring-1 focus:ring-orange/50 transition-all shadow-inner" 
              />
            </div>
          </div>

          <div className="bg-white border border-graphite/5 shadow-sm p-5 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-[13px] font-bold text-graphite">Учет полезности (+/-)</span>
              <Switch 
                checked={trackPlusMinus} 
                onChange={(e) => setTrackPlusMinus(e.target.checked)} 
              />
            </div>
            <p className="text-[11px] text-graphite-light mt-3 leading-relaxed">
              Активирует функционал, позволяющий секретарю фиксировать игроков, находившихся на льду в момент взятия ворот (для расчета статистики Плюс/Минус).
            </p>
          </div>

        </div>

        <div className="p-6 bg-white border-t border-graphite/10 shrink-0">
          <Button onClick={handleSave} className="w-full py-3 text-[14px]">
            Утвердить настройки
          </Button>
        </div>

      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}