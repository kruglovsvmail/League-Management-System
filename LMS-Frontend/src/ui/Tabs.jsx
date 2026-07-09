import React, { useState } from 'react';

export function Tabs({ tabs = [], activeTab, onChange }) {
  const [localTab, setLocalTab] = useState(0);
  const currentTab = activeTab !== undefined ? activeTab : localTab;

  const handleSelect = (idx) => {
    if (activeTab === undefined) setLocalTab(idx);
    if (onChange) onChange(idx);
  };

  return (
    <div className="flex gap-10 w-full overflow-x-auto overflow-y-hidden custom-scrollbar flex-nowrap">
      {tabs.map((tab, idx) => {
        const isActive = currentTab === idx;
        
        // Умный парсинг: отделяем текст от цифр в скобках, например "Игроки (12)"
        let labelName = tab;
        let count = null;
        
        if (typeof tab === 'string') {
          const match = tab.match(/^(.*?)(?:\s*\((\d+)\))?$/);
          if (match && match[2] !== undefined) {
            labelName = match[1];
            count = parseInt(match[2], 10);
          }
        }

        // Логика отображения бейджа-нотификации
        let badgeNode = null;
        if (count !== null && count > 0) {
          const lowerLabel = labelName.toLowerCase();
          let badgeClass = '';

          // Назначаем цвета в зависимости от ключевых слов в названии вкладки
          if (lowerLabel.includes('допущен')) {
            badgeClass = 'bg-status-accepted text-white shadow-[0_2px_6px_rgba(52,199,89,0.3)]'; // Зеленый
          } else if (lowerLabel.includes('проверк')) {
            badgeClass = 'bg-orange text-white shadow-[0_2px_6px_rgba(255,122,0,0.3)]'; // Оранжевый
          } else if (lowerLabel.includes('исправлен')) {
            badgeClass = 'bg-blue-500 text-white shadow-[0_2px_6px_rgba(59,130,246,0.3)]'; // Синий
          } else if (lowerLabel.includes('отклонен')) {
            badgeClass = 'bg-status-rejected text-white shadow-[0_2px_6px_rgba(255,59,48,0.3)]'; // Красный
          } else {
            // Дефолтный стиль для остальных вкладок ("Игроки", "Представители" и т.д.)
            // Всегда серый, даже если вкладка активна
            badgeClass = isActive 
              ? 'bg-graphite/10 text-graphite' 
              : 'bg-graphite/10 text-graphite/50 group-hover:bg-graphite/20 group-hover:text-graphite';
          }

          badgeNode = (
            <span className={`ml-2 inline-flex items-center justify-center p-1.5 w-[22px] h-[18px] rounded-[5px] text-[12px] transition-all duration-300 ${badgeClass}`}>
              {count > 99 ? '99+' : count}
            </span>
          );
        }

        return (
          <button 
            key={idx}
            onClick={() => handleSelect(idx)}
            className={`
              group relative pb-3 px-1 text-[14px] font-bold transition-colors duration-300 outline-none whitespace-nowrap shrink-0 flex items-center
              ${isActive 
                ? 'text-orange' 
                : 'text-graphite/50 hover:text-graphite'
              }
            `}
          >
            {labelName}
            {badgeNode}
            
            {/* Анимированная линия подчеркивания */}
            <div 
              className={`absolute bottom-1 left-0 w-full h-[1px] rounded-t-full transition-all duration-300 origin-center
                ${isActive 
                  ? 'bg-orange scale-x-100 shadow-[0_-2px_8px_rgba(255,122,0,0.3)]' 
                  : 'bg-graphite/20 scale-x-0 group-hover:scale-x-100'
                }
              `} 
            />
          </button>
        );
      })}
    </div>
  );
}