const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

const { parseTournamentArgs, printTournamentList } = require('./tournamentFilter.js');

const gotsportAdapter = require('./adapters/gotsport.js');
const exposureAdapter = require('./adapters/exposure.js');
const tourneycentralAdapter = require('./adapters/tourneycentral.js');

async function startTournamentScout() {
    const { isList, rawTargets, matchedTournaments, allTournaments } = parseTournamentArgs();

    if (isList) {
        printTournamentList(allTournaments);
        return;
    }

    if (matchedTournaments.length === 0) {
        console.error(`\n❌ No configured tournaments matched query: "${rawTargets.join(', ')}"`);
        console.log("Run with --list to see all available tournament IDs and names.\n");
        process.exit(1);
    }

    const isFiltered = rawTargets.length > 0;
    const targetIds = new Set(matchedTournaments.map(t => t.id));

    console.log("=======================================================");
    console.log("🏆 Tournament Scout Robot starting...");
    if (isFiltered) {
        console.log(`🎯 Targeted Tournaments (${matchedTournaments.length}): ${matchedTournaments.map(t => t.name).join(', ')}`);
    } else {
        console.log(`🎯 Scanning all ${matchedTournaments.length} configured tournaments.`);
    }
    console.log("=======================================================");

    // Load existing divisions if doing a targeted subset crawl
    const divisionsFilePath = path.join(__dirname, '../data/scraped_tournament_divisions.csv');
    const retainedDivisions = [];
    if (isFiltered && fs.existsSync(divisionsFilePath)) {
        await new Promise((resolve) => {
            fs.createReadStream(divisionsFilePath)
                .pipe(csv())
                .on('data', (row) => {
                    if (row.TOURNAMENT && !targetIds.has(row.TOURNAMENT)) {
                        retainedDivisions.push({
                            tournament: row.TOURNAMENT,
                            division: row.DIVISION_NAME || row.division,
                            url: row.LINK_URL || row.url,
                            platform: row.PLATFORM || row.platform
                        });
                    }
                })
                .on('end', resolve);
        });
        console.log(`📂 Preserving ${retainedDivisions.length} existing divisions for untouched tournaments.`);
    }

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

    const newlyScrapedList = [];

    for (const tournament of matchedTournaments) {
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
                newlyScrapedList.push(...divisions);
                success = true;

            } catch (error) {
                console.log(`   ⚠️ Attempt ${attempts} error scanning ${tournament.name}: ${error.message}`);
                if (attempts >= 2) {
                    console.log(`   ❌ Failed to scan ${tournament.name} after 2 attempts.`);
                }
            }
        }
    }

    await browser.close();

    const masterList = [...retainedDivisions, ...newlyScrapedList];

    const csvWriter = createCsvWriter({
        path: divisionsFilePath,
        header: [
            { id: 'tournament', title: 'TOURNAMENT' },
            { id: 'division', title: 'DIVISION_NAME' },
            { id: 'url', title: 'LINK_URL' },
            { id: 'platform', title: 'PLATFORM' }
        ]
    });

    await csvWriter.writeRecords(masterList);
    console.log(`💾 Saved ${masterList.length} total tournament divisions (${newlyScrapedList.length} fresh + ${retainedDivisions.length} retained) to 'scraped_tournament_divisions.csv'\n`);
}

startTournamentScout().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
