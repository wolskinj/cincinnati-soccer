/**
 * Exposure Events Platform Adapter for Tournaments
 */

function cleanDivisionName(raw) {
    if (!raw) return '';
    return raw
        .replace(/\s*\(\s*\d+\s*\/\s*\d+\s*teams\s*\)/i, '')
        .replace(/\s*\(\s*\d+\s*teams\s*\)/i, '')
        .trim();
}

function isDivisionHeading(text) {
    if (!text) return false;
    const t = text.trim();
    if (/^(MESSAGES|DESCRIPTION|GENERAL INFORMATION|REGISTRATION|LOCATION|CONTACT|SOCIAL|DOCUMENTS|VENUES|SCHEDULE|TEAMS|INFO|ATTACHMENT)/i.test(t)) {
        return false;
    }
    return /\b(GIRLS|BOYS|U\d+|B\d+|G\d+|COED|VARSITY|HIGH SCHOOL)\b/i.test(t) || /\(\s*\d+\s*\/\s*\d+\s*teams\s*\)/i.test(t);
}

async function discoverDivisions(page, tournament) {
    const baseUrl = tournament.url.replace(/\/+$/, '');
    const teamsUrl = baseUrl.endsWith('/teams') ? baseUrl : `${baseUrl}/teams`;

    console.log(`      -> Navigating Exposure portal: ${teamsUrl}`);
    try {
        await page.goto(teamsUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });
    } catch (e) {
        console.log(`      ⚠️ Warning: Initial goto failed (${e.message}), retrying...`);
        await page.goto(teamsUrl, { waitUntil: 'load', timeout: 45000 });
    }

    const divisions = await page.evaluate((tournamentId, currentUrl) => {
        const results = [];
        const seenDivs = new Set();

        const headings = Array.from(document.querySelectorAll('#content h2, #content h3, .container h2, .container h3'));

        headings.forEach(h => {
            const rawText = h.innerText.trim();
            if (!rawText) return;

            // Filter out navigation/announcement headings
            if (/^(MESSAGES|DESCRIPTION|GENERAL INFORMATION|REGISTRATION|LOCATION|CONTACT|SOCIAL|DOCUMENTS|VENUES|SCHEDULE|TEAMS|INFO|ATTACHMENT)/i.test(rawText)) {
                return;
            }

            if (!/\b(GIRLS|BOYS|U\d+|B\d+|G\d+|COED|VARSITY|HIGH SCHOOL)\b/i.test(rawText) && !/\(\s*\d+\s*\/\s*\d+\s*teams\s*\)/i.test(rawText)) {
                return;
            }

            const cleanName = rawText
                .replace(/\s*\(\s*\d+\s*\/\s*\d+\s*teams\s*\)/i, '')
                .replace(/\s*\(\s*\d+\s*teams\s*\)/i, '')
                .trim();

            if (cleanName && !seenDivs.has(cleanName.toLowerCase())) {
                seenDivs.add(cleanName.toLowerCase());
                results.push({
                    tournament: tournamentId,
                    division: cleanName,
                    url: currentUrl,
                    platform: 'Exposure'
                });
            }
        });

        // Fallback: If no h2/h3 headings found, look for registration links with divisionid
        if (results.length === 0) {
            const regLinks = document.querySelectorAll('a[href*="divisionid="]');
            regLinks.forEach(link => {
                const name = link.innerText.trim();
                if (name && !seenDivs.has(name.toLowerCase())) {
                    seenDivs.add(name.toLowerCase());
                    results.push({
                        tournament: tournamentId,
                        division: name,
                        url: currentUrl,
                        platform: 'Exposure'
                    });
                }
            });
        }

        return results;
    }, tournament.id, teamsUrl);

    return divisions;
}

async function extractTeamsFromDivision(page, divisionName, tournamentId) {
    return await page.evaluate((targetDiv, currentTournament) => {
        const uniqueTeams = new Map();
        const headings = Array.from(document.querySelectorAll('#content h2, #content h3, .container h2, .container h3'));

        // Normalize target division name for matching
        const normTarget = targetDiv.toLowerCase().replace(/[^a-z0-9]/g, '');

        let targetContainer = null;
        for (const h of headings) {
            const headingText = h.innerText.trim();
            const cleanHeading = headingText
                .replace(/\s*\(\s*\d+\s*\/\s*\d+\s*teams\s*\)/i, '')
                .replace(/\s*\(\s*\d+\s*teams\s*\)/i, '')
                .trim();
            const normHeading = cleanHeading.toLowerCase().replace(/[^a-z0-9]/g, '');

            if (normHeading === normTarget || normHeading.includes(normTarget) || normTarget.includes(normHeading)) {
                targetContainer = h.parentElement;
                break;
            }
        }

        if (!targetContainer) {
            return [];
        }

        const teamCards = targetContainer.querySelectorAll('.row > div, div[class*="col-"]');

        teamCards.forEach(card => {
            const teamLink = card.querySelector('a');
            if (!teamLink) return;

            let rawTeamName = teamLink.innerText.trim();
            if (!rawTeamName || rawTeamName.toLowerCase().includes('placeholder')) return;

            // Clean multi-line strings
            if (rawTeamName.includes('\n')) {
                rawTeamName = rawTeamName.split('\n')[0].trim();
            }

            const teamUrl = teamLink.href || window.location.href;

            // Extract state from <i> tag (e.g. <i>(OH)</i> -> "OH")
            let state = '';
            const stateEl = card.querySelector('i');
            if (stateEl) {
                state = stateEl.innerText.replace(/[()]/g, '').trim();
            }

            // Extract club name prefix guess
            let clubRaw = '';
            const words = rawTeamName.split(/\s+/);
            if (words.length >= 2 && !/^(U\d+|B\d+|G\d+|20\d\d)/i.test(words[0])) {
                clubRaw = `${words[0]} ${words[1]}`;
            } else if (words.length >= 1) {
                clubRaw = words[0];
            }

            if (!uniqueTeams.has(rawTeamName)) {
                uniqueTeams.set(rawTeamName, {
                    tournament: currentTournament,
                    division: targetDiv,
                    team: rawTeamName,
                    clubRaw: clubRaw,
                    state: state,
                    scheduleLink: teamUrl,
                    platform: 'Exposure'
                });
            }
        });

        return Array.from(uniqueTeams.values());
    }, divisionName, tournamentId);
}

module.exports = {
    discoverDivisions,
    extractTeamsFromDivision
};

