<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { mountDecisionGrid } from './engine';
import { cases, phases, initialSnapshot, type GridController, type GridSnapshot } from './model';
import './style.css';

declare global { interface Window { decisionGrid?: GridController } }
const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const snapshot = ref<GridSnapshot>({ ...initialSnapshot });
const notice = ref('');
let controller: GridController | undefined;
let motionPreference: MediaQueryList | undefined;
const activeCase = computed(() => cases[snapshot.value.caseIndex] ?? cases[7]!);
const decided = computed(() => snapshot.value.phase >= 2);
const passed = computed(() => decided.value && snapshot.value.confidence >= .85);
const confidence = computed(() => decided.value ? snapshot.value.confidence.toFixed(2) : '--');
const activeNumber = computed(() => String(snapshot.value.caseIndex + 1).padStart(2, '0'));
const streams = computed(() => ['#ef5ca6', '#5be9dc', '#e5ff75'].map((color, line) => ({
  color,
  points: Array.from({ length: 54 }, (_, i) => {
    const t = i * .24 + snapshot.value.time * .7;
    const y = 46 + Math.sin(t * (1.2 + line * .31) + line * 2) * 23 + Math.sin(t * 2.7 + line) * 9;
    return `${i * 4.72},${y.toFixed(2)}`;
  }).join(' '),
})));
const questions = computed(() => ['Choice A', 'Choice B', 'Score A', 'Score B', 'Noul A', 'Noul B'].map((label, i) => ({
  label,
  value: snapshot.value.phase < 1 ? .03 : .12 + ((snapshot.value.caseIndex * 17 + i * 23) % 73) / 100,
  answer: ['write', activeCase.value.result, 'low', activeCase.value.result, 'yes', 'no'][i],
  color: ['#ef5ca6', '#ef5ca6', '#5be9dc', '#5be9dc', '#d7ff62', '#d7ff62'][i],
})));
const runLog = computed(() => [
  { label: 'state', value: activeCase.value.input, color: '#8d9aaa', phase: 0 },
  { label: 'ask', value: `${activeCase.value.kind} ${activeCase.value.question}`, color: '#f0ebbd', phase: 1 },
  { label: 'jev', value: `→ ${activeCase.value.result} ${activeCase.value.confidence.toFixed(2)}`, color: '#f0ebbd', phase: 2 },
  { label: 'gate', value: `${activeCase.value.confidence.toFixed(2)} ${activeCase.value.confidence >= .85 ? '≥' : '<'} 0.85 ${activeCase.value.confidence >= .85 ? 'pass' : 'HOLD'}`, color: passed.value ? '#b9ff6d' : '#ef83ad', phase: 3 },
  { label: 'code', value: `→ ${activeCase.value.action}`, color: '#61e4d4', phase: 4 },
].filter(line => line.phase <= snapshot.value.phase));
function togglePause() { controller?.setPaused(!snapshot.value.paused); }
function cycleSpeed() {
  const speeds = [1, 1.5, 2, .75];
  controller?.setSpeed(speeds[(speeds.indexOf(snapshot.value.speed) + 1) % speeds.length]!);
}
function handleMotionChange(event: MediaQueryListEvent) { if (event.matches) controller?.setPaused(true); }
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (root.value?.requestFullscreen) await root.value.requestFullscreen();
    else notice.value = '当前浏览器不支持全屏';
  } catch { notice.value = '全屏暂不可用，请使用浏览器全屏模式'; }
}
onMounted(() => {
  if (!canvas.value) return;
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  controller = mountDecisionGrid(canvas.value, {
    initialPaused: motionPreference.matches,
    onUpdate: state => { snapshot.value = state; },
  });
  window.decisionGrid = controller;
  motionPreference.addEventListener('change', handleMotionChange);
});
onBeforeUnmount(() => {
  motionPreference?.removeEventListener('change', handleMotionChange);
  controller?.dispose();
  if (window.decisionGrid === controller) delete window.decisionGrid;
});
</script>

<template>
  <main ref="root" class="decision-grid" :style="{ '--case-color': activeCase.color }">
    <header class="dg-topbar">
      <h1>JEV / DECISION GRID</h1><span class="dg-system">SYSTEM ONE · jev-1.13.0</span>
      <span class="dg-pipeline">STATE → QUESTIONS → JEV → GATE → CODE</span><span class="dg-sim">SIMULATION <i></i></span>
    </header>
    <section class="dg-metrics" aria-label="模拟运行指标">
      <article class="dg-panel dg-metric"><h2>DECISIONS · THIS RUN</h2><strong>{{ snapshot.decisions.toLocaleString('en-US') }}</strong><div class="dg-blocks"><i :style="{ width: `${35 + snapshot.progress * 22}%` }"></i></div><p>SIM · 15 walls · 600 cards</p></article>
      <article class="dg-panel dg-metric"><h2>MEDIAN LATENCY · REPORTED</h2><div class="dg-latency"><strong>~256<small> ms</small></strong><svg viewBox="0 0 95 36" aria-hidden="true"><polyline points="0,18 5,12 10,27 15,31 21,8 25,21 30,19 35,4 40,26 45,14 50,21 55,19 60,6 65,31 70,25 75,31 80,10 85,25 90,13 95,18"/></svg></div><div class="dg-rule"></div><p>public demos · not SLAs</p></article>
      <article class="dg-panel dg-metric"><h2>COST · 10 000 DECISIONS</h2><strong class="dg-gold">≈ $0.42</strong><div class="dg-cost-row"><span>jev</span><i class="dg-cheap"></i><span>$0.042 / M in · out free</span></div><div class="dg-cost-row"><span>LLM</span><i></i></div></article>
      <article class="dg-panel dg-metric"><h2>CONFIDENCE · LIVE</h2><strong :class="{ 'dg-lime': passed, 'dg-hold': decided && !passed }">{{ confidence }}</strong><div class="dg-confidence-track"><i :style="{ width: `${decided ? snapshot.confidence * 100 : 0}%` }"></i><b></b></div><p>calibrate on yours <b>gate 0.85</b></p></article>
    </section>
    <section class="dg-case-strip" aria-label="当前决策案例">
      <div class="dg-current-case"><span class="dg-case-badge">CASE {{ activeNumber }} / 12</span><div><h2>{{ activeCase.label }}</h2><p>{{ activeCase.kind }} · {{ activeCase.question }} <span v-if="decided">→ {{ activeCase.result }} {{ confidence }}</span><span v-else>→ awaiting decision</span></p></div></div>
      <ol class="dg-phases" aria-label="决策阶段"><li v-for="(phase, i) in phases" :key="phase" :class="{ complete: i < snapshot.phase, active: i === snapshot.phase, hold: i === 3 && decided && !passed }" :aria-current="i === snapshot.phase ? 'step' : undefined">{{ phase }}</li></ol>
    </section>
    <section class="dg-scene" aria-label="三维决策网格">
      <canvas ref="canvas" tabindex="0" aria-label="三维决策卡片与数据流。拖动或方向键旋转，滚轮缩放。"></canvas>
      <div class="dg-scene-caption"><span>15 WALLS / 600 CARDS</span><span>XYZ · LIVE ROUTING</span></div>
      <nav class="dg-controls" aria-label="大屏控制">
        <RouterLink to="/" aria-label="返回大屏索引" title="返回大屏索引">←</RouterLink>
        <button :aria-label="snapshot.paused ? '播放动画' : '暂停动画'" :aria-pressed="snapshot.paused" @click="togglePause">{{ snapshot.paused ? '▶' : 'Ⅱ' }}</button>
        <button :aria-label="`播放速度 ${snapshot.speed} 倍，点击切换`" title="切换速度" @click="cycleSpeed">{{ snapshot.speed }}×</button>
        <button aria-label="重播当前案例" title="重播当前案例" @click="controller?.restart()">↺</button>
        <button aria-label="重置视角" title="重置视角" @click="controller?.resetView()">⌖</button>
        <button aria-label="切换全屏" title="切换全屏" @click="fullscreen">⛶</button>
      </nav>
      <span class="dg-scene-help">DRAG / ARROWS TO ORBIT · SCROLL TO ZOOM</span><span v-if="notice" class="dg-notice" role="status">{{ notice }}</span>
    </section>
    <section class="dg-analysis" aria-label="决策详情">
      <article class="dg-panel dg-stream"><h2>CONFIDENCE STREAM <span>SIM</span></h2><svg viewBox="0 0 250 100" preserveAspectRatio="none" role="img" aria-label="模拟置信度变化曲线"><path class="dg-chart-grid" d="M0 20H250M0 40H250M0 60H250M0 80H250M50 0V100M100 0V100M150 0V100M200 0V100"/><path class="dg-threshold" d="M0 25H250"/><polyline v-for="line in streams" :key="line.color" :points="line.points" :stroke="line.color"/><text x="225" y="22">0.85</text></svg><div class="dg-chart-legend"><span>Choice</span><span>Score</span><span>Noul</span><small>under → human</small></div></article>
      <article class="dg-panel dg-cases"><h2>12 USE CASES <span>case {{ activeNumber }}</span></h2><div class="dg-case-buttons"><button v-for="(item, i) in cases" :key="item.id" :class="{ selected: i === snapshot.caseIndex }" :aria-pressed="i === snapshot.caseIndex" :aria-label="item.label" @click="controller?.setCase(i)"><small>{{ String(i + 1).padStart(2, '0') }}</small>{{ item.short }}<i v-if="i === snapshot.caseIndex"></i></button></div></article>
      <article class="dg-panel dg-code"><h2>chief.py <span>14 l/s</span></h2><pre><span class="dg-code-teal">with</span> TypeSafeClient(model=<span class="dg-code-yellow">"jev-1.13.0"</span>) <span class="dg-code-teal">as</span> client:
  result = client.system_one(
    state=state,
    questions={
      <span class="dg-code-yellow">"{{ activeCase.question }}"</span>: {{ activeCase.kind }}(
        instructions=<span class="dg-code-yellow">"Decide the next step"</span>,
        criteria={
          <span class="dg-code-yellow">"input"</span>: <span class="dg-code-yellow">"{{ activeCase.input }}"</span>,
          <span class="dg-code-yellow">"gate"</span>: <span class="dg-code-teal">0.85</span>,
        },
      ),
    },
  )</pre></article>
      <article class="dg-panel dg-questions"><h2>PARALLEL QUESTIONS <span>one state</span></h2><div v-for="q in questions" :key="q.label" class="dg-question"><span>{{ q.label }}</span><div><i :style="{ width: `${q.value * 100}%`, background: q.color }"></i></div><small>{{ snapshot.phase >= 2 ? q.answer : '…' }}</small></div><p>three answers ≈ one cheap decision</p></article>
    </section>
    <section class="dg-bottom" aria-label="运行日志及安全约束">
      <article class="dg-panel dg-log"><h2>RUN LOG <span>{{ snapshot.paused ? 'paused' : '8 l/s' }}</span></h2><div v-for="line in runLog" :key="line.label" class="dg-log-line"><span :style="{ color: line.color }">{{ line.label }}</span><span>{{ line.value }}</span></div></article>
      <article class="dg-panel dg-split"><h2>THE SPLIT <span>who does what</span></h2><div><span>LLM writes</span><i style="--fill: 14%; --bar-color: #6d6d85"></i></div><div><span>Jev decides</span><i style="--fill: 86%; --bar-color: #f4ed66"></i></div><div><span>code acts</span><i style="--fill: 52%; --bar-color: #64ece7"></i></div></article>
      <article class="dg-panel dg-guardrails"><h2>GUARDRAILS <span>always on</span></h2><div><span>spend cap</span><i><b style="width:19%"></b></i><strong>$0.19 / 1.00</strong></div><div><span>actions</span><i><b style="width:50%"></b></i><strong>5 / 10</strong></div><p>♧ never auto-post · {{ decided && !passed ? 'HUMAN REVIEW' : 'progress saved' }}</p></article>
    </section>
    <footer class="dg-footer"><b>LLM WRITES · JEV DECIDES · CODE ACTS</b><span>SIMULATED DATA · illustrative metrics · no external actions</span></footer>
  </main>
</template>
