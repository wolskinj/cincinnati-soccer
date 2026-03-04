const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const INPUT_FILE = 'all_teams.csv';
const OUTPUT_FILE = 'clean_teams.csv';

// === THE SMART DICTIONARY (Loaded from JSON) ===
// format: "Official Name": ["Nickname 1", "Nickname 2", "Code"]
const CLUB_MAPPINGS = require('./club_mappings.json');

const allTeams = [];
const seenSignatures = new Set(); // <--- THE BOUNCER (Tracks unique teams)

console.log("🧼 Smart Refinery (with Deduplication & Enhanced Dictionary) starting...");

fs.createReadStream(INPUT_FILE)
    .pipe(csv())
    .on('data', (row) => {
        // SAFETY: Skip empty rows
        if (!row.TEAM_NAME) return;

        // 1. DE-DUPLICATION CHECK ("The Bouncer")
        // Create a unique fingerprint for this team
        const signature = `${row.TEAM_NAME}|${row.DIVISION}|${row.LEAGUE}`;

        // If we've seen this exact team before, SKIP IT
        if (seenSignatures.has(signature)) {
            return;
        }

        // Otherwise, remember it and proceed
        seenSignatures.add(signature);

        // 2. SMART MATCHING
        let teamName = row.TEAM_NAME;
        let clubName = "Independent";

        let matchFound = false;
        for (const [officialName, aliases] of Object.entries(CLUB_MAPPINGS)) {
            for (const alias of aliases) {
                // Check if the alias is inside the team name
                if (teamName.toLowerCase().includes(alias.toLowerCase())) {
                    clubName = officialName;
                    matchFound = true;
                    break;
                }
            }
            if (matchFound) break;
        }

        // 3. FALLBACK GUESS (If not in our dictionary)
        if (clubName === "Independent") {
            const words = teamName.split(' ');
            if (words.length >= 2) {
                clubName = `${words[0]} ${words[1]}`;
            } else {
                clubName = words[0];
            }
        }

        // 4. Add Club to row
        row.CLUB = clubName;
        allTeams.push(row);
    })
    .on('end', async () => {

        const csvWriter = createCsvWriter({
            path: OUTPUT_FILE,
            header: [
                { id: 'LEAGUE', title: 'LEAGUE' },
                { id: 'DIVISION', title: 'DIVISION' },
                { id: 'TEAM_NAME', title: 'TEAM_NAME' },
                { id: 'SCHEDULE_LINK', title: 'SCHEDULE_LINK' },
                { id: 'CLUB', title: 'CLUB' }
            ]
        });

        await csvWriter.writeRecords(allTeams);
        console.log(`✨ Cleaned & Deduplicated using Enhanced Dictionary. Final count: ${allTeams.length} unique teams.`);
    });