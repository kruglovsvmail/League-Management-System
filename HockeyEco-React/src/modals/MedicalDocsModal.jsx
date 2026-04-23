import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Uploader } from '../ui/Uploader';
import { Calendar } from '../ui/Calendar';
import { Button } from '../ui/Button';

// Импортируем нашу заглушку
import { AccessFallback } from '../ui/AccessFallback';

export function MedicalDocsModal({ 
  isOpen, 
  onClose, 
  onSave, 
  isSaving = false, 
  initialMed, 
  initialIns, 
  initialConsent,
  initialMedExp, 
  initialInsExp, 
  initialConsentExp,
  readOnly = false,
  playerName,
  reqMed = true,
  reqIns = true,
  reqConsent = true
}) {
  const [medFile, setMedFile] = useState(null);
  const [insFile, setInsFile] = useState(null);
  const [consentFile, setConsentFile] = useState(null);
  const [medCleared, setMedCleared] = useState(false);
  const [insCleared, setInsCleared] = useState(false);
  const [consentCleared, setConsentCleared] = useState(false);
  
  const [medExp, setMedExp] = useState(null);
  const [insExp, setInsExp] = useState(null);
  const [consentExp, setConsentExp] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setMedFile(null); setInsFile(null); setConsentFile(null);
      setMedCleared(false); setInsCleared(false); setConsentCleared(false);
      
      const safeDate = (dateStr) => {
        if (!dateStr) return null;
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? null : d;
      };
  
      setMedExp(safeDate(initialMedExp));
      setInsExp(safeDate(initialInsExp));
      setConsentExp(safeDate(initialConsentExp));
    }
  }, [isOpen, initialMedExp, initialInsExp, initialConsentExp]);

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
      medFile: reqMed ? medFile : null, 
      medCleared: reqMed ? medCleared : false, 
      medExp: reqMed ? formatForDB(medExp) : null, 
      
      insFile: reqIns ? insFile : null, 
      insCleared: reqIns ? insCleared : false, 
      insExp: reqIns ? formatForDB(insExp) : null,
      
      consentFile: reqConsent ? consentFile : null, 
      consentCleared: reqConsent ? consentCleared : false, 
      consentExp: reqConsent ? formatForDB(consentExp) : null
    });
  };

  const activeBlocks = [reqMed, reqIns, reqConsent].filter(Boolean).length;
  let gridCols = 'md:grid-cols-3';
  if (activeBlocks === 2) gridCols = 'md:grid-cols-2 max-w-[800px] mx-auto';
  if (activeBlocks === 1) gridCols = 'md:grid-cols-1 max-w-[400px] mx-auto';

  const modalContent = (
    <div className={`fixed inset-0 z-[35] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className={`absolute top-0 right-0 h-full w-full max-w-[1100px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
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

        {/* Информационный блок о режиме просмотра */}
        {readOnly && (
          <div className="px-8 pt-6 pb-0">
            <AccessFallback variant="readonly" message="Режим просмотра. Скачивание и загрузка документов недоступны." />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-5 flex flex-col">
          {activeBlocks === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-graphite-light gap-4 py-12">
               <svg className="w-12 h-12 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                 <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
               </svg>
               <span className="text-[14px] font-bold">В этом дивизионе не требуются документы для заявки</span>
             </div>
          ) : (
            <div className={`grid grid-cols-1 ${gridCols} gap-6 h-fit w-full`}>
              
              {/* Med Block */}
              {reqMed && (
                <div className="flex flex-col gap-[15px] bg-white p-6 rounded-2xl border border-graphite/10 shadow-sm">
                  <span className="text-[12px] font-bold text-graphite-light uppercase tracking-wide mb-1">Медицинская справка</span>
                  <Uploader 
                    heightClass="h-[100px]" 
                    accept=".jpg,.png,.pdf,.doc,.docx" 
                    initialUrl={initialMed} 
                    onFileSelect={(file, cleared) => { setMedFile(file); setMedCleared(cleared); }}
                    disabled={readOnly}
                  />
                  <Calendar 
                    value={medExp} 
                    onChange={setMedExp} 
                    disabled={readOnly} 
                  />
                </div>
              )}

              {/* Ins Block */}
              {reqIns && (
                <div className="flex flex-col gap-[15px] bg-white p-6 rounded-2xl border border-graphite/10 shadow-sm">
                  <span className="text-[12px] font-bold text-graphite-light uppercase tracking-wide mb-1">Страховой полис</span>
                  <Uploader 
                    heightClass="h-[100px]" 
                    accept=".jpg,.png,.pdf,.doc,.docx" 
                    initialUrl={initialIns} 
                    onFileSelect={(file, cleared) => { setInsFile(file); setInsCleared(cleared); }}
                    disabled={readOnly}
                  />
                  <Calendar 
                    value={insExp} 
                    onChange={setInsExp} 
                    disabled={readOnly} 
                  />
                </div>
              )}

              {/* Consent Block */}
              {reqConsent && (
                <div className="flex flex-col gap-[15px] bg-white p-6 rounded-2xl border border-graphite/10 shadow-sm">
                  <span className="text-[12px] font-bold text-graphite-light uppercase tracking-wide mb-1">Согласие игрока</span>
                  <Uploader 
                    heightClass="h-[100px]" 
                    accept=".jpg,.png,.pdf,.doc,.docx" 
                    initialUrl={initialConsent} 
                    onFileSelect={(file, cleared) => { setConsentFile(file); setConsentCleared(cleared); }}
                    disabled={readOnly}
                  />
                  <Calendar 
                    value={consentExp} 
                    onChange={setConsentExp} 
                    disabled={readOnly} 
                  />
                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        {!readOnly && (
          <div className="px-8 py-5 border-t border-graphite/10 bg-white shrink-0 flex justify-end">
            <Button 
              onClick={handleSave} 
              isLoading={isSaving} 
              disabled={isSaving || activeBlocks === 0} 
              className={`min-w-[160px] py-3 transition-all duration-300 ${isSaving || activeBlocks === 0 ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
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