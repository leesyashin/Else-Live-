// HTTP-API, Live-Updates (Server-Sent Events) und Push-Versand.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import * as domain from './domain.js';
import { AppError, buildState, createContext, memberById, publicMember } from './domain.js';
import { createThrottle, hashPin, hashToken, isValidPin, newToken, verifyPin } from './auth.js';
import { openStore } from './store.js';
import { createPush } from './push.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MAX_SESSIONS_PER_MEMBER = 20;
const MAX_PUSH_SUBS_PER_MEMBER = 10;

export async function createApp({ dataDir, groupCode, vapid = {}, log = console } = {}) {
  const store = await openStore(path.join(dataDir, 'db.json'));
  const { db } = store;
  const fixedCode = groupCode ? String(groupCode).trim() : null;
  if (fixedCode) db.settings.inviteCode = fixedCode;

  const push = await createPush({
    file: path.join(dataDir, 'vapid.json'),
    subject: vapid.subject || 'mailto:else-live@example.com',
    publicKey: vapid.publicKey,
    privateKey: vapid.privateKey,
  });

  const throttle = createThrottle();
  /** @type {Map<import('express').Response, { memberId: string }>} */
  const clients = new Map();
  let revision = 0;
  // Ändert sich bei jedem Serverstart, damit Clients ihre Revision zurücksetzen.
  const boot = globalThis.crypto.randomUUID();

  // -------------------------------------------------------------------------
  // Hilfsfunktionen

  const setupMode = () => db.members.length === 0 && !fixedCode;
  const codeMatches = (code) =>
    setupMode() || String(code ?? '').trim().toUpperCase() === String(db.settings.inviteCode).toUpperCase();

  function checkCode(req) {
    const key = `code:${req.ip}`;
    if (throttle.blocked(key)) throw new AppError(429, 'Zu viele Versuche. Bitte warte ein paar Minuten.');
    if (!codeMatches(req.body?.code)) {
      throttle.fail(key);
      throw new AppError(403, 'Der Gruppencode stimmt nicht.');
    }
  }

  function authenticate(req) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
    if (!token) return null;
    const tokenHash = hashToken(token);
    const session = db.sessions.find((s) => s.tokenHash === tokenHash);
    const member = session && memberById(db, session.memberId);
    return member ? { session, member } : null;
  }

  function requireAuth(req, res, next) {
    const auth = authenticate(req);
    if (!auth) return res.status(401).json({ error: 'Bitte melde dich (wieder) an.' });
    req.member = auth.member;
    req.session = auth.session;
    const now = Date.now();
    if (now - Date.parse(auth.session.lastSeenAt || 0) > 10 * 60 * 1000) {
      auth.session.lastSeenAt = new Date(now).toISOString();
      store.save();
    }
    next();
  }

  function openSession(member, req) {
    const token = newToken();
    const now = new Date().toISOString();
    db.sessions.push({
      id: globalThis.crypto.randomUUID(),
      tokenHash: hashToken(token),
      memberId: member.id,
      agent: String(req.get('user-agent') || '').slice(0, 160),
      createdAt: now,
      lastSeenAt: now,
    });
    const own = db.sessions.filter((s) => s.memberId === member.id);
    if (own.length > MAX_SESSIONS_PER_MEMBER) {
      const drop = new Set(own.slice(0, own.length - MAX_SESSIONS_PER_MEMBER));
      db.sessions = db.sessions.filter((s) => !drop.has(s));
    }
    return token;
  }

  const onlineIds = () => [...new Set([...clients.values()].map((c) => c.memberId))];
  const stateFor = (member) => ({ ...buildState(db, member), rev: revision, boot, online: onlineIds() });

  function sendEvent(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  function broadcastPresence() {
    const online = onlineIds();
    for (const res of clients.keys()) sendEvent(res, 'presence', { online });
  }

  /** Nach jeder Änderung: speichern, alle Clients informieren, Push verschicken. */
  function commit(notifications = []) {
    revision += 1;
    store.save();
    for (const [res, client] of clients) {
      const notes = notifications
        .filter((n) => n.to.includes(client.memberId))
        .map(({ title, body, url, tag }) => ({ title, body, url, tag }));
      sendEvent(res, 'change', { rev: revision, boot, notes });
    }
    deliverPush(notifications).catch((err) => log.error('[push]', err));
  }

  async function deliverPush(notifications) {
    for (const n of notifications) {
      const recipients = new Set(n.to.filter((id) => memberById(db, id)?.notify?.[n.pref] !== false));
      const subs = db.pushSubs.filter((s) => recipients.has(s.memberId));
      if (!subs.length) continue;
      const gone = await push.send(subs, { title: n.title, body: n.body, url: n.url, tag: n.tag });
      if (gone.length) {
        db.pushSubs = db.pushSubs.filter((s) => !gone.includes(s.endpoint));
        store.save();
      }
    }
  }

  /** Führt eine Domain-Aktion für das eingeloggte Mitglied aus. */
  const action = (handler) => (req, res) => {
    const ctx = createContext(db, req.member);
    const result = handler(ctx, req);
    commit(ctx.notifications);
    res.json({ result, state: stateFor(req.member) });
  };

  // -------------------------------------------------------------------------
  // App & Middleware

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal');

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
        "connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; " +
        "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    });
    next();
  });
  app.use(express.json({ limit: '100kb' }));

  // -------------------------------------------------------------------------
  // Anmeldung

  app.get('/api/meta', (req, res) => {
    res.json({ groupName: db.settings.groupName, setup: setupMode(), vapidPublicKey: push.publicKey });
  });

  app.post('/api/auth/members', (req, res) => {
    checkCode(req);
    res.json({ members: db.members.map(publicMember) });
  });

  app.post('/api/auth/login', (req, res) => {
    checkCode(req);
    const member = memberById(db, req.body?.memberId);
    if (!member) throw new AppError(404, 'Dieses Profil gibt es nicht mehr.');
    const key = `pin:${req.ip}:${member.id}`;
    if (throttle.blocked(key)) throw new AppError(429, 'Zu viele falsche PINs. Bitte warte ein paar Minuten.');
    if (!verifyPin(req.body?.pin, member.pinHash)) {
      throttle.fail(key);
      throw new AppError(403, 'Die PIN stimmt nicht.');
    }
    throttle.reset(key);
    const token = openSession(member, req);
    store.save();
    res.json({ token, state: stateFor(member) });
  });

  app.post('/api/auth/register', (req, res) => {
    checkCode(req);
    const { name, emoji, color, pin } = req.body || {};
    if (pin && !isValidPin(pin)) throw new AppError(400, 'Die PIN muss aus 4 bis 8 Ziffern bestehen.');
    const member = domain.createMember(db, { name, emoji, color, pinHash: pin ? hashPin(pin) : null });
    const token = openSession(member, req);
    commit([]);
    res.json({ token, state: stateFor(member) });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    db.sessions = db.sessions.filter((s) => s !== req.session);
    const endpoint = req.body?.endpoint;
    if (endpoint) db.pushSubs = db.pushSubs.filter((s) => s.endpoint !== endpoint);
    store.save();
    res.json({ ok: true });
  });

  // -------------------------------------------------------------------------
  // Zustand & Live-Updates

  app.get('/api/state', requireAuth, (req, res) => res.json(stateFor(req.member)));

  app.get('/api/events', requireAuth, (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    clients.set(res, { memberId: req.member.id });
    sendEvent(res, 'hello', { rev: revision, boot });
    broadcastPresence();
    const ping = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(ping);
      clients.delete(res);
      broadcastPresence();
    });
  });

  // -------------------------------------------------------------------------
  // Profil & Gruppe

  app.patch('/api/me', requireAuth, action((ctx, req) => {
    const { pin, ...rest } = req.body || {};
    if (pin !== undefined) {
      if (pin !== null && !isValidPin(pin)) throw new AppError(400, 'Die PIN muss aus 4 bis 8 Ziffern bestehen.');
    }
    domain.updateMember(ctx, rest);
    if (pin !== undefined) ctx.actor.pinHash = pin === null ? null : hashPin(pin);
    return publicMember(ctx.actor);
  }));

  app.patch('/api/settings', requireAuth, action((ctx, req) => domain.updateSettings(ctx, req.body)));

  app.post('/api/settings/invite-code', requireAuth, action((ctx) => {
    if (fixedCode) throw new AppError(409, 'Der Gruppencode ist fest auf dem Server eingestellt (GROUP_CODE).');
    ctx.db.settings.inviteCode = domain.generateInviteCode();
    return ctx.db.settings.inviteCode;
  }));

  // -------------------------------------------------------------------------
  // Bestand

  app.post('/api/strains', requireAuth, action((ctx, req) => domain.createStrain(ctx, req.body || {})));
  app.patch('/api/strains/:id', requireAuth, action((ctx, req) => domain.updateStrain(ctx, req.params.id, req.body || {})));
  app.post('/api/strains/:id/stock', requireAuth, action((ctx, req) => domain.changeStock(ctx, req.params.id, req.body || {})));
  app.delete('/api/strains/:id', requireAuth, action((ctx, req) => domain.removeStrain(ctx, req.params.id)));

  // -------------------------------------------------------------------------
  // Joints & Rotation

  app.post('/api/joints', requireAuth, action((ctx, req) => domain.createJoint(ctx, req.body || {})));
  app.post('/api/joints/:id/rotation', requireAuth, action((ctx, req) => domain.claimRotation(ctx, req.params.id, req.body?.position)));
  app.delete('/api/joints/:id/rotation/:position', requireAuth, action((ctx, req) => domain.leaveRotation(ctx, req.params.id, req.params.position)));
  app.post('/api/joints/:id/light', requireAuth, action((ctx, req) => domain.lightJoint(ctx, req.params.id)));
  app.post('/api/joints/:id/pass', requireAuth, action((ctx, req) => domain.passJoint(ctx, req.params.id)));
  app.post('/api/joints/:id/finish', requireAuth, action((ctx, req) => domain.finishJoint(ctx, req.params.id)));
  app.delete('/api/joints/:id', requireAuth, action((ctx, req) => domain.deleteJoint(ctx, req.params.id)));

  // -------------------------------------------------------------------------
  // Anfragen

  app.post('/api/requests', requireAuth, action((ctx, req) => domain.createRequest(ctx, req.body || {})));
  app.post('/api/requests/:id/accept', requireAuth, action((ctx, req) => domain.acceptRequest(ctx, req.params.id)));
  app.post('/api/requests/:id/decline', requireAuth, action((ctx, req) => domain.declineRequest(ctx, req.params.id)));
  app.post('/api/requests/:id/cancel', requireAuth, action((ctx, req) => domain.cancelRequest(ctx, req.params.id)));

  // -------------------------------------------------------------------------
  // Push-Abos

  app.post('/api/push/subscribe', requireAuth, (req, res) => {
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
      throw new AppError(400, 'Ungültiges Push-Abo.');
    }
    db.pushSubs = db.pushSubs.filter((s) => s.endpoint !== sub.endpoint);
    db.pushSubs.push({
      endpoint: sub.endpoint,
      keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) },
      memberId: req.member.id,
      createdAt: new Date().toISOString(),
    });
    const own = db.pushSubs.filter((s) => s.memberId === req.member.id);
    if (own.length > MAX_PUSH_SUBS_PER_MEMBER) {
      const drop = new Set(own.slice(0, own.length - MAX_PUSH_SUBS_PER_MEMBER));
      db.pushSubs = db.pushSubs.filter((s) => !drop.has(s));
    }
    store.save();
    res.json({ ok: true });
  });

  app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
    db.pushSubs = db.pushSubs.filter((s) => s.endpoint !== req.body?.endpoint);
    store.save();
    res.json({ ok: true });
  });

  app.post('/api/push/test', requireAuth, async (req, res) => {
    const subs = db.pushSubs.filter((s) => s.memberId === req.member.id);
    if (!subs.length) throw new AppError(404, 'Auf diesem Profil ist noch kein Gerät für Push angemeldet.');
    const gone = await push.send(subs, {
      title: '🌿 Else Live',
      body: `Push funktioniert, ${req.member.name}!`,
      url: '/#/profil',
      tag: 'test',
    });
    if (gone.length) {
      db.pushSubs = db.pushSubs.filter((s) => !gone.includes(s.endpoint));
      store.save();
    }
    res.json({ devices: subs.length - gone.length });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Unbekannter Endpunkt.' }));

  // -------------------------------------------------------------------------
  // Frontend

  app.use(
    express.static(PUBLIC_DIR, {
      setHeaders(res) {
        res.set('Cache-Control', 'no-cache');
      },
    }),
  );

  // -------------------------------------------------------------------------
  // Fehler

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Ungültige Anfrage.' });
    log.error(err);
    res.status(500).json({ error: 'Da ist etwas schiefgelaufen.' });
  });

  async function close() {
    for (const res of clients.keys()) res.end();
    clients.clear();
    await store.flush();
  }

  return { app, db, store, close, get inviteCode() { return db.settings.inviteCode; }, setupMode };
}
