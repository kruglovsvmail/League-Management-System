import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Uploader } from '../ui/Uploader';
import { DatePicker } from '../ui/DatePicker';
import { Stepper } from '../ui/Stepper';
import { Switch } from '../ui/Switch';
import { getImageUrl, getToken } from '../utils/helpers';

const STEPS = ['Лого и название', 'Временные рамки', 'Настройки Регулярки', 'Настройки Плей-офф'];

const TYPE_OPTIONS = ['Регулярный чемпионат', 'Плей-офф', 'Регулярный + Плей-офф'];
const TYPE_MAP = { 'Регулярный чемпионат': 'regular', 'Плей-офф': 'playoff', 'Регулярный + Плей-офф': 'mixed' };
const REV_TYPE_MAP = { 'regular': 'Регулярный чемпионат', 'playoff': 'Плей-офф', 'mixed': 'Регулярный + Плей-офф' };

const ROUND_OPTIONS = ['1/8 Финала', '1/4 Финала', '1/2 Финала', 'Финал'];
const ROUND_MAP = { '1/8 Финала': '1/8', '1/4 Финала': '1/4', '1/2 Финала': '1/2', 'Финал': 'final' };
const REV_ROUND_MAP = { '1/8': '1/8 Финала', '1/4': '1/4 Финала', '1/2': '1/2 Финала', 'final': 'Финал' };

const CRITERIA_OPTIONS = [
  'Очные встречи', 
  'Разница шайб', 
  'Заброшенные шайбы', 
  'Количество очков', 
  'Количество побед'
];

// Функция для мгновенной инициализации данных (решает баг со Stepper'ами)
const getInitialFormData = (div) => {
  if (div) {
    let parsedCriteria = CRITERIA_OPTIONS;
    try {
      if (div.ranking_criteria) {
        const parsed = typeof div.ranking_criteria === 'string' ? JSON.parse(div.ranking_criteria) : div.ranking_criteria;
        if (Array.isArray(parsed) && parsed.length === 5) parsedCriteria = parsed;
      }
    } catch (e) {}

    return {
      name: div.name || '',
      short_name: div.short_name || '',
      tournament_type: REV_TYPE_MAP[div.tournament_type] || 'Регулярный чемпионат',
      description: div.description || '',
      
      start_date: div.start_date ? div.start_date.split('T')[0] : null,
      end_date: div.end_date ? div.end_date.split('T')[0] : null,
      application_start: div.application_start ? div.application_start.split('T')[0] : null,
      application_end: div.application_end ? div.application_end.split('T')[0] : null,
      transfer_start: div.transfer_start ? div.transfer_start.split('T')[0] : null,
      transfer_end: div.transfer_end ? div.transfer_end.split('T')[0] : null,

      points_win_reg: div.points_win_reg ?? 2,
      points_win_ot: div.points_win_ot ?? 2,
      points_draw: div.points_draw ?? 1,
      points_loss_ot: div.points_loss_ot ?? 1,
      points_loss_reg: div.points_loss_reg ?? 0,
      
      ranking_criteria: parsedCriteria,

      playoff_start_round: REV_ROUND_MAP[div.playoff_start_round] || '1/4 Финала',
      has_third_place: div.has_third_place || false,
      wins_needed_1_8: div.wins_needed_1_8 ?? 2,
      wins_needed_1_4: div.wins_needed_1_4 ?? 2,
      wins_needed_1_2: div.wins_needed_1_2 ?? 2,
      wins_needed_final: div.wins_needed_final ?? 2,
      wins_needed_3rd: div.wins_needed_3rd ?? 1
    };
  }
  
  return {
    name: '', short_name: '', tournament_type: 'Регулярный чемпионат', description: '',
    start_date: null, end_date: null, application_start: null, application_end: null, transfer_start: null, transfer_end: null,
    points_win_reg: 2, points_win_ot: 2, points_draw: 1, points_loss_ot: 1, points_loss_reg: 0,
    ranking_criteria: [CRITERIA_OPTIONS[0], CRITERIA_OPTIONS[1], CRITERIA_OPTIONS[2], CRITERIA_OPTIONS[3], CRITERIA_OPTIONS[4]],
    playoff_start_round: '1/4 Финала', has_third_place: false, wins_needed_1_8: 2, wins_needed_1_4: 2, wins_needed_1_2: 2, wins_needed_final: 2, wins_needed_3rd: 1
  };
};

export function DivisionSettingsModal({ isOpen, onClose, division, seasonId, onSuccess, setGlobalToast }) {
  const { user } = useOutletContext();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setAnimate(true), 10);
      return () => clearTimeout(timer);
    } else {
      setAnimate(false);
    }
  }, [isOpen]);

  // Файлы
  const [logoFile, setLogoFile] = useState(null);
  const [regFile, setRegFile] = useState(null);
  
  // Флаги сброса файлов
  const [logoCleared, setLogoCleared] = useState(false);
  const [regCleared, setRegCleared] = useState(false);

  // Стейт формы (теперь инициализируется мгновенно с правильными данными)
  const [formData, setFormData] = useState(() => getInitialFormData(division));

  // Проверка прав на редактирование
  const isAdmin = user?.globalRole === 'admin';
  const hasStarted = division?.start_date && new Date() >= new Date(division.start_date);
  const isLocked = !isAdmin && hasStarted;

  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialFormData(division));
      setLogoCleared(false);
      setRegCleared(false);
      setLogoFile(null);
      setRegFile(null);
      
      if (!division) {
        setCurrentStep(0);
      }
    }
  }, [isOpen, division]);

  const handleChange = (field, value) => {
    if (isLocked) return;
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCriteriaChange = (index, value) => {
    if (isLocked) return;
    const newCriteria = [...formData.ranking_criteria];
    newCriteria[index] = value;
    setFormData(prev => ({ ...prev, ranking_criteria: newCriteria }));
  };

  // ФУНКЦИЯ ПРОВЕРКИ ПЕРЕСЕЧЕНИЯ ДАТ ЗАЯВКИ И ТРАНСФЕРА
  const isOverlap = () => {
    const as = formData.application_start ? new Date(formData.application_start) : null;
    const ae = formData.application_end ? new Date(formData.application_end) : null;
    const ts = formData.transfer_start ? new Date(formData.transfer_start) : null;
    const te = formData.transfer_end ? new Date(formData.transfer_end) : null;

    if (as && ae && ts && te) {
      return (as <= te) && (ae >= ts);
    }
    return false;
  };

  // Валидация
  const isFormValid = () => {
    if (!formData.name || !formData.tournament_type) return false;
    if (!formData.start_date || !formData.end_date) return false;
    if (isOverlap()) return false;
    return true;
  };

  // Универсальная загрузка файлов
  const uploadFileS3 = async (divId, type, file) => {
    const fd = new FormData();
    fd.append('file', file);
    await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divId}/upload/${type}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: fd
    });
  };

  const handleSave = async () => {
    if (!isFormValid() || isLocked) return;
    setIsSaving(true);

    try {
      const payload = {
        ...formData,
        tournament_type: TYPE_MAP[formData.tournament_type],
        playoff_start_round: ROUND_MAP[formData.playoff_start_round],
        clear_logo: logoCleared,
        clear_regulations: regCleared
      };

      let divId = division?.id;
      let url = division ? `${import.meta.env.VITE_API_URL}/api/divisions/${divId}` : `${import.meta.env.VITE_API_URL}/api/seasons/${seasonId}/divisions`;
      let method = division ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (!data.success) throw new Error(data.error);

      if (!division) divId = data.id;

      if (logoFile) await uploadFileS3(divId, 'logo', logoFile);
      if (regFile) await uploadFileS3(divId, 'regulations', regFile);

      handleClose();
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 300);
    } catch (err) {
      setGlobalToast({ title: 'Ошибка', message: err.message || 'Сбой при сохранении', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setAnimate(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const typeVal = TYPE_MAP[formData.tournament_type];
  const hasRegular = typeVal === 'regular' || typeVal === 'mixed';
  const hasPlayoff = typeVal === 'playoff' || typeVal === 'mixed';

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${animate ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={handleClose}></div>
      <div className={`absolute top-0 right-0 h-full w-full max-w-[800px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${animate ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite uppercase tracking-wide">{division ? "Настройки дивизиона" : "Создание дивизиона"}</h2>
          <button onClick={handleClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6 custom-scrollbar flex flex-col">
          
          {isLocked && (
            <div className="mb-6 p-4 bg-status-rejected/10 border border-status-rejected/20 rounded-xl flex items-center gap-3 shrink-0">
              <svg className="w-6 h-6 text-status-rejected shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              <div className="flex flex-col">
                <span className="text-[13px] font-bold text-status-rejected">Редактирование заблокировано</span>
                <span className="text-[12px] text-status-rejected/70">Турнир уже стартовал. Только Админ LMS (admin) может менять настройки.</span>
              </div>
            </div>
          )}

          {/* ШАГИ (STEPPER) */}
          <div className="w-full max-w-[600px] mx-auto flex justify-between items-center mb-8 relative px-2 shrink-0">
            <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-[2px] bg-graphite/10 z-0"></div>
            {STEPS.map((step, idx) => {
              const isDisabledTab = (!hasRegular && idx === 2) || (!hasPlayoff && idx === 3);
              return (
                <div 
                  key={idx} 
                  onClick={() => !isDisabledTab && setCurrentStep(idx)}
                  className={`relative z-10 flex flex-col items-center gap-2 ${isDisabledTab ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} group`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold transition-colors duration-300 ${
                    currentStep === idx 
                      ? 'bg-orange text-white shadow-[0_0_0_4px_rgba(255,122,0,0.2)]' 
                      : 'bg-white border-2 border-graphite/20 text-graphite-light group-hover:border-orange/50'
                  }`}>
                    {idx + 1}
                  </div>
                  <span className={`text-[11px] font-bold uppercase tracking-wider absolute -bottom-6 whitespace-nowrap ${
                    currentStep === idx ? 'text-orange' : 'text-graphite-light'
                  }`}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex-1">
            {/* ШАГ 1: ЛОГО И НАЗВАНИЕ */}
            <div className={`transition-all duration-300 ${currentStep === 0 ? 'block animate-fade-in-down' : 'hidden'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Uploader 
                  label="Логотип дивизиона" heightClass="h-[210px]" accept=".jpg,.png,.webp"
                  initialUrl={division?.logo_url && !logoCleared ? getImageUrl(division.logo_url) : null}
                  onFileSelect={(f, isClear) => {
                    if (isLocked) return;
                    setLogoFile(f);
                    setLogoCleared(isClear);
                  }}
                  emptyImage="/img/Logo_division_default.webp"
                />
                <div className="flex flex-col gap-4">
                  <Input label="Полное название" placeholder="Например: Любитель 40+" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} />
                  <Input label="Короткое название" placeholder="ЛЮБ 40+" value={formData.short_name} onChange={(e) => handleChange('short_name', e.target.value)} />
                  <Select label="Тип турнира" options={TYPE_OPTIONS} value={formData.tournament_type} onChange={(val) => handleChange('tournament_type', val)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <Uploader 
                  label="Регламент (PDF, DOC)" heightClass="h-[150px]" accept=".pdf,.doc,.docx"
                  initialUrl={division?.regulations_url && !regCleared ? getImageUrl(division.regulations_url) : null}
                  onFileSelect={(f, isClear) => {
                    if (isLocked) return;
                    setRegFile(f);
                    setRegCleared(isClear);
                  }}
                  isDefaultPreview={true} mockText="Загрузить регламент"
                />
                <div className="flex flex-col w-full h-[150px]">
                  <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Описание (необязательно)</span>
                  <textarea 
                    value={formData.description} onChange={(e) => handleChange('description', e.target.value)} disabled={isLocked}
                    className="w-full flex-1 px-3 py-2.5 border border-graphite/40 rounded-md bg-white text-graphite text-[13px] font-medium outline-none focus:border-orange resize-none"
                  />
                </div>
              </div>
            </div>

            {/* ШАГ 2: ВРЕМЕННЫЕ РАМКИ */}
            <div className={`transition-all duration-300 ${currentStep === 1 ? 'block animate-fade-in-down' : 'hidden'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-bold text-graphite uppercase border-b border-graphite/10 pb-2 mb-2">Сроки проведения</span>
                  <div className="flex flex-col gap-4 relative z-[60]">
                    <DatePicker placeholder="Дата старта" value={formData.start_date} onChange={(val) => handleChange('start_date', val)} />
                    <DatePicker placeholder="Дата окончания" value={formData.end_date} onChange={(val) => handleChange('end_date', val)} />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[13px] font-bold text-graphite uppercase border-b border-graphite/10 pb-2 mb-2">Заявочная кампания</span>
                  <div className="flex flex-col gap-4 relative z-[50]">
                    <DatePicker placeholder="Начало заявок" value={formData.application_start} onChange={(val) => handleChange('application_start', val)} />
                    <DatePicker placeholder="Конец заявок" value={formData.application_end} onChange={(val) => handleChange('application_end', val)} />
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:col-span-2 mt-2">
                  <span className="text-[13px] font-bold text-graphite uppercase border-b border-graphite/10 pb-2 mb-2">Трансферное окно (дозаявки)</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-[40]">
                    <DatePicker placeholder="Старт трансферов" value={formData.transfer_start} onChange={(val) => handleChange('transfer_start', val)} />
                    <DatePicker placeholder="Конец трансферов" value={formData.transfer_end} onChange={(val) => handleChange('transfer_end', val)} />
                  </div>
                  
                  {/* СООБЩЕНИЕ ОБ ОШИБКЕ ПЕРЕСЕЧЕНИЯ ДАТ */}
                  {isOverlap() && (
                    <div className="md:col-span-2 mt-2 p-3 bg-status-rejected/10 border border-status-rejected/20 rounded-xl text-[12px] font-bold text-status-rejected text-center">
                      Периоды заявочной кампании и трансферного окна не могут пересекаться!
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ШАГ 3: РЕГУЛЯРКА */}
            <div className={`transition-all duration-300 ${currentStep === 2 ? 'block animate-fade-in-down' : 'hidden'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-4 bg-white/50 p-5 rounded-xl border border-graphite/10">
                  <span className="text-[14px] font-bold text-graphite uppercase mb-2">Начисление очков</span>
                  <div className="flex justify-between items-center"><span className="text-[13px] font-semibold">Победа в осн. время</span> <Stepper value={formData.points_win_reg} initialValue={formData.points_win_reg} onChange={(v) => handleChange('points_win_reg', v)} min={0} max={10} /></div>
                  <div className="flex justify-between items-center"><span className="text-[13px] font-semibold">Победа в ОТ / Буллиты</span> <Stepper value={formData.points_win_ot} initialValue={formData.points_win_ot} onChange={(v) => handleChange('points_win_ot', v)} min={0} max={10} /></div>
                  <div className="flex justify-between items-center"><span className="text-[13px] font-semibold">Ничья</span> <Stepper value={formData.points_draw} initialValue={formData.points_draw} onChange={(v) => handleChange('points_draw', v)} min={0} max={10} /></div>
                  <div className="flex justify-between items-center"><span className="text-[13px] font-semibold">Поражение в ОТ / Буллиты</span> <Stepper value={formData.points_loss_ot} initialValue={formData.points_loss_ot} onChange={(v) => handleChange('points_loss_ot', v)} min={0} max={10} /></div>
                  <div className="flex justify-between items-center"><span className="text-[13px] font-semibold">Поражение в осн. время</span> <Stepper value={formData.points_loss_reg} initialValue={formData.points_loss_reg} onChange={(v) => handleChange('points_loss_reg', v)} min={0} max={10} /></div>
                </div>
                
                <div className="flex flex-col gap-4 bg-white/50 p-5 rounded-xl border border-graphite/10 relative z-50">
                  <span className="text-[14px] font-bold text-graphite uppercase mb-2">Приоритет при равенстве очков</span>
                  {[1, 2, 3, 4, 5].map((num, i) => (
                    <div key={num} className="flex items-center gap-3">
                      <span className="w-5 h-5 bg-graphite text-white rounded-full flex justify-center items-center text-[10px] font-bold shrink-0">{num}</span>
                      <Select options={CRITERIA_OPTIONS} value={formData.ranking_criteria[i]} onChange={(v) => handleCriteriaChange(i, v)} placeholder={`Критерий ${num}`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ШАГ 4: ПЛЕЙ-ОФФ */}
            <div className={`transition-all duration-300 ${currentStep === 3 ? 'block animate-fade-in-down' : 'hidden'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-6">
                  <div className="bg-white/50 p-5 rounded-xl border border-graphite/10 flex flex-col gap-4 relative z-50">
                    <Select label="Стадия старта Плей-офф" options={ROUND_OPTIONS} value={formData.playoff_start_round} onChange={(v) => handleChange('playoff_start_round', v)} />
                  </div>
                  <div className="bg-white/50 p-5 rounded-xl border border-graphite/10 flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[14px] font-bold text-graphite uppercase">Матч за 3-е место</span>
                      <span className="text-[11px] text-graphite-light font-medium">Проводить игру между проигравшими в 1/2</span>
                    </div>
                    <Switch checked={formData.has_third_place} onChange={(e) => handleChange('has_third_place', e.target.checked)} />
                  </div>
                </div>

                <div className="flex flex-col gap-4 bg-white/50 p-5 rounded-xl border border-graphite/10">
                  <span className="text-[14px] font-bold text-graphite uppercase mb-2">Побед в серии до</span>
                  <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite-light">1/8 Финала</span> <Stepper value={formData.wins_needed_1_8} initialValue={formData.wins_needed_1_8} onChange={(v) => handleChange('wins_needed_1_8', v)} min={1} max={7} /></div>
                  <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite-light">1/4 Финала</span> <Stepper value={formData.wins_needed_1_4} initialValue={formData.wins_needed_1_4} onChange={(v) => handleChange('wins_needed_1_4', v)} min={1} max={7} /></div>
                  <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite-light">1/2 Финала</span> <Stepper value={formData.wins_needed_1_2} initialValue={formData.wins_needed_1_2} onChange={(v) => handleChange('wins_needed_1_2', v)} min={1} max={7} /></div>
                  <div className="flex justify-between items-center"><span className="text-[13px] font-semibold text-graphite-light">Финал</span> <Stepper value={formData.wins_needed_final} initialValue={formData.wins_needed_final} onChange={(v) => handleChange('wins_needed_final', v)} min={1} max={7} /></div>
                  {formData.has_third_place && (
                    <div className="flex justify-between items-center border-t border-graphite/10 pt-4 mt-1"><span className="text-[13px] font-bold text-orange">Матч за 3-е место</span> <Stepper value={formData.wins_needed_3rd} initialValue={formData.wins_needed_3rd} onChange={(v) => handleChange('wins_needed_3rd', v)} min={1} max={7} /></div>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center p-6 border-t border-graphite/10 bg-white shrink-0">
          <Button 
            onClick={() => setCurrentStep(prev => prev - 1)} 
            className={currentStep === 0 ? 'invisible' : 'bg-white/50 border border-graphite/20 text-graphite-light hover:text-graphite'}
          >
            Назад
          </Button>
          
          <div className="flex gap-4">
            {currentStep < 3 && (
              <Button 
                onClick={() => {
                  let nextStep = currentStep + 1;
                  if (!hasRegular && nextStep === 2) nextStep = 3;
                  if (!hasPlayoff && nextStep === 3) return;
                  setCurrentStep(nextStep);
                }} 
                className="bg-white/50 border border-graphite/20 text-graphite hover:border-orange hover:text-orange"
              >
                Далее
              </Button>
            )}
            <Button 
              onClick={handleSave} 
              isLoading={isSaving} 
              disabled={!isFormValid() || isLocked}
            >
              Сохранить
            </Button>
          </div>
        </div>

      </div>
    </div>
  );
}