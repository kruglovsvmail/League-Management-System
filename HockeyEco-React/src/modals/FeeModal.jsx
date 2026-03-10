import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Switch } from '../ui/Switch';
import { Button } from '../ui/Button';

export function FeeModal({ isOpen, onClose, onSave, isSaving = false, initialPaid = false, playerName = 'Игрок', readOnly = false }) {
  const [isPaid, setIsPaid] = useState(initialPaid);

  useEffect(() => {
    if (isOpen) setIsPaid(initialPaid);
  }, [isOpen, initialPaid]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Оплата взноса" size="normal">
      <div className="flex items-center justify-between bg-white/60 p-5 rounded-xl border border-graphite/10 mb-6">
        <div className="flex flex-col gap-1">
          <span className="font-bold text-[14px] text-graphite">Взнос участника оплачен</span>
          <span className="text-[12px] text-graphite-light">{playerName} внес оплату</span>
        </div>
        <Switch checked={isPaid} onChange={(e) => !readOnly && setIsPaid(e.target.checked)} disabled={readOnly} />
      </div>
      {!readOnly && (
        <div className="flex justify-end pt-5 border-t border-graphite/10">
          <Button onClick={() => onSave(isPaid)} isLoading={isSaving} disabled={isSaving} className={`bg-orange text-white border-none transition-all duration-300 ${isSaving ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-orange-hover'}`}>
            Сохранить
          </Button>
        </div>
      )}
    </Modal>
  );
}