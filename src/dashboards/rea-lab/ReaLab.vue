<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { mountReaLab } from './engine';
import { CYCLE_SECONDS, initialReaSnapshot, stages, type ReaController, type ReaSnapshot } from './model';
import './style.css';

declare global { interface Window { reaLab?: ReaController } }
const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const snapshot = ref<ReaSnapshot>({ ...initialReaSnapshot });
const notice = ref('');
let controller: ReaController | undefined;
let preference: MediaQueryList | undefined;
const random = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
const localTime = computed(() => snapshot.value.time % CYCLE_SECONDS);
const stage = computed(() => stages[snapshot.value.phaseIndex] ?? stages[0]!);
const resolved = computed(() => snapshot.value.phase === 'RESOLVED');
const tick = computed(() => Math.floor(snapshot.value.time * 7));
const number = (value: number) => Math.round(value).toLocaleString('fr-FR').replace(/\u202f/g, ' ');
const disasmBars = computed(() => Array.from({ length: 7 }, (_, i) => 28 + (Math.sin(localTime.value * .9 + i * 1.9) * .5 + .5) * 61));
const heat = computed(() => Array.from({ length: 72 }, (_, i) => ({ color: ['#af1757', '#db435e', '#c99022', '#73623e', '#efbf80', '#f5d4d1', '#d7979e', '#d9d9e2'][Math.floor(random(i + tick.value * .2) * 8)]!, opacity: .45 + random(i * 2 + tick.value) * .55 })));
const blocks = computed(() => Array.from({ length: 132 }, (_, i) => {
  const col = i % 11, row = 11 - Math.floor(i / 11);
  const height = 2 + Math.floor((Math.sin(col * 1.8 + localTime.value * .8) * .5 + .5) * 3 + snapshot.value.decompiled / 1207 * 7);
  return { on: row < height, color: row > 7 ? (col % 2 ? '#435dc7' : '#7933ce') : '#164a2b' };
}));
const dots = computed(() => Array.from({ length: 88 }, (_, i) => {
  const enabled = i < 8 + snapshot.value.lifted / 1536 * 80;
  const value = random(i + Math.floor(snapshot.value.time * 2));
  return { enabled, color: value > .78 ? '#dc2073' : value > .43 ? '#17623a' : '#161719' };
}));
const codeSource = [
  'async function check(d) {', '  await read(d, d.notes)', "  if (!ok) return gap.bounce(d)", '  return ship(d)', '}', '',
  'for (const t of queue) {', '  spawn(draft, t)', '}', '',
  "gap.on('draft', check)", "gap.on('bounced', d => {", '  mk.redo(d, d.notes)', '})', '// hash the two loops',
  'while (phase(mk, ck) > 0) {', '  await tick(16)', '  ck.align(mk.wave)', '}', 'lock(mk, ck)', '',
  'async function draft(task) {', '  const d = await mk.solve(task)', '  return gap.send(d)', '}', '// carry the source forward',
  'const mk = ring(8)', 'const ck = ring(6)', "const gap = new Gap('orbit')", 'run({ mk, ck, gap, agents: 64 })',
];
const codeRows = computed(() => {
  const offset = Math.floor(snapshot.value.time * 3);
  return Array.from({ length: 38 }, (_, i) => {
    const text = codeSource[(i + offset) % codeSource.length]!;
    return { text, kind: text.startsWith('//') ? 'comment' : /async|await|return|const|while/.test(text) ? 'syntax' : '', highlight: (i + offset) % 11 === 3 };
  });
});
const mesh = computed(() => Array.from({ length: 118 }, (_, i) => {
  const y = 1 - (i + .5) / 118 * 2, r = Math.sqrt(1 - y * y), a = i * 2.399963 + snapshot.value.time * .34;
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  return { x: 60 + x * 45, y: 57 + y * 44, r: 1.1 + (z + 1) * .42, opacity: .25 + (z + 1) * .36 };
}));
const waves = computed(() => [0, 1, 2].map(channel => {
  const phase = channel * 2.1 * snapshot.value.gap / .42;
  return Array.from({ length: 90 }, (_, i) => {
    const x = i / 89 * 116;
    const y = 33 + Math.sin(i / 89 * Math.PI * 5.6 - snapshot.value.time * 2.1 + phase) * 23;
    return `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}));
const activity = computed(() => Array.from({ length: 22 }, (_, i) => 2 + random(i + tick.value) * 8));
function togglePause() { controller?.setPaused(!snapshot.value.paused); }
function cycleSpeed() { const speeds = [1, 1.5, 2, .75]; controller?.setSpeed(speeds[(speeds.indexOf(snapshot.value.speed) + 1) % speeds.length]!); }
function motionChanged(event: MediaQueryListEvent) { if (event.matches) controller?.setPaused(true); }
async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else if (root.value?.requestFullscreen) await root.value.requestFullscreen(); else notice.value = '当前浏览器不支持全屏'; }
  catch { notice.value = '全屏暂不可用，请使用浏览器全屏模式'; }
}
onMounted(() => {
  if (!canvas.value) return;
  preference = matchMedia('(prefers-reduced-motion: reduce)');
  controller = mountReaLab(canvas.value, { initialPaused: preference.matches, onUpdate: value => { snapshot.value = value; } });
  window.reaLab = controller;
  preference.addEventListener('change', motionChanged);
});
onBeforeUnmount(() => {
  preference?.removeEventListener('change', motionChanged);
  controller?.dispose();
  if (window.reaLab === controller) delete window.reaLab;
});
</script>

<template>
  <main ref="root" class="rea-lab" :class="{ 'rea-resolved': resolved }">
    <header class="rea-masthead">
      <h1>REA<span class="rea-sr-only"> / REVERSE ENGINEERING</span></h1>
      <div class="rea-status-run"><small>RUN</small><b>rea-lab-01</b></div>
      <div><small>LIFTED</small><b class="rea-warm">{{ number(snapshot.lifted) }}</b></div>
      <div><small>DECOMPILED</small><b class="rea-green">{{ number(snapshot.decompiled) }}</b></div>
      <div><small>FLAGGED</small><b class="rea-pink">{{ snapshot.flagged }}</b></div>
      <div><small>SYNC</small><b>{{ snapshot.sync }}%</b></div>
      <div class="rea-status-cam"><small>CAM</small><b>{{ snapshot.azimuth >= 0 ? '+' : '' }}{{ snapshot.azimuth.toFixed(2) }}</b></div>
      <div class="rea-status-state"><small>STATE</small><b>{{ snapshot.phase.toLowerCase() }}</b></div>
      <div class="rea-status-sim"><small>SIM</small><b>illustrative</b></div>
      <strong>REA · reverse engineering</strong>
    </header>
    <section class="rea-scene" aria-label="双侧三维逆向工程网络">
      <canvas ref="canvas" tabindex="0" aria-label="反汇编与反编译三维网络，拖动或方向键旋转，滚轮缩放。"></canvas>
      <div class="rea-stage"><b>{{ String(snapshot.phaseIndex + 1).padStart(2, '0') }} {{ snapshot.phase }}</b><i></i></div>
      <div v-if="!resolved" class="rea-tagline" :class="{ cool: snapshot.phaseIndex >= 2 }"><h2>{{ stage.title }}</h2><p>{{ stage.subtitle }}</p></div>
      <div v-else class="rea-summary">
        <div class="rea-summary-numbers"><div><span>lifted</span><b>{{ number(snapshot.lifted) }}</b></div><div class="rea-green"><span>decompiled</span><b>{{ number(snapshot.decompiled) }}</b></div><div class="rea-pink"><span>flagged</span><b>{{ number(snapshot.flagged) }}</b></div></div>
        <div class="rea-summary-footer"><span>REA · bytes in · source out · nothing ships unread.</span><b>REA · reverse engineering</b></div><small>SIM · deterministic demo data</small>
      </div>
    </section>
    <section class="rea-terminal" aria-label="逆向工程监测终端">
      <header class="rea-terminal-bar"><span class="rea-window-dots" aria-hidden="true"><i></i><i></i><i></i></span><b>rea@lab</b><span class="rea-command">~ % run rea --disasm 64 --decomp 16</span><span class="rea-terminal-state">state: {{ snapshot.paused ? 'paused' : snapshot.phase.toLowerCase() }}</span><div class="rea-activity" aria-hidden="true"><i v-for="(bar,i) in activity" :key="i" :style="{height: `${bar}px`}"></i></div><nav aria-label="大屏控制"><RouterLink to="/" aria-label="返回大屏索引" title="返回大屏索引">←</RouterLink><button :aria-label="snapshot.paused ? '播放动画' : '暂停动画'" :aria-pressed="snapshot.paused" @click="togglePause">{{ snapshot.paused ? '▶' : 'Ⅱ' }}</button><button :aria-label="`播放速度 ${snapshot.speed} 倍，点击切换`" @click="cycleSpeed">{{ snapshot.speed }}×</button><button aria-label="重播演示" title="重播演示" @click="controller?.restart()">↺</button><button aria-label="重置视角" title="重置视角" @click="controller?.resetView()">⌖</button><button aria-label="切换全屏" title="切换全屏" @click="fullscreen">⛶</button></nav></header>
      <div class="rea-panels">
        <article class="rea-panel rea-disasm"><h2><i></i>disasm <span>64 agents</span></h2><div class="rea-disasm-bars"><div v-for="(bar,i) in disasmBars" :key="i"><small>{{ String(i + 1).padStart(2,'0') }}</small><i :style="{width:`${bar}%`}"></i></div></div><div class="rea-panel-stat"><small>lifted</small><b class="rea-warm">{{ number(snapshot.lifted) }}</b></div><small class="rea-section-label">heat</small><div class="rea-heat"><i v-for="(cell,i) in heat" :key="i" :style="{background:cell.color,opacity:cell.opacity}"></i></div><footer>redo {{ snapshot.flagged }}</footer></article>
        <article class="rea-panel rea-decomp"><h2><i></i>decomp <span>16 agents</span></h2><div class="rea-blocks"><i v-for="(block,i) in blocks" :key="i" :style="{background:block.on?block.color:'transparent'}"></i></div><div class="rea-panel-stat"><small>decompiled</small><b class="rea-green">{{ number(snapshot.decompiled) }}</b></div><div class="rea-check-bars"><div v-for="(name,i) in ['verify','align','ship','bounce']" :key="name"><span>{{ name }}</span><i :style="{width:`${[79,20+snapshot.sync*.65,10+snapshot.sync*.7,35-snapshot.sync*.2][i]}%`}"></i></div></div></article>
        <article class="rea-panel rea-handoff"><h2><i></i>handoff <span>gap</span></h2><div class="rea-dot-grid"><i v-for="(dot,i) in dots" :key="i" :style="{background:dot.color,opacity:dot.enabled?1:.07}"></i></div><div class="rea-panel-stat"><small>flag rate</small><b class="rea-pink">{{ snapshot.flagRate.toFixed(1) }}%</b></div><div class="rea-flag-meter"><i v-for="n in 28" :key="n" :class="{on:n<snapshot.flagRate*.6}"></i></div><footer>in flight {{ snapshot.inFlight }}</footer></article>
        <article class="rea-panel rea-code"><h2><i></i>code <span>rea.ts · live</span></h2><div class="rea-code-window"><div :style="{transform:`translateY(${-((snapshot.time*3)%1)*9}px)`}"><div v-for="(row,i) in codeRows" :key="i" class="rea-code-line" :class="[row.kind,{highlight:row.highlight}]"><small>{{ String((Math.floor(snapshot.time*3)+i)%99+1).padStart(2,'0') }}</small><code>{{ row.text || ' ' }}</code></div></div></div></article>
        <article class="rea-panel rea-mesh"><h2><i></i>mesh <span>sphere</span></h2><svg class="rea-sphere" viewBox="0 0 120 112" aria-label="旋转的相位球形网格"><circle v-for="(node,i) in mesh" :key="i" :cx="node.x" :cy="node.y" :r="node.r" :opacity="node.opacity"/></svg><div class="rea-panel-stat"><small>phase gap</small><b :class="{'rea-purple':snapshot.gap>.01}">Δ {{ snapshot.gap.toFixed(2) }}</b></div><div class="rea-aligned">aligned<i :style="{width:`${100-snapshot.gap/.42*80}%`}"></i></div><footer><span>disasm <b>8 waves</b></span><span>decomp <b>6 waves</b></span></footer></article>
        <article class="rea-panel rea-sync"><h2><i></i>sync <span>sin</span></h2><div class="rea-panel-stat rea-sync-stat"><small>in sync</small><b>{{ snapshot.sync }}%</b></div><svg class="rea-waves" viewBox="0 0 116 66" preserveAspectRatio="none" aria-label="逐渐同步的三条相位波形"><path v-for="(path,i) in waves" :key="i" :d="path" :class="`wave-${i}`"/></svg><div class="rea-panel-stat"><small>crossings</small><b>{{ number(snapshot.crossings) }}</b></div><dl><dt>lifted</dt><dd>{{ number(snapshot.lifted) }}</dd><dt>decompiled</dt><dd class="rea-green">{{ number(snapshot.decompiled) }}</dd><dt>flagged</dt><dd class="rea-pink">{{ snapshot.flagged }}</dd></dl></article>
      </div>
    </section>
    <p v-if="notice" class="rea-notice" role="status">{{ notice }}</p>
  </main>
</template>
