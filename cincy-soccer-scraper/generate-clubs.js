const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const CLUB_MAPPINGS_FILE = path.join(__dirname, 'club_mappings.json');
const CLEAN_TEAMS_FILE = path.join(__dirname, '../data/clean_teams.csv');
const OUTPUT_JSON = path.join(__dirname, '../data/clubs.json');

async function run() {
    console.log("📝 AI Club Description & Website Candidate Generator Starting...");

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('your_api_key_here') || process.env.GEMINI_API_KEY.includes('your_actual_gemini_api_key_here')) {
        console.error("❌ ERROR: GEMINI_API_KEY is not set (or is using the default placeholder) in .env");
        console.log("Please add your actual key to generate dynamic club descriptions.");
        process.exit(1);
    }

    // Load existing clubs.json to preserve user-confirmed overrides
    const existingClubsMap = {};
    if (fs.existsSync(OUTPUT_JSON)) {
        try {
            const existingArr = JSON.parse(fs.readFileSync(OUTPUT_JSON, 'utf-8'));
            existingArr.forEach(c => {
                if (c && c.name) {
                    existingClubsMap[c.name.toLowerCase()] = c;
                }
            });
        } catch (e) {
            console.warn("⚠️ Could not parse existing data/clubs.json for override preservation.");
        }
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const clubsSet = new Set();

    if (fs.existsSync(CLUB_MAPPINGS_FILE)) {
        const clubContext = JSON.parse(fs.readFileSync(CLUB_MAPPINGS_FILE, 'utf-8'));
        Object.keys(clubContext).forEach(c => clubsSet.add(c));
    }

    if (fs.existsSync(CLEAN_TEAMS_FILE)) {
        const lines = fs.readFileSync(CLEAN_TEAMS_FILE, 'utf-8').split('\n');
        lines.slice(1).forEach(line => {
            const parts = line.split(',');
            if (parts[4]) {
                const club = parts[4].trim();
                if (club && club !== 'Independent') {
                    clubsSet.add(club);
                }
            }
        });
    }

    const clubsList = Array.from(clubsSet).sort();
    console.log(`Found ${clubsList.length} unique clubs across CSV & mapping definitions.`);

    const BATCH_SIZE = 50;
    const allDescriptions = [];

    for (let i = 0; i < clubsList.length; i += BATCH_SIZE) {
        const batchClubs = clubsList.slice(i, i + BATCH_SIZE);
        console.log(`Processing club batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(clubsList.length / BATCH_SIZE)} (${batchClubs.length} clubs)...`);

        const prompt = `
You are an expert on youth soccer in the Greater Cincinnati and Southwestern Ohio area.
I will give you a list of local youth soccer clubs.
For each club:
1. Write a professional, supportive, and informative 2-3 sentence "about" blurb tailored for parents looking at youth soccer organizations.
2. Provide their official website URL (starting with http:// or https://) if you find a likely domain for this youth soccer club. If no website candidate is found, set "website" to null.
3. Set "confirmed" to true ONLY if you have 100% high confidence that the website is the official domain. Set "confirmed" to false if it is a candidate that should be manually verified by a human.

Output MUST be a raw JSON array of objects (no markdown, no backticks).
Format:
[
  {
    "name": "Club Name",
    "website": "https://www.exampleclub.com",
    "confirmed": true,
    "about": "Description here..."
  }
]

Input Clubs:
${JSON.stringify(batchClubs)}
        `;

        try {
            const result = await model.generateContent(prompt);
            let responseText = result.response.text();
            
            responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
            
            const batchResults = JSON.parse(responseText);

            // Merge with existing user overrides
            batchResults.forEach(item => {
                const lowerName = item.name.toLowerCase();
                const existing = existingClubsMap[lowerName];
                
                // If user previously confirmed/overrode a website, preserve user choice!
                if (existing && existing.confirmed === true && existing.website) {
                    item.website = existing.website;
                    item.confirmed = true;
                }
            });

            allDescriptions.push(...batchResults);

        } catch (error) {
            console.error(`❌ Error generating batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
        }
    }

    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(allDescriptions, null, 4));
    console.log(`✅ Successfully generated descriptions & website candidates for ${allDescriptions.length} clubs!`);
    console.log(`Saved to data/clubs.json`);
}

run();
