// Gemeinsames 3D-Modell des Porsche 911 GT3 RS (992) für den ASCII- und den
// HD-Stil, als GLSL-Abstandsfunktionen. Maße in Metern, Boden bei y = 0,
// die Front zeigt nach +x, die Mitte liegt bei z = 0 (Länge 4,57 m,
// Breite 1,9 m, Höhe 1,32 m, Radstand 2,45 m).
//
// auto_(p) gibt den Abstand zurück und setzt gMat (0 Karosserie, 1 Rad,
// 2 Carbon, 3 Scheinwerfer, 4 Auspuff); teil(a, mat) unterscheidet auf der
// Oberfläche Lack, Glas, Leuchtband, schwarze Öffnungen, Reifen, Felge und
// mehr, damit beide Stile dieselben Teile schattieren.

export const MODELL = `
float sanft(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
// 0 vor a, 1 hinter b; das Auto zeigt nach +x, a > b.
float rampe(float x, float a, float b) { return sanft((a - x) / (a - b)); }
mat2 drehung(float w) { float c = cos(w), s = sin(w); return mat2(c, -s, s, c); }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float kiste(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float ellipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}
// Zylinder mit Achse z
float walze(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xy), p.z)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
float stab(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// Mittellinie von der Seite: Haube tief zwischen den Kotflügeln, darüber
// die 911-Flyline als ein Bogen von der Frontscheibe übers Dach bis zum
// Motordeckel, dann das runde Heck.
float oberkante(float x) {
  float haube = 0.54 + 0.06 * rampe(x, 2.29, 2.1) + 0.13 * rampe(x, 2.1, 0.95);
  float deck = 0.93 - 0.17 * rampe(x, -1.75, -2.32);
  float basis = x > -0.3 ? haube : mix(haube, deck, rampe(x, -0.3, -1.4));
  float u = (x + 0.18) / (x > -0.18 ? 1.13 : 1.48);
  float dach = 0.73 + 0.56 * (1.0 - u * u);
  return smax(basis, dach, 0.06);
}
float unterkante(float x) { return 0.12 + 0.14 * sanft((-1.75 - x) / 0.5) + 0.04 * sanft((x - 2.05) / 0.25); }

// Halbe Breite: unten breit mit runder Nase und rundem Heck, nach unten
// eingezogen, oben die schmale Kabine.
float breite(float x, float y) {
  // Türen schmaler, die Hüften darüber tragen die volle Breite
  float w = mix(0.85, 0.88, sanft((0.3 - x) / 1.2));
  // Gewölbter Querschnitt: am breitesten auf Höhe der Türmitte
  float bauch = (y - 0.5) / 0.38;
  w *= 1.0 - 0.07 * bauch * bauch;
  float n = clamp((x - 1.6) / 0.7, 0.0, 1.0);
  w *= 1.0 - 0.3 * pow(n, 1.6);
  float h = clamp((-1.85 - x) / 0.45, 0.0, 1.0);
  w *= 1.0 - 0.14 * h * h;
  w -= 0.07 * smoothstep(0.36, 0.12, y);
  float kabine = 0.66 - 0.17 * clamp((y - 0.86) / 0.43, 0.0, 1.0);
  return mix(w, kabine, smoothstep(0.68, 0.92, y));
}

const vec3 RAD_V = vec3(1.22, 0.34, 0.79);
const vec3 RAD_H = vec3(-1.23, 0.352, 0.82);
const vec3 KASTEN_MIN = vec3(-2.45, 0.0, -1.0);
const vec3 KASTEN_MAX = vec3(2.45, 1.62, 1.0);

float gMat;

float karosse(vec3 p) {
  vec3 q = vec3(p.x, p.y, abs(p.z));
  float d = smax(q.y - oberkante(q.x), unterkante(q.x) - q.y, 0.06);
  d = smax(d, q.z - breite(q.x, q.y), 0.07);
  d = smax(d, abs(q.x) - 2.3, 0.2);
  // Kotflügel vorn mit den runden Scheinwerfern, breite Hüften hinten
  d = smin(d, ellipsoid(q - vec3(1.25, 0.5, 0.69), vec3(1.0, 0.32, 0.26)), 0.09);
  d = smin(d, ellipsoid(q - vec3(-1.28, 0.56, 0.6), vec3(1.02, 0.45, 0.355)), 0.16);
  // Zwei Nüstern vorn in der Haube (Kühlerluft des RS)
  d = smax(d, -ellipsoid(q - vec3(1.86, 0.69, 0.21), vec3(0.17, 0.07, 0.12)), 0.02);
  // Radläufe
  float lauf = min(length(q.xy - RAD_V.xy) - 0.4, length(q.xy - RAD_H.xy) - 0.41);
  d = smax(d, -max(lauf, 0.48 - q.z), 0.03);
  return d;
}

float auto_(vec3 p) {
  vec3 q = vec3(p.x, p.y, abs(p.z));
  float d = karosse(p);
  gMat = 0.0;
  // Außenspiegel an der Tür
  d = min(d, min(ellipsoid(q - vec3(0.6, 0.9, 0.86), vec3(0.09, 0.05, 0.08)), stab(q, vec3(0.66, 0.86, 0.68), vec3(0.62, 0.89, 0.82), 0.014)));
  // Scheinwerfer
  float s = ellipsoid(q - vec3(1.93, 0.685, 0.675), vec3(0.075, 0.122, 0.125));
  if (s < d) { d = s; gMat = 3.0; }
  // Räder
  vec3 rv = q - RAD_V, rh = q - RAD_H;
  float r = min(walze(rv, 0.318, 0.125) - 0.022, walze(rh, 0.33, 0.14) - 0.022);
  r = smax(r, -min(walze(rv - vec3(0.0, 0.0, 0.155), 0.25, 0.04), walze(rh - vec3(0.0, 0.0, 0.17), 0.26, 0.04)), 0.01);
  if (r < d) { d = r; gMat = 1.0; }
  // Carbon: Splitter, Schweller, großer Flügel mit Flap, Endplatten und
  // Schwanenhälsen, die den Flügel von oben halten
  float c = kiste(q - vec3(2.14, 0.115, 0.0), vec3(0.13, 0.012, 0.78));
  c = min(c, kiste(q - vec3(0.0, 0.16, 0.86), vec3(0.92, 0.03, 0.035)));
  vec2 f = drehung(0.09) * (q.xy - vec2(-1.97, 1.4));
  c = min(c, kiste(vec3(f, q.z), vec3(0.24, 0.022, 0.84)) - 0.01);
  vec2 k = drehung(0.34) * (q.xy - vec2(-2.14, 1.47));
  c = min(c, kiste(vec3(k, q.z), vec3(0.11, 0.014, 0.82)) - 0.007);
  c = min(c, kiste(q - vec3(-2.03, 1.42, 0.85), vec3(0.24, 0.13, 0.01)) - 0.004);
  c = min(c, stab(q, vec3(-1.7, 0.92, 0.34), vec3(-1.78, 1.5, 0.34), 0.024));
  c = min(c, stab(q, vec3(-1.78, 1.5, 0.34), vec3(-1.93, 1.425, 0.34), 0.024));
  if (c < d) { d = c; gMat = 2.0; }
  // Zwei Endrohre in der Mitte
  float a = stab(q, vec3(-2.32, 0.31, 0.08), vec3(-2.18, 0.31, 0.08), 0.045);
  if (a < d) { d = a; gMat = 4.0; }
  return d;
}

vec3 normale(vec3 p) {
  const vec2 e = vec2(0.001, -0.001);
  return normalize(e.xyy * auto_(p + e.xyy) + e.yyx * auto_(p + e.yyx) + e.yxy * auto_(p + e.yxy) + e.xxx * auto_(p + e.xxx));
}

// Teil an der Stelle a (z gespiegelt, a.z >= 0):
// 0 Lack, 1 Glas, 2 Leuchtband, 3 schwarz (Öffnungen, Fugen, Gitter),
// 4 Reifen, 5 Felge, 7 Carbon, 8 Scheinwerfer, 9 Auspuff.
float teil(vec3 a, float mat) {
  if (mat > 3.5) return 9.0;
  if (mat > 2.5) return 8.0;
  if (mat > 1.5) return 7.0;
  if (mat > 0.5) {
    vec3 m = a.x > 0.0 ? RAD_V : RAD_H;
    return length(a.xy - m.xy) > 0.255 ? 4.0 : 5.0;
  }
  float dachH = oberkante(a.x);
  // Seitenfenster mit runder Hinterkante, geteilt von der B-Säule
  bool seite = a.z > 0.47 && a.y > 0.88 && a.y < dachH - 0.06 && a.x < 0.86 - (a.y - 0.88) * 1.25
    && length(vec2((a.x + 0.62) / 0.62, (a.y - 0.88) / max(dachH - 0.94, 0.01))) < 1.0 + step(-0.62, a.x) * 9.0
    && abs(a.x + 0.3) > 0.03;
  if (seite || (a.x > 0.12 && a.x < 0.9 && a.z < 0.56 && a.y > 0.79) || (a.x < -0.55 && a.x > -1.3 && a.z < 0.42 && a.y > 0.95)) return 1.0;
  if (a.x < -2.06 && abs(a.y - (dachH - 0.075)) < 0.026 && a.z < 0.8) return 2.0;
  // Nüstern, Frontschürze mit Mittel- und Seiteneinlässen, Diffusor
  if (length((a - vec3(1.86, 0.69, 0.21)) / vec3(0.15, 0.06, 0.1)) < 1.0) return 3.0;
  if (a.x > 2.1 && a.y > 0.15 && a.y < 0.33 && (a.z < 0.34 || (a.z > 0.42 && a.z < 0.72))) return 3.0;
  if (a.x < -2.0 && a.y < 0.36) return 3.0;
  // Kiemen auf den vorderen Kotflügeln, Gitter im Motordeckel
  if (a.x > 1.02 && a.x < 1.55 && a.z > 0.56 && a.z < 0.8 && a.y > 0.7 && fract(a.x * 22.0) > 0.55) return 3.0;
  if (a.x < -1.45 && a.x > -2.0 && a.z < 0.5 && a.y > 0.85 && fract(a.x * 28.0) > 0.5) return 3.0;
  // Lüftung hinter dem Vorderrad, Einlass vor dem Hinterrad, Türfugen
  if (a.z > 0.78 && a.x > 0.6 && a.x < 0.72 && a.y > 0.3 && a.y < 0.62) return 3.0;
  if (a.z > 0.78 && a.x > -0.78 + (a.y - 0.45) * 0.4 && a.x < -0.62 + (a.y - 0.45) * 0.4 && a.y > 0.45 && a.y < 0.64) return 3.0;
  if (a.z > 0.7 && a.y > 0.22 && a.y < 0.88 && (abs(a.x - 0.85) < 0.006 || abs(a.x + 0.45) < 0.006)) return 3.0;
  return 0.0;
}
`;
