const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'dist', 'team-kolping-sc-kolping-sc-b18-orange.html');

const html = fs.readFileSync(targetFile, 'utf8');

const metaMatches = [...html.matchAll(/<meta\s+[^>]+>/gi)].map(m => m[0]);

console.log(`=== ALL META TAGS IN ${path.basename(targetFile)} ===`);
const counts = {};
metaMatches.forEach((t, i) => {
    console.log(`[${i + 1}] ${t}`);
    counts[t] = (counts[t] || 0) + 1;
});

console.log("\n=== DUPLICATED META TAGS ===");
Object.entries(counts).forEach(([tag, count]) => {
    if (count > 1) {
        console.log(`Count ${count}: ${tag}`);
    }
});
