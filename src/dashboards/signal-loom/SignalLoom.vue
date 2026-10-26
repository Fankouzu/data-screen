<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { mountSignalLoom } from './engine';
import { initialSignalSnapshot, type SignalController, type SignalSnapshot } from './model';
import './style.css';

declare global { interface Window { signalLoom?: SignalController } }
const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const snapshot = ref<SignalSnapshot>({ ...initialSignalSnapshot });
const notice = ref('');
let controller: SignalController | undefined;
let motion: MediaQueryList | undefined;
let lastUpdate = -1;
const phases = ['STATE', 'ASK', 'JEV', 'GATE', 'CODE'];
const cases = [
  ['EMAIL TRIAGE', 'Choice · folder → phishing', 'quarantine → mail moved · LLM never woke'],
  ['YOUTUBE COMMENT', 'Noul · worth_reply → yes', 'draft reply → response queued'],
  ['COMMUNITY SIGNAL', 'Choice · next_worker → research', 'assign worker → context sent'],
  ['X FEED POST', 'Score · viral_fit → high', 'draft short → review queued'],
  ['MEETING NOTES', 'Noul · follow_up → yes', 'calendar → invitation drafted'],
  ['CLIP SELECTION', 'Score · clip_quality → high', 'export clip → asset ready'],
  ['CONTRACT REVIEW', 'Score · risk_level → low', 'review folder → evidence stored'],
  ['INBOUND LEAD', 'Score · lead_quality → high', 'book call → calendar ready'],
  ['IDEA ROUTER', 'Choice · next_worker → write', 'save note → memory updated'],
  ['SUPPORT TICKET', 'Score · urgency → critical', 'human gate → review requested'],
  ['MARKET SIGNAL', 'Score · signal_quality → review', 'human gate → no order sent'],
  ['AGENT ACTION', 'Noul · safe_to_run → yes', 'execute → progress saved'],
];
const current = computed(() => cases[snapshot.value.caseIndex % cases.length]!);
const accent = computed(() => ['#55edee', '#f6d95f', '#f14aac'][snapshot.value.caseIndex % 3]!);
const step = computed(() => Math.floor(snapshot.value.time * 7));
const format = (v: number) => Math.round(v).toLocaleString('en-US');
function noise(i: number, seed = 0) { const n = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return n - Math.floor(n); }
const streams = computed(() => ['CHOICE', 'SCORE', 'NOUL'].map((name, i) => ({ name, rate: Math.round(310 + noise(step.value, i + 2) * 190), color: ['#6bf4ef', '#f458b8', '#f2d961'][i], bars: Array.from({ length: 30 }, (_, j) => .12 + noise(step.value + j, i + 10) * .88) })));
function wave(seed: number, width = 180, height = 82) { return Array.from({ length: 72 }, (_, i) => { const t = i * .14 + snapshot.value.time * .8; return `${(i / 71 * width).toFixed(1)},${(height * (.48 + Math.sin(t * (1 + seed * .09) + seed) * .16 + Math.sin(t * 2.8 + seed * 2) * .1 + (noise(i, seed) - .5) * .04)).toFixed(1)}`; }).join(' '); }
const waveLines = computed(() => streams.value.map((stream, i) => ({ color: stream.color, points: wave(i) })));
const latencyWave = computed(() => wave(7, 90, 35));
const matrix = computed(() => Array.from({ length: 240 }, (_, i) => {
  const n = noise(i + Math.floor(snapshot.value.time * 3), 8);
  const column = i % 20;
  const row = Math.floor(i / 20);
  const cluster = column >= 4 && column <= 9 && row >= 2 && row <= 7;
  const lit = n > (cluster ? .46 : .64);
  return { color: cluster && n > .7 ? '#65e6f5' : n > .83 ? '#6354de' : '#3752d7', opacity: lit ? .55 + n * .4 : .025 };
}));
const logRows = computed(() => {
  const confidence = snapshot.value.confidence;
  const hold = confidence < .85;
  const question = current.value[1]!.split(' → ')[0]!;
  const action = current.value[2]!.split(' → ')[0]!;
  const rows = [
    { name: 'state', value: current.value[0]!.toLowerCase().replaceAll(' ', '_') },
    { name: 'ask', value: question },
    { name: 'jev', value: `p=${confidence.toFixed(2)} · ${2 + step.value % 3}ms` },
    { name: 'gate', value: `${confidence.toFixed(2)} ${hold ? '<' : '≥'} 0.85 · ${hold ? 'HOLD' : 'PASS'}` },
    { name: hold ? 'human' : 'code', value: hold ? 'review requested · no action' : action },
    { name: 'save', value: hold ? 'pending review saved' : 'progress after call' },
  ];
  const offset = Math.floor(snapshot.value.time * 3) % rows.length;
  return rows.slice(offset).concat(rows.slice(0, offset));
});
const source = [
  'import json',
  'from typestate_sdk import Choice, Score, Noul',
  'from typesafe_sdk import TypeSafeClient',
  '',
  'state = {"goal": goal, "evidence": notes}',
  'with TypeSafeClient(model="jev-1.13.0") as client:',
  '    result = client.system_one(',
  '        state=state,',
  '        questions={',
  '            "folder": Choice(options=folders),',
  '            "urgency": Score(labels=levels),',
  '            "safe_to_run": Noul(default=False),',
  '        },',
  '    )',
  '    if result.safe_to_run and result.p >= 0.85:',
  '        action = dispatch(result.folder)',
  '        save_progress(action)',
  '    else: human.review(result)',
];
const code = source.map((text, i) => ({ number: i + 1, tokens: text.split(/("[^"]*"|\b(?:import|from|with|as|if|and|else|False)\b)/g).filter(Boolean).map(value => ({ value, kind: value.startsWith('"') ? 'string' : /^(import|from|with|as|if|and|else|False)$/.test(value) ? 'keyword' : 'plain' })) }));
function pause() { controller?.setPaused(!snapshot.value.paused); }
function speed() { const speeds = [1, 1.5, 2]; controller?.setSpeed(speeds[(speeds.indexOf(snapshot.value.speed) + 1) % speeds.length]!); }
function onMotionChange(event: MediaQueryListEvent) { if (event.matches) controller?.setPaused(true); }
async function fullscreen() { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (root.value?.requestFullscreen) await root.value.requestFullscreen(); else notice.value = '当前浏览器不支持全屏'; } catch { notice.value = '全屏暂不可用，请使用浏览器全屏模式'; } }
onMounted(() => {
  if (!canvas.value) return;
  motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  controller = mountSignalLoom(canvas.value, { initialPaused: motion.matches, onUpdate: next => {
    // The scene runs every frame; dense terminal panels only need twelve updates per second.
    if (Math.abs(next.time - lastUpdate) >= 1 / 12 || next.paused !== snapshot.value.paused || next.speed !== snapshot.value.speed || next.time < lastUpdate) { snapshot.value = next; lastUpdate = next.time; }
  } });
  window.signalLoom = controller;
  motion.addEventListener('change', onMotionChange);
});
onBeforeUnmount(() => { motion?.removeEventListener('change', onMotionChange); controller?.dispose(); if (window.signalLoom === controller) delete window.signalLoom; });
</script>

<template>
  <main ref="root" class="signal-loom" :style="{ '--sl-accent': accent }">
    <header class="sl-masthead"><h1>JEV / SIGNAL LOOM</h1><b>SYSTEM ONE · jev-1.13.0</b><span>3 HEADS → ONE STATE → GATE → CODE</span><strong>kiosa · @thegreatest_sv</strong></header>
    <section class="sl-metrics" aria-label="模拟运行指标">
      <article><h2>DECISIONS · THIS RUN</h2><strong>{{ format(snapshot.decisions) }}</strong><div class="sl-ticks"><i v-for="i in 32" :key="i" :class="{ lit: i <= 2 + step % 30 }"></i></div><small>SIM · 60 bundles · 600 threads</small></article>
      <article><h2>MEDIAN LATENCY · REPORTED</h2><div class="sl-latency"><strong>~{{ snapshot.latency }}<em>ms</em></strong><svg viewBox="0 0 90 35" preserveAspectRatio="none" aria-hidden="true"><polyline :points="latencyWave"/></svg></div><div class="sl-meter"><i :style="{ width: '54%' }"></i></div><small>public demos · not SLAs</small></article>
      <article><h2>COST · 10 000 DECISIONS</h2><strong class="sl-cost">≈ $0.42</strong><div class="sl-cost-line"><span>jev</span><i></i><small>$0.042 / M in · out free</small></div><div class="sl-cost-line sl-llm"><span>LLM</span><i></i></div></article>
      <article><h2>CONFIDENCE · LIVE</h2><div class="sl-confidence"><strong>{{ snapshot.confidence.toFixed(2) }}</strong><b :class="{ hold: snapshot.confidence < .85 }">{{ snapshot.confidence >= .85 ? 'PASS' : 'HOLD' }}</b></div><div class="sl-meter sl-threshold"><i :style="{ width: `${snapshot.confidence * 100}%` }"></i><b></b></div><small>calibrate on yours <span>gate 0.85</span></small></article>
    </section>
    <section class="sl-case" aria-label="当前演示案例"><div><b class="sl-case-number">CASE {{ String(snapshot.caseIndex + 1).padStart(2, '0') }} / 12</b><h2>{{ current[0] }}</h2><nav aria-label="决策阶段"><span v-for="phase in phases" :key="phase" :class="{ active: snapshot.phase === phase }" :aria-current="snapshot.phase === phase ? 'step' : undefined">{{ phase }}</span></nav></div><p>{{ current[1] }} {{ snapshot.confidence.toFixed(2) }} <span>→ {{ current[2] }}</span></p></section>
    <section class="sl-scene" aria-label="三维信号织机"><canvas ref="canvas" tabindex="0" aria-label="三维二进制信号织机，拖动或方向键旋转，滚轮缩放"></canvas><div class="sl-corner sl-corner-tl"></div><div class="sl-corner sl-corner-tr"></div><div class="sl-corner sl-corner-bl"></div><div class="sl-corner sl-corner-br"></div><div class="sl-label sl-choice"><b>CHOICE</b><small>pick one label · 2 ms</small></div><div class="sl-label sl-score"><b>SCORE</b><small>ordered labels · 3 ms</small></div><div class="sl-label sl-noul"><b>NOUL</b><small>yes / no · 4 ms</small></div><div class="sl-label sl-packet"><b>PKT 0x{{ (25111100 + step).toString(16).toUpperCase() }}</b><small>noul · 9 bits · {{ snapshot.confidence.toFixed(2) }}</small></div><div class="sl-camera"><i></i> CAM {{ String(Math.floor(snapshot.time / 4.5) % 6 + 1).padStart(2, '0') }} · {{ snapshot.camera }}</div><span class="sl-scene-state">{{ snapshot.paused ? 'PAUSED' : 'SIMULATION' }} · {{ Math.round(snapshot.fps) }} FPS</span></section>
    <section class="sl-telemetry" aria-label="信号遥测">
      <article class="sl-panel sl-streams"><h2>STREAMS · IN <span>3 heads</span></h2><div v-for="stream in streams" :key="stream.name" class="sl-stream" :style="{ '--stream': stream.color }"><div><b>{{ stream.name }}</b><strong>{{ stream.rate }}/s</strong></div><div class="sl-stream-bars"><i v-for="(opacity, i) in stream.bars" :key="i" :style="{ opacity }"></i></div></div><small>Choice · Score · Noul in parallel</small></article>
      <article class="sl-panel sl-waves"><h2>CONFIDENCE STREAM <span>SIM</span></h2><svg viewBox="0 0 180 82" preserveAspectRatio="none" role="img" aria-label="Choice、Score、Noul 三路置信度波形"><path d="M0 15H180M0 41H180M0 67H180M0 0V82M45 0V82M90 0V82M135 0V82M180 0V82" class="sl-grid"/><path d="M0 23H180" class="sl-gate-line"/><polyline v-for="line in waveLines" :key="line.color" :points="line.points" :stroke="line.color"/><text x="161" y="20">0.85</text></svg><div class="sl-wave-legend"><span>Choice</span><span>Score</span><span>Noul</span><small>under → human</small></div></article>
      <article class="sl-panel sl-actions"><h2>ACTION MATRIX <span>code out</span></h2><div class="sl-matrix" aria-label="蓝色、青色、紫色动态动作矩阵"><i v-for="(cell, i) in matrix" :key="i" :style="{ background: cell.color, opacity: cell.opacity }"></i></div><small>answers → typed actions</small></article>
      <article class="sl-panel sl-source"><h2>chief.py <span>{{ 12 + step % 6 }} L/s</span></h2><div class="sl-code" aria-label="示例决策代码"><div v-for="line in code" :key="line.number" :class="{ active: line.number === 5 + step % 13 }"><code><span v-for="(token, i) in line.tokens" :key="i" :class="`sl-code-${token.kind}`">{{ token.value }}</span></code></div></div></article>
    </section>
    <section class="sl-bottom" aria-label="运行日志和安全阈值"><article class="sl-panel sl-runlog"><h2>RUN LOG <span>{{ 7 + step % 4 }} l/s</span></h2><div role="log" aria-live="off" aria-label="模拟决策日志"><p v-for="(line, i) in logRows" :key="i"><b>{{ line.name }}</b><span>{{ line.value }}</span></p></div></article><article class="sl-panel sl-split"><h2>THE SPLIT <span>who does what</span></h2><div v-for="(label, i) in ['LLM writes', 'Jev decides', 'code acts']" :key="label"><b>{{ label }}</b><i><em v-for="n in 26" :key="n" :class="{ lit: n < (i === 0 ? 1 : i === 1 ? 18 + step % 3 : 17 + step % 4) }"></em></i></div></article><article class="sl-panel sl-guards"><h2>GUARDRAILS <span>always on</span></h2><div><b>spend cap</b><i><em style="width: 12%"></em></i><small>$0.03 / 1.00</small></div><div><b>actions</b><i><em :style="{ width: `${60 + step % 15}%` }"></em></i><small>7 / 10</small></div><p><span>▣</span> never auto-post to X · progress saved</p></article></section>
    <footer class="sl-footer"><b>LLM WRITES · JEV DECIDES · CODE ACTS</b><span>metrics illustrative · demo data</span><nav aria-label="大屏控制"><RouterLink to="/" aria-label="返回大屏索引" title="返回大屏索引">←</RouterLink><button :aria-label="snapshot.paused ? '播放动画' : '暂停动画'" :aria-pressed="snapshot.paused" @click="pause">{{ snapshot.paused ? '▶' : 'Ⅱ' }}</button><button :aria-label="`播放速度 ${snapshot.speed} 倍，点击切换`" @click="speed">{{ snapshot.speed }}×</button><button aria-label="重播演示" @click="controller?.restart()">↺</button><button aria-label="重置视角" @click="controller?.resetView()">⌖</button><button aria-label="切换全屏" @click="fullscreen">⛶</button></nav></footer><p v-if="notice" class="sl-notice" role="status">{{ notice }}</p>
  </main>
</template>
