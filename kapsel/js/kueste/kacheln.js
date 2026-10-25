// Der Ring aus Kacheln um das Auto: von HINTEN Metern hinter ihm bis VORN
// Metern voraus. Fehlende Kacheln baut der Worker (bau-worker.js), die
// nächsten zuerst; nah gibt es mehr Spalten als fern. Eine Kachel wechselt
// ihre Stufe erst, wenn die neue fertig ist, so blitzt nichts auf. Licht ist
// eingebacken: Dreht die Sonne (andere Stimmung), wird jede Kachel neu gebaut,
// die alte bleibt stehen, bis die neue da ist.

import * as THREE from '../../vendor/three-r186.min.js';
import { KACHEL, KACHELN, UMLAUF } from './strecke.js';

const HINTEN = 160;
const VORN = 1400;
const STUFEN = [128, 384]; // bis hierher Stufe 0, dann 1, danach 2
const NAH = 256; // ohne diese Kacheln wird nicht gezeichnet
const GLEICHZEITIG = 3; // Aufträge, die beim Worker liegen dürfen

// Lage einer Kachel zum Auto in Metern, -UMLAUF/2 bis UMLAUF/2.
const lage = (kachel, u) => ((((kachel * KACHEL - u) % UMLAUF) + UMLAUF * 1.5) % UMLAUF) - UMLAUF / 2;

// Entfernung vom Auto bis zum nächsten Punkt der Kachel.
const entfernung = (l) => (l > 0 ? l : Math.max(0, -(l + KACHEL)));

export class Kacheln {
  // materialien: je Teil (strasse, rand, kante, fels, klippe, bruestung) eines.
  constructor(welt, materialien) {
    this.welt = welt;
    this.materialien = materialien;
    this.kacheln = new Map(); // Nummer -> { gruppe, stufe }
    this.auftraege = new Map(); // Nummer -> Stufe
    this.gewuenscht = new Map(); // Nummer -> Stufe
    this.sonne = [0, 1, 0]; // Koordinaten der Strecke
    this.version = 0; // zählt mit jeder neuen Sonne hoch
    this.worker = new Worker(new URL('./bau-worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = ({ data }) => this.fertig(data);
    this.worker.onerror = (e) => console.warn('Küste: Bau der Kacheln fehlgeschlagen', e.message);
  }

  // Neue Sonne (Richtung zur Sonne, Koordinaten der Strecke): alles neu backen.
  sonneSetzen(sonne) {
    this.sonne = sonne;
    this.version++;
  }

  fertig({ kachel, stufe, version, teile }) {
    this.auftraege.delete(kachel);
    // Inzwischen nicht mehr gebraucht oder schon in dieser Stufe da.
    if (!this.gewuenscht.has(kachel)) return;
    const gruppe = new THREE.Group();
    for (const [name, t] of Object.entries(teile)) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(t.position, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(t.normal, 3));
      geo.setAttribute('licht', new THREE.BufferAttribute(t.licht, 2));
      if (t.uv) geo.setAttribute('uv', new THREE.BufferAttribute(t.uv, 2));
      geo.setIndex(new THREE.BufferAttribute(t.index, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.materialien[name]);
      mesh.castShadow = mesh.receiveShadow = true;
      gruppe.add(mesh);
    }
    this.weg(kachel);
    this.kacheln.set(kachel, { gruppe, stufe, version });
    this.welt.add(gruppe);
    if (this.u !== undefined) gruppe.position.x = lage(kachel, this.u);
  }

  weg(kachel) {
    const k = this.kacheln.get(kachel);
    if (!k) return;
    k.gruppe.removeFromParent();
    for (const m of k.gruppe.children) m.geometry.dispose();
    this.kacheln.delete(kachel);
  }

  // u: Weg des Autos auf dem Umlauf. Legt die Kacheln an ihren Platz in der
  // Welt-Gruppe (x relativ zum Auto) und bestellt, was fehlt.
  aktualisieren(u) {
    this.u = u;
    this.gewuenscht.clear();
    const liste = [];
    for (let kachel = 0; kachel < KACHELN; kachel++) {
      const l = lage(kachel, u);
      if (l + KACHEL < -HINTEN || l > VORN) continue;
      const e = entfernung(l);
      let stufe = e < STUFEN[0] ? 0 : e < STUFEN[1] ? 1 : 2;
      // Nicht hin und her springen: gröber erst ein Stück hinter der Grenze.
      const da = this.kacheln.get(kachel);
      if (da && da.stufe < stufe && e < STUFEN[stufe - 1] + 16) stufe = da.stufe;
      this.gewuenscht.set(kachel, stufe);
      liste.push([e, kachel, stufe]);
    }
    for (const kachel of [...this.kacheln.keys()]) if (!this.gewuenscht.has(kachel)) this.weg(kachel);
    for (const [kachel, k] of this.kacheln) k.gruppe.position.x = lage(kachel, u);
    // Bestellen, die nächsten zuerst.
    liste.sort((a, b) => a[0] - b[0]);
    for (const [, kachel, stufe] of liste) {
      if (this.auftraege.size >= GLEICHZEITIG) break;
      const da = this.kacheln.get(kachel);
      if ((da?.stufe === stufe && da.version === this.version) || this.auftraege.has(kachel)) continue;
      this.auftraege.set(kachel, stufe);
      this.worker.postMessage({ kachel, stufe, sonne: this.sonne, version: this.version });
    }
  }

  // Alles in der Nähe da: Es darf gezeichnet werden.
  get bereit() {
    for (const [kachel] of this.gewuenscht) if (entfernung(lage(kachel, this.u)) < NAH && !this.kacheln.has(kachel)) return false;
    return this.gewuenscht.size > 0;
  }

  // Jede Kachel in ihrer Stufe da (für Standbilder).
  get vollstaendig() {
    for (const [kachel, stufe] of this.gewuenscht) {
      const da = this.kacheln.get(kachel);
      if (da?.stufe !== stufe || da.version !== this.version) return false;
    }
    return this.gewuenscht.size > 0 && this.auftraege.size === 0;
  }
}
