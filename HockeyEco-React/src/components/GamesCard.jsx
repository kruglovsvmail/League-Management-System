import React from 'react';
import { getImageUrl } from '../utils/helpers';
import dayjs from 'dayjs';

export function GamesCard({ game, onClick }) {
  const gameDate = dayjs(game.game_date);
  
  // Формат даты: 12.09.2025
  const dateStr = gameDate.isValid() ? gameDate.format('DD.MM.YYYY') : '--.--.----';
  const timeStr = gameDate.isValid() ? gameDate.format('HH:mm') : '--:--';

  // Разбираем стадию на массив из 3 параметров без дополнительных приставок, 
  // так как теперь stage_label и так красиво отформатирован из БД ("1-й круг", "Финал" и т.д.)
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

  // Рендер центрального блока (Только счет)
  const renderScoreBlock = () => {
    if (game.status === 'cancelled') {
      return <span className="text-[13px] font-bold text-status-rejected/70 uppercase tracking-widest bg-status-rejected/10 px-3 py-1.5 rounded-md">Отменен</span>;
    }
    if (game.status === 'scheduled' || game.status === 'draft') {
      return <span className="text-[32px] font-black text-graphite/30 tracking-widest">- : -</span>;
    }

    return (
      <div className="flex flex-col items-center justify-center mt-[-8px]">
        {/* Для LIVE счет тоже делаем синим */}
        <div className={`flex items-center gap-2 text-[32px] font-black tracking-tighter leading-none ${game.status === 'live' ? 'text-blue-500' : 'text-graphite'}`}>
          <span>{game.home_score || 0}</span>
          <span className={`pb-1.5 ${game.status === 'live' ? 'text-blue-500/50' : 'text-graphite/40'}`}>:</span>
          <span>{game.away_score || 0}</span>
        </div>
        
        {/* Индикатор LIVE стал синим */}
        {game.status === 'live' && (
          <div className="flex items-center gap-2 mt-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
            </span>
            <span className="text-[12px] font-black text-blue-500 tracking-widest leading-none">LIVE</span>
          </div>
        )}
        {/* Индикатор ОТ/Буллитов */}
        {game.status === 'finished' && game.end_type && game.end_type !== 'regular' && (
          <span className="text-[11px] font-bold text-graphite/50 uppercase mt-1">
            {game.end_type === 'ot' ? 'ОТ' : 'Б'}
          </span>
        )}
      </div>
    );
  };

  return (
    <div 
      onClick={onClick}
      className="bg-white/70 rounded-xl overflow-hidden transition-all duration-300 h-fit select-none border border-graphite/10 shadow-sm hover:border-orange/40 hover:shadow-md cursor-pointer group flex flex-col"
    >
      {/* ВЕРХНЯЯ СТРОКА: Дивизион (Слева), Дата/Время (По центру), Арена (Справа) */}
      <div className="flex justify-between items-start px-4 pt-4 pb-2">
        
        {/* Левая часть: Дивизион */}
        <div className="flex-1 max-w-[40%]">
          <span className="text-[10px] font-bold text-graphite/50 uppercase tracking-wider truncate block text-left" title={game.division_name}>
            {game.division_name || 'Дивизион'}
          </span>
        </div>

        {/* Центральная часть: Дата и Время */}
        <div className="flex-1 flex flex-col items-center justify-center gap-0.5">
          <span className="text-[12px] font-bold text-graphite/50">
            {dateStr}
          </span>
          <span className="text-[12px] font-bold text-graphite/50 leading-none mt-0.5">
            {timeStr}
          </span>
        </div>

        {/* Правая часть: Место проведения (Тот же стиль, что и у дивизиона, выравнивание вправо) */}
        <div className="flex-1 max-w-[40%]">
          <span className="text-[10px] font-bold text-graphite/50 uppercase tracking-wider truncate block text-right" title={game.location_text}>
            {game.location_text || 'Арена не указана'}
          </span>
        </div>

      </div>

      {/* СЕРЕДИНА: Команды и Центральный блок (Счет) */}
      <div className="flex items-start justify-between gap-2 px-4 pb-4">
        
        {/* Хозяева */}
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

        {/* Блок счета (отцентрирован по высоте 104px = лого 64px + отступ 8px + текст 32px) */}
        <div className="w-[140px] h-[104px] shrink-0 flex items-center justify-center">
          {renderScoreBlock()}
        </div>

        {/* Гости */}
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

      {/* ПОДВАЛ: Стадия турнира (3 блока) */}
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