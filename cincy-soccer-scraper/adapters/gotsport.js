/**
 * GotSport Platform Adapter for Tournaments
 */

async function discoverDivisions(page, tournament) {
    return await page.evaluate((tournamentId) => {
        const results = [];
        const rows = document.querySelectorAll('div.row');
        
        const seenUrls = new Set();
        rows.forEach(row => {
            const nameEl = row.querySelector('.col-md-6 b') || row.querySelector('b');
            const linkEl = row.querySelector('a.btn-primary-custom') || row.querySelector('a[href*="group="]');

            if (nameEl && linkEl) {
                const name = nameEl.innerText.trim();
                const url = linkEl.href;

                if (url.includes('group=') && !seenUrls.has(url)) {
                    seenUrls.add(url);
                    results.push({
                        tournament: tournamentId,
                        division: name,
                        url: url,
                        platform: 'GotSport'
                    });
                }
            }
        });
        return results;
    }, tournament.id);
}

async function extractTeamsFromDivision(page, divisionName, tournamentId) {
    return await page.evaluate((currentDiv, currentTournament) => {
        const uniqueTeams = new Map();
        const links = document.querySelectorAll('td a[href*="team="]');

        links.forEach(link => {
            const teamUrl = link.href;
            const teamName = link.innerText.trim();
            if (teamName && !uniqueTeams.has(teamUrl)) {
                // Try to find club/location if present in sibling columns
                const tr = link.closest('tr');
                let clubName = '';
                let state = '';
                if (tr) {
                    const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim());
                    if (cells.length > 2) {
                        clubName = cells[2] || '';
                    }
                }

                uniqueTeams.set(teamUrl, {
                    tournament: currentTournament,
                    division: currentDiv,
                    team: teamName,
                    clubRaw: clubName,
                    state: state,
                    scheduleLink: teamUrl,
                    platform: 'GotSport'
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
