// Kleine Helfer für die Küste: Zufall mit Saat, Wertrauschen, weiche Stufe,
// Zeichenfläche.

export function zufall(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Wertrauschen, in x periodisch mit `px` Gitterzellen.
export function rauschen(x, z, px = 1 << 20, seed = 1) {
  const h = (i, j) => {
    i = ((i % px) + px) % px;
    let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = x - xi, fz = z - zi;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

export function fbm(x, z, px, seed, oktaven = 4) {
  let s = 0, amp = 0.5;
  for (let i = 0; i < oktaven; i++) {
    s += amp * rauschen(x, z, px, seed + i * 17);
    x *= 2; z *= 2; px *= 2; amp *= 0.5;
  }
  return s;
}

export const glatt = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function leinwand(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
