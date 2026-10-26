import { type SignalController, type SignalOptions, type SignalSnapshot, type SignalOverlay } from './model';

type Vec3 = [number, number, number];
type Color = [number, number, number];
interface Strand { head: number; end: Vec3; seed: number }
const colors: Color[] = [[.25, 1, 1], [1, .15, .6], [1, .85, .3]];
const phases = ['STATE', 'ASK', 'JEV', 'GATE', 'CODE'];
const cameras = ['THREE-QUARTER', 'FRONT', 'GLASS FLOW', 'BEHIND THE FAN', 'CRANE', 'MATRIX'];
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const random = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const smooth = (n: number) => n * n * (3 - 2 * n);
const headY = [-1.03, .03, 1.03];
const sourceX = -.78;
const rowsPerSheet = 32;
const strandsPerHead = rowsPerSheet * 3;
const flowRate = 1.25;

function curve(strand: Strand, t: number): Vec3 {
  const a = 1 - t;
  const y = headY[strand.head];
  const [ex, ey, ez] = strand.end;
  return [
    a * a * a * sourceX + 3 * a * a * t * -.50 + 3 * a * t * t * -.30 + t * t * t * ex,
    a * a * a * y + 3 * a * a * t * y + 3 * a * t * t * ey + t * t * t * ey,
    3 * a * t * t * ez + t * t * t * ez,
  ];
}

// One route continues from the source, through the loom gate, into the output matrix.
function dataPath(strand: Strand, progress: number): Vec3 {
  if (progress <= .48) return curve(strand, progress / .48);
  const t = (progress - .48) / .52;
  return [strand.end[0] + t * (3.5 - strand.end[0]), strand.end[1], strand.end[2]];
}

const vertexSource = `
attribute vec3 a_position;
attribute vec3 a_color;
attribute vec4 a_style;
attribute vec2 a_corner;
uniform vec2 u_resolution;
uniform vec4 u_pose;
uniform float u_time;
uniform float u_dpr;
uniform mediump float u_quad;
varying vec3 v_color;
varying float v_alpha;
varying float v_kind;
varying float v_digit;
varying vec2 v_uv;
varying float v_blur;
void main() {
  vec3 p = a_position - vec3(.45, 0., 0.);
  float cy=cos(u_pose.x), sy=sin(u_pose.x), cp=cos(u_pose.y), sp=sin(u_pose.y);
  p=vec3(p.x*cy+p.z*sy,p.y,p.z*cy-p.x*sy);
  p=vec3(p.x,p.y*cp-p.z*sp,p.y*sp+p.z*cp);
  float perspective=5.6/max(1.4,5.6-p.z);
  float scale=min(u_resolution.x/4.35,u_resolution.y/3.30)*u_pose.w;
  vec2 screen=vec2(u_resolution.x*.51+u_pose.z*scale,u_resolution.y*.50)+p.xy*scale*perspective;
  gl_Position=vec4(screen.x/u_resolution.x*2.-1.,1.-screen.y/u_resolution.y*2.,0.,1.);
  gl_PointSize=clamp(a_style.x*scale/155.*perspective*u_dpr,1.,512.);
  if(u_quad>.5) {
    vec2 shape=a_style.z>2.5?vec2(.42,1.55):vec2(1.);
    gl_Position.xy+=a_corner*shape*vec2(1.,-1.)*a_style.x*scale/155.*perspective/u_resolution;
  }
  v_uv=a_corner*.5+.5;
  v_blur=clamp((.3-p.z)*.025,0.,.045);
  v_color=a_color;
  float scan=.78+.22*sin(a_position.y*8.-u_time*2.1+a_style.w*12.);
  v_alpha=a_style.y*scan*clamp(.85+p.z*.13,.3,1.2);
  v_kind=a_style.z;
  v_digit=step(.5,fract(a_style.w+floor(u_time*2.+a_position.x)*.381));
}`;
const fragmentSource = `
precision mediump float;
uniform sampler2D u_atlas;
uniform float u_line;
uniform mediump float u_quad;
varying vec3 v_color;
varying float v_alpha;
varying float v_kind;
varying float v_digit;
varying vec2 v_uv;
varying float v_blur;
void main() {
  if(u_line>.5) { gl_FragColor=vec4(v_color,v_alpha); return; }
  vec2 coord=u_quad>.5?v_uv:gl_PointCoord;
  vec2 q=coord*2.-1.;
  float r=dot(q,q);
  if(v_kind<.5) {
    vec2 uv=vec2((coord.x+v_digit)*.5,coord.y);
    float ink=texture2D(u_atlas,uv).a*.4;
    ink+=.15*texture2D(u_atlas,uv+vec2(v_blur*.5,0.)).a;
    ink+=.15*texture2D(u_atlas,uv-vec2(v_blur*.5,0.)).a;
    ink+=.15*texture2D(u_atlas,uv+vec2(0.,v_blur)).a;
    ink+=.15*texture2D(u_atlas,uv-vec2(0.,v_blur)).a;
    gl_FragColor=vec4(v_color,(ink+.085*exp(-r*3.))*v_alpha);
  } else {
    float halo=exp(-r*(v_kind>1.5?4.:8.));
    float core=exp(-r*80.);
    gl_FragColor=vec4(mix(v_color,vec3(1.),core*.8),(halo+core*.7)*v_alpha);
  }
}`;

const postVertexSource = `
precision mediump float;
attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv=a_position*.5+.5; gl_Position=vec4(a_position,0.,1.); }
`;
const blurFragmentSource = `
precision mediump float;
uniform sampler2D u_image;
uniform vec2 u_step;
uniform float u_extract;
uniform float u_wallEdge;
varying vec2 v_uv;
vec3 light(vec2 uv) {
  vec3 color=texture2D(u_image,uv).rgb;
  float brightness=max(color.r,max(color.g,color.b));
  float wallWeight=1.-.42*smoothstep(u_wallEdge-.03,u_wallEdge+.18,uv.x);
  return color*mix(1.,smoothstep(.30,.85,brightness)*wallWeight,u_extract);
}
void main() {
  vec3 color=light(v_uv)*.227027;
  color+=light(v_uv+u_step*1.384615)*.316216;
  color+=light(v_uv-u_step*1.384615)*.316216;
  color+=light(v_uv+u_step*3.230769)*.070270;
  color+=light(v_uv-u_step*3.230769)*.070270;
  gl_FragColor=vec4(color,1.);
}`;
const compositeFragmentSource = `
precision mediump float;
uniform sampler2D u_scene;
uniform sampler2D u_near;
uniform sampler2D u_wide;
varying vec2 v_uv;
void main() {
  vec3 scene=texture2D(u_scene,v_uv).rgb;
  vec3 nearGlow=texture2D(u_near,v_uv).rgb;
  vec3 wideGlow=texture2D(u_wide,v_uv).rgb;
  gl_FragColor=vec4(scene+nearGlow*.95+wideGlow*1.6,1.);
}`;

/** Geometry is shared by the GPU and Canvas fallback; cameras project actual XYZ positions. */
export function mountSignalLoom(canvas: HTMLCanvasElement, options: SignalOptions): SignalController {
  const abort = new AbortController();
  let disposed = false;
  let paused = options.initialPaused ?? false;
  let speed = 1;
  let time = 0;
  let lastTime = performance.now();
  let lastNotify = -1;
  let frameCount = 0;
  let fps = 60;
  let raf = 0;
  let width = 1, height = 1, dpr = 1;
  let yaw = 0, pitch = 0, zoom = 1;
  let pointer: { id: number; x: number; y: number } | undefined;
  let pose: [number, number, number, number] = [0, 0, 0, 1];
  const strands: Strand[] = [];
  const points: number[] = [];
  const lines: number[] = [];
  const packets: number[] = [];
  const add = (target: number[], p: Vec3, c: Color, size: number, alpha: number, kind: number, seed: number) => target.push(...p, ...c, size, alpha, kind, seed);
  // Several transparent layers, staggered columns, and mixed glyph scales form a deep data volume.
  for (let layer = 0; layer < 4; layer++) {
    for (let col = 0; col < 52; col++) {
      for (let row = 0; row < 44; row++) {
        const seed = layer * 4400 + col * 47 + row;
        const n = random(seed);
        if (n < .12) continue;
        const x = .86 + col * .049 + layer * .04 + Math.sin(row * .18 + layer) * .11 + random(seed + 72) * .024;
        const y = -1.75 + row * .081 + random(col + layer * 53) * .04 + random(seed + 9) * .018;
        const z = -.95 + layer * .48 + Math.sin(col * .15) * .12;
        const c: Color = n > .984 ? colors[1] : n > .975 ? colors[2] : n > .69 ? [.52, .94, 1] : [.19, .38, .9];
        const hotspot = Math.pow(.5 + .5 * Math.sin(col * .26 + row * .15 + layer), 4);
        add(points, [x, y, z], c, (n > .75 ? 16 : 10) + random(seed + 83) * 5, (.12 + n * .52 + hotspot * .7) * (layer === 3 ? 1 : .62), n > .99 ? 1 : 0, n);
        if (layer === 3 && n > .93) add(points, [x, y, z], [.3, .86, 1], 40, .1 + hotspot * .12, 2, n);
      }
    }
  }
  // The thin loom gate separates individual strands before they enter the wider binary field.
  for (let row = 0; row < 42; row++) for (let col = 0; col < 5; col++) {
    const seed = row * 5 + col;
    const c: Color = seed % 11 === 0 ? colors[1] : seed % 13 === 0 ? colors[2] : [.3, .95, 1];
    add(points, [.61 + col * .07, -1.65 + row * .08, .18 + Math.sin(row * .11) * .2], c, 14, .7 + random(seed) * .55, 1, random(seed));
  }
  // Sparse out-of-focus binary rain lives behind the signal inputs, not on a screen-space overlay.
  for (let i = 0; i < 750; i++) {
    add(points, [-2.65 + random(i) * 3.3, -1.85 + random(i + 340) * 3.7, -1.6 + random(i + 810) * 1.4], [.14, .36, .68], 10 + random(i + 44) * 11, .12 + random(i + 6) * .18, 0, random(i + 71));
  }
  for (let head = 0; head < 3; head++) {
    for (let sheet = 0; sheet < 3; sheet++) for (let row = 0; row < rowsPerSheet; row++) {
      const seed = head * strandsPerHead + sheet * rowsPerSheet + row;
      // Ordered layers, rather than random Z endpoints, keep adjacent fibres parallel.
      const s: Strand = { head, end: [.72 + sheet * .045, -1.62 + row / (rowsPerSheet - 1) * 3.24, -.58 + sheet * .48 + head * .035], seed: random(seed + 93) };
      strands.push(s);
      for (let step = 0; step < 26; step++) {
        const alpha = row % 4 === 0 ? .17 + sheet * .025 : .05 + sheet * .008;
        add(lines, curve(s, step / 26), colors[head], 1, alpha, 1, s.seed);
        add(lines, curve(s, (step + 1) / 26), colors[head], 1, alpha, 1, s.seed);
      }
    }
  }
  // Long horizontal wires lend perspective and connect the loom to the output wall.
  for (let i = 0; i < 90; i++) {
    const y = -1.7 + random(i + 415) * 3.4;
    const z = -.75 + random(i + 5) * 1.5;
    add(lines, [.7, y, z], [.24, .48, .8], 1, .05, 1, 0);
    add(lines, [3.6, y, z], [.24, .48, .8], 1, .025, 1, 0);
  }
  const pointData = new Float32Array(points);
  const lineData = new Float32Array(lines);
  const depthRange = { min: Infinity, max: -Infinity };
  for (let i = 2; i < pointData.length; i += 10) { depthRange.min = Math.min(depthRange.min, pointData[i]); depthRange.max = Math.max(depthRange.max, pointData[i]); }
  const atlas = document.createElement('canvas');
  atlas.width = 64; atlas.height = 32;
  const atlasCtx = atlas.getContext('2d')!;
  atlasCtx.fillStyle = '#fff'; atlasCtx.font = '27px monospace'; atlasCtx.textAlign = 'center'; atlasCtx.textBaseline = 'middle';
  atlasCtx.fillText('0', 16, 17); atlasCtx.fillText('1', 48, 17);
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  let gpuReady = false;
  let ctx: CanvasRenderingContext2D | null = null;
  let fallbackCanvas: HTMLCanvasElement | null = null;
  const originalOpacity = canvas.style.opacity;
  let program: WebGLProgram | null = null;
  const buffers: WebGLBuffer[] = [];
  let texture: WebGLTexture | null = null;
  const locations: Record<string, WebGLUniformLocation | null> = {};
  const attrs: number[] = [];
  const postPrograms: WebGLProgram[] = [];
  const postTextures: WebGLTexture[] = [];
  const framebuffers: WebGLFramebuffer[] = [];
  let postQuad: WebGLBuffer | null = null;
  let bloomWidth = 1, bloomHeight = 1;
  let postWidth = 0, postHeight = 0;
  let blurPosition = 0, compositePosition = 0;
  let blurImage: WebGLUniformLocation | null = null, blurStep: WebGLUniformLocation | null = null, blurExtract: WebGLUniformLocation | null = null;
  let blurWallEdge: WebGLUniformLocation | null = null;
  const compositeSamplers: (WebGLUniformLocation | null)[] = [];
  function releasePost() {
    if (!gl) return;
    for (const item of postPrograms) gl.deleteProgram(item);
    for (const item of postTextures) gl.deleteTexture(item);
    for (const item of framebuffers) gl.deleteFramebuffer(item);
    if (postQuad) gl.deleteBuffer(postQuad);
  }
  function enableFallback() {
    gpuReady = false;
    if (gl && !fallbackCanvas) {
      fallbackCanvas = document.createElement('canvas');
      fallbackCanvas.setAttribute('aria-hidden', 'true');
      Object.assign(fallbackCanvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
      canvas.insertAdjacentElement('afterend', fallbackCanvas);
      canvas.style.opacity = '0';
    }
    const surface = fallbackCanvas || canvas;
    surface.width = Math.round(width * dpr); surface.height = Math.round(height * dpr);
    ctx = surface.getContext('2d', { alpha: false });
  }
  const compile = (kind: number, source: string) => {
    const shader = gl!.createShader(kind)!;
    gl!.shaderSource(shader, source); gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) { const error = gl!.getShaderInfoLog(shader); gl!.deleteShader(shader); throw new Error(error || 'Signal shader failed'); }
    return shader;
  };
  if (gl) {
    try {
      const vs = compile(gl.VERTEX_SHADER, vertexSource), fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram()!; gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Signal program did not link');
      gl.useProgram(program);
      for (const key of ['resolution', 'pose', 'time', 'dpr', 'line', 'atlas', 'quad']) locations[key] = gl.getUniformLocation(program, `u_${key}`);
      attrs.push(...['a_position', 'a_color', 'a_style', 'a_corner'].map(name => gl!.getAttribLocation(program!, name)));
      for (const data of [pointData, lineData, new Float32Array(0), new Float32Array(0)]) { const buffer = gl.createBuffer()!; buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); }
      texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(locations.atlas, 0); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.disable(gl.DEPTH_TEST);
      // Two scales of low-resolution Gaussian bloom preserve crisp glyphs and spread only bright light.
      for (const fragment of [blurFragmentSource, compositeFragmentSource]) {
        const vertex = compile(gl.VERTEX_SHADER, postVertexSource), pixel = compile(gl.FRAGMENT_SHADER, fragment);
        const p = gl.createProgram()!; postPrograms.push(p); gl.attachShader(p, vertex); gl.attachShader(p, pixel); gl.linkProgram(p);
        gl.deleteShader(vertex); gl.deleteShader(pixel);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'Bloom program did not link');
      }
      blurPosition = gl.getAttribLocation(postPrograms[0], 'a_position'); compositePosition = gl.getAttribLocation(postPrograms[1], 'a_position');
      blurImage = gl.getUniformLocation(postPrograms[0], 'u_image'); blurStep = gl.getUniformLocation(postPrograms[0], 'u_step'); blurExtract = gl.getUniformLocation(postPrograms[0], 'u_extract');
      blurWallEdge = gl.getUniformLocation(postPrograms[0], 'u_wallEdge');
      for (const name of ['u_scene', 'u_near', 'u_wide']) compositeSamplers.push(gl.getUniformLocation(postPrograms[1], name));
      postQuad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, postQuad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      for (let i = 0; i < 4; i++) {
        const image = gl.createTexture()!; postTextures.push(image); gl.bindTexture(gl.TEXTURE_2D, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const framebuffer = gl.createFramebuffer()!; framebuffers.push(framebuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, image, 0);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gpuReady = true;
    } catch {
      if (program) gl.deleteProgram(program);
      for (const buffer of buffers) gl.deleteBuffer(buffer);
      if (texture) gl.deleteTexture(texture);
      releasePost();
      enableFallback();
    }
  }
  if (!gl) enableFallback();
  const glowSprites = colors.map(color => {
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
    const context = sprite.getContext('2d')!;
    const g = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    const rgb = color.map(v => Math.round(v * 255)).join(',');
    g.addColorStop(0, '#fff'); g.addColorStop(.08, `rgba(${rgb},1)`); g.addColorStop(.22, `rgba(${rgb},.45)`); g.addColorStop(1, `rgba(${rgb},0)`);
    context.fillStyle = g; context.fillRect(0, 0, 64, 64); return sprite;
  });
  function camera() {
    const t = time % 27;
    const stage = Math.floor(t / 4.5);
    const poses = [[-.16, -.025, -.03, 1.08], [.3, .02, .02, 1.02], [-.65, .05, -.55, 1.17], [.52, -.12, -1.28, 1.7], [-.52, .27, -1.35, 1.45], [.58, -.07, -1.25, 1.6]];
    const current = poses[stage], next = poses[(stage + 1) % 6];
    const progress = smooth(clamp((t % 4.5 - 3.1) / 1.4, 0, 1));
    pose = [current[0] + (next[0] - current[0]) * progress + yaw, current[1] + (next[1] - current[1]) * progress + pitch, current[2] + (next[2] - current[2]) * progress, (current[3] + (next[3] - current[3]) * progress) * zoom];
  }
  function project(p: Vec3): [number, number, number] {
    const x = p[0] - .45;
    const cy = Math.cos(pose[0]), sy = Math.sin(pose[0]), cp = Math.cos(pose[1]), sp = Math.sin(pose[1]);
    const rx = x * cy + p[2] * sy, rz = p[2] * cy - x * sy;
    const ry = p[1] * cp - rz * sp, z = p[1] * sp + rz * cp;
    const perspective = 5.6 / Math.max(1.4, 5.6 - z);
    const scale = Math.min(width / 4.35, height / 3.3) * pose[3];
    return [width * .51 + pose[2] * scale + rx * scale * perspective, height * .5 + ry * scale * perspective, perspective * scale / 155];
  }
  function snapshot(): SignalSnapshot {
    const caseIndex = Math.floor(time / 2.25) % 12;
    return { time, paused, speed, fps: Math.round(fps), phase: phases[Math.min(4, Math.floor(time % 2.25 / .45))], caseIndex,
      camera: cameras[Math.floor(time % 27 / 4.5)], decisions: 732 + Math.floor(time * 337), confidence: [.97, .94, .91, .92, .93, .90, .96, .89, .91, .71, .82, .94][caseIndex], latency: 256 + Math.round(Math.sin(time * .8) * 6) };
  }
  let overlayItems: SignalOverlay[] = [];
  const flowProbes: { id: string; head: number; progress: number; world: Vec3; screen: [number, number] }[] = [];
  function updateOverlays() {
    const items: SignalOverlay[] = [];
    const addCard = (id: string, kind: 'source' | 'packet', head: number, world: Vec3, age: number, duration: number, title: string, detail: string) => {
      const p = project(world);
      const opacity = smooth(clamp(age / .14, 0, 1)) * smooth(clamp((duration - age) / .22, 0, 1));
      if (opacity <= .01 || p[0] < 30 || p[0] > width - 30 || p[1] < 20 || p[1] > height - 20) return;
      items.push({ id, kind, head, title, detail, x: p[0], y: p[1], scale: clamp(p[2] * .8, .55, .85), opacity });
    };
    for (let head = 0; head < 3; head++) {
      const clock = time + .25 + head * .7;
      const generation = Math.floor(clock / 3.3), age = clock % 3.3;
      if (age < 2.9) addCard(`source-${head}-${generation}`, 'source', head, [-1.32 + age * .025, headY[head] - .23, .16], age, 2.9,
        ['CHOICE', 'SCORE', 'NOUL'][head], ['pick one label · 2 ms', 'ordered labels · 3 ms', 'yes / no · 4 ms'][head]);
      const packetClock = time + head * .43;
      const batch = Math.floor(packetClock / 1.55), life = packetClock % 1.55;
      if (life < 1.22) {
        const row = 5 + Math.floor(random(batch * 11 + head * 73) * 22);
        const strand = strands[head * strandsPerHead + rowsPerSheet + row];
        const world = dataPath(strand, .06 + life / 1.22 * .76);
        world[1] -= .10; world[2] += .16;
        addCard(`packet-${head}-${batch}`, 'packet', head, world, life, 1.22,
          `PKT 0x${(25111100 + batch * 37 + head * 17).toString(16).toUpperCase()}`, `${['choice', 'score', 'noul'][head]} · ${7 + head} bits · ${snapshot().confidence.toFixed(2)}`);
      }
    }
    overlayItems = items;
    options.onOverlay?.(items);
  }
  function updatePackets() {
    packets.length = 0;
    // Large billboards provide spatial haze without blurring the interface or all geometry.
    add(packets, [-.45, 0, -1.3], [.12, .18, .44], 1000, .23, 2, 0);
    add(packets, [1.7, .1, -1.1], [.12, .16, .44], 1000, .2, 2, 0);
    flowProbes.length = 0;
    // Each source emits one packet at a time along one fibre. The next packet
    // chooses a new destination only after the preceding one completes its 0.8s route.
    for (let head = 0; head < 3; head++) {
      const clock = time * flowRate + head * .11;
      const cycle = Math.floor(clock), progress = clock % 1;
      const row = 4 + Math.floor(random(cycle * 13 + head * 31) * 24);
      const sheet = cycle % 3;
      const strand = strands[head * strandsPerHead + sheet * rowsPerSheet + row];
      const world = dataPath(strand, progress), projected = project(world);
      flowProbes.push({ id: `${head}-${cycle}`, head, progress, world, screen: [projected[0], projected[1]] });
      const envelope = smooth(clamp(progress / .025, 0, 1)) * clamp((1 - progress) / .04, 0, 1);
      const pale = colors[head].map(v => .55 + v * .45) as Color;
      add(packets, world, pale, 18, envelope * 1.7, 1, strand.seed);
      for (let tail = 1; tail <= 26; tail++) {
        const t = progress - tail * .004;
        if (t < 0) continue;
        add(packets, dataPath(strand, t), colors[head], 9 - tail * .18, envelope * (1 - tail / 27) * .85, 1, strand.seed);
      }
      if (progress > .025 && progress < .96) add(packets, world, colors[head], 28, .16 * envelope, 2, 0);
    }
    for (let head = 0; head < 3; head++) {
      const p: Vec3 = [sourceX, headY[head], 0];
      const pulse = .92 + Math.sin(time * 7 + head) * .08;
      add(packets, p, colors[head], 100 * pulse, .18, 2, 0);
      add(packets, p, colors[head], 36 * pulse, .38, 2, 0);
      add(packets, p, colors[head], 12 * pulse, 1, 1, 0);
      // The input digits themselves translate toward the source at 2.1 traversals/second.
      for (let col = 0; col < 42; col++) for (let row = 0; row < 5; row++) {
        const phase = (col / 42 + time * 2.1) % 1;
        const world: Vec3 = [-2.9 + phase * (2.9 + sourceX), headY[head] + (row - 2) * .035 + Math.sin(phase * 6) * .025, (row - 2) * .06];
        const edge = Math.min(1, phase * 12, (1 - phase) * 18);
        add(packets, world, colors[head], 10, edge * (.45 + random(col + head * 42) * .6), 0, random(col * 5 + row));
      }
    }
  }
  function drawGpu() {
    if (!gl || !program || !gpuReady) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[0]);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(.018, .025, .065, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.useProgram(program); gl.uniform2f(locations.resolution, width, height); gl.uniform4f(locations.pose, ...pose); gl.uniform1f(locations.time, time); gl.uniform1f(locations.dpr, dpr);
    const packetPoints: number[] = [], packetQuads: number[] = [];
    const corners = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];
    for (let i = 0; i < packets.length; i += 10) {
      if (packets[i + 8] < 2) { for (let j = 0; j < 10; j++) packetPoints.push(packets[i + j]); }
      else for (let corner = 0; corner < 12; corner += 2) {
        for (let j = 0; j < 10; j++) packetQuads.push(packets[i + j]);
        packetQuads.push(corners[corner], corners[corner + 1]);
      }
    }
    const draw = (index: number, count: number, line = false) => {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buffers[index]);
      if (index === 2) gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(packetPoints), gl!.DYNAMIC_DRAW);
      [3, 3, 4].forEach((size, i) => { gl!.enableVertexAttribArray(attrs[i]); gl!.vertexAttribPointer(attrs[i], size, gl!.FLOAT, false, 40, [0, 12, 24][i]); });
      gl!.disableVertexAttribArray(attrs[3]); gl!.vertexAttrib2f(attrs[3], 0, 0); gl!.uniform1f(locations.quad, 0);
      gl!.uniform1f(locations.line, line ? 1 : 0);
      gl!.drawArrays(line ? gl!.LINES : gl!.POINTS, 0, count);
    };
    draw(1, lines.length / 10, true); draw(0, points.length / 10); draw(2, packetPoints.length / 10);
    // Triangle billboards bypass the 64px point-size limit on some GPU backends.
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers[3]); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(packetQuads), gl.DYNAMIC_DRAW);
    [3, 3, 4, 2].forEach((size, i) => { gl!.enableVertexAttribArray(attrs[i]); gl!.vertexAttribPointer(attrs[i], size, gl!.FLOAT, false, 48, [0, 12, 24, 40][i]); });
    gl.uniform1f(locations.quad, 1); gl.uniform1f(locations.line, 0); gl.drawArrays(gl.TRIANGLES, 0, packetQuads.length / 12);
    gl.disable(gl.BLEND); gl.bindBuffer(gl.ARRAY_BUFFER, postQuad);
    for (const attr of attrs) gl.disableVertexAttribArray(attr);
    gl.enableVertexAttribArray(blurPosition); gl.vertexAttribPointer(blurPosition, 2, gl.FLOAT, false, 8, 0);
    gl.useProgram(postPrograms[0]); gl.uniform1i(blurImage, 0);
    // Track the projected wall as the camera moves; prevent dense glyphs from becoming a white slab.
    gl.uniform1f(blurWallEdge, project([.9, 0, 0])[0] / width);
    const blur = (source: number, target: number, x: number, y: number, extract = 0) => {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, framebuffers[target]); gl!.viewport(0, 0, bloomWidth, bloomHeight);
      gl!.activeTexture(gl!.TEXTURE0); gl!.bindTexture(gl!.TEXTURE_2D, postTextures[source]);
      gl!.uniform2f(blurStep, x / bloomWidth, y / bloomHeight); gl!.uniform1f(blurExtract, extract); gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    };
    blur(0, 1, 1, 0, 1); blur(1, 2, 0, 1);
    blur(2, 1, 4, 0); blur(1, 3, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(postPrograms[1]);
    gl.disableVertexAttribArray(blurPosition); gl.enableVertexAttribArray(compositePosition); gl.vertexAttribPointer(compositePosition, 2, gl.FLOAT, false, 8, 0);
    [0, 2, 3].forEach((index, unit) => { gl!.activeTexture(gl!.TEXTURE0 + unit); gl!.bindTexture(gl!.TEXTURE_2D, postTextures[index]); gl!.uniform1i(compositeSamplers[unit], unit); });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.activeTexture(gl.TEXTURE0);
  }
  function drawFallback() {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#050711'; ctx.fillRect(0, 0, width, height); ctx.globalCompositeOperation = 'lighter';
    for (let head = 0; head < 3; head++) {
      ctx.strokeStyle = `rgba(${colors[head].map(c => Math.round(c * 255)).join(',')},.13)`; ctx.lineWidth = .7;
      ctx.beginPath();
      for (let i = head * strandsPerHead; i < (head + 1) * strandsPerHead; i += 2) for (let k = 0; k <= 18; k++) {
        const p = project(curve(strands[i], k / 18)); if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    }
    for (let i = 0; i < points.length; i += 20) {
      const p = project([points[i], points[i + 1], points[i + 2]]);
      if (p[0] < -20 || p[0] > width + 20 || p[1] < -20 || p[1] > height + 20) continue;
      const size = points[i + 6] * p[2];
      ctx.globalAlpha = points[i + 7] * .7;
      ctx.drawImage(atlas, Math.floor((points[i + 9] + Math.floor(time * 2) * .381) % 1 * 2) * 32, 0, 32, 32, p[0] - size / 2, p[1] - size / 2, size, size);
    }
    for (let i = 0; i < packets.length; i += 10) {
      const p = project([packets[i], packets[i + 1], packets[i + 2]]);
      const size = packets[i + 6] * p[2];
      const head = packets[i + 3] > .9 ? packets[i + 5] > packets[i + 4] ? 1 : 2 : 0;
      ctx.globalAlpha = packets[i + 7];
      if (packets[i + 8] === 0) {
        const digit = Math.floor((packets[i + 9] % 1) * 2);
        ctx.drawImage(atlas, digit * 32, 0, 32, 32, p[0] - size / 2, p[1] - size / 2, size, size);
      } else ctx.drawImage(glowSprites[head], p[0] - size / 2, p[1] - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
  function render() { camera(); updatePackets(); updateOverlays(); if (gpuReady) drawGpu(); else drawFallback(); }
  function notify() { options.onUpdate(snapshot()); }
  function resize() {
    const rect = canvas.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.5); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    if (gpuReady && gl && (postWidth !== canvas.width || postHeight !== canvas.height)) {
      postWidth = canvas.width; postHeight = canvas.height;
      // CSS pixel resolution keeps the bloom radius consistent on Retina and standard displays.
      bloomWidth = Math.max(1, Math.ceil(width / 6)); bloomHeight = Math.max(1, Math.ceil(height / 6));
      for (let i = 0; i < postTextures.length; i++) {
        gl.bindTexture(gl.TEXTURE_2D, postTextures[i]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, i === 0 ? postWidth : bloomWidth, i === 0 ? postHeight : bloomHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[i]);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { enableFallback(); break; }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    if (fallbackCanvas) { fallbackCanvas.width = canvas.width; fallbackCanvas.height = canvas.height; }
    render();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  const events = { signal: abort.signal };
  canvas.addEventListener('pointerdown', event => { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); }, events);
  canvas.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    yaw += (event.clientX - pointer.x) * .006; pitch = clamp(pitch + (event.clientY - pointer.y) * .005, -.8, .8);
    pointer.x = event.clientX; pointer.y = event.clientY; render(); notify();
  }, events);
  const release = () => { pointer = undefined; };
  canvas.addEventListener('pointerup', release, events); canvas.addEventListener('pointercancel', release, events);
  canvas.addEventListener('wheel', event => { event.preventDefault(); zoom = clamp(zoom * Math.exp(-event.deltaY * .001), .6, 1.8); render(); notify(); }, { ...events, passive: false });
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') yaw -= .08; if (event.key === 'ArrowRight') yaw += .08;
    if (event.key === 'ArrowUp') pitch = clamp(pitch - .08, -.8, .8); if (event.key === 'ArrowDown') pitch = clamp(pitch + .08, -.8, .8);
    if (event.key === '+' || event.key === '=') zoom = clamp(zoom + .1, .6, 1.8); if (event.key === '-') zoom = clamp(zoom - .1, .6, 1.8);
    if (event.key === '0') { yaw = pitch = 0; zoom = 1; }
    render(); notify();
  }, events);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); enableFallback(); render(); notify(); }, events);
  function frame(now: number) {
    if (disposed) return;
    raf = 0;
    const dt = Math.max(0, (now - lastTime) / 1000); lastTime = now;
    if (!paused && !document.hidden) time += dt * speed;
    if (dt > 0 && dt < 1) fps += (1 / dt - fps) * .06;
    if (!paused || frameCount === 0) render();
    frameCount++;
    if (now - lastNotify > 90) { notify(); lastNotify = now; }
    if (!paused) raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { lastTime = performance.now(); }, events);
  resize(); notify(); if (!paused) raf = requestAnimationFrame(frame);
  return {
    setPaused(value) {
      if (disposed || paused === value) return;
      paused = value; lastTime = performance.now();
      if (paused) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) raf = requestAnimationFrame(frame);
      notify();
    },
    setSpeed(value) { if (disposed || !Number.isFinite(value)) return; speed = clamp(value, .25, 4); notify(); },
    restart() { if (disposed) return; time = 0; lastTime = performance.now(); render(); notify(); },
    resetView() { if (disposed) return; yaw = pitch = 0; zoom = 1; render(); notify(); },
    getSnapshot: snapshot,
    debug() {
      const probes: Vec3[] = [[1.2, -.8, -.95], [1.2, -.8, .61], [sourceX, 1.03, 0]];
      return { pointCount: points.length / 10, strandCount: strands.length, flow: flowProbes.map(p => ({ ...p, world: [...p.world] as Vec3, screen: [...p.screen] as [number, number] })), overlays: overlayItems.map(item => ({ ...item })), depthRange: { ...depthRange }, rotation: { yaw, pitch, zoom }, disposed, renderer: gpuReady ? 'webgl' : 'canvas2d', frameCount, activeFrame: raf !== 0,
        probes: probes.map(world => { const p = project(world); return { world, screen: [p[0], p[1]] }; }) };
    },
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(raf); raf = 0; observer.disconnect(); abort.abort();
      if (gl) { for (const buffer of buffers) gl.deleteBuffer(buffer); if (texture) gl.deleteTexture(texture); if (program) gl.deleteProgram(program); releasePost(); gl.getExtension('WEBGL_lose_context')?.loseContext(); }
      fallbackCanvas?.remove(); canvas.style.opacity = originalOpacity;
    },
  };
}
