// Bündelt three.js mit den Teilen, die der Küsten-Hintergrund der Kapsel
// braucht (GLTFLoader, Sky, Meshopt-Decoder), zu einer Datei ohne
// Bare-Imports; die Content-Security-Policy der Kapsel erlaubt keine
// Import-Map im Seitenquelltext.
//
// Aufruf:
//   mkdir /tmp/three && cd /tmp/three && npm init -y && npm i three@0.186.1 esbuild
//   cp <repo>/scripts/kapsel-three.mjs . && node kapsel-three.mjs <repo>/kapsel/vendor/three-r186.min.js
// Neue three-Version: Dateiname in kueste.js anpassen und DAUER in sw.js hochzählen.

import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

const ziel = process.argv[2];
if (!ziel) {
  console.error('Aufruf: node kapsel-three.mjs ziel.js');
  process.exit(1);
}
writeFileSync(
  'eintrag.js',
  `export * from 'three';
export { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
export { Sky } from 'three/addons/objects/Sky.js';
export { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
`,
);
await build({ entryPoints: ['eintrag.js'], bundle: true, format: 'esm', minify: true, legalComments: 'eof', outfile: ziel });
