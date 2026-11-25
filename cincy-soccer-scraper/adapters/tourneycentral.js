/**
 * TourneyCentral Platform Adapter for Tournaments
 */
const https = require('https');

function fetchHttps(url) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:') {
            parsed.protocol = 'https:';
        } else if (parsed.protocol !== 'https:') {
            reject(new Error(`Unsupported protocol: ${parsed.protocol}`));
            return;
        }
        https.get(parsed, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

async function discoverDivisions(page, tournament) {
    const origin = new URL(tournament.website || tournament.url).origin;
    const divisions = [];

    try {
        // Try fetching team_file.txt which contains all division codes
        const txtUrl = `${origin}/fmt/team_file.txt`;
        const txtContent = await fetchHttps(txtUrl);
        
        const optionMatches = [...txtContent.matchAll(/<option\s+value="([^"]+)">([^<]+)<\/option>/gi)];
        
        if (optionMatches.length > 0) {
            optionMatches.forEach(m => {
                const code = m[1].trim();
                const label = m[2].trim();
                if (code) {
                    divisions.push({
                        tournament: tournament.id,
                        division: label || code,
                        url: `${origin}/cgi-bin/teams.cgi?fnc=adiv&t_div=${encodeURIComponent(code)}`,
                        platform: 'TourneyCentral'
                    });
                }
            });
            return divisions;
        }
    } catch (e) {
        console.log(`   ⚠️ TourneyCentral txt fetch error: ${e.message}`);
    }

    // Fallback: evaluate DOM links
    return await page.evaluate((tournamentId, siteOrigin) => {
        const results = [];
        const select = document.querySelector('select[name="t_div"]');
        if (select) {
            Array.from(select.options).forEach(opt => {
                if (opt.value) {
                    results.push({
                        tournament: tournamentId,
                        division: opt.text || opt.value,
                        url: `${siteOrigin}/cgi-bin/teams.cgi?fnc=adiv&t_div=${encodeURIComponent(opt.value)}`,
                        platform: 'TourneyCentral'
                    });
                }
            });
        }
        return results;
    }, tournament.id, origin);
}

async function extractTeamsFromDivision(page, divisionName, tournamentId) {
    return await page.evaluate((currentDiv, currentTournament) => {
        const uniqueTeams = new Map();
        const rows = document.querySelectorAll('tr[bgcolor]');

        rows.forEach(row => {
            const cells = row.querySelectorAll('td.body');
            if (cells.length >= 2) {
                const teamCell = cells[1];
                const boldEl = teamCell.querySelector('b');
                const italicEl = teamCell.querySelector('i');

                let teamName = boldEl ? boldEl.innerText.trim() : '';
                let clubName = italicEl ? italicEl.innerText.trim() : '';
                let locationText = teamCell.innerText.replace(teamName, '').replace(clubName, '').trim();

                // If no bold element, attempt regex on cell text
                if (!teamName) {
                    const lines = teamCell.innerText.split('\n').map(l => l.trim()).filter(Boolean);
                    if (lines.length >= 1) teamName = lines[0];
                    if (lines.length >= 2) clubName = lines[1];
                }

                if (teamName && !uniqueTeams.has(teamName) && !teamName.toLowerCase().includes('team/location')) {
                    uniqueTeams.set(teamName, {
                        tournament: currentTournament,
                        division: currentDiv,
                        team: teamName,
                        clubRaw: clubName,
                        state: locationText.includes('OH') ? 'OH' : (locationText.includes('KY') ? 'KY' : (locationText.includes('IN') ? 'IN' : '')),
                        scheduleLink: window.location.href,
                        platform: 'TourneyCentral'
                    });
                }
            }
        });

        return Array.from(uniqueTeams.values());
    }, divisionName, tournamentId);
}

module.exports = {
    discoverDivisions,
    extractTeamsFromDivision
};
