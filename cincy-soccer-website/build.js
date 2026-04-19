const fs = require('fs-extra');
const csv = require('csv-parser');
const ejs = require('ejs');
const path = require('path');

// 1. CONFIGURATION & PATHS
const TEAMS_FILE = path.join(__dirname, '../data/clean_teams.csv');
const TEMPLATE_FILE = path.join(__dirname, 'template.ejs');
const HOMEPAGE_TEMPLATE = path.join(__dirname, 'index_template.ejs');
const TEAM_TEMPLATE = path.join(__dirname, 'team_template.ejs');
const OUTPUT_DIR = path.join(__dirname, 'dist');
const DOMAIN = 'https://cincinnati.soccer';

const d = new Date();
const formattedDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const isoDate = d.toISOString();

const LEAGUES_CONFIG = require(path.join(__dirname, '../data/leagues.js'));
const CLUBS_CONFIG = require(path.join(__dirname, '../data/clubs.js'));

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
    const numA = parseInt(a.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.replace(/\D/g, '')) || 0;
    return numA - numB;
}

function normalizeDivision(divisionString) {
    if (!divisionString) return { gender: 'Unknown', age: '', label: 'Unknown' };
    const parts = divisionString.split(' ');
    let genderRaw = parts[0];
    let ageRaw = parts[1];
    let gender = genderRaw;
    if (genderRaw === 'Male' || genderRaw === 'M') gender = 'Boys';
    if (genderRaw === 'Female' || genderRaw === 'F' || genderRaw === 'Women') gender = 'Girls';
    return { gender: gender, age: ageRaw, label: `${gender} ${ageRaw}` };
}

// === MAIN FACTORY ===
async function buildSite() {
    console.log("🏭 Website Factory (Polished) starting...");
    fs.ensureDirSync(OUTPUT_DIR);

    // 1. COPY STATIC ASSETS
    const assetsDir = path.join(__dirname, 'assets');
    if (fs.existsSync(assetsDir)) {
        fs.copySync(assetsDir, path.join(OUTPUT_DIR, 'assets'));
        console.log("🖼️  Assets copied.");
    }

    // 2. COPY 404 PAGE
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

    // 2b. COPY ADS.TXT
    const adsTxt = path.join(__dirname, 'ads.txt');
    if (fs.existsSync(adsTxt)) {
        fs.copyFileSync(adsTxt, path.join(OUTPUT_DIR, 'ads.txt'));
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

    // 3. READ DATA
    fs.createReadStream(TEAMS_FILE)
        .pipe(csv())
        .on('data', (row) => {
            if (!row.TEAM_NAME) return;

            const teamKey = row.TEAM_NAME;
            if (!teamGroups[teamKey]) teamGroups[teamKey] = [];
            teamGroups[teamKey].push(row);

            const divInfo = normalizeDivision(row.DIVISION);
            const ageKey = divInfo.label;
            if (!ageGroups[ageKey]) ageGroups[ageKey] = [];
            ageGroups[ageKey].push(row);

            const clubKey = row.CLUB;
            if (clubKey && clubKey !== 'Independent') {
                if (!clubGroups[clubKey]) clubGroups[clubKey] = [];
                clubGroups[clubKey].push(row);
            }

            const leagueId = row.LEAGUE;
            if (leagueGroups[leagueId]) {
                leagueGroups[leagueId].teams.push(row);
            }
        })
        .on('end', () => {
            console.log("📦 Data loaded.");
            generateTeamPages(teamGroups);
            generatePages(ageGroups, 'age');
            generatePages(clubGroups, 'club');
            generateLeaguePages(leagueGroups);
            generateHomepage(ageGroups, clubGroups, leagueGroups, teamGroups);

            // 4. GENERATE SEO FILES & HEADERS
            generateSitemap();
            generateRobotsTxt();
            generateHeaders();
        });
}

function generateTeamPages(teamGroups) {
    let template = fs.readFileSync(TEAM_TEMPLATE, 'utf8');

    for (const [teamName, rows] of Object.entries(teamGroups)) {
        let filename = `team-${makeFilename(teamName)}`;
        let description = `View schedule, league, and division information for ${teamName}.`;
        
        const canonicalUrl = `${DOMAIN}/${filename}`;

        const pageHtml = ejs.render(template, {
            title: teamName,
            type: 'team',
            description: description,
            canonicalUrl: canonicalUrl,
            domain: DOMAIN,
            lastUpdated: formattedDate,
            isoDate: isoDate,
            teamRows: rows,
            makeFilename: makeFilename,
            normalizeDivision: normalizeDivision,
            leaguesConfig: LEAGUES_CONFIG
        });

        fs.writeFileSync(`${OUTPUT_DIR}/${filename}`, pageHtml);
        sitemapUrls.push(filename);
    }
    console.log(`✅ TEAM pages generated.`);
}

function generatePages(groups, type) {
    let template = fs.readFileSync(TEMPLATE_FILE, 'utf8');

    for (const [groupName, teams] of Object.entries(groups)) {
        let filename;
        let description;
        let clubAbout = null;
        let divisionAbout = null;

        if (type === 'age') {
            const parts = groupName.split(' ');
            filename = `${parts[0].toLowerCase()}-${parts[1].toLowerCase().replace(/[^a-z0-9]/g, '-')}.html`;
            description = `View all ${groupName} youth soccer teams, schedules, and standings in the Cincinnati area.`;

            // Generate Division Mad Libs
            const teamCount = teams.length;
            const isHighSchool = groupName.toLowerCase().includes('high school') || groupName.toLowerCase().includes('u15') || groupName.toLowerCase().includes('u16') || groupName.toLowerCase().includes('u17') || groupName.toLowerCase().includes('u18') || groupName.toLowerCase().includes('u19');

            // --- RANDOMIZED PHRASE BANKS FOR DIVISIONS ---
            const nameHash = groupName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

            const leagues = [...new Set(teams.map(t => t.LEAGUE))].filter(Boolean);
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

            // Age Context
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
            description = `Complete team directory and schedules for ${groupName} in Cincinnati, including CPL and BPYSL affiliations.`;

            const lowerGroup = groupName.toLowerCase();
            const clubConfig = CLUBS_CONFIG.find(c => c.name.toLowerCase() === lowerGroup || (c.aliases && c.aliases.includes(lowerGroup)));

            if (clubConfig && clubConfig.about) {
                clubAbout = clubConfig.about;
            } else {
                const teamCount = teams.length;
                const leagues = [...new Set(teams.map(t => t.LEAGUE))].filter(Boolean);

                // --- RANDOMIZED PHRASE BANKS FOR CLUBS ---
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

                // Seed the random choice based on the groupName hash so it stays consistent per-build
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

        const pageHtml = ejs.render(template, {
            title: groupName,
            type: type,
            description: description,
            canonicalUrl: canonicalUrl,
            domain: DOMAIN,
            lastUpdated: formattedDate,
            isoDate: isoDate,
            teams: teams,
            seasonInfo: null, // Only used for leagues
            seasonLink: null, // Only used for leagues
            leagueWebsite: null,
            leagueAbout: null,
            clubAbout: clubAbout,
            divisionAbout: divisionAbout,
            makeFilename: makeFilename,
            normalizeDivision: normalizeDivision
        });

        fs.writeFileSync(`${OUTPUT_DIR}/${filename}`, pageHtml);
        sitemapUrls.push(filename);
    }
    console.log(`✅ ${type.toUpperCase()} pages generated.`);
}

function generateLeaguePages(leagueGroups) {
    let template = fs.readFileSync(TEMPLATE_FILE, 'utf8');

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

        const pageHtml = ejs.render(template, {
            title: leagueName,
            type: 'league',
            description: description,
            canonicalUrl: canonicalUrl,
            domain: DOMAIN,
            lastUpdated: formattedDate,
            isoDate: isoDate,
            teams: teams,
            seasonInfo: `${season} Listing includes ${teams.length} teams found in our latest scan.`,
            seasonLink: seasonLink,
            leagueWebsite: websiteLink,
            leagueAbout: aboutText,
            clubAbout: null,
            divisionAbout: null,
            makeFilename: makeFilename,
            normalizeDivision: normalizeDivision
        });

        fs.writeFileSync(`${OUTPUT_DIR}/${filename}`, pageHtml);
        sitemapUrls.push(filename);
    }
    console.log("✅ LEAGUE pages generated.");
}

function generateHomepage(ageGroups, clubGroups, leagueGroups, teamGroups) {
    console.log("🏠 Building Dashboard Homepage...");
    let homeTemplate = fs.readFileSync(HOMEPAGE_TEMPLATE, 'utf8');

    // AGE Links
    const keys = Object.keys(ageGroups);
    const boysGroups = keys.filter(k => k.includes('Boys')).sort(sortAgeGroups);
    const girlsGroups = keys.filter(k => k.includes('Girls')).sort(sortAgeGroups);

    // CLUB Links
    const clubsGroups = Object.keys(clubGroups).sort();

    // LEAGUE Links (Pass the actual data)
    const leaguesData = Object.values(leagueGroups);

    // TEAM Links
    const teams = Object.keys(teamGroups).sort();

    const finalHtml = ejs.render(homeTemplate, {
        boysGroups: boysGroups,
        girlsGroups: girlsGroups,
        clubsGroups: clubsGroups,
        leaguesData: leaguesData,
        teams: teams,
        makeFilename: makeFilename,
        lastUpdated: formattedDate,
        isoDate: isoDate,
        domain: DOMAIN
    });

    fs.writeFileSync(`${OUTPUT_DIR}/index.html`, finalHtml);
    console.log("✅ Homepage updated!");
}

// === SITEMAP GENERATOR ===
function generateSitemap() {
    console.log("🗺️ Generating Sitemap...");

    // OLD WAY (UTC/London Time):
    // const today = new Date().toISOString().split('T')[0];

    // NEW WAY (Local System Time):
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(d.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map(url => `
    <url>
        <loc>${DOMAIN}/${url}</loc>
        <lastmod>${today}</lastmod>
        <changefreq>weekly</changefreq>
    </url>
`).join('')}
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
    // A strict CSP optimized for a static site with Google AdSense
    const csp = `default-src 'self'; script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com https://static.cloudflareinsights.com https://fundingchoicesmessages.google.com https://*.adtrafficquality.google; connect-src 'self' https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://stats.g.doubleclick.net https://cloudflareinsights.com https://fundingchoicesmessages.google.com https://*.adtrafficquality.google; frame-src 'self' https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://fundingchoicesmessages.google.com https://*.adtrafficquality.google; img-src 'self' data: https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://www.google.com https://mirrors.creativecommons.org https://*.adtrafficquality.google; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; require-trusted-types-for 'script';`;

    // Cloudflare Edge Headers Definition
    const content = `/*
  Content-Security-Policy: ${csp}
  X-Frame-Options: SAMEORIGIN
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Cross-Origin-Opener-Policy: same-origin-allow-popups
`;
    fs.writeFileSync(`${OUTPUT_DIR}/_headers`, content);
    console.log("✅ _headers created.");
}

buildSite();