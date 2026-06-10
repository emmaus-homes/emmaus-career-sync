# Emmaus Careers Sync

Automated job scraper for the Emmaus Homes careers page. Syncs job listings from Paycom to GitHub daily.

## How it works

1. **GitHub Actions** runs on a schedule (daily at 6 AM Central)
2. **Playwright** (headless browser) loads the Paycom careers portal
3. **Scraper** extracts job details from each listing
4. **jobs.json** is committed to this repo
5. **WordPress** fetches from GitHub raw URL to display the careers page

## Setup

### Repository secrets

**None required** — the repo is public and no external services are used.

### Run the workflow

- **Automatic:** Runs daily at 6:00 AM Central Time
- **Manual:** Go to Actions → "Update Careers Page" → "Run workflow"

## Project structure

```
├── .github/
│   └── workflows/
│       └── update-jobs.yml   # GitHub Actions workflow
├── scraper/
│   ├── index.js              # Playwright scraper
│   └── package.json          # Node.js dependencies
├── careers-elementor.html    # Elementor HTML widget (paste into WordPress)
├── jobs.json                 # Job listings data (auto-updated)
└── README.md
```

## What gets extracted

For each job listing:

| Field | Source |
|-------|--------|
| `title` | Job title from detail page |
| `paycomId` | ID from URL (e.g., `/jobs/292209`) |
| `reqId` | Requisition number from title `(36308)` |
| `location` | Parsed from page (e.g., "St. Charles, MO") |
| `type` | Full-Time, Part-Time, etc. |
| `salary` | If listed (e.g., "$19/hr") |
| `summary` | Job summary text |
| `department` | Inferred from title keywords |

## Smart merging

When updating, the scraper preserves:
- `featured` flag (manually set in jobs.json)
- `posted` date (original date job was first seen)
- `schedule` (if manually set)
- Custom `summary` edits

## Data cleaning

The scraper automatically handles:
- **"Hot Job" badges** — Paycom adds these to featured listings; stripped from location field
- **Boilerplate text** — Core values section filtered from summaries
- **Requisition IDs** — Extracted from title and stored separately

## Changing the schedule

Edit `.github/workflows/update-jobs.yml`:

```yaml
schedule:
  - cron: '0 11 * * *'  # 6:00 AM Central (11:00 UTC)
```

Examples:
- `'0 11 * * 1-5'` — Weekdays only
- `'0 11,23 * * *'` — Twice daily (6 AM and 6 PM)

## Troubleshooting

### Workflow fails with timeout
Paycom may be slow. Try running again.

### No jobs found
The Paycom page structure may have changed. Check the debug screenshot artifact.

### "Hot Job" appearing in locations
The scraper strips this automatically. If it appears, manually edit jobs.json to remove it.

## Manual testing

To run locally:

```bash
cd scraper
npm install
npx playwright install chromium
npm run scrape
```

## GitHub raw URL

The WordPress widget fetches jobs from:
```
https://raw.githubusercontent.com/emmaus-homes/emmaus-career-sync/main/jobs.json
```

## Related

- **WordPress widget:** Elementor HTML widget (`careers-elementor.html`)
- **Paycom portal:** React SPA with no public API
