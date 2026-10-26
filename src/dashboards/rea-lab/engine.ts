import { CYCLE_SECONDS, stages, type Vec3, type ReaController, type ReaOptions, type ReaSnapshot } from './model';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const noise = (seed: number) => { const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
const ease = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const colors = [['#57401c', '#885218', '#a94725', '#b96b3d', '#a72e42', '#bb1551'], ['#164e45', '#007e77', '#116f94', '#284f8f', '#373377', '#6744a1']];
const codes = [['m0-31 read', 'r12 xor', 'm1-04 draft', 'b0-52 cmp', 'm0-07 call', 'a3-11 push', 'm1-16 ret', 'r8 mov', 'm0-18 graft'], ['ck-11 pass', 'ck-03 pass', 'ck-02 pass', 'v12 08:1', 'ck-16 pass', 'd-0412 ok', 'ck-07 bounce', 'c8-21 pass', 'r9 return']];
interface Point { x: number; y: number; scale: number; depth: number }
interface Particle { base: Vec3; side: number; color: number; radius: number; seed: number }
interface Pose { x: number; y: number; zoom: number; yaw: number; pitch: number }
const keys: (Pose & { t: number })[] = [
  { t: 0, x: 0, y: 0, zoom: 1, yaw: -.05, pitch: .025 },
  { t: 2, x: 0, y: 0, zoom: 1, yaw: -.05, pitch: .025 },
  { t: 3.3, x: -1.25, y: 0, zoom: 1.65, yaw: .11, pitch: -.02 },
  { t: 5.2, x: -1.25, y: 0, zoom: 1.65, yaw: .11, pitch: -.02 },
  { t: 6.6, x: 1.25, y: 0, zoom: 1.65, yaw: -.10, pitch: .015 },
  { t: 8.2, x: 1.25, y: 0, zoom: 1.65, yaw: -.10, pitch: .015 },
  { t: 9.7, x: 0, y: 0, zoom: 1.07, yaw: .035, pitch: .015 },
  { t: 11.5, x: 0, y: 0, zoom: 1.07, yaw: .035, pitch: .015 },
  { t: 12.7, x: 0, y: 0, zoom: 1.20, yaw: -.015, pitch: .015 },
  { t: 14.6, x: 0, y: .22, zoom: .89, yaw: .015, pitch: 0 },
  { t: 16.8, x: 0, y: .22, zoom: .89, yaw: .015, pitch: 0 },
  { t: 18, x: 0, y: 0, zoom: 1, yaw: -.05, pitch: .025 },
];

/** Two spatial networks share a clock: disorder resolves into aligned instruction streams. */
export function mountReaLab(canvas: HTMLCanvasElement, options: ReaOptions): ReaController {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Canvas 2D is unavailable');
  const ctx = context;
  const abort = new AbortController();
  let disposed = false, paused = options.initialPaused ?? false;
  let time = 0, speed = 1, fps = 60, raf = 0, frameCount = 0;
  let last = performance.now(), lastNotify = -1;
  let width = 1, height = 1, dpr = 1;
  let yaw = 0, pitch = 0, zoom = 1, offsetX = 0, offsetY = 0;
  let pose: Pose = { ...keys[0]! };
  let returning: { from: Pose; elapsed: number } | undefined;
  let pointer: { id: number; x: number; y: number } | undefined;
  const perSide = 440;
  const particles: Particle[] = Array.from({ length: perSide * 2 }, (_, i) => {
    const side = Math.floor(i / perSide), sign = side ? 1 : -1;
    return { side, base: [sign * (1.05 + noise(i * 7) * 1.85), (noise(i * 11) - .5) * 2.35, (noise(i * 17) - .5) * 1.35], color: i % 6, radius: noise(i + 92) > .93 ? 4 + noise(i) * 4 : .4 + noise(i) * 1.5, seed: noise(i + 57) };
  });
  const links: [number, number][] = [];
  for (let i = 0; i < particles.length; i++) {
    const base = Math.floor(i / perSide) * perSide;
    for (let k = 0; k < 3; k++) links.push([i, base + Math.floor(noise(i * 13 + k * 73) * perSide)]);
  }
  const sprites = colors.flat().map(color => {
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 40;
    const c = sprite.getContext('2d')!;
    const halo = c.createRadialGradient(20, 20, 0, 20, 20, 20);
    halo.addColorStop(0, color + 'b8'); halo.addColorStop(.28, color + '75'); halo.addColorStop(1, color + '00');
    c.fillStyle = halo; c.fillRect(0, 0, 40, 40);
    c.fillStyle = color; c.beginPath(); c.arc(20, 20, 4.7, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffffffb0'; c.beginPath(); c.arc(18.5, 18.5, 1.8, 0, Math.PI * 2); c.fill();
    return sprite;
  });
  const projected: Point[] = particles.map(() => ({ x: 0, y: 0, scale: 1, depth: 0 }));
  function snapshot(): ReaSnapshot {
    const t = time % CYCLE_SECONDS;
    const phaseIndex = stages.reduce((index, stage, i) => t >= stage.start ? i : index, 0);
    const lifted = Math.min(1536, Math.floor(t / 14 * 1536));
    const progress = ease((t - 6.5) / 7.5);
    const sync = Math.round(ease((t - 9.2) / 5.5) * 100);
    const flagged = Math.round(ease((t - 6) / 8) * 329);
    const decompiled = Math.min(lifted - flagged, Math.round(progress * 1207));
    return { time, paused, speed, fps: Math.round(fps), phase: stages[phaseIndex]!.phase, phaseIndex, lifted, decompiled,
      flagged, sync, gap: Number((.42 * (1 - sync / 100)).toFixed(2)),
      flagRate: Number((38 - progress * 16.6).toFixed(1)), crossings: decompiled + flagged,
      inFlight: Math.floor(7 + noise(Math.floor(t * 4)) * 23), zoom: pose.zoom, azimuth: pose.yaw * 180 / Math.PI };
  }
  function tourCamera(): Pose {
    const t = time % CYCLE_SECONDS;
    const index = Math.max(0, keys.findIndex((key, i) => i < keys.length - 1 && t >= key.t && t < keys[i + 1]!.t));
    const a = keys[index]!, b = keys[index + 1]!;
    const blend = ease((t - a.t) / (b.t - a.t));
    return { x: mix(a.x, b.x, blend), y: mix(a.y, b.y, blend), zoom: mix(a.zoom, b.zoom, blend), yaw: mix(a.yaw, b.yaw, blend), pitch: mix(a.pitch, b.pitch, blend) };
  }
  function camera() {
    const tour = tourCamera();
    pose = { x: tour.x + offsetX, y: tour.y + offsetY, zoom: tour.zoom * zoom, yaw: tour.yaw + yaw, pitch: tour.pitch + pitch };
    if (returning) {
      const amount = ease(returning.elapsed / .7), from = returning.from;
      pose = { x: mix(from.x, pose.x, amount), y: mix(from.y, pose.y, amount), zoom: mix(from.zoom, pose.zoom, amount), yaw: mix(from.yaw, pose.yaw, amount), pitch: mix(from.pitch, pose.pitch, amount) };
      if (amount === 1) returning = undefined;
    }
  }
  function project(world: Vec3): Point {
    const stretch = clamp(width / height / 1.15, 1, 1.85);
    const [wx, wy, wz] = world;
    const x = wx * stretch, cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw), cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
    const rx = x * cy + wz * sy, rz = wz * cy - x * sy;
    const ry = wy * cp - rz * sp, depth = wy * sp + rz * cp;
    const perspective = 6 / Math.max(2.5, 6 - depth);
    const scale = Math.min(width / 4.05, height / 3.6) * pose.zoom;
    return { x: width * .51 + (rx * perspective - pose.x * stretch) * scale, y: height * .44 + (ry * perspective - pose.y) * scale, scale: scale / 180 * perspective, depth };
  }
  function bandX(side: number, y: number) { return (side ? 1 : -1) * (.67 + .24 * y * y); }
  function line(a: Point, b: Point) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  function cloud(state: ReaSnapshot) {
    const aligned = ease(state.sync / 100);
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i]!, sign = particle.side ? 1 : -1;
      const drift = Math.sin(time * .7 + particle.seed * 80) * .045;
      const y = mix(particle.base[1] + drift, particle.base[1] * .20, aligned);
      const x = mix(particle.base[0], sign * (2.15 + particle.seed * 1.4), aligned);
      projected[i] = project([x, y, particle.base[2] * (1 - aligned * .55)]);
    }
    // Sparse broad washes live behind the fine geometry, keeping the white field open.
    for (let side = 0; side < 2; side++) {
      const origin = project([(side ? 1 : -1) * 2.0, .05, -.2]);
      const radius = Math.max(1, height * .32 * pose.zoom);
      const wash = ctx.createRadialGradient(origin.x, origin.y, 1, origin.x, origin.y, radius);
      wash.addColorStop(0, side ? '#15b6be23' : '#e9a07925'); wash.addColorStop(1, '#ffffff00');
      ctx.fillStyle = wash; ctx.fillRect(0, 0, width, height);
    }
    ctx.lineWidth = .65;
    for (let side = 0; side < 2; side++) {
      const offset = side * perSide, sign = side ? 1 : -1;
      for (let color = 0; color < 6; color++) {
        ctx.strokeStyle = colors[side]![color]!;
        ctx.globalAlpha = .23 * (1 - aligned * .95); ctx.beginPath();
        for (let i = offset * 3 + color; i < (offset + perSide) * 3; i += 6) {
          const [a, b] = links[i]!; line(projected[a]!, projected[b]!);
        }
        ctx.stroke();
        ctx.globalAlpha = .27 + aligned * .17; ctx.beginPath();
        for (let i = color; i < perSide; i += 6) {
          const y = (i / (perSide - 1) - .5) * 3.12;
          const endpoint = project([bandX(side, y) + sign * .22, y, 0]);
          const chaotic = projected[offset + (i * 37) % perSide]!;
          const orderly = project([sign * (3.25 + noise(i) * .5), (noise(i + 4) - .5) * .3, (noise(i + 15) - .5) * .35]);
          line({ ...chaotic, x: mix(chaotic.x, orderly.x, aligned), y: mix(chaotic.y, orderly.y, aligned) }, endpoint);
        }
        ctx.stroke();
      }
      // Visible agents travel down the outer connection strands in 3D.
      for (let i = 0; i < 42; i++) {
        const y = (i / 41 - .5) * 2.9, progress = (time * (.18 + noise(i) * .08) + noise(i + side * 53)) % 1;
        const from: Vec3 = [sign * 3.0, Math.sin(i * 2.4) * .75 * (1 - aligned), Math.cos(i * 1.7) * .55];
        const to: Vec3 = [bandX(side, y) + sign * .25, y, 0];
        const p = project(from.map((value, axis) => mix(value, to[axis]!, progress)) as Vec3);
        const size = (14 + noise(i * 3) * 22) * p.scale;
        ctx.globalAlpha = .75; ctx.drawImage(sprites[side * 6 + i % 6]!, p.x - size / 2, p.y - size / 2, size, size);
      }
    }
    for (let i = 0; i < particles.length; i += 3) {
      const p = projected[i]!, particle = particles[i]!;
      if (p.x < -25 || p.x > width + 25 || p.y < -25 || p.y > height + 25) continue;
      const size = particle.radius * 5 * p.scale;
      ctx.globalAlpha = .42 * (1 - aligned * .65);
      ctx.drawImage(sprites[particle.side * 6 + particle.color]!, p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
  function spectrum(side: number, state: ReaSnapshot) {
    const sign = side ? 1 : -1, count = 300, aligned = state.sync / 100;
    const phase = time * .23 + side * (1 - aligned) * 1.7;
    const bars: { a: Point; b: Point; color: number; radius: number; tip: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const y = (i / (count - 1) - .5) * 3.12;
      const envelope = Math.pow(Math.sin(i / (count - 1) * Math.PI), .5);
      const wave = .25 + .20 * Math.sin(y * 5.2 + phase) + .12 * Math.sin(y * 12.6 - phase * .7) + .035 * Math.sin(i * 2.7 + Math.floor(time * 7) * .3);
      const length = (.08 + Math.max(.03, wave) * envelope) * (1 + aligned * .28);
      const a = project([bandX(side, y) - sign * .025, y, 0]);
      const b = project([bandX(side, y) - sign * length, y, Math.sin(i * .2) * .035]);
      bars.push({ a, b, color: Math.floor((Math.sin(y * 2.2 + phase * .2) * .5 + .5) * 5), radius: (9 + noise(i * 7) * 13) * b.scale, tip: i % 5 === 0 });
    }
    ctx.strokeStyle = side ? '#162139' : '#3e2413'; ctx.globalAlpha = .82;
    ctx.lineWidth = Math.max(.85, .95 * project([0, 0, 0]).scale); ctx.beginPath();
    for (const bar of bars) line(bar.a, bar.b);
    ctx.stroke();
    for (let color = 0; color < 6; color++) {
      ctx.strokeStyle = colors[side]![color]!; ctx.globalAlpha = .88; ctx.lineWidth = .6; ctx.beginPath();
      for (const bar of bars) if (bar.color === color) line({ ...bar.a, y: bar.a.y - .55 }, { ...bar.b, x: mix(bar.a.x, bar.b.x, .88), y: bar.b.y - .55 });
      ctx.stroke();
    }
    ctx.globalAlpha = .78;
    for (const { b: p, color, radius, tip } of bars) if (tip) {
      ctx.drawImage(sprites[side * 6 + color]!, p.x - radius / 2, p.y - radius / 2, radius, radius);
      ctx.fillStyle = side ? '#20213c' : '#402218'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(.55, 1.1 * p.scale), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function ribbon(side: number) {
    const sign = side ? 1 : -1, segments = 100;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const y = -1.60 + i / segments * 3.20, p = project([bandX(side, y), y, .015]);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    for (let i = segments; i >= 0; i--) {
      const y = -1.60 + i / segments * 3.20, p = project([bandX(side, y) + sign * .25, y, .015]); ctx.lineTo(p.x, p.y);
    }
    ctx.closePath(); ctx.fillStyle = '#ffffffef'; ctx.fill();
    ctx.lineWidth = .8; ctx.strokeStyle = side ? '#23715c' : '#79542d'; ctx.stroke();
    ctx.beginPath(); ctx.strokeStyle = '#939399'; ctx.globalAlpha = .65; ctx.lineWidth = .5;
    for (let i = 0; i < 120; i++) {
      const y = -1.57 + i / 119 * 3.14, x = bandX(side, y);
      line(project([x + sign * .015, y, .02]), project([x + sign * (i % 5 === 0 ? .05 : .028), y, .02]));
    }
    ctx.stroke(); ctx.globalAlpha = 1;
    for (let i = 0; i < 42; i++) {
      const y = -1.53 + i / 41 * 3.06;
      const p = project([bandX(side, y) + sign * .145, y, .025]);
      const text = codes[side]![(i + Math.floor(time * .65)) % codes[side]!.length]!;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-sign * Math.atan(y * .36));
      ctx.font = `${Math.max(4, 5.8 * p.scale)}px Menlo,Consolas,monospace`; ctx.textAlign = 'center';
      ctx.fillStyle = i % 8 === 0 ? (side ? '#55418c' : '#513711') : '#5c5861';
      ctx.fillText(text, 0, 0); ctx.restore();
    }
    // Progress markers run around the curved instruction lanes.
    for (let i = 0; i < 3; i++) {
      const y = (((time * .15 + i / 3 + side * .21) % 1) - .5) * 2.9;
      ctx.beginPath();
      for (let j = 0; j <= 18; j++) {
        const row = y + j / 18 * .27, p = project([bandX(side, row) + sign * .23, row, .04]);
        if (!j) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = colors[side]![i * 2]!; ctx.lineWidth = Math.max(2, 3.2 * project([0, y, 0]).scale); ctx.stroke();
    }
  }
  function handoff(state: ReaSnapshot) {
    const align = state.sync / 100;
    const p = project([Math.sin(time * .8) * .09 * (1 - align), .15 + Math.cos(time * .6) * .06, .25]);
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.font = `bold ${Math.max(5, 6 * p.scale)}px Menlo,Consolas,monospace`; ctx.textAlign = 'center'; ctx.fillStyle = '#5a4912';
    ctx.fillText('HANDOFF', 0, -19 * p.scale);
    ctx.save(); ctx.rotate(Math.PI / 4 + Math.sin(time * .7) * .25 * (1 - align));
    ctx.fillStyle = '#f9edbe'; ctx.shadowColor = '#c3a028'; ctx.shadowBlur = 8 * p.scale;
    const size = 8 * p.scale; ctx.fillRect(-size / 2, -size / 2, size, size); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#48390f'; ctx.lineWidth = 1; ctx.strokeRect(-size / 2, -size / 2, size, size); ctx.restore();
    ctx.fillStyle = '#302634'; ctx.fillText(`Δφ ${state.gap.toFixed(2)}`, 0, 22 * p.scale); ctx.restore();
    for (let i = 0; i < 24; i++) {
      const row = (noise(i * 3) - .5) * 2.85;
      const sign = i % 2 ? 1 : -1, amount = (time * (.38 + noise(i + 9) * .22) + noise(i)) % 1;
      const x = mix(sign * .6, -sign * .6, amount), z = Math.sin(i * 3.1) * .5;
      const point = project([x, row, z]), tail = project([x + sign * .10, row, z]);
      ctx.globalAlpha = .6; ctx.strokeStyle = i % 3 === 0 ? '#bf1a63' : i % 3 === 1 ? '#397e68' : '#59417a';
      ctx.lineWidth = .65; ctx.beginPath(); line(tail, point); ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(point.x, point.y, Math.max(.6, 1.5 * point.scale), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function labels() {
    if (pose.zoom > 1.4) return;
    for (let side = 0; side < 2; side++) {
      const p = project([(side ? 1 : -1) * 1.7, side ? .92 : -.92, .2]);
      const w = 102 * p.scale, h = 37 * p.scale;
      if (p.x < -w || p.x > width + w) continue;
      ctx.fillStyle = '#ffffffd9'; ctx.fillRect(p.x - w / 2, p.y, w, h);
      ctx.textAlign = 'left'; ctx.fillStyle = side ? '#175444' : '#76481c'; ctx.font = `bold ${12 * p.scale}px Menlo,Consolas,monospace`;
      ctx.fillText(side ? 'DECOMP' : 'DISASM', p.x - w / 2 + 6 * p.scale, p.y + 15 * p.scale);
      ctx.fillStyle = '#797473'; ctx.font = `${5.5 * p.scale}px Menlo,Consolas,monospace`;
      ctx.fillText(side ? '16 agents · reconstructing' : '64 agents · lifting', p.x - w / 2 + 6 * p.scale, p.y + 27 * p.scale);
    }
  }
  function render() {
    camera();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
    const state = snapshot();
    cloud(state); spectrum(0, state); spectrum(1, state); ribbon(0); ribbon(1); handoff(state); labels();
  }
  function notify() { options.onUpdate(snapshot()); }
  function resize() {
    const bounds = canvas.getBoundingClientRect(); width = Math.max(1, bounds.width); height = Math.max(1, bounds.height); dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); render();
  }
  function schedule() { if (!disposed && (!paused || returning) && !raf) raf = requestAnimationFrame(frame); }
  function frame(now: number) {
    raf = 0; if (disposed) return;
    const dt = Math.max(0, (now - last) / 1000); last = now;
    if (!paused) time += dt * speed;
    if (dt > .003 && dt < .25) fps += (1 / dt - fps) * .04;
    const moving = !!returning;
    if (returning) returning.elapsed += dt;
    frameCount++; render();
    if (moving || time - lastNotify >= .08) { notify(); lastNotify = time; }
    schedule();
  }
  function update() {
    render(); notify();
    if (paused && !returning && raf) { cancelAnimationFrame(raf); raf = 0; }
    schedule();
  }
  function interruptReturn() {
    if (!returning) return;
    const tour = tourCamera();
    yaw = pose.yaw - tour.yaw; pitch = pose.pitch - tour.pitch; zoom = pose.zoom / tour.zoom;
    offsetX = pose.x - tour.x; offsetY = pose.y - tour.y;
    returning = undefined;
  }
  function reset() {
    const from = { ...pose }; yaw = pitch = offsetX = offsetY = 0; zoom = 1;
    returning = matchMedia('(prefers-reduced-motion: reduce)').matches ? undefined : { from, elapsed: 0 };
    last = performance.now(); update();
  }
  canvas.addEventListener('pointerdown', event => { if (event.button !== 0) return; pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); }, { signal: abort.signal });
  canvas.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    interruptReturn();
    yaw += (event.clientX - pointer.x) * .004; pitch = clamp(pitch + (event.clientY - pointer.y) * .002, -.4, .4);
    pointer.x = event.clientX; pointer.y = event.clientY; returning = undefined; update();
  }, { signal: abort.signal });
  canvas.addEventListener('pointerup', event => { pointer = undefined; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); }, { signal: abort.signal });
  canvas.addEventListener('pointercancel', () => { pointer = undefined; }, { signal: abort.signal });
  canvas.addEventListener('wheel', event => { event.preventDefault(); interruptReturn(); zoom = clamp(zoom * Math.exp(-event.deltaY * .001), .65, 2); returning = undefined; update(); }, { passive: false, signal: abort.signal });
  canvas.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault(); interruptReturn();
    if (event.key === '0') { reset(); return; }
    if (event.key === 'ArrowLeft') yaw -= .09; if (event.key === 'ArrowRight') yaw += .09;
    if (event.key === 'ArrowUp') pitch = clamp(pitch - .06, -.4, .4); if (event.key === 'ArrowDown') pitch = clamp(pitch + .06, -.4, .4);
    if (event.key === '+' || event.key === '=') zoom = clamp(zoom * 1.1, .65, 2); if (event.key === '-') zoom = clamp(zoom / 1.1, .65, 2);
    update();
  }, { signal: abort.signal });
  document.addEventListener('visibilitychange', () => { last = performance.now(); }, { signal: abort.signal });
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  resize(); notify(); schedule();
  return {
    setPaused(value) { if (disposed) return; paused = value; last = performance.now(); update(); },
    setSpeed(value) { if (disposed || !Number.isFinite(value)) return; speed = clamp(value, .25, 3); notify(); },
    restart() { if (disposed) return; time = 0; lastNotify = -1; returning = undefined; yaw = pitch = offsetX = offsetY = 0; zoom = 1; last = performance.now(); update(); },
    resetView() { if (!disposed) reset(); },
    getSnapshot: snapshot,
    debug() {
      const worlds: Vec3[] = [[-.9, -.3, -.7], [-.9, -.3, .7], [.9, .3, -.7], [.9, .3, .7]];
      return { renderer: 'canvas2d', disposed, activeFrame: raf !== 0, frameCount, nodeCount: particles.length, linkCount: links.length + perSide * 2,
        depthRange: { min: -.7, max: .7 }, rotation: { yaw, pitch, zoom }, camera: { x: pose.x, y: pose.y, zoom: pose.zoom },
        probes: worlds.map(world => { const p = project(world); return { world, screen: [p.x, p.y] as [number, number], depth: p.depth }; }) };
    },
    dispose() { if (disposed) return; disposed = true; if (raf) cancelAnimationFrame(raf); raf = 0; observer.disconnect(); abort.abort(); },
  };
}
