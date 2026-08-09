import { getItem, setItem } from './storage.js';
import { resolveDay, itemsForMeal } from './api.js';
import { generatePlate } from './planner.js';
import { computeMealTargets } from './settings.js';

const MEAL_NAME_BY_SLOT = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

function keyFor(date) {
  return `plan:${date}`;
}

function getDayState(date) {
  return getItem(keyFor(date), { meals: {} });
}

function saveDayState(date, state) {
  setItem(keyFor(date), state);
}

function getMealState(date, mealName) {
  const state = getDayState(date);
  return state.meals[mealName] || { seed: 0, excludedIds: [] };
}

export function regenerateMeal(date, mealName) {
  const state = getDayState(date);
  const meal = state.meals[mealName] || { seed: 0, excludedIds: [] };
  meal.seed += 1;
  state.meals[mealName] = meal;
  saveDayState(date, state);
}

export function removeItemFromMeal(date, mealName, itemId) {
  const state = getDayState(date);
  const meal = state.meals[mealName] || { seed: 0, excludedIds: [] };
  if (!meal.excludedIds.includes(itemId)) meal.excludedIds.push(itemId);
  state.meals[mealName] = meal;
  saveDayState(date, state);
}

export function restoreItemToMeal(date, mealName, itemId) {
  const state = getDayState(date);
  const meal = state.meals[mealName];
  if (!meal) return;
  meal.excludedIds = meal.excludedIds.filter((id) => id !== itemId);
  state.meals[mealName] = meal;
  saveDayState(date, state);
}

/**
 * Builds the full day plan: one generated plate per attended meal, joined
 * against the live menu + nutrition cache and the user's current settings.
 * Returns null meals for days with no published menu data.
 */
export function buildDayPlan(date, menus, nutrition, settings) {
  const resolved = resolveDay(menus, nutrition, date);
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
    const mealState = getMealState(date, mealName);
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

  return { date, dayOfWeek: resolved?.dayOfWeek, published: !!resolved, meals };
}

export function mealSlotToName(slot) {
  return MEAL_NAME_BY_SLOT[slot];
}
