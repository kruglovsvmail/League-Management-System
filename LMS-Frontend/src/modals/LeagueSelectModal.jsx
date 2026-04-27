import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from '../ui/Button';
import { getImageUrl } from '../utils/helpers';

export function LeagueSelectModal({ isOpen, onClose, leagues, currentLeagueId, onSelect, isSaving = false }) {
  const [selectedId, setSelectedId] = useState(currentLeagueId);
  const [failedImages, setFailedImages] = useState({});

  useEffect(() => {
    if (isOpen) {
      setSelectedId(currentLeagueId);
      setFailedImages({});
    }
  }, [isOpen, currentLeagueId]);

  const handleSave = () => {
    const selected = leagues.find(l => l.id === selectedId);
    if (selected) {
      onSelect(selected);
    }
    onClose();
  };

  const handleImageError = (leagueId) => {
    setFailedImages(prev => ({ ...prev, [leagueId]: true }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Выбор лиги" size="medium">
      
      <div className="flex flex-col gap-3 mb-6 max-h-[50vh] overflow-y-auto pr-2">
        {leagues.map(league => {
          const hasValidLogo = league.logo_url && !failedImages[league.id];

          return (
            <div 
              key={league.id}
              onClick={() => setSelectedId(league.id)}
              className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all border ${
                selectedId === league.id 
                  ? 'border-orange bg-orange/10' 
                  : 'border-graphite/10 hover:border-orange/40 hover:bg-black/5'
              }`}
            >
              <div className={`w-[50px] h-[50px] flex items-center justify-center shrink-0 ${
                hasValidLogo ? '' : 'rounded-lg bg-white border border-graphite/10 overflow-hidden shadow-sm'
              }`}>
                {hasValidLogo ? (
                  <img 
                    src={getImageUrl(league.logo_url)} 
                    alt={league.name} 
                    className="w-full h-full object-contain" 
                    onError={() => handleImageError(league.id)} 
                  />
                ) : (
                  <span className="text-graphite-light font-black text-[14px]">
                    {league.short_name?.substring(0, 2) || 'ЛГ'}
                  </span>
                )}
              </div>

              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-bold text-graphite text-[14px] leading-[1.3]">{league.name}</span>
                {league.city && (
                  <span className="text-[12px] text-graphite-light mt-0.5">{league.city}</span>
                )}
              </div>

              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                selectedId === league.id ? 'border-orange' : 'border-graphite-light'
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full bg-orange transition-transform ${
                  selectedId === league.id ? 'scale-100' : 'scale-0'
                }`} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-5 border-t border-graphite/10">
        <Button onClick={handleSave} isLoading={isSaving} className="w-full md:w-auto">
          Выбрать
        </Button>
      </div>

    </Modal>
  );
}