// Erweiterungen der Standard-Materialien für die neue Küste:
// - eingebackenes Licht der Kacheln (Attribut `licht`, siehe bau-worker.js):
//   x dämpft die Sonne, y das Himmelslicht. Nah am Auto rechnet die
//   Schattenkarte, darum blendet der eingebackene Schatten erst ab NAH ein.
// - Dunst wie Luftperspektive: Ferne Flächen gehen in die Farbe des Himmels
//   in ihrer Blickrichtung über. Der Himmel liegt als Würfel in Koordinaten
//   der Strecke vor; uDrehung dreht die Blickrichtung dorthin zurück.

import * as THREE from '../../vendor/three-r186.min.js';

export const DUNST = {
  uHimmel: { value: null },
  uDunst: { value: 1 / 9000 },
  uDrehung: { value: 0 },
};

// Ab hier (Abstand vom Auto, Meter) zählt der eingebackene Schatten.
const NAH = [30, 45];

const SONNE_GEBACKEN = THREE.ShaderChunk.lights_fragment_begin.replace(
  'getDirectionalLightInfo( directionalLight, directLight );',
  'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= sonneGebacken;',
);

export function mitLicht(material, { gebacken = true, name = '' } = {}) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, DUNST);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vWelt;
${gebacken ? 'attribute vec2 licht;\nvarying vec2 vLicht;' : ''}`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
vWelt = (modelMatrix * vec4(transformed, 1.0)).xyz;
${gebacken ? 'vLicht = licht;' : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWelt;
uniform samplerCube uHimmel;
uniform float uDunst;
uniform float uDrehung;
${gebacken ? 'varying vec2 vLicht;' : ''}`)
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
  };
  material.customProgramCacheKey = () => `licht-${gebacken ? 1 : 0}-${name}`;
  return material;
}
