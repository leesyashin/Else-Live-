// HD-Stil: der Porsche 911 GT3 RS (992) fährt über eine Landstraße, in
// voller Auflösung des Bildschirms gerendert (auf dem Mac in Retina, also
// nahe 4K). Wie schnell er fährt, hängt am Session-Status: arbeitet Claude,
// fährt er schnell, sonst langsam. Die Kamera begleitet ihn und kreist dabei
// langsam, Maus bzw. Neigung drehen den Blick.
//
// Hell und Dunkel folgen dem System: am Tag Sonne, blauer Himmel und
// harte Schatten, in der Nacht Laternen, deren Lichtkegel über Straße und
// Lack wandern, Scheinwerfer und Rücklicht. Bremst er, leuchtet das
// Leuchtband heller.

import { MODELL } from './porsche-modell.js';

export const PORSCHE_HD = `
precision highp float;
uniform vec2 uRes;
uniform vec4 uRahmen;   // Mitte der freien Fläche (uv), -, -, ihr Seitenverhältnis
uniform float uZeit;
uniform float uDunkel;
uniform vec2 uNeigung;
uniform vec3 uTon;      // Lackfarbe
uniform float uWeg;     // gefahrene Meter
uniform float uTempo;   // Meter pro Sekunde
uniform float uBremse;  // 0 … 1

float rauschen(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float wert(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rauschen(i), rauschen(i + vec2(1.0, 0.0)), f.x), mix(rauschen(i + vec2(0.0, 1.0)), rauschen(i + vec2(1.0, 1.0)), f.x), f.y);
}

${MODELL}

const float LATERNE = 34.0;   // Abstand der Laternen in Metern

vec3 sonne() { return normalize(vec3(0.45, 0.62, 0.55)); }

// Laterne k (0 … 5) relativ zum Auto: x wandert mit dem Weg nach hinten.
vec3 laterne(float k) {
  float x = (k - 2.0) * LATERNE - mod(uWeg, LATERNE) + 18.0;
  return vec3(x, 7.5, -7.5);
}
const vec3 LAMPE = vec3(1.0, 0.72, 0.42);

// Himmel und Ferne, wie sie sich im Lack und in den Scheiben spiegeln.
vec3 umgebung(vec3 r, vec3 p) {
  vec3 tagOben = vec3(0.16, 0.38, 0.82), tagHorizont = vec3(0.7, 0.8, 0.92);
  vec3 nachtOben = vec3(0.005, 0.008, 0.02), nachtHorizont = vec3(0.06, 0.045, 0.06);
  float h = clamp(r.y, -1.0, 1.0);
  vec3 tag = mix(tagHorizont, tagOben, sqrt(max(h, 0.0)));
  vec3 nacht = mix(nachtHorizont, nachtOben, sqrt(max(h, 0.0)));
  vec3 c = mix(tag, nacht, uDunkel);
  // Sonne
  c += (1.0 - uDunkel) * vec3(6.0, 5.5, 4.6) * pow(max(dot(r, sonne()), 0.0), 900.0);
  c += (1.0 - uDunkel) * vec3(0.5, 0.42, 0.3) * pow(max(dot(r, sonne()), 0.0), 12.0);
  // Hügel am Horizont, am Tag blaugrün, nachts kaum zu sehen
  float az = atan(r.z, r.x);
  float huegel = 0.035 + 0.025 * wert(vec2(az * 3.0, 1.0)) + 0.012 * wert(vec2(az * 11.0, 2.0));
  float drin = smoothstep(huegel + 0.004, huegel - 0.004, h) * step(-0.05, h);
  c = mix(c, mix(vec3(0.42, 0.52, 0.58), vec3(0.012, 0.01, 0.016), uDunkel), drin * 0.85);
  // Boden in der Spiegelung
  if (r.y < 0.0) c = mix(c, mix(vec3(0.16, 0.16, 0.17), vec3(0.008), uDunkel), smoothstep(0.0, -0.08, r.y));
  return c;
}

// Spiegelung der Laternen im Lack (nur nachts)
vec3 laternenGlanz(vec3 p, vec3 r, float scharf) {
  vec3 c = vec3(0.0);
  for (int k = 0; k < 6; k++) {
    vec3 l = laterne(float(k));
    for (int s = 0; s < 2; s++) {
      vec3 ls = vec3(l.x, l.y, s == 0 ? l.z : -l.z);
      vec3 d = normalize(ls - p);
      c += LAMPE * 9.0 * pow(max(dot(r, d), 0.0), scharf);
    }
  }
  return c * uDunkel;
}

// Licht der Laternen auf einem Punkt mit Normale n
vec3 laternenLicht(vec3 p, vec3 n) {
  vec3 c = vec3(0.0);
  for (int k = 0; k < 6; k++) {
    vec3 l = laterne(float(k));
    for (int s = 0; s < 2; s++) {
      vec3 ls = vec3(l.x, l.y, s == 0 ? l.z : -l.z);
      vec3 d = ls - p;
      float e = dot(d, d);
      d *= inversesqrt(e);
      float kegel = smoothstep(0.6, 0.9, -d.y);
      c += LAMPE * 22.0 * max(dot(n, d), 0.0) * kegel / e;
    }
  }
  return c * uDunkel;
}

// Kasten um das Auto: Eintritt und Austritt des Strahls
vec2 kasten(vec3 ro, vec3 rd) {
  vec3 t0 = (KASTEN_MIN - ro) / rd, t1 = (KASTEN_MAX - ro) / rd;
  vec3 tk = min(t0, t1), tg = max(t0, t1);
  return vec2(max(max(tk.x, tk.y), max(tk.z, 0.0)), min(min(tg.x, tg.y), tg.z));
}

float weicherSchatten(vec3 ro, vec3 rd) {
  vec2 k = kasten(ro, rd);
  if (k.y <= k.x) return 1.0;
  float t = max(k.x, 0.02), s = 1.0;
  for (int i = 0; i < 28; i++) {
    float d = auto_(ro + rd * t);
    s = min(s, 10.0 * d / t);
    if (s < 0.01) break;
    t += clamp(d, 0.02, 0.25);
    if (t > k.y) break;
  }
  return clamp(s, 0.0, 1.0);
}

// Laternenmasten am Straßenrand: senkrechte Rohre mit Ausleger und Leuchte.
// Gibt den Abstand des nächsten Treffers zurück (oder 1e9) und die Farbe.
float masten(vec3 ro, vec3 rd, out vec3 farbe) {
  float best = 1e9;
  farbe = vec3(0.0);
  for (int k = 0; k < 6; k++) {
    vec3 l = laterne(float(k));
    for (int s = 0; s < 2; s++) {
      vec2 m = vec2(l.x, s == 0 ? l.z - 0.6 : -l.z + 0.6);
      // Rohr: Kreis mit Radius 0,09 in der x-z-Ebene
      vec2 o = ro.xz - m;
      vec2 d = rd.xz;
      float a = dot(d, d), b = dot(o, d), c = dot(o, o) - 0.0081;
      float h = b * b - a * c;
      if (h > 0.0) {
        float t = (-b - sqrt(h)) / a;
        float y = ro.y + rd.y * t;
        if (t > 0.0 && t < best && y > 0.0 && y < l.y + 0.2) {
          best = t;
          vec3 n = normalize(vec3(o + d * t, 0.0).xzy);
          float licht = 0.04 + 0.3 * max(dot(n, sonne()), 0.0) * (1.0 - uDunkel);
          farbe = mix(vec3(0.5), vec3(0.02), uDunkel) * licht + umgebung(reflect(rd, n), ro) * 0.2;
        }
      }
      // Leuchte oben als helle Scheibe
      vec3 kopf = vec3(l.x, l.y, s == 0 ? l.z : -l.z);
      vec3 w = kopf - ro;
      float tk = dot(w, rd);
      if (tk > 0.0 && tk < best) {
        float dd = length(w - rd * tk);
        if (dd < 0.28) {
          best = tk;
          farbe = mix(vec3(0.6), LAMPE * 6.0, uDunkel) * smoothstep(0.28, 0.1, dd);
        }
      }
    }
  }
  return best;
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

vec3 strasse(vec3 ro, vec3 rd, float t, vec2 px) {
  vec3 b = ro + rd * t;
  float X = b.x + uWeg;
  float z = b.z;
  float fuss = t * 1.2 / uRes.y;   // Größe eines Pixels auf der Straße
  float unschaerfe = uTempo * 0.009 + fuss;
  // Asphalt: feines Korn, das bei Tempo zu Streifen verwischt
  float korn = mix(wert(vec2(X * 9.0, z * 9.0)), wert(vec2(X * 0.6, z * 9.0)), smoothstep(2.0, 20.0, uTempo));
  vec3 asphalt = mix(vec3(0.17, 0.17, 0.18), vec3(0.016, 0.016, 0.018), uDunkel) * (0.8 + 0.35 * korn);
  float strassenBreite = 5.6;
  vec3 c = asphalt;
  if (abs(z + 1.85) > strassenBreite) c = mix(vec3(0.1, 0.14, 0.08), vec3(0.004, 0.006, 0.004), uDunkel) * (0.7 + 0.5 * wert(vec2(X * 0.8, z * 0.8)));
  // Markierungen: durchgezogen am Rand, gestrichelt in der Mitte
  vec3 weiss = mix(vec3(0.75), vec3(0.08), uDunkel);
  float linie = smoothstep(0.08 + fuss, 0.06, abs(z - 1.85)) + smoothstep(0.08 + fuss, 0.06, abs(z + 5.55));
  float f = fract(X / 9.0);
  float strich = smoothstep(-unschaerfe / 9.0, unschaerfe / 9.0, 0.34 - f) * smoothstep(-unschaerfe / 9.0, unschaerfe / 9.0, f);
  strich = mix(strich, 0.34, smoothstep(0.3, 1.0, unschaerfe / 3.0));
  linie += smoothstep(0.08 + fuss, 0.06, abs(z + 1.85)) * strich;
  c = mix(c, weiss, clamp(linie, 0.0, 1.0));
  // Licht: Sonne mit Schatten des Autos, nachts Laternen und Scheinwerfer
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 licht = vec3(0.0);
  float schatten = weicherSchatten(b + n * 0.01, sonne());
  licht += (1.0 - uDunkel) * (vec3(2.6, 2.4, 2.1) * max(sonne().y, 0.0) * schatten + vec3(0.35, 0.45, 0.6));
  // Kontaktschatten unter dem Auto
  vec2 ab = abs(b.xz) - vec2(1.95, 0.72);
  float unter = length(max(ab, 0.0)) + min(max(ab.x, ab.y), 0.0);
  float ao = mix(0.25, 1.0, smoothstep(-0.3, 0.6, unter));
  licht *= ao;
  licht += laternenLicht(b, n) * ao;
  // Scheinwerferkegel vor dem Auto, rotes Glimmen dahinter
  float vorne = b.x - 2.3;
  if (vorne > 0.0) {
    float breit = 0.8 + vorne * 0.16;
    licht += uDunkel * vec3(0.55, 0.53, 0.48) * smoothstep(breit, breit * 0.4, abs(z)) * exp(-vorne * 0.12) * smoothstep(0.0, 2.0, vorne);
  }
  float hinten = -2.3 - b.x;
  if (hinten > 0.0) licht += (0.25 * uDunkel + 0.6 * uBremse) * vec3(1.0, 0.05, 0.03) * exp(-hinten * 0.9) * smoothstep(1.2, 0.3, abs(z));
  c *= licht;
  // Nasser Glanz der Laternen auf dem Asphalt
  vec3 r = reflect(rd, n);
  c += laternenGlanz(b, r, 60.0) * 0.05 * (0.6 + 0.4 * korn);
  // Dunst in der Ferne
  vec3 dunst = umgebung(vec3(rd.x, 0.02, rd.z), ro);
  return mix(c, dunst, smoothstep(50.0, 300.0, t));
}

vec3 auto_farbe(vec3 ro, vec3 rd, float t) {
  vec3 p = ro + rd * t;
  auto_(p);
  float mat = gMat;
  vec3 n = normale(p);
  vec3 v = -rd;
  vec3 a = vec3(p.x, p.y, abs(p.z));
  float art = teil(a, mat);
  vec3 r = reflect(rd, n);
  float nv = max(dot(n, v), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
  float ao = clamp(0.35 + 5.0 * auto_(p + n * 0.05) + 3.0 * auto_(p + n * 0.15), 0.0, 1.0);
  vec3 L = sonne();
  float schatten = (1.0 - uDunkel) > 0.01 ? weicherSchatten(p + n * 0.01, L) : 0.0;
  vec3 sonnenLicht = (1.0 - uDunkel) * vec3(2.6, 2.4, 2.1) * max(dot(n, L), 0.0) * schatten;
  vec3 himmelLicht = mix(vec3(0.35, 0.45, 0.6), vec3(0.03, 0.03, 0.05), uDunkel) * (0.55 + 0.45 * n.y) * ao;
  vec3 lampen = laternenLicht(p, n) * ao;
  vec3 licht = sonnenLicht + himmelLicht + lampen;
  vec3 spiegel = umgebung(r, p) * ao;
  vec3 glanzLicht = (1.0 - uDunkel) * vec3(6.0, 5.5, 4.6) * pow(max(dot(r, L), 0.0), 300.0) * schatten;

  vec3 c;
  if (art < 0.5) {
    // Lack mit Klarlack und feinem Metallic-Flitter
    float flitter = pow(rauschen(floor(p.xz * 900.0) + floor(p.y * 900.0)), 60.0);
    vec3 basis = uTon * uTon * 0.9;
    c = basis * licht + basis * flitter * (sonnenLicht + lampen) * 0.6;
    c += (spiegel + laternenGlanz(p, r, 500.0) + glanzLicht) * fres;
  } else if (art < 1.5) {
    c = vec3(0.01) * licht + (spiegel + laternenGlanz(p, r, 600.0) + glanzLicht) * mix(0.08, 1.0, fres);
  } else if (art < 2.5) {
    c = vec3(1.0, 0.03, 0.02) * (1.2 + 2.5 * uBremse + 0.8 * uDunkel) + spiegel * fres;
  } else if (art < 3.5) {
    c = vec3(0.012) * licht + spiegel * fres * 0.3;
  } else if (art < 4.5) {
    // Reifen: matter Gummi, Flanke leicht glänzend
    c = vec3(0.02) * licht + spiegel * fres * 0.15;
  } else if (art < 5.5) {
    // Felge mit zehn Speichen, die sich drehen; bei Tempo verwischen sie
    vec3 m = a.x > 0.0 ? RAD_V : RAD_H;
    vec2 rp = a.xy - m.xy;
    float rr = length(rp);
    float drehen = uWeg / m.y;
    float w = atan(rp.y, rp.x);
    float wischen = 0.75 * smoothstep(40.0, 170.0, uTempo / m.y);
    float speiche = mix(smoothstep(0.15, 0.45, cos((w + drehen * (p.z > 0.0 ? 1.0 : 1.0)) * 10.0)), 0.55, wischen);
    speiche = max(speiche, step(rr, 0.065));
    bool sattel = rr > 0.13 && rr < 0.235 && w > 0.3 && w < 1.3;
    vec3 loch = sattel ? vec3(0.9, 0.62, 0.02) * 0.6 * licht : vec3(0.03) * licht;
    vec3 metall = vec3(0.07) * licht + (spiegel + glanzLicht + laternenGlanz(p, r, 200.0)) * 0.35;
    if (rr < 0.04) metall = vec3(0.6, 0.02, 0.02) * licht + spiegel * 0.3;
    c = mix(loch, metall, speiche);
  } else if (art < 7.5) {
    // Carbon: Köpergewebe unter Klarlack
    float u = (a.x + a.z) * 60.0, k = (a.x - a.z + a.y) * 60.0;
    float gewebe = step(0.5, fract(floor(u) * 0.5 + floor(k) * 0.25 + 0.25));
    c = vec3(0.02 + 0.02 * gewebe) * licht + (spiegel + glanzLicht + laternenGlanz(p, r, 400.0)) * fres;
  } else if (art < 8.5) {
    // Scheinwerfer: Glas mit den vier Tagfahrlicht-Punkten
    vec2 s = vec2(a.y - 0.69, a.z - 0.68);
    float punkte = 0.0;
    for (int i = 0; i < 4; i++) {
      float w = float(i) * 1.5708 + 0.785;
      punkte += smoothstep(0.014, 0.007, length(s - 0.062 * vec2(cos(w), sin(w))));
    }
    float ring = smoothstep(0.012, 0.0, abs(length(s) - 0.085));
    // innen silberner Reflektor, wie beim 992
    vec3 reflektor = vec3(0.45, 0.47, 0.5) * licht + spiegel * 0.5;
    c = reflektor + spiegel * fres + vec3(4.0, 4.2, 4.6) * (punkte + ring * 0.5) * (0.5 + 0.5 * uDunkel);
  } else {
    c = vec3(0.15) * licht + spiegel * 0.6;
  }
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y - vec2(uRahmen.x, 0.0);
  float A = uRahmen.w;
  // Kamera begleitet das Auto, kreist langsam; bei Tempo leichtes Wackeln
  float az = 0.75 + 0.35 * sin(uZeit * 0.045) + uNeigung.x * 0.8;
  float el = 0.12 + 0.05 * sin(uZeit * 0.07) - uNeigung.y * 0.08;
  float abstand = 7.4 * max(1.0, 1.5 / A);
  vec3 ziel = vec3(-0.1, 0.62, 0.0);
  vec3 ro = ziel + abstand * vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  float wackeln = smoothstep(10.0, 60.0, uTempo) * 0.012;
  ro += wackeln * vec3(sin(uZeit * 23.0), sin(uZeit * 31.0 + 1.0), sin(uZeit * 17.0 + 2.0));
  vec3 vor = normalize(ziel - ro);
  vec3 rechts = normalize(cross(vor, vec3(0.0, 1.0, 0.0)));
  vec3 hoch = cross(rechts, vor);
  vec3 rd = normalize(vor * 1.9 + uv.x * rechts + uv.y * hoch);

  vec3 c;
  bool treffer = false;
  float t = 0.0;
  vec2 k = kasten(ro, rd);
  if (k.y > k.x) {
    t = k.x;
    for (int i = 0; i < 120; i++) {
      float d = auto_(ro + rd * t);
      if (d < 0.0004 * t) { treffer = true; break; }
      t += d * 0.8;
      if (t > k.y) break;
    }
  }
  vec3 mastFarbe;
  float tm = masten(ro, rd, mastFarbe);
  float tb = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  if (treffer && t < tm) c = auto_farbe(ro, rd, t);
  else if (tm < tb) c = mix(mastFarbe, umgebung(vec3(rd.x, 0.02, rd.z), ro), smoothstep(30.0, 140.0, tm));
  else if (rd.y < 0.0) c = strasse(ro, rd, tb, gl_FragCoord.xy);
  else c = umgebung(rd, ro);

  c = aces(c * mix(1.0, 1.4, uDunkel));
  c = pow(c, vec3(1.0 / 2.2));
  vec2 q = gl_FragCoord.xy / uRes - 0.5;
  c *= 1.0 - 0.35 * dot(q, q);
  c += (rauschen(gl_FragCoord.xy + fract(uZeit) * 97.0) - 0.5) * 0.012;
  gl_FragColor = vec4(c, 1.0);
}
`;
