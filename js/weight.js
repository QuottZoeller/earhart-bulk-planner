import { allKeys, getItem } from './storage.js';

const EWMA_ALPHA = 0.1;

function epochDays(dateISO) {
  return Math.floor(new Date(dateISO + 'T00:00:00').getTime() / 86400000);
}

/** All logged weight entries, chronological, from every log:<date> record. */
export function getWeightSeries() {
  const dates = allKeys()
    .filter((k) => k.startsWith('log:'))
    .map((k) => k.slice(4))
    .sort();
  const series = [];
  for (const date of dates) {
    const log = getItem(`log:${date}`, null);
    if (log && typeof log.weightLb === 'number') {
      series.push({ date, weight: log.weightLb });
    }
  }
  return series;
}

/**
 * Raw daily weight swings 2-4 lb on water/food/sodium and isn't signal on
 * its own -- the exponentially weighted moving average (alpha=0.1, i.e. it
 * takes roughly the trailing ~10 entries to mostly "catch up") is what the
 * app treats as ground truth for trend purposes. Computed over the sequence
 * of actual entries in order; a skipped day just means a bigger gap between
 * two points; effort is not made to interpolate missing days.
 */
export function computeEWMA(series, alpha = EWMA_ALPHA) {
  let ewma = null;
  return series.map((pt) => {
    ewma = ewma === null ? pt.weight : alpha * pt.weight + (1 - alpha) * ewma;
    return { ...pt, ewma: Math.round(ewma * 100) / 100 };
  });
}

function linearRegressionSlope(points) {
  // points: [{x, y}], returns slope in y-units per x-unit (day)
  const n = points.length;
  if (n < 2) return 0;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Trend rate in lb/week from the smoothed line (never raw endpoints), fit
 * by least-squares over the last `windowDays` of EWMA points.
 */
export function computeWeeklyTrend(ewmaSeries, windowDays = 21) {
  if (ewmaSeries.length < 2) return null;
  const cutoff = epochDays(ewmaSeries[ewmaSeries.length - 1].date) - windowDays;
  const windowed = ewmaSeries.filter((p) => epochDays(p.date) >= cutoff);
  if (windowed.length < 2) return null;
  const points = windowed.map((p) => ({ x: epochDays(p.date), y: p.ewma }));
  const slopePerDay = linearRegressionSlope(points);
  return Math.round(slopePerDay * 7 * 100) / 100;
}

const TARGET_BAND = { low: 0.25, high: 0.5 };

export function describeRate(rateLbPerWeek) {
  if (rateLbPerWeek === null) {
    return { status: 'unknown', text: 'Not enough weight entries yet to estimate a trend.' };
  }
  const abs = Math.abs(rateLbPerWeek).toFixed(2);
  if (rateLbPerWeek < 0) {
    return { status: 'low', text: `Losing ~${abs} lb/week — that's a deficit, the opposite of the bulk target.` };
  }
  if (rateLbPerWeek < TARGET_BAND.low) {
    return { status: 'low', text: `Gaining ~${abs} lb/week — below the ${TARGET_BAND.low}-${TARGET_BAND.high} lb/week range.` };
  }
  if (rateLbPerWeek <= TARGET_BAND.high) {
    return { status: 'good', text: `Gaining ~${abs} lb/week — on track.` };
  }
  return { status: 'high', text: `Gaining ~${abs} lb/week — above the target range; consider easing the surplus.` };
}

/**
 * Suggests a revised calorie target based on the observed rate vs. the
 * 0.25-0.5 lb/week band, using the actual average logged intake over the
 * same window rather than re-deriving from the bodyweight formula. Returns
 * null (with a reason) when there isn't enough data to trust the estimate.
 */
export function suggestCalorieAdjustment({ ewmaSeries, avgLoggedCalories, windowDays = 21 }) {
  if (ewmaSeries.length < 2) {
    return { suggested: null, reason: 'Not enough weight entries yet.' };
  }
  const spanDays = epochDays(ewmaSeries[ewmaSeries.length - 1].date) - epochDays(ewmaSeries[0].date);
  if (spanDays < 21) {
    return { suggested: null, reason: 'Needs 3+ weeks of weight data before suggesting a change.' };
  }
  if (!avgLoggedCalories) {
    return { suggested: null, reason: 'Not enough logged calorie data over this window.' };
  }
  const rate = computeWeeklyTrend(ewmaSeries, windowDays);
  if (rate === null) return { suggested: null, reason: 'Not enough weight data in this window.' };

  const targetMid = (TARGET_BAND.low + TARGET_BAND.high) / 2;
  const deltaLbPerWeek = targetMid - rate;
  const deltaKcalPerDay = (deltaLbPerWeek * 3500) / 7;
  const suggested = Math.round((avgLoggedCalories + deltaKcalPerDay) / 25) * 25;
  return { suggested, observedRate: rate, avgLoggedCalories, reason: null };
}
