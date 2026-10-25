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
  // materialien: je Teil (strasse, rand, kante, fels, klippe, bruestung,
  // netz) eines. busch: { geometrie, material, farben } für den Bewuchs.
  constructor(welt, materialien, busch) {
    this.welt = welt;
    this.materialien = materialien;
    this.busch = busch;
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

  fertig({ kachel, stufe, version, teile, bewuchs }) {
    this.auftraege.delete(kachel);
    // Inzwischen nicht mehr gebraucht oder schon in dieser Stufe da.
    if (!this.gewuenscht.has(kachel)) return;
    const gruppe = new THREE.Group();
    for (const [name, t] of Object.entries(teile)) {
      const geo = new THREE.BufferGeometry();
      for (const [attribut, werte] of Object.entries(t)) {
        if (attribut === 'index') geo.setIndex(new THREE.BufferAttribute(werte, 1));
        else geo.setAttribute(attribut, new THREE.BufferAttribute(werte, ['position', 'normal', 'ort'].includes(attribut) ? 3 : 2));
      }
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.materialien[name]);
      // Die Schattenkarte kennt keine Maschen: Das Netz würfe eine Fläche.
      mesh.castShadow = name !== 'netz';
      mesh.receiveShadow = true;
      gruppe.add(mesh);
    }
    if (bewuchs.length) gruppe.add(this.bewuchsBauen(bewuchs));
    this.weg(kachel);
    this.kacheln.set(kachel, { gruppe, stufe, version });
    this.welt.add(gruppe);
    if (this.u !== undefined) gruppe.position.x = lage(kachel, this.u);
  }

  // Büsche einer Kachel als ein InstancedMesh (Geometrie und Material
  // geteilt). liste: je 6 Werte x, y, z, Größe, Drehung, Farbe.
  bewuchsBauen(liste) {
    const n = liste.length / 6;
    const { geometrie, material, farben } = this.busch;
    const im = new THREE.InstancedMesh(geometrie, material, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(), oben = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const [x, y, z, g, w, f] = liste.subarray(i * 6, i * 6 + 6);
      q.setFromAxisAngle(oben, w);
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(g * (1 + 0.3 * f), g * (0.75 + 0.3 * (1 - f)), g));
      im.setMatrixAt(i, m);
      im.setColorAt(i, c.copy(farben[0]).lerp(farben[1], f));
    }
    im.computeBoundingSphere();
    im.castShadow = im.receiveShadow = true;
    im.userData.geteilt = true;
    return im;
  }

  weg(kachel) {
    const k = this.kacheln.get(kachel);
    if (!k) return;
    k.gruppe.removeFromParent();
    for (const m of k.gruppe.children) {
      if (m.userData.geteilt) m.dispose();
      else m.geometry.dispose();
    }
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
