const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');

const INPUT_CSV = path.join(__dirname, '../data/all_teams.csv');
const MAPPINGS_FILE = path.join(__dirname, '../data/ai_team_mappings.json');
const CLUB_MAPPINGS_FILE = path.join(__dirname, 'club_mappings.json');

const BATCH_SIZE = 100;

async function run() {
    console.log("🤖 AI Team Mapper Starting...");

    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('your_api_key_here') || process.env.GEMINI_API_KEY.includes('your_actual_gemini_api_key_here')) {
        console.log("ℹ️ GEMINI_API_KEY is not set (or is using the default placeholder) in .env. Skipping AI mapping step.");
        return;
    }

    if (!fs.existsSync(INPUT_CSV)) {
        console.log("ℹ️ No all_teams.csv found yet. Skipping AI mapping step.");
        return;
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    // 1. Load existing mapped data
    let existingMappings = {};
    if (fs.existsSync(MAPPINGS_FILE)) {
        try {
            existingMappings = JSON.parse(fs.readFileSync(MAPPINGS_FILE, 'utf-8'));
            console.log(`Loaded ${Object.keys(existingMappings).length} existing mappings.`);
        } catch (e) {
            console.warn("Could not parse existing mappings, starting fresh.");
        }
    }

    // 2. Load club contexts
    const clubContext = JSON.parse(fs.readFileSync(CLUB_MAPPINGS_FILE, 'utf-8'));
    const clubsList = Object.keys(clubContext);

    // 3. Extract unique teams from CSV
    const uniqueTeams = new Set();
    await new Promise((resolve) => {
        fs.createReadStream(INPUT_CSV)
            .pipe(csv())
            .on('data', (row) => {
                if (row.TEAM_NAME) uniqueTeams.add(row.TEAM_NAME.trim());
            })
            .on('end', resolve);
    });

    console.log(`Found ${uniqueTeams.size} unique teams in CSV.`);

    // 4. Determine which teams need mapping
    const teamsToMap = [];
    for (const team of uniqueTeams) {
        if (!existingMappings[team]) {
            teamsToMap.push(team);
        }
    }

    if (teamsToMap.length === 0) {
        console.log("✅ All teams are already mapped!");
        return;
    }

    console.log(`Processing ${teamsToMap.length} unmapped teams in batches of ${BATCH_SIZE}...`);

    // 5. Process in batches
    for (let i = 0; i < teamsToMap.length; i += BATCH_SIZE) {
        const batch = teamsToMap.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(teamsToMap.length / BATCH_SIZE);
        console.log(`Processing batch ${batchNum} / ${totalBatches}...`);

        const prompt = `
You are a data cleaning assistant for youth soccer teams.
I will give you a JSON array of raw team names.
Your task is to standardize these team names and map them to their official club.

Rules for Clean Name:
- Remove redundant repetitions of the club name. For example, "Real Soccer FC Real Soccer FC B2018" -> "Real Soccer FC B2018".
- Remove extra spaces.
- Keep the year/identifier (e.g. B2018, 17B, BU10).

Rules for Club Name:
- Map to one of these known clubs if possible: ${clubsList.join(', ')}.
- Here are some known aliases to help you: ${JSON.stringify(clubContext)}.
- If it doesn't match a known club, guess the club name from the first 1 or 2 words (e.g. "Ohio Premier B10" -> "Ohio Premier"), or use "Independent" if unclear.

Output Format:
You MUST return ONLY a raw JSON array of objects (no markdown, no backticks).
Format:
[
  {
    "originalName": "Raw Name Here",
    "cleanName": "Cleaned Name Here",
    "clubName": "Mapped Club Name Here"
  }
]

Input Teams:
${JSON.stringify(batch)}
        `;

        let success = false;
        let retries = 0;

        while (!success && retries < 3) {
            try {
                const result = await model.generateContent(prompt);
                let responseText = result.response.text();
                
                responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
                
                const mappedBatch = JSON.parse(responseText);

                for (const item of mappedBatch) {
                    if (item.originalName && item.cleanName && item.clubName) {
                        existingMappings[item.originalName] = {
                            cleanName: item.cleanName,
                            clubName: item.clubName
                        };
                    }
                }

                // Save after each batch
                fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(existingMappings, null, 2));
                success = true;

                // Wait 5 seconds between batches to respect 15 RPM rate limits
                await new Promise(r => setTimeout(r, 5000));

            } catch (error) {
                retries++;
                const isRetryable = error.status === 429 || error.status === 503 || (error.message && (error.message.includes('Quota exceeded') || error.message.includes('503') || error.message.includes('high demand')));
                
                if (isRetryable && retries < 5) {
                    const waitTime = error.status === 503 || (error.message && error.message.includes('503')) ? 5000 : 15000;
                    console.warn(`⚠️ Temporary error on batch ${batchNum} (${error.status || '503'}). Pausing for ${waitTime / 1000}s before retry ${retries}/5...`);
                    await new Promise(r => setTimeout(r, waitTime));
                } else {
                    console.error(`❌ Error processing batch ${batchNum}:`, error.message || error);
                    console.error("Aborting remaining AI mapping for this run.");
                    return;
                }
            }
        }
    }

    console.log("✅ Finished mapping teams!");
}

run();
