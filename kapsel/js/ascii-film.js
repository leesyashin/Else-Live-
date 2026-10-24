// ASCII-Hintergrund als kurzer Film, der sich endlos wiederholt:
// Ein Hanfsamen keimt und wächst zur großen Pflanze; die Kamera zoomt in die
// Sonne, aus der Sonne schwappt das Bild auf eine Mofa-Fahrt an der Küste;
// die Straße führt in Serpentinen auf einen Berg; oben setzt sich ein junger
// Mann mit lockigen Haaren auf eine Bank, dreht im Sonnenuntergang einen
// Joint, zündet ihn an und raucht; die Kamera fährt in den Rauch, der sich zu
// einem Samen zusammenzieht, und alles beginnt von vorn.
//
// Gerechnet wird in zwei Durchgängen. FILM zeichnet die Szene in ein kleines
// Bild mit einem Pixel pro Zeichenzelle (vier Proben je Zelle); ZEICHEN setzt
// dann echte Schriftzeichen aus einem Atlas nach Dichte ein. Die Zeichen
// stehen fest im Raster und fliegen nie: Neues taucht Zelle für Zelle in
// zufälliger Reihenfolge aus dem Nichts auf, auch beim Szenenwechsel.

// Dauer jeder Szene in Sekunden (ohne die Überblendung davor).
export const DAUERN = [12, 9, 11, 11, 28, 11];
export const SZENEN = DAUERN.length;

export const ASCII_FILM = `
precision highp float;
uniform vec2 uRes;      // Canvas in Pixeln
uniform vec2 uZelle;    // Zeichenzelle in Pixeln (Breite, Höhe)
uniform vec4 uRahmen;   // Mitte des Bildes (uv), Höhe (uv), Seitenverhältnis
uniform vec2 uSzeneA;   // laufende Szene, ihre Zeit
uniform vec2 uSzeneB;   // nächste Szene, ihre Zeit
uniform float uMischung;
uniform float uZeit;
uniform float uDunkel;
uniform vec3 uZeiger;   // x, y in Canvas-Pixeln, Stärke 0 … 1
uniform vec2 uNeigung;

float rauschen(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 zufall2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float gradRauschen(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(dot(zufall2(i), f), dot(zufall2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(zufall2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)), dot(zufall2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}

mat2 drehung(float w) { float c = cos(w), s = sin(w); return mat2(c, -s, s, c); }
float sanft(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
float ellipse(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }
float kasten(vec2 p, vec2 b) { vec2 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); }

// Kantiges Glied von a nach b mit geraden Enden, Breite wa … wb.
float glied(vec2 p, vec2 a, vec2 b, float wa, float wb) {
  vec2 ba = b - a;
  float l = max(length(ba), 1e-5);
  vec2 d = ba / l;
  vec2 q = vec2(dot(p - a, d), dot(p - a, vec2(-d.y, d.x)));
  float w = mix(wa, wb, clamp(q.x / l, 0.0, 1.0));
  vec2 e = vec2(abs(q.y) - w, max(-q.x, q.x - l));
  return length(max(e, 0.0)) + min(max(e.x, e.y), 0.0);
}

// Glied mit weich gerundeten Ecken, etwas schlanker.
float gliedRund(vec2 p, vec2 a, vec2 b, float wa, float wb) {
  float r = min(wa, wb) * 0.45;
  return glied(p, a, b, wa * 0.9 - r, wb * 0.9 - r) - r;
}

float dreieck(vec2 p, vec2 p0, vec2 p1, vec2 p2) {
  vec2 e0 = p1 - p0, e1 = p2 - p1, e2 = p0 - p2;
  vec2 v0 = p - p0, v1 = p - p1, v2 = p - p2;
  vec2 q0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
  vec2 q1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
  vec2 q2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
  float s = sign(e0.x * e2.y - e0.y * e2.x);
  vec2 d = min(min(vec2(dot(q0, q0), s * (v0.x * e0.y - v0.y * e0.x)),
                   vec2(dot(q1, q1), s * (v1.x * e1.y - v1.y * e1.x))),
                   vec2(dot(q2, q2), s * (v2.x * e2.y - v2.y * e2.x)));
  return -sqrt(d.x) * sign(d.y);
}
float viereck(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) { return min(dreieck(p, a, b, c), dreieck(p, a, c, d)); }

const vec3 ERDE = vec3(0.6, 0.4, 0.22);
const vec3 GRUEN = vec3(0.3, 0.76, 0.3);
const vec3 SAMEN = vec3(0.66, 0.54, 0.34);
const vec3 SONNE = vec3(1.0, 0.78, 0.22);
const vec3 GLUT = vec3(1.0, 0.42, 0.1);
const vec3 MEER = vec3(0.22, 0.5, 0.95);
const vec3 ABEND = vec3(0.95, 0.34, 0.5);
const vec3 VIOLETT = vec3(0.58, 0.44, 0.92);
const vec3 HAUT = vec3(0.93, 0.66, 0.5);
const vec3 HAAR = vec3(0.45, 0.28, 0.15);
const vec3 JEANS = vec3(0.3, 0.46, 0.82);
const vec3 HEMD = vec3(0.96, 0.94, 0.88);
const vec3 HOLZ = vec3(0.68, 0.46, 0.26);
const vec3 MINZE = vec3(0.3, 0.8, 0.72);
const vec3 RAUCH = vec3(0.74, 0.72, 0.88);
const vec3 WARM = vec3(1.0, 0.86, 0.5);
const vec3 BERG = vec3(0.55, 0.62, 0.32);

// Maler: jede Szene trägt Schicht für Schicht Dichte (0 leer … 1 voll) und
// eine Akzentfarbe mit Menge (0 grau … 1 ganz farbig) auf.
float gD;
vec4 gAk;
float gKante;
float gA;
float gZ;          // Zufall der Zelle: wann sie beim Auftauchen dran ist
float gErschein;   // wie weit die gerade gemalten Teile schon da sind
vec4 gTon;         // Licht der Situation, färbt alle Akzente ein
float gAder;

float voll(float d) { return clamp(0.5 - d / gKante, 0.0, 1.0); }
// Haarlinie, immer mindestens eine halbe Zeichenzeile stark.
float linie(float d) { return voll(abs(d) - gKante * 0.7); }
// 0 … 1: welche Zellen schon da sind; jede Zelle taucht für sich auf.
float auftauchen(float f) { return smoothstep(gZ - 0.06, gZ + 0.06, f * 1.12 - 0.06); }

void malen(float c, float v, vec3 farbe, float menge) {
  c *= gErschein;
  if (c <= 0.0) return;
  if (menge > 0.0) {
    farbe = mix(farbe, gTon.rgb, gTon.a);
    gAk.rgb = gAk.a > 0.001 ? mix(gAk.rgb, farbe, c) : farbe;
  }
  gAk.a = mix(gAk.a, menge, c);
  gD = mix(gD, v, c);
}
void grau(float c, float v) { malen(c, v, vec3(0.0), 0.0); }
// Ein Teil mit schmalem leeren Rand, damit es sich von dem dahinter abhebt.
// Der Rand ist in Figur-Einheiten fest: groß im Bild deutlich, klein kaum.
void teil(float d, float v, vec3 farbe, float menge) {
  grau(voll(d - 0.013), 0.03);
  malen(voll(d), v, farbe, menge);
}
void leuchten(float v, vec3 farbe, float menge) {
  v *= gErschein;
  if (v <= gD) return;
  float e = gErschein;
  gErschein = 1.0;
  malen(clamp((v - gD) / v, 0.0, 1.0), v, farbe, menge);
  gErschein = e;
}

// ---------- Bausteine ----------

void sonneMalen(vec2 p, vec2 m, float r, float horizont, vec3 farbe) {
  float ueber = smoothstep(horizont - 0.004, horizont + 0.004, p.y);
  float d = length(p - m);
  leuchten(exp(-max(d - r, 0.0) / (r * 0.35 + 0.02)) * 0.22 * ueber, farbe, 0.6);
  malen(voll(d - r) * ueber, 0.7 + 0.3 * (1.0 - d / r), farbe, 0.9);
}

void meer(vec2 p, float t, float horizont, vec2 licht, float glanz, vec3 farbe) {
  float w = horizont - p.y;
  if (w <= 0.0) return;
  float z = 1.0 / (w + 0.03);
  float x = p.x * z;
  float s = sin(z * 0.9 + t * 0.8 + 0.7 * sin(x * 0.4 + t * 0.3));
  float strich = smoothstep(-0.05, 0.3, gradRauschen(vec2(x * 0.45 + t * 0.04, z * 0.25)));
  malen(smoothstep(0.45, 0.9, s) * strich * smoothstep(0.0, 0.08, w), 0.32, MEER, 0.5);
  grau(linie(w), 0.3);
  float breite = 0.035 + w * 0.32;
  float spalte = 1.0 - smoothstep(breite * 0.35, breite, abs(p.x - licht.x));
  float funkeln = smoothstep(0.12, 0.42, gradRauschen(vec2(p.x * 26.0, z * 2.0 - t * 1.1)));
  malen(spalte * funkeln * glanz, 0.7, farbe, 0.85);
}

// Abendhimmel: wenige waagerechte Wolkenstreifen, unten orange, oben violett.
void abendhimmel(vec2 p, float horizont, float staerke) {
  float y = p.y - horizont;
  if (y <= 0.0) return;
  float streifen = smoothstep(0.55, 0.95, sin(y * 55.0 + gradRauschen(vec2(p.x * 2.5, y * 4.0)) * 3.0));
  float lage = smoothstep(0.02, 0.1, y) * (1.0 - smoothstep(0.3, 0.45, y));
  vec3 farbe = mix(GLUT, mix(ABEND, VIOLETT, smoothstep(0.2, 0.4, y)), smoothstep(0.03, 0.22, y));
  malen(streifen * lage * staerke * smoothstep(-0.2, 0.3, gradRauschen(vec2(p.x * 3.0, y * 9.0))), 0.22, farbe, 0.8);
}

void rad(vec2 p, vec2 m, float r, float winkel) {
  vec2 q = p - m;
  float d = length(q);
  float a = atan(q.y, q.x) + winkel;
  float speiche = smoothstep(0.6, 0.95, cos(a * 3.0)) * step(d, r * 0.55);
  grau(voll(d - r), d > r * 0.62 ? 0.82 : 0.35 + 0.5 * speiche);
}

// Hanfblatt mit sieben gezackten Fingern; Stiel am Ursprung, zeigt nach +y.
float blatt(vec2 p, float s) {
  gAder = 1.0;
  if (s < 0.002) return 1.0;
  float d = 1e3;
  for (int i = 0; i < 7; i++) {
    float fi = float(i) - 3.0;
    float a = abs(fi);
    float winkel = sign(fi) * (a < 0.5 ? 0.0 : a < 1.5 ? 0.42 : a < 2.5 ? 0.9 : 1.45);
    float laenge = (a < 0.5 ? 1.0 : a < 1.5 ? 0.86 : a < 2.5 ? 0.62 : 0.34) * s;
    vec2 q = drehung(winkel) * p;
    float u = clamp(q.y / laenge, 0.0, 1.0);
    float breite = laenge * 0.11 * pow(max(sin(3.1416 * u), 0.0), 0.75) * (1.0 + 0.14 * sin(u * 38.0));
    float f = max(abs(q.x) - breite, max(-q.y, q.y - laenge));
    if (f < d) {
      d = f;
      gAder = abs(q.x) / max(breite, 1e-4);
    }
  }
  return d;
}

void samenMalen(vec2 p, vec2 m, float s) {
  vec2 q = drehung(0.35) * (p - m) / s;
  q.x *= 1.0 + 0.35 * q.y / 0.05;
  float d = ellipse(q, vec2(0.034, 0.05)) * s;
  float muster = smoothstep(0.1, 0.5, gradRauschen(q * vec2(70.0, 28.0)));
  malen(voll(d), 0.5 + 0.3 * muster, SAMEN, 0.85);
  grau(voll(abs(q.x + 0.004) - 0.003) * voll(d + 0.004), 0.85);
}

// ---------- Figur: junger Mann, kantig abstrahiert ----------

struct Pose { vec2 h; vec2 k; vec2 f; vec2 k2; vec2 f2; vec2 s; vec2 e; vec2 w; vec2 e2; vec2 w2; vec2 c; float kipp; };

Pose poseMix(Pose a, Pose b, float t) {
  Pose r;
  r.h = mix(a.h, b.h, t); r.k = mix(a.k, b.k, t); r.f = mix(a.f, b.f, t);
  r.k2 = mix(a.k2, b.k2, t); r.f2 = mix(a.f2, b.f2, t); r.s = mix(a.s, b.s, t);
  r.e = mix(a.e, b.e, t); r.w = mix(a.w, b.w, t); r.e2 = mix(a.e2, b.e2, t);
  r.w2 = mix(a.w2, b.w2, t); r.c = mix(a.c, b.c, t); r.kipp = mix(a.kipp, b.kipp, t);
  return r;
}

// Gelenke in Figur-Einheiten: Boden bei 0, stehend etwa 1 hoch, Blick nach rechts.
Pose stehen() {
  Pose p;
  p.h = vec2(0.0, 0.5); p.k = vec2(0.02, 0.27); p.f = vec2(0.0, 0.06);
  p.k2 = vec2(-0.01, 0.27); p.f2 = vec2(-0.04, 0.06);
  p.s = vec2(-0.005, 0.8); p.e = vec2(0.005, 0.63); p.w = vec2(0.03, 0.48);
  p.e2 = vec2(-0.03, 0.63); p.w2 = vec2(-0.02, 0.48);
  p.c = vec2(0.02, 0.92); p.kipp = 0.0;
  return p;
}
Pose sitzen() {
  Pose p;
  p.h = vec2(-0.04, 0.34); p.k = vec2(0.18, 0.36); p.f = vec2(0.17, 0.06);
  p.k2 = vec2(0.16, 0.35); p.f2 = vec2(0.13, 0.06);
  p.s = vec2(-0.02, 0.64); p.e = vec2(0.05, 0.48); p.w = vec2(0.17, 0.43);
  p.e2 = vec2(0.03, 0.48); p.w2 = vec2(0.14, 0.42);
  p.c = vec2(0.03, 0.76); p.kipp = 0.0;
  return p;
}
Pose drehen() {
  Pose p = sitzen();
  p.s = vec2(0.0, 0.63); p.e = vec2(0.07, 0.48); p.w = vec2(0.16, 0.56);
  p.e2 = vec2(0.05, 0.48); p.w2 = vec2(0.12, 0.55);
  p.c = vec2(0.05, 0.75); p.kipp = -0.35;
  return p;
}
Pose rauchen() {
  Pose p = sitzen();
  p.e = vec2(0.1, 0.53); p.w = vec2(0.11, 0.705);
  p.c = vec2(0.035, 0.765); p.kipp = 0.08;
  return p;
}
Pose fahren() {
  Pose p;
  p.h = vec2(-0.14, 0.44); p.k = vec2(0.07, 0.41); p.f = vec2(0.09, 0.15);
  p.k2 = vec2(0.05, 0.41); p.f2 = vec2(0.05, 0.15);
  p.s = vec2(-0.07, 0.74); p.e = vec2(0.05, 0.63); p.w = vec2(0.2, 0.68);
  p.e2 = vec2(0.04, 0.62); p.w2 = vec2(0.19, 0.67);
  p.c = vec2(-0.03, 0.86); p.kipp = 0.0;
  return p;
}

float kopf(vec2 r) {
  vec2 m = vec2(0.0);
  float d = dreieck(r, m, vec2(-0.075, 0.0), vec2(-0.05, 0.075));
  d = min(d, dreieck(r, m, vec2(-0.05, 0.075), vec2(0.035, 0.085)));
  d = min(d, dreieck(r, m, vec2(0.035, 0.085), vec2(0.075, 0.035)));
  d = min(d, dreieck(r, m, vec2(0.075, 0.035), vec2(0.08, 0.008)));
  d = min(d, dreieck(r, m, vec2(0.08, 0.008), vec2(0.102, -0.018)));
  d = min(d, dreieck(r, m, vec2(0.102, -0.018), vec2(0.077, -0.04)));
  d = min(d, dreieck(r, m, vec2(0.077, -0.04), vec2(0.066, -0.078)));
  d = min(d, dreieck(r, m, vec2(0.066, -0.078), vec2(-0.015, -0.072)));
  d = min(d, dreieck(r, m, vec2(-0.015, -0.072), vec2(-0.075, 0.0)));
  return d;
}

// Mittellange Locken: spitz gezackter Umriss über Oberkopf und Hinterkopf
// bis unter das Kinn, Gesicht und Hals bleiben frei.
float haare(vec2 r, float wind, out float locke) {
  float a = atan(r.y, r.x);
  locke = abs(sin(a * 11.0 + wind));
  vec2 rr = r * vec2(1.0, r.x < 0.0 && r.y < 0.0 ? 0.72 : 1.0);
  float d = length(rr) - (0.092 + 0.014 * locke);
  d = max(d, -max(0.014 - r.x, r.y - 0.03));
  d = max(d, -max(r.y + 0.045, -0.022 - r.x));
  return d;
}

void figur(vec2 p, Pose P, vec2 ort, float s, float wind) {
  vec2 q = (p - ort) / s;
  float kante = gKante;
  gKante /= s;
  // Ferne Seite, dunkler
  teil(min(gliedRund(q, P.h, P.k2, 0.06, 0.048), gliedRund(q, P.k2, P.f2, 0.046, 0.036)), 0.32, JEANS, 0.45);
  teil(viereck(q, P.f2 + vec2(-0.035, 0.02), P.f2 + vec2(-0.04, -0.04), P.f2 + vec2(0.1, -0.04), P.f2 + vec2(0.075, 0.0)), 0.5, HEMD, 0.0);
  vec2 d2 = normalize(P.w2 - P.e2);
  teil(min(gliedRund(q, P.s, P.e2, 0.036, 0.031), min(gliedRund(q, P.e2, P.w2, 0.03, 0.024), gliedRund(q, P.w2, P.w2 + d2 * 0.05, 0.024, 0.014))), 0.5, HAUT, 0.5);
  // Beine in Jeans, weiße Schuhe
  teil(min(gliedRund(q, P.h, P.k, 0.066, 0.052), gliedRund(q, P.k, P.f, 0.049, 0.038)), 0.5, JEANS, 0.65);
  teil(viereck(q, P.f + vec2(-0.035, 0.02), P.f + vec2(-0.04, -0.04), P.f + vec2(0.11, -0.04), P.f + vec2(0.08, 0.0)), 0.85, HEMD, 0.0);
  // Oberkörper im hellen Shirt, Hals
  teil(gliedRund(q, P.c + vec2(-0.01, -0.06), P.s + vec2(0.012, 0.0), 0.022, 0.024), 0.75, HAUT, 0.55);
  teil(gliedRund(q, P.h, P.s, 0.072, 0.088), 0.62, HEMD, 0.3);
  // Kopf: helles Gesicht mit Auge, darüber die Locken
  vec2 r = drehung(-P.kipp) * (q - P.c);
  teil(kopf(r * 1.04) - 0.006, 0.8, HAUT, 0.55);
  grau(voll(glied(r, vec2(0.038, 0.016), vec2(0.062, 0.013), 0.007, 0.006)), 0.1);
  float locke;
  float dH = haare(r, wind, locke);
  float kringel = smoothstep(0.1, 0.7, sin(r.x * 150.0 + 2.0 * sin(r.y * 90.0)) * sin(r.y * 150.0));
  teil(dH, 0.22 + 0.3 * max(kringel, 0.5 * locke), HAAR, 0.85);
  // Naher Arm mit Ärmel zuletzt, er liegt vor allem
  vec2 d1 = normalize(P.w - P.e);
  teil(min(gliedRund(q, P.e, P.w, 0.031, 0.024), gliedRund(q, P.w, P.w + d1 * 0.052, 0.026, 0.015)), 0.8, HAUT, 0.55);
  teil(gliedRund(q, P.s, P.e, 0.04, 0.033), 0.66, HEMD, 0.3);
  gKante = kante;
}

// Mofa im Vespa-Stil, kantig; Boden bei 0, Räder 0,09 groß.
void mofa(vec2 p, vec2 ort, float s, float weg, float richtung) {
  vec2 q = (p - ort) / s;
  q.x *= richtung;
  float kante = gKante;
  gKante /= s;
  rad(q, vec2(-0.27, 0.09), 0.09, weg / (0.09 * s));
  rad(q, vec2(0.3, 0.09), 0.09, weg / (0.09 * s));
  float dK = viereck(q, vec2(-0.42, 0.15), vec2(-0.08, 0.15), vec2(-0.08, 0.36), vec2(-0.34, 0.33));
  dK = min(dK, viereck(q, vec2(-0.08, 0.1), vec2(0.21, 0.1), vec2(0.21, 0.15), vec2(-0.08, 0.15)));
  dK = min(dK, viereck(q, vec2(0.17, 0.1), vec2(0.25, 0.1), vec2(0.29, 0.52), vec2(0.23, 0.52)));
  dK = min(dK, dreieck(q, vec2(0.2, 0.17), vec2(0.41, 0.17), vec2(0.3, 0.23))) - 0.012;
  malen(voll(dK), 0.5 + 0.3 * smoothstep(0.1, 0.35, q.y), MINZE, 0.75);
  malen(linie(dK), 0.85, MINZE, 0.9);
  grau(voll(min(glied(q, vec2(0.27, 0.5), vec2(0.26, 0.67), 0.016, 0.014), glied(q, vec2(0.15, 0.68), vec2(0.31, 0.7), 0.015, 0.015))), 0.6);
  malen(voll(kasten(q - vec2(0.31, 0.62), vec2(0.025, 0.022))), 1.0, WARM, 0.6);
  grau(voll(viereck(q, vec2(-0.35, 0.36), vec2(-0.06, 0.36), vec2(-0.08, 0.42), vec2(-0.33, 0.42))), 0.3);
  gKante = kante;
}

// Bank von der Seite: Sitz, Bein, schräge Lehne nach hinten (links).
void bank(vec2 p, vec2 ort, float s) {
  vec2 q = (p - ort) / s;
  float kante = gKante;
  gKante /= s;
  float d = viereck(q, vec2(-0.22, 0.26), vec2(0.22, 0.26), vec2(0.22, 0.3), vec2(-0.22, 0.3));
  d = min(d, min(glied(q, vec2(-0.16, 0.0), vec2(-0.16, 0.26), 0.016, 0.016), glied(q, vec2(0.17, 0.0), vec2(0.17, 0.26), 0.016, 0.016)));
  d = min(d, glied(q, vec2(-0.19, 0.27), vec2(-0.27, 0.64), 0.016, 0.014));
  d = min(d, min(glied(q, vec2(-0.235, 0.44), vec2(-0.25, 0.51), 0.024, 0.024), glied(q, vec2(-0.255, 0.55), vec2(-0.27, 0.62), 0.024, 0.024)));
  malen(voll(d - 0.006), 0.55, HOLZ, 0.75);
  gKante = kante;
}

// Figur und Mofa werden nur an einer Stelle gezeichnet (hält den Shader
// klein); die Szenen legen dafür Pose und Platz fest.
bool gMitFigur;
Pose gPose;
vec2 gFP;
vec2 gFOrt;
float gFS;
float gFWind;
bool gMitMofa;
vec2 gMOrt;
float gMS;
float gMWeg;
float gKanteBasis;

void zeigeFigur(vec2 p, Pose P, vec2 ort, float s, float wind) {
  gMitFigur = true;
  gPose = P;
  gFP = p;
  gFOrt = ort;
  gFS = s;
  gFWind = wind;
}
void zeigeMofa(vec2 ort, float s, float weg) {
  gMitMofa = true;
  gMOrt = ort;
  gMS = s;
  gMWeg = weg;
}

// ---------- Szene 0: Ein Samen keimt und wächst zur Pflanze ----------

void erde(vec2 p, float t) {
  float y0 = -0.3;
  if (p.y < y0) {
    float krume = step(0.72, rauschen(floor(p * vec2(70.0, 42.0))));
    malen(krume * smoothstep(-0.5, -0.32, p.y), 0.16, ERDE, 0.75);
  }
  malen(linie(p.y - y0), 0.4, ERDE, 0.7);
}

void pflanze(vec2 p, float wuchs, float t) {
  float H = 0.66 * wuchs;
  if (H < 0.003) return;
  float schwanken = 0.02 * sin(t * 0.7) * wuchs;
  vec2 b = vec2(0.0, -0.3);
  vec2 a = b;
  float dS = 1e3;
  for (int i = 1; i <= 4; i++) {
    float u = float(i) / 4.0;
    vec2 n = b + vec2(schwanken * u * u, H * u);
    dS = min(dS, glied(p, a, n, mix(0.013, 0.006, u - 0.25) * sqrt(wuchs), mix(0.013, 0.006, u) * sqrt(wuchs)));
    a = n;
  }
  malen(voll(dS), 0.6, GRUEN, 0.8);
  // Keimblätter unten
  float kg = sanft(H / 0.06);
  for (int j = 0; j < 2; j++) {
    float seite = float(j) * 2.0 - 1.0;
    vec2 q = drehung(seite * 0.4) * (p - vec2(seite * 0.03 * kg, -0.255));
    malen(voll(ellipse(q, vec2(0.026, 0.011) * kg + 0.0005)), 0.55, GRUEN, 0.8);
  }
  // Fächerblätter an vier Knoten, je zwei gegenüber
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float hn = 0.13 + 0.17 * fi;
    float lg = sanft((H - hn - 0.02) / 0.16);
    if (lg <= 0.0) continue;
    vec2 basis = b + vec2(schwanken * (hn / H) * (hn / H), hn);
    for (int j = 0; j < 2; j++) {
      float seite = float(j) * 2.0 - 1.0;
      float w = -seite * (1.3 - 0.15 * fi) + 0.04 * sin(t * 0.9 + fi);
      vec2 q = drehung(w) * (p - basis);
      float groesse = (0.19 - 0.035 * fi) * lg;
      malen(voll(glied(q, vec2(0.0), vec2(0.0, 0.06 * lg), 0.004, 0.003)), 0.55, GRUEN, 0.8);
      float d = blatt(q - vec2(0.0, 0.055 * lg), groesse);
      malen(voll(d), 0.32 + 0.5 * (1.0 - smoothstep(0.0, 0.4, gAder)), GRUEN, 0.85);
    }
  }
  vec2 spitze = b + vec2(schwanken, H);
  float d = blatt(drehung(-schwanken * 3.0) * (p - spitze + vec2(0.0, 0.01)), 0.1 * sanft(H / 0.2));
  malen(voll(d), 0.32 + 0.5 * (1.0 - smoothstep(0.0, 0.4, gAder)), GRUEN, 0.85);
}

void keimen(vec2 p, float t) {
  erde(p, t);
  // Wurzeln wachsen in die Erde
  float wl = 0.13 * sanft((t - 2.0) / 5.0);
  if (wl > 0.002 && p.y < -0.3) {
    float d = glied(p, vec2(0.0, -0.31), vec2(0.008, -0.31 - wl), 0.005, 0.002);
    d = min(d, glied(p, vec2(0.003, -0.34), vec2(-0.05, -0.34 - wl * 0.5), 0.003, 0.002));
    d = min(d, glied(p, vec2(0.005, -0.36), vec2(0.05, -0.36 - wl * 0.45), 0.003, 0.002));
    malen(voll(d), 0.4, ERDE, 0.6);
  }
  float e = gErschein;
  gErschein = auftauchen(1.0 - (t - 3.0) / 1.6);
  samenMalen(p, vec2(0.0, -0.31), 1.0);
  gErschein = e;
  float g = sanft((t - 2.6) / 9.0);
  pflanze(p, 1.0 - (1.0 - g) * (1.0 - g), t);
  // Gegen Ende erscheint oben die Sonne
  gErschein = auftauchen((t - 9.0) / 2.5);
  sonneMalen(p, vec2(0.3, 0.32), 0.05, -1.0, SONNE);
  gErschein = e;
}

// ---------- Szene 1: Zoom in die Sonne ----------

void sonnenzoom(vec2 p, float t) {
  float z = exp(2.4 * sanft((t - 1.0) / 9.0));
  vec2 ziel = vec2(0.3, 0.32);
  vec2 m = mix(ziel, vec2(0.0), sanft((t - 0.5) / 7.0));
  vec2 welt = ziel + (p - m) / z;
  // Die Pflanze bleibt zurück und löst sich auf
  float e = gErschein;
  float kante = gKante;
  gErschein = auftauchen(1.0 - t / 4.0);
  gKante /= z;
  erde(welt, 12.0);
  pflanze(welt, 1.0, t + 12.0);
  gKante = kante;
  gErschein = e;
  float r = 0.05 * z;
  float d = length(p - m);
  vec3 farbe = mix(SONNE, GLUT, sanft((z - 2.0) / 9.0) * 0.7);
  // Strahlen tauchen nach und nach auf
  float a = atan(p.y - m.y, p.x - m.x);
  float strahl = smoothstep(0.55, 0.95, cos(a * 10.0 + t * 0.12)) * exp(-max(d - r, 0.0) / (r * 0.9 + 0.05));
  gErschein = auftauchen((t - 1.0) / 3.0);
  malen(strahl * step(r, d), 0.3, farbe, 0.7);
  gErschein = e;
  leuchten(exp(-max(d - r, 0.0) / (r * 0.25 + 0.015)) * 0.3, farbe, 0.6);
  float korn = gradRauschen((p - m) / r * 3.0 + t * 0.15);
  malen(voll(d - r), 0.62 + 0.22 * (1.0 - d / r) + 0.14 * korn, farbe, 0.9);
}

// ---------- Szene 2: Mofa-Fahrt an der Küste ----------

void zypressen(vec2 p, float weg) {
  float x = p.x + weg;
  float zelle = floor(x / 0.3);
  float lx = mod(x, 0.3) - 0.15;
  float z = rauschen(vec2(zelle, 5.1));
  if (z < 0.55) return;
  float boden = -0.12;
  float hoehe = 0.2 + 0.08 * z;
  float u = (p.y - boden) / hoehe;
  if (u < 0.0 || u > 1.0) return;
  float w = 0.045 * pow(1.0 - u, 0.8) * smoothstep(0.0, 0.3, u) + 0.008 * step(u, 0.06);
  malen(voll(abs(lx) - w), 0.42 + 0.25 * smoothstep(w, -w, lx), GRUEN, 0.45);
}

// Häuser am Hang der Landzunge, bunt wie an der Ligurischen Küste.
void haeuser(vec2 p, float weg) {
  float x = p.x + weg;
  float kamm = 0.0 + 0.11 * exp(-pow((x + 0.4) * 2.0, 2.0)) + 0.05 * exp(-pow((x - 0.9) * 2.5, 2.0));
  if (p.y > 0.0) grau(voll(p.y - kamm), 0.12);
  grau(linie(p.y - kamm) * step(0.003, kamm - 0.0), 0.35);
  vec2 g = vec2(x / 0.05, (p.y - 0.004) / 0.035);
  vec2 gi = floor(g);
  float z = rauschen(gi + 3.3);
  float unter = kamm - (gi.y + 1.0) * 0.035 - 0.004;
  if (z > 0.55 && unter > 0.0 && p.y > 0.0) {
    vec2 f = fract(g);
    float haus = step(0.12, f.x) * step(f.x, 0.88) * step(0.1, f.y) * step(f.y, 0.92);
    vec3 farbe = z > 0.85 ? vec3(0.95, 0.55, 0.45) : z > 0.7 ? vec3(0.98, 0.82, 0.45) : vec3(0.95, 0.9, 0.8);
    malen(haus, 0.55, farbe, 0.6);
    grau(haus * step(0.4, f.x) * step(f.x, 0.6) * step(0.35, f.y) * step(f.y, 0.65), 0.15);
  }
}

void strasse(vec2 p, float weg) {
  float oben = -0.215, unten = -0.315;
  grau(linie(p.y - oben), 0.35);
  grau(linie(p.y - unten), 0.3);
  grau(linie(p.y + 0.265) * step(fract((p.x + weg) / 0.16), 0.55), 0.5);
  float tiefe = unten - 0.014 - p.y;
  if (tiefe > 0.0 && tiefe < 0.05) {
    float sx = p.x + weg * 1.25;
    vec2 st = vec2(mod(sx, 0.09) - 0.045, tiefe - 0.024);
    grau(voll(kasten(st, vec2(0.036, 0.017))), 0.22 + 0.14 * rauschen(vec2(floor(sx / 0.09), 2.0)));
  }
}

void kueste(vec2 p, float t) {
  float k = sanft(t / 4.0);
  vec2 sm = mix(vec2(0.0), vec2(0.28, 0.25), k);
  float sr = mix(0.55, 0.09, k);
  sonneMalen(p, sm, sr, -1.0, mix(GLUT, SONNE, k));
  float weg = t * 0.22;
  // Alles andere taucht aus dem Nichts auf, während die Sonne kleiner wird
  gErschein = auftauchen((t - 0.6) / 3.2);
  if (p.y > -0.215) meer(p, t, 0.0, sm, 0.8, SONNE);
  float X = p.x + weg * 0.35;
  float kamm = -0.11 + 0.02 * sin(X * 2.1) + 0.01 * sin(X * 5.3);
  if (p.y < kamm) grau(voll(p.y - kamm), 0.1 * smoothstep(0.3, 0.6, gradRauschen(vec2(X * 30.0, p.y * 40.0))));
  grau(linie(p.y - kamm), 0.3);
  zypressen(p, weg * 0.55);
  strasse(p + vec2(0.0, 0.05), weg);
  Pose f = fahren();
  vec2 ort = vec2(-0.02, -0.3 + 0.003 * sin(t * 9.0));
  zeigeMofa(ort, 0.58, weg);
  zeigeFigur(p, f, ort, 0.58, t * 3.0);
}

// ---------- Szene 3: In Serpentinen auf den Berg ----------

vec2 pfadPunkt(int i) {
  if (i == 0) return vec2(-0.55, -0.42);
  if (i == 1) return vec2(0.05, -0.31);
  if (i == 2) return vec2(-0.2, -0.2);
  if (i == 3) return vec2(0.12, -0.085);
  if (i == 4) return vec2(-0.05, 0.02);
  return vec2(0.15, 0.115);
}

void bergfahrt(vec2 p, float t) {
  float h = -0.06;
  gTon = vec4(GLUT, 0.15);
  vec2 sonne = vec2(min(gA * 0.5 - 0.1, 0.45), 0.29);
  sonneMalen(p, sonne, 0.06, h, mix(SONNE, GLUT, 0.5));
  meer(p, t, h, sonne, 0.6, GLUT);
  // Berg mit zwei Flanken, die rechte im Licht
  float links = -0.42 + (p.x + 0.55) / 0.75 * 0.58 + 0.015 * abs(fract(p.x * 7.0) - 0.5);
  float rechts = 0.16 - (p.x - 0.2) * 0.9;
  float grat = min(links, rechts);
  float innen = voll(p.y - grat);
  float schraffur = p.x > 0.2 ? step(0.62, fract((p.x * 0.6 + p.y) * 26.0)) * 0.28 : step(0.93, rauschen(floor(p * vec2(80.0, 48.0)))) * 0.14;
  malen(innen, schraffur, BERG, 0.6);
  malen(linie(p.y - grat), 0.6, BERG, 0.6);
  // Serpentinen
  float dW = 1e3;
  float laenge = 0.0;
  for (int i = 0; i < 5; i++) {
    vec2 a = pfadPunkt(i), b = pfadPunkt(i + 1);
    dW = min(dW, glied(p, a, b, 0.011, 0.009));
    laenge += length(b - a);
  }
  grau(voll(dW) * innen, 0.62);
  // Oben Bank und Pinie
  bank(p, vec2(0.21, 0.13), 0.15);
  grau(voll(glied(p, vec2(0.1, 0.1), vec2(0.09, 0.22), 0.006, 0.004)), 0.5);
  malen(voll(ellipse(p - vec2(0.09, 0.235), vec2(0.07, 0.024))), 0.5, GRUEN, 0.6);
  // Das Mofa fährt den Weg hinauf, klein, mit Fahrer
  float ziel = laenge * sanft((t - 0.6) / 10.4);
  vec2 ort = pfadPunkt(0);
  vec2 dir = vec2(1.0, 0.0);
  float rest = ziel;
  for (int i = 0; i < 5; i++) {
    vec2 a = pfadPunkt(i), b = pfadPunkt(i + 1);
    float l = length(b - a);
    if (rest >= 0.0) {
      float u = clamp(rest / l, 0.0, 1.0);
      ort = mix(a, b, u);
      dir = (b - a) / l;
    }
    rest -= l;
  }
  float seite = sign(dir.x);
  // In Fahrtrichtung gespiegelt und mit dem Hang geneigt
  vec2 q = drehung(atan(dir.y, abs(dir.x)) * seite) * (p - ort);
  q.x *= seite;
  q += ort;
  zeigeMofa(ort, 0.15, ziel);
  zeigeFigur(q, fahren(), ort, 0.15, t * 3.0);
}

// ---------- Szene 4: Auf der Bank: hinsetzen, drehen, anzünden, rauchen ----------

void bankSzene(vec2 p, float t) {
  // Kamera: weit, dann nah an Oberkörper und Gesicht
  float nah = sanft((t - 8.0) / 3.0) - 0.2 * sanft((t - 20.0) / 3.0);
  float zoom = 1.0 + 1.5 * nah;
  vec2 mitte = mix(vec2(0.0), vec2(0.07, -0.02), nah);
  vec2 w = mitte + p / zoom;
  gKante /= zoom;
  float sinken = sanft(t / 30.0);
  gTon = vec4(GLUT, 0.12 + 0.2 * sinken);

  float h = -0.12;
  abendhimmel(w, h, 1.0);
  sonneMalen(w, vec2(0.33, mix(0.0, -0.1, sinken)), 0.1, h, mix(GLUT, ABEND, sinken * 0.5));
  meer(w, t, h, vec2(0.33), 0.8, GLUT);
  // Gipfel: Wiese, die rechts zum Meer abfällt
  float boden = -0.36;
  float kamm = boden - max(w.x - 0.2, 0.0) * 0.6;
  grau(voll(w.y - kamm), 0.0);
  malen(voll(w.y - kamm) * step(0.75, rauschen(floor(w * vec2(70.0, 42.0)))), 0.16, BERG, 0.6);
  malen(linie(w.y - kamm), 0.45, BERG, 0.6);

  zeigeMofa(vec2(-0.43, boden), 0.4, 0.0);
  vec2 ort = vec2(-0.02, boden);
  float s = 0.5;
  bank(w, ort + vec2(-0.02, 0.0) * s, s);

  // Ablauf
  Pose P = poseMix(stehen(), sitzen(), sanft((t - 2.5) / 3.0));
  P = poseMix(P, drehen(), sanft((t - 8.5) / 2.0));
  float drehZeit = step(10.5, t) * step(t, 16.0);
  P.w.x += 0.012 * sin(t * 7.0) * drehZeit;
  P.w2.x -= 0.012 * sin(t * 7.0) * drehZeit;
  // Anzünden: Joint an den Mund, die andere Hand bringt das Feuerzeug
  P = poseMix(P, rauchen(), sanft((t - 16.0) / 1.2));
  float feuer = sanft((t - 16.4) / 0.8) * (1.0 - sanft((t - 19.2) / 0.8));
  P.e2 = mix(P.e2, vec2(0.13, 0.57), feuer);
  P.w2 = mix(P.w2, vec2(0.2, 0.67), feuer);
  // Rauchen in Zügen von 5 s
  float zug = mod(t - 20.0, 5.0);
  float amMund = t < 20.0 ? 1.0 : 1.0 - sanft((zug - 1.6) / 0.8) + sanft((zug - 4.2) / 0.8);
  if (t >= 20.0) P = poseMix(sitzen(), rauchen(), amMund);

  zeigeFigur(w, P, ort, s, 0.0);
}

// Was vor der Figur liegt: Joint, Feuer, Glut, Rauch.
void bankNach(float t) {
  Pose P = gPose;
  vec2 w = gFP;
  vec2 ort = gFOrt;
  float s = gFS;
  float feuer = sanft((t - 16.4) / 0.8) * (1.0 - sanft((t - 19.2) / 0.8));
  float zug = mod(t - 20.0, 5.0);
  // Joint in der Hand: beim Drehen zwischen den Händen, danach von der Hand nach vorn
  vec2 q = (w - ort) / s;
  gKante /= s;
  float inHand = sanft((t - 16.0) / 1.2);
  vec2 a = mix(mix(P.w, P.w2, 0.5) + vec2(-0.03, 0.0), P.w + vec2(0.005, 0.01), inHand);
  vec2 b = mix(a + vec2(0.07, 0.008), P.w + vec2(0.08, 0.02), inHand);
  float zeigen = sanft((t - 9.5) / 1.0);
  grau(voll(glied(q, a, b, 0.008, 0.011)) * zeigen, 0.9);
  // Feuerzeug und Flamme
  if (feuer > 0.01) {
    vec2 fz = P.w2 + vec2(0.0, 0.005);
    malen(voll(kasten(q - fz, vec2(0.012, 0.022))), 0.7, ABEND, 0.7);
    float flackern = 0.006 * sin(uZeit * 23.0);
    float dF = dreieck(q, fz + vec2(-0.012, 0.024), fz + vec2(0.012, 0.024), fz + vec2(flackern, 0.075 * feuer));
    malen(voll(dF), 1.0, WARM, 0.95);
    leuchten(exp(-length(q - fz - vec2(0.0, 0.04)) * 18.0) * 0.35 * feuer, GLUT, 0.8);
  }
  // Glut: erst beim Anzünden, hell bei jedem Zug
  float glut = sanft((t - 17.8) / 0.6);
  if (glut > 0.0) {
    float hell = t >= 20.0 ? 0.7 + 0.3 * sanft((zug - 0.5) / 0.4) * (1.0 - sanft((zug - 1.4) / 0.4)) : 0.85;
    hell *= 0.9 + 0.1 * sin(uZeit * 2.5);
    float dG = length(q - b);
    leuchten(exp(-dG * 40.0) * 0.45 * glut * hell, GLUT, 0.85);
    malen(voll(dG - 0.012), hell, GLUT, 1.0);
    // Dünner Faden von der Glut
    vec2 sr = q - b;
    if (sr.y > 0.0) {
      float x = sr.x - sr.y * sr.y * 1.2 - 0.02 * sin(sr.y * 26.0 - t * 1.6) * (0.4 + sr.y * 6.0);
      float band = 1.0 - smoothstep(0.004 + sr.y * 0.02, 0.01 + sr.y * 0.05, abs(x));
      malen(band * glut * (1.0 - smoothstep(0.05, 0.2, sr.y)), 0.4, RAUCH, 0.5);
    }
  }
  // Ausatmen: eine Wolke aus dem Mund, die aufsteigt und wächst
  if (t >= 20.0) {
    float alter = zug - 2.0;
    if (alter > 0.0) {
      vec2 mund = P.c + vec2(0.085, -0.035);
      float gross = 1.0 + 2.5 * sanft((t - 26.0) / 4.0);
      vec2 m = mund + vec2(0.07 * alter, 0.04 * alter + 0.02 * alter * alter);
      float r = (0.02 + 0.055 * alter) * gross;
      vec2 v = (q - m) / r;
      vec2 verzerrt = v + 0.35 * vec2(gradRauschen(v * 1.6 + t * 0.3), gradRauschen(v * 1.6 + 5.0 - t * 0.3));
      float wolke = 1.0 - smoothstep(0.6, 1.0, length(verzerrt));
      float wirbel = 0.5 + 0.5 * sin(length(verzerrt) * 9.0 - t * 2.0 + atan(v.y, v.x) * 2.0);
      malen(wolke * (1.0 - alter / 3.2), 0.25 + 0.2 * wirbel, RAUCH, 0.55);
    }
  }
}

// ---------- Szene 5: In den Rauch, der zum Samen wird ----------

void rauchSamen(vec2 p, float t) {
  vec2 samen = vec2(0.0, -0.31);
  float zieh = sanft((t - 2.0) / 7.0);
  vec2 m = mix(vec2(0.05, 0.05), samen, zieh);
  float R = mix(0.95, 0.0, sanft((t - 2.5) / 6.3));
  vec2 v = p - m;
  float r = length(v);
  float a = atan(v.y, v.x) + 0.35 * gradRauschen(p * 3.0 + t * 0.2);
  float arme = 0.5 + 0.5 * sin(a * 3.0 - log(r + 0.02) * 5.0 + t * (1.0 + t * 0.3));
  float huelle = 1.0 - smoothstep(R * 0.55, R + 0.001, r);
  vec3 farbe = mix(RAUCH, mix(VIOLETT, SAMEN, zieh), zieh);
  malen(smoothstep(0.35, 0.85, arme) * huelle, 0.22 + 0.25 * arme, farbe, 0.55 + 0.3 * zieh);
  // Kurz bevor der Rauch ganz drin ist, leuchtet es auf und der Samen ist da
  leuchten(exp(-length(p - samen) * 14.0) * 0.4 * sanft((t - 7.0) / 1.0) * (1.0 - sanft((t - 9.5) / 1.5)), GRUEN, 0.7);
  float e = gErschein;
  gErschein = auftauchen((t - 8.2) / 1.6);
  samenMalen(p, samen, 1.0);
  gErschein = auftauchen((t - 9.3) / 2.0);
  erde(p, t);
  samenMalen(p, samen, 1.0);
  gErschein = e;
}

// Grundfarbe jeder Szene, für das Zeichenfeld rund um den Zeiger.
vec3 stimmung(float welche, float t) {
  if (welche < 0.5) return mix(ERDE, GRUEN, sanft((t - 3.0) / 6.0));
  if (welche < 1.5) return mix(SONNE, GLUT, sanft((t - 4.0) / 6.0));
  if (welche < 2.5) return mix(SONNE, MEER, sanft(t / 4.0));
  if (welche < 3.5) return mix(BERG, GLUT, 0.45);
  if (welche < 4.5) return mix(GLUT, ABEND, sanft(t / 30.0));
  return mix(VIOLETT, SAMEN, sanft((t - 5.0) / 5.0));
}

void szene(float welche, vec2 p, float t) {
  gD = 0.0;
  gAk = vec4(0.0);
  gErschein = 1.0;
  gTon = vec4(0.0);
  gKante = gKanteBasis;
  gMitFigur = false;
  gMitMofa = false;
  if (welche < 0.5) keimen(p, t);
  else if (welche < 1.5) sonnenzoom(p, t);
  else if (welche < 2.5) kueste(p, t);
  else if (welche < 3.5) bergfahrt(p, t);
  else if (welche < 4.5) bankSzene(p, t);
  else rauchSamen(p, t);
  if (gMitMofa) mofa(gFP, gMOrt, gMS, gMWeg, 1.0);
  if (gMitFigur) figur(gFP, gPose, gFOrt, gFS, gFWind);
  if (welche > 3.5 && welche < 4.5) bankNach(t);
}

// Eine Probe: Tinte (vorgewichtet mit der Dichte) und Dichte.
vec4 probe(vec2 px, vec2 szene_) {
  vec2 uv = (px - 0.5 * uRes) / uRes.y;
  vec2 p = (uv - uRahmen.xy) / uRahmen.z + uNeigung * 0.008;
  // Das Bild läuft zum Rand hin weich aus.
  float rand = smoothstep(0.0, 0.07, gA * 0.5 - abs(p.x)) * smoothstep(0.0, 0.07, 0.5 - abs(p.y));
  if (rand <= 0.0) return vec4(0.0);
  szene(szene_.x, p, szene_.y);
  float d = gD * rand;
  vec3 grauTinte = mix(vec3(0.2), vec3(0.78), uDunkel);
  vec3 farbTinte = mix(gAk.rgb * 0.82, mix(gAk.rgb, vec3(1.0), 0.12), uDunkel);
  return vec4(mix(grauTinte, farbTinte, gAk.a) * d, d);
}

void main() {
  vec2 zelle = floor(gl_FragCoord.xy);
  vec2 mitte = (zelle + 0.5) * uZelle;
  gA = uRahmen.w;
  gKanteBasis = uZelle.y / uRes.y / uRahmen.z * 0.5;
  gZ = rauschen(zelle * 1.31 + 5.2);
  // Szenenwechsel: jede Zelle springt zu ihrer eigenen Zeit in die nächste
  // Szene, mit kurzem Ausblenden dazwischen; so taucht das Neue aus dem Nichts auf.
  float schwelle = rauschen(zelle + 0.71);
  float x = uMischung * 1.3 - 0.15;
  float weg = uMischung > 0.001 ? smoothstep(schwelle - 0.15, schwelle, x) : 0.0;
  float da = uMischung > 0.001 ? smoothstep(schwelle, schwelle + 0.15, x) : 0.0;
  // Vier Proben je Szene; eine Schleife mit einer Aufrufstelle hält den Shader klein.
  vec4 sA = vec4(0.0), sB = vec4(0.0);
  for (int i = 0; i < 8; i++) {
    bool b = i >= 4;
    if ((b && da <= 0.0) || (!b && weg >= 1.0)) continue;
    float j = mod(float(i), 4.0);
    vec2 o = j < 0.5 ? vec2(-0.125, -0.375) : j < 1.5 ? vec2(0.375, -0.125) : j < 2.5 ? vec2(0.125, 0.375) : vec2(-0.375, 0.125);
    vec4 r = probe(mitte + uZelle * o, b ? uSzeneB : uSzeneA);
    if (b) sB += r; else sA += r;
  }
  vec4 s = (sA * (1.0 - weg) + sB * da) * 0.25;
  float d = s.a;
  vec3 tinte = s.a > 0.0 ? s.rgb / s.a : mix(vec3(0.2), vec3(0.78), uDunkel);

  // Rund um den Zeiger zeigt sich ein ruhiges Zeichenfeld in der Farbe der Szene.
  float abstand = length(mitte - uZeiger.xy) / uRes.y;
  float hof = uZeiger.z * smoothstep(0.1, 0.015, abstand);
  float atmen = 0.5 + 0.5 * sin(uZeit * 0.7);
  float feld = mix(gradRauschen(zelle * vec2(0.13, 0.22)), gradRauschen(zelle * vec2(0.13, 0.22) + 17.0), atmen);
  d = max(d, (0.08 + 0.16 * smoothstep(-0.3, 0.4, feld)) * hof);
  vec3 ton = mix(stimmung(uSzeneA.x, uSzeneA.y), stimmung(uSzeneB.x, uSzeneB.y), uMischung);
  ton = mix(ton * 0.82, mix(ton, vec3(1.0), 0.12), uDunkel);
  // Was der Film dort schon zeigt, behält seine Farbe; nur das Feld nimmt die der Szene.
  tinte = mix(tinte, ton, hof * (1.0 - smoothstep(0.1, 0.35, s.a)));
  gl_FragColor = vec4(tinte, d);
}
`;

export const ASCII_ZEICHEN = `
precision highp float;
uniform vec2 uZelle;
uniform vec2 uGitter;
uniform float uGlyphen;
uniform float uDunkel;
uniform sampler2D uZellen;
uniform sampler2D uAtlas;

void main() {
  vec2 zelle = floor(gl_FragCoord.xy / uZelle);
  vec4 z = texture2D(uZellen, (zelle + 0.5) / uGitter);
  float i = min(floor(z.a * uGlyphen), uGlyphen - 1.0);
  vec2 lokal = gl_FragCoord.xy - zelle * uZelle;
  float g = texture2D(uAtlas, vec2((i * uZelle.x + lokal.x) / (uGlyphen * uZelle.x), lokal.y / uZelle.y)).a;
  vec3 grund = mix(vec3(1.0), vec3(0.0), uDunkel);
  gl_FragColor = vec4(mix(grund, z.rgb, g * mix(0.6, 1.0, z.a)), 1.0);
}
`;

// Zeichen nach Deckung sortiert, damit die Dichte gleichmäßig ansteigt.
const ZEICHEN = ' .:-=+*o#%@';

// Baut den Atlas: alle Zeichen nebeneinander in Zellgröße, weiß auf leer.
export function atlasZeichnen(breite, hoehe) {
  const c = document.createElement('canvas');
  c.width = breite * ZEICHEN.length;
  c.height = hoehe;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const schreiben = (folge) => {
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = `500 ${Math.round(hoehe * 0.8)}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    [...folge].forEach((z, i) => ctx.fillText(z, (i + 0.5) * breite, hoehe * 0.54));
  };
  schreiben(ZEICHEN);
  const daten = ctx.getImageData(0, 0, c.width, c.height).data;
  const deckung = [...ZEICHEN].map((_, i) => {
    let summe = 0;
    for (let y = 0; y < hoehe; y++) for (let x = i * breite; x < (i + 1) * breite; x++) summe += daten[(y * c.width + x) * 4 + 3];
    return summe;
  });
  const folge = [...ZEICHEN].map((z, i) => [z, deckung[i]]).sort((a, b) => a[1] - b[1]).map(([z]) => z).join('');
  schreiben(folge);
  return { canvas: c, anzahl: ZEICHEN.length };
}
