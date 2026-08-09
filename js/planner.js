import { seededShuffle } from './util.js';

// Deterministic plate planner. No AI, no randomness beyond a seeded shuffle
// used only to produce a different-but-reasonable combination on "regenerate".
//
// Algorithm:
//   1. Filter out disliked/allergen-excluded/manually-removed/unknown-nutrition items.
//   2. Rank the rest by protein-per-calorie (descending) and greedily add
//      servings (0.5 increments, capped per item) until the meal's protein
//      target is met.
//   3. Switch to ranking by raw calorie density and greedily fill remaining
//      calories with starches/calorie-dense sides until the calorie target
//      is met.
//   4. Separately surface "if you're short" fillers: whole milk + a dessert,
//      never auto-added to the plate total.

const MAX_SERVINGS_PER_ITEM = 3;
const MAX_DISTINCT_ITEMS = 6;
const SERVING_STEP = 0.5;

function matchesDislike(item, dislikes) {
  const name = item.name.toLowerCase();
  return dislikes.some((kw) => kw && name.includes(kw.toLowerCase()));
}

// Condiments/seasonings/sauces have real calorie data in Purdue's API (a cup
// of stir-fry sauce is genuinely ~500 cal) but nobody self-serves 1.5 cups of
// sauce as a "side" -- they're additions to a real food, not a plate
// component. Excluded from automatic planning entirely; the planner should
// never suggest bulking up on condiments to hit a calorie target.
const CONDIMENT_RE = /\b(sauce|dressing|syrup|gravy|ketchup|mustard|mayo(?:nnaise)?|seasoning|spice|oregano|cinnamon|sprinkles?|salt|jelly|jam|honey|creamer|vinegar|relish)\b/i;

export function isCondiment(item) {
  return CONDIMENT_RE.test(item.name);
}

function matchesExcludedAllergen(item, allergenExclusions) {
  if (!item.allergens || !allergenExclusions.length) return false;
  return allergenExclusions.some((a) => item.allergens[a] === true);
}

function proteinPerCalorie(item) {
  if (!item.calories || item.calories <= 0) return 0;
  return item.protein / item.calories;
}

// Sorts by `keyFn` descending, but seed-shuffles within the top `poolSize`
// so "regenerate" cycles among the several best options instead of always
// re-picking the single dominant item (e.g. a very protein-dense entree
// would otherwise win for every seed and "regenerate" would look like a
// no-op).
function rankWithVariety(list, keyFn, seed, poolSize = 6) {
  const sorted = [...list].sort((a, b) => keyFn(b) - keyFn(a));
  const pool = seededShuffle(sorted.slice(0, poolSize), seed);
  return [...pool, ...sorted.slice(poolSize)];
}

function isMilk(item) {
  return /\bwhole milk\b/i.test(item.name) || /\bmilk\b/i.test(item.name);
}

function isDessert(item) {
  return (
    /pastry shop/i.test(item.station) ||
    /dessert/i.test(item.station) ||
    /(cookie|cake|pie|ice cream|pudding|brownie|italian ice|sundae)/i.test(item.name)
  );
}

function filler(item) {
  return {
    id: item.id,
    name: item.name,
    servingSize: item.servingSize,
    calories: Math.round(item.calories),
    protein: Math.round(item.protein * 10) / 10,
  };
}

function pickFiller(items, predicate) {
  const candidates = items.filter(predicate).filter((i) => i.known);
  if (!candidates.length) return null;
  // Prefer "whole milk" literally when picking milk; otherwise first known match.
  const wholeMilk = candidates.find((i) => /whole milk/i.test(i.name));
  return wholeMilk || candidates[0];
}

/**
 * @param {Array} items - resolved items available at this meal (from api.itemsForMeal)
 * @param {Object} opts
 *   targetProtein, targetCalories: numbers
 *   dislikes: string[]
 *   allergenExclusions: string[]
 *   excludedIds: string[] - manually swiped-away item ids for this meal/day
 *   seed: number - regenerate seed
 */
export function generatePlate(items, opts) {
  const { targetProtein, targetCalories, dislikes = [], allergenExclusions = [], excludedIds = [], seed = 0 } = opts;

  const excludedSet = new Set(excludedIds);
  const unknownItems = items.filter((i) => !i.known);

  const eligible = items.filter(
    (i) =>
      i.known &&
      !excludedSet.has(i.id) &&
      !isCondiment(i) &&
      !matchesDislike(i, dislikes) &&
      !matchesExcludedAllergen(i, allergenExclusions)
  );

  const plate = new Map(); // id -> { item, servings }
  let runningProtein = 0;
  let runningCalories = 0;

  function addServing(item) {
    const entry = plate.get(item.id) || { item, servings: 0 };
    entry.servings += SERVING_STEP;
    plate.set(item.id, entry);
    runningProtein += item.protein * SERVING_STEP;
    runningCalories += item.calories * SERVING_STEP;
  }

  // Phase A: protein-first.
  const byProteinDensity = rankWithVariety(eligible, proteinPerCalorie, seed);
  for (const item of byProteinDensity) {
    if (runningProtein >= targetProtein) break;
    if (plate.size >= MAX_DISTINCT_ITEMS) break;
    if (item.protein <= 0) continue;
    let servingsAdded = 0;
    while (
      runningProtein < targetProtein &&
      servingsAdded < MAX_SERVINGS_PER_ITEM / SERVING_STEP &&
      runningCalories < targetCalories * 1.15
    ) {
      addServing(item);
      servingsAdded++;
    }
  }

  // Phase B: fill remaining calories with calorie-dense sides/starches,
  // preferring items not already on the plate.
  const byCalorieDensity = rankWithVariety(
    eligible.filter((i) => !plate.has(i.id)),
    (i) => i.calories,
    seed + 1000
  );
  for (const item of byCalorieDensity) {
    if (runningCalories >= targetCalories) break;
    if (plate.size >= MAX_DISTINCT_ITEMS) break;
    if (item.calories <= 0) continue;
    let servingsAdded = 0;
    while (
      runningCalories < targetCalories &&
      servingsAdded < MAX_SERVINGS_PER_ITEM / SERVING_STEP &&
      plate.size <= MAX_DISTINCT_ITEMS
    ) {
      addServing(item);
      servingsAdded++;
    }
  }

  const plateItems = [...plate.values()].map(({ item, servings }) => ({
    id: item.id,
    name: item.name,
    station: item.station,
    servingSize: item.servingSize,
    servings,
    calories: Math.round(item.calories * servings),
    protein: Math.round(item.protein * servings * 10) / 10,
    carbs: item.carbs != null ? Math.round(item.carbs * servings * 10) / 10 : null,
    fat: item.fat != null ? Math.round(item.fat * servings * 10) / 10 : null,
  }));

  const totals = plateItems.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      protein: acc.protein + i.protein,
      carbs: acc.carbs + (i.carbs || 0),
      fat: acc.fat + (i.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  // Purdue's menu data frequently has no standalone "milk" item at all --
  // dispensed beverages aren't itemized the way entrees are. We only ever
  // surface a milk filler when the API actually gave us one; we do not
  // hardcode a fallback nutrition value for it (that would violate "no
  // hardcoded nutrition"). The UI shows an explicit "not on today's menu
  // data" note when this comes back null.
  const milk = pickFiller(items.filter((i) => !excludedSet.has(i.id)), isMilk);
  const dessert = pickFiller(
    items.filter((i) => !excludedSet.has(i.id)),
    (i) => isDessert(i) && !isMilk(i)
  );
  const fillers = [
    milk && { ...filler(milk), type: 'milk' },
    dessert && { ...filler(dessert), type: 'dessert' },
  ].filter(Boolean);

  return {
    targetProtein,
    targetCalories,
    plateItems,
    totals: {
      calories: Math.round(totals.calories),
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
    },
    fillers,
    unknownItems: unknownItems.map((i) => ({ id: i.id, name: i.name, station: i.station })),
  };
}
