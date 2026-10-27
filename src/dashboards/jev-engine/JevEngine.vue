<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { mountJevEngine } from './engine';
import { initialJevSnapshot, noise, type JevController, type JevSnapshot } from './model';
import './style.css';

declare global { interface Window { jevEngine?: JevController } }
const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const flameViewport = ref<HTMLElement>();
const flameWidth = ref(1920);
let flameObserver: ResizeObserver | undefined;
const snapshot = ref<JevSnapshot>({ ...initialJevSnapshot });
const notice = ref('');
let controller: JevController | undefined;
let preference: MediaQueryList | undefined;
const colors = ['#8661dc', '#b3d744', '#47c9db', '#f4c148', '#e146d2', '#ef6657'];
const tasks = ['llm.draft', 'jev.score', 'llm.plan', 'jev.noul', 'llm.reply', 'jev.choice', 'review.gate', 'tool.fetch', 'browser.act', 'code.save'];
const taskColors = ['#7961bd', '#3f859c', '#7660b1', '#779c2d', '#6954a7', '#9c483c', '#a93688', '#4b5267', '#363c50', '#373e4e'];
const flameRows = Array.from({ length: 3 }, (_, row) => Array.from({ length: 26 }, (_, i) => {
  const task = (i * 7 + row * 3) % tasks.length;
  return { text: row === 0 ? 'agent.step' : tasks[task], color: row === 0 ? '#252834' : taskColors[task], width: row === 0 ? 65 + noise(i) * 100 : 45 + noise(i * 3 + row) * 72 };
}));
const flameTracks = computed(() => flameRows.map((items, row) => {
  const width = items.reduce((total, item) => total + item.width + 3, 0);
  return { items, width, copies: Math.ceil(flameWidth.value / width) + 1, offset: -(snapshot.value.time * 23 * (row === 0 ? .5 : 1 + row * .1) % width) };
}));
const sparklines = computed(() => [0, 1, 2].map(channel => Array.from({ length: 110 }, (_, i) => {
  const t = snapshot.value.time - (109 - i) * .16;
  const pulse = Math.pow(Math.max(0, Math.sin(t * (channel === 2 ? 5.4 : 3.5))), channel === 2 ? 8 : 12);
  const value = channel === 1 ? .43 + Math.sin(t * 1.3) * .18 + Math.cos(t * 2.1) * .07 : .18 + pulse * .55 + noise(Math.floor(t * 5) + channel * 99) * .16;
  return `${i ? 'L' : 'M'}${i / 109 * 180},${22 - value * 19}`;
}).join(' ')));
const histogram = computed(() => Array.from({ length: 48 }, (_, i) => {
  const x = i / 47;
  const main = Math.exp(-Math.pow((x - .88) / .115, 2)) * .74;
  const shoulder = Math.exp(-Math.pow((x - .62) / .14, 2)) * .2;
  return { width: 6 + 155 * (main + shoulder) * (.8 + noise(i + Math.floor(snapshot.value.time * 3)) * .4), color: `hsl(${346 + x * 100} 68% 57%)` };
}));
const split = computed(() => { const llm = 13 + Math.sin(snapshot.value.time * .21) * 2; const jev = snapshot.value.confidence; return [llm, jev, Math.max(0, 100 - llm - jev)]; });
const stream = computed(() => {
  const count = 100;
  const boundaries = Array.from({ length: 6 }, () => [] as number[]);
  for (let i = 0; i <= count; i++) {
    const x = i / count, t = snapshot.value.time * .32;
    const values = [.9 + .45 * Math.sin(x * 9 - t), .63 + .27 * Math.cos(x * 14 + t), .35 + .16 * Math.sin(x * 11 - t * 1.2), .15 + .09 * Math.cos(x * 18 - t), .13 + .06 * Math.sin(x * 21 + t)];
    const total = values.reduce((sum, value) => sum + value, 0);
    let y = 28 - total * 9;
    boundaries[0]!.push(y);
    values.forEach((value, index) => { y += value * 18; boundaries[index + 1]!.push(y); });
  }
  return Array.from({ length: 5 }, (_, row) => {
    const upper = boundaries[row]!.map((y, i) => `${i ? 'L' : 'M'}${i * 10},${y.toFixed(2)}`).join(' ');
    const lower = [...boundaries[row + 1]!].reverse().map((y, i) => `L${(count - i) * 10},${y.toFixed(2)}`).join(' ');
    return `${upper} ${lower} Z`;
  });
});
const coxcomb = computed(() => Array.from({ length: 24 }, (_, i) => {
  const a = i / 24 * Math.PI * 2 - Math.PI / 2, b = a + Math.PI * 2 / 24 * .94;
  const radius = 43 + noise(i * 3) * 20 + Math.sin(snapshot.value.time * .8 + i * 2.1) * 5;
  const p = (r: number, angle: number) => `${(80 + Math.cos(angle) * r).toFixed(2)},${(75 + Math.sin(angle) * r).toFixed(2)}`;
  return { path: `M${p(14, a)} L${p(radius, a)} A${radius},${radius} 0 0 1 ${p(radius, b)} L${p(14, b)} A14,14 0 0 0 ${p(14, a)}Z`, color: `hsl(${195 + i * 12} 65% 53%)` };
}));
const demos = [
  { label: 'flight search', detail: '~7 s', value: '$0.0039', color: colors[2]!, amount: .16 },
  { label: '1k papers', detail: '256 ms', value: '$0.08', color: colors[1]!, amount: .33 },
  { label: '500 emails', detail: 'batch', value: '3.5¢', color: colors[3]!, amount: .09 },
  { label: 'compaction', detail: '1M → 86k tok', value: '~1 s', color: colors[4]!, amount: .88 },
  { label: '10k decisions', detail: '12k tok', value: '$0.42', color: colors[5]!, amount: .6 },
];
const paretoBars = [103, 69, 44, 31, 23, 18, 12];
const paretoPoints = '15,95 46,70 77,55 108,43 139,34 170,26 201,20';
const fmt = (n: number) => Math.round(n).toLocaleString('fr-FR').replace(/\u202f/g, ' ');
function togglePause() { controller?.setPaused(!snapshot.value.paused); }
function cycleSpeed() { const speeds = [1, 1.5, 2, .75]; controller?.setSpeed(speeds[(speeds.indexOf(snapshot.value.speed) + 1) % speeds.length]!); }
function motionChanged(event: MediaQueryListEvent) { if (event.matches) controller?.setPaused(true); }
async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else if (root.value?.requestFullscreen) await root.value.requestFullscreen(); else notice.value = '当前浏览器不支持全屏'; }
  catch { notice.value = '全屏暂不可用，请使用浏览器全屏模式'; }
}
onMounted(() => {
  if (!canvas.value) return;
  flameObserver = new ResizeObserver(entries => { flameWidth.value = entries[0]?.contentRect.width ?? 1920; });
  if (flameViewport.value) flameObserver.observe(flameViewport.value);
  preference = matchMedia('(prefers-reduced-motion: reduce)');
  controller = mountJevEngine(canvas.value, { initialPaused: preference.matches, onUpdate: value => { snapshot.value = value; } });
  window.jevEngine = controller;
  preference.addEventListener('change', motionChanged);
});
onBeforeUnmount(() => {
  flameObserver?.disconnect();
  preference?.removeEventListener('change', motionChanged);
  controller?.dispose();
  if (window.jevEngine === controller) delete window.jevEngine;
});
</script>

<template>
  <main ref="root" class="jev-engine">
    <header class="jev-masthead"><h1><i></i>JEV ENGINEERING / @ASTERI_ETH</h1><span>MODEL jev-1.13.0 · PINS 2 600 · DECISIONS {{ fmt(snapshot.decisions) }} · 2026-09-22</span></header>
    <section class="jev-profile" aria-label="代理任务火焰图">
      <div class="jev-section-heading"><h2>AGENT STEP PROFILE · 2 048 SAMPLES · FLAME · DECIDE vs GENERATE</h2><b>decide/gen {{ snapshot.confidence.toFixed(1) }} %</b></div>
      <div ref="flameViewport" class="jev-flame-window"><div v-for="(track,r) in flameTracks" :key="r" class="jev-flame-row" :style="{transform:`translateX(${track.offset}px)`}"><div v-for="copy in track.copies" :key="copy" class="jev-flame-copy" :style="{width:`${track.width}px`}"><span v-for="(item,i) in track.items" :key="i" :style="{width:`${item.width}px`,background:item.color}">{{ item.text }}</span></div></div><div class="jev-flame-cursor" :style="{left:`${24 + Math.sin(snapshot.time*.35)*15}%`}"></div></div>
    </section>
    <div class="jev-router-heading"><span>ROUTER AUTOROUTE · RE-ROUTES {{ (snapshot.load*.8).toFixed(1) }}/S · WAVE {{ Math.floor(snapshot.time*4)%360 }}° · GATED {{ Math.round(snapshot.gated/3) }}</span><span>YAW {{ snapshot.yaw.toFixed(1) }}° · PITCH {{ snapshot.pitch.toFixed(1) }}° · R 110–420 · STRANDS 2 600</span></div>
    <div class="jev-workspace">
      <section class="jev-scene" aria-label="三维环形决策路由网络"><canvas ref="canvas" tabindex="0" aria-label="三维环形针束网络，拖动或方向键旋转，滚轮缩放"></canvas><div class="jev-canvas-hint">DRAG TO ORBIT · SCROLL TO ZOOM</div></section>
      <aside class="jev-telemetry" aria-label="路由监测">
        <section class="jev-load"><h2>ROUTER LOAD · 60 S</h2><div v-for="(path,i) in sparklines" :key="i" class="jev-load-channel" :style="{color:[colors[2],colors[1],'#e15177'][i]}"><div><span>{{ ['DECISIONS / S','GATED / S','ESCALATE / S'][i] }}</span><b>{{ [snapshot.load.toFixed(1),Math.round(snapshot.gated),snapshot.escalations.toFixed(1)][i] }}</b></div><svg viewBox="0 0 180 25" preserveAspectRatio="none"><path :d="path"/></svg></div></section>
        <section class="jev-confidence"><h2>CONFIDENCE · 48 BINS <b>gate ≥ 0.85</b></h2><div class="jev-histogram"><small>0.00</small><svg viewBox="0 0 180 192" preserveAspectRatio="none" aria-label="48 档置信度分布"><rect v-for="(bin,i) in histogram" :key="i" x="0" :y="i*4" :width="bin.width" height="2.9" :fill="bin.color"/><path d="M0 163.2H180" stroke="#d7d9e0" stroke-width=".7" stroke-dasharray="3 3"/></svg><small>1.00</small></div></section>
        <section class="jev-split"><h2>SPLIT · CREATE / DECIDE / ACT</h2><div class="jev-split-bar"><span v-for="(value,i) in split" :key="i" :style="{width:`${value}%`,background:[colors[0],colors[1],'#8b8d9e'][i]}">{{ ['LLM','JEV','CODE'][i] }}</span></div><div class="jev-split-values"><span v-for="(value,i) in split" :key="i">{{ value.toFixed(0) }}%</span></div></section>
        <section class="jev-cycle"><h2>CYCLE STATE</h2><div v-for="(name,i) in ['STATE','CHOICE','SCORE','NOUL']" :key="name"><span>{{ name }}</span><i><em :style="{width:`${[85,69,88,72][i]}%`,background:['#e5e3ef',colors[5],colors[2],colors[1]][i]}"></em></i><b :style="{color:['#c4c2cf',colors[5],colors[2],colors[1]][i]}">{{ ['ep-4417','write 0.91','heat 0.88','yes 0.97'][i] }}</b></div></section>
        <section class="jev-readout"><h2>READOUT</h2><dl><dt>YAW</dt><dd>{{ snapshot.yaw.toFixed(2) }}°</dd><dt>PITCH</dt><dd>{{ snapshot.pitch.toFixed(2) }}°</dd><dt>INPUT $/1M</dt><dd>0.042</dd><dt>OUTPUT</dt><dd class="jev-lime">FREE</dd><dt>10K DECISIONS</dt><dd class="jev-lime">$0.42</dd><dt>P50 LATENCY</dt><dd>{{ Math.round(snapshot.latency) }} MS</dd><dt>GATE</dt><dd>≥ 0.85 conf</dd><dt>AUTO-POST / TX</dt><dd class="jev-pink">NEVER</dd></dl></section>
        <section class="jev-key"><h2>KEY</h2><span v-for="(name,i) in ['CHOICE','SCORE','NOUL','STALL']" :key="name"><i :style="{background:[colors[5],colors[2],colors[1],'#e15177'][i]}"></i>{{ name }}</span></section>
      </aside>
    </div>
    <section class="jev-stream" aria-label="Token 流量堆叠图"><div class="jev-section-heading"><h2>TOKEN FLOW BY ROLE · 30 MIN · STREAM</h2><b>{{ snapshot.tokens.toFixed(2) }} B TOK / MIN · $0.042 / 1M IN · OUTPUT FREE</b></div><svg viewBox="0 0 1000 57" preserveAspectRatio="none"><path v-for="(path,i) in stream" :key="i" :d="path" :fill="[colors[0],colors[1],colors[2],colors[3],colors[5]][i]" stroke="#cac7e2" stroke-width=".35"/><text x="8" y="18">llm.generate</text><text x="150" y="36" class="jev-dark-text">jev.decide</text></svg><div class="jev-stream-axis"><span>-30</span><span>NOW</span></div></section>
    <section class="jev-bottom" aria-label="决策统计">
      <article class="jev-coxcomb"><h2>DECISIONS BY HOUR · COXCOMB</h2><svg viewBox="0 0 160 150" aria-label="每小时决策玫瑰图"><circle cx="80" cy="75" r="65"/><circle cx="80" cy="75" r="45"/><path v-for="(wedge,i) in coxcomb" :key="i" :d="wedge.path" :fill="wedge.color" :stroke="wedge.color"/><circle class="jev-coxcomb-center" cx="80" cy="75" r="13"/><text x="80" y="79">{{ Math.round(snapshot.load) }}</text></svg></article>
      <article class="jev-demos"><h2>REPORTED DEMOS · FROM THE ARTICLE</h2><div v-for="(demo,i) in demos" :key="demo.label" class="jev-demo-row"><div><b>{{ demo.label }}</b><small>{{ demo.detail }}</small></div><svg viewBox="0 0 100 15" preserveAspectRatio="none"><path d="M0 8H100" stroke="#20222e"/><path :d="`M0 8H${demo.amount*80+Math.sin(snapshot.time*.7+i)*5}`" :stroke="demo.color"/><circle :cx="demo.amount*80+Math.sin(snapshot.time*.7+i)*5" cy="8" r="2.6" :fill="demo.color"/><circle v-if="i===3" cx="98" cy="8" r="3" fill="none" :stroke="demo.color" stroke-width=".7"/></svg><strong :style="{color:demo.color}">{{ demo.value }}</strong></div></article>
      <article class="jev-pareto"><h2>WHERE THE FORKS WENT · PARETO</h2><svg viewBox="0 0 225 150" preserveAspectRatio="none" aria-label="分支去向帕累托图"><path d="M0 42H224" stroke="#666575" stroke-dasharray="2 2" stroke-width=".5"/><text x="218" y="38" text-anchor="end">80%</text><rect v-for="(height,i) in paretoBars" :key="i" :x="i*31+3" :y="132-height" width="23" :height="height" :fill="i===5?'#ba36c4':'#686d80'"/><polyline :points="paretoPoints"/><circle v-for="(point,i) in paretoPoints.split(' ')" :key="i" :cx="point.split(',')[0]" :cy="point.split(',')[1]" r="1.6"/><text v-for="(label,i) in ['ignore','route','score','retry','escalate','human','other']" :key="label" :transform="`translate(${i*31+14} 141) rotate(-32)`" text-anchor="end">{{ label }}</text></svg></article>
    </section>
    <footer class="jev-footer"><span>SOURCE · @ASTERI_ETH · JEV BUILDER PLAYBOOK · TYPESAFE AI</span><nav aria-label="大屏控制"><RouterLink to="/" aria-label="返回大屏索引" title="返回大屏索引">←</RouterLink><button :aria-label="snapshot.paused?'播放动画':'暂停动画'" :aria-pressed="snapshot.paused" @click="togglePause">{{ snapshot.paused?'▶':'Ⅱ' }}</button><button :aria-label="`播放速度 ${snapshot.speed} 倍，点击切换`" @click="cycleSpeed">{{ snapshot.speed }}×</button><button aria-label="重播演示" title="重播演示" @click="controller?.restart()">↺</button><button aria-label="重置视角" title="重置视角" @click="controller?.resetView()">⌖</button><button aria-label="切换全屏" title="切换全屏" @click="fullscreen">⛶</button></nav><span>ILLUSTRATIVE SCHEMATIC · SIMULATED DATA</span></footer>
    <p v-if="notice" class="jev-notice" role="status">{{ notice }}</p>
  </main>
</template>
