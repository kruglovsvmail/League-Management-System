import React from 'react';
import { Breadcrumbs } from '../ui/Breadcrumbs';

export function Header({ title = "Раздел", breadcrumbs = [], actions, subtitle }) {
  return (
    <header className="h-24 bg-white/50 backdrop-blur-[8px] border-b-[1px] border-white/50 flex items-center justify-between px-10 sticky top-0 z-30 w-full shrink-0">
      <div className="flex flex-col justify-center">
        <h2 className="text-[28px] font-bold text-graphite tracking-tight leading-none">{title}</h2>
        
        {subtitle && (
          <div className="mt-2">
            {subtitle}
          </div>
        )}

        {/* Хлебные крошки для подразделов */}
        {breadcrumbs.length > 0 && (
          <div className="mt-1.5">
            <Breadcrumbs paths={breadcrumbs} />
          </div>
        )}
      </div>
      
      {/* Правая часть для кнопок, инпутов, фильтров */}
      <div className="flex items-center gap-4">
        {actions}
      </div>
    </header>
  );
}