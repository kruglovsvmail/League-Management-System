// Журнал изменений по человеку в заявке — перевод кодов событий в текст.
//
// Коды и состав details задаёт бэкенд (LMS-Backend/utils/personLog.js); здесь они
// становятся строками для колонки «Обновлено» (короткая подпись под датой) и для окна
// истории (полная строка с подробностями). Один словарь на оба места, чтобы подпись в
// таблице и заголовок в истории никогда не расходились.

import dayjs from 'dayjs';

const POSITION_LABELS = { goalie: 'Вр', defense: 'Защ', forward: 'Нап' };
const DOC_LABELS = { medical: 'Медсправка', insurance: 'Страховка', consent: 'Согласие' };
const ROLE_LABELS = { team_manager: 'руководитель', coach: 'тренер', team_admin: 'администратор', head_coach: 'тренер' };
const RESET_REASONS = {
  card: 'правка карточки командой',
  docs: 'замена документа командой',
  consent: 'замена согласия',
  staff: 'изменение ролей командой',
  added: 'внесён в состав командой',
};

export const SOURCE_LABELS = { lms: 'LMS', team_room: 'Кабинет команды', tfh: 'Сайт ТФХ' };

// Короткая подпись под датой в таблице
const SHORT_LABELS = {
  added: 'внесён',
  returned: 'возвращён',
  removed: 'отзаявлен',
  deleted: 'удалён',
  admission_on: 'допуск',
  admission_off: 'допуск снят',
  admission_reset: 'допуск снят',
  fee_on: 'взнос',
  fee_off: 'взнос снят',
  card: 'карточка',
  transfer_in: 'трансфер',
  transfer_out: 'трансфер',
  transfer_revert: 'откат трансфера',
  qualification: 'квалификация',
  staff_added: 'роль',
  staff_removed: 'роль снята',
};

export const shortLogLabel = (action, details) => {
  if (action === 'doc') return (DOC_LABELS[details?.type] || 'документ').toLowerCase();
  return SHORT_LABELS[action] || action || '';
};

const fmtDate = (value) => (value ? dayjs(value).format('DD.MM.YYYY') : null);
const fmtValue = (field, value) => {
  if (value === null || value === undefined) return '—';
  if (field === 'position') return POSITION_LABELS[value] || value;
  if (field === 'is_captain' || field === 'is_assistant') return value ? 'да' : 'нет';
  return String(value);
};
const CARD_FIELD_LABELS = { position: 'амплуа', jersey_number: 'номер', is_captain: 'капитан', is_assistant: 'ассистент' };

/**
 * Полная строка события для окна истории: { title, note }.
 * note — вторая строка мелким шрифтом (причина автосброса, основание квалификации),
 * может быть пустой.
 */
export const describeLogEntry = (entry) => {
  const d = entry?.details || {};
  switch (entry?.action) {
    case 'added': return { title: 'Внесён в заявку' };
    case 'returned': return { title: 'Возвращён в заявку' };
    case 'removed': return { title: 'Отзаявлен' };
    case 'deleted': return { title: 'Удалён из заявки' };
    case 'admission_on':
      return d.auto === 'align'
        ? { title: 'Допуск включён', note: 'автоматически: подтянут к уже стоящему допуску по второй роли' }
        : { title: 'Допуск включён' };
    case 'admission_off': return { title: 'Допуск снят' };
    case 'admission_reset':
      return { title: 'Допуск снят автоматически', note: RESET_REASONS[d.reason] || d.reason || null };
    case 'fee_on': return { title: 'Взнос оплачен' };
    case 'fee_off': return { title: 'Отметка об оплате взноса снята' };
    case 'card': {
      const parts = Object.entries(d)
        .filter(([field]) => CARD_FIELD_LABELS[field])
        .map(([field, [from, to]]) => `${CARD_FIELD_LABELS[field]} ${fmtValue(field, from)} → ${fmtValue(field, to)}`);
      return { title: parts.length ? parts.join(', ') : 'Карточка изменена' };
    }
    case 'doc': {
      const name = DOC_LABELS[d.type] || 'Документ';
      if (d.cleared) return { title: `${name} удалена` };
      const until = d.expires_at ? ` до ${fmtDate(d.expires_at)}` : '';
      if (d.file) return { title: `${name} загружена${until}`, note: d.bulk ? 'общим файлом на несколько человек' : null };
      return { title: `Срок: ${name.toLowerCase()}${until || ' — без срока'}` };
    }
    case 'transfer_in': {
      const bits = [d.jersey_number ? `№ ${d.jersey_number}` : null, POSITION_LABELS[d.position] || null].filter(Boolean).join(', ');
      return { title: 'Переход принят: внесён в заявку', note: bits || null };
    }
    case 'transfer_out': return { title: 'Переход принят: отзаявлен' };
    case 'transfer_revert':
      return { title: 'Переход отменён', note: d.type === 'add' ? 'возврат внесения' : d.type === 'remove' ? 'возврат отзаявки' : null };
    case 'qualification':
      return { title: `Квалификация ${d.from || '—'} → ${d.to || '—'}`, note: d.reason || null };
    case 'staff_added':
      return { title: `Роль в заявке: ${(d.roles || []).map(r => ROLE_LABELS[r] || r).join(', ')}` };
    case 'staff_removed':
      return { title: `Роль снята: ${(d.roles || []).map(r => ROLE_LABELS[r] || r).join(', ')}` };
    default:
      return { title: entry?.action || 'Изменение' };
  }
};
