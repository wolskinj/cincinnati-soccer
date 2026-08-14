const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const { buildCanonicalLookup } = require('./clubNormalizer');
const { buildClubAliasesMap, getCanonicalTeamName, getNormalizedTeamKey } = require('../data/teamCanonicalizer');

const INPUT_FILE = path.join(__dirname, '../data/all_tournament_teams.csv');
const OUTPUT_FILE = path.join(__dirname, '../data/clean_tournament_teams.csv');
const MASTER_TEAMS_FILE = path.join(__dirname, '../data/clean_teams.csv');
const CLUBS_JSON_FILE = path.join(__dirname, '../data/clubs.json');

function makeTeamSlug(name) {
    if (!name) return '';
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function sanitizeTeamName(rawName) {
    if (!rawName) return '';
    let name = rawName.trim().replace(/\s+/g, ' ');

    // Remove trailing state codes like (OH), (KY), (IN)
    name = name.replace(/\s*\([A-Z]{2}\)\s*$/i, '');

    // Remove repeated club prefix tokens at beginning, e.g. "Impact GFC Impact GFC GU14 Premier" -> "Impact GFC GU14 Premier"
    name = name.replace(/^(\b[\w\s]{2,25}?\b)\s+\1\b/i, '$1');
    name = name.replace(/^(\b[\w\s]{2,25}?\b)\s+\1\b/i, '$1');

    return name.trim();
}

// 1. Load Clubs & Mappings
let CLUB_MAPPINGS = {};
const CLUB_MAPPINGS_FILE = path.join(__dirname, 'club_mappings.json');
if (fs.existsSync(CLUB_MAPPINGS_FILE)) {
    try {
        CLUB_MAPPINGS = JSON.parse(fs.readFileSync(CLUB_MAPPINGS_FILE, 'utf-8'));
    } catch (e) {}
}

const AI_MAPPINGS_FILE = path.join(__dirname, '../data/ai_team_mappings.json');
let aiMappings = {};
if (fs.existsSync(AI_MAPPINGS_FILE)) {
    try {
        aiMappings = JSON.parse(fs.readFileSync(AI_MAPPINGS_FILE, 'utf-8'));
    } catch (e) {}
}

let verifiedClubs = [];
if (fs.existsSync(CLUBS_JSON_FILE)) {
    try {
        verifiedClubs = JSON.parse(fs.readFileSync(CLUBS_JSON_FILE, 'utf-8'));
    } catch (e) {}
}
const verifiedClubSet = new Set(verifiedClubs.map(c => c.name.toLowerCase().trim()));

// 2. Build Canonical Lookup Engine & Aliases Map
const discoveredClubs = new Set();
Object.keys(CLUB_MAPPINGS).forEach(c => discoveredClubs.add(c));
verifiedClubs.forEach(c => discoveredClubs.add(c.name));
Object.values(aiMappings).forEach(m => {
    if (m.clubName && m.clubName !== 'Independent') {
        discoveredClubs.add(m.clubName);
    }
});

const canonicalEngine = buildCanonicalLookup(Array.from(discoveredClubs), CLUB_MAPPINGS);
const clubAliasesMap = buildClubAliasesMap(CLUB_MAPPINGS);

// Prepare Regex Fallback List
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

async function cleanTournamentTeams() {
    console.log("🧼 Tournament Refinery starting...");

    if (!fs.existsSync(INPUT_FILE)) {
        console.log("ℹ️ No all_tournament_teams.csv found. Writing empty clean_tournament_teams.csv.");
        const csvWriter = createCsvWriter({
            path: OUTPUT_FILE,
            header: [
                { id: 'TOURNAMENT', title: 'TOURNAMENT' },
                { id: 'DIVISION', title: 'DIVISION' },
                { id: 'TEAM_NAME', title: 'TEAM_NAME' },
                { id: 'CLUB', title: 'CLUB' },
                { id: 'IS_LOCAL_CLUB', title: 'IS_LOCAL_CLUB' },
                { id: 'STATE', title: 'STATE' },
                { id: 'SCHEDULE_LINK', title: 'SCHEDULE_LINK' },
                { id: 'PLATFORM', title: 'PLATFORM' }
            ]
        });
        await csvWriter.writeRecords([]);
        return;
    }

    const cleanRecords = [];
    const seenSignatures = new Set();

    // Read master clean_teams.csv (filtered for baseline league teams)
    const existingTeamKeys = new Map();
    if (fs.existsSync(MASTER_TEAMS_FILE)) {
        await new Promise(resolve => {
            fs.createReadStream(MASTER_TEAMS_FILE)
                .pipe(csv())
                .on('data', row => {
                    if (row.TEAM_NAME && row.LEAGUE !== 'Tournament Play Only') {
                        const normKey = getNormalizedTeamKey(row.TEAM_NAME, row.CLUB, clubAliasesMap);
                        existingTeamKeys.set(normKey, row);
                        existingTeamKeys.set(makeTeamSlug(row.TEAM_NAME), row);
                        existingTeamKeys.set(row.TEAM_NAME.toLowerCase().trim(), row);
                    }
                })
                .on('end', resolve);
        });
    }

    const newLocalTeamsToAdd = [];

    await new Promise((resolve) => {
        fs.createReadStream(INPUT_FILE)
            .pipe(csv())
            .on('data', (row) => {
                if (!row.TEAM_NAME) return;

                let originalName = row.TEAM_NAME.trim();
                let sanitized = sanitizeTeamName(originalName);
                let teamName = sanitized;
                let clubName = (row.CLUB_RAW && !/^\d+$/.test(row.CLUB_RAW.trim())) ? row.CLUB_RAW.trim() : "Independent";

                // 1. AI Mappings Check (exact raw match, then sanitized match)
                if (aiMappings[originalName]) {
                    teamName = sanitizeTeamName(aiMappings[originalName].cleanName || teamName);
                    clubName = aiMappings[originalName].clubName || clubName;
                } else if (aiMappings[sanitized]) {
                    teamName = sanitizeTeamName(aiMappings[sanitized].cleanName || teamName);
                    clubName = aiMappings[sanitized].clubName || clubName;
                } else {
                    // 2. Fallback smart regex alias matching against team name
                    let matchedAlias = false;
                    for (const { regex, officialName } of sortedAliases) {
                        if (regex.test(teamName)) {
                            clubName = officialName;
                            matchedAlias = true;
                            break;
                        }
                    }

                    if (!matchedAlias && (clubName === "Independent" || !clubName || /^\d+$/.test(clubName))) {
                        // Extract first 1 or 2 words from team name
                        const cleanWords = teamName.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 0);
                        if (cleanWords.length >= 2 && !/^(U\d+|B\d+|G\d+|20\d\d)/i.test(cleanWords[0])) {
                            clubName = `${cleanWords[0]} ${cleanWords[1]}`;
                        } else if (cleanWords.length >= 1) {
                            clubName = cleanWords[0];
                        } else {
                            clubName = "Independent";
                        }
                    }
                }

                // Canonical Normalization for Club
                clubName = canonicalEngine.getCanonical(clubName);

                // Canonical Normalization for Team Name
                teamName = getCanonicalTeamName(teamName, clubName, clubAliasesMap);

                // Determine if Local Cincinnati Club
                const isLocalClub = verifiedClubSet.has(clubName.toLowerCase().trim()) || 
                                    verifiedClubs.some(c => c.name.toLowerCase() === clubName.toLowerCase());

                const signature = `${row.TOURNAMENT}|${row.DIVISION}|${teamName}`;
                if (seenSignatures.has(signature)) return;
                seenSignatures.add(signature);

                cleanRecords.push({
                    TOURNAMENT: row.TOURNAMENT,
                    DIVISION: row.DIVISION,
                    TEAM_NAME: teamName,
                    CLUB: clubName,
                    IS_LOCAL_CLUB: isLocalClub ? 'true' : 'false',
                    STATE: row.STATE || '',
                    SCHEDULE_LINK: row.SCHEDULE_LINK,
                    PLATFORM: row.PLATFORM || 'GotSport'
                });

                // If local club and not yet in master clean_teams.csv, register for site profile
                if (isLocalClub) {
                    const normKey = getNormalizedTeamKey(teamName, clubName, clubAliasesMap);
                    const slugKey = makeTeamSlug(teamName);
                    const rawKey = teamName.toLowerCase().trim();

                    if (!existingTeamKeys.has(normKey) && !existingTeamKeys.has(slugKey) && !existingTeamKeys.has(rawKey)) {
                        newLocalTeamsToAdd.push({
                            LEAGUE: 'Tournament Play Only',
                            DIVISION: row.DIVISION,
                            TEAM_NAME: teamName,
                            SCHEDULE_LINK: row.SCHEDULE_LINK,
                            CLUB: clubName
                        });
                        existingTeamKeys.set(normKey, true);
                        existingTeamKeys.set(slugKey, true);
                        existingTeamKeys.set(rawKey, true);
                    }
                }
            })
            .on('end', resolve);
    });

    const csvWriter = createCsvWriter({
        path: OUTPUT_FILE,
        header: [
            { id: 'TOURNAMENT', title: 'TOURNAMENT' },
            { id: 'DIVISION', title: 'DIVISION' },
            { id: 'TEAM_NAME', title: 'TEAM_NAME' },
            { id: 'CLUB', title: 'CLUB' },
            { id: 'IS_LOCAL_CLUB', title: 'IS_LOCAL_CLUB' },
            { id: 'STATE', title: 'STATE' },
            { id: 'SCHEDULE_LINK', title: 'SCHEDULE_LINK' },
            { id: 'PLATFORM', title: 'PLATFORM' }
        ]
    });

    await csvWriter.writeRecords(cleanRecords);
    console.log(`✨ Cleaned & Deduplicated ${cleanRecords.length} tournament team records.`);

    // If new local teams found, append to clean_teams.csv
    if (newLocalTeamsToAdd.length > 0) {
        const masterAppendWriter = createCsvWriter({
            path: MASTER_TEAMS_FILE,
            header: [
                { id: 'LEAGUE', title: 'LEAGUE' },
                { id: 'DIVISION', title: 'DIVISION' },
                { id: 'TEAM_NAME', title: 'TEAM_NAME' },
                { id: 'SCHEDULE_LINK', title: 'SCHEDULE_LINK' },
                { id: 'CLUB', title: 'CLUB' }
            ],
            append: true
        });
        await masterAppendWriter.writeRecords(newLocalTeamsToAdd);
        console.log(`🎉 Added ${newLocalTeamsToAdd.length} newly discovered local tournament teams to master team catalog.`);
    }
}

cleanTournamentTeams();
