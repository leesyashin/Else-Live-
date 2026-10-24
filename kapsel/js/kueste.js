// Hintergrund „Küste“: ein Porsche 911 Carrera 4S fährt eine Klippenstraße
// entlang, gezeichnet wie ein Zeichentrickfilm: Licht in Stufen, satte
// Farben, dunkle Umrisse, gemalter Himmel mit Wolken, Fahrtwind-Striche. Die Kamera schwebt seitlich über dem Hang, fährt mit
// und schaut mit langer Brennweite über Auto und Leitplanke hinunter aufs
// Meer; draußen stehen Felsnadeln in der Brandung, dahinter Steilküsten und
// Inseln im Dunst, Möwen segeln mit. Hell ist Nachmittag, im Dunkeln geht die
// Sonne unter und am Auto brennt Licht.
//
// Das Auto steht, die Welt läuft: Straße, Leitplanke, Klippenkante, Büsche
// und Pinien liegen in einer Gruppe, die sich um die gefahrene Strecke
// verschiebt und sich alle PERIODE Meter wiederholt; die Felsnadeln ebenso
// alle MITTEL Meter. Das Meer verschiebt seine Wellen im Shader, ferne Küsten
// wandern langsam durchs Bild. Wie schnell gefahren wird, hängt am
// Session-Status.
//
// three.js liegt gebündelt in vendor/ (scripts/kapsel-three.mjs), das Modell
// in modelle/ (scripts/kapsel-modell.mjs, Lizenz in modelle/LIZENZ.md).

import * as THREE from '../vendor/three-r186.min.js';

const MODELL = 'modelle/porsche-911-navy-1.glb';

// Welt in Metern: x Fahrtrichtung, y oben, z zur Kamera (Bergseite);
// das Meer liegt bei -z, tief unter der Straße.
const SPUR = 1.75; // Mitte der Fahrspur, auf der das Auto fährt
const STRASSE = 4.5; // halbe Breite von Rand zu Rand
const PLANKE = -STRASSE - 2.3; // Leitplanke hinter dem Schotterstreifen
const PLANKE_UNTEN = 0.47; // Unterkante und Oberkante des Plankenprofils
const PLANKE_OBEN = 0.78;
const DACH = 1.32; // höchster Punkt des Autos
const KANTE = -STRASSE - 6; // Abbruchkante der Klippe (wandert um ±2 m)
const MEER = -42; // Meeresspiegel unter der Straße
const AUTO_Y = 0.66; // wo Auto und Horizont im Bild stehen (Anteil der Höhe)
const HORIZONT_Y = 0.19;
const PERIODE = 144; // Wiederholung der nahen Welt; Vielfaches aller Muster
const MITTEL = 2400; // Wiederholung der Felsnadeln
const WELLEN_L = 4096; // Wiederholung des Wellenmusters in x

// Licht und Farben je Stimmung, gemalt statt fotografiert: kräftige Töne,
// Licht in Stufen. Sonne: Höhe und Richtung in Grad (0 = Blick der Kamera
// aufs Meer, positiv nach rechts).
const STIMMUNGEN = {
  hell: {
    sonne: [32, 138], licht: 0xfff1d8, lichtStaerke: 2.3, belichtung: 1.0,
    himmel: [0x2c78d6, 0x77bdf0, 0xd8f3f8], sonnenFarbe: 0xfff4d0, scheibe: 0,
    hemi: [0xcfe8ff, 0x9a7a52, 1.25], umgebung: 0.9, aufheller: 0,
    meer: [0x1cc0c8, 0x1a63b8, 0xbff6ff], glanz: [0.25, 0.5, -1], schaum: [1, 1, 1],
    wolke: [0xffffff, 0x9fc4ec], umriss: 0x24314a, dunst: 1 / 12000,
    scheinwerfer: 0, rueck: 0.35,
  },
  dunkel: {
    sonne: [4, 14], licht: 0xffa070, lichtStaerke: 1.6, belichtung: 1.0,
    himmel: [0x1a1650, 0x8a4b9a, 0xffa86a], sonnenFarbe: 0xffc27a, scheibe: 1,
    hemi: [0x8f78d8, 0x2a1838, 0.85], umgebung: 0.7, aufheller: 0.7,
    meer: [0x2b3c86, 0x3a2a72, 0xffc89a], glanz: [0.25, 0.08, -1], schaum: [1, 0.78, 0.7],
    wolke: [0xffb59a, 0x6a4a9a], umriss: 0x140c24, dunst: 1 / 7000,
    scheinwerfer: 5.0, rueck: 4.0,
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
      const v = 150 + (s / 9 - 0.5) * 40 + (flecken - 0.5) * 16;
      // Dunklere Fahrspuren der Reifen.
      const quer = y / h;
      const spur = Math.exp(-(((quer - 0.22) / 0.05) ** 2)) + Math.exp(-(((quer - 0.38) / 0.05) ** 2))
        + Math.exp(-(((quer - 0.62) / 0.05) ** 2)) + Math.exp(-(((quer - 0.78) / 0.05) ** 2));
      const i = (y * w + x) * 4;
      const grau = v - spur * 8;
      bild.data[i] = grau;
      bild.data[i + 1] = grau;
      bild.data[i + 2] = grau + 3;
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

// Neutrales Korn für Gelände, Schotter und Fels, 8 m × 8 m, kachelbar. Den
// Farbton bringen die Eckfarben der Flächen mit.
function kornTextur(renderer) {
  const n = 512;
  const c = leinwand(n, n);
  const g = c.getContext('2d');
  const bild = g.createImageData(n, n);
  const r = zufall(11);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const gross = fbm(x / 48, y / 48, n / 48, 5, 3);
      const kiesel = rauschen(x / 3, y / 3, n / 3, 8);
      const v = 0.8 + (gross - 0.5) * 0.3 + (kiesel - 0.5) * 0.28 + (r() - 0.5) * 0.18;
      const i = (y * n + x) * 4;
      bild.data[i] = bild.data[i + 1] = bild.data[i + 2] = Math.max(0, Math.min(255, v * 255));
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

// ---------- Zeichenstil ----------

// Licht in drei Stufen wie in einem Zeichentrickfilm.
const STUFEN = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 180, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const toon = (werte) => new THREE.MeshToonMaterial({ gradientMap: STUFEN, ...werte });

// Glanz auf Lack und Scheiben: ein harter weißer Streifen, wo der Himmel
// sich spiegelt, statt einer fotografischen Spiegelung.
function mitGlanz(material) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <tonemapping_fragment>', `{
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vViewPosition);
  // Wo sich die Fläche vom Himmel zur Seite wölbt (Schulter, Dachkante),
  // liegt ein harter heller Streifen.
  float oben = dot(n, normalize(viewMatrix[1].xyz));
  float streifen = smoothstep(0.5, 0.54, oben) * (1.0 - smoothstep(0.76, 0.8, oben));
  gl_FragColor.rgb += vec3(0.5, 0.58, 0.72) * streifen * 0.45;
}
#include <tonemapping_fragment>`);
  };
  material.customProgramCacheKey = () => 'glanz';
  return material;
}

// Wind: Büsche und Gras wiegen sich, oben mehr als unten.
const WIND = { uWind: { value: 0 } };
const wiegen = (staerke) => `{
  vec3 wo = vec3(0.0);
  #ifdef USE_INSTANCING
  wo = instanceMatrix[3].xyz;
  #endif
  float oben = max(position.y + 0.2, 0.0);
  transformed.x += sin(uWind * 2.1 + wo.x * 0.7 + wo.z) * ${staerke.toFixed(3)} * oben;
  transformed.z += sin(uWind * 1.6 + wo.x * 0.45 + 1.0) * ${(staerke * 0.6).toFixed(3)} * oben;
}`;

function mitWind(material, staerke) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, WIND);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + wiegen(staerke));
  };
  material.customProgramCacheKey = () => 'wind-' + staerke;
  return material;
}

// Umrisslinien: die Rückseite, ein paar Bildpunkte nach außen geschoben und
// dunkel gefärbt (inverted hull). Breite in Bildpunkten, unabhängig von der
// Entfernung.
const UMRISS = { uFarbe: { value: new THREE.Color(0x24314a) }, uPixel: { value: new THREE.Vector2(0.002, 0.002) } };

function umrissMaterial(breite, staerke = 0) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { ...UMRISS, ...WIND, uBreite: { value: breite } },
    vertexShader: `
uniform vec2 uPixel;
uniform float uBreite;
uniform float uWind;
void main() {
  vec3 transformed = position;
  ${staerke ? wiegen(staerke) : ''}
  mat4 mv = modelViewMatrix;
  #ifdef USE_INSTANCING
  mv = modelViewMatrix * instanceMatrix;
  #endif
  vec3 nv = normalize(mat3(mv) * normal);
  vec4 clip = projectionMatrix * mv * vec4(transformed, 1.0);
  clip.xy += normalize(nv.xy + 1e-5) * uBreite * uPixel * clip.w;
  gl_Position = clip;
}`,
    fragmentShader: `
uniform vec3 uFarbe;
void main() {
  gl_FragColor = vec4(uFarbe, 1.0);
  #include <colorspace_fragment>
}`,
  });
}

// Hängt einem Mesh seinen Umriss an (teilt Geometrie und, bei vielen
// Exemplaren, deren Lage).
function umreissen(mesh, breite, staerke = 0) {
  const material = umrissMaterial(breite, staerke);
  let u;
  if (mesh.isInstancedMesh) {
    u = new THREE.InstancedMesh(mesh.geometry, material, mesh.count);
    u.instanceMatrix = mesh.instanceMatrix;
    u.position.copy(mesh.position);
    u.quaternion.copy(mesh.quaternion);
    u.scale.copy(mesh.scale);
    mesh.parent.add(u);
  } else {
    u = new THREE.Mesh(mesh.geometry, material);
    mesh.add(u);
  }
  u.castShadow = false;
  u.frustumCulled = mesh.frustumCulled;
  return u;
}

// Gemalter Himmel: Verlauf vom Horizont nach oben, weicher Schein um die Sonne.
const HIMMEL_FRAGMENT = `
uniform vec3 uOben;
uniform vec3 uMitte;
uniform vec3 uHorizont;
uniform vec3 uSonne;
uniform vec3 uSonnenFarbe;
uniform float uScheibe;
varying vec3 vRichtung;
void main() {
  vec3 d = normalize(vRichtung);
  float h = d.y;
  vec3 c = mix(uHorizont, uMitte, smoothstep(-0.01, 0.16, h));
  c = mix(c, uOben, smoothstep(0.16, 0.6, h));
  float s = max(dot(d, uSonne), 0.0);
  c += uSonnenFarbe * (pow(s, 8.0) * 0.25 + pow(s, 80.0) * 0.45);
  // Sonnenscheibe mit hartem Rand und Hof.
  c = mix(c, uSonnenFarbe * 1.6, uScheibe * smoothstep(0.99955, 0.9997, s));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function himmelKuppel(scheibe) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uOben: { value: new THREE.Color() }, uMitte: { value: new THREE.Color() }, uHorizont: { value: new THREE.Color() },
      uSonne: { value: new THREE.Vector3(0, 1, 0) }, uSonnenFarbe: { value: new THREE.Color() }, uScheibe: { value: scheibe },
    },
    vertexShader: `
varying vec3 vRichtung;
void main() {
  vRichtung = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: HIMMEL_FRAGMENT,
  });
  const kuppel = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  kuppel.scale.setScalar(20000);
  kuppel.frustumCulled = false;
  kuppel.renderOrder = -10;
  return kuppel;
}

// ---------- Rad-Geometrie ----------

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
  float dunst = 1.0 - exp(-weite * uDunst);
  // Neben der Sonne ist der Himmel um ein Vielfaches heller als alles andere;
  // nahe Felsen sollen davor als Schattenriss stehen, nicht mitglühen. Erst
  // ganz in der Ferne geht alles in den Himmel über.
  himmel = min(himmel, vec3(1.2 / max(1.0 - dunst, 0.015)));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, himmel, dunst);
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
// Die Richtungen streuen weit, sonst liegen die Wellen wie Streifen im Bild.
const WELLEN = (() => {
  const r = zufall(23);
  const liste = [];
  let laenge = 46, hoehe = 0.13;
  for (let i = 0; i < 14; i++) {
    // Die Dünung kommt vom offenen Meer (-z) auf die Küste zu.
    const winkel = Math.PI / 2 + (r() - 0.5) * (i < 4 ? 1.6 : 3.4);
    const k = WELLEN_L / laenge;
    const a = Math.round(Math.cos(winkel) * k);
    const b = Math.round(Math.sin(winkel) * k);
    const kBetrag = (2 * Math.PI * Math.hypot(a, b)) / WELLEN_L;
    liste.push({ a, b, hoehe, tempo: Math.sqrt(9.81 * kBetrag), versatz: r() * 6.283 });
    laenge *= 0.74;
    hoehe *= 0.7;
  }
  return liste;
})();

const MEER_KOPF = `
uniform vec4 uWelle[${WELLEN.length}];
uniform float uFahrtMeer;
uniform float uMeerZeit;
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
// Wie viele Meter Wasser ein Bildpunkt abdeckt; was feiner ist, flimmerte
// nur oder läge als Streifen im Bild und wird ausgeblendet.
vec2 meerDx, meerDy;
// Gefälle von Kräuselwellen aus Rauschen, Zellgröße l Meter.
vec2 kraeusel(vec2 p, float l, float zug) {
  float n = ${WELLEN_L.toFixed(1)} / l;
  vec2 q = p / l + vec2(0.0, uMeerZeit * zug);
  float e = 0.2;
  float h = meerRauschen(q, n);
  vec2 g = vec2(meerRauschen(q + vec2(e, 0.0), n) - h, meerRauschen(q + vec2(0.0, e), n) - h) / (e * l);
  float fuss = max(length(meerDx), length(meerDy)) / l;
  return g * l * 0.032 * (1.0 - smoothstep(0.12, 0.45, fuss));
}
float meerWind(vec2 p) {
  return smoothstep(0.25, 0.75, meerRauschen(p / 220.0 + vec2(uMeerZeit * 0.003, uMeerZeit * 0.004), ${WELLEN_L.toFixed(1)} / 220.0));
}
vec3 meerNormale(vec2 p) {
  meerDx = dFdx(p);
  meerDy = dFdy(p);
  // Windflecken: mal kräuselt es stark, mal liegt das Wasser glatt.
  float wind = meerWind(p);
  vec2 g = (kraeusel(p, 9.0, 0.09) + kraeusel(p, 3.0, -0.27) * 1.1 + kraeusel(p, 0.9, 0.6)) * mix(0.3, 1.7, wind);
  for (int i = 0; i < ${WELLEN.length}; i++) {
    vec4 w = uWelle[i];
    vec2 kv = w.xy * (6.2831853 / ${WELLEN_L.toFixed(1)});
    // Ändert sich die Phase von einem Bildpunkt zum nächsten um mehr als
    // etwa eine Viertelwelle, blendet die Welle aus.
    float schritt = max(abs(dot(kv, meerDx)), abs(dot(kv, meerDy)));
    float sicht = 1.0 - smoothstep(0.5, 1.6, schritt);
    float phase = 6.2831853 * dot(w.xy, p) / ${WELLEN_L.toFixed(1)} - w.w;
    g += w.xy * (6.2831853 / ${WELLEN_L.toFixed(1)}) * w.z * cos(phase) * sicht;
  }
  return normalize(vec3(-g.x, 1.0, -g.y));
}
`;

// Brandung um Felsen: ein Ring, dessen Schaum in Schüben nach außen läuft.
const SCHAUM_VERTEX = `
varying vec2 vP;
varying vec3 vWelt;
void main() {
  vP = position.xy;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWelt = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SCHAUM_FRAGMENT = `
uniform float uZeit;
uniform vec3 uFarbe;
uniform float uSaat;
varying vec2 vP;
varying vec3 vWelt;
float schaumHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float schaumRauschen(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(schaumHash(i), schaumHash(i + vec2(1, 0)), u.x), mix(schaumHash(i + vec2(0, 1)), schaumHash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  float r = length(vP);
  float w = atan(vP.y, vP.x);
  vec2 q = vec2(cos(w), sin(w)) * 3.0 + uSaat;
  // Alle paar Sekunden läuft eine Welle auf, bricht am Fels und zieht als
  // Schaumfront nach außen, bis sie zerfällt.
  float zyklus = fract(uZeit * 0.11 + schaumRauschen(q * 0.4) * 0.25 + uSaat);
  float front = 1.15 + zyklus * (1.1 + 0.4 * schaumRauschen(q + 7.0));
  float spitze = schaumRauschen(vP * 4.0 + vec2(uZeit * 0.25, uSaat)) * 0.6 + schaumRauschen(vP * 11.0 - uZeit * 0.15) * 0.4;
  float spitzen = smoothstep(0.42, 0.72, spitze);
  float a = exp(-pow((r - front) / (0.05 + zyklus * 0.12), 2.0)) * (1.0 - zyklus) * (0.5 + 0.8 * spitze);
  a += spitzen * smoothstep(front + 0.05, front - 0.4, r) * 0.55 * (1.0 - zyklus * 0.6);
  a += smoothstep(1.32, 1.02, r) * (0.35 + 0.6 * spitze);
  a = clamp(a * smoothstep(0.95, 1.02, r), 0.0, 0.9);
  gl_FragColor = vec4(uFarbe, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- die Szene ----------

export class Kueste {
  constructor(canvas, kontext) {
    this.canvas = canvas;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, context: kontext, antialias: true, powerPreference: 'high-performance' }));
    // Neutral lässt die gemalten Farben satt, wie sie sind.
    r.toneMapping = THREE.NeutralToneMapping;
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
    this.schleier = [];
    this.einfahrt = 1;
    this.bildgroesse = [1, 1];
    this.korn = kornTextur(r);

    this.himmelBauen();
    this.meerBauen();
    this.fernBauen();
    this.nadelnBauen();
    this.nahBauen();
    this.moewenBauen();
    this.fahrtwindBauen();
    this.lichtBauen();
    this.autoLaden();
  }

  himmelBauen() {
    this.himmel = himmelKuppel(1);
    this.szene.add(this.himmel);

    // Zweiter Himmel ohne Sonnenscheibe für Umgebungslicht und Dunst.
    this.umgebungSzene = new THREE.Scene();
    this.umgebungHimmel = himmelKuppel(0);
    this.umgebungSzene.add(this.umgebungHimmel);

    // Was das Auto in der Umgebung spiegelt: Meer tief unten, Straße, der
    // Berghang auf der Landseite (zur Kamera hin, also auf der sichtbaren Flanke).
    const flach = (farbe) => new THREE.MeshBasicMaterial({ color: farbe });
    this.umgebungBoden = new THREE.Group();
    const meer = new THREE.Mesh(new THREE.PlaneGeometry(40000, 20000), flach(0x0b2236));
    meer.rotation.x = -Math.PI / 2;
    meer.position.set(0, MEER, -10000 - 30);
    const strasse = new THREE.Mesh(new THREE.PlaneGeometry(400, 9), flach(0x2a2a2b));
    strasse.rotation.x = -Math.PI / 2;
    const land = new THREE.Mesh(new THREE.PlaneGeometry(4000, 2000), flach(0x37332a));
    land.rotation.x = -Math.PI / 2;
    land.position.set(0, -0.05, 1000 + STRASSE);
    // Der Berg als Band rund um die Landseite.
    const huegel = new THREE.Mesh(new THREE.CylinderGeometry(300, 300, 220, 64, 1, true, -Math.PI / 2, Math.PI), flach(0x3b3729));
    huegel.material.side = THREE.BackSide;
    huegel.position.y = 40;
    const huegelGeo = huegel.geometry.attributes.position;
    for (let i = 0; i < huegelGeo.count; i++) {
      if (huegelGeo.getY(i) > 0) {
        const w = Math.atan2(huegelGeo.getX(i), huegelGeo.getZ(i));
        huegelGeo.setY(i, 10 + 160 * fbm(w * 3 + 10, 0.5, 1 << 20, 9, 3));
      }
    }
    this.umgebungBoden.add(meer, strasse, land, huegel);
    this.umgebungSzene.add(this.umgebungBoden);

    this.wolkenBauen();

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.himmelWuerfel = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
    this.wuerfelKamera = new THREE.CubeCamera(1, 50000, this.himmelWuerfel);
    DUNST.uHimmel.value = this.himmelWuerfel.texture;
  }

  // Meer wie gemalt: Farbe von Türkis in der Nähe zu Tiefblau in der Ferne,
  // Wellenflanken in zwei, drei Tönen, harte weiße Glitzer, wo eine Welle das
  // Licht zurückwirft; zum Horizont spiegelt es den Himmel.
  meerBauen() {
    this.wellenWerte = WELLEN.map(() => new THREE.Vector4());
    this.fahrtMeer = { value: 0 };
    this.meerZeit = { value: 0 };
    this.meerFarben = [{ value: new THREE.Color() }, { value: new THREE.Color() }, { value: new THREE.Color() }];
    this.glanzRichtung = { value: new THREE.Vector3(0, 1, 0) };
    const material = new THREE.ShaderMaterial({
      uniforms: {
        ...DUNST,
        uWelle: { value: this.wellenWerte }, uFahrtMeer: this.fahrtMeer, uMeerZeit: this.meerZeit,
        uNah: this.meerFarben[0], uFern: this.meerFarben[1], uHell: this.meerFarben[2], uGlanz: this.glanzRichtung,
      },
      vertexShader: `
varying vec3 vWelt;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWelt = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`,
      fragmentShader: `
${MEER_KOPF}
uniform samplerCube uHimmel;
uniform float uDunst;
uniform vec3 uNah;
uniform vec3 uFern;
uniform vec3 uHell;
uniform vec3 uGlanz;
varying vec3 vWelt;
void main() {
  vec3 blick = vWelt - cameraPosition;
  float weite = length(blick);
  vec3 v = blick / weite;
  vec2 p = vec2(vWelt.x + uFahrtMeer, vWelt.z);
  vec3 n = meerNormale(p);
  float fern = smoothstep(60.0, 3500.0, weite);
  vec3 c = mix(uNah, uFern, pow(fern, 0.6));
  c *= mix(1.08, 0.9, meerWind(p));
  // Zum Horizont spiegelt das Wasser den Himmel.
  vec3 r = reflect(v, n);
  vec3 himmelR = textureCube(uHimmel, normalize(vec3(r.x, abs(r.y) + 0.02, r.z))).rgb;
  float fres = pow(1.0 - max(dot(-v, n), 0.0), 5.0);
  c = mix(c, min(himmelR, vec3(0.9)), clamp(fres * 0.7, 0.0, 0.45));
  // Flanken, die zur Kamera kippen, heller; abgewandte dunkler; in Stufen.
  float kipp = dot(n.xz, -normalize(v.xz)) * 14.0;
  c *= 1.0 + 0.14 * smoothstep(0.25, 0.4, kipp) - 0.14 * smoothstep(-0.25, -0.4, kipp);
  // Glitzer: harte Funken.
  float g = dot(r, uGlanz);
  float funke = smoothstep(0.972, 0.978, g) * (1.0 - fern * 0.7);
  c = mix(c, uHell * 1.3, funke);
  // Dunst wie bei den anderen Flächen.
  vec3 himmel = textureCube(uHimmel, normalize(vec3(v.x, max(v.y, 0.0) + 0.012, v.z))).rgb;
  float dunst = 1.0 - exp(-weite * uDunst);
  c = mix(c, min(himmel, vec3(1.0 / max(1.0 - dunst, 0.02))), dunst);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    });
    const meer = new THREE.Mesh(new THREE.PlaneGeometry(60000, 25000), material);
    meer.rotation.x = -Math.PI / 2;
    meer.position.set(0, MEER, -12500 + 60);
    this.szene.add(meer);
  }

  // Dicke Haufenwolken über dem Horizont, die langsam ziehen.
  wolkenBauen() {
    const kugel = new THREE.IcosahedronGeometry(1, 3);
    // Wolken haben einen flachen Boden.
    const kp = kugel.attributes.position;
    for (let i = 0; i < kp.count; i++) kp.setY(i, Math.max(kp.getY(i), -0.35));
    kugel.computeVertexNormals();
    this.wolkenHell = mitDunst(toon({ color: 0xffffff, emissive: 0x9fc4ec, emissiveIntensity: 0.55 }), { name: 'wolke' });
    this.wolken = [];
    const r = zufall(91);
    for (let i = 0; i < 9; i++) {
      const wolke = new THREE.Group();
      const breite = 260 + r() * 420;
      for (let j = 0, n = 4 + Math.floor(r() * 4); j < n; j++) {
        const t = j / (n - 1) - 0.5;
        const ball = new THREE.Mesh(kugel, this.wolkenHell);
        const g = breite * (0.22 + 0.2 * (1 - Math.abs(t) * 1.6) + r() * 0.08);
        ball.scale.set(g * 1.2, g, g);
        ball.position.set(t * breite * 1.3, g * 0.35 + r() * g * 0.2, (r() - 0.5) * g);
        wolke.add(ball);
      }
      const z = -3500 - r() * 7000;
      wolke.position.set(0, MEER + 30 + r() * 0.035 * -z, z);
      this.szene.add(wolke);
      this.wolken.push({ wolke, x: (r() - 0.5) * 16000, tempo: 2 + r() * 4 });
    }
  }

  // Steilküste als Höhenfeld: eine Hochfläche mit Macchia, die zum Meer hin
  // in Felswänden abbricht; am Fuß der Wände läuft die Brandung.
  landmasse(breite, tiefe, hoehe, seed, rauh = 1) {
    const geo = new THREE.PlaneGeometry(breite, tiefe, 180, 72);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / breite, z = pos.getZ(i) / tiefe;
      // Abstand zum Rand der Insel, mit zerklüftetem Umriss.
      const w = Math.atan2(z, x);
      const umriss = 0.36 + 0.14 * fbm(Math.cos(w) * 2 + 9, Math.sin(w) * 2 + seed, 1 << 20, seed, 5);
      const innen = umriss - Math.hypot(x, z);
      const wand = glatt(0, 0.01 + 0.025 * rauschen(x * 9, z * 9, 1 << 20, seed + 2), innen);
      const kuppe = glatt(0.0, 0.34, innen) ** 1.3;
      const grat = 1 - Math.abs(2 * fbm(x * 5, z * 5, 1 << 20, seed + 5, 4) - 1);
      const relief = 0.5 + 0.6 * grat * rauh;
      const wandHoehe = 0.12 + 0.3 * rauschen((w / Math.PI) * 4, 0.5, 8, seed + 4);
      const y = innen < 0 ? -30 : hoehe * (wandHoehe * wand + 0.7 * kuppe * relief);
      pos.setY(i, y);
    }
    geo.computeVertexNormals();
    // Farben nach Steilheit: Fels in den Wänden, Macchia oben, Schaum am Fuß.
    const nrm = geo.attributes.normal;
    const farben = [];
    const fels = new THREE.Color(0xc0805a), hell = new THREE.Color(0xeab984);
    const gruen = new THREE.Color(0x3c8c3a), trocken = new THREE.Color(0x9ea24c);
    const c = new THREE.Color(), d = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / breite, y = pos.getY(i), z = pos.getZ(i) / tiefe;
      const steil = 1 - nrm.getY(i);
      // Schichten im Kalkstein, dazu dunkle Rinnen, wo Wasser herabläuft.
      const w = Math.atan2(z, x);
      c.copy(fels).lerp(hell, rauschen((w / Math.PI) * 12, y / 7, 24, seed + 7));
      c.multiplyScalar(0.8 + 0.3 * rauschen((w / Math.PI) * 180, y / 30, 360, seed + 8));
      d.copy(gruen).lerp(trocken, glatt(0.35, 0.75, fbm(x * 30, z * 30, 1 << 20, seed + 9, 4)));
      c.lerp(d, 1 - glatt(0.25, 0.55, steil));
      farben.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(farben, 3));
    return new THREE.Mesh(geo, this.landMaterial);
  }

  fernBauen() {
    this.landMaterial = mitDunst(toon({ vertexColors: true }), { name: 'land' });
    // x wandert mit der Fahrt und läuft nach `periode` Metern um.
    this.ferne = [];
    const setze = (mesh, x, z, periode) => {
      mesh.position.set(x, MEER, z);
      this.szene.add(mesh);
      this.ferne.push({ mesh, x, periode });
    };
    // Nahe Landzungen, gegenüber über die Bucht, und ferne Inseln.
    setze(this.landmasse(1800, 900, 170, 3), 900, -2300, 8400);
    setze(this.landmasse(2400, 1100, 240, 8), -3300, -3300, 8400);
    setze(this.landmasse(4800, 2000, 360, 13, 0.8), 5200, -6800, 16000);
    setze(this.landmasse(2600, 1200, 240, 21), -3800, -9500, 16000);
    setze(this.landmasse(1500, 800, 150, 34), 1200, -12500, 16000);
  }

  // Felsnadeln vor der Küste, mit Brandung am Fuß.
  felsnadel(hoehe, radius, seed) {
    const tief = 14;
    const geo = new THREE.CylinderGeometry(radius * 0.5, radius, hoehe + tief, 40, 28);
    geo.translate(0, (hoehe + tief) / 2 - tief, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-4) {
        pos.setY(i, y + radius * 0.25);
        continue;
      }
      const w = Math.atan2(z, x);
      const u = Math.cos(w) * 1.6 + y / 11, v = Math.sin(w) * 1.6 + seed;
      // Klüfte und Bänke: grobes Rauschen, dazu waagrechte Absätze.
      const k = 0.6 + 0.6 * fbm(u * 1.5, v * 1.5, 1 << 20, seed, 5) + 0.08 * Math.sin(y * 0.9 + seed);
      const kopf = y > hoehe - 0.5 ? 0.85 : 1;
      pos.setX(i, (x / r) * r * k * kopf);
      pos.setZ(i, (z / r) * r * k * kopf);
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal;
    const farben = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      c.set(0xb27650).lerp(new THREE.Color(0xdca472), rauschen(y / 3, pos.getX(i) / 7, 1 << 20, seed + 3));
      // Nass und dunkel an der Wasserlinie, oben etwas Grün.
      c.multiplyScalar(0.6 + 0.4 * glatt(0, 4, y));
      c.lerp(new THREE.Color(0x4a9a3c), glatt(0.6, 0.85, nrm.getY(i)) * glatt(hoehe * 0.6, hoehe, y));
      farben.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(farben, 3));
    return geo;
  }

  nadelnBauen() {
    const mittel = (this.mittel = new THREE.Group());
    this.szene.add(mittel);
    this.schaumFarbe = { value: new THREE.Color(1, 1, 1) };
    const nadeln = [
      // x, z, Höhe, Radius
      [-260, -330, 34, 11], [-232, -362, 14, 5.5], [-300, -300, 7, 3.5],
      [520, -620, 58, 19], [575, -585, 22, 8],
      [1180, -420, 26, 9],
      [1720, -880, 76, 26], [1790, -820, 30, 10], [1660, -830, 11, 4.5],
      [2150, -360, 9, 4],
    ];
    const r = zufall(41);
    for (const [x, z, hoehe, radius] of nadeln) {
      const seed = Math.floor(r() * 1000);
      const geo = this.felsnadel(hoehe, radius, seed);
      const schaum = new THREE.ShaderMaterial({
        vertexShader: SCHAUM_VERTEX,
        fragmentShader: SCHAUM_FRAGMENT,
        uniforms: { uZeit: this.meerZeit, uFarbe: this.schaumFarbe, uSaat: { value: r() * 50 } },
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -8,
        polygonOffsetUnits: -8,
      });
      // Drei Kopien, damit beim Umlaufen der Gruppe immer eine im Bild ist.
      for (const versatz of [-MITTEL, 0, MITTEL]) {
        const fels = new THREE.Mesh(geo, this.landMaterial);
        fels.position.set(x + versatz, MEER, z);
        fels.rotation.y = r() * 6.28;
        umreissen(fels, 1.6);
        const ring = new THREE.Mesh(new THREE.RingGeometry(1, 2.8, 64, 4), schaum);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x + versatz, MEER + 0.4, z);
        ring.scale.setScalar(radius * 0.95);
        mittel.add(fels, ring);
      }
    }
  }

  // Alles, was nah an der Straße liegt, in einer Gruppe, die sich mit der
  // Fahrt verschiebt und nach PERIODE Metern wiederholt.
  nahBauen() {
    const nah = (this.nah = new THREE.Group());
    const laenge = PERIODE * 3;
    this.szene.add(nah);
    const korn = (rx, rz) => {
      const t = this.korn.clone();
      t.repeat.set(rx, rz);
      t.needsUpdate = true;
      return t;
    };

    // Straße
    const strTex = strassenTextur(this.renderer);
    strTex.repeat.set(laenge / 18, 1);
    const strasse = new THREE.Mesh(new THREE.PlaneGeometry(laenge, STRASSE * 2), toon({ map: strTex, color: 0xa3acc8 }));
    strasse.rotation.x = -Math.PI / 2;
    strasse.receiveShadow = true;
    nah.add(strasse);

    // Schotterstreifen zu beiden Seiten.
    const schotter = (breite, z, farbe) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(laenge, breite), toon({ color: farbe, map: korn(laenge / 8, breite / 8) }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, -0.01, z);
      m.receiveShadow = true;
      nah.add(m);
    };
    schotter(-STRASSE - PLANKE + 0.6, (PLANKE - 0.6 - STRASSE) / 2, 0xd8c8a4);
    schotter(1.6, STRASSE + 0.7, 0xc2ae88);

    // Gelände als Höhenfeld mit Eckfarben.
    const gelaende = (tiefe, z0, nx, nz, hoeheBei, farbeBei, name) => {
      const geo = new THREE.PlaneGeometry(laenge, tiefe, nx, nz);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getZ(i) + z0;
        pos.setZ(i, z);
        pos.setY(i, hoeheBei(pos.getX(i), z));
      }
      geo.computeVertexNormals();
      const nrm = geo.attributes.normal;
      const farben = [];
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        farbeBei(c, pos.getX(i), pos.getY(i), pos.getZ(i), 1 - nrm.getY(i));
        farben.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(farben, 3));
      const m = new THREE.Mesh(geo, mitDunst(toon({ vertexColors: true, map: korn(laenge / 8, tiefe / 8) }), { name }));
      m.receiveShadow = true;
      nah.add(m);
      return m;
    };

    // Wo die Klippe abbricht: wandert mit dem Gelände um ein paar Meter.
    const kante = (x) => KANTE + (fbm(x / 24, 0.5, PERIODE / 24, 31, 3) - 0.5) * 5;
    this.kanteBei = kante;
    const felsFarbe = (c, x, y) => c.set(0xc48a5c).lerp(new THREE.Color(0xecbd88), rauschen(y / 2.5, x / 9, PERIODE / 9, 17));
    const macchia = (c, x, z) => c.set(0x4f9a3a).lerp(new THREE.Color(0xb4ab55), glatt(0.35, 0.65, fbm(x / 6, z / 6, PERIODE / 6, 12, 4)));

    // Meerseite: Kuppe hinter der Leitplanke, dann die Wand hinunter ins Meer.
    gelaende(70, PLANKE - 35 + 0.3, 288, 70, (x, z) => {
      const k = kante(x);
      const buckel = (fbm(x / 6, z / 6, PERIODE / 6, 4, 3) - 0.5) * 0.6;
      if (z > k) return -0.05 + buckel * glatt(PLANKE, PLANKE - 1.5, z) + 0.4 * glatt(PLANKE - 0.5, k + 1, z) * glatt(k - 0.5, k + 2, z);
      // Wand: steil, mit Absätzen und Vorsprüngen.
      const t = (k - z) / 9;
      const absatz = Math.floor(t * 5) / 5 * 0.4 + t * 0.6;
      const fels = (fbm(x / 8, z / 8, PERIODE / 8, 6, 4) - 0.5) * 4;
      return Math.min(0.3, -Math.min(1, absatz) * (-MEER + 6) + fels * Math.min(1, t * 3));
    }, (c, x, y, z, steil) => {
      macchia(c, x, z);
      const fels = new THREE.Color();
      felsFarbe(fels, x, y);
      c.lerp(fels, glatt(0.2, 0.45, steil));
      if (z > PLANKE - 1.2) c.set(0xd8c8a4);
    }, 'klippe');

    // Bergseite: Graben, dann der Hang hinauf zur Kamera.
    gelaende(44, STRASSE + 0.6 + 22, 288, 44, (x, z) => {
      const graben = -0.14 * Math.exp(-(((z - STRASSE - 1.9) / 0.35) ** 2));
      const hang = Math.max(0, z - STRASSE - 2.3);
      const fels = fbm(x / 9, z / 9, PERIODE / 9, 22, 4);
      return graben + hang * 0.16 + (fels - 0.5) * 0.9 * glatt(0, 6, hang);
    }, (c, x, y, z, steil) => {
      macchia(c, x, z);
      const fels = new THREE.Color();
      felsFarbe(fels, x, y);
      c.lerp(fels, glatt(0.15, 0.35, steil) * 0.8);
      if (z < STRASSE + 2.2) c.set(0xb39d78);
    }, 'hang');

    // Leitplanke: Stahlprofil mit zwei Sicken (W-Profil) auf Pfosten alle 4 m.
    const stahl = toon({ color: 0xe6ebf2, side: THREE.DoubleSide });
    const profil = [];
    const stufen = 16;
    for (let i = 0; i <= stufen; i++) {
      const v = i / stufen;
      const y = PLANKE_UNTEN + v * (PLANKE_OBEN - PLANKE_UNTEN);
      // Zur Straße hin gewölbt; oben und unten ein kleiner Bördelrand.
      const z = 0.045 * (0.5 - 0.5 * Math.cos(v * Math.PI * 4)) - (v < 0.04 || v > 0.96 ? 0.015 : 0);
      profil.push([y, z]);
    }
    const plankeGeo = new THREE.BufferGeometry();
    const ecken = [];
    const flaechen = [];
    for (let i = 0; i < profil.length; i++) {
      const [y, z] = profil[i];
      ecken.push(-laenge / 2, y, PLANKE + z, laenge / 2, y, PLANKE + z);
      if (i > 0) {
        const a = (i - 1) * 2;
        flaechen.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    plankeGeo.setAttribute('position', new THREE.Float32BufferAttribute(ecken, 3));
    plankeGeo.setIndex(flaechen);
    plankeGeo.computeVertexNormals();
    const planke = new THREE.Mesh(plankeGeo, stahl);
    nah.add(planke);
    // Dunkle Unterkante als Strich, wie gezeichnet.
    const kanteUnten = new THREE.Mesh(new THREE.BoxGeometry(laenge, 0.035, 0.07), new THREE.MeshBasicMaterial({ color: 0x3a4660 }));
    kanteUnten.position.set(0, PLANKE_UNTEN, PLANKE + 0.005);
    this.plankenStrich = kanteUnten.material;
    nah.add(kanteUnten);
    const pfostenZahl = laenge / 4;
    const pfosten = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, PLANKE_OBEN + 0.25, 0.12), toon({ color: 0x9aa4b6 }), pfostenZahl);
    // Rückstrahler auf jedem zweiten Pfosten, nachts im Scheinwerferlicht hell.
    const strahler = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.1, 0.01), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0 }), pfostenZahl / 2);
    this.strahler = strahler.material;
    const m = new THREE.Matrix4();
    for (let i = 0; i < pfostenZahl; i++) {
      m.makeTranslation(-laenge / 2 + i * 4, (PLANKE_OBEN + 0.25) / 2 - 0.25, PLANKE - 0.14);
      pfosten.setMatrixAt(i, m);
      if (i % 2 === 0) {
        m.makeTranslation(-laenge / 2 + i * 4, PLANKE_OBEN - 0.1, PLANKE + 0.052);
        strahler.setMatrixAt(i / 2, m);
      }
    }
    nah.add(pfosten, strahler);

    // Pflanzen und Steine: für eine Periode zufällig verteilt, dreimal gesetzt.
    const r = zufall(5);
    // Büsche: eine verbeulte Kugel. Die Normalen bleiben die der Kugel, so
    // wirkt sie weich wie Laub statt kantig.
    const busch = new THREE.IcosahedronGeometry(1, 2);
    const bp = busch.attributes.position;
    const bn = busch.attributes.normal;
    const buschFarben = [];
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
      const k = 0.7 + 0.55 * rauschen(x * 2.6 + 5, z * 2.6 + y * 1.9, 1 << 20, 3) + 0.12 * rauschen(x * 9, z * 9 + y * 7, 1 << 20, 4);
      bp.setXYZ(i, x * k, Math.max(-0.2, y * k), z * k);
      bn.setXYZ(i, x, y + 0.3, z);
      // Innen und unten dunkler, wie Laub, das sich selbst beschattet.
      const hell = (0.6 + 0.4 * glatt(-0.4, 0.9, y)) * (0.8 + 0.2 * rauschen(x * 4 + 1, z * 4 + y * 3, 1 << 20, 6));
      buschFarben.push(hell, hell, hell);
    }
    busch.normalizeNormals();
    busch.setAttribute('color', new THREE.Float32BufferAttribute(buschFarben, 3));
    const stein = new THREE.DodecahedronGeometry(1, 1);
    const sp = stein.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      const k = 0.7 + 0.45 * rauschen(x * 1.7 + 2, z * 1.7 + y * 1.3, 1 << 20, 9);
      sp.setXYZ(i, x * k, Math.max(-0.3, y * k * 0.7), z * k);
    }
    stein.computeVertexNormals();

    const buesche = [], steine = [];
    // Hinter der Leitplanke auf der Kuppe und an der Kante; ein paar
    // hängen in der Wand.
    for (let i = 0; i < 34; i++) {
      const x0 = (r() - 0.5) * PERIODE;
      const z0 = PLANKE - 1 - r() * (PLANKE - 1 - kante(x0) + 1);
      // Büschel aus ein paar Kugeln.
      for (let j = 0, n = 1 + Math.floor(r() * 3); j < n; j++) {
        const x = x0 + (r() - 0.5) * 1.6, z = z0 + (r() - 0.5) * 1.2;
        const s = 0.35 + r() * 0.5;
        buesche.push([x, z > kante(x) ? 0.05 : -1.2 - r() * 2, z, s * (1.1 + r() * 0.5), s * (0.75 + r() * 0.4), s * (1 + r() * 0.4)]);
      }
    }
    // Am Hang auf der Bergseite: nur niedrige, damit sie das Auto nicht verdecken.
    for (let i = 0; i < 40; i++) {
      const x = (r() - 0.5) * PERIODE;
      const z = STRASSE + 3 + r() * 16;
      const s = 0.3 + r() * 0.35;
      buesche.push([x, (z - STRASSE - 2.3) * 0.16 - 0.05, z, s * 1.5, s * 0.7, s * 1.2]);
    }
    for (let i = 0; i < 30; i++) {
      const x = (r() - 0.5) * PERIODE;
      const auf = r() < 0.5;
      const z = auf ? STRASSE + 2.4 + r() * 6 : PLANKE - 0.6 - r() * 2.5;
      const s = 0.12 + r() ** 2 * 0.5;
      const y = auf ? Math.max(0, z - STRASSE - 2.3) * 0.16 : 0;
      steine.push([x, y, z, s * (1 + r()), s, s * (1 + r() * 0.6)]);
    }
    const setzen = (geo, material, liste, farbe, schief = 0.3) => {
      const im = new THREE.InstancedMesh(geo, material, liste.length * 3);
      const q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
      let n = 0;
      for (const versatz of [-PERIODE, 0, PERIODE]) {
        const rr = zufall(9);
        for (const [x, y, z, sx, sy, sz] of liste) {
          q.setFromEuler(e.set((rr() - 0.5) * schief, rr() * 6.28, (rr() - 0.5) * schief));
          m.compose(new THREE.Vector3(x + versatz, y, z), q, new THREE.Vector3(sx, sy, sz));
          im.setMatrixAt(n, m);
          im.setColorAt(n, farbe(c, rr));
          n++;
        }
      }
      nah.add(im);
      return im;
    };
    umreissen(setzen(busch, mitWind(toon({ vertexColors: true }), 0.06), buesche, (c, rr) =>
      c.set(0x2f8a34).lerp(new THREE.Color(0x8fbf3e), rr() ** 2)), 1.5, 0.06);
    umreissen(setzen(stein, toon({}), steine, (c, rr) =>
      c.set(0xc9b49a).multiplyScalar(0.8 + rr() * 0.3)), 1.3);
    // Trockene Grasbüschel am Hang.
    const halm = new THREE.ConeGeometry(0.018, 1, 3, 1, true);
    halm.translate(0, 0.5, 0);
    const gras = [];
    for (let i = 0; i < 420; i++) {
      const x0 = (r() - 0.5) * PERIODE, z0 = STRASSE + 2.6 + r() ** 1.5 * 4;
      for (let j = 0; j < 7; j++) {
        const z = z0 + (r() - 0.5) * 0.25;
        gras.push([x0 + (r() - 0.5) * 0.25, Math.max(0, z - STRASSE - 2.3) * 0.16 - 0.03, z, 1, 0.1 + r() * 0.16, 1]);
      }
    }
    setzen(halm, mitWind(toon({}), 0.35), gras, (c, rr) =>
      c.set(0xd2bd5e).lerp(new THREE.Color(0x6fa33c), rr()), 0.9);
  }

  // Fahrtwind: helle Striche, die am Auto vorbei nach hinten fliegen, wie in
  // einem Zeichentrickfilm. Je schneller, desto deutlicher.
  fahrtwindBauen() {
    const c = leinwand(128, 4);
    const g = c.getContext('2d');
    const v = g.createLinearGradient(0, 0, 128, 0);
    v.addColorStop(0, 'rgba(255,255,255,0)');
    v.addColorStop(0.75, 'rgba(255,255,255,0.9)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v;
    g.fillRect(0, 0, 128, 4);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1);
    this.striche = [];
    const r = (this.windZufall = zufall(5));
    for (let i = 0; i < 9; i++) {
      const strich = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, color: 0xffffff }));
      strich.renderOrder = 2;
      this.szene.add(strich);
      this.striche.push(strich);
      this.strichSetzen(strich, -12 + r() * 16);
    }
  }

  strichSetzen(strich, x) {
    const r = this.windZufall;
    const ueber = r() < 0.35;
    // Über dem Dach oder an der Flanke vorbei, ein Stück vor dem Auto.
    strich.position.set(x, ueber ? 1.45 + r() * 0.5 : 0.2 + r() * 0.85, SPUR + (ueber ? 0 : 1.05 + r() * 0.3));
    strich.scale.set(1.6 + r() * 2.8, 0.05 + r() * 0.04, 1);
    strich.userData.tempo = 1 + r() * 0.5;
  }

  fahrtwind(s) {
    const deutlich = glatt(12, 28, this.tempo) * 0.85;
    for (const strich of this.striche) {
      strich.position.x -= s * (this.tempo * 0.9 * strich.userData.tempo + 6);
      if (strich.position.x < -9) this.strichSetzen(strich, 3 + this.windZufall() * 4);
      // Am Anfang und Ende der Bahn ein- und ausblenden.
      strich.material.opacity = deutlich * glatt(4, 2, strich.position.x) * glatt(-9, -5, strich.position.x);
    }
  }

  // Möwen, die mit dem Auto über dem Abgrund segeln.
  moewenBauen() {
    const koerper = new THREE.ConeGeometry(0.07, 0.45, 6);
    koerper.rotateZ(-Math.PI / 2);
    const fluegel = new THREE.BufferGeometry();
    // Ein Flügel von der Schulter (0) bis zur Spitze (+z), leicht geknickt.
    fluegel.setAttribute('position', new THREE.Float32BufferAttribute([
      0.1, 0, 0, -0.1, 0, 0, 0.12, 0.08, 0.3,
      -0.1, 0, 0, -0.06, 0.08, 0.3, 0.12, 0.08, 0.3,
      0.12, 0.08, 0.3, -0.06, 0.08, 0.3, -0.16, -0.02, 0.68,
    ], 3));
    fluegel.setAttribute('color', new THREE.Float32BufferAttribute([
      1, 1, 1, 1, 1, 1, 0.75, 0.77, 0.8,
      1, 1, 1, 0.75, 0.77, 0.8, 0.75, 0.77, 0.8,
      0.75, 0.77, 0.8, 0.75, 0.77, 0.8, 0.08, 0.08, 0.09,
    ], 3));
    fluegel.computeVertexNormals();
    const weiss = toon({ color: 0xffffff });
    const fluegelMat = toon({ vertexColors: true, side: THREE.DoubleSide });
    this.moewen = [];
    const r = zufall(77);
    for (let i = 0; i < 4; i++) {
      const moewe = new THREE.Group();
      moewe.add(new THREE.Mesh(koerper, weiss));
      const links = new THREE.Mesh(fluegel, fluegelMat);
      const rechts = new THREE.Mesh(fluegel, fluegelMat);
      rechts.scale.z = -1;
      moewe.add(links, rechts);
      moewe.scale.setScalar(1.5);
      this.szene.add(moewe);
      this.moewen.push({
        moewe, links, rechts,
        mitte: new THREE.Vector3(-22 + i * 15 + r() * 6, 4 + r() * 7, -16 - r() * 26),
        weite: [8 + r() * 10, 1 + r() * 2, 4 + r() * 6],
        tempo: [0.05 + r() * 0.05, 0.13 + r() * 0.1, 0.07 + r() * 0.05],
        phase: r() * 100,
      });
    }
  }

  moewenFliegen(t) {
    const p = new THREE.Vector3(), q = new THREE.Vector3(), w = new THREE.Vector3();
    const ort = (m, t, v) => v.set(
      m.mitte.x + Math.sin(t * m.tempo[0] + m.phase) * m.weite[0],
      m.mitte.y + Math.sin(t * m.tempo[1] + m.phase * 1.3) * m.weite[1],
      m.mitte.z + Math.sin(t * m.tempo[2] + m.phase * 0.7) * m.weite[2],
    );
    for (const m of this.moewen) {
      ort(m, t, p);
      ort(m, t + 0.4, q);
      m.moewe.position.copy(p);
      // Sie fliegen mit dem Auto, also im Grunde in Fahrtrichtung; dazu ihre
      // eigene Bewegung relativ zur Kamera. Kurs, Steigen und Schräglage.
      const dx = q.x - p.x + this.tempo * 0.4, dz = q.z - p.z, dy = q.y - p.y;
      const kurs = -Math.atan2(dz, dx);
      ort(m, t + 0.8, w);
      const kurve = -Math.atan2(w.z - q.z, w.x - q.x + this.tempo * 0.4) - kurs;
      m.moewe.rotation.set(Math.max(-0.6, Math.min(0.6, kurve * 6)), kurs, Math.atan2(dy, Math.hypot(dx, dz)), 'YZX');
      // Meist gleiten, ab und zu ein paar Flügelschläge.
      const schlagen = glatt(0.55, 0.8, Math.sin(t * 0.37 + m.phase * 2));
      const schlag = Math.sin(t * 11 + m.phase) * 0.6 * schlagen + 0.12;
      m.links.rotation.x = -schlag;
      m.rechts.rotation.x = schlag;
    }
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
    // Himmel von oben, warmer Boden von unten: füllt die Schatten farbig.
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x9a7a52, 1.2);
    this.szene.add(sonne, sonne.target, this.aufheller, this.aufheller.target, this.hemi);
  }

  stimmungSetzen(dunkel) {
    this.dunkel = dunkel;
    const s = (this.stimmung = dunkel ? STIMMUNGEN.dunkel : STIMMUNGEN.hell);
    const [hoehe, richtung] = s.sonne;
    const richtungSonne = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - hoehe), THREE.MathUtils.degToRad(180 - richtung));
    for (const himmel of [this.himmel, this.umgebungHimmel]) {
      const u = himmel.material.uniforms;
      u.uOben.value.set(s.himmel[0]);
      u.uMitte.value.set(s.himmel[1]);
      u.uHorizont.value.set(s.himmel[2]);
      u.uSonne.value.copy(richtungSonne);
      u.uSonnenFarbe.value.set(s.sonnenFarbe);
      u.uScheibe.value = himmel === this.himmel ? s.scheibe : 0;
    }
    this.hemi.color.set(s.hemi[0]);
    this.hemi.groundColor.set(s.hemi[1]);
    this.hemi.intensity = s.hemi[2];
    this.meerFarben[0].value.set(s.meer[0]);
    this.meerFarben[1].value.set(s.meer[1]);
    this.meerFarben[2].value.set(s.meer[2]);
    this.glanzRichtung.value.set(...s.glanz).normalize();
    this.wolkenHell.color.set(s.wolke[0]);
    this.wolkenHell.emissive.set(s.wolke[1]);
    UMRISS.uFarbe.value.set(s.umriss);
    this.renderer.toneMappingExposure = s.belichtung;
    this.sonne.color.set(s.licht);
    this.sonne.intensity = s.lichtStaerke;
    this.aufheller.intensity = s.aufheller;
    this.schaumFarbe.value.setRGB(...s.schaum);
    this.strahler.emissiveIntensity = dunkel ? 0.8 : 0;
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
    const lackToon = mitGlanz(toon({ color: 0x24479c }));
    const scheibeToon = mitGlanz(toon({ color: 0x1a2236 }));
    const umrisse = [];
    modell.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const m = o.material;
      switch (m.name) {
        case 'paint':
          // Lack in Stufen wie gezeichnet, dazu ein harter Glanzstreifen.
          o.material = lackToon;
          umrisse.push(o);
          break;
        case 'window':
          o.material = scheibeToon;
          umrisse.push(o);
          break;
        case 'plastic':
        case 'full_black':
        case 'silver':
          umrisse.push(o);
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

    for (const o of umrisse) umreissen(o, 1.4);

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
          if (t === reifen) umreissen(teil, 1.4);
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
    UMRISS.uPixel.value.set(2 / (breite * skala), 2 / (hoehe * skala));
  }

  // Bildausschnitt wie aus einer Drohne über dem Hang: das Auto in der Mitte
  // der freien Fläche (auf dem Mac rechts neben der App), im unteren Teil des
  // Bildes; darüber die Leitplanke, das Meer tief unten und der Horizont.
  kameraSetzen(frei, neigung, schwanken) {
    const [W, H] = this.bildgroesse;
    const breite = Math.max(1, W - frei);
    const format = breite / H;
    // Hochkant etwas weiter, quer eher Tele.
    const fov = 24 + 12 * glatt(1.0, 0.45, format);
    const tanHalb = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const anteil = Math.min(0.84, Math.max(0.48, 0.96 - 0.32 * format));
    const brennweitePx = H / 2 / tanHalb;
    const abstand = (4.6 * brennweitePx) / (anteil * breite);

    // Die Kamera fährt mal etwas vor, mal zurück, als hielte die Drohne
    // nicht ganz das Tempo. Das Auto selbst bleibt stehen, so passt sein
    // Schatten, ohne ihn jedes Bild neu zu rechnen.
    // Wie weit, hängt am Rand, den das Bild neben dem Auto lässt.
    const spiel = Math.max(0, 4.6 / anteil - 4.6) * 0.25;
    const ziel = new THREE.Vector3(0.15 - schwanken[2] * spiel, 0.62, SPUR);
    const drehung = THREE.MathUtils.degToRad(neigung[0] * 5 + schwanken[0]);
    const quer = abstand * Math.cos(drehung);

    // Höhe: so hoch, dass die Leitplanke im Bild ganz über dem Dach
    // durchläuft und nicht durch Dach oder Scheiben schneidet (Unterkante der
    // Planke mindestens `luft` über dem Dach).
    const tiefe = SPUR - PLANKE;
    const luft = 0.014;
    const mindest = (DACH * (quer + tiefe) - PLANKE_UNTEN * quer + luft * quer * (quer + tiefe)) / tiefe;
    // Gewünscht: Auto bei AUTO_Y, Horizont bei HORIZONT_Y der Bildhöhe.
    const wunsch = ziel.y + quer * ((AUTO_Y - HORIZONT_Y) * 2 * tanHalb + neigung[1] * 0.045);
    const hoehe = Math.max(mindest, wunsch) + Math.max(0, schwanken[1]);

    const k = this.kamera;
    k.position.set(ziel.x + Math.sin(drehung) * abstand, hoehe, ziel.z + quer);
    k.lookAt(ziel);

    // Der Horizont soll knapp unter dem oberen Rand stehen, das Auto liegt
    // dann so tief, wie der Blickwinkel es verlangt.
    const steigung = (hoehe - ziel.y) / abstand;
    const cx = frei + breite / 2;
    const cy = H * Math.min(0.74, Math.max(0.56, HORIZONT_Y + steigung / (2 * tanHalb)));
    const fw = 2 * Math.max(cx, W - cx);
    const fh = 2 * Math.max(cy, H - cy);
    k.fov = THREE.MathUtils.radToDeg(2 * Math.atan(tanHalb * (fh / H)));
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
    this.mittel.position.x = -(this.fahrt % MITTEL);
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
    WIND.uWind.value = this.zeit % 1000;
    for (const w of this.wolken) w.wolke.position.x = ((((w.x + this.zeit * w.tempo) % 16000) + 24000) % 16000) - 8000;

    // Kamera: ruhige Fahraufnahme, leichtes Schwanken wie von einer Drohne.
    const t = this.zeit;
    const ruhig = z.ruhe ? 0.2 : 1;
    const schwanken = [
      (Math.sin(t * 0.071) * 3 + Math.sin(t * 0.23 + 1) * 0.6) * ruhig,
      (Math.sin(t * 1.3) * 0.02 + Math.sin(t * 0.37 + 2) * 0.12 + 0.12) * ruhig,
      (Math.sin(t * 0.043) * 0.75 + Math.sin(t * 0.11 + 1.3) * 0.25) * ruhig,
    ];
    this.kameraSetzen(z.frei, z.neigung, schwanken);
    this.moewenFliegen(t);
    this.fahrtwind(s);

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
        // sieht dagegen aus wie ein Rad, das sich schnell vorwärts dreht;
        // den Rest erzählt die verwischte Felge.
        rad.winkel = (rad.winkel - Math.min((v / rad.radius) * s, 0.17)) % (Math.PI * 2);
        rad.nabe.rotation.z = rad.winkel;
      }
      const schleier = glatt(6, 22, v) * 0.7;
      for (const m of this.schleier) m.opacity = schleier;
    }

    this.renderer.render(this.szene, this.kamera);
    if (!this.canvas.classList.contains('bereit')) this.canvas.classList.add('bereit');
  }
}
