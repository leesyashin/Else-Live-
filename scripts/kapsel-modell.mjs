// Bereitet den Porsche 911 Carrera 4S (Karol Miklas, Sketchfab, CC BY-SA 4.0)
// für den Küsten-Hintergrund der Kapsel auf:
// - Klarlack-Hülle (Material „coat“), Sketchfab-Lichter, Wappen und
//   Schriftzüge entfernen; Wappen und Porsche-Schriftzug auch aus der
//   Rücklicht-Textur löschen; Fantasie-Kennzeichen
// - Lack, Glas und Metall grob einstellen (fein abgestimmt wird in kueste.js)
// - Geometrie vereinfachen (das Auto ist im Hintergrund nie formatfüllend),
//   Texturen als WebP, höchstens 1024 px, Meshopt-Kompression
//
// Aufruf (braucht Node 22 und ein paar Pakete, die nicht ins Repo gehören):
//   mkdir /tmp/modell && cd /tmp/modell && npm init -y
//   npm i @gltf-transform/core@4.5.1 @gltf-transform/extensions@4.5.1 @gltf-transform/functions@4.5.1 meshoptimizer sharp
//   cp <repo>/scripts/kapsel-modell.mjs . && node kapsel-modell.mjs original.glb <repo>/kapsel/modelle/porsche-911-navy-1.glb
// Das Original gibt es auf Sketchfab (Link in kapsel/modelle/LIZENZ.md).

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplifyPrimitive, weld, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [quelle, ziel] = process.argv.slice(2);
if (!quelle || !ziel) {
  console.error('Aufruf: node kapsel-modell.mjs original.glb ziel.glb');
  process.exit(1);
}

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(quelle);
const root = doc.getRoot();
const material = (name) => root.listMaterials().find((m) => m.getName() === name);
const dreiecke = () =>
  root.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log('vorher', dreiecke(), 'Dreiecke');

// 1. Weg damit: Klarlack-Hülle, Lichtreste, Wappen auf der Haube, die
//    3D-Schriftzüge hinten.
const weg = new Set(['Hemi', 'Hemi.001', 'boot.007', 'Plane.002', 'Plane.003', 'Plane.004']);
for (const node of root.listNodes()) {
  const mats = node.getMesh()?.listPrimitives().map((p) => p.getMaterial()?.getName()) ?? [];
  if (weg.has(node.getName()) || mats.includes('coat')) node.dispose();
}

// 2. Materialien. Lack: Navy-Metallic mit Klarlack.
const klarlack = doc.createExtension(KHRMaterialsClearcoat);
const lack = material('paint');
lack.setBaseColorFactor([0.004, 0.011, 0.042, 1]).setMetallicFactor(0.7).setRoughnessFactor(0.35).setMetallicRoughnessTexture(null);
lack.setExtension('KHR_materials_clearcoat', klarlack.createClearcoat().setClearcoatFactor(1).setClearcoatRoughnessFactor(0.03));

// Scheiben dunkel und deckend, sonst sieht man die schwarze Innenraum-Box.
const scheibe = material('window');
scheibe.setAlphaMode('OPAQUE').setBaseColorFactor([0.003, 0.006, 0.008, 1]).setMetallicFactor(0).setRoughnessFactor(0.05);

material('silver').setBaseColorFactor([0.6, 0.6, 0.6, 1]).setMetallicFactor(1).setRoughnessFactor(0.2);

// Schattenplatte: Rauheit und Verdeckung braucht sie nicht.
const platte = material('Material');
platte.setMetallicRoughnessTexture(null).setOcclusionTexture(null).setMetallicFactor(0).setRoughnessFactor(1);

// 3. Texturen bearbeiten.
const bild = (tex) => sharp(Buffer.from(tex.getImage()));

// Rücklichter & Co.: Wappen und Porsche-Schriftzug löschen (Alpha 0, schwarz).
const glanz = material('tex_shiny');
for (const [tex, mitAlpha] of [[glanz.getBaseColorTexture(), true], [glanz.getEmissiveTexture(), false]]) {
  const { width, height } = await bild(tex).metadata();
  const sx = width / 1024, sy = height / 1024;
  const flaechen = [
    [400, 60, 240, 280], // Wappen
    [80, 400, 870, 210], // Schriftzug „Porsche“ und Modellname
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${flaechen
    .map(([x, y, w, h]) => `<rect x="${x * sx}" y="${y * sy}" width="${w * sx}" height="${h * sy}" fill="#000" fill-opacity="1"/>`)
    .join('')}</svg>`;
  let b = bild(tex).composite([{ input: Buffer.from(svg), blend: mitAlpha ? 'dest-out' : 'over' }]);
  tex.setImage(new Uint8Array(await b.png().toBuffer()));
}

// Fantasie-Kennzeichen, gespiegelt wie im Original-UV.
const schild = material('license');
const schildSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="256">
  <rect x="6" y="6" width="1012" height="244" rx="22" fill="#f4f4f2" stroke="#111" stroke-width="10"/>
  <rect x="14" y="14" width="96" height="228" rx="10" fill="#1d3fa6"/>
  <text x="62" y="214" font-family="DejaVu Sans" font-weight="bold" font-size="64" fill="#fff" text-anchor="middle">D</text>
  <text x="580" y="190" font-family="DejaVu Sans Mono" font-weight="bold" font-size="170" fill="#111" text-anchor="middle">KA·PS 911</text>
</svg>`;
schild.getBaseColorTexture().setImage(new Uint8Array(await sharp(Buffer.from(schildSvg)).flop().png().toBuffer()));
schild.setNormalTexture(null);

// Schattenplatte: Signatur und Schrift aus dem Schatten entfernen (Minimum-
// und Maximum-Filter schließen dünne Striche), dann leicht weichzeichnen.
const schattenTex = platte.getBaseColorTexture();
{
  const { data, info } = await bild(schattenTex).extractChannel(1).resize(512, 1024).raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const filter = (src, r, fn) => {
    const out = new Uint8Array(src.length);
    const tmp = new Uint8Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = src[y * w + x];
      for (let d = -r; d <= r; d++) v = fn(v, src[y * w + Math.min(w - 1, Math.max(0, x + d))]);
      tmp[y * w + x] = v;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = tmp[y * w + x];
      for (let d = -r; d <= r; d++) v = fn(v, tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x]);
      out[y * w + x] = v;
    }
    return out;
  };
  const offen = filter(filter(data, 4, Math.min), 4, Math.max);
  const alpha = await sharp(Buffer.from(offen), { raw: { width: w, height: h, channels: 1 } }).blur(2).extractChannel(0).raw().toBuffer();
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba[i * 4 + 3] = alpha[i];
  schattenTex.setImage(new Uint8Array(await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer()));
}

await doc.transform(prune(), dedup(), weld());

// 4. Vereinfachen: Räder kräftig (sieht man von der Seite, aber klein), den
//    Rest behutsam, damit die Karosserie glatt bleibt.
for (const mesh of root.listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const name = mesh.getName();
    const rad = name.startsWith('Cylinder');
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: rad ? 0.3 : 0.5, error: rad ? 0.002 : 0.0008, lockBorder: true });
  }
}
console.log('nachher', dreiecke(), 'Dreiecke');

await doc.transform(
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 88 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

// Die Angaben von Sketchfab (Titel, Autor, Quelle, Lizenz) bleiben im Asset;
// dazu, was verändert wurde (CC BY-SA verlangt das).
const asset = root.getAsset();
asset.extras = { ...asset.extras, changes: 'Else Live/Kapsel: Lack Navy, Klarlack-Hülle, Wappen und Schriftzüge entfernt, Fantasie-Kennzeichen, vereinfacht und komprimiert' };

await io.write(ziel, doc);
const { statSync } = await import('node:fs');
console.log(ziel, (statSync(ziel).size / 1024 / 1024).toFixed(2), 'MB');
