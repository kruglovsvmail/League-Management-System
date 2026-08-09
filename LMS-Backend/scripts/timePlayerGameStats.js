/**
 * Замер пересчёта боксскора: разделяет сетевую задержку до базы и время
 * самого запроса. Нужен, чтобы понимать, где именно уходит время —
 * в round-trip до удалённого сервера или в плане запроса.
 *
 * Запуск из League-Management-System/LMS-Backend:
 *
 *   node scripts/timePlayerGameStats.js            — возьмёт последний матч
 *   node scripts/timePlayerGameStats.js 178        — конкретный матч
 *   node scripts/timePlayerGameStats.js 178 20     — 20 прогонов вместо 10
 */

import 'dotenv/config';
import pool from '../config/db.js';
import { recalculatePlayerGameStats } from '../utils/playerGameStatsCalculator.js';

const gameIdArg = Number(process.argv[2]) || null;
const runs = Number(process.argv[3]) || 10;

const ms = (start) => Number(process.hrtime.bigint() - start) / 1e6;
const stats = (list) => {
    const sorted = [...list].sort((a, b) => a - b);
    const avg = list.reduce((s, v) => s + v, 0) / list.length;
    return {
        min: sorted[0],
        med: sorted[Math.floor(sorted.length / 2)],
        avg,
        max: sorted[sorted.length - 1],
    };
};
const fmt = (s) => `min ${s.min.toFixed(0)}мс · медиана ${s.med.toFixed(0)}мс · среднее ${s.avg.toFixed(0)}мс · max ${s.max.toFixed(0)}мс`;

const main = async () => {
    let gameId = gameIdArg;
    if (!gameId) {
        const { rows } = await pool.query(
            `SELECT id FROM games WHERE status = 'finished' AND is_technical IS NULL
              ORDER BY game_date DESC NULLS LAST, id DESC LIMIT 1`
        );
        if (rows.length === 0) {
            console.log('Нет завершённых матчей для замера.');
            return;
        }
        gameId = rows[0].id;
    }

    console.log(`Матч ${gameId}, прогонов: ${runs}\n`);

    // 1. Чистая сетевая задержка: самый дешёвый возможный запрос
    const ping = [];
    for (let i = 0; i < runs; i++) {
        const t = process.hrtime.bigint();
        await pool.query('SELECT 1');
        ping.push(ms(t));
    }
    console.log(`Round-trip до базы (SELECT 1):   ${fmt(stats(ping))}`);

    // 2. Взятие соединения из пула
    const conn = [];
    for (let i = 0; i < runs; i++) {
        const t = process.hrtime.bigint();
        const c = await pool.connect();
        conn.push(ms(t));
        c.release();
    }
    console.log(`Получение соединения из пула:    ${fmt(stats(conn))}`);

    // 3. Полный пересчёт со своей транзакцией — то, что реально происходит
    //    при смене статуса матча
    const full = [];
    let rowCount = 0;
    for (let i = 0; i < runs; i++) {
        const t = process.hrtime.bigint();
        rowCount = await recalculatePlayerGameStats(gameId);
        full.push(ms(t));
    }
    console.log(`Полный пересчёт (5 обращений):   ${fmt(stats(full))}`);

    // 4. Только INSERT, на уже открытом соединении: чистое время плана
    const client = await pool.connect();
    const insertOnly = [];
    try {
        for (let i = 0; i < runs; i++) {
            await client.query('BEGIN');
            await client.query('DELETE FROM player_game_statistics WHERE game_id = $1', [gameId]);
            const t = process.hrtime.bigint();
            await recalculatePlayerGameStats(gameId, client);
            insertOnly.push(ms(t));
            await client.query('COMMIT');
        }
    } finally {
        client.release();
    }
    console.log(`Только DELETE+INSERT, без connect:${fmt(stats(insertOnly))}`);

    const netOverhead = stats(full).med - stats(insertOnly).med;
    console.log(`
Строк боксскора в матче: ${rowCount}

Разбор: из ${stats(full).med.toFixed(0)}мс полного пересчёта примерно
${netOverhead.toFixed(0)}мс — накладные расходы на соединение и транзакцию,
${stats(insertOnly).med.toFixed(0)}мс — сами запросы.

Если round-trip заметно больше 5мс, база удалённая и на проде,
где бэкенд стоит рядом с ней, всё будет ощутимо быстрее.
Если основное время в запросах — присылай вывод, посмотрю план.
`);
};

main()
    .catch(err => {
        console.error('Ошибка:', err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
