// Geschäftslogik von Else Live.
//
// Alle Funktionen arbeiten direkt auf dem Datenbank-Objekt (siehe store.js) und
// haben keine Nebenwirkungen nach außen: Push-Nachrichten werden nur über
// ctx.notify() eingesammelt und vom Server nach dem Speichern verschickt.
// Dadurch lässt sich die Logik ohne Server testen (test/domain.test.js).

import {
  AUTO_FINISH_HOURS,
  DEFAULT_SETTINGS,
  MEMBER_COLORS,
  MEMBER_EMOJIS,
  STRAIN_EFFECTS,
  STRAIN_TYPES,
} from './defaults.js';

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (status, message) => {
  throw new AppError(status, message);
};

const uid = () => globalThis.crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const EPSILON = 0.0005;
const ACTIVITY_LIMIT = 500;

/** Gramm auf 3 Nachkommastellen runden, damit sich keine Float-Fehler aufsummieren. */
export const roundG = (n) => Math.round(n * 1000) / 1000;

export const fmtGrams = (n) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })} g`;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O und 1/I

export function generateInviteCode(length = 6) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

// ---------------------------------------------------------------------------
// Datenbank-Grundgerüst

export function emptyDb() {
  return normalizeDb({});
}

/** Ergänzt fehlende Felder, damit ältere Datenstände weiter funktionieren. */
export function normalizeDb(raw) {
  const db = raw && typeof raw === 'object' ? raw : {};
  db.version = 1;
  db.settings = { ...DEFAULT_SETTINGS, ...(db.settings || {}) };
  if (!db.settings.inviteCode) db.settings.inviteCode = generateInviteCode();
  for (const key of ['members', 'sessions', 'strains', 'stockLog', 'joints', 'requests', 'pushSubs', 'activity']) {
    if (!Array.isArray(db[key])) db[key] = [];
  }
  return db;
}

/**
 * Kontext für eine Aktion: wer handelt, und welche Benachrichtigungen dabei
 * entstehen. Die handelnde Person selbst wird nie benachrichtigt.
 */
export function createContext(db, actor) {
  const notifications = [];
  return {
    db,
    actor,
    notifications,
    notify(to, pref, payload) {
      const ids = [...new Set(to)].filter(
        (id) => id && id !== actor?.id && db.members.some((m) => m.id === id),
      );
      if (ids.length) notifications.push({ to: ids, pref, ...payload });
    },
  };
}

function addActivity(db, type, actorId, data = {}) {
  db.activity.push({ id: uid(), type, actorId, at: nowIso(), ...data });
  if (db.activity.length > ACTIVITY_LIMIT) db.activity.splice(0, db.activity.length - ACTIVITY_LIMIT);
}

function logStock(db, strain, delta, reason, memberId, extra = {}) {
  db.stockLog.push({
    id: uid(),
    strainId: strain.id,
    delta: roundG(delta),
    balance: strain.grams,
    reason,
    memberId,
    at: nowIso(),
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Eingaben prüfen

function text(value, { label, max = 200, required = false } = {}) {
  const s = value == null ? '' : String(value).trim();
  if (required && !s) fail(400, `${label} fehlt.`);
  if (s.length > max) fail(400, `${label} ist zu lang (max. ${max} Zeichen).`);
  return s;
}

/** Akzeptiert Zahlen und Strings mit Komma oder Punkt („0,5“ / „0.5“). */
export function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const s = String(value).trim().replace(',', '.');
  return s === '' ? null : Number(s);
}

function grams(value, { label = 'Menge', allowZero = false, optional = false } = {}) {
  const n = parseNumber(value);
  if (n === null) {
    if (optional) return null;
    fail(400, `${label} fehlt.`);
  }
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) {
    fail(400, `${label} muss eine Zahl ${allowZero ? 'ab' : 'über'} 0 sein.`);
  }
  if (n > 100000) fail(400, `${label} ist unrealistisch groß.`);
  return roundG(n);
}

function percent(value, label) {
  const n = parseNumber(value);
  if (n === null) return null;
  if (!Number.isFinite(n) || n < 0 || n > 100) fail(400, `${label} muss zwischen 0 und 100 % liegen.`);
  return Math.round(n * 10) / 10;
}

function cleanList(list, label) {
  if (!Array.isArray(list)) fail(400, `${label}: Liste erwartet.`);
  const out = [];
  for (const item of list) {
    const t = text(item, { label, max: 40 });
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  if (out.length > 50) fail(400, `${label}: maximal 50 Einträge.`);
  return out;
}

// ---------------------------------------------------------------------------
// Lookups

export function memberById(db, id) {
  return db.members.find((m) => m.id === id) || null;
}

function strainById(db, id) {
  const s = db.strains.find((x) => x.id === id);
  if (!s) fail(404, 'Sorte nicht gefunden.');
  return s;
}

function jointById(db, id) {
  const j = db.joints.find((x) => x.id === id);
  if (!j) fail(404, 'Joint nicht gefunden.');
  return j;
}

function requestById(db, id) {
  const r = db.requests.find((x) => x.id === id);
  if (!r) fail(404, 'Anfrage nicht gefunden.');
  return r;
}

const nameOf = (db, id) => memberById(db, id)?.name ?? 'Jemand';
const allMemberIds = (db) => db.members.map((m) => m.id);
const jointUrl = (id) => `/#/joints/${id}`;
const strainNames = (db, components) =>
  components.map((c) => db.strains.find((s) => s.id === c.strainId)?.name ?? '?').join(' + ');

// ---------------------------------------------------------------------------
// Mitglieder

export function publicMember(m) {
  return {
    id: m.id,
    name: m.name,
    emoji: m.emoji,
    color: m.color,
    hasPin: Boolean(m.pinHash),
    createdAt: m.createdAt,
  };
}

function memberFields(db, input, selfId) {
  const out = {};
  if (input.name !== undefined) {
    const name = text(input.name, { label: 'Name', max: 30, required: true });
    const taken = db.members.some((m) => m.id !== selfId && m.name.toLowerCase() === name.toLowerCase());
    if (taken) fail(409, `Den Namen „${name}“ gibt es in der Gruppe schon.`);
    out.name = name;
  }
  if (input.emoji !== undefined) out.emoji = text(input.emoji, { label: 'Emoji', max: 16 }) || '🌿';
  if (input.color !== undefined) {
    const color = text(input.color, { label: 'Farbe', max: 7 });
    if (!/^#[0-9a-f]{6}$/i.test(color)) fail(400, 'Ungültige Farbe.');
    out.color = color;
  }
  if (input.notify !== undefined) {
    const n = input.notify || {};
    out.notify = {
      joints: n.joints !== false,
      requests: n.requests !== false,
      rotation: n.rotation !== false,
      stock: n.stock !== false,
    };
  }
  return out;
}

export function createMember(db, input) {
  const index = db.members.length;
  const fields = memberFields(
    db,
    {
      name: input.name ?? '',
      emoji: input.emoji || MEMBER_EMOJIS[index % MEMBER_EMOJIS.length],
      color: input.color || MEMBER_COLORS[index % MEMBER_COLORS.length],
    },
    null,
  );
  const member = {
    id: uid(),
    ...fields,
    pinHash: input.pinHash || null,
    notify: { joints: true, requests: true, rotation: true, stock: true },
    createdAt: nowIso(),
  };
  db.members.push(member);
  addActivity(db, 'member_joined', member.id);
  return member;
}

export function updateMember(ctx, input) {
  Object.assign(ctx.actor, memberFields(ctx.db, input, ctx.actor.id));
  return ctx.actor;
}

// ---------------------------------------------------------------------------
// Bestand / Sorten

function strainFields(db, input, partial) {
  const out = {};
  const has = (key) => !partial || input[key] !== undefined;
  if (has('name')) out.name = text(input.name, { label: 'Sortenname', max: 60, required: true });
  if (has('type')) {
    const type = input.type || null;
    if (type !== null && !STRAIN_TYPES.includes(type)) fail(400, 'Unbekannter Typ.');
    out.type = type;
  }
  if (has('thc')) out.thc = percent(input.thc, 'THC-Gehalt');
  if (has('cbd')) out.cbd = percent(input.cbd, 'CBD-Gehalt');
  if (has('producer')) out.producer = text(input.producer, { label: 'Hersteller / Apotheke', max: 60 });
  if (has('pricePerGram')) {
    const price = parseNumber(input.pricePerGram);
    if (price !== null && (!Number.isFinite(price) || price < 0 || price > 1000)) fail(400, 'Preis pro Gramm muss zwischen 0 und 1000 € liegen.');
    out.pricePerGram = price === null ? null : Math.round(price * 100) / 100;
  }
  if (has('effects')) {
    const list = Array.isArray(input.effects) ? input.effects : [];
    out.effects = STRAIN_EFFECTS.filter((e) => list.includes(e));
  }
  if (has('notes')) out.notes = text(input.notes, { label: 'Notiz', max: 500 });
  if (has('ownerId')) {
    const id = input.ownerId || null;
    if (id && !memberById(db, id)) fail(400, 'Unbekannte Person.');
    out.ownerId = id;
  }
  return out;
}

/**
 * Fällt eine Sorte unter die Warnschwelle (oder auf 0), bekommt die Person,
 * der sie gehört, Bescheid – ohne Besitzer:in die ganze Gruppe.
 */
function warnIfLow(ctx, strain, before) {
  const { db } = ctx;
  const threshold = db.settings.lowStockGrams ?? 2;
  const empty = strain.grams <= EPSILON;
  const crossed = empty ? before > EPSILON : before > threshold && strain.grams <= threshold;
  if (!crossed) return;
  ctx.notify(strain.ownerId ? [strain.ownerId] : allMemberIds(db), 'stock', {
    title: empty ? `📦 ${strain.name} ist leer` : `⚠️ ${strain.name} wird knapp`,
    body: empty ? 'Zeit zum Nachfüllen.' : `Nur noch ${fmtGrams(strain.grams)} im Bestand.`,
    url: '/#/bestand',
    tag: `stock-${strain.id}`,
  });
}

export function createStrain(ctx, input) {
  const { db, actor } = ctx;
  const fields = strainFields(db, input, false);
  const amount = grams(input.grams, { label: 'Menge', allowZero: true });
  const strain = {
    id: uid(),
    ...fields,
    ownerId: input.ownerId === undefined ? actor.id : fields.ownerId,
    grams: amount,
    refillLevel: amount,
    archived: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.strains.push(strain);
  logStock(db, strain, amount, 'initial', actor.id);
  addActivity(db, 'strain_added', actor.id, { strainId: strain.id, strainName: strain.name, grams: amount });
  return strain;
}

export function updateStrain(ctx, id, input) {
  const strain = strainById(ctx.db, id);
  Object.assign(strain, strainFields(ctx.db, input, true), { updatedAt: nowIso() });
  return strain;
}

/** action "add" = nachfüllen, action "set" = Bestand korrigieren (absoluter Wert). */
export function changeStock(ctx, id, { action, grams: value, note } = {}) {
  const { db, actor } = ctx;
  const strain = strainById(db, id);
  const noteText = text(note, { label: 'Notiz', max: 200 });

  if (action === 'add') {
    const amount = grams(value, { label: 'Nachfüllmenge' });
    strain.grams = roundG(strain.grams + amount);
    strain.refillLevel = strain.grams;
    strain.archived = false;
    logStock(db, strain, amount, 'restock', actor.id, { note: noteText });
    addActivity(db, 'strain_restocked', actor.id, { strainId: strain.id, strainName: strain.name, grams: amount });
  } else if (action === 'set') {
    const amount = grams(value, { label: 'Neuer Bestand', allowZero: true });
    const delta = roundG(amount - strain.grams);
    if (delta === 0) return strain;
    strain.grams = amount;
    if (amount > strain.refillLevel) strain.refillLevel = amount;
    logStock(db, strain, delta, 'correction', actor.id, { note: noteText });
    warnIfLow(ctx, strain, amount - delta);
    addActivity(db, 'strain_corrected', actor.id, { strainId: strain.id, strainName: strain.name, grams: delta });
  } else {
    fail(400, 'Unbekannte Bestandsaktion.');
  }
  strain.updatedAt = nowIso();
  return strain;
}

/** Nie benutzte Sorten werden gelöscht, benutzte nur archiviert (Historie bleibt lesbar). */
export function removeStrain(ctx, id) {
  const { db, actor } = ctx;
  const strain = strainById(db, id);
  const used = db.joints.some((j) => j.components.some((c) => c.strainId === id));
  if (!used) {
    db.strains = db.strains.filter((s) => s.id !== id);
    db.stockLog = db.stockLog.filter((l) => l.strainId !== id);
    db.requests.forEach((r) => {
      if (r.strainId === id) r.strainId = null;
    });
    addActivity(db, 'strain_removed', actor.id, { strainName: strain.name });
    return { deleted: true };
  }
  strain.archived = true;
  strain.updatedAt = nowIso();
  addActivity(db, 'strain_archived', actor.id, { strainId: strain.id, strainName: strain.name });
  return { archived: true };
}

// ---------------------------------------------------------------------------
// Joints

export function createJoint(ctx, input = {}) {
  const { db, actor } = ctx;
  const rows = Array.isArray(input.components) ? input.components : [];
  if (!rows.length) fail(400, 'Bitte mindestens eine Sorte auswählen.');
  if (rows.length > 6) fail(400, 'Maximal 6 Sorten pro Joint.');

  const amounts = new Map();
  for (const row of rows) {
    const strain = strainById(db, row?.strainId);
    if (strain.archived) fail(400, `„${strain.name}“ ist archiviert.`);
    const amount = grams(row.grams, { label: `Menge für ${strain.name}` });
    amounts.set(strain.id, roundG((amounts.get(strain.id) || 0) + amount));
  }
  for (const [strainId, amount] of amounts) {
    const strain = strainById(db, strainId);
    if (amount > strain.grams + EPSILON) {
      fail(409, `Nicht genug ${strain.name} da: noch ${fmtGrams(strain.grams)}, gebraucht ${fmtGrams(amount)}.`);
    }
  }

  let request = null;
  if (input.requestId) {
    request = requestById(db, input.requestId);
    if (!['open', 'accepted'].includes(request.status)) fail(409, 'Diese Anfrage ist nicht mehr offen.');
    if (request.fromId === actor.id) fail(409, 'Deine eigene Anfrage kannst du nicht selbst erfüllen.');
    if (request.toId && request.toId !== actor.id) fail(403, 'Diese Anfrage ist an jemand anderen gerichtet.');
  }

  const carbonFilter = Boolean(input.carbonFilter);
  const components = [...amounts].map(([strainId, amount]) => ({ strainId, grams: amount }));
  const total = roundG(components.reduce((sum, c) => sum + c.grams, 0));
  const now = nowIso();
  const joint = {
    id: uid(),
    rolledBy: actor.id,
    components,
    grams: total,
    tobacco: text(input.tobacco, { label: 'Tabak', max: 60 }) || null,
    carbonFilter,
    filterBrand: carbonFilter ? text(input.filterBrand, { label: 'Filter', max: 60 }) || null : null,
    note: text(input.note, { label: 'Notiz', max: 280 }),
    status: 'ready',
    rotation: [{ position: 1, memberId: actor.id, joinedAt: now }],
    turn: null,
    requestId: request?.id ?? null,
    createdAt: now,
    litAt: null,
    doneAt: null,
  };

  for (const c of components) {
    const strain = strainById(db, c.strainId);
    const before = strain.grams;
    strain.grams = roundG(Math.max(0, strain.grams - c.grams));
    strain.updatedAt = now;
    logStock(db, strain, -c.grams, 'joint', actor.id, { jointId: joint.id });
    warnIfLow(ctx, strain, before);
  }

  if (request) {
    request.status = 'done';
    request.jointId = joint.id;
    request.toId = request.toId ?? actor.id;
    request.handledBy = actor.id;
    request.updatedAt = now;
    if (db.settings.rotationSize >= 2) {
      joint.rotation.push({ position: 2, memberId: request.fromId, joinedAt: now });
    }
  }

  db.joints.push(joint);
  const summary = strainNames(db, components);
  addActivity(db, 'joint_rolled', actor.id, { jointId: joint.id, grams: total, summary, requestId: request?.id ?? null });

  if (input.notify !== false) {
    ctx.notify(
      allMemberIds(db).filter((id) => id !== request?.fromId),
      'joints',
      {
        title: `🌿 ${actor.name} hat einen Joint gerollt`,
        body: `${fmtGrams(total)} ${summary} – sichere dir einen Platz in der Rotation.`,
        url: jointUrl(joint.id),
        tag: `joint-${joint.id}`,
      },
    );
  }
  if (request) {
    ctx.notify([request.fromId], 'requests', {
      title: '✅ Dein Joint ist fertig gerollt',
      body: `${actor.name} hat für dich gerollt: ${fmtGrams(total)} ${summary}. Du bist #2 in der Rotation.`,
      url: jointUrl(joint.id),
      tag: `request-${request.id}`,
    });
  }
  return joint;
}

function rotationLimit(db, joint) {
  return Math.max(db.settings.rotationSize, ...joint.rotation.map((r) => r.position));
}

export function claimRotation(ctx, jointId, position) {
  const { db, actor } = ctx;
  const joint = jointById(db, jointId);
  const p = Number(position);
  const limit = rotationLimit(db, joint);
  if (joint.status === 'done') fail(409, 'Der Joint ist schon aufgeraucht.');
  if (joint.rolledBy === actor.id) fail(409, 'Du hast gerollt und bist automatisch #1.');
  if (!Number.isInteger(p) || p < 2 || p > limit) fail(400, `Wähle einen Platz zwischen #2 und #${limit}.`);

  const occupant = joint.rotation.find((r) => r.position === p);
  if (occupant && occupant.memberId !== actor.id) fail(409, `Platz #${p} ist schon vergeben.`);
  if (occupant) return joint;

  if (joint.status === 'lit') {
    if (p <= joint.turn) fail(409, `Platz #${p} ist schon vorbei.`);
    const own = joint.rotation.find((r) => r.memberId === actor.id);
    if (own && own.position <= joint.turn) fail(409, 'Du warst in dieser Runde schon dran.');
  }

  joint.rotation = joint.rotation.filter((r) => r.memberId !== actor.id);
  joint.rotation.push({ position: p, memberId: actor.id, joinedAt: nowIso() });
  joint.rotation.sort((a, b) => a.position - b.position);
  addActivity(db, 'rotation_joined', actor.id, { jointId: joint.id, position: p });
  ctx.notify([joint.rolledBy], 'rotation', {
    title: `🔄 ${actor.name} ist #${p} in der Rotation`,
    body: `Bei deinem Joint (${fmtGrams(joint.grams)} ${strainNames(db, joint.components)}).`,
    url: jointUrl(joint.id),
    tag: `rotation-${joint.id}`,
  });
  return joint;
}

export function leaveRotation(ctx, jointId, position) {
  const { db, actor } = ctx;
  const joint = jointById(db, jointId);
  const p = Number(position);
  if (p === 1) fail(400, 'Platz #1 gehört der Person, die gerollt hat.');
  const entry = joint.rotation.find((r) => r.position === p);
  if (!entry) fail(404, `Platz #${p} ist frei.`);
  if (entry.memberId !== actor.id && joint.rolledBy !== actor.id) {
    fail(403, 'Austragen kann nur die Person selbst oder wer gerollt hat.');
  }
  if (joint.status === 'done') fail(409, 'Der Joint ist schon aufgeraucht.');
  if (joint.status === 'lit' && p <= joint.turn) fail(409, `Platz #${p} ist schon dran gewesen.`);

  joint.rotation = joint.rotation.filter((r) => r !== entry);
  if (entry.memberId !== actor.id) {
    ctx.notify([entry.memberId], 'rotation', {
      title: `${actor.name} hat dich aus der Rotation genommen`,
      body: `Platz #${p} ist wieder frei.`,
      url: jointUrl(joint.id),
      tag: `rotation-${joint.id}`,
    });
  }
  return joint;
}

export function lightJoint(ctx, id) {
  const { db, actor } = ctx;
  const joint = jointById(db, id);
  if (joint.status !== 'ready') fail(409, 'Der Joint brennt schon oder ist fertig.');
  joint.status = 'lit';
  joint.turn = 1;
  joint.litAt = nowIso();
  addActivity(db, 'joint_lit', actor.id, { jointId: joint.id });
  const roller = nameOf(db, joint.rolledBy);
  for (const r of joint.rotation.filter((x) => x.position > 1)) {
    ctx.notify([r.memberId], 'rotation', {
      title: '🔥 Der Joint brennt',
      body: `${roller} hat angezündet – du bist #${r.position}.`,
      url: jointUrl(joint.id),
      tag: `turn-${joint.id}`,
    });
  }
  return joint;
}

export function passJoint(ctx, id) {
  const { db, actor } = ctx;
  const joint = jointById(db, id);
  if (joint.status !== 'lit') fail(409, 'Der Joint brennt gerade nicht.');
  const holder = joint.rotation.find((r) => r.position === joint.turn);
  const next = joint.rotation.find((r) => r.position > joint.turn);
  if (!next) return finishJoint(ctx, id);
  joint.turn = next.position;
  addActivity(db, 'joint_passed', actor.id, { jointId: joint.id, toId: next.memberId, position: next.position });
  ctx.notify([next.memberId], 'rotation', {
    title: '👉 Du bist dran!',
    body: `${nameOf(db, holder?.memberId ?? actor.id)} reicht dir den Joint weiter (#${next.position}).`,
    url: jointUrl(joint.id),
    tag: `turn-${joint.id}`,
  });
  return joint;
}

export function finishJoint(ctx, id) {
  const { db, actor } = ctx;
  const joint = jointById(db, id);
  if (joint.status === 'done') return joint;
  joint.status = 'done';
  joint.turn = null;
  joint.doneAt = nowIso();
  addActivity(db, 'joint_done', actor.id, { jointId: joint.id });
  return joint;
}

/** Joints, die seit Stunden „brennen“, gelten als aufgeraucht. Gibt die Anzahl zurück. */
export function autoFinishJoints(db, now = Date.now(), hours = AUTO_FINISH_HOURS) {
  let count = 0;
  for (const joint of db.joints) {
    if (joint.status !== 'lit' || now - Date.parse(joint.litAt) < hours * 3600 * 1000) continue;
    joint.status = 'done';
    joint.turn = null;
    joint.doneAt = new Date(now).toISOString();
    addActivity(db, 'joint_auto_done', null, { jointId: joint.id });
    count += 1;
  }
  return count;
}

/** Löscht einen (falsch erfassten) Joint und bucht die Menge zurück in den Bestand. */
export function deleteJoint(ctx, id) {
  const { db, actor } = ctx;
  const joint = jointById(db, id);
  const now = nowIso();
  for (const c of joint.components) {
    const strain = db.strains.find((s) => s.id === c.strainId);
    if (!strain) continue;
    strain.grams = roundG(strain.grams + c.grams);
    strain.updatedAt = now;
    logStock(db, strain, c.grams, 'joint-undo', actor.id, { jointId: joint.id });
  }
  const request = joint.requestId && db.requests.find((r) => r.id === joint.requestId);
  if (request && request.status === 'done') {
    request.status = 'accepted';
    request.jointId = null;
    request.updatedAt = now;
  }
  db.joints = db.joints.filter((j) => j.id !== id);
  addActivity(db, 'joint_deleted', actor.id, { grams: joint.grams, summary: strainNames(db, joint.components) });
  return { deleted: true };
}

// ---------------------------------------------------------------------------
// Anfragen („Rollst du mal wieder einen?“)

export function createRequest(ctx, input = {}) {
  const { db, actor } = ctx;
  const toId = input.toId || null;
  if (toId && !memberById(db, toId)) fail(400, 'Unbekannte Person.');
  if (toId === actor.id) fail(400, 'Du kannst dich nicht selbst anfragen.');
  const strain = input.strainId ? strainById(db, input.strainId) : null;
  const amount = grams(input.grams, { label: 'Wunschmenge', optional: true });
  const message = text(input.message, { label: 'Nachricht', max: 280 });
  const now = nowIso();
  const request = {
    id: uid(),
    fromId: actor.id,
    toId,
    strainId: strain?.id ?? null,
    grams: amount,
    message,
    status: 'open',
    jointId: null,
    handledBy: null,
    createdAt: now,
    updatedAt: now,
  };
  db.requests.push(request);
  addActivity(db, 'request_created', actor.id, { requestId: request.id, toId });

  const wish = [amount && fmtGrams(amount), strain?.name].filter(Boolean).join(' ');
  ctx.notify(toId ? [toId] : allMemberIds(db), 'requests', {
    title: toId ? `🙏 ${actor.name} bittet dich, einen Joint zu rollen` : `🙏 ${actor.name} sucht jemanden, der rollt`,
    body: message || (wish ? `Wunsch: ${wish}` : 'Magst du mal wieder einen rollen?'),
    url: '/#/anfragen',
    tag: `request-${request.id}`,
  });
  return request;
}

export function acceptRequest(ctx, id) {
  const { db, actor } = ctx;
  const request = requestById(db, id);
  if (request.status !== 'open') fail(409, 'Die Anfrage ist nicht mehr offen.');
  if (request.fromId === actor.id) fail(400, 'Das ist deine eigene Anfrage.');
  if (request.toId && request.toId !== actor.id) fail(403, 'Diese Anfrage ist an jemand anderen gerichtet.');
  request.status = 'accepted';
  request.toId = actor.id;
  request.handledBy = actor.id;
  request.updatedAt = nowIso();
  addActivity(db, 'request_accepted', actor.id, { requestId: request.id, toId: request.fromId });
  ctx.notify([request.fromId], 'requests', {
    title: `👍 ${actor.name} rollt dir einen`,
    body: 'Deine Anfrage wurde angenommen.',
    url: '/#/anfragen',
    tag: `request-${request.id}`,
  });
  return request;
}

export function declineRequest(ctx, id) {
  const { db, actor } = ctx;
  const request = requestById(db, id);
  if (!['open', 'accepted'].includes(request.status)) fail(409, 'Die Anfrage ist nicht mehr offen.');
  if (!request.toId) fail(400, 'Anfragen an alle kannst du einfach offen lassen.');
  if (request.toId !== actor.id) fail(403, 'Diese Anfrage ist an jemand anderen gerichtet.');
  request.status = 'declined';
  request.handledBy = actor.id;
  request.updatedAt = nowIso();
  addActivity(db, 'request_declined', actor.id, { requestId: request.id, toId: request.fromId });
  ctx.notify([request.fromId], 'requests', {
    title: `${actor.name} kann gerade nicht`,
    body: 'Deine Anfrage wurde abgelehnt – frag doch jemand anderen.',
    url: '/#/anfragen',
    tag: `request-${request.id}`,
  });
  return request;
}

export function cancelRequest(ctx, id) {
  const { db, actor } = ctx;
  const request = requestById(db, id);
  if (request.fromId !== actor.id) fail(403, 'Nur wer angefragt hat, kann zurückziehen.');
  if (!['open', 'accepted'].includes(request.status)) fail(409, 'Die Anfrage ist nicht mehr offen.');
  const wasAcceptedBy = request.status === 'accepted' ? request.handledBy : null;
  request.status = 'cancelled';
  request.updatedAt = nowIso();
  if (wasAcceptedBy) {
    ctx.notify([wasAcceptedBy], 'requests', {
      title: `${actor.name} hat die Anfrage zurückgezogen`,
      body: 'Du musst nicht mehr rollen.',
      url: '/#/anfragen',
      tag: `request-${request.id}`,
    });
  }
  return request;
}

// ---------------------------------------------------------------------------
// Gruppeneinstellungen

export function updateSettings(ctx, input = {}) {
  const s = ctx.db.settings;
  if (input.groupName !== undefined) s.groupName = text(input.groupName, { label: 'Gruppenname', max: 40, required: true });
  if (input.rotationSize !== undefined) {
    const n = Number(input.rotationSize);
    if (!Number.isInteger(n) || n < 2 || n > 12) fail(400, 'Die Rotation braucht 2 bis 12 Plätze.');
    s.rotationSize = n;
  }
  if (input.lowStockGrams !== undefined) s.lowStockGrams = grams(input.lowStockGrams, { label: 'Warnschwelle', allowZero: true });
  if (input.tobaccos !== undefined) s.tobaccos = cleanList(input.tobaccos, 'Tabak');
  if (input.filters !== undefined) s.filters = cleanList(input.filters, 'Aktivkohlefilter');
  return s;
}

// ---------------------------------------------------------------------------
// Was ein eingeloggtes Mitglied zu sehen bekommt

export function buildState(db, me) {
  return {
    serverTime: nowIso(),
    me: { ...publicMember(me), notify: me.notify },
    settings: { ...db.settings },
    members: db.members.map(publicMember),
    strains: db.strains,
    joints: db.joints.slice(-400),
    requests: db.requests.slice(-200),
    stockLog: db.stockLog.slice(-800),
    activity: db.activity.slice(-80),
  };
}
