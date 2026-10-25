// Bild-Durchgang der neuen Küste: Die Szene rendert linear in ein Ziel mit
// halber Gleitkommagenauigkeit und 4× MSAA. Was heller ist als die Schwelle
// (Glitzern, Sonne, Chrom), strahlt über eine Kette kleiner Bilder (1/2 bis
// 1/16) als Bloom. Am Ende in einem Durchgang: Tonemapping (wie am Renderer
// eingestellt, mit dessen Belichtung), Farbgebung wie ein Foto (Lichter
// leicht warm, Schatten leicht kühl, sanfte S-Kurve), Vignette, feines Korn.

import * as THREE from '../../vendor/three-r186.min.js';

const STUFEN = 4; // Bloom von 1/2 bis 1/16

const VERTEX = `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Vier versetzte Abgriffe, die Mitte doppelt (wie beim Dual-Kawase-Filter).
const RUNTER = `
uniform sampler2D tBild;
uniform vec2 uTexel;
uniform float uSchwelle;
varying vec2 vUv;
vec3 hell(vec3 c) {
  float l = max(c.r, max(c.g, c.b));
  // Weiche Schwelle, damit nichts hart aufspringt.
  float k = clamp(l - uSchwelle + 0.5, 0.0, 1.0);
  float w = max(l - uSchwelle, 0.0) + k * k * 0.25;
  return c * (w / max(l, 1e-4));
}
void main() {
  vec3 c = texture2D(tBild, vUv).rgb * 4.0;
  c += texture2D(tBild, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture2D(tBild, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture2D(tBild, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tBild, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  c /= 8.0;
  if (uSchwelle > 0.0) c = hell(c);
  gl_FragColor = vec4(c, 1.0);
}`;

const HOCH = `
uniform sampler2D tBild;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  c += texture2D(tBild, vUv + uTexel * vec2(-2.0, 0.0)).rgb;
  c += texture2D(tBild, vUv + uTexel * vec2(2.0, 0.0)).rgb;
  c += texture2D(tBild, vUv + uTexel * vec2(0.0, -2.0)).rgb;
  c += texture2D(tBild, vUv + uTexel * vec2(0.0, 2.0)).rgb;
  c += texture2D(tBild, vUv + uTexel * vec2(-1.0, -1.0)).rgb * 2.0;
  c += texture2D(tBild, vUv + uTexel * vec2(1.0, -1.0)).rgb * 2.0;
  c += texture2D(tBild, vUv + uTexel * vec2(-1.0, 1.0)).rgb * 2.0;
  c += texture2D(tBild, vUv + uTexel * vec2(1.0, 1.0)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0, 1.0);
}`;

const FERTIG = `
uniform sampler2D tSzene;
uniform sampler2D tGlanz;
uniform float uGlanz;
uniform float uZeit;
uniform float uVignette;
varying vec2 vUv;
float bildHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec3 c = texture2D(tSzene, vUv).rgb + texture2D(tGlanz, vUv).rgb * uGlanz;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  vec3 f = clamp(gl_FragColor.rgb, 0.0, 1.0);
  float l = dot(f, vec3(0.2126, 0.7152, 0.0722));
  // Etwas mehr Farbe, Schatten kühl, Lichter warm, sanfte S-Kurve.
  f = max(mix(vec3(l), f, 1.1), 0.0);
  f *= mix(vec3(0.97, 0.995, 1.04), vec3(1.035, 1.0, 0.955), smoothstep(0.08, 0.7, l));
  f = mix(f, f * f * (3.0 - 2.0 * f), 0.12);
  vec2 p = vUv - 0.5;
  f *= 1.0 - uVignette * dot(p, p);
  gl_FragColor.rgb = f;
  #include <colorspace_fragment>
  gl_FragColor.rgb += (bildHash(gl_FragCoord.xy + fract(uZeit) * 97.0) - 0.5) * (1.5 / 255.0);
}`;

export class Bild {
  constructor(renderer) {
    this.renderer = renderer;
    const ziel = (samples = 0) => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples, depthBuffer: samples > 0 });
    this.szeneZiel = ziel(4);
    this.stufen = Array.from({ length: STUFEN }, () => ziel());
    this.kamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const dreieck = new THREE.BufferGeometry();
    dreieck.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.flaeche = new THREE.Mesh(dreieck);
    this.flaeche.frustumCulled = false;
    this.szene = new THREE.Scene();
    this.szene.add(this.flaeche);
    const durchgang = (fragmentShader, uniforms, extra = {}) =>
      new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });
    this.runter = durchgang(RUNTER, { tBild: { value: null }, uTexel: { value: new THREE.Vector2() }, uSchwelle: { value: 0 } });
    // Hoch addiert auf die Stufe darüber, die ihr eigenes Runter-Bild behält.
    this.hoch = durchgang(HOCH, { tBild: { value: null }, uTexel: { value: new THREE.Vector2() } }, { blending: THREE.AdditiveBlending });
    this.fertig = durchgang(
      FERTIG,
      { tSzene: { value: null }, tGlanz: { value: null }, uGlanz: { value: 0.12 }, uZeit: { value: 0 }, uVignette: { value: 0.55 } },
      { toneMapped: true },
    );
    this.schwelle = 1.2; // ab dieser Helligkeit (nach Belichtung) strahlt es
  }

  groesse() {
    const g = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.szeneZiel.setSize(g.x, g.y);
    let w = g.x, h = g.y;
    for (const z of this.stufen) {
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
      z.setSize(w, h);
    }
  }

  durchgang(material, ziel) {
    this.flaeche.material = material;
    this.renderer.setRenderTarget(ziel);
    this.renderer.render(this.szene, this.kamera);
  }

  zeichnen(szene, kamera, zeit) {
    const r = this.renderer;
    r.setRenderTarget(this.szeneZiel);
    r.render(szene, kamera);

    // Runter: Schwelle beim ersten Schritt, dann nur noch verkleinern.
    let quelle = this.szeneZiel.texture;
    const belichtung = r.toneMappingExposure;
    this.stufen.forEach((ziel, i) => {
      const u = this.runter.uniforms;
      u.tBild.value = quelle;
      u.uTexel.value.set(1 / quelle.image.width, 1 / quelle.image.height);
      u.uSchwelle.value = i === 0 ? this.schwelle / belichtung : 0;
      this.durchgang(this.runter, ziel);
      quelle = ziel.texture;
    });
    // Hoch: jede kleinere Stufe auf die nächstgrößere addieren.
    const autoClear = r.autoClear;
    r.autoClear = false;
    for (let i = STUFEN - 1; i > 0; i--) {
      const u = this.hoch.uniforms;
      u.tBild.value = this.stufen[i].texture;
      u.uTexel.value.set(0.5 / this.stufen[i].width, 0.5 / this.stufen[i].height);
      this.durchgang(this.hoch, this.stufen[i - 1]);
    }
    r.autoClear = autoClear;

    const u = this.fertig.uniforms;
    u.tSzene.value = this.szeneZiel.texture;
    u.tGlanz.value = this.stufen[0].texture;
    u.uZeit.value = zeit;
    this.durchgang(this.fertig, null);
  }

  dispose() {
    this.szeneZiel.dispose();
    for (const z of this.stufen) z.dispose();
  }
}
