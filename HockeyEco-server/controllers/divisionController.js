import pool from '../config/db.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';
import { recalculatePlayoffs } from '../utils/playoffCalculator.js';

const checkOverlap = (appStart, appEnd, trStart, trEnd) => {
    if (!appStart || !appEnd || !trStart || !trEnd) return false;
    const as = new Date(appStart);
    const ae = new Date(appEnd);
    const ts = new Date(trStart);
    const te = new Date(trEnd);
    return (as <= te) && (ae >= ts);
};

export const getSeasons = async (req, res) => {
    try {
        const { leagueId } = req.params;
        const result = await pool.query(
            `SELECT id, name, is_active FROM seasons WHERE league_id = $1 ORDER BY start_date DESC`, 
            [leagueId]
        );
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения сезонов:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки сезонов' });
    }
};

export const getDivisions = async (req, res) => {
    try {
        const { seasonId } = req.params;
        
        const result = await pool.query(`
            WITH DivTeams AS (
                SELECT division_id, COUNT(*) as cnt 
                FROM tournament_teams 
                WHERE status = 'approved' 
                GROUP BY division_id
            ),
            DivPlayers AS (
                SELECT tt.division_id, COUNT(*) as cnt
                FROM tournament_rosters tr
                JOIN tournament_teams tt ON tr.tournament_team_id = tt.id
                WHERE tt.status = 'approved' AND tr.application_status = 'approved' AND tr.period_end IS NULL
                GROUP BY tt.division_id
            ),
            DivGames AS (
                SELECT division_id, COUNT(*) as cnt 
                FROM games 
                WHERE status = 'finished' 
                GROUP BY division_id
            ),
            TeamStats AS (
                SELECT tt.division_id, json_agg(json_build_object(
                    'id', tt.id,
                    'team_id', t.id,
                    'status', tt.status,
                    'name', t.name,
                    'short_name', t.short_name,
                    'city', t.city,
                    'logo_url', t.logo_url,
                    'custom_jersey_light_url', tt.custom_jersey_light_url,
                    'custom_jersey_dark_url', tt.custom_jersey_dark_url,
                    'jersey_light_url', t.jersey_light_url,
                    'jersey_dark_url', t.jersey_dark_url,
                    'custom_description', tt.custom_description,
                    'description', t.description,
                    'custom_team_photo_url', tt.custom_team_photo_url,
                    'team_photo_url', t.team_photo_url,
                    'players_count', (
                        SELECT COUNT(*) FROM tournament_rosters tr2 
                        WHERE tr2.tournament_team_id = tt.id AND tr2.application_status = 'approved' AND tr2.period_end IS NULL
                    ),
                    'avg_age', (
                        SELECT ROUND(AVG(EXTRACT(YEAR FROM age(CURRENT_DATE, u.birth_date))))
                        FROM tournament_rosters tr3 
                        JOIN users u ON tr3.player_id = u.id 
                        WHERE tr3.tournament_team_id = tt.id AND tr3.application_status = 'approved' AND tr3.period_end IS NULL
                    )
                ) ORDER BY t.name) as teams
                FROM tournament_teams tt
                JOIN teams t ON tt.team_id = t.id
                GROUP BY tt.division_id
            )
            SELECT 
                d.*,
                COALESCE(dt.cnt, 0) as approved_teams_count,
                COALESCE(dp.cnt, 0) as approved_players_count,
                COALESCE(dg.cnt, 0) as finished_games_count,
                COALESCE(ts.teams, '[]'::json) as teams
            FROM divisions d
            LEFT JOIN DivTeams dt ON d.id = dt.division_id
            LEFT JOIN DivPlayers dp ON d.id = dp.division_id
            LEFT JOIN DivGames dg ON d.id = dg.division_id
            LEFT JOIN TeamStats ts ON d.id = ts.division_id
            WHERE d.season_id = $1
            ORDER BY d.id
        `, [seasonId]);
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения дивизионов:', err);
        res.status(500).json({ success: false, error: 'Ошибка получения дивизионов' });
    }
};

export const createDivision = async (req, res) => {
    try {
        const { seasonId } = req.params;
        const {
            name, short_name, tournament_type, start_date, end_date,
            application_start, application_end, transfer_start, transfer_end,
            description, points_win_reg, points_win_ot, points_draw,
            points_loss_ot, points_loss_reg, ranking_criteria,
            playoff_start_round, has_third_place,
            wins_needed_1_8, wins_needed_1_4, wins_needed_1_2,
            wins_needed_final, wins_needed_3rd
        } = req.body;

        if (checkOverlap(application_start, application_end, transfer_start, transfer_end)) {
            return res.status(400).json({ success: false, error: 'Периоды заявочной кампании и трансферного окна не могут пересекаться' });
        }

        const result = await pool.query(`
            INSERT INTO divisions (
                season_id, name, short_name, tournament_type,
                start_date, end_date, application_start, application_end,
                transfer_start, transfer_end, description,
                points_win_reg, points_win_ot, points_draw,
                points_loss_ot, points_loss_reg, ranking_criteria,
                playoff_start_round, has_third_place,
                wins_needed_1_8, wins_needed_1_4, wins_needed_1_2,
                wins_needed_final, wins_needed_3rd,
                is_published
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, false)
            RETURNING id
        `, [
            seasonId, name, short_name, tournament_type,
            start_date || null, end_date || null,
            application_start || null, application_end || null,
            transfer_start || null, transfer_end || null,
            description,
            points_win_reg, points_win_ot, points_draw,
            points_loss_ot, points_loss_reg,
            ranking_criteria ? JSON.stringify(ranking_criteria) : null,
            playoff_start_round, has_third_place,
            wins_needed_1_8, wins_needed_1_4, wins_needed_1_2,
            wins_needed_final, wins_needed_3rd
        ]);

        res.json({ success: true, id: result.rows[0].id });
    } catch (err) {
        console.error('Ошибка создания дивизиона:', err);
        res.status(500).json({ success: false, error: 'Ошибка создания дивизиона' });
    }
};

export const updateDivision = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            name, short_name, tournament_type, start_date, end_date, application_start, application_end,
            transfer_start, transfer_end, description, points_win_reg, points_win_ot, points_draw, points_loss_ot,
            points_loss_reg, ranking_criteria, playoff_start_round, has_third_place, wins_needed_1_8, wins_needed_1_4,
            wins_needed_1_2, wins_needed_final, wins_needed_3rd, clear_logo, clear_regulations
        } = req.body;

        if (checkOverlap(application_start, application_end, transfer_start, transfer_end)) {
            return res.status(400).json({ success: false, error: 'Периоды заявочной кампании и трансферного окна не могут пересекаться' });
        }

        await pool.query(`
            UPDATE divisions SET 
                name = $1, short_name = $2, tournament_type = $3, start_date = $4, end_date = $5,
                application_start = $6, application_end = $7, transfer_start = $8, transfer_end = $9,
                description = $10, points_win_reg = $11, points_win_ot = $12, points_draw = $13,
                points_loss_ot = $14, points_loss_reg = $15, ranking_criteria = $16, playoff_start_round = $17,
                has_third_place = $18, wins_needed_1_8 = $19, wins_needed_1_4 = $20, wins_needed_1_2 = $21,
                wins_needed_final = $22, wins_needed_3rd = $23
            WHERE id = $24
        `, [
            name, short_name, tournament_type, start_date || null, end_date || null, application_start || null, application_end || null,
            transfer_start || null, transfer_end || null, description, points_win_reg, points_win_ot, points_draw,
            points_loss_ot, points_loss_reg, ranking_criteria ? JSON.stringify(ranking_criteria) : null, playoff_start_round, has_third_place,
            wins_needed_1_8, wins_needed_1_4, wins_needed_1_2, wins_needed_final, wins_needed_3rd, id
        ]);

        if (clear_logo) {
            await pool.query(`UPDATE divisions SET logo_url = NULL WHERE id = $1`, [id]);
        }
        if (clear_regulations) {
            await pool.query(`UPDATE divisions SET regulations_url = NULL WHERE id = $1`, [id]);
        }

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления дивизиона:', err);
        res.status(500).json({ success: false, error: 'Ошибка обновления дивизиона' });
    }
};

export const updateDivisionPublish = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_published } = req.body;
        await pool.query(`UPDATE divisions SET is_published = $1 WHERE id = $2`, [is_published, id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка публикации:', err);
        res.status(500).json({ success: false, error: 'Ошибка смены статуса публикации' });
    }
};

export const deleteDivision = async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query(`DELETE FROM divisions WHERE id = $1`, [id]);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления:', err);
        res.status(500).json({ success: false, error: 'Ошибка удаления дивизиона' });
    }
};

export const uploadDivisionFile = async (req, res) => {
    try {
        const { id, type } = req.params;
        if (!req.file) return res.status(400).json({ success: false, error: 'Файл не найден' });
        const ext = req.file.originalname.split('.').pop();
        const prefix = type === 'logo' ? 'logo' : 'regulations';
        
        const timestamp = Date.now();
        const fileName = `uploads/${prefix}_divisions_${id}_${timestamp}.${ext}`;
        
        await s3.send(new PutObjectCommand({
            Bucket: 'hockeyeco-uploads',
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        }));
        
        const url = `https://s3.twcstorage.ru/hockeyeco-uploads/${fileName}`;
        const column = type === 'logo' ? 'logo_url' : 'regulations_url';
        await pool.query(`UPDATE divisions SET ${column} = $1 WHERE id = $2`, [url, id]);

        res.json({ success: true, url });
    } catch (err) {
        console.error('Ошибка загрузки файла дивизиона в S3:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

export const getDivisionTeams = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT tt.id, tt.team_id, t.name 
            FROM tournament_teams tt
            JOIN teams t ON tt.team_id = t.id
            WHERE tt.division_id = $1 AND tt.status = 'approved'
            ORDER BY t.name
        `, [id]);
        res.json({ success: true, teams: result.rows });
    } catch (err) {
        console.error('Ошибка загрузки команд:', err);
        res.status(500).json({ success: false, error: 'Ошибка загрузки команд' });
    }
};

export const getDivisionStandings = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT 
                ds.id,
                ds.team_id,
                ds.games_played,
                ds.wins_reg,
                ds.wins_ot,
                ds.draws,
                ds.losses_ot,
                ds.losses_reg,
                ds.goals_for,
                ds.goals_against,
                ds.points,
                ds.rank,
                (ds.goals_for - ds.goals_against) as goals_diff,
                t.name as team_name,
                t.short_name,
                t.logo_url
            FROM division_standings ds
            JOIN teams t ON ds.team_id = t.id
            JOIN tournament_teams tt ON tt.team_id = t.id AND tt.division_id = ds.division_id
            WHERE ds.division_id = $1 
              AND tt.status = 'approved'
            ORDER BY ds.rank ASC
        `, [id]);
        
        res.json({ success: true, data: result.rows });
    } catch (err) {
        console.error('Ошибка получения турнирной таблицы:', err);
        res.status(500).json({ success: false, error: 'Ошибка получения турнирной таблицы' });
    }
};

export const getPlayoffBracket = async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                dp.id, ds.playoff_start_round, ds.has_third_place,
                dp.stage, dp.matchup_number, 
                dp.team1_id, dp.team2_id, dp.team1_wins, dp.team2_wins, dp.winner_id,
                t1.name as team1_name, t1.short_name as team1_short, t1.logo_url as team1_logo,
                t2.name as team2_name, t2.short_name as team2_short, t2.logo_url as team2_logo,
                tw.name as winner_name
            FROM division_playoff dp
            JOIN divisions ds ON dp.division_id = ds.id
            LEFT JOIN teams t1 ON dp.team1_id = t1.id
            LEFT JOIN teams t2 ON dp.team2_id = t2.id
            LEFT JOIN teams tw ON dp.winner_id = tw.id
            WHERE dp.division_id = $1
            ORDER BY dp.stage, dp.matchup_number ASC
        `;
        
        const result = await pool.query(query, [id]);
        
        const teamsRes = await pool.query(`
            SELECT t.id, t.name, t.logo_url
            FROM tournament_teams tt
            JOIN teams t ON tt.team_id = t.id
            WHERE tt.division_id = $1 AND tt.status = 'approved'
            ORDER BY t.name
        `, [id]);

        const gamesRes = await pool.query(`
            SELECT id, home_team_id, away_team_id, home_score, away_score, status, series_number, end_type, game_date
            FROM games
            WHERE division_id = $1 AND stage_type = 'playoff' AND status != 'cancelled'
            ORDER BY series_number ASC, game_date ASC
        `, [id]);

        res.json({ 
            success: true, 
            bracket: result.rows, 
            allTeams: teamsRes.rows, 
            games: gamesRes.rows 
        });
    } catch (err) {
        console.error('Ошибка получения сетки плей-офф:', err);
        res.status(500).json({ success: false, error: 'Ошибка получения сетки плей-офф' });
    }
};

export const generatePlayoffBracket = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        
        await client.query('BEGIN');

        const divRes = await client.query('SELECT playoff_start_round, has_third_place FROM divisions WHERE id = $1', [id]);
        if (divRes.rows.length === 0) throw new Error('Дивизион не найден');
        
        const { playoff_start_round, has_third_place } = divRes.rows[0];
        if (!playoff_start_round) throw new Error('В настройках дивизиона не указана стадия старта плей-офф');

        let teamsNeeded = 0;
        let stages = [];
        
        if (playoff_start_round === '1/8') { teamsNeeded = 16; stages = ['1/8', '1/4', '1/2', 'final']; }
        else if (playoff_start_round === '1/4') { teamsNeeded = 8; stages = ['1/4', '1/2', 'final']; }
        else if (playoff_start_round === '1/2') { teamsNeeded = 4; stages = ['1/2', 'final']; }
        else if (playoff_start_round === 'final') { teamsNeeded = 2; stages = ['final']; }
        else throw new Error('Некорректная стадия старта');

        const standingsRes = await client.query(`
            SELECT team_id FROM division_standings 
            WHERE division_id = $1 ORDER BY rank ASC LIMIT $2
        `, [id, teamsNeeded]);

        const topTeams = standingsRes.rows.map(r => r.team_id);
        
        await client.query('DELETE FROM division_playoff WHERE division_id = $1', [id]);

        const pairingsMap = {
            16: [[1,16], [8,9], [4,13], [5,12], [2,15], [7,10], [3,14], [6,11]],
            8:  [[1,8], [4,5], [2,7], [3,6]],
            4:  [[1,4], [2,3]],
            2:  [[1,2]]
        };

        const matchups = pairingsMap[teamsNeeded];
        
        for (let i = 0; i < matchups.length; i++) {
            const seed1 = matchups[i][0] - 1; 
            const seed2 = matchups[i][1] - 1;
            
            const team1_id = topTeams[seed1] || null;
            const team2_id = topTeams[seed2] || null;

            await client.query(`
                INSERT INTO division_playoff (division_id, stage, matchup_number, team1_id, team2_id)
                VALUES ($1, $2, $3, $4, $5)
            `, [id, playoff_start_round, i + 1, team1_id, team2_id]);
        }

        const emptyStages = stages.filter(s => s !== playoff_start_round);
        for (const stage of emptyStages) {
            const matchCount = stage === '1/4' ? 4 : stage === '1/2' ? 2 : 1;
            for (let i = 1; i <= matchCount; i++) {
                await client.query(`
                    INSERT INTO division_playoff (division_id, stage, matchup_number, team1_id, team2_id)
                    VALUES ($1, $2, $3, NULL, NULL)
                `, [id, stage, i]);
            }
        }

        if (has_third_place) {
            await client.query(`
                INSERT INTO division_playoff (division_id, stage, matchup_number, team1_id, team2_id)
                VALUES ($1, '3rd_place', 1, NULL, NULL)
            `, [id]);
        }

        await client.query('COMMIT');
        res.json({ success: true });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка генерации сетки:', err);
        res.status(500).json({ success: false, error: err.message || 'Ошибка генерации сетки' });
    } finally {
        client.release();
    }
};

export const updatePlayoffMatchup = async (req, res) => {
    try {
        const { id, matchupId } = req.params;
        const { team1_id, team2_id } = req.body;
        
        await pool.query(`
            UPDATE division_playoff 
            SET team1_id = $1, team2_id = $2 
            WHERE id = $3 AND division_id = $4
        `, [team1_id || null, team2_id || null, matchupId, id]);
        
        // ВАЖНО: После ручного вмешательства админа мы пересчитываем дерево,
        // чтобы сохранить консистентность, если там уже сыграны матчи.
        await recalculatePlayoffs(id);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления пары:', err);
        res.status(500).json({ success: false, error: 'Ошибка обновления' });
    }
};