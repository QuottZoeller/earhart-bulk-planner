import { getSettings, saveSettings, computeDailyTargets } from '../settings.js';
import { setWeight, getDayLog } from '../log.js';
import { getWeightSeries, computeEWMA, computeWeeklyTrend, describeRate, suggestCalorieAdjustment } from '../weight.js';
import { computeHistoryStats } from '../history.js';
import { drawWeightChart } from '../chart.js';
import { todayISO } from '../util.js';
import { h } from '../dom.js';
import { showToast } from '../toast.js';

export async function renderProgress(root) {
  root.innerHTML = '';
  const settings = getSettings();
  const today = todayISO();
  const todayLog = getDayLog(today);

  root.appendChild(renderWeightEntryCard(todayLog.weightLb, () => renderProgress(root)));

  const series = getWeightSeries();
  if (series.length >= 2) {
    const ewmaSeries = computeEWMA(series);
    root.appendChild(renderChartCard(ewmaSeries));

    const rate = computeWeeklyTrend(ewmaSeries);
    const readout = describeRate(rate);
    root.appendChild(h(`<div class="callout ${readout.status === 'good' ? 'good' : readout.status === 'high' || readout.status === 'low' ? 'warn' : ''}">${readout.text}</div>`));

    root.appendChild(renderAdjustmentSuggestion(ewmaSeries, settings));
  } else {
    root.appendChild(h('<div class="empty-state">Log your weight for a few days to see a trend.</div>'));
  }

  root.appendChild(renderHistorySection(settings));
}

function renderWeightEntryCard(currentWeight, onSaved) {
  const card = h(`<div class="card">
    <div class="card-title">Today's weight</div>
    <div class="btn-row" style="align-items:center;">
      <input type="number" inputmode="decimal" id="weight-input" placeholder="lb" value="${currentWeight ?? ''}"
        style="flex:1;min-height:48px;padding:0 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:18px;">
      <button class="btn" id="weight-save">Save</button>
    </div>
    <div class="muted" style="margin-top:6px;">One tap, no streaks, no nagging -- a missed day is fine.</div>
  </div>`);
  card.querySelector('#weight-save').addEventListener('click', () => {
    const val = parseFloat(card.querySelector('#weight-input').value);
    if (!val || val <= 0) { showToast('Enter a valid weight'); return; }
    setWeight(todayISO(), val);
    showToast('Weight logged');
    onSaved();
  });
  return card;
}

function renderChartCard(ewmaSeries) {
  const card = h(`<div class="card">
    <div class="card-title"><span>Weight trend</span><span class="muted">raw + smoothed</span></div>
    <canvas id="weight-canvas"></canvas>
  </div>`);
  requestAnimationFrame(() => drawWeightChart(card.querySelector('#weight-canvas'), ewmaSeries));
  return card;
}

function renderAdjustmentSuggestion(ewmaSeries, settings) {
  const wrap = h('<div></div>');
  // Average logged calories over the same ~21-day window the trend uses.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 21);
  let sum = 0, count = 0;
  for (let i = 0; i < 21; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const log = getDayLog(iso);
    if (log.entries.length) {
      const known = log.entries.filter((e) => e.perServing);
      const cal = known.reduce((s, e) => s + e.perServing.calories * e.servings, 0);
      if (cal > 0) { sum += cal; count++; }
    }
  }
  const avgLoggedCalories = count ? Math.round(sum / count) : null;

  const result = suggestCalorieAdjustment({ ewmaSeries, avgLoggedCalories });
  if (result.suggested == null) return wrap;

  const { calorieTarget } = computeDailyTargets(settings);
  if (Math.abs(result.suggested - calorieTarget) < 50) return wrap;

  const card = h(`<div class="card">
    <div class="card-title">Calorie target check-in</div>
    <div class="muted">Based on your observed rate of gain over the last 3+ weeks and what you've actually been logging, a target of about <strong>${result.suggested.toLocaleString()} cal</strong> would track closer to the 0.25-0.5 lb/week range (current target: ${calorieTarget.toLocaleString()}).</div>
    <button class="btn secondary sm" id="apply-suggestion" style="margin-top:10px;">Apply to Settings</button>
  </div>`);
  card.querySelector('#apply-suggestion').addEventListener('click', () => {
    saveSettings({ calorieMode: 'manual', calorieManual: result.suggested });
    showToast('Calorie target updated in Settings');
    renderProgress(document.getElementById('view-root'));
  });
  return card;
}

function renderHistorySection(settings) {
  const wrap = h('<div class="section-heading">History</div>');
  const section = h('<div></div>');
  section.appendChild(wrap);
  const tabs = h('<div class="btn-row" style="margin-bottom:10px;"></div>');
  const body = h('<div></div>');
  section.appendChild(tabs);
  section.appendChild(body);

  function renderWindow(days) {
    const stats = computeHistoryStats(days, settings);
    body.innerHTML = '';
    body.appendChild(h(`<div class="card">
      <div class="totals-grid">
        <div><div class="muted">Avg calories</div><div style="font-size:18px;font-weight:700;">${stats.avgCalories ?? '—'}</div></div>
        <div><div class="muted">Avg protein</div><div style="font-size:18px;font-weight:700;">${stats.avgProtein ?? '—'}g</div></div>
        <div><div class="muted">Adherence</div><div style="font-size:18px;font-weight:700;">${stats.adherencePercent ?? '—'}%</div></div>
        <div><div class="muted">Days logged</div><div style="font-size:18px;font-weight:700;">${stats.daysWithData}/${stats.elapsedDays}</div></div>
      </div>
      <div class="muted" style="margin-top:8px;">Adherence = days within ${stats.calorieRangeLabel || 'target range'} and protein ≥90% of goal, out of all days elapsed in this window.</div>
    </div>`));
  }

  [7, 30, 90].forEach((days, i) => {
    const btn = h(`<button class="btn ${i === 0 ? '' : 'secondary'} sm window-btn" data-days="${days}">${days}d</button>`);
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('.window-btn').forEach((b) => b.classList.add('secondary'));
      btn.classList.remove('secondary');
      renderWindow(days);
    });
    tabs.appendChild(btn);
  });
  renderWindow(7);

  return section;
}
