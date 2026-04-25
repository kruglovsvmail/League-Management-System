import pool from '../config/db.js';

export const recalculatePlayoffs = async (divisionId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Получаем все пары плей-офф через JOIN с раундами и сетками (строго по вашей БД)
        const matchupsRes = await client.query(`
            SELECT pm.id, pm.team1_id, pm.team2_id, pm.winner_id, pm.matchup_number,
                   pr.id as round_id, pr.wins_needed, pr.order_index, pr.bracket_id
            FROM playoff_matchups pm
            JOIN playoff_rounds pr ON pm.round_id = pr.id
            JOIN playoff_brackets pb ON pr.bracket_id = pb.id
            WHERE pb.division_id = $1
            ORDER BY pr.order_index ASC, pm.matchup_number ASC
        `, [divisionId]);

        const matchups = matchupsRes.rows;

        // Получаем все завершенные матчи плей-офф
        const gamesRes = await client.query(`
            SELECT id, home_team_id, away_team_id, home_score, away_score, 
                   end_type, is_technical
            FROM games
            WHERE division_id = $1 AND stage_type = 'playoff' AND status = 'finished'
        `, [divisionId]);

        for (const matchup of matchups) {
            // Если победитель уже определен - идем дальше
            if (matchup.winner_id) continue;

            const t1 = matchup.team1_id;
            const t2 = matchup.team2_id;
            
            // Если команды еще не определены, нет смысла считать
            if (!t1 || !t2) continue;

            // Находим матчи, где играли именно эти две команды
            const matches = gamesRes.rows.filter(g => 
                (g.home_team_id === t1 && g.away_team_id === t2) ||
                (g.home_team_id === t2 && g.away_team_id === t1)
            );

            if (matches.length === 0) continue;

            let team1Wins = 0, team2Wins = 0;

            matches.forEach(game => {
                const homeScore = game.home_score || 0;
                const awayScore = game.away_score || 0;
                const isTeam1Home = game.home_team_id === t1;

                let homeWonGame = false;
                let awayWonGame = false;

                if (game.is_technical) {
                    if (game.is_technical === '+/-') homeWonGame = true;
                    else if (game.is_technical === '-/+') awayWonGame = true;
                } else {
                    if (homeScore > awayScore) homeWonGame = true;
                    else if (awayScore > homeScore) awayWonGame = true;
                }

                if (homeWonGame) { isTeam1Home ? team1Wins++ : team2Wins++; }
                else if (awayWonGame) { isTeam1Home ? team2Wins++ : team1Wins++; }
            });

            // Обновляем счет побед в серии
            await client.query(`
                UPDATE playoff_matchups 
                SET team1_wins = $1, team2_wins = $2
                WHERE id = $3
            `, [team1Wins, team2Wins, matchup.id]);

            // ПРОВЕРКА ЗАВЕРШЕНИЯ СЕРИИ
            let newWinnerId = null;
            let newLoserId = null;
            
            // Если в настройках раунда не указано количество побед, по умолчанию считаем до 2-х
            const winsNeeded = matchup.wins_needed || 2;

            if (team1Wins >= winsNeeded) {
                newWinnerId = t1;
                newLoserId = t2;
            } else if (team2Wins >= winsNeeded) {
                newWinnerId = t2;
                newLoserId = t1;
            }

            // Если победитель определился, продвигаем его дальше по сетке
            if (newWinnerId) {
                await client.query(`
                    UPDATE playoff_matchups 
                    SET winner_id = $1, loser_id = $2
                    WHERE id = $3
                `, [newWinnerId, newLoserId, matchup.id]);
                
                await promotePlayoffWinner(client, matchup, newWinnerId);
            }
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Ошибка в recalculatePlayoffs:', err);
        throw err;
    } finally {
        client.release();
    }
};

// Функция продвижения победителя дальше по сетке
const promotePlayoffWinner = async (client, matchup, winnerId) => {
    // Ищем матч следующего раунда в той же сетке (bracket_id)
    const nextRoundIndex = matchup.order_index + 1;
    const nextMatchupNumber = Math.ceil(matchup.matchup_number / 2);

    const bracketRes = await client.query(`
        SELECT pm.id, pm.team1_id, pm.team2_id 
        FROM playoff_matchups pm
        JOIN playoff_rounds pr ON pm.round_id = pr.id
        WHERE pr.bracket_id = $1 AND pr.order_index = $2 AND pm.matchup_number = $3
    `, [matchup.bracket_id, nextRoundIndex, nextMatchupNumber]);
    
    if (bracketRes.rows.length === 0) return; // Финал, дальше продвигать некуда

    const nextMatchup = bracketRes.rows[0];
    
    // Если матч нечетный - команда идет в слот team1, если четный - в team2
    const isTeam1 = matchup.matchup_number % 2 !== 0;

    if (isTeam1) {
        await client.query('UPDATE playoff_matchups SET team1_id = $1 WHERE id = $2', [winnerId, nextMatchup.id]);
    } else {
        await client.query('UPDATE playoff_matchups SET team2_id = $1 WHERE id = $2', [winnerId, nextMatchup.id]);
    }
};