const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const gotsportAdapter = require('./adapters/gotsport.js');
const exposureAdapter = require('./adapters/exposure.js');
const tourneycentralAdapter = require('./adapters/tourneycentral.js');

const BATCH_SIZE = 10;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function startTournamentHarvester() {
    console.log("🚜 Tournament Harvester Robot starting...");

    const divisions = [];
    const divisionsFile = path.join(__dirname, '../data/scraped_tournament_divisions.csv');
    
    if (!fs.existsSync(divisionsFile)) {
        console.log("⚠️ No scraped_tournament_divisions.csv found. Run scrape-tournaments.js first.");
        return;
    }

    await new Promise((resolve) => {
        fs.createReadStream(divisionsFile)
            .pipe(csv())
            .on('data', (row) => divisions.push(row))
            .on('end', () => resolve());
    });
    console.log(`🗺️ Loaded map with ${divisions.length} tournament divisions.`);

    const outputFile = path.join(__dirname, '../data/all_tournament_teams.csv');
    const initWriter = createCsvWriter({
        path: outputFile,
        header: [
            { id: 'tournament', title: 'TOURNAMENT' },
            { id: 'division', title: 'DIVISION' },
            { id: 'team', title: 'TEAM_NAME' },
            { id: 'clubRaw', title: 'CLUB_RAW' },
            { id: 'state', title: 'STATE' },
            { id: 'scheduleLink', title: 'SCHEDULE_LINK' },
            { id: 'platform', title: 'PLATFORM' }
        ],
        append: false
    });
    await initWriter.writeRecords([]); 
    
    const appendWriter = createCsvWriter({
        path: outputFile,
        header: [
            { id: 'tournament', title: 'TOURNAMENT' },
            { id: 'division', title: 'DIVISION' },
            { id: 'team', title: 'TEAM_NAME' },
            { id: 'clubRaw', title: 'CLUB_RAW' },
            { id: 'state', title: 'STATE' },
            { id: 'scheduleLink', title: 'SCHEDULE_LINK' },
            { id: 'platform', title: 'PLATFORM' }
        ],
        append: true
    });

    for (let i = 0; i < divisions.length; i += BATCH_SIZE) {
        const batch = divisions.slice(i, i + BATCH_SIZE);
        console.log(`\n📦 Processing Batch ${Math.floor(i / BATCH_SIZE) + 1} (Items ${i + 1} to ${i + batch.length})...`);
        
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            protocolTimeout: 60000,
            headless: 'new'
        });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        const batchResults = [];

        for (const division of batch) {
            console.log(`   Visiting: [${division.TOURNAMENT}] ${division.DIVISION_NAME}`);
            
            let success = false;
            let attempt = 0;

            while (attempt < 2 && !success) {
                attempt++;
                try {
                    await page.goto(division.LINK_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });

                    let teamsOnPage = [];
                    if (division.PLATFORM === 'GotSport') {
                        teamsOnPage = await gotsportAdapter.extractTeamsFromDivision(page, division.DIVISION_NAME, division.TOURNAMENT);
                    } else if (division.PLATFORM === 'Exposure') {
                        teamsOnPage = await exposureAdapter.extractTeamsFromDivision(page, division.DIVISION_NAME, division.TOURNAMENT);
                    } else if (division.PLATFORM === 'TourneyCentral') {
                        teamsOnPage = await tourneycentralAdapter.extractTeamsFromDivision(page, division.DIVISION_NAME, division.TOURNAMENT);
                    } else {
                        teamsOnPage = await gotsportAdapter.extractTeamsFromDivision(page, division.DIVISION_NAME, division.TOURNAMENT);
                    }

                    console.log(`      -> Found ${teamsOnPage.length} teams.`);
                    batchResults.push(...teamsOnPage);
                    success = true;
                    await sleep(200); 

                } catch (error) {
                    console.log(`      ⚠️ Attempt ${attempt} failed for ${division.DIVISION_NAME}: ${error.message}`);
                }
            }
        }

        if (batchResults.length > 0) {
            await appendWriter.writeRecords(batchResults);
            console.log(`   💾 Saved ${batchResults.length} tournament teams from this batch.`);
        }

        await browser.close();
        await sleep(400);
    }

    console.log("\n✅ Tournament harvesting complete! 'all_tournament_teams.csv' is ready.");
}

startTournamentHarvester();
