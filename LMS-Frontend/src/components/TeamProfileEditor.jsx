import React, { useState, useEffect } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { Uploader } from '../ui/Uploader';
import { Loader } from '../ui/Loader';
import { Icon } from '../ui/Icon';
import { getImageUrl, getToken } from '../utils/helpers';

// Вкладка «Профиль команды» в разделе «Команды» (глобальный админ). Правит те же поля,
// что команда видит у себя в Team-Room: название, аббревиатура, город, описание, цвета,
// логотип, форма, общее фото — плюс произношение для озвучки и признак виртуальной.
// Текст и цвета уходят одним PUT, файлы — по одному запросу на каждый изменённый.

const API = import.meta.env.VITE_API_URL;
const headers = () => ({ 'Authorization': `Bearer ${getToken()}` });

// Кружок-палитра: нативный input[type=color] без системной рамки
function ColorSwatch({ value, onChange, title }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <input
        type="color"
        value={value || '#ffffff'}
        onChange={(e) => onChange(e.target.value)}
        title={title}
        className="w-8 h-8 rounded-full cursor-pointer border border-graphite/20 bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full"
      />
      <span className="text-[10px] font-bold text-graphite-light uppercase tracking-wide">{title}</span>
    </div>
  );
}

export function TeamProfileEditor({ teamId, onSaved, showToast }) {
  const [form, setForm] = useState(null);
  // Изменённые файлы: File — загрузить, null — удалить с сервера; нет ключа — не трогать
  const [files, setFiles] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  // Ключ пересоздаёт загрузчики после сохранения, чтобы они забыли выбранные файлы
  const [resetKey, setResetKey] = useState(0);
  const [cacheBuster, setCacheBuster] = useState(Date.now());

  const load = async () => {
    const res = await fetch(`${API}/api/teams-manage/${teamId}/profile`, { headers: headers() });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Не удалось загрузить профиль');
    setForm(data.data);
    setFiles({});
    setResetKey(k => k + 1);
    setCacheBuster(Date.now());
    return data.data;
  };

  useEffect(() => {
    setForm(null);
    load().catch(err => showToast?.('Ошибка', err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // «Сбросить» у только что выбранного файла — отмена выбора, а не удаление сохранённого
  const handleFile = (type, file, cleared) => {
    setFiles(prev => {
      const next = { ...prev };
      if (file) next[type] = file;
      else if (cleared && prev[type] instanceof File) delete next[type];
      else if (cleared) next[type] = null;
      return next;
    });
  };

  const imageUrl = (url) => (url ? `${getImageUrl(url)}?t=${cacheBuster}` : null);

  const handleListen = () => {
    const text = form.pronunciation || form.name;
    if (!text) return;
    fetch(`${API}/api/tts/test?text=${encodeURIComponent(text)}`, { headers: headers() })
      .then(r => r.blob())
      .then(blob => { new Audio(URL.createObjectURL(blob)).play(); })
      .catch(e => console.error(e));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.name.trim()) {
      showToast?.('Ошибка', 'Укажите название команды');
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`${API}/api/teams-manage/${teamId}/profile`, {
        method: 'PUT',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, short_name: form.short_name, city: form.city,
          description: form.description, pronunciation: form.pronunciation,
          is_virtual: !!form.is_virtual, ui_color: form.ui_color,
          color_home_1: form.color_home_1, color_home_2: form.color_home_2,
          color_away_1: form.color_away_1, color_away_2: form.color_away_2,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Не удалось сохранить');

      for (const [type, file] of Object.entries(files)) {
        if (file) {
          const fd = new FormData();
          fd.append('file', file);
          const up = await fetch(`${API}/api/teams-manage/${teamId}/profile/file/${type}`, { method: 'POST', headers: headers(), body: fd });
          const upData = await up.json();
          if (!upData.success) throw new Error(upData.error || 'Не удалось загрузить файл');
        } else {
          await fetch(`${API}/api/teams-manage/${teamId}/profile/file/${type}`, { method: 'DELETE', headers: headers() });
        }
      }

      const fresh = await load();
      showToast?.('Сохранено', 'Профиль команды обновлён', 'success');
      onSaved?.(fresh);
    } catch (err) {
      showToast?.('Ошибка', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!form) return <Loader text="Загрузка профиля..." />;

  return (
    <form onSubmit={handleSave} className="animate-zoom-in">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] gap-8">

        {/* Текстовые поля и цвета */}
        <div className="flex flex-col gap-5">
          <Input label="Название" placeholder="Полное название команды *" value={form.name || ''} onChange={e => set('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Аббревиатура" placeholder="До 4 символов" maxLength={4} value={form.short_name || ''} onChange={e => set('short_name', e.target.value.toUpperCase())} />
            <Input label="Город" placeholder="Город" value={form.city || ''} onChange={e => set('city', e.target.value)} />
          </div>

          <div className="flex items-end gap-2">
            <Input label="Произношение для озвучки" placeholder="Если отличается от названия" value={form.pronunciation || ''} onChange={e => set('pronunciation', e.target.value)} />
            <button
              type="button"
              onClick={handleListen}
              disabled={!form.pronunciation && !form.name}
              className="shrink-0 w-[42px] h-[42px] rounded-md flex items-center justify-center hover:bg-graphite/10 text-graphite/50 transition-colors disabled:opacity-30"
              title="Прослушать произношение"
            >
              <Icon name="play" className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col">
            <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide">Описание</span>
            <textarea
              rows={8}
              placeholder="О команде: история, достижения, состав…"
              value={form.description || ''}
              onChange={e => set('description', e.target.value)}
              className="w-full px-3 py-2.5 border border-graphite/20 rounded-md bg-white/60 text-graphite text-[13px] font-medium outline-none transition-all duration-300 focus:border-orange focus:bg-white resize-y min-h-[120px]"
            />
            <span className="text-[11px] text-graphite-light mt-1">Абзацы и переносы строк сохраняются и показываются на сайте лиги как есть.</span>
          </div>

          <div className="flex items-center gap-6 pt-2">
            <div className="flex items-center gap-3">
              <Switch checked={!!form.is_virtual} onChange={(e) => set('is_virtual', e.target.checked)} />
              <span className="text-[13px] font-bold text-graphite">Виртуальная команда</span>
            </div>

            {/* Цвет интерфейса Кабинета команды; пустой — берётся акцентный цвет домашней формы */}
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-[13px] font-bold text-graphite">Цвет интерфейса</span>
              <input
                type="color"
                value={form.ui_color || '#ffffff'}
                onChange={(e) => set('ui_color', e.target.value)}
                className="w-8 h-8 rounded-full cursor-pointer border border-graphite/20 bg-transparent p-0 overflow-hidden appearance-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch]:rounded-full"
                title="Акцентный цвет интерфейса Кабинета команды"
              />
              <button
                type="button"
                onClick={() => set('ui_color', '')}
                disabled={!form.ui_color}
                className="text-[12px] font-bold text-graphite/50 hover:text-orange underline underline-offset-2 transition-colors disabled:opacity-30 disabled:hover:text-graphite/50"
              >
                Сбросить
              </button>
            </div>
          </div>
        </div>

        {/* Файлы: логотип, форма с цветами, общее фото */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-[150px_1fr] gap-4 items-start">
            <Uploader
              key={`logo-${resetKey}`}
              label="Логотип" heightClass="h-[150px]" accept=".jpg,.png,.webp,.svg"
              initialUrl={imageUrl(form.logo_url)}
              onFileSelect={(f, cleared) => handleFile('logo', f, cleared)}
              confirmClear="Удалить логотип команды?"
            />
            <div className="text-[12px] text-graphite-light leading-snug pt-6">
              Логотип, форма и фото в уже допущенных заявках не меняются: лига принимает
              новую версию в окне статуса команды.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-graphite/10">
            <div className="flex flex-col gap-3">
              <Uploader
                key={`jersey_dark-${resetKey}`}
                label="Домашняя форма" heightClass="h-[150px]" accept=".jpg,.png,.webp"
                mockText="Домашняя" isDefaultPreview={true}
                initialUrl={imageUrl(form.jersey_dark_url)}
                emptyImage={getImageUrl('/default/jersey_dark.webp')}
                onFileSelect={(f, cleared) => handleFile('jersey_dark', f, cleared)}
              />
              <div className="flex justify-center gap-6">
                <ColorSwatch title="Акцентный" value={form.color_home_1} onChange={v => set('color_home_1', v)} />
                <ColorSwatch title="Основной" value={form.color_home_2} onChange={v => set('color_home_2', v)} />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Uploader
                key={`jersey_light-${resetKey}`}
                label="Гостевая форма" heightClass="h-[150px]" accept=".jpg,.png,.webp"
                mockText="Гостевая" isDefaultPreview={true}
                initialUrl={imageUrl(form.jersey_light_url)}
                emptyImage={getImageUrl('/default/jersey_light.webp')}
                onFileSelect={(f, cleared) => handleFile('jersey_light', f, cleared)}
              />
              <div className="flex justify-center gap-6">
                <ColorSwatch title="Акцентный" value={form.color_away_1} onChange={v => set('color_away_1', v)} />
                <ColorSwatch title="Основной" value={form.color_away_2} onChange={v => set('color_away_2', v)} />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-graphite/10">
            <Uploader
              key={`team_photo-${resetKey}`}
              label="Общее фото команды" heightClass="h-[200px]" accept=".jpg,.png,.webp"
              initialUrl={imageUrl(form.team_photo_url)}
              onFileSelect={(f, cleared) => handleFile('team_photo', f, cleared)}
              confirmClear="Удалить общее фото команды?"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-6 mt-6 border-t border-graphite/10">
        <Button type="submit" isLoading={isSaving} loadingText="Сохраняем...">
          Сохранить профиль
        </Button>
      </div>
    </form>
  );
}
