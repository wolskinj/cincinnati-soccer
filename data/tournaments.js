const CONFIG = require('./config.js');

module.exports = [
    {
        id: 'summer-end-showdown-2026',
        name: 'Summer End Showdown',
        season: CONFIG.currentSeason,
        dates: 'August 15-17, 2026',
        startDate: '2026-08-15',
        endDate: '2026-08-17',
        month: 'August',
        hostClub: 'Ohio Galaxies FC',
        platform: 'GotSport',
        url: 'https://system.gotsport.com/org_event/events/55233',
        website: 'https://summerendshowdown.com/',
        venues: [
            { name: 'Ankeney Soccer Complex', city: 'Beavercreek, OH' },
            { name: 'Athletes in Action Sports Complex', city: 'Xenia, OH' }
        ],
        ageGroups: ['U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15'],
        about: `The Summer End Showdown is an annual pre-season tournament hosted by Ohio Galaxies FC, bringing together premier and competitive youth soccer squads across Southwestern Ohio for competitive flight play.`
    },
    {
        id: 'party-on-the-pitch-2026',
        name: 'Party on the Pitch 2026',
        season: CONFIG.currentSeason,
        dates: 'August 22-24, 2026',
        startDate: '2026-08-22',
        endDate: '2026-08-24',
        month: 'August',
        hostClub: 'Cincinnati United',
        platform: 'TourneyCentral',
        url: 'https://partyonthepitch.tourneycentral.com/games.html',
        website: 'https://partyonthepitch.tourneycentral.com/',
        venues: [
            { name: 'Voice of America Park', city: 'West Chester, OH' },
            { name: 'Warren County Sports Park', city: 'Lebanon, OH' }
        ],
        ageGroups: ['U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'High School'],
        about: `Party on the Pitch is one of Greater Cincinnati's premier late-summer youth soccer tournaments. Hosted annually by Cincinnati United Soccer Club, the event brings together hundreds of competitive teams from across Ohio, Kentucky, and Indiana for high-level bracket play across premier turf facilities in Butler and Warren counties.`
    },
    {
        id: 'community-kickoff-2026',
        name: '2026 Community Kickoff Classic',
        season: CONFIG.currentSeason,
        dates: 'September 5-7, 2026',
        startDate: '2026-09-05',
        endDate: '2026-09-07',
        month: 'September',
        hostClub: 'Kings Hammer SC',
        platform: 'Exposure',
        url: 'https://soccer.exposureevents.com/271925/2026-community-kickoff',
        website: 'https://kingshammer.com',
        venues: [
            { name: 'Batavia Soccer Complex', city: 'Batavia, OH' }
        ],
        ageGroups: ['U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14'],
        about: `The Community Kickoff Classic is a staple early-season tournament hosted by Kings Hammer SC, providing competitive match play for developmental and premier youth squads preparing for their fall league campaigns.`
    },
    {
        id: 'queen-city-fall-classic-2026',
        name: 'Queen City Fall Classic',
        season: CONFIG.currentSeason,
        dates: 'October 10-12, 2026',
        startDate: '2026-10-10',
        endDate: '2026-10-12',
        month: 'October',
        hostClub: 'Cincinnati West Soccer Club',
        platform: 'TourneyCentral',
        url: null, // Announcement mode (url to be published closer to event)
        website: 'https://queencity.tourneycentral.com/',
        venues: [
            { name: 'Miami Meadows', city: 'Milford, OH' }
        ],
        ageGroups: ['U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15'],
        about: `Hosted by Cincinnati West Soccer Club, the Queen City Fall Classic is an annual mid-season tradition offering competitive bracket play for teams across Southwestern Ohio.`
    }
];
