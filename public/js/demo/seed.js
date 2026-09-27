// Demo: Beispieldaten für die Vorschau – eine Woche Verlauf, ein brennender
// Joint, ein frisch gerollter und eine offene Anfrage. Alles wird mit der echten
// Geschäftslogik erzeugt und danach nur zeitlich zurückdatiert.

import * as D from '../../../src/domain.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function at(daysAgo, hour, minute = 0) {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

const iso = (t) => new Date(t).toISOString();

export function seedDemo() {
  const db = D.emptyDb();
  db.settings.inviteCode = 'ELSE24';
  db.settings.groupName = 'Else Live';

  const vincent = D.createMember(db, { name: 'Vincent', emoji: '🦊', color: '#34d399' });
  const lisa = D.createMember(db, { name: 'Lisa', emoji: '🌸', color: '#f472b6' });
  const jonas = D.createMember(db, { name: 'Jonas', emoji: '🎧', color: '#818cf8' });
  const mia = D.createMember(db, { name: 'Mia', emoji: '🌙', color: '#22d3ee' });
  const as = (m) => D.createContext(db, m);

  const amnesia = D.createStrain(as(vincent), { name: 'Amnesia Haze', type: 'sativa', thc: 22, cbd: 0.5, grams: 10, producer: 'Aurora' });
  const pedanios = D.createStrain(as(lisa), { name: 'Pedanios 22/1', type: 'indica', thc: 22, cbd: 1, grams: 5, producer: 'Apotheke am Markt' });
  const gelato = D.createStrain(as(jonas), { name: 'Gelato', type: 'hybrid', thc: 25.5, cbd: 0.1, grams: 2.5 });
  const pinkKush = D.createStrain(as(mia), { name: 'Pink Kush', type: 'indica', thc: 20, cbd: 0.3, grams: 5, producer: 'Bedrocan', notes: 'Eher für abends, sehr entspannend.' });

  // Wann etwas passiert ist: id → Zeitpunkt
  const times = new Map();
  const setup = at(9, 18);
  for (const m of [vincent, lisa, jonas, mia]) times.set(m.id, setup);
  for (const s of [amnesia, pedanios, gelato, pinkKush]) times.set(s.id, setup + 20 * MIN);

  // Verlauf der letzten Tage: [Tage zurück, Uhrzeit, wer rollt, Sorte, Gramm, Tabak, Filter, Rotation]
  const history = [
    [6, 20, vincent, amnesia, 0.5, 'Pueblo', 'Purize Xtra Slim', [lisa, jonas]],
    [5, 19, lisa, pedanios, 0.4, null, 'Purize Regular', [vincent]],
    [5, 22, jonas, gelato, 0.3, 'Mac Baren Choice', null, [mia, vincent]],
    [4, 21, mia, pinkKush, 0.5, 'Pueblo', 'ActiTube Slim', [lisa, jonas, vincent]],
    [3, 18, vincent, amnesia, 0.6, 'Pueblo', 'Purize Xtra Slim', [mia]],
    [3, 23, lisa, pedanios, 0.3, null, 'Purize Regular', [vincent, jonas]],
    [2, 20, jonas, gelato, 0.4, 'Golden Virginia', 'Tubo Slim', [lisa]],
    [1, 19, mia, pinkKush, 0.5, 'Pueblo', 'ActiTube Slim', [vincent, lisa]],
    [1, 22, vincent, amnesia, 0.75, 'Pueblo', 'Purize Xtra Slim', [jonas, mia, lisa]],
  ];

  for (const [daysAgo, hour, roller, strain, grams, tobacco, filter, others] of history) {
    const t = at(daysAgo, hour, 10);
    const joint = D.createJoint(as(roller), {
      components: [{ strainId: strain.id, grams }],
      tobacco,
      carbonFilter: Boolean(filter),
      filterBrand: filter,
      notify: false,
    });
    others.forEach((m, i) => D.claimRotation(as(m), joint.id, i + 2));
    D.lightJoint(as(roller), joint.id);
    while (joint.status === 'lit') {
      const holder = joint.rotation.find((r) => r.position === joint.turn);
      D.passJoint(as(D.memberById(db, holder.memberId)), joint.id);
    }
    times.set(joint.id, t);
    joint.createdAt = iso(t);
    joint.litAt = iso(t + 8 * MIN);
    joint.doneAt = iso(t + 25 * MIN);
    joint.rotation.forEach((r, i) => (r.joinedAt = iso(t + (i + 1) * MIN)));
  }

  // Vorgestern nachgefüllt
  D.changeStock(as(vincent), amnesia.id, { action: 'add', grams: 5, note: 'Neues Rezept' });
  const restockTime = at(2, 12, 30);

  // Heute: Lisas Joint brennt – Vincent ist gerade dran
  const now = Date.now();
  const lit = D.createJoint(as(lisa), {
    components: [{ strainId: pedanios.id, grams: 0.5 }],
    tobacco: 'Pueblo',
    carbonFilter: true,
    filterBrand: 'Purize Regular',
    note: 'Für nach dem Essen',
    notify: false,
  });
  D.claimRotation(as(vincent), lit.id, 2);
  D.claimRotation(as(mia), lit.id, 4);
  D.lightJoint(as(lisa), lit.id);
  D.passJoint(as(lisa), lit.id);
  times.set(lit.id, now - 18 * MIN);
  lit.createdAt = iso(now - 18 * MIN);
  lit.litAt = iso(now - 6 * MIN);

  // Heute: Jonas hat gerade eine Mischung gerollt, Plätze sind noch frei
  const fresh = D.createJoint(as(jonas), {
    components: [
      { strainId: gelato.id, grams: 0.25 },
      { strainId: amnesia.id, grams: 0.2 },
    ],
    tobacco: null,
    carbonFilter: true,
    filterBrand: 'Tubo Slim',
    notify: false,
  });
  D.claimRotation(as(lisa), fresh.id, 3);
  times.set(fresh.id, now - 4 * MIN);
  fresh.createdAt = iso(now - 4 * MIN);

  // Offene Anfrage von Mia an Vincent
  const request = D.createRequest(as(mia), {
    toId: vincent.id,
    strainId: amnesia.id,
    grams: 0.5,
    message: 'Rollst du uns heute Abend einen? 🌿',
  });
  times.set(request.id, now - 25 * MIN);
  request.createdAt = request.updatedAt = iso(now - 25 * MIN);

  // Zeitstempel von Buchungen und Aktivität passend setzen
  const timeOf = (entry, fallback) =>
    times.get(entry.jointId) ?? times.get(entry.requestId) ?? times.get(entry.strainId) ?? fallback;
  for (const m of db.members) m.createdAt = iso(setup);
  for (const s of db.strains) s.createdAt = s.updatedAt = iso(setup + 20 * MIN);
  for (const l of db.stockLog) {
    const t = l.reason === 'restock' ? restockTime : l.jointId ? times.get(l.jointId) : setup + 20 * MIN;
    l.at = iso(t);
  }
  let offset = 0;
  for (const a of db.activity) {
    offset += 1;
    const base =
      a.type === 'member_joined' ? times.get(a.actorId)
        : a.type === 'strain_restocked' ? restockTime
          : timeOf(a, setup);
    const step = { joint_lit: 8 * MIN, joint_passed: 14 * MIN, joint_done: 25 * MIN, rotation_joined: 2 * MIN }[a.type] ?? 0;
    a.at = iso(Math.min(now - 1000, base + step + offset));
  }
  db.activity.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  db.stockLog.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return { db, meId: vincent.id };
}
