import { allKeys, getItem } from './storage.js';
import { computeDailyTargets } from './settings.js';
import { computeDayTotals } from './log.js';
import { todayISO, addDaysISO, calorieRangeLabel } from './util.js';

/**
 * Aggregate stats over the trailing `windowDays` calendar days (adherence is
 * computed against every day that has elapsed, not just days you happened to
 * log -- an unlogged day counts against adherence, same as a day that missed
 * target).
 */
export function computeHistoryStats(windowDays, settings) {
  const { calorieTarget, proteinTarget } = computeDailyTargets(settings);
  const today = todayISO();
  const startDate = addDaysISO(today, -(windowDays - 1));

  let daysWithData = 0;
  let calorieSum = 0;
  let proteinSum = 0;
  let adherentDays = 0;
  let elapsedDays = 0;

  const [rangeLo, rangeHi] = calorieTarget
    ? [Math.round(calorieTarget * 0.9), Math.round(calorieTarget * 1.1)]
    : [0, Infinity];

  for (let i = 0; i < windowDays; i++) {
    const date = addDaysISO(startDate, i);
    if (date > today) break;
    elapsedDays++;
    const log = getItem(`log:${date}`, null);
    if (!log || !log.entries.length) continue;
    const totals = computeDayTotals(log);
    daysWithData++;
    calorieSum += totals.calories;
    proteinSum += totals.protein;
    const hitCalories = totals.calories >= rangeLo && totals.calories <= rangeHi;
    const hitProtein = proteinTarget ? totals.protein >= proteinTarget * 0.9 : true;
    if (hitCalories && hitProtein) adherentDays++;
  }

  return {
    windowDays,
    elapsedDays,
    daysWithData,
    avgCalories: daysWithData ? Math.round(calorieSum / daysWithData) : null,
    avgProtein: daysWithData ? Math.round((proteinSum / daysWithData) * 10) / 10 : null,
    adherencePercent: elapsedDays ? Math.round((adherentDays / elapsedDays) * 100) : null,
    calorieTarget,
    proteinTarget,
    calorieRangeLabel: calorieTarget ? calorieRangeLabel(calorieTarget) : null,
  };
}
