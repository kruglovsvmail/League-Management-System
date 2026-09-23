// LMS-Backend/controllers/arenaAssetsController.js
//
// Диктор арены лиги: звуки и сценарий бипа (Команды → Лиги, только глобальный
// администратор — право LEAGUE_GLOBAL_PARAMS_MANAGE).
//
// Звуки лежат в S3 под постоянными именами (см. utils/arenaAudioFiles.js), в БД о них
// ничего нет: сервер диктора ищет файл по имени в тот момент, когда его пора играть.
// Сценарий бипа — leagues.arena_beep_schedule (см. utils/arenaBeepSchedule.js).
import pool from '../config/db.js';
import s3 from '../config/s3.js';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { ARENA_STATIC_AUDIO_FILES, ARENA_AUDIO_BUCKET, arenaAudioKey, arenaAudioFileExists } from '../utils/arenaAudioFiles.js';
import { normalizeBeepSchedule } from '../utils/arenaBeepSchedule.js';

const PUBLIC_BASE = 'https://s3.twcstorage.ru/hockeyeco-uploads';

// Метка времени в ссылке — иначе после перезаливки прослушивание отдало бы прошлый
// звук из кэша браузера: имя файла постоянное.
const publicUrl = (leagueId, file) => `${PUBLIC_BASE}/${arenaAudioKey(leagueId, file)}?t=${Date.now()}`;

// GET /api/leagues/:leagueId/arena-announcer — какие звуки загружены и сценарий бипа.
export const getArenaAnnouncer = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const q = await pool.query('SELECT arena_beep_schedule FROM leagues WHERE id = $1', [leagueId]);
    if (q.rows.length === 0) return res.status(404).json({ success: false, error: 'Лига не найдена' });

    const entries = await Promise.all(ARENA_STATIC_AUDIO_FILES.map(async (file) => {
      const uploaded = await arenaAudioFileExists(leagueId, file);
      return [file, { uploaded, url: uploaded ? publicUrl(leagueId, file) : null }];
    }));

    res.json({
      success: true,
      data: {
        files: Object.fromEntries(entries),
        beepSchedule: normalizeBeepSchedule(q.rows[0].arena_beep_schedule),
      },
    });
  } catch (err) {
    console.error('Ошибка получения настроек диктора арены:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// POST /api/leagues/:leagueId/arena-announcer/files/:file — залить или заменить звук.
// Имя берём из адреса, а не из загруженного файла: сервер диктора ищет строго его.
export const uploadArenaAudioFile = async (req, res) => {
  try {
    const { leagueId, file } = req.params;
    if (!ARENA_STATIC_AUDIO_FILES.includes(file)) {
      return res.status(400).json({ success: false, error: 'Неизвестный звук' });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не передан' });

    await s3.send(new PutObjectCommand({
      Bucket: ARENA_AUDIO_BUCKET,
      Key: arenaAudioKey(leagueId, file),
      Body: req.file.buffer,
      ContentType: 'audio/mpeg',
    }));

    res.json({ success: true, url: publicUrl(leagueId, file) });
  } catch (err) {
    console.error('Ошибка загрузки звука диктора арены:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// DELETE /api/leagues/:leagueId/arena-announcer/files/:file
export const deleteArenaAudioFile = async (req, res) => {
  try {
    const { leagueId, file } = req.params;
    if (!ARENA_STATIC_AUDIO_FILES.includes(file)) {
      return res.status(400).json({ success: false, error: 'Неизвестный звук' });
    }

    await s3.send(new DeleteObjectCommand({ Bucket: ARENA_AUDIO_BUCKET, Key: arenaAudioKey(leagueId, file) }));
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления звука диктора арены:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// PUT /api/leagues/:leagueId/arena-announcer/beep-schedule — сценарий целиком.
// Карточка шлёт его после каждой добавленной или убранной отметки.
export const updateBeepSchedule = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const schedule = normalizeBeepSchedule(req.body?.beepSchedule);

    const { rows } = await pool.query(
      'UPDATE leagues SET arena_beep_schedule = $2::jsonb WHERE id = $1 RETURNING arena_beep_schedule',
      [leagueId, JSON.stringify(schedule)]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Лига не найдена' });

    res.json({ success: true, beepSchedule: normalizeBeepSchedule(rows[0].arena_beep_schedule) });
  } catch (err) {
    console.error('Ошибка сохранения сценария бипа:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};
