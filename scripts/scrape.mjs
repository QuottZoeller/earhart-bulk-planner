#!/usr/bin/env node
// Fetches Earhart Dining Court menus for the next N days from Purdue's public
// HFS API, then backfills nutrition for any item IDs not already cached in
// data/nutrition.json. The nutrition cache is permanent: once an item ID is
// present it is never re-fetched, so this converges to near-zero network
// calls as the menu rotation repeats (Purdue reuses item IDs across weeks).
//
// Usage: node scripts/scrape.mjs [--days 14]

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const MENUS_PATH = path.join(DATA_DIR, 'menus.json');
const NUTRITION_PATH = path.join(DATA_DIR, 'nutrition.json');

const LOCATION = 'Earhart';
const API_BASE = 'https://api.hfs.purdue.edu/menus/v2';
const CONCURRENCY = 5;
const RETRY_DELAYS_MS = [500, 1500, 4000];

const args = process.argv.slice(2);
const daysArgIdx = args.indexOf('--days');
const DAYS = daysArgIdx !== -1 ? parseInt(args[daysArgIdx + 1], 10) : 14;

function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

function isoDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    }
  }
  throw lastErr;
}

async function loadJsonIfExists(filePath, fallback) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

// Map the Purdue Nutrition[] array (list of {Name, Value, LabelValue}) onto
// our flat field names. Only "Name" is a stable key across items -- ordinal
// position shifts, and several entries (e.g. "Calories from fat") carry only
// a LabelValue with no numeric Value.
const NUTRITION_FIELD_MAP = {
  Calories: 'calories',
  Protein: 'protein',
  'Total Carbohydrate': 'carbs',
  'Total fat': 'fat',
  'Saturated fat': 'saturatedFat',
  Sodium: 'sodium',
  'Dietary Fiber': 'fiber',
  Sugar: 'sugar',
  'Added Sugar': 'addedSugar',
  Cholesterol: 'cholesterol',
  Calcium: 'calcium',
  Iron: 'iron',
};

function parseNutritionRecord(itemDetail) {
  const record = {
    name: itemDetail.Name,
    isVegetarian: !!itemDetail.IsVegetarian,
    nutritionReady: !!itemDetail.NutritionReady,
    servingSize: null,
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
    saturatedFat: null,
    sodium: null,
    fiber: null,
    sugar: null,
    addedSugar: null,
    cholesterol: null,
    calcium: null,
    iron: null,
    allergens: null,
    ingredients: itemDetail.Ingredients ?? null,
  };

  if (Array.isArray(itemDetail.Allergens) && itemDetail.Allergens.length) {
    record.allergens = {};
    for (const a of itemDetail.Allergens) {
      record.allergens[a.Name] = !!a.Value;
    }
  }

  if (Array.isArray(itemDetail.Nutrition)) {
    for (const entry of itemDetail.Nutrition) {
      if (entry.Name === 'Serving Size') {
        record.servingSize = entry.LabelValue ?? null;
        continue;
      }
      const field = NUTRITION_FIELD_MAP[entry.Name];
      if (field && typeof entry.Value === 'number') {
        record[field] = entry.Value;
      }
    }
  }

  return record;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const nutritionCache = await loadJsonIfExists(NUTRITION_PATH, { updatedAt: null, items: {} });
  nutritionCache.items = nutritionCache.items || {};

  const days = [];
  const allItemStubs = new Map(); // id -> {name, isVegetarian, nutritionReady}

  const today = new Date();
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const apiDate = formatDate(d);
    let dayData;
    try {
      dayData = await fetchJson(`${API_BASE}/locations/${LOCATION}/${apiDate}`);
    } catch (err) {
      console.error(`Failed to fetch menu for ${apiDate}: ${err.message}`);
      continue;
    }

    if (!dayData.IsPublished || !Array.isArray(dayData.Meals)) {
      console.warn(`No published menu for ${apiDate}, skipping.`);
      continue;
    }

    const meals = dayData.Meals.map((meal) => ({
      name: meal.Name,
      type: meal.Type,
      status: meal.Status,
      order: meal.Order,
      stations: (meal.Stations || []).map((station) => ({
        name: station.Name,
        items: (station.Items || []).map((item) => {
          allItemStubs.set(item.ID, {
            name: item.Name,
            isVegetarian: !!item.IsVegetarian,
            nutritionReady: !!item.NutritionReady,
          });
          return item.ID;
        }),
      })),
    }));

    days.push({
      date: isoDate(d),
      dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'long' }),
      meals,
    });

    console.log(`Fetched ${apiDate}: ${meals.length} meals, ${allItemStubs.size} cumulative unique items`);
  }

  const idsNeedingFetch = [...allItemStubs.keys()].filter((id) => !(id in nutritionCache.items));
  console.log(`${idsNeedingFetch.length} item IDs not in cache, fetching nutrition...`);

  let fetched = 0;
  let failed = 0;
  await mapWithConcurrency(idsNeedingFetch, CONCURRENCY, async (id) => {
    try {
      const detail = await fetchJson(`${API_BASE}/items/${id}`);
      nutritionCache.items[id] = parseNutritionRecord(detail);
      fetched++;
    } catch (err) {
      // Leave uncached; will retry on the next scrape run. Fall back to the
      // stub info from the menu listing so the item still has a name.
      const stub = allItemStubs.get(id);
      console.error(`Failed to fetch nutrition for item ${id} (${stub?.name ?? 'unknown'}): ${err.message}`);
      failed++;
    }
  });

  console.log(`Nutrition fetch complete: ${fetched} fetched, ${failed} failed, ${idsNeedingFetch.length - fetched - failed} skipped.`);

  nutritionCache.updatedAt = new Date().toISOString();
  // Sort keys for stable, minimal diffs across daily commits.
  const sortedItems = {};
  for (const key of Object.keys(nutritionCache.items).sort()) {
    sortedItems[key] = nutritionCache.items[key];
  }
  nutritionCache.items = sortedItems;

  const menusOutput = {
    generatedAt: new Date().toISOString(),
    location: LOCATION,
    days,
  };

  await writeFile(MENUS_PATH, JSON.stringify(menusOutput, null, 2) + '\n');
  await writeFile(NUTRITION_PATH, JSON.stringify(nutritionCache, null, 2) + '\n');

  console.log(`Wrote ${MENUS_PATH} (${days.length} days) and ${NUTRITION_PATH} (${Object.keys(nutritionCache.items).length} cached items).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
