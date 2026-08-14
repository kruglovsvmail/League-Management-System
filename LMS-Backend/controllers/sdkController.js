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
      `SELECT cm.id, cm.season_id, cm.full_name, cm.position, cm.is_permanent, cm.created_at,
              cm.user_id, u.first_name, u.last_name, u.middle_name, u.phone, u.avatar_url
       FROM sdk_commission_members cm
       LEFT JOIN users u ON cm.user_id = u.id
       WHERE cm.season_id = $1
       ORDER BY cm.is_permanent DESC, cm.full_name ASC`,
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

// Штатность — признак сезона, а не отдельного заседания: такие члены комиссии
// автоматически попадают в явку каждого нового заседания этого сезона.
export const setSdkCommissionMemberPermanent = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_permanent } = req.body;

    const result = await pool.query(
      `UPDATE sdk_commission_members SET is_permanent = $1 WHERE id = $2 RETURNING id, is_permanent`,
      [!!is_permanent, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Участник не найден' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Ошибка изменения штатности участника СДК:', err);
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

const VIOLATION_TYPE_COLUMNS = `id, season_id, row_type, sort_order, code, title,
              mandatory_games_min, mandatory_games_max, additional_games_min, additional_games_max,
              additional_amount_min, additional_amount_max,
              penalty_minutes_note, is_team_penalty, split_among_members, created_at`;

// Заголовки и подзаголовки живут в той же таблице, что и пункты (row_type), потому что
// порядок в "Таблице штрафов" чередуется: секция → подсекция → пункты → следующая секция.
// Единственный источник порядка — sort_order, код пункта для сортировки не годится
// (пункты повторяются, а у заголовков кода нет вовсе).
const normalizeViolationTypeBody = (body) => {
  const rowType = ['section', 'subsection', 'violation'].includes(body.row_type) ? body.row_type : 'violation';
  const isHeader = rowType !== 'violation';
  const isTeamPenalty = !isHeader && !!body.is_team_penalty;

  return {
    row_type: rowType,
    code: body.code?.trim() || null,
    title: body.title?.trim() || '',
    // У заголовков нет санкций, у командных штрафов — только деньги (матчи команде не назначаются)
    mandatory_games_min: isHeader || isTeamPenalty ? null : (body.mandatory_games_min || null),
    mandatory_games_max: isHeader || isTeamPenalty ? null : (body.mandatory_games_max || body.mandatory_games_min || null),
    additional_games_min: isHeader || isTeamPenalty ? null : (body.additional_games_min || null),
    additional_games_max: isHeader || isTeamPenalty ? null : (body.additional_games_max || body.additional_games_min || null),
    additional_amount_min: isHeader ? null : (body.additional_amount_min || null),
    additional_amount_max: isHeader ? null : (body.additional_amount_max || body.additional_amount_min || null),
    penalty_minutes_note: isHeader ? null : (body.penalty_minutes_note?.trim() || null),
    is_team_penalty: isTeamPenalty,
    split_among_members: isTeamPenalty && !!body.split_among_members
  };
};

export const getSdkViolationTypes = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const result = await pool.query(
      `SELECT ${VIOLATION_TYPE_COLUMNS}
       FROM sdk_violation_types WHERE season_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [seasonId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения справочника нарушений СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

// POST /seasons/:seasonId/sdk/violation-types/copy  { fromSeasonId }
// Клонирование таблицы штрафов из другого сезона. Разрешаем только в пустой справочник:
// порядок строк держится на sort_order, и подмешивание чужих секций в уже заполненную
// таблицу перемешало бы разделы с пунктами.
export const copySdkViolationTypes = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const { fromSeasonId } = req.body;

    if (!fromSeasonId) return res.status(400).json({ success: false, error: 'Не выбран сезон-источник' });
    if (String(fromSeasonId) === String(seasonId)) {
      return res.status(400).json({ success: false, error: 'Нельзя скопировать справочник сезона в него же' });
    }

    const existing = await pool.query('SELECT 1 FROM sdk_violation_types WHERE season_id = $1 LIMIT 1', [seasonId]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ success: false, error: 'Копирование доступно только в пустой справочник' });
    }

    const { rows } = await pool.query(`
      INSERT INTO sdk_violation_types (
        season_id, row_type, sort_order, code, title,
        mandatory_games_min, mandatory_games_max, additional_games_min, additional_games_max,
        additional_amount_min, additional_amount_max,
        penalty_minutes_note, is_team_penalty, split_among_members
      )
      SELECT $1, src.row_type, src.sort_order, src.code, src.title,
             src.mandatory_games_min, src.mandatory_games_max, src.additional_games_min, src.additional_games_max,
             src.additional_amount_min, src.additional_amount_max,
             src.penalty_minutes_note, src.is_team_penalty, src.split_among_members
      FROM sdk_violation_types src
      WHERE src.season_id = $2
      ORDER BY src.sort_order ASC, src.id ASC
      RETURNING id
    `, [seasonId, fromSeasonId]);

    res.json({ success: true, copied: rows.length });
  } catch (err) {
    console.error('Ошибка копирования справочника нарушений СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

export const createSdkViolationType = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const v = normalizeViolationTypeBody(req.body);

    if (!v.title) {
      return res.status(400).json({ success: false, error: 'Не заполнен текст' });
    }
    if (v.row_type === 'violation' && !v.code) {
      return res.status(400).json({ success: false, error: 'Не заполнен номер пункта' });
    }

    // Новая строка всегда встаёт в конец списка сезона — дальше её переносят перетаскиванием
    const result = await pool.query(
      `INSERT INTO sdk_violation_types
        (season_id, row_type, code, title, mandatory_games_min, mandatory_games_max, additional_games_min, additional_games_max,
         additional_amount_min, additional_amount_max, penalty_minutes_note, is_team_penalty, split_among_members, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
               (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM sdk_violation_types WHERE season_id = $1))
       RETURNING id`,
      [
        seasonId, v.row_type, v.code, v.title,
        v.mandatory_games_min, v.mandatory_games_max, v.additional_games_min, v.additional_games_max,
        v.additional_amount_min, v.additional_amount_max, v.penalty_minutes_note,
        v.is_team_penalty, v.split_among_members
      ]
    );
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Ошибка создания пункта нарушения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const updateSdkViolationType = async (req, res) => {
  try {
    const { id } = req.params;
    const v = normalizeViolationTypeBody(req.body);

    if (!v.title) {
      return res.status(400).json({ success: false, error: 'Не заполнен текст' });
    }
    if (v.row_type === 'violation' && !v.code) {
      return res.status(400).json({ success: false, error: 'Не заполнен номер пункта' });
    }

    // Снапшоты в вынесенных решениях (violation_code_snapshot / violation_title_snapshot)
    // намеренно не трогаем: решение должно хранить формулировку на момент его вынесения.
    const result = await pool.query(
      `UPDATE sdk_violation_types
       SET row_type = $1, code = $2, title = $3,
           mandatory_games_min = $4, mandatory_games_max = $5, additional_games_min = $6, additional_games_max = $7,
           additional_amount_min = $8, additional_amount_max = $9, penalty_minutes_note = $10,
           is_team_penalty = $11, split_among_members = $12
       WHERE id = $13
       RETURNING ${VIOLATION_TYPE_COLUMNS}`,
      [
        v.row_type, v.code, v.title,
        v.mandatory_games_min, v.mandatory_games_max, v.additional_games_min, v.additional_games_max,
        v.additional_amount_min, v.additional_amount_max, v.penalty_minutes_note,
        v.is_team_penalty, v.split_among_members, id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Пункт не найден' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Ошибка обновления пункта нарушения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  }
};

export const reorderSdkViolationTypes = async (req, res) => {
  const client = await pool.connect();
  try {
    const { seasonId } = req.params;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Не передан порядок строк' });
    }

    await client.query('BEGIN');
    // Порядок задаётся позицией в массиве; ограничение по season_id не даёт перетащить
    // строку в чужой сезон подменой id в запросе
    await client.query(
      `UPDATE sdk_violation_types t
       SET sort_order = v.ord
       FROM (SELECT * FROM unnest($1::int[]) WITH ORDINALITY AS u(id, ord)) v
       WHERE t.id = v.id AND t.season_id = $2`,
      [ids.map(Number), seasonId]
    );
    await client.query('COMMIT');

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка сортировки справочника нарушений СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения порядка' });
  } finally {
    client.release();
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
    const { season_id, meeting_type, venue_id, held_at, period_start, period_end, status, invited } = req.body;

    // Период рассмотрения необязателен: он лишь сужает выборку судей для рапорта,
    // а само заседание может быть заведено и без него
    if (!season_id || !meeting_type || !venue_id || !held_at) {
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
      held_at, period_start || null, period_end || null, status || null, req.user.id
    ]);

    // Штатных членов комиссии сезона сразу отмечаем в явке нового заседания —
    // ФИО фиксируем снимком, как и при ручном добавлении
    await pool.query(`
      INSERT INTO sdk_meeting_members (meeting_id, commission_member_id, full_name_snapshot)
      SELECT $1, cm.id, cm.full_name
      FROM sdk_commission_members cm
      WHERE cm.season_id = $2 AND cm.is_permanent = true
      ON CONFLICT ON CONSTRAINT sdk_meeting_members_unique DO NOTHING
    `, [result.rows[0].id, season_id]);

    // Приглашённые (судьи, руководители команд) — отмечены в шторке создания заседания.
    // ФИО фиксируем снимком: человек может позже покинуть команду или лигу.
    const invitedIds = [...new Set((invited || []).map(i => Number(i.user_id)).filter(Boolean))];
    if (invitedIds.length > 0) {
      const roles = new Map((invited || []).map(i => [Number(i.user_id), i.role_snapshot?.trim() || null]));
      await pool.query(`
        INSERT INTO sdk_meeting_members (meeting_id, member_kind, user_id, full_name_snapshot, role_snapshot)
        SELECT $1, 'invited', u.id,
               concat_ws(' ', u.last_name, u.first_name, u.middle_name),
               r.role
        FROM users u
        JOIN (SELECT * FROM unnest($2::int[], $3::text[]) AS t(user_id, role)) r ON r.user_id = u.id
        ON CONFLICT DO NOTHING
      `, [result.rows[0].id, invitedIds, invitedIds.map(uid => roles.get(uid))]);
    }

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
    // Сюда попадают и обычные наказания решений, и доли участников командного штрафа
    // с делением (sdk_decision_members) — они тоже живут в ledger отдельными записями
    const disqRes = await client.query(`
      SELECT dec.disqualification_id AS id
      FROM sdk_meeting_decisions dec
      WHERE dec.meeting_id = $1 AND dec.disqualification_id IS NOT NULL
      UNION
      SELECT dm.disqualification_id
      FROM sdk_decision_members dm
      JOIN sdk_meeting_decisions dec ON dec.id = dm.decision_id
      WHERE dec.meeting_id = $1 AND dm.disqualification_id IS NOT NULL
    `, [id]);
    const disqualificationIds = disqRes.rows.map(r => r.id);

    await client.query('BEGIN');
    // Порядок принципиален: сперва заседание. Если удалить наказание раньше, внешний ключ
    // решения (ON DELETE SET NULL) обнулит disqualification_id, и этот UPDATE поднимет триггер
    // sdk_sync_disqualification — и тот заведёт наказание заново, уже без привязки к заседанию.
    // Каскадом удалятся: sdk_meeting_members, sdk_meeting_documents,
    // sdk_meeting_decisions и связанные с ними sdk_decision_members
    await client.query('DELETE FROM sdk_meetings WHERE id = $1', [id]);
    if (disqualificationIds.length > 0) {
      await client.query('DELETE FROM disqualifications WHERE id = ANY($1::int[])', [disqualificationIds]);
    }
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
      SELECT mm.id, mm.meeting_id, mm.commission_member_id, mm.member_kind, mm.user_id, mm.created_at,
             COALESCE(mm.full_name_snapshot, cm.full_name) as full_name,
             COALESCE(mm.role_snapshot, cm.position) as position,
             COALESCE(u.avatar_url, iu.avatar_url) as avatar_url
      FROM sdk_meeting_members mm
      LEFT JOIN sdk_commission_members cm ON mm.commission_member_id = cm.id
      LEFT JOIN users u ON cm.user_id = u.id
      LEFT JOIN users iu ON mm.user_id = iu.id
      WHERE mm.meeting_id = $1
      ORDER BY mm.member_kind ASC, full_name ASC
    `, [meetingId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения явки СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

// Главные судьи матчей, попадающих в период рассмотрения заседания — из них выбирают
// автора рапорта. Дивизион необязателен: без него берём все матчи периода.
// Период рассмотрения тоже необязателен: незаполненная граница просто не сужает выборку,
// а рамкой в этом случае остаётся сезон заседания.
export const getSdkMeetingReferees = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { divisionId } = req.query;

    const result = await pool.query(`
      SELECT DISTINCT u.id AS user_id, u.first_name, u.last_name, u.middle_name
      FROM sdk_meetings m
      JOIN divisions gd ON gd.season_id = m.season_id
      JOIN games g ON g.division_id = gd.id
        AND (m.period_start IS NULL OR g.game_date >= m.period_start)
        AND (m.period_end IS NULL OR g.game_date <= m.period_end)
        AND ($2::int IS NULL OR g.division_id = $2)
      JOIN game_staff gs ON gs.game_id = g.id AND gs.role IN ('main-1', 'main-2')
      JOIN users u ON u.id = gs.user_id
      WHERE m.id = $1
      ORDER BY u.last_name, u.first_name
    `, [meetingId, divisionId || null]);

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения судей периода заседания:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

// Кого можно позвать на заседание помимо комиссии: судьи лиги и руководители команд сезона.
// Список собирается по людям, а не по заявкам — один человек может вести несколько команд.
export const getSdkInviteeCandidates = async (req, res) => {
  try {
    const { seasonId } = req.params;
    const result = await pool.query(`
      SELECT u.id AS user_id, u.first_name, u.last_name, u.middle_name, u.avatar_url,
             'referee' AS kind, NULL AS roles, NULL AS teams
      FROM league_staff ls
      JOIN users u ON u.id = ls.user_id
      JOIN seasons s ON s.id = $1
      WHERE ls.league_id = s.league_id AND ls.end_date IS NULL AND ls.role = 'referee'
        -- Штатные члены комиссии и так попадают в явку каждого заседания автоматически:
        -- в списке приглашённых они были бы дублем самих себя
        AND NOT EXISTS (
          SELECT 1 FROM sdk_commission_members cm
          WHERE cm.season_id = $1 AND cm.is_permanent = true AND cm.user_id = u.id
        )

      UNION ALL

      -- Из состава команд зовут только руководителей (подписантов заявки) —
      -- тренеры и администраторы на заседание не приглашаются
      SELECT u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url,
             'team_staff' AS kind,
             string_agg(DISTINCT ttr.tournament_role, ', ') AS roles,
             string_agg(DISTINCT t.name, ', ') AS teams
      FROM tournament_team_roles ttr
      JOIN tournament_teams tt ON tt.id = ttr.tournament_team_id
      JOIN divisions dv ON dv.id = tt.division_id
      JOIN teams t ON t.id = tt.team_id
      JOIN users u ON u.id = ttr.user_id
      WHERE dv.season_id = $1 AND ttr.left_at IS NULL AND ttr.tournament_role = 'team_manager'
      GROUP BY u.id, u.first_name, u.last_name, u.middle_name, u.avatar_url

      ORDER BY 3, 2
    `, [seasonId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('Ошибка получения кандидатов в приглашённые СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка загрузки данных' });
  }
};

export const addSdkMeetingMember = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const { commission_member_id, user_id, role_snapshot } = req.body;

    // Приглашённый — человек вне комиссии (судья или руководитель команды):
    // у него нет строки в справочнике, поэтому ФИО и роль сохраняем снимком
    if (!commission_member_id && user_id) {
      const userRes = await pool.query('SELECT first_name, last_name, middle_name FROM users WHERE id = $1', [user_id]);
      if (userRes.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
      }
      const u = userRes.rows[0];
      const fullName = [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(' ');

      const invited = await pool.query(`
        INSERT INTO sdk_meeting_members (meeting_id, member_kind, user_id, full_name_snapshot, role_snapshot)
        VALUES ($1, 'invited', $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id
      `, [meetingId, user_id, fullName, role_snapshot?.trim() || null]);

      return res.json({ success: true, id: invited.rows[0]?.id });
    }

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
             dec.mandatory_games, dec.additional_games,
             dec.penalty_amount, dec.penalty_minutes, dec.penalty_logic, dec.penalty_amount_paid,
             dec.status, dec.disqualification_id, dec.team_penalty_mode, dec.hearing_basis, dec.other_person_name,
             dec.hearing_basis_type, dec.hearing_basis_user_id, dec.hearing_basis_team_id,
             dec.violation_source, dec.verdict_description, dec.mandatory_amount, dec.additional_amount,
             concat_ws(' ', ru.last_name, ru.first_name, ru.middle_name) as hearing_basis_referee_name,
             pt.name as hearing_basis_team_name,
             dec.created_at,
             COALESCE((
               SELECT json_agg(json_build_object(
                   'id', dm.id, 'user_id', dm.user_id, 'full_name', dm.full_name_snapshot,
                   'share_amount', dm.share_amount, 'paid', COALESCE(mdq.penalty_amount_paid, false)
               ) ORDER BY dm.full_name_snapshot)
               FROM sdk_decision_members dm
               LEFT JOIN disqualifications mdq ON mdq.id = dm.disqualification_id
               WHERE dm.decision_id = dec.id
             ), '[]'::json) as members,
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
      -- Команда у решения необязательна: наказание "иному лицу" не привязано ни к одной заявке
      LEFT JOIN tournament_teams tt ON dec.tournament_team_id = tt.id
      LEFT JOIN teams t ON tt.team_id = t.id
      LEFT JOIN divisions div ON tt.division_id = div.id
      LEFT JOIN tournament_rosters tr ON dec.tournament_roster_id = tr.id
      LEFT JOIN users u ON tr.player_id = u.id
      LEFT JOIN tournament_team_roles ttr ON dec.tournament_team_role_id = ttr.id
      LEFT JOIN users u2 ON ttr.user_id = u2.id
      LEFT JOIN games g ON dec.game_id = g.id
      LEFT JOIN disqualifications dq ON dec.disqualification_id = dq.id
      LEFT JOIN users ru ON dec.hearing_basis_user_id = ru.id
      LEFT JOIN tournament_teams ptt ON dec.hearing_basis_team_id = ptt.id
      LEFT JOIN teams pt ON ptt.team_id = pt.id
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

// Деление суммы поровну без потери копеек: остаток от деления раскидывается
// по первым участникам, чтобы сумма долей в точности сходилась с общей суммой штрафа.
const buildEqualShares = (total, count) => {
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
};

const buildDecisionReason = (snapshot) =>
  snapshot.code ? `${snapshot.code}. ${snapshot.title}` : snapshot.title;

const resolveDecisionContext = async (client, meetingId, tournamentTeamId) => {
  const r = await client.query(`
    SELECT tt.team_id, m.league_id
    FROM tournament_teams tt
    JOIN sdk_meetings m ON m.id = $1
    WHERE tt.id = $2
  `, [meetingId, tournamentTeamId]);
  return r.rows[0] || {};
};

// Режим "штраф делится между участниками": одно решение СДК превращается в N персональных
// наказаний. Триггер sdk_sync_disqualification для таких решений намеренно ничего не создаёт —
// общей записи на команду здесь быть не должно, каждый отвечает только за свою долю.
const syncDecisionMembers = async (client, { decisionId, meetingId, tournamentTeamId, memberUserIds, totalAmount, reason }) => {
  const ids = [...new Set((memberUserIds || []).map(Number).filter(Boolean))];

  const existingRes = await client.query(
    'SELECT id, user_id, disqualification_id FROM sdk_decision_members WHERE decision_id = $1',
    [decisionId]
  );
  const keep = new Set(ids);

  for (const row of existingRes.rows) {
    if (keep.has(Number(row.user_id))) continue;
    await client.query('DELETE FROM sdk_decision_members WHERE id = $1', [row.id]);
    if (row.disqualification_id) {
      await client.query('DELETE FROM disqualifications WHERE id = $1', [row.disqualification_id]);
    }
  }

  if (ids.length === 0) return;

  const { team_id, league_id } = await resolveDecisionContext(client, meetingId, tournamentTeamId);
  const shares = buildEqualShares(totalAmount || 0, ids.length);

  const peopleRes = await client.query(`
    SELECT u.id, u.first_name, u.last_name, u.middle_name,
           EXISTS (SELECT 1 FROM tournament_rosters tr WHERE tr.tournament_team_id = $2 AND tr.player_id = u.id) AS is_player
    FROM users u WHERE u.id = ANY($1::int[])
  `, [ids, tournamentTeamId]);
  const people = new Map(peopleRes.rows.map(r => [Number(r.id), r]));

  const existingByUser = new Map(existingRes.rows.map(r => [Number(r.user_id), r]));

  for (let i = 0; i < ids.length; i++) {
    const userId = ids[i];
    const share = shares[i];
    const person = people.get(userId);
    const fullName = person
      ? [person.last_name, person.first_name, person.middle_name].filter(Boolean).join(' ')
      : null;
    const targetType = person?.is_player ? 'player' : 'staff';
    const existing = existingByUser.get(userId);

    if (existing?.disqualification_id) {
      await client.query(
        `UPDATE disqualifications SET reason = $1, penalty_amount = $2, updated_at = NOW() WHERE id = $3`,
        [reason, share, existing.disqualification_id]
      );
      await client.query(
        `UPDATE sdk_decision_members SET share_amount = $1, full_name_snapshot = $2 WHERE id = $3`,
        [share, fullName, existing.id]
      );
      continue;
    }

    const dqRes = await client.query(`
      INSERT INTO disqualifications
        (target_type, user_id, team_id, league_id, reason, penalty_type, penalty_amount, penalty_amount_paid, start_date, status)
      VALUES ($1, $2, $3, $4, $5, 'manual', $6, false, CURRENT_DATE, 'active')
      RETURNING id
    `, [targetType, userId, team_id, league_id, reason, share]);

    await client.query(`
      INSERT INTO sdk_decision_members (decision_id, user_id, full_name_snapshot, share_amount, disqualification_id)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (decision_id, user_id) DO UPDATE
        SET share_amount = EXCLUDED.share_amount, full_name_snapshot = EXCLUDED.full_name_snapshot,
            disqualification_id = EXCLUDED.disqualification_id
    `, [decisionId, userId, fullName, share, dqRes.rows[0].id]);
  }
};

/**
 * Резервный вратарь как нарушитель.
 *
 * Цель остаётся 'player' — в реестре наказание и так хранится парой user_id +
 * team_id, а не ссылкой на заявку. Отличие в источнике: своей заявки у него нет,
 * поэтому он приходит из протокола конкретного матча (reserve_player_id + game_id),
 * а не из состава команды.
 *
 * Матчи такому нарушителю лига может отключить тумблером: тогда остаётся только
 * денежный штраф. Проверяем здесь, а не в normalizeDecisionBody — та функция
 * чистая и в базу не ходит.
 */
const checkReserveGoalieTarget = async (db, { meetingId, decisionId, gameId, reservePlayerId, penaltyGames }) => {
  if (!gameId) {
    return 'Для резервного вратаря нужно указать матч, в котором он играл';
  }

  const { rows } = await db.query(
    `SELECT 1 FROM game_rosters
      WHERE game_id = $1 AND player_id = $2 AND is_reserve_goalie`,
    [gameId, reservePlayerId]
  );
  if (rows.length === 0) {
    return 'В протоколе выбранного матча такой резервный вратарь не значится';
  }

  if (penaltyGames > 0) {
    // Лига берётся от заседания (создание) либо от решения (правка)
    const { rows: leagueRows } = await db.query(
      meetingId
        ? 'SELECT l.reserve_goalie_dq_games_enabled FROM sdk_meetings m JOIN leagues l ON l.id = m.league_id WHERE m.id = $1'
        : `SELECT l.reserve_goalie_dq_games_enabled
             FROM sdk_meeting_decisions dec
             JOIN sdk_meetings m ON m.id = dec.meeting_id
             JOIN leagues l ON l.id = m.league_id
            WHERE dec.id = $1`,
      [meetingId || decisionId]
    );
    if (!leagueRows[0]?.reserve_goalie_dq_games_enabled) {
      return 'Лига не назначает резервным вратарям пропуск матчей — оставьте только денежный штраф';
    }
  }

  return null;
};

// Общая нормализация тела решения для create/update: чем является наказание, решает
// цель (кто наказан) и режим командного штрафа из справочника.
const normalizeDecisionBody = (body) => {
  const targetType = body.target_type || 'player';
  const teamPenaltyMode = targetType === 'team' && ['whole', 'split'].includes(body.team_penalty_mode)
    ? body.team_penalty_mode
    : null;

  // Для команды и "иного лица" допустим только денежный штраф: счётчика матчей у команды нет,
  // а иное лицо не заявлено ни за одну команду — пропускать матчи ему нечего.
  const moneyOnly = targetType === 'team' || targetType === 'other';
  const penaltyGames = moneyOnly ? null : (body.penalty_games || null);

  return {
    targetType,
    teamPenaltyMode,
    penaltyGames,
    mandatoryGames: moneyOnly ? null : (body.mandatory_games || null),
    additionalGames: moneyOnly ? null : (body.additional_games || null),
    penaltyAmount: body.penalty_amount || null,
    // Разбивка денежного штрафа: обязательная часть есть только у командных наказаний,
    // penalty_amount при этом всегда остаётся итогом (обяз. + доп.), как и у матчей
    mandatoryAmount: moneyOnly ? (body.mandatory_amount || null) : null,
    additionalAmount: body.additional_amount || null,
    penaltyLogic: (penaltyGames && body.penalty_amount) ? (body.penalty_logic || 'and') : null,
    otherPersonName: targetType === 'other' ? (body.other_person_name?.trim() || null) : null,

    // Основание рассмотрения: тип задаёт, какое из уточнений имеет смысл —
    // судья-автор рапорта, команда-заявитель протеста или свободный текст
    hearingBasisType: ['referee_report', 'team_protest', 'other'].includes(body.hearing_basis_type)
      ? body.hearing_basis_type : null,
    hearingBasisUserId: body.hearing_basis_type === 'referee_report' ? (body.hearing_basis_user_id || null) : null,
    hearingBasisTeamId: body.hearing_basis_type === 'team_protest' ? (body.hearing_basis_team_id || null) : null,
    hearingBasis: body.hearing_basis?.trim() || null,

    // Откуда взято нарушение: справочник, положение или иное. Для двух последних
    // формулировка и вердикт пишутся руками — справочнику они неизвестны.
    violationSource: ['catalog', 'regulation', 'other'].includes(body.violation_source)
      ? body.violation_source : 'catalog',
    verdictDescription: body.verdict_description?.trim() || null
  };
};

export const createSdkMeetingDecision = async (req, res) => {
  const client = await pool.connect();
  try {
    const { meetingId } = req.params;
    const {
      violation_type_id, violation_code_manual, violation_title_manual, game_id, tournament_team_id,
      tournament_roster_id, tournament_team_role_id, reserve_player_id, decision, penalty_minutes, member_user_ids
    } = req.body;

    if ((!violation_type_id && !violation_title_manual) || !decision) {
      return res.status(400).json({ success: false, error: 'Не заполнены обязательные поля' });
    }

    const v = normalizeDecisionBody(req.body);
    const isReserveTarget = v.targetType === 'player' && !!reserve_player_id;

    // Команда обязательна для всех целей, кроме "иного лица": оно не заявлено ни за одну
    // команду, и требовать дивизион с командой только ради сохранения решения незачем
    if (v.targetType !== 'other' && !tournament_team_id) {
      return res.status(400).json({ success: false, error: 'Не выбраны дивизион и команда' });
    }
    if (v.targetType === 'player' && !tournament_roster_id && !isReserveTarget) {
      return res.status(400).json({ success: false, error: 'Не выбран игрок-нарушитель' });
    }
    if (isReserveTarget) {
      const reserveError = await checkReserveGoalieTarget(pool, {
        meetingId, gameId: game_id, reservePlayerId: reserve_player_id, penaltyGames: v.penaltyGames,
      });
      if (reserveError) return res.status(400).json({ success: false, error: reserveError });
    }
    if (v.targetType === 'staff' && !tournament_team_role_id) {
      return res.status(400).json({ success: false, error: 'Не выбран представитель команды' });
    }
    if (v.targetType === 'other' && !v.otherPersonName) {
      return res.status(400).json({ success: false, error: 'Не указано, кто именно является нарушителем' });
    }
    if (v.teamPenaltyMode === 'split' && decision === 'punish' && !(member_user_ids?.length > 0)) {
      return res.status(400).json({ success: false, error: 'Не выбраны участники, между которыми делится штраф' });
    }

    // Пункт нарушения либо из справочника (violation_type_id), либо вписан вручную —
    // в обоих случаях текст "замораживается" в снапшот, как и при выборе из справочника
    const violationSnapshot = await getViolationSnapshot(violation_type_id, violation_code_manual, violation_title_manual);

    await client.query('BEGIN');

    const result = await client.query(`
      INSERT INTO sdk_meeting_decisions
        (meeting_id, violation_type_id, violation_code_snapshot, violation_title_snapshot, game_id, tournament_team_id, target_type,
         tournament_roster_id, tournament_team_role_id, reserve_player_id, decision, penalty_games, mandatory_games, additional_games,
         penalty_amount, penalty_minutes, penalty_logic, team_penalty_mode, hearing_basis, other_person_name,
         hearing_basis_type, hearing_basis_user_id, hearing_basis_team_id,
         violation_source, verdict_description, mandatory_amount, additional_amount, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      RETURNING id
    `, [
      meetingId, violation_type_id || null, violationSnapshot.code, violationSnapshot.title, game_id || null, tournament_team_id || null, v.targetType,
      isReserveTarget ? null : (v.targetType === 'player' ? tournament_roster_id : null),
      v.targetType === 'staff' ? tournament_team_role_id : null,
      isReserveTarget ? reserve_player_id : null,
      decision, v.penaltyGames, v.mandatoryGames, v.additionalGames, v.penaltyAmount, penalty_minutes || null,
      v.penaltyLogic, v.teamPenaltyMode, v.hearingBasis, v.otherPersonName,
      v.hearingBasisType, v.hearingBasisUserId, v.hearingBasisTeamId,
      v.violationSource, v.verdictDescription, v.mandatoryAmount, v.additionalAmount, req.user.id
    ]);

    if (v.teamPenaltyMode === 'split' && decision === 'punish') {
      await syncDecisionMembers(client, {
        decisionId: result.rows[0].id,
        meetingId,
        tournamentTeamId: tournament_team_id,
        memberUserIds: member_user_ids,
        totalAmount: v.penaltyAmount,
        reason: buildDecisionReason(violationSnapshot)
      });
    }

    await client.query('COMMIT');
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка создания решения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  } finally {
    client.release();
  }
};

export const updateSdkMeetingDecision = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      violation_type_id, violation_code_manual, violation_title_manual, game_id, tournament_team_id,
      tournament_roster_id, tournament_team_role_id, reserve_player_id, decision, penalty_minutes,
      penalty_amount_paid, status, member_user_ids
    } = req.body;

    if ((!violation_type_id && !violation_title_manual) || !decision) {
      return res.status(400).json({ success: false, error: 'Не заполнены обязательные поля' });
    }

    const v = normalizeDecisionBody(req.body);
    const isReserveTarget = v.targetType === 'player' && !!reserve_player_id;

    if (v.targetType !== 'other' && !tournament_team_id) {
      return res.status(400).json({ success: false, error: 'Не выбраны дивизион и команда' });
    }
    if (isReserveTarget) {
      const reserveError = await checkReserveGoalieTarget(pool, {
        decisionId: id, gameId: game_id, reservePlayerId: reserve_player_id, penaltyGames: v.penaltyGames,
      });
      if (reserveError) return res.status(400).json({ success: false, error: reserveError });
    }

    const violationSnapshot = await getViolationSnapshot(violation_type_id, violation_code_manual, violation_title_manual);

    await client.query('BEGIN');

    const meetingRes = await client.query('SELECT meeting_id FROM sdk_meeting_decisions WHERE id = $1', [id]);
    if (meetingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Решение не найдено' });
    }

    await client.query(`
      UPDATE sdk_meeting_decisions
      SET violation_type_id = $1, violation_code_snapshot = $2, violation_title_snapshot = $3, game_id = $4, tournament_team_id = $5, target_type = $6,
          tournament_roster_id = $7, tournament_team_role_id = $8, reserve_player_id = $9,
          decision = $10, penalty_games = $11, mandatory_games = $12, additional_games = $13,
          penalty_amount = $14, penalty_minutes = $15, penalty_logic = $16, penalty_amount_paid = $17, status = $18, team_penalty_mode = $19,
          hearing_basis = $20, other_person_name = $21,
          hearing_basis_type = $22, hearing_basis_user_id = $23, hearing_basis_team_id = $24,
          violation_source = $25, verdict_description = $26, mandatory_amount = $27, additional_amount = $28
      WHERE id = $29
    `, [
      violation_type_id || null, violationSnapshot.code, violationSnapshot.title, game_id || null, tournament_team_id || null, v.targetType,
      isReserveTarget ? null : (v.targetType === 'player' ? tournament_roster_id : null),
      v.targetType === 'staff' ? tournament_team_role_id : null,
      isReserveTarget ? reserve_player_id : null,
      decision, v.penaltyGames, v.mandatoryGames, v.additionalGames, v.penaltyAmount, penalty_minutes || null,
      v.penaltyLogic, penalty_amount_paid || false, status || 'active', v.teamPenaltyMode,
      v.hearingBasis, v.otherPersonName,
      v.hearingBasisType, v.hearingBasisUserId, v.hearingBasisTeamId,
      v.violationSource, v.verdictDescription, v.mandatoryAmount, v.additionalAmount, id
    ]);

    // Список участников передаём только когда решение действительно делится: в остальных
    // случаях (сменили режим, оправдали) прежние доли надо убрать вместе с их наказаниями.
    const keepMembers = v.teamPenaltyMode === 'split' && decision === 'punish';
    await syncDecisionMembers(client, {
      decisionId: id,
      meetingId: meetingRes.rows[0].meeting_id,
      tournamentTeamId: tournament_team_id,
      memberUserIds: keepMembers ? member_user_ids : [],
      totalAmount: v.penaltyAmount,
      reason: buildDecisionReason(violationSnapshot)
    });

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Ошибка обновления решения СДК:', err);
    res.status(500).json({ success: false, error: 'Ошибка сохранения' });
  } finally {
    client.release();
  }
};

export const togglePaidSdkDecisionMember = async (req, res) => {
  try {
    const { id } = req.params;

    const memberRes = await pool.query('SELECT disqualification_id FROM sdk_decision_members WHERE id = $1', [id]);
    if (memberRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Участник не найден' });
    }
    const dqId = memberRes.rows[0].disqualification_id;
    if (!dqId) {
      return res.status(409).json({ success: false, error: 'У участника нет связанного наказания' });
    }

    // Ledger (disqualifications) — источник истины: BEFORE-триггер disqualification_auto_complete
    // сам переведёт долю в "Отбыто", как только она оплачена.
    await pool.query(`
      UPDATE disqualifications SET penalty_amount_paid = NOT penalty_amount_paid, updated_at = NOW()
      WHERE id = $1
    `, [dqId]);

    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка отметки оплаты доли участника:', err);
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

    // Доли участников (командный штраф с делением) — такие же наказания в ledger,
    // их надо снять вместе с решением, иначе останутся висеть без источника
    const memberDqRes = await client.query(
      'SELECT disqualification_id FROM sdk_decision_members WHERE decision_id = $1 AND disqualification_id IS NOT NULL',
      [id]
    );

    await client.query('BEGIN');
    await client.query('DELETE FROM sdk_meeting_decisions WHERE id = $1', [id]);
    if (disqualification_id) {
      await client.query('DELETE FROM disqualifications WHERE id = $1', [disqualification_id]);
    }
    if (memberDqRes.rows.length > 0) {
      await client.query('DELETE FROM disqualifications WHERE id = ANY($1::int[])',
        [memberDqRes.rows.map(r => r.disqualification_id)]);
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
