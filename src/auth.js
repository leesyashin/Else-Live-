// PIN-Hashing, Sitzungs-Tokens und eine einfache Bremse gegen PIN-Raten.

import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPin(pin) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(pin), salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPin(pin, stored) {
  if (!stored) return true;
  const [, saltHex, hashHex] = stored.split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(String(pin ?? ''), Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(expected, actual);
}

export const isValidPin = (pin) => /^\d{4,8}$/.test(String(pin ?? ''));

export function newToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Merkt sich Fehlversuche pro Schlüssel (z. B. IP + Mitglied) und sperrt kurzzeitig. */
export function createThrottle({ maxAttempts = 6, windowMs = 10 * 60 * 1000 } = {}) {
  const attempts = new Map();
  return {
    blocked(key) {
      const entry = attempts.get(key);
      if (!entry) return false;
      if (Date.now() - entry.first > windowMs) {
        attempts.delete(key);
        return false;
      }
      return entry.count >= maxAttempts;
    },
    fail(key) {
      const entry = attempts.get(key);
      if (!entry || Date.now() - entry.first > windowMs) attempts.set(key, { count: 1, first: Date.now() });
      else entry.count += 1;
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}
