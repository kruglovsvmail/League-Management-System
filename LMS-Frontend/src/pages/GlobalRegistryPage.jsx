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
import { Tooltip } from '../ui/Tooltip';
import { getImageUrl, getToken } from '../utils/helpers';
import { UserDuplicateWarningModal } from '../modals/UserDuplicateWarningModal';
import { UserImportReviewModal } from '../modals/UserImportReviewModal';

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
  
  const defaultForm = { 
    status: 'active', 
    is_virtual: false, 
    is_active: false, 
    birth_date: '', 
    phone: '',
    ui_color: '',
    color_home_1: '',
    color_home_2: '',
    color_away_1: '',
    color_away_2: ''
  };
  const [formData, setFormData] = useState(defaultForm);
  
  const [isLoading, setIsLoading] = useState(false); 

  const fileImportRef = useRef(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isFetchingVirtualPhone, setIsFetchingVirtualPhone] = useState(false);

  // Предупреждение о тёзке при ручном добавлении: { payload, matches } | null
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  // Ревью перед подтверждением импорта: массив строк из /import/preview | null
  const [importPreviewRows, setImportPreviewRows] = useState(null);
  const [isConfirmingImport, setIsConfirmingImport] = useState(false);

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [counts, setCounts] = useState(null); // { total, real, virtual } | null
  const observer = useRef();
  const requestSeqRef = useRef(0); // защита от «протухших» ответов при смене фильтра/таба/поиска

  const lastElementRef = useCallback(node => {
    // Всегда отключаем старый наблюдатель: пока идёт любая загрузка или больше нечего грузить —
    // сентинел НЕ наблюдаем, чтобы он не продвигал страницу раньше времени (в т.ч. во время
    // debounce начальной загрузки, когда список пуст, но сентинел уже виден).
    if (observer.current) observer.current.disconnect();
    if (isLoading || isFetchingMore || !hasMore) return;

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
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
    const seq = requestSeqRef.current; // фиксируем «поколение» запроса
    if (isInitial) setIsLoading(true);
    else setIsFetchingMore(true);

    const endpoints = ['leagues', 'seasons', 'teams', 'users', 'arenas'];

    try {
      const url = new URL(`${API_BASE}/api/registry/${endpoints[activeTab]}`);
      url.searchParams.append('page', pageNum);
      url.searchParams.append('limit', 30);
      if (searchQuery) url.searchParams.append('search', searchQuery);
      if (activeTab === 2 || activeTab === 3) url.searchParams.append('type', typeFilterIndex);

      const res = await fetch(url.toString(), { headers: getHeaders() });
      const json = await res.json();

      // Если за время запроса сменили фильтр/таб/поиск — это «протухший» ответ, игнорируем его целиком,
      // чтобы он не затёр свежие данные и не сбил hasMore.
      if (seq !== requestSeqRef.current) return;

      if (json.success) {
        if (isInitial) {
          setTableData(json.data);
        } else {
          setTableData(prev => [...prev, ...json.data]);
        }
        setHasMore(json.hasMore);
        if (json.counts) setCounts(json.counts);
        setCacheBuster(Date.now());
      }
    } catch (err) {
      console.error(err);
    } finally {
      // Флаги загрузки сбрасываем только для актуального поколения запроса
      if (seq === requestSeqRef.current) {
        setIsLoading(false);
        setIsFetchingMore(false);
      }
    }
  };

  useEffect(() => {
    requestSeqRef.current += 1; // новое поколение: все ответы предыдущего фильтра станут «протухшими»
    setPage(1);
    setTableData([]);
    setHasMore(true);
    setCounts(null);
    // Сразу блокируем подгрузку: isLoading=true на время debounce + начальной загрузки,
    // чтобы наблюдатель не продвинул страницу, пока список пуст.
    setIsLoading(true);
    setIsFetchingMore(false);
    resetForm();

    const timeout = setTimeout(() => {
      fetchData(1, true);
    }, 400);

    if (activeTab === 1) {
      fetch(`${API_BASE}/api/registry/leagues?limit=1000`, { headers: getHeaders() })
        .then(res => res.json())
        .then(json => json.success && setLeaguesList(json.data));
    }

    return () => clearTimeout(timeout);
  }, [activeTab, searchQuery, typeFilterIndex]);

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

  const handleFillVirtualPhone = async () => {
    setIsFetchingVirtualPhone(true);
    try {
      const res = await fetch(`${API_BASE}/api/registry/users/next-virtual-phone`, { headers: getHeaders() });
      const json = await res.json();
      if (json.success) {
        handleChange('phone', json.phone.replace(/^\+?7/, ''));
      } else {
        alert(json.error || 'Не удалось получить свободный виртуальный номер');
      }
    } catch (err) {
      alert('Ошибка сети при получении виртуального номера');
    } finally {
      setIsFetchingVirtualPhone(false);
    }
  };

  const handleRowClick = (item) => {
    resetForm(); 
    setSelectedItem(item);
    
    setFormData({
      ...item,
      uiLeague: item.league_id ? `${item.league_id} - ${item.league_name}` : '',
      is_virtual: activeTab === 3 ? !!item.virtual_code : !!item.is_virtual,
      birth_date: item.birth_date ? formatDateToRU(item.birth_date) : '',
      phone: item.phone ? item.phone.replace(/^\+?7/, '').replace(/\D/g, '') : '',
      ui_color: item.ui_color || '',
      color_home_1: item.color_home_1 || '',
      color_home_2: item.color_home_2 || '',
      color_away_1: item.color_away_1 || '',
      color_away_2: item.color_away_2 || ''
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
    const entities = ['leagues', 'seasons', 'teams', 'users', 'arenas'];
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
    const entities = ['leagues', 'seasons', 'teams', 'users', 'arenas'];
    try {
      await fetch(`${API_BASE}/api/registry/${entities[activeTab]}/${entityId}/upload/${type}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
    } catch (err) { console.error('Ошибка очистки:', err); }
  };

  const buildPayload = () => {
    let payload = { ...formData };

    if (activeTab === 1 && formData.uiLeague) {
      payload.league_id = parseInt(formData.uiLeague.split(' - ')[0]);
    }

    if (activeTab === 3) {
      payload.height = formData.height ? parseInt(formData.height, 10) : null;
      payload.weight = formData.weight ? parseInt(formData.weight, 10) : null;
      payload.phone = formData.phone ? '+7' + formData.phone : null;

      if (formData.birth_date && formData.birth_date.length === 10) {
        payload.birth_date = formData.birth_date.split('-').reverse().join('-');
      } else {
        payload.birth_date = null;
      }
    }
    return payload;
  };

  const performSave = async (payload) => {
    setIsLoading(true);
    const endpoints = ['leagues', 'seasons', 'teams', 'users', 'arenas'];
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

        fetchData(1, true);
        resetForm();
        setDuplicateWarning(null);
      } else {
        alert(`Ошибка сервера: ${json.error}`);
      }
    } catch (err) { alert('Ошибка сети при сохранении'); }
    setIsLoading(false);
  };

  // Перед СОЗДАНИЕМ нового пользователя (не при редактировании) проверяем
  // совпадение по Фамилии+Имени — не блокирует, только предупреждает: если
  // нашли тёзку, тормозим сохранение и показываем сравнение вместо прямого
  // сабмита. При редактировании и при добавлении в остальные разделы (лиги,
  // сезоны, команды, арены) проверка не нужна.
  const handleSave = async (e) => {
    e.preventDefault();
    const payload = buildPayload();

    if (activeTab === 3 && !selectedItem && formData.last_name?.trim() && formData.first_name?.trim()) {
      try {
        const dupRes = await fetch(`${API_BASE}/api/registry/users/check-duplicates`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ candidates: [{ first_name: formData.first_name, last_name: formData.last_name }] })
        });
        const dupJson = await dupRes.json();
        const matches = dupJson?.success ? (dupJson.matches?.['0'] || []) : [];
        if (matches.length > 0) {
          setDuplicateWarning({ payload, matches });
          return;
        }
      } catch (err) {
        // Проверка не удалась — не блокируем создание пользователя из-за сетевой ошибки.
      }
    }

    await performSave(payload);
  };

  // Шаг 1/2: только разбор файла + подбор тёзок по ФИ, в базу ничего не пишем.
  // Дальше — ревью в UserImportReviewModal, коммит происходит в handleConfirmImport.
  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsImporting(true);
    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch(`${API_BASE}/api/registry/users/import/preview`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: fd
      });
      const json = await res.json();

      if (json.success) {
        setImportPreviewRows(json.rows);
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

  // Шаг 2/2: отправляем только финальный список строк, отревьюженный в модалке
  // (новые без совпадений + тёзки, явно подтверждённые админом).
  const handleConfirmImport = async (finalRows) => {
    setIsConfirmingImport(true);
    try {
      const res = await fetch(`${API_BASE}/api/registry/users/import/confirm`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ rows: finalRows })
      });
      const json = await res.json();

      if (json.success) {
        alert(json.message);
        setImportPreviewRows(null);
        fetchData(1, true);
      } else {
        alert(`Ошибка импорта: ${json.error}`);
      }
    } catch (err) {
      alert('Ошибка сети при импорте файла');
    } finally {
      setIsConfirmingImport(false);
    }
  };

  const isFormValid = () => {
    switch (activeTab) {
      case 0: return !!formData.name?.trim() && !!formData.city?.trim(); // Leagues
      case 1: return !!formData.uiLeague && !!formData.name?.trim() && !!formData.start_date && !!formData.end_date; // Seasons
      case 2: return !!formData.name?.trim() && !!formData.short_name?.trim() && !!formData.city?.trim(); // Teams
      case 3: return !!formData.last_name?.trim() && !!formData.first_name?.trim(); // Users
      case 4: return !!formData.name?.trim() && !!formData.city?.trim() && !!formData.address?.trim(); // Arenas
      default: return false;
    }
  };

  const getCachedImageUrl = (url) => {
    const fullUrl = getImageUrl(url);
    return fullUrl ? `${fullUrl}?t=${cacheBuster}` : null;
  };

  const allColumns = [
    [ // 0: Leagues
      { label: 'ID', key: 'id', width: 'w-14' },
      { label: 'Лого', width: 'w-14', render: (r) => <img src={getCachedImageUrl(r.logo_url || '/default/Logo_league_default.webp')} className="w-8 h-8 object-contain" /> },
      { label: 'Название', key: 'name' },
      { label: 'Город', key: 'city', width: 'w-40' }
    ],
    [ // 1: Seasons
      { label: 'ID', key: 'id', width: 'w-14' },
      { label: 'Сезон', key: 'name' },
      { label: 'Лига', key: 'league_name' },
      { label: 'Статус', width: 'w-28', render: (r) => <Badge type={r.is_active ? 'filled' : 'empty'} label={r.is_active ? 'АКТИВЕН' : 'АРХИВ'} /> }
    ],
    [ // 2: Teams
      { label: 'ID', key: 'id', width: 'w-14' },
      { label: 'Лого', width: 'w-14', render: (r) => <img src={getCachedImageUrl(r.logo_url || '/default/Logo_team_default.webp')} className="w-8 h-8 object-contain" /> },
      { label: 'Название', key: 'name' },
      { label: 'Город', key: 'city', width: 'w-36' },
      { label: 'Тип', width: 'w-24', render: (r) => <Badge type={r.is_virtual ? 'empty' : 'filled'} label={r.is_virtual ? 'ВИРТ' : 'РЕАЛ'} /> }
    ],
    [ // 3: Users
      { label: 'ID', key: 'id', width: 'w-14' },
      { label: 'Аватар', width: 'w-16', render: (r) => <img src={getCachedImageUrl(r.avatar_url || '/default/user_default.webp')} className="w-10 h-10 bg-black/10 rounded-md object-cover shadow-sm" /> },
      { label: 'ФИО', render: (r) => (
        <div className="flex flex-col">
          <span className="font-bold leading-tight">{r.last_name} {r.first_name}</span>
          {r.middle_name && <span className="text-[12px] font-medium text-graphite-light leading-tight mt-0.5">{r.middle_name}</span>}
        </div>
      )},
      { label: 'Телефон', width: 'w-36', render: (r) => {
        if (!r.phone) return <span className="text-graphite/40">—</span>;
        const cleaned = ('' + r.phone).replace(/\D/g, '');
        const m = cleaned.match(/^(7|8)?(\d{3})(\d{3})(\d{2})(\d{2})$/);
        return <span className="text-[13px] whitespace-nowrap">{m ? `+7 (${m[2]}) ${m[3]}-${m[4]}-${m[5]}` : r.phone}</span>;
      }},
      { label: 'Команды', width: 'w-44', render: (r) => {
        const teams = r.current_teams || [];
        if (teams.length === 0) return <span className="text-graphite/40">—</span>;
        return (
          <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {teams.map((t) => (
              <Tooltip key={t.id} title={t.name} subtitle={t.city || ''} noUnderline>
                <div className="w-8 h-8 flex items-center justify-center p-0.5 rounded cursor-help">
                  <img src={getImageUrl(t.logo_url || '/default/Logo_team_default.webp')} className="w-full h-full object-contain" alt="" />
                </div>
              </Tooltip>
            ))}
          </div>
        );
      }},
      { label: 'Код', width: 'w-24', render: (r) => r.virtual_code ? <code className="bg-orange/10 text-orange px-2 py-0.5 rounded font-bold">{r.virtual_code}</code> : '-' },
      { label: 'Статус', width: 'w-24', render: (r) => <Badge type={r.virtual_code ? 'empty' : 'filled'} label={r.virtual_code ? 'ВИРТ' : 'РЕАЛ'} /> }
    ],
    [ // 4: Arenas
      { label: 'ID', key: 'id', width: 'w-14' },
      { label: 'Название', key: 'name' },
      { label: 'Город', key: 'city', width: 'w-40' },
      { label: 'Статус', width: 'w-24', render: (r) => <Badge type={r.status === 'active' ? 'filled' : 'empty'} label={r.status === 'active' ? 'ВКЛ' : 'ВЫКЛ'} /> }
    ]
  ];

  return (
    <div className="flex flex-col min-h-screen pb-12">
      <Header 
        title="Глобальный реестр" 
        actions={
          <div className="flex items-center gap-4">
            {activeTab === 3 && counts && (
              <div className="flex items-center gap-3 shrink-0 text-[12px] font-bold uppercase tracking-wider text-graphite/60 select-none whitespace-nowrap">
                <span>Всего <span className="text-graphite">{counts.total}</span></span>
                <span className="text-graphite/20">|</span>
                <span>Реал <span className="text-graphite">{counts.real}</span></span>
                <span className="text-graphite/20">|</span>
                <span>Вирт <span className="text-orange">{counts.virtual}</span></span>
              </div>
            )}
            {(activeTab === 2 || activeTab === 3) && (
              <div className="w-[320px] shrink-0">
                <SegmentButton options={['Все', 'Реальные', 'Виртуальные']} defaultIndex={typeFilterIndex} onChange={setTypeFilterIndex} />
              </div>
            )}
            <input type="file" hidden ref={fileImportRef} accept=".xlsx, .xls" onChange={handleImportExcel} />
            {activeTab === 3 && (
              <Button onClick={() => fileImportRef.current.click()} isLoading={isImporting} className="bg-status-accepted text-white">
                Импорт Excel
              </Button>
            )}
            <div className="w-[260px] shrink-0">
              <Input placeholder="Поиск..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          </div>
        }
      />

      <div className="flex items-start px-6 pt-8 gap-6 relative">
        <div className="w-[480px] shrink-0 sticky top-[128px] max-h-[calc(100vh-145px)] overflow-y-auto bg-white/70 backdrop-blur-md rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-7 flex flex-col gap-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-graphite/15 hover:[&::-webkit-scrollbar-thumb]:bg-graphite/25 [&::-webkit-scrollbar-thumb]:rounded-full z-20 pb-4">
          
          <div className="shrink-0">
            <SegmentButton options={['Лиги', 'Сезоны', 'Команды', 'Пользов.', 'Арены']} defaultIndex={activeTab} onChange={setActiveTab} />
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
                  <Input placeholder="Полное название лиги *" value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input placeholder="Короткое название (аббревиатура)" value={formData.short_name || ''} onChange={e => handleChange('short_name', e.target.value)} />
                    <Input placeholder="Город *" value={formData.city || ''} onChange={e => handleChange('city', e.target.value)} />
                  </div>
                  <textarea
                    className="w-full px-3 py-2.5 border border-graphite/40 rounded-md bg-white text-graphite text-[13px] font-medium outline-none transition-all duration-300 focus:border-orange resize-none"
                    rows="3" placeholder="Описание лиги..." value={formData.description || ''} onChange={e => handleChange('description', e.target.value)}
                  />
                  <div className="flex items-start gap-4">
                    <div className="w-[150px] shrink-0">
                      <Uploader key={`logo-${formResetKey}`} label="Логотип Лиги" initialUrl={selectedItem ? getCachedImageUrl(selectedItem.logo_url) : null} onFileSelect={(f) => handleFileSelect('logo', f)} />
                    </div>
                    <div className="flex items-center gap-2 flex-1 min-w-0 mt-6">
                      <Input placeholder="Произношение" value={formData.pronunciation || ''} onChange={e => handleChange('pronunciation', e.target.value)} className="w-full px-2 py-2.5" />
                      <button
                          type="button"
                          disabled={!formData.pronunciation && !formData.name}
                          onClick={() => {
                              const text = formData.pronunciation || formData.name;
                              fetch(`${API_BASE}/api/tts/test?text=${encodeURIComponent(text)}`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
                                .then(r => r.blob())
                                .then(blob => { const audio = new Audio(URL.createObjectURL(blob)); audio.play(); })
                                .catch(e => console.error(e));
                          }}
                          className="shrink-0 w-[40px] h-[40px] rounded-lg flex items-center justify-center hover:bg-graphite/10 text-graphite/50 transition-colors disabled:opacity-30"
                          title="Прослушать произношение"
                      >
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </button>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 1 && ( 
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

              {activeTab === 2 && ( 
                <>
                  <Input placeholder="Полное название команды *" value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input placeholder="Короткое название *" value={formData.short_name || ''} onChange={e => handleChange('short_name', e.target.value)} />
                    <Input placeholder="Город *" value={formData.city || ''} onChange={e => handleChange('city', e.target.value)} />
                  </div>
                  
                  <textarea
                    className="w-full px-3 py-2.5 border border-graphite/40 rounded-md bg-white text-graphite text-[13px] font-medium outline-none transition-all duration-300 focus:border-orange resize-none"
                    rows="2" placeholder="Описание команды..." value={formData.description || ''} onChange={e => handleChange('description', e.target.value)}
                  />
                  <div className="flex items-center gap-3 !mt-3">
                    <Switch checked={formData.is_virtual || false} onChange={(e) => handleChange('is_virtual', e.target.checked)} />
                    <span className="text-[13px] font-bold text-graphite">Виртуальная</span>

                    {/* Цвет интерфейса команды в Кабинете команды (teams.ui_color).
                        К джерси отношения не имеет: пустое значение означает, что
                        Кабинет возьмёт акцентный цвет домашней формы. */}
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-[13px] font-bold text-graphite">Интерфейс</span>
                      <div
                        className="w-[70px] h-[22px] rounded border border-graphite/20 relative cursor-pointer overflow-hidden shrink-0"
                        title="Акцентный цвет интерфейса Кабинета команды"
                        onClick={(e) => { const i = e.currentTarget.querySelector('input'); if (e.target !== i) i.click(); }}
                      >
                        <div className="absolute inset-0 bg-white" style={{ backgroundColor: formData.ui_color || '#ffffff' }}></div>
                        {/* Хак: уводим системную палитру влево, как у полей формы ниже */}
                        <input type="color" value={formData.ui_color || '#ffffff'} onChange={e => handleChange('ui_color', e.target.value)} className="absolute top-0 -left-[120px] w-4 h-4 opacity-0 pointer-events-none" />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleChange('ui_color', '')}
                        disabled={!formData.ui_color}
                        className="text-[12px] font-bold text-graphite/50 hover:text-orange underline underline-offset-2 transition-colors disabled:opacity-30 disabled:hover:text-graphite/50"
                      >
                        Сбросить
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 !mt-3">
                    <Input placeholder="Произношение для озвучки (если отличается)" value={formData.pronunciation || ''} onChange={e => handleChange('pronunciation', e.target.value)} />
                    <button
                        type="button"
                        disabled={!formData.pronunciation && !formData.name}
                        onClick={() => {
                            const text = formData.pronunciation || formData.name;
                            fetch(`${API_BASE}/api/tts/test?text=${encodeURIComponent(text)}`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
                              .then(r => r.blob())
                              .then(blob => { const audio = new Audio(URL.createObjectURL(blob)); audio.play(); })
                              .catch(e => console.error(e));
                        }}
                        className="shrink-0 w-[40px] h-[40px] rounded-lg flex items-center justify-center hover:bg-graphite/10 text-graphite/50 transition-colors disabled:opacity-30"
                        title="Прослушать произношение"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </button>
                  </div>
                  
                  {/* ГРУППА ЭКИПИРОВКИ */}
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-graphite/10">
                    <div className="flex flex-col gap-1">
                      <Uploader 
                        key={`logo-${formResetKey}`}
                        label="Логотип" heightClass="h-[120px]" 
                        initialUrl={selectedItem ? getCachedImageUrl(selectedItem.logo_url) : null} 
                        onFileSelect={(f) => handleFileSelect('logo', f)} 
                      />
                    </div>
                    
                    {/* ДОМАШНЯЯ ФОРМА */}
                    <div className="flex flex-col gap-2">
                      <Uploader 
                        key={`jersey_dark-${formResetKey}`}
                        label="Джерси (Д)" heightClass="h-[120px]" mockText="Домашняя" isDefaultPreview={true} 
                        initialUrl={selectedItem ? getCachedImageUrl(selectedItem.jersey_dark_url) : null} 
                        onFileSelect={(f) => handleFileSelect('jersey_dark', f)} 
                      />
                      <div className="flex gap-1.5 h-[22px]">
                        <div 
                           className="flex-1 rounded border border-graphite/20 relative cursor-pointer overflow-hidden" 
                           title="Осн. цвет"
                           onClick={(e) => { const i = e.currentTarget.querySelector('input'); if(e.target !== i) i.click(); }}
                        >
                          <div className="absolute inset-0 bg-white" style={{ backgroundColor: formData.color_home_1 || '#ffffff' }}></div>
                          {/* Хак: смещаем системную палитру вправо на 120px */}
                          <input type="color" value={formData.color_home_1 || '#ffffff'} onChange={e => handleChange('color_home_1', e.target.value)} className="absolute top-0 -right-[120px] w-4 h-4 opacity-0 pointer-events-none" />
                        </div>
                        <div 
                           className="flex-1 rounded border border-graphite/20 relative cursor-pointer overflow-hidden" 
                           title="Доп. цвет"
                           onClick={(e) => { const i = e.currentTarget.querySelector('input'); if(e.target !== i) i.click(); }}
                        >
                          <div className="absolute inset-0 bg-white" style={{ backgroundColor: formData.color_home_2 || '#ffffff' }}></div>
                          <input type="color" value={formData.color_home_2 || '#ffffff'} onChange={e => handleChange('color_home_2', e.target.value)} className="absolute top-0 -right-[120px] w-4 h-4 opacity-0 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    {/* ГОСТЕВАЯ ФОРМА */}
                    <div className="flex flex-col gap-2">
                      <Uploader 
                        key={`jersey_light-${formResetKey}`}
                        label="Джерси (Г)" heightClass="h-[120px]" mockText="Гостевая" isDefaultPreview={true} 
                        initialUrl={selectedItem ? getCachedImageUrl(selectedItem.jersey_light_url) : null} 
                        onFileSelect={(f) => handleFileSelect('jersey_light', f)} 
                      />
                      <div className="flex gap-1.5 h-[22px]">
                        <div 
                           className="flex-1 rounded border border-graphite/20 relative cursor-pointer overflow-hidden" 
                           title="Осн. цвет"
                           onClick={(e) => { const i = e.currentTarget.querySelector('input'); if(e.target !== i) i.click(); }}
                        >
                          <div className="absolute inset-0 bg-white" style={{ backgroundColor: formData.color_away_1 || '#ffffff' }}></div>
                          {/* Хак: смещаем системную палитру влево на 120px, так как это крайняя колонка */}
                          <input type="color" value={formData.color_away_1 || '#ffffff'} onChange={e => handleChange('color_away_1', e.target.value)} className="absolute top-0 -left-[120px] w-4 h-4 opacity-0 pointer-events-none" />
                        </div>
                        <div 
                           className="flex-1 rounded border border-graphite/20 relative cursor-pointer overflow-hidden" 
                           title="Доп. цвет"
                           onClick={(e) => { const i = e.currentTarget.querySelector('input'); if(e.target !== i) i.click(); }}
                        >
                          <div className="absolute inset-0 bg-white" style={{ backgroundColor: formData.color_away_2 || '#ffffff' }}></div>
                          <input type="color" value={formData.color_away_2 || '#ffffff'} onChange={e => handleChange('color_away_2', e.target.value)} className="absolute top-0 -left-[120px] w-4 h-4 opacity-0 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 3 && ( 
                <div className="space-y-6">
                  <div>
                    <div className="grid grid-cols-3 gap-3">
                      <Input placeholder="Фамилия *" value={formData.last_name || ''} onChange={e => handleChange('last_name', e.target.value)} />
                      <Input placeholder="Имя *" value={formData.first_name || ''} onChange={e => handleChange('first_name', e.target.value)} />
                      <Input placeholder="Отчество" value={formData.middle_name || ''} onChange={e => handleChange('middle_name', e.target.value)} />
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <Switch checked={formData.is_virtual || false} onChange={(e) => handleChange('is_virtual', e.target.checked)} />
                      <span className="text-[13px] font-bold text-graphite">Виртуальный</span>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <Input placeholder="Произношение для озвучки (Фамилия Имя)" value={formData.pronunciation || ''} onChange={e => handleChange('pronunciation', e.target.value)} />
                      <button
                          type="button"
                          disabled={!formData.pronunciation && !formData.last_name}
                          onClick={() => {
                              const text = formData.pronunciation || `${formData.last_name || ''} ${formData.first_name || ''}`;
                              fetch(`${API_BASE}/api/tts/test?text=${encodeURIComponent(text)}`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
                                .then(r => r.blob())
                                .then(blob => { const audio = new Audio(URL.createObjectURL(blob)); audio.play(); })
                                .catch(e => console.error(e));
                          }}
                          className="shrink-0 w-[40px] h-[40px] rounded-lg flex items-center justify-center hover:bg-graphite/10 text-graphite/50 transition-colors disabled:opacity-30"
                          title="Прослушать произношение"
                      >
                          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="relative flex items-center w-full border border-graphite/40 rounded-md bg-white transition-all duration-300 focus-within:border-orange overflow-hidden">
                        <div className="pl-3 pr-2 text-[13px] text-graphite font-semibold border-r border-graphite/20 py-2.5 bg-graphite/5 h-full flex items-center shrink-0">+7</div>
                        <input type="tel" placeholder="(000) 000-00-00" value={formatPhoneDynamic(formData.phone)} onChange={handlePhoneChange} className="w-full px-3 py-2.5 bg-transparent text-graphite text-[13px] outline-none placeholder:text-graphite/40 font-medium" />
                      </div>
                      <Input placeholder="Email (необязательно)" value={formData.email || ''} onChange={e => handleChange('email', e.target.value)} />
                    </div>
                    {formData.is_virtual && (
                      <button
                        type="button"
                        onClick={handleFillVirtualPhone}
                        disabled={isFetchingVirtualPhone}
                        className="text-[12px] font-semibold text-orange hover:underline mt-1.5 disabled:opacity-50"
                      >
                        {isFetchingVirtualPhone ? 'Ищу свободный номер...' : 'Подставить свободный виртуальный номер'}
                      </button>
                    )}
                  </div>

                  <div className="pb-3">
                    <div className="grid grid-cols-3 gap-3">
                      <Input placeholder="Дата рождения" value={formData.birth_date || ''} onChange={handleBirthDateChange} />
                      <Input placeholder="Рост (см)" value={formData.height || ''} onChange={e => handleChange('height', e.target.value)} />
                      <Input placeholder="Вес (кг)" value={formData.weight || ''} onChange={e => handleChange('weight', e.target.value)} />
                    </div>
                  </div>

                  <div className="w-[150px] pt-4 border-t border-graphite/10">
                    <Uploader key={`avatar-${formResetKey}`} label="Аватар профиля" initialUrl={selectedItem ? getCachedImageUrl(selectedItem.avatar_url) : null} onFileSelect={(f) => handleFileSelect('avatar', f)} />
                  </div>
                </div>
              )}

              {activeTab === 4 && (
                <>
                  <Input placeholder="Название арены *" value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} />
                  <div className="grid grid-cols-2 gap-4">
                    <Input placeholder="Город *" value={formData.city || ''} onChange={e => handleChange('city', e.target.value)} />
                    <Input placeholder="Адрес *" value={formData.address || ''} onChange={e => handleChange('address', e.target.value)} />
                  </div>
                  <Select
                    label="Часовой пояс"
                    options={[
                      'Europe/Kaliningrad',
                      'Europe/Moscow',
                      'Europe/Samara',
                      'Asia/Yekaterinburg',
                      'Asia/Omsk',
                      'Asia/Krasnoyarsk',
                      'Asia/Irkutsk',
                      'Asia/Yakutsk',
                      'Asia/Vladivostok',
                      'Asia/Magadan',
                      'Asia/Kamchatka',
                    ]}
                    value={formData.timezone || 'Europe/Moscow'}
                    onChange={val => handleChange('timezone', val)}
                  />
                  <div className="flex items-center gap-3 mt-2">
                    <Switch checked={formData.status === 'active'} onChange={(e) => handleChange('status', e.target.checked ? 'active' : 'inactive')} />
                    <span className="text-[13px] font-bold text-graphite">{formData.status === 'active' ? 'Арена функционирует' : 'Арена закрыта'}</span>
                  </div>
                </>
              )}

              <Button type="submit" isLoading={isLoading} disabled={!isFormValid() || isLoading} className={`w-full mt-2 py-3 shadow-md transition-all duration-300 ${!isFormValid() ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}>
                {selectedItem ? 'Сохранить изменения' : 'Создать запись'}
              </Button>
            </form>
          </div>
        </div>

        <div className="flex-1 relative z-10 min-h-[500px]">
          {isLoading && tableData.length === 0 && (
            <div className="absolute inset-0 z-30 flex items-start pt-32 justify-center pointer-events-none">
              <Loader text="" />
            </div>
          )}
          <div className={`transition-opacity duration-300 ease-in-out ${isLoading && tableData.length === 0 ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}>
            <Table columns={allColumns[activeTab]} data={tableData} onRowClick={handleRowClick} rowClassName={(r) => r.id === selectedItem?.id ? 'bg-orange/5 shadow-[inset_4px_0_0_0_#FF7A00]' : ''} />
            <div ref={lastElementRef} className="h-10 w-full flex items-center justify-center mt-2">
              {isFetchingMore && <span className="text-graphite-light text-sm font-bold animate-pulse">Загрузка данных...</span>}
            </div>
          </div>
        </div>
      </div>

      <UserDuplicateWarningModal
        isOpen={!!duplicateWarning}
        onClose={() => setDuplicateWarning(null)}
        newUser={formData}
        matches={duplicateWarning?.matches || []}
        isSaving={isLoading}
        onConfirm={() => performSave(duplicateWarning.payload)}
      />

      <UserImportReviewModal
        isOpen={!!importPreviewRows}
        rows={importPreviewRows || []}
        onClose={() => setImportPreviewRows(null)}
        onConfirm={handleConfirmImport}
        isSaving={isConfirmingImport}
      />
    </div>
  );
}