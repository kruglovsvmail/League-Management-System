import React, { useEffect } from 'react';
import { Breadcrumbs } from '../ui/Breadcrumbs';
import { Icon } from '../ui/Icon';

export function Header({ title = "Раздел", breadcrumbs = [], actions, subtitle }) {
  
  // Синхронизируем заголовок компонента с вкладкой браузера
  useEffect(() => {
    document.title = title ? `${title} | LMS` : 'LMS';
  }, [title]);

  return (
    <header className="h-24 bg-white/70 backdrop-blur-[8px] border-b-[1px] border-white/40 flex items-center justify-between px-10 sticky top-0 z-30 w-full shrink-0">
      <div className="flex items-center gap-4 min-w-0">
        {/* Перезагрузка текущей страницы целиком: разделы LMS живут долго и открытыми
            держатся часами, а данные в них подтягиваются точечно — иногда проще
            перечитать всё, чем искать, что именно устарело. */}
        <button
          type="button"
          onClick={() => window.location.reload()}
          title="Обновить страницу"
          className="shrink-0 w-11 h-11 rounded-lg border border-graphite/10 bg-white/60 text-graphite-light flex items-center justify-center cursor-pointer transition-all duration-300 hover:text-orange hover:border-orange/30 hover:bg-orange/5 active:scale-95"
        >
          <Icon name="refresh" className="w-5 h-5" />
        </button>

        <div className="flex flex-col justify-center min-w-0">
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
      </div>
      
      {/* Правая часть для кнопок, инпутов, фильтров */}
      <div className="flex items-center gap-4">
        {actions}
      </div>
    </header>
  );
}