import { registerRoute, startRouter } from './router.js';
import { renderHome } from './views/home.js';
import { renderLog } from './views/log.js';
import { renderProgress } from './views/progress.js';
import { renderSettings } from './views/settings.js';
import { setWeight, getDayLog } from './log.js';
import { todayISO } from './util.js';
import { h } from './dom.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';

registerRoute('home', renderHome);
registerRoute('log', renderLog);
registerRoute('progress', renderProgress);
registerRoute('settings', renderSettings);

startRouter(document.getElementById('view-root'));

document.getElementById('weight-quick-btn').addEventListener('click', () => {
  const current = getDayLog(todayISO()).weightLb;
  const content = h(`<div>
    <div class="card-title">Today's weight</div>
    <div class="btn-row" style="align-items:center;">
      <input type="number" inputmode="decimal" id="hdr-weight" placeholder="lb" value="${current ?? ''}"
        style="flex:1;min-height:48px;padding:0 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:18px;" autofocus>
      <button class="btn" id="hdr-weight-save">Save</button>
    </div>
  </div>`);
  const overlay = openModal(content);
  content.querySelector('#hdr-weight-save').addEventListener('click', () => {
    const val = parseFloat(content.querySelector('#hdr-weight').value);
    if (!val || val <= 0) { showToast('Enter a valid weight'); return; }
    setWeight(todayISO(), val);
    overlay.remove();
    showToast('Weight logged');
    if (window.location.hash.startsWith('#/progress')) renderProgress(document.getElementById('view-root'));
  });
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW registration failed', err));
  });
}
