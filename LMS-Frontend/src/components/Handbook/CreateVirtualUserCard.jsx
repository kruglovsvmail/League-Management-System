import React, { useState } from 'react';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import { Modal } from '../../modals/Modal';
import { getToken } from '../../utils/helpers';

// Создание виртуального аккаунта владельцем лиги — карточка под фильтрами «Справочника».
// Видна, только если глобальный администратор включил лиге тумблер
// allow_owner_virtual_users (см. HandbookPage).
//
// Порядок как при регистрации в Team-Room: «Создать аккаунт» сначала ищет похожих
// (фамилия + имя, фамилия + год рождения). Нашлись — окно со списком и кнопками
// «Отмена» / «Такого нет, создать». Не нашлись — аккаунт создаётся сразу. После создания
// показываем секретный код с кнопкой «Скопировать» — один раз, больше его здесь не увидеть.

const EMPTY_FORM = { last_name: '', first_name: '', middle_name: '', birth_date: '', phone: '' };

// 10 цифр после +7 → (922) 000-56-75
const formatPhoneDynamic = (raw) => {
  if (!raw) return '';
  let res = '';
  if (raw.length > 0) res += '(' + raw.substring(0, 3);
  if (raw.length >= 4) res += ') ' + raw.substring(3, 6);
  if (raw.length >= 7) res += '-' + raw.substring(6, 8);
  if (raw.length >= 9) res += '-' + raw.substring(8, 10);
  return res;
};

const formatPhoneDisplay = (phone) => {
  const m = String(phone || '').replace(/\D/g, '').match(/^7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 (${m[1]}) ${m[2]}-${m[3]}-${m[4]}` : phone;
};

// Дату рождения вводят цифрами, а не листают календарь: ДД.ММ.ГГГГ, точки ставятся сами
const maskBirthDate = (raw) => {
  const d = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return d;
};

// ДД.ММ.ГГГГ → YYYY-MM-DD, или null, если такой даты нет (31.02, 2099 год и т.п.)
const birthDateToIso = (masked) => {
  const m = String(masked || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  const valid = date.getFullYear() === Number(yyyy) && date.getMonth() === Number(mm) - 1 && date.getDate() === Number(dd);
  if (!valid || Number(yyyy) < 1900 || date > new Date()) return null;
  return `${yyyy}-${mm}-${dd}`;
};

const formatBirthDate = (s) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
};

export function CreateVirtualUserCard({ leagueId, onToast }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [isBusy, setIsBusy] = useState(false);
  const [similar, setSimilar] = useState(null); // список похожих — открыто окно выбора
  const [created, setCreated] = useState(null); // созданный аккаунт — открыто окно с кодом
  const [copied, setCopied] = useState(false);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const payload = () => ({
    leagueId,
    last_name: form.last_name.trim(),
    first_name: form.first_name.trim(),
    middle_name: form.middle_name.trim(),
    birth_date: birthDateToIso(form.birth_date),
    phone: form.phone ? `+7${form.phone}` : '',
  });

  const post = async (url) => {
    const res = await fetch(`${import.meta.env.VITE_API_URL}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify(payload()),
    });
    return res.json();
  };

  const create = async () => {
    setIsBusy(true);
    try {
      const data = await post('/api/handbook/virtual-users');
      if (!data.success) {
        onToast?.({ title: 'Ошибка', message: data.error, type: 'error' });
        return;
      }
      setSimilar(null);
      setCopied(false);
      setCreated(data.user);
      setForm(EMPTY_FORM);
    } catch (err) {
      onToast?.({ title: 'Ошибка', message: 'Не удалось создать аккаунт', type: 'error' });
    } finally {
      setIsBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.last_name.trim() || !form.first_name.trim() || !form.birth_date) {
      onToast?.({ title: 'Ошибка', message: 'Укажите фамилию, имя и дату рождения', type: 'error' });
      return;
    }
    if (!birthDateToIso(form.birth_date)) {
      onToast?.({ title: 'Ошибка', message: 'Дата рождения — в виде ДД.ММ.ГГГГ, например 05.03.1976', type: 'error' });
      return;
    }
    if (form.phone && form.phone.length !== 10) {
      onToast?.({ title: 'Ошибка', message: 'В номере телефона нужно 10 цифр после +7', type: 'error' });
      return;
    }
    setIsBusy(true);
    try {
      const data = await post('/api/handbook/virtual-users/similar');
      if (!data.success) {
        onToast?.({ title: 'Ошибка', message: data.error, type: 'error' });
        setIsBusy(false);
        return;
      }
      if (data.similar.length > 0) {
        setSimilar(data.similar);
        setIsBusy(false);
        return;
      }
    } catch (err) {
      onToast?.({ title: 'Ошибка', message: 'Не удалось проверить похожие аккаунты', type: 'error' });
      setIsBusy(false);
      return;
    }
    await create();
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(created.virtual_code);
      setCopied(true);
    } catch {
      onToast?.({ title: 'Ошибка', message: 'Не удалось скопировать — выделите код вручную', type: 'error' });
    }
  };

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-2xl shadow-[4px_0_24px_rgba(0,0,0,0.04)] border border-white/50 p-6 flex flex-col gap-4 animate-zoom-in">
      <h3 className="text-[13px] font-black uppercase tracking-wide text-graphite">Новый аккаунт</h3>

      <Input label="Фамилия" placeholder="Иванов" value={form.last_name} onChange={(e) => set('last_name', e.target.value)} disabled={isBusy} />
      <Input label="Имя" placeholder="Иван" value={form.first_name} onChange={(e) => set('first_name', e.target.value)} disabled={isBusy} />
      <Input label="Отчество" placeholder="Необязательно" value={form.middle_name} onChange={(e) => set('middle_name', e.target.value)} disabled={isBusy} />

      <Input label="Дата рождения" placeholder="ДД.ММ.ГГГГ" value={form.birth_date} onChange={(e) => set('birth_date', maskBirthDate(e.target.value))} disabled={isBusy} />

      <div className="flex flex-col">
        <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Телефон</span>
        <div className="relative flex items-center w-full border border-graphite/40 rounded-md bg-white transition-all duration-300 focus-within:border-orange overflow-hidden">
          <div className="pl-3 pr-2 text-[13px] text-graphite font-semibold border-r border-graphite/20 py-2.5 bg-graphite/5 h-full flex items-center shrink-0">+7</div>
          <input
            type="tel"
            placeholder="Пусто — служебный номер"
            value={formatPhoneDynamic(form.phone)}
            onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
            disabled={isBusy}
            className="w-full px-3 py-2.5 bg-transparent text-graphite text-[13px] outline-none placeholder:text-graphite/40 font-medium"
          />
        </div>
      </div>

      <Button onClick={handleSubmit} isLoading={isBusy} loadingText="Проверяем..." className="w-full">
        Создать аккаунт
      </Button>

      {/* ПОХОЖИЕ АККАУНТЫ */}
      <Modal isOpen={!!similar} onClose={() => !isBusy && setSimilar(null)} title="Похожие аккаунты" size="medium">
        <p className="text-[13px] text-graphite-light mb-4">
          В базе уже есть похожие люди. Если среди них нужный — не создавайте второй аккаунт:
          найдите его и добавьте в команду, иначе статистика разойдётся по двум карточкам.
        </p>
        <div className="flex flex-col gap-2 mb-6">
          {(similar || []).map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-md bg-graphite/5 border border-graphite/10">
              <div className="min-w-0">
                <div className="text-[14px] font-bold text-graphite truncate">
                  {[u.last_name, u.first_name, u.middle_name].filter(Boolean).join(' ')}
                </div>
                <div className="text-[12px] text-graphite-light truncate">
                  {formatBirthDate(u.birth_date)}
                  {u.teams?.length > 0 ? ` · ${u.teams.join(', ')}` : ' · без команды'}
                </div>
              </div>
              <span className={`shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded ${u.activated ? 'bg-status-accepted/10 text-status-accepted' : 'bg-graphite/10 text-graphite/60'}`}>
                {u.activated ? 'Активирован' : 'Виртуальный'}
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setSimilar(null)}
            disabled={isBusy}
            className="px-6 py-2.5 rounded-md font-bold text-[13px] text-graphite-light hover:text-graphite hover:bg-graphite/5 transition-colors"
          >
            Отмена
          </button>
          <Button onClick={create} isLoading={isBusy} loadingText="Создаём...">Такого нет, создать</Button>
        </div>
      </Modal>

      {/* СЕКРЕТНЫЙ КОД — показываем один раз */}
      <Modal isOpen={!!created} onClose={() => setCreated(null)} title="Аккаунт создан" size="normal">
        {created && (
          <div className="flex flex-col gap-4">
            <div>
              <div className="text-[15px] font-bold text-graphite">{created.full_name}</div>
              <div className="text-[13px] text-graphite-light">Телефон: {formatPhoneDisplay(created.phone)}</div>
            </div>
            <div className="flex flex-col items-center gap-3 py-5 rounded-md bg-graphite/5 border border-graphite/10">
              <span className="text-[11px] font-bold uppercase tracking-wide text-graphite-light">Секретный код</span>
              <span className="font-mono text-[32px] font-black tracking-[0.3em] text-graphite select-all">{created.virtual_code}</span>
              <Button onClick={copyCode} className="w-[200px]">{copied ? 'Скопировано' : 'Скопировать'}</Button>
            </div>
            <p className="text-[12px] text-graphite-light leading-snug">
              Передайте код владельцу аккаунта: с ним он активирует аккаунт в Team-Room или в LMS.
              Код показывается только сейчас — в «Справочнике» его потом не будет.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
