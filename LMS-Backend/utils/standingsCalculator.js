import pool from '../config/db.js';

export const recalculateDivisionStandings = async (divisionId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Получаем правила турнира
        const rulesRes = await client.query(`
            SELECT points_win_reg, points_win_ot, points_draw,
                   points_loss_ot, points_loss_reg, 
                   points_tech_win, points_tech_loss,
                   ranking_criteria
            FROM divisions WHERE id = $1
        `, [divisionId]);

        const dbRules = rulesRes.rows[0] || {};
        const ptsWinReg = dbRules.points_win_reg ?? 3;
        const ptsWinOt = dbRules.points_win_ot ?? 2;
        const ptsDraw = dbRules.points_draw ?? 1;
        const ptsLossReg = dbRules.points_loss_reg ?? 0;
        const ptsLossOt = dbRules.points_loss_ot ?? 1;
        const ptsTechWin = dbRules.points_tech_win ?? 3;
        const ptsTechLoss = dbRules.points_tech_loss ?? 0;

        // 2. Парсим критерии сортировки (теперь тут системные ключи: points, h2h, goals_diff)
        let rankingCriteria = ['points', 'wins_reg', 'wins_ot', 'goals_diff', 'goals_for'];
        if (dbRules.ranking_criteria) {
            try {
                rankingCriteria = typeof dbRules.ranking_criteria === 'string' 
                    ? JSON.parse(dbRules.ranking_criteria) 
                    : dbRules.ranking_criteria;
            } catch (e) {
                console.error('Ошибка парсинга ranking_criteria', e);
            }
        }

        // 3. Инициализируем статистику
        const teamsRes = await client.query("SELECT team_id FROM tournament_teams WHERE division_id = $1 AND status = 'approved'", [divisionId]);
        const stats = {};
        teamsRes.rows.forEach(t => {
            stats[t.team_id] = {
                team_id: t.team_id,
                games_played: 0, wins_reg: 0, wins_ot: 0, draws: 0, 
                losses_ot: 0, losses_reg: 0, goals_for: 0, goals_against: 0, 
                points: 0, rank: 0
            };
        });

        // 4. Получаем сыгранные матчи (только регулярный чемпионат)
        const gamesRes = await client.query(`
            SELECT home_team_id, away_team_id, home_score, away_score, end_type, is_technical
            FROM games 
            WHERE division_id = $1 AND status = 'finished' AND stage_type = 'regular'
        `, [divisionId]);

        const playedGames = gamesRes.rows;

        // Вспомогательная функция для подсчета очков (чтобы не дублировать код для h2h)
        const applyGameToStats = (game, targetStats) => {
            const home = game.home_team_id;
            const away = game.away_team_id;

            if (!targetStats[home] || !targetStats[away]) return;

            const homeScore = game.home_score || 0;
            const awayScore = game.away_score || 0;
            const endType = game.end_type || 'regular';

            targetStats[home].games_played += 1;
            targetStats[away].games_played += 1;

            if (game.is_technical) {
                if (game.is_technical === '+/-') {
                    targetStats[home].wins_reg += 1; targetStats[home].points += ptsTechWin;
                    targetStats[away].losses_reg += 1; targetStats[away].points += ptsTechLoss;
                } else if (game.is_technical === '-/+') {
                    targetStats[away].wins_reg += 1; targetStats[away].points += ptsTechWin;
                    targetStats[home].losses_reg += 1; targetStats[home].points += ptsTechLoss;
                } else if (game.is_technical === '-/-') {
                    targetStats[home].losses_reg += 1; targetStats[home].points += ptsTechLoss;
                    targetStats[away].losses_reg += 1; targetStats[away].points += ptsTechLoss;
                }
                return;
            }

            targetStats[home].goals_for += homeScore; targetStats[home].goals_against += awayScore;
            targetStats[away].goals_for += awayScore; targetStats[away].goals_against += homeScore;

            if (homeScore > awayScore) {
                if (endType === 'regular' || endType === 'reg') { 
                    targetStats[home].wins_reg += 1; targetStats[home].points += ptsWinReg; 
                    targetStats[away].losses_reg += 1; targetStats[away].points += ptsLossReg; 
                } else { 
                    targetStats[home].wins_ot += 1; targetStats[home].points += ptsWinOt; 
                    targetStats[away].losses_ot += 1; targetStats[away].points += ptsLossOt; 
                }
            } else if (awayScore > homeScore) {
                if (endType === 'regular' || endType === 'reg') { 
                    targetStats[away].wins_reg += 1; targetStats[away].points += ptsWinReg; 
                    targetStats[home].losses_reg += 1; targetStats[home].points += ptsLossReg; 
                } else { 
                    targetStats[away].wins_ot += 1; targetStats[away].points += ptsWinOt; 
                    targetStats[home].losses_ot += 1; targetStats[home].points += ptsLossOt; 
                }
            } else {
                targetStats[home].draws += 1; targetStats[home].points += ptsDraw;
                targetStats[away].draws += 1; targetStats[away].points += ptsDraw;
            }
        };

        // Считаем общую статистику
        playedGames.forEach(game => applyGameToStats(game, stats));
        
        // Считаем разницу шайб для удобства сортировки
        Object.values(stats).forEach(t => t.goals_diff = t.goals_for - t.goals_against);

        // 5. РЕКУРСИВНАЯ СОРТИРОВКА ТАБЛИЦЫ
        function sortTeamsGroup(teamsGroup, criteriaIndex) {
            // Если в группе осталась 1 команда или кончились критерии — возвращаем как есть
            if (teamsGroup.length <= 1 || criteriaIndex >= rankingCriteria.length) {
                return teamsGroup;
            }

            const criterion = rankingCriteria[criteriaIndex];

            // Если критерий - ОЧНЫЕ ВСТРЕЧИ (Head-to-Head)
            if (criterion === 'h2h') {
                const teamIds = teamsGroup.map(t => t.team_id);
                const miniStats = {};
                teamIds.forEach(id => miniStats[id] = { team_id: id, games_played: 0, wins_reg: 0, wins_ot: 0, draws: 0, losses_ot: 0, losses_reg: 0, goals_for: 0, goals_against: 0, points: 0 });

                // Фильтруем матчи ТОЛЬКО между командами из этой спорной группы
                playedGames.forEach(g => {
                    if (teamIds.includes(g.home_team_id) && teamIds.includes(g.away_team_id)) {
                        applyGameToStats(g, miniStats);
                    }
                });

                // Прикрепляем результаты мини-таблицы к командам для сортировки
                teamsGroup.forEach(t => {
                    t._h2h_points = miniStats[t.team_id].points;
                    t._h2h_diff = miniStats[t.team_id].goals_for - miniStats[t.team_id].goals_against;
                });

                // Сортируем по очкам в очных встречах, при равенстве - по разнице шайб в очных
                teamsGroup.sort((a, b) => {
                    if (b._h2h_points !== a._h2h_points) return b._h2h_points - a._h2h_points;
                    return b._h2h_diff - a._h2h_diff;
                });

            } else {
                // Обычные (абсолютные) критерии (points, goals_diff, wins_reg и т.д.)
                teamsGroup.sort((a, b) => b[criterion] - a[criterion]);
            }

            // Группируем команды с одинаковым текущим показателем и отправляем на следующий критерий
            const result = [];
            let currentSubGroup = [teamsGroup[0]];

            for (let i = 1; i < teamsGroup.length; i++) {
                const prev = currentSubGroup[0];
                const curr = teamsGroup[i];
                
                let isTie = false;
                if (criterion === 'h2h') {
                    isTie = (prev._h2h_points === curr._h2h_points && prev._h2h_diff === curr._h2h_diff);
                } else {
                    isTie = (prev[criterion] === curr[criterion]);
                }

                if (isTie) {
                    currentSubGroup.push(curr);
                } else {
                    result.push(...sortTeamsGroup(currentSubGroup, criteriaIndex + 1));
                    currentSubGroup = [curr];
                }
            }
            result.push(...sortTeamsGroup(currentSubGroup, criteriaIndex + 1));

            return result;
        }

        // Запускаем рекурсию для всех команд
        const finalSortedTeams = sortTeamsGroup(Object.values(stats), 0);

        // 6. Проставляем финальные места (rank)
        finalSortedTeams.forEach((team, index) => {
            team.rank = index + 1;
        });

        // 7. Сохраняем в БД
        for (const team of finalSortedTeams) {
            await client.query(`
                INSERT INTO division_standings 
                (division_id, team_id, games_played, wins_reg, wins_ot, draws, losses_ot, losses_reg, goals_for, goals_against, points, rank, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
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
                    rank = EXCLUDED.rank,
                    updated_at = NOW()
            `, [
                divisionId, team.team_id, team.games_played, team.wins_reg, 
                team.wins_ot, team.draws, team.losses_ot, team.losses_reg,
                team.goals_for, team.goals_against, team.points, team.rank
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