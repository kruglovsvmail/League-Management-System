import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PolicyContent } from '../ui/PolicyContent';

/**
 * Окно с текстом Политики обработки персональных данных.
 *
 * Рендерится через портал с z-index выше обычной модалки (Modal.jsx — z-[100000]),
 * чтобы открываться ПОВЕРХ модалки активации аккаунта, не закрывая её: человек читает
 * документ и возвращается к форме с уже введёнными данными.
 *
 * Текст берётся из публичного эндпоинта (общая с Team-Room таблица policy_versions)
 * и кэшируется в стейте до размонтирования.
 */
export function PolicySheet({ isOpen, onClose }) {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || policy || loading) return;
    setLoading(true);
    setError('');
    fetch(`${import.meta.env.VITE_API_URL}/api/public/policy/current`)
      .then(res => res.json())
      .then(json => {
        if (json.success) setPolicy(json.policy);
        else setError(json.error || 'Не удалось загрузить документ');
      })
      .catch(() => setError('Ошибка соединения с сервером'))
      .finally(() => setLoading(false));
  }, [isOpen, policy, loading]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100010] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-graphite/40 backdrop-blur-[4px]" onClick={onClose} />

      <div className="relative w-full max-w-[700px] bg-white/90 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg flex flex-col max-h-full animate-zoom-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-graphite/10 bg-white/40 rounded-t-xxl shrink-0">
          <h2 className="text-[15px] sm:text-xl font-black text-graphite uppercase tracking-wide">
            {policy?.title || 'Политика обработки персональных данных'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-graphite-light hover:text-orange hover:bg-orange/10 rounded-circle transition-colors shrink-0"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-5 h-5 border-2 border-orange border-t-transparent rounded-circle animate-spin" />
            </div>
          )}

          {error && !loading && (
            <p className="text-[13px] text-status-rejected font-semibold text-center py-20">{error}</p>
          )}

          {policy && !loading && (
            <>
              <PolicyContent text={policy.content} />
              <p className="text-[11px] text-graphite-light opacity-70 mt-8 text-left">
                Версия {policy.version}
                {policy.published_at && ` · опубликована ${new Date(policy.published_at).toLocaleDateString('ru-RU')}`}
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
