// Hintergrund „Küste“ im Umbau (Stil kueste-neu, nur über ?stil=kueste-neu
// erreichbar). Ziel: eine Straße in einer hellen Kalksteinwand hoch über dem
// Meer, fotografisch beleuchtet; Plan in docs/auftraege/kapsel-kueste-neu.md.
//
// Phase 0, Rohbau: Straße, Brüstung, Felswand und Klippe als einfache Formen,
// Meer, physikalischer Himmel, Sonne aus der Richtung des Plans, die neue
// Kamera hinter dem Auto und dasselbe Auto wie die alte Küste. Schnittstelle
// wie kueste.js: new Kueste(canvas, kontext), groesse(), zeichnen().

import * as THREE from '../../vendor/three-r186.min.js';
import { Auto } from './auto.js';
import { glatt, leinwand } from './helfer.js';

// Welt in Metern: x Fahrtrichtung, y oben, z nach rechts (Bergseite); das
// Meer liegt links (-z), tief unter der Straße.
const SPUR = 1.75; // Mitte der Fahrspur, auf der das Auto fährt
const STRASSE = 4.5; // halbe Breite von Rand zu Rand
const BANKETT = 2.75; // vom Fahrbahnrand bis zum Fuß der Wand
const MAUER_HOCH = 0.8;
const MEER = -75;
const BLICK = -78; // Kamera hinter dem Auto, Grad (0 = genau von der Seite)

// Sonne: Höhe und Richtung in Grad, links (zum Meer) von der Fahrtrichtung.
const STIMMUNGEN = {
  hell: { sonne: [26, 40], licht: 0xfff0dc, staerke: 3.2, belichtung: 0.23, truebung: 2, rayleigh: 3, mie: 0.0025, wolken: 0, scheinwerfer: 0, rueck: 0.35 },
  dunkel: { sonne: [3, 10], licht: 0xff9a55, staerke: 2.4, belichtung: 0.4, truebung: 4, rayleigh: 2.5, mie: 0.005, wolken: 0.3, scheinwerfer: 5, rueck: 4 },
};

// Fahrbahn: weiße Randlinien, gestrichelte Mitte (6 m Strich, 12 m Lücke),
// 18 m lang über die ganze Breite.
function markierung() {
  const w = 1024, h = 64;
  const c = leinwand(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#5f5f61';
  g.fillRect(0, 0, w, h);
  const proM = h / (2 * STRASSE);
  const quer = (z) => (STRASSE - z) * proM;
  g.fillStyle = '#e6e4dc';
  for (const z of [3.65, -3.65]) g.fillRect(0, quer(z) - 0.08 * proM, w, 0.16 * proM);
  g.fillRect(0, quer(0) - 0.06 * proM, (w * 6) / 18, 0.12 * proM);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
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
    r.shadowMap.autoUpdate = false;

    this.szene = new THREE.Scene();
    this.kamera = new THREE.PerspectiveCamera(36, 1, 0.5, 60000);
    this.fahrt = Math.random() * 2048;
    this.tempo = 18; // m/s
    this.zeit = Math.random() * 100;
    this.dunkel = null;
    canvas.addEventListener('webglcontextrestored', () => (this.dunkel = null));
    this.auto = null;
    this.einfahrt = 1;
    this.bildgroesse = [1, 1];
    // Die Landschaft; ab Phase 1 läuft und dreht sie um das stehende Auto.
    this.welt = new THREE.Group();
    this.szene.add(this.welt);

    this.himmelBauen();
    this.rohbau();
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

  // Graue Formen an den Stellen, an denen später Wand, Straße und Mauer stehen.
  rohbau() {
    const laenge = 2400;
    const grau = (farbe, rau = 0.9) => new THREE.MeshStandardMaterial({ color: farbe, roughness: rau });
    const kasten = (b, h, t, x, y, z, material) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b, h, t), material);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      this.welt.add(m);
      return m;
    };

    // Straße mit Markierung; die Markierung läuft mit der Fahrt.
    this.markierung = markierung();
    this.markierung.repeat.set(laenge / 18, 1);
    const strasse = new THREE.Mesh(
      new THREE.PlaneGeometry(laenge, STRASSE * 2),
      new THREE.MeshStandardMaterial({ roughness: 0.92, map: this.markierung }),
    );
    strasse.rotation.x = -Math.PI / 2;
    strasse.receiveShadow = true;
    this.welt.add(strasse);

    // Unterbau mit Klippe bis ins Meer, Bankett und Wand auf der Bergseite,
    // Brüstung auf der Meerseite.
    const fels = grau(0xd9d0bf);
    kasten(laenge, -MEER, STRASSE + 1.2, 0, MEER / 2 - 0.02, -(STRASSE + 1.2) / 2, fels);
    kasten(laenge, 0.1, BANKETT, 0, -0.06, STRASSE + BANKETT / 2, grau(0xa49c8c));
    kasten(laenge, 60, 30, 0, 30 - 0.1, STRASSE + BANKETT + 15, fels);
    kasten(laenge, MAUER_HOCH, 0.45, 0, MAUER_HOCH / 2, -STRASSE - 0.6, grau(0xe6dfd0));

    const meer = new THREE.Mesh(new THREE.PlaneGeometry(60000, 30000), new THREE.MeshStandardMaterial({ color: 0x06305a, roughness: 0.3 }));
    meer.rotation.x = -Math.PI / 2;
    meer.position.set(0, MEER, -15000);
    this.welt.add(meer);
  }

  lichtBauen() {
    const sonne = (this.sonne = new THREE.DirectionalLight(0xffffff, 3));
    sonne.castShadow = true;
    sonne.shadow.mapSize.set(2048, 2048);
    const k = sonne.shadow.camera;
    k.left = -20; k.right = 20; k.top = 20; k.bottom = -20; k.near = 1; k.far = 160;
    sonne.shadow.bias = -0.0004;
    sonne.shadow.normalBias = 0.02;
    sonne.target.position.set(4, 0, SPUR);
    this.szene.add(sonne, sonne.target);
  }

  stimmungSetzen(dunkel) {
    this.dunkel = dunkel;
    const s = (this.stimmung = dunkel ? STIMMUNGEN.dunkel : STIMMUNGEN.hell);
    const [hoehe, links] = s.sonne.map(THREE.MathUtils.degToRad);
    const richtung = new THREE.Vector3(Math.cos(hoehe) * Math.cos(links), Math.sin(hoehe), -Math.cos(hoehe) * Math.sin(links));
    for (const himmel of [this.himmel, this.umgebungHimmel]) {
      const u = himmel.material.uniforms;
      u.turbidity.value = s.truebung;
      u.rayleigh.value = s.rayleigh;
      u.mieCoefficient.value = s.mie;
      u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(richtung);
      u.cloudCoverage.value = s.wolken;
      // Im Umgebungslicht keine Sonnenscheibe, die gäbe nur Glanzpunkte.
      u.showSunDisc.value = himmel === this.himmel ? 1 : 0;
    }
    this.sonne.color.set(s.licht);
    this.sonne.intensity = s.staerke;
    this.sonne.position.copy(richtung).multiplyScalar(80).add(this.sonne.target.position);
    this.renderer.toneMappingExposure = s.belichtung;
    const alt = this.umgebung;
    this.umgebung = this.pmrem.fromScene(this.umgebungSzene, 0, 1, 50000, { size: 256 });
    this.szene.environment = this.umgebung.texture;
    alt?.dispose();
    this.renderer.shadowMap.needsUpdate = true;
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
    this.renderer.shadowMap.needsUpdate = true;
    this.canvas.dataset.auto = 'da';
  }

  groesse(breite, hoehe, skala) {
    this.renderer.setPixelRatio(skala);
    this.renderer.setSize(breite, hoehe, false);
    this.bildgroesse = [breite, hoehe];
  }

  // Kamera schräg hinter dem Auto über der Fahrbahn, Blick die Straße
  // entlang: links das Meer, rechts die Wand. Das Auto steht in der Mitte der
  // freien Fläche (auf dem Mac rechts neben der App), im unteren Teil.
  kameraSetzen(frei, neigung, schwanken) {
    const [W, H] = this.bildgroesse;
    const breite = Math.max(1, W - frei);
    const hoch = glatt(1.0, 0.45, breite / H); // 0 quer, 1 hochkant
    const fov = 36 + 10 * hoch;
    const tanHalb = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    // So weit weg, dass das Auto (von hinten gut 2,6 m breit) diesen Anteil
    // der freien Breite füllt.
    const anteil = 0.28 + 0.27 * hoch;
    const abstand = (2.6 * (H / 2 / tanHalb)) / (anteil * breite);
    const ziel = new THREE.Vector3(3, 0.8, SPUR);
    const drehung = THREE.MathUtils.degToRad(BLICK + neigung[0] * 4 + schwanken[0]);
    const k = this.kamera;
    k.position.set(
      ziel.x + Math.sin(drehung) * abstand,
      2.6 + 0.8 * hoch + neigung[1] * 0.3 + schwanken[1],
      ziel.z + Math.cos(drehung) * abstand,
    );
    k.lookAt(ziel);
    // Den Ausschnitt so legen, dass das Auto selbst (nicht der Zielpunkt vor
    // ihm) in der Mitte der freien Fläche steht, bei 70 % der Höhe; hochkant
    // fiele es sonst links aus dem Bild.
    k.updateMatrixWorld();
    const v = new THREE.Vector3(0, 0.6, SPUR).applyMatrix4(k.matrixWorldInverse);
    const f = H / 2 / tanHalb;
    const cx = frei + breite / 2 - (v.x / -v.z) * f;
    const cy = H * 0.7 + (v.y / -v.z) * f;
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
    this.markierung.offset.x = (this.fahrt % 18) / 18;
    this.himmel.material.uniforms.time.value = this.zeit;

    const t = this.zeit;
    const ruhig = z.ruhe ? 0.2 : 1;
    const schwanken = [
      (Math.sin(t * 0.071) * 1.5 + Math.sin(t * 0.23 + 1) * 0.3) * ruhig,
      (Math.sin(t * 0.37 + 2) * 0.08 + Math.sin(t * 1.3) * 0.015) * ruhig,
    ];
    this.kameraSetzen(z.frei, z.neigung, schwanken);

    if (this.auto) {
      // Einfahrt: das Auto holt die Kamera von hinten ein.
      if (this.einfahrt < 1) this.einfahrt = Math.min(1, this.einfahrt + s / 4.5);
      const e = 1 - (1 - this.einfahrt) ** 3;
      this.auto.gruppe.position.x = -32 * (1 - e);
      if (this.einfahrt < 1) this.renderer.shadowMap.needsUpdate = true;
      this.auto.fahren(s, this.fahrt, this.tempo + (1 - this.einfahrt) * 20);
    }

    this.renderer.render(this.szene, this.kamera);
    if (!this.canvas.classList.contains('bereit')) this.canvas.classList.add('bereit');
    if (z.bild && this.auto) this.canvas.dataset.bild = 'fertig';
  }
}
