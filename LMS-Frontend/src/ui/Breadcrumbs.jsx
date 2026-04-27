import React from 'react';
import { useNavigate } from 'react-router-dom';

export function Breadcrumbs({ paths = [] }) {
  const navigate = useNavigate();

  return (
    <div className="flex gap-2 text-[12px] text-graphite-light mt-0.5">
      {paths.map((item, idx) => {
        const isLast = idx === paths.length - 1;
        
        // Понимаем и старый формат (строки), и новый (объекты с ссылками)
        const label = typeof item === 'string' ? item : item.label;
        const path = typeof item === 'string' ? null : item.path;

        return (
          <React.Fragment key={idx}>
            <span 
              onClick={() => {
                if (!isLast && path) navigate(path);
              }}
              className={`transition-colors duration-200 ${
                isLast ? 'text-graphite font-bold cursor-default' : 'cursor-pointer hover:text-orange'
              }`}
            >
              {label}
            </span>
            {!isLast && <span>/</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}