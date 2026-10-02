// LMS-Backend/src/announces/announce-assets.js
//
// Материалы анонсов в S3: фон, свой логотип, шрифты — всё, что шаблон лиги объявил
// в meta.files (картинки) и meta.fonts (шрифты). Загружает их глобальный
// администратор: Команды → Лиги (announceAssetsController.js).
//
// Раскладка по соглашению путей, как у файлов трансляций и диктора:
//   announce/league-{id}/{ячейка}       — файлы лиги
//   announce/league-default/{ячейка}    — общие файлы дефолтного шаблона
// Имя объекта — имя ячейки шаблона БЕЗ расширения («background», «logo», «font»):
// формат знает Content-Type, сохранённый при загрузке. Так фон можно залить и JPG,
// и PNG, а шаблону не нужно перебирать варианты имени.
//
// Ячейка ищется сначала у лиги, потом в общей папке; own: true — только у лиги
// (логотип в общей папке достался бы всем лигам разом).
import { HeadObjectCommand, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../../config/s3.js';

const BUCKET = process.env.S3_BUCKET_NAME || process.env.S3_BUCKET;
const PUBLIC_BASE = 'https://s3.twcstorage.ru/hockeyeco-uploads';

export const DEFAULT_SCOPE = 'default';

// scope — id лиги или DEFAULT_SCOPE
export const assetKey = (scope, slot) => `announce/league-${scope}/${slot}`;

// Ячейки шаблона одним списком: картинки и шрифты.
export const templateSlots = (meta) => [
    ...Object.entries(meta.files || {}).map(([name, spec]) => ({ name, kind: 'image', ...spec })),
    ...Object.entries(meta.fonts || {}).map(([name, spec]) => ({ name, kind: 'font', ...spec })),
];

// Ответы S3 кэшируются на минуту: превью перерисовывается на каждую галочку, и без
// кэша каждый раз уходили бы запросы на все ячейки. Загрузка и удаление через
// админку сбрасывают кэш своей ячейки сразу.
const CACHE_TTL = 60 * 1000;
const cache = new Map();

const cached = async (key, load) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;
    const value = await load();
    cache.set(key, { at: Date.now(), value });
    return value;
};

const forget = (key) => cache.delete(`head:${key}`);

// Метка версии в ссылке: после перезаливки превью в браузере не покажет старую
// картинку из кэша — имя объекта постоянное.
export const findAsset = (scope, slot) => {
    const key = assetKey(scope, slot);
    return cached(`head:${key}`, async () => {
        try {
            const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
            const version = (head.ETag || '').replace(/"/g, '')
                || (head.LastModified ? new Date(head.LastModified).getTime() : Date.now());
            return { key, version, contentType: head.ContentType || null, url: `${PUBLIC_BASE}/${key}?v=${version}` };
        } catch {
            return null;
        }
    });
};

const locate = async (leagueId, slot) =>
    (await findAsset(leagueId, slot.name)) || (slot.own ? null : await findAsset(DEFAULT_SCOPE, slot.name));

// Шрифты встраиваются data-URI: CORS на бакете не включён, а без него браузер не
// применит шрифт, пришедший с чужого домена (картинкам CORS не нужен).
const fontDataUri = (found) => cached(`font:${found.key}:${found.version}`, async () => {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: found.key }));
    const bytes = Buffer.from(await obj.Body.transformToByteArray());
    return `data:${obj.ContentType || found.contentType || 'font/ttf'};base64,${bytes.toString('base64')}`;
});

// Всё, что нужно шаблону лиги: { files: { ячейка: ссылка }, fonts: { ячейка: data-URI } }.
// Шрифт, который не удалось получить, анонс не роняет: шаблон нарисуется запасным
// шрифтом из своего font-family.
export const resolveTemplateAssets = async (leagueId, meta) => {
    const files = {};
    const fonts = {};
    await Promise.all(templateSlots(meta).map(async (slot) => {
        try {
            const found = await locate(leagueId, slot);
            if (slot.kind === 'font') fonts[slot.name] = found ? await fontDataUri(found) : null;
            else files[slot.name] = found ? found.url : null;
        } catch (err) {
            console.error(`Анонс: не удалось получить «${slot.name}» (лига ${leagueId}):`, err.message);
            if (slot.kind === 'font') fonts[slot.name] = null;
            else files[slot.name] = null;
        }
    }));
    return { files, fonts };
};

export const putAsset = async (scope, slot, body, contentType) => {
    const key = assetKey(scope, slot);
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
    forget(key);
};

export const deleteAsset = async (scope, slot) => {
    const key = assetKey(scope, slot);
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    forget(key);
};
