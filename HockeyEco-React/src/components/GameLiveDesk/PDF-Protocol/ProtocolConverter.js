// src/components/GameLiveDesk/PDF-Protocol/ProtocolConverter.js

export const prepareProtocolData = (payload) => {
  const apiData = payload?.data ? payload.data : payload;

  if (!apiData || !apiData.info || !apiData.teams) return null;

  const homeId = String(apiData.teams.home.id);
  const awayId = String(apiData.teams.away.id);

  // ОПРЕДЕЛЯЕМ ПЕРИОДЫ
  const periodsCount = apiData.timerSettings?.periods_count || 3;
  const periods = [];
  for(let i=1; i<=periodsCount; i++) periods.push(i.toString());
  
  // ВСЕГДА выводим колонки ОТ и ШБ, даже если они пустые
  periods.push('OT');
  periods.push('ШБ');

  // Инициализируем объект статистики
  const stats = {};
  periods.forEach(p => {
      stats[p] = { gHome: 0, gAway: 0, pHome: 0, pAway: 0, sHome: 0, sAway: 0 };
  });

  // Берем итоговый счет матча из БД (он всегда точный, так как обновляется контроллером)
  const finalHomeScore = parseInt(apiData.info.homeScore || 0, 10);
  const finalAwayScore = parseInt(apiData.info.awayScore || 0, 10);

  // --- ПРОВЕРКА СТАТУСА БУЛЛИТОВ ---
  const shootoutStatus = apiData.shootout_status || apiData.timerSettings?.shootout_status || apiData.info?.shootout_status;
  const endType = apiData.end_type || apiData.info?.end_type || apiData.info?.endType;
  
  let isSOFinished = (shootoutStatus === 'finished_win') || (endType === 'so');

  // Резервная проверка (железобетонная математика): 
  // Считаем голы только в игровое время. Если итоговый счет больше этой суммы — значит был победный буллит.
  let calcHomeGoals = 0;
  let calcAwayGoals = 0;
  apiData.events?.forEach(e => {
      if (e.event_type === 'goal' && e.period !== 'SO' && e.period !== 'ШБ') {
          if (String(e.team_id) === homeId) calcHomeGoals++;
          if (String(e.team_id) === awayId) calcAwayGoals++;
      }
  });

  if (finalHomeScore > calcHomeGoals || finalAwayScore > calcAwayGoals) {
      isSOFinished = true;
  }

  // Если серия буллитов завершена, начисляем 1 гол в колонку "ШБ" победителю.
  // Так как до ШБ счет был равным, победитель — тот, у кого итоговый счет больше.
  if (isSOFinished) {
     stats['ШБ'].gHome = finalHomeScore > finalAwayScore ? 1 : 0;
     stats['ШБ'].gAway = finalAwayScore > finalHomeScore ? 1 : 0;
  }

  let homeTotalShots = 0;
  let awayTotalShots = 0;

  // СЧИТАЕМ ГОЛЫ И ШТРАФЫ
  apiData.events?.forEach(e => {
    let p = e.period === 'SO' ? 'ШБ' : e.period;
    const eTeamId = String(e.team_id);
    
    // Считаем классические голы (исключаем буллиты, чтобы не задвоить)
    if (e.event_type === 'goal' && stats[p] && p !== 'ШБ') {
       if (eTeamId === homeId) stats[p].gHome++;
       if (eTeamId === awayId) stats[p].gAway++;
    }
    // Считаем штрафное время
    if (e.event_type === 'penalty' && stats[p]) {
       const pm = parseInt(e.penalty_minutes || 0, 10);
       if (eTeamId === homeId) stats[p].pHome += pm;
       if (eTeamId === awayId) stats[p].pAway += pm;
    }
  });

  // СЧИТАЕМ БРОСКИ
  apiData.shotsSummary?.forEach(s => {
     let p = s.period === 'SO' ? 'ШБ' : s.period;
     
     // Игнорируем броски из буллитов, если серия не завершена
     if (p === 'ШБ' && !isSOFinished) return;
     
     const count = parseInt(s.shots_count || 0, 10);
     const sTeamId = String(s.team_id);

     if (sTeamId === homeId) {
         if (stats[p]) stats[p].sHome += count;
         homeTotalShots += count;
     }
     if (sTeamId === awayId) {
         if (stats[p]) stats[p].sAway += count;
         awayTotalShots += count;
     }
  });

  // ФОРМИРУЕМ ИТОГО "Общ."
  stats['Общ.'] = {
     gHome: finalHomeScore, // Итоговый счет берем из БД
     gAway: finalAwayScore,
     pHome: periods.reduce((sum, p) => sum + (stats[p]?.pHome || 0), 0),
     pAway: periods.reduce((sum, p) => sum + (stats[p]?.pAway || 0), 0),
     sHome: homeTotalShots,
     sAway: awayTotalShots
  };

  const processTeam = (teamData, prefix) => {
    if (!teamData) return null;
    
    // Исключаем события буллитов для списков составов, если они не завершены
    const teamEvents = apiData.events?.filter(e => {
        if (String(e.team_id) !== String(teamData.id)) return false;
        const isShootoutEvent = e.period === 'SO' || e.event_type?.includes('shootout');
        if (isShootoutEvent && !isSOFinished) return false;
        return true;
    }) || [];
    
    const rawRoster = teamData.roster || [];

    const goalies = rawRoster.filter(p => p.translated_position === 'Вр');
    const fieldPlayers = rawRoster.filter(p => p.translated_position !== 'Вр').sort((a, b) => {
        if (a.translated_position === 'Защ' && b.translated_position === 'Нап') return -1;
        if (a.translated_position === 'Нап' && b.translated_position === 'Защ') return 1;
        return 0;
    });

    const getSig = (role) => {
      const sig = apiData.signatures ? apiData.signatures[role] : null;
      if (!sig) return "";
      return sig.hash ? `${sig.name} [${sig.hash}]` : sig.name;
    };

    return {
      id: teamData.id,
      name: teamData.name || '',
      goalies: goalies,
      fieldPlayers: fieldPlayers,
      goals: teamEvents.filter(e => e.event_type === 'goal'),
      penalties: teamEvents.filter(e => e.event_type === 'penalty'),
      timeout: teamEvents.find(e => e.event_type === 'timeout')?.time_seconds,
      coachSig: getSig(`${prefix}_coach`),
      off1Sig: getSig(`${prefix}_off1`),
      off2Sig: getSig(`${prefix}_off2`),
    };
  };

  const getSigOrPrefilled = (roleKey) => {
    const sig = apiData.signatures ? apiData.signatures[roleKey] : null;
    if (sig) return sig.hash ? `${sig.name} [${sig.hash}]` : sig.name;
    const prefilled = apiData.prefilledOfficials ? apiData.prefilledOfficials[roleKey] : null;
    return prefilled ? prefilled.name : "";
  };

  const homeGoaliesMap = {};
  const awayGoaliesMap = {};
  apiData.teams.home?.roster?.forEach(p => { homeGoaliesMap[p.player_id] = p.jersey_number; });
  apiData.teams.away?.roster?.forEach(p => { awayGoaliesMap[p.player_id] = p.jersey_number; });

  const goalieLog = (apiData.goalieLog || []).map(log => ({
      time_seconds: log.time_seconds,
      home_jersey: homeGoaliesMap[log.home_goalie_id] || '',
      away_jersey: awayGoaliesMap[log.away_goalie_id] || ''
  }));

  return {
    info: {
      season: apiData.info.season || '', division: apiData.info.division || '',
      date: apiData.info.date || '', gameNum: apiData.info.gameNum || '',
      arena: apiData.info.arena || '', start: apiData.info.start || '', 
      homeScore: apiData.info.homeScore || 0, awayScore: apiData.info.awayScore || 0,
      actualStart: apiData.info.actualStart || '', 
      actualEnd: apiData.info.actualEnd || '',
      spectators: apiData.info.spectators || ''     
    },
    home: processTeam(apiData.teams.home, 'home'),
    away: processTeam(apiData.teams.away, 'away'),
    officials: {
      hasHead2: !!(apiData.prefilledOfficials && apiData.prefilledOfficials['head_2']),
      head1: getSigOrPrefilled('head_1'),
      head2: getSigOrPrefilled('head_2'),
      scorekeeper: getSigOrPrefilled('scorekeeper'),
      linesman1: getSigOrPrefilled('linesman_1'),
      linesman2: getSigOrPrefilled('linesman_2'),
    },
    eligibleSigners: apiData.eligibleSigners || { home: { coaches: [], staff: [] }, away: { coaches: [], staff: [] } },
    prefilledOfficials: apiData.prefilledOfficials || {},
    signatures: apiData.signatures || {},
    stats,
    periods,
    goalieLog
  };
};