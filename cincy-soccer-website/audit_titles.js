const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, 'dist');

function auditTitles() {
    if (!fs.existsSync(DIST_DIR)) {
        console.error("dist/ directory not found. Run npm run build first.");
        return;
    }

    const files = fs.readdirSync(DIST_DIR).filter(f => f.endsWith('.html'));
    let over60Count = 0;
    let over65Count = 0;
    const longTitles = [];

    files.forEach(file => {
        const html = fs.readFileSync(path.join(DIST_DIR, file), 'utf8');
        const match = html.match(/<title>(.*?)<\/title>/i);
        if (match) {
            const title = match[1];
            if (title.length > 60) {
                over60Count++;
                if (title.length > 65) over65Count++;
                longTitles.push({ file, length: title.length, title });
            }
        }
    });

    console.log(`Total HTML files scanned: ${files.length}`);
    console.log(`Titles over 60 chars: ${over60Count}`);
    console.log(`Titles over 65 chars: ${over65Count}`);

    console.log("\nTop 15 longest titles:");
    longTitles.sort((a, b) => b.length - a.length).slice(0, 15).forEach(item => {
        console.log(`[${item.length} chars] ${item.file}: "${item.title}"`);
    });
}

auditTitles();
