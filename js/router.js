const routes = new Map();
let viewRoot = null;
let currentCleanup = null;

export function registerRoute(name, renderFn) {
  routes.set(name, renderFn);
}

export function navigate(hash) {
  window.location.hash = hash;
}

function parseHash() {
  const raw = window.location.hash.replace(/^#\//, '');
  const [route, queryString] = raw.split('?');
  const params = new URLSearchParams(queryString || '');
  return { route: route || 'home', params };
}

async function render() {
  const { route, params } = parseHash();
  const renderFn = routes.get(route) || routes.get('home');

  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.route === route);
  });

  if (typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch { /* ignore */ }
    currentCleanup = null;
  }

  viewRoot.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const cleanup = await renderFn(viewRoot, params);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } catch (err) {
    console.error(err);
    viewRoot.innerHTML = `<div class="empty-state">Something went wrong loading this screen.<br><span class="muted">${err.message}</span></div>`;
  }
  // Actual route/tab/day/location changes should land at the top of the new
  // screen. This only runs on real hash changes (navigate()), not on a
  // view's own in-place re-renders after a swipe/regenerate/checkbox toggle,
  // so it never fights with scroll position during normal interaction.
  window.scrollTo(0, 0);
}

export function startRouter(rootEl) {
  viewRoot = rootEl;
  window.addEventListener('hashchange', render);
  if (!window.location.hash) window.location.hash = '#/home';
  else render();
}
