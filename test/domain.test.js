import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as D from '../src/domain.js';

function setup() {
  const db = D.emptyDb();
  const vincent = D.createMember(db, { name: 'Vincent' });
  const lisa = D.createMember(db, { name: 'Lisa' });
  const jonas = D.createMember(db, { name: 'Jonas' });
  const as = (member) => D.createContext(db, member);
  const amnesia = D.createStrain(as(vincent), { name: 'Amnesia Haze', type: 'sativa', thc: '22', grams: '10' });
  const gelato = D.createStrain(as(lisa), { name: 'Gelato', type: 'hybrid', thc: 25.5, grams: 2.5 });
  return { db, vincent, lisa, jonas, as, amnesia, gelato };
}

describe('Bestand', () => {
  it('akzeptiert Komma-Zahlen und rundet sauber', () => {
    const { db, as, vincent } = setup();
    const s = D.createStrain(as(vincent), { name: 'Test', thc: '19,5', cbd: '0,1', grams: '3,333' });
    assert.equal(s.thc, 19.5);
    assert.equal(s.cbd, 0.1);
    assert.equal(s.grams, 3.333);
    assert.equal(db.stockLog.at(-1).reason, 'initial');
  });

  it('lehnt ungültige Werte ab', () => {
    const { as, vincent } = setup();
    assert.throws(() => D.createStrain(as(vincent), { name: '', grams: 1 }), /Sortenname fehlt/);
    assert.throws(() => D.createStrain(as(vincent), { name: 'X', grams: -1 }), /Menge/);
    assert.throws(() => D.createStrain(as(vincent), { name: 'X', grams: 1, thc: 140 }), /THC/);
  });

  it('füllt nach und korrigiert mit Protokoll', () => {
    const { db, as, vincent, amnesia } = setup();
    D.changeStock(as(vincent), amnesia.id, { action: 'add', grams: '5' });
    assert.equal(amnesia.grams, 15);
    assert.equal(amnesia.refillLevel, 15);
    D.changeStock(as(vincent), amnesia.id, { action: 'set', grams: '14,2' });
    assert.equal(amnesia.grams, 14.2);
    const log = db.stockLog.filter((l) => l.strainId === amnesia.id).map((l) => [l.reason, l.delta]);
    assert.deepEqual(log, [['initial', 10], ['restock', 5], ['correction', -0.8]]);
  });

  it('löscht unbenutzte Sorten, archiviert benutzte', () => {
    const { db, as, vincent, amnesia, gelato } = setup();
    D.createJoint(as(vincent), { components: [{ strainId: amnesia.id, grams: 0.5 }] });
    assert.deepEqual(D.removeStrain(as(vincent), amnesia.id), { archived: true });
    assert.deepEqual(D.removeStrain(as(vincent), gelato.id), { deleted: true });
    assert.equal(db.strains.length, 1);
    assert.equal(db.strains[0].archived, true);
  });
});

describe('Joints', () => {
  it('zieht die Menge vom Bestand ab – auch bei Mischungen', () => {
    const { as, vincent, amnesia, gelato } = setup();
    const joint = D.createJoint(as(vincent), {
      components: [
        { strainId: amnesia.id, grams: '0,3' },
        { strainId: gelato.id, grams: 0.2 },
      ],
      tobacco: 'Pueblo',
      carbonFilter: true,
      filterBrand: 'Purize Xtra Slim',
    });
    assert.equal(joint.grams, 0.5);
    assert.equal(amnesia.grams, 9.7);
    assert.equal(gelato.grams, 2.3);
    assert.equal(joint.tobacco, 'Pueblo');
    assert.equal(joint.filterBrand, 'Purize Xtra Slim');
    assert.deepEqual(joint.rotation.map((r) => r.position), [1]);
  });

  it('erlaubt beliebige Mengen, aber nicht mehr als da ist', () => {
    const { as, vincent, gelato } = setup();
    const big = D.createJoint(as(vincent), { components: [{ strainId: gelato.id, grams: 1.75 }] });
    assert.equal(big.grams, 1.75);
    assert.throws(
      () => D.createJoint(as(vincent), { components: [{ strainId: gelato.id, grams: 1 }] }),
      (err) => err.status === 409 && /Nicht genug Gelato/.test(err.message),
    );
    assert.equal(gelato.grams, 0.75, 'fehlgeschlagene Buchung ändert nichts');
  });

  it('ohne Aktivkohlefilter wird keine Marke gespeichert', () => {
    const { as, vincent, amnesia } = setup();
    const j = D.createJoint(as(vincent), { components: [{ strainId: amnesia.id, grams: 0.4 }], carbonFilter: false, filterBrand: 'Purize' });
    assert.equal(j.carbonFilter, false);
    assert.equal(j.filterBrand, null);
    assert.equal(j.tobacco, null);
  });

  it('benachrichtigt alle außer der rollenden Person', () => {
    const { db, vincent, lisa, jonas, amnesia } = setup();
    const ctx = D.createContext(db, vincent);
    D.createJoint(ctx, { components: [{ strainId: amnesia.id, grams: 0.5 }] });
    assert.equal(ctx.notifications.length, 1);
    assert.deepEqual(ctx.notifications[0].to.sort(), [lisa.id, jonas.id].sort());
    assert.equal(ctx.notifications[0].pref, 'joints');

    const quiet = D.createContext(db, vincent);
    D.createJoint(quiet, { components: [{ strainId: amnesia.id, grams: 0.5 }], notify: false });
    assert.equal(quiet.notifications.length, 0);
  });

  it('Löschen bucht den Bestand zurück', () => {
    const { db, as, vincent, amnesia } = setup();
    const j = D.createJoint(as(vincent), { components: [{ strainId: amnesia.id, grams: 0.6 }] });
    D.deleteJoint(as(vincent), j.id);
    assert.equal(amnesia.grams, 10);
    assert.equal(db.joints.length, 0);
    assert.equal(db.stockLog.at(-1).reason, 'joint-undo');
  });
});

describe('Rotation', () => {
  it('Plätze 2–5 sichern, wechseln und verlassen', () => {
    const { as, vincent, lisa, jonas, amnesia } = setup();
    const j = D.createJoint(as(vincent), { components: [{ strainId: amnesia.id, grams: 0.5 }] });
    D.claimRotation(as(lisa), j.id, 3);
    assert.throws(() => D.claimRotation(as(jonas), j.id, 3), /schon vergeben/);
    assert.throws(() => D.claimRotation(as(jonas), j.id, 6), /zwischen #2 und #5/);
    assert.throws(() => D.claimRotation(as(vincent), j.id, 2), /automatisch #1/);
    D.claimRotation(as(jonas), j.id, 2);
    D.claimRotation(as(lisa), j.id, 4); // Platz wechseln
    assert.deepEqual(j.rotation.map((r) => [r.position, r.memberId]), [[1, vincent.id], [2, jonas.id], [4, lisa.id]]);
    D.leaveRotation(as(lisa), j.id, 4);
    assert.equal(j.rotation.length, 2);
  });

  it('Anzünden, Weitergeben (freie Plätze werden übersprungen) und Beenden', () => {
    const { db, as, vincent, lisa, jonas, amnesia } = setup();
    const j = D.createJoint(as(vincent), { components: [{ strainId: amnesia.id, grams: 0.5 }] });
    D.claimRotation(as(lisa), j.id, 2);
    D.claimRotation(as(jonas), j.id, 5);
    D.lightJoint(as(vincent), j.id);
    assert.equal(j.status, 'lit');
    assert.equal(j.turn, 1);

    const pass1 = D.createContext(db, vincent);
    D.passJoint(pass1, j.id);
    assert.equal(j.turn, 2);
    assert.deepEqual(pass1.notifications[0].to, [lisa.id]);
    assert.throws(() => D.claimRotation(as(D.createMember(db, { name: 'Neu' })), j.id, 2), /vergeben|vorbei/);

    D.passJoint(as(lisa), j.id);
    assert.equal(j.turn, 5, 'leere Plätze 3 und 4 werden übersprungen');
    D.passJoint(as(jonas), j.id);
    assert.equal(j.status, 'done');
    assert.equal(j.turn, null);
  });
});

describe('Anfragen', () => {
  it('Anfrage erfüllen: Joint wird verknüpft, Anfragende:r bekommt Platz #2', () => {
    const { db, as, vincent, lisa, amnesia } = setup();
    const lisaCtx = D.createContext(db, lisa);
    const req = D.createRequest(lisaCtx, { toId: vincent.id, strainId: amnesia.id, grams: '0,5', message: 'Wär mal wieder Zeit' });
    assert.deepEqual(lisaCtx.notifications[0].to, [vincent.id]);
    assert.equal(req.grams, 0.5);

    const ctx = D.createContext(db, vincent);
    const j = D.createJoint(ctx, { components: [{ strainId: amnesia.id, grams: 0.5 }], requestId: req.id });
    assert.equal(req.status, 'done');
    assert.equal(req.jointId, j.id);
    assert.deepEqual(j.rotation.map((r) => [r.position, r.memberId]), [[1, vincent.id], [2, lisa.id]]);
    // Lisa bekommt die persönliche „fertig“-Nachricht statt der allgemeinen
    const toLisa = ctx.notifications.filter((n) => n.to.includes(lisa.id));
    assert.equal(toLisa.length, 1);
    assert.equal(toLisa[0].pref, 'requests');
  });

  it('nur die angefragte Person kann annehmen oder ablehnen', () => {
    const { as, vincent, lisa, jonas } = setup();
    const req = D.createRequest(as(lisa), { toId: vincent.id });
    assert.throws(() => D.acceptRequest(as(jonas), req.id), /jemand anderen/);
    D.declineRequest(as(vincent), req.id);
    assert.equal(req.status, 'declined');
    assert.throws(() => D.acceptRequest(as(vincent), req.id), /nicht mehr offen/);
  });

  it('Anfragen an alle kann jede:r annehmen', () => {
    const { db, as, lisa, jonas } = setup();
    const ctx = D.createContext(db, lisa);
    const req = D.createRequest(ctx, {});
    assert.equal(ctx.notifications[0].to.length, 2);
    D.acceptRequest(as(jonas), req.id);
    assert.equal(req.status, 'accepted');
    assert.equal(req.toId, jonas.id);
    D.cancelRequest(as(lisa), req.id);
    assert.equal(req.status, 'cancelled');
  });
});

describe('Einstellungen & Mitglieder', () => {
  it('Listen werden bereinigt, Namen sind eindeutig', () => {
    const { as, vincent, db } = setup();
    D.updateSettings(as(vincent), { tobaccos: [' Pueblo ', 'pueblo', '', 'Samson'], rotationSize: 6 });
    assert.deepEqual(db.settings.tobaccos, ['Pueblo', 'Samson']);
    assert.equal(db.settings.rotationSize, 6);
    assert.throws(() => D.updateSettings(as(vincent), { rotationSize: 1 }), /2 bis 12/);
    assert.throws(() => D.createMember(db, { name: 'vincent' }), /gibt es in der Gruppe schon/);
  });

  it('buildState verrät keine PIN-Hashes', () => {
    const { db, vincent } = setup();
    vincent.pinHash = 'scrypt$abc$def';
    const state = D.buildState(db, vincent);
    assert.equal(JSON.stringify(state).includes('scrypt$'), false);
    assert.equal(state.me.hasPin, true);
  });
});
