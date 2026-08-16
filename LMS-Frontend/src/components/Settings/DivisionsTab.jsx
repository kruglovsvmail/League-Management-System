import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { Select } from '../../ui/Select';
import { Input } from '../../ui/Input';
import { Stepper } from '../../ui/Stepper';
import { Switch } from '../../ui/Switch';
import { Checkbox } from '../../ui/Checkbox';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { DatePicker } from '../../ui/DatePicker';
import { Uploader } from '../../ui/Uploader';
import { AccessFallback } from '../../ui/AccessFallback';
import { getToken, getImageUrl } from '../../utils/helpers';

import { PlayoffStructureView } from './PlayoffStructureView';
import { NominationsSection } from './NominationsSection';
import { ReserveGoaliesSection } from './ReserveGoaliesSection';

const TYPE_OPTIONS = ['Регулярный чемпионат', 'Плей-офф', 'Регулярный + Плей-офф'];
const TYPE_MAP = { 'Регулярный чемпионат': 'regular', 'Плей-офф': 'playoff', 'Регулярный + Плей-офф': 'mixed' };
const REV_TYPE_MAP = { 'regular': 'Регулярный чемпионат', 'playoff': 'Плей-офф', 'mixed': 'Регулярный + Плей-офф' };

// Полный пул критериев тай-брейка. formData.ranking_criteria хранит системные
// ключи (id) напрямую — без перевода в русские названия и обратно.
// tag определяет бейдж-подпись: "очные" считаются только по матчам между
// текущей спорной группой команд, "сезон" — по всем матчам регулярки,
// "доп" — не входят в Регламент, добавлены отдельно.
const CRITERIA_DEFS = [
  { id: 'points', label: 'Очки', tag: 'сезон' },
  { id: 'h2h_points', label: 'Очки в очных встречах', tag: 'очные' },
  { id: 'h2h_wins', label: 'Победы в очных встречах', tag: 'очные' },
  { id: 'h2h_diff', label: 'Разница шайб в очных встречах', tag: 'очные' },
  { id: 'h2h_for', label: 'Заброшенные шайбы в очных встречах', tag: 'очные' },
  { id: 'wins', label: 'Победы', tag: 'сезон' },
  { id: 'goals_diff', label: 'Разница шайб', tag: 'сезон' },
  { id: 'goals_for', label: 'Заброшенные шайбы', tag: 'сезон' },
  { id: 'penalty_minutes', label: 'Штрафные минуты (меньше — лучше)', tag: 'доп' },
  { id: 'avg_age', label: 'Средний возраст (старше — лучше)', tag: 'доп' },
];
const CRITERIA_BY_ID = Object.fromEntries(CRITERIA_DEFS.map(c => [c.id, c]));
const ALL_CRITERIA_IDS = CRITERIA_DEFS.map(c => c.id);
const DEFAULT_ACTIVE_CRITERIA = ['points', 'h2h_points', 'h2h_wins', 'h2h_diff', 'h2h_for', 'wins', 'goals_diff', 'goals_for'];

// application_start/application_end/transfer_start/transfer_end приходят с бэкенда
// полным ISO-моментом (timestamptz). Нельзя брать .split('T')[0] — это UTC-календарный
// день, а он на 3 часа отстаёт от московского. Конвертируем в YYYY-MM-DD явно по
// таймзоне клуба (тот же паттерн, что todayInClubTimezone() в LMS-Backend/controllers/metricsController.js).
const toClubDateStr = (isoValue) => {
  if (!isoValue) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(isoValue));
  const get = (t) => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};

const getInitialFormData = (div = null, isTournamentDefault = false) => {
  if (div) {
    let parsedCriteria = [...DEFAULT_ACTIVE_CRITERIA];
    try {
      if (div.ranking_criteria) {
        const parsed = typeof div.ranking_criteria === 'string' ? JSON.parse(div.ranking_criteria) : div.ranking_criteria;
        if (Array.isArray(parsed)) {
          // Отбрасываем неизвестные/устаревшие ключи (например, старый бандл "h2h")
          // и дубликаты — остальное берём как есть, порядок пользователя сохраняется.
          const valid = [...new Set(parsed.filter(id => ALL_CRITERIA_IDS.includes(id)))];
          if (valid.length > 0) parsedCriteria = valid;
        }
      }
    } catch (e) {}

    return {
      ...div,
      tournament_type: REV_TYPE_MAP[div.tournament_type] || 'Регулярный чемпионат',
      start_date: div.start_date ? div.start_date.split('T')[0] : null,
      end_date: div.end_date ? div.end_date.split('T')[0] : null,
      application_start: toClubDateStr(div.application_start),
      application_end: toClubDateStr(div.application_end),
      transfer_start: toClubDateStr(div.transfer_start),
      transfer_end: toClubDateStr(div.transfer_end),
      ranking_criteria: parsedCriteria,

      reg_periods_count: div.reg_periods_count ?? 3, 
      reg_period_length: div.reg_period_length ?? 20, 
      reg_has_overtime: div.reg_has_overtime ?? true, 
      reg_ot_length: div.reg_ot_length ?? 5, 
      reg_has_shootouts: div.reg_has_shootouts ?? true, 
      reg_so_length: div.reg_so_length ?? 3, 
      reg_track_plus_minus: div.reg_track_plus_minus ?? false,
      reg_track_shots: div.reg_track_shots ?? true,

      playoff_periods_count: div.playoff_periods_count ?? 3,
      playoff_period_length: div.playoff_period_length ?? 20,
      playoff_has_overtime: div.playoff_has_overtime ?? true,
      playoff_ot_length: div.playoff_ot_length ?? 20,
      playoff_has_shootouts: div.playoff_has_shootouts ?? false,
      playoff_so_length: div.playoff_so_length ?? 0,
      playoff_track_plus_minus: div.playoff_track_plus_minus ?? false,
      playoff_track_shots: div.playoff_track_shots ?? true,

      // Один флаг на дивизион: контроль административный, регулярку и плей-офф не разделяем
      track_timer_log: div.track_timer_log ?? false,

      reserve_goalie_max_per_game: div.reserve_goalie_max_per_game ?? 1,
      reserve_goalie_block_back_to_back: div.reserve_goalie_block_back_to_back ?? false,

      req_med_cert: div.req_med_cert ?? true, req_insurance: div.req_insurance ?? true, req_consent: div.req_consent ?? true, digital_applications_only: div.digital_applications_only ?? true,
      // null в массиве — пункт «Без квалификации» (тем, кому квалификация в лиге не присвоена).
      // Пустой массив = допуск по квалификациям не ограничен.
      qualification_ids: Array.isArray(div.qualification_ids) ? div.qualification_ids : [],
      hide_stats_unpaid: div.hide_stats_unpaid ?? false, individual_fee: div.individual_fee ?? '',
      is_tournament: div.is_tournament ?? false,
      points_win_reg: div.points_win_reg ?? 2, points_win_ot: div.points_win_ot ?? 2, points_draw: div.points_draw ?? 1, points_loss_ot: div.points_loss_ot ?? 1, points_loss_reg: div.points_loss_reg ?? 0,
      points_tech_win: div.points_tech_win ?? 3, points_tech_loss: div.points_tech_loss ?? 0, points_tech_draw: div.points_tech_draw ?? 0,
    };
  }
  return {
    name: '', short_name: '', classification: '', tournament_type: 'Регулярный чемпионат', description: '',
    start_date: null, end_date: null, application_start: null, application_end: null, transfer_start: null, transfer_end: null,
    
    reg_periods_count: 3, reg_period_length: 20, reg_has_overtime: true, reg_ot_length: 5, reg_has_shootouts: true, reg_so_length: 3, reg_track_plus_minus: false, reg_track_shots: true,
    playoff_periods_count: 3, playoff_period_length: 20, playoff_has_overtime: true, playoff_ot_length: 20, playoff_has_shootouts: false, playoff_so_length: 0, playoff_track_plus_minus: false, playoff_track_shots: true,
    track_timer_log: false,

    reserve_goalie_max_per_game: 1, reserve_goalie_block_back_to_back: false,

    req_med_cert: true, req_insurance: true, req_consent: true, digital_applications_only: true,
    qualification_ids: [],
    hide_stats_unpaid: false, individual_fee: '',
    is_tournament: isTournamentDefault,
    points_win_reg: 2, points_win_ot: 2, points_draw: 1, points_loss_ot: 1, points_loss_reg: 0,
    points_tech_win: 3, points_tech_loss: 0, points_tech_draw: 0,
    ranking_criteria: [...DEFAULT_ACTIVE_CRITERIA],
  };
};

const PlayoffSummary = ({ divisionId, canEditPlayoff }) => {
    const [brackets, setBrackets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchBrackets = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/playoff`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await res.json();
            if (data.success) setBrackets(data.brackets);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBrackets();
        const handleMessage = (event) => {
            if (event.data === 'PLAYOFF_SAVED') fetchBrackets();
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [divisionId]);

    const openConstructorPopup = () => {
        const url = `/playoff-editor/${divisionId}`; 
        const features = 'width=1400,height=900,left=100,top=100,toolbar=no,menubar=no,location=no,status=no,scrollbars=yes,resizable=yes';
        window.open(url, 'PlayoffEditor', features);
    };

    if (isLoading) return <div className="py-10 flex justify-center"><Loader text="" /></div>;

    return (
        <div className="flex flex-col gap-8 w-full animate-zoom-in max-w-full">
            <div className="flex justify-between items-center bg-white/70 p-6 rounded-md border border-graphite/10">
                <div className="flex flex-col">
                    <span className="text-[15px] font-bold text-graphite uppercase">Управление сетками</span>
                    <span className="text-[12px] text-graphite-light mt-1">
                        {canEditPlayoff ? 'Конструктор откроется в отдельном системном окне' : 'Просмотр текущей структуры сетки'}
                    </span>
                </div>
                {canEditPlayoff && (
                    <Button onClick={openConstructorPopup} className="bg-graphite text-white hover:bg-black border-none px-6 shadow-lg">
                        Открыть конструктор
                    </Button>
                )}
            </div>

            {brackets.length > 0 ? (
                <div className="flex flex-col gap-5">
                    <span className="text-[14px] font-bold text-graphite uppercase tracking-wider ml-1">Текущая структура</span>
                    <PlayoffStructureView brackets={brackets} />
                </div>
            ) : (
                 <div className="text-center bg-white/40 border border-dashed border-graphite/20 rounded-md text-graphite-light py-12 px-6">
                    Плей-офф еще не настроен. {canEditPlayoff ? 'Откройте конструктор, чтобы создать сетки.' : ''}
                </div>
            )}
        </div>
    );
};

export function DivisionsTab({ setToast, setHeaderActions }) {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  
  const canView = checkAccess('SETTINGS_DIVISIONS_VIEW');
  const canEdit = checkAccess('SETTINGS_DIVISIONS_EDIT');
  const canCreate = checkAccess('SETTINGS_DIVISIONS_CREATE');
  const canEditPlayoff = checkAccess('SETTINGS_PLAYOFF_CONSTRUCTOR');
  const canViewNominations = checkAccess('SETTINGS_NOMINATIONS_VIEW');
  const canManageNominations = checkAccess('SETTINGS_NOMINATIONS_MANAGE');
  const canViewReserveGoalies = checkAccess('SETTINGS_RESERVE_GOALIES_VIEW');
  const canManageReserveGoalies = checkAccess('SETTINGS_RESERVE_GOALIES_MANAGE');

  const isLocked = !canEdit;

  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState(null);
  const [newIsTournament, setNewIsTournament] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [originalData, setOriginalData] = useState(null);
  const [formData, setFormData] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [regFile, setRegFile] = useState(null);
  const [logoCleared, setLogoCleared] = useState(false);
  const [regCleared, setRegCleared] = useState(false);

  const [activeSection, setActiveSection] = useState('general');
  // Какой дивизион уже загружен в форму. Нужен, чтобы отличить настоящую смену дивизиона
  // от перезагрузки списка после сохранения: во втором случае раздел меню менять нельзя.
  const loadedDivisionRef = useRef(null);

  // Управление перетаскиванием критериев тай-брейка между "активными" и "стеком" (Мышь + Тач)
  const dragCriterionId = useRef(null);
  const dragOverZone = useRef(null); // 'active' | 'stack' | null
  const dragOverCriterionId = useRef(null); // id активной плашки, над которой сейчас находится перетаскиваемый элемент
  const [draggingCriterionId, setDraggingCriterionId] = useState(null);

  useEffect(() => { if (selectedLeague?.id && canView) fetchSeasons(); }, [selectedLeague, canView]);

  // Справочник квалификаций лиги — из него собирается список допущенных в дивизион.
  // Архивные не показываем: отметить их заново нельзя, а уже отмеченные и так лежат
  // в qualification_ids и на проверку допуска влияют.
  const [leagueQuals, setLeagueQuals] = useState([]);

  useEffect(() => {
    if (!selectedLeague?.id || !canView) return;

    fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/settings-qualifications`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    })
      .then(res => res.json())
      .then(data => { if (data.success) setLeagueQuals(data.qualifications); })
      .catch(console.error);
  }, [selectedLeague, canView]);

  const fetchSeasons = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${selectedLeague.id}/seasons`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) {
        setSeasons(data.data);
        const active = data.data.find(s => s.is_active) || data.data[0];
        if (active) setSelectedSeasonId(active.id);
      }
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    if (selectedSeasonId && canView) fetchDivisions();
    else { setDivisions([]); setSelectedDivisionId(null); setFormData(null); setOriginalData(null); }
  }, [selectedSeasonId, canView]);

  const fetchDivisions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/divisions`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) {
        setDivisions(data.data);
        if (selectedDivisionId === 'new') return;
        // Список перезагружается и после сохранения — тогда выбор надо оставить на месте.
        // На первый дивизион переключаемся только если текущий пропал (или это другой сезон).
        if (data.data.some(d => d.id === selectedDivisionId)) return;
        if (data.data.length > 0) setSelectedDivisionId(data.data[0].id);
        else setSelectedDivisionId(null);
      }
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    setLogoFile(null); setRegFile(null); setLogoCleared(false); setRegCleared(false);

    // Эффект срабатывает и когда divisions просто перезагрузился после сохранения.
    // Форму в этом случае пересобрать надо (сервер мог нормализовать значения),
    // а вот раздел меню — оставить: иначе пользователя выбрасывает на «Общую информацию».
    const divisionChanged = loadedDivisionRef.current !== selectedDivisionId;
    loadedDivisionRef.current = selectedDivisionId;

    if (selectedDivisionId === 'new') {
      const initial = getInitialFormData(null, newIsTournament);
      setFormData(initial);
      setOriginalData(initial);
      if (divisionChanged) setActiveSection('general');
    } else if (selectedDivisionId) {
      const div = divisions.find(d => d.id === selectedDivisionId);
      const initial = getInitialFormData(div);
      setFormData(initial);
      setOriginalData(initial);
      if (divisionChanged) setActiveSection('general');
    } else {
      setFormData(null);
      setOriginalData(null);
    }
  }, [selectedDivisionId, divisions, newIsTournament]);

  useEffect(() => {
    if (setHeaderActions && canCreate && selectedSeasonId) {
      const isCreatingNew = selectedDivisionId === 'new';
      const actionBtn = isCreatingNew ? (
        <Button
          onClick={() => setSelectedDivisionId(divisions.length > 0 ? divisions[0].id : null)}
          className="bg-white text-orange border border-orange hover:bg-orange/5"
        >
          Отменить создание
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button onClick={() => { setNewIsTournament(false); setSelectedDivisionId('new'); }}>
            + Новый дивизион
          </Button>
          <Button onClick={() => { setNewIsTournament(true); setSelectedDivisionId('new'); }}>
            + Новый турнир
          </Button>
        </div>
      );
      setHeaderActions(actionBtn);
    } else if (setHeaderActions) {
      setHeaderActions(null);
    }

    return () => {
        if (setHeaderActions) setHeaderActions(null);
    };
  }, [setHeaderActions, canCreate, selectedSeasonId, selectedDivisionId, divisions]);

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

  // Отметка/снятие квалификации в списке допущенных. qualId === null — пункт «Без квалификации».
  const toggleQualification = (qualId) => {
    const list = formData?.qualification_ids || [];
    const has = list.some(id => id === qualId);
    handleChange('qualification_ids', has ? list.filter(id => id !== qualId) : [...list, qualId]);
  };

  // ---- УНИВЕРСАЛЬНАЯ ЛОГИКА DRAG-AND-DROP МЕЖДУ ДВУМЯ ЗОНАМИ (Mouse + Touch) ----
  // "Активные" — formData.ranking_criteria (упорядоченный массив id).
  // "Стек" — всё остальное из ALL_CRITERIA_IDS, не хранится отдельно, а вычисляется при рендере.
  const applyDrag = () => {
    const id = dragCriterionId.current;
    if (id) {
        const withoutDragged = formData.ranking_criteria.filter(c => c !== id);
        if (dragOverZone.current === 'active') {
            const overId = dragOverCriterionId.current;
            const insertAt = overId ? withoutDragged.indexOf(overId) : withoutDragged.length;
            withoutDragged.splice(insertAt === -1 ? withoutDragged.length : insertAt, 0, id);
        }
        // Если бросили в "стек" (или отпустили в никуда) — id просто остаётся исключённым
        handleChange('ranking_criteria', withoutDragged);
    }
    dragCriterionId.current = null;
    dragOverZone.current = null;
    dragOverCriterionId.current = null;
    setDraggingCriterionId(null);
  };

  // Десктопные события (HTML5)
  const handleDragStart = (e, id) => {
    dragCriterionId.current = id;
    setDraggingCriterionId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragEnterActive = (e, overId) => { dragOverZone.current = 'active'; dragOverCriterionId.current = overId; };
  const handleDragEnterStack = () => { dragOverZone.current = 'stack'; dragOverCriterionId.current = null; };
  const handleDragEnd = () => applyDrag();

  // Мобильные события (Touch API)
  const handleTouchStart = (e, id) => {
    dragCriterionId.current = id;
    setDraggingCriterionId(id);
  };
  const handleTouchMove = (e) => {
    if (dragCriterionId.current === null) return;
    const touch = e.touches[0];
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const zone = elem?.closest('[data-dnd-zone]');
    if (zone) {
        dragOverZone.current = zone.getAttribute('data-dnd-zone');
        const item = elem.closest('[data-dnd-id]');
        dragOverCriterionId.current = (item && zone.getAttribute('data-dnd-zone') === 'active') ? item.getAttribute('data-dnd-id') : null;
    }
  };
  const handleTouchEnd = () => applyDrag();

  const removeFromActive = (id) => handleChange('ranking_criteria', formData.ranking_criteria.filter(c => c !== id));
  const addToActive = (id) => handleChange('ranking_criteria', [...formData.ranking_criteria, id]);
  // -----------------------------------------------------------

  const isOverlap = () => {
    if (!formData) return false;
    const as = formData.application_start ? new Date(formData.application_start) : null;
    const ae = formData.application_end ? new Date(formData.application_end) : null;
    const ts = formData.transfer_start ? new Date(formData.transfer_start) : null;
    const te = formData.transfer_end ? new Date(formData.transfer_end) : null;

    if (as && ae && ts && te) {
      return (as <= te) && (ae >= ts);
    }
    return false;
  };

  const isFormValid = () => {
    if (!formData) return false;
    if (!formData.name || !formData.short_name || !formData.tournament_type) return false;
    if (!formData.start_date || !formData.end_date) return false;
    if (!formData.application_start || !formData.application_end) return false;
    if (isOverlap()) return false;
    return true;
  };

  const isDirty = () => {
    if (!formData || !originalData) return false;
    const hasDataChanged = JSON.stringify(formData) !== JSON.stringify(originalData);
    const hasFilesChanged = logoFile !== null || regFile !== null || logoCleared || regCleared;
    return hasDataChanged || hasFilesChanged;
  };

  const uploadFileS3 = async (divId, type, file) => {
    const fd = new FormData(); fd.append('file', file);
    await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divId}/upload/${type}`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` }, body: fd
    });
  };

  const handleSave = async () => {
    if (!isFormValid()) return;
    setIsSaving(true);

    try {
      const payload = {
        ...formData,
        tournament_type: TYPE_MAP[formData.tournament_type],
        ranking_criteria: formData.ranking_criteria,
        clear_logo: logoCleared, clear_regulations: regCleared
      };

      const isNew = selectedDivisionId === 'new';
      const url = isNew ? `${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/divisions` : `${import.meta.env.VITE_API_URL}/api/divisions/${selectedDivisionId}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const savedDivId = isNew ? data.id : selectedDivisionId;
      if (logoFile) await uploadFileS3(savedDivId, 'logo', logoFile);
      if (regFile) await uploadFileS3(savedDivId, 'regulations', regFile);

      setToast({ title: 'Успешно', message: isNew ? (formData.is_tournament ? 'Турнир создан' : 'Дивизион создан') : 'Настройки сохранены', type: 'success' });
      if (isNew) {
          setSelectedDivisionId(savedDivId);
      }
      
      setLogoFile(null);
      setRegFile(null);
      setLogoCleared(false);
      setRegCleared(false);
      fetchDivisions();

    } catch (err) { setToast({ title: 'Ошибка', message: err.message, type: 'error' }); } 
    finally { setIsSaving(false); }
  };

  if (!canView) {
    return <AccessFallback variant="full" message="У вас нет прав для просмотра настроек дивизионов и турниров." />;
  }

  const typeVal = TYPE_MAP[formData?.tournament_type];
  const showRegular = typeVal === 'regular' || typeVal === 'mixed';
  const showPlayoff = typeVal === 'playoff' || typeVal === 'mixed';

  const isCreatingNew = selectedDivisionId === 'new';

  // Слово меняется по всей форме в зависимости от того, дивизион это или турнир
  // (структурно одна и та же сущность, отличие только в отображаемом названии).
  const isTournamentEntity = !!formData?.is_tournament;
  const entityNom = isTournamentEntity ? 'турнир' : 'дивизион';
  const entityGen = isTournamentEntity ? 'турнира' : 'дивизиона';

  const currSeasonName = seasons.find(s => s.id === selectedSeasonId)?.name || '';
  const divOpts = divisions.map(d => ({
    value: d.name,
    label: (
      <span className="inline-flex items-center gap-2">
        <span className={`shrink-0 text-[10px] font-normal px-1.5 py-0.5 rounded ${d.is_tournament ? 'bg-blue-500/10 text-blue-600' : 'bg-orange/10 text-orange'}`}>
          {d.is_tournament ? 'Т' : 'Д'}
        </span>
        <span>{d.name}</span>
      </span>
    ),
  }));
  const selDivName = isCreatingNew ? '' : (divisions.find(d => d.id === selectedDivisionId)?.name || '');

  const menuItems = [
    { id: 'general', label: 'Общая информация' },
    { id: 'dates', label: 'Сроки и заявки' },
    { id: 'mechanics', label: 'Механика матчей' },
  ];
  if (showRegular) menuItems.push({ id: 'regular', label: 'Регулярный чемпионат' });
  if (showPlayoff) menuItems.push({ id: 'playoff', label: 'Плей-офф' });
  // Номинации не зависят от типа турнира: их разыгрывают и в чистой регулярке
  if (canViewNominations) menuItems.push({ id: 'nominations', label: 'Номинации' });
  // Резервные вратари — механика опциональная: раздела нет вовсе, пока лига не
  // включила её тумблером в «Управление лигой → Параметры»
  if (canViewReserveGoalies && selectedLeague?.reserve_goalies_enabled) {
    menuItems.push({ id: 'reserve_goalies', label: 'Резервные вратари' });
  }

  if (formData && !menuItems.find(m => m.id === activeSection)) {
    setActiveSection('general');
  }

  const renderMechanicsBlock = (prefix, title) => (
     <div className="bg-white/70 p-5 rounded-md border border-graphite/10 flex flex-col gap-5">
        <span className="text-[14px] font-bold text-graphite uppercase tracking-wider">{title}</span>
        
        <div className="flex justify-between items-center gap-4 border-b border-graphite/5 pb-4">
            <div><div className="text-[13px] font-semibold text-graphite">Количество периодов</div><div className="text-[11px] text-graphite-light mt-0.5 leading-tight">Число периодов в матче</div></div>
            <Stepper initialValue={formData[`${prefix}_periods_count`]} onChange={(v) => handleChange(`${prefix}_periods_count`, v)} min={1} max={5} disabled={isLocked} />
        </div>
        
        <div className="flex justify-between items-center gap-4 border-b border-graphite/5 pb-4">
            <div><div className="text-[13px] font-semibold text-graphite">Длина (мин)</div><div className="text-[11px] text-graphite-light mt-0.5 leading-tight">Длительность одного периода</div></div>
            <Stepper initialValue={formData[`${prefix}_period_length`]} onChange={(v) => handleChange(`${prefix}_period_length`, v)} min={5} max={60} disabled={isLocked} />
        </div>

        <div className="flex flex-col gap-3 border-b border-graphite/5 pb-4">
            <div className="flex justify-between items-center gap-4">
                <div><div className="text-[13px] font-semibold text-graphite">Овертайм</div><div className="text-[11px] text-graphite-light mt-0.5 leading-tight">Доп. период при ничьей</div></div>
                <Switch checked={formData[`${prefix}_has_overtime`]} onChange={(e) => handleChange(`${prefix}_has_overtime`, e.target.checked)} disabled={isLocked} />
            </div>
            {formData[`${prefix}_has_overtime`] && (
                <div className="flex justify-between items-center gap-4 pt-2 animate-zoom-in">
                    <div className="text-[12px] text-graphite-light font-semibold">Длительность ОТ (мин)</div>
                    <Stepper initialValue={formData[`${prefix}_ot_length`]} onChange={(v) => handleChange(`${prefix}_ot_length`, v)} min={1} max={30} disabled={isLocked} />
                </div>
            )}
        </div>

        <div className="flex flex-col gap-3 border-b border-graphite/5 pb-4">
            <div className="flex justify-between items-center gap-4">
                <div><div className="text-[13px] font-semibold text-graphite">Буллиты</div><div className="text-[11px] text-graphite-light mt-0.5 leading-tight">Послематчевые броски</div></div>
                <Switch checked={formData[`${prefix}_has_shootouts`]} onChange={(e) => handleChange(`${prefix}_has_shootouts`, e.target.checked)} disabled={isLocked} />
            </div>
            {formData[`${prefix}_has_shootouts`] && (
                <div className="flex justify-between items-center gap-4 pt-2 animate-zoom-in">
                    <div className="text-[12px] text-graphite-light font-semibold">Мин. бросков</div>
                    <Stepper initialValue={formData[`${prefix}_so_length`]} onChange={(v) => handleChange(`${prefix}_so_length`, v)} min={0} max={10} disabled={isLocked} />
                </div>
            )}
        </div>

        <div className="bg-orange/5 border border-orange/10 rounded-md p-4 flex flex-col gap-4">
            <span className="text-[12px] font-bold text-orange uppercase tracking-wider">Статистика</span>

            <div className="flex justify-between items-center gap-4 border-b border-orange/10 pb-4">
                <div><div className="text-[13px] font-semibold text-graphite">Считается +/-</div><div className="text-[11px] text-graphite-light mt-0.5 leading-tight">Учет коэффициента полезности игроков</div></div>
                <Switch checked={formData[`${prefix}_track_plus_minus`]} onChange={(e) => handleChange(`${prefix}_track_plus_minus`, e.target.checked)} disabled={isLocked} />
            </div>

            <div className="flex justify-between items-center gap-4">
                <div><div className="text-[13px] font-semibold text-graphite">Считаются броски</div><div className="text-[11px] text-graphite-light mt-0.5 leading-tight">Ведение статистики бросков по вратарям</div></div>
                <Switch checked={formData[`${prefix}_track_shots`]} onChange={(e) => handleChange(`${prefix}_track_shots`, e.target.checked)} disabled={isLocked} />
            </div>
        </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start animate-zoom-in relative min-h-[500px]">
      {/* ЛЕВЫЙ САЙДБАР */}
      <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-6">
        
        <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6 flex flex-col gap-4">
          <Select 
            label="Сезон"
            options={seasons.map(s => s.name)} 
            value={currSeasonName} 
            onChange={(name) => setSelectedSeasonId(seasons.find(s => s.name === name)?.id)} 
          />
          
          <Select
            label="Дивизион / Турнир"
            options={divOpts}
            value={selDivName}
            onChange={(name) => setSelectedDivisionId(divisions.find(d => d.name === name)?.id)}
            disabled={!selectedSeasonId || divisions.length === 0}
            placeholder="Выберите дивизион или турнир"
          />
        </div>

        {formData && (
            <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-3 flex flex-col gap-1">
                {menuItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={`flex items-center px-4 py-3 rounded-md transition-all duration-300 text-[14px] font-bold tracking-wide
                        ${activeSection === item.id 
                            ? 'bg-orange/10 text-orange' 
                            : 'text-graphite hover:bg-black/5 hover:text-orange'
                        }`}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        )}

        {/* У плей-офф и номинаций своё сохранение — общая кнопка формы дивизиона там лишняя */}
        {formData && canEdit && activeSection !== 'playoff' && activeSection !== 'nominations' && (
            <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-4">
                <Button 
                    onClick={handleSave} 
                    isLoading={isSaving} 
                    disabled={!isFormValid() || !isDirty()}
                    className="w-full py-3"
                >
                    {isCreatingNew ? `Создать ${entityNom}` : 'Сохранить настройки'}
                </Button>
                {(!isDirty() && !isCreatingNew) && <div className="text-[11px] text-center text-graphite-light mt-2 font-medium">Нет несохраненных изменений</div>}
            </div>
        )}
      </div>

      {/* ПРАВЫЙ КОНТЕНТ */}
      <div className="flex-1 w-full bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6 md:p-8 min-h-[500px] relative">
        
        {isLoading && (
            <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
                <Loader text="" />
            </div>
        )}

        {!formData && !isLoading && selectedSeasonId && divisions.length === 0 && (
            <div className="text-center py-20 text-graphite-light font-medium text-[15px]">
                В этом сезоне еще нет созданных дивизионов или турниров.<br/>
                {canCreate ? 'Нажмите «+ Новый дивизион» или «+ Новый турнир» в шапке, чтобы создать первый.' : 'Ожидайте создания дивизионов и турниров администраторами.'}
            </div>
        )}

        {formData && !isLoading && (
            <div className="flex flex-col gap-6 font-sans animate-zoom-in">
                
                {isLocked && !isCreatingNew && (
                    <div className="mb-2">
                        <AccessFallback variant="readonly" message={`У вас нет прав для редактирования настроек ${entityGen}. Вы находитесь в режиме просмотра.`} />
                    </div>
                )}

                <div className="border-b border-graphite/10 pb-4 mb-2 flex items-center justify-between gap-4">
                    <h2 className="text-[18px] font-black text-graphite uppercase tracking-wider">
                        {menuItems.find(m => m.id === activeSection)?.label}
                    </h2>
                    <span className={`shrink-0 text-[11px] font-normal px-2 py-1 rounded uppercase tracking-wide ${isTournamentEntity ? 'bg-blue-500/10 text-blue-600' : 'bg-orange/10 text-orange'}`}>
                        {isTournamentEntity ? 'Турнир' : 'Дивизион'}
                    </span>
                </div>

                {/* РАЗДЕЛ 1: ОБЩАЯ ИНФОРМАЦИЯ */}
                {activeSection === 'general' && (
                    <div className="flex flex-col gap-8 animate-zoom-in max-w-4xl">
                        <div className="bg-white/70 p-6 rounded-md border border-graphite/10 flex flex-col gap-5">
                            <span className="text-[14px] font-bold text-graphite uppercase tracking-wider mb-1">Основные данные</span>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <Input label="Полное название*" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} disabled={isLocked} />
                                <Input label={`Классификация ${entityGen}`} placeholder="Например: Любитель, Мастер, Юноши" value={formData.classification || ''} onChange={(e) => handleChange('classification', e.target.value)} disabled={isLocked} />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <Input label="Короткое название*" value={formData.short_name} onChange={(e) => handleChange('short_name', e.target.value)} disabled={isLocked} />
                                <Select label="Тип турнира*" options={TYPE_OPTIONS} value={formData.tournament_type} onChange={(val) => handleChange('tournament_type', val)} disabled={isLocked} />
                            </div>
                            <div className="flex flex-col w-full mt-2">
                                <label className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Описание (необязательно)</label>
                                <textarea value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} disabled={isLocked} className="w-full min-h-[110px] px-4 py-3 border border-graphite/20 rounded-md bg-white/50 text-graphite text-[13px] outline-none focus:border-orange focus:bg-white resize-none disabled:opacity-60 transition-colors" placeholder={`Введите краткое описание или особенности ${entityGen}...`} />
                            </div>
                        </div>

                        <div className="bg-white/70 p-6 rounded-md border border-graphite/10 flex flex-col gap-5">
                            <span className="text-[14px] font-bold text-graphite uppercase tracking-wider mb-1">Логотип и регламент</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <Uploader label={`Логотип ${entityGen}`} heightClass="h-[220px]" accept=".jpg,.png,.webp" initialUrl={formData.logo_url && !logoCleared ? getImageUrl(formData.logo_url) : null} onFileSelect={(f, isClear) => { if (!isLocked) { setLogoFile(f); setLogoCleared(isClear); }}} emptyImage="/img/Logo_division_default.webp" />
                                </div>
                                <div>
                                    <Uploader label="Документ регламента" heightClass="h-[220px]" accept=".pdf,.doc,.docx" isDefaultPreview={true} mockText="Загрузить файл (PDF, DOC)" initialUrl={formData.regulations_url && !regCleared ? getImageUrl(formData.regulations_url) : null} onFileSelect={(f, isClear) => { if (!isLocked) { setRegFile(f); setRegCleared(isClear); }}} />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* РАЗДЕЛ 2: СРОКИ И ЗАЯВКИ */}
                {activeSection === 'dates' && (
                    <div className="flex flex-col gap-8 animate-zoom-in">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white/70 p-5 rounded-md border border-graphite/10 flex flex-col gap-4">
                                <span className="text-[14px] font-bold text-graphite uppercase">Сроки {entityGen}*</span>
                                <DatePicker placeholder="Старт" value={formData.start_date} onChange={(val) => handleChange('start_date', val)} disabled={isLocked} />
                                <DatePicker placeholder="Конец" value={formData.end_date} onChange={(val) => handleChange('end_date', val)} disabled={isLocked} />
                            </div>
                            <div className="bg-white/70 p-5 rounded-md border border-graphite/10 flex flex-col gap-4">
                                <span className="text-[14px] font-bold text-graphite uppercase">Заявки*</span>
                                <DatePicker placeholder="Старт" value={formData.application_start} onChange={(val) => handleChange('application_start', val)} disabled={isLocked} />
                                <DatePicker placeholder="Конец" value={formData.application_end} onChange={(val) => handleChange('application_end', val)} disabled={isLocked} />
                                <span className="text-[11px] text-graphite-light leading-tight">Считается по МСК (00:00–23:59)</span>
                            </div>
                            <div className="bg-white/70 p-5 rounded-md border border-graphite/10 flex flex-col gap-4">
                                <span className="text-[14px] font-bold text-graphite uppercase">Трансферы</span>
                                <DatePicker placeholder="Старт" value={formData.transfer_start} onChange={(val) => handleChange('transfer_start', val)} disabled={isLocked} />
                                <DatePicker placeholder="Конец" value={formData.transfer_end} onChange={(val) => handleChange('transfer_end', val)} disabled={isLocked} />
                                <span className="text-[11px] text-graphite-light leading-tight">Считается по МСК (00:00–23:59)</span>
                            </div>
                        </div>

                        {isOverlap() && (
                            <div className="p-4 bg-status-rejected/10 border border-status-rejected/20 rounded-md text-[13px] font-bold text-status-rejected text-center">
                                Периоды заявочной кампании и трансферного окна не могут пересекаться!
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="p-4 bg-white/70 rounded-md border border-graphite/10 flex flex-col gap-3 justify-between">
                                <div><div className="font-bold text-graphite uppercase text-[12px]">Только цифровые</div><div className="text-[11px] text-graphite-light mt-1 leading-tight">Без загрузки скана заявочного листа.</div></div>
                                <Switch checked={formData.digital_applications_only} onChange={(e) => handleChange('digital_applications_only', e.target.checked)} disabled={isLocked} />
                            </div>
                            <div className="p-4 bg-white/70 rounded-md border border-graphite/10 flex flex-col gap-3 justify-between">
                                <div><div className="font-bold text-graphite uppercase text-[12px]">Мед. справка</div><div className="text-[11px] text-graphite-light mt-1 leading-tight">Требовать медицинскую справку.</div></div>
                                <Switch checked={formData.req_med_cert} onChange={(e) => handleChange('req_med_cert', e.target.checked)} disabled={isLocked} />
                            </div>
                            <div className="p-4 bg-white/70 rounded-md border border-graphite/10 flex flex-col gap-3 justify-between">
                                <div><div className="font-bold text-graphite uppercase text-[12px]">Страховка</div><div className="text-[11px] text-graphite-light mt-1 leading-tight">Требовать полис страхования.</div></div>
                                <Switch checked={formData.req_insurance} onChange={(e) => handleChange('req_insurance', e.target.checked)} disabled={isLocked} />
                            </div>
                            <div className="p-4 bg-white/70 rounded-md border border-graphite/10 flex flex-col gap-3 justify-between">
                                <div><div className="font-bold text-graphite uppercase text-[12px]">Согласие игрока</div><div className="text-[11px] text-graphite-light mt-1 leading-tight">Требовать согласие на обработку ПДн.</div></div>
                                <Switch checked={formData.req_consent} onChange={(e) => handleChange('req_consent', e.target.checked)} disabled={isLocked} />
                            </div>
                            <div className="p-4 bg-white/70 rounded-md border border-graphite/10 flex flex-col gap-3 justify-between">
                                <div><div className="font-bold text-graphite uppercase text-[12px]">Скрывать статистику</div><div className="text-[11px] text-graphite-light mt-1 leading-tight">Скрывать статистику игрока без отметки об оплате взноса (в TR).</div></div>
                                <Switch checked={formData.hide_stats_unpaid} onChange={(e) => handleChange('hide_stats_unpaid', e.target.checked)} disabled={isLocked} />
                            </div>
                            <div className="p-4 bg-white/70 rounded-md border border-graphite/10 flex flex-col gap-3 justify-between">
                                <div><div className="font-bold text-graphite uppercase text-[12px]">Индивидуальный взнос</div><div className="text-[11px] text-graphite-light mt-1 leading-tight">Сумма взноса для игрока, ₽.</div></div>
                                <div className="relative">
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        placeholder="0"
                                        value={formData.individual_fee}
                                        onChange={(e) => handleChange('individual_fee', e.target.value.replace(/\D/g, ''))}
                                        disabled={isLocked}
                                        className="w-full pl-3 pr-7 py-2 rounded-md border border-graphite/40 bg-white/70 text-graphite text-[13px] font-bold outline-none transition-all duration-300 focus:border-orange focus:shadow-[0_0_0_3px_rgba(255,122,0,0.2)] disabled:opacity-60 disabled:cursor-not-allowed"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-bold text-graphite-light pointer-events-none">₽</span>
                                </div>
                            </div>
                        </div>

                        {/* Квалификация принадлежит человеку в лиге целиком, а дивизион решает,
                            кого из них к себе допускает. Отдельного тумблера нет: пустой список
                            и означает «без ограничений», отмеченный — «пускаем только этих».
                            «Без квалификации» — такой же пункт списка, как МАСТЕР или ЛЮБИТЕЛЬ. */}
                        <div className="bg-white/70 p-5 rounded-md border border-graphite/10 flex flex-col gap-4">
                            <div>
                                <div className="font-bold text-graphite uppercase text-[14px]">Допуск по квалификациям</div>
                                <div className="text-[11px] text-graphite-light mt-1 leading-tight max-w-[620px]">
                                    Отметьте, кого можно заявить в этот {entityNom}. Если не отмечено ничего — ограничений нет, проходит любой игрок. Проверка срабатывает при добавлении игрока, отправке заявки и её одобрении: уже заявленных смена настроек из турнира не выкидывает.
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 pt-3 border-t border-graphite/10">
                                {leagueQuals.length === 0 && (
                                    <span className="text-[12px] text-graphite-light">В лиге пока не создано ни одной квалификации — добавьте их на вкладке «Квалификации».</span>
                                )}

                                <Checkbox
                                    className="mb-0"
                                    label="Без квалификации (кому ещё не присвоена)"
                                    checked={(formData.qualification_ids || []).some(id => id === null)}
                                    onChange={() => !isLocked && toggleQualification(null)}
                                />

                                {leagueQuals.map(qual => (
                                    <Checkbox
                                        key={qual.id}
                                        className="mb-0"
                                        label={`${qual.name}${qual.short_name ? ` (${qual.short_name})` : ''}`}
                                        checked={(formData.qualification_ids || []).some(id => id === qual.id)}
                                        onChange={() => !isLocked && toggleQualification(qual.id)}
                                    />
                                ))}

                                <span className="text-[11px] text-graphite-light mt-1 leading-tight">
                                    {(formData.qualification_ids || []).length === 0
                                        ? 'Сейчас ограничений нет — заявить можно любого игрока.'
                                        : 'Игроки с неотмеченными квалификациями в заявку не пройдут.'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}

                {/* РАЗДЕЛ 3: МЕХАНИКА МАТЧА */}
                {activeSection === 'mechanics' && (
                    <div className="flex flex-col gap-6 animate-zoom-in">
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {showRegular && renderMechanicsBlock('reg', 'Регулярный чемпионат')}
                            {showPlayoff && renderMechanicsBlock('playoff', 'Плей-офф')}
                        </div>

                        {/* Отдельным блоком, а не внутри reg/playoff: флаг один на дивизион */}
                        <div className="bg-white/70 p-5 rounded-md border border-graphite/10 flex justify-between items-center gap-4">
                            <div>
                                <div className="text-[13px] font-semibold text-graphite">Вести контроль таймера и его корректировок</div>
                                <div className="text-[11px] text-graphite-light mt-0.5 leading-tight max-w-[640px]">
                                    Записывает каждый старт и стоп таймера, каждую корректировку кнопками, ручной ввод времени
                                    и смену периода — с реальным временем на устройстве секретаря. Журнал по каждому матчу
                                    скачивается в панели секретаря, в шторке «Настройки матча».
                                </div>
                            </div>
                            <Switch
                                checked={formData.track_timer_log}
                                onChange={(e) => handleChange('track_timer_log', e.target.checked)}
                                disabled={isLocked}
                            />
                        </div>
                    </div>
                )}

                {/* РАЗДЕЛ 4: РЕГУЛЯРНЫЙ ЧЕМПИОНАТ */}
                {activeSection === 'regular' && showRegular && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-zoom-in">
                        <div className="flex flex-col gap-6">
                            <div className="bg-white/70 p-6 rounded-md border border-graphite/10 flex flex-col gap-4">
                                <span className="text-[15px] font-bold text-graphite mb-2 uppercase">Начисление очков</span>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Победа в осн. время</span> <Stepper initialValue={formData.points_win_reg} onChange={(v) => handleChange('points_win_reg', v)} max={10} disabled={isLocked} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Победа в ОТ / Буллиты</span> <Stepper initialValue={formData.points_win_ot} onChange={(v) => handleChange('points_win_ot', v)} max={10} disabled={isLocked} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Ничья</span> <Stepper initialValue={formData.points_draw} onChange={(v) => handleChange('points_draw', v)} max={10} disabled={isLocked} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Поражение в ОТ / Буллиты</span> <Stepper initialValue={formData.points_loss_ot} onChange={(v) => handleChange('points_loss_ot', v)} max={10} disabled={isLocked} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Поражение в осн. время</span> <Stepper initialValue={formData.points_loss_reg} onChange={(v) => handleChange('points_loss_reg', v)} max={10} disabled={isLocked} /></div>
                            </div>
                            <div className="bg-status-rejected/5 p-6 rounded-md border border-status-rejected/20 flex flex-col gap-4">
                                <span className="text-[15px] font-bold text-status-rejected mb-2 uppercase">Технические результаты</span>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Техническая победа (+/-)</span> <Stepper initialValue={formData.points_tech_win} onChange={(v) => handleChange('points_tech_win', v)} max={10} disabled={isLocked} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Техническое поражение (-/+)</span> <Stepper initialValue={formData.points_tech_loss} onChange={(v) => handleChange('points_tech_loss', v)} max={10} disabled={isLocked} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Обоюдное поражение (-/-)</span> <Stepper initialValue={formData.points_tech_draw} onChange={(v) => handleChange('points_tech_draw', v)} max={10} disabled={isLocked} /></div>
                            </div>
                        </div>
                        
                        {/* Приоритет при равенстве очков: активные критерии + стек исключённых (Drag-and-Drop, Мышь + Тач) */}
                        <div className="flex flex-col gap-4">
                            <div className="bg-white/70 p-6 rounded-md border border-graphite/10 flex flex-col gap-4 relative z-50">
                                <span className="text-[15px] font-bold text-graphite mb-1 uppercase">Приоритет при равенстве очков</span>
                                <div
                                    data-dnd-zone="active"
                                    onDragOver={(e) => e.preventDefault()}
                                    onDragEnter={() => handleDragEnterActive(null, null)}
                                    className="flex flex-col gap-1 min-h-[40px]"
                                >
                                    {formData.ranking_criteria.map((id, index) => {
                                        const def = CRITERIA_BY_ID[id];
                                        if (!def) return null;
                                        return (
                                            <div
                                                key={id}
                                                data-dnd-id={id}
                                                data-dnd-zone="active"
                                                draggable={!isLocked}
                                                onDragStart={(e) => handleDragStart(e, id)}
                                                onDragEnter={(e) => { e.stopPropagation(); handleDragEnterActive(e, id); }}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={(e) => e.preventDefault()}
                                                onTouchStart={(e) => !isLocked && handleTouchStart(e, id)}
                                                onTouchMove={(e) => !isLocked && handleTouchMove(e)}
                                                onTouchEnd={() => !isLocked && handleTouchEnd()}
                                                className={`flex items-center gap-3 p-3 rounded-md border transition-all duration-200
                                                    ${isLocked
                                                        ? 'bg-white/50 border-graphite/5 opacity-70 cursor-not-allowed'
                                                        : 'bg-white border-graphite/10 shadow-sm cursor-grab active:cursor-grabbing hover:border-orange hover:shadow-md touch-none'
                                                    }
                                                    ${draggingCriterionId === id ? 'opacity-40 scale-[0.98] ring-1 ring-orange shadow-lg' : ''}
                                                `}
                                            >
                                                <span className="w-8 h-8 bg-graphite text-white rounded-lg flex justify-center items-center text-[13px] font-bold shrink-0">
                                                    {index + 1}
                                                </span>
                                                <span className="text-[13px] font-semibold text-graphite flex-1">
                                                    {def.label}
                                                </span>
                                                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                                    def.tag === 'очные' ? 'bg-orange/10 text-orange'
                                                    : def.tag === 'сезон' ? 'bg-emerald-500/10 text-emerald-600'
                                                    : 'bg-purple-500/10 text-purple-600'
                                                }`}>
                                                    {def.tag}
                                                </span>

                                                {!isLocked && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFromActive(id)}
                                                        className="text-graphite-light hover:text-status-rejected transition-colors text-[16px] leading-none px-1 shrink-0"
                                                        aria-label="Исключить критерий"
                                                    >
                                                        &times;
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                                {!isLocked && (
                                    <div className="text-[11px] text-graphite-light mt-1 text-center">
                                        Перетащите, чтобы изменить приоритет, или нажмите &times;, чтобы исключить критерий
                                    </div>
                                )}
                            </div>

                            <div
                                data-dnd-zone="stack"
                                onDragOver={(e) => e.preventDefault()}
                                onDragEnter={handleDragEnterStack}
                                className="p-5 rounded-md border border-dashed border-graphite/20 bg-graphite/[0.03] flex flex-col gap-3"
                            >
                                <div>
                                    <span className="text-[12px] font-bold text-graphite-light uppercase tracking-wide">Неактивные критерии</span>
                                    {!isLocked && <div className="text-[11px] text-graphite-light/80 mt-0.5">Перетащите плашку наверх, чтобы включить её в сортировку</div>}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {ALL_CRITERIA_IDS.filter(id => !formData.ranking_criteria.includes(id)).map(id => {
                                        const def = CRITERIA_BY_ID[id];
                                        return (
                                            <div
                                                key={id}
                                                data-dnd-id={id}
                                                data-dnd-zone="stack"
                                                draggable={!isLocked}
                                                onDragStart={(e) => handleDragStart(e, id)}
                                                onDragEnter={handleDragEnterStack}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={(e) => e.preventDefault()}
                                                onClick={() => !isLocked && addToActive(id)}
                                                onTouchStart={(e) => !isLocked && handleTouchStart(e, id)}
                                                onTouchMove={(e) => !isLocked && handleTouchMove(e)}
                                                onTouchEnd={() => !isLocked && handleTouchEnd()}
                                                className={`flex items-center gap-2 px-3 py-2 rounded-full border transition-all duration-200
                                                    ${isLocked
                                                        ? 'bg-white/40 border-graphite/10 opacity-60 cursor-not-allowed'
                                                        : 'bg-white border-graphite/15 cursor-grab hover:border-orange'
                                                    }
                                                    ${draggingCriterionId === id ? 'opacity-40 scale-[0.98] ring-1 ring-orange' : ''}
                                                `}
                                            >
                                                <span className="text-[12px] font-semibold text-graphite-light">{def.label}</span>
                                                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                                    def.tag === 'очные' ? 'bg-orange/10 text-orange'
                                                    : def.tag === 'сезон' ? 'bg-emerald-500/10 text-emerald-600'
                                                    : 'bg-purple-500/10 text-purple-600'
                                                }`}>
                                                    {def.tag}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {ALL_CRITERIA_IDS.filter(id => !formData.ranking_criteria.includes(id)).length === 0 && (
                                        <span className="text-[12px] text-graphite-light/60 italic">Все критерии активны</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* РАЗДЕЛ 5: ПЛЕЙ-ОФФ */}
                {activeSection === 'playoff' && showPlayoff && (
                    <div className="animate-zoom-in w-full h-full">
                        {isCreatingNew ? (
                            <div className="text-center bg-white/40 border border-dashed border-graphite/20 rounded-md text-graphite-light py-12 px-6">
                                Сначала создайте и сохраните {entityNom}, чтобы настроить для него сетки плей-офф.
                            </div>
                        ) : (
                            <PlayoffSummary divisionId={formData.id} canEditPlayoff={canEditPlayoff} />
                        )}
                    </div>
                )}

                {/* РАЗДЕЛ 6: НОМИНАЦИИ */}
                {activeSection === 'nominations' && canViewNominations && (
                    <div className="animate-zoom-in w-full h-full">
                        {isCreatingNew ? (
                            <div className="text-center bg-white/40 border border-dashed border-graphite/20 rounded-md text-graphite-light py-12 px-6">
                                Сначала создайте и сохраните {entityNom}, чтобы настроить для него номинации.
                            </div>
                        ) : (
                            <NominationsSection
                                divisionId={formData.id}
                                canManage={canManageNominations}
                                setToast={setToast}
                            />
                        )}
                    </div>
                )}

                {/* РАЗДЕЛ 7: РЕЗЕРВНЫЕ ВРАТАРИ */}
                {activeSection === 'reserve_goalies' && canViewReserveGoalies && (
                    <div className="animate-zoom-in w-full h-full">
                        {isCreatingNew ? (
                            <div className="text-center bg-white/40 border border-dashed border-graphite/20 rounded-md text-graphite-light py-12 px-6">
                                Сначала создайте и сохраните {entityNom}, чтобы собрать для него список резервных вратарей.
                            </div>
                        ) : (
                            /* Список правится сразу, а два правила — часть формы дивизиона
                               и уходят общей кнопкой «Сохранить настройки» слева */
                            <ReserveGoaliesSection
                                divisionId={formData.id}
                                canManage={canManageReserveGoalies}
                                setToast={setToast}
                                formData={formData}
                                onChange={handleChange}
                                isLocked={isLocked}
                            />
                        )}
                    </div>
                )}

            </div>
        )}
      </div>
    </div>
  );
}