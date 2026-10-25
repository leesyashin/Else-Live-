// Bildaufbau der neuen Küste, quer (Mac) und hochkant (iPhone); dazwischen
// wird übergeblendet. Die Kamera steht schräg hinter dem Auto über der
// Fahrbahn und schaut die Straße entlang: links das Meer, rechts die Wand.
//
// blick: Winkel der Kamera um das Ziel (0 = genau von der Seite, -90 = genau
// von hinten). fov: senkrechter Blickwinkel. anteil: so viel der freien
// Breite füllt das Auto. autoX, autoY, horizontY: wo Auto und Horizont im
// Bild stehen (Anteil von Breite bzw. Höhe, von oben). ziel: so weit vor dem
// Auto zielt die Kamera. schwenk: größter Blick in eine Kurve, in Grad.
// abstandMax, hoeheMax: Grenzen, die scripts/kapsel-kueste-pruefen.mjs gegen
// die Felswand prüft.
export const KAMERA = {
  quer: { blick: -86, fov: 36, anteil: 0.24, autoX: 0.4, autoY: 0.7, horizontY: 0.42, ziel: 3, schwenk: 5, abstandMax: 16, hoeheMax: 4.2 },
  hoch: { blick: -88, fov: 46, anteil: 0.42, autoX: 0.4, autoY: 0.7, horizontY: 0.36, ziel: 3, schwenk: 6, abstandMax: 16, hoeheMax: 5 },
};

// Werte für ein Bildformat (Breite / Höhe der freien Fläche).
export function kameraWerte(format) {
  const t = Math.min(1, Math.max(0, (1 - format) / 0.55));
  const hoch = t * t * (3 - 2 * t);
  const w = {};
  for (const name of Object.keys(KAMERA.quer)) w[name] = KAMERA.quer[name] + (KAMERA.hoch[name] - KAMERA.quer[name]) * hoch;
  return w;
}
