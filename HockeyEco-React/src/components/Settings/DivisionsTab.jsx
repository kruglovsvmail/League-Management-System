import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAccess } from '../../hooks/useAccess';
import { Select } from '../../ui/Select';
import { Input } from '../../ui/Input';
import { Stepper } from '../../ui/Stepper';
import { Switch } from '../../ui/Switch';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { DatePicker } from '../../ui/DatePicker';
import { Uploader } from '../../ui/Uploader';
import { getToken, getImageUrl } from '../../utils/helpers';

import { PlayoffStructureView } from './PlayoffStructureView';

const TYPE_OPTIONS = ['Регулярный чемпионат', 'Плей-офф', 'Регулярный + Плей-офф'];
const TYPE_MAP = { 'Регулярный чемпионат': 'regular', 'Плей-офф': 'playoff', 'Регулярный + Плей-офф': 'mixed' };
const REV_TYPE_MAP = { 'regular': 'Регулярный чемпионат', 'playoff': 'Плей-офф', 'mixed': 'Регулярный + Плей-офф' };

const CRITERIA_OPTIONS = ['Очные встречи', 'Разница шайб', 'Заброшенные шайбы', 'Количество очков', 'Количество побед'];

const getInitialFormData = (div = null) => {
  if (div) {
    let parsedCriteria = CRITERIA_OPTIONS;
    try {
      if (div.ranking_criteria) {
        const parsed = typeof div.ranking_criteria === 'string' ? JSON.parse(div.ranking_criteria) : div.ranking_criteria;
        if (Array.isArray(parsed) && parsed.length === 5) parsedCriteria = parsed;
      }
    } catch (e) {}

    return {
      ...div,
      tournament_type: REV_TYPE_MAP[div.tournament_type] || 'Регулярный чемпионат',
      start_date: div.start_date ? div.start_date.split('T')[0] : null,
      end_date: div.end_date ? div.end_date.split('T')[0] : null,
      application_start: div.application_start ? div.application_start.split('T')[0] : null,
      application_end: div.application_end ? div.application_end.split('T')[0] : null,
      transfer_start: div.transfer_start ? div.transfer_start.split('T')[0] : null,
      transfer_end: div.transfer_end ? div.transfer_end.split('T')[0] : null,
      ranking_criteria: parsedCriteria,
      
      // Flat Fields for Regular
      reg_periods_count: div.reg_periods_count ?? 3, 
      reg_period_length: div.reg_period_length ?? 20, 
      reg_has_overtime: div.reg_has_overtime ?? true, 
      reg_ot_length: div.reg_ot_length ?? 5, 
      reg_has_shootouts: div.reg_has_shootouts ?? true, 
      reg_so_length: div.reg_so_length ?? 3, 
      reg_track_plus_minus: div.reg_track_plus_minus ?? false,

      // Flat Fields for Playoff
      playoff_periods_count: div.playoff_periods_count ?? 3, 
      playoff_period_length: div.playoff_period_length ?? 20, 
      playoff_has_overtime: div.playoff_has_overtime ?? true, 
      playoff_ot_length: div.playoff_ot_length ?? 20, 
      playoff_has_shootouts: div.playoff_has_shootouts ?? false, 
      playoff_so_length: div.playoff_so_length ?? 0, 
      playoff_track_plus_minus: div.playoff_track_plus_minus ?? false,

      req_med_cert: div.req_med_cert ?? true, req_insurance: div.req_insurance ?? true, req_consent: div.req_consent ?? true, digital_applications_only: div.digital_applications_only ?? true,
      points_win_reg: div.points_win_reg ?? 2, points_win_ot: div.points_win_ot ?? 2, points_draw: div.points_draw ?? 1, points_loss_ot: div.points_loss_ot ?? 1, points_loss_reg: div.points_loss_reg ?? 0,
      points_tech_win: div.points_tech_win ?? 3, points_tech_loss: div.points_tech_loss ?? 0, points_tech_draw: div.points_tech_draw ?? 0,
    };
  }
  return {
    name: '', short_name: '', tournament_type: 'Регулярный чемпионат', description: '',
    start_date: null, end_date: null, application_start: null, application_end: null, transfer_start: null, transfer_end: null,
    
    reg_periods_count: 3, reg_period_length: 20, reg_has_overtime: true, reg_ot_length: 5, reg_has_shootouts: true, reg_so_length: 3, reg_track_plus_minus: false,
    playoff_periods_count: 3, playoff_period_length: 20, playoff_has_overtime: true, playoff_ot_length: 20, playoff_has_shootouts: false, playoff_so_length: 0, playoff_track_plus_minus: false,
    
    req_med_cert: true, req_insurance: true, req_consent: true, digital_applications_only: true,
    points_win_reg: 2, points_win_ot: 2, points_draw: 1, points_loss_ot: 1, points_loss_reg: 0,
    points_tech_win: 3, points_tech_loss: 0, points_tech_draw: 0,
    ranking_criteria: [...CRITERIA_OPTIONS],
  };
};

const PlayoffSummary = ({ divisionId }) => {
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

    if (isLoading) return <div className="py-10 flex justify-center"><Loader text="Загрузка структуры..." /></div>;

    return (
        <div className="flex flex-col gap-8 w-full animate-fade-in-down max-w-full">
            <div className="flex justify-between items-center bg-white/60 p-6 rounded-xl border border-graphite/10">
                <div className="flex flex-col">
                    <span className="text-[15px] font-bold text-graphite uppercase">Управление сетками</span>
                    <span className="text-[12px] text-graphite-light mt-1">Конструктор откроется в отдельном системном окне</span>
                </div>
                <Button onClick={openConstructorPopup} className="bg-graphite text-white hover:bg-black border-none px-6 shadow-lg">
                    Открыть конструктор
                </Button>
            </div>

            {brackets.length > 0 ? (
                <div className="flex flex-col gap-5">
                    <span className="text-[14px] font-bold text-graphite uppercase tracking-wider ml-1">Текущая структура</span>
                    <PlayoffStructureView brackets={brackets} />
                </div>
            ) : (
                 <div className="text-center bg-white/40 border border-dashed border-graphite/20 rounded-xl text-graphite-light py-12 px-6">
                    Плей-офф еще не настроен. Откройте конструктор, чтобы создать сетки.
                </div>
            )}
        </div>
    );
};

export function DivisionsTab({ setToast, setHeaderActions }) {
  const { user, selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  const canManageDivisions = checkAccess('MANAGE_DIVISIONS') || user?.globalRole === 'admin';

  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [originalData, setOriginalData] = useState(null);
  const [formData, setFormData] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [regFile, setRegFile] = useState(null);
  const [logoCleared, setLogoCleared] = useState(false);
  const [regCleared, setRegCleared] = useState(false);

  const [activeSection, setActiveSection] = useState('general');

  useEffect(() => { if (selectedLeague?.id) fetchSeasons(); }, [selectedLeague]);

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
    if (selectedSeasonId) fetchDivisions();
    else { setDivisions([]); setSelectedDivisionId(null); setFormData(null); setOriginalData(null); }
  }, [selectedSeasonId]);

  const fetchDivisions = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${selectedSeasonId}/divisions`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) {
        setDivisions(data.data);
        if (selectedDivisionId === 'new') return; 
        if (data.data.length > 0) setSelectedDivisionId(data.data[0].id);
        else setSelectedDivisionId(null);
      }
    } finally { setIsLoading(false); }
  };

  useEffect(() => {
    setLogoFile(null); setRegFile(null); setLogoCleared(false); setRegCleared(false);
    if (selectedDivisionId === 'new') {
      const initial = getInitialFormData();
      setFormData(initial);
      setOriginalData(initial);
      setActiveSection('general');
    } else if (selectedDivisionId) {
      const div = divisions.find(d => d.id === selectedDivisionId);
      const initial = getInitialFormData(div);
      setFormData(initial);
      setOriginalData(initial);
      setActiveSection('general');
    } else {
      setFormData(null);
      setOriginalData(null);
    }
  }, [selectedDivisionId, divisions]);

  useEffect(() => {
    if (setHeaderActions && canManageDivisions && selectedSeasonId) {
      const isCreatingNew = selectedDivisionId === 'new';
      const actionBtn = (
        <Button 
          onClick={() => {
            if (isCreatingNew) setSelectedDivisionId(divisions.length > 0 ? divisions[0].id : null);
            else setSelectedDivisionId('new');
          }} 
          className={isCreatingNew ? 'bg-white text-orange border border-orange hover:bg-orange/5' : ''}
        >
          {isCreatingNew ? 'Отменить создание' : '+ Новый дивизион'}
        </Button>
      );
      setHeaderActions(actionBtn);
    } else if (setHeaderActions) {
      setHeaderActions(null);
    }

    return () => {
        if (setHeaderActions) setHeaderActions(null);
    };
  }, [setHeaderActions, canManageDivisions, selectedSeasonId, selectedDivisionId, divisions]);

  const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));
  const handleCriteriaChange = (index, value) => {
    const newCriteria = [...formData.ranking_criteria];
    newCriteria[index] = value;
    handleChange('ranking_criteria', newCriteria);
  };

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

      setToast({ title: 'Успешно', message: isNew ? 'Дивизион создан' : 'Настройки сохранены', type: 'success' });
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

  const typeVal = TYPE_MAP[formData?.tournament_type];
  const showRegular = typeVal === 'regular' || typeVal === 'mixed';
  const showPlayoff = typeVal === 'playoff' || typeVal === 'mixed';

  const isLocked = !canManageDivisions;
  const isCreatingNew = selectedDivisionId === 'new';

  const currSeasonName = seasons.find(s => s.id === selectedSeasonId)?.name || '';
  const divOpts = divisions.map(d => d.name);
  const selDivName = isCreatingNew ? '' : (divisions.find(d => d.id === selectedDivisionId)?.name || '');

  const menuItems = [
    { id: 'general', label: 'Общая информация' },
    { id: 'dates', label: 'Сроки и заявки' },
    { id: 'mechanics', label: 'Механика матча' },
  ];
  if (showRegular) menuItems.push({ id: 'regular', label: 'Регулярный чемпионат' });
  if (showPlayoff) menuItems.push({ id: 'playoff', label: 'Плей-офф' });

  if (formData && !menuItems.find(m => m.id === activeSection)) {
    setActiveSection('general');
  }

  // --- Вспомогательный рендер для блоков механики (DRY) ---
  const renderMechanicsBlock = (prefix, title) => (
     <div className="bg-white/60 p-5 rounded-xl border border-graphite/10 flex flex-col gap-5">
        <span className="text-[14px] font-bold text-graphite uppercase tracking-wider">{title}</span>
        
        <div className="flex justify-between items-center gap-4 border-b border-graphite/5 pb-4">
            <div><div className="text-[13px] font-semibold text-graphite">Количество периодов</div><div className="text-[11px] text-graphite-light mt-0.5 leading-tight">Число периодов в матче</div></div>
            <Stepper initialValue={formData[`${prefix}_periods_count`]} onChange={(v) => handleChange(`${prefix}_periods_count`, v)} min={1} max={5} />
        </div>
        
        <div className="flex justify-between items-center gap-4 border-b border-graphite/5 pb-4">
            <div><div className="text-[13px] font-semibold text-graphite">Длина (мин)</div><div className="text-[11px] text-graphite-light mt-0.5 leading-tight">Длительность одного периода</div></div>
            <Stepper initialValue={formData[`${prefix}_period_length`]} onChange={(v) => handleChange(`${prefix}_period_length`, v)} min={5} max={60} />
        </div>

        <div className="flex flex-col gap-3 border-b border-graphite/5 pb-4">
            <div className="flex justify-between items-center gap-4">
                <div><div className="text-[13px] font-semibold text-graphite">Овертайм</div><div className="text-[11px] text-graphite-light mt-0.5 leading-tight">Доп. период при ничьей</div></div>
                <Switch checked={formData[`${prefix}_has_overtime`]} onChange={(e) => handleChange(`${prefix}_has_overtime`, e.target.checked)} disabled={isLocked} />
            </div>
            {formData[`${prefix}_has_overtime`] && (
                <div className="flex justify-between items-center gap-4 pt-2 animate-fade-in-down">
                    <div className="text-[12px] text-graphite-light font-semibold">Длительность ОТ (мин)</div>
                    <Stepper initialValue={formData[`${prefix}_ot_length`]} onChange={(v) => handleChange(`${prefix}_ot_length`, v)} min={1} max={30} />
                </div>
            )}
        </div>

        <div className="flex flex-col gap-3 border-b border-graphite/5 pb-4">
            <div className="flex justify-between items-center gap-4">
                <div><div className="text-[13px] font-semibold text-graphite">Буллиты</div><div className="text-[11px] text-graphite-light mt-0.5 leading-tight">Послематчевые броски</div></div>
                <Switch checked={formData[`${prefix}_has_shootouts`]} onChange={(e) => handleChange(`${prefix}_has_shootouts`, e.target.checked)} disabled={isLocked} />
            </div>
            {formData[`${prefix}_has_shootouts`] && (
                <div className="flex justify-between items-center gap-4 pt-2 animate-fade-in-down">
                    <div className="text-[12px] text-graphite-light font-semibold">Мин. бросков</div>
                    <Stepper initialValue={formData[`${prefix}_so_length`]} onChange={(v) => handleChange(`${prefix}_so_length`, v)} min={0} max={10} />
                </div>
            )}
        </div>

        <div className="flex justify-between items-center gap-4">
            <div><div className="text-[13px] font-semibold text-graphite">Считать (+/-)</div><div className="text-[11px] text-graphite-light mt-0.5 leading-tight">Учет полезности игроков</div></div>
            <Switch checked={formData[`${prefix}_track_plus_minus`]} onChange={(e) => handleChange(`${prefix}_track_plus_minus`, e.target.checked)} disabled={isLocked} />
        </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start animate-fade-in-down relative min-h-[500px]">
      {isLoading && <div className="absolute inset-0 z-30 flex items-start pt-20 justify-center pointer-events-none"><Loader text="Загрузка данных..." /></div>}

      {/* ЛЕВЫЙ САЙДБАР */}
      <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-6">
        
        <div className="bg-white/30 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-6 flex flex-col gap-4">
          <Select 
            label="Сезон"
            options={seasons.map(s => s.name)} 
            value={currSeasonName} 
            onChange={(name) => setSelectedSeasonId(seasons.find(s => s.name === name)?.id)} 
          />
          
          <Select 
            label="Дивизион"
            options={divOpts} 
            value={selDivName} 
            onChange={(name) => setSelectedDivisionId(divisions.find(d => d.name === name)?.id)} 
            disabled={!selectedSeasonId || divisions.length === 0} 
            placeholder="Выберите дивизион" 
          />
        </div>

        {formData && (
            <div className="bg-white/30 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-3 flex flex-col gap-1">
                {menuItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveSection(item.id)}
                        className={`flex items-center px-4 py-3 rounded-xl transition-all duration-300 text-[14px] font-bold tracking-wide
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

        {formData && canManageDivisions && !isLocked && activeSection !== 'playoff' && (
            <div className="bg-white/30 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-4">
                <Button 
                    onClick={handleSave} 
                    isLoading={isSaving} 
                    disabled={!isFormValid() || !isDirty()}
                    className="w-full py-3"
                >
                    {isCreatingNew ? 'Создать дивизион' : 'Сохранить настройки'}
                </Button>
                {(!isDirty() && !isCreatingNew) && <div className="text-[11px] text-center text-graphite-light mt-2 font-medium">Нет несохраненных изменений</div>}
            </div>
        )}
      </div>

      {/* ПРАВЫЙ КОНТЕНТ */}
      <div className="flex-1 w-full bg-white/30 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-6 md:p-8 min-h-[500px] relative">
        
        {!formData && !isLoading && selectedSeasonId && divisions.length === 0 && (
            <div className="text-center py-20 text-graphite-light font-medium text-[15px]">
                В этом сезоне еще нет созданных дивизионов.<br/>Нажмите «+ Новый дивизион» в шапке, чтобы создать первый.
            </div>
        )}

        {formData && !isLoading && (
            <div className="flex flex-col gap-6 font-sans animate-fade-in">
                
                {isLocked && !isCreatingNew && (
                    <div className="p-4 bg-graphite/5 border border-graphite/10 rounded-xl flex items-center gap-3 mb-2">
                        <div className="flex flex-col">
                            <span className="text-[13px] font-bold text-graphite">Режим только для чтения</span>
                            <span className="text-[12px] text-graphite-light">У вас нет прав для редактирования настроек дивизиона.</span>
                        </div>
                    </div>
                )}

                <div className="border-b border-graphite/10 pb-4 mb-2">
                    <h2 className="text-[20px] font-black text-graphite uppercase tracking-wider">
                        {menuItems.find(m => m.id === activeSection)?.label}
                    </h2>
                </div>

                {/* РАЗДЕЛ 1: ОБЩАЯ ИНФОРМАЦИЯ */}
                {activeSection === 'general' && (
                    <div className="flex flex-col gap-8 animate-fade-in-down max-w-4xl">
                        <div className="bg-white/60 p-6 rounded-xl border border-graphite/10 flex flex-col gap-5">
                            <span className="text-[14px] font-bold text-graphite uppercase tracking-wider mb-1">Основные данные</span>
                            <Input label="Полное название*" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} disabled={isLocked} />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <Input label="Короткое название*" value={formData.short_name} onChange={(e) => handleChange('short_name', e.target.value)} disabled={isLocked} />
                                <Select label="Тип турнира*" options={TYPE_OPTIONS} value={formData.tournament_type} onChange={(val) => handleChange('tournament_type', val)} disabled={isLocked} />
                            </div>
                            <div className="flex flex-col w-full mt-2">
                                <label className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Описание (необязательно)</label>
                                <textarea value={formData.description || ''} onChange={(e) => handleChange('description', e.target.value)} disabled={isLocked} className="w-full min-h-[110px] px-4 py-3 border border-graphite/20 rounded-xl bg-white/50 text-graphite text-[13px] outline-none focus:border-orange focus:bg-white resize-none disabled:opacity-60 transition-colors" placeholder="Введите краткое описание или особенности дивизиона..." />
                            </div>
                        </div>

                        <div className="bg-white/60 p-6 rounded-xl border border-graphite/10 flex flex-col gap-5">
                            <span className="text-[14px] font-bold text-graphite uppercase tracking-wider mb-1">Логотип и регламент</span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div>
                                    <Uploader label="Логотип дивизиона" heightClass="h-[220px]" accept=".jpg,.png,.webp" initialUrl={formData.logo_url && !logoCleared ? getImageUrl(formData.logo_url) : null} onFileSelect={(f, isClear) => { if (!isLocked) { setLogoFile(f); setLogoCleared(isClear); }}} emptyImage="/img/Logo_division_default.webp" />
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
                    <div className="flex flex-col gap-8 animate-fade-in-down">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white/60 p-5 rounded-xl border border-graphite/10 flex flex-col gap-4">
                                <span className="text-[14px] font-bold text-graphite uppercase">Сроки турнира*</span>
                                <DatePicker placeholder="Старт" value={formData.start_date} onChange={(val) => handleChange('start_date', val)} disabled={isLocked} />
                                <DatePicker placeholder="Конец" value={formData.end_date} onChange={(val) => handleChange('end_date', val)} disabled={isLocked} />
                            </div>
                            <div className="bg-white/60 p-5 rounded-xl border border-graphite/10 flex flex-col gap-4">
                                <span className="text-[14px] font-bold text-graphite uppercase">Заявки*</span>
                                <DatePicker placeholder="Старт" value={formData.application_start} onChange={(val) => handleChange('application_start', val)} disabled={isLocked} />
                                <DatePicker placeholder="Конец" value={formData.application_end} onChange={(val) => handleChange('application_end', val)} disabled={isLocked} />
                            </div>
                            <div className="bg-white/60 p-5 rounded-xl border border-graphite/10 flex flex-col gap-4">
                                <span className="text-[14px] font-bold text-graphite uppercase">Трансферы</span>
                                <DatePicker placeholder="Старт" value={formData.transfer_start} onChange={(val) => handleChange('transfer_start', val)} disabled={isLocked} />
                                <DatePicker placeholder="Конец" value={formData.transfer_end} onChange={(val) => handleChange('transfer_end', val)} disabled={isLocked} />
                            </div>
                        </div>

                        {isOverlap() && (
                            <div className="p-4 bg-status-rejected/10 border border-status-rejected/20 rounded-xl text-[13px] font-bold text-status-rejected text-center">
                                Периоды заявочной кампании и трансферного окна не могут пересекаться!
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="p-4 bg-white/60 rounded-xl border border-graphite/10 flex flex-col gap-3 justify-between">
                                <div><div className="font-bold text-graphite uppercase text-[12px]">Только цифровые</div><div className="text-[11px] text-graphite-light mt-1 leading-tight">Без загрузки скана заявочного листа.</div></div>
                                <Switch checked={formData.digital_applications_only} onChange={(e) => handleChange('digital_applications_only', e.target.checked)} disabled={isLocked} />
                            </div>
                            <div className="p-4 bg-white/60 rounded-xl border border-graphite/10 flex flex-col gap-3 justify-between">
                                <div><div className="font-bold text-graphite uppercase text-[12px]">Мед. справка</div><div className="text-[11px] text-graphite-light mt-1 leading-tight">Требовать медицинскую справку.</div></div>
                                <Switch checked={formData.req_med_cert} onChange={(e) => handleChange('req_med_cert', e.target.checked)} disabled={isLocked} />
                            </div>
                            <div className="p-4 bg-white/60 rounded-xl border border-graphite/10 flex flex-col gap-3 justify-between">
                                <div><div className="font-bold text-graphite uppercase text-[12px]">Страховка</div><div className="text-[11px] text-graphite-light mt-1 leading-tight">Требовать полис страхования.</div></div>
                                <Switch checked={formData.req_insurance} onChange={(e) => handleChange('req_insurance', e.target.checked)} disabled={isLocked} />
                            </div>
                            <div className="p-4 bg-white/60 rounded-xl border border-graphite/10 flex flex-col gap-3 justify-between">
                                <div><div className="font-bold text-graphite uppercase text-[12px]">Согласие игрока</div><div className="text-[11px] text-graphite-light mt-1 leading-tight">Требовать согласие на обработку ПДн.</div></div>
                                <Switch checked={formData.req_consent} onChange={(e) => handleChange('req_consent', e.target.checked)} disabled={isLocked} />
                            </div>
                        </div>
                    </div>
                )}

                {/* РАЗДЕЛ 3: МЕХАНИКА МАТЧА */}
                {activeSection === 'mechanics' && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-fade-in-down">
                        {showRegular && renderMechanicsBlock('reg', 'Регулярный чемпионат')}
                        {showPlayoff && renderMechanicsBlock('playoff', 'Плей-офф')}
                    </div>
                )}

                {/* РАЗДЕЛ 4: РЕГУЛЯРНЫЙ ЧЕМПИОНАТ */}
                {activeSection === 'regular' && showRegular && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in-down">
                        <div className="flex flex-col gap-6">
                            <div className="bg-white/60 p-6 rounded-xl border border-graphite/10 flex flex-col gap-4">
                                <span className="text-[15px] font-bold text-graphite mb-2 uppercase">Начисление очков</span>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Победа в осн. время</span> <Stepper initialValue={formData.points_win_reg} onChange={(v) => handleChange('points_win_reg', v)} max={10} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Победа в ОТ / Буллиты</span> <Stepper initialValue={formData.points_win_ot} onChange={(v) => handleChange('points_win_ot', v)} max={10} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Ничья</span> <Stepper initialValue={formData.points_draw} onChange={(v) => handleChange('points_draw', v)} max={10} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Поражение в ОТ / Буллиты</span> <Stepper initialValue={formData.points_loss_ot} onChange={(v) => handleChange('points_loss_ot', v)} max={10} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Поражение в осн. время</span> <Stepper initialValue={formData.points_loss_reg} onChange={(v) => handleChange('points_loss_reg', v)} max={10} /></div>
                            </div>
                            <div className="bg-status-rejected/5 p-6 rounded-xl border border-status-rejected/20 flex flex-col gap-4">
                                <span className="text-[15px] font-bold text-status-rejected mb-2 uppercase">Технические результаты</span>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Техническая победа (+/-)</span> <Stepper initialValue={formData.points_tech_win} onChange={(v) => handleChange('points_tech_win', v)} max={10} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Техническое поражение (-/+)</span> <Stepper initialValue={formData.points_tech_loss} onChange={(v) => handleChange('points_tech_loss', v)} max={10} /></div>
                                <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite">Обоюдное поражение (-/-)</span> <Stepper initialValue={formData.points_tech_draw} onChange={(v) => handleChange('points_tech_draw', v)} max={10} /></div>
                            </div>
                        </div>
                        <div className="bg-white/60 p-6 rounded-xl border border-graphite/10 flex flex-col gap-4 relative z-50">
                            <span className="text-[15px] font-bold text-graphite mb-2 uppercase">Приоритет при равенстве очков</span>
                            {[0, 1, 2, 3, 4].map(i => (
                                <div key={i} className="flex items-center gap-4">
                                    <span className="w-8 h-8 bg-graphite text-white rounded-lg flex justify-center items-center text-[13px] font-bold shrink-0">{i+1}</span>
                                    <Select options={CRITERIA_OPTIONS} value={formData.ranking_criteria[i]} onChange={(v) => handleCriteriaChange(i, v)} disabled={isLocked} />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* РАЗДЕЛ 5: ПЛЕЙ-ОФФ */}
                {activeSection === 'playoff' && showPlayoff && (
                    <div className="animate-fade-in-down w-full h-full">
                        {isCreatingNew ? (
                            <div className="text-center bg-white/40 border border-dashed border-graphite/20 rounded-xl text-graphite-light py-12 px-6">
                                Сначала создайте и сохраните дивизион, чтобы настроить для него сетки плей-офф.
                            </div>
                        ) : (
                            <PlayoffSummary divisionId={formData.id} />
                        )}
                    </div>
                )}

            </div>
        )}
      </div>
    </div>
  );
}