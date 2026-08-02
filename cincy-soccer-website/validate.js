const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const DATA_DIR = path.join(__dirname, '../data');
const CLEAN_TEAMS_PATH = path.join(DATA_DIR, 'clean_teams.csv');
const SCRAPED_DIVISIONS_PATH = path.join(DATA_DIR, 'scraped_divisions.csv');
const ALL_TEAMS_PATH = path.join(DATA_DIR, 'all_teams.csv');
const LEAGUES_PATH = path.join(DATA_DIR, 'leagues.js');
const CLUBS_PATH = path.join(DATA_DIR, 'clubs.js');

let errors = [];
let warnings = [];

function logError(msg) {
    errors.push(`❌ ${msg}`);
    console.error(`❌ ERROR: ${msg}`);
}

function logWarning(msg) {
    warnings.push(`⚠️ ${msg}`);
    console.warn(`⚠️ WARNING: ${msg}`);
}

async function validateFileExistence() {
    console.log("🔍 Checking required data files...");
    const requiredFiles = [
        CLEAN_TEAMS_PATH,
        SCRAPED_DIVISIONS_PATH,
        ALL_TEAMS_PATH,
        LEAGUES_PATH,
        CLUBS_PATH
    ];

    for (const filePath of requiredFiles) {
        if (!fs.existsSync(filePath)) {
            logError(`Required file missing: ${path.relative(process.cwd(), filePath)}`);
        } else {
            const stats = fs.statSync(filePath);
            if (stats.size === 0) {
                logError(`File is empty (0 bytes): ${path.relative(process.cwd(), filePath)}`);
            }
        }
    }
}

function validateLeaguesAndClubs() {
    console.log("🔍 Validating leagues.js and clubs.js configurations...");
    let validLeagueIds = new Set();
    try {
        const leagues = require(LEAGUES_PATH);
        if (!Array.isArray(leagues) || leagues.length === 0) {
            logError("leagues.js must export a non-empty array.");
        } else {
            leagues.forEach((l, idx) => {
                if (!l.id || !l.name || !l.url) {
                    logError(`League at index ${idx} missing required properties (id, name, url).`);
                } else {
                    validLeagueIds.add(l.id);
                }
            });
            console.log(`   Found ${leagues.length} defined leagues: [${Array.from(validLeagueIds).join(', ')}]`);
        }
    } catch (e) {
        logError(`Failed to load leagues.js: ${e.message}`);
    }

    try {
        const clubs = require(CLUBS_PATH);
        if (typeof clubs !== 'object' || clubs === null) {
            logError("clubs.js must export an object.");
        } else {
            console.log(`   Found ${Object.keys(clubs).length} defined clubs in dictionary.`);
        }
    } catch (e) {
        logError(`Failed to load clubs.js: ${e.message}`);
    }

    return validLeagueIds;
}

function parseCsv(filePath) {
    return new Promise((resolve, reject) => {
        const rows = [];
        let fileHeaders = [];

        fs.createReadStream(filePath)
            .pipe(csv())
            .on('headers', (headers) => {
                fileHeaders = headers;
            })
            .on('data', (data) => rows.push(data))
            .on('end', () => resolve({ headers: fileHeaders, rows }))
            .on('error', (err) => reject(err));
    });
}

async function validateCleanTeams(validLeagueIds) {
    console.log("🔍 Validating clean_teams.csv integrity...");
    if (!fs.existsSync(CLEAN_TEAMS_PATH)) return;

    try {
        const { headers, rows } = await parseCsv(CLEAN_TEAMS_PATH);
        const requiredHeaders = ['LEAGUE', 'DIVISION', 'TEAM_NAME', 'SCHEDULE_LINK', 'CLUB'];
        
        for (const reqH of requiredHeaders) {
            if (!headers.includes(reqH)) {
                logError(`clean_teams.csv missing header: ${reqH}`);
            }
        }

        if (rows.length === 0) {
            logError("clean_teams.csv contains 0 data rows!");
            return;
        }

        if (rows.length < 50) {
            logWarning(`clean_teams.csv has fewer than 50 teams (${rows.length} found). Scrape may be incomplete.`);
        }

        const seenSignatures = new Set();
        let invalidUrls = 0;
        let emptyFields = 0;
        let unknownLeagues = 0;

        rows.forEach((row, idx) => {
            const lineNum = idx + 2;

            for (const field of requiredHeaders) {
                if (!row[field] || row[field].trim() === '') {
                    emptyFields++;
                    if (emptyFields <= 5) {
                        logError(`Line ${lineNum}: Missing value for '${field}'`);
                    }
                }
            }

            if (row.TEAM_NAME && (row.TEAM_NAME.toLowerCase() === 'undefined' || row.TEAM_NAME.toLowerCase() === 'null')) {
                logError(`Line ${lineNum}: Invalid placeholder team name: "${row.TEAM_NAME}"`);
            }

            if (row.SCHEDULE_LINK && !row.SCHEDULE_LINK.startsWith('http://') && !row.SCHEDULE_LINK.startsWith('https://')) {
                invalidUrls++;
                if (invalidUrls <= 5) {
                    logWarning(`Line ${lineNum}: Schedule link lacks standard HTTP/HTTPS protocol: "${row.SCHEDULE_LINK}"`);
                }
            }

            if (row.LEAGUE && validLeagueIds.size > 0 && !validLeagueIds.has(row.LEAGUE)) {
                unknownLeagues++;
                if (unknownLeagues <= 5) {
                    logWarning(`Line ${lineNum}: League '${row.LEAGUE}' not listed in leagues.js`);
                }
            }

            const signature = `${row.LEAGUE}|${row.DIVISION}|${row.TEAM_NAME}`;
            if (seenSignatures.has(signature)) {
                logWarning(`Line ${lineNum}: Duplicate team entry detected: "${row.TEAM_NAME}" in division "${row.DIVISION}"`);
            } else {
                seenSignatures.add(signature);
            }
        });

        console.log(`   Verified ${rows.length} clean team records.`);
        if (emptyFields > 5) logError(`Total lines with empty fields: ${emptyFields}`);
        if (invalidUrls > 5) logWarning(`Total lines with invalid URLs: ${invalidUrls}`);
        if (unknownLeagues > 5) logWarning(`Total lines with unlisted leagues: ${unknownLeagues}`);

    } catch (e) {
        logError(`Failed to parse clean_teams.csv: ${e.message}`);
    }
}

async function validateScrapedDivisions() {
    console.log("🔍 Validating scraped_divisions.csv...");
    if (!fs.existsSync(SCRAPED_DIVISIONS_PATH)) return;

    try {
        const { headers, rows } = await parseCsv(SCRAPED_DIVISIONS_PATH);
        const requiredHeaders = ['LEAGUE', 'DIVISION_NAME', 'LINK_URL'];

        for (const reqH of requiredHeaders) {
            if (!headers.includes(reqH)) {
                logError(`scraped_divisions.csv missing header: ${reqH}`);
            }
        }

        if (rows.length === 0) {
            logError("scraped_divisions.csv contains 0 data rows!");
        } else {
            console.log(`   Verified ${rows.length} division entries.`);
        }
    } catch (e) {
        logError(`Failed to parse scraped_divisions.csv: ${e.message}`);
    }
}

async function runValidation() {
    console.log("--------------------------------------------------");
    console.log("🧪 Cincinnati Soccer Data Validation Suite");
    console.log("--------------------------------------------------");

    await validateFileExistence();
    const validLeagueIds = validateLeaguesAndClubs();
    await validateScrapedDivisions();
    await validateCleanTeams(validLeagueIds);

    console.log("--------------------------------------------------");
    if (errors.length > 0) {
        console.error(`💥 Validation FAILED with ${errors.length} error(s) and ${warnings.length} warning(s).`);
        process.exit(1);
    } else {
        console.log(`✅ Validation PASSED with 0 errors and ${warnings.length} warning(s).`);
        process.exit(0);
    }
}

runValidation();
