import multer from 'multer';

// Материалы анонса матчей (Команды → Лиги → «Анонс матчей»): фон, логотип, шрифты.
//
// Здесь пропускаем и картинки, и шрифты — какой именно тип нужен ячейке, сверяет
// контроллер (announceAssetsController.js): ячейку он знает, а фильтр multer — нет.
// Шрифты проверяются по расширению: их MIME-тип браузеры и системы называют кто как
// (font/ttf, application/x-font-ttf, application/octet-stream).
// Хранение в памяти, как во всех загрузках проекта: файл сразу уходит в S3.
export const ANNOUNCE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ANNOUNCE_FONT_TYPES = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' };

export const fontExt = (name) => Object.keys(ANNOUNCE_FONT_TYPES).find((ext) => (name || '').toLowerCase().endsWith(ext)) || null;

const fileFilter = (req, file, cb) => {
  if (ANNOUNCE_IMAGE_TYPES.includes(file.mimetype) || fontExt(file.originalname)) cb(null, true);
  else cb(new Error('INVALID_FILE_TYPE'), false);
};

const uploadAnnounce = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
});

export default uploadAnnounce;
