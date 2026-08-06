# Cincinnati Soccer Dashboard

A data pipeline and static website generator that aggregates youth soccer team schedules, standings, and division info across the Greater Cincinnati area (`cincinnati-soccer`).

## Architecture

This project is divided into three main components:

1. **`cincy-soccer-scraper/`**: Puppeteer-based scraper that extracts raw division and team data from local league websites (CPL, BPYSL, OSSL, etc.). Includes an AI-assisted mapping module (`ai-mapper.js`) to intelligently clean team names and extract club associations.
2. **`data/`**: The central source of truth. Contains league definitions (`leagues.js`), club metadata (`clubs.js`), scraped raw teams (`all_teams.csv`), AI team mappings (`ai_team_mappings.json`), and the cleaned team master file (`clean_teams.csv`).
3. **`cincy-soccer-website/`**: A Node.js static site generator that uses EJS templates to compile `clean_teams.csv` into an optimized, SEO-friendly static website deployed to Cloudflare Pages.

---

## 🚀 Quick Start / Cheat Sheet

You can control the entire project directly from the root directory using simple NPM commands.

### 1. Setup (First time only)
Install dependencies across root, scraper, and website components:
```bash
npm run setup
```

### 2. Configure Gemini API (Optional, for AI Team Cleaning)
To enable AI-assisted team name cleaning and club extraction during scraping:
1. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Create a `.env` file in `cincy-soccer-scraper/`:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   ```

---

## 🔄 Data Pipeline & Commands

### How Scraping Works
When you run:
```bash
npm run scrape
```
The system executes a 4-step pipeline automatically:
1. `scrape.js`: Discovers division links across configured leagues.
2. `harvest.js`: Extracts raw team rosters and schedule links into `data/all_teams.csv`.
3. `ai-mapper.js`: Checks `data/all_teams.csv` for any **new unmapped teams**. If found (and `GEMINI_API_KEY` is present), it sends them to Gemini to clean up redundant text and map them to clubs, appending results to `data/ai_team_mappings.json`. (If all teams are already mapped or no API key is set, it skips in milliseconds!).
4. `clean.js`: Reads `data/all_teams.csv` + `data/ai_team_mappings.json` (falling back to regex matching if unmapped), standardizes team/club names, deduplicates records, and outputs `data/clean_teams.csv`.

*Note: You don't need to manually run `map-teams` separately! It is built into `npm run scrape`.*

---

### Other Commands

- **`npm run map-teams`**: Runs *only* the AI team mapper step independently (useful if you want to re-process `all_teams.csv` without scraping again).
- **`npm run generate-clubs`**: Standalone AI script to generate fresh "about" descriptions for all standardized clubs in the database.
- **`npm run build`**: Compiles `data/clean_teams.csv` into static HTML files inside `cincy-soccer-website/dist`.
- **`npm run deploy`**: Deploys `cincy-soccer-website/dist` live to Cloudflare Pages.
- **`npm run publish-all`**: Scrapes fresh data (including AI mapping), compiles the static site, and deploys to Cloudflare Pages in one automated command.

---

## 📁 Key Files & Directories

- `data/leagues.js`: League definitions and target scraper URLs.
- `data/clubs.js`: Featured club metadata and about descriptions for website pages.
- `data/ai_team_mappings.json`: Persistent JSON cache of AI-cleaned team and club mappings.
- `cincy-soccer-scraper/club_mappings.json`: Known club name aliases used as reference context for AI mapping and regex fallbacks.
- `cincy-soccer-scraper/ai-mapper.js`: Batch processing script that interfaces with Gemini API.
- `cincy-soccer-scraper/clean.js`: Refinery script that applies AI mappings and deduplicates team entries.
