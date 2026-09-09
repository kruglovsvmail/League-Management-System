import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Uploader } from '../ui/Uploader';
import { Calendar } from '../ui/Calendar';
import { ConfirmModal } from './ConfirmModal';
import { DOCUMENT_ACCEPT } from '../utils/uploadFormats';
import { getImageUrl, getToken } from '../utils/helpers';

// Командный документ — одна бумага со списком игроков внутри (типовой пример: медицинское
// заключение по приложению N2 к приказу Минздрава N 1144н). Отдельной сущности под неё нет:
// файл раскладывается копиями по отмеченным игрокам и дальше живёт у каждого как личный
// документ — со своей плиткой, своим сроком и своим удалением.
//
// Отмечает игроков лига сама: в списке справки есть не все, а кого-то могли и не допустить.
// Согласия здесь нет намеренно: его подписывает каждый лично, общего согласия не бывает.
export const TEAM_DOC_META = {
  medical: {
    title: 'Мед. справка команды',
    short: 'Мед. справка',
    // Флаг дивизиона, включающий этот документ
    reqKey: 'req_med_cert',
    fileLabel: 'Файл справки',
    empty: 'Справка не загружена',
    loaded: 'Справка загружена',
    replaced: 'Справка будет заменена',
  },
  insurance: {
    title: 'Полис команды',
    short: 'Страховой полис',
    reqKey: 'req_insurance',
    fileLabel: 'Файл полиса',
    empty: 'Полис не загружен',
    loaded: 'Полис загружен',
    replaced: 'Полис будет заменён',
  },
};

const toDateInputValue = (value) => (value ? String(value).slice(0, 10) : '');

const formatDate = (value) => {
  const iso = toDateInputValue(value);
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

const formatForDB = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fullName = (p) => `${p.last_name || ''} ${p.first_name || ''}`.trim();
const personPhoto = (p) => getImageUrl(p.team_member_photo_url || p.user_avatar_url || '/default/user_default.webp');

export function TeamDocsBulkDrawer({ isOpen, onClose, teamApp, roster = [], staff = [], docTypes = ['medical'], onSaved, showToast }) {
  // Дивизион может требовать и справку, и полис — тогда шторка одна, а тип переключается
  // внутри: это два разных документа, и файл со сроком у каждого свой.
  const [activeType, setActiveType] = useState(docTypes[0]);

  const meta = TEAM_DOC_META[activeType] || TEAM_DOC_META.medical;
  const urlKey = `${activeType}_url`;
  const expiresKey = `${activeType}_expires_at`;

  // В списке и состав, и штаб: документы лежат на человеке в заявке, и играющий тренер
  // в бумажной справке обычно идёт общей строкой. В списке он ровно один — иначе получил
  // бы две отметки на один комплект документов.
  const players = useMemo(() => {
    const byUser = new Map();
    [...roster, ...staff].forEach(p => {
      const key = String(p.player_id);
      if (!byUser.has(key)) byUser.set(key, p);
    });
    return [...byUser.values()].sort((a, b) => fullName(a).localeCompare(fullName(b), 'ru'));
  }, [roster, staff]);

  const [file, setFile] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');

  // Открытие всегда начинается с первого требуемого типа
  useEffect(() => {
    if (isOpen) setActiveType(docTypes[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Каждое открытие (и смена типа) начинается с чистого листа. По умолчанию отмечены те, у кого
  // документа ещё нет: обычный случай — документ на всю команду, а замену уже загруженного файла
  // лига отмечает осознанно.
  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setExpiresAt(null);
    setSearch('');
    setError('');
    setConfirmOpen(false);
    setSelectedIds(new Set(players.filter(p => !p[urlKey]).map(p => String(p.player_id))));
    // Без players в зависимостях: roster приходит новым массивом на каждую перерисовку карточки
    // дивизиона, и с ним отметки сбрасывались бы прямо под руками.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeType]);

  const filtered = players.filter(p => `${fullName(p)} ${p.middle_name || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const replacedCount = players.filter(p => selectedIds.has(String(p.player_id)) && p[urlKey]).length;

  const toggle = (rosterId) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(rosterId)) next.delete(rosterId); else next.add(rosterId);
    return next;
  });

  const setAll = (checked) => setSelectedIds(checked ? new Set(players.map(p => String(p.player_id))) : new Set());

  const apply = async () => {
    setIsSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', activeType);
      formData.append('expires_at', formatForDB(expiresAt));
      formData.append('userIds', JSON.stringify([...selectedIds].map(Number)));

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/tournament-teams/${teamApp.id}/roster-docs/bulk`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
      });
      const data = await res.json();

      if (data.success) {
        setConfirmOpen(false);
        const count = data.updated ?? selectedIds.size;
        showToast?.('Успешно', `Документ добавлен ${count} ${count === 1 ? 'человеку' : 'людям'}`, 'success');
        onSaved?.();
        onClose();
      } else {
        setConfirmOpen(false);
        setError(data.error || 'Не удалось применить документ');
      }
    } catch (err) {
      console.error('Ошибка массовой загрузки документа:', err);
      setConfirmOpen(false);
      setError('Сбой связи с сервером');
    } finally {
      setIsSaving(false);
    }
  };

  // Замена файла безвозвратна (прежний удаляется из хранилища) — спрашиваем, только если
  // под замену действительно кто-то попал.
  const handleSubmit = () => {
    if (!file || selectedIds.size === 0 || isSaving) return;
    if (replacedCount > 0) setConfirmOpen(true);
    else apply();
  };

  if (!teamApp) return null;

  const drawerContent = (
    <div className={`fixed inset-0 z-[35] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className={`absolute top-0 right-0 h-full w-full max-w-[1100px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite tracking-wide uppercase">
            {meta.title}{teamApp.name ? `: ${teamApp.name}` : ''}
          </h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="flex-1 p-6 md:p-8 overflow-hidden flex gap-8">

          {/* Левая колонка: сам документ */}
          <div className="w-[360px] shrink-0 flex flex-col gap-5">
            {docTypes.length > 1 && (
              <div className="flex gap-2">
                {docTypes.map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveType(type)}
                    className={`px-3 py-2 rounded-md text-[11px] font-black uppercase tracking-wider border transition-colors ${
                      activeType === type
                        ? 'border-orange text-orange bg-orange/10'
                        : 'border-graphite/20 text-graphite/60 bg-white hover:text-graphite'
                    }`}
                  >
                    {TEAM_DOC_META[type].short}
                  </button>
                ))}
              </div>
            )}

            {/* Скроллится только середина: кнопка «Применить» приколота к низу колонки и не
                уезжает за край экрана на невысоких мониторах. */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col gap-5">
              <div className="flex flex-col gap-[15px] bg-white p-6 rounded-2xl border border-graphite/10 shadow-sm">
                <span className="text-[12px] font-bold text-graphite-light uppercase tracking-wide">{meta.fileLabel}</span>
                {/* key по типу: у аплоадера своё внутреннее превью, и при смене типа его надо
                    пересоздать — иначе рядом с новым документом висел бы файл прежнего. */}
                <Uploader
                  key={activeType}
                  heightClass="h-[100px]"
                  accept={DOCUMENT_ACCEPT}
                  onFileSelect={(selected, cleared) => setFile(cleared ? null : selected)}
                />

                <span className="text-[12px] font-bold text-graphite-light uppercase tracking-wide">Действует до</span>
                <Calendar value={expiresAt} onChange={setExpiresAt} />
              </div>

              {error && (
                <div className="p-4 bg-status-rejected/10 border border-status-rejected/20 rounded-md text-[13px] font-bold text-status-rejected">
                  {error}
                </div>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              isLoading={isSaving}
              disabled={!file || selectedIds.size === 0 || isSaving}
              className={`w-full py-3 shrink-0 transition-all ${!file || selectedIds.size === 0 ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
            >
              {!file
                ? 'Выберите файл'
                : selectedIds.size === 0
                  ? 'Отметьте людей'
                  : `Применить к ${selectedIds.size} ${selectedIds.size === 1 ? 'человеку' : 'людям'}`}
            </Button>
          </div>

          {/* Правая колонка: кому применяем */}
          <div className="flex-1 min-w-0 flex flex-col bg-white border border-graphite/10 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-graphite/10 bg-graphite/[0.02] shrink-0 flex items-center gap-4">
              <h3 className="text-[14px] font-black uppercase text-graphite shrink-0">Кому применить</h3>
              <Input
                placeholder="Поиск по ФИО..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 px-2 py-2 text-[12px]"
              />
              <button
                type="button"
                onClick={() => setAll(selectedIds.size !== players.length)}
                className="shrink-0 text-[12px] font-bold text-graphite-light hover:text-orange transition-colors"
              >
                {selectedIds.size === players.length ? 'Снять всё' : 'Выбрать всех'}
              </button>
            </div>

            {/* Список алфавитный и общий, без разбивки по амплуа: его сверяют построчно
                с бумажной справкой, где фамилии идут одним столбцом. */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
              {filtered.length === 0 ? (
                <div className="py-10 text-center text-[13px] font-bold text-graphite/40">
                  {players.length === 0 ? 'В заявке никого нет' : 'По запросу никого нет'}
                </div>
              ) : filtered.map(player => {
                const checked = selectedIds.has(String(player.player_id));
                const hasDoc = !!player[urlKey];
                const expires = formatDate(player[expiresKey]);

                return (
                  <div
                    key={player.player_id}
                    onClick={() => toggle(String(player.player_id))}
                    className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer select-none transition-colors ${
                      checked ? 'border-orange bg-orange/5' : 'border-graphite/10 bg-white hover:bg-graphite/[0.03]'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded shrink-0 flex items-center justify-center border transition-colors ${
                      checked ? 'bg-orange border-orange text-white' : 'border-graphite/25 text-transparent'
                    }`}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>

                    <img src={personPhoto(player)} alt="" className="w-9 h-9 rounded-md object-cover bg-graphite/5 shrink-0" />

                    <div className="min-w-0 flex flex-col flex-1">
                      <span className="text-[13px] font-bold text-graphite leading-tight truncate">
                        {player.last_name} {player.first_name}
                      </span>
                      {player.middle_name && (
                        <span className="text-[11px] text-graphite-light truncate mt-[2px]">{player.middle_name}</span>
                      )}
                    </div>

                    <span className={`shrink-0 text-[12px] font-bold ${
                      checked && hasDoc ? 'text-status-rejected' : hasDoc ? 'text-graphite' : 'text-graphite-light/70'
                    }`}>
                      {checked && hasDoc
                        ? meta.replaced
                        : hasDoc
                          ? (expires ? `Действует до ${expires}` : meta.loaded)
                          : meta.empty}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={apply}
        isLoading={isSaving}
        title="Заменить загруженные файлы?"
        message={`У ${replacedCount} из отмеченных игроков файл уже загружен. Он будет заменён этой справкой и удалён из хранилища безвозвратно.`}
        confirmLabel="Применить"
        confirmingLabel="Применяем..."
      />
    </div>
  );

  return createPortal(drawerContent, document.body);
}
