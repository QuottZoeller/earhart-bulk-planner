// Loads the two static JSON files the GitHub Action keeps up to date.
// Cached in module state for the life of the page; the service worker is
// what makes these available offline across page loads.
let menusPromise = null;
let nutritionPromise = null;

export function loadMenus() {
  if (!menusPromise) {
    menusPromise = fetch('data/menus.json').then((r) => {
      if (!r.ok) throw new Error(`Failed to load menus.json: ${r.status}`);
      return r.json();
    });
  }
  return menusPromise;
}

export function loadNutrition() {
  if (!nutritionPromise) {
    nutritionPromise = fetch('data/nutrition.json').then((r) => {
      if (!r.ok) throw new Error(`Failed to load nutrition.json: ${r.status}`);
      return r.json();
    });
  }
  return nutritionPromise;
}

export async function loadAll() {
  const [menus, nutrition] = await Promise.all([loadMenus(), loadNutrition()]);
  return { menus, nutrition };
}

// Resolves a day's meals into fully-joined item objects (menu stub + cached
// nutrition record). Items whose nutrition was never fetched still appear,
// flagged unknown -- callers must not treat missing data as zero.
export function resolveDay(menus, nutrition, dateISO) {
  const day = menus.days.find((d) => d.date === dateISO);
  if (!day) return null;
  return {
    ...day,
    meals: day.meals.map((meal) => ({
      ...meal,
      stations: meal.stations.map((station) => ({
        ...station,
        items: station.items.map((itemId) => joinItem(itemId, station.name, nutrition)),
      })),
    })),
  };
}

export function joinItem(itemId, stationName, nutrition) {
  const rec = nutrition.items[itemId];
  if (!rec) {
    return {
      id: itemId,
      name: '(unknown item)',
      station: stationName,
      known: false,
      nutritionReady: false,
    };
  }
  const known = rec.nutritionReady && typeof rec.calories === 'number' && typeof rec.protein === 'number';
  return {
    id: itemId,
    name: rec.name,
    station: stationName,
    isVegetarian: rec.isVegetarian,
    nutritionReady: rec.nutritionReady,
    known,
    servingSize: rec.servingSize,
    calories: known ? rec.calories : null,
    protein: known ? rec.protein : null,
    carbs: known ? rec.carbs : null,
    fat: known ? rec.fat : null,
    allergens: rec.allergens,
  };
}

// Flattens a resolved day's meal into a deduplicated item list (an item can
// appear in multiple stations, e.g. "GF White Bread" under By Request).
export function itemsForMeal(resolvedMeal) {
  const seen = new Map();
  for (const station of resolvedMeal.stations) {
    for (const item of station.items) {
      if (!seen.has(item.id)) seen.set(item.id, item);
    }
  }
  return [...seen.values()];
}
