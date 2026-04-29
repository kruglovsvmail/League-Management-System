import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Loader } from '../../ui/Loader';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Stepper } from '../../ui/Stepper';
import { Switch } from '../../ui/Switch';
import { SegmentButton } from '../../ui/SegmentButton';
import { Modal } from '../../modals/Modal';
import { getToken, getImageUrl } from '../../utils/helpers';

const genId = () => `temp_${Math.random().toString(36).substr(2, 9)}`;

const ROUND_WIDTH = 260;  
const MATCHUP_WIDTH = 220;
const MATCHUP_HEIGHT = 140; 
const ROUND_HEADER_HEIGHT = 80;

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

const apiToUi = (brackets) => {
    return brackets.map((b) => ({
        id: String(b.id || b.tempId || genId()),
        name: b.name,
        isMain: b.is_main,
        rounds: (b.rounds || []).sort((r1, r2) => r1.order_index - r2.order_index).map((r, rIdx) => ({
            id: String(r.id || r.tempId || genId()),
            name: r.name,
            order: r.order_index,
            wins: r.wins_needed,
            x: r.ui_metadata?.x !== undefined ? r.ui_metadata.x : rIdx * 350 + 50,
            y: r.ui_metadata?.y !== undefined ? r.ui_metadata.y : 50,
            matchups: (r.matchups || []).sort((m1, m2) => m1.matchup_number - m2.matchup_number).map((m, mIdx) => ({
                id: String(m.id || m.tempId || genId()),
                num: m.matchup_number,
                
                t1_type: m.team1_source_type || 'manual',
                t1_ref: m.team1_source_id != null ? String(m.team1_source_id) : null,
                t1_id: m.team1_id,
                t1_name: m.team1_name,
                t1_logo: m.team1_logo,
                t1_wins: m.team1_wins,

                t2_type: m.team2_source_type || 'manual',
                t2_ref: m.team2_source_id != null ? String(m.team2_source_id) : null,
                t2_id: m.team2_id,
                t2_name: m.team2_name,
                t2_logo: m.team2_logo,
                t2_wins: m.team2_wins,
                
                winner_id: m.winner_id,
                y: m.ui_metadata?.y !== undefined ? m.ui_metadata.y : mIdx * 160 + ROUND_HEADER_HEIGHT,
                match_type: m.ui_metadata?.match_type || 'regular'
            }))
        }))
    }));
};

const uiToApi = (brackets) => {
    return brackets.map(b => ({
        id: String(b.id).startsWith('temp_') ? null : parseInt(b.id, 10),
        tempId: String(b.id).startsWith('temp_') ? b.id : null,
        name: b.name,
        is_main: b.isMain,
        rounds: b.rounds.map(r => ({
            id: String(r.id).startsWith('temp_') ? null : parseInt(r.id, 10),
            tempId: String(r.id).startsWith('temp_') ? r.id : null,
            name: r.name,
            order_index: r.order,
            wins_needed: r.wins,
            ui_metadata: { x: Math.round(r.x), y: Math.round(r.y) },
            matchups: r.matchups.map(m => ({
                id: String(m.id).startsWith('temp_') ? null : parseInt(m.id, 10),
                tempId: String(m.id), 
                matchup_number: m.num,
                ui_metadata: { y: Math.round(m.y), match_type: m.match_type || 'regular' }, 
                
                team1_source_type: m.t1_type,
                team1_source_id: ['seed', 'manual'].includes(m.t1_type) ? (m.t1_ref ? parseInt(m.t1_ref, 10) : null) : null,
                team1_source_ref: ['winner_of', 'loser_of'].includes(m.t1_type) ? String(m.t1_ref) : null,
                
                team2_source_type: m.t2_type,
                team2_source_id: ['seed', 'manual'].includes(m.t2_type) ? (m.t2_ref ? parseInt(m.t2_ref, 10) : null) : null,
                team2_source_ref: ['winner_of', 'loser_of'].includes(m.t2_type) ? String(m.t2_ref) : null,
            }))
        }))
    }));
};

const MatchupSettingsModal = ({ data, activeBracketId, round, matchup, onSave, onClose }) => {
    const findSourceInfo = (refId) => {
        if (!refId) return { bracketId: activeBracketId, roundId: '' };
        for (const b of data.brackets) {
            for (const r of b.rounds) {
                if (r.matchups.some(m => String(m.id) === String(refId))) {
                    return { bracketId: String(b.id), roundId: String(r.id) };
                }
            }
        }
        return { bracketId: activeBracketId, roundId: '' };
    };

    const initS1 = findSourceInfo(matchup.t1_ref);
    const initS2 = findSourceInfo(matchup.t2_ref);

    const [s1Type, setS1Type] = useState(matchup.t1_type);
    const [s1Bracket, setS1Bracket] = useState(initS1.bracketId);
    const [s1Round, setS1Round] = useState(initS1.roundId);
    const [s1Ref, setS1Ref] = useState(matchup.t1_ref ? String(matchup.t1_ref) : (matchup.t1_type === 'seed' ? '1' : ''));

    const [s2Type, setS2Type] = useState(matchup.t2_type);
    const [s2Bracket, setS2Bracket] = useState(initS2.bracketId);
    const [s2Round, setS2Round] = useState(initS2.roundId);
    const [s2Ref, setS2Ref] = useState(matchup.t2_ref ? String(matchup.t2_ref) : (matchup.t2_type === 'seed' ? '1' : ''));

    const [matchType, setMatchType] = useState(matchup.match_type || 'regular');

    const TYPE_OPTIONS = ['Пусто', 'Посев', 'Победит.', 'Проигр.'];
    const TYPE_VALUES = ['manual', 'seed', 'winner_of', 'loser_of'];

    const MATCH_TYPE_LABELS = ['-', '1 место', '3 место', '5 место', '7 место', '9 место', '11 место', '13 место', '15 место'];
    const MATCH_TYPE_VALUES = ['regular', 'place_1', 'place_3', 'place_5', 'place_7', 'place_9', 'place_11', 'place_13', 'place_15'];

    const renderSlotForm = (slotNum, type, setType, brVal, setBrVal, rVal, setRVal, refVal, setRefVal) => {
        const selectedBracket = data.brackets.find(b => String(b.id) === String(brVal)) || data.brackets[0];
        const availableRounds = selectedBracket.id === activeBracketId 
            ? selectedBracket.rounds.filter(r => r.order < round.order) 
            : selectedBracket.rounds;

        const currentRoundMatches = selectedBracket.rounds.find(r => String(r.id) === String(rVal))?.matchups || [];

        const bracketOpts = data.brackets.map(b => b.name);
        const selectedBracketName = data.brackets.find(b => String(b.id) === String(brVal))?.name || '';

        const roundOpts = availableRounds.map(r => `${r.name} (Р${r.order})`);
        const selectedRoundObj = availableRounds.find(r => String(r.id) === String(rVal));
        const selectedRoundName = selectedRoundObj ? `${selectedRoundObj.name} (Р${selectedRoundObj.order})` : '';

        const matchOpts = currentRoundMatches.map(m => `Пара ${m.num}`);
        const selectedMatchObj = currentRoundMatches.find(m => String(m.id) === String(refVal));
        const selectedMatchName = selectedMatchObj ? `Пара ${selectedMatchObj.num}` : '';

        const defaultIdx = TYPE_VALUES.indexOf(type) !== -1 ? TYPE_VALUES.indexOf(type) : 0;

        return (
            <div className="flex flex-col gap-5 p-5 bg-white/50 border border-graphite/10 rounded-2xl h-[320px]">
                <h4 className="text-[13px] font-black text-graphite uppercase tracking-wider">Слот {slotNum}</h4>
                
                <SegmentButton 
                    options={TYPE_OPTIONS} 
                    defaultIndex={defaultIdx} 
                    onChange={(idx) => { 
                        const newType = TYPE_VALUES[idx];
                        setType(newType); 
                        setRefVal(newType === 'seed' ? '1' : ''); 
                        setRVal(''); 
                    }} 
                />
                
                <div className="flex-1 relative">
                    {type === 'seed' && (
                        <div className="flex items-center justify-between p-4 bg-white rounded-md border border-graphite/10 shadow-sm animate-zoom-in absolute w-full">
                            <span className="text-[13px] font-bold text-graphite uppercase tracking-wide">Номер посева</span>
                            <Stepper 
                                initialValue={parseInt(refVal, 10) || 1} 
                                min={1} max={64} 
                                onChange={(v) => setRefVal(String(v))} 
                            />
                        </div>
                    )}
                    
                    {['winner_of', 'loser_of'].includes(type) && (
                        <div className="flex flex-col gap-4 animate-zoom-in absolute w-full">
                            <Select 
                                label="Сетка источника"
                                options={bracketOpts}
                                value={selectedBracketName}
                                onChange={(val) => {
                                    const b = data.brackets.find(x => x.name === val);
                                    if (b) { setBrVal(b.id); setRVal(''); setRefVal(''); }
                                }}
                            />
                            <div className="grid grid-cols-[65fr_35fr] gap-4">
                                <Select 
                                    label="Раунд"
                                    options={roundOpts}
                                    value={selectedRoundName}
                                    placeholder="Выберите..."
                                    onChange={(val) => {
                                        const r = availableRounds.find(x => `${x.name} (Р${x.order})` === val);
                                        if (r) { setRVal(r.id); setRefVal(''); }
                                    }}
                                />
                                <Select 
                                    label="Пара"
                                    options={matchOpts}
                                    value={selectedMatchName}
                                    placeholder="Выберите..."
                                    disabled={!rVal}
                                    onChange={(val) => {
                                        const m = currentRoundMatches.find(x => `Пара ${x.num}` === val);
                                        if (m) setRefVal(m.id);
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {type === 'manual' && (
                        <div className="flex h-full items-center justify-center text-graphite/40 text-[13px] font-medium italic animate-zoom-in text-center px-4 absolute inset-0">
                            Команда будет определена вручную позже, либо останется пустой
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <Modal isOpen={true} onClose={onClose} title={`Настройки пары (Р${round.order}П${matchup.num})`} size="wide">
            <div className="flex flex-col gap-2 font-sans">
                <div className="p-5 bg-white/50 border border-graphite/10 rounded-2xl flex flex-col gap-4">
                    <span className="text-[12px] font-black text-graphite uppercase tracking-widest">В серии идет розыгрыш за:</span>
                    <SegmentButton 
                        options={MATCH_TYPE_LABELS}
                        defaultIndex={MATCH_TYPE_VALUES.indexOf(matchType) !== -1 ? MATCH_TYPE_VALUES.indexOf(matchType) : 0}
                        onChange={(idx) => setMatchType(MATCH_TYPE_VALUES[idx])}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {renderSlotForm(1, s1Type, setS1Type, s1Bracket, setS1Bracket, s1Round, setS1Round, s1Ref, setS1Ref)}
                    {renderSlotForm(2, s2Type, setS2Type, s2Bracket, setS2Bracket, s2Round, setS2Round, s2Ref, setS2Ref)}
                </div>

                <div className="flex justify-end pt-2">
                    <Button onClick={() => onSave(s1Type, s1Ref, s2Type, s2Ref, matchType)} className="w-full md:w-auto px-10">
                        Сохранить изменения
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

const BracketSettingsModal = ({ bracket, onSave, onDelete, onClose, canDelete }) => {
    const [name, setName] = useState(bracket.name);
    const [isMain, setIsMain] = useState(bracket.isMain);

    return (
        <Modal isOpen={true} onClose={onClose} title="Настройки сетки" size="normal">
            <div className="flex flex-col gap-6 font-sans">
                <Input label="Название сетки" value={name} onChange={(e) => setName(e.target.value)} />
                
                <div className="flex items-center justify-between p-1">
                    <span className="text-[12px] font-bold text-graphite uppercase tracking-wide">Сделать основной сеткой</span>
                    <Switch checked={isMain} onChange={(e) => setIsMain(e.target.checked)} />
                </div>
                
                <div className="flex flex-col gap-3 pt-4 border-t border-graphite/10">
                    <Button onClick={() => onSave(name, isMain)} className="w-full py-3">Сохранить настройки</Button>
                    {canDelete && (
                        <Button 
                            onClick={onDelete} 
                            className="w-full py-3 bg-status-rejected/10 text-status-rejected hover:bg-status-rejected hover:text-white hover:shadow-[0_4px_15px_rgba(235,87,87,0.3)]"
                        >
                            Удалить сетку
                        </Button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export function PlayoffConstructor({ divisionId: propDivisionId }) {
    const { divisionId: paramDivisionId } = useParams();
    const divisionId = propDivisionId || paramDivisionId;

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    const [data, setData] = useState({ brackets: [] });
    const [activeBracketId, setActiveBracketId] = useState(null);
    const [games, setGames] = useState([]); // Состояние для хранения матчей для валидации
    
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const [lines, setLines] = useState([]);
    const [wireDragging, setWireDragging] = useState(null); 
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
    const [nodeDragging, setNodeDragging] = useState(null); 
    
    const [editRoundParams, setEditRoundParams] = useState(null);
    const [roundModalError, setRoundModalError] = useState(''); // Состояние для ошибки валидации раунда
    const [editMatchupParams, setEditMatchupParams] = useState(null);
    const [editBracketParams, setEditBracketParams] = useState(null);
    
    const containerRef = useRef(null);

    const complexMeshGradient = {
        backgroundImage: `linear-gradient(180deg, #f0f0f0ff 0%, #f0f0f0ff 20%, #f0f0f0ff 100%)`,
        backgroundAttachment: 'fixed',
    };

    useEffect(() => {
        if (divisionId) fetchBrackets();
    }, [divisionId]);

    useEffect(() => {
        const workspace = containerRef.current;
        if (!workspace) return;

        const handleWheel = (e) => {
            e.preventDefault(); 
            
            const zoomSensitivity = 0.0015;
            const delta = -e.deltaY * zoomSensitivity;
            const newZoom = Math.min(Math.max(0.25, zoom + delta), 2.0); 

            const rect = workspace.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const zoomRatio = newZoom / zoom;
            const newPanX = mouseX - (mouseX - pan.x) * zoomRatio;
            const newPanY = mouseY - (mouseY - pan.y) * zoomRatio;

            setZoom(newZoom);
            setPan({ x: newPanX, y: newPanY });
        };

        workspace.addEventListener('wheel', handleWheel, { passive: false });
        return () => workspace.removeEventListener('wheel', handleWheel);
    }, [zoom, pan]);

    const fetchBrackets = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/playoff`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const apiData = await res.json();
            if (apiData.success) {
                let uiBrackets = apiToUi(apiData.brackets);
                if (uiBrackets.length === 0) {
                    uiBrackets = [{ id: genId(), name: 'Основная сетка', isMain: true, rounds: [] }];
                }
                setData({ brackets: uiBrackets });
                setActiveBracketId(uiBrackets[0].id);
                setGames(apiData.games || []); // Сохраняем матчи для проверок на клиенте
            }
        } catch (err) {
            console.error('Ошибка загрузки сеток', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveBackend = async () => {
        setIsSaving(true);
        try {
            const payload = { brackets: uiToApi(data.brackets) };
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/playoff/save-constructor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(payload)
            });
            const apiRes = await res.json();
            if (apiRes.success) {
                await fetchBrackets();
                if (window.opener) window.opener.postMessage('PLAYOFF_SAVED', '*');
            } else {
                alert(apiRes.error || 'Ошибка сохранения');
            }
        } catch (err) {
            console.error('Ошибка сохранения', err);
        } finally {
            setIsSaving(false);
        }
    };

    const activeBracket = data.brackets.find(b => b.id === activeBracketId) || data.brackets[0];

    const getRoundHeight = (r) => {
        const maxY = r.matchups.length > 0 ? Math.max(...r.matchups.map(m => m.y)) : 0;
        return ROUND_HEADER_HEIGHT + maxY + MATCHUP_HEIGHT;
    };

    const isOverlapping = (rect1, rect2) => {
        return !(rect1.x + rect1.w <= rect2.x || rect1.x >= rect2.x + rect2.w || rect1.y + rect1.h <= rect2.y || rect1.y >= rect2.y + rect2.h);
    };

    const drawSmoothLine = (x1, y1, x2, y2, type) => {
        const startY = type === 'winner_of' ? y1 - 4 : (type === 'loser_of' ? y1 + 4 : y1);
        const cpDist = Math.max(Math.abs(x2 - x1) * 0.5, 40);
        return `M ${x1} ${startY} C ${x1 + cpDist} ${startY}, ${x2 - cpDist} ${y2}, ${x2} ${y2}`;
    };

    const updateLines = () => {
        if (!containerRef.current || !activeBracket) return;
        const container = containerRef.current;
        const containerRect = container.getBoundingClientRect();
        const newLines = [];

        activeBracket.rounds.forEach(round => {
            round.matchups.forEach(matchup => {
                [1, 2].forEach(slotNum => {
                    const type = matchup[`t${slotNum}_type`];
                    const refId = matchup[`t${slotNum}_ref`];
                    if ((type === 'winner_of' || type === 'loser_of') && refId) {
                        const outSelector = `[data-output-${type === 'winner_of' ? 'w' : 'l'}="${refId}"]`;
                        const inSelector = `[data-input-${slotNum}="${matchup.id}"]`;
                        const outEl = document.querySelector(outSelector);
                        const inEl = document.querySelector(inSelector);
                        
                        if (outEl && inEl) {
                            const outRect = outEl.getBoundingClientRect();
                            const inRect = inEl.getBoundingClientRect();
                            
                            const startX = (outRect.right - containerRect.left - pan.x) / zoom - 18;
                            const startY = (outRect.top + (outRect.height / 2) - containerRect.top - pan.y) / zoom;
                            const endX = (inRect.left - containerRect.left - pan.x) / zoom - 10;
                            const endY = (inRect.top + (inRect.height / 2) - containerRect.top - pan.y) / zoom;

                            newLines.push({
                                id: `${matchup.id}-${slotNum}`,
                                matchupId: matchup.id,
                                slotNum: slotNum,
                                x1: startX,
                                y1: startY,
                                x2: endX, 
                                y2: endY,
                                type: type
                            });
                        }
                    }
                });
            });
        });
        setLines(newLines);
    };

    useLayoutEffect(() => {
        if (!isLoading) {
            updateLines();
            const timer = setTimeout(updateLines, 50); 
            window.addEventListener('resize', updateLines);
            return () => {
                clearTimeout(timer);
                window.removeEventListener('resize', updateLines);
            };
        }
    }, [data, activeBracketId, isLoading, zoom, pan]);

    const handleMouseDown = (e) => {
        if (e.button === 1) { 
            e.preventDefault(); 
            setIsDraggingCanvas(true);
            setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    };

    const handleMouseMove = (e) => {
        if (!containerRef.current) return;

        if (isDraggingCanvas) {
            setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
            return;
        }

        if (wireDragging) {
            const containerRect = containerRef.current.getBoundingClientRect();
            setMousePos({
                x: (e.clientX - containerRect.left - pan.x) / zoom,
                y: (e.clientY - containerRect.top - pan.y) / zoom
            });
        }

        if (nodeDragging) {
            if (nodeDragging.type === 'round') {
                const dx = (e.clientX - nodeDragging.startX) / zoom;
                const dy = (e.clientY - nodeDragging.startY) / zoom;
                const proposedX = Math.max(0, nodeDragging.initX + dx);
                const proposedY = Math.max(0, nodeDragging.initY + dy);
                const movingRound = activeBracket.rounds.find(r => r.id === nodeDragging.id);
                const h = getRoundHeight(movingRound);
                let canMoveX = true; let canMoveY = true;

                for (const r of activeBracket.rounds) {
                    if (r.id === nodeDragging.id) continue;
                    const r2Rect = { x: r.x, y: r.y, w: ROUND_WIDTH, h: getRoundHeight(r) };
                    if (isOverlapping({ x: proposedX, y: movingRound.y, w: ROUND_WIDTH, h }, r2Rect)) canMoveX = false;
                    if (isOverlapping({ x: movingRound.x, y: proposedY, w: ROUND_WIDTH, h }, r2Rect)) canMoveY = false;
                }
                const newX = canMoveX ? proposedX : movingRound.x;
                const newY = canMoveY ? proposedY : movingRound.y;
                if (newX !== movingRound.x || newY !== movingRound.y) {
                    updateActiveBracket(b => ({ ...b, rounds: b.rounds.map(r => r.id === nodeDragging.id ? { ...r, x: newX, y: newY } : r) }));
                }
            } 
            else if (nodeDragging.type === 'matchup') {
                const dy = (e.clientY - nodeDragging.startY) / zoom;
                const proposedY = Math.max(0, nodeDragging.initY + dy);
                const currentRound = activeBracket.rounds.find(r => r.id === nodeDragging.roundId);
                const movingMatchup = currentRound.matchups.find(m => m.id === nodeDragging.matchupId);
                let canMoveY = true;
                for (const m of currentRound.matchups) {
                    if (m.id === nodeDragging.matchupId) continue;
                    if (isOverlapping({ x: 0, y: proposedY, w: MATCHUP_WIDTH, h: MATCHUP_HEIGHT }, { x: 0, y: m.y, w: MATCHUP_WIDTH, h: MATCHUP_HEIGHT })) {
                        canMoveY = false; break;
                    }
                }
                if (canMoveY && proposedY !== movingMatchup.y) {
                    updateActiveBracket(b => ({
                        ...b, rounds: b.rounds.map(r => r.id === nodeDragging.roundId ? {
                            ...r, matchups: r.matchups.map(m => m.id === nodeDragging.matchupId ? { ...m, y: proposedY } : m)
                        } : r)
                    }));
                }
            }
        }
    };

    const handleMouseUp = () => {
        setIsDraggingCanvas(false);
        setWireDragging(null);
        setNodeDragging(null);
    };

    const handleWireDragStart = (e, matchupId, type) => {
        e.preventDefault(); e.stopPropagation();
        const elRect = e.target.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const startX = (elRect.right - containerRect.left - pan.x) / zoom - (elRect.width/2);
        const startY = (elRect.top + (elRect.height / 2) - containerRect.top - pan.y) / zoom;
        setWireDragging({ matchupId, type, startX, startY: type === 'W' ? startY - 4 : startY + 4 });
    };

    const handleRoundDragStart = (e, round) => {
        if(e.button !== 0 || e.target.closest('button')) return; 
        e.preventDefault();
        setNodeDragging({ type: 'round', id: round.id, startX: e.clientX, startY: e.clientY, initX: round.x, initY: round.y });
    };

    const handleMatchupDragStart = (e, roundId, matchup) => {
        if(e.button !== 0 || e.target.closest('button') || e.target.closest('[data-output-w]') || e.target.closest('[data-output-l]')) return;
        e.preventDefault(); e.stopPropagation();
        setNodeDragging({ type: 'matchup', roundId, matchupId: matchup.id, startY: e.clientY, initY: matchup.y });
    };

    const removeConnection = (matchupId, slotNum) => {
        updateActiveBracket(b => ({
            ...b, rounds: b.rounds.map(r => ({
                ...r, matchups: r.matchups.map(m => m.id === matchupId ? { ...m, [`t${slotNum}_type`]: 'manual', [`t${slotNum}_ref`]: null } : m)
            }))
        }));
    };

    const updateActiveBracket = (updater) => {
        setData(prev => ({
            ...prev,
            brackets: prev.brackets.map(b => String(b.id) === String(activeBracketId) ? updater(b) : b)
        }));
    };

    const addBracket = () => {
        const newId = genId();
        setData(prev => ({
            ...prev,
            brackets: [...prev.brackets, { id: newId, name: `Сетка ${prev.brackets.length + 1}`, isMain: false, rounds: [] }]
        }));
        setActiveBracketId(newId);
    };

    const addRound = () => {
        const maxX = Math.max(...activeBracket.rounds.map(r => r.x), 0);
        updateActiveBracket(b => ({ ...b, rounds: [...b.rounds, { id: genId(), order: b.rounds.length + 1, name: `Раунд ${b.rounds.length + 1}`, wins: 2, x: maxX + 300, y: 50, matchups: [] }] }));
    };
    
    const removeRound = (roundId) => {
        updateActiveBracket(b => ({ ...b, rounds: b.rounds.filter(r => r.id !== roundId).map((r, i) => ({ ...r, order: i + 1 })) }));
    };
    
    const addMatchup = (roundId) => {
        updateActiveBracket(b => ({ ...b, rounds: b.rounds.map(r => {
            if (r.id !== roundId) return r;
            const maxY = Math.max(...r.matchups.map(m => m.y), -100);
            return { ...r, matchups: [...r.matchups, { id: genId(), num: r.matchups.length + 1, y: maxY + MATCHUP_HEIGHT, t1_type: 'manual', t1_ref: null, t2_type: 'manual', t2_ref: null, match_type: 'regular' }] }
        }) }));
    };
    
    const removeMatchup = (roundId, matchupId) => {
        updateActiveBracket(b => ({ ...b, rounds: b.rounds.map(r => r.id === roundId ? { ...r, matchups: r.matchups.filter(m => m.id !== matchupId).map((m, i) => ({ ...m, num: i + 1 })) } : r) }));
    };
    
    const handleWireDrop = (targetId, slot, order) => {
        if (!wireDragging) return;
        const sourceRound = activeBracket.rounds.find(r => r.matchups.some(m => String(m.id) === String(wireDragging.matchupId)));
        if (sourceRound && sourceRound.order >= order) return alert("Нельзя тянуть связь назад или в тот же раунд");
        updateActiveBracket(b => ({ 
            ...b, 
            rounds: b.rounds.map(r => ({ 
                ...r, 
                matchups: r.matchups.map(m => m.id === targetId ? { 
                    ...m, 
                    [`t${slot}_type`]: wireDragging.type === 'W' ? 'winner_of' : 'loser_of', 
                    [`t${slot}_ref`]: String(wireDragging.matchupId) 
                } : m) 
            })) 
        }));
    };
    
    const getGlobalMatchupInfo = (id) => {
        for (const b of data.brackets) {
            for (const r of b.rounds) {
                const m = r.matchups.find(x => String(x.id) === String(id));
                if (m) return { ...m, roundOrder: r.order, bracketName: b.name, bracketId: String(b.id) };
            }
        }
        return null;
    };

    const renderAddRoundBtn = () => {
        if (!activeBracket) return null;
        const btnX = activeBracket.rounds.length > 0 
            ? Math.max(...activeBracket.rounds.map(r => r.x)) + 300 
            : 50;

        return (
            <button 
                onClick={addRound}
                className="absolute flex items-center justify-center bg-white/5 backdrop-blur-[8px] hover:bg-white border-2 border-dashed border-gray-300 hover:border-orange text-gray-500 hover:text-orange transition-all rounded-md pointer-events-auto z-10 shadow-sm"
                style={{ left: `${btnX}px`, top: '50px', width: '220px', height: '64px' }}
            >
                <span className="font-bold text-sm">+ Добавить раунд</span>
            </button>
        );
    };

    if (isLoading) return <div className="h-screen w-screen flex items-center justify-center bg-[#F3F4F6]"><Loader text="" /></div>;

    return (
        <div 
            className="h-screen w-screen flex flex-col font-sans overflow-hidden relative text-graphite" 
            style={complexMeshGradient}
            onMouseMove={handleMouseMove} 
            onMouseUp={handleMouseUp} 
            onMouseLeave={handleMouseUp}
        >
            <style>{`
                body { margin: 0; overflow: hidden; }
                .canvas-bg {
                    background-image: 
                        linear-gradient(to right, rgba(0,0,0, 0.04) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(0,0,0, 0.04) 1px, transparent 1px);
                }
                .connector-line { transition: stroke-width 0.2s, stroke 0.2s; cursor: pointer; pointer-events: stroke; }
                .connector-line:hover { stroke-width: 6; stroke: #F97316; }
                .line-hitbox { fill: none; stroke: transparent; stroke-width: 15; cursor: pointer; pointer-events: stroke; }
                .connections-layer { pointer-events: none; }
            `}</style>

            <div className="absolute top-5 left-5 pointer-events-auto flex items-center gap-2 bg-white/80 backdrop-blur-xl border border-white/50 shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-2xl px-5 py-3 z-[60]">
                <svg className="w-5 h-5 text-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" /></svg>
                <h2 className="text-[14px] font-black uppercase tracking-wide text-graphite">Конструктор</h2>
            </div>

            <div className="absolute top-5 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center bg-white/30 backdrop-blur-[8px] border border-white/50 rounded-full p-1.5 shadow-[0_4px_25px_rgba(0,0,0,0.06)] z-[60]">
                {data.brackets.map(b => (
                    <div key={b.id} 
                         className={`group relative flex items-center gap-2 px-5 py-2 rounded-full cursor-pointer transition-all duration-300 ${activeBracketId === String(b.id) ? 'bg-white text-graphite shadow-[0_2px_10px_rgba(0,0,0,0.06)] font-bold' : 'text-graphite/60 hover:bg-white/50 hover:text-graphite font-semibold'}`}
                         onClick={() => setActiveBracketId(String(b.id))}>
                        {b.isMain && <span className="w-2 h-2 rounded-full bg-orange" title="Основная сетка"></span>}
                        <span className="text-[13px]">{b.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); setEditBracketParams(b); }} 
                                className={`ml-1 p-1 rounded-full transition-opacity ${activeBracketId === String(b.id) ? 'text-graphite/40 hover:text-orange hover:bg-orange/10' : 'opacity-0 group-hover:opacity-100 text-graphite/40 hover:text-graphite'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        </button>
                    </div>
                ))}
                <button onClick={addBracket} className="px-5 py-2 rounded-full text-orange hover:bg-orange/10 transition-colors ml-1 font-bold text-[13px]">
                    + Сетка
                </button>
            </div>

            <div className="absolute top-5 right-5 pointer-events-auto flex items-center gap-3 z-[60]">
                <div className="bg-white/20 backdrop-blur-xl border border-white/50 shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-md px-4 py-2.5 text-[13px] font-bold text-graphite/60 tracking-widest select-none">
                    {Math.round(zoom * 100)}%
                </div>
                <Button 
                    onClick={handleSaveBackend} 
                    isLoading={isSaving}
                    loadingText="Сохраняем..."
                    className={`shadow-[0_4px_20px_rgba(249,115,22,0.25)] ${isSaving ? '!bg-white/50 !text-graphite/50 backdrop-blur-xl' : 'bg-orange text-white hover:bg-orange-600'}`}
                >
                    Сохранить схему
                </Button>
            </div>

            <div 
                ref={containerRef} 
                className={`canvas-bg absolute inset-0 overflow-hidden select-none w-full h-full ${isDraggingCanvas ? 'cursor-grabbing' : 'cursor-default'}`}
                onMouseDown={handleMouseDown}
                style={{
                    backgroundPosition: `${pan.x}px ${pan.y}px`,
                    backgroundSize: `${40 * zoom}px ${40 * zoom}px` 
                }}
            >
                <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', width: '100%', height: '100%' }}>
                    
                    <svg className="connections-layer absolute top-0 left-0 min-w-[5000px] min-h-[5000px] z-0 overflow-visible">
                        {lines.map(line => (
                            <g key={line.id} className="pointer-events-auto">
                                <path d={drawSmoothLine(line.x1, line.y1, line.x2, line.y2, line.type)} className="line-hitbox" onClick={() => removeConnection(line.matchupId, line.slotNum)} />
                                <path d={drawSmoothLine(line.x1, line.y1, line.x2, line.y2, line.type)} 
                                    className="connector-line" stroke={line.type === 'winner_of' ? '#10B981' : '#EF4444'} 
                                    strokeWidth="3.5" fill="none" strokeLinecap="round" onClick={() => removeConnection(line.matchupId, line.slotNum)} />
                            </g>
                        ))}
                        {wireDragging && (
                            <path d={drawSmoothLine(wireDragging.startX, wireDragging.startY, mousePos.x, mousePos.y, wireDragging.type === 'W' ? 'winner_of' : 'loser_of')} 
                                fill="none" stroke={wireDragging.type === 'W' ? '#10B981' : '#EF4444'} 
                                strokeWidth="3.5" strokeDasharray="6 4" className="animate-pulse opacity-80" strokeLinecap="round" />
                        )}
                    </svg>

                    <div className="absolute top-0 left-0 min-w-[5000px] min-h-[5000px] z-10 pointer-events-none">
                        {activeBracket && activeBracket.rounds.map(round => (
                            <div key={round.id} className="absolute flex flex-col gap-3 w-[230px] pointer-events-auto" style={{ left: `${round.x}px`, top: `${round.y}px` }}>
                                <div onMouseDown={(e) => handleRoundDragStart(e, round)} 
                                     onDoubleClick={() => { setEditRoundParams({ id: round.id, name: round.name, originalName: round.name, wins: round.wins }); setRoundModalError(''); }}
                                     className={`bg-orange/5 backdrop-blur-[8px] rounded-md p-3 border shadow-sm flex flex-col gap-2 z-20 cursor-grab ${nodeDragging?.id === round.id ? 'border-orange ring-2 ring-orange/30' : 'border-slate-300 hover:border-slate-400'}`}>
                                    <div className="flex items-center gap-2">
                                        <span className="w-5 h-5 rounded-full bg-graphite text-white font-bold text-[10px] flex items-center justify-center shrink-0">{round.order}</span>
                                        <span className="text-[14px] font-bold text-graphite truncate" title={round.name}>{round.name}</span>
                                    </div>
                                    <div className="flex items-center justify-between mt-1 pt-2 border-t border-graphite/10">
                                        <span className="text-[11px] font-semibold text-slate-600 tracking-wide">Нужно побед: <span className="font-bold text-slate-800">{round.wins}</span></span>
                                        <div className="flex items-center gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); setEditRoundParams({ id: round.id, name: round.name, originalName: round.name, wins: round.wins }); setRoundModalError(''); }} className="p-1 text-gray-400 hover:text-orange hover:bg-orange/10 rounded transition-colors">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); addMatchup(round.id); }} className="p-1 text-gray-400 hover:text-orange hover:bg-orange/10 rounded transition-colors">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="relative w-full z-10">
                                    {round.matchups.map(matchup => {
                                        const badge = getMatchBadge(matchup.match_type);
                                        return (
                                        <div key={matchup.id} onMouseDown={(e) => handleMatchupDragStart(e, round.id, matchup)} onDoubleClick={() => setEditMatchupParams({ roundId: round.id, matchupId: matchup.id })}
                                            className={`absolute flex flex-col w-[230px] bg-white border rounded-md shadow-sm hover:shadow-md transition-shadow cursor-grab group/card ${nodeDragging?.matchupId === matchup.id ? 'border-orange ring-2 ring-orange/30 z-30' : 'border-gray-200 z-10'}`} style={{ top: `${matchup.y}px` }}>
                                            
                                            <div className="flex justify-between items-center px-2 py-1.5 border-b border-gray-100 rounded-t-xl bg-gray-50/50">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="bg-graphite text-white text-[9px] font-bold px-1.5 py-0.5 rounded-[6px] tracking-wide">Р{round.order}П{matchup.num}</span>
                                                    {badge && (
                                                        <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-[6px] shadow-sm ${badge.classes}`}>
                                                            {badge.text}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center opacity-0 group-hover/card:opacity-100 transition-opacity">
                                                    <button onClick={() => setEditMatchupParams({ roundId: round.id, matchupId: matchup.id })} className="text-gray-300 hover:text-orange mr-1.5 transition-colors"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg></button>
                                                    <button onClick={() => removeMatchup(round.id, matchup.id)} className="text-gray-300 hover:text-red-500 transition-colors"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                                                </div>
                                            </div>

                                            <div className="p-2.5 pt-2 relative">
                                                <div className="absolute -right-[12px] top-1/2 -translate-y-1/2 flex flex-col gap-2 z-40">
                                                    <div data-output-w={matchup.id} onMouseDown={(e) => handleWireDragStart(e, matchup.id, 'W')} className={`w-[22px] h-[22px] bg-white border-[2px] border-[#10B981] text-[#10B981] rounded-lg flex items-center justify-center font-black text-[12px] cursor-grab hover:scale-110 hover:bg-[#10B981] hover:text-white transition-all shadow-sm ${wireDragging?.matchupId === matchup.id && wireDragging?.type === 'W' ? 'bg-[#10B981] text-white scale-110' : ''}`}>✓</div>
                                                    <div data-output-l={matchup.id} onMouseDown={(e) => handleWireDragStart(e, matchup.id, 'L')} className={`w-[22px] h-[22px] bg-white border-[2px] border-[#EF4444] text-[#EF4444] rounded-lg flex items-center justify-center font-black text-[12px] cursor-grab hover:scale-110 hover:bg-[#EF4444] hover:text-white transition-all shadow-sm ${wireDragging?.matchupId === matchup.id && wireDragging?.type === 'L' ? 'bg-[#EF4444] text-white scale-110' : ''}`}>×</div>
                                                </div>

                                                <div className="flex flex-col gap-2 relative z-10">
                                                    {[1, 2].map(slotNum => {
                                                        const type = matchup[`t${slotNum}_type`];
                                                        const ref = matchup[`t${slotNum}_ref`];
                                                        
                                                        const refMatch = type !== 'seed' && ref ? getGlobalMatchupInfo(ref) : null;
                                                        const isDropTarget = wireDragging && activeBracket.rounds.find(r => r.matchups.some(m => String(m.id) === String(wireDragging.matchupId)))?.order < round.order;

                                                        let fullLabel = "Пусто";
                                                        let labelContent = <span className="text-[11px] truncate w-full">Пусто</span>;

                                                        if (type === 'seed') {
                                                            fullLabel = `Посев № ${ref || '?'}`;
                                                            labelContent = <span className="text-[11px] truncate w-full font-bold text-graphite">{fullLabel}</span>;
                                                        } else if (refMatch) {
                                                            const suffix = `${type === 'winner_of' ? 'Поб.' : 'Проигр.'} (Р${refMatch.roundOrder}П${refMatch.num})`;
                                                            
                                                            if (String(refMatch.bracketId) === String(activeBracketId)) {
                                                                fullLabel = suffix;
                                                                labelContent = <span className="text-[11px] truncate w-full font-medium">{suffix}</span>;
                                                            } else {
                                                                fullLabel = `[${refMatch.bracketName}] ${suffix}`;
                                                                labelContent = (
                                                                    <span className="flex items-center text-[11px] font-medium w-full overflow-hidden">
                                                                        <span className="flex shrink overflow-hidden min-w-0">
                                                                            <span className="shrink-0">[</span>
                                                                            <span className="shrink truncate">{refMatch.bracketName}</span>
                                                                            <span className="shrink-0">]</span>
                                                                        </span>
                                                                        <span className="shrink-0 whitespace-pre"> {suffix}</span>
                                                                    </span>
                                                                );
                                                            }
                                                        }

                                                        let slotStyles = 'bg-gray-50 border-gray-100 text-gray-400 font-normal';
                                                        if (isDropTarget) {
                                                            slotStyles = 'ring-2 ring-orange border-orange shadow-lg bg-orange-50 text-graphite font-semibold';
                                                        } else if (type === 'seed') {
                                                            slotStyles = 'bg-white border-gray-200 text-graphite'; 
                                                        } else if (type === 'winner_of') {
                                                            slotStyles = 'bg-[#ecfdf5] border-[#10B981]/30 text-graphite font-semibold'; 
                                                        } else if (type === 'loser_of') {
                                                            slotStyles = 'bg-[#fef2f2] border-[#EF4444]/30 text-graphite font-semibold'; 
                                                        } else if (type !== 'manual') {
                                                            slotStyles = 'bg-white border-gray-200 text-graphite font-semibold';
                                                        }

                                                        return (
                                                            <div key={slotNum} data-input-1={slotNum === 1 ? matchup.id : null} data-input-2={slotNum === 2 ? matchup.id : null}
                                                                onMouseUp={() => isDropTarget ? handleWireDrop(matchup.id, slotNum, round.order) : null}
                                                                className={`relative flex items-center w-[190px] h-[28px] px-2 border rounded-lg transition-all cursor-default ${slotStyles}`}
                                                                title={fullLabel}>
                                                                
                                                                {(type !== 'manual' || isDropTarget) && (
                                                                    <div className={`absolute -left-[14px] top-1/2 -translate-y-1/2 w-[10px] h-[10px] border-2 rounded-full z-20 
                                                                        ${type === 'winner_of' ? 'border-[#10B981] bg-[#ecfdf5]' : 
                                                                        (type === 'loser_of' ? 'border-[#EF4444] bg-[#fef2f2]' : 'border-gray-300 bg-white')}`} 
                                                                    />
                                                                )}
                                                                {labelContent}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            </div>
                        ))}
                        
                        {renderAddRoundBtn()}
                    </div>
                </div>
            </div>

            {editMatchupParams && (
                <MatchupSettingsModal 
                    data={data}
                    activeBracketId={activeBracketId}
                    round={activeBracket.rounds.find(r => r.id === editMatchupParams.roundId)} 
                    matchup={activeBracket.rounds.find(r => r.id === editMatchupParams.roundId).matchups.find(m => m.id === editMatchupParams.matchupId)} 
                    onClose={() => setEditMatchupParams(null)}
                    onSave={(t1_type, t1_ref, t2_type, t2_ref, match_type) => {
                        updateActiveBracket(b => ({ ...b, rounds: b.rounds.map(r => r.id === editMatchupParams.roundId ? { ...r, matchups: r.matchups.map(m => m.id === editMatchupParams.matchupId ? { ...m, t1_type, t1_ref, t2_type, t2_ref, match_type } : m) } : r) }));
                        setEditMatchupParams(null);
                    }} 
                />
            )}

            {editRoundParams && (
                <Modal isOpen={true} onClose={() => { setEditRoundParams(null); setRoundModalError(''); }} title="Настройки раунда" size="normal">
                    <div className="flex flex-col gap-6 font-sans">
                        <Input 
                            label="Название раунда" 
                            value={editRoundParams.name} 
                            onChange={e => setEditRoundParams({...editRoundParams, name: e.target.value})} 
                        />
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between p-2 bg-graphite/5 rounded-md border border-graphite/10">
                                <span className="text-[12px] font-bold text-graphite uppercase tracking-wide px-2">Необходимое количество побед</span>
                                <Stepper 
                                    initialValue={editRoundParams.wins} 
                                    min={1} max={7} 
                                    onChange={(v) => {
                                        setEditRoundParams({...editRoundParams, wins: v});
                                        setRoundModalError('');
                                    }} 
                                />
                            </div>
                            
                            {/* ОШИБКА ВАЛИДАЦИИ СЫГРАННЫХ МАТЧЕЙ */}
                            {roundModalError && (
                                <div className="text-status-rejected text-[12px] font-medium mt-1 px-2 animate-zoom-in">
                                    {roundModalError}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-3 pt-4 border-t border-graphite/10">
                            <Button 
                                onClick={() => { 
                                    // ПРОВЕРКА ЛИМИТА (ФРОНТЕНД ВАЛИДАЦИЯ)
                                    const maxGames = (editRoundParams.wins * 2) - 1;
                                    const roundGames = games.filter(g => g.stage_label === editRoundParams.originalName);
                                    
                                    let maxPlayedForAnyPair = 0;
                                    const pairGroups = {};
                                    
                                    roundGames.forEach(g => {
                                        if (!g.home_team_id || !g.away_team_id) return;
                                        
                                        const key = [g.home_team_id, g.away_team_id].sort().join('-');
                                        if (!pairGroups[key]) pairGroups[key] = 0;
                                        
                                        if (g.status === 'live' || g.status === 'finished') {
                                            pairGroups[key]++;
                                            if (pairGroups[key] > maxPlayedForAnyPair) {
                                                maxPlayedForAnyPair = pairGroups[key];
                                            }
                                        }
                                    });

                                    // Если уже сыграно больше матчей, чем позволяет новый лимит — блокируем сохранение
                                    if (maxPlayedForAnyPair > maxGames) {
                                        setRoundModalError(`В этом раунде уже было проведено ${maxPlayedForAnyPair} матчей в рамках одной серии.`);
                                        return;
                                    }

                                    // Сохраняем локально, если всё Ок
                                    updateActiveBracket(b => ({
                                        ...b, 
                                        rounds: b.rounds.map(r => r.id === editRoundParams.id 
                                            ? {...r, name: editRoundParams.name, wins: editRoundParams.wins} 
                                            : r)
                                    })); 
                                    setEditRoundParams(null); 
                                    setRoundModalError('');
                                }} 
                                className="w-full py-3"
                            >
                                Сохранить
                            </Button>
                            <Button 
                                onClick={() => { removeRound(editRoundParams.id); setEditRoundParams(null); setRoundModalError(''); }} 
                                className="w-full py-3 bg-status-rejected/10 text-status-rejected hover:bg-status-rejected hover:text-white"
                            >
                                Удалить раунд
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {editBracketParams && (
                <BracketSettingsModal 
                    bracket={editBracketParams} 
                    canDelete={data.brackets.length > 1}
                    onClose={() => setEditBracketParams(null)}
                    onSave={(name, isMain) => {
                        setData(prev => ({
                            ...prev,
                            brackets: prev.brackets.map(b => {
                                if (b.id === editBracketParams.id) return { ...b, name, isMain };
                                if (isMain) return { ...b, isMain: false }; 
                                return b;
                            })
                        }));
                        setEditBracketParams(null);
                    }}
                    onDelete={() => {
                        setData(prev => {
                            const newBrackets = prev.brackets.filter(b => b.id !== editBracketParams.id);
                            if(activeBracketId === editBracketParams.id) setActiveBracketId(newBrackets[0].id);
                            return { ...prev, brackets: newBrackets };
                        });
                        setEditBracketParams(null);
                    }}
                />
            )}
        </div>
    );
}