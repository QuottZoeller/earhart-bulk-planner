import { getItem, setItem } from './storage.js';
import { uuid } from './util.js';

function keyFor(date) {
  return `log:${date}`;
}

export function getDayLog(date) {
  return getItem(keyFor(date), { date, weightLb: null, entries: [] });
}

function saveDayLog(date, log) {
  setItem(keyFor(date), log);
}

export function setWeight(date, weightLb) {
  const log = getDayLog(date);
  log.weightLb = weightLb;
  saveDayLog(date, log);
}

/**
 * @param entry { source, name, mealSlot, refId, servings, perServing: {calories,protein,carbs,fat}|null }
 * perServing = null means nutrition is genuinely unknown (e.g. a dining item
 * Purdue hasn't published nutrition for yet) -- never coerced to zero.
 */
export function addEntry(date, entry) {
  const log = getDayLog(date);
  const full = { id: uuid(), loggedAt: new Date().toISOString(), servings: 1, mealSlot: null, refId: null, ...entry };
  log.entries.push(full);
  saveDayLog(date, log);
  return full;
}

export function addEntries(date, entries) {
  const log = getDayLog(date);
  const full = entries.map((e) => ({ id: uuid(), loggedAt: new Date().toISOString(), servings: 1, mealSlot: null, refId: null, ...e }));
  log.entries.push(...full);
  saveDayLog(date, log);
  return full;
}

export function removeEntry(date, entryId) {
  const log = getDayLog(date);
  const idx = log.entries.findIndex((e) => e.id === entryId);
  if (idx === -1) return null;
  const [removed] = log.entries.splice(idx, 1);
  saveDayLog(date, log);
  return { removed, index: idx };
}

export function restoreEntry(date, entry, index) {
  const log = getDayLog(date);
  const at = Math.min(index ?? log.entries.length, log.entries.length);
  log.entries.splice(at, 0, entry);
  saveDayLog(date, log);
}

// Bulk removal for an entire logged meal group at once (e.g. "Ate this"
// tapped twice by mistake, or the wrong meal) -- undo restores the exact
// prior entries array rather than replaying individual inserts, so ordering
// and IDs come back exactly as they were.
export function removeEntriesBySlot(date, mealSlot) {
  const log = getDayLog(date);
  const snapshot = log.entries;
  const remaining = log.entries.filter((e) => (e.mealSlot || null) !== mealSlot);
  const removedCount = snapshot.length - remaining.length;
  log.entries = remaining;
  saveDayLog(date, log);
  return { removedCount, snapshot };
}

export function restoreEntriesSnapshot(date, snapshotEntries) {
  const log = getDayLog(date);
  log.entries = snapshotEntries;
  saveDayLog(date, log);
}

export function updateServings(date, entryId, servings) {
  const log = getDayLog(date);
  const entry = log.entries.find((e) => e.id === entryId);
  if (!entry) return;
  entry.servings = Math.max(0.5, servings);
  saveDayLog(date, log);
}

export function computeDayTotals(dayLog) {
  const totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let unknownCount = 0;
  for (const e of dayLog.entries) {
    if (!e.perServing) {
      unknownCount++;
      continue;
    }
    totals.calories += (e.perServing.calories || 0) * e.servings;
    totals.protein += (e.perServing.protein || 0) * e.servings;
    totals.carbs += (e.perServing.carbs || 0) * e.servings;
    totals.fat += (e.perServing.fat || 0) * e.servings;
  }
  return {
    calories: Math.round(totals.calories),
    protein: Math.round(totals.protein * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
    unknownCount,
  };
}

// Logs an entire generated plate (excluding fillers) in one shot for the
// "Ate this" one-tap flow. Macros are snapshotted at log time so later
// nutrition-cache updates never retroactively rewrite history.
export function logPlate(date, mealSlot, plate) {
  const entries = plate.plateItems.map((item) => ({
    source: 'dining',
    name: item.name,
    mealSlot,
    refId: item.id,
    servings: item.servings,
    perServing: {
      calories: item.calories / item.servings,
      protein: item.protein / item.servings,
      carbs: item.carbs != null ? item.carbs / item.servings : null,
      fat: item.fat != null ? item.fat / item.servings : null,
    },
  }));
  return addEntries(date, entries);
}
