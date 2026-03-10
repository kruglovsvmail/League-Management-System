import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';


export function QualSelectModal({ isOpen, onClose, qualifications = [], currentQualId, onSelect, isSaving = false, readOnly = false }) {
  const [selectedId, setSelectedId] = useState(currentQualId);

  useEffect(() => {
    if (isOpen) {
      setSelectedId(currentQualId);
    }
  }, [isOpen, currentQualId]);

  const handleSave = () => {
    onSelect(selectedId);
    onClose();
  };

  const visibleQualifications = qualifications.filter(
    qual => qual.status === 'active' || qual.id === currentQualId
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Выбор квалификации" size="medium">
      <div className="flex flex-col gap-3 mb-6 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
        
        <div 
          onClick={() => !readOnly && setSelectedId(null)}
          className={`flex items-center gap-4 p-3 rounded-xl transition-all border ${
            selectedId === null 
              ? 'border-orange bg-orange/10' 
              : 'border-graphite/10' 
          } ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:border-orange/40 hover:bg-black/5'}`}
        >
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-bold text-graphite text-[14px] leading-[1.3]">Без квалификации</span>
          </div>
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
            selectedId === null ? 'border-orange' : 'border-graphite-light'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full bg-orange transition-transform ${selectedId === null ? 'scale-100' : 'scale-0'}`} />
          </div>
        </div>

        {visibleQualifications.map(qual => {
          const isArchived = qual.status !== 'active';

          return (
            <div 
              key={qual.id}
              onClick={() => !readOnly && setSelectedId(qual.id)}
              className={`flex items-center gap-4 p-3 rounded-xl transition-all border ${
                selectedId === qual.id 
                  ? 'border-orange bg-orange/10' 
                  : 'border-graphite/10'
              } ${readOnly ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:border-orange/40 hover:bg-black/5'}`}
            >
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`font-bold text-[14px] leading-[1.3] ${isArchived ? 'text-graphite-light line-through' : 'text-graphite'}`}>
                    {qual.name}
                  </span>
                  <Badge label={qual.short_name} type={isArchived ? 'empty' : 'filled'} />
                  
                  {isArchived && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-status-rejected bg-status-rejected/10 px-2 py-0.5 rounded-md">
                      В архиве
                    </span>
                  )}
                </div>
                {qual.description && (
                  <span className="text-[12px] text-graphite-light mt-0.5">{qual.description}</span>
                )}
              </div>

              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                selectedId === qual.id ? 'border-orange' : 'border-graphite-light'
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full bg-orange transition-transform ${
                  selectedId === qual.id ? 'scale-100' : 'scale-0'
                }`} />
              </div>
            </div>
          );
        })}
      </div>

      {!readOnly && (
        <div className="flex justify-end pt-5 border-t border-graphite/10">
          <Button onClick={handleSave} isLoading={isSaving} className="w-full md:w-auto">
            Выбрать
          </Button>
        </div>
      )}
    </Modal>
  );
}