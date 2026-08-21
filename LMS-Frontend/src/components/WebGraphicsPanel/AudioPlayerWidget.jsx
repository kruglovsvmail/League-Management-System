import React, { useState, useEffect } from 'react';
import { getToken } from '../../utils/helpers';
import { Icon } from '../../ui/Icon';

const API_BASE = import.meta.env.VITE_API_URL;

// Вкладка «Аудио»: зацикленное интро и озвучка составов.
//
// Своей сворачивающейся шапки у виджета больше нет — её роль играет вкладка, и
// она же подсвечивается зелёным, пока интро или озвучка идут в эфир.
export function AudioPlayerWidget({ gameId, socket, audioPlaying, audioSource, introPlaying, setIntroPlaying, persistParams }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const rosterPlaying = audioSource === 'roster';
  const isIntroActive = introPlaying; // audioSource теперь только голосовой канал, интро отслеживается отдельно

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

  const introToggle = () => {
    if (isIntroActive) {
      socket?.emit('trigger_obs_overlay', { type: 'audio', gameId, action: 'stop', source: 'intro' });
      setIntroPlaying(false);
    } else {
      if (!audioUrl) return;
      socket?.emit('trigger_obs_overlay', {
        type: 'audio', gameId, action: 'play', source: 'intro',
        data: { url: audioUrl, loop: true }
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
          data: { url: data.url, loop: false }
        });
      }
    } catch (e) {
      console.error('TTS roster error:', e);
    } finally {
      setRosterLoading(false);
    }
  };

  const voiceLabel = !audioPlaying ? null
    : audioSource === 'event' ? 'Озвучка события'
    : audioSource === 'roster' ? 'Озвучка состава'
    : 'Голосовой канал';

  return (
    <div className="h-full flex flex-col bg-white">

      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-graphite/10 shrink-0">
        <span className={`w-6 h-6 flex items-center justify-center rounded ${
          isIntroActive || audioPlaying ? 'text-status-accepted bg-status-accepted/10 animate-pulse' : 'text-graphite/25'
        }`}>
          <Icon name="speaker" className="w-3.5 h-3.5" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-graphite/50 truncate">
          {isIntroActive && voiceLabel ? `Интро + ${voiceLabel.toLowerCase()}`
            : isIntroActive ? 'Интро играет'
            : voiceLabel || 'Звук не транслируется'}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-4">
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
            <Icon name="mic" className="w-4 h-4" />
          )}
          {rosterLoading ? 'Генерация...' : rosterPlaying ? 'Остановить озвучку состава' : 'Озвучить состав'}
        </button>
      </div>

    </div>
  );
}
