// Bewegter Hintergrund in WebGL, zwei Stile:
// - metall: flüssiges Chrom, eine fließende Oberfläche, die eine Studio-
//   Umgebung spiegelt. Arbeitet Claude, wellt sie sich stärker.
// - lava: eine Lava-Lampe, weiche Blasen, die verschmelzen und sich trennen,
//   in der Farbe des Gesamtstatus.
// - ascii: ein brennender Joint als 3D-Modell in Terminal-Zeichen, mit Glut
//   und aufsteigendem Rauch; die Kamera schwenkt um ihn (siehe ascii-joint.js).
// - kueste: ein Porsche 911 in Navy fährt eine Klippenstraße an der Küste
//   entlang, gefilmt von schräg oben mit Blick hinunter aufs Meer (three.js,
//   siehe kueste.js). Er läuft
//   auf einer eigenen WebGL-2-Fläche und wird erst bei Bedarf geladen.
// Alle folgen der Neigung des iPhones, sind auf 60 fps begrenzt und rechnen
// auf dem Mac in voller Retina-Auflösung, die bei Bedarf sinkt.

import { ASCII_JOINT, ASCII_ZEICHEN, atlasZeichnen } from './ascii-joint.js';

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

// Die Küste ist kein einzelner Shader, sondern eine three.js-Szene.
export const STILE = { metall: METALL, lava: LAVA, ascii: ASCII_JOINT, kueste: null };

// Ton (RGB), Tempo, Welle und Puls je Gesamtstatus.
const STIMMUNG = {
  arbeitet: { ton: [0.12, 0.42, 1.0], tempo: 1.0, welle: 1, puls: 0 },
  frage: { ton: [1.0, 0.58, 0.05], tempo: 0.55, welle: 0.4, puls: 1 },
  pr: { ton: [0.15, 0.75, 0.35], tempo: 0.4, welle: 0.2, puls: 0 },
  ruhig: { ton: [0.55, 0.45, 0.95], tempo: 0.25, welle: 0, puls: 0 },
};

const UNIFORMS = ['uRes', 'uPhase', 'uPuls', 'uWelle', 'uNeigung', 'uTon', 'uDunkel', 'uZelle', 'uZeiger', 'uZeit',
  'uRahmen', 'uGitter', 'uGlyphen', 'uZellen', 'uAtlas'];

// Zeichenzelle in CSS-Pixeln, schmal und hoch wie im Terminal; auf dem
// Handy etwas feiner, damit der Joint genug Zeichen bekommt.
const ZELLE = matchMedia('(pointer: fine)').matches ? [5, 8] : [4, 7];

// Ab dieser Breite steht die App als Spalte links (siehe app.css, --spalte);
// der ASCII-Joint steht dann in der freien Fläche rechts daneben.
const BREIT_AB = 900;
const SPALTE_RECHTS = 32 + 460 + 24;

export class Hintergrund {
  constructor(canvas) {
    this.canvas = canvas;
    this.an = false;
    this.stil = 'metall';
    // Mit Maus oder Trackpad (Mac) bis zur vollen Retina-Auflösung, auf dem
    // Handy höchstens die CSS-Auflösung; die Anpassung senkt das bei Bedarf.
    // Die Küste ist echtes 3D mit feinen Kanten; dort darf es auch auf dem
    // Handy etwas mehr sein.
    const fein = matchMedia('(pointer: fine)').matches;
    this.maxSkalaFlach = fein ? Math.min(devicePixelRatio || 1, 2) : 1;
    this.maxSkala3d = Math.min(devicePixelRatio || 1, fein ? 2 : 1.5);
    this.skala = this.maxSkalaFlach;
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
    this.zeit = 0;
    // Die Kamera beginnt an einer zufälligen Stelle der Runde.
    this.asciiZeit = Math.random() * 100;
    this.zelle = ZELLE;
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
    this.kueste = null;
    this.kuesteFlaeche = null;
  }

  get maxSkala() {
    return this.stil === 'kueste' ? this.maxSkala3d : this.maxSkalaFlach;
  }

  // Eigene Fläche mit WebGL 2 für die Küste; three.js und das Modell kommen
  // erst jetzt. Gibt false zurück, wenn das Gerät kein WebGL 2 kann.
  kuesteEinrichten() {
    if (this.kuesteFlaeche) return true;
    const flaeche = document.createElement('canvas');
    flaeche.id = 'glas3d';
    flaeche.hidden = true;
    flaeche.setAttribute('aria-hidden', 'true');
    const kontext = flaeche.getContext('webgl2', { antialias: true, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance' });
    if (!kontext) return false;
    this.canvas.after(flaeche);
    this.kuesteFlaeche = flaeche;
    import('./kueste.js')
      .then(({ Kueste }) => {
        this.kueste = new Kueste(flaeche, kontext);
        this.groesse();
      })
      .catch((fehler) => console.warn('Hintergrund: Küste nicht verfügbar', fehler));
    return true;
  }

  flaecheZeigen() {
    const k = this.an && this.stil === 'kueste';
    this.canvas.hidden = !this.an || k;
    if (this.kuesteFlaeche) this.kuesteFlaeche.hidden = !k;
  }

  einrichten() {
    const gl = this.canvas.getContext('webgl', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
    if (!gl) return false;
    const puffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, puffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.gl = gl;
    this.programme = {};
    this.ascii = null;
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
    if (!gl || this.stil === 'kueste') return;
    if (this.stil === 'ascii') {
      this.programme.ascii ??= { joint: this.programmBauen(ASCII_JOINT), zeichen: this.programmBauen(ASCII_ZEICHEN) };
      return;
    }
    this.programme[this.stil] ??= this.programmBauen(STILE[this.stil]);
    const { prog, u, ort } = this.programme[this.stil];
    gl.useProgram(prog);
    gl.enableVertexAttribArray(ort);
    gl.vertexAttribPointer(ort, 2, gl.FLOAT, false, 0, 0);
    this.u = u;
  }

  setzeStil(stil) {
    if (!(stil in STILE) || stil === this.stil) return;
    const vorher = this.stil;
    this.stil = stil;
    try {
      if (stil === 'kueste') {
        if (this.an && !this.kuesteEinrichten()) throw new Error('kein WebGL 2');
      } else if (this.an && !this.gl) {
        if (!this.einrichten()) throw new Error('kein WebGL');
      } else this.programmWaehlen();
    } catch (fehler) {
      console.warn('Hintergrund: Stil nicht verfügbar', fehler);
      this.stil = vorher;
    }
    this.skala = Math.min(this.skala, this.maxSkala);
    this.flaecheZeigen();
    if (this.an) this.groesse();
  }

  starten() {
    if (this.an) return true;
    try {
      if (this.stil === 'kueste' ? !this.kuesteEinrichten() : !this.gl && !this.einrichten()) return false;
    } catch (fehler) {
      console.warn('Hintergrund: WebGL nicht verfügbar', fehler);
      return false;
    }
    this.an = true;
    this.flaecheZeigen();
    this.groesse();
    document.documentElement.classList.add('mit-glas');
    addEventListener('resize', this.groesse);
    this.letztes = performance.now();
    requestAnimationFrame(this.schleife);
    return true;
  }

  stoppen() {
    this.an = false;
    this.flaecheZeigen();
    document.documentElement.classList.remove('mit-glas');
    removeEventListener('resize', this.groesse);
  }

  setzeStatus(status) {
    this.status = STIMMUNG[status] ? status : 'ruhig';
  }

  // Position in CSS-Pixeln; dort zeigt der ASCII-Stil ein Zeichenfeld.
  setzeZeiger(x, y) {
    this.zeiger = [x, y];
    this.zeigerZuletzt = this.zeit;
  }

  // x, y jeweils -1 … 1
  setzeNeigung(x, y) {
    this.neigungZiel = [Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y))];
  }

  groesse() {
    if (this.stil === 'kueste') {
      this.kueste?.groesse(innerWidth, innerHeight, this.skala);
      return;
    }
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
    const min = this.stil === 'kueste' ? 0.6 : 0.3;
    if (this.mittel > 19.5 && this.skala > min) {
      this.skala = Math.max(min, this.skala * 0.85);
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
    if (document.hidden || (this.stil === 'kueste' ? !this.kueste : !this.gl)) return;
    // Der ASCII-Film rechnet pro Zeichenzelle; eine kleinere Auflösung spart
    // dort nichts und machte nur die Schrift unscharf.
    if (dt < 100 && this.stil !== 'ascii') this.anpassen(dt);
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

    const zeigerZiel = this.zeit - this.zeigerZuletzt < 1.2 ? 1 : 0;
    this.zeigerStaerke += (zeigerZiel - this.zeigerStaerke) * (1 - Math.exp(-s * (zeigerZiel ? 12 : 2.5)));
    if (this.stil === 'kueste') {
      this.kueste.zeichnen(s, {
        tempo: this.tempo,
        neigung: this.neigung,
        dunkel: this.dunkel.matches,
        frei: innerWidth >= BREIT_AB ? SPALTE_RECHTS : 0,
        ruhe: this.ruhe.matches,
      });
      return;
    }
    if (this.stil === 'ascii') {
      this.asciiZeit += s * (this.ruhe.matches ? 0.4 : 1);
      this.asciiZeichnen();
      return;
    }

    const { gl, u } = this;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uPhase, this.phase);
    gl.uniform1f(u.uPuls, this.pulsStaerke * (0.5 + 0.5 * Math.sin(this.zeit * 3.2)));
    gl.uniform1f(u.uWelle, this.welle);
    gl.uniform2f(u.uNeigung, this.neigung[0], this.neigung[1]);
    gl.uniform3f(u.uTon, this.ton[0], this.ton[1], this.ton[2]);
    gl.uniform1f(u.uDunkel, this.dunkel.matches ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // Zellgitter, Zellbild und Zeichen-Atlas passend zur Auflösung anlegen.
  asciiVorbereiten() {
    const { gl, canvas } = this;
    const zb = Math.max(3, Math.round(this.zelle[0] * this.skala));
    const zh = Math.max(5, Math.round(this.zelle[1] * this.skala));
    const spalten = Math.ceil(canvas.width / zb);
    const zeilen = Math.ceil(canvas.height / zh);
    const a = this.ascii;
    if (a && a.zb === zb && a.zh === zh && a.spalten === spalten && a.zeilen === zeilen) return a;
    const textur = (alt) => {
      if (alt) gl.deleteTexture(alt);
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const neu = { zb, zh, spalten, zeilen, fbo: a?.fbo ?? gl.createFramebuffer() };
    neu.zellen = textur(a?.zellen);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, spalten, zeilen, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, neu.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, neu.zellen, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (a && a.zb === zb && a.zh === zh) {
      neu.atlas = a.atlas;
      neu.glyphen = a.glyphen;
    } else {
      const { canvas: bild, anzahl } = atlasZeichnen(zb, zh);
      neu.atlas = textur(a?.atlas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bild);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      neu.glyphen = anzahl;
    }
    this.ascii = neu;
    return neu;
  }

  programmBinden({ prog, ort }) {
    const gl = this.gl;
    gl.useProgram(prog);
    gl.enableVertexAttribArray(ort);
    gl.vertexAttribPointer(ort, 2, gl.FLOAT, false, 0, 0);
  }

  asciiZeichnen() {
    const { gl, canvas } = this;
    if (this.skala !== this.maxSkala) {
      this.skala = this.maxSkala;
      this.groesse();
    }
    const a = this.asciiVorbereiten();
    const { joint, zeichen } = this.programme.ascii;
    const dunkel = this.dunkel.matches ? 1 : 0;

    // Bildfenster in der freien Fläche, eher breit; auf dem Handy höher.
    const frei = innerWidth >= BREIT_AB ? SPALTE_RECHTS : 0;
    const breite = ((innerWidth - frei) / innerHeight) * 0.96;
    const seiten = Math.min(1.9, Math.max(0.8, breite / 0.72));
    const hoehe = Math.min(0.86, breite / seiten);
    const mitteX = ((frei + innerWidth) / 2 - innerWidth / 2) / innerHeight;

    // 1. Joint in das Zellbild, ein Pixel pro Zeichen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
    gl.viewport(0, 0, a.spalten, a.zeilen);
    this.programmBinden(joint);
    let u = joint.u;
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform2f(u.uZelle, a.zb, a.zh);
    gl.uniform4f(u.uRahmen, mitteX, 0, hoehe, seiten);
    gl.uniform1f(u.uZeit, this.asciiZeit);
    gl.uniform3f(u.uTon, this.ton[0], this.ton[1], this.ton[2]);
    gl.uniform1f(u.uDunkel, dunkel);
    gl.uniform3f(u.uZeiger, this.zeiger[0] * this.skala, (innerHeight - this.zeiger[1]) * this.skala, this.zeigerStaerke);
    gl.uniform2f(u.uNeigung, this.neigung[0], this.neigung[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. Zeichen aus dem Atlas setzen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    this.programmBinden(zeichen);
    u = zeichen.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, a.zellen);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, a.atlas);
    gl.uniform1i(u.uZellen, 0);
    gl.uniform1i(u.uAtlas, 1);
    gl.uniform2f(u.uZelle, a.zb, a.zh);
    gl.uniform2f(u.uGitter, a.spalten, a.zeilen);
    gl.uniform1f(u.uGlyphen, a.glyphen);
    gl.uniform1f(u.uDunkel, dunkel);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
