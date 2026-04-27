import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';

// Импортируем заглушку
import { AccessFallback } from '../ui/AccessFallback';

export function PublishStatusModal({ isOpen, onClose, isPublished, onSave, isSaving = false, readOnly = false }) {
  const [status, setStatus] = useState(isPublished);

  useEffect(() => {
    if (isOpen) setStatus(isPublished);
  }, [isOpen, isPublished]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Статус публикации" size="normal">
      
      {readOnly && (
        <AccessFallback variant="readonly" message="Режим просмотра. Изменение публикации недоступно." />
      )}

      <div className="flex flex-col gap-3 mb-6 font-sans mt-2">
        <div 
          onClick={() => !readOnly && setStatus(true)}
          className={`flex items-center gap-4 p-4 rounded-xl transition-all border ${
            status === true 
              ? 'border-status-accepted bg-status-accepted/10' 
              : 'border-graphite/10 hover:border-status-accepted/40 hover:bg-black/5'
          } ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="flex flex-col flex-1">
            <span className="font-bold text-graphite text-[15px]">Опубликован</span>
            <span className="text-[12px] text-graphite-light mt-0.5">Дивизион виден всем пользователям и участникам</span>
          </div>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${status === true ? 'border-status-accepted' : 'border-graphite-light'}`}>
            <div className={`w-2.5 h-2.5 rounded-full bg-status-accepted transition-transform ${status === true ? 'scale-100' : 'scale-0'}`} />
          </div>
        </div>

        <div 
          onClick={() => !readOnly && setStatus(false)}
          className={`flex items-center gap-4 p-4 rounded-xl transition-all border ${
            status === false 
              ? 'border-orange bg-orange/10' 
              : 'border-graphite/10 hover:border-orange/40 hover:bg-black/5'
          } ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <div className="flex flex-col flex-1">
            <span className="font-bold text-graphite text-[15px]">Скрыт (Черновик)</span>
            <span className="text-[12px] text-graphite-light mt-0.5">Дивизион видят только администраторы лиги</span>
          </div>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${status === false ? 'border-orange' : 'border-graphite-light'}`}>
            <div className={`w-2.5 h-2.5 rounded-full bg-orange transition-transform ${status === false ? 'scale-100' : 'scale-0'}`} />
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex justify-end pt-5 border-t border-graphite/10">
          <Button onClick={() => onSave(status)} isLoading={isSaving} className="w-full sm:w-auto">
            Сохранить
          </Button>
        </div>
      )}
    </Modal>
  );
}