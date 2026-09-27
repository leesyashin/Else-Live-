// Baut eine einzelne HTML-Datei mit einer klickbaren Vorschau von Else Live:
// gleiche Oberfläche und Geschäftslogik, aber ohne Server – Daten liegen im
// Browser, die übrigen Mitglieder werden simuliert.
//
//   npm run build:demo   →   dist/else-live-preview.html

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = (p) => path.join(root, 'public/js', p);

// Diese Module werden in der Vorschau durch ihre Demo-Varianten ersetzt.
const swaps = new Map([
  [js('api.js'), js('demo/api.js')],
  [js('push.js'), js('demo/push.js')],
  [js('lib/router.js'), js('demo/router.js')],
]);

const demoSwap = {
  name: 'demo-swap',
  setup(b) {
    b.onResolve({ filter: /\.js$/ }, (args) => {
      if (args.kind === 'entry-point') return undefined;
      const target = swaps.get(path.resolve(args.resolveDir, args.path));
      return target ? { path: target } : undefined;
    });
  },
};

const bundle = await build({
  entryPoints: [js('demo/main.js')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  write: false,
  plugins: [demoSwap],
});

const font = await readFile(path.join(root, 'public/fonts/manrope-latin-wght.woff2'));
const css = (
  (await readFile(path.join(root, 'public/css/app.css'), 'utf8')) +
  (await readFile(path.join(root, 'public/css/demo.css'), 'utf8'))
).replace("url('/fonts/manrope-latin-wght.woff2')", `url(data:font/woff2;base64,${font.toString('base64')})`);

const script = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const page = `<title>Else Live</title>
<meta name="theme-color" content="#070e09" />
<style>
${css}
</style>
<div class="backdrop" aria-hidden="true">
  <div class="blob blob--1"></div>
  <div class="blob blob--2"></div>
  <div class="blob blob--3"></div>
  <div class="blob blob--4"></div>
</div>
<div id="root"></div>
<div id="sheets"></div>
<div class="toasts" id="toasts" role="status" aria-live="polite"></div>
<script type="module">
${script}
</script>
`;

await mkdir(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/else-live-preview.html');
await writeFile(out, page);
console.log(`Vorschau gebaut: ${path.relative(root, out)} (${Math.round(page.length / 1024)} KB)`);
