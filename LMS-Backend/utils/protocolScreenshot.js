import puppeteer from 'puppeteer';

// Проверяем данные оборота, а не наличие напечатанных заголовков/пустого бланка.
// Явное «Нет» в отметке о протесте тоже считается заполненным полем.
export const hasProtocolBackContent = (data) => {
    const hasText = (value) => value != null && String(value).trim() !== '';
    const notes = data.notes || {};
    return (data.shootout || []).length > 0
        || (data.playerChecks || []).some(row => Object.values(row).some(hasText))
        || [notes.referee, notes.inspector, notes.medical, notes.protestText,
            notes.protestHome?.filed, notes.protestAway?.filed].some(hasText);
};

export const renderProtocolWebp = async (html, includeBack) => {
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
        const page = await browser.newPage();
        // Рендерим с запасом разрешения, затем приводим изображение к высоте 1200px.
        await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 2 });
        await page.setJavaScriptEnabled(false);
        await page.emulateMediaType('print');
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForFunction(() => document.fonts.status === 'loaded', { timeout: 10000 });

        await page.evaluate((withBack) => {
            const sheets = [...document.querySelectorAll('.page')];
            if (!sheets.length || sheets.length > 2 || (withBack && sheets.length !== 2)) {
                throw new Error('Шаблон протокола должен содержать лицевой лист и оборот в блоках .page');
            }
            if (!withBack && sheets[1]) sheets[1].remove();
        }, includeBack);

        // Тот же печатный шаблон: меняется только взаимное положение листов.
        await page.addStyleTag({ content: `
            html { margin: 0 !important; padding: 0 !important; background: #fff !important; }
            body {
                margin: 0 !important; padding: 0 !important;
                display: flex !important; flex-direction: row !important;
                align-items: flex-start !important; gap: 0 !important;
                width: max-content !important; height: auto !important;
                background: #fff !important;
                -webkit-print-color-adjust: exact; print-color-adjust: exact;
            }
            .page {
                flex: 0 0 210mm !important; box-sizing: border-box !important;
                width: 210mm !important; height: 297mm !important;
                margin: 0 !important; box-shadow: none !important;
                background: #fff !important;
                break-before: auto !important; page-break-before: auto !important;
            }
        ` });
        const body = await page.$('body');
        const source = Buffer.from(await body.screenshot({ type: 'png' })).toString('base64');
        const webp = await page.evaluate(async (base64) => {
            const image = new Image();
            image.src = `data:image/png;base64,${base64}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.height = 1200;
            canvas.width = Math.round(image.naturalWidth * canvas.height / image.naturalHeight);
            const context = canvas.getContext('2d');
            context.imageSmoothingEnabled = true;
            context.imageSmoothingQuality = 'high';
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/webp', 0.95).split(',')[1];
        }, source);
        return Buffer.from(webp, 'base64');
    } finally {
        if (browser) await browser.close();
    }
};
