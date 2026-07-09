// MetricsPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import dayjs from 'dayjs';
import { Header } from '../components/Header';
import { Loader } from '../ui/Loader';
import { Icon } from '../ui/Icon';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { DatePicker } from '../ui/DatePicker';
import { getImageUrl, getAuthHeaders } from '../utils/helpers';

const SERIES_COLORS = ['#FF7A00', '#2C2C2E', '#3B82F6', '#10B981', '#A855F7'];

// Фиксированные цвета по разделам (не зависят от порядка в массиве)
const PAGE_COLORS = {
  tournaments: '#3B82F6',    // синий — Турниры/Лиги
  my_teams: '#10B981',       // зелёный — Мои команды
  calendar: '#FF7A00',       // оранжевый (бренд) — Календарь
  event_details: '#A855F7',  // фиолетовый — Детали события
};
const colorForPage = (page) => PAGE_COLORS[page] || '#2C2C2E';

// ── Мини-компонент: карточка счётчика ────────────────────────────────────
function KpiCard({ icon, label, value, sub }) {
  return (
    <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6 flex items-center gap-4">
      <div className="w-12 h-12 rounded-lg bg-orange/10 flex items-center justify-center shrink-0">
        <Icon name={icon} className="w-6 h-6 text-orange" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-graphite-light">{label}</div>
        <div className="text-[24px] font-bold text-graphite leading-tight truncate">{value}</div>
        {sub && <div className="text-[12px] text-graphite-light mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ── Мини-компонент: линейный график по дням (чистый SVG, без библиотек) ──
function DailyLineChart({ dates, series, colors }) {
  const width = 900;
  const height = 220;
  const padY = 20;
  const padX = 10;

  const maxVal = Math.max(1, ...series.flatMap((s) => s.data));

  const xFor = (idx) => padX + (idx / Math.max(dates.length - 1, 1)) * (width - padX * 2);
  const yFor = (val) => height - padY - (val / maxVal) * (height - padY * 2);

  const buildPath = (data) => data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(v)}`).join(' ');

  // Показываем не более ~6 подписей дат, чтобы не сваливались друг на друга
  const labelStep = Math.max(1, Math.ceil(dates.length / 6));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height + 24}`} className="w-full min-w-[600px]" style={{ height: 'auto' }}>
        {/* Горизонтальные направляющие */}
        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={padX} x2={width - padX}
            y1={padY + t * (height - padY * 2)} y2={padY + t * (height - padY * 2)}
            stroke="rgba(44,44,46,0.08)" strokeWidth="1"
          />
        ))}

        {series.map((s, sIdx) => (
          <g key={s.page}>
            <path d={buildPath(s.data)} fill="none" stroke={colors[sIdx % colors.length]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {s.data.map((v, i) => (
              <circle key={i} cx={xFor(i)} cy={yFor(v)} r="3" fill={colors[sIdx % colors.length]} />
            ))}
          </g>
        ))}

        {/* Подписи дат по оси X */}
        {dates.map((d, i) =>
          i % labelStep === 0 ? (
            <text key={d} x={xFor(i)} y={height + 18} fontSize="11" fill="rgba(44,44,46,0.5)" textAnchor="middle">
              {dayjs(d).format('DD.MM')}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

export function MetricsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [topUsers, setTopUsers] = useState([]);

  const [range, setRange] = useState('week');
  const [pageFilter, setPageFilter] = useState('all');
  const [metricType, setMetricType] = useState('visits'); // 'visits' | 'unique'
  const [daily, setDaily] = useState(null);
  const [isDailyLoading, setIsDailyLoading] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => dayjs().subtract(6, 'day').format('YYYY-MM-DD'));
  const [customTo, setCustomTo] = useState(() => dayjs().format('YYYY-MM-DD'));

  const [expandedUserId, setExpandedUserId] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [isUserDetailLoading, setIsUserDetailLoading] = useState(false);

  const [pushStats, setPushStats] = useState(null);

  useEffect(() => {
    const fetchInitial = async () => {
      setIsLoading(true);
      try {
        const [summaryRes, topUsersRes, pushRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/api/metrics/summary`, { headers: getAuthHeaders() }),
          fetch(`${import.meta.env.VITE_API_URL}/api/metrics/top-users?limit=20`, { headers: getAuthHeaders() }),
          fetch(`${import.meta.env.VITE_API_URL}/api/metrics/push`, { headers: getAuthHeaders() }),
        ]);
        const [summaryData, topUsersData, pushData] = await Promise.all([summaryRes.json(), topUsersRes.json(), pushRes.json()]);
        if (summaryData.success) setSummary(summaryData);
        if (topUsersData.success) setTopUsers(topUsersData.users);
        if (pushData.success) setPushStats(pushData);
      } catch (err) {
        console.error('Ошибка загрузки метрик:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitial();
  }, []);

  useEffect(() => {
    // В режиме "Период" ждём, пока обе даты будут заданы и диапазон валиден
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;

    const fetchDaily = async () => {
      setIsDailyLoading(true);
      try {
        const params = new URLSearchParams({ page: pageFilter, range });
        if (range === 'custom') {
          params.set('from', customFrom);
          params.set('to', customTo);
        }
        const res = await fetch(
          `${import.meta.env.VITE_API_URL}/api/metrics/daily?${params.toString()}`,
          { headers: getAuthHeaders() }
        );
        const data = await res.json();
        if (data.success) setDaily(data);
      } catch (err) {
        console.error('Ошибка загрузки графика посещений:', err);
      } finally {
        setIsDailyLoading(false);
      }
    };
    fetchDaily();
  }, [range, pageFilter, customFrom, customTo]);

  const handleToggleUser = async (userId) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setUserDetail(null);
      return;
    }
    setExpandedUserId(userId);
    setUserDetail(null);
    setIsUserDetailLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/metrics/user/${userId}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success) setUserDetail(data);
    } catch (err) {
      console.error('Ошибка загрузки карточки пользователя:', err);
    } finally {
      setIsUserDetailLoading(false);
    }
  };

  const pageOptions = useMemo(() => [
    { value: 'all', label: 'Все разделы' },
    ...(summary?.by_page || []).map((p) => ({ value: p.page, label: p.label })),
  ], [summary]);

  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen">
        <Header title="Метрика" />
        <div className="flex-1 flex items-center justify-center"><Loader text="Загрузка метрик..." /></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Метрика"
        subtitle={<span className="text-[13px] text-graphite-light">Скрытая аналитика посещений Team-Room · видна только глобальному администратору</span>}
      />

      <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-8 custom-scrollbar">

        {/* КОНТРОЛЬНЫЕ СЧЁТЧИКИ */}
        <div className="grid grid-cols-3 gap-6">
          <KpiCard icon="matches" label="Всего визитов" value={(summary?.total_visits ?? 0).toLocaleString('ru')} />
          <KpiCard icon="users" label="Уникальных пользователей" value={(summary?.unique_users ?? 0).toLocaleString('ru')} />
          <KpiCard
            icon="trophy"
            label="Самый посещаемый раздел"
            value={summary?.top_page?.label ?? '—'}
            sub={summary?.top_page ? `${summary.top_page.total_visits} визитов` : null}
          />
        </div>

        {/* РАЗБИВКА ПО РАЗДЕЛАМ + PUSH-УВЕДОМЛЕНИЯ */}
        <div className="grid grid-cols-2 gap-6">

          {/* РАЗБИВКА ПО РАЗДЕЛАМ */}
          <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6">
            <h3 className="text-[16px] font-bold text-graphite mb-4">Разбивка по разделам</h3>
            <div className="flex flex-col gap-4">
              {(summary?.by_page || []).map((p) => {
                const pct = summary.total_visits > 0 ? (p.total_visits / summary.total_visits) * 100 : 0;
                return (
                  <div key={p.page}>
                    <div className="flex justify-between items-baseline text-[13px] mb-1.5">
                      <span className="font-semibold text-graphite">{p.label}</span>
                      <span className="text-graphite-light">{p.total_visits} визитов · {p.unique_users} польз.</span>
                    </div>
                    <div className="w-full h-2 bg-graphite/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: colorForPage(p.page) }}
                      />
                    </div>
                  </div>
                );
              })}
              {(!summary?.by_page || summary.by_page.length === 0) && (
                <div className="text-center py-8 text-graphite/40 text-[13px]">Данных пока нет</div>
              )}
            </div>
          </div>

          {/* PUSH-УВЕДОМЛЕНИЯ */}
          <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[16px] font-bold text-graphite">Push-уведомления</h3>
              {pushStats && (
                <span className="text-[13px] text-graphite-light">
                  {pushStats.subscribed_users} из {pushStats.total_audience} ·{' '}
                  <b className="text-graphite">{pushStats.coverage_pct}%</b>
                </span>
              )}
            </div>
            <p className="text-[12px] text-graphite-light mb-4">
              Доля от игроков, состоящих хотя бы в одной команде (не всех пользователей системы)
            </p>

            {!pushStats ? (
              <div className="h-20 flex items-center justify-center"><Loader text="" /></div>
            ) : (
              <div className="flex flex-col gap-4">
                {pushStats.distribution.map((d, idx) => {
                  const maxCount = Math.max(1, ...pushStats.distribution.map((x) => x.user_count));
                  const pct = (d.user_count / maxCount) * 100;
                  return (
                    <div key={d.bucket}>
                      <div className="flex justify-between items-baseline text-[13px] mb-1.5">
                        <span className="font-semibold text-graphite">{d.label}</span>
                        <span className="text-graphite-light">{d.user_count} польз.</span>
                      </div>
                      <div className="w-full h-2 bg-graphite/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: SERIES_COLORS[idx % SERIES_COLORS.length] }}
                        />
                      </div>
                    </div>
                  );
                })}
                {pushStats.distribution.length === 0 && (
                  <div className="text-center py-8 text-graphite/40 text-[13px]">Пока нет ни одной push-подписки</div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* ГРАФИК ПО ДНЯМ */}
        <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
            <h3 className="text-[16px] font-bold text-graphite">Динамика по дням</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <Select
                options={pageOptions}
                value={pageFilter}
                onChange={setPageFilter}
                className="w-[190px] px-3 py-2 text-[13px]"
              />
              <SegmentButton
                options={['Визиты', 'Уникальные']}
                defaultIndex={0}
                onChange={(idx) => setMetricType(idx === 0 ? 'visits' : 'unique')}
                className="w-[200px]"
              />
              <SegmentButton
                options={['Неделя', 'Месяц', 'Период']}
                defaultIndex={0}
                onChange={(idx) => setRange(idx === 0 ? 'week' : idx === 1 ? 'month' : 'custom')}
                className="w-[320px]"
              />
              {range === 'custom' && (
                <div className="flex items-center gap-2">
                  <div className="w-[150px]">
                    <DatePicker value={customFrom} onChange={(v) => v && setCustomFrom(v)} placeholder="От" />
                  </div>
                  <span className="text-graphite-light text-[13px]">—</span>
                  <div className="w-[150px]">
                    <DatePicker value={customTo} onChange={(v) => v && setCustomTo(v)} placeholder="До" />
                  </div>
                </div>
              )}
            </div>
          </div>

          {range === 'custom' && customFrom > customTo && (
            <div className="text-[12px] text-status-rejected mb-2">Дата "От" не может быть позже даты "До"</div>
          )}

          {daily?.peak?.[metricType]?.date && (
            <div className="text-[12px] text-graphite-light mb-2">
              Пик за период: <b className="text-graphite">{daily.peak[metricType].count}</b>{' '}
              {metricType === 'visits' ? 'визитов' : 'уникальных пользователей'} ({dayjs(daily.peak[metricType].date).format('D MMMM')})
            </div>
          )}

          {isDailyLoading || !daily ? (
            <div className="h-[220px] flex items-center justify-center"><Loader text="" /></div>
          ) : (
            <>
              <DailyLineChart
                dates={daily.dates}
                series={daily.series.map((s) => ({ page: s.page, label: s.label, data: s[metricType] }))}
                colors={daily.series.map((s) => colorForPage(s.page))}
              />
              {daily.series.length > 1 && (
                <div className="flex flex-wrap gap-4 mt-2">
                  {daily.series.map((s) => (
                    <div key={s.page} className="flex items-center gap-1.5 text-[12px] text-graphite-light">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorForPage(s.page) }} />
                      {s.label}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ТОП АКТИВНЫХ ПОЛЬЗОВАТЕЛЕЙ */}
        <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6">
          <h3 className="text-[16px] font-bold text-graphite mb-4">Активные пользователи</h3>
          <div className="flex flex-col divide-y divide-graphite/10">
            {topUsers.map((u) => {
              const isExpanded = expandedUserId === u.id;
              return (
                <div key={u.id}>
                  <div
                    onClick={() => handleToggleUser(u.id)}
                    className="flex items-center gap-4 py-3 px-2 cursor-pointer hover:bg-white/40 rounded-lg transition-colors"
                  >
                    <img
                      src={getImageUrl(u.avatar_url || '/default/user_default.webp')}
                      alt=""
                      className="w-10 h-10 rounded-lg object-cover bg-graphite/10 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-graphite text-[14px] truncate">{u.first_name} {u.last_name}</div>
                      <div className="text-[12px] text-graphite-light">
                        Последний визит: {u.last_visited_at ? dayjs(u.last_visited_at).format('D MMMM, HH:mm') : '—'}
                      </div>
                    </div>
                    <div className="text-[18px] font-bold text-orange shrink-0">{u.total_visits}</div>
                    <Icon name="chevron" className={`w-4 h-4 text-graphite-light shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>

                  {isExpanded && (
                    <div className="pb-4 px-2">
                      {isUserDetailLoading ? (
                        <div className="py-4"><Loader text="" /></div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {userDetail?.visits.map((v) => (
                            <div key={v.page} className="flex justify-between items-center text-[13px] bg-graphite/5 rounded-md px-3 py-2">
                              <span className="text-graphite font-medium">{v.label}</span>
                              <span className="text-graphite-light">
                                {v.visit_count} визитов · посл. {dayjs(v.last_visited_at).format('D MMMM, HH:mm')}
                              </span>
                            </div>
                          ))}
                          {(!userDetail?.visits || userDetail.visits.length === 0) && (
                            <div className="text-center py-4 text-graphite/40 text-[13px]">Нет данных по разделам</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {topUsers.length === 0 && (
              <div className="text-center py-10 text-graphite/40 text-[13px]">Данных пока нет</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
