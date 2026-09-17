import { Tooltip } from '../../ui/Tooltip';

// Плашка «Изменения после допуска»: команда поменяла в профиле то, что лига зафиксировала
// в заявке при допуске (snapshot_diff считает divisionController). В подсказке — что именно,
// «было → стало». Принять изменения в заявку можно в окне статуса, галочками по полям.

const fmt = (kind, v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (kind === 'color') return Array.isArray(v) ? v.map(c => c || '—').join(' / ') : String(v);
  if (kind === 'image') return 'файл';
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
};

export const describeSnapshotDiff = (diff) =>
  (diff || []).map(d => {
    // У картинок текстом сравнивать нечего — ссылки на новый файл всегда разные
    if (d.kind === 'image') return `${d.label}: заменён`;
    return `${d.label}: ${fmt(d.kind, d.old)} → ${fmt(d.kind, d.new)}`;
  }).join('\n');

export function TeamSnapshotBadge({ diff, className = '' }) {
  if (!Array.isArray(diff) || diff.length === 0) return null;
  return (
    <Tooltip title="Команда изменила профиль после допуска" subtitle={describeSnapshotDiff(diff)} noUnderline={true}>
      <span
        className={`inline-flex items-center gap-1 px-2 h-[22px] rounded-md border border-status-pending/60 bg-status-pending/10 text-status-pending text-[11px] font-bold whitespace-nowrap ${className}`}
      >
        Изменения после допуска
      </span>
    </Tooltip>
  );
}
