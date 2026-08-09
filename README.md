# Earhart Bulk Planner

A mobile-first PWA that plans meals across Purdue's dining courts to hit
daily calorie and protein targets for a lean bulk, and tracks what you
actually ate and weighed. No backend, no accounts, no paid services --
everything lives in your browser's localStorage, and menu/nutrition data is
static JSON committed to this repo and updated once a day by a GitHub Action.

## How it works

- **`scripts/scrape.mjs`** fetches menus from Purdue's public HFS API for
  every location in `js/locations.js` (all 5 dining courts + all 3 Quick
  Bites) for the next 14 days, then fetches nutrition for any item ID not
  already in `data/nutrition.json`. That cache is shared across every
  location (Purdue reuses item IDs) and permanent -- once an item is fetched
  it's never re-requested, so after the ~2-week menu rotation cycles once,
  new scrapes cost only a handful of API calls.
- **`.github/workflows/update-menus.yml`** runs the scraper daily and commits
  `data/menus.json` + `data/nutrition.json` if they changed. This is also
  what sidesteps CORS: the frontend never talks to Purdue's API directly, it
  only ever reads static JSON from the same origin it's served from.
- **The frontend** (`index.html` + `js/*`) is vanilla ES modules, no build
  step, no framework. The meal planner (`js/planner.js`) is plain arithmetic
  -- rank by protein-per-calorie, greedily fill protein then calories, no AI
  involved anywhere.

## Locations

| Category | Locations |
|---|---|
| Dining courts (full planner) | Earhart, Ford, Hillenbrand, Wiley, Windsor |
| Quick Bites (catalog, not planned) | 1bowl (Meredith), Pete's Za (Tarkington), Sushi Boss (South) |
| On-the-GO! (manual catalog only) | Earhart, Ford, Lawson, Windsor |

**Why On-the-GO! is different:** verified against Purdue's own live site
(not just the REST API) that On-the-GO! locations publish no itemized daily
menu at all -- they're grab-and-go coolers/shelves, not a planned menu. There
is nothing for a scraper to fetch. Those items are entered once manually
under Log → Carry-Out, then logged in one tap forever after.

**Why Quick Bites don't get an auto-generated plate:** they do have real menu
data (same API, same schema as dining courts), but with a limited weekly
carry-out swipe allowance they're not something to plan a whole day's macros
around -- so they show up as a flat "tap to log what you got" catalog instead
of a generated plate, alongside the manual On-the-GO! items, both counted
against the same weekly swipe counter in Settings.

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
- **Dining locations you attend** -- which dining courts show up as location
  tabs on Home, and which Quick Bites show up under Log → Carry-Out. Only
  Earhart is on by default so existing setups don't suddenly change.
- **Carry-out swipes** -- weekly swipe allowance (default 8) and which day
  of the week the counter resets. Purely a local tally, not connected to any
  real Purdue system -- adjust it freely if it ever drifts from reality.
- **Dislikes** -- keyword substrings excluded from auto-planning.
- **Allergen exclusions** -- only applies to items Purdue publishes allergen
  data for.

## Known data limitations (not bugs)

- Purdue typically only publishes menus 7-10 days out, not the full 14 --
  the scraper and UI both handle unpublished days gracefully (grayed out in
  the day switcher, "menu not published yet" message). Some dining courts
  (e.g. Ford, Hillenbrand in early August) publish even fewer days out before
  the semester fully starts.
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
  dinner ~8:30pm), not each dining court's actual published hours, since the
  scraper doesn't currently capture the per-meal `Hours` field.
- Condiments/sauces/seasonings (by name pattern) are excluded from
  auto-planning and from gap-fill suggestions -- Purdue's nutrition data for
  a cup of stir-fry sauce is real, but nobody self-serves 1.5 cups of it as a
  "side." Same idea for near-zero-calorie garnish items in suggestions (a
  60-calorie floor keeps things like a single cabbage leaf from being
  suggested as a way to close a 1,000-calorie gap).

## Data safety

Everything is stored in browser localStorage only -- clearing site data or
reinstalling the browser wipes it. Settings has:
- Export to JSON (full backup, used for import) and CSV (daily summary + raw
  log entries) any time.
- Import from a JSON backup (overwrites current data, with a confirmation).
- A banner reminding you to export if it's been 30+ days since your last one.

Every destructive action (removing a logged item, clearing a whole meal
group, deleting a saved food) shows an undo toast for a few seconds rather
than deleting immediately -- including "Ate this," which logs several items
in one tap and is the easiest one to misfire.

## Project structure

```
data/               menus.json + nutrition.json (committed, updated daily by CI)
scripts/scrape.mjs           the scraper (all locations)
scripts/generate-icons.mjs   generates icons/ from scratch, no external assets
js/locations.js      shared location config (imported by both scraper and app)
js/carryout.js       On-the-GO! manual catalog + Quick Bites catalog + weekly swipe counter
js/                  other app modules (storage, settings, planner, log, weight, ...)
js/views/            one render function per tab (home, log, progress, settings)
css/app.css          mobile-first styling
sw.js, manifest.webmanifest, icons/   PWA plumbing
```
