// Anfragen: an mich, von mir, erledigt.

import { emptyState, requestCard } from '../components.js';
import { pressed } from '../lib/constants.js';
import { html } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { closedRequests, emit, incomingRequests, outgoingRequests } from '../store.js';
import { openRequestForm } from '../sheets/request.js';

let tab = 'incoming';

export function requestsView() {
  const lists = {
    incoming: incomingRequests(),
    outgoing: outgoingRequests(),
    closed: closedRequests().slice(0, 40),
  };
  const list = lists[tab];

  const seg = (key, label, badge) => html`
    <button type="button" class="segmented__opt" data-click="requests-tab" data-value="${key}" aria-pressed="${pressed(tab === key)}">
      ${label}${badge ? html` <span class="segmented__count">${badge}</span>` : ''}
    </button>`;

  const empty = {
    incoming: ['inbox', 'Keine offenen Anfragen', 'Wenn dich jemand bittet zu rollen, landet das hier – mit Push-Nachricht.'],
    outgoing: ['send', 'Du hast nichts angefragt', 'Frag eine Person oder alle, ob mal wieder jemand rollt.'],
    closed: ['history', 'Noch nichts erledigt', 'Erfüllte, abgelehnte und zurückgezogene Anfragen erscheinen hier.'],
  }[tab];

  return html`
    <div class="stack stack--lg">
      <header class="page-head">
        <div>
          <h1 class="page-title">Anfragen</h1>
          <p class="page-sub">„Rollst du mal wieder einen?“</p>
        </div>
        <button type="button" class="btn btn--primary btn--sm" data-click="new-request">${icon('plus', { size: 18 })} Anfrage</button>
      </header>

      <div class="segmented" role="group" aria-label="Anfragen filtern">
        ${seg('incoming', 'An mich', lists.incoming.length)}
        ${seg('outgoing', 'Von mir', 0)}
        ${seg('closed', 'Erledigt', 0)}
      </div>

      <div class="stack">
        ${list.length
          ? list.map(requestCard)
          : emptyState({
              iconName: empty[0],
              title: empty[1],
              text: empty[2],
              action: tab === 'closed' ? '' : html`<button type="button" class="btn btn--glass btn--sm" data-click="new-request">${icon('hand-heart', { size: 16 })} Anfrage stellen</button>`,
            })}
      </div>
    </div>`;
}

export const requestsHandlers = {
  'requests-tab'(el) {
    tab = el.dataset.value;
    emit();
  },
  'new-request': () => openRequestForm(),
};
