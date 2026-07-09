import React, { useState, useEffect } from 'react';
import { getToken } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';

const API_BASE = import.meta.env.VITE_API_URL;

export function AudioPlayerWidget({ gameId, socket, volume, setVolume, audioPlaying, audioSource, introPlaying, setIntroPlaying, persistParams }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const rosterPlaying = audioSource === 'roster';
  const isIntroActive = introPlaying; // audioSource теперь только голосовой канал, интро отслеживается отдельно
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const fetchAudioUrl = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/games/${gameId}/audio-url`, {
          headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await res.json();
        if (data.success && data.url) setAudioUrl(data.url);
      } catch (e) { console.error(e); }
    };
    fetchAudioUrl();
  }, [gameId]);

  const handleVolumeChange = (newVol) => {
    setVolume(newVol);
    socket?.emit('trigger_obs_overlay', {
      type: 'audio', gameId, action: 'volume',
      data: { volume: newVol / 100 }
    });
  };

  const introToggle = () => {
    if (isIntroActive) {
      socket?.emit('trigger_obs_overlay', { type: 'audio', gameId, action: 'stop', source: 'intro' });
      setIntroPlaying(false);
    } else {
      if (!audioUrl) return;
      socket?.emit('trigger_obs_overlay', {
        type: 'audio', gameId, action: 'play', source: 'intro',
        data: { url: audioUrl, volume: volume / 100, loop: true }
      });
      // Сохраняем URL интро в params (БД), чтобы при реконнекте/перезагрузке OBS-оверлей
      // мог сам восстановить воспроизведение — иначе он знает только "intro_playing=true",
      // но не URL файла (тот раньше жил только в локальном стейте этого виджета).
      persistParams?.({ introUrl: audioUrl });
      setIntroPlaying(true);
    }
  };

  const handleTtsRoster = async () => {
    if (rosterPlaying) {
      socket?.emit('trigger_obs_overlay', { type: 'audio', gameId, action: 'stop', source: 'roster' });
      return;
    }
    if (audioSource === 'event') return; // событие TTS прерывать нельзя, интро — независимо
    setRosterLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/games/${gameId}/broadcast/tts/roster`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success && data.url) {
        socket?.emit('trigger_obs_overlay', {
          type: 'audio', gameId, action: 'play', source: 'roster',
          data: { url: data.url, volume: volume / 100, loop: false }
        });
      }
    } catch (e) {
      console.error('TTS roster error:', e);
    } finally {
      setRosterLoading(false);
    }
  };

  return (
    <div className="bg-white border-b border-graphite/10 shrink-0">
      <div
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none hover:bg-graphite/5 transition-colors"
        title={open ? 'Свернуть' : 'Развернуть'}
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-graphite/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <h3 className="text-[11px] font-black uppercase tracking-widest text-graphite/80 leading-none mt-0.5">Аудио</h3>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-6 h-6 flex items-center justify-center rounded ${audioPlaying ? 'text-status-accepted bg-status-accepted/10 animate-pulse' : 'text-graphite/25'}`} title={audioPlaying ? 'Идёт трансляция звука' : 'Звук не транслируется'}>
            <Icon name="speaker" className="w-3.5 h-3.5" />
          </span>
          <span className="w-6 h-6 flex items-center justify-center rounded text-graphite/40">
            <Icon name="chevron" className={`w-3.5 h-3.5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
          </span>
        </div>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="flex gap-6 px-4 py-2 border-t border-graphite/5 bg-graphite/[0.02]">

            <div className="flex-1 flex flex-col gap-4 justify-center min-w-0">
              <button
                onClick={introToggle}
                disabled={!audioUrl}
                className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${isIntroActive ? 'bg-status-accepted/10 text-status-accepted' : 'bg-graphite/5 hover:bg-graphite/10 text-graphite/70'} disabled:opacity-30 disabled:cursor-default`}
              >
                <Icon name={isIntroActive ? 'stop' : 'play'} className="w-4 h-4" />
                {!audioUrl ? 'Intro не найден' : isIntroActive ? 'Выключить Intro' : 'Включить Intro'}
              </button>

              <button
                onClick={handleTtsRoster}
                disabled={rosterLoading || (audioPlaying && audioSource === 'event')}
                className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${rosterPlaying ? 'bg-status-accepted/10 text-status-accepted' : 'bg-graphite/5 hover:bg-graphite/10 text-graphite/70'} disabled:opacity-30 disabled:cursor-default`}
              >
                {rosterLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m-4-1h8M12 3a3 3 0 00-3 3v4a3 3 0 006 0V6a3 3 0 00-3-3z"/></svg>
                )}
                {rosterLoading ? 'Генерация...' : rosterPlaying ? 'Остановить озвучку состава' : 'Озвучить состав'}
              </button>
            </div>

            {/* Вертикальный регулятор громкости — справа от кнопок */}
            <div className="flex flex-col items-center gap-1.5 shrink-0 pt-2">
              <span className="text-[10px] font-bold text-graphite/40 tabular-nums leading-none">{volume}%</span>
              <div className="relative" style={{ width: '40px', height: '64px' }}>
                <input
                  type="range" min="0" max="100" value={volume}
                  onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                  className="absolute top-1/2 left-1/2 h-1 bg-graphite/10 rounded-lg appearance-none cursor-pointer accent-graphite/50"
                  style={{ width: '64px', transform: 'translate(-50%, -50%) rotate(-90deg)' }}
                />
              </div>
              <svg className="w-3 h-3 text-graphite/30 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/></svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
