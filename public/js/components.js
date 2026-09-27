// Wiederverwendbare Darstellungen: Avatare, Karten für Joints, Sorten und Anfragen.

import { fmtG, fmtNum, fmtPct, html, relTime } from './lib/html.js';
import { icon } from './lib/icons.js';
import {
  isOnline,
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
  if (!m) return html`<span class="${cls}" style="--c:#6b7280" aria-hidden="true">?</span>`;
  const on = online ?? isOnline(m.id);
  return html`<span class="${cls}" style="--c:${m.color}" data-online="${on}" aria-hidden="true">${m.emoji}</span>`;
}

export const nameOf = (id) => (id === me()?.id ? 'Du' : member(id)?.name ?? 'Jemand');

export function typeBadge(type) {
  if (!type) return '';
  return html`<span class="badge"><span class="type-dot" data-type="${type}"></span>${TYPE_LABELS[type]}</span>`;
}

export function thcBadges(s) {
  return html`
    ${s.thc !== null && s.thc !== undefined ? html`<span class="badge">THC ${fmtPct(s.thc)}</span>` : ''}
    ${s.cbd !== null && s.cbd !== undefined ? html`<span class="badge">CBD ${fmtPct(s.cbd)}</span>` : ''}`;
}

export function emptyState({ iconName = 'leaf', title, text, action }) {
  return html`
    <div class="card glass empty">
      <div class="empty__icon">${icon(iconName, { size: 26 })}</div>
      <div class="empty__title">${title}</div>
      ${text ? html`<p class="empty__text">${text}</p>` : ''}
      ${action ?? ''}
    </div>`;
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

// ---------------------------------------------------------------------------
// Sorte

export function strainCard(s) {
  const owner = member(s.ownerId);
  return html`
    <article class="card glass strain-card card--interactive" data-click="open-strain" data-strain="${s.id}">
      <div class="strain-card__top">
        <div class="grow">
          <h3 class="strain-card__name">${s.name}</h3>
          <div class="row row--wrap" style="gap:6px;margin-top:8px">${typeBadge(s.type)} ${thcBadges(s)}</div>
        </div>
        <div class="strain-card__grams">
          <div class="strain-card__value">${fmtNum(s.grams)}<span class="small muted"> g</span></div>
          <div style="margin-top:6px">${levelStatus(s)}</div>
        </div>
      </div>
      ${stockMeter(s)}
      <div class="row small faint">
        ${owner ? html`${avatar(owner, { size: 'xs', online: false })}<span class="ellipsis">${nameOf(owner.id)}</span>` : ''}
        ${s.producer ? html`<span class="ellipsis">· ${s.producer}</span>` : ''}
        <span class="grow"></span>
        <span class="num">${s.refillLevel > 0 ? `von ${fmtG(s.refillLevel)}` : ''}</span>
      </div>
    </article>`;
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
      const m = member(entry.memberId);
      slots.push(html`
        <div class="slot-wrap" role="listitem">
          <div class="slot" data-me="${entry.memberId === myId}" data-turn="${turn}" data-past="${past}">
            ${avatar(m, { online: false })}<span class="slot__pos">${p}</span>
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

export function jointFacts(j) {
  const thc = jointThcMg(j);
  return html`
    <div class="joint-card__meta">
      <span class="chip">${icon('wind')} ${j.tobacco ?? 'Pur, ohne Tabak'}</span>
      <span class="chip">${icon(j.carbonFilter ? 'shield-check' : 'x')}
        ${j.carbonFilter ? j.filterBrand ?? 'Aktivkohlefilter' : 'Ohne Aktivkohlefilter'}</span>
      ${thc > 0 ? html`<span class="chip">${icon('droplet')} ≈ ${fmtNum(Math.round(thc))} mg THC</span>` : ''}
    </div>`;
}

function jointActions(j) {
  const myId = me()?.id;
  const mine = j.rotation.find((r) => r.memberId === myId);
  const holder = j.status === 'lit' ? j.rotation.find((r) => r.position === j.turn) : null;
  const myTurn = holder?.memberId === myId;
  const free = firstFreeSlot(j);
  const buttons = [];

  if (j.status === 'ready') {
    buttons.push(html`<button type="button" class="btn btn--fire btn--sm" data-click="light-joint" data-joint="${j.id}">${icon('flame', { size: 16 })} Anzünden</button>`);
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
  if (holder.memberId === me()?.id) {
    return html`<div class="turn-banner">${icon('flame', { size: 18 })} Du bist dran! Danach weitergeben.</div>`;
  }
  return html`<div class="turn-banner">${icon('flame', { size: 18 })} Gerade bei ${member(holder.memberId)?.name ?? 'jemandem'} (#${j.turn})</div>`;
}

export function jointCard(j, { detail = false } = {}) {
  const roller = member(j.rolledBy);
  const firstStrain = strain(j.components[0]?.strainId);
  const mixed = j.components.length > 1;
  const cls = detail ? 'card glass joint-card' : 'card glass joint-card card--interactive';
  return html`
    <article class="${cls}" data-status="${j.status}" ${detail ? '' : html`data-click="open-joint" data-joint="${j.id}"`}>
      <div class="joint-card__head">
        ${avatar(roller, { size: 'sm' })}
        <div class="grow">
          <div class="strong ellipsis">${nameOf(j.rolledBy)} ${j.rolledBy === me()?.id ? 'hast' : 'hat'} gerollt</div>
          <div class="tiny faint">${relTime(j.createdAt)}${j.requestId ? ' · auf Anfrage' : ''}</div>
        </div>
        ${jointStatus(j)}
      </div>
      <div class="row" style="align-items:flex-end;gap:14px">
        <div class="joint-card__grams">${fmtNum(j.grams)}<span class="hero__unit" style="font-size:18px">g</span></div>
        <div class="grow">
          <div class="joint-card__strain ellipsis">${jointStrainNames(j)}</div>
          <div class="small muted">${mixed ? `Mischung aus ${j.components.length} Sorten` : firstStrain?.thc != null ? `${fmtPct(firstStrain.thc)} THC` : ''}</div>
        </div>
      </div>
      ${jointFacts(j)}
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
    buttons.push(html`<button type="button" class="btn btn--primary btn--sm" data-click="fulfil-request" data-request="${r.id}">${icon('cigarette', { size: 16 })} Jetzt rollen</button>`);
    if (r.status === 'open') {
      buttons.push(html`<button type="button" class="btn btn--glass btn--sm" data-click="accept-request" data-request="${r.id}">${icon('check', { size: 16 })} Mach ich</button>`);
    }
    if (r.toId === myId) {
      buttons.push(html`<button type="button" class="btn btn--ghost btn--sm" data-click="decline-request" data-request="${r.id}">Gerade nicht</button>`);
    }
  } else if (open && r.fromId === myId) {
    buttons.push(html`<button type="button" class="btn btn--ghost btn--sm" data-click="cancel-request" data-request="${r.id}">${icon('undo-2', { size: 16 })} Zurückziehen</button>`);
  } else if (r.status === 'done' && r.jointId) {
    buttons.push(html`<button type="button" class="btn btn--glass btn--sm" data-click="open-joint" data-joint="${r.jointId}">${icon('cigarette', { size: 16 })} Zum Joint</button>`);
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
      ${wishedStrain || r.grams ? html`
        <div class="row row--wrap" style="gap:6px">
          <span class="small faint">Wunsch:</span>
          ${r.grams ? html`<span class="chip">${icon('scale')} ${fmtG(r.grams)}</span>` : ''}
          ${wishedStrain ? html`<span class="chip">${icon('leaf')} ${wishedStrain.name}</span>` : ''}
        </div>` : ''}
      <div class="tiny faint">${relTime(r.createdAt)}${acceptedBy ? ` · ${acceptedBy} ${r.handledBy === myId ? 'hast' : 'hat'} zugesagt` : ''}</div>
      ${buttons.length ? html`<div class="joint-card__actions">${buttons}</div>` : ''}
    </article>`;
}

// ---------------------------------------------------------------------------
// Aktivitäts-Feed

const isMe = (id) => id === me()?.id;
const subject = (id) => (isMe(id) ? 'Du' : member(id)?.name ?? 'Jemand');
const accusative = (id) => (isMe(id) ? 'dich' : member(id)?.name ?? 'jemanden');
/** „Du hast …“ / „Lisa hat …“ – Verb passend zur Person. */
const says = (id, du, er, rest) => `${subject(id)} ${isMe(id) ? du : er} ${rest}`;

const ACTIVITY = {
  member_joined: ['user-plus', 'violet', (a) => says(a.actorId, 'bist', 'ist', 'der Gruppe beigetreten')],
  strain_added: ['leaf', 'accent', (a) => says(a.actorId, 'hast', 'hat', `${a.strainName} eingetragen (${fmtG(a.grams)})`)],
  strain_restocked: ['package', 'accent', (a) => says(a.actorId, 'hast', 'hat', `${a.strainName} aufgefüllt (+${fmtG(a.grams)})`)],
  strain_corrected: ['pencil', '', (a) => says(a.actorId, 'hast', 'hat', `den Bestand von ${a.strainName} korrigiert (${a.grams > 0 ? '+' : ''}${fmtG(a.grams)})`)],
  strain_archived: ['archive', '', (a) => says(a.actorId, 'hast', 'hat', `${a.strainName} archiviert`)],
  strain_removed: ['trash-2', '', (a) => says(a.actorId, 'hast', 'hat', `${a.strainName} entfernt`)],
  joint_rolled: ['cigarette', 'accent', (a) => says(a.actorId, 'hast', 'hat', `gerollt: ${fmtG(a.grams)} ${a.summary}`)],
  joint_lit: ['flame', 'fire', (a) => says(a.actorId, 'hast', 'hat', 'einen Joint angezündet')],
  joint_passed: ['skip-forward', 'fire', (a) => says(a.actorId, 'hast', 'hat', `an ${accusative(a.toId)} weitergegeben (#${a.position})`)],
  joint_done: ['check', '', (a) => says(a.actorId, 'hast', 'hat', 'einen Joint als aufgeraucht markiert')],
  joint_deleted: ['undo-2', '', (a) => says(a.actorId, 'hast', 'hat', `einen Joint-Eintrag gelöscht (${fmtG(a.grams)} zurückgebucht)`)],
  rotation_joined: ['repeat', 'violet', (a) => says(a.actorId, 'bist', 'ist', `#${a.position} in der Rotation`)],
  request_created: ['hand-heart', 'violet', (a) =>
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
