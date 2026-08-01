import React from 'react';

// Инлайновый парсинг жирного текста **...**
const renderInline = (text) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <b key={i} className="font-bold text-graphite">{part.slice(2, -2)}</b>
      : part
  );

/**
 * Лёгкий рендерер markdown-текста правовых документов (политика, оферта).
 * Поддерживает: # / ## заголовки, - списки, > примечания, --- разделители, **жирный**.
 * Полноценная markdown-библиотека не нужна — формат документов контролируем мы сами.
 */
export function PolicyContent({ text }) {
  const lines = String(text || '').split('\n');
  const blocks = [];
  let listBuffer = [];
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={`ul-${key++}`} className="flex flex-col gap-1.5 pl-1 my-2">
        {listBuffer.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px] text-graphite font-medium leading-relaxed">
            <span className="text-orange shrink-0 mt-1.5 select-none text-[10px]">•</span>
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith('- ')) {
      listBuffer.push(line.slice(2));
      continue;
    }
    flushList();

    if (!line.trim()) continue;

    if (line.startsWith('# ')) {
      blocks.push(
        <h1 key={key++} className="text-[17px] font-extrabold text-graphite tracking-tight mt-2 mb-1">
          {renderInline(line.slice(2))}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      blocks.push(
        <h2 key={key++} className="text-[11px] font-black uppercase tracking-widest text-graphite mt-5 mb-1 border-b border-graphite/10 pb-1.5">
          {renderInline(line.slice(3))}
        </h2>
      );
    } else if (line.startsWith('> ')) {
      blocks.push(
        <p key={key++} className="text-[12px] italic text-graphite-light leading-relaxed my-2 pl-3 border-l-2 border-graphite/10">
          {renderInline(line.slice(2))}
        </p>
      );
    } else if (line.startsWith('---')) {
      blocks.push(<hr key={key++} className="border-graphite/10 my-4" />);
    } else {
      blocks.push(
        <p key={key++} className="text-[13px] text-graphite font-medium leading-relaxed my-1.5">
          {renderInline(line)}
        </p>
      );
    }
  }
  flushList();

  return <div className="flex flex-col text-left">{blocks}</div>;
}
