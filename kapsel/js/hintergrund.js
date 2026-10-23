// Bewegter Hintergrund in WebGL, zwei Stile:
// - metall: flüssiges Chrom, eine fließende Oberfläche, die eine Studio-
//   Umgebung spiegelt. Arbeitet Claude, wellt sie sich stärker.
// - lava: eine Lava-Lampe, weiche Blasen, die verschmelzen und sich trennen,
//   in der Farbe des Gesamtstatus.
// - ascii: ein fließendes Feld aus Terminal-Zeichen, einfarbig, blau unter
//   dem Zeiger; alle 20 bis 30 Sekunden formen die Zeichen ein Bild.
// Alle folgen der Neigung des iPhones, sind auf 60 fps begrenzt und rechnen
// auf dem Mac in voller Retina-Auflösung, die bei Bedarf sinkt.

const VERTEX = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const KOPF = `
precision highp float;
uniform vec2 uRes;
uniform float uPhase;
uniform float uPuls;
uniform float uWelle;
uniform vec2 uNeigung;
uniform vec3 uTon;
uniform float uDunkel;
uniform float uZelle;
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
`;

const METALL = KOPF + `
// Flüssiges Metall wie ein Produkt-Shot: eine Kamera schaut schräg auf eine
// Quecksilber-Fläche in einem Fotostudio. Gespiegelt werden Softboxen,
// schmale Lichtstreifen und schwarze Abschatter; gerechnet wird in HDR mit
// Filmkurve, dazu Fresnel, Kontaktschatten in Mulden, ein Hauch chromatischer
// Aberration, Vignette und Korn.

// Große, langsame Wogen; feine Details nur schwach, damit es flüssig bleibt.
float hoehe(vec2 p, float t) {
  vec2 w = vec2(gradRauschen(p * 0.45 + vec2(0.0, t * 0.11)), gradRauschen(p * 0.45 + vec2(5.2, -t * 0.09)));
  vec2 q = p + 1.6 * w;
  float h = 0.62 * gradRauschen(q * 0.7 + t * 0.05);
  h += 0.24 * gradRauschen(q * 1.45 - t * 0.08);
  h += (0.07 + 0.08 * uWelle) * gradRauschen(q * 3.1 + t * (0.15 + 0.3 * uWelle));
  h += 0.025 * uWelle * gradRauschen(q * 6.3 - t * 0.6);
  float d = length(p - vec2(0.0, 2.2));
  h += 0.05 * uPuls * sin(d * 7.0 - t * 5.0) * exp(-d * 0.35);
  return h;
}

float kasten(vec2 a, vec2 mitte, vec2 groesse, float weich) {
  vec2 d = abs(a - mitte) - groesse;
  return 1.0 - smoothstep(-weich, weich, max(d.x, d.y));
}

// HDR-Studio in Kugelkoordinaten (Azimut, Elevation).
vec3 studio(vec3 r, float weich) {
  float az = atan(r.x, -r.z);
  float el = asin(clamp(r.y, -1.0, 1.0));
  vec2 a = vec2(az, el);
  float hellGrund = mix(0.62, 0.012, uDunkel);
  vec3 c = vec3(hellGrund) * mix(0.55, 1.0, smoothstep(-0.1, 1.3, el));
  c *= vec3(0.97, 0.985, 1.0);
  // Schwarze Abschatter geben dem Chrom seine Kanten.
  float flagge = kasten(a, vec2(0.25, 0.3), vec2(1.6, 0.07), 0.02 + weich);
  flagge = max(flagge, kasten(a, vec2(-1.25, 0.7), vec2(0.12, 0.45), 0.03 + weich));
  c *= 1.0 - 0.95 * flagge;
  // Hauptlicht: große Softbox links oben, kühl.
  // Im Dunkeln kleiner und schärfer: wenig Licht, klare Kanten.
  c += vec3(7.0, 7.3, 7.8) * kasten(a, vec2(-0.55, 0.62), mix(vec2(0.38, 0.22), vec2(0.2, 0.1), uDunkel), mix(0.05, 0.025, uDunkel) + weich);
  // Streiflicht: schmal und lang rechts, leicht warm.
  c += vec3(6.0, 5.6, 5.0) * kasten(a, vec2(0.95, 0.5), vec2(0.035, 0.42), 0.012 + weich);
  // Zweiter Streifen in der Statusfarbe.
  // Zweiter Streifen in der Statusfarbe; leuchtet nicht ins Weiche aus.
  c += (uTon * 3.2 + 0.4) * kasten(a, vec2(0.45, 0.95), vec2(0.6, 0.025), 0.01) * step(weich, 0.0);
  // Deckenlicht.
  c += vec3(1.6) * smoothstep(1.15 - weich, 1.3 + weich, el);
  // Gegenlicht hinter der Kamera für Glanz an steilen Flanken.
  c += vec3(2.2, 2.3, 2.5) * kasten(vec2(abs(az), el), vec2(3.0, 0.25), vec2(0.35, 0.12), 0.08 + weich);
  return c;
}

vec3 filmkurve(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

mat2 dreh(float w) { float c = cos(w), s = sin(w); return mat2(c, -s, s, c); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uPhase;

  // Kamera 1,6 über der Fläche, um 0,62 rad nach unten geneigt.
  vec3 ro = vec3(uNeigung.x * 0.25, 1.6, 0.0);
  vec3 rd = normalize(vec3(uv, -1.75));
  rd.yz *= dreh(-0.62 - uNeigung.y * 0.06);
  float abstand = -ro.y / min(rd.y, -0.05);
  vec2 p = ro.xz + rd.xz * abstand;
  p.y += t * 0.18;

  // Normale aus der Höhe; mit dem Abstand flacher, wie unscharf in der Tiefe.
  float amp = 0.55 * exp(-abstand * 0.06);
  float e = 0.012 + abstand * 0.0025;
  float h0 = hoehe(p, t);
  float hx1 = hoehe(p + vec2(e, 0.0), t);
  float hx2 = hoehe(p - vec2(e, 0.0), t);
  float hz1 = hoehe(p + vec2(0.0, e), t);
  float hz2 = hoehe(p - vec2(0.0, e), t);
  vec3 n = normalize(vec3(-(hx1 - hx2) / (2.0 * e) * amp, 1.0, -(hz1 - hz2) / (2.0 * e) * amp));
  float mulde = (hx1 + hx2 + hz1 + hz2 - 4.0 * h0) / (e * e);

  vec3 r = reflect(rd, n);
  r.xz *= dreh(uNeigung.x * 0.45);
  float fres = 0.9 + 0.1 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);

  // Leichte chromatische Aberration zum Bildrand hin.
  vec3 ca = vec3(uv * 0.006, 0.0);
  vec3 farbe;
  farbe.r = studio(normalize(r + ca), 0.0).r;
  farbe.g = studio(r, 0.0).g;
  farbe.b = studio(normalize(r - ca), 0.0).b;
  farbe += studio(r, 0.35) * mix(0.08, 0.035, uDunkel);
  farbe *= fres * vec3(0.96, 0.97, 1.0);

  // Kontaktschatten in Mulden, Dunst in der Tiefe.
  farbe *= clamp(1.0 - max(mulde, 0.0) * 0.012, 0.55, 1.0);
  vec3 dunst = vec3(mix(0.72, 0.02, uDunkel));
  farbe = mix(farbe, dunst, smoothstep(4.0, 14.0, abstand) * 0.55);

  farbe = filmkurve(farbe * mix(0.85, 1.1, uDunkel));
  farbe = pow(farbe, vec3(1.0 / 2.2));
  float vignette = 1.0 - 0.28 * dot(uv * vec2(0.8, 1.0), uv * vec2(0.8, 1.0)) * 2.0;
  farbe *= mix(1.0, vignette, 0.8);
  farbe += (rauschen(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) * 0.018;
  gl_FragColor = vec4(farbe, 1.0);
}
`;

const LAVA = KOPF + `
float feld(vec2 p, float t) {
  float k = uRes.x / uRes.y;
  float f = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(fi * 1.7 + t * 0.21 * (1.0 + fi * 0.13)) * 0.8 * k,
                  sin(t * (0.16 + fi * 0.035) + fi * 2.1) * 0.95);
    c += uNeigung * (0.05 + 0.035 * fi);
    float r = 0.13 + 0.05 * sin(fi * 3.3) + 0.025 * uPuls;
    vec2 d = p - c;
    f += r * r / max(dot(d, d), 1e-4);
  }
  return f;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 p = uv * 2.0;
  float f = feld(p, uPhase);

  // Weicher Rand, im Inneren heller wie eine beleuchtete Lampe.
  float innen = smoothstep(0.94, 1.06, f);
  float tiefe = smoothstep(1.0, 2.6, f);
  float schein = smoothstep(0.35, 1.0, f) * (1.0 - innen);
  vec3 zweit = vec3(0.98, 0.36, 0.62);
  vec3 ton = mix(uTon, zweit, 0.35 * smoothstep(-1.0, 1.0, p.y));

  vec3 grund = mix(vec3(1.0), vec3(0.0), uDunkel);
  vec3 blaseHell = mix(mix(ton, vec3(1.0), 0.15), mix(ton, vec3(1.0), 0.6), tiefe);
  vec3 blaseDunkel = mix(ton * 0.55, ton * 1.05 + 0.12, tiefe);
  vec3 blase = mix(blaseHell, blaseDunkel, uDunkel);
  vec3 farbe = mix(grund, ton, schein * mix(0.18, 0.35, uDunkel));
  farbe = mix(farbe, blase, innen);
  farbe += (rauschen(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(farbe, 1.0);
}
`;

const ASCII = KOPF + `
// Ein fließendes Feld, gezeichnet als Terminal-Zeichen. Jede Zelle fragt das
// Feld einmal in ihrer Mitte ab und wählt nach Helligkeit ein Zeichen aus
// " .:*o&8@#" (5x5-Bitmuster, als Zahl kodiert). Alles bleibt einfarbig;
// nur rund um den Mauszeiger (oder Finger) färben sich die Zeichen blau.
// Alle 20 bis 30 Sekunden formen die Zeichen nacheinander ein Hanfblatt,
// einen Pimmel und einen brennenden Joint mit Rauch.

uniform vec3 uZeiger;  // x, y in Canvas-Pixeln, Stärke 0 … 1
uniform vec2 uForm;    // welche Form (0, 1, 2), Stärke 0 … 1
uniform float uZeit;   // Sekunden, unabhängig vom Status-Tempo

float zeichen(float n, vec2 p) {
  p = floor(p * vec2(4.0, -4.0) + 2.5);
  if (clamp(p.x, 0.0, 4.0) == p.x && clamp(p.y, 0.0, 4.0) == p.y) {
    if (int(mod(n / exp2(p.x + 5.0 * p.y), 2.0)) == 1) return 1.0;
  }
  return 0.0;
}

mat2 drehung(float w) { float c = cos(w), s = sin(w); return mat2(c, -s, s, c); }

float strecke(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - mix(ra, rb, h);
}

float ellipse(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }

// Hanfblatt: sieben spitze, gezackte Fiederblätter an einem Stiel.
float hanfblatt(vec2 p) {
  vec2 basis = vec2(0.0, -0.22);
  float d = strecke(p, basis, vec2(0.0, -0.5), 0.013, 0.01);
  for (int i = 0; i < 7; i++) {
    float fi = float(i) - 3.0;
    float a = abs(fi);
    // Fächer: mittleres Blatt am längsten, die äußeren zeigen schräg nach unten.
    float winkel = sign(fi) * (a < 0.5 ? 0.0 : a < 1.5 ? 0.45 : a < 2.5 ? 0.98 : 1.65);
    float laenge = a < 0.5 ? 0.72 : a < 1.5 ? 0.62 : a < 2.5 ? 0.46 : 0.26;
    vec2 q = drehung(winkel) * (p - basis);
    float t = clamp(q.y / laenge, 0.0, 1.0);
    float breite = laenge * 0.085 * pow(sin(3.1416 * t), 0.7) * (1.0 + 0.3 * sin(t * 58.0));
    float blatt = max(abs(q.x) - breite, max(-q.y, q.y - laenge));
    d = min(d, blatt);
  }
  return d;
}

float pimmel(vec2 p) {
  float schaft = strecke(p, vec2(0.0, -0.22), vec2(0.0, 0.18), 0.078, 0.07);
  float kopf = ellipse(p - vec2(0.0, 0.25), vec2(0.108, 0.088));
  float eier = min(length(p - vec2(-0.088, -0.31)) - 0.09, length(p - vec2(0.088, -0.31)) - 0.09);
  return min(min(schaft, kopf), eier);
}

// Joint, schräg, Mundstück links, Glut rechts.
const vec2 GLUT = vec2(0.3, 0.06);
float joint(vec2 p) {
  return strecke(p, vec2(-0.34, -0.12), GLUT, 0.024, 0.042);
}

float rauch(vec2 p) {
  vec2 s = p - GLUT - vec2(0.0, 0.04);
  if (s.y < 0.0) return 0.0;
  float welle = sin(s.y * 11.0 - uZeit * 2.2) * 0.05 * s.y + 0.06 * gradRauschen(vec2(s.y * 4.0 - uZeit * 0.6, 1.3)) * s.y * 3.0;
  float breite = 0.03 + s.y * 0.2;
  float x = (s.x - welle) / breite;
  float dichte = exp(-x * x) * (1.0 - smoothstep(0.1, 0.9, s.y));
  return dichte * (0.75 + 0.5 * gradRauschen(p * 9.0 + vec2(0.0, -uZeit * 1.5)));
}

float feld(vec2 p, float t) {
  vec2 w = vec2(gradRauschen(p * 0.8 + vec2(0.0, t * 0.2)), gradRauschen(p * 0.8 + vec2(4.1, -t * 0.17)));
  vec2 q = p + 1.4 * w;
  float v = 0.42 + 0.6 * gradRauschen(q * 1.1 + t * 0.08);
  v += (0.15 + 0.2 * uWelle) * gradRauschen(q * 2.6 - t * (0.15 + 0.35 * uWelle));
  float d = length(p);
  v += 0.3 * uPuls * sin(d * 9.0 - t * 6.0) * exp(-d * 1.2);
  return v;
}

void main() {
  vec2 zelle = floor(gl_FragCoord.xy / uZelle);
  vec2 mitte = (zelle + 0.5) * uZelle;
  vec2 uv = (mitte - 0.5 * uRes) / uRes.y;
  float t = uPhase;

  // Feld als Höhe lesen und beleuchten, damit es plastisch wirkt.
  vec2 fp = uv * 2.6 + uNeigung * 0.25;
  float v = feld(fp, t);
  float e = 0.04;
  vec3 normale = normalize(vec3(v - feld(fp + vec2(e, 0.0), t), v - feld(fp + vec2(0.0, e), t), e * 0.6));
  vec3 licht = normalize(vec3(-0.5 + uNeigung.x * 0.4, 0.6 - uNeigung.y * 0.3, 0.6));
  float diffus = max(dot(normale, licht), 0.0);
  float glanz = pow(max(dot(reflect(-licht, normale), vec3(0.0, 0.0, 1.0)), 0.0), 12.0);
  float g = smoothstep(0.15, 0.85, v) * 0.45 + diffus * 0.55 + glanz * 0.35;
  float zeile = fract(-uv.y * 0.35 - t * 0.12);
  g += 0.35 * smoothstep(0.96, 1.0, zeile);

  // Form: passt hochkant aufs iPhone und füllt am Mac gut zwei Drittel der Höhe.
  if (uForm.y > 0.001) {
    float k = 0.72 * min(1.0, uRes.x / uRes.y * 1.3);
    vec2 sp = uv / k;
    float d = uForm.x < 0.5 ? hanfblatt(sp) : uForm.x < 1.5 ? pimmel(sp) : joint(sp);
    float innen = smoothstep(0.006, -0.006, d);
    float kante = smoothstep(0.02, 0.0, abs(d));
    float form = innen * (0.66 + 0.22 * gradRauschen(sp * 9.0 + uZeit * 0.4)) + kante * 0.3;
    if (uForm.x > 1.5) {
      // Glut: die dichtesten Zeichen, flackernd; darüber steigt Rauch auf.
      float glut = 1.0 - smoothstep(0.03, 0.065, length(sp - GLUT));
      form = max(form, glut * (0.93 + 0.07 * sin(uZeit * 13.0)));
      form = max(form, min(rauch(sp), 1.0) * 0.82);
    }
    g = mix(g, max(g * 0.3, form), uForm.y);
  }

  // Rund um den Zeiger: dichter und blau.
  float abstand = length(mitte - uZeiger.xy) / uZelle;
  float zeiger = uZeiger.z * smoothstep(10.0, 2.0, abstand);
  g += 0.25 * zeiger;
  g = clamp(g, 0.0, 1.0);

  float n = 0.0;
  if (g > 0.18) n = 4096.0;      // .
  if (g > 0.3) n = 65600.0;      // :
  if (g > 0.42) n = 332772.0;    // *
  if (g > 0.52) n = 15255086.0;  // o
  if (g > 0.62) n = 23385164.0;  // &
  if (g > 0.72) n = 15252014.0;  // 8
  if (g > 0.82) n = 13199452.0;  // @
  if (g > 0.9) n = 11512810.0;   // #

  vec2 lokal = (gl_FragCoord.xy - zelle * uZelle) / uZelle;
  float an = zeichen(n, lokal * 2.0 - 1.0);

  vec3 grund = mix(vec3(1.0), vec3(0.0), uDunkel);
  vec3 tinte = mix(vec3(0.26), vec3(0.64), uDunkel);
  vec3 blau = mix(vec3(0.11, 0.36, 0.96), vec3(0.36, 0.55, 1.0), uDunkel);
  tinte = mix(tinte, blau, zeiger);
  float deckung = mix(0.6, 0.82, uDunkel) * (0.45 + 0.55 * g);
  vec3 farbe = mix(grund, tinte, an * deckung);
  gl_FragColor = vec4(farbe, 1.0);
}
`;

export const STILE = { metall: METALL, lava: LAVA, ascii: ASCII };

// Ton (RGB), Tempo, Welle und Puls je Gesamtstatus.
const STIMMUNG = {
  arbeitet: { ton: [0.12, 0.42, 1.0], tempo: 1.0, welle: 1, puls: 0 },
  frage: { ton: [1.0, 0.58, 0.05], tempo: 0.55, welle: 0.4, puls: 1 },
  pr: { ton: [0.15, 0.75, 0.35], tempo: 0.4, welle: 0.2, puls: 0 },
  ruhig: { ton: [0.55, 0.45, 0.95], tempo: 0.25, welle: 0, puls: 0 },
};

const UNIFORMS = ['uRes', 'uPhase', 'uPuls', 'uWelle', 'uNeigung', 'uTon', 'uDunkel', 'uZelle', 'uZeiger', 'uForm', 'uZeit'];

export class Hintergrund {
  constructor(canvas) {
    this.canvas = canvas;
    this.an = false;
    this.stil = 'metall';
    // Mit Maus oder Trackpad (Mac) bis zur vollen Retina-Auflösung, auf dem
    // Handy höchstens die CSS-Auflösung; die Anpassung senkt das bei Bedarf.
    this.maxSkala = matchMedia('(pointer: fine)').matches ? Math.min(devicePixelRatio || 1, 2) : 1;
    this.skala = this.maxSkala;
    this.status = 'ruhig';
    this.ton = [...STIMMUNG.ruhig.ton];
    this.tempo = STIMMUNG.ruhig.tempo;
    this.welle = 0;
    this.pulsStaerke = 0;
    this.phase = Math.random() * 50;
    this.neigung = [0, 0];
    this.neigungZiel = [0, 0];
    // Zeiger (CSS-Pixel) und wann er sich zuletzt bewegt hat.
    this.zeiger = [0, 0];
    this.zeigerZuletzt = -10;
    this.zeigerStaerke = 0;
    // ASCII-Formen: alle 20 bis 30 Sekunden die nächste, die erste nach 6 s.
    this.formIndex = -1;
    this.formStart = 0;
    this.formNaechste = 6;
    this.zeit = 0;
    this.letztes = 0;
    this.mittel = 16.7;
    this.guteFrames = 0;
    this.dunkel = matchMedia('(prefers-color-scheme: dark)');
    this.ruhe = matchMedia('(prefers-reduced-motion: reduce)');
    this.schleife = this.schleife.bind(this);
    this.groesse = this.groesse.bind(this);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.gl = null;
    });
    canvas.addEventListener('webglcontextrestored', () => this.einrichten());
  }

  einrichten() {
    const gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
    if (!gl) return false;
    const puffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, puffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.gl = gl;
    this.programme = {};
    this.programmWaehlen();
    this.groesse();
    return true;
  }

  programmBauen(quelle) {
    const gl = this.gl;
    const shader = (art, text) => {
      const s = gl.createShader(art);
      gl.shaderSource(s, text);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, quelle));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    const u = {};
    for (const name of UNIFORMS) u[name] = gl.getUniformLocation(prog, name);
    return { prog, u, ort: gl.getAttribLocation(prog, 'p') };
  }

  // Shader werden beim ersten Gebrauch gebaut und dann behalten.
  programmWaehlen() {
    const gl = this.gl;
    if (!gl) return;
    this.programme[this.stil] ??= this.programmBauen(STILE[this.stil]);
    const { prog, u, ort } = this.programme[this.stil];
    gl.useProgram(prog);
    gl.enableVertexAttribArray(ort);
    gl.vertexAttribPointer(ort, 2, gl.FLOAT, false, 0, 0);
    this.u = u;
  }

  setzeStil(stil) {
    if (!STILE[stil] || stil === this.stil) return;
    this.stil = stil;
    try {
      this.programmWaehlen();
    } catch (fehler) {
      console.warn('Hintergrund: Stil nicht verfügbar', fehler);
    }
  }

  starten() {
    if (this.an) return true;
    try {
      if (!this.gl && !this.einrichten()) return false;
    } catch (fehler) {
      console.warn('Hintergrund: WebGL nicht verfügbar', fehler);
      return false;
    }
    this.an = true;
    this.canvas.hidden = false;
    document.documentElement.classList.add('mit-glas');
    addEventListener('resize', this.groesse);
    this.letztes = performance.now();
    requestAnimationFrame(this.schleife);
    return true;
  }

  stoppen() {
    this.an = false;
    this.canvas.hidden = true;
    document.documentElement.classList.remove('mit-glas');
    removeEventListener('resize', this.groesse);
  }

  setzeStatus(status) {
    this.status = STIMMUNG[status] ? status : 'ruhig';
  }

  // Position in CSS-Pixeln; die Zeichen dort färben sich blau.
  setzeZeiger(x, y) {
    this.zeiger = [x, y];
    this.zeigerZuletzt = this.zeit;
  }

  // Stärke der aktuellen Form: 3 s aufbauen, 7 s halten, 3 s auflösen.
  formStaerke() {
    if (this.zeit >= this.formNaechste) {
      this.formIndex = (this.formIndex + 1) % 3;
      this.formStart = this.zeit;
      this.formNaechste = this.zeit + 20 + Math.random() * 10;
    }
    if (this.formIndex < 0) return 0;
    const lokal = this.zeit - this.formStart;
    const weich = (x) => x * x * (3 - 2 * x);
    if (lokal < 3) return weich(lokal / 3);
    if (lokal < 10) return 1;
    if (lokal < 13) return 1 - weich((lokal - 10) / 3);
    return 0;
  }

  // x, y jeweils -1 … 1
  setzeNeigung(x, y) {
    this.neigungZiel = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
  }

  groesse() {
    const w = Math.max(1, Math.round(innerWidth * this.skala));
    const h = Math.max(1, Math.round(innerHeight * this.skala));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl?.viewport(0, 0, w, h);
  }

  // Auflösung an die Leistung anpassen: zu langsam -> kleiner, lange flüssig -> größer.
  anpassen(dt) {
    this.mittel = this.mittel * 0.95 + dt * 0.05;
    if (this.mittel > 19.5 && this.skala > 0.3) {
      this.skala = Math.max(0.3, this.skala * 0.85);
      this.mittel = 16.7;
      this.guteFrames = 0;
      this.groesse();
    } else if (this.mittel < 17.2 && this.skala < this.maxSkala && ++this.guteFrames > 240) {
      this.skala = Math.min(this.maxSkala, this.skala * 1.1);
      this.guteFrames = 0;
      this.groesse();
    }
  }

  schleife(jetzt) {
    if (!this.an) return;
    requestAnimationFrame(this.schleife);
    const dt = jetzt - this.letztes;
    if (dt < 1000 / 60 - 2) return; // auf 60 fps begrenzen
    this.letztes = jetzt;
    if (document.hidden || !this.gl) return;
    if (dt < 100) this.anpassen(dt);
    const s = Math.min(dt, 50) / 1000;
    const ziel = STIMMUNG[this.status];
    const weich = 1 - Math.exp(-s * 2.5);
    for (let i = 0; i < 3; i++) this.ton[i] += (ziel.ton[i] - this.ton[i]) * weich;
    this.tempo += (ziel.tempo * (this.ruhe.matches ? 0.3 : 1) - this.tempo) * weich;
    this.welle += (ziel.welle - this.welle) * weich;
    this.pulsStaerke += (ziel.puls - this.pulsStaerke) * weich;
    this.phase += s * this.tempo;
    this.zeit += s;
    const n = 1 - Math.exp(-s * 6);
    this.neigung[0] += (this.neigungZiel[0] - this.neigung[0]) * n;
    this.neigung[1] += (this.neigungZiel[1] - this.neigung[1]) * n;

    const { gl, u } = this;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uPhase, this.phase);
    gl.uniform1f(u.uPuls, this.pulsStaerke * (0.5 + 0.5 * Math.sin(this.zeit * 3.2)));
    gl.uniform1f(u.uWelle, this.welle);
    gl.uniform2f(u.uNeigung, this.neigung[0], this.neigung[1]);
    gl.uniform3f(u.uTon, this.ton[0], this.ton[1], this.ton[2]);
    gl.uniform1f(u.uDunkel, this.dunkel.matches ? 1 : 0);
    // ASCII-Zellen etwa 9 CSS-Pixel groß, egal wie fein gerechnet wird.
    gl.uniform1f(u.uZelle, Math.max(4, Math.round(9 * this.skala)));
    const zeigerZiel = this.zeit - this.zeigerZuletzt < 1.2 ? 1 : 0;
    this.zeigerStaerke += (zeigerZiel - this.zeigerStaerke) * (1 - Math.exp(-s * (zeigerZiel ? 12 : 2.5)));
    gl.uniform3f(u.uZeiger, this.zeiger[0] * this.skala, (innerHeight - this.zeiger[1]) * this.skala, this.zeigerStaerke);
    gl.uniform2f(u.uForm, Math.max(this.formIndex, 0), this.formStaerke());
    gl.uniform1f(u.uZeit, this.zeit);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
