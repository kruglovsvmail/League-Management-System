import React, { useState, useMemo } from 'react';

export function Table({ columns, data, rowClassName }) {
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
    <div className="w-full overflow-x-auto font-sans">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col, idx) => {
              // Динамическое выравнивание ячейки заголовка
              let alignClass = 'text-left';
              if (col.align === 'center') alignClass = 'text-center';
              else if (col.align === 'right') alignClass = 'text-right';

              return (
                <th 
                  key={idx} 
                  onClick={() => col.sortKey && requestSort(col.sortKey)}
                  className={`py-4 px-4 text-[12px] uppercase text-black/40 font-semibold tracking-wide border-b border-graphite/20 select-none ${col.width || ''} ${alignClass} ${col.sortKey ? 'cursor-pointer hover:text-orange hover:bg-graphite/0 transition-colors group' : ''}`}
                >
                  {/* Контейнер по размеру текста, иконка висит абсолютно сбоку */}
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
        <tbody>
          {sortedData.map((row, rowIndex) => (
            <tr 
              key={row.id || rowIndex} 
              className={`transition-all duration-200 hover:bg-white/30 group ${rowClassName ? rowClassName(row) : ''}`}
            >
              {columns.map((col, colIndex) => {
                // Динамическое выравнивание контента
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