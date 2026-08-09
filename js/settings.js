import { getItem, setItem } from './storage.js';
import { LOCATIONS } from './locations.js';

const KEY = 'settings';

const DEFAULT_LOCATIONS = Object.fromEntries(LOCATIONS.map((l) => [l.slug, l.slug === 'earhart']));

const DEFAULTS = {
  bodyweightLb: null,
  // calorieMode: 'auto' derives target from bodyweight x multiplier; 'manual' uses calorieManual.
  calorieMode: 'auto',
  calorieMultiplier: 17, // slider range 16-18 for lean bulk
  calorieManual: null,
  proteinMode: 'auto',
  proteinPerLb: 0.8,
  proteinManual: null,
  mealsAttended: { breakfast: true, lunch: true, dinner: true },
  dislikes: [], // lowercase keyword substrings matched against item names
  allergenExclusions: [], // Purdue allergen names, e.g. "Peanuts"
  locations: DEFAULT_LOCATIONS, // dining courts + Quick Bites the user actually attends, by slug
  weekResetDay: 1, // 0=Sunday...6=Saturday. Used for the weekly carry-out swipe counter. Default Monday (common US meal-plan reset).
  weeklyCarryOutLimit: 8, // Purdue's unlimited plan carry-out swipe allowance; editable since plans vary.
  lastExportAt: null,
};

export function getSettings() {
  const stored = getItem(KEY, null);
  if (!stored) return { ...DEFAULTS };
  // Merge so new fields introduced later always have a default -- existing
  // users who never saw a "locations" field keep their prior single-location
  // (Earhart-only) behavior instead of suddenly seeing every hall enabled.
  return {
    ...DEFAULTS,
    ...stored,
    mealsAttended: { ...DEFAULTS.mealsAttended, ...(stored.mealsAttended || {}) },
    locations: { ...DEFAULT_LOCATIONS, ...(stored.locations || {}) },
  };
}

export function attendedLocationSlugs(settings) {
  return LOCATIONS.filter((l) => settings.locations[l.slug]).map((l) => l.slug);
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  setItem(KEY, next);
  return next;
}

export function attendedMealCount(settings) {
  return Object.values(settings.mealsAttended).filter(Boolean).length;
}

export function computeDailyTargets(settings) {
  const calorieTarget =
    settings.calorieMode === 'manual' && settings.calorieManual
      ? settings.calorieManual
      : Math.round((settings.bodyweightLb || 0) * settings.calorieMultiplier);

  const proteinTarget =
    settings.proteinMode === 'manual' && settings.proteinManual
      ? settings.proteinManual
      : Math.round((settings.bodyweightLb || 0) * settings.proteinPerLb);

  return { calorieTarget, proteinTarget };
}

// Even split across whichever meals the user actually attends. No implicit
// weighting toward dinner/breakfast -- the spec asks for a straight split.
export function computeMealTargets(settings) {
  const { calorieTarget, proteinTarget } = computeDailyTargets(settings);
  const count = attendedMealCount(settings) || 1;
  const perMeal = {
    calories: Math.round(calorieTarget / count),
    protein: Math.round(proteinTarget / count),
  };
  const out = {};
  for (const meal of ['breakfast', 'lunch', 'dinner']) {
    if (settings.mealsAttended[meal]) out[meal] = perMeal;
  }
  return { calorieTarget, proteinTarget, perMeal: out };
}
