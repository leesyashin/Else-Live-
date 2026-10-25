// Prüft die Strecke der neuen Küste ohne Browser: Abschnitte, nahtloser
// Umlauf, Kurvenradien, keine Falten in Wand und Klippe, Kacheln ohne Fugen
// (auch zwischen Detailstufen) und dass die Kamera an keiner Stelle des
// Umlaufs im Fels steckt.
//
// Aufruf: node scripts/kapsel-kueste-pruefen.mjs

import {
  ABSCHNITTE, KACHEL, KACHELN, SPUR, STRASSE, UMLAUF, VORSPRUNG,
  klippenTiefe, kruemmung, kurve, kurveSteigung, luftZurWand, wandHoehe, wandTiefe,
} from '../kapsel/js/kueste/strecke.js';
import { kachelBauen } from '../kapsel/js/kueste/bau-worker.js';
import { KAMERA } from '../kapsel/js/kueste/kamera.js';

const fehler = [];
const pruefe = (gut, text) => {
  if (!gut) fehler.push(text);
};

// 1. Abschnitte füllen den Umlauf genau.
const summe = ABSCHNITTE.reduce((s, a) => s + a.laenge, 0);
pruefe(summe === UMLAUF, `Abschnitte zusammen ${summe} m statt ${UMLAUF} m`);

// 2. Nahtlos: Verlauf, Wand und Klippe am Anfang wie am Ende.
const nah = (a, b) => Math.abs(a - b) < 1e-6;
pruefe(nah(kurve(0), kurve(UMLAUF)) && nah(kurveSteigung(0), kurveSteigung(UMLAUF)), 'Verlauf läuft nicht nahtlos um');
for (const h of [0, 3, 10, 30]) pruefe(nah(wandTiefe(0, h), wandTiefe(UMLAUF, h)), `Wand bei ${h} m läuft nicht nahtlos um`);
pruefe(nah(wandHoehe(0), wandHoehe(UMLAUF)) && nah(klippenTiefe(0, -20), klippenTiefe(UMLAUF, -20)), 'Krone oder Klippe läuft nicht nahtlos um');

// Die Wand ragt nirgends weiter vor als VORSPRUNG (darauf baut der Abbruch
// der Strahlen zur Sonne im Bau-Worker).
let vorne = Infinity;
for (let x = 0; x < UMLAUF; x += 0.5) for (let h = -0.5; h < 130; h += 0.5) vorne = Math.min(vorne, wandTiefe(x, h));
pruefe(vorne >= VORSPRUNG, `Wand ragt ${(-vorne).toFixed(2)} m über den Fahrbahnrand (höchstens ${-VORSPRUNG} m)`);

// 3. Richtung und Radien.
let maxWinkel = 0, minRadius = Infinity;
for (let x = 0; x < UMLAUF; x += 0.25) {
  maxWinkel = Math.max(maxWinkel, Math.abs(Math.atan(kurveSteigung(x))));
  minRadius = Math.min(minRadius, 1 / Math.abs(kruemmung(x)));
}
maxWinkel = (maxWinkel * 180) / Math.PI;
pruefe(maxWinkel <= 36, `Richtung weicht um ${maxWinkel.toFixed(1)}° ab (höchstens 36°)`);
pruefe(minRadius >= 90, `engster Radius ${minRadius.toFixed(0)} m (mindestens 90 m)`);

// 4. Keine Falten: Was innen in einer Kurve liegt, muss näher an der Straße
// sein als der Kurvenmittelpunkt. Wand mit Krone und Hang reicht bis etwa
// 40 m hinter ihre Oberkante, die Klippe bis zur Tiefe am Meer.
for (let x = 0; x < UMLAUF; x += 1) {
  const k = kruemmung(x);
  if (k > 0) {
    const weit = STRASSE + wandTiefe(x, wandHoehe(x)) + 40;
    pruefe(1 / k > weit, `Wand faltet bei x = ${x}`);
  } else if (k < 0) {
    pruefe(-1 / k > STRASSE + klippenTiefe(x, -78), `Klippe faltet bei x = ${x}`);
  }
}

// 5. Kacheln: Randspalten gleich, in jeder Stufe und über den Umlauf.
const KANTEN = ['fels', 'klippe'];
const spalte = (teil, letzte, zeilen) => {
  const p = teil.position;
  const n = p.length / 3 / zeilen;
  const j = letzte ? n - 1 : 0;
  return Array.from(p.subarray(j * zeilen * 3, (j + 1) * zeilen * 3));
};
const zeilenVon = (teil, stufe) => teil.position.length / 3 / (KACHEL / [1, 2, 4][stufe] + 1);
const gebaut = [0, 1, 2].map((stufe) => Array.from({ length: KACHELN }, (_, i) => kachelBauen(i, stufe)));
let fugen = 0;
for (let i = 0; i < KACHELN; i++) {
  const weiter = (i + 1) % KACHELN;
  for (const [a, b] of [[0, 0], [0, 2], [2, 1], [1, 0]]) {
    for (const name of KANTEN) {
      const ta = gebaut[a][i][name], tb = gebaut[b][weiter][name];
      const za = zeilenVon(ta, a), zb = zeilenVon(tb, b);
      const ende = spalte(ta, true, za), anfang = spalte(tb, false, zb);
      // x zählt je Kachel ab ihrem Anfang, auch über den Umlauf hinweg.
      const versatz = KACHEL;
      for (let k = 0; k < ende.length; k += 3) {
        if (Math.abs(ende[k] - (anfang[k] + versatz)) > 1e-3 || Math.abs(ende[k + 1] - anfang[k + 1]) > 1e-3 || Math.abs(ende[k + 2] - anfang[k + 2]) > 1e-3) {
          fugen++;
          break;
        }
      }
    }
  }
}
pruefe(fugen === 0, `${fugen} Fugen zwischen Kacheln`);
let ungueltig = 0;
for (const stufe of gebaut) for (const kachel of stufe) for (const teil of Object.values(kachel)) for (const v of teil.position) if (!Number.isFinite(v)) ungueltig++;
pruefe(ungueltig === 0, `${ungueltig} ungültige Koordinaten`);

// 6. Kamera: an jedem Meter des Umlaufs, in beiden Formaten, mit dem
// weitesten Schwenk; Luft zur Wand mindestens 0,8 m.
let engste = Infinity, wo = null;
for (const [format, k] of Object.entries(KAMERA)) {
  for (let u = 0; u < UMLAUF; u += 1) {
    for (const schwenk of [-k.schwenk, 0, k.schwenk]) {
      const w = ((k.blick + schwenk) * Math.PI) / 180;
      const x = k.ziel + Math.sin(w) * k.abstandMax, z = SPUR + Math.cos(w) * k.abstandMax;
      const luft = luftZurWand(u, x, k.hoeheMax, z);
      if (luft < engste) [engste, wo] = [luft, `${format}, u = ${u}`];
    }
  }
}
pruefe(engste >= 0.8, `Kamera nur ${engste.toFixed(2)} m vor der Wand (${wo})`);

console.log(`Umlauf ${UMLAUF} m in ${ABSCHNITTE.length} Abschnitten, Richtung bis ${maxWinkel.toFixed(1)}°, engster Radius ${minRadius.toFixed(0)} m, Kamera mindestens ${engste.toFixed(2)} m vor der Wand (${wo})`);
if (fehler.length) {
  for (const f of fehler) console.error('Fehler:', f);
  process.exit(1);
}
console.log('Alles in Ordnung.');
