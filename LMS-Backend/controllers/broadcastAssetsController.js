// LMS-Backend/controllers/broadcastAssetsController.js
//
// Эфирные файлы лиги: аудио-интро и три видео-заставки (настройки лиги →
// Параметры → Трансляции).
//
// Файлы лежат в S3 по СОГЛАШЕНИЮ ПУТЕЙ, а не по ссылкам из БД — тем же приёмом,
// что и звуки появления/исчезновения плашек (см. useWebGraphics.js) и интро
// (см. getGameAudioUrl):
//
//   audio/league-{id}/Intro.mp3
//   bumpers/league-{id}/slot-{1..3}.mp4
//
// В БД (leagues.broadcast_bumpers) хранятся ТОЛЬКО названия слотов и
// длительность ролика — то, что режиссёр видит в панели. Благодаря этому
// оверлей в OBS строит ссылку сам, без обращения к защищённым эндпоинтам.
//
// Фолбэка на league-default у заставок НЕТ намеренно: интро — общая мелодия, а
// заставка почти всегда рекламная интеграция конкретной лиги, и показать чужую
// в эфире хуже, чем не показать никакой.
import pool from '../config/db.js';
import s3 from '../config/s3.js';
import { PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const BUCKET = process.env.S3_BUCKET_NAME || process.env.S3_BUCKET;
const PUBLIC_BASE = 'https://s3.twcstorage.ru/hockeyeco-uploads';
export const BUMPER_SLOTS = [1, 2, 3];

const introKey = (leagueId) => `audio/league-${leagueId}/Intro.mp3`;
const bumperKey = (leagueId, slot, ext = 'mp4') => `bumpers/league-${leagueId}/slot-${slot}.${ext}`;

// Ссылки отдаём с меткой времени: S3 у Timeweb кэширует агрессивно, и после
// перезаливки ролика OBS иначе продолжал бы играть старый файл до перезапуска.
const publicUrl = (key) => `${PUBLIC_BASE}/${key}?t=${Date.now()}`;

// Ссылка на ролик слота. Метка ЗДЕСЬ не может быть Date.now(): этот адрес
// уходит в оверлей, а тот вызывается на каждое обновление счёта — менялся бы
// src у <video>, и ролик перекачивался бы без конца. Поэтому берём версию,
// записанную в момент заливки: адрес постоянный, пока файл тот же, и меняется
// ровно тогда, когда ролик перезалили.
const bumperUrl = (leagueId, slot) => {
  const key = bumperKey(leagueId, slot.slot, slot.ext);
  return slot.v ? `${PUBLIC_BASE}/${key}?v=${slot.v}` : `${PUBLIC_BASE}/${key}`;
};

const exists = async (key) => {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
};

// Нормализация настроек слотов: в БД может лежать что угодно (пустой массив,
// частично заполненный, с лишними слотами), наружу всегда отдаём ровно три.
export const normalizeBumpers = (raw) => {
  const list = Array.isArray(raw) ? raw : [];
  return BUMPER_SLOTS.map((slot) => {
    const found = list.find((b) => Number(b?.slot) === slot) || {};
    return {
      slot,
      title: typeof found.title === 'string' && found.title.trim() ? found.title.trim() : '',
      duration: Number.isFinite(Number(found.duration)) && Number(found.duration) > 0
        ? Math.round(Number(found.duration))
        : null,
      ext: ['webm', 'mov'].includes(found.ext) ? found.ext : 'mp4',
      // Версия файла — время последней заливки. Ключ в S3 у слота постоянный,
      // и без этой метки браузер с OBS продолжали бы играть прошлый ролик.
      v: Number.isFinite(Number(found.v)) && Number(found.v) > 0 ? Number(found.v) : 0,
    };
  });
};

// GET /api/leagues/:leagueId/broadcast-assets — состояние для вкладки настроек.
// Здесь проверка наличия файлов в S3 уместна: страницу открывают редко, а
// администратору нужно видеть, что именно уже залито.
export const getBroadcastAssets = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const q = await pool.query('SELECT broadcast_bumpers FROM leagues WHERE id = $1', [leagueId]);
    if (q.rows.length === 0) return res.status(404).json({ success: false, error: 'Лига не найдена' });

    const slots = normalizeBumpers(q.rows[0].broadcast_bumpers);

    const introExists = await exists(introKey(leagueId));
    const bumpers = await Promise.all(slots.map(async (s) => {
      const has = await exists(bumperKey(leagueId, s.slot, s.ext));
      return { ...s, uploaded: has, url: has ? bumperUrl(leagueId, s) : null };
    }));

    res.json({
      success: true,
      data: {
        intro: { uploaded: introExists, url: introExists ? publicUrl(introKey(leagueId)) : null },
        bumpers,
      },
    });
  } catch (err) {
    console.error('Ошибка получения эфирных файлов лиги:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// POST /api/leagues/:leagueId/broadcast-assets/:kind — kind = intro | bumper.
// Для заставки в теле формы приходят slot и, если браузер смог его прочитать,
// duration (длительность ролика в секундах).
export const uploadBroadcastAsset = async (req, res) => {
  try {
    const { leagueId, kind } = req.params;
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не передан' });

    if (kind === 'intro') {
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET,
        Key: introKey(leagueId),
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      }));
      return res.json({ success: true, url: publicUrl(introKey(leagueId)) });
    }

    const slot = Number(req.body.slot);
    if (!BUMPER_SLOTS.includes(slot)) {
      return res.status(400).json({ success: false, error: 'Неверный номер слота' });
    }

    // Контейнер определяем по расширению файла, а не только по MIME: часть
    // систем отдаёт видео как application/octet-stream, и тогда MIME бесполезен.
    const name = (req.file.originalname || '').toLowerCase();
    const ext = name.endsWith('.webm') || req.file.mimetype === 'video/webm' ? 'webm'
      : name.endsWith('.mov') || req.file.mimetype === 'video/quicktime' ? 'mov'
      : 'mp4';
    const key = bumperKey(leagueId, slot, ext);

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    // Один слот — один файл. Если раньше был другой контейнер, старые объекты
    // удаляем: иначе оверлей по записи в БД пошёл бы за новым расширением, а в
    // бакете навсегда висели бы неиспользуемые копии.
    for (const other of ['mp4', 'webm', 'mov'].filter((e) => e !== ext)) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: bumperKey(leagueId, slot, other) }));
      } catch { /* прошлого файла могло не быть — это нормально */ }
    }

    const duration = Number(req.body.duration);
    const patch = {
      slot,
      ext,
      duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
      // Новая версия слота: по ней оверлей поймёт, что ролик сменился, и пойдёт
      // за файлом заново, а не отдаст прежний из кэша.
      v: Date.now(),
    };

    const cur = await pool.query('SELECT broadcast_bumpers FROM leagues WHERE id = $1', [leagueId]);
    const next = normalizeBumpers(cur.rows[0]?.broadcast_bumpers).map((s) =>
      s.slot === slot ? { ...s, ...patch, title: s.title } : s
    );

    await pool.query('UPDATE leagues SET broadcast_bumpers = $2::jsonb WHERE id = $1', [leagueId, JSON.stringify(next)]);

    res.json({ success: true, url: bumperUrl(leagueId, next.find((s) => s.slot === slot)), bumpers: next });
  } catch (err) {
    console.error('Ошибка загрузки эфирного файла:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// DELETE /api/leagues/:leagueId/broadcast-assets/:kind?slot=N
export const deleteBroadcastAsset = async (req, res) => {
  try {
    const { leagueId, kind } = req.params;

    if (kind === 'intro') {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: introKey(leagueId) }));
      return res.json({ success: true });
    }

    const slot = Number(req.query.slot);
    if (!BUMPER_SLOTS.includes(slot)) {
      return res.status(400).json({ success: false, error: 'Неверный номер слота' });
    }

    const cur = await pool.query('SELECT broadcast_bumpers FROM leagues WHERE id = $1', [leagueId]);
    const slots = normalizeBumpers(cur.rows[0]?.broadcast_bumpers);
    const target = slots.find((s) => s.slot === slot);

    // Удаляем оба возможных контейнера: в БД могло не сохраниться расширение
    // (например, файл заливали до появления этого поля).
    for (const ext of ['mp4', 'webm', 'mov']) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: bumperKey(leagueId, slot, ext) }));
      } catch { /* файла могло не быть */ }
    }

    // Название слота осознанно СОХРАНЯЕМ: администратор чаще всего перезаливает
    // ролик того же партнёра, и стирать подпись вместе с файлом — лишняя работа.
    const next = slots.map((s) => (s.slot === slot ? { ...s, duration: null, ext: 'mp4', v: 0 } : s));
    await pool.query('UPDATE leagues SET broadcast_bumpers = $2::jsonb WHERE id = $1', [leagueId, JSON.stringify(next)]);

    res.json({ success: true, bumpers: next, removedTitle: target?.title || '' });
  } catch (err) {
    console.error('Ошибка удаления эфирного файла:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// PUT /api/leagues/:leagueId/broadcast-assets/titles — только подписи слотов.
export const updateBumperTitles = async (req, res) => {
  try {
    const { leagueId } = req.params;
    const incoming = Array.isArray(req.body?.bumpers) ? req.body.bumpers : [];

    const cur = await pool.query('SELECT broadcast_bumpers FROM leagues WHERE id = $1', [leagueId]);
    const next = normalizeBumpers(cur.rows[0]?.broadcast_bumpers).map((s) => {
      const patch = incoming.find((b) => Number(b?.slot) === s.slot);
      if (!patch || typeof patch.title !== 'string') return s;
      return { ...s, title: patch.title.trim().slice(0, 60) };
    });

    await pool.query('UPDATE leagues SET broadcast_bumpers = $2::jsonb WHERE id = $1', [leagueId, JSON.stringify(next)]);
    res.json({ success: true, bumpers: next });
  } catch (err) {
    console.error('Ошибка сохранения названий заставок:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// GET /api/games/:gameId/broadcast/bumpers — слоты для панели трансляции.
// Отдельный эндпоинт, а не настройки лиги: у режиссёра нет прав на настройки,
// но названия и длительности роликов ему нужны, чтобы выбрать нужный слот.
export const getGameBumpers = async (req, res) => {
  try {
    const { gameId } = req.params;
    const q = await pool.query(`
      SELECT l.id AS league_id, l.broadcast_bumpers
      FROM games g
      JOIN divisions d ON g.division_id = d.id
      JOIN seasons s ON d.season_id = s.id
      JOIN leagues l ON s.league_id = l.id
      WHERE g.id = $1
    `, [gameId]);

    if (q.rows.length === 0) return res.json({ success: true, bumpers: [] });

    const { league_id, broadcast_bumpers } = q.rows[0];
    const slots = normalizeBumpers(broadcast_bumpers);

    // Здесь наличие файла проверяем: панель открывают раз за матч, а режиссёру
    // важно не ткнуть в пустой слот прямо в эфире.
    const bumpers = await Promise.all(slots.map(async (s) => {
      const key = bumperKey(league_id, s.slot, s.ext);
      return { slot: s.slot, title: s.title, duration: s.duration, uploaded: await exists(key) };
    }));

    res.json({ success: true, bumpers });
  } catch (err) {
    console.error('Ошибка получения заставок матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// --- ПЕРЕХОД ЗАСТАВКИ -------------------------------------------------------
//
// Переход рисуется данными КОНКРЕТНОГО МАТЧА (эмблемы, дивизион), но по ходу
// матча эти данные не меняются. Поэтому он собирается один раз в браузере
// режиссёра и кладётся сюда готовым файлом, а эфир просто его проигрывает.
//
// Так снимается дубликат кода: раньше переход существовал дважды — анимацией в
// DOM для эфира и отрисовкой на canvas для выгрузки. Теперь источник один.
//
// Имя файла постоянное — пересборка просто перезаписывает объект. Кэш при этом
// не мешает: ссылка наружу отдаётся с меткой времени последней записи, и после
// перезаписи она меняется сама.
const transitionKey = (gameId) => `bumpers/game-${gameId}/transition.webm`;

// POST /api/games/:gameId/broadcast/transition — приём собранного WebM.
export const uploadGameTransition = async (req, res) => {
  try {
    const { gameId } = req.params;
    if (!req.file) return res.status(400).json({ success: false, error: 'Файл не передан' });

    const key = transitionKey(gameId);

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: 'video/webm',
    }));

    const version = Date.now();
    res.json({ success: true, url: `${PUBLIC_BASE}/${key}?v=${version}`, version });
  } catch (err) {
    console.error('Ошибка загрузки перехода:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// GET /api/games/:gameId/broadcast/transition — что сейчас собрано для матча.
export const getGameTransition = async (req, res) => {
  try {
    const { gameId } = req.params;
    const key = transitionKey(gameId);

    let head;
    try {
      head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      return res.json({ success: true, transition: null });
    }

    const version = head.LastModified ? new Date(head.LastModified).getTime() : Date.now();
    res.json({
      success: true,
      transition: { url: `${PUBLIC_BASE}/${key}?v=${version}`, generatedAt: head.LastModified },
    });
  } catch (err) {
    console.error('Ошибка получения перехода:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// GET /api/games/:gameId/broadcast/transition/download — отдать файл скачиванием.
//
// Прямая ссылка на S3 не годится: атрибут download браузер игнорирует для
// чужого домена, и переход просто открывался бы в новой вкладке. Поэтому файл
// проходит через нас с Content-Disposition: attachment.
export const downloadGameTransition = async (req, res) => {
  try {
    const { gameId } = req.params;
    const key = transitionKey(gameId);

    let obj;
    try {
      obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      return res.status(404).json({ success: false, error: 'Переход не собран' });
    }

    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Disposition', `attachment; filename="perehod-${gameId}.webm"`);
    if (obj.ContentLength) res.setHeader('Content-Length', obj.ContentLength);

    obj.Body.pipe(res);
  } catch (err) {
    console.error('Ошибка скачивания перехода:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// Ссылка на переход для публичного эндпоинта матча — оверлей в OBS берёт её
// оттуда и предзагружает вместе с роликами.
export const findGameTransitionUrl = async (gameId) => {
  try {
    const key = transitionKey(gameId);
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    // Метка времени последней записи в ссылке — единственный способ заставить
    // OBS перечитать файл после пересборки: имя объекта постоянное, и без неё
    // и S3, и браузер продолжали бы отдавать старый переход.
    const version = head.LastModified ? new Date(head.LastModified).getTime() : 0;
    return `${PUBLIC_BASE}/${key}?v=${version}`;
  } catch {
    return null;
  }
};

// GET /api/games/:gameId/broadcast/logos — эмблемы матча как data-URI.
//
// Нужно для выгрузки перехода в WebM. Кадры рисуются на canvas, а картинка,
// загруженная с чужого домена (S3), «портит» холст: браузер запрещает читать
// из него пиксели, и VideoEncoder отказывается кодировать такие кадры. CORS на
// бакете включать не хочется, поэтому картинки проксируются здесь и приходят
// на клиент уже как data-URI — тогда холст остаётся чистым.
//
// Произвольный URL не принимаем намеренно: адреса берутся из БД по gameId,
// иначе эндпоинт превратился бы в открытый прокси для запросов из нашей сети.
export const getGameLogos = async (req, res) => {
  try {
    const { gameId } = req.params;
    const q = await pool.query(`
      SELECT l.logo_url AS league, d.logo_url AS division,
             t1.logo_url AS home, t2.logo_url AS away
      FROM games g
      LEFT JOIN teams t1 ON g.home_team_id = t1.id
      LEFT JOIN teams t2 ON g.away_team_id = t2.id
      LEFT JOIN divisions d ON g.division_id = d.id
      LEFT JOIN seasons s ON d.season_id = s.id
      LEFT JOIN leagues l ON s.league_id = l.id
      WHERE g.id = $1
    `, [gameId]);

    if (q.rows.length === 0) return res.json({ success: true, logos: {} });

    const toAbsolute = (path) => {
      if (!path) return null;
      if (path.startsWith('http')) return path;
      return `${PUBLIC_BASE}/${path.startsWith('/') ? path.slice(1) : path}`;
    };

    const fetchAsDataUri = async (path) => {
      const url = toAbsolute(path);
      if (!url) return null;
      try {
        const r = await fetch(url);
        if (!r.ok) return null;
        const buf = Buffer.from(await r.arrayBuffer());
        const mime = r.headers.get('content-type') || 'image/png';
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch {
        return null;
      }
    };

    const row = q.rows[0];
    // Эмблема дивизиона в переходе идёт крупным планом по центру. У дивизиона
    // она заполнена не всегда — тогда подставляем эмблему лиги, чтобы центр
    // кадра не остался пустым.
    const [league, division, home, away] = await Promise.all([
      fetchAsDataUri(row.league),
      fetchAsDataUri(row.division),
      fetchAsDataUri(row.home),
      fetchAsDataUri(row.away),
    ]);

    res.json({ success: true, logos: { league, division: division || league, home, away } });
  } catch (err) {
    console.error('Ошибка получения эмблем матча:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
};

// Для публичного эндпоинта матча: слоты со ссылками, без обращения к S3.
// Существование файла тут НЕ проверяем: getPublicGameById вызывается на каждое
// обновление счёта, и три HeadObject на каждый такой вызов — лишняя задержка в
// эфире. Отсутствующий файл отработает на клиенте через onerror у <video>.
export const buildPublicBumpers = (leagueId, rawBumpers) =>
  normalizeBumpers(rawBumpers).map((s) => ({
    slot: s.slot,
    title: s.title,
    duration: s.duration,
    url: bumperUrl(leagueId, s),
  }));
