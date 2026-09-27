// Wiederverwendbare Darstellungen: Avatare, Karten für Joints, Sorten und Anfragen.

import { fmtEur, fmtG, fmtNum, fmtPct, html, relTime } from './lib/html.js';
import { icon } from './lib/icons.js';
import {
  isOnline,
  jointCost,
  jointStrainNames,
  jointThcMg,
  me,
  member,
  settings,
  stockLevel,
  strain,
} from './store.js';

export const TYPE_LABELS = { sativa: 'Sativa', indica: 'Indica', hybrid: 'Hybrid' };

export function avatar(m, { size = '', online } = {}) {
  const cls = size ? `avatar avatar--${size}` : 'avatar';
  if (!m) return html`<span class="${cls}" style="--c:#7d8a78" aria-hidden="true">?</span>`;
  const on = online ?? isOnline(m.id);
  return html`<span class="${cls}" style="--c:${m.color}" data-online="${on}" aria-hidden="true">${m.emoji}</span>`;
}

export const nameOf = (id) => (id === me()?.id ? 'Du' : member(id)?.name ?? 'Jemand');
const isMe = (id) => id === me()?.id;

export function emptyState({ iconName = 'cannabis', title, text, action }) {
  return html`
    <div class="card glass empty">
      <div class="empty__icon">${icon(iconName, { size: 26 })}</div>
      <div class="empty__title">${title}</div>
      ${text ? html`<p class="empty__text">${text}</p>` : ''}
      ${action ?? ''}
    </div>`;
}

/** Kleine Zeile mit Icons und Trennpunkten: [["leaf", "Pueblo"], …] */
export function metaLine(items, { className = '' } = {}) {
  const parts = items.filter(Boolean);
  if (!parts.length) return '';
  return html`
    <div class="meta-line ${className}">
      ${parts.map(([ic, text]) => html`<span class="meta-line__item">${icon(ic, { size: 15 })}<span>${text}</span></span>`)}
    </div>`;
}

// ---------------------------------------------------------------------------
// Sorte

/** Cannabis-Blatt in der Farbe des Typs. */
export function strainMark(s, { size = 'md' } = {}) {
  return html`<span class="strain-mark strain-mark--${size}" data-type="${s?.type ?? ''}" aria-hidden="true">${icon('cannabis', { size: size === 'sm' ? 16 : 22 })}</span>`;
}

export function strainFacts(s) {
  const bits = [s.type ? TYPE_LABELS[s.type] : null];
  if (s.thc != null) bits.push(`THC ${fmtPct(s.thc)}`);
  if (s.cbd != null) bits.push(`CBD ${fmtPct(s.cbd)}`);
  return bits.filter(Boolean).join(' · ');
}

export function levelStatus(s) {
  const level = stockLevel(s);
  if (level === 'empty') return html`<span class="status status--danger">${icon('triangle-alert')} Leer</span>`;
  if (level === 'low') return html`<span class="status status--warn">${icon('triangle-alert')} Wird knapp</span>`;
  return '';
}

export function stockMeter(s, { large = false } = {}) {
  const level = stockLevel(s);
  const pct = s.refillLevel > 0 ? Math.max(0, Math.min(100, (s.grams / s.refillLevel) * 100)) : 0;
  return html`
    <div class="meter ${large ? 'meter--lg' : ''}" data-level="${level}" role="meter"
      aria-label="Restbestand" aria-valuemin="0" aria-valuemax="${s.refillLevel}" aria-valuenow="${s.grams}">
      <div class="meter__fill" style="width:${pct.toFixed(1)}%"></div>
    </div>`;
}

export function effectTags(s, { limit = 3 } = {}) {
  const list = s.effects ?? [];
  if (!list.length) return '';
  const shown = list.slice(0, limit);
  return html`
    <div class="effect-tags">
      ${shown.map((e) => html`<span class="effect-tag">${e}</span>`)}
      ${list.length > limit ? html`<span class="effect-tag effect-tag--more">+${list.length - limit}</span>` : ''}
    </div>`;
}

export function strainCard(s) {
  const owner = member(s.ownerId);
  return html`
    <article class="card glass strain-card card--interactive" data-click="open-strain" data-strain="${s.id}">
      <div class="strain-card__top">
        ${strainMark(s)}
        <div class="grow">
          <h3 class="strain-card__name">${s.name}</h3>
          <p class="small muted">${strainFacts(s) || 'Keine Angaben'}</p>
        </div>
        <div class="strain-card__grams">
          <div class="strain-card__value">${fmtNum(s.grams)}<span class="small muted"> g</span></div>
          ${levelStatus(s)}
        </div>
      </div>
      ${stockMeter(s)}
      ${effectTags(s)}
      <div class="row small faint">
        ${owner ? html`${avatar(owner, { size: 'xs', online: false })}<span class="ellipsis">${nameOf(owner.id)}</span>` : ''}
        ${s.producer ? html`<span class="ellipsis">· ${s.producer}</span>` : ''}
        <span class="grow"></span>
        ${s.pricePerGram != null ? html`<span class="num">${fmtEur(s.pricePerGram)}/g</span>` : ''}
      </div>
    </article>`;
}

/** Kompakte Zeile für die Übersicht. */
export function stockRow(s) {
  const level = stockLevel(s);
  return html`
    <button type="button" class="stock-row" data-click="open-strain" data-strain="${s.id}">
      ${strainMark(s, { size: 'sm' })}
      <span class="stock-row__body">
        <span class="stock-row__name ellipsis">${s.name}</span>
        ${stockMeter(s)}
      </span>
      <span class="stock-row__grams num" data-level="${level}">${fmtG(s.grams)}</span>
    </button>`;
}

// ---------------------------------------------------------------------------
// Joint

export function jointStatus(j) {
  if (j.status === 'lit') return html`<span class="status status--lit">${icon('flame')} Brennt</span>`;
  if (j.status === 'done') return html`<span class="status status--done">${icon('check')} Aufgeraucht</span>`;
  return html`<span class="status status--ready">${icon('sparkles')} Bereit</span>`;
}

export const rotationSize = (j) => Math.max(settings().rotationSize ?? 5, ...j.rotation.map((r) => r.position));

/** Kann ich mir bei diesem Joint gerade Platz p sichern? */
export function canClaim(j, p) {
  const myId = me()?.id;
  if (j.status === 'done' || j.rolledBy === myId || p < 2) return false;
  if (j.rotation.some((r) => r.position === p)) return false;
  if (j.status === 'lit') {
    if (p <= j.turn) return false;
    const mine = j.rotation.find((r) => r.memberId === myId);
    if (mine && mine.position <= j.turn) return false;
  }
  return true;
}

export function firstFreeSlot(j) {
  for (let p = 2; p <= rotationSize(j); p += 1) if (canClaim(j, p)) return p;
  return null;
}

export function rotationRow(j) {
  const myId = me()?.id;
  const slots = [];
  for (let p = 1; p <= rotationSize(j); p += 1) {
    const entry = j.rotation.find((r) => r.position === p);
    const turn = j.status === 'lit' && j.turn === p;
    const past = j.status === 'done' || (j.status === 'lit' && p < j.turn);
    if (entry) {
      slots.push(html`
        <div class="slot-wrap" role="listitem">
          <div class="slot" data-me="${entry.memberId === myId}" data-turn="${turn}" data-past="${past}">
            ${avatar(member(entry.memberId), { online: false })}<span class="slot__pos">${p}</span>
          </div>
          <span class="slot-name">${nameOf(entry.memberId)}</span>
        </div>`);
    } else if (canClaim(j, p)) {
      slots.push(html`
        <div class="slot-wrap" role="listitem">
          <button type="button" class="slot slot--free" data-click="claim-slot" data-joint="${j.id}" data-position="${p}"
            aria-label="Platz ${p} sichern">${icon('plus')}<span class="slot__pos">${p}</span></button>
          <span class="slot-name faint">frei</span>
        </div>`);
    } else {
      slots.push(html`
        <div class="slot-wrap" role="listitem">
          <div class="slot slot--free" data-past="${past}"><span class="slot__pos">${p}</span></div>
          <span class="slot-name faint">${past ? '–' : 'frei'}</span>
        </div>`);
    }
  }
  return html`<div class="rotation" role="list" aria-label="Rotation">${slots}</div>`;
}

export function jointMeta(j) {
  const thc = jointThcMg(j);
  const cost = jointCost(j);
  return metaLine([
    j.tobacco ? ['leaf', j.tobacco] : ['cannabis', 'Pur'],
    j.carbonFilter ? ['carbon-filter', j.filterBrand ?? 'Aktivkohlefilter'] : ['x', 'Ohne Aktivkohle'],
    thc > 0 ? ['droplet', `≈ ${fmtNum(Math.round(thc))} mg THC`] : null,
    cost != null ? ['euro', fmtEur(cost)] : null,
  ]);
}

function jointActions(j) {
  const myId = me()?.id;
  const mine = j.rotation.find((r) => r.memberId === myId);
  const holder = j.status === 'lit' ? j.rotation.find((r) => r.position === j.turn) : null;
  const myTurn = holder?.memberId === myId;
  const free = firstFreeSlot(j);
  const buttons = [];

  if (j.status === 'ready') {
    buttons.push(html`<button type="button" class="btn btn--fire btn--sm" data-click="light-joint" data-joint="${j.id}">${icon('lighter', { size: 16 })} Anzünden</button>`);
    if (!mine && free) {
      buttons.push(html`<button type="button" class="btn btn--primary btn--sm" data-click="claim-slot" data-joint="${j.id}" data-position="${free}">${icon('user-plus', { size: 16 })} Platz #${free} sichern</button>`);
    }
  } else if (j.status === 'lit') {
    const last = !j.rotation.some((r) => r.position > j.turn);
    buttons.push(html`<button type="button" class="btn ${myTurn ? 'btn--primary' : 'btn--glass'} btn--sm" data-click="pass-joint" data-joint="${j.id}">
      ${icon(last ? 'check' : 'skip-forward', { size: 16 })} ${last ? 'Letzter Zug – beenden' : 'Weitergeben'}</button>`);
    if (!mine && free) {
      buttons.push(html`<button type="button" class="btn btn--glass btn--sm" data-click="claim-slot" data-joint="${j.id}" data-position="${free}">${icon('user-plus', { size: 16 })} #${free}</button>`);
    }
  }
  return buttons.length ? html`<div class="joint-card__actions">${buttons}</div>` : '';
}

function turnBanner(j) {
  if (j.status !== 'lit') return '';
  const holder = j.rotation.find((r) => r.position === j.turn);
  if (!holder) return '';
  if (isMe(holder.memberId)) {
    return html`<div class="turn-banner">${icon('flame', { size: 18 })} Du bist dran! Danach weitergeben.</div>`;
  }
  return html`<div class="turn-banner">${icon('flame', { size: 18 })} Gerade bei ${member(holder.memberId)?.name ?? 'jemandem'} (#${j.turn})</div>`;
}

export function jointCard(j, { detail = false } = {}) {
  const firstStrain = strain(j.components[0]?.strainId);
  const mixed = j.components.length > 1;
  const cls = detail ? 'card glass joint-card' : 'card glass joint-card card--interactive';
  return html`
    <article class="${cls}" data-status="${j.status}" ${detail ? '' : html`data-click="open-joint" data-joint="${j.id}"`}>
      <div class="joint-card__head">
        ${avatar(member(j.rolledBy), { size: 'sm' })}
        <div class="grow">
          <div class="strong ellipsis">${nameOf(j.rolledBy)} ${isMe(j.rolledBy) ? 'hast' : 'hat'} gerollt</div>
          <div class="tiny faint">${relTime(j.createdAt)}${j.requestId ? ' · auf Anfrage' : ''}</div>
        </div>
        ${jointStatus(j)}
      </div>
      <div class="joint-card__main">
        <span class="joint-card__icon" aria-hidden="true">${icon('joint', { size: 26 })}</span>
        <div class="grow">
          <div class="joint-card__strain ellipsis">${jointStrainNames(j)}</div>
          <div class="small muted">${mixed ? `Mischung aus ${j.components.length} Sorten` : firstStrain ? strainFacts(firstStrain) : ''}</div>
        </div>
        <div class="joint-card__grams">${fmtNum(j.grams)}<span>g</span></div>
      </div>
      ${jointMeta(j)}
      ${j.note && !detail ? html`<p class="joint-card__note">„${j.note}“</p>` : ''}
      ${turnBanner(j)}
      ${rotationRow(j)}
      ${jointActions(j)}
    </article>`;
}

// ---------------------------------------------------------------------------
// Anfrage

const REQUEST_STATUS = {
  open: ['status--warn', 'clock', 'Offen'],
  accepted: ['status--ready', 'check', 'Angenommen'],
  done: ['status--done', 'circle-check', 'Erledigt'],
  declined: ['status--danger', 'x', 'Abgelehnt'],
  cancelled: ['status--muted', 'undo-2', 'Zurückgezogen'],
};

export function requestStatus(r) {
  const [cls, ic, label] = REQUEST_STATUS[r.status] ?? REQUEST_STATUS.open;
  return html`<span class="status ${cls}">${icon(ic)} ${label}</span>`;
}

export function requestCard(r) {
  const myId = me()?.id;
  const from = member(r.fromId);
  const to = r.toId ? member(r.toId) : null;
  const wishedStrain = r.strainId ? strain(r.strainId) : null;
  const open = r.status === 'open' || r.status === 'accepted';
  const incoming = r.fromId !== myId && (r.toId === myId || !r.toId);
  const buttons = [];

  if (open && incoming) {
    buttons.push(html`<button type="button" class="btn btn--primary btn--sm" data-click="fulfil-request" data-request="${r.id}">${icon('joint', { size: 16 })} Jetzt rollen</button>`);
    if (r.status === 'open') {
      buttons.push(html`<button type="button" class="btn btn--glass btn--sm" data-click="accept-request" data-request="${r.id}">${icon('check', { size: 16 })} Mach ich</button>`);
    }
    if (r.toId === myId) {
      buttons.push(html`<button type="button" class="btn btn--ghost btn--sm" data-click="decline-request" data-request="${r.id}">Gerade nicht</button>`);
    }
  } else if (open && r.fromId === myId) {
    buttons.push(html`<button type="button" class="btn btn--ghost btn--sm" data-click="cancel-request" data-request="${r.id}">${icon('undo-2', { size: 16 })} Zurückziehen</button>`);
  } else if (r.status === 'done' && r.jointId) {
    buttons.push(html`<button type="button" class="btn btn--glass btn--sm" data-click="open-joint" data-joint="${r.jointId}">${icon('joint', { size: 16 })} Zum Joint</button>`);
  }

  const acceptedBy = r.status === 'accepted' && r.handledBy ? nameOf(r.handledBy) : null;

  return html`
    <article class="card glass request-card">
      <div class="row">
        <div class="request-card__route grow">
          ${avatar(from, { size: 'sm' })}
          <span class="ellipsis">${nameOf(r.fromId)}</span>
          ${icon('arrow-right')}
          ${to ? html`${avatar(to, { size: 'sm' })}<span class="ellipsis">${nameOf(r.toId)}</span>` : html`<span class="badge">${icon('users')} Alle</span>`}
        </div>
        ${requestStatus(r)}
      </div>
      ${r.message ? html`<div class="bubble">${r.message}</div>` : ''}
      ${metaLine([
        r.grams ? ['scale', `Wunsch: ${fmtG(r.grams)}`] : null,
        wishedStrain ? ['cannabis', wishedStrain.name] : null,
        ['clock', relTime(r.createdAt)],
        acceptedBy ? ['check', `${acceptedBy} ${r.handledBy === myId ? 'hast' : 'hat'} zugesagt`] : null,
      ])}
      ${buttons.length ? html`<div class="joint-card__actions">${buttons}</div>` : ''}
    </article>`;
}

// ---------------------------------------------------------------------------
// Aktivitäts-Feed

const subject = (id) => (isMe(id) ? 'Du' : member(id)?.name ?? 'Jemand');
const accusative = (id) => (isMe(id) ? 'dich' : member(id)?.name ?? 'jemanden');
/** „Du hast …“ / „Lisa hat …“ – Verb passend zur Person. */
const says = (id, du, er, rest) => `${subject(id)} ${isMe(id) ? du : er} ${rest}`;

const ACTIVITY = {
  member_joined: ['user-plus', 'amber', (a) => says(a.actorId, 'bist', 'ist', 'der Gruppe beigetreten')],
  strain_added: ['cannabis', 'accent', (a) => says(a.actorId, 'hast', 'hat', `${a.strainName} eingetragen (${fmtG(a.grams)})`)],
  strain_restocked: ['jar', 'accent', (a) => says(a.actorId, 'hast', 'hat', `${a.strainName} aufgefüllt (+${fmtG(a.grams)})`)],
  strain_corrected: ['scale', '', (a) => says(a.actorId, 'hast', 'hat', `den Bestand von ${a.strainName} korrigiert (${a.grams > 0 ? '+' : ''}${fmtG(a.grams)})`)],
  strain_archived: ['archive', '', (a) => says(a.actorId, 'hast', 'hat', `${a.strainName} archiviert`)],
  strain_removed: ['trash-2', '', (a) => says(a.actorId, 'hast', 'hat', `${a.strainName} entfernt`)],
  joint_rolled: ['joint', 'accent', (a) => says(a.actorId, 'hast', 'hat', `gerollt: ${fmtG(a.grams)} ${a.summary}`)],
  joint_lit: ['flame', 'fire', (a) => says(a.actorId, 'hast', 'hat', 'einen Joint angezündet')],
  joint_passed: ['skip-forward', 'fire', (a) => says(a.actorId, 'hast', 'hat', `an ${accusative(a.toId)} weitergegeben (#${a.position})`)],
  joint_done: ['check', '', (a) => says(a.actorId, 'hast', 'hat', 'einen Joint als aufgeraucht markiert')],
  joint_auto_done: ['timer', '', () => 'Ein Joint wurde nach ein paar Stunden automatisch beendet'],
  joint_deleted: ['undo-2', '', (a) => says(a.actorId, 'hast', 'hat', `einen Joint-Eintrag gelöscht (${fmtG(a.grams)} zurückgebucht)`)],
  rotation_joined: ['repeat', 'amber', (a) => says(a.actorId, 'bist', 'ist', `#${a.position} in der Rotation`)],
  request_created: ['hand-heart', 'amber', (a) =>
    a.toId ? says(a.actorId, 'fragst', 'fragt', `${accusative(a.toId)}, ob gerollt wird`) : says(a.actorId, 'suchst', 'sucht', 'jemanden, der rollt')],
  request_accepted: ['check', 'accent', (a) => says(a.actorId, 'rollst', 'rollt', `für ${accusative(a.toId)}`)],
  request_declined: ['x', '', (a) => says(a.actorId, 'kannst', 'kann', `gerade nicht für ${accusative(a.toId)} rollen`)],
};

export function activityFeed(items) {
  return html`
    <div class="feed">
      ${items.map((a) => {
        const [ic, tone, text] = ACTIVITY[a.type] ?? ['info', '', () => a.type];
        return html`
          <div class="feed__item">
            <div class="feed__icon" data-tone="${tone}">${icon(ic)}</div>
            <div class="grow">
              <div class="feed__text">${text(a)}</div>
              <div class="feed__time">${relTime(a.at)}</div>
            </div>
          </div>`;
      })}
    </div>`;
}
