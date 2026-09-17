import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Uploader } from '../ui/Uploader';
import { Button } from '../ui/Button';

// Импортируем заглушку
import { AccessFallback } from '../ui/AccessFallback';

export function TeamPhotoModal({ isOpen, onClose, onSave, initialPhoto, isSaving = false, canClearPhoto = true, snapshotMode = false, readOnly = false }) {
  const [photoFile, setPhotoFile] = useState(null);
  const [photoCleared, setPhotoCleared] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPhotoFile(null);
      setPhotoCleared(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    onSave(photoFile, photoCleared);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Общее фото команды" size="normal">
      
      {readOnly && (
        <AccessFallback variant="readonly" message="Режим просмотра. Изменение фото недоступно." />
      )}

      {/* У допущенной заявки фото — часть слепка: «Сбросить» подставляет текущее фото
          из профиля команды (см. updateTournamentTeamCustomData). */}
      {snapshotMode && !readOnly && (
        <div className="mb-4 px-3 py-2 rounded-md bg-status-pending/10 border border-status-pending/30 text-[12px] text-graphite leading-snug">
          Заявка допущена — фото зафиксировано в заявке. «Сбросить» подставит текущее фото из профиля команды.
        </div>
      )}

      <div className="mb-6 mt-2">
        <Uploader
          id="team_photo_upload"
label="Загрузите групповое фото" 
          heightClass="h-[232px]" 
          accept=".jpg,.png,.webp" 
          onFileSelect={(f, cleared) => { setPhotoFile(f); setPhotoCleared(cleared); }} 
          initialUrl={initialPhoto}
          canClear={canClearPhoto}
          disabled={readOnly}
        />
      </div>
      
      {!readOnly && (
        <div className="flex justify-end pt-5 border-t border-graphite/10">
          <Button onClick={handleSave} isLoading={isSaving} disabled={isSaving} className="bg-orange text-white border-none transition-all duration-300 hover:bg-orange-hover">
            Сохранить
          </Button>
        </div>
      )}
    </Modal>
  );
}