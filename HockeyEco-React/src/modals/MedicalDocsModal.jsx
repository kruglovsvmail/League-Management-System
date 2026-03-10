import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Uploader } from '../ui/Uploader';
import { Calendar } from '../ui/Calendar';
import { Button } from '../ui/Button';

export function MedicalDocsModal({ isOpen, onClose, onSave, isSaving = false, initialMed, initialIns, initialMedExp, initialInsExp, readOnly = false }) {
  const [medFile, setMedFile] = useState(null);
  const [insFile, setInsFile] = useState(null);
  const [medCleared, setMedCleared] = useState(false);
  const [insCleared, setInsCleared] = useState(false);
  
  const [medExp, setMedExp] = useState(null);
  const [insExp, setInsExp] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setMedFile(null); setInsFile(null);
      setMedCleared(false); setInsCleared(false);
      
      const safeDate = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
      };
  
      setMedExp(safeDate(initialMedExp));
      setInsExp(safeDate(initialInsExp));
    }
  }, [isOpen, initialMedExp, initialInsExp]);

  const handleSave = () => {
    const formatForDB = (val) => {
      if (!val) return '';
      let dateVal = val;
      if (typeof val === 'object' && 'target' in val) {
        dateVal = val.target.value;
      }

      if (!dateVal) return '';

      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    onSave({ 
      medFile, medCleared, medExp: formatForDB(medExp), 
      insFile, insCleared, insExp: formatForDB(insExp) 
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Медицина и Страховка" size="wide">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-[30px] mb-6">
        
        <div className="flex flex-col gap-[15px]">
          <Uploader 
            label="Медицинская справка" heightClass="h-[152px]" accept=".jpg,.png,.pdf,.doc,.docx" 
            initialUrl={initialMed} onFileSelect={(file, cleared) => { setMedFile(file); setMedCleared(cleared); }}
            disabled={readOnly}
          />
          <Calendar label="ДЕЙСТВУЕТ ДО:" value={medExp} onChange={setMedExp} disabled={readOnly} />
        </div>

        <div className="flex flex-col gap-[15px]">
          <Uploader 
            label="Страховой полис" heightClass="h-[152px]" accept=".jpg,.png,.pdf,.doc,.docx" 
            initialUrl={initialIns} onFileSelect={(file, cleared) => { setInsFile(file); setInsCleared(cleared); }}
            disabled={readOnly}
          />
          <Calendar label="ДЕЙСТВУЕТ ДО:" value={insExp} onChange={setInsExp} disabled={readOnly} />
        </div>

      </div>
      {!readOnly && (
        <div className="flex justify-end pt-5 border-t border-graphite/10">
          <Button onClick={handleSave} isLoading={isSaving} disabled={isSaving} className={`bg-orange text-white border-none transition-all duration-300 ${isSaving ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:bg-orange-hover'}`}>Сохранить</Button>
        </div>
      )}
    </Modal>
  );
}