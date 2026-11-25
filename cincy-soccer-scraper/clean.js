const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const { getClubStem, buildCanonicalLookup } = require('./clubNormalizer');

const INPUT_FILE = path.join(__dirname, '../data/all_teams.csv');
const OUTPUT_FILE = path.join(__dirname, '../data/clean_teams.csv');

// === 1. LOAD EXPLICIT CLUB MAPPINGS ===
let CLUB_MAPPINGS = {};
const CLUB_MAPPINGS_FILE = path.join(__dirname, 'club_mappings.json');
if (fs.existsSync(CLUB_MAPPINGS_FILE)) {
    try {
        CLUB_MAPPINGS = JSON.parse(fs.readFileSync(CLUB_MAPPINGS_FILE, 'utf-8'));
    } catch (e) {
        console.warn("Could not parse club_mappings.json, continuing without explicit overrides.");
    }
}

// === 2. LOAD AI MAPPINGS ===
const AI_MAPPINGS_FILE = path.join(__dirname, '../data/ai_team_mappings.json');
let aiMappings = {};
if (fs.existsSync(AI_MAPPINGS_FILE)) {
    try {
        aiMappings = JSON.parse(fs.readFileSync(AI_MAPPINGS_FILE, 'utf-8'));
    } catch (e) {
        console.warn("Could not parse AI mappings, falling back to basic matching.");
    }
}

// === 3. PRE-PASS: COLLECT ALL CANDIDATE CLUB NAMES FOR CLUSTERING ===
const discoveredClubs = new Set();
Object.keys(CLUB_MAPPINGS).forEach(c => discoveredClubs.add(c));

// Add from existing AI mappings
Object.values(aiMappings).forEach(m => {
    if (m.clubName && m.clubName !== 'Independent') {
        discoveredClubs.add(m.clubName);
    }
});

// Build the global canonical lookup engine
const canonicalEngine = buildCanonicalLookup(Array.from(discoveredClubs), CLUB_MAPPINGS);

// Reconcile and clean existing ai_team_mappings.json in-place
let aiDirty = false;
for (const [key, mapping] of Object.entries(aiMappings)) {
    if (mapping.clubName) {
        const canonical = canonicalEngine.getCanonical(mapping.clubName);
        if (canonical !== mapping.clubName) {
            mapping.clubName = canonical;
            aiDirty = true;
        }
    }
}
if (aiDirty) {
    fs.writeFileSync(AI_MAPPINGS_FILE, JSON.stringify(aiMappings, null, 2));
    console.log("🔄 Synchronized and canonicalized cached AI team mappings.");
}

// Prepare regex fallback list sorted by length descending
const sortedAliases = [];
for (const [officialName, aliases] of Object.entries(CLUB_MAPPINGS)) {
    for (const alias of aliases) {
        sortedAliases.push({ 
            alias: alias,
            regex: new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'), 
            officialName 
        });
    }
}
sortedAliases.sort((a, b) => b.alias.length - a.alias.length);

function sanitizeTeamName(rawName) {
    if (!rawName) return '';
    let name = rawName.trim().replace(/\s+/g, ' ');

    // Remove trailing state codes like (OH), (KY), (IN)
    name = name.trim().replace(/\([A-Z]{2}\)$/i, '').trim();

    // Remove repeated club prefix tokens at beginning, e.g. "Impact GFC Impact GFC GU14 Premier" -> "Impact GFC GU14 Premier"
    name = name.replace(/^(\b[\w\s]{2,25}?\b)\s+\1\b/i, '$1');
    name = name.replace(/^(\b[\w\s]{2,25}?\b)\s+\1\b/i, '$1');

    return name.trim();
}

const { buildClubAliasesMap, getCanonicalTeamName, getNormalizedTeamKey } = require('../data/teamCanonicalizer');
const clubAliasesMap = buildClubAliasesMap(CLUB_MAPPINGS);

const allTeams = [];
const seenSignatures = new Set(); // Tracks unique teams

console.log("🧼 Smart Refinery (with Deterministic Club Normalization & AI Deduplication) starting...");

fs.createReadStream(INPUT_FILE)
    .pipe(csv())
    .on('data', (row) => {
        if (!row.TEAM_NAME) return;

        let originalName = row.TEAM_NAME.trim();
        let sanitized = sanitizeTeamName(originalName);
        let teamName = sanitized;
        let clubName = "Independent";

        // 1. AI MATCHING (Primary)
        if (aiMappings[originalName]) {
            teamName = sanitizeTeamName(aiMappings[originalName].cleanName || teamName);
            clubName = aiMappings[originalName].clubName || clubName;
        } else if (aiMappings[sanitized]) {
            teamName = sanitizeTeamName(aiMappings[sanitized].cleanName || teamName);
            clubName = aiMappings[sanitized].clubName || clubName;
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

        // Pass clubName through deterministic canonical lookup
        clubName = canonicalEngine.getCanonical(clubName);

        // 3. CANONICAL TEAM NAME STANDARDIZATION
        teamName = getCanonicalTeamName(teamName, clubName, clubAliasesMap);

        // 4. DE-DUPLICATION CHECK (Using Canonical Key)
        const teamKey = getNormalizedTeamKey(teamName, clubName, clubAliasesMap);
        const signature = `${teamKey}|${row.DIVISION}|${row.LEAGUE}`;

        if (seenSignatures.has(signature)) {
            return;
        }

        seenSignatures.add(signature);

        // 5. Update row
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