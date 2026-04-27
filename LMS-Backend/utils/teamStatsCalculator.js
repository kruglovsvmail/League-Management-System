import pool from '../config/db.js';

export const recalculateTeamStatistics = async (teamIds) => {
    if (!teamIds || teamIds.length === 0) return;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Создаем мощный агрегирующий запрос только для нужных команд
        // Мы используем ON CONFLICT (team_id) DO UPDATE для обновления или вставки
        await client.query(`
            WITH TeamStats AS (
                SELECT 
                    t.id AS team_id,
                    
                    -- ОФИЦИАЛЬНЫЕ МАТЧИ
                    COUNT(g.id) FILTER (
                        WHERE g.game_type = 'official' AND g.status = 'finished' AND g.is_technical is null
                    ) AS off_gp,
                    
                    COUNT(g.id) FILTER (
                        WHERE g.game_type = 'official' AND g.status = 'finished' AND g.is_technical is null AND
                        ((g.home_team_id = t.id AND g.home_score > g.away_score) OR 
                         (g.away_team_id = t.id AND g.away_score > g.home_score))
                    ) AS off_w,
                    
                    COUNT(g.id) FILTER (
                        WHERE g.game_type = 'official' AND g.status = 'finished' AND g.is_technical is null AND 
                        g.home_score = g.away_score
                    ) AS off_d,
                    
                    COUNT(g.id) FILTER (
                        WHERE g.game_type = 'official' AND g.status = 'finished' AND g.is_technical is null AND
                        ((g.home_team_id = t.id AND g.home_score < g.away_score) OR 
                         (g.away_team_id = t.id AND g.away_score < g.home_score))
                    ) AS off_l,
                    
                    COALESCE(SUM(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.away_score END) FILTER (
                        WHERE g.game_type = 'official' AND g.status = 'finished' AND g.is_technical is null
                    ), 0) AS off_gf,
                    
                    COALESCE(SUM(CASE WHEN g.home_team_id = t.id THEN g.away_score ELSE g.home_score END) FILTER (
                        WHERE g.game_type = 'official' AND g.status = 'finished' AND g.is_technical is null
                    ), 0) AS off_ga,

                    -- ТОВАРИЩЕСКИЕ МАТЧИ
                    COUNT(g.id) FILTER (
                        WHERE g.game_type IN ('friendly_pwa', 'friendly_ext') AND g.status = 'finished' AND g.is_technical is null
                    ) AS fr_gp,
                    
                    COUNT(g.id) FILTER (
                        WHERE g.game_type IN ('friendly_pwa', 'friendly_ext') AND g.status = 'finished' AND g.is_technical is null AND
                        ((g.home_team_id = t.id AND g.home_score > g.away_score) OR 
                         (g.away_team_id = t.id AND g.away_score > g.home_score))
                    ) AS fr_w,
                    
                    COUNT(g.id) FILTER (
                        WHERE g.game_type IN ('friendly_pwa', 'friendly_ext') AND g.status = 'finished' AND g.is_technical is null AND 
                        g.home_score = g.away_score
                    ) AS fr_d,
                    
                    COUNT(g.id) FILTER (
                        WHERE g.game_type IN ('friendly_pwa', 'friendly_ext') AND g.status = 'finished' AND g.is_technical is null AND
                        ((g.home_team_id = t.id AND g.home_score < g.away_score) OR 
                         (g.away_team_id = t.id AND g.away_score < g.home_score))
                    ) AS fr_l,
                    
                    COALESCE(SUM(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.away_score END) FILTER (
                        WHERE g.game_type IN ('friendly_pwa', 'friendly_ext') AND g.status = 'finished' AND g.is_technical is null
                    ), 0) AS fr_gf,
                    
                    COALESCE(SUM(CASE WHEN g.home_team_id = t.id THEN g.away_score ELSE g.home_score END) FILTER (
                        WHERE g.game_type IN ('friendly_pwa', 'friendly_ext') AND g.status = 'finished' AND g.is_technical is null
                    ), 0) AS fr_ga

                FROM teams t
                LEFT JOIN games g ON (t.id = g.home_team_id OR t.id = g.away_team_id)
                WHERE t.id = ANY($1::int[])
                GROUP BY t.id
            )
            INSERT INTO team_statistics (
                team_id, 
                official_games_played, official_wins, official_draws, official_losses, official_goals_for, official_goals_against,
                friendly_games_played, friendly_wins, friendly_draws, friendly_losses, friendly_goals_for, friendly_goals_against,
                updated_at
            )
            SELECT 
                team_id, 
                off_gp, off_w, off_d, off_l, off_gf, off_ga,
                fr_gp, fr_w, fr_d, fr_l, fr_gf, fr_ga,
                NOW()
            FROM TeamStats
            ON CONFLICT (team_id) DO UPDATE SET
                official_games_played = EXCLUDED.official_games_played,
                official_wins = EXCLUDED.official_wins,
                official_draws = EXCLUDED.official_draws,
                official_losses = EXCLUDED.official_losses,
                official_goals_for = EXCLUDED.official_goals_for,
                official_goals_against = EXCLUDED.official_goals_against,
                friendly_games_played = EXCLUDED.friendly_games_played,
                friendly_wins = EXCLUDED.friendly_wins,
                friendly_draws = EXCLUDED.friendly_draws,
                friendly_losses = EXCLUDED.friendly_losses,
                friendly_goals_for = EXCLUDED.friendly_goals_for,
                friendly_goals_against = EXCLUDED.friendly_goals_against,
                updated_at = EXCLUDED.updated_at;
        `, [teamIds]);

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка при пересчете статистики команд:', error);
        throw error;
    } finally {
        client.release();
    }
};