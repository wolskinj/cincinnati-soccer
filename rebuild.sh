#!/bin/bash
set -e

echo "⚡ QUICK BUILD (No Scraping)..."

# 1. CLEAN (Reprocess local data in case you added aliases)
cd cincy-soccer-scraper
echo "🧼 [1/3] Cleaning local data..."
node clean.js

# 2. MOVE
echo "📦 Moving Data..."
cp clean_teams.csv ../cincy-soccer-website/

# 3. BUILD
cd ../cincy-soccer-website
echo "🏭 [2/3] Building Website..."
node build.js

# 4. DEPLOY
echo "☁️ [3/3] Deploying..."
npx wrangler pages deploy dist --project-name cincinnati-soccer

echo "✅ DONE! Site updated without scraping."