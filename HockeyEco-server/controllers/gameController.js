import pool from '../config/db.js';

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

        // Получаем судей с АВАТАРКАМИ
        const refRes = await pool.query(`
            SELECT gr.role, u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url
            FROM game_referee gr
            JOIN users u ON gr.user_id = u.id
            WHERE gr.game_id = $1
        `, [gameId]);

        // Получаем медиа с АВАТАРКАМИ
        const mediaRes = await pool.query(`
            SELECT u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url
            FROM game_media gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.game_id = $1
            LIMIT 1
        `, [gameId]);

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

        const gameRes = await pool.query('SELECT division_id FROM games WHERE id = $1', [gameId]);
        if (gameRes.rows.length === 0) return res.status(404).json({ error: 'Матч не найден' });
        const divisionId = gameRes.rows[0].division_id;

        const ttRes = await pool.query('SELECT id FROM tournament_teams WHERE division_id = $1 AND team_id = $2', [divisionId, teamId]);
        if (ttRes.rows.length === 0) return res.status(404).json({ error: 'Команда не заявлена на турнир' });
        const tournamentTeamId = ttRes.rows[0].id;

        // ДОБАВЛЕНО: u.middle_name
        const tRosterRes = await pool.query(`
            SELECT tr.player_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tr.jersey_number, tr.position
            FROM tournament_rosters tr
            JOIN users u ON tr.player_id = u.id
            WHERE tr.tournament_team_id = $1 AND tr.application_status = 'approved' AND tr.period_end IS NULL
            ORDER BY u.last_name
        `, [tournamentTeamId]);

        // ДОБАВЛЕНО: u.middle_name
        const gRosterRes = await pool.query(`
            SELECT gr.player_id, gr.jersey_number, gr.position_in_line, gr.is_captain, gr.is_assistant,
                   u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url
            FROM game_rosters gr
            JOIN users u ON gr.player_id = u.id
            LEFT JOIN team_members tm ON tm.user_id = u.id AND tm.team_id = gr.team_id
            WHERE gr.game_id = $1 AND gr.team_id = $2
            ORDER BY u.last_name
        `, [gameId, teamId]);

        // ДОБАВЛЕНО: u.middle_name
        const staffRes = await pool.query(`
            SELECT u.id as user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url, 
                   string_agg(tr.role, ', ') as roles
            FROM team_roles tr
            JOIN team_members tm ON tr.member_id = tm.id
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = $1 AND tr.left_at IS NULL
            GROUP BY u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url, tm.photo_url
        `, [teamId]);

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

        for (const player of roster) {
            let posInLine = 'C'; 
            if (player.position === 'goalie') posInLine = 'G';
            if (player.position === 'defense') posInLine = 'LD';
            if (player.position === 'forward') posInLine = 'C';

            await client.query(`
                INSERT INTO game_rosters (
                    game_id, team_id, player_id, is_in_lineup,
                    line_number, position_in_line, jersey_number, is_captain, is_assistant
                ) VALUES ($1, $2, $3, true, 1, $4, $5, $6, $7)
            `, [
                gameId, teamId, player.player_id, posInLine,
                player.jersey_number || null, player.is_captain || false, player.is_assistant || false
            ]);
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

// Получить доступный персонал лиги (с АВАТАРКАМИ)
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

// Сохранить судейскую бригаду на матч
export const updateGameOfficials = async (req, res) => {
    const client = await pool.connect();
    try {
        const { gameId } = req.params;
        const { officials } = req.body;

        await client.query('BEGIN');

        // Очищаем старые назначения
        await client.query('DELETE FROM game_referee WHERE game_id = $1', [gameId]);
        await client.query('DELETE FROM game_media WHERE game_id = $1', [gameId]);

        // Вставляем судей и секретаря
        const refRoles = ['head_1', 'head_2', 'linesman_1', 'linesman_2', 'scorekeeper'];
        for (const role of refRoles) {
            if (officials[role] && officials[role] !== '') {
                await client.query(`
                    INSERT INTO game_referee (game_id, user_id, role) 
                    VALUES ($1, $2, $3)
                `, [gameId, officials[role], role]);
            }
        }

        // Вставляем медиа
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