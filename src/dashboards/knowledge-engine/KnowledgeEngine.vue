<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { mountKnowledgeEngine } from './engine';
import { pages, patchOrder, initialKnowledgeSnapshot, type KnowledgeController, type KnowledgeSnapshot } from './model';
import KnowledgeOverlays from './KnowledgeOverlays.vue';
import './style.css';

declare global { interface Window { knowledgeEngine?: KnowledgeController } }
const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const overlays = ref<InstanceType<typeof KnowledgeOverlays>>();
const snapshot = ref<KnowledgeSnapshot>({ ...initialKnowledgeSnapshot });
const notice = ref('');
let controller: KnowledgeController | undefined;
let preference: MediaQueryList | undefined;
const noise = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const tick = computed(() => Math.floor(snapshot.value.time * 5));
const currentPage = computed(() => pages[snapshot.value.activePage] ?? pages[7]!);
const workPage = computed(() => pages[snapshot.value.workPage] ?? pages[7]!);
const workDocumentName = computed(() => snapshot.value.phase === 'ANSWER' ? 'answer-013.md' : workPage.value.name);
const documentName = computed(() => snapshot.value.phase === 'ANSWER' && !snapshot.value.inspecting ? 'answer-013.md' : currentPage.value.name);
const timecode = computed(() => { const t = snapshot.value.time % 24; return `00:${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor(t % 1 * 60)).padStart(2, '0')}`; });
const selectedConflict = computed(() => snapshot.value.conflicts > 0 && snapshot.value.activePage === 3);
const sourceId = computed(() => selectedConflict.value ? '017' : '042');
const logRows = computed(() => {
  const phase = snapshot.value.phase;
  const page = workPage.value.name;
  if (phase === 'READER') return [
    { role: 'YOU', text: 'source-042.pdf → /second-brain' },
    { role: 'READER', text: 'raw/source-042.pdf locked · 0 writes' },
    { role: 'READER', text: '18 pages / 684 tokens indexed' },
    { role: 'READER', text: '12 linked wiki pages → @Librarian' },
  ];
  if (phase === 'CHECKER') return [
    { role: 'CHECKER', text: `nightly scan · ${snapshot.value.scanned} / 128 pages` },
    { role: 'CHECKER', text: snapshot.value.conflicts ? 'routines.md: conflicting evidence' : `trace ${page} to raw source` },
    { role: 'SOURCE 042', text: 'review: daily at 02:00' },
    { role: 'SOURCE 017', text: snapshot.value.conflicts ? 'review: weekly on Monday' : 'checksum verified · immutable' },
    { role: 'CHECKER', text: snapshot.value.conflicts ? 'FLAG · human review required' : 'citation paths verified' },
  ];
  if (phase === 'ANSWER') return [
    { role: 'LIBRARIAN', text: '12/12 saved · index.md' },
    { role: 'LIBRARIAN', text: '12/12 updated · backlinks rebuilt' },
    { role: 'YOU', text: 'When should the review run?' },
    { role: 'LIBRARIAN', text: 'Daily at 02:00. [source-042:p05]' },
  ];
  return [
    { role: 'READER', text: 'source-042 · raw file remains locked' },
    { role: 'LIBRARIAN', text: `patch ${page} · +8 / −1` },
    { role: 'LIBRARIAN', text: `${snapshot.value.committed}/12 saved · atomic write` },
    { role: 'LIBRARIAN', text: 'citation preserved · backlinks rebuilt' },
  ];
});
const queueRows = computed(() => patchOrder.map((index, order) => ({ index, name: pages[index]!.name, done: order < snapshot.value.committed, active: index === snapshot.value.activePage, progress: order < snapshot.value.committed ? 100 : index === snapshot.value.workPage && snapshot.value.phase === 'LIBRARIAN' ? 15 + snapshot.value.time % .8 / .8 * 80 : 0 })));
const matrix = computed(() => Array.from({ length: 91 }, (_, i) => {
  const col = i % 13;
  const on = noise(i * 4 + Math.floor(snapshot.value.time * .8)) > .62;
  return { opacity: on ? .75 + noise(i) * .25 : .2 + noise(i + 13) * .18, color: col === 0 ? '#dac46d' : on && col <= snapshot.value.committed ? '#e7737d' : '#929a95' };
}));
const histogram = computed(() => Array.from({ length: 38 }, (_, i) => 4 + noise(i + tick.value) * 25 + (i < 16 ? Math.max(0, Math.sin((i + tick.value * .2) * .19)) * 42 : 0)));
const miniNodes = Array.from({ length: 14 }, (_, i) => ({ x: 12 + noise(i * 3) * 98, y: 7 + noise(i * 5 + 11) * 48 }));
const miniEdges = Array.from({ length: 25 }, (_, i) => [miniNodes[i % 14]!, miniNodes[(i * 5 + 3) % 14]!] as const);
const diffRows = computed(() => [
  { text: '@@ 018.6 +018.9 @@', kind: 'muted' },
  { text: '# source-backed knowledge', kind: 'muted' },
  { text: 'status: unverified', kind: 'remove' },
  { text: 'status: pending', kind: 'remove' },
  { text: snapshot.value.claim, kind: 'add' },
  { text: `source: raw/source-${sourceId.value}.pdf`, kind: 'add' },
  { text: 'confirmed: 2026-10-18', kind: 'add' },
  { text: 'backlinks: rebuilt / indexed', kind: 'add' },
]);
function selectPage(index: number) { controller?.selectPage(index); }
function togglePause() { controller?.setPaused(!snapshot.value.paused); }
function cycleSpeed() { const speeds = [1, 1.5, 2, .75]; controller?.setSpeed(speeds[(speeds.indexOf(snapshot.value.speed) + 1) % speeds.length]!); }
function handleMotion(event: MediaQueryListEvent) { if (event.matches) controller?.setPaused(true); }
async function fullscreen() {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else if (root.value?.requestFullscreen) await root.value.requestFullscreen(); else notice.value = '当前浏览器不支持全屏'; }
  catch { notice.value = '全屏暂不可用，请使用浏览器全屏模式'; }
}
onMounted(() => {
  if (!canvas.value) return;
  preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  controller = mountKnowledgeEngine(canvas.value, { initialPaused: preference.matches, onUpdate: value => { snapshot.value = value; }, onOverlay: value => overlays.value?.update(value) });
  window.knowledgeEngine = controller;
  preference.addEventListener('change', handleMotion);
});
onBeforeUnmount(() => {
  preference?.removeEventListener('change', handleMotion);
  controller?.dispose();
  if (window.knowledgeEngine === controller) delete window.knowledgeEngine;
});
</script>

<template>
  <main ref="root" class="knowledge-engine" :class="{ 'ke-checking': snapshot.phase === 'CHECKER' }">
    <header class="ke-masthead">
      <div class="ke-title"><div><h1>GROK BOT / KNOWLEDGE ENGINE</h1><p>SRC 042 / 128 DOCS / {{ snapshot.nodeCount }} NODES / {{ snapshot.linkCount }} LINKS</p></div><div class="ke-clock"><span>SIMULATION <i></i></span><b>{{ timecode }} &nbsp; {{ snapshot.paused ? 'PAUSED' : `${snapshot.fps}FPS` }}</b></div></div>
      <div class="ke-pipeline"><div class="ke-reader"><b>● READER</b><span>RAW / LOCKED</span><i><em style="width:100%"></em></i></div><div class="ke-librarian"><b>● LIBRARIAN</b><span>{{ String(snapshot.committed).padStart(2, '0') }}/12 COMMITTED</span><i><em :style="{width:`${snapshot.committed / 12 * 100}%`}"></em></i></div><div class="ke-checker"><b>● CHECKER</b><span>{{ snapshot.phase === 'CHECKER' ? `${snapshot.scanned}/128 SCANNED` : 'QUEUED 02:00' }}</span><i><em :style="{width:`${snapshot.scanned / 128 * 100}%`}"></em></i></div><p>{{ snapshot.command }}</p></div>
    </header>
    <section class="ke-scene" aria-label="三维知识图谱">
      <canvas ref="canvas" tabindex="0" aria-label="立体知识图谱。拖动或方向键旋转，滚轮缩放，选择文档查看信息。"></canvas>
      <div class="ke-scene-caption"><span>GRAPH / {{ snapshot.nodeCount.toLocaleString('en-US') }} RECORDS · {{ snapshot.linkCount.toLocaleString('en-US') }} LINKS</span><span>AZ {{ snapshot.azimuth.toFixed(1) }}° &nbsp; Z {{ Math.round(snapshot.zoom * 100) }}</span></div>
      <KnowledgeOverlays ref="overlays" :snapshot="snapshot" @select="selectPage" @reset="controller?.resetView()"/>
      <div class="ke-wordmark" aria-hidden="true">ARGONA</div>
      <div class="ke-scene-log">— {{ (snapshot.time % 24).toFixed(2) }} &nbsp; {{ snapshot.phase.toLowerCase() }} :: {{ workDocumentName }} · {{ snapshot.stageLabel.toLowerCase() }} <span>{{ snapshot.phase === 'LIBRARIAN' ? '+8 / −1' : snapshot.conflicts ? 'evidence conflict' : 'source verified' }}</span></div>
    </section>
    <div class="ke-command"><strong>{{ snapshot.command }}</strong><span>{{ snapshot.stageLabel }}</span><nav class="ke-controls" aria-label="大屏控制"><RouterLink to="/" aria-label="返回大屏索引" title="返回大屏索引">←</RouterLink><button :aria-label="snapshot.paused ? '播放动画' : '暂停动画'" :aria-pressed="snapshot.paused" @click="togglePause">{{ snapshot.paused ? '▶' : 'Ⅱ' }}</button><button :aria-label="`播放速度 ${snapshot.speed} 倍，点击切换`" @click="cycleSpeed">{{ snapshot.speed }}×</button><button aria-label="重播演示" title="重播演示" @click="controller?.restart()">↺</button><button aria-label="重置视角" title="重置视角" @click="controller?.resetView()">⌖</button><button aria-label="切换全屏" title="切换全屏" @click="fullscreen">⛶</button></nav></div>
    <section class="ke-panels" aria-label="知识引擎监测终端">
      <article class="ke-panel ke-chat"><h2>01 SHARED CHAT <span>3 BOT</span></h2><div class="ke-chat-lines"><div v-for="(row, i) in logRows" :key="i"><small>{{ String(Math.floor(snapshot.time) + i).padStart(2, '0') }}</small><p><b :class="row.role.toLowerCase().replace(' ', '-')">{{ row.role }}</b><span>{{ row.text }}</span></p></div></div><footer>{{ workDocumentName }} · {{ snapshot.conflicts ? 'flagged for review' : 'patch +8 / −1' }}</footer></article>
      <article class="ke-panel ke-queue"><h2>02 WRITE QUEUE <span>12 DOC</span></h2><div><button v-for="(row, i) in queueRows" :key="row.name" :class="{ selected: row.active }" :aria-pressed="row.active" :aria-label="`检查 ${row.name}`" @click="selectPage(row.index)"><small>{{ String(i + 1).padStart(2, '0') }}</small><span>wiki/{{ row.name }}</span><i><em :style="{width:`${row.progress}%`}" :class="{done:row.done}"></em></i><small>{{ row.done ? 'OK' : row.active ? '··' : '·' }}</small></button></div><footer><b>{{ String(snapshot.committed).padStart(2, '0') }}/12 ATOMIC WRITES</b><span>NO RAW EDITS</span></footer></article>
      <article class="ke-panel ke-inspector"><h2>03 PAGE INSPECTOR <span>TRACE</span></h2><h3>wiki/{{ documentName }}</h3><small>CLAIM</small><p>{{ snapshot.claim }}</p><small>SOURCE / TRACE 025 · SCAN 000</small><p class="ke-inspector-source">raw/source-{{ sourceId }}.pdf</p><small>LAST CONFIRMED</small><p>2026-10-18</p></article>
      <article class="ke-panel ke-index"><h2>04 GRAPH INDEX <span>LIVE</span></h2><div><svg viewBox="0 0 126 64" aria-label="文档关联缩略图"><line v-for="(edge,i) in miniEdges" :key="`e${i}`" :x1="edge[0].x" :y1="edge[0].y" :x2="edge[1].x" :y2="edge[1].y"/><g v-for="(node,i) in miniNodes" :key="i"><circle :cx="node.x" :cy="node.y" :r="i === snapshot.activePage ? 1.8 : 1" :class="{selected:i === snapshot.activePage}"/><text :x="node.x+3" :y="node.y+1">{{ String(i).padStart(2,'0') }}</text></g></svg><dl><dt>PAGES</dt><dd>128</dd><dt>LINKS</dt><dd>{{ snapshot.linkCount }}</dd></dl></div><footer><b>SELECT {{ String(snapshot.activePage + 1).padStart(2, '0') }} / 12</b><span>wiki/{{ currentPage.name }}</span></footer></article>
      <article class="ke-panel ke-raw"><h2>05 RAW / IMMUTABLE <span>LOCK</span></h2><div class="ke-raw-content"><small>DON'T TOUCH</small><b>source-042.pdf <em>RO</em></b><span>SHA256 7b41e2c9…e9c2</span><b>extract-042.txt <em>RO</em></b><span>SHA256 3e8457bc…2985</span><b>source-042.meta <em>RO</em></b><span>SHA256 0e6bd73c…3a2e</span></div><div class="ke-mutations"><b>0 MUTATIONS</b><span>VERIFY {{ String(11 + tick % 47).padStart(3, '0') }}</span></div><footer>APPEND ONLY / ORIGINAL PRESERVED</footer></article>
      <article class="ke-panel ke-diff"><h2>06 DOCUMENT DIFF <span>{{ snapshot.committed === 12 ? 'COMMITTED' : 'PATCH' }}</span></h2><h3>wiki/{{ documentName }}</h3><div v-for="(row,i) in diffRows" :key="i" class="ke-diff-row" :class="row.kind"><small>{{ 18 + i }}</small><span>{{ row.kind === 'add' ? '+' : row.kind === 'remove' ? '−' : ' ' }} {{ row.text }}</span></div><footer>{{ snapshot.committed === 12 ? '+4 / −1 · COMMITTED' : '+8 / −0 · WAITING' }}</footer></article>
      <article class="ke-panel ke-citations"><h2>07 CITATION MATRIX <span>12×7</span></h2><div class="ke-matrix-header"><span>DOC</span><span v-for="i in 13" :key="i">{{ String(i-1).padStart(2,'0') }}</span></div><div class="ke-matrix-body"><div class="ke-matrix-labels"><span v-for="i in 7" :key="i">p.{{ String(i+1).padStart(2,'0') }}</span></div><div class="ke-matrix"><i v-for="(cell,i) in matrix" :key="i" :style="{background:cell.color,opacity:cell.opacity}"></i></div></div><footer><b>12 PAGES + 1 RAW SOURCE</b><span>{{ snapshot.conflicts ? '2 CITED · 1 CONFLICT' : '1 CITED · 0 NO CLAIM' }}</span></footer></article>
      <article class="ke-panel ke-check"><h2>08 NIGHTLY CHECKER <span>{{ snapshot.phase === 'CHECKER' ? 'SCAN' : 'WAIT' }}</span></h2><small>NIGHTLY / 02:00</small><h3>SCANNED {{ String(snapshot.scanned).padStart(3,'0') }} / 128</h3><div class="ke-histogram"><i v-for="(bar,i) in histogram" :key="i" :style="{height:`${bar}%`}" :class="{ colored:snapshot.phase !== 'READER', yellow:snapshot.phase==='CHECKER' }"></i></div><div class="ke-histogram-legend"><span>READ</span><span>WRITE</span><span>CHECK</span></div><footer><span>{{ snapshot.conflicts ? 'REVIEW / CONFLICTING CLAIMS' : 'WAIT / SOURCE COMMITTED' }}</span><b>{{ String(snapshot.scanned).padStart(3,'0') }} CHECKS · {{ String(snapshot.conflicts).padStart(2,'0') }} FLAGS</b></footer></article>
    </section>
    <p v-if="notice" class="ke-notice" role="status">{{ notice }}</p>
  </main>
</template>
