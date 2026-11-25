const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { launchOptimizedPage, createCsvWriters } = require('./browserHelper');

const { parseTournamentArgs } = require('./tournamentFilter.js');

const gotsportAdapter = require('./adapters/gotsport.js');
const exposureAdapter = require('./adapters/exposure.js');
const tourneycentralAdapter = require('./adapters/tourneycentral.js');

const BATCH_SIZE = 10;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function startTournamentHarvester() {
    const { isList, rawTargets, matchedTournaments } = parseTournamentArgs();

    if (isList) return;

    const isFiltered = rawTargets.length > 0;
    const targetIds = new Set(matchedTournaments.map(t => t.id));

    console.log("=======================================================");
    console.log("🚜 Tournament Harvester Robot starting...");
    if (isFiltered) {
        console.log(`🎯 Harvesting Teams for: ${matchedTournaments.map(t => t.name).join(', ')}`);
    } else {
        console.log("🎯 Harvesting Teams for all discovered tournament divisions.");
    }
    console.log("=======================================================");

    const allDiscoveredDivisions = [];
    const divisionsFile = path.join(__dirname, '../data/scraped_tournament_divisions.csv');
    
    if (!fs.existsSync(divisionsFile)) {
        console.log("⚠️ No scraped_tournament_divisions.csv found. Run scrape-tournaments.js first.");
        return;
    }

    await new Promise((resolve) => {
        fs.createReadStream(divisionsFile)
            .pipe(csv())
            .on('data', (row) => allDiscoveredDivisions.push(row))
            .on('end', () => resolve());
    });

    const divisionsToHarvest = isFiltered
        ? allDiscoveredDivisions.filter(d => targetIds.has(d.TOURNAMENT))
        : allDiscoveredDivisions;

    console.log(`🗺️ Loaded ${allDiscoveredDivisions.length} total divisions. Harvesting ${divisionsToHarvest.length} divisions for target tournaments.`);

    const outputFile = path.join(__dirname, '../data/all_tournament_teams.csv');
    const retainedTeams = [];

    if (isFiltered && fs.existsSync(outputFile)) {
        await new Promise((resolve) => {
            fs.createReadStream(outputFile)
                .pipe(csv())
                .on('data', (row) => {
                    if (row.TOURNAMENT && !targetIds.has(row.TOURNAMENT)) {
                        retainedTeams.push({
                            tournament: row.TOURNAMENT,
                            division: row.DIVISION || row.division,
                            team: row.TEAM_NAME || row.team,
                            clubRaw: row.CLUB_RAW || row.clubRaw || '',
                            state: row.STATE || row.state || '',
                            scheduleLink: row.SCHEDULE_LINK || row.scheduleLink || '',
                            platform: row.PLATFORM || row.platform || ''
                        });
                    }
                })
                .on('end', resolve);
        });
        console.log(`📂 Preserving ${retainedTeams.length} existing teams for untouched tournaments.`);
    }

    // Initialize output file with retained teams (or empty if full scrape)
    const { initWriter, appendWriter } = createCsvWriters(
        outputFile,
        [
            { id: 'tournament', title: 'TOURNAMENT' },
            { id: 'division', title: 'DIVISION' },
            { id: 'team', title: 'TEAM_NAME' },
            { id: 'clubRaw', title: 'CLUB_RAW' },
            { id: 'state', title: 'STATE' },
            { id: 'scheduleLink', title: 'SCHEDULE_LINK' },
            { id: 'platform', title: 'PLATFORM' }
        ]
    );
    await initWriter.writeRecords(retainedTeams);

    let totalHarvestedThisRun = 0;

    for (let i = 0; i < divisionsToHarvest.length; i += BATCH_SIZE) {
        const batch = divisionsToHarvest.slice(i, i + BATCH_SIZE);
        console.log(`\n📦 Processing Batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(divisionsToHarvest.length / BATCH_SIZE)} (Divisions ${i + 1} to ${i + batch.length})...`);
        
        const { browser, page } = await launchOptimizedPage({
            blockedResourceTypes: ['image', 'font', 'media'],
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            headless: 'new'
        });
        
        const batchResults = [];

        for (const division of batch) {
            const divName = division.DIVISION_NAME || division.division;
            const linkUrl = division.LINK_URL || division.url;
            const platform = division.PLATFORM || division.platform;
            const tourneyId = division.TOURNAMENT || division.tournament;

            console.log(`   Visiting: [${tourneyId}] ${divName}`);
            
            let success = false;
            let attempt = 0;

            while (attempt < 2 && !success) {
                attempt++;
                try {
                    await page.goto(linkUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

                    let teamsOnPage = [];
                    if (platform === 'GotSport') {
                        teamsOnPage = await gotsportAdapter.extractTeamsFromDivision(page, divName, tourneyId);
                    } else if (platform === 'Exposure') {
                        teamsOnPage = await exposureAdapter.extractTeamsFromDivision(page, divName, tourneyId);
                    } else if (platform === 'TourneyCentral') {
                        teamsOnPage = await tourneycentralAdapter.extractTeamsFromDivision(page, divName, tourneyId);
                    } else {
                        teamsOnPage = await gotsportAdapter.extractTeamsFromDivision(page, divName, tourneyId);
                    }

                    console.log(`      -> Found ${teamsOnPage.length} teams.`);
                    batchResults.push(...teamsOnPage);
                    success = true;
                    await sleep(200); 

                } catch (error) {
                    console.log(`      ⚠️ Attempt ${attempt} failed for ${divName}: ${error.message}`);
                }
            }
        }

        if (batchResults.length > 0) {
            await appendWriter.writeRecords(batchResults);
            totalHarvestedThisRun += batchResults.length;
            console.log(`   💾 Saved ${batchResults.length} tournament teams from this batch.`);
        }

        await browser.close();
        await sleep(400);
    }

    console.log(`\n✅ Tournament harvesting complete! (${totalHarvestedThisRun} fresh teams + ${retainedTeams.length} retained teams saved in 'all_tournament_teams.csv')\n`);
}

startTournamentHarvester().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
