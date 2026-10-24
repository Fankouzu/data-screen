import { CYCLE_DURATION, feeds, type NeuralController, type NeuralDiagnostics, type NeuralOptions, type NeuralPhase, type NeuralSnapshot, type NeuralMode } from './model';

const TAU = Math.PI * 2;
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const smooth = (n: number) => { const v = clamp(n, 0, 1); return v * v * (3 - 2 * v); };
interface Vertex { x: number; y: number; z: number; cluster: number; shell: boolean; seed: number }
interface Edge { a: number; b: number; shell: boolean }

/** All geometry remains in XYZ space; only this final renderer projects to the canvas. */
export function mountMarketNeural(canvas: HTMLCanvasElement, options: NeuralOptions): NeuralController {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('The neural scene requires Canvas 2D.');
  const ctx = context;
  const abort = new AbortController();
  const vertices: Vertex[] = [];
  const edges: Edge[] = [];
  const antennaIndices: number[] = [];
  const groups: number[][] = [];
  const counts = [960, 420, 300];
  let disposed = false;
  let paused = options.initialPaused ?? false;
  let mode: NeuralMode = 'auto';
  let speed = 1;
  let time = 0;
  let separation = 1;
  let width = 1;
  let height = 1;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  let lastUpdate = -1;
  let fps = 60;
  let frames = 0;
  let yaw = 0;
  let pitch = 0;
  let zoom = 1;
  let pointer: { id: number; x: number; y: number } | null = null;

  // Precompute local nearest-neighbour topology once, never in the animation loop.
  for (let cluster = 0; cluster < 3; cluster++) {
    for (const shell of [false, true]) {
      const count = shell ? Math.round(counts[cluster]! * .28) : counts[cluster]!;
      const group: number[] = [];
      for (let i = 0; i < count; i++) {
        const y = 1 - 2 * (i + .5) / count;
        const theta = i * Math.PI * (3 - Math.sqrt(5)) + cluster * .9 + (shell ? .46 : 0);
        const r = Math.sqrt(1 - y * y);
        const index = vertices.length;
        vertices.push({ x: Math.cos(theta) * r, y, z: Math.sin(theta) * r, cluster, shell, seed: i * 1.618 + cluster * 47 });
        group.push(index);
        if (!shell && i % 6 === 0) antennaIndices.push(index);
      }
      const seen = new Set<string>();
      for (const a of group) {
        const va = vertices[a]!;
        const near = group.filter(b => b !== a).map(b => {
          const vb = vertices[b]!;
          return { b, d: (va.x - vb.x) ** 2 + (va.y - vb.y) ** 2 + (va.z - vb.z) ** 2 };
        }).sort((a, b) => a.d - b.d).slice(0, shell ? 4 : 6);
        for (const { b } of near) {
          const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
          if (!seen.has(key)) { seen.add(key); edges.push({ a, b, shell }); }
        }
      }
      groups.push(group);
    }
  }
  const n = vertices.length;
  const world = new Float32Array(n * 3);
  const projected = new Float32Array(n * 4);
  const centres = new Float32Array(9);
  const antennaTips = new Float32Array(antennaIndices.length * 3);
  const edgeBins: number[][] = Array.from({ length: 16 }, () => []);
  const nodeBins: number[][] = Array.from({ length: 8 }, () => []);
  const radii = [1, .64, .43];
  const glow = document.createElement('canvas');
  glow.width = glow.height = 48;
  const glowCtx = glow.getContext('2d')!;
  const gradient = glowCtx.createRadialGradient(24, 24, 0, 24, 24, 24);
  gradient.addColorStop(0, '#fffdd5'); gradient.addColorStop(.12, '#ffffbf');
  gradient.addColorStop(.3, '#e8e88388'); gradient.addColorStop(1, '#cedf6000');
  glowCtx.fillStyle = gradient; glowCtx.fillRect(0, 0, 48, 48);
  let sceneScale = 1;
  let centreX = 0;
  let centreY = 0;
  let cosY = 1; let sinY = 0; let cosP = 1; let sinP = 0;
  const projection = (x: number, y: number, z: number): [number, number, number] => {
    const rx = x * cosY + z * sinY;
    const rz = z * cosY - x * sinY;
    const ry = y * cosP - rz * sinP;
    const depth = y * sinP + rz * cosP;
    const scale = 4.8 / (4.8 - depth);
    return [centreX + rx * sceneScale * scale, centreY + ry * sceneScale * scale, scale];
  };
  function phase(): NeuralPhase {
    if (mode === 'merged') return 'UNIFIED';
    if (mode === 'split') return 'DISTRIBUTED';
    const t = time % CYCLE_DURATION;
    return t < 4 ? 'DISTRIBUTED' : t < 7 ? 'FUSION' : t < 17 ? 'UNIFIED' : t < 21 ? 'HEDGE' : 'DISTRIBUTED';
  }
  function targetSeparation() {
    if (mode !== 'auto') return mode === 'split' ? 1 : 0;
    const t = time % CYCLE_DURATION;
    return t < 4 ? 1 : t < 7 ? 1 - smooth((t - 4) / 3) : t < 17 ? 0 : t < 21 ? smooth((t - 17) / 4) : 1;
  }
  function snapshot(): NeuralSnapshot {
    return {
      time, paused, speed, mode, phase: phase(), separation,
      pnl: 312016 + Math.round(time * 2.8 + Math.sin(time * .8) * 14),
      btc: 81871 + Math.round(Math.sin(time * .38) * 42 + Math.sin(time * 1.2) * 7),
      probability: .57 + Math.sin(time * .47) * .036,
      edge: 1.78 + Math.sin(time * .33) * .68,
      orders: 3181 + Math.floor(time * 1.7), latency: 23.25 + Math.sin(time * .79) * 2.2,
      fps: Math.round(fps), camera: { yaw, pitch, zoom },
    };
  }
  function notify() { options.onUpdate(snapshot()); }
  function geometry() {
    const autoYaw = time * .105;
    const autoPitch = Math.sin(time * .19) * .09;
    cosY = Math.cos(yaw); sinY = Math.sin(yaw); cosP = Math.cos(pitch); sinP = Math.sin(pitch);
    sceneScale = Math.min(width / 3.65, height / 2.72) * zoom * (1 + (1 - separation) * .13);
    centreX = width * .49;
    centreY = height * .51;
    centres.set([-.38 * separation, .01, 0, 1.05 * separation, -.43 * separation, -.13 * separation, .85 * separation, .76 * separation, .18 * separation]);
    for (let i = 0; i < n; i++) {
      const v = vertices[i]!;
      const c = v.cluster * 3;
      const localYaw = autoYaw * (v.cluster === 1 ? -.79 : 1) + v.cluster * 1.7;
      const cy = Math.cos(localYaw); const sy = Math.sin(localYaw);
      const cp = Math.cos(autoPitch + v.cluster * .23); const sp = Math.sin(autoPitch + v.cluster * .23);
      const x = v.x * cy + v.z * sy;
      const z0 = v.z * cy - v.x * sy;
      const y = v.y * cp - z0 * sp;
      const z = v.y * sp + z0 * cp;
      const radius = 1 + (radii[v.cluster]! - 1) * separation + v.cluster * .005 * (1 - separation);
      const noise = Math.sin(v.x * 8 + time * 1.1) * Math.cos(v.y * 7 - time * .7) * .025 + Math.sin(v.seed * 3.7 + time * 1.6) * .009;
      const shellNoise = v.shell ? .035 + Math.sin(v.seed + time * 1.3) * .04 : 0;
      const r = radius * (1 + noise + shellNoise + Math.sin(time * 1.7) * .008);
      const wx = centres[c]! + x * r;
      const wy = centres[c + 1]! + y * r;
      const wz = centres[c + 2]! + z * r;
      world[i * 3] = wx; world[i * 3 + 1] = wy; world[i * 3 + 2] = wz;
      const rx = wx * cosY + wz * sinY;
      const rz = wz * cosY - wx * sinY;
      const ry = wy * cosP - rz * sinP;
      const depth = wy * sinP + rz * cosP;
      const perspective = 4.8 / (4.8 - depth);
      projected[i * 4] = centreX + rx * sceneScale * perspective;
      projected[i * 4 + 1] = centreY + ry * sceneScale * perspective;
      projected[i * 4 + 2] = depth;
      projected[i * 4 + 3] = perspective;
    }
  }
  function drawThreads() {
    for (let f = 0; f < feeds.length; f++) {
      const yy = height * (.13 + f * .146);
      const end = projection(-.38 * separation - .8, (f - 2.5) * .2, .25);
      const color = feeds[f]!.color;
      for (let strand = 0; strand < 2; strand++) {
        const y1 = yy + strand * 4;
        const controlY = yy + Math.sin(time * .4 + f + strand) * 14;
        ctx.beginPath(); ctx.moveTo(0, y1); ctx.bezierCurveTo(width * .12, controlY, end[0] - width * .1, end[1] + (strand - .5) * 20, end[0], end[1]);
        ctx.strokeStyle = color; ctx.globalAlpha = .25; ctx.lineWidth = .6; ctx.stroke();
        for (let dot = 0; dot < 3; dot++) {
          const t = (time * .19 + dot / 3 + f * .137 + strand * .18) % 1;
          const a = 1 - t;
          const x = 3 * a * a * t * width * .12 + 3 * a * t * t * (end[0] - width * .1) + t * t * t * end[0];
          const y = a ** 3 * y1 + 3 * a * a * t * controlY + 3 * a * t * t * (end[1] + (strand - .5) * 20) + t ** 3 * end[1];
          ctx.globalAlpha = .12; ctx.fillStyle = color; ctx.fillRect(x - 5, y - 5, 10, 10);
          ctx.globalAlpha = .85; ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        }
      }
    }
    const start = projection(.65 + separation * .3, .1, .2);
    for (let j = 0; j < 7; j++) {
      const y = height * (.09 + j * .13);
      ctx.beginPath(); ctx.moveTo(start[0], start[1]); ctx.bezierCurveTo(width * .85, start[1], width * .84, y, width, y);
      ctx.globalAlpha = .15; ctx.strokeStyle = j % 2 ? '#94d3e1' : '#e4df8b'; ctx.lineWidth = .65; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawNecks() {
    if (separation < .03) return;
    ctx.lineWidth = .65;
    for (let cluster = 1; cluster < 3; cluster++) {
      for (let strand = 0; strand < 15; strand++) {
        ctx.beginPath();
        for (let step = 0; step <= 24; step++) {
          const t = step / 24;
          const a = strand / 15 * TAU + time * .14;
          const narrow = .1 + Math.abs(t - .5) * .22;
          const wiggle = Math.sin(t * 19 + strand * 3.3 + time * 2) * .025;
          const x = centres[0]! + .73 + (centres[cluster * 3]! - radii[cluster]! * .67 - centres[0]! - .73) * t;
          const y = centres[cluster * 3 + 1]! * t + Math.cos(a) * (narrow + wiggle);
          const z = centres[cluster * 3 + 2]! * t + Math.sin(a) * narrow;
          const point = projection(x, y, z);
          if (step === 0) ctx.moveTo(point[0], point[1]); else ctx.lineTo(point[0], point[1]);
        }
        ctx.strokeStyle = strand % 3 ? '#a5e7ff' : '#eee9b8'; ctx.globalAlpha = separation * .23; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  function draw() {
    geometry();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#060b12'; ctx.fillRect(0, 0, width, height);
    drawThreads(); drawNecks();
    for (const bucket of edgeBins) bucket.length = 0;
    for (const bucket of nodeBins) bucket.length = 0;
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i]!;
      const z = (projected[edge.a * 4 + 2]! + projected[edge.b * 4 + 2]!) * .5;
      const bin = Math.floor(clamp((z + 1.3) / 2.6, 0, .999) * 8);
      edgeBins[bin + (edge.shell ? 8 : 0)]!.push(i);
    }
    for (let bin = 0; bin < 8; bin++) {
      for (let shell = 0; shell < 2; shell++) {
        ctx.beginPath();
        for (const i of edgeBins[bin + shell * 8]!) {
          const edge = edges[i]!; const a = edge.a * 4; const b = edge.b * 4;
          ctx.moveTo(projected[a]!, projected[a + 1]!); ctx.lineTo(projected[b]!, projected[b + 1]!);
        }
        ctx.globalAlpha = shell ? .13 + (1 - Math.abs(bin - 3.5) / 4) * .34 : .035 + (bin / 7) ** 2 * .82;
        ctx.strokeStyle = shell ? '#9fe7ff' : bin < 4 ? '#bfc9b8' : '#f7f1d2';
        ctx.lineWidth = shell ? .62 : .52 + bin * .035; ctx.stroke();
      }
    }
    for (let i = 0; i < n; i++) nodeBins[Math.floor(clamp((projected[i * 4 + 2]! + 1.3) / 2.6, 0, .999) * 8)]!.push(i);
    for (let bin = 0; bin < 8; bin++) {
      ctx.globalAlpha = .11 + bin * .12; ctx.fillStyle = bin > 4 ? '#f9f3aa' : '#97bfd0'; ctx.beginPath();
      const size = bin > 5 ? 1.9 : 1;
      for (const i of nodeBins[bin]!) ctx.rect(projected[i * 4]! - size / 2, projected[i * 4 + 1]! - size / 2, size, size);
      ctx.fill();
    }
    for (let a = 0; a < antennaIndices.length; a++) {
      const i = antennaIndices[a]!; const v = vertices[i]!; const c = v.cluster * 3;
      const pulse = .5 + .5 * Math.sin(time * 3.7 + v.seed * 2.1);
      const extension = .055 + (.5 + .5 * Math.sin(v.seed * 9.1)) ** 3 * .24 + pulse * .035;
      const wx = world[i * 3]!; const wy = world[i * 3 + 1]!; const wz = world[i * 3 + 2]!;
      const factor = 1 + extension;
      const tip = projection(centres[c]! + (wx - centres[c]!) * factor, centres[c + 1]! + (wy - centres[c + 1]!) * factor, centres[c + 2]! + (wz - centres[c + 2]!) * factor);
      antennaTips[a * 3] = tip[0]; antennaTips[a * 3 + 1] = tip[1]; antennaTips[a * 3 + 2] = tip[2];
      const depthAlpha = clamp((projected[i * 4 + 2]! + 1.4) / 2.4, .12, 1);
      ctx.globalAlpha = depthAlpha * (.4 + pulse * .55); ctx.strokeStyle = '#f5eca1'; ctx.lineWidth = .65 + pulse * .8;
      ctx.beginPath(); ctx.moveTo(projected[i * 4]!, projected[i * 4 + 1]!); ctx.lineTo(tip[0], tip[1]); ctx.stroke();
      const size = (5 + pulse * 9) * tip[2]; ctx.globalAlpha = depthAlpha * (.4 + pulse * .6);
      ctx.drawImage(glow, tip[0] - size / 2, tip[1] - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    frames++;
  }
  function schedule() { if (!disposed && !raf) raf = requestAnimationFrame(tick); }
  function tick(now: number) {
    raf = 0;
    if (disposed) return;
    const dt = last ? clamp((now - last) / 1000, 0, .05) : 0;
    last = now;
    if (!paused) {
      time += dt * speed;
      if (dt > 0) fps += (Math.min(120, 1 / dt) - fps) * .035;
      const target = targetSeparation();
      separation += (target - separation) * Math.min(1, dt * 4.5);
    }
    draw();
    if (paused || now - lastUpdate >= 100) { notify(); lastUpdate = now; }
    if (!paused) schedule();
  }
  function resize() {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    schedule();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  const eventOptions = { signal: abort.signal };
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true });
  }, eventOptions);
  canvas.addEventListener('pointermove', (event) => {
    if (!pointer || pointer.id !== event.pointerId) return;
    yaw += (event.clientX - pointer.x) * .007; pitch = clamp(pitch + (event.clientY - pointer.y) * .006, -.9, .9);
    pointer.x = event.clientX; pointer.y = event.clientY; schedule();
  }, eventOptions);
  const release = () => { pointer = null; };
  canvas.addEventListener('pointerup', release, eventOptions); canvas.addEventListener('pointercancel', release, eventOptions); canvas.addEventListener('lostpointercapture', release, eventOptions);
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); zoom = clamp(zoom * Math.exp(-event.deltaY * .001), .65, 1.5); schedule(); }, { ...eventOptions, passive: false });
  canvas.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') yaw -= .12; if (event.key === 'ArrowRight') yaw += .12;
    if (event.key === 'ArrowUp') pitch = clamp(pitch - .1, -.9, .9); if (event.key === 'ArrowDown') pitch = clamp(pitch + .1, -.9, .9);
    if (event.key === '+' || event.key === '=') zoom = clamp(zoom + .08, .65, 1.5); if (event.key === '-') zoom = clamp(zoom - .08, .65, 1.5);
    if (event.key === '0') { yaw = 0; pitch = 0; zoom = 1; }
    schedule();
  }, eventOptions);
  resize(); notify();
  return {
    setPaused(value) { if (disposed) return; paused = value; last = 0; if (raf) cancelAnimationFrame(raf); raf = 0; notify(); if (!paused) schedule(); },
    setSpeed(value) { if (disposed) return; speed = clamp(Number.isFinite(value) ? value : 1, .25, 4); notify(); },
    setMode(value) { if (disposed) return; mode = value; if (paused) separation = targetSeparation(); notify(); schedule(); },
    restart() { if (disposed) return; time = 0; separation = targetSeparation(); last = 0; notify(); schedule(); },
    resetView() { if (disposed) return; yaw = 0; pitch = 0; zoom = 1; schedule(); },
    getDiagnostics(): NeuralDiagnostics {
      let min = Infinity; let max = -Infinity;
      for (let i = 0; i < n; i++) { min = Math.min(min, world[i * 3 + 2]!); max = Math.max(max, world[i * 3 + 2]!); }
      return { ...snapshot(), nodes: n, edges: edges.length, clusters: 3, depthRange: { min, max }, renderedFrames: frames, activeFrame: Boolean(raf),
        probes: [0, 127, 481, 950, groups[2]![80]!, groups[4]![120]!].map(i => ({ world: { x: world[i * 3]!, y: world[i * 3 + 1]!, z: world[i * 3 + 2]! }, screen: { x: projected[i * 4]!, y: projected[i * 4 + 1]!, scale: projected[i * 4 + 3]! } })), };
    },
    dispose() { if (disposed) return; disposed = true; if (raf) cancelAnimationFrame(raf); raf = 0; observer.disconnect(); abort.abort(); pointer = null; glow.width = glow.height = 0; },
  };
}
