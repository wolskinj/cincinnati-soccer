const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

// CONFIGURATION
const BATCH_SIZE = 10; // Only do 10 pages at a time to keep Chromebook cool

// 1. SETUP: CSV Writer
const csvWriter = createCsvWriter({
    path: path.join(__dirname, '../data/all_teams.csv'),
    header: [
        {id: 'league', title: 'LEAGUE'},
        {id: 'division', title: 'DIVISION'},
        {id: 'team', title: 'TEAM_NAME'},
        {id: 'link', title: 'SCHEDULE_LINK'}
    ],
    append: false // We will overwrite the file initially
});

// Helper: Sleep function
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function startHarvester() {
    console.log("🚜 Harvester Robot (Batch Mode) starting...");

    // 2. READ: Load the map
    const divisions = [];
    await new Promise((resolve) => {
        fs.createReadStream(path.join(__dirname, '../data/scraped_divisions.csv'))
            .pipe(csv())
            .on('data', (row) => divisions.push(row))
            .on('end', () => resolve());
    });
    console.log(`🗺️ Loaded map with ${divisions.length} divisions.`);

    // Initialize the file (creates a blank file with headers)
    await csvWriter.writeRecords([]); 
    
    // Switch to "Append Mode" so we can add rows in chunks
    const appendWriter = createCsvWriter({
        path: path.join(__dirname, '../data/all_teams.csv'),
        header: [
            {id: 'league', title: 'LEAGUE'},
            {id: 'division', title: 'DIVISION'},
            {id: 'team', title: 'TEAM_NAME'},
            {id: 'link', title: 'SCHEDULE_LINK'}
        ],
        append: true // Important! Add to the bottom of the file
    });

    // 3. LOOP: Process in CHUNKS
    for (let i = 0; i < divisions.length; i += BATCH_SIZE) {
        // Get the next batch (e.g., items 0-9, then 10-19)
        const batch = divisions.slice(i, i + BATCH_SIZE);
        console.log(`\n📦 Processing Batch ${i / BATCH_SIZE + 1} (Items ${i} to ${i + batch.length})...`);
        
        // Launch a FRESH browser for every batch
        const browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            protocolTimeout: 60000,
        });
        const page = await browser.newPage();
        
        const batchResults = [];

        // Loop through the small batch
        for (const division of batch) {
            console.log(`   Visiting: [${division.LEAGUE}] ${division.DIVISION_NAME}`);
            
            try {
                await page.goto(division.LINK_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

                const teamsOnPage = await page.evaluate((currentDiv, currentLeague) => {
                    const uniqueTeams = new Map();
                    const links = document.querySelectorAll('td a[href*="team="]');

                    links.forEach(link => {
                        const teamUrl = link.href;
                        const teamName = link.innerText.trim();
                        if (!uniqueTeams.has(teamUrl)) {
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

                // Short rest
                await sleep(500); 

            } catch (error) {
                console.log(`      ❌ Skipped (Error): ${error.message}`);
            }
        }

        // Save this batch immediately
        if (batchResults.length > 0) {
            await appendWriter.writeRecords(batchResults);
            console.log(`   💾 Saved ${batchResults.length} teams from this batch.`);
        }

        // KILL the browser to free memory
        await browser.close();
        console.log("   ♻️  Browser recycled. Cooling down...");
        await sleep(1000); // Wait 1 second before starting next batch
    }

    console.log("\n✅ ALL DONE! 'all_teams.csv' is complete.");
}

startHarvester();