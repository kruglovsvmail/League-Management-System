// src/controllers/ProtocolPDFController.js
import pool from '../config/db.js';
import bcrypt from 'bcrypt';

export const getProtocolData = async (req, res) => {
    try {
        const { gameId } = req.params;

        const gameQuery = `
            SELECT 
                g.id, g.game_date, g.game_number,
                d.name as division_name, s.name as season_name,
                COALESCE(a.name, g.location_text) as arena_name,
                ht.name as home_team_name, at.name as away_team_name,
                g.division_id, g.home_team_id, g.away_team_id,
                g.home_score, g.away_score,
                g.actual_start_time, g.actual_end_time, g.spectators
            FROM games g
            LEFT JOIN divisions d ON g.division_id = d.id
            LEFT JOIN seasons s ON d.season_id = s.id
            LEFT JOIN arenas a ON g.arena_id = a.id
            LEFT JOIN teams ht ON g.home_team_id = ht.id
            LEFT JOIN teams at ON g.away_team_id = at.id
            WHERE g.id = $1
        `;
        const gameResult = await pool.query(gameQuery, [gameId]);
        if (gameResult.rows.length === 0) return res.status(404).json({ success: false, error: 'Матч не найден' });
        const game = gameResult.rows[0];

        const rostersQuery = `
            SELECT gr.team_id, gr.player_id, gr.jersey_number, gr.is_captain, gr.is_assistant, gr.position_in_line, u.first_name, u.last_name
            FROM game_rosters gr
            JOIN users u ON gr.player_id = u.id
            WHERE gr.game_id = $1 AND gr.is_in_lineup = true
            ORDER BY gr.jersey_number ASC
        `;
        const rostersResult = await pool.query(rostersQuery, [gameId]);
        const homeRoster = [];
        const awayRoster = [];

        rostersResult.rows.forEach(player => {
            let translatedPosition = '';
            if (['LW', 'C', 'RW'].includes(player.position_in_line)) translatedPosition = 'Нап';
            else if (['LD', 'RD'].includes(player.position_in_line)) translatedPosition = 'Защ';
            else if (player.position_in_line === 'G') translatedPosition = 'Вр';
            const playerData = { ...player, translated_position: translatedPosition };
            if (player.team_id === game.home_team_id) homeRoster.push(playerData);
            else if (player.team_id === game.away_team_id) awayRoster.push(playerData);
        });

        const eventsQuery = `
            SELECT ge.id, ge.team_id, ge.period, ge.time_seconds, ge.event_type, ge.goal_strength, ge.penalty_minutes, ge.penalty_violation, ge.penalty_end_time,
                u_scorer.last_name as scorer_last_name, gr_scorer.jersey_number as scorer_number,
                u_a1.last_name as a1_last_name, gr_a1.jersey_number as a1_number,
                u_a2.last_name as a2_last_name, gr_a2.jersey_number as a2_number
            FROM game_events ge
            LEFT JOIN users u_scorer ON ge.scorer_id = u_scorer.id
            LEFT JOIN game_rosters gr_scorer ON ge.scorer_id = gr_scorer.player_id AND gr_scorer.game_id = $1
            LEFT JOIN users u_a1 ON ge.assist1_id = u_a1.id
            LEFT JOIN game_rosters gr_a1 ON ge.assist1_id = gr_a1.player_id AND gr_a1.game_id = $1
            LEFT JOIN users u_a2 ON ge.assist2_id = u_a2.id
            LEFT JOIN game_rosters gr_a2 ON ge.assist2_id = gr_a2.player_id AND gr_a2.game_id = $1
            WHERE ge.game_id = $1 ORDER BY ge.time_seconds ASC
        `;
        const eventsResult = await pool.query(eventsQuery, [gameId]);

        const sigsQuery = `
            SELECT s.role, s.signature_hash, s.manual_name, s.user_id, s.created_at, u.last_name, u.first_name, u.middle_name
            FROM game_protocol_signatures s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.game_id = $1
        `;
        const sigsResult = await pool.query(sigsQuery, [gameId]);
        const signatures = {};
        sigsResult.rows.forEach(sig => {
            let displayName = sig.manual_name;
            if (!displayName && sig.last_name) displayName = `${sig.last_name} ${sig.first_name ? sig.first_name[0] + '.' : ''}${sig.middle_name ? sig.middle_name[0] + '.' : ''}`;
            signatures[sig.role] = { hash: sig.signature_hash, name: displayName, date: sig.created_at, user_id: sig.user_id };
        });

        const signersQuery = `
            SELECT 'home' as side, ttr.user_id as id, u.last_name, u.first_name, u.middle_name, ttr.tournament_role as role
            FROM tournament_team_roles ttr
            JOIN tournament_teams tt ON tt.id = ttr.tournament_team_id
            JOIN users u ON u.id = ttr.user_id
            WHERE tt.team_id = $2 AND tt.division_id = $1 AND ttr.left_at IS NULL
            UNION ALL
            SELECT 'away' as side, ttr.user_id as id, u.last_name, u.first_name, u.middle_name, ttr.tournament_role as role
            FROM tournament_team_roles ttr
            JOIN tournament_teams tt ON tt.id = ttr.tournament_team_id
            JOIN users u ON u.id = ttr.user_id
            WHERE tt.team_id = $3 AND tt.division_id = $1 AND ttr.left_at IS NULL
        `;
        const signersResult = await pool.query(signersQuery, [game.division_id, game.home_team_id, game.away_team_id]);
        
        const eligibleSigners = { home: { coaches: [], staff: [] }, away: { coaches: [], staff: [] } };
        const formatName = (r) => `${r.last_name} ${r.first_name ? r.first_name[0]+'.' : ''} ${r.middle_name ? r.middle_name[0]+'.' : ''}`.trim();
        
        signersResult.rows.forEach(r => {
            const name = formatName(r);
            const isCoach = r.role === 'coach' || r.role === 'head_coach';
            if (r.side === 'home') {
                eligibleSigners.home.staff.push({ id: r.id, name, role: r.role });
                if (isCoach) eligibleSigners.home.coaches.push({ id: r.id, name, role: r.role });
            }
            if (r.side === 'away') {
                eligibleSigners.away.staff.push({ id: r.id, name, role: r.role });
                if (isCoach) eligibleSigners.away.coaches.push({ id: r.id, name, role: r.role });
            }
        });

        const refsQuery = `
            SELECT gr.role, gr.user_id as id, u.last_name, u.first_name, u.middle_name
            FROM game_referee gr
            JOIN users u ON u.id = gr.user_id
            WHERE gr.game_id = $1
        `;
        const refsResult = await pool.query(refsQuery, [gameId]);
        const prefilledOfficials = {};
        refsResult.rows.forEach(r => {
            prefilledOfficials[r.role] = { id: r.id, name: formatName(r) };
        });

        const goalieLogResult = await pool.query('SELECT time_seconds, home_goalie_id, away_goalie_id FROM game_goalie_log WHERE game_id = $1 ORDER BY time_seconds ASC', [gameId]);
        const shotsSummaryResult = await pool.query('SELECT team_id, period, shots_count FROM game_shots_summary WHERE game_id = $1', [gameId]);
        const timerResult = await pool.query('SELECT periods_count FROM game_timers WHERE game_id = $1', [gameId]);

        let formattedDate = '';
        let formattedTime = '';
        if (game.game_date) {
            const d = new Date(game.game_date);
            formattedDate = d.toLocaleDateString('ru-RU');
            formattedTime = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }

        const protocolData = {
            info: { 
                division: game.division_name || '', 
                season: game.season_name || '', 
                date: formattedDate, 
                start: formattedTime, 
                arena: game.arena_name || '', 
                gameNum: game.game_number || '', 
                homeScore: game.home_score || 0, 
                awayScore: game.away_score || 0,
                actualStart: game.actual_start_time || '', 
                actualEnd: game.actual_end_time || '',
                spectators: game.spectators      
            },
            teams: {
                home: { id: game.home_team_id, name: game.home_team_name, roster: homeRoster },
                away: { id: game.away_team_id, name: game.away_team_name, roster: awayRoster }
            },
            events: eventsResult.rows,
            signatures,
            eligibleSigners,
            prefilledOfficials,
            goalieLog: goalieLogResult.rows,
            shotsSummary: shotsSummaryResult.rows,
            timerSettings: timerResult.rows[0] || { periods_count: 3 }
        };

        res.json({ success: true, data: protocolData });

    } catch (error) {
        console.error('Ошибка генерации данных протокола:', error);
        res.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
    }
};

export const signProtocol = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { role, userId, pinCode } = req.body;

        if (!role || !userId) {
            return res.status(400).json({ success: false, error: 'Роль или пользователь не указаны' });
        }

        const userRes = await pool.query('SELECT sign_pin_hash, last_name, first_name, middle_name FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0) return res.status(404).json({ success: false, error: 'Пользователь не найден' });
        const user = userRes.rows[0];
        
        let signatureHash = null;
        const finalName = `${user.last_name} ${user.first_name ? user.first_name[0] + '.' : ''}${user.middle_name ? user.middle_name[0] + '.' : ''}`;

        if (role === 'home_coach' || role === 'away_coach') {
            signatureHash = null; 
        } else {
            if (pinCode && pinCode.length === 4) {
                if (!user.sign_pin_hash) return res.status(400).json({ success: false, error: 'У данного пользователя не задан PIN-код (ЭЦП)' });

                const isMatch = await bcrypt.compare(pinCode, user.sign_pin_hash);
                if (!isMatch) return res.status(403).json({ success: false, error: 'Неверный PIN-код' });

                const genSegment = () => Math.floor(1000 + Math.random() * 9000).toString();
                signatureHash = `${genSegment()}-${genSegment()}`;
            } else {
                if (role.includes('off1') || role.includes('off2')) {
                    signatureHash = null;
                } else {
                    return res.status(400).json({ success: false, error: 'Для судейской бригады обязателен PIN-код' });
                }
            }
        }

        await pool.query('DELETE FROM game_protocol_signatures WHERE game_id = $1 AND role = $2', [gameId, role]);
        
        await pool.query(`
            INSERT INTO game_protocol_signatures (game_id, user_id, role, signature_hash, manual_name)
            VALUES ($1, $2, $3, $4, $5)
        `, [gameId, userId, role, signatureHash, finalName]);

        res.json({ success: true, signatureHash, manualName: finalName });

    } catch (error) {
        console.error('Ошибка подписания протокола:', error);
        res.status(500).json({ success: false, error: 'Ошибка сервера при подписании' });
    }
};