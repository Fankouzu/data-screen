import { initialVortexSnapshot, type VortexController, type VortexDiagnostics, type VortexOptions, type VortexSnapshot } from './model';

const PARTICLES = 74000;
const STRANDS = 32000;
const TAU = Math.PI * 2;
const phases: VortexSnapshot['phase'][] = ['OBSERVE', 'ANALYZE', 'RISK CHECK', 'EXECUTE', 'REPORT'];
const vertexSource = `
precision highp float;
attribute vec4 aSeed;
attribute float aEnd;
uniform float uTime, uAspect, uSpread, uYaw, uPitch, uZoom, uDpr, uGlow;
varying vec3 vColor;
varying float vAlpha;
vec3 hsv(vec3 c) { vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
void main() {
 float h=aSeed.x, theta=aSeed.y, seed=aSeed.z, kind=aSeed.w;
 float angle=theta+uTime*(1.8+1.2*(1.-h))+h*9.;
 float radius=(.012+pow(h,1.18)*1.08+.3*pow(h,4.))*uSpread;
 radius*=1.+.085*sin(h*17.-uTime*1.8)+.045*sin(h*47.+theta*3.-uTime*3.);
 float shell=.85+.16*seed;
 angle+=aEnd*(.012+.055*h)*(1.+seed);
 vec3 p=vec3(cos(angle)*radius*shell, .94-h*2.22, sin(angle)*radius*shell);
 p.x+=.075+.16*h*sin(h*3.5-uTime*.32)+.055*h*sin(h*10.+uTime*.25);
 if(kind>1.5) {
   float cycle=fract(seed+uTime*.32);
   float reach=pow(cycle,.8)*1.7;
   p=vec3(cos(theta)*reach,.94-sin(cycle*3.14159)*(.04+.16*seed),sin(theta)*reach*.56);
   p.x+=.075; p.y-=aEnd*.008; p.x+=aEnd*cos(theta)*.04; p.z+=aEnd*sin(theta)*.04;
 } else if(kind>.5) {
   p.x+=cos(theta)*seed*.4; p.z+=sin(theta)*seed*.4;
 }
 if(kind>2.5) { p=vec3(.075+cos(theta)*seed*.035,.94-sin(theta)*seed*.012,sin(theta)*seed*.035); }
 float cy=cos(uYaw), sy=sin(uYaw), cp=cos(uPitch), sp=sin(uPitch);
 p.xz=mat2(cy,-sy,sy,cy)*p.xz;
 p.yz=mat2(cp,-sp,sp,cp)*p.yz;
 float perspective=4.8/(4.8+p.z);
 gl_Position=vec4(p.x*perspective*uZoom/uAspect,-p.y*perspective*uZoom,0.,1.);
 float band=pow(.5+.5*sin(h*45.+theta*2.-uTime*2.4),9.);
 float hue=fract(.33+h*.54+uTime/15.+.06*sin(theta)+seed*.045);
 vColor=hsv(vec3(hue,.74,1.));
 vColor=mix(vColor,vec3(1.),band*.78);
 vAlpha=(.36+seed*.43+band*.9)*(p.z<0.?1.:.56);
 if(kind>.5) vAlpha*=.85;
 if(kind>1.5) { vColor=hsv(vec3(fract(.45+uTime/15.+seed*.13),.8,1.)); vAlpha=(1.-fract(seed+uTime*.32))*.64; }
 gl_PointSize=(1.0+seed*1.5+band)*uDpr*perspective;
 if(kind>2.5) { vColor=mix(hsv(vec3(fract(.33+uTime/15.),.8,1.)),vec3(1.),.55); vAlpha=.5; gl_PointSize=(5.+seed*8.)*uDpr; }
 if(uGlow>.5) { gl_PointSize*=7.; vAlpha*=.19; }
}
`;
const fragmentSource = `
precision mediump float;
uniform float uPoints;
varying vec3 vColor;
varying float vAlpha;
void main(){
 float alpha=vAlpha;
 if(uPoints>.5) { float r=length(gl_PointCoord-.5)*2.; if(r>1.) discard; alpha*=pow(1.-r,1.8); }
 gl_FragColor=vec4(vColor*alpha,alpha);
}
`;

/** Real cylindrical XYZ particles; the shader rotates and deforms the surface every frame. */
export function mountVortexDesk(canvas: HTMLCanvasElement, options: VortexOptions): VortexController {
  let width = 1, height = 1, dpr = 1, time = 0, last = 0, notifyAt = -1;
  let paused = options.initialPaused ?? false, speed = 1, frame: number | null = null, frames = 0, disposed = false, lost = false;
  let yaw = 0, pitch = 0, zoom = 1, fps = 60;
  let drag: { id: number; x: number; y: number } | null = null;
  let randomState = 19348;
  const random = () => { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState / 4294967296; };
  const points = new Float32Array(PARTICLES * 5);
  const lines = new Float32Array(STRANDS * 10);
  for (let i = 0; i < PARTICLES; i++) points.set([Math.pow(random(), .87), random() * TAU, random(), i < 66000 ? 0 : i < 70000 ? 1 : i < 73500 ? 2 : 3, 0], i * 5);
  for (let i = 0; i < STRANDS; i++) {
    const h = Math.pow(random(), .82), angle = random() * TAU, seed = random(), kind = i < 30000 ? 0 : 2;
    lines.set([h, angle, seed, kind, 0, h, angle, seed, kind, 1], i * 10);
  }
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' });
  const ctx = gl ? null : canvas.getContext('2d');
  let program: WebGLProgram | null = null, pointBuffer: WebGLBuffer | null = null, lineBuffer: WebGLBuffer | null = null;
  let seedLocation = 0, endLocation = 0;
  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  function initGL() {
    if (!gl) return;
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Unable to create vortex shader');
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message ?? 'Vortex shader compilation failed'); }
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, vertexSource), fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    if (!program) { gl.deleteShader(vertex); gl.deleteShader(fragment); throw new Error('Unable to create vortex program'); }
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Vortex shader linking failed');
    gl.useProgram(program);
    seedLocation = gl.getAttribLocation(program, 'aSeed'); endLocation = gl.getAttribLocation(program, 'aEnd');
    for (const key of ['Time', 'Aspect', 'Spread', 'Yaw', 'Pitch', 'Zoom', 'Dpr', 'Glow', 'Points']) uniforms[key] = gl.getUniformLocation(program, `u${key}`);
    pointBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer); gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
    lineBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer); gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.clearColor(0, 0, 0, 1);
  }
  initGL();
  const spread = () => Math.min(1.5, Math.max(.7, width / height));
  function position(h: number, theta: number, seed: number) {
    const angle = theta + time * (1.8 + 1.2 * (1 - h)) + h * 9;
    const radius = (.012 + h ** 1.18 * 1.08 + .3 * h ** 4) * spread() * (1 + .085 * Math.sin(h * 17 - time * 1.8) + .045 * Math.sin(h * 47 + theta * 3 - time * 3)) * (.85 + .16 * seed);
    return { x: Math.cos(angle) * radius + .075 + .16 * h * Math.sin(h * 3.5 - time * .32) + .055 * h * Math.sin(h * 10 + time * .25), y: .94 - h * 2.22, z: Math.sin(angle) * radius };
  }
  function project(p: { x: number; y: number; z: number }) {
    const x = Math.cos(yaw) * p.x + Math.sin(yaw) * p.z;
    const z = -Math.sin(yaw) * p.x + Math.cos(yaw) * p.z;
    const y = Math.cos(pitch) * p.y + Math.sin(pitch) * z;
    const depth = -Math.sin(pitch) * p.y + Math.cos(pitch) * z;
    const scale = 4.8 / (4.8 + depth) * zoom;
    return { x: width / 2 + x * scale * height / 2, y: height / 2 + y * scale * height / 2, scale };
  }
  function snapshot(): VortexSnapshot {
    const cycle = time % 30, confidence = .78 + .2 * (.5 + .5 * Math.sin(time * .73 + 1.4));
    return { ...initialVortexSnapshot, time, paused, speed, fps: Math.round(fps), hue: (time / 15 * 360) % 360, phase: phases[Math.floor(cycle / 6)]!, confidence, riskHold: confidence < .82, decisions: 31 + Math.round(Math.sin(time * 1.4) * 6), latency: 238 + Math.round(Math.sin(time * .8) * 24), net: 425 + Math.round(time * 2.4 + Math.sin(time * .54) * 16), events: 4470 + Math.floor(time * 35), camera: { yaw, pitch, zoom } };
  }
  function render() {
    if (disposed || lost || !width || !height) return;
    if (gl && program) {
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(program);
      const values: Record<string, number> = { Time: time, Aspect: width / height, Spread: spread(), Yaw: yaw, Pitch: pitch, Zoom: zoom, Dpr: dpr };
      for (const [key, value] of Object.entries(values)) gl.uniform1f(uniforms[key] ?? null, value);
      const bind = (buffer: WebGLBuffer | null) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(seedLocation); gl.vertexAttribPointer(seedLocation, 4, gl.FLOAT, false, 20, 0);
        gl.enableVertexAttribArray(endLocation); gl.vertexAttribPointer(endLocation, 1, gl.FLOAT, false, 20, 16);
      };
      bind(pointBuffer); gl.uniform1f(uniforms.Points ?? null, 1); gl.uniform1f(uniforms.Glow ?? null, 1); gl.drawArrays(gl.POINTS, 0, PARTICLES);
      gl.uniform1f(uniforms.Glow ?? null, 0); gl.drawArrays(gl.POINTS, 0, PARTICLES);
      bind(lineBuffer); gl.uniform1f(uniforms.Points ?? null, 0); gl.drawArrays(gl.LINES, 0, STRANDS * 2);
    } else if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height); ctx.globalCompositeOperation = 'lighter';
      for (let bucket = 0; bucket < 20; bucket++) {
        ctx.strokeStyle = `hsla(${(170 + bucket * 10 + time * 24) % 360},95%,65%,.48)`; ctx.lineWidth = .7; ctx.beginPath();
        for (let i = bucket; i < 18000; i += 20) {
          const index = i * 10, h = lines[index]!, angle = lines[index + 1]!, seed = lines[index + 2]!;
          const a = project(position(h, angle, seed)), b = project(position(h, angle + (.012 + .055 * h) * (1 + seed), seed));
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      const base = project({ x: .075, y: .94, z: 0 }), glow = ctx.createRadialGradient(base.x, base.y, 0, base.x, base.y, height * .1);
      glow.addColorStop(0, '#fff'); glow.addColorStop(.08, '#98fff6'); glow.addColorStop(.3, '#00bdab55'); glow.addColorStop(1, '#0000'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    }
    frames++; options.onFrame?.(time);
  }
  function emit() { options.onUpdate(snapshot()); notifyAt = time; }
  function tick(now: number) {
    frame = null;
    if (disposed || lost) return;
    if (!paused) {
      const delta = last ? Math.max(0, Math.min(.05, (now - last) / 1000)) : 0;
      time += delta * speed; if (delta > 0) fps += (1 / delta - fps) * .05;
    }
    last = now; render();
    if (paused || time - notifyAt >= .1) emit();
    if (!paused) frame = requestAnimationFrame(tick);
  }
  function requestDraw() { if (!disposed && !lost && frame === null) frame = requestAnimationFrame(tick); }
  function resize() {
    const bounds = canvas.getBoundingClientRect(); width = Math.max(1, bounds.width); height = Math.max(1, bounds.height); dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); requestDraw();
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  function pointerDown(event: PointerEvent) { drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true }); }
  function pointerMove(event: PointerEvent) { if (!drag || drag.id !== event.pointerId) return; yaw += (event.clientX - drag.x) * .004; pitch = Math.max(-.45, Math.min(.45, pitch + (event.clientY - drag.y) * .002)); drag.x = event.clientX; drag.y = event.clientY; requestDraw(); }
  function pointerUp(event: PointerEvent) { if (drag?.id === event.pointerId) drag = null; }
  function wheel(event: WheelEvent) { event.preventDefault(); zoom = Math.max(.6, Math.min(1.6, zoom * Math.exp(-event.deltaY * .001))); requestDraw(); }
  function resetView() { yaw = 0; pitch = 0; zoom = 1; requestDraw(); emit(); }
  function keydown(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '0'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') yaw -= .12; if (event.key === 'ArrowRight') yaw += .12;
    if (event.key === 'ArrowUp') pitch = Math.max(-.45, pitch - .06); if (event.key === 'ArrowDown') pitch = Math.min(.45, pitch + .06);
    if (event.key === '+' || event.key === '=') zoom = Math.min(1.6, zoom + .1); if (event.key === '-') zoom = Math.max(.6, zoom - .1);
    if (event.key === '0') resetView(); requestDraw();
  }
  function contextLost(event: Event) { event.preventDefault(); lost = true; if (frame !== null) cancelAnimationFrame(frame); frame = null; }
  function contextRestored() { if (disposed) return; lost = false; initGL(); last = 0; requestDraw(); }
  canvas.addEventListener('pointerdown', pointerDown); canvas.addEventListener('pointermove', pointerMove); canvas.addEventListener('pointerup', pointerUp); canvas.addEventListener('pointercancel', pointerUp); canvas.addEventListener('lostpointercapture', pointerUp);
  canvas.addEventListener('wheel', wheel, { passive: false }); canvas.addEventListener('keydown', keydown); canvas.addEventListener('webglcontextlost', contextLost); canvas.addEventListener('webglcontextrestored', contextRestored);
  resize(); emit();
  return {
    setPaused(value) { paused = value; last = 0; if (frame !== null) cancelAnimationFrame(frame); frame = null; emit(); if (!paused) requestDraw(); },
    setSpeed(value) { if (Number.isFinite(value)) speed = Math.max(.25, Math.min(4, value)); emit(); },
    restart() { time = 0; notifyAt = -1; last = 0; options.onFrame?.(0); requestDraw(); emit(); },
    resetView,
    getDiagnostics(): VortexDiagnostics {
      const probes = Array.from({ length: 12 }, (_, index) => { const world = position(.15 + index / 15, index * 2.3, .5); return { world, screen: project(world) }; });
      return { ...snapshot(), renderer: gl ? 'webgl' : 'canvas2d', particles: PARTICLES, strands: STRANDS, renderedFrames: frames, activeFrame: frame !== null, depthRange: { min: Math.min(...probes.map(p => p.world.z)), max: Math.max(...probes.map(p => p.world.z)) }, probes };
    },
    dispose() {
      disposed = true; if (frame !== null) cancelAnimationFrame(frame); frame = null; observer.disconnect();
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp); canvas.removeEventListener('lostpointercapture', pointerUp); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      if (gl) { gl.deleteBuffer(pointBuffer); gl.deleteBuffer(lineBuffer); gl.deleteProgram(program); }
    },
  };
}
