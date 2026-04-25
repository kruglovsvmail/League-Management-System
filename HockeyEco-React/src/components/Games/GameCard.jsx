import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Select } from '../../ui/Select';
import { DateTimePicker } from '../../ui/DateTimePicker';
import { Tooltip } from '../../ui/Tooltip';
import { getImageUrl } from '../../utils/helpers';
import dayjs from 'dayjs';
import { useAccess } from '../../hooks/useAccess';
import { Icon } from '../../ui/Icon';

const REGULAR_ROUNDS = ['1-й круг', '2-й круг', '3-й круг', '4-й круг'];

const colClasses = {
    number: "w-[4%] min-w-[20px]",       
    date: "w-[13%] min-w-[100px]",       
    stage: "w-[15%] min-w-[140px]",      
    home: "flex-1 min-w-[190px]",        
    score: "w-[8%] min-w-[60px]",        
    away: "flex-1 min-w-[190px]",        
    actions: "w-[8%] min-w-[120px]"       
};

export function GameCard({
    game,
    isEditMode,
    editingRowIds,
    setEditingRowIds,
    approvedTeams,
    arenas,
    gamesList,
    brackets = [], 
    onUpdate,
    onDelete,
    setToast,
    canEdit,
    canDelete
}) {
    const navigate = useNavigate();
    const { checkAccess } = useAccess();
    
    const canChangeStatus = checkAccess('MATCH_STATUS_CHANGE');

    const isFinishedOrLive = ['live', 'finished', 'cancelled'].includes(game.status);
    
    // Универсальные проверки на буллиты или овертайм (Б или ОТ)
    const homeExtra = game.status === 'finished' && game.home_score > game.away_score 
        ? (game.end_type === 'so' ? 'Б' : game.end_type === 'ot' ? 'ОТ' : null) 
        : null;
        
    const awayExtra = game.status === 'finished' && game.away_score > game.home_score 
        ? (game.end_type === 'so' ? 'Б' : game.end_type === 'ot' ? 'ОТ' : null) 
        : null;

    const isRowEditing = isEditMode || editingRowIds.includes(game.id) || game.isTemp;

    const arenaOptions = ['Не назначена', ...arenas.map(a => a.name)];

    const handleFieldChange = (fieldOrObj, value) => {
        const updates = typeof fieldOrObj === 'object' ? fieldOrObj : { [fieldOrObj]: value };
        const nextState = { ...game, ...updates };

        if ('game_number' in updates && updates.game_number !== null) {
            const existingGameNumbers = gamesList
                .filter(g => g.id !== game.id)
                .map(g => g.game_number)
                .filter(Boolean);

            if (existingGameNumbers.includes(updates.game_number)) {
                let freeNumber = 1;
                while (existingGameNumbers.includes(freeNumber)) freeNumber++;
                
                updates.game_number = freeNumber;
                nextState.game_number = freeNumber;
                setToast({ 
                    title: 'Корректировка', 
                    message: `Общий номер матча ${value} уже занят. Автоматически изменен на ${freeNumber}.`, 
                    type: 'info' 
                });
            }
        }

        if (nextState.stage_type === 'playoff' && nextState.stage_label && (updates.home_team_id !== undefined || updates.away_team_id !== undefined)) {
            const newHome = nextState.home_team_id;
            const newAway = nextState.away_team_id;

            if (newHome && newAway) {
                const bracket = brackets.find(b => b.rounds?.some(r => r.name === nextState.stage_label));
                const round = bracket?.rounds?.find(r => r.name === nextState.stage_label);
                
                if (round) {
                    const maxGames = (round.wins_needed * 2) - 1;
                    const existingGamesCount = gamesList.filter(g => 
                        g.id !== game.id &&
                        g.stage_type === 'playoff' &&
                        g.stage_label === round.name &&
                        g.status !== 'cancelled' &&
                        ((g.home_team_id === newHome && g.away_team_id === newAway) || 
                         (g.home_team_id === newAway && g.away_team_id === newHome))
                    ).length;

                    if (existingGamesCount >= maxGames) {
                        setToast({ 
                            title: 'Лимит матчей', 
                            message: `Для этой пары раунд "${round.name}" уже заполнен.`, 
                            type: 'error' 
                        });
                        updates.stage_label = null;
                        nextState.stage_label = null;
                    }
                }
            }
        }

        if (nextState.stage_type === 'playoff' && nextState.home_team_id && nextState.away_team_id && nextState.stage_label) {
            const pairGames = gamesList.filter(g => 
                g.id !== game.id &&
                g.stage_type === 'playoff' &&
                g.stage_label === nextState.stage_label &&
                ((g.home_team_id === nextState.home_team_id && g.away_team_id === nextState.away_team_id) || 
                 (g.home_team_id === nextState.away_team_id && g.away_team_id === nextState.home_team_id))
            );

            const existingSeriesNumbers = pairGames.map(g => g.series_number).filter(Boolean);
            const currentSeriesNum = nextState.series_number || 1;

            if (existingSeriesNumbers.includes(currentSeriesNum)) {
                let freeNumber = 1;
                while (existingSeriesNumbers.includes(freeNumber)) freeNumber++;
                
                updates.series_number = freeNumber;
                setToast({ 
                    title: 'Корректировка', 
                    message: `Матч №${currentSeriesNum} для этой пары уже существует. Автоматически изменен на ${freeNumber}.`, 
                    type: 'info' 
                });
            } else if (!nextState.series_number) {
                let freeNumber = 1;
                while (existingSeriesNumbers.includes(freeNumber)) freeNumber++;
                updates.series_number = freeNumber;
            }
        }

        onUpdate(game.id, updates);
    };

    if (isRowEditing) {
        let homeOptions = [];
        let awayOptions = [];

       if (game.has_protocol && !game.isTemp) {
            homeOptions = [game.home_team_name || 'Хозяева', 'Очистите события и составы'];
            awayOptions = [game.away_team_name || 'Гости', 'Очистите события и составы'];
        } else {
            homeOptions = ['Хозяева', ...approvedTeams.filter(t => t.team_id !== game.away_team_id).map(t => t.name)];
            awayOptions = ['Гости', ...approvedTeams.filter(t => t.team_id !== game.home_team_id).map(t => t.name)];
        }

        const currentBracket = game.stage_type === 'playoff'
            ? brackets.find(b => b.rounds?.some(r => r.name === game.stage_label)) || brackets[0]
            : null;

        const stageOptions = [
            'Регулярный чемпионат',
            ...brackets.map(b => `Плей-офф: ${b.name}`)
        ];

        let currentStageValue = 'Не выбрано';
        if (game.stage_type === 'regular') currentStageValue = 'Регулярный чемпионат';
        else if (game.stage_type === 'playoff') currentStageValue = currentBracket ? `Плей-офф: ${currentBracket.name}` : 'Плей-офф';

        let roundOptions = [];
        if (game.stage_type === 'regular') {
            roundOptions = REGULAR_ROUNDS.map(r => ({ label: r, value: r, disabled: false }));
        } else if (game.stage_type === 'playoff' && currentBracket) {
            roundOptions = currentBracket.rounds?.map(r => {
                let isDisabled = false;
                
                if (game.home_team_id && game.away_team_id) {
                    const maxGames = (r.wins_needed * 2) - 1;
                    const existingGamesCount = gamesList.filter(g => 
                        g.id !== game.id &&
                        g.stage_type === 'playoff' &&
                        g.stage_label === r.name &&
                        g.status !== 'cancelled' &&
                        ((g.home_team_id === game.home_team_id && g.away_team_id === game.away_team_id) || 
                         (g.home_team_id === game.away_team_id && g.away_team_id === game.home_team_id))
                    ).length;

                    if (existingGamesCount >= maxGames) {
                        isDisabled = true;
                    }
                }

                return { label: r.name, value: r.name, disabled: isDisabled };
            }) || [];
        }

        return (
            <div className={`flex items-center gap-4 px-6 h-[110px] bg-white/60 backdrop-blur-[12px] border-[1px] border-white/40 rounded-xxl transition-all shadow-sm hover:shadow-md ${isFinishedOrLive ? 'opacity-60 border-graphite/5' : 'border-graphite/10'}`}>
                
                <div className={`${colClasses.number} shrink-0 flex flex-col items-center gap-1`}>
                    <input 
                        type="number" 
                        className="w-full text-center bg-graphite/5 border border-graphite/10 rounded-lg px-1 py-[9px] text-[12px] font-bold text-graphite outline-none focus:border-orange transition-colors"
                        value={game.game_number || ''}
                        onChange={(e) => onUpdate(game.id, { game_number: e.target.value ? parseInt(e.target.value) : null }, true)}
                        onBlur={(e) => handleFieldChange('game_number', e.target.value ? parseInt(e.target.value) : null)}
                        disabled={isFinishedOrLive}
                        placeholder="-"
                        title="Общий номер матча"
                    />
                    <span className="text-[9px] font-mono text-graphite/30">ID:{game.id}</span>
                </div>

                <div className="w-px h-16 bg-graphite/10 shrink-0 rounded-full"></div>

                <div className={`${colClasses.date} shrink-0 flex flex-col gap-2 relative`}>
                    <div className={`w-full ${isFinishedOrLive ? 'pointer-events-none' : ''}`}>
                        <DateTimePicker 
                            value={game.game_date} 
                            onChange={(val) => handleFieldChange('game_date', val)} 
                            placeholder="Дата не назначена"
                        />
                    </div>
                    <div className={`w-full ${isFinishedOrLive ? 'pointer-events-none' : ''}`}>
                        <Select 
                            options={arenaOptions}
                            value={game.location_text || 'Не назначена'}
                            onChange={(val) => {
                                if (val === 'Не назначена') handleFieldChange('arena_id', null);
                                else {
                                    const a = arenas.find(ar => ar.name === val);
                                    handleFieldChange('arena_id', a ? a.id : null);
                                }
                            }}
                            disabled={isFinishedOrLive}
                        />
                    </div>
                </div>

                <div className={`${colClasses.stage} shrink-0 flex flex-col gap-2`}>
                    <div className={`w-full ${isFinishedOrLive ? 'pointer-events-none' : ''}`}>
                        <Select 
                            options={stageOptions}
                            value={currentStageValue}
                            placeholder="Стадия"
                            onChange={(val) => {
                                if (val === 'Регулярный чемпионат') {
                                    handleFieldChange({ stage_type: 'regular', stage_label: '1-й круг' });
                                } else if (val.startsWith('Плей-офф: ')) {
                                    const bracketName = val.replace('Плей-офф: ', '');
                                    const bracket = brackets.find(b => b.name === bracketName);
                                    if (bracket) handleFieldChange({ stage_type: 'playoff', stage_label: bracket.rounds?.[0]?.name || '' });
                                }
                            }}
                            disabled={isFinishedOrLive}
                        />
                    </div>
                    <div className={`flex items-center gap-2 w-full ${isFinishedOrLive ? 'pointer-events-none' : ''}`}>
                        <div className="flex-1 min-w-0">
                            <Select 
                                options={roundOptions.length > 0 ? roundOptions : ['-']}
                                value={game.stage_label || '-'}
                                onChange={(val, opt) => {
                                    if (opt && opt.disabled) {
                                        setToast({ 
                                            title: 'Лимит матчей', 
                                            message: 'Максимальное количество матчей для этой пары в данном раунде уже создано.', 
                                            type: 'error' 
                                        });
                                        handleFieldChange('stage_label', null);
                                    } else {
                                        handleFieldChange('stage_label', val === '-' ? null : val);
                                    }
                                }}
                                disabled={isFinishedOrLive || !game.stage_type || roundOptions.length === 0}
                            />
                        </div>
                        <div className="w-14 shrink-0">
                            <input 
                                type="number" 
                                className="w-full text-center bg-graphite/5 border border-graphite/10 rounded-lg px-1 py-[9px] text-[12px] font-bold text-graphite outline-none focus:border-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                value={game.series_number || ''}
                                placeholder="-"
                                onChange={(e) => onUpdate(game.id, { series_number: e.target.value ? parseInt(e.target.value) : null }, true)}
                                onBlur={(e) => handleFieldChange('series_number', e.target.value ? parseInt(e.target.value) : null)}
                                disabled={isFinishedOrLive || !game.stage_type}
                                title={game.stage_type === 'playoff' ? 'Номер матча в серии' : 'Тур'}
                            />
                        </div>
                    </div>
                </div>

                <div className="w-px h-16 bg-graphite/10 shrink-0 rounded-full"></div>

                <div className={`${colClasses.home} flex justify-end items-center`}>
                    <div className="w-full">
                        <Select 
                            disabled={isFinishedOrLive}
                            options={homeOptions}
                            value={game.home_team_name && game.home_team_name !== 'Не выбрано' ? game.home_team_name : 'Хозяева'}
                            onChange={(val) => {
                                if (val.includes('Очистите')) return;
                                
                                if (val === 'Хозяева' || val === 'Не выбрано') {
                                    handleFieldChange('home_team_id', null);
                                } else {
                                    const t = approvedTeams.find(team => team.name === val);
                                    handleFieldChange('home_team_id', t ? t.team_id : null);
                                }
                            }}
                        />
                    </div>
                </div>

                <div className={`${colClasses.score} shrink-0 flex items-center justify-center font-black text-[16px]`}>
                    {game.status !== 'scheduled' ? (
                        <div className={`relative inline-flex items-center justify-center ${game.status === 'live' ? 'text-blue-500' : 'text-graphite/60'}`}>
                            {game.is_technical ? (
                                <div className="relative inline-flex items-center justify-center text-status-rejected">
                                    <span className="w-5 flex justify-end">
                                        {typeof game.is_technical === 'string' ? game.is_technical.split('/')[0] : '+'}
                                    </span>
                                    <span className="text-graphite/40 mx-1.5 relative -top-[1px]">:</span>
                                    <span className="w-5 flex justify-start">
                                        {typeof game.is_technical === 'string' ? game.is_technical.split('/')[1] : '-'}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    {homeExtra && <span className="absolute right-full mr-1 text-[11px] text-orange top-1/2 -translate-y-1/2">{homeExtra}</span>}
                                    <span className="w-5 flex justify-end">{game.home_score || 0}</span>
                                    <span className="text-graphite/40 mx-1.5 relative -top-[1px]">:</span>
                                    <span className="w-5 flex justify-start">{game.away_score || 0}</span>
                                    {awayExtra && <span className="absolute left-full ml-1 text-[11px] text-orange top-1/2 -translate-y-1/2">{awayExtra}</span>}
                                </>
                            )}
                        </div>
                    ) : (
                        <span className="text-graphite/30">VS</span>
                    )}
                </div>

                <div className={`${colClasses.away} flex justify-start items-center`}>
                    <div className="w-full">
                        <Select 
                            disabled={isFinishedOrLive}
                            options={awayOptions}
                            value={game.away_team_name && game.away_team_name !== 'Не выбрано' ? game.away_team_name : 'Гости'}
                            onChange={(val) => {
                                if (val.includes('Очистите')) return;

                                if (val === 'Гости' || val === 'Не выбрано') {
                                    handleFieldChange('away_team_id', null);
                                } else {
                                    const t = approvedTeams.find(team => team.name === val);
                                    handleFieldChange('away_team_id', t ? t.team_id : null);
                                }
                            }}
                        />
                    </div>
                </div>

                <div className="w-px h-16 bg-graphite/10 shrink-0 rounded-full"></div>

                <div className={`${colClasses.actions} shrink-0 flex justify-center items-center gap-1`}>
                    {game.isTemp ? (
                        <Tooltip title="Удалить пустой слот" noUnderline={true}>
                            <button onClick={() => onDelete(game.id)} className="text-graphite/30 hover:text-status-rejected transition-colors p-2">
                                <Icon name="close" className="w-5 h-5" />
                            </button>
                        </Tooltip>
                    ) : (
                        <>
                            {editingRowIds.includes(game.id) && !isEditMode && (
                                <Tooltip title="Готово" noUnderline={true}>
                                    <button onClick={() => setEditingRowIds(prev => prev.filter(id => id !== game.id))} className="text-graphite/40 hover:text-green-500 bg-graphite/5 hover:bg-green-50 transition-colors p-2 rounded-lg">
                                        <Icon name="save" className="w-5 h-5" />
                                    </button>
                                </Tooltip>
                            )}
                            <Tooltip 
                                title={!canDelete ? 'Нет прав на удаление' : isFinishedOrLive || game.has_protocol ? 'Невозможно удалить' : 'Удалить матч'}
                                subtitle={isFinishedOrLive ? 'Только статус "В расписании"' : game.has_protocol ? 'Очистите протокол' : null}
                                noUnderline={true}
                            >
                                <button 
                                    onClick={() => onDelete(game.id)}
                                    disabled={game.has_protocol || isFinishedOrLive || !canDelete}
                                    className={`p-2 rounded-lg transition-colors ${game.has_protocol || isFinishedOrLive || !canDelete ? 'text-graphite/20 cursor-not-allowed' : 'text-graphite/40 hover:text-status-rejected hover:bg-status-rejected/10'}`}
                                >
                                    <Icon name="delete" className="w-[18px] h-[18px]" />
                                </button>
                            </Tooltip>
                        </>
                    )}
                </div>
            </div>
        );
    }

    const gameDate = dayjs(game.game_date);
    const dateStr = gameDate.isValid() ? `${gameDate.format('D MMMM YYYY')}  |  ${gameDate.format('HH:mm')}` : 'Время не назначено';

    let viewStageDisplay = 'Не указано';
    if (game.stage_type === 'playoff') {
        const bracket = brackets.find(b => b.rounds?.some(r => r.name === game.stage_label));
        viewStageDisplay = bracket ? bracket.name : 'Плей-офф';
    } else if (game.stage_type === 'regular') {
        viewStageDisplay = 'Регулярка';
    }

    const stageBadgeClass = 
        game.stage_type === 'playoff' ? 'bg-orange/10 text-orange' : 
        game.stage_type === 'regular' ? 'bg-blue-500/10 text-blue-600' : 
        'bg-graphite/5 text-graphite/40';

    return (
        <a 
            href={`/games/${game.id}`}
            onClick={(e) => {
                if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                    e.preventDefault();
                    navigate(`/games/${game.id}`);
                }
            }}
            className="flex items-center gap-4 px-6 h-[110px] bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-xxl hover:shadow-lg transition-all duration-200 group relative cursor-pointer animate-zoom-in block"
        >
            <div className={`${colClasses.number} shrink-0 flex flex-col items-center justify-center`}>
                <span className="text-[15px] font-black text-graphite/40">{game.game_number || '-'}</span>
                <span className="text-[9px] font-mono text-graphite/20 mt-0.5">ID:{game.id}</span>
            </div>
            
            <div className="w-px h-16 bg-graphite/10 shrink-0 rounded-full"></div>

            <div className={`${colClasses.date} shrink-0 flex flex-col justify-center gap-1`}>
                <span className="text-[12px] font-bold text-graphite">{dateStr}</span>
                <span className="text-[11px] font-medium text-graphite/50 truncate pr-2" title={game.location_text}>
                    {game.location_text || 'Арена не назначена'}
                </span>
            </div>

            <div className={`${colClasses.stage} shrink-0 flex flex-col justify-center items-start gap-1`}>
                <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider truncate max-w-full ${stageBadgeClass}`} title={viewStageDisplay}>
                    {viewStageDisplay}
                </span>
                
                <span className="text-[12px] font-bold text-graphite pl-0.5">
                    {game.stage_label || '-'}
                </span>
                <span className="text-[11px] font-medium text-graphite/50 pl-0.5">
                    {game.series_number ? (game.stage_type === 'playoff' ? 'Матч ' : 'Тур ') + game.series_number : '-'}
                </span>
            </div>
            
            <div className="w-px h-16 bg-graphite/10 shrink-0 rounded-full"></div>

            <div className={`${colClasses.home} flex items-center justify-end gap-3`}>
                <span className="text-[14px] font-bold text-graphite text-right leading-tight line-clamp-1">
                    {game.home_team_name && game.home_team_name !== 'Не выбрано' ? game.home_team_name : 'Хозяева'}
                </span>
                <div className="w-9 h-9 shrink-0 rounded-md overflow-hidden">
                    <img src={getImageUrl(game.home_team_logo || '/default/Logo_team_default.webp')} className="w-full h-full object-contain" alt="Home" />
                </div>
            </div>
            
            <div className={`${colClasses.score} shrink-0 flex items-center justify-center`}>
                {game.status === 'scheduled' ? (
                    <span className="text-[18px] font-black text-graphite/30 tracking-widest">-:-</span>
                ) : game.is_technical ? (
                    <div className="relative inline-flex items-center justify-center text-[22px] font-black tracking-tighter text-status-rejected">
                        <span className="w-6 flex justify-end">
                            {typeof game.is_technical === 'string' ? game.is_technical.split('/')[0] : '+'}
                        </span>
                        <span className="text-graphite/30 mx-2 relative -top-[2px]">:</span>
                        <span className="w-6 flex justify-start">
                            {typeof game.is_technical === 'string' ? game.is_technical.split('/')[1] : '-'}
                        </span>
                    </div>
                ) : (
                    <div className={`relative inline-flex items-center justify-center text-[22px] font-black tracking-tighter ${game.status === 'live' ? 'text-blue-500' : 'text-graphite'}`}>
                        {homeExtra && <span className="absolute right-full mr-1 text-[12px] text-orange top-1/2 -translate-y-1/2">{homeExtra}</span>}
                        <span className="w-6 flex justify-end">{game.home_score || 0}</span>
                        <span className="text-graphite/30 mx-2 relative -top-[2px]">:</span>
                        <span className="w-6 flex justify-start">{game.away_score || 0}</span>
                        {awayExtra && <span className="absolute left-full ml-1 text-[12px] text-orange top-1/2 -translate-y-1/2">{awayExtra}</span>}
                    </div>
                )}
            </div>

            <div className={`${colClasses.away} flex items-center justify-start gap-3`}>
                <div className="w-9 h-9 shrink-0 rounded-md overflow-hidden">
                    <img src={getImageUrl(game.away_team_logo || '/default/Logo_team_default.webp')} className="w-full h-full object-contain" alt="Away" />
                </div>
                <span className="text-[14px] font-bold text-graphite text-left leading-tight line-clamp-1">
                    {game.away_team_name && game.away_team_name !== 'Не выбрано' ? game.away_team_name : 'Гости'}
                </span>
            </div>

            <div className="w-px h-16 bg-graphite/10 shrink-0 rounded-full"></div>

            <div className={`${colClasses.actions} shrink-0 flex justify-center items-center relative h-full`}>
                <div className={`transition-opacity duration-200 flex flex-col items-center justify-center gap-1 ${canEdit && game.status === 'scheduled' ? 'group-hover:opacity-0' : ''}`}>
                    {game.status === 'live' && <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest px-2 py-1 rounded">Live</span>}
                    
                    {game.status === 'finished' && (
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] font-bold text-graphite/50 uppercase tracking-widest">Завершен</span>
                            {game.needs_recalc && canChangeStatus && (
                                <span className="text-[8px] font-black text-orange uppercase tracking-wider text-center leading-tight">
                                    Требуется<br/>пересчет
                                </span>
                            )}
                        </div>
                    )}
                    
                    {game.status === 'cancelled' && <span className="text-[10px] font-bold text-status-rejected uppercase tracking-widest">Отменен</span>}
                    {game.status === 'scheduled' && <span className="text-[10px] font-bold text-orange uppercase tracking-widest">В расписании</span>}
                </div>

                {canEdit && game.status === 'scheduled' && (
                    <div
                        role="button"
                        onClick={(e) => {
                            e.preventDefault(); 
                            e.stopPropagation(); 
                            setEditingRowIds(prev => [...prev, game.id]);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute inset-0 m-auto w-10 h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-sm rounded-lg text-graphite/50 hover:text-orange hover:shadow-sm cursor-pointer"
                        title="Быстрое редактирование"
                    >
                        <Icon name="edit" className="w-[18px] h-[18px]" />
                    </div>
                )}
            </div>
        </a>
    );
}