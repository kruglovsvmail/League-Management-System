import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import dayjs from 'dayjs';
import { useAccess } from '../../hooks/useAccess';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { Switch } from '../../ui/Switch';
import { Select } from '../../ui/Select';
import { Badge } from '../../ui/Badge';
import { Table } from '../../ui/Table2';
import { AccessFallback } from '../../ui/AccessFallback';
import { Modal } from '../../modals/Modal';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { PlayerAvatarModal } from '../../modals/PlayerAvatarModal';
import { PlayerProfileModal } from '../../modals/PlayerProfileModal';
import { ReserveGoalieSettingsDrawer } from '../../modals/ReserveGoalieSettingsDrawer';
import { ReserveGoalieDocsDrawer } from '../../modals/ReserveGoalieDocsDrawer';
import { getToken, getImageUrl } from '../../utils/helpers';

// Вкладка «Резерв. вратари» в «Управлении лигой».
//
// Вратарь принадлежит лиге: заводится один раз, а в каких дивизионах он может играть,
// отмечается по сезонам (сезон выбирается над таблицей). Тумблер «Активен» общий на
// все сезоны. Выключенный вратарь и вратарь без обязательного документа не видны в
// Team Room и на сайте лиги, а у секретаря в шторке «Состав на матч» он серый с
// причиной — сами правила считает сервер (LMS-Backend/utils/reserveGoalies.js).
// Статистику резервных LMS не показывает — она есть в Team Room и на сайте лиги.

// Порядок — как в бейдже документов состава дивизиона: медсправка → полис → согласие
const DOC_TYPES = [
  { key: 'medical', reqKey: 'reserve_goalie_req_med_cert', label: 'медсправки' },
  { key: 'insurance', reqKey: 'reserve_goalie_req_insurance', label: 'страхового полиса' },
  { key: 'consent', reqKey: 'reserve_goalie_req_consent', label: 'согласия' },
];

const fullName = (p) => `${p.last_name || ''} ${p.first_name || ''}`.trim();

// Что видят команды — по тем же правилам, что у сервера, но на сегодня. Выключенного
// нет в списках Team Room и сайта лиги вовсе; без обязательного документа он там есть,
// но без телефона, с пометкой «вратарь не доступен». Дисквалификации здесь не
// учитываются: это решает шторка состава на матч.
const teamsNotice = (row, settings) => {
  if (!row.is_active) return 'Не виден командам: выключен';
  const today = dayjs().format('YYYY-MM-DD');
  for (const t of DOC_TYPES) {
    if (!settings?.[t.reqKey]) continue;
    if (!row[`${t.key}_url`]) return `Не доступен командам: нет ${t.label}`;
    const exp = row[`${t.key}_expires_at`];
    if (exp && exp < today) return `Не доступен командам: истёк срок ${t.label}`;
  }
  return null;
};

// --- Плашки дивизионов ---
//
// Порядок — от короткого названия к длинному. Влезают в одну строку — одна строка.
// Не влезают — две, и разрез выбирается так, чтобы строки вышли как можно ближе по
// длине. Набор дивизионов у всех вратарей один (дивизионы сезона), поэтому раскладка
// считается один раз на таблицу, и плашки во всех строках стоят одинаково, столбиками.
// Ширину плашки меряем по тексту (canvas) — так же, как её нарисует браузер: шрифт
// 11px bold, по 10px отступа и 1px рамки с каждой стороны.
const CHIP_FONT = '700 11px';
const CHIP_EXTRA = 22;
const CHIP_GAP = 6;

let measureCanvas = null;
const measureText = (text, font) => {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
};

const chipLabel = (d) => d.short_name || d.name;

const layoutChips = (divisions, available, fontFamily) => {
  const font = `${CHIP_FONT} ${fontFamily || 'sans-serif'}`;
  const items = divisions
    .map(d => ({ d, w: Math.ceil(measureText(chipLabel(d), font)) + CHIP_EXTRA }))
    .sort((a, b) => a.w - b.w || chipLabel(a.d).localeCompare(chipLabel(b.d)));

  const rowWidth = (from, to) => items.slice(from, to).reduce((sum, it) => sum + it.w, 0) + CHIP_GAP * (to - from - 1);
  const n = items.length;

  if (n < 2 || !available || rowWidth(0, n) <= available) {
    return [items.map(it => it.d)];
  }

  let split = 1;
  let best = Infinity;
  for (let k = 1; k < n; k++) {
    const score = Math.max(rowWidth(0, k), rowWidth(k, n));
    if (score < best) { best = score; split = k; }
  }
  return [items.slice(0, split).map(it => it.d), items.slice(split).map(it => it.d)];
};

export function ReserveGoaliesTab({ setToast }) {
  const { selectedLeague } = useOutletContext();
  const { checkAccess } = useAccess();
  const canView = checkAccess('SETTINGS_RESERVE_GOALIES_VIEW');
  const canManage = checkAccess('SETTINGS_RESERVE_GOALIES_MANAGE');

  const leagueId = selectedLeague?.id;
  const apiBase = `${import.meta.env.VITE_API_URL}/api/leagues/${leagueId}/reserve-goalies`;
  const authHeaders = () => ({ 'Authorization': `Bearer ${getToken()}` });
  const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

  const [goalies, setGoalies] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState(null);
  const [divisions, setDivisions] = useState([]);
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Поиск кандидатов по общей базе пользователей
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const searchTimer = useRef(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const [docsTarget, setDocsTarget] = useState(null);
  const [isSavingDocs, setIsSavingDocs] = useState(false);

  const [photoTarget, setPhotoTarget] = useState(null);
  const [isSavingPhoto, setIsSavingPhoto] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({ jersey_number: '', note: '' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [profilePlayerId, setProfilePlayerId] = useState(null);

  // Ширина ячейки дивизионов — по ней решается, в одну строку плашки или в две.
  // Меряем ячейку первой строки таблицы: при fixedLayout у всех строк она одинаковая.
  const [chipsWidth, setChipsWidth] = useState(0);
  const [chipsFontFamily, setChipsFontFamily] = useState(null);
  const [fontsVersion, setFontsVersion] = useState(0);
  const chipsObserverRef = useRef(null);

  const chipsMeasureRef = useCallback((el) => {
    chipsObserverRef.current?.disconnect();
    chipsObserverRef.current = null;
    if (!el) return;
    setChipsFontFamily(getComputedStyle(el).fontFamily);
    const update = () => setChipsWidth(el.clientWidth);
    update();
    if (typeof ResizeObserver !== 'undefined') {
      chipsObserverRef.current = new ResizeObserver(update);
      chipsObserverRef.current.observe(el);
    }
  }, []);

  useEffect(() => () => chipsObserverRef.current?.disconnect(), []);

  // Шрифт мог догрузиться после первого замера — тогда ширины надписей другие
  useEffect(() => {
    document.fonts?.ready?.then(() => setFontsVersion(v => v + 1));
  }, []);

  const chipRows = useMemo(
    () => layoutChips(divisions, chipsWidth, chipsFontFamily),
    [divisions, chipsWidth, chipsFontFamily, fontsVersion]
  );

  // Сезон не передан — сервер сам выберет активный и вернёт, какой взял
  const fetchAll = async (season = seasonId, { silent = false } = {}) => {
    if (!leagueId) return;
    if (!silent) setIsLoading(true);
    try {
      const query = season ? `?season_id=${season}` : '';
      const res = await fetch(`${apiBase}${query}`, { headers: authHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setGoalies(data.data);
      setSeasons(data.seasons);
      setSeasonId(data.season_id);
      setDivisions(data.divisions);
      setSettings(data.settings);
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message || 'Не удалось загрузить резервных вратарей', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (leagueId && canView) fetchAll(null);
  }, [leagueId, canView]);

  // Поиск с задержкой: общая база большая, дёргать её на каждую букву незачем
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const query = search.trim();
    if (query.length < 2) {
      setCandidates([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`${apiBase}/candidates?search=${encodeURIComponent(query)}${seasonId ? `&season_id=${seasonId}` : ''}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setCandidates(data.data);
      } catch (e) {
        setCandidates([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, leagueId]);

  const patchLocal = (id, patch) => setGoalies(prev => prev.map(g => (g.id === id ? { ...g, ...patch } : g)));

  const handleSeasonChange = (value) => {
    setSeasonId(value);
    fetchAll(value);
  };

  const handleAdd = async (candidate) => {
    setAddingId(candidate.id);
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ player_id: candidate.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setToast({ title: 'Успешно', message: `${data.message}. Отметьте дивизионы, в которых он может играть.`, type: 'success' });
      setCandidates(prev => prev.filter(c => c.id !== candidate.id));
      fetchAll(seasonId, { silent: true });
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setAddingId(null);
    }
  };

  // Тумблер и галочки дивизионов меняются сразу, без перезагрузки списка; при ошибке
  // возвращаем как было
  const handleToggleActive = async (row) => {
    const next = !row.is_active;
    patchLocal(row.id, { is_active: next });
    try {
      const res = await fetch(`${apiBase}/${row.id}`, {
        method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ is_active: next }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (err) {
      patchLocal(row.id, { is_active: row.is_active });
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    }
  };

  const handleToggleDivision = async (row, divisionId) => {
    const ids = row.division_ids || [];
    const checked = !ids.includes(divisionId);
    const nextIds = checked ? [...ids, divisionId] : ids.filter(id => id !== divisionId);
    patchLocal(row.id, { division_ids: nextIds });
    try {
      const res = await fetch(`${apiBase}/${row.id}/divisions/${divisionId}`, {
        method: 'PUT', headers: jsonHeaders(), body: JSON.stringify({ checked }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    } catch (err) {
      // Откатываем только эту галочку: соседние щелчки могли уже пройти
      setGoalies(prev => prev.map(g => {
        if (g.id !== row.id) return g;
        const cur = g.division_ids || [];
        return { ...g, division_ids: checked ? cur.filter(id => id !== divisionId) : [...cur, divisionId] };
      }));
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    }
  };

  const openEdit = (row) => {
    setEditForm({ jersey_number: row.jersey_number ?? '', note: row.note || '' });
    setEditTarget(row);
  };

  const handleSaveEdit = async () => {
    setIsSavingEdit(true);
    try {
      const res = await fetch(`${apiBase}/${editTarget.id}`, {
        method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      patchLocal(editTarget.id, {
        jersey_number: editForm.jersey_number === '' ? null : Number(editForm.jersey_number),
        note: editForm.note.trim() || null,
      });
      setToast({ title: 'Успешно', message: data.message, type: 'success' });
      setEditTarget(null);
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleSavePhoto = async (file, cleared) => {
    if (!file && !cleared) { setPhotoTarget(null); return; }
    setIsSavingPhoto(true);
    try {
      let res;
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        res = await fetch(`${apiBase}/${photoTarget.id}/photo`, { method: 'POST', headers: authHeaders(), body: formData });
      } else {
        res = await fetch(`${apiBase}/${photoTarget.id}/photo`, { method: 'DELETE', headers: authHeaders() });
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setPhotoTarget(null);
      fetchAll(seasonId, { silent: true });
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setIsSavingPhoto(false);
    }
  };

  // Необязательные документы шторка не показывает и присылает null — такие поля
  // на сервер не уходят вовсе, и их значения в базе не трогаются
  const handleSaveDocs = async ({ medFile, medCleared, medExp, insFile, insCleared, insExp, consentFile, consentCleared, consentExp }) => {
    setIsSavingDocs(true);
    try {
      const formData = new FormData();
      formData.append('season_id', seasonId);
      if (medFile) formData.append('medical', medFile);
      if (medCleared) formData.append('medical_cleared', 'true');
      if (medExp !== null) formData.append('medical_expires_at', medExp);
      if (insFile) formData.append('insurance', insFile);
      if (insCleared) formData.append('insurance_cleared', 'true');
      if (insExp !== null) formData.append('insurance_expires_at', insExp);
      if (consentFile) formData.append('consent', consentFile);
      if (consentCleared) formData.append('consent_cleared', 'true');
      if (consentExp !== null) formData.append('consent_expires_at', consentExp);

      const res = await fetch(`${apiBase}/${docsTarget.id}/docs`, { method: 'POST', headers: authHeaders(), body: formData });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setToast({ title: 'Успешно', message: data.message, type: 'success' });
      setDocsTarget(null);
      fetchAll(seasonId, { silent: true });
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setIsSavingDocs(false);
    }
  };

  const handleSaveSettings = async (form) => {
    setIsSavingSettings(true);
    try {
      const res = await fetch(`${apiBase}/settings`, { method: 'PUT', headers: jsonHeaders(), body: JSON.stringify(form) });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setSettings(data.data);
      setToast({ title: 'Успешно', message: data.message, type: 'success' });
      setIsSettingsOpen(false);
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setIsSavingSettings(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${apiBase}/${deleteTarget.id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setToast({ title: 'Успешно', message: data.message, type: 'success' });
      setGoalies(prev => prev.filter(g => g.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  if (!canView) {
    return <AccessFallback variant="full" message="У вас нет прав для просмотра резервных вратарей лиги." />;
  }

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader text="" /></div>;
  }

  const required = {
    medical: !!settings?.reserve_goalie_req_med_cert,
    insurance: !!settings?.reserve_goalie_req_insurance,
    consent: !!settings?.reserve_goalie_req_consent,
  };
  // Документы у резерва ведутся, только если лига сделала обязательным хоть один
  const requiredDocTypes = DOC_TYPES.filter(t => settings?.[t.reqKey]);
  const seasonName = seasons.find(s => s.id === seasonId)?.name;

  // Бейдж документов как в составе дивизиона: часть на каждый обязательный документ,
  // закрашена у приложенного; истёкший или истекающий красит бейдж целиком
  const renderDocsBadge = (row) => {
    const segments = requiredDocTypes.map(t => !!row[`${t.key}_url`]);

    const today = dayjs().startOf('day');
    let isExpired = false;
    let minDaysLeft = Infinity;
    requiredDocTypes.forEach(t => {
      const exp = row[`${t.key}_expires_at`];
      if (!row[`${t.key}_url`] || !exp) return;
      const daysLeft = dayjs(exp).startOf('day').diff(today, 'day');
      if (daysLeft < 0) isExpired = true;
      else if (daysLeft <= 7 && daysLeft < minDaysLeft) minDaysLeft = daysLeft;
    });

    let type = 'empty';
    let text = 'Док.';
    if (isExpired) { type = 'expired'; text = 'Истек'; }
    else if (minDaysLeft <= 7) { type = 'expiring'; text = `${minDaysLeft} дн.`; }

    return (
      <div onClick={() => setDocsTarget(row)} className="cursor-pointer hover:scale-105 inline-block transition-transform" title="Документы">
        <Badge label={text} type={type} segments={segments} />
      </div>
    );
  };

  const renderDivisionChips = (row, index) => {
    if (divisions.length === 0) {
      return <span className="text-[12px] text-graphite-light/70 italic">В сезоне нет дивизионов</span>;
    }
    const ids = row.division_ids || [];
    return (
      <div ref={index === 0 ? chipsMeasureRef : undefined} className="w-full flex flex-col gap-1.5">
        {chipRows.map((chips, rowIndex) => (
          <div key={rowIndex} className="flex flex-wrap gap-1.5">
            {chips.map(d => {
              const isOn = ids.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={!canManage}
                  onClick={() => handleToggleDivision(row, d.id)}
                  title={d.name}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold border whitespace-nowrap transition-colors ${
                    isOn
                      ? 'bg-orange text-white border-orange'
                      : 'bg-white text-graphite/50 border-graphite/15'
                  } ${canManage ? (isOn ? '' : 'hover:border-orange hover:text-orange') : 'cursor-default'}`}
                >
                  {chipLabel(d)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  // fixedLayout: у всех колонок, кроме дивизионов, ширина задана — дивизионы забирают
  // весь остаток, и ширина их ячейки не зависит от содержимого (по ней считаются строки)
  const columns = [
    {
      label: '№',
      width: 'w-[44px]', align: 'center',
      render: (row, index) => <span className="text-[12px] text-graphite/50 font-mono">{index + 1}</span>,
    },
    {
      // Игровой номер — плашкой на углу фото: отдельная колонка под две цифры
      // забирала место у дивизионов
      label: 'Фото',
      width: 'w-[76px] text-center',
      render: (row) => (
        <div className="relative w-10 h-10 mx-auto">
          <div
            onClick={() => canManage && setPhotoTarget(row)}
            title={canManage ? 'Фото от лиги' : undefined}
            className={`w-10 h-10 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10 shadow-sm ${canManage ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
          >
            <img src={getImageUrl(row.avatar_url || '/default/user_default.webp')} alt="avatar" className="w-full h-full object-cover" />
          </div>
          {row.jersey_number != null && (
            <span
              onClick={() => canManage && openEdit(row)}
              title="Игровой номер"
              className={`absolute -right-2 -bottom-1.5 min-w-[20px] h-[18px] px-1 rounded-md bg-graphite text-white text-[10px] font-black leading-[18px] text-center shadow-sm ${canManage ? 'cursor-pointer hover:bg-orange transition-colors' : ''}`}
            >
              {row.jersey_number}
            </span>
          )}
        </div>
      ),
    },
    {
      label: 'ФИО',
      sortKey: 'last_name',
      width: 'w-[230px]',
      render: (row) => {
        const notice = teamsNotice(row, settings);
        return (
          <div className="flex flex-col min-w-0">
            <span
              onClick={() => setProfilePlayerId(row.player_id)}
              className="font-bold text-graphite text-[14px] truncate cursor-pointer hover:text-orange transition-colors"
              title={`${fullName(row)} ${row.middle_name || ''}`}
            >
              {fullName(row)}
            </span>
            <span className="text-[12px] text-graphite/50 font-medium truncate">
              {[row.middle_name, row.phone].filter(Boolean).join(' | ')}
            </span>
            {row.note && <span className="text-[11px] text-graphite-light/80 truncate" title={row.note}>{row.note}</span>}
            {notice && (
              <span className="text-[11px] font-semibold text-status-rejected truncate" title={notice}>{notice}</span>
            )}
          </div>
        );
      },
    },
    ...(requiredDocTypes.length > 0
      ? [{ label: 'Докум.', width: 'w-[84px]', align: 'center', render: renderDocsBadge }]
      : []),
    {
      label: seasonName ? `Дивизионы · ${seasonName}` : 'Дивизионы',
      render: renderDivisionChips,
    },
    {
      label: 'Вкл.',
      sortKey: 'is_active',
      width: 'w-[76px]', align: 'center',
      render: (row) => (
        <div className="flex justify-center">
          <Switch checked={!!row.is_active} onChange={() => canManage && handleToggleActive(row)} disabled={!canManage} />
        </div>
      ),
    },
    ...(canManage ? [{
      label: '',
      width: 'w-[76px]', align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2.5">
          <button type="button" onClick={() => openEdit(row)} className="text-graphite/30 hover:text-orange transition-colors" title="Номер и заметка">
            <Icon name="edit" className="w-[18px] h-[18px]" />
          </button>
          <button type="button" onClick={() => setDeleteTarget(row)} className="text-graphite/30 hover:text-status-rejected transition-colors" title="Убрать из резерва">
            <Icon name="delete" className="w-[18px] h-[18px]" />
          </button>
        </div>
      ),
    }] : []),
  ];

  const cardClass = 'bg-white/40 backdrop-blur-md border border-white/50 rounded-xl shadow-sm';

  return (
    <div className="flex flex-col gap-6 animate-zoom-in">
      {!canManage && (
        <AccessFallback variant="readonly" message="У вас нет прав для управления резервными вратарями. Вы находитесь в режиме просмотра." />
      )}

      {settings && !settings.reserve_goalies_enabled && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-status-pending/10 border border-status-pending/30">
          <Icon name="alert" className="w-5 h-5 text-status-pending shrink-0" />
          <div className="text-[13px] text-graphite leading-snug">
            Механика резервных вратарей у лиги выключена: секретарь их не видит, в Team Room и на сайте лиги
            списка нет. Включается в «Параметрах».
          </div>
        </div>
      )}

      {/* СПИСОК: заголовок с сезоном и параметрами, под ним таблица */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="flex items-center justify-between gap-4 flex-wrap px-5 py-4 border-b border-graphite/10">
          <div className="flex items-center gap-2.5">
            <Icon name="swap" className="w-4 h-4 shrink-0 text-graphite/40" />
            <h4 className="text-[13px] font-black uppercase text-graphite tracking-tight">Резерв лиги</h4>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-graphite/10 text-graphite/60">{goalies.length}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-[200px]">
              <Select
                options={seasons.map(s => ({ value: s.id, label: s.name }))}
                value={seasonId}
                onChange={handleSeasonChange}
                placeholder="Сезон"
              />
            </div>
            <Button onClick={() => setIsSettingsOpen(true)} className="shrink-0">
              <Icon name="settings" className="w-4 h-4" />
              Параметры
            </Button>
          </div>
        </div>

        {goalies.length === 0 ? (
          <div className="text-center text-graphite-light py-12 px-6">
            В резерве лиги пока нет вратарей.
            {canManage && ' Найдите игрока в общей базе ниже, чтобы добавить первого.'}
          </div>
        ) : (
          <Table
            columns={columns}
            data={goalies}
            fixedLayout
            cellPadding="py-3"
            rowClassName={(row) => (row.is_active ? '' : 'opacity-60')}
          />
        )}
      </div>

      {/* ДОБАВЛЕНИЕ: отдельным блоком под таблицей */}
      {canManage && (
        <div className={`${cardClass} p-5 flex flex-col gap-4`}>
          <div>
            <div className="flex items-center gap-2.5">
              <Icon name="user_plus" className="w-4 h-4 shrink-0 text-graphite/40" />
              <h4 className="text-[13px] font-black uppercase text-graphite tracking-tight">Добавить вратаря</h4>
            </div>
            <p className="text-[12px] text-graphite-light mt-1 leading-snug">
              Поиск по общей базе: фамилия, имя, телефон или email — от двух символов.
            </p>
          </div>

          <div className="w-full max-w-[420px]">
            <Input
              placeholder="Например, Иванов"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {search.trim().length >= 2 && (
            isSearching ? (
              <div className="text-[12px] text-graphite-light">Ищем…</div>
            ) : candidates.length === 0 ? (
              <div className="text-[12px] text-graphite-light/70 italic">
                Никого не нашли. Либо этот человек уже в резерве лиги.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-2 max-h-[340px] overflow-y-auto custom-scrollbar">
                {candidates.map(c => (
                  <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-md border border-graphite/10 bg-white hover:border-orange transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={getImageUrl(c.avatar_url || '/default/user_default.webp')} className="w-9 h-9 rounded-lg object-cover bg-graphite/5 shrink-0" alt="av" />
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-graphite truncate">
                          {c.last_name} {c.first_name} {c.middle_name || ''}
                        </div>
                        <div className="text-[11px] text-graphite-light truncate">
                          {[c.birth_date, c.phone, (c.current_teams || []).join(', ')].filter(Boolean).join(' | ') || 'Нет данных'}
                        </div>
                        {/* Заявленных за команды лиги не отсекаем, но показываем:
                            решение осознанное, а не случайное */}
                        {c.league_teams?.length > 0 && (
                          <div className="text-[11px] font-semibold text-orange mt-0.5 truncate">
                            Заявлен в лиге в этом сезоне: {c.league_teams.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button onClick={() => handleAdd(c)} isLoading={addingId === c.id} className="shrink-0 px-4 py-1.5 text-[12px]">
                      Добавить
                    </Button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}

      <ReserveGoalieSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
        isSaving={isSavingSettings}
        canManage={canManage}
      />

      <ReserveGoalieDocsDrawer
        isOpen={docsTarget !== null}
        onClose={() => setDocsTarget(null)}
        goalie={docsTarget}
        seasonName={seasonName}
        required={required}
        onSave={handleSaveDocs}
        isSaving={isSavingDocs}
        canManage={canManage}
      />

      <PlayerAvatarModal
        isOpen={photoTarget !== null}
        onClose={() => setPhotoTarget(null)}
        title="Фото от лиги"
        label=""
        initialAvatar={photoTarget?.league_photo_url ? getImageUrl(photoTarget.league_photo_url) : null}
        onSave={handleSavePhoto}
        isSaving={isSavingPhoto}
      />

      <Modal isOpen={editTarget !== null} onClose={() => setEditTarget(null)} title={editTarget ? fullName(editTarget) : ''} size="normal">
        <div className="flex flex-col gap-4">
          <Input
            label="Игровой номер"
            placeholder="Не задан"
            value={editForm.jersey_number}
            onChange={(e) => setEditForm(prev => ({ ...prev, jersey_number: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
          />
          <Input
            label="Заметка лиги"
            placeholder="Например: играет только в будни"
            value={editForm.note}
            onChange={(e) => setEditForm(prev => ({ ...prev, note: e.target.value }))}
            maxLength={255}
          />
          <div className="text-[11px] text-graphite-light leading-snug">
            Номер подставится секретарю при добавлении вратаря в состав — в конкретном матче его можно
            изменить. Заметку видят и команды: она показывается в списке резервных в Team Room и на сайте лиги.
          </div>
          <div className="flex justify-end pt-4 border-t border-graphite/10">
            <Button onClick={handleSaveEdit} isLoading={isSavingEdit}>Сохранить</Button>
          </div>
        </div>
      </Modal>

      <PlayerProfileModal isOpen={!!profilePlayerId} onClose={() => setProfilePlayerId(null)} playerId={profilePlayerId} />

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        confirmLabel="Убрать"
        confirmingLabel="Убираем..."
        title="Убрать из резерва"
        message={
          deleteTarget?.games_played > 0
            ? `Убрать ${fullName(deleteTarget)} из резерва лиги? Сыгранные им матчи (${deleteTarget.games_played}) и статистика останутся. Если он просто временно недоступен, лучше выключить тумблер «Активен».`
            : `Убрать ${deleteTarget ? fullName(deleteTarget) : ''} из резерва лиги?`
        }
      />
    </div>
  );
}
