# Antigravity Workspace Guide - Cincinnati Soccer

## Overview
This repository contains a full data scraping pipeline and static site generator for youth soccer schedules, standings, and divisions in the Greater Cincinnati area (`wolskinj/cincinnati-soccer`).

## Architecture & Project Structure
- **Root (`package.json`)**: Master orchestration scripts (`npm run setup`, `npm run scrape`, `npm run build`, `npm run deploy`, `npm run publish-all`).
- **`cincy-soccer-scraper/`**: Puppeteer-based scraper that scans local soccer leagues (Cardinal Premier, Buckeye Premier, Ohio Soccer State League, Club v Club) and outputs raw data to `data/scraped_divisions.csv`, `data/all_teams.csv`, and cleaned data to `data/clean_teams.csv`.
- **`data/`**: Central source of truth.
  - `leagues.js`: League definitions and scraper target URLs.
  - `clubs.js`: Club aliases and naming rules.
  - `scraped_divisions.csv`, `all_teams.csv`, `clean_teams.csv`: Scraped and processed team data.
- **`cincy-soccer-website/`**: Static site builder using Node.js + EJS templates. Outputs generated HTML files to `cincy-soccer-website/dist/`.

## Key Commands & Workflow
- `npm run setup`: Installs dependencies for root, scraper, and website.
- `npm run scrape`: Runs scraper pipeline (`scrape.js` -> `harvest.js` -> `clean.js`).
- `npm run build`: Compiles CSV data into the static site in `cincy-soccer-website/dist/`.
- `npm run deploy`: Deploys `dist/` to Cloudflare Pages via Wrangler (`cincinnati-soccer`).
- `npm run publish-all`: Executes scrape, build, and deploy in one continuous pipeline.

## Formatting & Development Guidelines
- Always verify website builds with `npm run build` after modifying EJS templates (`template.ejs`, `team_template.ejs`, etc.) or `build.js`.
- Preserve generated assets and SEO files (`sitemap.xml`, `robots.txt`, `_headers`, `search_index.json`).
