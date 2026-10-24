// ASCII-Hintergrund: ein Porsche 911 GT3 RS (992) als 3D-Modell, gerendert
// wie im Fotostudio und in Terminal-Zeichen übersetzt. Die Kamera kreist
// langsam um das Auto, hebt und senkt sich und folgt der Neigung bzw. der
// Maus; der Lack hat die Farbe des Session-Status.
//
// Gerechnet wird in zwei Durchgängen. PORSCHE verfolgt pro Zeichenzelle vier
// Strahlen durch ein Modell aus Abstandsfunktionen (Karosserie aus Profil,
// Kotflügeln und Hüften, Räder, Schwanenhals-Flügel, Spiegel, Splitter) und
// schattiert Lack, Glas, Reifen, Felgen, Carbon und Leuchten; ZEICHEN setzt
// dann echte Schriftzeichen aus einem Atlas nach Helligkeit ein. Die Zeichen
// stehen fest im Raster, nur ihre Dichte ändert sich.

export const ASCII_PORSCHE = `
precision highp float;
uniform vec2 uRes;      // Canvas in Pixeln
uniform vec2 uZelle;    // Zeichenzelle in Pixeln (Breite, Höhe)
uniform vec4 uRahmen;   // Mitte des Bildes (uv), Höhe (uv), Seitenverhältnis
uniform float uZeit;
uniform float uDunkel;
uniform vec3 uZeiger;   // x, y in Canvas-Pixeln, Stärke 0 … 1
uniform vec2 uNeigung;
uniform vec3 uTon;      // Lackfarbe

float rauschen(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
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

// ---------- Das Modell (Meter, Boden y = 0, Front nach +x) ----------

// Mittellinie von der Seite: Haube tief zwischen den Kotflügeln, darüber
// die typische 911-Flyline als ein Bogen von der Frontscheibe übers Dach bis
// zum Motordeckel, dann das runde Heck.
float oberkante(float x) {
  float haube = 0.54 + 0.06 * rampe(x, 2.29, 2.1) + 0.13 * rampe(x, 2.1, 0.95);
  float deck = 0.93 - 0.17 * rampe(x, -1.75, -2.32);
  float basis = x > -0.3 ? haube : mix(haube, deck, rampe(x, -0.3, -1.4));
  float u = (x + 0.18) / (x > -0.18 ? 1.13 : 1.48);
  float dach = 0.73 + 0.56 * (1.0 - u * u);
  return smax(basis, dach, 0.06);
}
float unterkante(float x) { return 0.12 + 0.14 * sanft((-1.75 - x) / 0.5) + 0.04 * sanft((x - 2.05) / 0.25); }

float breite(float x, float y) {
  float w = mix(0.84, 0.9, sanft((0.3 - x) / 1.2));
  float n = clamp((x - 1.7) / 0.6, 0.0, 1.0);
  w *= 1.0 - 0.22 * n * n;
  float h = clamp((-1.85 - x) / 0.45, 0.0, 1.0);
  w *= 1.0 - 0.14 * h * h;
  w -= 0.06 * smoothstep(0.34, 0.12, y);
  float kabine = 0.66 - 0.16 * clamp((y - 0.86) / 0.43, 0.0, 1.0);
  return mix(w, kabine, smoothstep(0.68, 0.9, y));
}

const vec3 RAD_V = vec3(1.22, 0.345, 0.79);
const vec3 RAD_H = vec3(-1.23, 0.35, 0.82);

float gMat;   // 0 Lack, 1 Reifen/Felge, 2 Carbon, 3 Scheinwerfer, 4 Auspuff

float karosse(vec3 p) {
  vec3 q = vec3(p.x, p.y, abs(p.z));
  float d = smax(q.y - oberkante(q.x), unterkante(q.x) - q.y, 0.06);
  d = smax(d, q.z - breite(q.x, q.y), 0.07);
  d = smax(d, abs(q.x) - 2.3, 0.2);
  // Kotflügel vorn mit den runden Scheinwerfern, breite Hüften hinten
  d = smin(d, ellipsoid(q - vec3(1.27, 0.49, 0.66), vec3(0.98, 0.34, 0.26)), 0.07);
  d = smin(d, ellipsoid(q - vec3(-1.3, 0.57, 0.6), vec3(1.0, 0.44, 0.36)), 0.14);
  // Hutzen in der Haube
  d = smax(d, -kiste(q - vec3(1.76, 0.73, 0.22), vec3(0.15, 0.04, 0.1)), 0.025);
  // Radläufe
  float lauf = min(length(q.xy - RAD_V.xy) - 0.4, length(q.xy - RAD_H.xy) - 0.41);
  d = smax(d, -max(lauf, 0.48 - q.z), 0.03);
  return d;
}

float auto_(vec3 p) {
  vec3 q = vec3(p.x, p.y, abs(p.z));
  float d = karosse(p);
  gMat = 0.0;
  // Scheinwerfer
  float s = ellipsoid(q - vec3(2.0, 0.68, 0.62), vec3(0.11, 0.11, 0.115));
  if (s < d) { d = s; gMat = 3.0; }
  // Außenspiegel
  float sp = min(ellipsoid(q - vec3(0.72, 0.93, 0.83), vec3(0.08, 0.05, 0.09)), stab(q, vec3(0.76, 0.88, 0.68), vec3(0.73, 0.92, 0.8), 0.015));
  d = min(d, sp);
  // Räder
  vec3 rv = q - RAD_V, rh = q - RAD_H;
  float r = min(walze(rv, 0.325, 0.12) - 0.022, walze(rh, 0.33, 0.13) - 0.022);
  r = smax(r, -min(walze(rv - vec3(0.0, 0.0, 0.15), 0.25, 0.04), walze(rh - vec3(0.0, 0.0, 0.16), 0.255, 0.04)), 0.01);
  if (r < d) { d = r; gMat = 1.0; }
  // Carbon: Splitter, Schweller, Flügel mit Schwanenhälsen und Endplatten
  float c = kiste(q - vec3(2.14, 0.12, 0.0), vec3(0.12, 0.012, 0.76));
  c = min(c, kiste(q - vec3(0.0, 0.16, 0.86), vec3(0.92, 0.03, 0.035)));
  vec2 f = drehung(0.08) * (q.xy - vec2(-1.98, 1.36));
  c = min(c, kiste(vec3(f, q.z), vec3(0.2, 0.017, 0.82)) - 0.008);
  vec2 k = drehung(0.32) * (q.xy - vec2(-2.13, 1.43));
  c = min(c, kiste(vec3(k, q.z), vec3(0.09, 0.012, 0.8)) - 0.006);
  c = min(c, kiste(q - vec3(-2.03, 1.39, 0.83), vec3(0.19, 0.1, 0.008)));
  c = min(c, stab(q, vec3(-1.72, 0.9, 0.33), vec3(-1.79, 1.45, 0.33), 0.024));
  c = min(c, stab(q, vec3(-1.79, 1.45, 0.33), vec3(-1.93, 1.385, 0.33), 0.024));
  if (c < d) { d = c; gMat = 2.0; }
  // Zwei Endrohre in der Mitte
  float a = stab(q, vec3(-2.32, 0.31, 0.08), vec3(-2.18, 0.31, 0.08), 0.045);
  if (a < d) { d = a; gMat = 4.0; }
  return d;
}

vec3 normale(vec3 p) {
  const vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * auto_(p + e.xyy) + e.yyx * auto_(p + e.yyx) + e.yxy * auto_(p + e.yxy) + e.xxx * auto_(p + e.xxx));
}

// Studio, wie es sich im Lack spiegelt: dunkler Raum, eine breite Softbox
// oben, zwei lange Lichtstreifen, einer wandert langsam um das Auto.
float studio(vec3 r) {
  float el = r.y;
  float az = atan(r.z, r.x);
  float l = 0.04 + 0.1 * smoothstep(-0.2, 0.6, el);
  l += 1.1 * smoothstep(0.82, 0.9, el);
  l += 0.9 * smoothstep(0.06, 0.0, abs(el - 0.32)) * smoothstep(0.5, 0.1, abs(sin(az - uZeit * 0.15)));
  l += 0.6 * smoothstep(0.05, 0.0, abs(sin(az * 1.0 + 1.3))) * smoothstep(-0.1, 0.4, el);
  return l;
}

// Was die Probe getroffen hat und wie weit weg; verschiedene Treffer in
// einer Zelle ergeben eine Kontur.
float gKennung;
float gTiefe;

// Eine Probe: Farbe der Tinte (vorgewichtet) und Helligkeit.
vec4 probe(vec2 px) {
  gKennung = -2.0;
  gTiefe = 30.0;
  vec2 uv = (px - 0.5 * uRes) / uRes.y;
  vec2 p = (uv - uRahmen.xy) / uRahmen.z;
  float A = uRahmen.w;
  float rand = smoothstep(0.0, 0.08, A * 0.5 - abs(p.x)) * smoothstep(0.0, 0.08, 0.5 - abs(p.y));
  if (rand <= 0.0) return vec4(0.0);

  // Kamera kreist um das Auto, hebt und senkt sich, folgt der Neigung
  float az = uZeit * 0.2 + uNeigung.x * 0.7 + 0.6;
  float el = 0.2 + 0.1 * sin(uZeit * 0.11) - uNeigung.y * 0.1;
  float abstand = 7.0 * (1.0 + 0.06 * sin(uZeit * 0.07)) * max(1.0, 1.3 / A);
  vec3 ziel = vec3(0.0, 0.6, 0.0);
  vec3 ro = ziel + abstand * vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  vec3 vor = normalize(ziel - ro);
  vec3 rechts = normalize(cross(vor, vec3(0.0, 1.0, 0.0)));
  vec3 hoch = cross(rechts, vor);
  vec3 rd = normalize(vor * 1.75 + p.x * rechts + p.y * hoch);

  vec3 grauTinte = mix(vec3(0.2), vec3(0.78), uDunkel);
  vec3 lack = uTon;
  float hell = 0.0;
  vec3 farbe = vec3(0.0);
  float menge = 0.0;

  // Nur im Kasten um das Auto marschieren
  vec3 bmin = vec3(-2.45, 0.0, -1.0), bmax = vec3(2.45, 1.65, 1.0);
  vec3 t0 = (bmin - ro) / rd, t1 = (bmax - ro) / rd;
  vec3 tk = min(t0, t1), tg = max(t0, t1);
  float tn = max(max(tk.x, tk.y), max(tk.z, 0.0));
  float tf = min(min(tg.x, tg.y), tg.z);
  float t = tn;
  bool treffer = false;
  if (tf > tn) {
    for (int i = 0; i < 90; i++) {
      vec3 q = ro + rd * t;
      float d = auto_(q);
      if (d < 0.0015 * t) { treffer = true; break; }
      t += d * 0.7;
      if (t > tf) break;
    }
  }

  if (treffer) {
    vec3 q = ro + rd * t;
    auto_(q);
    float mat = gMat;
    gKennung = 10.0 + mat * 4.0;
    gTiefe = t;
    vec3 n = normale(q);
    vec3 v = -rd;
    vec3 L = normalize(vec3(0.35, 0.85, 0.4));
    vec3 r = reflect(rd, n);
    float diffus = max(dot(n, L), 0.0);
    float glanz = pow(max(dot(n, normalize(L + v)), 0.0), 80.0);
    float fres = 0.05 + 0.95 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    float himmel = 0.5 + 0.5 * n.y;
    // Aufheller aus Richtung der Kamera, damit auch die Schattenseite Zeichen bekommt
    float auf = max(dot(n, v), 0.0);
    float ao = clamp(0.4 + 6.0 * auto_(q + n * 0.06), 0.0, 1.0);
    vec3 a = vec3(q.x, q.y, abs(q.z));
    if (mat < 0.5) {
      // Lack, oder Glas, Leuchtband, Lufteinlässe auf der Karosserie
      float dachH = oberkante(a.x);
      bool seite = a.z > 0.47 && a.y > 0.88 && a.y < dachH - 0.06 && a.x < 0.86 - (a.y - 0.88) * 1.25
        && length(vec2((a.x + 0.55) / 0.55, (a.y - 0.88) / max(dachH - 0.94, 0.01))) < 1.0 + step(-0.55, a.x) * 9.0;
      bool glas = seite
        || (a.x > 0.12 && a.x < 0.9 && a.z < 0.56 && a.y > 0.79)
        || (a.x < -0.55 && a.x > -1.3 && a.z < 0.42 && a.y > 0.95);
      bool rueck = a.x < -2.06 && abs(a.y - (oberkante(a.x) - 0.075)) < 0.026 && a.z < 0.8;
      bool diffusor = a.x < -2.0 && a.y < 0.36;
      bool einlass = (a.x > 2.13 && a.y > 0.18 && a.y < 0.42 && a.z < 0.72)
        || (a.z > 0.78 && a.x > -0.78 + (a.y - 0.45) * 0.4 && a.x < -0.62 + (a.y - 0.45) * 0.4 && a.y > 0.45 && a.y < 0.64);
      bool kiemen = a.x > 1.05 && a.x < 1.55 && a.z > 0.56 && a.z < 0.8 && a.y > 0.7 && fract(a.x * 20.0) > 0.55;
      if (glas) {
        gKennung += 1.0;
        hell = 0.03 + 0.55 * studio(r) * mix(0.25, 1.0, fres);
      } else if (rueck) {
        gKennung += 2.0;
        hell = 0.95;
        farbe = vec3(1.0, 0.12, 0.1);
        menge = 1.0;
      } else if (einlass || kiemen || diffusor) {
        gKennung += 3.0;
        hell = 0.08 + 0.12 * diffus;
      } else {
        float basis = (0.05 + 0.62 * diffus + 0.14 * himmel + 0.2 * auf) * ao;
        float spiegel = studio(r) * mix(0.12, 0.7, fres);
        hell = basis + spiegel + glanz * 1.3;
        farbe = lack;
        menge = clamp(0.9 - 0.7 * (spiegel + glanz), 0.15, 0.9);
      }
    } else if (mat < 1.5) {
      // Reifen außen, Felge mit zehn Speichen und Zentralverschluss innen
      vec3 m = a.x > 0.0 ? RAD_V : RAD_H;
      vec2 rp = a.xy - m.xy;
      float rr = length(rp);
      if (rr > 0.255) {
        hell = 0.1 + 0.15 * diffus * ao + 0.12 * auf + 0.25 * glanz;
      } else {
        gKennung += 1.0;
        float w = atan(rp.y, rp.x);
        float speiche = smoothstep(0.1, 0.4, cos(w * 10.0)) * step(0.06, rr);
        bool sattel = rr > 0.13 && rr < 0.24 && w > 0.3 && w < 1.3 && speiche < 0.5;
        float metall = 0.4 + 0.4 * studio(r) + 0.2 * auf + 0.6 * glanz;
        hell = mix(0.1, metall, max(speiche, step(rr, 0.06)));
        if (sattel) {
          hell = 0.7;
          farbe = vec3(1.0, 0.82, 0.1);
          menge = 0.9;
        }
      }
    } else if (mat < 2.5) {
      float gewebe = 0.04 * step(0.5, fract((a.x + a.z) * 30.0));
      hell = 0.12 + gewebe + 0.25 * diffus + 0.45 * studio(r) * fres + 0.6 * glanz;
    } else if (mat < 3.5) {
      hell = 1.0;
      farbe = vec3(1.0, 0.95, 0.85);
      menge = 0.3;
    } else {
      hell = 0.3 + 0.6 * studio(r);
    }
    // Weiche Tonkurve: Lichter laufen sanft aus, statt alles auf @ zu drücken
    hell = max(1.0 - exp(-2.0 * hell), 0.13);
  } else if (rd.y < 0.0) {
    // Studioboden: drehbare Plattform mit Ring, weicher Schatten unter dem Auto
    float tb = -ro.y / rd.y;
    vec3 b = ro + rd * tb;
    gKennung = -1.0;
    gTiefe = tb;
    float rb = length(b.xz);
    float platte = smoothstep(3.3, 3.1, rb);
    float ring = smoothstep(0.05, 0.0, abs(rb - 3.15)) * (0.6 + 0.4 * step(0.5, fract(atan(b.z, b.x) * 9.55)));
    vec2 ab = abs(b.xz) - vec2(2.05, 0.78);
    float fuss = length(max(ab, 0.0)) + min(max(ab.x, ab.y), 0.0);
    float schatten = smoothstep(-0.2, 0.7, fuss);
    hell = 0.03 * platte * smoothstep(3.2, 1.0, rb) * schatten + 0.22 * ring;
    float abglanz = (1.0 - smoothstep(0.0, 1.2, fuss)) * 0.5 * (1.0 - smoothstep(-0.2, 0.2, fuss) * 0.3);
    hell = max(hell, 0.12 * abglanz);
    farbe = lack;
    menge = 0.5 * abglanz;
    hell *= smoothstep(14.0, 6.0, tb);
  }
  float d = hell * rand;
  vec3 farbTinte = mix(farbe * 0.82, mix(farbe, vec3(1.0), 0.12), uDunkel);
  return vec4(mix(grauTinte, farbTinte, menge) * d, d);
}

// Ebene eines Treffers für die Konturen: Hintergrund, Lack, Glas, Rad, Carbon.
float ebene(float k) {
  if (k < 5.0) return 0.0;
  if (k == 11.0 || k == 22.0) return 2.0;
  if (k >= 14.0 && k < 18.0) return 3.0;
  if (k >= 18.0 && k < 22.0) return 4.0;
  return 1.0;
}

void main() {
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

  // Rund um den Zeiger zeigt sich ein ruhiges Zeichenfeld in der Lackfarbe.
  float abstand = length(mitte - uZeiger.xy) / uRes.y;
  float hof = uZeiger.z * smoothstep(0.1, 0.015, abstand);
  float atmen = 0.5 + 0.5 * sin(uZeit * 0.7);
  float feld = mix(rauschen(floor(zelle * 0.5)), rauschen(floor(zelle * 0.5) + 17.0), atmen);
  d = max(d, (0.08 + 0.14 * feld) * hof);
  vec3 ton = mix(uTon * 0.82, mix(uTon, vec3(1.0), 0.12), uDunkel);
  tinte = mix(tinte, ton, hof * (1.0 - smoothstep(0.1, 0.35, s.a)));

  // Kontur: treffen die Proben verschiedene Teile, wird die Zelle ein
  // Strich in Richtung der Kante (waagrecht, schräg, senkrecht). Kodiert über 0,8 im Alpha.
  float a = d * 0.75;
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
