import multer from 'multer';

// Загрузка эфирных файлов лиги: аудио-интро и видео-заставки (настройки лиги →
// Параметры → Трансляции).
//
// Отдельный конфиг, а не общий upload.js: там разрешены только картинки и
// документы с лимитом 30 МБ, а здесь нужны mp3/mp4 и заметно больший потолок.
//
// Хранение в памяти оставлено как во всех остальных загрузках проекта — файл
// сразу уходит в S3 и на диске сервера не оседает. Отсюда и потолок: буфер
// целиком живёт в памяти процесса, поэтому 120 МБ — это компромисс между
// «влезет ролик 1080p на 15 секунд» и «один режиссёр не выест всю память».
const storage = multer.memoryStorage();

// MOV разрешён, но это контейнер: браузер в OBS проиграет его, только если
// внутри H.264/HEVC. ProRes и Animation, которые чаще всего приезжают из
// монтажа, CEF не декодирует — файл загрузится, а в эфире будет чёрный кадр.
// Оверлей такой случай переживает (onerror уводит в обратную шторку), но ролик
// не покажется, поэтому MOV из монтажа лучше пересобирать в H.264.
const ALLOWED = {
  intro: ['audio/mpeg', 'audio/mp3'],
  bumper: ['video/mp4', 'video/webm', 'video/quicktime'],
};

// Часть систем отдаёт видео как application/octet-stream или пустой тип —
// тогда решаем по расширению, иначе честный mp4 уходил бы в отказ.
const EXT_FALLBACK = { intro: ['.mp3'], bumper: ['.mp4', '.webm', '.mov'] };

const fileFilter = (req, file, cb) => {
  const kind = req.params.kind === 'intro' ? 'intro' : 'bumper';
  const name = (file.originalname || '').toLowerCase();
  const byMime = ALLOWED[kind].includes(file.mimetype);
  const byExt = EXT_FALLBACK[kind].some((ext) => name.endsWith(ext));
  if (byMime || byExt) cb(null, true);
  else cb(new Error('INVALID_FILE_TYPE'), false);
};

const uploadBroadcast = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024 },
  fileFilter,
});

export default uploadBroadcast;
