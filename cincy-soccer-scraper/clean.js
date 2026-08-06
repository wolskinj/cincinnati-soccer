const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');

const INPUT_FILE = path.join(__dirname, '../data/all_teams.csv');
const OUTPUT_FILE = path.join(__dirname, '../data/clean_teams.csv');

// === AI MAPPINGS ===
const AI_MAPPINGS_FILE = path.join(__dirname, '../data/ai_team_mappings.json');
let aiMappings = {};
if (fs.existsSync(AI_MAPPINGS_FILE)) {
    try {
        aiMappings = JSON.parse(fs.readFileSync(AI_MAPPINGS_FILE, 'utf-8'));
    } catch (e) {
        console.warn("Could not parse AI mappings, falling back to basic matching.");
    }
}

// === THE SMART DICTIONARY (Fallback) ===
const CLUB_MAPPINGS = require(path.join(__dirname, 'club_mappings.json'));

const sortedAliases = [];
for (const [officialName, aliases] of Object.entries(CLUB_MAPPINGS)) {
    for (const alias of aliases) {
        // Use word boundaries for better regex fallback matching
        sortedAliases.push({ 
            alias: alias,
            regex: new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), 
            officialName 
        });
    }
}
// Sort descending by length so longer specific aliases (e.g. "Northwest Cincy SC") match before shorter subsets (e.g. "Cincy SC")
sortedAliases.sort((a, b) => b.alias.length - a.alias.length);

const allTeams = [];
const seenSignatures = new Set(); // Tracks unique teams

console.log("🧼 Smart Refinery (with AI Deduplication & Dictionary) starting...");

fs.createReadStream(INPUT_FILE)
    .pipe(csv())
    .on('data', (row) => {
        if (!row.TEAM_NAME) return;

        let originalName = row.TEAM_NAME.trim();
        let teamName = originalName;
        let clubName = "Independent";

        // 1. AI MATCHING (Primary)
        if (aiMappings[originalName]) {
            teamName = aiMappings[originalName].cleanName || teamName;
            clubName = aiMappings[originalName].clubName || clubName;
        } else {
            // 2. FALLBACK SMART MATCHING
            for (const { regex, officialName } of sortedAliases) {
                if (regex.test(teamName)) {
                    clubName = officialName;
                    break;
                }
            }

            if (clubName === "Independent") {
                const words = teamName.split(' ');
                if (words.length >= 2) {
                    clubName = `${words[0]} ${words[1]}`;
                } else {
                    clubName = words[0];
                }
            }
        }

        // 3. DE-DUPLICATION CHECK (Using Cleaned Name)
        const signature = `${teamName}|${row.DIVISION}|${row.LEAGUE}`;

        if (seenSignatures.has(signature)) {
            return;
        }

        seenSignatures.add(signature);

        // 4. Update row
        row.TEAM_NAME = teamName;
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
        console.log(`✨ Cleaned & Deduplicated. Final count: ${allTeams.length} unique teams.`);
    });