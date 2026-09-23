// LMS-Backend/src/controllers/ProtocolPDFController.js
import pool from '../config/db.js';
import bcrypt from 'bcrypt';
import puppeteer from 'puppeteer';
// Импортируем бэкенд-фабрику для выбора шаблона
import { getProtocolHtml } from '../src/protocols/protocol-factory.js';
import { fetchProtocolBack, CHECK_RESULTS } from './protocolBackController.js';
import { sortPenaltyRows } from '../utils/penaltyGroups.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

// Роль представителя в заявке на матч → строка подписи в протоколе. Ключи строк
// (coach / off1 / off2) исторические, к ним привязаны роли подписей home_off1 и т.п.
// в game_protocol_signatures; в шапке протокола они подписаны «Тр. команды»,
// «Рук. команды», «Админ. команды».
const TEAM_ROLE_SLOTS = { coach: 'coach', team_manager: 'off1', team_admin: 'off2' };

// ============================================================================
// ВНУТРЕННЯЯ ФУНКЦИЯ: Сбор всех данных из БД (используется для JSON, HTML и PDF)
// ============================================================================
const fetchRawProtocolData = async (gameId) => {
    const gameQuery = `
        SELECT 
        g.id, g.game_date, g.game_number,
        d.name as division_name, s.name as season_name,
        s.league_id,
        a.name as arena_name,
        a.timezone, 
            COALESCE(tt_home.snap_name, ht.name) as home_team_name, COALESCE(tt_away.snap_name, at.name) as away_team_name,
            g.division_id, g.home_team_id, g.away_team_id,
            g.home_score, g.away_score,
            g.actual_start_time, g.actual_end_time, g.spectators
        FROM games g
        LEFT JOIN divisions d ON g.division_id = d.id
        LEFT JOIN seasons s ON d.season_id = s.id
        LEFT JOIN arenas a ON g.arena_id = a.id
        LEFT JOIN teams ht ON g.home_team_id = ht.id
        LEFT JOIN teams at ON g.away_team_id = at.id
        -- Названия команд в протоколе — по слепку заявки на момент допуска
        LEFT JOIN tournament_teams tt_home ON tt_home.team_id = g.home_team_id AND tt_home.division_id = g.division_id
        LEFT JOIN tournament_teams tt_away ON tt_away.team_id = g.away_team_id AND tt_away.division_id = g.division_id
        WHERE g.id = $1
    `;
    const gameResult = await pool.query(gameQuery, [gameId]);
    if (gameResult.rows.length === 0) return null;
    const game = gameResult.rows[0];

    const rostersQuery = `
        SELECT gr.team_id, gr.player_id, gr.jersey_number, gr.is_captain, gr.is_assistant, gr.position_in_line, u.first_name, u.last_name
        FROM game_rosters gr
        JOIN users u ON gr.player_id = u.id
        WHERE gr.game_id = $1 AND gr.is_in_lineup = true
        ORDER BY gr.jersey_number ASC
    `;
    const rostersResult = await pool.query(rostersQuery, [gameId]);
    const homeRoster = [];
    const awayRoster = [];

    rostersResult.rows.forEach(player => {
        let translatedPosition = '';
        if (['LW', 'C', 'RW'].includes(player.position_in_line)) translatedPosition = 'Нап';
        else if (['LD', 'RD'].includes(player.position_in_line)) translatedPosition = 'Защ';
        else if (player.position_in_line === 'G') translatedPosition = 'Вр';
        const playerData = { ...player, translated_position: translatedPosition };
        if (player.team_id === game.home_team_id) homeRoster.push(playerData);
        else if (player.team_id === game.away_team_id) awayRoster.push(playerData);
    });

    const eventsQuery = `
        SELECT ge.id, ge.team_id, ge.period, ge.time_seconds, ge.event_type, ge.goal_strength, ge.penalty_minutes, ge.penalty_class, ge.penalty_violation, ge.penalty_violation_code, ge.penalty_end_time, ge.against_goalie_id,
            u_scorer.last_name as scorer_last_name, gr_scorer.jersey_number as scorer_number,
            u_a1.last_name as a1_last_name, gr_a1.jersey_number as a1_number,
            u_a2.last_name as a2_last_name, gr_a2.jersey_number as a2_number,
            -- Штраф на команду («К») / представителя («ОПК») и номер отбывающего за
            -- нарушителя — графа «№» блока «Удаление» печатает «ОПК/75», «12/44»
            ge.penalty_offender_type, gr_srv.jersey_number as served_by_number,
            ge.penalty_kind, ge.penalty_group_id, ge.penalty_group_seq
        FROM game_events ge
        -- COALESCE обязателен: у штрафа автора нет, нарушитель лежит в
        -- penalty_player_id, и без него в графе «№» блока «Удаление» печаталась
        -- пустая ячейка. Та же подстановка, что и в getGameEvents.
        LEFT JOIN users u_scorer ON COALESCE(ge.scorer_id, ge.penalty_player_id) = u_scorer.id
        LEFT JOIN game_rosters gr_scorer ON COALESCE(ge.scorer_id, ge.penalty_player_id) = gr_scorer.player_id AND gr_scorer.game_id = $1
        LEFT JOIN users u_a1 ON ge.assist1_id = u_a1.id
        LEFT JOIN game_rosters gr_a1 ON ge.assist1_id = gr_a1.player_id AND gr_a1.game_id = $1
        LEFT JOIN users u_a2 ON ge.assist2_id = u_a2.id
        LEFT JOIN game_rosters gr_a2 ON ge.assist2_id = gr_a2.player_id AND gr_a2.game_id = $1
        LEFT JOIN game_rosters gr_srv ON ge.penalty_served_by_id = gr_srv.player_id AND gr_srv.game_id = $1 AND gr_srv.team_id = ge.team_id
        WHERE ge.game_id = $1
        -- Строки одной группы штрафа (5 и 20 у 5+20) стоят на одной секунде — порядок по seq
        ORDER BY ge.time_seconds ASC, ge.penalty_group_seq ASC NULLS FIRST, ge.id ASC
    `;
    const eventsResult = await pool.query(eventsQuery, [gameId]);

    const sigsQuery = `
        SELECT s.role, s.signature_hash, s.manual_name, s.user_id, s.created_at, u.last_name, u.first_name, u.middle_name
        FROM game_protocol_signatures s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE s.game_id = $1
    `;
    const sigsResult = await pool.query(sigsQuery, [gameId]);
    const signatures = {};
    sigsResult.rows.forEach(sig => {
        let displayName = sig.manual_name;
        if (!displayName && sig.last_name) displayName = `${sig.last_name} ${sig.first_name ? sig.first_name[0] + '.' : ''}${sig.middle_name ? sig.middle_name[0] + '.' : ''}`;
        signatures[sig.role] = { hash: sig.signature_hash, name: displayName, date: sig.created_at, user_id: sig.user_id };
    });

    // Представители команд в строках подписей — из заявки на ЭТОТ матч (game_team_staff):
    // их выбрала команда при отправке заявки или секретарь в шторке состава. Подставляются
    // сразу, без выбора: тренер заявки — в «Тр. команды», руководитель — в «Рук. команды»,
    // администратор — в «Админ. команды». Роли нет в заявке — строка остаётся пустой.
    // Один человек может занять две строки, если заявлен в двух ролях.
    //
    // Если в одной роли заявлено несколько человек (два тренера), в строку встаёт первый
    // по алфавиту: в протоколе на роль одна строка.
    //
    // Допуск лиги проверен раньше, при выборе: в game_team_staff попадают только
    // допущенные. Дисквалификация могла прилететь уже после — такого не подставляем.
    const teamStaffQuery = `
        SELECT CASE WHEN gts.team_id = $2 THEN 'home' ELSE 'away' END as side,
               gts.role, gts.user_id as id, u.last_name, u.first_name, u.middle_name
        FROM game_team_staff gts
        JOIN users u ON u.id = gts.user_id
        WHERE gts.game_id = $1 AND gts.team_id IN ($2, $3)
          AND NOT EXISTS (SELECT 1 FROM disqualifications d WHERE d.user_id = gts.user_id AND d.league_id = $4 AND d.status = 'active')
        ORDER BY u.last_name, u.first_name
    `;
    const teamStaffResult = await pool.query(teamStaffQuery, [gameId, game.home_team_id, game.away_team_id, game.league_id]);

    const formatName = (r) => `${r.last_name} ${r.first_name ? r.first_name[0]+'.' : ''} ${r.middle_name ? r.middle_name[0]+'.' : ''}`.trim();

    const prefilledTeamStaff = { home: { coach: null, off1: null, off2: null }, away: { coach: null, off1: null, off2: null } };
    teamStaffResult.rows.forEach(r => {
        const slot = TEAM_ROLE_SLOTS[r.role];
        if (!slot || prefilledTeamStaff[r.side][slot]) return;
        prefilledTeamStaff[r.side][slot] = { id: r.id, name: formatName(r) };
    });

    const refsQuery = `
        SELECT gs.role, gs.user_id as id, u.last_name, u.first_name, u.middle_name
        FROM game_staff gs
        JOIN users u ON u.id = gs.user_id
        WHERE gs.game_id = $1
    `;
    const refsResult = await pool.query(refsQuery, [gameId]);
    const prefilledOfficials = {};
    refsResult.rows.forEach(r => {
        prefilledOfficials[r.role] = { id: r.id, name: formatName(r) };
    });

    const goalieLogResult = await pool.query('SELECT time_seconds, home_goalie_id, away_goalie_id FROM game_goalie_log WHERE game_id = $1 ORDER BY time_seconds ASC', [gameId]);
    // Командные броски в створ вычисляются на лету: для атакующей команды это
    // сумма бросков, нанесённых по вратарям соперника, плюс голы, забитые в пустые ворота.
    // "Пустые ворота" определяются через game_goalie_log (последняя запись лога ДО гола),
    // т.к. поле game_events.against_goalie_id заполняется только для буллитов.
    const shotsSummaryResult = await pool.query(`
        WITH attacker_shots AS (
            SELECT
                CASE WHEN gsb.team_id = g.home_team_id THEN g.away_team_id ELSE g.home_team_id END AS team_id,
                gsb.period,
                gsb.shots_count
            FROM game_shots_by_goalie gsb
            JOIN games g ON g.id = gsb.game_id
            WHERE gsb.game_id = $1
        ),
        goal_to_goalie AS (
            SELECT DISTINCT ON (ge.id)
                ge.id AS event_id,
                ge.team_id AS scoring_team_id,
                ge.period,
                CASE WHEN ge.team_id = g.home_team_id THEN gl.away_goalie_id ELSE gl.home_goalie_id END AS conceding_goalie_id
            FROM game_events ge
            JOIN games g ON g.id = ge.game_id
            JOIN game_goalie_log gl
              ON gl.game_id = ge.game_id
             AND gl.time_seconds <= ge.time_seconds
            WHERE ge.game_id = $1
              AND ge.event_type = 'goal'
            ORDER BY ge.id, gl.time_seconds DESC
        ),
        empty_net_goals AS (
            SELECT scoring_team_id AS team_id, period, 1 AS shots_count
            FROM goal_to_goalie
            WHERE conceding_goalie_id IS NULL
        )
        SELECT team_id, period, SUM(shots_count)::int AS shots_count
        FROM (
            SELECT * FROM attacker_shots
            UNION ALL
            SELECT * FROM empty_net_goals
        ) combined
        GROUP BY team_id, period
        ORDER BY team_id, period
    `, [gameId]);
    const timerResult = await pool.query('SELECT periods_count FROM game_timers WHERE game_id = $1', [gameId]);

    // Справочник причин удаления сезона — для блока «Индексация штрафов» на обороте протокола.
    // Пустой результат означает, что лига справочник не заполнила: вторая страница
    // в этом случае печатает встроенный список (PENALTY_INDEX_FALLBACK в шаблоне протокола).
    const penaltyTypesResult = await pool.query(`
        SELECT pt.number, pt.code, pt.title
        FROM penalty_types pt
        JOIN divisions d ON d.season_id = pt.season_id
        JOIN games g ON g.division_id = d.id
        WHERE g.id = $1
        ORDER BY pt.number ASC, pt.id ASC
    `, [gameId]);

    // Оборот протокола: проверка игроков и текстовые блоки, которые заполняет секретарь.
    const protocolBack = await fetchProtocolBack(gameId);

    let formattedDate = '';
    let formattedTime = '';
    
    if (game.game_date) {
        const arenaTz = game.timezone || 'UTC';
        // Интерпретируем дату из БД как UTC и переводим в часовой пояс арены
        const dateObj = dayjs.utc(game.game_date).tz(arenaTz);
        
        formattedDate = dateObj.format('DD.MM.YYYY');
        formattedTime = dateObj.format('HH:mm');
    }

    return {
        info: { 
            division: game.division_name || '', season: game.season_name || '', 
            date: formattedDate, start: formattedTime, arena: game.arena_name || '', 
            gameNum: game.game_number || '', homeScore: game.home_score || 0, 
            awayScore: game.away_score || 0, actualStart: game.actual_start_time || '', 
            actualEnd: game.actual_end_time || '', spectators: game.spectators,
            league_id: game.league_id
        },
        teams: {
            home: { id: game.home_team_id, name: game.home_team_name, roster: homeRoster },
            away: { id: game.away_team_id, name: game.away_team_name, roster: awayRoster }
        },
        events: eventsResult.rows,
        signatures, prefilledTeamStaff, prefilledOfficials,
        goalieLog: goalieLogResult.rows, shotsSummary: shotsSummaryResult.rows,
        timerSettings: timerResult.rows[0] || { periods_count: 3 },
        penaltyTypes: penaltyTypesResult.rows,
        protocolBack
    };
};

// ============================================================================
// ВНУТРЕННЯЯ ФУНКЦИЯ: Подготовка данных для рендера
// ============================================================================
const prepareProtocolData = (apiData) => {
    if (!apiData || !apiData.info || !apiData.teams) return null;
  
    const homeId = String(apiData.teams.home.id);
    const awayId = String(apiData.teams.away.id);
  
    const periodsCount = apiData.timerSettings?.periods_count || 3;
    const periods = [];
    for(let i=1; i<=periodsCount; i++) periods.push(i.toString());
    periods.push('OT');
    periods.push('ШБ');
  
    const stats = {};
    periods.forEach(p => { stats[p] = { gHome: 0, gAway: 0, pHome: 0, pAway: 0, sHome: 0, sAway: 0 }; });
  
    const finalHomeScore = parseInt(apiData.info.homeScore || 0, 10);
    const finalAwayScore = parseInt(apiData.info.awayScore || 0, 10);
  
    const shootoutStatus = apiData.shootout_status || apiData.timerSettings?.shootout_status || apiData.info?.shootout_status;
    const endType = apiData.end_type || apiData.info?.end_type || apiData.info?.endType;
    let isSOFinished = (shootoutStatus === 'finished_win') || (endType === 'so');
  
    let calcHomeGoals = 0, calcAwayGoals = 0;
    apiData.events?.forEach(e => {
        if (e.event_type === 'goal' && e.period !== 'SO' && e.period !== 'ШБ') {
            if (String(e.team_id) === homeId) calcHomeGoals++;
            if (String(e.team_id) === awayId) calcAwayGoals++;
        }
    });
  
    if (finalHomeScore > calcHomeGoals || finalAwayScore > calcAwayGoals) isSOFinished = true;
    if (isSOFinished) {
       stats['ШБ'].gHome = finalHomeScore > finalAwayScore ? 1 : 0;
       stats['ШБ'].gAway = finalAwayScore > finalHomeScore ? 1 : 0;
    }
  
    let homeTotalShots = 0, awayTotalShots = 0;
  
    apiData.events?.forEach(e => {
      let p = e.period === 'SO' ? 'ШБ' : e.period;
      const eTeamId = String(e.team_id);
      
      if (e.event_type === 'goal' && stats[p] && p !== 'ШБ') {
         if (eTeamId === homeId) stats[p].gHome++;
         if (eTeamId === awayId) stats[p].gAway++;
      }
      if (e.event_type === 'penalty' && stats[p]) {
         const pm = parseInt(e.penalty_minutes || 0, 10);
         if (eTeamId === homeId) stats[p].pHome += pm;
         if (eTeamId === awayId) stats[p].pAway += pm;
      }
    });
  
    apiData.shotsSummary?.forEach(s => {
       // Игнорируем псевдо-период 'Total' (рудимент старой логики) — иначе будет удвоение.
       if (!['1','2','3','4','5','OT','SO'].includes(s.period)) return;
       let p = s.period === 'SO' ? 'ШБ' : s.period;
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
  
    stats['Общ.'] = {
       gHome: finalHomeScore, gAway: finalAwayScore,
       pHome: periods.reduce((sum, p) => sum + (stats[p]?.pHome || 0), 0),
       pAway: periods.reduce((sum, p) => sum + (stats[p]?.pAway || 0), 0),
       sHome: homeTotalShots, sAway: awayTotalShots
    };
  
    const processTeam = (teamData, prefix) => {
      if (!teamData) return null;
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
  
      // Строки подписей представителей: подпись, а до неё — представитель из заявки
      // на матч (prefilledTeamStaff), как у судейской бригады. Нет ни того, ни другого —
      // строка пустая.
      const getSig = (slot) => {
        const sig = apiData.signatures ? apiData.signatures[`${prefix}_${slot}`] : null;
        if (sig) return sig.hash ? `${sig.name} [${sig.hash}]` : sig.name;
        const prefilled = apiData.prefilledTeamStaff?.[prefix]?.[slot];
        return prefilled ? prefilled.name : "";
      };

      return {
        id: teamData.id, name: teamData.name || '', goalies, fieldPlayers,
        // Во «Взятии ворот» печатаются и голы, и штрафные броски: реализованный ШБ
        // это обычный гол с ИС «ШБ», нереализованный — отдельная строка без автора
        // шайбы. Порядок общий, по времени, как в панели секретаря.
        // pending_ps здесь появиться не может: при завершении матча такие броски
        // переписываются в failed_ps, а незавершённый матч не печатают.
        goals: teamEvents
          .filter(e => e.event_type === 'goal' || e.event_type === 'failed_ps' || e.event_type === 'pending_ps')
          .sort((a, b) => a.time_seconds - b.time_seconds),
        // Строки одной группы (2+2, 2+10) — подряд, как в бумажном бланке
        penalties: sortPenaltyRows(teamEvents.filter(e => e.event_type === 'penalty')),
        timeout: teamEvents.find(e => e.event_type === 'timeout')?.time_seconds,
        coachSig: getSig('coach'), off1Sig: getSig('off1'), off2Sig: getSig('off2'),
      };
    };
  
    const getSigOrPrefilled = (roleKey) => {
      const sig = apiData.signatures ? apiData.signatures[roleKey] : null;
      if (sig) return sig.hash ? `${sig.name} [${sig.hash}]` : sig.name;
      const prefilled = apiData.prefilledOfficials ? apiData.prefilledOfficials[roleKey] : null;
      return prefilled ? prefilled.name : "";
    };
  
    const homeGoaliesMap = {}; const awayGoaliesMap = {};
    apiData.teams.home?.roster?.forEach(p => { homeGoaliesMap[p.player_id] = p.jersey_number; });
    apiData.teams.away?.roster?.forEach(p => { awayGoaliesMap[p.player_id] = p.jersey_number; });
  
    const goalieLog = (apiData.goalieLog || []).map(log => ({
        time_seconds: log.time_seconds,
        home_jersey: homeGoaliesMap[log.home_goalie_id] || '',
        away_jersey: awayGoaliesMap[log.away_goalie_id] || ''
    }));

    // Серия буллитов для блока «Броски определяющие победителя матча» на обороте протокола.
    // Строка таблицы — пара попыток: i-й бросок команды «А» и i-й бросок команды «Б»,
    // «Результат» — счёт серии после этой пары. Порядок попыток внутри команды — по id
    // события, как в панели секретаря (ShootoutAccordion.jsx).
    // against_goalie_id указывает на вратаря СОПЕРНИКА бросающего, поэтому номер вратаря
    // «А» берётся из попытки гостей, а вратаря «Б» — из попытки хозяев.
    // NULL здесь значит «вратарь не указан» (не пустые ворота) — печатаем пустую ячейку.
    const shootoutAttempts = isSOFinished
      ? (apiData.events || [])
          .filter(e => e.event_type === 'shootout_goal' || e.event_type === 'shootout_miss')
          .sort((a, b) => a.id - b.id)
      : [];
    const homeAttempts = shootoutAttempts.filter(e => String(e.team_id) === homeId);
    const awayAttempts = shootoutAttempts.filter(e => String(e.team_id) === awayId);
    // Команда, начавшая серию, помечается звёздочкой у номера первого бросающего.
    const firstSide = shootoutAttempts.length > 0
      ? (String(shootoutAttempts[0].team_id) === homeId ? 'home' : 'away')
      : null;

    let soHome = 0, soAway = 0;
    const shootout = Array.from({ length: Math.max(homeAttempts.length, awayAttempts.length) }, (_, i) => {
      const h = homeAttempts[i];
      const a = awayAttempts[i];
      if (h?.event_type === 'shootout_goal') soHome++;
      if (a?.event_type === 'shootout_goal') soAway++;
      const mark = (side) => (i === 0 && firstSide === side) ? '*' : '';
      return {
        a: h ? `${h.scorer_number ?? ''}${mark('home')}` : '',
        b: a ? `${a.scorer_number ?? ''}${mark('away')}` : '',
        goalieA: a ? (homeGoaliesMap[a.against_goalie_id] || '') : '',
        goalieB: h ? (awayGoaliesMap[h.against_goalie_id] || '') : '',
        scoreA: soHome,
        scoreB: soAway
      };
    });

    // Оборот протокола: то, что секретарь заполняет руками и что не выводится из событий.
    // Пустые значения отдаём пустыми строками — шаблон в этом случае печатает
    // линованные строки и пустые ячейки, как в бумажном бланке.
    const back = apiData.protocolBack || { notes: {}, checks: [] };
    const teamLabel = (teamId) => {
      if (String(teamId) === homeId) return `«А» ${apiData.teams.home?.name || ''}`.trim();
      if (String(teamId) === awayId) return `«Б» ${apiData.teams.away?.name || ''}`.trim();
      return '';
    };
    const flagLabel = (value) => (value === true ? 'Да' : value === false ? 'Нет' : '');

    const playerChecks = (back.checks || []).map(c => ({
      team: teamLabel(c.team_id),
      jersey: c.jersey_number ?? '',
      result: CHECK_RESULTS[c.check_result] || '',
      checkedRep: c.checked_rep_name || '',
      checkingRep: c.checking_rep_name || '',
    }));

    const notes = {
      referee: back.notes?.referee_notes || '',
      inspector: back.notes?.inspector_notes || '',
      medical: back.notes?.medical_notes || '',
      // Отметка «Да/Нет» — у каждой команды своя, текст уведомления — один на обеих
      protestHome: { filed: flagLabel(back.notes?.home_protest_filed) },
      protestAway: { filed: flagLabel(back.notes?.away_protest_filed) },
      protestText: back.notes?.protest_text || '',
    };

    return {
      info: apiData.info,
      home: processTeam(apiData.teams.home, 'home'),
      away: processTeam(apiData.teams.away, 'away'),
      
      officials: {
        hasMain2: !!(apiData.prefilledOfficials && apiData.prefilledOfficials['main-2']),
        'main-1': getSigOrPrefilled('main-1'),
        'main-2': getSigOrPrefilled('main-2'),
        'secretary': getSigOrPrefilled('secretary'),
        'linesman-1': getSigOrPrefilled('linesman-1'),
        'linesman-2': getSigOrPrefilled('linesman-2'),
        'timekeeper': getSigOrPrefilled('timekeeper'),
        'informant': getSigOrPrefilled('informant'),
      },
      prefilledTeamStaff: apiData.prefilledTeamStaff || { home: {}, away: {} },
      prefilledOfficials: apiData.prefilledOfficials || {},
      signatures: apiData.signatures || {},
      stats, periods, goalieLog,
      // Для оборота протокола (вторая страница шаблона в src/protocols/)
      penaltyTypes: apiData.penaltyTypes || [],
      shootout, playerChecks, notes
    };
};

// ============================================================================
// ЭКСПОРТИРУЕМЫЕ КОНТРОЛЛЕРЫ
// ============================================================================

export const getProtocolData = async (req, res) => {
    try {
        const rawData = await fetchRawProtocolData(req.params.gameId);
        if (!rawData) return res.status(404).json({ success: false, error: 'Матч не найден' });
        
        const protocolData = prepareProtocolData(rawData);
        res.json({ success: true, data: protocolData });
    } catch (error) {
        console.error('Ошибка генерации данных протокола:', error);
        res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
    }
};

/**
 * Возвращает только HTML содержимое протокола для предпросмотра
 */
export const getProtocolHtmlView = async (req, res) => {
    try {
        const { gameId } = req.params;
        const rawData = await fetchRawProtocolData(gameId);
        if (!rawData) return res.status(404).send('Матч не найден');
        
        const leagueId = rawData.info.league_id || 0;
        const protocolData = prepareProtocolData(rawData);
        
        const htmlContent = await getProtocolHtml(leagueId, protocolData);
        
        res.setHeader('Content-Type', 'text/html');
        res.send(htmlContent);
    } catch (error) {
        console.error('Ошибка получения HTML протокола:', error);
        res.status(500).send('Ошибка генерации протокола');
    }
};

export const downloadProtocolPDF = async (req, res) => {
    try {
        const { gameId } = req.params;
        
        const rawData = await fetchRawProtocolData(gameId);
        if (!rawData) return res.status(404).json({ success: false, error: 'Матч не найден' });
        
        const leagueId = rawData.info.league_id || 0;
        const protocolData = prepareProtocolData(rawData);
        
        const htmlContent = await getProtocolHtml(leagueId, protocolData);

        const puppeteerOptions = {
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ] 
        };

        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        } else if (process.platform === 'linux') {
            puppeteerOptions.executablePath = '/usr/bin/chromium';
        }

        const browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();
        
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' }
        });

        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="protocol_${gameId}.pdf"`);
        res.send(Buffer.from(pdfBuffer));

    } catch (error) {
        console.error('Ошибка генерации PDF через Puppeteer:', error);
        res.status(500).json({ success: false, error: 'Ошибка генерации PDF файла' });
    }
};

export const signProtocol = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { role, userId, pinCode } = req.body;

        if (!role || !userId) {
            return res.status(400).json({ success: false, error: 'Роль или пользователь не указаны' });
        }

        // Секретарь подписывает только завершённый матч: его подпись закрывает протокол для
        // правок всем, кроме владельца лиги и глобального админа (utils/gameEditWindow.js).
        // Подписав до «Завершить матч», секретарь сам не смог бы матч завершить.
        if (role === 'secretary') {
            const statusRes = await pool.query('SELECT status FROM games WHERE id = $1', [gameId]);
            if (statusRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });
            if (statusRes.rows[0].status !== 'finished') {
                return res.status(400).json({ success: false, error: 'Секретарь подписывает протокол после завершения матча: сначала нажмите «Завершить матч».' });
            }
        }

        // Подписи представителей команды — та же подстановка, что и в панели подписания
        // (prefilledTeamStaff), только теперь и на сервере: иначе можно было отправить
        // подпись за дисквалифицированного или вообще постороннего userId напрямую в API.
        // Человек должен быть заявлен на этот матч (game_team_staff) именно в той роли,
        // которой соответствует строка: тренер — «Тр. команды», руководитель —
        // «Рук. команды», администратор — «Админ. команды».
        const sideMatch = role.match(/^(home|away)_(coach|off1|off2)$/);
        if (sideMatch) {
            const [, side, slot] = sideMatch;
            const requiredRole = Object.keys(TEAM_ROLE_SLOTS).find(r => TEAM_ROLE_SLOTS[r] === slot);
            const gameRes = await pool.query(`
                SELECT g.home_team_id, g.away_team_id, s.league_id
                FROM games g
                JOIN divisions div ON g.division_id = div.id
                JOIN seasons s ON div.season_id = s.id
                WHERE g.id = $1
            `, [gameId]);
            if (gameRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });
            const { home_team_id, away_team_id, league_id } = gameRes.rows[0];
            const teamId = side === 'home' ? home_team_id : away_team_id;

            const eligibleRes = await pool.query(`
                SELECT 1
                FROM game_team_staff gts
                WHERE gts.game_id = $1 AND gts.user_id = $2 AND gts.team_id = $3 AND gts.role = $4
                  AND NOT EXISTS (SELECT 1 FROM disqualifications d WHERE d.user_id = gts.user_id AND d.league_id = $5 AND d.status = 'active')
                LIMIT 1
            `, [gameId, userId, teamId, requiredRole, league_id]);

            if (eligibleRes.rows.length === 0) {
                return res.status(403).json({ success: false, error: 'Этот пользователь не может подписать протокол за команду — не заявлен на этот матч в этой роли или дисквалифицирован' });
            }
        }

        // Подпись — только ЭЦП по PIN-коду, для представителей команд так же, как для
        // судейской бригады. Раньше тренера и официальных лиц можно было «вписать» без
        // PIN — теперь фамилия и так стоит в протоколе из заявки на матч, вписывать
        // нечего: осталась только подпись.
        if (!pinCode || String(pinCode).length !== 4) {
            return res.status(400).json({ success: false, error: 'Для подписи нужен четырёхзначный PIN-код' });
        }

        const userRes = await pool.query('SELECT sign_pin_hash, last_name, first_name, middle_name FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        const user = userRes.rows[0];

        if (!user.sign_pin_hash) return res.status(400).json({ success: false, error: 'У данного пользователя не задан PIN-код (ЭЦП)' });

        const isMatch = await bcrypt.compare(String(pinCode), user.sign_pin_hash);
        if (!isMatch) return res.status(403).json({ success: false, error: 'Неверный PIN-код' });

        const genSegment = () => Math.floor(1000 + Math.random() * 9000).toString();
        const signatureHash = `${genSegment()}-${genSegment()}`;
        const finalName = `${user.last_name} ${user.first_name ? user.first_name[0] + '.' : ''}${user.middle_name ? user.middle_name[0] + '.' : ''}`;

        await pool.query('DELETE FROM game_protocol_signatures WHERE game_id = $1 AND role = $2', [gameId, role]);
        
        await pool.query(`
            INSERT INTO game_protocol_signatures (game_id, user_id, role, signature_hash, manual_name)
            VALUES ($1, $2, $3, $4, $5)
        `, [gameId, userId, role, signatureHash, finalName]);

        res.json({ success: true, signatureHash, manualName: finalName });

    } catch (error) {
        console.error('Ошибка подписания протокола:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера при подписании' });
    }
};