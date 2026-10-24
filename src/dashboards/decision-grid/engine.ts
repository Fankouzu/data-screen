import { CASE_DURATION, cases, phases } from './model';
import type { GridController, GridDiagnostics, GridOptions, GridSnapshot } from './model';

type Point = { x: number; y: number; z: number };
type Projection = { x: number; y: number; scale: number; depth: number };
type Card = Point & { column: number; row: number; layer: number; tilt: number; seed: number };
type Filament = { points: Point[]; color: string; seed: number; bright: boolean };
const TAU = Math.PI * 2;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const hash = (n: number) => { const value = Math.sin(n * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };
const smooth = (p: number) => p * p * (3 - 2 * p);
const palette = ['#6feef5', '#ef69b8', '#b09bff', '#ffe979', '#a8dfff'];
const labels = [
  ['mail', 'comment', 'community', 'post', 'meeting', 'lead', 'browser state', 'ticket'],
  ['Choice · folder', 'Noul · worth_reply', 'Score · lead_quality', 'Choice · action', 'Score · viral_fit', 'Score · urgency', 'Choice · next_worker', 'Score · risk_level'],
  ['parallel questions', 'choice head', 'no generation', 'state encoder', 'score head', 'median latency', 'noul head', 'cost'],
  ['gate ≥ 0.85', 'quarantine', 'draft_reply', 'book_call', 'type_destination', 'draft_short', 'eng_oncall', 'review'],
  ['mail moved', 'LLM writes', 'calendar', 'code clicks', 'review folder', 'Slack ping', 'progress saved', 'human gate'],
];

/** A depth-sorted 3D scene projected onto a single, lifecycle-owned canvas. */
export function mountDecisionGrid(canvas: HTMLCanvasElement, options: GridOptions): GridController {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Decision Grid needs a Canvas 2D context.');
  const ctx = context;
  const abort = new AbortController();
  const listener = { signal: abort.signal };
  let width = 1, height = 1, pixelRatio = 1, fit = 1, horizontalFit = 1;
  let disposed = false, frame = 0, renderedFrames = 0, dirty = true;
  let time = 0, cycleTime = 0, selectedCase = 7, speed = 1;
  let paused = Boolean(options.initialPaused), lastTime = 0, lastReport = -1;
  let fps = 60, decisions = 562;
  let yaw = 0, pitch = 0, zoom = 1;
  let viewYaw = 0, viewPitch = 0, viewZoom = 1;
  let pointer: { id: number; x: number; y: number } | null = null;
  const cards: Card[] = [];
  const filaments: Filament[] = [];

  // Five process columns × three depth walls × forty cards = 600 cards.
  // Each wall's five staggered sheets expose real parallax instead of scaling a flat grid.
  for (let wall = 0; wall < 3; wall++) for (let column = 0; column < 5; column++) {
    for (let sheet = 0; sheet < 5; sheet++) for (let row = 0; row < 8; row++) {
      const layer = wall * 5 + sheet;
      const seed = cards.length + 1;
      cards.push({ x: (column - 2) * 222 + Math.sin(layer * 1.7) * 32, y: (row - 3.5) * 105 + (layer ? Math.sin(layer * .9) * 52 : 0), z: layer * 100,
        column, row, layer, tilt: Math.sin(column * .7 + layer) * .105, seed });
    }
  }
  // Vertical dendrites hug each card wall. Cross-column threads form a connected graph.
  for (let layer = 0; layer < 3; layer++) for (let column = 0; column < 5; column++) {
    for (let strand = 0; strand < 26; strand++) {
      const seed = layer * 157 + column * 31 + strand;
      const points: Point[] = [];
      for (let step = 0; step <= 28; step++) {
        const y = -440 + step / 28 * 880;
        const wave = Math.sin(step * .39 + seed) * (5 + hash(seed) * 11);
        points.push({ x: (column - 2) * 222 + 103 + wave + (hash(seed + 3) - .5) * 14,
          y, z: layer * 500 - 16 + Math.sin(step * .32 + seed) * 52 });
      }
      filaments.push({ points, color: strand % 3 ? '#d2e8ff' : palette[column], seed, bright: strand % 4 === 0 });
    }
  }
  for (let index = 0; index < 780; index++) {
    const seed = index + 1000, column = index % 4;
    const depth = Math.floor(hash(seed) * 3) * 490;
    const start = { x: (column - 2) * 222 + 65, y: (hash(seed + 1) - .5) * 830, z: depth };
    const destination = column + 1 + Math.floor(hash(seed + 7) * (4 - column));
    const end = { x: (destination - 2) * 222 - 64, y: (hash(seed + 2) - .5) * 830, z: depth + (hash(seed + 4) - .5) * 280 };
    const points: Point[] = [];
    for (let step = 0; step <= 16; step++) {
      const p = step / 16, ease = smooth(p);
      points.push({ x: mix(start.x, end.x, p) + Math.sin(p * Math.PI) * (hash(seed + 9) - .5) * 70,
        y: mix(start.y, end.y, ease), z: mix(start.z, end.z, p) - Math.sin(p * Math.PI) * 75 });
    }
    filaments.push({ points, color: palette[index % palette.length], seed, bright: false });
  }

  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  const glowContext = glow.getContext('2d')!;
  const gradient = glowContext.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.07, 'rgba(237,249,255,.95)');
  gradient.addColorStop(.2, 'rgba(180,217,255,.48)');
  gradient.addColorStop(1, 'rgba(100,170,255,0)');
  glowContext.fillStyle = gradient; glowContext.fillRect(0, 0, 64, 64);
  const routeGlows = cases.map(item => {
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 96;
    const pen = sprite.getContext('2d')!;
    const halo = pen.createRadialGradient(48, 48, 0, 48, 48, 48);
    halo.addColorStop(0, '#ffffff'); halo.addColorStop(.08, '#ffffef');
    halo.addColorStop(.2, `${item.color}df`); halo.addColorStop(.5, `${item.color}48`); halo.addColorStop(1, `${item.color}00`);
    pen.fillStyle = halo; pen.fillRect(0, 0, 96, 96); return sprite;
  });

  function camera() {
    // Deliberate holds followed by fast pushes make the camera feel like a directed tour.
    const progress = cycleTime / CASE_DURATION;
    const push = progress < .12 ? 0 : progress < .2 ? smooth((progress - .12) / .08) : progress < .81 ? 1 : 1 - smooth(clamp((progress - .81) / .1, 0, 1));
    viewYaw = yaw + .17 + Math.sin(time * .23) * .18;
    viewPitch = pitch + .045 + Math.sin(time * .17 + .7) * .07;
    viewZoom = zoom * mix(.79, 1.17, push);
  }
  function project(point: Point): Projection {
    const cy = Math.cos(viewYaw), sy = Math.sin(viewYaw), cp = Math.cos(viewPitch), sp = Math.sin(viewPitch);
    const x = point.x * cy + (point.z - 240) * sy;
    const z = -point.x * sy + (point.z - 240) * cy + 240;
    const y = point.y * cp - (z - 240) * sp;
    const depth = point.y * sp + (z - 240) * cp + 240;
    const scale = 1400 / Math.max(260, 1400 + depth) * fit * viewZoom;
    return { x: width * .5 + x * scale * horizontalFit, y: height * .5 + y * scale, scale, depth };
  }
  function corners(card: Card): Projection[] {
    return [[-94, -43], [94, -43], [94, 43], [-94, 43]].map(([x, y]) => project({ x: card.x + x * Math.cos(card.tilt), y: card.y + y, z: card.z + x * Math.sin(card.tilt) }));
  }
  function trace(points: Projection[]) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  }
  function activeRows(): number[] {
    return [selectedCase % 8, [0, 1, 6, 4, 3, 4, 7, 2, 6, 5, 4, 3][selectedCase], cases[selectedCase].kind === 'Noul' ? 6 : cases[selectedCase].kind === 'Choice' ? 1 : 4,
      [1, 2, 5, 5, 2, 5, 7, 3, 5, 7, 7, 4][selectedCase], [0, 1, 6, 1, 2, 6, 4, 2, 6, 7, 7, 3][selectedCase]];
  }
  function cardLabel(card: Card, active: boolean): string {
    if (!active) return labels[card.column][card.row];
    const item = cases[selectedCase];
    return [item.input, `${item.kind} · ${item.question}`, `${item.kind.toLowerCase()} head`, item.action, item.action.replaceAll('_', ' ')][card.column];
  }
  const textures = new Map<string, HTMLCanvasElement>();
  function cardTexture(card: Card, active: boolean): HTMLCanvasElement {
    const key = active ? `active-${selectedCase}-${card.column}` : `${card.column}-${card.row}`;
    const cached = textures.get(key);
    if (cached) return cached;
    const texture = document.createElement('canvas'); texture.width = 376; texture.height = 172;
    const pen = texture.getContext('2d')!; pen.scale(2, 2);
    // Expand wall spacing on wide screens without stretching the label glyphs.
    const text = (value: string, x: number, y: number, maxWidth = 170) => {
      pen.save(); pen.scale(1 / horizontalFit, 1);
      pen.fillText(value, x * horizontalFit, y, maxWidth * horizontalFit); pen.restore();
    };
    const color = active ? cases[selectedCase].color : palette[card.column];
    pen.fillStyle = '#11151e'; pen.fillRect(0, 0, 188, 86);
    pen.strokeStyle = active ? color : '#424655'; pen.lineWidth = active ? 1.4 : .65; pen.strokeRect(.7, .7, 186.6, 84.6);
    pen.fillStyle = color; pen.fillRect(8, 9, 3, 4);
    pen.font = 'bold 8px ui-monospace, SFMono-Regular, monospace'; pen.fillStyle = '#eef0f5'; text(cardLabel(card, active), 16, 14, 163);
    pen.font = '5px ui-monospace, SFMono-Regular, monospace'; pen.fillStyle = '#929bad';
    text(card.column === 0 ? 'state / context' : card.column === 1 ? 'question / criteria' : 'system.one', 9, 31);
    text('input', 9, 43); text('result', 9, 54); text('status', 9, 65);
    pen.textAlign = 'right'; pen.fillStyle = active ? color : '#abb2bc';
    text(active ? cases[selectedCase].result : ['received', 'ready', 'resolved', 'pass'][card.row % 4], 177, 43);
    text(active ? cases[selectedCase].confidence.toFixed(2) : (hash(card.seed) * .3 + .69).toFixed(2), 177, 54);
    text(card.column === 4 ? 'saved' : 'parallel', 177, 65);
    pen.fillStyle = color; pen.fillRect(9, 75, active ? 170 : 18 + hash(card.seed + 2) * 30, active ? 6 : 1.2);
    if (active) { pen.textAlign = 'left'; pen.fillStyle = '#161810'; pen.font = 'bold 5px monospace'; text(`${cases[selectedCase].result} · ${cases[selectedCase].confidence.toFixed(2)}  ›`, 14, 80); }
    textures.set(key, texture); return texture;
  }
  function drawCard(card: Card, phase: number, rows: number[]) {
    if (card.layer > 2 && card.layer % 3 !== 0) return;
    const p = corners(card), center = project(card);
    if (center.x < -220 || center.x > width + 220 || center.y < -100 || center.y > height + 100 || center.scale < .12) return;
    const active = card.layer === 0 && rows[card.column] === card.row && card.column <= phase;
    const alpha = card.layer === 0 ? .9 : Math.max(.07, .3 - card.layer * .017);
    const color = active ? cases[selectedCase].color : palette[card.column];
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.transform((p[1].x - p[0].x) / 188, (p[1].y - p[0].y) / 188, (p[3].x - p[0].x) / 86, (p[3].y - p[0].y) / 86, p[0].x, p[0].y);
    ctx.drawImage(cardTexture(card, active), 0, 0, 188, 86);
    ctx.restore();
    if (active) {
      trace(p); ctx.closePath(); ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.shadowBlur = 16; ctx.shadowColor = color;
      ctx.strokeStyle = color; ctx.globalAlpha = .12; ctx.lineWidth = 13 * fit; ctx.stroke(); ctx.globalAlpha = .35; ctx.lineWidth = 5 * fit; ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 2.3; ctx.stroke(); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawWiring(phase: number) {
    ctx.globalCompositeOperation = 'screen';
    for (const filament of filaments) {
      const points = filament.points.map(project);
      const scale = points[0].scale / fit;
      const activeWall = filament.seed < 1000 && Math.floor((filament.seed % 157) / 31) === phase;
      ctx.globalAlpha = filament.bright ? .40 * scale : (filament.seed >= 1000 ? .27 : .10) * scale;
      ctx.strokeStyle = activeWall ? cases[selectedCase].color : filament.color; ctx.lineWidth = filament.bright ? .85 : .52;
      trace(points); ctx.stroke();
      if (filament.bright) { ctx.globalAlpha = .065 * scale; ctx.lineWidth = 6 * fit; ctx.stroke(); }
      if (!filament.bright && filament.seed % 2 !== 0) continue;
      const travel = (time * (filament.bright ? .38 : .22) + hash(filament.seed)) % 1;
      const slot = travel * (points.length - 1), index = Math.floor(slot);
      const first = points[index], next = points[Math.min(index + 1, points.length - 1)];
      const x = mix(first.x, next.x, slot - index), y = mix(first.y, next.y, slot - index);
      const radius = (filament.bright ? 11 : 4) * fit * scale;
      ctx.globalAlpha = filament.bright ? .8 : .48;
      ctx.drawImage(glow, x - radius, y - radius, radius * 2, radius * 2);
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y, filament.bright ? 1.5 : .9, filament.bright ? 1.5 : .9);
    }
    // Narrow luminous cores anchor the many fine branches into recognizable vertical walls.
    for (let column = 0; column < 5; column++) {
      const color = column === phase ? cases[selectedCase].color : '#d2edff';
      for (let fiber = 0; fiber < 3; fiber++) {
        const points: Projection[] = [];
        for (let step = 0; step <= 32; step++) points.push(project({
          x: (column - 2) * 222 + 102 + Math.sin(step * .32 + column + fiber) * (3 + fiber * 2),
          y: -440 + step * 27.5, z: -24 + fiber * 8,
        }));
        trace(points); ctx.strokeStyle = color; ctx.globalAlpha = .055; ctx.lineWidth = 32 * fit; ctx.stroke();
        ctx.globalAlpha = .14; ctx.lineWidth = 13 * fit; ctx.stroke();
        ctx.globalAlpha = .34; ctx.lineWidth = 4 * fit; ctx.stroke();
        ctx.globalAlpha = .96; ctx.lineWidth = 1.2 * fit; ctx.stroke();
      }
      // Small dendrite junctions interrupt the continuous trunk with concentrated light.
      for (let node = 0; node < 48; node++) {
        const seed = column * 67 + node;
        const worldY = (hash(seed + 71) - .5) * 850;
        const center = project({ x: (column - 2) * 222 + 102 + Math.sin(worldY * .012 + column) * 5, y: worldY, z: -20 });
        const branch = project({ x: (column - 2) * 222 + 102 + (hash(seed + 19) - .5) * 120, y: worldY + (hash(seed + 27) - .5) * 150, z: 35 });
        ctx.globalAlpha = .30; ctx.strokeStyle = color; ctx.lineWidth = .65;
        ctx.beginPath(); ctx.moveTo(center.x, center.y);
        ctx.quadraticCurveTo(center.x + (branch.x - center.x) * .2, branch.y, branch.x, branch.y); ctx.stroke();
        const radius = (5 + hash(seed + 6) * 9) * center.scale;
        ctx.globalAlpha = .35 + .3 * Math.sin(time * 2.1 + seed) ** 2;
        ctx.drawImage(glow, center.x - radius, center.y - radius, radius * 2, radius * 2);
      }
      if (column === phase) {
        for (let pulse = 0; pulse < 3; pulse++) {
          const y = ((time * .24 + pulse / 3) % 1 - .5) * 830;
          const center = project({ x: (column - 2) * 222 + 102, y, z: -25 });
          const radius = 38 * center.scale;
          ctx.globalAlpha = .9;
          ctx.drawImage(routeGlows[selectedCase], center.x - radius, center.y - radius, radius * 2, radius * 2);
        }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function drawRoute(phase: number, rows: number[]) {
    const color = cases[selectedCase].color;
    ctx.globalCompositeOperation = 'screen'; ctx.strokeStyle = color;
    const points: Projection[] = [];
    for (let column = 0; column <= phase; column++) {
      const card = cards.find(c => c.layer === 0 && c.column === column && c.row === rows[column])!;
      points.push(project(card));
    }
    if (points.length > 1) {
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        ctx.bezierCurveTo(a.x + 120 * fit, a.y, b.x - 110 * fit, b.y, b.x, b.y);
      }
      ctx.globalAlpha = .08; ctx.lineWidth = 19 * fit; ctx.stroke();
      ctx.globalAlpha = .28; ctx.lineWidth = 6 * fit; ctx.stroke();
      ctx.globalAlpha = .9; ctx.lineWidth = 1.5 * fit; ctx.stroke();
    }
    const current = points[points.length - 1];
    const pulse = 1 + Math.sin(time * 8) * .15;
    const radius = 36 * fit * pulse;
    ctx.globalAlpha = .95; ctx.drawImage(routeGlows[selectedCase], current.x + 75 * fit - radius, current.y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = .16; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.ellipse(current.x, current.y, 131 * fit * pulse, 100 * fit * pulse, .25, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function snapshot(): GridSnapshot {
    const phase = Math.min(4, Math.floor(cycleTime / CASE_DURATION * 5));
    return { time, caseIndex: selectedCase, phase, progress: cycleTime / CASE_DURATION, paused, speed, decisions: Math.floor(decisions),
      confidence: phase >= 2 ? cases[selectedCase].confidence : 0, fps: Math.round(fps), camera: { yaw, pitch, zoom } };
  }
  function report() { options.onUpdate(snapshot()); }
  function draw() {
    camera(); ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#05070d'; ctx.fillRect(0, 0, width, height);
    const background = ctx.createRadialGradient(width * .5, height * .48, 5, width * .5, height * .48, Math.max(width, height) * .65);
    background.addColorStop(0, '#141923'); background.addColorStop(1, '#04060b'); ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    // Floor and ceiling rails expose the perspective even during a held camera beat.
    ctx.strokeStyle = '#263440'; ctx.lineWidth = .45; ctx.globalAlpha = .4;
    for (let x = -660; x <= 660; x += 110) for (const y of [-440, 440]) {
      trace([project({ x, y, z: -60 }), project({ x, y, z: 1600 })]); ctx.stroke();
    }
    for (let z = 0; z <= 1600; z += 160) for (const y of [-440, 440]) {
      trace([project({ x: -660, y, z }), project({ x: 660, y, z })]); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const { phase } = snapshot(), rows = activeRows();
    const ordered = cards.map(card => ({ card, depth: project(card).depth })).sort((a, b) => b.depth - a.depth);
    for (const { card } of ordered) drawCard(card, phase, rows);
    drawWiring(phase); drawRoute(phase, rows);
    ctx.font = `${Math.max(7, 9 * fit)}px ui-monospace, monospace`; ctx.fillStyle = '#7b8393'; ctx.textAlign = 'center';
    for (let column = 0; column < 5; column++) {
      const p = project({ x: (column - 2) * 222, y: -426, z: 0 }); ctx.fillText(`${String(column + 1).padStart(2, '0')} / ${phases[column]}`, p.x, Math.max(13, p.y));
    }
    ctx.textAlign = 'left';
    const edge = ctx.createLinearGradient(0, 0, 0, height);
    edge.addColorStop(0, 'rgba(5,7,13,.8)'); edge.addColorStop(.07, 'rgba(5,7,13,0)'); edge.addColorStop(.9, 'rgba(5,7,13,0)'); edge.addColorStop(1, '#05070d');
    ctx.fillStyle = edge; ctx.fillRect(0, 0, width, height); renderedFrames++; dirty = false;
  }
  function tick(now: number) {
    frame = 0;
    if (disposed) return;
    const dt = lastTime ? clamp((now - lastTime) / 1000, 0, .08) : 0;
    lastTime = now;
    if (!document.hidden && !paused) {
      time += dt * speed; cycleTime += dt * speed; decisions += dt * speed * 93;
      if (cycleTime >= CASE_DURATION) { cycleTime %= CASE_DURATION; selectedCase = (selectedCase + 1) % cases.length; }
    }
    if (dt > 0) fps = fps * .94 + Math.min(120, 1 / dt) * .06;
    if (!document.hidden && (!paused || dirty)) draw();
    if (!paused && !document.hidden && now - lastReport > 100) { lastReport = now; report(); }
    frame = requestAnimationFrame(tick);
  }
  function resize() {
    const bounds = canvas.getBoundingClientRect(); width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
    fit = Math.min(width / 1080, height / 800) * 1.06;
    horizontalFit = Math.max(1, width / 1080 / fit);
    textures.clear();
    if (!disposed) draw();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  }, listener);
  canvas.addEventListener('pointermove', event => {
    if (!pointer || pointer.id !== event.pointerId) return;
    yaw = clamp(yaw + (event.clientX - pointer.x) * .003, -.75, .75);
    pitch = clamp(pitch + (event.clientY - pointer.y) * .0025, -.4, .4);
    pointer.x = event.clientX; pointer.y = event.clientY; dirty = true; report();
  }, listener);
  const endPointer = () => { pointer = null; };
  canvas.addEventListener('pointerup', endPointer, listener); canvas.addEventListener('pointercancel', endPointer, listener);
  canvas.addEventListener('lostpointercapture', endPointer, listener);
  canvas.addEventListener('wheel', event => { event.preventDefault(); zoom = clamp(zoom * Math.exp(-event.deltaY * .001), .55, 1.8); dirty = true; report(); }, { ...listener, passive: false });
  canvas.addEventListener('keydown', event => {
    const step = event.shiftKey ? .12 : .045;
    if (event.key === 'ArrowLeft') yaw = clamp(yaw - step, -.75, .75);
    else if (event.key === 'ArrowRight') yaw = clamp(yaw + step, -.75, .75);
    else if (event.key === 'ArrowUp') pitch = clamp(pitch - step, -.4, .4);
    else if (event.key === 'ArrowDown') pitch = clamp(pitch + step, -.4, .4);
    else return;
    event.preventDefault(); dirty = true; report();
  }, listener);
  document.addEventListener('visibilitychange', () => { lastTime = 0; dirty = true; }, listener);
  resize(); report(); frame = requestAnimationFrame(tick);
  return {
    setPaused(value) { paused = value; lastTime = 0; dirty = true; report(); },
    setSpeed(value) { if (Number.isFinite(value)) speed = clamp(value, .25, 4); report(); },
    setCase(index) { if (!Number.isFinite(index)) return; selectedCase = ((Math.floor(index) % cases.length) + cases.length) % cases.length; cycleTime = 0; dirty = true; report(); },
    restart() { time = 0; cycleTime = 0; decisions = 562; lastTime = 0; dirty = true; report(); },
    resetView() { yaw = 0; pitch = 0; zoom = 1; dirty = true; report(); },
    getDiagnostics(): GridDiagnostics {
      camera();
      return { ...snapshot(), cards: cards.length, walls: 15, depthRange: { min: 0, max: 1400 }, renderedFrames, activeFrame: frame !== 0,
        probes: [cards[0], cards[8], cards[200], cards[400], cards[599]].map(card => { const { x, y, z } = card; const projected = project(card); return { world: { x, y, z }, screen: { x: projected.x, y: projected.y, scale: projected.scale } }; }) };
    },
    dispose() { if (disposed) return; disposed = true; cancelAnimationFrame(frame); frame = 0; observer.disconnect(); abort.abort(); pointer = null; glow.width = glow.height = 1; routeGlows.forEach(sprite => { sprite.width = sprite.height = 1; }); textures.clear(); },
  };
}
