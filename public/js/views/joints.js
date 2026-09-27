// Joints: was gerade unterwegs ist, und der Verlauf nach Tagen.

import { avatar, emptyState, jointCard, jointStatus, nameOf } from '../components.js';
import { pressed } from '../lib/constants.js';
import { dayLabel, fmtG, fmtInt, fmtNum, fmtTime, html, startOfDay } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { activeJoints, emit, jointStrainNames, jointsNewest, member } from '../store.js';

let tab = 'active';

function historyList(joints) {
  const groups = new Map();
  for (const j of joints) {
    const key = dayLabel(j.createdAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(j);
  }
  return [...groups].map(
    ([day, items]) => html`
      <section class="stack" style="gap:8px">
        <div class="section-head">
          <h2 class="section-title">${day}</h2>
          <span class="tiny faint num">${fmtG(items.reduce((s, j) => s + j.grams, 0))}</span>
        </div>
        <div class="card glass card--tight list">
          ${items.map(
            (j) => html`
              <button type="button" class="list__item" data-click="open-joint" data-joint="${j.id}" style="width:100%;text-align:left">
                ${avatar(member(j.rolledBy), { size: 'sm', online: false })}
                <div class="grow">
                  <div class="strong ellipsis">${fmtG(j.grams)} ${jointStrainNames(j)}</div>
                  <div class="tiny faint">${fmtTime(j.createdAt)} · ${nameOf(j.rolledBy)} · ${j.rotation.length} in der Rotation</div>
                </div>
                ${jointStatus(j)}
              </button>`,
          )}
        </div>
      </section>`,
  );
}

export function jointsView() {
  const all = jointsNewest();
  const active = activeJoints();
  const today = startOfDay().getTime();
  const todays = all.filter((j) => Date.parse(j.createdAt) >= today);
  const avg = all.length ? all.reduce((s, j) => s + j.grams, 0) / all.length : 0;

  const seg = (key, label, count) => html`
    <button type="button" class="segmented__opt" data-click="joints-tab" data-value="${key}" aria-pressed="${pressed(tab === key)}">
      ${label}${count ? html` <span class="segmented__count">${count}</span>` : ''}
    </button>`;

  return html`
    <div class="stack stack--lg">
      <header class="page-head">
        <div>
          <h1 class="page-title">Joints</h1>
          <p class="page-sub">Heute ${fmtInt(todays.length)} · insgesamt ${fmtInt(all.length)} · Ø ${fmtNum(avg)} g</p>
        </div>
        <button type="button" class="btn btn--primary btn--sm" data-click="open-roll">${icon('plus', { size: 18 })} Gerollt</button>
      </header>

      <div class="segmented" role="group" aria-label="Ansicht">
        ${seg('active', 'Unterwegs', active.length)}
        ${seg('history', 'Verlauf', 0)}
      </div>

      ${tab === 'active'
        ? active.length
          ? html`<div class="stack">${active.map((j) => jointCard(j))}</div>`
          : emptyState({
              iconName: 'cigarette',
              title: 'Nichts unterwegs',
              text: 'Trag einen gerollten Joint ein – die Gruppe bekommt eine Push-Nachricht und kann sich in die Rotation eintragen.',
              action: html`<button type="button" class="btn btn--primary" data-click="open-roll">${icon('cigarette', { size: 18 })} Joint gerollt</button>`,
            })
        : all.length
          ? historyList(all)
          : emptyState({ iconName: 'history', title: 'Noch kein Verlauf', text: 'Hier erscheinen alle eingetragenen Joints.' })}
    </div>`;
}

export const jointsHandlers = {
  'joints-tab'(el) {
    tab = el.dataset.value;
    emit();
  },
};
