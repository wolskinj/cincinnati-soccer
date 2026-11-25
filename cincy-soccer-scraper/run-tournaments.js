const { spawnSync } = require('child_process');
const path = require('path');
const { parseTournamentArgs, printTournamentList } = require('./tournamentFilter.js');

function runStep(scriptName, args) {
    const scriptPath = path.join(__dirname, scriptName);
    console.log(`\n▶️  Executing: node ${scriptName} ${args.join(' ')}`);
    
    const result = spawnSync(process.execPath, [scriptPath, ...args], {
        stdio: 'inherit',
        env: process.env
    });

    if (result.status !== 0) {
        console.error(`\n❌ Step ${scriptName} failed with exit code ${result.status}. Pipeline aborted.`);
        process.exit(result.status || 1);
    }
}

function runTournamentPipeline() {
    const args = process.argv.slice(2);
    const { isList, rawTargets, matchedTournaments, allTournaments } = parseTournamentArgs(args);

    if (isList) {
        printTournamentList(allTournaments);
        return;
    }

    if (matchedTournaments.length === 0) {
        console.error(`\n❌ No configured tournaments matched: "${rawTargets.join(', ')}"`);
        console.log("Run with --list to view all available tournaments.\n");
        process.exit(1);
    }

    const isFiltered = rawTargets.length > 0;

    console.log("\n=======================================================");
    console.log("⚡ Cincinnati Soccer Tournament Scraping Pipeline");
    if (isFiltered) {
        console.log(`🎯 Targeting ${matchedTournaments.length} tournament(s):`);
        matchedTournaments.forEach(t => console.log(`   • ${t.name} (${t.id})`));
    } else {
        console.log(`🎯 Targeting ALL ${matchedTournaments.length} active tournaments.`);
    }
    console.log("=======================================================");

    // Step 1: Scout Divisions
    runStep('scrape-tournaments.js', args);

    // Step 2: Harvest Teams
    runStep('harvest-tournaments.js', args);

    // Step 3: Clean & Standardize Teams
    runStep('clean-tournaments.js', args);

    console.log("\n=======================================================");
    console.log("🎉 Tournament Scraping Pipeline Complete!");
    console.log("   • Scraped Divisions: data/scraped_tournament_divisions.csv");
    console.log("   • Harvested Teams:   data/all_tournament_teams.csv");
    console.log("   • Cleaned Teams:     data/clean_tournament_teams.csv");
    console.log("=======================================================\n");
}

runTournamentPipeline();
