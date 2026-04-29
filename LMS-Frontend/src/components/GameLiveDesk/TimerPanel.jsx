// src/components/GameLiveDesk/TimerPanel.jsx
import React, { useState } from 'react';
import { formatTime, formatTimeMask, getPeriodLimits, parseTime } from './GameDeskShared';
import { TimerSettingsDrawer } from '../../modals/TimerSettingsDrawer';
import { getImageUrl } from '../../utils/helpers';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';

export const TimerPanel = ({
  game, currentPeriod, changePeriod, timerSeconds, isTimerRunning, handleTimerAction,
  periodsCount, setPeriodsCount, periodLength, setPeriodLength, otLength, setOtLength, soLength, setSoLength, saveTimerSettings,
  trackPlusMinus, setTrackPlusMinus, socketConnected, onSetTime,
  onRecalculate, onFinishGame, isFinishing, isRecalculating, isReadOnly
}) => {
  const [isEditingTimer, setIsEditingTimer] = useState(false);
  const [manualTimerInput, setManualTimerInput] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const homeShortName = game?.home_short_name || game?.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShortName = game?.away_short_name || game?.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';
  
  const homeLogo = getImageUrl(game?.home_team_logo || game?.home_logo_url || game?.home_logo);
  const awayLogo = getImageUrl(game?.away_team_logo || game?.away_logo_url || game?.away_logo);

  const openTimerEdit = () => {
    setIsEditingTimer(true);
    setManualTimerInput(formatTime(timerSeconds));
  };

  const saveTimerEdit = () => {
    if (manualTimerInput.trim() === '') {
      setIsEditingTimer(false);
      return;
    }
    const secs = parseTime(manualTimerInput);
    if (secs !== null) onSetTime(secs);
    setIsEditingTimer(false);
  };

  const toggleTimer = () => {
    handleTimerAction(isTimerRunning ? 'stop' : 'start');
  };

  const currentLimits = getPeriodLimits(currentPeriod, periodLength, otLength, periodsCount);
  const countdownSecs = Math.max(0, currentLimits.end - timerSeconds);

  const periodsArray = Array.from({ length: periodsCount }, (_, i) => String(i + 1)).concat(['OT', 'SO']);

  const isTech = game?.is_technical;
  const techHome = typeof isTech === 'string' ? isTech.split('/')[0] : '+';
  const techAway = typeof isTech === 'string' ? isTech.split('/')[1] : '-';

  return (
    <div className="w-[20%] h-full flex flex-col z-10 border-l border-white/5 shadow-[-4px_0_24px_rgba(0,0,0,0.2)] bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#2a2d32] via-[#1a1c1e] to-[#0a0b0c] text-white p-6 overflow-y-auto custom-scrollbar">
      
      <div className="flex justify-center items-center gap-4 mb-8 bg-white/5 py-5 px-3 border border-white/10 rounded-md shadow-inner relative">
        {isTech && (
            <div className="absolute top-2 left-0 right-0 flex justify-center">
                <span className="text-[8px] font-black text-status-rejected uppercase tracking-widest bg-status-rejected/10 border border-status-rejected/20 px-2 py-0.5 rounded">Тех. результат</span>
            </div>
        )}
        <div className={`flex flex-col items-center w-1/3 gap-1 ${isTech ? 'mt-3' : ''}`}>
          {homeLogo && <img src={homeLogo} alt={homeShortName} className="w-16 h-16 object-contain drop-shadow-md mb-1" />}
          <span className="text-[12px] text-white/50 uppercase font-black tracking-widest leading-none truncate w-full text-center">{homeShortName}</span>
          <span className={`font-black leading-none mt-1 ${isTech ? 'text-status-rejected text-[44px]' : 'text-white text-5xl'}`}>{isTech ? techHome : (game?.home_score || 0)}</span>
        </div>
        
        <div className={`flex flex-col justify-center items-center pb-1 ${isTech ? 'mt-3' : ''}`}>
          <span className="text-white/30 font-bold text-3xl mb-1">:</span>
        </div>

        <div className={`flex flex-col items-center w-1/3 gap-1 ${isTech ? 'mt-3' : ''}`}>
          {awayLogo && <img src={awayLogo} alt={awayShortName} className="w-16 h-16 object-contain drop-shadow-md mb-1" />}
          <span className="text-[12px] text-white/50 uppercase font-black tracking-widest leading-none truncate w-full text-center">{awayShortName}</span>
          <span className={`font-black leading-none mt-1 ${isTech ? 'text-status-rejected text-[44px]' : 'text-white text-5xl'}`}>{isTech ? techAway : (game?.away_score || 0)}</span>
        </div>
      </div>

      <div className="mb-8">
        <div className="text-[10px] text-white/40 uppercase font-bold mb-2 tracking-widest text-center">Период</div>
        <div 
          className="grid gap-1.5 bg-white/5 p-1 border border-white/10 rounded-lg"
          style={{ gridTemplateColumns: `repeat(${Math.min(periodsArray.length, 5)}, minmax(0, 1fr))` }}
        >
          {periodsArray.map(p => {
            const isOTDisabled = p === 'OT' && parseInt(otLength, 10) === 0;
            const isSODisabled = p === 'SO' && parseInt(soLength, 10) === 0;
            const isDisabled = isOTDisabled || isSODisabled || isReadOnly;

            return (
              <button 
                key={p} 
                onClick={() => !isDisabled && changePeriod(p)} 
                disabled={isDisabled}
                className={`py-1.5 text-xs font-black rounded-md transition-colors ${
                  isDisabled 
                    ? 'opacity-20 cursor-not-allowed text-white/20' 
                    : currentPeriod === p 
                      ? 'bg-white/20 text-white shadow-sm' 
                      : 'text-white/40 hover:text-white hover:bg-white/10'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-6">
        <div className="text-[10px] text-status-accepted uppercase font-bold mb-2 tracking-widest text-center flex items-center justify-center gap-1.5">
           <span className={`w-2 h-2 rounded-full ${isTimerRunning ? 'bg-status-accepted animate-pulse' : 'bg-white/20'}`}></span>
           Сквозное время
        </div>
        
        <div className={`relative flex items-center justify-center h-[90px] border rounded-lg mb-3 shadow-inner transition-colors group ${isTimerRunning ? 'bg-[#000000] border-status-accepted/30' : 'bg-white/5 border-white/10'}`}>
          {isEditingTimer && !isReadOnly ? (
            <input
              autoFocus
              className="w-full text-center font-mono text-6xl font-black text-status-accepted bg-transparent outline-none"
              value={manualTimerInput}
              onChange={(e) => setManualTimerInput(formatTimeMask(e.target.value))}
              onBlur={saveTimerEdit}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveTimerEdit(); } }}
            />
          ) : (
            <span className={`font-mono text-6xl font-black tabular-nums tracking-tighter ${isTimerRunning ? 'text-status-accepted' : 'text-white'}`}>
              {formatTime(timerSeconds)}
            </span>
          )}

          {!isEditingTimer && !isReadOnly && (
            <button 
              onClick={openTimerEdit} 
              className="absolute top-2 right-2 p-1.5 rounded text-white/20 hover:text-white hover:bg-white/10 transition-colors opacity-40 hover:opacity-100"
              title="Редактировать время"
            >
              <Icon name="edit" className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-stretch gap-3">
          <div className="w-[34%] flex flex-col justify-center items-center bg-white/5 border border-dashed border-white/20 rounded-lg py-2 select-none">
            <span className="text-[9px] text-white/40 uppercase font-bold mb-0.5 tracking-widest">Остаток</span>
            <span className={`font-mono text-2xl font-bold tracking-tighter ${countdownSecs <= 60 && isTimerRunning ? 'text-status-rejected animate-pulse' : 'text-white/60'}`}>
               {currentPeriod === 'SO' ? '0:00' : formatTime(countdownSecs)}
            </span>
          </div>

          <button 
             onClick={toggleTimer}
             disabled={currentPeriod === 'SO' || isReadOnly}
             className={`w-[66%] flex items-center justify-center gap-2 rounded-lg font-black text-[13px] uppercase tracking-widest transition-all shadow-sm border ${
               isTimerRunning 
                 ? 'bg-status-rejected/80 hover:bg-status-rejected text-white border-status-rejected/50 shadow-[0_0_15px_rgba(255,69,58,0.2)]' 
                 : 'bg-status-accepted/80 hover:bg-status-accepted text-white border-status-accepted/50 shadow-[0_0_15px_rgba(26,167,47,0.2)]'
             } disabled:opacity-20 disabled:cursor-not-allowed`}
          >
             {isTimerRunning ? (
               <><Icon name="stop" className="w-6 h-6" /> СТОП</>
             ) : (
               <><Icon name="play" className="w-6 h-6" /> СТАРТ</>
             )}
          </button>
        </div>
      </div>

      {!isReadOnly && (
        <div className="flex justify-end mb-6">
          <button 
            onClick={() => setIsSettingsOpen(true)} 
            className="text-white/40 hover:text-white transition-all hover:rotate-90 duration-300" 
            title="Настройки матча"
          >
            <Icon name="gear" className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="mt-auto pt-4 border-t border-white/10">
        {game?.status === 'live' ? (
             <Button 
                 onClick={onFinishGame}
                 isLoading={isFinishing}
                 disabled={isReadOnly}
                 loadingText="Завершение..."
                 className={`w-full text-[9px] uppercase tracking-[2px] transition-all ${isFinishing ? '!bg-white/20 !text-white !shadow-none' : ''}`}
             >
                 Завершить матч
             </Button>
        ) : game?.status === 'finished' && game?.needs_recalc ? (
             <Button 
                onClick={onRecalculate} 
                isLoading={isRecalculating}
                disabled={isReadOnly}
                loadingText="Пересчет..."
                className={`w-full text-[9px] uppercase tracking-[2px] transition-all ${isRecalculating ? '!bg-white/20 !text-white !shadow-none' : ''}`}
             >
                 Пересчёт статистики
             </Button>
        ) : (
             <Button 
                 disabled 
                 className="w-full text-[9px] uppercase tracking-[2px] !bg-white/5 !text-white/40"
             >
                 Пересчёт статистики
             </Button>
        )}
      </div>

      <TimerSettingsDrawer 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        periodsCount={periodsCount} setPeriodsCount={setPeriodsCount}
        periodLength={periodLength} setPeriodLength={setPeriodLength}
        otLength={otLength} setOtLength={setOtLength}
        soLength={soLength} setSoLength={setSoLength}
        saveTimerSettings={saveTimerSettings}
        trackPlusMinus={trackPlusMinus} setTrackPlusMinus={setTrackPlusMinus}
      />
    </div>
  );
};