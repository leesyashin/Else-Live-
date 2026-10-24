// ASCII-Hintergrund: ein brennender Joint als 3D-Modell, gerendert wie im
// Fotostudio und in Terminal-Zeichen übersetzt. Er schwebt über dem Boden,
// vorn glimmt die Glut unter einer Kappe aus Asche, und aus der Spitze steigt
// Rauch in Schwaden auf. Die Kamera schwenkt langsam um ihn, hebt und senkt
// sich und folgt der Neigung bzw. der Maus.
//
// Gerechnet wird in zwei Durchgängen. JOINT verfolgt pro Zeichenzelle vier
// Strahlen durch ein Modell aus Abstandsfunktionen (Papierkegel, Filter,
// Asche, Glut), schattiert Papier, Pappe, Asche und Glut und sammelt den
// Rauch als Volumen ein; ZEICHEN setzt dann echte Schriftzeichen aus einem
// Atlas nach Helligkeit ein. Die Zeichen stehen fest im Raster, nur ihre
// Dichte ändert sich. Bis auf die Glut ist alles schwarz, grau und weiß.

export const ASCII_JOINT = `
precision highp float;
uniform vec2 uRes;      // Canvas in Pixeln
uniform vec2 uZelle;    // Zeichenzelle in Pixeln (Breite, Höhe)
uniform vec4 uRahmen;   // Mitte des Bildes (uv), Höhe (uv), Seitenverhältnis
uniform float uZeit;
uniform float uDunkel;
uniform vec3 uZeiger;   // x, y in Canvas-Pixeln, Stärke 0 … 1
uniform vec2 uNeigung;

float rauschen(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float sanft(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
mat2 drehung(float w) { float c = cos(w), s = sin(w); return mat2(c, -s, s, c); }

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }

float streu3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float rauschen3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(streu3(i), streu3(i + vec3(1, 0, 0)), f.x), mix(streu3(i + vec3(0, 1, 0)), streu3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(streu3(i + vec3(0, 0, 1)), streu3(i + vec3(1, 0, 1)), f.x), mix(streu3(i + vec3(0, 1, 1)), streu3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float wolke(vec3 p) {
  return 0.55 * rauschen3(p) + 0.3 * rauschen3(p * 2.1 + 3.1) + 0.15 * rauschen3(p * 4.3 + 7.7);
}

// ---------- Das Modell (Meter, Boden y = 0) ----------
// Der Joint liegt entlang seiner eigenen x-Achse: Filter bei LINKS, die
// brennende Spitze bei RECHTS, leicht nach oben geneigt.

const float LINKS = -1.7;
const float RECHTS = 1.55;
const vec3 MITTE = vec3(0.0, 0.8, 0.0);
const float NEIGUNG = 0.1;
// So weit brennt er herunter, der Rest bleibt als Stummel.
const float STUMMEL = LINKS + 0.55;
// Ein Leben dauert so viele Sekunden (siehe leben()).
const float LEBEN = 170.0;

// Zustand im Lebenslauf, einmal pro Bildpunkt in leben() gesetzt.
float gFront;   // Grenze zwischen Papier und Glut (lokales x)
float gAsche;   // Länge der Aschekappe vor der Glut
float gGlut;    // 0 aus … 1 glüht
float gRauch;   // Stärke des Rauchs aus der Spitze
float gZug;     // ein Zug: Glut heller, Rauch dichter
float gSchnitt; // alles hinter diesem x fehlt noch bzw. ist schon zerfallen
float gHaufen;  // Größe des Aschehaufens am Boden
float gFlocken; // Ascheflocken in der Luft, Stärke
float gSteigen; // +1 Flocken steigen (Aufbau), -1 sie fallen
float gFlockX;  // wo die Flocken fliegen (lokales x)
float gRing;    // Alter des aktuellen Rauchrings in Sekunden, < 0 keiner

// Der Lebenslauf: aus dem Haufen bildet sich ein neuer Joint, er wird
// angezündet, brennt langsam ab, die Asche fällt ab und zu herunter, er
// verglimmt, und der Stummel zerfällt wieder zu Asche.
void leben() {
  float z = mod(uZeit, LEBEN);
  float aufbau = sanft(z / 16.0);
  float an = sanft((z - 17.0) / 3.0);
  float f = sanft((z - 20.0) / 115.0);
  float aus = sanft((z - 135.0) / 10.0);
  float zerfall = sanft((z - 146.0) / 20.0);

  gFront = mix(RECHTS, STUMMEL, f);
  // Die Kappe wächst und bricht viermal ab
  float kappe = fract(f * 4.0 + 0.15);
  gAsche = an * (0.03 + 0.17 * kappe * step(0.001, f));
  gGlut = an * (1.0 - aus);
  gRauch = an * (1.0 - sanft((z - 135.0) / 16.0));
  // Alle 23 Sekunden ein Zug
  gZug = gGlut * pow(max(sin((z - 20.0) * 0.273), 0.0), 16.0);
  float ende = gFront + gAsche;
  gSchnitt = z < 20.0 ? mix(LINKS - 0.06, RECHTS + 0.06, aufbau) : mix(ende + 0.06, LINKS - 0.06, zerfall);
  gHaufen = z < 20.0 ? 1.0 - aufbau : mix(0.25 + 0.6 * f, 1.0, zerfall);
  // Flocken: beim Aufbau steigen sie, beim Zerfall und wenn die Kappe
  // bricht fallen sie.
  float bruch = (1.0 - smoothstep(0.0, 0.05, kappe)) * step(0.02, f) * (1.0 - aus);
  if (z < 20.0) {
    gFlocken = sin(3.1416 * clamp(z / 16.0, 0.0, 1.0));
    gSteigen = 1.0;
    gFlockX = gSchnitt;
  } else if (z > 146.0) {
    gFlocken = sin(3.1416 * clamp((z - 146.0) / 20.0, 0.0, 1.0));
    gSteigen = -1.0;
    gFlockX = gSchnitt;
  } else {
    gFlocken = bruch;
    gSteigen = -1.0;
    gFlockX = ende;
  }
  // Rauchringe alle 19 Sekunden, solange er brennt
  float alter = mod(z - 26.0, 19.0);
  gRing = (z > 26.0 && z < 130.0) ? alter : -1.0;
}

vec3 lokal(vec3 p) {
  vec3 j = p - MITTE;
  j.xy = drehung(NEIGUNG) * j.xy;
  return j;
}
vec3 welt(float x) { return MITTE + vec3(cos(NEIGUNG), sin(NEIGUNG), 0.0) * x; }
vec3 spitze() { return welt(gFront + gAsche * 0.6); }

// Kegel: schmal am Filter, nach vorn weiter, die Asche schrumpft etwas.
float radius(float x) {
  float u = clamp((x - LINKS) / (RECHTS - LINKS), 0.0, 1.0);
  float r = mix(0.115, 0.215, sanft(u * 1.2));
  return r * (1.0 - 0.08 * smoothstep(gFront - 0.01, gFront + 0.12, x));
}

float gMat;   // 0 Papier, 1 Filter, 2 Asche, 3 Glut, 4 Aschehaufen

float joint(vec3 p) {
  vec3 j = lokal(p);
  float w = atan(j.z, j.y);
  float r = radius(j.x);
  // Feine Knitter im Papier
  r += 0.003 * sin(w * 9.0 + j.x * 7.0) * step(j.x, gFront);
  float d = length(j.yz) - r;
  // Vorn eine unregelmäßige, verkohlte Kante, beim neuen Joint glatt
  float ende = gFront + gAsche - (0.01 + 0.03 * sanft(gAsche * 20.0)) * rauschen3(vec3(j.yz * 14.0, uZeit * 0.05));
  d = smax(d, j.x - ende, 0.03);
  d = smax(d, LINKS - j.x, 0.012);
  // Entstehen und Zerfallen: eine bröselige Kante wandert am Joint entlang
  float schnitt = gSchnitt + 0.07 * (rauschen3(vec3(j.yz * 18.0, j.x * 6.0 + uZeit * 0.3)) - 0.5);
  d = smax(d, j.x - schnitt, 0.015);
  float grenze = gFront + 0.03 * sin(w * 3.0) + 0.02 * rauschen3(vec3(j.yz * 10.0, 1.0));
  gMat = j.x < LINKS + 0.012 ? 1.0 : j.x > grenze + 0.06 ? 2.0 : j.x > grenze ? 3.0 : 0.0;
  // Aschehaufen am Boden, flach, mit Krümeln
  if (gHaufen > 0.01) {
    float h = gHaufen;
    vec3 a = p - vec3(0.3, 0.0, 0.0);
    vec3 rh = vec3(0.6 * h + 0.04, 0.2 * h + 0.01, 0.5 * h + 0.04);
    float haufen = (length(a / rh) - 1.0) * min(rh.y, rh.z);
    haufen += 0.02 * h * (rauschen3(p * 14.0) - 0.5) + 0.008 * rauschen3(p * 40.0);
    if (haufen < d) { d = haufen; gMat = 4.0; }
  }
  return d;
}

vec3 normale(vec3 p) {
  const vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * joint(p + e.xyy) + e.yyx * joint(p + e.yyx) + e.yxy * joint(p + e.yxy) + e.xxx * joint(p + e.xxx));
}

// Studio, wie es sich im Papier spiegelt: dunkler Raum, Softbox oben,
// ein langer Lichtstreifen, der langsam wandert.
float studio(vec3 r) {
  float el = r.y;
  float az = atan(r.z, r.x);
  float l = 0.04 + 0.1 * smoothstep(-0.2, 0.6, el);
  l += 0.9 * smoothstep(0.82, 0.9, el);
  l += 0.7 * smoothstep(0.06, 0.0, abs(el - 0.32)) * smoothstep(0.5, 0.1, abs(sin(az - uZeit * 0.15)));
  return l;
}

// Glimmen der Glut, flackert langsam; beim Zug leuchtet sie auf.
float glimmen() { return gGlut * (0.75 + 0.25 * rauschen3(vec3(uZeit * 1.7, 0.0, 0.0)) + 0.6 * gZug); }

// Eine Rauchfahne aus quelle: weitet sich nach oben, pendelt, dreht sich
// in Schwaden, vom Wind (Neigung) zur Seite gedrückt.
float fahne(vec3 q, vec3 quelle, float breite, float hoch, float phase) {
  vec3 r = q - quelle;
  float s = r.y;
  if (s < -0.05 || s > hoch) return 0.0;
  float t = uZeit + phase;
  float cx = 0.1 * s + 0.3 * s * sin(s * 1.3 - t * 0.5) + 0.35 * uNeigung.x * s;
  float cz = 0.24 * s * cos(s * 1.05 - t * 0.37);
  float w = breite + 0.12 * s;
  vec2 dd = vec2(r.x - cx, r.z - cz);
  float kern = exp(-dot(dd, dd) / (w * w));
  if (kern < 0.02) return 0.0;
  // Verwirbelt: die Wolke wird von einer zweiten verschoben
  vec3 wp = vec3(r.x * 2.4, s * 1.7 - t * 0.7, r.z * 2.4);
  wp += 0.9 * vec3(rauschen3(wp * 0.6 + t * 0.1), 0.0, rauschen3(wp * 0.6 - 3.7));
  float n = wolke(wp);
  // Unten glatt und dünn wie ein Faden, oben zerfasert
  float faser = mix(0.0, 0.45, smoothstep(0.1, 0.9, s));
  float schwaden = mix(1.0, smoothstep(0.3, 0.7, n + 0.25 * kern), faser / 0.45);
  return kern * schwaden * smoothstep(-0.05, 0.06, s) * smoothstep(hoch, hoch * 0.3, s);
}

// Rauchring: ein Torus, der aus der Glut aufsteigt, sich weitet und zerfließt.
float ring(vec3 q) {
  if (gRing < 0.0 || gRing > 11.0) return 0.0;
  float a = gRing;
  vec3 m = spitze() + vec3(0.12 * a + 0.2 * uNeigung.x * a, 0.12 + 0.24 * a, 0.0);
  vec3 r = q - m;
  r.xy = drehung(0.25 * sin(a * 0.4)) * r.xy;
  float R = 0.1 + 0.13 * pow(a, 0.7);
  vec2 tq = vec2(length(r.xz) - R, r.y);
  float w = 0.035 + 0.018 * a;
  float dichte = exp(-dot(tq, tq) / (w * w));
  return dichte * smoothstep(0.0, 0.6, a) * smoothstep(11.0, 4.0, a) * (0.6 + 0.4 * wolke(r * 5.0 + a));
}

// Ascheflocken: einzelne helle Punkte in einer Säule zwischen Joint und Haufen.
float flocken(vec3 q) {
  if (gFlocken < 0.01) return 0.0;
  vec3 x = welt(gFlockX);
  float saeule = exp(-pow((q.x - x.x) / 0.35, 2.0)) * exp(-pow(q.z / 0.3, 2.0)) * step(0.0, q.y) * step(q.y, x.y + 0.15);
  if (saeule < 0.02) return 0.0;
  vec3 g = q * vec3(11.0, 7.0, 11.0) + vec3(0.0, gSteigen * uZeit * 2.2, 0.0);
  g.x += 0.4 * sin(q.y * 6.0 + uZeit);
  return gFlocken * saeule * smoothstep(0.78, 0.86, rauschen3(g));
}

// Gesamter Rauch und Flocken an einem Punkt.
float rauch(vec3 q) {
  float d = (gRauch + 0.8 * gZug) * fahne(q, spitze(), 0.025, 3.0, 0.0);
  // Zweiter, dünner Faden zieht etwas versetzt hoch und verflicht sich mit dem ersten
  d += 0.55 * gRauch * fahne(q, spitze() + vec3(0.03, 0.0, 0.0), 0.015, 2.4, 9.0);
  // Ein schwacher Faden aus dem Filter
  d += 0.3 * gRauch * fahne(q, welt(LINKS - 0.02), 0.012, 1.4, 4.0);
  d += 0.9 * ring(q);
  return d;
}

// Was die Probe getroffen hat und wie weit weg; verschiedene Treffer in
// einer Zelle ergeben eine Kontur.
float gKennung;

// Eine Probe: Farbe der Tinte (vorgewichtet) und Helligkeit.
vec4 probe(vec2 px) {
  gKennung = -2.0;
  vec2 uv = (px - 0.5 * uRes) / uRes.y;
  vec2 p = (uv - uRahmen.xy) / uRahmen.z;
  float A = uRahmen.w;
  float rand = smoothstep(0.0, 0.08, A * 0.5 - abs(p.x)) * smoothstep(0.0, 0.08, 0.5 - abs(p.y));
  if (rand <= 0.0) return vec4(0.0);

  // Kamera schwenkt vor dem Joint hin und her, hebt und senkt sich, folgt der Neigung
  float az = 1.5708 + 0.35 * sin(uZeit * 0.09) + uNeigung.x * 0.35;
  float el = 0.16 + 0.08 * sin(uZeit * 0.11) - uNeigung.y * 0.08;
  float abstand = 6.0 * (1.0 + 0.05 * sin(uZeit * 0.07)) * max(1.0, 1.3 / A);
  vec3 ziel = vec3(0.3, 1.2, 0.0);
  vec3 ro = ziel + abstand * vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  vec3 vor = normalize(ziel - ro);
  vec3 rechts = normalize(cross(vor, vec3(0.0, 1.0, 0.0)));
  vec3 hoch = cross(rechts, vor);
  vec3 rd = normalize(vor * 1.75 + p.x * rechts + p.y * hoch);

  vec3 grauTinte = mix(vec3(0.2), vec3(0.78), uDunkel);
  vec3 glut = vec3(1.0, 0.42, 0.08);
  vec3 E = spitze();
  float hell = 0.0;
  vec3 farbe = vec3(0.0);
  float menge = 0.0;
  float tEnde = 40.0;

  // Nur im Kasten um den Joint marschieren
  vec3 bmin = vec3(-1.8, 0.0, -0.5), bmax = vec3(1.75, 1.25, 0.5);
  vec3 t0 = (bmin - ro) / rd, t1 = (bmax - ro) / rd;
  vec3 tk = min(t0, t1), tg = max(t0, t1);
  float tn = max(max(tk.x, tk.y), max(tk.z, 0.0));
  float tf = min(min(tg.x, tg.y), tg.z);
  float t = tn;
  bool treffer = false;
  if (tf > tn) {
    for (int i = 0; i < 96; i++) {
      vec3 q = ro + rd * t;
      float d = joint(q);
      if (d < 0.0012 * t) { treffer = true; break; }
      t += d * 0.8;
      if (t > tf) break;
    }
  }

  if (treffer) {
    vec3 q = ro + rd * t;
    joint(q);
    float mat = gMat;
    gKennung = 10.0 + mat;
    tEnde = t;
    vec3 n = normale(q);
    vec3 v = -rd;
    vec3 L = normalize(vec3(0.35, 0.85, 0.4));
    vec3 r = reflect(rd, n);
    float diffus = max(dot(n, L), 0.0);
    float glanz = pow(max(dot(n, normalize(L + v)), 0.0), 30.0);
    float himmel = 0.5 + 0.5 * n.y;
    float auf = max(dot(n, v), 0.0);
    vec3 j = lokal(q);
    float w = atan(j.z, j.y);
    // Licht der Glut auf dem Papier davor
    float schein = exp(-max(gFront - j.x, 0.0) * 9.0) * glimmen();
    if (mat < 0.5) {
      // Papier: matt, mit gedrehter Klebenaht und angekohltem Rand zur Asche
      float naht = smoothstep(0.06, 0.0, abs(fract(w / 6.2832 + j.x * 0.45) - 0.5) - 0.44);
      float kohle = smoothstep(gFront - 0.12, gFront + 0.02, j.x) * step(0.001, gAsche);
      hell = 0.15 + 0.75 * diffus + 0.2 * himmel + 0.35 * auf + 0.15 * studio(r) + 0.2 * glanz;
      hell *= 1.0 - 0.18 * naht;
      hell *= 1.0 - 0.75 * kohle;
      hell += 0.35 * schein * (1.0 - kohle);
      farbe = glut;
      menge = 0.55 * schein;
    } else if (mat < 1.5) {
      // Filter von vorn: gerollte Pappe als Spirale, Loch in der Mitte
      float rr = length(j.yz);
      float spirale = step(0.7, fract(rr / 0.022 - w / 6.2832));
      hell = (0.3 + 0.35 * auf) * (1.0 - 0.6 * spirale) * smoothstep(0.012, 0.03, rr);
    } else if (mat < 2.5) {
      // Asche: grau, rissig, an den Rissen schimmert die Glut durch
      float riss = smoothstep(0.62, 0.72, rauschen3(vec3(j.yz * 22.0, j.x * 22.0)));
      hell = 0.18 + 0.32 * diffus + 0.12 * auf + 0.1 * rauschen3(q * 40.0);
      float durch = riss * smoothstep(gFront + gAsche, gFront, j.x) * glimmen();
      hell = mix(hell, 0.85, durch);
      farbe = glut;
      menge = durch;
    } else if (mat < 3.5) {
      // Glut; ohne Feuer (neu oder verglommen) Papier bzw. dunkle Asche
      float g = glimmen();
      float kalt = step(0.001, gAsche) * (0.15 + 0.2 * diffus) + (1.0 - step(0.001, gAsche)) * (0.15 + 0.7 * diffus + 0.35 * auf);
      hell = mix(kalt, 0.85 + 0.4 * g, min(gGlut, 1.0));
      farbe = mix(glut, vec3(1.0, 0.85, 0.5), 0.3 * g);
      menge = min(gGlut, 1.0);
    } else {
      // Aschehaufen: grau und körnig
      hell = 0.12 + 0.3 * diffus + 0.1 * auf + 0.12 * rauschen3(q * 50.0);
    }
    // Weiche Tonkurve: Lichter laufen sanft aus, statt alles auf @ zu drücken
    hell = max(1.0 - exp(-2.0 * hell), 0.13);
  } else if (rd.y < 0.0) {
    // Studioboden: weicher Schatten unter dem Joint
    float tb = -ro.y / rd.y;
    vec3 b = ro + rd * tb;
    gKennung = -1.0;
    tEnde = tb;
    vec2 ab = abs(b.xz - vec2(0.0, 0.0)) - vec2(1.6, 0.05);
    float fuss = length(max(ab, 0.0)) + min(max(ab.x, ab.y), 0.0);
    float schatten = smoothstep(0.0, 0.7, fuss);
    hell = 0.035 * schatten * smoothstep(3.5, 1.0, length(b.xz));
    hell *= smoothstep(14.0, 6.0, tb);
  }

  // Rauch als Volumen vor allem, was schon getroffen wurde
  vec3 rmin = vec3(-2.2, 0.0, -1.3), rmax = vec3(E.x + 1.9, E.y + 3.2, 1.3);
  t0 = (rmin - ro) / rd;
  t1 = (rmax - ro) / rd;
  tk = min(t0, t1);
  tg = max(t0, t1);
  float rn = max(max(tk.x, tk.y), max(tk.z, 0.0));
  float rf = min(min(min(tg.x, tg.y), tg.z), tEnde);
  if (rf > rn) {
    float schritt = (rf - rn) / 28.0;
    float tr = rn + schritt * rauschen(px);
    float dichte = 0.0;
    float waerme = 0.0;
    for (int i = 0; i < 28; i++) {
      vec3 q = ro + rd * tr;
      float dd = (rauch(q) * 3.5 + flocken(q) * 12.0) * schritt * (1.0 - dichte);
      dichte += dd;
      waerme += dd * exp(-(q.y - E.y) * 5.0);
      tr += schritt;
    }
    dichte = clamp(dichte, 0.0, 1.0);
    hell = mix(hell, 0.62, dichte);
    float warm = clamp(waerme / max(dichte, 1e-3), 0.0, 1.0) * glimmen();
    menge = mix(menge, 0.5 * warm, dichte);
    farbe = mix(farbe, glut, dichte);
  }

  float d = hell * rand;
  vec3 farbTinte = mix(farbe * 0.82, mix(farbe, vec3(1.0), 0.12), uDunkel);
  return vec4(mix(grauTinte, farbTinte, menge) * d, d);
}

// Ebene eines Treffers für die Konturen: Hintergrund, Papier, Filter, Asche
// (die Glut gehört zur Asche, dort soll keine Linie laufen).
float ebene(float k) {
  if (k < 5.0) return 0.0;
  return min(k - 9.0, 3.0);
}

void main() {
  leben();
  vec2 zelle = floor(gl_FragCoord.xy);
  vec2 mitte = (zelle + 0.5) * uZelle;
  vec4 s = vec4(0.0);
  float eMin = 9.0, eMax = -1.0;
  vec2 gefaelle = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    float j = float(i);
    vec2 o = j < 0.5 ? vec2(-0.125, -0.375) : j < 1.5 ? vec2(0.375, -0.125) : j < 2.5 ? vec2(0.125, 0.375) : vec2(-0.375, 0.125);
    s += probe(mitte + uZelle * o);
    float e = ebene(gKennung);
    eMin = min(eMin, e);
    eMax = max(eMax, e);
    gefaelle += (e > 0.5 ? 1.0 + 0.3 * e : 0.0) * o * uZelle;
  }
  s *= 0.25;
  vec3 tinte = s.a > 0.0 ? s.rgb / s.a : mix(vec3(0.2), vec3(0.78), uDunkel);
  float d = pow(s.a, 0.9);

  // Rund um den Zeiger taucht ein Untergrund aus Zeichen auf, in Schwarz,
  // Grau und Weiß; er atmet langsam und färbt auch das Motiv darunter grau.
  float abstand = length(mitte - uZeiger.xy) / uRes.y;
  float hof = uZeiger.z * smoothstep(0.13, 0.02, abstand);
  float atmen = 0.5 + 0.5 * sin(uZeit * 0.7);
  vec2 f = zelle * vec2(0.17, 0.27);
  float feld = mix(rauschen3(vec3(f, 0.0)), rauschen3(vec3(f, 0.0) + 17.0), atmen);
  feld = mix(feld, rauschen(zelle), 0.25);
  d = max(d, (0.22 + 0.6 * feld) * hof);
  // Hell: von Schwarz bis Mittelgrau; dunkel: von Weiß bis Mittelgrau.
  float grau = mix(mix(0.04, 0.55, 1.0 - feld), mix(0.98, 0.45, 1.0 - feld), uDunkel);
  float grauMotiv = dot(tinte, vec3(0.299, 0.587, 0.114));
  tinte = mix(tinte, vec3(mix(grauMotiv, grau, 1.0 - smoothstep(0.1, 0.35, s.a))), hof);

  // Kontur: treffen die Proben verschiedene Teile, wird die Zelle ein
  // Strich in Richtung der Kante (waagrecht, schräg, senkrecht). Kodiert über 0,8 im Alpha.
  float a = min(d, 1.0) * 0.75;
  if (eMax != eMin && length(gefaelle) > 0.01) {
    float kante = mod(atan(gefaelle.y, gefaelle.x) + 1.5708, 3.1416);
    float k = floor(mod(kante + 0.3927, 3.1416) / 0.7854);
    a = 0.82 + 0.05 * k;
    tinte = mix(tinte, vec3(mix(0.1, 1.0, uDunkel)), 0.25);
  }
  gl_FragColor = vec4(tinte, a);
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
  // Bis 0,75 Dichte (Zeichen nach Helligkeit), darüber Konturstriche.
  float dichte = z.a / 0.75;
  float i = min(floor(dichte * uGlyphen), uGlyphen - 1.0);
  if (z.a > 0.79) {
    i = uGlyphen + floor((z.a - 0.8) / 0.05);
    dichte = 0.9;
  }
  vec2 lokal = gl_FragCoord.xy - zelle * uZelle;
  float g = texture2D(uAtlas, vec2((i * uZelle.x + lokal.x) / ((uGlyphen + 4.0) * uZelle.x), lokal.y / uZelle.y)).a;
  vec3 grund = mix(vec3(1.0), vec3(0.0), uDunkel);
  // Die Helligkeit steckt im Zeichen und in seiner Farbe, das gibt Tiefe.
  gl_FragColor = vec4(mix(grund, z.rgb, g * (0.12 + 0.88 * pow(min(dichte, 1.0), 1.5))), 1.0);
}
`;

// Zeichen nach Deckung sortiert, damit die Dichte gleichmäßig ansteigt;
// dahinter die vier Konturstriche in fester Reihenfolge.
const ZEICHEN = ' .,:;-~=+*xoO#%@';
const STRICHE = '-/|\\';

// Baut den Atlas: alle Zeichen nebeneinander in Zellgröße, weiß auf leer.
export function atlasZeichnen(breite, hoehe) {
  const c = document.createElement('canvas');
  c.width = breite * (ZEICHEN.length + STRICHE.length);
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
  schreiben(folge + STRICHE);
  return { canvas: c, anzahl: ZEICHEN.length };
}
