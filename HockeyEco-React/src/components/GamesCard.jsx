import React from 'react';
import { getImageUrl } from '../utils/helpers';
import dayjs from 'dayjs';

export function GamesCard({ game, onClick }) {
  const gameDate = dayjs(game.game_date);
  
  // Формат даты: 12.09.2025
  const dateStr = gameDate.isValid() ? gameDate.format('DD.MM.YYYY') : '--.--.----';
  const timeStr = gameDate.isValid() ? gameDate.format('HH:mm') : '--:--';

  const getStageLines = () => {
    if (!game.stage_type) return [];
    
    if (game.stage_type === 'regular') {
      return [
        'Регулярный чемпионат', 
        game.stage_label || '1-й круг', 
        `Тур ${game.series_number || 1}`
      ];
    }
    
    if (game.stage_type === 'playoff') {
      return [
        'Плей-офф', 
        game.stage_label || 'Финал', 
        `Матч ${game.series_number || 1}`
      ];
    }
    
    return [];
  };

  const stageLines = getStageLines();

  // Логика формирования строки со счетом по периодам с тонкими разделителями и пометкой ОТ
  const getPeriodScoresString = () => {
    if (!game.period_scores || game.status === 'scheduled' || game.status === 'cancelled') return null;
    
    const pCount = game.periods_count || 3;
    const scores = game.period_scores;
    const parts = [];

    // Основные периоды
    for (let i = 1; i <= pCount; i++) {
        const h = scores[i]?.home || 0;
        const a = scores[i]?.away || 0;
        parts.push({ text: `${h}:${a}` });
    }

    // Овертайм
    if (scores['OT'] && (scores['OT'].home > 0 || scores['OT'].away > 0)) {
        parts.push({ text: `${scores['OT'].home}:${scores['OT'].away}`, label: 'ОТ' });
    }

    if (parts.length === 0) return null;

    return (
        <div className="flex items-center justify-center gap-2 mt-2">
            {/* Начальный разделитель */}
            <div className="w-[1px] h-2.5 bg-graphite/20 rounded-full"></div>
            
            {parts.map((part, index) => (
                <React.Fragment key={index}>
                    <span className="flex items-center gap-1.5 text-[12px] font-bold text-graphite/80 tracking-widest leading-none">
                        {part.label && <span className="text-[10px] font-black text-graphite/40 tracking-normal uppercase">{part.label}</span>}
                        {part.text}
                    </span>
                    {/* Разделитель после каждого периода */}
                    <div className="w-[1px] h-2.5 bg-graphite/20 rounded-full"></div>
                </React.Fragment>
            ))}
        </div>
    );
  };

  const renderScoreBlock = () => {
    if (game.status === 'cancelled') {
      return <span className="text-[13px] font-bold text-status-rejected/70 uppercase tracking-widest bg-status-rejected/10 px-3 py-1.5 rounded-md">Отменен</span>;
    }
    if (game.status === 'scheduled' || game.status === 'draft') {
      return <span className="text-[32px] font-black text-graphite/30 tracking-widest">- : -</span>;
    }

    const isHomeSO = game.status === 'finished' && game.end_type === 'so' && game.home_score > game.away_score;
    const isAwaySO = game.status === 'finished' && game.end_type === 'so' && game.away_score > game.home_score;

    return (
      <div className="flex flex-col items-center justify-center mt-[-4px]">
        {/* Счет с абсолютным позиционированием буквы "Б" для идеальной центровки */}
        <div className={`relative inline-flex items-center justify-center gap-1.5 text-[32px] font-black tracking-tighter leading-none ${game.status === 'live' ? 'text-blue-500' : 'text-graphite'}`}>
          {isHomeSO && <span className="absolute right-full mt-1 mr-2 text-[16px] font-black text-orange uppercase tracking-normal top-1/2 -translate-y-1/2">Б</span>}
          
          <span className="w-8 text-right">{game.home_score || 0}</span>
          <span className={`pb-1.5 ${game.status === 'live' ? 'text-blue-500/50' : 'text-graphite/40'}`}>:</span>
          <span className="w-8 text-left">{game.away_score || 0}</span>
          
          {isAwaySO && <span className="absolute left-full mt-1 ml-2 text-[16px] font-black text-orange uppercase tracking-normal top-1/2 -translate-y-1/2">Б</span>}
        </div>

        {/* Счет по периодам */}
        {getPeriodScoresString()}
        
        {/* Индикатор LIVE */}
        {game.status === 'live' && (
          <div className="flex items-center gap-2 mt-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
            </span>
            <span className="text-[12px] font-black text-blue-500 tracking-widest leading-none">LIVE</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      onClick={onClick}
      className="bg-white/70 rounded-xl overflow-hidden transition-all duration-300 h-fit select-none border border-graphite/10 shadow-sm hover:border-orange/40 hover:shadow-md cursor-pointer group flex flex-col"
    >
      <div className="flex justify-between items-start px-4 pt-4 pb-2">
        <div className="flex-1 max-w-[40%]">
          <span className="text-[10px] font-bold text-graphite/50 uppercase tracking-wider truncate block text-left" title={game.division_name}>
            {game.division_name || 'Дивизион'}
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
          <span className="text-[12px] font-bold text-graphite/50">
            {dateStr}
          </span>
          <span className="text-[12px] font-bold text-graphite/50 leading-none mt-0.5">
            {timeStr}
          </span>
        </div>
        <div className="flex-1 max-w-[40%]">
          <span className="text-[10px] font-bold text-graphite/50 uppercase tracking-wider truncate block text-right" title={game.location_text}>
            {game.location_text || 'Арена не указана'}
          </span>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2 px-4 pb-4">
        <div className="flex flex-col items-center gap-2 flex-1 w-[30%]">
          <div className="w-16 h-16 shrink-0 rounded-xl">
            <img src={getImageUrl(game.home_team_logo || '/default/Logo_team_default.webp')} className="w-full h-full object-contain" alt="Home" />
          </div>
          <div className="h-[32px] w-full flex items-center justify-center">
            <span className="text-[13px] font-bold text-graphite text-center leading-tight line-clamp-2" title={game.home_team_name}>
              {game.home_team_name || 'Хозяева'}
            </span>
          </div>
        </div>

        <div className="w-[140px] h-[104px] shrink-0 flex items-center justify-center">
          {renderScoreBlock()}
        </div>

        <div className="flex flex-col items-center gap-2 flex-1 w-[30%]">
          <div className="w-16 h-16 shrink-0 rounded-xl">
            <img src={getImageUrl(game.away_team_logo || '/default/Logo_team_default.webp')} className="w-full h-full object-contain" alt="Away" />
          </div>
          <div className="h-[32px] w-full flex items-center justify-center">
            <span className="text-[13px] font-bold text-graphite text-center leading-tight line-clamp-2" title={game.away_team_name}>
              {game.away_team_name || 'Гости'}
            </span>
          </div>
        </div>
      </div>

      {stageLines.length === 3 && (
        <div className="px-4 py-3 bg-graphite/[0.02] border-t border-graphite/5 flex items-center justify-between">
          <div className="flex-1 text-left truncate pr-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-graphite/50" title={stageLines[0]}>
              {stageLines[0]}
            </span>
          </div>
          <div className="flex-1 text-center truncate px-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-graphite/50" title={stageLines[1]}>
              {stageLines[1]}
            </span>
          </div>
          <div className="flex-1 text-right truncate pl-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-graphite/50" title={stageLines[2]}>
              {stageLines[2]}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}