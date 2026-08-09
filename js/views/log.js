import { loadAll, itemsForMeal, resolveDay } from '../api.js';
import { getSettings, computeDailyTargets, attendedLocationSlugs } from '../settings.js';
import { getDayLog, computeDayTotals, addEntry, removeEntry, restoreEntry, updateServings, removeEntriesBySlot, restoreEntriesSnapshot } from '../log.js';
import { listMyFoods, addMyFood, removeMyFood, restoreMyFood } from '../myfoods.js';
import { lookupBarcode, getCachedProduct, isBarcodeDetectorSupported, startScanner } from '../barcode.js';
import { suggestGapFillers, remainingMealSlotsToday } from '../suggest.js';
import { isCondiment } from '../planner.js';
import {
  listCarryOutItems, addCarryOutItem, removeCarryOutItem, restoreCarryOutItem,
  getQuickBitesItemsToday, getSwipeCount, incrementSwipeCount, decrementSwipeCount, setSwipeCount,
} from '../carryout.js';
import { diningLocations, ON_THE_GO_LOCATIONS } from '../locations.js';
import { todayISO, servingsLabel, calorieRangeLabel } from '../util.js';
import { h, esc } from '../dom.js';
import { makeSwipeable } from '../swipe.js';
import { showToast, showUndoToast } from '../toast.js';
import { openModal } from '../modal.js';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', null];
const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', null: 'Other' };

export async function renderLog(root) {
  const date = todayISO();
  const settings = getSettings();
  const { calorieTarget, proteinTarget } = computeDailyTargets(settings);
  const { menus, nutrition } = await loadAll();

  async function rerender() {
    root.innerHTML = '';
    root.appendChild(await buildView());
  }

  async function buildView() {
    const dayLog = getDayLog(date);
    const totals = computeDayTotals(dayLog);
    const frag = document.createDocumentFragment();

    frag.appendChild(renderTotalsCard(totals, calorieTarget, proteinTarget));

    const remainingCalories = calorieTarget - totals.calories;
    const remainingProtein = proteinTarget - totals.protein;
    frag.appendChild(buildSuggestionSection(date, menus, nutrition, dayLog, remainingCalories, remainingProtein, rerender));

    frag.appendChild(buildEntriesSection(date, dayLog, rerender));

    frag.appendChild(buildAddActionsSection(date, rerender));

    frag.appendChild(await buildCarryOutSection(date, settings, menus, nutrition, rerender));

    frag.appendChild(buildMyFoodsSection(date, rerender));

    return frag;
  }

  await rerender();
}

function renderTotalsCard(totals, calorieTarget, proteinTarget) {
  const calPct = calorieTarget ? Math.min(100, Math.round((totals.calories / calorieTarget) * 100)) : 0;
  const proPct = proteinTarget ? Math.min(100, Math.round((totals.protein / proteinTarget) * 100)) : 0;
  const remCal = calorieTarget - totals.calories;
  const remPro = Math.round((proteinTarget - totals.protein) * 10) / 10;

  const card = h(`<div class="card">
    <div class="card-title"><span>Today</span><span class="muted">${calorieTarget ? calorieRangeLabel(calorieTarget) + ' target' : 'Set targets in Settings'}</span></div>
    <div class="totals-grid">
      <div>
        <div class="muted">Calories</div>
        <div style="font-size:20px;font-weight:700;">${totals.calories.toLocaleString()}</div>
        <div class="progress-track"><div class="progress-fill ${calPct >= 100 && totals.calories > calorieTarget * 1.15 ? 'over' : ''}" style="width:${calPct}%"></div></div>
        <div class="muted">${remCal > 0 ? `${remCal.toLocaleString()} remaining` : `${Math.abs(remCal).toLocaleString()} over`}</div>
      </div>
      <div>
        <div class="muted">Protein</div>
        <div style="font-size:20px;font-weight:700;">${totals.protein}g</div>
        <div class="progress-track"><div class="progress-fill" style="width:${proPct}%"></div></div>
        <div class="muted">${remPro > 0 ? `${remPro}g remaining` : `${Math.abs(remPro)}g over`}</div>
      </div>
    </div>
    ${totals.unknownCount ? `<div class="callout warn" style="margin-top:10px;">${totals.unknownCount} logged item(s) have unknown nutrition and are excluded from these totals.</div>` : ''}
  </div>`);
  return card;
}

function buildSuggestionSection(date, menus, nutrition, dayLog, remainingCalories, remainingProtein, rerender) {
  const wrap = h('<div></div>');
  if (remainingCalories <= 0) {
    wrap.appendChild(h(`<div class="callout good">You've hit today's calorie target.</div>`));
    return wrap;
  }

  const loggedRefIds = new Set(dayLog.entries.map((e) => e.refId).filter(Boolean));
  const remainingSlots = remainingMealSlotsToday();
  const settings = getSettings();
  // Quick Bites / On-the-GO! are deliberately excluded here -- with only a
  // handful of carry-out swipes/week those aren't meant to be planned
  // around to hit a macro target, just tapped from the Carry-Out catalog
  // below when you happen to use one.
  const attendedDiningSlugs = attendedLocationSlugs(settings).filter((slug) => diningLocations().some((l) => l.slug === slug));
  const candidates = [];
  for (const locSlug of attendedDiningSlugs) {
    const day = resolveDay(menus, nutrition, locSlug, date);
    if (!day) continue;
    for (const meal of day.meals) {
      const slot = meal.name.toLowerCase();
      if (!remainingSlots.includes(slot)) continue;
      for (const item of itemsForMeal(meal)) {
        if (!item.known || loggedRefIds.has(item.id) || isCondiment(item)) continue;
        candidates.push({ id: item.id, name: item.name, source: 'dining', mealSlot: slot, calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, servingSize: item.servingSize });
      }
    }
  }
  for (const food of listMyFoods()) {
    candidates.push({ id: food.id, name: food.name, source: 'myfood', calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, servingSize: food.servingDesc });
  }

  const suggestions = suggestGapFillers(candidates, remainingCalories, remainingProtein, 4);
  if (!suggestions.length) return wrap;

  wrap.appendChild(h('<div class="section-heading">What closes the gap</div>'));
  const card = h('<div class="card"></div>');
  for (const s of suggestions) {
    const row = h(`<div class="btn-row" style="justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div>
        <div class="item-name">${esc(s.name)}</div>
        <div class="item-meta">${s.source === 'myfood' ? 'My Foods' : esc(s.mealSlot || '')} · ${Math.round(s.calories)} cal · ${Math.round(s.protein * 10) / 10}g protein</div>
      </div>
      <button class="btn sm suggestion-add">Add</button>
    </div>`);
    row.querySelector('.suggestion-add').addEventListener('click', () => {
      const entry = addEntry(date, {
        source: s.source,
        name: s.name,
        mealSlot: s.mealSlot || null,
        refId: s.id,
        servings: 1,
        perServing: { calories: s.calories, protein: s.protein, carbs: s.carbs ?? null, fat: s.fat ?? null },
      });
      showUndoToast(`Logged ${s.name}`, async () => { removeEntry(date, entry.id); await rerender(); });
      rerender();
    });
    card.appendChild(row);
  }
  wrap.appendChild(card);
  return wrap;
}

function buildEntriesSection(date, dayLog, rerender) {
  const wrap = h('<div></div>');
  if (!dayLog.entries.length) {
    wrap.appendChild(h('<div class="section-heading">Logged today</div>'));
    wrap.appendChild(h('<div class="empty-state">Nothing logged yet today.</div>'));
    return wrap;
  }

  wrap.appendChild(h('<div class="section-heading">Logged today</div>'));
  for (const slot of MEAL_ORDER) {
    const entries = dayLog.entries.filter((e) => (e.mealSlot || null) === slot);
    if (!entries.length) continue;
    const groupHeader = h(`<div class="btn-row" style="justify-content:space-between;align-items:center;margin:8px 0 4px;">
      <span style="font-weight:700;">${MEAL_LABEL[slot]}</span>
      <button class="link-btn clear-group-btn" style="padding:2px 0;font-size:12.5px;">Clear</button>
    </div>`);
    groupHeader.querySelector('.clear-group-btn').addEventListener('click', () => {
      const { removedCount, snapshot } = removeEntriesBySlot(date, slot);
      if (!removedCount) return;
      showUndoToast(`Removed ${removedCount} item(s) from ${MEAL_LABEL[slot]}`, () => {
        restoreEntriesSnapshot(date, snapshot);
        rerender();
      });
      rerender();
    });
    wrap.appendChild(groupHeader);
    for (const entry of entries) {
      wrap.appendChild(renderLogRow(date, entry, rerender));
    }
  }
  return wrap;
}

function renderLogRow(date, entry, rerender) {
  const known = !!entry.perServing;
  const calories = known ? Math.round(entry.perServing.calories * entry.servings) : null;
  const protein = known ? Math.round(entry.perServing.protein * entry.servings * 10) / 10 : null;

  const row = h(`<div class="swipe-row" data-entry-id="${entry.id}">
    <div class="swipe-row-bg">Remove</div>
    <div class="swipe-row-content">
      <div style="flex:1;">
        <div class="item-name">${esc(entry.name)}${!known ? '<span class="badge">unknown</span>' : ''}</div>
        <div class="item-meta">${known ? `${calories} cal · ${protein}g protein` : 'Nutrition not available'}</div>
      </div>
      <div class="stepper">
        <button class="dec">−</button>
        <span>${servingsLabel(entry.servings)}</span>
        <button class="inc">+</button>
      </div>
    </div>
  </div>`);

  row.querySelector('.dec').addEventListener('click', () => {
    updateServings(date, entry.id, Math.max(0.5, entry.servings - 0.5));
    rerender();
  });
  row.querySelector('.inc').addEventListener('click', () => {
    updateServings(date, entry.id, entry.servings + 0.5);
    rerender();
  });

  makeSwipeable(row, () => {
    const { removed, index } = removeEntry(date, entry.id) || {};
    showUndoToast(`Removed ${entry.name}`, () => {
      if (removed) restoreEntry(date, removed, index);
      rerender();
    });
    rerender();
  });

  return row;
}

function buildAddActionsSection(date, rerender) {
  const wrap = h('<div class="section-heading">Add</div>');
  const row = h('<div class="btn-row"></div>');
  row.appendChild(h('<button class="btn secondary" id="btn-quick-add">+ Quick add</button>'));
  row.appendChild(h('<button class="btn secondary" id="btn-scan-barcode">📷 Scan barcode</button>'));
  const section = h('<div></div>');
  section.appendChild(wrap);
  section.appendChild(row);

  row.querySelector('#btn-quick-add').addEventListener('click', () => openQuickAddModal(date, rerender));
  row.querySelector('#btn-scan-barcode').addEventListener('click', () => openBarcodeModal(date, rerender));

  return section;
}

function buildMyFoodsSection(date, rerender) {
  const wrap = h('<div></div>');
  wrap.appendChild(h('<div class="section-heading">My Foods</div>'));
  const card = h('<div class="card"></div>');
  const foods = listMyFoods();
  if (!foods.length) {
    card.appendChild(h('<div class="muted">No saved foods yet.</div>'));
  }
  for (const food of foods) {
    const row = h(`<div class="swipe-row" data-food-id="${food.id}">
      <div class="swipe-row-bg">Delete</div>
      <div class="swipe-row-content">
        <div style="flex:1;">
          <div class="item-name">${esc(food.name)}</div>
          <div class="item-meta">${esc(food.servingDesc || '')} · ${food.calories} cal · ${food.protein}g protein</div>
        </div>
        <button class="btn sm log-myfood">Log</button>
      </div>
    </div>`);
    row.querySelector('.log-myfood').addEventListener('click', () => {
      const entry = addEntry(date, {
        source: 'myfood',
        name: food.name,
        mealSlot: null,
        refId: food.id,
        servings: 1,
        perServing: { calories: food.calories, protein: food.protein, carbs: food.carbs ?? null, fat: food.fat ?? null },
      });
      showUndoToast(`Logged ${food.name}`, () => removeEntry(date, entry.id));
      rerender();
    });
    makeSwipeable(row, () => {
      const removed = removeMyFood(food.id);
      showUndoToast(`Deleted ${food.name}`, () => { if (removed) restoreMyFood(removed); rerender(); });
      rerender();
    });
    card.appendChild(row);
  }
  card.appendChild(h('<button class="link-btn" id="btn-add-myfood">+ Add a food</button>'));
  wrap.appendChild(card);

  card.querySelector('#btn-add-myfood').addEventListener('click', () => openAddMyFoodModal(rerender));
  return wrap;
}

// Quick Bites (real API data) + On-the-GO! (manually-curated catalog, since
// Purdue publishes no menu for those at all) share one section because both
// draw against the same weekly carry-out swipe allowance on the unlimited
// plan. Neither runs through the planner -- these are occasional grabs, not
// something to hit a macro target with.
async function buildCarryOutSection(date, settings, menus, nutrition, rerender) {
  const wrap = h('<div></div>');
  wrap.appendChild(h('<div class="section-heading">Carry-Out (On-the-GO! / Quick Bites)</div>'));

  const used = getSwipeCount(settings.weekResetDay);
  const limit = settings.weeklyCarryOutLimit;
  const counterCard = h(`<div class="card">
    <div class="btn-row" style="justify-content:space-between;align-items:center;">
      <div>
        <div class="item-name">${used}/${limit} swipes used this week</div>
        <div class="muted">Local counter only, not connected to Purdue. Adjust freely if it drifts.</div>
      </div>
      <div class="stepper">
        <button class="swipe-dec">−</button>
        <button class="swipe-inc">+</button>
      </div>
    </div>
  </div>`);
  counterCard.querySelector('.swipe-dec').addEventListener('click', () => { decrementSwipeCount(settings.weekResetDay); rerender(); });
  counterCard.querySelector('.swipe-inc').addEventListener('click', () => { incrementSwipeCount(settings.weekResetDay); rerender(); });
  wrap.appendChild(counterCard);

  const attended = attendedLocationSlugs(settings);
  const quickBitesToday = getQuickBitesItemsToday(menus, nutrition, attended, date);
  const catalog = listCarryOutItems();

  const card = h('<div class="card"></div>');
  if (!quickBitesToday.length && !catalog.length) {
    card.appendChild(h('<div class="muted">No Quick Bites menu published for today, and no On-the-GO! items saved yet.</div>'));
  }

  for (const item of quickBitesToday) {
    const row = h(`<div class="btn-row" style="justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div>
        <div class="item-name">${esc(item.name)}</div>
        <div class="item-meta">${esc(item.locationDisplayName)} · ${item.mealName} · ${Math.round(item.calories)} cal · ${Math.round(item.protein * 10) / 10}g protein</div>
      </div>
      <button class="btn sm qb-log">Log</button>
    </div>`);
    row.querySelector('.qb-log').addEventListener('click', () => {
      const entry = addEntry(date, {
        source: 'quickbites',
        name: item.name,
        mealSlot: item.mealName.toLowerCase(),
        refId: item.id,
        servings: 1,
        perServing: { calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat },
      });
      incrementSwipeCount(settings.weekResetDay);
      showUndoToast(`Logged ${item.name} (1 carry-out swipe used)`, () => {
        removeEntry(date, entry.id);
        decrementSwipeCount(settings.weekResetDay);
        rerender();
      });
      rerender();
    });
    card.appendChild(row);
  }

  for (const item of catalog) {
    const row = h(`<div class="swipe-row" data-carryout-id="${item.id}">
      <div class="swipe-row-bg">Delete</div>
      <div class="swipe-row-content">
        <div style="flex:1;">
          <div class="item-name">${esc(item.name)}</div>
          <div class="item-meta">${esc(item.servingDesc || 'On-the-GO!')} · ${item.calories} cal · ${item.protein}g protein</div>
        </div>
        <button class="btn sm otg-log">Log</button>
      </div>
    </div>`);
    row.querySelector('.otg-log').addEventListener('click', () => {
      const entry = addEntry(date, {
        source: 'onthego',
        name: item.name,
        mealSlot: null,
        refId: item.id,
        servings: 1,
        perServing: { calories: item.calories, protein: item.protein, carbs: item.carbs ?? null, fat: item.fat ?? null },
      });
      incrementSwipeCount(settings.weekResetDay);
      showUndoToast(`Logged ${item.name} (1 carry-out swipe used)`, () => {
        removeEntry(date, entry.id);
        decrementSwipeCount(settings.weekResetDay);
        rerender();
      });
      rerender();
    });
    makeSwipeable(row, () => {
      const removed = removeCarryOutItem(item.id);
      showUndoToast(`Deleted ${item.name}`, () => { if (removed) restoreCarryOutItem(removed); rerender(); });
      rerender();
    });
    card.appendChild(row);
  }

  card.appendChild(h('<button class="link-btn" id="btn-add-carryout">+ Add an On-the-GO! item</button>'));
  wrap.appendChild(card);
  card.querySelector('#btn-add-carryout').addEventListener('click', () => openAddCarryOutModal(rerender));

  return wrap;
}

// ---- Modals ----

function openQuickAddModal(date, rerender) {
  const content = h(`<div>
    <div class="card-title">Quick add</div>
    <div class="field"><label>Calories</label><input type="number" inputmode="numeric" id="qa-cal" placeholder="e.g. 300"></div>
    <div class="field"><label>Protein (g)</label><input type="number" inputmode="numeric" id="qa-pro" placeholder="e.g. 20"></div>
    <button class="btn block" id="qa-save">Add</button>
  </div>`);
  const overlay = openModal(content);
  content.querySelector('#qa-save').addEventListener('click', () => {
    const calories = parseFloat(content.querySelector('#qa-cal').value) || 0;
    const protein = parseFloat(content.querySelector('#qa-pro').value) || 0;
    if (!calories && !protein) return;
    const entry = addEntry(date, {
      source: 'quick',
      name: 'Quick add',
      mealSlot: null,
      refId: null,
      servings: 1,
      perServing: { calories, protein, carbs: null, fat: null },
    });
    overlay.remove();
    showUndoToast('Logged quick add', () => removeEntry(date, entry.id));
    rerender();
  });
}

function openAddMyFoodModal(rerender) {
  const content = h(`<div>
    <div class="card-title">Add a food</div>
    <div class="field"><label>Name</label><input type="text" id="mf-name" placeholder="e.g. Whey protein scoop"></div>
    <div class="field"><label>Serving description</label><input type="text" id="mf-serving" placeholder="e.g. 1 scoop (30g)"></div>
    <div class="field"><label>Calories</label><input type="number" inputmode="numeric" id="mf-cal"></div>
    <div class="field"><label>Protein (g)</label><input type="number" inputmode="numeric" id="mf-pro"></div>
    <div class="field"><label>Carbs (g, optional)</label><input type="number" inputmode="numeric" id="mf-carb"></div>
    <div class="field"><label>Fat (g, optional)</label><input type="number" inputmode="numeric" id="mf-fat"></div>
    <button class="btn block" id="mf-save">Save</button>
  </div>`);
  const overlay = openModal(content);
  content.querySelector('#mf-save').addEventListener('click', () => {
    const name = content.querySelector('#mf-name').value.trim();
    const calories = parseFloat(content.querySelector('#mf-cal').value) || 0;
    const protein = parseFloat(content.querySelector('#mf-pro').value) || 0;
    if (!name || (!calories && !protein)) { showToast('Name + at least calories or protein required'); return; }
    addMyFood({
      name,
      servingDesc: content.querySelector('#mf-serving').value.trim() || null,
      calories,
      protein,
      carbs: parseFloat(content.querySelector('#mf-carb').value) || null,
      fat: parseFloat(content.querySelector('#mf-fat').value) || null,
    });
    overlay.remove();
    rerender();
  });
}

function openAddCarryOutModal(rerender) {
  const content = h(`<div>
    <div class="card-title">Add an On-the-GO! item</div>
    <div class="field"><label>Name</label><input type="text" id="co-name" placeholder="e.g. Turkey pesto wrap"></div>
    <div class="field">
      <label>Which On-the-GO! (optional)</label>
      <select id="co-location">
        <option value="">Not specified</option>
        ${ON_THE_GO_LOCATIONS.map((l) => `<option value="${l.slug}">${esc(l.displayName)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>Serving description</label><input type="text" id="co-serving" placeholder="e.g. 1 wrap"></div>
    <div class="field"><label>Calories</label><input type="number" inputmode="numeric" id="co-cal"></div>
    <div class="field"><label>Protein (g)</label><input type="number" inputmode="numeric" id="co-pro"></div>
    <div class="field"><label>Carbs (g, optional)</label><input type="number" inputmode="numeric" id="co-carb"></div>
    <div class="field"><label>Fat (g, optional)</label><input type="number" inputmode="numeric" id="co-fat"></div>
    <button class="btn block" id="co-save">Save</button>
  </div>`);
  const overlay = openModal(content);
  content.querySelector('#co-save').addEventListener('click', () => {
    const name = content.querySelector('#co-name').value.trim();
    const calories = parseFloat(content.querySelector('#co-cal').value) || 0;
    const protein = parseFloat(content.querySelector('#co-pro').value) || 0;
    if (!name || (!calories && !protein)) { showToast('Name + at least calories or protein required'); return; }
    addCarryOutItem({
      name,
      onTheGoLocationSlug: content.querySelector('#co-location').value || null,
      servingDesc: content.querySelector('#co-serving').value.trim() || null,
      calories,
      protein,
      carbs: parseFloat(content.querySelector('#co-carb').value) || null,
      fat: parseFloat(content.querySelector('#co-fat').value) || null,
    });
    overlay.remove();
    rerender();
  });
}

function openBarcodeModal(date, rerender) {
  const content = h(`<div>
    <div class="card-title">Scan barcode</div>
    <div id="scan-area"></div>
  </div>`);
  const overlay = openModal(content);
  const scanArea = content.querySelector('#scan-area');

  let scannerHandle = null;
  function cleanup() { if (scannerHandle) scannerHandle.stop(); }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });

  if (isBarcodeDetectorSupported()) {
    scanArea.appendChild(h('<video id="scan-video" autoplay playsinline muted style="width:100%;border-radius:12px;background:#000;"></video>'));
    scanArea.appendChild(h('<div class="muted" style="margin-top:8px;">Point the camera at the barcode.</div>'));
    scanArea.appendChild(h('<button class="link-btn" id="manual-entry-link">Enter barcode manually instead</button>'));
    const video = scanArea.querySelector('#scan-video');
    startScanner(video, async (code) => {
      cleanup();
      await handleBarcodeResult(code, date, rerender, overlay, content);
    }, (err) => {
      showManualEntry(scanArea, date, rerender, overlay, content);
    }).then((handle) => { scannerHandle = handle; });
    scanArea.querySelector('#manual-entry-link').addEventListener('click', () => {
      cleanup();
      showManualEntry(scanArea, date, rerender, overlay, content);
    });
  } else {
    showManualEntry(scanArea, date, rerender, overlay, content);
  }
}

function showManualEntry(scanArea, date, rerender, overlay, content) {
  scanArea.innerHTML = '';
  scanArea.appendChild(h(`<div class="field"><label>Barcode number</label><input type="text" inputmode="numeric" id="manual-barcode" placeholder="e.g. 0123456789012"></div>`));
  scanArea.appendChild(h('<button class="btn block" id="manual-lookup">Look up</button>'));
  scanArea.querySelector('#manual-lookup').addEventListener('click', async () => {
    const code = scanArea.querySelector('#manual-barcode').value.trim();
    if (!code) return;
    await handleBarcodeResult(code, date, rerender, overlay, content);
  });
}

async function handleBarcodeResult(code, date, rerender, overlay, content) {
  const scanArea = content.querySelector('#scan-area');
  scanArea.innerHTML = '<div class="muted">Looking up…</div>';
  try {
    const product = await lookupBarcode(code);
    scanArea.innerHTML = '';
    scanArea.appendChild(h(`<div class="item-name">${esc(product.name)}${product.brand ? ` <span class="muted">(${esc(product.brand)})</span>` : ''}</div>`));
    scanArea.appendChild(h(`<div class="item-meta" style="margin-bottom:10px;">Per ${esc(product.servingDesc)}${product.basis === '100g' ? ' — no serving size on file, using per-100g' : ''}: ${Math.round(product.calories || 0)} cal, ${Math.round((product.protein || 0) * 10) / 10}g protein</div>`));
    scanArea.appendChild(h('<button class="btn block" id="barcode-add">Add to log</button>'));
    scanArea.querySelector('#barcode-add').addEventListener('click', () => {
      const entry = addEntry(date, {
        source: 'barcode',
        name: product.name,
        mealSlot: null,
        refId: product.barcode,
        servings: 1,
        perServing: { calories: product.calories, protein: product.protein, carbs: product.carbs, fat: product.fat },
      });
      overlay.remove();
      showUndoToast(`Logged ${product.name}`, () => removeEntry(date, entry.id));
      rerender();
    });
  } catch (err) {
    scanArea.innerHTML = `<div class="callout danger">${esc(err.message)}</div>`;
    scanArea.appendChild(h('<button class="link-btn" id="retry-manual">Try a different barcode</button>'));
    scanArea.querySelector('#retry-manual').addEventListener('click', () => showManualEntry(scanArea, date, rerender, overlay, content));
  }
}
