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

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const [isReady, setIsReady] = useState(false);

  const [isChrome, setIsChrome] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  const [isOtherBrowser, setIsOtherBrowser] = useState(false);

  const SERVER_URL = import.meta.env.VITE_API_URL;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  useEffect(() => {
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    let originalContent = '';

    if (viewportMeta) {
      originalContent = viewportMeta.getAttribute('content');
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }

    const readyTimer = setTimeout(() => setIsReady(true), 100);

    return () => {
      clearTimeout(readyTimer);
      if (viewportMeta && originalContent) {
        viewportMeta.setAttribute('content', originalContent);
      }
    };
  }, []);

  useEffect(() => {
    let interval;
    if (timer > 0) interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [timer]);

  useEffect(() => {
    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    setIsStandalone(checkStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    const checkChrome = /chrome|crios|crmo/i.test(ua) && !/opr|opera|edg|yabrowser/i.test(ua);
    const checkSafari = /safari/i.test(ua) && !/chrome|crios|crmo|edg|opr|opera|yabrowser/i.test(ua);
    
    setIsChrome(checkChrome);
    setIsSafari(checkSafari);
    setIsOtherBrowser(!checkChrome && !checkSafari);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setIsInstallable(false);
      }
    }
  };

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
        if (data.success && data.firstName) setUserName(data.firstName);
        else setUserName('');
      } catch (err) { console.error(err); }
    } else { setUserName(''); }
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
        const storage = isRemembered ? localStorage : sessionStorage;
        storage.setItem('hockeyeco_user', JSON.stringify(data.user));
        storage.setItem('hockeyeco_token', data.token);
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
      if (data.success) setEmailMsg(data.message);
      else { setEmailMsg(data.error); setTimer(0); }
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
    <div className="min-h-[100dvh] flex items-start sm:items-center justify-center relative p-4 pt-10 pb-28 sm:pt-4 sm:pb-4 font-sans overflow-x-hidden overflow-y-auto">
      
      {/* Фоновые градиенты */}
      <div className="fixed inset-0 z-[-1] bg-[#e0e0e0ff]">
        <div className="absolute top-[-15%] right-[-5%] w-[600px] h-[600px] rounded-full bg-graphite-light/30 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[700px] h-[700px] rounded-full bg-graphite-dark/20 blur-[150px] pointer-events-none"></div>
      </div>

      {/* Единый контейнер карточки */}
      <div className={`relative flex flex-col mt-[-3rem] sm:flex-row items-stretch bg-white/60 backdrop-blur-xl border border-white/80 sm:rounded-[1rem] shadow-2xl shadow-black/5 z-20 ${isReady ? 'transition-all duration-500 ease-in-out' : ''}`}>
        
{/* ЛЕВАЯ ЧАСТЬ: Основная форма авторизации */}
        <div className="w-[calc(100vw-0px)] sm:w-[400px] p-10 sm:p-8 shrink-0 relative  z-20 sm:bg-transparent rounded-[2rem] sm:rounded-none">
          <div className="text-left mb-3">
            <h1 className="text-4xl font-bold text-graphite tracking-tight">HockeyEco <span className="text-orange">LMS</span></h1>
          </div>

          <div className="text-left mb-8 h-6">
            {userName ? (
              <p className="text-graphite font-bold text-lg animate-zoom-in">Привет, {userName}!</p>
            ) : (
              <p className="text-graphite-light text-sm font-semibold uppercase tracking-wide leading-none">Система управления лигой</p>
            )}
          </div>

          <div className="space-y-4">
            <div className="relative">
              <div className="relative flex items-center w-full border border-graphite/20 rounded-md bg-white/80 focus-within:border-orange focus-within:shadow-[0_0_0_3px_rgba(255,122,0,0.2)] transition-colors duration-300">
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
              <div className="relative flex items-center w-full border border-graphite/20 rounded-md bg-white/80 focus-within:border-orange focus-within:shadow-[0_0_0_3px_rgba(255,122,0,0.2)] transition-colors duration-300">
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
                  placeholder="Email для сброса" 
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailMsg(''); }}
                  onKeyDown={(e) => handleKeyDown(e, handleForgotPassword)}
                  className="w-full px-4 py-2 border border-graphite/20 rounded-md bg-white/80 text-graphite text-sm outline-none focus:border-orange"
                />
                <div className="flex justify-end pt-1">
                  <button 
                    onClick={handleForgotPassword} 
                    disabled={!isEmailValid || timer > 0}
                    className={`text-[11px] font-bold transition-colors uppercase tracking-widest ${!isEmailValid ? 'text-graphite/20' : timer > 0 ? 'text-orange' : 'text-graphite-light hover:text-orange underline'}`}
                  >
                    {timer > 0 ? `${timer} сек` : 'Сбросить'}
                  </button>
                </div>
                <p className={`text-[10px] text-right font-bold uppercase transition-all duration-300 ${emailMsg ? 'opacity-100' : 'opacity-0'} ${emailMsg.includes('ошиб') || emailMsg.includes('не найден') ? 'text-status-rejected' : 'text-status-accepted'}`}>
                  {emailMsg}
                </p>
              </div>
            </div>

            <div className="pt-2 relative z-20">
              <Button onClick={handleLogin} isLoading={isLoading} loadingText="Вход..." className="w-full text-[16px] shadow-lg h-12 shadow-orange/20">
                Войти в систему
              </Button>
            </div>
          </div>
        </div>

        {/* ПРАВАЯ ЧАСТЬ: Выезжающее меню PWA */}
        <div 
          className={`overflow-hidden relative z-10 ${isReady ? 'transition-all duration-500 ease-in-out' : ''} ${
            isMenuOpen 
              ? 'max-h-[500px] sm:max-h-none w-full sm:w-[320px] opacity-100 sm:border-t-0 sm:border-l border-graphite/10' 
              : 'max-h-0 sm:max-h-none w-full sm:w-0 opacity-0 border-none'
          }`}
        >
          <div className="w-[calc(100vw-0px)] sm:w-[320px] p-8 sm:p-8 sm:pl-0 h-full flex flex-col">
            
            <div className="h-full pt-6 sm:pt-0 sm:pl-8 flex flex-col text-graphite/50">
              
              <h3 className="text-[11px] font-black uppercase tracking-widest mb-6 text-graphite/40">
                Приложение LMS
              </h3>

              {isOtherBrowser ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center opacity-80 animate-zoom-in">
                   <svg className="w-10 h-10 mb-4 text-graphite/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                   </svg>
                   <p className="text-[11px] font-semibold leading-relaxed text-graphite/60">
                     Установка PWA-приложения доступна только в браузерах <br/><b className="text-graphite">Google Chrome</b> и <b className="text-graphite">Safari</b>.
                   </p>
                   <p className="text-[10px] mt-4 text-graphite/40">
                     Пожалуйста, откройте этот сайт в одном из них.
                   </p>
                </div>
              ) : (
                <div className="space-y-6 flex-1 flex flex-col">
                  <section>
                    {isStandalone ? (
                      <div className="p-3 rounded-md border border-status-accepted/30 bg-status-accepted/5 text-center">
                        <span className="text-[10px] font-bold text-status-accepted/70 uppercase tracking-widest">Установлено</span>
                      </div>
                    ) : (
                      <>
                        {isSafari ? (
                          <div className="space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider mb-2">Браузер Safari:</p>
                            <div className="flex items-center gap-3 bg-white/60 p-2.5 rounded-md border border-graphite/10">
                              <svg className="w-4 h-4 text-graphite/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4m0 0L8 6m4-4v13"/></svg>
                              <span className="text-[11px] font-medium leading-tight text-graphite/70">1. Нажмите «Поделиться» (внизу)</span>
                            </div>
                            <div className="flex items-center gap-3 bg-white/60 p-2.5 rounded-md border border-graphite/10">
                              <div className="w-4 h-4 rounded flex items-center justify-center shrink-0 text-[14px] font-bold text-graphite/50 border border-graphite/20">+</div>
                              <span className="text-[11px] font-medium leading-tight text-graphite/70">2. Нажмите «На экран "Домой"»</span>
                            </div>
                          </div>
                        ) : isChrome ? (
                          <div className="space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider">Браузер Chrome:</p>
                            <button 
                              onClick={handleInstallClick} 
                              disabled={!isInstallable}
                              className={`w-full py-2.5 rounded-md border text-[11px] font-bold uppercase tracking-widest transition-colors ${
                                isInstallable 
                                  ? 'bg-white/50 border-graphite/20 text-graphite/60 hover:border-orange hover:text-orange shadow-sm'
                                  : 'bg-transparent border-graphite/10 text-graphite/30 cursor-not-allowed'
                              }`}
                            >
                              {isInstallable ? 'Установить приложение' : 'Недоступно / Установлено'}
                            </button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </section>

                  <section className="pt-5 border-t border-graphite/10 mt-auto">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-graphite/30 mb-3 flex items-center gap-1.5">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Очистка кэша
                    </h4>
                    <div className="space-y-3">
                      {isSafari && (
                        <div className="text-[10px] leading-relaxed text-graphite/50 bg-white/30 p-2.5 rounded-lg border border-graphite/5">
                          <span className="font-bold text-graphite/70 block mb-1">В браузере Safari:</span>
                          1. Откройте «Настройки» iPhone.<br/>
                          2. Выберите раздел «Safari».<br/>
                          3. Нажмите «Очистить историю и данные» и подтвердите.
                        </div>
                      )}
                      
                      {isChrome && (
                        <div className="text-[10px] leading-relaxed text-graphite/50 bg-white/30 p-2.5 rounded-lg border border-graphite/5">
                          <span className="font-bold text-graphite/70 block mb-1">В браузере Chrome:</span>
                          1. Нажмите меню (три точки).<br/>
                          2. Выберите «История» → «Очистить историю».<br/>
                          3. Выберите диапазон «Все время».<br/>
                          4. Отметьте «Файлы cookie» и «Изображения», затем нажмите «Удалить данные».
                        </div>
                      )}
                      <div className="hidden sm:block text-[10px] leading-relaxed text-graphite/50 bg-white/30 p-2.5 rounded-lg border border-graphite/5">
                        Для ПК: Нажмите  —  <span className="bg-graphite/70 text-white px-1.5 py-0.5 rounded-md">Ctrl + F5</span> / <span className="bg-graphite/70 text-white px-1.5 py-0.5 rounded-md">⌥ + ⌘ + R</span>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ЯРЛЫК (Шеврон) - Адаптивное позиционирование */}
        <div 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`absolute z-[40] cursor-pointer group hover:bg-graphite/10 transition-colors bg-white/20 border border-white/50 flex items-center justify-center
            sm:left-full sm:top-[16%] sm:translate-x-0 sm:translate-y-0 sm:rounded-r-full sm:px-1.5 sm:py-6 sm:rounded-b-none
            left-3/4 -translate-x-1/2 top-full w-[120px] h-[30px] sm:h-[90px] sm:w-[30px] rounded-b-full px-6 py-2
          `}
          title={isMenuOpen ? "Скрыть меню" : "Установка PWA"}
        >
            <svg 
              className={`text-white/80 w-5 h-5 ${isReady ? 'transition-transform duration-500' : ''}`} 
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              {/* ПК: Открыть -> вправо, Закрыть -> влево */}
              <path 
                strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" 
                d={isMenuOpen ? "M15 19l-7-7 7-7" : "M9 5l7 7-7 7"} 
                className="hidden sm:block" 
              />
              {/* Мобильный: Открыть -> вниз, Закрыть -> вверх */}
              <path 
                strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" 
                d={isMenuOpen ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} 
                className="sm:hidden" 
              />
            </svg>
        </div>

      </div>
    </div>
  );
}