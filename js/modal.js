import { h } from './dom.js';

export function openModal(contentEl) {
  const overlay = h('<div class="modal-overlay"></div>');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:flex-end;';
  const sheet = h('<div class="card" style="width:100%;border-radius:20px 20px 0 0;margin:0;max-height:85vh;overflow-y:auto;"></div>');
  sheet.appendChild(contentEl);
  overlay.appendChild(sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}
