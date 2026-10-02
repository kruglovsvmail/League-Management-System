// LMS-Backend/controllers/announceAssetsController.js
//
// Материалы анонса матчей: фон, логотип, шрифты (Команды → Лиги, только глобальный
// администратор — право LEAGUE_GLOBAL_PARAMS_MANAGE).
//
// Две области:
//   лига       — /leagues/:leagueId/announce-assets — ячейки её шаблона (свой файл
//                шаблона или дефолтный); чего у лиги нет, берётся из общей папки
//   общая      — /announce-assets/default — ячейки дефолтного шаблона, кроме тех,
//                что бывают только у лиги (логотип)
//
// Какие ячейки есть, решает шаблон (meta.files / meta.fonts), поэтому новая лига со
// своим дизайном получает строки загрузки без правок здесь. В БД о файлах ничего
// нет: они лежат в S3 под именами ячеек (см. src/announces/announce-assets.js).
import { getAnnounceTemplate, hasOwnAnnounceTemplate } from '../src/announces/announce-factory.js';
import { DEFAULT_SCOPE, templateSlots, findAsset, putAsset, deleteAsset } from '../src/announces/announce-assets.js';
import { ANNOUNCE_IMAGE_TYPES, ANNOUNCE_FONT_TYPES, fontExt } from '../config/uploadAnnounce.js';

// id лиги идёт прямо в путь объекта S3 — пропускаем только число
const scopeOf = (req) => {
    if (req.params.leagueId === undefined) return DEFAULT_SCOPE;
    return /^\d+$/.test(req.params.leagueId) ? req.params.leagueId : null;
};
const badScope = (res) => res.status(400).json({ success: false, error: 'Неизвестная лига' });

const slotsOf = async (scope) => {
    const template = await getAnnounceTemplate(scope === DEFAULT_SCOPE ? null : scope);
    const slots = templateSlots(template.meta);
    return scope === DEFAULT_SCOPE ? slots.filter(s => !s.own) : slots;
};

// GET — ячейки шаблона и что в них загружено. У лиги для каждой ячейки ещё и
// общий файл: админ видит, что подставится, если своего нет.
export const getAnnounceAssets = async (req, res) => {
    try {
        const scope = scopeOf(req);
        if (!scope) return badScope(res);
        const slots = await slotsOf(scope);
        const data = await Promise.all(slots.map(async (slot) => {
            const own = await findAsset(scope, slot.name);
            const shared = scope === DEFAULT_SCOPE || slot.own ? null : await findAsset(DEFAULT_SCOPE, slot.name);
            return {
                name: slot.name, kind: slot.kind, title: slot.title || slot.name, hint: slot.hint || '', own: !!slot.own,
                uploaded: !!own, url: own?.url || null,
                shared: shared ? { url: shared.url } : null,
            };
        }));
        res.json({
            success: true,
            data: {
                template: scope === DEFAULT_SCOPE ? 'default' : (hasOwnAnnounceTemplate(scope) ? 'own' : 'default'),
                slots: data,
            },
        });
    } catch (err) {
        console.error('Ошибка получения материалов анонса:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// Проверить файл под ячейку и положить в S3. Прежний файл ячейки перезаписывается:
// имя объекта постоянное, копии не остаётся.
const storeSlotFile = async (res, scope, slot, file) => {
    if (!file) return res.status(400).json({ success: false, error: 'Файл не передан' });

    let contentType;
    if (slot.kind === 'font') {
        const ext = fontExt(file.originalname);
        if (!ext) return res.status(400).json({ success: false, error: 'Нужен шрифт: TTF, OTF, WOFF или WOFF2' });
        contentType = ANNOUNCE_FONT_TYPES[ext];
    } else {
        if (!ANNOUNCE_IMAGE_TYPES.includes(file.mimetype)) {
            return res.status(400).json({ success: false, error: 'Нужна картинка: JPG, PNG или WebP' });
        }
        contentType = file.mimetype;
    }

    await putAsset(scope, slot.name, file.buffer, contentType);
    const found = await findAsset(scope, slot.name);
    return res.json({ success: true, url: found?.url || null });
};

// POST /:slot — залить или заменить файл ячейки. Имя берём из адреса, а не из
// загруженного файла: шаблон ищет строго его.
export const uploadAnnounceAsset = async (req, res) => {
    try {
        const scope = scopeOf(req);
        if (!scope) return badScope(res);
        const slot = (await slotsOf(scope)).find(s => s.name === req.params.slot);
        if (!slot) return res.status(400).json({ success: false, error: 'В шаблоне нет такого файла' });
        await storeSlotFile(res, scope, slot, req.file);
    } catch (err) {
        console.error('Ошибка загрузки материала анонса:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// POST /api/leagues/:leagueId/announce-background — фон из окна анонса (Расписание).
// Здесь руководство лиги и медиа (право ANNOUNCE_BACKGROUND_EDIT) меняют только фон
// и только своей лиги; остальные файлы — у глобального администратора (Команды → Лиги).
// Окно заранее предупреждает, что прежний фон лиги пропадёт насовсем.
export const uploadLeagueBackground = async (req, res) => {
    try {
        const scope = scopeOf(req);
        if (!scope || scope === DEFAULT_SCOPE) return badScope(res);
        const slot = (await slotsOf(scope)).find(s => s.name === 'background' && s.kind === 'image');
        if (!slot) return res.status(400).json({ success: false, error: 'Шаблон лиги не использует фон' });
        await storeSlotFile(res, scope, slot, req.file);
    } catch (err) {
        console.error('Ошибка загрузки фона анонса:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};

// DELETE /:slot
export const deleteAnnounceAsset = async (req, res) => {
    try {
        const scope = scopeOf(req);
        if (!scope) return badScope(res);
        const slot = (await slotsOf(scope)).find(s => s.name === req.params.slot);
        if (!slot) return res.status(400).json({ success: false, error: 'В шаблоне нет такого файла' });

        await deleteAsset(scope, slot.name);
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления материала анонса:', err);
        res.status(500).json({ success: false, error: 'Ошибка сервера' });
    }
};
