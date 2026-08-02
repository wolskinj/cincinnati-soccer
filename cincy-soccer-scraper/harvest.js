const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const BATCH_SIZE = 10;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function startHarvester() {
    console.log("🚜 Harvester Robot (Resource Optimized & Batch Mode) starting...");

    const divisions = [];
    await new Promise((resolve) => {
        fs.createReadStream(path.join(__dirname, '../data/scraped_divisions.csv'))
            .pipe(csv())
            .on('data', (row) => divisions.push(row))
            .on('end', () => resolve());
    });
    console.log(`🗺️ Loaded map with ${divisions.length} divisions.`);

    const initWriter = createCsvWriter({
        path: path.join(__dirname, '../data/all_teams.csv'),
        header: [
            {id: 'league', title: 'LEAGUE'},
            {id: 'division', title: 'DIVISION'},
            {id: 'team', title: 'TEAM_NAME'},
            {id: 'link', title: 'SCHEDULE_LINK'}
        ],
        append: false
    });
    await initWriter.writeRecords([]); 
    
    const appendWriter = createCsvWriter({
        path: path.join(__dirname, '../data/all_teams.csv'),
        header: [
            {id: 'league', title: 'LEAGUE'},
            {id: 'division', title: 'DIVISION'},
            {id: 'team', title: 'TEAM_NAME'},
            {id: 'link', title: 'SCHEDULE_LINK'}
        ],
        append: true
    });

    for (let i = 0; i < divisions.length; i += BATCH_SIZE) {
        const batch = divisions.slice(i, i + BATCH_SIZE);
        console.log(`\n📦 Processing Batch ${Math.floor(i / BATCH_SIZE) + 1} (Items ${i + 1} to ${i + batch.length})...`);
        
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            protocolTimeout: 60000,
        });
        const page = await browser.newPage();

        // RESOURCE OPTIMIZATION: Block unneeded assets
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        const batchResults = [];

        for (const division of batch) {
            console.log(`   Visiting: [${division.LEAGUE}] ${division.DIVISION_NAME}`);
            
            let success = false;
            let attempt = 0;

            while (attempt < 2 && !success) {
                attempt++;
                try {
                    await page.goto(division.LINK_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

                    const teamsOnPage = await page.evaluate((currentDiv, currentLeague) => {
                        const uniqueTeams = new Map();
                        const links = document.querySelectorAll('td a[href*="team="]');

                        links.forEach(link => {
                            const teamUrl = link.href;
                            const teamName = link.innerText.trim();
                            if (teamName && !uniqueTeams.has(teamUrl)) {
                                uniqueTeams.set(teamUrl, {
                                    league: currentLeague, 
                                    division: currentDiv,
                                    team: teamName,
                                    link: teamUrl
                                });
                            }
                        });
                        return Array.from(uniqueTeams.values());
                    }, division.DIVISION_NAME, division.LEAGUE);

                    console.log(`      -> Found ${teamsOnPage.length} teams.`);
                    batchResults.push(...teamsOnPage);
                    success = true;
                    await sleep(250); 

                } catch (error) {
                    console.log(`      ⚠️ Attempt ${attempt} failed for ${division.DIVISION_NAME}: ${error.message}`);
                }
            }
        }

        if (batchResults.length > 0) {
            await appendWriter.writeRecords(batchResults);
            console.log(`   💾 Saved ${batchResults.length} teams from this batch.`);
        }

        await browser.close();
        console.log("   ♻️  Browser recycled. Cooling down...");
        await sleep(500);
    }

    console.log("\n✅ ALL DONE! 'all_teams.csv' is complete.");
}

startHarvester();