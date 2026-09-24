import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader } from '../ui/Loader';
import { getAuthHeaders } from '../utils/helpers';
import { describeAction, describeExpiry, EXPIRY_TONE, formatDate, formatDateTime } from '../utils/subscriptionStatus';

const API = import.meta.env.VITE_API_URL;

const formatPhone = (raw) => {
  if (!raw) return null;
  const m = String(raw).replace(/\D/g, '').match(/^(7|8)?(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 (${m[2]}) ${m[3]}-${m[4]}-${m[5]}` : raw;
};

const formatMoney = (value) => `${Math.round(Number(value)).toLocaleString('ru-RU')} ₽`;
const adminName = (e) => [e.admin_last_name, e.admin_first_name].filter(Boolean).join(' ') || 'пользователь удалён';

/**
 * История подписки одного человека: оплаты в Team Room и ручные изменения из раздела
 * «Подписки», свежие сверху. Открыта, пока задан userId.
 */
export function SubscriptionHistoryDrawer({ userId, onClose }) {
  const isOpen = userId !== null && userId !== undefined;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setData(null);
    setError('');
    fetch(`${API}/api/subscriptions/users/${userId}/history`, { headers: getAuthHeaders() })
      .then(res => res.json())
      .then(json => {
        if (cancelled) return;
        if (json.success) setData(json);
        else setError(json.error || 'Не удалось загрузить историю');
      })
      .catch(() => { if (!cancelled) setError('Сбой связи с сервером'); });
    return () => { cancelled = true; };
  }, [isOpen, userId]);

  const user = data?.user;
  const exp = user ? describeExpiry(user.subscription_expires_at) : null;

  const drawerContent = (
    <div className={`fixed inset-0 z-[35] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className={`absolute top-0 right-0 h-full w-full max-w-[640px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite tracking-wide uppercase">История подписки</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-8 flex flex-col gap-5">
          {error ? (
            <div className="p-4 bg-status-rejected/10 border border-status-rejected/20 rounded-md text-[13px] font-bold text-status-rejected">{error}</div>
          ) : !data ? (
            <div className="py-16 flex justify-center"><Loader text="" /></div>
          ) : (
            <>
              <div className="bg-white p-5 rounded-2xl border border-graphite/10 shadow-sm flex flex-col gap-1">
                <span className="text-[17px] font-black text-graphite">
                  {user.last_name} {user.first_name} {user.middle_name || ''}
                  {user.is_virtual && <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-orange align-middle">вирт</span>}
                </span>
                {user.phone && <span className="text-[13px] text-graphite-light">{formatPhone(user.phone)}</span>}
                <span className={`mt-2 text-[14px] font-bold ${EXPIRY_TONE[exp.status]}`}>
                  Подписка: {exp.text}{exp.hint ? ` (${exp.hint})` : ''}
                </span>
              </div>

              {data.events.length === 0 ? (
                <div className="py-10 text-center text-[13px] font-bold text-graphite/40">Оплат и ручных изменений не было</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {data.events.map(e => (
                    <div key={`${e.kind}-${e.id}`} className="bg-white p-4 rounded-md border border-graphite/10 flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[13px] font-black text-graphite">
                          {e.kind === 'payment' ? 'Оплата' : describeAction({ action: e.action, params: e.params, undo_of: e.undo_of })}
                        </span>
                        <span className="shrink-0 text-[12px] text-graphite-light">{formatDateTime(e.at)}</span>
                      </div>

                      {e.kind === 'payment' ? (
                        <span className="text-[13px] text-graphite">
                          {e.plan_name ? `${e.plan_name} · ` : ''}{formatMoney(e.amount)}
                        </span>
                      ) : (
                        <>
                          <span className="text-[13px] text-graphite">
                            Было: <b>{e.old_expires_at ? formatDate(e.old_expires_at) : 'нет'}</b> → стало: <b>{e.new_expires_at ? formatDate(e.new_expires_at) : 'нет'}</b>
                          </span>
                          <span className="text-[12px] text-graphite-light">
                            Операция №{e.operation_id} · {adminName(e)}
                            {e.undone_at ? ` · отменена ${formatDate(e.undone_at)}` : ''}
                          </span>
                          {e.comment && <span className="text-[12px] text-graphite italic">«{e.comment}»</span>}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[12px] text-graphite-light leading-relaxed">
                Пробный период при регистрации в историю не попадает — он нигде не записывается.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
}
