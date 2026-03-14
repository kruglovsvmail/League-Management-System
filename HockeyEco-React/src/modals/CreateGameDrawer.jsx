import React, { useState, useEffect } from 'react';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Stepper } from '../ui/Stepper';
import { SegmentButton } from '../ui/SegmentButton';
import { DateTimePicker } from '../ui/DateTimePicker';
import { getImageUrl, getToken } from '../utils/helpers';

const REGULAR_ROUNDS = ['1-й круг', '2-й круг', '3-й круг', '4-й круг', '5-й круг', '6-й круг'];
const PLAYOFF_ROUNDS = ['1/8 финала', '1/4 финала', '1/2 финала', 'Финал', 'Матч за 3-е место'];

export function CreateGameDrawer({ isOpen, onClose, seasonId, divisions = [], onSuccess }) {
  const [divisionName, setDivisionName] = useState('');
  const [dateTime, setDateTime] = useState(null);
  
  const [arenas, setArenas] = useState([]);
  const [arenaName, setArenaName] = useState('');

  const [stageType, setStageType] = useState('regular'); 
  
  const [regularRound, setRegularRound] = useState('1-й круг'); 
  const [regularTour, setRegularTour] = useState(1);   

  const [playoffRound, setPlayoffRound] = useState('Финал');
  const [playoffMatchNumber, setPlayoffMatchNumber] = useState(1);

  const [homeTeamName, setHomeTeamName] = useState('');
  const [awayTeamName, setAwayTeamName] = useState('');
  
  const [homeJersey, setHomeJersey] = useState('dark');
  const [awayJersey, setAwayJersey] = useState('light');

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetch(`${import.meta.env.VITE_API_URL}/api/arenas`, { headers: { 'Authorization': `Bearer ${getToken()}` } })
        .then(res => res.json())
        .then(data => { if (data.success) setArenas(data.data); })
        .catch(console.error);
    }
  }, [isOpen]);

  const activeDivision = divisions.find(d => d.name === divisionName);

  const handleDivisionChange = (val) => {
    setDivisionName(val);
    const div = divisions.find(d => d.name === val);
    if (div) {
      if (div.tournament_type === 'regular') setStageType('regular');
      else if (div.tournament_type === 'playoff') setStageType('playoff');
      
      setHomeTeamName('');
      setAwayTeamName('');
    }
  };

  const tournamentType = activeDivision?.tournament_type;
  const isStageLocked = tournamentType === 'regular' || tournamentType === 'playoff';

  const approvedTeams = activeDivision ? (activeDivision.teams || []).filter(t => t.status === 'approved') : [];
  const teamOptions = approvedTeams.map(t => t.name);

  const getJerseyPreview = (teamName, type) => {
    if (!teamName) return getImageUrl(`/default/jersey_${type}.webp`);
    const team = approvedTeams.find(t => t.name === teamName);
    if (!team) return getImageUrl(`/default/jersey_${type}.webp`);
    
    if (type === 'dark') return getImageUrl(team.custom_jersey_dark_url || team.jersey_dark_url || '/default/jersey_dark.webp');
    return getImageUrl(team.custom_jersey_light_url || team.jersey_light_url || '/default/jersey_light.webp');
  };

  const getTeamLogo = (teamName) => {
    if (!teamName) return getImageUrl('/default/Logo_team_default.webp');
    const team = approvedTeams.find(t => t.name === teamName);
    return getImageUrl(team?.logo_url || '/default/Logo_team_default.webp');
  };

  const isButtonDisabled = !divisionName || !homeTeamName || !awayTeamName || homeTeamName === awayTeamName || isSaving;

  const handleSave = async () => {
    if (isButtonDisabled) return;
    setIsSaving(true);

    const homeTeam = approvedTeams.find(t => t.name === homeTeamName);
    const awayTeam = approvedTeams.find(t => t.name === awayTeamName);
    const arena = arenas.find(a => a.name === arenaName);

    const payload = {
      division_id: activeDivision.id,
      game_date: dateTime,
      arena_id: arena ? arena.id : null,
      stage_type: stageType,
      stage_label: stageType === 'regular' ? regularRound : playoffRound,
      series_number: stageType === 'regular' ? regularTour : playoffMatchNumber,
      home_team_id: homeTeam.team_id,
      away_team_id: awayTeam.team_id,
      home_jersey_type: homeJersey,
      away_jersey_type: awayJersey
    };

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/seasons/${seasonId}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
        setDivisionName(''); setDateTime(null); setArenaName(''); 
        setHomeTeamName(''); setAwayTeamName('');
        setRegularRound('1-й круг'); setRegularTour(1);
        setPlayoffRound('Финал'); setPlayoffMatchNumber(1);
      } else {
        alert(data.error);
      }
    } catch (err) { alert('Ошибка сети'); }
    finally { setIsSaving(false); }
  };

  return (
    <div className={`fixed inset-0 z-[100000] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`absolute top-0 right-0 h-full w-full max-w-[750px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Шапка */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite uppercase tracking-wide">Создать матч</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto px-8 py-4 custom-scrollbar flex flex-col gap-4">
          
          <div className="flex gap-4 w-full">
            <div className="w-[36%]">
              <Select label="Дивизион *" options={divisions.map(d => d.name)} value={divisionName} onChange={handleDivisionChange} placeholder="Выберите дивизион" />
            </div>
            <div className="w-[38%]">
              <Select label="Место проведения" options={arenas.map(a => a.name)} value={arenaName} onChange={setArenaName} placeholder="Не выбрана" />
            </div>
            <div className="w-[26%]">
              <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide block">Дата и время</span>
              <DateTimePicker value={dateTime} onChange={setDateTime} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-graphite/10 shadow-sm flex flex-col gap-3">
            <div>
              <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide block">
                Тип матча {isStageLocked && '(Зафиксировано)'}
              </span>
              <div className={isStageLocked ? 'pointer-events-none opacity-60' : ''}>
                <SegmentButton 
                  options={['Регулярка', 'Плей-офф']} 
                  defaultIndex={stageType === 'regular' ? 0 : 1} 
                  onChange={(i) => setStageType(i === 0 ? 'regular' : 'playoff')} 
                />
              </div>
            </div>
            
            <div className="flex items-start gap-4 h-[65px]">
              {stageType === 'regular' ? (
                <>
                  <div className="w-[45%]">
                    <Select label="Круг" options={REGULAR_ROUNDS} value={regularRound} onChange={setRegularRound} />
                  </div>
                  <div className="w-[55%] flex flex-col items-center">
                    <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide block w-full text-center">Номер тура</span>
                    <Stepper initialValue={regularTour} min={1} max={50} onChange={setRegularTour} />
                  </div>
                </>
              ) : (
                <>
                  <div className="w-[45%]">
                    <Select label="Раунд" options={PLAYOFF_ROUNDS} value={playoffRound} onChange={setPlayoffRound} />
                  </div>
                  <div className="w-[55%] flex flex-col items-center">
                    <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide block w-full text-center">Матч в серии</span>
                    <Stepper initialValue={playoffMatchNumber} min={1} max={7} onChange={setPlayoffMatchNumber} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="w-full h-px bg-graphite/0 my-0"></div>

          {/* НИЖНИЙ БЛОК: КОМАНДЫ И ФОРМА */}
          <div className="flex flex-col md:flex-row items-stretch gap-6 relative">
            
            <div className="flex-1 flex flex-col gap-3 bg-white p-5 rounded-xl border border-graphite/10 shadow-sm relative z-10">
              <h3 className="text-[13px] font-black text-graphite text-center uppercase tracking-wider">Хозяева</h3>
              
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 shrink-0 flex items-center justify-center">
                  <img src={getTeamLogo(homeTeamName)} className="w-full h-full object-contain" alt="Home Logo" />
                </div>
                <div className="flex-1">
                  <Select options={teamOptions} value={homeTeamName} onChange={setHomeTeamName} placeholder="Выбрать команду" />
                </div>
              </div>
              
              <div className="flex flex-col items-center gap-2 bg-graphite/5 p-3 rounded-xl border border-graphite/10 mt-1">
                <div className="w-full">
                  <SegmentButton options={['Темная', 'Светлая']} defaultIndex={homeJersey === 'dark' ? 0 : 1} onChange={(i) => setHomeJersey(i === 0 ? 'dark' : 'light')} />
                </div>
                <div className="w-28 h-28 rounded-lg mt-2 mb-1 mix-blend-multiply">
                  <img src={getJerseyPreview(homeTeamName, homeJersey)} alt="Jersey" className="w-full h-full object-contain drop-shadow-md" />
                </div>
              </div>
            </div>

            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-12 h-12 bg-orange text-white rounded-full items-center justify-center font-black text-[16px] shadow-[0_4px_15px_rgba(255,107,0,0.3)] border-[5px] border-[#F8F9FA]">
              VS
            </div>

            <div className="flex-1 flex flex-col gap-3 bg-white p-5 rounded-xl border border-graphite/10 shadow-sm relative z-10">
              <h3 className="text-[13px] font-black text-graphite text-center uppercase tracking-wider">Гости</h3>
              
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Select options={teamOptions} value={awayTeamName} onChange={setAwayTeamName} placeholder="Выбрать команду" />
                </div>
                <div className="w-12 h-12 shrink-0 flex items-center justify-center">
                  <img src={getTeamLogo(awayTeamName)} className="w-full h-full object-contain" alt="Away Logo" />
                </div>
              </div>
              
              <div className="flex flex-col items-center gap-2 bg-graphite/5 p-3 rounded-xl border border-graphite/10 mt-1">
                <div className="w-full">
                  <SegmentButton options={['Темная', 'Светлая']} defaultIndex={awayJersey === 'dark' ? 0 : 1} onChange={(i) => setAwayJersey(i === 0 ? 'dark' : 'light')} />
                </div>
                <div className="w-28 h-28 rounded-lg mt-2 mb-1 mix-blend-multiply">
                  <img src={getJerseyPreview(awayTeamName, awayJersey)} alt="Jersey" className="w-full h-full object-contain drop-shadow-md" />
                </div>
              </div>
            </div>

          </div>

          {homeTeamName && homeTeamName === awayTeamName && (
            <div className="text-status-rejected px-4 text-center text-[13px] font-bold">
              Команда не может играть сама с собой! Выберите разных соперников.
            </div>
          )}

        </div>

        <div className="p-5 bg-white border-t border-graphite/10 shrink-0">
          <Button onClick={handleSave} isLoading={isSaving} disabled={isButtonDisabled} className="w-full">
            Создать матч в расписании
          </Button>
        </div>
      </div>
    </div>
  );
}