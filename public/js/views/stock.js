// Bestand: alle Sorten mit Menge, THC und Füllstand.

import { emptyState, strainCard } from '../components.js';
import { pressed } from '../lib/constants.js';
import { fmtEur, fmtNum, html, thcMg } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { activeStrains, archivedStrains, emit, stockLevel, stockTotal, stockValue } from '../store.js';
import { openStrainDetail, openStrainForm } from '../sheets/strain.js';

let filter = 'all';
let sort = 'amount';

const SORTS = {
  amount: ['Menge', (a, b) => b.grams - a.grams],
  name: ['Name', (a, b) => a.name.localeCompare(b.name, 'de')],
  thc: ['THC', (a, b) => (b.thc ?? -1) - (a.thc ?? -1)],
};

export function stockView() {
  const active = activeStrains();
  const low = active.filter((s) => stockLevel(s) !== 'ok');
  const archived = archivedStrains();
  const lists = { all: active, low, archived };
  const list = [...(lists[filter] ?? active)].sort(SORTS[sort][1]);
  const mg = active.reduce((sum, s) => sum + thcMg(s.grams, s.thc), 0);
  const value = stockValue();

  const seg = (key, label, count) => html`
    <button type="button" class="segmented__opt" data-click="stock-filter" data-value="${key}" aria-pressed="${pressed(filter === key)}">
      ${label}${count ? html` <span class="faint num">${count}</span>` : ''}
    </button>`;

  return html`
    <div class="stack stack--lg">
      <header class="page-head">
        <div>
          <h1 class="page-title">Bestand</h1>
          <p class="page-sub">${fmtNum(stockTotal())} g in ${active.length} ${active.length === 1 ? 'Sorte' : 'Sorten'}${mg > 0 ? ` · ≈ ${fmtNum(Math.round(mg / 100) / 10)} g THC` : ''}${value > 0 ? ` · ≈ ${fmtEur(value)}` : ''}</p>
        </div>
        <button type="button" class="btn btn--primary btn--sm" data-click="add-strain">${icon('plus', { size: 18 })} Sorte</button>
      </header>

      <div class="row">
        <div class="segmented grow" role="group" aria-label="Filter">
          ${seg('all', 'Alle', active.length)}
          ${seg('low', 'Knapp', low.length)}
          ${seg('archived', 'Archiv', archived.length)}
        </div>
        <label class="sr-only" for="stock-sort">Sortieren</label>
        <select id="stock-sort" class="select select--sm" data-change="stock-sort">
          ${Object.entries(SORTS).map(([key, [label]]) => html`<option value="${key}" ${sort === key ? 'selected' : ''}>${label}</option>`)}
        </select>
      </div>

      <div class="stack">
        ${list.length
          ? list.map(strainCard)
          : filter === 'all'
            ? emptyState({
                iconName: 'jar',
                title: 'Noch nichts im Bestand',
                text: 'Trag eure Sorten mit Menge und THC-Gehalt ein. Jeder gerollte Joint wird dann automatisch abgezogen.',
                action: html`<button type="button" class="btn btn--primary" data-click="add-strain">${icon('plus')} Erste Sorte anlegen</button>`,
              })
            : emptyState({
                iconName: filter === 'low' ? 'circle-check' : 'archive',
                title: filter === 'low' ? 'Alles gut gefüllt' : 'Archiv ist leer',
                text: filter === 'low' ? 'Keine Sorte liegt unter der Warnschwelle.' : 'Entfernte, schon benutzte Sorten landen hier.',
              })}
      </div>
    </div>`;
}

export const stockHandlers = {
  'stock-filter'(el) {
    filter = el.dataset.value;
    emit();
  },
  'stock-sort'(el) {
    sort = el.value;
    el.blur();
    emit();
  },
  'add-strain': () => openStrainForm(),
  'open-strain': (el) => openStrainDetail(el.dataset.strain),
};
