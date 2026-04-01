import pool from '../config/db.js';

export const recalculateDivisionStandings = async (divisionId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Получаем правила начисления очков и КРИТЕРИИ СОРТИРОВКИ
        const divRes = await client.query(
            `SELECT points_win_reg, points_win_ot, points_draw, points_loss_ot, points_loss_reg, ranking_criteria
             FROM divisions 
             WHERE id = $1`,
            [divisionId]
        );
        
        if (divRes.rows.length === 0) {
            throw new Error(`Дивизион с ID ${divisionId} не найден`);
        }
        
        const rules = divRes.rows[0];

        const ptsWinReg = Number(rules.points_win_reg ?? 3);
        const ptsWinOt = Number(rules.points_win_ot ?? 2);
        const ptsDraw = Number(rules.points_draw ?? 1);
        const ptsLossOt = Number(rules.points_loss_ot ?? 1);
        const ptsLossReg = Number(rules.points_loss_reg ?? 0);

        // Парсим критерии сортировки (если они есть)
        let rankingCriteria = [];
        if (rules.ranking_criteria) {
            rankingCriteria = typeof rules.ranking_criteria === 'string' 
                ? JSON.parse(rules.ranking_criteria) 
                : rules.ranking_criteria;
        }

        // 2. Получаем все сыгранные матчи
        const gamesRes = await client.query(
            `SELECT 
                g.id, 
                g.home_team_id, 
                g.away_team_id, 
                g.home_score, 
                g.away_score,
                g.end_type,
                EXISTS(
                    SELECT 1 FROM game_events ge 
                    WHERE ge.game_id = g.id AND ge.period IN ('OT', 'SO')
                ) as has_ot_events
             FROM games g
             WHERE g.division_id = $1 
               AND g.status = 'finished' 
               AND g.stage_type = 'regular'`,
            [divisionId]
        );

        // 3. Агрегация базовой статистики
        const stats = {};

        const initTeam = (teamId) => {
            if (!stats[teamId]) {
                stats[teamId] = {
                    teamId: Number(teamId),
                    games_played: 0, wins_reg: 0, wins_ot: 0, draws: 0,
                    losses_ot: 0, losses_reg: 0, goals_for: 0, goals_against: 0, points: 0
                };
            }
        };

        gamesRes.rows.forEach(game => {
            const home = game.home_team_id;
            const away = game.away_team_id;
            
            const hScore = Number(game.home_score || 0);
            const aScore = Number(game.away_score || 0);
            const isOt = game.has_ot_events || ['ot', 'so'].includes(game.end_type);

            initTeam(home);
            initTeam(away);

            stats[home].games_played += 1;
            stats[away].games_played += 1;

            stats[home].goals_for += hScore;
            stats[home].goals_against += aScore;
            stats[away].goals_for += aScore;
            stats[away].goals_against += hScore;

            if (hScore > aScore) {
                if (isOt) {
                    stats[home].wins_ot += 1; stats[home].points += ptsWinOt;
                    stats[away].losses_ot += 1; stats[away].points += ptsLossOt;
                } else {
                    stats[home].wins_reg += 1; stats[home].points += ptsWinReg;
                    stats[away].losses_reg += 1; stats[away].points += ptsLossReg;
                }
            } else if (aScore > hScore) {
                if (isOt) {
                    stats[away].wins_ot += 1; stats[away].points += ptsWinOt;
                    stats[home].losses_ot += 1; stats[home].points += ptsLossOt;
                } else {
                    stats[away].wins_reg += 1; stats[away].points += ptsWinReg;
                    stats[home].losses_reg += 1; stats[home].points += ptsLossReg;
                }
            } else {
                stats[home].draws += 1; stats[home].points += ptsDraw;
                stats[away].draws += 1; stats[away].points += ptsDraw;
            }
        });

        // 4. ПРЕОБРАЗОВАНИЕ В МАССИВ ДЛЯ СЛОЖНОЙ СОРТИРОВКИ
        const statsArray = Object.values(stats);

        // Функция для вычисления очных встреч (Head-to-Head)
        const compareH2H = (a, b) => {
            let ptsA = 0, ptsB = 0;
            let gdA = 0, gdB = 0;
            
            gamesRes.rows.forEach(g => {
                const isHomeA = g.home_team_id === a.teamId && g.away_team_id === b.teamId;
                const isHomeB = g.home_team_id === b.teamId && g.away_team_id === a.teamId;
                if (!isHomeA && !isHomeB) return;
                
                const hScore = Number(g.home_score || 0);
                const aScore = Number(g.away_score || 0);
                const isOt = g.has_ot_events || ['ot', 'so'].includes(g.end_type);
                
                if (isHomeA) {
                    gdA += (hScore - aScore); gdB += (aScore - hScore);
                    if (hScore > aScore) { ptsA += isOt ? ptsWinOt : ptsWinReg; ptsB += isOt ? ptsLossOt : ptsLossReg; }
                    else if (aScore > hScore) { ptsB += isOt ? ptsWinOt : ptsWinReg; ptsA += isOt ? ptsLossOt : ptsLossReg; }
                    else { ptsA += ptsDraw; ptsB += ptsDraw; }
                } else {
                    gdB += (hScore - aScore); gdA += (aScore - hScore);
                    if (hScore > aScore) { ptsB += isOt ? ptsWinOt : ptsWinReg; ptsA += isOt ? ptsLossOt : ptsLossReg; }
                    else if (aScore > hScore) { ptsA += isOt ? ptsWinOt : ptsWinReg; ptsB += isOt ? ptsLossOt : ptsLossReg; }
                    else { ptsA += ptsDraw; ptsB += ptsDraw; }
                }
            });
            
            if (ptsA !== ptsB) return ptsB - ptsA;
            if (gdA !== gdB) return gdB - gdA;
            return 0;
        };

        // Карта критериев сортировки
        const criteriaComparators = {
            'Разница шайб': (a, b) => (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against),
            'Заброшенные шайбы': (a, b) => b.goals_for - a.goals_for,
            'Количество очков': (a, b) => b.points - a.points,
            'Количество побед': (a, b) => (b.wins_reg + b.wins_ot) - (a.wins_reg + a.wins_ot),
            'Очные встречи': compareH2H
        };

        // Запуск движка сортировки
        statsArray.sort((a, b) => {
            // Абсолютный приоритет 1: Очки
            if (b.points !== a.points) return b.points - a.points;

            // При равенстве очков идем по массиву настроек дивизиона
            for (const criteria of rankingCriteria) {
                const cmpFunc = criteriaComparators[criteria];
                if (cmpFunc) {
                    const res = cmpFunc(a, b);
                    if (res !== 0) return res; // Если критерий выявил победителя — прекращаем проверки
                }
            }
            
            // Если всё абсолютно равно — запасной вариант (чтобы таблица не "прыгала")
            return (b.wins_reg - a.wins_reg); 
        });

        // 5. РАСПРЕДЕЛЕНИЕ МЕСТ (RANKS)
        statsArray.forEach((teamStats, index) => {
            teamStats.rank = index + 1;
        });

        // 6. ЗАПИСЬ В БАЗУ
        await client.query(`DELETE FROM division_standings WHERE division_id = $1`, [divisionId]);

        const insertQuery = `
            INSERT INTO division_standings
            (division_id, team_id, games_played, wins_reg, wins_ot, draws, losses_ot, losses_reg, goals_for, goals_against, points, rank)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `;

        for (const tStats of statsArray) {
            await client.query(insertQuery, [
                divisionId, tStats.teamId, tStats.games_played, 
                tStats.wins_reg, tStats.wins_ot, tStats.draws, 
                tStats.losses_ot, tStats.losses_reg, 
                tStats.goals_for, tStats.goals_against, tStats.points,
                tStats.rank // Сохраняем вычисленное место
            ]);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Ошибка при пересчете турнирной таблицы:', error);
        throw error;
    } finally {
        client.release();
    }
};