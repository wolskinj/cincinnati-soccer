const path = require('path');
const TOURNAMENTS = require(path.join(__dirname, '../data/tournaments.js'));

function parseTournamentArgs(argv = process.argv.slice(2)) {
    let isList = false;
    const rawTargets = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i].trim();
        if (!arg) continue;

        if (arg === '--list' || arg === '-l') {
            isList = true;
        } else if (arg.startsWith('--tournament=') || arg.startsWith('--tournaments=') || arg.startsWith('-t=')) {
            const val = arg.split('=')[1];
            if (val) rawTargets.push(...val.split(','));
        } else if (arg === '--tournament' || arg === '--tournaments' || arg === '-t') {
            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                i++;
                rawTargets.push(...argv[i].split(','));
            }
        } else {
            // Strip any leading dashes (e.g. --community-kickoff-2026 -> community-kickoff-2026)
            const clean = arg.replace(/^-+/, '');
            if (clean.length > 0) {
                rawTargets.push(...clean.split(','));
            }
        }
    }

    const cleanTargets = rawTargets.map(t => t.trim().toLowerCase()).filter(t => t.length > 0);

    let matchedTournaments = [];
    if (cleanTargets.length === 0) {
        matchedTournaments = [...TOURNAMENTS];
    } else {
        const seen = new Set();
        for (const target of cleanTargets) {
            for (const t of TOURNAMENTS) {
                const idMatch = t.id.toLowerCase() === target;
                const nameMatch = t.name.toLowerCase() === target;
                const subIdMatch = t.id.toLowerCase().includes(target);
                const subNameMatch = t.name.toLowerCase().includes(target);

                if ((idMatch || nameMatch || subIdMatch || subNameMatch) && !seen.has(t.id)) {
                    seen.add(t.id);
                    matchedTournaments.push(t);
                }
            }
        }
    }

    return {
        isList,
        rawTargets: cleanTargets,
        matchedTournaments,
        allTournaments: TOURNAMENTS
    };
}

function printTournamentList(tournaments = TOURNAMENTS) {
    console.log("\n=======================================================");
    console.log("🏆 Configured Tournaments in cincinnati.soccer");
    console.log("=======================================================");
    
    tournaments.forEach((t, idx) => {
        const isReady = t.url && !t.url.includes('REPLACE') && t.url !== 'TBD';
        const status = isReady ? '✅ Active / Crawlable' : '⏳ Announcement Mode (URL Pending)';
        console.log(`\n${idx + 1}. ${t.name}`);
        console.log(`   ID:       ${t.id}`);
        console.log(`   Dates:    ${t.dates}`);
        console.log(`   Host:     ${t.hostClub || 'N/A'}`);
        console.log(`   Platform: ${t.platform || 'N/A'}`);
        console.log(`   Status:   ${status}`);
        if (t.url) console.log(`   URL:      ${t.url}`);
    });
    console.log("\n=======================================================");
    console.log("💡 Usage Examples:");
    console.log("   npm run scrape:tournaments                 # Scrape all active tournaments");
    console.log("   npm run scrape:tournaments -- party       # Scrape only 'Party on the Pitch'");
    console.log("   npm run scrape:tournaments -- summer,kickoff # Scrape multiple tournaments");
    console.log("=======================================================\n");
}

module.exports = {
    parseTournamentArgs,
    printTournamentList
};
