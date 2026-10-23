// 3D-Hintergrund: schwebende Glasformen, per Raymarching in WebGL gerechnet.
// Farbe, Tempo und Puls folgen dem Session-Status, die Kamera der Neigung
// des iPhones. Gerechnet wird in reduzierter Auflösung (Glas ist ohnehin
// weich), die bei Bedarf weiter sinkt, damit 60 fps halten. Mehr als 60
// Bilder pro Sekunde rechnet die Szene auch auf ProMotion-Displays nicht.

const VERTEX = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uPhase;
uniform float uPuls;
uniform vec2 uNeigung;
uniform vec3 uTon;
uniform float uDunkel;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float kugel(vec3 p, float r) { return length(p) - r; }
float torus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float wuerfel(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float kapsel(vec3 p, float h, float r) { p.y -= clamp(p.y, -h, h); return length(p) - r; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }

float szene(vec3 p) {
  float t = uPhase;
  float k = clamp(uRes.x / uRes.y * 1.7, 0.6, 1.7);
  vec3 q = p - vec3(k * (-0.9 + 0.2 * sin(t * 0.7)), 1.15 + 0.25 * sin(t * 0.9), 0.0);
  q.xy *= rot(t * 0.3); q.yz *= rot(0.9 + t * 0.4);
  float d = torus(q, vec2(0.5, 0.17));
  q = p - vec3(k * (0.85 + 0.15 * cos(t * 0.6)), 1.7 + 0.2 * sin(t * 0.8 + 1.0), -0.6);
  d = min(d, kugel(q, 0.42 + 0.05 * uPuls));
  q = p - vec3(k * (0.75 + 0.2 * sin(t * 0.5 + 2.0)), -0.7 + 0.25 * cos(t * 0.7), 0.2);
  q.xz *= rot(t * 0.5); q.xy *= rot(t * 0.35);
  d = min(d, wuerfel(q, vec3(0.3), 0.12));
  q = p - vec3(k * (-0.75 + 0.18 * cos(t * 0.55 + 3.0)), -1.55 + 0.2 * sin(t * 0.75), -0.2);
  q.xy *= rot(0.6 + t * 0.4);
  d = min(d, kapsel(q, 0.3, 0.2));
  q = p - vec3(k * 0.15 * sin(t * 0.4), 0.2 + 0.3 * sin(t * 0.6 + 4.0), -1.4);
  d = smin(d, kugel(q, 0.26 + 0.04 * uPuls), 0.35);
  return d;
}

vec3 normale(vec3 p) {
  vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * szene(p + e.xyy) + e.yyx * szene(p + e.yyx) + e.yxy * szene(p + e.yxy) + e.xxx * szene(p + e.xxx));
}

// Fast flach: Weiß oder Schwarz, ein weicher Grauverlauf und nur ein Hauch
// der Statusfarbe. Das Glas lebt von Brechung und Glanz, nicht von Farbe.
vec3 hintergrund(vec2 u) {
  vec3 hell = mix(vec3(1.0), vec3(0.0), uDunkel);
  vec3 grau = mix(vec3(0.86), vec3(0.16), uDunkel);
  vec2 a = u - vec2(0.3, 0.45);
  vec2 b = u - vec2(-0.4, -0.55);
  float g1 = exp(-2.2 * dot(a, a));
  float g2 = exp(-2.8 * dot(b, b));
  vec3 c = mix(hell, grau, 0.55 * g1 + 0.4 * g2);
  c = mix(c, mix(uTon, hell, 0.55), g1 * 0.14);
  return c;
}

float rauschen(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 bildschirm = uv * 2.0 + uNeigung * 0.08;
  vec3 farbe = hintergrund(bildschirm);
  vec3 ro = vec3(uNeigung.x * 0.7, -uNeigung.y * 0.5, 5.0);
  vec3 rd = normalize(vec3(uv, -1.45));
  float t = 0.0;
  bool treffer = false;
  for (int i = 0; i < 64; i++) {
    float d = szene(ro + rd * t);
    if (d < 0.002) { treffer = true; break; }
    t += d;
    if (t > 9.0) break;
  }
  if (treffer) {
    vec3 p = ro + rd * t;
    vec3 n = normale(p);
    float fr = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    vec3 r1 = refract(rd, n, 0.68);
    vec3 r2 = refract(rd, n, 0.66);
    vec3 r3 = refract(rd, n, 0.64);
    vec3 durch = vec3(
      hintergrund(bildschirm + r1.xy * 0.5).r,
      hintergrund(bildschirm + r2.xy * 0.5).g,
      hintergrund(bildschirm + r3.xy * 0.5).b);
    vec3 grauGlas = mix(vec3(0.8), vec3(0.22), uDunkel);
    durch = mix(durch, grauGlas, 0.35);
    vec3 rf = reflect(rd, n);
    vec3 umgebung = hintergrund(rf.xy * 0.9) + mix(0.04, 0.1, uDunkel);
    float glanz = pow(max(dot(rf, normalize(vec3(-0.4, 0.8, 0.6))), 0.0), 60.0);
    float glanz2 = 0.3 * pow(max(dot(rf, normalize(vec3(0.6, -0.3, 0.8))), 0.0), 18.0);
    farbe = mix(durch, umgebung, fr * 0.65) + glanz + glanz2;
    farbe *= 1.0 - fr * 0.18 * (1.0 - uDunkel);
    farbe += uTon * fr * 0.18;
  }
  farbe += (rauschen(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(farbe, 1.0);
}
`;

// Ton (RGB), Tempo und Puls je Gesamtstatus.
const STIMMUNG = {
  arbeitet: { ton: [0.04, 0.52, 1.0], tempo: 1.0, puls: 0 },
  frage: { ton: [1.0, 0.62, 0.04], tempo: 0.55, puls: 1 },
  pr: { ton: [0.2, 0.78, 0.35], tempo: 0.4, puls: 0 },
  ruhig: { ton: [0.5, 0.45, 0.95], tempo: 0.25, puls: 0 },
};

export class Glas {
  constructor(canvas) {
    this.canvas = canvas;
    this.an = false;
    this.skala = 0.7;
    this.status = 'ruhig';
    this.ton = [...STIMMUNG.ruhig.ton];
    this.tempo = STIMMUNG.ruhig.tempo;
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
    const shader = (art, quelle) => {
      const s = gl.createShader(art);
      gl.shaderSource(s, quelle);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const puffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, puffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const ort = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(ort);
    gl.vertexAttribPointer(ort, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const name of ['uRes', 'uPhase', 'uPuls', 'uNeigung', 'uTon', 'uDunkel']) this.u[name] = gl.getUniformLocation(prog, name);
    this.gl = gl;
    this.groesse();
    return true;
  }

  starten() {
    if (this.an) return true;
    try {
      if (!this.gl && !this.einrichten()) return false;
    } catch (fehler) {
      console.warn('Glas: WebGL nicht verfügbar', fehler);
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
    if (this.mittel > 19.5 && this.skala > 0.35) {
      this.skala = Math.max(0.35, this.skala * 0.85);
      this.mittel = 16.7;
      this.guteFrames = 0;
      this.groesse();
    } else if (this.mittel < 17.2 && this.skala < 0.7 && ++this.guteFrames > 240) {
      this.skala = Math.min(0.7, this.skala * 1.1);
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
    gl.uniform2f(u.uNeigung, this.neigung[0], this.neigung[1]);
    gl.uniform3f(u.uTon, this.ton[0], this.ton[1], this.ton[2]);
    gl.uniform1f(u.uDunkel, this.dunkel.matches ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
