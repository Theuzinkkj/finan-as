'use strict';

// =============================================
//  FOCUS MANAGEMENT
// =============================================
const _focusStack = [];
const _FOCUSABLE  = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function trapFocus(modalEl) {
  const getEls = () => [...modalEl.querySelectorAll(_FOCUSABLE)].filter(el => el.offsetParent !== null);
  function handler(e) {
    if (e.key !== 'Tab') return;
    const els = getEls();
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
    else            { if (document.activeElement === last)  { e.preventDefault(); first.focus(); } }
  }
  modalEl._trapHandler = handler;
  modalEl.addEventListener('keydown', handler);
  const els = getEls();
  if (els.length) els[0].focus();
}

function releaseFocus(modalEl) {
  if (modalEl._trapHandler) {
    modalEl.removeEventListener('keydown', modalEl._trapHandler);
    delete modalEl._trapHandler;
  }
}

// =============================================
//  MODAL
// =============================================
function openModal(id) {
  _focusStack.push(document.activeElement);
  const overlay = document.getElementById(id);
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const inner = overlay.querySelector('.modal') || overlay;
  requestAnimationFrame(() => trapFocus(inner));
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  overlay.classList.add('hidden');
  document.body.style.overflow = '';
  const inner = overlay.querySelector('.modal') || overlay;
  releaseFocus(inner);
  const prev = _focusStack.pop();
  if (prev && typeof prev.focus === 'function') prev.focus();
}
