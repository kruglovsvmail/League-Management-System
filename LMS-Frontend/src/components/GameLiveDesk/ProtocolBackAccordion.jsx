// src/components/GameLiveDesk/ProtocolBackAccordion.jsx
//
// Оборотная сторона протокола: то, что печатается на второй странице PDF и не выводится
// из событий матча — проверка игроков и текстовые блоки замечаний/уведомлений.
// Данные лежат в game_player_checks и game_protocol_notes, читает их шаблон протокола
// (LMS-Backend/src/protocols/protocol-default.js).
import React, { useState, useEffect, useMemo } from 'react';
import { getToken } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';

const CHECK_RESULT_OPTIONS = [
  { value: 'match', label: 'Соответствует' },
  { value: 'mismatch', label: 'Не соответствует' },
  { value: 'not_presented', label: 'Не предъявил' },
];

const PROTEST_OPTIONS = [
  { value: '', label: '—' },
  { value: 'yes', label: 'Да' },
  { value: 'no', label: 'Нет' },
];

const EMPTY_NOTES = {
  referee_notes: '',
  inspector_notes: '',
  medical_notes: '',
  home_protest_filed: null,
  home_protest_text: '',
  away_protest_filed: null,
  away_protest_text: '',
};

const EMPTY_ROW = {
  team_id: '', player_id: '', jersey_number: '',
  check_result: '', checked_rep_id: '', checking_rep_id: '',
};

// В БД отметка о протесте — boolean или NULL («не указано»), в Select — строка.
const flagToOption = (value) => (value === true ? 'yes' : value === false ? 'no' : '');
const optionToFlag = (value) => (value === 'yes' ? true : value === 'no' ? false : null);

const NoteField = ({ label, value, rows, onChange, disabled }) => (
  <div className="flex flex-col w-full">
    <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide leading-snug">
      {label}
    </span>
    <textarea
      value={value || ''}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="Не заполнено — в протоколе останутся пустые линованные строки"
      className={`w-full px-3 py-2.5 rounded-md font-medium text-[13px] outline-none resize-y transition-all duration-300
        border border-graphite/40 bg-white/70 text-graphite
        focus:border-orange focus:shadow-[0_0_0_3px_rgba(255,122,0,0.2)]
        ${disabled ? 'opacity-60 cursor-not-allowed !bg-gray-50' : ''}`}
    />
  </div>
);

export const ProtocolBackAccordion = ({ game, homeRoster = [], awayRoster = [], isReadOnly, setToast }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [notes, setNotes] = useState(EMPTY_NOTES);
  const [checks, setChecks] = useState([]);
  const [teamMembers, setTeamMembers] = useState({ home: [], away: [] });

  const gameId = game?.id;
  const headers = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/protocol-back`, { headers });
        const json = await res.json();
        if (cancelled || !json.success) return;
        setNotes({ ...EMPTY_NOTES, ...json.data.notes });
        // Пустую таблицу показываем одной заготовленной строкой, чтобы не заставлять
        // секретаря сначала жать «добавить».
        setChecks(json.data.checks.length > 0 ? json.data.checks : [{ ...EMPTY_ROW }]);
        setTeamMembers(json.data.teamMembers || { home: [], away: [] });
        setIsDirty(false);
      } catch (err) {
        console.error('Ошибка загрузки оборота протокола:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [gameId]);

  const teamOptions = useMemo(() => ([
    { value: game?.home_team_id, label: `«А» ${game?.home_team_name || ''}`.trim() },
    { value: game?.away_team_id, label: `«Б» ${game?.away_team_name || ''}`.trim() },
  ]), [game?.home_team_id, game?.away_team_id, game?.home_team_name, game?.away_team_name]);

  const isHome = (teamId) => String(teamId) === String(game?.home_team_id);

  // Игроки той команды, что выбрана в строке. Пока команда не выбрана, список пуст.
  const playerOptions = (teamId) => {
    if (!teamId) return [];
    const roster = isHome(teamId) ? homeRoster : awayRoster;
    return [...roster]
      .sort((a, b) => (parseInt(a.jersey_number, 10) || 0) - (parseInt(b.jersey_number, 10) || 0))
      .map(p => ({
        value: p.player_id,
        label: `${p.jersey_number || '—'} · ${p.last_name} ${p.first_name || ''}`.trim(),
      }));
  };

  // Представителя проверяемой команды берём из заявки той же команды, проверяющей — из заявки соперника.
  const memberOptions = (teamId, side) => {
    if (!teamId) return [];
    const home = side === 'checked' ? isHome(teamId) : !isHome(teamId);
    return (home ? teamMembers.home : teamMembers.away).map(m => ({ value: m.id, label: m.name }));
  };

  const updateNote = (field, value) => {
    setNotes(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const updateRow = (index, patch) => {
    setChecks(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setIsDirty(true);
  };

  // Смена команды обнуляет игрока и обоих представителей: они принадлежат прежней команде.
  const changeRowTeam = (index, teamId) => {
    updateRow(index, { team_id: teamId, player_id: '', jersey_number: '', checked_rep_id: '', checking_rep_id: '' });
  };

  const changeRowPlayer = (index, playerId, teamId) => {
    const roster = isHome(teamId) ? homeRoster : awayRoster;
    const player = roster.find(p => String(p.player_id) === String(playerId));
    updateRow(index, { player_id: playerId, jersey_number: player?.jersey_number ?? '' });
  };

  const addRow = () => {
    setChecks(prev => [...prev, { ...EMPTY_ROW }]);
    setIsDirty(true);
  };

  const removeRow = (index) => {
    setChecks(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : [{ ...EMPTY_ROW }]));
    setIsDirty(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/games/${gameId}/protocol-back`, {
        method: 'PUT', headers, body: JSON.stringify({ notes, checks }),
      });
      const json = await res.json();
      if (json.success) {
        setNotes({ ...EMPTY_NOTES, ...json.data.notes });
        setChecks(json.data.checks.length > 0 ? json.data.checks : [{ ...EMPTY_ROW }]);
        setIsDirty(false);
        setToast?.({ title: 'Сохранено', message: 'Оборотная сторона протокола обновлена.', type: 'success' });
      } else {
        setToast?.({ title: 'Не сохранено', message: json.error || 'Ошибка сохранения.', type: 'error' });
      }
    } catch (err) {
      console.error('Ошибка сохранения оборота протокола:', err);
      setToast?.({ title: 'Не сохранено', message: 'Нет связи с сервером — проверьте соединение и повторите.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const selectClass = 'w-full px-2 py-1.5 text-[12px] h-[34px] bg-white';

  return (
    <div className="bg-white shadow-lg flex flex-col font-sans rounded-md transition-all duration-500 ease-in-out">
      <div
        className="bg-gray-bg-light px-5 py-3 flex justify-between items-center rounded-md select-none cursor-pointer hover:bg-graphite/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="font-bold py-1 text-graphite text-base uppercase tracking-wide flex items-center gap-3">
          <Icon name="chevron" className={`w-6 h-6 text-graphite-light transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
          Обратная сторона протокола
        </div>
        {isDirty && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange bg-orange/10 border border-orange/20 px-2 py-1 rounded">
            Есть несохранённые изменения
          </span>
        )}
      </div>

      <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className={isExpanded ? 'overflow-visible' : 'overflow-hidden'}>
          <div className="flex flex-col gap-6 p-6 bg-graphite/[0.02] rounded-b-md border-t border-graphite/20">

            {isLoading ? (
              <div className="text-[13px] text-graphite-light py-4">Загрузка…</div>
            ) : (
              <>
                {/* ===== РЕЗУЛЬТАТЫ ПРОВЕРКИ ИГРОКОВ ===== */}
                <div className="bg-white border border-graphite/20 rounded-md shadow-sm">
                  <div className="px-4 py-2.5 border-b border-graphite/20 flex items-center justify-between">
                    <h3 className="font-black text-[13px] text-graphite uppercase tracking-widest">
                      Результаты проверки игроков
                    </h3>
                    <span className="text-[11px] text-graphite-light">
                      Подпись проверяющего лица ставится от руки — в протоколе колонка пустая
                    </span>
                  </div>

                  <div className="p-3 flex flex-col gap-2">
                    <div className="flex gap-2 px-1 text-[10px] font-bold text-graphite-light uppercase tracking-wide">
                      <div className="w-[200px] shrink-0">Команда</div>
                      <div className="w-[180px] shrink-0">№ игрока</div>
                      <div className="w-[170px] shrink-0">Результат</div>
                      <div className="flex-1 min-w-[150px]">Представитель проверяемой</div>
                      <div className="flex-1 min-w-[150px]">Представитель проверяющей</div>
                      <div className="w-[34px] shrink-0" />
                    </div>

                    {checks.map((row, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <div className="w-[200px] shrink-0">
                          <Select
                            options={teamOptions}
                            value={row.team_id || ''}
                            onChange={(val) => changeRowTeam(index, val)}
                            placeholder="Команда"
                            className={selectClass}
                            disabled={isReadOnly}
                          />
                        </div>
                        <div className="w-[180px] shrink-0">
                          <Select
                            options={playerOptions(row.team_id)}
                            value={row.player_id || ''}
                            onChange={(val) => changeRowPlayer(index, val, row.team_id)}
                            placeholder={row.team_id ? 'Игрок' : 'Сначала команда'}
                            isSearchable={true}
                            className={selectClass}
                            disabled={isReadOnly || !row.team_id}
                          />
                        </div>
                        <div className="w-[170px] shrink-0">
                          <Select
                            options={CHECK_RESULT_OPTIONS}
                            value={row.check_result || ''}
                            onChange={(val) => updateRow(index, { check_result: val })}
                            placeholder="Результат"
                            className={selectClass}
                            disabled={isReadOnly}
                          />
                        </div>
                        <div className="flex-1 min-w-[150px]">
                          <Select
                            options={memberOptions(row.team_id, 'checked')}
                            value={row.checked_rep_id || ''}
                            onChange={(val) => updateRow(index, { checked_rep_id: val })}
                            placeholder={row.team_id ? 'Выберите...' : 'Сначала команда'}
                            isSearchable={true}
                            className={selectClass}
                            disabled={isReadOnly || !row.team_id}
                          />
                        </div>
                        <div className="flex-1 min-w-[150px]">
                          <Select
                            options={memberOptions(row.team_id, 'checking')}
                            value={row.checking_rep_id || ''}
                            onChange={(val) => updateRow(index, { checking_rep_id: val })}
                            placeholder={row.team_id ? 'Выберите...' : 'Сначала команда'}
                            isSearchable={true}
                            className={selectClass}
                            disabled={isReadOnly || !row.team_id}
                          />
                        </div>
                        <button
                          onClick={() => removeRow(index)}
                          disabled={isReadOnly}
                          title="Удалить строку"
                          className="w-[34px] h-[34px] shrink-0 flex items-center justify-center rounded-md border border-graphite/20 text-graphite/50 hover:text-white hover:bg-status-rejected hover:border-status-rejected transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <Icon name="delete" className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {!isReadOnly && (
                      <button
                        onClick={addRow}
                        className="self-start mt-1 flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-graphite border border-dashed border-graphite/30 rounded-md hover:border-orange hover:text-orange transition-colors"
                      >
                        <Icon name="plus" className="w-3.5 h-3.5" />
                        Добавить строку
                      </button>
                    )}
                  </div>
                </div>

                {/* ===== ТЕКСТОВЫЕ БЛОКИ ===== */}
                <div className="bg-white border border-graphite/20 rounded-md shadow-sm p-4 flex flex-col gap-4">
                  <NoteField
                    label="Замечания Главного судьи игры о дисциплинарных нарушениях игроков и представителей команд, наложении больших, дисциплинарных до конца игры штрафов и матч-штрафов (с обязательным указанием нарушения согласно Регламенту)"
                    value={notes.referee_notes}
                    rows={5}
                    onChange={(v) => updateNote('referee_notes', v)}
                    disabled={isReadOnly}
                  />
                  <NoteField
                    label="Замечания Главного судьи и Инспектора по проведению игры"
                    value={notes.inspector_notes}
                    rows={3}
                    onChange={(v) => updateNote('inspector_notes', v)}
                    disabled={isReadOnly}
                  />
                  <NoteField
                    label="Уведомление врачей команд о травмах игроков"
                    value={notes.medical_notes}
                    rows={4}
                    onChange={(v) => updateNote('medical_notes', v)}
                    disabled={isReadOnly}
                  />
                </div>

                {/* ===== УВЕДОМЛЕНИЕ О ПОДАЧЕ ПРОТЕСТА ===== */}
                <div className="bg-white border border-graphite/20 rounded-md shadow-sm">
                  <div className="px-4 py-2.5 border-b border-graphite/20">
                    <h3 className="font-black text-[13px] text-graphite uppercase tracking-widest">
                      Уведомление представителей команд о подаче протеста
                    </h3>
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    {[
                      { letter: 'А', name: game?.home_team_name, flag: 'home_protest_filed', text: 'home_protest_text' },
                      { letter: 'Б', name: game?.away_team_name, flag: 'away_protest_filed', text: 'away_protest_text' },
                    ].map(side => (
                      <div key={side.letter} className="flex gap-2 items-center">
                        <div className="w-[220px] shrink-0 flex items-center gap-2 text-[12px] font-bold text-graphite">
                          <span className="bg-graphite text-white w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0">
                            {side.letter}
                          </span>
                          <span className="truncate">{side.name || ''}</span>
                        </div>
                        <div className="w-[110px] shrink-0">
                          <Select
                            options={PROTEST_OPTIONS}
                            value={flagToOption(notes[side.flag])}
                            onChange={(val) => updateNote(side.flag, optionToFlag(val))}
                            placeholder="—"
                            className={selectClass}
                            disabled={isReadOnly}
                          />
                        </div>
                        <input
                          type="text"
                          value={notes[side.text] || ''}
                          onChange={(e) => updateNote(side.text, e.target.value)}
                          disabled={isReadOnly}
                          placeholder="Текст уведомления"
                          className="flex-1 h-[34px] px-3 rounded-md text-[12px] font-medium outline-none border border-graphite/40 bg-white/70 text-graphite focus:border-orange focus:shadow-[0_0_0_3px_rgba(255,122,0,0.2)] disabled:opacity-60 disabled:cursor-not-allowed disabled:!bg-gray-50"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {!isReadOnly && (
                  <div className="flex justify-end items-center gap-4">
                    {isDirty && (
                      <span className="text-[11px] text-graphite-light">
                        Изменения попадут в протокол только после сохранения
                      </span>
                    )}
                    <Button
                      onClick={handleSave}
                      disabled={isSaving || !isDirty}
                      isLoading={isSaving}
                      loadingText="Сохранение..."
                      className="!px-5 !py-2 !text-[12px] uppercase tracking-wider flex items-center gap-2"
                    >
                      <Icon name="save" className="w-4 h-4" />
                      Сохранить
                    </Button>
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
