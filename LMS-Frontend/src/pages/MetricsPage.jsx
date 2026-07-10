// MetricsPage.jsx
import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { Header } from '../components/Header';
import { Loader } from '../ui/Loader';
import { Icon } from '../ui/Icon';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { SegmentButton } from '../ui/SegmentButton';
import { DatePicker } from '../ui/DatePicker';
import { Tooltip } from '../ui/Tooltip';
import { getImageUrl, getAuthHeaders } from '../utils/helpers';

const SERIES_COLORS = ['#FF7A00', '#2C2C2E', '#3B82F6', '#10B981', '#A855F7'];

// Фиксированные цвета по разделам (не зависят от порядка в массиве)
const PAGE_COLORS = {
  tournaments: '#3B82F6',    // синий — Турниры/Лиги
  my_teams: '#10B981',       // зелёный — Мои команды
  calendar: '#FF7A00',       // оранжевый (бренд) — Календарь
  event_details: '#A855F7',  // фиолетовый — Детали события
  total: '#2C2C2E',          // графит — суммарная линия «Общие»
};
const colorForPage = (page) => PAGE_COLORS[page] || '#2C2C2E';

// Статичный список разделов для фильтра графика (совпадает с PAGE_LABELS бэкенда).
// При «Все разделы» бэкенд добавляет пятую суммарную линию «Общие»;
// 'total' — та же суммарная линия, но одна, без разбивки по разделам.
const PAGE_OPTIONS = [
  { value: 'all', label: 'Все разделы' },
  { value: 'total', label: 'Общие (сумма)' },
  { value: 'calendar', label: 'Календарь' },
  { value: 'event_details', label: 'Детали события' },
  { value: 'my_teams', label: 'Мои команды' },
  { value: 'tournaments', label: 'Турниры/Лиги' },
];

// ── Мини-компонент: линейный график по дням (чистый SVG, без библиотек) ──
// Поверх SVG лежат невидимые хотспоты, привязанные к точкам в процентных
// координатах: клик по точке открывает Tooltip со значением.
function DailyLineChart({ dates, series, colors, metricWord }) {
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

  const svgHeight = height + 24;

  return (
    <div className="w-full overflow-x-auto">
      <div className="relative min-w-[600px]">
        <svg viewBox={`0 0 ${width} ${svgHeight}`} className="w-full" style={{ height: 'auto' }}>
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

        {/* Кликабельные хотспоты точек: позиции в процентах повторяют координаты SVG,
            поэтому корректно масштабируются вместе с responsive-шириной графика */}
        {series.map((s, sIdx) =>
          s.data.map((v, i) => (
            <div
              key={`${s.page}-${i}`}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${(xFor(i) / width) * 100}%`,
                top: `${(yFor(v) / svgHeight) * 100}%`,
              }}
            >
              <Tooltip
                trigger="click"
                noUnderline
                title={`${v} ${metricWord}`}
                subtitle={`${s.label} · ${dayjs(dates[i]).format('D MMMM')}`}
              >
                <span
                  className="block w-4 h-4 rounded-full hover:bg-white/40 transition-colors"
                  style={{ boxShadow: `0 0 0 0 ${colors[sIdx % colors.length]}` }}
                />
              </Tooltip>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function MetricsPage() {
  const [isLoading, setIsLoading] = useState(true);

  const [range, setRange] = useState('week');
  const [pageFilter, setPageFilter] = useState('all');
  const [metricType, setMetricType] = useState('visits'); // 'visits' | 'unique'
  const [daily, setDaily] = useState(null);
  const [isDailyLoading, setIsDailyLoading] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => dayjs().subtract(6, 'day').format('YYYY-MM-DD'));
  const [customTo, setCustomTo] = useState(() => dayjs().format('YYYY-MM-DD'));

  // Активные пользователи: постраничный список + поиск
  const [topUsers, setTopUsers] = useState([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSearchInput, setUsersSearchInput] = useState('');
  const [usersSearch, setUsersSearch] = useState('');
  const [isUsersLoading, setIsUsersLoading] = useState(false);

  const [expandedUserId, setExpandedUserId] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [isUserDetailLoading, setIsUserDetailLoading] = useState(false);

  const [pushStats, setPushStats] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const [audience, setAudience] = useState(null);

  useEffect(() => {
    const fetchInitial = async () => {
      setIsLoading(true);
      try {
        const [pushRes, engagementRes, audienceRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/api/metrics/push`, { headers: getAuthHeaders() }),
          fetch(`${import.meta.env.VITE_API_URL}/api/metrics/engagement`, { headers: getAuthHeaders() }),
          fetch(`${import.meta.env.VITE_API_URL}/api/metrics/audience`, { headers: getAuthHeaders() }),
        ]);
        const [pushData, engagementData, audienceData] = await Promise.all([pushRes.json(), engagementRes.json(), audienceRes.json()]);
        if (pushData.success) setPushStats(pushData);
        if (engagementData.success) setEngagement(engagementData);
        if (audienceData.success) setAudience(audienceData);
      } catch (err) {
        console.error('Ошибка загрузки метрик:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitial();
  }, []);

  // Debounce поиска пользователей — не дёргаем бэкенд на каждое нажатие клавиши
  useEffect(() => {
    const t = setTimeout(() => setUsersSearch(usersSearchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [usersSearchInput]);

  // Новый поисковый запрос — всегда возвращаемся на первую страницу
  useEffect(() => { setUsersPage(1); }, [usersSearch]);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsUsersLoading(true);
      try {
        const params = new URLSearchParams({ page: String(usersPage) });
        if (usersSearch) params.set('search', usersSearch);
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/metrics/top-users?${params}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
          setTopUsers(data.users);
          setUsersTotalPages(data.totalPages);
          setUsersTotal(data.total);
        }
      } catch (err) {
        console.error('Ошибка загрузки активных пользователей:', err);
      } finally {
        setIsUsersLoading(false);
      }
    };
    fetchUsers();
  }, [usersPage, usersSearch]);

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

        {/* ГРАФИК ПО ДНЯМ */}
        <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6">
          <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
            <h3 className="text-[16px] font-bold text-graphite">Динамика по дням</h3>
            <div className="flex items-center gap-3 flex-wrap">
              <Select
                options={PAGE_OPTIONS}
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

          {/* Итоги за отображаемый период: визиты — сумма, уникальные — честный
              COUNT(DISTINCT user_id) по сырой таблице (без задвоения по разделам/дням) */}
          {daily?.range_totals && (
            <div className="text-[12px] text-graphite-light mb-2">
              На графике: <b className="text-graphite">{daily.range_totals.visits.toLocaleString('ru')}</b> визитов ·{' '}
              <b className="text-graphite">{daily.range_totals.unique_users.toLocaleString('ru')}</b> уникальных пользователей
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
                metricWord={metricType === 'visits' ? 'визитов' : 'уникальных'}
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

        {/* АУДИТОРИЯ: АККАУНТЫ + АКТИВНОСТЬ + ОХВАТ */}
        {audience && (
          <div className="grid grid-cols-3 gap-6">

            {/* АККАУНТЫ */}
            <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6">
              <h3 className="text-[16px] font-bold text-graphite mb-1">Аккаунты</h3>
              <p className="text-[12px] text-graphite-light mb-4">Все пользователи в базе системы</p>
              <div className="text-[28px] font-bold text-graphite leading-none mb-4">{audience.accounts.total.toLocaleString('ru')}</div>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex justify-between items-baseline text-[13px] mb-1.5">
                    <span className="font-semibold text-graphite">Активированные</span>
                    <span className="text-graphite-light">{audience.accounts.activated} · <b className="text-graphite">{audience.accounts.activated_pct}%</b></span>
                  </div>
                  <div className="w-full h-2 bg-graphite/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500 bg-[#10B981]" style={{ width: `${audience.accounts.activated_pct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-baseline text-[13px] mb-1.5">
                    <span className="font-semibold text-graphite">Виртуальные</span>
                    <span className="text-graphite-light">{audience.accounts.virtual} · <b className="text-graphite">{audience.accounts.virtual_pct}%</b></span>
                  </div>
                  <div className="w-full h-2 bg-graphite/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500 bg-[#2C2C2E]" style={{ width: `${audience.accounts.virtual_pct}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* АКТИВНОСТЬ АУДИТОРИИ */}
            <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6">
              <h3 className="text-[16px] font-bold text-graphite mb-1">Активность аудитории</h3>
              <p className="text-[12px] text-graphite-light mb-4">Уникальные пользователи за периоды</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="text-center">
                  <div className="text-[24px] font-bold text-orange leading-tight">{audience.activity.dau}</div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-graphite-light">Сегодня</div>
                </div>
                <div className="text-center">
                  <div className="text-[24px] font-bold text-graphite leading-tight">{audience.activity.wau}</div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-graphite-light">7 дней</div>
                </div>
                <div className="text-center">
                  <div className="text-[24px] font-bold text-graphite leading-tight">{audience.activity.mau}</div>
                  <div className="text-[11px] font-bold uppercase tracking-wide text-graphite-light">30 дней</div>
                </div>
              </div>
              <div className="text-[12px] text-graphite-light border-t border-graphite/10 pt-3">
                Прилипчивость (DAU/MAU): <b className="text-graphite">{audience.activity.stickiness_pct}%</b>
                {' '}— какая часть месячной аудитории заходит ежедневно
              </div>
            </div>

            {/* ОХВАТ TEAM-ROOM */}
            <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6">
              <h3 className="text-[16px] font-bold text-graphite mb-1">Охват Team-Room</h3>
              <p className="text-[12px] text-graphite-light mb-4">Игроки команд, реально пользующиеся приложением</p>
              <div className="text-[28px] font-bold text-graphite leading-none mb-4">{audience.coverage.total_players.toLocaleString('ru')}<span className="text-[13px] font-medium text-graphite-light ml-2">игроков в командах</span></div>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex justify-between items-baseline text-[13px] mb-1.5">
                    <span className="font-semibold text-graphite">Заходили хоть раз</span>
                    <span className="text-graphite-light">{audience.coverage.ever_visited} · <b className="text-graphite">{audience.coverage.ever_pct}%</b></span>
                  </div>
                  <div className="w-full h-2 bg-graphite/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500 bg-[#3B82F6]" style={{ width: `${audience.coverage.ever_pct}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-baseline text-[13px] mb-1.5">
                    <span className="font-semibold text-graphite">Активны за 30 дней</span>
                    <span className="text-graphite-light">{audience.coverage.active_30d} · <b className="text-graphite">{audience.coverage.active_30d_pct}%</b></span>
                  </div>
                  <div className="w-full h-2 bg-graphite/10 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500 bg-orange" style={{ width: `${audience.coverage.active_30d_pct}%` }} />
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* PUSH-УВЕДОМЛЕНИЯ + ГЛУБИНА ИСПОЛЬЗОВАНИЯ */}
        <div className="grid grid-cols-2 gap-6">

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

          {/* ГЛУБИНА ИСПОЛЬЗОВАНИЯ */}
          <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6">
            <h3 className="text-[16px] font-bold text-graphite mb-1">Глубина использования</h3>
            <p className="text-[12px] text-graphite-light mb-4">
              Сколько разделов приложения использует каждый пользователь
            </p>

            {!engagement ? (
              <div className="h-20 flex items-center justify-center"><Loader text="" /></div>
            ) : (
              <div className="flex flex-col gap-4">
                {engagement.distribution.map((d, idx) => {
                  const maxCount = Math.max(1, ...engagement.distribution.map((x) => x.user_count));
                  const pct = (d.user_count / maxCount) * 100;
                  return (
                    <div key={d.sections}>
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
                {engagement.distribution.length === 0 && (
                  <div className="text-center py-8 text-graphite/40 text-[13px]">Данных пока нет</div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* АКТИВНЫЕ ПОЛЬЗОВАТЕЛИ: ПОИСК + ПАГИНАЦИЯ ПО 15 */}
        <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <h3 className="text-[16px] font-bold text-graphite">
              Активные пользователи
              <span className="text-[13px] font-medium text-graphite-light ml-2">Всего: {usersTotal}</span>
            </h3>
            <div className="w-72">
              <Input
                placeholder="Поиск по имени или фамилии"
                value={usersSearchInput}
                onChange={(e) => setUsersSearchInput(e.target.value)}
              />
            </div>
          </div>

          {isUsersLoading ? (
            <div className="py-16 flex items-center justify-center"><Loader text="" /></div>
          ) : (
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
                <div className="text-center py-10 text-graphite/40 text-[13px]">
                  {usersSearch ? 'Никого не найдено по вашему запросу' : 'Данных пока нет'}
                </div>
              )}
            </div>
          )}

          {usersTotalPages > 1 && !isUsersLoading && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <button
                onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                disabled={usersPage <= 1}
                className="px-4 py-2 rounded-md text-[13px] font-bold uppercase tracking-wide border border-graphite/20 text-graphite bg-white/30 hover:bg-white/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ← Назад
              </button>
              <span className="text-[13px] font-semibold text-graphite-light">
                Страница {usersPage} из {usersTotalPages}
              </span>
              <button
                onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))}
                disabled={usersPage >= usersTotalPages}
                className="px-4 py-2 rounded-md text-[13px] font-bold uppercase tracking-wide border border-graphite/20 text-graphite bg-white/30 hover:bg-white/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Вперёд →
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
