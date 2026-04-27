// LMS-Backend/src/protocols/protocol-factory.js
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Фабрика протоколов на стороне сервера.
 * @param {string|number} leagueId - ID лиги для поиска специфического шаблона.
 * @param {object} protocolData - Подготовленные данные матча.
 * @returns {Promise<string>} - HTML-строка протокола.
 */
export const getProtocolHtml = async (leagueId, protocolData) => {
    // Формируем путь к файлу вида protocol-200.js
    const specificTemplateName = `protocol-${leagueId}.js`;
    const templatePath = path.join(__dirname, specificTemplateName);
    
    try {
        // Проверяем физическое наличие файла
        if (fs.existsSync(templatePath)) {
            // Динамический импорт специфического шаблона
            const templateModule = await import(`./${specificTemplateName}`);
            return templateModule.getHtml(protocolData);
        } else {
            // Если файла нет, используем дефолтный
            const defaultModule = await import('./protocol-default.js');
            return defaultModule.getHtml(protocolData);
        }
    } catch (error) {
        console.error(`Ошибка при загрузке шаблона протокола (League ID: ${leagueId}):`, error);
        // Резервный запуск дефолтного шаблона в случае любой ошибки импорта
        const fallbackModule = await import('./protocol-default.js');
        return fallbackModule.getHtml(protocolData);
    }
};