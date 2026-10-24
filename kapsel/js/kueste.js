// Hintergrund „Küste“: ein Porsche 911 Carrera 4S in Navy fährt eine
// Küstenstraße entlang. Die Kamera fährt seitlich mit und schaut mit langer
// Brennweite über das Auto hinweg aufs Meer; dahinter Landzungen und Inseln
// im Dunst. Hell ist Nachmittag, im Dunkeln geht die Sonne unter und am Auto
// brennt Licht.
//
// Das Auto steht, die Welt läuft: Straße, Leitplanke, Hang und Büsche liegen
// in einer Gruppe, die sich um die gefahrene Strecke verschiebt und sich alle
// PERIODE Meter wiederholt; das Meer verschiebt seine Wellen im Shader, ferne
// Küsten wandern langsam durchs Bild. Wie schnell gefahren wird, hängt am
// Session-Status.
//
// three.js liegt gebündelt in vendor/ (scripts/kapsel-three.mjs), das Modell
// in modelle/ (scripts/kapsel-modell.mjs, Lizenz in modelle/LIZENZ.md).

import * as THREE from '../vendor/three-r186.min.js';

const MODELL = 'modelle/porsche-911-navy-1.glb';

// Welt in Metern: x Fahrtrichtung, y oben, z zur Kamera (Landseite);
// das Meer liegt bei -z.
const SPUR = 1.75; // Mitte der Fahrspur, auf der das Auto fährt
const STRASSE = 4.5; // halbe Breite von Rand zu Rand
const MEER = -14; // Meeresspiegel unter der Straße
const PERIODE = 144; // Wiederholung der nahen Welt; Vielfaches aller Muster
const WELLEN_L = 4096; // Wiederholung des Wellenmusters in x

// Licht je Stimmung. Sonne: Höhe und Richtung in Grad (0 = Blick der Kamera
// aufs Meer, positiv nach rechts).
const STIMMUNGEN = {
  hell: {
    sonne: [34, 125], trueb: 1.8, rayleigh: 1.6, mie: 0.003, mieG: 0.8, wolken: 0.3,
    belichtung: 0.5, licht: [1.0, 0.94, 0.86], lichtStaerke: 3.4, umgebung: 1.0, scheinwerfer: 0.0, rueck: 0.35, aufheller: 0, meerSpiegel: [0.42, 0.6, 0.88], dunst: 1 / 16000,
  },
  dunkel: {
    sonne: [-1.2, 14], trueb: 4, rayleigh: 2.2, mie: 0.006, mieG: 0.88, wolken: 0.34,
    belichtung: 0.9, licht: [1.0, 0.45, 0.25], lichtStaerke: 0, umgebung: 0.8, scheinwerfer: 6.0, rueck: 4.0, aufheller: 0.6, meerSpiegel: [1, 1, 1], dunst: 1 / 7000,
  },
};

// ---------- kleine Helfer ----------

function zufall(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Wertrauschen, in x periodisch mit `px` Gitterzellen.
function rauschen(x, z, px = 1 << 20, seed = 1) {
  const h = (i, j) => {
    i = ((i % px) + px) % px;
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x, z, px, seed, oktaven = 4) {
  let s = 0, amp = 0.5;
  for (let i = 0; i < oktaven; i++) {
    s += amp * rauschen(x, z, px, seed + i * 17);
    x *= 2; z *= 2; px *= 2; amp *= 0.5;
  }
  return s;
}

const glatt = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function leinwand(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Asphalt mit Randlinien und Mittelleitlinie (6 m Strich, 12 m Lücke). Die
// Textur deckt 18 m Länge und die ganze Straßenbreite ab; das Korn ist in
// Fahrtrichtung verwischt, das sieht in Bewegung ruhiger aus.
function strassenTextur(renderer) {
  const w = 2048, h = 256;
  const c = leinwand(w, h);
  const g = c.getContext('2d');
  const bild = g.createImageData(w, h);
  const r = zufall(7);
  const zeile = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) zeile[x] = r();
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -4; k <= 4; k++) s += zeile[(x + k + w) % w];
      const flecken = rauschen(x / 90, y / 22, w / 90, 3);
      const v = 58 + (s / 9 - 0.5) * 70 + (flecken - 0.5) * 16;
      // Dunklere Fahrspuren der Reifen.
      const quer = y / h;
      const spur = Math.exp(-(((quer - 0.22) / 0.05) ** 2)) + Math.exp(-(((quer - 0.38) / 0.05) ** 2))
        + Math.exp(-(((quer - 0.62) / 0.05) ** 2)) + Math.exp(-(((quer - 0.78) / 0.05) ** 2));
      const i = (y * w + x) * 4;
      const grau = v - spur * 7;
      bild.data[i] = grau;
      bild.data[i + 1] = grau;
      bild.data[i + 2] = grau + 2;
      bild.data[i + 3] = 255;
    }
  }
  g.putImageData(bild, 0, 0);
  const proM = h / (2 * STRASSE);
  const quer = (z) => (STRASSE - z) * proM; // z in Metern -> Bildzeile
  g.fillStyle = 'rgba(236, 234, 226, 0.92)';
  for (const z of [3.65, -3.65]) g.fillRect(0, quer(z) - 0.08 * proM, w, 0.16 * proM);
  g.fillRect(0, quer(0) - 0.06 * proM, (w * 6) / 18, 0.12 * proM);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// Trockener Boden mit Gras für die Landseite, 12 m × 12 m, kachelbar.
function bodenTextur(renderer) {
  const n = 512;
  const c = leinwand(n, n);
  const g = c.getContext('2d');
  const bild = g.createImageData(n, n);
  const r = zufall(11);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const gross = fbm(x / 64, y / 64, 8, 5, 3);
      const halme = rauschen(x / 1.5, y / 12, n / 1.5, 8);
      const fein = r() * 0.6 + halme * 0.4;
      const gruen = glatt(0.35, 0.7, gross) * 0.6;
      const i = (y * n + x) * 4;
      bild.data[i] = 112 - gruen * 52 + (fein - 0.5) * 30;
      bild.data[i + 1] = 98 - gruen * 22 + (fein - 0.5) * 28;
      bild.data[i + 2] = 64 - gruen * 26 + (fein - 0.5) * 20;
      bild.data[i + 3] = 255;
    }
  }
  g.putImageData(bild, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// ---------- Shader-Erweiterungen ----------

// Dunst wie Luftperspektive: Ferne Flächen gehen in die Farbe des Himmels
// in ihrer Blickrichtung über, so verschwimmt der Horizont nahtlos.
const DUNST = {
  uHimmel: { value: null },
  uDunst: { value: 1 / 9000 },
};

function mitDunst(material, extra = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, DUNST, extra.uniforms ?? {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWelt;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWelt = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWelt;
uniform samplerCube uHimmel;
uniform float uDunst;
${extra.kopf ?? ''}`)
      .replace('#include <tonemapping_fragment>', `{
  vec3 blick = vWelt - cameraPosition;
  float weite = length(blick);
  blick /= weite;
  vec3 himmel = textureCube(uHimmel, normalize(vec3(blick.x, max(blick.y, 0.0) + 0.012, blick.z))).rgb;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, himmel, 1.0 - exp(-weite * uDunst));
}
#include <tonemapping_fragment>`);
    for (const [alt, neu] of extra.ersetzen ?? []) shader.fragmentShader = shader.fragmentShader.replace(alt, neu);
  };
  // Alle Dunst-Materialien teilen sich ein Programm je Art.
  material.customProgramCacheKey = () => 'dunst-' + (extra.name ?? '');
  return material;
}

// Meer: Wellen als Summe gerichteter Wellen (periodisch in x, damit die
// gefahrene Strecke ohne Sprung umläuft), die mit der Entfernung glatter und
// dafür rauer werden; so wird aus Glitzern in der Nähe ein breiter Sonnenpfad.
const WELLEN = (() => {
  const r = zufall(23);
  const liste = [];
  let laenge = 40, hoehe = 0.14;
  for (let i = 0; i < 10; i++) {
    // Die Dünung kommt vom offenen Meer (-z) auf die Küste zu.
    const winkel = Math.PI / 2 + (r() - 0.5) * (i < 3 ? 1.4 : 3.0);
    const k = WELLEN_L / laenge;
    const a = Math.round(Math.cos(winkel) * k);
    const b = Math.round(Math.sin(winkel) * k);
    const kBetrag = (2 * Math.PI * Math.hypot(a, b)) / WELLEN_L;
    liste.push({ a, b, hoehe, tempo: Math.sqrt(9.81 * kBetrag), versatz: r() * 6.283 });
    laenge *= 0.66;
    hoehe *= 0.6;
  }
  return liste;
})();

const MEER_KOPF = `
uniform vec4 uWelle[${WELLEN.length}];
uniform float uFahrtMeer;
uniform float uMeerZeit;
uniform vec3 uMeerSpiegel;
float meerHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
// Wertrauschen, in x periodisch nach n Zellen.
float meerRauschen(vec2 p, float n) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 j = vec2(mod(i.x + 1.0, n), i.y);
  i.x = mod(i.x, n);
  return mix(mix(meerHash(i), meerHash(vec2(j.x, i.y)), u.x),
             mix(meerHash(vec2(i.x, i.y + 1.0)), meerHash(vec2(j.x, i.y + 1.0)), u.x), u.y);
}
// Gefälle von Kräuselwellen aus Rauschen, Zellgröße l Meter.
vec2 kraeusel(vec2 p, float l, float zug, float weite) {
  float n = ${WELLEN_L.toFixed(1)} / l;
  vec2 q = p / l + vec2(0.0, uMeerZeit * zug);
  float e = 0.2;
  float h = meerRauschen(q, n);
  vec2 g = vec2(meerRauschen(q + vec2(e, 0.0), n) - h, meerRauschen(q + vec2(0.0, e), n) - h) / (e * l);
  return g * l * 0.045 * (1.0 - smoothstep(l * 20.0, l * 80.0, weite));
}
vec3 meerNormale(vec2 p, float weite) {
  // Windflecken: mal kräuselt es stark, mal liegt das Wasser glatt.
  float wind = smoothstep(0.25, 0.75, meerRauschen(p / 160.0 + vec2(0.0, uMeerZeit * 0.004), ${WELLEN_L.toFixed(1)} / 160.0));
  vec2 g = (kraeusel(p, 8.0, 0.11, weite) + kraeusel(p, 2.0, -0.31, weite) * 1.2 + kraeusel(p, 0.5, 0.7, weite)) * mix(0.35, 1.6, wind);
  for (int i = 0; i < ${WELLEN.length}; i++) {
    vec4 w = uWelle[i];
    float k = 6.2831853 * length(w.xy) / ${WELLEN_L.toFixed(1)};
    float laenge = 6.2831853 / k;
    // Kürzere Wellen blenden in der Ferne aus, bevor sie flimmern.
    float sicht = 1.0 - smoothstep(laenge * 18.0, laenge * 70.0, weite);
    float phase = 6.2831853 * dot(w.xy, p) / ${WELLEN_L.toFixed(1)} - w.w;
    g += w.xy * (6.2831853 / ${WELLEN_L.toFixed(1)}) * w.z * cos(phase) * sicht;
  }
  return normalize(vec3(-g.x, 1.0, -g.y));
}
`;

// ---------- die Szene ----------

export class Kueste {
  constructor(canvas, kontext) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, context: kontext, antialias: true, powerPreference: 'high-performance' }));
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.shadowMap.autoUpdate = false;

    this.szene = new THREE.Scene();
    this.kamera = new THREE.PerspectiveCamera(24, 1, 0.5, 60000);
    this.fahrt = Math.random() * 5000;
    this.tempo = 18; // m/s
    this.zeit = Math.random() * 100;
    this.dunkel = null;
    // Nach einem Kontextverlust Himmel, Umgebung und Schatten neu rechnen.
    canvas.addEventListener('webglcontextrestored', () => (this.dunkel = null));
    this.auto = null;
    this.raeder = [];
    this.einfahrt = 1;
    this.bildgroesse = [1, 1];

    this.himmelBauen();
    this.meerBauen();
    this.fernBauen();
    this.nahBauen();
    this.lichtBauen();
    this.autoLaden();
  }

  himmelBauen() {
    this.himmel = new THREE.Sky();
    this.himmel.scale.setScalar(20000);
    this.szene.add(this.himmel);

    // Zweiter Himmel ohne Sonnenscheibe für Umgebungslicht und Dunst.
    this.umgebungSzene = new THREE.Scene();
    this.umgebungHimmel = new THREE.Sky();
    this.umgebungHimmel.scale.setScalar(20000);
    this.umgebungHimmel.material.uniforms.showSunDisc.value = 0;
    this.umgebungSzene.add(this.umgebungHimmel);

    // Was das Auto in der Umgebung spiegelt: Meer hinten, Straße, Hang mit
    // Hügeln auf der Landseite (zur Kamera hin, also auf der sichtbaren Flanke).
    const flach = (farbe) => new THREE.MeshBasicMaterial({ color: farbe });
    this.umgebungBoden = new THREE.Group();
    const meer = new THREE.Mesh(new THREE.PlaneGeometry(40000, 20000), flach(0x0b2236));
    meer.rotation.x = -Math.PI / 2;
    meer.position.set(0, MEER, -10000 - 30);
    const strasse = new THREE.Mesh(new THREE.PlaneGeometry(400, 9), flach(0x2a2a2b));
    strasse.rotation.x = -Math.PI / 2;
    const land = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2000), flach(0x2e2b1f));
    land.rotation.x = -Math.PI / 2;
    land.position.set(0, -0.05, 1000 + STRASSE);
    // Hügel als Band rund um die Landseite.
    const huegel = new THREE.Mesh(new THREE.CylinderGeometry(600, 600, 160, 64, 1, true, -Math.PI / 2, Math.PI), flach(0x252b1a));
    huegel.material.side = THREE.BackSide;
    huegel.position.y = 30;
    const huegelGeo = huegel.geometry.attributes.position;
    for (let i = 0; i < huegelGeo.count; i++) {
      if (huegelGeo.getY(i) > 0) {
        const w = Math.atan2(huegelGeo.getX(i), huegelGeo.getZ(i));
        huegelGeo.setY(i, -10 + 120 * fbm(w * 3 + 10, 0.5, 1 << 20, 9, 3));
      }
    }
    this.umgebungBoden.add(meer, strasse, land, huegel);
    this.umgebungSzene.add(this.umgebungBoden);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.himmelWuerfel = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
    this.wuerfelKamera = new THREE.CubeCamera(1, 50000, this.himmelWuerfel);
    DUNST.uHimmel.value = this.himmelWuerfel.texture;
  }

  meerBauen() {
    this.wellenWerte = WELLEN.map(() => new THREE.Vector4());
    this.fahrtMeer = { value: 0 };
    this.meerZeit = { value: 0 };
    this.meerSpiegel = { value: new THREE.Color(1, 1, 1) };
    const material = mitDunst(new THREE.MeshStandardMaterial({ color: 0x0d4b75, roughness: 0.1, metalness: 0 }), {
      name: 'meer',
      uniforms: { uWelle: { value: this.wellenWerte }, uFahrtMeer: this.fahrtMeer, uMeerZeit: this.meerZeit, uMeerSpiegel: this.meerSpiegel },
      kopf: MEER_KOPF,
      ersetzen: [
        ['#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float meerWeite = length(vWelt - cameraPosition);
roughnessFactor = mix(roughnessFactor, 0.32, smoothstep(150.0, 6000.0, meerWeite));`],
        ['#include <normal_fragment_maps>', `{
  vec3 nWelt = meerNormale(vec2(vWelt.x + uFahrtMeer, vWelt.z), meerWeite);
  normal = normalize((viewMatrix * vec4(nWelt, 0.0)).xyz);
}`],
        // Tagsüber spiegelt das Meer den blassen Horizont zu hell; ein Hauch
        // Blau in der Spiegelung macht es tiefer, wie durch einen Polfilter.
        ['#include <lights_fragment_end>', 'radiance *= uMeerSpiegel;\n#include <lights_fragment_end>'],
      ],
    });
    const meer = new THREE.Mesh(new THREE.PlaneGeometry(60000, 25000), material);
    meer.rotation.x = -Math.PI / 2;
    meer.position.set(0, MEER, -12500 - 20);
    this.szene.add(meer);
  }

  // Landzungen und Inseln in der Ferne, als Höhenfelder.
  landmasse(breite, tiefe, hoehe, seed, steil = 1) {
    const geo = new THREE.PlaneGeometry(breite, tiefe, 160, 48);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const farben = [];
    const fels = new THREE.Color(0x6d6555), gruen = new THREE.Color(0x2f3a22), dunkel = new THREE.Color(0x232a1a);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / breite + 0.5, z = pos.getZ(i) / tiefe + 0.5;
      // Hüllkurve: zur Mitte hoch, zu den Rändern ins Meer abfallend.
      const huelle = Math.sin(Math.PI * x) ** (0.8 * steil) * Math.sin(Math.PI * z) ** 0.6;
      const grat = 1 - Math.abs(2 * fbm(x * 7, z * 4, 1 << 20, seed, 5) - 1);
      const relief = 0.35 + 0.55 * grat + 0.35 * fbm(x * 18, z * 9, 1 << 20, seed + 5, 3);
      const y = Math.max(-30, hoehe * huelle * relief - hoehe * 0.12);
      pos.setY(i, y);
      const t = y / hoehe;
      c.copy(fels).lerp(gruen, glatt(0.02, 0.12, t)).lerp(dunkel, glatt(0.4, 0.9, t));
      farben.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(farben, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, this.landMaterial);
    return m;
  }

  fernBauen() {
    this.landMaterial = mitDunst(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { name: 'land' });
    // x wandert mit der Fahrt und läuft nach `periode` Metern um.
    this.ferne = [];
    const setze = (mesh, x, z, periode) => {
      mesh.position.set(x, MEER, z);
      this.szene.add(mesh);
      this.ferne.push({ mesh, x, periode });
    };
    setze(this.landmasse(3200, 1400, 190, 3), 1800, -4200, 14000);
    setze(this.landmasse(2200, 1000, 140, 8), -5200, -5600, 14000);
    setze(this.landmasse(5200, 2000, 330, 13, 0.6), 6200, -10500, 14000);
    setze(this.landmasse(1200, 700, 110, 21), -1800, -12500, 30000);
    setze(this.landmasse(2000, 1000, 210, 34), 9000, -15500, 30000);
  }

  // Alles, was nah an der Straße liegt, in einer Gruppe, die sich mit der
  // Fahrt verschiebt und nach PERIODE Metern wiederholt.
  nahBauen() {
    const nah = (this.nah = new THREE.Group());
    const laenge = PERIODE * 3;
    this.szene.add(nah);

    // Straße
    const strTex = strassenTextur(this.renderer);
    strTex.repeat.set(laenge / 18, 1);
    const strasse = new THREE.Mesh(new THREE.PlaneGeometry(laenge, STRASSE * 2), new THREE.MeshStandardMaterial({ map: strTex, roughness: 0.95, envMapIntensity: 0.55 }));
    strasse.rotation.x = -Math.PI / 2;
    strasse.receiveShadow = true;
    nah.add(strasse);

    // Landseite: Bankett und Boden
    const bodenTex = bodenTextur(this.renderer);
    bodenTex.repeat.set(laenge / 12, 60 / 12);
    const boden = new THREE.Mesh(new THREE.PlaneGeometry(laenge, 60), mitDunst(new THREE.MeshStandardMaterial({ map: bodenTex, roughness: 1 }), { name: 'boden' }));
    boden.rotation.x = -Math.PI / 2;
    boden.position.set(0, -0.02, STRASSE + 30);
    boden.receiveShadow = true;
    nah.add(boden);
    const bankett = new THREE.Mesh(new THREE.PlaneGeometry(laenge, 0.9), new THREE.MeshStandardMaterial({ color: 0x8c8473, roughness: 1 }));
    bankett.rotation.x = -Math.PI / 2;
    bankett.position.set(0, -0.005, STRASSE + 0.45);
    bankett.receiveShadow = true;
    nah.add(bankett);

    // Meerseite: Hang von der Leitplanke hinunter zum Wasser.
    const hangHoehe = (x, z) => {
      const t = glatt(-STRASSE - 0.6, -46, z);
      const fels = fbm(x / 9, z / 9, PERIODE / 9, 4, 4);
      return -0.12 - t * 19 + (fels - 0.5) * 3.2 * Math.min(1, t * 4);
    };
    const hangGeo = new THREE.PlaneGeometry(laenge, 54, 216, 40);
    hangGeo.rotateX(-Math.PI / 2);
    const hp = hangGeo.attributes.position;
    const hangFarben = [];
    const c = new THREE.Color();
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i), z = hp.getZ(i) - STRASSE - 27;
      hp.setZ(i, z);
      const y = hangHoehe(x, z);
      hp.setY(i, y);
      const gruen = fbm(x / 6, z / 6, PERIODE / 6, 12, 3);
      c.setRGB(0.24, 0.21, 0.16).lerp(new THREE.Color(0.08, 0.11, 0.05), glatt(0.4, 0.6, gruen));
      hangFarben.push(c.r, c.g, c.b);
    }
    hangGeo.setAttribute('color', new THREE.Float32BufferAttribute(hangFarben, 3));
    hangGeo.computeVertexNormals();
    nah.add(new THREE.Mesh(hangGeo, mitDunst(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), { name: 'hang' })));

    // Leitplanke: durchgehendes Profil auf Pfosten alle 4 m.
    const stahl = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.85, roughness: 0.38 });
    const planke = new THREE.Mesh(new THREE.BoxGeometry(laenge, 0.31, 0.06), stahl);
    planke.position.set(0, 0.6, -STRASSE - 0.25);
    planke.castShadow = false;
    nah.add(planke);
    const sicke = new THREE.Mesh(new THREE.BoxGeometry(laenge, 0.05, 0.08), new THREE.MeshStandardMaterial({ color: 0x7a7e82, metalness: 0.8, roughness: 0.5 }));
    sicke.position.set(0, 0.6, -STRASSE - 0.24);
    nah.add(sicke);
    const pfosten = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.75, 0.12), stahl, laenge / 4);
    const m = new THREE.Matrix4();
    for (let i = 0; i < laenge / 4; i++) {
      m.makeTranslation(-laenge / 2 + i * 4, 0.37, -STRASSE - 0.36);
      pfosten.setMatrixAt(i, m);
    }
    nah.add(pfosten);
  }

  lichtBauen() {
    const sonne = (this.sonne = new THREE.DirectionalLight(0xffffff, 3));
    sonne.castShadow = true;
    sonne.shadow.mapSize.set(2048, 2048);
    const k = sonne.shadow.camera;
    k.left = -5; k.right = 5; k.top = 5; k.bottom = -5; k.near = 1; k.far = 120;
    sonne.shadow.bias = -0.0004;
    sonne.shadow.normalBias = 0.02;
    sonne.shadow.radius = 3;
    sonne.target.position.set(0, 0, SPUR);
    // Aufheller von der Kameraseite, nur in der Dämmerung, damit die
    // Flanke des Autos nicht im Schwarz versinkt.
    this.aufheller = new THREE.DirectionalLight(0x9fb4ff, 0);
    this.aufheller.position.set(-25, 18, 40);
    this.aufheller.target.position.set(0, 0.6, SPUR);
    this.szene.add(sonne, sonne.target, this.aufheller, this.aufheller.target);
  }

  stimmungSetzen(dunkel) {
    this.dunkel = dunkel;
    const s = (this.stimmung = dunkel ? STIMMUNGEN.dunkel : STIMMUNGEN.hell);
    const [hoehe, richtung] = s.sonne;
    const richtungSonne = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - hoehe), THREE.MathUtils.degToRad(180 - richtung));
    for (const himmel of [this.himmel, this.umgebungHimmel]) {
      const u = himmel.material.uniforms;
      u.sunPosition.value.copy(richtungSonne);
      u.turbidity.value = s.trueb;
      u.rayleigh.value = s.rayleigh;
      u.mieCoefficient.value = s.mie;
      u.mieDirectionalG.value = s.mieG;
      u.cloudCoverage.value = s.wolken;
      u.cloudScale.value = 0.00028;
      u.cloudSpeed.value = 0.00001;
      u.cloudElevation.value = 0.35;
      u.cloudDensity.value = 0.45;
    }
    this.renderer.toneMappingExposure = s.belichtung;
    this.sonne.color.setRGB(...s.licht);
    this.sonne.intensity = s.lichtStaerke;
    this.aufheller.intensity = s.aufheller;
    this.meerSpiegel.value.setRGB(...s.meerSpiegel);
    this.sonne.position.copy(richtungSonne).multiplyScalar(60).add(this.sonne.target.position);
    this.szene.environmentIntensity = s.umgebung;
    DUNST.uDunst.value = s.dunst;
    this.umgebungErneuern();
    this.autoLichter();
  }

  // Umgebungslicht (PMREM) und Dunst-Würfel aus dem aktuellen Himmel.
  umgebungErneuern() {
    const r = this.renderer;
    this.umgebungBoden.visible = false;
    this.wuerfelKamera.update(r, this.umgebungSzene);
    this.umgebungBoden.visible = true;
    const alt = this.umgebung;
    this.umgebung = this.pmrem.fromScene(this.umgebungSzene, 0, 0.5, 50000, { position: new THREE.Vector3(0, 1.1, SPUR), size: 256 });
    this.szene.environment = this.umgebung.texture;
    alt?.dispose();
    r.shadowMap.needsUpdate = true;
  }

  autoLichter() {
    if (!this.auto || !this.stimmung) return;
    for (const m of this.lampen) m.emissiveIntensity = this.stimmung.scheinwerfer;
    for (const m of this.rueckLichter) m.emissiveIntensity = this.stimmung.rueck;
    this.kegel.intensity = this.stimmung.scheinwerfer * 5;
  }

  async autoLaden() {
    const lader = new THREE.GLTFLoader();
    lader.setMeshoptDecoder(THREE.MeshoptDecoder);
    let gltf;
    try {
      gltf = await lader.loadAsync(MODELL);
    } catch (fehler) {
      console.warn('Küste: Modell nicht geladen', fehler);
      return;
    }
    const modell = gltf.scene;
    // Das Modell schaut nach +z; hier fährt es nach +x. Reifen unten auf 0.
    modell.rotation.y = Math.PI / 2;
    modell.position.y = 0.63;
    const auto = new THREE.Group();
    auto.add(modell);
    auto.position.z = SPUR;
    auto.updateMatrixWorld(true);

    this.lampen = [];
    this.rueckLichter = [];
    const lack = new THREE.Color('#142850');
    modell.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const m = o.material;
      switch (m.name) {
        case 'paint':
          m.color.copy(lack);
          m.metalness = 0.65;
          m.roughness = 0.34;
          m.clearcoat = 1;
          m.clearcoatRoughness = 0.035;
          m.envMapIntensity = 1.25;
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
        case 'tex_shiny':
          this.rueckLichter.push(m);
          break;
        case 'Material':
          // Eingebackener Kontaktschatten unter dem Auto.
          o.castShadow = false;
          m.depthWrite = false;
          m.polygonOffset = true;
          m.polygonOffsetFactor = -2;
          m.polygonOffsetUnits = -2;
          o.renderOrder = -1;
          break;
      }
    });

    // Räder: Felge, Reifen und Bremsscheibe drehen sich um die Achse, die
    // Bremssättel (Material.001) bleiben stehen.
    for (const name of ['Cylinder000', 'Cylinder001']) {
      const achse = modell.getObjectByName(name);
      if (!achse) continue;
      const teile = achse.children.filter((o) => o.isMesh && o.material.name !== 'Material.001');
      const reifen = teile.find((o) => o.material.name === 'rubber') ?? teile[0];
      const box = new THREE.Box3().setFromObject(reifen);
      const mitte = box.getCenter(new THREE.Vector3());
      const radius = (box.max.y - box.min.y) / 2;
      const nabe = new THREE.Group();
      nabe.position.copy(auto.worldToLocal(mitte.clone()));
      auto.add(nabe);
      nabe.updateMatrixWorld(true);
      for (const t of teile) nabe.attach(t);
      this.raeder.push({ nabe, radius, winkel: 0 });
    }

    // Abblendlicht auf der Straße vor dem Auto (nur im Dunkeln an).
    const kegel = (this.kegel = new THREE.SpotLight(0xfff1dc, 0, 60, 0.5, 1, 1.2));
    kegel.position.set(1.9, 0.62, 0);
    kegel.target.position.set(14, 0, 0.3);
    auto.add(kegel, kegel.target);

    this.auto = auto;
    this.szene.add(auto);
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

  // Bildausschnitt: das Auto in der Mitte der freien Fläche (auf dem Mac
  // rechts neben der App), etwas unter der Bildmitte, damit über ihm Meer
  // und Himmel Platz haben.
  kameraSetzen(frei, neigung, schwanken) {
    const [W, H] = this.bildgroesse;
    const breite = Math.max(1, W - frei);
    const format = breite / H;
    // Hochkant etwas weiter, quer eher Tele.
    const fov = 20 + 12 * glatt(1.0, 0.45, format);
    const anteil = Math.min(0.86, Math.max(0.5, 0.98 - 0.32 * format));
    const brennweitePx = H / 2 / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const abstand = (4.6 * brennweitePx) / (anteil * breite);
    const neigungWinkel = THREE.MathUtils.degToRad(6.5 + neigung[1] * 2);

    // Die Kamera fährt mal etwas vor, mal zurück, als hielte der Kamerawagen
    // nicht ganz das Tempo. Das Auto selbst bleibt stehen, so passt sein
    // Schatten, ohne ihn jedes Bild neu zu rechnen.
    // Wie weit, hängt am Rand, den das Bild neben dem Auto lässt.
    const spiel = Math.max(0, 4.6 / anteil - 4.6) * 0.25;
    const ziel = new THREE.Vector3(0.15 - schwanken[2] * spiel, 0.62, SPUR);
    const drehung = THREE.MathUtils.degToRad(neigung[0] * 5 + schwanken[0]);
    const k = this.kamera;
    k.position.set(
      ziel.x + Math.sin(drehung) * abstand,
      ziel.y + Math.tan(neigungWinkel) * abstand + schwanken[1],
      ziel.z + Math.cos(drehung) * abstand,
    );
    k.lookAt(ziel);

    const cx = frei + breite / 2;
    const cy = H * (format < 0.8 ? 0.6 : 0.56);
    const fw = 2 * Math.max(cx, W - cx);
    const fh = 2 * Math.max(cy, H - cy);
    k.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov / 2)) * (fh / H)));
    k.aspect = fw / fh;
    k.setViewOffset(fw, fh, fw / 2 - cx, fh / 2 - cy, W, H);
    k.updateProjectionMatrix();
  }

  // s: Sekunden seit dem letzten Bild; z: { tempo, neigung, dunkel, frei, ruhe }
  zeichnen(s, z) {
    if (this.dunkel !== z.dunkel) this.stimmungSetzen(z.dunkel);
    this.zeit += s;

    // Tempo in m/s: gemütlich, wenn nichts los ist, zügig, wenn Claude arbeitet.
    const zielTempo = 9 + 21 * z.tempo;
    this.tempo += (zielTempo - this.tempo) * (1 - Math.exp(-s * 0.6));
    this.fahrt += this.tempo * s;

    this.nah.position.x = -(this.fahrt % PERIODE);
    for (const f of this.ferne) {
      const x = ((((f.x - this.fahrt) % f.periode) + f.periode * 1.5) % f.periode) - f.periode / 2;
      f.mesh.position.x = x;
    }

    // Wellen: Phasen in doppelter Genauigkeit hier, im Shader nur der Rest.
    for (let i = 0; i < WELLEN.length; i++) {
      const w = WELLEN[i];
      this.wellenWerte[i].set(w.a, w.b, w.hoehe, (w.tempo * this.zeit + w.versatz) % (Math.PI * 2));
    }
    this.fahrtMeer.value = this.fahrt % WELLEN_L;
    this.meerZeit.value = this.zeit % 5000;
    this.himmel.material.uniforms.time.value = this.zeit;

    // Kamera: ruhige Fahraufnahme, leichtes Schwanken wie vom Kamerawagen.
    const t = this.zeit;
    const ruhig = z.ruhe ? 0.2 : 1;
    const schwanken = [
      (Math.sin(t * 0.071) * 3 + Math.sin(t * 0.23 + 1) * 0.6) * ruhig,
      (Math.sin(t * 1.7) * 0.012 + Math.sin(t * 0.37 + 2) * 0.05) * ruhig,
      (Math.sin(t * 0.043) * 0.75 + Math.sin(t * 0.11 + 1.3) * 0.25) * ruhig,
    ];
    this.kameraSetzen(z.frei, z.neigung, schwanken);

    if (this.auto) {
      // Einfahrt: das Auto holt die Kamera von links ein.
      if (this.einfahrt < 1) this.einfahrt = Math.min(1, this.einfahrt + s / 4.5);
      const e = 1 - (1 - this.einfahrt) ** 3;
      this.auto.position.x = -32 * (1 - e);
      // Solange es einfährt, wandert sein Schatten mit; danach steht er.
      if (this.einfahrt < 1) this.renderer.shadowMap.needsUpdate = true;
      // Federung: kleine Unebenheiten der Straße.
      const holper = Math.sin(this.fahrt * 0.9) * 0.004 + Math.sin(this.fahrt * 2.3 + 1) * 0.0025;
      this.auto.position.y = holper;
      this.auto.rotation.z = Math.sin(this.fahrt * 0.6 + 0.5) * 0.0018;
      const v = this.tempo + (1 - this.einfahrt) * 20;
      for (const rad of this.raeder) {
        // Echt drehten die Speichen pro Bild weiter als ihr Abstand und
        // stünden still oder liefen rückwärts. Höchstens 0,17 rad pro Bild
        // sieht dagegen aus wie ein Rad, das sich schnell vorwärts dreht.
        rad.winkel = (rad.winkel - Math.min((v / rad.radius) * s, 0.17)) % (Math.PI * 2);
        rad.nabe.rotation.z = rad.winkel;
      }
    }

    this.renderer.render(this.szene, this.kamera);
    if (!this.canvas.classList.contains('bereit')) this.canvas.classList.add('bereit');
  }
}
