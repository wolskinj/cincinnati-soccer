const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');

const LEAGUES = require(path.join(__dirname, '../data/leagues.js'));

async function startRobot() {
    console.log("🤖 Scout Robot (Multi-League Edition & Resource Optimized) starting...");
    
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage();

    // RESOURCE OPTIMIZATION: Block unneeded assets (images, stylesheets, fonts)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    const masterList = [];

    for (const league of LEAGUES) {
        if (!league.url || league.url.includes('REPLACE')) {
            console.log(`⚠️  Skipping ${league.name} (No URL provided yet)`);
            continue;
        }

        console.log(`🌎 Traveling to ${league.name}...`);
        
        let attempts = 0;
        let success = false;
        
        while (attempts < 2 && !success) {
            attempts++;
            try {
                await page.goto(league.url, { waitUntil: 'domcontentloaded', timeout: 45000 });

                const leagueDivisions = await page.evaluate((leagueId) => {
                    const results = [];
                    const rows = document.querySelectorAll('div.row');
                    
                    rows.forEach(row => {
                        const nameEl = row.querySelector('.col-md-6 b');
                        const linkEl = row.querySelector('a.btn-primary-custom');

                        if (nameEl && linkEl) {
                            const name = nameEl.innerText.trim();
                            const url = linkEl.href;

                            if (url.includes('group=')) {
                                results.push({
                                    league: leagueId,
                                    name: name,
                                    url: url
                                });
                            }
                        }
                    });
                    return results;
                }, league.id);

                console.log(`   ✅ Found ${leagueDivisions.length} divisions in ${league.name}.`);
                masterList.push(...leagueDivisions);
                success = true;

            } catch (error) {
                console.log(`   ⚠️ Attempt ${attempts} error scanning ${league.name}: ${error.message}`);
                if (attempts >= 2) {
                    console.log(`   ❌ Failed to scan ${league.name} after 2 attempts.`);
                }
            }
        }
    }

    const csvWriter = createCsvWriter({
        path: path.join(__dirname, '../data/scraped_divisions.csv'),
        header: [
            {id: 'league', title: 'LEAGUE'},
            {id: 'name', title: 'DIVISION_NAME'},
            {id: 'url', title: 'LINK_URL'}
        ]
    });

    await csvWriter.writeRecords(masterList);
    console.log(`💾 Saved ${masterList.length} total divisions to 'scraped_divisions.csv'`);

    await browser.close();
}

startRobot();