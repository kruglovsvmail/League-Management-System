import React, { useState, useMemo } from 'react';
import { Icon } from '../../ui/Icon';

const getMatchBadge = (type) => {
    const badges = {
        'place_1': { text: 'Финал', classes: 'bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-white shadow-md' },
        'place_3': { text: 'Матч за 3 место', classes: 'bg-[#FFEDD5] text-[#9A3412]' },
        'place_5': { text: 'Матч за 5 место', classes: 'bg-graphite/10 text-graphite' },
        'place_7': { text: 'Матч за 7 место', classes: 'bg-graphite/10 text-graphite' },
        'place_9': { text: 'Матч за 9 место', classes: 'bg-graphite/10 text-graphite' },
        'place_11': { text: 'Матч за 11 место', classes: 'bg-graphite/10 text-graphite' },
        'place_13': { text: 'Матч за 13 место', classes: 'bg-graphite/10 text-graphite' },
        'place_15': { text: 'Матч за 15 место', classes: 'bg-graphite/10 text-graphite' }
    };
    return badges[type] || null;
};

const formatWinsNeeded = (wins, capitalize = false) => {
    let text = '';
    if (wins === 1) text = 'до 1 победы';
    else if (wins >= 2 && wins <= 4) text = `до ${wins} побед`;
    else text = `до ${wins} побед`;
    
    return capitalize ? text.charAt(0).toUpperCase() + text.slice(1) : text;
};

export function PlayoffStructureView({ brackets = [] }) {
    const [activeBracketId, setActiveBracketId] = useState(brackets[0]?.id || null);

    if (!brackets || brackets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 bg-white/40 backdrop-blur-md rounded-2xl border border-dashed border-graphite/20 shadow-sm">
                <Icon name="divisions" className="w-16 h-16 text-graphite/20 mb-4" />
                <span className="text-[15px] font-bold text-graphite/50 uppercase tracking-widest">Структура плей-офф не задана</span>
            </div>
        );
    }

    const activeBracket = brackets.find(b => String(b.id) === String(activeBracketId)) || brackets[0];

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

    const renderSlot = (type, sourceId, isTopSlot) => {
        let label = "Слот свободен";
        let colorClass = "bg-graphite/5 text-graphite/40 border-transparent"; 
        let markerColor = "bg-transparent";

        if (type === 'seed') {
            label = `Посев № ${sourceId || '?'}`;
            colorClass = "bg-white/80 text-graphite font-bold border-graphite/10 shadow-sm";
            markerColor = "bg-graphite/30";
        } else if (type === 'manual') {
            label = "Ручной выбор";
            colorClass = "bg-white/50 text-graphite/60 italic border-graphite/10";
            markerColor = "bg-graphite/20";
        } else if (type === 'winner_of' || type === 'loser_of') {
            const info = getSourceInfo(sourceId);
            const isWin = type === 'winner_of';
            const prefix = isWin ? 'Победитель' : 'Проигравший';
            
            if (info) {
                const isCrossBracket = String(info.bracketId) !== String(activeBracket.id);
                const suffix = `пары ${info.matchNum} (Р${info.roundOrder})`;
                label = isCrossBracket ? `[${info.bracketName}] ${prefix} ${suffix}` : `${prefix} ${suffix}`;
            } else {
                label = `${prefix} (?)`;
            }

            colorClass = isWin 
                ? "bg-[#ecfdf5]/80 border-[#10B981]/20 text-[#059669] font-bold shadow-sm" 
                : "bg-[#fef2f2]/80 border-[#EF4444]/20 text-[#DC2626] font-bold shadow-sm";
            markerColor = isWin ? "bg-[#10B981]" : "bg-[#EF4444]";
        }

        return (
            <div className={`relative flex items-center px-3 py-2 border rounded-lg text-[12px] transition-all ${colorClass}`}>
                <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-3/4 rounded-r-md ${markerColor}`} />
                <span className="ml-2 truncate">{label}</span>
            </div>
        );
    };

    // Подготовка данных: сортировка и разделение на основную сетку и матчи за места
    const roundsData = useMemo(() => {
        if (!activeBracket.rounds) return [];
        const sorted = [...activeBracket.rounds].sort((a, b) => a.order_index - b.order_index);
        
        return sorted.map(round => {
            const matchups = [...(round.matchups || [])].sort((a, b) => a.matchup_number - b.matchup_number);
            
            // Основная сетка: всё, что ведет к финалу (regular, place_1 или без типа)
            const mainMatchups = matchups.filter(m => {
                const type = m.ui_metadata?.match_type;
                return !type || type === 'regular' || type === 'place_1';
            });
            
            // Утешительные матчи: всё остальное (place_3, place_5 и т.д.)
            const consolationMatchups = matchups.filter(m => {
                const type = m.ui_metadata?.match_type;
                return type && type !== 'regular' && type !== 'place_1';
            });

            return { ...round, mainMatchups, consolationMatchups };
        });
    }, [activeBracket]);

    const hasConsolationMatches = roundsData.some(r => r.consolationMatchups.length > 0);

    return (
        <div className="flex flex-col gap-6 w-full">
            
            {/* Вкладки переключения сеток (если их несколько) */}
            {brackets.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {brackets.map(b => (
                        <button 
                            key={b.id}
                            onClick={() => setActiveBracketId(b.id)}
                            className={`px-5 py-2 rounded-md text-[13px] font-bold transition-all duration-300 ${
                                String(activeBracketId) === String(b.id) 
                                ? 'bg-graphite text-white shadow-lg scale-100' 
                                : 'bg-white/60 backdrop-blur-md border border-white/40 text-graphite/60 hover:bg-white hover:shadow-md'
                            }`}
                        >
                            {b.name}
                        </button>
                    ))}
                </div>
            )}

            {/* ОСНОВНАЯ СЕТКА (ДЕРЕВО) */}
            <div className="relative w-full overflow-x-auto custom-scrollbar pb-8 pt-4">
                <div className="flex gap-16 min-h-[450px] w-max px-4">
                    {roundsData.map((round, rIndex) => (
                        <div key={round.id} className="flex flex-col w-[280px] shrink-0 relative">
                            
                            {/* Заголовок раунда */}
                            <div className="flex flex-col items-center bg-white/40 backdrop-blur-xl border border-white/60 rounded-2xl p-4 shadow-[0_8px_30px_rgba(0,0,0,0.04)] mb-8 shrink-0 relative z-10">
                                <span className="text-[10px] font-black text-orange uppercase tracking-widest mb-1">
                                    Раунд {round.order_index}
                                </span>
                                <span className="text-[15px] font-black text-graphite leading-tight mb-3 text-center truncate w-full" title={round.name}>
                                    {round.name}
                                </span>
                                <div className="flex items-center gap-1.5 bg-white/80 px-3 py-1 rounded-lg text-[11px] font-bold text-graphite/80 shadow-sm border border-graphite/5">
                                    <Icon name="trophy" className="w-3.5 h-3.5 text-orange" />
                                    {formatWinsNeeded(round.wins_needed, true)}
                                </div>
                            </div>

                            {/* Контейнер матчей (flex-1 и justify-around создают то самое смещение) */}
                            <div className="flex-1 flex flex-col justify-around gap-8 relative z-10">
                                {round.mainMatchups.map(matchup => {
                                    const matchType = matchup.ui_metadata?.match_type || 'regular';
                                    const badge = getMatchBadge(matchType);
                                    const isFinal = matchType === 'place_1';
                                    
                                    return (
                                        <div key={matchup.id} className="relative flex w-full">
                                            
                                            {/* Визуальные соединительные линии (Ветки дерева) */}
                                            {rIndex > 0 && (
                                                <div className="absolute top-1/2 -left-8 w-8 h-[2px] bg-graphite/15 -z-10" />
                                            )}
                                            {rIndex < roundsData.length - 1 && (
                                                <div className="absolute top-1/2 -right-8 w-8 h-[2px] bg-graphite/15 -z-10" />
                                            )}

                                            {/* Карточка матча (Глассморфизм) */}
                                            <div className={`flex flex-col w-full bg-white/60 backdrop-blur-xl border rounded-2xl p-3 transition-all duration-300 hover:shadow-xl ${isFinal ? 'border-orange/30 shadow-[0_8px_30px_rgba(245,158,11,0.15)]' : 'border-white/80 shadow-[0_8px_30px_rgba(0,0,0,0.06)]'}`}>
                                                
                                                <div className="flex items-center justify-between mb-3 px-1">
                                                    <span className="text-[11px] font-black text-graphite/40 uppercase tracking-widest bg-graphite/5 px-2 py-0.5 rounded-md">
                                                        Пара {matchup.matchup_number}
                                                    </span>
                                                    {badge && (
                                                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${badge.classes}`}>
                                                            {badge.text}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-col gap-2">
                                                    {renderSlot(matchup.team1_source_type, matchup.team1_source_id, true)}
                                                    {renderSlot(matchup.team2_source_type, matchup.team2_source_id, false)}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                
                                {round.mainMatchups.length === 0 && (
                                    <div className="flex-1 border-2 border-dashed border-graphite/10 rounded-2xl flex items-center justify-center p-6 bg-white/20 backdrop-blur-sm">
                                        <span className="text-[13px] font-bold text-graphite/30 uppercase tracking-wider text-center">
                                            Нет матчей<br/>основной сетки
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* МАТЧИ ЗА МЕСТА (Вынесены вниз, чтобы не ломать структуру дерева) */}
            {hasConsolationMatches && (
                <div className="mt-4 pt-8 border-t-2 border-dashed border-graphite/15 flex flex-col gap-6 animate-zoom-in">
                    <div className="flex items-center gap-3 px-2">
                        <Icon name="info" className="w-5 h-5 text-graphite/40" />
                        <h3 className="text-[16px] font-black text-graphite uppercase tracking-wider">
                            Матчи за распределение мест
                        </h3>
                    </div>
                    
                    <div className="flex flex-wrap gap-6">
                        {roundsData.map(round => (
                            round.consolationMatchups.map(matchup => {
                                const badge = getMatchBadge(matchup.ui_metadata?.match_type);
                                
                                return (
                                    <div key={matchup.id} className="flex flex-col w-[280px] bg-graphite/5 border border-graphite/10 rounded-2xl p-3 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex items-center justify-between mb-3 px-1">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-bold text-graphite/50 uppercase tracking-wide">
                                                    {round.name}
                                                </span>
                                                <span className="text-[11px] font-black text-graphite/70 uppercase">
                                                    Пара {matchup.matchup_number}
                                                </span>
                                            </div>
                                            {badge && (
                                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${badge.classes}`}>
                                                    {badge.text}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            {renderSlot(matchup.team1_source_type, matchup.team1_source_id, true)}
                                            {renderSlot(matchup.team2_source_type, matchup.team2_source_id, false)}
                                        </div>
                                    </div>
                                );
                            })
                        ))}
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { height: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.04); border-radius: 12px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(0,0,0,0.15); border-radius: 12px; border: 2px solid transparent; background-clip: padding-box; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(0,0,0,0.25); border: 1px solid transparent; }
            `}</style>
        </div>
    );
}