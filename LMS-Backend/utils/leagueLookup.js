// LMS-Backend/utils/leagueLookup.js
import pool from '../config/db.js';

export async function getLeagueIdForGame(gameId) {
    const res = await pool.query(`
        SELECT s.league_id
        FROM games g
        JOIN divisions d ON g.division_id = d.id
        JOIN seasons s ON d.season_id = s.id
        WHERE g.id = $1
    `, [gameId]);

    if (res.rows.length === 0) return null;
    return res.rows[0].league_id;
}
