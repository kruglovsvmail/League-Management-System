import pool from '../config/db.js';

// Алфавит для команд, которых нечем различить по спортивным показателям.
// numeric — чтобы «Команда 10» не вставала перед «Команда 2».
const teamNameCollator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });

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

        // 2. Парсим критерии сортировки (системные ключи: points, h2h_points, h2h_wins,
        // h2h_diff, h2h_for, wins, goals_diff, goals_for, penalty_minutes, avg_age)
        let rankingCriteria = ['points', 'h2h_points', 'h2h_wins', 'h2h_diff', 'h2h_for', 'wins', 'goals_diff', 'goals_for'];
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
        const teamsRes = await client.query(`
            SELECT tt.team_id, t.name
            FROM tournament_teams tt
            JOIN teams t ON t.id = tt.team_id
            WHERE tt.division_id = $1 AND tt.status = 'approved'
        `, [divisionId]);
        const stats = {};
        teamsRes.rows.forEach(t => {
            stats[t.team_id] = {
                team_id: t.team_id,
                name: t.name || '',
                games_played: 0, wins_reg: 0, wins_ot: 0, draws: 0,
                losses_ot: 0, losses_reg: 0, goals_for: 0, goals_against: 0,
                points: 0, penalty_minutes: 0, avg_age: 0, rank: 0
            };
        });

        // Штрафные минуты команд за регулярку (для критерия penalty_minutes)
        const penaltiesRes = await client.query(`
            SELECT ge.team_id, COALESCE(SUM(ge.penalty_minutes), 0) AS penalty_minutes
            FROM game_events ge
            JOIN games g ON g.id = ge.game_id
            WHERE g.division_id = $1 AND g.status = 'finished' AND g.stage_type = 'regular' AND ge.event_type = 'penalty'
            GROUP BY ge.team_id
        `, [divisionId]);
        penaltiesRes.rows.forEach(row => {
            if (stats[row.team_id]) stats[row.team_id].penalty_minutes = Number(row.penalty_minutes);
        });

        // Средний возраст текущего заявленного состава (для критерия avg_age)
        const agesRes = await client.query(`
            SELECT tt.team_id, ROUND(AVG(EXTRACT(YEAR FROM age(CURRENT_DATE, u.birth_date)))) AS avg_age
            FROM tournament_teams tt
            JOIN tournament_rosters tr ON tr.tournament_team_id = tt.id
            JOIN users u ON tr.player_id = u.id
            WHERE tt.division_id = $1 AND tr.application_status = 'approved' AND tr.period_end IS NULL
            GROUP BY tt.team_id
        `, [divisionId]);
        agesRes.rows.forEach(row => {
            if (stats[row.team_id]) stats[row.team_id].avg_age = row.avg_age !== null ? Number(row.avg_age) : 0;
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

        // Считаем разницу шайб и общее число побед для удобства сортировки
        Object.values(stats).forEach(t => {
            t.goals_diff = t.goals_for - t.goals_against;
            t.wins = t.wins_reg + t.wins_ot;
        });

        // Критерии "очных встреч" (h2h_*) считаются не по общей статистике, а по
        // мини-таблице матчей ТОЛЬКО между командами текущей спорной группы —
        // функция вычисляет нужное значение из этой мини-таблицы.
        const H2H_GETTERS = {
            h2h_points: (s) => s.points,
            h2h_wins: (s) => s.wins_reg + s.wins_ot,
            h2h_diff: (s) => s.goals_for - s.goals_against,
            h2h_for: (s) => s.goals_for,
        };
        // Критерии, где МЕНЬШЕЕ значение лучше (по умолчанию сортировка по убыванию)
        const ASCENDING_CRITERIA = new Set(['penalty_minutes']);

        // 5. РЕКУРСИВНАЯ СОРТИРОВКА ТАБЛИЦЫ
        function sortTeamsGroup(teamsGroup, criteriaIndex) {
            if (teamsGroup.length <= 1) return teamsGroup;

            // Команды без сыгранных матчей различать нечем: все показатели нулевые, и порядок
            // внутри группы задавала бы случайная выдача БД. Ставим их по алфавиту.
            if (teamsGroup.every(t => t.games_played === 0)) {
                return [...teamsGroup].sort((a, b) => teamNameCollator.compare(a.name, b.name));
            }

            // Кончились критерии — возвращаем как есть
            if (criteriaIndex >= rankingCriteria.length) {
                return teamsGroup;
            }

            const criterion = rankingCriteria[criteriaIndex];
            const isH2h = criterion in H2H_GETTERS;

            if (isH2h) {
                const teamIds = teamsGroup.map(t => t.team_id);
                const miniStats = {};
                teamIds.forEach(id => miniStats[id] = { team_id: id, games_played: 0, wins_reg: 0, wins_ot: 0, draws: 0, losses_ot: 0, losses_reg: 0, goals_for: 0, goals_against: 0, points: 0 });

                // Фильтруем матчи ТОЛЬКО между командами из этой спорной группы
                playedGames.forEach(g => {
                    if (teamIds.includes(g.home_team_id) && teamIds.includes(g.away_team_id)) {
                        applyGameToStats(g, miniStats);
                    }
                });

                // Прикрепляем нужное для этого критерия значение мини-таблицы к командам
                teamsGroup.forEach(t => {
                    t[`_${criterion}`] = H2H_GETTERS[criterion](miniStats[t.team_id]);
                });
            }

            const getValue = (t) => isH2h ? t[`_${criterion}`] : t[criterion];
            const dir = ASCENDING_CRITERIA.has(criterion) ? 1 : -1;
            teamsGroup.sort((a, b) => dir * (getValue(a) - getValue(b)));

            // Группируем команды с одинаковым текущим показателем и отправляем на следующий критерий
            const result = [];
            let currentSubGroup = [teamsGroup[0]];

            for (let i = 1; i < teamsGroup.length; i++) {
                const prev = currentSubGroup[0];
                const curr = teamsGroup[i];

                if (getValue(prev) === getValue(curr)) {
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
                (division_id, team_id, games_played, wins_reg, wins_ot, draws, losses_ot, losses_reg, goals_for, goals_against, points, penalty_minutes, avg_age, rank, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
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
                    penalty_minutes = EXCLUDED.penalty_minutes,
                    avg_age = EXCLUDED.avg_age,
                    rank = EXCLUDED.rank,
                    updated_at = NOW()
            `, [
                divisionId, team.team_id, team.games_played, team.wins_reg,
                team.wins_ot, team.draws, team.losses_ot, team.losses_reg,
                team.goals_for, team.goals_against, team.points,
                team.penalty_minutes, team.avg_age, team.rank
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