/**
 * Exposure Events Platform Adapter for Tournaments
 */

async function discoverDivisions(page, tournament) {
    return await page.evaluate((tournamentId) => {
        const results = [];
        // Look for division links or bracket links
        const divisionLinks = document.querySelectorAll('a[href*="/divisions/"], a[href*="/division/"], a[href*="/brackets/"], a[href*="/teams/"]');
        
        divisionLinks.forEach(link => {
            const name = link.innerText.trim();
            const url = link.href;
            if (name && url && !results.some(r => r.url === url)) {
                results.push({
                    tournament: tournamentId,
                    division: name,
                    url: url,
                    platform: 'Exposure'
                });
            }
        });

        // Fallback: Check if the landing page already lists divisions and teams directly
        if (results.length === 0) {
            const headings = document.querySelectorAll('h3, h4, .division-header, .bracket-header');
            headings.forEach(h => {
                const name = h.innerText.trim();
                if (name && name.length > 2) {
                    results.push({
                        tournament: tournamentId,
                        division: name,
                        url: page.url(),
                        platform: 'Exposure'
                    });
                }
            });
        }

        return results;
    }, tournament.id);
}

async function extractTeamsFromDivision(page, divisionName, tournamentId) {
    return await page.evaluate((currentDiv, currentTournament) => {
        const uniqueTeams = new Map();
        const teamLinks = document.querySelectorAll('a[href*="/team/"], a[href*="/teams/"], tr.team-row, .team-name');

        teamLinks.forEach(el => {
            let teamName = el.innerText.trim();
            let teamUrl = el.href || window.location.href;
            
            // Clean up multi-line text (e.g. team name + coach)
            if (teamName.includes('\n')) {
                teamName = teamName.split('\n')[0].trim();
            }

            if (teamName && !uniqueTeams.has(teamName)) {
                uniqueTeams.set(teamName, {
                    tournament: currentTournament,
                    division: currentDiv,
                    team: teamName,
                    clubRaw: '',
                    state: '',
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
