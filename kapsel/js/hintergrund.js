// Bewegter Hintergrund in WebGL, zwei Stile:
// - metall: flüssiges Chrom, eine fließende Oberfläche, die eine Studio-
//   Umgebung spiegelt. Arbeitet Claude, wellt sie sich stärker.
// - lava: eine Lava-Lampe, weiche Blasen, die verschmelzen und sich trennen,
//   in der Farbe des Gesamtstatus.
// Beide folgen der Neigung des iPhones, sind auf 60 fps begrenzt und rechnen
// in reduzierter Auflösung, die bei Bedarf weiter sinkt.

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
`;

const METALL = KOPF + `
float hoehe(vec2 p, float t) {
  vec2 q = p;
  q += 0.38 * vec2(sin(p.y * 1.6 + t * 0.8), cos(p.x * 1.3 - t * 0.6));
  q += (0.12 + 0.16 * uWelle) * vec2(sin(q.y * 3.1 - t * 1.2), cos(q.x * 2.7 + t * 1.0));
  float h = sin(q.x * 2.1 + t * 0.45) * cos(q.y * 1.7 - t * 0.35);
  h += (0.3 + 0.3 * uWelle) * sin((q.x + q.y) * 3.2 + t * 0.9);
  h += 0.15 * uPuls * sin(length(p) * 9.0 - t * 4.0);
  return h;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 p = uv * 2.2 + uNeigung * 0.15;
  float t = uPhase;
  float e = 2.0 / uRes.y;
  float h = hoehe(p, t);
  float hx = hoehe(p + vec2(e, 0.0), t) - h;
  float hy = hoehe(p + vec2(0.0, e), t) - h;
  vec3 n = normalize(vec3(-hx / e * 0.22, -hy / e * 0.22, 1.0));
  vec3 blick = normalize(vec3(uv * 0.6 - uNeigung * 0.25, -1.0));
  vec3 r = reflect(blick, n);

  // Studio-Umgebung: heller Himmel oben, zwei Lichtstreifen, ein Glanzpunkt.
  float himmel = smoothstep(-0.5, 0.9, r.y);
  float streifen = smoothstep(0.6, 0.66, 0.5 + 0.5 * sin(r.x * 2.6 + r.y * 4.2));
  float streifen2 = smoothstep(0.75, 0.8, 0.5 + 0.5 * sin(r.x * -1.7 + r.y * 2.3 + 1.3));
  float glanz = pow(max(dot(r, normalize(vec3(-0.4, 0.7, -0.6))), 0.0), 24.0);
  float hell = 0.18 + 0.55 * himmel + 0.25 * streifen + 0.15 * streifen2 + 0.9 * glanz;
  hell *= mix(0.4, 1.0, pow(n.z, 2.0));
  hell = clamp(hell, 0.0, 1.2);

  vec3 hellbereich = mix(vec3(0.56, 0.57, 0.6), vec3(0.0), uDunkel);
  vec3 spitze = mix(vec3(1.0), vec3(0.55, 0.555, 0.57), uDunkel);
  vec3 farbe = mix(hellbereich, spitze, smoothstep(0.0, 1.0, hell));
  farbe = mix(farbe, farbe * (0.8 + 0.4 * uTon), 0.1 + 0.15 * uDunkel);
  farbe += (rauschen(gl_FragCoord.xy) - 0.5) / 255.0;
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

export const STILE = { metall: METALL, lava: LAVA };

// Ton (RGB), Tempo, Welle und Puls je Gesamtstatus.
const STIMMUNG = {
  arbeitet: { ton: [0.12, 0.42, 1.0], tempo: 1.0, welle: 1, puls: 0 },
  frage: { ton: [1.0, 0.58, 0.05], tempo: 0.55, welle: 0.4, puls: 1 },
  pr: { ton: [0.15, 0.75, 0.35], tempo: 0.4, welle: 0.2, puls: 0 },
  ruhig: { ton: [0.55, 0.45, 0.95], tempo: 0.25, welle: 0, puls: 0 },
};

const UNIFORMS = ['uRes', 'uPhase', 'uPuls', 'uWelle', 'uNeigung', 'uTon', 'uDunkel'];

export class Hintergrund {
  constructor(canvas) {
    this.canvas = canvas;
    this.an = false;
    this.stil = 'metall';
    this.skala = 0.6;
    this.status = 'ruhig';
    this.ton = [...STIMMUNG.ruhig.ton];
    this.tempo = STIMMUNG.ruhig.tempo;
    this.welle = 0;
    this.pulsStaerke = 0;
    this.phase = Math.random() * 50;
    this.neigung = [0, 0];
    this.neigungZiel = [0, 0];
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
    } else if (this.mittel < 17.2 && this.skala < 0.6 && ++this.guteFrames > 240) {
      this.skala = Math.min(0.6, this.skala * 1.1);
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
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
