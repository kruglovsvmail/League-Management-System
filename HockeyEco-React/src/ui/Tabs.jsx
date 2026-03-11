import React, { useState } from 'react';

export function Tabs({ tabs = [], activeTab, onChange }) {
  const [localTab, setLocalTab] = useState(0);
  const currentTab = activeTab !== undefined ? activeTab : localTab;

  const handleSelect = (idx) => {
    if (activeTab === undefined) setLocalTab(idx);
    if (onChange) onChange(idx);
  };

  return (
    <div className="flex gap-8 border-b border-graphite/10 w-full overflow-x-auto overflow-y-hidden custom-scrollbar flex-nowrap">
      {tabs.map((tab, idx) => {
        const isActive = currentTab === idx;
        
        return (
          <button 
            key={idx}
            onClick={() => handleSelect(idx)}
            className={`
              group relative pb-3 px-1 text-[14px] font-bold transition-colors duration-300 outline-none whitespace-nowrap shrink-0
              ${isActive 
                ? 'text-orange' 
                : 'text-graphite/50 hover:text-graphite'
              }
            `}
          >
            {tab}
            
            {/* Анимированная линия подчеркивания */}
            <div 
              className={`absolute bottom-0 left-0 w-full h-[2px] rounded-t-full transition-all duration-300 origin-center
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