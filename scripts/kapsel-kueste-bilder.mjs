// Screenshots der Küste im Standbild-Modus (?bild=<weg>,<zeit>,<stimmung>),
// für Vorher-nachher-Vergleiche in PRs: feste Streckenpunkte, hell und dunkel,
// Mac und iPhone. Startet selbst einen kleinen Server für kapsel/.
//
// Aufruf (braucht Playwright mit Chromium; in den Cloud-Sessions vorhanden,
// sonst `npm i -g playwright && npx playwright install chromium`):
//   node scripts/kapsel-kueste-bilder.mjs [--stil kueste-neu] [--aus ordner]
//     [--punkte 160,448] [--zeit 30] [--stimmung hell,dunkel]
//     [--format mac,handy] [--dpr 1] [--app] [--software] [--wurzel ordner]
// --app lässt die Oberfläche der Kapsel im Bild, --software rechnet ohne
// Grafikkarte (SwiftShader, langsam, aber überall gleich). --wurzel nimmt die
// Kapsel aus einem anderen Ordner, etwa für Vorher-Bilder aus einem
// `git worktree` von main.

import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// Je ein Punkt mitten in jedem Abschnitt der neuen Strecke (siehe Plan).
const PUNKTE = [160, 448, 640, 864, 1040, 1296, 1648, 1920];
const FORMATE = { mac: [1440, 900], handy: [390, 844] };
const ARTEN = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
};

function argumente() {
  const a = { stil: 'kueste-neu', aus: 'kueste-bilder', wurzel: resolve(dirname(fileURLToPath(import.meta.url)), '..', 'kapsel'), punkte: PUNKTE, zeit: 30, stimmung: ['hell', 'dunkel'], format: ['mac', 'handy'], dpr: 1, app: false, software: false };
  const liste = process.argv.slice(2);
  for (let i = 0; i < liste.length; i++) {
    const name = liste[i].replace(/^--/, '');
    if (name === 'app' || name === 'software') a[name] = true;
    else if (name in a) {
      const wert = liste[++i];
      if (wert === undefined) throw new Error(`--${name} braucht einen Wert`);
      a[name] = name === 'punkte' ? wert.split(',').map(Number)
        : name === 'stimmung' || name === 'format' ? wert.split(',')
        : name === 'zeit' || name === 'dpr' ? Number(wert) : wert;
    } else throw new Error(`unbekannt: ${liste[i]}`);
  }
  for (const f of a.format) if (!FORMATE[f]) throw new Error(`Format ${f}: mac oder handy`);
  a.wurzel = resolve(a.wurzel);
  return a;
}

// Liefert Dateien aus der Kapsel, nichts außerhalb.
function server(wurzel) {
  const s = createServer((anfrage, antwort) => {
    const pfad = decodeURIComponent(new URL(anfrage.url, 'http://x').pathname);
    let datei = normalize(join(wurzel, pfad));
    if (datei !== wurzel && !datei.startsWith(wurzel + sep)) {
      antwort.writeHead(403).end();
      return;
    }
    try {
      if (statSync(datei).isDirectory()) datei = join(datei, 'index.html');
      antwort.writeHead(200, { 'content-type': ARTEN[extname(datei)] ?? 'application/octet-stream' });
      antwort.end(readFileSync(datei));
    } catch {
      antwort.writeHead(404).end();
    }
  });
  return new Promise((fertig) => s.listen(0, '127.0.0.1', () => fertig(s)));
}

const a = argumente();
mkdirSync(a.aus, { recursive: true });
const s = await server(a.wurzel);
const basis = `http://127.0.0.1:${s.address().port}/`;
const flaggen = ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'];
if (a.software) flaggen.push('--use-gl=angle', '--use-angle=swiftshader');
const browser = await chromium.launch({ args: flaggen });
let fehler = 0;
try {
  for (const format of a.format) {
    const [breite, hoehe] = FORMATE[format];
    for (const stimmung of a.stimmung) {
      const kontext = await browser.newContext({
        viewport: { width: breite, height: hoehe },
        deviceScaleFactor: a.dpr,
        colorScheme: stimmung === 'dunkel' ? 'dark' : 'light',
        serviceWorkers: 'block',
      });
      for (const weg of a.punkte) {
        const seite = await kontext.newPage();
        seite.on('pageerror', (e) => console.error('  Seitenfehler:', e.message));
        const start = Date.now();
        const name = `${a.stil}-${format}-${stimmung}-${String(weg).padStart(4, '0')}.png`;
        try {
          await seite.goto(`${basis}?stil=${a.stil}&bild=${weg},${a.zeit},${stimmung}`);
          await seite.waitForSelector(`canvas.glas3d[data-stil="${a.stil}"][data-bild="fertig"]`, { state: 'attached', timeout: 240000 });
          // Ohne Einblenden; die Oberfläche nur auf Wunsch.
          await seite.addStyleTag({ content: `.glas3d { transition: none !important; }${a.app ? '' : ' body > :not(canvas) { visibility: hidden !important; }'}` });
          await seite.evaluate(() => new Promise((weiter) => requestAnimationFrame(() => requestAnimationFrame(weiter))));
          await seite.screenshot({ path: join(a.aus, name) });
          console.log(`${name}  ${((Date.now() - start) / 1000).toFixed(1)} s`);
        } catch (e) {
          fehler++;
          console.error(`${name}  fehlgeschlagen: ${e.message.split('\n')[0]}`);
        }
        await seite.close();
      }
      await kontext.close();
    }
  }
} finally {
  await browser.close();
  s.close();
}
process.exit(fehler ? 1 : 0);
