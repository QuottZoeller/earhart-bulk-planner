import { getSettings, saveSettings, computeDailyTargets } from '../settings.js';
import { exportJSON, exportDailySummaryCSV, exportLogEntriesCSV, importJSON } from '../exportImport.js';
import { clearAll } from '../storage.js';
import { h } from '../dom.js';
import { showToast } from '../toast.js';
import { navigate } from '../router.js';

const ALLERGENS = ['Coconut', 'Eggs', 'Fish', 'Gluten', 'Milk', 'Peanuts', 'Sesame', 'Shellfish', 'Soy', 'Tree Nuts', 'Wheat'];

export async function renderSettings(root) {
  root.innerHTML = '';
  const settings = getSettings();

  root.appendChild(renderExportReminder(settings));
  root.appendChild(renderTargetsCard(settings, () => renderSettings(root)));
  root.appendChild(renderMealsCard(settings, () => renderSettings(root)));
  root.appendChild(renderDislikesCard(settings, () => renderSettings(root)));
  root.appendChild(renderAllergensCard(settings, () => renderSettings(root)));
  root.appendChild(renderDataCard(() => renderSettings(root)));
}

function renderExportReminder(settings) {
  const wrap = h('<div></div>');
  const last = settings.lastExportAt ? new Date(settings.lastExportAt) : null;
  const daysSince = last ? (Date.now() - last.getTime()) / 86400000 : Infinity;
  if (daysSince > 30) {
    wrap.appendChild(h(`<div class="callout warn">
      ${last ? `It's been ${Math.round(daysSince)} days since your last export.` : "You haven't exported a backup yet."}
      This app stores everything in the browser only -- clearing browser data wipes it. <strong>Export a backup below.</strong>
    </div>`));
  }
  return wrap;
}

function renderTargetsCard(settings, rerender) {
  const { calorieTarget, proteinTarget } = computeDailyTargets(settings);
  const card = h(`<div class="card">
    <div class="card-title">Targets</div>

    <div class="field">
      <label>Bodyweight (lb)</label>
      <input type="number" inputmode="decimal" id="bodyweight" value="${settings.bodyweightLb ?? ''}">
    </div>

    <div class="field">
      <label>Calorie target</label>
      <div class="btn-row" style="margin-bottom:8px;">
        <button class="btn sm ${settings.calorieMode === 'auto' ? '' : 'secondary'}" data-cal-mode="auto">Auto (bodyweight × multiplier)</button>
        <button class="btn sm ${settings.calorieMode === 'manual' ? '' : 'secondary'}" data-cal-mode="manual">Manual</button>
      </div>
      ${settings.calorieMode === 'auto' ? `
        <input type="range" id="cal-multiplier" min="16" max="18" step="0.5" value="${settings.calorieMultiplier}">
        <div class="muted">×${settings.calorieMultiplier} = ${calorieTarget.toLocaleString()} cal/day</div>
      ` : `
        <input type="number" inputmode="numeric" id="cal-manual" value="${settings.calorieManual ?? ''}" placeholder="e.g. 3200">
      `}
    </div>

    <div class="field">
      <label>Protein target</label>
      <div class="btn-row" style="margin-bottom:8px;">
        <button class="btn sm ${settings.proteinMode === 'auto' ? '' : 'secondary'}" data-pro-mode="auto">Auto (g per lb)</button>
        <button class="btn sm ${settings.proteinMode === 'manual' ? '' : 'secondary'}" data-pro-mode="manual">Manual</button>
      </div>
      ${settings.proteinMode === 'auto' ? `
        <input type="number" inputmode="decimal" id="pro-per-lb" step="0.05" value="${settings.proteinPerLb}">
        <div class="muted">${settings.proteinPerLb}g/lb = ${proteinTarget}g/day</div>
      ` : `
        <input type="number" inputmode="numeric" id="pro-manual" value="${settings.proteinManual ?? ''}" placeholder="e.g. 180">
      `}
    </div>
  </div>`);

  card.querySelector('#bodyweight').addEventListener('change', (e) => {
    saveSettings({ bodyweightLb: parseFloat(e.target.value) || null });
    rerender();
  });
  card.querySelectorAll('[data-cal-mode]').forEach((btn) =>
    btn.addEventListener('click', () => { saveSettings({ calorieMode: btn.dataset.calMode }); rerender(); })
  );
  card.querySelectorAll('[data-pro-mode]').forEach((btn) =>
    btn.addEventListener('click', () => { saveSettings({ proteinMode: btn.dataset.proMode }); rerender(); })
  );
  const calSlider = card.querySelector('#cal-multiplier');
  if (calSlider) calSlider.addEventListener('input', (e) => { saveSettings({ calorieMultiplier: parseFloat(e.target.value) }); rerender(); });
  const calManual = card.querySelector('#cal-manual');
  if (calManual) calManual.addEventListener('change', (e) => { saveSettings({ calorieManual: parseFloat(e.target.value) || null }); rerender(); });
  const proPerLb = card.querySelector('#pro-per-lb');
  if (proPerLb) proPerLb.addEventListener('change', (e) => { saveSettings({ proteinPerLb: parseFloat(e.target.value) || 0.8 }); rerender(); });
  const proManual = card.querySelector('#pro-manual');
  if (proManual) proManual.addEventListener('change', (e) => { saveSettings({ proteinManual: parseFloat(e.target.value) || null }); rerender(); });

  return card;
}

function renderMealsCard(settings, rerender) {
  const card = h(`<div class="card">
    <div class="card-title">Meals you attend</div>
    ${['breakfast', 'lunch', 'dinner'].map((m) => `
      <label class="checkbox-row">
        <input type="checkbox" data-meal="${m}" ${settings.mealsAttended[m] ? 'checked' : ''}>
        <span style="text-transform:capitalize;">${m}</span>
      </label>
    `).join('')}
  </div>`);
  card.querySelectorAll('[data-meal]').forEach((cb) =>
    cb.addEventListener('change', (e) => {
      const mealsAttended = { ...settings.mealsAttended, [e.target.dataset.meal]: e.target.checked };
      saveSettings({ mealsAttended });
      rerender();
    })
  );
  return card;
}

function renderDislikesCard(settings, rerender) {
  const card = h(`<div class="card">
    <div class="card-title">Dislikes</div>
    <div class="muted">Items whose name contains any of these are excluded from planning.</div>
    <div class="btn-row" style="margin-top:10px;">
      <input type="text" id="dislike-input" placeholder="e.g. mushroom" style="flex:1;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);">
      <button class="btn sm" id="dislike-add">Add</button>
    </div>
    <div class="chip-input-list">
      ${settings.dislikes.map((d) => `<span class="chip-removable">${d}<button data-remove-dislike="${d}">×</button></span>`).join('')}
    </div>
  </div>`);
  card.querySelector('#dislike-add').addEventListener('click', () => {
    const input = card.querySelector('#dislike-input');
    const val = input.value.trim();
    if (!val) return;
    saveSettings({ dislikes: [...new Set([...settings.dislikes, val.toLowerCase()])] });
    rerender();
  });
  card.querySelectorAll('[data-remove-dislike]').forEach((btn) =>
    btn.addEventListener('click', () => {
      saveSettings({ dislikes: settings.dislikes.filter((d) => d !== btn.dataset.removeDislike) });
      rerender();
    })
  );
  return card;
}

function renderAllergensCard(settings, rerender) {
  const card = h(`<div class="card">
    <div class="card-title">Allergen exclusions</div>
    <div class="muted">Excludes any item Purdue flags as containing these. Only applies to items with allergen data.</div>
    <div class="chip-input-list" style="margin-top:10px;">
      ${ALLERGENS.map((a) => `
        <label class="chip-removable" style="cursor:pointer;">
          <input type="checkbox" data-allergen="${a}" ${settings.allergenExclusions.includes(a) ? 'checked' : ''} style="margin-right:4px;">${a}
        </label>
      `).join('')}
    </div>
  </div>`);
  card.querySelectorAll('[data-allergen]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const checked = [...card.querySelectorAll('[data-allergen]:checked')].map((c) => c.dataset.allergen);
      saveSettings({ allergenExclusions: checked });
      rerender();
    })
  );
  return card;
}

function renderDataCard(rerender) {
  const card = h(`<div class="card">
    <div class="card-title">Your data</div>
    <div class="muted" style="margin-bottom:10px;">Everything lives in this browser only. Export regularly -- clearing browser data or reinstalling wipes it.</div>
    <div class="btn-row" style="margin-bottom:10px;">
      <button class="btn secondary sm" id="export-json">Export JSON (full backup)</button>
      <button class="btn secondary sm" id="export-csv-summary">Export CSV (daily summary)</button>
      <button class="btn secondary sm" id="export-csv-entries">Export CSV (log entries)</button>
    </div>
    <div class="field">
      <label>Import backup (JSON)</label>
      <input type="file" accept="application/json" id="import-file">
    </div>
    <button class="btn danger sm" id="clear-data">Clear all data</button>
  </div>`);

  card.querySelector('#export-json').addEventListener('click', () => {
    exportJSON();
    saveSettings({ lastExportAt: new Date().toISOString() });
    rerender();
  });
  card.querySelector('#export-csv-summary').addEventListener('click', () => {
    exportDailySummaryCSV();
    saveSettings({ lastExportAt: new Date().toISOString() });
    rerender();
  });
  card.querySelector('#export-csv-entries').addEventListener('click', () => exportLogEntriesCSV());

  card.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    if (!confirm('This will overwrite your current local data with the imported backup. Continue?')) {
      e.target.value = '';
      return;
    }
    try {
      importJSON(text);
      showToast('Backup restored');
      navigate('#/home');
    } catch (err) {
      showToast(`Import failed: ${err.message}`);
    }
  });

  card.querySelector('#clear-data').addEventListener('click', () => {
    if (!confirm('This permanently deletes all settings, logs, weight history, and saved foods from this browser. This cannot be undone. Continue?')) return;
    clearAll();
    showToast('All data cleared');
    navigate('#/home');
    window.location.reload();
  });

  return card;
}
