// Baut die Kacheln der neuen Küste im Hintergrund: je 64 m Straße, Bankett,
// Felswand mit Krone und Hang, Klippe bis ins Meer und Brüstung, als fertige
// Puffer (Positionen relativ zum Anfang der Kachel, Normalen, Indizes).
// Anfrage: { kachel, stufe }; Stufe 0 rechnet alle 1 m, 1 alle 2 m, 2 alle 4 m
// in Fahrtrichtung. Die Zeilen quer dazu sind in allen Stufen gleich, darum
// passen Kacheln verschiedener Stufen ohne Fugen aneinander.
//
// Normalen kommen aus der Flächenfunktion selbst (Differenzen über die
// Kachelgrenze hinweg), so gibt es an den Nähten keine Lichtkanten.
//
// Licht wird eingebacken, je Ecke zwei Werte im Attribut `licht`: wie viel
// Sonne ankommt (Strahl zur Sonne gegen Wand und Brüstung) und wie viel
// Himmel (Verdeckung durch Überhänge, Pfeiler, Wandfuß, Brüstung). Die Sonne
// steht fest zur Landschaft (sonne in der Anfrage, Koordinaten der Strecke);
// nah am Auto übernimmt die Schattenkarte.
//
// Für das Material der Wand (material.js) bekommt jede Ecke ihre Lage auf der
// Strecke (`ort`, für die Textur) und zwei Werte in `fels`: wie viel Wasser
// hier herabläuft (Sinterstreifen) und wie sehr die Stelle vorsteht (frischer,
// hellerer Bruch). Dazu Bewuchs als Liste (x, y, z, Größe, Drehung, Farbe) und
// im Abschnitt „netz“ das Steinschlagnetz.

import { fbm, glatt, zufall } from './helfer.js';
import {
  BRUESTUNG, KACHEL, MEER, STRASSE, UMLAUF, VORSPRUNG,
  ABSCHNITTE, abschnittBei, klippenTiefe, normale, quer, wandHoehe, wandTiefe, wandWerte,
} from './strecke.js';

const SCHRITT = [1, 2, 4];
const WAND_ZEILEN = 56; // Fuß bis Krone
const KRONE_ZEILEN = 6; // über die Kante nach hinten
const HANG_ZEILEN = 8; // Hang dahinter
const KLIPPE_ZEILEN = 18;
// Mittelleitlinie: 114 Striche auf den Umlauf, damit die Markierung nahtlos
// umläuft (ein Strich alle gut 18 m).
const MARKEN = 114;
const QUER = 0.5; // Zeilen quer über Straße und Bankett, für Schattenkanten
// Schritte des Strahls zur Sonne, in Metern.
const STRAHL = [0.5, 1, 1.8, 2.8, 4, 5.5, 7.5, 10, 13, 17, 22, 28];
const INNEN = -STRASSE - 0.35; // Innenseite der Brüstung

// Sonne in Koordinaten der Strecke; kommt mit jeder Anfrage.
let SONNE = [0, 1, 0];

// Sonne im Rahmen der Straße bei s: entlang, hoch, quer (zur Bergseite +).
function sonneBei(s) {
  const [nx, nz] = normale(s);
  const [x, y, z] = SONNE;
  return [x * nz - z * nx, y, x * nx + z * nz];
}

// Höhe der Krone, auf 1 m gerundet zwischengespeichert (ändert sich langsam).
const kronen = new Map();
function krone(s) {
  const k = Math.round(s);
  let h = kronen.get(k);
  if (h === undefined) {
    h = wandHoehe(k);
    if (kronen.size > 4000) kronen.clear();
    kronen.set(k, h);
  }
  return h;
}

// Wie viel Sonne ein Punkt (Weg s, Höhe h, d Meter hinter dem Fahrbahnrand
// der Bergseite) trotz Felswand bekommt: Strahl zur Sonne, weicher Rand.
function wandSchatten(s, h, d) {
  const [ls, ly, lq] = sonneBei(s);
  if (ly <= 0) return 0;
  let licht = 1;
  for (const t of STRAHL) {
    const s2 = s + t * ls, h2 = h + t * ly, d2 = d + t * lq;
    // Weiter vor der Wand, als sie irgendwo vorragt, und auf dem Weg weg
    // von ihr: frei.
    if (lq < 0 && d2 < VORSPRUNG) break;
    if (h2 > krone(s2) + 2) break;
    if (h2 < -0.5) continue;
    licht = Math.min(licht, glatt(-0.35, 0.35, wandTiefe(s2, h2) - d2));
    if (licht === 0) break;
  }
  return licht;
}

// Sonne am Boden bei Weg s, Abstand q von der Mitte: Schatten der Brüstung
// (Sonne von der Meerseite) und der Wand (Sonne von der Bergseite).
function bodenLicht(s, q) {
  const [, ly, lq] = sonneBei(s);
  let licht = 1;
  if (lq < -1e-3 && q > INNEN) {
    const art = BRUESTUNG[abschnittBei(s).abschnitt.bruestung];
    const y = (ly * (q - INNEN)) / -lq;
    licht = glatt(art.hoehe - 0.12, art.hoehe + 0.12, y);
  } else if (lq > 1e-3) {
    licht = wandSchatten(s, 0.05, q - STRASSE);
  }
  return licht;
}

// Fläche der Wand bei (s, h, d): Himmelslicht (Fels, der darüber oder daneben
// weiter zur Straße vorragt, verdeckt den Himmel; am Fuß dunkler), Sinter
// (Wasser läuft von Vorsprüngen und der Krone herab) und Kante (die Nachbarn
// liegen tiefer im Berg: Vorsprung, frischer Bruch).
function wandFlaeche(s, h, d, hoehe) {
  let oben = 0, darueber = d;
  for (const dh of [1, 3, 7]) {
    const t = wandTiefe(s, h + dh);
    if (dh === 1) darueber = t;
    oben = Math.max(oben, (d - t) / dh);
  }
  const links = wandTiefe(s - 2, h), rechts = wandTiefe(s + 2, h), darunter = wandTiefe(s, h - 1);
  const seite = Math.atan(Math.max(0, (d - links) / 2)) + Math.atan(Math.max(0, (d - rechts) / 2));
  const himmel = (1 - 0.55 * Math.sin(Math.atan(oben))) * (1 - 0.2 * seite) * (0.55 + 0.45 * glatt(-0.5, 2.5, h));
  const kante = ((links + rechts + darueber + darunter) / 4 - d) * 3;
  const sinter = (oben * 2 + 0.8 * glatt(0.35, 0.9, h / hoehe)) * glatt(0.2, 0.55, fbm(s / 8, 0.5, UMLAUF / 8, 61, 3));
  const k = (v, a, b) => Math.min(b, Math.max(a, v));
  return [k(himmel, 0.2, 1), k(sinter, 0, 1), k(kante, 0, 1)];
}

// Ein Gitter aus Spalten (entlang der Straße) und Zeilen. punkt(s, r) liefert
// [x, y, z] für den Weg s und die (auch gebrochene) Zeile r; die Normale
// zeigt nach dr × ds, mit umdrehen nach ds × dr.
function gitter(spalten, zeilen, punkt, anfang, umdrehen = false, beleuchten = null) {
  const n = spalten.length * (zeilen + 1);
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  const licht = new Float32Array(n * 2).fill(1);
  const fels = new Float32Array(n * 2);
  const ort = new Float32Array(n * 3);
  let i = 0;
  for (const s of spalten) {
    for (let r = 0; r <= zeilen; r++) {
      const p = punkt(s, r);
      ort.set(p, i * 3);
      const ds0 = punkt(s - 0.5, r), ds1 = punkt(s + 0.5, r);
      const dr0 = punkt(s, Math.max(0, r - 0.5)), dr1 = punkt(s, Math.min(zeilen, r + 0.5));
      const a = [ds1[0] - ds0[0], ds1[1] - ds0[1], ds1[2] - ds0[2]];
      const b = [dr1[0] - dr0[0], dr1[1] - dr0[1], dr1[2] - dr0[2]];
      let nx = b[1] * a[2] - b[2] * a[1], ny = b[2] * a[0] - b[0] * a[2], nz = b[0] * a[1] - b[1] * a[0];
      if (umdrehen) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      position.set([p[0] - anfang, p[1], p[2]], i * 3);
      normal.set([nx / l, ny / l, nz / l], i * 3);
      if (beleuchten) {
        const b = beleuchten(s, r);
        licht.set([b[0], b[1]], i * 2);
        if (b.length > 2) fels.set([b[2], b[3]], i * 2);
      }
      i++;
    }
  }
  const index = new Uint32Array((spalten.length - 1) * zeilen * 6);
  let k = 0;
  for (let j = 0; j < spalten.length - 1; j++) {
    for (let r = 0; r < zeilen; r++) {
      const a = j * (zeilen + 1) + r, b = a + zeilen + 1, c = a + 1, d = b + 1;
      if (umdrehen) index.set([a, b, c, b, d, c], k);
      else index.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  return { position, normal, licht, fels, ort, index };
}

// Felswand: Zeilen vom Fuß bis zur Krone, dann über die Kante zurück und den
// Hang hinauf. Merkt sich die Werte je Weg, sie werden für jede Zeile gebraucht.
function wand(spalten, anfang) {
  const merk = new Map();
  const werte = (s) => {
    let m = merk.get(s);
    if (!m) {
      const w = wandWerte(s);
      const hoehe = wandHoehe(s, w);
      m = { w, hoehe, oben: wandTiefe(s, hoehe, w) };
      merk.set(s, m);
    }
    return m;
  };
  const zeilen = WAND_ZEILEN + KRONE_ZEILEN + HANG_ZEILEN;
  const lage = (s, r) => {
    const { w, hoehe, oben } = werte(s);
    let h, d;
    if (r <= WAND_ZEILEN) {
      h = -0.5 + (hoehe + 0.5) * (r / WAND_ZEILEN) ** 1.35;
      d = wandTiefe(s, h, w);
    } else if (r <= WAND_ZEILEN + KRONE_ZEILEN) {
      const t = (r - WAND_ZEILEN) / KRONE_ZEILEN;
      h = hoehe + 1.5 * Math.sin(t * Math.PI * 0.5);
      d = oben + 9 * t;
    } else {
      const t = (r - WAND_ZEILEN - KRONE_ZEILEN) / HANG_ZEILEN;
      h = hoehe + 1.5 + 30 * t ** 1.2;
      d = oben + 9 + 30 * t;
    }
    return [h, d];
  };
  const punkt = (s, r) => {
    const [h, d] = lage(s, r);
    const [x, z] = quer(s, STRASSE + d);
    return [x, h, z];
  };
  // Licht und Fläche nur für die Wand selbst; Krone und Hang liegen frei.
  const beleuchten = (s, r) => {
    if (r > WAND_ZEILEN) return [1, 1, 0, 0];
    const [h, d] = lage(s, r);
    const [himmel, sinter, kante] = wandFlaeche(s, h, d, werte(s).hoehe);
    return [wandSchatten(s, h + 0.05, d - 0.25), himmel, sinter, kante];
  };
  return { ...gitter(spalten, zeilen, punkt, anfang, false, beleuchten), werte };
}

// Bewuchs einer Kachel, unabhängig von der Stufe (sonst spränge er beim
// Wechsel): Macchia an der Krone, Bäume und Büsche am Hang, kleine Büsche auf
// Absätzen der Wand, Polster am Wandfuß. Grobe Stufen lassen die kleinen weg.
// Je Eintrag x (relativ zur Kachel), y, z, Größe, Drehung, Farbe (0..1).
function bewuchs(kachel, stufe, werte) {
  const anfang = kachel * KACHEL;
  const r = zufall(kachel * 7919 + 13);
  const liste = [];
  const setze = (s, d, h, groesse, farbe) => {
    const [x, z] = quer(s, STRASSE + d);
    liste.push(x - anfang, h, z, groesse, r() * 6.283, farbe);
  };
  const imNetz = (s) => abschnittBei(s).abschnitt.name === 'netz';
  for (let k = 0; k < 26; k++) {
    const s = anfang + r() * KACHEL;
    const { hoehe, oben } = werte(s);
    setze(s, oben + 0.6 + r() * 7, hoehe + 0.6 + r() * 1.2, 0.9 + r() * 1.6, r());
  }
  for (let k = 0; k < 22; k++) {
    const s = anfang + r() * KACHEL, t = r();
    const { hoehe, oben } = werte(s);
    setze(s, oben + 9 + 30 * t, hoehe + 1.5 + 30 * t ** 1.2, 1.8 + r() * 2.8, r());
  }
  for (let k = 0; k < 40; k++) {
    const s = anfang + r() * KACHEL;
    const { hoehe } = werte(s);
    const h = 2 + r() * Math.max(0, hoehe - 4);
    const g = 0.35 + r() * 0.6, f = r(), ja = r();
    if (stufe === 2 || imNetz(s)) continue;
    // Absatz: darüber tritt der Fels deutlich zurück.
    const d = wandTiefe(s, h);
    if (wandTiefe(s, h + 1) - d > 0.5 && ja < 0.7) setze(s, d + 0.2, h, g, f);
  }
  for (let k = 0; k < 10; k++) {
    const s = anfang + r() * KACHEL;
    const g = 0.25 + r() * 0.35, f = r() * 0.6;
    if (stufe === 0) setze(s, wandTiefe(s, 0.3) - 0.15, 0, g, f);
  }
  return new Float32Array(liste);
}

// Steinschlagnetz im Abschnitt „netz“: liegt auf den Vorsprüngen der Wand
// (Minimum der Tiefe ringsum), von 1,2 m bis 24 m Höhe. uv in Metern.
const NETZ_ZEILEN = 23;
function netz(spalten, anfang) {
  const i = ABSCHNITTE.findIndex((a) => a.name === 'netz');
  const von = ABSCHNITTE.slice(0, i).reduce((x, a) => x + a.laenge, 0) + 4;
  const bis = von + ABSCHNITTE[i].laenge - 8;
  if (spalten.at(-1) <= von || spalten[0] >= bis) return null;
  const innen = spalten.filter((s) => s > von && s < bis);
  const teil = [...new Set([Math.max(von, spalten[0]), ...innen, Math.min(bis, spalten.at(-1))])].sort((a, b) => a - b);
  if (teil.length < 2) return null;
  const hoehe = (r) => 1.2 + (22.8 * r) / NETZ_ZEILEN;
  const punkt = (s, r) => {
    const h = hoehe(r);
    let d = Infinity;
    for (const ds of [-1.5, 0, 1.5]) for (const dh of [-1, 0, 1]) d = Math.min(d, wandTiefe(s + ds, h + dh));
    const [x, z] = quer(s, STRASSE + d - 0.3);
    return [x, h, z];
  };
  const g = gitter(teil, NETZ_ZEILEN, punkt, anfang);
  const netzUv = new Float32Array(teil.length * (NETZ_ZEILEN + 1) * 2);
  let k = 0;
  for (const s of teil) for (let r = 0; r <= NETZ_ZEILEN; r++, k++) netzUv.set([s - von, hoehe(r) - 1.2], k * 2);
  g.licht.fill(1);
  return { ...g, netzUv };
}


// Klippe von der Abbruchkante bis unter den Meeresspiegel.
function klippe(spalten, anfang) {
  const punkt = (s, r) => {
    const y = (MEER - 3) * (r / KLIPPE_ZEILEN) ** 1.2;
    const [x, z] = quer(s, -STRASSE - klippenTiefe(s, y));
    return [x, y - 0.04, z];
  };
  return gitter(spalten, KLIPPE_ZEILEN, punkt, anfang, true);
}

// Flache Streifen: Straße, Bankett, Streifen bis zur Kante. qs: Abstände von
// der Mitte, quer über den Streifen und aufsteigend (sonst zeigte die Fläche
// nach unten).
function streifen(spalten, qs, y, anfang, mitUv, verdeckung = () => 1) {
  const n = spalten.length * qs.length;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3);
  const licht = new Float32Array(n * 2);
  const uv = mitUv ? new Float32Array(n * 2) : null;
  let i = 0;
  for (const s of spalten) {
    for (let k = 0; k < qs.length; k++) {
      const q = typeof qs[k] === 'function' ? qs[k](s) : qs[k];
      const [x, z] = quer(s, q);
      position.set([x - anfang, y, z], i * 3);
      normal.set([0, 1, 0], i * 3);
      licht.set([bodenLicht(s, q), verdeckung(s, q)], i * 2);
      if (uv) uv.set([(s * MARKEN) / UMLAUF, (q + STRASSE) / (2 * STRASSE)], i * 2);
      i++;
    }
  }
  const zeilen = qs.length - 1;
  const index = new Uint32Array((spalten.length - 1) * zeilen * 6);
  let k = 0;
  for (let j = 0; j < spalten.length - 1; j++) {
    for (let r = 0; r < zeilen; r++) {
      const a = j * qs.length + r, b = a + qs.length, c = a + 1, d = b + 1;
      index.set([a, c, b, b, c, d], k);
      k += 6;
    }
  }
  return uv ? { position, normal, licht, uv, index } : { position, normal, licht, index };
}

// Zeilen von a bis b im Abstand QUER, beide Enden dabei.
function zeilenVon(a, b) {
  const n = Math.max(1, Math.round((b - a) / QUER));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

// Brüstung als Profil, das entlang der Straße läuft: Innenseite, Abdeckung,
// Außenseite, jede Fläche mit eigener, flacher Normale.
function bruestung(spalten, anfang) {
  const flaechen = 3;
  const n = spalten.length * flaechen * 2;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3);
  const licht = new Float32Array(n * 2).fill(1);
  let i = 0;
  const innen = INNEN;
  for (const s of spalten) {
    const art = BRUESTUNG[abschnittBei(s).abschnitt.bruestung];
    const aussen = innen - art.dicke;
    const [nx, nz] = normale(s);
    const ecken = [
      [[innen, 0], [innen, art.hoehe], [nx, 0, nz]],
      [[innen, art.hoehe], [aussen, art.hoehe], [0, 1, 0]],
      [[aussen, art.hoehe], [aussen, -0.1], [-nx, 0, -nz]],
    ];
    for (const [p0, p1, nrm] of ecken) {
      for (const [q, h] of [p0, p1]) {
        const [x, z] = quer(s, q);
        position.set([x - anfang, h, z], i * 3);
        normal.set(nrm, i * 3);
        // Am Fuß dunkler, wo Mauer und Boden sich treffen.
        if (h <= 0) licht[i * 2 + 1] = 0.6;
        i++;
      }
    }
  }
  const index = new Uint32Array((spalten.length - 1) * flaechen * 6);
  let k = 0;
  const proSpalte = flaechen * 2;
  for (let j = 0; j < spalten.length - 1; j++) {
    for (let f = 0; f < flaechen; f++) {
      const a = j * proSpalte + f * 2, c = a + 1, b = a + proSpalte, d = b + 1;
      index.set([a, b, c, b, d, c], k);
      k += 6;
    }
  }
  return { position, normal, licht, index };
}

function kachelBauen(kachel, stufe) {
  const anfang = kachel * KACHEL;
  const schritt = SCHRITT[stufe];
  const spalten = [];
  for (let s = anfang; s <= anfang + KACHEL + 1e-6; s += schritt) spalten.push(s);
  const { werte, ...fels } = wand(spalten, anfang);
  const teile = {
    // Neben der Brüstung etwas dunkler.
    strasse: streifen(spalten, zeilenVon(-STRASSE, STRASSE), 0, anfang, true, (s, q) => 0.7 + 0.3 * glatt(0, 0.8, q - INNEN)),
    // Am Fuß der Wand dunkler.
    // Bis unter den Wandfuß, auch wo die Wand weit zurücktritt (sonst sähe
    // man durch die Lücke ins Leere).
    rand: streifen(spalten, Array.from({ length: 9 }, (_, k) => (s) => STRASSE + (k / 8) * (wandTiefe(s, -0.3) + 0.5)), -0.03, anfang, false,
      (s, q) => 0.45 + 0.55 * glatt(0, 2, STRASSE + wandTiefe(s, 0.3) - q)),
    kante: streifen(spalten, [(s) => -STRASSE - klippenTiefe(s, 0) - 0.05, -STRASSE - 1.4, -STRASSE], -0.03, anfang, false,
      (s, q) => 0.7 + 0.3 * glatt(0, 0.6, INNEN - 0.5 - q)),
    fels,
    klippe: klippe(spalten, anfang),
    bruestung: bruestung(spalten, anfang),
  };
  const n = netz(spalten, anfang);
  if (n) teile.netz = n;
  return { teile, bewuchs: bewuchs(kachel, stufe, werte) };
}

if (typeof self !== 'undefined') {
  self.onmessage = ({ data: { kachel, stufe, sonne, version } }) => {
    SONNE = sonne;
    const { teile, bewuchs } = kachelBauen(kachel, stufe);
    const puffer = [bewuchs.buffer];
    for (const teil of Object.values(teile)) for (const a of Object.values(teil)) puffer.push(a.buffer);
    self.postMessage({ kachel, stufe, version, teile, bewuchs }, puffer);
  };
}

// Für Prüfungen ohne Worker (scripts/kapsel-kueste-pruefen.mjs).
function sonneSetzen(sonne) {
  SONNE = sonne;
}
export { kachelBauen, sonneSetzen };
