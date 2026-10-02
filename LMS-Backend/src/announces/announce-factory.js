// LMS-Backend/src/announces/announce-factory.js
//
// Анонс матчей: выбор шаблона лиги и подготовка страниц.
//
// ШАБЛОН — файл announce-{leagueId}.js рядом с этим, если у лиги свой дизайн,
// иначе announce-default.js (тот же приём, что у протоколов, см. protocol-factory.js).
// Шаблон экспортирует:
//   meta    — { width, height, perImage, files, fonts }
//             files / fonts — ячейки для материалов: { имя: { title, hint, own? } }.
//             По ним админка (Команды → Лиги) рисует строки загрузки, а сервер ищет
//             файлы в S3 (см. announce-assets.js).
//   getHtml — ({ games, league, division, files, fonts, page, pages }) => HTML одной картинки
//
// Договорённость с сервером: когда картинка дорисована (шрифты, эмблемы, ужатые
// надписи), страница ставит window.__announceReady = true — только после этого
// снимается кадр (utils/announceScreenshot.js).
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { resolveTemplateAssets, templateSlots, findAsset } from './announce-assets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Есть ли у лиги свой файл шаблона
export const hasOwnAnnounceTemplate = (leagueId) =>
    Number.isInteger(Number(leagueId)) && fs.existsSync(path.join(__dirname, `announce-${Number(leagueId)}.js`));

export const getAnnounceTemplate = async (leagueId) => {
    try {
        if (hasOwnAnnounceTemplate(leagueId)) return await import(`./announce-${Number(leagueId)}.js`);
    } catch (err) {
        console.error(`Ошибка при загрузке шаблона анонса (League ID: ${leagueId}):`, err);
    }
    return import('./announce-default.js');
};

// Матчи делятся на картинки поровну: 5 при вместимости 4 — это 3 + 2, а не 4 + 1,
// чтобы на второй картинке не остался один сиротливый матч.
export const splitEvenly = (items, perImage) => {
    const pages = Math.max(1, Math.ceil(items.length / perImage));
    const base = Math.floor(items.length / pages);
    const extra = items.length % pages;   // первые extra картинок получают на матч больше
    const result = [];
    let from = 0;
    for (let i = 0; i < pages; i++) {
        const size = base + (i < extra ? 1 : 0);
        result.push(items.slice(from, from + size));
        from += size;
    }
    return result;
};

/**
 * @param {object} data - { league, division, games } — подготовлено announceController.js
 * @returns {Promise<{ width, height, perImage, pages: string[], background }>}
 *   background — для окна анонса: есть ли у шаблона фон (его можно сменить прямо
 *   там) и свой ли он у лиги (тогда замена сотрёт прежний насовсем).
 */
export const buildAnnouncePages = async (data) => {
    const template = await getAnnounceTemplate(data.league.id);
    const { meta } = template;
    const { files, fonts } = await resolveTemplateAssets(data.league.id, meta);
    const chunks = splitEvenly(data.games, meta.perImage);
    const pages = chunks.map((games, i) => template.getHtml({
        ...data, games, files, fonts, page: i + 1, pages: chunks.length,
    }));
    const hasBackground = templateSlots(meta).some(s => s.name === 'background' && s.kind === 'image');
    const background = {
        slot: hasBackground,
        own: hasBackground && !!(await findAsset(data.league.id, 'background')),
    };
    return { width: meta.width, height: meta.height, perImage: meta.perImage, pages, background };
};
