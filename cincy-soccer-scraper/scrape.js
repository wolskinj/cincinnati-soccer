const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');

// 1. CONFIGURATION: The List of Leagues
// LOOK UP ONE LEVEL (../) to find leagues.js
const LEAGUES = require(path.join(__dirname, '../data/leagues.js'));

async function startRobot() {
    console.log("🤖 Scout Robot (Multi-League Edition) starting...");
    
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // We will store ALL divisions from ALL leagues here
    const masterList = [];

    // 2. LOOP: Visit each league one by one
    for (const league of LEAGUES) {
        if (league.url.includes('REPLACE')) {
            console.log(`⚠️  Skipping ${league.name} (No URL provided yet)`);
            continue;
        }

        console.log(`🌎 Traveling to ${league.name}...`);
        
        try {
            await page.goto(league.url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Run the same logic we used before
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
                                league: leagueId, // Add the League ID (e.g., CPL)
                                name: name,
                                url: url
                            });
                        }
                    }
                });
                return results;
            }, league.id); // Pass the league ID into the browser

            console.log(`   ✅ Found ${leagueDivisions.length} divisions in ${league.name}.`);
            masterList.push(...leagueDivisions);

        } catch (error) {
            console.log(`   ❌ Error scanning ${league.name}: ${error.message}`);
        }
    }

    // 3. SAVE THE MASTER MAP
    const csvWriter = createCsvWriter({
        path: path.join(__dirname, '../data/scraped_divisions.csv'),
        header: [
            {id: 'league', title: 'LEAGUE'},       // New Column!
            {id: 'name', title: 'DIVISION_NAME'},
            {id: 'url', title: 'LINK_URL'}
        ]
    });

    await csvWriter.writeRecords(masterList);
    console.log(`💾 Saved ${masterList.length} total divisions to 'scraped_divisions.csv'`);

    await browser.close();
}

startRobot();