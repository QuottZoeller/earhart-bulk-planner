// Attaches swipe-left-to-remove behavior to a row. `rowEl` must contain a
// ".swipe-row-content" child (the draggable foreground) sitting over a
// ".swipe-row-bg" (the red "Remove" backdrop revealed as it slides away).
// Deliberately dependency-free: pointer events cover touch + mouse + pen.
const THRESHOLD = 76;
const MAX_DRAG = 120;

export function makeSwipeable(rowEl, onRemove) {
  const content = rowEl.querySelector('.swipe-row-content');
  if (!content) return;

  let startX = 0;
  let startY = 0;
  let dx = 0;
  let decided = false;
  let horizontal = false;
  let dragging = false;

  function reset(animate) {
    if (animate) content.style.transition = 'transform 0.18s ease';
    content.style.transform = 'translateX(0)';
    dragging = false;
    decided = false;
    horizontal = false;
    dx = 0;
  }

  content.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;
    decided = false;
    content.style.transition = 'none';
  });

  content.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!decided) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        decided = true;
        horizontal = Math.abs(dx) > Math.abs(dy);
        if (horizontal) content.setPointerCapture(e.pointerId);
      }
    }
    if (decided && horizontal) {
      const clamped = Math.max(-MAX_DRAG, Math.min(0, dx));
      content.style.transform = `translateX(${clamped}px)`;
    }
  });

  function finish(e) {
    if (!dragging) return;
    dragging = false;
    if (decided && horizontal && dx < -THRESHOLD) {
      content.style.transition = 'transform 0.18s ease';
      content.style.transform = `translateX(-${MAX_DRAG}px)`;
      setTimeout(() => onRemove(), 140);
    } else {
      reset(true);
    }
  }

  content.addEventListener('pointerup', finish);
  content.addEventListener('pointercancel', () => reset(true));
}
