import React, { useState, useMemo } from 'react';

// fixedLayout — table-fixed вместо авто-раскладки: ширины колонок из col.width становятся
// обязательными, а колонка без width забирает весь остаток. Нужен там, где иначе таблица
// раздувается под содержимое и вылезает горизонтальный скролл (статистика матча).
// По умолчанию выключен, поведение остальных таблиц не меняется.
export function Table({ columns, data, rowClassName, hideHeader = false, fixedLayout = false }) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;
    
    return [...data].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      
      const aIsEmpty = aVal === null || aVal === undefined || aVal === '';
      const bIsEmpty = bVal === null || bVal === undefined || bVal === '';
      
      if (aIsEmpty && bIsEmpty) return 0;
      if (aIsEmpty) return 1; 
      if (bIsEmpty) return -1;
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortConfig.direction === 'asc' 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      return sortConfig.direction === 'asc' 
        ? (aVal < bVal ? -1 : 1) 
        : (aVal > bVal ? -1 : 1);
    });
  }, [data, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return (
    // Авто-раскладке скролл-контейнер нужен: она раздувается под содержимое.
    // table-fixed по определению вписывается в родителя, и overflow-x-auto там только вредит —
    // из-за округления дробной ширины браузер рисует полосу прокрутки на пустом месте.
    <div className={`w-full font-sans ${fixedLayout ? 'overflow-x-hidden' : 'overflow-x-auto'}`}>
      <table className={`w-full border-collapse ${fixedLayout ? 'table-fixed' : ''}`}>
        {!hideHeader && (
          <thead>
            <tr>
              {columns.map((col, idx) => {
                // headerAlign позволяет выровнять заголовок иначе, чем содержимое колонки:
                // например, ФИО в ячейках прижато влево, а шапка стоит по центру.
                // Без него берётся общий align колонки — прежнее поведение.
                const headerAlign = col.headerAlign || col.align;
                let alignClass = 'text-left';
                if (headerAlign === 'center') alignClass = 'text-center';
                else if (headerAlign === 'right') alignClass = 'text-right';

                return (
                  <th
                    key={idx} 
                    onClick={() => col.sortKey && requestSort(col.sortKey)}
                    className={`py-4 px-4 text-[12px] uppercase text-black/40 font-semibold tracking-wide border-b border-graphite/20 select-none ${col.width || ''} ${alignClass} ${col.sortKey ? 'cursor-pointer hover:text-orange hover:bg-graphite/0 transition-colors group' : ''}`}
                  >
                    <div className="relative inline-flex items-center justify-center">
                      <span>{col.label}</span>
                      {col.sortKey && (
                        <div className="absolute left-full pl-1.5 top-1/2 -translate-y-1/2 flex items-center">
                          <svg 
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${sortConfig.key === col.sortKey ? 'text-orange opacity-100' : 'opacity-0 group-hover:opacity-40'} ${sortConfig.key === col.sortKey && sortConfig.direction === 'desc' ? 'rotate-180' : ''}`} 
                            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
        )}
        <tbody>
          {sortedData.map((row, rowIndex) => (
            <tr 
              key={row.id || rowIndex} 
              className={`transition-all duration-200 hover:bg-white/70 group ${rowClassName ? rowClassName(row) : ''}`}
            >
              {columns.map((col, colIndex) => {
                let alignClass = 'text-left';
                if (col.align === 'center') alignClass = 'text-center';
                else if (col.align === 'right') alignClass = 'text-right';

                return (
                  <td key={colIndex} className={`py-2 px-4 align-middle text-[14px] text-graphite border-b border-graphite/20 group-last:border-b-0 ${col.width || ''} ${alignClass}`}>
                    {col.render ? col.render(row, rowIndex) : row[col.key]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}