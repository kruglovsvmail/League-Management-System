import multer from 'multer';

// Звуки диктора арены (Команды → Лиги → «Диктор арены»): сирена, предупреждения, бип.
//
// Только MP3: файлы лежат под постоянными именами *.mp3 — по ним их ищет сервер
// диктора и проигрывает браузер панели секретаря. Звуки короткие, 10 МБ — с запасом.
// Хранение в памяти, как во всех загрузках проекта: файл сразу уходит в S3.
const ALLOWED = ['audio/mpeg', 'audio/mp3'];

const fileFilter = (req, file, cb) => {
  const byMime = ALLOWED.includes(file.mimetype);
  const byExt = (file.originalname || '').toLowerCase().endsWith('.mp3');
  if (byMime || byExt) cb(null, true);
  else cb(new Error('INVALID_FILE_TYPE'), false);
};

const uploadArenaAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
});

export default uploadArenaAudio;
