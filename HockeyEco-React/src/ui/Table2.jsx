import React from 'react';

export function Table({ columns, data, rowClassName }) {
  return (
    <div className="w-full overflow-x-auto font-sans">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} className={`py-4 px-4 text-left text-[12px] uppercase text-black/40 font-semibold tracking-wide border-b border-graphite/20 ${col.width || ''}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr 
              key={row.id || rowIndex} 
              className={`transition-all duration-200 hover:bg-white/30 group ${rowClassName ? rowClassName(row) : ''}`}
            >
              {columns.map((col, colIndex) => (
                <td key={colIndex} className={`py-2 px-4 text-left align-middle text-[14px] text-graphite border-b border-graphite/20 group-last:border-b-0 ${col.width || ''}`}>
                  {col.render ? col.render(row, rowIndex) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}