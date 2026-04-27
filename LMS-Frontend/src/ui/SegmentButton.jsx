import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';

export function SegmentButton({ options = ['Дни', 'Недели', 'Месяцы'], defaultIndex = 0, onChange }) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);
  const [sliderStyle, setSliderStyle] = useState({ width: 0, transform: 'translateX(0)' });
  const itemRefs = useRef([]);

  // Функция пересчета позиции и ширины бегунка
  const updateSlider = () => {
    const activeBtn = itemRefs.current[activeIndex];
    if (activeBtn) {
      setSliderStyle({
        width: `${activeBtn.offsetWidth}px`,
        transform: `translateX(${activeBtn.offsetLeft}px)`
      });
    }
  };

  // Вычисляем размеры перед тем, как браузер отрисует кадр
  useLayoutEffect(() => {
    updateSlider();
  }, [activeIndex]);

  // Следим за изменениями окна (чтобы бегунок не съезжал при ресайзе или смене ориентации телефона)
  useEffect(() => {
    window.addEventListener('resize', updateSlider);
    // Небольшой хак: пересчитываем позицию после загрузки кастомных шрифтов
    const timeout = setTimeout(updateSlider, 150); 
    
    return () => {
      window.removeEventListener('resize', updateSlider);
      clearTimeout(timeout);
    };
  }, [activeIndex]);

  const handleSelect = (idx) => {
    setActiveIndex(idx);
    if (onChange) onChange(idx);
  };

  return (
    <div className="flex bg-graphite/10 rounded-md p-1 relative isolate">
        <div 
        className="absolute top-[3px] bottom-[3px] left-0 bg-white rounded-sm shadow-sm transition-all duration-200 ease-out z-0 pointer-events-none"
        style={sliderStyle}
      />
      
      {options.map((opt, idx) => (
        <div 
          key={idx}
          ref={(el) => (itemRefs.current[idx] = el)}
          onClick={() => handleSelect(idx)}
          className={`flex-1 text-center py-1.5 cursor-pointer font-semibold transition-colors duration-200 z-10 rounded-sm relative text-[12px] ${
            activeIndex === idx ? 'text-orange' : 'text-graphite'
          }`}
        >
          {opt}
        </div>
      ))}
    </div>
  );
}