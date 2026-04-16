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
                    'paper_roster_team_url', tt.paper_roster_team_url,
                    'paper_roster_league_url', tt.paper_roster_league_url,
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
            points_loss_ot, points_loss_reg, points_tech_win, points_tech_loss, points_tech_draw, 
            ranking_criteria, 
            reg_periods_count, reg_period_length, reg_has_overtime, reg_ot_length, reg_has_shootouts, reg_so_length, reg_track_plus_minus,
            playoff_periods_count, playoff_period_length, playoff_has_overtime, playoff_ot_length, playoff_has_shootouts, playoff_so_length, playoff_track_plus_minus,
            req_med_cert, req_insurance, req_consent, digital_applications_only
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
                points_loss_ot, points_loss_reg, points_tech_win, points_tech_loss, points_tech_draw,
                ranking_criteria, is_published, 
                reg_periods_count, reg_period_length, reg_has_overtime, reg_ot_length, reg_has_shootouts, reg_so_length, reg_track_plus_minus,
                playoff_periods_count, playoff_period_length, playoff_has_overtime, playoff_ot_length, playoff_has_shootouts, playoff_so_length, playoff_track_plus_minus,
                req_med_cert, req_insurance, req_consent, digital_applications_only
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 
                false, 
                $21, $22, $23, $24, $25, $26, $27, 
                $28, $29, $30, $31, $32, $33, $34,
                $35, $36, $37, $38
            )
            RETURNING id
        `, [
            seasonId, name, short_name, tournament_type,
            start_date || null, end_date || null,
            application_start || null, application_end || null,
            transfer_start || null, transfer_end || null,
            description,
            points_win_reg, points_win_ot, points_draw,
            points_loss_ot, points_loss_reg, points_tech_win, points_tech_loss, points_tech_draw,
            ranking_criteria ? JSON.stringify(ranking_criteria) : null,
            reg_periods_count ?? 3, reg_period_length ?? 20, reg_has_overtime ?? true, reg_ot_length ?? 5, reg_has_shootouts ?? true, reg_so_length ?? 3, reg_track_plus_minus ?? false,
            playoff_periods_count ?? 3, playoff_period_length ?? 20, playoff_has_overtime ?? true, playoff_ot_length ?? 20, playoff_has_shootouts ?? false, playoff_so_length ?? 0, playoff_track_plus_minus ?? false,
            req_med_cert ?? true, req_insurance ?? true, req_consent ?? true, digital_applications_only !== undefined ? digital_applications_only : true
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
            points_loss_reg, points_tech_win, points_tech_loss, points_tech_draw, ranking_criteria, 
            reg_periods_count, reg_period_length, reg_has_overtime, reg_ot_length, reg_has_shootouts, reg_so_length, reg_track_plus_minus,
            playoff_periods_count, playoff_period_length, playoff_has_overtime, playoff_ot_length, playoff_has_shootouts, playoff_so_length, playoff_track_plus_minus,
            req_med_cert, req_insurance, req_consent, digital_applications_only, clear_logo, clear_regulations
        } = req.body;

        if (checkOverlap(application_start, application_end, transfer_start, transfer_end)) {
            return res.status(400).json({ success: false, error: 'Периоды заявочной кампании и трансферного окна не могут пересекаться' });
        }

        await pool.query(`
            UPDATE divisions SET 
                name = $1, short_name = $2, tournament_type = $3, start_date = $4, end_date = $5,
                application_start = $6, application_end = $7, transfer_start = $8, transfer_end = $9,
                description = $10, points_win_reg = $11, points_win_ot = $12, points_draw = $13,
                points_loss_ot = $14, points_loss_reg = $15, points_tech_win = $16, points_tech_loss = $17, points_tech_draw = $18,
                ranking_criteria = $19,
                reg_periods_count = $21, reg_period_length = $22, reg_has_overtime = $23, reg_ot_length = $24, reg_has_shootouts = $25, reg_so_length = $26, reg_track_plus_minus = $27,
                playoff_periods_count = $28, playoff_period_length = $29, playoff_has_overtime = $30, playoff_ot_length = $31, playoff_has_shootouts = $32, playoff_so_length = $33, playoff_track_plus_minus = $34,
                req_med_cert = $35, req_insurance = $36, req_consent = $37, digital_applications_only = $38
            WHERE id = $20
        `, [
            name, short_name, tournament_type, start_date || null, end_date || null, application_start || null, application_end || null,
            transfer_start || null, transfer_end || null, description, points_win_reg, points_win_ot, points_draw,
            points_loss_ot, points_loss_reg, points_tech_win, points_tech_loss, points_tech_draw, 
            ranking_criteria ? JSON.stringify(ranking_criteria) : null, id,
            reg_periods_count, reg_period_length, reg_has_overtime, reg_ot_length, reg_has_shootouts, reg_so_length, reg_track_plus_minus,
            playoff_periods_count, playoff_period_length, playoff_has_overtime, playoff_ot_length, playoff_has_shootouts, playoff_so_length, playoff_track_plus_minus,
            req_med_cert, req_insurance, req_consent, digital_applications_only
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
        
        const bracketsRes = await pool.query('SELECT * FROM playoff_brackets WHERE division_id = $1 ORDER BY is_main DESC, id ASC', [id]);
        const brackets = bracketsRes.rows;

        for (let b of brackets) {
            const roundsRes = await pool.query('SELECT * FROM playoff_rounds WHERE bracket_id = $1 ORDER BY order_index ASC', [b.id]);
            b.rounds = roundsRes.rows;

            const matchupsRes = await pool.query(`
                SELECT m.*, 
                       t1.name as team1_name, t1.short_name as team1_short, t1.logo_url as team1_logo,
                       t2.name as team2_name, t2.short_name as team2_short, t2.logo_url as team2_logo,
                       tw.name as winner_name
                FROM playoff_matchups m
                LEFT JOIN teams t1 ON m.team1_id = t1.id
                LEFT JOIN teams t2 ON m.team2_id = t2.id
                LEFT JOIN teams tw ON m.winner_id = tw.id
                WHERE m.round_id IN (SELECT id FROM playoff_rounds WHERE bracket_id = $1)
                ORDER BY m.matchup_number ASC
            `, [b.id]);
            
            b.rounds.forEach(r => {
                r.matchups = matchupsRes.rows.filter(m => m.round_id === r.id);
            });
        }
        
        const teamsRes = await pool.query(`
            SELECT t.id, t.name, t.logo_url
            FROM tournament_teams tt
            JOIN teams t ON tt.team_id = t.id
            WHERE tt.division_id = $1 AND tt.status = 'approved'
            ORDER BY t.name
        `, [id]);

        const gamesRes = await pool.query(`
            SELECT id, home_team_id, away_team_id, home_score, away_score, status, series_number, end_type, game_date, is_technical, stage_label
            FROM games
            WHERE division_id = $1 AND stage_type = 'playoff' AND status != 'cancelled'
            ORDER BY series_number ASC, game_date ASC
        `, [id]);

        res.json({ 
            success: true, 
            brackets, 
            allTeams: teamsRes.rows, 
            games: gamesRes.rows 
        });
    } catch (err) {
        console.error('Ошибка получения сетки плей-офф:', err);
        res.status(500).json({ success: false, error: 'Ошибка получения сетки плей-офф' });
    }
};

export const savePlayoffConstructor = async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;
        const { brackets } = req.body; 

        await client.query('BEGIN');

        const gamesRes = await client.query(`
            SELECT id, home_team_id, away_team_id, status, stage_label 
            FROM games 
            WHERE division_id = $1 AND stage_type = 'playoff' AND status != 'cancelled'
            ORDER BY id DESC
        `, [id]);
        
        const playoffGames = gamesRes.rows;
        const gamesToCancel = [];

        for (const b of brackets) {
            for (const r of b.rounds) {
                const maxGames = (r.wins_needed * 2) - 1;
                const roundGames = playoffGames.filter(g => g.stage_label === r.name);
                const pairGroups = {};
                
                roundGames.forEach(g => {
                    if (!g.home_team_id || !g.away_team_id) return;
                    
                    const pairKey = [g.home_team_id, g.away_team_id].sort().join('-');
                    if (!pairGroups[pairKey]) pairGroups[pairKey] = { played: 0, scheduled: [] };
                    
                    if (g.status === 'live' || g.status === 'finished') {
                        pairGroups[pairKey].played++;
                    } else if (g.status === 'scheduled') {
                        pairGroups[pairKey].scheduled.push(g.id);
                    }
                });

                for (const pairKey in pairGroups) {
                    const group = pairGroups[pairKey];
                    
                    if (group.played > maxGames) {
                        await client.query('ROLLBACK');
                        return res.status(400).json({
                            success: false,
                            error: `В раунде "${r.name}" уже проведено ${group.played} матчей в рамках одной серии. Сначала удалите сыгранные матчи.`
                        });
                    }
                    
                    const totalActive = group.played + group.scheduled.length;
                    if (totalActive > maxGames) {
                        const excess = totalActive - maxGames;
                        for (let i = 0; i < excess; i++) {
                            gamesToCancel.push(group.scheduled[i]);
                        }
                    }
                }
            }
        }

        if (gamesToCancel.length > 0) {
            await client.query(`UPDATE games SET status = 'cancelled' WHERE id = ANY($1::int[])`, [gamesToCancel]);
        }

        await client.query('DELETE FROM playoff_brackets WHERE division_id = $1', [id]);

        const matchupMap = {}; 
        const updates = []; 

        for (const b of brackets) {
            const bRes = await client.query(
                `INSERT INTO playoff_brackets (division_id, name, is_main) VALUES ($1, $2, $3) RETURNING id`, 
                [id, b.name, b.is_main]
            );
            const bracketId = bRes.rows[0].id;

            for (const r of b.rounds) {
                const rRes = await client.query(
                    `INSERT INTO playoff_rounds (bracket_id, name, order_index, wins_needed, ui_metadata) 
                     VALUES ($1, $2, $3, $4, $5) RETURNING id`, 
                    [bracketId, r.name, r.order_index, r.wins_needed, r.ui_metadata || {}]
                );
                const roundId = rRes.rows[0].id;

                for (const m of r.matchups) {
                    const t1SourceId = ['seed', 'manual'].includes(m.team1_source_type) ? m.team1_source_id : null;
                    const t2SourceId = ['seed', 'manual'].includes(m.team2_source_type) ? m.team2_source_id : null;

                    const mRes = await client.query(`
                        INSERT INTO playoff_matchups (
                            round_id, matchup_number, 
                            team1_source_type, team1_source_id, 
                            team2_source_type, team2_source_id,
                            ui_metadata
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
                    `, [roundId, m.matchup_number, m.team1_source_type, t1SourceId, m.team2_source_type, t2SourceId, m.ui_metadata || {}]);
                    
                    const matchupId = mRes.rows[0].id;
                    
                    if (m.tempId) matchupMap[m.tempId] = matchupId; 

                    if (['winner_of', 'loser_of'].includes(m.team1_source_type)) {
                        updates.push({ matchupId, field: 'team1_source_id', tempRef: m.team1_source_ref });
                    }
                    if (['winner_of', 'loser_of'].includes(m.team2_source_type)) {
                        updates.push({ matchupId, field: 'team2_source_id', tempRef: m.team2_source_ref });
                    }
                }
            }
        } 

        for (const update of updates) {
            const realSourceId = matchupMap[update.tempRef];
            if (realSourceId) {
                await client.query(`
                    UPDATE playoff_matchups SET ${update.field} = $1 WHERE id = $2
                `, [realSourceId, update.matchupId]);
            }
        }

        await client.query('COMMIT');
        await recalculatePlayoffs(id);

        res.json({ success: true });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка сохранения конструктора плей-офф:', err);
        res.status(500).json({ success: false, error: err.message || 'Ошибка сохранения сетки' });
    } finally {
        client.release();
    }
};

export const updatePlayoffMatchup = async (req, res) => {
    try {
        const { id, matchupId } = req.params;
        const { team1_id, team2_id } = req.body;
        
        await pool.query(`
            UPDATE playoff_matchups 
            SET team1_id = $1, team2_id = $2 
            WHERE id = $3
        `, [team1_id || null, team2_id || null, matchupId]);
        
        await recalculatePlayoffs(id);

        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления пары:', err);
        res.status(500).json({ success: false, error: 'Ошибка обновления' });
    }
};