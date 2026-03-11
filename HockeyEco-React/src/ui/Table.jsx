import React, { useState, useMemo } from 'react';

export function Table({ columns, data, rowClassName, onRowClick }) {
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
    <div className="w-full overflow-x-auto bg-white/50 border border-graphite/20 rounded-xxl font-sans shadow-sm">
      <table className="w-full border-collapse table-auto">
        <thead>
          <tr className="bg-black/5">
            {columns.map((col, idx) => {
              let alignClass = 'text-left';
              if (col.align === 'center') alignClass = 'text-center';
              else if (col.align === 'right') alignClass = 'text-right';

              return (
                <th 
                  key={idx} 
                  onClick={() => col.sortKey && requestSort(col.sortKey)}
                  className={`py-3.5 px-4 text-[11px] uppercase text-black/40 font-bold tracking-widest border-b border-graphite/20 select-none ${col.width || ''} ${alignClass} ${col.sortKey ? 'cursor-pointer hover:text-orange hover:bg-graphite/0 transition-colors group' : ''}`}
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
        <tbody className="divide-y divide-graphite/10">
          {sortedData.length > 0 ? (
            sortedData.map((row, rowIndex) => (
              <tr 
                key={row.id || rowIndex} 
                onClick={() => onRowClick && onRowClick(row)}
                className={`
                  transition-all duration-200 group
                  ${onRowClick ? 'cursor-pointer hover:bg-orange/5' : ''}
                  ${rowClassName ? rowClassName(row) : ''}
                `}
              >
                {columns.map((col, colIndex) => {
                  let alignClass = 'text-left';
                  if (col.align === 'center') alignClass = 'text-center';
                  else if (col.align === 'right') alignClass = 'text-right';

                  return (
                    <td 
                      key={colIndex} 
                      className={`py-3 px-4 align-middle text-[14px] text-graphite font-medium ${col.width || ''} ${alignClass}`}
                    >
                      {col.render ? col.render(row, rowIndex) : row[col.key]}
                    </td>
                  );
                })}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-graphite/40 text-[13px] font-medium">
                Нет данных для отображения
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}