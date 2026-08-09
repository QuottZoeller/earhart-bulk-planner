// "What closes the gap" -- ranks candidate foods (today's remaining dining
// menu + saved My Foods) by how well a couple of servings would close the
// user's remaining calorie/protein gap for the day. Pure arithmetic, no AI.

// Rough Earhart meal-hour heuristic (the API's per-meal Hours string isn't
// captured by the scraper) used only to decide which of today's meals are
// still "ahead of you" for suggestion purposes.
export function remainingMealSlotsToday(now = new Date()) {
  const hour = now.getHours() + now.getMinutes() / 60;
  if (hour < 10.5) return ['breakfast', 'lunch', 'dinner'];
  if (hour < 14.5) return ['lunch', 'dinner'];
  if (hour < 20.5) return ['dinner'];
  return [];
}

function scoreCandidate(candidate, remainingCalories, remainingProtein) {
  const idealRatio = remainingCalories > 0 ? remainingProtein / remainingCalories : Infinity;
  const ratio = candidate.calories > 0 ? candidate.protein / candidate.calories : 0;
  // Closer protein-density match to what's needed scores better; heavily
  // penalize candidates that would blow well past the remaining calories.
  const ratioDistance = Math.abs(ratio - idealRatio);
  const overshoot = Math.max(0, candidate.calories - remainingCalories * 1.3) / 100;
  return ratioDistance * 10 + overshoot;
}

/**
 * @param candidates [{id, name, source: 'dining'|'myfood', calories, protein, servingSize}]
 */
export function suggestGapFillers(candidates, remainingCalories, remainingProtein, limit = 5) {
  if (remainingCalories <= 0) return [];
  const known = candidates.filter((c) => typeof c.calories === 'number' && typeof c.protein === 'number' && c.calories > 0);
  const ranked = known
    .map((c) => ({ ...c, score: scoreCandidate(c, remainingCalories, Math.max(0, remainingProtein)) }))
    .sort((a, b) => a.score - b.score);
  return ranked.slice(0, limit);
}
