import pool from '../config/db.js';

export const recalculatePlayoffs = async (divisionId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Получаем настройки дивизиона
        const divRes = await client.query('SELECT * FROM divisions WHERE id = $1', [divisionId]);
        if (divRes.rows.length === 0) return;
        const rules = divRes.rows[0];

        const winsNeeded = {
            '1/8': rules.wins_needed_1_8 || 2,
            '1/4': rules.wins_needed_1_4 || 2,
            '1/2': rules.wins_needed_1_2 || 2,
            'final': rules.wins_needed_final || 2,
            '3rd_place': rules.wins_needed_3rd || 1
        };

        // 2. Получаем всю сетку плей-офф
        const matchupsRes = await client.query(
            'SELECT * FROM division_playoff WHERE division_id = $1 ORDER BY stage, matchup_number', 
            [divisionId]
        );
        const matchups = matchupsRes.rows;

        // 3. Получаем все завершенные матчи плей-офф
        const gamesRes = await client.query(`
            SELECT home_team_id, away_team_id, home_score, away_score
            FROM games
            WHERE division_id = $1 AND stage_type = 'playoff' AND status = 'finished'
        `, [divisionId]);
        const games = gamesRes.rows;

        // Карта переходов по турнирной сетке
        const getNextSlot = (currentStage, matchupNum) => {
            let nextStage = null;
            if (currentStage === '1/8') nextStage = '1/4';
            else if (currentStage === '1/4') nextStage = '1/2';
            else if (currentStage === '1/2') nextStage = 'final';

            if (!nextStage) return null;

            // Логика классического креста: победители пары 1 и 2 выходят на 1 слот следующего раунда
            const nextMatchupNum = Math.ceil(matchupNum / 2);
            // Если номер пары нечетный - команда становится "Верхней" (team1), если четный - "Нижней" (team2)
            const isTeam1 = matchupNum % 2 !== 0;

            return { nextStage, nextMatchupNum, isTeam1 };
        };

        // 4. Проходим по каждой паре и считаем победы
        for (let m of matchups) {
            // Если пара пустая (или ждет соперника) - пропускаем
            if (!m.team1_id || !m.team2_id) continue;

            let t1Wins = 0;
            let t2Wins = 0;

            games.forEach(g => {
                const isHome1 = g.home_team_id === m.team1_id && g.away_team_id === m.team2_id;
                const isHome2 = g.home_team_id === m.team2_id && g.away_team_id === m.team1_id;

                if (isHome1 || isHome2) {
                    const hScore = Number(g.home_score || 0);
                    const aScore = Number(g.away_score || 0);

                    if (hScore > aScore) {
                        if (isHome1) t1Wins++; else t2Wins++;
                    } else if (aScore > hScore) {
                        if (isHome2) t1Wins++; else t2Wins++;
                    }
                }
            });

            const needed = winsNeeded[m.stage] || 2;
            let winnerId = null;
            let loserId = null;

            if (t1Wins >= needed) { winnerId = m.team1_id; loserId = m.team2_id; }
            else if (t2Wins >= needed) { winnerId = m.team2_id; loserId = m.team1_id; }

            // Обновляем текущую пару (счетчик побед и победителя)
            await client.query(`
                UPDATE division_playoff
                SET team1_wins = $1, team2_wins = $2, winner_id = $3
                WHERE id = $4
            `, [t1Wins, t2Wins, winnerId, m.id]);

            // 5. АВТО-ПРОХОД: Если есть победитель, прокидываем его дальше
            const nextSlot = getNextSlot(m.stage, m.matchup_number);
            
            if (nextSlot) {
                const teamField = nextSlot.isTeam1 ? 'team1_id' : 'team2_id';
                await client.query(`
                    UPDATE division_playoff
                    SET ${teamField} = $1
                    WHERE division_id = $2 AND stage = $3 AND matchup_number = $4
                `, [winnerId, divisionId, nextSlot.nextStage, nextSlot.nextMatchupNum]);
            }

            // Утешительный финал (Матч за 3-е место)
            if (m.stage === '1/2' && rules.has_third_place) {
                const isTeam1 = m.matchup_number % 2 !== 0;
                const loserField = isTeam1 ? 'team1_id' : 'team2_id';
                await client.query(`
                    UPDATE division_playoff
                    SET ${loserField} = $1
                    WHERE division_id = $2 AND stage = '3rd_place' AND matchup_number = 1
                `, [loserId, divisionId]);
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