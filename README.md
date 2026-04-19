# Cincinnati Soccer Dashboard

A data pipeline and static website generator that aggregates youth soccer team schedules, standings, and division info across the Greater Cincinnati area.

## Architecture

This project is divided into three main components:

1. **`cincy-soccer-scraper`**: Puppeteer-based scraper that extracts team info from local league websites (CPL, BPYSL, etc.).
2. **`data/`**: The central source of truth. Contains the configuration files (`clubs.js`, `leagues.js`) and the master list of all scraped teams (`clean_teams.csv`).
3. **`cincy-soccer-website`**: A Node.js static site generator that uses EJS templates to convert the CSV data into a highly optimized, SEO-friendly static website.

---

## 🚀 Quick Start / Cheat Sheet

You can control the entire project directly from this root directory using simple NPM commands.

### 1. Setup (First time only)
If you just cloned this repo to a new computer, run this to install all dependencies for both the scraper and the website:
```bash
npm run setup
```

### 2. Update the Data (Scraping)
To run the web scraper and fetch the latest schedules and teams. This will output the fresh data to `data/clean_teams.csv`.
```bash
npm run scrape
```

### 3. Generate the Website
To take the data from `data/clean_teams.csv` and generate the HTML files (which are placed in `cincy-soccer-website/dist`).
```bash
npm run build
```

### 4. Deploy to Cloudflare Pages
To publish the current `dist/` folder live to the internet.
```bash
npm run deploy
```

### 5. Do Everything At Once (The "Make it Live" Button)
To scrape the latest data, build the fresh HTML files, and deploy to the internet in one go.
```bash
npm run publish-all
```

---

## Modifying Data Manually

- **Add a new League**: Edit `data/leagues.js`
- **Add aliases/mappings for a Club**: Edit `data/clubs.js`
- **Update Club dictionary for Scraper**: Edit `cincy-soccer-scraper/club_mappings.json` (Used to clean up weird team names into standardized club names).
