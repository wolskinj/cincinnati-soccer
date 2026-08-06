const CONFIG = require('./config.js');

module.exports = [
    {
        id: 'CPL',
        name: 'Cardinal Premier League',
        season: CONFIG.currentSeason,
        url: 'https://system.gotsport.com/org_event/events/55642',
        website: 'https://www.cardinalpremier.com/',
        about: `The Cardinal Premier League (CPL) is a cornerstone of competitive youth soccer in Greater Cincinnati, offering a vital development pathway for clubs across the region. Sanctioned by the Ohio South Youth Soccer Association, CPL provides structured, tiered divisions from U6 up to U20, ensuring players find the right balance of player development and premier competition. For the ${CONFIG.currentSeason} soccer season, CPL continues its tradition of high-quality local match play, making it a top choice for Cincinnati soccer families looking to elevate their child's game.`
    },
    {
        id: 'BPYSL',
        name: 'Buckeye Premier League',
        season: CONFIG.currentSeason,
        url: 'https://system.gotsport.com/org_event/events/54982',
        website: 'https://ohio-soccer.org/buckeye/',
        about: `As a nationally recognized US Youth Soccer affiliate, the Buckeye Premier Youth Soccer League (BPYSL) serves as the premier proving ground for elite and developing teams across central and southern Ohio, Indiana, and Kentucky. With over 650 participating youth soccer teams, BPYSL provides exceptional competitive diversity, allowing clubs to test their rosters against top-tier regional talent without extensive travel. Currently underway for the ${CONFIG.currentSeason} youth soccer season, the league remains a gold standard for Ohio families focused on long-term athletic growth and high-level collegiate exposure.`
    }
];