import React, { useState } from 'react';

export function Tabs({ tabs = [], activeTab, onChange }) {
  const [localTab, setLocalTab] = useState(0);
  const currentTab = activeTab !== undefined ? activeTab : localTab;

  const handleSelect = (idx) => {
    if (activeTab === undefined) setLocalTab(idx);
    if (onChange) onChange(idx);
  };

  return (
    <div className="w-full flex gap-2.5 flex-wrap">
      {tabs.map((tab, idx) => {
        const isActive = currentTab === idx;
        
        return (
          <button 
            key={idx}
            onClick={() => handleSelect(idx)}
            className={`
              px-3 py-2.5 text-[12px] font-bold rounded-md border transition-all duration-200 outline-none
              ${isActive 
                ? 'border-orange/80 bg-white/80 text-orange' 
                : 'border-graphite/20 bg-white/20 text-graphite/50 hover:border-graphite/30 hover:text-graphite/80'
              }
            `}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}