// Erweiterungen der Standard-Materialien für die neue Küste:
// - eingebackenes Licht der Kacheln (Attribut `licht`, siehe bau-worker.js):
//   x dämpft die Sonne, y das Himmelslicht. Nah am Auto rechnet die
//   Schattenkarte, darum blendet der eingebackene Schatten erst ab NAH ein.
// - Dunst wie Luftperspektive: Ferne Flächen gehen in die Farbe des Himmels
//   in ihrer Blickrichtung über. Der Himmel liegt als Würfel in Koordinaten
//   der Strecke vor; uDrehung dreht die Blickrichtung dorthin zurück.
// - Fels (Wand und Klippe): Kalkstein aus texturen.js, triplanar in
//   Koordinaten der Strecke (Attribut `ort`, so wandert nichts mit), in zwei
//   Maßstäben gemischt, dazu feine Detailnormale. Sinterstreifen und frischer
//   Bruch aus dem Attribut `fels`, Flechten, Feuchte am Fuß, nach oben
//   gewandte Flächen werden Boden mit Macchia.
// - Netz: Maschen im Shader, in der Ferne gemittelt (alphaToCoverage).
// - Bewuchs: Blätter als Sprenkel in Farbe.

import * as THREE from '../../vendor/three-r186.min.js';
import { KALK_M } from './texturen.js';

export const DUNST = {
  uHimmel: { value: null },
  uDunst: { value: 1 / 9000 },
  uDrehung: { value: 0 },
};

export const KALK = {
  tKalkFarbe: { value: null },
  tKalkNormal: { value: null },
};

// Ab hier (Abstand vom Auto, Meter) zählt der eingebackene Schatten.
const NAH = [30, 45];

const SONNE_GEBACKEN = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= sonneGebacken;',
);

// Wertrauschen, in x periodisch nach perX Zellen (der Umlauf ist 2048 m lang;
// Zellgrößen in Zweierpotenzen von Metern laufen darum nahtlos um).
const RAUSCHEN = `
float kHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float kRauschen(vec3 p, float perX) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, perX), x1 = mod(i.x + 1.0, perX);
  return mix(
    mix(mix(kHash(vec3(x0, i.y, i.z)), kHash(vec3(x1, i.y, i.z)), u.x),
        mix(kHash(vec3(x0, i.y + 1.0, i.z)), kHash(vec3(x1, i.y + 1.0, i.z)), u.x), u.y),
    mix(mix(kHash(vec3(x0, i.y, i.z + 1.0)), kHash(vec3(x1, i.y, i.z + 1.0)), u.x),
        mix(kHash(vec3(x0, i.y + 1.0, i.z + 1.0)), kHash(vec3(x1, i.y + 1.0, i.z + 1.0)), u.x), u.y), u.z);
}
// Rauschen mit Zellgröße z Metern am Ort p.
float kFeld(vec3 p, float z) { return kRauschen(p / z, 2048.0 / z); }
`;

const FELS_KOPF = `
uniform sampler2D tKalkFarbe;
uniform sampler2D tKalkNormal;
varying vec3 vOrt;
varying vec3 vNormalLokal;
varying vec2 vFels;
varying vec3 vAchseX;
varying vec3 vAchseY;
varying vec3 vAchseZ;
${RAUSCHEN}
// Triplanar: drei Projektionen nach der Normale gewichtet.
vec4 kalkFarbe(vec3 o, vec3 w, float m) {
  return texture2D(tKalkFarbe, o.zy / m) * w.x + texture2D(tKalkFarbe, o.xz / m) * w.y + texture2D(tKalkFarbe, o.xy / m) * w.z;
}
// Normale nach Ben Golus (Whiteout-Mischung), Ergebnis in Koordinaten der
// Strecke; a: Rauheit.
vec4 kalkNormal(vec3 o, vec3 N, vec3 w, float m, float detail) {
  vec4 x = texture2D(tKalkNormal, o.zy / m), y = texture2D(tKalkNormal, o.xz / m), z = texture2D(tKalkNormal, o.xy / m);
  vec3 tx = x.xyz * 2.0 - 1.0, ty = y.xyz * 2.0 - 1.0, tz = z.xyz * 2.0 - 1.0;
  tx.xy *= detail; ty.xy *= detail; tz.xy *= detail;
  vec3 s = sign(N);
  tx.x *= s.x; ty.x *= s.y; tz.x *= -s.z;
  tx = vec3(tx.xy + N.zy, abs(tx.z) * N.x);
  ty = vec3(ty.xy + N.xz, abs(ty.z) * N.y);
  tz = vec3(tz.xy + N.xy, abs(tz.z) * N.z);
  return vec4(normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z), x.a * w.x + y.a * w.y + z.a * w.z);
}
`;

const FELS_VORBEREITUNG = `
vec3 kN = normalize(vNormalLokal);
vec3 kW = pow(abs(kN), vec3(4.0));
kW /= dot(kW, vec3(1.0));
// Zwei Maßstäbe, nach großen Flecken gemischt, damit sich nichts sichtbar
// wiederholt; dazu eine feine Detailnormale.
float kMisch = smoothstep(0.35, 0.65, kFeld(vOrt, 16.0));
vec4 kFarbeT = mix(kalkFarbe(vOrt, kW, ${KALK_M.toFixed(1)}), kalkFarbe(vOrt + 3.7, kW, ${(KALK_M * 2).toFixed(1)}), kMisch);
vec4 kNormA = kalkNormal(vOrt, kN, kW, ${KALK_M.toFixed(1)}, 1.0);
vec4 kNormB = kalkNormal(vOrt + 3.7, kN, kW, ${(KALK_M * 2).toFixed(1)}, 1.0);
vec4 kNormD = kalkNormal(vOrt * 1.0, kN, kW, ${(KALK_M / 4).toFixed(1)}, 0.6);
vec3 kNormal = normalize(mix(kNormA.xyz, kNormB.xyz, kMisch) + (kNormD.xyz - kN) * 0.5);
// Oben (Krone, Hang): Boden mit Macchia statt nacktem Fels.
float kOben = smoothstep(0.55, 0.8, kN.y);
// Nass am Fuß der Wand und an der Brandung.
float kNass = (1.0 - smoothstep(-0.5, 1.4, vOrt.y)) * step(-20.0, vOrt.y) + (1.0 - smoothstep(-74.0, -70.0, vOrt.y));
`;

const FELS_FARBE = `
{
  vec3 fc = kFarbeT.rgb;
  // Sinter: senkrechte Fahnen, wo Wasser herabläuft; schwarz bis rostbraun.
  float fahne = kRauschen(vec3(vOrt.x * 1.5, vOrt.y * 0.06, 0.5), 3072.0) * 0.7 + kRauschen(vec3(vOrt.x * 4.0, vOrt.y * 0.2, 2.5), 8192.0) * 0.3;
  float sinter = vFels.x * smoothstep(0.42, 0.72, fahne) * (1.0 - kOben);
  vec3 sinterFarbe = mix(vec3(0.07, 0.065, 0.06), vec3(0.30, 0.17, 0.09), kFeld(vec3(vOrt.x, vOrt.y * 0.2, 0.0), 4.0));
  fc = mix(fc, sinterFarbe, sinter * 0.8);
  // Flechten: graue und gelbliche Flecken.
  fc = mix(fc, vec3(0.40, 0.40, 0.37), smoothstep(0.64, 0.7, kFeld(vOrt, 1.0)) * 0.55);
  fc = mix(fc, vec3(0.52, 0.47, 0.22), smoothstep(0.72, 0.76, kFeld(vOrt + 7.0, 0.5)) * 0.4);
  // Frischer Bruch an Vorsprüngen: heller, weniger verwittert.
  fc = mix(fc, vec3(0.80, 0.76, 0.68), vFels.y * 0.5);
  // Boden oben: Erde, trockenes Gras, dunkle Macchia.
  vec3 boden = mix(vec3(0.16, 0.14, 0.08), vec3(0.30, 0.27, 0.15), kFeld(vOrt, 2.0));
  boden = mix(boden, vec3(0.08, 0.12, 0.05), smoothstep(0.5, 0.7, kFeld(vOrt + 11.0, 4.0)) * 0.8);
  fc = mix(fc, boden, kOben * 0.9);
  fc *= 1.0 - 0.35 * kNass;
  diffuseColor.rgb *= fc;
}
`;

const NETZ_KOPF = `
varying vec2 vNetzUv;
`;

const NETZ_ALPHA = `
{
  // Rautenmaschen, 22 cm weit; Draht gut 4 % der Masche.
  vec2 g = vNetzUv / 0.22;
  vec2 r = abs(fract(vec2(g.x + g.y, g.x - g.y) * 0.5) - 0.5);
  float d = min(r.x, r.y);
  float fw = fwidth(d);
  float draht = 0.045;
  float a = 1.0 - smoothstep(draht - fw, draht + fw, d);
  // Fern verschwimmen die Maschen zu einem Schleier.
  a = mix(a, draht * 3.0, smoothstep(0.08, 0.3, fw));
  // Randseile oben und unten.
  a = max(a, 1.0 - step(0.05, vNetzUv.y));
  a = max(a, step(22.75, vNetzUv.y));
  diffuseColor.a = a;
}
`;

const BUSCH_KOPF = `
varying vec3 vBlatt;
float bHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
`;

// zusatz: { fels, netz, busch } – was zu Licht und Dunst noch dazukommt.
export function mitLicht(material, { gebacken = true, name = '', fels = false, netz = false, busch = false } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, DUNST);
    if (fels) Object.assign(shader.uniforms, KALK);
    let v = shader.vertexShader, f = shader.fragmentShader;
    v = v.replace('#include <common>', `#include <common>
varying vec3 vWelt;
${gebacken ? 'attribute vec2 licht;\nvarying vec2 vLicht;' : ''}
${fels ? 'attribute vec3 ort;\nattribute vec2 fels;\nvarying vec3 vOrt;\nvarying vec3 vNormalLokal;\nvarying vec2 vFels;\nvarying vec3 vAchseX;\nvarying vec3 vAchseY;\nvarying vec3 vAchseZ;' : ''}
${netz ? 'attribute vec2 netzUv;\nvarying vec2 vNetzUv;' : ''}
${busch ? 'varying vec3 vBlatt;' : ''}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
vWelt = (modelMatrix * vec4(transformed, 1.0)).xyz;
${gebacken ? 'vLicht = licht;' : ''}
${fels ? 'vOrt = ort;\nvNormalLokal = normal;\nvFels = fels;\nvAchseX = normalMatrix * vec3(1.0, 0.0, 0.0);\nvAchseY = normalMatrix * vec3(0.0, 1.0, 0.0);\nvAchseZ = normalMatrix * vec3(0.0, 0.0, 1.0);' : ''}
${netz ? 'vNetzUv = netzUv;' : ''}
${busch ? 'vBlatt = position;' : ''}`);
    f = f.replace('#include <common>', `#include <common>
varying vec3 vWelt;
uniform samplerCube uHimmel;
uniform float uDunst;
uniform float uDrehung;
${gebacken ? 'varying vec2 vLicht;' : ''}
${fels ? FELS_KOPF : ''}
${netz ? NETZ_KOPF : ''}
${busch ? BUSCH_KOPF : ''}`);
    if (fels) {
      f = f
        .replace('#include <map_fragment>', `${FELS_VORBEREITUNG}\n#include <map_fragment>\n${FELS_FARBE}`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= mix(mix(kNormA.a, kNormB.a, kMisch), 0.5, kNass * 0.6) * (1.0 - kOben * 0.05);')
        .replace('#include <normal_fragment_maps>', 'normal = normalize(mat3(vAchseX, vAchseY, vAchseZ) * kNormal);');
    }
    if (netz) f = f.replace('#include <alphamap_fragment>', `#include <alphamap_fragment>\n${NETZ_ALPHA}`);
    if (busch) {
      f = f.replace('#include <map_fragment>', `#include <map_fragment>
{
  // Blätter: Sprenkel in drei Größen, innen dunkler.
  float b = bHash(floor(vBlatt * 14.0)) * 0.5 + bHash(floor(vBlatt * 31.0)) * 0.3 + bHash(floor(vBlatt * 6.0)) * 0.2;
  diffuseColor.rgb *= 0.55 + 0.8 * b;
}`);
    }
    f = f
      .replace('#include <lights_fragment_begin>', gebacken
        ? `float sonneGebacken = mix(1.0, vLicht.x, smoothstep(${NAH[0].toFixed(1)}, ${NAH[1].toFixed(1)}, length(vWelt.xz - vec2(0.0, ${(1.75).toFixed(2)}))));
${SONNE_GEBACKEN}`
        : '#include <lights_fragment_begin>')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
${gebacken ? 'reflectedLight.indirectDiffuse *= vLicht.y;\nreflectedLight.indirectSpecular *= vLicht.y;' : ''}`)
      .replace('#include <tonemapping_fragment>', `{
  vec3 blick = vWelt - cameraPosition;
  float weite = length(blick);
  blick /= weite;
  // In Koordinaten der Strecke, wie der Himmelswürfel.
  float c = cos(uDrehung), s = sin(uDrehung);
  vec3 lokal = vec3(c * blick.x - s * blick.z, max(blick.y, 0.0) + 0.012, s * blick.x + c * blick.z);
  vec3 himmel = textureCube(uHimmel, normalize(lokal)).rgb;
  // Dichter knapp über dem Meer, dünner in der Höhe.
  float hoehe = mix(1.5, 0.7, smoothstep(-80.0, 200.0, vWelt.y));
  float dunst = 1.0 - exp(-weite * uDunst * hoehe);
  // Neben der Sonne ist der Himmel um ein Vielfaches heller als alles andere;
  // nahe Flächen sollen davor nicht mitglühen.
  himmel = min(himmel, vec3(1.2 / max(1.0 - dunst, 0.015)) * 4.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, himmel, dunst);
}
#include <tonemapping_fragment>`);
    shader.vertexShader = v;
    shader.fragmentShader = f;
  };
  material.customProgramCacheKey = () => `licht-${gebacken ? 1 : 0}-${fels ? 1 : 0}-${netz ? 1 : 0}-${busch ? 1 : 0}-${name}`;
  return material;
}
