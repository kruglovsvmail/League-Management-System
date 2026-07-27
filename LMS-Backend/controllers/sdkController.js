import pool from '../config/db.js';
import path from 'path';
import s3 from '../config/s3.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// ==========================================
// СДК: МЕСТА ПРОВЕДЕНИЯ (sdk_venues)
// ==========================================

export const getSdkVenues = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const result = await pool.query(
      `SELECT id, season_id, name, created_at
       FROM sdk_venues WHERE season_id = $1
       ORDER BY name ASC`,
      [seasonId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения мест проведения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

export const createSdkVenue = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Не указано название' });
    }

    const result = await pool.query(
      `INSERT INTO sdk_venues (season_id, name) VALUES ($1, $2) RETURNING id`,
      [seasonId, name]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Ошибка создания места проведения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const deleteSdkVenue = async (req, res) => {
  try {
    const { id } = req.params;

    const usedCheck = await pool.query('SELECT id FROM sdk_meetings WHERE venue_id = $1 LIMIT 1', [id]);
    if (usedCheck.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Нельзя удалить: это место уже указано в одном из заседаний' });
    }

    await pool.query(`DELETE FROM sdk_venues WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления места проведения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка удаления' });
  }
};

// ==========================================
// СДК: УЧАСТНИКИ КОМИССИИ (sdk_commission_members)
// ==========================================

export const getSdkCommissionMembers = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const result = await pool.query(
      `SELECT cm.id, cm.season_id, cm.full_name, cm.position, cm.created_at,
              cm.user_id, u.first_name, u.last_name, u.middle_name, u.phone, u.avatar_url
       FROM sdk_commission_members cm
       LEFT JOIN users u ON cm.user_id = u.id
       WHERE cm.season_id = $1
       ORDER BY cm.full_name ASC`,
      [seasonId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения участников СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

export const createSdkCommissionMember = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const { full_name, position, user_id } = req.body;

    if (!full_name) {
      return res.status(400).json({ success: false, error: 'Не указано ФИО' });
    }

    const result = await pool.query(
      `INSERT INTO sdk_commission_members (season_id, full_name, position, user_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [seasonId, full_name, position || null, user_id || null]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Этот пользователь уже добавлен в комиссию в этом сезоне' });
    }
    console.error('Ошибка создания участника СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const deleteSdkCommissionMember = async (req, res) => {
  try {
    const { id } = req.params;

    const usedCheck = await pool.query('SELECT id FROM sdk_meeting_members WHERE commission_member_id = $1 LIMIT 1', [id]);
    if (usedCheck.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Нельзя удалить: участник уже отмечен в явке одного из заседаний' });
    }

    await pool.query(`DELETE FROM sdk_commission_members WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления участника СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка удаления' });
  }
};

// ==========================================
// СДК: СПРАВОЧНИК НАРУШЕНИЙ (sdk_violation_types)
// ==========================================

export const getSdkViolationTypes = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const result = await pool.query(
      `SELECT id, season_id, code, title,
              penalty_games_min, penalty_games_max, penalty_amount_min, penalty_amount_max,
              penalty_minutes_note, created_at
       FROM sdk_violation_types WHERE season_id = $1
       ORDER BY code ASC`,
      [seasonId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения справочника нарушений СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

export const createSdkViolationType = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const {
      code, title,
      penalty_games_min, penalty_games_max,
      penalty_amount_min, penalty_amount_max,
      penalty_minutes_note
    } = req.body;

    if (!code || !title) {
      return res.status(400).json({ success: false, error: 'Не заполнены обязательные поля' });
    }

    const result = await pool.query(
      `INSERT INTO sdk_violation_types
        (season_id, code, title, penalty_games_min, penalty_games_max, penalty_amount_min, penalty_amount_max, penalty_minutes_note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        seasonId, code, title,
        penalty_games_min || null, penalty_games_max || penalty_games_min || null,
        penalty_amount_min || null, penalty_amount_max || penalty_amount_min || null,
        penalty_minutes_note || null
      ]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Пункт с таким номером уже существует в этом сезоне' });
    }
    console.error('Ошибка создания пункта нарушения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const deleteSdkViolationType = async (req, res) => {
  try {
    const { id } = req.params;

    const usedCheck = await pool.query('SELECT id FROM sdk_meeting_decisions WHERE violation_type_id = $1 LIMIT 1', [id]);
    if (usedCheck.rows.length > 0) {
      return res.status(409).json({ success: false, error: 'Нельзя удалить: пункт уже использован в одном из решений' });
    }

    await pool.query(`DELETE FROM sdk_violation_types WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления пункта нарушения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка удаления' });
  }
};

// ==========================================
// СДК: ЗАСЕДАНИЯ (sdk_meetings)
// ==========================================

export const getSdkMeetings = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { seasonId, type, status } = req.query;

    const conditions = ['m.league_id = $1'];
    const params = [leagueId];

    if (seasonId) { params.push(seasonId); conditions.push(`m.season_id = $${params.length}`); }
    if (type) { params.push(type); conditions.push(`m.meeting_type = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`m.status = $${params.length}`); }

    const result = await pool.query(`
      SELECT m.id, m.league_id, m.season_id, m.meeting_type, m.venue_id, m.sequence_number,
             m.held_at, m.period_start, m.period_end, m.status, m.created_at,
             COALESCE(m.venue_name_snapshot, v.name) as venue_name, s.name as season_name,
             (SELECT COUNT(*) FROM sdk_meeting_decisions d WHERE d.meeting_id = m.id) as decisions_count
      FROM sdk_meetings m
      LEFT JOIN sdk_venues v ON m.venue_id = v.id
      LEFT JOIN seasons s ON m.season_id = s.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY m.held_at DESC NULLS LAST, m.id DESC
    `, params);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения списка заседаний СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

export const getSdkMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      SELECT m.*, COALESCE(m.venue_name_snapshot, v.name) as venue_name, s.name as season_name
      FROM sdk_meetings m
      LEFT JOIN sdk_venues v ON m.venue_id = v.id
      LEFT JOIN seasons s ON m.season_id = s.id
      WHERE m.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Заседание не найдено' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Ошибка получения заседания СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

const getVenueNameSnapshot = async (venueId) => {
  if (!venueId) return null;
  const res = await pool.query('SELECT name FROM sdk_venues WHERE id = $1', [venueId]);
  return res.rows[0]?.name || null;
};

export const createSdkMeeting = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const { season_id, meeting_type, venue_id, held_at, period_start, period_end, status } = req.body;

    if (!season_id || !meeting_type || !venue_id || !held_at || !period_start || !period_end) {
      return res.status(400).json({ success: false, error: 'Не заполнены обязательные поля' });
    }

    const venueNameSnapshot = await getVenueNameSnapshot(venue_id);

    const seqRes = await pool.query(
      `SELECT COALESCE(MAX(sequence_number), 0) + 1 as next_seq
       FROM sdk_meetings WHERE league_id = $1 AND season_id = $2 AND meeting_type = $3`,
      [leagueId, season_id, meeting_type]
    );
    const sequenceNumber = seqRes.rows[0].next_seq;

    const result = await pool.query(`
      INSERT INTO sdk_meetings (league_id, season_id, meeting_type, venue_id, venue_name_snapshot, sequence_number, held_at, period_start, period_end, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'not_specified'), $11)
      RETURNING id
    `, [
      leagueId, season_id, meeting_type, venue_id, venueNameSnapshot, sequenceNumber,
      held_at, period_start, period_end, status || null, req.user.id
    ]);

    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Ошибка создания заседания СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const updateSdkMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const { season_id, meeting_type, venue_id, sequence_number, held_at, period_start, period_end, status } = req.body;
    const venueNameSnapshot = await getVenueNameSnapshot(venue_id);

    await pool.query(`
      UPDATE sdk_meetings
      SET season_id = $1, meeting_type = $2, venue_id = $3, venue_name_snapshot = $4, sequence_number = $5,
          held_at = $6, period_start = $7, period_end = $8, status = $9, created_by = $10
      WHERE id = $11
    `, [
      season_id || null, meeting_type || 'sdk', venue_id || null, venueNameSnapshot, sequence_number || null,
      held_at || null, period_start || null, period_end || null, status || 'not_specified', req.user.id, id
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка обновления заседания СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const deleteSdkMeeting = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Файлы в S3 не удаляются каскадом на уровне БД — собираем их заранее
    const docsRes = await client.query('SELECT file_url FROM sdk_meeting_documents WHERE meeting_id = $1', [id]);

    // Дисквалификации, назначенные решениями этого заседания — их тоже нужно снять,
    // иначе после удаления заседания они останутся активными без какой-либо привязки
    const disqRes = await client.query(
      'SELECT disqualification_id FROM sdk_meeting_decisions WHERE meeting_id = $1 AND disqualification_id IS NOT NULL',
      [id]
    );
    const disqualificationIds = disqRes.rows.map(r => r.disqualification_id);

    await client.query('BEGIN');
    if (disqualificationIds.length > 0) {
      await client.query('DELETE FROM disqualifications WHERE id = ANY($1::int[])', [disqualificationIds]);
    }
    // Каскадом удалятся: sdk_meeting_members, sdk_meeting_representatives, sdk_meeting_documents, sdk_meeting_decisions
    await client.query('DELETE FROM sdk_meetings WHERE id = $1', [id]);
    await client.query('COMMIT');

    for (const doc of docsRes.rows) {
      if (!doc.file_url) continue;
      try {
        await s3.send(new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME || process.env.S3_BUCKET,
          Key: doc.file_url.replace(/^\//, '')
        }));
      } catch (e) { console.error('Ошибка удаления файла заседания из S3:', e); }
    }

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка удаления заседания СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка удаления' });
  } finally {
    client.release();
  }
};

// ==========================================
// СДК: ЯВКА ЧЛЕНОВ КОМИССИИ (sdk_meeting_members)
// ==========================================

export const getSdkMeetingMembers = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await pool.query(`
      SELECT mm.id, mm.meeting_id, mm.commission_member_id, mm.created_at,
             COALESCE(mm.full_name_snapshot, cm.full_name) as full_name, cm.position,
             u.avatar_url
      FROM sdk_meeting_members mm
      LEFT JOIN sdk_commission_members cm ON mm.commission_member_id = cm.id
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE mm.meeting_id = $1
      ORDER BY full_name ASC
    `, [meetingId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения явки СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

export const addSdkMeetingMember = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { commission_member_id } = req.body;

    if (!commission_member_id) {
      return res.status(400).json({ success: false, error: 'Не выбран участник комиссии' });
    }

    const memberRes = await pool.query('SELECT full_name FROM sdk_commission_members WHERE id = $1', [commission_member_id]);
    if (memberRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Участник комиссии не найден' });
    }

    const result = await pool.query(`
      INSERT INTO sdk_meeting_members (meeting_id, commission_member_id, full_name_snapshot)
      VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id
    `, [meetingId, commission_member_id, memberRes.rows[0].full_name]);

    res.json({ success: true, id: result.rows[0]?.id });
  } catch (err) {
    console.error('Ошибка добавления в явку СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const removeSdkMeetingMember = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM sdk_meeting_members WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления из явки СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка удаления' });
  }
};

// ==========================================
// СДК: ПРЕДСТАВИТЕЛИ КОМАНД (sdk_meeting_representatives)
// ==========================================

export const getSdkMeetingRepresentatives = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await pool.query(`
      SELECT r.id, r.meeting_id, r.tournament_team_id, r.user_id, r.full_name, r.created_at,
             t.name as team_name, u.phone, u.avatar_url
      FROM sdk_meeting_representatives r
      LEFT JOIN tournament_teams tt ON r.tournament_team_id = tt.id
      LEFT JOIN teams t ON tt.team_id = t.id
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.meeting_id = $1
      ORDER BY r.full_name ASC
    `, [meetingId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения представителей СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

export const addSdkMeetingRepresentative = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { full_name, tournament_team_id, user_id } = req.body;

    if (!full_name) {
      return res.status(400).json({ success: false, error: 'Не указано ФИО приглашённого' });
    }

    const result = await pool.query(`
      INSERT INTO sdk_meeting_representatives (meeting_id, full_name, tournament_team_id, user_id)
      VALUES ($1, $2, $3, $4) RETURNING id
    `, [meetingId, full_name, tournament_team_id || null, user_id || null]);

    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Ошибка добавления приглашённого СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const removeSdkMeetingRepresentative = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM sdk_meeting_representatives WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления представителя СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка удаления' });
  }
};

// ==========================================
// СДК: ДОКУМЕНТЫ И СКАНЫ (sdk_meeting_documents)
// ==========================================

export const getSdkMeetingDocuments = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await pool.query(`
      SELECT id, meeting_id, title, file_url, created_by, created_at
      FROM sdk_meeting_documents WHERE meeting_id = $1
      ORDER BY created_at DESC
    `, [meetingId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения документов СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

export const uploadSdkMeetingDocuments = async (req, res) => {
  try {
    const { meetingId } = req.params;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Файлы не переданы' });
    }

    const providedTitle = (req.body.title || '').trim();

    const inserted = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const ext = path.extname(file.originalname).toLowerCase();
      const s3Key = `uploads/sdk_meeting_documents_${meetingId}_${Date.now()}_${Math.round(Math.random() * 1e6)}${ext}`;

      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME || process.env.S3_BUCKET,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype
      }));

      // multer декодирует originalname как latin1, поэтому кириллица без ручного перекодирования превращается в кракозябры
      const decodedOriginalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const title = (i === 0 && providedTitle) ? providedTitle : decodedOriginalName;

      const result = await pool.query(`
        INSERT INTO sdk_meeting_documents (meeting_id, title, file_url, created_by)
        VALUES ($1, $2, $3, $4) RETURNING id
      `, [meetingId, title, `/${s3Key}`, req.user.id]);

      inserted.push(result.rows[0].id);
    }

    res.json({ success: true, ids: inserted });
  } catch (err) {
    console.error('Ошибка загрузки документов СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки файлов' });
  }
};

export const deleteSdkMeetingDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const docRes = await pool.query('SELECT file_url FROM sdk_meeting_documents WHERE id = $1', [id]);
    if (docRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Документ не найден' });
    }

    const { file_url } = docRes.rows[0];
    if (file_url) {
      try {
        await s3.send(new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME || process.env.S3_BUCKET,
          Key: file_url.replace(/^\//, '')
        }));
      } catch (e) { console.error('Ошибка удаления файла из S3:', e); }
    }

    await pool.query(`DELETE FROM sdk_meeting_documents WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления документа СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка удаления' });
  }
};

// ==========================================
// СДК: РЕШЕНИЯ (sdk_meeting_decisions)
// ==========================================

export const getSdkMeetingDecisions = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const result = await pool.query(`
      SELECT dec.id, dec.meeting_id, dec.violation_type_id, dec.game_id, dec.tournament_team_id,
             dec.target_type, dec.tournament_roster_id, dec.tournament_team_role_id, dec.decision, dec.penalty_games,
             dec.penalty_amount, dec.penalty_minutes, dec.penalty_logic, dec.penalty_amount_paid,
             dec.status, dec.disqualification_id, dec.created_at,
             COALESCE(dec.violation_code_snapshot, vt.code) as violation_code,
             COALESCE(dec.violation_title_snapshot, vt.title) as violation_title,
             t.name as team_name, t.logo_url as team_logo, div.name as division_name,
             COALESCE(u.first_name, u2.first_name) as first_name,
             COALESCE(u.last_name, u2.last_name) as last_name,
             COALESCE(u.middle_name, u2.middle_name) as middle_name,
             COALESCE(u.avatar_url, u2.avatar_url) as user_avatar_url,
             COALESCE(
                 (SELECT photo_url FROM team_members tm WHERE tm.user_id = u.id AND tm.team_id = t.id AND tm.photo_url IS NOT NULL ORDER BY tm.id DESC LIMIT 1),
                 (SELECT photo_url FROM team_members tm WHERE tm.user_id = u2.id AND tm.team_id = t.id AND tm.photo_url IS NOT NULL ORDER BY tm.id DESC LIMIT 1)
             ) as team_member_photo_url,
             ttr.tournament_role as staff_role,
             g.game_number, g.game_date,
             dq.games_assigned as dq_games_assigned, dq.games_served as dq_games_served
      FROM sdk_meeting_decisions dec
      LEFT JOIN sdk_violation_types vt ON dec.violation_type_id = vt.id
      JOIN tournament_teams tt ON dec.tournament_team_id = tt.id
      JOIN teams t ON tt.team_id = t.id
      JOIN divisions div ON tt.division_id = div.id
      LEFT JOIN tournament_rosters tr ON dec.tournament_roster_id = tr.id
      LEFT JOIN users u ON tr.player_id = u.id
      LEFT JOIN tournament_team_roles ttr ON dec.tournament_team_role_id = ttr.id
      LEFT JOIN users u2 ON ttr.user_id = u2.id
      LEFT JOIN games g ON dec.game_id = g.id
      LEFT JOIN disqualifications dq ON dec.disqualification_id = dq.id
      WHERE dec.meeting_id = $1
      ORDER BY dec.created_at DESC
    `, [meetingId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения решений СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

const getViolationSnapshot = async (violationTypeId, manualCode, manualTitle) => {
  if (!violationTypeId) return { code: manualCode || null, title: manualTitle || null };
  const res = await pool.query('SELECT code, title FROM sdk_violation_types WHERE id = $1', [violationTypeId]);
  return { code: res.rows[0]?.code || null, title: res.rows[0]?.title || null };
};

export const createSdkMeetingDecision = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const {
      violation_type_id, violation_code_manual, violation_title_manual, game_id, tournament_team_id, target_type,
      tournament_roster_id, tournament_team_role_id, decision, penalty_games, penalty_amount, penalty_minutes, penalty_logic
    } = req.body;

    if ((!violation_type_id && !violation_title_manual) || !tournament_team_id || !decision) {
      return res.status(400).json({ success: false, error: 'Не заполнены обязательные поля' });
    }
    if (target_type === 'player' && !tournament_roster_id) {
      return res.status(400).json({ success: false, error: 'Не выбран игрок-нарушитель' });
    }
    if (target_type === 'staff' && !tournament_team_role_id) {
      return res.status(400).json({ success: false, error: 'Не выбран представитель команды' });
    }

    // Для цели "команда" допустим только денежный штраф — счётчик матчей для неё не имеет смысла
    const safePenaltyGames = target_type === 'team' ? null : (penalty_games || null);

    // Пункт нарушения либо из справочника (violation_type_id), либо вписан вручную —
    // в обоих случаях текст "замораживается" в снапшот, как и при выборе из справочника
    const violationSnapshot = await getViolationSnapshot(violation_type_id, violation_code_manual, violation_title_manual);

    const result = await pool.query(`
      INSERT INTO sdk_meeting_decisions
        (meeting_id, violation_type_id, violation_code_snapshot, violation_title_snapshot, game_id, tournament_team_id, target_type,
         tournament_roster_id, tournament_team_role_id, decision, penalty_games, penalty_amount, penalty_minutes, penalty_logic, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `, [
      meetingId, violation_type_id || null, violationSnapshot.code, violationSnapshot.title, game_id || null, tournament_team_id, target_type || 'player',
      target_type === 'player' ? tournament_roster_id : null,
      target_type === 'staff' ? tournament_team_role_id : null,
      decision, safePenaltyGames, penalty_amount || null, penalty_minutes || null,
      (safePenaltyGames && penalty_amount) ? (penalty_logic || 'and') : null, req.user.id
    ]);

    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Ошибка создания решения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const updateSdkMeetingDecision = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      violation_type_id, violation_code_manual, violation_title_manual, game_id, tournament_team_id, target_type,
      tournament_roster_id, tournament_team_role_id, decision, penalty_games, penalty_amount, penalty_minutes,
      penalty_logic, penalty_amount_paid, status
    } = req.body;

    if ((!violation_type_id && !violation_title_manual) || !tournament_team_id || !decision) {
      return res.status(400).json({ success: false, error: 'Не заполнены обязательные поля' });
    }

    // Для цели "команда" допустим только денежный штраф — счётчик матчей для неё не имеет смысла
    const safePenaltyGames = target_type === 'team' ? null : (penalty_games || null);

    const violationSnapshot = await getViolationSnapshot(violation_type_id, violation_code_manual, violation_title_manual);

    await pool.query(`
      UPDATE sdk_meeting_decisions
      SET violation_type_id = $1, violation_code_snapshot = $2, violation_title_snapshot = $3, game_id = $4, tournament_team_id = $5, target_type = $6,
          tournament_roster_id = $7, tournament_team_role_id = $8, decision = $9, penalty_games = $10, penalty_amount = $11,
          penalty_minutes = $12, penalty_logic = $13, penalty_amount_paid = $14, status = $15
      WHERE id = $16
    `, [
      violation_type_id || null, violationSnapshot.code, violationSnapshot.title, game_id || null, tournament_team_id, target_type || 'player',
      target_type === 'player' ? tournament_roster_id : null,
      target_type === 'staff' ? tournament_team_role_id : null,
      decision, safePenaltyGames, penalty_amount || null, penalty_minutes || null,
      (safePenaltyGames && penalty_amount) ? (penalty_logic || 'and') : null,
      penalty_amount_paid || false, status || 'active', id
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка обновления решения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const togglePaidSdkMeetingDecision = async (req, res) => {
  try {
    const { id } = req.params;

    const decRes = await pool.query(`SELECT disqualification_id, penalty_amount_paid FROM sdk_meeting_decisions WHERE id = $1`, [id]);
    if (decRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Решение не найдено' });
    }
    const newPaid = !decRes.rows[0].penalty_amount_paid;

    // Ledger (disqualifications) — источник истины для автозавершения (BEFORE-триггер
    // disqualification_auto_complete сам решит, наступило ли "Отбыто" по факту оплаты).
    // AFTER-триггер disqualification_sync_decision, который обычно тянет статус обратно
    // в sdk_meeting_decisions, гасится защитой от рекурсии (pg_trigger_depth() <= 1) на глубоких
    // уровнях этого конкретного каскада — поэтому статус решения дописываем здесь явно,
    // не полагаясь на то, что каскад триггеров сам донесёт его до решения.
    let newStatus = null;
    if (decRes.rows[0].disqualification_id) {
      const dqRes = await pool.query(`
        UPDATE disqualifications SET penalty_amount_paid = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING status
      `, [newPaid, decRes.rows[0].disqualification_id]);
      newStatus = dqRes.rows[0]?.status || null;
    }

    await pool.query(`
      UPDATE sdk_meeting_decisions
      SET penalty_amount_paid = $1, status = COALESCE($2, status)
      WHERE id = $3
    `, [newPaid, newStatus, id]);

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка отметки оплаты решения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const deleteSdkMeetingDecision = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const decRes = await client.query('SELECT disqualification_id FROM sdk_meeting_decisions WHERE id = $1', [id]);
    if (decRes.rows.length === 0) {
      client.release();
      return res.status(404).json({ success: false, error: 'Решение не найдено' });
    }
    const { disqualification_id } = decRes.rows[0];

    await client.query('BEGIN');
    await client.query('DELETE FROM sdk_meeting_decisions WHERE id = $1', [id]);
    if (disqualification_id) {
      await client.query('DELETE FROM disqualifications WHERE id = $1', [disqualification_id]);
    }
    await client.query('COMMIT');

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка удаления решения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка удаления' });
  } finally {
    client.release();
  }
};
