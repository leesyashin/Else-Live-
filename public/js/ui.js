// UI-Bausteine: Event-Delegation, Bottom-Sheets, Toasts, Bestätigungsdialog.

import { html } from './lib/html.js';
import { icon } from './lib/icons.js';
import { router } from './lib/router.js';

// ---------------------------------------------------------------------------
// Event-Delegation: <button data-click="name">, <input data-input="name"> …

const EVENT_TYPES = ['click', 'input', 'change', 'submit'];

export function delegate(root, handlers) {
  for (const type of EVENT_TYPES) {
    root.addEventListener(type, (event) => {
      const el = event.target.closest(`[data-${type}]`);
      if (!el || !root.contains(el)) return;
      const handler = handlers[el.dataset[type]];
      if (!handler) return;
      if (type === 'submit' || (type === 'click' && el.tagName === 'A')) event.preventDefault();
      Promise.resolve()
        .then(() => handler(el, event))
        .catch(showError);
    });
  }
}

export function showError(err) {
  console.error(err);
  toast({ title: 'Hat nicht geklappt', body: err?.message || String(err), tone: 'error' });
}

/** Button während einer Aktion sperren. */
export async function busy(button, fn) {
  if (!button) return fn();
  if (button.dataset.busy) return undefined;
  button.dataset.busy = '1';
  button.disabled = true;
  try {
    return await fn();
  } finally {
    delete button.dataset.busy;
    button.disabled = false;
  }
}

const hasFocusedField = (root) => {
  const el = document.activeElement;
  return Boolean(el && root.contains(el) && el.matches('input:not([type=checkbox]), textarea, select'));
};

// ---------------------------------------------------------------------------
// Sheets

const openSheets = [];

/**
 * def.render(sheet) → { title, subtitle?, body, foot? }
 * def.live: bei neuen Serverdaten automatisch neu zeichnen
 * def.handlers: Event-Handler für data-click/-input/-change/-submit im Sheet
 */
export function openSheet(def) {
  const layer = document.createElement('div');
  layer.className = 'sheet-layer';
  layer.innerHTML = `
    <div class="sheet-backdrop" data-sheet-close></div>
    <section class="sheet" role="dialog" aria-modal="true" tabindex="-1">
      <div class="sheet__grab" aria-hidden="true"></div>
      <header class="sheet__head"></header>
      <div class="sheet__body"></div>
      <footer class="sheet__foot"></footer>
    </section>`;

  const el = layer.querySelector('.sheet');
  const head = el.querySelector('.sheet__head');
  const body = el.querySelector('.sheet__body');
  const foot = el.querySelector('.sheet__foot');
  const previousFocus = document.activeElement;

  const sheet = {
    def,
    el,
    layer,
    body,
    closed: false,
    update() {
      if (sheet.closed) return;
      const view = def.render(sheet);
      if (!view) return sheet.close();
      head.innerHTML = html`
        <div class="grow">
          <h2 class="sheet__title">${view.title}</h2>
          ${view.subtitle ? html`<p class="sheet__sub">${view.subtitle}</p>` : ''}
        </div>
        <button type="button" class="icon-btn" data-sheet-close aria-label="Schließen">${icon('x')}</button>`;
      const scroll = body.scrollTop;
      body.innerHTML = view.body;
      body.scrollTop = scroll;
      foot.innerHTML = view.foot ?? '';
      foot.hidden = !view.foot;
      def.onRender?.(sheet);
    },
    close() {
      if (sheet.closed) return;
      sheet.closed = true;
      openSheets.splice(openSheets.indexOf(sheet), 1);
      layer.classList.add('is-closing');
      el.classList.add('is-closing');
      setTimeout(() => layer.remove(), 240);
      if (!openSheets.length) document.body.style.overflow = '';
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      def.onClose?.(sheet);
    },
  };

  layer.addEventListener('click', (event) => {
    if (event.target.closest('[data-sheet-close]')) sheet.close();
  });
  if (def.handlers) delegate(layer, def.handlers);

  document.getElementById('sheets').append(layer);
  openSheets.push(sheet);
  document.body.style.overflow = 'hidden';
  sheet.update();
  el.focus({ preventScroll: true });
  return sheet;
}

export function refreshLiveSheets() {
  for (const sheet of openSheets) {
    if (sheet.def.live && !hasFocusedField(sheet.el)) sheet.update();
  }
}

export const closeAllSheets = () => [...openSheets].forEach((s) => s.close());
export const topSheet = () => openSheets[openSheets.length - 1] ?? null;

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') topSheet()?.close();
});

// ---------------------------------------------------------------------------
// Bestätigen

export function confirmDialog({ title, message, confirmLabel = 'OK', danger = false }) {
  return new Promise((resolve) => {
    let confirmed = false;
    const sheet = openSheet({
      render: () => ({
        title,
        body: html`<p class="muted">${message}</p>`,
        foot: html`
          <button type="button" class="btn btn--glass grow" data-sheet-close>Abbrechen</button>
          <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'} grow" data-click="confirm">
            ${confirmLabel}
          </button>`,
      }),
      handlers: {
        confirm() {
          confirmed = true;
          sheet.close();
        },
      },
      onClose: () => resolve(confirmed),
    });
  });
}

// ---------------------------------------------------------------------------
// Toasts

const TONE_ICONS = { info: 'bell', success: 'circle-check', error: 'triangle-alert', stock: 'jar' };

/** action: { label, onClick } – z. B. „Rückgängig“. */
export function toast({ title, body, tone = 'info', url, action, timeout = 5000 }) {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.innerHTML = html`
    <div class="toast__icon">${icon(TONE_ICONS[tone] ?? 'bell', { size: 18 })}</div>
    <div class="grow">
      <div class="toast__title">${title}</div>
      ${body ? html`<div class="toast__body">${body}</div>` : ''}
    </div>
    ${action ? html`<button type="button" class="toast__action" data-toast-action>${action.label}</button>` : ''}`;
  const dismiss = () => {
    if (el.classList.contains('is-leaving')) return;
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 280);
  };
  el.addEventListener('click', (event) => {
    if (event.target.closest('[data-toast-action]')) {
      Promise.resolve()
        .then(() => action.onClick())
        .catch(showError);
    } else if (url) {
      router.open(url);
    }
    dismiss();
  });
  box.prepend(el);
  while (box.children.length > 3) box.lastElementChild.remove();
  setTimeout(dismiss, timeout);
}
