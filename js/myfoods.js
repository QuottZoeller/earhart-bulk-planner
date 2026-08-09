import { getItem, setItem } from './storage.js';
import { uuid } from './util.js';

const KEY = 'myfoods';

export function listMyFoods() {
  return getItem(KEY, []);
}

export function addMyFood(food) {
  const list = listMyFoods();
  const full = { id: uuid(), ...food };
  list.push(full);
  setItem(KEY, list);
  return full;
}

export function updateMyFood(id, patch) {
  const list = listMyFoods();
  const idx = list.findIndex((f) => f.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  setItem(KEY, list);
}

export function removeMyFood(id) {
  const list = listMyFoods();
  const idx = list.findIndex((f) => f.id === id);
  if (idx === -1) return null;
  const [removed] = list.splice(idx, 1);
  setItem(KEY, list);
  return removed;
}

export function restoreMyFood(food, index) {
  const list = listMyFoods();
  const at = Math.min(index ?? list.length, list.length);
  list.splice(at, 0, food);
  setItem(KEY, list);
}
