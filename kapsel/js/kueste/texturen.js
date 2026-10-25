// Texturen der neuen Küste, beim Start einmal auf der GPU gerechnet (kein
// Download). Kalkstein: kachelbar über KALK_M Meter, Schichtbänke mit
// eigenem Ton, Klüfte, Lösungsnäpfchen, Korn. Zwei Bilder:
// - farbe: rgb Grundfarbe (linear, 8 bit; Kalk ist hell genug), a Höhe
// - normal: rgb Normale (Tangentenraum, 0,5 versetzt), a Rauheit
// Die Normale kommt in einem zweiten Durchgang aus der Höhe.

import * as THREE from '../../vendor/three-r186.min.js';

export const KALK_M = 8; // so viele Meter deckt die Textur ab

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Rauschen, das über die Textur hinweg nahtlos umläuft: per = Zellen je
// Kachel in x und y.
const RAUSCHEN = `
float hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float rauschen(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 a = mod(i, per), b = mod(i + 1.0, per);
  return mix(mix(hash2(a), hash2(vec2(b.x, a.y)), u.x), mix(hash2(vec2(a.x, b.y)), hash2(b), u.x), u.y);
}
float fbm(vec2 p, vec2 per, int oktaven) {
  float s = 0.0, amp = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= oktaven) break;
    s += amp * rauschen(p, per);
    p *= 2.0; per *= 2.0; amp *= 0.5;
  }
  return s;
}
// Voronoi: Abstand zum nächsten und zweitnächsten Punkt, nahtlos.
vec2 voronoi(vec2 p, vec2 per) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = hash22(mod(i + g, per));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(d1, d2);
}
`;

// Kalkstein in Metern: m = vUv * KALK_M.
const KALK = `
${RAUSCHEN}
uniform float uMeter;
varying vec2 vUv;
void main() {
  vec2 m = vUv * uMeter;
  float M = uMeter;
  // Alle Frequenzen haben eine ganze Zahl Zellen je Kachel, sonst gäbe es
  // Nähte. Schichtbänke (7 je Kachel), kaum gewellt; jede mit eigenem Ton
  // und Vorsprung.
  float welle = (fbm(m * vec2(0.25, 0.5), vec2(M * 0.25, M * 0.5), 3) - 0.5) * 0.4;
  float b = (m.y + welle) * 7.0 / M;
  float bank = mod(floor(b), 7.0);
  float bankF = fract(b);
  float bankZ = hash2(vec2(bank, 7.0));
  // Fugen zwischen den Bänken nur stellenweise offen.
  float offen = smoothstep(0.45, 0.7, fbm(m * vec2(0.5, 1.0) + bank, vec2(M * 0.5, M), 3));
  float fuge = (1.0 - smoothstep(0.0, 0.05, bankF) * smoothstep(1.0, 0.93, bankF)) * offen;
  // Klüfte: verzerrte Zellen, nur ein Teil der Kanten reißt auf.
  vec2 w = vec2(fbm(m * 0.5, vec2(M * 0.5), 3), fbm(m * 0.5 + 5.2, vec2(M * 0.5), 3)) - 0.5;
  vec2 v = voronoi((m + w * 1.6) * vec2(0.5, 0.375), vec2(M * 0.5, M * 0.375));
  float riss = smoothstep(0.5, 0.65, fbm(m * 0.75 + 9.0, vec2(M * 0.75), 3));
  float kluft = (1.0 - smoothstep(0.0, 0.035 + 0.04 * riss, v.y - v.x)) * riss;
  // Grobes, kantiges Relief wie verwitterter Kalk (Grate aus Rauschen).
  float grat = 1.0 - abs(2.0 * fbm(m * 1.25 + w, vec2(M * 1.25), 5) - 1.0);
  float brocken = fbm(m * 2.5, vec2(M * 2.5), 4);
  // Lösungsnäpfchen.
  vec2 n = voronoi(m * 2.25 + 3.1, vec2(M * 2.25));
  float napf = smoothstep(0.3, 0.1, n.x) * step(0.62, hash2(mod(floor(m * 2.25 + 3.1), M * 2.25)));
  float korn = rauschen(m * 22.0, vec2(M * 22.0));
  float flecken = fbm(m * 0.625, vec2(M * 0.625), 4);
  float ocker = fbm(m * vec2(0.5, 0.125) + 2.0, vec2(M * 0.5, M * 0.125), 3);
  float hoehe = 0.4 + bankZ * 0.12 + grat * 0.3 + (brocken - 0.5) * 0.25 - fuge * 0.15 - kluft * 0.35 - napf * 0.18 + (korn - 0.5) * 0.06;
  // Farbe: hell bis Creme, je Bank leicht anders, graue und weiße Flecken,
  // ockerfarbene Fahnen, dunklere Fugen, Risse und Näpfe.
  vec3 c = mix(vec3(0.74, 0.69, 0.60), vec3(0.66, 0.57, 0.44), bankZ * 0.35 + (brocken - 0.5) * 0.5);
  c = mix(c, vec3(0.60, 0.59, 0.57), smoothstep(0.55, 0.72, flecken) * 0.7);
  c = mix(c, vec3(0.82, 0.80, 0.76), smoothstep(0.62, 0.8, 1.0 - flecken) * 0.5);
  c = mix(c, vec3(0.66, 0.48, 0.30), smoothstep(0.58, 0.78, ocker) * 0.45);
  c *= 0.88 + 0.24 * korn;
  c *= 0.9 + 0.2 * grat;
  c *= 1.0 - 0.18 * fuge - 0.32 * kluft - 0.2 * napf;
  // Die Farben oben sind wie in sRGB gedacht; gespeichert wird linear.
  gl_FragColor = vec4(pow(clamp(c, 0.0, 1.0), vec3(2.2)), clamp(hoehe, 0.0, 1.0));
}`;

// Normale und Rauheit aus der Höhe (a-Kanal des ersten Bildes).
const NORMAL = `
uniform sampler2D tFarbe;
uniform vec2 uTexel;
uniform float uStaerke;
varying vec2 vUv;
void main() {
  float l = texture2D(tFarbe, vUv - vec2(uTexel.x, 0.0)).a;
  float r = texture2D(tFarbe, vUv + vec2(uTexel.x, 0.0)).a;
  float u = texture2D(tFarbe, vUv - vec2(0.0, uTexel.y)).a;
  float o = texture2D(tFarbe, vUv + vec2(0.0, uTexel.y)).a;
  vec3 n = normalize(vec3((l - r) * uStaerke, (u - o) * uStaerke, 1.0));
  float h = texture2D(tFarbe, vUv).a;
  // Tiefe Stellen rauer, Vorsprünge etwas glatter (abgewittert).
  float rau = 0.82 + 0.15 * (1.0 - h);
  gl_FragColor = vec4(n * 0.5 + 0.5, rau);
}`;

export function kalkTexturen(renderer) {
  const fein = matchMedia('(pointer: fine)').matches;
  const n = fein ? 2048 : 1024;
  const ziel = () => {
    const z = new THREE.WebGLRenderTarget(n, n, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    z.texture.wrapS = z.texture.wrapT = THREE.RepeatWrapping;
    z.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return z;
  };
  const farbe = ziel(), normal = ziel();
  const kamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const dreieck = new THREE.BufferGeometry();
  dreieck.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const flaeche = new THREE.Mesh(dreieck);
  flaeche.frustumCulled = false;
  const szene = new THREE.Scene().add(flaeche);
  const durchgang = (fragmentShader, uniforms, z) => {
    flaeche.material = new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false });
    const vorher = renderer.getRenderTarget();
    renderer.setRenderTarget(z);
    renderer.render(szene, kamera);
    renderer.setRenderTarget(vorher);
    flaeche.material.dispose();
  };
  durchgang(KALK, { uMeter: { value: KALK_M } }, farbe);
  // Stärke: Höhe 0..1 entspricht etwa 15 cm Relief.
  const texel = KALK_M / n;
  durchgang(NORMAL, { tFarbe: { value: farbe.texture }, uTexel: { value: new THREE.Vector2(1 / n, 1 / n) }, uStaerke: { value: 0.15 / (2 * texel) } }, normal);
  dreieck.dispose();
  return { farbe: farbe.texture, normal: normal.texture };
}
