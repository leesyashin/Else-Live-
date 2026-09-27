// Joints: was gerade unterwegs ist, der Verlauf nach Tagen und die Statistik.

import { avatar, emptyState, jointCard, jointStatus, nameOf, strainMark } from '../components.js';
import { pressed } from '../lib/constants.js';
import { dayLabel, fmtEur, fmtG, fmtInt, fmtNum, fmtTime, html, startOfDay } from '../lib/html.js';
import { icon } from '../lib/icons.js';
import { activeJoints, emit, jointStrainNames, jointsNewest, member, strain } from '../store.js';
import { computeStats } from '../stats.js';

let tab = 'active';
let range = 30;

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
          <span class="tiny faint num">${items.length} · ${fmtG(items.reduce((s, j) => s + j.grams, 0))}</span>
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

function hbars(rows) {
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return html`
    <div class="hbars">
      ${rows.map(
        (r) => html`
          <div class="hbar" title="${r.title}">
            <span class="hbar__label">${r.mark}<span>${r.label}</span></span>
            <span class="hbar__track"><span class="hbar__fill" style="display:block;width:${((r.value / max) * 100).toFixed(1)}%"></span></span>
            <span class="hbar__value">${r.valueText}</span>
          </div>`,
      )}
    </div>`;
}

function share(label, part, total, partLabel, restLabel) {
  const pct = total ? Math.round((part / total) * 100) : 0;
  return html`
    <div class="share">
      <div class="row row--between small"><span class="strong">${label}</span><span class="muted num">${pct} %</span></div>
      <div class="share__bar" role="img" aria-label="${label}: ${pct} Prozent">
        ${pct > 0 ? html`<span class="share__part" style="width:${pct}%"></span>` : ''}
        ${pct < 100 ? html`<span class="share__part share__part--rest" style="flex:1"></span>` : ''}
      </div>
      <div class="share__legend"><span>${partLabel} · ${part}</span><span>${restLabel} · ${total - part}</span></div>
    </div>`;
}

function statsView(all) {
  const s = computeStats(all, range);
  const seg = (value, label) => html`
    <button type="button" class="segmented__opt" data-click="stats-range" data-value="${value ?? 'all'}" aria-pressed="${pressed(range === value)}">${label}</button>`;
  const rangeText = range ? `in den letzten ${range} Tagen` : 'insgesamt';

  if (!s.count) {
    return html`
      <div class="segmented" role="group" aria-label="Zeitraum">${seg(7, '7 Tage')}${seg(30, '30 Tage')}${seg(null, 'Alles')}</div>
      ${emptyState({ iconName: 'chart-column', title: 'Noch keine Daten', text: `Keine Joints ${rangeText}.` })}`;
  }

  const hour = s.peakHour;
  return html`
    <div class="segmented" role="group" aria-label="Zeitraum">${seg(7, '7 Tage')}${seg(30, '30 Tage')}${seg(null, 'Alles')}</div>

    <div class="grid-2">
      <div class="stat glass"><span class="stat__label">Joints</span><span class="stat__value">${fmtInt(s.count)}</span><span class="stat__delta">${rangeText}</span></div>
      <div class="stat glass"><span class="stat__label">Verbraucht</span><span class="stat__value">${fmtNum(s.grams)}<span class="small muted"> g</span></span><span class="stat__delta">Ø ${fmtG(s.avg)} pro Joint</span></div>
      <div class="stat glass"><span class="stat__label">THC</span><span class="stat__value">≈ ${fmtNum(Math.round(s.thcMg / 100) / 10)}<span class="small muted"> g</span></span><span class="stat__delta">≈ ${fmtInt(s.thcMg / s.count)} mg pro Joint</span></div>
      <div class="stat glass"><span class="stat__label">Kosten</span><span class="stat__value">${s.cost != null ? fmtEur(s.cost) : '–'}</span><span class="stat__delta">${s.cost != null ? 'bei Sorten mit Preis' : 'Preis bei den Sorten eintragen'}</span></div>
    </div>

    <section class="card glass stack">
      <h2 class="card-title">${icon('trophy', { size: 18 })} Wer rollt am meisten?</h2>
      ${hbars(
        s.rollers.map((r, i) => ({
          mark: avatar(member(r.id), { size: 'xs', online: false }),
          label: `${i === 0 ? '👑 ' : ''}${nameOf(r.id)}`,
          value: r.count,
          valueText: `${r.count} · ${fmtG(r.grams)}`,
          title: `${nameOf(r.id)}: ${r.count} Joints, ${fmtG(r.grams)}`,
        })),
      )}
    </section>

    <section class="card glass stack">
      <h2 class="card-title">${icon('cannabis', { size: 18 })} Sorten</h2>
      ${hbars(
        s.strains.slice(0, 8).map((x) => {
          const st = strain(x.id);
          return {
            mark: strainMark(st, { size: 'sm' }),
            label: st?.name ?? 'Unbekannt',
            value: x.grams,
            valueText: fmtG(x.grams),
            title: `${st?.name ?? 'Unbekannt'}: ${fmtG(x.grams)}`,
          };
        }),
      )}
    </section>

    <section class="card glass stack stack--lg">
      <h2 class="card-title">${icon('joint', { size: 18 })} Gewohnheiten</h2>
      ${share('Mit Tabak', s.withTobacco, s.count, 'Mit Tabak', 'Pur')}
      ${share('Mit Aktivkohlefilter', s.withFilter, s.count, 'Mit Filter', 'Ohne')}
      <div class="list">
        ${s.topTobacco ? html`<div class="list__item">${icon('leaf', { size: 18 })}<span class="grow muted">Beliebtester Tabak</span><span class="strong">${s.topTobacco}</span></div>` : ''}
        ${s.topFilter ? html`<div class="list__item">${icon('carbon-filter', { size: 18 })}<span class="grow muted">Beliebtester Filter</span><span class="strong">${s.topFilter}</span></div>` : ''}
        ${hour !== null ? html`<div class="list__item">${icon('clock', { size: 18 })}<span class="grow muted">Meistens gerollt</span><span class="strong">${hour}–${(hour + 1) % 24} Uhr</span></div>` : ''}
        <div class="list__item">${icon('users', { size: 18 })}<span class="grow muted">Ø in der Rotation</span><span class="strong">${fmtNum(Math.round(s.avgRotation * 10) / 10)} Personen</span></div>
      </div>
    </section>`;
}

export function jointsView() {
  const all = jointsNewest();
  const active = activeJoints();
  const today = startOfDay().getTime();
  const todays = all.filter((j) => Date.parse(j.createdAt) >= today);

  const seg = (key, label, count) => html`
    <button type="button" class="segmented__opt" data-click="joints-tab" data-value="${key}" aria-pressed="${pressed(tab === key)}">
      ${label}${count ? html` <span class="segmented__count">${count}</span>` : ''}
    </button>`;

  let content;
  if (tab === 'stats') {
    content = statsView(all);
  } else if (tab === 'history') {
    content = all.length
      ? historyList(all)
      : emptyState({ iconName: 'history', title: 'Noch kein Verlauf', text: 'Hier erscheinen alle eingetragenen Joints.' });
  } else {
    content = active.length
      ? html`<div class="stack">${active.map((j) => jointCard(j))}</div>`
      : emptyState({
          iconName: 'joint',
          title: 'Nichts unterwegs',
          text: 'Trag einen gerollten Joint ein. Die Gruppe bekommt eine Push-Nachricht und kann sich in die Rotation eintragen.',
          action: html`<button type="button" class="btn btn--primary" data-click="open-roll">${icon('joint', { size: 18 })} Joint gerollt</button>`,
        });
  }

  return html`
    <div class="stack stack--lg">
      <header class="page-head">
        <div>
          <h1 class="page-title">Joints</h1>
          <p class="page-sub">Heute ${fmtInt(todays.length)} · insgesamt ${fmtInt(all.length)}</p>
        </div>
        <button type="button" class="btn btn--primary btn--sm" data-click="open-roll">${icon('plus', { size: 18 })} Gerollt</button>
      </header>

      <div class="segmented" role="group" aria-label="Ansicht">
        ${seg('active', 'Unterwegs', active.length)}
        ${seg('history', 'Verlauf', 0)}
        ${seg('stats', 'Statistik', 0)}
      </div>

      ${content}
    </div>`;
}

export const jointsHandlers = {
  'joints-tab'(el) {
    tab = el.dataset.value;
    emit();
  },
  'stats-range'(el) {
    range = el.dataset.value === 'all' ? null : Number(el.dataset.value);
    emit();
  },
};
