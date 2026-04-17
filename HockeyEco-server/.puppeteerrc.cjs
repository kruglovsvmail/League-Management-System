const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Указываем Puppeteer скачивать браузер прямо в папку проекта, 
  // а не в глобальную директорию сервера (к которой может не быть доступа)
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};