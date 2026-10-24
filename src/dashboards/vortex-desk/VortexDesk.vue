<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { mountVortexDesk } from './engine';
import { initialVortexSnapshot, operators, type VortexController, type VortexSnapshot } from './model';
import './style.css';

declare global { interface Window { vortexDesk?: VortexController } }
const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const jsonTrack = ref<HTMLElement>();
const logTrack = ref<HTMLElement>();
const jsonStep = ref(0);
const logStep = ref(0);
const snapshot = ref<VortexSnapshot>({ ...initialVortexSnapshot });
const notice = ref('');
let controller: VortexController | undefined;
let motionPreference: MediaQueryList | undefined;
const format = (value: number, digits = 0) => value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
function noise(i: number, seed = 0) { const value = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453; return value - Math.floor(value); }
const tick = computed(() => Math.floor(snapshot.value.time * 3));
const activeOperator = computed(() => Math.floor(snapshot.value.time * .7) % operators.length);
const operatorRows = computed(() => operators.map((name, index) => ({ name, value: index === 5 ? .77 : .94 + noise(index + tick.value, 1) * .05, status: ['RUN', 'ACTIVE', 'CHECK', 'READY', 'SYNC', 'IDLE'][index], active: index === activeOperator.value })));
const matrix = computed(() => Array.from({ length: 48 }, (_, i) => ({ opacity: .22 + noise(i + Math.floor(snapshot.value.time * 2), 3) * .78, color: `hsl(${(snapshot.value.hue + i * 37 + noise(i, 6) * 90) % 360} 88% ${40 + noise(i, 8) * 48}%)` })));
const positions = computed(() => ['BTC', 'HYPE', 'ETH', 'SOL'].map((asset, i) => ({ asset, side: ['LONG', 'LONG', 'SHORT', 'FLAT'][i], size: [.34, .21, .12, 0][i], pnl: i === 3 ? 0 : Math.round([346, 100, -21][i]! + Math.sin(snapshot.value.time * .35 + i) * 7) })));
function sparkline(seed: number, width = 180, height = 40) { return Array.from({ length: 60 }, (_, i) => `${(i / 59 * width).toFixed(1)},${(height * .5 + Math.sin((i + Math.floor(snapshot.value.time * 3)) * .49 + seed) * height * .22 + (noise(i + Math.floor(snapshot.value.time * 3), seed) - .5) * height * .35).toFixed(1)}`).join(' '); }
const ratePoints = computed(() => sparkline(7));
const tickers = computed(() => ['BTC', 'ETH', 'SOL'].map((name, i) => ({ name, value: format([84051, 2715, 119.4][i]! + Math.sin(snapshot.value.time * .3 + i) * [18, 2, .2][i]!, i === 2 ? 1 : 0), change: ['+0.6%', '+0.3%', '+0.5%'][i], points: sparkline(i, 64, 24) })));
const jsonRows = computed(() => Array.from({ length: 48 }, (_, i) => {
  const id = jsonStep.value + i;
  const event = 4470 + Math.floor(id / 10);
  const rows = ['{', `  "ctx": ${event},`, `  "sym": "${['BTC', 'HYPE', 'ETH', 'SOL'][event % 4]}-PERP",`, `  "side": "${event % 3 ? 'LONG' : 'SHORT'}",`, `  "conf": ${(noise(event, 7) * .16 + .82).toFixed(2)},`, '  "gate": "pass",', `  "ms": ${230 + event % 39},`, `  "hue": ${event * 47 % 360}`, '}', ''];
  return { id, text: rows[id % 10], kind: id % 10 === 0 || id % 10 === 8 ? 'bracket' : id % 10 === 5 ? 'pass' : 'data' };
}));
const logRows = computed(() => Array.from({ length: 24 }, (_, i) => {
  const id = logStep.value + i;
  const agent = ['watcher', 'analyst', 'risk', 'gate', 'executor', 'reporter'][id % 6]!;
  const symbol = ['BTC', 'HYPE', 'ETH', 'SOL'][Math.floor(id / 6) % 4];
  const message = [`${symbol} ${(84 + noise(id, 1) * 5).toFixed(2)}  +3.5σ`, `ctx ${4470 + id} p=${(.85 + noise(id, 2) * .1).toFixed(2)}`, `size LONG conf=${(.9 + noise(id, 3) * .08).toFixed(2)}`, '0.95 ≥ 0.85 · PASS', `BUY 0.21 ${symbol}-PERP`, 'fill settled · simulated'][id % 6];
  return { id, time: `${String(42 + Math.floor(id / 60) % 18).padStart(2, '0')}:${String(id % 60).padStart(2, '0')}.${String(id * 37 % 1000).padStart(3, '0')}`, agent, message };
}));
const source = [
  '# VORTEX / multi-agent execution loop',
  'from desk import agents, risk, ledger',
  '',
  'async def spin(tick):',
  '    ctx = await watcher.observe(tick)',
  '    sig = await analyst.score(ctx)',
  '    if sig.confidence < 0.60:',
  '        return ctx.drop("low_signal")',
  '',
  '    side = desk.choose(SIDES, sig)',
  '    size = desk.propose("size", sig)',
  '    gate = await risk.check(side, size)',
  '    if gate.pass_all and sig.p > 0.85:',
  '        fill = await desk.execute(side)',
  '        await ledger.write(ctx, fill)',
  '    else:',
  '        await desk.human_handoff(sig)',
  '',
  '    await reporter.sync(ledger)',
  '    return {"ok": True, "ctx": ctx.id}',
  '',
  'await desk.run(mode="simulation")',
];
const codeLines = source.map((text, i) => ({ number: i + 1, tokens: text.split(/("[^"]*"|#[^\n]*|\b(?:async|await|def|from|import|if|else|return|and|True)\b|\b\d+(?:\.\d+)?\b)/g).filter(Boolean).map(value => ({ value, kind: value.startsWith('#') ? 'comment' : value.startsWith('"') ? 'string' : /^(async|await|def|from|import|if|else|return|and|True)$/.test(value) ? 'keyword' : /^\d/.test(value) ? 'number' : 'plain' })) }));
const codeStep = computed(() => 4 + Math.floor(snapshot.value.time * 7) % 16);
function animateStreams(time: number) {
  const jsonOffset = time * 24;
  const logOffset = time * 8;
  jsonStep.value = Math.floor(jsonOffset);
  logStep.value = Math.floor(logOffset);
  if (jsonTrack.value) jsonTrack.value.style.transform = `translate3d(0,-${jsonOffset % 1 * 12}px,0)`;
  if (logTrack.value) logTrack.value.style.transform = `translate3d(0,-${logOffset % 1 * 12}px,0)`;
}
function togglePause() { controller?.setPaused(!snapshot.value.paused); }
function cycleSpeed() { const speeds = [1, 1.5, 2, .75]; controller?.setSpeed(speeds[(speeds.indexOf(snapshot.value.speed) + 1) % speeds.length]!); }
function handleMotionChange(event: MediaQueryListEvent) { if (event.matches) controller?.setPaused(true); }
async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else if (root.value?.requestFullscreen) await root.value.requestFullscreen(); else notice.value = '当前浏览器不支持全屏'; }
  catch { notice.value = '全屏暂不可用，请使用浏览器全屏模式'; }
}
onMounted(() => {
  if (!canvas.value) return;
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  controller = mountVortexDesk(canvas.value, { initialPaused: motionPreference.matches, onUpdate: state => { snapshot.value = state; }, onFrame: animateStreams });
  window.vortexDesk = controller;
  motionPreference.addEventListener('change', handleMotionChange);
});
onBeforeUnmount(() => {
  motionPreference?.removeEventListener('change', handleMotionChange);
  controller?.dispose();
  if (window.vortexDesk === controller) delete window.vortexDesk;
});
</script>

<template>
  <main ref="root" class="vortex-desk" :style="{ '--vd-hue': snapshot.hue, '--vd-accent': `hsl(${snapshot.hue + 220} 100% 61%)` }">
    <section class="vd-stage" aria-label="三维粒子涡旋交易大屏">
      <canvas ref="canvas" class="vd-canvas" tabindex="0" aria-label="三维粒子涡旋。拖动或方向键旋转，滚轮缩放。"></canvas>
      <div class="vd-signature">VORTEX / AGENT SYSTEM <span>● {{ snapshot.paused ? 'PAUSED' : 'LIVE SIMULATION' }}</span></div>
      <div class="vd-wordmark"><b aria-hidden="true">V</b><h1>VORTEX<br><span>TRADING</span><br>DESK</h1></div>
      <article class="vd-panel vd-operators"><h2>OPERATORS <span>{{ snapshot.phase }}</span></h2><div class="vd-operator-list"><div v-for="operator in operatorRows" :key="operator.name" class="vd-operator"><div><b>{{ operator.name }}</b><span>{{ operator.value.toFixed(2) }}</span><i><em :style="{ width: `${operator.value * 100}%` }"></em></i></div><strong :class="{ active: operator.active }">{{ operator.status }}</strong></div></div><h2>EVIDENCE MATRIX</h2><div class="vd-matrix" aria-label="六个智能体的八时段证据矩阵"><i v-for="(cell, i) in matrix" :key="i" :style="{ background: cell.color, opacity: cell.opacity }"></i></div><small class="vd-matrix-caption">AGENT × TIME</small></article>
      <article class="vd-panel vd-json"><h2 class="vd-color-heading">◆ SIGNAL_STREAM.JSON <span>35/s</span></h2><div class="vd-json-window" role="log" aria-label="向上滚动的模拟信号 JSON" aria-live="off"><div ref="jsonTrack" class="vd-json-track"><div v-for="row in jsonRows" :key="row.id" class="vd-json-line" :class="`vd-json-${row.kind}`">{{ row.text || ' ' }}</div></div></div></article>
      <article class="vd-panel vd-positions"><h2>POSITIONS <span>SIM</span></h2><table aria-label="模拟持仓"><tbody><tr v-for="position in positions" :key="position.asset"><th>{{ position.asset }}-PERP</th><td :class="position.side === 'LONG' ? 'vd-positive' : position.side === 'SHORT' ? 'vd-short' : 'vd-muted'">{{ position.side }}</td><td>{{ position.size ? position.size.toFixed(2) : '—' }}</td><td :class="position.pnl >= 0 ? 'vd-positive' : 'vd-short'">{{ position.pnl > 0 ? '+' : position.pnl < 0 ? '−' : '' }}${{ Math.abs(position.pnl) }}</td></tr></tbody></table><div class="vd-net"><span>NET</span><b class="vd-positive">+${{ format(snapshot.net) }}</b><div class="vd-mini-bars"><i v-for="i in 27" :key="i" :style="{ height: `${20 + noise(i + tick, 2) * 80}%`, opacity: .3 + i / 40 }"></i></div></div></article>
      <article class="vd-panel vd-rate"><h2>DECISIONS / SEC <strong>{{ snapshot.decisions }}</strong></h2><svg viewBox="0 0 180 40" preserveAspectRatio="none" role="img" aria-label="实时模拟决策速率"><path d="M0 35H180" stroke="#3a3940" stroke-dasharray="2 4"/><polyline :points="ratePoints" fill="none" stroke="#b8bed9" stroke-width="1.2"/></svg><div class="vd-rate-stats"><div><small>MEDIAN</small><b>{{ snapshot.latency }} ms</b></div><div><small>COST</small><b>$0.042/1M</b></div><div><small>10K DEC</small><b>≈ $0.42</b></div></div></article>
      <div class="vd-callout vd-risk"><svg viewBox="0 0 100 70" aria-hidden="true"><path d="M99 69L20 15H0"/><circle cx="20" cy="15" r="5"/></svg><div class="vd-callout-box"><strong>{{ snapshot.riskHold ? 'RISK HOLD' : 'RISK OK' }} <span>| conf {{ snapshot.confidence.toFixed(2) }}</span></strong><small>{{ snapshot.riskHold ? 'AWAITING CONFIRMATION' : 'ALL CHECKS PASS' }}</small><div class="vd-mini-bars"><i v-for="i in 14" :key="i" :style="{ height: `${15 + noise(i + tick, 4) * 85}%` }"></i></div></div></div>
      <div class="vd-callout vd-execution"><svg viewBox="0 0 100 55" aria-hidden="true"><path d="M0 20H60L95 47"/><circle cx="95" cy="47" r="5"/></svg><div class="vd-callout-box"><strong>EXECUTION <span>{{ snapshot.riskHold ? 'HOLD' : 'LIVE' }}</span></strong><small>{{ snapshot.riskHold ? 'AWAITING HUMAN' : 'SIMULATED FILL' }}</small><div class="vd-mini-bars"><i v-for="i in 18" :key="i" :style="{ height: `${20 + noise(i + tick, 6) * 80}%` }"></i></div></div></div>
      <div class="vd-badge vd-badge-cost">▪ 10k ≈ $0.42</div><div class="vd-badge vd-badge-dd">▪ dd {{ (.6 + Math.sin(snapshot.time * .4) * .08).toFixed(1) }}%</div><div class="vd-badge vd-badge-p">▪ p={{ Math.round(snapshot.confidence * 100) }}</div><div class="vd-badge vd-badge-ctx">▪ ctx #{{ snapshot.events }}</div>
      <article class="vd-panel vd-code"><h2 class="vd-color-heading">▪ VORTEX_ENGINE.PY <span>52 L/S</span></h2><div class="vd-source" aria-label="模拟交易引擎 Python 代码"><div v-for="line in codeLines" :key="line.number" class="vd-code-line" :class="{ 'vd-code-active': codeStep === line.number }"><small>{{ String(line.number).padStart(2, '0') }}</small><code><span v-for="(token, i) in line.tokens" :key="i" :class="`vd-token-${token.kind}`">{{ token.value }}</span></code><i :style="{ background: `hsl(${snapshot.hue + line.number * 18} 90% 70%)`, width: `${6 + noise(line.number, 2) * 8}px` }"></i></div></div><div class="vd-log-title">LIVE LOG <span>{{ 90 + tick % 9 }} ev/s</span></div><div class="vd-log-window" role="log" aria-label="向上滚动的模拟成交日志" aria-live="off"><div ref="logTrack" class="vd-log-track"><div v-for="row in logRows" :key="row.id" class="vd-log-line"><time>{{ row.time }}</time><b>{{ row.agent }}</b><span>{{ row.message }}</span></div></div></div></article>
      <div class="vd-ground-label">INFERENCE FIELD · {{ format(snapshot.events) }} EVENTS · {{ Math.round(snapshot.fps) }} FPS</div>
    </section>
    <footer class="vd-footer">
      <section class="vd-handoffs" aria-label="智能体交接状态"><h2>HANDOFFS / 24H</h2><div class="vd-handoff-grid"><div v-for="(operator, i) in operators" :key="operator"><span>{{ operator === 'EXECUTOR' ? 'EXEC' : operator === 'REPORTER' ? 'REPORT' : operator }} <b>{{ 83 - i * 4 + tick % 3 }}</b></span><i><em :style="{ width: `${83 - i * 4 + tick % 3}%` }"></em></i></div></div></section>
      <section class="vd-tickers" aria-label="模拟市场行情"><article v-for="ticker in tickers" :key="ticker.name"><div><b>{{ ticker.name }}</b><strong>{{ ticker.value }}</strong></div><span class="vd-positive">{{ ticker.change }}</span><svg viewBox="0 0 64 24" aria-hidden="true"><polyline :points="ticker.points" stroke="#b5c4d6" stroke-width="1" fill="none"/></svg></article></section>
      <div class="vd-footer-status"><span>SIMULATED</span><small>演示数据 · NO LIVE ORDERS</small></div>
      <nav class="vd-controls" aria-label="大屏控制"><RouterLink to="/" aria-label="返回大屏索引" title="返回大屏索引">←</RouterLink><button :aria-label="snapshot.paused ? '播放动画' : '暂停动画'" :aria-pressed="snapshot.paused" @click="togglePause">{{ snapshot.paused ? '▶' : 'Ⅱ' }}</button><button :aria-label="`播放速度 ${snapshot.speed} 倍，点击切换`" @click="cycleSpeed">{{ snapshot.speed }}×</button><button aria-label="重播演示" title="重播演示" @click="controller?.restart()">↺</button><button aria-label="重置视角" title="重置视角" @click="controller?.resetView()">⌖</button><button aria-label="切换全屏" title="切换全屏" @click="fullscreen">⛶</button></nav>
      <p v-if="notice" class="vd-notice" role="status">{{ notice }}</p>
    </footer>
  </main>
</template>
