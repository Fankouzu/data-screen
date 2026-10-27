import { initialJevSnapshot, noise, STRAND_COUNT, type JevController, type JevOptions, type Vec3 } from './model';

const TAU = Math.PI * 2;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const rgb = (h: number) => {
  const f = (n: number) => { const k = (n + h / 30) % 12; return Math.round((.68 - .28 * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255); };
  return `${f(0)},${f(8)},${f(4)}`;
};
const colors = Array.from({ length: 360 }, (_, i) => rgb(i));
const strands = Array.from({ length: STRAND_COUNT }, (_, i) => {
  const angle = i * 2.399963229728653;
  const tube = noise(i + 76) * TAU;
  const radius = .60 + Math.cos(tube) * .20;
  const z = Math.sin(tube) * .18;
  return { angle, radius, z, length: .07 + noise(i + 19) ** 1.5 * .39, seed: noise(i + 45), hue: ((185 + angle / Math.PI * 180) % 360 + 360) % 360 };
});

export function mountJevEngine(canvas: HTMLCanvasElement, options: JevOptions): JevController {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  const ctx = context;
  const state = { ...initialJevSnapshot, paused: options.initialPaused ?? false };
  let width = 1, height = 1, dpr = 1, frame = 0, frameCount = 0, disposed = false;
  let lastTime = performance.now(), lastNotify = -1, lastFpsTime = lastTime, fpsFrames = 0;
  let yawOffset = 0, pitchOffset = 0, zoom = 1, reset = false;
  let pointer: { id: number; x: number; y: number } | undefined;
  let probes: { world: Vec3; screen: [number, number]; depth: number }[] = [];
  let depthRange = { min: 0, max: 0 };
  const abort = new AbortController();
  const signal = abort.signal;
  function notify() { options.onUpdate({ ...state }); }
  function angles() {
    return { yaw: (.60 + Math.cos(state.time * .19) * .13) + yawOffset, pitch: .20 + Math.cos(state.time * .65) * .09 + pitchOffset };
  }
  function project(world: Vec3) {
    const { yaw, pitch } = angles();
    const [x, y, z] = world;
    const xx = x * Math.cos(yaw) + z * Math.sin(yaw);
    const zz = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const yy = y * Math.cos(pitch) - zz * Math.sin(pitch);
    const depth = y * Math.sin(pitch) + zz * Math.cos(pitch);
    const roll = -.10;
    const px = xx * Math.cos(roll) - yy * Math.sin(roll), py = xx * Math.sin(roll) + yy * Math.cos(roll);
    const k = 3.8 / (3.8 + depth);
    const scale = Math.min((width - 42) / 2.35, (height - 36) / 2.65) * zoom;
    return { x: width * .52 + px * scale * k, y: height * .50 + py * scale * k, depth, k };
  }
  function grid() {
    ctx.fillStyle = '#060710'; ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * .5, height * .52, 0, width * .5, height * .52, height * .6);
    glow.addColorStop(0, '#141028'); glow.addColorStop(.65, '#090914'); glow.addColorStop(1, '#060710');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    ctx.lineWidth = .6; ctx.strokeStyle = '#20223170'; ctx.beginPath();
    for (let x = 32; x < width - 8; x += 24) { ctx.moveTo(x, 22); ctx.lineTo(x, height - 20); }
    for (let y = 22; y < height - 20; y += 24) { ctx.moveTo(32, y); ctx.lineTo(width - 8, y); }
    ctx.stroke(); ctx.strokeStyle = '#373943'; ctx.strokeRect(32.5, 22.5, width - 41, height - 43);
    ctx.font = '8px monospace'; ctx.fillStyle = '#767887';
    for (let i = 0; i <= 8; i++) {
      const y = 23 + (height - 44) * i / 8;
      ctx.fillText(`θ ${i * 45}°`, 2, y + 3);
      ctx.fillRect(29, y, 3, 1);
    }
    const scanY = 24 + ((state.time * 45 + height * .3) % (height - 48));
    ctx.strokeStyle = '#537a8b28'; ctx.beginPath(); ctx.moveTo(33, scanY); ctx.lineTo(width - 10, scanY); ctx.stroke();
    ctx.fillStyle = '#7398a9'; ctx.font = 'bold 8px monospace'; ctx.fillText(`SCAN Y ${Math.floor(scanY * 2)}`, width - 83, scanY - 5);
  }
  function draw() {
    grid();
    const t = state.time, rotation = t * .34, sweep = t * 1.35 + 1;
    const samples: typeof probes = [];
    let minDepth = Infinity, maxDepth = -Infinity;
    // Back-to-front ordering is fixed per frame, so occlusion follows the XYZ camera.
    const projected = strands.map((s, i) => {
      const a = s.angle + rotation;
      const pulse = Math.max(0, Math.cos(a - sweep)) ** 32;
      const length = s.length + pulse * .16 + Math.max(0, Math.sin(t * 6 + s.seed * 20)) ** 12 * .035;
      const ca = Math.cos(a), sa = Math.sin(a);
      const root: Vec3 = [ca * s.radius, sa * s.radius, s.z];
      const bend = .025 + pulse * .12;
      const tip: Vec3 = [Math.cos(a + bend) * (s.radius + length), Math.sin(a + bend) * (s.radius + length), s.z + Math.sin(s.angle * 3 + t) * .035];
      return { s, i, a, pulse, root, tip, p: project(root), q: project(tip) };
    }).sort((a, b) => b.p.depth - a.p.depth);
    ctx.lineWidth = .55;
    for (const { s, i, a, pulse, root, tip, p, q } of projected) {
      minDepth = Math.min(minDepth, p.depth); maxDepth = Math.max(maxDepth, p.depth);
      const hue = Math.floor(s.hue);
      const color = colors[hue]!;
      const visibility = clamp(.78 - p.depth * .32, .38, .98);
      ctx.strokeStyle = pulse > .48 ? `rgba(229,244,255,${visibility * (.33 + pulse * .55)})` : `rgba(${color},${visibility * (.21 + s.seed * .34)})`;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      const middle = project([root[0] + (tip[0] - root[0]) * .55 - Math.sin(a) * pulse * .025, root[1] + (tip[1] - root[1]) * .55 + Math.cos(a) * pulse * .025, root[2]]);
      ctx.quadraticCurveTo(middle.x, middle.y, q.x, q.y); ctx.stroke();
      ctx.fillStyle = i % 4 === 0 ? `rgba(224,235,248,${visibility * .82})` : `rgba(${color},${visibility * .94})`;
      // Dense points on the torus surface make the hollow ring a volume rather than a flat disk.
      for (let n = 0; n < 3; n++) {
        const spread = (n - 1) * .013;
        const point = project([root[0] + Math.cos(a + 1.57) * spread, root[1] + Math.sin(a + 1.57) * spread, root[2] + spread]);
        const size = (.75 + s.seed * 1.1) * point.k;
        ctx.fillRect(point.x, point.y, size, size);
      }
      const travel = (t * (1.5 + s.seed) + s.seed * 13) % 1;
      const remaining = 1 - travel;
      const packet = { x: remaining ** 2 * p.x + 2 * remaining * travel * middle.x + travel ** 2 * q.x, y: remaining ** 2 * p.y + 2 * remaining * travel * middle.y + travel ** 2 * q.y, k: p.k + (q.k - p.k) * travel };
      ctx.fillStyle = pulse > .35 || i % 2 === 0 ? `rgba(245,252,255,${visibility})` : `rgba(${color},${visibility})`;
      const dot = (.9 + s.seed * 1.4 + pulse * .5) * q.k;
      ctx.fillRect(q.x - dot / 2, q.y - dot / 2, dot, dot);
      if (i % 3 === 0) ctx.fillRect(packet.x, packet.y, 1.15 * packet.k, 1.15 * packet.k);
      if (i % 325 === 0) samples[i / 325] = { world: root, screen: [p.x, p.y], depth: p.depth };
    }
    probes = samples; depthRange = { min: minDepth, max: maxDepth };
    callout(t, rotation);
  }
  function callout(t: number, rotation: number) {
    const cycle = Math.floor(t / 4.8), progress = (t % 4.8) / 4.8;
    const opacity = Math.min(1, progress * 10 + .2, (1 - progress) * 10);
    const a = [2.3, 3.8, .65, 4.7][cycle % 4]! + rotation;
    const point = project([Math.cos(a) * .98, Math.sin(a) * .98, -.1]);
    const color = ['#d4ee7a', '#77e7ef', '#ec72e2', '#ff827c'][cycle % 4]!;
    const boxW = Math.min(183, width * .52), boxH = 55;
    const boxX = clamp(point.x + (point.x < width / 2 ? -155 : 24), 36, width - boxW - 13);
    const boxY = clamp(point.y + (point.y < height / 2 ? -90 : 26), 30, height - boxH - 26);
    ctx.save(); ctx.globalAlpha = opacity;
    const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 15);
    glow.addColorStop(0, '#ffffffdd'); glow.addColorStop(.18, color); glow.addColorStop(1, '#ffffff00');
    ctx.fillStyle = glow; ctx.fillRect(point.x - 15, point.y - 15, 30, 30);
    ctx.strokeStyle = color; ctx.lineWidth = .85; ctx.beginPath(); ctx.arc(point.x, point.y, 5, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(boxX + boxW * .5, boxY + boxH * .5); ctx.stroke();
    ctx.fillStyle = '#080a13ed'; ctx.fillRect(boxX, boxY, boxW, boxH); ctx.strokeRect(boxX, boxY, boxW, boxH); ctx.fillStyle = color; ctx.fillRect(boxX, boxY, 2, boxH);
    ctx.font = 'bold 9px monospace'; ctx.fillText(['DECISION d-4417 · NOUL', 'LEAD l-0871 · SCORE', 'GATE g-0065 · NOUL', 'ROUTE r-0128 · CHOICE'][cycle % 4]!, boxX + 8, boxY + 14, boxW - 16);
    ctx.fillStyle = '#f3f2f8'; ctx.font = '10px monospace'; ctx.fillText(['phishing? → YES · conf 0.97', 'heat 0.88 → book_call', 'safe_to_run 0.62 < 0.85', 'intent → write · conf 0.91'][cycle % 4]!, boxX + 8, boxY + 30, boxW - 16);
    ctx.fillStyle = '#aaa9bb'; ctx.font = '8px monospace'; ctx.fillText(['184 MS · quarantine', 'calendar path · 96 MS', '→ HUMAN REVIEW', 'route committed · 82 MS'][cycle % 4]!, boxX + 8, boxY + 44, boxW - 16);
    ctx.restore();
  }
  function updateMetrics() {
    const t = state.time;
    state.decisions = Math.round(9786 + Math.sin(t * .6) * 218);
    state.load = 380 + Math.sin(t * .7) * 17 + Math.cos(t * 2.3) * 5;
    state.gated = Math.round(116 + Math.sin(t * .8 + 1) * 11);
    state.escalations = 4 + Math.sin(t * 1.2) * 1.6;
    state.confidence = 71 + Math.cos(t * .21) * 3;
    state.tokens = 1.86 + Math.sin(t * .85) * .13;
    state.latency = Math.round(210 + Math.cos(t * 1.5) * 16);
    const a = angles(); state.yaw = a.yaw * 180 / Math.PI; state.pitch = a.pitch * 180 / Math.PI; state.zoom = zoom;
  }
  function tick(now: number) {
    if (disposed) return;
    frame = 0;
    const dt = Math.max(0, (now - lastTime) / 1000); lastTime = now;
    if (!state.paused && !document.hidden) state.time += dt * state.speed;
    if (reset) {
      const f = 1 - Math.exp(-Math.min(dt, .1) * 9);
      yawOffset *= 1 - f; pitchOffset *= 1 - f; zoom += (1 - zoom) * f;
      if (Math.abs(yawOffset) + Math.abs(pitchOffset) + Math.abs(zoom - 1) < .001) { yawOffset = 0; pitchOffset = 0; zoom = 1; reset = false; }
    }
    updateMetrics(); draw(); frameCount++; fpsFrames++;
    if (now - lastFpsTime > 750) { state.fps = fpsFrames * 1000 / (now - lastFpsTime); fpsFrames = 0; lastFpsTime = now; }
    if (now - lastNotify >= 80) { notify(); lastNotify = now; }
    if (!state.paused || reset) frame = requestAnimationFrame(tick);
  }
  function wake() { if (!disposed && !frame) { lastTime = performance.now(); frame = requestAnimationFrame(tick); } }
  function repaint() { draw(); updateMetrics(); notify(); }
  function resize() {
    const bounds = canvas.getBoundingClientRect(); width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; pointer = { id: e.pointerId, x: e.clientX, y: e.clientY }; reset = false; canvas.setPointerCapture(e.pointerId); }, { signal });
  canvas.addEventListener('pointermove', e => {
    if (!pointer || pointer.id !== e.pointerId) return;
    yawOffset = clamp(yawOffset + (e.clientX - pointer.x) * .005, -1.2, 1.2);
    pitchOffset = clamp(pitchOffset + (e.clientY - pointer.y) * .004, -.8, .8);
    pointer.x = e.clientX; pointer.y = e.clientY; repaint();
  }, { signal });
  const release = () => { pointer = undefined; };
  canvas.addEventListener('pointerup', release, { signal }); canvas.addEventListener('pointercancel', release, { signal }); canvas.addEventListener('lostpointercapture', release, { signal });
  canvas.addEventListener('wheel', e => { e.preventDefault(); reset = false; zoom = clamp(zoom * Math.exp(-e.deltaY * .001), .65, 1.65); repaint(); }, { passive: false, signal });
  canvas.addEventListener('keydown', e => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '=']; if (!keys.includes(e.key)) return;
    e.preventDefault(); reset = false;
    if (e.key === 'ArrowLeft') yawOffset -= .08; if (e.key === 'ArrowRight') yawOffset += .08;
    if (e.key === 'ArrowUp') pitchOffset -= .06; if (e.key === 'ArrowDown') pitchOffset += .06;
    if (e.key === '+' || e.key === '=') zoom = clamp(zoom + .1, .65, 1.65); if (e.key === '-') zoom = clamp(zoom - .1, .65, 1.65);
    yawOffset = clamp(yawOffset, -1.2, 1.2); pitchOffset = clamp(pitchOffset, -.8, .8); repaint();
  }, { signal });
  document.addEventListener('visibilitychange', () => { lastTime = performance.now(); }, { signal });
  resize(); updateMetrics(); notify(); if (!state.paused) wake();
  return {
    setPaused(value) { state.paused = value; lastTime = performance.now(); if (value && !reset) { cancelAnimationFrame(frame); frame = 0; } else wake(); notify(); },
    setSpeed(value) { if (Number.isFinite(value)) state.speed = clamp(value, .25, 4); notify(); },
    restart() { state.time = 0; lastTime = performance.now(); yawOffset = 0; pitchOffset = 0; zoom = 1; reset = false; updateMetrics(); draw(); notify(); },
    resetView() { reset = true; wake(); },
    getSnapshot: () => ({ ...state }),
    debug: () => ({ renderer: 'canvas2d', disposed, activeFrame: !disposed && frame !== 0, frameCount, strandCount: STRAND_COUNT, particleCount: STRAND_COUNT * 4, depthRange, rotation: { yaw: yawOffset, pitch: pitchOffset, zoom }, probes, sweepAngle: state.time * 1.35 + 1 }),
    dispose() { if (disposed) return; disposed = true; cancelAnimationFrame(frame); observer.disconnect(); abort.abort(); },
  };
}
