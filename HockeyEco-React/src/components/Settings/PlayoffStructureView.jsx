import React, { useState, useMemo } from 'react';
import { Icon } from '../../ui/Icon';

const getMatchBadge = (type) => {
    const badges = {
        'place_1': { text: '1 место', classes: 'bg-[#FEF3C7] text-[#D97706]' },
        'place_3': { text: '3 место', classes: 'bg-[#FFEDD5] text-[#9A3412]' },
        'place_5': { text: '5 место', classes: 'bg-graphite/10 text-graphite' },
        'place_7': { text: '7 место', classes: 'bg-graphite/10 text-graphite' },
        'place_9': { text: '9 место', classes: 'bg-graphite/10 text-graphite' },
        'place_11': { text: '11 место', classes: 'bg-graphite/10 text-graphite' },
        'place_13': { text: '13 место', classes: 'bg-graphite/10 text-graphite' },
        'place_15': { text: '15 место', classes: 'bg-graphite/10 text-graphite' }
    };
    return badges[type] || null;
};

// Функция для правильного склонения
const formatWinsNeeded = (wins, capitalize = false) => {
    let text = '';
    if (wins === 1) text = 'до 1-ой победы';
    else if (wins >= 2 && wins <= 4) text = `до ${wins}-х побед`;
    else text = `до ${wins}-ти побед`;
    
    return capitalize ? text.charAt(0).toUpperCase() + text.slice(1) : text;
};

export function PlayoffStructureView({ brackets = [] }) {
    const [activeBracketId, setActiveBracketId] = useState(brackets[0]?.id || null);

    // Если сеток нет, показываем заглушку
    if (!brackets || brackets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 bg-graphite/5 rounded-2xl border border-dashed border-graphite/20">
                <Icon name="divisions" className="w-12 h-12 text-graphite/20 mb-3" />
                <span className="text-[14px] font-bold text-graphite/40 uppercase tracking-widest">Структура плей-офф не задана</span>
            </div>
        );
    }

    const activeBracket = brackets.find(b => String(b.id) === String(activeBracketId)) || brackets[0];

    // Глобальная функция для поиска информации об источнике
    const getSourceInfo = (sourceId) => {
        if (!sourceId) return null;
        for (const b of brackets) {
            for (const r of b.rounds || []) {
                const match = (r.matchups || []).find(m => String(m.id) === String(sourceId));
                if (match) {
                    return { roundOrder: r.order_index, matchNum: match.matchup_number, bracketId: b.id, bracketName: b.name };
                }
            }
        }
        return null;
    };

    // Рендер одного слота в карточке
    const renderSlot = (type, sourceId) => {
        let label = "Пусто";
        let colorClass = "bg-graphite/5 border-transparent text-graphite/50"; 
        let markerColor = "bg-transparent";

        if (type === 'seed') {
            label = `Посев № ${sourceId || '?'}`;
            colorClass = "bg-white border-graphite/10 text-graphite font-bold";
            markerColor = "bg-graphite/20";
        } else if (type === 'manual') {
            label = "Ручной выбор";
            colorClass = "bg-white border-graphite/10 text-graphite/50 italic";
            markerColor = "bg-graphite/10";
        } else if (type === 'winner_of' || type === 'loser_of') {
            const info = getSourceInfo(sourceId);
            const isWin = type === 'winner_of';
            const prefix = isWin ? 'Поб.' : 'Проигр.';
            
            if (info) {
                const isCrossBracket = String(info.bracketId) !== String(activeBracket.id);
                const suffix = `(Р${info.roundOrder}П${info.matchNum})`;
                label = isCrossBracket ? `[${info.bracketName}] ${prefix} ${suffix}` : `${prefix} ${suffix}`;
            } else {
                label = `${prefix} (?)`;
            }

            colorClass = isWin 
                ? "bg-[#ecfdf5] border-[#10B981]/20 text-[#10B981] font-bold" 
                : "bg-[#fef2f2] border-[#EF4444]/20 text-[#EF4444] font-bold";
            markerColor = isWin ? "bg-[#10B981]" : "bg-[#EF4444]";
        }

        return (
            <div className={`relative flex items-center px-2 py-1.5 border rounded-md text-[11px] truncate ${colorClass}`}>
                <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/4 rounded-r-sm ${markerColor}`} />
                <span className="ml-1.5 truncate">{label}</span>
            </div>
        );
    };

    // Сортируем раунды по порядку
    const sortedRounds = useMemo(() => {
        if (!activeBracket.rounds) return [];
        return [...activeBracket.rounds].sort((a, b) => a.order_index - b.order_index);
    }, [activeBracket]);

    return (
        <div className="flex flex-col gap-4">
            
            {/* Вкладки сеток */}
            {brackets.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    {brackets.map(b => (
                        <button 
                            key={b.id}
                            onClick={() => setActiveBracketId(b.id)}
                            className={`px-4 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${String(activeBracketId) === String(b.id) ? 'bg-graphite text-white shadow-md' : 'bg-white border border-graphite/10 text-graphite/60 hover:bg-graphite/5'}`}
                        >
                            {b.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Контейнер с горизонтальным скроллом для графа */}
            <div className="flex overflow-x-auto gap-6 pb-4 custom-scrollbar">
                {sortedRounds.map(round => {
                    const sortedMatchups = [...(round.matchups || [])].sort((a, b) => a.matchup_number - b.matchup_number);

                    return (
                        <div key={round.id} className="flex flex-col gap-3 min-w-[200px] w-[200px] shrink-0">
                            
                            {/* Заголовок раунда */}
                            <div className="flex flex-col bg-white border border-graphite/10 rounded-xl p-3 shadow-sm">
                                <span className="text-[10px] font-black text-graphite/40 uppercase tracking-widest mb-0.5">Раунд {round.order_index}</span>
                                <span className="text-[13px] font-bold text-graphite leading-tight mb-2 truncate" title={round.name}>{round.name}</span>
                                <div className="flex items-center gap-1.5 bg-graphite/5 self-start px-2 py-0.5 rounded text-[11px] font-semibold text-graphite/70">
                                    <Icon name="trophy" className="w-3 h-3 text-orange" />
                                    {formatWinsNeeded(round.wins_needed, true)}
                                </div>
                            </div>

                            {/* Список серий */}
                            <div className="flex flex-col gap-3 flex-1">
                                {sortedMatchups.map(matchup => {
                                    const matchType = matchup.ui_metadata?.match_type || 'regular';
                                    const badge = getMatchBadge(matchType);
                                    
                                    return (
                                        <div key={matchup.id} className="flex flex-col bg-white border border-graphite/10 rounded-xl p-2 shadow-sm hover:shadow-md transition-shadow relative">
                                            
                                            {/* Шапка серии */}
                                            <div className="flex items-center justify-between mb-2 px-1">
                                                <span className="text-[10px] font-black text-graphite/50 uppercase tracking-wide">
                                                    Пара {matchup.matchup_number}
                                                </span>
                                                
                                                {/* Статусные бейджи */}
                                                {badge && (
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm ${badge.classes}`}>
                                                        {badge.text}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Слоты команд */}
                                            <div className="flex flex-col gap-1.5">
                                                {renderSlot(matchup.team1_source_type, matchup.team1_source_id)}
                                                {renderSlot(matchup.team2_source_type, matchup.team2_source_id)}
                                            </div>
                                        </div>
                                    );
                                })}
                                
                                {sortedMatchups.length === 0 && (
                                    <div className="flex-1 border border-dashed border-graphite/15 rounded-xl flex items-center justify-center p-4">
                                        <span className="text-[11px] font-semibold text-graphite/30 text-center">Нет матчей</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Добавляем стили для тонкого скроллбара, если их еще нет глобально */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.03); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: #94a3b8; }
            `}</style>
        </div>
    );
}