import pool from '../config/db.js';

export const recalculatePlayoffs = async (divisionId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Получаем все сетки дивизиона (Основная всегда идет первой)
        const bracketsRes = await client.query(
            'SELECT * FROM playoff_brackets WHERE division_id = $1 ORDER BY is_main DESC, id ASC', 
            [divisionId]
        );
        const brackets = bracketsRes.rows;

        if (brackets.length === 0) {
            await client.query('ROLLBACK');
            return;
        }

        // 2. Получаем турнирную таблицу для посева (seed)
        const standingsRes = await client.query(`
            SELECT team_id, rank 
            FROM division_standings 
            WHERE division_id = $1 
            ORDER BY rank ASC
        `, [divisionId]);
        const standings = standingsRes.rows;

        const getTeamBySeed = (seedNumber) => {
            const team = standings.find(s => s.rank === Number(seedNumber));
            return team ? team.team_id : null;
        };

        // 3. Получаем все завершенные игры плей-офф в дивизионе
        const gamesRes = await client.query(`
            SELECT home_team_id, away_team_id, home_score, away_score, is_technical
            FROM games
            WHERE division_id = $1 AND stage_type = 'playoff' AND status = 'finished'
        `, [divisionId]);
        const games = gamesRes.rows;

        // 4. ИЗМЕНЕНИЕ: Загружаем ВСЕ матчи ВСЕХ сеток дивизиона разом, 
        // чтобы кросс-ссылки (переходы из одной сетки в другую) могли найтись
        const allMatchupsRes = await client.query(`
            SELECT m.*, r.wins_needed, r.order_index, r.bracket_id
            FROM playoff_matchups m
            JOIN playoff_rounds r ON m.round_id = r.id
            WHERE r.bracket_id IN (SELECT id FROM playoff_brackets WHERE division_id = $1)
        `, [divisionId]);
        let allMatchups = allMatchupsRes.rows;

        // ИЗМЕНЕНИЕ: Добавляем цикл каскадного обновления (Cascade Resolution)
        // Сетки могут зависеть друг от друга. Обновляем, пока есть изменения в составах пар или победителях.
        let hasChanges = true;
        let iterationCount = 0;
        const MAX_ITERATIONS = 5; // Защита от бесконечного цикла

        while (hasChanges && iterationCount < MAX_ITERATIONS) {
            hasChanges = false;
            iterationCount++;

            for (const bracket of brackets) {
                const roundsRes = await client.query(
                    'SELECT * FROM playoff_rounds WHERE bracket_id = $1 ORDER BY order_index ASC',
                    [bracket.id]
                );
                const rounds = roundsRes.rows;

                for (const round of rounds) {
                    const roundMatchups = allMatchups
                        .filter(m => m.round_id === round.id)
                        .sort((a, b) => a.matchup_number - b.matchup_number);

                    for (let m of roundMatchups) {
                        let newTeam1Id = m.team1_id;
                        let newTeam2Id = m.team2_id;

                        // --- РАЗРЕШЕНИЕ ИСТОЧНИКА КОМАНДЫ 1 (Глобальный поиск) ---
                        if (m.team1_source_type === 'seed') {
                            newTeam1Id = getTeamBySeed(m.team1_source_id);
                        } else if (m.team1_source_type === 'winner_of') {
                            const sourceMatchup = allMatchups.find(src => src.id === m.team1_source_id);
                            newTeam1Id = sourceMatchup ? sourceMatchup.winner_id : null;
                        } else if (m.team1_source_type === 'loser_of') {
                            const sourceMatchup = allMatchups.find(src => src.id === m.team1_source_id);
                            newTeam1Id = sourceMatchup ? sourceMatchup.loser_id : null;
                        }

                        // --- РАЗРЕШЕНИЕ ИСТОЧНИКА КОМАНДЫ 2 (Глобальный поиск) ---
                        if (m.team2_source_type === 'seed') {
                            newTeam2Id = getTeamBySeed(m.team2_source_id);
                        } else if (m.team2_source_type === 'winner_of') {
                            const sourceMatchup = allMatchups.find(src => src.id === m.team2_source_id);
                            newTeam2Id = sourceMatchup ? sourceMatchup.winner_id : null;
                        } else if (m.team2_source_type === 'loser_of') {
                            const sourceMatchup = allMatchups.find(src => src.id === m.team2_source_id);
                            newTeam2Id = sourceMatchup ? sourceMatchup.loser_id : null;
                        }

                        // Если команда продвинулась/упала в сетку, сохраняем изменения
                        if (newTeam1Id !== m.team1_id || newTeam2Id !== m.team2_id) {
                            await client.query(`
                                UPDATE playoff_matchups 
                                SET team1_id = $1, team2_id = $2 
                                WHERE id = $3
                            `, [newTeam1Id, newTeam2Id, m.id]);
                            
                            m.team1_id = newTeam1Id;
                            m.team2_id = newTeam2Id;
                            hasChanges = true; // Триггерим еще один проход, т.к. изменение могло повлиять дальше
                        }

                        // Если обе команды известны, считаем победы в их серии
                        if (m.team1_id && m.team2_id) {
                            let t1Wins = 0;
                            let t2Wins = 0;

                            games.forEach(g => {
                                const isHome1 = g.home_team_id === m.team1_id && g.away_team_id === m.team2_id;
                                const isHome2 = g.home_team_id === m.team2_id && g.away_team_id === m.team1_id;

                                if (isHome1 || isHome2) {
                                    const hScore = Number(g.home_score || 0);
                                    const aScore = Number(g.away_score || 0);

                                    if (g.is_technical) {
                                        if (hScore > aScore) { if (isHome1) t1Wins++; else t2Wins++; }
                                        else if (aScore > hScore) { if (isHome2) t1Wins++; else t2Wins++; }
                                        return; 
                                    }

                                    if (hScore > aScore) { if (isHome1) t1Wins++; else t2Wins++; }
                                    else if (aScore > hScore) { if (isHome2) t1Wins++; else t2Wins++; }
                                }
                            });

                            let winnerId = null;
                            let loserId = null;

                            if (t1Wins >= round.wins_needed) { winnerId = m.team1_id; loserId = m.team2_id; }
                            else if (t2Wins >= round.wins_needed) { winnerId = m.team2_id; loserId = m.team1_id; }

                            // Если результат серии изменился, сохраняем в БД и память
                            if (winnerId !== m.winner_id || loserId !== m.loser_id || t1Wins !== m.team1_wins || t2Wins !== m.team2_wins) {
                                await client.query(`
                                    UPDATE playoff_matchups
                                    SET team1_wins = $1, team2_wins = $2, winner_id = $3, loser_id = $4
                                    WHERE id = $5
                                `, [t1Wins, t2Wins, winnerId, loserId, m.id]);
                                
                                m.team1_wins = t1Wins;
                                m.team2_wins = t2Wins;
                                m.winner_id = winnerId;
                                m.loser_id = loserId;
                                hasChanges = true; // Победа в серии может затриггерить следующего соперника
                            }
                        }
                    }
                }
            }
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка при пересчете плей-офф:', error);
        throw error;
    } finally {
        client.release();
    }
};