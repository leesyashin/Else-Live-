// Baut die Kacheln der neuen Küste im Hintergrund: je 64 m Straße, Bankett,
// Felswand mit Krone und Hang, Klippe bis ins Meer und Brüstung, als fertige
// Puffer (Positionen relativ zum Anfang der Kachel, Normalen, Indizes).
// Anfrage: { kachel, stufe }; Stufe 0 rechnet alle 1 m, 1 alle 2 m, 2 alle 4 m
// in Fahrtrichtung. Die Zeilen quer dazu sind in allen Stufen gleich, darum
// passen Kacheln verschiedener Stufen ohne Fugen aneinander.
//
// Normalen kommen aus der Flächenfunktion selbst (Differenzen über die
// Kachelgrenze hinweg), so gibt es an den Nähten keine Lichtkanten.

import {
  BANKETT, BRUESTUNG, KACHEL, MEER, STRASSE, UMLAUF,
  abschnittBei, klippenTiefe, normale, quer, wandHoehe, wandTiefe, wandWerte,
} from './strecke.js';

const SCHRITT = [1, 2, 4];
const WAND_ZEILEN = 40; // Fuß bis Krone
const KRONE_ZEILEN = 6; // über die Kante nach hinten
const HANG_ZEILEN = 8; // Hang dahinter
const KLIPPE_ZEILEN = 18;
// Mittelleitlinie: 114 Striche auf den Umlauf, damit die Markierung nahtlos
// umläuft (ein Strich alle gut 18 m).
const MARKEN = 114;

// Ein Gitter aus Spalten (entlang der Straße) und Zeilen. punkt(s, r) liefert
// [x, y, z] für den Weg s und die (auch gebrochene) Zeile r; die Normale
// zeigt nach dr × ds, mit umdrehen nach ds × dr.
function gitter(spalten, zeilen, punkt, anfang, umdrehen = false) {
  const n = spalten.length * (zeilen + 1);
  const position = new Float32Array(n * 3);
  const normal = new Float32Array(n * 3);
  let i = 0;
  for (const s of spalten) {
    for (let r = 0; r <= zeilen; r++) {
      const p = punkt(s, r);
      const ds0 = punkt(s - 0.5, r), ds1 = punkt(s + 0.5, r);
      const dr0 = punkt(s, Math.max(0, r - 0.5)), dr1 = punkt(s, Math.min(zeilen, r + 0.5));
      const a = [ds1[0] - ds0[0], ds1[1] - ds0[1], ds1[2] - ds0[2]];
      const b = [dr1[0] - dr0[0], dr1[1] - dr0[1], dr1[2] - dr0[2]];
      let nx = b[1] * a[2] - b[2] * a[1], ny = b[2] * a[0] - b[0] * a[2], nz = b[0] * a[1] - b[1] * a[0];
      if (umdrehen) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      position.set([p[0] - anfang, p[1], p[2]], i * 3);
      normal.set([nx / l, ny / l, nz / l], i * 3);
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
  return { position, normal, index };
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
  const punkt = (s, r) => {
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
    const [x, z] = quer(s, STRASSE + d);
    return [x, h, z];
  };
  return gitter(spalten, zeilen, punkt, anfang);
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
function streifen(spalten, qs, y, anfang, mitUv) {
  const n = spalten.length * qs.length;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3);
  const uv = mitUv ? new Float32Array(n * 2) : null;
  let i = 0;
  for (const s of spalten) {
    for (let k = 0; k < qs.length; k++) {
      const q = typeof qs[k] === 'function' ? qs[k](s) : qs[k];
      const [x, z] = quer(s, q);
      position.set([x - anfang, y, z], i * 3);
      normal.set([0, 1, 0], i * 3);
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
  return uv ? { position, normal, uv, index } : { position, normal, index };
}

// Brüstung als Profil, das entlang der Straße läuft: Innenseite, Abdeckung,
// Außenseite, jede Fläche mit eigener, flacher Normale.
function bruestung(spalten, anfang) {
  const flaechen = 3;
  const n = spalten.length * flaechen * 2;
  const position = new Float32Array(n * 3), normal = new Float32Array(n * 3);
  let i = 0;
  const innen = -STRASSE - 0.35;
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
  return { position, normal, index };
}

function kachelBauen(kachel, stufe) {
  const anfang = kachel * KACHEL;
  const schritt = SCHRITT[stufe];
  const spalten = [];
  for (let s = anfang; s <= anfang + KACHEL + 1e-6; s += schritt) spalten.push(s);
  return {
    strasse: streifen(spalten, [-STRASSE, STRASSE], 0, anfang, true),
    rand: streifen(spalten, [STRASSE, STRASSE + BANKETT + 0.6], -0.03, anfang, false),
    kante: streifen(spalten, [(s) => -STRASSE - klippenTiefe(s, 0) - 0.05, -STRASSE], -0.03, anfang, false),
    fels: wand(spalten, anfang),
    klippe: klippe(spalten, anfang),
    bruestung: bruestung(spalten, anfang),
  };
}

if (typeof self !== 'undefined') {
  self.onmessage = ({ data: { kachel, stufe } }) => {
    const teile = kachelBauen(kachel, stufe);
    const puffer = [];
    for (const teil of Object.values(teile)) for (const a of Object.values(teil)) puffer.push(a.buffer);
    self.postMessage({ kachel, stufe, teile }, puffer);
  };
}

// Für Prüfungen ohne Worker (scripts/kapsel-kueste-pruefen.mjs).
export { kachelBauen };
