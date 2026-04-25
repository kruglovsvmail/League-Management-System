import pool from '../config/db.js';

export const recalculateDivisionStandings = async (divisionId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Получаем правила турнира (берем из divisions, так как division_rules нет)
        const rulesRes = await client.query(`
            SELECT points_win_reg, points_win_ot, points_draw,
                   points_loss_ot, points_loss_reg, 
                   points_tech_win, points_tech_loss
            FROM divisions WHERE id = $1
        `, [divisionId]);

        const dbRules = rulesRes.rows[0] || {};

        const ptsWinReg = dbRules.points_win_reg ?? 3;
        const ptsWinOt = dbRules.points_win_ot ?? 2;
        const ptsWinSo = dbRules.points_win_ot ?? 2; 
        const ptsDraw = dbRules.points_draw ?? 1;
        const ptsLossReg = dbRules.points_loss_reg ?? 0;
        const ptsLossOt = dbRules.points_loss_ot ?? 1;
        const ptsLossSo = dbRules.points_loss_ot ?? 1;
        const ptsTechWin = dbRules.points_tech_win ?? 3;
        const ptsTechLoss = dbRules.points_tech_loss ?? 0;

        // Инициализируем статистику для всех команд дивизиона
        const teamsRes = await client.query('SELECT team_id FROM tournament_teams WHERE division_id = $1', [divisionId]);
        const stats = {};
        teamsRes.rows.forEach(t => {
            stats[t.team_id] = {
                games_played: 0, wins_reg: 0, wins_ot: 0, wins_so: 0,
                draws: 0, losses_so: 0, losses_ot: 0, losses_reg: 0,
                goals_for: 0, goals_against: 0, points: 0
            };
        });

        // Получаем все завершенные матчи
        const gamesRes = await client.query(`
            SELECT home_team_id, away_team_id, home_score, away_score, end_type, is_technical
            FROM games 
            WHERE division_id = $1 AND status = 'finished'
        `, [divisionId]);

        gamesRes.rows.forEach(game => {
            const home = game.home_team_id;
            const away = game.away_team_id;

            if (!stats[home] || !stats[away]) return;

            const homeScore = game.home_score || 0;
            const awayScore = game.away_score || 0;
            const endType = game.end_type || 'reg';

            stats[home].games_played += 1;
            stats[away].games_played += 1;

            if (game.is_technical) {
                const techStatus = game.is_technical; // '+/-', '-/+', '-/-'

                if (techStatus === '+/-') {
                    stats[home].wins_reg += 1;
                    stats[home].points += ptsTechWin;
                    stats[away].losses_reg += 1;
                    stats[away].points += ptsTechLoss;
                } else if (techStatus === '-/+') {
                    stats[away].wins_reg += 1;
                    stats[away].points += ptsTechWin;
                    stats[home].losses_reg += 1;
                    stats[home].points += ptsTechLoss;
                } else if (techStatus === '-/-') {
                    stats[home].losses_reg += 1;
                    stats[home].points += ptsTechLoss;
                    stats[away].losses_reg += 1;
                    stats[away].points += ptsTechLoss;
                }
                return;
            }

            stats[home].goals_for += homeScore;
            stats[home].goals_against += awayScore;
            stats[away].goals_for += awayScore;
            stats[away].goals_against += homeScore;

            if (homeScore > awayScore) {
                if (endType === 'reg') { stats[home].wins_reg += 1; stats[home].points += ptsWinReg; stats[away].losses_reg += 1; stats[away].points += ptsLossReg; }
                else if (endType === 'ot') { stats[home].wins_ot += 1; stats[home].points += ptsWinOt; stats[away].losses_ot += 1; stats[away].points += ptsLossOt; }
                else if (endType === 'so' || endType === 'pen') { stats[home].wins_so += 1; stats[home].points += ptsWinSo; stats[away].losses_so += 1; stats[away].points += ptsLossSo; }
            } else if (awayScore > homeScore) {
                if (endType === 'reg') { stats[away].wins_reg += 1; stats[away].points += ptsWinReg; stats[home].losses_reg += 1; stats[home].points += ptsLossReg; }
                else if (endType === 'ot') { stats[away].wins_ot += 1; stats[away].points += ptsWinOt; stats[home].losses_ot += 1; stats[home].points += ptsLossOt; }
                else if (endType === 'so' || endType === 'pen') { stats[away].wins_so += 1; stats[away].points += ptsWinSo; stats[home].losses_so += 1; stats[home].points += ptsLossSo; }
            } else {
                stats[home].draws += 1; stats[home].points += ptsDraw;
                stats[away].draws += 1; stats[away].points += ptsDraw;
            }
        });

        // Записываем обновленные данные в division_standings
        for (const [teamId, data] of Object.entries(stats)) {
            await client.query(`
                INSERT INTO division_standings 
                (division_id, team_id, games_played, wins_reg, wins_ot, draws, losses_ot, losses_reg, goals_for, goals_against, points, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                ON CONFLICT (division_id, team_id) 
                DO UPDATE SET
                    games_played = EXCLUDED.games_played,
                    wins_reg = EXCLUDED.wins_reg, 
                    wins_ot = EXCLUDED.wins_ot, 
                    draws = EXCLUDED.draws, 
                    losses_ot = EXCLUDED.losses_ot, 
                    losses_reg = EXCLUDED.losses_reg,
                    goals_for = EXCLUDED.goals_for, 
                    goals_against = EXCLUDED.goals_against, 
                    points = EXCLUDED.points,
                    updated_at = NOW()
            `, [
                divisionId, teamId, data.games_played, data.wins_reg, 
                data.wins_ot + data.wins_so, // Буллиты суммируем с ОТ, так как в БД нет отдельной колонки
                data.draws, 
                data.losses_ot + data.losses_so, // То же самое для поражений
                data.losses_reg,
                data.goals_for, data.goals_against, data.points
            ]);
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка в recalculateDivisionStandings:', err);
        throw err;
    } finally {
        client.release();
    }
};