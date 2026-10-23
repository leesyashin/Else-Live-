// ASCII-Hintergrund als kurzer Film: „Ein Tag in Italien“. Sieben Szenen
// laufen ohne Pause nacheinander und blenden weich ineinander über:
// Sonnenaufgang am Meer, Espresso, Vespa an der Küste, Gewitter über den
// Dächern, Pizza, Sonnenuntergang auf dem Balkon mit Joint, Nacht mit Fiat 500.
//
// Gerechnet wird in zwei Durchgängen. FILM zeichnet die Szene in ein kleines
// Bild mit einem Pixel pro Zeichenzelle (vier Proben je Zelle, damit Kanten
// weich durch die Zeichen wandern); ZEICHEN setzt dann echte Schriftzeichen
// aus einem Atlas nach Dichte ein. Die Zeichen stehen fest im Raster, nur ihre
// Dichte ändert sich; dadurch wirkt die Bewegung ruhig und nichts springt.

export const SZENEN = 7;

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
float strecke(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}
float kasten(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float ellipse(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }

const vec3 GLUT = vec3(1.0, 0.42, 0.1);
const vec3 SONNE = vec3(1.0, 0.68, 0.18);
const vec3 MEER = vec3(0.22, 0.5, 0.95);
const vec3 ZITRONE = vec3(0.98, 0.8, 0.1);
const vec3 TOMATE = vec3(0.92, 0.22, 0.14);
const vec3 BASILIKUM = vec3(0.2, 0.66, 0.3);
const vec3 KRUSTE = vec3(0.86, 0.56, 0.24);
const vec3 CREMA = vec3(0.74, 0.46, 0.22);
const vec3 MINZE = vec3(0.3, 0.78, 0.7);
const vec3 WARM = vec3(1.0, 0.86, 0.5);

// Maler: jede Szene trägt Schicht für Schicht Dichte (0 leer … 1 voll) und
// eine Akzentfarbe mit Menge (0 grau … 1 ganz farbig) auf.
float gD;
vec4 gAk;
float gKante;
float gA;

float voll(float d) { return clamp(0.5 - d / gKante, 0.0, 1.0); }
// Haarlinie, immer mindestens eine halbe Zeichenzeile stark.
float linie(float d) { return voll(abs(d) - gKante * 0.7); }

void malen(float c, float v, vec3 farbe, float menge) {
  if (c <= 0.0) return;
  if (menge > 0.0) gAk.rgb = gAk.a > 0.001 ? mix(gAk.rgb, farbe, c) : farbe;
  gAk.a = mix(gAk.a, menge, c);
  gD = mix(gD, v, c);
}
void grau(float c, float v) { malen(c, v, vec3(0.0), 0.0); }

// Licht, das nur aufhellt und nichts verdeckt.
void leuchten(float v, vec3 farbe, float menge) {
  if (v <= gD) return;
  malen(clamp((v - gD) / v, 0.0, 1.0), v, farbe, menge);
}

void rauch(float dichte) { grau(min(dichte * 1.6, 1.0), 0.4 + 0.25 * dichte); }

// ---------- Bausteine ----------

void sonneMalen(vec2 p, vec2 m, float r, float horizont, vec3 farbe) {
  float ueber = smoothstep(horizont - 0.004, horizont + 0.004, p.y);
  float d = length(p - m);
  leuchten(exp(-max(d - r, 0.0) * 22.0) * 0.24 * ueber, farbe, 0.6);
  malen(voll(d - r) * ueber, 0.7 + 0.3 * (1.0 - d / r), farbe, 0.9);
}

// Meer in Perspektive bis zum Horizont: kurze Wellenstriche, die langsam
// herankommen, dazu ein glitzernder Streifen unter der Lichtquelle.
void meer(vec2 p, float t, float horizont, vec2 licht, float glanz, vec3 farbe) {
  float w = horizont - p.y;
  if (w <= 0.0) return;
  float z = 1.0 / (w + 0.03);
  float x = p.x * z;
  float s = sin(z * 0.9 + t * 0.8 + 0.7 * sin(x * 0.4 + t * 0.3));
  float strich = smoothstep(-0.05, 0.3, gradRauschen(vec2(x * 0.45 + t * 0.04, z * 0.25)));
  float welle = smoothstep(0.45, 0.9, s) * strich * smoothstep(0.0, 0.08, w);
  malen(welle, 0.34, MEER, 0.45);
  grau(linie(w), 0.3);
  float breite = 0.035 + w * 0.32;
  float spalte = 1.0 - smoothstep(breite * 0.35, breite, abs(p.x - licht.x));
  float funkeln = smoothstep(0.12, 0.42, gradRauschen(vec2(p.x * 26.0, z * 2.0 - t * 1.1)));
  malen(spalte * funkeln * glanz, 0.7, farbe, 0.85);
}

void vogel(vec2 p, vec2 m, float s, float schlag) {
  vec2 q = (p - m) / s;
  q.x = abs(q.x);
  float h = 0.28 * sin(schlag);
  float d = strecke(q, vec2(0.0), vec2(0.5, 0.18 + h), 0.15, 0.12);
  d = min(d, strecke(q, vec2(0.5, 0.18 + h), vec2(1.0, -0.06 + h * 1.5), 0.12, 0.05));
  grau(voll(d * s), 0.6);
}

// Straße von der Seite mit Mittelstreifen und Bruchsteinmauer davor;
// weg verschiebt beides, wenn man fährt.
void strasse(vec2 p, float weg) {
  float oben = -0.215, unten = -0.315;
    grau(linie(p.y - oben), 0.35);
  grau(linie(p.y - unten), 0.3);
  float strich = step(fract((p.x + weg) / 0.16), 0.55);
  grau(linie(p.y + 0.265) * strich, 0.5);
  float tiefe = unten - 0.014 - p.y;
  if (tiefe > 0.0 && tiefe < 0.05) {
    float sx = p.x + weg * 1.25;
    vec2 st = vec2(mod(sx, 0.09) - 0.045, tiefe - 0.024);
    float stein = rauschen(vec2(floor(sx / 0.09), 2.0));
    grau(voll(kasten(st, vec2(0.037, 0.018), 0.01)), 0.22 + 0.14 * stein);
  }
}

void rad(vec2 p, vec2 m, float r, float winkel) {
  vec2 q = p - m;
  float d = length(q);
  float a = atan(q.y, q.x) + winkel;
  float speiche = smoothstep(0.6, 0.95, cos(a * 3.0)) * step(d, r * 0.55);
  float v = d > r * 0.62 ? 0.82 : 0.4 + 0.45 * speiche;
  grau(voll(d - r), v);
}

// ---------- Szene 0: Sonnenaufgang am Meer ----------

void alba(vec2 p, float t) {
  float h = -0.06;
  float auf = sanft(t / 13.5);
  vec2 s = vec2(0.0, mix(-0.17, 0.13, 1.0 - (1.0 - auf) * (1.0 - auf)));
  vec3 farbe = mix(GLUT, SONNE, auf);
  leuchten(exp(-(p.y - h) * 14.0) * step(h, p.y) * 0.16 * (0.4 + 0.6 * auf), farbe, 0.35);
  sonneMalen(p, s, 0.13, h, farbe);
  meer(p, t, h, s, smoothstep(-0.13, 0.04, s.y), farbe);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 m = vec2(-0.5 + t * 0.035 + 0.11 * fi, 0.27 - 0.05 * fi + 0.012 * sin(t * 0.8 + fi * 2.0));
    vogel(p, m, 0.07 - 0.012 * fi, t * 4.5 + fi * 1.7);
  }
}

// ---------- Szene 1: Espresso auf karierter Tischdecke ----------

void tischdecke(vec2 p, float kante) {
  float w = kante - p.y;
  if (w <= 0.0) return;
  float z = 1.0 / (0.5 - p.y);
  vec2 g = vec2(p.x * z, z) / 0.23;
  float ton = (step(0.5, fract(g.x)) + step(0.5, fract(g.y))) * 0.5;
  malen(smoothstep(0.0, 0.03, w) * ton, 0.24 * ton * ton, TOMATE, 0.75);
}

void espresso(vec2 p, float t) {
  p /= 1.0 + 0.06 * sanft(t / 13.5);
  tischdecke(p, -0.2);

  // Untertasse, von links beleuchtet
  vec2 u = p - vec2(0.0, -0.27);
  grau(voll(ellipse(u + vec2(0.0, 0.012), vec2(0.27, 0.045))), 0.3);
  grau(voll(ellipse(u, vec2(0.28, 0.05))), 0.42 + 0.25 * smoothstep(0.25, -0.25, u.x));
  // Löffel
  grau(voll(min(strecke(p, vec2(0.16, -0.292), vec2(0.33, -0.262), 0.007, 0.006),
                ellipse(p - vec2(0.13, -0.298), vec2(0.032, 0.012)))), 0.75);

  // Tasse: Henkel hinter dem Körper, dann Körper, Rand und Crema
  vec2 c = p - vec2(0.0, -0.08);
  float hoehe = 0.16;
  vec2 hp = c - vec2(0.17, 0.01);
  float dH = max(abs(ellipse(hp, vec2(0.06, 0.055))) - 0.015, -(hp.x + 0.01));
  grau(voll(dH), 0.45);
  float yy = clamp((c.y + hoehe) / (2.0 * hoehe), 0.0, 1.0);
  float hw = mix(0.1, 0.165, pow(yy, 0.7));
  float dK = min(max(abs(c.x) - hw, abs(c.y) - hoehe), ellipse(c - vec2(0.0, -hoehe), vec2(0.1, 0.022)));
  float nx = c.x / hw;
  grau(voll(dK), clamp(0.3 + 0.5 * smoothstep(0.9, -0.5, nx) + 0.25 * exp(-pow((nx + 0.5) * 5.0, 2.0)), 0.0, 1.0));
  vec2 r = c - vec2(0.0, hoehe);
  grau(voll(ellipse(r, vec2(0.168, 0.03))), 0.92);
  float crema = 0.6 + 0.18 * gradRauschen(vec2(r.x * 22.0, r.y * 60.0) + t * 0.25);
  malen(voll(ellipse(r + vec2(0.0, 0.002), vec2(0.148, 0.021))), crema, CREMA, 0.85);

  // Dampf: drei feine Fahnen, die sich langsam winden
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 s = p - vec2(-0.08 + fi * 0.08, 0.095);
    if (s.y < 0.0) continue;
    float x = s.x - (fi - 1.0) * s.y * 0.45 - 0.025 * sin(s.y * 14.0 - t * 1.5 + fi * 2.1) * (0.5 + s.y * 4.0);
    float breite = 0.012 + s.y * 0.07;
    float band = 1.0 - smoothstep(breite * 0.2, breite, abs(x));
    float leben = smoothstep(0.0, 0.06, s.y) * (1.0 - smoothstep(0.08, 0.3, s.y)) * (0.75 + 0.25 * sin(t * 0.9 + fi * 2.0));
    float wisp = 0.6 + 0.4 * gradRauschen(vec2(s.x * 10.0, s.y * 6.0 - t * 0.8 + fi));
    leuchten(band * leben * wisp * 0.5, vec3(0.0), 0.0);
  }
}

// ---------- Szene 2: Vespa auf der Küstenstraße ----------

void zypressen(vec2 p, float weg) {
  float x = p.x + weg;
  float zelle = floor(x / 0.3);
  float lx = mod(x, 0.3) - 0.15;
  float z = rauschen(vec2(zelle, 5.1));
  if (z < 0.25) return;
  float boden = -0.1;
  if (z > 0.78) {
    // Pinie: Stamm und flache Krone
    grau(voll(strecke(p, vec2(p.x - lx, boden), vec2(p.x - lx + 0.015, boden + 0.13), 0.007, 0.005)), 0.45);
    float krone = ellipse(vec2(lx - 0.015, p.y - boden - 0.15), vec2(0.1, 0.035));
    malen(voll(krone), 0.42 + 0.2 * smoothstep(0.0, 0.03, p.y - boden - 0.15), BASILIKUM, 0.35);
    return;
  }
  float hoehe = 0.2 + 0.08 * z;
  float u = (p.y - boden) / hoehe;
  if (u < 0.0 || u > 1.0) return;
  float w = 0.05 * pow(1.0 - u, 0.8) * smoothstep(0.0, 0.3, u) + 0.008 * step(u, 0.06);
  malen(voll(abs(lx) - w), 0.45 + 0.25 * smoothstep(w, -w, lx), BASILIKUM, 0.35);
}

void vespa(vec2 p, float t) {
  float weg = t * 0.45;
  if (p.y > -0.215) meer(p, t, 0.02, vec2(9.0), 0.0, SONNE);
  // Landzunge weit hinten
  float land = 0.02 + 0.06 * exp(-pow((p.x + weg * 0.04 + 0.35) * 2.2, 2.0));
  grau(voll(p.y - land) * step(0.0, p.y - 0.018), 0.2);
  // Hügel mit Gras, darauf Zypressen und Pinien
  float X = p.x + weg * 0.35;
  float kamm = -0.09 + 0.025 * sin(X * 2.1) + 0.012 * sin(X * 5.3);
  if (p.y < kamm) grau(voll(p.y - kamm), 0.13 * smoothstep(0.3, 0.6, gradRauschen(vec2(X * 30.0, p.y * 40.0))));
  grau(linie(p.y - kamm), 0.3);
  zypressen(p, weg * 0.55);
  strasse(p, weg);

  float gross = 1.4;
  vec2 v = (p - vec2(0.0, -0.24 + 0.004 * sin(t * 9.0))) / gross + vec2(0.02, -0.24);
  float kante = gKante;
  gKante /= gross;
  float boden = -0.24, r = 0.042;
  vec2 hinten = vec2(-0.13, boden + r), vorn = vec2(0.135, boden + r);
  rad(v, hinten, r, weg / r);
  rad(v, vorn, r, weg / r);

  // Karosserie in Minze, oben heller
  float licht = 0.5 + 0.3 * smoothstep(-0.2, 0.0, v.y);
  float dK = max(ellipse(v - vec2(-0.1, -0.13), vec2(0.115, 0.07)), -0.175 - v.y);
  dK = min(dK, kasten(v - vec2(0.03, -0.172), vec2(0.075, 0.012), 0.006));
  dK = min(dK, strecke(v, vec2(0.085, -0.17), vec2(0.115, -0.02), 0.022, 0.016));
  dK = min(dK, max(ellipse(v - vorn - vec2(0.0, 0.028), vec2(0.052, 0.03)), vorn.y + 0.01 - v.y));
  malen(voll(dK), licht + 0.15 * exp(-pow((v.y + 0.09) * 25.0, 2.0)), MINZE, 0.75);
  malen(linie(dK), 0.9, MINZE, 0.9);
  grau(voll(min(strecke(v, vec2(0.115, -0.02), vec2(0.11, 0.05), 0.009, 0.009),
                strecke(v, vec2(0.075, 0.055), vec2(0.135, 0.06), 0.01, 0.01))), 0.6);
  malen(voll(length(v - vec2(0.142, 0.042)) - 0.017), 1.0, WARM, 0.6);
  grau(voll(kasten(v - vec2(-0.09, -0.05), vec2(0.075, 0.014), 0.012)), 0.35);

  // Fahrer mit flatterndem Schal
  vec2 hu = vec2(-0.07, -0.035), knie = vec2(0.045, -0.04), fuss = vec2(0.05, -0.16);
  vec2 schulter = vec2(-0.035, 0.13), ellbogen = vec2(0.04, 0.075), hand = vec2(0.09, 0.057);
  float dF = strecke(v, hu, schulter, 0.03, 0.026);
  dF = min(dF, strecke(v, hu, knie, 0.03, 0.025));
  dF = min(dF, strecke(v, knie, fuss, 0.022, 0.018));
  dF = min(dF, strecke(v, schulter, ellbogen, 0.017, 0.015));
  dF = min(dF, strecke(v, ellbogen, hand, 0.015, 0.013));
  grau(voll(dF), 0.55 + 0.15 * smoothstep(0.1, -0.05, v.x));
  grau(voll(length(v - vec2(-0.01, 0.19)) - 0.037), 0.8);
  vec2 a = vec2(-0.03, 0.155);
  float dS = 1e3;
  for (int i = 1; i < 6; i++) {
    float fi = float(i);
    vec2 b = vec2(-0.03 - 0.027 * fi, 0.155 + 0.012 * sin(t * 8.0 - fi * 1.3) - 0.004 * fi);
    dS = min(dS, strecke(v, a, b, 0.013 - 0.0012 * fi, 0.012 - 0.0012 * fi));
    a = b;
  }
  malen(voll(dS), 0.7, TOMATE, 0.85);
  gKante = kante;
}

// ---------- Szene 3: Gewitter über den Dächern ----------

float dachlinie(vec2 p, out float kuppel) {
  float i = floor(p.x / 0.11);
  float lx = fract(p.x / 0.11) - 0.5;
  float z = rauschen(vec2(i, 1.3));
  float giebel = -0.27 + 0.07 * z + (0.035 + 0.03 * z) * (1.0 - abs(lx) * 2.0);
  float d = p.y - giebel;
  vec2 k = p - vec2(-0.12, -0.13);
  kuppel = min(max(ellipse(k, vec2(0.11, 0.15)), -k.y),
               min(kasten(k - vec2(0.0, 0.17), vec2(0.016, 0.025), 0.004), length(k - vec2(0.0, 0.205)) - 0.011));
  d = min(d, min(kuppel, kasten(k - vec2(0.0, -0.05), vec2(0.125, 0.055), 0.0)));
  vec2 c = p - vec2(0.2, -0.05);
  d = min(d, min(kasten(c, vec2(0.03, 0.2), 0.0), kasten(c - vec2(0.0, 0.205), vec2(0.037, 0.012), 0.0)));
  return d;
}

void temporale(vec2 p, float t) {
  float regen = smoothstep(2.0, 5.0, t);
  float blitz = exp(-pow((t - 7.2) * 9.0, 2.0)) + 0.7 * exp(-pow((t - 7.55) * 12.0, 2.0));

  vec2 w = vec2(p.x + t * 0.025, p.y);
  float f = gradRauschen(w * vec2(2.2, 3.5)) * 0.6 + gradRauschen(w * vec2(4.5, 7.0) + 3.1) * 0.25;
  float wolke = smoothstep(0.0, 0.12, f + smoothstep(0.0, 0.45, p.y) * 0.5 - 0.42 + 0.12 * sanft(t / 13.5));
  grau(wolke, 0.12 + 0.3 * smoothstep(0.1, 0.5, f + p.y * 0.4) + blitz * 0.5);
  grau(wolke * (1.0 - wolke) * 3.0, 0.3 + blitz * 0.4);

  vec2 r = drehung(0.12) * p;
  float spalte = floor(r.x * 70.0);
  float zz = rauschen(vec2(spalte, 3.7));
  float y = fract(r.y * 1.6 + t * (1.0 + 0.4 * zz) + zz * 9.0);
  malen(step(zz, 0.5) * smoothstep(0.84, 0.88, y) * regen * (1.0 - wolke * 0.7), 0.32, MEER, 0.5);

  float kuppel;
  float d = dachlinie(p, kuppel);
  float licht = 0.2 + blitz * 0.3;
  float istKuppel = step(kuppel, 0.0);
  malen(voll(d), licht + istKuppel * (0.25 + 0.25 * smoothstep(0.1, -0.1, p.x + 0.12)), KRUSTE, 0.7 * istKuppel);
  grau(linie(d), 0.62 + blitz * 0.3);

  // Fenster gehen nach und nach an
  vec2 fz = floor(p / vec2(0.04, 0.06));
  vec2 fl = fract(p / vec2(0.04, 0.06));
  float an = step(rauschen(fz + 0.7), 0.35) * step(rauschen(fz + 2.3), smoothstep(2.0, 9.0, t));
  float fenster = step(0.25, fl.x) * step(fl.x, 0.75) * step(0.3, fl.y) * step(fl.y, 0.7);
  malen(fenster * an * voll(d + 0.03), 0.9, WARM, 0.9);

  if (blitz > 0.15) {
    vec2 a = vec2(0.27, 0.45);
    float dB = 1e3;
    for (int i = 1; i <= 5; i++) {
      float fi = float(i) / 5.0;
      vec2 b = vec2(mix(0.27, 0.2, fi) + (i < 5 ? (rauschen(vec2(float(i), 4.0)) - 0.5) * 0.09 : 0.0), mix(0.45, 0.165, fi));
      dB = min(dB, strecke(p, a, b, 0.007, 0.005));
      a = b;
    }
    malen(voll(dB) * smoothstep(0.15, 0.5, blitz), 1.0, WARM, 0.7);
  }
}

// ---------- Szene 4: Pizza wird geschnitten ----------

bool imStueck(vec2 q) {
  float a = atan(q.y, q.x);
  return a > 0.0 && a < 0.7854;
}

void pizza(vec2 p, float t) {
  float R = 0.36;
  float brett = length(p) - R - 0.05;
  grau(voll(brett), 0.06 + 0.1 * smoothstep(0.6, 1.0, sin(p.y * 140.0 + sin(p.x * 9.0) * 3.0)));

  vec2 q = drehung(t * 0.06) * p;
  float zug = sanft((t - 8.6) / 2.6) * 0.085;
  vec2 richtung = vec2(0.9239, 0.3827);
  vec2 qs = q - richtung * zug;
  bool stueck = zug > 0.0005 && imStueck(qs);
  if (zug > 0.0005 && imStueck(q) && !stueck) {
    // Lücke, aus der das Stück gezogen wird: Käsefäden spannen sich
    float faeden = 1.0 - smoothstep(0.055, 0.085, zug);
    for (int i = 0; i < 3; i++) {
      float rho = 0.1 + 0.09 * float(i);
      vec2 a0 = rho * vec2(1.0, 0.0), a1 = rho * vec2(0.7071, 0.7071);
      float df = min(strecke(q, a0, a0 + richtung * zug, 0.004, 0.003), strecke(q, a1, a1 + richtung * zug, 0.004, 0.003));
      grau(voll(df) * faeden, 0.75);
    }
    return;
  }
  vec2 r = stueck ? qs : q;
  float rr = length(r);
  float rand = R + 0.008 * sin(atan(r.y, r.x) * 9.0);
  float dP = rr - rand;
  float k = clamp((rr - (R - 0.055)) / 0.055, 0.0, 1.0);
  malen(voll(dP), 0.4 + 0.45 * sin(3.1416 * k), KRUSTE, 0.7);
  grau(linie(dP), 0.75);
  malen(voll(rr - (R - 0.05)), 0.26, TOMATE, 0.85);
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float a = fi * 2.4 + 0.5;
    vec2 m = (0.08 + 0.2 * fract(fi * 0.618 + 0.3)) * vec2(cos(a), sin(a));
    float dm = length((r - m) * vec2(1.0, 1.15)) - (0.042 + 0.016 * fract(fi * 0.37));
    grau(voll(dm), 0.6 + 0.3 * smoothstep(0.04, 0.0, length(r - m)));
  }
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    float a = fi * 1.26 + 1.0;
    vec2 m = (0.13 + 0.12 * fract(fi * 0.71)) * vec2(cos(a), sin(a));
    vec2 l = drehung(fi * 1.9) * (r - m);
    malen(voll(ellipse(l, vec2(0.038, 0.019))), 0.62 - 0.25 * (1.0 - smoothstep(0.0, 0.005, abs(l.y))), BASILIKUM, 0.9);
  }
  // Vier Schnitte nacheinander mit dem Pizzarad
  for (int i = 0; i < 4; i++) {
    float fort = clamp((t - 1.4 - float(i) * 1.5) / 1.1, 0.0, 1.0);
    if (fort <= 0.0) continue;
    float a = float(i) * 0.7854;
    vec2 dir = vec2(cos(a), sin(a));
    vec2 a0 = -dir * (R + 0.02);
    vec2 a1 = mix(a0, dir * (R + 0.02), sanft(fort));
    grau(voll(strecke(r, a0, a1, 0.007, 0.007)) * voll(dP), 0.04);
    if (fort < 1.0 && !stueck) {
      grau(voll(abs(length(r - a1) - 0.03) - 0.008), 0.9);
      grau(voll(strecke(r, a1, a1 - dir * 0.1 + vec2(0.0, 0.07), 0.012, 0.016)), 0.65);
    }
  }
}

// ---------- Szene 5: Sonnenuntergang auf dem Balkon ----------

void zitronenzweig(vec2 p, float t) {
  vec2 z = drehung(0.03 * sin(t * 0.9)) * (p - vec2(-gA * 0.5, 0.5));
  vec2 a = vec2(-0.02, 0.03);
  float dZ = 1e3;
  for (int i = 1; i <= 3; i++) {
    float fi = float(i);
    vec2 b = vec2(0.12 * fi, 0.03 - 0.012 * fi * fi);
    dZ = min(dZ, strecke(z, a, b, 0.011 - 0.002 * fi, 0.009 - 0.002 * fi));
    a = b;
  }
  grau(voll(dZ), 0.5);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 m = vec2(0.03 + 0.055 * fi, 0.02 - 0.0045 * fi * fi * 1.3);
    vec2 l = drehung(-0.9 + 0.5 * sin(fi * 2.3) + 0.06 * sin(t * 1.3 + fi)) * (z - m - vec2(0.0, -0.03));
    malen(voll(ellipse(l, vec2(0.016, 0.042))), 0.5 - 0.2 * (1.0 - smoothstep(0.0, 0.004, abs(l.x))), BASILIKUM, 0.55);
  }
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 m = vec2(0.15 + 0.12 * fi, -0.085 - 0.04 * fi + 0.004 * sin(t * 1.1 + fi));
    grau(voll(strecke(z, m + vec2(0.0, 0.03), vec2(0.15 + 0.12 * fi, 0.0 - 0.03 * fi), 0.003, 0.003)), 0.45);
    vec2 l = z - m;
    malen(voll(ellipse(l, vec2(0.038, 0.03))), 0.55 + 0.35 * smoothstep(-0.03, 0.03, l.x + l.y), ZITRONE, 0.9);
  }
}

void tramonto(vec2 p, float t) {
  float h = -0.02;
  float ab = sanft(t / 13.5);
  vec2 s = vec2(0.13, mix(0.13, -0.05, ab));
  vec3 farbe = mix(SONNE, GLUT, ab);
  leuchten(exp(-(p.y - h) * 10.0) * step(h, p.y) * 0.2, GLUT, 0.5);
  sonneMalen(p, s, 0.17, h, farbe);
  meer(p, t, h, s, 1.0, farbe);
  zitronenzweig(p, t);

  // Geländer mit Balustern
  float oben = -0.28;
  float bx = mod(p.x + 0.045, 0.09) - 0.045;
  float u = clamp((oben - 0.02 - p.y) / 0.2, 0.0, 1.0);
  float bw = 0.011 + 0.015 * sin(3.1416 * pow(u, 0.8));
  grau(voll(max(abs(bx) - bw, p.y - oben + 0.02)), 0.38 + 0.2 * smoothstep(bw, -bw, bx));
  grau(voll(kasten(p - vec2(0.0, oben), vec2(gA, 0.021), 0.008)), 0.6);

  // Aschenbecher, Joint und Glut
  vec2 glut = vec2(0.066, oben + 0.064);
  grau(voll(kasten(p - vec2(-0.08, oben + 0.036), vec2(0.056, 0.014), 0.008)), 0.5);
  grau(voll(strecke(p, vec2(-0.11, oben + 0.05), glut - vec2(0.008, 0.0), 0.006, 0.01)), 0.85);
  float dG = length(p - glut);
  float puls = 0.85 + 0.15 * sin(uZeit * 2.0);
  leuchten(exp(-dG * 35.0) * 0.4 * puls, GLUT, 0.8);
  malen(voll(dG - 0.011), puls, GLUT, 1.0);

  // Rauch: zwei Bänder, die der Wind nach rechts trägt, dazu Ringe
  vec2 sr = p - glut;
  float dichte = 0.0;
  if (sr.y > 0.0) {
    for (int j = 0; j < 2; j++) {
      float fj = float(j);
      float x = sr.x - sr.y * sr.y * 0.35 - (0.015 + sr.y * 0.12) * sin(sr.y * 9.0 - t * 1.4 + fj * 3.1416);
      float breite = 0.006 + sr.y * 0.06;
      float band = 1.0 - smoothstep(breite * 0.4, breite, abs(x));
      float wisp = 0.65 + 0.35 * gradRauschen(vec2(sr.x * 8.0, sr.y * 5.0 - t * 0.6 + fj));
      dichte = max(dichte, band * wisp * (1.0 - smoothstep(0.25, 0.7, sr.y)) * (0.6 - 0.15 * fj));
    }
  }
  for (int k = 0; k < 2; k++) {
    float alter = mod(t - 2.0 - float(k) * 4.5, 9.0);
    if (alter > 5.0) continue;
    vec2 m = glut + vec2(0.03 * alter + 0.006 * alter * alter, 0.07 + alter * 0.07);
    float ring = abs(length((p - m) * vec2(1.0, 2.2)) - (0.025 + alter * 0.013));
    dichte = max(dichte, (1.0 - smoothstep(0.006, 0.016, ring)) * (1.0 - alter / 5.0) * 0.6);
  }
  rauch(dichte);
}

// ---------- Szene 6: Nacht, ein Fiat 500 kommt an ----------

void fiat(vec2 p, float x, float licht) {
  float gross = 1.35;
  vec2 c = (p - vec2(x, -0.24)) / gross;
  float kante = gKante;
  gKante /= gross;
  rad(c, vec2(-0.1, 0.034), 0.034, -x / 0.034);
  rad(c, vec2(0.105, 0.034), 0.034, -x / 0.034);
  float dK = kasten(c - vec2(0.0, 0.075), vec2(0.165, 0.042), 0.032);
  float kabine = max(ellipse(c - vec2(-0.015, 0.105), vec2(0.12, 0.095)), 0.09 - c.y);
  dK = min(dK, kabine);
  grau(voll(dK), 0.5 + 0.25 * smoothstep(0.02, 0.16, c.y));
  float scheibe = max(ellipse(c - vec2(-0.015, 0.115), vec2(0.095, 0.068)), 0.122 - c.y);
  scheibe = max(scheibe, -(abs(c.x - 0.003) - 0.008));
  grau(linie(dK), 0.9);
  grau(voll(scheibe), 0.12);
  grau(linie(c.y - 0.07) * voll(dK + 0.01), 0.3);
  malen(voll(length(c - vec2(0.158, 0.082)) - 0.016), 0.7 + 0.3 * licht, WARM, 0.8 * licht);
  malen(voll(kasten(c - vec2(-0.165, 0.085), vec2(0.006, 0.012), 0.003)), 0.85, TOMATE, 0.9);
  vec2 b = c - vec2(0.17, 0.082);
  if (b.x > 0.0) {
    float kegel = 1.0 - smoothstep(b.x * 0.18, b.x * 0.3 + 0.01, abs(b.y + b.x * 0.12));
    leuchten(kegel * 0.3 * (1.0 - smoothstep(0.0, 0.6, b.x)) * licht, WARM, 0.6);
  }
  gKante = kante;
}

void notte(vec2 p, float t) {
  float h = -0.02;
  vec2 g = p / 0.045;
  vec2 gi = floor(g);
  float z = rauschen(gi + 7.0);
  if (z > 0.8 && p.y > h + 0.05) {
    vec2 versatz = (vec2(rauschen(gi + 1.3), rauschen(gi + 2.1)) - 0.5) * 0.6;
    float d = length(fract(g) - 0.5 - versatz) * 0.045 - 0.007;
    grau(voll(d), 0.4 + 0.35 * sin(uZeit * (0.8 + 1.6 * z) + z * 40.0));
  }
  vec2 mond = vec2(min(gA * 0.3, 0.32), 0.3);
  float dM = max(length(p - mond) - 0.065, -(length(p - mond - vec2(0.032, 0.016)) - 0.058));
  leuchten(exp(-max(length(p - mond) - 0.065, 0.0) * 14.0) * 0.18, WARM, 0.3);
  malen(voll(dM), 0.9, WARM, 0.35);
  if (p.y > -0.215) meer(p, t, h, mond, 0.6, WARM);

  // Laterne mit Lichtkegel
  float lx = min(gA * 0.32, 0.3);
  vec2 lampe = vec2(lx - 0.05, 0.11);
  vec2 k = p - lampe;
  float kegel = (1.0 - smoothstep(-k.y * 0.35, -k.y * 0.5 + 0.01, abs(k.x))) * step(k.y, 0.0) * step(-0.36, k.y);
  leuchten(kegel * 0.14 * (0.9 + 0.1 * sin(uZeit * 13.0) * step(0.97, sin(uZeit * 0.7))), WARM, 0.55);
  strasse(p, 0.0);
  grau(voll(min(strecke(p, vec2(lx, -0.215), vec2(lx, 0.12), 0.008, 0.006),
                strecke(p, vec2(lx, 0.12), lampe + vec2(0.0, 0.02), 0.005, 0.005))), 0.5);
  malen(voll(kasten(k, vec2(0.022, 0.012), 0.006)), 1.0, WARM, 0.8);

  float an = 1.0 - pow(1.0 - clamp(t / 7.5, 0.0, 1.0), 3.0);
  fiat(p, mix(-gA * 0.5 - 0.4, -0.04, an), 1.0 - smoothstep(9.5, 10.8, t));
}

void szene(float welche, vec2 p, float t) {
  gD = 0.0;
  gAk = vec4(0.0);
  if (welche < 0.5) alba(p, t);
  else if (welche < 1.5) espresso(p, t);
  else if (welche < 2.5) vespa(p, t);
  else if (welche < 3.5) temporale(p, t);
  else if (welche < 4.5) pizza(p, t);
  else if (welche < 5.5) tramonto(p, t);
  else notte(p, t);
}

// Eine Probe: Tinte (vorgewichtet mit der Dichte) und Dichte.
vec4 probe(vec2 px) {
  vec2 uv = (px - 0.5 * uRes) / uRes.y;
  vec2 p = (uv - uRahmen.xy) / uRahmen.z + uNeigung * 0.008;
  // Das Bild läuft zum Rand hin weich aus.
  float rand = smoothstep(0.0, 0.07, gA * 0.5 - abs(p.x)) * smoothstep(0.0, 0.07, 0.5 - abs(p.y));
  if (rand <= 0.0) return vec4(0.0);
  szene(uSzeneA.x, p, uSzeneA.y);
  float dA = gD;
  vec4 kA = gAk;
  float dB = 0.0;
  vec4 kB = vec4(0.0);
  if (uMischung > 0.001) {
    szene(uSzeneB.x, p, uSzeneB.y);
    dB = gD;
    kB = gAk;
  }
  float d = mix(dA, dB, uMischung) * rand;
  float mA = kA.a * (1.0 - uMischung) * dA, mB = kB.a * uMischung * dB;
  float menge = clamp((mA + mB) / max(mix(dA, dB, uMischung), 1e-4), 0.0, 1.0);
  vec3 ton = (kA.rgb * mA + kB.rgb * mB) / max(mA + mB, 1e-4);
  vec3 grauTinte = mix(vec3(0.2), vec3(0.78), uDunkel);
  vec3 farbTinte = mix(ton * 0.82, mix(ton, vec3(1.0), 0.12), uDunkel);
  return vec4(mix(grauTinte, farbTinte, menge) * d, d);
}

void main() {
  vec2 zelle = floor(gl_FragCoord.xy);
  vec2 mitte = (zelle + 0.5) * uZelle;
  gA = uRahmen.w;
  gKante = uZelle.y / uRes.y / uRahmen.z * 0.5;
  vec4 s = probe(mitte + uZelle * vec2(-0.125, -0.375));
  s += probe(mitte + uZelle * vec2(0.375, -0.125));
  s += probe(mitte + uZelle * vec2(0.125, 0.375));
  s += probe(mitte + uZelle * vec2(-0.375, 0.125));
  float d = s.a * 0.25;
  vec3 tinte = s.a > 0.0 ? s.rgb / s.a : mix(vec3(0.2), vec3(0.78), uDunkel);

  // Rund um den Zeiger zeigt sich ein ruhiges Zeichenfeld, dort blau.
  float abstand = length((mitte - uZeiger.xy) / uZelle.y);
  float hof = uZeiger.z * smoothstep(9.0, 1.5, abstand);
  float atmen = 0.5 + 0.5 * sin(uZeit * 0.7);
  float feld = mix(gradRauschen(zelle * vec2(0.13, 0.22)), gradRauschen(zelle * vec2(0.13, 0.22) + 17.0), atmen);
  d = max(d, (0.08 + 0.16 * smoothstep(-0.3, 0.4, feld)) * hof);
  vec3 blau = mix(vec3(0.11, 0.36, 0.96), vec3(0.36, 0.55, 1.0), uDunkel);
  tinte = mix(tinte, blau, hof * 0.9);
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
