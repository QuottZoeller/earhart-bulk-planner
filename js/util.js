export function todayISO() {
  return dateToISO(new Date());
}

export function dateToISO(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return dateToISO(d);
}

export function formatDayLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  if (iso === today) return 'Today';
  if (iso === tomorrow) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Round to the nearest 0.5 -- self-serve buffet portions are never more
// precise than "about half a scoop" of resolution.
export function roundToHalfServing(n) {
  return Math.round(n * 2) / 2;
}

export function servingsLabel(n) {
  if (n === 0.5) return 'Half serving';
  if (n === 1) return '1 serving';
  return `${n} servings`;
}

// Buffet self-service means any single-number calorie total is false
// precision. Express as a +/-10% band, rounded to the nearest 25 kcal.
export function calorieRangeLabel(totalCalories) {
  const lo = Math.round((totalCalories * 0.9) / 25) * 25;
  const hi = Math.round((totalCalories * 1.1) / 25) * 25;
  return `${lo.toLocaleString()}-${hi.toLocaleString()} cal`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Deterministic seeded PRNG (mulberry32) so "regenerate" produces a
// reproducible-but-different ordering without pulling in a dependency.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle(array, seed) {
  const rng = mulberry32(seed);
  const out = array.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
