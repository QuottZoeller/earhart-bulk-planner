import { getItem, setItem } from './storage.js';
import { uuid, dateToISO } from './util.js';
import { resolveDay, itemsForMeal } from './api.js';
import { quickBitesLocations } from './locations.js';

const CATALOG_KEY = 'carryOutItems';

// ---- On-the-GO! manual catalog ----
// Purdue publishes no itemized menu for On-the-GO! locations at all (verified
// against their own live site, not just the REST API -- there is nothing to
// scrape). These entries are entered once, manually, then logged in one tap
// forever after, same idea as My Foods but kept separate so they can be
// grouped under "Carry-Out" and counted against the weekly swipe limit.
export function listCarryOutItems() {
  return getItem(CATALOG_KEY, []);
}

export function addCarryOutItem(item) {
  const list = listCarryOutItems();
  const full = { id: uuid(), onTheGoLocationSlug: null, ...item };
  list.push(full);
  setItem(CATALOG_KEY, list);
  return full;
}

export function removeCarryOutItem(id) {
  const list = listCarryOutItems();
  const idx = list.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  const [removed] = list.splice(idx, 1);
  setItem(CATALOG_KEY, list);
  return removed;
}

export function restoreCarryOutItem(item, index) {
  const list = listCarryOutItems();
  const at = Math.min(index ?? list.length, list.length);
  list.splice(at, 0, item);
  setItem(CATALOG_KEY, list);
}

// ---- Quick Bites: real menu data, read-only catalog view ----
// Quick Bites *do* publish real items via the same API as dining courts, so
// unlike On-the-GO! these are scraped, not manually entered. They're still
// presented as a flat tap-to-log catalog rather than run through the
// planner -- with only 8 carry-out swipes/week you're not trying to hit a
// macro target there, just grabbing something occasionally.
export function getQuickBitesItemsToday(menus, nutrition, attendedSlugs, dateISO) {
  const results = [];
  for (const loc of quickBitesLocations()) {
    if (!attendedSlugs.includes(loc.slug)) continue;
    const resolved = resolveDay(menus, nutrition, loc.slug, dateISO);
    if (!resolved) continue;
    for (const meal of resolved.meals) {
      for (const item of itemsForMeal(meal)) {
        if (!item.known) continue;
        results.push({
          id: item.id,
          name: item.name,
          locationSlug: loc.slug,
          locationDisplayName: loc.displayName,
          mealName: meal.name,
          servingSize: item.servingSize,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
        });
      }
    }
  }
  return results;
}

// ---- Weekly carry-out swipe counter ----
// Purely a local tally, not connected to any real Purdue system -- exposed
// with manual +/- so it can be corrected if it ever drifts from reality.
function weekKeyFor(date, weekResetDay) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - weekResetDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return dateToISO(d);
}

function swipesKey(weekResetDay, date = new Date()) {
  return `carryOutSwipes:${weekKeyFor(date, weekResetDay)}`;
}

export function getSwipeCount(weekResetDay, date = new Date()) {
  return getItem(swipesKey(weekResetDay, date), 0);
}

export function setSwipeCount(weekResetDay, count, date = new Date()) {
  setItem(swipesKey(weekResetDay, date), Math.max(0, count));
}

export function incrementSwipeCount(weekResetDay, date = new Date()) {
  setSwipeCount(weekResetDay, getSwipeCount(weekResetDay, date) + 1, date);
}

export function decrementSwipeCount(weekResetDay, date = new Date()) {
  setSwipeCount(weekResetDay, getSwipeCount(weekResetDay, date) - 1, date);
}
