import React from 'react';

// Номера страниц с многоточиями: первая, последняя, текущая и по соседу вокруг неё.
// Так полоса не растёт бесконечно на больших списках.
const buildPages = (current, total) => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);

  if (from > 2) pages.push('…');
  for (let i = from; i <= to; i++) pages.push(i);
  if (to < total - 1) pages.push('…');

  pages.push(total);
  return pages;
};

export function Pagination({ page, total, limit, onChange, className = '' }) {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  if (totalPages <= 1) return null;

  const go = (p) => {
    const next = Math.min(Math.max(p, 1), totalPages);
    if (next !== page) onChange(next);
  };

  const navClass = (disabled) => `px-3 py-1.5 rounded-md text-[13px] font-bold border transition-colors ${
    disabled
      ? 'border-graphite/10 text-graphite/30 cursor-not-allowed'
      : 'border-graphite/20 text-graphite hover:border-orange hover:text-orange cursor-pointer'
  }`;

  return (
    <div className={`flex items-center justify-center gap-1.5 flex-wrap ${className}`}>
      <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className={navClass(page <= 1)}>
        Назад
      </button>

      {buildPages(page, totalPages).map((p, idx) => (
        p === '…' ? (
          <span key={`gap-${idx}`} className="px-1.5 text-[13px] font-bold text-graphite/30 select-none">…</span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => go(p)}
            className={`min-w-[34px] px-2 py-1.5 rounded-md text-[13px] font-bold border transition-colors ${
              p === page
                ? 'bg-orange border-orange text-white'
                : 'border-graphite/20 text-graphite hover:border-orange hover:text-orange'
            }`}
          >
            {p}
          </button>
        )
      ))}

      <button type="button" onClick={() => go(page + 1)} disabled={page >= totalPages} className={navClass(page >= totalPages)}>
        Вперёд
      </button>
    </div>
  );
}
