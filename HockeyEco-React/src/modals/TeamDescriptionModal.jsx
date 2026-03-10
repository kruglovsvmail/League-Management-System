import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';

export function TeamDescriptionModal({ isOpen, onClose, onSave, initialText = '', isSaving = false, readOnly = false }) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (isOpen) setText(initialText || '');
  }, [isOpen, initialText]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Описание команды" size="medium">
      <div className="mb-6 flex flex-col font-sans">
        <label className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">
          Текст описания
        </label>
        <textarea 
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Введите описание команды для данного турнира..."
          disabled={isSaving || readOnly}
          className="w-full h-[150px] px-4 py-3 border border-graphite/20 rounded-md bg-white/60 text-graphite text-[13px] font-medium outline-none transition-all duration-300 focus:border-orange focus:bg-white resize-none disabled:opacity-60 disabled:bg-graphite/5"
        />
      </div>
      {!readOnly && (
        <div className="flex justify-end pt-5 border-t border-graphite/10">
          <Button onClick={() => onSave(text)} isLoading={isSaving} disabled={isSaving} className={`bg-orange text-white border-none transition-all duration-300 ${isSaving ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-orange-hover'}`}>
            Сохранить
          </Button>
        </div>
      )}
    </Modal>
  );
}