#!/bin/bash
set -e

echo "🚀 LAUNCHING CINCINNATI SOCCER PIPELINE..."

# 1. RUN SCRAPER
cd cincy-soccer-scraper
echo "🤖 [1/4] Scouting..."
node scrape.js
echo "🚜 [2/4] Harvesting..."
node harvest.js
echo "🧼 [3/4] Cleaning..."
node clean.js

# 2. MOVE DATA
echo "📦 Moving Data..."
# Copy the clean CSV from scraper to website folder
cp clean_teams.csv ../cincy-soccer-website/

# 3. BUILD SITE
cd ../cincy-soccer-website
echo "🏭 [4/4] Building Website..."
node build.js

# 4. DEPLOY (Optional - Uncomment when ready)
# echo "☁️ Deploying..."
# npx wrangler pages deploy dist --project-name cincinnati-soccer

echo "✅ DONE! Website is ready in 'cincy-soccer-website/dist'"