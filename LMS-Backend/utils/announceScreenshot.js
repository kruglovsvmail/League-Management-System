import puppeteer from 'puppeteer';

// Снимок страниц анонса в PNG. Тот же системный Chromium, что у картинок протоколов
// (см. protocolScreenshot.js), — поэтому картинка одинаковая, с какого бы устройства
// её ни заказали.
export const renderAnnouncePngs = async (pages, { width, height }) => {
    const options = {
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else if (process.platform === 'linux') {
        options.executablePath = '/usr/bin/chromium';
    }

    let browser;
    try {
        browser = await puppeteer.launch(options);
        const images = [];
        // Новая вкладка на каждую картинку: повторный setContent в той же вкладке
        // иногда не дожидается события загрузки и падает по таймауту.
        for (const html of pages) {
            const page = await browser.newPage();
            await page.setViewport({ width, height, deviceScaleFactor: 1 });
            // 'load' ждёт все <img> документа — фон и эмблемы с бакета.
            await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
            // Шаблон сам говорит, что дорисован: шрифт применён, длинные надписи ужаты.
            await page.waitForFunction(() => window.__announceReady === true, { timeout: 15000 });
            const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
            images.push(Buffer.from(shot));
            await page.close();
        }
        return images;
    } finally {
        if (browser) await browser.close();
    }
};
