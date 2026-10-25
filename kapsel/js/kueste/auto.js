// Das Auto der Küste: Porsche 911 Carrera 4S in Navy, fotografisch. Lädt das
// Modell, stellt Lack und Glas ein, löst jedes Rad heraus, damit es sich um
// die eigene Nabe dreht, und bringt Licht und Federung mit. Alte und neue
// Küste nutzen dasselbe Auto.
//
// Das Modell kommt aus modelle/ (scripts/kapsel-modell.mjs, Lizenz in
// modelle/LIZENZ.md). Es fährt nach +x, die Reifen stehen auf y = 0.

import * as THREE from '../../vendor/three-r186.min.js';
import { glatt, leinwand } from './helfer.js';

const MODELL = 'modelle/porsche-911-navy-1.glb';

// Verwischte Felge für schnelle Fahrt: Nabe, Speichen als grauer Schleier,
// Felgenhorn. Liegt vor den echten Speichen und blendet mit dem Tempo ein.
function felgenTextur() {
  const n = 256, m = n / 2;
  const c = leinwand(n, n);
  const g = c.getContext('2d');
  const v = g.createRadialGradient(m, m, 0, m, m, m);
  v.addColorStop(0, 'rgba(214, 216, 220, 1)');
  v.addColorStop(0.12, 'rgba(176, 178, 182, 0.95)');
  v.addColorStop(0.17, 'rgba(96, 98, 102, 0.55)');
  v.addColorStop(0.45, 'rgba(128, 130, 134, 0.4)');
  v.addColorStop(0.8, 'rgba(150, 152, 156, 0.38)');
  v.addColorStop(0.86, 'rgba(214, 216, 220, 0.96)');
  v.addColorStop(0.95, 'rgba(150, 152, 156, 0.96)');
  v.addColorStop(1, 'rgba(40, 40, 42, 0)');
  g.fillStyle = v;
  g.fillRect(0, 0, n, n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Meshopt speichert Positionen gepackt; zum Umrechnen in Gleitkomma wandeln.
function alsFloat(geo) {
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name];
    const lese = [a.getX, a.getY, a.getZ, a.getW].slice(0, a.itemSize);
    const neu = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) lese.forEach((f, k) => (neu[i * a.itemSize + k] = f.call(a, i)));
    geo.setAttribute(name, new THREE.BufferAttribute(neu, a.itemSize));
  }
  return geo;
}

// Im Modell liegen linkes und rechtes Rad einer Achse in einem Mesh. Gibt
// die Dreiecke einer Seite als eigene Geometrie zurück, in Koordinaten von
// `bezug`.
function radSeite(mesh, bezug, seite, mitteZ) {
  const geo = alsFloat(mesh.geometry.clone());
  geo.applyMatrix4(bezug.matrixWorld.clone().invert().multiply(mesh.matrixWorld));
  const pos = geo.attributes.position;
  const index = geo.index ? geo.index.array : [...Array(pos.count).keys()];
  const neu = new Map();
  const behalten = [];
  for (let i = 0; i < index.length; i += 3) {
    const z = (pos.getZ(index[i]) + pos.getZ(index[i + 1]) + pos.getZ(index[i + 2])) / 3;
    if ((z - mitteZ) * seite <= 0) continue;
    for (let k = 0; k < 3; k++) {
      if (!neu.has(index[i + k])) neu.set(index[i + k], neu.size);
      behalten.push(neu.get(index[i + k]));
    }
  }
  // Nur die Ecken dieser Seite behalten.
  const teil = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(geo.attributes)) {
    const werte = new Float32Array(neu.size * a.itemSize);
    for (const [alt, n] of neu) for (let k = 0; k < a.itemSize; k++) werte[n * a.itemSize + k] = a.array[alt * a.itemSize + k];
    teil.setAttribute(name, new THREE.BufferAttribute(werte, a.itemSize));
  }
  teil.setIndex(behalten);
  return teil;
}

// Mitte und Drehachse eines Reifens: Schwerpunkt der Punkte und die Richtung,
// in der sie am wenigsten streuen (der Reifen ist eine flache Scheibe).
function radAchse(geo) {
  const pos = geo.attributes.position;
  const m = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) m.add(p.fromBufferAttribute(pos, i));
  m.divideScalar(pos.count);
  const c = new Array(9).fill(0);
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).sub(m);
    const d = [p.x, p.y, p.z];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) c[a * 3 + b] += d[a] * d[b];
  }
  const inv = new THREE.Matrix3().set(...c).invert();
  const achse = new THREE.Vector3(0, 0, 1);
  for (let k = 0; k < 40; k++) achse.applyMatrix3(inv).normalize();
  if (achse.z < 0) achse.negate();
  return { mitte: m, achse };
}

export class Auto {
  // Lädt das Modell; null, wenn das nicht klappt.
  static async laden() {
    const lader = new THREE.GLTFLoader();
    lader.setMeshoptDecoder(THREE.MeshoptDecoder);
    let gltf;
    try {
      gltf = await lader.loadAsync(MODELL);
    } catch (fehler) {
      console.warn('Küste: Modell nicht geladen', fehler);
      return null;
    }
    return new Auto(gltf.scene);
  }

  constructor(modell) {
    // Das Modell schaut nach +z; hier fährt es nach +x. Reifen unten auf 0.
    modell.rotation.y = Math.PI / 2;
    modell.position.y = 0.63;
    const auto = (this.gruppe = new THREE.Group());
    auto.add(modell);
    auto.updateMatrixWorld(true);

    this.lampen = [];
    this.rueckLichter = [];
    this.raeder = [];
    this.schleier = [];
    const lack = new THREE.Color('#142850');
    modell.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const m = o.material;
      switch (m.name) {
        case 'paint':
          // Navy mit Klarlack, fotografisch.
          m.color.copy(lack);
          m.metalness = 0.65;
          m.roughness = 0.32;
          m.clearcoat = 1;
          m.clearcoatRoughness = 0.03;
          m.envMapIntensity = 1.3;
          break;
        case 'window':
          m.envMapIntensity = 1.4;
          break;
        case 'glass':
        case 'lights':
          // Ohne Transmission: die bräuchte einen zusätzlichen Durchgang.
          m.transmission = 0;
          m.transparent = true;
          m.opacity = m.name === 'glass' ? 0.35 : 0.5;
          m.roughness = 0.02;
          m.metalness = 0;
          m.depthWrite = false;
          if (m.name === 'lights') {
            m.emissive = new THREE.Color(1, 0.97, 0.92);
            this.lampen.push(m);
          }
          break;
        case 'license':
          // Das hintere Schild steht im Modell auf dem Kopf.
          if (o.name === 'Plane005_0') {
            o.material = m.clone();
            o.material.map = m.map.clone();
            o.material.map.wrapS = o.material.map.wrapT = THREE.RepeatWrapping;
            o.material.map.repeat.set(-1, -1);
            o.material.map.offset.set(1, 1);
            o.material.map.needsUpdate = true;
          }
          break;
        case 'tex_shiny':
          this.rueckLichter.push(m);
          break;
        case 'Material':
          // Eingebackener Kontaktschatten unter dem Auto, unbeleuchtet.
          o.castShadow = false;
          o.material = new THREE.MeshBasicMaterial({
            color: 0x000000, alphaMap: null, map: m.map, transparent: true, opacity: 0.85, depthWrite: false,
            polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
          });
          o.renderOrder = -1;
          break;
      }
    });

    // Räder. Im Modell liegen beide Räder einer Achse in einem Mesh, und die
    // vorderen sind eingeschlagen: um eine gemeinsame Achse gedreht eierten
    // sie. Darum jedes Rad für sich: Seite herauslösen, gerade stellen und
    // um die eigene Nabe drehen. Felge, Reifen und Bremsscheibe drehen sich,
    // die Bremssättel (Material.001) bleiben stehen.
    const schleierTex = felgenTextur();
    for (const name of ['Cylinder000', 'Cylinder001']) {
      const achse = modell.getObjectByName(name);
      if (!achse) continue;
      const teile = achse.children.filter((o) => o.isMesh);
      const reifen = teile.find((o) => o.material.name === 'rubber');
      if (!reifen) continue;
      const mitteZ = new THREE.Box3().setFromObject(reifen).getCenter(new THREE.Vector3()).applyMatrix4(auto.matrixWorld.clone().invert()).z;
      const paar = [];
      for (const seite of [1, -1]) {
        const { mitte, achse: richtung } = radAchse(radSeite(reifen, auto, seite, mitteZ));
        const gerade = new THREE.Quaternion().setFromUnitVectors(richtung, new THREE.Vector3(0, 0, 1));
        const nabe = new THREE.Group();
        const sattel = new THREE.Group();
        nabe.position.copy(mitte);
        sattel.position.copy(mitte);
        auto.add(nabe, sattel);
        let felgeAussen = 0, felgeRadius = 0, radius = 0;
        for (const t of teile) {
          const geo = radSeite(t, auto, seite, mitteZ);
          geo.translate(-mitte.x, -mitte.y, -mitte.z);
          geo.applyQuaternion(gerade);
          geo.computeBoundingBox();
          const b = geo.boundingBox;
          if (t.material.name === 'silver') {
            felgeAussen = seite > 0 ? b.max.z : b.min.z;
            felgeRadius = (b.max.y - b.min.y) / 2;
          }
          if (t === reifen) radius = (b.max.y - b.min.y) / 2;
          const teil = new THREE.Mesh(geo, t.material);
          teil.castShadow = true;
          (t.material.name === 'Material.001' ? sattel : nabe).add(teil);
        }
        // Gerade gestellt sitzt der Reifen auf der Straße auf.
        nabe.position.y = sattel.position.y = radius;
        paar.push(nabe, sattel);
        // Auf der Kameraseite: verwischte Felge vor den Speichen.
        if (seite > 0 && felgeRadius) {
          const schleier = new THREE.Mesh(
            new THREE.CircleGeometry(felgeRadius, 48),
            new THREE.MeshStandardMaterial({ map: schleierTex, transparent: true, metalness: 0.75, roughness: 0.3, depthWrite: false, opacity: 0 }),
          );
          schleier.position.z = felgeAussen + 0.004;
          nabe.add(schleier);
          this.schleier.push(schleier.material);
        }
        this.raeder.push({ nabe, radius, winkel: 0 });
      }
      // Eingeschlagen saßen die Naben der Vorderräder ein paar Zentimeter
      // versetzt; gerade stehen beide auf einer Achse.
      const x = paar.reduce((s, o) => s + o.position.x, 0) / paar.length;
      for (const o of paar) o.position.x = x;
      achse.removeFromParent();
    }

    // Abblendlicht auf der Straße vor dem Auto (nur im Dunkeln an).
    const kegel = (this.kegel = new THREE.SpotLight(0xfff1dc, 0, 60, 0.5, 1, 1.2));
    kegel.position.set(1.9, 0.62, 0);
    kegel.target.position.set(14, 0, 0.3);
    auto.add(kegel, kegel.target);
  }

  // Scheinwerfer und Rücklichter, als Leuchtkraft der Materialien.
  lichter(scheinwerfer, rueck) {
    for (const m of this.lampen) m.emissiveIntensity = scheinwerfer;
    for (const m of this.rueckLichter) m.emissiveIntensity = rueck;
    this.kegel.intensity = scheinwerfer * 5;
  }

  // s: Sekunden seit dem letzten Bild, fahrt: gefahrene Meter, v: m/s.
  fahren(s, fahrt, v) {
    // Federung: kleine Unebenheiten der Straße.
    this.gruppe.position.y = Math.sin(fahrt * 0.9) * 0.004 + Math.sin(fahrt * 2.3 + 1) * 0.0025;
    this.gruppe.rotation.z = Math.sin(fahrt * 0.6 + 0.5) * 0.0018;
    for (const rad of this.raeder) {
      // Echt drehten die Speichen pro Bild weiter als ihr Abstand und
      // stünden still oder liefen rückwärts. Höchstens 0,17 rad pro Bild
      // sieht dagegen aus wie ein Rad, das sich schnell vorwärts dreht;
      // den Rest erzählt die verwischte Felge.
      rad.winkel = (rad.winkel - Math.min((v / rad.radius) * s, 0.17)) % (Math.PI * 2);
      rad.nabe.rotation.z = rad.winkel;
    }
    const schleier = glatt(6, 22, v) * 0.7;
    for (const m of this.schleier) m.opacity = schleier;
  }
}
