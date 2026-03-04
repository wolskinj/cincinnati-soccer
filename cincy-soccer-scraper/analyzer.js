const fs = require('fs');
const csv = require('csv-parser');

let rowCount = 0;
let emptyTeams = 0;
let missingLinks = 0;
let divisionAnomalies = new Set();
let leagueCounts = {};
let missingDivisions = 0;
let missingLeagues = 0;

fs.createReadStream('all_teams.csv')
    .pipe(csv())
    .on('data', row => {
        rowCount++;
        if (!row.TEAM_NAME) emptyTeams++;
        if (!row.SCHEDULE_LINK) missingLinks++;
        if (!row.LEAGUE) {
            missingLeagues++;
        } else {
            leagueCounts[row.LEAGUE] = (leagueCounts[row.LEAGUE] || 0) + 1;
        }
        if (!row.DIVISION) {
            missingDivisions++;
        } else if (!row.DIVISION.includes(' ')) {
            divisionAnomalies.add(row.DIVISION);
        }
    })
    .on('end', () => {
        console.log('--- CSV Analysis ---');
        console.log('Total Rows:', rowCount);
        console.log('Empty Team Names:', emptyTeams);
        console.log('Missing Links:', missingLinks);
        console.log('Missing Divisions:', missingDivisions);
        console.log('Missing Leagues:', missingLeagues);
        console.log('League Counts:', leagueCounts);
        console.log('Division Anomalies (sample):', Array.from(divisionAnomalies).slice(0, 10));
    });
