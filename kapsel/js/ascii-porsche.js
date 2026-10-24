// ASCII-Hintergrund: ein Porsche 911 GT3 RS (992) als 3D-Modell, gerendert
// wie im Fotostudio und in Terminal-Zeichen übersetzt. Die Kamera kreist
// langsam um das Auto, hebt und senkt sich und folgt der Neigung bzw. der
// Maus; der Lack hat die Farbe des Session-Status.
//
// Gerechnet wird in zwei Durchgängen. PORSCHE verfolgt pro Zeichenzelle vier
// Strahlen durch das gemeinsame Modell (porsche-modell.js) und
// schattiert Lack, Glas, Reifen, Felgen, Carbon und Leuchten; ZEICHEN setzt
// dann echte Schriftzeichen aus einem Atlas nach Helligkeit ein. Die Zeichen
// stehen fest im Raster, nur ihre Dichte ändert sich.

import { MODELL } from './porsche-modell.js';

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
${MODELL}

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
  vec3 t0 = (KASTEN_MIN - ro) / rd, t1 = (KASTEN_MAX - ro) / rd;
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
    float art = teil(a, mat);
    if (art < 0.5) {
      float basis = (0.05 + 0.62 * diffus + 0.14 * himmel + 0.2 * auf) * ao;
      float spiegel = studio(r) * mix(0.12, 0.7, fres);
      hell = basis + spiegel + glanz * 1.3;
      farbe = lack;
      menge = clamp(0.9 - 0.7 * (spiegel + glanz), 0.15, 0.9);
    } else if (art < 1.5) {
      gKennung += 1.0;
      hell = 0.03 + 0.55 * studio(r) * mix(0.25, 1.0, fres);
    } else if (art < 2.5) {
      gKennung += 2.0;
      hell = 0.95;
      farbe = vec3(1.0, 0.12, 0.1);
      menge = 1.0;
    } else if (art < 3.5) {
      gKennung += 3.0;
      hell = 0.08 + 0.12 * diffus;
    } else if (art < 4.5) {
      hell = 0.1 + 0.15 * diffus * ao + 0.12 * auf + 0.25 * glanz;
    } else if (art < 5.5) {
      // Felge mit zehn Speichen und Zentralverschluss, dahinter der Sattel
      gKennung += 1.0;
      vec3 m = a.x > 0.0 ? RAD_V : RAD_H;
      vec2 rp = a.xy - m.xy;
      float rr = length(rp);
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
    } else if (art < 7.5) {
      float gewebe = 0.04 * step(0.5, fract((a.x + a.z) * 30.0));
      hell = 0.12 + gewebe + 0.25 * diffus + 0.45 * studio(r) * fres + 0.6 * glanz;
    } else if (art < 8.5) {
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
