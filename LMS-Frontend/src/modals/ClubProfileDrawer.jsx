import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Loader } from '../ui/Loader';
import { Uploader } from '../ui/Uploader';
import { getImageUrl, getToken } from '../utils/helpers';

const emptyProfile = () => ({ name: '', city: '', description: '', color_1: '#ffffff', color_2: '#ffffff', logo_url: null });
const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ClubProfileDrawer({ isOpen, onClose, clubId = null, onSaved }) {
  const [form, setForm] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [deleteLogo, setDeleteLogo] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const isCreate = !clubId;

  useEffect(() => {
    if (!isOpen) return undefined;
    setError('');
    setLogoFile(null);
    setDeleteLogo(false);
    setUploadKey(key => key + 1);
    if (!clubId) {
      setForm(emptyProfile());
      setIsLoading(false);
      return undefined;
    }
    setForm(null);
    setIsLoading(true);
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/clubs-manage/${clubId}/profile`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }, signal: controller.signal
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.error || 'Не удалось загрузить профиль клуба');
        if (!controller.signal.aborted) setForm({ ...emptyProfile(), ...data.club });
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message || 'Ошибка соединения с сервером');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };
    load();
    return () => controller.abort();
  }, [isOpen, clubId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape' && !isSaving) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, isSaving, onClose]);

  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
  const handleLogo = (file, cleared) => {
    if (file) {
      if (!LOGO_TYPES.includes(file.type) || file.size > 30 * 1024 * 1024) {
        setError('Выберите логотип в формате JPG, PNG или WebP размером до 30 МБ');
        setLogoFile(null);
        setUploadKey(key => key + 1);
        return;
      }
      setLogoFile(file);
      setError('');
    } else if (cleared) {
      if (logoFile) setLogoFile(null);
      else setDeleteLogo(true);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    if (!form || isLoading || isSaving) return;
    if (!isCreate && String(form.id) !== String(clubId)) return;
    if (!form.name.trim()) { setError('Укажите название клуба'); return; }
    setIsSaving(true);
    setError('');
    try {
      const body = new FormData();
      for (const field of ['name', 'city', 'description', 'color_1', 'color_2']) body.append(field, form[field] || '');
      if (logoFile) body.append('logo', logoFile);
      else if (deleteLogo) body.append('delete_logo', 'true');
      const url = `${import.meta.env.VITE_API_URL}/api/clubs-manage${isCreate ? '' : `/${clubId}/profile`}`;
      const res = await fetch(url, {
        method: isCreate ? 'POST' : 'PUT', headers: { 'Authorization': `Bearer ${getToken()}` }, body
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Не удалось сохранить клуб');
      onSaved?.(data.club);
    } catch (err) {
      setError(err.message || 'Ошибка соединения с сервером');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !document.body) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100000]" role="dialog" aria-modal="true" aria-labelledby="club-profile-title">
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={() => !isSaving && onClose()} />
      <div className="absolute top-0 right-0 h-full w-full max-w-[620px] bg-white flex flex-col shadow-2xl animate-slide-in">
        <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-graphite/10 shrink-0">
          <h2 id="club-profile-title" className="font-black text-xl text-graphite uppercase tracking-wide">
            {isCreate ? 'Создать клуб' : 'Профиль клуба'}
          </h2>
          <button type="button" onClick={onClose} disabled={isSaving} aria-label="Закрыть профиль клуба" className="text-3xl text-graphite-light hover:text-orange disabled:opacity-40">×</button>
        </div>
        <form onSubmit={save} className="flex-1 flex flex-col min-h-0">
          <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-5 bg-gray-50/50">
            {error && <div role="alert" className="p-4 rounded-md border border-status-rejected/20 bg-status-rejected/10 text-status-rejected text-[13px] font-semibold">{error}</div>}
            {isLoading ? <Loader text="Загрузка профиля..." /> : form && (
              <>
                <Input label="Название клуба *" placeholder="Название клуба" maxLength={255} value={form.name || ''} onChange={e => setField('name', e.target.value)} disabled={isSaving} />
                <Input label="Город" placeholder="Город" maxLength={100} value={form.city || ''} onChange={e => setField('city', e.target.value)} disabled={isSaving} />
                <div>
                  <label htmlFor="club-description" className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide block">Описание клуба</label>
                  <textarea id="club-description" rows={6} value={form.description || ''} onChange={e => setField('description', e.target.value)} disabled={isSaving}
                    placeholder="История клуба, команды, достижения…"
                    className="w-full px-3 py-2.5 rounded-md border border-graphite/40 bg-white/70 text-graphite text-[13px] outline-none focus:border-orange resize-y disabled:opacity-60" />
                </div>
                <div className="grid grid-cols-[180px_1fr] gap-6 items-start">
                  <Uploader key={uploadKey} label="Логотип" accept=".jpg,.jpeg,.png,.webp" heightClass="h-[180px]"
                    initialUrl={!deleteLogo && form.logo_url ? getImageUrl(form.logo_url) : null}
                    onFileSelect={handleLogo} disabled={isSaving} confirmClear="Убрать логотип клуба?" />
                  <p className="text-[12px] text-graphite-light leading-relaxed pt-6">JPG, PNG или WebP, до 30 МБ. Остальные поля можно заполнить позже.</p>
                </div>
                <div className="pt-4 border-t border-graphite/10">
                  <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide block mb-3">Цвета клуба</span>
                  <div className="flex gap-8">
                    {[
                      { field: 'color_1', label: 'Акцентный (интерфейс)' },
                      { field: 'color_2', label: 'Дополнительный' }
                    ].map(({ field, label }) => (
                      <label key={field} className="flex items-center gap-3 text-[12px] font-bold text-graphite">
                        <input type="color" value={form[field] || '#ffffff'} onChange={e => setField(field, e.target.value)} disabled={isSaving}
                          className="w-9 h-9 rounded-full border border-graphite/20 bg-transparent cursor-pointer disabled:opacity-60" />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="p-6 border-t border-graphite/10 flex gap-3 shrink-0">
            <button type="button" onClick={onClose} disabled={isSaving} className="px-5 py-2.5 rounded-md border border-graphite/20 text-graphite font-bold text-[13px] hover:bg-graphite/5 disabled:opacity-40">Отмена</button>
            <Button type="submit" isLoading={isSaving} loadingText={isCreate ? 'Создание...' : 'Сохранение...'} disabled={isLoading || !form || !form.name?.trim()} className="flex-1">
              {isCreate ? 'Создать клуб' : 'Сохранить изменения'}
            </Button>
          </div>
        </form>
      </div>
    </div>, document.body
  );
}
