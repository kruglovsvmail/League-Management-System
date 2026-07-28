// LMS-Backend/controllers/gameController.js
import pool from '../config/db.js';
import { recalculateDivisionStandings } from '../utils/standingsCalculator.js';
import { recalculatePlayoffs } from '../utils/playoffCalculator.js';
import { recalculatePlayerStatistics } from '../utils/playerStatsCalculator.js';
import { recalculateTeamStatistics } from '../utils/teamStatsCalculator.js';

const checkGameEditAccess = async (clientOrPool, gameId, userId) => {
    if (!userId) return null;

    const userRes = await clientOrPool.query('SELECT global_role FROM users WHERE id = $1', [userId]);
    if (!userRes.rows.length) return null;
    // Было 'GLOBAL_ADMIN' — реальное значение в БД 'admin' (см. ROLES.GLOBAL_ADMIN
    // в utils/permissions.js), сравнение никогда не срабатывало.
    if (userRes.rows[0].global_role === 'admin') return null;

    const gameRes = await clientOrPool.query(`
        SELECT g.game_date, g.division_id, s.league_id, l.sec_access_before_hours, l.sec_access_after_hours
        FROM games g
        LEFT JOIN divisions d ON g.division_id = d.id
        LEFT JOIN seasons s ON d.season_id = s.id
        LEFT JOIN leagues l ON s.league_id = l.id
        WHERE g.id = $1
    `, [gameId]);

    if (gameRes.rows.length === 0) return 'Матч не найден';
    const game = gameRes.rows[0];

    // Матчи вне лиг (division_id IS NULL — товарищеские/внешние турниры, которые
    // команды создают сами в Team-Room) — доступ и правки только у глобального
    // админа (см. проверку выше). Игровой/лиговый персонал сюда не допускается
    // вообще, даже если каким-то образом попал в game_staff.
    if (!game.division_id) return 'Доступ разрешён только глобальному администратору';

    if (game.league_id) {
        const staffRes = await clientOrPool.query(`
            SELECT 1 FROM league_staff 
            WHERE user_id = $1 AND league_id = $2 AND end_date IS NULL
        `, [userId, game.league_id]);
        if (staffRes.rows.length > 0) return null; 
    }

    const matchStaffRes = await clientOrPool.query(`
        SELECT 1 FROM game_staff 
        WHERE game_id = $1 AND user_id = $2
        AND role IN ('main-1', 'main-2', 'linesman-1', 'linesman-2', 'secretary', 'timekeeper', 'informant')
    `, [gameId, userId]);

    const serviceRes = await clientOrPool.query(`
        SELECT account_type FROM league_service_accounts WHERE user_id = $1 AND is_active = true
    `, [userId]);
    const isServiceSec = serviceRes.rows.some(r => r.account_type === 'secretary');

    if (matchStaffRes.rows.length > 0 || isServiceSec) {
        if (!game.game_date) return 'Доступ закрыт: дата и время матча не назначены.';

        const beforeLimitHours = game.sec_access_before_hours ?? 12;
        const afterLimitHours = game.sec_access_after_hours ?? 3;
        
        const now = new Date();
        const gameDate = new Date(game.game_date);
        const beforeLimit = new Date(gameDate.getTime() - (beforeLimitHours * 60 * 60 * 1000));
        const afterLimit = new Date(gameDate.getTime() + (afterLimitHours * 60 * 60 * 1000));
        
        if (now < beforeLimit) return `Управление матчем откроется за ${beforeLimitHours} ч. до начала.`;
        if (now > afterLimit) return `Время управления матчем истекло (${afterLimitHours} ч. после начала).`;
    }
    
    return null;
};

export const getPublicGameById = async (req, res) => {
    try {
        const query = `
            SELECT g.id, g.home_score, g.away_score, g.end_type, g.status, g.is_technical, g.needs_recalc,
                   g.game_date, g.stage_type, g.stage_label, g.playoff_match_type, g.series_number, g.game_number,
                   g.home_jersey_type, g.away_jersey_type,
                   g.division_id, g.home_team_id, g.away_team_id,
                   t1.name as home_team_name, 
                   t1.short_name as home_short_name,
                   t1.logo_url as home_team_logo,
                   t1.color_home_1 as home_color_1, t1.color_home_2 as home_color_2,
                   t2.name as away_team_name,
                   t2.short_name as away_short_name,
                   t2.logo_url as away_team_logo,
                   t2.color_away_1 as away_color_1, t2.color_away_2 as away_color_2,
                   -- Джерси: приоритет tournament_teams → teams → дефолт
                   COALESCE(tt_home.custom_jersey_dark_url,  t1.jersey_dark_url)  as home_jersey_dark_url,
                   COALESCE(tt_home.custom_jersey_light_url, t1.jersey_light_url) as home_jersey_light_url,
                   COALESCE(tt_away.custom_jersey_dark_url,  t2.jersey_dark_url)  as away_jersey_dark_url,
                   COALESCE(tt_away.custom_jersey_light_url, t2.jersey_light_url) as away_jersey_light_url,
                   l.id as league_id, l.logo_url as league_logo, l.name as league_name,
                   d.logo_url as division_logo, d.name as division_name, d.short_name as division_short_name,
                   a.name as arena_name, a.city as arena_city,
                   gt.periods_count, gt.auto_stop_on_event, gt.shootout_status,
                   -- Живое значение из настроек дивизиона (не застывший снимок из game_timers,
                   -- скопированный при создании матча) — актуально даже если лига поменяла флаг позже.
                   CASE WHEN g.stage_type = 'playoff' THEN d.playoff_track_plus_minus ELSE d.reg_track_plus_minus END AS track_plus_minus,
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
            LEFT JOIN teams t2 ON g.away_team_id = t2.id
            LEFT JOIN divisions d ON g.division_id = d.id
            LEFT JOIN tournament_teams tt_home ON tt_home.team_id = g.home_team_id AND tt_home.division_id = g.division_id
            LEFT JOIN tournament_teams tt_away ON tt_away.team_id = g.away_team_id AND tt_away.division_id = g.division_id
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

            const tournamentRosterQuery = `
                SELECT tr.player_id, tt.team_id, u.first_name, u.last_name,
                       tr.jersey_number, tr.position,
                       COALESCE(tr.is_captain, false) as is_captain,
                       COALESCE(tr.is_assistant, false) as is_assistant,
                       COALESCE(tm.photo_url, u.avatar_url) as avatar_url,
                       COALESCE(ps.games_played, 0) as games_played,
                       COALESCE(ps.goals, 0) as goals,
                       COALESCE(ps.assists, 0) as assists,
                       COALESCE(ps.points, 0) as points,
                       COALESCE(ps.plus_minus, 0) as plus_minus,
                       COALESCE(ps.penalty_minutes, 0) as penalty_minutes
                FROM tournament_rosters tr
                JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
                JOIN users u ON tr.player_id = u.id
                LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = tt.team_id
                LEFT JOIN player_statistics ps ON tr.id = ps.tournament_roster_id
                WHERE tt.division_id = $1 AND tt.team_id IN ($2, $3) AND tr.application_status = 'approved'
                ORDER BY COALESCE(ps.points, 0) DESC, u.last_name ASC
            `;
            const tournamentRosterRes = await pool.query(tournamentRosterQuery, [game.division_id, game.home_team_id, game.away_team_id]);

            game.home_tournament_roster = tournamentRosterRes.rows.filter(r => r.team_id === game.home_team_id);
            game.away_tournament_roster = tournamentRosterRes.rows.filter(r => r.team_id === game.away_team_id);

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

            // Командные броски в створ вычисляются на лету: для атакующей команды это
            // сумма бросков, нанесённых по вратарям соперника, плюс голы, забитые в пустые ворота.
            // "Пустые ворота" определяются через game_goalie_log (последняя запись лога ДО гола),
            // т.к. поле game_events.against_goalie_id заполняется только для буллитов.
            const shotsSummaryRes = await pool.query(`
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
                      AND COALESCE(ge.goal_strength, '') <> 'ps'
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
            `, [game.id]);
            game.shots_summary = shotsSummaryRes.rows;

            const staffRes = await pool.query(`
                SELECT gs.role, u.id, u.first_name, u.last_name, u.middle_name, 
                       COALESCE(lsa.photo_url, u.avatar_url) as avatar_url
                FROM game_staff gs
                JOIN users u ON gs.user_id = u.id
                LEFT JOIN league_service_accounts lsa ON lsa.user_id = u.id
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
                g.stage_type, g.stage_label, g.playoff_match_type, g.series_number, g.game_number,
                g.home_team_id, g.away_team_id, g.arena_id,
                a.name as location_text,
                a.timezone as arena_timezone,
                ht.name as home_team_name, ht.logo_url as home_team_logo,
                at.name as away_team_name, at.logo_url as away_team_logo,
                d.name as division_name,
                gt.periods_count, gt.auto_stop_on_event,
                CASE WHEN g.stage_type = 'playoff' THEN d.playoff_track_plus_minus ELSE d.reg_track_plus_minus END AS track_plus_minus,
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
                gt.period_length, gt.ot_length, gt.so_length, gt.periods_count, gt.auto_stop_on_event, gt.shootout_status, gt.arena_announcer,
                CASE WHEN g.stage_type = 'playoff' THEN d.playoff_track_plus_minus ELSE d.reg_track_plus_minus END AS track_plus_minus,
                CASE WHEN g.stage_type = 'playoff' THEN d.playoff_track_shots ELSE d.reg_track_shots END AS track_shots,
                a.name as location_text,
                a.timezone as arena_timezone,
                ht.name as home_team_name, ht.logo_url as home_team_logo, 
                at.name as away_team_name, at.logo_url as away_team_logo,
                d.name as division_name,
                s.league_id,
                COALESCE(tt_home.custom_jersey_dark_url,  ht.jersey_dark_url)  as home_jersey_dark_url,
                COALESCE(tt_home.custom_jersey_light_url, ht.jersey_light_url) as home_jersey_light_url,
                COALESCE(tt_away.custom_jersey_dark_url,  at.jersey_dark_url)  as away_jersey_dark_url,
                COALESCE(tt_away.custom_jersey_light_url, at.jersey_light_url) as away_jersey_light_url,
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
            LEFT JOIN teams at ON g.away_team_id = at.id
            LEFT JOIN divisions d ON g.division_id = d.id
            LEFT JOIN seasons s ON d.season_id = s.id
            LEFT JOIN arenas a ON g.arena_id = a.id
            LEFT JOIN tournament_teams tt_home ON tt_home.team_id = g.home_team_id AND tt_home.division_id = g.division_id
            LEFT JOIN tournament_teams tt_away ON tt_away.team_id = g.away_team_id AND tt_away.division_id = g.division_id
            WHERE g.id = $1
        `;
        const result = await pool.query(query, [gameId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }

        const game = result.rows[0];

        const goalieLogRes = await pool.query('SELECT * FROM game_goalie_log WHERE game_id = $1 ORDER BY time_seconds ASC', [gameId]);
        game.goalie_log = goalieLogRes.rows;

        // Командные броски в створ вычисляются на лету (см. комментарий в публичном эндпоинте выше).
        const shotsSummaryRes = await pool.query(`
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
                  AND COALESCE(ge.goal_strength, '') <> 'ps'
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
        game.shots_summary = shotsSummaryRes.rows;

        // ОПЕЧАТКА УБРАНА: Заменено pool.query suicide на pool.query
        const staffRes = await pool.query(`
            SELECT gs.role, u.id, u.first_name, u.last_name, u.middle_name, 
                   COALESCE(lsa.photo_url, u.avatar_url) as avatar_url
            FROM game_staff gs
            JOIN users u ON gs.user_id = u.id
            LEFT JOIN league_service_accounts lsa ON lsa.user_id = u.id
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
            name: `${u.last_name || ''} ${u.first_name || ''} ${u.middle_name || ''}`.trim().replace(/\s+/g, ' '),
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
        let query = `SELECT id, name, city, timezone FROM arenas WHERE status = 'active'`;
        const params = [];

        if (leagueId) {
            query = `
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

        let pCount = 3, pLen = 20, oLen = 5, sLen = 3, autoStop = false;

        const divSettingsRes = await pool.query(`SELECT * FROM divisions WHERE id = $1`, [division_id]);

        if (divSettingsRes.rows.length > 0) {
            const ds = divSettingsRes.rows[0];

            pCount = isPO ? (ds.playoff_periods_count ?? 3) : (ds.reg_periods_count ?? 3);
            pLen = isPO ? (ds.playoff_period_length ?? 20) : (ds.reg_period_length ?? 20);

            const hasOt = isPO ? ds.playoff_has_overtime : ds.reg_has_overtime;
            oLen = hasOt ? (isPO ? (ds.playoff_ot_length ?? 5) : (ds.reg_ot_length ?? 5)) : 0;

            const hasSo = isPO ? ds.playoff_has_shootouts : ds.reg_has_shootouts;
            sLen = hasSo ? (isPO ? (ds.playoff_so_length ?? 3) : (ds.reg_so_length ?? 3)) : 0;

            // Автостоп таймера больше не задаётся дивизионом — это чисто удобство
            // секретаря на конкретном матче (шторка настроек в Live Desk), по
            // умолчанию выключен для каждого нового матча.
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
                game_id, periods_count, period_length, ot_length, so_length, auto_stop_on_event, time_seconds, shootout_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        `, [newGameId, pCount, pLen, oLen, sLen, autoStop, 0]);

        const fullGameRes = await pool.query(`
            SELECT 
                g.id, g.game_date, g.status, g.home_score, g.away_score, g.end_type,
                g.stage_type, g.stage_label, g.playoff_match_type, g.series_number, g.game_number,
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
            'game_date', 'arena_id', 'stage_type', 'stage_label', 'playoff_match_type', 'series_number',
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
        
        // ОПЕЧАТКА УБРАНА: Заменено pool.query suicide на pool.query
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

                // auto_stop_on_event сюда намеренно не входит — это личная настройка
                // секретаря для конкретного матча, смена стадии её не должна сбрасывать.
                await pool.query(`
                    UPDATE game_timers
                    SET periods_count = $1, period_length = $2, ot_length = $3, so_length = $4
                    WHERE game_id = $5
                `, [pCount, pLen, oLen, sLen, gameId]);
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
        let isTechnical = game.is_technical;

        if (incomingEndType === 'tech') {
            endType = 'tech';
            
            if (tech_result === 'home_win') {
                isTechnical = '+/-';
            } else if (tech_result === 'away_win') {
                isTechnical = '-/+';
            } else if (tech_result === 'both_lose') {
                isTechnical = '-/-';
            }
            
        } else if (incomingEndType === 'regular' && tech_result === null) {
            isTechnical = null;
            
            if (status === 'scheduled' || status === 'draft') {
                endType = null;
            } else {
                const goalsRes = await client.query(`SELECT period FROM game_events WHERE game_id = $1 AND event_type = 'goal'`, [gameId]);
                const hasOTGoal = goalsRes.rows.some(e => e.period === 'OT');
                
                const soRes = await client.query(`SELECT 1 FROM game_events WHERE game_id = $1 AND event_type IN ('shootout_goal', 'shootout_miss') LIMIT 1`, [gameId]);
                if (soRes.rows.length > 0) {
                    endType = 'so';
                } else {
                    endType = hasOTGoal ? 'ot' : 'regular';
                }
            }
        } else {
            if (status === 'scheduled' || status === 'draft') {
                isTechnical = null;
                endType = null;
            } else {
                isTechnical = game.is_technical;
                if (game.end_type === 'tech') {
                    endType = 'tech';
                } else if (endType !== 'so') {
                    const goalsRes = await client.query(`SELECT period FROM game_events WHERE game_id = $1 AND event_type = 'goal'`, [gameId]);
                    const hasOTGoal = goalsRes.rows.some(e => e.period === 'OT');

                    const soRes = await client.query(`SELECT 1 FROM game_events WHERE game_id = $1 AND event_type IN ('shootout_goal', 'shootout_miss') LIMIT 1`, [gameId]);
                    if (soRes.rows.length > 0) {
                        endType = 'so';
                    } else {
                        endType = hasOTGoal ? 'ot' : 'regular';
                    }
                }
            }
        }

        await client.query(`
            UPDATE games
            SET status = $1, end_type = $2, home_score = $3, away_score = $4, is_technical = $5, needs_recalc = false
            WHERE id = $6
        `, [status, endType, finalHomeScore, finalAwayScore, isTechnical, gameId]);

        // Матч только что стал "finished" — засчитываем его как отбытый матч всем активным
        // игровым дисквалификациям обеих команд этого дивизиона (списание идёт по факту того,
        // что команда сыграла матч, а не по факту участия конкретного игрока в протоколе).
        const isNewlyFinished = status === 'finished' && game.status !== 'finished';
        if (isNewlyFinished && game.division_id) {
            const teamsInGame = [game.home_team_id, game.away_team_id].filter(Boolean);
            if (teamsInGame.length > 0) {
                // Дисквалификация теперь привязана к user_id/team_id + лиге (не к сезонной заявке) —
                // считаем отбытые матчи по факту того, что команда-источник сыграла игру в этой лиге,
                // независимо от того, в каком сезоне идёт матч (наказание переживает смену сезона).
                await client.query(`
                    UPDATE disqualifications d
                    SET games_served = d.games_served + 1
                    WHERE d.status = 'active'
                      AND d.games_assigned IS NOT NULL
                      AND d.team_id = ANY($1::int[])
                      AND d.league_id = (SELECT s.league_id FROM divisions div JOIN seasons s ON div.season_id = s.id WHERE div.id = $2)
                `, [teamsInGame, game.division_id]);
            }
        }

        await client.query('COMMIT');

        if ((status === 'finished' || game.status === 'finished' || isTechnical || game.is_technical) && game.division_id) {
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

        // Резолвим лигу матча один раз — используется ниже, чтобы отметить дисквалифицированных
        // игроков/представителей флагом (не скрывая их, а помечая для UI — бейдж "Дискв.")
        const leagueRes = await pool.query(`
            SELECT s.league_id FROM games g
            JOIN divisions div ON g.division_id = div.id
            JOIN seasons s ON div.season_id = s.id
            WHERE g.id = $1
        `, [gameId]);
        const leagueId = leagueRes.rows[0]?.league_id || null;

        const dqSubquery = (userIdCol) => `(
            SELECT COALESCE(json_agg(json_build_object(
                'reason', d.reason, 'penalty_type', d.penalty_type,
                'games_assigned', d.games_assigned, 'games_served', d.games_served, 'end_date', d.end_date,
                'mandatory_games', d.mandatory_games, 'additional_games', d.additional_games,
                'penalty_amount', d.penalty_amount, 'penalty_amount_paid', d.penalty_amount_paid
            )), '[]'::json)
            FROM disqualifications d
            WHERE d.user_id = ${userIdCol} AND d.league_id = $3 AND d.status = 'active'
        ) as active_disqualifications`;

        const [tRosterRes, gRosterRes, staffRes] = await Promise.all([
            pool.query(`
                SELECT tr.player_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tr.jersey_number, tr.position, tm.photo_url,
                       ${dqSubquery('tr.player_id')}
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
            `, [gameId, teamId, leagueId]),

            pool.query(`
                SELECT gr.player_id, gr.jersey_number, gr.position_in_line, gr.is_captain, gr.is_assistant,
                       u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url,
                       ${dqSubquery('gr.player_id')}
                FROM game_rosters gr
                JOIN users u ON gr.player_id = u.id
                LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = gr.team_id
                WHERE gr.game_id = $1 AND gr.team_id = $2
                ORDER BY u.last_name
            `, [gameId, teamId, leagueId]),

            pool.query(`
                SELECT ttr.user_id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url,
                       string_agg(ttr.tournament_role, ', ') as roles,
                       ${dqSubquery('ttr.user_id')}
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
            `, [gameId, teamId, leagueId])
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

        if (roster && roster.length > 0) {
            const playerIds = roster.map(p => p.player_id);
            const dqCheck = await client.query(`
                SELECT u.first_name, u.last_name
                FROM disqualifications d
                JOIN users u ON d.user_id = u.id
                JOIN games g ON g.id = $1
                JOIN divisions div ON g.division_id = div.id
                JOIN seasons s ON div.season_id = s.id
                WHERE d.user_id = ANY($2::int[]) AND d.league_id = s.league_id AND d.status = 'active'
            `, [gameId, playerIds]);

            if (dqCheck.rows.length > 0) {
                client.release();
                const names = dqCheck.rows.map(r => `${r.last_name} ${r.first_name}`).join(', ');
                return res.status(400).json({ success: false, error: `Нельзя включить в протокол дисквалифицированных игроков: ${names}` });
            }
        }

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
        
        // LEFT JOIN — у матчей вне лиг (division_id IS NULL, товарищеские/внешние
        // турниры) league_id закономерно отсутствует, но сам матч должен находиться.
        const leagueRes = await pool.query(`
            SELECT g.id, s.league_id
            FROM games g
            LEFT JOIN divisions d ON g.division_id = d.id
            LEFT JOIN seasons s ON d.season_id = s.id
            WHERE g.id = $1
        `, [gameId]);

        if (leagueRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });
        const leagueId = leagueRes.rows[0].league_id;

        const staffRes = await pool.query(`
            SELECT user_id, first_name, last_name, middle_name, avatar_url, roles
            FROM (
                SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url,
                       string_agg(ls.role, ', ') as roles
                FROM league_staff ls
                JOIN users u ON ls.user_id = u.id
                WHERE ls.league_id = $1 AND ls.end_date IS NULL
                GROUP BY u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url
                
                UNION ALL
                
                SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, lsa.photo_url as avatar_url,
                       'service_' || lsa.account_type as roles
                FROM league_service_accounts lsa
                JOIN users u ON lsa.user_id = u.id
                WHERE lsa.league_id = $1 AND lsa.is_active = true
            ) combined_staff
            ORDER BY last_name ASC NULLS FIRST, first_name ASC
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
        console.error('Ошибка保存 бригады:', err);
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

        // ОПЕЧАТКА УБРАНА: Заменено pool.query suicide на pool.query
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

        const gameRes = await pool.query(`
            SELECT g.division_id, g.stage_type, g.is_technical, g.home_team_id, g.away_team_id, gt.shootout_status
            FROM games g
            LEFT JOIN game_timers gt ON g.id = gt.game_id
            WHERE g.id = $1
        `, [gameId]);

        if (gameRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });
        const game = gameRes.rows[0];

        if (!game.is_technical) {
            const allGoalsRes = await pool.query(`
                SELECT team_id, event_type, period 
                FROM game_events 
                WHERE game_id = $1 AND event_type IN ('goal', 'shootout_goal')
            `, [gameId]);

            let homeReg = 0, awayReg = 0;
            let homeSO = 0, awaySO = 0;
            let hasOTGoal = false;

            allGoalsRes.rows.forEach(e => {
                if (e.event_type === 'goal') {
                    if (e.team_id === game.home_team_id) homeReg++;
                    else if (e.team_id === game.away_team_id) awayReg++;
                    
                    if (e.period === 'OT') hasOTGoal = true;
                } else if (e.event_type === 'shootout_goal') {
                    if (e.team_id === game.home_team_id) homeSO++;
                    else if (e.team_id === game.away_team_id) awaySO++;
                }
            });

            let finalHomeScore = homeReg;
            let finalAwayScore = awayReg;
            let endType = hasOTGoal ? 'ot' : 'regular';

            if (game.shootout_status === 'finished_win') {
                endType = 'so';
                if (homeSO > awaySO) finalHomeScore++;
                else if (awaySO > homeSO) finalAwayScore++;
            }

            await pool.query(`
                UPDATE games 
                SET home_score = $1, away_score = $2, end_type = $3 
                WHERE id = $4
            `, [finalHomeScore, finalAwayScore, endType, gameId]);
        }

        if (game.division_id) {
            if (game.stage_type === 'playoff') await recalculatePlayoffs(game.division_id);
            else await recalculateDivisionStandings(game.division_id);

            await recalculatePlayerStatistics(game.division_id);

            const teamsToUpdate = [game.home_team_id, game.away_team_id].filter(Boolean);
            if (teamsToUpdate.length > 0) {
                await recalculateTeamStatistics(teamsToUpdate);
            }
        }

        // Матч, по которому реально жали "Пересчёт", сбрасываем всегда явно по id —
        // WHERE division_id = $1 с NULL (матч вне лиги) никогда ничего не находит,
        // и needs_recalc оставался бы true навсегда, а кнопка — вечно "недожатой".
        await pool.query('UPDATE games SET needs_recalc = false WHERE id = $1', [gameId]);
        if (game.division_id) {
            await pool.query('UPDATE games SET needs_recalc = false WHERE division_id = $1', [game.division_id]);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка ручного пересчета:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера при пересчете' });
    }
};

// Статистика конкретного матча (командная + по каждому игроку) — та же логика,
// что в Team-Room/TR-Backend/controllers/MatchController.js:getMatchStats (общая
// схема БД: game_events/game_shots_by_goalie/game_goalie_log/game_plus_minus).
// В отличие от TR здесь только официальные лиговые матчи — состав/фото берём
// прямо из users/game_rosters, без tournament_rosters/team_members.
export const getGameStats = async (req, res) => {
    try {
        const { gameId } = req.params;

        const flagsQuery = `
            SELECT
                CASE WHEN g.stage_type = 'playoff' THEN d.playoff_track_plus_minus ELSE d.reg_track_plus_minus END AS track_plus_minus,
                CASE WHEN g.stage_type = 'playoff' THEN d.playoff_track_shots ELSE d.reg_track_shots END AS track_shots
            FROM games g
            LEFT JOIN divisions d ON d.id = g.division_id
            WHERE g.id = $1
        `;

        const teamQuery = `
            WITH game_info AS (
                SELECT home_team_id, away_team_id, status
                FROM games
                WHERE id = $1
            ),
            goal_stats AS (
                SELECT
                    team_id,
                    COUNT(*)::int AS total_goals,
                    COUNT(*) FILTER (WHERE goal_strength IN ('pp1', 'pp2'))::int AS pp_goals,
                    COUNT(*) FILTER (WHERE goal_strength IN ('sh1', 'sh2'))::int AS sh_goals
                FROM game_events
                WHERE game_id = $1 AND event_type = 'goal'
                GROUP BY team_id
            ),
            penalty_stats AS (
                SELECT team_id, COALESCE(SUM(penalty_minutes), 0)::int AS pim
                FROM game_events
                WHERE game_id = $1 AND event_type = 'penalty'
                GROUP BY team_id
            ),
            shots_faced_stats AS (
                -- Все броски в створ по вратарям команды (team_id = команда вратаря).
                SELECT team_id, COALESCE(SUM(shots_count), 0)::int AS shots_faced
                FROM game_shots_by_goalie
                WHERE game_id = $1
                GROUP BY team_id
            ),
            goal_to_goalie AS (
                -- Для каждого гола определяем, кто стоял в воротах команды-соперника
                -- через game_goalie_log (берём последнюю запись лога ДО момента гола).
                SELECT DISTINCT ON (ge.id)
                    ge.id AS event_id,
                    ge.team_id AS scoring_team_id,
                    CASE WHEN ge.team_id IS NOT DISTINCT FROM gi.home_team_id THEN gi.away_team_id ELSE gi.home_team_id END AS conceding_team_id,
                    COALESCE(ge.from_shot, true) AS from_shot,
                    CASE WHEN ge.team_id IS NOT DISTINCT FROM gi.home_team_id THEN gl.away_goalie_id ELSE gl.home_goalie_id END AS conceding_goalie_id
                FROM game_events ge
                CROSS JOIN game_info gi
                JOIN game_goalie_log gl
                    ON gl.game_id = ge.game_id
                   AND gl.time_seconds <= ge.time_seconds
                WHERE ge.game_id = $1
                    AND ge.event_type = 'goal'
                    AND COALESCE(ge.goal_strength, '') <> 'ps'
                ORDER BY ge.id, gl.time_seconds DESC
            ),
            ga_from_shot_stats AS (
                -- Голы С БРОСКА против конкретного вратаря (не пустые ворота) — уменьшают saves.
                SELECT conceding_team_id, COUNT(*)::int AS ga_from_shot
                FROM goal_to_goalie
                WHERE conceding_goalie_id IS NOT NULL AND from_shot = true
                GROUP BY conceding_team_id
            ),
            empty_net_goals_scored AS (
                -- Голы в пустые ворота с броска — засчитываются в SOG атакующей команды.
                SELECT scoring_team_id AS team_id, COUNT(*)::int AS empty_net_goals
                FROM goal_to_goalie
                WHERE conceding_goalie_id IS NULL AND from_shot = true
                GROUP BY scoring_team_id
            )
            SELECT
                gi.home_team_id::int,
                gi.away_team_id::int,
                gi.status::varchar,
                COALESCE(hg.total_goals, 0)::int AS home_goals,
                COALESCE(hg.pp_goals, 0)::int AS home_pp_goals,
                COALESCE(hg.sh_goals, 0)::int AS home_sh_goals,
                COALESCE(ag.total_goals, 0)::int AS away_goals,
                COALESCE(ag.pp_goals, 0)::int AS away_pp_goals,
                COALESCE(ag.sh_goals, 0)::int AS away_sh_goals,
                COALESCE(hp.pim, 0)::int AS home_pim,
                COALESCE(ap.pim, 0)::int AS away_pim,
                COALESCE(hsf.shots_faced, 0)::int AS home_shots_faced,
                COALESCE(asf.shots_faced, 0)::int AS away_shots_faced,
                COALESCE(hga.ga_from_shot, 0)::int AS home_ga_from_shot,
                COALESCE(aga.ga_from_shot, 0)::int AS away_ga_from_shot,
                COALESCE(heng.empty_net_goals, 0)::int AS home_empty_net_goals,
                COALESCE(aeng.empty_net_goals, 0)::int AS away_empty_net_goals
            FROM game_info gi
            LEFT JOIN goal_stats hg ON hg.team_id IS NOT DISTINCT FROM gi.home_team_id
            LEFT JOIN goal_stats ag ON ag.team_id IS NOT DISTINCT FROM gi.away_team_id
            LEFT JOIN penalty_stats hp ON hp.team_id IS NOT DISTINCT FROM gi.home_team_id
            LEFT JOIN penalty_stats ap ON ap.team_id IS NOT DISTINCT FROM gi.away_team_id
            LEFT JOIN shots_faced_stats hsf ON hsf.team_id = gi.home_team_id
            LEFT JOIN shots_faced_stats asf ON asf.team_id = gi.away_team_id
            LEFT JOIN ga_from_shot_stats hga ON hga.conceding_team_id IS NOT DISTINCT FROM gi.home_team_id
            LEFT JOIN ga_from_shot_stats aga ON aga.conceding_team_id IS NOT DISTINCT FROM gi.away_team_id
            LEFT JOIN empty_net_goals_scored heng ON heng.team_id IS NOT DISTINCT FROM gi.home_team_id
            LEFT JOIN empty_net_goals_scored aeng ON aeng.team_id IS NOT DISTINCT FROM gi.away_team_id
        `;

        const skatersQuery = `
            SELECT
                gr.player_id::int,
                gr.team_id::int,
                gr.jersey_number::int,
                u.first_name::varchar,
                u.last_name::varchar,
                u.avatar_url::varchar,
                tm.photo_url::varchar,
                COALESCE(g.goals, 0)::int AS goals,
                COALESCE(a.assists, 0)::int AS assists,
                (COALESCE(g.goals, 0) + COALESCE(a.assists, 0))::int AS points,
                COALESCE(pm.plus_minus, 0)::int AS plus_minus,
                COALESCE(pen.penalty_minutes, 0)::int AS penalty_minutes
            FROM game_rosters gr
            JOIN users u ON gr.player_id = u.id
            LEFT JOIN team_members tm ON tm.user_id = gr.player_id AND tm.team_id = gr.team_id
            LEFT JOIN (
                SELECT scorer_id, team_id, COUNT(*)::int AS goals
                FROM game_events
                WHERE game_id = $1 AND event_type = 'goal'
                GROUP BY scorer_id, team_id
            ) g ON g.scorer_id = gr.player_id AND g.team_id = gr.team_id
            LEFT JOIN (
                SELECT player_id, team_id, COUNT(*)::int AS assists FROM (
                    SELECT assist1_id AS player_id, team_id FROM game_events
                    WHERE game_id = $1 AND event_type = 'goal' AND assist1_id IS NOT NULL
                    UNION ALL
                    SELECT assist2_id AS player_id, team_id FROM game_events
                    WHERE game_id = $1 AND event_type = 'goal' AND assist2_id IS NOT NULL
                ) sub GROUP BY player_id, team_id
            ) a ON a.player_id = gr.player_id AND a.team_id = gr.team_id
            LEFT JOIN (
                SELECT pm.player_id, pm.team_id,
                    SUM(CASE WHEN ge.team_id = pm.team_id THEN 1 ELSE -1 END)::int AS plus_minus
                FROM game_plus_minus pm
                JOIN game_events ge ON pm.event_id = ge.id
                WHERE ge.game_id = $1 AND ge.event_type = 'goal'
                GROUP BY pm.player_id, pm.team_id
            ) pm ON pm.player_id = gr.player_id AND pm.team_id = gr.team_id
            LEFT JOIN (
                SELECT penalty_player_id, team_id, SUM(penalty_minutes)::int AS penalty_minutes
                FROM game_events
                WHERE game_id = $1 AND event_type = 'penalty'
                GROUP BY penalty_player_id, team_id
            ) pen ON pen.penalty_player_id = gr.player_id AND pen.team_id = gr.team_id
            WHERE gr.game_id = $1 AND gr.is_in_lineup = true AND gr.position_in_line != 'G'
            ORDER BY gr.team_id,
                (COALESCE(g.goals, 0) + COALESCE(a.assists, 0)) DESC,
                COALESCE(g.goals, 0) DESC
        `;

        const goaliesQuery = `
            WITH game_info AS (
                SELECT home_team_id, away_team_id FROM games WHERE id = $1
            ),
            goal_goalie AS (
                SELECT
                    ge.id AS event_id,
                    ge.team_id AS scoring_team_id,
                    ge.time_seconds,
                    COALESCE(ge.from_shot, true) AS from_shot,
                    CASE WHEN ge.team_id = gi.home_team_id
                        THEN (
                            SELECT ggl.away_goalie_id FROM game_goalie_log ggl
                            WHERE ggl.game_id = $1 AND ggl.time_seconds <= ge.time_seconds
                            ORDER BY ggl.time_seconds DESC LIMIT 1
                        )
                        ELSE (
                            SELECT ggl.home_goalie_id FROM game_goalie_log ggl
                            WHERE ggl.game_id = $1 AND ggl.time_seconds <= ge.time_seconds
                            ORDER BY ggl.time_seconds DESC LIMIT 1
                        )
                    END AS goalie_id
                FROM game_events ge
                CROSS JOIN game_info gi
                WHERE ge.game_id = $1 AND ge.event_type = 'goal'
                    AND COALESCE(ge.goal_strength, '') <> 'ps'
            ),
            goals_against_per_goalie AS (
                SELECT goalie_id, COUNT(*)::int AS goals_against
                FROM goal_goalie
                WHERE goalie_id IS NOT NULL
                GROUP BY goalie_id
            ),
            goals_against_from_shot AS (
                SELECT goalie_id, COUNT(*)::int AS ga_fs
                FROM goal_goalie
                WHERE goalie_id IS NOT NULL AND from_shot = true
                GROUP BY goalie_id
            )
            SELECT
                gr.player_id::int,
                gr.team_id::int,
                gr.jersey_number::int,
                u.first_name::varchar,
                u.last_name::varchar,
                u.avatar_url::varchar,
                tm.photo_url::varchar,
                -- Отражённые = (все броски в створ вратарю) − (голы С БРОСКА против него).
                -- Если бросков по вратарю нет — NULL (фронт покажет «—», а не 0).
                CASE
                    WHEN COALESCE(s.shots_against, 0) > 0
                    THEN GREATEST(COALESCE(s.shots_against, 0) - COALESCE(gfs.ga_fs, 0), 0)
                    ELSE NULL
                END::int AS saves,
                COALESCE(ga.goals_against, 0)::int AS goals_against,
                CASE
                    WHEN COALESCE(s.shots_against, 0) > 0
                    THEN ROUND(
                        GREATEST(COALESCE(s.shots_against, 0) - COALESCE(gfs.ga_fs, 0), 0)::numeric
                        / COALESCE(s.shots_against, 0) * 100, 1
                    )
                    ELSE NULL
                END::float AS save_percent,
                CASE WHEN COALESCE(ga.goals_against, 0) = 0 AND COALESCE(s.shots_against, 0) > 0 THEN 1 ELSE 0 END::int AS shutouts
            FROM game_rosters gr
            JOIN users u ON gr.player_id = u.id
            LEFT JOIN team_members tm ON tm.user_id = gr.player_id AND tm.team_id = gr.team_id
            LEFT JOIN (
                SELECT goalie_id, team_id, SUM(shots_count)::int AS shots_against
                FROM game_shots_by_goalie
                WHERE game_id = $1
                GROUP BY goalie_id, team_id
            ) s ON s.goalie_id = gr.player_id AND s.team_id = gr.team_id
            LEFT JOIN goals_against_per_goalie ga ON ga.goalie_id = gr.player_id
            LEFT JOIN goals_against_from_shot gfs ON gfs.goalie_id = gr.player_id
            WHERE gr.game_id = $1 AND gr.is_in_lineup = true AND gr.position_in_line = 'G'
            ORDER BY gr.team_id, COALESCE(s.shots_against, 0) DESC
        `;

        const [teamResult, skatersResult, goaliesResult, flagsResult] = await Promise.all([
            pool.query(teamQuery, [gameId]),
            pool.query(skatersQuery, [gameId]),
            pool.query(goaliesQuery, [gameId]),
            pool.query(flagsQuery, [gameId])
        ]);

        if (teamResult.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }

        const r = teamResult.rows[0];
        const trackPM = flagsResult.rows[0]?.track_plus_minus ?? false;
        const trackShots = flagsResult.rows[0]?.track_shots ?? false;

        // Маскируем прямо в сырых результатах, до построчной разбивки по командам.
        if (!trackPM) {
            skatersResult.rows.forEach(row => { row.plus_minus = null; });
        }
        if (!trackShots) {
            goaliesResult.rows.forEach(row => { row.saves = null; row.save_percent = null; });
        }

        // Командные броски в створ атакующей команды = броски по вратарям соперника
        // + голы атакующей команды в пустые ворота соперника.
        const homeShotsOnGoal = r.away_shots_faced + r.home_empty_net_goals;
        const awayShotsOnGoal = r.home_shots_faced + r.away_empty_net_goals;

        // Командные отражённые = (броски в створ нашим вратарям) − (голы с броска против них).
        const homeSaves = Math.max(r.home_shots_faced - r.home_ga_from_shot, 0);
        const awaySaves = Math.max(r.away_shots_faced - r.away_ga_from_shot, 0);

        const homeShootingPct = homeShotsOnGoal > 0
            ? parseFloat((r.home_goals / homeShotsOnGoal * 100).toFixed(1)) : 0;
        const awayShootingPct = awayShotsOnGoal > 0
            ? parseFloat((r.away_goals / awayShotsOnGoal * 100).toFixed(1)) : 0;

        const homeSavePct = r.home_shots_faced > 0
            ? parseFloat((homeSaves / r.home_shots_faced * 100).toFixed(1)) : 0;
        const awaySavePct = r.away_shots_faced > 0
            ? parseFloat((awaySaves / r.away_shots_faced * 100).toFixed(1)) : 0;

        const homeSkaters = skatersResult.rows.filter(p => p.team_id === r.home_team_id);
        const awaySkaters = skatersResult.rows.filter(p => p.team_id === r.away_team_id);
        const homeGoalies = goaliesResult.rows.filter(p => p.team_id === r.home_team_id);
        const awayGoalies = goaliesResult.rows.filter(p => p.team_id === r.away_team_id);

        // «—» если лига для этой стадии броски вообще не ведёт (trackShots=false),
        // независимо от того, есть ли физические данные.
        const homeHasFor = trackShots && homeShotsOnGoal > 0;
        const awayHasFor = trackShots && awayShotsOnGoal > 0;
        const homeHasAgainst = trackShots && r.home_shots_faced > 0;
        const awayHasAgainst = trackShots && r.away_shots_faced > 0;

        res.json({
            success: true,
            stats: {
                home: {
                    shots_on_goal: homeHasFor ? homeShotsOnGoal : null,
                    shooting_pct: homeHasFor ? homeShootingPct : null,
                    pp_goals: r.home_pp_goals,
                    sh_goals: r.home_sh_goals,
                    pim: r.home_pim,
                    saves: homeHasAgainst ? homeSaves : null,
                    save_pct: homeHasAgainst ? homeSavePct : null,
                    skaters: homeSkaters,
                    goalies: homeGoalies
                },
                away: {
                    shots_on_goal: awayHasFor ? awayShotsOnGoal : null,
                    shooting_pct: awayHasFor ? awayShootingPct : null,
                    pp_goals: r.away_pp_goals,
                    sh_goals: r.away_sh_goals,
                    pim: r.away_pim,
                    saves: awayHasAgainst ? awaySaves : null,
                    save_pct: awayHasAgainst ? awaySavePct : null,
                    skaters: awaySkaters,
                    goalies: awayGoalies
                }
            }
        });
    } catch (err) {
        console.error('Ошибка получения статистики матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};