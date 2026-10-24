// Hintergrund „Küste“: ein Porsche 911 Carrera 4S in Navy fährt eine
// kurvige Küstenstraße hoch über dem Meer entlang, wie an der Amalfiküste:
// Bruchsteinmauer, Zypressen, Felsnadeln in der Brandung, gegenüber
// Steilküsten mit bunten Dörfern und Serpentinen, Boote, Möwen. Das Auto ist
// fotografisch, die Welt drumherum gezeichnet wie ein Zeichentrickfilm: Licht
// in Stufen, satte Farben, dunkle Umrisse, gemalter Himmel mit Wolken,
// Fahrtwind-Striche. Hell ist Nachmittag, im Dunkeln geht die Sonne unter und
// am Auto brennt Licht. Die Kamera schwebt schräg hinter dem Auto und schaut
// die Straße entlang aufs Meer.
//
// Das Auto steht, die Welt läuft: Straße, Mauer, Klippe, Berg und Pflanzen
// liegen in einer Gruppe, die sich um die gefahrene Strecke verschiebt und
// sich alle PERIODE Meter wiederholt; die Felsnadeln ebenso alle MITTEL Meter.
// Die Straße schlängelt sich (kurve), und die ganze Welt dreht sich so um das
// Auto, dass es immer der Straße folgt. Das Meer verschiebt seine Wellen im
// Shader, ferne Küsten wandern langsam durchs Bild. Wie schnell gefahren
// wird, hängt am Session-Status.
//
// three.js liegt gebündelt in vendor/ (scripts/kapsel-three.mjs), das Modell
// in modelle/ (scripts/kapsel-modell.mjs, Lizenz in modelle/LIZENZ.md).

import * as THREE from '../vendor/three-r186.min.js';

const MODELL = 'modelle/porsche-911-navy-1.glb';

// Welt in Metern: x Fahrtrichtung, y oben, z zur Kamera (Bergseite);
// das Meer liegt bei -z, tief unter der Straße.
const SPUR = 1.75; // Mitte der Fahrspur, auf der das Auto fährt
const STRASSE = 4.5; // halbe Breite von Rand zu Rand
const MAUER = -STRASSE - 3.2; // Straßenseite der Brüstung hinter dem Schotter
const MAUER_HOCH = 0.72;
const DACH = 1.32; // höchster Punkt des Autos
const KANTE = -STRASSE - 7.5; // Abbruchkante der Klippe (wandert um ±2,5 m)
const MEER = -75; // Meeresspiegel tief unter der Straße
const BLICK = -50; // Kamera schräg hinter dem Auto, Grad (0 = genau von der Seite)
const AUTO_Y = 0.66; // wo Auto und Horizont im Bild stehen (Anteil der Höhe)
const HORIZONT_Y = 0.16;
const PERIODE = 288; // Wiederholung der nahen Welt; Vielfaches aller Muster
// Die Straße schlängelt sich: Versatz zur Seite über die Strecke, periodisch.
const KURVE = [12, 4];
const kurve = (x) => KURVE[0] * Math.sin((2 * Math.PI * x) / PERIODE) + KURVE[1] * Math.sin((4 * Math.PI * x) / PERIODE + 1.3);
const kurveSteigung = (x) =>
  ((2 * Math.PI) / PERIODE) * (KURVE[0] * Math.cos((2 * Math.PI * x) / PERIODE) + 2 * KURVE[1] * Math.cos((4 * Math.PI * x) / PERIODE + 1.3));
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

// Bruchsteinmauer wie an der Amalfiküste: warme Steine, helle Fugen.
// 3 m × 0,72 m, in Fahrtrichtung kachelbar.
function mauerTextur(renderer) {
  const w = 512, h = 128;
  const c = leinwand(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#efe4cf';
  g.fillRect(0, 0, w, h);
  const r = zufall(31);
  const farben = ['#d8b98c', '#cfa977', '#e2c79c', '#c49a6c', '#dcc09a', '#b98f63'];
  for (let y = 0, reihe = 0; y < h; reihe++) {
    const hoehe = 22 + r() * 16;
    for (let x = -r() * 40; x < w; ) {
      const breite = 34 + r() * 46;
      g.fillStyle = farben[Math.floor(r() * farben.length)];
      const rx = Math.max(0, x + 3), rw = Math.min(w, x + breite - 3) - rx;
      if (rw > 4) {
        g.beginPath();
        g.roundRect(rx, y + 3, rw, hoehe - 6, 7);
        g.fill();
      }
      x += breite;
    }
    y += hoehe;
  }
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
    // Alles, was zur Landschaft gehört, liegt in der Welt-Gruppe. Sie dreht
    // und verschiebt sich so, dass die kurvige Straße unter dem Auto immer
    // geradeaus zeigt: Das Auto steht, die Welt schwenkt um es herum.
    this.welt = new THREE.Group();
    this.szene.add(this.welt);

    this.himmelBauen();
    this.meerBauen();
    this.fernBauen();
    this.nadelnBauen();
    this.nahBauen();
    this.booteBauen();
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
    const meer = new THREE.Mesh(new THREE.PlaneGeometry(60000, 30000), material);
    meer.rotation.x = -Math.PI / 2;
    meer.position.set(0, MEER, -15000 + 3000);
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
      wolke.position.set(0, MEER + 60 + r() * 0.035 * -z, z);
      this.welt.add(wolke);
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
    return new THREE.Mesh(geo, this.kuestenMaterial);
  }

  // Ein Dorf wie Positano: bunte Würfelhäuser, die am Hang übereinander
  // kleben, zur Bucht hin.
  dorf(land, anzahl, seed, mitte, radius) {
    const pos = land.geometry.attributes.position, nrm = land.geometry.attributes.normal;
    const kandidaten = [];
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - mitte[0], dz = pos.getZ(i) - mitte[1];
      if (Math.hypot(dx, dz * 1.6) > radius) continue;
      const y = pos.getY(i);
      if (y < 6 || nrm.getY(i) < 0.35 || nrm.getZ(i) < 0.15) continue;
      kandidaten.push(i);
    }
    if (!kandidaten.length) return;
    const haus = new THREE.BoxGeometry(1, 1, 1);
    haus.translate(0, 0.5, 0);
    const haeuser = new THREE.InstancedMesh(haus, mitDunst(toon({}), { name: 'dorf' }), anzahl);
    const r = zufall(seed);
    const farben = [0xfbf6ec, 0xf6e6c4, 0xf3c48f, 0xeea7a0, 0xe08a5e, 0xf7e27e, 0xc7e0ea, 0xfbf6ec];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    for (let n = 0; n < anzahl; n++) {
      const i = kandidaten[Math.floor(r() * kandidaten.length)];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (r() - 0.5) * 0.5);
      const b = 9 + r() * 9;
      m.compose(new THREE.Vector3(pos.getX(i) + (r() - 0.5) * 8, pos.getY(i) - 4, pos.getZ(i) + (r() - 0.5) * 8), q, new THREE.Vector3(b, 9 + r() * 9, 8 + r() * 6));
      haeuser.setMatrixAt(n, m);
      haeuser.setColorAt(n, c.set(farben[Math.floor(r() * farben.length)]));
    }
    land.add(haeuser);
  }

  fernBauen() {
    this.landMaterial = mitDunst(toon({ vertexColors: true }), { name: 'land' });
    // Die Küsten gegenüber tragen eine Straße, die den Höhenlinien folgt
    // und sich mit weißer Brüstung um jede Bucht schlängelt.
    this.kuestenMaterial = mitDunst(toon({ vertexColors: true }), {
      name: 'kueste',
      kopf: `uniform float uStrassenHoehe;`,
      uniforms: { uStrassenHoehe: { value: MEER + 70 } },
      ersetzen: [['#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 nWelt = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
  float hang = smoothstep(0.25, 0.4, nWelt.y) * (1.0 - smoothstep(0.93, 0.98, nWelt.y));
  float h = vWelt.y - uStrassenHoehe - 6.0 * sin(vWelt.x * 0.004) - 3.0 * sin(vWelt.z * 0.011);
  float h2 = h - 85.0;
  float b = fwidth(h) + 0.01;
  float strasse = max(1.0 - smoothstep(2.2, 2.2 + b, abs(h)), 1.0 - smoothstep(2.0, 2.0 + b, abs(h2)));
  float mauer = max(1.0 - smoothstep(0.7, 0.7 + b, abs(h + 3.0)), 1.0 - smoothstep(0.6, 0.6 + b, abs(h2 + 2.8)));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.33, 0.38), strasse * hang);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.93, 0.88), mauer * hang);
}`]],
    });
    // x wandert mit der Fahrt und läuft nach `periode` Metern um.
    this.ferne = [];
    const setze = (mesh, x, z, periode) => {
      mesh.position.set(x, MEER, z);
      this.welt.add(mesh);
      this.ferne.push({ mesh, x, periode });
      return mesh;
    };
    // Hohe Landzungen gegenüber über die Bucht, mit Dörfern; dahinter Inseln.
    const a = setze(this.landmasse(2200, 1000, 330, 3), 900, -2100, 8400);
    this.dorf(a, 170, 7, [-150, 230], 380);
    const b = setze(this.landmasse(2600, 1200, 400, 8), -3300, -3000, 8400);
    this.dorf(b, 140, 9, [250, 280], 420);
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
    this.welt.add(mittel);
    this.schaumFarbe = { value: new THREE.Color(1, 1, 1) };
    const nadeln = [
      // x, z, Höhe, Radius
      [-260, -820, 60, 18], [-215, -870, 24, 8], [-310, -780, 12, 5],
      [520, -1150, 95, 28], [600, -1100, 36, 12],
      [1180, -700, 40, 13],
      [1720, -1400, 120, 36], [1820, -1320, 46, 15], [1640, -1340, 18, 7],
      [2150, -620, 16, 6],
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
  // Fahrt verschiebt und nach PERIODE Metern wiederholt. Gebaut wird gerade
  // entlang x; am Ende biegt `biegen` alles auf die kurvige Straße.
  nahBauen() {
    const nah = (this.nah = new THREE.Group());
    // Fünf Perioden: Die Kamera schaut die Straße entlang, weit voraus.
    const laenge = PERIODE * 5;
    const teile = laenge / 2;
    this.welt.add(nah);
    const korn = (rx, rz) => {
      const t = this.korn.clone();
      t.repeat.set(rx, rz);
      t.needsUpdate = true;
      return t;
    };

    // Straße
    const strTex = strassenTextur(this.renderer);
    strTex.repeat.set(laenge / 18, 1);
    const strasse = new THREE.Mesh(new THREE.PlaneGeometry(laenge, STRASSE * 2, teile, 1), toon({ map: strTex, color: 0xa3acc8 }));
    strasse.rotation.x = -Math.PI / 2;
    strasse.receiveShadow = true;
    nah.add(strasse);

    // Schotterstreifen zu beiden Seiten.
    const schotter = (breite, z, farbe) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(laenge, breite, teile, 1), toon({ color: farbe, map: korn(laenge / 8, breite / 8) }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, -0.01, z);
      m.receiveShadow = true;
      nah.add(m);
    };
    schotter(-STRASSE - MAUER + 0.6, (MAUER - 0.6 - STRASSE) / 2, 0xd8c8a4);
    schotter(1.6, STRASSE + 0.7, 0xc2ae88);

    // Gelände als Höhenfeld mit Eckfarben.
    // Von zNah (an der Straße) bis zFern; `dichte` > 1 legt die Gitterlinien
    // an der Straße dichter, wo genau hingesehen wird.
    const gelaende = (zNah, zFern, nz, hoeheBei, farbeBei, name, dichte = 1, nx = teile) => {
      const tiefe = Math.abs(zFern - zNah);
      const geo = new THREE.PlaneGeometry(laenge, tiefe, nx, nz);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        // Die Reihenfolge der Zeilen bleibt erhalten, sonst kippten die Flächen.
        const v = zFern > zNah ? pos.getZ(i) / tiefe + 0.5 : 0.5 - pos.getZ(i) / tiefe;
        const z = zNah + (zFern - zNah) * v ** dichte;
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
    const felsFarbe = (c, x, y) => c.set(0xc48a5c).lerp(new THREE.Color(0xecbd88), rauschen(y / 4, x / 9, PERIODE / 9, 17));
    const macchia = (c, x, z) => c.set(0x4f9a3a).lerp(new THREE.Color(0xb4ab55), glatt(0.35, 0.65, fbm(x / 6, z / 6, PERIODE / 6, 12, 4)));

    // Meerseite: ein schmaler Streifen hinter der Mauer, dann die Wand
    // senkrecht hinunter ins Meer, mit Bändern und Vorsprüngen.
    const klippe = (x, z) => {
      const k = kante(x);
      const buckel = (fbm(x / 6, z / 6, PERIODE / 6, 4, 3) - 0.5) * 0.6;
      if (z > k) return -0.05 + buckel * glatt(MAUER, MAUER - 1.5, z) + 0.4 * glatt(MAUER - 0.8, k + 1, z) * glatt(k - 0.5, k + 2, z);
      const t = (k - z) / 26;
      const absatz = (Math.floor(t * 6) / 6) * 0.45 + t * 0.55;
      const fels = (fbm(x / 8, z / 8, PERIODE / 8, 6, 4) - 0.5) * 7;
      return Math.min(0.3, -Math.min(1, absatz) * (-MEER + 8) + fels * Math.min(1, t * 3));
    };
    gelaende(MAUER - 0.3, MAUER - 130, 72, klippe, (c, x, y, z, steil) => {
      macchia(c, x, z);
      const fels = new THREE.Color();
      felsFarbe(fels, x, y);
      c.lerp(fels, glatt(0.2, 0.45, steil));
      if (z > MAUER - 1.2) c.set(0xd8c8a4);
    }, 'klippe');

    // Brandung am Fuß der Wand: Uferlinie suchen, Schaumband darauf legen.
    const ufer = [];
    for (let i = 0; i <= teile; i++) {
      const x = -laenge / 2 + (i * laenge) / teile;
      let z = kante(x);
      while (klippe(x, z) > MEER && z > kante(x) - 60) z -= 0.25;
      ufer.push([x, z]);
    }
    const uferGeo = new THREE.BufferGeometry();
    const ecken = [], uv = [], flaechen = [];
    for (let i = 0; i < ufer.length; i++) {
      const [x, z] = ufer[i];
      ecken.push(x, MEER + 0.3, z + 1.5, x, MEER + 0.3, z - 12);
      uv.push(0, 0, 0, 1);
      if (i > 0) {
        const a = (i - 1) * 2;
        flaechen.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    uferGeo.setAttribute('position', new THREE.Float32BufferAttribute(ecken, 3));
    uferGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    uferGeo.setIndex(flaechen);
    uferGeo.computeVertexNormals();
    nah.add(new THREE.Mesh(uferGeo, new THREE.ShaderMaterial({
      uniforms: { uZeit: this.meerZeit, uFarbe: this.schaumFarbe },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -8,
      polygonOffsetUnits: -8,
      vertexShader: `
varying vec2 vP;
void main() {
  vP = vec2(position.x, uv.y);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
      fragmentShader: `
uniform float uZeit;
uniform vec3 uFarbe;
varying vec2 vP;
float uferHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float uferRauschen(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(uferHash(i), uferHash(i + vec2(1, 0)), u.x), mix(uferHash(i + vec2(0, 1)), uferHash(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  // Wellen laufen an und ziehen sich als Schaumfront zurück.
  float zyklus = fract(uZeit * 0.12 + uferRauschen(vec2(vP.x * 0.03, 0.0)) * 0.6);
  float front = 0.1 + zyklus * 0.7;
  float spitze = uferRauschen(vec2(vP.x * 0.4, vP.y * 9.0 + uZeit * 0.3)) * 0.6 + uferRauschen(vec2(vP.x * 1.3, vP.y * 25.0 - uZeit * 0.2)) * 0.4;
  float a = exp(-pow((vP.y - front) / (0.03 + zyklus * 0.08), 2.0)) * (1.0 - zyklus) * (0.6 + 0.7 * spitze);
  a += smoothstep(0.42, 0.72, spitze) * smoothstep(front + 0.05, front - 0.3, vP.y) * 0.5;
  a += smoothstep(0.2, 0.05, vP.y) * (0.5 + 0.5 * spitze);
  gl_FragColor = vec4(uFarbe, clamp(a, 0.0, 0.9));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
    })));

    // Bergseite: Graben, ein flacher Hang unter der Kamera, dahinter steigt
    // der Berg steil an, mit Terrassen, Rinnen und Graten.
    const berg = (x, z) => {
      const graben = -0.14 * Math.exp(-(((z - STRASSE - 1.9) / 0.35) ** 2));
      const hang = Math.max(0, z - STRASSE - 2.3);
      const fels = fbm(x / 9, z / 9, PERIODE / 9, 22, 4);
      const rinne = fbm(x / 48, 0.5, PERIODE / 48, 41, 3);
      const steil = Math.max(0, z - 26) ** 1.25 * (0.55 + 0.7 * rinne) + Math.max(0, z - 90) * 0.6;
      return graben + hang * 0.16 + (fels - 0.5) * 0.9 * glatt(0, 6, hang) + steil + (fbm(x / 24, z / 24, PERIODE / 24, 43, 4) - 0.5) * 30 * glatt(30, 90, z);
    };
    gelaende(STRASSE + 0.6, STRASSE + 360, 90, berg, (c, x, y, z, steil) => {
      macchia(c, x, z);
      // Zitronenterrassen: Höhenstreifen mit dunkleren Mäuerchen.
      if (z > 30 && steil < 0.55) c.lerp(new THREE.Color(0x3f8f2f), 0.5).multiplyScalar(0.8 + 0.25 * glatt(0.75, 0.9, (((y / 4) % 1) + 1) % 1));
      const fels = new THREE.Color();
      felsFarbe(fels, x, y);
      c.lerp(fels, glatt(0.35, 0.6, steil));
      if (z < STRASSE + 2.2) c.set(0xb39d78);
    }, 'hang', 2.2, teile / 2);

    // Brüstung: niedrige Bruchsteinmauer mit weiß verputzter Abdeckung.
    const mauerTex = mauerTextur(this.renderer);
    mauerTex.repeat.set(laenge / 3, 1);
    const mauer = new THREE.Mesh(new THREE.BoxGeometry(laenge, MAUER_HOCH, 0.42, teile, 1, 1), toon({ map: mauerTex }));
    mauer.position.set(0, MAUER_HOCH / 2 - 0.05, MAUER - 0.21);
    const deckel = new THREE.Mesh(new THREE.BoxGeometry(laenge, 0.09, 0.52, teile, 1, 1), toon({ color: 0xfbf7ee }));
    deckel.position.set(0, MAUER_HOCH, MAUER - 0.21);
    nah.add(mauer, deckel);

    // Pflanzen und Steine: für eine Periode zufällig verteilt, dreimal gesetzt.
    const r = zufall(5);
    // Büsche: eine verbeulte Kugel. Die Normalen bleiben die der Kugel, so
    // wirkt sie weich wie Laub statt kantig.
    const busch = new THREE.IcosahedronGeometry(1, 1);
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
    const stein = new THREE.DodecahedronGeometry(1, 0);
    const sp = stein.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      const k = 0.7 + 0.45 * rauschen(x * 1.7 + 2, z * 1.7 + y * 1.3, 1 << 20, 9);
      sp.setXYZ(i, x * k, Math.max(-0.3, y * k * 0.7), z * k);
    }
    stein.computeVertexNormals();
    // Zypresse: schlanke Flamme.
    const zypresse = new THREE.LatheGeometry(
      Array.from({ length: 12 }, (_, i) => {
        const v = i / 11;
        return new THREE.Vector2(Math.max(0.001, Math.sin(Math.PI * Math.min(1, v * 1.15)) ** 0.8 * (1 - 0.45 * v)), v);
      }),
      10,
    );
    zypresse.computeVertexNormals();

    const buesche = [], steine = [], zypressen = [];
    // Hinter der Mauer auf dem Streifen bis zur Kante; ein paar hängen in der Wand.
    for (let i = 0; i < 64; i++) {
      const x0 = (r() - 0.5) * PERIODE;
      const z0 = MAUER - 1.8 - r() * (MAUER - 1.8 - kante(x0) + 1);
      for (let j = 0, n = 1 + Math.floor(r() * 3); j < n; j++) {
        const x = x0 + (r() - 0.5) * 1.6, z = z0 + (r() - 0.5) * 1.2;
        const s = 0.35 + r() * 0.5;
        buesche.push([x, z > kante(x) ? 0.05 : klippe(x, z) - 0.2, z, s * (1.1 + r() * 0.5), s * (0.75 + r() * 0.4), s * (1 + r() * 0.4)]);
      }
    }
    // Am Hang auf der Bergseite: nur niedrige, damit sie das Auto nicht verdecken.
    for (let i = 0; i < 80; i++) {
      const x = (r() - 0.5) * PERIODE;
      const z = STRASSE + 3 + r() * 16;
      const s = 0.3 + r() * 0.35;
      buesche.push([x, (z - STRASSE - 2.3) * 0.16 - 0.05, z, s * 1.5, s * 0.7, s * 1.2]);
    }
    for (let i = 0; i < 60; i++) {
      const x = (r() - 0.5) * PERIODE;
      const auf = r() < 0.5;
      const z = auf ? STRASSE + 2.4 + r() * 6 : MAUER - 0.8 - r() * 2.5;
      const s = 0.12 + r() ** 2 * 0.5;
      const y = auf ? Math.max(0, z - STRASSE - 2.3) * 0.16 : 0;
      steine.push([x, y, z, s * (1 + r()), s, s * (1 + r() * 0.6)]);
    }
    // Zypressen in Gruppen an der Kante.
    for (const x0 of [-120, -40, 35, 110]) {
      // (eine Periode)
      for (let j = 0, n = 1 + Math.floor(r() * 3); j < n; j++) {
        const x = x0 + j * (2.2 + r() * 1.5);
        const hoehe = 5 + r() * 3.5;
        const breite = 0.6 + r() * 0.25;
        zypressen.push([x, -0.2, kante(x) + 1.3 + r(), breite, hoehe, breite]);
      }
    }
    const m = new THREE.Matrix4();
    const setzen = (geo, material, liste, farbe, schief = 0.3) => {
      const im = new THREE.InstancedMesh(geo, material, liste.length * 5);
      const q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
      let n = 0;
      for (const versatz of [-2 * PERIODE, -PERIODE, 0, PERIODE, 2 * PERIODE]) {
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
    umreissen(setzen(zypresse, mitWind(toon({}), 0.012), zypressen, (c, rr) =>
      c.set(0x24582c).lerp(new THREE.Color(0x3a7a35), rr()), 0.04), 1.5, 0.012);
    this.biegen(nah);
  }

  // Legt alles in der Gruppe auf die kurvige Straße: jeder Punkt rückt um
  // kurve(x) zur Seite, Pflanzen und Steine drehen sich mit.
  biegen(gruppe) {
    gruppe.updateMatrixWorld(true);
    const erledigt = new Set();
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), sk = new THREE.Vector3(), m = new THREE.Matrix4();
    const hoch = new THREE.Vector3(0, 1, 0);
    for (const o of [...gruppe.children]) {
      if (o.isInstancedMesh) {
        // Umrisse teilen sich die Lage mit ihrem Mesh: nur einmal biegen.
        if (erledigt.has(o.instanceMatrix)) continue;
        erledigt.add(o.instanceMatrix);
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m);
          m.decompose(p, q, sk);
          q.premultiply(new THREE.Quaternion().setFromAxisAngle(hoch, -Math.atan(kurveSteigung(p.x))));
          p.z += kurve(p.x);
          o.setMatrixAt(i, m.compose(p, q, sk));
        }
        o.instanceMatrix.needsUpdate = true;
      } else if (o.isMesh) {
        const geo = o.geometry;
        geo.applyMatrix4(o.matrix);
        o.position.set(0, 0, 0);
        o.rotation.set(0, 0, 0);
        o.scale.set(1, 1, 1);
        o.updateMatrix();
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + kurve(pos.getX(i)));
        if (geo.index) geo.computeVertexNormals();
        geo.computeBoundingSphere();
        geo.computeBoundingBox();
      }
    }
  }

  // Boote ziehen weit unten ihre weiße Bugwelle durchs Wasser.
  booteBauen() {
    const c = leinwand(64, 256);
    const g = c.getContext('2d');
    const v = g.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(255,255,255,0.95)');
    v.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = v;
    // Kielwasser als V, das sich nach hinten öffnet und ausfranst.
    g.beginPath();
    g.moveTo(32, 0);
    g.lineTo(0, 256);
    g.lineTo(12, 256);
    g.lineTo(32, 40);
    g.lineTo(52, 256);
    g.lineTo(64, 256);
    g.closePath();
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    const spurGeo = new THREE.PlaneGeometry(1, 1);
    spurGeo.rotateX(-Math.PI / 2);
    spurGeo.rotateY(Math.PI / 2);
    spurGeo.translate(-0.5, 0, 0);
    const rumpf = new THREE.BoxGeometry(1, 0.35, 0.36);
    rumpf.translate(0, 0.15, 0);
    const kajuete = new THREE.BoxGeometry(0.35, 0.25, 0.26);
    kajuete.translate(-0.05, 0.45, 0);
    const weiss = toon({ color: 0xffffff });
    const blau = toon({ color: 0x2c64b8 });
    this.boote = [];
    const r = zufall(17);
    for (let i = 0; i < 5; i++) {
      const boot = new THREE.Group();
      const laenge = 9 + r() * 8;
      const koerper = new THREE.Group();
      koerper.add(new THREE.Mesh(rumpf, r() < 0.5 ? weiss : blau), new THREE.Mesh(kajuete, weiss));
      koerper.scale.setScalar(laenge);
      const spur = new THREE.Mesh(spurGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: 0xffffff }));
      spur.scale.set(laenge * 9, 1, laenge * 2.4);
      spur.position.set(laenge * 0.5, 0.2, 0);
      boot.add(koerper, spur);
      this.welt.add(boot);
      this.boote.push({ boot, x: r() * MITTEL, z: -800 - r() * 1600, tempo: (r() < 0.5 ? 1 : -1) * (5 + r() * 6) });
    }
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
          // Das Auto bleibt fotografisch, nur die Welt ist gezeichnet.
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
    const fov = 32 + 10 * glatt(1.0, 0.45, format);
    const tanHalb = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const anteil = Math.min(0.7, Math.max(0.36, 0.86 - 0.32 * format));
    const brennweitePx = H / 2 / tanHalb;
    const abstand = (4.6 * brennweitePx) / (anteil * breite);

    // Die Kamera fährt mal etwas vor, mal zurück, als hielte die Drohne
    // nicht ganz das Tempo. Das Auto selbst bleibt stehen, so passt sein
    // Schatten, ohne ihn jedes Bild neu zu rechnen.
    // Wie weit, hängt am Rand, den das Bild neben dem Auto lässt.
    const spiel = Math.max(0, 4.6 / anteil - 4.6) * 0.12;
    // Etwas vor das Auto zielen: die Straße voraus gehört ins Bild.
    // Hochkant ist dafür kein Platz.
    const ziel = new THREE.Vector3(2.2 * glatt(0.55, 1.1, format) - 0.8 - schwanken[2] * spiel, 0.62, SPUR);
    const drehung = THREE.MathUtils.degToRad(BLICK + neigung[0] * 5 + schwanken[0]);
    const quer = abstand * Math.cos(drehung);

    // Höhe: so hoch, dass die Brüstung im Bild ganz über dem Dach
    // durchläuft und nicht durch Dach oder Scheiben schneidet (ihr Fuß
    // mindestens `luft` über dem Dach).
    const tiefe = SPUR - MAUER;
    const luft = 0.01;
    const mindest = (DACH * (quer + tiefe) + luft * quer * (quer + tiefe)) / tiefe;
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

    const u = this.fahrt % PERIODE;
    this.nah.position.x = -u;
    this.mittel.position.x = -(this.fahrt % MITTEL);
    // Die Welt so drehen und schieben, dass die Straße unter dem Auto
    // geradeaus läuft und die Fahrspur unter den Rädern liegt.
    const winkel = Math.atan(kurveSteigung(u));
    this.welt.rotation.y = winkel;
    this.welt.position.set(0, 0, SPUR).sub(new THREE.Vector3(0, 0, kurve(u) + SPUR).applyAxisAngle(new THREE.Vector3(0, 1, 0), winkel));
    for (const b of this.boote) {
      const x = ((((b.x + this.zeit * b.tempo - this.fahrt) % MITTEL) + MITTEL * 1.5) % MITTEL) - MITTEL / 2;
      b.boot.position.set(x, MEER + 0.05, b.z);
      b.boot.rotation.y = b.tempo > 0 ? 0 : Math.PI;
    }
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
