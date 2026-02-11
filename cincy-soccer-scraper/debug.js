const puppeteer = require('puppeteer');
const fs = require('fs');

// TRY THIS URL FIRST: 
// I suspect the team list is actually on the "/schedules" sub-page.
const TARGET_URL = 'https://system.gotsport.com/org_event/events/43740/schedules'; 

async function runDebug() {
    console.log("🕵️ Debugger starting...");
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set a normal screen size so the layout looks standard
    await page.setViewport({width: 1280, height: 800});

    console.log(`Visiting: ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

    // 1. Take a screenshot
    await page.screenshot({ path: 'debug_screenshot.png' });
    console.log("📸 Screenshot saved to 'debug_screenshot.png'");

    // 2. Dump the raw HTML
    const html = await page.content();
    fs.writeFileSync('debug_source.html', html);
    console.log("📝 HTML source saved to 'debug_source.html'");

    await browser.close();
}

runDebug();