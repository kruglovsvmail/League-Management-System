import React, { useEffect, useState, useRef } from 'react';

// Типы анимаций, поддерживаемые в новом стиле e-sports
const animations = {
  // Для центральных и крупных плашек (счет, предматч, перерыв) - 3D развертывание
  complex_construct: {
    base: "transition-all duration-700 ease-[cubic-bezier(0.19, 1, 0.22, 1)] origin-center",
    hidden: "opacity-0 rotate-y-90 scale-75",
    visible: "opacity-100 rotate-y-0 scale-100",
  },
  // Для боковых и нижних плашек (удаления, комментаторы) - 3D слайд с поворотом
  geometric_unfold: {
    base: "transition-all duration-500 ease-[cubic-bezier(0.19, 1, 0.22, 1)] origin-left",
    hidden: "opacity-0 -translate-x-full -rotate-y-45 scale-90",
    visible: "opacity-100 translate-x-0 rotate-y-0 scale-100",
  },
  // Для небольших элементов (события, арена) - быстрое 3D появление
  panel_reveal: {
    base: "transition-all duration-400 ease-[cubic-bezier(0.19, 1, 0.22, 1)] origin-bottom",
    hidden: "opacity-0 translate-y-20 rotate-x-45 scale-95",
    visible: "opacity-100 translate-y-0 rotate-x-0 scale-100",
  },
};

export function AnimationWrapper({ 
  children, 
  isVisible, 
  type = 'complex_construct', 
  className = '', 
  delay = 0, // Задержка перед началом анимации
  onExited // Коллбэк при завершении анимации скрытия
}) {
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [activeClasses, setActiveClasses] = useState(animations[type]?.hidden || '');
  const wrapperRef = useRef(null);

  useEffect(() => {
    let animationTimeout;
    let renderTimeout;

    if (isVisible) {
      setShouldRender(true);
      // Сброс классов перед началом анимации появления
      setActiveClasses(animations[type]?.hidden || '');
      
      animationTimeout = setTimeout(() => {
        if (!wrapperRef.current) return;
        // Устанавливаем перспективу для контейнера, чтобы 3D работало
        wrapperRef.current.parentElement.style.perspective = '2000px';
        wrapperRef.current.style.transitionDelay = `${delay}ms`;
        setActiveClasses(`${animations[type]?.base} ${animations[type]?.visible}`);
      }, 50); // Небольшая задержка для корректного применения начального состояния
    } else {
      // Анимация скрытия без задержки
      setActiveClasses(`${animations[type]?.base} ${animations[type]?.hidden}`);
      
      renderTimeout = setTimeout(() => {
        if (!wrapperRef.current) return;
        setShouldRender(false);
        // Сбрасываем перспективу
        if (wrapperRef.current.parentElement) {
          wrapperRef.current.parentElement.style.perspective = '';
        }
        if (onExited) onExited();
      }, (animations[type]?.base?.match(/\d+ms/)?.[0]?.replace('ms', '') || 500)); // Ждем окончания duration
    }

    return () => {
      clearTimeout(animationTimeout);
      clearTimeout(renderTimeout);
    };
  }, [isVisible, type, delay, onExited]);

  if (!shouldRender && !isVisible) return null;

  return (
    <div
      ref={wrapperRef}
      className={`relative z-10 ${className} ${activeClasses}`}
      style={{
        transformStyle: 'preserve-3d', // Включаем 3D для вложенных элементов
        transitionDelay: isVisible ? `${delay}ms` : '0ms'
      }}
    >
      {children}
    </div>
  );
}