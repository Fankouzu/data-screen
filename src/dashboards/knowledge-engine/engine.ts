import { pages, patchOrder, type Vec3, type KnowledgeController, type KnowledgeOptions, type KnowledgeSnapshot, type KnowledgeLabel } from './model';

type Color = [number, number, number];
interface Node { position: Vec3; color: Color; size: number; cluster: number; seed: number; kind: number }
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const random = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const ease = (v: number) => { const t = clamp(v, 0, 1); return t * t * (3 - 2 * t); };
const coral: Color = [.86, .31, .37];
const ivory: Color = [.83, .81, .75];
const gold: Color = [.95, .77, .26];
const source: Vec3 = [-1.50, -.38, .14];
const stride = 10;

const vertex = `
attribute vec3 a_position;
attribute vec3 a_color;
attribute vec4 a_style;
uniform vec2 u_resolution;
uniform vec4 u_camera;
uniform vec3 u_state;
uniform float u_dpr;
uniform mediump float u_line;
uniform float u_active;
uniform float u_check;
varying vec3 v_color;
varying float v_alpha;
varying float v_kind;
varying float v_seed;
void main(){
  vec3 p=a_position;
  if(a_style.y>=0.){
    p.x+=sin(u_state.x*.36+a_style.y*1.71)*.025;
    p.y+=cos(u_state.x*.31+a_style.y*1.13)*.018;
  }
  p.x*=clamp(u_resolution.x/u_resolution.y/1.27,1.,1.75);
  p.y-=.06;
  float cy=cos(u_camera.x),sy=sin(u_camera.x),cp=cos(u_camera.y),sp=sin(u_camera.y);
  p=vec3(p.x*cy+p.z*sy,p.y,p.z*cy-p.x*sy);
  p=vec3(p.x,p.y*cp-p.z*sp,p.y*sp+p.z*cp);
  float perspective=6./max(2.,6.-p.z);
  float scale=min(u_resolution.x/4.25,u_resolution.y/3.95)*u_camera.w;
  vec2 screen=u_resolution*vec2(.55,.45)+vec2(u_camera.z,u_state.y)*scale+p.xy*scale*perspective;
  gl_Position=vec4(screen.x/u_resolution.x*2.-1.,1.-screen.y/u_resolution.y*2.,-p.z/8.,1.);
  gl_PointSize=clamp(a_style.x*scale/150.*perspective*u_dpr,1.,480.);
  float selected=1.-step(.1,abs(a_style.y-u_active));
  float check=selected*u_check*step(18.,a_style.x);
  v_color=mix(a_color,vec3(.95,.78,.3),check*.76);
  float light=.75+.25*sin(u_state.x*2.7+a_style.z*29.);
  v_alpha=u_line>.5?a_style.x*clamp(.85+p.z*.19,.35,1.25):clamp(.82+p.z*.18,.4,1.);
  if(a_style.w>1.5 && a_style.w<2.5) v_alpha=.12*light;
  v_color*=1.+selected*.14*light;
  v_kind=a_style.w;
  v_seed=a_style.z;
}`;
const fragment = `
precision mediump float;
uniform mediump float u_line;
varying vec3 v_color;
varying float v_alpha;
varying float v_kind;
varying float v_seed;
void main(){
  if(u_line>.5){gl_FragColor=vec4(v_color,v_alpha);return;}
  vec2 q=gl_PointCoord*2.-1.;
  float r=dot(q,q);
  if(r>1.)discard;
  if(v_kind>1.5 && v_kind<2.5){gl_FragColor=vec4(v_color,exp(-r*4.)*v_alpha);return;}
  float z=sqrt(1.-r);
  vec3 n=vec3(q,z);
  float diffuse=max(0.,dot(n,normalize(vec3(-.55,-.65,1.))));
  float highlight=pow(max(0.,dot(n,normalize(vec3(-.35,-.45,1.)))),22.);
  vec3 color=v_color*(.32+diffuse*.88)+vec3(.9,.86,.8)*highlight*.38;
  if(v_kind>2.5){
    float mesh=min(abs(fract((q.x+q.y*.58)*5.)-.5),min(abs(fract((q.x-q.y*.58)*5.)-.5),abs(fract(q.y*5.8)-.5)));
    color*=.65+.35*smoothstep(.015,.065,mesh);
  }
  color*=.96+.04*sin(q.x*73.+q.y*53.+v_seed*11.);
  gl_FragColor=vec4(color,v_alpha*smoothstep(0.,.15,1.-r));
}`;

/** A clustered XYZ graph, with a shared clock for camera, mutations and the terminal UI. */
export function mountKnowledgeEngine(canvas: HTMLCanvasElement, options: KnowledgeOptions): KnowledgeController {
  const abort = new AbortController();
  let disposed = false, paused = options.initialPaused ?? false;
  let time = 0, speed = 1, fps = 60, frameCount = 0, raf = 0;
  let lastTime = performance.now(), lastNotify = -1;
  let width = 1, height = 1, dpr = 1;
  let yaw = 0, pitch = 0, zoom = 1;
  let selected: number | undefined;
  let pose = { yaw: 0, pitch: 0, x: 0, y: 0, zoom: 1 };
  let focus: { world: Vec3; cluster: number; yaw: number; pitch: number; record: string | null } | undefined;
  let transition: { from: typeof pose; elapsed: number } | undefined;
  let pointer: { id: number; x: number; y: number; startX: number; startY: number } | undefined;
  const nodes: Node[] = [];
  pages.forEach((page, cluster) => nodes.push({ position: [...page.position], color: [3, 6].includes(cluster) ? ivory : coral, size: cluster === 6 ? 36 : cluster === 3 ? 30 : 23, cluster, seed: random(cluster), kind: [3, 6].includes(cluster) ? 3 : 0 }));
  nodes.push({ position: source, color: gold, size: 26, cluster: -1, seed: .5, kind: 0 });
  for (let i = nodes.length; i < 3206; i++) {
    const cluster = i < 55 ? -1 : (i - 55) % pages.length;
    const center = cluster < 0 ? source : pages[cluster]!.position;
    const angle = random(i * 7) * Math.PI * 2;
    const az = random(i * 11) * 2 - 1;
    const radius = Math.pow(random(i * 17), .6) * (cluster < 0 ? .85 : 1.16);
    const ring = Math.sqrt(1 - az * az) * radius;
    const stretch = 1 + random(cluster + 64) * .3;
    const dx = Math.cos(angle) * ring * .46, dy = Math.sin(angle) * ring * .34 * stretch;
    const turn = cluster * .51;
    const position: Vec3 = [center[0] + dx * Math.cos(turn) - dy * Math.sin(turn), center[1] + dx * Math.sin(turn) + dy * Math.cos(turn), center[2] + az * radius * .48];
    const n = random(i + 43);
    const color: Color = cluster < 0 || n > .83 ? ivory : n > .20 ? [.98, .42 + random(i + 3) * .12, .48] : [.64, .24, .28];
    const sizeSeed = random(i + 572);
    const size = cluster < 0 ? 1.8 + random(i) * 2 : sizeSeed > .975 ? 11 + random(i) * 5 : sizeSeed > .90 ? 5.5 + random(i) * 3 : sizeSeed > .53 ? 2.9 + random(i) * 2.8 : 1.5 + random(i) * 1.8;
    nodes.push({ position, color, size, cluster, seed: random(i + 91), kind: 0 });
  }
  const pack = (node: Node, size = node.size, kind = node.kind, color = node.color) => [...node.position, ...color, size, node.cluster, node.seed, kind];
  const pointData = new Float32Array(nodes.flatMap(node => pack(node)));
  const edges: [number, number][] = [];
  const edgeKeys = new Set<string>();
  function connect(a: number, b: number) {
    if (a === b) return;
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key); edges.push([a, b]);
  }
  // Neighbour links create small, irregular polyhedra instead of all-to-all starbursts.
  for (let i = 13; i < nodes.length; i++) {
    const node = nodes[i]!;
    const candidates: { id: number; distance: number }[] = [];
    for (let offset = -9; offset <= 9; offset++) {
      const id = i + offset * 12;
      if (id < 13 || id >= nodes.length || id === i || nodes[id]!.cluster !== node.cluster) continue;
      const other = nodes[id]!.position;
      candidates.push({ id, distance: Math.hypot(...node.position.map((v, axis) => v - other[axis]!)) });
    }
    candidates.sort((a, b) => a.distance - b.distance);
    candidates.slice(0, 5).forEach(other => connect(i, other.id));
    if (i % 7 === 0) connect(i, node.cluster < 0 ? 12 : node.cluster);
  }
  for (let a = 0; a < 12; a++) {
    connect(a, (a + 1) % 12); connect(a, (a + 4) % 12);
    for (let n = 0; n < 16; n++) connect(55 + a + n * 12, 55 + (a + 4) % 12 + n * 12);
  }
  for (let n = 0; n < 42; n++) connect(12, 13 + n);
  // Keep the displayed edge totals faithful to the actual geometry at both endpoints.
  for (let i = 55; i < nodes.length; i++) {
    const cluster = nodes[i]!.cluster;
    const limit = i < 2788 ? 2788 : nodes.length;
    const row = Math.floor(random(i + 817) * Math.floor((limit - 55 - cluster) / 12));
    connect(i, 55 + cluster + row * 12);
  }
  const baseEdges = edges.filter(edge => Math.max(...edge) < 2788).slice(0, 10240);
  const addedEdges = edges.filter(edge => Math.max(...edge) >= 2788).slice(0, 1243);
  edges.splice(0, edges.length, ...baseEdges, ...addedEdges);
  // Growth order keeps links from referring to records that have not been written yet.
  edges.sort((a, b) => Math.max(...a) - Math.max(...b));
  const lineData = new Float32Array(edges.flatMap(([a, b]) => [a, b].flatMap(id => {
    const node = nodes[id]!;
    const bridge = nodes[a]!.cluster !== nodes[b]!.cluster;
    const color: Color = bridge || node.cluster < 0 ? [.51, .45, .40] : [.65, .31, .34];
    return pack(node, bridge ? .04 : .09 + random(a + b) * .09, 1, color);
  })));
  const halos = new Float32Array(pages.flatMap((_, i) => pack(nodes[i]!, 180 + i % 3 * 22, 2, [.67, .15, .2])));
  const transient: number[] = [];
  const traceLines: number[] = [];
  const gl = canvas.getContext('webgl', { alpha: false, antialias: true, powerPreference: 'high-performance' });
  let gpuReady = false;
  let program: WebGLProgram | null = null;
  const buffers: WebGLBuffer[] = [];
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const attributes: number[] = [];
  let fallbackCanvas: HTMLCanvasElement | undefined;
  let ctx: CanvasRenderingContext2D | null = null;
  const originalOpacity = canvas.style.opacity;
  function releaseGpu() {
    if (!gl) return;
    buffers.forEach(buffer => gl.deleteBuffer(buffer)); buffers.length = 0;
    if (program) gl.deleteProgram(program); program = null; gpuReady = false;
  }
  function fallback() {
    gpuReady = false;
    if (fallbackCanvas || ctx) return;
    if (gl) {
      fallbackCanvas = document.createElement('canvas');
      fallbackCanvas.className = 'ke-fallback';
      Object.assign(fallbackCanvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
      fallbackCanvas.setAttribute('aria-hidden', 'true');
      canvas.insertAdjacentElement('afterend', fallbackCanvas);
      canvas.style.opacity = '0';
      ctx = fallbackCanvas.getContext('2d', { alpha: false });
    } else ctx = canvas.getContext('2d', { alpha: false });
  }
  if (gl) {
    const shaders: WebGLShader[] = [];
    try {
      const compile = (type: number, source: string) => {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Shader unavailable');
        shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed');
        return shader;
      };
      program = gl.createProgram();
      if (!program) throw new Error('Program unavailable');
      gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program link failed');
      for (const name of ['resolution', 'camera', 'state', 'dpr', 'line', 'active', 'check']) uniforms[name] = gl.getUniformLocation(program, `u_${name}`);
      ['position', 'color', 'style'].forEach(name => attributes.push(gl.getAttribLocation(program!, `a_${name}`)));
      [pointData, lineData, halos, new Float32Array(), new Float32Array()].forEach(data => {
        const buffer = gl.createBuffer(); if (!buffer) throw new Error('Buffer unavailable');
        buffers.push(buffer); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      });
      gpuReady = true;
    } catch { releaseGpu(); fallback(); }
    finally { shaders.forEach(shader => gl.deleteShader(shader)); }
  } else fallback();

  function snapshot(): KnowledgeSnapshot {
    const t = time % 24;
    const phase = t < 2.5 ? 'READER' : t < 10.6 ? 'LIBRARIAN' : t < 14.4 ? 'ANSWER' : 'CHECKER';
    const committed = clamp(Math.floor((t - 2.5) / .675) + 1, 0, 12);
    const conflicts = t >= 18 ? 1 : 0;
    const workPage = phase === 'READER' ? 7 : phase === 'LIBRARIAN' ? patchOrder[Math.min(11, committed - 1)]! : 3;
    const activePage = selected ?? workPage;
    const stageLabel = phase === 'READER' ? 'RAW / LOCKED' : phase === 'LIBRARIAN' ? 'PATCH' : phase === 'ANSWER' ? 'SAVED' : conflicts ? 'CONFLICT' : 'AUDIT';
    const command = phase === 'READER' ? '> reader ingest raw/source-042.pdf --read-only' : phase === 'LIBRARIAN' ? '> librarian patch wiki/ --source 042' : phase === 'ANSWER' ? '> librarian answer --save wiki/answer-013.md' : conflicts ? '> checker flag routines.md --notify @you' : '> checker audit --nightly --source-links';
    const nodeCount = 2788 + Math.floor(committed / 12 * 418);
    return { time, paused, speed, fps: Math.round(fps), phase, stageLabel, activePage, workPage, inspecting: selected !== undefined, inspectedRecord: focus?.record ?? null, committed,
      nodeCount, linkCount: activeEdges(nodeCount),
      scanned: phase === 'CHECKER' ? Math.min(128, Math.floor((t - 14.4) / 8 * 128)) : 0, conflicts,
      command, claim: focus?.record === 'raw/source-042.pdf' ? 'Keep every original untouched' : focus?.record === 'raw/source-017.pdf' ? 'Review runs weekly on Monday' : conflicts && activePage === 3 ? 'DAILY ≠ WEEKLY · verify source' : phase === 'ANSWER' && selected === undefined ? 'Review runs daily at 02:00' : pages[activePage]!.claim,
      azimuth: pose.yaw * 180 / Math.PI, zoom: pose.zoom };
  }
  function camera() {
    if (focus) {
      // Freeze the tour orientation and track the picked XYZ anchor while the workflow continues.
      pose = { yaw: focus.yaw + yaw, pitch: focus.pitch + pitch, x: 0, y: 0, zoom: 2.45 * zoom };
      const anchor = project(focus.world, focus.cluster);
      const scale = Math.min(width / 4.25, height / 3.95) * pose.zoom;
      pose.x = (width * (width < 560 ? .5 : .42) - anchor.x) / scale;
      pose.y = (height * (width < 560 ? .28 : .52) - anchor.y) / scale;
      if (transition) {
        const blend = ease(transition.elapsed / .65);
        const from = transition.from;
        pose = { yaw: from.yaw + (pose.yaw - from.yaw) * blend, pitch: from.pitch + (pose.pitch - from.pitch) * blend,
          x: from.x + (pose.x - from.x) * blend, y: from.y + (pose.y - from.y) * blend, zoom: from.zoom + (pose.zoom - from.zoom) * blend };
        if (blend === 1) transition = undefined;
      }
      return;
    }
    const t = time % 24;
    const keyframes = [
      [-.16, -.05, 0, 0, 1], [.14, .03, -.03, .02, 1.13], [-.26, -.04, -.14, .50, 1.30],
      [.19, .05, -.10, .05, 1.15], [.28, .02, -.52, .08, 1.30], [-.24, -.04, .02, 0, 1.05],
      [.12, .06, -.06, .60, 1.04], [.32, .01, -.08, .35, 1.02], [-.16, -.05, 0, 0, 1],
    ];
    const k = Math.floor(t / 3), blend = ease((t % 3 - 1.9) / 1.1);
    const a = keyframes[k]!, b = keyframes[k + 1]!;
    const v = a.map((n, i) => n + (b[i]! - n) * blend);
    pose = { yaw: v[0]! + Math.sin(t * .3) * .025 + yaw, pitch: v[1]! + pitch, x: v[2]!, y: v[3]!, zoom: v[4]! * zoom };
  }
  function project(world: Vec3, cluster = -1): { x: number; y: number; scale: number; depth: number } {
    let [x, y] = world;
    const z = world[2];
    if (cluster >= 0) { x += Math.sin(time * .36 + cluster * 1.71) * .025; y += Math.cos(time * .31 + cluster * 1.13) * .018; }
    x *= clamp(width / height / 1.27, 1, 1.75);
    y -= .06;
    const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw), cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
    const rx = x * cy + z * sy, rz = z * cy - x * sy;
    const ry = y * cp - rz * sp, depth = y * sp + rz * cp;
    const perspective = 6 / Math.max(2, 6 - depth);
    const scale = Math.min(width / 4.25, height / 3.95) * pose.zoom;
    return { x: width * .55 + pose.x * scale + rx * scale * perspective, y: height * .45 + pose.y * scale + ry * scale * perspective, scale: perspective * scale / 150, depth };
  }
  function overlays(state: KnowledgeSnapshot) {
    const labels: KnowledgeLabel[] = pages.map((page, i) => {
      const p = project(page.position, i);
      const status = state.workPage === i && state.phase !== 'READER' ? ` / ${state.stageLabel}` : '';
      return { id: `page-${i}`, text: page.name + status, x: p.x + 13 * p.scale, y: p.y - 8 * p.scale, scale: clamp(p.scale, .7, 1.3), active: state.activePage === i, visible: p.x > -30 && p.x < width && p.y > 20 && p.y < height - 20, kind: 'page' };
    });
    const src = project(source);
    labels.push({ id: 'source-042', text: state.conflicts ? '042 / DAILY' : 'raw/source-042.pdf', x: src.x + 8, y: src.y + 18, scale: clamp(src.scale, .7, 1.2), active: state.phase === 'READER' || !!state.conflicts, visible: state.phase === 'READER' || !!state.conflicts, kind: 'source' });
    for (let i = 0; i < 48; i++) {
      const node = nodes[100 + i * 53]!;
      const p = project(node.position, node.cluster);
      labels.push({ id: `detail-${i}`, text: `${pages[node.cluster]!.name.slice(0, 3)}:${String(1040 + i * 29)}`, x: p.x + 4, y: p.y - 3, scale: clamp(p.scale, .65, 1.1), active: false, visible: p.x > 20 && p.x < width - 35 && p.y > 20 && p.y < height - 25, kind: 'detail' });
    }
    if (state.conflicts || focus?.record === 'raw/source-017.pdf') {
      const p = project([.74, -.76, .75]);
      labels.push({ id: 'source-017', text: '017 / WEEKLY', x: p.x + 10, y: p.y + 5, scale: clamp(p.scale, .7, 1.2), active: true, visible: true, kind: 'source' });
    }
    const p = focus ? project(focus.world, focus.cluster) : state.phase === 'READER' && !state.inspecting ? project(source) : project(pages[state.activePage]!.position, state.activePage);
    options.onOverlay?.({ labels, anchor: { x: p.x, y: p.y, visible: p.x > -60 && p.x < width + 60 && p.y > -50 && p.y < height + 50 } });
  }
  function activeEdges(count: number) {
    let low = 0, high = edges.length;
    while (low < high) { const mid = (low + high) >>> 1; if (Math.max(...edges[mid]!) < count) low = mid + 1; else high = mid; }
    return low;
  }
  function transients(state: KnowledgeSnapshot) {
    transient.length = 0; traceLines.length = 0;
    const active = nodes[state.workPage]!;
    const pulse = .5 + .5 * Math.sin(time * 7);
    if (state.phase === 'LIBRARIAN' || state.phase === 'CHECKER') {
      for (let ring = 0; ring < 3; ring++) {
        const r = .12 + ((time * .45 + ring / 3) % 1) * .33;
        for (let k = 0; k < 64; k++) {
          const angle = k / 64 * Math.PI * 2;
          const p: Vec3 = [active.position[0] + Math.cos(angle) * r, active.position[1] + Math.sin(angle) * r, active.position[2] + Math.sin(angle * 2) * .03];
          transient.push(...pack({ position: p, color: state.conflicts ? gold : [.9, .43, .36], size: 1.3 + pulse * .7, cluster: state.workPage, seed: k / 64, kind: 0 }));
        }
      }
    }
    // A few distinct packets travel to the current document rather than lighting all links.
    for (let i = 0; i < 9; i++) {
      const t = (time * .75 + i / 9) % 1;
      const from = nodes[(state.workPage + 4 + i) % 12]!.position;
      const p = from.map((v, axis) => v + (active.position[axis]! - v) * t) as Vec3;
      transient.push(...pack({ position: p, color: state.conflicts ? gold : [.95, .74, .63], size: 2.4, cluster: -1, seed: i, kind: 0 }));
    }
    if (state.conflicts || focus?.record === 'raw/source-017.pdf') {
      const otherSource: Vec3 = [.74, -.76, .75];
      transient.push(...pack({ position: otherSource, color: gold, size: 22, cluster: -1, seed: 1, kind: 0 }));
      for (const origin of state.conflicts ? [source, otherSource] : []) {
        traceLines.push(...pack({ position: origin, color: gold, size: .5, cluster: -1, seed: 0, kind: 1 }), ...pack({ ...active, color: gold, size: .5, kind: 1 }));
        const t = time * .8 % 1;
        transient.push(...pack({ position: origin.map((v, axis) => v + (active.position[axis]! - v) * t) as Vec3, color: gold, size: 4, cluster: -1, seed: 0, kind: 0 }));
      }
    }
  }
  function drawGpu(state: KnowledgeSnapshot) {
    if (!gl || !program || !gpuReady) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(.055, .069, .064, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(uniforms.resolution, width, height); gl.uniform4f(uniforms.camera, pose.yaw, pose.pitch, pose.x, pose.zoom);
    gl.uniform3f(uniforms.state, time, pose.y, 0); gl.uniform1f(uniforms.dpr, dpr);
    gl.uniform1f(uniforms.active, state.workPage); gl.uniform1f(uniforms.check, state.conflicts);
    function draw(index: number, count: number, line = false) {
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buffers[index]!);
      if (index >= 3) gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array(index === 3 ? transient : traceLines), gl!.DYNAMIC_DRAW);
      [3, 3, 4].forEach((size, i) => { gl!.enableVertexAttribArray(attributes[i]!); gl!.vertexAttribPointer(attributes[i]!, size, gl!.FLOAT, false, stride * 4, [0, 12, 24][i]!); });
      gl!.uniform1f(uniforms.line, line ? 1 : 0); gl!.drawArrays(line ? gl!.LINES : gl!.POINTS, 0, count);
    }
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    draw(2, pages.length); draw(1, activeEdges(state.nodeCount) * 2, true); draw(4, traceLines.length / stride, true);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true); gl.depthFunc(gl.LEQUAL);
    draw(0, state.nodeCount); draw(3, transient.length / stride);
    gl.disable(gl.DEPTH_TEST);
  }
  const sphereSprites = [coral, ivory, gold].map(color => {
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 48;
    const context = sprite.getContext('2d')!;
    const gradient = context.createRadialGradient(16, 13, 1, 24, 24, 24);
    const rgb = color.map(v => Math.round(v * 255));
    gradient.addColorStop(0, '#f2e5db'); gradient.addColorStop(.35, `rgb(${rgb.join(',')})`); gradient.addColorStop(1, `rgb(${rgb.map(v => Math.round(v * .2)).join(',')})`);
    context.fillStyle = gradient; context.beginPath(); context.arc(24, 24, 23, 0, Math.PI * 2); context.fill();
    return sprite;
  });
  function drawFallback(state: KnowledgeSnapshot) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    ctx.fillStyle = '#0e1210'; ctx.fillRect(0, 0, width, height);
    const projected = nodes.slice(0, state.nodeCount).map(node => ({ ...project(node.position, node.cluster), node }));
    ctx.strokeStyle = '#794148'; ctx.lineWidth = .45; ctx.globalAlpha = .35; ctx.beginPath();
    for (let i = 0; i < activeEdges(state.nodeCount); i += 2) { const [a, b] = edges[i]!; const p = projected[a]!, q = projected[b]!; ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); }
    ctx.stroke();
    ctx.strokeStyle = '#d7ba54'; ctx.globalAlpha = .6; ctx.beginPath();
    for (let i = 0; i < traceLines.length; i += stride * 2) {
      const p = project([traceLines[i]!, traceLines[i + 1]!, traceLines[i + 2]!], traceLines[i + 7]!);
      const q = project([traceLines[i + stride]!, traceLines[i + stride + 1]!, traceLines[i + stride + 2]!], traceLines[i + stride + 7]!);
      ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
    projected.sort((a, b) => a.depth - b.depth);
    for (const p of projected) {
      if (p.x < -30 || p.x > width + 30 || p.y < -30 || p.y > height + 30) continue;
      const kind = p.node.cluster === -1 || (state.conflicts && p.node.cluster === state.workPage && p.node.size >= 18) ? 2 : p.node.color[1] > .6 ? 1 : 0;
      const size = p.node.size * p.scale;
      ctx.globalAlpha = clamp(.75 + p.depth * .16, .38, 1);
      ctx.drawImage(sphereSprites[kind]!, p.x - size / 2, p.y - size / 2, size, size);
    }
    for (let i = 0; i < transient.length; i += stride) {
      const p = project([transient[i]!, transient[i + 1]!, transient[i + 2]!], transient[i + 7]!);
      const size = transient[i + 6]! * p.scale;
      ctx.globalAlpha = .85; ctx.drawImage(sphereSprites[state.conflicts || transient[i + 6]! >= 18 ? 2 : 1]!, p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
  function render() { camera(); const state = snapshot(); transients(state); if (gpuReady) drawGpu(state); else drawFallback(state); overlays(state); }
  function notify() { options.onUpdate(snapshot()); }
  function resize() {
    const rect = canvas.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height); dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    if (fallbackCanvas) { fallbackCanvas.width = canvas.width; fallbackCanvas.height = canvas.height; }
    render();
  }
  function schedule() { if (!disposed && (!paused || transition) && !raf) raf = requestAnimationFrame(frame); }
  function frame(now: number) {
    raf = 0; if (disposed) return;
    const dt = Math.max(0, (now - lastTime) / 1000); lastTime = now;
    if (!paused) { time += dt * speed; if (dt > .003 && dt < .25) fps += (1 / dt - fps) * .04; }
    const moving = !!transition;
    if (transition) transition.elapsed += dt;
    frameCount++; render();
    if (moving || time - lastNotify >= .08) { notify(); lastNotify = time; }
    schedule();
  }
  function updateView() {
    render(); notify();
    if (paused && !transition && raf) { cancelAnimationFrame(raf); raf = 0; }
    schedule();
  }
  function focusOn(index: number, world = pages[index]!.position, cluster = index, record: string | null = null) {
    const from = { ...pose };
    selected = index;
    focus = { world: [...world], cluster, yaw: pose.yaw - yaw, pitch: pose.pitch - pitch, record };
    zoom = 1;
    transition = matchMedia('(prefers-reduced-motion: reduce)').matches ? undefined : { from, elapsed: 0 };
    lastTime = performance.now(); updateView();
  }
  function resetView() {
    yaw = pitch = 0; zoom = 1; selected = undefined; focus = transition = undefined;
    updateView();
  }
  canvas.addEventListener('pointerdown', event => { if (event.button !== 0) return; pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY }; canvas.setPointerCapture(event.pointerId); }, { signal: abort.signal });
  canvas.addEventListener('pointermove', event => { if (!pointer || pointer.id !== event.pointerId) return; yaw += (event.clientX - pointer.x) * .005; pitch = clamp(pitch + (event.clientY - pointer.y) * .003, -.6, .6); pointer.x = event.clientX; pointer.y = event.clientY; updateView(); }, { signal: abort.signal });
  canvas.addEventListener('pointerup', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) < 5) {
      const rect = canvas.getBoundingClientRect();
      let closest = -1, depth = -Infinity;
      const count = snapshot().nodeCount;
      for (let i = 0; i < count; i++) {
        const node = nodes[i]!; const p = project(node.position, node.cluster);
        const distance = Math.hypot(p.x - event.clientX + rect.left, p.y - event.clientY + rect.top);
        if (distance <= Math.max(5, node.size * p.scale / 2 + 2) && p.depth > depth) { closest = i; depth = p.depth; }
      }
      const otherSource: Vec3 = [.74, -.76, .75];
      const other = project(otherSource);
      if ((snapshot().conflicts || focus?.record === 'raw/source-017.pdf') && Math.hypot(other.x - event.clientX + rect.left, other.y - event.clientY + rect.top) < 11 * other.scale + 2 && other.depth > depth) {
        focusOn(3, otherSource, -1, 'raw/source-017.pdf');
      } else if (closest >= 0) {
        const node = nodes[closest]!;
        const record = node.cluster < 0 ? 'raw/source-042.pdf' : closest < 12 ? null : `${pages[node.cluster]!.name.slice(0, 3)}:${String(closest).padStart(4, '0')}`;
        focusOn(node.cluster < 0 ? 7 : node.cluster, node.position, node.cluster, record);
      }
    }
    pointer = undefined; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); updateView();
  }, { signal: abort.signal });
  canvas.addEventListener('pointercancel', () => { pointer = undefined; }, { signal: abort.signal });
  canvas.addEventListener('wheel', event => { event.preventDefault(); zoom = clamp(zoom * Math.exp(-event.deltaY * .001), .65, 2); updateView(); }, { passive: false, signal: abort.signal });
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') yaw -= .10; if (event.key === 'ArrowRight') yaw += .10;
    if (event.key === 'ArrowUp') pitch = clamp(pitch - .08, -.6, .6); if (event.key === 'ArrowDown') pitch = clamp(pitch + .08, -.6, .6);
    if (event.key === '+' || event.key === '=') zoom = clamp(zoom * 1.1, .65, 2); if (event.key === '-') zoom = clamp(zoom / 1.1, .65, 2);
    if (event.key === '0') { resetView(); return; }
    updateView();
  }, { signal: abort.signal });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); releaseGpu(); fallback(); resize(); notify(); }, { signal: abort.signal });
  document.addEventListener('visibilitychange', () => { lastTime = performance.now(); }, { signal: abort.signal });
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  resize(); notify(); schedule();
  return {
    setPaused(value) { if (disposed) return; paused = value; lastTime = performance.now(); if (paused && !transition && raf) { cancelAnimationFrame(raf); raf = 0; } render(); notify(); schedule(); },
    setSpeed(value) { if (disposed || !Number.isFinite(value)) return; speed = clamp(value, .25, 3); notify(); },
    restart() { if (disposed) return; time = 0; lastNotify = -1; selected = undefined; focus = transition = undefined; lastTime = performance.now(); updateView(); },
    resetView() { if (!disposed) resetView(); },
    selectPage(index) { if (disposed || !Number.isInteger(index) || index < 0 || index >= pages.length) return; focusOn(index); },
    getSnapshot: snapshot,
    debug() {
      const probes: Vec3[] = [[.3, .3, -.9], [.3, .3, .9], source, pages[6]!.position];
      return { renderer: gpuReady ? 'webgl' : 'canvas2d', nodeCount: snapshot().nodeCount, linkCount: activeEdges(snapshot().nodeCount), depthRange: { min: Math.min(...nodes.map(n => n.position[2])), max: Math.max(...nodes.map(n => n.position[2])) }, rotation: { yaw, pitch, zoom }, focus: focus ? { world: [...focus.world] as Vec3, screen: [project(focus.world, focus.cluster).x, project(focus.world, focus.cluster).y] as [number, number], progress: transition ? clamp(transition.elapsed / .65, 0, 1) : 1 } : null, disposed, activeFrame: raf !== 0, frameCount,
        probes: probes.map(world => { const p = project(world); return { world: [...world] as Vec3, screen: [p.x, p.y] as [number, number], depth: p.depth }; }) };
    },
    dispose() { if (disposed) return; disposed = true; if (raf) cancelAnimationFrame(raf); raf = 0; observer.disconnect(); abort.abort(); releaseGpu(); fallbackCanvas?.remove(); canvas.style.opacity = originalOpacity; },
  };
}
