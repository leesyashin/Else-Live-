// Minimaler JSON-Datenspeicher: alles liegt im Speicher und wird nach jeder
// Änderung (leicht verzögert) atomar nach data/db.json geschrieben.
// Für eine kleine Gruppe völlig ausreichend und ohne Datenbank-Server.

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeDb } from './domain.js';

export async function openStore(file) {
  await mkdir(path.dirname(file), { recursive: true });

  let raw = null;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Konnte ${file} nicht lesen: ${err.message}`);
  }
  const db = normalizeDb(raw);

  let timer = null;
  let queue = Promise.resolve();

  function flush() {
    clearTimeout(timer);
    timer = null;
    const data = JSON.stringify(db, null, 1);
    const tmp = `${file}.tmp`;
    queue = queue
      .then(() => writeFile(tmp, data, 'utf8'))
      .then(() => rename(tmp, file))
      .catch((err) => console.error('[store] Speichern fehlgeschlagen:', err));
    return queue;
  }

  function save() {
    if (!timer) timer = setTimeout(flush, 100);
  }

  await flush();
  return { db, save, flush };
}
