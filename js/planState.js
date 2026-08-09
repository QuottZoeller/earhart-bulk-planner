import { getItem, setItem } from './storage.js';
import { resolveDay, itemsForMeal } from './api.js';
import { generatePlate } from './planner.js';
import { computeMealTargets } from './settings.js';

const MEAL_NAME_BY_SLOT = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

// Plan state (regenerate seed, swiped-away items) is scoped per
// location+date+meal so customizing Earhart's Monday lunch plate doesn't
// bleed into Windsor's Monday lunch plate.
function keyFor(locationSlug, date) {
  return `plan:${locationSlug}:${date}`;
}

function getDayState(locationSlug, date) {
  return getItem(keyFor(locationSlug, date), { meals: {} });
}

function saveDayState(locationSlug, date, state) {
  setItem(keyFor(locationSlug, date), state);
}

function getMealState(locationSlug, date, mealName) {
  const state = getDayState(locationSlug, date);
  return state.meals[mealName] || { seed: 0, excludedIds: [] };
}

export function regenerateMeal(locationSlug, date, mealName) {
  const state = getDayState(locationSlug, date);
  const meal = state.meals[mealName] || { seed: 0, excludedIds: [] };
  meal.seed += 1;
  state.meals[mealName] = meal;
  saveDayState(locationSlug, date, state);
}

export function removeItemFromMeal(locationSlug, date, mealName, itemId) {
  const state = getDayState(locationSlug, date);
  const meal = state.meals[mealName] || { seed: 0, excludedIds: [] };
  if (!meal.excludedIds.includes(itemId)) meal.excludedIds.push(itemId);
  state.meals[mealName] = meal;
  saveDayState(locationSlug, date, state);
}

export function restoreItemToMeal(locationSlug, date, mealName, itemId) {
  const state = getDayState(locationSlug, date);
  const meal = state.meals[mealName];
  if (!meal) return;
  meal.excludedIds = meal.excludedIds.filter((id) => id !== itemId);
  state.meals[mealName] = meal;
  saveDayState(locationSlug, date, state);
}

/**
 * Builds the full day plan for one location: one generated plate per
 * attended meal, joined against the live menu + nutrition cache and the
 * user's current settings. Returns null meals for days with no published
 * menu data.
 */
export function buildDayPlan(locationSlug, date, menus, nutrition, settings) {
  const resolved = resolveDay(menus, nutrition, locationSlug, date);
  const { perMeal } = computeMealTargets(settings);

  const meals = [];
  for (const [slot, mealName] of Object.entries(MEAL_NAME_BY_SLOT)) {
    if (!settings.mealsAttended[slot]) continue;
    const target = perMeal[slot];
    if (!target) continue;

    const resolvedMeal = resolved?.meals.find((m) => m.name === mealName);
    if (!resolvedMeal) {
      meals.push({ slot, mealName, unavailable: true, targetProtein: target.protein, targetCalories: target.calories });
      continue;
    }

    const items = itemsForMeal(resolvedMeal);
    const mealState = getMealState(locationSlug, date, mealName);
    const plate = generatePlate(items, {
      targetProtein: target.protein,
      targetCalories: target.calories,
      dislikes: settings.dislikes,
      allergenExclusions: settings.allergenExclusions,
      excludedIds: mealState.excludedIds,
      seed: mealState.seed,
    });

    meals.push({ slot, mealName, unavailable: false, plate });
  }

  return { date, locationSlug, dayOfWeek: resolved?.dayOfWeek, published: !!resolved, meals };
}

export function mealSlotToName(slot) {
  return MEAL_NAME_BY_SLOT[slot];
}
