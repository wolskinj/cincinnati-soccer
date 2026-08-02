const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, 'dist');

function checkFileMetadata(filePath) {
    const html = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(DIST_DIR, filePath);
    const issues = [];

    // Check Open Graph
    if (!html.includes('<meta property="og:site_name"')) issues.push('Missing og:site_name');
    if (!html.includes('<meta property="og:title"')) issues.push('Missing og:title');
    if (!html.includes('<meta property="og:description"')) issues.push('Missing og:description');
    if (!html.includes('<meta property="og:image"')) issues.push('Missing og:image');
    if (!html.includes('<meta property="og:url"')) issues.push('Missing og:url');

    // Check Twitter Card
    if (!html.includes('<meta name="twitter:card"')) issues.push('Missing twitter:card');
    if (!html.includes('<meta name="twitter:title"')) issues.push('Missing twitter:title');
    if (!html.includes('<meta name="twitter:description"')) issues.push('Missing twitter:description');
    if (!html.includes('<meta name="twitter:image"')) issues.push('Missing twitter:image');

    // Check Favicons & Manifest
    if (!html.includes('<link rel="icon" type="image/x-icon" href="/favicon.ico">')) issues.push('Missing /favicon.ico link');
    if (!html.includes('<link rel="icon" type="image/png"')) issues.push('Missing PNG favicon link');
    if (!html.includes('<link rel="apple-touch-icon"')) issues.push('Missing apple-touch-icon link');
    if (!html.includes('<link rel="manifest"')) issues.push('Missing site.webmanifest link');

    // Check Canonical URL
    if (!html.includes('<link rel="canonical"')) issues.push('Missing canonical link');

    // Check Google AdSense
    if (!html.includes('ca-pub-7915021068737339')) issues.push('Missing Google AdSense client script');

    return { relPath, issues };
}

function verifyAllDistFiles() {
    console.log("🔍 Scanning generated HTML files in dist/ for metadata & favicon tags...");
    if (!fs.existsSync(DIST_DIR)) {
        console.error("❌ dist/ directory does not exist! Run npm run build first.");
        process.exit(1);
    }

    const files = fs.readdirSync(DIST_DIR).filter(f => f.endsWith('.html'));
    console.log(`Found ${files.length} HTML files in dist/.`);

    let failureCount = 0;
    files.forEach(file => {
        const filePath = path.join(DIST_DIR, file);
        const { relPath, issues } = checkFileMetadata(filePath);
        if (issues.length > 0) {
            failureCount++;
            console.error(`❌ ${relPath}: ${issues.join(', ')}`);
        }
    });

    if (failureCount === 0) {
        console.log(`✅ ALL ${files.length} HTML files contain complete Open Graph, Twitter Card, Favicon, and Canonical metadata tags!`);
    } else {
        console.error(`💥 ${failureCount} out of ${files.length} files failed metadata verification.`);
        process.exit(1);
    }
}

verifyAllDistFiles();
