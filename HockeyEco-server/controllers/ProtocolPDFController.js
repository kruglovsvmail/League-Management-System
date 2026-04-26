// HockeyEco-server/src/controllers/ProtocolPDFController.js
import pool from '../config/db.js';
import bcrypt from 'bcrypt';
import puppeteer from 'puppeteer';
// Импортируем бэкенд-фабрику для выбора шаблона
import { getProtocolHtml } from '../src/protocols/protocol-factory.js';

// ============================================================================
// ВНУТРЕННЯЯ ФУНКЦИЯ: Сбор всех данных из БД (используется для JSON и PDF)
// ============================================================================
const fetchRawProtocolData = async (gameId) => {
    const gameQuery = `
        SELECT 
            g.id, g.game_date, g.game_number,
            d.name as division_name, s.name as season_name,
            s.league_id,
            COALESCE(a.name, g.location_text) as arena_name,
            ht.name as home_team_name, at.name as away_team_name,
            g.division_id, g.home_team_id, g.away_team_id,
            g.home_score, g.away_score,
            g.actual_start_time, g.actual_end_time, g.spectators
        FROM games g
        LEFT JOIN divisions d ON g.division_id = d.id
        LEFT JOIN seasons s ON d.season_id = s.id
        LEFT JOIN arenas a ON g.arena_id = a.id
        LEFT JOIN teams ht ON g.home_team_id = ht.id
        LEFT JOIN teams at ON g.away_team_id = at.id
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
        SELECT ge.id, ge.team_id, ge.period, ge.time_seconds, ge.event_type, ge.goal_strength, ge.penalty_minutes, ge.penalty_violation, ge.penalty_end_time,
            u_scorer.last_name as scorer_last_name, gr_scorer.jersey_number as scorer_number,
            u_a1.last_name as a1_last_name, gr_a1.jersey_number as a1_number,
            u_a2.last_name as a2_last_name, gr_a2.jersey_number as a2_number
        FROM game_events ge
        LEFT JOIN users u_scorer ON ge.scorer_id = u_scorer.id
        LEFT JOIN game_rosters gr_scorer ON ge.scorer_id = gr_scorer.player_id AND gr_scorer.game_id = $1
        LEFT JOIN users u_a1 ON ge.assist1_id = u_a1.id
        LEFT JOIN game_rosters gr_a1 ON ge.assist1_id = gr_a1.player_id AND gr_a1.game_id = $1
        LEFT JOIN users u_a2 ON ge.assist2_id = u_a2.id
        LEFT JOIN game_rosters gr_a2 ON ge.assist2_id = gr_a2.player_id AND gr_a2.game_id = $1
        WHERE ge.game_id = $1 ORDER BY ge.time_seconds ASC
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

    const signersQuery = `
        SELECT 'home' as side, ttr.user_id as id, u.last_name, u.first_name, u.middle_name, ttr.tournament_role as role
        FROM tournament_team_roles ttr
        JOIN tournament_teams tt ON tt.id = ttr.tournament_team_id
        JOIN users u ON u.id = ttr.user_id
        WHERE tt.team_id = $2 AND tt.division_id = $1 AND ttr.left_at IS NULL
        UNION ALL
        SELECT 'away' as side, ttr.user_id as id, u.last_name, u.first_name, u.middle_name, ttr.tournament_role as role
        FROM tournament_team_roles ttr
        JOIN tournament_teams tt ON tt.id = ttr.tournament_team_id
        JOIN users u ON u.id = ttr.user_id
        WHERE tt.team_id = $3 AND tt.division_id = $1 AND ttr.left_at IS NULL
    `;
    const signersResult = await pool.query(signersQuery, [game.division_id, game.home_team_id, game.away_team_id]);
    
    const eligibleSigners = { home: { coaches: [], staff: [] }, away: { coaches: [], staff: [] } };
    const formatName = (r) => `${r.last_name} ${r.first_name ? r.first_name[0]+'.' : ''} ${r.middle_name ? r.middle_name[0]+'.' : ''}`.trim();
    
    signersResult.rows.forEach(r => {
        const name = formatName(r);
        const isCoach = r.role === 'coach' || r.role === 'head_coach';
        if (r.side === 'home') {
            eligibleSigners.home.staff.push({ id: r.id, name, role: r.role });
            if (isCoach) eligibleSigners.home.coaches.push({ id: r.id, name, role: r.role });
        }
        if (r.side === 'away') {
            eligibleSigners.away.staff.push({ id: r.id, name, role: r.role });
            if (isCoach) eligibleSigners.away.coaches.push({ id: r.id, name, role: r.role });
        }
    });

    const refsQuery = `
        SELECT gr.role, gr.user_id as id, u.last_name, u.first_name, u.middle_name
        FROM game_referee gr
        JOIN users u ON u.id = gr.user_id
        WHERE gr.game_id = $1
    `;
    const refsResult = await pool.query(refsQuery, [gameId]);
    const prefilledOfficials = {};
    refsResult.rows.forEach(r => {
        prefilledOfficials[r.role] = { id: r.id, name: formatName(r) };
    });

    const goalieLogResult = await pool.query('SELECT time_seconds, home_goalie_id, away_goalie_id FROM game_goalie_log WHERE game_id = $1 ORDER BY time_seconds ASC', [gameId]);
    const shotsSummaryResult = await pool.query('SELECT team_id, period, shots_count FROM game_shots_summary WHERE game_id = $1', [gameId]);
    const timerResult = await pool.query('SELECT periods_count FROM game_timers WHERE game_id = $1', [gameId]);

    let formattedDate = '';
    let formattedTime = '';
    if (game.game_date) {
        const d = new Date(game.game_date);
        formattedDate = d.toLocaleDateString('ru-RU');
        formattedTime = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
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
        signatures, eligibleSigners, prefilledOfficials,
        goalieLog: goalieLogResult.rows, shotsSummary: shotsSummaryResult.rows,
        timerSettings: timerResult.rows[0] || { periods_count: 3 }
    };
};

// ============================================================================
// ВНУТРЕННЯЯ ФУНКЦИЯ: Подготовка данных для рендера (перенос из ProtocolConverter.js)
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
  
      const getSig = (role) => {
        const sig = apiData.signatures ? apiData.signatures[role] : null;
        if (!sig) return "";
        return sig.hash ? `${sig.name} [${sig.hash}]` : sig.name;
      };
  
      return {
        id: teamData.id, name: teamData.name || '', goalies, fieldPlayers,
        goals: teamEvents.filter(e => e.event_type === 'goal'),
        penalties: teamEvents.filter(e => e.event_type === 'penalty'),
        timeout: teamEvents.find(e => e.event_type === 'timeout')?.time_seconds,
        coachSig: getSig(`${prefix}_coach`), off1Sig: getSig(`${prefix}_off1`), off2Sig: getSig(`${prefix}_off2`),
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
  
    return {
      info: apiData.info, home: processTeam(apiData.teams.home, 'home'), away: processTeam(apiData.teams.away, 'away'),
      officials: {
        hasHead2: !!(apiData.prefilledOfficials && apiData.prefilledOfficials['head_2']),
        head1: getSigOrPrefilled('head_1'), head2: getSigOrPrefilled('head_2'),
        scorekeeper: getSigOrPrefilled('scorekeeper'), linesman1: getSigOrPrefilled('linesman_1'), linesman2: getSigOrPrefilled('linesman_2'),
      },
      eligibleSigners: apiData.eligibleSigners || { home: { coaches: [], staff: [] }, away: { coaches: [], staff: [] } },
      prefilledOfficials: apiData.prefilledOfficials || {},
      signatures: apiData.signatures || {},
      stats, periods, goalieLog
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

export const downloadProtocolPDF = async (req, res) => {
    try {
        const { gameId } = req.params;
        
        // 1. Получаем и подготавливаем данные
        const rawData = await fetchRawProtocolData(gameId);
        if (!rawData) return res.status(404).json({ success: false, error: 'Матч не найден' });
        
        // Получаем leagueId (из division_id) для выбора шаблона в фабрике
        const leagueId = rawData.info.league_id || 0;
        const protocolData = prepareProtocolData(rawData);
        
        // 2. Генерируем HTML через асинхронную фабрику шаблонов
        const htmlContent = await getProtocolHtml(leagueId, protocolData);

        // 3. Формируем опции для Puppeteer
        const puppeteerOptions = {
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ] 
        };

        // Если явно задана переменная окружения, используем её
        if (process.env.PUPPETEER_EXECUTABLE_PATH) {
            puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
        } 
        // Иначе, если мы на сервере Linux (в Docker), используем путь по умолчанию для образа
        else if (process.platform === 'linux') {
            puppeteerOptions.executablePath = '/usr/bin/chromium';
        }
        // На локальной машине (Windows/Mac) свойство executablePath не задается, 
        // и Puppeteer будет использовать скачанный в node_modules браузер.

        // Запускаем Puppeteer
        const browser = await puppeteer.launch(puppeteerOptions);
        const page = await browser.newPage();
        
        // Загружаем HTML и ждем подгрузки веб-шрифтов (Open Sans)
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' }
        });

        await browser.close();

        // 4. Отправляем PDF клиенту в бинарном виде (Buffer)
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="protocol_${gameId}.pdf"`);
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

        const userRes = await pool.query('SELECT sign_pin_hash, last_name, first_name, middle_name FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        const user = userRes.rows[0];
        
        let signatureHash = null;
        const finalName = `${user.last_name} ${user.first_name ? user.first_name[0] + '.' : ''}${user.middle_name ? user.middle_name[0] + '.' : ''}`;

        if (role === 'home_coach' || role === 'away_coach') {
            signatureHash = null; 
        } else {
            if (pinCode && pinCode.length === 4) {
                if (!user.sign_pin_hash) return res.status(400).json({ success: false, error: 'У данного пользователя не задан PIN-код (ЭЦП)' });

                const isMatch = await bcrypt.compare(pinCode, user.sign_pin_hash);
                if (!isMatch) return res.status(403).json({ success: false, error: 'Неверный PIN-код' });

                const genSegment = () => Math.floor(1000 + Math.random() * 9000).toString();
                signatureHash = `${genSegment()}-${genSegment()}`;
            } else {
                if (role.includes('off1') || role.includes('off2')) {
                    signatureHash = null;
                } else {
                    return res.status(400).json({ success: false, error: 'Для судейской бригады обязателен PIN-код' });
                }
            }
        }

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