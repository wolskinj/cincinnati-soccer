const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');

const TOURNAMENTS = require(path.join(__dirname, '../data/tournaments.js'));

const gotsportAdapter = require('./adapters/gotsport.js');
const exposureAdapter = require('./adapters/exposure.js');
const tourneycentralAdapter = require('./adapters/tourneycentral.js');

async function startTournamentScout() {
    console.log("🏆 Tournament Scout Robot starting...");
    
    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        headless: 'new'
    });
    const page = await browser.newPage();

    // Set desktop user-agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Resource Optimization: Block unneeded media/fonts/stylesheets
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'font', 'media'].includes(resourceType)) {
            req.abort();
        } else {
            req.continue();
        }
    });

    const masterList = [];

    for (const tournament of TOURNAMENTS) {
        if (!tournament.url || tournament.url.includes('REPLACE') || tournament.url === 'TBD') {
            console.log(`ℹ️ Skipping team crawl for ${tournament.name} (Announcement mode / URL pending)`);
            continue;
        }

        console.log(`🌎 Scanning tournament: ${tournament.name} (${tournament.platform})...`);
        
        let attempts = 0;
        let success = false;
        
        while (attempts < 2 && !success) {
            attempts++;
            try {
                await page.goto(tournament.url, { waitUntil: 'domcontentloaded', timeout: 45000 });

                let divisions = [];
                if (tournament.platform === 'GotSport') {
                    divisions = await gotsportAdapter.discoverDivisions(page, tournament);
                } else if (tournament.platform === 'Exposure') {
                    divisions = await exposureAdapter.discoverDivisions(page, tournament);
                } else if (tournament.platform === 'TourneyCentral') {
                    divisions = await tourneycentralAdapter.discoverDivisions(page, tournament);
                } else {
                    divisions = await gotsportAdapter.discoverDivisions(page, tournament);
                }

                console.log(`   ✅ Found ${divisions.length} divisions for ${tournament.name}.`);
                masterList.push(...divisions);
                success = true;

            } catch (error) {
                console.log(`   ⚠️ Attempt ${attempts} error scanning ${tournament.name}: ${error.message}`);
                if (attempts >= 2) {
                    console.log(`   ❌ Failed to scan ${tournament.name} after 2 attempts.`);
                }
            }
        }
    }

    const csvWriter = createCsvWriter({
        path: path.join(__dirname, '../data/scraped_tournament_divisions.csv'),
        header: [
            { id: 'tournament', title: 'TOURNAMENT' },
            { id: 'division', title: 'DIVISION_NAME' },
            { id: 'url', title: 'LINK_URL' },
            { id: 'platform', title: 'PLATFORM' }
        ]
    });

    await csvWriter.writeRecords(masterList);
    console.log(`💾 Saved ${masterList.length} tournament divisions to 'scraped_tournament_divisions.csv'`);

    await browser.close();
}

startTournamentScout();
