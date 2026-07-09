// src/hooks/useIsMobile.js
import { useState, useEffect } from 'react';

// Мобильный = маленький экран И тач/мобильный UA (как у ui/Select.jsx).
// AND, а не OR: тачскрин-десктоп на полной ширине не должен получать нативные мобильные контролы,
// и просто узкое окно десктопного браузера без тача — тоже.
//
// Важно: панель секретаря принудительно открывается в landscape (см. OrientationGuard.jsx),
// а в landscape у телефона innerWidth — это ДЛИННАЯ сторона экрана (у большинства телефонов
// в landscape это 800-930px), поэтому сравнивать нужно МЕНЬШУЮ из сторон (innerWidth/innerHeight,
// screen.width/height) — она не меняется при повороте экрана.
function detect() {
  const minViewportDim = Math.min(window.innerWidth, window.innerHeight);
  const minScreenDim = Math.min(window.screen.width, window.screen.height);
  const smallDevice = minViewportDim <= 850 || minScreenDim <= 850;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const hasMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  return smallDevice && (hasTouch || hasMobileUA);
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => detect());

  useEffect(() => {
    const onResize = () => setIsMobile(detect());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  return isMobile;
}
