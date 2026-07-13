// MetricsPage.jsx
import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { Header } from '../components/Header';
import { Loader } from '../ui/Loader';
import { Icon } from '../ui/Icon';
import { Input } from '../ui/Input';
import { SegmentButton } from '../ui/SegmentButton';
import { Switch } from '../ui/Switch';
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

// Статичный список разделов-чипсов для графика (совпадает с PAGE_LABELS бэкенда).
// Бэкенд всегда отдаёт данные по всем разделам сразу («page=all») плюс суммарную
// линию «Общие» — переключение чипсов ничего не перезапрашивает, а лишь скрывает/
// показывает уже загруженные линии на клиенте.
const SERIES_OPTIONS = [
  { value: 'calendar', label: 'Календарь' },
  { value: 'event_details', label: 'Детали события' },
  { value: 'my_teams', label: 'Мои команды' },
  { value: 'tournaments', label: 'Турниры/Лиги' },
  { value: 'total', label: 'Общие' },
];
const ALL_SERIES_VALUES = SERIES_OPTIONS.map((o) => o.value);

// Катмулл-Ром → кубический Безье: превращает ломаную линию точек в гладкую кривую,
// проходящую через все исходные значения (не аппроксимацию, а именно интерполяцию).
const buildSmoothPath = (points) => {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

// ── Мини-компонент: линейный график по дням (чистый SVG, без библиотек) ──
// Поверх SVG лежат невидимые хотспоты, привязанные к точкам в процентных
// координатах: клик по точке открывает Tooltip со значением. showValues
// дополнительно подписывает каждую точку прямо на графике.
function DailyLineChart({ dates, series, colors, metricWord, showValues }) {
  const width = 900;
  const height = 220;
  const padY = 20;
  const padX = 10;

  const maxVal = Math.max(1, ...series.flatMap((s) => s.data));

  const xFor = (idx) => padX + (idx / Math.max(dates.length - 1, 1)) * (width - padX * 2);
  const yFor = (val) => height - padY - (val / maxVal) * (height - padY * 2);

  // Показываем не более ~6 подписей дат, чтобы не сваливались друг на друга
  const labelStep = Math.max(1, Math.ceil(dates.length / 6));

  const svgHeight = height + 24 + (showValues ? 14 : 0);

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

          {series.map((s, sIdx) => {
            const points = s.data.map((v, i) => ({ x: xFor(i), y: yFor(v) }));
            return (
              <g key={s.page}>
                <path d={buildSmoothPath(points)} fill="none" stroke={colors[sIdx % colors.length]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {points.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r="3" fill={colors[sIdx % colors.length]} />
                ))}
                {showValues && points.map((p, i) => (
                  <text
                    key={`v-${i}`}
                    x={p.x}
                    y={p.y - 8}
                    fontSize="10"
                    fontWeight="700"
                    fill={colors[sIdx % colors.length]}
                    textAnchor="middle"
                  >
                    {s.data[i]}
                  </text>
                ))}
              </g>
            );
          })}

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

// ── Мини-компонент: кольцевая (donut) диаграмма на чистом SVG ──────────────
// Сегменты рисуются несколькими наложенными <circle> через трюк
// strokeDasharray/strokeDashoffset — без сторонних библиотек графиков.
function DonutChart({ segments, centerValue, centerLabel, size = 132, thickness = 16 }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offsetAcc = 0;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(44,44,46,0.08)" strokeWidth={thickness} />
          {total > 0 && segments.map((s, idx) => {
            if (s.value <= 0) return null;
            const dash = (s.value / total) * circumference;
            const dashoffset = -offsetAcc;
            offsetAcc += dash;
            return (
              <circle
                key={idx}
                cx={center} cy={center} r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={dashoffset}
                transform={`rotate(-90 ${center} ${center})`}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3">
          <div className="text-[20px] font-bold text-graphite leading-none">{centerValue}</div>
          {centerLabel && (
            <div className="text-[10px] text-graphite-light font-semibold uppercase tracking-wide mt-1 text-center">{centerLabel}</div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2.5 flex-1 min-w-0">
        {segments.map((s, idx) => (
          <div key={idx} className="flex items-center justify-between gap-2 text-[13px]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="font-semibold text-graphite truncate">{s.label}</span>
            </div>
            <span className="text-graphite-light shrink-0">
              {s.value.toLocaleString('ru')}{s.pct != null ? ` · ${s.pct}%` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Сортируемый заголовок колонки таблицы «Пользователи» ──────────────────
function SortableTh({ label, sortKey, sort, onSort, align = 'left', className = '' }) {
  const isActive = sort.key === sortKey;
  const alignClass = align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`py-3 px-2 text-[11px] uppercase text-graphite/40 font-bold tracking-wide select-none cursor-pointer hover:text-orange transition-colors group ${alignClass} ${className}`}
    >
      <div className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <span>{label}</span>
        <svg
          className={`w-3 h-3 transition-all duration-200 ${isActive ? 'text-orange opacity-100' : 'opacity-0 group-hover:opacity-40'} ${isActive && sort.dir === 'asc' ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </div>
    </th>
  );
}

export function MetricsPage() {
  const [isLoading, setIsLoading] = useState(true);

  const [range, setRange] = useState('week');
  // Какие линии показывать на графике — переключается чипсами, без повторных запросов
  // к серверу (бэкенд и так всегда отдаёт данные по всем разделам сразу)
  const [visibleSeries, setVisibleSeries] = useState(() => new Set(ALL_SERIES_VALUES));
  const [showValues, setShowValues] = useState(false);
  const [metricType, setMetricType] = useState('visits'); // 'visits' | 'unique'
  const [daily, setDaily] = useState(null);
  const [isDailyLoading, setIsDailyLoading] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => dayjs().subtract(6, 'day').format('YYYY-MM-DD'));
  const [customTo, setCustomTo] = useState(() => dayjs().format('YYYY-MM-DD'));

  const toggleSeries = (value) => {
    setVisibleSeries((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  // Пользователи: постраничный список + поиск + сортировка (серверная — применяется
  // ко всем пользователям, а не только к видимой странице)
  const [topUsers, setTopUsers] = useState([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersSearchInput, setUsersSearchInput] = useState('');
  const [usersSearch, setUsersSearch] = useState('');
  const [usersSort, setUsersSort] = useState({ key: 'last_visited', dir: 'desc' });
  const [isUsersLoading, setIsUsersLoading] = useState(false);

  const handleUsersSort = (key) => {
    setUsersSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: key === 'name' ? 'asc' : 'desc' };
    });
  };

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

  // Новый поисковый запрос или смена сортировки — всегда возвращаемся на первую страницу
  useEffect(() => { setUsersPage(1); }, [usersSearch, usersSort]);

  useEffect(() => {
    const fetchUsers = async () => {
      setIsUsersLoading(true);
      try {
        const params = new URLSearchParams({ page: String(usersPage), sort: usersSort.key, dir: usersSort.dir });
        if (usersSearch) params.set('search', usersSearch);
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/metrics/top-users?${params}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data.success) {
          setTopUsers(data.users);
          setUsersTotalPages(data.totalPages);
          setUsersTotal(data.total);
        }
      } catch (err) {
        console.error('Ошибка загрузки пользователей:', err);
      } finally {
        setIsUsersLoading(false);
      }
    };
    fetchUsers();
  }, [usersPage, usersSearch, usersSort]);

  useEffect(() => {
    // В режиме "Период" ждём, пока обе даты будут заданы и диапазон валиден
    if (range === 'custom' && (!customFrom || !customTo || customFrom > customTo)) return;

    const fetchDaily = async () => {
      setIsDailyLoading(true);
      try {
        // Всегда запрашиваем все разделы разом — фильтрация по чипсам происходит
        // на клиенте, без похода на сервер
        const params = new URLSearchParams({ page: 'all', range });
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
  }, [range, customFrom, customTo]);

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
          <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
            <h3 className="text-[16px] font-bold text-graphite">Динамика по дням</h3>
            <div className="flex items-center gap-3 flex-wrap">
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
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-[13px] font-medium text-graphite-light">Значения на графике</span>
                <Switch checked={showValues} onChange={(e) => setShowValues(e.target.checked)} />
              </label>
            </div>
          </div>

          {/* Разделы включаются/выключаются чипсами — одновременно служат легендой */}
          <div className="flex flex-wrap gap-2 mb-4">
            {SERIES_OPTIONS.map((opt) => {
              const active = visibleSeries.has(opt.value);
              const color = colorForPage(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleSeries(opt.value)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all duration-150"
                  style={{
                    backgroundColor: active ? color : 'transparent',
                    borderColor: active ? color : 'rgba(44,44,46,0.2)',
                    color: active ? '#fff' : 'rgba(44,44,46,0.5)',
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: active ? '#fff' : color }}
                  />
                  {opt.label}
                </button>
              );
            })}
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
              {(() => {
                const visible = daily.series.filter((s) => visibleSeries.has(s.page));
                if (visible.length === 0) {
                  return (
                    <div className="h-[220px] flex items-center justify-center text-graphite/40 text-[13px]">
                      Выберите хотя бы один раздел выше
                    </div>
                  );
                }
                return (
                  <DailyLineChart
                    dates={daily.dates}
                    series={visible.map((s) => ({ page: s.page, label: s.label, data: s[metricType] }))}
                    colors={visible.map((s) => colorForPage(s.page))}
                    metricWord={metricType === 'visits' ? 'визитов' : 'уникальных'}
                    showValues={showValues}
                  />
                );
              })()}
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
              <DonutChart
                segments={[
                  { label: 'Активированные', value: audience.accounts.activated, pct: audience.accounts.activated_pct, color: '#10B981' },
                  { label: 'Виртуальные', value: audience.accounts.virtual, pct: audience.accounts.virtual_pct, color: '#2C2C2E' },
                ]}
                centerValue={audience.accounts.total.toLocaleString('ru')}
                centerLabel="всего"
              />
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
            <h3 className="text-[16px] font-bold text-graphite mb-1">Push-уведомления</h3>
            <p className="text-[12px] text-graphite-light mb-4">
              Доля от игроков, состоящих хотя бы в одной команде (не всех пользователей системы)
            </p>

            {!pushStats ? (
              <div className="h-20 flex items-center justify-center"><Loader text="" /></div>
            ) : (
              <>
                <DonutChart
                  segments={[
                    { label: 'Подписаны', value: pushStats.subscribed_users, pct: pushStats.coverage_pct, color: '#FF7A00' },
                    {
                      label: 'Не подписаны',
                      value: Math.max(0, pushStats.total_audience - pushStats.subscribed_users),
                      pct: Math.round((100 - pushStats.coverage_pct) * 10) / 10,
                      color: '#303030ff',
                    },
                  ]}
                  centerValue={`${pushStats.coverage_pct}%`}
                  centerLabel="подписаны"
                />
                <div className="text-[12px] text-graphite-light mt-4">
                  Кто именно подписан — смотрите колонку «Push» в таблице «Пользователи» ниже
                </div>
              </>
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

        {/* ПОЛЬЗОВАТЕЛИ: ПОИСК + ПАГИНАЦИЯ ПО 15, СВЕЖИЕ ВИЗИТЫ СВЕРХУ */}
        <div className="bg-white/30 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg shadow-[4px_0_24px_rgba(0,0,0,0.04)] p-6">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <h3 className="text-[16px] font-bold text-graphite">
              Пользователи
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
            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-graphite/20">
                    <SortableTh label="Пользователь" sortKey="name" sort={usersSort} onSort={handleUsersSort} />
                    <th className="py-3 px-2 text-[11px] uppercase text-graphite/40 font-bold tracking-wide text-left">Команды</th>
                    <SortableTh label="Визиты" sortKey="visits" sort={usersSort} onSort={handleUsersSort} align="center" />
                    <SortableTh label="Push" sortKey="push" sort={usersSort} onSort={handleUsersSort} align="center" />
                    <SortableTh label="Последний визит" sortKey="last_visited" sort={usersSort} onSort={handleUsersSort} align="right" />
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {topUsers.map((u) => {
                    const isExpanded = expandedUserId === u.id;
                    return (
                      <React.Fragment key={u.id}>
                        <tr
                          onClick={() => handleToggleUser(u.id)}
                          className="cursor-pointer hover:bg-white/40 transition-colors border-b border-graphite/10 last:border-b-0"
                        >
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-3 min-w-[180px]">
                              <img
                                src={getImageUrl(u.avatar_url || '/default/user_default.webp')}
                                alt=""
                                className="w-9 h-9 rounded-lg object-cover bg-graphite/10 shrink-0"
                              />
                              <span className="font-semibold text-graphite text-[14px] truncate">{u.first_name} {u.last_name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {u.teams.map((t) => (
                                <Tooltip key={t.id} title={t.name} noUnderline>
                                  {t.logo_url ? (
                                    <img
                                      src={getImageUrl(t.logo_url)}
                                      alt=""
                                      className="w-7 h-7 object-cover shrink-0"
                                    />
                                  ) : (
                                    <span className="w-7 h-7 rounded-md bg-graphite/10 flex items-center justify-center text-[10px] font-bold text-graphite-light shrink-0">
                                      {(t.short_name || t.name).slice(0, 2).toUpperCase()}
                                    </span>
                                  )}
                                </Tooltip>
                              ))}
                              {u.teams.length === 0 && <span className="text-graphite/20 text-[13px]">—</span>}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className="text-[16px] font-bold text-orange">{u.total_visits}</span>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            {u.push_device_count > 0 ? (
                              <span className="inline-flex items-center justify-center text-[11px] font-bold text-white bg-orange rounded-full min-w-[22px] h-[22px] px-1.5">
                                {u.push_device_count}
                              </span>
                            ) : (
                              <span className="text-graphite/20 text-[13px]">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            <span className="text-[12px] text-graphite-light">
                              {u.last_visited_at ? dayjs(u.last_visited_at).format('D MMMM, HH:mm') : '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-2">
                            <Icon name="chevron" className={`w-4 h-4 text-graphite-light shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="border-b border-graphite/10 last:border-b-0">
                            <td colSpan={6} className="pb-4 px-2">
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
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
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
