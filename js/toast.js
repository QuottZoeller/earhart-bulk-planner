// Lightweight toast for confirmations and undo affordances. Every
// destructive action in the app routes through showUndoToast so nothing is
// ever silently, permanently lost on a single tap.
const root = () => document.getElementById('toast-root');

export function showToast(message, { duration = 3000 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${message}</span>`;
  root().appendChild(el);
  setTimeout(() => el.remove(), duration);
}

export function showUndoToast(message, onUndo, { duration = 5000 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast';
  const span = document.createElement('span');
  span.textContent = message;
  const btn = document.createElement('button');
  btn.textContent = 'Undo';
  btn.addEventListener('click', () => {
    onUndo();
    el.remove();
  });
  el.appendChild(span);
  el.appendChild(btn);
  root().appendChild(el);
  setTimeout(() => el.remove(), duration);
}
