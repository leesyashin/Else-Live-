// Demo: ersetzt ../api.js. Statt eines Servers läuft die echte Geschäftslogik
// (src/domain.js) direkt im Browser. Die anderen Mitglieder werden simuliert
// und reagieren auf das, was du tust (Rotation, Anfragen, Weitergeben).

import * as D from '../../../src/domain.js';
import { setConnection, setState, setToken, store } from '../store.js';
import { seedDemo } from './seed.js';

const STORAGE_KEY = 'else-live.demo.v2';
const MAX_AGE = 12 * 60 * 60 * 1000;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Datenhaltung (localStorage, sonst nur im Speicher)

let db;
let meId;
let rev = 0;
let noteSink = () => {};
const listeners = new Set();

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Date.now() - saved.seededAt < MAX_AGE) return saved;
  } catch {
    /* kein Speicher verfügbar */
  }
  return null;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ db, meId, seededAt }));
  } catch {
    /* egal – dann nur für diese Sitzung */
  }
}

let seededAt = Date.now();

export function resetDemo() {
  ({ db, meId } = seedDemo());
  db = D.normalizeDb(db);
  seededAt = Date.now();
  save();
  publish();
}

const saved = load();
if (saved) {
  db = D.normalizeDb(saved.db);
  meId = saved.meId;
  seededAt = saved.seededAt;
} else {
  ({ db, meId } = seedDemo());
  save();
}
setToken('demo');

const me = () => D.memberById(db, meId) ?? db.members[0];
const others = () => db.members.filter((m) => m.id !== me().id);

function stateFor() {
  const current = me();
  // Alle außer Jonas gelten als „online“ – so sieht man beide Zustände.
  const online = db.members.filter((m) => m.name !== 'Jonas' || m.id === current.id).map((m) => m.id);
  return { ...D.buildState(db, current), rev, boot: 'demo', online };
}

function publish() {
  rev += 1;
  save();
  if (store.token) setState(stateFor()); // abgemeldet: Login-Bildschirm nicht überschreiben
  listeners.forEach((fn) => fn());
}

export const demo = {
  members: () => db.members.map(D.publicMember),
  meId: () => me().id,
  code: () => db.settings.inviteCode,
  switchTo(id) {
    if (!D.memberById(db, id)) return;
    meId = id;
    setToken('demo');
    setConnection('live');
    publish();
  },
  reset: resetDemo,
  onChange: (fn) => listeners.add(fn),
};

// ---------------------------------------------------------------------------
// Simulierte Mitglieder

const later = (ms, fn) => setTimeout(fn, ms);

function deliver(notifications) {
  const mine = notifications.filter((n) => n.to.includes(me().id));
  if (mine.length) noteSink(mine.map(({ title, body, url, tag }) => ({ title, body, url, tag })));
}

function asBot(memberId, fn) {
  const actor = D.memberById(db, memberId);
  if (!actor || actor.id === me().id) return null;
  try {
    const ctx = D.createContext(db, actor);
    const result = fn(ctx);
    publish();
    deliver(ctx.notifications);
    return result;
  } catch (err) {
    console.info('Demo:', err.message);
    return null;
  }
}

const jointById = (id) => db.joints.find((j) => j.id === id);
const pickFree = (joint) => {
  const size = Math.max(db.settings.rotationSize, ...joint.rotation.map((r) => r.position));
  for (let p = 2; p <= size; p += 1) if (!joint.rotation.some((r) => r.position === p)) return p;
  return null;
};

/** Wer gerade dran ist und nicht du bist, reicht nach ein paar Sekunden weiter. */
function botPassesOn(jointId) {
  const joint = jointById(jointId);
  if (!joint || joint.status !== 'lit') return;
  const holder = joint.rotation.find((r) => r.position === joint.turn);
  if (!holder || holder.memberId === me().id) return;
  const turn = joint.turn;
  later(6000, () => {
    const j = jointById(jointId);
    if (!j || j.status !== 'lit' || j.turn !== turn) return;
    asBot(holder.memberId, (ctx) => D.passJoint(ctx, jointId));
    botPassesOn(jointId);
  });
}

const reactions = {
  'joint-created'(joint) {
    if (joint.requestId) return;
    const takers = others().filter((m) => !joint.rotation.some((r) => r.memberId === m.id));
    takers.slice(0, 2).forEach((m, i) => {
      later(2500 + i * 3500, () => {
        const j = jointById(joint.id);
        const p = j && j.status !== 'done' ? pickFree(j) : null;
        if (p) asBot(m.id, (ctx) => D.claimRotation(ctx, joint.id, p));
      });
    });
  },
  'joint-lit': (joint) => botPassesOn(joint.id),
  'joint-passed': (joint) => botPassesOn(joint.id),
  'request-created'(request) {
    const helper = request.toId ? D.memberById(db, request.toId) : others()[Math.floor(Math.random() * others().length)];
    if (!helper) return;
    later(3000, () => asBot(helper.id, (ctx) => D.acceptRequest(ctx, request.id)));
    later(9000, () => {
      const r = db.requests.find((x) => x.id === request.id);
      if (!r || r.status !== 'accepted') return;
      const stock = db.strains.filter((s) => !s.archived && s.grams > 0).sort((a, b) => b.grams - a.grams);
      const wished = stock.find((s) => s.id === r.strainId) ?? stock[0];
      if (!wished) return;
      asBot(helper.id, (ctx) =>
        D.createJoint(ctx, {
          components: [{ strainId: wished.id, grams: Math.min(r.grams ?? 0.4, wished.grams) }],
          tobacco: db.settings.tobaccos[0] ?? null,
          carbonFilter: true,
          filterBrand: db.settings.filters[0] ?? null,
          requestId: r.id,
        }),
      );
    });
  },
};

// ---------------------------------------------------------------------------
// „Server“-Routen – gleiche Pfade wie src/app.js

const routes = [];
const on = (method, pattern, handler, reaction) => routes.push({ method, pattern, handler, reaction });

on('POST', /^\/api\/strains$/, (ctx, b) => D.createStrain(ctx, b));
on('PATCH', /^\/api\/strains\/([^/]+)$/, (ctx, b, id) => D.updateStrain(ctx, id, b));
on('POST', /^\/api\/strains\/([^/]+)\/stock$/, (ctx, b, id) => D.changeStock(ctx, id, b));
on('DELETE', /^\/api\/strains\/([^/]+)$/, (ctx, b, id) => D.removeStrain(ctx, id));

on('POST', /^\/api\/joints$/, (ctx, b) => D.createJoint(ctx, b), 'joint-created');
on('POST', /^\/api\/joints\/([^/]+)\/rotation$/, (ctx, b, id) => D.claimRotation(ctx, id, b.position));
on('DELETE', /^\/api\/joints\/([^/]+)\/rotation\/(\d+)$/, (ctx, b, id, pos) => D.leaveRotation(ctx, id, pos));
on('POST', /^\/api\/joints\/([^/]+)\/light$/, (ctx, b, id) => D.lightJoint(ctx, id), 'joint-lit');
on('POST', /^\/api\/joints\/([^/]+)\/pass$/, (ctx, b, id) => D.passJoint(ctx, id), 'joint-passed');
on('POST', /^\/api\/joints\/([^/]+)\/finish$/, (ctx, b, id) => D.finishJoint(ctx, id));
on('DELETE', /^\/api\/joints\/([^/]+)$/, (ctx, b, id) => D.deleteJoint(ctx, id));

on('POST', /^\/api\/requests$/, (ctx, b) => D.createRequest(ctx, b), 'request-created');
on('POST', /^\/api\/requests\/([^/]+)\/accept$/, (ctx, b, id) => D.acceptRequest(ctx, id));
on('POST', /^\/api\/requests\/([^/]+)\/decline$/, (ctx, b, id) => D.declineRequest(ctx, id));
on('POST', /^\/api\/requests\/([^/]+)\/cancel$/, (ctx, b, id) => D.cancelRequest(ctx, id));

on('PATCH', /^\/api\/me$/, (ctx, b) => {
  const { pin, ...rest } = b;
  D.updateMember(ctx, rest);
  if (pin !== undefined) ctx.actor.pinHash = pin ? 'demo' : null;
  return D.publicMember(ctx.actor);
});
on('PATCH', /^\/api\/settings$/, (ctx, b) => D.updateSettings(ctx, b));
on('POST', /^\/api\/settings\/invite-code$/, (ctx) => (ctx.db.settings.inviteCode = D.generateInviteCode()));

function special(method, path, body) {
  if (method === 'GET' && path === '/api/meta') return { groupName: db.settings.groupName, setup: false, vapidPublicKey: '' };
  if (method === 'GET' && path === '/api/state') return stateFor();
  if (path === '/api/auth/members') return { members: demo.members() };
  if (path === '/api/auth/login') {
    meId = body.memberId;
    publish();
    return { token: 'demo', state: stateFor() };
  }
  if (path === '/api/auth/register') {
    const member = D.createMember(db, { name: body.name, emoji: body.emoji, color: body.color, pinHash: body.pin ? 'demo' : null });
    meId = member.id;
    publish();
    return { token: 'demo', state: stateFor() };
  }
  if (path === '/api/auth/logout' || path.startsWith('/api/push/')) return { ok: true, devices: 0 };
  return undefined;
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 90));

export function setUnauthorizedHandler() {}

export async function request(method, url, body = {}) {
  await pause();
  const path = url.split('?')[0];
  try {
    const direct = special(method, path, body);
    if (direct !== undefined) return direct;
    for (const route of routes) {
      const match = route.method === method && path.match(route.pattern);
      if (!match) continue;
      const ctx = D.createContext(db, me());
      const result = route.handler(ctx, body ?? {}, ...match.slice(1));
      publish();
      if (route.reaction) reactions[route.reaction](result);
      return { result, state: stateFor() };
    }
  } catch (err) {
    throw new ApiError(err.status ?? 500, err.message);
  }
  throw new ApiError(404, 'Unbekannter Endpunkt.');
}

export async function act(method, url, body) {
  const data = await request(method, url, body);
  if (data.state) setState(data.state);
  return data.result;
}

export async function refresh() {
  setState(stateFor());
}

export function connectLive({ onNotes }) {
  noteSink = onNotes;
  setConnection('live');
  if (!store.token) setToken('demo');
}

export function disconnectLive() {
  setConnection('offline');
}
