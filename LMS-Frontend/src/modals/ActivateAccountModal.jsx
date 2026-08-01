import React, { useState } from 'react';
import { Modal } from './Modal';
import { PolicySheet } from './PolicySheet';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Checkbox } from '../ui/Checkbox';

const SERVER_URL = import.meta.env.VITE_API_URL;

const STEP_TITLES = {
  1: 'Активация аккаунта',
  2: 'Профиль найден',
  3: 'Ваши данные',
  4: 'Готово'
};

const formatPhone = (raw) => {
  if (!raw) return '';
  let res = '';
  if (raw.length > 0) res += '(' + raw.substring(0, 3);
  if (raw.length >= 4) res += ') ' + raw.substring(3, 6);
  if (raw.length >= 7) res += '-' + raw.substring(6, 8);
  if (raw.length >= 9) res += '-' + raw.substring(8, 10);
  return res;
};

/**
 * Активация аккаунта сотрудника лиги со страницы входа.
 *
 * Шаги: телефон → секретный код из карточки → ФИО, почта и согласие с политикой →
 * пароль приходит письмом. Логика повторяет активацию в Team-Room, но пускает только
 * тех, кто числится в штате лиги (проверка на бэкенде, см. authController.hasLeagueAccess).
 */
export function ActivateAccountModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1);
  const [phoneRaw, setPhoneRaw] = useState('');
  const [code, setCode] = useState('');
  const [data, setData] = useState({ firstName: '', lastName: '', middleName: '', email: '' });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [policyChecked, setPolicyChecked] = useState(false);
  const [isPolicyOpen, setIsPolicyOpen] = useState(false);

  const fullPhone = `+7${phoneRaw}`;

  const reset = () => {
    setStep(1);
    setPhoneRaw('');
    setCode('');
    setData({ firstName: '', lastName: '', middleName: '', email: '' });
    setError('');
    setPolicyChecked(false);
  };

  const handleClose = () => {
    onClose();
    // Сброс с задержкой, чтобы содержимое не «прыгало» во время закрытия
    setTimeout(reset, 300);
  };

  const post = async (path, body) => {
    const response = await fetch(`${SERVER_URL}/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await response.json();
    if (!response.ok || !json.success) {
      throw new Error(json.error || 'Ошибка сервера');
    }
    return json;
  };

  const handleCheckPhone = async () => {
    setError('');
    if (phoneRaw.length !== 10) return setError('Некорректный номер телефона');

    setIsLoading(true);
    try {
      await post('reg-check-phone', { phone: fullPhone });
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    if (!code.trim()) return setError('Введите код');

    setIsLoading(true);
    try {
      const json = await post('reg-verify-code', { phone: fullPhone, code });
      setData(prev => ({
        ...prev,
        firstName: json.user.first_name || '',
        lastName: json.user.last_name || '',
        middleName: json.user.middle_name || ''
      }));
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError('');
    if (!data.lastName || !data.firstName || !data.email) {
      return setError('Фамилия, Имя и Email обязательны');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return setError('Некорректный Email');
    }

    setIsLoading(true);
    try {
      await post('register', {
        phone: fullPhone,
        virtualCode: code,
        firstName: data.firstName,
        lastName: data.lastName,
        middleName: data.middleName,
        email: data.email,
        policyAccepted: policyChecked
      });
      setStep(4);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e, action) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  };

  const errorBlock = error ? (
    <div className="mt-4 rounded-md border border-status-rejected/20 bg-status-rejected/10 px-3 py-2.5 text-[12px] font-semibold leading-relaxed text-status-rejected">
      {error}
    </div>
  ) : null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={handleClose} title={STEP_TITLES[step]} size="normal">

        {/* Шаг 1: телефон */}
        {step === 1 && (
          <div>
            <p className="text-[13px] text-graphite-light font-medium mb-5 leading-relaxed">
              Введите номер телефона, который администратор лиги указал в вашей карточке.
            </p>

            <div className="flex items-center w-full border border-graphite/20 rounded-md bg-white/80 focus-within:border-orange focus-within:shadow-[0_0_0_3px_rgba(255,122,0,0.2)] transition-colors duration-300">
              <div className="pl-4 pr-2 text-graphite font-semibold border-r border-graphite/10 py-3">+7</div>
              <input
                type="tel"
                placeholder="(000) 000-00-00"
                value={formatPhone(phoneRaw)}
                onChange={(e) => { setPhoneRaw(e.target.value.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                onKeyDown={(e) => handleKeyDown(e, handleCheckPhone)}
                disabled={isLoading}
                className="w-full px-3 py-3 bg-transparent text-graphite text-base outline-none placeholder:text-graphite/30 font-medium"
              />
            </div>

            {errorBlock}

            <div className="flex justify-end mt-6">
              <Button onClick={handleCheckPhone} isLoading={isLoading} loadingText="Проверка...">
                Далее
              </Button>
            </div>
          </div>
        )}

        {/* Шаг 2: секретный код */}
        {step === 2 && (
          <div>
            <p className="text-[13px] text-graphite-light font-medium mb-5 leading-relaxed">
              Введите секретный код от вашей карточки — его выдаёт администратор лиги.
            </p>

            <Input
              placeholder="Например, UGPWB"
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
              onKeyDown={(e) => handleKeyDown(e, handleVerifyCode)}
              disabled={isLoading}
              maxLength={50}
            />

            {errorBlock}

            <div className="flex justify-between items-center mt-6 gap-3">
              <button
                type="button"
                onClick={() => { setStep(1); setError(''); }}
                className="text-[12px] font-bold uppercase tracking-widest text-graphite-light hover:text-orange transition-colors"
              >
                Назад
              </button>
              <Button onClick={handleVerifyCode} isLoading={isLoading} loadingText="Проверка...">
                Подтвердить
              </Button>
            </div>
          </div>
        )}

        {/* Шаг 3: данные и согласие */}
        {step === 3 && (
          <div>
            <p className="text-[13px] text-graphite-light font-medium mb-5 leading-relaxed">
              Привет, <b className="text-graphite">{data.firstName}</b>! Проверьте и дополните свои данные — на указанную почту придёт пароль для входа.
            </p>

            <div className="space-y-3">
              <Input
                label="Фамилия"
                placeholder="Петров"
                value={data.lastName}
                onChange={(e) => { setData({ ...data, lastName: e.target.value }); setError(''); }}
                disabled={isLoading}
              />
              <Input
                label="Имя"
                placeholder="Иван"
                value={data.firstName}
                onChange={(e) => { setData({ ...data, firstName: e.target.value }); setError(''); }}
                disabled={isLoading}
              />
              <Input
                label="Отчество"
                placeholder="Иванович"
                value={data.middleName}
                onChange={(e) => { setData({ ...data, middleName: e.target.value }); setError(''); }}
                disabled={isLoading}
              />
              <Input
                label="Электронная почта"
                type="email"
                placeholder="referee@mail.ru"
                value={data.email}
                onChange={(e) => { setData({ ...data, email: e.target.value }); setError(''); }}
                onKeyDown={(e) => handleKeyDown(e, handleSubmit)}
                disabled={isLoading}
              />
            </div>

            {errorBlock}

            <div className="mt-5 flex flex-col gap-2">
              <Checkbox
                className="mb-0"
                label={<span className="text-[12px] leading-snug">Даю согласие на обработку персональных данных</span>}
                checked={policyChecked}
                onChange={(e) => setPolicyChecked(e.target.checked)}
              />
              <button
                type="button"
                onClick={() => setIsPolicyOpen(true)}
                className="text-[12px] text-graphite-light font-semibold underline underline-offset-4 hover:text-orange transition-colors text-left pl-6"
              >
                Политика обработки персональных данных
              </button>
            </div>

            <div className="flex justify-between items-center mt-6 gap-3">
              <button
                type="button"
                onClick={() => { setStep(2); setError(''); }}
                className="text-[12px] font-bold uppercase tracking-widest text-graphite-light hover:text-orange transition-colors"
              >
                Назад
              </button>
              <Button
                onClick={handleSubmit}
                isLoading={isLoading}
                loadingText="Активация..."
                disabled={!policyChecked}
              >
                Активировать аккаунт
              </Button>
            </div>
          </div>
        )}

        {/* Шаг 4: успех */}
        {step === 4 && (
          <div className="text-center py-2">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-circle bg-status-accepted/10 text-status-accepted">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-[22px] font-black text-graphite mb-3">Аккаунт активирован</h3>
            <p className="text-[13px] text-graphite-light font-medium leading-relaxed mb-8 px-2">
              Пароль для входа отправлен на почту <b className="text-graphite">{data.email}</b>.
              Войдите по номеру телефона и этому паролю.
            </p>
            <div className="flex justify-center">
              <Button onClick={handleClose}>Перейти ко входу</Button>
            </div>
          </div>
        )}

      </Modal>

      {/* Текст политики — поверх модалки активации, введённые данные не теряются */}
      <PolicySheet isOpen={isPolicyOpen} onClose={() => setIsPolicyOpen(false)} />
    </>
  );
}
