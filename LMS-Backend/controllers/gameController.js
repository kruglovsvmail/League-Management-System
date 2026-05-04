// LMS-Backend/controllers/gameController.js
import pool from '../config/db.js';
import { recalculateDivisionStandings } from '../utils/standingsCalculator.js';
import { recalculatePlayoffs } from '../utils/playoffCalculator.js';
import { recalculatePlayerStatistics } from '../utils/playerStatsCalculator.js';
import { recalculateTeamStatistics } from '../utils/teamStatsCalculator.js';

// ============================================================================
// ВНУТРЕННИЙ ПОМОЩНИК ДЛЯ ПРОВЕРКИ ПРАВ РЕДАКТИРОВАНИЯ (ЗАЩИТА ОТ СЕКРЕТАРЕЙ)
// ============================================================================
const checkGameEditAccess = async (clientOrPool, gameId, userId) => {
    if (!userId) return null;

    const userRes = await clientOrPool.query('SELECT global_role FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return null;
    // Глобальным админам можно всё
    if (userRes.rows[0].global_role === 'GLOBAL_ADMIN') return null;

    const gameRes = await clientOrPool.query(`
        SELECT g.game_date, s.league_id 
        FROM games g
        LEFT JOIN divisions d ON g.division_id = d.id
        LEFT JOIN seasons s ON d.season_id = s.id
        WHERE g.id = $1
    `, [gameId]);
    
    if (gameRes.rows.length === 0) return 'Матч не найден';
    const game = gameRes.rows[0];

    // Пропускаем топ-менеджмент и стафф лиги
    if (game.league_id) {
        const staffRes = await clientOrPool.query(`
            SELECT 1 FROM league_staff 
            WHERE user_id = $1 AND league_id = $2 AND end_date IS NULL
        `, [userId, game.league_id]);
        if (staffRes.rows.length > 0) return null; 
    }

    // ============================================================================
    // ОБНОВЛЕНО: Проверка прав линейного персонала (работа с game_staff)
    // ============================================================================
    // Ищем пользователя в единой таблице game_staff, проверяя, что он назначен на этот матч
    // Ограничиваем список ролей только теми, кто физически работает на матче и вносит данные (исключая broadcaster и commentator)
    const staffRes = await clientOrPool.query(`
        SELECT 1 FROM game_staff 
        WHERE game_id = $1 AND user_id = $2
        AND role IN ('main-1', 'main-2', 'linesman-1', 'linesman-2', 'secretary', 'timekeeper', 'informant')
    `, [gameId, userId]);

    // Если пользователь найден среди спортивного персонала матча
    if (staffRes.rows.length > 0) {
        // Правило 1: Дата и время должны быть назначены
        if (!game.game_date) return 'Доступ закрыт: дата и время матча не назначены.';
        
        // ВНИМАНИЕ: Правила окна в 18 часов и блокировки после подписания протокола удалены
    }
    
    return null; // Проверки пройдены
};

export const getPublicGameById = async (req, res) => {
    try {
        const query = `
            SELECT g.id, g.home_score, g.away_score, g.end_type, g.status, g.is_technical, g.needs_recalc,
                   g.game_date, g.stage_type, g.stage_label, g.series_number, g.game_number,
                   g.home_jersey_type, g.away_jersey_type,
                   g.division_id, g.home_team_id, g.away_team_id,
                   t1.name as home_team_name, 
                   t1.short_name as home_short_name,
                   t1.logo_url as home_team_logo,
                   COALESCE(htt.custom_jersey_dark_url, t1.jersey_dark_url) as home_jersey_dark,
                   COALESCE(htt.custom_jersey_light_url, t1.jersey_light_url) as home_jersey_light,
                   t2.name as away_team_name,
                   t2.short_name as away_short_name,
                   t2.logo_url as away_team_logo,
                   COALESCE(att.custom_jersey_dark_url, t2.jersey_dark_url) as away_jersey_dark,
                   COALESCE(att.custom_jersey_light_url, t2.jersey_light_url) as away_jersey_light,
                   l.id as league_id,
                   l.logo_url as league_logo,
                   l.name as league_name,
                   l.short_name as league_short_name,
                   d.logo_url as division_logo,
                   d.name as division_name,
                   d.short_name as division_short_name,
                   a.name as location_text,
                   a.name as arena_name,
                   a.city as arena_city,
                   a.address as arena_address,
                   a.timezone as arena_timezone, -- ДОБАВЛЕНО
                   gt.periods_count, gt.track_plus_minus, gt.shootout_status,
                   
                   (SELECT EXISTS(SELECT 1 FROM game_protocol_signatures WHERE game_id = g.id AND role = 'scorekeeper')) as is_protocol_signed,
                   
                   (
                       SELECT jsonb_object_agg(period, jsonb_build_object('home', home_goals, 'away', away_goals))
                       FROM (
                           SELECT period, 
                                  SUM(CASE WHEN team_id = g.home_team_id THEN 1 ELSE 0 END) as home_goals,
                                  SUM(CASE WHEN team_id = g.away_team_id THEN 1 ELSE 0 END) as away_goals
                           FROM game_events ge
                           WHERE ge.game_id = g.id AND ge.event_type IN ('goal', 'shootout_goal')
                           GROUP BY period
                       ) sub
                   ) as period_scores
            FROM games g
            LEFT JOIN game_timers gt ON g.id = gt.game_id
            LEFT JOIN teams t1 ON g.home_team_id = t1.id
            LEFT JOIN tournament_teams htt ON htt.team_id = t1.id AND htt.division_id = g.division_id
            LEFT JOIN teams t2 ON g.away_team_id = t2.id
            LEFT JOIN tournament_teams att ON att.team_id = t2.id AND att.division_id = g.division_id
            LEFT JOIN divisions d ON g.division_id = d.id
            LEFT JOIN seasons s ON d.season_id = s.id
            LEFT JOIN leagues l ON s.league_id = l.id
            LEFT JOIN arenas a ON g.arena_id = a.id
            WHERE g.id = $1
        `;
        const result = await pool.query(query, [req.params.gameId]);
        
        if (result.rows.length > 0) {
            const game = result.rows[0];

            const leaderQuery = `
                SELECT u.first_name, u.last_name, 
                       COALESCE(tm.photo_url, u.avatar_url) as avatar_url, 
                       gr.jersey_number,
                       ps.games_played, ps.goals, ps.assists, ps.points, ps.plus_minus, ps.penalty_minutes
                FROM game_rosters gr
                JOIN users u ON gr.player_id = u.id
                LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = gr.team_id
                JOIN tournament_teams tt ON tt.team_id = gr.team_id AND tt.division_id = $1
                JOIN tournament_rosters tr ON tr.tournament_team_id = tt.id AND tr.player_id = gr.player_id
                JOIN player_statistics ps ON tr.id = ps.tournament_roster_id
                WHERE gr.game_id = $3 AND gr.team_id = $2
                  AND gr.is_in_lineup = true
                  AND tr.application_status = 'approved'
                ORDER BY ps.points DESC, ps.goals DESC, ps.games_played ASC, ps.plus_minus DESC, ps.penalty_minutes ASC, u.last_name ASC, u.first_name ASC
                LIMIT 1
            `;

            let homeLeaderRes = { rows: [] };
            let awayLeaderRes = { rows: [] };

            if (game.home_team_id && game.away_team_id) {
                [homeLeaderRes, awayLeaderRes] = await Promise.all([
                    pool.query(leaderQuery, [game.division_id, game.home_team_id, game.id]),
                    pool.query(leaderQuery, [game.division_id, game.away_team_id, game.id])
                ]);
            }

            game.home_leader = homeLeaderRes.rows[0] || null;
            game.away_leader = awayLeaderRes.rows[0] || null;

            const rosterQuery = `
                SELECT gr.team_id, u.first_name, u.last_name, gr.jersey_number, 
                       gr.position_in_line, gr.line_number,
                       COALESCE(gr.is_captain, tr.is_captain, false) as is_captain,
                       COALESCE(gr.is_assistant, tr.is_assistant, false) as is_assistant,
                       COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
                       COALESCE(ps.games_played, 0) as games_played,
                       COALESCE(ps.goals, 0) as goals,
                       COALESCE(ps.assists, 0) as assists,
                       COALESCE(ps.points, 0) as points,
                       COALESCE(ps.plus_minus, 0) as plus_minus,
                       COALESCE(ps.penalty_minutes, 0) as penalty_minutes
                FROM game_rosters gr
                JOIN users u ON gr.player_id = u.id
                LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = gr.team_id
                LEFT JOIN tournament_teams tt ON tt.team_id = gr.team_id AND tt.division_id = $2
                LEFT JOIN tournament_rosters tr ON tr.tournament_team_id = tt.id AND tr.player_id = gr.player_id
                LEFT JOIN player_statistics ps ON tr.id = ps.tournament_roster_id
                WHERE gr.game_id = $1 AND gr.is_in_lineup = true
                ORDER BY gr.jersey_number ASC, u.last_name ASC
            `;
            const rosterRes = await pool.query(rosterQuery, [game.id, game.division_id]);
            
            game.home_roster = rosterRes.rows.filter(r => r.team_id === game.home_team_id);
            game.away_roster = rosterRes.rows.filter(r => r.team_id === game.away_team_id);

            const goalsQuery = `
                SELECT ge.id, ge.team_id, ge.period, ge.time_seconds, ge.goal_strength,
                       u_scorer.last_name as scorer_last_name, u_scorer.first_name as scorer_first_name,
                       u_a1.last_name as a1_last_name, u_a1.first_name as a1_first_name,
                       u_a2.last_name as a2_last_name, u_a2.first_name as a2_first_name,
                       gr.jersey_number as player_number
                FROM game_events ge
                LEFT JOIN users u_scorer ON ge.scorer_id = u_scorer.id
                LEFT JOIN users u_a1 ON ge.assist1_id = u_a1.id
                LEFT JOIN users u_a2 ON ge.assist2_id = u_a2.id
                LEFT JOIN game_rosters gr ON gr.player_id = u_scorer.id AND gr.game_id = $1 AND gr.team_id = ge.team_id
                WHERE ge.game_id = $1 AND ge.event_type = 'goal'
                ORDER BY ge.time_seconds ASC
            `;
            const goalsRes = await pool.query(goalsQuery, [game.id]);
            game.goals = goalsRes.rows;

            const penaltiesQuery = `
                SELECT ge.*, 
                       u_pen.last_name as player_last_name, u_pen.first_name as player_first_name,
                       gr.jersey_number as player_number
                FROM game_events ge
                LEFT JOIN users u_pen ON ge.penalty_player_id = u_pen.id
                LEFT JOIN game_rosters gr ON gr.player_id = u_pen.id AND gr.game_id = $1 AND gr.team_id = ge.team_id
                WHERE ge.game_id = $1 AND ge.event_type = 'penalty'
                ORDER BY ge.time_seconds ASC
            `;
            const penaltiesRes = await pool.query(penaltiesQuery, [game.id]);
            game.penalties = penaltiesRes.rows;

            const eventsQuery = `
                SELECT * FROM game_events 
                WHERE game_id = $1 
                ORDER BY id ASC
            `;
            const eventsRes = await pool.query(eventsQuery, [game.id]);
            game.events = eventsRes.rows;

            const goalieLogRes = await pool.query('SELECT * FROM game_goalie_log WHERE game_id = $1 ORDER BY time_seconds ASC', [game.id]);
            game.goalie_log = goalieLogRes.rows;

            const shotsSummaryRes = await pool.query('SELECT * FROM game_shots_summary WHERE game_id = $1', [game.id]);
            game.shots_summary = shotsSummaryRes.rows;

            // ============================================================================
            // ОБНОВЛЕНО: Извлечение бригады матча из game_staff
            // ============================================================================
            const staffRes = await pool.query(`
                SELECT gs.role, u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url
                FROM game_staff gs
                JOIN users u ON gs.user_id = u.id
                WHERE gs.game_id = $1
            `, [game.id]);

            const officials = { 
                'main-1': null, 'main-2': null, 
                'linesman-1': null, 'linesman-2': null, 
                'secretary': null, 'timekeeper': null, 'informant': null, 
                'broadcaster': null, 'commentator-1': null, 'commentator-2': null 
            };
            
            const formatName = (u) => ({ 
                id: u.id, 
                first_name: u.first_name,
                last_name: u.last_name,
                avatar_url: u.avatar_url
            });

            staffRes.rows.forEach(r => {
                if (officials[r.role] !== undefined) officials[r.role] = formatName(r);
            });

            game.officials = officials;

            res.json({ success: true, data: game });
        } else {
            res.status(404).json({ success: false, error: 'Матч не найден' });
        }
    } catch (err) {
        console.error('Ошибка публичного эндпоинта:', err.message);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const getGames = async (req, res) => {
    try {
        const { seasonId } = req.params;
        const { start, end, division, status } = req.query;

        let query = `
            SELECT 
                g.id, g.game_date, g.status, g.home_score, g.away_score, g.end_type, g.is_technical, g.needs_recalc,
                g.stage_type, g.stage_label, g.series_number, g.game_number,
                g.home_team_id, g.away_team_id, g.arena_id,
                a.name as location_text,
                a.timezone as arena_timezone, -- ДОБАВЛЕНО
                ht.name as home_team_name, ht.logo_url as home_team_logo,
                at.name as away_team_name, at.logo_url as away_team_logo,
                d.name as division_name,
                gt.periods_count, gt.track_plus_minus,
                (
                    EXISTS(SELECT 1 FROM game_events ge WHERE ge.game_id = g.id) OR 
                    EXISTS(SELECT 1 FROM game_rosters gr WHERE gr.game_id = g.id) OR
                    EXISTS(SELECT 1 FROM game_staff gs WHERE gs.game_id = g.id)
                ) as has_protocol,
                (
                    SELECT jsonb_object_agg(period, jsonb_build_object('home', home_goals, 'away', away_goals))
                    FROM (
                        SELECT period, 
                               SUM(CASE WHEN team_id = g.home_team_id THEN 1 ELSE 0 END) as home_goals,
                               SUM(CASE WHEN team_id = g.away_team_id THEN 1 ELSE 0 END) as away_goals
                        FROM game_events ge
                        WHERE ge.game_id = g.id AND ge.event_type IN ('goal', 'shootout_goal')
                        GROUP BY period
                    ) sub
                ) as period_scores
            FROM games g
            LEFT JOIN game_timers gt ON g.id = gt.game_id
            LEFT JOIN teams ht ON g.home_team_id = ht.id
            LEFT JOIN teams at ON g.away_team_id = at.id
            JOIN divisions d ON g.division_id = d.id
            LEFT JOIN arenas a ON g.arena_id = a.id
            WHERE d.season_id = $1
        `;
        const params = [seasonId];
        let paramIndex = 2;

        if (start && end) {
            query += ` AND g.game_date >= $${paramIndex} AND g.game_date <= $${paramIndex + 1}`;
            params.push(start, end);
            paramIndex += 2;
        }

        if (division && division !== 'Все дивизионы' && division !== '') {
            query += ` AND d.name = $${paramIndex}`;
            params.push(division);
            paramIndex++;
        }

        if (status === '1') query += ` AND g.status IN ('scheduled', 'live')`;
        else if (status === '2') query += ` AND g.status = 'finished'`;
        else if (status) query += ` AND g.status IN ('scheduled', 'live', 'finished', 'cancelled')`;

        query += ` ORDER BY g.game_number ASC NULLS LAST, g.game_date ASC NULLS LAST, g.id ASC`;

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка загрузки матчей:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке матчей' });
    }
};

export const getGameById = async (req, res) => {
    try {
        const { gameId } = req.params;
        const query = `
            SELECT 
                g.*,
                gt.period_length, gt.ot_length, gt.so_length, gt.periods_count, gt.track_plus_minus, gt.shootout_status,
                a.name as location_text,
                a.timezone as arena_timezone, -- ДОБАВЛЕНО
                ht.name as home_team_name, ht.logo_url as home_team_logo, 
                COALESCE(htt.custom_jersey_dark_url, ht.jersey_dark_url) as home_jersey_dark,
                COALESCE(htt.custom_jersey_light_url, ht.jersey_light_url) as home_jersey_light,
                at.name as away_team_name, at.logo_url as away_team_logo,
                COALESCE(att.custom_jersey_dark_url, at.jersey_dark_url) as away_jersey_dark,
                COALESCE(att.custom_jersey_light_url, at.jersey_light_url) as away_jersey_light,
                d.name as division_name,
                
                s.league_id, 
                
                (SELECT EXISTS(SELECT 1 FROM game_protocol_signatures WHERE game_id = g.id AND role = 'scorekeeper')) as is_protocol_signed,
                
                (
                    EXISTS(SELECT 1 FROM game_events ge WHERE ge.game_id = g.id) OR 
                    EXISTS(SELECT 1 FROM game_rosters gr WHERE gr.game_id = g.id) OR
                    EXISTS(SELECT 1 FROM game_staff gs WHERE gs.game_id = g.id)
                ) as has_protocol,
                (
                    SELECT jsonb_object_agg(period, jsonb_build_object('home', home_goals, 'away', away_goals))
                    FROM (
                        SELECT period, 
                               SUM(CASE WHEN team_id = g.home_team_id THEN 1 ELSE 0 END) as home_goals,
                               SUM(CASE WHEN team_id = g.away_team_id THEN 1 ELSE 0 END) as away_goals
                        FROM game_events ge
                        WHERE ge.game_id = g.id AND ge.event_type IN ('goal', 'shootout_goal')
                        GROUP BY period
                    ) sub
                ) as period_scores
            FROM games g
            LEFT JOIN game_timers gt ON g.id = gt.game_id
            LEFT JOIN teams ht ON g.home_team_id = ht.id
            LEFT JOIN tournament_teams htt ON htt.team_id = ht.id AND htt.division_id = g.division_id
            LEFT JOIN teams at ON g.away_team_id = at.id
            LEFT JOIN tournament_teams att ON att.team_id = at.id AND att.division_id = g.division_id
            JOIN divisions d ON g.division_id = d.id
            
            LEFT JOIN seasons s ON d.season_id = s.id
            
            LEFT JOIN arenas a ON g.arena_id = a.id
            WHERE g.id = $1
        `;
        const result = await pool.query(query, [gameId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }

        const game = result.rows[0];

        const goalieLogRes = await pool.query('SELECT * FROM game_goalie_log WHERE game_id = $1 ORDER BY time_seconds ASC', [gameId]);
        game.goalie_log = goalieLogRes.rows;

        const shotsSummaryRes = await pool.query('SELECT * FROM game_shots_summary WHERE game_id = $1', [gameId]);
        game.shots_summary = shotsSummaryRes.rows;

        const staffRes = await pool.query(`
            SELECT gs.role, u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url
            FROM game_staff gs
            JOIN users u ON gs.user_id = u.id
            WHERE gs.game_id = $1
        `, [gameId]);

        const officials = { 
            'main-1': '', 'main-2': '', 
            'linesman-1': '', 'linesman-2': '', 
            'secretary': '', 'timekeeper': '', 'informant': '', 
            'broadcaster': '', 'commentator-1': '', 'commentator-2': '' 
        };
        
        const formatName = (u) => ({ 
            id: u.id, 
            name: `${u.last_name} ${u.first_name} ${u.middle_name || ''}`.trim(),
            avatar_url: u.avatar_url
        });

        staffRes.rows.forEach(r => {
            if (officials[r.role] !== undefined) officials[r.role] = formatName(r);
        });

        game.officials = officials;

        res.json({ success: true, data: game });
    } catch (err) {
        console.error('Ошибка загрузки матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const getArenas = async (req, res) => {
    try {
        const { leagueId } = req.query;
        // ДОБАВЛЕНО timezone в базовый запрос
        let query = `SELECT id, name, city, timezone FROM arenas WHERE status = 'active'`;
        const params = [];

        if (leagueId) {
            query = `
                -- ДОБАВЛЕНО a.timezone в запрос с фильтром по лиге
                SELECT a.id, a.name, a.city, a.timezone 
                FROM arenas a
                JOIN league_arenas la ON a.id = la.arena_id
                WHERE a.status = 'active' AND la.league_id = $1
                ORDER BY a.name
            `;
            params.push(leagueId);
        } else {
            query += ` ORDER BY name`;
        }

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка загрузки арен:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки арен' });
    }
};

export const createGame = async (req, res) => {
    try {
        const { division_id, stage_type } = req.body;

        if (!division_id) {
            return res.status(400).json({ success: false, error: 'Не указан дивизион' });
        }

        const numRes = await pool.query(`SELECT COALESCE(MAX(game_number), 0) + 1 as next_num FROM games WHERE division_id = $1`, [division_id]);
        const num = numRes.rows[0].next_num;

        const st = stage_type || 'regular';
        const isPO = st === 'playoff';

        let pCount = 3, pLen = 20, oLen = 5, sLen = 3, trackPM = false;
        
        const divSettingsRes = await pool.query(`SELECT * FROM divisions WHERE id = $1`, [division_id]);

        if (divSettingsRes.rows.length > 0) {
            const ds = divSettingsRes.rows[0];
            
            pCount = isPO ? (ds.playoff_periods_count ?? 3) : (ds.reg_periods_count ?? 3);
            pLen = isPO ? (ds.playoff_period_length ?? 20) : (ds.reg_period_length ?? 20);
            
            const hasOt = isPO ? ds.playoff_has_overtime : ds.reg_has_overtime;
            oLen = hasOt ? (isPO ? (ds.playoff_ot_length ?? 5) : (ds.reg_ot_length ?? 5)) : 0;
            
            const hasSo = isPO ? ds.playoff_has_shootouts : ds.reg_has_shootouts;
            sLen = hasSo ? (isPO ? (ds.playoff_so_length ?? 3) : (ds.reg_so_length ?? 3)) : 0;
            
            trackPM = isPO ? (ds.playoff_track_plus_minus ?? false) : (ds.reg_track_plus_minus ?? false);
        }

        const insertRes = await pool.query(`
            INSERT INTO games (
                game_type, division_id, game_number, status, stage_type,
                home_jersey_type, away_jersey_type
            ) VALUES (
                'official', $1, $2, 'scheduled', $3, 'dark', 'light'
            ) RETURNING id
        `, [division_id, num, st]);

        const newGameId = insertRes.rows[0].id;

        await pool.query(`
            INSERT INTO game_timers (
                game_id, periods_count, period_length, ot_length, so_length, track_plus_minus, time_seconds, shootout_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        `, [newGameId, pCount, pLen, oLen, sLen, trackPM, 0]); 

        const fullGameRes = await pool.query(`
            SELECT 
                g.id, g.game_date, g.status, g.home_score, g.away_score, g.end_type,
                g.stage_type, g.stage_label, g.series_number, g.game_number,
                g.home_team_id, g.away_team_id, g.arena_id,
                a.name as location_text,
                ht.name as home_team_name, ht.logo_url as home_team_logo,
                at.name as away_team_name, at.logo_url as away_team_logo,
                d.name as division_name,
                false as has_protocol
            FROM games g
            LEFT JOIN teams ht ON g.home_team_id = ht.id
            LEFT JOIN teams at ON g.away_team_id = at.id
            JOIN divisions d ON g.division_id = d.id
            LEFT JOIN arenas a ON g.arena_id = a.id
            WHERE g.id = $1
        `, [newGameId]);

        res.json({ success: true, data: fullGameRes.rows[0] });
    } catch (err) {
        console.error('Ошибка создания матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера при создании матча' });
    }
};

export const updateGameInfo = async (req, res) => {
    try {
        const { gameId } = req.params;
        const updates = req.body;
        
        const gameRes = await pool.query('SELECT id, status, division_id, home_team_id, away_team_id, stage_type, stage_label FROM games WHERE id = $1', [gameId]);
        if(gameRes.rows.length === 0) return res.status(404).json({success: false, error: 'Матч не найден'});
        
        const game = gameRes.rows[0];
        const divisionId = game.division_id;

        if (updates.game_number !== undefined && updates.game_number !== null) {
            const numCheck = await pool.query(`
                SELECT id FROM games 
                WHERE division_id = $1 
                  AND game_number = $2 
                  AND id != $3
            `, [divisionId, updates.game_number, gameId]);
            
            if (numCheck.rows.length > 0) {
                return res.status(400).json({ success: false, error: `Матч с общим номером ${updates.game_number} уже существует в этом дивизионе.` });
            }
        }

        if (updates.home_team_id !== undefined || updates.away_team_id !== undefined) {
            const protocolCheck = await pool.query(`
                SELECT 
                    EXISTS(SELECT 1 FROM game_events WHERE game_id = $1) OR 
                    EXISTS(SELECT 1 FROM game_rosters WHERE game_id = $1) OR
                    EXISTS(SELECT 1 FROM game_staff WHERE game_id = $1)
                as has_protocol
            `, [gameId]);
            
            if (protocolCheck.rows[0].has_protocol) {
                 return res.status(400).json({ success: false, error: 'Запрещено: очистите составы, события и судей перед сменой команд.' });
            }
        }

        const newHome = updates.home_team_id !== undefined ? updates.home_team_id : game.home_team_id;
        const newAway = updates.away_team_id !== undefined ? updates.away_team_id : game.away_team_id;
        const newStage = updates.stage_type !== undefined ? updates.stage_type : game.stage_type;
        const newStageLabel = updates.stage_label !== undefined ? updates.stage_label : game.stage_label;

        const isChangingSeriesFields = updates.home_team_id !== undefined || 
                                       updates.away_team_id !== undefined || 
                                       updates.stage_type !== undefined || 
                                       updates.stage_label !== undefined;

        if (isChangingSeriesFields && newStage === 'playoff' && newStageLabel && newHome && newAway) {
            const matchupRes = await pool.query(`
                SELECT r.wins_needed 
                FROM playoff_matchups m
                JOIN playoff_rounds r ON m.round_id = r.id
                JOIN playoff_brackets b ON r.bracket_id = b.id
                WHERE b.division_id = $1 
                  AND r.name = $4
                  AND ((m.team1_id = $2 AND m.team2_id = $3) OR (m.team1_id = $3 AND m.team2_id = $2))
                LIMIT 1
            `, [divisionId, newHome, newAway, newStageLabel]);

            if (matchupRes.rows.length > 0) {
                const winsNeeded = matchupRes.rows[0].wins_needed;
                const maxGames = (winsNeeded * 2) - 1; 

                const countRes = await pool.query(`
                    SELECT COUNT(*) as cnt 
                    FROM games 
                    WHERE division_id = $1 
                      AND stage_type = 'playoff'
                      AND stage_label = $4
                      AND status != 'cancelled'
                      AND id != $5
                      AND ((home_team_id = $2 AND away_team_id = $3) OR (home_team_id = $3 AND away_team_id = $2))
                `, [divisionId, newHome, newAway, newStageLabel, gameId]);

                const currentCount = parseInt(countRes.rows[0].cnt, 10);

                if (currentCount >= maxGames && updates.status !== 'cancelled') {
                    return res.status(400).json({ 
                        success: false, 
                        error: `Превышен лимит матчей. Раунд "${newStageLabel}" играется до ${winsNeeded} побед, максимальное количество матчей: ${maxGames}.` 
                    });
                }
            }
        }

        const fields = [];
        const values = [];
        let idx = 1;

        const allowedFields = [
            'game_date', 'arena_id', 'stage_type', 'stage_label', 'series_number', 
            'video_yt_url', 'video_vk_url', 'home_jersey_type', 'away_jersey_type',
            'home_team_id', 'away_team_id', 'game_number', 'status',
            'actual_start_time', 'actual_end_time', 'spectators'
        ];

        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                fields.push(`${key} = $${idx++}`);
                values.push(updates[key] === '' ? null : updates[key]);
            }
        }

        if (fields.length === 0) {
            return res.json({success: true, message: 'Нет полей для обновления'});
        }

        values.push(gameId);
        await pool.query(`UPDATE games SET ${fields.join(', ')} WHERE id = $${idx}`, values);

        if (updates.stage_type !== undefined && updates.stage_type !== game.stage_type && game.status === 'scheduled') {
            const divSettingsRes = await pool.query('SELECT * FROM divisions WHERE id = $1', [divisionId]);
            if (divSettingsRes.rows.length > 0) {
                const ds = divSettingsRes.rows[0];
                const isPO = updates.stage_type === 'playoff';
                
                const pCount = isPO ? (ds.playoff_periods_count ?? 3) : (ds.reg_periods_count ?? 3);
                const pLen = isPO ? (ds.playoff_period_length ?? 20) : (ds.reg_period_length ?? 20);
                
                const hasOt = isPO ? ds.playoff_has_overtime : ds.reg_has_overtime;
                const oLen = hasOt ? (isPO ? (ds.playoff_ot_length ?? 5) : (ds.reg_ot_length ?? 5)) : 0;
                
                const hasSo = isPO ? ds.playoff_has_shootouts : ds.reg_has_shootouts;
                const sLen = hasSo ? (isPO ? (ds.playoff_so_length ?? 3) : (ds.reg_so_length ?? 3)) : 0;
                
                const trackPM = isPO ? (ds.playoff_track_plus_minus ?? false) : (ds.reg_track_plus_minus ?? false);

                await pool.query(`
                    UPDATE game_timers 
                    SET periods_count = $1, period_length = $2, ot_length = $3, so_length = $4, track_plus_minus = $5
                    WHERE game_id = $6
                `, [pCount, pLen, oLen, sLen, trackPM, gameId]);
            }
        }
        
        res.json({success: true});
    } catch (err) {
        console.error('Ошибка обновления инфо матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const updateGameStatus = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;

        const accessError = await checkGameEditAccess(client, gameId, req.user?.id);
        if (accessError) {
            client.release();
            return res.status(403).json({ success: false, error: accessError });
        }

        const { status, end_type: incomingEndType, tech_result } = req.body;

        await client.query('BEGIN');

        const gameRes = await client.query('SELECT division_id, status, stage_type, home_team_id, away_team_id, is_technical, end_type, home_score, away_score FROM games WHERE id = $1', [gameId]);
        if (gameRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }
        const game = gameRes.rows[0];

        let finalHomeScore = game.home_score;
        let finalAwayScore = game.away_score;
        let endType = game.end_type;
        
        let isTechnical = null;

        if (incomingEndType === 'tech') {
            endType = 'tech';
            
            if (tech_result === 'home_win') {
                isTechnical = '+/-';
            } else if (tech_result === 'away_win') {
                isTechnical = '-/+';
            } else if (tech_result === 'both_lose') {
                isTechnical = '-/-';
            }
            
        } else {
            isTechnical = null; 
            
            if (endType !== 'so') {
                const goalsRes = await client.query(`SELECT period FROM game_events WHERE game_id = $1 AND event_type = 'goal'`, [gameId]);
                const hasOTGoal = goalsRes.rows.some(e => e.period === 'OT');
                endType = hasOTGoal ? 'ot' : 'regular';
            }

            if (status === 'scheduled') {
                endType = null;
            }
        }

        await client.query(`
            UPDATE games 
            SET status = $1, end_type = $2, home_score = $3, away_score = $4, is_technical = $5, needs_recalc = false
            WHERE id = $6
        `, [status, endType, finalHomeScore, finalAwayScore, isTechnical, gameId]);

        await client.query('COMMIT');

        if ((status === 'finished' || game.status === 'finished' || isTechnical) && game.division_id) {
            try {
                if (game.stage_type === 'playoff') await recalculatePlayoffs(game.division_id);
                else await recalculateDivisionStandings(game.division_id);

                await recalculatePlayerStatistics(game.division_id);

                const teamsToUpdate = [game.home_team_id, game.away_team_id].filter(Boolean);
                if (teamsToUpdate.length > 0) {
                    await recalculateTeamStatistics(teamsToUpdate);
                }
                
                await client.query('UPDATE games SET needs_recalc = false WHERE division_id = $1', [game.division_id]);

            } catch (calcErr) {
                console.error(`Ошибка при автоматическом пересчете для дивизиона ${game.division_id}:`, calcErr);
            }
        }

        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка смены статуса:', err);
        res.status(500).json({ success: false, error: 'Ошибка смены статуса' });
    } finally {
        client.release();
    }
};

export const getGameRoster = async (req, res) => {
    try {
        const { gameId, teamId } = req.params;

        if (!gameId || gameId === 'null' || !teamId || teamId === 'null') {
            return res.json({
                success: true,
                tournamentRoster: [],
                gameRoster: [],
                staffRoster: []
            });
        }

        const [tRosterRes, gRosterRes, staffRes] = await Promise.all([
            pool.query(`
                SELECT tr.player_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tr.jersey_number, tr.position, tm.photo_url
                FROM tournament_rosters tr
                JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
                JOIN games g ON g.division_id = tt.division_id
                JOIN users u ON tr.player_id = u.id
                LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2
                WHERE g.id = $1 
                  AND tt.team_id = $2 
                  AND tr.application_status = 'approved' 
                  AND tr.period_end IS NULL
                ORDER BY u.last_name
            `, [gameId, teamId]),

            pool.query(`
                SELECT gr.player_id, gr.jersey_number, gr.position_in_line, gr.is_captain, gr.is_assistant,
                       u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url
                FROM game_rosters gr
                JOIN users u ON gr.player_id = u.id
                LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = gr.team_id
                WHERE gr.game_id = $1 AND gr.team_id = $2
                ORDER BY u.last_name
            `, [gameId, teamId]),

            pool.query(`
                SELECT ttr.user_id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url, 
                       string_agg(ttr.tournament_role, ', ') as roles
                FROM tournament_team_roles ttr
                JOIN users u ON ttr.user_id = u.id
                JOIN tournament_teams tt ON tt.id = ttr.tournament_team_id
                JOIN games g ON g.division_id = tt.division_id 
                   AND (g.home_team_id = tt.team_id OR g.away_team_id = tt.team_id)
                LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = $2 AND tm.left_at IS NULL
                WHERE g.id = $1 
                  AND tt.team_id = $2 
                  AND ttr.left_at IS NULL
                GROUP BY ttr.user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url
            `, [gameId, teamId])
        ]);

        res.json({
            success: true,
            tournamentRoster: tRosterRes.rows,
            gameRoster: gRosterRes.rows,
            staffRoster: staffRes.rows
        });
    } catch (err) {
        console.error('Ошибка загрузки ростера:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const saveGameRoster = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId, teamId } = req.params;

        const accessError = await checkGameEditAccess(client, gameId, req.user?.id);
        if (accessError) {
            client.release();
            return res.status(403).json({ success: false, error: accessError });
        }

        const { roster } = req.body;

        await client.query('BEGIN');
        
        await client.query('DELETE FROM game_rosters WHERE game_id = $1 AND team_id = $2', [gameId, teamId]);

        if (roster && roster.length > 0) {
            const values = [];
            const params = [];
            let paramIndex = 1;

            roster.forEach(player => {
                let posInLine = 'C'; 
                if (player.position === 'goalie') posInLine = 'G';
                else if (player.position === 'defense') posInLine = 'LD';
                else if (player.position === 'forward') posInLine = 'C';

                values.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, true, 1, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
                params.push(
                    gameId, teamId, player.player_id, posInLine,
                    player.jersey_number || null, player.is_captain || false, player.is_assistant || false
                );
            });

            await client.query(`
                INSERT INTO game_rosters (
                    game_id, team_id, player_id, is_in_lineup,
                    line_number, position_in_line, jersey_number, is_captain, is_assistant
                ) VALUES ${values.join(', ')}
            `, params);
        }

        const gameRes = await client.query('SELECT home_team_id, away_team_id FROM games WHERE id = $1', [gameId]);
        if (gameRes.rows.length > 0) {
            const g = gameRes.rows[0];
            if (g.home_team_id == teamId) await client.query('UPDATE games SET home_roster_confirmed = true WHERE id = $1', [gameId]);
            else if (g.away_team_id == teamId) await client.query('UPDATE games SET away_roster_confirmed = true WHERE id = $1', [gameId]);
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка сохранения состава:', err);
        res.status(500).json({ success: false, error: 'Ошибка сохранения состава' });
    } finally {
        client.release();
    }
};

export const getGameStaff = async (req, res) => {
    try {
        const { gameId } = req.params;
        
        const leagueRes = await pool.query(`
            SELECT s.league_id 
            FROM games g
            JOIN divisions d ON g.division_id = d.id
            JOIN seasons s ON d.season_id = s.id
            WHERE g.id = $1
        `, [gameId]);

        if (leagueRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });
        const leagueId = leagueRes.rows[0].league_id;

        const staffRes = await pool.query(`
            SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url,
                   string_agg(ls.role, ', ') as roles
            FROM league_staff ls
            JOIN users u ON ls.user_id = u.id
            WHERE ls.league_id = $1 AND ls.end_date IS NULL
            GROUP BY u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url
            ORDER BY u.last_name
        `, [leagueId]);

        res.json({ success: true, data: staffRes.rows });
    } catch (err) {
        console.error('Ошибка получения персонала матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

export const updateGameOfficials = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        const { officials } = req.body;

        await client.query('BEGIN');

        const currentStaffRes = await client.query('SELECT role, user_id FROM game_staff WHERE game_id = $1', [gameId]);
        const currentStaff = {};
        currentStaffRes.rows.forEach(r => {
            currentStaff[r.role] = String(r.user_id); 
        });

        const validRoles = [
            'main-1', 'main-2', 'linesman-1', 'linesman-2', 
            'secretary', 'timekeeper', 'informant', 
            'broadcaster', 'commentator-1', 'commentator-2'
        ];

        const changedRoles = [];

        validRoles.forEach(role => {
            const oldUserId = currentStaff[role] || '';
            const newUserId = officials[role] ? String(officials[role]) : '';
            
            if (oldUserId !== newUserId) {
                changedRoles.push(role);
            }
        });

        if (changedRoles.length > 0) {
            const signableRolesChanged = changedRoles.filter(r => 
                ['main-1', 'main-2', 'linesman-1', 'linesman-2', 'secretary'].includes(r)
            );
            
            if (signableRolesChanged.length > 0) {
                await client.query(`
                    DELETE FROM game_protocol_signatures 
                    WHERE game_id = $1 AND role = ANY($2::text[])
                `, [gameId, signableRolesChanged]);
            }
        }

        await client.query('DELETE FROM game_staff WHERE game_id = $1', [gameId]);
        
        const values = []; 
        const params = []; 
        let paramIdx = 1; 

        validRoles.forEach(role => {
            if (officials[role] && officials[role] !== '') {
                values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
                params.push(gameId, officials[role], role); 
            }
        });

        if (values.length > 0) {
            await client.query(`
                INSERT INTO game_staff (game_id, user_id, role) 
                VALUES ${values.join(', ')}
            `, params);
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка сохранения бригады:', err);
        res.status(500).json({ success: false, error: err.message || 'Ошибка сервера' });
    } finally {
        client.release();
    }
};

export const deleteGame = async (req, res) => {
    try {
        const { gameId } = req.params;
        
        const gameRes = await pool.query('SELECT status FROM games WHERE id = $1', [gameId]);
        if (gameRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }
        
        if (gameRes.rows[0].status !== 'scheduled') {
            return res.status(400).json({ success: false, error: 'Удалить можно только матч со статусом "Предстоящий"' });
        }

        const depRes = await pool.query(`
            SELECT 
                EXISTS(SELECT 1 FROM game_events WHERE game_id = $1) as has_events,
                EXISTS(SELECT 1 FROM game_rosters WHERE game_id = $1) as has_rosters,
                EXISTS(SELECT 1 FROM game_staff WHERE game_id = $1) as has_staff
        `, [gameId]);
        
        const { has_events, has_rosters, has_staff } = depRes.rows[0];
        
        if (has_events || has_rosters || has_staff) {
            return res.status(400).json({ 
                success: false, 
                error: 'Нельзя удалить матч: очистите составы, события и судей перед удалением' 
            });
        }

        await pool.query('DELETE FROM games WHERE id = $1', [gameId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера при удалении матча' });
    }
};

export const recalculateGameStats = async (req, res) => {
    try {
        const { gameId } = req.params;

        const accessError = await checkGameEditAccess(pool, gameId, req.user?.id);
        if (accessError) return res.status(403).json({ success: false, error: accessError });

        const gameRes = await pool.query('SELECT division_id, stage_type FROM games WHERE id = $1', [gameId]);

        if (gameRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });
        const game = gameRes.rows[0];

        if (game.division_id) {
            if (game.stage_type === 'playoff') await recalculatePlayoffs(game.division_id);
            else await recalculateDivisionStandings(game.division_id);

            await recalculatePlayerStatistics(game.division_id);

            const teamsToUpdate = [game.home_team_id, game.away_team_id].filter(Boolean);
            if (teamsToUpdate.length > 0) {
                await recalculateTeamStatistics(teamsToUpdate);
            }
        }

        await pool.query('UPDATE games SET needs_recalc = false WHERE division_id = $1', [game.division_id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка ручного пересчета:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера при пересчете' });
    }
};