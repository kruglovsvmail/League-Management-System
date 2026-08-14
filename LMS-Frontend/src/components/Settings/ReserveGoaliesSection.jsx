import React, { useState, useEffect, useRef } from 'react';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { Switch } from '../../ui/Switch';
import { Stepper } from '../../ui/Stepper';
import { Table } from '../../ui/Table2';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { getToken, getImageUrl } from '../../utils/helpers';

// Секунды на льду показываем целыми минутами: доли минуты у вратаря,
// вышедшего на один матч, ничего не добавляют.
const toMinutes = (seconds) => Math.round((seconds || 0) / 60);

const savePercent = (row) => {
  if (!row.tracks_shots || !row.shots_against) return '—';
  return `${((row.saves / row.shots_against) * 100).toFixed(1)}%`;
};

const fullName = (p) => `${p.last_name} ${p.first_name}`;

export function ReserveGoaliesSection({ divisionId, canManage, setToast, formData, onChange, isLocked }) {
  const [pool, setPool] = useState([]);
  const [stats, setStats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Поиск кандидатов по общей базе пользователей
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState(null);

  // Правка номера и заметки раскрывается аккордеоном в самой строке
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ jersey_number: '', note: '' });
  const [isSaving, setIsSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const searchTimer = useRef(null);

  const apiBase = `${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/reserve-goalies`;
  const authHeaders = () => ({ 'Authorization': `Bearer ${getToken()}` });

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(apiBase, { headers: authHeaders() });
      const data = await res.json();
      if (data.success) {
        setPool(data.data);
        setStats(data.stats);
      }
    } catch (e) {
      // Молча: раздел просто останется пустым, тост здесь только мешал бы
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (divisionId) fetchAll(); }, [divisionId]);

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
        const res = await fetch(`${apiBase}/candidates?search=${encodeURIComponent(query)}`, { headers: authHeaders() });
        const data = await res.json();
        if (data.success) setCandidates(data.data);
      } catch (e) {
        setCandidates([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, divisionId]);

  const handleAdd = async (candidate) => {
    setAddingId(candidate.id);
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: candidate.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setToast({ title: 'Успешно', message: data.message, type: 'success' });
      setCandidates(prev => prev.filter(c => c.id !== candidate.id));
      fetchAll();
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setAddingId(null);
    }
  };

  const openEdit = (row) => {
    setEditForm({ jersey_number: row.jersey_number ?? '', note: row.note || '' });
    setEditingId(row.id);
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${apiBase}/${editingId}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setToast({ title: 'Успешно', message: data.message, type: 'success' });
      setEditingId(null);
      fetchAll();
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setIsSaving(false);
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
      if (editingId === deleteTarget.id) setEditingId(null);
      setDeleteTarget(null);
      fetchAll();
    } catch (err) {
      setToast({ title: 'Ошибка', message: err.message, type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  const statsColumns = [
    {
      label: 'Вратарь',
      render: (row) => (
        <div className="flex items-center gap-3 min-w-0">
          <img src={getImageUrl(row.avatar_url || '/default/user_default.webp')} className="w-8 h-8 rounded-md object-cover bg-graphite/5 shrink-0" alt="av" />
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-graphite truncate">{fullName(row)}</div>
            <div className="text-[11px] text-graphite-light truncate">
              {(row.teams || []).map(t => `${t.team_name} (${t.games})`).join(', ') || '—'}
            </div>
          </div>
          {!row.in_pool && (
            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-graphite/10 text-graphite-light" title="Играл резервным, но сейчас его нет в списке дивизиона">
              вне списка
            </span>
          )}
        </div>
      ),
    },
    { label: 'И', width: 'w-[60px]', align: 'center', sortKey: 'games_played', render: (r) => r.games_played },
    { label: 'В', width: 'w-[60px]', align: 'center', sortKey: 'wins', render: (r) => r.wins },
    { label: 'П', width: 'w-[60px]', align: 'center', sortKey: 'losses', render: (r) => r.losses },
    { label: 'ПШ', width: 'w-[60px]', align: 'center', sortKey: 'goals_against', render: (r) => r.goals_against },
    { label: 'БР', width: 'w-[70px]', align: 'center', sortKey: 'shots_against', render: (r) => (r.tracks_shots ? r.shots_against : '—') },
    { label: 'ОБ', width: 'w-[70px]', align: 'center', sortKey: 'saves', render: (r) => (r.tracks_shots ? r.saves : '—') },
    { label: '%ОБ', width: 'w-[80px]', align: 'center', render: (r) => savePercent(r) },
    { label: 'СМ', width: 'w-[60px]', align: 'center', sortKey: 'shutouts', render: (r) => r.shutouts },
    { label: 'Мин', width: 'w-[70px]', align: 'center', render: (r) => toMinutes(r.goalie_seconds) },
    { label: 'Штр', width: 'w-[70px]', align: 'center', sortKey: 'penalty_minutes', render: (r) => r.penalty_minutes },
  ];

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader text="" /></div>;
  }

  return (
    <div className="flex flex-col gap-8 animate-zoom-in">

      {/* ПРАВИЛА ДИВИЗИОНА — сохраняются общей кнопкой формы дивизиона */}
      <div className="bg-white/70 p-6 rounded-md border border-graphite/10 flex flex-col gap-5">
        <div>
          <span className="text-[15px] font-bold text-graphite uppercase">Правила</span>
          <div className="text-[12px] text-graphite-light mt-1 leading-snug max-w-[620px]">
            Действуют в шторке «Состав на матч»: секретарь видит список резервных вратарей под заявкой
            команды, а недоступных — с пояснением, почему их взять нельзя.
          </div>
        </div>

        <div className="flex justify-between items-center gap-4 border-t border-graphite/5 pt-4">
          <div>
            <div className="text-[13px] font-semibold text-graphite">Резервных вратарей на матч</div>
            <div className="text-[11px] text-graphite-light mt-0.5 leading-tight max-w-[420px]">
              Сколько приглашённых вратарей одна команда может заявить на один матч.
            </div>
          </div>
          <Stepper
            initialValue={formData.reserve_goalie_max_per_game ?? 1}
            onChange={(v) => onChange('reserve_goalie_max_per_game', v)}
            min={1}
            max={3}
            disabled={isLocked}
          />
        </div>

        <div className="flex justify-between items-center gap-4 border-t border-graphite/5 pt-4">
          <div>
            <div className="text-[13px] font-semibold text-graphite">Нельзя два матча подряд за одну команду</div>
            <div className="text-[11px] text-graphite-light mt-0.5 leading-tight max-w-[420px]">
              Вратарь, сыгравший за команду её предыдущий матч, из списка не пропадает — кнопка
              добавления блокируется с пояснением, за какой матч он уже играл.
            </div>
          </div>
          <Switch
            checked={!!formData.reserve_goalie_block_back_to_back}
            onChange={(e) => onChange('reserve_goalie_block_back_to_back', e.target.checked)}
            disabled={isLocked}
          />
        </div>
      </div>

      {/* СПИСОК ДИВИЗИОНА */}
      <div className="flex flex-col gap-4">
        <div>
          <span className="text-[15px] font-bold text-graphite uppercase">Список дивизиона ({pool.length})</span>
          <div className="text-[12px] text-graphite-light mt-1 leading-snug max-w-[620px]">
            Кандидаты, которых команда может пригласить на матч. Список закрытый — командам он нигде
            не публикуется, договариваются офлайн. Убрать вратаря из списка можно в любой момент:
            его сыгранные матчи и статистика останутся на месте.
          </div>
        </div>

        {canManage && (
          <div className="bg-white/70 p-5 rounded-md border border-graphite/10 flex flex-col gap-4">
            <Input
              label="Добавить из общей базы"
              placeholder="Фамилия, имя, телефон или email — минимум 2 символа"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {isSearching && (
              <div className="text-[12px] text-graphite-light">Ищем…</div>
            )}

            {!isSearching && search.trim().length >= 2 && candidates.length === 0 && (
              <div className="text-[12px] text-graphite-light/70 italic">
                Никого не нашли. Либо этот человек уже в списке дивизиона.
              </div>
            )}

            {candidates.length > 0 && (
              <div className="flex flex-col gap-1 max-h-[320px] overflow-y-auto custom-scrollbar">
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
                        {/* Заявленных за команды этого дивизиона не отсекаем, но
                            показываем: решение осознанное, а не случайное */}
                        {c.division_teams?.length > 0 && (
                          <div className="text-[11px] font-semibold text-orange mt-0.5 truncate">
                            Уже заявлен в этом дивизионе: {c.division_teams.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleAdd(c)}
                      isLoading={addingId === c.id}
                      className="shrink-0 px-4 py-1.5 text-[12px]"
                    >
                      Добавить
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {pool.length === 0 ? (
          <div className="text-center bg-white/40 border border-dashed border-graphite/20 rounded-md text-graphite-light py-12 px-6">
            В этом дивизионе ещё нет резервных вратарей.
            {canManage && ' Найдите игрока в общей базе, чтобы добавить первого.'}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {pool.map(row => {
              const isEditing = editingId === row.id;
              return (
                <div
                  key={row.id}
                  className={`bg-white rounded-md border transition-all ${isEditing ? 'border-orange ring-1 ring-orange/30' : 'border-graphite/10'}`}
                >
                  <div className="flex justify-between items-start gap-4 p-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <img src={getImageUrl(row.avatar_url || '/default/user_default.webp')} className="w-10 h-10 rounded-lg object-cover bg-graphite/5 shrink-0" alt="av" />
                      <div className="min-w-0">
                        <div className="text-[14px] font-bold text-graphite truncate">
                          {row.last_name} {row.first_name} {row.middle_name || ''}
                        </div>
                        <div className="text-[12px] text-graphite-light mt-0.5 truncate">
                          {[
                            row.jersey_number != null ? `№${row.jersey_number}` : 'номер не задан',
                            row.birth_date,
                            row.phone,
                          ].filter(Boolean).join(' | ')}
                        </div>
                        {row.note && (
                          <div className="text-[12px] text-graphite-light/80 mt-0.5 truncate">{row.note}</div>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            row.games_played > 0 ? 'bg-blue-500/10 text-blue-600' : 'bg-graphite/10 text-graphite-light'
                          }`}>
                            {row.games_played > 0 ? `сыграл ${row.games_played}` : 'не играл'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => (isEditing ? setEditingId(null) : openEdit(row))}
                          className={`transition-colors ${isEditing ? 'text-orange hover:text-orange-hover' : 'text-graphite/30 hover:text-orange'}`}
                          title={isEditing ? 'Свернуть' : 'Изменить'}
                        >
                          <Icon name={isEditing ? 'close' : 'edit'} className="w-[18px] h-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(row)}
                          className="text-graphite/30 hover:text-status-rejected transition-colors"
                          title="Убрать из списка"
                        >
                          <Icon name="delete" className="w-[18px] h-[18px]" />
                        </button>
                      </div>
                    )}
                  </div>

                  {isEditing && canManage && (
                    <div className="px-4 pb-4 pt-4 border-t border-graphite/10 flex flex-col gap-4 animate-zoom-in">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input
                          label="Игровой номер"
                          placeholder="Не задан"
                          value={editForm.jersey_number}
                          onChange={(e) => setEditForm(prev => ({ ...prev, jersey_number: e.target.value.replace(/\D/g, '').slice(0, 2) }))}
                        />
                        <div className="md:col-span-2">
                          <Input
                            label="Заметка лиги"
                            placeholder="Например: играет только в будни"
                            value={editForm.note}
                            onChange={(e) => setEditForm(prev => ({ ...prev, note: e.target.value }))}
                            maxLength={255}
                          />
                        </div>
                      </div>
                      <div className="text-[11px] text-graphite-light leading-snug">
                        Номер подставится секретарю при добавлении вратаря в состав — изменить его в конкретном
                        матче он всё равно сможет. Заметка видна только в LMS.
                      </div>
                      <div className="flex gap-3">
                        <Button onClick={handleSaveEdit} isLoading={isSaving} className="flex-1">Сохранить</Button>
                        <Button onClick={() => setEditingId(null)} className="bg-white text-orange border border-orange hover:bg-orange/5">
                          Отмена
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* СТАТИСТИКА */}
      <div className="flex flex-col gap-4">
        <div>
          <span className="text-[15px] font-bold text-graphite uppercase">Статистика</span>
          <div className="text-[12px] text-graphite-light mt-1 leading-snug max-w-[620px]">
            Считается отдельно и нигде не складывается с личной статистикой игроков — ни в профиле
            игрока, ни в таблицах лидеров дивизиона, ни в кабинете команды. Регулярка и плей-офф
            вместе. Прочерк в колонках бросков — лига их не ведёт на этой стадии.
          </div>
        </div>

        {stats.length === 0 ? (
          <div className="text-center bg-white/40 border border-dashed border-graphite/20 rounded-md text-graphite-light py-12 px-6">
            Резервные вратари ещё не выходили на матчи этого дивизиона.
          </div>
        ) : (
          <div className="bg-white rounded-md border border-graphite/10 overflow-hidden">
            <Table columns={statsColumns} data={stats} />
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        isLoading={isDeleting}
        confirmLabel="Убрать"
        confirmingLabel="Убираем..."
        title="Убрать из списка"
        message={
          deleteTarget?.games_played > 0
            ? `Убрать ${fullName(deleteTarget)} из списка резервных вратарей? Сыгранные им матчи (${deleteTarget.games_played}) и статистика останутся — он просто перестанет быть доступен секретарю на новых матчах.`
            : `Убрать ${deleteTarget ? fullName(deleteTarget) : ''} из списка резервных вратарей?`
        }
      />
    </div>
  );
}
