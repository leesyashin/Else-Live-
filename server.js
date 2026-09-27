// Startpunkt: `npm start` (Port 3000) – Konfiguration über Umgebungsvariablen,
// siehe README.md.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/app.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const instance = await createApp({
  dataDir: path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data')),
  groupCode: process.env.GROUP_CODE,
  vapid: {
    subject: process.env.VAPID_SUBJECT,
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
  },
});

const server = instance.app.listen(PORT, HOST, () => {
  console.log(`\n  🌿 Else Live läuft auf http://localhost:${PORT}`);
  if (instance.setupMode()) {
    console.log('  Noch keine Mitglieder – die erste Person richtet die Gruppe ohne Code ein.');
  }
  console.log(`  Gruppencode zum Einladen: ${instance.inviteCode}\n`);
});

async function shutdown() {
  await instance.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
