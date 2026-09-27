// Detailansicht eines Joints (aktualisiert sich live).

import { jointHandlers } from '../actions.js';
import { avatar, jointCard, nameOf, strainMark } from '../components.js';
import { dayLabel, fmtEur, fmtG, fmtPct, fmtTime, html, thcMg } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { joint, jointCost, me, member, requestById, strain } from '../store.js';
import { openSheet } from '../ui.js';

const when = (iso) => `${dayLabel(iso)}, ${fmtTime(iso)}`;

export function openJointDetail(id) {
  return openSheet({
    live: true,
    render() {
      const j = joint(id);
      if (!j) return null;
      const myId = me().id;
      const mine = j.rotation.find((r) => r.memberId === myId && r.position > 1);
      const canLeave = mine && j.status !== 'done' && !(j.status === 'lit' && mine.position <= j.turn);
      const request = j.requestId ? requestById(j.requestId) : null;
      const cost = jointCost(j);

      return {
        title: j.rolledBy === myId ? 'Dein Joint' : `Joint von ${nameOf(j.rolledBy)}`,
        subtitle: when(j.createdAt),
        body: html`
          ${jointCard(j, { detail: true })}

          <section class="sheet-section" style="margin-top:22px">
            <h3 class="sheet-section__title">${icon('info')} Details</h3>
            <div class="card glass card--tight list">
              ${j.components.map((c) => {
                const s = strain(c.strainId);
                return html`
                  <div class="list__item">
                    ${strainMark(s, { size: 'sm' })}
                    <div class="grow">
                      <div class="strong">${s?.name ?? 'Unbekannte Sorte'}</div>
                      <div class="tiny faint">${s?.thc != null ? `${fmtPct(s.thc)} THC` : 'THC unbekannt'}${s?.thc ? ` · ≈ ${Math.round(thcMg(c.grams, s.thc))} mg` : ''}</div>
                    </div>
                    <span class="strong num">${fmtG(c.grams)}</span>
                  </div>`;
              })}
              <div class="list__item">${icon('leaf', { size: 18 })}<span class="grow muted">Tabak</span><span>${j.tobacco ?? 'Pur, ohne Tabak'}</span></div>
              <div class="list__item">${icon('carbon-filter', { size: 18 })}<span class="grow muted">Aktivkohlefilter</span><span>${j.carbonFilter ? j.filterBrand ?? 'Ja' : 'Nein'}</span></div>
              ${cost != null ? html`<div class="list__item">${icon('euro', { size: 18 })}<span class="grow muted">Kosten</span><span>≈ ${fmtEur(cost)}</span></div>` : ''}
              ${j.note ? html`<div class="list__item">${icon('pencil', { size: 18 })}<span class="muted">Notiz</span><span class="grow" style="text-align:right">${j.note}</span></div>` : ''}
              ${request ? html`<div class="list__item">${icon('hand-heart', { size: 18 })}<span class="grow muted">Auf Anfrage von</span>${avatar(member(request.fromId), { size: 'xs', online: false })}<span>${nameOf(request.fromId)}</span></div>` : ''}
              ${j.litAt ? html`<div class="list__item">${icon('flame', { size: 18 })}<span class="grow muted">Angezündet</span><span>${when(j.litAt)}</span></div>` : ''}
              ${j.doneAt ? html`<div class="list__item">${icon('check', { size: 18 })}<span class="grow muted">Aufgeraucht</span><span>${when(j.doneAt)}</span></div>` : ''}
            </div>
          </section>

          <section class="sheet-section">
            <div class="stack" style="gap:10px">
              ${canLeave ? html`<button type="button" class="btn btn--glass" data-click="leave-slot" data-joint="${j.id}" data-position="${mine.position}">${icon('undo-2', { size: 18 })} Aus der Rotation austragen (#${mine.position})</button>` : ''}
              ${j.status !== 'done' ? html`<button type="button" class="btn btn--glass" data-click="finish-joint" data-joint="${j.id}">${icon('check', { size: 18 })} Als aufgeraucht markieren</button>` : ''}
              <button type="button" class="btn btn--danger" data-click="delete-joint" data-joint="${j.id}">${icon('trash-2', { size: 18 })} Eintrag löschen & Bestand zurückbuchen</button>
            </div>
          </section>`,
      };
    },
    handlers: jointHandlers,
  });
}
