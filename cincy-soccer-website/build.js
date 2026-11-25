const fs = require('fs-extra');
const csv = require('csv-parser');
const ejs = require('ejs');
const path = require('path');

// 1. CONFIGURATION & PATHS
const TEAMS_FILE = path.join(__dirname, '../data/clean_teams.csv');
const TOURNAMENT_TEAMS_FILE = path.join(__dirname, '../data/clean_tournament_teams.csv');
const TEMPLATE_FILE = path.join(__dirname, 'template.ejs');
const HOMEPAGE_TEMPLATE = path.join(__dirname, 'index_template.ejs');
const TEAM_TEMPLATE = path.join(__dirname, 'team_template.ejs');
const TOURNAMENTS_TEMPLATE = path.join(__dirname, 'tournaments_template.ejs');
const TOURNAMENT_TEMPLATE = path.join(__dirname, 'tournament_template.ejs');
const OUTPUT_DIR = path.join(__dirname, 'dist');
const DOMAIN = 'https://cincinnati.soccer';

const d = new Date();
const formattedDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const isoDate = d.toISOString();

const CONFIG = require(path.join(__dirname, '../data/config.js'));
const CURRENT_SEASON = CONFIG.currentSeason;
const LEAGUES_CONFIG = require(path.join(__dirname, '../data/leagues.js'));
const TOURNAMENTS_CONFIG = require(path.join(__dirname, '../data/tournaments.js'));
const CLUBS_CONFIG = require(path.join(__dirname, '../data/clubs.json'));
const { buildClubAliasesMap, getNormalizedTeamKey } = require(path.join(__dirname, '../data/teamCanonicalizer.js'));

let CLUB_MAPPINGS = {};
try {
    CLUB_MAPPINGS = JSON.parse(fs.readFileSync(path.join(__dirname, '../cincy-soccer-scraper/club_mappings.json'), 'utf-8'));
} catch (e) {}
const clubAliasesMap = buildClubAliasesMap(CLUB_MAPPINGS);

// TRACKER FOR SITEMAP
const sitemapUrls = [];

// HELPER: Make clean filenames
function makeFilename(name, prefix = '') {
    if (!name) return 'unknown.html';
    return prefix + name.toLowerCase().replace(/[^a-z0-9]/g, '-') + '.html';
}

function sortAgeGroups(a, b) {
    const isHighA = a.toLowerCase().includes('high');
    const isHighB = b.toLowerCase().includes('high');
    if (isHighA && !isHighB) return 1;
    if (!isHighA && isHighB) return -1;
    if (isHighA && isHighB) return 0;
    const numA = Number.parseInt(a.replace(/\D/g, ''), 10) || 0;
    const numB = Number.parseInt(b.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
}

function normalizeDivision(divisionString) {
    if (!divisionString) return { gender: 'Unknown', age: '', label: 'Unknown' };

    // Format: 'BU9Premier', 'GU10Gold', 'BU1415Black'
    const tcMatch = divisionString.match(/^([BG])(U\d+(?:\/\d+)?)/i);
    if (tcMatch) {
        const gender = tcMatch[1].toUpperCase() === 'B' ? 'Boys' : 'Girls';
        const age = tcMatch[2].toUpperCase();
        return { gender: gender, age: age, label: `${gender} ${age}` };
    }

    const parts = divisionString.split(/\s+/);
    let genderRaw = parts[0] || 'Unknown';
    let ageRaw = parts[1] || '';
    let gender = genderRaw;
    if (genderRaw === 'Male' || genderRaw === 'M' || genderRaw.toLowerCase().startsWith('b')) gender = 'Boys';
    if (genderRaw === 'Female' || genderRaw === 'F' || genderRaw === 'Women' || genderRaw.toLowerCase().startsWith('g')) gender = 'Girls';
    return { gender: gender, age: ageRaw, label: ageRaw ? `${gender} ${ageRaw}` : gender };
}

// === MAIN FACTORY ===
async function buildSite() {
    console.log("🏭 Website Factory (Polished with Tournaments) starting...");
    fs.emptyDirSync(OUTPUT_DIR);

    // 1. COPY STATIC ASSETS
    const assetsDir = path.join(__dirname, 'assets');
    if (fs.existsSync(assetsDir)) {
        fs.copySync(assetsDir, path.join(OUTPUT_DIR, 'assets'));
        console.log("🖼️  Assets copied.");
    }

    // 2. COPY STATIC PAGES
    const notFoundPage = path.join(__dirname, '404.html');
    if (fs.existsSync(notFoundPage)) {
        fs.copyFileSync(notFoundPage, path.join(OUTPUT_DIR, '404.html'));
    }

    const cookiePolicy = path.join(__dirname, 'cookie-policy.html');
    if (fs.existsSync(cookiePolicy)) {
        fs.copyFileSync(cookiePolicy, path.join(OUTPUT_DIR, 'cookie-policy.html'));
    }

    const privacyPolicy = path.join(__dirname, 'privacy-policy.html');
    if (fs.existsSync(privacyPolicy)) {
        fs.copyFileSync(privacyPolicy, path.join(OUTPUT_DIR, 'privacy-policy.html'));
    }

    // 2b. COPY ADS.TXT & MANIFEST & ICONS
    const adsTxt = path.join(__dirname, 'ads.txt');
    if (fs.existsSync(adsTxt)) {
        fs.copyFileSync(adsTxt, path.join(OUTPUT_DIR, 'ads.txt'));
    }

    const manifestFile = path.join(__dirname, 'assets', 'site.webmanifest');
    if (fs.existsSync(manifestFile)) {
        fs.copyFileSync(manifestFile, path.join(OUTPUT_DIR, 'site.webmanifest'));
    }

    const faviconIco = path.join(__dirname, 'assets', 'favicon.ico');
    if (fs.existsSync(faviconIco)) {
        fs.copyFileSync(faviconIco, path.join(OUTPUT_DIR, 'favicon.ico'));
    }

    const faviconPng = path.join(__dirname, 'assets', 'favicon.png');
    if (fs.existsSync(faviconPng)) {
        fs.copyFileSync(faviconPng, path.join(OUTPUT_DIR, 'favicon.png'));
    }

    const appleIcon = path.join(__dirname, 'assets', 'apple-touch-icon.png');
    if (fs.existsSync(appleIcon)) {
        fs.copyFileSync(appleIcon, path.join(OUTPUT_DIR, 'apple-touch-icon.png'));
    }

    // Reset Sitemap (add homepage first)
    sitemapUrls.length = 0;
    sitemapUrls.push(''); // Empty string = homepage

    const ageGroups = {};
    const clubGroups = {};
    const leagueGroups = {};
    const teamGroups = {};

    LEAGUES_CONFIG.forEach(l => {
        leagueGroups[l.id] = { info: l, teams: [] };
    });

    // 3. LOAD TOURNAMENT DATA
    const tournamentDivisionsMap = {};
    const teamTournaments = {};

    TOURNAMENTS_CONFIG.forEach(t => {
        tournamentDivisionsMap[t.id] = [];
    });

    if (fs.existsSync(TOURNAMENT_TEAMS_FILE)) {
        await new Promise(resolve => {
            const rawDivisions = {};
            fs.createReadStream(TOURNAMENT_TEAMS_FILE)
                .pipe(csv())
                .on('data', row => {
                    if (!row.TOURNAMENT || !row.TEAM_NAME) return;

                    const tId = row.TOURNAMENT;
                    const divName = row.DIVISION || 'Open Division';
                    const key = `${tId}|${divName}`;
                    if (!rawDivisions[key]) rawDivisions[key] = [];
                    rawDivisions[key].push(row);

                    // Track team's tournament participation
                    const teamName = row.TEAM_NAME;
                    const normKey = getNormalizedTeamKey(teamName, row.CLUB, clubAliasesMap);
                    const slugKey = makeFilename(teamName);

                    if (!teamTournaments[teamName]) teamTournaments[teamName] = [];
                    if (!teamTournaments[normKey]) teamTournaments[normKey] = [];
                    if (!teamTournaments[slugKey]) teamTournaments[slugKey] = [];
                    
                    const tConfig = TOURNAMENTS_CONFIG.find(t => t.id === tId) || { name: tId };
                    const entry = {
                        id: tId,
                        name: tConfig.name,
                        dates: tConfig.dates,
                        division: divName,
                        scheduleLink: row.SCHEDULE_LINK,
                        platform: row.PLATFORM
                    };

                    teamTournaments[teamName].push(entry);
                    teamTournaments[normKey].push(entry);
                    teamTournaments[slugKey].push(entry);
                })
                .on('end', () => {
                    // Structure into divisionsList per tournament
                    Object.entries(rawDivisions).forEach(([key, teams]) => {
                        const [tId, divName] = key.split('|');
                        if (!tournamentDivisionsMap[tId]) tournamentDivisionsMap[tId] = [];
                        tournamentDivisionsMap[tId].push({
                            name: divName,
                            teams: teams
                        });
                    });

                    // Add team count to TOURNAMENTS_CONFIG objects
                    TOURNAMENTS_CONFIG.forEach(t => {
                        const divs = tournamentDivisionsMap[t.id] || [];
                        const count = divs.reduce((acc, d) => acc + d.teams.length, 0);
                        if (count > 0) {
                            t.teamCount = count;
                        }
                    });

                    resolve();
                });
        });
    }

    // 4. READ MASTER TEAMS DATA
    await new Promise((resolve, reject) => {
        fs.createReadStream(TEAMS_FILE)
            .pipe(csv())
            .on('data', (row) => {
                if (!row.TEAM_NAME) return;

                const teamKey = row.TEAM_NAME;
                if (!teamGroups[teamKey]) teamGroups[teamKey] = [];
                teamGroups[teamKey].push(row);

                if (row.LEAGUE && row.LEAGUE !== 'Tournament Play Only') {
                    const divInfo = normalizeDivision(row.DIVISION);
                    const ageKey = divInfo.label;
                    if (!ageGroups[ageKey]) ageGroups[ageKey] = [];
                    ageGroups[ageKey].push(row);

                    const leagueId = row.LEAGUE;
                    if (leagueGroups[leagueId]) {
                        leagueGroups[leagueId].teams.push(row);
                    }
                }

                const clubKey = row.CLUB;
                if (clubKey && clubKey !== 'Independent') {
                    if (!clubGroups[clubKey]) clubGroups[clubKey] = [];
                    clubGroups[clubKey].push(row);
                }
            })
            .on('error', reject)
            .on('end', resolve);
    });

    console.log("📦 Master team data loaded.");
    await generateTeamPages(teamGroups, teamTournaments);
    await generatePages(ageGroups, 'age');
    await generatePages(clubGroups, 'club');
    await generateLeaguePages(leagueGroups);
    await generateTournamentPages(TOURNAMENTS_CONFIG, tournamentDivisionsMap);
    await generateHomepage(ageGroups, clubGroups, leagueGroups, teamGroups, TOURNAMENTS_CONFIG);

    // 5. GENERATE SEO FILES & HEADERS
    generateSitemap();
    generateRobotsTxt();
    generateHeaders();
    generateRedirects();
    generateWorker();

    // 6. VERIFY METADATA, FAVICONS & SITEMAP ACROSS ALL GENERATED PAGES
    require('./verify_dist_metadata.js');
    require('./validate_sitemap.js');
}

function formatTeamTitle(teamName, clubName, divisionInfo) {
    let clean = (teamName || '').trim();

    // 1. Remove duplicate prefix if teamName repeats clubName
    if (clubName && clubName.length >= 4) {
        const escapedClub = clubName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const pattern = new RegExp(`^${escapedClub}\\s+`, 'i');
        if (pattern.test(clean)) {
            const stripped = clean.replace(pattern, '').trim();
            if (stripped.length >= 5) {
                clean = stripped;
            }
        }
    }

    const MAX_TEAM_TITLE_LEN = 38;

    // 2. Short team names: append division info if it fits
    if (clean.length <= 24 && divisionInfo && divisionInfo.label && divisionInfo.label !== 'Unknown') {
        const candidate = `${clean} (${divisionInfo.label})`;
        if (candidate.length <= MAX_TEAM_TITLE_LEN) {
            return candidate;
        }
    }

    if (clean.length <= MAX_TEAM_TITLE_LEN) {
        return clean;
    }

    // 3. Truncate long team names at word boundary
    let truncated = clean.substring(0, MAX_TEAM_TITLE_LEN - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 12) {
        truncated = truncated.substring(0, lastSpace);
    }
    return `${truncated.trim()}...`;
}

async function generateTeamPages(teamGroups, teamTournaments) {
    for (const [teamName, rows] of Object.entries(teamGroups)) {
        let filename = `team-${makeFilename(teamName)}`;
        
        const firstRow = rows[0] || {};
        const clubName = firstRow.CLUB && firstRow.CLUB !== 'Independent' ? firstRow.CLUB : '';
        const divisionInfo = normalizeDivision(firstRow.DIVISION);
        const leagueName = firstRow.LEAGUE || '';
        
        let pageTitle = formatTeamTitle(teamName, clubName, divisionInfo);

        const nameHash = teamName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const descTemplates = [
            `Follow the ${teamName} youth soccer team${clubName ? ` from ${clubName}` : ''}. View schedules, standings, and tournament game info for their ${firstRow.DIVISION || ''} season in Cincinnati, OH.`,
            `Get the latest schedules and tournament updates for the ${teamName} soccer team. Competing in ${leagueName || 'Cincinnati youth soccer'}${clubName ? ` and representing ${clubName}` : ''} in Greater Cincinnati.`,
            `Official team page for ${teamName}${clubName ? `, a ${clubName} youth squad` : ''}. Explore their ${firstRow.DIVISION || ''} schedule, division standings, and tournament brackets.`
        ];
        let description = descTemplates[nameHash % descTemplates.length];
        
        const canonicalUrl = `${DOMAIN}/${filename}`;
        const normKey = getNormalizedTeamKey(teamName, clubName, clubAliasesMap);
        const slugKey = makeFilename(teamName);
        const rawTourneys = [
            ...((teamTournaments && teamTournaments[teamName]) || []),
            ...((teamTournaments && teamTournaments[normKey]) || []),
            ...((teamTournaments && teamTournaments[slugKey]) || [])
        ];

        const seenTourneys = new Set();
        const teamTourneys = [];
        for (const t of rawTourneys) {
            const key = `${t.id}|${t.division}`;
            if (!seenTourneys.has(key)) {
                seenTourneys.add(key);
                teamTourneys.push(t);
            }
        }

        const templateData = {
            title: pageTitle,
            teamName: teamName, // Pass original teamName for H1
            type: 'team',
            description: description,
            canonicalUrl: canonicalUrl,
            domain: DOMAIN,
            lastUpdated: formattedDate,
            isoDate: isoDate,
            currentSeason: CURRENT_SEASON,
            teamRows: rows,
            tournaments: teamTourneys,
            makeFilename: makeFilename,
            normalizeDivision: normalizeDivision,
            leaguesConfig: LEAGUES_CONFIG
        };

        const pageHtml = await ejs.renderFile(TEAM_TEMPLATE, templateData, { cache: true });
        fs.writeFileSync(`${OUTPUT_DIR}/${filename}`, pageHtml);
        
        sitemapUrls.push(filename);
    }
    console.log(`✅ TEAM pages generated.`);
}

async function generatePages(groups, type) {

    for (const [groupName, teams] of Object.entries(groups)) {
        let filename;
        let description;
        let clubAbout = null;
        let clubWebsite = null;
        let divisionAbout = null;

        if (type === 'age') {
            const parts = groupName.split(' ');
            filename = `${parts[0].toLowerCase()}-${parts[1].toLowerCase().replace(/[^a-z0-9]/g, '-')}.html`;
            description = `View all ${groupName} youth soccer teams, schedules, and standings in the Cincinnati area.`;

            const teamCount = teams.length;
            const isHighSchool = groupName.toLowerCase().includes('high school') || groupName.toLowerCase().includes('u15') || groupName.toLowerCase().includes('u16') || groupName.toLowerCase().includes('u17') || groupName.toLowerCase().includes('u18') || groupName.toLowerCase().includes('u19');

            const nameHash = groupName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

            const leagues = [...new Set(teams.map(t => t.LEAGUE))].filter(l => l && l !== 'Tournament Play Only');
            let leagueStr = '';
            if (leagues.length === 1) {
                const singleLeagueDiv = [
                    ` competing exclusively in the ${leagues[0]}`,
                    ` participating strictly within the ${leagues[0]}`,
                    ` focused primarily on ${leagues[0]} competition`
                ];
                leagueStr = singleLeagueDiv[nameHash % singleLeagueDiv.length];
            } else if (leagues.length > 1) {
                const last = leagues.pop();
                const multiLeagueDiv = [
                    ` spanning multiple development platforms including the ${leagues.join(', ')} and ${last}`,
                    ` playing across varied circuits such as the ${leagues.join(', ')} and ${last}`,
                    ` with representation in both the ${leagues.join(', ')} and ${last}`
                ];
                leagueStr = multiLeagueDiv[nameHash % multiLeagueDiv.length];
            }

            let clubStr = '';
            const clubCounts = {};
            teams.forEach(t => {
                if (t.CLUB && t.CLUB !== 'Independent') {
                    clubCounts[t.CLUB] = (clubCounts[t.CLUB] || 0) + 1;
                }
            });
            const topClubs = Object.entries(clubCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(entry => entry[0]);

            if (topClubs.length > 0) {
                if (topClubs.length === 1) {
                    const oneClubDiv = [
                        `. Led by strong participation from ${topClubs[0]}, `,
                        `. With a major presence from ${topClubs[0]}, `,
                        `. Highlighted by teams from ${topClubs[0]}, `
                    ];
                    clubStr = oneClubDiv[nameHash % oneClubDiv.length];
                } else if (topClubs.length > 1) {
                    const lastClub = topClubs.pop();
                    const multiClubDiv = [
                        `. Featuring major developmental programs like ${topClubs.join(', ')} and ${lastClub}, `,
                        `. Spearheaded by massive clubs such as ${topClubs.join(', ')} and ${lastClub}, `,
                        `. Driven by organizations like ${topClubs.join(', ')} and ${lastClub}, `
                    ];
                    clubStr = multiClubDiv[nameHash % multiClubDiv.length];
                }
            } else {
                clubStr = `. With teams representing communities across the city, `;
            }

            let ageContext = "";
            if (isHighSchool) {
                const hsPhrases = [
                    "representing the peak of local youth competition as players transition towards collegiate exposure and advanced tactics.",
                    "focusing on high-level match play, college recruitment, and preparing for the next level.",
                    "where athletes refine their tactical understanding and showcase their elite talent."
                ];
                ageContext = hsPhrases[nameHash % hsPhrases.length];
            } else if (groupName.toLowerCase().includes('u7') || groupName.toLowerCase().includes('u8') || groupName.toLowerCase().includes('u9') || groupName.toLowerCase().includes('u10')) {
                const youthPhrases = [
                    "focusing on technical foundations, early development, and building a lifelong love for the game.",
                    "where the primary goals are individual skill mastery, confidence on the ball, and fun.",
                    "providing a crucial stepping stone for grassroots players just beginning their competitive journeys."
                ];
                ageContext = youthPhrases[nameHash % youthPhrases.length];
            } else {
                const midPhrases = [
                    "focusing on continued player development, tactical awareness, and competitive match play.",
                    "bridging the gap between foundational skills and advanced, full-sided tactical execution.",
                    "where competitive intensity increases alongside a continued emphasis on individual technical growth."
                ];
                ageContext = midPhrases[nameHash % midPhrases.length];
            }

            const divIntros = [
                `The Greater Cincinnati ${groupName} division is highly active for the current soccer season, featuring ${teamCount} local teams`,
                `This seasonal year, the ${groupName} bracket boasts a robust ${teamCount} active squads throughout Southwest Ohio,`,
                `Representing a highly competitive age group, there are currently ${teamCount} ${groupName} youth teams registered across Cincinnati,`
            ];
            const selectedDivIntro = divIntros[nameHash % divIntros.length];

            const divOuttros = [
                ` Browse the directory below to find ${groupName} rosters, schedules, and club affiliations.`,
                ` Explore the comprehensive list below for all active teams in this bracket.`,
                ` Review local standings and schedule information via the team links provided below.`
            ];
            const selectedDivOuttro = divOuttros[(nameHash + 1) % divOuttros.length];

            divisionAbout = `${selectedDivIntro}${leagueStr}${clubStr}these squads showcase the area's premier youth talent ${ageContext}${selectedDivOuttro}`;

        } else {
            filename = `club-${makeFilename(groupName)}`;
            description = `Complete team directory and schedules for ${groupName} in Cincinnati, including league affiliations and tournaments.`;

            const lowerGroup = groupName.toLowerCase();
            const clubConfig = CLUBS_CONFIG.find(c => c.name.toLowerCase() === lowerGroup);

            if (clubConfig) {
                if (clubConfig.about) clubAbout = clubConfig.about;
                if (clubConfig.website && (clubConfig.confirmed === true || clubConfig.confirmed === undefined)) {
                    clubWebsite = clubConfig.website;
                }
            }

            if (!clubAbout) {
                const teamCount = teams.length;
                const leagues = [...new Set(teams.map(t => t.LEAGUE))].filter(l => l && l !== 'Tournament Play Only');

                const intros = [
                    `${groupName} is an active youth soccer organization in the Greater Cincinnati area.`,
                    `Operating within the Cincinnati region, ${groupName} fields several competitive youth soccer rosters.`,
                    `As a local soccer club, ${groupName} provides a platform for player development in Southwestern Ohio.`,
                    `Representing the Greater Cincinnati soccer community, ${groupName} continues to develop young talent.`
                ];

                const seasonContexts = [
                    `For the current season, they are fielding ${teamCount} competitive team${teamCount !== 1 ? 's' : ''}`,
                    `Currently, the program manages ${teamCount} active roster${teamCount !== 1 ? 's' : ''}`,
                    `This seasonal year, they have committed ${teamCount} squad${teamCount !== 1 ? 's' : ''} to local competition`,
                    `With ${teamCount} team${teamCount !== 1 ? 's' : ''} playing this season, they offer robust opportunities for youth athletes`
                ];

                const seedIndex = groupName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

                let leagueStr = '';
                if (leagues.length === 1) {
                    const singleLeaguePhrases = [
                        ` exclusively in the ${leagues[0]}.`,
                        `, focusing their competitive efforts in the ${leagues[0]}.`,
                        `, testing their skills entirely within the ${leagues[0]}.`
                    ];
                    leagueStr = singleLeaguePhrases[seedIndex % singleLeaguePhrases.length];
                } else if (leagues.length > 1) {
                    const last = leagues.pop();
                    const multiLeaguePhrases = [
                        ` across regional leagues including ${leagues.join(', ')} and ${last}.`,
                        `, participating in various platforms such as ${leagues.join(', ')} and ${last}.`,
                        `, with teams competing in both the ${leagues.join(', ')} and ${last}.`
                    ];
                    leagueStr = multiLeaguePhrases[seedIndex % multiLeaguePhrases.length];
                }

                const outtros = [
                    `Review their team directory below to track their progress this seasonal year.`,
                    `Explore the club's schedules and standings across their various age groups below.`,
                    `Check out the directory provided below to follow their teams throughout the season.`,
                    `See the comprehensive list below for their full roster of participating teams.`
                ];

                const selectedIntro = intros[seedIndex % intros.length];
                const selectedSeason = seasonContexts[(seedIndex + 1) % seasonContexts.length];
                const selectedOuttro = outtros[(seedIndex + 2) % outtros.length];

                clubAbout = `${selectedIntro} ${selectedSeason}${leagueStr} ${selectedOuttro}`;
            }
        }

        const canonicalUrl = `${DOMAIN}/${filename}`;

        const templateData = {
            title: groupName,
            type: type,
            description: description,
            canonicalUrl: canonicalUrl,
            domain: DOMAIN,
            lastUpdated: formattedDate,
            isoDate: isoDate,
            currentSeason: CURRENT_SEASON,
            teams: teams,
            seasonInfo: null,
            seasonLink: null,
            leagueWebsite: null,
            leagueAbout: null,
            clubAbout: clubAbout,
            clubWebsite: clubWebsite,
            divisionAbout: divisionAbout,
            makeFilename: makeFilename,
            normalizeDivision: normalizeDivision
        };

        const pageHtml = await ejs.renderFile(TEMPLATE_FILE, templateData, { cache: true });
        fs.writeFileSync(`${OUTPUT_DIR}/${filename}`, pageHtml);
        
        sitemapUrls.push(filename);
    }
    console.log(`✅ ${type.toUpperCase()} pages generated.`);
}

async function generateLeaguePages(leagueGroups) {
    for (const [leagueId, data] of Object.entries(leagueGroups)) {
        const leagueName = data.info.name;
        const season = data.info.season || '';
        const seasonLink = data.info.url;
        const websiteLink = data.info.website;
        const aboutText = data.info.about;
        const teams = data.teams;
        const filename = `league-${makeFilename(leagueId)}`;

        const description = `${season} schedules and team list for ${leagueName}. Found ${teams.length} local teams.`;
        const canonicalUrl = `${DOMAIN}/${filename}`;

        const templateData = {
            title: leagueName,
            type: 'league',
            description: description,
            canonicalUrl: canonicalUrl,
            domain: DOMAIN,
            lastUpdated: formattedDate,
            isoDate: isoDate,
            currentSeason: CURRENT_SEASON,
            teams: teams,
            seasonName: season,
            seasonDetails: `Listing includes ${teams.length} teams found in our latest scan.`,
            seasonInfo: `${season} Listing includes ${teams.length} teams found in our latest scan.`,
            seasonLink: seasonLink,
            leagueWebsite: websiteLink,
            leagueAbout: aboutText,
            clubAbout: null,
            divisionAbout: null,
            makeFilename: makeFilename,
            normalizeDivision: normalizeDivision
        };

        const pageHtml = await ejs.renderFile(TEMPLATE_FILE, templateData, { cache: true });
        fs.writeFileSync(`${OUTPUT_DIR}/${filename}`, pageHtml);
        
        sitemapUrls.push(filename);
    }
    console.log("✅ LEAGUE pages generated.");
}

function formatTournamentTitle(tournament) {
    const rawName = (tournament.name || '').trim();
    const withSchedules = `${rawName} Schedules`;
    const MAX_PAGE_TITLE_LEN = 38; // 38 + 20 (BRAND) <= 58 chars

    if (withSchedules.length <= MAX_PAGE_TITLE_LEN) {
        return withSchedules;
    }
    if (rawName.length <= MAX_PAGE_TITLE_LEN) {
        return rawName;
    }

    let truncated = rawName.substring(0, MAX_PAGE_TITLE_LEN - 3);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 12) {
        truncated = truncated.substring(0, lastSpace);
    }
    return `${truncated.trim()}...`;
}

async function generateTournamentPages(tournamentsData, tournamentDivisionsMap) {
    // 1. Generate Hub Page (/tournaments.html)
    const hubFilename = 'tournaments.html';
    const hubCanonicalUrl = `${DOMAIN}/${hubFilename}`;
    const hubHtml = await ejs.renderFile(TOURNAMENTS_TEMPLATE, {
        title: "Cincinnati Youth Soccer Tournaments",
        description: "Browse competitive youth soccer tournaments across Greater Cincinnati. Explore division flights, participating local teams, and official schedule links.",
        canonicalUrl: hubCanonicalUrl,
        type: 'tournaments',
        ogImage: `${DOMAIN}/assets/hub-tournaments.jpg`,
        ogImageAlt: "Cincinnati Youth Soccer Tournaments Hub",
        domain: DOMAIN,
        lastUpdated: formattedDate,
        isoDate: isoDate,
        currentSeason: CURRENT_SEASON,
        tournamentsData: tournamentsData,
        makeFilename: makeFilename
    }, { cache: true });
    fs.writeFileSync(`${OUTPUT_DIR}/${hubFilename}`, hubHtml);
    sitemapUrls.push(hubFilename);

    // 2. Generate Individual Tournament Event Pages (/tournament-[id].html)
    for (const t of tournamentsData) {
        const filename = `tournament-${t.id}.html`;
        const canonicalUrl = `${DOMAIN}/${filename}`;
        const divisionsList = tournamentDivisionsMap[t.id] || [];
        const pageTitle = formatTournamentTitle(t);
        const hostStr = t.hostClub ? `Hosted by ${t.hostClub}. ` : '';
        const description = `Schedules, participating teams, and division brackets for ${t.name} (${t.dates}) in Greater Cincinnati. ${hostStr}Track local team flights on cincinnati.soccer.`;

        const pageHtml = await ejs.renderFile(TOURNAMENT_TEMPLATE, {
            title: pageTitle,
            description: description,
            canonicalUrl: canonicalUrl,
            type: 'tournament',
            ogImage: `${DOMAIN}/assets/hub-tournaments.jpg`,
            ogImageAlt: `${t.name} - Cincinnati Youth Soccer Tournament`,
            domain: DOMAIN,
            lastUpdated: formattedDate,
            isoDate: isoDate,
            currentSeason: CURRENT_SEASON,
            tournament: t,
            divisionsList: divisionsList,
            makeFilename: makeFilename,
            normalizeDivision: normalizeDivision
        }, { cache: true });

        fs.writeFileSync(`${OUTPUT_DIR}/${filename}`, pageHtml);
        sitemapUrls.push(filename);
    }

    console.log("✅ TOURNAMENT pages generated.");
}

async function generateHomepage(ageGroups, clubGroups, leagueGroups, teamGroups, tournamentsData) {
    console.log("🏠 Building Dashboard Homepage...");
    const homeTemplatePath = HOMEPAGE_TEMPLATE;

    // AGE Links
    const keys = Object.keys(ageGroups);
    const boysGroups = keys.filter(k => k.includes('Boys')).sort(sortAgeGroups);
    const girlsGroups = keys.filter(k => k.includes('Girls')).sort(sortAgeGroups);

    // CLUB Links
    const clubsGroups = Object.keys(clubGroups).sort((a, b) => a.localeCompare(b));

    // LEAGUE Links
    const leaguesData = Object.values(leagueGroups);

    // TEAM Links
    const teams = Object.keys(teamGroups).sort((a, b) => a.localeCompare(b));

    const finalHtml = await ejs.renderFile(homeTemplatePath, {
        title: "Cincinnati Youth Soccer Directory",
        description: "The centralized directory for Cincinnati youth soccer schedules, standings, and tournaments. Track CPL, BPYSL, OSSL, and youth tournament teams in one place.",
        canonicalUrl: `${DOMAIN}/`,
        type: "website",
        boysGroups: boysGroups,
        girlsGroups: girlsGroups,
        clubsGroups: clubsGroups,
        leaguesData: leaguesData,
        tournamentsData: tournamentsData,
        teams: teams,
        makeFilename: makeFilename,
        lastUpdated: formattedDate,
        isoDate: isoDate,
        currentSeason: CURRENT_SEASON,
        domain: DOMAIN
    }, { cache: true });

    fs.writeFileSync(`${OUTPUT_DIR}/index.html`, finalHtml);
    console.log("✅ Homepage updated!");

    // === GENERATE DIRECTORY PAGES & SEARCH INDEX ===
    try {
        const clubsPath = path.join(__dirname, 'clubs_template.ejs');
        const clubsHtml = await ejs.renderFile(clubsPath, { 
            title: "Cincinnati Soccer Clubs",
            description: "Explore all youth soccer clubs in the Greater Cincinnati area, including team counts and league affiliations.",
            canonicalUrl: `${DOMAIN}/clubs.html`,
            type: "clubs",
            clubsGroups, makeFilename, lastUpdated: formattedDate, isoDate, domain: DOMAIN 
        }, { cache: true });
        fs.writeFileSync(`${OUTPUT_DIR}/clubs.html`, clubsHtml);

        const agesPath = path.join(__dirname, 'ages_template.ejs');
        const agesHtml = await ejs.renderFile(agesPath, { 
            title: "Cincinnati Soccer Divisions",
            description: "Browse youth soccer divisions by age group and gender across Cincinnati.",
            canonicalUrl: `${DOMAIN}/ages.html`,
            type: "ages",
            boysGroups, girlsGroups, makeFilename, lastUpdated: formattedDate, isoDate, domain: DOMAIN 
        }, { cache: true });
        fs.writeFileSync(`${OUTPUT_DIR}/ages.html`, agesHtml);

        const leaguesPath = path.join(__dirname, 'leagues_template.ejs');
        const leaguesHtml = await ejs.renderFile(leaguesPath, { 
            title: "Cincinnati Soccer Leagues",
            description: "Discover local and regional youth soccer leagues operating in Greater Cincinnati, including CPL, BPYSL, OSSL, and CvC.",
            canonicalUrl: `${DOMAIN}/leagues.html`,
            type: "leagues",
            leaguesData, makeFilename, lastUpdated: formattedDate, isoDate, domain: DOMAIN 
        }, { cache: true });
        fs.writeFileSync(`${OUTPUT_DIR}/leagues.html`, leaguesHtml);

        console.log("✅ Directory Pages updated!");

        // Build Search Index JSON
        let searchIndex = [];
        
        // Add Clubs
        clubsGroups.forEach(c => searchIndex.push({name: c, type: 'club', url: `/club-${makeFilename(c)}`}));
        
        // Add Leagues
        leaguesData.forEach(l => searchIndex.push({name: l.info.name, type: 'league', url: `/league-${makeFilename(l.info.id)}`}));

        // Add Tournaments
        tournamentsData.forEach(t => searchIndex.push({name: t.name, type: 'tournament', url: `/tournament-${t.id}.html`}));
        
        // Add Divisions
        [...boysGroups, ...girlsGroups].forEach(g => {
            const parts = g.split(' ');
            const p0 = parts[0].toLowerCase();
            const p1 = parts[1].toLowerCase().replace(/[^a-z0-9]/g, '-'); 
            searchIndex.push({name: g, type: 'division', url: `/${p0}-${p1}.html`});
        });
        
        // Add Teams
        Object.entries(teamGroups).forEach(([teamName, rows]) => {
            const clubName = rows[0] && rows[0].CLUB ? rows[0].CLUB : '';
            searchIndex.push({name: teamName, type: 'team', url: `/team-${makeFilename(teamName)}`, club: clubName});
        });

        fs.writeFileSync(`${OUTPUT_DIR}/search-index.json`, JSON.stringify(searchIndex));
        
        console.log(`✅ Search index created with ${searchIndex.length} entries.`);
    } catch (e) {
        console.warn("⚠️ Skipping directory/search index generation (error).", e.message);
    }
}

function getPriorityAndFreq(url) {
    if (url === '' || url === 'index.html') return { priority: '1.0', freq: 'daily' };
    if (['clubs.html', 'ages.html', 'leagues.html', 'tournaments.html'].includes(url)) return { priority: '0.9', freq: 'daily' };
    if (url.startsWith('club-') || url.startsWith('league-') || url.startsWith('tournament-')) return { priority: '0.8', freq: 'weekly' };
    if (url.startsWith('boys-') || url.startsWith('girls-')) return { priority: '0.7', freq: 'weekly' };
    return { priority: '0.6', freq: 'weekly' };
}

// === SITEMAP GENERATOR ===
function generateSitemap() {
    console.log("🗺️ Generating Sitemap...");

    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    // Ensure core pages are included
    const corePages = ['', 'clubs.html', 'ages.html', 'leagues.html', 'tournaments.html'];
    corePages.reverse().forEach(p => {
        if (!sitemapUrls.includes(p)) {
            sitemapUrls.unshift(p);
        }
    });

    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(url => {
    const loc = url ? `${DOMAIN}/${url}` : `${DOMAIN}/`;
    const { priority, freq } = getPriorityAndFreq(url);
    return `    <url>
        <loc>${loc}</loc>
        <lastmod>${today}</lastmod>
        <changefreq>${freq}</changefreq>
        <priority>${priority}</priority>
    </url>`;
}).join('\n')}
</urlset>`;

    fs.writeFileSync(`${OUTPUT_DIR}/sitemap.xml`, xmlContent);
    console.log(`✅ Sitemap created with ${sitemapUrls.length} links (Date: ${today}).`);
}

// === ROBOTS.TXT GENERATOR ===
function generateRobotsTxt() {
    console.log("🤖 Generating Robots.txt...");
    const content = `User-agent: *
Allow: /
Disallow: /cookie-policy.html
Disallow: /privacy-policy.html

Sitemap: ${DOMAIN}/sitemap.xml
`;
    fs.writeFileSync(`${OUTPUT_DIR}/robots.txt`, content);
    console.log("✅ Robots.txt created.");
}

// === CLOUDFLARE HEADERS GENERATOR ===
function generateHeaders() {
    console.log("🛡️ Generating Cloudflare _headers...");
    const csp = `default-src 'self'; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://static.cloudflareinsights.com https://fundingchoicesmessages.google.com https://*.adtrafficquality.google; connect-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://stats.g.doubleclick.net https://cloudflareinsights.com https://fundingchoicesmessages.google.com https://*.adtrafficquality.google; frame-src 'self' https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://fundingchoicesmessages.google.com https://*.adtrafficquality.google; img-src 'self' data: https://images.unsplash.com https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://mirrors.creativecommons.org https://*.adtrafficquality.google; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';`;

    const content = `/*
  Content-Security-Policy: ${csp}
  X-Frame-Options: SAMEORIGIN
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Cross-Origin-Opener-Policy: same-origin-allow-popups

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
    fs.writeFileSync(`${OUTPUT_DIR}/_headers`, content);
    console.log("✅ _headers created.");
}

// === CLOUDFLARE REDIRECTS GENERATOR ===
function generateRedirects() {
    console.log("🔀 Generating Cloudflare _redirects...");
    const content = `https://cincinnati-soccer.pages.dev/* https://cincinnati.soccer/:splat 301
http://cincinnati-soccer.pages.dev/* https://cincinnati.soccer/:splat 301
http://cincinnati.soccer/* https://cincinnati.soccer/:splat 301
http://www.cincinnati.soccer/* https://cincinnati.soccer/:splat 301
https://www.cincinnati.soccer/* https://cincinnati.soccer/:splat 301
`;
    fs.writeFileSync(`${OUTPUT_DIR}/_redirects`, content);
    console.log("✅ _redirects created (301 Permanent Redirects to https://cincinnati.soccer).");
}

// === CLOUDFLARE PAGES EDGE WORKER GENERATOR ===
function generateWorker() {
    console.log("⚡ Generating Cloudflare Pages _worker.js Edge Redirect...");
    const content = `export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.hostname === 'cincinnati-soccer.pages.dev' || url.hostname === 'www.cincinnati.soccer') {
            url.hostname = 'cincinnati.soccer';
            url.protocol = 'https:';
            return Response.redirect(url.toString(), 301);
        }
        return env.ASSETS.fetch(request);
    }
};
`;
    fs.writeFileSync(`${OUTPUT_DIR}/_worker.js`, content);
    console.log("✅ _worker.js created (Cloudflare Edge Worker 301 Redirect for pages.dev & www).");
}

buildSite().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});