// Hintergrund „Küste“ im Umbau (Stil kueste-neu, nur über ?stil=kueste-neu
// erreichbar). Ziel: eine Straße in einer hellen Kalksteinwand hoch über dem
// Meer, fotografisch beleuchtet; Plan in docs/auftraege/kapsel-kueste-neu.md.
//
// Stand Phase 1: Die Strecke (strecke.js) läuft als Umlauf von 2 km mit
// Kurven und acht Abschnitten; Straße, Felswand, Klippe und Brüstung kommen
// als graue Rohformen in Kacheln aus einem Worker (kacheln.js). Das Auto
// steht, die Welt läuft und dreht sich so, dass die Straße unter ihm entlang
// x zeigt. Die Kamera (kamera.js) steht schräg hinter dem Auto über der
// Fahrbahn: links das Meer, rechts die Wand. Schnittstelle wie kueste.js:
// new Kueste(canvas, kontext), groesse(), zeichnen().

import * as THREE from '../../vendor/three-r186.min.js';
import { Auto } from './auto.js';
import { leinwand } from './helfer.js';
import { Kacheln } from './kacheln.js';
import { kameraWerte } from './kamera.js';
import { MEER, SPUR, STRASSE, luftZurWand, quer, richtung, umlauf } from './strecke.js';

// Sonne: Höhe und Richtung in Grad, links (zum Meer) von der Fahrtrichtung.
// Dunst: Dichte und Farbe des vorläufigen Nebels (Phase 2 rechnet ihn aus dem
// Himmel).
const STIMMUNGEN = {
  hell: {
    sonne: [26, 40], licht: 0xfff0dc, staerke: 3.2, belichtung: 0.23, truebung: 2, rayleigh: 3, mie: 0.0025, wolken: 0,
    dunst: [0.0009, 0xdfe8ee], scheinwerfer: 0, rueck: 0.35,
  },
  dunkel: {
    sonne: [3, 10], licht: 0xff9a55, staerke: 2.4, belichtung: 0.4, truebung: 4, rayleigh: 2.5, mie: 0.005, wolken: 0.3,
    dunst: [0.0009, 0x8a6a62], scheinwerfer: 5, rueck: 4,
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
    this.szene.fog = new THREE.FogExp2(0xffffff, 0.001);
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
  }

  // Graue Rohformen in Kacheln, darunter das Meer.
  weltBauen() {
    const grau = (farbe, rau = 0.9) => new THREE.MeshStandardMaterial({ color: farbe, roughness: rau });
    const fels = grau(0xd9d0bf);
    this.kacheln = new Kacheln(this.welt, {
      strasse: new THREE.MeshStandardMaterial({ roughness: 0.92, map: markierung() }),
      rand: grau(0xa49c8c),
      kante: grau(0xb8ae9a),
      fels,
      klippe: fels,
      bruestung: grau(0xe6dfd0),
    });
    // Ohne den vorläufigen Nebel, sonst verschwände das Meer von der Straße
    // aus ganz im Dunst.
    const meer = new THREE.Mesh(new THREE.PlaneGeometry(60000, 30000), new THREE.MeshStandardMaterial({ color: 0x06305a, roughness: 0.3, fog: false }));
    meer.rotation.x = -Math.PI / 2;
    meer.position.set(0, MEER, -15000 + 2000);
    this.szene.add(meer);
  }

  lichtBauen() {
    const sonne = (this.sonne = new THREE.DirectionalLight(0xffffff, 3));
    sonne.castShadow = true;
    sonne.shadow.mapSize.set(2048, 2048);
    const k = sonne.shadow.camera;
    k.left = -24; k.right = 24; k.top = 24; k.bottom = -24; k.near = 1; k.far = 220;
    sonne.shadow.bias = -0.0004;
    sonne.shadow.normalBias = 0.03;
    sonne.target.position.set(8, 0, SPUR);
    this.szene.add(sonne, sonne.target);
  }

  stimmungSetzen(dunkel) {
    this.dunkel = dunkel;
    const s = (this.stimmung = dunkel ? STIMMUNGEN.dunkel : STIMMUNGEN.hell);
    const [hoehe, links] = s.sonne.map(THREE.MathUtils.degToRad);
    const richtungSonne = new THREE.Vector3(Math.cos(hoehe) * Math.cos(links), Math.sin(hoehe), -Math.cos(hoehe) * Math.sin(links));
    for (const himmel of [this.himmel, this.umgebungHimmel]) {
      const u = himmel.material.uniforms;
      u.turbidity.value = s.truebung;
      u.rayleigh.value = s.rayleigh;
      u.mieCoefficient.value = s.mie;
      u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(richtungSonne);
      u.cloudCoverage.value = s.wolken;
      // Im Umgebungslicht keine Sonnenscheibe, die gäbe nur Glanzpunkte.
      u.showSunDisc.value = himmel === this.himmel ? 1 : 0;
    }
    this.szene.fog.density = s.dunst[0];
    this.szene.fog.color.set(s.dunst[1]);
    this.sonne.color.set(s.licht);
    this.sonne.intensity = s.staerke;
    this.sonne.position.copy(richtungSonne).multiplyScalar(120).add(this.sonne.target.position);
    this.renderer.toneMappingExposure = s.belichtung;
    const alt = this.umgebung;
    this.umgebung = this.pmrem.fromScene(this.umgebungSzene, 0, 1, 50000, { size: 256 });
    this.szene.environment = this.umgebung.texture;
    alt?.dispose();
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
    this.renderer.render(this.szene, this.kamera);
    if (!this.canvas.classList.contains('bereit')) this.canvas.classList.add('bereit');
    if (z.bild && this.auto && this.kacheln.vollstaendig) this.canvas.dataset.bild = 'fertig';
  }
}
