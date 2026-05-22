# Emmaus Careers Sync

Automated job scraper for the Emmaus Homes careers page. Syncs job listings from Paycom to JSONbin daily.

## How it works

1. **GitHub Actions** runs on a schedule (daily at 6 AM Central)
2. **Playwright** (headless browser) loads the Paycom careers portal
3. **Scraper** extracts job details from each listing
4. **JSONbin** is updated with the latest jobs
5. **WordPress** fetches from JSONbin to display the careers page

## Setup

### 1. Add repository secrets

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Description |
|--------|-------------|
| `JSONBIN_BIN_ID` | Your JSONbin bin ID (from the URL) |
| `JSONBIN_API_KEY` | Your JSONbin X-Master-Key |

### 2. Run the workflow

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
- `featured` flag (manually set in JSONbin)
- `posted` date (original date job was first seen)
- `schedule` (if manually set)
- Custom `summary` edits

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

### JSONbin update fails
Verify secrets are set correctly in repository settings.

## Manual testing

To run locally:

```bash
cd scraper
npm install
npx playwright install chromium
JSONBIN_BIN_ID=your_bin_id JSONBIN_API_KEY=your_key npm run scrape
```

## Related

- **WordPress widget:** Elementor HTML widget that displays jobs from JSONbin
- **JSONbin:** [jsonbin.io](https://jsonbin.io) — Free JSON hosting with CORS support
- **Paycom portal:** React SPA with no public API
