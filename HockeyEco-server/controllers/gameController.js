import pool from '../config/db.js';

// =======================================================
// ПУБЛИЧНЫЙ ЭНДПОИНТ ДЛЯ OBS ГРАФИКИ (БЕЗ АВТОРИЗАЦИИ)
// =======================================================
export const getPublicGameById = async (req, res) => {
    try {
        const query = `
            SELECT g.id, g.home_score, g.away_score, 
                   g.game_date, g.stage_type, g.stage_label, g.series_number,
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
                   COALESCE(a.name, g.location_text) as location_text,
                   a.name as arena_name,
                   a.city as arena_city,
                   a.address as arena_address
            FROM games g
            JOIN teams t1 ON g.home_team_id = t1.id
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

            // 1. Поиск лидеров команд
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

            const [homeLeaderRes, awayLeaderRes] = await Promise.all([
                pool.query(leaderQuery, [game.division_id, game.home_team_id, game.id]),
                pool.query(leaderQuery, [game.division_id, game.away_team_id, game.id])
            ]);

            game.home_leader = homeLeaderRes.rows[0] || null;
            game.away_leader = awayLeaderRes.rows[0] || null;

            // 2. Получение составов на матч
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

            // 3. Получение всех голов
            const goalsQuery = `
                SELECT ge.id, ge.team_id, ge.period, ge.time_seconds, ge.goal_strength,
                       u_scorer.last_name as scorer_last_name, u_scorer.first_name as scorer_first_name,
                       u_a1.last_name as a1_last_name, u_a1.first_name as a1_first_name,
                       u_a2.last_name as a2_last_name, u_a2.first_name as a2_first_name
                FROM game_events ge
                LEFT JOIN users u_scorer ON ge.scorer_id = u_scorer.id
                LEFT JOIN users u_a1 ON ge.assist1_id = u_a1.id
                LEFT JOIN users u_a2 ON ge.assist2_id = u_a2.id
                WHERE ge.game_id = $1 AND ge.event_type = 'goal'
                ORDER BY ge.time_seconds ASC
            `;
            const goalsRes = await pool.query(goalsQuery, [game.id]);
            game.goals = goalsRes.rows;

            // 4. Получение судей и комментатора
            const [refRes, mediaRes] = await Promise.all([
                pool.query(`
                    SELECT gr.role, u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url
                    FROM game_referee gr
                    JOIN users u ON gr.user_id = u.id
                    WHERE gr.game_id = $1
                `, [game.id]),
                pool.query(`
                    SELECT u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url
                    FROM game_media gm
                    JOIN users u ON gm.user_id = u.id
                    WHERE gm.game_id = $1
                    LIMIT 1
                `, [game.id])
            ]);

            const officials = { head_1: null, head_2: null, linesman_1: null, linesman_2: null, scorekeeper: null, media: null };
            
            const formatName = (u) => ({ 
                id: u.id, 
                first_name: u.first_name,
                last_name: u.last_name,
                avatar_url: u.avatar_url
            });

            refRes.rows.forEach(r => {
                if (officials[r.role] !== undefined) officials[r.role] = formatName(r);
            });

            if (mediaRes.rows.length > 0) {
                officials.media = formatName(mediaRes.rows[0]);
            }

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

// --- СПИСОК МАТЧЕЙ (ДЛЯ СТРАНИЦЫ GAMES) ---
export const getGames = async (req, res) => {
    try {
        const { seasonId } = req.params;
        const { start, end, division, status } = req.query;

        let query = `
            SELECT 
                g.id, g.game_date, g.status, g.home_score, g.away_score, g.end_type,
                g.stage_type, g.stage_label, g.series_number, 
                COALESCE(a.name, g.location_text) as location_text,
                ht.name as home_team_name, ht.logo_url as home_team_logo,
                at.name as away_team_name, at.logo_url as away_team_logo,
                d.name as division_name
            FROM games g
            JOIN teams ht ON g.home_team_id = ht.id
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

        if (division && division !== 'Все дивизионы') {
            query += ` AND d.name = $${paramIndex}`;
            params.push(division);
            paramIndex++;
        }

        if (status === '1') query += ` AND g.status IN ('scheduled', 'live')`;
        else if (status === '2') query += ` AND g.status = 'finished'`;
        else query += ` AND g.status IN ('scheduled', 'live', 'finished', 'cancelled')`;

        query += ` ORDER BY g.game_date ASC`;

        const result = await pool.query(query, params);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка загрузки матчей:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера при загрузке матчей' });
    }
};

// --- ПОЛУЧЕНИЕ ОДНОГО МАТЧА (ДЛЯ GAMEPAGE) ---
export const getGameById = async (req, res) => {
    try {
        const { gameId } = req.params;
        const query = `
            SELECT 
                g.*,
                COALESCE(a.name, g.location_text) as location_text,
                ht.name as home_team_name, ht.logo_url as home_team_logo, 
                COALESCE(htt.custom_jersey_dark_url, ht.jersey_dark_url) as home_jersey_dark,
                COALESCE(htt.custom_jersey_light_url, ht.jersey_light_url) as home_jersey_light,
                at.name as away_team_name, at.logo_url as away_team_logo,
                COALESCE(att.custom_jersey_dark_url, at.jersey_dark_url) as away_jersey_dark,
                COALESCE(att.custom_jersey_light_url, at.jersey_light_url) as away_jersey_light,
                d.name as division_name
            FROM games g
            JOIN teams ht ON g.home_team_id = ht.id
            LEFT JOIN tournament_teams htt ON htt.team_id = ht.id AND htt.division_id = g.division_id
            LEFT JOIN teams at ON g.away_team_id = at.id
            LEFT JOIN tournament_teams att ON att.team_id = at.id AND att.division_id = g.division_id
            JOIN divisions d ON g.division_id = d.id
            LEFT JOIN arenas a ON g.arena_id = a.id
            WHERE g.id = $1
        `;
        const result = await pool.query(query, [gameId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Матч не найден' });
        }

        const game = result.rows[0];

        const [refRes, mediaRes] = await Promise.all([
            pool.query(`
                SELECT gr.role, u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url
                FROM game_referee gr
                JOIN users u ON gr.user_id = u.id
                WHERE gr.game_id = $1
            `, [gameId]),
            pool.query(`
                SELECT u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url
                FROM game_media gm
                JOIN users u ON gm.user_id = u.id
                WHERE gm.game_id = $1
                LIMIT 1
            `, [gameId])
        ]);

        const officials = { head_1: '', head_2: '', linesman_1: '', linesman_2: '', scorekeeper: '', media: '' };
        
        const formatName = (u) => ({ 
            id: u.id, 
            name: `${u.last_name} ${u.first_name} ${u.middle_name || ''}`.trim(),
            avatar_url: u.avatar_url
        });

        refRes.rows.forEach(r => {
            if (officials[r.role] !== undefined) officials[r.role] = formatName(r);
        });

        if (mediaRes.rows.length > 0) {
            officials.media = formatName(mediaRes.rows[0]);
        }

        game.officials = officials;

        res.json({ success: true, data: game });
    } catch (err) {
        console.error('Ошибка загрузки матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// --- СПРАВОЧНИК АРЕН ---
export const getArenas = async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, name, city FROM arenas WHERE status = 'active' ORDER BY name`);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка загрузки арен:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки арен' });
    }
};

// --- СОЗДАНИЕ МАТЧА ---
export const createGame = async (req, res) => {
    try {
        const { seasonId } = req.params;
        const {
            division_id, game_date, arena_id, stage_type, stage_label, series_number,
            home_team_id, away_team_id, home_jersey_type, away_jersey_type
        } = req.body;

        const result = await pool.query(`
            INSERT INTO games (
                game_type, division_id, stage_type, stage_label, series_number,
                home_team_id, away_team_id, game_date, arena_id, status,
                home_jersey_type, away_jersey_type
            ) VALUES (
                'official', $1, $2, $3, $4, $5, $6, $7, $8, 'scheduled', $9, $10
            ) RETURNING id
        `, [
            division_id, stage_type, stage_label || null, series_number || 1,
            home_team_id, away_team_id, game_date || null, arena_id || null,
            home_jersey_type, away_jersey_type
        ]);

        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Ошибка создания матча:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера при создании матча' });
    }
};

// --- ОБНОВЛЕНИЕ ИНФОРМАЦИИ И ТРАНСЛЯЦИЙ ---
export const updateGameInfo = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { 
            game_date, arena_id, stage_type, stage_label, series_number, 
            video_yt_url, video_vk_url, home_jersey_type, away_jersey_type 
        } = req.body;
        
        const gameRes = await pool.query('SELECT status FROM games WHERE id = $1', [gameId]);
        if(gameRes.rows.length === 0) return res.status(404).json({success: false, error: 'Матч не найден'});
        
        if (gameRes.rows[0].status === 'scheduled') {
            await pool.query(`
                UPDATE games SET 
                    game_date = $1, arena_id = $2, stage_type = $3, 
                    stage_label = $4, series_number = $5,
                    video_yt_url = $6, video_vk_url = $7,
                    home_jersey_type = $8, away_jersey_type = $9
                WHERE id = $10
            `, [game_date || null, arena_id || null, stage_type, stage_label, series_number, video_yt_url, video_vk_url, home_jersey_type, away_jersey_type, gameId]);
        } else {
            await pool.query(`
                UPDATE games SET video_yt_url = $1, video_vk_url = $2 WHERE id = $3
            `, [video_yt_url, video_vk_url, gameId]);
        }
        res.json({success: true});
    } catch (err) {
        console.error('Ошибка обновления инфо:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// --- СМЕНА СТАТУСА МАТЧА ---
export const updateGameStatus = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { status } = req.body;
        await pool.query('UPDATE games SET status = $1 WHERE id = $2', [status, gameId]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка смены статуса:', err);
        res.status(500).json({ success: false, error: 'Ошибка смены статуса' });
    }
};

// --- ПОЛУЧЕНИЕ РОСТЕРОВ НА МАТЧ ---
export const getGameRoster = async (req, res) => {
    try {
        const { gameId, teamId } = req.params;

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
                SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url, 
                       string_agg(tr.role, ', ') as roles
                FROM team_roles tr
                JOIN team_members tm ON tr.member_id = tm.id
                JOIN users u ON tm.user_id = u.id
                WHERE tm.team_id = $1 AND tr.left_at IS NULL
                GROUP BY u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url
            `, [teamId])
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

// --- СОХРАНЕНИЕ СОСТАВА НА МАТЧ ---
export const saveGameRoster = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId, teamId } = req.params;
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

// ==========================================
// ЭНДПОИНТЫ ДЛЯ СУДЕЙ И МЕДИА
// ==========================================
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

        await client.query('DELETE FROM game_referee WHERE game_id = $1', [gameId]);
        await client.query('DELETE FROM game_media WHERE game_id = $1', [gameId]);

        const refRoles = ['head_1', 'head_2', 'linesman_1', 'linesman_2', 'scorekeeper'];
        const refValues = [];
        const refParams = [];
        let paramIdx = 1;

        refRoles.forEach(role => {
            if (officials[role] && officials[role] !== '') {
                refValues.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
                refParams.push(gameId, officials[role], role);
            }
        });

        if (refValues.length > 0) {
            await client.query(`
                INSERT INTO game_referee (game_id, user_id, role) 
                VALUES ${refValues.join(', ')}
            `, refParams);
        }

        if (officials.media && officials.media !== '') {
            await client.query(`
                INSERT INTO game_media (game_id, user_id) 
                VALUES ($1, $2)
            `, [gameId, officials.media]);
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