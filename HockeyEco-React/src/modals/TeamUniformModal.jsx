import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Uploader } from '../ui/Uploader';
import { Button } from '../ui/Button';
import { getImageUrl, setExpiringStorage, getExpiringStorage, getToken } from '../utils/helpers';

export function TeamUniformModal({ isOpen, onClose, onSave, initialLight, initialDark, isSaving = false, canClearLight = true, canClearDark = true, readOnly = false }) {
  const [lightFile, setLightFile] = useState(null);
  const [darkFile, setDarkFile] = useState(null);
  const [lightCleared, setLightCleared] = useState(false);
  const [darkCleared, setDarkCleared] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLightFile(null); setDarkFile(null);
      setLightCleared(false); setDarkCleared(false);
    }
  }, [isOpen]);

  const handleSave = () => {
    onSave(lightFile, darkFile, lightCleared, darkCleared);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Экипировка команды" size="medium">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[30px] mb-6">
        <Uploader 
          label="Светлая форма<br/>(Домашняя)" heightClass="h-[232px]" accept=".jpg,.png,.webp"
          isDefaultPreview={true} mockText=""
          onFileSelect={(f, cleared) => { setLightFile(f); setLightCleared(cleared); }} 
          initialUrl={initialLight} emptyImage={getImageUrl('/default/jersey_light.webp')}
          canClear={canClearLight}
          disabled={readOnly}
        />
        <Uploader 
          label="Темная форма<br/>(Гостевая)" heightClass="h-[232px]" accept=".jpg,.png,.webp"
          isDefaultPreview={true} mockText=""
          onFileSelect={(f, cleared) => { setDarkFile(f); setDarkCleared(cleared); }} 
          initialUrl={initialDark} emptyImage={getImageUrl('/default/jersey_dark.webp')}
          canClear={canClearDark}
          disabled={readOnly}
        />
      </div>
      {!readOnly && (
        <div className="flex justify-end pt-5 border-t border-graphite/10">
          <Button onClick={handleSave} isLoading={isSaving} disabled={isSaving} className={`bg-orange text-white border-none transition-all duration-300 ${isSaving ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-orange-hover'}`}>
            Сохранить
          </Button>
        </div>
      )}
    </Modal>
  );
}