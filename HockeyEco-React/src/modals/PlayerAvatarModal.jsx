import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Uploader } from '../ui/Uploader';
import { Button } from '../ui/Button';

export function PlayerAvatarModal({ isOpen, onClose, onSave, isSaving = false, initialAvatar }) {
  const [avatarFile, setAvatarFile] = useState(null);
  const [isCleared, setIsCleared] = useState(false);

  // Сбрасываем стейты при каждом открытии окна
  useEffect(() => {
    if (isOpen) {
      setAvatarFile(null);
      setIsCleared(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    // Передаем и сам файл, и флаг того, что пользователь нажал "Сбросить"
    onSave(avatarFile, isCleared);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Аватар игрока" size="normal">
      
      <div className="mb-6">
        <Uploader 
          label="Загрузите фото профиля" 
          heightClass="h-[232px]" 
          accept=".jpg,.png,.jpeg,.webp" 
          initialUrl={initialAvatar}
          onFileSelect={(file, cleared) => {
            setAvatarFile(file);
            setIsCleared(cleared);
          }}
        />
      </div>

      <div className="flex justify-end pt-5 border-t border-graphite/10">
        <Button onClick={handleSave} isLoading={isSaving} disabled={isSaving} className={`bg-orange text-white border-none transition-all duration-300 ${isSaving ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-orange-hover'}`}>
          Сохранить
        </Button>
      </div>

    </Modal>
  );
}