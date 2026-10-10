import pool from '../config/db.js';
import { calculateNomination } from '../utils/nominationCalculator.js';
import { calculateBroadcastPowerPlays } from '../utils/broadcastPowerPlay.js';
import { METRIC_DEFS, metricAvailableInDivision } from '../utils/nominationMetrics.js';

// Только зрительские данные. Настройки и права общей базы не изменяются.
export async function getPublicBroadcastData(req, res) {
  const gameId = Number(req.params.gameId);
  if (!Number.isSafeInteger(gameId) || gameId < 1) return res.status(400).json({
    success: false,
    error: 'Некорректный матч'
  });
  try {
    const context = await pool.query(`
   SELECT g.id,g.division_id,g.stage_type,g.home_team_id,g.away_team_id,d.name AS division_name,
    d.reg_track_shots,d.playoff_track_shots,d.reg_track_plus_minus,d.playoff_track_plus_minus
   FROM games g LEFT JOIN divisions d ON d.id=g.division_id WHERE g.id=$1
  `, [gameId]);
    const game = context.rows[0];
    if (!game) return res.status(404).json({
      success: false,
      error: 'Матч не найден'
    });
    const teamIds = [game.home_team_id, game.away_team_id].filter(Boolean);
    const [standingsRes, bracketsRes, nominationRes, gamesRes] = await Promise.all([game.division_id ? pool.query(`
    SELECT ds.team_id,ds.games_played,ds.wins_reg,ds.wins_ot,ds.draws,ds.losses_ot,ds.losses_reg,
     ds.goals_for,ds.goals_against,ds.points,ds.rank,(ds.goals_for-ds.goals_against) AS goals_diff,
     COALESCE(tt.snap_name,t.name) AS team_name,COALESCE(tt.snap_logo_url,t.logo_url) AS logo_url
    FROM division_standings ds JOIN teams t ON t.id=ds.team_id
    JOIN tournament_teams tt ON tt.team_id=ds.team_id AND tt.division_id=ds.division_id
    WHERE ds.division_id=$1 AND tt.status='approved' ORDER BY ds.rank,t.name
   `, [game.division_id]) : {
      rows: []
    }, game.division_id ? pool.query('SELECT id,name,is_main FROM playoff_brackets WHERE division_id=$1 ORDER BY is_main DESC,id', [game.division_id]) : {
      rows: []
    }, game.division_id ? pool.query('SELECT * FROM division_nominations WHERE division_id=$1 ORDER BY display_order,id', [game.division_id]) : {
      rows: []
    }, pool.query(`
    SELECT g.id,g.home_team_id,g.away_team_id,g.home_score,g.away_score,g.end_type,g.stage_type,
     gt.periods_count,gt.ot_length,gt.period_length,gt.time_seconds AS elapsed_seconds
    FROM games g LEFT JOIN game_timers gt ON gt.game_id=g.id
    WHERE g.status='finished' AND g.is_technical IS NULL
     AND ($1::int IS NULL OR g.division_id=$1)
     AND (g.home_team_id=ANY($2::int[]) OR g.away_team_id=ANY($2::int[]))
   `, [game.division_id, teamIds])]);
    const brackets = bracketsRes.rows;
    if (brackets.length) {
      const ids = brackets.map(b => b.id);
      const [roundsRes, matchupsRes] = await Promise.all([pool.query('SELECT id,bracket_id,name,order_index,wins_needed FROM playoff_rounds WHERE bracket_id=ANY($1::int[]) ORDER BY order_index,id', [ids]), pool.query(`
     SELECT m.id,m.round_id,m.matchup_number,m.team1_id,m.team2_id,m.team1_wins,m.team2_wins,m.winner_id,
      m.team1_source_type,m.team1_source_id,m.team2_source_type,m.team2_source_id,m.ui_metadata,
      COALESCE(tt1.snap_name,t1.name) AS team1_name,COALESCE(tt1.snap_logo_url,t1.logo_url) AS team1_logo,
      COALESCE(tt2.snap_name,t2.name) AS team2_name,COALESCE(tt2.snap_logo_url,t2.logo_url) AS team2_logo
     FROM playoff_matchups m JOIN playoff_rounds r ON r.id=m.round_id
     LEFT JOIN teams t1 ON t1.id=m.team1_id LEFT JOIN teams t2 ON t2.id=m.team2_id
     LEFT JOIN tournament_teams tt1 ON tt1.team_id=m.team1_id AND tt1.division_id=$2
     LEFT JOIN tournament_teams tt2 ON tt2.team_id=m.team2_id AND tt2.division_id=$2
     WHERE r.bracket_id=ANY($1::int[]) ORDER BY m.matchup_number,m.id
    `, [ids, game.division_id])]);
      for (const bracket of brackets) bracket.rounds = roundsRes.rows.filter(r => r.bracket_id === bracket.id).map(r => ({
        ...r,
        matchups: matchupsRes.rows.filter(m => m.round_id === r.id)
      }));
    }
    const photos = game.division_id && nominationRes.rows.length ? await pool.query(`
   SELECT DISTINCT ON (tt.team_id,tr.player_id) tt.team_id,tr.player_id,tr.jersey_number,
    COALESCE(tr.photo_snapshot_url,tm.photo_url) AS photo_url
   FROM tournament_rosters tr JOIN tournament_teams tt ON tt.id=tr.tournament_team_id
   LEFT JOIN team_members tm ON tm.team_id=tt.team_id AND tm.user_id=tr.player_id
   WHERE tt.division_id=$1 AND tr.application_status='approved'
   ORDER BY tt.team_id,tr.player_id,tr.period_end NULLS FIRST,tr.id DESC
  `, [game.division_id]) : {
      rows: []
    };
    const photoMap = new Map(photos.rows.map(p => [`${p.team_id}:${p.player_id}`, p]));
    const nominations = await Promise.all(nominationRes.rows.map(async n => {
      const def = METRIC_DEFS[n.metric];
      const available = metricAvailableInDivision(n.metric, game, n.stage_type);
      let players = [];
      if (available) try {
        players = (await calculateNomination(n)).map(p => {
          const photo = photoMap.get(`${p.team_id}:${p.player_id}`);
          return {
            ...p,
            avatar_url: photo?.photo_url || p.avatar_url,
            jersey_number: photo?.jersey_number ?? null
          };
        });
      } catch (error) {
        console.error(`Номинация трансляции #${n.id}:`, error.message);
      }
      return {
        id: n.id,
        name: n.name,
        metric: n.metric,
        metric_label: def?.label || n.metric,
        metric_format: def?.format || 'int',
        scope: n.scope,
        available,
        players: players.slice(0, 5)
      };
    }));
    const rosterRes = await pool.query(`
      SELECT gr.player_id,gr.team_id,gr.position_in_line AS protocol_position,
        formation.line_number,formation.position_in_line,
        COALESCE(gr.jersey_number,formation.jersey_number,snapshot.jersey_number,club_roster.jersey_number) AS jersey_number,
        COALESCE(gr.is_captain,snapshot.is_captain,false) AS is_captain,
        COALESCE(gr.is_assistant,snapshot.is_assistant,false) AS is_assistant,
        COALESCE(snapshot.position,club_roster.position) AS position,
        u.first_name,u.last_name,COALESCE(snapshot.photo_snapshot_url,member_info.photo_url,u.avatar_url) AS avatar_url
      FROM game_rosters gr JOIN users u ON u.id=gr.player_id
      LEFT JOIN LATERAL (
        SELECT tm.id,tm.photo_url FROM team_members tm
        WHERE tm.team_id=gr.team_id AND tm.user_id=gr.player_id AND tm.left_at IS NULL ORDER BY tm.id DESC LIMIT 1
      ) member_info ON true
      LEFT JOIN LATERAL (
        SELECT tr.position,tr.jersey_number FROM team_rosters tr
        WHERE tr.member_id=member_info.id AND tr.left_at IS NULL ORDER BY tr.id DESC LIMIT 1
      ) club_roster ON true
      LEFT JOIN LATERAL (
        SELECT tr.position,tr.photo_snapshot_url,tr.jersey_number,tr.is_captain,tr.is_assistant
        FROM tournament_rosters tr JOIN tournament_teams tt ON tt.id=tr.tournament_team_id
        WHERE tt.division_id=$2 AND tt.team_id=gr.team_id AND tr.player_id=gr.player_id AND tr.application_status='approved'
        ORDER BY tr.period_end NULLS FIRST,tr.id DESC LIMIT 1
      ) snapshot ON true
      LEFT JOIN LATERAL (
        SELECT f.line_number,f.position_in_line,f.jersey_number FROM team_formation_game f
        WHERE f.game_id=gr.game_id AND f.team_id=gr.team_id AND f.player_id=gr.player_id
        ORDER BY f.line_number,f.position_in_line LIMIT 1
      ) formation ON true
      WHERE gr.game_id=$1 AND gr.is_in_lineup=true ORDER BY gr.team_id,gr.jersey_number,u.last_name
    `, [gameId, game.division_id]);
    const home_formation = rosterRes.rows.filter(p => p.team_id === game.home_team_id);
    const away_formation = rosterRes.rows.filter(p => p.team_id === game.away_team_id);
    const roster_page_count = [home_formation, away_formation].reduce((total, roster) => {
      const used = new Set();
      for (let line = 1; line <= 4; line++) for (const position of ['LW', 'C', 'RW', 'LD', 'RD']) {
        const p = roster.find(p => Number(p.line_number) === line && p.position_in_line === position && !used.has(p.player_id));
        if (p) used.add(p.player_id);
      }
      const isGoalie = p => p.position_in_line ? p.position_in_line === 'G' : p.protocol_position === 'G' || p.position === 'goalie';
      const goalies = roster.filter(isGoalie).length;
      const extra = roster.filter(p => !isGoalie(p) && !used.has(p.player_id)).length;
      return total + Math.max(1, Math.ceil(goalies / 2), Math.ceil(extra / (used.size ? 5 : 20)));
    }, 0);
    const comparison = {};
    for (const id of teamIds) comparison[id] = {
      games_played: 0,
      wins: 0,
      wins_reg: 0,
      wins_ot: 0,
      draws: 0,
      losses: 0,
      losses_reg: 0,
      losses_ot: 0,
      goals_for: 0,
      goals_against: 0,
      penalty_minutes: 0,
      goals_pp: 0,
      goals_sh: 0,
      shots: 0
    };
    for (const match of gamesRes.rows) for (const side of ['home', 'away']) {
      const stat = comparison[match[`${side}_team_id`]];
      if (!stat) continue;
      const scored = Number(match[`${side}_score`]) || 0;
      const conceded = Number(match[`${side === 'home' ? 'away' : 'home'}_score`]) || 0;
      stat.games_played++;
      stat.goals_for += scored;
      stat.goals_against += conceded;
      const extra = match.end_type && !['regular', 'reg'].includes(match.end_type);
      if (scored > conceded) {
        stat.wins++;
        stat[extra ? 'wins_ot' : 'wins_reg']++;
      } else if (scored < conceded) {
        stat.losses++;
        stat[extra ? 'losses_ot' : 'losses_reg']++;
      } else stat.draws++;
    }
    const gameIds = gamesRes.rows.map(g => g.id);
    const [eventsRes, shotsRes, emptyRes, powerPlayEventsRes] = gameIds.length ? await Promise.all([pool.query(`
    SELECT team_id,
     COALESCE(SUM(penalty_minutes) FILTER (WHERE event_type='penalty'),0)::int AS penalty_minutes,
     COUNT(*) FILTER (WHERE event_type='goal' AND goal_strength IN ('pp1','pp2'))::int AS goals_pp,
     COUNT(*) FILTER (WHERE event_type='goal' AND goal_strength IN ('sh1','sh2'))::int AS goals_sh
    FROM game_events WHERE game_id=ANY($1::int[]) GROUP BY team_id
   `, [gameIds]), pool.query(`
    SELECT s.game_id,s.period,CASE WHEN s.team_id=g.home_team_id THEN g.away_team_id ELSE g.home_team_id END AS team_id,
     SUM(s.shots_count)::int AS shots
    FROM game_shots_by_goalie s JOIN games g ON g.id=s.game_id
    WHERE s.game_id=ANY($1::int[]) GROUP BY s.game_id,s.period,g.home_team_id,g.away_team_id,s.team_id
   `, [gameIds]), pool.query(`
    SELECT ge.team_id,COUNT(*)::int AS shots FROM game_events ge JOIN games g ON g.id=ge.game_id
    JOIN LATERAL (
     SELECT gl.home_goalie_id,gl.away_goalie_id,gl.home_goalie_unspecified,gl.away_goalie_unspecified
     FROM game_goalie_log gl WHERE gl.game_id=ge.game_id AND gl.time_seconds<=ge.time_seconds
     ORDER BY gl.time_seconds DESC,gl.id DESC LIMIT 1
    ) goalie ON true
    WHERE ge.game_id=ANY($1::int[]) AND ge.event_type='goal' AND COALESCE(ge.from_shot,true)
     AND CASE WHEN ge.team_id=g.home_team_id
      THEN goalie.away_goalie_id IS NULL AND NOT COALESCE(goalie.away_goalie_unspecified,true)
      ELSE goalie.home_goalie_id IS NULL AND NOT COALESCE(goalie.home_goalie_unspecified,true) END
    GROUP BY ge.team_id
   `, [gameIds]), pool.query(`
      SELECT id,game_id,team_id,event_type,time_seconds,goal_strength,penalty_class,penalty_minutes,
        penalty_end_time,penalty_group_id,penalty_group_seq,penalty_pair_id
      FROM game_events WHERE game_id=ANY($1::int[]) AND event_type IN ('penalty','goal') ORDER BY game_id,id
   `, [gameIds])]) : [{
      rows: []
    }, {
      rows: []
    }, {
      rows: []
    }];
    const powerPlays = calculateBroadcastPowerPlays(gamesRes.rows, powerPlayEventsRes?.rows || []);
    for (const row of eventsRes.rows) if (comparison[row.team_id]) Object.assign(comparison[row.team_id], row);
    for (const row of [...shotsRes.rows, ...emptyRes.rows]) if (comparison[row.team_id]) comparison[row.team_id].shots += Number(row.shots);
    for (const id of teamIds) {
      const stat = comparison[id],
        standing = standingsRes.rows.find(s => s.team_id === id);
      stat.goals_diff = stat.goals_for - stat.goals_against;
      stat.goals_for_avg = stat.games_played ? stat.goals_for / stat.games_played : 0;
      stat.goals_against_avg = stat.games_played ? stat.goals_against / stat.games_played : 0;
      stat.power_play_opportunities = powerPlays.get(String(id)) || 0;
      stat.power_play_pct = stat.power_play_opportunities ? stat.goals_pp / stat.power_play_opportunities * 100 : null;
      stat.points = standing?.points ?? null;
      stat.rank = standing?.rank ?? null;
      const matches = gamesRes.rows.filter(g => g.home_team_id === id || g.away_team_id === id);
      const complete = matches.every(g => {
        const periods = Array.from({
          length: Number(g.periods_count) || 3
        }, (_, i) => String(i + 1));
        if (['ot', 'overtime'].includes(g.end_type) || ['so', 'shootout'].includes(g.end_type) && Number(g.ot_length) > 0) periods.push('OT');
        return periods.every(period => shotsRes.rows.some(s => s.game_id === g.id && s.team_id === id && String(s.period) === period)) && (!game.division_id || (g.stage_type === 'playoff' ? game.playoff_track_shots : game.reg_track_shots));
      });
      const tracked = game.division_id ? game.stage_type === 'playoff' ? game.playoff_track_shots : game.reg_track_shots : matches.length > 0;
      if (!complete || !tracked) stat.shots = null;
    }
    const available_metrics = ['games_played', 'wins', 'wins_reg', 'wins_ot', 'draws', 'losses', 'losses_reg', 'losses_ot', 'goals_for', 'goals_against', 'goals_diff', 'goals_for_avg', 'goals_against_avg', 'penalty_minutes', 'goals_pp', 'goals_sh', 'power_play_pct'];
    if (teamIds.some(id => comparison[id].points != null)) available_metrics.push('points', 'rank');
    if (teamIds.some(id => comparison[id].shots != null)) available_metrics.push('shots');
    res.json({
      success: true,
      data: {
        division_id: game.division_id,
        standings: standingsRes.rows,
        brackets,
        nominations,
        comparison,
        available_metrics,
        roster_page_count,
        home_formation,
        away_formation,
        scope_label: game.division_id ? 'Статистика дивизиона · сыгранные матчи' : 'Карьера за команду'
      }
    });
  } catch (error) {
    console.error('Данные графики трансляции:', error.message);
    res.status(500).json({
      success: false,
      error: 'Ошибка загрузки данных графики'
    });
  }
}
