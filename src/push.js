// Web-Push (VAPID). Die Schlüssel werden beim ersten Start erzeugt und in
// data/vapid.json abgelegt – oder per Umgebungsvariablen vorgegeben.

import { readFile, writeFile } from 'node:fs/promises';
import webpush from 'web-push';

export async function createPush({ file, subject, publicKey, privateKey }) {
  let keys = publicKey && privateKey ? { publicKey, privateKey } : null;
  if (!keys) {
    try {
      keys = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      keys = webpush.generateVAPIDKeys();
      await writeFile(file, JSON.stringify(keys, null, 2), { mode: 0o600 });
      console.log('[push] Neue VAPID-Schlüssel erzeugt:', file);
    }
  }
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);

  /**
   * Schickt eine Nachricht an alle Geräte der angegebenen Mitglieder.
   * Gibt die Endpoints zurück, die nicht mehr gültig sind (zum Aufräumen).
   */
  async function send(subscriptions, payload) {
    const body = JSON.stringify(payload);
    const gone = [];
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            body,
            { TTL: 60 * 60, urgency: 'high', topic: payload.tag?.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) },
          );
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) gone.push(sub.endpoint);
          else console.warn('[push] Senden fehlgeschlagen:', err.statusCode ?? '', err.body || err.message);
        }
      }),
    );
    return gone;
  }

  return { publicKey: keys.publicKey, send };
}
