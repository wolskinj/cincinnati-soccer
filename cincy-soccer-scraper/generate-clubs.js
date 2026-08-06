const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const CLUB_MAPPINGS_FILE = path.join(__dirname, 'club_mappings.json');
const OUTPUT_JSON = path.join(__dirname, '../data/clubs.json');

async function run() {
    console.log("📝 AI Club Description & Website Generator Starting...");

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('your_api_key_here') || process.env.GEMINI_API_KEY.includes('your_actual_gemini_api_key_here')) {
        console.error("❌ ERROR: GEMINI_API_KEY is not set (or is using the default placeholder) in .env");
        console.log("Please add your actual key to generate dynamic club descriptions.");
        process.exit(1);
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const clubContext = JSON.parse(fs.readFileSync(CLUB_MAPPINGS_FILE, 'utf-8'));
    const clubsList = Object.keys(clubContext);

    console.log(`Found ${clubsList.length} clubs. Generating descriptions & website URLs...`);

    const prompt = `
You are an expert on youth soccer in the Greater Cincinnati area.
I will give you a list of local youth soccer clubs.
For each club:
1. Write a professional, supportive, and informative 2-3 sentence "about" blurb tailored for parents looking at youth soccer organizations. Highlight their developmental focus, community presence, or general reputation if known. If a club is obscure, write a generic positive blurb about their commitment to local youth soccer development.
2. Provide their official website URL (starting with http:// or https://) ONLY if you have extremely HIGH CONFIDENCE that it is the accurate, official domain for this youth soccer club. If you are unsure or not 100% confident, set "website" to null.

Output MUST be a raw JSON array of objects (no markdown, no backticks).
Format:
[
  {
    "name": "Club Name",
    "website": "https://www.exampleclub.com",
    "about": "Description here..."
  }
]

Input Clubs:
${JSON.stringify(clubsList)}
    `;

    try {
        const result = await model.generateContent(prompt);
        let responseText = result.response.text();
        
        responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        const descriptions = JSON.parse(responseText);

        fs.writeFileSync(OUTPUT_JSON, JSON.stringify(descriptions, null, 4));
        console.log(`✅ Successfully generated descriptions & websites for ${descriptions.length} clubs!`);
        console.log(`Saved to data/clubs.json`);

    } catch (error) {
        console.error(`❌ Error generating club info:`, error);
    }
}

run();
