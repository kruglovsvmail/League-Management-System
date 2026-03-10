import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';

export function LoginPage({ onLoginSuccess }) {
  const [phoneRaw, setPhoneRaw] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRemembered, setIsRemembered] = useState(false);
  
  const [userName, setUserName] = useState('');
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [emailMsg, setEmailMsg] = useState('');
  const [timer, setTimer] = useState(0);

  // Глобальные статусы загрузки
  const [isLoading, setIsLoading] = useState(false);

  const SERVER_URL = import.meta.env.VITE_API_URL;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  useEffect(() => {
    let interval;
    if (timer > 0) {
      interval = setInterval(() => {
        setTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handlePhoneChange = async (e) => {
    const val = e.target.value.replace(/\D/g, ''); 
    const truncated = val.slice(0, 10);
    setPhoneRaw(truncated);
    setErrorMsg('');
    setEmailMsg(''); 

    if (truncated.length === 10) {
      try {
        const fullPhone = `+7${truncated}`;
        const response = await fetch(`${SERVER_URL}/api/lookup-phone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: fullPhone })
        });

        const data = await response.json();
        if (data.success && data.firstName) {
          setUserName(data.firstName);
        } else {
          setUserName('');
        }
      } catch (err) {
        console.error("Ошибка при поиске номера", err);
      }
    } else {
      setUserName('');
    }
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

  const handleLogin = async () => {
    if (phoneRaw.length !== 10 || !password) {
      setErrorMsg('Заполните телефон и пароль');
      return;
    }

    setIsLoading(true);

    try {
      const fullPhone = `+7${phoneRaw}`;
      const response = await fetch(`${SERVER_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, password })
      });

      const data = await response.json();
      
      if (data.success) {
        // Сохраняем и пользователя, и полученный токен
        if (isRemembered) {
          localStorage.setItem('hockeyeco_user', JSON.stringify(data.user));
          localStorage.setItem('hockeyeco_token', data.token);
        } else {
          sessionStorage.setItem('hockeyeco_user', JSON.stringify(data.user));
          sessionStorage.setItem('hockeyeco_token', data.token);
        }
        onLoginSuccess(data.user);
      } else {
        setErrorMsg(data.error || 'Ошибка входа');
        setIsLoading(false);
      }
    } catch (err) {
      setErrorMsg('Ошибка соединения с сервером');
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (phoneRaw.length !== 10) {
      setEmailMsg('Сначала введите ваш номер телефона выше');
      return;
    }
    if (!isEmailValid) return;

    setTimer(30);
    setEmailMsg('');

    try {
      const fullPhone = `+7${phoneRaw}`;
      const response = await fetch(`${SERVER_URL}/api/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, email })
      });

      const data = await response.json();
      
      if (data.success) {
        setEmailMsg(data.message);
      } else {
        setEmailMsg(data.error);
        setTimer(0);
      }
    } catch (err) {
      setEmailMsg('Ошибка соединения с сервером');
      setTimer(0);
    }
  };

  const handleKeyDown = (e, action) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (action === handleForgotPassword && (!isEmailValid || timer > 0)) return;
      action();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative p-4 font-sans overflow-hidden">
      <div className="fixed inset-0 z-[-1] bg-[#e0e0e0ff]">
        <div className="absolute top-[-15%] right-[-5%] w-[600px] h-[600px] rounded-full bg-graphite-light/30 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[700px] h-[700px] rounded-full bg-graphite-dark/20 blur-[150px] pointer-events-none"></div>
      </div>

      <div className="w-full max-w-[400px] bg-white/60 backdrop-blur-xl border border-white/80 rounded-3xl p-8 shadow-2xl shadow-black/5 animate-fade-in-down z-10">
        
        <div className="text-center mb-6">
          <h1 className="text-4xl font-bold text-graphite tracking-tight">HockeyEco <span className="text-orange">LMS</span></h1>
        </div>

        <div className="text-center mb-8 h-6">
          {userName ? (
            <p className="text-graphite font-bold text-lg animate-fade-in-down">Привет, {userName}!</p>
          ) : (
            <p className="text-graphite-light text-sm font-semibold uppercase tracking-wide">Доступ к вашей панели управления</p>
          )}
        </div>

        <div className="space-y-4">
          <div className="relative">
            <div className="relative flex items-center w-full border border-graphite/20 rounded-md bg-white/80 transition-all duration-300 focus-within:border-orange focus-within:shadow-[0_0_0_3px_rgba(255,122,0,0.2)]">
              <div className="pl-4 pr-2 text-graphite font-semibold border-r border-graphite/10 py-3">+7</div>
              <input 
                type="tel"
                placeholder="(000) 000-00-00"
                value={formatPhone(phoneRaw)}
                onChange={handlePhoneChange}
                onKeyDown={(e) => handleKeyDown(e, handleLogin)}
                className="w-full px-3 py-3 bg-transparent text-graphite text-base outline-none placeholder:text-graphite/30 font-medium"
              />
            </div>
          </div>

          <div className="relative">
            <div className="relative flex items-center w-full border border-graphite/20 rounded-md bg-white/80 transition-all duration-300 focus-within:border-orange focus-within:shadow-[0_0_0_3px_rgba(255,122,0,0.2)]">
              <input 
                type={showPassword ? "text" : "password"}
                placeholder="Введите пароль"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrorMsg(''); }}
                onKeyDown={(e) => handleKeyDown(e, handleLogin)}
                className="w-full pl-4 pr-12 py-3 bg-transparent text-graphite text-base outline-none"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 text-graphite-light hover:text-orange transition-colors"
                tabIndex="-1"
              >
                {showPassword ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                )}
              </button>
            </div>
          </div>

          <div className="h-[0px] flex items-center justify-center">
            <div className={`text-status-rejected text-[12px] font-semibold text-center transition-all duration-300 ease-out ${errorMsg ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}>
              {errorMsg}
            </div>
          </div>

          <div className="flex text-[13px] font-semibold justify-between items-center">
            <Checkbox 
              label="Запомнить меня" 
              checked={isRemembered} 
              onChange={(e) => setIsRemembered(e.target.checked)} 
            />
            <button 
              onClick={() => setIsForgotMode(!isForgotMode)}
              className="text-[12px] text-graphite-light font-semibold underline underline-offset-4 hover:text-orange transition-colors mb-4"
            >
              Забыли пароль?
            </button>
          </div>

          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isForgotMode ? 'max-h-[170px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="border-t border-graphite/10 pt-4 pb-2 space-y-3">
              <input 
                type="email" 
                placeholder="Введите ваш Email" 
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailMsg(''); }}
                onKeyDown={(e) => handleKeyDown(e, handleForgotPassword)}
                className="w-full px-4 py-2 border border-graphite/20 rounded-md bg-white/80 text-graphite text-sm outline-none focus:border-orange"
              />
              <div className="flex justify-end pt-1">
                <button 
                  onClick={handleForgotPassword} 
                  disabled={!isEmailValid || timer > 0}
                  className={`text-[12px] font-semibold transition-colors ${
                    !isEmailValid 
                      ? 'text-graphite-light/40 cursor-not-allowed'
                      : timer > 0
                        ? 'text-orange cursor-default'
                        : 'text-graphite-light underline underline-offset-4 hover:text-orange cursor-pointer'
                  }`}
                >
                  {timer > 0 ? `Повторить через ${timer} сек` : 'Отправить новый пароль'}
                </button>
              </div>
              
              <div className="h-4 flex items-center justify-end">
                <p className={`text-xs text-right font-semibold transition-all duration-300 ease-out ${emailMsg ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'} ${emailMsg.includes('ошиб') || emailMsg.includes('не найден') || emailMsg.includes('сначала') ? 'text-status-rejected' : 'text-status-accepted'}`}>
                  {emailMsg}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button onClick={handleLogin} isLoading={isLoading} loadingText="Вход..." className="w-full">
              Войти
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}