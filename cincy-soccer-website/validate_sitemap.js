const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, 'dist');
const SITEMAP_PATH = path.join(DIST_DIR, 'sitemap.xml');

function validateSitemap() {
    console.log("--------------------------------------------------");
    console.log("🗺️  Cincinnati Soccer Sitemap Validation Suite");
    console.log("--------------------------------------------------");

    if (!fs.existsSync(SITEMAP_PATH)) {
        console.error("❌ sitemap.xml does not exist in dist/! Run npm run build first.");
        process.exit(1);
    }

    const xml = fs.readFileSync(SITEMAP_PATH, 'utf8');
    const errors = [];
    const warnings = [];

    // 1. Check XML Declaration & Namespace
    if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) {
        errors.push('Missing or invalid <?xml> declaration header.');
    }
    if (!xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')) {
        errors.push('Missing sitemap 0.9 namespace schema (xmlns="http://www.sitemaps.org/schemas/sitemap/0.9").');
    }

    // 2. Extract <url> entries
    const urlMatches = [...xml.matchAll(/<url>[\s\S]*?<\/url>/gi)];
    console.log(`🔍 Found ${urlMatches.length} <url> entries in sitemap.xml.`);

    if (urlMatches.length === 0) {
        errors.push('sitemap.xml contains 0 <url> entries!');
    }

    const sitemapUrls = new Set();

    urlMatches.forEach((entry, idx) => {
        const block = entry[0];

        // Check <loc>
        const locMatch = block.match(/<loc>(.*?)<\/loc>/i);
        if (!locMatch) {
            errors.push(`Entry #${idx + 1} is missing <loc> tag.`);
            return;
        }

        const loc = locMatch[1];
        if (!loc.startsWith('https://cincinnati.soccer')) {
            errors.push(`Entry #${idx + 1} has non-HTTPS or invalid domain loc: "${loc}"`);
        }

        sitemapUrls.add(loc);

        // Check <lastmod> format (YYYY-MM-DD)
        const lastmodMatch = block.match(/<lastmod>(.*?)<\/lastmod>/i);
        if (!lastmodMatch) {
            warnings.push(`Entry "${loc}" missing <lastmod> tag.`);
        } else {
            const dateStr = lastmodMatch[1];
            if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                errors.push(`Entry "${loc}" has invalid <lastmod> date format: "${dateStr}" (must be YYYY-MM-DD).`);
            }
        }

        // Check <changefreq>
        const changefreqMatch = block.match(/<changefreq>(.*?)<\/changefreq>/i);
        if (changefreqMatch) {
            const validFreqs = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
            if (!validFreqs.includes(changefreqMatch[1].toLowerCase())) {
                errors.push(`Entry "${loc}" has invalid changefreq: "${changefreqMatch[1]}"`);
            }
        }
    });

    // 3. Verify Key Pages are included in sitemap.xml
    const mandatoryPages = [
        'https://cincinnati.soccer/',
        'https://cincinnati.soccer/clubs.html',
        'https://cincinnati.soccer/ages.html',
        'https://cincinnati.soccer/leagues.html'
    ];

    mandatoryPages.forEach(page => {
        if (!sitemapUrls.has(page)) {
            errors.push(`Mandatory core page missing from sitemap.xml: "${page}"`);
        }
    });

    // 4. Verify 100% of URLs in sitemap exist as real HTML files in dist/
    let brokenLinksCount = 0;
    sitemapUrls.forEach(url => {
        let relPath = url.replace('https://cincinnati.soccer/', '');
        if (relPath === '' || relPath === '/') relPath = 'index.html';
        const targetFile = path.join(DIST_DIR, relPath);
        if (!fs.existsSync(targetFile)) {
            brokenLinksCount++;
            errors.push(`Sitemap contains 404 URL that does not exist in dist/: "${url}"`);
        }
    });

    // 5. Output Results
    console.log("--------------------------------------------------");
    if (errors.length > 0) {
        console.error(`💥 Sitemap Validation FAILED with ${errors.length} error(s):`);
        errors.forEach(e => console.error(`   ❌ ${e}`));
        process.exit(1);
    } else {
        console.log(`✅ Sitemap Validation PASSED with 0 errors and ${warnings.length} warning(s).`);
        if (warnings.length > 0) {
            warnings.forEach(w => console.warn(`   ⚠️ ${w}`));
        }
    }
}

validateSitemap();
