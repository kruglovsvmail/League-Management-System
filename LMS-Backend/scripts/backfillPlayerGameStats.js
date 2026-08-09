/**
 * Разовый бэкфилл боксскора player_game_statistics по всем сыгранным матчам
 * плюс сверка результата со старой таблицей player_statistics.
 *
 * Ничего не ломает: player_game_statistics в проде ещё никто не читает,
 * player_statistics скрипт не трогает вообще.
 *
 * Запуск из League-Management-System/LMS-Backend:
 *
 *   node scripts/backfillPlayerGameStats.js            — бэкфилл + сверка
 *   node scripts/backfillPlayerGameStats.js --verify   — только сверка
 *   node scripts/backfillPlayerGameStats.js --division 7
 *
 * Сверка идёт только по официальным матчам и только по тем показателям,
 * которые есть в обеих таблицах: товарищеских и внешних матчей в старой
 * таблице нет по определению, сравнивать их не с чем.
 */

import 'dotenv/config';
import pool from '../config/db.js';
import { recalculatePlayerGameStats } from '../utils/playerGameStatsCalculator.js';

const args = process.argv.slice(2);
const verifyOnly = args.includes('--verify');
const divisionArg = args.indexOf('--division');
const divisionId = divisionArg !== -1 ? Number(args[divisionArg + 1]) : null;

// ─── Бэкфилл ────────────────────────────────────────────────────────────────

const backfill = async () => {
    const { rows: games } = await pool.query(
        `SELECT id, game_type, division_id
           FROM games
          WHERE status = 'finished'
            AND is_technical IS NULL
            AND ($1::int IS NULL OR division_id = $1)
          ORDER BY game_date NULLS LAST, id`,
        [divisionId]
    );

    console.log(`Матчей к пересчёту: ${games.length}`);
    if (games.length === 0) return;

    let done = 0;
    let rows = 0;
    const failed = [];
    const started = Date.now();

    for (const game of games) {
        try {
            rows += await recalculatePlayerGameStats(game.id);
        } catch (err) {
            failed.push({ id: game.id, message: err.message });
        }
        done += 1;
        if (done % 50 === 0 || done === games.length) {
            const sec = ((Date.now() - started) / 1000).toFixed(1);
            console.log(`  ${done}/${games.length} матчей, ${rows} строк, ${sec}с`);
        }
    }

    console.log(`\nГотово: ${done - failed.length} матчей, ${rows} строк боксскора.`);
    if (failed.length > 0) {
        console.log(`Не пересчитаны (${failed.length}):`);
        failed.forEach(f => console.log(`  матч ${f.id}: ${f.message}`));
    }
};

// ─── Сверка со старой таблицей ──────────────────────────────────────────────

const VERIFY_SQL = `
WITH new_agg AS (
    SELECT
        pgs.tournament_roster_id                              AS roster_id,
        COUNT(*)                                              AS games_played,
        SUM(pgs.goals)                                        AS goals,
        SUM(pgs.assists)                                      AS assists,
        SUM(pgs.points)                                       AS points,
        SUM(pgs.plus_minus)                                   AS plus_minus,
        SUM(pgs.penalty_minutes)                              AS penalty_minutes,
        SUM(pgs.goalie_goals_against)                         AS goals_against,
        SUM(pgs.goalie_shots_against)                         AS shots_against,
        SUM(pgs.goalie_saves)                                 AS saves,
        COUNT(*) FILTER (WHERE pgs.goalie_shutout)            AS shutouts,
        SUM(pgs.goalie_seconds)                               AS minutes_played
    FROM player_game_statistics pgs
    WHERE pgs.game_type = 'official'
      AND pgs.tournament_roster_id IS NOT NULL
      AND ($1::int IS NULL OR pgs.division_id = $1)
    GROUP BY pgs.tournament_roster_id
),
old_agg AS (
    SELECT
        ps.tournament_roster_id AS roster_id,
        ps.games_played, ps.goals, ps.assists, ps.points, ps.plus_minus,
        ps.penalty_minutes, ps.goals_against, ps.shots_against, ps.saves,
        ps.shutouts, ps.minutes_played
    FROM player_statistics ps
    JOIN tournament_rosters tr ON tr.id = ps.tournament_roster_id
    JOIN tournament_teams   tt ON tt.id = tr.tournament_team_id
    WHERE ($1::int IS NULL OR tt.division_id = $1)
)
SELECT
    COALESCE(n.roster_id, o.roster_id) AS roster_id,
    u.last_name, u.first_name,
    t.short_name AS team,
    d.short_name AS division,
    COALESCE(o.games_played, 0)    AS old_gp,  COALESCE(n.games_played, 0)    AS new_gp,
    COALESCE(o.goals, 0)           AS old_g,   COALESCE(n.goals, 0)           AS new_g,
    COALESCE(o.assists, 0)         AS old_a,   COALESCE(n.assists, 0)         AS new_a,
    COALESCE(o.points, 0)          AS old_p,   COALESCE(n.points, 0)          AS new_p,
    COALESCE(o.plus_minus, 0)      AS old_pm,  COALESCE(n.plus_minus, 0)      AS new_pm,
    COALESCE(o.penalty_minutes, 0) AS old_pim, COALESCE(n.penalty_minutes, 0) AS new_pim,
    COALESCE(o.goals_against, 0)   AS old_ga,  COALESCE(n.goals_against, 0)   AS new_ga,
    COALESCE(o.shots_against, 0)   AS old_sa,  COALESCE(n.shots_against, 0)   AS new_sa,
    COALESCE(o.saves, 0)           AS old_sv,  COALESCE(n.saves, 0)           AS new_sv,
    COALESCE(o.shutouts, 0)        AS old_so,  COALESCE(n.shutouts, 0)        AS new_so,
    COALESCE(o.minutes_played, 0)  AS old_sec, COALESCE(n.minutes_played, 0)  AS new_sec
FROM new_agg n
FULL JOIN old_agg o ON o.roster_id = n.roster_id
LEFT JOIN tournament_rosters tr ON tr.id = COALESCE(n.roster_id, o.roster_id)
LEFT JOIN tournament_teams   tt ON tt.id = tr.tournament_team_id
LEFT JOIN teams     t ON t.id = tt.team_id
LEFT JOIN divisions d ON d.id = tt.division_id
LEFT JOIN users     u ON u.id = tr.player_id
WHERE COALESCE(o.games_played, 0)    <> COALESCE(n.games_played, 0)
   OR COALESCE(o.goals, 0)           <> COALESCE(n.goals, 0)
   OR COALESCE(o.assists, 0)         <> COALESCE(n.assists, 0)
   OR COALESCE(o.points, 0)          <> COALESCE(n.points, 0)
   OR COALESCE(o.plus_minus, 0)      <> COALESCE(n.plus_minus, 0)
   OR COALESCE(o.penalty_minutes, 0) <> COALESCE(n.penalty_minutes, 0)
   OR COALESCE(o.goals_against, 0)   <> COALESCE(n.goals_against, 0)
   OR COALESCE(o.shots_against, 0)   <> COALESCE(n.shots_against, 0)
   OR COALESCE(o.saves, 0)           <> COALESCE(n.saves, 0)
   OR COALESCE(o.shutouts, 0)        <> COALESCE(n.shutouts, 0)
   OR COALESCE(o.minutes_played, 0)  <> COALESCE(n.minutes_played, 0)
ORDER BY d.short_name, t.short_name, u.last_name, u.first_name
`;

const FIELDS = [
    ['gp',  'матчи'],
    ['g',   'голы'],
    ['a',   'передачи'],
    ['p',   'очки'],
    ['pm',  '+/-'],
    ['pim', 'штраф'],
    ['ga',  'пропущено'],
    ['sa',  'броски'],
    ['sv',  'отражено'],
    ['so',  'сухари'],
    ['sec', 'секунды'],
];

const verify = async () => {
    console.log('\n─── Сверка с player_statistics (только официальные матчи) ───\n');

    const { rows } = await pool.query(VERIFY_SQL, [divisionId]);

    if (rows.length === 0) {
        console.log('Расхождений нет — обе таблицы дают одинаковые цифры.');
        return;
    }

    console.log(`Расхождений: ${rows.length}\n`);

    // Сводка по показателям: где именно расходится чаще всего
    const byField = new Map(FIELDS.map(([key]) => [key, 0]));
    for (const row of rows) {
        for (const [key] of FIELDS) {
            if (Number(row[`old_${key}`]) !== Number(row[`new_${key}`])) {
                byField.set(key, byField.get(key) + 1);
            }
        }
    }

    console.log('По показателям:');
    for (const [key, label] of FIELDS) {
        const count = byField.get(key);
        if (count > 0) console.log(`  ${label.padEnd(12)} ${count}`);
    }

    console.log('\nПервые 40 строк:\n');
    for (const row of rows.slice(0, 40)) {
        const diffs = FIELDS
            .filter(([key]) => Number(row[`old_${key}`]) !== Number(row[`new_${key}`]))
            .map(([key, label]) => `${label}: ${row[`old_${key}`]} → ${row[`new_${key}`]}`)
            .join(', ');
        const who = `${row.last_name || '?'} ${row.first_name || ''}`.trim();
        console.log(`  [${row.division || '—'}/${row.team || '—'}] ${who} (заявка ${row.roster_id}) — ${diffs}`);
    }

    if (rows.length > 40) console.log(`  … и ещё ${rows.length - 40}`);

    console.log(`
Что считать нормой:
  • «сухари» могут разойтись — старый расчёт определял их по games.home_score
    и away_score, куда победителю по буллитам дописана лишняя шайба за серию;
    новый считает по фактически пропущенным шайбам и признаку поражения.
  • «отражено» расходится только при кривых данных: старый расчёт брал
    GREATEST от итога за матч, новый — по каждому периоду отдельно, и разница
    появляется, если в периоде голов с броска больше, чем самих бросков.
  • всё остальное расходиться не должно. Любое расхождение по голам,
    передачам, очкам, +/- или штрафу — повод разобрать конкретный матч.
`);
};

// ─── main ───────────────────────────────────────────────────────────────────

const main = async () => {
    if (divisionId) console.log(`Дивизион: ${divisionId}`);
    if (!verifyOnly) await backfill();
    await verify();
};

main()
    .catch(err => {
        console.error('\nОшибка:', err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
