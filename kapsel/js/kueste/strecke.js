// Die Strecke der neuen Küste: Verlauf der Straße, Abschnitte und die Form
// der Felswand. Reine Rechnung ohne three.js; Szene, Bau-Worker und das
// Prüfskript (scripts/kapsel-kueste-pruefen.mjs) nutzen dieselben Funktionen.
//
// Koordinaten wie in der Szene: x Fahrtrichtung, y oben, z nach rechts zur
// Bergseite; das Meer liegt links (-z). Die Straße ist ein Umlauf von UMLAUF
// Metern: Ihre Mitte liegt bei (x, kurve(x)), alles andere steht entlang der
// Normalen dazu. Abstände quer zur Straße (d) zählen ab dem Fahrbahnrand.

import { fbm, glatt } from './helfer.js';

export const UMLAUF = 2048;
export const KACHEL = 64;
export const KACHELN = UMLAUF / KACHEL;

export const SPUR = 1.75; // Mitte der Fahrspur, auf der das Auto fährt
export const STRASSE = 4.5; // halbe Breite von Rand zu Rand
export const BANKETT = 2.75; // vom Fahrbahnrand bis zum Fuß der Wand
export const MEER = -75; // Meeresspiegel tief unter der Straße
export const KOPFHOEHE = 6; // darunter steht die Wand nie über dem Bankett
// Weiter ragt die Wand nirgends über den Fahrbahnrand (d nie kleiner); der
// Bau-Worker bricht Strahlen davor ab, das Prüfskript sichert es.
export const VORSPRUNG = -0.5;

// Die Abschnitte der Strecke (siehe Plan). Wand: Höhe in m, Rücksprung des
// Fußes, Überhang über der Straße, Stufen (Rücksprung je 15 m Höhe), Rauheit
// der großen Formen. Brüstung: Bauart an der Meerseite.
export const ABSCHNITTE = [
  { name: 'offen', laenge: 320, hoehe: 70, rueck: 0.4, ueberhang: 1.6, stufen: 0, rauh: 1, bruestung: 'naturstein' },
  { name: 'netz', laenge: 256, hoehe: 55, rueck: 1.4, ueberhang: 0, stufen: 0, rauh: 1.4, bruestung: 'pfeiler' },
  { name: 'galerie', laenge: 128, hoehe: 45, rueck: 0, ueberhang: 0, stufen: 0, rauh: 0.6, bruestung: 'naturstein' },
  { name: 'nische', laenge: 320, hoehe: 80, rueck: 0.6, ueberhang: 2.6, stufen: 0, rauh: 1.2, bruestung: 'amalfi' },
  { name: 'tunnel', laenge: 64, hoehe: 90, rueck: 0, ueberhang: 0, stufen: 0, rauh: 0.8, bruestung: 'amalfi' },
  { name: 'bucht', laenge: 384, hoehe: 40, rueck: 3, ueberhang: 0, stufen: 1, rauh: 1, bruestung: 'amalfi' },
  { name: 'turm', laenge: 320, hoehe: 65, rueck: 1, ueberhang: 1, stufen: 0, rauh: 1, bruestung: 'naturstein' },
  { name: 'uebergang', laenge: 256, hoehe: 50, rueck: 2, ueberhang: 0, stufen: 0.5, rauh: 0.8, bruestung: 'naturstein' },
];
const ANFANG = [];
for (let i = 0, x = 0; i < ABSCHNITTE.length; x += ABSCHNITTE[i].laenge, i++) ANFANG.push(x);

export const BRUESTUNG = {
  naturstein: { hoehe: 0.8, dicke: 0.45 },
  amalfi: { hoehe: 0.9, dicke: 0.5 },
  pfeiler: { hoehe: 1.0, dicke: 0.35 },
};

const UEBERGANG = 30; // so lang gehen zwei Abschnitte ineinander über

// x auf den Umlauf legen: 0 ≤ x < UMLAUF.
export const umlauf = (x) => ((x % UMLAUF) + UMLAUF) % UMLAUF;

// Der Abschnitt bei x und wie weit er schon gefahren ist.
export function abschnittBei(x) {
  x = umlauf(x);
  let i = ABSCHNITTE.length - 1;
  while (ANFANG[i] > x) i--;
  return { index: i, abschnitt: ABSCHNITTE[i], weg: x - ANFANG[i] };
}

// Zahlen der Wand bei x, an den Grenzen weich überblendet.
const WERTE = ['hoehe', 'rueck', 'ueberhang', 'stufen', 'rauh'];
export function wandWerte(x) {
  const { index, weg, abschnitt } = abschnittBei(x);
  const zurueck = weg, vor = abschnitt.laenge - weg;
  let nachbar = null, anteil = 0;
  if (zurueck < UEBERGANG / 2) {
    nachbar = ABSCHNITTE[(index + ABSCHNITTE.length - 1) % ABSCHNITTE.length];
    anteil = 1 - glatt(-UEBERGANG / 2, UEBERGANG / 2, zurueck);
  } else if (vor < UEBERGANG / 2) {
    nachbar = ABSCHNITTE[(index + 1) % ABSCHNITTE.length];
    anteil = 1 - glatt(-UEBERGANG / 2, UEBERGANG / 2, vor);
  }
  const w = {};
  for (const name of WERTE) w[name] = nachbar ? abschnitt[name] + (nachbar[name] - abschnitt[name]) * anteil : abschnitt[name];
  return w;
}

// ---------- Verlauf ----------

// Seitlicher Versatz der Straßenmitte als Summe periodischer Wellen. So ist
// der Umlauf nahtlos, die Richtung weicht höchstens etwa 26° ab und kein
// Radius wird kleiner als gut 110 m (prüft scripts/kapsel-kueste-pruefen.mjs).
const WELLEN = [
  [1, 35, 0.3], [2, 22, 2.1], [3, 14, 4.0], [5, 9, 1.2], [7, 5, 5.3], [11, 2, 0.7],
];
const K = (2 * Math.PI) / UMLAUF;

export function kurve(x) {
  let z = 0;
  for (const [k, a, p] of WELLEN) z += a * Math.sin(K * k * x + p);
  return z;
}

export function kurveSteigung(x) {
  let s = 0;
  for (const [k, a, p] of WELLEN) s += a * K * k * Math.cos(K * k * x + p);
  return s;
}

function kurveZweite(x) {
  let s = 0;
  for (const [k, a, p] of WELLEN) s -= a * (K * k) ** 2 * Math.sin(K * k * x + p);
  return s;
}

// Krümmung, positiv in Rechtskurven (zur Bergseite hin).
export function kruemmung(x) {
  const s = kurveSteigung(x);
  return kurveZweite(x) / (1 + s * s) ** 1.5;
}

// Richtung der Straße (Winkel gegen x) und Normale nach rechts (Bergseite).
export const richtung = (x) => Math.atan(kurveSteigung(x));

export function normale(x) {
  const s = kurveSteigung(x);
  const l = Math.hypot(1, s);
  return [-s / l, 1 / l];
}

// Punkt quer zur Straße: q Meter von der Mitte nach rechts (links negativ).
// Gibt [x, z] zurück.
export function quer(x, q) {
  const [nx, nz] = normale(x);
  return [x + q * nx, kurve(x) + q * nz];
}

// ---------- Felswand ----------

// Wie weit die Wand bei x in der Höhe h hinter dem Fahrbahnrand steht.
// Unter KOPFHOEHE nie näher als das Bankett (minus 0,4 m Fels am Fuß), damit
// Kamera und Auto frei bleiben; darüber darf sie über die Straße hängen.
export function wandTiefe(x, h, w = wandWerte(x)) {
  const px = UMLAUF / 32;
  // Pfeiler und Nischen, oben gröber als unten.
  const gross = (fbm(x / 32, h / 24 + 3.7, px, 11, 3) - 0.5) * 4.5 * w.rauh;
  const mittel = (fbm(x / 8, h / 6 + 1.3, UMLAUF / 8, 23, 2) - 0.5) * 1.2 * w.rauh;
  // Kantige Brocken von 3 bis 4 m: Grate aus Rauschen ragen vor.
  const brocken = (0.5 - Math.abs(2 * fbm(x / 4, h / 3 + 5.9, UMLAUF / 4, 71, 3) - 1)) * 0.9 * w.rauh;
  // Schichtbänke: leichte Absätze alle gut 1,5 m.
  const band = h / 1.6;
  const bank = (band - Math.floor(band)) * 0.18;
  const ueber = w.ueberhang * glatt(KOPFHOEHE, 14, h) * (1 - glatt(24, 40, h));
  const stufen = w.stufen * Math.floor(Math.max(0, h) / 15) * 3;
  let d = BANKETT + w.rueck + Math.max(0, gross) * glatt(0, 3, h) + mittel - brocken + bank - ueber + stufen;
  // Kleiner Fuß aus Schutt: unten etwas vorgezogen.
  d -= 0.4 * (1 - glatt(0, 1.5, h));
  if (h < KOPFHOEHE) d = Math.max(d, BANKETT - 0.4);
  return d;
}

// Höhe der Wandkrone bei x.
export function wandHoehe(x, w = wandWerte(x)) {
  return w.hoehe * (0.75 + 0.5 * fbm(x / 64, 7.5, UMLAUF / 64, 31, 3));
}

// Klippe auf der Meerseite: Abbruchkante hinter der Brüstung (d negativ,
// gemessen vom linken Fahrbahnrand nach außen) und Wand bis ins Meer.
export function kantenAbstand(x) {
  return 2.2 + 2.5 * fbm(x / 32, 0.5, UMLAUF / 32, 41, 3);
}

export function klippenTiefe(x, y) {
  // y von 0 (Kante) bis MEER; nach unten tritt die Wand etwas zurück.
  const t = -y;
  const fels = (fbm(x / 16, t / 12, UMLAUF / 16, 53, 3) - 0.5) * 6;
  return kantenAbstand(x) + t * 0.22 + fels * glatt(0, 6, t);
}

// ---------- Bild des Autos ----------

// Das Auto steht in der Szene fest bei (0, SPUR), die Welt läuft und dreht
// sich so, dass die Straße unter ihm entlang x zeigt. aufStrecke rechnet einen
// Punkt (x, z) aus diesem Bild auf die Strecke um, wenn das Auto bei u ist:
// Weg s und Abstand q von der Straßenmitte (rechts positiv).
export function aufStrecke(u, x, z) {
  const [nx, nz] = normale(u);
  const tx = nz, tz = -nx; // Fahrtrichtung
  const px = u + x * tx + z * nx, pz = kurve(u) + x * tz + z * nz;
  let s = px;
  for (let i = 0; i < 4; i++) {
    const [mx, mz] = normale(s);
    s += (px - s) * mz + (pz - kurve(s)) * -mx;
  }
  const [mx, mz] = normale(s);
  return [s, (px - s) * mx + (pz - kurve(s)) * mz];
}

// Wie viel Luft ein Punkt im Bild des Autos in der Höhe h bis zur Felswand
// hat (negativ: im Fels).
export function luftZurWand(u, x, h, z) {
  const [s, q] = aufStrecke(u, x, z);
  return STRASSE + wandTiefe(s, h) - q;
}
