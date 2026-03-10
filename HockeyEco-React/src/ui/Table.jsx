import React from 'react';

export function Table({ columns, data, rowClassName, onRowClick }) {
  return (
    <div className="w-full overflow-x-auto bg-white/50 border border-graphite/20 rounded-xxl font-sans shadow-sm">
      <table className="w-full border-collapse table-auto">
        <thead>
          <tr className="bg-black/5">
            {columns.map((col, idx) => (
              <th 
                key={idx} 
                className={`py-3.5 px-4 text-left text-[11px] uppercase text-black/40 font-bold tracking-widest border-b border-graphite/20 ${col.width || ''}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-graphite/10">
          {data.length > 0 ? (
            data.map((row, rowIndex) => (
              <tr 
                key={row.id || rowIndex} 
                onClick={() => onRowClick && onRowClick(row)}
                className={`
                  transition-all duration-200 group
                  ${onRowClick ? 'cursor-pointer hover:bg-orange/5' : ''}
                  ${rowClassName ? rowClassName(row) : ''}
                `}
              >
                {columns.map((col, colIndex) => (
                  <td 
                    key={colIndex} 
                    className={`py-3 px-4 text-left align-middle text-[14px] text-graphite font-medium ${col.width || ''}`}
                  >
                    {col.render ? col.render(row, rowIndex) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td 
                colSpan={columns.length} 
                className="py-12 text-center text-graphite/40 text-[13px] font-medium"
              >
                Нет данных для отображения
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}