import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { Uploader } from '../ui/Uploader';
import { getImageUrl } from '../utils/helpers';

export function PaperApplicationModal({ isOpen, onClose, app, onSave, isSaving }) {
  const [file, setFile] = useState(null);
  const [isCleared, setIsCleared] = useState(false);

  // Сбрасываем локальное состояние при каждом открытии модалки
  useEffect(() => {
    if (isOpen) {
      setFile(null);
      setIsCleared(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    onSave(file, isCleared);
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Заявочные листы" 
      size="medium"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[30px] mb-6 items-start">
        <div className="flex flex-col w-full">
          <label className="block text-[12px] font-bold text-graphite-light uppercase tracking-wide mb-3">
            Заявка от команды
          </label>
          {app?.paper_roster_team_url ? (
            <div className="h-[232px] w-full border-2 border-dashed border-graphite/20 rounded-2xl flex flex-col items-center justify-center bg-white gap-4 group hover:border-orange transition-colors">
              <div className="w-16 h-16 rounded-full bg-orange/10 flex items-center justify-center text-orange group-hover:scale-110 transition-transform">
                <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </div>
              <a 
                href={getImageUrl(app.paper_roster_team_url)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="font-bold text-[15px] text-graphite hover:text-orange underline underline-offset-4"
              >
                Скачать
              </a>
            </div>
          ) : (
            <div className="h-[232px] w-full border border-graphite/10 rounded-2xl flex items-center justify-center bg-graphite/[0.02] text-graphite-light/50 text-[13px] font-bold">
              Нет заявки
            </div>
          )}
        </div>
        
        <div className="flex flex-col w-full">
          <label className="block text-[12px] font-bold text-graphite-light uppercase tracking-wide mb-3">
            Утвержденная заявка
          </label>
          <Uploader 
            initialUrl={app?.paper_roster_league_url ? getImageUrl(app.paper_roster_league_url) : null}
            onFileSelect={(f, cleared) => {
              setFile(f);
              setIsCleared(cleared);
            }}
            heightClass="h-[232px]"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          />
        </div>
      </div>
      
      <div className="flex justify-end pt-5 border-t border-graphite/10">
        <Button 
          onClick={handleSave} 
          isLoading={isSaving} 
          disabled={(!file && !isCleared) || isSaving}
          className={`bg-orange text-white border-none transition-all duration-300 ${isSaving ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-orange-hover'}`}
        >
          Сохранить
        </Button>
      </div>
    </Modal>
  );
}