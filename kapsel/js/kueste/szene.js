// Hintergrund „Küste“ im Umbau (Stil kueste-neu, nur über ?stil=kueste-neu
// erreichbar). Ziel: eine Straße in einer hellen Kalksteinwand hoch über dem
// Meer, fotografisch beleuchtet; Plan in docs/auftraege/kapsel-kueste-neu.md.
//
// Die Strecke (strecke.js) läuft als Umlauf von 2 km mit Kurven und acht
// Abschnitten; Straße, Felswand, Klippe und Brüstung kommen als Kacheln aus
// einem Worker (kacheln.js), noch als graue Rohformen. Das Auto steht, die
// Welt läuft und dreht sich so, dass die Straße unter ihm entlang x zeigt.
// Die Kamera (kamera.js) steht schräg hinter dem Auto über der Fahrbahn:
// links das Meer, rechts die Wand.
//
// Licht (Phase 2): Die Sonne steht fest zur Landschaft und dreht darum mit
// der Welt, ebenso Himmel und Umgebungslicht; in Kurven wandert das Licht
// über das Auto. Nah am Auto wirft die Schattenkarte (jedes Bild neu) die
// Schatten, weiter weg sind Sonne und Himmelslicht in die Kacheln
// eingebacken. Dunst nimmt die Farbe des Himmels an (material.js), am Ende
// kommen Bloom und Farbgebung (bild.js).
//
// Schnittstelle wie kueste.js: new Kueste(canvas, kontext), groesse(),
// zeichnen().

import * as THREE from '../../vendor/three-r186.min.js';
import { Auto } from './auto.js';
import { Bild } from './bild.js';
import { glatt, leinwand, rauschen } from './helfer.js';
import { Kacheln } from './kacheln.js';
import { kameraWerte } from './kamera.js';
import { DUNST, KALK, mitLicht } from './material.js';
import { MEER, SPUR, STRASSE, luftZurWand, quer, richtung, umlauf } from './strecke.js';
import { kalkTexturen } from './texturen.js';

// Sonne: Höhe und Richtung in Grad, links (zum Meer) von der mittleren
// Fahrtrichtung der Strecke. Dunst: 1 / Meter, bei denen gut 60 % der Farbe
// im Himmel aufgegangen sind.
const STIMMUNGEN = {
  hell: {
    sonne: [26, 40], licht: 0xffe8cc, staerke: 3.2, belichtung: 0.23, truebung: 2, rayleigh: 1.3, mie: 0.0025, wolken: 0,
    dunst: 1 / 9000, scheinwerfer: 0, rueck: 0.35,
  },
  dunkel: {
    sonne: [3, 10], licht: 0xff9a55, staerke: 2.4, belichtung: 0.52, truebung: 4, rayleigh: 2.5, mie: 0.005, wolken: 0.3,
    dunst: 1 / 6000, scheinwerfer: 5, rueck: 4,
  },
};

// Fahrbahn: weiße Randlinien, gestrichelte Mitte; die Textur deckt einen
// Strich und eine Lücke (gut 18 m) über die ganze Breite.
function markierung() {
  const w = 1024, h = 64;
  const c = leinwand(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#5f5f61';
  g.fillRect(0, 0, w, h);
  const proM = h / (2 * STRASSE);
  const zeile = (q) => (q + STRASSE) * proM;
  g.fillStyle = '#e6e4dc';
  for (const q of [3.65, -3.65]) g.fillRect(0, zeile(q) - 0.08 * proM, w, 0.16 * proM);
  g.fillRect(0, zeile(0) - 0.06 * proM, w / 3, 0.12 * proM);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.flipY = false;
  return t;
}

// Busch: eine verbeulte Kugel, unten flach. Die Normalen bleiben die der
// Kugel (etwas nach oben geneigt), so wirkt er weich wie Laub; innen und
// unten dunkler, wie Laub, das sich selbst beschattet.
function buschGeometrie() {
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const p = geo.attributes.position, n = geo.attributes.normal;
  const farben = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.72 + 0.5 * rauschen(x * 2.4 + 5, z * 2.4 + y * 1.8, 1 << 20, 3) + 0.15 * rauschen(x * 7, z * 7 + y * 6, 1 << 20, 4);
    p.setXYZ(i, x * k, Math.max(-0.25, y * k) + 0.25, z * k);
    n.setXYZ(i, x, y + 0.35, z);
    const hell = (0.45 + 0.55 * glatt(-0.6, 0.9, y)) * (0.8 + 0.2 * rauschen(x * 4 + 1, z * 4 + y * 3, 1 << 20, 6));
    farben.push(hell, hell, hell);
  }
  geo.normalizeNormals();
  geo.setAttribute('color', new THREE.Float32BufferAttribute(farben, 3));
  return geo;
}

export class Kueste {
  constructor(canvas, kontext) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, context: kontext, antialias: true, powerPreference: 'high-performance' }));
    // AgX nahm dem Himmel im Rohbau zu viel Farbe; die Farbgebung kommt in
    // Phase 2 mit einem eigenen Bild-Durchgang.
    r.toneMapping = THREE.NeutralToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    // Die Welt läuft unter dem Auto durch: Schatten jedes Bild neu.
    r.shadowMap.autoUpdate = true;

    this.szene = new THREE.Scene();
    this.bild = new Bild(r);
    this.sonneWelt = new THREE.Vector3(0, 1, 0); // Koordinaten der Strecke
    this.kamera = new THREE.PerspectiveCamera(36, 1, 0.5, 60000);
    this.fahrt = Math.random() * 2048;
    this.tempo = 18; // m/s
    this.zeit = Math.random() * 100;
    this.schwenk = 0; // Blick in die Kurve, Radiant
    this.dunkel = null;
    canvas.addEventListener('webglcontextrestored', () => (this.dunkel = null));
    this.auto = null;
    this.einfahrt = 1;
    this.bildgroesse = [1, 1];
    // Die Landschaft: läuft und dreht sich um das stehende Auto.
    this.welt = new THREE.Group();
    this.szene.add(this.welt);

    this.himmelBauen();
    this.weltBauen();
    this.lichtBauen();
    this.autoLaden();
  }

  // Physikalischer Himmel; derselbe Himmel liefert das Umgebungslicht.
  himmelBauen() {
    this.himmel = new THREE.Sky();
    this.himmel.scale.setScalar(45000);
    this.szene.add(this.himmel);
    this.umgebungSzene = new THREE.Scene();
    this.umgebungHimmel = new THREE.Sky();
    this.umgebungHimmel.scale.setScalar(45000);
    this.umgebungSzene.add(this.umgebungHimmel);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    // Himmel als Würfel für den Dunst, in Koordinaten der Strecke.
    this.himmelWuerfel = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
    this.wuerfelKamera = new THREE.CubeCamera(1, 50000, this.himmelWuerfel);
    DUNST.uHimmel.value = this.himmelWuerfel.texture;
  }

  // Graue Rohformen in Kacheln, darunter das Meer.
  weltBauen() {
    const grau = (farbe, name, rau = 0.9) => mitLicht(new THREE.MeshStandardMaterial({ color: farbe, roughness: rau }), { name });
    // Kalkstein: Farbe kommt aus der Textur (texturen.js); die Grundfarbe
    // dämpft sie, damit die Wand in der Sonne nicht überstrahlt.
    const kalk = kalkTexturen(this.renderer);
    KALK.tKalkFarbe.value = kalk.farbe;
    KALK.tKalkNormal.value = kalk.normal;
    const fels = mitLicht(new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 1 }), { name: 'fels', fels: true });
    const netz = mitLicht(
      new THREE.MeshStandardMaterial({ color: 0x6c7074, metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide, alphaToCoverage: true }),
      { name: 'netz', netz: true },
    );
    const busch = {
      geometrie: buschGeometrie(),
      material: mitLicht(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { gebacken: false, name: 'busch', busch: true }),
      // Dunkles Macchia-Grün bis trockenes Olivgrün.
      farben: [new THREE.Color(0x1f3a16), new THREE.Color(0x5b6a2c)],
    };
    this.kacheln = new Kacheln(this.welt, {
      strasse: mitLicht(new THREE.MeshStandardMaterial({ roughness: 0.92, map: markierung() }), { name: 'strasse' }),
      rand: grau(0x9a9282, 'rand'),
      kante: grau(0xaaa08c, 'kante'),
      fels,
      klippe: fels,
      bruestung: grau(0xd6cfc0, 'bruestung'),
      netz,
    }, busch);
    const meer = new THREE.Mesh(
      new THREE.PlaneGeometry(60000, 30000),
      mitLicht(new THREE.MeshStandardMaterial({ color: 0x06305a, roughness: 0.3 }), { gebacken: false, name: 'meer' }),
    );
    meer.rotation.x = -Math.PI / 2;
    meer.position.set(0, MEER, -15000 + 2000);
    this.szene.add(meer);
  }

  lichtBauen() {
    const sonne = (this.sonne = new THREE.DirectionalLight(0xffffff, 3));
    sonne.castShadow = true;
    sonne.shadow.mapSize.set(2048, 2048);
    const k = sonne.shadow.camera;
    // Gut 40 m um das Auto, nach vorn versetzt; weiter weg ist der Schatten
    // eingebacken (material.js blendet ab 30 m über).
    k.left = -40; k.right = 40; k.top = 40; k.bottom = -40; k.near = 1; k.far = 300;
    sonne.shadow.bias = -0.0004;
    sonne.shadow.normalBias = 0.04;
    sonne.target.position.set(12, 0, SPUR);
    this.szene.add(sonne, sonne.target);
  }

  stimmungSetzen(dunkel) {
    this.dunkel = dunkel;
    const s = (this.stimmung = dunkel ? STIMMUNGEN.dunkel : STIMMUNGEN.hell);
    const [hoehe, links] = s.sonne.map(THREE.MathUtils.degToRad);
    this.sonneWelt.set(Math.cos(hoehe) * Math.cos(links), Math.sin(hoehe), -Math.cos(hoehe) * Math.sin(links));
    for (const himmel of [this.himmel, this.umgebungHimmel]) {
      const u = himmel.material.uniforms;
      u.turbidity.value = s.truebung;
      u.rayleigh.value = s.rayleigh;
      u.mieCoefficient.value = s.mie;
      u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(this.sonneWelt);
      u.cloudCoverage.value = s.wolken;
      // Im Umgebungslicht keine Sonnenscheibe, die gäbe nur Glanzpunkte.
      u.showSunDisc.value = himmel === this.himmel ? 1 : 0;
    }
    this.sonne.color.set(s.licht);
    this.sonne.intensity = s.staerke;
    this.renderer.toneMappingExposure = s.belichtung;
    DUNST.uDunst.value = s.dunst;
    // Umgebungslicht und Dunst-Würfel in Koordinaten der Strecke; beim
    // Zeichnen drehen sie mit der Welt (sonneDrehen).
    this.wuerfelKamera.update(this.renderer, this.umgebungSzene);
    const alt = this.umgebung;
    this.umgebung = this.pmrem.fromScene(this.umgebungSzene, 0, 1, 50000, { size: 256 });
    this.szene.environment = this.umgebung.texture;
    alt?.dispose();
    this.kacheln.sonneSetzen(this.sonneWelt.toArray());
    this.autoLichter();
  }

  autoLichter() {
    if (this.auto && this.stimmung) this.auto.lichter(this.stimmung.scheinwerfer, this.stimmung.rueck);
  }

  async autoLaden() {
    const auto = await Auto.laden();
    if (!auto) return;
    auto.gruppe.position.z = SPUR;
    this.auto = auto;
    this.szene.add(auto.gruppe);
    this.einfahrt = 0;
    this.autoLichter();
    this.canvas.dataset.auto = 'da';
  }

  groesse(breite, hoehe, skala) {
    this.renderer.setPixelRatio(skala);
    this.renderer.setSize(breite, hoehe, false);
    this.bildgroesse = [breite, hoehe];
    this.bild.groesse();
  }

  // Die Sonne steht fest zur Landschaft: Sie dreht mit der Welt (winkel),
  // ebenso Himmel, Umgebungslicht und der Würfel für den Dunst.
  sonneDrehen(winkel) {
    const r = this.sonneWelt.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), winkel);
    this.himmel.material.uniforms.sunPosition.value.copy(r);
    this.sonne.position.copy(r).multiplyScalar(150).add(this.sonne.target.position);
    this.szene.environmentRotation.y = winkel;
    DUNST.uDrehung.value = winkel;
  }

  // Die Welt so drehen und schieben, dass die Straße bei u unter dem Auto
  // entlang x zeigt und die Spur unter den Rädern liegt. Die Kacheln liegen
  // mit x relativ zu u in der Welt-Gruppe.
  weltSetzen(u) {
    const winkel = richtung(u);
    const [x, z] = quer(u, SPUR);
    this.welt.rotation.y = winkel;
    this.welt.position.set(0, 0, SPUR).sub(new THREE.Vector3(x - u, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), winkel));
  }

  // Kamera schräg hinter dem Auto über der Fahrbahn, Blick die Straße
  // entlang. Das Auto steht in der freien Fläche (auf dem Mac rechts neben
  // der App) bei autoX, autoY; die Höhe ergibt sich daraus, wo der Horizont
  // stehen soll. Nie im Fels: Wird die Luft zur Wand knapp, rückt sie näher.
  kameraSetzen(u, frei, neigung, schwanken) {
    const [W, H] = this.bildgroesse;
    const breite = Math.max(1, W - frei);
    const w = kameraWerte(breite / H);
    const tanHalb = Math.tan(THREE.MathUtils.degToRad(w.fov / 2));
    const f = H / 2 / tanHalb;
    // So weit weg, dass das Auto (von hinten gut 2,6 m breit) seinen Anteil
    // der freien Breite füllt.
    let abstand = Math.min(w.abstandMax, (2.6 * f) / (w.anteil * breite));
    const schwenk = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(this.schwenk) * 0.35, -w.schwenk, w.schwenk);
    const drehung = THREE.MathUtils.degToRad(w.blick - schwenk + neigung[0] * 3 + schwanken[0]);
    const ziel = new THREE.Vector3(w.ziel, 0.8, SPUR);
    const k = this.kamera;
    for (let versuch = 0; versuch < 8; versuch++) {
      const x = ziel.x + Math.sin(drehung) * abstand, z = ziel.z + Math.cos(drehung) * abstand;
      const weite = Math.hypot(x, z - SPUR);
      const hoehe = Math.min(w.hoeheMax, Math.max(2.2, 0.6 + weite * (w.autoY - w.horizontY) * 2 * tanHalb));
      k.position.set(x, hoehe + neigung[1] * 0.25 + schwanken[1], z);
      if (luftZurWand(u, x, k.position.y, z) >= 0.8) break;
      abstand *= 0.9;
    }
    k.lookAt(ziel);
    // Den Ausschnitt so legen, dass das Auto selbst (nicht der Zielpunkt vor
    // ihm) an seinem Platz in der freien Fläche steht.
    k.updateMatrixWorld();
    const v = new THREE.Vector3(0, 0.6, SPUR).applyMatrix4(k.matrixWorldInverse);
    const cx = frei + breite * w.autoX - (v.x / -v.z) * f;
    const cy = H * w.autoY + (v.y / -v.z) * f;
    const fw = 2 * Math.max(cx, W - cx);
    const fh = 2 * Math.max(cy, H - cy);
    k.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalb * (fh / H)));
    k.aspect = fw / fh;
    k.setViewOffset(fw, fh, fw / 2 - cx, fh / 2 - cy, W, H);
    k.updateProjectionMatrix();
  }

  // s: Sekunden seit dem letzten Bild; z: { tempo, neigung, dunkel, frei, ruhe, bild }
  zeichnen(s, z) {
    if (this.dunkel !== z.dunkel) this.stimmungSetzen(z.dunkel);
    this.zeit += s;
    const zielTempo = 9 + 21 * z.tempo;
    this.tempo += (zielTempo - this.tempo) * (1 - Math.exp(-s * 0.6));
    this.fahrt += this.tempo * s;
    // Standbild für Screenshots: Fahrt und Zeit stehen fest, das Auto ist da.
    if (z.bild) {
      this.fahrt = z.bild.weg;
      this.zeit = z.bild.zeit;
      this.einfahrt = 1;
    }
    const u = umlauf(this.fahrt);
    this.weltSetzen(u);
    this.sonneDrehen(richtung(u));
    this.kacheln.aktualisieren(u);
    this.himmel.material.uniforms.time.value = this.zeit;

    // In Kurven schaut die Kamera ein Stück mit hinein: Richtung der Straße
    // 40 m voraus gegenüber hier, weich nachgeführt.
    const kurve = richtung(u + 40) - richtung(u);
    this.schwenk = z.bild ? kurve : this.schwenk + (kurve - this.schwenk) * (1 - Math.exp(-s * 1.5));
    const t = this.zeit;
    const ruhig = z.ruhe ? 0.2 : 1;
    const schwanken = [
      (Math.sin(t * 0.071) * 1.2 + Math.sin(t * 0.23 + 1) * 0.3) * ruhig,
      (Math.sin(t * 0.37 + 2) * 0.08 + Math.sin(t * 1.3) * 0.015) * ruhig,
    ];
    this.kameraSetzen(u, z.frei, z.neigung, schwanken);

    if (this.auto) {
      // Einfahrt: das Auto holt die Kamera von hinten ein.
      if (this.einfahrt < 1) this.einfahrt = Math.min(1, this.einfahrt + s / 4.5);
      const e = 1 - (1 - this.einfahrt) ** 3;
      this.auto.gruppe.position.x = -32 * (1 - e);
      this.auto.fahren(s, this.fahrt, this.tempo + (1 - this.einfahrt) * 20);
    }

    // Erst zeichnen, wenn die Kacheln in der Nähe da sind.
    if (!this.kacheln.bereit) return;
    this.bild.zeichnen(this.szene, this.kamera, this.zeit);
    if (!this.canvas.classList.contains('bereit')) this.canvas.classList.add('bereit');
    if (z.bild && this.auto && this.kacheln.vollstaendig) this.canvas.dataset.bild = 'fertig';
  }
}
