const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

/**
 * Launches a headless Puppeteer browser and page with request interception
 * blocking non-essential resource types.
 */
async function launchOptimizedPage({
    blockedResourceTypes = ['image', 'font', 'media'],
    userAgent = null,
    headless = undefined
} = {}) {
    const launchOptions = {
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        protocolTimeout: 60000
    };
    if (headless !== undefined) {
        launchOptions.headless = headless;
    }
    const browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    if (userAgent) {
        await page.setUserAgent(userAgent);
    }
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (blockedResourceTypes.includes(req.resourceType())) {
            void req.abort();
        } else {
            void req.continue();
        }
    });
    return { browser, page };
}

/**
 * Returns paired overwrite (initWriter) and append (appendWriter) CSV writers
 * for a given file path and header schema.
 */
function createCsvWriters(filePath, header) {
    return {
        initWriter: createCsvWriter({ path: filePath, header, append: false }),
        appendWriter: createCsvWriter({ path: filePath, header, append: true })
    };
}

module.exports = { launchOptimizedPage, createCsvWriters };
