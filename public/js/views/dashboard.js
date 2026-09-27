// Übersicht: Bestand, aktive Joints, Anfragen, Verbrauch und Aktivität.

import { activityFeed, avatar, emptyState, jointCard, levelStatus, requestCard } from '../components.js';
import { fmtG, fmtInt, fmtNum, greeting, html, relTime, startOfDay } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import {
  activeJoints,
  activeStrains,
  incomingRequests,
  isOnline,
  jointStrainNames,
  jointWithMyTurn,
  jointsNewest,
  me,
  members,
  stockLevel,
  stockTotal,
  store,
} from '../store.js';

const DAY = 86400000;
const plural = (n, one, many) => `${fmtInt(n)} ${n === 1 ? one : many}`;

function turnHero(j) {
  const last = !j.rotation.some((r) => r.position > j.turn);
  return html`
    <section class="card glass turn-hero" aria-live="polite">
      <div class="turn-hero__icon">${icon('flame', { size: 26 })}</div>
      <div class="grow">
        <div class="turn-hero__title">Du bist dran!</div>
        <div class="small muted">#${j.turn} · ${fmtG(j.grams)} ${jointStrainNames(j)}</div>
      </div>
      <button type="button" class="btn btn--fire btn--sm" data-click="pass-joint" data-joint="${j.id}">
        ${icon(last ? 'check' : 'skip-forward', { size: 16 })} ${last ? 'Beenden' : 'Weiter'}
      </button>
    </section>`;
}

function lastSevenDays(joints) {
  const today = startOfDay().getTime();
  return Array.from({ length: 7 }, (_, i) => {
    const start = today - (6 - i) * DAY;
    const inDay = joints.filter((j) => {
      const t = Date.parse(j.createdAt);
      return t >= start && t < start + DAY;
    });
    return {
      start,
      today: i === 6,
      grams: inDay.reduce((sum, j) => sum + j.grams, 0),
      count: inDay.length,
    };
  });
}

function consumptionChart(days) {
  const max = Math.max(...days.map((d) => d.grams), 0);
  const total = days.reduce((sum, d) => sum + d.grams, 0);
  const count = days.reduce((sum, d) => sum + d.count, 0);
  const peak = days.reduce((best, d) => (d.grams > best.grams ? d : best), days[0]);
  const weekday = (t, style = 'short') => new Date(t).toLocaleDateString('de-DE', { weekday: style });
  const dateText = (t) => new Date(t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

  return html`
    <section class="card glass stack" style="gap:14px" aria-labelledby="chart-title">
      <div class="row row--between">
        <div>
          <h2 class="strong" id="chart-title">Verbrauch · letzte 7 Tage</h2>
          <p class="small muted">${fmtG(total)} in ${plural(count, 'Joint', 'Joints')}</p>
        </div>
      </div>
      <div class="chart" role="list">
        ${days.map((d) => {
          const pct = max > 0 ? (d.grams / max) * 100 : 0;
          const showLabel = d.grams > 0 && (d.today || d === peak);
          const tip = `${dateText(d.start)} · ${fmtG(d.grams)} · ${d.count} ${d.count === 1 ? 'Joint' : 'Joints'}`;
          return html`
            <button type="button" class="chart__col" role="listitem" data-click="chart-bar" data-today="${d.today}" aria-label="${tip}">
              <span class="chart__bar" style="height:${pct.toFixed(1)}%">
              </span>
              ${showLabel ? html`<span class="chart__label" style="bottom:calc(${pct.toFixed(1)}% + 4px)">${fmtNum(d.grams)}</span>` : ''}
              <span class="chart__tip" style="bottom:calc(${pct.toFixed(1)}% + 6px)">${tip}</span>
            </button>`;
        })}
      </div>
      <div class="chart-axis" aria-hidden="true">
        ${days.map((d) => html`<span data-today="${d.today}">${d.today ? 'Heute' : weekday(d.start)}</span>`)}
      </div>
    </section>`;
}

export function dashboardView() {
  const m = me();
  const strains = activeStrains();
  const joints = jointsNewest();
  const today = startOfDay().getTime();
  const todays = joints.filter((j) => Date.parse(j.createdAt) >= today);
  const days = lastSevenDays(joints);
  const weekGrams = days.reduce((sum, d) => sum + d.grams, 0);
  const active = activeJoints();
  const incoming = incomingRequests();
  const low = strains.filter((s) => stockLevel(s) !== 'ok');
  const online = members().filter((x) => isOnline(x.id));
  const lastJoint = joints[0];
  const activity = [...(store.state.activity ?? [])].reverse().slice(0, 8);
  const myTurn = jointWithMyTurn();

  return html`
    <div class="stack stack--lg">
      <header class="hello">
        <h1 class="hello__title">${greeting()}, ${m.name} ${m.emoji}</h1>
        <div class="row small muted" style="margin-top:8px">
          ${online.length ? html`<span class="avatar-stack">${online.slice(0, 5).map((x) => avatar(x, { size: 'xs', online: false }))}</span>` : ''}
          <span>${online.length} online${lastJoint ? ` · zuletzt gerollt ${relTime(lastJoint.createdAt)}` : ''}</span>
        </div>
      </header>

      ${myTurn ? turnHero(myTurn) : ''}

      <section class="card glass hero" aria-label="Gesamtbestand">
        <div class="hero__label">${icon('leaf', { size: 16 })} Gesamtbestand</div>
        <div class="hero__value">${fmtNum(stockTotal())}<span class="hero__unit">g</span></div>
        <div class="hero__meta">${strains.length === 1 ? '1 Sorte' : `${strains.length} Sorten`}${low.length ? ` · ${low.length} ${low.length === 1 ? 'wird' : 'werden'} knapp` : ''}</div>
        <div class="hero__actions">
          <button type="button" class="btn btn--primary" data-click="open-roll">${icon('cigarette', { size: 18 })} Joint gerollt</button>
          <button type="button" class="btn btn--glass" data-click="new-request">${icon('hand-heart', { size: 18 })} Anfrage</button>
        </div>
      </section>

      <div class="grid-3">
        <a class="stat glass" href="#/joints">
          <span class="stat__label">Joints heute</span>
          <span class="stat__value">${fmtInt(todays.length)}</span>
          <span class="stat__delta">${fmtG(todays.reduce((s, j) => s + j.grams, 0))}</span>
        </a>
        <a class="stat glass" href="#/joints">
          <span class="stat__label">7 Tage</span>
          <span class="stat__value">${fmtNum(weekGrams)}<span class="small muted"> g</span></span>
          <span class="stat__delta">${plural(days.reduce((s, d) => s + d.count, 0), 'Joint', 'Joints')}</span>
        </a>
        <a class="stat glass" href="#/anfragen">
          <span class="stat__label">Anfragen</span>
          <span class="stat__value">${fmtInt(incoming.length)}</span>
          <span class="stat__delta">${incoming.length ? 'warten auf dich' : 'alles erledigt'}</span>
        </a>
      </div>

      <section class="stack">
        <div class="section-head">
          <h2 class="section-title">Gerade unterwegs</h2>
          <a class="link-btn" href="#/joints">Alle ${icon('chevron-right', { size: 16 })}</a>
        </div>
        ${active.length
          ? active.slice(0, 3).map((j) => jointCard(j))
          : emptyState({
              iconName: 'cigarette',
              title: 'Gerade ist kein Joint unterwegs',
              text: 'Wenn jemand rollt, erscheint er hier – und alle können sich einen Platz in der Rotation sichern.',
              action: html`<button type="button" class="btn btn--glass btn--sm" data-click="new-request">${icon('hand-heart', { size: 16 })} Jemanden fragen</button>`,
            })}
      </section>

      ${incoming.length ? html`
        <section class="stack">
          <div class="section-head">
            <h2 class="section-title">Anfragen an dich</h2>
            <a class="link-btn" href="#/anfragen">Alle ${icon('chevron-right', { size: 16 })}</a>
          </div>
          ${incoming.slice(0, 2).map(requestCard)}
        </section>` : ''}

      ${consumptionChart(days)}

      ${low.length ? html`
        <section class="stack">
          <div class="section-head"><h2 class="section-title">Wird knapp</h2></div>
          <div class="card glass card--tight list">
            ${low.map((s) => html`
              <button type="button" class="list__item" data-click="open-strain" data-strain="${s.id}" style="text-align:left;width:100%">
                <span class="type-dot" data-type="${s.type ?? ''}"></span>
                <span class="grow strong ellipsis">${s.name}</span>
                <span class="num muted">${fmtG(s.grams)}</span>
                ${levelStatus(s)}
              </button>`)}
          </div>
        </section>` : ''}

      <section class="stack">
        <div class="section-head"><h2 class="section-title">Aktivität</h2></div>
        <div class="card glass card--tight" style="padding-top:4px;padding-bottom:4px">
          ${activity.length ? activityFeed(activity) : html`<p class="small faint" style="padding:12px 0">Noch nichts passiert.</p>`}
        </div>
      </section>
    </div>`;
}

export const dashboardHandlers = {
  'chart-bar'(el) {
    const wasActive = el.classList.contains('is-active');
    el.parentElement.querySelectorAll('.chart__col').forEach((c) => c.classList.remove('is-active'));
    if (!wasActive) el.classList.add('is-active');
  },
};
