# Earhart Bulk Planner

A mobile-first PWA that plans meals at Purdue's Earhart Dining Court to hit
daily calorie and protein targets for a lean bulk, and tracks what you
actually ate and weighed. No backend, no accounts, no paid services --
everything lives in your browser's localStorage, and menu/nutrition data is
static JSON committed to this repo and updated once a day by a GitHub Action.

## How it works

- **`scripts/scrape.mjs`** fetches Earhart's menu from Purdue's public HFS
  API for the next 14 days, then fetches nutrition for any item ID not
  already in `data/nutrition.json`. That cache is permanent -- once an item
  is fetched it's never re-requested, so after the ~2-week menu rotation
  cycles once, new scrapes cost only a handful of API calls.
- **`.github/workflows/update-menus.yml`** runs the scraper daily and commits
  `data/menus.json` + `data/nutrition.json` if they changed. This is also
  what sidesteps CORS: the frontend never talks to Purdue's API directly, it
  only ever reads static JSON from the same origin it's served from.
- **The frontend** (`index.html` + `js/*`) is vanilla ES modules, no build
  step, no framework. The meal planner (`js/planner.js`) is plain arithmetic
  -- rank by protein-per-calorie, greedily fill protein then calories, no AI
  involved anywhere.

## Local development

Requires Node 18+ (for the scraper's built-in `fetch`) and any static file
server for the frontend.

```bash
npm run scrape          # fetch latest menus + nutrition into data/
npm run generate-icons  # regenerate icons/ (only needed if you change the design)
npm run serve           # python3 -m http.server 8080 -- open http://localhost:8080
```

The frontend reads `data/menus.json` and `data/nutrition.json` directly, so
run the scraper at least once before serving locally.

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In **Settings → Pages**, set source to **Deploy from a branch**, branch
   `main`, folder `/ (root)`.
3. In **Settings → Actions → General → Workflow permissions**, select
   **Read and write permissions** so the daily scrape workflow can commit.
4. The `update-menus` workflow runs on its own daily; you can also trigger it
   manually from the Actions tab (**Run workflow**) any time.
5. Once Pages finishes its first deploy, install the app from your phone's
   browser (Safari: Share → Add to Home Screen; Chrome: menu → Install app).
   It works fully offline after the first load.

No secrets, API keys, or paid services are required anywhere in this stack.

## Settings you'll want to configure on first use

- **Bodyweight** -- drives both calorie target (bodyweight × 16-18,
  adjustable slider) and protein target (0.8 g/lb default), or override
  either manually.
- **Meals attended** -- unchecking a meal removes it from planning and
  splits the daily target across only the ones you check.
- **Dislikes** -- keyword substrings excluded from auto-planning.
- **Allergen exclusions** -- only applies to items Purdue publishes allergen
  data for.

## Known data limitations (not bugs)

- Purdue typically only publishes menus 7-10 days out, not the full 14 --
  the scraper and UI both handle unpublished days gracefully (grayed out in
  the day switcher, "menu not published yet" message).
- Milk is not itemized as a standalone menu entry in Purdue's data at all
  (dispensed beverages aren't tracked the way entrees are). The "if you're
  short" milk filler only appears on days the API happens to have a matching
  item; per the no-hardcoded-nutrition constraint, the app never fabricates
  a milk nutrition value to fill that slot.
- Some items are published with `NutritionReady: false` (no macros at all
  yet). These are excluded from auto-planning and shown separately as
  "unknown nutrition" -- they're never treated as zero calories, and you can
  still log them if you want (flagged and excluded from your totals).
- "Remaining meals today" (used for the Log tab's gap-filler suggestions) is
  a fixed clock-time heuristic (breakfast ends ~10:30am, lunch ~2:30pm,
  dinner ~8:30pm), not Purdue's actual published hours, since the scraper
  doesn't currently capture the per-meal `Hours` field.

## Data safety

Everything is stored in browser localStorage only -- clearing site data or
reinstalling the browser wipes it. Settings has:
- Export to JSON (full backup, used for import) and CSV (daily summary + raw
  log entries) any time.
- Import from a JSON backup (overwrites current data, with a confirmation).
- A banner reminding you to export if it's been 30+ days since your last one.

## Project structure

```
data/               menus.json + nutrition.json (committed, updated daily by CI)
scripts/scrape.mjs           the scraper
scripts/generate-icons.mjs   generates icons/ from scratch, no external assets
js/                  app modules (storage, settings, planner, log, weight, ...)
js/views/            one render function per tab (home, log, progress, settings)
css/app.css          mobile-first styling
sw.js, manifest.webmanifest, icons/   PWA plumbing
```
