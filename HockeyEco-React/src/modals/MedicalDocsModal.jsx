import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Uploader } from '../ui/Uploader';
import { Calendar } from '../ui/Calendar';
import { Button } from '../ui/Button';

export function MedicalDocsModal({ 
  isOpen, 
  onClose, 
  onSave, 
  isSaving = false, 
  initialMed, 
  initialIns, 
  initialMedExp, 
  initialInsExp, 
  readOnly = false,
  playerName
}) {
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

  const modalContent = (
    <div className={`fixed inset-0 z-[35] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      
      {/* Drawer Panel */}
      <div className={`absolute top-0 right-0 h-full w-full max-w-[900px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          {/* Убрали класс uppercase и написали ДОКУМЕНТЫ заглавными */}
          <h2 className="font-black text-xl text-graphite tracking-wide">
            ДОКУМЕНТЫ{playerName ? `: ${playerName}` : ''}
          </h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 flex flex-col">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-fit">
            
            {/* Med Block */}
            <div className="flex flex-col gap-[15px] bg-white p-6 rounded-2xl border border-graphite/10 shadow-sm">
              <span className="text-[12px] font-bold text-graphite-light uppercase tracking-wide mb-1">Медицинская справка</span>
              <Uploader 
                label="Скан справки" 
                heightClass="h-[152px]" 
                accept=".jpg,.png,.pdf,.doc,.docx" 
                initialUrl={initialMed} 
                onFileSelect={(file, cleared) => { setMedFile(file); setMedCleared(cleared); }}
                disabled={readOnly}
              />
              <Calendar 
                label="ДЕЙСТВУЕТ ДО:" 
                value={medExp} 
                onChange={setMedExp} 
                disabled={readOnly} 
              />
            </div>

            {/* Ins Block */}
            <div className="flex flex-col gap-[15px] bg-white p-6 rounded-2xl border border-graphite/10 shadow-sm">
              <span className="text-[12px] font-bold text-graphite-light uppercase tracking-wide mb-1">Страховой полис</span>
              <Uploader 
                label="Скан полиса" 
                heightClass="h-[152px]" 
                accept=".jpg,.png,.pdf,.doc,.docx" 
                initialUrl={initialIns} 
                onFileSelect={(file, cleared) => { setInsFile(file); setInsCleared(cleared); }}
                disabled={readOnly}
              />
              <Calendar 
                label="ДЕЙСТВУЕТ ДО:" 
                value={insExp} 
                onChange={setInsExp} 
                disabled={readOnly} 
              />
            </div>

          </div>
        </div>

        {/* Footer */}
        {!readOnly && (
          <div className="px-8 py-5 border-t border-graphite/10 bg-white shrink-0 flex justify-end">
            <Button 
              onClick={handleSave} 
              isLoading={isSaving} 
              disabled={isSaving} 
              className={`min-w-[160px] py-3 transition-all duration-300 ${isSaving ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
            >
              Сохранить
            </Button>
          </div>
        )}

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}