const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CLUBS_JSON = path.join(__dirname, '../data/clubs.json');

async function run() {
    if (!fs.existsSync(CLUBS_JSON)) {
        console.error("❌ data/clubs.json not found. Run 'npm run generate-clubs' first.");
        process.exit(1);
    }

    const clubs = JSON.parse(fs.readFileSync(CLUBS_JSON, 'utf-8'));
    
    // Find unconfirmed candidates
    const unconfirmed = clubs.filter(c => c.website && c.confirmed !== true);

    if (unconfirmed.length === 0) {
        console.log("🎉 All candidate website URLs are already confirmed! (or no candidates to review)");
        return;
    }

    console.log(`\n🔍 Found ${unconfirmed.length} unconfirmed website candidates to review.\n`);
    console.log("Controls: [y] Confirm | [n] Reject | [e] Edit URL | [s] Skip | [q] Save & Quit\n");

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askQuestion = (query) => new Promise(resolve => rl.question(query, resolve));

    let updatedCount = 0;

    for (let i = 0; i < unconfirmed.length; i++) {
        const club = unconfirmed[i];
        console.log(`--------------------------------------------------`);
        console.log(`[${i + 1}/${unconfirmed.length}] 🛡️ Club: \x1b[1m${club.name}\x1b[0m`);
        console.log(`🌐 Candidate URL: \x1b[36m${club.website}\x1b[0m`);
        
        let validChoice = false;

        while (!validChoice) {
            const answer = (await askQuestion(`Action [y/n/e/s/q]: `)).trim().toLowerCase();

            if (answer === 'y' || answer === 'yes') {
                club.confirmed = true;
                updatedCount++;
                console.log(`✅ Confirmed!`);
                validChoice = true;
            } else if (answer === 'n' || answer === 'no') {
                club.website = null;
                club.confirmed = false;
                updatedCount++;
                console.log(`❌ Rejected and cleared.`);
                validChoice = true;
            } else if (answer === 'e' || answer === 'edit') {
                const customUrl = (await askQuestion(`Type custom URL: `)).trim();
                if (customUrl) {
                    club.website = customUrl.startsWith('http') ? customUrl : `https://${customUrl}`;
                    club.confirmed = true;
                    updatedCount++;
                    console.log(`✅ Custom URL set & confirmed: ${club.website}`);
                } else {
                    console.log(`Skipped edit.`);
                }
                validChoice = true;
            } else if (answer === 's' || answer === 'skip') {
                console.log(`Skipped.`);
                validChoice = true;
            } else if (answer === 'q' || answer === 'quit') {
                console.log(`\nSaving progress and exiting...`);
                rl.close();
                fs.writeFileSync(CLUBS_JSON, JSON.stringify(clubs, null, 4));
                console.log(`💾 Saved updates to data/clubs.json (${updatedCount} updated).`);
                return;
            } else {
                console.log(`Invalid option. Type 'y' (confirm), 'n' (reject), 'e' (edit), 's' (skip), or 'q' (quit).`);
            }
        }
        console.log(``);
    }

    rl.close();
    fs.writeFileSync(CLUBS_JSON, JSON.stringify(clubs, null, 4));
    console.log(`\n💾 Saved all updates to data/clubs.json! (${updatedCount} clubs updated)`);
}

run();
