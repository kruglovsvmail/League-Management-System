import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { SegmentButton } from '../ui/SegmentButton';
import { Table } from '../ui/Table'; 
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { Uploader } from '../ui/Uploader';
import { Button } from '../ui/Button';
import { DatePicker } from '../ui/DatePicker';
import { Switch } from '../ui/Switch';
import { Badge } from '../ui/Badge';
import { Loader } from '../ui/Loader';
import { getImageUrl, getToken } from '../utils/helpers';

const API_BASE = import.meta.env.VITE_API_URL;

const formatPhoneDynamic = (raw) => {
  if (!raw) return '';
  let res = '';
  if (raw.length > 0) res += '(' + raw.substring(0, 3);
  if (raw.length >= 4) res += ') ' + raw.substring(3, 6);
  if (raw.length >= 7) res += '-' + raw.substring(6, 8);
  if (raw.length >= 9) res += '-' + raw.substring(8, 10);
  return res;
};

export function GlobalRegistryPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = parseInt(searchParams.get('tab') || '0', 10);
  const typeFilterIndex = parseInt(searchParams.get('type') || '0', 10);
  const searchQuery = searchParams.get('q') || '';

  const setActiveTab = (index) => {
    setSearchParams(prev => {
      prev.set('tab', index);
      prev.delete('q');    
      prev.delete('type'); 
      return prev;
    }, { replace: true });
  };

  const setTypeFilterIndex = (index) => {
    setSearchParams(prev => {
      prev.set('type', index);
      return prev;
    }, { replace: true });
  };

  const setSearchQuery = (val) => {
    setSearchParams(prev => {
      if (val) prev.set('q', val);
      else prev.delete('q');
      return prev;
    }, { replace: true });
  };

  const [tableData, setTableData] = useState([]);
  const [leaguesList, setLeaguesList] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  
  const [logoFile, setLogoFile] = useState(null);
  const [jerseyLightFile, setJerseyLightFile] = useState(null);
  const [jerseyDarkFile, setJerseyDarkFile] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [clearedFiles, setClearedFiles] = useState(new Set());
  
  const defaultForm = { status: 'active', is_virtual: false, is_active: false, birth_date: '', phone: '' };
  const [formData, setFormData] = useState(defaultForm);
  
  const [isLoading, setIsLoading] = useState(false); 

  // Стейты и реф для импорта Excel
  const fileImportRef = useRef(null);
  const [isImporting, setIsImporting] = useState(false);

  // === ПАГИНАЦИЯ И БЕСКОНЕЧНЫЙ СКРОЛЛ ===
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const observer = useRef();

  const lastElementRef = useCallback(node => {
    if (isLoading || isFetchingMore) return;
    if (observer.current) observer.current.disconnect();
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [isLoading, isFetchingMore, hasMore]);

  const [formResetKey, setFormResetKey] = useState(0);
  const [cacheBuster, setCacheBuster] = useState(Date.now());

  const getHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${getToken()}`
  });

  const fetchData = async (pageNum, isInitial) => {
    if (isInitial) setIsLoading(true);
    else setIsFetchingMore(true);

    const endpoints = ['arenas', 'leagues', 'seasons', 'teams', 'users'];
    
    try {
      const url = new URL(`${API_BASE}/api/registry/${endpoints[activeTab]}`);
      url.searchParams.append('page', pageNum);
      url.searchParams.append('limit', 30);
      if (searchQuery) url.searchParams.append('search', searchQuery);
      if (activeTab === 3 || activeTab === 4) url.searchParams.append('type', typeFilterIndex);

      const res = await fetch(url.toString(), { headers: getHeaders() });
      const json = await res.json();
      if (json.success) {
        if (isInitial) {
          setTableData(json.data);
        } else {
          setTableData(prev => [...prev, ...json.data]);
        }
        setHasMore(json.hasMore);
        setCacheBuster(Date.now()); 
      }
    } catch (err) { 
      console.error(err); 
    } finally {
      setIsLoading(false);
      setIsFetchingMore(false);
    }
  };

  // Сброс и загрузка первой страницы при смене вкладок или фильтров
  useEffect(() => {
    setPage(1);
    setTableData([]);
    setHasMore(true);
    resetForm();

    const timeout = setTimeout(() => {
      fetchData(1, true);
    }, 400); // Debounce для строки поиска

    if (activeTab === 2) {
      fetch(`${API_BASE}/api/registry/leagues?limit=1000`, { headers: getHeaders() })
        .then(res => res.json())
        .then(json => json.success && setLeaguesList(json.data));
    }

    return () => clearTimeout(timeout);
  }, [activeTab, searchQuery, typeFilterIndex]);

  // Загрузка следующих страниц при скролле
  useEffect(() => {
    if (page > 1) {
      fetchData(page, false);
    }
  }, [page]);

  const resetForm = () => {
    setSelectedItem(null);
    setFormData(defaultForm);
    setLogoFile(null);
    setJerseyLightFile(null);
    setJerseyDarkFile(null);
    setAvatarFile(null);
    setClearedFiles(new Set());
    setFormResetKey(prev => prev + 1); 
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const formatDateToRU = (dateString) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '';
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  };

  const handleBirthDateChange = (e) => {
    let val = e.target.value.replace(/\D/g, ''); 
    if (val.length > 8) val = val.slice(0, 8);
    if (val.length >= 5) {
      val = `${val.slice(0, 2)}-${val.slice(2, 4)}-${val.slice(4)}`;
    } else if (val.length >= 3) {
      val = `${val.slice(0, 2)}-${val.slice(2)}`;
    }
    handleChange('birth_date', val);
  };

  const handlePhoneChange = (e) => {
    const val = e.target.value.replace(/\D/g, ''); 
    handleChange('phone', val.slice(0, 10));
  };

  const handleRowClick = (item) => {
    resetForm(); 
    setSelectedItem(item);
    
    setFormData({
      ...item,
      uiLeague: item.league_id ? `${item.league_id} - ${item.league_name}` : '',
      is_virtual: activeTab === 4 ? !!item.virtual_code : !!item.is_virtual,
      birth_date: item.birth_date ? formatDateToRU(item.birth_date) : '',
      phone: item.phone ? item.phone.replace(/^\+?7/, '').replace(/\D/g, '') : ''
    });
  };

  const handleFileSelect = (type, file) => {
    if (!file) {
      setClearedFiles(prev => new Set(prev).add(type));
      if (type === 'logo') setLogoFile(null);
      if (type === 'jersey_light') setJerseyLightFile(null);
      if (type === 'jersey_dark') setJerseyDarkFile(null);
      if (type === 'avatar') setAvatarFile(null);
    } else {
      setClearedFiles(prev => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
      if (type === 'logo') setLogoFile(file);
      if (type === 'jersey_light') setJerseyLightFile(file);
      if (type === 'jersey_dark') setJerseyDarkFile(file);
      if (type === 'avatar') setAvatarFile(file);
    }
  };

  const uploadFileS3 = async (entityId, type, file) => {
    const entities = ['arenas', 'leagues', 'seasons', 'teams', 'users'];
    const fd = new FormData();
    fd.append('file', file);
    try {
      await fetch(`${API_BASE}/api/registry/${entities[activeTab]}/${entityId}/upload/${type}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: fd
      });
    } catch (err) { console.error('Ошибка загрузки:', err); }
  };

  const clearFileS3 = async (entityId, type) => {
    const entities = ['arenas', 'leagues', 'seasons', 'teams', 'users'];
    try {
      await fetch(`${API_BASE}/api/registry/${entities[activeTab]}/${entityId}/upload/${type}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
    } catch (err) { console.error('Ошибка очистки:', err); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    let payload = { ...formData };

    if (activeTab === 2 && formData.uiLeague) {
      payload.league_id = parseInt(formData.uiLeague.split(' - ')[0]);
    }

    if (activeTab === 4) { 
      payload.height = formData.height ? parseInt(formData.height, 10) : null;
      payload.weight = formData.weight ? parseInt(formData.weight, 10) : null;
      payload.phone = formData.phone ? '+7' + formData.phone : null;
      
      if (formData.birth_date && formData.birth_date.length === 10) {
        payload.birth_date = formData.birth_date.split('-').reverse().join('-');
      } else {
        payload.birth_date = null;
      }
    }

    setIsLoading(true);
    const endpoints = ['arenas', 'leagues', 'seasons', 'teams', 'users'];
    const url = selectedItem 
      ? `${API_BASE}/api/registry/${endpoints[activeTab]}/${selectedItem.id}` 
      : `${API_BASE}/api/registry/${endpoints[activeTab]}`;

    try {
      const res = await fetch(url, {
        method: selectedItem ? 'PUT' : 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      
      if (json.success) {
        const entityId = selectedItem ? selectedItem.id : json.id;
        const fileTasks = []; 

        if (logoFile) fileTasks.push(uploadFileS3(entityId, 'logo', logoFile));
        else if (clearedFiles.has('logo') && selectedItem?.logo_url) fileTasks.push(clearFileS3(entityId, 'logo'));

        if (jerseyLightFile) fileTasks.push(uploadFileS3(entityId, 'jersey_light', jerseyLightFile));
        else if (clearedFiles.has('jersey_light') && selectedItem?.jersey_light_url) fileTasks.push(clearFileS3(entityId, 'jersey_light'));

        if (jerseyDarkFile) fileTasks.push(uploadFileS3(entityId, 'jersey_dark', jerseyDarkFile));
        else if (clearedFiles.has('jersey_dark') && selectedItem?.jersey_dark_url) fileTasks.push(clearFileS3(entityId, 'jersey_dark'));

        if (avatarFile) fileTasks.push(uploadFileS3(entityId, 'avatar', avatarFile));
        else if (clearedFiles.has('avatar') && selectedItem?.avatar_url) fileTasks.push(clearFileS3(entityId, 'avatar'));

        await Promise.all(fileTasks);

        fetchData(1, true); // Обновляем с первой страницы
        resetForm();
      } else {
        alert(`Ошибка сервера: ${json.error}`);
      }
    } catch (err) { alert('Ошибка сети при сохранении'); }
    setIsLoading(false);
  };

  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/api/registry/users/import`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: fd
      });
      const json = await res.json();
      
      if (json.success) {
        alert(json.message);
        fetchData(1, true); 
      } else {
        alert(`Ошибка импорта: ${json.error}`);
      }
    } catch (err) {
      alert('Ошибка сети при импорте файла');
    } finally {
      setIsImporting(false);
      if (fileImportRef.current) fileImportRef.current.value = '';
    }
  };

  const isFormValid = () => {
    switch (activeTab) {
      case 0: return !!formData.name?.trim() && !!formData.city?.trim() && !!formData.address?.trim();
      case 1: return !!formData.name?.trim() && !!formData.city?.trim();
      case 2: return !!formData.uiLeague && !!formData.name?.trim() && !!formData.start_date && !!formData.end_date;
      case 3: return !!formData.name?.trim() && !!formData.short_name?.trim() && !!formData.city?.trim();
      case 4: return !!formData.last_name?.trim() && !!formData.first_name?.trim(); // Убрали проверку отчества
      default: return false;
    }
  };

  const getCachedImageUrl = (url) => {
    const fullUrl = getImageUrl(url);
    return fullUrl ? `${fullUrl}?t=${cacheBuster}` : null;
  };

  const allColumns = [
    [ 
      { label: 'ID', key: 'id', width: 'w-16' },
      { label: 'Название', key: 'name' },
      { label: 'Город', key: 'city' },
      { label: 'Статус', render: (r) => <Badge type={r.status === 'active' ? 'filled' : 'empty'} label={r.status === 'active' ? 'ВКЛ' : 'ВЫКЛ'} /> }
    ],
    [ 
      { label: 'ID', key: 'id', width: 'w-16' },
      { label: 'Лого', render: (r) => <img src={getCachedImageUrl(r.logo_url || '/default/Logo_league_default.webp')} className="w-8 h-8 object-contain" /> },
      { label: 'Название', key: 'name' },
      { label: 'Город', key: 'city' }
    ],
    [ 
      { label: 'ID', key: 'id', width: 'w-16' },
      { label: 'Сезон', key: 'name' },
      { label: 'Лига', key: 'league_name' },
      { label: 'Статус', render: (r) => <Badge type={r.is_active ? 'filled' : 'empty'} label={r.is_active ? 'АКТИВЕН' : 'АРХИВ'} /> }
    ],
    [ 
      { label: 'ID', key: 'id', width: 'w-16' },
      { label: 'Лого', render: (r) => <img src={getCachedImageUrl(r.logo_url || '/default/Logo_team_default.webp')} className="w-8 h-8 object-contain" /> },
      { label: 'Название', key: 'name' },
      { label: 'Город', key: 'city' },
      { label: 'Тип', render: (r) => <Badge type={r.is_virtual ? 'empty' : 'filled'} label={r.is_virtual ? 'ВИРТ' : 'РЕАЛ'} /> }
    ],
    [ 
      { label: 'ID', key: 'id', width: 'w-16' },
      { label: 'Аватар', render: (r) => <img src={getCachedImageUrl(r.avatar_url || '/default/user_default.webp')} className="w-10 h-10 bg-black/10 rounded-md object-cover shadow-sm" /> },
      { label: 'ФИО', render: (r) => <span className="font-bold">{r.last_name} {r.first_name} {r.middle_name || ''}</span> },
      { label: 'Код', render: (r) => r.virtual_code ? <code className="bg-orange/10 text-orange px-2 py-0.5 rounded font-bold">{r.virtual_code}</code> : '-' },
      { label: 'Статус', render: (r) => <Badge type={r.virtual_code ? 'empty' : 'filled'} label={r.virtual_code ? 'ВИРТ' : 'РЕАЛ'} /> }
    ]
  ];

  return (
    <div className="flex flex-col min-h-screen pb-12">
      <Header 
        title="Глобальный реестр" 
        actions={
          <div className="flex items-center gap-4">
            
            {/* Скрытый инпут для файла */}
            <input 
              type="file" 
              hidden 
              ref={fileImportRef} 
              accept=".xlsx, .xls" 
              onChange={handleImportExcel} 
            />

            {/* Кнопка показывается ТОЛЬКО на вкладке Пользователи (activeTab === 4) */}
            {activeTab === 4 && (
              <Button 
                onClick={() => fileImportRef.current.click()} 
                isLoading={isImporting}
                className="bg-status-pending hover:bg-status-pending-hover border-none px-4 shrink-0"
              >
                Импорт Excel
              </Button>
            )}

            {(activeTab === 3 || activeTab === 4) && (
              <div className="w-[320px] shrink-0">
                <SegmentButton 
                  options={['Все', 'Реальные', 'Виртуальные']} 
                  defaultIndex={typeFilterIndex} 
                  onChange={setTypeFilterIndex} 
                />
              </div>
            )}
            
            <div className="w-[260px] shrink-0">
              <Input 
                placeholder="Поиск..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
              />
            </div>
          </div>
        }
      />

      <div className="flex items-start px-10 pt-8 gap-8 relative">
        <div className="w-[530px] shrink-0 sticky top-[128px] max-h-[calc(100vh-140px)] overflow-y-auto bg-white/30 backdrop-blur-md rounded-xxl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-7 flex flex-col gap-6 custom-scrollbar z-20">
          
          <div className="shrink-0">
            <SegmentButton 
              options={['Арены', 'Лиги', 'Сезоны', 'Команды', 'Пользов.']} 
              defaultIndex={activeTab} 
              onChange={setActiveTab} 
            />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center pb-3 border-b border-graphite/10">
              <span className="text-[14px] font-bold text-graphite uppercase tracking-widest">
                {selectedItem ? 'Редактирование' : 'Новая запись'}
              </span>
              {selectedItem && (
                <button type="button" onClick={resetForm} className="text-[11px] font-bold text-status-rejected hover:text-status-rejected/70 transition-colors uppercase bg-status-rejected/10 px-3 py-1.5 rounded-md">
                  Сбросить
                </button>
              )}
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              {activeTab === 0 && ( 
                <>
                  <Input placeholder="Название арены *" value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input placeholder="Город *" value={formData.city || ''} onChange={e => handleChange('city', e.target.value)} />
                    <Input placeholder="Адрес *" value={formData.address || ''} onChange={e => handleChange('address', e.target.value)} />
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <Switch checked={formData.status === 'active'} onChange={(e) => handleChange('status', e.target.checked ? 'active' : 'inactive')} />
                    <span className="text-[13px] font-bold text-graphite">{formData.status === 'active' ? 'Арена функционирует' : 'Арена закрыта'}</span>
                  </div>
                </>
              )}

              {activeTab === 1 && ( 
                <>
                  <Input placeholder="Полное название лиги *" value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input placeholder="Короткое название (аббревиатура)" value={formData.short_name || ''} onChange={e => handleChange('short_name', e.target.value)} />
                    <Input placeholder="Город *" value={formData.city || ''} onChange={e => handleChange('city', e.target.value)} />
                  </div>
                  <textarea 
                    className="w-full px-3 py-2.5 border border-graphite/40 rounded-md bg-white text-graphite text-[13px] font-medium outline-none transition-all duration-300 focus:border-orange resize-none" 
                    rows="3" placeholder="Описание лиги..." value={formData.description || ''} onChange={e => handleChange('description', e.target.value)} 
                  />
                  <div className="w-[180px]">
                    <Uploader 
                      key={`logo-${formResetKey}`}
                      label="Логотип Лиги" 
                      initialUrl={selectedItem ? getCachedImageUrl(selectedItem.logo_url) : null} 
                      onFileSelect={(f) => handleFileSelect('logo', f)} 
                    />
                  </div>
                </>
              )}

              {activeTab === 2 && ( 
                <>
                  <Select label="Связанная Лига *" options={leaguesList.map(l => `${l.id} - ${l.name}`)} value={formData.uiLeague || ''} onChange={val => handleChange('uiLeague', val)} />
                  <Input placeholder="Название сезона (например: 2024/2025) *" value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <DatePicker placeholder="Дата начала *" value={formData.start_date} onChange={val => handleChange('start_date', val)} />
                    <DatePicker placeholder="Дата окончания *" value={formData.end_date} onChange={val => handleChange('end_date', val)} />
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <Switch checked={formData.is_active || false} onChange={(e) => handleChange('is_active', e.target.checked)} />
                    <span className="text-[13px] font-bold text-graphite">{formData.is_active ? 'Текущий активный сезон' : 'Архивный сезон'}</span>
                  </div>
                </>
              )}

              {activeTab === 3 && ( 
                <>
                  <Input placeholder="Полное название команды *" value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input placeholder="Короткое название *" value={formData.short_name || ''} onChange={e => handleChange('short_name', e.target.value)} />
                    <Input placeholder="Город *" value={formData.city || ''} onChange={e => handleChange('city', e.target.value)} />
                  </div>
                  <textarea 
                    className="w-full px-3 py-2.5 border border-graphite/40 rounded-md bg-white text-graphite text-[13px] font-medium outline-none transition-all duration-300 focus:border-orange resize-none" 
                    rows="3" placeholder="Описание команды..." value={formData.description || ''} onChange={e => handleChange('description', e.target.value)} 
                  />
                  <div className="flex items-center gap-3 mt-1">
                    <Switch checked={formData.is_virtual || false} onChange={(e) => handleChange('is_virtual', e.target.checked)} />
                    <span className="text-[13px] font-bold text-graphite">{formData.is_virtual ? 'Виртуальная команда (заглушка)' : 'Реальная команда'}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-graphite/10 mt-2">
                    <Uploader 
                      key={`logo-${formResetKey}`}
                      label="Логотип" heightClass="h-[120px]" 
                      initialUrl={selectedItem ? getCachedImageUrl(selectedItem.logo_url) : null} 
                      onFileSelect={(f) => handleFileSelect('logo', f)} 
                    />
                    <Uploader 
                      key={`jersey_light-${formResetKey}`}
                      label="Джерси (С)" heightClass="h-[120px]" mockText="Светлая" isDefaultPreview={true} 
                      initialUrl={selectedItem ? getCachedImageUrl(selectedItem.jersey_light_url) : null} 
                      onFileSelect={(f) => handleFileSelect('jersey_light', f)} 
                    />
                    <Uploader 
                      key={`jersey_dark-${formResetKey}`}
                      label="Джерси (Т)" heightClass="h-[120px]" mockText="Темная" isDefaultPreview={true} 
                      initialUrl={selectedItem ? getCachedImageUrl(selectedItem.jersey_dark_url) : null} 
                      onFileSelect={(f) => handleFileSelect('jersey_dark', f)} 
                    />
                  </div>
                </>
              )}

              {activeTab === 4 && ( 
                <div className="space-y-6">
                  
                  {/* Блок: Основная информация */}
                  <div>
                    <div className="grid grid-cols-3 gap-3">
                      <Input placeholder="Фамилия *" value={formData.last_name || ''} onChange={e => handleChange('last_name', e.target.value)} />
                      <Input placeholder="Имя *" value={formData.first_name || ''} onChange={e => handleChange('first_name', e.target.value)} />
                      {/* Убрали звездочку из Отчества */}
                      <Input placeholder="Отчество" value={formData.middle_name || ''} onChange={e => handleChange('middle_name', e.target.value)} />
                    </div>
                    <div className="flex items-center gap-3 mt-4">
                      <Switch checked={formData.is_virtual || false} onChange={(e) => handleChange('is_virtual', e.target.checked)} />
                      <span className="text-[13px] font-bold text-graphite">{formData.is_virtual ? 'Виртуальный профиль (заглушка)' : 'Реальный пользователь'}</span>
                    </div>
                  </div>

                  {/* Блок: Контакты */}
                  <div>
                    <div className="text-[10px] font-bold text-graphite/50 uppercase tracking-widest mb-3">Контакты</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="relative flex items-center w-full border border-graphite/40 rounded-md bg-white transition-all duration-300 focus-within:border-orange overflow-hidden">
                        <div className="pl-3 pr-2 text-[13px] text-graphite font-semibold border-r border-graphite/20 py-2.5 bg-graphite/5 h-full flex items-center shrink-0">+7</div>
                        <input 
                          type="tel" 
                          placeholder="(000) 000-00-00" 
                          value={formatPhoneDynamic(formData.phone)} 
                          onChange={handlePhoneChange} 
                          className="w-full px-3 py-2.5 bg-transparent text-graphite text-[13px] outline-none placeholder:text-graphite/40 font-medium" 
                        />
                      </div>
                      <Input placeholder="Email (необязательно)" value={formData.email || ''} onChange={e => handleChange('email', e.target.value)} />
                    </div>
                  </div>

                  {/* Блок: Физические параметры */}
                  <div className="pb-3">
                    <div className="text-[10px] font-bold text-graphite/50 uppercase tracking-widest mb-3">параметры</div>
                    
                    <div className="grid grid-cols-3 gap-3">
                      <Input placeholder="Дата рождения" value={formData.birth_date || ''} onChange={handleBirthDateChange} />
                      <Input placeholder="Рост (см)" value={formData.height || ''} onChange={e => handleChange('height', e.target.value)} />
                      <Input placeholder="Вес (кг)" value={formData.weight || ''} onChange={e => handleChange('weight', e.target.value)} />
                    </div>
                  </div>

                  {/* Блок: Аватар */}
                  <div className="w-[150px] pt-4 border-t border-graphite/10">
                    <Uploader 
                      key={`avatar-${formResetKey}`}
                      label="Аватар профиля" 
                      initialUrl={selectedItem ? getCachedImageUrl(selectedItem.avatar_url) : null} 
                      onFileSelect={(f) => handleFileSelect('avatar', f)} 
                    />
                  </div>

                </div>
              )}

              <Button 
                type="submit" 
                isLoading={isLoading} 
                disabled={!isFormValid() || isLoading}
                className={`w-full mt-2 py-3 shadow-md transition-all duration-300 ${!isFormValid() ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
              >
                {selectedItem ? 'Сохранить изменения' : 'Создать запись'}
              </Button>
            </form>
          </div>
        </div>

        {/* ПРАВАЯ ЧАСТЬ - ТАБЛИЦА */}
        <div className="flex-1 relative z-10 min-h-[500px]">
          {isLoading && tableData.length === 0 && (
            <div className="absolute inset-0 z-30 flex items-start pt-32 justify-center pointer-events-none">
              <Loader text="Загрузка реестра..." />
            </div>
          )}
          <div className={`transition-opacity duration-300 ease-in-out ${isLoading && tableData.length === 0 ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            <Table 
              columns={allColumns[activeTab]} 
              data={tableData} 
              onRowClick={handleRowClick}
              rowClassName={(r) => r.id === selectedItem?.id ? 'bg-orange/5 shadow-[inset_4px_0_0_0_#FF7A00]' : ''}
            />
            {/* Элемент-сенсор для бесконечного скролла */}
            <div ref={lastElementRef} className="h-10 w-full flex items-center justify-center mt-2">
              {isFetchingMore && <span className="text-graphite-light text-sm font-bold animate-pulse">Загрузка данных...</span>}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}