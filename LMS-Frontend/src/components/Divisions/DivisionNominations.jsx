import React, { useState, useEffect } from 'react';
import { Loader } from '../../ui/Loader';
import { getToken, getImageUrl } from '../../utils/helpers';

const COLLAPSED_COUNT = 5;

const STAGE_LABEL = { regular: 'регулярный чемпионат', playoff: 'плей-офф', all: 'регулярка + плей-офф' };

const scopeLabel = (scope) => (scope === 'team' ? 'лучший в каждой команде' : 'весь дивизион');

const typeLabel = (n) => {
  if (n.player_type === 'goalie') return 'вратари';
  if (n.player_type === 'all') return 'все игроки';
  if (n.position_filter === 'forward') return 'нападающие';
  if (n.position_filter === 'defense') return 'защитники';
  return 'полевые игроки';
};

// Доли приходят из Postgres строкой ("0.9655…"), целые — числом.
const formatValue = (value, format) => {
  if (value === null || value === undefined) return '—';
  if (format === 'percent') return `${(Number(value) * 100).toFixed(1)}%`;
  return Number(value);
};

function NominationCard({ nomination }) {
  const [expanded, setExpanded] = useState(false);

  const players = nomination.players || [];
  const visible = expanded ? players : players.slice(0, COLLAPSED_COUNT);
  const hiddenCount = players.length - COLLAPSED_COUNT;

  return (
    <div className="bg-white/70 rounded-md border border-graphite/10 overflow-hidden flex flex-col">
      <div className="px-5 py-4 border-b border-graphite/5">
        <div className="text-[15px] font-black text-graphite leading-tight">{nomination.name}</div>
        <div className="text-[11px] text-graphite-light mt-1 leading-snug">
          {nomination.metric_label} · {typeLabel(nomination)} · {STAGE_LABEL[nomination.stage_type]}
          {nomination.scope === 'team' && ` · ${scopeLabel(nomination.scope)}`}
          {nomination.min_games > 0 && ` · от ${nomination.min_games} матчей`}
        </div>
      </div>

      {players.length === 0 ? (
        <div className="px-5 py-8 text-center text-[13px] text-graphite-light/60">
          Пока некого награждать — нет игроков, подходящих под условия
        </div>
      ) : (
        <>
          {/* При раскрытии список прокручивается, а не растягивает карточку:
              иначе номинация на сотню игроков утопит соседние секции */}
          <div className={expanded ? 'max-h-[420px] overflow-y-auto' : ''}>
            {visible.map((p, idx) => {
              const isLeader = idx === 0;
              return (
                <div
                  key={`${p.player_id}-${p.team_id}`}
                  className={`flex items-center gap-3 px-5 py-2.5 border-b border-graphite/5 last:border-0 ${
                    isLeader ? 'bg-orange/[0.04]' : ''
                  }`}
                >
                  <span
                    className={`w-6 shrink-0 text-center text-[13px] font-bold ${
                      isLeader ? 'text-orange' : 'text-graphite/40'
                    }`}
                  >
                    {idx + 1}
                  </span>

                  <div className="w-9 h-9 shrink-0 rounded-lg overflow-hidden bg-graphite/5 border border-graphite/10">
                    <img
                      src={getImageUrl(p.avatar_url || '/default/user_default.webp')}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div
                      className="text-[13px] font-bold text-graphite truncate"
                      title={`${p.last_name || ''} ${p.first_name || ''}`.trim()}
                    >
                      {`${p.last_name || ''} ${p.first_name || ''}`.trim()}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {p.team_logo_url && (
                        <img src={getImageUrl(p.team_logo_url)} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
                      )}
                      <span className="text-[11px] text-graphite-light truncate" title={p.team_name || ''}>
                        {p.team_name || '—'}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className={`text-[15px] font-black leading-none ${isLeader ? 'text-orange' : 'text-graphite'}`}>
                      {formatValue(p.value, nomination.metric_format)}
                    </div>
                    <div className="text-[10px] text-graphite-light mt-1">{p.games_played} игр</div>
                  </div>
                </div>
              );
            })}
          </div>

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(prev => !prev)}
              className="px-5 py-2.5 text-[12px] font-bold text-graphite-light hover:text-orange hover:bg-orange/5 transition-colors border-t border-graphite/5"
            >
              {expanded ? 'Свернуть' : `Показать всех — ещё ${hiddenCount}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function DivisionNominations({ divisionId }) {
  const [nominations, setNominations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!divisionId) return;

    setIsLoading(true);
    fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/nominations/results`, {
      headers: { 'Authorization': `Bearer ${getToken()}` },
    })
      .then(res => res.json())
      .then(data => { if (data.success) setNominations(data.data); })
      .catch(err => console.error('Ошибка загрузки номинаций:', err))
      .finally(() => setIsLoading(false));
  }, [divisionId]);

  // Номинаций может не быть вовсе — это нормальный случай, а не ошибка:
  // тогда раздел просто не показываем, чтобы не занимать место пустой рамкой.
  if (!isLoading && nominations.length === 0) return null;

  return (
    <div className="w-full flex flex-col mb-8">
      <div className="mb-6 flex items-center min-h-[38px]">
        <h3 className="text-[18px] font-black text-graphite leading-tight tracking-tight">
          Номинации
        </h3>
      </div>

      {/* Третья колонка только с xl: у́же карточка сжимает фамилию с командой
          до многоточия, и список перестаёт читаться */}
      {isLoading ? (
        <div className="h-[200px] flex items-center justify-center">
          <Loader text="" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {nominations.map(n => <NominationCard key={n.id} nomination={n} />)}
        </div>
      )}
    </div>
  );
}
