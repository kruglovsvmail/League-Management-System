// src/components/WebGraphics/defaultGraphics/ArenaOverlay.jsx
//
// Место проведения: название арены, под ним крупно город и погода в нём сейчас
// (иконка и температура), без подписей.
//
// ПОГОДА — open-meteo.com: бесплатно, без ключа, браузерный запрос разрешён.
// Город переводится в координаты их же геокодером. Ответ держим в памяти
// полчаса на город: оверлей открыт весь матч, а титр показывают не раз.
// Не ответил сервис, нет города — блока погоды просто нет, остальное на месте.
import React, { useEffect, useState } from 'react';
import { LowerThird, Kicker, Icon } from './kit';
import { C } from './theme';

const WEATHER_TTL = 30 * 60 * 1000;
const weatherCache = new Map();   // город → { at, data | null }

// Коды погоды WMO → подпись и иконка
function describe(code) {
  if (code === 0) return { text: 'Ясно', icon: 'sun' };
  if (code === 1 || code === 2) return { text: code === 1 ? 'Малооблачно' : 'Переменная облачность', icon: 'partly' };
  if (code === 3) return { text: 'Пасмурно', icon: 'cloud' };
  if (code === 45 || code === 48) return { text: 'Туман', icon: 'fog' };
  if (code >= 51 && code <= 57) return { text: 'Морось', icon: 'rain' };
  if (code === 66 || code === 67) return { text: 'Ледяной дождь', icon: 'rain' };
  if (code >= 61 && code <= 65) return { text: 'Дождь', icon: 'rain' };
  if (code >= 71 && code <= 77) return { text: 'Снег', icon: 'snow' };
  if (code >= 80 && code <= 82) return { text: 'Ливень', icon: 'rain' };
  if (code === 85 || code === 86) return { text: 'Снегопад', icon: 'snow' };
  if (code >= 95) return { text: 'Гроза', icon: 'storm' };
  return { text: '', icon: 'cloud' };
}

async function loadWeather(city) {
  const hit = weatherCache.get(city);
  if (hit && Date.now() - hit.at < WEATHER_TTL) return hit.data;
  let data = null;
  try {
    const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru&format=json`).then(r => r.json());
    const place = geo?.results?.[0];
    if (place) {
      const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,weather_code&timezone=auto`).then(r => r.json());
      const t = w?.current?.temperature_2m;
      if (Number.isFinite(t)) data = { temp: Math.round(t), ...describe(w.current.weather_code) };
    }
  } catch { /* нет сети или сервис не ответил — без погоды */ }
  weatherCache.set(city, { at: Date.now(), data });
  return data;
}

function useWeather(city) {
  const [w, setW] = useState(() => (city ? weatherCache.get(city)?.data || null : null));
  useEffect(() => {
    if (!city) { setW(null); return undefined; }
    let alive = true;
    const run = () => loadWeather(city).then(d => { if (alive) setW(d); });
    run();
    const id = setInterval(run, WEATHER_TTL);
    return () => { alive = false; clearInterval(id); };
  }, [city]);
  return w;
}

// Знак минуса — типографский, а не дефис
const temp = t => `${t < 0 ? '−' : t > 0 ? '+' : ''}${Math.abs(t)}°`;

function Block({ children, delay, first }) {
  return (
    <div className="g2-rise" style={{ '--d': `${delay}ms`, padding: first ? '0 34px 0 0' : '0 34px', borderLeft: first ? 'none' : `1px solid ${C.divider}`,
                                       display: 'flex', alignItems: 'center', gap: 14, whiteSpace: 'nowrap' }}>
      {children}
    </div>
  );
}

export default function ArenaOverlay({ game, overlay }) {
  const city = game?.arena_city || null;
  const weather = useWeather(city);
  if (!game) return null;
  const visible = overlay.visible && overlay.type === 'arena';

  const big = { fontSize: 36, fontWeight: 800, lineHeight: 1, color: C.text };

  return (
    <LowerThird visible={visible} icon="pin">
      <div>
        <div className="g2-rise" style={{ '--d': '240ms' }}>
          <Kicker size={16} color={C.accentSoft}>Место проведения</Kicker>
        </div>
        <div className="g2-slide" style={{ '--d': '300ms', marginTop: 10, fontSize: 40, fontWeight: 800, lineHeight: 1.05, color: C.text, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          {game.arena_name || game.location_text || 'Ледовая арена'}
        </div>

        {(city || weather) && (
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.divider}` }}>
            {city && (
              <Block delay={400} first>
                <span style={big}>{city}</span>
              </Block>
            )}
            {weather && (
              <Block delay={480} first={!city}>
                <Icon name={weather.icon} size={42} color={C.accentSoft} stroke={1.7} />
                <span className="g2-num" style={big}>{temp(weather.temp)}</span>
              </Block>
            )}
          </div>
        )}
      </div>
    </LowerThird>
  );
}
