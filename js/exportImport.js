import { dumpAll, restoreAll, allKeys, getItem } from './storage.js';

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function exportJSON() {
  const payload = { exportedAt: new Date().toISOString(), version: 1, data: dumpAll() };
  download(`earhart-bulk-planner-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

function csvEscape(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function exportDailySummaryCSV() {
  const dates = allKeys()
    .filter((k) => k.startsWith('log:'))
    .map((k) => k.slice(4))
    .sort();
  const rows = dates.map((date) => {
    const log = getItem(`log:${date}`, { entries: [] });
    let calories = 0, protein = 0, carbs = 0, fat = 0, unknown = 0;
    for (const e of log.entries) {
      if (!e.perServing) { unknown++; continue; }
      calories += (e.perServing.calories || 0) * e.servings;
      protein += (e.perServing.protein || 0) * e.servings;
      carbs += (e.perServing.carbs || 0) * e.servings;
      fat += (e.perServing.fat || 0) * e.servings;
    }
    return [date, log.weightLb ?? '', Math.round(calories), Math.round(protein * 10) / 10, Math.round(carbs * 10) / 10, Math.round(fat * 10) / 10, unknown];
  });
  const csv = toCsv(['date', 'weight_lb', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'unknown_nutrition_items'], rows);
  download(`earhart-bulk-planner-daily-summary-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
}

export function exportLogEntriesCSV() {
  const dates = allKeys()
    .filter((k) => k.startsWith('log:'))
    .map((k) => k.slice(4))
    .sort();
  const rows = [];
  for (const date of dates) {
    const log = getItem(`log:${date}`, { entries: [] });
    for (const e of log.entries) {
      rows.push([
        date,
        e.mealSlot || '',
        e.source,
        e.name,
        e.servings,
        e.perServing ? Math.round(e.perServing.calories * e.servings) : 'unknown',
        e.perServing ? Math.round(e.perServing.protein * e.servings * 10) / 10 : 'unknown',
        e.loggedAt,
      ]);
    }
  }
  const csv = toCsv(['date', 'meal', 'source', 'name', 'servings', 'calories', 'protein_g', 'logged_at'], rows);
  download(`earhart-bulk-planner-log-entries-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const data = parsed && parsed.data ? parsed.data : parsed;
  if (!data || typeof data !== 'object') throw new Error('File does not look like a backup.');
  restoreAll(data);
}
