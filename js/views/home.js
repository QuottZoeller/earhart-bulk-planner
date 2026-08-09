import { loadAll, publishedDatesForLocation } from '../api.js';
import { getSettings, attendedMealCount, attendedLocationSlugs } from '../settings.js';
import { buildDayPlan, regenerateMeal, removeItemFromMeal, restoreItemToMeal } from '../planState.js';
import { logPlate, getDayLog, addEntry, removeEntry, restoreEntry } from '../log.js';
import { remainingMealSlotsToday } from '../suggest.js';
import { locationBySlug } from '../locations.js';
import { todayISO, addDaysISO, formatDayLabel, servingsLabel, calorieRangeLabel } from '../util.js';
import { h, esc } from '../dom.js';
import { makeSwipeable } from '../swipe.js';
import { showToast, showUndoToast } from '../toast.js';
import { navigate } from '../router.js';

const DAY_SWITCHER_SPAN = 14;

function mealIcon(slot) {
  return { breakfast: '🍳', lunch: '🥪', dinner: '🍽' }[slot] || '🍴';
}

export async function renderHome(root, params) {
  const settings = getSettings();
  root.innerHTML = '';

  if (attendedMealCount(settings) === 0) {
    root.appendChild(
      h(`<div class="empty-state">No meals selected in Settings yet.<br><br>
        <button class="btn" id="go-settings">Go to Settings</button></div>`)
    );
    root.querySelector('#go-settings').addEventListener('click', () => navigate('#/settings'));
    return;
  }
  if (!settings.bodyweightLb) {
    root.appendChild(
      h(`<div class="empty-state">Add your bodyweight in Settings to compute targets.<br><br>
        <button class="btn" id="go-settings">Go to Settings</button></div>`)
    );
    root.querySelector('#go-settings').addEventListener('click', () => navigate('#/settings'));
    return;
  }

  const attendedLocs = attendedLocationSlugs(settings);
  if (!attendedLocs.length) {
    root.appendChild(
      h(`<div class="empty-state">No dining locations selected in Settings yet.<br><br>
        <button class="btn" id="go-settings">Go to Settings</button></div>`)
    );
    root.querySelector('#go-settings').addEventListener('click', () => navigate('#/settings'));
    return;
  }

  const date = params.get('date') || todayISO();
  const requestedLoc = params.get('loc');
  const locationSlug = attendedLocs.includes(requestedLoc) ? requestedLoc : attendedLocs[0];
  const { menus, nutrition } = await loadAll();

  root.appendChild(renderDaySwitcher(date, locationSlug, menus));
  if (attendedLocs.length > 1) {
    root.appendChild(renderLocationSwitcher(date, locationSlug, attendedLocs));
  }

  const plan = buildDayPlan(locationSlug, date, menus, nutrition, settings);
  const isToday = date === todayISO();
  const dayLog = getDayLog(date);

  if (!plan.published) {
    root.appendChild(h(`<div class="empty-state">${esc(locationBySlug(locationSlug)?.displayName)} hasn't published a menu for this day yet.<br>Check back closer to the date, or try another location above.</div>`));
    return;
  }

  let meals = plan.meals;
  if (isToday) {
    const remaining = remainingMealSlotsToday();
    meals = [...meals].sort((a, b) => {
      const ai = remaining.indexOf(a.slot);
      const bi = remaining.indexOf(b.slot);
      const aScore = ai === -1 ? 99 : ai;
      const bScore = bi === -1 ? 99 : bi;
      return aScore - bScore;
    });
  }

  const container = document.createElement('div');
  root.appendChild(container);

  for (const meal of meals) {
    container.appendChild(renderMealCard(meal, { date, isToday, dayLog, emphasize: isToday && meal === meals[0] }));
  }

  wireMealCardEvents(container, locationSlug, date, () => renderHome(root, params));
}

function renderDaySwitcher(selectedDate, locationSlug, menus) {
  const publishedDates = publishedDatesForLocation(menus, locationSlug);
  const wrap = h('<div class="day-switcher" id="day-switcher"></div>');
  for (let i = 0; i < DAY_SWITCHER_SPAN; i++) {
    const date = addDaysISO(todayISO(), i);
    const chip = h(`<button class="day-chip ${date === selectedDate ? 'active' : ''}" data-date="${date}">
      ${formatDayLabel(date)}${publishedDates.has(date) ? '' : ' <span class="muted">·</span>'}
    </button>`);
    if (!publishedDates.has(date)) chip.style.opacity = '0.55';
    chip.addEventListener('click', () => navigate(`#/home?date=${date}&loc=${locationSlug}`));
    wrap.appendChild(chip);
  }
  return wrap;
}

function renderLocationSwitcher(date, selectedSlug, attendedLocs) {
  const wrap = h('<div class="day-switcher" id="location-switcher"></div>');
  for (const slug of attendedLocs) {
    const loc = locationBySlug(slug);
    const chip = h(`<button class="day-chip ${slug === selectedSlug ? 'active' : ''}" data-loc="${slug}">${esc(loc.displayName)}</button>`);
    chip.addEventListener('click', () => navigate(`#/home?date=${date}&loc=${slug}`));
    wrap.appendChild(chip);
  }
  return wrap;
}

function macroLine(calories, protein) {
  return `${Math.round(calories)} cal · ${protein}g protein`;
}

function renderMealCard(meal, { date, isToday, dayLog, emphasize }) {
  const mealName = meal.mealName;
  const card = h(`<div class="card meal-card" data-meal="${mealName}" style="${emphasize ? 'border-color: var(--gold);' : ''}"></div>`);

  if (meal.unavailable) {
    card.appendChild(h(`<div class="card-title">${mealIcon(meal.slot)} ${mealName}</div>`));
    card.appendChild(h(`<div class="muted">Not served, or no menu published, for this day.</div>`));
    return card;
  }

  const { plate } = meal;
  const alreadyLogged = dayLog.entries.filter((e) => e.mealSlot === meal.slot && e.source === 'dining');
  const canLog = date <= todayISO();

  card.appendChild(
    h(`<div class="card-title"><span>${mealIcon(meal.slot)} ${mealName}</span>
      <span class="muted">${macroLine(plate.totals.calories, plate.totals.protein)}</span></div>`)
  );

  const proteinPct = Math.min(100, Math.round((plate.totals.protein / plate.targetProtein) * 100));
  card.appendChild(h(`
    <div class="muted" style="margin-bottom:4px;">Target: ${calorieRangeLabel(plate.targetCalories)} · ${plate.targetProtein}g protein</div>
    <div class="progress-track"><div class="progress-fill ${proteinPct > 130 ? 'over' : ''}" style="width:${Math.min(100, proteinPct)}%"></div></div>
  `));

  const list = h('<div class="plate-list" style="margin-top:10px;"></div>');
  if (!plate.plateItems.length) {
    list.appendChild(h('<div class="muted">No items available to plan with right now.</div>'));
  }
  for (const item of plate.plateItems) {
    list.appendChild(renderItemRow(item));
  }
  card.appendChild(list);

  {
    const fillerWrap = h('<div class="section-heading" style="margin-top:10px;margin-bottom:4px;">If you\'re short</div>');
    card.appendChild(fillerWrap);
    const fillerRow = h('<div class="btn-row"></div>');
    const milk = plate.fillers.find((f) => f.type === 'milk');
    const dessert = plate.fillers.find((f) => f.type === 'dessert');
    if (milk) {
      fillerRow.appendChild(h(`<button class="btn secondary sm filler-add" data-filler-id="${milk.id}" data-meal-slot="${meal.slot}">${esc(milk.name)} (+${milk.calories} cal)</button>`));
    } else {
      fillerRow.appendChild(h(`<span class="muted">Milk not itemized on today's menu data</span>`));
    }
    if (dessert) {
      fillerRow.appendChild(h(`<button class="btn secondary sm filler-add" data-filler-id="${dessert.id}" data-meal-slot="${meal.slot}">${esc(dessert.name)} (+${dessert.calories} cal)</button>`));
    }
    card.appendChild(fillerRow);
  }

  if (plate.unknownItems.length) {
    const details = h(`<details style="margin-top:10px;"><summary class="muted">${plate.unknownItems.length} item(s) with unknown nutrition (not counted)</summary></details>`);
    const ul = h('<div style="margin-top:6px;"></div>');
    for (const u of plate.unknownItems) {
      ul.appendChild(h(`<div class="btn-row" style="margin-bottom:6px;align-items:center;">
        <span class="muted" style="flex:1;">${esc(u.name)}</span>
        ${canLog ? `<button class="btn ghost sm log-unknown" data-item-id="${u.id}" data-item-name="${esc(u.name)}" data-meal-slot="${meal.slot}">Log anyway</button>` : ''}
      </div>`));
    }
    details.appendChild(ul);
    card.appendChild(details);
  }

  const actions = h('<div class="btn-row" style="margin-top:12px;"></div>');
  actions.appendChild(h(`<button class="btn secondary regenerate-btn" data-meal="${mealName}">↻ Regenerate</button>`));
  if (canLog) {
    actions.appendChild(
      h(`<button class="btn ate-this-btn" data-meal="${mealName}" data-meal-slot="${meal.slot}" ${!plate.plateItems.length ? 'disabled' : ''}>
        ${alreadyLogged.length ? 'Log again' : 'Ate this ✓'}
      </button>`)
    );
  }
  card.appendChild(actions);

  if (alreadyLogged.length) {
    card.appendChild(h(`<div class="muted" style="margin-top:8px;">Logged: ${alreadyLogged.length} item(s) from this meal today.</div>`));
  }

  return card;
}

function renderItemRow(item) {
  const row = h(`<div class="swipe-row" data-item-id="${item.id}">
    <div class="swipe-row-bg">Remove</div>
    <div class="swipe-row-content">
      <div>
        <div class="item-name">${esc(item.name)}</div>
        <div class="item-meta">${esc(item.station)} · ${servingsLabel(item.servings)}${item.servingSize ? ` (${esc(item.servingSize)})` : ''}</div>
      </div>
      <div class="item-macros">${item.calories} cal<br>${item.protein}g protein</div>
    </div>
  </div>`);
  return row;
}

function wireMealCardEvents(container, locationSlug, date, rerender) {
  container.querySelectorAll('.swipe-row').forEach((row) => {
    const itemId = row.dataset.itemId;
    const mealName = row.closest('.meal-card').dataset.meal;
    makeSwipeable(row, () => {
      const nameEl = row.querySelector('.item-name');
      const itemName = nameEl ? nameEl.textContent : 'Item';
      removeItemFromMeal(locationSlug, date, mealName, itemId);
      showUndoToast(`Removed ${itemName}`, () => {
        restoreItemToMeal(locationSlug, date, mealName, itemId);
        rerender();
      });
      rerender();
    });
  });

  container.querySelectorAll('.regenerate-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      regenerateMeal(locationSlug, date, btn.dataset.meal);
      rerender();
    });
  });

  container.querySelectorAll('.ate-this-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mealSlot = btn.dataset.mealSlot;
      // Re-derive the current plate from state so what gets logged matches
      // exactly what's on screen (including any swipes since page load).
      const { menus, nutrition } = await loadAll();
      const settings = getSettings();
      const plan = buildDayPlan(locationSlug, date, menus, nutrition, settings);
      const meal = plan.meals.find((m) => m.slot === mealSlot);
      if (!meal || meal.unavailable) return;
      const loggedEntries = logPlate(date, mealSlot, meal.plate);
      showUndoToast(`Logged ${loggedEntries.length} item(s) from ${meal.mealName}`, () => {
        loggedEntries.forEach((e) => removeEntry(date, e.id));
        rerender();
      });
      rerender();
    });
  });

  container.querySelectorAll('.filler-add').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { nutrition } = await loadAll();
      const rec = nutrition.items[btn.dataset.fillerId];
      if (!rec) return;
      const entry = addEntry(date, {
        source: 'dining',
        name: rec.name,
        mealSlot: btn.dataset.mealSlot,
        refId: btn.dataset.fillerId,
        servings: 1,
        perServing: { calories: rec.calories, protein: rec.protein, carbs: rec.carbs, fat: rec.fat },
      });
      showUndoToast(`Logged ${rec.name}`, () => { removeEntry(date, entry.id); rerender(); });
      rerender();
    });
  });

  container.querySelectorAll('.log-unknown').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entry = addEntry(date, {
        source: 'dining',
        name: btn.dataset.itemName,
        mealSlot: btn.dataset.mealSlot,
        refId: btn.dataset.itemId,
        servings: 1,
        perServing: null,
      });
      showUndoToast(`Logged ${btn.dataset.itemName} (unknown nutrition, not counted)`, () => { removeEntry(date, entry.id); rerender(); });
      rerender();
    });
  });
}
