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
uniform mediump float uPoints;
varying vec3 vColor;
varying float vAlpha;
vec3 hsv(vec3 c) { vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y); }
void main() {
 float h=fract(aSeed.x+uTime*.045), theta=aSeed.y, seed=aSeed.z, kind=aSeed.w;
 float tail=aEnd*(.008+.022*h)*(1.+seed);
 float angle=theta+uTime*(2.1+.7*(1.-h))+h*9.+tail;
 h-=tail/17.;
 h=max(0.,h);
 float radius=(.01+pow(h,1.72)*1.08+.34*pow(h,5.))*uSpread;
 radius*=1.+.65*exp(-pow((h-.16)/.10,2.));
 radius*=1.+.045*sin(h*15.-uTime*1.4)+.025*sin(h*31.+angle*2.-uTime);
 float shell=.94+.06*seed;
 float x=cos(angle)*radius*shell, z=sin(angle)*radius*shell;
 vec3 p=vec3(x+.04-.32*h*h+.04*h+.045*exp(-pow((h-.20)/.15,2.))+.10*sin(h*3.14159)*exp(-2.*h)+.055*h*sin(h*4.-uTime*.45), .94-h*2.22-.18*x-.40*z, z);
 if(kind>1.5) {
   float cycle=fract(seed+uTime*.32);
   float reach=pow(cycle,.8)*1.7;
   p=vec3(cos(theta)*reach,.94-sin(cycle*3.14159)*(.04+.16*seed),sin(theta)*reach*.56);
   p.x+=.04; p.y-=aEnd*.008; p.x+=aEnd*cos(theta)*.04; p.z+=aEnd*sin(theta)*.04;
 } else if(kind>.5) {
   p.x+=cos(angle)*seed*.35; p.z+=sin(angle)*seed*.35;
 }
 if(kind>2.5) { p=vec3(.04+cos(theta)*seed*.025,.94-sin(theta)*seed*.008,sin(theta)*seed*.025); }
 float cy=cos(uYaw), sy=sin(uYaw), cp=cos(uPitch), sp=sin(uPitch);
 p.xz=mat2(cy,-sy,sy,cy)*p.xz;
 p.yz=mat2(cp,-sp,sp,cp)*p.yz;
 float perspective=4.8/(4.8+p.z);
 gl_Position=vec4(p.x*perspective*uZoom/uAspect,-p.y*perspective*uZoom,0.,1.);
 float band=pow(.5+.5*cos(angle*2.+h*34.+uTime*1.2),4.);
 float hue=fract(.05+uTime/5.+pow(h,.82)*.68+.22*h*cos(angle)+seed*.015);
 vColor=hsv(vec3(hue,.88,1.));
 vColor=mix(vColor,vec3(1.),band*.4);
 vAlpha=(.42+seed*.25+band*.95)*(p.z<0.?1.:.24);
 if(uPoints<.5) vAlpha*=1.5;
 if(kind>.5) vAlpha*=.7;
 if(kind>1.5) { vColor=hsv(vec3(fract(.05+uTime/5.+cos(theta)*.06+seed*.025),.85,1.)); vAlpha=(1.-fract(seed+uTime*.32))*.64; }
 gl_PointSize=(1.+seed*1.4+band*.3)*uDpr*perspective;
 if(kind>2.5) { vColor=mix(hsv(vec3(fract(.05+uTime/5.),.85,1.)),vec3(1.),.3); vAlpha=.36; gl_PointSize=(3.+seed*6.)*uDpr; }
 if(uGlow>.5) { gl_PointSize*=7.; vAlpha*=.20; }
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
  const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
  const softwareRenderer = rendererInfo && /swiftshader|llvmpipe|softpipe|software/i.test(String(gl!.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)));
  let quality = softwareRenderer ? .45 : 1, slowFrames = 0;
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
  // Keep geometry in sync with the shader for the Canvas fallback and camera probes.
  function position(height: number, theta: number, seed: number, endpoint = 0) {
    let h = (height + time * .045) % 1;
    const tail = endpoint * (.008 + .022 * h) * (1 + seed);
    const angle = theta + time * (2.1 + .7 * (1 - h)) + h * 9 + tail;
    h = Math.max(0, h - tail / 17);
    const radius = (.01 + h ** 1.72 * 1.08 + .34 * h ** 5) * spread() * (1 + .65 * Math.exp(-(((h - .16) / .10) ** 2))) * (1 + .045 * Math.sin(h * 15 - time * 1.4) + .025 * Math.sin(h * 31 + angle * 2 - time)) * (.94 + .06 * seed);
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    return { x: x + .04 - .32 * h * h + .04 * h + .045 * Math.exp(-(((h - .20) / .15) ** 2)) + .10 * Math.sin(h * Math.PI) * Math.exp(-2 * h) + .055 * h * Math.sin(h * 4 - time * .45), y: .94 - h * 2.22 - .18 * x - .40 * z, z };
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
      const density = quality * quality;
      const drawPoints = () => {
        if (quality === 1) gl.drawArrays(gl.POINTS, 0, PARTICLES);
        // Keep all four particle populations when reducing GPU work.
        else for (const [start, count] of [[0, 66000], [66000, 4000], [70000, 3500], [73500, 500]] as const) gl.drawArrays(gl.POINTS, start, Math.floor(count * density));
      };
      bind(pointBuffer); gl.uniform1f(uniforms.Points ?? null, 1); gl.uniform1f(uniforms.Glow ?? null, 1); drawPoints();
      gl.uniform1f(uniforms.Glow ?? null, 0); drawPoints();
      bind(lineBuffer); gl.uniform1f(uniforms.Points ?? null, 0);
      gl.drawArrays(gl.LINES, 0, Math.floor(30000 * density) * 2);
      gl.drawArrays(gl.LINES, 60000, Math.floor(2000 * density) * 2);
    } else if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, width, height); ctx.globalCompositeOperation = 'lighter';
      const paths = Array.from({ length: 36 }, () => new Path2D());
      for (let i = 0; i < 18000; i++) {
        const index = i * 10, heightSeed = lines[index]!, theta = lines[index + 1]!, seed = lines[index + 2]!;
        const h = (heightSeed + time * .045) % 1;
        const angle = theta + time * (2.1 + .7 * (1 - h)) + h * 9;
        const hue = (.05 + time / 5 + h ** .82 * .68 + .22 * h * Math.cos(angle) + seed * .015) % 1;
        const path = paths[Math.floor(hue * paths.length)]!;
        const a = project(position(heightSeed, theta, seed)), b = project(position(heightSeed, theta, seed, 1));
        path.moveTo(a.x, a.y); path.lineTo(b.x, b.y);
      }
      ctx.lineWidth = .7;
      paths.forEach((path, bucket) => { ctx.strokeStyle = `hsla(${bucket * 10},95%,65%,.65)`; ctx.stroke(path); });
      const base = project({ x: .04, y: .94, z: 0 }), glow = ctx.createRadialGradient(base.x, base.y, 0, base.x, base.y, height * .1);
      const groundHue = ((.05 + time / 5) % 1) * 360;
      glow.addColorStop(0, '#fff'); glow.addColorStop(.08, `hsl(${groundHue},95%,80%)`); glow.addColorStop(.3, `hsla(${groundHue},95%,55%,.33)`); glow.addColorStop(1, '#0000'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    }
    frames++; options.onFrame?.(time);
  }
  function emit() { options.onUpdate(snapshot()); notifyAt = time; }
  function tick(now: number) {
    frame = null;
    if (disposed || lost) return;
    if (!paused) {
      const elapsed = last ? Math.max(0, (now - last) / 1000) : 0;
      time += Math.min(1, elapsed) * speed;
      if (elapsed > 0) fps += (Math.min(240, 1 / elapsed) - fps) * .05;
      slowFrames = elapsed > .08 ? slowFrames + 1 : 0;
      if (gl && slowFrames >= 4 && quality > .45) {
        quality = quality > .65 ? .65 : .45;
        slowFrames = 0; resize(false);
      }
    }
    last = now; render();
    if (paused || time - notifyAt >= .1) emit();
    if (!paused) frame = requestAnimationFrame(tick);
  }
  function requestDraw() { if (!disposed && !lost && frame === null) frame = requestAnimationFrame(tick); }
  function resize(redraw = true) {
    const bounds = canvas.getBoundingClientRect(); width = Math.max(1, bounds.width); height = Math.max(1, bounds.height); dpr = Math.min(window.devicePixelRatio || 1, 1.75) * quality;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); if (redraw) requestDraw();
  }
  const observer = new ResizeObserver(() => resize()); observer.observe(canvas);
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
  function visibilityChanged() { last = 0; }
  document.addEventListener('visibilitychange', visibilityChanged);
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
      document.removeEventListener('visibilitychange', visibilityChanged);
      canvas.removeEventListener('pointerdown', pointerDown); canvas.removeEventListener('pointermove', pointerMove); canvas.removeEventListener('pointerup', pointerUp); canvas.removeEventListener('pointercancel', pointerUp); canvas.removeEventListener('lostpointercapture', pointerUp); canvas.removeEventListener('wheel', wheel); canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('webglcontextlost', contextLost); canvas.removeEventListener('webglcontextrestored', contextRestored);
      if (gl) { gl.deleteBuffer(pointBuffer); gl.deleteBuffer(lineBuffer); gl.deleteProgram(program); }
    },
  };
}
